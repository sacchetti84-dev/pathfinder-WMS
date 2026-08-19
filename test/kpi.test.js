import { describe, it, expect } from 'vitest';
import { perPersona, perMovimento, perArticolo, ultimiGiorni, NON_MISURABILE } from '../src/modules/kpi';

const G = 86400000;
const T0 = Date.UTC(2026, 7, 10, 9, 0, 0);   // 10/08/2026, mattina

const mov = (user, type, ts, extra = {}) => ({
  user, type, ts,
  article_code: extra.art ?? 'A1', lot_code: extra.lot ?? 'L1',
  location_code: extra.loc ?? 'MAG1-RAKA-01-01-T',
  qty_delta: extra.qty ?? null, qty_uom_delta: extra.uom ?? null, uom: extra.unita ?? undefined,
});

const compito = (extra = {}) => ({
  task_id: extra.id ?? 'TA-1', type: 'TRANSFER', priority: 2,
  status: extra.status ?? 'done', requested_by: 'ANDS',
  requested_at: extra.chiesto ?? T0,
  assigned_to: extra.preso ?? null, completed_by: extra.chiuso ?? null,
  started_at: extra.avvio ?? null, completed_at: extra.fine ?? null,
});

describe('perPersona', () => {
  it('conta i movimenti di ognuno e li separa per causale', () => {
    const r = perPersona([
      mov('ANDS', 'PICK', T0), mov('ANDS', 'PICK', T0 + 1000), mov('ANDS', 'MOVE', T0 + 2000),
      mov('BABB', 'PICK', T0),
    ], []);
    expect(r.map(x => x.sigla)).toEqual(['ANDS', 'BABB']);
    expect(r[0].movimenti).toBe(3);
    expect(r[0].perCausale).toEqual({ PICK: 2, MOVE: 1 });
  });

  it('esce ordinato dal piu attivo, che e l ordine in cui si legge', () => {
    const r = perPersona([mov('BABB', 'PICK', T0), mov('BABB', 'PICK', T0), mov('ANDS', 'PICK', T0)], []);
    expect(r[0].sigla).toBe('BABB');
  });

  it('CHI NON HA MOSSO NIENTE NON COMPARE: uno zero direbbe una cosa che il dato non dice', () => {
    const r = perPersona([mov('ANDS', 'PICK', T0)], []);
    expect(r.find(x => x.sigla === 'BABB')).toBeUndefined();
  });

  it('i colli si contano in valore assoluto: entrare e uscire e lavoro due volte', () => {
    const r = perPersona([
      mov('ANDS', 'PICK', T0, { qty: -3 }),
      mov('ANDS', 'IN', T0, { qty: 3 }),
    ], []);
    expect(r[0].colli).toBe(6);
  });

  it('LE UM NON SI SOMMANO FRA UNITA DIVERSE', () => {
    const r = perPersona([
      mov('ANDS', 'PICK', T0, { uom: -25, unita: 'KG' }),
      mov('ANDS', 'PICK', T0, { uom: -10, unita: 'PZ' }),
      mov('ANDS', 'PICK', T0, { uom: -5.5, unita: 'KG' }),
    ], []);
    expect(r[0].uom).toEqual({ KG: 30.5, PZ: 10 });
  });

  it('la media e sui GIORNI IN CUI HA LAVORATO, non sui giorni della finestra', () => {
    const r = perPersona([
      mov('ANDS', 'PICK', T0), mov('ANDS', 'PICK', T0 + 1000),
      mov('ANDS', 'PICK', T0 + 5 * G),
    ], []);
    expect(r[0].giorniAttivi).toBe(2);
    expect(r[0].movimentiAlGiorno).toBe(1.5);
  });

  it('la finestra taglia, e taglia col limite superiore ESCLUSO', () => {
    const f = { da: T0, a: T0 + G };
    const r = perPersona([mov('ANDS', 'PICK', T0 - 1), mov('ANDS', 'PICK', T0), mov('ANDS', 'PICK', T0 + G)], [], f);
    expect(r[0].movimenti).toBe(1);
  });

  it('la sigla si legge maiuscola e senza spazi, come si firma', () => {
    const r = perPersona([mov(' ands ', 'PICK', T0), mov('ANDS', 'PICK', T0)], []);
    expect(r).toHaveLength(1);
    expect(r[0].sigla).toBe('ANDS');
  });

  it('un movimento senza firma non fa nascere una riga vuota', () => {
    const r = perPersona([mov('', 'PICK', T0), mov(null, 'PICK', T0)], []);
    expect(r).toEqual([]);
  });

  it('chi PRENDE e chi CHIUDE un compito possono essere due persone', () => {
    const r = perPersona([], [compito({ preso: 'BABB', chiuso: 'ANDS', fine: T0 })]);
    expect(r.find(x => x.sigla === 'BABB').compitiPresi).toBe(1);
    expect(r.find(x => x.sigla === 'ANDS').compitiChiusi).toBe(1);
    expect(r.find(x => x.sigla === 'ANDS').compitiPresi).toBe(0);
  });

  it('un compito annullato non e un compito chiuso', () => {
    const r = perPersona([], [compito({ preso: 'ANDS', chiuso: 'ANDS', fine: T0, status: 'cancelled' })]);
    expect(r[0].compitiChiusi).toBe(0);
    expect(r[0].compitiAnnullati).toBe(1);
  });

  it('i due tempi sono MEDIANE: un compito lasciato aperto per il weekend non sposta il numero', () => {
    const r = perPersona([], [
      compito({ id: 'A', preso: 'ANDS', chiesto: T0, avvio: T0 + 60000, fine: T0 + 60000 + 10 * 60000 }),
      compito({ id: 'B', preso: 'ANDS', chiesto: T0, avvio: T0 + 60000, fine: T0 + 60000 + 20 * 60000 }),
      compito({ id: 'C', preso: 'ANDS', chiesto: T0, avvio: T0 + 60000, fine: T0 + 60000 + 3000 * 60000 }),
    ]);
    expect(r[0].minutiEsecuzione).toBe(20);
    expect(r[0].minutiAttesa).toBe(1);
  });

  it('senza compiti chiusi i tempi sono null, non zero', () => {
    const r = perPersona([mov('ANDS', 'PICK', T0)], []);
    expect(r[0].minutiEsecuzione).toBe(null);
    expect(r[0].minutiAttesa).toBe(null);
  });

  it('elenchi vuoti, nulli o storti non fanno male', () => {
    expect(perPersona(null, null)).toEqual([]);
    expect(perPersona([], [])).toEqual([]);
    expect(perPersona([null, undefined], [null])).toEqual([]);
  });
});

describe('perMovimento', () => {
  it('conta, spacca per causale e per sito letto dal codice del vano', () => {
    const r = perMovimento([
      mov('ANDS', 'PICK', T0, { loc: 'MAG1-RAKA-01-01-T' }),
      mov('ANDS', 'MOVE', T0, { loc: 'M03-STK-01-01-A' }),
      mov('ANDS', 'PICK', T0, { loc: 'M03-CAT-01' }),
    ]);
    expect(r.totale).toBe(3);
    expect(r.perCausale).toEqual({ PICK: 2, MOVE: 1 });
    expect(r.perSito).toEqual({ MAG1: 1, M03: 2 });
  });

  it('le rettifiche si contano e si mettono in percentuale', () => {
    const r = perMovimento([
      mov('ANDS', 'PICK', T0), mov('ANDS', 'FIX_OUT', T0), mov('ANDS', 'FIX_IN', T0), mov('ANDS', 'MOVE', T0),
    ]);
    expect(r.rettifiche).toBe(2);
    expect(r.rettifichePct).toBe(50);
  });

  it('UN MOVIMENTO SENZA FIRMA SI CONTA: e un buco in un registro che si tiene sei anni', () => {
    const r = perMovimento([mov('', 'PICK', T0), mov('ANDS', 'PICK', T0)]);
    expect(r.senzaFirma).toBe(1);
  });

  it('i movimenti storici senza quantita si contano a parte e non entrano nei colli', () => {
    const r = perMovimento([mov('ANDS', 'PICK', T0), mov('ANDS', 'PICK', T0, { qty: -4 })]);
    expect(r.senzaQuantita).toBe(1);
    expect(r.colli).toBe(4);
  });

  it('i giorni escono in ordine, uno per giorno', () => {
    const r = perMovimento([
      mov('ANDS', 'PICK', T0 + G), mov('ANDS', 'PICK', T0), mov('ANDS', 'PICK', T0),
    ]);
    expect(r.perGiorno).toEqual([
      { giorno: '2026-08-10', movimenti: 2 },
      { giorno: '2026-08-11', movimenti: 1 },
    ]);
  });

  it('le ventiquattro ore ci sono sempre tutte', () => {
    const r = perMovimento([mov('ANDS', 'PICK', T0)]);
    expect(r.perOra).toHaveLength(24);
    expect(r.perOra.reduce((s, n) => s + n, 0)).toBe(1);
  });

  it('un elenco vuoto da zero, non NaN', () => {
    const r = perMovimento([]);
    expect(r.totale).toBe(0);
    expect(r.rettifichePct).toBe(0);
  });
});

describe('perArticolo', () => {
  const gia = (extra = {}) => ({
    item_key: `${extra.art ?? 'A1'}#${extra.lot ?? 'L1'}`,
    article_code: extra.art ?? 'A1', lot_code: extra.lot ?? 'L1',
    location_code: extra.loc ?? 'MAG1-RAKA-01-01-T',
    qty: extra.qty ?? 1, qty_uom: extra.uom ?? null,
    expiry_date: extra.scad ?? '', placed_at: extra.quando ?? T0,
    last_updated_at: extra.quando ?? T0,
  });

  it('raggruppa le righe per articolo e conta su quante ubicazioni sta', () => {
    const r = perArticolo([
      gia({ qty: 3, loc: 'MAG1-RAKA-01-01-T' }),
      gia({ qty: 2, lot: 'L2', loc: 'MAG1-RAKA-01-01-A' }),
      gia({ qty: 5, art: 'A2' }),
    ], [], [], { adesso: T0 });
    const a1 = r.articoli.find(x => x.article_code === 'A1');
    expect(a1.righe).toBe(2);
    expect(a1.ubicazioni).toBe(2);
    expect(a1.colli).toBe(5);
  });

  it('le UM si sommano per articolo, e restano null se nessuna riga le ha', () => {
    const r = perArticolo([gia({ uom: 25.5 }), gia({ lot: 'L2', uom: 10.25 })], [], [], { adesso: T0 });
    expect(r.articoli[0].uom).toBe(35.75);
    const senza = perArticolo([gia({})], [], [], { adesso: T0 });
    expect(senza.articoli[0].uom).toBe(null);
  });

  it('la rotazione sono i movimenti della finestra, e le uscite sono i delta negativi', () => {
    const r = perArticolo([gia({})], [
      mov('ANDS', 'PICK', T0, { qty: -2 }), mov('ANDS', 'IN', T0, { qty: 5 }), mov('ANDS', 'PICK', T0, { qty: -1 }),
    ], [], { adesso: T0 });
    expect(r.articoli[0].movimenti).toBe(3);
    expect(r.articoli[0].uscite).toBe(2);
  });

  it('i giorni fermi si contano dall ultimo tocco della riga piu recente', () => {
    const adesso = T0 + 100 * G;
    const r = perArticolo([gia({ quando: T0 }), gia({ lot: 'L2', quando: T0 + 90 * G })], [], [], { adesso });
    expect(r.articoli[0].giorniFermo).toBe(10);
    expect(r.ferme).toBe(1);
  });

  it('scaduto e in scadenza sono due cose diverse', () => {
    const adesso = Date.UTC(2026, 7, 10);
    const r = perArticolo([
      gia({ lot: 'L1', scad: '2026-08-01' }),
      gia({ lot: 'L2', scad: '2026-08-20' }),
      gia({ lot: 'L3', scad: '2027-01-01' }),
    ], [], [], { adesso, giorniScadenza: 30 });
    expect(r.scadute).toBe(1);
    expect(r.inScadenza).toBe(1);
    expect(r.articoli[0].primaScadenza).toBe('2026-08-01');
  });

  it('LA COPERTURA DELL ANAGRAFICA e la misura di quanto valgano gli altri numeri', () => {
    const r = perArticolo(
      [gia({ art: 'A1' }), gia({ art: 'A2' })],
      [],
      [{ code: 'A1', unit: 'KG', pieces_per_pack: 25, allergens: ['glutine'], temp_class: 'AMB' }],
      { adesso: T0 },
    );
    expect(r.copertura.conGiacenza).toBe(2);
    expect(r.copertura.senzaUnita).toBe(1);
    expect(r.copertura.senzaPerCollo).toBe(1);
    expect(r.copertura.senzaAllergeni).toBe(1);
    expect(r.copertura.senzaConservazione).toBe(1);
  });

  it('una data di scadenza che non e una data non fa nascere un numero', () => {
    const r = perArticolo([gia({ scad: 'boh' })], [], [], { adesso: T0 });
    expect(r.scadute).toBe(0);
    expect(r.articoli[0].giorniAScadenza).toBe(null);
  });

  it('elenchi vuoti o nulli danno un risultato vuoto e non un errore', () => {
    const r = perArticolo(null, null, null, { adesso: T0 });
    expect(r.articoli).toEqual([]);
    expect(r.copertura.conGiacenza).toBe(0);
  });
});

describe('ultimiGiorni', () => {
  it('sette giorni finiscono a mezzanotte di stanotte, non adesso', () => {
    const f = ultimiGiorni(7, T0);
    expect(f.a - f.da).toBe(7 * G);
    expect(new Date(f.a).getHours()).toBe(0);
  });

  it('due finestre contigue non contano due volte lo stesso movimento', () => {
    const a = ultimiGiorni(7, T0);
    const dentroA = perMovimento([mov('ANDS', 'PICK', a.a - 1)], a).totale;
    const dopoA = perMovimento([mov('ANDS', 'PICK', a.a)], a).totale;
    expect(dentroA).toBe(1);
    expect(dopoA).toBe(0);
  });
});

describe('NON_MISURABILE', () => {
  it('ogni voce dice cosa manca e cosa servirebbe, non solo che manca', () => {
    expect(NON_MISURABILE.length).toBeGreaterThan(0);
    for (const v of NON_MISURABILE) {
      expect(v.cosa).toBeTruthy();
      expect(v.perche).toBeTruthy();
      expect(v.servirebbe).toBeTruthy();
    }
  });
});
