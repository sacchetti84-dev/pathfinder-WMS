/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — IL CONTRATTO DI PERSISTENZA
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   La forma che i due adapter — IndexedDB e servizio dati — devono avere
   entrambi. Non è una descrizione a posteriori: è ciò che rende possibile
   scriverne un terzo senza riaprire Store.

   Il commento che sta in cima a `core/persistence/index.js` spiega il perché
   di ogni scelta. Qui c'è la stessa cosa in una forma che il compilatore
   sa leggere.
   ═══════════════════════════════════════════════════════════════════ */

import type { Collezione } from './collezioni.js';
import type { Istante } from './entita.js';

/* ── Tipi di movimento ───────────────────────────────────────────── */

/* I quattordici valori di `MOV`. Tre di questi non muovono merce — PURGE,
   PINRESET e EDIT — e sono eventi di audit: stanno nello stesso registro
   perché la domanda "cosa è successo a questo lotto" e la domanda "chi ha
   toccato cosa" hanno una risposta sola. */
export type MOV =
  | 'IN' | 'OUT' | 'MOVE' | 'PICK' | 'REPOS'
  | 'FIX+' | 'FIX-'
  | 'QUAR' | 'QREL'
  | 'EDIT' | 'RET' | 'SHIP'
  | 'PURGE' | 'PINRESET';

/* ── Criteri di ricerca ──────────────────────────────────────────── */

/* PERCHÉ DICHIARATIVI E NON UNA FUNZIONE DI FILTRO.
   Il motivo sta scritto nel refactor v2.6.0 e vale ancora: «una funzione non
   attraversa la rete». Un criterio `{field, op, value}` diventa una where()
   di Dexie da una parte e una query SQL dall'altra; una callback no.

   Gli operatori sono cinque e non uno di più: ognuno in più è un impegno che
   ogni adapter futuro dovrà onorare. */
/* Si chiama OperatoreCriterio e non Operatore perché in un magazzino
   «operatore» è la persona che ci lavora, e quel nome appartiene a lei. */
export type OperatoreCriterio =
  | 'equals'
  | 'startsWith'
  | 'below'
  | 'aboveOrEqual'
  | 'between';

export type Criterio =
  | { field: string; op: Exclude<OperatoreCriterio, 'between'>; value: string | number }
  | { field: string; op: 'between'; value: [string | number, string | number] };

export interface OpzioniQuery {
  criteria?: Criterio | null;
  limit?: number | null;
  offset?: number;
  reverse?: boolean;
  orderBy?: string | null;
}

/* ── Capacità ────────────────────────────────────────────────────── */

/* Store INTERROGA questi flag invece di dare per scontato cosa il supporto
   sappia fare. È la ragione per cui l'arrivo del servizio dati non ha
   richiesto di andare a cercare i punti da cambiare: erano già dichiarati. */
export interface Capacita {
  /** Un lotto di scritture o passa tutto o non passa niente. */
  supportsTransactions: boolean;
  /** Il supporto avvisa quando un altro terminale ha scritto (feed SSE). */
  supportsRealtime: boolean;
  /** Sa fare una copia locale dei dati (OPFS). Il servizio no: è compito suo. */
  supportsLocalBackup: boolean;
  /** Espone operazioni di dominio che leggono, decidono e riscrivono in un
      solo respiro. Solo il servizio può: fra il momento in cui un terminale
      legge «ci sono 40 colli» e quello in cui scrive «adesso sono 35», un
      altro terminale può averne presi 10. */
  supportsRemoteOps?: boolean;
}

/* ── Il contratto ────────────────────────────────────────────────── */

export interface Persistenza extends Capacita {
  readonly kind: 'local' | 'remote';

  /* L'elenco delle collezioni, che Store scorre per svuotare la cache e per
     contare i record al checkpoint. Non era dichiarato qui pur essendo su
     entrambi gli adapter: un membro del contratto che il contratto non
     conosceva. Ora è uno solo, e viene da `COLLEZIONI`. */
  readonly COLLECTIONS: readonly Collezione[];

  /* `Promise<unknown>` e non `Promise<void>` perché i due adapter non
     restituiscono la stessa cosa: quello locale niente, quello remoto `true`.
     Nessuno dei due valori viene letto — `Store.init()` fa `await
     Persistence.open()` e prosegue. Dichiararlo `void` avrebbe voluto dire
     togliere quel `return true`, cioè cambiare il codice per far tornare i
     conti a un tipo che ho scritto io: qui la cosa sbagliata era il tipo. */
  open(): Promise<unknown>;
  loadAll(opzioni?: { movLogFrom?: Istante | null }): Promise<Record<string, unknown>>;

  /* Le due scritture sono SEPARATE di proposito: `add` pretende che il record
     non ci sia, `put` non se ne cura. La differenza è un controllo, non un
     dettaglio di comodità. */
  add<T>(collezione: Collezione, record: T): Promise<unknown>;
  put<T>(collezione: Collezione, record: T): Promise<unknown>;

  /* `update` è una modifica PARZIALE per chiave, e resta separata da `put`
     perché ricostruirla come leggi-modifica-riscrivi trasformerebbe, contro
     un server, una PATCH in una PUT: due operatori che toccano campi diversi
     dello stesso record smetterebbero di poter convivere. */
  update(collezione: Collezione, chiave: string | number, modifiche: Record<string, unknown>): Promise<unknown>;

  delete(collezione: Collezione, chiave: string | number): Promise<unknown>;
  bulkAdd<T>(collezione: Collezione, record: T[]): Promise<unknown>;
  bulkPut<T>(collezione: Collezione, record: T[]): Promise<unknown>;
  clear(collezione: Collezione): Promise<unknown>;
  clearMany(collezioni: Collezione[]): Promise<unknown>;
  deleteWhere(collezione: Collezione, criterio: Criterio): Promise<unknown>;

  get<T>(collezione: Collezione, chiave: string | number): Promise<T | undefined>;
  count(collezione: Collezione, criterio?: Criterio | null): Promise<number>;
  countAll(): Promise<Record<string, number>>;
  query<T>(collezione: Collezione, opzioni?: OpzioniQuery): Promise<T[]>;
  /** Restituisce quanti record ha scorso: `Store.queryMovements` lo propaga
      al chiamante, quindi non è un dettaglio interno dell'adapter. */
  eachChunk<T>(
    collezione: Collezione,
    opzioni: { criteria?: Criterio | null; chunkSize?: number },
    fn: (blocco: T[]) => void | Promise<void>,
  ): Promise<number>;

  /** Le scritture dentro `fn` sono tutto-o-niente. */
  transaction<T>(collezioni: Collezione[], fn: () => Promise<T>): Promise<T>;

  /** Operazione di dominio eseguita dal servizio. Solo se `supportsRemoteOps`. */
  op?<T>(nome: string, payload: unknown): Promise<T>;

  isBackupSupported(): boolean;
  estimateUsage(): Promise<unknown>;
}
