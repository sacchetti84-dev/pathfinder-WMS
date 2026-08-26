'use strict';

/* IL DRIVER POSTGRESQL — 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Si accende con `PATHFINDER_PG`. Senza quella variabile questo file non
   viene nemmeno caricato, e `pg` non serve che ci sia.

   LA TRANSAZIONE VIVE SU UNA CONNESSIONE SOLA, e questo comanda tutto il
   resto. Un pool distribuisce connessioni a chi chiede; una transazione
   aperta su una e proseguita su un'altra e' una transazione che non
   esiste. Finche' c'e' una transazione aperta, `_righe` ed `_esegui` usano
   la connessione fissata; fuori, il pool. La coda di `DriverBase` fa il
   resto: una transazione per volta.

   IL POOL SI DIMENSIONA SUL NUMERO DI TERMINALI, non si lascia al valore di
   serie. Flexible Server chiude le connessioni ferme, e un pool che non se
   ne accorge muore a meta' turno: `idleTimeoutMillis` sta sotto la soglia
   del server, cosi' e' il pool a chiuderle per primo e a saperlo.

   `LC_COLLATE 'C'` SUL DATABASE NON E' UN DETTAGLIO. Con una collazione
   linguistica, `ORDER BY location_code` restituisce un ordine diverso da
   quello di SQLite e il magazzino vede le corsie rimescolate. Il controllo
   e' in `pronto()`, e se non torna lo dice invece di lasciarlo scoprire. */

const fs = require('node:fs');
const { DriverBase } = require('./driver-base');
const { NAMES } = require('./schema');
const { POSTGRES } = require('./sql');
const { schemaCompleto } = require('./schema-postgres');

/* Quante connessioni. Un terminale non ne tiene una aperta — parla in HTTP,
   e il servizio e' uno — quindi il pool serve la concorrenza del servizio,
   non quella del magazzino. Dieci e' largo per un processo solo. */
const POOL_MAX = Number(process.env.PATHFINDER_PG_POOL) || 10;
const FERMA_MS = Number(process.env.PATHFINDER_PG_IDLE) || 30_000;
const ATTESA_MS = Number(process.env.PATHFINDER_PG_TIMEOUT) || 10_000;

/** Il database sta su questa macchina? Solo li' si accetta il chiaro. */
function suQuestaMacchina(stringa) {
  try {
    const u = new URL(stringa);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch { return false; }
}

class DriverPostgres extends DriverBase {
  constructor(stringa, opzioni = {}) {
    super(POSTGRES);
    let Pool;
    try {
      const pg = require('pg');
      Pool = pg.Pool;
      /* UN `BIGINT` TORNA COME STRINGA, E SQLITE LO RENDE NUMERO.
         `pg` decodifica `int8` in stringa per non perdere cifre oltre i
         2^53 che JavaScript regge. Su questo modello nessun numero ci
         arriva vicino — `_id` conta righe, `ts` e' un epoch in
         millisecondi, e il 2^53 in millisecondi e' l'anno 287396 — ma la
         differenza si vedrebbe dove fa male: il client riceverebbe
         `_id: "1"` da PostgreSQL e `_id: 1` da SQLite, e `tasks.mov_ids`
         confronta quei numeri con `===`. Si decodifica a numero, e si torna
         alla stringa solo se davvero non ci sta: meglio una stringa dove
         un numero mentirebbe. */
      pg.types.setTypeParser(20, (v) => {
        const n = Number(v);
        return Number.isSafeInteger(n) ? n : v;
      });
    } catch {
      throw new Error(
        'PATHFINDER_PG e\' impostata ma il modulo `pg` non c\'e\'.\n' +
        '  Installalo nel servizio:  npm install pg  (dentro server/)');
    }
    this.stringa = stringa;
    this.pool = new Pool({
      connectionString: stringa,
      max: opzioni.poolMax || POOL_MAX,
      idleTimeoutMillis: FERMA_MS,
      /* IL CERTIFICATO SI VERIFICA. `rejectUnauthorized: false` accetta
         qualunque certificato, cioe' accetta anche chi si mette in mezzo: la
         stringa di connessione e il PIN degli operatori passerebbero da li'.
         Node porta con se' le CA di Mozilla, e il certificato di Azure
         Flexible Server risale a una di quelle: verificare non costa niente e
         non chiede file da installare.

         In chiaro si va solo verso questa macchina, dove non c'e' rete da
         ascoltare. Chi ha una CA aziendale la indica con `PATHFINDER_PG_CA`
         — un file, non un interruttore che spegne il controllo. */
      ssl: suQuestaMacchina(stringa) ? false : {
        rejectUnauthorized: true,
        ...(process.env.PATHFINDER_PG_CA
          ? { ca: fs.readFileSync(process.env.PATHFINDER_PG_CA, 'utf8') }
          : {}),
      },
      connectionTimeoutMillis: ATTESA_MS,
    });

    /* Un errore su una connessione ferma del pool arriva qui e, senza
       ascoltatore, butterebbe giu' il processo — cioe' il magazzino. */
    this.pool.on('error', (e) => console.error('[pathfinder] pool PostgreSQL:', e.message));
    this._fissata = null;
  }

  async pronto() {
    for (const sql of schemaCompleto()) await this.pool.query(sql);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS _revision (
      rev BIGSERIAL PRIMARY KEY,
      ts BIGINT NOT NULL,
      collections TEXT NOT NULL,
      origin TEXT
    )`);
    await this._verificaCollazione();
    /* Le chiavi automatiche possono essere state migrate preservando il
       loro numero: senza riallineare la sequenza, la prima scrittura nuova
       ripartirebbe da 1 e sbatterebbe contro una chiave che c'e' gia'. */
    await this.riallineaSequenze();
    return this;
  }

  /* SQLite confronta il testo byte per byte. PostgreSQL usa la collazione
     del database, e con `it_IT` o `en_US` l'ordine cambia — la punteggiatura
     pesa meno, le maiuscole si mescolano. `ORDER BY` e' quello che il client
     legge per disegnare una corsia. */
  async _verificaCollazione() {
    const r = await this.pool.query(
      "SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()");
    const c = r.rows[0]?.datcollate || '';
    if (/^(C|POSIX|C\.UTF-?8)$/i.test(c)) return;
    console.warn(
      `[pathfinder] ATTENZIONE: il database ha collazione "${c}", non "C".\n` +
      '  L\'ordinamento del testo non combacia con quello di SQLite: le corsie\n' +
      '  possono uscire in un ordine diverso. Il database va creato con\n' +
      '  LC_COLLATE \'C\' LC_CTYPE \'C\' TEMPLATE template0.');
  }

  /** Rimette ogni sequenza sopra la chiave piu' alta gia' scritta. */
  async riallineaSequenze() {
    const fatte = [];
    for (const nome of [...NAMES, '_revision']) {
      const pk = nome === '_revision' ? 'rev' : (require('./schema').COLLECTIONS[nome]?.pk);
      if (nome !== '_revision' && require('./schema').COLLECTIONS[nome].pkType !== 'auto') continue;
      const r = await this.pool.query(
        `SELECT setval(pg_get_serial_sequence('${nome}', '${pk}'),
                COALESCE((SELECT MAX(${pk}) FROM ${nome}), 0) + 1, false) AS v`);
      fatte.push({ collezione: nome, prossima: Number(r.rows[0]?.v) });
    }
    return fatte;
  }

  /* Il servizio stampa questa riga all'avvio, e §0 punto 2 dice che quello
     che risponde il servizio batte quello che dice il documento: se la riga
     nomina un file mentre il database e' altrove, quella regola smette di
     valere. La password non ci entra. */
  get descrizione() {
    return `PostgreSQL — ${this.stringa.replace(/\/\/[^@]*@/, '//***@')}`;
  }

  /* ── I quattro gesti ───────────────────────────────────────────────── */

  /* LA CONNESSIONE FISSATA SERVE SOLO A CHI STA NELLA TRANSAZIONE.
     `this._fissata` c'e' finche' una transazione e' aperta, ma una LETTURA
     che arriva da un'altra richiesta HTTP non le appartiene: mandargliela
     vorrebbe dire farle vedere righe non ancora confermate, e infilare una
     query estranea in mezzo a una transazione aperta. Chi e' dentro lo dice
     il contesto asincrono, non l'esistenza della connessione. */
  _dove() {
    return this._tx && this._fissata ? this._fissata : this.pool;
  }

  async _esegui(sql, args) {
    const r = await this._dove().query(sql, args);
    return r.rowCount || 0;
  }

  async _righe(sql, args) {
    const r = await this._dove().query(sql, args);
    return r.rows || [];
  }

  async _iniziaTx() {
    this._fissata = await this.pool.connect();
    await this._fissata.query('BEGIN');
  }

  async _confermaTx() {
    try { await this._fissata.query('COMMIT'); }
    finally { this._fissata.release(); this._fissata = null; }
  }

  async _annullaTx() {
    if (!this._fissata) return;
    try { await this._fissata.query('ROLLBACK'); }
    finally { this._fissata.release(); this._fissata = null; }
  }

  /* ── Manutenzione ──────────────────────────────────────────────────── */

  async stats() {
    const conti = await this.countAll();
    const r = await this.pool.query('SELECT pg_database_size(current_database()) AS b');
    return {
      file: this.stringa.replace(/\/\/[^@]*@/, '//***@'),   // mai la password nei log
      bytes: Number(r.rows[0]?.b) || 0,
      counts: conti,
      revision: await this.currentRevision(),
    };
  }

  /* IL BACKUP CAMBIA PADRONE, ED E' UNO DEI QUATTRO PUNTI DEL LEGGIMI.
     Con SQLite si copiava un file; qui il ripristino e' il point-in-time di
     Azure, e non c'e' niente da copiare da dentro il servizio. Dirlo e'
     meglio che restituire un file finto: `backup-serale.ps1` e la rotta
     `/api/backup` vanno rifatti sul ripristino di Azure. */
  async backupTo() {
    throw Object.assign(
      new Error('Con PostgreSQL il backup non e\' una copia di file: si usa il ripristino point-in-time di Azure. Vedi server/azure/LEGGIMI.md.'),
      { status: 501 });
  }

  async close() { await this.pool.end(); }
}

module.exports = { DriverPostgres };
