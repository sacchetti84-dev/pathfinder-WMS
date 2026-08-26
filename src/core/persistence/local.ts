import type { Collection, Table } from 'dexie';
import { db } from '../schema';
import { COLLEZIONI } from '../../types/collezioni.js';
import type { Collezione } from '../../types/collezioni.js';
import type { Criterio, OpzioniQuery } from '../../types/contratto.js';
import type { Istante } from '../../types/entita.js';

type ErroreScrittura = Error & { code: 'DISK_FULL' | 'WRITE_FAILED'; cause: unknown };

const LocalPersistence = {
  /* Il commento non è decorativo: senza, il compilatore legge 'local' come una
     stringa qualunque e l'adapter non risulta più conforme al contratto. */
  kind: 'local' as const,

  supportsTransactions: true,
  supportsRealtime: false,
  supportsLocalBackup: true,

  COLLECTIONS: COLLEZIONI,

  _table(collection: Collezione): Table<any, any> {
    const t = db[collection];
    if (!t) throw new Error(`Collection sconosciuta: ${collection}`);
    return t;
  },

  _tables(collections: Collezione[]): Table<any, any>[] {
    return collections.map(c => this._table(c));
  },

  _where(collection: Collezione, criteria?: Criterio | null): Collection<any, any> {
    if (!criteria?.field || !criteria.op) throw new Error('Criterio incompleto: servono field e op');
    const clause = this._table(collection).where(criteria.field);
    switch (criteria.op) {
      case 'equals':     return clause.equals(criteria.value);
      case 'startsWith': return clause.startsWith(criteria.value as string);
      case 'below':      return clause.below(criteria.value);
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

  async loadAll({ movLogFrom = null }: { movLogFrom?: Istante | null } = {}) {
    const movLogQuery = movLogFrom === null
      ? db.mov_log.orderBy('ts').reverse().toArray()
      : db.mov_log.where('ts').aboveOrEqual(movLogFrom).reverse().toArray();
    const [sites, zones, articles, inventory, locStatus, disabled,
           movLog, movLogTotal, quarantine, pendingOut, meta, pickSession, pickArchive,
           disposalArchive, operators,
           lots, udc, tasks, wip, storageRules, recipients, locAttrs] =
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
        db.operators.toArray(),                      // v2.7.0 [G6]
        /* 1.4.0 — vuote finche' non si accende l'interruttore che le riguarda. */
        db.lots.toArray(),
        db.udc.toArray(),
        db.tasks.toArray(),
        db.wip.toArray(),
        db.storage_rules.toArray(),
        db.recipients.toArray(),
        db.location_attrs.toArray()
      ]);
    return { sites, zones, articles, inventory, locStatus, disabled,
             movLog, movLogTotal, quarantine, pendingOut, meta, pickSession, pickArchive,
             disposalArchive, operators,
             lots, udc, tasks, wip, storageRules, recipients, locAttrs };
  },

  diskFull: false,

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

  async clearMany(collections: Collezione[]) {
    await Promise.all(collections.map(c => this.clear(c)));
  },

  async get<T>(collection: Collezione, key: string | number): Promise<T | undefined> {
    return await this._table(collection).get(key);
  },

  /* -- Query dichiarative -- */
  async count(collection: Collezione, criteria: Criterio | null = null): Promise<number> {
    return criteria
      ? await this._where(collection, criteria).count()
      : await this._table(collection).count();
  },

  async countAll(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    await Promise.all(this.COLLECTIONS.map(async c => { out[c] = await this.count(c); }));
    return out;
  },

  async query<T>(collection: Collezione, { criteria = null, limit = null, offset = 0, reverse = false }: OpzioniQuery = {}): Promise<T[]> {
    let coll = criteria ? this._where(collection, criteria) : this._table(collection).toCollection();
    if (reverse) coll = coll.reverse();
    if (offset) coll = coll.offset(offset);
    if (limit !== null) coll = coll.limit(limit);
    return await coll.toArray();
  },

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

  async transaction<T>(collections: Collezione[], fn: () => Promise<T>): Promise<T> {
    return await db.transaction('rw', this._tables(collections), fn);
  },

  async estimateUsage() {
    if (!navigator.storage?.estimate) return null;
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0, pct: est.quota ? ((est.usage || 0) / est.quota * 100) : 0 };
    } catch { return null; }
  },

  BACKUP_DIR: 'backups',

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
