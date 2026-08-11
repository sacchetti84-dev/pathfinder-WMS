/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — persistenza locale (IndexedDB via Dexie)
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Prima implementazione del contratto descritto in index.ts. È quella che
   serve quando l'applicativo viene aperto con doppio clic, senza servizio.

   FASE 3 — COSA HA CAMBIATO IL PASSAGGIO A TypeScript.
   Il comportamento, niente: le prove del servizio e la build danno lo stesso
   file di prima. Sono cambiate tre righe, e ognuna perché il tipo ha reso
   visibile una differenza fra ciò che il codice prometteva e ciò che faceva.
   Sono annotate una per una, sul posto.
   ═══════════════════════════════════════════════════════════════════ */

import type { Collection, Table } from 'dexie';
import { db } from '../schema';
import { COLLEZIONI } from '../../types/collezioni.js';
import type { Collezione } from '../../types/collezioni.js';
import type { Criterio, OpzioniQuery } from '../../types/contratto.js';
import type { Istante } from '../../types/entita.js';

/* Un errore di scrittura porta con sé due cose in più di un Error: il codice
   che l'interfaccia interroga per distinguere «disco pieno» da «non è andata»,
   e la causa originale, che serve a chi legge la console. `cause` è nativo da
   ES2022 e qui il target è ES2020: dichiararlo è ciò che permette di
   continuare a scriverlo senza aspettare un cambio di target. */
type ErroreScrittura = Error & { code: 'DISK_FULL' | 'WRITE_FAILED'; cause: unknown };

const LocalPersistence = {
  /* Il commento non è decorativo: senza, il compilatore legge 'local' come una
     stringa qualunque e l'adapter non risulta più conforme al contratto. */
  kind: 'local' as const,

  supportsTransactions: true,
  supportsRealtime: false,
  supportsLocalBackup: true,

  /* L'elenco delle collection non è più scritto qui: arriva da
     `types/collezioni.ts`, dove il vocabolario del contratto ha un posto solo.
     Era la ragione dichiarata per cui quel file esiste — «lo stesso elenco è
     scritto in tre posti, combaciano perché qualcuno se n'è ricordato» — e
     questo è il primo dei tre che smette di ripeterlo. I nomi e il loro
     ordine sono identici, verificati riga per riga. */
  COLLECTIONS: COLLEZIONI,

  /* Dexie da qui in giu' e' un dettaglio interno. La costante `db` e la
     catena db.version(1..7) restano dove sono: sono la storia delle
     migrazioni ed hanno valore documentale.

     Il tipo di ritorno è `Table<any, any>` e non l'unione delle quattordici
     tabelle, ed è una dichiarazione di intenti: questo strato NON sa cosa c'è
     dentro le collezioni e non deve saperlo — è tutto il motivo per cui un
     secondo adapter è stato possibile. A conoscere le entità è lo schema,
     dove il compilatore le controlla davvero. */
  _table(collection: Collezione): Table<any, any> {
    const t = db[collection];
    if (!t) throw new Error(`Collection sconosciuta: ${collection}`);
    return t;
  },

  _tables(collections: Collezione[]): Table<any, any>[] {
    return collections.map(c => this._table(c));
  },

  /* Criterio dichiarativo -> WhereClause di Dexie. Gli operatori ammessi
     sono soltanto i tre che il file usa davvero: aggiungerne di piu' "per
     comodita'" significherebbe impegnare il futuro RemoteAdapter a
     implementarli.

     [1] Lo switch guarda `criteria.op` invece della variabile destrutturata
     che c'era prima. Sono lo stesso valore, ma solo il primo tiene insieme
     l'operatore e la FORMA del suo valore: `between` ne vuole due, gli altri
     uno. Destrutturando, quel legame si perde e il compilatore non può più
     sapere che dentro `case 'between'` il valore è una coppia — che è
     esattamente la cosa che si vorrebbe sapesse. */
  _where(collection: Collezione, criteria?: Criterio | null): Collection<any, any> {
    if (!criteria?.field || !criteria.op) throw new Error('Criterio incompleto: servono field e op');
    const clause = this._table(collection).where(criteria.field);
    switch (criteria.op) {
      case 'equals':     return clause.equals(criteria.value);
      /* `as string` e non `String(…)`: il criterio dichiara che il valore può
         essere anche un numero, ma `startsWith` di un numero non esiste e
         nessuno lo chiama così. Aggiungere la conversione significherebbe
         cambiare il codice per far tornare i conti a un tipo — la decisione
         §3.8 dell'HANDOFF dice il contrario, ed è la stessa scelta già fatta
         in utils.ts. */
      case 'startsWith': return clause.startsWith(criteria.value as string);
      case 'below':      return clause.below(criteria.value);
      /* v2.8.0 [H2] — I due criteri che servono a leggere il registro per
         intervallo di date senza tirarselo tutto in memoria. Restano gli
         unici aggiunti: ogni operatore in piu' e' un impegno che il futuro
         adapter remoto dovra' onorare. */
      case 'aboveOrEqual': return clause.aboveOrEqual(criteria.value);
      case 'between':      return clause.between(criteria.value[0], criteria.value[1], true, true);
      /* Irraggiungibile per chi compila, non per chi chiama: Store è ancora
         JavaScript e può passare qualunque cosa. Il ramo resta. */
      default: throw new Error(`Operatore non supportato: ${(criteria as Criterio).op}`);
    }
  },

  async open(): Promise<void> {
    await db.open();
  },

  /* Idratazione iniziale. Restituisce le collezioni GREZZE: trasformarle
     in Map, Set od oggetti e' una scelta di rappresentazione della cache,
     quindi appartiene a Store. Se la facesse l'adapter, ogni nuovo
     adapter dovrebbe conoscere la forma interna della cache.

     v2.8.0 [H2] — Il registro movimenti NON arriva piu' per intero. Il
     chiamante passa `movLogFrom` (timestamp) e riceve solo i movimenti da
     quell'istante in poi. E' l'unica collezione che cresce senza limite: le
     altre sono fotografie del presente e restano piccole per costruzione.

     `movLogTotal` accompagna la finestra perche' l'interfaccia deve poter
     dire quanti movimenti ci sono DAVVERO in archivio, non quanti se ne
     stanno tenendo in mano. */
  async loadAll({ movLogFrom = null }: { movLogFrom?: Istante | null } = {}) {
    const movLogQuery = movLogFrom === null
      ? db.mov_log.orderBy('ts').reverse().toArray()
      : db.mov_log.where('ts').aboveOrEqual(movLogFrom).reverse().toArray();
    const [sites, zones, articles, inventory, locStatus, disabled,
           movLog, movLogTotal, quarantine, pendingOut, meta, pickSession, pickArchive,
           disposalArchive, operators] =
      await Promise.all([
        db.sites.toArray(),
        db.zones.toArray(),
        db.articles.toArray(),
        db.inventory.toArray(),
        db.loc_status.toArray(),
        db.disabled.toArray(),
        movLogQuery,
        db.mov_log.count(),
        db.quarantine.toArray(),
        db.pending_outbound.orderBy('created_at').reverse().toArray(),
        db.meta.toArray(),
        db.pick_session.toArray(),
        db.pick_archive.orderBy('closed_at').reverse().toArray(),
        db.disposal_archive.orderBy('created_at').reverse().toArray(),   // v3.0.0 [M2]
        db.operators.toArray()                       // v2.7.0 [G6]
      ]);
    return { sites, zones, articles, inventory, locStatus, disabled,
             movLog, movLogTotal, quarantine, pendingOut, meta, pickSession, pickArchive,
             disposalArchive, operators };
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.8.0 [H3] — GUARDIA SULLE SCRITTURE
     © Andrea Sacchetti — Dietopack S.r.l.

     Fino alla v2.7.0 QuotaExceededError non era gestito in nessun punto del
     file: a disco pieno una scrittura falliva, la promise veniva rifiutata e
     l'errore finiva nella console, dove nessuno guarda. Il caso peggiore e'
     documentato in [H3] del changelog: giacenza spostata, movimento non
     registrato, nessun avviso.

     Ogni scrittura passa ora di qui. Il compito e' minimo e preciso:
     riconoscere l'esaurimento dello spazio, tradurlo in un errore che dice
     cosa e' successo, e alzare una bandiera che l'interfaccia possa vedere.
     Chi decide cosa fare resta il chiamante — questo strato non nasconde
     nulla e non ritenta niente da solo.
     ═══════════════════════════════════════════════════════════════════ */
  diskFull: false,

  /* `any` e non `unknown`, di proposito: quello che una promise rifiuta non
     ha un tipo. Può essere un DOMException, un errore di Dexie che si porta
     dentro l'originale in `inner`, o una stringa. Scrivere `unknown` e poi
     restringere a mano tre volte direbbe la stessa cosa in venti righe. */
  _isQuotaError(err: any): boolean {
    return err?.name === 'QuotaExceededError'
        || err?.inner?.name === 'QuotaExceededError'
        || /quota/i.test(err?.message || '');
  },

  async _guard<T>(collection: Collezione, op: string, fn: () => PromiseLike<T> | T): Promise<T> {
    try {
      const out = await fn();
      this.diskFull = false;
      return out;
    } catch (err) {
      if (this._isQuotaError(err)) {
        this.diskFull = true;
        const e = new Error(`Spazio di archiviazione esaurito: impossibile scrivere in "${collection}". Liberare spazio o esportare e ridurre l’archivio.`) as ErroreScrittura;
        e.code = 'DISK_FULL';
        e.cause = err;
        throw e;
      }
      const e = new Error(`Scrittura non riuscita su "${collection}" (${op}): ${(err as Error)?.message || 'errore sconosciuto'}`) as ErroreScrittura;
      e.code = 'WRITE_FAILED';
      e.cause = err;
      throw e;
    }
  },

  /* -- Scritture singole -- */
  async add<T>(collection: Collezione, record: T) {
    return await this._guard(collection, 'add', () => this._table(collection).add(record));
  },

  async put<T>(collection: Collezione, record: T) {
    return await this._guard(collection, 'put', () => this._table(collection).put(record));
  },

  async update(collection: Collezione, key: string | number, changes: Record<string, unknown>) {
    return await this._guard(collection, 'update', () => this._table(collection).update(key, changes));
  },

  async delete(collection: Collezione, key: string | number) {
    return await this._guard(collection, 'delete', () => this._table(collection).delete(key));
  },

  /* -- Scritture in blocco -- */
  async bulkAdd<T>(collection: Collezione, records: T[]) {
    if (!records?.length) return 0;
    return await this._guard(collection, 'bulkAdd', () => this._table(collection).bulkAdd(records));
  },

  async bulkPut<T>(collection: Collezione, records: T[]) {
    if (!records?.length) return 0;
    return await this._guard(collection, 'bulkPut', () => this._table(collection).bulkPut(records));
  },

  /* -- Svuotamento -- */
  async clear(collection: Collezione) {
    return await this._table(collection).clear();
  },

  /* Svuotamento di piu' collection. Esiste come metodo proprio perche'
     reset e import le azzerano tutte insieme dentro un'unica transazione:
     con un backend sara' una sola chiamata, non dodici. */
  async clearMany(collections: Collezione[]) {
    await Promise.all(collections.map(c => this.clear(c)));
  },

  /* v2.8.0 — Lettura di un singolo record per chiave primaria. Serve ai
     valori di configurazione che non vivono nella cache perche' non sono
     dati di magazzino: l'handle della cartella di backup, i suoi timestamp. */
  async get<T>(collection: Collezione, key: string | number): Promise<T | undefined> {
    return await this._table(collection).get(key);
  },

  /* -- Query dichiarative -- */
  async count(collection: Collezione, criteria: Criterio | null = null): Promise<number> {
    return criteria
      ? await this._where(collection, criteria).count()
      : await this._table(collection).count();
  },

  /* v2.8.0 [H1] — Conteggio di TUTTE le collection in un colpo solo.
     Serve al checkpoint verificato: confrontare quanti record crede di avere
     la cache con quanti ne ha davvero il supporto costa due ordini di
     grandezza meno che riscriverli tutti, e dice qualcosa di piu' utile. */
  async countAll(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    await Promise.all(this.COLLECTIONS.map(async c => { out[c] = await this.count(c); }));
    return out;
  },

  /* v2.8.0 [H2] — Lettura per criterio con ordinamento e paginazione.
     `reverse` opera sull'indice, non su un array gia' materializzato: e' la
     differenza fra scorrere 2.000 record e caricarne un milione per poi
     buttarne via 998.000. */
  async query<T>(collection: Collezione, { criteria = null, limit = null, offset = 0, reverse = false }: OpzioniQuery = {}): Promise<T[]> {
    let coll = criteria ? this._where(collection, criteria) : this._table(collection).toCollection();
    if (reverse) coll = coll.reverse();
    if (offset) coll = coll.offset(offset);
    if (limit !== null) coll = coll.limit(limit);
    return await coll.toArray();
  },

  /** Scorrimento a blocchi, senza mai tenere in memoria piu' di `chunkSize`
     record. E' cosi' che l'export attraversa sei anni di archivio su una
     macchina che non ha sei anni di archivio di RAM libera.

     Il valore predefinito `criteria = null` da solo farebbe dedurre che null
     sia l'unica cosa ammessa; il criterio va dichiarato.

     [2] `fn(rows)` e non più `fn(rows, off, total)`. Il contratto ha sempre
     dichiarato una callback da un argomento solo, l'adapter remoto ne ha
     sempre passato uno solo, e nessuno dei tre chiamanti — export Excel,
     export JSON, backup del Vault — ha mai letto il secondo o il terzo. Erano
     due argomenti che esistevano su un adapter e non sull'altro: chi ci si
     fosse appoggiato avrebbe scritto codice che funzionava aprendo il file
     dal disco e non aprendolo dal servizio. */
  async eachChunk<T>(
    collection: Collezione,
    { criteria = null, chunkSize = 5000 }: { criteria?: Criterio | null, chunkSize?: number } = {},
    fn: (blocco: T[]) => void | Promise<void>,
  ): Promise<number> {
    const total = criteria
      ? await this._where(collection, criteria).count()
      : await this._table(collection).count();
    for (let off = 0; off < total; off += chunkSize) {
      const base = criteria ? this._where(collection, criteria) : this._table(collection).toCollection();
      const rows = await base.offset(off).limit(chunkSize).toArray();
      if (!rows.length) break;
      await fn(rows);
    }
    return total;
  },

  async deleteWhere(collection: Collezione, criteria: Criterio) {
    return await this._where(collection, criteria).delete();
  },

  /* -- Transazione atomica --
     `collections` sono NOMI, non tabelle: il chiamante non deve conoscere
     l'oggetto Dexie. Il fallimento del corpo annulla tutto. */
  async transaction<T>(collections: Collezione[], fn: () => Promise<T>): Promise<T> {
    return await db.transaction('rw', this._tables(collections), fn);
  },

  /* ═══════════════════════════════════════════════════════════════════
     SPAZIO OCCUPATO E BACKUP LOCALE
     © Andrea Sacchetti — Dietopack S.r.l.

     Sono capacita' del SUPPORTO, non della logica applicativa: la quota
     disponibile e il file system privato dell'origine esistono nel
     browser e non esisteranno sul server, dove il backup sara' un compito
     del servizio (Fase 5). Vivono quindi qui, dietro
     supportsLocalBackup, e Store conserva soltanto la POLITICA: ogni
     quanto fare il backup, quante copie tenere, quando saltarlo.

     Il comportamento e' quello della v2.5.1, riga per riga. Nessuna
     modifica: solo un cambio di indirizzo.
     ═══════════════════════════════════════════════════════════════════ */

  async estimateUsage() {
    if (!navigator.storage?.estimate) return null;
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0, pct: est.quota ? ((est.usage || 0) / est.quota * 100) : 0 };
    } catch { return null; }
  },

  BACKUP_DIR: 'backups',

  /* Verifica se OPFS e' supportato dal browser (Chromium/Firefox/Safari recenti).

     [3] I due punti esclamativi sono nuovi. La catena di `&&` restituiva il
     `navigator.storage` di mezzo quando `getDirectory` non c'era: un oggetto,
     non `false`. Nessuno se ne è mai accorto perché il valore viene sempre
     letto dentro un `if`, dove un oggetto vale quanto `true`... ed è proprio
     lì il punto: la funzione dice di rispondere sì o no, e in un caso su tre
     rispondeva «ecco lo StorageManager». Il contratto diceva `boolean` dal
     primo giorno; il codice non lo rispettava, e nessun collaudo poteva
     accorgersene perché il difetto era invisibile a chi lo usava bene. */
  isBackupSupported(): boolean {
    return typeof navigator !== 'undefined'
        && !!navigator.storage
        && typeof navigator.storage.getDirectory === 'function';
  },

  /* Apre/crea la directory backups dentro OPFS. */
  async _getBackupDir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(this.BACKUP_DIR, { create: true });
  },

  /* Scrive il contenuto gia' serializzato. Che cosa ci sia dentro il file
     non riguarda l'adapter: e' Store a decidere che cosa sia un backup. */
  async writeBackup(filename: string, contents: string) {
    if (!this.isBackupSupported()) throw new Error('OPFS non supportato dal browser');
    const dir = await this._getBackupDir();
    const handle = await dir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return { filename, size: contents.length };
  },

  async listBackups(prefix = 'wm-auto-') {
    if (!this.isBackupSupported()) return [];
    try {
      const dir = await this._getBackupDir();
      const list: { name: string, size: number, lastModified: number }[] = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind !== 'file' || !name.startsWith(prefix)) continue;
        const file = await handle.getFile();
        list.push({ name, size: file.size, lastModified: file.lastModified });
      }
      list.sort((a, b) => b.lastModified - a.lastModified);
      return list;
    } catch (err) {
      console.warn('[WM] OPFS listBackups error:', err);
      return [];
    }
  },

  async deleteBackup(filename: string) {
    const dir = await this._getBackupDir();
    try { await dir.removeEntry(filename); return true; } catch { return false; }
  },

  async readBackup(filename: string) {
    if (!this.isBackupSupported()) throw new Error('OPFS non supportato');
    const dir = await this._getBackupDir();
    const handle = await dir.getFileHandle(filename);
    const file = await handle.getFile();
    return await file.text();
  }
};

export { LocalPersistence };
