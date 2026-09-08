/* IL PUNTO UNICO DI MUTAZIONE DELLA CACHE, in TypeScript.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Primo blocco della conversione di `store.js` (PIANO-1.4 §3). Qui dentro non
   c'è niente di nuovo: è il codice che stava in `Store`, spostato e tipizzato.
   La semantica è invariata — stesse posizioni di inserimento, stesso ordine,
   stessi effetti sugli indici — e il collaudo `test/cache.test.js` esiste per
   dimostrarlo.

   PERCHÉ COMINCIA DA QUI. Sono 19 collezioni e ogni scrittura ci passa: se
   sbaglia questo, sbaglia tutto il resto in silenzio. Ed è ciò su cui poggiano
   le cinque collezioni nuove della 1.4.

   PERCHÉ È FUORI DA STORE. Non per estetica: perché così si può collaudare
   senza `Persistence`, senza servizio e senza browser. Fino a ieri
   `_applyToCache` non aveva nessuna prova — era l'aperto #6 — e il motivo è
   che per raggiungerlo bisognava costruire mezzo applicativo.

   LA REGOLA CHE LO TIENE IN PIEDI: si lavora per FORMA, non per nome. Una
   collezione nuova si dichiara in `FORMA_CACHE` e funziona; non si programma. */

import type { Collezione } from '../types/collezioni.js';
import type {
  Sito, Zona, Articolo, Giacenza, StatoUbicazione, Movimento, Quarantena,
  DocumentoUscita, SessionePrelievo, ReportPrelievo, VerbaleSmaltimento,
  Operatore, Lotto, Udc, Compito, ContoWip, RegolaStoccaggio, Destinatario, Istante,
  AttributiUbicazione,
} from '../types/entita.js';

/* ── Le forme ──────────────────────────────────────────────────────────── */

export type FormaKind = 'list' | 'map' | 'set' | 'single' | 'kv';
export type Operazione = 'put' | 'delete' | 'clear';

export interface Forma {
  /** Il nome del campo in cache, che NON coincide con quello della collezione. */
  readonly field: string;
  readonly kind: FormaKind;
  readonly key?: string;
  /** Coda per anagrafiche e giacenze, testa per i registri cronologici. */
  readonly insert?: 'push' | 'unshift';
}

/* L'ordine di inserimento è quello di sempre: `unshift` dove il più recente
   deve stare in cima, `push` dove l'elenco si legge dall'inizio. Cambiarlo
   qui cambia cosa l'operatore vede per primo in quattro schermate. */
export const FORMA_CACHE = {
  sites:            { field: 'sites',           kind: 'list',   key: '_id',           insert: 'push' },
  zones:            { field: 'zones',           kind: 'list',   key: '_id',           insert: 'push' },
  articles:         { field: 'articles',        kind: 'list',   key: '_id',           insert: 'push' },
  inventory:        { field: 'inventory',       kind: 'list',   key: '_id',           insert: 'push' },
  mov_log:          { field: 'movLog',          kind: 'list',   key: '_id',           insert: 'unshift' },
  quarantine:       { field: 'quarantine',      kind: 'list',   key: '_id',           insert: 'unshift' },
  pending_outbound: { field: 'pendingOut',      kind: 'list',   key: 'doc_id',        insert: 'unshift' },
  pick_archive:     { field: 'pickArchive',     kind: 'list',   key: 'doc_id',        insert: 'unshift' },
  disposal_archive: { field: 'disposalArchive', kind: 'list',   key: 'doc_id',        insert: 'unshift' },
  operators:        { field: 'operators',       kind: 'list',   key: 'op_id',         insert: 'push' },
  loc_status:       { field: 'locStatus',       kind: 'map',    key: 'location_code' },
  disabled:         { field: 'disabled',        kind: 'set',    key: 'location_code' },
  /* 2.30 — DA UNA A MOLTE. Fino alla 2.29 di sessione ne viveva una per
     tutto l'impianto e la cache la teneva come record solo. Adesso il
     prelievo nasce da un'attività presa in carico, e due operatori possono
     prenderne due insieme: quale sia «la mia» lo decide `modules/sessioni`,
     e la cache le tiene tutte. */
  pick_session:     { field: 'pickSessions',    kind: 'list',   key: 'session_id',    insert: 'push' },
  meta:             { field: 'meta',            kind: 'kv',     key: 'key' },
  /* 1.4.0 — dichiarate, non programmate. */
  lots:             { field: 'lots',            kind: 'list',   key: '_id',      insert: 'push' },
  udc:              { field: 'udc',             kind: 'list',   key: 'udc_id',   insert: 'push' },
  tasks:            { field: 'tasks',           kind: 'list',   key: 'task_id',  insert: 'unshift' },
  wip:              { field: 'wip',             kind: 'list',   key: 'wip_id',   insert: 'unshift' },
  storage_rules:    { field: 'storageRules',    kind: 'list',   key: 'rule_id',  insert: 'push' },
  recipients:       { field: 'recipients',      kind: 'list',   key: 'rcp_id',   insert: 'push' },
  /* 2.8 — una MAPPA e non un elenco, come `loc_status`: la si legge per
     codice a ogni cella disegnata e a ogni proposta del motore, e scorrere
     un elenco duemila volte per disegnata e' esattamente il difetto che
     `verificaStoccaggio` esiste per non ripetere. */
  location_attrs:   { field: 'locAttrs',        kind: 'map',    key: 'location_code' },
} as const satisfies Record<Collezione, Forma>;

/* ── La cache ──────────────────────────────────────────────────────────── */

export interface MetaCache {
  lastModified: Istante | null;
  unsavedChanges: boolean;
  lastAutoBackup?: Istante | null;
  docConfig?: unknown;
  features?: Record<string, boolean>;
  [altro: string]: unknown;
}

export interface Cache {
  sites: Sito[];
  zones: Zona[];
  articles: Articolo[];
  inventory: Giacenza[];
  locStatus: Map<string, StatoUbicazione>;
  disabled: Set<string>;
  movLog: Movimento[];
  quarantine: Quarantena[];
  pendingOut: DocumentoUscita[];
  pickSessions: SessionePrelievo[];
  pickArchive: ReportPrelievo[];
  disposalArchive: VerbaleSmaltimento[];
  operators: Operatore[];
  /** Quanti movimenti ci sono a DATABASE: `movLog` ne tiene solo la finestra. */
  movLogTotal: number;
  lots: Lotto[];
  udc: Udc[];
  tasks: Compito[];
  wip: ContoWip[];
  storageRules: RegolaStoccaggio[];
  recipients: Destinatario[];
  /** 2.8 — gli scavalchi di caratterizzazione, per ubicazione. Assente =
      la cella dice quel che dice la sua zona. */
  locAttrs: Map<string, AttributiUbicazione>;
  meta: MetaCache;
}

/** Gli indici derivati. Non sono un impegno preso col lettore: sono una
    conseguenza automatica di ogni mutazione, e nessun chiamante li nomina. */
export interface Indici {
  invByLoc: Map<string, Giacenza[]>;
  invByKey: Map<string, Giacenza[]>;
  artByCode: Map<string, Articolo>;
  /** 1.4.2 — la confezione congelata, per `articolo#lotto`. Serve un indice
      e non un `find`: la si legge a ogni riga di ogni schermata di giacenza,
      e `lots` cresce di un record per ogni lotto mai posizionato. */
  lotByKey: Map<string, Lotto>;
}

/* La stessa forma di `item_key`, e non è un caso: le due chiavi descrivono
   la stessa merce da due lati — la riga dov'è adesso, la confezione con cui
   è stata imballata. Il lotto NON si alza a maiuscolo, perché `item_key`
   nasce da `Validate.clean(lot)` senza `upper` e due chiavi diverse per la
   stessa merce sono peggio di una chiave brutta. */
export function chiaveLotto(articleCode: unknown, lotCode: unknown): string {
  return `${String(articleCode ?? '').trim().toUpperCase()}#${String(lotCode ?? '').trim()}`;
}

/** Un record qualunque. Il tipo è volutamente largo: questa funzione lavora
    per forma, e fingere di sapere quale entità sta passando sarebbe una
    precisione falsa — decisione 12: dove tipo e codice litigano, cede il tipo. */
type Riga = Record<string, any>;

/* ── Bucket ────────────────────────────────────────────────────────────── */

export function bucketPut(map: Map<string, Riga[]>, mapKey: string | undefined | null, rec: Riga): void {
  if (mapKey === undefined || mapKey === null) return;
  let arr = map.get(mapKey);
  if (!arr) { arr = []; map.set(mapKey, arr); }
  const i = arr.findIndex(x => x._id === rec._id);
  if (i >= 0) arr[i] = rec; else arr.push(rec);
}

export function bucketDelete(map: Map<string, Riga[]>, mapKey: string | undefined | null, rec: Riga): void {
  if (mapKey === undefined || mapKey === null) return;
  const arr = map.get(mapKey);
  if (!arr) return;
  const i = arr.findIndex(x => x._id === rec._id);
  if (i >= 0) arr.splice(i, 1);
  if (!arr.length) map.delete(mapKey);
}

/** Una riga di giacenza che cambia ubicazione o articolo/lotto esce dal
    bucket vecchio prima di entrare in quello nuovo. Senza il confronto con
    `prev` resterebbe in due posti, e il saldo per ubicazione mentirebbe.

    LA TRAPPOLA È `prev !== next`, ed è costata un ciclo di debug. `prev` si
    ritrova per `_id` DENTRO la cache: chi modifica l'ubicazione sull'oggetto
    che la cache già tiene, e poi lo ripassa di qua, passa lo stesso oggetto
    due volte — il confronto non trova nessuna differenza da riparare e la
    riga resta anche nel bucket vecchio. Chi sposta una riga scrive un
    oggetto NUOVO. È successo a `moveUdc`, e a video la merce stava in due
    vani insieme mentre il servizio ne conosceva uno solo. */
export function indicizzaGiacenza(indici: Indici, prev: Riga | null, next: Riga): void {
  if (prev && prev !== next) {
    if (prev.location_code !== next.location_code) bucketDelete(indici.invByLoc, prev.location_code, prev);
    if (prev.item_key !== next.item_key) bucketDelete(indici.invByKey, prev.item_key, prev);
  }
  bucketPut(indici.invByLoc, next.location_code, next);
  bucketPut(indici.invByKey, next.item_key, next);
}

/** Gli indici da zero, dalla cache. Lo chiamano le tre eccezioni che agiscono
    su insiemi invece che su singoli record — idratazione, cancellazione per
    prefisso, purga per soglia — e per questo restano coerenti. */
export function ricostruisciIndici(C: Cache, indici: Indici): void {
  indici.invByLoc = new Map();
  indici.invByKey = new Map();
  indici.artByCode = new Map();
  indici.lotByKey = new Map();
  for (const l of C.lots) indici.lotByKey.set(chiaveLotto(l.article_code, l.lot_code), l);
  for (const it of C.inventory) {
    bucketPut(indici.invByLoc, it.location_code, it as Riga);
    bucketPut(indici.invByKey, it.item_key, it as Riga);
  }
  /* L'articolo disattivato resta in cache ma esce dall'indice: la riga serve
     ancora a leggere le descrizioni dello storico. */
  for (const a of C.articles) {
    if (a.active !== false) indici.artByCode.set(a.code, a);
  }
}

export function indiciVuoti(): Indici {
  return {
    invByLoc: new Map(), invByKey: new Map(),
    artByCode: new Map(), lotByKey: new Map(),
  };
}

/* UNA SOLA DEFINIZIONE DELLA CACHE VUOTA.
   La usano `Store` all'avvio e i tre file di collaudo che prima se la
   riscrivevano ognuno per conto suo. Non è pulizia: una cache di prova che
   diverge da quella vera è un collaudo che passa su un oggetto che in
   produzione non esiste.

   Serve anche a dare un TIPO al campo `_cache` di `Store`, che è un oggetto
   letterale: senza, `sites: []` si deduce `never[]` e ogni lettura di quel
   campo diventa un errore. */
export function cacheVuota(): Cache {
  return {
    sites: [], zones: [], articles: [], inventory: [],
    locStatus: new Map(), disabled: new Set(),
    movLog: [], quarantine: [], pendingOut: [],
    pickSessions: [], pickArchive: [], disposalArchive: [], operators: [],
    movLogTotal: 0,
    lots: [], udc: [], tasks: [], wip: [], storageRules: [], recipients: [],
    locAttrs: new Map(),
    meta: metaVuota(),
  };
}

export function metaVuota(): MetaCache {
  return { lastModified: null, unsavedChanges: false, lastAutoBackup: null, features: {} };
}

/* ── La mutazione ──────────────────────────────────────────────────────── */

/* `C[forma.field]` è un accesso per nome su un oggetto tipizzato, e TypeScript
   non sa dire «questo campo contiene proprio quello». Esprimerlo servirebbe un
   tipo mappato per ognuna delle 19 collezioni — cioè riscrivere per nome
   esattamente ciò che questo codice esiste per NON scrivere per nome.
   Il varco è qui, dichiarato, ed è largo una riga. */
const campo = (C: Cache, f: string): any => (C as unknown as Record<string, any>)[f];
const scriviCampo = (C: Cache, f: string, v: unknown): void => {
  (C as unknown as Record<string, any>)[f] = v;
};

export function applicaAllaCache(
  C: Cache,
  indici: Indici,
  collezione: Collezione,
  op: Operazione,
  record: Riga | null = null,
): void {
  const forma: Forma | undefined = (FORMA_CACHE as Record<string, Forma>)[collezione];
  if (!forma) throw new Error(`Collection senza mappatura in cache: ${collezione}`);

  if (op === 'clear') {
    switch (forma.kind) {
      case 'list':   scriviCampo(C, forma.field, []); break;
      case 'map':    scriviCampo(C, forma.field, new Map()); break;
      case 'set':    scriviCampo(C, forma.field, new Set()); break;
      case 'single': scriviCampo(C, forma.field, null); break;
      case 'kv':     scriviCampo(C, forma.field, metaVuota()); break;
    }
    if (collezione === 'inventory') { indici.invByLoc = new Map(); indici.invByKey = new Map(); }
    if (collezione === 'articles') { indici.artByCode = new Map(); }
    if (collezione === 'lots') { indici.lotByKey = new Map(); }
    return;
  }

  if (op !== 'put' && op !== 'delete') throw new Error(`Operazione di cache non supportata: ${op}`);
  if (!record) throw new Error(`Operazione ${op} su ${collezione} senza record`);

  switch (forma.kind) {

    case 'list': {
      const arr: Riga[] = campo(C, forma.field);
      const chiave = forma.key as string;
      const id = record[chiave];
      const i = arr.findIndex(x => x[chiave] === id);
      const prev = i >= 0 ? (arr[i] ?? null) : null;

      if (op === 'delete') {
        if (i >= 0) arr.splice(i, 1);
        if (collezione === 'inventory') {
          bucketDelete(indici.invByLoc, record.location_code, record);
          bucketDelete(indici.invByKey, record.item_key, record);
        }
        if (collezione === 'articles') indici.artByCode.delete(record.code);
        if (collezione === 'lots') indici.lotByKey.delete(chiaveLotto(record.article_code, record.lot_code));
        return;
      }

      if (i >= 0) arr[i] = record;
      else if (forma.insert === 'unshift') arr.unshift(record);
      else arr.push(record);

      if (collezione === 'inventory') indicizzaGiacenza(indici, prev, record);
      /* L'articolo disattivato esce dall'indice ma resta in cache: la riga
         serve ancora a leggere le descrizioni dello storico. */
      if (collezione === 'articles') {
        if (record.active === false) indici.artByCode.delete(record.code);
        else indici.artByCode.set(record.code, record as Articolo);
      }
      /* Una riga di `lots` che cambia articolo o lotto lascia la chiave
         vecchia appesa: stessa ragione per cui la giacenza confronta `prev`. */
      if (collezione === 'lots') {
        if (prev) {
          const vecchia = chiaveLotto(prev.article_code, prev.lot_code);
          if (vecchia !== chiaveLotto(record.article_code, record.lot_code)) indici.lotByKey.delete(vecchia);
        }
        indici.lotByKey.set(chiaveLotto(record.article_code, record.lot_code), record as Lotto);
      }
      return;
    }

    case 'map': {
      const k = record[forma.key as string];
      const m: Map<string, Riga> = campo(C, forma.field);
      if (op === 'delete') m.delete(k); else m.set(k, record);
      return;
    }

    case 'set': {
      const k = record[forma.key as string];
      const s: Set<string> = campo(C, forma.field);
      if (op === 'delete') s.delete(k); else s.add(k);
      return;
    }

    case 'single': {
      scriviCampo(C, forma.field, op === 'delete' ? null : record);
      return;
    }

    case 'kv': {
      const kv: Record<string, unknown> = campo(C, forma.field);
      if (op === 'delete') delete kv[record.key];
      else kv[record.key] = record.value;
      return;
    }
  }
}
