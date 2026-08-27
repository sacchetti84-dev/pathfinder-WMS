/* Banco 2.2 — servizio sulla 4199 contro la COPIA del 20/08 del database vero.
   Non tocca C:\Pathfinder e non tocca la 4173.

   Serve il sorgente, non un pacchetto: `PATHFINDER_APP_DIR` non è impostata,
   quindi il servizio fa solo da API e il client arriva da `vite dev` con
   PATHFINDER_DEV_API=http://127.0.0.1:4199. */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'pathfinder-2026-08-20.db');
require('../server/pathfinder-server.js');
