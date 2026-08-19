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
const DB = path.join(RADICE, 'banco', 'db');
const PRISTINO = path.join(DB, 'pristino.db');
const CICLO = path.join(DB, 'ciclo.db');
const PORTA = 4199;

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

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
    env: { ...process.env, PATHFINDER_PORT: String(PORTA), PATHFINDER_DB: CICLO,
           PATHFINDER_APP_DIR: path.join(RADICE, 'consegna', 'Pathfinder 2.0', 'app') },
  });
  let log = '';
  servizio.stdout.on('data', (d) => { log += d; });
  servizio.stderr.on('data', (d) => { log += d; });

  for (let i = 0; i < 60 && !(await vivo()); i++) await attesa(250);
  if (!await vivo()) { console.error('il banco non si è acceso:\n' + log); process.exit(2); }

  const argomenti = ['vitest', 'run', '--root', '.', '--config', 'banco/ciclo/vitest.config.js'];
  if (solo) argomenti.push(solo);
  const esito = spawnSync('npx', argomenti, { cwd: RADICE, stdio: 'inherit', shell: true });

  servizio.kill();
  await spegniQuelCheCiSta();
  process.exit(esito.status ?? 1);
})();
