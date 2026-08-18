/* LA RIGA DI UN DOCUMENTO DI USCITA — 1.8.4.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Una riga di DDT non e' un sacco: si ricostruisce campo per campo, e cio'
   che non e' nominato qui non arriva al documento. E' la stessa regola di
   `_loadCache` per `meta` e di `ARTICLE_ATTR_FIELDS` per l'anagrafica, ed e'
   voluta — un documento porta quello che qualcuno ha deciso che porti.

   Quello che NON e' voluto e' averne due copie. `savePendingOutbound` e
   `updatePendingDoc` la ricostruivano ognuna per conto suo, identiche: i
   colli scelti nel carrello sono stati scritti a schermo, salvati in nessuna
   delle due, e il DDT li ha chiesti di nuovo all'evasione. Nessun errore,
   nessun tipo che si lamenta — `RigaDocumento` ha un indice libero.

   Chi aggiunge un campo a una riga lo aggiunge QUI, e la prova in
   `test/documenti.test.js` glielo ricorda. */

import type { RigaDocumento } from '../types/entita';

export function rigaDocumento(l: Partial<RigaDocumento>): RigaDocumento {
  const uscite = Array.isArray(l.packs_out) && l.packs_out.length ? l.packs_out : null;
  return {
    article_code: l.article_code as string,
    article_description: l.article_description || '',
    lot_code: l.lot_code,
    location_code: l.location_code,
    item_key: l.item_key,
    expiry_date: l.expiry_date || '',
    qty: l.qty as number,
    qty_at_creation: (l.qty_at_creation as number) || l.qty,
    notes: l.notes || '',
    /* 1.8.4 — QUALI COLLI, QUANTE UM, IN CHE UNITA'. Senza questi tre il
       documento non sa nominare la merce che ha prenotato, e l'evasione
       ricomincia da capo la scelta che qualcuno ha gia' fatto. */
    packs_out: uscite,
    qty_uom: typeof l.qty_uom === 'number' ? l.qty_uom : null,
    uom: l.uom || null,
  };
}
