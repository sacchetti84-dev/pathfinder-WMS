/* IL GIRO — PIÙ ORDINI IN UN PERCORSO SOLO, 2.12.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Il caso che questo modulo esiste per risolvere è quello dei cinque ODP che
   chiedono lo stesso articolo dallo stesso lotto: prelevati uno alla volta
   sono cinque giri sulle stesse corsie, e il primo che apre un collo lascia
   agli altri quattro un lotto che a scaffale non basta più.

   Qui si collauda quel che si può collaudare da fermo, cioè tutto quello che
   riguarda i NUMERI: la ricalibrazione su una quantità diversa, la somma
   delle distinte, e la ripartizione del consumo fra gli ordini. Il cammino
   lo decide `PickRoute`, che ha bisogno di Store e si prova altrove. */

import { describe, it, expect } from 'vitest';
import {
  chiaveRiga, qtaPianificata, fattoreDa, scala, ordineDelGiro, ricalibra,
  unisci, quote, numeriDelGiro,
} from '../src/modules/giroOdp';
import { contoTenutoDa, ordiniServiti, richiesteDiRiga, consumoPerOrdine } from '../src/modules/wip';
import { arrotonda } from '../src/modules/misure';

/* Le quote si sommano come si somma ogni quantita' in questo applicativo:
   passando da `arrotonda`. Sommare i float grezzi rifarebbe `0,1 + 0,2` —
   e' il difetto che `misure.ts` esiste per chiudere, non uno di questo
   modulo. */
const somma = (q) => arrotonda(q.reduce((a, x) => a + x.qty, 0));

const TESTATA = (odp, qty = '350', um = 'KG') => ({
  odp_num: odp, commessa: '', article_code: 'FIN1', article_desc: 'Finito',
  lot: 'L1', qty_planned: qty, um,
});

/** Una riga di distinta con un lotto solo. */
const RIGA = (art, lot, qty, um = 'KG') => ({
  article_code: art, category: 'MP', description: `Articolo ${art}`, um,
  qty_per_unit: null, total_qty: qty,
  lots: [{ lot_code: lot, supplier_lot: '', um, qty, expiry_iso: '', state: '' }],
});

const ORDINE = (odp, righe, qty = '350') =>
  ordineDelGiro(TESTATA(odp, qty), righe, [], `${odp}.xlsx`);

describe('la quantità dell’ordine, letta per farci una divisione', () => {
  it('la virgola italiana è un dato, non un errore di chi digita', () => {
    expect(qtaPianificata(TESTATA('ODP1', '350,5'))).toBe(350.5);
  });

  it('una testata che non porta un numero non si ricalibra: null, non zero', () => {
    expect(qtaPianificata(TESTATA('ODP1', ''))).toBe(null);
    expect(qtaPianificata(TESTATA('ODP1', 'a richiesta'))).toBe(null);
    expect(qtaPianificata(TESTATA('ODP1', '0'))).toBe(null);
  });

  it('il fattore è il rapporto fra voluta e pianificata', () => {
    expect(fattoreDa(TESTATA('ODP1', '350'), 700)).toBe(2);
    expect(fattoreDa(TESTATA('ODP1', '350'), '175')).toBe(0.5);
  });

  it('senza uno dei due numeri non c’è fattore: meglio nessuna ricalibrazione che una inventata', () => {
    expect(fattoreDa(TESTATA('ODP1', 'boh'), 700)).toBe(null);
    expect(fattoreDa(TESTATA('ODP1', '350'), '')).toBe(null);
    expect(fattoreDa(TESTATA('ODP1', '350'), -1)).toBe(null);
  });
});

describe('scala — la distinta segue la quantità in testata', () => {
  const righe = [RIGA('A', 'LA', 10), RIGA('B', 'LB', 0.315)];

  it('il totale e i lotti si moltiplicano tutti e due', () => {
    const out = scala(righe, 2);
    expect(out[0].total_qty).toBe(20);
    expect(out[0].lots[0].qty).toBe(20);
    expect(out[1].total_qty).toBe(0.63);
    expect(out[1].lots[0].qty).toBe(0.63);
  });

  it('i decimali sono quelli dell’unità: su PZ non si scrive mezzo pezzo', () => {
    const out = scala([RIGA('C', 'LC', 500, 'PZ')], 1.5);
    expect(out[0].total_qty).toBe(750);
    const dispari = scala([RIGA('C', 'LC', 3, 'PZ')], 1.5);
    expect(dispari[0].total_qty).toBe(5);          // 4,5 arrotondato all'unità
  });

  it('il fattore 1 non tocca niente, e un fattore assurdo nemmeno', () => {
    expect(scala(righe, 1)[0].total_qty).toBe(10);
    expect(scala(righe, 0)[0].total_qty).toBe(10);
    expect(scala(righe, NaN)[0].total_qty).toBe(10);
  });

  it('l’originale non viene toccato: chi ricalibra due volte deve poterci tornare', () => {
    scala(righe, 3);
    expect(righe[0].total_qty).toBe(10);
    expect(righe[0].lots[0].qty).toBe(10);
  });
});

describe('ricalibra — due volte di fila non compongono i fattori', () => {
  const o = ORDINE('ODP1', [RIGA('A', 'LA', 10)], '350');

  it('350 → 700 raddoppia', () => {
    const r = ricalibra(o, 700);
    expect(r.fattore).toBe(2);
    expect(r.lines[0].total_qty).toBe(20);
  });

  it('poi 700 → 1050 fa il TRIPLO dell’ordine, non il triplo del doppio', () => {
    const r = ricalibra(ricalibra(o, 700), 1050);
    expect(r.fattore).toBe(3);
    expect(r.lines[0].total_qty).toBe(30);
  });

  it('campo vuoto: si torna alla quantità dell’ordine', () => {
    const r = ricalibra(ricalibra(o, 700), '');
    expect(r.fattore).toBe(1);
    expect(r.qty_voluta).toBe(null);
    expect(r.lines[0].total_qty).toBe(10);
  });
});

describe('unisci — le distinte si sommano prima del cammino', () => {
  it('cinque ordini che chiedono 5 KG dello stesso lotto fanno UNA riga da 25', () => {
    const ordini = [1, 2, 3, 4, 5].map((n) => ORDINE(`ODP${n}`, [RIGA('A', 'LA', 5)]));
    const { lines, richieste } = unisci(ordini);
    expect(lines).toHaveLength(1);
    expect(lines[0].total_qty).toBe(25);
    expect(lines[0].lots[0].qty).toBe(25);
    const r = richieste.get(chiaveRiga('A', 'LA'));
    expect(r).toHaveLength(5);
    expect(r.map((x) => x.qty)).toEqual([5, 5, 5, 5, 5]);
    expect(r.map((x) => x.odp_num)).toEqual(['ODP1', 'ODP2', 'ODP3', 'ODP4', 'ODP5']);
  });

  it('lotti diversi dello stesso articolo restano due righe: sono due partite', () => {
    const { lines, richieste } = unisci([
      ORDINE('ODP1', [RIGA('A', 'LA', 5)]),
      ORDINE('ODP2', [RIGA('A', 'LB', 7)]),
    ]);
    expect(lines).toHaveLength(1);                       // un articolo solo
    expect(lines[0].lots.map((l) => l.lot_code)).toEqual(['LA', 'LB']);
    expect(lines[0].total_qty).toBe(12);
    expect(richieste.get(chiaveRiga('A', 'LA'))).toEqual([{ odp_num: 'ODP1', qty: 5 }]);
    expect(richieste.get(chiaveRiga('A', 'LB'))).toEqual([{ odp_num: 'ODP2', qty: 7 }]);
  });

  it('una riga senza lotto NON si fonde con una che ce l’ha: quella non è prelevabile', () => {
    const senza = { ...RIGA('A', 'LA', 5), lots: [] };
    const { lines, richieste } = unisci([
      ORDINE('ODP1', [senza]),
      ORDINE('ODP2', [RIGA('A', 'LA', 5)]),
    ]);
    expect(lines[0].total_qty).toBe(10);
    expect(lines[0].lots).toHaveLength(1);
    expect(richieste.get(chiaveRiga('A', ''))).toEqual([{ odp_num: 'ODP1', qty: 5 }]);
    expect(richieste.get(chiaveRiga('A', 'LA'))).toEqual([{ odp_num: 'ODP2', qty: 5 }]);
  });

  it('lo stesso ordine che chiede due volte lo stesso lotto somma su sé stesso, una richiesta sola', () => {
    const { richieste } = unisci([
      ORDINE('ODP1', [RIGA('A', 'LA', 5), RIGA('A', 'LA', 3)]),
    ]);
    expect(richieste.get(chiaveRiga('A', 'LA'))).toEqual([{ odp_num: 'ODP1', qty: 8 }]);
  });

  it('l’ordine delle righe è quello di primo incontro: la serpentina riordina dopo', () => {
    const { lines } = unisci([
      ORDINE('ODP1', [RIGA('Z', 'LZ', 1), RIGA('A', 'LA', 1)]),
      ORDINE('ODP2', [RIGA('M', 'LM', 1)]),
    ]);
    expect(lines.map((l) => l.article_code)).toEqual(['Z', 'A', 'M']);
  });

  it('la ricalibrazione entra nella somma: è la distinta in vigore che si unisce', () => {
    const { lines } = unisci([
      ricalibra(ORDINE('ODP1', [RIGA('A', 'LA', 5)], '350'), 700),
      ORDINE('ODP2', [RIGA('A', 'LA', 5)]),
    ]);
    expect(lines[0].total_qty).toBe(15);
  });

  it('nessun ordine, nessuna riga', () => {
    expect(unisci([]).lines).toEqual([]);
    expect(unisci(null).lines).toEqual([]);
  });
});

describe('quote — come si ripartisce quello che è uscito davvero', () => {
  const cinque = [1, 2, 3, 4, 5].map((n) => ({ odp_num: `ODP${n}`, qty: 5 }));

  it('il sacco da 25 si divide per cinque, esatto', () => {
    expect(quote(cinque, 25, 'KG')).toEqual(
      cinque.map((r) => ({ odp_num: r.odp_num, qty: 5 })));
  });

  it('LA SOMMA DELLE QUOTE FA ESATTAMENTE QUELLO CHE È USCITO, sempre', () => {
    const q = quote([
      { odp_num: 'A', qty: 1 }, { odp_num: 'B', qty: 1 }, { odp_num: 'C', qty: 1 },
    ], 10, 'KG');
    expect(somma(q)).toBe(10);
    /* L'ultima assorbe il resto dell'arrotondamento: 3,333 + 3,333 + 3,334. */
    expect(q.map((x) => x.qty)).toEqual([3.333, 3.333, 3.334]);
  });

  it('chi ha chiesto di più prende di più', () => {
    const q = quote([{ odp_num: 'A', qty: 20 }, { odp_num: 'B', qty: 5 }], 25, 'KG');
    expect(q).toEqual([{ odp_num: 'A', qty: 20 }, { odp_num: 'B', qty: 5 }]);
  });

  it('un ordine solo si prende tutto, senza fare conti', () => {
    expect(quote([{ odp_num: 'A', qty: 5 }], 25)).toEqual([{ odp_num: 'A', qty: 25 }]);
  });

  it('nessuno che abbia chiesto qualcosa: parti uguali, che è l’unica difendibile', () => {
    const q = quote([{ odp_num: 'A', qty: 0 }, { odp_num: 'B', qty: 0 }], 10, 'KG');
    expect(q).toEqual([{ odp_num: 'A', qty: 5 }, { odp_num: 'B', qty: 5 }]);
  });

  it('senza richieste non si ripartisce niente', () => {
    expect(quote([], 10)).toEqual([]);
    expect(quote(null, 10)).toEqual([]);
  });
});

describe('numeriDelGiro', () => {
  it('in maiuscolo e senza doppioni', () => {
    expect(numeriDelGiro([ORDINE('odp1', []), ORDINE('ODP1', []), ORDINE('ODP2', [])]))
      .toEqual(['ODP1', 'ODP2']);
  });
});

/* ── IL CONTO: chi lo tiene, e per chi ────────────────────────────────
   Il conto di un giro è UNO, intestato al capofila. Gli altri ordini stanno
   scritti sui movimenti e non entrano in nessun saldo. */
describe('il conto di un giro lo tiene il capofila', () => {
  const MOV = [
    { odp_num: 'ODP1', item_key: 'A#LA', verso: 'in', qty: 1, qty_uom: 25, uom: 'KG',
      giro_odps: ['ODP1', 'ODP2', 'ODP3'], giro_id: 'PS-1',
      giro_richieste: [{ odp_num: 'ODP1', qty: 15 }, { odp_num: 'ODP2', qty: 5 }, { odp_num: 'ODP3', qty: 5 }] },
  ];

  it('un ordine servito dal giro dice DOVE sta il suo conto, invece di rispondere «niente»', () => {
    expect(contoTenutoDa(MOV, 'ODP2')).toEqual({ capofila: 'ODP1', giro_id: 'PS-1' });
    expect(contoTenutoDa(MOV, 'odp3')).toEqual({ capofila: 'ODP1', giro_id: 'PS-1' });
  });

  it('il capofila NON viene rimandato altrove: il conto è suo, e `conto()` risponde', () => {
    expect(contoTenutoDa(MOV, 'ODP1')).toBe(null);
  });

  it('un ordine estraneo al giro non ha nessun conto da nominare', () => {
    expect(contoTenutoDa(MOV, 'ODP9')).toBe(null);
    expect(contoTenutoDa([], 'ODP2')).toBe(null);
  });

  it('il capofila elenca chi sta servendo, sé stesso escluso', () => {
    expect(ordiniServiti(MOV, 'ODP1')).toEqual(['ODP2', 'ODP3']);
    expect(ordiniServiti(MOV, 'ODP2')).toEqual([]);
  });

  it('le richieste di una riga si sommano su più entrate: una riga può scendere in due viaggi', () => {
    const due = [...MOV, { ...MOV[0], giro_richieste: [{ odp_num: 'ODP1', qty: 10 }, { odp_num: 'ODP2', qty: 2 }] }];
    expect(richiesteDiRiga(due, 'ODP1', 'A#LA')).toEqual([
      { odp_num: 'ODP1', qty: 25 }, { odp_num: 'ODP2', qty: 7 }, { odp_num: 'ODP3', qty: 5 },
    ]);
  });

  it('una riga che non è di un giro non ha richieste, e non è un errore', () => {
    expect(richiesteDiRiga(MOV, 'ODP1', 'B#LB')).toEqual([]);
    expect(richiesteDiRiga([{ odp_num: 'ODP1', item_key: 'A#LA', verso: 'in', qty: 1 }], 'ODP1', 'A#LA')).toEqual([]);
  });

  it('solo le ENTRATE portano richieste: un reso non dice per chi era sceso il sacco', () => {
    const conReso = [...MOV, { ...MOV[0], verso: 'out', giro_richieste: [{ odp_num: 'ODP9', qty: 99 }] }];
    expect(richiesteDiRiga(conReso, 'ODP1', 'A#LA').map((r) => r.odp_num))
      .toEqual(['ODP1', 'ODP2', 'ODP3']);
  });

  /* La ripartizione vera: dal chiesto al consumato, con la somma che torna. */
  it('il consumo si ripartisce nella proporzione di quel che era stato chiesto', () => {
    const richieste = richiesteDiRiga(MOV, 'ODP1', 'A#LA');
    const q = quote(richieste, 25, 'KG');
    expect(q).toEqual([
      { odp_num: 'ODP1', qty: 15 }, { odp_num: 'ODP2', qty: 5 }, { odp_num: 'ODP3', qty: 5 },
    ]);
    expect(somma(q)).toBe(25);
  });

  it('e se ne è stato consumato meno di quanto chiesto, la somma è comunque quella', () => {
    const q = quote(richiesteDiRiga(MOV, 'ODP1', 'A#LA'), 19.42, 'KG');
    expect(somma(q)).toBe(19.42);
  });
});

/* ── LA RIPARTIZIONE SCRITTA ALLA CHIUSURA ────────────────────────────
   Il rendiconto deve poter dire quanto ha consumato ciascun ordine del giro,
   e quel numero sta sulle DICHIARAZIONI DI CONSUMO — non sulle entrate: fra
   quel che era stato chiesto e quel che è finito nel prodotto ci sono il
   reso e i colli interi. */
describe('consumoPerOrdine — quanto ne è finito nel prodotto, per ordine', () => {
  const CHIUSO = [
    { odp_num: 'ODP1', item_key: 'A#LA', article_code: 'A', lot_code: 'LA', verso: 'in',
      qty: 1, qty_uom: 25, uom: 'KG', giro_odps: ['ODP1', 'ODP2'],
      giro_richieste: [{ odp_num: 'ODP1', qty: 20 }, { odp_num: 'ODP2', qty: 5 }] },
    { odp_num: 'ODP1', item_key: 'A#LA', article_code: 'A', lot_code: 'LA', verso: 'consumo',
      qty: 1, qty_uom: 25, uom: 'KG',
      giro_richieste: [{ odp_num: 'ODP1', qty: 20 }, { odp_num: 'ODP2', qty: 5 }] },
  ];

  it('legge le quote della chiusura, e le tiene separate per articolo', () => {
    expect(consumoPerOrdine(CHIUSO, 'ODP1')).toEqual([
      { odp_num: 'ODP1', item_key: 'A#LA', article_code: 'A', lot_code: 'LA', qty: 20, uom: 'KG' },
      { odp_num: 'ODP2', item_key: 'A#LA', article_code: 'A', lot_code: 'LA', qty: 5, uom: 'KG' },
    ]);
  });

  it('NON legge le entrate: quelle dicono il chiesto, non il consumato', () => {
    expect(consumoPerOrdine([CHIUSO[0]], 'ODP1')).toEqual([]);
  });

  it('prima della chiusura non c’è consumo da ripartire, e nemmeno una quota', () => {
    expect(consumoPerOrdine([], 'ODP1')).toEqual([]);
    expect(consumoPerOrdine(CHIUSO, 'ODP2')).toEqual([]);
  });

  it('due dichiarazioni sullo stesso articolo si sommano per ordine', () => {
    const due = [...CHIUSO, { ...CHIUSO[1], giro_richieste: [{ odp_num: 'ODP2', qty: 3 }] }];
    const q = consumoPerOrdine(due, 'ODP1');
    expect(q.find((x) => x.odp_num === 'ODP2').qty).toBe(8);
    expect(q.find((x) => x.odp_num === 'ODP1').qty).toBe(20);
  });
});
