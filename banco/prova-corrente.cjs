/* Banco: avvia il servizio sulla 4199 contro la STESSA cartella-versione che
   sta usando la produzione, ma con il database di prova. Serve a separare due
   cose che il 17/08 sembravano una sola: se qui l'applicativo esce, il percorso
   e il codice sono a posto e la differenza e' il conto con cui gira il servizio
   vero (SYSTEM). Legge soltanto: non scrive niente in C:\Pathfinder. */
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_APP_DIR = 'C:\\Pathfinder\\app\\corrente';
process.env.PATHFINDER_DB = require('path').resolve(__dirname, 'db', 'pathfinder-2026-08-17.db');
require('../server/pathfinder-server.js');
