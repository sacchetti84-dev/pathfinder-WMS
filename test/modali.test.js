/* `modalOverlay` E' UNO SOLO, E LA PROVA STA QUI PERCHE' NON C'E' UN DOM.

   `showModal` appendeva un overlay nuovo senza togliere quello di prima, e
   `closeModal()` cerca per id: `getElementById` restituisce il PRIMO del
   documento, cioe' il piu' vecchio, cioe' quello sotto. Una finestra che si
   ridisegna da dentro un proprio gestore — Personalizza il cruscotto, che
   riapre la finestra a ogni spunta — ne impilava una per modifica, e ogni
   clic su Chiudi ne toglieva una invisibile: lo schermo non cambiava finche'
   non se ne toglieva l'ultima. Visto in produzione il 20/08.

   Le altre finestre con un id fisso questa regola la seguivano gia', ognuna
   col suo commento (`_pickLoc`, `_scegliColli`, `_shipMostraDestinazioni`).
   `showModal` era l'unica che non la seguiva. */
import { test, expect } from 'vitest';
import fs from 'node:fs';

test('showModal toglie l\'overlay di prima prima di appenderne uno nuovo', () => {
  const app = fs.readFileSync('src/ui/app.ts', 'utf8');
  const inizio = app.indexOf('showModal(title');
  expect(inizio).toBeGreaterThan(-1);

  /* il corpo va dall'intestazione all'unico appendChild che lo chiude */
  const appende = app.indexOf('document.body.appendChild(overlay)', inizio);
  const toglie = app.indexOf("getElementById('modalOverlay')?.remove()", inizio);

  expect(appende).toBeGreaterThan(-1);
  expect(toglie).toBeGreaterThan(-1);
  expect(toglie).toBeLessThan(appende);
});

/* `app.ts` era finito con dentro «non trovata» scritto in cp1252 piu' un
   carattere di controllo: byte che UTF-8 non sa leggere, in un sorgente che
   la build legge come UTF-8. In un commento non rompe niente, ed e'
   esattamente il motivo per cui poteva restarci per sempre. */
test('i sorgenti sono UTF-8 validi', () => {
  const dec = new TextDecoder('utf-8', { fatal: true });
  const rotti = [];
  const giro = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) giro(p);
      else if (/\.(ts|js|css|html)$/.test(e.name)) {
        try { dec.decode(fs.readFileSync(p)); } catch { rotti.push(p); }
      }
    }
  };
  giro('src');
  expect(rotti).toEqual([]);
});
