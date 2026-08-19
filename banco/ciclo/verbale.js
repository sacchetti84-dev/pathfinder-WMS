/* IL VERBALE DEL CICLO.

   Un ciclo che stampa «tutto verde» non serve a niente il giorno che una
   cosa è storta: quello che serve è l'elenco di cosa è stato fatto, con i
   numeri, e la riga esatta in cui un conto non torna. Il file lo rilegge il
   giro dopo per sapere se un difetto è nuovo o è lo stesso di ieri. */

import { appendFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const FILE = new URL('./verbale.md', import.meta.url);
const DIFETTI = new URL('./difetti.json', import.meta.url);

export function apriVerbale(titolo) {
  writeFileSync(FILE, `# Ciclo 2.0 — ${titolo}\n\n${new Date().toISOString()}\n\n`, 'utf8');
}

export function riga(testo) {
  appendFileSync(FILE, testo + '\n', 'utf8');
  console.log(testo);
}

export function difetto(id, gravita, dove, cosa, prova) {
  const elenco = existsSync(DIFETTI) ? JSON.parse(readFileSync(DIFETTI, 'utf8')) : [];
  const gia = elenco.find((d) => d.id === id);
  const rec = { id, gravita, dove, cosa, prova, visto: new Date().toISOString() };
  if (gia) Object.assign(gia, rec); else elenco.push(rec);
  writeFileSync(DIFETTI, JSON.stringify(elenco, null, 1), 'utf8');
  riga(`\n> **DIFETTO ${id}** (${gravita}) — \`${dove}\`\n> ${cosa}\n> Prova: ${prova}\n`);
}

/** Quanto due numeri possono discostarsi prima che sia un difetto: la
    tolleranza è quella dell'unità, non una scelta del collaudo. KG porta tre
    decimali, quindi mezzo millesimo per operazione. */
export const TOLLERANZA = 0.0011;

export function quadra(atteso, trovato, tolleranza = TOLLERANZA) {
  return Math.abs(Number(atteso) - Number(trovato)) <= tolleranza;
}
