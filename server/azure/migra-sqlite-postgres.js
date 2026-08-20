'use strict';

/* LA MIGRAZIONE DA SQLITE A POSTGRESQL — 2.1, ramo parallelo.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   NON GIRA DA SOLO E NON LO CHIAMA NESSUNO. Si lancia a mano, su una copia,
   quando qualcuno decide di provare il ramo Azure:

     node server/azure/migra-sqlite-postgres.js --da "banco\\db\\pathfinder-<data>.db" --prova

   `--prova` legge, conta e non scrive: è il modo di sapere quanto c'è
   dentro e se il file si apre, senza aver ancora acceso niente dall'altra
   parte. Senza `--prova` serve `PATHFINDER_PG` con la stringa di
   connessione, e il modulo `pg`, che NON è una dipendenza di questo
   progetto — §6 dice «niente dipendenze nuove senza motivo forte», e un
   ramo che non è in servizio non è un motivo forte. Chi vuole provare:

     npm install --no-save pg

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
const { NAMES, COLLECTIONS, materialize } = require('../lib/schema');
const { schemaCompleto } = require('./schema-postgres');

function argomento(nome, ripiego = null) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : ripiego;
}

const SOLO_PROVA = process.argv.includes('--prova');
const DA = argomento('--da', process.env.PATHFINDER_DB || null);
const A = process.env.PATHFINDER_PG || null;
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
    esci('Il modulo `pg` non è installato — è voluto: non è una dipendenza del progetto.\n'
       + '    Per provare questo ramo:  npm install --no-save pg');
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

async function scriviTavolo(pool, nome, righe) {
  const col = COLLECTIONS[nome];
  const materializzate = col.indexed.filter((f) => f !== col.pk);
  const colonne = [col.pk, ...materializzate, 'data'];

  for (let i = 0; i < righe.length; i += LOTTO) {
    const fetta = righe.slice(i, i + LOTTO);
    const valori = [];
    const segnaposti = [];
    let n = 0;

    for (const r of fetta) {
      /* Il documento è la verità; le colonne si RICALCOLANO da lui. Vedi
         il commento in testa: una colonna rimasta indietro a SQLite non si
         porta dietro il proprio errore. */
      const doc = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
      const mat = materialize(nome, doc);
      const riga = [r[col.pk], ...materializzate.map((f) => mat[f]), JSON.stringify(doc)];
      segnaposti.push(`(${riga.map(() => `$${++n}`).join(', ')})`);
      valori.push(...riga);
    }

    await pool.query(
      `INSERT INTO ${nome} (${colonne.join(', ')}) VALUES ${segnaposti.join(', ')}
       ON CONFLICT (${col.pk}) DO NOTHING`,
      valori,
    );
  }

  /* La sequenza va riallineata a mano: le righe sono entrate col loro `_id`,
     e `BIGSERIAL` non lo sa. Senza questa riga la prima scrittura nuova
     riparte da 1 e sbatte contro la chiave primaria. */
  if (col.pkType === 'auto' && righe.length) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${col.pk}) FROM ${nome}), 1))`,
      [nome, col.pk],
    );
  }
}

async function main() {
  console.log('\n  Migrazione SQLite → PostgreSQL — ramo parallelo, non in servizio\n');
  const db = apriSqlite(DA ? path.resolve(DA) : null);
  console.log(`  Da:  ${path.resolve(DA)}`);
  console.log(`  A:   ${SOLO_PROVA ? '— (solo prova: non si scrive niente)' : A.replace(/:[^:@]*@/, ':***@')}\n`);

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
