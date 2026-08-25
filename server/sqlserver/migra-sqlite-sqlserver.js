'use strict';

/* LA MIGRAZIONE DA SQLITE A SQL SERVER - 2.2, ramo parallelo.
   (c) Andrea Sacchetti - Dietopack S.r.l. (Naturacare Group)

   NON GIRA DA SOLO E NON LO CHIAMA NESSUNO. Si lancia a mano, su una COPIA:

     node server/sqlserver/migra-sqlite-sqlserver.js --da "banco\db\pathfinder-<data>.db" --prova

   `--prova` legge, conta e non scrive: e' il modo di sapere quanto c'e'
   dentro e se il file si apre, senza aver ancora acceso niente dall'altra
   parte. Senza `--prova` serve `PATHFINDER_MSSQL` con la stringa di
   connessione, e il modulo `mssql`, che **NON e' una dipendenza di questo
   progetto** - §6 dice «niente dipendenze nuove senza motivo forte», e un
   ramo che non e' in servizio non e' un motivo forte. Chi vuole provare:

     npm install --no-save mssql

   SI MIGRA UNA COPIA, MAI IL DATABASE IN SERVIZIO. La copia la scrive il
   servizio, a caldo:

     Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup `
       -ContentType 'application/json' -Body (@{dir="$PWD\banco\db"} | ConvertTo-Json)

   ─── LE DUE COSE CHE SU SQL SERVER SONO DIVERSE DAVVERO ────────────────

   1. **`SET IDENTITY_INSERT`.** `_id` si PRESERVA, non si rigenera:
      `tasks.mov_ids` e i riferimenti degli archivi puntano a quei numeri, e
      rinumerare romperebbe in silenzio i legami che il registro delle
      attivita' legge. Ma una colonna `IDENTITY` rifiuta un valore scritto da
      fuori finche' non le si dice il contrario, e glielo si dice **una
      tabella per volta**: SQL Server ne ammette una sola accesa per
      sessione, quindi si accende, si scrive, si spegne, e si passa alla
      prossima. Farlo per tutte insieme non e' piu' veloce: e' un errore.

   2. **`DBCC CHECKIDENT ... RESEED`.** Dopo aver scritto gli `_id` a mano,
      il contatore della tabella e' rimasto dov'era - cioe' a zero. Senza il
      riallineamento la prima scrittura nuova riparte da 1 e sbatte contro la
      chiave primaria, a magazzino aperto. E' lo stesso problema che di la'
      si chiudeva con `setval`, con un nome diverso.

   ─── COSA GARANTISCE, E COSA NO ────────────────────────────────────────

   Copia le venti collezioni riga per riga, con le colonne materializzate
   **ricalcolate dal documento** invece che ricopiate: se una colonna a
   SQLite fosse rimasta indietro rispetto al suo `data` - il difetto
   `updated_at` / `last_updated_at` della voce 14 e' esattamente questo, e
   la voce 38 sulle maiuscole e' un altro caso - la copia nasce coerente
   invece di portarsi dietro l'errore.

   Alla fine ricontrolla i conteggi tavolo per tavolo e li stampa. Un numero
   che non torna ferma tutto con l'errore scritto: una migrazione che finisce
   dicendo «fatto» su diciannove tavoli su venti e' peggio di una che non
   parte.

   QUELLO CHE QUESTO SCRIPT NON FA, ed e' il grosso del lavoro: `lib/db.js`
   sono 315 righe di SQLite **sincrono**, e ogni rotta, ogni transazione
   composta e le 98 prove del servizio diventano asincrone. Non e' qui, e non
   e' un dettaglio - vedi §2 dell'INDEX, «Lavoro di fondo». */

const fs = require('node:fs');
const path = require('node:path');
const { NAMES, COLLECTIONS, materialize } = require('../lib/schema');
const { schemaCompleto } = require('./schema-sqlserver');

function argomento(nome, ripiego = null) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : ripiego;
}

const SOLO_PROVA = process.argv.includes('--prova');
const DA = argomento('--da', process.env.PATHFINDER_DB || null);
const A = process.env.PATHFINDER_MSSQL || null;
/* Quante righe per giro. `mov_log` su un magazzino vero e' centinaia di
   migliaia di righe, e una INSERT per riga sono centinaia di migliaia di
   viaggi di rete. Duecento e non cinquecento come di la': SQL Server ha un
   tetto di **2100 parametri** per istruzione, e qui ogni riga ne consuma uno
   per colonna - la collezione piu' larga ne ha sette, e 200 x 7 sta sotto. */
const LOTTO = Number(process.env.PATHFINDER_MSSQL_LOTTO) || 200;

function esci(messaggio) {
  console.error(`\n  ${messaggio}\n`);
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

async function apriSqlServer(stringa) {
  if (!stringa) {
    esci('Manca la stringa di connessione:\n'
       + "    PATHFINDER_MSSQL='Server=host;Database=pathfinder;User Id=utente;Password=...;Encrypt=true'\n"
       + '    Su un\'istanza interna con autenticazione integrata la password non serve:\n'
       + "    PATHFINDER_MSSQL='Server=host;Database=pathfinder;Trusted_Connection=true;Encrypt=true'");
  }
  let mssql;
  try {
    mssql = require('mssql');
  } catch {
    esci('Il modulo `mssql` non e\' installato - e\' voluto: non e\' una dipendenza del progetto.\n'
       + '    Per provare questo ramo:  npm install --no-save mssql');
  }
  const pool = await mssql.connect(stringa);
  await pool.request().query('SELECT 1');
  return { mssql, pool };
}

function leggiTutto(db, nome) {
  try {
    return db.prepare(`SELECT * FROM ${nome}`).all();
  } catch (e) {
    /* Un tavolo che non c'e' e' un database piu' vecchio dello schema: si
       dice e si va avanti, invece di fermare una migrazione per una
       collezione che a quel magazzino non e' mai servita. */
    console.warn(`    · ${nome}: non presente nel database di partenza (${e.message})`);
    return null;
  }
}

/** Il valore di una colonna materializzata, col tipo che il driver si
    aspetta. `materialize` restituisce gia' stringhe e numeri; qui si tiene
    solo il `null`, che deve restare `null` e non diventare la stringa. */
function bind(richiesta, mssqlLib, nome, valore, numerica) {
  if (valore === null || valore === undefined) {
    richiesta.input(nome, numerica ? mssqlLib.BigInt : mssqlLib.NVarChar, null);
  } else if (numerica) {
    richiesta.input(nome, mssqlLib.BigInt, Number(valore));
  } else {
    richiesta.input(nome, mssqlLib.NVarChar, String(valore));
  }
}

async function scriviTavolo({ mssql, pool }, nome, righe) {
  const col = COLLECTIONS[nome];
  const materializzate = col.indexed.filter((f) => f !== col.pk);
  const numeriche = new Set(col.numeric || []);
  const colonne = [col.pk, ...materializzate, 'data'];
  const quotate = colonne.map((c) => `[${c}]`).join(', ');
  const identita = col.pkType === 'auto';

  /* Punto 1 in testa: una tabella per volta, e si spegne anche se la
     scrittura fallisce - una IDENTITY_INSERT lasciata accesa fa fallire la
     prossima tabella con un errore che non parla di questa. */
  if (identita) await pool.request().query(`SET IDENTITY_INSERT [${nome}] ON`);
  try {
    for (let i = 0; i < righe.length; i += LOTTO) {
      const fetta = righe.slice(i, i + LOTTO);
      const richiesta = pool.request();
      const tuple = [];
      let n = 0;

      for (const r of fetta) {
        /* Il documento e' la verita'; le colonne si RICALCOLANO da lui. */
        const doc = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
        const mat = materialize(nome, doc);
        const segnaposti = [];

        const pk = `p${++n}`;
        bind(richiesta, mssql, pk, r[col.pk], identita);
        segnaposti.push(`@${pk}`);

        for (const f of materializzate) {
          const nm = `p${++n}`;
          bind(richiesta, mssql, nm, mat[f], numeriche.has(f));
          segnaposti.push(`@${nm}`);
        }

        const nd = `p${++n}`;
        richiesta.input(nd, mssql.NVarChar(mssql.MAX), JSON.stringify(doc));
        segnaposti.push(`@${nd}`);

        tuple.push(`(${segnaposti.join(', ')})`);
      }

      await richiesta.query(`INSERT INTO [${nome}] (${quotate}) VALUES ${tuple.join(', ')}`);
    }
  } finally {
    if (identita) await pool.request().query(`SET IDENTITY_INSERT [${nome}] OFF`);
  }

  /* Punto 2 in testa. `RESEED` col massimo scritto: la prossima riga nuova
     prende quel numero piu' uno. Su una tabella rimasta vuota non si tocca
     niente - un reseed a 0 su una tabella vuota e' legittimo ma inutile, e
     su alcune versioni si comporta diversamente. */
  if (identita && righe.length) {
    const massimo = righe.reduce((m, r) => Math.max(m, Number(r[col.pk]) || 0), 0);
    if (massimo > 0) {
      await pool.request().query(`DBCC CHECKIDENT ('${nome}', RESEED, ${massimo})`);
    }
  }
}

async function main() {
  console.log('\n  Migrazione SQLite -> SQL Server - ramo parallelo, non in servizio\n');
  const db = apriSqlite(DA ? path.resolve(DA) : null);
  console.log(`  Da:  ${path.resolve(DA)}`);
  console.log(`  A:   ${SOLO_PROVA ? '- (solo prova: non si scrive niente)'
                                   : A.replace(/(Password\s*=)[^;]*/i, '$1***')}\n`);

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
    console.log('  Solo prova: niente e\' stato scritto. Togliere --prova per migrare davvero.\n');
    return;
  }

  const conn = await apriSqlServer(A);
  try {
    console.log('  Creo schema e indici...');
    for (const sql of schemaCompleto()) await conn.pool.request().query(sql);

    console.log('  Copio i dati...');
    for (const [nome, righe] of contenuto) {
      if (!righe.length) continue;
      await scriviTavolo(conn, nome, righe);
      console.log(`    ${nome.padEnd(20)} scritto`);
    }

    console.log('\n  Ricontrollo i conteggi...');
    const storti = [];
    for (const [nome, righe] of contenuto) {
      const res = await conn.pool.request().query(`SELECT COUNT(*) AS n FROM [${nome}]`);
      const n = res.recordset[0].n;
      const segno = n === righe.length ? 'ok  ' : 'NO  ';
      console.log(`    ${segno}${nome.padEnd(20)} ${String(n).padStart(8)} / ${righe.length}`);
      if (n !== righe.length) storti.push(`${nome}: ${n} invece di ${righe.length}`);
    }
    if (storti.length) esci(`Migrazione INCOMPLETA:\n    ${storti.join('\n    ')}`);
    console.log('\n  Migrazione completa, e i conteggi tornano tavolo per tavolo.\n');
  } finally {
    await conn.pool.close();
  }
}

main().catch((e) => esci(e.stack || e.message));
