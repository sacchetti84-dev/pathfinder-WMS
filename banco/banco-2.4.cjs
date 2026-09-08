/* Banco 2.4 — il PACCHETTO COSTRUITO sulla 4199, contro una copia del
   magazzino vero. Serve `consegna/Pathfinder 2.4/app`, non il sorgente: la
   build minifica, e quel che il dev server mostra non e' quel che si installa.
   Non tocca C:\Pathfinder e non tocca la 4173. */
const path = require('path');
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_DB = path.resolve(__dirname, 'db', 'banco-2.4.db');
process.env.PATHFINDER_APP_DIR = path.resolve(__dirname, '..', 'consegna', 'Pathfinder 2.4', 'app');
/* 2.29.1 — L'AMBIENTE NON SI EREDITA. `PATHFINDER_PG` sta a livello macchina e
   VINCE su `PATHFINDER_DB` (`server/lib/db.js`): senza questa riga il banco apre
   il PostgreSQL del magazzino mentre porta e nome del file dicono «prova» — e'
   l'incidente del 26/08. Le `PATHFINDER_TLS_*` lo farebbero partire in HTTPS. */
process.env.PATHFINDER_PG = '';
require('../server/lib/tls.js').scollegaTls(process.env);
require('../server/pathfinder-server.js');
