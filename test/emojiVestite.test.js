/* LE ICONE CHE ESCONO MONOCROMATICHE — 2.16
   © Andrea Sacchetti — Dietopack S.r.l.

   Cinque caratteri hanno presentazione TESTUALE di serie: `✏️ ⚠️ ⚙️ ℹ️ ♻️`.
   Scritti nudi il browser li disegna come glifi di testo, non come icone. La
   matita di «Modifica» usciva larga 14px contro i 19,2px della sua forma a
   icona, e su schermo si leggeva come un trattino: un pulsante che non dice
   più cosa fa. L'avviso usciva come un triangolo grigio invece del segnale
   giallo — in un magazzino GMP un avviso che non si legge come avviso è un
   avviso che non c'è.

   Si vestono col selettore U+FE0F. Verificato in pagina misurando il glifo.

   LE FRECCE RESTANO NUDE, e non è una dimenticanza: `↔ ▶ ↩` marcano il tipo
   di riga dentro tabelle dense, e da icone diventerebbero colorate e più
   pesanti di quel che accompagnano. Lì il glifo di testo è quello giusto.

   Si legge il sorgente: qui non c'è un DOM, ed è la strada di
   `registro-completo.test.js` e `modali.test.js`. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DA_VESTIRE = [...'\u270f\u26a0\u2699\u2139\u267b'];
const VS = '\ufe0f';

function sorgenti(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sorgenti(p));
    else if (/\.(ts|js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('nell\'interfaccia nessuna delle cinque icone resta nuda', () => {
  const nudi = [];
  for (const file of sorgenti('src')) {
    const testo = fs.readFileSync(file, 'utf8');
    const righe = testo.split('\n');
    righe.forEach((riga, n) => {
      [...riga].forEach((c, i) => {
        if (DA_VESTIRE.includes(c) && riga[i + 1] !== VS) {
          nudi.push(`${file}:${n + 1} — ${c} senza selettore`);
        }
      });
    });
  }
  expect(nudi, nudi.join('\n')).toEqual([]);
});
