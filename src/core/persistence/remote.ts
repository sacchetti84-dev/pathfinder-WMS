import { CHIAVE_PRIMARIA, COLLEZIONI } from '../../types/collezioni.js';
import type { Collezione } from '../../types/collezioni.js';
import type { Criterio, OpzioniQuery } from '../../types/contratto.js';
import type { Istante } from '../../types/entita.js';

/* Un errore che viene dal servizio porta con sé lo stato HTTP e la
   distinzione fra «il server ha detto di no» e «il server non ha risposto». */
type ErroreServizio = Error & { status: number; isConflict: boolean };

type ScritturaInAttesa = { op: string; [campo: string]: unknown };

const RemotePersistence = {
  kind: 'remote' as const,

  supportsTransactions: true,
  supportsRealtime: true,
  supportsLocalBackup: false,   // il backup e' un compito del servizio
  supportsRemoteOps: true,      // le operazioni di dominio stanno sul server

  COLLECTIONS: COLLEZIONI,

  base: '',

  clientId: 'PF-' + Math.random().toString(36).slice(2, 10).toUpperCase(),

  _tx: null as { collections: Collezione[], ops: ScritturaInAttesa[] } | null,  // buffer delle scritture dentro una transazione
  _online: true,
  _onOffline: null as ((err: unknown) => void) | null,   // callback verso App: il servizio non risponde
  _onChange: null as ((ev: unknown) => void) | null,     // callback verso App: qualcun altro ha scritto
  _es: null as EventSource | null,                       // il flusso di eventi aperto

  /* Diagnostica: chi risponde e su quale file sta lavorando. Non entrano in
     nessuna decisione — si leggono quando qualcosa non torna. */
  serverVersion: null as string | null,
  dbFile: null as string | null,
  revision: null as number | null,

  // ── Trasporto ────────────────────────────────────────────────────

  async _call(method: string, path: string, body?: unknown, { raw = false }: { raw?: boolean } = {}): Promise<any> {
    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Pathfinder-Client': this.clientId },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (err) {
      this._goOffline(err);
      throw new Error('Servizio dati non raggiungibile');
    }
    if (!this._online) this._goOnline();

    if (res.status === 404 && raw) return null;
    if (!res.ok) {
      let msg = `Errore ${res.status}`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
      const err = new Error(msg) as ErroreServizio;
      err.status = res.status;
      err.isConflict = res.status === 409;
      throw err;
    }
    if (res.status === 204) return null;
    return await res.json();
  },

  _goOffline(err: unknown) {
    if (!this._online) return;
    this._online = false;
    console.error('[pathfinder] servizio dati non raggiungibile:', (err as Error)?.message || err);
    this._onOffline?.(err);
  },

  _goOnline() {
    this._online = true;
    this._onOffline?.(null);
  },

  // ── Apertura e caricamento ───────────────────────────────────────

  async open() {
    const salute = await this._call('GET', '/api/health');
    this.serverVersion = salute.version;
    this.dbFile = salute.file;
    this._subscribe();
    return true;
  },

  async loadAll({ movLogFrom = null }: { movLogFrom?: Istante | null } = {}) {
    const qs = movLogFrom == null ? '' : `?movLogFrom=${encodeURIComponent(movLogFrom)}`;
    const d = await this._call('GET', '/api/load' + qs);
    this.revision = d._revision;
    /* Si restituisce la STESSA forma dell'adapter locale: dodici array
       piu' i due conteggi. Store non deve accorgersi di niente. */
    return {
      sites: d.sites, zones: d.zones, articles: d.articles, inventory: d.inventory,
      locStatus: d.loc_status, disabled: d.disabled,
      movLog: d.mov_log, movLogTotal: d._movLogTotal,
      quarantine: d.quarantine, pendingOut: d.pending_outbound,
      meta: d.meta, pickSession: d.pick_session,
      pickArchive: d.pick_archive, disposalArchive: d.disposal_archive,
      operators: d.operators
    };
  },

  // ── Scritture ────────────────────────────────────────────────────

  async add<T>(collection: Collezione, record: T) {
    if (this._tx) { this._tx.ops.push({ op: 'add', collection, record }); return undefined; }
    const r = await this._call('POST', `/api/c/${collection}`, record);
    return r.key;
  },

  async put<T>(collection: Collezione, record: T) {
    if (this._tx) { this._tx.ops.push({ op: 'put', collection, record }); return undefined; }
    const key = (record as Record<string, unknown>)[this._pk(collection)];
    const r = await this._call('PUT', `/api/c/${collection}/${encodeURIComponent(String(key ?? ''))}`, record);
    return r.key;
  },

  async update(collection: Collezione, key: string | number, changes: Record<string, unknown>) {
    if (this._tx) { this._tx.ops.push({ op: 'update', collection, key, changes }); return undefined; }
    const r = await this._call('PATCH', `/api/c/${collection}/${encodeURIComponent(key)}`, changes);
    return r.changed;
  },

  async delete(collection: Collezione, key: string | number) {
    if (this._tx) { this._tx.ops.push({ op: 'delete', collection, key }); return undefined; }
    const r = await this._call('DELETE', `/api/c/${collection}/${encodeURIComponent(key)}`);
    return r.deleted;
  },

  async bulkAdd<T>(collection: Collezione, records: T[]) {
    if (this._tx) { this._tx.ops.push({ op: 'bulkAdd', collection, records }); return undefined; }
    const r = await this._call('POST', `/api/c/${collection}/bulk?mode=add`, records);
    return r.keys;
  },

  async bulkPut<T>(collection: Collezione, records: T[]) {
    if (this._tx) { this._tx.ops.push({ op: 'bulkPut', collection, records }); return undefined; }
    const r = await this._call('POST', `/api/c/${collection}/bulk?mode=put`, records);
    return r.keys;
  },

  async clear(collection: Collezione) {
    if (this._tx) { this._tx.ops.push({ op: 'clear', collection }); return undefined; }
    const r = await this._call('DELETE', `/api/c/${collection}`);
    return r.deleted;
  },

  async clearMany(collections: Collezione[]) {
    if (this._tx) { this._tx.ops.push({ op: 'clearMany', collections }); return undefined; }
    await this._call('POST', '/api/clear', { collections });
  },

  async deleteWhere(collection: Collezione, criteria: Criterio) {
    if (this._tx) { this._tx.ops.push({ op: 'deleteWhere', collection, criteria }); return undefined; }
    const r = await this._call('POST', `/api/deleteWhere/${collection}`, criteria);
    return r.deleted;
  },

  // ── Letture ──────────────────────────────────────────────────────

  async get<T>(collection: Collezione, key: string | number): Promise<T | undefined> {
    return await this._call('GET', `/api/c/${collection}/${encodeURIComponent(key)}`, undefined, { raw: true });
  },

  async count(collection: Collezione, criteria: Criterio | null = null): Promise<number> {
    const qs = criteria ? `?criteria=${encodeURIComponent(JSON.stringify(criteria))}` : '';
    const r = await this._call('GET', `/api/c/${collection}/count${qs}`);
    return r.count;
  },

  async countAll(): Promise<Record<string, number>> {
    const s = await this._call('GET', '/api/health');
    return s.counts;
  },

  async query<T>(collection: Collezione, { criteria = null, limit = null, offset = 0, reverse = false, orderBy = null }: OpzioniQuery = {}): Promise<T[]> {
    const p = new URLSearchParams();
    if (criteria) p.set('criteria', JSON.stringify(criteria));
    if (limit != null) p.set('limit', String(limit));
    if (offset) p.set('offset', String(offset));
    if (reverse) p.set('reverse', 'true');
    if (orderBy) p.set('orderBy', orderBy);
    const qs = p.toString();
    return await this._call('GET', `/api/c/${collection}/query${qs ? '?' + qs : ''}`);
  },

  /** A blocchi, per non portare in memoria sei anni di registro. La
     paginazione la fa il server con LIMIT/OFFSET: qui si scorre. */
  async eachChunk<T>(
    collection: Collezione,
    { criteria = null, chunkSize = 5000 }: { criteria?: Criterio | null, chunkSize?: number } = {},
    fn: (blocco: T[]) => void | Promise<void>,
  ): Promise<number> {
    let offset = 0, totale = 0;
    for (;;) {
      const rows = await this.query<T>(collection, { criteria, limit: chunkSize, offset });
      if (!rows.length) break;
      await fn(rows);
      totale += rows.length;
      if (rows.length < chunkSize) break;
      offset += chunkSize;
    }
    return totale;
  },

  // ── Transazioni ──────────────────────────────────────────────────

  async transaction<T>(collections: Collezione[], fn: () => Promise<T>): Promise<T> {
    if (this._tx) return await fn();          // annidata: si unisce a quella di fuori
    this._tx = { collections, ops: [] };
    let out;
    try {
      out = await fn();
    } catch (err) {
      this._tx = null;
      throw err;
    }
    const { collections: cols, ops } = this._tx;
    this._tx = null;
    if (ops.length) await this._call('POST', '/api/tx', { collections: cols, ops });
    return out;
  },

  // ── Operazioni di dominio ────────────────────────────────────────

  async op<T>(nome: string, payload: unknown): Promise<T> {
    return await this._call('POST', `/api/op/${nome}`, payload);
  },

  // ── Avvisi dagli altri terminali ─────────────────────────────────

  _subscribe() {
    if (this._es) { try { this._es.close(); } catch {} }
    const es = new EventSource(`${this.base}/api/events?client=${encodeURIComponent(this.clientId)}`);
    this._es = es;
    es.addEventListener('hello', ((e: MessageEvent) => {
      try { this.revision = JSON.parse(e.data).rev; } catch {}
      this._goOnline();
    }) as EventListener);
    es.addEventListener('change', ((e: MessageEvent) => {
      let ev = null;
      try { ev = JSON.parse(e.data); } catch { return; }
      this.revision = ev.rev;
      this._onChange?.(ev);
    }) as EventListener);
    es.onerror = () => { if (es.readyState === EventSource.CLOSED || es.readyState === EventSource.CONNECTING) this._goOffline(new Error('flusso eventi interrotto')); };
  },

  // ── Spazio e backup ──────────────────────────────────────────────

  isBackupSupported(): boolean { return false; },

  async estimateUsage() {
    const s = await this._call('GET', '/api/health');
    return { usage: s.bytes, quota: null, pct: null, remote: true, file: s.file };
  },

  _pk(collection: Collezione): string { return CHIAVE_PRIMARIA[collection] || '_id'; }
};

export { RemotePersistence };
