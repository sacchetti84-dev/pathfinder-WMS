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
const path = require('node:path');
const { execFile } = require('node:child_process');
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

/* Quanto puo' durare un dump prima che lo si consideri piantato. Il
   magazzino di oggi sta in venti megabyte e ci mette secondi; il tetto e'
   largo perche' un dump interrotto a meta' e' peggio di uno lento. */
const DUMP_MS = Number(process.env.PATHFINDER_PG_DUMP_TIMEOUT) || 15 * 60 * 1000;

/* ── L'ATTESA DELL'AVVIO — 2.12.1 ──────────────────────────────────────────
   Il 28/08 il magazzino e' rimasto giu' una giornata intera, e non per un
   difetto di questo driver: per il momento in cui gli si e' chiesto di
   parlare. L'attivita' pianificata parte `AtStartup`, quindi il servizio ha
   chiesto il database **diciotto secondi** dopo l'accensione del PC, mentre
   PostgreSQL stava ancora facendo il recovery. Il servizio si e' comportato
   come deve — «meglio fermo che vivo senza database» — ed e' uscito con 1.
   Poi non ci ha piu' riprovato nessuno: il `-RestartCount` dell'Utilita' di
   pianificazione riavvia le attivita' che NON RIESCONO A PARTIRE, non quelle
   il cui processo esce con un codice diverso da zero. Da li' in poi il
   magazzino resta giu' finche' non lo tocca una persona.

   LA REGOLA NON SI ROVESCIA: senza database il servizio continua a non
   partire. Smette solo di deciderlo in duecento millisecondi. Un magazzino
   che aspetta novanta secondi all'accensione non se ne accorge nessuno; un
   magazzino che non si accende lo scopre il primo che scansiona.

   L'ATTESA STA QUI E NON NEL SERVIZIO, perche' qui sta il problema: SQLite
   apre un file, e un file c'e' o non c'e'. Un server di database e' l'unica
   cosa, fra le due, che puo' essere «non ancora». */
const AVVIO_MS = Number(process.env.PATHFINDER_PG_ATTESA_AVVIO ?? 90_000);

/* GLI ERRORI CHE ASPETTARE NON RIPARA. La password e' sbagliata, il database
   non esiste, il ruolo non ha i permessi, l'host non si risolve: sono
   configurazione, e fra novanta secondi saranno identici. Aspettarli
   ritarderebbe soltanto il messaggio che dice dove andare a guardare.

   L'ELENCO E' QUESTO, E IL RESTO SI ASPETTA — compreso quel che non
   conosciamo, ed e' la scelta che conta. Al peggio si perde un minuto e
   mezzo una volta; il verso opposto — arrendersi a un codice che non
   avevamo previsto — e' esattamente il difetto che questa correzione chiude.
   I casi transitori veri, per chi legge: `ECONNREFUSED` (il server non
   ascolta ancora), `ECONNRESET` (ha accettato e chiuso: sta salendo),
   `57P03` («the database system is starting up»), `57P01`/`57P02` (si sta
   riavviando), `08006`, `ETIMEDOUT`. */
const NON_SI_RIPROVA = new Set([
  '28P01',          // invalid_password
  '28000',          // invalid_authorization_specification
  '3D000',          // invalid_catalog_name — il database non c'e'
  '42501',          // insufficient_privilege
  'ENOTFOUND',      // l'host non si risolve
]);

/* `pg` non sempre porta lo SQLSTATE. Su un rifiuto di credenziali o su un
   database che non c'e', il messaggio lo dice comunque. */
const PAROLE_DEFINITIVE =
  /password authentication|no pg_hba\.conf entry|does not exist|permission denied|role .* does not exist/i;

const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Questo errore puo' passare da solo, aspettando? */
function siRiprova(err) {
  const codice = String(err?.code ?? '');
  if (NON_SI_RIPROVA.has(codice)) return false;
  if (!codice && PAROLE_DEFINITIVE.test(String(err?.message ?? ''))) return false;
  return true;
}

/** Quanto si aspetta PRIMA del tentativo numero `n`. Il primo e' immediato:
    `attesaPrima(1)` non la chiama nessuno, e la scala vera e' 1s, 1s, 2s,
    4s, 8s, 8s… dal secondo tentativo in poi. */
function attesaPrima(n) {
  /* Un secondo, poi il doppio a ogni giro fino a otto: i primi tentativi
     stanno fitti perche' quasi sempre il database e' li' che sta salendo, e
     poi si allargano per non martellare un server che ha un guaio vero. */
  return Math.min(8_000, 1_000 * 2 ** Math.max(0, n - 2));
}

/* DOVE STANNO `pg_dump` E `pg_restore`.
   Non sono nel PATH di serie su Windows: l'installazione li mette sotto
   `Program Files\PostgreSQL\<major>\bin`. Si cerca li', si accetta un
   percorso dichiarato, e in mancanza si prova il PATH — cosi' su una
   macchina dove ci sono funziona senza configurare niente. */
function trovaBinario(nome) {
  const dichiarato = process.env[nome === 'pg_dump' ? 'PATHFINDER_PG_DUMP' : 'PATHFINDER_PG_RESTORE'];
  if (dichiarato) return dichiarato;
  const radici = [process.env['ProgramFiles'], process.env['ProgramW6432'], process.env['ProgramFiles(x86)']]
    .filter(Boolean).map(r => path.join(r, 'PostgreSQL'));
  for (const radice of radici) {
    let versioni = [];
    try { versioni = fs.readdirSync(radice); } catch { continue; }
    /* La piu' recente prima: un dump scritto da una versione piu' vecchia
       del server viene rifiutato, il contrario no. */
    for (const v of versioni.sort((a, b) => Number(b) - Number(a))) {
      const f = path.join(radice, v, 'bin', nome + '.exe');
      if (fs.existsSync(f)) return f;
    }
  }
  return nome;
}

function esegui(binario, argomenti, ambiente) {
  return new Promise((ok, no) => {
    execFile(binario, argomenti, { env: ambiente, timeout: DUMP_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, out, errOut) => {
        if (err) { err.message = `${path.basename(binario)}: ${String(errOut || err.message).trim()}`; return no(err); }
        ok(String(out));
      });
  });
}

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

  /* 2.12.1 — SI ASPETTA CHE IL SERVER RISPONDA, PRIMA DI DICHIARARLO ASSENTE.
     Una `SELECT 1` e nient'altro: il primo contatto vero deve essere la cosa
     piu' piccola che esista, o si finisce ad aspettare su un errore di
     schema credendo che sia il server a non esserci. Chi non vuole
     l'attesa — un collaudo, uno script — mette `PATHFINDER_PG_ATTESA_AVVIO`
     a `0` e il comportamento torna quello della 2.12. */
  async _attendiIlServer(limiteMs = AVVIO_MS, ora = Date.now, dormi = attendi) {
    const scadenza = ora() + limiteMs;
    for (let tentativo = 1; ; tentativo++) {
      try {
        await this.pool.query('SELECT 1');
        if (tentativo > 1) {
          console.error(`[pathfinder] database raggiunto al tentativo ${tentativo}.`);
        }
        return tentativo;
      } catch (err) {
        const riprovabile = siRiprova(err);
        const attesa = attesaPrima(tentativo + 1);
        if (!riprovabile || ora() + attesa > scadenza) {
          /* Il messaggio dice QUALE dei due casi e', perche' sono due guasti
             diversi e mandano a cercare in due posti diversi. */
          err.message = riprovabile
            ? `il database non ha risposto entro ${Math.round(limiteMs / 1000)}s ` +
              `(${tentativo} tentativi): ${err.message}`
            : `il database rifiuta la connessione, e aspettare non serve: ${err.message}`;
          throw err;
        }
        if (tentativo === 1) {
          console.error(`[pathfinder] il database non risponde ancora (${err.code || 'errore'}): ` +
                        `aspetto fino a ${Math.round(limiteMs / 1000)}s.`);
        }
        await dormi(attesa);
      }
    }
  }

  async pronto() {
    if (AVVIO_MS > 0) await this._attendiIlServer();
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

  /** Che estensione ha una copia di questo database. */
  get estensioneBackup() { return '.dump'; }

  /* IL BACKUP E' UN `pg_dump`, E SI RILEGGE PRIMA DI DICHIARARLO BUONO.

     Con SQLite si copiava un file. Qui si chiede a PostgreSQL un dump in
     formato custom: e' compresso, `pg_restore` ne ripesca anche un tavolo
     solo, e soprattutto e' COERENTE — `pg_dump` legge dentro una
     transazione, quindi non c'e' il problema del WAL che rendeva sbagliata
     la copia a freddo di un file SQLite aperto.

     LA PASSWORD NON VA NELLA RIGA DI COMANDO. Un `postgres://utente:password@`
     passato come argomento si legge nell'elenco dei processi. Va in
     `PGPASSWORD`, dentro l'ambiente del solo processo figlio.

     E SI VERIFICA. Un backup che dichiara «fatto» senza aver riletto quel
     che ha scritto e' il guasto che questa versione e' nata per togliere di
     mezzo: `pg_restore --list` deve rileggere il sommario, o il file si
     cancella e la rotta fallisce. Meglio nessun backup che uno che sembra
     un backup. */
  async backupTo(destinazione) {
    const u = new URL(this.stringa);
    fs.mkdirSync(path.dirname(destinazione), { recursive: true });

    const ambiente = Object.assign({}, process.env, { PGPASSWORD: decodeURIComponent(u.password || '') });
    const comuni = [
      '--host', u.hostname,
      '--port', u.port || '5432',
      '--username', decodeURIComponent(u.username || ''),
      '--no-password',
    ];

    await esegui(trovaBinario('pg_dump'), comuni.concat([
      '--dbname', u.pathname.slice(1),
      '--format', 'custom',
      '--compress', '6',
      '--file', destinazione,
    ]), ambiente);

    let sommario = '';
    try {
      sommario = await esegui(trovaBinario('pg_restore'), ['--list', destinazione], ambiente);
    } catch (err) {
      try { fs.unlinkSync(destinazione); } catch { /* se non c'e', tanto meglio */ }
      throw Object.assign(
        new Error(`il dump e' stato scritto ma non si rilegge, e non lo tengo: ${err.message}`),
        { status: 500 });
    }
    if (!/^;/m.test(sommario)) {
      try { fs.unlinkSync(destinazione); } catch { /* idem */ }
      throw Object.assign(
        new Error("il dump si apre ma non ha un sommario: non e' un backup"),
        { status: 500 });
    }
    return { file: destinazione, bytes: fs.statSync(destinazione).size };
  }

  async close() { await this.pool.end(); }
}

/* `siRiprova` e `attesaPrima` escono per essere collaudate da fermo: sono
   la decisione che questa correzione aggiunge, e provarla accendendo un
   PostgreSQL e spegnendolo a meta' non e' una prova, e' una coincidenza. */
module.exports = { DriverPostgres, siRiprova, attesaPrima };
