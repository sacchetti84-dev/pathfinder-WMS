'use strict';

/* LO SCHEMA POSTGRESQL È SALITO IN `lib/` CON LA 2.6.

   Dalla 2.6 il driver PostgreSQL è in servizio, e un file che il servizio
   esegue non può stare in una cartella esclusa da `tsconfig.server.json`.
   Questo rimando resta perché `migra-sqlite-postgres.js` lo nomina ancora
   dal suo percorso di prima: cambiarlo in silenzio farebbe fallire una
   migrazione mesi dopo, quando nessuno ricorda lo spostamento. */

module.exports = require('../lib/schema-postgres');
