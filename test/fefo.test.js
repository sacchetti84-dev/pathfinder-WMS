import { describe, it, expect } from 'vitest';
import { Store } from '../src/core/store.js';

const lotto = (lot_code, expiry_date, placed_at = 0) =>
  ({ lot_code, expiry_date, placed_at, article_code: 'ART-1' });

const codici = (items) => Store.sortByFEFO(items).map(i => i.lot_code);

describe('FEFO', () => {
  it('mette davanti la scadenza più vicina', () => {
    expect(codici([
      lotto('C', '2027-01-10'),
      lotto('A', '2026-03-01'),
      lotto('B', '2026-11-30'),
    ])).toEqual(['A', 'B', 'C']);
  });

  it('confronta le date come stringhe ISO, quindi anche a cavallo d’anno', () => {
    expect(codici([
      lotto('DOPO', '2027-01-02'),
      lotto('PRIMA', '2026-12-31'),
    ])).toEqual(['PRIMA', 'DOPO']);
  });

  it('i lotti senza scadenza vanno in coda — con l’elenco in un ordine', () => {
    expect(codici([
      lotto('SENZA', ''),
      lotto('CON', '2030-01-01'),
    ])).toEqual(['CON', 'SENZA']);
  });

  it('i lotti senza scadenza vanno in coda — e con l’elenco nell’altro', () => {
    expect(codici([
      lotto('CON', '2030-01-01'),
      lotto('SENZA', ''),
    ])).toEqual(['CON', 'SENZA']);
  });

  it('fra due lotti senza scadenza vince il più vecchio in magazzino (FIFO)', () => {
    expect(codici([
      lotto('NUOVO', null, 2000),
      lotto('VECCHIO', null, 1000),
    ])).toEqual(['VECCHIO', 'NUOVO']);
  });

  it('a parità di scadenza esce prima quello posizionato prima', () => {
    expect(codici([
      lotto('B', '2026-06-01', 2000),
      lotto('A', '2026-06-01', 1000),
    ])).toEqual(['A', 'B']);
  });

  it('una scadenza fatta di spazi vale come assente', () => {
    expect(codici([
      lotto('VUOTA', '   '),
      lotto('VERA', '2029-01-01'),
    ])).toEqual(['VERA', 'VUOTA']);
  });

  it('non riordina l’elenco che riceve', () => {
    const originale = [lotto('C', '2027-01-01'), lotto('A', '2026-01-01')];
    const prima = originale.map(i => i.lot_code);
    Store.sortByFEFO(originale);
    expect(originale.map(i => i.lot_code)).toEqual(prima);
  });

  it('regge elenco vuoto, elenco da uno, e assenza di elenco', () => {
    expect(Store.sortByFEFO([])).toEqual([]);
    expect(Store.sortByFEFO(null)).toEqual([]);
    expect(codici([lotto('SOLO', '2026-01-01')])).toEqual(['SOLO']);
  });
});
