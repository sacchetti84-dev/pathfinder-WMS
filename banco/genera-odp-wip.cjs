/* GLI ODP DI PROVA DELLA REVISIONE WIP — generati dal database del banco.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `genera-odp-2.12.cjs` scrive lotti fissi, presi dal magazzino del 27/08:
   su un database diverso quelle righe non trovano niente e il percorso
   nasce vuoto. Qui articolo, lotto e quantita' si leggono da `banco/db/ui.db`
   — un ODP che chiede merce che non c'e' non prova niente.

   Si lancia:  node banco/genera-odp-wip.cjs
   Esce in:    banco/odp-wip/ */

const path = require('path');
const fs = require('fs');
const XLSX = require(path.join(__dirname, '..', 'node_modules', 'xlsx'));
const D = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));

const DB = path.join(__dirname, 'db', 'ui.db');
const FUORI = path.join(__dirname, 'odp-wip');

/* Le forme che il parser riconosce, copiate da `test/odp.test.js`. */
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
const materiali = () => [['Articolo', 'Descrizione', 'Conservazione', 'Quantità x unità', 'Quantità  TOTALE'], []];
const coda = () => [[], ['N°Operazione', 5, 'PESATURA', 'Centro princ.'],
  ['N°Operazione', 10, 'MISCELAZIONE POLVERI', 'Centro princ.'],
  ['Prelievo campioni', '1 barattolo I-M-F'], ['Quantità Prodotta']];
const riga = (code, desc, perUnita, um, totale) =>
  [code, 'Materie prime ALIMENTARI', desc, '', 'GR', perUnita, um, totale];
const lotto = (code, fornitore, um, qty) => ['Lotto', code, 'Lotto fornitore', fornitore, um, qty];

const odp = (num, commessa, finito, desc, lottoFinito, qta, corpo) =>
  [...testata(num, commessa, finito, desc, lottoFinito, qta, 'KG'),
   ...materiali(), ...corpo, ...coda()];

function scrivi(nome, righe) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), 'Sheet1');
  XLSX.writeFile(wb, path.join(FUORI, nome));
  return nome;
}

/* ── Che merce c'e' davvero, e quale se ne puo' chiedere ──────────────── */
const db = new D(DB, { readonly: true });
const lots = db.prepare('select * from lots').all().map((r) => JSON.parse(r.data));
const inv = db.prepare('select * from inventory').all().map((r) => JSON.parse(r.data));
const art = new Map(db.prepare('select * from articles').all()
  .map((r) => { const a = JSON.parse(r.data); return [a.article_code, a]; }));

/* Serve un lotto che dichiari unita' E quantita' per collo: senza, la
   ripartizione del consumo non si calcola e la prova direbbe meta' cosa. */
const buoni = lots.filter((l) => l.uom && l.uom_per_collo > 0)
  .map((l) => {
    const righe = inv.filter((i) => i.article_code === l.article_code && i.lot_code === l.lot_code);
    const colli = righe.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    return { ...l, colli, kg: colli * l.uom_per_collo,
             desc: art.get(l.article_code)?.description || l.article_code };
  })
  .filter((l) => l.colli >= 4)
  /* I chili prima dei pezzi: le materie prime del reparto si pesano, e una
     prova che gira sui soli pezzi non incontra mai i decimali. */
  .sort((a, b) => (a.uom === 'KG' ? 0 : 1) - (b.uom === 'KG' ? 0 : 1) || b.colli - a.colli);

if (buoni.length < 2) {
  console.error('Servono almeno due lotti con unita\' e quantita\' per collo. Trovati:', buoni.length);
  process.exit(1);
}

fs.rmSync(FUORI, { recursive: true, force: true });
fs.mkdirSync(FUORI, { recursive: true });

/* A · IL GIRO — cinque ordini sullo stesso lotto. Le quantita' sono
   diverse apposta: con cinque quote uguali una ripartizione sbagliata
   darebbe lo stesso numero giusto. */
const A = buoni[0];
const quote = [5, 5, 5, 4, 6].map((n) => n * A.uom_per_collo / 5);
const fatti = [];
quote.forEach((kg, i) => {
  const num = `ODP961${i + 1}`;
  fatti.push(scrivi(`${num}-giro-${kg}${A.uom}.xlsx`, odp(
    num, `ODVW_${100 + i}`, '4060900/01',
    `GIRO DI PROVA ${i + 1}`, `26W${i + 1}`, 100,
    [riga(A.article_code, A.desc, kg / 100, A.uom, kg), [],
     lotto(A.lot_code, '3071555', A.uom, kg)])));
});

/* B · DUE RIGHE, DUE LOTTI — l'ordine su cui si prova il reso e il suo
   storno: serve piu' di una riga, o correggerne una non si distingue dal
   chiudere l'ordine. */
const B = buoni[1];
const kgA = 3 * A.uom_per_collo, kgB = 2 * B.uom_per_collo;
fatti.push(scrivi('ODP9620-due-righe.xlsx', odp(
  'ODP9620', 'ODVW_200', '4060901/01', 'RESO E STORNO — due righe', '26W20', 100,
  [riga(A.article_code, A.desc, kgA / 100, A.uom, kgA), [],
   lotto(A.lot_code, '3071500', A.uom, kgA),
   riga(B.article_code, B.desc, kgB / 100, B.uom, kgB), [],
   lotto(B.lot_code, '3071501', B.uom, kgB)])));

/* C · IL RICALIBRO — una testata con un numero tondo. */
fatti.push(scrivi('ODP9630-ricalibro.xlsx', odp(
  'ODP9630', 'ODVW_300', '4060902/01', 'RICALIBRO — 350 KG dichiarati', '26W30', 350,
  [riga(A.article_code, A.desc, A.uom_per_collo / 350, A.uom, A.uom_per_collo), [],
   lotto(A.lot_code, '3071555', A.uom, A.uom_per_collo)])));

console.log(`\n  ${fatti.length} ODP in banco/odp-wip/  (da ${path.basename(DB)})`);
console.log(`  A · giro       ${A.article_code}#${A.lot_code} — ${quote.join('+')} = ${quote.reduce((s, n) => s + n, 0)} ${A.uom} · a scaffale ${A.colli} colli da ${A.uom_per_collo}`);
console.log(`  B · due righe  ODP9620 — ${kgA} ${A.uom} di ${A.article_code}#${A.lot_code} + ${kgB} ${B.uom} di ${B.article_code}#${B.lot_code}`);
console.log(`  C · ricalibro  ODP9630 — testata 350, distinta ${A.uom_per_collo} ${A.uom}\n`);
for (const f of fatti) console.log('   ', f);
