/* Banco 2.4 — il PACCHETTO COSTRUITO sulla 4199, contro una copia del
   magazzino vero. Serve `consegna/Pathfinder 2.4/app`, non il sorgente: la
   build minifica, e quel che il dev server mostra non e' quel che si installa.
   Non tocca C:\Pathfinder e non tocca la 4173. */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'banco-2.4.db');
process.env.PATHFINDER_APP_DIR = path.resolve(__dirname, '..', 'consegna', 'Pathfinder 2.4', 'app');
require('../server/pathfinder-server.js');
