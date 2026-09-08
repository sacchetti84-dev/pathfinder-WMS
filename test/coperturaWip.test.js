/* IL RIQUADRO DI QUELLO CHE È GIÀ IN REPARTO — 2.29

   `coperturaInLavorazione` (`modules/wip.ts`) fa il conto e si prova in
   `wip.test.js`; qui si prova che il RIQUADRO dica quel che il conto
   contiene, e solo quello. Non c'è un DOM da premere: si legge la stringa,
   che è il modo in cui su questo applicativo si verifica un'interfaccia.

   LA PROVA CHE CONTA È L'ULTIMA: nessuna tappa viene toccata. Il riquadro
   informa, e la distinta resta quella che l'ordine dichiara. */
import { describe, it, expect } from 'vitest';
import { App } from '../src/ui/app';

const riga = (over = {}) => ({
  item_key: 'A#L1', article_code: 'A', lot_code: 'L1', uom: 'KG',
  chiesto: 100, suo: 0, altrui: 0, ordini_altrui: [],
  da_prelevare: 100, coperta: false, incerta: false, ...over,
});

const giro = (copertura, offroute = []) => ({
  copertura, offroute, stops: [], notes: [], warnings: [], ordini: [], capofila: 'ODP1',
});

describe('il riquadro di quello che è già di là', () => {
  it('senza niente di là non disegna niente', () => {
    App._routeParsed = giro([]);
    expect(App._routeCoperturaHTML()).toBe('');
    App._routeParsed = null;
    expect(App._routeCoperturaHTML()).toBe('');
  });

  it('una riga coperta dice che non serve prelevarla', () => {
    App._routeParsed = giro([riga({ suo: 100, da_prelevare: 0, coperta: true })]);
    const html = App._routeCoperturaHTML();
    expect(html).toContain('non serve prelevarlo');
    expect(html).toContain('1 coperte per intero');
    expect(html).toContain('A#L1');
  });

  it('una riga coperta a metà dice QUANTO ne manca, non che è a posto', () => {
    App._routeParsed = giro([riga({ suo: 40, da_prelevare: 60 })]);
    const html = App._routeCoperturaHTML();
    expect(html).toContain('ne mancano');
    expect(html).toContain('60');
    expect(html).not.toContain('non serve prelevarlo');
  });

  it('il residuo di un altro ordine si nomina, e non dice di non prelevare', () => {
    App._routeParsed = giro([riga({ altrui: 40, ordini_altrui: ['ODP9'] })]);
    const html = App._routeCoperturaHTML();
    expect(html).toContain('di un altro ordine');
    expect(html).toContain('ODP9');
    expect(html).not.toContain('non serve prelevarlo');
  });

  it('quello che non si è potuto contare si manda a guardare di persona', () => {
    App._routeParsed = giro([riga({ incerta: true, da_prelevare: null })]);
    const html = App._routeCoperturaHTML();
    expect(html).toContain('da verificare di persona');
    expect(html).not.toContain('ne mancano');
  });

  it('una riga che è anche fra le non prelevabili lo dice: sono lo stesso fatto', () => {
    App._routeParsed = giro([riga({ suo: 100, da_prelevare: 0, coperta: true })],
      [{ article_code: 'A', lot_code: 'L1', reason: 'lot_absent_other_lots' }]);
    expect(App._routeCoperturaHTML()).toContain('non prelevabili');
  });

  it('NESSUNA TAPPA SI TOCCA: il riquadro informa e basta', () => {
    const sorgente = App._routeCoperturaHTML.toString();
    expect(sorgente).not.toMatch(/_routeOrdini|ricalibra|\.stops\s*=|splice|total_qty/);
    /* E nemmeno un gesto da premere: la decisione è dell'operatore, coi
       gesti che il giro ha già. */
    expect(sorgente).not.toContain('onclick');
  });
});
