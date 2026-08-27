/* Banco — il PACCHETTO 2.2 ricostruito il 24/08 sulla 4199, contro una copia
   del database. Serve `consegna/Pathfinder 2.2/app`, non il sorgente.
   Non tocca C:\Pathfinder e non tocca la 4173. */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'fix-2.2.db');
process.env.PATHFINDER_APP_DIR = path.resolve(__dirname, '..', 'consegna', 'Pathfinder 2.2', 'app');
require('../server/pathfinder-server.js');
