/* LA CONFIGURAZIONE UM CHE ARRIVA AL CARICO — 2.5.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 2.4 `getUomConfig` era `daLotto(...) ?? configurazione(articolo)`,
   e il `??` non ripiegava mai: `daLotto` restituisce un OGGETTO anche quando
   il lotto porta l'unità e non la quantità per collo — che è come
   `_congelaLotto` scrive metà dei lotti, perché metà anagrafica quel numero
   non ce l'ha. Da lì in poi compilare l'articolo non riparava quel lotto, e
   la stessa maschera si comportava in due modi sullo stesso articolo.

   Qui si fissa il ripiego: a LETTURA, e solo a unità uguale. */

import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../src/core/store.js';
import { espandi, totaleColli, totaleUom } from '../src/modules/colli';
import { leggiUnita, unitaValida } from '../src/modules/misure';

const articolo = (code, extra = {}) => ({ code, description: code, unit: 'PZ', ...extra });
const lotto = (article_code, lot_code, uom, uom_per_collo) =>
  ({ article_code, lot_code, uom, uom_per_collo, frozen_at: 0 });

function popola({ art = null, lot = null } = {}) {
  Store._artByCode.clear();
  Store._lotByKey.clear();
  if (art) Store._artByCode.set(art.code, art);
  if (lot) Store._lotByKey.set(`${lot.article_code}#${lot.lot_code}`, lot);
}

describe('getUomConfig — il lotto congelato senza quantità per collo', () => {
  beforeEach(() => popola());

  it('ripiega sull’anagrafica quando il lotto porta l’unità e non il per-collo', () => {
    popola({
      art: articolo('ART-1', { unit: 'KG', pieces_per_pack: 25 }),
      lot: lotto('ART-1', 'L1', 'KG', null),
    });
    expect(Store.getUomConfig('ART-1', 'L1')).toEqual({ uom: 'KG', per_collo: 25 });
  });

  it('NON ripiega quando le unità sono diverse: un per-collo in KG non vale su un lotto in PZ', () => {
    popola({
      art: articolo('ART-2', { unit: 'KG', pieces_per_pack: 25 }),
      lot: lotto('ART-2', 'L1', 'PZ', null),
    });
    expect(Store.getUomConfig('ART-2', 'L1')).toEqual({ uom: 'PZ', per_collo: null });
  });

  it('il lotto che la quantità ce l’ha continua a vincere sull’anagrafica', () => {
    popola({
      art: articolo('ART-3', { unit: 'KG', pieces_per_pack: 25 }),
      lot: lotto('ART-3', 'L1', 'KG', 18),
    });
    expect(Store.getUomConfig('ART-3', 'L1')).toEqual({ uom: 'KG', per_collo: 18 });
  });

  it('senza lotto si legge l’anagrafica, come sempre', () => {
    popola({ art: articolo('ART-4', { unit: 'KG', pieces_per_pack: 25 }) });
    expect(Store.getUomConfig('ART-4', 'L-MAI-VISTO')).toEqual({ uom: 'KG', per_collo: 25 });
  });

  it('l’articolo senza unità non configura niente, e il ripiego non lo inventa', () => {
    popola({ art: { code: 'ART-5', description: 'ART-5' } });
    expect(Store.getUomConfig('ART-5', 'L1')).toBeNull();
  });

  it('l’unità c’è e la quantità no: la configurazione esiste lo stesso, ed è ciò che apre la maschera', () => {
    popola({ art: articolo('ART-6', { unit: 'KG' }) });
    expect(Store.getUomConfig('ART-6', 'L1')).toEqual({ uom: 'KG', per_collo: null });
  });
});

/* LA DICHIARAZIONE NON CHIEDE LA QUANTITÀ PER COLLO. È la ragione per cui il
   cancello della maschera è l'unità e non il per-collo: «10 × 1.000 + 1 × 900»
   sta in piedi da solo, e il per-collo serve solo a precompilare la prima riga. */
describe('la suddivisione dichiarata su un articolo senza quantità per collo', () => {
  it('somma colli e UM senza che nessuno abbia configurato il per-collo', () => {
    const elenco = espandi([{ colli: '10', per: '1000' }, { colli: '1', per: '900' }], 'KG');
    expect(totaleColli(elenco)).toBe(11);
    expect(totaleUom(elenco, 'KG')).toBe(10900);
  });

  it('più colli incompleti sono la norma, non l’eccezione', () => {
    const elenco = espandi([{ colli: '2', per: '25' }, { colli: '1', per: '18' }, { colli: '1', per: '7' }], 'KG');
    expect(totaleColli(elenco)).toBe(4);
    expect(totaleUom(elenco, 'KG')).toBe(75);
  });
});

/* NR E' PZ SCRITTO DA SAGE. Settemila articoli su undicimila portano quella
   sigla, e leggerla come «non gestita» teneva fuori due terzi del magazzino. */
describe('leggiUnita — il sinonimo NR', () => {
  it('legge NR come PZ, in maiuscolo e in minuscolo', () => {
    expect(leggiUnita('NR')).toBe('PZ');
    expect(leggiUnita('nr')).toBe('PZ');
    expect(leggiUnita(' Nr ')).toBe('PZ');
  });

  it('NR non diventa un codice: resta fuori dalle cinque unità', () => {
    expect(unitaValida('NR')).toBe(false);
  });

  it('le sigle che nominano un CONTENITORE restano non gestite', () => {
    for (const sigla of ['SCA', 'CON', 'CAS', 'RT', 'M2', 'BAN']) {
      expect(leggiUnita(sigla)).toBeUndefined();
    }
  });

  it('la cella vuota resta un’assenza, non un ripiego', () => {
    expect(leggiUnita('')).toBeNull();
    expect(leggiUnita(null)).toBeNull();
  });

  it('le cinque di sempre passano prima della tabella', () => {
    for (const u of ['PZ', 'MT', 'LT', 'KG', 'GR']) expect(leggiUnita(u)).toBe(u);
  });
});

describe('un articolo SAGE in NR arriva configurato al carico', () => {
  it('l’unità c’è, e la maschera dei colli si apre su di lei', () => {
    popola({ art: { code: 'ART-NR', description: 'ART-NR', unit: 'NR' } });
    expect(Store.getUomConfig('ART-NR', 'L1')).toEqual({ uom: 'PZ', per_collo: null });
  });
});
