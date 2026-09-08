/* IL SERVIZIO DI BANCO, CON UN AMBIENTE CHE NON SI EREDITA — 2.29.1
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Il gemello di `dev-banco.mjs`. Quello impone `PATHFINDER_DEV_API` perché una
   finestra di sviluppo attaccata al magazzino vero non esista per costruzione;
   questo fa lo stesso dall'altra parte, e nasce perché la ricetta a mano di §5
   ha lasciato passare due difetti in due settimane.

   La ricetta chiedeva di scrivere cinque variabili in una riga di PowerShell.
   Chi la scrive vede quel che ha scritto, non quel che ha ereditato — e su
   questa macchina sette `PATHFINDER_*` stanno a livello MACCHINA. `PATHFINDER_PG`
   dimenticata ha portato un banco sul magazzino vero il 26/08; le due
   `PATHFINDER_TLS_*`, che nella ricetta non compaiono nemmeno perché sono
   arrivate con la 2.26, hanno fatto partire in HTTPS ogni banco da allora,
   contro prove che parlano in chiaro. Una riga in più nella ricetta si
   dimentica di nuovo: qui non c'è niente da ricordare.

     node banco\servizio-banco.mjs                      # ui.db, porta 4199
     node banco\servizio-banco.mjs db\video.db          # un altro database
     node banco\servizio-banco.mjs db\ui.db 4198        # e un'altra porta

   Il database si dice relativo a `banco\`, e DEVE già esistere: un banco che
   si crea da sé il file vuoto prova su niente e sembra funzionare. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scollegaTls } = require('../server/lib/tls.js');

const BANCO = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.resolve(BANCO, '..');

const db = path.resolve(BANCO, process.argv[2] || path.join('db', 'ui.db'));
const porta = String(process.argv[3] || 4199);

if (!fs.existsSync(db)) {
  console.error(`\n  Il database "${db}" non c'e'.`);
  console.error('  Una copia usa-e-getta si fa cosi\':\n');
  console.error('    Copy-Item banco\\db\\pristino.db banco\\db\\ui.db -Force\n');
  process.exit(1);
}

/* IL DATABASE VERO NON SI SERVE DA QUI, mai. `C:\Pathfinder\data\` è
   l'installazione: un banco che ci puntasse sopra scriverebbe nel magazzino
   con la porta che dice «prova». */
if (/^[a-z]:\\pathfinder\\/i.test(db)) {
  console.error(`\n  "${db}" sta dentro l'installazione. Il banco non ci lavora.\n`);
  process.exit(1);
}

const appDir = path.join(BANCO, 'app', 'corrente');

/* `PATHFINDER_PG: ''` E LE `PATHFINDER_TLS_*` VIA: sono le due che si sono
   dimenticate. `PATHFINDER_PG` vince su `PATHFINDER_DB` (`server/lib/db.js`),
   quindi ereditata manda tutto sul PostgreSQL di lavoro; le TLS fanno partire
   in HTTPS un banco che si interroga in chiaro. */
const env = scollegaTls({
  ...process.env,
  PATHFINDER_PORT: porta,
  PATHFINDER_DB: db,
  PATHFINDER_APP_DIR: appDir,
  PATHFINDER_PG: '',
  PATHFINDER_LOG: path.join(BANCO, 'db', 'log', `banco-${porta}.log`),
});

fs.mkdirSync(path.join(BANCO, 'db', 'log'), { recursive: true });

console.log(`\n  banco    http://127.0.0.1:${porta}  — in chiaro, per costruzione`);
console.log(`  database ${db}`);
console.log(`  app      ${appDir}`);
console.log('  front end: node banco\\dev-banco.mjs  (5199)\n');

spawn(process.execPath, [path.join(RADICE, 'server', 'pathfinder-server.js')], {
  cwd: RADICE, stdio: 'inherit', env,
}).on('exit', (c) => process.exit(c ?? 0));
