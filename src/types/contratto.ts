import type { Collezione } from './collezioni.js';
import type {
  Istante, Sito, Zona, Articolo, Giacenza, StatoUbicazione,
  UbicazioneDisattivata, Movimento, Quarantena, DocumentoUscita,
  SessionePrelievo, ReportPrelievo, VerbaleSmaltimento, Operatore, Meta,
  Lotto, Udc, Compito, ContoWip, RegolaStoccaggio, Destinatario, AttributiUbicazione,
} from './entita.js';

/* ── Tipi di movimento ───────────────────────────────────────────── */

export type MOV =
  | 'IN' | 'OUT' | 'MOVE' | 'PICK' | 'REPOS'
  | 'FIX+' | 'FIX-'
  | 'QUAR' | 'QREL'
  | 'EDIT' | 'RET' | 'SHIP'
  | 'SAMPLE'
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

/* ── L'idratazione ───────────────────────────────────────────────── */

/* CIÒ CHE I DUE ADAPTER RESTITUISCONO ALL'AVVIO, e che deve essere la stessa
   cosa: Store non deve accorgersi se dietro c'è IndexedDB o il servizio.
   Era dichiarato `Record<string, unknown>` — cioè non dichiarato — e la
   conversione di `store.js` ha reso evidente quanto costava: venticinque
   letture che il compilatore non poteva controllare.

   I nomi non sono quelli delle collezioni: sono quelli che `Store._cache`
   usa da sempre, e cambiarli sarebbe un lavoro senza guadagno. */
export interface CaricamentoIniziale {
  sites: Sito[];
  zones: Zona[];
  articles: Articolo[];
  inventory: Giacenza[];
  locStatus: StatoUbicazione[];
  disabled: UbicazioneDisattivata[];
  /** Una FINESTRA del registro, non il registro: vedi `MOVLOG_WINDOW_DAYS`. */
  movLog: Movimento[];
  /** Quanti ce ne sono davvero a database, finestra o non finestra. */
  movLogTotal: number;
  quarantine: Quarantena[];
  pendingOut: DocumentoUscita[];
  meta: Meta[];
  /** Un elenco, non una sola: se ne trova più d'una vince la più recente. */
  pickSession: SessionePrelievo[];
  pickArchive: ReportPrelievo[];
  disposalArchive: VerbaleSmaltimento[];
  operators: Operatore[];
  /* 1.4 — facoltative perché un servizio 1.2 non manda queste chiavi, e il
     ritorno indietro deve restare possibile senza toccare il client. */
  lots?: Lotto[];
  udc?: Udc[];
  tasks?: Compito[];
  wip?: ContoWip[];
  storageRules?: RegolaStoccaggio[];
  recipients?: Destinatario[];
  /* 2.8 — stessa ragione del blocco qui sopra: un servizio 2.7 non manda
     questa chiave, e un client 2.8 gli deve parlare lo stesso. */
  locAttrs?: AttributiUbicazione[];
}

/* ── Il contratto ────────────────────────────────────────────────── */

export interface Persistenza extends Capacita {
  readonly kind: 'local' | 'remote';

  /* La alza solo l'adapter locale, quando IndexedDB dice che lo spazio e'
     finito: da remoto il disco pieno e' un problema del servizio, non di
     questa macchina. */
  diskFull?: boolean;

  readonly COLLECTIONS: readonly Collezione[];

  open(): Promise<unknown>;
  loadAll(opzioni?: { movLogFrom?: Istante | null }): Promise<CaricamentoIniziale>;

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

  /* IL BACKUP LOCALE È UN SERVIZIO DELL'ADAPTER, NON UN OBBLIGO.
     Solo il ramo locale lo offre, su OPFS: il ramo remoto risponde `false` a
     `isBackupSupported()` perché il backup lì è un compito del servizio, che
     lo fa a caldo sul `.db`. Facoltativi per questo, e non per prudenza.

     Erano già scritti e già usati: mancavano solo dal contratto. Li ha
     chiesti il compilatore convertendo `store.js`. */
  writeBackup?(filename: string, contents: string): Promise<{ filename: string; size: number }>;
  listBackups?(prefix?: string): Promise<{ name: string; size: number; lastModified: number }[]>;
  deleteBackup?(filename: string): Promise<boolean>;
  readBackup?(filename: string): Promise<string>;

  estimateUsage(): Promise<{ usage: number; quota: number | null; pct: number | null;
                             remote?: boolean; file?: string } | null>;
}
