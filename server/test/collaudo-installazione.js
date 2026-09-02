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

/* ── 2.10 · L'INSTALLER SI CHIAMA IN DUE MODI, E STA IN DUE POSTI ─────────
   Nel sorgente e' `server/installa-pathfinder.ps1`, accanto a questo file;
   nel pacchetto diventa `installa.ps1` e sale nella radice, un livello sopra
   `servizio/`. Questo collaudo viaggia nel pacchetto — ce lo mette la build —
   e finche' ha cercato il solo nome del sorgente, lanciato da li' moriva con
   un `ENOENT` su `copyfile`: dodici prove non eseguite, e un messaggio che
   sembra un guasto dell'installazione invece di un collaudo che guarda nel
   posto sbagliato. Trovato verificando la consegna della 2.10.

   Si guarda in tutti e due i posti, e se non c'e' ne' l'uno ne' l'altro le
   prove che lo esercitano si SALTANO DICENDO PERCHE' — la stessa regola
   delle trentuno prove PostgreSQL quando manca il database. */
const INSTALLER = [
  path.join(SERVER, 'installa-pathfinder.ps1'),   // il sorgente
  path.join(SERVER, '..', 'installa.ps1'),        // il pacchetto
].find((p) => fs.existsSync(p)) || null;

let passate = 0, fallite = 0;
const ok = (nome, cond, nota = '') => {
  if (cond) { passate++; console.log(`  PASSA   ${nome}${nota ? ' — ' + nota : ''}`); }
  else { fallite++; console.log(`  FALLISCE ${nome}${nota ? ' — ' + nota : ''}`); }
};

/* ── 2.18.1 · QUEL CHE SI PUÒ CHIEDERE A UNA MACCHINA CHE NON HA NIENTE ──

   Quattro di queste prove non guardano l'installer: guardano l'installer
   MESSO DAVANTI A UNA MACCHINA CHE PATHFINDER CE L'HA GIÀ. «Aggiornando,
   una radice diversa si rifiuta» ha senso solo se esiste una radice da cui
   essere diversi; su una macchina vuota la strada giusta è la prima
   installazione, e l'installer fa bene a prenderla.

   Fino alla 2.18 questa batteria girava solo qui, dove Pathfinder c'è, e la
   distinzione non serviva. Dal 02/09 gira anche sull'integrazione continua,
   su un runner che non ha mai visto un'installazione: quelle quattro
   fallivano, e non perché l'installer fosse rotto.

   SI DICHIARANO SALTATE, E SI DICE PERCHÉ. Un collaudo che tace su una
   parte del lavoro è peggio di uno che dice «questa parte non l'ho vista»:
   chi legge un conteggio pieno su un runner deve sapere che le altre
   quattro aspettano una macchina vera. */
let saltate = 0;
const salta = (nome, perche) => {
  saltate++; console.log(`  SALTATA ${nome} — ${perche}`);
};

/* NON SI INDOVINA SE C'È UN'INSTALLAZIONE: LO SI CHIEDE ALL'INSTALLER.
   Il primo tentativo leggeva `PATHFINDER_APP_DIR` dall'ambiente del processo,
   e diceva una cosa diversa da quella che decide l'installer: lui guarda la
   variabile DI MACCHINA **e** che il servizio risponda — `$vivo -and $varApp`
   — e con la variabile presente e il servizio giù prende la prima
   installazione. Due criteri diversi sullo stesso fatto sono un collaudo che
   accusa l'installer di aver sbagliato strada quando la strada era giusta.
   Si legge invece dalla sua `-Prova`, che la strada la dichiara a voce. */
let INSTALLATO = false;
const SENZA_INSTALLAZIONE = 'su questa macchina Pathfinder non e\' installato: serve una radice esistente';

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
  if (!INSTALLER) {
    console.log('\n  SALTATE  le dodici prove dell\'installer a doppio clic:');
    console.log('           non si trova ne\' `installa-pathfinder.ps1` accanto');
    console.log('           al servizio, ne\' `installa.ps1` nella radice del');
    console.log('           pacchetto. Le altre hanno girato.');
    console.log(`\n  ${passate} passate, ${fallite} fallite` + (saltate ? `, ${saltate} saltate` : '') + '\n');
    fs.rmSync(CASA, { recursive: true, force: true });
    process.exit(fallite ? 1 : 0);
  }
  /* `-Prova` dice cosa farebbe ed esce. Serve a due cose: provare le
     decisioni su una macchina in servizio, e avere qualcosa da esercitare qui
     — l'installazione vera registra attivita' pianificate e apre porte sul
     firewall, e un collaudo che la esegue davvero non e' un collaudo. */
  const pacchetto = path.join(CONSEGNE, 'pacchetto');
  fs.mkdirSync(pacchetto, { recursive: true });
  fs.cpSync(consegna('3.0', 'pacchetto'), path.join(pacchetto, 'app'), { recursive: true });
  fs.mkdirSync(path.join(pacchetto, 'servizio'), { recursive: true });
  fs.writeFileSync(path.join(pacchetto, 'servizio', 'pathfinder-server.js'), '// finto');
  fs.copyFileSync(INSTALLER, path.join(pacchetto, 'installa.ps1'));
  /* 2.7 — il pacchetto porta anche chi prepara il database, e l'installer
     lo pretende: senza, un'installazione su PostgreSQL si accorgerebbe che
     manca a meta' strada, a servizio gia' fermo. Qui e' quello VERO, non un
     finto: alcune prove lo eseguono. */
  fs.copyFileSync(path.join(SERVER, 'prepara-postgres.ps1'),
                  path.join(pacchetto, 'servizio', 'prepara-postgres.ps1'));

  const prova = (argomenti) => execFileSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(pacchetto, 'installa.ps1'),
    '-NonChiedere', '-Prova', ...argomenti,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const detto = prova([]);
  ok('la prova dice la strada e non tocca niente', /PROVA/.test(detto) && /strada/.test(detto));
  /* LE STRADE SONO DUE E SI ESCLUDONO. Che ne dichiari una, e una sola, vale
     su qualunque macchina: e' la riga da cui questo collaudo capisce dove si
     trova, e se ne dicesse due non ci sarebbe da fidarsi di nessuna. */
  const dice = (r) => new RegExp(r, 'i').test(detto);
  INSTALLATO = dice('aggiornamento');
  ok('e la strada dichiarata e una delle due, e una sola',
     INSTALLATO !== dice('prima installazione'),
     (detto.split('\n').find((r) => /strada/i.test(r)) || '').trim());
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
  if (INSTALLATO) {
    ok('e una radice diversa da quella installata viene rifiutata',
       respintaRadice && /non e.* installare/i.test(dettoRadice));
  } else {
    salta('e una radice diversa da quella installata viene rifiutata', SENZA_INSTALLAZIONE);
  }

  /* ── 2.7 · IL DATABASE ───────────────────────────────────────────────────
     Dalla 2.7 un'installazione decide anche SU COSA finisce il magazzino, e
     quella decisione va detta a schermo prima di premere: dedurla dai valori
     di serie e' esattamente come non dirla. */

  ok('la prova dice su quale database si finirebbe',
     /Database/i.test(detto) && /(PostgreSQL|SQLite)/.test(detto));

  /* -Database sqlite resta la via di casa, e non deve pretendere PostgreSQL:
     una macchina senza il motore installato deve poter installare lo stesso.
     Su una macchina gia' su PostgreSQL invece si rifiuta, ed e' l'altro ramo
     di questa stessa prova. */
  /* SI LEGGE DALLA MACCHINA, non da `process.env`. La variabile e' di
     macchina, e un processo nato prima che venisse impostata non ce l'ha:
     questa shell e' esattamente uno di quelli, e il collaudo concluderebbe
     «SQLite» su una macchina che gira su PostgreSQL.
     Solo SE c'e', mai il contenuto: dentro c'e' la password del database, e
     un collaudo che la stampa la mette in un registro. */
  const suPostgres = /SI/.test(execFileSync('powershell', ['-NoProfile', '-Command',
    'if ([Environment]::GetEnvironmentVariable("PATHFINDER_PG","Machine")) { "SI" } else { "NO" }'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

  let dettoSqlite = '';
  let respintoSqlite = false;
  try { dettoSqlite = prova(['-Database', 'sqlite']); }
  catch (e) { respintoSqlite = true; dettoSqlite = (e.stdout || '') + (e.stderr || ''); }

  if (suPostgres) {
    /* TORNARE INDIETRO DA POSTGRESQL NON E' UN'INSTALLAZIONE. Il file SQLite
       e' fermo al giorno del passaggio, e quello che si e' scritto dopo non
       rientra da solo: l'installer si rifiuta e manda al gesto giusto. */
    ok('su una macchina su PostgreSQL, -Database sqlite viene RIFIUTATO',
       respintoSqlite && /non rientra da solo/i.test(dettoSqlite));
  } else {
    ok('-Database sqlite resta la via di casa, e non pretende PostgreSQL',
       !respintoSqlite && /SQLite/.test(dettoSqlite));
  }

  /* Un pacchetto senza chi prepara il database si ferma PRIMA, non a meta'.
     E' la stessa ragione per cui si controlla index.html: accorgersene a
     servizio fermo vuol dire un magazzino giu' per un file mancante. */
  const monco = path.join(CONSEGNE, 'monco');
  fs.cpSync(pacchetto, monco, { recursive: true });
  fs.rmSync(path.join(monco, 'servizio', 'prepara-postgres.ps1'), { force: true });
  let respintoMonco = false;
  let dettoMonco = '';
  try {
    dettoMonco = execFileSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(monco, 'installa.ps1'),
      '-NonChiedere', '-Prova',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { respintoMonco = true; dettoMonco = (e.stdout || '') + (e.stderr || ''); }
  ok('un pacchetto senza prepara-postgres.ps1 viene respinto subito',
     respintoMonco && /Pacchetto incompleto/i.test(dettoMonco) && /prepara-postgres/.test(dettoMonco));

  /* ── prepara-postgres.ps1, guardato da solo ─────────────────────────────
     La sua -Prova non scrive niente e si puo' lanciare su una macchina in
     servizio: e' l'unico modo di sapere se il motore c'e' senza scoprirlo a
     meta' installazione. Il collaudo non pretende che PostgreSQL ci sia —
     pretende che lo script lo DICA, in un verso o nell'altro. */
  const preparaPg = path.join(pacchetto, 'servizio', 'prepara-postgres.ps1');
  let dettoPg = '';
  try {
    dettoPg = execFileSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', preparaPg, '-Prova', '-NonChiedere',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { dettoPg = (e.stdout || '') + (e.stderr || ''); }
  /* 2.18.1 — LA NOTA PORTA QUEL CHE LO SCRIPT HA DETTO. Questa prova non
     pretende che PostgreSQL ci sia, pretende che lo script lo DICA; quando
     fallisce, l'unica cosa che serve e' leggere la sua risposta, e senza
     questa riga non la si legge — men che meno dal registro di una corsa
     automatica su una macchina che non si ha davanti. */
  ok('prepara-postgres dice se il motore c\'e\' o se manca, e non lascia dubbi',
     /PostgreSQL/.test(dettoPg) &&
     (/nessuna modifica/i.test(dettoPg) || /non risulta installato/i.test(dettoPg)),
     dettoPg.replace(/\s+/g, ' ').trim().slice(0, 200) || '(non ha detto niente)');

  /* UNA RISPOSTA VUOTA NON E' UNO ZERO, e uno zero qui vuol dire «migraci
     sopra». `Start-Process -ArgumentList` NON mette le virgolette: incolla
     l'elenco con degli spazi in mezzo, e una query con gli spazi dentro
     arriva a psql spezzata. psql non protesta — esce con 0 e senza niente in
     mano — e lo script concludeva «nessun tavolo» su un magazzino con undici
     mila articoli dentro. E' la direzione peggiore in cui sbagliare, ed e'
     il conteggio da cui dipende il rifiuto di scrivere sopra dei dati.

     Si prova contro il database VERO di questa macchina, che di tavoli ne ha:
     la risposta giusta e' «non e' vuoto». Della stringa si legge solo se c'e'
     — dentro c'e' la password. */
  if (suPostgres) {
    const dettoConteggio = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `& '${preparaPg}' -Prova -NonChiedere -StringaEsistente ` +
      '([Environment]::GetEnvironmentVariable("PATHFINDER_PG","Machine"))' +
      ' | ForEach-Object { "VUOTO=" + $_.vuoto }'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    ok('il conteggio dei tavoli vede quelli che ci sono, e non conclude «vuoto»',
       /VUOTO=False/.test(dettoConteggio));
  }

  /* Anche qui un parametro scartato in silenzio significherebbe preparare un
     database credendo di guardarlo. */
  let respintoArgPg = false;
  let dettoArgPg = '';
  try {
    dettoArgPg = execFileSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', preparaPg, '-Prova', '-ParametroCheNonEsiste',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { respintoArgPg = true; dettoArgPg = (e.stdout || '') + (e.stderr || ''); }
  ok('un argomento che non esiste ferma anche prepara-postgres',
     respintoArgPg && /non tocco niente/i.test(dettoArgPg));

  /* LA PASSWORD DEL SUPERUSER NON PASSA PER LA RIGA DI COMANDO della
     finestra elevata: la legge chiunque apra Gestione attivita'. Si guarda
     nel codice, perche' e' l'unico posto dove si puo' vedere prima che
     succeda. */
  const sorgenteInstaller = fs.readFileSync(INSTALLER, 'utf8');
  /* 2.15 — LE FINESTRE ELEVATE SONO DUE, non piu' una: installazione e
     disinstallazione. Questa prova guardava il solo blocco dell'installazione
     e, quando e' arrivata la seconda, ha smesso di guardare qualcosa senza
     dirlo — la fetta usciva vuota e il confronto passava per caso. Adesso si
     raccolgono TUTTE le liste di argomenti che finiscono in un RunAs, e si
     controllano una per una: una prova che si allarga da sola quando il
     codice si allarga. */
  const bocconi = [];
  let daQui = 0;
  for (;;) {
    const runas = sorgenteInstaller.indexOf('Start-Process powershell -Verb RunAs', daQui);
    if (runas === -1) break;
    const inizio = Math.max(sorgenteInstaller.lastIndexOf('= @(', runas), 0);
    bocconi.push(sorgenteInstaller.slice(inizio, runas));
    daQui = runas + 1;
  }
  ok('la password del superuser NON viene passata a nessuna finestra elevata',
     bocconi.length >= 2 && bocconi.every((b) => b.length > 0 && !/PasswordSuperuser/.test(b)),
     `finestre elevate esaminate: ${bocconi.length}`);

  /* ── 2.10 · LA PRIMA INSTALLAZIONE, CHE NESSUNO PROVAVA DA MESI ──────────
     Il 27/08 una macchina vergine — `C:\Pathfinder` rinominato apposta — ha
     fermato l'installer al passo 2 di 3 con «il servizio risulta registrato
     ma non risponde», mentre il servizio aveva appena scritto SERVIZIO
     ATTIVO. L'errore vero era `Split-Path -Leaf $null`: a quel punto
     `C:\Pathfinder\app\corrente` NON esiste ancora — l'applicativo arriva al
     passo 3 — e `/api/app-info` risponde `punta_a` a null, come deve.

     Si guarda nel sorgente e non facendolo girare, perche' farlo girare
     vuol dire registrare attivita' pianificate e aprire una porta sul
     firewall della macchina che sta collaudando: e' la stessa ragione per
     cui l'installer a doppio clic qui si esercita in `-Prova`.

     NON SI PROVA CHE LA RIGA ESISTE, si prova che la guardia viene PRIMA:
     e' l'ordine che era sbagliato, non la mancanza del controllo — sotto,
     un `if (-not $info.versione)` c'era gia', e non e' mai stato raggiunto. */
  const servizioPs1 = fs.readFileSync(path.join(SERVER, 'installa-servizio.ps1'), 'utf8');
  const guardia = servizioPs1.indexOf('if (-not $info.punta_a)');
  const usoDiPuntaA = servizioPs1.indexOf('Split-Path -Leaf $info.punta_a');
  ok('la cartella dell applicativo che non c e ancora non ferma l installazione',
     guardia !== -1 && usoDiPuntaA !== -1 && guardia < usoDiPuntaA,
     guardia === -1 ? 'nessuna guardia su punta_a' : `guardia al carattere ${guardia}, uso al ${usoDiPuntaA}`);

  /* L'estensione del backup la decide il database: `.db` con SQLite, `.dump`
     con PostgreSQL. Il filtro ne conosceva uno solo, e su PostgreSQL diceva
     «prova NON riuscita» a backup riuscito. */
  ok('la prova del backup riconosce anche il dump di PostgreSQL',
     /Extension -in '\.db', '\.dump'/.test(servizioPs1));

  /* 01/09 — I PERMESSI SI DANNO IN DUE GESTI, E PER ULTIMI.

     `Blinda-Radice` chiudeva la radice con un solo `icacls`, `/inheritance:r`
     e `/T` nella stessa riga: quella coppia scende su ogni figlio e gli
     toglie gli ACE ereditati, mentre i tre `/grant` non arrivano fino in
     fondo, e restano file con l'elenco VUOTO. Un elenco vuoto nega tutto,
     anche a un Amministratore, anche solo per leggere di chi e' il file.

     Su una macchina pulita e' costato l'installazione: il passo del servizio
     blindava la cartella, e il passo dopo non riusciva piu' a lanciare
     `installa-versione.ps1` che sta li' dentro — «Accesso al percorso
     negato», segnalato come comando non trovato. E icacls usciva con ZERO,
     quindi l'installer diceva verde.

     Due prove, perche' i difetti erano due: la coppia nella stessa chiamata,
     e l'ordine. La blindatura e' l'ultimo gesto che tocca il disco. */
  const blindatura = sorgenteInstaller.slice(
    sorgenteInstaller.indexOf('function Blinda-Radice'),
    sorgenteInstaller.indexOf('function Leggibile') > sorgenteInstaller.indexOf('function Blinda-Radice')
      ? sorgenteInstaller.indexOf('function Leggibile')
      : sorgenteInstaller.indexOf('# \u2500\u2500 Prima installazione'));
  const chiamate = blindatura.split('icacls').slice(1);
  ok('nessun icacls chiude /inheritance:r e /T nella stessa chiamata',
     chiamate.length > 0 && chiamate.every((c) => {
       const riga = c.slice(0, c.indexOf('2>&1') === -1 ? c.length : c.indexOf('2>&1'));
       return !(riga.includes('/inheritance:r') && /\s\/T\b/.test(riga));
     }),
     `chiamate a icacls esaminate: ${chiamate.length}`);

  const installaVersione = sorgenteInstaller.lastIndexOf("'installa-versione.ps1'");
  const blinda = sorgenteInstaller.lastIndexOf('Blinda-Radice $Radice');
  ok('i permessi si stringono DOPO che l applicativo e installato',
     installaVersione !== -1 && blinda !== -1 && installaVersione < blinda,
     blinda === -1 ? 'Blinda-Radice non viene mai chiamata'
                   : `installa-versione al carattere ${installaVersione}, blindatura al ${blinda}`);

  /* ── 2.15 · LA DISINSTALLAZIONE ────────────────────────────────────────
     L'opposto dell'installazione, e per collaudarla vale la stessa regola:
     la corsa vera toglie attivita' pianificate, regole del firewall e
     variabili di macchina, e un collaudo che la esegue davvero non e' un
     collaudo — e' una macchina in meno. Si esercita in `-Prova`, e il resto
     si guarda nel sorgente.

     LE TRE COSE CHE DEVONO REGGERE, e sono tre decisioni prima che tre righe:
     il database non cade senza che qualcuno l'abbia chiesto per nome; prima
     di togliere si salva; e quello che si salva sta FUORI dalla cartella che
     si sta per cancellare. */
  if (INSTALLATO) {
    const dettoDis = prova(['-Disinstalla']);
    ok('la prova della disinstallazione dice cosa toglierebbe',
       /disinstallazione/i.test(dettoDis) && /PROVA/.test(dettoDis));

    ok('e senza -AncheIlDatabase dichiara che il database resta',
       /-AncheIlDatabase/.test(dettoDis));
  } else {
    salta('la prova della disinstallazione dice cosa toglierebbe', SENZA_INSTALLAZIONE);
    salta('e senza -AncheIlDatabase dichiara che il database resta', SENZA_INSTALLAZIONE);
  }

  /* Il gesto peggiore sta dietro a un interruttore suo, e l'interruttore da
     solo non basta: la conferma si SCRIVE, ed e' il nome del database. Una
     spunta si preme per sbaglio, una parola no. */
  const rimuoveDb = sorgenteInstaller.indexOf('$PreparaPg -Indirizzo $IndirizzoPostgreSQL -Porta $PortaPostgreSQL');
  const guardiaDb = sorgenteInstaller.indexOf('if ($AncheIlDatabase) {');
  ok('il database non cade senza -AncheIlDatabase',
     guardiaDb !== -1 && rimuoveDb !== -1 && guardiaDb < rimuoveDb);

  ok('e la conferma da scrivere e il nome del database, non una spunta',
     /\$parola = if \(\$AncheIlDatabase\) \{ \$NomeDatabasePostgreSQL \}/.test(sorgenteInstaller));

  /* PRIMA SI SALVA, POI SI TOGLIE, e l'ordine e' il collaudo: il 31/08/2026
     quarantacinque movimenti di un magazzino GMP sono sopravvissuti perche'
     qualcuno si e' ricordato di copiarli a mano prima di cancellare. Qui non
     si ricorda nessuno: lo fa l'installer, e se non gli riesce si ferma. */
  const salva = sorgenteInstaller.indexOf('$salvataggio = Join-Path');
  const togliRadice = sorgenteInstaller.indexOf('Remove-Item -LiteralPath $rad -Recurse -Force');
  ok('si salva PRIMA di togliere la radice',
     salva !== -1 && togliRadice !== -1 && salva < togliRadice,
     `salvataggio al carattere ${salva}, rimozione al ${togliRadice}`);

  ok('e il salvataggio non finisce dentro la cartella che sta per sparire',
     /\$salvataggio = Join-Path \(\[Environment\]::GetFolderPath\('Desktop'\)\)/.test(sorgenteInstaller));

  ok('un salvataggio vuoto ferma la disinstallazione',
     /if \(\$quanti -eq 0\) \{[\s\S]{0,120}Errore/.test(sorgenteInstaller));

  /* DROP DATABASE NON STA IN UNA TRANSAZIONE, e `psql -c "a; b;"` ce lo
     mette: «non e' possibile eseguire DROP DATABASE all'interno di un blocco
     di transazione». Costato un giro il 01/09/2026, a mano. Le tre istruzioni
     restano tre chiamate separate. */
  const sorgentePreparaPg = fs.readFileSync(path.join(SERVER, 'prepara-postgres.ps1'), 'utf8');
  const dropUnito = /DROP DATABASE[^"']*;[^"']*DROP ROLE/.test(sorgentePreparaPg);
  ok('DROP DATABASE e DROP ROLE non viaggiano nella stessa istruzione', !dropUnito);

  ok('e prima di far cadere il database si staccano le connessioni',
     sorgentePreparaPg.indexOf('pg_terminate_backend') !== -1 &&
     sorgentePreparaPg.indexOf('pg_terminate_backend') < sorgentePreparaPg.indexOf('"DROP DATABASE $(CitaNome'));

  /* Una radice lasciata da un tentativo fallito porta i permessi gia' stretti,
     e la copia del servizio ci muore sopra con un «Accesso negato» su un file
     di cui chi installa non ha mai sentito parlare. Si riapre prima. */
  const sblocca = sorgenteInstaller.indexOf('Sblocca-Radice $Radice');
  const copiaServizio = sorgenteInstaller.indexOf("Copy-Item (Join-Path $Servizio '*') $CasaServizio");
  ok('i resti di un tentativo interrotto si riaprono prima di copiarci sopra',
     sblocca !== -1 && copiaServizio !== -1 && sblocca < copiaServizio,
     `sblocco al carattere ${sblocca}, copia al ${copiaServizio}`);


} catch (err) {
  fallite++;
  console.log(`\n  ERRORE: ${err.message}\n${err.stdout || ''}${err.stderr || ''}`);
}

console.log(`\n  ${passate} passate, ${fallite} fallite` + (saltate ? `, ${saltate} saltate` : '') + '\n');
try { fs.rmSync(CASA, { recursive: true, force: true }); } catch {}
process.exit(fallite ? 1 : 0);
