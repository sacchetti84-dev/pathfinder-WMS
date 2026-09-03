import { describe, it, expect } from 'vitest';
import { colonnaDi } from '../src/modules/colonna.js';
import { costruisciGeometria } from '../src/core/geometria.js';

/* Un magazzino finto della stessa forma che `_loadCache()` costruisce: i
   siti portano le proprie zone appese. */
const rack = (id, cfg) => ({ id, type: 'RACK', active: true, ...cfg });
const sito = (id, zones) => ({ id, active: true, zones });

const SITI = [sito('DP', [
  rack('A', { aisles: 2, bays_per_aisle: 3, levels: ['T', '1', '2'] }),
  { id: 'P', type: 'FLOOR', active: true, rows: 2, positions_per_row: 2 },
  { id: 'S', type: 'BULK', active: true, positions: 4 },
  rack('U', { aisles: 1, bays_per_aisle: 2, levels: ['T'] }),
])];

const GEO = costruisciGeometria(SITI);
const zonaDi = (id) => SITI[0].zones.find(z => z.id === id);

/** Le domande, con le due letture spente se non servono alla prova. */
function chiedi(code, opts = {}) {
  return colonnaDi({
    code,
    geo: GEO,
    zona: opts.zona !== undefined ? opts.zona : zonaDi(GEO.get(code)?.zone_id),
    stato: opts.stato || (() => 'empty'),
    righe: opts.righe || (() => []),
    article_code: opts.article_code,
    lot_code: opts.lot_code,
  });
}

describe('la colonna di un vano', () => {
  it('sono i livelli della stessa corsia e campata, dall’alto in basso', () => {
    const c = chiedi('DP-A-01-02-1');
    expect(c.vani.map(v => v.code)).toEqual([
      'DP-A-01-02-2', 'DP-A-01-02-1', 'DP-A-01-02-T',
    ]);
    expect(c.vani.map(v => v.level)).toEqual(['2', '1', 'T']);
  });

  it('l’ordine è quello configurato invertito, non l’alfabetico', () => {
    const siti = [sito('DP', [rack('Z', { aisles: 1, bays_per_aisle: 1, levels: ['A', 'B', 'T'] })])];
    const geo = costruisciGeometria(siti);
    const c = colonnaDi({
      code: 'DP-Z-01-01-B', geo, zona: siti[0].zones[0],
      stato: () => 'empty', righe: () => [],
    });
    expect(c.vani.map(v => v.level)).toEqual(['T', 'B', 'A']);
  });

  it('dice corsia e campata, e accende un vano solo', () => {
    const c = chiedi('DP-A-02-03-T');
    expect([c.aisle, c.bay]).toEqual([2, 3]);
    expect(c.vani.filter(v => v.tappa).map(v => v.code)).toEqual(['DP-A-02-03-T']);
  });

  it('porta lo stato di ogni livello, e nient’altro', () => {
    const stati = {
      'DP-A-01-01-T': 'occupied',
      'DP-A-01-01-1': 'blocked',
      'DP-A-01-01-2': 'disabled',
    };
    const c = chiedi('DP-A-01-01-T', { stato: (k) => stati[k] || 'empty' });
    expect(c.vani.map(v => v.stato)).toEqual(['disabled', 'blocked', 'occupied']);
    /* Il contenuto non esce di qui: un vano ha il codice, il livello, lo
       stato e se è la tappa. Niente articolo, niente lotto, niente colli. */
    expect(Object.keys(c.vani[0]).sort()).toEqual(['code', 'level', 'stato', 'tappa']);
  });
});

describe('le zone che non hanno una colonna', () => {
  it('una zona a terra non ne ha una: si torna null, non un rettangolo solo', () => {
    expect(chiedi('DP-P-01-01')).toBeNull();
  });

  it('una zona alla rinfusa nemmeno', () => {
    expect(chiedi('DP-S-01')).toBeNull();
  });

  it('uno scaffale a un livello solo non è una colonna', () => {
    expect(chiedi('DP-U-01-01-T')).toBeNull();
  });

  it('una zona che non si conosce non inventa una forma', () => {
    expect(chiedi('DP-A-01-01-T', { zona: null })).toBeNull();
  });

  it('un codice che la geometria non riconosce torna null', () => {
    expect(chiedi('DP-A-09-09-T')).toBeNull();
  });
});

describe('lo stesso articolo con un lotto diverso, in un altro livello', () => {
  const righe = {
    'DP-A-01-01-T': [{ article_code: 'ART-1', lot_code: 'L-VECCHIO' }],
    'DP-A-01-01-1': [{ article_code: 'ART-1', lot_code: 'L-NUOVO' }],
    'DP-A-01-01-2': [{ article_code: 'ART-9', lot_code: 'L-ALTRO' }],
  };
  const domande = { righe: (k) => righe[k] || [], article_code: 'ART-1', lot_code: 'L-NUOVO' };

  it('si accusa il livello che tiene l’altro lotto', () => {
    expect(chiedi('DP-A-01-01-1', domande).rischioLotto).toEqual(['T']);
  });

  it('un articolo diverso non c’entra', () => {
    const c = chiedi('DP-A-01-01-1', { ...domande, article_code: 'ART-9', lot_code: 'L-ALTRO' });
    expect(c.rischioLotto).toEqual([]);
  });

  it('lo stesso lotto sullo stesso articolo non è un rischio', () => {
    const stesso = {
      'DP-A-01-01-T': [{ article_code: 'ART-1', lot_code: 'L-NUOVO' }],
      'DP-A-01-01-1': [{ article_code: 'ART-1', lot_code: 'L-NUOVO' }],
    };
    const c = chiedi('DP-A-01-01-1', { righe: (k) => stesso[k] || [], article_code: 'ART-1', lot_code: 'L-NUOVO' });
    expect(c.rischioLotto).toEqual([]);
  });

  it('il vano della tappa non accusa se stesso', () => {
    const misto = {
      'DP-A-01-01-1': [
        { article_code: 'ART-1', lot_code: 'L-NUOVO' },
        { article_code: 'ART-1', lot_code: 'L-VECCHIO' },
      ],
    };
    const c = chiedi('DP-A-01-01-1', { righe: (k) => misto[k] || [], article_code: 'ART-1', lot_code: 'L-NUOVO' });
    expect(c.rischioLotto).toEqual([]);
  });

  it('senza lotto non si accusa nessuno', () => {
    expect(chiedi('DP-A-01-01-1', { ...domande, lot_code: undefined }).rischioLotto).toEqual([]);
  });
});
