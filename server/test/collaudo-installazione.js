'use strict';

/* PATHFINDER — COLLAUDO DELL'INSTALLAZIONE, 1.8
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `installa-versione.ps1` e `torna-indietro.ps1` non avevano un collaudo, e la
   notte del 18/08 si e' visto perche' ne serviva uno: l'installer a doppio
   clic passava `-Riusa`, e una versione gia' nel deposito NON veniva
   ricopiata. Si rifaceva la build con lo stesso numero, si lanciava
   l'installer, e la macchina restava ai byte di prima senza dire niente.

   Qui si esercita lo script vero su una casa temporanea — mai
   `C:\Pathfinder\` — con consegne finte che si distinguono per il contenuto.

       node test/collaudo-installazione.js     (da server/) */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const SERVER = path.resolve(__dirname, '..');
const CASA = path.join(os.tmpdir(), `pathfinder-installa-${Date.now()}`);
const CONSEGNE = path.join(CASA, '_consegne');

let passate = 0, fallite = 0;
const ok = (nome, cond, nota = '') => {
  if (cond) { passate++; console.log(`  PASSA   ${nome}${nota ? ' — ' + nota : ''}`); }
  else { fallite++; console.log(`  FALLISCE ${nome}${nota ? ' — ' + nota : ''}`); }
};

/* Una consegna finta: indice, un asset col nome a impronta e il manifesto.
   `marchio` cambia i byte a parita' di numero di versione — e' il caso che il
   collaudo esiste per coprire. */
function consegna(versione, marchio, assetNome = 'index-AAAA1111.js') {
  const dir = path.join(CONSEGNE, `${versione}-${marchio}`, 'app');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const indice = `<!doctype html><title>${versione}</title><p>${marchio}`;
  const asset = `export const marchio = "${marchio}";`;
  fs.writeFileSync(path.join(dir, 'index.html'), indice);
  fs.writeFileSync(path.join(dir, 'assets', assetNome), asset);
  const file = [
    { percorso: `assets/${assetNome}`, byte: asset.length, sha256: sha(asset) },
    { percorso: 'index.html', byte: indice.length, sha256: sha(indice) },
  ];
  const righe = file.map(f => `${f.percorso}:${f.sha256}`).join('\n');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    versione, costruita: new Date().toISOString(),
    byte_totali: indice.length + asset.length, file, impronta: sha(righe),
  }, null, 2));
  return dir;
}

const sha = (testo) => crypto.createHash('sha256').update(testo).digest('hex');

function ps(script, argomenti) {
  return execFileSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(SERVER, script), ...argomenti,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const installa = (da, versione) => ps('installa-versione.ps1', ['-Da', da, '-Versione', versione, '-Casa', CASA]);
const tornaIndietro = () => ps('torna-indietro.ps1', ['-Casa', CASA]);

const manifesto = (cartella) => {
  const f = path.join(CASA, cartella, 'manifest.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
};
const marchioIn = (cartella) => {
  const dir = path.join(CASA, cartella, 'assets');
  if (!fs.existsSync(dir)) return null;
  const primo = fs.readdirSync(dir)[0];
  return primo ? fs.readFileSync(path.join(dir, primo), 'utf8') : null;
};

console.log(`\n  Casa di prova  ${CASA}\n`);

try {
  // ── 1. La prima installazione ────────────────────────────────────────────
  const a = consegna('2.0', 'primo');
  installa(a, '2.0');
  ok('la prima installazione mette la versione in corrente',
     manifesto('corrente')?.versione === '2.0', manifesto('corrente')?.versione);
  ok('e non inventa una via di ritorno che non esiste',
     manifesto('precedente') === null);
  ok('il deposito tiene la versione installata',
     fs.existsSync(path.join(CASA, 'pathfinder-2.0', 'index.html')));

  // ── 2. Una versione diversa ──────────────────────────────────────────────
  const b = consegna('2.1', 'secondo');
  installa(b, '2.1');
  ok('la versione nuova entra in servizio', manifesto('corrente')?.versione === '2.1');
  ok('quella di prima diventa la via di ritorno', manifesto('precedente')?.versione === '2.0');

  // ── 3. LA STESSA VERSIONE CON BYTE DIVERSI ───────────────────────────────
  /* Il caso della notte del 18/08: si rifa' la build senza cambiare numero.
     Chi installa si aspetta i byte che ha in mano, non quelli di ieri. */
  const c = consegna('2.1', 'terzo');
  const improntaAttesa = JSON.parse(fs.readFileSync(path.join(c, 'manifest.json'), 'utf8')).impronta;
  installa(c, '2.1');
  ok('REINSTALLARE LA STESSA VERSIONE PORTA I BYTE NUOVI, non quelli in deposito',
     manifesto('corrente')?.impronta === improntaAttesa,
     `${manifesto('corrente')?.impronta?.slice(0, 8)} attesa ${improntaAttesa.slice(0, 8)}`);
  ok('e il deposito viene rifatto con gli stessi byte',
     manifesto('pathfinder-2.1')?.impronta === improntaAttesa);
  ok('la via di ritorno NON viene mangiata dalla reinstallazione',
     manifesto('precedente')?.versione === '2.0',
     'precedente: ' + manifesto('precedente')?.versione);

  // ── 4. Niente file orfani ────────────────────────────────────────────────
  /* Un asset porta l'impronta nel nome: quello di ieri, se resta, non fa
     danno finche' nessuno lo nomina — ma il conteggio dei file mente, e
     l'impronta si verifica su quel conteggio. */
  const d = consegna('2.1', 'quarto', 'index-BBBB2222.js');
  installa(d, '2.1');
  const assets = fs.readdirSync(path.join(CASA, 'corrente', 'assets'));
  ok('l\'asset della build di prima non resta in giro',
     assets.length === 1 && assets[0] === 'index-BBBB2222.js', assets.join(', '));
  const assetsDeposito = fs.readdirSync(path.join(CASA, 'pathfinder-2.1', 'assets'));
  ok('e nemmeno nel deposito', assetsDeposito.length === 1, assetsDeposito.join(', '));

  // ── 5. Due installazioni identiche di fila ───────────────────────────────
  installa(d, '2.1');
  ok('installare due volte la stessa cosa non cambia niente',
     manifesto('corrente')?.versione === '2.1' && manifesto('precedente')?.versione === '2.0',
     `corrente ${manifesto('corrente')?.versione} · precedente ${manifesto('precedente')?.versione}`);

  // ── 6. La via di ritorno funziona ancora ─────────────────────────────────
  tornaIndietro();
  ok('si torna indietro alla versione di prima', manifesto('corrente')?.versione === '2.0');
  ok('e la 2.1 diventa la via di ritorno', manifesto('precedente')?.versione === '2.1');
  tornaIndietro();
  ok('rilanciando si torna avanti, ed e\' l\'ultima installata',
     manifesto('corrente')?.versione === '2.1' && marchioIn('corrente')?.includes('quarto'),
     marchioIn('corrente'));

  // ── 7. Le consegne rotte non entrano ─────────────────────────────────────
  const vuota = path.join(CONSEGNE, 'vuota');
  fs.mkdirSync(vuota, { recursive: true });
  let respinta = false;
  try { installa(vuota, '9.9'); } catch { respinta = true; }
  ok('una cartella senza index.html viene respinta', respinta);
  ok('e non lascia una versione a meta\' nel deposito',
     !fs.existsSync(path.join(CASA, 'pathfinder-9.9')));
  ok('ne\' tocca quello che era in servizio', manifesto('corrente')?.versione === '2.1');

  // ── 8. L'INSTALLER A DOPPIO CLIC: le decisioni, senza toccare niente ─────
  /* `-Prova` dice cosa farebbe ed esce. Serve a due cose: provare le
     decisioni su una macchina in servizio, e avere qualcosa da esercitare qui
     — l'installazione vera registra attivita' pianificate e apre porte sul
     firewall, e un collaudo che la esegue davvero non e' un collaudo. */
  const pacchetto = path.join(CONSEGNE, 'pacchetto');
  fs.mkdirSync(pacchetto, { recursive: true });
  fs.cpSync(consegna('3.0', 'pacchetto'), path.join(pacchetto, 'app'), { recursive: true });
  fs.mkdirSync(path.join(pacchetto, 'servizio'), { recursive: true });
  fs.writeFileSync(path.join(pacchetto, 'servizio', 'pathfinder-server.js'), '// finto');
  fs.copyFileSync(path.join(SERVER, 'installa-pathfinder.ps1'), path.join(pacchetto, 'installa.ps1'));

  const prova = (argomenti) => execFileSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(pacchetto, 'installa.ps1'),
    '-NonChiedere', '-Prova', ...argomenti,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const detto = prova([]);
  ok('la prova dice la strada e non tocca niente', /PROVA/.test(detto) && /strada/.test(detto));
  ok("e su questa macchina, che Pathfinder ce l'ha, la strada e' l'aggiornamento",
     /aggiornamento/.test(detto));
  ok('la prova non lascia niente in giro',
     !fs.existsSync(path.join(CASA, 'pathfinder-3.0')));

  /* UN PARAMETRO SCRITTO MALE NON DEVE SIMULARE: PowerShell lanciato con
     -File scarta in silenzio cio' che non trova nel param(), e il 18/08 un
     `-Prova` chiesto a un installer che non l'aveva ha fatto un'installazione
     vera su questa macchina. */
  let respintoArgomento = false;
  let dettoArgomento = '';
  try {
    dettoArgomento = execFileSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(pacchetto, 'installa.ps1'),
      '-NonChiedere', '-Prova', '-ParametroCheNonEsiste',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { respintoArgomento = true; dettoArgomento = (e.stdout || '') + (e.stderr || ''); }
  ok("UN ARGOMENTO CHE NON ESISTE FERMA L'INSTALLER, invece di essere scartato",
     respintoArgomento && /non tocco niente/i.test(dettoArgomento));

  /* Spostare un'installazione non e' installare: aggiornando, una radice
     diversa da quella della macchina si rifiuta prima di toccare qualunque
     cosa. */
  let respintaRadice = false;
  let dettoRadice = '';
  try {
    dettoRadice = prova(['-Radice', path.join(CASA, 'altrove')]);
  } catch (e) { respintaRadice = true; dettoRadice = (e.stdout || '') + (e.stderr || ''); }
  ok('e una radice diversa da quella installata viene rifiutata',
     respintaRadice && /non e.* installare/i.test(dettoRadice));

} catch (err) {
  fallite++;
  console.log(`\n  ERRORE: ${err.message}\n${err.stdout || ''}${err.stderr || ''}`);
}

console.log(`\n  ${passate} passate, ${fallite} fallite\n`);
try { fs.rmSync(CASA, { recursive: true, force: true }); } catch {}
process.exit(fallite ? 1 : 0);
