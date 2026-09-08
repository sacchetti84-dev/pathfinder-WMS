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

import type { Udc, Giacenza, DocumentoUscita, Sito, Zona, Istante } from '../types/entita';

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
  /** 2.21 — CON QUALE DDT È PARTITO, E QUANDO. Non sono campi del bancale:
      si rileggono dai documenti evasi, come §8 impone per tutto ciò che un
      documento sa già. Scriverli sull'unità vorrebbe dire due verità sullo
      stesso viaggio, e quella sbagliata sarebbe la copia. */
  ddt_num: string | null;
  shipped_at: Istante | null;
}

/** Il viaggio di un bancale: quale documento l'ha portato via, e quando. */
export interface Spedizione {
  doc_id: string;
  ddt_num: string;
  data: Istante | null;
  /** Che cosa portava, secondo il documento che l'ha portato via. È l'unica
      memoria che resta: all'evasione le righe di giacenza spariscono, e un
      bancale spedito senza questa lettura si direbbe «vuoto» — che è vero e
      inutile a chi cerca dov'è finita la merce. */
  righe: readonly Lettura[];
}

/** Una riga letta, da qualunque parte venga: la giacenza che sta sopra il
    bancale adesso, o la riga del documento che l'ha portato via. I due
    record hanno campi diversi — uno la quantità in UM come `null`, l'altro
    come assente — e il riepilogo non deve conoscerli tutti e due. */
interface Lettura {
  item_key: string;
  article_code: string;
  article_description: string;
  lot_code: string;
  expiry_date: string;
  qty: number;
  qty_uom: number | null;
  uom: string | null;
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

/* CON QUALE DDT È PARTITO UN BANCALE — si rilegge, non si scrive.

   I documenti EVASI portano già la risposta: ogni riga dice da quale unità
   di carico esce, e la testata dice numero e data. Un campo `ddt_num`
   sull'unità sarebbe la stessa cosa scritta due volte, e un DDT corretto
   dopo l'evasione lascerebbe l'unità a raccontare il numero vecchio.

   UN BANCALE SU PIÙ DOCUMENTI VINCE L'ULTIMO: un pallet svuotato a metà su
   un DDT e finito su un altro è partito davvero col secondo, ed è quello
   che chi cerca la merce si aspetta di leggere. */
export function spedizioniDiBancale(
  documenti: readonly DocumentoUscita[] | null | undefined,
): Map<string, Spedizione> {
  const out = new Map<string, Spedizione>();
  for (const d of documenti || []) {
    if (d?.status !== 'evaded') continue;
    const data = (d.evaded_at ?? null) as Istante | null;
    for (const l of d.lines || []) {
      const id = String((l as { udc_id?: unknown })?.udc_id ?? '').trim();
      if (!id) continue;
      const gia = out.get(id);
      /* Il più recente vince, e una data assente perde da una che c'è: un
         documento senza istante non può scalzare uno che sa quando. */
      if (gia && (gia.data ?? -Infinity) >= (data ?? -Infinity)) continue;
      /* Le righe di QUEL documento per QUEL bancale: si raccolgono adesso,
         perché dopo non c'è più da dove. */
      const sue: Lettura[] = (d.lines || [])
        .filter((x) => String((x as { udc_id?: unknown })?.udc_id ?? '').trim() === id)
        .map((x) => ({
          item_key: String(x.item_key ?? ''),
          article_code: String(x.article_code ?? ''),
          article_description: String(x.article_description ?? ''),
          lot_code: String(x.lot_code ?? ''),
          expiry_date: String(x.expiry_date ?? ''),
          qty: Number(x.qty) || 0,
          qty_uom: typeof x.qty_uom === 'number' ? x.qty_uom : null,
          uom: x.uom ?? null,
        }));
      out.set(id, { doc_id: d.doc_id, ddt_num: String(d.ddt_num ?? ''), data, righe: sue });
    }
  }
  return out;
}

/** Il riepilogo di un bancale: chi c'è sopra, quanto, e se può partire.

    `righe` sono le giacenze che portano il suo `udc_id`; `impegnati` è
    l'insieme che esce da `bancaliImpegnati`. */
export function riepiloga(
  u: Udc,
  righe: readonly Giacenza[] | null | undefined,
  impegnati?: ReadonlySet<string> | null,
  uomDiRiga?: (r: Giacenza) => string | null,
  spedizioni?: ReadonlyMap<string, Spedizione> | null,
): RiepilogoBancale {
  const viaggio = spedizioni?.get(u.udc_id) ?? null;
  const vive: Lettura[] = (righe || [])
    .filter(r => Number(r?.qty) > 0)
    .map(r => ({
      item_key: String(r.item_key ?? ''),
      article_code: String(r.article_code ?? ''),
      article_description: String(r.article_description ?? ''),
      lot_code: String(r.lot_code ?? ''),
      expiry_date: String(r.expiry_date ?? ''),
      qty: Number(r.qty) || 0,
      qty_uom: Number.isFinite(Number(r.qty_uom)) ? Number(r.qty_uom) : null,
      uom: uomDiRiga ? uomDiRiga(r) : ((r as { uom?: string }).uom ?? null),
    }));
  /* UN BANCALE SPEDITO NON HA PIÙ RIGHE, e non per questo è vuoto: quel che
     portava lo dice il documento che l'ha portato via, e quella è l'unica
     memoria che ne resta. Si legge di lì solo quando in giacenza non c'è più
     niente — finché la merce c'è comanda la merce. */
  const dentro: readonly Lettura[] = vive.length ? vive : (viaggio?.righe ?? []);
  const chiavi = new Set(dentro.map(r => r.item_key));
  const mono = chiavi.size === 1;
  const prima = dentro[0];

  let colli = 0;
  let uom_qty: number | null = 0;
  let uom: string | null = null;
  for (const r of dentro) {
    colli += r.qty;
    const u_r = r.uom;
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
  else if (!vive.length) stato = 'vuoto';
  else if (impegnati?.has(u.udc_id)) stato = 'impegnato';
  else stato = 'pronto';

  return {
    udc_id: u.udc_id,
    stato,
    mono,
    partite: chiavi.size,
    article_code: mono ? (prima?.article_code || null) : null,
    article_description: mono ? (prima?.article_description || null) : null,
    lot_code: mono ? (prima?.lot_code || null) : null,
    expiry_date: mono ? (prima?.expiry_date || null) : null,
    colli,
    uom_qty,
    uom,
    location_code: String(u.location_code ?? ''),
    odp_num: String(u.odp_num ?? '') || null,
    model_code: String(u.model_code ?? '') || null,
    ddt_num: viaggio?.ddt_num || null,
    shipped_at: viaggio?.data ?? null,
  };
}

/** Come si nomina un bancale in una riga di elenco: l'articolo se è uno,
    altrimenti quante partite porta. **Non si scrive «lotti multipli» e
    basta**: il numero dice se sono due o nove, e cambia cosa si va a
    controllare.

    2.21 — la dicitura è «LOTTI MULTIPLI» e non «MISTO»: dice quale cosa è
    multipla. Sta QUI e non in tre viste, perché l'elenco, l'etichetta su
    foglio e quella sulla Zebra devono scrivere la stessa parola sullo
    stesso pallet. */
export function descriviContenuto(r: RiepilogoBancale | null | undefined): string {
  if (!r || !r.partite) return 'vuoto';
  if (r.mono) return `${r.article_code}#${r.lot_code}`;
  return `LOTTI MULTIPLI — ${r.partite} partite`;
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
  return zoneMarcate(siti, 'pf_zone');
}

/** 2.21 — LE BAIE DI CARICO: dove i bancali aspettano il camion. Stesso
    criterio delle zone di prodotto finito, e per la stessa ragione — non è
    una regola di stoccaggio, è un posto — quindi la lettura è una sola. */
export function zoneCarico(
  siti: readonly Sito[] | null | undefined,
): { sito: Sito; zona: Zona }[] {
  return zoneMarcate(siti, 'dock_zone');
}

/** 2.30 — LE ZONE DI IMBALLAGGIO: dove la merce prelevata diventa un'unità
    di carico. Stesso criterio delle altre due, e per la stessa ragione: è un
    posto, non una regola. Quello che cambia è che di questa **ne serve una
    per sito** — vedi `sitiSenzaImballo`. */
export function zoneImballo(
  siti: readonly Sito[] | null | undefined,
): { sito: Sito; zona: Zona }[] {
  return zoneMarcate(siti, 'pack_zone');
}

/** I siti attivi che una zona di imballaggio non ce l'hanno. Elenco vuoto =
    configurazione completa.

    PERCHÉ UN ELENCO E NON UN BOOLEANO. Chi legge deve poter dire QUALE sito
    è scoperto: «manca la zona di imballaggio» davanti a quattro siti manda a
    cercare in tre posti giusti e uno sbagliato.

    I SITI DISATTIVATI NON CONTANO. Un sito spento non riceve prelievi, e
    pretendere una zona da lui vorrebbe dire chiedere di configurare un posto
    dove non si lavora — che è il modo in cui un vincolo diventa un fastidio
    da aggirare. */
export function sitiSenzaImballo(
  siti: readonly Sito[] | null | undefined,
): Sito[] {
  const conImballo = new Set(zoneImballo(siti).map((x) => String(x.sito.id).toUpperCase()));
  return (siti || []).filter((s) => s?.active !== false
    && !conImballo.has(String(s?.id).toUpperCase()));
}

/** La zona di imballaggio di UN sito. Più d'una è una configurazione da
    correggere, non un errore da bloccare: si prende la prima, e chi guarda
    l'elenco in Configurazione le vede tutte. */
export function zonaImballoDi(
  siti: readonly Sito[] | null | undefined,
  siteId: string,
): { sito: Sito; zona: Zona } | null {
  const k = String(siteId || '').trim().toUpperCase();
  if (!k) return null;
  return zoneImballo(siti).find((x) => String(x.sito.id).toUpperCase() === k) || null;
}

function zoneMarcate(
  siti: readonly Sito[] | null | undefined,
  bandiera: 'pf_zone' | 'dock_zone' | 'pack_zone',
): { sito: Sito; zona: Zona }[] {
  const out: { sito: Sito; zona: Zona }[] = [];
  for (const s of siti || []) {
    for (const z of s.zones || []) {
      if (z?.[bandiera] && z.active !== false) out.push({ sito: s, zona: z });
    }
  }
  return out;
}
