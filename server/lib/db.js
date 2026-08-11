'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { COLLECTIONS, NAMES, createSQL, materialize } = require('./schema');

class PathfinderDB {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new Database(file);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    for (const name of NAMES) for (const sql of createSQL(name)) this.db.exec(sql);

    /* Il registro delle revisioni non e' una collezione dell'applicativo:
       e' un fatto del supporto, e sta in una tabella sua. */
    this.db.exec(`CREATE TABLE IF NOT EXISTS _revision (
      rev INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      collections TEXT NOT NULL,
      origin TEXT
    )`);

    this._listeners = new Set();
    this._txDepth = 0;
    this._txTouched = null;
  }

  /* ── Revisione e notifica ─────────────────────────────────────────── */

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  currentRevision() {
    const r = this.db.prepare('SELECT MAX(rev) AS r FROM _revision').get();
    return r?.r || 0;
  }

  _touch(collections, origin) {
    const list = Array.isArray(collections) ? collections : [collections];
    if (this._txDepth > 0) { for (const c of list) this._txTouched.add(c); return; }
    this._emit(list, origin);
  }

  _emit(list, origin) {
    const info = this.db.prepare('INSERT INTO _revision(ts, collections, origin) VALUES(?,?,?)')
      .run(Date.now(), JSON.stringify(list), origin || null);
    const ev = { rev: Number(info.lastInsertRowid), collections: list, origin: origin || null, ts: Date.now() };
    for (const fn of this._listeners) { try { fn(ev); } catch (e) { console.error('[pathfinder] listener:', e); } }
    return ev;
  }

  /* ── Utilita' ─────────────────────────────────────────────────────── */

  _col(name) {
    const c = COLLECTIONS[name];
    if (!c) throw Object.assign(new Error(`Collezione sconosciuta: ${name}`), { status: 400 });
    return c;
  }

  _row(name, record) {
    const col = this._col(name);
    const mat = materialize(name, record);
    const cols = Object.keys(mat);
    return { col, mat, cols };
  }

  _hydrate(name, row) {
    if (!row) return null;
    const col = COLLECTIONS[name];
    const doc = JSON.parse(row.data);
    doc[col.pk] = row[col.pk];
    return doc;
  }

  /* ── Scritture ────────────────────────────────────────────────────── */

  add(name, record, origin) {
    const { col, mat, cols } = this._row(name, record);
    if (col.pkType === 'auto') {
      const sql = `INSERT INTO ${name} (${[...cols, 'data'].join(', ')}) VALUES (${[...cols, 'data'].map(() => '?').join(', ')})`;
      const { [col.pk]: _drop, ...clean } = record;
      const info = this.db.prepare(sql).run(...cols.map(c => mat[c]), JSON.stringify(clean));
      this._touch(name, origin);
      return Number(info.lastInsertRowid);
    }
    const key = record[col.pk];
    if (key === undefined || key === null || key === '')
      throw Object.assign(new Error(`${name}: chiave ${col.pk} mancante`), { status: 400 });
    const all = [col.pk, ...cols, 'data'];
    const sql = `INSERT INTO ${name} (${all.join(', ')}) VALUES (${all.map(() => '?').join(', ')})`;
    this.db.prepare(sql).run(String(key), ...cols.map(c => mat[c]), JSON.stringify(record));
    this._touch(name, origin);
    return key;
  }

  put(name, record, origin) {
    const { col, mat, cols } = this._row(name, record);
    const key = record[col.pk];
    if (key === undefined || key === null || key === '') return this.add(name, record, origin);
    const { [col.pk]: _drop, ...clean } = record;
    const all = [col.pk, ...cols, 'data'];
    const sql = `INSERT INTO ${name} (${all.join(', ')}) VALUES (${all.map(() => '?').join(', ')})
                 ON CONFLICT(${col.pk}) DO UPDATE SET ${[...cols, 'data'].map(c => `${c}=excluded.${c}`).join(', ')}`;
    const bindKey = col.pkType === 'auto' ? Number(key) : String(key);
    this.db.prepare(sql).run(bindKey, ...cols.map(c => mat[c]),
      JSON.stringify(col.pkType === 'auto' ? clean : record));
    this._touch(name, origin);
    return key;
  }

  update(name, key, changes, origin) {
    const col = this._col(name);
    const cur = this.get(name, key);
    if (!cur) return 0;
    const next = { ...cur, ...changes };
    this.put(name, next, origin);
    return 1;
  }

  delete(name, key, origin) {
    const col = this._col(name);
    const bind = col.pkType === 'auto' ? Number(key) : String(key);
    const info = this.db.prepare(`DELETE FROM ${name} WHERE ${col.pk} = ?`).run(bind);
    if (info.changes) this._touch(name, origin);
    return info.changes;
  }

  bulkAdd(name, records, origin) {
    const keys = [];
    this.transaction([name], () => { for (const r of records) keys.push(this.add(name, r, origin)); }, origin);
    return keys;
  }

  bulkPut(name, records, origin) {
    const keys = [];
    this.transaction([name], () => { for (const r of records) keys.push(this.put(name, r, origin)); }, origin);
    return keys;
  }

  clear(name, origin) {
    this._col(name);
    const info = this.db.prepare(`DELETE FROM ${name}`).run();
    this._touch(name, origin);
    return info.changes;
  }

  clearMany(names, origin) {
    this.transaction(names, () => { for (const n of names) this.clear(n, origin); }, origin);
  }

  /* ── Letture ──────────────────────────────────────────────────────── */

  get(name, key) {
    const col = this._col(name);
    const bind = col.pkType === 'auto' ? Number(key) : String(key);
    return this._hydrate(name, this.db.prepare(`SELECT * FROM ${name} WHERE ${col.pk} = ?`).get(bind));
  }

  all(name) {
    return this.db.prepare(`SELECT * FROM ${name}`).all().map(r => this._hydrate(name, r));
  }

  _where(name, criteria) {
    if (!criteria) return { sql: '', args: [] };
    const col = this._col(name);
    const materialized = new Set([col.pk, ...col.indexed]);
    const f = criteria.field;
    if (!materialized.has(f))
      throw Object.assign(new Error(`${name}: il campo "${f}" non e' indicizzato e non puo' filtrare`), { status: 400 });
    const c = f === col.pk ? col.pk : f;
    switch (criteria.op) {
      case 'equals':      return { sql: ` WHERE ${c} = ?`, args: [criteria.value] };
      case 'notEquals':   return { sql: ` WHERE ${c} <> ?`, args: [criteria.value] };
      case 'startsWith':  return { sql: ` WHERE ${c} LIKE ? ESCAPE '\\'`,
                                   args: [String(criteria.value).replace(/[%_\\]/g, m => '\\' + m) + '%'] };
      case 'below':       return { sql: ` WHERE ${c} < ?`, args: [criteria.value] };
      case 'belowOrEqual':return { sql: ` WHERE ${c} <= ?`, args: [criteria.value] };
      case 'above':       return { sql: ` WHERE ${c} > ?`, args: [criteria.value] };
      case 'aboveOrEqual':return { sql: ` WHERE ${c} >= ?`, args: [criteria.value] };
      case 'between':     return { sql: ` WHERE ${c} >= ? AND ${c} <= ?`, args: [criteria.value[0], criteria.value[1]] };
      case 'anyOf':       return { sql: ` WHERE ${c} IN (${criteria.value.map(() => '?').join(',')})`, args: criteria.value };
      default:
        throw Object.assign(new Error(`Operatore di criterio sconosciuto: ${criteria.op}`), { status: 400 });
    }
  }

  count(name, criteria = null) {
    const w = this._where(name, criteria);
    return this.db.prepare(`SELECT COUNT(*) AS c FROM ${name}${w.sql}`).get(...w.args).c;
  }

  countAll() {
    const out = {};
    for (const n of NAMES) out[n] = this.count(n);
    return out;
  }

  query(name, { criteria = null, limit = null, offset = 0, reverse = false, orderBy = null } = {}) {
    const col = this._col(name);
    const w = this._where(name, criteria);
    const ord = orderBy && (orderBy === col.pk || col.indexed.includes(orderBy)) ? orderBy : col.pk;
    let sql = `SELECT * FROM ${name}${w.sql} ORDER BY ${ord} ${reverse ? 'DESC' : 'ASC'}`;
    const args = [...w.args];
    if (limit != null) { sql += ' LIMIT ?'; args.push(limit); }
    if (offset) { sql += ' OFFSET ?'; args.push(offset); }
    return this.db.prepare(sql).all(...args).map(r => this._hydrate(name, r));
  }

  deleteWhere(name, criteria, origin) {
    const w = this._where(name, criteria);
    const info = this.db.prepare(`DELETE FROM ${name}${w.sql}`).run(...w.args);
    if (info.changes) this._touch(name, origin);
    return info.changes;
  }

  /* ── Transazioni ──────────────────────────────────────────────────── */

  transaction(collections, fn, origin) {
    if (this._txDepth > 0) { for (const c of collections) this._txTouched.add(c); return fn(); }
    this._txDepth = 1;
    this._txTouched = new Set(collections);
    try {
      const out = this.db.transaction(fn)();
      const touched = [...this._txTouched];
      this._txDepth = 0; this._txTouched = null;
      if (touched.length) this._emit(touched, origin);
      return out;
    } catch (err) {
      this._txDepth = 0; this._txTouched = null;
      throw err;
    }
  }

  /* ── Caricamento iniziale ─────────────────────────────────────────── */

  loadAll({ movLogFrom = null } = {}) {
    const out = {};
    for (const n of NAMES) {
      if (n === 'mov_log') continue;
      out[n] = this.all(n);
    }
    out.mov_log = movLogFrom == null
      ? this.query('mov_log', { reverse: true, orderBy: 'ts' })
      : this.query('mov_log', { criteria: { field: 'ts', op: 'aboveOrEqual', value: movLogFrom }, reverse: true, orderBy: 'ts' });
    out._movLogTotal = this.count('mov_log');
    out._revision = this.currentRevision();
    return out;
  }

  /* ── Manutenzione ─────────────────────────────────────────────────── */

  stats() {
    const counts = this.countAll();
    let bytes = 0;
    try { bytes = fs.statSync(this.file).size; } catch {}
    return { file: this.file, bytes, counts, revision: this.currentRevision() };
  }

  backupTo(destFile) {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    return this.db.backup(destFile);
  }

  close() { this.db.close(); }
}

module.exports = { PathfinderDB };
