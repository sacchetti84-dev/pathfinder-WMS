import { describe, it, expect } from 'vitest';
import { verificaConformita } from '../src/modules/conformita';

/* Un magazzino minimo: tre zone con tre destinazioni d'uso diverse. */
const ZONE = {
  'DP-A': { zone_name: 'Secco', temp_class: 'AMB', allergen_zone: false },
  'DP-F': { zone_name: 'Frigo', temp_class: 'REFR', allergen_zone: false },
  'DP-S': { zone_name: 'Surgelati', temp_class: 'SURG', allergen_zone: false },
  'DP-X': { zone_name: 'Allergeni', temp_class: 'AMB', allergen_zone: true },
  'DP-N': { zone_name: 'Non configurata' },
};
const zonaDi = (code) => ZONE[code.slice(0, 4)] ?? null;

const ARTICOLI = {
  AMBIENTE:  { temp_class: 'AMB',  allergens: [] },
  FRESCO:    { temp_class: 'REFR', allergens: [] },
  GELATO:    { temp_class: 'SURG', allergens: [] },
  CONLATTE:  { temp_class: 'AMB',  allergens: ['LATTE'] },
  MISTO:     { temp_class: 'AMB',  allergens: ['GLUTINE', 'LATTE'] },
  IGNOTO:    {},
  SOLOALL:   { allergens: ['SOIA'] },
};
const articolo = (code) => ARTICOLI[code] ?? null;

const riga = (location_code, article_code, extra = {}) =>
  ({ location_code, article_code, item_key: `${article_code}|L1`, lot_code: 'L1', qty: 1, ...extra });

const verifica = (righe) => verificaConformita(righe, articolo, zonaDi);

describe('temperatura', () => {
  it('merce nella classe giusta non produce niente', () => {
    const e = verifica([riga('DP-A-01', 'AMBIENTE'), riga('DP-F-01', 'FRESCO'), riga('DP-S-01', 'GELATO')]);
    expect(e.nonConformita).toEqual([]);
    expect(e.verificabili).toBe(3);
  });

  it('merce piu\' calda di quanto chiede e\' grave', () => {
    const e = verifica([riga('DP-A-01', 'FRESCO')]);
    expect(e.nonConformita).toHaveLength(1);
    expect(e.nonConformita[0].tipo).toBe('TEMPERATURA');
    expect(e.nonConformita[0].gravita).toBe('alta');
    expect(e.nonConformita[0].messaggio).toContain('Refrigerato');
    expect(e.nonConformita[0].messaggio).toContain('Ambiente');
  });

  it('merce piu\' fredda del necessario e\' uno spreco, non un rischio', () => {
    const e = verifica([riga('DP-F-01', 'AMBIENTE')]);
    expect(e.nonConformita[0].gravita).toBe('media');
    expect(e.nonConformita[0].messaggio).toContain('più freddo');
  });

  it('la distanza fra le classi non cambia la gravita\', la direzione si', () => {
    expect(verifica([riga('DP-A-01', 'GELATO')]).nonConformita[0].gravita).toBe('alta');
    expect(verifica([riga('DP-S-01', 'AMBIENTE')]).nonConformita[0].gravita).toBe('media');
  });
});

describe('allergeni', () => {
  it('merce con allergeni fuori dalla zona riservata e\' grave', () => {
    const e = verifica([riga('DP-A-01', 'CONLATTE')]);
    expect(e.nonConformita).toHaveLength(1);
    expect(e.nonConformita[0].tipo).toBe('ALLERGENE_FUORI_ZONA');
    expect(e.nonConformita[0].gravita).toBe('alta');
    expect(e.nonConformita[0].messaggio).toContain('Latte e derivati');
  });

  it('merce con allergeni nella zona riservata va bene', () => {
    expect(verifica([riga('DP-X-01', 'CONLATTE')]).nonConformita).toEqual([]);
  });

  it('il messaggio elenca tutti gli allergeni, non solo il primo', () => {
    const m = verifica([riga('DP-A-01', 'MISTO')]).nonConformita[0].messaggio;
    expect(m).toContain('Cereali contenenti glutine');
    expect(m).toContain('Latte e derivati');
  });

  it('una zona che ammette solo certi allergeni respinge gli altri', () => {
    const soloLatte = { zone_name: 'Latte', temp_class: 'AMB', allergen_zone: true, allergens: ['LATTE'] };
    const e = verificaConformita([riga('Z-01', 'MISTO')], articolo, () => soloLatte);
    expect(e.nonConformita[0].tipo).toBe('ALLERGENE_NON_AMMESSO');
    expect(e.nonConformita[0].messaggio).toContain('Cereali contenenti glutine');
    expect(e.nonConformita[0].messaggio).not.toContain('Latte e derivati');
  });

  it('merce pulita dentro la zona allergeni si segnala: a rischiare e\' lei', () => {
    const e = verifica([riga('DP-X-01', 'AMBIENTE')]);
    expect(e.nonConformita[0].tipo).toBe('PULITO_IN_ZONA_ALLERGENI');
    expect(e.nonConformita[0].gravita).toBe('media');
  });
});

describe('cosa NON si segnala', () => {
  it('un articolo senza attributi non e\' ne\' conforme ne\' difforme', () => {
    const e = verifica([riga('DP-S-01', 'IGNOTO')]);
    expect(e.nonConformita).toEqual([]);
    expect(e.verificabili).toBe(0);
    expect([...e.articoliSenzaAttributi]).toEqual(['IGNOTO']);
  });

  it('un articolo mai visto in anagrafica finisce fra i non verificabili', () => {
    const e = verifica([riga('DP-A-01', 'FANTASMA')]);
    expect(e.nonConformita).toEqual([]);
    expect([...e.articoliSenzaAttributi]).toEqual(['FANTASMA']);
  });

  it('una zona senza attributi non accusa nessuno', () => {
    expect(verifica([riga('DP-N-01', 'GELATO')]).nonConformita).toEqual([]);
  });

  it('un articolo con i soli allergeni si verifica lo stesso, senza la temperatura', () => {
    const e = verifica([riga('DP-A-01', 'SOLOALL')]);
    expect(e.nonConformita).toHaveLength(1);
    expect(e.nonConformita[0].tipo).toBe('ALLERGENE_FUORI_ZONA');
  });
});

describe('due difetti sulla stessa riga', () => {
  it('temperatura e allergene si sommano invece di nascondersi', () => {
    const e = verificaConformita(
      [riga('Z-01', 'CONLATTE')],
      articolo,
      () => ({ zone_name: 'Frigo', temp_class: 'REFR', allergen_zone: false }),
    );
    expect(e.nonConformita.map(n => n.tipo).sort())
      .toEqual(['ALLERGENE_FUORI_ZONA', 'TEMPERATURA']);
    expect(e.perUbicazione.get('Z-01')).toEqual({ n: 2, gravita: 'alta' });
  });
});

describe('riepilogo per la mappa', () => {
  it('conta le righe fuori posto per ubicazione', () => {
    const e = verifica([
      riga('DP-A-01', 'CONLATTE'), riga('DP-A-01', 'MISTO'), riga('DP-A-02', 'FRESCO'),
      riga('DP-A-03', 'AMBIENTE'),
    ]);
    expect(e.perUbicazione.get('DP-A-01').n).toBe(2);
    expect(e.perUbicazione.get('DP-A-02').n).toBe(1);
    expect(e.perUbicazione.has('DP-A-03')).toBe(false);
  });

  it('l\'ubicazione prende la gravita\' peggiore che contiene', () => {
    /* AMBIENTE in frigo e' una media; CONLATTE in frigo ne fa due, una per la
       temperatura e una per l'allergene, di cui una alta. Tre in tutto. */
    const e = verifica([riga('DP-F-01', 'AMBIENTE'), riga('DP-F-01', 'CONLATTE')]);
    expect(e.perUbicazione.get('DP-F-01')).toEqual({ n: 3, gravita: 'alta' });
  });

  it('le gravi vengono prima nell\'elenco', () => {
    const e = verifica([riga('DP-F-09', 'AMBIENTE'), riga('DP-A-01', 'FRESCO')]);
    expect(e.nonConformita.map(n => n.gravita)).toEqual(['alta', 'media']);
  });

  it('conta righe totali e verificabili separatamente', () => {
    const e = verifica([riga('DP-A-01', 'IGNOTO'), riga('DP-A-02', 'AMBIENTE'), riga('DP-A-03', 'FRESCO')]);
    expect(e.righe).toBe(3);
    expect(e.verificabili).toBe(2);
  });

  it('magazzino vuoto: nessun errore e nessun crollo', () => {
    const e = verifica([]);
    expect(e.nonConformita).toEqual([]);
    expect(e.righe).toBe(0);
    expect(e.perUbicazione.size).toBe(0);
  });
});
