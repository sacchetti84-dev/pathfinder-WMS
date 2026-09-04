/* IL BANCO A VIDEO — accende, e dice cosa incollare.

   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   PERCHÉ UN BANCO A VIDEO, quando ce n'è già uno sul ciclo. Le 1.476 prove
   che questo progetto ha oggi passano tutte da `fetch`: nessuna guarda il
   DOM. Sono forti su quel che il magazzino CALCOLA e debolissime su quel che
   l'operatore VEDE, e la differenza non è teorica — in una sola giornata di
   lavoro sono usciti sei difetti che nessuna di quelle prove poteva vedere:
   due badge grigi al posto di due stati diversi, il nome di un'icona
   stampato come testo in barra, tre scorciatoie su sette che non aprivano
   niente, nove attributi `class` scritti due volte e quindi mai applicati,
   sessantanove icone finite dentro messaggi che scrivono testo, e una
   preferenza che non sopravviveva al ricaricamento.

   NON TOCCA I DATI VERI, ed è la prima cosa da capire. `npm run dev` manda
   `/api` alla 4173, cioè al servizio installato su questa macchina, coi dati
   veri dentro. Questo banco no: accende un servizio SUO sulla 4199, con una
   COPIA di `pristino.db`, e serve l'applicativo dalla stessa porta. Una
   pagina sola, un'origine sola, un database usa e getta.

   COME SI ENTRA SENZA UN PIN. Le rotte vogliono una sessione, e il banco non
   ha una persona che digiti sei cifre. Si entra dalla porta di servizio — la
   stessa dell'installer e del backup serale — con una chiave che questo
   script genera a ogni accensione e passa alla pagina: `banco.js` la attacca
   a ogni `fetch`, come fa `banco/ciclo/banco.js` da parte sua.

       node banco/video/accendi.cjs
*/
const { spawn, spawnSync } = require('node:child_process');
const { copyFileSync, rmSync, mkdirSync, existsSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RADICE = path.resolve(__dirname, '..', '..');
const PORTA = 4199;
const CHIAVE = 'video-' + crypto.randomBytes(16).toString('hex');
const DB = path.join(RADICE, 'banco', 'db', 'video.db');
const PRISTINO = path.join(RADICE, 'banco', 'db', 'pristino.db');
const APP = path.join(__dirname, 'app');

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

async function vivo() {
  try { return (await fetch(`http://127.0.0.1:${PORTA}/api/health`)).ok; } catch { return false; }
}

/* Su Windows il servizio del banco è un `node.exe` come tutti gli altri: si
   riconosce dalla porta, non dal nome. Stessa ricetta di `ciclo/gira.cjs`. */
async function spegniQuelCheCiSta() {
  if (!await vivo()) return;
  console.log(`· c'era già qualcosa sulla ${PORTA}: lo spengo`);
  spawnSync('powershell', ['-NoProfile', '-Command',
    `Get-NetTCPConnection -LocalPort ${PORTA} -State Listen -ErrorAction SilentlyContinue `
    + '| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }'],
    { stdio: 'ignore' });
  for (let i = 0; i < 40 && await vivo(); i++) await attesa(250);
}

function rifaiDatabase() {
  if (!existsSync(PRISTINO)) {
    console.error(`\n  Manca ${path.relative(RADICE, PRISTINO)}.`);
    console.error('  È la copia a caldo del magazzino vero da cui il banco riparte.\n');
    process.exit(1);
  }
  /* Anche i due file di corredo: senza, SQLite riapre un giornale che parla
     di un altro database e la copia non è quella che si crede. */
  for (const coda of ['', '-shm', '-wal']) {
    rmSync(DB + coda, { force: true });
    if (existsSync(PRISTINO + coda)) copyFileSync(PRISTINO + coda, DB + coda);
  }
  console.log(`· database rifatto da pristino.db → ${path.relative(RADICE, DB)}`);
}

/** L'applicativo COSTRUITO, copiato in una cartella usa e getta.
    Non si serve da `consegna/`: quella cartella la build azzera a ogni giro,
    ed è esattamente l'errore del 17/08 scritto in `vite.config.js`. */
function preparaApp() {
  const consegne = readdirSync(path.join(RADICE, 'consegna'))
    .filter((d) => statSync(path.join(RADICE, 'consegna', d)).isDirectory());
  if (!consegne.length) {
    console.error('\n  In `consegna/` non c\'è niente: lancia prima `npm run build`.\n');
    process.exit(1);
  }
  const sorgente = path.join(RADICE, 'consegna', consegne[0], 'app');
  /* CON LE RIPROVE, e non per prudenza generica: la cartella l'ha appena
     lasciata il servizio spento un istante fa, e su Windows chi la teneva
     aperta la molla quando gli pare — OneDrive, l'antivirus, il processo
     che sta morendo. Senza queste righe l'accensione muore di EPERM una
     volta su tre, e sembra un guasto del banco. */
  rmSync(APP, { recursive: true, force: true, maxRetries: 30, retryDelay: 150 });
  mkdirSync(APP, { recursive: true });
  copiaCartella(sorgente, APP);
  /* Il banco viaggia DENTRO l'applicativo servito: così si carica con un
     `import()` dalla stessa origine, senza incollare mille righe a mano.

     VA IN `assets/`, e non alla radice: il servizio NON pubblica la cartella
     intera, e la ragione sta scritta accanto alla rotta — «il giorno in cui
     la variabile punta a un albero di sorgenti quella riga li pubblica
     tutti». `/assets/:file` è l'unica porta, e accetta un nome senza barre. */
  copyFileSync(path.join(__dirname, 'banco.js'), path.join(APP, 'assets', 'banco.js'));

  /* SE UN GIORNO CI SI METTE UN DIFETTO DENTRO — ed e' il modo in cui si
     controlla che una prova nuova morda davvero — non basta cambiare il
     bundle: accanto a ogni file la consegna ne porta uno `.gz`, e il
     servizio serve QUELLO a chi dichiara di capire gzip, cioe' a ogni
     browser. Il file modificato lo vede solo `curl`, e il banco continua a
     passare mentre uno crede di averlo rotto. Va tolto anche il `.gz`. */

  /* E UN ORDINE DI PRODUZIONE VERO, per il flusso del percorso: quella
     maschera parte da un `.xlsx` esportato dal gestionale, e un file
     fabbricato dal banco proverebbe il fabbricatore invece del lettore.
     Passa da `assets/` come `banco.js`, per la stessa ragione. */
  const odp = path.join(RADICE, 'banco', 'odp-2.12', 'ODP2612010-sosta-tre-righe.xlsx');
  if (existsSync(odp)) copyFileSync(odp, path.join(APP, 'assets', 'ordine.xlsx'));

  console.log(`· applicativo ${consegne[0]} copiato in ${path.relative(RADICE, APP)}`);
}

function copiaCartella(da, a) {
  mkdirSync(a, { recursive: true });
  for (const e of readdirSync(da, { withFileTypes: true })) {
    const s = path.join(da, e.name), d = path.join(a, e.name);
    if (e.isDirectory()) copiaCartella(s, d); else copyFileSync(s, d);
  }
}

async function principale() {
  console.log('\n═══ BANCO A VIDEO ═══\n');
  await spegniQuelCheCiSta();
  rifaiDatabase();
  preparaApp();

  const servizio = spawn(process.execPath, [path.join(RADICE, 'server', 'pathfinder-server.js')], {
    cwd: RADICE,
    env: {
      ...process.env,
      PATHFINDER_PORT: String(PORTA),
      PATHFINDER_DB: DB,
      PATHFINDER_APP_DIR: APP,
      PATHFINDER_TOKEN: CHIAVE,
      /* Il database del banco è SQLite: se la macchina ha PostgreSQL
         configurato, la variabile vuota dice «no, il file». */
      PATHFINDER_PG: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servizio.stdout.on('data', (d) => process.stdout.write('  ‹servizio› ' + d));
  servizio.stderr.on('data', (d) => process.stderr.write('  ‹servizio› ' + d));

  for (let i = 0; i < 60 && !await vivo(); i++) await attesa(250);
  if (!await vivo()) { console.error('\n  Il servizio non si è acceso.\n'); process.exit(1); }

  console.log(`\n· servizio acceso sulla ${PORTA}, database usa e getta, dati veri NON toccati\n`);
  console.log('─'.repeat(72));
  console.log(`\n  Apri:  http://127.0.0.1:${PORTA}\n`);
  console.log('  Poi, nella console del browser, una riga sola:\n');
  console.log(`    (await import('/assets/banco.js')).gira('${CHIAVE}')\n`);
  console.log('  Per un flusso solo:\n');
  console.log(`    (await import('/assets/banco.js')).gira('${CHIAVE}', 'impianto')\n`);
  console.log('─'.repeat(72));
  console.log('\n  Ctrl+C per spegnere.\n');

  const spegni = () => { servizio.kill(); process.exit(0); };
  process.on('SIGINT', spegni);
  process.on('SIGTERM', spegni);
}

principale();
