/* PIÙ BANCALI DELLA STESSA MERCE IN UN VANO — 2.37
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   LE PROVE CERCANO DI FAR SBAGLIARE LE TRE REGOLE, e i casi che contano
   nascono tutti dallo scaffale vero descritto da Andrea: **una campata che
   porta tre bancali**, e magari anche qualche collo sciolto a terra accanto.

   · **Il saldo che conta una riga sola.** È il difetto che il vecchio
     rifiuto nascondeva invece di risolvere: tre pallet dello stesso lotto e
     `find` ne legge uno. Il saldo diceva un terzo del vero.

   · **La merce sciolta che sale su un pallet da sola.** Posizionare colli in
     un vano dove quel lotto sta già su un bancale li sommava alla riga del
     bancale: nessuno l'ha caricato, e il pallet cresce.

   · **Il prelievo che apre un imballo invece di prendere lo sciolto.** Se
     nel vano c'è merce a terra e merce su un pallet, prendere dal pallet
     vuol dire aprirlo per niente.

   · **`udc_id` assente, vuoto o nullo sono la stessa cosa**: merce sciolta.
     Tre modi di scrivere il nulla che devono contarsi insieme, o il saldo si
     spezza a seconda di come è stata scritta la riga. */

import { describe, it, expect } from 'vitest';
import {
  righeDiMerce, colliDiMerce, rigaDoveSommare, rigaDaCuiTogliere,
  unitaDelVano, stessaRiga,
} from '../src/modules/righeVano';

/** La campata vera: tre bancali dello stesso lotto, e dei colli a terra. */
const K = '6001418#261571';
const VANO = [
  { item_key: K, qty: 40, udc_id: 'UDC-000001' },
  { item_key: K, qty: 40, udc_id: 'UDC-000002' },
  { item_key: K, qty: 25, udc_id: 'UDC-000003' },
  { item_key: K, qty: 7 },                          // sciolti a terra
  { item_key: '6000149#261177', qty: 60, udc_id: 'UDC-000004' },
];

describe('quanta merce c’è davvero nel vano', () => {
  it('IL DIFETTO: la somma di tutte le righe, non la prima', () => {
    /* Con `find` sarebbero 40. Sono 112. */
    expect(colliDiMerce(VANO, K)).toBe(112);
  });

  it('e la merce di un altro lotto non ci entra', () => {
    expect(colliDiMerce(VANO, '6000149#261177')).toBe(60);
  });

  it('una merce che non c’è vale zero, non esplode', () => {
    expect(colliDiMerce(VANO, 'PIPPO#1')).toBe(0);
    expect(colliDiMerce(null, K)).toBe(0);
    expect(colliDiMerce(VANO, '')).toBe(0);
  });

  it('le righe si contano tutte, anche a colli mancanti', () => {
    /* Una riga senza `qty` non è una riga da zero colli per errore: vale
       zero e non rompe la somma delle altre. */
    expect(colliDiMerce([{ item_key: K }, { item_key: K, qty: 5 }], K)).toBe(5);
    expect(righeDiMerce(VANO, K)).toHaveLength(4);
  });
});

describe('dove si aggiunge', () => {
  it('merce sciolta si somma alla merce sciolta', () => {
    const r = rigaDoveSommare(VANO, K, null);
    expect(r?.qty).toBe(7);
    expect(r?.udc_id).toBeUndefined();
  });

  it('IL DIFETTO: NON sale su un bancale da sola', () => {
    /* In un vano dove quel lotto sta solo su pallet, la merce sciolta non
       trova dove sommarsi e va in una riga nuova. Sommarla al pallet
       vorrebbe dire caricarcela sopra senza che nessuno l’abbia fatto. */
    const soloPallet = VANO.filter((r) => r.udc_id);
    expect(rigaDoveSommare(soloPallet, K, null)).toBe(null);
  });

  it('e la merce di un’unità va sulla riga di QUELLA unità', () => {
    expect(rigaDoveSommare(VANO, K, 'UDC-000002')?.qty).toBe(40);
    expect(rigaDoveSommare(VANO, K, 'UDC-000003')?.qty).toBe(25);
  });

  it('un’unità che nel vano non c’è ancora non trova niente', () => {
    expect(rigaDoveSommare(VANO, K, 'UDC-999')).toBe(null);
  });

  it('assente, vuoto e nullo sono la stessa cosa: sciolto', () => {
    const righe = [{ item_key: K, qty: 3, udc_id: null }];
    expect(rigaDoveSommare(righe, K, null)?.qty).toBe(3);
    expect(rigaDoveSommare(righe, K, '')?.qty).toBe(3);
    expect(rigaDoveSommare(righe, K, undefined)?.qty).toBe(3);
  });
});

describe('da dove si toglie', () => {
  it('IL DIFETTO: prima lo sciolto, poi i bancali', () => {
    /* Aprire un imballo mentre a terra c’è merce già aperta è lavoro in
       più e un pallet rotto per niente. */
    const r = rigaDaCuiTogliere(VANO, K);
    expect(r?.qty).toBe(7);
    expect(r?.udc_id).toBeUndefined();
  });

  it('e se sciolto non ce n’è, si prende un bancale', () => {
    const soloPallet = VANO.filter((r) => r.udc_id);
    expect(rigaDaCuiTogliere(soloPallet, K)?.udc_id).toBe('UDC-000001');
  });

  it('chi vuole un bancale preciso lo nomina', () => {
    expect(rigaDaCuiTogliere(VANO, K, 'UDC-000003')?.qty).toBe(25);
  });

  it('e nominando il nulla si chiede proprio lo sciolto', () => {
    expect(rigaDaCuiTogliere(VANO, K, null)?.qty).toBe(7);
    /* Nominare un’unità che non porta quella merce non ripiega su un’altra:
       chi ha chiesto QUEL pallet non vuole il primo che capita. */
    expect(rigaDaCuiTogliere(VANO, K, 'UDC-999')).toBe(null);
  });

  it('da un vano senza quella merce non si toglie niente', () => {
    expect(rigaDaCuiTogliere(VANO, 'PIPPO#1')).toBe(null);
    expect(rigaDaCuiTogliere([], K)).toBe(null);
  });
});

describe('quante unità porta il vano', () => {
  it('le nomina una volta sola, nell’ordine in cui compaiono', () => {
    expect(unitaDelVano(VANO)).toEqual(['UDC-000001', 'UDC-000002', 'UDC-000003', 'UDC-000004']);
  });

  it('la merce sciolta non è un’unità', () => {
    expect(unitaDelVano([{ item_key: K, qty: 7 }])).toEqual([]);
    expect(unitaDelVano(null)).toEqual([]);
  });

  it('e la stessa unità su due righe si conta una volta', () => {
    /* Un bancale che porta due lotti scrive due righe: è UN bancale. */
    expect(unitaDelVano([
      { item_key: 'A#1', qty: 1, udc_id: 'UDC-1' },
      { item_key: 'B#2', qty: 1, udc_id: 'UDC-1' },
    ])).toEqual(['UDC-1']);
  });
});

describe('quale doppione non deve nascere', () => {
  it('stessa merce sulla stessa unità è la stessa riga', () => {
    expect(stessaRiga({ item_key: K, udc_id: 'U1' }, { item_key: K, udc_id: 'U1' })).toBe(true);
    expect(stessaRiga({ item_key: K }, { item_key: K, udc_id: null })).toBe(true);
  });

  it('ma su due bancali diversi sono due righe legittime', () => {
    /* È il cuore della 2.37: questo NON è un doppione, è uno scaffale. */
    expect(stessaRiga({ item_key: K, udc_id: 'U1' }, { item_key: K, udc_id: 'U2' })).toBe(false);
  });

  it('e sciolto contro pallet nemmeno', () => {
    expect(stessaRiga({ item_key: K }, { item_key: K, udc_id: 'U1' })).toBe(false);
  });
});
