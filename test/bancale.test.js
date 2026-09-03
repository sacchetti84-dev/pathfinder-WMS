import { describe, it, expect } from 'vitest';
import {
  ePf, bancaliImpegnati, riepiloga, descriviContenuto, zonePf, zoneCarico,
  spedizioniDiBancale,
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
    expect(descriviContenuto(misto)).toBe('LOTTI MULTIPLI — 2 partite');
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

/* 2.21 — LA BAIA DI CARICO E' UN POSTO, non una regola: stesso criterio
   delle zone di prodotto finito, e la lettura e' una sola. */
describe('zoneCarico', () => {
  const siti = [
    { id: 'MAG1', name: 'Magazzino 1', zones: [
      { site_id: 'MAG1', id: 'SPED', name: 'Spedizioni', pf_zone: true },
      { site_id: 'MAG1', id: 'BAIA', name: 'Baia camion', dock_zone: true },
      { site_id: 'MAG1', id: 'BAI2', name: 'Baia vecchia', dock_zone: true, active: false },
    ] },
  ];

  it('elenca le sole zone marcate baia, e non le altre', () => {
    expect(zoneCarico(siti).map(z => z.zona.id)).toEqual(['BAIA']);
  });

  /* Una zona puo' essere tutt'e due: il prodotto finito si posa dove il
     camion carica, e le due bandiere non si escludono. */
  it('una zona puo essere insieme prodotto finito e baia', () => {
    const doppia = [{ id: 'M', name: 'M', zones: [
      { site_id: 'M', id: 'Z', name: 'Z', pf_zone: true, dock_zone: true },
    ] }];
    expect(zonePf(doppia)).toHaveLength(1);
    expect(zoneCarico(doppia)).toHaveLength(1);
  });

  it('senza siti non esplode', () => {
    expect(zoneCarico(null)).toEqual([]);
  });
});

/* 2.21 — CON QUALE DDT E' PARTITO UN BANCALE SI RILEGGE, NON SI SCRIVE.
   I documenti evasi portano gia' la risposta, e un campo sull'unita'
   sarebbe la stessa cosa scritta due volte: un DDT corretto dopo l'evasione
   lascerebbe l'unita' a raccontare il numero vecchio. */
describe('spedizioniDiBancale', () => {
  const evaso = (doc_id, ddt_num, evaded_at, udcIds) => ({
    doc_id, ddt_num, operator: 'ANDS', status: 'evaded', created_at: 1, evaded_at,
    lines: udcIds.map((id) => ({ article_code: 'PF001', lot_code: 'L1', qty: 1, udc_id: id })),
  });

  it('un bancale su un documento evaso porta numero e data', () => {
    const m = spedizioniDiBancale([evaso('D1', '10/2026', 5000, ['UDC-000012'])]);
    expect(m.get('UDC-000012')).toMatchObject({ doc_id: 'D1', ddt_num: '10/2026', data: 5000 });
  });

  /* ALL'EVASIONE LE RIGHE DI GIACENZA SPARISCONO, e un bancale spedito
     senza questa lettura si direbbe «vuoto»: vero, e inutile a chi cerca
     dov'e' finita la merce. Il documento resta l'unica memoria. */
  it('si porta dietro che cosa quel documento gli ha tolto', () => {
    const m = spedizioniDiBancale([evaso('D1', '10/2026', 5000, ['UDC-000012'])]);
    expect(m.get('UDC-000012').righe).toEqual([{
      item_key: '', article_code: 'PF001', article_description: '',
      lot_code: 'L1', expiry_date: '', qty: 1, qty_uom: null, uom: null,
    }]);
  });

  /* Un documento PENDENTE non ha portato via niente: la merce e' prenotata
     e sta ancora a scaffale. Uno annullato non ha mai prenotato. */
  it('i documenti non evasi non spediscono niente', () => {
    expect(spedizioniDiBancale([
      { ...evaso('D1', '10/2026', 5000, ['UDC-000012']), status: 'pending' },
      { ...evaso('D2', '11/2026', 6000, ['UDC-000013']), status: 'cancelled' },
    ]).size).toBe(0);
  });

  /* Un pallet svuotato a meta' su un DDT e finito su un altro e' partito
     davvero col secondo, ed e' quello che chi cerca la merce si aspetta. */
  it('su piu documenti vince il piu recente', () => {
    const m = spedizioniDiBancale([
      evaso('D1', '10/2026', 5000, ['UDC-000012']),
      evaso('D2', '11/2026', 9000, ['UDC-000012']),
    ]);
    expect(m.get('UDC-000012').ddt_num).toBe('11/2026');
  });

  it('una data assente non scalza una che c e', () => {
    const m = spedizioniDiBancale([
      evaso('D1', '10/2026', 5000, ['UDC-000012']),
      evaso('D2', '11/2026', null, ['UDC-000012']),
    ]);
    expect(m.get('UDC-000012').ddt_num).toBe('10/2026');
  });

  it('le righe senza bancale non entrano, e un elenco assente non e un errore', () => {
    expect(spedizioniDiBancale([evaso('D1', '10/2026', 5000, ['', '  '])]).size).toBe(0);
    expect(spedizioniDiBancale(null).size).toBe(0);
  });
});

/* IL VIAGGIO ARRIVA AL RIEPILOGO DA FUORI: `riepiloga` non sa leggere i
   documenti, e non deve — la stessa mappa serve a duecento bancali, e
   costruirla una volta per riga sarebbe sessantamila giri. */
describe('riepiloga con il viaggio', () => {
  it('porta DDT e data del documento che l ha spedito', () => {
    const viaggi = new Map([['UDC-000012', { doc_id: 'D1', ddt_num: '10/2026', data: 5000 }]]);
    const r = riepiloga(udc({ status: 'shipped' }), [riga()], null, null, viaggi);
    expect(r.ddt_num).toBe('10/2026');
    expect(r.shipped_at).toBe(5000);
    expect(r.stato).toBe('spedito');
  });

  it('senza viaggio i due campi sono assenti, non vuoti per finta', () => {
    const r = riepiloga(udc(), [riga()], null, null, null);
    expect(r.ddt_num).toBe(null);
    expect(r.shipped_at).toBe(null);
  });

  /* Un bancale spedito non ha piu' righe: quel che portava lo dice il
     documento, e la riga di elenco smette di leggersi «vuoto». */
  it('senza righe in giacenza legge il contenuto dal documento', () => {
    const viaggi = new Map([['UDC-000012', {
      doc_id: 'D1', ddt_num: '10/2026', data: 5000,
      righe: [{ item_key: 'PF001#L1', article_code: 'PF001', article_description: 'Omega 3',
                lot_code: 'L1', expiry_date: '2027-06-30', qty: 40, qty_uom: 500, uom: 'KG' }],
    }]]);
    const r = riepiloga(udc({ status: 'shipped' }), [], null, null, viaggi);
    expect(r.stato).toBe('spedito');
    expect(r.mono).toBe(true);
    expect(r.article_code).toBe('PF001');
    expect(r.lot_code).toBe('L1');
    expect(r.colli).toBe(40);
    expect(r.uom_qty).toBe(500);
    expect(descriviContenuto(r)).toBe('PF001#L1');
  });

  /* FINCHE' LA MERCE C'E' COMANDA LA MERCE: un bancale svuotato a meta' da
     un DDT porta ancora quel che gli e' rimasto sopra, non quel che e'
     uscito. */
  it('con righe in giacenza il documento non le scavalca', () => {
    const viaggi = new Map([['UDC-000012', {
      doc_id: 'D1', ddt_num: '10/2026', data: 5000,
      righe: [{ item_key: 'PF001#L1', article_code: 'PF001', article_description: '',
                lot_code: 'L1', expiry_date: '', qty: 999, qty_uom: null, uom: null }],
    }]]);
    const r = riepiloga(udc(), [riga()], null, null, viaggi);
    expect(r.colli).toBe(40);
    expect(r.stato).toBe('pronto');
  });
});
