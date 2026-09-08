/* Il banco per il browser: 4199, copia sua del database, e la 2.0 servita
   dal pacchetto. Resta acceso mentre Vite gli parla davanti. */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_APP_DIR = path.resolve(__dirname, '..', 'consegna', 'Pathfinder 2.0', 'app');
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'browser.db');
/* 2.29.1 — L'AMBIENTE NON SI EREDITA. `PATHFINDER_PG` sta a livello macchina e
   VINCE su `PATHFINDER_DB` (`server/lib/db.js`): senza questa riga il banco apre
   il PostgreSQL del magazzino mentre porta e nome del file dicono «prova» — e'
   l'incidente del 26/08. Le `PATHFINDER_TLS_*` lo farebbero partire in HTTPS. */
process.env.PATHFINDER_PG = '';
require('../server/lib/tls.js').scollegaTls(process.env);
require('../server/pathfinder-server.js');
