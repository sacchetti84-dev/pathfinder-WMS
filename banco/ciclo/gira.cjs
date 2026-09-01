/* IL GIRO — un'iterazione intera del ciclo 2.0, da database pulito.

   Un ciclo che riparte da dove l'ha lasciato il giro prima non è
   riproducibile: il secondo prelievo trova lo scaffale già scarico e il
   difetto che segnala non è quello vero. Ogni giro rifà il database da
   `pristino.db` — la copia a caldo del magazzino vero del 19/08 — accende il
   banco sulla 4199, esercita il ciclo e spegne.

   `node banco/ciclo/gira.cjs [--solo <file>]` */

const { spawn, spawnSync } = require('node:child_process');
const { copyFileSync, rmSync, existsSync } = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..', '..');
/* 2.13 — LA CHIAVE DEL BANCO, e perché serve.

   Dalla 2.11 le rotte `/api` vogliono una sessione, e il ciclo non ha un
   browser dove posarne il cookie: da quel giorno ogni prova moriva sul
   primo `loadAll` con un 401, e i 44 casi risultavano «saltati» invece che
   falliti — cioè il ciclo taceva. Entra dalla porta di servizio, la stessa
   che usano il backup serale e l'installer sulla macchina vera; `banco.js`
   la legge da qui e la attacca a ogni chiamata. */
const CHIAVE = 'banco-' + require('node:crypto').randomBytes(16).toString('hex');
const DB = path.join(RADICE, 'banco', 'db');
const PRISTINO = path.join(DB, 'pristino.db');
const CICLO = path.join(DB, 'ciclo.db');
const PORTA = 4199;

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

const DIFETTI = path.join(__dirname, 'difetti.json');
function leggiDifetti() {
  try { return JSON.parse(require('node:fs').readFileSync(DIFETTI, 'utf8')); }
  catch { return []; }
}

async function vivo() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/health`);
    return r.ok;
  } catch { return false; }
}

async function spegniQuelCheCiSta() {
  if (!await vivo()) return;
  /* Su Windows il servizio del banco è un `node.exe` come tutti gli altri: si
     riconosce dalla porta, non dal nome. */
  spawnSync('powershell', ['-NoProfile', '-Command',
    `Get-NetTCPConnection -LocalPort ${PORTA} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`],
    { stdio: 'ignore' });
  for (let i = 0; i < 40 && await vivo(); i++) await attesa(250);
}

function rifaiDatabase() {
  for (const s of ['', '-wal', '-shm']) {
    const f = CICLO + s;
    if (existsSync(f)) rmSync(f, { force: true });
  }
  copyFileSync(PRISTINO, CICLO);
}

(async () => {
  const soloIdx = process.argv.indexOf('--solo');
  const solo = soloIdx > -1 ? process.argv[soloIdx + 1] : null;

  console.log('· spengo il banco, se acceso');
  await spegniQuelCheCiSta();

  console.log('· rifaccio il database dal pristino');
  rifaiDatabase();

  console.log('· accendo il banco sulla 4199');
  const servizio = spawn(process.execPath, [path.join(RADICE, 'server', 'pathfinder-server.js')], {
    cwd: RADICE, stdio: ['ignore', 'pipe', 'pipe'],
    /* `PATHFINDER_PG` vuota: chi lancia il ciclo su una macchina con un
       Postgres configurato lo eserciterebbe sul magazzino vero invece che
       su `ciclo.db`, e il giro non sarebbe più riproducibile. */
    env: { ...process.env, PATHFINDER_PORT: String(PORTA), PATHFINDER_DB: CICLO,
           PATHFINDER_PG: '', PATHFINDER_TOKEN: CHIAVE,
           PATHFINDER_APP_DIR: path.join(RADICE, 'consegna', 'Pathfinder 2.0', 'app') },
  });
  let log = '';
  servizio.stdout.on('data', (d) => { log += d; });
  servizio.stderr.on('data', (d) => { log += d; });

  for (let i = 0; i < 60 && !(await vivo()); i++) await attesa(250);
  if (!await vivo()) { console.error('il banco non si è acceso:\n' + log); process.exit(2); }

  /* 2.16 — voce 50 · UN DIFETTO GRAVE TINGE DI ROSSO LA CORSA.
     `difetto()` scriveva la riga nel verbale e la prova risultava passata: il
     25/08, rimettendo apposta il difetto della voce 45, il banco ha alzato PA6
     (grave) con «movimenti 112 → 0» e vitest ha detto «3 passed». Il verbale
     lo apre chi sospetta gia' qualcosa, e un banco che tace non serve.

     QUALI SEVERITA' FERMANO LA CORSA: solo `grave`. `dato` no — dice che
     l'anagrafica e' incompleta, non che il codice sbaglia, e finche' le voci
     5 e 58 sono aperte tingerebbe di rosso ogni giro per sempre.

     Si guarda l'ora, non l'elenco: `difetti.json` non si svuota mai, e le
     righe vecchie sono memoria. Rossa la fanno solo quelle di QUESTA corsa. */
  const inizio = new Date().toISOString();

  const argomenti = ['vitest', 'run', '--root', '.', '--config', 'banco/ciclo/vitest.config.js'];
  if (solo) argomenti.push(solo);
  const esito = spawnSync('npx', argomenti, {
    cwd: RADICE, stdio: 'inherit', shell: true,
    env: { ...process.env, BANCO_TOKEN: CHIAVE },
  });

  servizio.kill();
  await spegniQuelCheCiSta();

  const gravi = leggiDifetti().filter((d) => d.gravita === 'grave' && d.visto >= inizio);
  if (gravi.length) {
    /* 2.16 — IL VERBALE DI UNA CORSA ROSSA SI TIENE DA PARTE.
       `apriVerbale` tronca il file a ogni corsa, quindi la prova di un difetto
       viveva fino alla corsa dopo. E' cosi' che `Q1` — 0,75 KG che non si
       ritrovavano, il 01/09 — e' diventato irrintracciabile: due minuti dopo
       il verbale che lo spiegava non c'era piu', e in dodici corse non si e'
       piu' presentato. Un banco che cancella le proprie prove trova i difetti
       una volta sola. */
    const quando = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tenuto = path.join(__dirname, `verbale-GRAVE-${quando}.md`);
    try {
      require('node:fs').copyFileSync(path.join(__dirname, 'verbale.md'), tenuto);
      console.error(`
  verbale tenuto da parte: ${path.basename(tenuto)}`);
    } catch (e) {
      console.error('  non sono riuscito a tenere il verbale:', e.message);
    }
    console.error('');
    console.error(`  ${gravi.length} DIFETTO${gravi.length > 1 ? 'I' : ''} GRAVE${gravi.length > 1 ? 'I' : ''} in questa corsa:`);
    for (const d of gravi) console.error(`  · ${d.id} — ${d.dove}: ${d.cosa}`);
    console.error('  Il verbale sta in banco/ciclo/verbale.md');
    console.error('');
    process.exit(1);
  }
  process.exit(esito.status ?? 1);
})();
