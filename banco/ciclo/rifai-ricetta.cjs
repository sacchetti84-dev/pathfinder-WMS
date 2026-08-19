/* RIFÀ `ricetta.js` DALL'ODP VERO.

   La ricetta non sta nel repository, e non è una dimenticanza: quindici
   componenti con le quantità esatte e i lotti fornitore sono la formulazione
   di un prodotto, cioè il genere di dato che il `.gitignore` tiene fuori
   insieme ai movimenti e alle sigle operatore. Il CODICE che la usa invece
   c'è, ed è il pezzo che serve a chiunque debba rifare il collaudo.

   Questo comando ricostruisce il file leggendo l'ordine di produzione che
   sta in `ARCHIVIO/BACKUP E FILE DI TEST/` — anch'esso fuori dal repository,
   e anch'esso sulla macchina di chi lavora:

     node banco/ciclo/rifai-ricetta.cjs [percorso-dell-odp.xlsx]

   PERCHÉ SI RIGENERA INVECE DI SCRIVERLO A MANO. Un ciclo provato su
   quantità inventate non incontra mai il collo incompleto, l'arrotondamento
   al terzo decimale, o il componente che pesa ventiquattro grammi accanto a
   uno che ne pesa centonovantacinque chili. I difetti che il ciclo ha
   trovato stavano tutti lì. */

const XLSX = require('xlsx');
const { writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..', '..');
const ODP_PREDEFINITO = path.join(RADICE, 'ARCHIVIO', 'BACKUP E FILE DI TEST', '07082026_gluc.xlsx');
const USCITA = path.join(__dirname, 'ricetta.js');

const file = process.argv[2] ? path.resolve(process.argv[2]) : ODP_PREDEFINITO;
if (!existsSync(file)) {
  console.error(`Non trovo l'ordine di produzione:\n  ${file}\n\n` +
    'Passane uno: node banco/ciclo/rifai-ricetta.cjs <file.xlsx>');
  process.exit(2);
}

const righe = XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets[XLSX.readFile(file).SheetNames[0]], { header: 1 });

/* Le ancore sono quelle del foglio di Sage: una riga di componente porta il
   codice in prima colonna e «Materie prime» in seconda; il lotto sta nella
   riga «Lotto» che segue. La colonna del lotto SI SALTA — un lotto tutto
   cifre esce numerico, e letto come quantità ha già chiesto 260.594 KG di
   vitamina A su una miscela da 380. */
const componenti = [];
let testata = { odp: '', articolo: '', lotto: '', quantita: 0 };

for (let i = 0; i < righe.length; i++) {
  const r = righe[i] || [];
  if (!testata.odp) {
    const j = r.findIndex((c) => /^ODP\d+/i.test(String(c ?? '')));
    if (j > -1) {
      testata.odp = String(r[j]).trim();
      testata.quantita = Number(r.find((c) => typeof c === 'number' && c > 1)) || 0;
    }
  }
  const codice = String(r[0] ?? '').trim();
  if (!/^\d{6,}$/.test(codice) || !/materie prime/i.test(String(r[1] ?? ''))) continue;

  const desc = String(r[2] ?? '').trim().replace(/^"|"$/g, '').replace(/""/g, '"');
  const kg = Number(r[r.length - 1]);
  /* Il lotto sta nelle righe subito sotto, dove la prima cella dice «Lotto». */
  let lotto = '';
  for (let k = i + 1; k < Math.min(i + 6, righe.length); k++) {
    if (String((righe[k] || [])[0] ?? '').trim().toLowerCase() === 'lotto') {
      lotto = String((righe[k] || [])[1] ?? '').trim();
      break;
    }
  }
  if (Number.isFinite(kg) && kg > 0) componenti.push({ code: codice, desc, lot: lotto, kg });
}

if (!componenti.length) {
  console.error('Nessun componente riconosciuto: il foglio non ha la forma attesa.');
  process.exit(3);
}

const somma = Math.round(componenti.reduce((s, c) => s + c.kg, 0) * 1000) / 1000;
const largo = Math.max(...componenti.map((c) => c.desc.length));

const testo = `/* LA RICETTA VERA — ${testata.odp}.

   GENERATO — non si scrive a mano: \`node banco/ciclo/rifai-ricetta.cjs\`.
   Sorgente: ${path.basename(file)}

   Numeri veri, con la loro asimmetria: ${componenti[0].kg} kg di ${componenti[0].desc.split(' ')[0].toLowerCase()}
   accanto ai ${componenti[componenti.length - 1].kg} kg dell'ultimo componente. Un ciclo provato su
   quantità tutte uguali non incontra mai il collo incompleto, l'arrotondamento,
   o il lotto che sta in un'unica confezione.

   LA SOMMA DEI ${componenti.length} FA ${String(somma).replace('.', ',')} KG. È l'invariante aritmetica su cui il
   ciclo si appoggia: qualunque strada la merce faccia — magazzino, WIP, reso,
   consumo — quei chili devono ritrovarsi tutti, e nel posto giusto.

   Questo file NON sta nel repository: la formulazione di un prodotto e i
   lotti fornitore sono dato, non codice. Vedi \`.gitignore\`. */

export const ODP_ORIGINE = ${JSON.stringify(testata.odp)};
export const QUANTITA_ORDINE = ${testata.quantita || somma};
export const UOM = 'KG';

/** Il lotto è quello che l'ODP ha già impegnato. */
export const RICETTA = [
${componenti.map((c) => `  { code: ${JSON.stringify(c.code).padEnd(11)}, desc: ${(JSON.stringify(c.desc) + ',').padEnd(largo + 4)} lot: ${JSON.stringify(c.lot).padEnd(10)}, kg: ${c.kg} },`).join('\n')}
];

/** Gli ordini del ciclo. Uno è la ricetta com'è; gli altri la scalano, così
    il ciclo incontra quantità diverse sugli STESSI lotti — che è la
    situazione vera di un magazzino, e quella in cui un saldo sbagliato si
    nasconde meglio. */
export const ORDINI = [
  { odp: ${JSON.stringify(testata.odp)}, fattore: 1,    nota: 'la miscela vera' },
  { odp: 'ODP-META',  fattore: 0.5,  nota: 'mezza miscela' },
  { odp: 'ODP-QUARTO', fattore: 0.25, nota: 'un quarto — dove gli arrotondamenti mordono' },
  { odp: 'ODP-DECIMO', fattore: 0.1,  nota: 'un decimo — il componente più piccolo scende a pochi grammi' },
];

/* Tre decimali: la stessa precisione che l'applicativo tiene per i KG.
   Arrotondare più fine qui vorrebbe dire chiedere allo scaffale un millesimo
   che lo scaffale non sa rappresentare, e il ciclo si fermerebbe su un
   difetto del collaudo invece che su uno dell'applicativo. */
const arrotonda = (n) => Math.round(n * 1000) / 1000;

/** Le righe di un ordine, scalate. */
export function righeOrdine(fattore) {
  return RICETTA.map((r) => ({ ...r, kg: arrotonda(r.kg * fattore) }));
}

export function totaleOrdine(fattore) {
  return arrotonda(righeOrdine(fattore).reduce((s, r) => s + r.kg, 0));
}

/** Quanto serve in tutto di ogni componente, per tutti gli ordini messi
    insieme: è quello che il carico deve mettere a scaffale perché il ciclo
    possa girare fino in fondo. */
export function fabbisogno() {
  const per = new Map();
  for (const o of ORDINI) {
    for (const r of righeOrdine(o.fattore)) {
      per.set(r.code, arrotonda((per.get(r.code) || 0) + r.kg));
    }
  }
  return per;
}
`;

writeFileSync(USCITA, testo, 'utf8');
console.log(`Scritto ${path.relative(RADICE, USCITA)}`);
console.log(`  ordine     ${testata.odp}`);
console.log(`  componenti ${componenti.length}`);
console.log(`  somma      ${somma} KG${testata.quantita ? ` (la testata dichiara ${testata.quantita})` : ''}`);
