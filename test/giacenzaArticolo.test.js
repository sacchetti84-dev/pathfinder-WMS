import { describe, it, expect } from 'vitest';
import { perLotto, riepiloga, codaDiConta, chiaveRiga } from '../src/modules/giacenzaArticolo';

/* Una riga di giacenza come la passa la vista: le UM arrivano gia' risolte. */
const riga = (loc, lot, colli, extra = {}) => ({
  location_code: loc,
  lot_code: lot,
  item_key: `ART-1#${lot}`,
  expiry_date: extra.expiry ?? '',
  placed_at: extra.placed ?? 0,
  colli,
  uom_qty: extra.uom_qty ?? null,
  uom: extra.uom ?? null,
});

describe('perLotto', () => {
  it('lo stesso lotto in tre ubicazioni e\' UN lotto, non tre righe', () => {
    const g = perLotto([
      riga('MAG-A-01', 'L1', 3),
      riga('MAG-B-02', 'L1', 2),
      riga('MAG-C-03', 'L1', 1),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].colli).toBe(6);
    expect(g[0].righe).toHaveLength(3);
  });

  it('le ubicazioni di un lotto escono in ordine di codice: il giro e\' quello', () => {
    const g = perLotto([
      riga('MAG-C-03', 'L1', 1),
      riga('MAG-A-01', 'L1', 3),
      riga('MAG-B-02', 'L1', 2),
    ]);
    expect(g[0].righe.map(r => r.location_code)).toEqual(['MAG-A-01', 'MAG-B-02', 'MAG-C-03']);
  });

  it('i lotti escono FEFO: chi scade prima si conta prima', () => {
    const g = perLotto([
      riga('MAG-A-01', 'TARDI', 1, { expiry: '2027-01-31' }),
      riga('MAG-A-02', 'PRESTO', 1, { expiry: '2026-09-30' }),
      riga('MAG-A-03', 'MEZZO', 1, { expiry: '2026-12-01' }),
    ]);
    expect(g.map(x => x.lot_code)).toEqual(['PRESTO', 'MEZZO', 'TARDI']);
  });

  it('un lotto senza scadenza va in CODA, non in testa', () => {
    const g = perLotto([
      riga('MAG-A-01', 'IGNOTO', 1),
      riga('MAG-A-02', 'SCADE', 1, { expiry: '2030-01-01' }),
    ]);
    expect(g.map(x => x.lot_code)).toEqual(['SCADE', 'IGNOTO']);
  });

  it('fra due lotti senza scadenza decide l\'anzianita\', cioe\' FIFO', () => {
    const g = perLotto([
      riga('MAG-A-01', 'NUOVO', 1, { placed: 2000 }),
      riga('MAG-A-02', 'VECCHIO', 1, { placed: 1000 }),
    ]);
    expect(g.map(x => x.lot_code)).toEqual(['VECCHIO', 'NUOVO']);
  });

  it('due scadenze discordi sullo stesso lotto: vince la piu\' vicina', () => {
    const g = perLotto([
      riga('MAG-A-01', 'L1', 1, { expiry: '2027-05-01' }),
      riga('MAG-A-02', 'L1', 1, { expiry: '2026-11-01' }),
    ]);
    expect(g[0].expiry_date).toBe('2026-11-01');
  });

  it('le UM del lotto sono la somma delle sue righe, senza coda binaria', () => {
    const g = perLotto([
      riga('MAG-A-01', 'L1', 2, { uom_qty: 0.1, uom: 'KG' }),
      riga('MAG-A-02', 'L1', 1, { uom_qty: 0.2, uom: 'KG' }),
    ]);
    expect(g[0].uom_qty).toBe(0.3);
    expect(g[0].uom).toBe('KG');
  });

  it('un lotto senza nessuna riga con unita\' resta a null: non e\' uno zero', () => {
    const g = perLotto([riga('MAG-A-01', 'L1', 4)]);
    expect(g[0].uom_qty).toBe(null);
    expect(g[0].colli).toBe(4);
  });

  it('elenco vuoto o assente: nessun lotto, nessun errore', () => {
    expect(perLotto([])).toEqual([]);
    expect(perLotto(null)).toEqual([]);
    expect(perLotto(undefined)).toEqual([]);
  });
});

describe('riepiloga', () => {
  it('conta righe, ubicazioni distinte e colli', () => {
    const r = riepiloga([
      riga('MAG-A-01', 'L1', 3),
      riga('MAG-A-01', 'L2', 2),
      riga('MAG-B-02', 'L1', 1),
    ]);
    expect(r.righe).toBe(3);
    expect(r.ubicazioni).toBe(2);
    expect(r.colli).toBe(6);
  });

  it('i totali si sommano PER UNITA\', mai fra unita\' diverse', () => {
    const r = riepiloga([
      riga('MAG-A-01', 'L1', 3, { uom_qty: 75, uom: 'KG' }),
      riga('MAG-A-02', 'L2', 2, { uom_qty: 400, uom: 'PZ' }),
      riga('MAG-A-03', 'L3', 1, { uom_qty: 25, uom: 'KG' }),
    ]);
    expect(r.totali).toEqual([{ uom: 'KG', quantita: 100 }, { uom: 'PZ', quantita: 400 }]);
  });

  it('le righe senza unita\' si contano: dicono se il totale racconta tutto', () => {
    const r = riepiloga([
      riga('MAG-A-01', 'L1', 3, { uom_qty: 75, uom: 'KG' }),
      riga('MAG-A-02', 'L2', 2),
    ]);
    expect(r.senzaUnita).toBe(1);
    expect(r.totali).toEqual([{ uom: 'KG', quantita: 75 }]);
  });

  it('niente a magazzino: tutto a zero, e nessun totale inventato', () => {
    const r = riepiloga([]);
    expect(r).toEqual({ lotti: [], righe: 0, ubicazioni: 0, colli: 0, totali: [], senzaUnita: 0 });
  });
});

describe('codaDiConta', () => {
  const righe = [
    riga('MAG-B-02', 'TARDI', 1, { expiry: '2027-01-31' }),
    riga('MAG-A-01', 'PRESTO', 1, { expiry: '2026-09-30' }),
    riga('MAG-C-03', 'PRESTO', 1, { expiry: '2026-09-30' }),
  ];

  it('la coda segue lo SCAFFALE, non l\'ordine in cui si e\' spuntato', () => {
    const scelte = [
      chiaveRiga(righe[0]),   // TARDI, spuntato per primo
      chiaveRiga(righe[2]),   // PRESTO in C
      chiaveRiga(righe[1]),   // PRESTO in A
    ];
    expect(codaDiConta(righe, scelte).map(r => r.location_code))
      .toEqual(['MAG-A-01', 'MAG-C-03', 'MAG-B-02']);
  });

  it('si contano solo le righe scelte', () => {
    const coda = codaDiConta(righe, [chiaveRiga(righe[1])]);
    expect(coda).toHaveLength(1);
    expect(coda[0].location_code).toBe('MAG-A-01');
  });

  it('una riga uscita fra la spunta e la conferma si scarta in silenzio', () => {
    const coda = codaDiConta(righe, [chiaveRiga(righe[1]), 'MAG-Z-99|ART-1#SPARITO']);
    expect(coda).toHaveLength(1);
  });

  it('nessuna scelta: nessuna coda', () => {
    expect(codaDiConta(righe, [])).toEqual([]);
    expect(codaDiConta(righe, null)).toEqual([]);
    expect(codaDiConta([], ['x'])).toEqual([]);
  });
});

describe('chiaveRiga', () => {
  it('la chiave e\' ubicazione + item: e\' l\'indice della giacenza', () => {
    expect(chiaveRiga({ location_code: 'MAG-A-01', item_key: 'ART-1#L1' }))
      .toBe('MAG-A-01|ART-1#L1');
  });

  it('lo stesso lotto in due ubicazioni ha due chiavi diverse', () => {
    const a = chiaveRiga({ location_code: 'MAG-A-01', item_key: 'ART-1#L1' });
    const b = chiaveRiga({ location_code: 'MAG-B-02', item_key: 'ART-1#L1' });
    expect(a).not.toBe(b);
  });
});
