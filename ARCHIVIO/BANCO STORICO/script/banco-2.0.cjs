/* Banco 2.0 — servizio sulla 4199 contro la COPIA del 19/08 del database vero.
   Non tocca C:\Pathfinder e non tocca la 4173. */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_APP_DIR = path.resolve(__dirname, '..', 'consegna', 'Pathfinder 2.0', 'app');
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'pathfinder-2026-08-19.db');
require('../server/pathfinder-server.js');
