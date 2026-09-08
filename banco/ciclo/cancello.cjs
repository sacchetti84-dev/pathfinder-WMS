/* IL CANCELLO DELLA 2.0 — un giro intero, e un verdetto solo.

   Il loop non chiede «è andata bene?» a cinque comandi diversi: chiede a
   questo, che li esegue nell'ordine giusto e risponde con un numero. Zero
   significa che la 2.0 è stabile per quanto questo banco sa vedere; qualunque
   altro numero ha accanto l'elenco di cosa non torna.

   L'ORDINE NON È CASUALE:

   1. I TIPI per primi. Un `tsc` rosso rende ogni prova successiva una
      domanda a cui si risponde con il codice di ieri.
   2. Le PROVE DEL SERVIZIO prima del banco: si aprono la 4199 da sole, ed è
      la stessa porta. Con il banco acceso muoiono su `EADDRINUSE`, che è un
      errore che parla di socket e non dice di chiudere una finestra.
   3. Le PROVE DEL CLIENT, che girano da ferme.
   4. IL CICLO, che è l'unico che pretende un database dentro: rifà `ciclo.db`
      da `pristino.db`, accende il banco, esercita carico → consumo, spegne.
   5. IL VERBALE dei difetti. Un ciclo che passa scrivendo un difetto nel
      verbale non è un ciclo passato: `difetti.json` è parte del verdetto.

   `node banco/ciclo/cancello.cjs [--salta-servizio]` */

const { spawnSync, spawn } = require('node:child_process');
const { copyFileSync, rmSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..', '..');
const DB = path.join(RADICE, 'banco', 'db');
const PRISTINO = path.join(DB, 'pristino.db');
const CICLO = path.join(DB, 'ciclo.db');
const DIFETTI = path.join(__dirname, 'difetti.json');
const ESITO = path.join(__dirname, 'esito.json');
const PORTA = 4199;

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
const vivo = async () => { try { return (await fetch(`http://127.0.0.1:${PORTA}/api/health`)).ok; } catch { return false; } };

async function spegniLaPorta() {
  spawnSync('powershell', ['-NoProfile', '-Command',
    `Get-NetTCPConnection -LocalPort ${PORTA} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`],
    { stdio: 'ignore' });
  for (let i = 0; i < 40 && await vivo(); i++) await attesa(250);
}

const passi = [];
function passo(nome, esegui) {
  process.stdout.write(`\n──── ${nome} ────\n`);
  const t = Date.now();
  const r = esegui();
  passi.push({ nome, ok: r.ok, nota: r.nota || '', ms: Date.now() - t });
  process.stdout.write(`${r.ok ? '  OK' : '  ROTTO'} — ${r.nota || ''}\n`);
  return r.ok;
}

function comando(cmd, args, opzioni = {}) {
  const r = spawnSync(cmd, args, { cwd: RADICE, encoding: 'utf8', shell: true, ...opzioni });
  const out = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0, out };
}

/** L'ultima riga che dice qualcosa: un verdetto lungo trenta righe non è un
    verdetto. Se è rotto si stampa tutto, perché lì servono i dettagli. */
function coda(out, righe = 6) {
  return out.trim().split('\n').filter((l) => l.trim()).slice(-righe).join(' · ').slice(0, 400);
}

(async () => {
  const saltaServizio = process.argv.includes('--salta-servizio');
  if (existsSync(DIFETTI)) rmSync(DIFETTI);

  await spegniLaPorta();

  passo('① tipi — client e servizio', () => {
    const r = comando('npm', ['run', 'check']);
    return { ok: r.ok, nota: r.ok ? 'tsc a zero su tutto il sorgente' : coda(r.out, 12) };
  });

  if (!saltaServizio) {
    passo('② prove del servizio', () => {
      const a = comando('node', ['test/collaudo.js'], { cwd: path.join(RADICE, 'server') });
      const b = comando('node', ['test/collaudo-migrazione-1.4.js'], { cwd: path.join(RADICE, 'server') });
      const c = comando('node', ['test/collaudo-installazione.js'], { cwd: path.join(RADICE, 'server') });
      const ok = a.ok && b.ok && c.ok;
      return { ok, nota: ok ? 'servizio, migrazione e installazione' : coda((a.ok ? '' : a.out) + (b.ok ? '' : b.out) + (c.ok ? '' : c.out), 10) };
    });
  }

  passo('③ prove del client', () => {
    const r = comando('npx', ['vitest', 'run']);
    const m = r.out.match(/Tests\s+(\d+) passed/);
    return { ok: r.ok, nota: r.ok ? `${m ? m[1] : '?'} prove verdi` : coda(r.out, 14) };
  });

  /* Il ciclo: database pulito, banco acceso, e giù fino al consumo. */
  for (const s of ['', '-wal', '-shm']) if (existsSync(CICLO + s)) rmSync(CICLO + s, { force: true });
  copyFileSync(PRISTINO, CICLO);

  const servizio = spawn(process.execPath, [path.join(RADICE, 'server', 'pathfinder-server.js')], {
    cwd: RADICE, stdio: ['ignore', 'pipe', 'pipe'],
    /* 2.35 — LE DUE CHE MANCAVANO, e qui mancavano tutte e due. Senza
       `PATHFINDER_PG` vuota il cancello — il comando che dice «la 2.0 è
       stabile» — esercitava il ciclo intero sul PostgreSQL di lavoro, non su
       `ciclo.db`. Senza le `PATHFINDER_TLS_*` scollegate il banco parte in
       HTTPS e il ciclo lo interroga in chiaro. */
    env: require('../../server/lib/tls.js').scollegaTls({
      ...process.env, PATHFINDER_PORT: String(PORTA), PATHFINDER_DB: CICLO,
      PATHFINDER_PG: '',
      PATHFINDER_APP_DIR: path.join(RADICE, 'consegna', 'Pathfinder 2.0', 'app'),
    }),
  });
  let logServizio = '';
  servizio.stdout.on('data', (d) => { logServizio += d; });
  servizio.stderr.on('data', (d) => { logServizio += d; });
  for (let i = 0; i < 60 && !(await vivo()); i++) await attesa(250);

  if (!await vivo()) {
    passi.push({ nome: '④ ciclo carico → consumo', ok: false, nota: 'il banco non si è acceso: ' + coda(logServizio, 6), ms: 0 });
    console.log('\n  ROTTO — il banco non si è acceso');
  } else {
    passo('④ ciclo carico → consumo', () => {
      const r = comando('npx', ['vitest', 'run', '--root', '.', '--config', 'banco/ciclo/vitest.config.js']);
      const m = r.out.match(/Tests\s+(\d+) passed/);
      return { ok: r.ok, nota: r.ok ? `${m ? m[1] : '?'} passi del ciclo` : coda(r.out, 14) };
    });
  }
  servizio.kill();
  await spegniLaPorta();

  const difetti = existsSync(DIFETTI) ? JSON.parse(readFileSync(DIFETTI, 'utf8')) : [];
  const gravi = difetti.filter((d) => d.gravita === 'grave');
  passi.push({
    nome: '⑤ verbale dei difetti', ok: gravi.length === 0,
    nota: gravi.length ? gravi.map((d) => `${d.id} ${d.dove}`).join(' · ')
                       : (difetti.length ? `nessun difetto grave · ${difetti.length} da dato/anagrafica` : 'nessun difetto'),
    ms: 0,
  });

  const rotti = passi.filter((p) => !p.ok);
  const esito = { quando: new Date().toISOString(), stabile: rotti.length === 0, passi, difetti };
  writeFileSync(ESITO, JSON.stringify(esito, null, 1), 'utf8');

  console.log('\n════ VERDETTO ════');
  for (const p of passi) console.log(`${p.ok ? ' OK  ' : ' NO  '} ${p.nome.padEnd(34)} ${p.nota}`);
  console.log(rotti.length === 0
    ? '\n2.0 STABILE — nessun passo rotto, nessun difetto grave aperto.'
    : `\n2.0 NON ANCORA — ${rotti.length} pass${rotti.length === 1 ? 'o' : 'i'} da chiudere.`);
  process.exit(rotti.length === 0 ? 0 : 1);
})();
