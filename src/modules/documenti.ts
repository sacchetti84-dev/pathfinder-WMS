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
import { sommaUom } from './misure';

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
/* ═══ 2.24 · LA DISTINTA ANNIDATA ══════════════════════════════════════

   IL DDT DICE COSA C'E' SUL CAMION, LA PACKING LIST DICE COM'E' FATTO.
   Fino alla 2.23 la packing list si leggeva per BANCALE — un blocco per
   pallet, e sotto le righe che porta. Rispondeva alla domanda di chi
   scarica («questo pallet cosa tiene»), e non a quella di chi controlla la
   merce («questo articolo, in questo lotto, su quanti bancali e' arrivato e
   quanto fa in tutto»). La seconda e' la domanda che si fa in banchina col
   DDT accanto, ed e' quella che si voleva sul foglio.

   TRE LIVELLI, E OGNUNO PORTA IL SUO TOTALE: articolo, dentro il lotto,
   dentro i bancali. Un livello che non sommasse sarebbe un elenco
   indentato, non una distinta: chi legge il lotto vuole il numero del
   lotto, non la somma fatta a mano delle righe sotto.

   LE STESSE DUE REGOLE DI `raggruppaPerPartita`, e non per simmetria: sono
   le regole del dato. Unita' diverse non si sommano e lasciano il totale
   VUOTO — `null`, non zero, perche' zero e' una quantita' e su un documento
   di trasporto dice una cosa falsa. Una scadenza discorde dentro lo stesso
   lotto sparisce: un lotto ha una scadenza sola, e se le righe ne portano
   due nessuna delle due e' «la» scadenza.

   L'ORDINE E' QUELLO DEI CODICI, e il bancale mancante sta in coda: la
   merce presa dal vano non ha un pallet da cercare, e messa in mezzo
   spezzerebbe l'elenco che qualcuno sta scorrendo col dito. */

export interface DistintaBancale {
  /** Vuoto = merce presa dal vano, senza contenitore. */
  udc_id: string;
  colli: number;
  /** Le uscite della riga: com'e' fatto il collo. `null` sui documenti
      scritti prima della 1.8.4, che le uscite non le portano. */
  uscite: number[] | null;
  qty_uom: number | null;
  uom: string | null;
}

export interface DistintaLotto {
  lot_code: string;
  expiry_date: string;
  bancali: DistintaBancale[];
  colli: number;
  qty_uom: number | null;
  uom: string | null;
}

export interface DistintaArticolo {
  article_code: string;
  article_description: string;
  lotti: DistintaLotto[];
  colli: number;
  qty_uom: number | null;
  uom: string | null;
}

/** Somma una quantita' in un totale che sa gia' dire di no. Restituisce il
    nuovo totale, o `null` appena le unita' non coincidono — e una volta
    detto `null` non torna piu' indietro. */
function sommaSeStessaUnita(
  totale: number | null, unitaTotale: string | null,
  q: number | null | undefined, u: string | null | undefined,
): number | null {
  if (totale === null) return null;
  if (typeof q !== 'number' || !u || u !== unitaTotale) return null;
  /* Si somma con l'arrotondamento dell'unita', non con un `+` nudo: e' lo
     stesso conto di `_ddtTotaliUom`, e due totali che si scostano di un
     millesimo sullo stesso foglio sono una contestazione in banchina. */
  return sommaUom(totale, q, unitaTotale);
}

export function distintaPerArticolo(
  lines: readonly Partial<RigaDocumento>[] | null | undefined,
): DistintaArticolo[] {
  const articoli = new Map<string, DistintaArticolo>();
  const lotti = new Map<string, DistintaLotto>();

  for (const l of lines || []) {
    const codice = String(l.article_code ?? '');
    const lotto = String(l.lot_code ?? '');
    const udc = String((l as { udc_id?: unknown }).udc_id ?? '').trim();
    const uom = l.uom ?? null;
    const qtyUom = typeof l.qty_uom === 'number' ? l.qty_uom : null;
    const colli = Number(l.qty) || 0;
    const uscite = Array.isArray(l.packs_out) && l.packs_out.length
      ? l.packs_out.map((p) => p.quantita) : null;

    let art = articoli.get(codice);
    if (!art) {
      art = {
        article_code: codice,
        article_description: String(l.article_description ?? ''),
        lotti: [], colli: 0, qty_uom: qtyUom, uom,
      };
      articoli.set(codice, art);
    } else {
      art.qty_uom = sommaSeStessaUnita(art.qty_uom, art.uom, qtyUom, uom);
      if (!art.article_description && l.article_description) {
        art.article_description = String(l.article_description);
      }
    }
    art.colli += colli;

    const chiaveLotto = `${codice}#${lotto}`;
    let lot = lotti.get(chiaveLotto);
    if (!lot) {
      lot = {
        lot_code: lotto,
        expiry_date: String(l.expiry_date ?? ''),
        bancali: [], colli: 0, qty_uom: qtyUom, uom,
      };
      lotti.set(chiaveLotto, lot);
      art.lotti.push(lot);
    } else {
      lot.qty_uom = sommaSeStessaUnita(lot.qty_uom, lot.uom, qtyUom, uom);
      if (String(l.expiry_date ?? '') !== lot.expiry_date) lot.expiry_date = '';
    }
    lot.colli += colli;

    /* DUE RIGHE SULLO STESSO BANCALE SONO DUE RIGHE. Uno stesso pallet puo'
       portare lo stesso articolo#lotto in due righe di documento — due
       posizionamenti distinti — e sommarle qui perderebbe la ragione per cui
       `udc_id` sta su una riga: sapere da quale pallet e' uscita quella
       merce. Si accodano, e il foglio le mostra tutte e due. */
    lot.bancali.push({ udc_id: udc, colli, uscite, qty_uom: qtyUom, uom });
  }

  const perCodice = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);
  const out = [...articoli.values()].sort((a, b) => perCodice(a.article_code, b.article_code));
  for (const a of out) {
    a.lotti.sort((x, y) => perCodice(x.lot_code, y.lot_code));
    /* Il bancale mancante in coda: la merce presa dal vano non ha un codice
       da cercare, e in mezzo spezzerebbe l'elenco che si scorre col dito. */
    for (const l of a.lotti) {
      l.bancali.sort((x, y) => (!x.udc_id ? 1 : !y.udc_id ? -1 : perCodice(x.udc_id, y.udc_id)));
    }
  }
  return out;
}
