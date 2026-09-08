'use strict';

/* QUALE DATABASE C'E' DIETRO, LO DECIDE UNA VARIABILE — 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

     PATHFINDER_PG assente   → SQLite, come dalla 1.4. E' la via di casa.
     PATHFINDER_PG presente  → PostgreSQL con quella stringa di connessione.

   PERCHE' DUE E NON UNO. La 2.6 si installa in magazzino senza toccare il
   database: il servizio nuovo apre lo stesso file di prima e si comporta
   come la 2.5. Il passaggio a PostgreSQL diventa un secondo gesto,
   separato, che si prova a banco e si annulla spegnendo una variabile —
   invece di un salto solo in cui, se qualcosa non va, non c'e' un
   `torna-indietro.ps1` che valga. La 2.3 ha gia' insegnato quanto costa.

   E' anche l'unico modo di collaudare le due strade a confronto sugli
   stessi dati: `test/driver.test.js` fa girare le stesse prove su tutti e
   due, e una differenza di comportamento fa fallire il collaudo invece di
   arrivare in corsia.

   LA STRINGA DI CONNESSIONE NON STA NEL REPOSITORY. Al banco in
   `.env.local`, che `.gitignore` esclude; per il servizio vero in Azure Key
   Vault, mai in uno script di installazione. */

const fs = require('node:fs');
const path = require('node:path');
const { DriverSqlite } = require('./driver-sqlite');

/** Legge `.env.local` se c'e'. Al banco, e solo li'. */
function leggiEnvLocale(radice) {
  const file = path.join(radice, '.env.local');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const riga of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = riga.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Apre il database e restituisce il driver pronto.
 * @param {{ file?: string, pg?: string|null, radice?: string }} [opzioni]
 */
async function apriDatabase(opzioni = {}) {
  const radice = opzioni.radice || path.join(__dirname, '..', '..');
  const locale = leggiEnvLocale(radice);
  /* La variabile di macchina batte `.env.local`, e IMPOSTARLA VUOTA vuol
     dire «no, SQLite». Serve a chi collauda: il banco SQLite non deve
     cambiare comportamento perche' su quella macchina qualcuno ha lasciato
     una stringa di connessione in un file. */
  const dichiarata = Object.prototype.hasOwnProperty.call(process.env, 'PATHFINDER_PG');
  const pg = opzioni.pg !== undefined ? opzioni.pg
    : dichiarata ? (process.env.PATHFINDER_PG || null)
    : (locale.PATHFINDER_PG || null);

  if (pg) {
    /* Si carica solo se serve: chi resta su SQLite non deve avere `pg`
       installato perche' il servizio parta. */
    const { DriverPostgres } = require('./driver-postgres');
    const d = new DriverPostgres(pg, opzioni);
    await d.pronto();
    return d;
  }

  const file = opzioni.file || process.env.PATHFINDER_DB
    || path.join(radice, 'server', 'data', 'pathfinder.db');
  return new DriverSqlite(file);
}

/* Il nome storico, per chi apre SQLite direttamente — i collaudi del
   servizio e gli script di banco. I metodi sono asincroni dalla 2.6. */
const PathfinderDB = DriverSqlite;

module.exports = { apriDatabase, PathfinderDB, DriverSqlite, leggiEnvLocale };
