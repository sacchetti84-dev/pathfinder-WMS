import { describe, it, expect } from 'vitest';
import { conto, consumo, daRendere, attivo, ubicazioneDi, colliFuori } from '../src/modules/wip';

const mov = (odp, key, verso, qty, extra = {}) => ({
  odp_num: odp, item_key: key, verso, qty,
  qty_uom: extra.uom ?? null, uom: extra.unita ?? null,
  article_code: key.split('#')[0], lot_code: key.split('#')[1],
});

describe('conto', () => {
  it('somma quello che entra in lavorazione e quello che torna', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-1', 'A#L1', 'out', 3),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ entrato: 10, tornato: 3, residuo: 7 });
  });

  it('i movimenti di un ALTRO ordine non entrano nel conto', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-2', 'A#L1', 'in', 99),
    ], 'ODP-1');
    expect(c.righe[0].entrato).toBe(10);
    expect(c.entrato).toBe(10);
  });

  it('una riga per item, anche con dieci viaggi', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 5), mov('ODP-1', 'A#L1', 'in', 5),
      mov('ODP-1', 'A#L1', 'out', 2), mov('ODP-1', 'B#L2', 'in', 1),
    ], 'ODP-1');
    expect(c.righe).toHaveLength(2);
    expect(c.righe[0]).toMatchObject({ item_key: 'A#L1', entrato: 10, tornato: 2, residuo: 8 });
  });

  it('le UM si sommano accanto ai colli, senza coda binaria', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 2, { uom: 0.1, unita: 'KG' }),
      mov('ODP-1', 'A#L1', 'in', 1, { uom: 0.2, unita: 'KG' }),
      mov('ODP-1', 'A#L1', 'out', 1, { uom: 0.1, unita: 'KG' }),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ entrato_uom: 0.3, tornato_uom: 0.1, residuo_uom: 0.2, uom: 'KG' });
  });

  it('una riga a soli colli non si inventa un saldo in UM', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 4)], 'ODP-1');
    expect(c.righe[0].residuo_uom).toBe(null);
  });

  it('TORNATO PIU DI QUANTO ENTRATO si mostra, non si nasconde', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 2), mov('ODP-1', 'A#L1', 'out', 5)], 'ODP-1');
    expect(c.incoerente).toBe(true);
    expect(c.righe[0].residuo).toBe(-3);
  });

  it('le righe escono in ordine di chiave: due letture si confrontano a occhio', () => {
    const c = conto([mov('ODP-1', 'C#L3', 'in', 1), mov('ODP-1', 'A#L1', 'in', 1)], 'ODP-1');
    expect(c.righe.map(r => r.item_key)).toEqual(['A#L1', 'C#L3']);
  });

  it('nessun movimento, nessun ordine: conto vuoto e nessun errore', () => {
    expect(conto([], 'ODP-1').righe).toEqual([]);
    expect(conto(null, 'ODP-1').righe).toEqual([]);
    expect(conto([mov('ODP-1', 'A#L1', 'in', 1)], '').righe).toEqual([]);
  });
});

describe('reso e consumo non sono la stessa cosa', () => {
  /* Alla prima prova al banco la chiusura contava come «tornato 1» merce
     che a magazzino non era tornata affatto: un saldo giusto con la parola
     sbagliata resta una bugia, e la legge chi cerca il consumo fra sei mesi. */
  it('il CONSUMO esce dal conto ma non e un reso', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-1', 'A#L1', 'consumo', 7),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ entrato: 10, tornato: 0, consumato: 7, residuo: 3 });
    expect(c.tornato).toBe(0);
    expect(c.consumato).toBe(7);
  });

  it('i due versi convivono sulla stessa riga', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-1', 'A#L1', 'out', 2),
      mov('ODP-1', 'A#L1', 'consumo', 8),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ tornato: 2, consumato: 8, residuo: 0 });
  });

  it('anche in UM restano separati', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 3, { uom: 30, unita: 'KG' }),
      mov('ODP-1', 'A#L1', 'consumo', 2, { uom: 20, unita: 'KG' }),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ consumato_uom: 20, tornato_uom: null, residuo_uom: 10 });
  });

  it('consumare piu di quanto sia entrato non sta in piedi, e si vede', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 2), mov('ODP-1', 'A#L1', 'consumo', 5)], 'ODP-1');
    expect(c.incoerente).toBe(true);
  });

  it('un conto chiuso del tutto non manda piu nessuno a rendere niente', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 4), mov('ODP-1', 'A#L1', 'consumo', 4)], 'ODP-1');
    expect(daRendere(c)).toEqual([]);
    expect(consumo(c, true)).toEqual([]);
  });
});

describe('consumo', () => {
  const c = conto([
    mov('ODP-1', 'A#L1', 'in', 10, { uom: 100, unita: 'KG' }),
    mov('ODP-1', 'A#L1', 'out', 3, { uom: 30, unita: 'KG' }),
    mov('ODP-1', 'B#L2', 'in', 4), mov('ODP-1', 'B#L2', 'out', 4),
  ], 'ODP-1');

  it('a ordine CHIUSO, quel che e entrato e non e tornato e il consumo reale', () => {
    const k = consumo(c, true);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ item_key: 'A#L1', residuo: 7, residuo_uom: 70 });
  });

  it('quello che e tornato tutto non ha consumato niente, e non compare', () => {
    expect(consumo(c, true).some(r => r.item_key === 'B#L2')).toBe(false);
  });

  it('A ORDINE APERTO NON C E NESSUN CONSUMO: e merce ancora sul bancone', () => {
    expect(consumo(c, false)).toBe(null);
  });

  it('senza conto non si dichiara un consumo', () => {
    expect(consumo(null, true)).toBe(null);
  });
});

describe('daRendere', () => {
  it('e l elenco di cosa deve tornare perche il conto chiuda a zero', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10), mov('ODP-1', 'A#L1', 'out', 3),
      mov('ODP-1', 'B#L2', 'in', 4), mov('ODP-1', 'B#L2', 'out', 4),
    ], 'ODP-1');
    expect(daRendere(c).map(r => r.item_key)).toEqual(['A#L1']);
  });

  it('un conto gia a zero non manda nessuno a recuperare niente', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 2), mov('ODP-1', 'A#L1', 'out', 2)], 'ODP-1');
    expect(daRendere(c)).toEqual([]);
    expect(daRendere(null)).toEqual([]);
  });
});

describe('attivo', () => {
  it('a interruttore SPENTO questo modulo non decide niente', () => {
    expect(attivo(false)).toBe(false);
    expect(attivo(null)).toBe(false);
    expect(attivo(undefined)).toBe(false);
  });

  it('acceso e acceso solo se e proprio vero', () => {
    expect(attivo(true)).toBe(true);
  });
});

describe('ubicazioneDi', () => {
  it('una per ordine: due ODP nello stesso vano sarebbero due consumi mescolati', () => {
    expect(ubicazioneDi('WIP', 'ODP2603889')).toBe('WIP-ODP2603889');
    expect(ubicazioneDi('WIP', 'ODP-1')).not.toBe(ubicazioneDi('WIP', 'ODP-2'));
  });

  it('si maiuscola e si ripulisce, come ogni codice di ubicazione', () => {
    expect(ubicazioneDi(' wip ', ' odp-1 ')).toBe('WIP-ODP-1');
  });

  it('SENZA AREA CONFIGURATA non si inventa un vano', () => {
    expect(ubicazioneDi('', 'ODP-1')).toBe(null);
    expect(ubicazioneDi(null, 'ODP-1')).toBe(null);
    expect(ubicazioneDi('WIP', '')).toBe(null);
  });
});

describe('colliFuori', () => {
  const con = (odp, key, verso, packs) => ({ odp_num: odp, item_key: key, verso, packs });

  it('le misure entrate, meno quelle gia tornate', () => {
    expect(colliFuori([
      con('ODP-1', 'A#L1', 'in', [25, 25, 7]),
      con('ODP-1', 'A#L1', 'out', [25]),
    ], 'ODP-1', 'A#L1')).toEqual([25, 7]);
  });

  it('il consumo toglie come il reso: escono tutti e due dal conto', () => {
    expect(colliFuori([
      con('ODP-1', 'A#L1', 'in', [25, 25, 7]),
      con('ODP-1', 'A#L1', 'consumo', [25, 7]),
    ], 'ODP-1', 'A#L1')).toEqual([25]);
  });

  it('DUE ORDINI NELLO STESSO VANO non si mescolano', () => {
    const mv = [
      con('ODP-1', 'A#L1', 'in', [25, 10]),
      con('ODP-2', 'A#L1', 'in', [5, 5]),
    ];
    expect(colliFuori(mv, 'ODP-1', 'A#L1')).toEqual([25, 10]);
    expect(colliFuori(mv, 'ODP-2', 'A#L1')).toEqual([5, 5]);
  });

  it('due lotti dello stesso ordine restano distinti', () => {
    const mv = [con('ODP-1', 'A#L1', 'in', [25]), con('ODP-1', 'A#L2', 'in', [9])];
    expect(colliFuori(mv, 'ODP-1', 'A#L1')).toEqual([25]);
    expect(colliFuori(mv, 'ODP-1', 'A#L2')).toEqual([9]);
  });

  it('si toglie UNA misura per volta, non tutte quelle uguali', () => {
    expect(colliFuori([
      con('ODP-1', 'A#L1', 'in', [25, 25, 25]),
      con('ODP-1', 'A#L1', 'out', [25]),
    ], 'ODP-1', 'A#L1')).toEqual([25, 25]);
  });

  it('un reso di una misura che non e mai entrata non toglie niente a caso', () => {
    expect(colliFuori([
      con('ODP-1', 'A#L1', 'in', [25, 7]),
      con('ODP-1', 'A#L1', 'out', [9]),
    ], 'ODP-1', 'A#L1')).toEqual([25, 7]);
  });

  it('senza colli dichiarati non c e niente da ritrovare, e si torna a lavorare a numero', () => {
    expect(colliFuori([{ odp_num: 'ODP-1', item_key: 'A#L1', verso: 'in', qty: 3 }], 'ODP-1', 'A#L1')).toEqual([]);
    expect(colliFuori([], 'ODP-1', 'A#L1')).toEqual([]);
    expect(colliFuori(null, 'ODP-1', 'A#L1')).toEqual([]);
    expect(colliFuori([con('ODP-1', 'A#L1', 'in', [25])], '', 'A#L1')).toEqual([]);
    expect(colliFuori([con('ODP-1', 'A#L1', 'in', [25])], 'ODP-1', '')).toEqual([]);
  });

  it('gli zeri e i numeri che non sono numeri non entrano nell elenco', () => {
    expect(colliFuori([con('ODP-1', 'A#L1', 'in', [25, 0, null, 'x', 7])], 'ODP-1', 'A#L1')).toEqual([25, 7]);
  });
});
