import { describe, it, expect } from 'vitest';
import { proponi, migliore, regolePerArticolo, scavalco, validaRegola, PUNTI, PRIORITA_MIN, PRIORITA_MAX } from '../src/modules/stoccaggio';

const posto = (code, extra = {}) => ({
  location_code: code,
  site_id: extra.site ?? 'MAG1',
  zone_id: extra.zona ?? 'Z1',
  status: extra.status ?? 'empty',
  allergen_zone: extra.allergen_zone ?? false,
  allergens: extra.allergens ?? null,
  temp_class: extra.temp ?? null,
  riservata: extra.riservata ?? false,
  capienza: extra.capienza ?? null,
  occupati: extra.occupati ?? 0,
  stesso_articolo: extra.stessoArt ?? false,
  stesso_lotto: extra.stessoLotto ?? false,
  distanza: extra.distanza ?? null,
});

const merce = (extra = {}) => ({
  article_code: extra.code ?? '7001234',
  description: 'polvere di prova',
  allergens: extra.allergens ?? [],
  temp_class: extra.temp ?? null,
  lot_code: extra.lotto ?? 'L1',
  colli: extra.colli ?? 2,
});

describe('vincoli duri — chi non passa esce, e nessun punteggio lo salva', () => {
  it('un vano bloccato, disattivato o riservato non e un candidato', () => {
    const e = proponi(merce(), [
      posto('A-01', { status: 'blocked' }),
      posto('A-02', { status: 'disabled' }),
      posto('A-03', { status: 'reserved' }),
      posto('A-04'),
    ]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-04']);
    expect(e.esclusi.map(x => x.motivo)).toEqual(['stato', 'stato', 'stato']);
  });

  it('UN SURGELATO A +20 NON E UNA SCELTA PEGGIORE: e sbagliata', () => {
    const e = proponi(merce({ temp: 'SURG' }), [posto('A-01', { temp: 'AMB' }), posto('A-02', { temp: 'SURG' })]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-02']);
    expect(e.esclusi[0]).toMatchObject({ location_code: 'A-01', motivo: 'temperatura' });
  });

  it('anche il troppo freddo esclude, e lo dice diversamente', () => {
    const e = proponi(merce({ temp: 'AMB' }), [posto('A-01', { temp: 'SURG' })]);
    expect(e.esclusi[0].messaggio).toContain('più freddo del necessario');
  });

  it('la merce con allergeni sta nella zona riservata, e solo li', () => {
    const e = proponi(merce({ allergens: ['GLU'] }), [
      posto('A-01'),
      posto('A-02', { allergen_zone: true }),
    ]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-02']);
    expect(e.esclusi[0].motivo).toBe('allergene_fuori_zona');
  });

  it('un allergene che la zona non ammette esclude lo stesso', () => {
    const e = proponi(merce({ allergens: ['GLU'] }), [
      posto('A-01', { allergen_zone: true, allergens: ['LAT'] }),
    ]);
    expect(e.esclusi[0].motivo).toBe('allergene_non_ammesso');
    expect(e.nessunPosto).toBe(true);
  });

  it('e la merce PULITA non entra nella zona degli allergeni', () => {
    const e = proponi(merce(), [posto('A-01', { allergen_zone: true }), posto('A-02')]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-02']);
    expect(e.esclusi[0].motivo).toBe('pulito_in_zona_allergeni');
  });

  it('LA CELLA RISERVATA DEROGA sugli allergeni: e una decisione presa', () => {
    const e = proponi(merce({ allergens: ['GLU'] }), [posto('A-01', { riservata: true })]);
    expect(e.proposte).toHaveLength(1);
    expect(e.proposte[0].perche.join(' ')).toContain('Cella riservata');
  });

  it('ma NON deroga sulla temperatura: quella e fisica', () => {
    const e = proponi(merce({ temp: 'SURG' }), [posto('A-01', { riservata: true, temp: 'AMB' })]);
    expect(e.proposte).toHaveLength(0);
    expect(e.esclusi[0].motivo).toBe('temperatura');
  });

  it('la capienza esclude solo quando e DICHIARATA', () => {
    const e = proponi(merce({ colli: 5 }), [
      posto('A-01', { capienza: 6, occupati: 4 }),
      posto('A-02', { capienza: 10, occupati: 4 }),
      posto('A-03'),
    ]);
    expect(e.proposte.map(p => p.location_code).sort()).toEqual(['A-02', 'A-03']);
    expect(e.esclusi[0]).toMatchObject({ location_code: 'A-01', motivo: 'pieno' });
  });

  it('un vincolo che nessuno ha scritto non e un vincolo che si viola', () => {
    const e = proponi(merce({ colli: 999 }), [posto('A-01')]);
    expect(e.proposte).toHaveLength(1);
  });
});

describe('le regole sono un dato', () => {
  const regole = [
    { rule_id: 'R1', article_prefix: '700', site_id: 'MAG2', modo: 'impone', nota: 'i 700 vanno in MAG2', priority: 10 },
    { rule_id: 'R2', article_prefix: '600', zone_id: 'Z9', modo: 'preferisce', priority: 5 },
    { rule_id: 'R3', article_prefix: '700', site_id: 'MAG3', modo: 'preferisce', attiva: false },
  ];

  it('«article_code inizia per 700 → MAG2» e un record, non una riga di codice', () => {
    const r = regolePerArticolo(regole, '7001234');
    expect(r.map(x => x.rule_id)).toEqual(['R1']);
  });

  it('una regola SPENTA non si applica', () => {
    expect(regolePerArticolo(regole, '7001234').some(r => r.rule_id === 'R3')).toBe(false);
  });

  it('una regola senza bersaglio e un record incompleto, non una regola', () => {
    expect(regolePerArticolo([{ rule_id: 'X', article_prefix: '700', modo: 'impone' }], '7001234')).toEqual([]);
  });

  it('le regole escono dalla piu forte alla piu debole', () => {
    const r = regolePerArticolo([
      { rule_id: 'B', article_prefix: '7', site_id: 'M1', priority: 1 },
      { rule_id: 'A', article_prefix: '7', site_id: 'M2', priority: 9 },
    ], '7001234');
    expect(r.map(x => x.rule_id)).toEqual(['A', 'B']);
  });

  it('«impone» e un vincolo DURO: fuori da li non si propone niente', () => {
    const e = proponi(merce({ code: '7001234' }), [
      posto('A-01', { site: 'MAG1' }),
      posto('B-01', { site: 'MAG2' }),
    ], regole);
    expect(e.proposte.map(p => p.location_code)).toEqual(['B-01']);
    expect(e.esclusi[0].motivo).toBe('regola_impone');
    expect(e.esclusi[0].messaggio).toContain('i 700 vanno in MAG2');
  });

  it('«preferisce» alza il punteggio e non esclude nessuno', () => {
    const e = proponi(merce({ code: '6009999' }), [
      posto('A-01', { zona: 'Z1' }),
      posto('B-01', { zona: 'Z9' }),
    ], regole);
    expect(e.proposte).toHaveLength(2);
    expect(e.proposte[0].location_code).toBe('B-01');
    expect(e.proposte[0].punteggio - e.proposte[1].punteggio).toBe(PUNTI.REGOLA_PREFERISCE);
  });

  it('un articolo esatto batte il prefisso quando e lui il bersaglio', () => {
    const r = regolePerArticolo([{ rule_id: 'E', article_code: '7001234', site_id: 'M9' }], '7001234');
    expect(r).toHaveLength(1);
    expect(regolePerArticolo([{ rule_id: 'E', article_code: '7001234', site_id: 'M9' }], '7005555')).toEqual([]);
  });
});

describe('validaRegola', () => {
  it('una regola completa si salva', () => {
    expect(validaRegola({ article_prefix: '700', site_id: 'MAG2', modo: 'impone' })).toEqual([]);
    expect(validaRegola({ article_code: '7001234', zone_id: 'Z1' })).toEqual([]);
  });

  it('senza SU COSA vale non si applica a niente: e un record invisibile', () => {
    expect(validaRegola({ site_id: 'MAG2' })).toContain('Indica su quali articoli vale: un codice esatto o un prefisso');
  });

  it('senza DOVE mandare non e una regola', () => {
    expect(validaRegola({ article_prefix: '700' })).toContain('Indica dove devono andare: un sito o una zona');
  });

  it('il modo e uno dei due, non una parola qualunque', () => {
    expect(validaRegola({ article_prefix: '7', site_id: 'M', modo: 'obbliga' })).toHaveLength(1);
    expect(validaRegola({ article_prefix: '7', site_id: 'M', modo: 'preferisce' })).toEqual([]);
  });

  it('la priorita e un numero da zero in su', () => {
    expect(validaRegola({ article_prefix: '7', site_id: 'M', priority: -1 })).toHaveLength(1);
    expect(validaRegola({ article_prefix: '7', site_id: 'M', priority: 'alta' })).toHaveLength(1);
    expect(validaRegola({ article_prefix: '7', site_id: 'M', priority: 0 })).toEqual([]);
  });

  it('una regola vuota si dice tale', () => {
    expect(validaRegola(null)).toEqual(['Regola vuota']);
  });
});

describe('il punteggio ordina, e dice perche', () => {
  it('lo stesso LOTTO viene prima dello stesso articolo, che viene prima del vuoto', () => {
    const e = proponi(merce(), [
      posto('A-01'),
      posto('A-02', { stessoArt: true, occupati: 3 }),
      posto('A-03', { stessoArt: true, stessoLotto: true, occupati: 3 }),
    ]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-03', 'A-02', 'A-01']);
  });

  it('ogni proposta porta il suo perche, in chiaro', () => {
    const e = proponi(merce(), [posto('A-03', { stessoArt: true, stessoLotto: true, occupati: 3 })]);
    expect(e.proposte[0].perche[0]).toContain('già questo lotto');
  });

  it('la distanza pesa in negativo: meno passi, meno cammino', () => {
    const e = proponi(merce(), [
      posto('A-01', { distanza: 12 }),
      posto('A-02', { distanza: 2 }),
    ]);
    expect(e.proposte[0].location_code).toBe('A-02');
  });

  it('MA UN CRITERIO MORBIDO NON BATTE UN VINCOLO DURO', () => {
    /* Il vano con lo stesso lotto e a distanza zero, ma della temperatura
       sbagliata: resta fuori, e non «primo con riserva». */
    const e = proponi(merce({ temp: 'REFR' }), [
      posto('A-01', { stessoArt: true, stessoLotto: true, distanza: 0, temp: 'AMB' }),
      posto('A-02', { distanza: 30, temp: 'REFR' }),
    ]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-02']);
  });

  it('a parita di punteggio decide il codice: la proposta non balla', () => {
    const e = proponi(merce(), [posto('B-01'), posto('A-01')]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-01', 'B-01']);
  });

  it('lo spazio che resta si dice, quando la capienza c e', () => {
    const e = proponi(merce({ colli: 2 }), [posto('A-01', { capienza: 10, occupati: 3 })]);
    expect(e.proposte[0].perche.join(' ')).toContain('Restano 7 colli');
  });
});

describe('quando non c e posto', () => {
  it('nessun posto passa: si dice, e non si propone un ripiego', () => {
    const e = proponi(merce({ temp: 'SURG' }), [posto('A-01', { temp: 'AMB' })]);
    expect(e.nessunPosto).toBe(true);
    expect(e.proposte).toEqual([]);
    expect(migliore(e)).toBe(null);
  });

  it('nessun candidato guardato non e la stessa cosa di nessun posto buono', () => {
    const e = proponi(merce(), []);
    expect(e.candidati).toBe(0);
    expect(e.nessunPosto).toBe(true);
  });

  it('senza merce non si propone niente', () => {
    expect(proponi(null, [posto('A-01')]).proposte).toEqual([]);
  });
});

describe('migliore', () => {
  it('e la prima proposta', () => {
    const e = proponi(merce(), [posto('B-01'), posto('A-01', { stessoArt: true })]);
    expect(migliore(e).location_code).toBe('A-01');
  });

  it('senza esito non si inventa un vano', () => {
    expect(migliore(null)).toBe(null);
    expect(migliore(undefined)).toBe(null);
  });
});

describe('scavalco', () => {
  it('si scrive cosa era proposto, cosa e stato scelto e perche', () => {
    expect(scavalco('A-01', 'B-02', 'il muletto non passa')).
      toBe('Proposto A-01, scelto B-02 — il muletto non passa');
  });

  it('senza motivo resta comunque il fatto: e il dato che conta', () => {
    expect(scavalco('A-01', 'B-02', '')).toBe('Proposto A-01, scelto B-02');
  });

  it('scegliere quello proposto NON e uno scavalco', () => {
    expect(scavalco('A-01', 'A-01', 'x')).toBe(null);
  });

  it('senza una delle due ubicazioni non c e niente da registrare', () => {
    expect(scavalco('', 'B-02', 'x')).toBe(null);
    expect(scavalco('A-01', null, 'x')).toBe(null);
  });
});


/* 2.1 — I TRE DIFETTI CHE IL MOTORE PORTAVA DENTRO.

   Il primo e il secondo non li aveva visti nessuno perche' i collaudi
   costruivano un candidato che il chiamante vero non costruisce: qui il
   posto si compone come lo compone `Store.proponiStoccaggio`, cioe' con
   `riservata` DERIVATA dallo stato. */

/* Come lo scrive `Store.proponiStoccaggio`: la deroga non e' un campo che
   qualcuno accende, e' lo stato del vano riletto. */
const postoVero = (code, extra = {}) => {
  const p = posto(code, extra);
  p.riservata = p.status === 'reserved';
  return p;
};

describe('2.1 — la cella riservata era irraggiungibile', () => {
  it('CON GLI ALLERGENI la cella riservata e un candidato, e dice perche', () => {
    const e = proponi(merce({ allergens: ['GLU'] }), [postoVero('A-01', { status: 'reserved' })]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-01']);
    expect(e.proposte[0].perche.join(' ')).toContain('Cella riservata');
  });

  it('senza allergeni resta esclusa: quel posto e di chi ne ha bisogno', () => {
    const e = proponi(merce(), [postoVero('A-01', { status: 'reserved' }), postoVero('A-02')]);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-02']);
    expect(e.esclusi[0]).toMatchObject({ location_code: 'A-01', motivo: 'stato' });
    expect(e.esclusi[0].messaggio).toContain('merce con allergeni');
  });

  it('e la temperatura non la deroga nemmeno da riservata', () => {
    const e = proponi(merce({ allergens: ['GLU'], temp: 'SURG' }),
      [postoVero('A-01', { status: 'reserved', temp: 'AMB' })]);
    expect(e.proposte).toHaveLength(0);
    expect(e.esclusi[0].motivo).toBe('temperatura');
  });

  it('bloccata e disattivata restano fuori, con gli allergeni e senza', () => {
    const e = proponi(merce({ allergens: ['GLU'] }),
      [postoVero('A-01', { status: 'blocked' }), postoVero('A-02', { status: 'disabled' })]);
    expect(e.proposte).toHaveLength(0);
    expect(e.esclusi.map(x => x.motivo)).toEqual(['stato', 'stato']);
  });
});

describe('2.1 — la distanza non schiaccia piu il raggruppamento', () => {
  it('IL LOTTO GIA LI VINCE su un vano vuoto in fondo alla corsia', () => {
    /* Il caso vero: una zona da 274 ubicazioni. Prima il vano vuoto a
       distanza 0 batteva il lotto a distanza 273 di 203 punti. */
    const e = proponi(merce(), [
      posto('A-01', { distanza: 0 }),
      posto('Z-274', { stessoArt: true, stessoLotto: true, distanza: 273 }),
    ]);
    expect(e.proposte[0].location_code).toBe('Z-274');
  });

  it('fra due vani equivalenti decide ancora chi fa camminare meno', () => {
    const e = proponi(merce(), [posto('A-01', { distanza: 12 }), posto('A-02', { distanza: 2 })]);
    expect(e.proposte[0].location_code).toBe('A-02');
  });

  it('oltre il tetto la distanza smette di contare, e i due pareggiano', () => {
    const e = proponi(merce(), [posto('A-01', { distanza: 40 }), posto('A-02', { distanza: 250 })]);
    expect(e.proposte[0].punteggio).toBe(e.proposte[1].punteggio);
    expect(e.proposte.map(p => p.location_code)).toEqual(['A-01', 'A-02']);   // a pari punti, per codice
  });

  it('la penalita non supera mai il tetto dichiarato', () => {
    const e = proponi(merce(), [posto('A-01', { distanza: 9999 })]);
    expect(e.proposte[0].punteggio).toBe(PUNTI.VUOTO + PUNTI.DISTANZA_MAX * PUNTI.PASSO);
  });
});

describe('2.1 — la priorita di una regola va da 1 a 10', () => {
  it('gli estremi si scrivono, quello che sta fuori no', () => {
    const base = { article_prefix: '7', site_id: 'M' };
    expect(validaRegola({ ...base, priority: PRIORITA_MIN })).toEqual([]);
    expect(validaRegola({ ...base, priority: PRIORITA_MAX })).toEqual([]);
    expect(validaRegola({ ...base, priority: PRIORITA_MAX + 1 })).toHaveLength(1);
    expect(validaRegola({ ...base, priority: 2.5 })).toHaveLength(1);
  });

  it('UNA REGOLA SCRITTA PRIMA DELLA 2.1 resta buona: zero si rilegge', () => {
    expect(validaRegola({ article_prefix: '7', site_id: 'M', priority: 0 })).toEqual([]);
  });

  it('e chi ordina non cambia: piu alta decide prima', () => {
    const r = regolePerArticolo([
      { rule_id: 'B', article_prefix: '7', site_id: 'M1', priority: 1 },
      { rule_id: 'A', article_prefix: '7', site_id: 'M2', priority: 10 },
    ], '7001234');
    expect(r.map(x => x.rule_id)).toEqual(['A', 'B']);
  });
});
