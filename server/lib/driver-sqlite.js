'use strict';

/* IL DRIVER SQLITE — 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   E' QUELLO IN SERVIZIO, e resta la via di casa: senza `PATHFINDER_PG` il
   servizio apre questo e si comporta come la 2.5. La 2.6 si installa in
   magazzino senza toccare il database, e il passaggio a PostgreSQL diventa
   un secondo gesto, separato e reversibile.

   `better-sqlite3` E' SINCRONO, e questa interfaccia no. Le promesse qui
   dentro si risolvono subito — non c'e' nessun lavoro asincrono vero — ma
   l'interfaccia deve essere la stessa dell'altro driver, o le rotte
   dovrebbero sapere quale database c'e' dietro. */

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { DriverBase } = require('./driver-base');
const { COLLECTIONS, NAMES, createTableSQL, createIndexSQL } = require('./schema');
const { SQLITE } = require('./sql');

class DriverSqlite extends DriverBase {
  constructor(file) {
    super(SQLITE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new Database(file);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    /* Tre passi in quest'ordine, e l'ordine e' il punto.
       Le tabelle che mancano si creano; le colonne indicizzate che mancano a
       una tabella che esiste gia' si aggiungono; solo dopo gli indici. */
    for (const nome of NAMES) this.db.exec(createTableSQL(nome));
    this.migrazioni = this._migra();
    for (const nome of NAMES) for (const sql of createIndexSQL(nome)) this.db.exec(sql);

    /* Il registro delle revisioni non e' una collezione dell'applicativo:
       e' un fatto del supporto, e sta in una tabella sua. */
    this.db.exec(`CREATE TABLE IF NOT EXISTS _revision (
      rev INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      collections TEXT NOT NULL,
      origin TEXT
    )`);
  }

  /* PERCHE' ESISTE: `CREATE TABLE IF NOT EXISTS` su una tabella che c'e'
     gia' non fa niente — nemmeno aggiungere una colonna nuova. Il
     `CREATE INDEX` successivo cerca una colonna che non esiste, muore nel
     costruttore, e il servizio non parte affatto: i terminali vedono bianco
     e il magazzino si ferma. E' un difetto provato, non dedotto.

     PERCHE' E' SICURA: la colonna indicizzata e' una COPIA materializzata,
     non la sorgente. Il valore vero e' gia' nel JSON di `data`, quindi qui
     non si travasa niente — si ricostruisce un indice. */
  _migra() {
    const fatte = [];
    for (const nome of NAMES) {
      const col = COLLECTIONS[nome];
      const esiste = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nome);
      if (!esiste) continue;
      const presenti = new Set(this.db.prepare(`PRAGMA table_info(${nome})`).all().map(c => c.name));
      for (const campo of col.indexed) {
        if (campo === col.pk || presenti.has(campo)) continue;
        const tipo = (col.numeric || []).includes(campo) ? 'INTEGER' : 'TEXT';
        this.db.exec(`ALTER TABLE ${nome} ADD COLUMN ${campo} ${tipo}`);
        const info = this.db.prepare(`UPDATE ${nome} SET ${campo} = json_extract(data, '$.${campo}')`).run();
        fatte.push({ collezione: nome, campo, righe: info.changes });
      }
    }
    if (fatte.length) {
      console.log('[pathfinder] migrazione schema:',
        fatte.map(f => `${f.collezione}.${f.campo} (${f.righe} righe)`).join(' · '));
    }
    return fatte;
  }

  /** Come si chiama questo database, per chi legge una riga di avvio. */
  get descrizione() { return `SQLite — ${this.file}`; }

  /* ── I quattro gesti ───────────────────────────────────────────────── */

  async _esegui(sql, args) {
    return this.db.prepare(sql).run(...args).changes;
  }

  async _righe(sql, args) {
    const st = this.db.prepare(sql);
    /* `.all()` su un'istruzione che non restituisce colonne solleva; una
       INSERT con RETURNING invece le restituisce, ed e' come si leggono le
       chiavi appena scritte. */
    if (!st.reader) { st.run(...args); return []; }
    return st.all(...args);
  }

  async _iniziaTx() { this.db.exec('BEGIN IMMEDIATE'); }
  async _confermaTx() { this.db.exec('COMMIT'); }
  async _annullaTx() { if (this.db.inTransaction) this.db.exec('ROLLBACK'); }

  /* ── Manutenzione ──────────────────────────────────────────────────── */

  async stats() {
    const conti = await this.countAll();
    let byte = 0;
    try { byte = fs.statSync(this.file).size; } catch { /* il file puo' non esserci ancora */ }
    return { file: this.file, bytes: byte, counts: conti, revision: await this.currentRevision() };
  }

  async backupTo(destinazione) {
    fs.mkdirSync(path.dirname(destinazione), { recursive: true });
    return this.db.backup(destinazione);
  }

  async close() { this.db.close(); }
}

module.exports = { DriverSqlite };
