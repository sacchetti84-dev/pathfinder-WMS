/* LA PRENOTAZIONE DEL PROPRIO DOCUMENTO NON CONTA CONTRO DI SÉ — 2.35.1
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   IL DIFETTO, e perché nessuna prova lo vedeva.

   Un DDT pendente PRENOTA la merce: `getAvailableQty` sottrae dai colli
   fisici quelli che i documenti aperti hanno impegnato, così nessun altro può
   portarli via. È giusto, ed è in piedi dalla 1.4.

   Una preparazione di spedizione va a prendere ESATTAMENTE la merce che il
   suo documento ha prenotato. Chiedendo la disponibilità senza escludere quel
   documento, la risposta è zero: la scheda della tappa scriveva «Colli in
   ubicazione 0» in rosso sopra un bancale pieno, e la conferma si fermava con
   «nessun collo disponibile (impegnato su DDT pendente)». Cioè il sistema
   diceva all'operatore che la merce era impegnata — da lui stesso.

   Nessuna tappa di preparazione ha mai potuto chiudersi, dalla 2.31 alla
   2.35. Provato a video l'08/09/2026: scansione dell'unità giusta, spunta
   accettata, e la conferma rifiutata lo stesso.

   `getAvailableQty` accetta l'esclusione di un documento dal 2026 — è lo
   stesso argomento che usa l'evasione, e per la stessa ragione. Mancava di
   passarlo, e mancava in tutti e due i posti che la tappa interroga.

   PERCHÉ UNA PROVA CHE LEGGE IL SORGENTE. La regola vive dentro una maschera
   che vuole un DOM, un servizio e un documento pendente: provarla eseguendola
   vuol dire il banco, e il banco non gira a `npm test`. Quel che si può
   fissare da fermi è che quei due punti non tornino a chiedere la
   disponibilità senza dire per conto di chi la chiedono — ed è esattamente
   il difetto, non un suo contorno. */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RADICE = path.resolve(import.meta.dirname, '..');
const sorgente = fs.readFileSync(path.join(RADICE, 'src/ui/views/percorso.ts'), 'utf8');

/** Il corpo di un metodo, dalla sua firma alla riga che lo chiude. Serve a
    non far passare per buona una chiamata che sta in un altro metodo. */
function corpo(nome) {
  const i = sorgente.indexOf(`\n  ${nome}(`) >= 0
    ? sorgente.indexOf(`\n  ${nome}(`)
    : sorgente.indexOf(`\n  async ${nome}(`);
  expect(i, `il metodo ${nome} non c'è più: la prova sta guardando un file diverso`).toBeGreaterThan(-1);
  const fine = sorgente.indexOf('\n  },', i);
  expect(fine, `il metodo ${nome} non si chiude come gli altri`).toBeGreaterThan(i);
  return sorgente.slice(i, fine);
}

/** Le chiamate a `getAvailableQty` dentro un corpo, con i loro argomenti. */
function chiamate(testo) {
  return [...testo.matchAll(/getAvailableQty\(([^)]*)\)/g)].map((m) => m[1].trim());
}

describe('la tappa chiede la disponibilità per conto del proprio documento', () => {
  it('la scheda della tappa esclude il documento che la sta muovendo', () => {
    const c = chiamate(corpo('_routeDisponibili'));
    expect(c, 'la scheda non chiede più la disponibilità: la prova va riscritta').toHaveLength(1);
    expect(c[0].split(',').length,
      'due argomenti soli: la scheda scriverà «0 colli in ubicazione» in rosso su un bancale pieno, '
      + 'perché quei colli sono impegnati dal DDT che si sta preparando').toBe(3);
  });

  it('e la conferma del prelievo pure', () => {
    const c = chiamate(corpo('_routeConfirmStop'));
    expect(c, 'la conferma non chiede più la disponibilità: la prova va riscritta').toHaveLength(1);
    expect(c[0].split(',').length,
      'due argomenti soli: nessuna tappa di preparazione potrà mai chiudersi, '
      + 'perché la merce risulta impegnata dal documento che la sta facendo prendere').toBe(3);
  });

  it('il documento escluso è quello della sessione, non uno qualunque', () => {
    /* Escludere il documento sbagliato sarebbe peggio del difetto: farebbe
       prendere merce impegnata da un altro DDT. */
    const conferma = corpo('_routeConfirmStop');
    expect(conferma).toMatch(/session\.prep_doc_id/);
    expect(corpo('_routeDisponibili')).toMatch(/getActivePickSession\(\)\?\.prep_doc_id/);
  });

  it('e su un percorso che non è una preparazione si esclude NIENTE', () => {
    /* `prep_doc_id` è assente su un prelievo di produzione, e allora
       l'esclusione deve valere `null`: un `undefined` che arrivasse fino a
       `getPendingQtyForItem` come stringa «undefined» non escluderebbe
       niente per caso, ma per fortuna. */
    expect(corpo('_routeConfirmStop')).toMatch(/prep_doc_id \|\| null/);
    expect(corpo('_routeDisponibili')).toMatch(/prep_doc_id \|\| null/);
  });
});
