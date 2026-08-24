/* LA RIGA CHE NASCE `hidden` NON SI ACCENDE CON LO STILE IN RIGA.

   `_ntTypeChanged` mostrava e nascondeva le righe per tipo con
   `style.display`, ma `ntDdtRow` e `ntSamplingRow` portano `hidden` nel
   markup: `display: ''` toglie lo stile in riga e lascia comandare la
   classe, quindi le due righe non comparivano mai. Il Campionamento
   pretendeva «Campione per chi» — obbligatorio — dentro una riga che
   nessuno poteva vedere: la maschera rifiutava la conferma indicando un
   campo assente dallo schermo. Visto in browser il 24/08, sul pacchetto
   2.2 costruito.

   Non c'e' un DOM in queste prove, e la regola si legge dal sorgente. */
import { test, expect } from 'vitest';
import fs from 'node:fs';

const vista = fs.readFileSync('src/ui/views/compiti.ts', 'utf8');

/* Il corpo di `_ntTypeChanged`, dall'intestazione alla riga che lo chiude. */
const corpo = (() => {
  const inizio = vista.indexOf('_ntTypeChanged() {');
  expect(inizio).toBeGreaterThan(-1);
  const fine = vista.indexOf('this._ntCercaArticolo();', inizio);
  expect(fine).toBeGreaterThan(inizio);
  return vista.slice(inizio, fine);
})();

test('le righe che nascono nascoste le accende la classe, non lo stile', () => {
  const nascoste = ['ntDdtRow', 'ntSamplingRow'];
  for (const id of nascoste) {
    const riga = vista.match(new RegExp(`<div[^>]*id="${id}"`));
    expect(riga, `${id} non c'e' piu' nel markup`).not.toBeNull();
    expect(riga[0], `${id} non nasce piu' nascosto`).toMatch(/\bhidden\b/);
    expect(corpo).toContain(`mostra('${id}'`);
  }
  expect(corpo).toContain("classList.toggle('hidden'");
});
