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

describe('la deroga della cella riservata', () => {
  const riservata = (extra = {}) => () => ({ zone_name: 'Secco', temp_class: 'AMB', allergen_zone: false, riservata: true, ...extra });
  const conRiserva = (righe, extra) => verificaConformita(righe, articolo, riservata(extra));

  it('merce con allergeni in una cella riservata non si segnala', () => {
    expect(conRiserva([riga('Z-01', 'CONLATTE')]).nonConformita).toEqual([]);
  });

  it('vale anche con piu\' allergeni insieme', () => {
    expect(conRiserva([riga('Z-01', 'MISTO')]).nonConformita).toEqual([]);
  });

  it('deroga anche alla lista di una zona che ammette solo certi allergeni', () => {
    const e = conRiserva([riga('Z-01', 'MISTO')], { allergen_zone: true, allergens: ['LATTE'] });
    expect(e.nonConformita).toEqual([]);
  });

  it('deroga anche al pulito dentro la zona allergeni: la riserva e\' deliberata', () => {
    const e = conRiserva([riga('Z-01', 'AMBIENTE')], { allergen_zone: true });
    expect(e.nonConformita).toEqual([]);
  });

  it('sulla TEMPERATURA non deroga: riservare una cella non la raffredda', () => {
    const e = conRiserva([riga('Z-01', 'GELATO')]);
    expect(e.nonConformita).toHaveLength(1);
    expect(e.nonConformita[0].tipo).toBe('TEMPERATURA');
    expect(e.nonConformita[0].gravita).toBe('alta');
  });

  it('la riga resta verificabile: derogata non vuol dire ignorata', () => {
    const e = conRiserva([riga('Z-01', 'CONLATTE')]);
    expect(e.verificabili).toBe(1);
    expect([...e.articoliSenzaAttributi]).toEqual([]);
  });

  it('la deroga viene annotata, con gli allergeni che copre', () => {
    const e = conRiserva([riga('Z-01', 'MISTO')]);
    expect(e.deroghe).toHaveLength(1);
    expect(e.deroghe[0].location_code).toBe('Z-01');
    expect(e.deroghe[0].article_code).toBe('MISTO');
    expect(e.deroghe[0].allergens).toEqual(['GLUTINE', 'LATTE']);
  });

  it('una cella riservata con merce SENZA allergeni non e\' una deroga', () => {
    expect(conRiserva([riga('Z-01', 'AMBIENTE')]).deroghe).toEqual([]);
  });

  it('una riga solo fuori temperatura in cella riservata non e\' una deroga', () => {
    const e = conRiserva([riga('Z-01', 'GELATO')]);
    expect(e.deroghe).toEqual([]);
    expect(e.nonConformita).toHaveLength(1);
  });

  it('senza celle riservate non c\'e\' nessuna deroga', () => {
    expect(verifica([riga('DP-A-01', 'CONLATTE')]).deroghe).toEqual([]);
  });

  it('senza riserva la stessa riga si segnala: e\' la riserva a fare la differenza', () => {
    const senza = verificaConformita([riga('Z-01', 'CONLATTE')], articolo,
      () => ({ zone_name: 'Secco', temp_class: 'AMB', allergen_zone: false }));
    expect(senza.nonConformita).toHaveLength(1);
    expect(senza.nonConformita[0].tipo).toBe('ALLERGENE_FUORI_ZONA');
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

/* ═══════════════════════════════════════════════════════════════════
   2.8 — LA PERICOLOSITÀ, LA MATRICE E IL LOTTO SPARSO
   ═══════════════════════════════════════════════════════════════════ */

describe('2.8 — la pericolosità, verificata sul magazzino fermo', () => {
  const art = (h) => () => ({ hazards: h, description: 'roba' });
  const r = (loc, code, lot) => ({
    location_code: loc, item_key: `${code}#${lot}`,
    article_code: code, lot_code: lot, qty: 1,
  });

  it('merce pericolosa fuori dall’area dedicata è grave', () => {
    const e = verificaConformita([r('A-01', 'X1', 'L1')],
      art(['INFIAMMABILE']), () => ({ hazard_zone: false }));
    expect(e.nonConformita[0].tipo).toBe('PERICOLO_FUORI_ZONA');
    expect(e.nonConformita[0].gravita).toBe('alta');
  });

  it('un pericolo non ammesso da quell’area è grave', () => {
    const e = verificaConformita([r('A-01', 'X1', 'L1')],
      art(['INFIAMMABILE']), () => ({ hazard_zone: true, hazards: ['CORROSIVO'] }));
    expect(e.nonConformita[0].tipo).toBe('PERICOLO_NON_AMMESSO');
  });

  it('merce pulita nell’area dei pericoli è media, non grave', () => {
    const e = verificaConformita([r('A-01', 'X1', 'L1')],
      () => ({ temp_class: 'AMB' }), () => ({ hazard_zone: true, temp_class: 'AMB' }));
    expect(e.nonConformita[0].tipo).toBe('PULITO_IN_ZONA_PERICOLI');
    expect(e.nonConformita[0].gravita).toBe('media');
  });

  /* Fino alla 2.7 un articolo che dichiarava SOLO la pericolosità era
     «ignoto» e non veniva verificato mai: si configurava, si vedeva in
     maschera, e nessuno guardava se stesse dove poteva stare. */
  it('un articolo che dichiara solo la pericolosità adesso si verifica', () => {
    const e = verificaConformita([r('A-01', 'X1', 'L1')],
      art(['INFIAMMABILE']), () => ({ hazard_zone: true }));
    expect(e.verificabili).toBe(1);
    expect(e.articoliSenzaAttributi.size).toBe(0);
  });

  it('l’area dedicata senza elenco ammette tutto', () => {
    const e = verificaConformita([r('A-01', 'X1', 'L1')],
      art(['INFIAMMABILE']), () => ({ hazard_zone: true }));
    expect(e.nonConformita).toHaveLength(0);
  });
});

describe('2.8 — la matrice, sul magazzino fermo', () => {
  const matrice = [{ a: 'COMBURENTE', b: 'INFIAMMABILE', nota: 'alimenta la fiamma' }];
  const pericoli = { X1: ['INFIAMMABILE'], X2: ['COMBURENTE'], X3: ['NOCIVO'] };
  const art = (c) => ({ hazards: pericoli[c] ?? [] });
  const zona = () => ({ hazard_zone: true });
  const r = (loc, code) => ({
    location_code: loc, item_key: `${code}#L1`,
    article_code: code, lot_code: 'L1', qty: 1,
  });

  /* Si accusano TUTTE E DUE le righe: non c'è modo di sapere quale sia
     arrivata per ultima, e dire «questa è di troppo» sceglierebbe a caso
     chi deve spostarsi. */
  it('due incompatibili nello stesso vano accusano tutte e due le righe', () => {
    const e = verificaConformita([r('A-01', 'X1'), r('A-01', 'X2')], art, zona, { matrice });
    const inc = e.nonConformita.filter(n => n.tipo === 'INCOMPATIBILITA');
    expect(inc).toHaveLength(2);
    expect(inc.map(n => n.article_code).sort()).toEqual(['X1', 'X2']);
    expect(e.perUbicazione.get('A-01').gravita).toBe('alta');
  });

  it('due pericoli compatibili non dicono niente', () => {
    const e = verificaConformita([r('A-01', 'X1'), r('A-01', 'X3')], art, zona, { matrice });
    expect(e.nonConformita.filter(n => n.tipo === 'INCOMPATIBILITA')).toHaveLength(0);
  });

  it('in due vani diversi non si scontrano', () => {
    const e = verificaConformita([r('A-01', 'X1'), r('A-02', 'X2')], art, zona, { matrice });
    expect(e.nonConformita.filter(n => n.tipo === 'INCOMPATIBILITA')).toHaveLength(0);
  });

  it('senza matrice non si guarda niente', () => {
    const e = verificaConformita([r('A-01', 'X1'), r('A-01', 'X2')], art, zona);
    expect(e.nonConformita.filter(n => n.tipo === 'INCOMPATIBILITA')).toHaveLength(0);
  });
});

describe('2.8 — lo stesso lotto in più vani', () => {
  const r = (loc, qty = 1) => ({
    location_code: loc, item_key: 'X1#L1',
    article_code: 'X1', lot_code: 'L1', qty,
  });
  const nulla = () => null;

  /* Non è un errore: è l'eccezione che lo stato del vano ha imposto, e chi
     l'ha fatta non ha scavalcato niente. Ma finché dura, quella merce si
     conta due volte e il FEFO la ordina come due partite. */
  it('è un avviso di gravità media, su tutte e due le righe', () => {
    const e = verificaConformita([r('A-01'), r('B-02')], nulla, nulla);
    const sparsi = e.nonConformita.filter(n => n.tipo === 'LOTTO_SPARSO');
    expect(sparsi).toHaveLength(2);
    expect(sparsi.every(n => n.gravita === 'media')).toBe(true);
    expect(sparsi[0].messaggio).toContain('B-02');
  });

  it('un lotto in un vano solo non dice niente', () => {
    const e = verificaConformita([r('A-01')], nulla, nulla);
    expect(e.nonConformita).toHaveLength(0);
  });

  /* Un lotto sparso è sparso anche se l'articolo non è mai stato
     classificato: questo giro non passa dal cancello degli attributi. */
  it('vale anche per un articolo senza attributi', () => {
    const e = verificaConformita([r('A-01'), r('B-02')], nulla, nulla);
    expect(e.articoliSenzaAttributi.has('X1')).toBe(true);
    expect(e.nonConformita).toHaveLength(2);
  });

  /* Il vano WIP è un conto di produzione: portare in produzione è quasi
     sempre un prelievo parziale, e senza questa esclusione la mappa
     segnalerebbe ogni lotto che un ordine ha toccato. */
  it('l’area di transito non conta: la merce è in lavorazione', () => {
    const e = verificaConformita([r('A-01'), r('MAG1-WIP-01')], nulla, nulla,
      { areeDiTransito: ['MAG1-WIP-01'] });
    expect(e.nonConformita).toHaveLength(0);
  });

  it('una riga a zero non fa sparso niente', () => {
    const e = verificaConformita([r('A-01', 5), r('B-02', 0)], nulla, nulla);
    expect(e.nonConformita).toHaveLength(0);
  });
});
