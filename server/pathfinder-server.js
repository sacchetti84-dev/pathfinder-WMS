'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');   // 2.11 — il guardiano lo usa prima del PIN
const https = require('https');
const net = require('net');                            // 2.26 — la porta sola: si guarda il primo byte
const { apriDatabase } = require('./lib/db');
const { NAMES, normalizzaCampo } = require('./lib/schema');
const registro = require('./lib/registro-servizio');   // 2.18 — il servizio lascia traccia
const zebra = require('./lib/stampa-zebra');           // 2.19 — le etichette sulle Zebra in rete
const { decidiTls, eSalutoTLS } = require('./lib/tls');// 2.26 — il certificato, e chi bussa in chiaro

const PORT = Number(process.env.PATHFINDER_PORT || 4173);
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = process.env.PATHFINDER_DB || path.join(__dirname, 'data', 'pathfinder.db');

/* 2.18 — IL REGISTRO STA ACCANTO AI DATI, non accanto al codice: la cartella
   del servizio si rifa' a ogni aggiornamento, quella dei dati no. Su
   PostgreSQL `DB_FILE` non e' un database ma resta un percorso valido, ed e'
   la stessa radice che l'installer ha gia' messo a posto coi permessi.
   `PATHFINDER_LOG=` (vuoto) lo spegne: serve ai collaudi che non vogliono
   lasciare file in giro. */
const LOG_FILE = process.env.PATHFINDER_LOG !== undefined
  ? (process.env.PATHFINDER_LOG || null)
  : path.join(path.dirname(DB_FILE), 'log', 'pathfinder-servizio.log');
/* ── 1.7 · L'APPLICATIVO E' UNA CARTELLA ──────────────────────────────────
   Fino alla 1.6 era un file HTML solo e `PATHFINDER_APP` ci puntava. Dalla
   1.7 e' una cartella — `index.html` piu' `assets/` coi nomi a impronta — e
   `PATHFINDER_APP_DIR` punta a `corrente`, una cartella che non cambia mai
   nome: installare e tornare indietro ne sostituiscono il CONTENUTO, senza
   amministratore e senza riavvio.

   NON e' una giunzione, e non deve tornare a esserlo: il 17/08/2026 lo era,
   e questo processo — che gira come SYSTEM in sessione 0 — non e' riuscito ad
   attraversarla («UNKNOWN: unknown error» su stat), mentre lo stesso percorso
   si apriva senza problemi da una sessione utente. Tre ore di applicativo giu'.

   `precedente` e' la cartella sorella, e serve gli assets della versione
   appena lasciata a chi aveva la pagina a meta' caricamento nell'istante
   dello scambio.

   `PATHFINDER_APP` resta come ripiego, per servire una vecchia consegna a
   file singolo senza avvolgerla. Non e' la strada normale: una build a file
   singolo e' una cartella con dentro il solo `index.html`, e passa di qui
   come tutte le altre. */
const APP_DIR  = process.env.PATHFINDER_APP_DIR || null;
const PREV_DIR = process.env.PATHFINDER_APP_PREV
  || (APP_DIR ? path.join(path.dirname(APP_DIR), 'precedente') : null);
const APP_FILE = process.env.PATHFINDER_APP || null;

/* LA VERSIONE DEL SERVIZIO SEGUE QUELLA DELL'APPLICATIVO - 2.2.

   Fino alla 2.0 questo numero si muoveva "quando cambia il contratto", ed
   era vero finche' il servizio si installava per conto suo. Dal 18/08 non
   e' piu' cosi': una versione E' l'applicativo PIU' il servizio, si
   installano insieme, e `installa-pathfinder.ps1` alla fine controlla che
   `service_version` sia lo stesso numero del pacchetto - se non lo e',
   dichiara fallita l'installazione, perche' quel caso significa che il
   riavvio non ha avuto effetto e sta ancora girando il processo di prima.

   Quindi questo numero si muove a OGNI versione, contratto o no: e' la
   prova che il servizio riavviato e' quello nuovo. Lasciarlo indietro
   perche' "il contratto non e' cambiato" fa fallire l'installazione con
   un messaggio che parla di riavvii. */
const VERSION = '2.38.3';

/* ── 2.10 · SU QUALE INTERFACCIA SI ASCOLTA ───────────────────────────────
   Fino alla 2.9 `listen` non diceva su quale, e Node in quel caso le prende
   TUTTE: il servizio rispondeva a chiunque sulla rete, e le rotte `/api` non
   chiedono credenziali a nessuno.

   Il valore predefinito resta quello — cambiarlo qui spegnerebbe i terminali
   di magazzino, che arrivano dalla rete, ed e' esattamente il gesto che non
   si fa in una versione che nessuno ha ancora provato. Ma adesso la scelta
   esiste e ha un nome: su una macchina dove l'applicativo si usa solo in
   locale, `PATHFINDER_HOST=127.0.0.1` chiude tutto il resto. */
const HOST = process.env.PATHFINDER_HOST || null;

/* 2.26 — IL CERTIFICATO. Tre strade e una porta sola: il PFX che
   `crea-certificato.ps1` genera con gli strumenti di Windows, la coppia PEM
   per un certificato che arriva dall'IT, e il chiaro — che resta possibile
   ma si annuncia come un difetto. La regola sta in `lib/tls.js`, pura. */
const TLS = decidiTls(process.env);

/* IL DATABASE SI APRE PRIMA DI ASCOLTARE — 2.6.
   Con SQLite l'apertura e' immediata; con PostgreSQL e' un giro di rete,
   la creazione dello schema e il riallineamento delle sequenze. In tutti e
   due i casi la porta si apre DOPO: un terminale che riceve un 500 perche'
   il servizio non ha ancora un database e' peggio di un terminale che
   aspetta due secondi. */
let db = null;
const app = express();

/* ── 2.10 · LE TRE INTESTAZIONI CHE COSTANO DUE RIGHE ─────────────────────
   Non c'e' `Content-Security-Policy`, e non e' una dimenticanza: l'interfaccia
   costruisce i suoi gestori dentro le stringhe — 258 `onclick` — e una CSP
   seria vieta proprio quelli. Metterne una permissiva al punto da lasciarli
   passare vorrebbe dire scrivere una riga che non protegge da niente e che
   il prossimo lettore crede protegga.

   Queste tre invece valgono subito e non chiedono niente in cambio:
   · `nosniff`        — un file servito come testo non diventa uno script
                        perche' il browser ci ha guardato dentro.
   · `DENY`           — l'applicativo non si apre dentro la cornice di
                        un'altra pagina, che e' il modo in cui si fa cliccare
                        un bottone a chi crede di cliccarne un altro.
   · `same-origin`    — l'indirizzo di questa pagina non esce verso terzi.
                        Oggi non ci sono richieste all'esterno, e questa riga
                        serve a che continui a essere vero. */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

/* IL CORPO SI LEGGE DOPO IL GUARDIANO — 2.18.
   Fino alla 2.17 `express.json` stava QUI, cioe' PRIMA della riga che chiede
   chi sta chiamando: il corpo veniva letto, tenuto in memoria e parsato, e
   solo dopo arrivava il 401. Con un tetto di 256 MB, chiunque raggiungesse la
   porta senza nessuna credenziale poteva far allocare al processo un quarto
   di giga per richiesta e riceverne indietro un rifiuto. Poche richieste in
   parallelo e il servizio muore di memoria — e il servizio e' il punto
   singolo su cui gira il magazzino.
   La registrazione del parser e' scesa sotto il guardiano; il tetto alto e'
   rimasto solo dove serve. Vedi la riga dopo la chiusura del guardiano. */

const originOf = (req) => req.get('X-Pathfinder-Client') || null;

/* ── 2.10 · L'IMPRONTA DEL PIN NON ESCE DAL SERVIZIO ──────────────────────
   Fino alla 2.9 `GET /api/c/operators` rispondeva coi record interi, e
   dentro c'erano `pin_hash` e `pin_salt`. Un PIN e' di sei cifre: un milione
   di combinazioni, e SHA-256 le prova tutte in meno di due secondi su una
   CPU sola — misurato, 204 ms per trovarne uno. Il freno a cinque tentativi
   di `verifyPin` non c'entra niente: chi ha l'impronta non bussa piu'.

   Il campo non sparisce e basta: al suo posto esce `pin_set`, che e' la sola
   cosa che il client chiedeva davvero — «questo operatore ha un PIN?» — e
   che serve a `getUsableLeaders` e alla maschera che completa il profilo.
   La verifica passa da `/api/op/verifyPin`, che l'impronta la legge dal
   database e non la fa viaggiare.

   NON e' nel driver: il driver deve restituire il record com'e', e c'e' un
   collaudo che lo pretende. E' qui, sul confine, perche' il confine e'
   questo — quel che entra in una risposta HTTP. */
const senzaPin = (rec) => {
  if (!rec || typeof rec !== 'object') return rec;
  /* 2.13 — il codice di ripristino segue il PIN alla lettera: e' un altro
     segreto, e vale piu' del PIN perche' riapre l'Admin. Esce solo il
     `rec_set`, che e' l'unica cosa che l'avviso in Configurazione chiede. */
  const { pin_hash, pin_salt, pin_algo, rec_hash, rec_salt, rec_algo, ...resto } = rec;
  return { ...resto,
           pin_set: Boolean(pin_hash && pin_salt),
           rec_set: Boolean(rec_hash && rec_salt) };
};

const nascondiPin = (col, dati) => {
  if (col !== 'operators') return dati;
  return Array.isArray(dati) ? dati.map(senzaPin) : senzaPin(dati);
};

/* ── 1.4.2 · Le UM escono dentro la stessa transazione dei colli ──────────
   Due scritture separate sono due numeri che divergono il primo pomeriggio in
   cui due terminali prelevano lo stesso lotto. E' esattamente la ragione per
   cui queste due rotte composte esistono, e vale per `qty_uom` come vale per
   `qty`: chi tocca l'una tocca l'altra, o nessuna delle due.

   L'arrotondamento e' quello di `src/modules/misure.ts` — DECIMALI_MAX. Qui
   e' riscritto invece che importato perche' il servizio resta JavaScript e
   non condivide moduli col client: se quella costante cambia, questa riga
   cambia con lei. */
const UOM_DECIMALI = 3;

const arrotondaUom = (n) => {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return null;
  const f = 10 ** UOM_DECIMALI;
  const r = Math.round(v * f * (1 + Number.EPSILON)) / f;
  return r === 0 ? 0 : r;
};

/* Quante UM restano dopo averne tolte `chieste`. `null` = riga a soli colli,
   cioe' il comportamento della 1.4.1 e di tutto cio' che c'era prima.

   `prima` si legge dalla RIGA, non da cio' che dice il client: e' il punto
   di tutta la transazione. `atteso` serve solo alla riga che non ha mai
   avuto un `qty_uom` — un dato che nessuno ha mai scritto — e appena uno dei
   due terminali lo scrive, il secondo trova quello e ignora la propria
   derivazione.

   Non scende sotto zero: un saldo negativo in un magazzino e' peggio di un
   prelievo rifiutato. */
const scalaUom = (item, chieste, atteso, tutto) => {
  const prima = arrotondaUom(item.qty_uom) ?? arrotondaUom(atteso);
  if (prima === null || (!tutto && arrotondaUom(chieste) === null)) return null;
  if (tutto) return { prima, dopo: 0, delta: -prima };
  const out = Math.min(arrotondaUom(chieste), prima);
  return { prima, dopo: arrotondaUom(prima - out), delta: -out };
};

/* ── 1.8 · L'ELENCO DEI COLLI, E CHI LO ARBITRA ───────────────────────────
   Dalla 1.8 la suddivisione non si calcola da un per-collo costante: la riga
   porta `packs`, un numero per collo, e lo stesso articolo puo' stare in colli
   da 5 e da 25 kg nella stessa ubicazione.

   IL CLIENT SCEGLIE PER INDICE, QUI GLI INDICI NON ARRIVANO. E' la stessa
   ragione di `qty_uom_before`: fra il render della maschera e il tocco sul
   bottone un altro terminale puo' aver preso quel collo, e un indice vecchio
   punterebbe a merce diversa. Arriva la MISURA del collo e quanto ne esce, e
   la misura si cerca nell'elenco che la riga ha adesso — o non si trova, e
   allora e' un 409.

   Dove c'e' `packs`, `qty` e `qty_uom` diventano derivate: le conta l'elenco,
   non il client. */
const leggiPacks = (raw) => {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const v of raw) {
    const n = arrotondaUom(v);
    if (n === null || n <= 0) return null;
    out.push(n);
  }
  return out;
};

/* Le uscite: «quanto» e, quando il client lo sa, «DA QUALE COLLO».
   Il solo «quanto» non basta, e costa un saldo giusto con i colli sbagliati:
   se l'operatore apre un collo da 25 per prenderne 10 e a scaffale c'e' anche
   un collo da 10, la ricerca per quantita' porterebbe via quello — a video
   resta «1 × 15», in corsia restano due colli da 25 interi. Trovato al banco
   il 17/08 con tutte le prove verdi.
   La forma a numero solo resta valida: e' il collo che esce intero. */
const leggiUscite = (raw) => {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const v of raw) {
    if (v !== null && typeof v === 'object') {
      const da = arrotondaUom(v.da);
      const q = arrotondaUom(v.quantita ?? v.da);
      if (da === null || q === null || da <= 0 || q <= 0 || q > da) return null;
      out.push({ da, q });
      continue;
    }
    const n = arrotondaUom(v);
    if (n === null || n <= 0) return null;
    out.push({ da: null, q: n });
  }
  return out;
};

const sommaPacks = (elenco) => elenco.reduce((a, n) => arrotondaUom(a + n), 0);

/* Con `da`, il collo e' quello e nessun altro: si cerca un collo di QUELLA
   misura e se ne toglie `q`. I colli della stessa misura sono intercambiabili
   — uno da 25 vale l'altro — ma uno da 10 non vale un 25 aperto.

   Senza `da` — la forma a numero solo — vale la regola di prima: misura
   esatta, e se non c'e' si apre IL PIU' PICCOLO CHE BASTA, perche' aprire
   quello da 1.000 per prendere 300 lascerebbe due colli aperti dove ne
   bastava uno. */
const scalaPacks = (elenco, usciti) => {
  const rimasti = elenco.slice();
  let uscite = 0;
  for (const u of usciti) {
    const q = u.q;
    let i;
    if (u.da !== null) {
      i = rimasti.indexOf(u.da);
      if (i === -1) {
        throw Object.assign(new Error(`il collo da ${u.da} non e' piu' su questa riga: un altro terminale l'ha gia' mosso`), { status: 409 });
      }
    } else {
      i = rimasti.indexOf(q);
      if (i === -1) {
        for (let k = 0; k < rimasti.length; k++) {
          if (rimasti[k] > q && (i === -1 || rimasti[k] < rimasti[i])) i = k;
        }
      }
      if (i === -1) {
        throw Object.assign(new Error(`nessun collo contiene ${q}: un altro terminale ha gia' mosso questa riga`), { status: 409 });
      }
    }
    if (rimasti[i] === q) rimasti.splice(i, 1);
    else rimasti[i] = arrotondaUom(rimasti[i] - q);
    uscite = arrotondaUom(uscite + q);
  }
  return { rimasti, uscite };
};

/* Che cosa esce da una riga gestita a colli dichiarati. `null` = `packs_out`
   non c'e', e allora comanda il percorso della 1.7 — riga per riga, senza un
   ramo di codice che si percorre una volta l'anno.

   `packs_before` e' il seme, e vale una volta sola: la riga posizionata prima
   della 1.8 non ha nessun elenco, e il primo che la muove porta la propria
   lettura. Poi comanda la riga, come per `qty_uom_before`. */
const uscitaColli = (item, packsOut, packsBefore) => {
  const usciti = leggiUscite(packsOut);
  if (usciti === null) return null;
  const elenco = leggiPacks(item.packs) || leggiPacks(packsBefore);
  if (!elenco) {
    throw Object.assign(new Error(`${item.item_key}: la riga non porta l'elenco dei colli`), { status: 409 });
  }
  const { rimasti, uscite } = scalaPacks(elenco, usciti);
  const prima = sommaPacks(elenco);
  return {
    rimasti, tutto: rimasti.length === 0,
    qtyBefore: elenco.length, qtyAfter: rimasti.length,
    um: { prima, dopo: arrotondaUom(prima - uscite), delta: -uscite },
  };
};

/* `packs_out` illeggibile non ricade in silenzio sul percorso vecchio: una
   maschera che manda un elenco rotto ha un difetto, e prelevare lo stesso
   scriverebbe un saldo plausibile per il motivo sbagliato. */
const assertPacksOut = (raw) => {
  if (raw !== undefined && raw !== null && leggiUscite(raw) === null) {
    throw Object.assign(new Error('l\'elenco dei colli da prelevare non e\' leggibile'), { status: 400 });
  }
};

/* I DUE DATABASE NOMINANO LO STESSO RIFIUTO IN DUE MODI — 2.6.
   SQLite alza `SQLITE_CONSTRAINT_UNIQUE`, PostgreSQL lo SQLSTATE `23505`.
   Sono la stessa cosa per chi chiama: «quel valore c'e' gia'», cioe' un 409.
   Senza la seconda meta' della mappa, la stessa richiesta respinta tornava
   409 su SQLite e 500 su PostgreSQL: al terminale, «ci hai riprovato» contro
   «il servizio si e' rotto». */
const SQL_CONSTRAINT = {
  SQLITE_CONSTRAINT_UNIQUE:     "valore gia' presente: il vincolo di unicita' lo impedisce",
  SQLITE_CONSTRAINT_PRIMARYKEY: "chiave gia' esistente",
  SQLITE_CONSTRAINT_NOTNULL:    "campo obbligatorio mancante",
  SQLITE_CONSTRAINT_FOREIGNKEY: "riferimento a un record inesistente",
  /* PostgreSQL — classe 23, «integrity constraint violation». */
  23505: "valore gia' presente: il vincolo di unicita' lo impedisce",
  23503: "riferimento a un record inesistente",
  23502: "campo obbligatorio mancante",
  23514: "valore fuori da quanto il vincolo consente",
  "23P01": "valore in conflitto con un altro gia' presente"
};

const httpError = (err) => {
  if (err.status) return { status: err.status, message: err.message };
  const known = SQL_CONSTRAINT[err.code];
  if (known) return { status: 409, message: `${known} (${err.message})`, quiet: true };
  if (String(err.code || '').startsWith('SQLITE_CONSTRAINT'))
    return { status: 409, message: err.message, quiet: true };
  return { status: 500, message: err.message || 'errore interno' };
};

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) {
    const e = httpError(err);
    if (e.status >= 500) {
      console.error('[pathfinder] guasto:', err);
      /* 2.18 — il messaggio SI', lo stack no: uno stack in un registro che
         qualcuno spedisce all'assistenza porta percorsi e nomi di macchina. */
      registro.errore('rotta.500', `${req.method} ${req.path} — ${e.message}`);
    }
    else if (e.quiet) console.warn(`[pathfinder] respinta ${req.method} ${req.originalUrl}: ${e.message}`);
    res.status(e.status).json({ error: e.message });
  }
};

const parseCriteria = (raw) => {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw Object.assign(new Error('criterio non leggibile'), { status: 400 }); }
};


/* ══ 2.11 · LA SESSIONE, E PERCHE' IL PIN DA SOLO NON BASTAVA ═════════════
   Fino alla 2.10 le rotte `/api` non chiedevano credenziali a nessuno: chi
   raggiungeva la porta leggeva qualunque collezione, ne scriveva qualunque
   record, e con una `DELETE` svuotava le giacenze. Il PIN non era un
   controllo d'accesso — era una domanda che il client faceva a se stesso e a
   cui obbediva da solo. Chi non usava il client non ci passava nemmeno
   vicino, e la procedura di recupero PIN del §6 dell'INDEX — una `PATCH` su
   `/api/c/operators` — funzionava per chiunque sulla rete: si leggeva
   l'elenco, si sceglieva un Team Leader, si scriveva un'impronta nuova, si
   entrava come lui.

   ADESSO IL PIN EMETTE UNA SESSIONE, e senza sessione non si entra.

   UN COOKIE, NON UN'INTESTAZIONE. Tre ragioni, e la prima da sola decide:
   `EventSource` — il flusso che avvisa i terminali quando qualcun altro
   scrive — NON sa mandare intestazioni, e l'unico modo di autenticarlo con
   un token sarebbe metterlo nell'indirizzo, dove finisce nei log e nella
   cronologia. Poi: `HttpOnly` tiene il valore fuori dalla portata di
   JavaScript, quindi un XSS non se lo porta via. Infine non c'e' una riga da
   cambiare in ogni chiamata del client — il browser lo allega da solo.
   `SameSite=Strict` chiude il verso opposto: nessuna pagina di terzi puo'
   far partire una richiesta che se lo porti dietro.

   LE SESSIONI STANNO IN MEMORIA, e non e' pigrizia: e' il modo in cui un
   token che NON SCADE A TEMPO — deciso da Andrea il 27/08, perche' un
   operatore buttato fuori a meta' di un prelievo e' peggio del rischio che
   copre — resta comunque corto. Il servizio si riavvia a ogni aggiornamento
   e a ogni riaccensione della macchina, e li' tutte le sessioni cadono
   insieme. Chi smonta preme «Blocca», e la sua se ne va subito.

   LA FINESTRA DI PRIMO AVVIO. Su una macchina appena installata nessun
   operatore ha un PIN, e senza una via d'ingresso il primo non si potrebbe
   creare: il servizio allora accetta senza sessione, e lo dice all'avvio a
   lettere chiare. Appena il primo PIN esiste la finestra si chiude da sola e
   non si riapre. Si ricalcola SOLO quando qualcuno scrive sugli operatori,
   non a ogni richiesta: sarebbe una lettura di database per ogni movimento
   di magazzino.

   QUEL CHE RESTA APERTO, e va detto qui perche' e' qui che si legge: senza
   TLS il cookie viaggia in chiaro, come ci viaggiava il PIN. Chi ascolta la
   rete lo prende e lo usa finche' il servizio non si riavvia. La sessione
   chiude la porta a chi bussa; non protegge da chi ascolta il filo. */

const sessioni = new Map();   // token -> { op_id, initials, creata, ultimoUso }

/* ── 2.18 · `ultimoUso` VIENE FINALMENTE LETTO ────────────────────────────
   Dalla 2.11 questo campo si scriveva a ogni richiesta e non lo leggeva
   nessuno: una sessione moriva solo al riavvio del processo.

   La ragione per cui NON c'e' una scadenza a tempo assoluto resta quella del
   27/08, e non cambia: un token che scade a meta' turno e' un token che
   scade in corsia, con i guanti addosso e un terminale in mano.

   MA FRA UN TURNO E L'ALTRO E' UN ALTRO CASO, e non era stato considerato.
   Un terminale condiviso lasciato acceso il venerdi' sera e' ancora dentro
   il lunedi' mattina, con l'identita' di chi l'ha usato per ultimo — e
   quell'identita' FIRMA I MOVIMENTI A REGISTRO, che e' la firma GMP.

   Dodici ore: un turno piu' margine. Chi lavora non ci arriva mai, chi ha
   lasciato il terminale acceso si', e la finestra si sposta a ogni gesto.
   `PATHFINDER_SESSIONE_ORE=0` la spegne, per chi ha una ragione.

   LA CHIAVE DI MACCHINA NON SCADE: non e' una sessione ed e' l'unico modo
   che l'installer e il backup serale hanno di parlare col servizio. */
const SESSIONE_ORE = (() => {
  const v = Number(process.env.PATHFINDER_SESSIONE_ORE);
  return Number.isFinite(v) && v >= 0 ? v : 12;
})();
const SESSIONE_MS = SESSIONE_ORE * 3600_000;

const sessioneScaduta = (s, adesso = Date.now()) =>
  SESSIONE_MS > 0 && adesso - s.ultimoUso > SESSIONE_MS;

/* La potatura pigra basta a chiudere la porta — `chiSei` la fa a ogni
   richiesta — ma non basta a tenere piccola la mappa: una sessione che
   nessuno ricontrolla resta li' per sempre. Questa passata la toglie di
   mezzo. `unref` perche' un contatore non deve tenere vivo il processo. */
const POTATURA_MS = 15 * 60_000;
const potaturaSessioni = setInterval(() => {
  if (SESSIONE_MS <= 0) return;
  const adesso = Date.now();
  for (const [token, s] of sessioni) if (sessioneScaduta(s, adesso)) sessioni.delete(token);
}, POTATURA_MS);
potaturaSessioni.unref?.();

const NOME_COOKIE = 'pathfinder_sessione';

/* Il token di macchina serve a chi non ha un browser e non ha un PIN: il
   backup serale, l'installer che verifica, gli script di migrazione. Lo
   scrive l'installazione fra le variabili di macchina. */
const TOKEN_MACCHINA = process.env.PATHFINDER_TOKEN || null;

const leggiCookie = (req, nome) => {
  const grezzo = req.headers.cookie;
  if (!grezzo) return null;
  for (const pezzo of grezzo.split(';')) {
    const i = pezzo.indexOf('=');
    if (i === -1) continue;
    if (pezzo.slice(0, i).trim() === nome) return decodeURIComponent(pezzo.slice(i + 1).trim());
  }
  return null;
};

/* `Secure` SOLO quando c'e' davvero TLS: messo su HTTP il browser scarta il
   cookie in silenzio, e l'applicativo non entrerebbe piu' su nessun
   terminale — un modo perfetto per non capirci niente. */
const scriviCookie = (res, token) => {
  const parti = [`${NOME_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (TLS.modo !== 'chiaro') parti.push('Secure');
  res.set('Set-Cookie', parti.join('; '));
};

const cancellaCookie = (res) => {
  res.set('Set-Cookie', `${NOME_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
};

/* `null` = non ancora chiesto. Si azzera quando si scrive sugli operatori:
   e' l'unico gesto che puo' cambiare la risposta ATTRAVERSO IL SERVIZIO.

   2.13 — MA IL DATABASE SI PUO' SVUOTARE ANCHE ALLE SPALLE DEL SERVIZIO:
   un `.db` sostituito a mano, `prepara-postgres.ps1`, un ripristino da
   backup. In quel caso `scordaPrimoAvvio` non lo chiama nessuno, la
   risposta tenuta da parte resta «no» per sempre, e il servizio rifiuta
   con un 401 anche l'unica richiesta che dovrebbe passare — quella che
   crea il primo Admin. Fino al riavvio del processo non si esce, e chi
   guarda vede solo «Sessione non valida: identificarsi» sotto il wizard.

   Quindi: prima di dire di no si ricontrolla, al piu' una volta ogni
   cinque secondi. La lettura costa una tabella piccola e la si paga solo
   sul cammino del rifiuto — chi lavora ha una sessione e non ci passa. */
let _primoAvvio = null;
let _riletturaPrimoAvvio = 0;
const RILETTURA_MS = 5000;

const finestraDiPrimoAvvio = async () => {
  if (_primoAvvio !== null) return _primoAvvio;
  try {
    const ops = await db.all('operators');
    _primoAvvio = !ops.some((o) => o.pin_hash && o.pin_salt && o.active !== false);
  } catch {
    /* Se il database non risponde non si spalanca la porta: si dice di no, e
       chi ha un guasto vero lo vede da un'altra parte. */
    _primoAvvio = false;
  }
  return _primoAvvio;
};

const scordaPrimoAvvio = () => { _primoAvvio = null; };

/* Le due che rispondono senza sessione, e ognuna ha il suo perche':
   · `health`    — l'installer la interroga per dire se l'installazione e'
                   riuscita, e succede prima che esista un PIN.
   · `app-info`  — stessa ragione, ed e' la prima diagnosi di ogni guaio.
   Sotto `app.use('/api', ...)` il percorso arriva SENZA `/api`. */
const SENZA_SESSIONE = new Set(['/health', '/app-info']);

const chiSei = (req) => {
  if (TOKEN_MACCHINA) {
    const t = req.get('X-Pathfinder-Token');
    /* Confronto a tempo costante: e' una stringa che vale quanto una
       password, e costa due righe. */
    if (t && t.length === TOKEN_MACCHINA.length
          && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN_MACCHINA))) {
      return { macchina: true, initials: 'SERVIZIO' };
    }
  }
  const token = leggiCookie(req, NOME_COOKIE);
  if (!token) return null;
  const s = sessioni.get(token);
  if (!s) return null;
  /* 2.18 — la porta si chiude qui, non alla passata periodica: quella tiene
     piccola la mappa, questa decide se si entra. */
  if (sessioneScaduta(s)) { sessioni.delete(token); return null; }
  s.ultimoUso = Date.now();
  return s;
};

app.use('/api', async (req, res, avanti) => {
  try {
    if (SENZA_SESSIONE.has(req.path) || req.path.startsWith('/auth/')) return avanti();

    const chi = chiSei(req);
    if (chi) { req.operatore = chi; return avanti(); }

    if (await finestraDiPrimoAvvio()) { req.operatore = { primoAvvio: true }; return avanti(); }

    /* La seconda occhiata, prima del rifiuto: vedi `_primoAvvio`. */
    if (Date.now() - _riletturaPrimoAvvio > RILETTURA_MS) {
      _riletturaPrimoAvvio = Date.now();
      scordaPrimoAvvio();
      if (await finestraDiPrimoAvvio()) { req.operatore = { primoAvvio: true }; return avanti(); }
    }

    /* 401 e non 403: la differenza non e' formale — il client la legge per
       decidere se riaprire la maschera dell'identificazione invece di dire
       che qualcosa non va. */
    /* 2.18 — la rotta si registra, il cookie NO: un token di sessione in un
       file di testo e' la stessa porta, aperta due volte. */
    registro.avviso('auth.401', `${req.method} /api${req.path} — sessione assente o scaduta`);
    res.status(401).json({ error: 'Sessione non valida: identificarsi.', sessione: false });
  } catch (err) {
    console.error('[pathfinder] guardiano:', err.message);
    registro.errore('guardiano.500', err.message);
    res.status(500).json({ error: 'errore interno' });
  }
});

/* ── 2.18 · IL CORPO, ADESSO CHE SI SA CHI CHIAMA ─────────────────────────
   Due parser, e l'ordine fra i due conta quanto l'ordine col guardiano.

   IL TETTO ALTO STA SOLO DOVE SERVE. Un import completo dell'anagrafica pesa
   davvero, e queste quattro rotte sono quelle che `persistence/remote.ts`
   usa per portare dentro e fuori un magazzino intero. Le altre non hanno mai
   ricevuto un corpo piu' grande di un record.

   IL PARSER GRANDE VA MONTATO PER PRIMO. `express.json` non tocca una
   richiesta il cui corpo e' gia' stato letto: se passasse prima quello da 2
   MB, un import da 40 MB si prenderebbe un 413 e nessuno dei due parser
   successivi potrebbe rimediare.

   Una rotta nuova che riceve corpi grandi va aggiunta a questo elenco: se
   nessuno se ne ricorda, si vede subito, perche' risponde 413 e non 500. */
const ROTTE_DI_IMPORT = [
  '/api/c/:col/bulk',
  '/api/tx',
  '/api/clear',
  '/api/deleteWhere/:col',
  /* 2.32 — l'allegato di un prelievo ODP viaggia in base64 dentro il JSON:
     un .xlsx da otto megabyte ne fa undici scritto cosi', e il parser di
     serie si ferma a due. Il commento qui sopra lo dice: chi aggiunge una
     rotta che riceve corpi grandi la aggiunge anche qui. */
  '/api/allegati',
];
app.use(ROTTE_DI_IMPORT, express.json({ limit: '256mb' }));
app.use(express.json({ limit: '2mb' }));

/* UN CORPO CHE NON SI LEGGE E' UN 400, NON UNA PAGINA HTML COL SORGENTE —
   2.18. Gli errori di `express.json` non passano da `wrap`: nascono dentro
   il middleware, e senza qualcuno che li raccolga finiscono nel gestore
   predefinito di Express, che risponde HTML e — fuori da `production` — ci
   mette dentro lo stack. Un terminale che riceve HTML da una rotta `/api`
   non ha modo di dire all'operatore che cosa e' successo, e lo stack dice a
   chiunque chiami dove stanno i file sul disco.
   Quattro argomenti: e' cosi' che Express riconosce un gestore d'errore. */
app.use((err, req, res, avanti) => {
  if (res.headersSent) return avanti(err);
  if (err?.type === 'entity.too.large') {
    registro.avviso('corpo.413', `${req.method} ${req.path} — ${err.length || '?'} byte, tetto ${err.limit}`);
    return res.status(413).json({
      error: 'Richiesta troppo grande per questa rotta. Un import completo passa da /api/tx '
           + 'o da /api/c/<collezione>/bulk.',
    });
  }
  if (err?.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'corpo della richiesta non leggibile: non e\' JSON valido' });
  return avanti(err);
});

/* ══ 2.13 · L'ANAGRAFICA DEGLI OPERATORI E' DELL'ADMIN, E LO DICE IL SERVIZIO
   © Andrea Sacchetti — Dietopack S.r.l.

   Fino alla 2.12 la gerarchia stava tutta nel client: la maschera chiedeva
   il PIN di un Team Leader e poi mandava una PATCH come tutte le altre. Chi
   non passava dalla maschera non incontrava nessuna gerarchia — bastava una
   sessione qualunque, cioe' il PIN del piu' giovane degli operatori, e una
   riga di `curl`, per scriversi `role: "admin"` addosso. Il guardiano della
   2.11 chiudeva la porta a chi non ha un PIN; questo chiude l'anagrafica a
   chi ne ha uno e non ha la carica.

   TRE ECCEZIONI, e sono le stesse tre di sempre:
   · il PRIMO AVVIO — il primo Admin va creato, e non c'e' ancora nessuno
     che possa autorizzarlo;
   · il TOKEN DI MACCHINA — backup, installer e migrazioni non hanno un PIN
     e non hanno una carica, hanno una chiave;
   · il RINNOVO DEL PIN, che NON passa di qui: ha la sua rotta, che verifica
     da se' chi autorizza e su chi. Un Team Leader su questa collezione non
     scrive niente, e deve poter rinnovare lo stesso.

   COSA SI GUARDA. Non solo `/c/operators`: anche la transazione che la
   tocca di striscio, il `clear` che la nomina in un elenco, il `bulk`. Una
   sola di queste lasciata aperta e' tutta la regola che non vale.        */

const SCRITTURE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const toccaGliOperatori = (req) => {
  const p = req.path;
  if (p === '/c/operators' || p.startsWith('/c/operators/')) return true;
  if (p === '/deleteWhere/operators') return true;
  const b = req.body;
  if (p === '/clear') return Array.isArray(b?.collections) && b.collections.includes('operators');
  if (p === '/tx') {
    if (Array.isArray(b?.ops) && b.ops.some((o) => o?.collection === 'operators'
        || (Array.isArray(o?.collections) && o.collections.includes('operators')))) return true;
  }
  return false;
};

/* La sessione porta `op_id`, non il ruolo: il ruolo si legge dal database,
   perche' una carica tolta deve valere subito e non al prossimo accesso. */
const eAdmin = async (chi) => {
  if (!chi?.op_id) return false;
  try {
    const op = await db.get('operators', chi.op_id);
    return Boolean(op) && op.active !== false && op.role === 'admin';
  } catch { return false; }
};

/* ══ 2.16 · L'ULTIMO ADMIN NON SI TOGLIE DA SOLO ══════════════════════════
   © Andrea Sacchetti — Dietopack S.r.l.

   La 2.13 ha portato la gerarchia dal client al servizio, ma UNA regola di
   §8 era rimasta indietro: «l'ultimo Admin non si retrocede e non si
   disattiva» viveva soltanto in `configOperatori.ts`. Il servizio lasciava
   passare la PATCH che toglie la carica all'unico Admin — chi la manda E'
   un Admin, e il guardiano dei ruoli chiede solo quello.

   E' un vicolo cieco, non un fastidio: senza Admin la Configurazione non si
   apre, e il codice di ripristino pretende `role === 'admin'`. La finestra
   del primo avvio nemmeno si riapre, perche' guarda i PIN e non le cariche.
   Resterebbe la sola chiave di macchina.

   COME SI CONTROLLA. Non si indovina la forma della richiesta: si SIMULA.
   Le mutazioni si traducono in una forma sola, si applicano a una copia
   dell'anagrafica, e si guarda com'e' rimasta. Cosi' la regola vale anche
   dentro una transazione che tocca tre operatori in fila.

   COSA RESTA PERMESSO, e deve restarlo:
   · il reset dei dati, che svuota TUTTO — nessuno resta con un PIN, e la
     finestra del primo avvio si riapre da se';
   · la chiave di macchina, che e' l'uscita di servizio dichiarata in §8.  */

const _attivo = (o) => Boolean(o) && o.active !== false;
const _haPin = (o) => Boolean(o && o.pin_hash && o.pin_salt);

/* Le mutazioni sull'anagrafica, ridotte a quattro verbi: svuota, delete,
   update, put. `put` SOSTITUISCE, come fa il driver. */
const mutazioniOperatori = async (req) => {
  const p = req.path, b = req.body, m = req.method;
  const per = async (criteria) =>
    (await db.query('operators', { criteria })).map((o) => ({ op: 'delete', key: o.op_id }));

  if (p === '/c/operators/bulk') return (Array.isArray(b) ? b : []).map((r) => ({ op: 'put', record: r }));
  if (p === '/c/operators') {
    if (m === 'POST') return [{ op: 'put', record: b }];
    if (m === 'DELETE') return [{ op: 'svuota' }];
    return [];
  }
  if (p.startsWith('/c/operators/')) {
    const key = decodeURIComponent(p.slice('/c/operators/'.length));
    if (m === 'PUT') return [{ op: 'put', record: b }];
    if (m === 'PATCH') return [{ op: 'update', key, changes: b }];
    if (m === 'DELETE') return [{ op: 'delete', key }];
    return [];
  }
  if (p === '/deleteWhere/operators') return per(b);
  if (p === '/clear') return [{ op: 'svuota' }];
  if (p === '/tx') {
    const fuori = [];
    for (const o of (Array.isArray(b?.ops) ? b.ops : [])) {
      const suGliOperatori = o?.collection === 'operators';
      const nellElenco = Array.isArray(o?.collections) && o.collections.includes('operators');
      if (!suGliOperatori && !nellElenco) continue;
      switch (o.op) {
        case 'add': case 'put': fuori.push({ op: 'put', record: o.record }); break;
        case 'update':          fuori.push({ op: 'update', key: o.key, changes: o.changes }); break;
        case 'delete':          fuori.push({ op: 'delete', key: o.key }); break;
        case 'bulkAdd': case 'bulkPut':
          for (const r of (o.records || [])) fuori.push({ op: 'put', record: r });
          break;
        case 'clear': case 'clearMany': fuori.push({ op: 'svuota' }); break;
        case 'deleteWhere':      fuori.push(...await per(o.criteria)); break;
        default: break;
      }
    }
    return fuori;
  }
  return [];
};

const restaUnAdmin = async (req) => {
  const mutazioni = await mutazioniOperatori(req);
  if (!mutazioni.length) return true;

  let mappa = new Map((await db.all('operators')).map((o) => [o.op_id, { ...o }]));
  for (const mu of mutazioni) {
    if (mu.op === 'svuota') { mappa = new Map(); continue; }
    if (mu.op === 'delete') { mappa.delete(mu.key); continue; }
    if (mu.op === 'update') {
      const prima = mappa.get(mu.key);
      if (prima) mappa.set(mu.key, { ...prima, ...mu.changes });
      continue;
    }
    if (mu.op === 'put' && mu.record?.op_id) mappa.set(mu.record.op_id, { ...mu.record });
  }

  const dopo = [...mappa.values()];
  if (dopo.some((o) => _attivo(o) && o.role === 'admin')) return true;
  /* Nessun Admin. Si passa lo stesso soltanto se non resta nessuno che possa
     entrare: allora la finestra del primo avvio si riapre da se'. */
  return !dopo.some((o) => _attivo(o) && _haPin(o));
};

/* `wrap` non serve qui: prende due argomenti e lascerebbe cadere `avanti`,
   che e' il solo modo che questa ha di dire «passa». */
app.use('/api', async (req, res, avanti) => {
  try {
    if (!SCRITTURE.has(req.method) || !toccaGliOperatori(req)) return avanti();
    const chi = req.operatore;
    if (chi?.macchina) return avanti();
    /* L'ECCEZIONE DEL PRIMO GIORNO SI CHIEDE, NON SI EREDITA.

       `chi.primoAvvio` lo mette il guardiano della sessione, e solo a chi
       arriva SENZA cookie: chi ne ha uno ha `op_id` e basta. Fidarsi di
       quel solo campo murava il caso peggiore — l'Admin che resetta il
       database. Il reset porta via anche gli operatori, la sua sessione
       resta buona ma il suo record non c'e' piu', `eAdmin` risponde di no,
       e il wizard del primo Admin si prende un 403 sull'unica scrittura
       che deve passare. Dal database non si rientra piu'.

       Quindi la domanda si rifa' qui, e vale per tutti: finche' nessuno ha
       un PIN, l'anagrafica e' scrivibile. Appena il primo esiste, la
       finestra si chiude da sola come ha sempre fatto. */
    if (await finestraDiPrimoAvvio()) return avanti();
    if (await eAdmin(chi)) {
      if (await restaUnAdmin(req)) return avanti();
      /* 409 e non 403: la carica c'e'. E' lo STATO che la scrittura
         lascerebbe dietro a non essere ammesso. */
      return res.status(409).json({
        error: 'L’ultimo Admin attivo non si retrocede, non si disattiva e non si cancella: '
             + 'nominane un altro prima, o resterebbe soltanto la chiave di macchina.',
        ultimoAdmin: true,
      });
    }
    /* 403 e non 401: la sessione c'e' ed e' buona. Manca la carica, e il
       client non deve riaprire la maschera dell'identificazione. */
    registro.avviso('ruoli.403',
      `${req.method} /api${req.path} — ${chi?.initials || '?'} non e' Admin`);
    res.status(403).json({
      error: 'Riservato al ruolo Admin: l’anagrafica degli operatori non si scrive da qui.',
      ruolo: true,
    });
  } catch (err) {
    console.error('[pathfinder] guardiano dei ruoli:', err.message);
    res.status(500).json({ error: 'errore interno' });
  }
});

app.get('/api/health', wrap(async (req, res) => {
  res.json({ ok: true, service: 'pathfinder', version: VERSION,
             collections: NAMES, ...(await db.stats()) });
}));

app.get('/api/load', wrap(async (req, res) => {
  const from = req.query.movLogFrom != null && req.query.movLogFrom !== ''
    ? Number(req.query.movLogFrom) : null;
  const tutto = await db.loadAll({ movLogFrom: from });
  if (tutto.operators) tutto.operators = nascondiPin('operators', tutto.operators);
  res.json(tutto);
}));

app.get('/api/c/:col/query', wrap(async (req, res) => {
  const { col } = req.params;
  res.json(nascondiPin(col, await db.query(col, {
    criteria: parseCriteria(req.query.criteria),
    limit: req.query.limit != null && req.query.limit !== '' ? Number(req.query.limit) : null,
    offset: req.query.offset ? Number(req.query.offset) : 0,
    reverse: req.query.reverse === 'true',
    orderBy: req.query.orderBy || null
  })));
}));

app.get('/api/c/:col/count', wrap(async (req, res) => {
  res.json({ count: await db.count(req.params.col, parseCriteria(req.query.criteria)) });
}));

app.get('/api/c/:col/:key', wrap(async (req, res) => {
  const rec = await db.get(req.params.col, req.params.key);
  if (!rec) return res.status(404).json({ error: 'non trovato' });
  res.json(nascondiPin(req.params.col, rec));
}));

app.get('/api/c/:col', wrap(async (req, res) =>
  res.json(nascondiPin(req.params.col, await db.all(req.params.col)))));

app.post('/api/c/:col/bulk', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  const mode = req.query.mode === 'put' ? 'bulkPut' : 'bulkAdd';
  const records = req.body;
  if (!Array.isArray(records)) throw Object.assign(new Error('atteso un elenco di record'), { status: 400 });
  res.json({ keys: db[mode](req.params.col, records, originOf(req)) });
}));

app.post('/api/c/:col', wrap(async (req, res) => {
  /* 2.11 — scrivere un operatore puo' chiudere la finestra di primo avvio:
     la risposta tenuta da parte si butta, e la prossima richiesta la rifa'. */
  if (req.params.col === 'operators') scordaPrimoAvvio();
  res.json({ key: await db.add(req.params.col, req.body, originOf(req)) });
}));

app.put('/api/c/:col/:key', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  const rec = { ...req.body };
  res.json({ key: await db.put(req.params.col, rec, originOf(req)) });
}));

app.patch('/api/c/:col/:key', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  res.json({ changed: await db.update(req.params.col, req.params.key, req.body, originOf(req)) });
}));

app.delete('/api/c/:col/:key', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  res.json({ deleted: await db.delete(req.params.col, req.params.key, originOf(req)) });
}));

app.delete('/api/c/:col', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  res.json({ deleted: await db.clear(req.params.col, originOf(req)) });
}));

app.post('/api/deleteWhere/:col', wrap(async (req, res) => {
  res.json({ deleted: await db.deleteWhere(req.params.col, req.body, originOf(req)) });
}));

app.post('/api/clear', wrap(async (req, res) => {
  scordaPrimoAvvio();
  const cols = req.body?.collections;
  if (!Array.isArray(cols)) throw Object.assign(new Error('atteso { collections: [...] }'), { status: 400 });
  await db.clearMany(cols, originOf(req));
  res.json({ ok: true });
}));

app.post('/api/tx', wrap(async (req, res) => {
  /* 2.11 — una transazione tocca quel che vuole: la risposta tenuta da parte
     si butta senza guardare. Costa una lettura la prossima volta; tenersela
     per prudenza vorrebbe dire lasciare aperta una porta che dovrebbe essersi
     chiusa. */
  scordaPrimoAvvio();
  const { collections = [], ops = [] } = req.body || {};
  if (!Array.isArray(ops)) throw Object.assign(new Error('atteso { ops: [...] }'), { status: 400 });
  const results = [];
  await db.transaction(collections.length ? collections : NAMES, async () => {
    for (const o of ops) {
      switch (o.op) {
        case 'add':         results.push(await db.add(o.collection, o.record)); break;
        case 'put':         results.push(await db.put(o.collection, o.record)); break;
        case 'update':      results.push(await db.update(o.collection, o.key, o.changes)); break;
        case 'delete':      results.push(await db.delete(o.collection, o.key)); break;
        case 'bulkAdd':     results.push(await db.bulkAdd(o.collection, o.records)); break;
        case 'bulkPut':     results.push(await db.bulkPut(o.collection, o.records)); break;
        case 'clear':       results.push(await db.clear(o.collection)); break;
        case 'clearMany':   await db.clearMany(o.collections); results.push(true); break;
        case 'deleteWhere': results.push(await db.deleteWhere(o.collection, o.criteria)); break;
        default: throw Object.assign(new Error(`operazione sconosciuta: ${o.op}`), { status: 400 });
      }
    }
  }, originOf(req));
  res.json({ ok: true, results });
}));

/* ── I CODICI CHE ARRIVANO NEL CORPO DI UN'OPERAZIONE ──────────────────

   Un codice scritto DENTRO UN RECORD viene maiuscolato prima di essere
   salvato (`normalizza`, in `lib/schema.js`), e un codice messo IN FONDO A
   UN PERCORSO viene maiuscolato prima di cercare la riga (`_legame`, in
   `lib/driver-base.js`). Un codice che arriva nel CORPO di una POST non
   passava da nessuna delle due, e qui sotto le righe si cercano con `===`:
   `123456#qwert` non trova `123456#QWERT`.

   COSA COSTAVA. Bastava una riga di merce scritta prima che la
   normalizzazione esistesse — in `pristino.db` ce n'e' una — e da quel
   momento quella riga non si poteva piu' ne' prelevare, ne' smaltire, ne'
   campionare: l'applicativo rispondeva «123456#qwert non e' piu' in
   MAG-ACC-03» di una riga che stava li'. E' la frase peggiore che potesse
   dire, perche' manda a cercare a scaffale una cosa che e' al suo posto.

   SI CONFRONTA NORMALIZZATO CON NORMALIZZATO. Non basta maiuscolare quel
   che arriva: un database che non e' mai stato riscritto da questa
   versione tiene ancora la chiave com'era, e maiuscolare solo un lato
   sposterebbe il buco dall'altra parte.

   Trovato il 04/09 dal banco a video, flusso `chiaviNonMaiuscole`. */
const codiceDalCorpo = (collezione, campo, valore) =>
  normalizzaCampo(collezione, campo, String(valore ?? '').trim());

/** La riga di giacenza con quella chiave, guardando i due lati con lo
    stesso metro.

    2.37 — E FRA PIU' RIGHE, PRIMA QUELLA SCIOLTA.

    Un vano puo' portare tre bancali dello stesso lotto piu' dei colli a
    terra: quattro righe con la stessa chiave, e finche' qui si prendeva la
    prima, quale fosse dipendeva dall'ordine di caricamento del database. La
    regola e' quella degli spaiati applicata ai contenitori — si consuma quel
    che e' gia' aperto prima di aprire un imballo — ed e' la STESSA che
    applica il client in `modules/righeVano.ts`. Se divergessero, quale
    bancale cala dipenderebbe da chi ha risposto per primo. */
const sciolta = (r) => !String(r?.udc_id ?? '').trim();
const rigaConChiave = (righe, item_key) => {
  const mie = righe.filter((r) => r.item_key === item_key
    || codiceDalCorpo('inventory', 'item_key', r.item_key) === item_key);
  return mie.find(sciolta) || mie[0] || undefined;
};

app.post('/api/op/removeItem', wrap(async (req, res) => {
  const { qty, qty_uom, qty_uom_before, packs_out, packs_before } = req.body || {};
  const location_code = codiceDalCorpo('inventory', 'location_code', req.body?.location_code);
  const item_key = codiceDalCorpo('inventory', 'item_key', req.body?.item_key);
  const n = Number(qty);
  assertPacksOut(packs_out);
  /* 1.8 — con l'elenco la quantita' in colli e' una conseguenza, e puo' essere
     zero: un prelievo che apre un collo senza svuotarlo non toglie colli. */
  if (!location_code || !item_key || (packs_out === undefined && (!Number.isFinite(n) || n < 1)))
    throw Object.assign(new Error('servono location_code, item_key e una quantita\' valida'), { status: 400 });

  const out = await db.transaction(['inventory'], async () => {
    const rows = await db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rigaConChiave(rows, item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });

    const colli = uscitaColli(item, packs_out, packs_before);
    const have = colli ? colli.qtyBefore : (item.qty || 1);
    const usciti = colli ? colli.qtyBefore - colli.qtyAfter : n;
    if (!colli && n > have)
      throw Object.assign(new Error(`In ${location_code} restano ${have} colli: un altro terminale ne ha gia' presi`), { status: 409 });

    const after = have - usciti;
    const snapshot = { ...item };
    const um = colli ? colli.um : scalaUom(item, qty_uom, qty_uom_before, after <= 0);
    const conti = um === null ? {}
      : { _qty_uom_before: um.prima, _qty_uom_delta: um.delta, _qty_uom_after: um.dopo };

    if (colli ? colli.tutto : after <= 0) {
      await db.delete('inventory', item._id);
      return { ...snapshot, _mode: 'full', _qty_before: have, _qty_delta: -usciti, _qty_after: 0, ...conti };
    }
    item.qty = after;
    if (um !== null) item.qty_uom = um.dopo;
    if (colli) item.packs = colli.rimasti;
    item.last_updated_at = Date.now();
    await db.put('inventory', item);
    return { ...snapshot, qty: after, ...(um === null ? {} : { qty_uom: um.dopo }),
             ...(colli ? { packs: colli.rimasti } : {}),
             _mode: 'partial', _qty_before: have, _qty_delta: -usciti, _qty_after: after, ...conti };
  }, originOf(req));

  res.json(out);
}));

/* 1.4.2.1 — IL CAMPIONAMENTO: i colli non calano, cala la quantita' dentro.
   Ha una rotta sua e non un `qty: 0` su removeItem, perche' quella rotta ha
   una guardia che rifiuta le quantita' sotto l'uno — e quella guardia e' la
   ragione per cui removeItem non fa danni. Non la si allarga per far posto a
   un caso che significa un'altra cosa.

   Come ovunque, il saldo di partenza si legge dalla RIGA: `qty_uom_before`
   e' solo il seme per la riga che un `qty_uom` non lo ha mai avuto. */
app.post('/api/op/sampleItem', wrap(async (req, res) => {
  const { qty_uom, qty_uom_before, packs_out } = req.body || {};
  const location_code = codiceDalCorpo('inventory', 'location_code', req.body?.location_code);
  const item_key = codiceDalCorpo('inventory', 'item_key', req.body?.item_key);
  const n = arrotondaUom(qty_uom);

  /* 1.8.4 — DA QUALE COLLO ESCE IL CAMPIONE.
     Fino alla 1.8.3 questa rotta scalava `qty_uom` e lasciava `packs` com'era.
     Su una riga a colli dichiarati l'elenco continuava a sommare il totale di
     prima, e siccome dove c'e' l'elenco COMANDA l'elenco, il campione spariva
     alla lettura dopo: cinquanta grammi usciti dal magazzino e nessuno che se
     ne accorgesse. E' la forma dell'incoerenza vista al banco il 18/08 —
     colli per 101 e qty_uom 81.

     Un campione esce da UN collo, quello che l'operatore ha in mano, e la sua
     misura fa parte della richiesta come per ogni altra uscita. */
  const campione = packs_out === undefined ? null : leggiUscite(packs_out);
  if (packs_out !== undefined && (!campione || campione.length !== 1)) {
    throw Object.assign(new Error('un campione esce da un collo solo: serve una misura sola'), { status: 400 });
  }
  if (!location_code || !item_key || (!campione && (n === null || n <= 0)))
    throw Object.assign(new Error('servono location_code, item_key e una quantita\' di campione valida'), { status: 400 });

  const out = await db.transaction(['inventory'], async () => {
    const rows = await db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rigaConChiave(rows, item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });

    if (campione) {
      const elenco = leggiPacks(item.packs);
      if (!elenco) throw Object.assign(new Error(`${item_key}: la riga non porta l'elenco dei colli`), { status: 409 });
      const { da, q } = campione[0];
      const i = elenco.findIndex(v => v === da);
      if (i === -1) {
        throw Object.assign(new Error(`Il collo da ${da} non e' piu' su questa riga: il campione non puo' uscirne`), { status: 409 });
      }
      /* UN CAMPIONE VALE UN COLLO DI RESIDUO: svuotare un collo non e'
         campionare, e' prelevarlo. Questa rotta promette che i colli non
         calano, e una promessa con un'eccezione non e' una promessa. */
      if (q >= da) {
        throw Object.assign(new Error(`Un campione lascia sempre un residuo: per prendere tutto il collo da ${da} serve un prelievo`), { status: 409 });
      }
      const dopoElenco = elenco.slice();
      dopoElenco[i] = arrotondaUom(da - q);
      const primaUm = sommaPacks(elenco);
      const dopoUm = sommaPacks(dopoElenco);
      item.packs = dopoElenco;
      item.qty_uom = dopoUm;
      item.last_updated_at = Date.now();
      await db.put('inventory', item);
      return { ok: true, qty_uom_before: primaUm, qty_uom_after: dopoUm, qty_uom_delta: -q,
               qty: item.qty, packs: dopoElenco };
    }

    const prima = arrotondaUom(item.qty_uom) ?? arrotondaUom(qty_uom_before);
    if (prima === null)
      throw Object.assign(new Error(`${item_key}: nessuna quantita' in UM da cui prelevare il campione`), { status: 409 });
    if (n > prima)
      throw Object.assign(new Error(`Restano ${prima} UM: un campione da ${n} non ci sta`), { status: 409 });

    const dopo = arrotondaUom(prima - n);
    item.qty_uom = dopo;
    item.last_updated_at = Date.now();
    await db.put('inventory', item);
    /* `qty` non compare in questo oggetto, ed e' il punto: il collo resta. */
    return { ok: true, qty_uom_before: prima, qty_uom_after: dopo, qty_uom_delta: -n, qty: item.qty };
  }, originOf(req));

  res.json(out);
}));

/* 1.12 — L'UNITA' DI CARICO SI SPOSTA INTERA, IN UNA TRANSAZIONE SOLA.
   Un pallet che si muove porta con se' tutto quello che ha sopra: se le righe
   si riscrivessero una per una dal client, un errore a meta' lascerebbe
   mezza UDC in un vano e mezza nell'altro — e nessuno saprebbe quale meta'.
   Qui la riga dell'UDC e le righe di giacenza cambiano ubicazione insieme, o
   non cambia niente.

   IL CONTENUTO NON SI TOCCA: colli, quantita' ed elenco restano quelli. Uno
   spostamento non e' un prelievo, ed e' la ragione per cui questa rotta non
   ha ne' `qty` ne' `packs_out`.

   L'ubicazione di partenza NON e' un parametro: e' quella scritta sull'UDC.
   Chiederla al client vorrebbe dire fidarsi di due dati che possono
   divergere, e sceglierne uno a caso quando divergono. */
app.post('/api/op/moveUdc', wrap(async (req, res) => {
  const { movement } = req.body || {};
  const udc_id = codiceDalCorpo('udc', 'udc_id', req.body?.udc_id);
  const to = codiceDalCorpo('udc', 'location_code', req.body?.to);
  if (!udc_id || !to)
    throw Object.assign(new Error('servono udc_id e l\'ubicazione di destinazione'), { status: 400 });

  const out = await db.transaction(['udc', 'inventory', 'mov_log', 'meta'], async () => {
    const udc = await db.get('udc', udc_id);
    if (!udc) throw Object.assign(new Error(`${udc_id} non esiste`), { status: 404 });
    if (udc.status === 'shipped' || udc.status === 'empty')
      throw Object.assign(new Error(`${udc_id} e' ${udc.status}: non si sposta piu'`), { status: 409 });
    const da = udc.location_code || '';
    if (da === to)
      throw Object.assign(new Error(`${udc_id} e' gia' in ${to}`), { status: 409 });

    /* Le righe si prendono per `udc_id`, non per ubicazione: se una riga
       fosse rimasta indietro da uno spostamento non riuscito, e' proprio
       quella che deve raggiungere le altre. */
    const righe = await db.query('inventory', { criteria: { field: 'udc_id', op: 'equals', value: udc_id } });

    /* 2.37 — IL RIFIUTO CHE VIETAVA UNO SCAFFALE VERO SE N'E' ANDATO.

       Fin qui: portare un bancale in un vano dove la stessa merce sta gia'
       su un ALTRO bancale rispondeva 409. Tre pallet dello stesso prodotto
       su una campata sono la cosa piu' normale che ci sia, e il sistema li
       rifiutava. Andrea, il 09/09: «non dare un limite di UDC in una
       ubicazione, quel limite lo da' la realta'».

       Il problema che il rifiuto difendeva era vero — due righe con la
       stessa chiave lette con `find` danno un saldo che dipende dall'ordine
       di caricamento — ma la difesa vietava la realta'. Quel che identifica
       una riga non e' `(vano, merce)`: e' `(vano, merce, unita')`, dove
       «nessuna unita'» e' la merce sciolta a terra. Con `rigaConChiave` che
       sceglie per davvero e il client che somma tutte le righe
       (`modules/righeVano.ts`), l'ambiguita' non c'e' piu'. */
    const ora = Date.now();
    for (const r of righe) {
      r.location_code = to;
      /* `last_updated_at`, NON `updated_at` — vale per TUTTE le rotte che
         scrivono una giacenza, non solo per questa. Il campo della riga di
         giacenza si chiama `last_updated_at`: e' quello che `Giacenza`
         dichiara e quello che il client legge. Fino alla 2.1 `removeItem`,
         `sampleItem` e `commitPickStop` scrivevano `updated_at`, che nessuno
         legge: la riga tornava giusta perche' il client si riallinea sulla
         risposta del servizio, e intanto a database restava un secondo campo
         con una seconda data. Tredici righe della produzione se lo portano
         ancora dietro: le ripulisce `banco/campo-fantasma.cjs`, che si passa
         una volta sola e non e' codice dell'applicativo.
         `udc.updated_at`, qui sotto, e' un'altra entita' e un altro campo:
         quello e' il suo nome vero. */
      r.last_updated_at = ora;
      await db.put('inventory', r);
    }

    udc.location_code = to;
    udc.updated_at = ora;
    await db.put('udc', udc);

    /* 2.16 — voce 34 · LA MERCE SI NOMINA ANCHE QUANDO SI MUOVE IN BLOCCO.
       Fino alla 2.15 lo spostamento di un'unita' scriveva UNA riga sola, e
       quella riga non nominava ne' articolo ne' lotto: N partite cambiavano
       vano e il registro non diceva quali. Non e' un'etichetta storta, e' la
       firma GMP che manca — §8, il registro si tiene sei anni per dire chi ha
       mosso cosa.

       Le righe si scrivono QUI, dentro la transazione, perche' qui si sanno
       davvero: il client manda la riga del contenitore (causale `UDC`), il
       servizio aggiunge quelle della merce. `qty_before` e `qty_after` sono
       uguali di proposito — la quantita' non cambia, cambia il vano. */
    /* La firma e' una persona. `SERVIZIO` resta solo per la chiave di
       macchina, che una sigla non ce l'ha — voce 18, le firme orfane. */
    const firma = movement?.user || req.operatore?.initials || 'SERVIZIO';
    for (const r of righe) {
      const quanti = Number.isFinite(Number(r.qty)) ? Number(r.qty) : null;
      await db.add('mov_log', {
        ts: ora,
        type: 'MOVE',
        article_code: r.article_code || '',
        article_description: r.article_description || '',
        lot_code: r.lot_code || '',
        location_code: da,
        dest_location: to,
        user: firma,
        notes: `Spostata con l'unita' di carico ${udc_id}`,
        doc_ref: '',
        qty_before: quanti,
        qty_delta: 0,
        qty_after: quanti,
        qty_uom_delta: null,
        ...(r.uom ? { uom: r.uom } : {}),
      });
    }

    if (movement) await db.add('mov_log', { ...movement, ts: movement.ts || ora });
    return { ok: true, udc_id, from: da, to, righe: righe.length };
  }, originOf(req));

  res.json(out);
}));

app.post('/api/op/commitPickStop', wrap(async (req, res) => {
  const { qty, qty_uom, qty_uom_before, packs_out, packs_before, movement, session } = req.body || {};
  const location_code = codiceDalCorpo('inventory', 'location_code', req.body?.location_code);
  const item_key = codiceDalCorpo('inventory', 'item_key', req.body?.item_key);
  const n = Number(qty);
  assertPacksOut(packs_out);
  if (!location_code || !item_key || !session?.session_id
      || (packs_out === undefined && (!Number.isFinite(n) || n < 1)))
    throw Object.assign(new Error('parametri incompleti'), { status: 400 });

  const out = await db.transaction(['inventory', 'mov_log', 'pick_session', 'meta'], async () => {
    const rows = await db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rigaConChiave(rows, item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });
    const colli = uscitaColli(item, packs_out, packs_before);
    const have = colli ? colli.qtyBefore : (item.qty || 1);
    const usciti = colli ? colli.qtyBefore - colli.qtyAfter : n;
    if (!colli && n > have)
      throw Object.assign(new Error(`In ${location_code} restano ${have} colli`), { status: 409 });

    const after = have - usciti;
    const um = colli ? colli.um : scalaUom(item, qty_uom, qty_uom_before, after <= 0);
    if (colli ? colli.tutto : after <= 0) await db.delete('inventory', item._id);
    else {
      item.qty = after;
      if (um !== null) item.qty_uom = um.dopo;
      if (colli) item.packs = colli.rimasti;
      item.last_updated_at = Date.now();
      await db.put('inventory', item);
    }

    /* Il movimento porta il delta in UM insieme a quello in colli: il
       registro e' la sola cosa che, fra sei anni, dira' quanto e' uscito. */
    const mov = { ...movement, ts: movement?.ts || Date.now(),
                  qty_before: have, qty_delta: -usciti, qty_after: after,
                  ...(um === null ? {} : { qty_uom_delta: um.delta }) };
    const movId = await db.add('mov_log', mov);

    await db.put('pick_session', session);
    await db.put('meta', { key: 'lastModified', value: Date.now() });

    return { removed: { ...item, _mode: (colli ? colli.tutto : after <= 0) ? 'full' : 'partial',
                        _qty_before: have, _qty_delta: -usciti, _qty_after: after,
                        ...(um === null ? {}
                          : { _qty_uom_before: um.prima, _qty_uom_delta: um.delta, _qty_uom_after: um.dopo }) },
             movement_id: movId };
  }, originOf(req));

  res.json(out);
}));

/* ══ 2.19 · LE ETICHETTE SULLE ZEBRA IN RETE ══════════════════════════════
   © Andrea Sacchetti — Dietopack S.r.l.

   Un browser non apre un socket TCP, e la 9100 di una Zebra vuole
   esattamente quello. Le rotte stanno qui perche' il servizio e' l'unico
   pezzo che possa parlarle, e perche' serve la scrivania e l'MC9400 con lo
   stesso codice — vedi la testata di `lib/stampa-zebra.js`.

   IL CLIENT MANDA UN `printer_id` E UNA CHIAVE DI RECORD, NON UN'ETICHETTA.
   Il contenuto lo rilegge il servizio dal database, e sono due cose diverse:
   in regime GMP l'etichetta e' un documento, e un documento costruito dal
   browser si falsifica scrivendo in una console. L'indirizzo della stampante,
   per la stessa ragione, non viaggia mai nella richiesta.

   «INVIATA» NON E' «STAMPATA». La 9100 accetta i byte e chiude: carta
   finita, testina aperta e nastro esaurito passano tutti come successo. La
   risposta porta quindi DUE fatti separati — `inviata`, che e' certo, e
   `stato`, che e' quel che la macchina ha risposto a `~HQES` — e la maschera
   dice quale dei due sta mostrando. §8: un pallet senza etichetta e' un
   pallet che nessuno puo' scansionare, e un fallimento muto ne produce uno
   a ogni creazione finche' qualcuno non guarda il rotolo. */

/* Le stampanti e il layout vivono in `meta`, come `docConfig`: sono una
   politica di magazzino e cambiano senza che cambi la versione. */
const stampantiConfigurate = async () => {
  const rec = await db.get('meta', 'printers');
  return Array.isArray(rec?.value) ? rec.value : [];
};

const stampanteDetta = async (printer_id) => {
  const id = String(printer_id ?? '').trim();
  if (!id) throw Object.assign(new Error('Manca printer_id: non e\' detto su quale stampante'), { status: 400 });
  const trovata = (await stampantiConfigurate()).find((s) => String(s?.printer_id ?? '') === id);
  if (!trovata) {
    throw Object.assign(new Error(
      `La stampante ${id} non e' fra quelle configurate: si aggiunge in Configurazione -> Stampanti`),
      { status: 404 });
  }
  return trovata;
};

const layoutEtichetta = async () => {
  const rec = await db.get('meta', 'labelLayout');
  /* Nessun layout salvato non e' un errore: `zpl.leggiLayout` ripiega su
     quello di serie, che e' quel che vede una macchina appena installata. */
  return rec?.value || null;
};

/* 2.20 — il layout del BANCALE sta in una chiave sua. Due etichette che
   rispondono a domande diverse — una riga di giacenza, un bancale — non
   condividono una disposizione: i campi non sono gli stessi. */
const layoutEtichettaPf = async () => {
  const rec = await db.get('meta', 'labelLayoutPf');
  return rec?.value || null;
};

/* ── L'UNITA' DI MISURA DELLA RIGA ────────────────────────────────────────

   E' il pezzo di `Store.getUomConfig` che serve a un'etichetta: quello che
   sceglie la SIGLA. Il `per_collo` e i suoi ripieghi restano sul client —
   servono a dividere i colli, e un'etichetta non divide niente.

   La regola e' quella di `src/modules/misure.ts` e si porta dietro le sue
   due ragioni: `NR` di SAGE X3 e' `PZ` scritto in un'altra codifica (7.077
   articoli su 11.197, voce della 2.5), e un `uom` scritto e NON capito non
   ripiega su `unit` — chi ha compilato quella cella intendeva qualcosa, e
   indovinare al posto suo mette un'unita' sbagliata su della merce. */
const UOM_VALIDE = new Set(['PZ', 'MT', 'LT', 'KG', 'GR']);
const UOM_SINONIMI = { NR: 'PZ' };

/** `null` cella vuota · `undefined` c'e' scritto qualcosa di sconosciuto. */
const leggiUomStretta = (raw) => {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return null;
  if (UOM_VALIDE.has(v)) return v;
  return UOM_SINONIMI[v];
};

const uomDiRiga = async (article_code, lot_code) => {
  const lotti = await db.query('lots',
    { criteria: { field: 'article_code', op: 'equals', value: article_code } });
  const dalLotto = leggiUomStretta(
    lotti.find((l) => String(l?.lot_code ?? '') === String(lot_code))?.uom);
  if (dalLotto) return dalLotto;

  const arts = await db.query('articles',
    { criteria: { field: 'code', op: 'equals', value: article_code } });
  const art = arts[0];
  const propria = leggiUomStretta(art?.uom);
  if (propria === undefined) return null;
  return propria ?? leggiUomStretta(art?.unit) ?? null;
};

/* IL RIEPILOGO DI UN BANCALE, LETTO DAL DATABASE E NON DAL CLIENT — 2.20.
   Chi c'e' sopra, quanti colli, quante unita' di misura. E' la stessa
   lettura di `src/modules/bancale.ts`, e sta anche qui per la ragione per
   cui l'etichetta la costruisce il servizio: in regime GMP un'etichetta e'
   un documento, e un documento costruito dal browser si falsifica scrivendo
   in una console.

   LE UNITA' DIVERSE NON SI SOMMANO. 300 KG piu' 40 PZ fanno 340 di niente:
   il totale resta assente e la riga dell'etichetta esce vuota. */
const riepilogoBancale = async (udc) => {
  const righe = (await db.query('inventory',
    { criteria: { field: 'udc_id', op: 'equals', value: udc.udc_id } }))
    .filter((r) => Number(r?.qty) > 0);
  const chiavi = new Set(righe.map((r) => String(r.item_key ?? '')));
  const mono = chiavi.size === 1;
  const prima = righe[0] || {};
  let colli = 0, totaleUom = 0, uom = null, mista = false;
  for (const r of righe) {
    colli += Number(r.qty) || 0;
    const u = await uomDiRiga(r.article_code, r.lot_code);
    const q = Number(r.qty_uom);
    if (mista) continue;
    if (!u || !Number.isFinite(q)) { mista = true; continue; }
    if (uom && uom !== u) { mista = true; continue; }
    uom = u;
    totaleUom += q;
  }
  return {
    udc_id: udc.udc_id, mono, partite: chiavi.size,
    article_code: mono ? prima.article_code : null,
    article_description: mono ? prima.article_description : null,
    lot_code: mono ? prima.lot_code : null,
    expiry_date: mono ? prima.expiry_date : null,
    qty: colli,
    qty_uom: (mista || !uom) ? null : totaleUom,
    uom: mista ? null : uom,
    odp_num: udc.odp_num || '',
    location_code: udc.location_code || '',
  };
};

/* Chi ha stampato cosa, su quale macchina, e com'e' andata. NON va in
   `mov_log`, che registra i movimenti della merce: una ristampa non muove
   niente. Va nel registro del servizio, che dalla 2.18 e' il posto dove si
   rilegge cos'e' successo — e su un'etichetta la domanda «chi l'ha
   stampata» arriva prima o poi. */
const segnaStampa = (req, cosa, esito) => {
  const chi = req.operatore?.initials || 'SERVIZIO';
  registro.info('stampa.etichetta', `${chi} — ${cosa} — ${esito}`);
};

app.post('/api/op/stampaEtichetta', wrap(async (req, res) => {
  const { printer_id, tipo, item_key, location_code, udc_id, copie } = req.body || {};
  const rec = await stampanteDetta(printer_id);
  const quante = zebra.leggiCopie(copie);

  let inviata;
  let cosa;

  if (tipo === 'pf') {
    /* 2.20 — il bancale di prodotto finito. Come per gli altri due, quel che
       arriva dal client e' una CHIAVE: il record e le sue righe li rilegge
       il servizio, e da li' esce l'etichetta. */
    const id = String(udc_id ?? '').trim();
    const bancale = id ? await db.get('udc', id) : null;
    if (!bancale) throw Object.assign(new Error(`${id || 'bancale'} non esiste`), { status: 404 });
    const dati = await riepilogoBancale(bancale);
    cosa = `bancale ${bancale.udc_id} x${quante}`;
    inviata = await zebra.stampaBancale(rec, dati, await layoutEtichettaPf(), quante);

  } else if (tipo === 'udc') {
    const id = String(udc_id ?? '').trim();
    const udc = id ? await db.get('udc', id) : null;
    if (!udc) throw Object.assign(new Error(`${id || 'unita\' di carico'} non esiste`), { status: 404 });
    cosa = `UDC ${udc.udc_id} x${quante}`;
    inviata = await zebra.stampaUdc(rec, udc, quante);

  } else if (tipo === 'item') {
    const chiave = codiceDalCorpo('inventory', 'item_key', item_key);
    const dove = String(location_code ?? '').trim().toUpperCase();
    if (!chiave || !dove) {
      throw Object.assign(new Error('Per l\'etichetta della merce servono item_key e location_code'),
        { status: 400 });
    }
    /* La riga si cerca per chiave E per vano: la stessa merce puo' stare in
       due ubicazioni (voce 59), e stampare quella sbagliata vuol dire
       stampare un peso che non e' di questa. */
    const righe = await db.query('inventory',
      { criteria: { field: 'item_key', op: 'equals', value: chiave } });
    const riga = righe.find((r) => String(r?.location_code ?? '').toUpperCase() === dove);
    if (!riga) {
      throw Object.assign(new Error(`${chiave} non e' piu' in ${dove}: la merce e' stata mossa`),
        { status: 404 });
    }
    const dati = { ...riga, uom: await uomDiRiga(riga.article_code, riga.lot_code) };
    cosa = `${chiave} in ${dove} x${quante}`;
    inviata = await zebra.stampaMerce(rec, dati, await layoutEtichetta(), quante);

  } else {
    throw Object.assign(new Error('tipo dev\'essere «item», «udc» oppure «pf»'), { status: 400 });
  }

  /* Lo stato si chiede DOPO, e non fa fallire una stampa riuscita: una
     stampante che non risponde a `~HQES` e' quasi sempre un server di stampa
     che non conosce il comando, e l'etichetta e' uscita lo stesso. Quel che
     non si deve fare e' dire «stampata» quando si sa solo «inviata». */
  const stato = await zebra.statoStampante(rec);
  segnaStampa(req, cosa, `inviata a ${inviata.host}:${inviata.porta}`
    + (stato.noto ? (stato.errori ? ` — ERRORI: ${stato.dettagli.join(', ')}` : ' — stampante a posto')
                  : ' — stato sconosciuto'));
  res.json({ inviata: true, copie: quante, stampante: inviata.stampante, stato });
}));

app.post('/api/op/provaStampante', wrap(async (req, res) => {
  const rec = await stampanteDetta(req.body?.printer_id);
  const esito = await zebra.stampaProva(rec);
  segnaStampa(req, `prova su ${esito.stampante}`,
    esito.stato.noto ? (esito.stato.errori ? `ERRORI: ${esito.stato.dettagli.join(', ')}` : 'a posto')
                     : 'stato sconosciuto');
  res.json({ inviata: true, ...esito });
}));

/* ── 2.10 · UN PIN DI SEI CIFRE MERITA UN CONTO LENTO ─────────────────────
   SHA-256 e' fatto per essere veloce, ed e' il difetto: un milione di
   combinazioni — tutte quelle che sei cifre possono fare — cadono in meno di
   due secondi su una CPU sola. Misurato su questo codice: 204 ms.

   `scrypt` costa memoria e tempo a ogni singolo tentativo, per costruzione.
   Con i parametri qui sotto un tentativo sta intorno ai 50-100 ms, che per
   chi digita il PIN non si vede, e porta lo spazio intero da due secondi a
   una giornata di macchina.

   SI RESTA COMPATIBILI. Le impronte gia' scritte sono SHA-256, e nessuno
   conosce i PIN per riscriverle: il record dice con quale algoritmo e' stato
   fatto, `pin_algo`, e quando manca vuol dire `sha256` — cioe' tutto quello
   che c'era prima di questa versione. Al primo accesso riuscito l'impronta
   si riscrive in scrypt, e da li' in poi il record e' nuovo. Non c'e' una
   migrazione da lanciare: il PIN lo sa solo chi lo digita, e il momento in
   cui lo digita e' l'unico in cui si puo' ricalcolare.

   IL CLIENT NON SEGUE. Nel modo «da file» il database sta in IndexedDB e la
   verifica avviene nel browser, dove `crypto.subtle` non ha scrypt: quel
   modo resta a SHA-256, e la sua superficie e' un'altra — un browser solo,
   su una macchina sola, senza una rete da cui leggere le impronte. */
const SCRYPT = { N: 16384, r: 8, p: 1, lunghezza: 32 };

const hashPin = (pin, salt) =>
  crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');

const hashPinScrypt = (pin, salt) =>
  crypto.scryptSync(String(pin), String(salt), SCRYPT.lunghezza,
                    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');

/* L'algoritmo lo dichiara il record. Assente = com'era prima. */
const impronta = (pin, salt, algo) =>
  (algo === 'scrypt' ? hashPinScrypt(pin, salt) : hashPin(pin, salt));

const campiPin = (pin) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return { pin_salt: salt, pin_hash: hashPinScrypt(pin, salt),
           pin_algo: 'scrypt', pin_set_at: Date.now() };
};

/* ── 2.13 · IL CODICE DI RIPRISTINO, lato servizio ────────────────────────
   L'alfabeto e la forma sono quelli del client — Crockford base32, quattro
   gruppi da cinque — e devono restare gli stessi: un codice generato qui si
   digita di la'. La lettura riconduce I e L a 1 e O a 0 prima di misurare
   l'impronta, perche' un codice ricopiato a mano da un foglio confonde
   quelle tre e la via di fuga che non funziona non e' una via di fuga. */
const RIPRISTINO_ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RIPRISTINO_LUNGHEZZA = 20;
const RIPRISTINO_PER_GRUPPO = 5;

const nuovoCodiceRipristino = () => {
  const soglia = 256 - (256 % RIPRISTINO_ALFABETO.length);
  const scelte = [];
  while (scelte.length < RIPRISTINO_LUNGHEZZA) {
    for (const b of crypto.randomBytes(RIPRISTINO_LUNGHEZZA)) {
      if (b >= soglia) continue;
      scelte.push(RIPRISTINO_ALFABETO[b % RIPRISTINO_ALFABETO.length]);
      if (scelte.length === RIPRISTINO_LUNGHEZZA) break;
    }
  }
  const gruppi = [];
  for (let i = 0; i < RIPRISTINO_LUNGHEZZA; i += RIPRISTINO_PER_GRUPPO) {
    gruppi.push(scelte.slice(i, i + RIPRISTINO_PER_GRUPPO).join(''));
  }
  return gruppi.join('-');
};

const normalizzaRipristino = (v) => String(v ?? '')
  .toUpperCase().replace(/[\s-]+/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');

const campiRipristino = (codice) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return { rec_salt: salt, rec_hash: hashPinScrypt(normalizzaRipristino(codice), salt),
           rec_algo: 'scrypt', rec_set_at: Date.now() };
};

const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const tentativi = new Map();
const MAX_TENTATIVI = 5;
const ATTESA_MS = 60000;

const frenoControlla = (chiave) => {
  const t = tentativi.get(chiave);
  if (!t) return null;
  if (Date.now() > t.fino) { tentativi.delete(chiave); return null; }
  if (t.n >= MAX_TENTATIVI) return Math.ceil((t.fino - Date.now()) / 1000);
  return null;
};

const frenoSegna = (chiave, riuscito) => {
  if (riuscito) { tentativi.delete(chiave); return; }
  const t = tentativi.get(chiave) || { n: 0, fino: 0 };
  t.n++;
  t.fino = Date.now() + ATTESA_MS;
  tentativi.set(chiave, t);
};


/* ══ 2.11 · LA PORTA ══════════════════════════════════════════════════════ */

/* CHI SONO, SE SONO QUALCUNO. E' la prima domanda che il client fa: da qui
   decide se aprire la maschera dell'identificazione o andare a caricare. */
app.get('/api/auth/stato', wrap(async (req, res) => {
  const chi = chiSei(req);
  res.json({
    sessione: Boolean(chi),
    operatore: chi && !chi.macchina ? { op_id: chi.op_id, initials: chi.initials } : null,
    macchina: Boolean(chi?.macchina),
    primoAvvio: await finestraDiPrimoAvvio(),
  });
}));

/* L'ELENCO PER LA SCHERMATA DI IDENTIFICAZIONE, e nient'altro.
   Questa risponde SENZA sessione, e allora dice il minimo che serve a
   disegnare quella schermata: chi c'e', che carica ha, se un PIN ce l'ha.
   Non passa da `/api/c/operators`, che e' chiusa, e non e' un rimpiazzo: da
   qui non escono le date, le note, ne' i campi che una riga di operatore
   porta e che a quella maschera non servono.

   ── 2.18 · «IL MINIMO» ERA ANCORA TROPPO ────────────────────────────────
   Fino alla 2.17 usciva anche NOME e COGNOME di ogni operatore attivo, e
   `rec_set`. Chiunque fosse sulla rete otteneva senza autenticarsi
   l'elenco nominativo del personale di magazzino con i ruoli, e sapeva
   quali Admin avessero un codice di ripristino — cioe' una seconda via
   d'ingresso. E' la mappa che serve a scegliere il bersaglio giusto per un
   PIN di sei cifre, tanto piu' che il freno sui tentativi e' PER OPERATORE:
   con l'elenco in mano i tentativi utili si moltiplicano per quante righe
   ha l'elenco.

   ADESSO ESCE LA SIGLA, NON IL NOME. La sigla e' gia' stampata su ogni
   documento di magazzino e su ogni riga di registro: non e' un segreto, ed
   e' quello che l'operatore cerca nella lista. Nome e cognome arrivano DOPO
   l'ingresso, da `/api/c/operators`, che una sessione ce l'ha.

   `role` RESTA, e non e' una svista: la maschera del PIN smarrito deve
   elencare gli Admin, ed e' l'unica cosa che le serve.
   `rec_set` ESCE: quella maschera li elenca tutti e il servizio risponde al
   tentativo. Dire in anticipo chi ha la via di fuga non serve a chi la
   cerca e serve moltissimo a chi cerca un'altra cosa. */
app.get('/api/auth/operatori', wrap(async (req, res) => {
  const ops = await db.all('operators');
  res.json(ops
    .filter((o) => o.active !== false)
    .map((o) => ({
      op_id: o.op_id,
      initials: o.initials,
      role: o.role || 'operator',
      pin_set: Boolean(o.pin_hash && o.pin_salt),
    })));
}));

/* IL PIN EMETTE LA SESSIONE. Il freno sui tentativi e' lo stesso di
   `verifyPin` — cinque e poi un minuto di attesa — e vale per operatore. */
app.post('/api/auth/login', wrap(async (req, res) => {
  const { op_id, initials, pin } = req.body || {};
  if (!pin || (!op_id && !initials))
    throw Object.assign(new Error('servono il PIN e l\'operatore'), { status: 400 });

  const chiave = String(op_id || initials).toUpperCase();
  const attesa = frenoControlla(chiave);
  if (attesa) {
    registro.avviso('auth.freno', `${chiave} bloccato per ${attesa}s dopo ${MAX_TENTATIVI} tentativi`);
    return res.status(429).json({ ok: false, blocked: true, retryAfter: attesa,
      error: `Troppi tentativi: riprovare fra ${attesa} secondi` });
  }

  let op = null;
  if (op_id) op = await db.get('operators', op_id);
  else {
    const righe = await db.query('operators', { criteria: { field: 'initials', op: 'equals', value: String(initials).toUpperCase() } });
    op = righe[0] || null;
  }

  if (!op || !op.pin_hash || !op.pin_salt || op.active === false) {
    frenoSegna(chiave, false);
    return res.status(401).json({ ok: false, error: 'Operatore o PIN non validi' });
  }

  const buono = equal(impronta(String(pin), op.pin_salt, op.pin_algo), op.pin_hash);
  frenoSegna(chiave, buono);
  if (!buono) return res.status(401).json({ ok: false, error: 'Operatore o PIN non validi' });

  /* L'impronta vecchia si rifa' qui, come in `verifyPin`: e' l'unico istante
     in cui il PIN esiste in chiaro dentro il servizio — 2.10. */
  if (op.pin_algo !== 'scrypt') {
    try {
      const sale = crypto.randomBytes(16).toString('hex');
      await db.update('operators', op.op_id, {
        pin_salt: sale, pin_hash: hashPinScrypt(String(pin), sale),
        pin_algo: 'scrypt', updated_at: Date.now(),
      });
    } catch (err) {
      console.error('[pathfinder] impronta del PIN non rinnovata:', err.message);
    }
  }

  /* 32 byte di casualita' vera. Non deriva dal PIN, dalla sigla o dall'ora:
     un token che si puo' indovinare e' una porta che si puo' aprire. */
  const token = crypto.randomBytes(32).toString('hex');
  const adesso = Date.now();
  sessioni.set(token, { op_id: op.op_id, initials: op.initials, creata: adesso, ultimoUso: adesso });
  scriviCookie(res, token);

  res.json({ ok: true, operatore: senzaPin(op) });
}));

/* CHI SMONTA CHIUDE LA SUA SESSIONE, e non aspetta il riavvio del servizio.
   Risponde `ok` anche se non c'era niente da chiudere: «esci» e' un gesto
   che non puo' fallire. */
app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = leggiCookie(req, NOME_COOKIE);
  if (token) sessioni.delete(token);
  cancellaCookie(res);
  res.json({ ok: true });
}));

app.post('/api/op/verifyPin', wrap(async (req, res) => {
  const { op_id, initials, pin } = req.body || {};
  if (!pin || (!op_id && !initials))
    throw Object.assign(new Error('servono il PIN e l\'operatore'), { status: 400 });

  const chiave = String(op_id || initials).toUpperCase();
  const attesa = frenoControlla(chiave);
  if (attesa) {
    registro.avviso('auth.freno', `${chiave} bloccato per ${attesa}s dopo ${MAX_TENTATIVI} tentativi`);
    return res.status(429).json({ ok: false, blocked: true, retryAfter: attesa,
      error: `Troppi tentativi: riprovare fra ${attesa} secondi` });
  }

  let op = null;
  if (op_id) op = await db.get('operators', op_id);
  else {
    const rows = await db.query('operators', { criteria: { field: 'initials', op: 'equals', value: String(initials).toUpperCase() } });
    op = rows[0] || null;
  }

  if (!op || !op.pin_hash || !op.pin_salt) {
    frenoSegna(chiave, false);
    return res.json({ ok: false, reason: 'operatore senza PIN impostato' });
  }

  const ok = equal(impronta(String(pin), op.pin_salt, op.pin_algo), op.pin_hash);
  frenoSegna(chiave, ok);

  /* L'IMPRONTA VECCHIA SI RIFA' QUI, e non altrove: e' l'unico istante in cui
     il PIN esiste in chiaro dentro il servizio. Se la riscrittura fallisce si
     tace e si risponde lo stesso — chi sta entrando in magazzino non deve
     sapere che una migrazione non e' andata, e al prossimo accesso ci si
     riprova. */
  if (ok && op.pin_algo !== 'scrypt') {
    try {
      const salt = crypto.randomBytes(16).toString('hex');
      await db.update('operators', op.op_id, {
        pin_salt: salt,
        pin_hash: hashPinScrypt(String(pin), salt),
        pin_algo: 'scrypt',
        updated_at: Date.now(),
      });
    } catch (err) {
      console.error('[pathfinder] impronta del PIN non rinnovata:', err.message);
    }
  }

  res.json({ ok });
}));

app.post('/api/op/hashPin', wrap(async (req, res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{6}$/.test(pin))
    throw Object.assign(new Error('serve un PIN di sei cifre'), { status: 400 });
  res.json(campiPin(pin));
}));

/* 2.13 — l'impronta del codice di ripristino. Il codice lo genera il client
   perche' e' li' che va MOSTRATO, e mostrato una volta sola: qui se ne
   prende l'impronta e nient'altro. La rotta sta sotto `/op/`, quindi vuole
   una sessione, e la scrittura che ne segue passa dal guardiano dei ruoli —
   e' li' che si controlla che chi lo sta facendo sia un Admin. */
app.post('/api/op/hashRecovery', wrap(async (req, res) => {
  const codice = normalizzaRipristino(req.body?.codice);
  if (codice.length !== RIPRISTINO_LUNGHEZZA)
    throw Object.assign(new Error(`serve un codice di ${RIPRISTINO_LUNGHEZZA} caratteri`), { status: 400 });
  res.json(campiRipristino(codice));
}));

/* ══ 2.13 · IL RINNOVO DEL PIN, E PERCHE' HA UNA ROTTA SUA ════════════════
   Un Team Leader sulla collezione `operators` non scrive niente — glielo
   impedisce il guardiano dei ruoli, ed e' giusto cosi': non deve poter
   nominare nessuno. Ma il PIN degli operatori lo rinnova lui, ed e' il
   mestiere per cui la carica esiste. Le due cose stanno insieme solo se il
   rinnovo smette di essere una scrittura generica e diventa un gesto che il
   servizio conosce: qui dentro si verifica chi autorizza, si verifica su
   chi, e si scrive quel solo campo.

   LA GERARCHIA, in una riga: l'Admin arriva su chiunque, il Team Leader si
   ferma sotto l'Admin. Chi rinnova un PIN diventa quella persona al
   prossimo accesso — un Team Leader che rinnova il PIN dell'Admin si e'
   appena promosso, e la scala non serve piu' a niente.                   */
app.post('/api/op/rinnovaPin', wrap(async (req, res) => {
  const { op_id, autorizzatore_id, pin_autorizzatore, nuovo_pin } = req.body || {};
  if (!op_id || !autorizzatore_id || !pin_autorizzatore || !nuovo_pin)
    throw Object.assign(new Error('servono l’operatore, chi autorizza, il suo PIN e il PIN nuovo'), { status: 400 });
  if (!/^\d{6}$/.test(String(nuovo_pin)))
    throw Object.assign(new Error('il PIN nuovo deve essere di sei cifre'), { status: 400 });

  const chiave = `rinnovo:${String(autorizzatore_id).toUpperCase()}`;
  const attesa = frenoControlla(chiave);
  if (attesa) {
    registro.avviso('auth.freno', `${chiave} bloccato per ${attesa}s dopo ${MAX_TENTATIVI} tentativi`);
    return res.status(429).json({ ok: false, blocked: true, retryAfter: attesa,
      error: `Troppi tentativi: riprovare fra ${attesa} secondi` });
  }

  const [bersaglio, chi] = await Promise.all([
    db.get('operators', op_id),
    db.get('operators', autorizzatore_id),
  ]);
  if (!bersaglio) throw Object.assign(new Error('operatore non trovato'), { status: 404 });

  /* Chi autorizza dev'essere in servizio e avere la carica GIUSTA PER QUEL
     BERSAGLIO: non «un grado alto», ma un grado alto abbastanza. */
  const ruolo = chi?.role || 'operator';
  const abbastanza = chi && chi.active !== false
    && (ruolo === 'admin' || (ruolo === 'leader' && bersaglio.role !== 'admin'));
  if (!abbastanza) {
    frenoSegna(chiave, false);
    return res.status(403).json({ ok: false, error: bersaglio.role === 'admin'
      ? 'Il PIN di un Admin lo rinnova soltanto un altro Admin.'
      : 'Serve un Team Leader o un Admin per autorizzare il rinnovo.' });
  }

  if (!chi.pin_hash || !chi.pin_salt
      || !equal(impronta(String(pin_autorizzatore), chi.pin_salt, chi.pin_algo), chi.pin_hash)) {
    frenoSegna(chiave, false);
    return res.status(401).json({ ok: false, error: 'PIN di chi autorizza non corretto.' });
  }
  frenoSegna(chiave, true);

  await db.update('operators', op_id, { ...campiPin(String(nuovo_pin)), updated_at: Date.now() });
  scordaPrimoAvvio();
  res.json({ ok: true });
}));

/* ══ 2.13 · LA VIA DI FUGA ════════════════════════════════════════════════
   Sta sotto `/auth/`, e quindi NON passa dal guardiano della sessione: e'
   tutto il suo senso. La si chiama quando la sessione non c'e' e non si
   puo' ottenere — il PIN dell'Admin e' perso, e sopra l'Admin non c'e'
   nessuno che possa rinnovarglielo.

   NON APRE L'APPLICATIVO CON UN CODICE: apre la riscrittura del PIN. Il
   codice si consuma nell'uso e al posto suo ne nasce subito un altro, che
   la risposta porta in chiaro una volta e mai piu'. Chi rientra esce di qui
   con un PIN nuovo, una sessione, e la via di fuga ancora in mano.

   VALE SOLO PER GLI ADMIN, perche' solo loro non hanno nessuno sopra. Il
   freno e' quello del PIN — cinque tentativi e un minuto — e su cento bit
   di codice non e' il freno a fare il lavoro: e' la lunghezza.          */
app.post('/api/auth/recupero', wrap(async (req, res) => {
  const { op_id, codice, nuovo_pin } = req.body || {};
  if (!op_id || !codice || !nuovo_pin)
    throw Object.assign(new Error('servono l’Admin, il codice e il PIN nuovo'), { status: 400 });
  if (!/^\d{6}$/.test(String(nuovo_pin)))
    throw Object.assign(new Error('il PIN nuovo deve essere di sei cifre'), { status: 400 });

  const chiave = `recupero:${String(op_id).toUpperCase()}`;
  const attesa = frenoControlla(chiave);
  if (attesa) {
    registro.avviso('auth.freno', `${chiave} bloccato per ${attesa}s dopo ${MAX_TENTATIVI} tentativi`);
    return res.status(429).json({ ok: false, blocked: true, retryAfter: attesa,
      error: `Troppi tentativi: riprovare fra ${attesa} secondi` });
  }

  const op = await db.get('operators', op_id);
  /* Una sola risposta per «non esiste», «non e' Admin», «e' disattivato» e
     «codice sbagliato»: distinguerle direbbe a chi prova quale delle quattro
     ha sbagliato, e le prime tre si scoprirebbero senza nemmeno un codice. */
  const rifiuta = () => {
    frenoSegna(chiave, false);
    return res.status(401).json({ ok: false, error: 'Codice di ripristino non valido.' });
  };
  if (!op || op.active === false || op.role !== 'admin') return rifiuta();
  if (!op.rec_hash || !op.rec_salt) return rifiuta();
  if (!equal(impronta(normalizzaRipristino(codice), op.rec_salt, op.rec_algo), op.rec_hash)) return rifiuta();
  frenoSegna(chiave, true);

  /* PIN nuovo e codice nuovo nella stessa scrittura: se andasse a buon fine
     solo la prima, l'Admin rientrerebbe senza piu' via di fuga e senza
     saperlo. */
  const nuovoCodice = nuovoCodiceRipristino();
  await db.update('operators', op.op_id, {
    ...campiPin(String(nuovo_pin)),
    ...campiRipristino(nuovoCodice),
    updated_at: Date.now(),
  });
  scordaPrimoAvvio();

  const token = crypto.randomBytes(32).toString('hex');
  const adesso = Date.now();
  sessioni.set(token, { op_id: op.op_id, initials: op.initials, creata: adesso, ultimoUso: adesso });
  scriviCookie(res, token);

  res.json({ ok: true, nuovoCodice, operatore: senzaPin({ ...op, role: 'admin' }) });
}));

app.get('/api/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const me = req.query.client || null;
  res.write(`event: hello\ndata: ${JSON.stringify({ rev: await db.currentRevision(), version: VERSION })}\n\n`);

  const off = db.onChange((ev) => {
    if (me && ev.origin && ev.origin === me) return;   // non ci si avvisa da soli
    res.write(`event: change\ndata: ${JSON.stringify(ev)}\n\n`);
  });

  const beat = setInterval(() => { try { res.write(': beat\n\n'); } catch {} }, 20000);
  req.on('close', () => { off(); clearInterval(beat); });
});

/* IL BACKUP SI CHIAMA COL GIORNO DI CHI LO GUARDA, NON COL GIORNO UTC — 2.6.

   `toISOString()` scrive in UTC. Alle 01:52 del 26/08, ora di Roma, sono le
   23:52 del 25 in UTC: il file nasceva `pathfinder-2026-08-25.db`, cioe' con
   LO STESSO NOME del backup serale delle 20:00 — e glielo scriveva sopra.
   Il caso non e' di scuola: la copia che si prende prima di installare si
   prende a fine turno, ed e' esattamente la copia che serve se qualcosa va
   storto. Misurato il 26/08 prendendo una copia a mano.

   Il giorno e' quello locale, perche' «il backup del 25» per chi lavora e'
   quello di quel turno; e se un file con quel nome c'e' gia' si aggiunge
   l'ora, invece di sostituirlo. Un backup che ne cancella un altro non e'
   un backup. */
const nomeBackup = (dir, est, ora = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  const giorno = `${ora.getFullYear()}-${p(ora.getMonth() + 1)}-${p(ora.getDate())}`;
  const primo = path.join(dir, `pathfinder-${giorno}${est}`);
  if (!fs.existsSync(primo)) return primo;
  return path.join(dir, `pathfinder-${giorno}-${p(ora.getHours())}${p(ora.getMinutes())}${est}`);
};

/* ── 2.10 · DOVE PUO' FINIRE UN BACKUP ────────────────────────────────────
   `dir` arriva dal corpo della richiesta, e finche' nessuno l'ha guardata
   arrivava DAVUNQUE: una richiesta sola scriveva l'intero database in un
   percorso a scelta di chi chiamava. Il processo gira come SYSTEM, e un
   percorso di rete — una condivisione su un'altra macchina — faceva uscire
   anagrafica, movimenti e operatori dall'azienda con un `curl`.

   NON SI STRINGE A UNA CARTELLA SOLA. Il backup serale scrive nella cartella
   di backup dell'installazione, l'installer mette da parte il database prima
   di aggiornare, i collaudi scrivono in una cartella temporanea e il banco
   nella propria: erano tutti legittimi, e una radice sola li avrebbe rotti
   tutti e quattro. Si vietano invece le tre forme che nessun chiamante
   legittimo usa:

   1. I PERCORSI DI RETE — UNC e barre doppie. E' la via dell'esfiltrazione,
      e nessuno fa un backup su un'altra macchina passando da questa rotta.
   2. LE CARTELLE DI SISTEMA di Windows, dove un file scritto da SYSTEM e' un
      problema piu' grosso di un backup fuori posto.
   3. UN PERCORSO RELATIVO, che si risolverebbe sulla cartella di lavoro del
      servizio — che nessuno sa quale sia, ed e' gia' costata una versione.

   `PATHFINDER_BACKUP_ROOTS` stringe ancora, quando c'e': solo dentro quelle
   radici, separate da `;`. L'installazione la imposta, il banco no, e chi non
   la imposta resta con le tre regole qui sopra. */
const RADICI_BACKUP = (process.env.PATHFINDER_BACKUP_ROOTS || '')
  .split(';').map((s) => s.trim()).filter(Boolean).map((s) => path.resolve(s));

const CARTELLE_DI_SISTEMA = [
  process.env.SystemRoot || 'C:\\Windows',
  process.env.ProgramFiles || 'C:\\Program Files',
  process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
].map((s) => path.resolve(s));

/* `path.relative` risponde con un percorso che risale — `..` — quando il
   figlio sta fuori. E' il modo di chiederlo che regge anche i `..` scritti
   nel mezzo, che un confronto di stringhe si lascerebbe sfuggire. */
const dentro = (figlio, padre) => {
  const r = path.relative(padre, figlio);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

const controllaCartellaBackup = (dir) => {
  const grezzo = String(dir);
  const rifiuta = (m) => { throw Object.assign(new Error(m), { status: 400 }); };

  if (grezzo.startsWith('\\\\') || grezzo.startsWith('//'))
    rifiuta('Un backup non si scrive su un percorso di rete.');
  if (!path.isAbsolute(grezzo))
    rifiuta('La cartella di backup deve essere un percorso assoluto.');

  /* SU WINDOWS «ASSOLUTO» NON VUOL DIRE «SO SU CHE DISCO».
     `\qualcosa` passa `path.isAbsolute` — e' assoluto rispetto alla RADICE
     DEL DISCO CORRENTE, che e' quello della cartella di lavoro del processo:
     un dato che nessuno sa e che cambia col modo in cui il servizio e' stato
     lanciato. Trovato verificando la consegna della 2.10, e trovato per
     sbaglio: una prova scritta male ha inviato `\altra-macchinacondivisione`
     al posto del percorso di rete che voleva provare, il controllo di sopra
     non e' scattato — giustamente, quello non e' UNC — e il servizio ha
     scritto 393 kB di database nella RADICE DI `C:`.

     E' la stessa ambiguita' della terza regola qui sopra, in un vestito che
     la prima stesura non aveva riconosciuto: si pretende la lettera. */
  if (path.sep === '\\' && !/^[A-Za-z]:[\\/]/.test(grezzo))
    rifiuta('La cartella di backup deve dire su quale disco sta, per esempio C:\\Pathfinder\\backup.');

  const pieno = path.resolve(grezzo);
  for (const v of CARTELLE_DI_SISTEMA) {
    if (dentro(pieno, v)) rifiuta(`Un backup non si scrive dentro ${v}.`);
  }
  if (RADICI_BACKUP.length && !RADICI_BACKUP.some((r) => dentro(pieno, r)))
    rifiuta(`Cartella fuori dalle radici consentite: ${RADICI_BACKUP.join(' ; ')}`);

  return pieno;
};


app.post('/api/backup', wrap(async (req, res) => {
  const dir = controllaCartellaBackup(req.body?.dir || path.join(__dirname, 'data', 'backup'));
  fs.mkdirSync(dir, { recursive: true });
  /* L'ESTENSIONE LA DICE IL DRIVER, non questa rotta.
     Su SQLite la copia e' un `.db`; su PostgreSQL e' un `.dump` scritto da
     `pg_dump`. Chi chiama — `backup-serale.ps1` — non deve sapere quale dei
     due c'e' dietro: legge il nome dalla risposta, e ci scrive la riga di
     registro senza guardare l'estensione. */
  const dest = nomeBackup(dir, db.estensioneBackup);
  /* `await`, non `.then`: cosi' l'errore passa da `wrap`, che rispetta lo
     stato dichiarato dall'eccezione. */
  await db.backupTo(dest);
  const byte = fs.statSync(dest).size;
  registro.info('backup.fatto', `${path.basename(dest)} — ${byte} byte`);
  res.json({ ok: true, file: dest, bytes: byte });
}));

/* ═══ 2.32 · GLI ALLEGATI: L'XLS CHE IL COMPITO NON PUO' PORTARSI ═══════
   Un'attivita' di prelievo ODP nasce allegando la distinta. Il file non puo'
   stare dentro il compito: un ODP grande e' centinaia di kilobyte, e un
   record di `tasks` viene riletto a ogni caricamento della coda da ogni
   terminale del magazzino. Sta su disco, accanto al database, e il compito
   ne porta il solo identificativo.

   PERCHE' NON SI CONSERVANO LE RIGHE GIA' LETTE, che sarebbe piu' semplice:
   quando qualcosa non torna, la domanda e' sempre «che cosa c'era scritto
   nel file». Le righe lette sono gia' un'interpretazione — il parser sceglie
   le colonne, converte le date, arrotonda le quantita' — e conservare
   l'interpretazione al posto della fonte vuol dire non poter piu' rispondere.

   L'IDENTIFICATIVO LO FA IL SERVIZIO, e non arriva dalla richiesta. Un nome
   scelto dal client e' un percorso scelto dal client: `../../` dentro un
   nome di file scrive dove non deve. Qui il nome e' esadecimale e nient'altro,
   e il controllo lo rifa' anche in lettura — chi passa di li' con una chiave
   inventata riceve un 400, non un file di sistema.

   NIENTE MULTIPART. Il corpo arriva come base64 dentro il JSON che i due
   parser gia' montati sanno leggere: aggiungere `multer` per una rotta sola
   vorrebbe dire una dipendenza in piu' su una macchina di magazzino, e
   questo progetto quella strada non la prende (vedi `crea-certificato.ps1`
   e il perche' di `openssl`). */
const DIR_ALLEGATI = path.join(path.dirname(DB_FILE), 'allegati');
const ALLEGATO_MAX = 8 * 1024 * 1024;
const NOME_ALLEGATO = /^[0-9a-f]{32}\.xlsx$/;

app.post('/api/allegati', wrap(async (req, res) => {
  const b64 = String(req.body?.contenuto || '');
  if (!b64) throw Object.assign(new Error('Nessun contenuto'), { status: 400 });
  const byte = Buffer.from(b64, 'base64');
  if (!byte.length) throw Object.assign(new Error('Contenuto illeggibile'), { status: 400 });
  if (byte.length > ALLEGATO_MAX) {
    throw Object.assign(new Error(`Il file supera ${Math.round(ALLEGATO_MAX / 1024 / 1024)} MB`), { status: 413 });
  }
  /* UN .xlsx E' UNO ZIP, e uno zip comincia per `PK`. Non e' una convalida
     del formato — quella la fa il parser quando il file si apre — ma
     impedisce che un allegato che non e' nemmeno un archivio resti li' a
     far fallire una presa in carico fra tre giorni. */
  if (byte[0] !== 0x50 || byte[1] !== 0x4b) {
    throw Object.assign(new Error('Non sembra un file .xlsx'), { status: 400 });
  }
  fs.mkdirSync(DIR_ALLEGATI, { recursive: true });
  const nome = crypto.randomBytes(16).toString('hex') + '.xlsx';
  fs.writeFileSync(path.join(DIR_ALLEGATI, nome), byte);
  registro.info('allegato.salvato', `${nome} — ${byte.length} byte`);
  res.json({ ok: true, id: nome, bytes: byte.length });
}));

app.get('/api/allegati/:id', wrap(async (req, res) => {
  const id = String(req.params.id || '');
  if (!NOME_ALLEGATO.test(id)) {
    throw Object.assign(new Error('Identificativo non valido'), { status: 400 });
  }
  const file = path.join(DIR_ALLEGATI, id);
  if (!fs.existsSync(file)) {
    throw Object.assign(new Error('Allegato non trovato'), { status: 404 });
  }
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Cache-Control', 'no-store');
  res.send(fs.readFileSync(file));
}));

const noCache = (res) => res.set('Cache-Control', 'no-cache');

/* Gli assets portano l'impronta nel nome: a parita' di nome non cambiano
   mai, e il terminale non ha ragione di richiederli una seconda volta.
   `index.html` invece resta `no-cache`, perche' e' lui che li nomina: un
   indice vecchio in cache chiederebbe file che non esistono piu'.
   Invertire questi due e' il difetto peggiore possibile. */
const PER_SEMPRE = 'public, max-age=31536000, immutable';

/* Il `.gz` lo scrive la build, una volta sola e al massimo livello: questi
   file non cambiano, comprimerli a ogni richiesta sarebbe CPU spesa per
   riottenere lo stesso byte. Chi non dichiara di accettare gzip riceve il
   file in chiaro, che resta li' accanto — nessun terminale resta fuori. */
const invia = (req, res, assoluto, cache) => {
  res.set('Cache-Control', cache);
  res.set('Vary', 'Accept-Encoding');
  const gz = assoluto + '.gz';
  if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && fs.existsSync(gz)) {
    res.type(path.extname(assoluto) || 'application/octet-stream');
    res.set('Content-Encoding', 'gzip');
    return res.sendFile(gz);
  }
  res.sendFile(assoluto);
};

let erroreManifesto = null;

const leggiManifesto = () => {
  if (!APP_DIR) return null;
  try {
    /* Il BOM va tolto PRIMA di `JSON.parse`, che su di lui lancia. Non e' un
       caso di scuola: `installa-versione.ps1` genera il manifesto di una
       consegna avvolta, e in PowerShell 5.1 `Out-File -Encoding utf8` scrive
       UTF-8 CON BOM. Senza questa riga, dopo un ritorno indietro
       `/api/app-info` rispondeva versione e impronta nulle — cioe' proprio
       il numero su cui si verifica un'installazione. Trovato al banco, con
       tutti i collaudi verdi. */
    const grezzo = fs.readFileSync(path.join(APP_DIR, 'manifest.json'), 'utf8');
    erroreManifesto = null;
    return JSON.parse(grezzo.replace(/^﻿/, ''));
  } catch (e) {
    /* L'errore si TIENE, e `/api/app-info` lo dice. Il 17/08 il servizio
       rispondeva versione e impronta nulle e non c'era modo di sapere perche':
       il processo gira come SYSTEM, la sua console non la legge nessuno, e da
       una shell qualunque lo stesso percorso si apriva senza problemi. Un
       manifesto illeggibile e' il modo in cui si scopre che l'applicativo non
       verra' servito, e deve dire di cosa e' morto. */
    erroreManifesto = `${e.code || 'ERRORE'}: ${e.message}`;
    return null;
  }
};

if (APP_DIR) {
  const indice = path.join(APP_DIR, 'index.html');

  /* UN NOME, NON UN PERCORSO. `:file` non puo' contenere una barra, e il
     controllo sui caratteri chiude la porta a tutto il resto: non esiste un
     modo di uscire da `assets/`. Fuori da qui la cartella-versione non e'
     raggiungibile dalla LAN — mai `express.static` sulla cartella intera,
     perche' il giorno in cui la variabile punta a un albero di sorgenti
     quella riga li pubblica tutti. */
  app.get('/assets/:file', (req, res) => {
    const nome = req.params.file;
    if (!/^[A-Za-z0-9._-]+$/.test(nome) || nome.includes('..')) {
      return res.status(400).json({ error: 'nome di risorsa non valido' });
    }
    const qui = path.join(APP_DIR, 'assets', nome);
    if (fs.existsSync(qui)) return invia(req, res, qui, PER_SEMPRE);

    /* Il ripiego su `precedente`: chi stava caricando la pagina nell'istante
       dello scambio chiede assets che `corrente` non ha piu'. I nomi portano
       l'impronta, quindi due versioni non possono collidere. */
    const prima = PREV_DIR ? path.join(PREV_DIR, 'assets', nome) : null;
    if (prima && fs.existsSync(prima)) return invia(req, res, prima, PER_SEMPRE);

    res.status(404).json({ error: 'risorsa inesistente' });
  });

  app.get(['/', '/app'], (req, res) => invia(req, res, indice, 'no-cache'));
} else {
  app.get(['/', '/app'], (req, res) => {
    if (!APP_FILE) {
      return res.status(503).type('text/plain').send(
        'Applicativo non configurato: impostare PATHFINDER_APP_DIR e riavviare il servizio.');
    }
    noCache(res);
    res.sendFile(APP_FILE);
  });
}

app.get('/api/app-info', wrap(async (req, res) => {
  if (APP_DIR) {
    const m = leggiManifesto();
    /* `app_dir` e' la giunzione, `punta_a` la cartella vera: e' cosi' che si
       vede QUALE versione sta servendo senza aprire niente. */
    let punta_a = null;
    let errore = erroreManifesto;
    try { punta_a = fs.realpathSync(APP_DIR); }
    catch (e) { errore = `${e.code || 'ERRORE'}: ${e.message}`; }
    return res.json({
      service_version: VERSION,
      modo: 'cartella',
      app_dir: APP_DIR,
      punta_a,
      versione: m?.versione ?? null,
      impronta: m?.impronta ?? null,
      byte_totali: m?.byte_totali ?? null,
      costruita: m?.costruita ?? null,
      file: m?.file?.length ?? null,
      /* Presente SOLO quando qualcosa non va: un campo che compare e' un campo
         che si legge, e questa risposta e' il primo comando di ogni diagnosi. */
      ...(punta_a && !errore ? {} : { errore, utente: os.userInfo().username }),
    });
  }
  let stat = null;
  try { const s = fs.statSync(APP_FILE); stat = { bytes: s.size, mtime: s.mtime.toISOString() }; } catch {}
  res.json({ service_version: VERSION, modo: 'file', app_file: APP_FILE, ...stat });
}));

app.use((req, res) => res.status(404).json({ error: 'endpoint inesistente' }));

/* ── 2.26 · UNA PORTA SOLA, E CHI ARRIVA IN CHIARO NON SBATTE ─────────────
   Davanti ai due server sta un `net.Server` che guarda il PRIMO byte e poi
   si toglie di mezzo: `0x16` e' un saluto TLS e il socket va al server
   cifrato, qualunque altra cosa e' HTTP in chiaro e va a quello che risponde
   `301`. Il byte si rimette al suo posto con `unshift`, quindi il server che
   riceve il socket lo legge dall'inizio come se niente fosse.

   PERCHE'. La 2.25 e prima ascoltavano in chiaro sulla 4173, e ogni
   terminale ha quel collegamento salvato. Passando a HTTPS sulla stessa
   porta, senza questo, chi apre il collegamento vecchio riceve
   `ERR_EMPTY_RESPONSE` — un errore che non dice niente e manda a chiamare
   l'assistenza. Cosi' invece riceve un `301` verso `https://` sullo stesso
   host e sulla stessa porta, e il collegamento si aggiorna da solo.

   Il socket che non manda niente non resta appeso: quindici secondi e si
   chiude. Un client che apre e tace non e' un terminale al lavoro. */
const creaServer = () => {
  if (TLS.modo === 'errore') {
    console.error(`\n  ${TLS.motivo}`);
    console.error('  Il servizio non parte in chiaro per errore.\n');
    process.exit(1);
  }
  if (TLS.modo === 'chiaro') return { srv: http.createServer(app), schema: 'http' };

  let opzioni;
  try {
    opzioni = TLS.modo === 'pfx'
      ? { pfx: fs.readFileSync(TLS.pfx), passphrase: TLS.password }
      : { cert: fs.readFileSync(TLS.cert), key: fs.readFileSync(TLS.key) };
  } catch (err) {
    console.error(`\n  Certificato illeggibile: ${err.message}`);
    console.error('  Controllare percorsi e permessi. Il servizio gira come SYSTEM:');
    console.error('  la chiave privata deve essere leggibile da SYSTEM, non solo dall\'utente.\n');
    process.exit(1);
  }

  let cifrato;
  try { cifrato = https.createServer(opzioni, app); }
  catch (err) {
    console.error(`\n  Certificato rifiutato: ${err.message}`);
    console.error('  Se e\' un PFX, la password e\' in PATHFINDER_TLS_PFX_PASSWORD.\n');
    process.exit(1);
  }

  /* Il `301` lo scrive un server HTTP vero e non due righe a mano: cosi'
     porta le intestazioni giuste e chiude la connessione come si deve. */
  const inChiaro = http.createServer((req, res) => {
    const host = String(req.headers.host || `localhost:${PORT}`);
    res.writeHead(301, { Location: `https://${host}${req.url}`, 'Cache-Control': 'no-store' });
    res.end('Pathfinder parla in HTTPS su questa stessa porta.\n');
  });

  const davanti = net.createServer((socket) => {
    socket.setTimeout(15000, () => socket.destroy());
    socket.once('data', (primo) => {
      socket.setTimeout(0);
      socket.pause();
      socket.unshift(primo);
      (eSalutoTLS(primo) ? cifrato : inChiaro).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
    /* Un socket che muore prima di parlare non e' un guasto del servizio. */
    socket.on('error', () => socket.destroy());
  });

  return { srv: davanti, schema: 'https' };
};

const { srv, schema } = creaServer();

const server = srv;

/* Quel che il servizio stampa quando e' in piedi. Era il corpo della
   richiamata di `listen`; dalla 2.6 e' una funzione, perche' legge la
   revisione dal database e quella lettura adesso e' asincrona. */
async function annuncia() {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`\n  Pathfinder ${VERSION} — servizio dati`);
  console.log(`  database    ${db.descrizione}`);
  console.log(`  applicativo ${schema}://localhost:${PORT}/`);
  for (const ip of lan) console.log(`  in rete     ${schema}://${ip}:${PORT}/`);

  /* 2.10 — LE DUE RIGHE CHE DESCRIVONO LA SUPERFICIE. Chi legge questo
     annuncio deve sapere a chi sta rispondendo il servizio: le rotte `/api`
     non chiedono credenziali, e finche' e' cosi' «da chi e' raggiungibile»
     e' l'unica difesa che c'e'. */
  if (schema === 'http') console.log('  ATTENZIONE  senza certificato il PIN viaggia in chiaro');
  else {
    console.log(`  certificato ${TLS.modo === 'pfx' ? TLS.pfx : TLS.cert}`);
    console.log('  in chiaro   chi arriva in http su questa stessa porta riceve un 301');
  }
  console.log(`  ascolta su  ${HOST || 'tutte le interfacce'}`);

  /* 2.11 — CHI PUO' ENTRARE, detto all'avvio. Dalla 2.11 le rotte `/api`
     vogliono una sessione, e le due righe che seguono sono l'unico posto in
     cui si legge se quella regola e' davvero in vigore su questa macchina. */
  if (await finestraDiPrimoAvvio()) {
    console.log('  accesso     APERTO — nessun operatore ha un PIN, e il primo va pur creato');
    console.log('              la finestra si chiude da sola appena il primo PIN esiste');
  } else {
    console.log(`  accesso     chiuso: serve una sessione${TOKEN_MACCHINA ? ' (token di macchina impostato)' : ''}`);
    if (!TOKEN_MACCHINA)
      console.log('              PATHFINDER_TOKEN non impostata: backup e installer non hanno chiave');
  }
  if (schema === 'http')
    console.log('              senza TLS il cookie di sessione viaggia in chiaro, come il PIN');
  /* Un applicativo che non c'e' NON ferma il servizio: le rotte `/api`
     devono rispondere lo stesso, e i terminali gia' aperti continuano a
     lavorare. E' la stessa scelta del 13/08, quando il file servito fu
     cancellato per errore e il magazzino ando' avanti. */
  if (APP_DIR) {
    const mancanti = ['index.html', 'manifest.json']
      .filter((f) => !fs.existsSync(path.join(APP_DIR, f)));
    if (mancanti.length) {
      console.error(`  ATTENZIONE  la cartella dell'applicativo non e' completa: ${APP_DIR}`);
      console.error(`              mancano: ${mancanti.join(', ')}`);
      console.error('              i terminali riceveranno una pagina vuota (404).');
      console.error('              Il servizio dati resta vivo: le rotte /api rispondono.');
    } else {
      const m = leggiManifesto();
      let punta_a = APP_DIR;
      try { punta_a = fs.realpathSync(APP_DIR); } catch {}
      console.log(`  applicativo ${m?.versione ?? '?'} — ${path.basename(punta_a)}`);
      console.log(`  impronta    ${m?.impronta ?? '(manifesto illeggibile)'}`);
    }
  } else if (!APP_FILE) {
    console.error('  ATTENZIONE  nessun applicativo configurato.');
    console.error('              Impostare PATHFINDER_APP_DIR sulla giunzione `corrente`.');
  } else if (!fs.existsSync(APP_FILE)) {
    console.error(`  ATTENZIONE  l'applicativo NON esiste: ${APP_FILE}`);
    console.error('              i terminali riceveranno una pagina vuota (404).');
    console.error('              Indicare il file giusto in PATHFINDER_APP e riavviare.');
  }
  console.log(`  revisione   ${await db.currentRevision()}\n`);
}

const shutdown = (sig) => {
  console.log(`\n  ${sig}: chiusura ordinata…`);
  registro.info('servizio.arresto', `${sig} — versione ${VERSION}`);
  server.close(async () => {
    try { if (db) await db.close(); } catch { /* si sta chiudendo comunque */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/* SI APRE IL DATABASE, POI SI ASCOLTA — e non il contrario.
   Un terminale che riceve un 500 perche' il servizio non ha ancora un
   database e' peggio di un terminale che aspetta due secondi. Se il
   database non si apre affatto, il servizio non parte: partire senza vuol
   dire ventiquattro rotte che rispondono «db is null» a un magazzino che
   crede di stare lavorando. */
const pronto = (async () => {
  /* Il registro si apre PRIMA del database: il caso che piu' vale registrare
     e' proprio quello in cui il database non si apre e il servizio esce con
     1 — il 28/08 e' costato una giornata di magazzino, e sulla console di
     SYSTEM non l'ha letto nessuno. */
  registro.apri(LOG_FILE);
  try {
    db = await apriDatabase({ file: DB_FILE });
  } catch (err) {
    console.error(`
  Il database non si apre: ${err.message}
`);
    registro.errore('servizio.avvio', `database non aperto: ${err.message}`);
    process.exit(1);
  }
  await new Promise((ok) => {
    if (HOST) srv.listen(PORT, HOST, () => ok(undefined));
    else srv.listen(PORT, () => ok(undefined));
  });
  await annuncia();
  /* `descrizione` e' un getter, e su PostgreSQL nasconde gia' la password:
     `//***@`. E' il solo posto del registro dove passa una stringa di
     connessione, e passa mutilata apposta. */
  registro.info('servizio.avvio',
    `versione ${VERSION} — porta ${PORT} — ${db.descrizione || 'database aperto'}`);
  return db;
})();

/* `sessioni` esce insieme agli altri — 2.18. Non serve a nessuno in
   esercizio: serve al collaudo, che deve poter portare indietro `ultimoUso`
   di una sessione vera per vedere se la finestra di inattivita' la chiude.
   L'alternativa era far aspettare al collaudo la finestra vera, e una prova
   che dorme e' una prova che prima o poi qualcuno toglie. */
module.exports = { app, server, pronto, sessioni, get db() { return db; } };
