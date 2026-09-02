/* COME SI LEGGE UN BANCALE DI PRODOTTO FINITO — 2.20.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Un bancale di PF è un'unità di carico: `kind: 'pf'` e nient'altro lo
   distingue. Quello che serve è leggerlo — chi c'è sopra, quanto, e se può
   partire — e quella lettura la fanno in quattro posti diversi: l'elenco di
   chi spedisce, il colore sulla mappa, l'etichetta e la packing list.
   QUATTRO COPIE DELLA STESSA DOMANDA SONO QUATTRO RISPOSTE che prima o poi
   divergono, quindi la domanda si fa qui, una volta.

   MONO E MISTO NON SONO UN GIUDIZIO. Di norma un bancale porta un articolo
   e un lotto, ed è quello che l'etichetta può scrivere per intero. Ma un
   bancale misto passa: chi imballa non si ferma perché il sistema
   preferirebbe di no. Su un misto i campi della merce restano VUOTI —
   un'assenza, non un dato inventato — e il dettaglio lo dice la packing
   list, che le righe le elenca tutte.

   LE UNITÀ DIVERSE NON SI SOMMANO. 300 KG più 40 PZ fanno 340 di niente:
   `uom_qty` resta `null` e la cella vuota, come §8 impone dappertutto.

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato in
   `test/bancale.test.js`. */

import type { Udc, Giacenza, DocumentoUscita, Sito, Zona } from '../types/entita';

/** Dove sta un bancale nel suo giro: pronto a partire, già prenotato da un
    documento, partito, o vuoto — che per un'unità di carico vuol dire
    finita. `spedito` e `vuoto` sono due fatti diversi e si vedono diversi. */
export type StatoBancale = 'pronto' | 'impegnato' | 'spedito' | 'vuoto';

export interface RiepilogoBancale {
  udc_id: string;
  stato: StatoBancale;
  /** Vero quando tutte le righe sono lo stesso articolo e lo stesso lotto. */
  mono: boolean;
  /** Quante partite (articolo#lotto) porta: 1 su un mono, 0 su un vuoto. */
  partite: number;
  article_code: string | null;
  article_description: string | null;
  lot_code: string | null;
  expiry_date: string | null;
  colli: number;
  /** Le UM totali, o `null` quando le unità sono diverse o non ci sono. */
  uom_qty: number | null;
  uom: string | null;
  location_code: string;
  odp_num: string | null;
  model_code: string | null;
}

/** Vero se questa unità di carico è un bancale di prodotto finito. Un'UDC
    senza `kind` è quella della 1.12 e non entra in nessuna di queste
    schermate. */
export function ePf(u: Udc | null | undefined): boolean {
  return String(u?.kind ?? '') === 'pf';
}

/** Le righe che un documento ha prenotato, per chiave di unità di carico.
    Si guardano i soli documenti PENDENTI: un DDT evaso ha già mosso la
    merce, e uno annullato non ha prenotato niente. */
export function bancaliImpegnati(pendenti: readonly DocumentoUscita[] | null | undefined): Set<string> {
  const impegnati = new Set<string>();
  for (const d of pendenti || []) {
    if (d?.status !== 'pending') continue;
    for (const l of d.lines || []) {
      const id = String((l as { udc_id?: unknown })?.udc_id ?? '').trim();
      if (id) impegnati.add(id);
    }
  }
  return impegnati;
}

/** Il riepilogo di un bancale: chi c'è sopra, quanto, e se può partire.

    `righe` sono le giacenze che portano il suo `udc_id`; `impegnati` è
    l'insieme che esce da `bancaliImpegnati`. */
export function riepiloga(
  u: Udc,
  righe: readonly Giacenza[] | null | undefined,
  impegnati?: ReadonlySet<string> | null,
  uomDiRiga?: (r: Giacenza) => string | null,
): RiepilogoBancale {
  const dentro = (righe || []).filter(r => Number(r?.qty) > 0);
  const chiavi = new Set(dentro.map(r => String(r.item_key ?? '')));
  const mono = chiavi.size === 1;
  const prima = dentro[0];

  let colli = 0;
  let uom_qty: number | null = 0;
  let uom: string | null = null;
  for (const r of dentro) {
    colli += Number(r.qty) || 0;
    const u_r = uomDiRiga ? uomDiRiga(r) : (r as { uom?: string }).uom ?? null;
    const q = Number(r.qty_uom);
    if (uom_qty === null) continue;              // già dichiarato MISTA
    if (!u_r || !Number.isFinite(q)) { uom_qty = null; continue; }
    if (uom && uom !== u_r) { uom_qty = null; continue; }
    uom = u_r;
    uom_qty += q;
  }
  /* Nessuna riga con un'unità: il totale non è zero, non c'è. */
  if (!uom) uom_qty = null;

  let stato: StatoBancale;
  if (u.status === 'shipped') stato = 'spedito';
  else if (!dentro.length) stato = 'vuoto';
  else if (impegnati?.has(u.udc_id)) stato = 'impegnato';
  else stato = 'pronto';

  return {
    udc_id: u.udc_id,
    stato,
    mono,
    partite: chiavi.size,
    article_code: mono ? String(prima?.article_code ?? '') || null : null,
    article_description: mono ? String(prima?.article_description ?? '') || null : null,
    lot_code: mono ? String(prima?.lot_code ?? '') || null : null,
    expiry_date: mono ? String(prima?.expiry_date ?? '') || null : null,
    colli,
    uom_qty,
    uom,
    location_code: String(u.location_code ?? ''),
    odp_num: String(u.odp_num ?? '') || null,
    model_code: String(u.model_code ?? '') || null,
  };
}

/** Come si nomina un bancale in una riga di elenco: l'articolo se è uno,
    altrimenti quante partite porta. **Non si scrive «misto» e basta**: il
    numero dice se sono due o nove, e cambia cosa si va a controllare. */
export function descriviContenuto(r: RiepilogoBancale | null | undefined): string {
  if (!r || !r.partite) return 'vuoto';
  if (r.mono) return `${r.article_code}#${r.lot_code}`;
  return `MISTO — ${r.partite} partite`;
}

export const ETICHETTE_STATO: Record<StatoBancale, string> = {
  pronto: 'Pronto',
  impegnato: 'Impegnato su DDT',
  spedito: 'Spedito',
  vuoto: 'Vuoto',
};

/** Le zone dichiarate di prodotto finito, in tutti i siti — compresi quelli
    di un terzista, che è dove il PF finisce quando viaggia in conto lavoro.
    Restituisce le zone accoppiate al sito, perché una zona da sola non dice
    dove sta. */
export function zonePf(
  siti: readonly Sito[] | null | undefined,
): { sito: Sito; zona: Zona }[] {
  const out: { sito: Sito; zona: Zona }[] = [];
  for (const s of siti || []) {
    for (const z of s.zones || []) {
      if (z?.pf_zone && z.active !== false) out.push({ sito: s, zona: z });
    }
  }
  return out;
}
