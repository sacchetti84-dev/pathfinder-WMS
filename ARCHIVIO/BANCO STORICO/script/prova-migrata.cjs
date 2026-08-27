/* Banco: serve la build APPENA COSTRUITA — quella con la migrazione a
   TypeScript dentro — sulla 4199, contro una COPIA del database. Non tocca
   C:\Pathfinder e non tocca il servizio vero, che resta sulla 4173.

   Serve a rispondere all'unica domanda che ne' `tsc` ne' i collaudi possono:
   trentacinque commit hanno spostato un pixel? */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_APP_DIR = path.resolve(__dirname, '..', 'consegna', 'Pathfinder 2.0', 'app');
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'pathfinder-2026-08-18.db');
require('../server/pathfinder-server.js');
