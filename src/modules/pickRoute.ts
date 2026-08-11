import { Store as StoreJS } from '../core/store.js';
import type { Coordinate, Geometria, Giacenza, Sito } from '../types/entita.js';
import type { RigaODP } from './odpParser';

// ═══════════════════════════════════════════════════════════════════
// © Andrea Sacchetti — Dietopack S.r.l.
// modulo PickRoute — v2.5.0
// Costruzione del percorso di prelievo a serpentina
//
// REGOLE FISSATE IN SEDE DI ANALISI, qui rese esecutive:
//  · i lotti dell'ODP si rispettano sempre; il FEFO non si applica, perché
//    l'assegnazione del lotto è già stata decisa a monte da Sage X3;
//  · un percorso per sito, siti nell'ordine configurato dall'operatore;
//  · dentro il sito: zone in ordine di configurazione, corsie crescenti,
//    campate a serpentina (crescenti sulle dispari, decrescenti sulle pari),
//    livelli dal basso verso l'alto;
//  · articolo+lotto in più ubicazioni: UNA tappa sulla più conveniente, le
//    altre elencate come alternative e accettate in scansione;
//  · quarantena e impegno su DDT: segnalati, mai percorsi;
//  · la quantità non è un criterio di esclusione — Warehouse Mapper traccia la
//    presenza dei colli, i kg stanno su Sage.
// ═══════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════════════════════
   IL PONTE VERSO STORE, FINCHÉ STORE È JAVASCRIPT

   `Store._cache` nasce da una manciata di array vuoti, e da un array vuoto
   il compilatore deduce `never[]`: `Store.getSites()` risulta un elenco di
   niente, e leggerne `.id` non compila. Non è un difetto di Store — è
   quello che si vede di un file che i tipi non li ha ancora.

   Invece di spargere un cast a ogni chiamata, il ponte sta qui: dichiara
   che cosa questo modulo usa di Store e con che forma. Sono sei metodi su
   novanta, ed è anche un elenco utile — dice esattamente quanto PickRoute
   dipende dal magazzino. Quando `store.js` diventerà `store.ts` queste
   quindici righe si cancellano e non resta niente da sistemare altrove.
   ═══════════════════════════════════════════════════════════════════ */
const Store = StoreJS as unknown as {
  getSites(): Sito[];
  getItemByKey(itemKey: string): Giacenza[];
  getLotsForArticle(articleCode: string): string[];
  isItemQuarantined(itemKey: string, locationCode?: string | null): boolean;
  getAvailableQty(locationCode: string, itemKey: string, excludeDocId?: string | null): number;
  buildLocationGeometry(): Geometria;
};

/** Perché una riga non è percorribile, o perché lo è ma con un avvertimento. */
export type MotivoFuoriPercorso =
  | 'not_mapped' | 'lot_absent_other_lots' | 'no_lot_in_odp' | 'all_blocked'
  | 'quarantine' | 'pending_outbound' | 'marked_missing';

/* Le tre uscite di build(), che sono tre cose diverse e non vanno confuse:
   una tappa si percorre, una riga fuori percorso no, una segnalazione è
   un'informazione su merce che esiste ma non si può prendere. */
export interface RigaFuoriPercorso {
  article_code: string;
  description: string;
  lot_code: string;
  kg_required: number;
  um: string;
  reason: MotivoFuoriPercorso;
  detail: string;
  other_lots?: string[];
  location_code?: string;
}

export interface Alternativa {
  location_code: string;
  item_key: string;
  qty_available: number;
}

export interface Tappa {
  /** Assegnato dopo l'ordinamento globale: è il numero che l'operatore legge. */
  seq: number;
  site_id: string;
  location_code: string;
  item_key: string;
  article_code: string;
  article_description: string;
  lot_code: string;
  expiry_iso: string;
  kg_required: number;
  um: string;
  alternatives: Alternativa[];
  qty_available: number;
  status: string;
  reason: string;
  forced_note: string;
  qty_picked: number;
  done_at: number | null;
}

export interface Percorso {
  stops: Tappa[];
  offroute: RigaFuoriPercorso[];
  notes: RigaFuoriPercorso[];
}

/** Al comparatore serve una sola cosa: dove sta la riga. */
type Ordinabile = { location_code: string };

const PickRoute = {

  SITE_ORDER_KEY: 'wm_pick_site_order',

  /* Ordine dei siti: preferenza dell'operatore, ripulita dai siti non più
     esistenti e completata con quelli nuovi in coda. */
  getSiteOrder(): string[] {
    const existing = Store.getSites().map(s => s.id);
    let saved: string[] = [];
    try {
      const raw = localStorage.getItem(this.SITE_ORDER_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (err) {
      console.warn('[WM] PickRoute: ordine siti non leggibile, si usa quello predefinito', err);
    }
    if (!Array.isArray(saved)) saved = [];
    const ordered = saved.filter(id => existing.includes(id));
    for (const id of existing) if (!ordered.includes(id)) ordered.push(id);
    return ordered;
  },

  setSiteOrder(order: string[]): void {
    try { localStorage.setItem(this.SITE_ORDER_KEY, JSON.stringify(order)); }
    catch (err) { console.warn('[WM] PickRoute: ordine siti non salvabile', err); }
  },

  /* ─── COMPARATORE A SERPENTINA ────────────────────────────────────
     Opera su coordinate reali fornite da Store.buildLocationGeometry(),
     non sul testo del codice ubicazione.                                 */
  _serpentineCompare(geo: Geometria, siteRank: Map<string, number>) {
    return (a: Ordinabile, b: Ordinabile): number => {
      const ga: Coordinate | undefined = geo.get(a.location_code);
      const gb: Coordinate | undefined = geo.get(b.location_code);
      // Ubicazione priva di geometria (zona rimossa dopo il posizionamento):
      // in coda, senza far fallire l'ordinamento.
      if (!ga && !gb) return a.location_code.localeCompare(b.location_code);
      if (!ga) return 1;
      if (!gb) return -1;

      const ra = siteRank.get(ga.site_id) ?? 999;
      const rb = siteRank.get(gb.site_id) ?? 999;
      if (ra !== rb) return ra - rb;
      if (ga.zone_idx !== gb.zone_idx) return ga.zone_idx - gb.zone_idx;
      if (ga.aisle !== gb.aisle) return ga.aisle - gb.aisle;
      // Serpentina: sulle corsie pari si torna indietro
      if (ga.bay !== gb.bay) {
        return (ga.aisle % 2 === 1) ? ga.bay - gb.bay : gb.bay - ga.bay;
      }
      if (ga.level_idx !== gb.level_idx) return ga.level_idx - gb.level_idx;
      return a.location_code.localeCompare(b.location_code);
    };
  },

  /* ─── COSTRUZIONE ─────────────────────────────────────────────────
     Ritorna { stops, offroute, notes }.
       stops    — tappe percorribili, già ordinate
       offroute — righe che finiscono in coda al percorso
       notes    — segnalazioni conoscitive (quarantena, DDT pendenti)
     ───────────────────────────────────────────────────────────────── */
  build(parsedLines: RigaODP[]): Percorso {
    const geo = Store.buildLocationGeometry();
    const siteOrder = this.getSiteOrder();
    const siteRank = new Map(siteOrder.map((id, i) => [id, i] as const));

    const stops: Tappa[] = [];
    const offroute: RigaFuoriPercorso[] = [];
    const notes: RigaFuoriPercorso[] = [];

    for (const line of parsedLines) {
      if (!line.lots.length) {
        offroute.push({
          article_code: line.article_code,
          description: line.description,
          lot_code: '—',
          kg_required: line.total_qty,
          um: line.um,
          reason: 'no_lot_in_odp',
          detail: 'L\u2019ordine non assegna alcun lotto a questa riga.'
        });
        continue;
      }

      for (const lot of line.lots) {
        const itemKey = `${String(line.article_code).toUpperCase().trim()}#${String(lot.lot_code).trim()}`;
        const found = Store.getItemByKey(itemKey);

        const base = {
          article_code: line.article_code,
          description: line.description,
          lot_code: lot.lot_code,
          kg_required: lot.qty,
          um: lot.um || line.um
        };

        if (!found.length) {
          /* Il lotto non c'è. L'articolo però potrebbe esserci con altri lotti:
             è informazione che costa nulla e dice all'operatore se cercare
             altrove o se è l'ODP a essere disallineato. */
          const otherLots = Store.getLotsForArticle(line.article_code);
          offroute.push({
            ...base,
            reason: otherLots.length ? 'lot_absent_other_lots' : 'not_mapped',
            detail: otherLots.length
              ? `Articolo presente a sistema con altri lotti: ${otherLots.join(', ')}.`
              : 'Articolo/lotto non mappato — stoccato fuori dalle aree gestite.',
            other_lots: otherLots
          });
          continue;
        }

        /* Quarantena e impegno su DDT: si escludono dalle ubicazioni
           percorribili, ma si dice all'operatore che la merce esiste. */
        const usable: Giacenza[] = [];
        for (const it of found) {
          if (Store.isItemQuarantined(it.item_key, it.location_code)) {
            notes.push({
              ...base,
              location_code: it.location_code,
              reason: 'quarantine',
              detail: 'In quarantena — non prelevabile.'
            });
            continue;
          }
          if (Store.getAvailableQty(it.location_code, it.item_key) <= 0) {
            notes.push({
              ...base,
              location_code: it.location_code,
              reason: 'pending_outbound',
              detail: 'Impegnata su DDT di reso/spedizione non ancora evaso — non prelevabile.'
            });
            continue;
          }
          usable.push(it);
        }

        if (!usable.length) {
          offroute.push({
            ...base,
            reason: 'all_blocked',
            detail: 'Tutte le ubicazioni sono in quarantena o impegnate su DDT pendenti.'
          });
          continue;
        }

        const cmp = this._serpentineCompare(geo, siteRank);
        const sorted = [...usable].sort(cmp);
        /* Il `!` sta in piedi sulla riga sopra: `usable` non è vuoto, quindi
           `sorted` nemmeno, e il primo elemento c'è. */
        const chosen = sorted[0]!;
        const g = geo.get(chosen.location_code);

        stops.push({
          seq: 0,                               // assegnato dopo l'ordinamento globale
          site_id: g?.site_id || '',
          location_code: chosen.location_code,
          item_key: chosen.item_key,
          article_code: chosen.article_code,
          article_description: chosen.article_description || line.description,
          lot_code: chosen.lot_code,
          expiry_iso: chosen.expiry_date || lot.expiry_iso || '',
          kg_required: lot.qty,
          um: lot.um || line.um,
          alternatives: sorted.slice(1).map(a => ({
            location_code: a.location_code,
            item_key: a.item_key,
            qty_available: Store.getAvailableQty(a.location_code, a.item_key)
          })),
          qty_available: Store.getAvailableQty(chosen.location_code, chosen.item_key),
          status: 'pending',
          reason: '',
          forced_note: '',
          qty_picked: 0,
          done_at: null
        });
      }
    }

    stops.sort(this._serpentineCompare(geo, siteRank));
    stops.forEach((s, i) => { s.seq = i + 1; });

    return { stops, offroute, notes };
  },

  /* Etichette dei motivi, in un solo posto: usate da UI e report. */
  REASON_LABELS: Object.freeze({
    not_mapped:            'Fuori mappatura',
    lot_absent_other_lots: 'Lotto assente',
    no_lot_in_odp:         'Nessun lotto nell\u2019ordine',
    all_blocked:           'Non prelevabile',
    quarantine:            'In quarantena',
    pending_outbound:      'Impegnata su DDT',
    marked_missing:        'Non trovato dall\u2019operatore'
  }) satisfies Record<MotivoFuoriPercorso, string>
};

export { PickRoute };
