/* LA RIGA DI UN DOCUMENTO, E I CAMPI CHE SPARIVANO.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `savePendingOutbound` e `updatePendingDoc` ricostruivano la riga campo per
   campo, in due copie identiche: chi ne aggiungeva uno lo scriveva a schermo
   e lo perdeva al salvataggio, senza un errore. E' successo con i colli
   scelti nel carrello — il DDT li chiedeva di nuovo all'evasione, perche' al
   documento non erano mai arrivati. Adesso la ricostruzione e' una sola, e
   questa e' la prova che la sorveglia. */

import { describe, it, expect } from 'vitest';
import { rigaDocumento } from '../src/modules/documenti';

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
