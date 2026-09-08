/* Banco: avvia il servizio sulla 4199 contro la STESSA cartella-versione che
   sta usando la produzione, ma con il database di prova. Serve a separare due
   cose che il 17/08 sembravano una sola: se qui l'applicativo esce, il percorso
   e il codice sono a posto e la differenza e' il conto con cui gira il servizio
   vero (SYSTEM). Legge soltanto: non scrive niente in C:\Pathfinder, e il database
   e' quello di prova — vedi le righe in fondo. */
process.env.PATHFINDER_PORT = '4199';
process.env.PATHFINDER_APP_DIR = 'C:\\Pathfinder\\app\\corrente';
process.env.PATHFINDER_DB = require('path').resolve(__dirname, 'db', 'pathfinder-2026-08-17.db');
/* 2.29.1 — LE DUE RIGHE CHE MANCAVANO, E FACEVANO IL CONTRARIO DI QUEL CHE DICE
   LA TESTATA. `PATHFINDER_PG` sta a livello macchina e VINCE su `PATHFINDER_DB`
   (`lib/db.js`): ereditata, questo banco apriva il PostgreSQL del magazzino
   mentre la porta e il nome del file dicevano «prova». E' l'incidente del 26/08.
   Le `PATHFINDER_TLS_*` fanno partire in HTTPS un banco che si interroga in
   chiaro. Nessuna delle due si eredita. */
process.env.PATHFINDER_PG = '';
require('../server/lib/tls.js').scollegaTls(process.env);
require('../server/pathfinder-server.js');
