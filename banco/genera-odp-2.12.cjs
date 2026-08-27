/* GLI ODP DI PROVA DELLA 2.12 — generati, non inventati.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Il banco non ha nessun file ODP: quelli veri escono da Sage e non stanno
   nel repository. Questi li costruisce SheetJS nello stesso formato che
   `modules/odpParser.ts` legge, e chiedono merce CHE SUL BANCO C'E'
   DAVVERO — articolo, lotto e quantita' presi dalle giacenze del database
   di collaudo.

   PERCHE' 7000924 E 6000366. Sono i due soli articoli del banco che
   dichiarano l'unita' E la quantita' per collo: `unit` KG piu'
   `pieces_per_pack` 25 e 20. Su tutto il resto la gestione a UM non si
   accende — voce 6 — e senza UM la ripartizione del consumo non si puo'
   nemmeno calcolare. Provare il giro su un articolo a soli colli
   proverebbe meta' della funzione senza dirlo.

   Si lancia:  node banco/genera-odp-2.12.cjs
   Esce in:    banco/odp-2.12/ */

const path = require('path');
const fs = require('fs');
const XLSX = require(path.join(__dirname, '..', 'node_modules', 'xlsx'));

const FUORI = path.join(__dirname, 'odp-2.12');

/* ── Le forme che il parser riconosce ───────────────────────────────────
   Copiate da `test/odp.test.js`, che le tiene allineate al file vero. */

const testata = (odpNum, commessa, finito, desc, lotto, qta, um) => [
  ["QTA'  PREVISTA", 'N.ORDINE ', 'DATA PROGRAMMAZIONE', qta, um, 'ARTICOLO',
   'N.Ordine cliente', 'Andrea Sacchetti', "QTA'  REALIZZATA", odpNum, 46239,
   finito, '', 'Commessa', 'Cliente', '', '', commessa],
  [],
  ['Articoli da Realizzare:'],
  ['Articolo', 'Descrizione', 'Lotto', 'Scad.', 'Qtà  Prevista'],
  [finito, desc, lotto, '', um, qta],
  ['Art. cliente:'],
  [],
];

const materiali = () => [
  ['Articolo', 'Descrizione', 'Conservazione', 'Quantità x unità', 'Quantità  TOTALE'],
  [],
];

const coda = () => [
  [],
  ['N°Operazione', 5, 'PESATURA', 'Centro princ.'],
  ['N°Operazione', 10, 'MISCELAZIONE POLVERI', 'Centro princ.'],
  ['Prelievo campioni', '1 barattolo I-M-F'],
  ['Quantità Prodotta'],
];

/* Una riga materiale: il totale e' l'ultimo numero, l'unita' l'etichetta
   subito prima, e la penultima cifra e' la quantita' per unita' prodotta. */
const riga = (code, desc, perUnita, um, totale) =>
  [code, 'Materie prime ALIMENTARI', desc, '', 'GR', perUnita, um, totale];

const lotto = (code, fornitore, um, qty) =>
  ['Lotto', code, 'Lotto fornitore', fornitore, um, qty];

function scrivi(nome, righe) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), 'Sheet1');
  const dove = path.join(FUORI, nome);
  XLSX.writeFile(wb, dove);
  return dove;
}

const odp = (num, commessa, finito, desc, lottoFinito, qta, corpo) =>
  [...testata(num, commessa, finito, desc, lottoFinito, qta, 'KG'),
   ...materiali(), ...corpo, ...coda()];

fs.rmSync(FUORI, { recursive: true, force: true });
fs.mkdirSync(FUORI, { recursive: true });

const fatti = [];

/* ── A · IL GIRO: cinque ODP sullo stesso lotto ─────────────────────────
   7000924 LECITINA DI SOIA, KG, 25 per collo, lotto 78963. Cinque ordini
   che ne chiedono 5 KG l'uno fanno 25 KG: un sacco intero. Prelevati uno
   alla volta sono cinque giri, e il primo si porta via il sacco.

   Le quantita' sono DIVERSE apposta — 5, 5, 5, 4 e 6 — perche' con cinque
   quote uguali una ripartizione sbagliata darebbe lo stesso numero giusto,
   e la prova non direbbe niente. */
[['ODP2612001', 5], ['ODP2612002', 5], ['ODP2612003', 5],
 ['ODP2612004', 4], ['ODP2612005', 6]].forEach(([num, kg], i) => {
  fatti.push(scrivi(`${num}-giro-lecitina-${kg}kg.xlsx`, odp(
    num, `ODV2612_${100 + i}`, '4060900/01',
    `GIRO DI PROVA ${i + 1} — miscela per bustine`, `26G${i + 1}`, 100,
    [riga('7000924', 'LECITINA DI SOIA', kg / 100, 'KG', kg), [],
     lotto('78963', '3071555', 'KG', kg)])));
});

/* ── B · LA SOSTA: tre righe che stanno nello stesso corridoio ──────────
   Tutte e tre le giacenze stanno in MAG1-RAKA-01-02 e si differenziano per
   livello. Quale vano scelga il motore lo decide la serpentina; quel che
   conta e' che due righe finiscano nello STESSO codice di ubicazione, ed e'
   li' che si vede se l'ubicazione la chiede una volta o tre. */
fatti.push(scrivi('ODP2612010-sosta-tre-righe.xlsx', odp(
  'ODP2612010', 'ODV2612_200', '4060901/01',
  'SOSTA DI PROVA — tre righe in un corridoio', '26S1', 200,
  [riga('6000366', 'PALMITOILETANOLAMIDE HP ULTRA MICRONIZZATA', 0.2, 'KG', 40), [],
   lotto('456321', '3071500', 'KG', 40),
   riga('6000366', 'PALMITOILETANOLAMIDE HP ULTRA MICRONIZZATA', 0.1, 'KG', 20), [],
   lotto('123456', '3071501', 'KG', 20),
   riga('7000924', 'LECITINA DI SOIA', 0.25, 'KG', 50), [],
   lotto('78963', '3071555', 'KG', 50)])));

/* ── C · LA RICALIBRAZIONE: una testata con un numero tondo ─────────────
   350 KG di prodotto finito, e una distinta che ci sta dentro. Scrivere 700
   nel campo della quantita' deve raddoppiare ogni riga e ogni lotto. */
fatti.push(scrivi('ODP2612020-ricalibro-350kg.xlsx', odp(
  'ODP2612020', 'ODV2612_300', '4060902/01',
  'RICALIBRO DI PROVA — 350 KG dichiarati', '26R1', 350,
  [riga('7000924', 'LECITINA DI SOIA', 0.02, 'KG', 7), [],
   lotto('78963', '3071555', 'KG', 7),
   riga('6000366', 'PALMITOILETANOLAMIDE HP ULTRA MICRONIZZATA', 0.009, 'KG', 3.15), [],
   lotto('456321', '3071500', 'KG', 3.15)])));

console.log(`\n  ${fatti.length} ODP di prova in banco/odp-2.12/\n`);
for (const f of fatti) console.log('   ', path.basename(f));
console.log(`
  A · il giro      ODP2612001..005 — 5+5+5+4+6 = 25 KG di 7000924#78963,
                   che sul banco e' UN sacco da 25. Si caricano tutti e
                   cinque nella stessa schermata.
  B · la sosta     ODP2612010 — tre righe nel corridoio MAG1-RAKA-01-02.
  C · il ricalibro ODP2612020 — testata 350 KG, distinta 7 + 3,15 KG.
`);
