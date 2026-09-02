import { describe, it, expect } from 'vitest';
import {
  ePf, bancaliImpegnati, riepiloga, descriviContenuto, zonePf,
} from '../src/modules/bancale';

const udc = (extra = {}) => ({
  udc_id: 'UDC-000012', type: 'pallet', location_code: 'MAG1-SPED-01-01',
  status: 'open', created_at: 1, kind: 'pf', ...extra,
});

const riga = (extra = {}) => ({
  location_code: 'MAG1-SPED-01-01', item_key: 'PF001#L1', article_code: 'PF001',
  article_description: 'Omega 3 60cps', lot_code: 'L1', expiry_date: '2027-06-30',
  qty: 40, qty_uom: 300, uom: 'KG', udc_id: 'UDC-000012', ...extra,
});

const ddt = (lines, status = 'pending') => ({
  doc_id: 'D1', ddt_num: '1/2026', operator: 'ANDS', status, created_at: 1, lines,
});

describe('ePf', () => {
  it('distingue il bancale dall unita di carico di prima', () => {
    expect(ePf(udc())).toBe(true);
    expect(ePf(udc({ kind: undefined }))).toBe(false);
    expect(ePf(null)).toBe(false);
  });
});

describe('bancaliImpegnati', () => {
  it('legge i soli documenti pendenti', () => {
    const impegnati = bancaliImpegnati([
      ddt([{ udc_id: 'UDC-000012' }]),
      ddt([{ udc_id: 'UDC-000099' }], 'evaded'),
      ddt([{ udc_id: 'UDC-000077' }], 'cancelled'),
    ]);
    expect([...impegnati]).toEqual(['UDC-000012']);
  });

  /* Le righe di un DDT scritto prima della 2.20 non portano `udc_id`: non
     impegnano nessun bancale, e non devono far esplodere la lettura. */
  it('una riga senza bancale non impegna niente', () => {
    expect(bancaliImpegnati([ddt([{ article_code: 'PF001' }])]).size).toBe(0);
    expect(bancaliImpegnati(null).size).toBe(0);
  });
});

describe('riepiloga', () => {
  it('un bancale mono porta articolo, lotto, scadenza e totali', () => {
    const r = riepiloga(udc(), [riga()]);
    expect(r.mono).toBe(true);
    expect(r.partite).toBe(1);
    expect(r.article_code).toBe('PF001');
    expect(r.lot_code).toBe('L1');
    expect(r.expiry_date).toBe('2027-06-30');
    expect(r.colli).toBe(40);
    expect(r.uom_qty).toBe(300);
    expect(r.uom).toBe('KG');
    expect(r.stato).toBe('pronto');
  });

  /* Su un misto i campi della merce restano VUOTI: scriverci il primo
     articolo che capita vorrebbe dire un'etichetta che mente. */
  it('un bancale misto non nomina nessuno dei due articoli', () => {
    const r = riepiloga(udc(), [riga(), riga({ item_key: 'PF002#L9', article_code: 'PF002', lot_code: 'L9', qty: 10, qty_uom: 80 })]);
    expect(r.mono).toBe(false);
    expect(r.partite).toBe(2);
    expect(r.article_code).toBe(null);
    expect(r.lot_code).toBe(null);
    expect(r.expiry_date).toBe(null);
    expect(r.colli).toBe(50);
    expect(r.uom_qty).toBe(380);       // stessa unita': il totale vale
  });

  it('unita diverse non si sommano: MISTA, e la cella resta vuota', () => {
    const r = riepiloga(udc(), [riga(), riga({ item_key: 'PF002#L9', uom: 'PZ', qty_uom: 40 })]);
    expect(r.uom_qty).toBe(null);
  });

  it('senza unita il totale non e zero: non c e', () => {
    const r = riepiloga(udc(), [riga({ uom: null, qty_uom: undefined })]);
    expect(r.uom_qty).toBe(null);
    expect(r.uom).toBe(null);
    expect(r.colli).toBe(40);
  });

  it('l unita si puo far risolvere da chi chiama, come fa Store', () => {
    const r = riepiloga(udc(), [riga({ uom: undefined })], null, () => 'KG');
    expect(r.uom).toBe('KG');
    expect(r.uom_qty).toBe(300);
  });

  describe('lo stato', () => {
    it('impegnato quando un DDT pendente lo nomina', () => {
      const impegnati = bancaliImpegnati([ddt([{ udc_id: 'UDC-000012' }])]);
      expect(riepiloga(udc(), [riga()], impegnati).stato).toBe('impegnato');
    });

    it('spedito batte tutto il resto', () => {
      const impegnati = bancaliImpegnati([ddt([{ udc_id: 'UDC-000012' }])]);
      expect(riepiloga(udc({ status: 'shipped' }), [riga()], impegnati).stato).toBe('spedito');
    });

    it('vuoto e spedito sono due fatti diversi', () => {
      expect(riepiloga(udc(), []).stato).toBe('vuoto');
      expect(riepiloga(udc({ status: 'shipped' }), []).stato).toBe('spedito');
    });

    /* Una riga a zero colli e' una riga che non c'e' piu': il bancale e'
       vuoto, non «pronto con niente sopra». */
    it('una riga a zero colli non tiene in piedi un bancale', () => {
      expect(riepiloga(udc(), [riga({ qty: 0 })]).stato).toBe('vuoto');
    });
  });
});

describe('descriviContenuto', () => {
  it('dice l articolo se e uno, e quante partite se sono di piu', () => {
    expect(descriviContenuto(riepiloga(udc(), [riga()]))).toBe('PF001#L1');
    const misto = riepiloga(udc(), [riga(), riga({ item_key: 'PF002#L9' })]);
    expect(descriviContenuto(misto)).toBe('MISTO — 2 partite');
    expect(descriviContenuto(riepiloga(udc(), []))).toBe('vuoto');
  });
});

describe('zonePf', () => {
  const siti = [
    { id: 'MAG1', name: 'Magazzino 1', zones: [
      { site_id: 'MAG1', id: 'SPED', name: 'Spedizioni', pf_zone: true },
      { site_id: 'MAG1', id: 'RAKA', name: 'Scaffali' },
    ] },
    { id: 'TRZ1', name: 'Terzista', type: 'terzista', zones: [
      { site_id: 'TRZ1', id: 'DEP', name: 'Deposito', pf_zone: true },
      { site_id: 'TRZ1', id: 'VEC', name: 'Vecchia', pf_zone: true, active: false },
    ] },
  ];

  it('elenca le zone dichiarate, anche quelle di un terzista', () => {
    expect(zonePf(siti).map(z => `${z.sito.id}/${z.zona.id}`)).toEqual(['MAG1/SPED', 'TRZ1/DEP']);
  });

  it('una zona disattivata non e una destinazione', () => {
    expect(zonePf(siti).some(z => z.zona.id === 'VEC')).toBe(false);
  });

  it('senza siti non esplode', () => {
    expect(zonePf(null)).toEqual([]);
    expect(zonePf([{ id: 'X', name: 'X' }])).toEqual([]);
  });
});
