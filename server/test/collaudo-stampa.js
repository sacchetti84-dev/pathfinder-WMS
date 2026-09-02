'use strict';

/* PATHFINDER — COLLAUDO DELLA STAMPA SU ZEBRA, 2.19
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   UNA STAMPANTE ZPL E' UN SERVER TCP CHE INGOIA BYTE. Non serve una Zebra
   per provare questo codice: serve qualcosa che ascolti sulla porta e
   racconti cosa gli e' arrivato. Qui quel qualcosa e' un `net.createServer`
   su una porta di prova, e le prove leggono i byte che il servizio gli ha
   scritto.

   COSA NON SI PUO' PROVARE QUI, E VA DETTO. Che l'etichetta esca dritta,
   che le barre si leggano col lettore vero, che il calore sia giusto per il
   supporto montato: sono tre cose che si guardano con la stampante davanti,
   e nessun banco le sostituisce. Il banco copre il resto — il layout che sta
   nei millimetri, i caratteri che non spezzano lo ZPL, la porta che non e'
   una porta qualsiasi, l'indirizzo che non esce dalla rete interna, le
   richieste che si mettono in fila.

   PER VEDERE UN'ETICHETTA. Lo ZPL si incolla in un visualizzatore e si
   guarda. NON lo si manda da qui: §8 dice che verso l'esterno non parte
   niente, e un banco che chiama un servizio in rete e' un banco che
   fallisce quando cade la linea.

       node test/collaudo-stampa.js     (da server/) */

const net = require('net');
const assert = require('assert');
const zpl = require('../lib/zpl');
const zebra = require('../lib/stampa-zebra');

let passate = 0, fallite = 0;
const ok = (nome, cond, nota = '') => {
  if (cond) { passate++; console.log(`  PASSA    ${nome}${nota ? ' — ' + nota : ''}`); }
  else { fallite++; console.log(`  FALLISCE ${nome}${nota ? ' — ' + nota : ''}`); }
};
const alza = async (nome, fn, pezzo) => {
  try { await fn(); ok(nome, false, 'non ha alzato niente'); }
  catch (e) { ok(nome, String(e.message).includes(pezzo), `«${e.message}»`); }
};

/* La stampante di prova e' quella vera del magazzino: serie ZD200, testina a
   203 dpi, adesive staccate 100 x 80. Le misure NON sono quelle
   dell'etichetta su A4 (100 x 60, `.item-label` in `05-pick-report.css`):
   quella e' un ripiego su foglio e non deve imitare il rotolo. */
const STAMPANTE = {
  printer_id: 'STP-BANCO', nome: 'Banco', host: '127.0.0.1', porta: 9100,
  dpi: 203, larghezza_mm: 100, altezza_mm: 80, site_id: 'MAG1', attiva: true,
};

const MERCE = {
  item_key: '6001055#L2603', article_code: '6001055',
  article_description: 'Manganese solfato monoidrato',
  lot_code: 'L2603', expiry_date: '2027-03-15',
  qty: 4, qty_uom: 87.5, uom: 'KG', location_code: 'MAG1-RAKA-04-01-T',
};

/* ── LA FINTA ZEBRA ───────────────────────────────────────────────────────
   Ascolta, tiene da parte quel che riceve, e sa fingersi tre macchine
   diverse: una che risponde a `~HQES` dicendo che sta bene, una che dice che
   ha finito la carta, e una muta — che e' il server di stampa che il comando
   non lo conosce. */
function finta({ porta, risposta = null, ritardoMs = 0 }) {
  /** @type {string[]} */
  const ricevuto = [];
  const srv = net.createServer((s) => {
    let buf = Buffer.alloc(0);
    s.on('data', (/** @type {Buffer} */ d) => {
      buf = Buffer.concat([buf, d]);
      const testo = buf.toString('utf8');
      if (testo.includes('~HQES') && risposta) {
        setTimeout(() => s.write(risposta), ritardoMs);
      }
    });
    s.on('close', () => { if (buf.length) ricevuto.push(buf.toString('utf8')); });
    s.on('error', () => {});
  });
  return {
    ricevuto,
    accendi: () => new Promise((r) => srv.listen({ port: porta, host: '127.0.0.1' }, () => r(null))),
    spegni: () => new Promise((r) => srv.close(r)),
  };
}

const STATO_BENE = '\x02\r\n PRINTER STATUS\r\n ERRORS:   0 00000000 00000000\r\n'
                 + ' WARNINGS: 0 00000000 00000000\r\n\x03';
const STATO_CARTA = '\x02\r\n PRINTER STATUS\r\n ERRORS:   1 00000000 00000001\r\n'
                  + ' WARNINGS: 0 00000000 00000000\r\n\x03';

async function principale() {
  console.log('\nPATHFINDER — collaudo della stampa su Zebra\n');

  /* ══ 1. LE MISURE ═════════════════════════════════════════════════════ */
  console.log('  Le misure');
  /* Zebra scrive «8 punti/mm» sulle schede tecniche di una testina a 203 dpi,
     ed e' un arrotondamento: il valore esatto e' 203/25,4 = 7,992. La
     differenza su un'etichetta da 100 mm e' UN punto, e la si tiene perche'
     il dpi lo dichiara chi configura — se un domani qualcuno scrive 203,2 il
     conto deve seguirlo invece di avere 8 inchiodato dentro. */
  ok('203 dpi sono 8 punti per millimetro, a meno dell\'arrotondamento',
    Math.abs(zpl.puntiPerMm(203) - 8) < 0.01, `${zpl.puntiPerMm(203).toFixed(3)}`);
  ok('100 mm a 203 dpi sono 799 punti', zpl.punti(100, 203) === 799);
  ok('100 mm a 300 dpi sono 1181 punti', zpl.punti(100, 300) === 1181);
  /* Il modulo minimo e' quello che tiene la dimensione X sopra 0,25 mm: sotto
     le barre si fondono e nessun lettore le legge — §8. */
  ok('il modulo minimo a 203 dpi e\' 2 punti', zpl.moduloMinimo(203) === 2);
  ok('il modulo minimo a 300 dpi e\' 3 punti', zpl.moduloMinimo(300) === 3);
  ok('un modulo minimo sta sempre sopra 0,25 mm',
    [203, 300, 600].every((d) => zpl.moduloMinimo(d) / zpl.puntiPerMm(d) >= 0.25 - 1e-9));

  /* ══ 2. I CARATTERI CHE ROMPONO LO ZPL ════════════════════════════════ */
  console.log('\n  I quattro caratteri che romperebbero il comando');
  ok('l\'accento circonflesso diventa un escape', zpl.testoZpl('A^B') === 'A_5EB');
  ok('la tilde diventa un escape', zpl.testoZpl('A~B') === 'A_7EB');
  ok('la barra rovesciata diventa un escape', zpl.testoZpl('A\\B') === 'A_5CB');
  ok('il trattino basso diventa un escape', zpl.testoZpl('A_B') === 'A_5FB');
  ok('un escape non ne genera un altro a cascata', zpl.testoZpl('_') === '_5F');
  ok('gli accenti passano come sono — ci pensa ^CI28',
    zpl.testoZpl('Pomodoro pelato à è') === 'Pomodoro pelato à è');
  ok('gli a capo diventano spazi', zpl.testoZpl('a\r\nb') === 'a b');
  /* Il caso vero: una descrizione con un accento circonflesso dentro non deve
     poter chiudere il campo e far leggere alla testina il resto come comandi. */
  {
    const s = zpl.etichettaMerce({ ...MERCE, article_description: 'X^FS^XZ IN MEZZO' },
      STAMPANTE, null, 1);
    const corpo = s.slice(s.indexOf('^FD'), s.lastIndexOf('^XZ'));
    ok('una descrizione che contiene ^XZ non chiude l\'etichetta',
      !corpo.includes('^XZ') && s.endsWith('^XZ') && s.split('^XZ').length === 2);
  }

  /* ══ 3. IL LAYOUT NEI MILLIMETRI ══════════════════════════════════════ */
  console.log('\n  Il layout');
  {
    const posa = zpl.disponi(null, 80);
    ok('il layout di serie porta i sei campi accesi', posa.blocchi.length === 6,
      posa.blocchi.map((b) => b.campo).join(', '));
    ok('il layout di serie ci sta sul supporto vero, 80 mm', posa.ci_sta, `${posa.usato_mm} mm`);
    /* Gli undici millimetri che avanzano non sono spazio sprecato: su
       un'etichetta staccata il registro balla a ogni avanzamento, e un campo
       a filo del bordo prima o poi si taglia. */
    ok('e lascia un margine di sicurezza sotto', posa.usato_mm <= 72,
      `${(80 - posa.usato_mm).toFixed(1)} mm liberi`);
    /* Con TUTTI i campi accesi ci sta ancora, appena — e la scheda di
       configurazione lo dice mentre li si accende. */
    const tutti = { righe: zpl.LAYOUT_DI_SERIE.righe.map((r) => ({ ...r, attivo: true })) };
    ok('con colli e ubicazione accesi ci sta ancora', zpl.disponi(tutti, 80).ci_sta,
      `${zpl.disponi(tutti, 80).usato_mm} mm su 80`);
    ok('barre, descrizione, scadenza e peso ci sono tutti',
      ['barcode', 'descrizione', 'scadenza', 'peso']
        .every((c) => posa.blocchi.some((b) => b.campo === c)));
    /* La riga in chiaro sotto le barre e' spazio vero: se non la si conta, il
       campo successivo ci finisce sopra. */
    const barre = posa.blocchi.find((b) => b.campo === 'barcode');
    ok('le barre contano anche la riga in chiaro',
      Math.abs(barre.alta_mm - (barre.altezza_mm + zpl.INTERPRETAZIONE_MM)) < 1e-9);
    ok('le righe si impilano senza sovrapporsi',
      posa.blocchi.every((b, i) => i === 0
        || b.y_mm >= posa.blocchi[i - 1].y_mm + posa.blocchi[i - 1].alta_mm));
  }
  {
    /* I 60 mm sono la misura dell'etichetta su A4, e a questo layout NON
       bastano: i due formati sono diversi di proposito — l'A4 e' un ripiego
       su foglio e non deve imitare il rotolo. Il banco lo dice, cosi' se un
       giorno qualcuno configura una stampante con quel supporto sa gia' cosa
       succede. */
    const posa = zpl.disponi(null, 60);
    ok('un layout piu\' alto del supporto lo dichiara', !posa.ci_sta, `${posa.usato_mm} su 60 mm`);
  }
  ok('un campo spento non occupa spazio',
    zpl.disponi({ righe: [{ campo: 'articolo', attivo: false, altezza_mm: 5 }] }, 80)
      .blocchi.length === 0);
  ok('un campo che non esiste si scarta invece di rompere il layout',
    zpl.disponi({ righe: [{ campo: 'inventato', attivo: true, altezza_mm: 5 }] }, 80)
      .blocchi.length === 6, 'ripiega su quello di serie');

  /* Un layout troppo alto NON si tronca: si rifiuta. Un'etichetta troncata
     esce con l'aria di essere giusta e le manca l'ultima riga. */
  await alza('un layout che non ci sta rifiuta la stampa',
    async () => zpl.etichettaMerce(MERCE, { ...STAMPANTE, altezza_mm: 20 }, null, 1),
    'non ci sta');
  await alza('un layout senza campi accesi rifiuta la stampa',
    async () => zpl.etichettaMerce(MERCE, STAMPANTE,
      { righe: [{ campo: 'articolo', attivo: false, altezza_mm: 4 }] }, 1),
    'nemmeno un campo acceso');

  /* ══ 4. IL CONTENUTO DELL'ETICHETTA ═══════════════════════════════════ */
  console.log('\n  Cosa finisce sull\'etichetta');
  {
    const s = zpl.etichettaMerce(MERCE, STAMPANTE, null, 3);
    ok('apre e chiude come uno ZPL', s.startsWith('^XA') && s.endsWith('^XZ'));
    ok('dichiara UTF-8 — o gli accenti escono sbagliati', s.includes('^CI28'));
    ok('dichiara larghezza e altezza del supporto',
      s.includes('^PW799') && s.includes('^LL639'), '100 x 80 a 203 dpi');
    ok('le copie finiscono in ^PQ', s.includes('^PQ3'));
    ok('il barcode porta la chiave di riga', s.includes('^BCN,') && s.includes('6001055#L2603'));
    ok('la descrizione c\'e\'', s.includes('Manganese solfato monoidrato'));
    ok('la scadenza esce all\'italiana', s.includes('Scad. 15/03/2027'));
    ok('il peso esce col numero e l\'unita\'', s.includes('Peso 87,5 KG'));
    ok('il lotto c\'e\'', s.includes('Lotto L2603'));
    /* §8: l'ubicazione invecchia, e nasce spenta. */
    ok('l\'ubicazione NON c\'e\' — nasce spenta', !s.includes('MAG1-RAKA-04-01-T'));
    ok('non manda mai la configurazione della macchina',
      !/\^MN|\^MM|\^MD|\^JUS/.test(s), 'niente ^MN ^MM ^MD ^JUS');
  }
  {
    /* Un articolo in pezzi non ha un «peso»: la riga si intitola per quel che
       e'. Un'etichetta che chiama peso dei pezzi manda fuori strada chi la
       legge sei mesi dopo. */
    const s = zpl.etichettaMerce({ ...MERCE, uom: 'PZ', qty_uom: 1200 }, STAMPANTE, null, 1);
    ok('in pezzi la riga dice «Quantita\'», non «Peso»',
      s.includes('Quantità 1.200 PZ') && !s.includes('Peso'));
  }
  {
    const s = zpl.etichettaMerce({ ...MERCE, uom: null, qty_uom: null }, STAMPANTE, null, 1);
    ok('senza unita\' la riga del peso resta vuota invece di inventare',
      !s.includes('Peso') && !s.includes('Quantità'));
  }
  {
    const s = zpl.etichettaMerce({ ...MERCE, expiry_date: '' }, STAMPANTE, null, 1);
    ok('una scadenza assente non stampa un trattino', !s.includes('Scad.'));
  }
  {
    /* §8: sull'UDC l'unico dato che non invecchia e' il numero. */
    const s = zpl.etichettaUdc({ udc_id: 'UDC-000123', sscc: null }, STAMPANTE, 1);
    ok('l\'etichetta UDC porta il codice', s.includes('UDC-000123'));
    ok('l\'etichetta UDC dice se il codice e\' interno', s.includes('Codice interno'));
    ok('l\'etichetta UDC non porta altro', !s.includes('Lotto') && !s.includes('Scad.'));
    const sscc = zpl.etichettaUdc({ udc_id: '312345678901234567', sscc: '312345678901234567' },
      STAMPANTE, 1);
    ok('un SSCC si dichiara SSCC', sscc.includes('SSCC (GS1)'));
  }
  await alza('un\'unita\' senza codice non stampa niente',
    async () => zpl.etichettaUdc({ udc_id: '' }, STAMPANTE, 1), 'senza codice');

  /* Un codice troppo lungo per il supporto: si RIFIUTA, non si stringe sotto
     la dimensione X minima. Barre che nessun lettore legge sono peggio di
     un'etichetta che non esce — §8. */
  await alza('un codice piu\' largo dell\'etichetta si rifiuta',
    async () => zpl.etichettaMerce(
      { ...MERCE, item_key: 'A'.repeat(70) }, { ...STAMPANTE, larghezza_mm: 50 }, null, 1),
    'non ci sta');

  /* ══ 5. LA CONVALIDA DELLA STAMPANTE ══════════════════════════════════ */
  console.log('\n  La stampante, prima di parlarle');
  await alza('una porta che non e\' di stampa si rifiuta',
    async () => zebra.leggiStampante({ ...STAMPANTE, porta: 5432 }), 'non è una porta di stampa');
  await alza('un dpi inventato si rifiuta',
    async () => zebra.leggiStampante({ ...STAMPANTE, dpi: 250 }), 'risoluzione di testina');
  await alza('un supporto fuori misura si rifiuta',
    async () => zebra.leggiStampante({ ...STAMPANTE, altezza_mm: 900 }), 'fuori misura');
  ok('una stampante buona passa', zebra.leggiStampante(STAMPANTE).porta === 9100);

  /* Il servizio non deve poter diventare un ponte verso l'esterno: §8 — non
     parte niente verso fuori. */
  console.log('\n  L\'indirizzo non esce dalla rete interna');
  ok('10.x e\' privato', zebra.ePrivato('10.0.1.50'));
  ok('192.168.x e\' privato', zebra.ePrivato('192.168.1.20'));
  ok('172.16-31 e\' privato', zebra.ePrivato('172.20.0.5') && !zebra.ePrivato('172.32.0.5'));
  ok('il loopback e\' privato — ci gira questo banco', zebra.ePrivato('127.0.0.1'));
  ok('8.8.8.8 NON e\' privato', !zebra.ePrivato('8.8.8.8'));
  await alza('un indirizzo pubblico si rifiuta prima di connettersi',
    async () => zebra.risolvi('8.8.8.8'), 'indirizzo pubblico');
  await alza('un IPv6 si rifiuta dicendo perche\'',
    async () => zebra.risolvi('::1'), 'IPv6');

  console.log('\n  Le copie');
  ok('nessuna copia dichiarata vale 1', zebra.leggiCopie(undefined) === 1);
  ok('zero copie valgono 1', zebra.leggiCopie(0) === 1);
  ok('sette copie sono sette', zebra.leggiCopie(7) === 7);
  await alza('cento copie si rifiutano invece di troncare in silenzio',
    async () => zebra.leggiCopie(100), 'sono troppe');

  /* ══ 6. LA RISPOSTA DI ~HQES ══════════════════════════════════════════ */
  console.log('\n  Come si legge lo stato');
  {
    const bene = zebra.leggiStato(STATO_BENE);
    ok('nessun errore si legge come nessun errore', bene.noto && !bene.errori);
    const carta = zebra.leggiStato(STATO_CARTA);
    ok('la carta finita si riconosce',
      carta.noto && carta.errori && carta.dettagli.includes('carta finita'));
    /* La bandiera e' un fatto certo, i bit una traduzione: se la traduzione
       non riconosce niente non si deve poter dire «tutto a posto». */
    const ignoto = zebra.leggiStato(
      ' ERRORS:   1 00000000 00001000\r\n WARNINGS: 0 00000000 00000000');
    ok('un errore che non si sa nominare resta un errore',
      ignoto.errori && ignoto.dettagli.length > 0, ignoto.dettagli.join(', '));
    ok('una risposta che non e\' uno stato si dichiara sconosciuta',
      !zebra.leggiStato('roba a caso').noto);
    ok('nessuna risposta si dichiara sconosciuta', !zebra.leggiStato(null).noto);
  }

  /* ══ 7. IL SOCKET, CON LA FINTA ZEBRA SOTTO ═══════════════════════════ */
  console.log('\n  Il socket');
  {
    const z = finta({ porta: 9100, risposta: STATO_BENE });
    await z.accendi();
    try {
      const esito = await zebra.stampaMerce(STAMPANTE, MERCE, null, 2);
      ok('i byte arrivano alla stampante', esito.ok && esito.byte > 0, `${esito.byte} byte`);
      await new Promise((r) => setTimeout(r, 60));
      const arrivato = z.ricevuto.find((t) => t.startsWith('^XA'));
      ok('quel che arriva e\' lo ZPL costruito',
        Boolean(arrivato) && arrivato.includes('^PQ2') && arrivato.includes('6001055#L2603'));
      ok('gli accenti arrivano in UTF-8',
        Boolean(arrivato) && arrivato.includes('Manganese'));

      const stato = await zebra.statoStampante(STAMPANTE);
      ok('lo stato si legge dalla macchina', stato.noto && !stato.errori);

      /* PIU' TERMINALI SULLA STESSA STAMPANTE. La 9100 accetta una
         connessione per volta: senza la fila, la seconda viene rifiutata e
         l'etichetta non esce senza che nessuno sappia perche'. */
      z.ricevuto.length = 0;
      await Promise.all([1, 2, 3, 4, 5].map((n) =>
        zebra.stampaMerce(STAMPANTE, { ...MERCE, lot_code: `L${n}` }, null, 1)));
      await new Promise((r) => setTimeout(r, 120));
      ok('cinque richieste insieme escono tutte e cinque',
        z.ricevuto.filter((t) => t.startsWith('^XA')).length === 5,
        `${z.ricevuto.filter((t) => t.startsWith('^XA')).length} su 5`);
    } finally { await z.spegni(); }
  }
  {
    /* La macchina muta: accetta il socket e non risponde a `~HQES`. E' il
       server di stampa che il comando non lo conosce, e la stampa NON deve
       fallire per questo — deve dire «inviata, stato sconosciuto». */
    const z = finta({ porta: 9101, risposta: null });
    await z.accendi();
    try {
      const muta = { ...STAMPANTE, printer_id: 'STP-MUTA', porta: 9101 };
      const esito = await zebra.stampaUdc(muta, { udc_id: 'UDC-000999' }, 1);
      ok('una stampante che non parla accetta comunque il lavoro', esito.ok);
      const stato = await zebra.statoStampante(muta);
      ok('e il suo stato si dichiara sconosciuto', !stato.noto && !stato.errori);
    } finally { await z.spegni(); }
  }
  {
    /* La stampante con la carta finita: i byte partono lo stesso — la 9100
       non ha modo di rifiutarli — e la differenza la fa `~HQES`. E' il
       difetto piu' pericoloso di tutta la funzione, ed e' questa prova. */
    const z = finta({ porta: 9102, risposta: STATO_CARTA });
    await z.accendi();
    try {
      const rotta = { ...STAMPANTE, printer_id: 'STP-ROTTA', porta: 9102 };
      const esito = await zebra.stampaMerce(rotta, MERCE, null, 1);
      const stato = await zebra.statoStampante(rotta);
      ok('con la carta finita l\'invio riesce lo stesso — la 9100 non lo sa',
        esito.ok === true);
      ok('ma lo stato lo dice, e questo e\' il punto',
        stato.noto && stato.errori && stato.dettagli.includes('carta finita'));
    } finally { await z.spegni(); }
  }
  {
    /* Nessuno in ascolto: si deve rispondere presto e dire cosa guardare,
       non restare appesi venti secondi come farebbe Windows da solo. */
    const t0 = Date.now();
    let messaggio = '';
    try { await zebra.stampaMerce({ ...STAMPANTE, printer_id: 'STP-SPENTA', porta: 9103 }, MERCE, null, 1); }
    catch (e) { messaggio = e.message; }
    const durata = Date.now() - t0;
    ok('una stampante spenta si dichiara subito', Boolean(messaggio) && durata < zebra.ATTESA_MS + 1500,
      `${durata} ms — «${messaggio}»`);
    ok('e il messaggio dice dove guardare',
      /spenta|staccata|rifiutata|non risponde|indirizzo/.test(messaggio));
  }
  {
    const z = finta({ porta: 9100, risposta: STATO_BENE });
    await z.accendi();
    try {
      await alza('una stampante disattivata non stampa',
        async () => zebra.stampaMerce({ ...STAMPANTE, attiva: false }, MERCE, null, 1),
        'disattivata');
    } finally { await z.spegni(); }
  }

  console.log(`\n  ${passate} passate, ${fallite} fallite\n`);
  assert.strictEqual(fallite, 0, `${fallite} prove fallite`);
}

principale().catch((e) => { console.error('\n  GUASTO DEL BANCO:', e); process.exitCode = 1; });
