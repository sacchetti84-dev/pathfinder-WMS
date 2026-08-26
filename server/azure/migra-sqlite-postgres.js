'use strict';

/* LA MIGRAZIONE DA SQLITE A POSTGRESQL — 2.1, aggiornata nella 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   NON GIRA DA SOLO: si lancia a mano, su una COPIA, il giorno che si porta
   il magazzino su PostgreSQL. Dalla 2.6 il driver PostgreSQL e' in servizio
   — si accende con `PATHFINDER_PG` — e questo file e' il gesto che porta
   dall'altra parte i dati che ci sono gia'.

   COSA E' CAMBIATO NELLA 2.6:
   · lo SQL non e' piu' scritto qui: viene da `lib/sql.js`, lo stesso che usa
     il servizio. Due pezzi di SQL che scrivono la stessa cosa divergono;
   · i codici si maiuscolano copiando, come li scriverebbe il servizio;
   · prima di copiare gira l'audit, e la migrazione si FERMA se il database
     di partenza ha valori che PostgreSQL rifiuta o grafie che collidono.

     node server/azure/migra-sqlite-postgres.js --da "banco\\db\\pathfinder-<data>.db" --prova

   `--prova` legge, conta e non scrive: è il modo di sapere quanto c'è
   dentro e se il file si apre, senza aver ancora acceso niente dall'altra
   parte. Senza `--prova` serve `PATHFINDER_PG` con la stringa di
   connessione, e il modulo `pg`, che dalla 2.6 E' una dipendenza del
   servizio: si installa con le altre.

     cd server && npm install

   SI MIGRA UNA COPIA, MAI IL DATABASE IN SERVIZIO. La copia si chiede al
   servizio, che la scrive a caldo:

     Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup `
       -ContentType 'application/json' -Body (@{dir="$PWD\\banco\\db"} | ConvertTo-Json)

   COSA GARANTISCE, E COSA NO. Copia i venti tavoli riga per riga, con le
   colonne materializzate ricalcolate dal documento invece che ricopiate:
   se una colonna a SQLite fosse rimasta indietro rispetto al suo `data` —
   il difetto `updated_at` / `last_updated_at` della coda di lavoro è
   esattamente questo — la copia nasce coerente. Il `_id` automatico viene
   PRESERVATO, non rigenerato: `tasks.mov_ids` e i riferimenti agli archivi
   puntano a quei numeri, e rinumerare vorrebbe dire rompere in silenzio i
   legami che il registro delle attività legge.

   Alla fine ricontrolla i conteggi tavolo per tavolo e li stampa. Un numero
   che non torna ferma tutto con l'errore scritto: una migrazione che finisce
   dicendo «fatto» su diciannove tavoli su venti è peggio di una che non
   parte. */

const fs = require('node:fs');
const path = require('node:path');
const { NAMES, COLLECTIONS, normalizza } = require('../lib/schema');
const { schemaCompleto } = require('../lib/schema-postgres');
const SQL = require('../lib/sql');
const { analizza: analizzaAudit } = require('./audit-sqlite');
const { analizza: analizzaMaiuscole } = require('../../banco/maiuscola-codici.cjs');

function argomento(nome, ripiego = null) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : ripiego;
}

const SOLO_PROVA = process.argv.includes('--prova');
const DA = argomento('--da', process.env.PATHFINDER_DB || null);
/* La stringa si cerca dove la cerca il servizio, o migrazione e servizio
   finirebbero su due database diversi senza che nessuno se ne accorga. */
const A = process.env.PATHFINDER_PG
  || require('../lib/db').leggiEnvLocale(path.join(__dirname, '..', '..')).PATHFINDER_PG
  || null;
/* Quante righe per giro. `mov_log` su un magazzino vero è centinaia di
   migliaia di righe, e una INSERT per riga sono centinaia di migliaia di
   viaggi di rete verso un database che sta in un'altra città. */
const LOTTO = Number(process.env.PATHFINDER_PG_LOTTO) || 500;

function esci(messaggio) {
  console.error(`\n  ✗ ${messaggio}\n`);
  process.exit(1);
}

function apriSqlite(file) {
  if (!file) esci('Manca il database di partenza: --da "percorso\\pathfinder.db"');
  if (!fs.existsSync(file)) esci(`Il file ${file} non esiste`);
  let Database;
  try {
    Database = require('node:sqlite').DatabaseSync;
  } catch {
    try {
      Database = require('better-sqlite3');
    } catch {
      esci('Nessun lettore SQLite disponibile: serve Node con `node:sqlite`, oppure `npm install --no-save better-sqlite3`');
    }
  }
  return new Database(file);
}

async function apriPostgres(stringa) {
  if (!stringa) {
    esci('Manca la stringa di connessione: PATHFINDER_PG=postgres://utente:password@host:5432/pathfinder?sslmode=require');
  }
  let pg;
  try {
    pg = require('pg');
  } catch {
    esci("Il modulo `pg` non si trova. Installare le dipendenze del servizio:\n    cd server && npm install");
  }
  /* Il pool, non una connessione sola: Flexible Server chiude le connessioni
     inattive, e una connessione tenuta aperta per tutta la migrazione muore
     a metà su un tavolo grande. Con `max: 1` resta comunque una scrittura
     alla volta, che è quello che serve a una migrazione. */
  const pool = new pg.Pool({
    connectionString: stringa,
    max: 1,
    idleTimeoutMillis: 30_000,
    ssl: /sslmode=require/.test(stringa) ? { rejectUnauthorized: true } : undefined,
  });
  await pool.query('SELECT 1');
  return pool;
}

function leggiTutto(db, nome) {
  try {
    return db.prepare(`SELECT * FROM ${nome}`).all();
  } catch (e) {
    /* Un tavolo che non c'è è un database più vecchio dello schema: si dice
       e si va avanti, invece di fermare una migrazione per una collezione
       che a quel magazzino non è mai servita. */
    console.warn(`    · ${nome}: non presente nel database di partenza (${e.message})`);
    return null;
  }
}

/* LO SQL È QUELLO DEL SERVIZIO, NON UNA COPIA — 2.6.
   Fino alla 2.5 questo file costruiva la propria INSERT. Due pezzi di SQL
   che scrivono la stessa cosa sono due pezzi che divergono, e la
   divergenza qui vuol dire un database migrato che si comporta
   diversamente da quello che il servizio scriverebbe. `lib/sql.js` è
   l'unico posto in cui una riga diventa SQL. */
async function scriviTavolo(pool, nome, righe) {
  const col = COLLECTIONS[nome];

  /* IL DOCUMENTO È LA VERITÀ; le colonne si RICALCOLANO da lui. Una colonna
     rimasta indietro a SQLite non si porta dietro il proprio errore.
     E i codici si maiuscolano, come li scriverebbe il servizio di oggi. */
  const documenti = righe.map((r) => {
    const doc = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
    doc[col.pk] = r[col.pk];
    return normalizza(nome, doc);
  });

  for (const lotto of SQL.aLotti(nome, documenti, SQL.POSTGRES)) {
    /* `conChiave` sempre: il `_id` SI PRESERVA, non si rigenera.
       `tasks.mov_ids` e i riferimenti degli archivi puntano a quei numeri, e
       rinumerare romperebbe in silenzio i legami che il registro delle
       attività legge. */
    const { sql, args } = SQL.sqlInserisci(nome, lotto, SQL.POSTGRES, { conChiave: true });
    await pool.query(sql.replace(/ RETURNING .*$/, ` ON CONFLICT (${col.pk}) DO NOTHING`), args);
  }

  /* La sequenza va riallineata a mano: le righe sono entrate col loro `_id`,
     e `BIGSERIAL` non lo sa. Senza questa riga la prima scrittura nuova
     riparte da 1 e sbatte contro la chiave primaria. */
  if (col.pkType === 'auto' && righe.length) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${col.pk}) FROM ${nome}), 0) + 1, false)`,
      [nome, col.pk],
    );
  }
}

/* NON SI MIGRA UN DATABASE SPORCO — è il punto 1 della lista del 26/08.
   Un byte zero dentro una stringa sta a SQLite e non entra in PostgreSQL:
   la INSERT viene rifiutata a metà tavolo, con dieci tavoli già scritti. E
   due grafie dello stesso lotto, maiuscolate qui, diventano una chiave sola
   e violano l'indice. Tutte e due si vedono prima, e costano due secondi. */
function guardiaDatiSporchi(db) {
  const audit = analizzaAudit(db);
  if (audit.blocchi) {
    const dettaglio = Object.entries(audit.collezioni)
      .filter(([, c]) => c.ostacoli.length || c.fuoriBigint.length)
      .map(([n, c]) => n + `: ` + c.ostacoli.map((o) => o.percorso + ` ` + o.tipo).join(`, `))
      .join(`\n    `);
    esci(
      `Il database di partenza ha ${audit.blocchi} valori che PostgreSQL rifiuta:\n    ${dettaglio}\n`
      + `\n  Si guardano per esteso con:\n`
      + `    node server/azure/audit-sqlite.js --da "<file>"`);
  }

  const mai = analizzaMaiuscole(db);
  const scontri = [...mai.fusioni, ...mai.scontri];
  if (scontri.length) {
    const elenco = scontri.map((f) => f.collezione + ` [` + f.chiave + `] ` + f.valore).join(`\n    `);
    esci(
      `Maiuscolando i codici, ${scontri.length} gruppi di righe collidono su una chiave sola:\n    ${elenco}\n`
      + `\n  Vanno risolti PRIMA, sulla copia, con:\n`
      + `    node banco/maiuscola-codici.cjs --da "<file>" --scrivi`);
  }
  return audit;
}

async function main() {
  console.log('\n  Migrazione SQLite → PostgreSQL\n');
  const db = apriSqlite(DA ? path.resolve(DA) : null);
  console.log(`  Da:  ${path.resolve(DA)}`);
  console.log(`  A:   ${SOLO_PROVA ? '— (solo prova: non si scrive niente)' : A.replace(/:[^:@]*@/, ':***@')}\n`);

  console.log('  Audit del database di partenza…');
  guardiaDatiSporchi(db);
  console.log("    nessun ostacolo, nessuna collisione di grafia\n");

  const contenuto = new Map();
  let totale = 0;
  for (const nome of NAMES) {
    const righe = leggiTutto(db, nome);
    if (righe === null) continue;
    contenuto.set(nome, righe);
    totale += righe.length;
    console.log(`    ${nome.padEnd(20)} ${String(righe.length).padStart(8)} righe`);
  }
  console.log(`\n    ${'TOTALE'.padEnd(20)} ${String(totale).padStart(8)} righe\n`);

  if (SOLO_PROVA) {
    console.log('  Solo prova: niente è stato scritto. Togliere --prova per migrare davvero.\n');
    return;
  }

  const pool = await apriPostgres(A);
  try {
    console.log('  Creo schema e indici…');
    for (const sql of schemaCompleto()) await pool.query(sql);

    console.log('  Copio i dati…');
    for (const [nome, righe] of contenuto) {
      if (!righe.length) continue;
      await scriviTavolo(pool, nome, righe);
      console.log(`    ${nome.padEnd(20)} scritto`);
    }

    console.log('\n  Ricontrollo i conteggi…');
    const storti = [];
    for (const [nome, righe] of contenuto) {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${nome}`);
      const n = rows[0].n;
      const segno = n === righe.length ? '✓' : '✗';
      console.log(`    ${segno} ${nome.padEnd(20)} ${String(n).padStart(8)} / ${righe.length}`);
      if (n !== righe.length) storti.push(`${nome}: ${n} invece di ${righe.length}`);
    }
    if (storti.length) esci(`Migrazione INCOMPLETA:\n    ${storti.join('\n    ')}`);
    console.log('\n  ✓ Migrazione completa, e i conteggi tornano tavolo per tavolo.\n');
  } finally {
    await pool.end();
  }
}

main().catch((e) => esci(e.stack || e.message));
