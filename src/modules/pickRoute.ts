/* Il ponte verso Store è caduto con la 1.4.0: `core/store.ts` è TypeScript,
   quindi i suoi tipi arrivano fin qui da soli. Stava qui perché senza una
   dichiarazione a mano il compilatore deduceva `never[]` da un file `.js`
   non controllato — ed era una promessa scritta a mano, che nessuno
   verificava contro il codice vero. */
import { Store } from '../core/store';
import { scansioniRichieste, scansioniBastano } from './preparazione';
import type { DaPreparare, ScansioniInMano } from './preparazione';
import type { Coordinate, Geometria, Giacenza } from '../types/entita.js';
import type { RigaODP } from './odpParser';
import { sitoDiCasa } from './trasferimentiOdp';
import { chiaveRiga, unisci, type OrdineDelGiro, type Richiesta } from './giroOdp';

/** Perché una riga non è percorribile, o perché lo è ma con un avvertimento. */
export type MotivoFuoriPercorso =
  | 'not_mapped' | 'lot_absent_other_lots' | 'no_lot_in_odp' | 'all_blocked'
  | 'quarantine' | 'pending_outbound' | 'marked_missing' | 'in_lavorazione';

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
  /* 2.5 — IL TRASFERIMENTO CHE HA SPOSTATO QUESTA TAPPA, se c'è.

     Fino alla 2.4 la richiesta viveva in una mappa dentro la vista, e la
     mappa muore quando il percorso si avvia: la sessione salvata portava una
     tappa spostata su un vano vuoto, senza niente che dicesse perché né come
     andasse a finire. In corsia voleva dire arrivare davanti a uno scaffale
     vuoto e non sapere se aspettare o andarsela a prendere.

     Adesso il compito viaggia CON la tappa, quindi sopravvive all'avvio, al
     salvataggio e alla ripresa dopo una chiusura imprevista. */
  transfer_task?: string;
  /** Da dove la merce deve arrivare — l'ubicazione di partenza, che dopo lo
      spostamento non è più `location_code`. */
  transfer_from?: string;
  /* 2.12 — CHI HA CHIESTO QUESTA MERCE, quando il giro porta più ordini.

     La tappa è una sola perché il vano è uno e il cammino è uno: `kg_required`
     è la somma. Ma la somma da sola non dice per chi è sceso quel sacco, e
     quella domanda se la fa la produzione — non il magazziniere, e non
     oggi. Assente su un giro di un ordine solo: lì la risposta è il numero
     d'ordine della sessione, e ripeterla su ogni tappa sarebbe rumore. */
  richieste?: Richiesta[];
  /* 2.31 — L'UNITÀ DI CARICO, quando la tappa è un pallet intero.

     Assente = tappa di merce sciolta, cioè tutto quello che c'era fino alla
     2.30. Presente, cambiano due cose e nessuna delle due è cosmetica:

     · **SI CONFERMA CON UNA SCANSIONE SOLA.** Su un pallet imballato
       articolo e lotto stanno sotto il cellophane: chiederli vorrebbe dire
       chiedere all'operatore di aprire l'imballo per confermare di non
       doverlo aprire. Il codice dell'unità è sull'etichetta, ed è il solo
       dato che non invecchia.
     · **NON SI SCOMPONE.** Un bancale si prende intero, e `kg_required` è il
       totale di quel che porta. È già la regola del carico del camion dalla
       2.21, e questa tappa la porta dentro il giro di prelievo. */
  udc_id?: string | null;
  /** Le partite che l'unità porta sopra, per dirlo a video senza aprirla.
      Vuoto su una tappa di merce sciolta. */
  contenuto?: { article_code: string; lot_code: string; colli: number }[];
}

export interface Percorso {
  stops: Tappa[];
  offroute: RigaFuoriPercorso[];
  notes: RigaFuoriPercorso[];
}

/** Al comparatore serve una sola cosa: dove sta la riga. */
type Ordinabile = { location_code: string };

/** E alla grammatica delle scansioni ne serve un'altra sola: se la tappa
    nomina un'unità di carico. */
type ConUdc = { udc_id?: string | null };

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

  /* 2.1 — IL MAGAZZINO DI PARTENZA DICHIARATO. Sta accanto all'ordine di
     visita e non dentro l'ordine: sono due preferenze diverse — da dove si
     comincia, e in che sequenza si visita il resto — e tenerle in un campo
     solo vorrebbe dire che spostare un magazzino in coda cambia anche da
     dove parte il giro. Vuoto = decide il conteggio delle righe. */
  CASA_KEY: 'wm_pickroute_casa',

  getCasaScelta(): string {
    try { return String(localStorage.getItem(this.CASA_KEY) || ''); }
    catch { return ''; }
  },

  setCasaScelta(siteId: string | null): void {
    try {
      if (siteId) localStorage.setItem(this.CASA_KEY, String(siteId));
      else localStorage.removeItem(this.CASA_KEY);
    } catch (err) { console.warn('[WM] PickRoute: magazzino di partenza non salvabile', err); }
  },

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

  /* 2.0 — IL GIRO COMINCIA DA CASA, cioe' dal magazzino dove l'ordine ha
     piu' righe. Prima era l'ordine di visita a decidere, e sull'ODP vero
     quello partiva da `MAG`: la prima tappa mandava in un capannone per una
     riga sola, e le tredici di M03 venivano dopo. La regola l'ha detta
     Andrea il 19/08 ed era gia' scritta in `sitoDiCasa` — la usava pero'
     solo l'avviso «articolo in un altro magazzino», non il giro.

     GLI ALTRI SITI RESTANO NELL'ORDINE DI VISITA, che e' la preferenza di
     chi cammina: casa passa davanti, il resto non si tocca. */
  _ordineDiVisita(stops: readonly Tappa[], siteOrder: string[]): Map<string, number> {
    const casa = sitoDiCasa(stops, siteOrder, this.getCasaScelta());
    const rank = new Map(siteOrder.map((id, i) => [id, i + 1] as const));
    if (casa) rank.set(casa, 0);
    return rank;
  },

  build(parsedLines: RigaODP[]): Percorso {
    const geo = Store.buildLocationGeometry();
    const siteOrder = this.getSiteOrder();
    /* QUESTO ordine serve alla scelta di UNA riga fra piu' ubicazioni che
       hanno lo stesso lotto, e gira prima che le tappe esistano: casa si sa
       solo dopo averle contate tutte, e qui non c'e' ancora niente da
       contare. Resta la preferenza dell'operatore, che e' il criterio giusto
       fra due vani equivalenti. L'ordine del GIRO, piu' sotto, e' un'altra
       cosa e parte da casa. */
    const siteRank = new Map(siteOrder.map((id, i) => [id, i] as const));

    const stops: Tappa[] = [];
    const offroute: RigaFuoriPercorso[] = [];
    const notes: RigaFuoriPercorso[] = [];
    /* IL VANO DI LAVORAZIONE NON E' UNO SCAFFALE, E NON SI PRELEVA DA LI'.

       Portare in produzione e' un TRASFERIMENTO: la merce esce dal vano e
       entra nel conto di un ordine, ma in giacenza resta scritta, nel vano
       WIP. Per `getItemByKey` quello e' un'ubicazione come le altre, e
       quando lo scaffale si svuota diventa l'UNICA che porta quel lotto:
       il percorso mandava a prelevare merce gia' in reparto, dal vano WIP
       verso il vano WIP.

       Non e' merce disponibile: e' merce di qualcuno, sul conto di un
       ordine. Quanta ce ne sia e su quale conto lo dice il riquadro della
       copertura — `coperturaInLavorazione`, `modules/wip.ts` — e prenderla
       e' una decisione di produzione, non una tappa da camminare. */
    const vanoWip = Store.getAreaWip();

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
        /* 2.29.1 — UNA NOTA PER VANO E MOTIVO, NON UNA PER RIGA DI GIACENZA.
           `(location_code, item_key)` e' un indice, NON un vincolo di
           unicita' (`server/lib/schema.js`): due righe dello stesso lotto
           nello stesso vano ci stanno, e un caricamento di massa le fa.
           Ogni riga scriveva la sua nota, quindi lo stesso vano ripeteva la
           stessa frase quante volte era duplicato. Visto al banco l'08/09:
           quattro righe in `M06-COM-01` davano quattro volte «Gia' in
           reparto produzione». `offroute` era gia' corretto — una voce sola:
           era solo l'avviso a moltiplicarsi, e un avviso ripetuto spinge
           fuori dallo schermo quelli che l'operatore non ha ancora letto. */
        const gia = new Set<string>();
        const nota = (n: RigaFuoriPercorso) => {
          const k = `${n.location_code}#${n.reason}`;
          if (gia.has(k)) return;
          gia.add(k);
          notes.push(n);
        };
        for (const it of found) {
          if (Store.isItemQuarantined(it.item_key, it.location_code)) {
            nota({
              ...base,
              location_code: it.location_code,
              reason: 'quarantine',
              detail: 'In quarantena — non prelevabile.'
            });
            continue;
          }
          if (vanoWip && it.location_code === vanoWip) {
            nota({
              ...base,
              location_code: it.location_code,
              reason: 'in_lavorazione',
              detail: 'Già in reparto produzione: dal vano di lavorazione non si preleva.'
            });
            continue;
          }
          if (Store.getAvailableQty(it.location_code, it.item_key) <= 0) {
            nota({
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
          /* IL MOTIVO LO DICE CHI HA BLOCCATO. Una riga che sta tutta in
             reparto non e' «in quarantena o impegnata su un DDT»: scriverlo
             cosi' manda a cercare il guasto dove non c'e'. */
          const soloWip = Boolean(vanoWip) && found.every((it) => it.location_code === vanoWip);
          offroute.push({
            ...base,
            reason: soloWip ? 'in_lavorazione' : 'all_blocked',
            detail: soloWip
              ? 'Tutta la merce di questo lotto è già in reparto produzione.'
              : 'Tutte le ubicazioni sono in quarantena o impegnate su DDT pendenti.'
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

    /* Casa si sa solo dopo aver raccolto le tappe: e' il sito che ne ha di
       piu', e prima di raccoglierle non c'e' niente da contare. */
    stops.sort(this._serpentineCompare(geo, this._ordineDiVisita(stops, siteOrder)));
    stops.forEach((s, i) => { s.seq = i + 1; });

    return { stops, offroute, notes };
  },

  /* 2.12 — PIÙ ORDINI IN UN GIRO SOLO.

     Il cammino non cambia: le distinte si sommano PRIMA, e quello che arriva
     qui è una distinta come tutte le altre. Righe che chiedono lo stesso
     articolo dallo stesso lotto sono già diventate una riga sola, quindi
     escono una tappa sola — che è il punto: cinque ordini che vogliono
     cinque chili dallo stesso sacco si presentano davanti a quel sacco una
     volta.

     Le `richieste` si riattaccano DOPO la costruzione e per chiave, non
     dentro il ciclo: `build` è la funzione che decide quale ubicazione e
     quali alternative, ed è già collaudata così. Una riga senza lotto non
     diventa una tappa — finisce in coda — e la sua richiesta resta nella
     mappa senza destinatario, che è giusto: non c'è niente da prelevare. */
  buildGiro(ordini: readonly OrdineDelGiro[]): Percorso {
    const { lines, richieste } = unisci(ordini);
    const percorso = this.build(lines);
    if ((ordini || []).length > 1) {
      for (const s of percorso.stops) {
        const r = richieste.get(chiaveRiga(s.article_code, s.lot_code));
        if (r?.length) s.richieste = r.map((x) => ({ ...x }));
      }
    }
    return percorso;
  },

  /* ═══ 2.31 · IL PERCORSO DI UNA PREPARAZIONE ══════════════════════════
     Non è `build` con un ingresso diverso, ed è una decisione.

     `build` risolve una DOMANDA: l'ordine di produzione chiede un articolo e
     un lotto, e il magazzino risponde da quale vano conviene prenderlo —
     FEFO, alternative, quarantene, vano di lavorazione. È una ricerca.

     Una preparazione non cerca niente. Il documento dice già articolo, lotto
     E vano: li ha scelti chi ha composto il DDT, e la merce è prenotata da
     quel momento (`getPendingQtyForItem`). Cambiarli qui vorrebbe dire
     prelevare merce diversa da quella che il documento promette, e il
     documento è già stato stampato.

     QUINDI NIENTE ALTERNATIVE, e non è una mancanza: un'alternativa è
     un'altra ubicazione dello stesso lotto, e sceglierla scollegherebbe la
     riga del documento dalla merce che esce. Se il vano è vuoto la tappa non
     si trova, e quello è un fatto da vedere — non da aggirare in silenzio.

     Quel che resta in comune con `build` è la SERPENTINA: le corsie pari al
     contrario, i magazzini nell'ordine dichiarato. Quella passa da
     `ordinaPerCorsia`, che è la stessa che ordina i bancali del carico. */
  buildPreparazione(cose: readonly DaPreparare[] | null | undefined): Percorso {
    const geo = Store.buildLocationGeometry();
    const stops: Tappa[] = (cose || []).map((c) => ({
      seq: 0,
      site_id: geo.get(c.location_code)?.site_id || '',
      location_code: c.location_code,
      item_key: c.item_key,
      article_code: c.article_code,
      article_description: c.article_description,
      lot_code: c.lot_code,
      expiry_iso: '',
      /* I COLLI, NON LE UM. Un documento di uscita conta colli — è così che
         `_shipAddToCart` riempie il carrello — e la quantità in unità di
         misura è un di più che spesso non c'è. Mettere `qty_uom` qui
         farebbe uscire `0` su ogni riga che non la dichiara, e uno zero ha
         l'aria di un dato vero. */
      kg_required: c.colli,
      um: c.uom,
      alternatives: [],
      qty_available: 0,
      status: 'pending',
      reason: '',
      forced_note: '',
      qty_picked: 0,
      done_at: null,
      ...(c.tipo === 'udc' ? { udc_id: c.udc_id, contenuto: c.contenuto } : {}),
    }));

    const ordinate = this.ordinaPerCorsia(stops);
    ordinate.forEach((s, i) => { s.seq = i + 1; });
    return { stops: ordinate, offroute: [], notes: [] };
  },

  /** 2.31 — quante scansioni chiede questa tappa. Una sola sull'unità di
      carico, tre sulla merce sciolta. La regola sta in `preparazione.ts`;
      qui c'è il ponte, perché chi ha una `Tappa` in mano non ha una
      `DaPreparare`. */
  /* 2.35.1 — basta che la tappa dica se ha un'unità: chiedere qui una
     `Tappa` intera vorrebbe dire che la maschera, che maneggia il tipo
     salvato nella sessione, deve convertirla per fare una domanda che
     riguarda un campo solo. */
  scansioniDiTappa(t: ConUdc | null | undefined): string[] {
    return scansioniRichieste(this._comeCosa(t));
  },

  /* E la stessa domanda dall'altro verso: quel che l'operatore ha in mano
     basta a questa tappa? La maschera lo chiedeva in tre posti, e uno dei
     tre parlava solo la grammatica della merce sciolta. */
  scansioniBastanoPer(t: ConUdc | null | undefined, inMano: ScansioniInMano | null | undefined): boolean {
    return scansioniBastano(this._comeCosa(t), inMano);
  },

  _comeCosa(t: ConUdc | null | undefined): DaPreparare {
    return (t?.udc_id ? { tipo: 'udc' } : { tipo: 'riga' }) as DaPreparare;
  },

  /* 1.10 — RIMETTERE IN FILA LE TAPPE dopo che una si e' spostata. La
     serpentina e la numerazione sono le stesse di `build`: una tappa che
     cambia ubicazione cambia anche il punto del giro in cui la si incontra,
     e lasciarle il numero di prima farebbe camminare all'indietro. */
  /* 2.21 — LA SERPENTINA SU QUALUNQUE COSA ABBIA UN'UBICAZIONE.
     Il carico di un DDT non prende righe: prende BANCALI, e un bancale non
     ha un articolo ne' un lotto. La regola del giro pero' e' la stessa —
     corsie pari al contrario, i magazzini nell'ordine dichiarato — e
     riscriverla accanto sarebbe la seconda serpentina dello stesso
     magazzino. Non c'e' «casa»: il giro di carico parte da dove sono i
     bancali, non dal magazzino con piu' righe di un ordine. */
  ordinaPerCorsia<T extends Ordinabile>(righe: readonly T[]): T[] {
    const geo = Store.buildLocationGeometry();
    const rank = new Map(this.getSiteOrder().map((id, i) => [id, i + 1] as const));
    return [...righe].sort(this._serpentineCompare(geo, rank));
  },

  riordina(stops: Tappa[]): Tappa[] {
    const geo = Store.buildLocationGeometry();
    /* La stessa regola di `build`, casa compresa: una tappa spostata puo'
       cambiare quale magazzino ne ha di piu', e riordinare con un criterio
       diverso da quello che ha costruito il giro lo spezzerebbe in due. */
    const out = [...stops].sort(this._serpentineCompare(geo, this._ordineDiVisita(stops, this.getSiteOrder())));
    out.forEach((s, i) => { s.seq = i + 1; });
    return out;
  },

  /* Etichette dei motivi, in un solo posto: usate da UI e report. */
  REASON_LABELS: Object.freeze({
    not_mapped:            'Fuori mappatura',
    lot_absent_other_lots: 'Lotto assente',
    no_lot_in_odp:         'Nessun lotto nell\u2019ordine',
    all_blocked:           'Non prelevabile',
    quarantine:            'In quarantena',
    pending_outbound:      'Impegnata su DDT',
    marked_missing:        'Non trovato dall\u2019operatore',
    in_lavorazione:        'Già in lavorazione'
  }) satisfies Record<MotivoFuoriPercorso, string>
};

export { PickRoute };
