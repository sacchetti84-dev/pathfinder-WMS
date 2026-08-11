import { describe, it, expect } from 'vitest';
import { PickRoute } from '../src/modules/pickRoute';

/* Geometria finta ma della forma vera: quella che Store.buildLocationGeometry()
   produce leggendo siti e zone. Un magazzino con due corsie da tre campate. */
function geometria(righe) {
  const geo = new Map();
  for (const [code, site_id, zone_idx, aisle, bay, level_idx] of righe) {
    geo.set(code, { site_id, zone_id: 'Z', zone_idx, type: 'rack', aisle, bay, level: '', level_idx });
  }
  return geo;
}

const tappa = (location_code) => ({ location_code });
const ordina = (codici, geo, siteRank = new Map([['DP', 0]])) =>
  codici.map(tappa).sort(PickRoute._serpentineCompare(geo, siteRank)).map(t => t.location_code);

describe('serpentina', () => {
  it('sulla corsia dispari va avanti, sulla pari torna indietro', () => {
    const geo = geometria([
      ['A1-C1', 'DP', 0, 1, 1, 0],
      ['A1-C2', 'DP', 0, 1, 2, 0],
      ['A1-C3', 'DP', 0, 1, 3, 0],
      ['A2-C1', 'DP', 0, 2, 1, 0],
      ['A2-C2', 'DP', 0, 2, 2, 0],
      ['A2-C3', 'DP', 0, 2, 3, 0],
    ]);

    expect(ordina(['A2-C2', 'A1-C3', 'A2-C1', 'A1-C1', 'A2-C3', 'A1-C2'], geo))
      .toEqual(['A1-C1', 'A1-C2', 'A1-C3', 'A2-C3', 'A2-C2', 'A2-C1']);
  });

  it('a parità di campata scende dal livello più basso', () => {
    const geo = geometria([
      ['P-1', 'DP', 0, 1, 1, 0],
      ['P-2', 'DP', 0, 1, 1, 1],
      ['P-3', 'DP', 0, 1, 1, 2],
    ]);
    expect(ordina(['P-3', 'P-1', 'P-2'], geo)).toEqual(['P-1', 'P-2', 'P-3']);
  });

  it('le zone si attraversano nell’ordine in cui sono configurate', () => {
    const geo = geometria([
      ['Z1-A', 'DP', 0, 9, 9, 0],   // zona prima, ma corsia e campata alte
      ['Z2-A', 'DP', 1, 1, 1, 0],   // zona dopo, ma corsia e campata basse
    ]);
    /* La zona viene prima della corsia: attraversare mezzo magazzino per
       una campata più bassa non è un percorso più corto. */
    expect(ordina(['Z2-A', 'Z1-A'], geo)).toEqual(['Z1-A', 'Z2-A']);
  });

  it('l’ordine dei siti vince su tutto il resto', () => {
    const geo = geometria([
      ['DP-X', 'DP', 5, 9, 9, 3],
      ['MG-Y', 'MG', 0, 1, 1, 0],
    ]);
    const rank = new Map([['MG', 0], ['DP', 1]]);
    expect(ordina(['DP-X', 'MG-Y'], geo, rank)).toEqual(['MG-Y', 'DP-X']);
  });

  it('un’ubicazione senza geometria finisce in coda invece di far fallire l’ordinamento', () => {
    const geo = geometria([['A1-C1', 'DP', 0, 1, 1, 0]]);
    expect(ordina(['ZONA-SPARITA', 'A1-C1'], geo)).toEqual(['A1-C1', 'ZONA-SPARITA']);
  });

  it('due ubicazioni entrambe senza geometria restano in ordine alfabetico, non a caso', () => {
    const geo = geometria([]);
    expect(ordina(['B-2', 'A-1'], geo)).toEqual(['A-1', 'B-2']);
  });
});
