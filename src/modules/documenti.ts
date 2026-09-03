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
    /* 2.20 — DA QUALE BANCALE ESCE QUESTA RIGA. Assente sulle righe scritte
       prima, e si legge come prima: merce presa dal vano, senza contenitore.
       Dove c'e', la packing list sa raggruppare le righe per bancale e
       l'evasione sa quale unita' di carico e' partita. */
    udc_id: l.udc_id,
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

/* ═══ 2.21 · LA RIGA CHE SI STAMPA, E QUELLA CHE SI SALVA ═══════════════

   SUL DDT UNA RIGA E' UN ARTICOLO E UN LOTTO. Chi riceve la merce controlla
   «quanto di questo lotto e' arrivato», e un documento che scrive tre volte
   lo stesso articolo#lotto — una per bancale — lo obbliga a sommare a mano
   in banchina. Tre pallet dello stesso lotto sono una riga di documento e
   tre righe di packing list, che e' esattamente la divisione dei compiti
   fra i due fogli.

   SI RAGGRUPPA SOLO IN STAMPA. Le righe SALVATE restano una per bancale,
   perche' ci vivono sopra la packing list, l'evasione — che scarica dal
   vano dove la merce sta, e due bancali stanno in due vani — e la domanda
   «da quale pallet e' uscita questa merce», che e' la ragione per cui
   `udc_id` e' su una riga di documento. Raggruppare a database vorrebbe
   dire perdere tutto questo per risparmiare una riga di stampa.

   LE UNITA' DIVERSE NON SI SOMMANO, qui come dappertutto: due righe che
   portano unita' diverse lasciano il totale VUOTO — `null`, non zero. Una
   scadenza che non coincide sparisce per la stessa ragione: un lotto solo
   ha una scadenza sola, e se le righe ne portano due nessuna delle due e'
   «la» scadenza della riga stampata. */
export interface PartitaStampata {
  article_code: string;
  article_description: string;
  lot_code: string;
  expiry_date: string;
  qty: number;
  qty_uom: number | null;
  uom: string | null;
  notes: string;
  /** Da quali bancali esce questa riga. Vuoto = merce presa dal vano. */
  bancali: string[];
  /** Quante righe di documento sono confluite qui. */
  righe: number;
}

export function raggruppaPerPartita(
  lines: readonly Partial<RigaDocumento>[] | null | undefined,
): PartitaStampata[] {
  const out = new Map<string, PartitaStampata>();
  for (const l of lines || []) {
    const chiave = `${l.article_code ?? ''}#${l.lot_code ?? ''}`;
    const udc = String((l as { udc_id?: unknown }).udc_id ?? '').trim();
    const nota = String(l.notes ?? '').trim();
    const gia = out.get(chiave);
    if (!gia) {
      out.set(chiave, {
        article_code: String(l.article_code ?? ''),
        article_description: String(l.article_description ?? ''),
        lot_code: String(l.lot_code ?? ''),
        expiry_date: String(l.expiry_date ?? ''),
        qty: Number(l.qty) || 0,
        qty_uom: typeof l.qty_uom === 'number' ? l.qty_uom : null,
        uom: l.uom ?? null,
        notes: nota,
        bancali: udc ? [udc] : [],
        righe: 1,
      });
      continue;
    }
    gia.qty += Number(l.qty) || 0;
    gia.righe += 1;
    if (udc && !gia.bancali.includes(udc)) gia.bancali.push(udc);
    if (nota && !gia.notes.includes(nota)) gia.notes = gia.notes ? `${gia.notes} · ${nota}` : nota;
    if (!gia.article_description && l.article_description) gia.article_description = String(l.article_description);
    /* Una scadenza diversa sullo stesso lotto non e' una media: e' un dato
       che questa riga non ha. */
    if (String(l.expiry_date ?? '') !== gia.expiry_date) gia.expiry_date = '';
    if (gia.qty_uom === null) continue;                     // gia' dichiarato non sommabile
    if (typeof l.qty_uom !== 'number' || !l.uom || l.uom !== gia.uom) { gia.qty_uom = null; continue; }
    gia.qty_uom += l.qty_uom;
  }
  return [...out.values()];
}