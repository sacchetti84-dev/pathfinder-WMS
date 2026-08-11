import type { Collezione } from './collezioni.js';
import type { Istante } from './entita.js';

/* ── Tipi di movimento ───────────────────────────────────────────── */

export type MOV =
  | 'IN' | 'OUT' | 'MOVE' | 'PICK' | 'REPOS'
  | 'FIX+' | 'FIX-'
  | 'QUAR' | 'QREL'
  | 'EDIT' | 'RET' | 'SHIP'
  | 'PURGE' | 'PINRESET';

/* ── Criteri di ricerca ──────────────────────────────────────────── */

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

export interface Capacita {
  /** Un lotto di scritture o passa tutto o non passa niente. */
  supportsTransactions: boolean;
  /** Il supporto avvisa quando un altro terminale ha scritto (feed SSE). */
  supportsRealtime: boolean;
  /** Sa fare una copia locale dei dati (OPFS). Il servizio no: è compito suo. */
  supportsLocalBackup: boolean;
  supportsRemoteOps?: boolean;
}

/* ── Il contratto ────────────────────────────────────────────────── */

export interface Persistenza extends Capacita {
  readonly kind: 'local' | 'remote';

  readonly COLLECTIONS: readonly Collezione[];

  open(): Promise<unknown>;
  loadAll(opzioni?: { movLogFrom?: Istante | null }): Promise<Record<string, unknown>>;

  add<T>(collezione: Collezione, record: T): Promise<unknown>;
  put<T>(collezione: Collezione, record: T): Promise<unknown>;

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
