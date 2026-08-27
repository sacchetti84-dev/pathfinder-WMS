/* Il banco per il browser: 4199, copia sua del database, e la 2.0 servita
   dal pacchetto. Resta acceso mentre Vite gli parla davanti. */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_APP_DIR = path.resolve(__dirname, '..', 'consegna', 'Pathfinder 2.0', 'app');
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'browser.db');
require('../server/pathfinder-server.js');
