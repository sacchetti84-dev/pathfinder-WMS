'use strict';

/* IL DRIVER SQL SERVER - 2.2.
   (c) Andrea Sacchetti - Dietopack S.r.l. (Naturacare Group)

   Il comportamento di riferimento e' `driver-sqlite.js`: quello e' cio' che
   il servizio ha sempre fatto, e se i due divergono ha ragione quello. Qui
   c'e' la traduzione, e le differenze che contano sono cinque - stanno
   scritte qui sotto perche' nessuna e' ovvia.

   `mssql` NON e' una dipendenza del progetto e si carica solo se qualcuno
   chiede davvero questo motore: §6, «niente dipendenze nuove senza motivo
   forte». Finche' `PATHFINDER_DB_MOTORE` non dice `mssql`, questo file non
   viene nemmeno letto.

   ─── LE CINQUE DIFFERENZE ───────────────────────────────────────────────

   1. **I SEGNAPOSTO.** SQLite usa `?` posizionali, SQL Server vuole
      parametri con un nome. `db.js` scrive `?` e basta - una forma sola - e
      la traduzione sta qui: `?` diventa `@p1`, `@p2`... **Il ricambio salta
      quel che sta dentro gli apici**, altrimenti un punto interrogativo
      dentro una descrizione articolo diventerebbe un parametro che nessuno
      ha passato, e il messaggio d'errore parlerebbe d'altro.

   2. **L'UPSERT.** `ON CONFLICT ... DO UPDATE` non esiste. L'equivalente e'
      `MERGE`, e ha una trappola che si e' portata dietro per anni: **va
      chiuso col punto e virgola**, o l'errore che si legge non parla di
      quello. Il `WITH (HOLDLOCK)` non e' decorativo: senza, due terminali
      che scrivono la stessa chiave nello stesso istante possono inserirla
      tutti e due, ed e' esattamente il caso che §6 affida al server.

   3. **LA PAGINAZIONE.** `LIMIT n OFFSET m` non esiste: si scrive
      `OFFSET m ROWS FETCH NEXT n ROWS ONLY`, e **pretende un ORDER BY**.
      `db.js` ce l'ha sempre, ma se un giorno non l'avesse fallirebbe qui e
      non di la'.

   4. **LA CHIAVE APPENA INSERITA.** `lastInsertRowid` non esiste: si chiede
      `SCOPE_IDENTITY()` nella stessa istruzione. **`SCOPE_IDENTITY` e non
      `@@IDENTITY`**: il secondo restituirebbe la chiave scritta da un
      eventuale trigger, cioe' di un'altra tabella, e sarebbe un difetto che
      si manifesta solo il giorno che qualcuno aggiunge un trigger.

   5. **SCRIVERE UNA CHIAVE AUTOMATICA A MANO.** Una colonna `IDENTITY`
      rifiuta un valore che arriva da fuori finche' non le si dice il
      contrario, e glielo si dice **una tabella per volta**: SQL Server ne
      ammette una sola accesa per sessione. Serve al ripristino da export,
      che riscrive i record col loro `_id` - e quegli `_id` vanno preservati
      perche' `tasks.mov_ids` e gli archivi ci puntano. */

const { NAMES, COLLECTIONS } = require('./schema');
const { schemaCompleto, createTableSQL, createIndexSQL, LARGHEZZA } = require('../sqlserver/schema-sqlserver');

/** Differenza 1. `?` diventa `@p1`, `@p2`... e quel che sta fra apici non si
    tocca: un punto interrogativo dentro una descrizione e' testo, non un
    parametro. */
function segnaposti(sql) {
  let n = 0;
  let dentroApici = false;
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") { dentroApici = !dentroApici; out += c; continue; }
    if (c === '?' && !dentroApici) { out += `@p${++n}`; continue; }
    out += c;
  }
  return { sql: out, quanti: n };
}

class DriverMssql {
  constructor(mssql, pool, connessione) {
    this.dialetto = 'mssql';
    this.mssql = mssql;
    this.pool = pool;
    this.connessione = connessione;
    this.tx = null;                 // la transazione aperta, se c'e'
  }

  static async apri(connessione) {
    let mssql;
    try {
      /* `mssql` non e' una dipendenza del progetto finche' SQL Server non e'
         in servizio - §6 - quindi qui non c'e' niente da risolvere e il
         controllo dei tipi va zittito su questa riga sola. Si toglie il
         giorno che il modulo entra in `server/package.json`, insieme
         all'esclusione in `tsconfig.server.json`. */
      // @ts-ignore modulo assente per scelta, vedi sopra
      mssql = require('mssql');
    } catch {
      throw new Error(
        'Il motore e\' impostato su SQL Server ma il modulo `mssql` non e\' installato.\n'
        + '  Non e\' una dipendenza del progetto finche\' SQL Server non e\' in servizio:\n'
        + '    cd server && npm install mssql');
    }
    if (!connessione) {
      throw new Error('Manca PATHFINDER_MSSQL con la stringa di connessione.');
    }
    const pool = await mssql.connect(connessione);
    return new DriverMssql(mssql, pool, connessione);
  }

  /** Dentro una transazione le richieste devono nascere DA quella, o
      finirebbero su un'altra connessione del pool e resterebbero fuori. */
  _richiesta() {
    return this.tx ? new this.mssql.Request(this.tx) : this.pool.request();
  }

  _lega(richiesta, args) {
    args.forEach((v, i) => {
      const nome = `p${i + 1}`;
      if (v === null || v === undefined) richiesta.input(nome, this.mssql.NVarChar, null);
      else if (typeof v === 'number') richiesta.input(nome, Number.isInteger(v) ? this.mssql.BigInt : this.mssql.Float, v);
      else if (typeof v === 'boolean') richiesta.input(nome, this.mssql.Bit, v);
      else richiesta.input(nome, this.mssql.NVarChar(this.mssql.MAX), String(v));
    });
    return richiesta;
  }

  /** `meta` ha una colonna che si chiama `key`, riservata in T-SQL: senza
      quadre `SELECT ... WHERE key = ?` non compila. Si quota tutto, cosi'
      nessuno deve ricordarsi quali nomi sono a rischio. */
  q(nome) { return `[${nome}]`; }

  async exec(sql) { await this._richiesta().batch(sql); }

  async run(sql, args = []) {
    const t = segnaposti(sql);
    const r = this._lega(this._richiesta(), args);
    /* Differenza 4: la chiave appena scritta si chiede nella stessa
       istruzione. Solo su una INSERT - altrove `SCOPE_IDENTITY()` sarebbe
       `null` e costerebbe un giro per niente. */
    const inserisce = /^\s*INSERT\b/i.test(sql);
    const res = await r.query(inserisce ? `${t.sql}; SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS id` : t.sql);
    const righe = res.recordset || [];
    return {
      changes: Array.isArray(res.rowsAffected) ? res.rowsAffected.reduce((a, b) => a + b, 0) : 0,
      lastInsertRowid: righe.length && righe[0].id != null ? Number(righe[0].id) : 0,
    };
  }

  async get(sql, args = []) {
    const t = segnaposti(sql);
    const res = await this._lega(this._richiesta(), args).query(t.sql);
    return (res.recordset || [])[0];
  }

  async all(sql, args = []) {
    const t = segnaposti(sql);
    const res = await this._lega(this._richiesta(), args).query(t.sql);
    return res.recordset || [];
  }

  async begin() {
    this.tx = new this.mssql.Transaction(this.pool);
    await this.tx.begin();
  }

  async commit() {
    const t = this.tx; this.tx = null;
    if (t) await t.commit();
  }

  async rollback() {
    const t = this.tx; this.tx = null;
    if (t) { try { await t.rollback(); } catch { /* gia' chiusa */ } }
  }

  /* ── Schema ─────────────────────────────────────────────────────────── */

  async creaTabelle() { for (const n of NAMES) await this.exec(createTableSQL(n)); }
  async creaIndici()  { for (const n of NAMES) for (const s of createIndexSQL(n)) await this.exec(s); }

  async creaRevisioni() {
    await this.exec(`IF OBJECT_ID(N'_revision', N'U') IS NULL CREATE TABLE [_revision] (
      [rev] BIGINT IDENTITY(1,1) PRIMARY KEY,
      [ts] BIGINT NOT NULL,
      [collections] NVARCHAR(MAX) NOT NULL,
      [origin] NVARCHAR(${LARGHEZZA})
    )`);
  }

  async tabellaEsiste(nome) {
    const r = await this.get(`SELECT 1 AS c FROM sys.tables WHERE name = ?`, [nome]);
    return !!r;
  }

  async colonnePresenti(nome) {
    const righe = await this.all(
      `SELECT c.name AS nome FROM sys.columns c WHERE c.object_id = OBJECT_ID(?)`, [nome]);
    return new Set(righe.map(r => r.nome));
  }

  /** `ADD COLUMN` non esiste: e' `ADD`. E il valore si estrae con
      `JSON_VALUE`, non `json_extract`. */
  async aggiungiColonna(nome, campo, numerica) {
    const tipo = numerica ? 'BIGINT' : `NVARCHAR(${LARGHEZZA})`;
    await this.exec(`ALTER TABLE [${nome}] ADD [${campo}] ${tipo}`);
    const r = await this.run(
      `UPDATE [${nome}] SET [${campo}] = JSON_VALUE([data], '$.${campo}')`);
    return r.changes;
  }

  /* ── I pezzi di SQL che cambiano ────────────────────────────────────── */

  /** Differenza 2. Il punto e virgola in fondo NON e' facoltativo. */
  upsertSQL(nome, pk, colonne) {
    const tutte = [pk, ...colonne, 'data'];
    const valori = tutte.map(() => '?').join(', ');
    const set = [...colonne, 'data'].map(c => `[${c}] = s.[${c}]`).join(', ');
    return `MERGE [${nome}] WITH (HOLDLOCK) AS t
            USING (VALUES (${valori})) AS s (${tutte.map(c => `[${c}]`).join(', ')})
            ON t.[${pk}] = s.[${pk}]
            WHEN MATCHED THEN UPDATE SET ${set}
            WHEN NOT MATCHED THEN INSERT (${tutte.map(c => `[${c}]`).join(', ')})
                 VALUES (${tutte.map(c => `s.[${c}]`).join(', ')});`;
  }

  /** Differenza 3. Pretende un ORDER BY, che `db.js` mette sempre. */
  paginazioneSQL(limit, offset) {
    if (limit == null && !offset) return { sql: '', args: [] };
    const args = [offset || 0];
    let sql = ' OFFSET ? ROWS';
    if (limit != null) { sql += ' FETCH NEXT ? ROWS ONLY'; args.push(limit); }
    return { sql, args };
  }

  /** Differenza 5. Una tabella per volta, e si spegne comunque: una
      IDENTITY_INSERT lasciata accesa fa fallire la tabella DOPO, con un
      errore che non parla di questa. */
  async conChiaviEsplicite(nome, fn) {
    const col = COLLECTIONS[nome];
    if (!col || col.pkType !== 'auto') return fn();
    await this.exec(`SET IDENTITY_INSERT [${nome}] ON`);
    try { return await fn(); }
    finally { await this.exec(`SET IDENTITY_INSERT [${nome}] OFF`); }
  }

  /* ── Manutenzione ───────────────────────────────────────────────────── */

  /** Quanto occupa il dato. Non e' un file: si chiede al motore. */
  async byteSuDisco() {
    try {
      const r = await this.get(
        `SELECT SUM(a.total_pages) * 8192 AS byte
           FROM sys.allocation_units a
           JOIN sys.partitions p ON a.container_id = p.hobt_id
          WHERE p.object_id > 0`);
      return Number(r?.byte || 0);
    } catch { return 0; }
  }

  /** IL BACKUP CAMBIA PADRONE, e questo e' il punto in cui si vede.
      `POST /api/backup` copiava un file, e `torna-indietro.ps1` riportava il
      dato insieme all'applicativo. Con SQL Server il dato non e' piu' un
      file di questo servizio: il ripristino e' del motore - copia di
      sicurezza e point-in-time - e chi lo fa e' chi amministra l'istanza.
      Dirlo con un errore scritto e' meglio che scrivere un file vuoto e
      lasciar credere che ci sia una copia. */
  async backupTo() {
    throw Object.assign(new Error(
      'Con SQL Server la copia non la fa l\'applicativo: il dato non e\' un file di questo servizio. '
      + 'Il ripristino e\' del motore (copia di sicurezza e point-in-time) e lo fa chi amministra l\'istanza. '
      + 'Per portare via i dati resta l\'export JSON, che non toglie niente da dove sta.'),
      { status: 501 });
  }

  async close() { await this.pool.close(); }
}

module.exports = { DriverMssql, segnaposti };
