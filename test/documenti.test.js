/* LA RIGA DI UN DOCUMENTO, E I CAMPI CHE SPARIVANO.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `savePendingOutbound` e `updatePendingDoc` ricostruivano la riga campo per
   campo, in due copie identiche: chi ne aggiungeva uno lo scriveva a schermo
   e lo perdeva al salvataggio, senza un errore. E' successo con i colli
   scelti nel carrello — il DDT li chiedeva di nuovo all'evasione, perche' al
   documento non erano mai arrivati. Adesso la ricostruzione e' una sola, e
   questa e' la prova che la sorveglia. */

import { describe, it, expect } from 'vitest';
import { rigaDocumento, raggruppaPerPartita } from '../src/modules/documenti';

describe('rigaDocumento', () => {
  const piena = {
    article_code: '7000924', article_description: 'LECITINA DI SOIA',
    lot_code: '123456', location_code: 'MAG-SPC-01', item_key: '7000924#123456',
    expiry_date: '2027-01-31', qty: 2, qty_at_creation: 9, notes: 'riga ordine 12',
    packs_out: [{ da: 25, quantita: 25 }, { da: 15, quantita: 7 }],
    qty_uom: 32, uom: 'KG',
  };

  it('I COLLI SCELTI ARRIVANO AL DOCUMENTO: e il difetto che questa prova sorveglia', () => {
    const r = rigaDocumento(piena);
    expect(r.packs_out).toEqual([{ da: 25, quantita: 25 }, { da: 15, quantita: 7 }]);
    expect(r.qty_uom).toBe(32);
    expect(r.uom).toBe('KG');
  });

  it('i campi di sempre restano quelli di sempre', () => {
    const r = rigaDocumento(piena);
    expect(r.article_code).toBe('7000924');
    expect(r.lot_code).toBe('123456');
    expect(r.location_code).toBe('MAG-SPC-01');
    expect(r.item_key).toBe('7000924#123456');
    expect(r.expiry_date).toBe('2027-01-31');
    expect(r.qty).toBe(2);
    expect(r.qty_at_creation).toBe(9);
    expect(r.notes).toBe('riga ordine 12');
  });

  it('una riga senza colli dichiarati non se ne inventa', () => {
    const r = rigaDocumento({ article_code: 'X', lot_code: 'L', qty: 3 });
    expect(r.packs_out).toBe(null);
    expect(r.qty_uom).toBe(null);
    expect(r.uom).toBe(null);
    expect(r.article_description).toBe('');
    expect(r.notes).toBe('');
  });

  it('senza `qty_at_creation` vale la quantita\u0027 della riga', () => {
    expect(rigaDocumento({ article_code: 'X', qty: 4 }).qty_at_creation).toBe(4);
  });

  it('un elenco di uscite vuoto e\u0027 un\u0027assenza, non un elenco', () => {
    expect(rigaDocumento({ article_code: 'X', qty: 1, packs_out: [] }).packs_out).toBe(null);
  });

  /* 2.20 — il bancale da cui esce la riga. Chi aggiunge un campo lo aggiunge
     QUI, e queste due prove sono la rete: la packing list lo legge per
     raggruppare, l'evasione per sapere quale unita' e' partita. */
  it('il bancale passa quando la riga ne porta uno', () => {
    expect(rigaDocumento({ article_code: 'X', qty: 1, udc_id: 'UDC-000042' }).udc_id)
      .toBe('UDC-000042');
  });

  it('una riga senza bancale resta quella di prima', () => {
    expect(rigaDocumento({ article_code: 'X', qty: 1 }).udc_id).toBeUndefined();
  });

  it('LA RIGA NON E\u0027 UN SACCO: cio\u0027 che non e\u0027 nominato non passa', () => {
    const r = rigaDocumento({ ...piena, _id: 99, roba: 'passata di qui' });
    expect(r._id).toBeUndefined();
    expect(r.roba).toBeUndefined();
  });
});

/* 2.21 — SUL DDT UNA RIGA E' UN ARTICOLO E UN LOTTO.
   Tre bancali dello stesso lotto sono tre righe SALVATE — l'evasione
   scarica da tre vani e la packing list li elenca uno per uno — ma una riga
   sola in bolla: chi riceve controlla quanto di quel lotto e' arrivato, e
   sommare a mano in banchina e' il modo di sbagliare. */
describe('raggruppaPerPartita', () => {
  const riga = (extra = {}) => ({
    article_code: 'PF001', article_description: 'Omega 3', lot_code: 'L1',
    location_code: 'MAG1-SPED-01-01', item_key: 'PF001#L1', expiry_date: '2027-06-30',
    qty: 40, qty_uom: 500, uom: 'KG', udc_id: 'UDC-000012', ...extra,
  });

  it('somma colli e quantita dello stesso articolo e lotto', () => {
    const p = raggruppaPerPartita([riga(), riga({ udc_id: 'UDC-000013', qty: 37, qty_uom: 462.5 })]);
    expect(p).toHaveLength(1);
    expect(p[0].qty).toBe(77);
    expect(p[0].qty_uom).toBe(962.5);
    expect(p[0].bancali).toEqual(['UDC-000012', 'UDC-000013']);
    expect(p[0].righe).toBe(2);
  });

  it('due lotti restano due righe, e l ordine e quello del documento', () => {
    const p = raggruppaPerPartita([riga(), riga({ lot_code: 'L2' }), riga({ qty: 1 })]);
    expect(p.map(x => x.lot_code)).toEqual(['L1', 'L2']);
    expect(p[0].qty).toBe(41);
  });

  /* LE UNITA' DIVERSE NON SI SOMMANO: 300 KG piu' 40 PZ fanno 340 di
     niente, e il totale resta VUOTO — un'assenza, non uno zero. */
  it('unita diverse lasciano il totale vuoto', () => {
    const p = raggruppaPerPartita([riga(), riga({ uom: 'PZ', qty_uom: 40 })]);
    expect(p[0].qty_uom).toBe(null);
    expect(p[0].qty).toBe(80);
  });

  it('una riga senza unita azzera il totale, non lo ignora', () => {
    const p = raggruppaPerPartita([riga(), riga({ uom: null, qty_uom: null })]);
    expect(p[0].qty_uom).toBe(null);
  });

  /* Un lotto solo ha una scadenza sola: se le righe ne portano due, nessuna
     delle due e' «la» scadenza della riga stampata. */
  it('due scadenze sullo stesso lotto non ne fanno una', () => {
    const p = raggruppaPerPartita([riga(), riga({ expiry_date: '2027-12-31' })]);
    expect(p[0].expiry_date).toBe('');
  });

  it('le note si uniscono senza ripetersi', () => {
    const p = raggruppaPerPartita([
      riga({ notes: 'ordine 12' }), riga({ notes: 'ordine 12' }), riga({ notes: 'fragile' }),
    ]);
    expect(p[0].notes).toBe('ordine 12 · fragile');
  });

  it('una riga senza bancale non inventa un bancale', () => {
    const p = raggruppaPerPartita([riga({ udc_id: undefined })]);
    expect(p[0].bancali).toEqual([]);
  });

  it('un documento senza righe non e un errore', () => {
    expect(raggruppaPerPartita(null)).toEqual([]);
    expect(raggruppaPerPartita([])).toEqual([]);
  });
});
