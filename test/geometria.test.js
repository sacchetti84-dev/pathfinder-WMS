import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../src/core/store.js';

/* Un magazzino finto, della stessa forma che _loadCache() costruisce:
   i siti portano le proprie zone appese. */
function magazzino(...sites) {
  Store._cache.sites = sites.map(s => ({ active: true, zones: [], ...s }));
}

const zona = (z) => ({ active: true, ...z });

/* Le zone attive di un sito, con i default di configurazione compilati.
   RACK: corsie × campate × livelli. FLOOR: file × posizioni. BULK: posizioni. */
const rack  = (id, cfg) => zona({ id, type: 'RACK',  ...cfg });
const floor = (id, cfg) => zona({ id, type: 'FLOOR', ...cfg });
const bulk  = (id, cfg) => zona({ id, type: 'BULK',  ...cfg });

beforeEach(() => { Store._cache.sites = []; });

describe('generazione delle ubicazioni', () => {
  it('una scaffalatura è corsie × campate × livelli, con i numeri a due cifre', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 2, bays_per_aisle: 2, levels: ['T', '1'] })] });
    expect(Store.generateLocations('DP', 'A').map(l => l.code)).toEqual([
      'DP-A-01-01-T', 'DP-A-01-01-1',
      'DP-A-01-02-T', 'DP-A-01-02-1',
      'DP-A-02-01-T', 'DP-A-02-01-1',
      'DP-A-02-02-T', 'DP-A-02-02-1',
    ]);
  });

  it('la decina non cambia formato: la campata 10 è 10, non 010', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 1, bays_per_aisle: 10, levels: ['T'] })] });
    const codici = Store.generateLocations('DP', 'A').map(l => l.code);
    expect(codici[8]).toBe('DP-A-01-09-T');
    expect(codici[9]).toBe('DP-A-01-10-T');
  });

  it('una zona a terra è file × posizioni, senza livello', () => {
    magazzino({ id: 'DP', zones: [floor('P', { rows: 2, positions_per_row: 2 })] });
    expect(Store.generateLocations('DP', 'P')).toEqual([
      { code: 'DP-P-01-01', row: 1, position: 1 },
      { code: 'DP-P-01-02', row: 1, position: 2 },
      { code: 'DP-P-02-01', row: 2, position: 1 },
      { code: 'DP-P-02-02', row: 2, position: 2 },
    ]);
  });

  it('una zona alla rinfusa è un elenco piatto di posizioni', () => {
    magazzino({ id: 'DP', zones: [bulk('R', { positions: 3 })] });
    expect(Store.generateLocations('DP', 'R').map(l => l.code))
      .toEqual(['DP-R-01', 'DP-R-02', 'DP-R-03']);
  });

  it('una zona senza configurazione vale una sola ubicazione, non nessuna', () => {
    magazzino({ id: 'DP', zones: [rack('A'), floor('P'), bulk('R')] });
    expect(Store.generateLocations('DP', 'A').map(l => l.code)).toEqual(['DP-A-01-01-T']);
    expect(Store.generateLocations('DP', 'P').map(l => l.code)).toEqual(['DP-P-01-01']);
    expect(Store.generateLocations('DP', 'R').map(l => l.code)).toEqual(['DP-R-01']);
  });

  it('una zona di tipo sconosciuto non genera niente invece di indovinare', () => {
    magazzino({ id: 'DP', zones: [zona({ id: 'X', type: 'FRIGO', positions: 5 })] });
    expect(Store.generateLocations('DP', 'X')).toEqual([]);
  });

  it('una zona che non c’è non fa fallire la chiamata', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 1 })] });
    expect(Store.generateLocations('DP', 'MAI-ESISTITA')).toEqual([]);
    expect(Store.generateLocations('MAI-ESISTITO', 'A')).toEqual([]);
  });
});

describe('geometria delle ubicazioni', () => {
  it('la scaffalatura porta corsia, campata e livello come li ha generati', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 2, bays_per_aisle: 3, levels: ['T', '1', '2'] })] });
    const geo = Store.buildLocationGeometry();

    expect(geo.size).toBe(18);
    expect(geo.get('DP-A-02-03-2')).toEqual({
      site_id: 'DP', zone_id: 'A', zone_idx: 0, type: 'RACK',
      aisle: 2, bay: 3, level: '2', level_idx: 2,
    });
  });

  it('le coordinate non vengono lette dal codice: reggono il trattino negli id', () => {
    magazzino({ id: 'MAG-1', zones: [rack('A-B', { aisles: 1, bays_per_aisle: 2, levels: ['T'] })] });
    const geo = Store.buildLocationGeometry();

    expect([...geo.keys()]).toEqual(['MAG-1-A-B-01-01-T', 'MAG-1-A-B-01-02-T']);
    expect(geo.get('MAG-1-A-B-01-02-T')).toMatchObject({
      site_id: 'MAG-1', zone_id: 'A-B', aisle: 1, bay: 2, level: 'T',
    });
  });

  it('a terra la fila fa da corsia e la posizione da campata', () => {
    magazzino({ id: 'DP', zones: [floor('P', { rows: 2, positions_per_row: 2 })] });
    const geo = Store.buildLocationGeometry();

    expect(geo.get('DP-P-02-01')).toEqual({
      site_id: 'DP', zone_id: 'P', zone_idx: 0, type: 'FLOOR',
      aisle: 2, bay: 1, level: '', level_idx: 0,
    });
  });

  it('alla rinfusa la posizione fa da campata e la corsia resta a zero', () => {
    magazzino({ id: 'DP', zones: [bulk('R', { positions: 2 })] });
    expect(Store.buildLocationGeometry().get('DP-R-02')).toEqual({
      site_id: 'DP', zone_id: 'R', zone_idx: 0, type: 'BULK',
      aisle: 0, bay: 2, level: '', level_idx: 0,
    });
  });

  it('il livello pesa per la posizione in elenco, non per il suo nome', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 1, bays_per_aisle: 1, levels: ['T', '1', '2'] })] });
    const geo = Store.buildLocationGeometry();

    expect(geo.get('DP-A-01-01-T').level_idx).toBe(0);
    expect(geo.get('DP-A-01-01-1').level_idx).toBe(1);
    expect(geo.get('DP-A-01-01-2').level_idx).toBe(2);
  });

  it('le zone prendono il numero d’ordine dalla configurazione', () => {
    magazzino({
      id: 'DP',
      zones: [
        rack('SECONDA-IN-ELENCO', { aisles: 1, bays_per_aisle: 1, levels: ['T'] }),
        rack('PRIMA-IN-ALFABETO', { aisles: 1, bays_per_aisle: 1, levels: ['T'] }),
      ],
    });
    const geo = Store.buildLocationGeometry();

    expect(geo.get('DP-SECONDA-IN-ELENCO-01-01-T').zone_idx).toBe(0);
    expect(geo.get('DP-PRIMA-IN-ALFABETO-01-01-T').zone_idx).toBe(1);
  });

  it('siti e zone disattivati non entrano nella geometria', () => {
    magazzino(
      { id: 'DP', zones: [
        rack('VIVA',   { aisles: 1, bays_per_aisle: 1, levels: ['T'] }),
        { id: 'CHIUSA', type: 'RACK', active: false, aisles: 1, bays_per_aisle: 1, levels: ['T'] },
      ] },
      { id: 'DISMESSO', active: false, zones: [rack('A', { aisles: 1, bays_per_aisle: 1, levels: ['T'] })] },
    );
    expect([...Store.buildLocationGeometry().keys()]).toEqual(['DP-VIVA-01-01-T']);
  });

  it('più siti convivono nella stessa mappa, ognuno con il proprio', () => {
    magazzino(
      { id: 'DP', zones: [bulk('R', { positions: 1 })] },
      { id: 'MG', zones: [bulk('R', { positions: 1 })] },
    );
    const geo = Store.buildLocationGeometry();

    expect(geo.size).toBe(2);
    expect(geo.get('DP-R-01').site_id).toBe('DP');
    expect(geo.get('MG-R-01').site_id).toBe('MG');
  });

  it('un magazzino non ancora configurato dà una mappa vuota, non un errore', () => {
    magazzino();
    expect(Store.buildLocationGeometry().size).toBe(0);
  });
});
