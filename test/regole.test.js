import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MAIUSCOLE } = require('../server/lib/schema.js');

/* ═══════════════════════════════════════════════════════════════════════════
   LE REGOLE DEL PROGETTO, MESSE DOVE QUALCUNO LE CONTROLLA — 2.18
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Le regole di §8 dell'INDEX — «quelle che non si discutono» — sono state
   fino alla 2.17 affidate alla memoria di chi scrive. Un audit del 02/09 l'ha
   detto come si dice a un progetto con un solo autore: il giorno che quella
   persona non c'è, le regole non ci sono più.

   Queste prove non sono un linter. Un linter porta una catena di dipendenze
   grande quanto il progetto per imporre tre regole; queste tre girano dentro
   `npm test`, dove girano tutte le altre garanzie, e non aggiungono un
   pacchetto.

   OGNUNA È STATA VERIFICATA ROSSA rimettendo il difetto che copre.
   ═══════════════════════════════════════════════════════════════════════════ */

const leggi = (f) => readFileSync(f, 'utf8');

/* ── 1 · IL DOPPIO CONTESTO, E LA RETE CHE NON C'ERA ──────────────────────
   L'interfaccia costruisce i suoi gestori dentro le stringhe:
   `onclick="App.qualcosa('CODICE')"`. Sono due contesti annidati —
   l'attributo HTML e la stringa JavaScript che ci sta dentro — e l'escape
   HTML copre solo il primo: un apice diventa `&#39;`, il parser lo
   ridecodifica in apice PRIMA che il motore JavaScript lo legga, e quella
   stringa si chiude.

   La difesa esiste dalla 2.10 ed è quella giusta: `VIETATI_NEI_CODICI`, in
   `server/lib/schema.js`, rifiuta in scrittura i caratteri che spezzano un
   gestore. Un posto solo per tutti i punti insieme.

   MA COPRE SOLO I CAMPI ELENCATI IN `MAIUSCOLE`, e niente verificava che i
   campi interpolati dentro un `onclick` fossero quelli. Finché la
   corrispondenza regge la porta è chiusa; il giorno che una vista ci mette
   un campo libero si riapre in silenzio, e non c'è nessuno che lo dica.

   Questa prova lo dice. */

const CAMPI_COPERTI = new Set();
for (const percorsi of Object.values(MAIUSCOLE))
  for (const p of percorsi) CAMPI_COPERTI.add(p.split('.').pop().replace('[]', ''));

/* LE ECCEZIONI SI SCRIVONO, NON SI INDOVINANO — e ognuna porta il perché.
   Un elenco senza motivazioni diventa il posto dove si mette quel che dà
   fastidio; con le motivazioni, aggiungerci una riga costa quanto difenderla. */
const AMMESSI = new Map([
  ['print',    'archivio.ts — non è un campo: è il gestore INTERO, costruito lì accanto da `esc(doc_id)`, e i doc_id sono coperti'],
  ['mode',     'cruscotto.ts — voce di un menu scritto nel sorgente, non una riga di database'],
  ['chiave',   'parametri.ts — nome di sezione scritto nel sorgente, non una riga di database'],
  ['ref',      'cruscotto.ts — passa da `encodeURIComponent`, che l\'apice lo porta via per costruzione'],
  ['seq',      'percorso.ts — passa da `Number()`: quel che ne esce è un numero o `NaN`'],
  ['kind',     'cruscotto.ts — enum di `pending_outbound` (`ddt`…), scritto dall\'applicativo e confrontato alla lettera'],
  ['capofila', 'wip.ts — è `odp_num` con un altro nome, ed `odp_num` è coperto'],
  ['name',     'app.ts — nome di un backup su OPFS, generato dall\'applicativo da una data'],
  ['printer_id', 'configurazione.ts — 2.19: lo genera `nuovoIdStampante`, che scrive `STP-<n>` e nient\'altro. Non è una cella che qualcuno compila'],
  ['suA4',     'stampaEtichette.ts — 2.19: non è un campo, è il gestore INTERO, costruito nel sorgente da chi apre la maschera. Stesso caso di `print` in archivio.ts'],
]);

function espressioniNeiGestori() {
  const file = readdirSync('src/ui/views')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `src/ui/views/${f}`);
  for (const extra of ['src/ui/app.ts', 'index.html']) if (existsSync(extra)) file.push(extra);

  const gestore = /on(?:click|change|input|submit)\s*=\s*(["'])(.*?)\1/gs;
  const interpolazione = /\$\{([^}]*)\}/g;
  const out = [];
  for (const f of file) {
    const s = leggi(f);
    let g;
    while ((g = gestore.exec(s))) {
      interpolazione.lastIndex = 0;
      let e;
      while ((e = interpolazione.exec(g[2]))) out.push({ file: f, espr: e[1].trim() });
    }
  }
  return out;
}

/* Un'espressione è «un campo» se finisce con `qualcosa.campo`. Tutto il
   resto — indici, contatori, letterali — non viene da una riga di database e
   non è quel che questa prova cerca. */
const FORMA_CAMPO = /(?:^|[\s(])(?:this\._esc\()?\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)+\s*\)?\s*$/;
const ultimoCampo = (espr) => espr.match(/[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)+/g)?.pop()?.split(/\??\./).pop();

describe('il doppio contesto dei gestori inline', () => {
  it('ogni campo interpolato dentro un gestore è coperto da VIETATI_NEI_CODICI', () => {
    const scoperti = [];
    for (const { file, espr } of espressioniNeiGestori()) {
      if (!FORMA_CAMPO.test(espr)) continue;
      const campo = ultimoCampo(espr);
      if (!campo || CAMPI_COPERTI.has(campo) || AMMESSI.has(campo)) continue;
      scoperti.push(`${file}: \${${espr}} — il campo "${campo}" non è in MAIUSCOLE`);
    }
    expect(scoperti, scoperti.join('\n')).toEqual([]);
  });

  it('nessuna eccezione è rimasta lì senza servire più', () => {
    const usati = new Set();
    for (const { espr } of espressioniNeiGestori()) {
      if (!FORMA_CAMPO.test(espr)) continue;
      const campo = ultimoCampo(espr);
      if (campo && AMMESSI.has(campo)) usati.add(campo);
    }
    const morte = [...AMMESSI.keys()].filter((k) => !usati.has(k));
    expect(morte, `eccezioni non più usate, da togliere: ${morte.join(', ')}`).toEqual([]);
  });
});

/* ── 2 · `store.ts` NON CRESCE PIÙ ────────────────────────────────────────
   4.252 righe, 257 metodi, importato da 28 viste su 30. Non è un difetto
   attivo: è il moltiplicatore di costo di ogni intervento futuro, e si
   riconosce adesso che il progetto è ancora piccolo abbastanza per
   contenerlo.

   Non è una riscrittura, è una regola di non peggioramento: il file non
   cresce, e ogni funzionalità nuova nasce in un modulo suo. Il numero sta
   qui e non in un commento perché alzarlo sia un gesto DELIBERATO e visibile
   nel diff — non l'effetto collaterale di una giornata di lavoro.

   02/09/2026 — 4252 → 4351, e il gesto è deliberato. Le stampanti Zebra in
   rete sono nate in quattro file loro: `modules/stampanti.ts` (forma del
   dato, convalida, disposizione dei campi), `server/lib/zpl.js` (l'etichetta),
   `server/lib/stampa-zebra.js` (il socket) e `ui/views/stampaEtichette.ts`
   (la maschera). Quel che è finito qui dentro sono le 99 righe che NON
   possono stare altrove: leggere e scrivere `meta` passa da `_cache` e da
   `Persistence`, e nessun modulo esterno li tocca. È esattamente la crescita
   che la regola ammette — il ponte, non la funzionalità.

   03/09/2026 — 4351 → 4398, e il gesto è deliberato per la stessa ragione.
   I modelli di imballo del prodotto finito nascono in `modules/imballo.ts`
   (forma, convalida, conto dei colli) e si configurano in
   `ui/views/parametri.ts`: qui dentro stanno le 47 righe del ponte —
   leggere e scrivere `meta.imballi` passa da `_cache` e da `Persistence`,
   che nessun modulo esterno tocca.

   03/09/2026 — 4398 → 4408, e sono dieci righe: `createUdc` fa passare i tre
   campi facoltativi del bancale di prodotto finito (`kind`, `odp_num`,
   `model_code`). Non e' logica nuova — la lettura di un bancale sta tutta in
   `modules/bancale.ts` — e' la firma di un metodo che gia' scriveva quel
   record.

   03/09/2026 — 4408 → 4427: le diciannove righe del ponte per il layout
   dell'etichetta del bancale (`getLayoutEtichettaPf`, `saveLayoutEtichettaPf`
   e la chiave dichiarata in `_loadCache`). Stesso ponte di `labelLayout`, per
   la seconda etichetta: la forma sta in `modules/stampanti.ts` e lo ZPL in
   `server/lib/zpl.js`. */
const TETTO_STORE = 4427;

describe('il nucleo non cresce', () => {
  it(`src/core/store.ts resta entro ${TETTO_STORE} righe`, () => {
    /* Si contano gli a capo, non i pezzi dello split: l'ultimo a capo del
       file produrrebbe un pezzo vuoto, e il numero non corrisponderebbe più
       a quello che dice `wc -l` — cioè al numero che si legge nell'audit. */
    const righe = (leggi('src/core/store.ts').match(/\n/g) || []).length;
    expect(righe, `store.ts è a ${righe} righe: se la crescita è voluta, si alza il tetto qui `
      + 'e si scrive perché; se non lo è, il posto giusto è un modulo nuovo').toBeLessThanOrEqual(TETTO_STORE);
  });
});

/* ── 3 · IL CORPO SI LEGGE DOPO IL GUARDIANO ──────────────────────────────
   Fino alla 2.17 `express.json` era registrato PRIMA della riga che chiede
   chi sta chiamando: chiunque raggiungesse la porta, senza credenziali,
   faceva allocare al processo fino a 256 MB per richiesta prima di
   prendersi il 401.

   L'ordine dei middleware in Express è l'ordine di registrazione, e non c'è
   niente nel linguaggio che lo protegga: si legge nel sorgente, riga per
   riga. Questa prova lo legge al posto di chi rileggerà quel file fra un
   anno. */
describe('l\'ordine dei middleware del servizio', () => {
  const sorgente = leggi('server/pathfinder-server.js');
  const riga = (ago) => sorgente.slice(0, sorgente.indexOf(ago)).split('\n').length;

  it('il guardiano della sessione è registrato prima di express.json', () => {
    const guardiano = sorgente.indexOf("app.use('/api', async (req, res, avanti)");
    const parser = sorgente.indexOf('express.json(');
    expect(guardiano, 'il guardiano della sessione non si trova più').toBeGreaterThan(-1);
    expect(parser, 'nessun express.json: il servizio non leggerebbe nessun corpo').toBeGreaterThan(-1);
    expect(guardiano, `guardiano alla riga ${riga("app.use('/api', async (req, res, avanti)")}, `
      + `express.json alla riga ${riga('express.json(')}: chi legge il corpo prima di sapere chi chiama `
      + 'apre una porta a chi non ha credenziali').toBeLessThan(parser);
  });

  it('il tetto alto vive solo sulle rotte di import', () => {
    expect(sorgente).toMatch(/ROTTE_DI_IMPORT[\s\S]{0,400}?express\.json\(\{ limit: '256mb' \}\)/);
    expect(sorgente).toMatch(/app\.use\(express\.json\(\{ limit: '2mb' \}\)\)/);
  });
});

/* ── 4 · `engines` NON PROMETTE MENO DI QUEL CHE LE DIPENDENZE CHIEDONO ───
   2.18.1, e questa l'ha trovata l'integrazione continua alla sua seconda
   corsa.

   `better-sqlite3` 13 dichiara `engines: { node: ">=22" }`, e il binario che
   npm scarica è compilato per l'ABI di quella riga. `package.json` diceva
   `>=20`, la scheda tecnica chiedeva al team IT «Node LTS ≥ 20», e su questa
   macchina gira la 24: nessuno se n'era accorto.

   Su una macchina con Node 20 `npm ci` scrive un `npm warn EBADENGINE` fra
   cinquanta righe di output, installa lo stesso, e poi il processo muore
   caricando il modulo nativo. E muore SEMPRE, anche su PostgreSQL, perché
   `lib/db.js` richiede `driver-sqlite` in testa.

   Una riga di `engines` che promette meno di quel che le dipendenze
   pretendono non è ottimismo: è un'installazione che arriva in fondo e un
   servizio che non parte. */
describe('quel che si promette su Node', () => {
  /** Il maggiore minimo di una riga come `>=22` o `^20 || ^22 || >=24`. */
  const minimo = (spec) => {
    const numeri = String(spec ?? '').match(/(?:>=|\^|~)\s*(\d+)/g) || [];
    if (!numeri.length) return null;
    /* Un `||` elenca ALTERNATIVE: il minimo vero è la più bassa. Un vincolo
       solo (`>=22`) è già il suo minimo. */
    return Math.min(...numeri.map((n) => parseInt(n.replace(/\D/g, ''), 10)));
  };

  const alberi = [
    ['package.json', 'node_modules'],
    ['server/package.json', 'server/node_modules'],
  ];

  for (const [manifesto, moduli] of alberi) {
    it(`${manifesto} non promette meno di quel che installa`, () => {
      const promesso = minimo(JSON.parse(leggi(manifesto)).engines?.node);
      expect(promesso, `${manifesto}: manca engines.node`).not.toBe(null);

      if (!existsSync(moduli)) return;   // niente dipendenze, niente da dire

      const esigenti = [];
      for (const nome of readdirSync(moduli)) {
        if (nome.startsWith('.')) continue;
        const p = `${moduli}/${nome}/package.json`;
        if (!existsSync(p)) continue;
        let chiesto = null;
        try { chiesto = minimo(JSON.parse(leggi(p)).engines?.node); } catch { continue; }
        if (chiesto !== null && chiesto > promesso) esigenti.push(`${nome} vuole >=${chiesto}`);
      }

      expect(esigenti, `${manifesto} dichiara >=${promesso}, ma: ${esigenti.join(', ')}. `
        + 'Una macchina con la versione promessa installa e poi non parte.').toEqual([]);
    });
  }
});

/* ── 5 · L'ANAGRAFICA PUBBLICA NON PORTA NOMI ─────────────────────────────
   `GET /api/auth/operatori` risponde senza sessione — deve, è la maschera
   che apre l'applicativo. Fino alla 2.17 rispondeva con nome, cognome e
   `rec_set` di ogni operatore attivo: l'elenco nominativo del personale, e
   la mappa di chi ha una seconda via d'ingresso, a chiunque fosse sulla rete.

   Il collaudo del servizio lo verifica sulla risposta vera. Questa prova lo
   verifica nel sorgente, perché è lì che il campo tornerebbe. */
describe('la rotta pubblica dell\'anagrafica', () => {
  it('non nomina first_name, last_name né rec_set', () => {
    const sorgente = leggi('server/pathfinder-server.js');
    const inizio = sorgente.indexOf("app.get('/api/auth/operatori'");
    expect(inizio, 'la rotta non si trova più').toBeGreaterThan(-1);
    const corpo = sorgente.slice(inizio, sorgente.indexOf('}));', inizio));
    for (const campo of ['first_name', 'last_name', 'rec_set'])
      expect(corpo, `"${campo}" è tornato in una risposta che non chiede la sessione`)
        .not.toContain(campo);
  });
});
