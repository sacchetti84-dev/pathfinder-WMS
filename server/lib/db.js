'use strict';

/* IL SERVIZIO DATI - 2.2, asincrono e con due motori sotto.
   (c) Andrea Sacchetti - Dietopack S.r.l. (Naturacare Group)

   FINO ALLA 2.1 ERANO 315 RIGHE DI SQLITE SINCRONO. Il 25/08 la migrazione a
   SQL Server e' stata confermata (voce 36), e `better-sqlite3` e' sincrono
   mentre un driver di rete non puo' esserlo: questa classe diventa
   asincrona, e con lei ogni rotta e ogni prova del servizio.

   **DUE MOTORI, NON UNO, E NON PER INDECISIONE.** Il magazzino gira su
   SQLite e ci deve poter girare finche' SQL Server non e' provato per un
   turno intero: §0 dice che installare e' un atto umano, a fine turno, con
   un backup fresco davanti. Un taglio netto vorrebbe dire scoprire in corsia
   quello che si scopre al banco. Quindi il motore e' un interruttore -
   `PATHFINDER_DB_MOTORE` - e il comportamento di riferimento resta SQLite:
   se i due divergono ha ragione quello, e lo dice `test/collaudo.js`.

   COSA NON E' CAMBIATO, ed e' il punto: **la superficie**. Gli stessi nomi,
   gli stessi ritorni, le stesse eccezioni con lo stesso `status`. Chi legge
   una rotta vede la stessa cosa di prima con un `await` davanti. Le
   differenze di dialetto stanno nei due driver e non arrivano qui.

   ─── LA COSA DA SAPERE PRIMA DI TOCCARE UNA TRANSAZIONE ────────────────

   Le transazioni sono **serializzate da una coda**, una per volta, e non e'
   prudenza: e' correttezza. `BEGIN` e `COMMIT` valgono per la CONNESSIONE,
   non per la chiamata; un `await` in mezzo cede il turno, e un'altra
   richiesta che entrasse li' scriverebbe **dentro la transazione di
   qualcun altro** - e verrebbe annullata insieme a lei, o la porterebbe a
   termine per sbaglio. Node e' a un filo solo e questo lo rende peggio, non
   meglio: succede in silenzio.

   E' anche la lettura giusta di §6: «la concorrenza si risolve con una
   transazione dentro `/api/op/...`, non con la disciplina di chi scrive». La
   coda e' quel che rende vera quella frase adesso che il codice attende. */

const { COLLECTIONS, NAMES, materialize } = require('./schema');
const { DriverSqlite } = require('./driver-sqlite');

/** Quale motore, e da dove si dice. Il valore di serie e' SQLite: chi non
    ha deciso niente continua ad avere quello che aveva. */
function motoreScelto() {
  const m = String(process.env.PATHFINDER_DB_MOTORE || 'sqlite').toLowerCase().trim();
  if (m !== 'sqlite' && m !== 'mssql') {
    throw new Error(`PATHFINDER_DB_MOTORE: valore non previsto «${m}». Ammessi: sqlite, mssql`);
  }
  return m;
}

class PathfinderDB {
  /* Il costruttore resta SINCRONO, e il servizio continua a scrivere
     `new PathfinderDB(file)` in cima al modulo come faceva. Quel che non
     puo' essere sincrono e' l'APERTURA - una connessione di rete non lo e' -
     e sta in una promessa che ogni metodo attende come prima cosa. Cosi'
     l'oggetto esiste subito, e chi lo usa non deve sapere quando e' pronto. */
  constructor(file, { motore = motoreScelto(), connessione = process.env.PATHFINDER_MSSQL || null } = {}) {
    this.file = file;
    this.motore = motore;
    this.migrazioni = [];
    this._listeners = new Set();
    this._txDepth = 0;
    this._txTouched = null;
    /* La coda delle transazioni: una promessa che si allunga. */
    this._coda = Promise.resolve();
    this._avvio = this._apri(file, motore, connessione);
    /* Chi non attende mai non deve trovarsi un rifiuto non gestito in
       faccia a processo gia' avviato: l'errore vero lo rilancia `_pronto`. */
    this._avvio.catch(() => {});
  }

  async _apri(file, motore, connessione) {
    if (motore === 'mssql') {
      const { DriverMssql } = require('./driver-mssql');
      this.driver = await DriverMssql.apri(connessione);
    } else {
      this.driver = new DriverSqlite(file);
    }

    /* Tre passi in quest'ordine, e l'ordine e' il punto: le tabelle che
       mancano si creano; le colonne indicizzate che mancano a una tabella
       che esiste gia' si aggiungono; solo dopo gli indici. */
    await this.driver.creaTabelle();
    this.migrazioni = await this._migra();
    await this.driver.creaIndici();

    /* Il registro delle revisioni non e' una collezione dell'applicativo:
       e' un fatto del supporto, e sta in una tabella sua. */
    await this.driver.creaRevisioni();
    return this;
  }

  /** Ogni metodo pubblico comincia da qui. */
  async _pronto() { await this._avvio; return this.driver; }

  /** Per chi deve sapere QUANDO e' aperto invece di limitarsi a usarlo:
      `migrazioni` si legge solo dopo, e chi avvia il servizio vuole che un
      errore di connessione si veda all'avvio e non alla prima rotta. */
  async pronto() { await this._avvio; return this; }

  /** Il manico grezzo di SQLite, per chi deve guardare dentro al file - il
      collaudo della migrazione 1.4 lo fa. Su SQL Server non esiste, e
      chiederlo e' un errore che va detto invece che restituire `undefined`. */
  get db() {
    if (!this.driver || this.driver.dialetto !== 'sqlite') {
      throw new Error('Il manico SQLite grezzo esiste solo col motore sqlite');
    }
    /* Il controllo qui sopra e' la prova che il tipo non sa fare: `driver` e'
       l'uno O l'altro, e solo uno dei due ha un manico. §6 — dove tipo e
       codice litigano, cede il tipo. */
    return /** @type {any} */ (this.driver).db;
  }

  /* ── Migrazione dello schema ──────────────────────────────────────── */

  /* PERCHE' ESISTE: creare una tabella che c'e' gia' non fa niente - nemmeno
     aggiungere una colonna nuova. Il `CREATE INDEX` successivo cerca una
     colonna che non esiste, muore all'avvio, e il servizio non parte
     affatto: i terminali vedono bianco e il magazzino si ferma. E' un
     difetto provato, non dedotto.

     PERCHE' E' SICURA: la colonna indicizzata e' una COPIA materializzata,
     non la sorgente. Il valore vero e' gia' nel JSON di `data`, quindi qui
     non si travasa niente - si ricostruisce un indice. */
  async _migra() {
    const fatte = [];
    for (const nome of NAMES) {
      const col = COLLECTIONS[nome];
      if (!await this.driver.tabellaEsiste(nome)) continue;   // ci ha appena pensato creaTabelle
      const presenti = await this.driver.colonnePresenti(nome);
      for (const campo of col.indexed) {
        if (campo === col.pk || presenti.has(campo)) continue;
        const righe = await this.driver.aggiungiColonna(nome, campo, (col.numeric || []).includes(campo));
        fatte.push({ collezione: nome, campo, righe });
      }
    }
    if (fatte.length) {
      console.log('[pathfinder] migrazione schema:',
        fatte.map(f => `${f.collezione}.${f.campo} (${f.righe} righe)`).join(' · '));
    }
    return fatte;
  }

  /* ── Revisione e notifica ─────────────────────────────────────────── */

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  async currentRevision() {
    const d = await this._pronto();
    const r = await d.get(`SELECT MAX(${d.q('rev')}) AS r FROM ${d.q('_revision')}`);
    return r?.r || 0;
  }

  async _touch(collections, origin) {
    const list = Array.isArray(collections) ? collections : [collections];
    if (this._txDepth > 0) { for (const c of list) this._txTouched.add(c); return; }
    return this._emit(list, origin);
  }

  async _emit(list, origin) {
    const d = await this._pronto();
    const info = await d.run(
      `INSERT INTO ${d.q('_revision')} (${d.q('ts')}, ${d.q('collections')}, ${d.q('origin')}) VALUES (?,?,?)`,
      [Date.now(), JSON.stringify(list), origin || null]);
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

  async add(name, record, origin) {
    const d = await this._pronto();
    const { col, mat, cols } = this._row(name, record);
    if (col.pkType === 'auto') {
      const tutte = [...cols, 'data'];
      const sql = `INSERT INTO ${d.q(name)} (${tutte.map(c => d.q(c)).join(', ')}) VALUES (${tutte.map(() => '?').join(', ')})`;
      const { [col.pk]: _drop, ...clean } = record;
      const info = await d.run(sql, [...cols.map(c => mat[c]), JSON.stringify(clean)]);
      await this._touch(name, origin);
      return Number(info.lastInsertRowid);
    }
    const key = record[col.pk];
    if (key === undefined || key === null || key === '')
      throw Object.assign(new Error(`${name}: chiave ${col.pk} mancante`), { status: 400 });
    const all = [col.pk, ...cols, 'data'];
    const sql = `INSERT INTO ${d.q(name)} (${all.map(c => d.q(c)).join(', ')}) VALUES (${all.map(() => '?').join(', ')})`;
    await d.run(sql, [String(key), ...cols.map(c => mat[c]), JSON.stringify(record)]);
    await this._touch(name, origin);
    return key;
  }

  async put(name, record, origin) {
    const d = await this._pronto();
    const { col, mat, cols } = this._row(name, record);
    const key = record[col.pk];
    if (key === undefined || key === null || key === '') return this.add(name, record, origin);
    const { [col.pk]: _drop, ...clean } = record;
    const sql = d.upsertSQL(name, col.pk, cols);
    const bindKey = col.pkType === 'auto' ? Number(key) : String(key);
    const args = [bindKey, ...cols.map(c => mat[c]),
                  JSON.stringify(col.pkType === 'auto' ? clean : record)];
    /* Su una chiave automatica il valore arriva da fuori - e' il ripristino
       da export, che i `_id` li deve preservare. Su SQLite non serve
       permesso; su SQL Server si', e lo chiede il driver. */
    await d.conChiaviEsplicite(name, () => d.run(sql, args));
    await this._touch(name, origin);
    return key;
  }

  async update(name, key, changes, origin) {
    this._col(name);
    const cur = await this.get(name, key);
    if (!cur) return 0;
    await this.put(name, { ...cur, ...changes }, origin);
    return 1;
  }

  async delete(name, key, origin) {
    const d = await this._pronto();
    const col = this._col(name);
    const bind = col.pkType === 'auto' ? Number(key) : String(key);
    const info = await d.run(`DELETE FROM ${d.q(name)} WHERE ${d.q(col.pk)} = ?`, [bind]);
    if (info.changes) await this._touch(name, origin);
    return info.changes;
  }

  async bulkAdd(name, records, origin) {
    const keys = [];
    await this.transaction([name], async () => {
      for (const r of records) keys.push(await this.add(name, r, origin));
    }, origin);
    return keys;
  }

  async bulkPut(name, records, origin) {
    const keys = [];
    await this.transaction([name], async () => {
      for (const r of records) keys.push(await this.put(name, r, origin));
    }, origin);
    return keys;
  }

  async clear(name, origin) {
    const d = await this._pronto();
    this._col(name);
    const info = await d.run(`DELETE FROM ${d.q(name)}`);
    await this._touch(name, origin);
    return info.changes;
  }

  async clearMany(names, origin) {
    await this.transaction(names, async () => {
      for (const n of names) await this.clear(n, origin);
    }, origin);
  }

  /* ── Letture ──────────────────────────────────────────────────────── */

  async get(name, key) {
    const d = await this._pronto();
    const col = this._col(name);
    const bind = col.pkType === 'auto' ? Number(key) : String(key);
    const row = await d.get(`SELECT * FROM ${d.q(name)} WHERE ${d.q(col.pk)} = ?`, [bind]);
    return this._hydrate(name, row);
  }

  async all(name) {
    const d = await this._pronto();
    const righe = await d.all(`SELECT * FROM ${d.q(name)}`);
    return righe.map(r => this._hydrate(name, r));
  }

  _where(d, name, criteria) {
    if (!criteria) return { sql: '', args: [] };
    const col = this._col(name);
    const materialized = new Set([col.pk, ...col.indexed]);
    const f = criteria.field;
    if (!materialized.has(f))
      throw Object.assign(new Error(`${name}: il campo "${f}" non e' indicizzato e non puo' filtrare`), { status: 400 });
    const c = d.q(f === col.pk ? col.pk : f);
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

  async count(name, criteria = null) {
    const d = await this._pronto();
    const w = this._where(d, name, criteria);
    const r = await d.get(`SELECT COUNT(*) AS c FROM ${d.q(name)}${w.sql}`, w.args);
    return r.c;
  }

  async countAll() {
    const out = {};
    for (const n of NAMES) out[n] = await this.count(n);
    return out;
  }

  async query(name, { criteria = null, limit = null, offset = 0, reverse = false, orderBy = null } = {}) {
    const d = await this._pronto();
    const col = this._col(name);
    const w = this._where(d, name, criteria);
    const ord = orderBy && (orderBy === col.pk || col.indexed.includes(orderBy)) ? orderBy : col.pk;
    /* L'ORDER BY c'e' sempre, e non e' solo per avere un ordine: la
       paginazione di SQL Server lo PRETENDE. */
    const pag = d.paginazioneSQL(limit, offset);
    const sql = `SELECT * FROM ${d.q(name)}${w.sql} ORDER BY ${d.q(ord)} ${reverse ? 'DESC' : 'ASC'}${pag.sql}`;
    const righe = await d.all(sql, [...w.args, ...pag.args]);
    return righe.map(r => this._hydrate(name, r));
  }

  async deleteWhere(name, criteria, origin) {
    const d = await this._pronto();
    const w = this._where(d, name, criteria);
    const info = await d.run(`DELETE FROM ${d.q(name)}${w.sql}`, w.args);
    if (info.changes) await this._touch(name, origin);
    return info.changes;
  }

  /* ── Transazioni ──────────────────────────────────────────────────── */

  /* La coda e' spiegata in testa al file: `BEGIN` vale per la connessione,
     non per la chiamata, e un `await` in mezzo cede il turno. Senza la coda
     due operazioni composte si infilerebbero una dentro l'altra in silenzio.

     Le transazioni ANNIDATE non aprono niente: si accodano alla piu' esterna
     e le passano le collezioni toccate, esattamente come prima. */
  async transaction(collections, fn, origin) {
    if (this._txDepth > 0) {
      for (const c of collections) this._txTouched.add(c);
      return fn();
    }
    const mio = this._coda.then(() => this._transazione(collections, fn, origin));
    /* La coda prosegue anche se questa fallisce: l'errore lo prende chi ha
       chiamato, non chi viene dopo. */
    this._coda = mio.then(() => {}, () => {});
    return mio;
  }

  async _transazione(collections, fn, origin) {
    const d = await this._pronto();
    this._txDepth = 1;
    this._txTouched = new Set(collections);
    await d.begin();
    try {
      const out = await fn();
      await d.commit();
      const touched = [...this._txTouched];
      this._txDepth = 0; this._txTouched = null;
      if (touched.length) await this._emit(touched, origin);
      return out;
    } catch (err) {
      await d.rollback();
      this._txDepth = 0; this._txTouched = null;
      throw err;
    }
  }

  /* ── Caricamento iniziale ─────────────────────────────────────────── */

  async loadAll({ movLogFrom = null } = {}) {
    const out = {};
    for (const n of NAMES) {
      if (n === 'mov_log') continue;
      out[n] = await this.all(n);
    }
    out.mov_log = movLogFrom == null
      ? await this.query('mov_log', { reverse: true, orderBy: 'ts' })
      : await this.query('mov_log', { criteria: { field: 'ts', op: 'aboveOrEqual', value: movLogFrom }, reverse: true, orderBy: 'ts' });
    out._movLogTotal = await this.count('mov_log');
    out._revision = await this.currentRevision();
    return out;
  }

  /* ── Manutenzione ─────────────────────────────────────────────────── */

  async stats() {
    const d = await this._pronto();
    const counts = await this.countAll();
    return {
      file: this.file,
      motore: this.motore,
      bytes: await d.byteSuDisco(),
      counts,
      revision: await this.currentRevision(),
    };
  }

  /** Con SQLite copia il file a caldo. Con SQL Server il dato non e' un file
      di questo servizio, e il driver lo dice con un errore invece di
      scrivere un file vuoto e lasciar credere che ci sia una copia. */
  async backupTo(destFile) {
    const d = await this._pronto();
    return d.backupTo(destFile);
  }

  async close() {
    try { await this._avvio; } catch { return; }
    await this.driver.close();
  }
}

module.exports = { PathfinderDB, motoreScelto };
