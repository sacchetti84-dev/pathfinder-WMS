/* DALLA 1.4 ALLA BETA — voce 79.

   Il magazzino vero gira la 1.4 su un'altra macchina (§0): un HTML unico,
   dati in IndexedDB via Dexie, e un export JSON che dichiara
   `_format: warehouse-mapper-v1.5` — lo stesso che dichiara la beta. La
   strada per portare i dati di là a qua e' quella, e non ne esistono altre.

   Il salto pero' non era mai stato fatto girare: fra la 1.4 e oggi sono nati
   le unita' di misura, i colli, i lotti congelati, il conto di produzione, il
   giro, le unita' di carico e le cariche imposte dal servizio. «Ogni campo
   nuovo e' facoltativo, e assente significa come nella 1.2» — §8 — e questa
   prova e' il posto dove quella frase smette di essere una promessa.

   Parte da un database VUOTO, come una macchina appena installata, e importa
   un export vero dell'epoca. Poi conta.

     node banco/migrazione/dalla-1.4.cjs */

const { spawn, spawnSync } = require('node:child_process');
const { rmSync, existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const RADICE = path.resolve(__dirname, '..', '..');
const PORTA = 4197;
const BASE = `http://127.0.0.1:${PORTA}`;
const CHIAVE = 'migrazione-' + require('node:crypto').randomBytes(16).toString('hex');
const DB = path.join(os.tmpdir(), `pathfinder-migrazione-1.4-${Date.now()}.db`);

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
const vivo = async () => { try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; } };

async function spegniQuelCheCiSta() {
  if (!await vivo()) return;
  console.log(`· c'e' gia' qualcosa sulla ${PORTA}: lo spengo`);
  spawnSync('powershell', ['-NoProfile', '-Command',
    `Get-NetTCPConnection -LocalPort ${PORTA} -State Listen -EA SilentlyContinue | ` +
    'ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue }'],
    { stdio: 'ignore' });
  for (let i = 0; i < 20 && await vivo(); i++) await attesa(250);
}

(async () => {
  await spegniQuelCheCiSta();

  /* DATABASE VUOTO, e non una copia di qualcosa: il punto della prova e'
     proprio la macchina appena installata su cui arrivano i dati di la'. */
  for (const coda of ['', '-wal', '-shm']) if (existsSync(DB + coda)) rmSync(DB + coda, { force: true });

  console.log(`· accendo la beta sulla ${PORTA}, database vuoto`);
  const servizio = spawn(process.execPath, [path.join(RADICE, 'server', 'pathfinder-server.js')], {
    cwd: RADICE, stdio: ['ignore', 'pipe', 'pipe'],
    /* 2.35 — le `PATHFINDER_TLS_*` via: ereditate, la beta parte in HTTPS
       e questa prova la interroga in chiaro. */
    env: require('../../server/lib/tls.js').scollegaTls({
      ...process.env, PATHFINDER_PORT: String(PORTA), PATHFINDER_DB: DB,
      PATHFINDER_PG: '', PATHFINDER_TOKEN: CHIAVE,
    }),
  });
  let log = '';
  servizio.stdout.on('data', (d) => { log += d; });
  servizio.stderr.on('data', (d) => { log += d; });

  for (let i = 0; i < 80 && !(await vivo()); i++) await attesa(250);
  if (!await vivo()) { console.error('la beta non si e\' accesa:\n' + log); process.exit(2); }

  const esito = spawnSync('npx',
    ['vitest', 'run', '--root', '.', '--config', 'banco/migrazione/vitest.config.js'],
    { cwd: RADICE, stdio: 'inherit', shell: true,
      env: { ...process.env, BANCO_TOKEN: CHIAVE, BANCO_API: BASE } });

  servizio.kill();
  await spegniQuelCheCiSta();
  for (const coda of ['', '-wal', '-shm']) { try { rmSync(DB + coda, { force: true }); } catch {} }
  process.exit(esito.status ?? 1);
})();
