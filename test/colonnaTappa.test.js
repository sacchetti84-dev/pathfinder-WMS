/* IL DISEGNO DELLA CAMPATA DENTRO LA SCHEDA DELLA TAPPA — 2.22

   `modules/colonna.ts` risponde alla domanda; qui si prova che il disegno
   dice quel che la risposta contiene, e SOLO quello. Non c'e' un DOM da
   premere: si legge la stringa, che e' il modo in cui su questo applicativo
   si verifica un'interfaccia — ogni bottone qui dentro scrive nel magazzino
   di qualcuno. */
import { describe, it, expect } from 'vitest';
import { App } from '../src/ui/app';

const vano = (level, stato, tappa = false) => ({
  code: `DP-A-01-06-${level}`, level, stato, tappa,
});

const colonna = {
  aisle: 4, bay: 6,
  vani: [
    vano('2', 'blocked'),
    vano('1', 'occupied', true),
    vano('T', 'empty'),
  ],
  rischioLotto: [],
};

describe('il disegno della campata', () => {
  it('non disegna niente quando non c’è una colonna', () => {
    expect(App._routeColonnaHTML(null)).toBe('');
  });

  it('porta corsia e campata, e un vano per livello', () => {
    const html = App._routeColonnaHTML(colonna);
    expect(html).toContain('Corsia 4 · campata 6');
    expect((html.match(/class="route-col-vano /g) || []).length).toBe(colonna.vani.length);
  });

  it('accende il vano della tappa e nessun altro', () => {
    const html = App._routeColonnaHTML(colonna);
    expect((html.match(/route-col-vano--tappa/g) || []).length).toBe(1);
    expect(html).toContain('Da prelevare');
  });

  it('gli altri livelli portano lo stato e nient’altro', () => {
    const html = App._routeColonnaHTML(colonna);
    expect(html).toContain('Bloccata');
    expect(html).toContain('Vuota');
    /* Nessun articolo, nessun lotto, nessun numero di colli: i livelli da
       non toccare non hanno bisogno di informazioni. */
    expect(html).not.toMatch(/ART-|lott|coll/i);
  });

  it('non c’è niente da premere: si guarda e basta', () => {
    expect(App._routeColonnaHTML(colonna)).not.toMatch(/onclick|<button|href=/);
  });

  it('dice da che parte è terra', () => {
    expect(App._routeColonnaHTML(colonna)).toContain('route-col-terra');
  });
});

describe('la banda dello stesso articolo con un altro lotto', () => {
  it('tace quando non c’è rischio', () => {
    expect(App._routeRischioLottoHTML(colonna)).toBe('');
    expect(App._routeRischioLottoHTML(null)).toBe('');
  });

  it('dice quale livello, e da quale prelevare', () => {
    const html = App._routeRischioLottoHTML({ ...colonna, rischioLotto: ['T'] });
    expect(html).toContain('Il livello');
    expect(html).toContain('>T<');
    expect(html).toContain('Prelevare dal livello');
    expect(html).toContain('>1<');
  });

  it('al plurale quando i livelli sono più di uno', () => {
    const tre = {
      ...colonna,
      vani: [vano('3', 'occupied'), ...colonna.vani],
      rischioLotto: ['3', 'T'],
    };
    expect(App._routeRischioLottoHTML(tre)).toContain('I livelli');
  });
});
