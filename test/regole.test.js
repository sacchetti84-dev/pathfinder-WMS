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
  ['azione',   'archivio.ts — 2.20: non è un campo, è il gestore INTERO della packing list, costruito lì accanto da `esc(doc_id)`. Stesso caso di `print`'],
  ['suA4',     'stampaEtichette.ts — 2.19: non è un campo, è il gestore INTERO, costruito nel sorgente da chi apre la maschera. Stesso caso di `print` in archivio.ts'],
  ['anno',     'calendario.ts — 2.34: lo produce `mesePrecedente`/`meseSeguente` da due numeri, e non passa da nessun database'],
  ['mese',     'calendario.ts — 2.34: stesso caso di `anno`, ed `e` sempre 1-12 per costruzione'],
  ['iso',      'calendario.ts — 2.34: lo compone `isoLocale` da giorno, mese e anno di un `Date`. Non e una cella che qualcuno compila'],
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
   `server/lib/zpl.js`.

   03/09/2026 — 4427 → 4434: `segnaUdcSpedita`, sette righe. Vuoto e spedito
   sono due fatti diversi e li scrivono due gesti diversi; questo passa da
   `_patchUdc`, che sta qui perche' tocca la cache.

   03/09/2026 — 4434 → 4438: quattro righe di commento e la spunta
   `trasferimento` sulle due causali di conto terzi che nascono di serie.

   03/09/2026 — 4438 → 4446: `dest_location` nei due punti dove il documento
   si ricostruisce campo per campo — `savePendingOutbound` e
   `updatePendingDoc`. Non aggiungerlo li' era il difetto: il campo si
   scriveva a video e non arrivava a database, in silenzio.

   03/09/2026 — 4446 -> 4520: i quattro ponti del prodotto finito 2.21.
   `apprendiModelloImballo` e `apprendiModelloDiArticolo` (il modello di
   carico che si impara dal primo bancale invece di essere compilato su
   11.197 articoli), `dichiaraConfezioneArticolo` (la quantita' per collo
   scritta in ANAGRAFICA, dove il prodotto finito la cerca — il gemello di
   `dichiaraConfezioneLotto`, che scrive sul lotto) e `posizionaUdcVuota`
   (il vano di un bancale gia' etichettato e ancora senza merce). Sono ponti
   verso `Persistence` e la cache: la forma e la convalida stanno in
   `modules/imballo.ts` e `modules/misure.ts`, che e' dove sono collaudate.

   03/09/2026 — 4520 -> 4561: i tre della sessione di carico —
   `getCaricoInCorso`, `salvaCarico`, `chiudiCarico`. Sta in `meta` e non in
   una collezione nuova: ne vive UNA per volta, `pick_session` e' occupata
   dal giro di prelievo ed e' una sola per tutto l'impianto, e una
   ventiduesima collezione per un record solo sarebbe schema, DDL,
   migrazione e adapter per una riga.

   03/09/2026 — 4561 -> 4566: `caricoSpedizione` dichiarata in `_loadCache`.
   E' la TRAPPOLA 22 (§7): una chiave di `meta` non dichiarata li' vive in
   cache finche' nessuno ricarica la pagina, e poi sparisce. Su una sessione
   di carico morde nel caso esatto per cui e' stata salvata. */
/* 2.23 — da 4566 a 4578, e il perché.

   Il cruscotto è diventato di chi lo guarda: `_chiaveCruscotto` legge la
   sigla e decide su quale chiave di `meta` sta la preferenza. Sono quattro
   righe di codice più la spiegazione, e stanno QUI e non in un modulo per
   una ragione precisa: `modules/cruscotto.ts` è puro e non sa chi è
   collegato, mentre sapere in quale riga di `meta` vive un dato è
   esattamente il mestiere di `Store`.

   Le altre nove sono la TRAPPOLA 22 applicata a una FAMIGLIA di chiavi:
   `meta` si ricostruisce da un elenco dichiarato, e `dashboardLayout:<SIGLA>`
   non si può dichiarare, perché le sigle nascono coi loro operatori. Si tiene
   il prefisso. Senza quelle righe la preferenza durava fino al ricaricamento
   e poi tornava quella di serie — in silenzio, che è il modo in cui la
   trappola 22 morde.

   Il tetto serve a impedire che il nucleo assorba LOGICA. Ventun righe per
   scegliere una chiave e non perderla non sono logica assorbita — ma se la
   prossima volta si alza di nuovo senza una riga come questa, allora sì. */
/* 2.29 — da 4587 a 4596, e il perché.

   `coperturaWip` è il lettore che dice quanto di quel che un giro chiede è
   già fermo in reparto. Tre righe di codice più la spiegazione: la logica
   sta tutta in `coperturaInLavorazione` (`modules/wip.ts`), che è pura e non
   sa niente né di cache né di Store. Qui resta il solo mestiere che è di
   `Store` — prendere le righe in lavorazione dalla cache e passarle. */
/* 2.29.1 — da 4596 a 4606, e il perché.

   Dieci righe, e nove sono la spiegazione. `addOperator` prende un secondo
   argomento, `senzaMeta`, e la riga che tocca `meta` diventa condizionata.
   Non è logica assorbita: è l'ORDINE di due scritture che già c'erano. La
   prima chiude la finestra di primo avvio del servizio, quindi la seconda
   dev'essere preceduta dall'ingresso — e chi conosce quell'ordine è chi
   crea il primo Admin, non `Store`. Per questo la scelta sta qui e la
   decisione sta in `ui/app.ts`. */
/* 2.30 — da 4606 a 4654, e il perché.

   Le sessioni di prelievo passano da una a molte. In `Store` questo vale
   quattro lettori nuovi — la propria, quella di un'attività, quelle degli
   altri, tutte — e due funzioni che smettono di svuotare la collezione per
   toccare una chiave sola. La LOGICA non è entrata qui: «quale di queste
   sessioni è la mia» sta in `modules/sessioni.ts`, che è puro e non sa
   niente né di cache né di `App`. Qui resta il mestiere di `Store` —
   prendere l'elenco dalla cache e passarlo — più le spiegazioni, che sono la
   parte lunga: due delle tre funzioni cambiate facevano `clear`, e chi le
   rilegge deve sapere perché non lo fanno più. */
/* 2.31 — da 4654 a 4737, e il perché.

   `commitPreparazioneStop`: una tappa di preparazione SPOSTA la merce
   invece di scaricarla. Non è una variante di comodo di `commitPickStop` —
   è l'altra metà di una regola che c'era già. Un DDT pendente prenota la
   merce, e a scaricarla è l'evasione: scaricare anche al prelievo vorrebbe
   dire scaricarla due volte, e la seconda troverebbe il vano vuoto.

   Sta in `Store` e non in una vista perché è una transazione — togliere,
   mettere, registrare il movimento e timbrare la tappa devono riuscire
   insieme o non riuscire — e le transazioni non stanno nelle maschere. La
   metà lunga sono le spiegazioni: chi rilegge questo file deve trovare
   scritto perché due prelievi si comportano in modo diverso.

   2.35.1 — +88, e sono due gesti che mancavano.

   `commitPreparazioneUdc`: una tappa di unità di carico si prepara
   spostando il BANCALE, non la sua merce. Passando da
   `commitPreparazioneStop` le righe arrivavano di là senza `udc_id` — il
   pallet si scomponeva e restava indietro vuoto — e il caso più frequente,
   il bancale già in zona imballaggio, finiva in errore invece che in una
   tappa chiusa.

   `chiudiCompitoDiPercorso`: un percorso portato in fondo chiude la sua
   attività. `completeTask` rifiuta la chiusura a mano ed è giusto, ma un
   giro di tredici tappe confermate non è lavoro non registrato: mancava la
   strada, non il diritto. La condizione la verifica il metodo — sessione
   davvero del compito, nessuna tappa ancora da percorrere — perché una
   guardia che si fida di chi chiama non è una guardia.

   2.35.1 — +38, ed è una rilettura che rimette in fila cache e disco.

   Dentro una transazione `Persistence.add` non scrive: accoda e restituisce
   `undefined`. `addItem` metteva perciò in cache una riga SENZA `_id`, che è
   la chiave con cui la cache indicizza e il servizio riconosce: da quel
   momento la copia in memoria e il disco parlavano di due cose diverse, e
   comporre l'unità subito dopo un prelievo rispondeva «la merce non è in
   quel vano» — mentre ricaricando la pagina funzionava. Il vano di
   destinazione si rilegge dal servizio, e la riga fantasma si butta prima:
   metterci sopra quella vera non basta, perché senza `_id` non la
   sostituisce, le sta accanto.

   2.35.2 — +33, e sono quasi tutte spiegazioni di una guardia TOLTA.

   Un ordine di produzione chiuso non si poteva più riprelevare: il conto
   avrebbe sommato due lavorazioni sotto lo stesso numero, e la risposta era
   «serve un numero d'ordine nuovo». Ma un numero d'ordine lo emette la
   produzione, non il magazzino: chi si trovava davanti quel rifiuto poteva
   solo inventare un numero o portare via la merce senza registrarla. La
   guardia è caduta, il fatto no — `conto` alza `riaperto` quando ci sono
   movimenti più recenti della chiusura. Le righe sono il ritorno del valore
   e il campo; il resto è il perché, che è la parte che serve fra un anno.

   2.36 — +16, e sono il ponte fra un codice e il vano che c'è dietro.
   `vanoDiCodice` risponde a «quale vano?» sia che gli si dia un'ubicazione
   sia che gli si dia un'unità di carico, perché davanti a un bancale
   imballato l'unica etichetta leggibile è quella dell'unità. Le righe qui
   sono solo il collegamento fra le due domande che servono — «è
   un'ubicazione?» e «è un'unità, e dove sta?»: la regola vera, compreso
   quale dei due vince, sta in `modules/vano.ts` ed è provata da ferma.

   2.37 — +24, e quasi tutte sono la spiegazione di un rifiuto TOLTO.

   Un vano poteva portare più bancali, ma non due bancali della STESSA merce:
   `moveUdc` rifiutava, e tre pallet dello stesso prodotto su una campata
   sono la cosa più normale che ci sia. Il rifiuto difendeva da un problema
   vero — due righe con la stessa chiave lette con `find` danno un saldo che
   dipende dall'ordine di caricamento — ma difendeva vietando la realtà. Le
   tre domande che ne discendono (quanta ce n'è, dove si somma, da dove si
   toglie) stanno in `modules/righeVano.ts` e sono provate da ferme; qui c'è
   solo chi le chiama, più il perché, che è la parte che serve fra un anno.

   2.38 — +119, e sono i due capi di un'attività che non si chiude più a
   metà.

   `rimettiInCodaSpedizione`: una spedizione è tre lavori — radunare,
   imballare, caricare — e chi ne finisce uno restituisce il compito perché
   il prossimo lo faccia un altro. Non è `abandonTask`, che ritira un avvio
   che non ha prodotto niente e riporta il compito a chi l'aveva: qui il
   lavoro è stato fatto, e la sigla se ne va perché chi ha il transpallet
   non è chi ha il muletto in banchina.

   `chiudiCompitiDelDocumento`: e allora serviva un punto in cui l'attività
   si chiude davvero. È l'uscita della merce, e sta in `updatePendingStatus`
   perché le strade per far uscire un DDT sono tre — il carico del camion,
   l'evasione diretta, il conto terzi che sposta invece di scaricare — e
   tutte e tre passano di lì. Scriverlo in ognuna vorrebbe dire tre copie, e
   la terza che qualcuno dimentica.

   Il resto è la spiegazione di una `zona` tolta da `commitPreparazioneUdc`:
   il vano di arrivo lo scansiona l'operatore, e un vano scansionato non è
   una proposta da interpretare. */
const TETTO_STORE = 5071;

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
