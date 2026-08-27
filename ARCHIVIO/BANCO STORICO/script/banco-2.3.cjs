/* Banco 2.3 — il PACCHETTO COSTRUITO sulla 4199, contro una copia del
   database. Serve `consegna/Pathfinder 2.3/app`, non il sorgente: la build
   minifica, e quel che il dev server mostra non e' quel che si installa.
   Non tocca C:\Pathfinder e non tocca la 4173. */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'banco-2.3.db');
process.env.PATHFINDER_APP_DIR = path.resolve(__dirname, '..', 'consegna', 'Pathfinder 2.3', 'app');
require('../server/pathfinder-server.js');
