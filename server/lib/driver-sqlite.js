'use strict';

/* IL DRIVER SQLITE - 2.2.
   (c) Andrea Sacchetti - Dietopack S.r.l. (Naturacare Group)

   E' il comportamento DI RIFERIMENTO: quello che il servizio ha sempre
   fatto, messo dietro un'interfaccia asincrona perche' ci stia accanto
   quello per SQL Server. Se i due divergono, ha ragione questo - e lo dice
   `test/collaudo.js`, che gira su questo.

   PERCHE' ASINCRONO SE SQLITE E' SINCRONO. Non e' per far finta: e' che
   `lib/db.js` deve avere UNA forma sola, e la forma la detta il driver che
   non puo' essere sincrono. Qui le promesse si risolvono subito e non
   costano niente di misurabile; di la' sono giri di rete veri. Il prezzo di
   questa scelta e' che `await` compare in 52 punti del servizio; il prezzo
   di NON farla sarebbe due servizi da tenere allineati a mano.

   LA TRAPPOLA CHE QUESTA FORMA APRE, ed e' chiusa in `db.js` e non qui: con
   un driver sincrono e le transazioni scritte a mano - `BEGIN`, `COMMIT` -
   due richieste possono infilarsi una dentro l'altra fra due `await`. Node
   e' a un filo solo, ma un `await` cede il turno. `db.js` serializza le
   transazioni con una coda, ed e' il motivo per cui quella coda esiste. */

const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const { NAMES, createTableSQL, createIndexSQL } = require('./schema');

class DriverSqlite {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.dialetto = 'sqlite';
    this.file = file;
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
  }

  /** SQLite non ha bisogno di quotare, e non quotare tiene le query
      leggibili in un `EXPLAIN`. La forma pero' e' la stessa di la', perche'
      `db.js` scrive una volta sola per tutti e due. */
  q(nome) { return nome; }

  async exec(sql) { this.db.exec(sql); }

  async run(sql, args = []) {
    const info = this.db.prepare(sql).run(...args);
    return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
  }

  async get(sql, args = []) { return this.db.prepare(sql).get(...args); }
  async all(sql, args = []) { return this.db.prepare(sql).all(...args); }

  async begin()    { this.db.exec('BEGIN'); }
  async commit()   { this.db.exec('COMMIT'); }
  async rollback() { try { this.db.exec('ROLLBACK'); } catch { /* gia' chiusa */ } }

  /* ── Schema ─────────────────────────────────────────────────────────
     Tre passi in quest'ordine, e l'ordine e' il punto: le tabelle che
     mancano si creano; le colonne indicizzate che mancano a una tabella che
     esiste gia' si aggiungono (`db.js`, `_migra`); solo dopo gli indici. */

  async creaTabelle() { for (const n of NAMES) this.db.exec(createTableSQL(n)); }
  async creaIndici()  { for (const n of NAMES) for (const s of createIndexSQL(n)) this.db.exec(s); }

  async creaRevisioni() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS _revision (
      rev INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      collections TEXT NOT NULL,
      origin TEXT
    )`);
  }

  async tabellaEsiste(nome) {
    return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nome);
  }

  async colonnePresenti(nome) {
    return new Set(this.db.prepare(`PRAGMA table_info(${nome})`).all().map(c => c.name));
  }

  /* La colonna nuova nasce vuota e si riempie dal documento: il valore vero
     e' gia' in `data`, qui non si travasa niente - si ricostruisce un
     indice. In SQLite `ADD COLUMN` tocca i metadati, non le righe. */
  async aggiungiColonna(nome, campo, numerica) {
    this.db.exec(`ALTER TABLE ${nome} ADD COLUMN ${campo} ${numerica ? 'INTEGER' : 'TEXT'}`);
    const info = this.db.prepare(`UPDATE ${nome} SET ${campo} = json_extract(data, '$.${campo}')`).run();
    return info.changes;
  }

  /* ── I pezzi di SQL che cambiano da un motore all'altro ────────────── */

  /** L'inserimento che aggiorna se la chiave c'e' gia'. */
  upsertSQL(nome, pk, colonne) {
    const tutte = [pk, ...colonne, 'data'];
    return `INSERT INTO ${nome} (${tutte.join(', ')}) VALUES (${tutte.map(() => '?').join(', ')})
            ON CONFLICT(${pk}) DO UPDATE SET ${[...colonne, 'data'].map(c => `${c}=excluded.${c}`).join(', ')}`;
  }

  /** La coda di una SELECT ordinata. */
  paginazioneSQL(limit, offset) {
    let sql = '';
    const args = [];
    if (limit != null) { sql += ' LIMIT ?'; args.push(limit); }
    if (offset) { sql += ' OFFSET ?'; args.push(offset); }
    return { sql, args };
  }

  /** Scrivere una chiave automatica a mano: qui non serve permesso. */
  async conChiaviEsplicite(_nome, fn) { return fn(); }

  /* ── Manutenzione ───────────────────────────────────────────────────── */

  async byteSuDisco() {
    try { return fs.statSync(this.file).size; } catch { return 0; }
  }

  /** La copia a caldo. E' un gesto che esiste SOLO qui: il dato e' un file. */
  async backupTo(destFile) {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    return this.db.backup(destFile);
  }

  async close() { this.db.close(); }
}

module.exports = { DriverSqlite };
