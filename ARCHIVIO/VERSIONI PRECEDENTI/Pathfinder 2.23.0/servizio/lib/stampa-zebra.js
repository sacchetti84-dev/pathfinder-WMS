'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   PATHFINDER — LA STAMPA SU ZEBRA IN RETE — 2.19
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Qui si apre il socket. Lo ZPL lo scrive `zpl.js`, che non sa cosa sia una
   rete: la separazione serve a poter collaudare l'etichetta senza avere una
   stampante sotto, e a poter collaudare la rete senza guardare l'etichetta.

   PERCHE' DAL SERVIZIO E NON DAL BROWSER. Un browser non apre un socket TCP,
   e non lo aprira' mai: non c'e' un'API che lo permetta, nemmeno in rete
   locale. Le alternative erano un programma installato su ogni macchina
   (Zebra Browser Print) o un driver per stampante, e tutte e due lasciano
   scoperto l'MC9400, che e' Android e dove l'applicativo e' una pagina. Il
   servizio invece c'e' gia', e' gia' l'arbitro di §8, e serve la scrivania e
   il terminale con lo stesso codice.

   ── L'INDIRIZZO NON ARRIVA MAI DALLA RICHIESTA ────────────────────────────

   Il client manda un `printer_id`, e basta. L'host e la porta si leggono da
   `meta.printers`, che scrive un Admin. Se l'host viaggiasse nel corpo della
   richiesta, questa rotta diventerebbe il modo di scrivere byte arbitrari su
   qualunque `host:porta` raggiungibile dal server — con la credenziale di un
   operatore qualsiasi e senza lasciare traccia da nessuna parte.

   Non basta: siccome `meta` la scrive chiunque abbia una sessione (il
   guardiano dei ruoli difende `operators`, non `meta`), un record di
   stampante e' un dato di cui NON ci si fida comunque. Due cancelli, e sono
   qui sotto:

   1. LA PORTA STA IN UN ELENCO CHIUSO. Solo le porte RAW delle Zebra. Senza
      questo, una «stampante» a `127.0.0.1:5432` fa parlare il servizio col
      proprio PostgreSQL.
   2. L'INDIRIZZO DEVE ESSERE PRIVATO. Si risolve il nome PRIMA di
      connettersi e si guarda dove punta: un host che risolve su un indirizzo
      pubblico e' rifiutato. Senza, il servizio diventa un ponte verso
      l'esterno — e §8 dice che verso l'esterno non parte niente.

   ── LA 9100 NON RISPONDE NIENTE ───────────────────────────────────────────

   E' il punto piu' pericoloso di tutto il file. Il protocollo RAW accetta i
   byte e chiude: carta finita, testina aperta, nastro esaurito passano tutti
   come successo. Un invio riuscito NON e' un'etichetta stampata, e chiamarlo
   cosi' vorrebbe dire che al primo rotolo finito il magazzino continua a
   creare pallet che nessuno puo' scansionare — §8 dice esattamente questo di
   un UDC senza etichetta.

   Quindi: `inviaZpl` dichiara di aver INVIATO, `statoStampante` chiede alla
   macchina come sta con `~HQES`, e chi stampa fa le due cose in fila. Il
   messaggio che arriva a chi lavora dice quale delle due e' vera.

   NIENTE LIBRERIE. `net` e `dns` sono moduli di Node. Una dipendenza in piu'
   sul servizio e' una cosa da aggiornare, collaudare e spiegare all'IT — la
   stessa ragione per cui `registro-servizio.js` scrive con `appendFileSync`.

   Collaudato in `server/test/collaudo-stampa.js`, che alza un finto
   ascoltatore sulla 9100 e legge i byte che gli arrivano.
   ═══════════════════════════════════════════════════════════════════════ */

const net = require('net');
const dns = require('dns').promises;
const zpl = require('./zpl');

/* Le porte RAW delle Zebra, e nient'altro. 9100 e' quella di serie su ogni
   modello con scheda di rete; 9101 e 9102 le espongono i modelli a piu'
   canali; 6101 e' quella dei server di stampa esterni piu' vecchi, che in
   magazzino esistono ancora. Chi ne volesse una fuori da qui deve cambiare
   questo elenco e spiegare perche' — che e' esattamente il punto. */
const PORTE_AMMESSE = new Set([6101, 9100, 9101, 9102, 9103]);

/* Il tempo che si concede a una stampante per rispondere al TCP. Serve
   perche' senza, una stampante spenta blocca la richiesta per una ventina
   di secondi — il tempo che Windows impiega a rinunciare da solo — e in
   corsia venti secondi davanti a una maschera ferma sono un guasto. */
const ATTESA_MS = 3000;

/* Il tempo che si aspetta la RISPOSTA a `~HQES`. Piu' corto: se la
   connessione si e' aperta, la macchina c'e'; una che accetta il socket e
   non parla e' quasi sempre un server di stampa che non conosce il comando,
   e la stampa non deve fermarsi per quello. */
const ATTESA_STATO_MS = 1500;

/* Il tetto alle copie. Non e' un limite tecnico: e' un dito che scivola.
   «1» diventa «100» con uno zero di troppo, e cento etichette termiche sono
   un rotolo e cinque minuti di stampante occupata. */
const COPIE_MAX = 50;

/* ── DOVE PUNTA UN NOME ───────────────────────────────────────────────────

   Gli indirizzi che una stampante di magazzino puo' avere. Il loopback c'e'
   perche' ci gira il banco di prova, e non apre niente: la porta deve
   comunque stare nell'elenco, e sulla 9100 di questa macchina non risponde
   nessun servizio di Pathfinder. */
function ePrivato(ip) {
  const p = String(ip).split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16
  if (a === 169 && b === 254) return true;          // 169.254.0.0/16 — APIPA
  if (a === 127) return true;                       // loopback — il banco
  return false;
}

/** L'indirizzo IPv4 a cui l'host si risolve, o un errore che dice perche'
    non si puo' usare. Si risolve PRIMA di connettersi: e' il solo momento in
    cui il controllo vale qualcosa. */
async function risolvi(host) {
  const h = String(host ?? '').trim();
  if (!h) throw erroreCfg('la stampante non ha un indirizzo');

  let ip;
  if (net.isIPv4(h)) {
    ip = h;
  } else if (net.isIPv6(h)) {
    throw erroreCfg(`${h} è un indirizzo IPv6: le stampanti si configurano in IPv4`);
  } else {
    try {
      /* `family: 4` e non il predefinito: su una risposta IPv6 il controllo
         di privatezza qui sotto non saprebbe cosa dire, e un controllo che
         non sa cosa dire lascia passare. */
      ({ address: ip } = await dns.lookup(h, { family: 4 }));
    } catch {
      throw erroreCfg(`il nome «${h}» non si risolve: si controlla il DNS, o si scrive l’indirizzo IP`);
    }
  }
  if (!ePrivato(ip)) {
    throw erroreCfg(
      `${h} risolve su ${ip}, che è un indirizzo pubblico. Una stampante sta sulla rete `
      + 'interna: il servizio non apre connessioni verso l’esterno.');
  }
  return ip;
}

/* Un errore di configurazione e' colpa di chi ha compilato la scheda, non
   della stampante: 422 e non 502, e il messaggio dice dove si rimedia. */
function erroreCfg(msg) {
  return Object.assign(new Error(msg), { status: 422 });
}
function erroreRete(msg) {
  return Object.assign(new Error(msg), { status: 502 });
}

/* ── LA STAMPANTE COM'E' SCRITTA NEI DATI ────────────────────────────────── */

const DPI_AMMESSI = new Set([203, 300, 600]);

/**
 * Legge e convalida un record di stampante. Restituisce l'oggetto ripulito,
 * oppure alza con un messaggio che nomina il campo storto: chi lo legge sta
 * in corsia e deve sapere cosa aprire in Configurazione.
 */
function leggiStampante(rec) {
  if (!rec || typeof rec !== 'object') throw erroreCfg('stampante non configurata');
  const nome = String(rec.nome ?? rec.printer_id ?? '').trim();

  const porta = Number(rec.porta);
  if (!PORTE_AMMESSE.has(porta)) {
    throw erroreCfg(
      `${nome || 'la stampante'}: la porta ${rec.porta} non è una porta di stampa Zebra. `
      + `Ammesse: ${[...PORTE_AMMESSE].join(', ')}.`);
  }

  const dpi = Number(rec.dpi);
  if (!DPI_AMMESSI.has(dpi)) {
    throw erroreCfg(
      `${nome || 'la stampante'}: ${rec.dpi} dpi non è una risoluzione di testina Zebra. `
      + `Ammesse: ${[...DPI_AMMESSI].join(', ')}.`);
  }

  const misura = (v, come) => {
    if (!Number.isFinite(v) || v < 10 || v > 300) {
      throw erroreCfg(
        `${nome || 'la stampante'}: ${come} del supporto «${v}» fuori misura. `
        + 'Un’etichetta sta fra 10 e 300 mm.');
    }
    return v;
  };
  const larghezza = misura(Number(rec.larghezza_mm), 'larghezza');
  const altezza = misura(Number(rec.altezza_mm), 'altezza');

  return {
    printer_id: String(rec.printer_id ?? '').trim(),
    nome, host: String(rec.host ?? '').trim(), porta, dpi,
    larghezza_mm: larghezza, altezza_mm: altezza,
    site_id: String(rec.site_id ?? '').trim(),
    attiva: rec.attiva !== false,
  };
}

/* ── UNA STAMPANTE ALLA VOLTA ─────────────────────────────────────────────

   La 9100 accetta UNA connessione per volta: la seconda viene rifiutata, o
   resta appesa finche' la prima non chiude. Con piu' terminali sulla stessa
   stampante — che e' il caso normale, non l'eccezione — vuol dire etichette
   che non escono e nessuno che sappia perche'.

   Le richieste per la STESSA stampante si mettono quindi in fila; quelle per
   stampanti diverse restano parallele, perche' sono macchine diverse. E' la
   stessa disciplina delle transazioni di §8 — una per volta — applicata a
   una risorsa che non e' il database.

   La catena si tiene in una mappa e si pulisce da sola: quando l'ultima
   promessa in coda e' quella che stiamo aggiungendo, la voce esce. */
const code = new Map();

function inFila(chiave, lavoro) {
  const precedente = code.get(chiave) || Promise.resolve();
  /* `catch` prima di concatenare: un invio fallito non deve trascinarsi
     dietro quelli dopo. La coda serve a ordinare, non a propagare guasti. */
  const mio = precedente.catch(() => {}).then(lavoro);
  code.set(chiave, mio);
  mio.catch(() => {}).finally(() => { if (code.get(chiave) === mio) code.delete(chiave); });
  return mio;
}

/* ── IL SOCKET ─────────────────────────────────────────────────────────── */

/**
 * Apre, scrive, chiude. Risolve quando i byte sono usciti dalla macchina.
 *
 * NON dice che l'etichetta e' stampata — vedi la testata del file. Dice che
 * la stampante ha accettato il lavoro, che e' un fatto diverso e piu' piccolo.
 */
function scrivi(ip, porta, dati, host) {
  return new Promise((risolvi_, rifiuta) => {
    const s = net.connect({ host: ip, port: porta });
    let chiuso = false;
    const finita = (err) => {
      if (chiuso) return;
      chiuso = true;
      s.destroy();
      err ? rifiuta(err) : risolvi_({ ok: true, byte: Buffer.byteLength(dati, 'utf8') });
    };

    s.setTimeout(ATTESA_MS);
    s.on('timeout', () => finita(erroreRete(
      `${host}:${porta} non risponde entro ${ATTESA_MS / 1000} s. `
      + 'La stampante è spenta, staccata dalla rete, o ha un altro indirizzo.')));
    s.on('error', (err) => finita(erroreRete(
      `${host}:${porta} — ${/** @type {NodeJS.ErrnoException} */ (err).code === 'ECONNREFUSED'
        ? 'connessione rifiutata: a quell’indirizzo c’è qualcosa, ma non ascolta sulla porta di stampa'
        : err.message}`)));
    s.on('connect', () => {
      /* UTF-8 esplicito, perche' `^CI28` nello ZPL promette quello: scrivere
         in latin1 farebbe uscire le vocali accentate come glifi sbagliati, e
         il difetto si vedrebbe solo sulle descrizioni che ne hanno una. */
      s.end(Buffer.from(dati, 'utf8'));
    });
    /* `close` e non `finish`: `end` ritorna appena il buffer e' passato al
       sistema, `close` quando la connessione e' davvero finita. */
    s.on('close', () => finita(null));
  });
}

/**
 * Scrive e ASPETTA una risposta. Solo per `~HQES`: una stampante che accetta
 * il socket e non parla non e' un guasto — e' un server di stampa che non
 * conosce il comando — e allora si risponde «non lo so», che e' la verita'.
 */
function chiedi(ip, porta, comando, host) {
  return new Promise((risolvi_) => {
    const s = net.connect({ host: ip, port: porta });
    /** @type {Buffer[]} */
    const pezzi = [];
    let chiuso = false;
    const finita = (risposta, errore) => {
      if (chiuso) return;
      chiuso = true;
      s.destroy();
      risolvi_({ risposta, errore });
    };
    s.setTimeout(ATTESA_MS);
    s.on('timeout', () => finita(null, `${host}:${porta} non risponde`));
    s.on('error', (err) => finita(null, `${host}:${porta} — ${err.message}`));
    s.on('connect', () => {
      s.write(comando);
      /* Da qui in poi si aspetta la RISPOSTA, e quella ha un tempo suo: la
         connessione c'e' gia', e chi non risponde in un secondo e mezzo non
         risponde. */
      s.setTimeout(ATTESA_STATO_MS);
    });
    s.on('data', (/** @type {Buffer} */ d) => {
      pezzi.push(d);
      /* `\x03` chiude il blocco di stato: si smette di aspettare appena
         arriva, invece di stare fino al timeout. */
      if (d.includes(0x03)) finita(Buffer.concat(pezzi).toString('utf8'), null);
    });
    s.on('close', () => finita(pezzi.length ? Buffer.concat(pezzi).toString('utf8') : null, null));
  });
}

/* ── COME STA LA STAMPANTE ────────────────────────────────────────────────

   `~HQES` — Host Query Error Status — e' il comando Link-OS che risponde in
   chiaro. La risposta ha questa forma:

       PRINTER STATUS
        ERRORS:   1 00000000 00000005
        WARNINGS: 0 00000000 00000000

   La BANDIERA — quell'1 — dice se ci sono errori, ed e' un fatto certo: la
   si riporta sempre. I due gruppi esadecimali dicono QUALI, e li si traduce
   per quel che si sa con sicurezza — il gruppo di destra, che porta le
   cinque cose che capitano davvero in reparto. Tutto il resto esce in
   esadecimale com'e' arrivato: un nome sbagliato su un'etichetta di errore
   manda a cercare il guasto dove non e', e un codice grezzo no.

   E' anche la ragione per cui la bandiera si legge separatamente dai bit: se
   la traduzione fosse incompleta, «nessun errore riconosciuto» direbbe il
   falso mentre la bandiera dice il vero. */
/** @type {[number, string][]} */
const ERRORI_NOTI = [
  [0x00000001, 'carta finita'],
  [0x00000002, 'nastro finito'],
  [0x00000004, 'testina aperta'],
  [0x00000008, 'guasto alla taglierina'],
  [0x00000010, 'testina troppo calda'],
  [0x00000020, 'motore troppo caldo'],
  [0x00000040, 'elemento della testina guasto'],
  [0x00000080, 'testina non rilevata'],
];

function traduciErrori(gruppo) {
  const n = parseInt(gruppo, 16);
  if (!Number.isFinite(n) || n === 0) return [];
  const fuori = ERRORI_NOTI.filter(([bit]) => (n & bit) !== 0).map(([, nome]) => nome);
  /* I bit accesi che non sono nell'elenco escono come numero: non si nasconde
     un errore perche' non se ne conosce il nome. */
  const noti = ERRORI_NOTI.reduce((acc, [bit]) => acc | bit, 0);
  const ignoti = n & ~noti;
  if (ignoti) fuori.push(`altri errori (0x${ignoti.toString(16).toUpperCase()})`);
  return fuori;
}

function leggiStato(testo) {
  if (!testo) return { noto: false, errori: false, dettagli: [], grezzo: null };
  const m = /ERRORS:\s*(\d)\s+([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})/.exec(testo);
  if (!m) return { noto: false, errori: false, dettagli: [], grezzo: testo.trim() };
  const bandiera = m[1] === '1';
  const dettagli = traduciErrori(m[3]);
  /* Il gruppo di sinistra si riporta grezzo: i suoi bit variano fra le
     famiglie di firmware, e tradurli a memoria e' come inventarli. */
  const sinistra = parseInt(m[2], 16);
  if (sinistra) dettagli.push(`gruppo 1: 0x${sinistra.toString(16).toUpperCase()}`);
  return {
    noto: true,
    errori: bandiera,
    /* La bandiera dice di si' e nessun bit e' riconosciuto: si dice cosi',
       invece di dire «tutto a posto». */
    dettagli: bandiera && !dettagli.length ? ['errore non identificato'] : dettagli,
    grezzo: `${m[1]} ${m[2]} ${m[3]}`,
  };
}

/**
 * Come sta la stampante, adesso. Mai alza: una risposta che non arriva e'
 * un'informazione che manca, non un guasto — e chi chiama deve poter dire
 * «inviata, stato sconosciuto» invece di far fallire una stampa riuscita.
 */
async function statoStampante(rec) {
  const st = leggiStampante(rec);
  const ip = await risolvi(st.host);
  const { risposta, errore } = await inFila(st.printer_id || `${ip}:${st.porta}`,
    () => chiedi(ip, st.porta, '~HQES', st.host));
  if (errore) return { noto: false, errori: false, dettagli: [], grezzo: null, motivo: errore };
  return leggiStato(risposta);
}

/* ── LE TRE STAMPE ────────────────────────────────────────────────────── */

/** Le copie, dentro i limiti. Sopra il tetto non si tronca in silenzio: si
    dice, perche' chi ne aveva chieste cento deve sapere quante ne escono. */
function leggiCopie(n) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  if (v > COPIE_MAX) {
    throw erroreCfg(`${v} copie sono troppe: il massimo per invio è ${COPIE_MAX}.`);
  }
  return v;
}

/**
 * Manda uno ZPL gia' costruito. E' il punto per cui passano tutte e tre le
 * stampe, ed e' il solo posto del servizio che apra un socket verso l'esterno.
 */
async function inviaZpl(rec, testo) {
  const st = leggiStampante(rec);
  if (!st.attiva) {
    throw erroreCfg(`${st.nome || st.printer_id} è disattivata in Configurazione → Stampanti`);
  }
  const ip = await risolvi(st.host);
  const esito = await inFila(st.printer_id || `${ip}:${st.porta}`,
    () => scrivi(ip, st.porta, testo, st.host));
  return { ...esito, stampante: st.nome || st.printer_id, host: st.host, porta: st.porta };
}

/** L'etichetta della merce: una riga di giacenza, gia' letta dal database. */
async function stampaMerce(rec, dati, layout, copie) {
  const st = leggiStampante(rec);
  return inviaZpl(rec, zpl.etichettaMerce(dati, st, layout, leggiCopie(copie)));
}

/** 2.20 — l'etichetta di un bancale di prodotto finito: il riepilogo del
    bancale, gia' letto dal database, e il layout suo. */
async function stampaBancale(rec, dati, layout, copie) {
  const st = leggiStampante(rec);
  return inviaZpl(rec, zpl.etichettaBancale(dati, st, layout, leggiCopie(copie)));
}

/** L'etichetta dell'unita' di carico. Nessun layout: §8 — vedi `zpl.js`. */
async function stampaUdc(rec, udc, copie) {
  const st = leggiStampante(rec);
  return inviaZpl(rec, zpl.etichettaUdc(udc, st, leggiCopie(copie)));
}

/** La prova: un'etichetta che non porta merce, e lo stato letto dopo. */
async function stampaProva(rec) {
  const st = leggiStampante(rec);
  const inviata = await inviaZpl(rec, zpl.etichettaProva(st));
  const stato = await statoStampante(rec);
  return { ...inviata, stato };
}

module.exports = {
  stampaMerce, stampaBancale, stampaUdc, stampaProva, inviaZpl, statoStampante,
  leggiStampante, leggiStato, leggiCopie, risolvi, ePrivato, traduciErrori,
  PORTE_AMMESSE, DPI_AMMESSI, ATTESA_MS, COPIE_MAX,
};
