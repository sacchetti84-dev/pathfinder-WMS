/* LA GERARCHIA, PROVATA DOVE VIENE IMPOSTA — cioe' sul servizio.

   Fino alla 2.12 le cariche vivevano nel client: la maschera chiedeva il PIN
   di un Team Leader e poi mandava una PATCH come tutte le altre. Chi non
   passava dalla maschera non incontrava nessuna gerarchia. Dalla 2.13 la
   impone il servizio, e una regola imposta li' si prova li': con `fetch`, coi
   cookie veri, senza aprire un browser.

   Nove domande, e ognuna e' una porta che deve stare chiusa o aperta:

   1. il primo Admin nasce nella finestra di primo avvio
   2. l'Admin scrive l'anagrafica
   3. il Team Leader NON scrive l'anagrafica            403
   4. il Team Leader rinnova il PIN di un Operatore     200
   5. il Team Leader NON rinnova il PIN di un Admin     403
   6. l'Admin rinnova il PIN di chiunque                200
   7. l'impronta del codice di ripristino non esce mai da una risposta
   8. un codice sbagliato non apre                      401
   9. quello giusto apre UNA volta, e ne emette un altro
  10. dopo un reset del database il primo Admin si ricrea
  11. l'ultimo Admin non si retrocede, non si disattiva, non si cancella

   `node banco/gerarchia.cjs` — database temporaneo, porta 4198, non tocca
   niente di quel che sta in `banco/db`. */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');

const PORTA = 4198;
const BASE = `http://127.0.0.1:${PORTA}`;
const RADICE = path.resolve(__dirname, '..');
const DB = path.join(os.tmpdir(), `pathfinder-gerarchia-${Date.now()}.db`);

let passate = 0, fallite = 0;
const ok = (nome, cond, nota = '') => {
  if (cond) { passate++; console.log(`  PASSA    ${nome}${nota ? ' — ' + nota : ''}`); }
  else { fallite++; console.log(`  FALLISCE ${nome}${nota ? ' — ' + nota : ''}`); }
};

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

/* OGNI IDENTITA' HA IL SUO BARATTOLO DI COOKIE. Il servizio riconosce chi
   chiama dal cookie di sessione, e tre persone che ne condividessero uno
   sarebbero una persona sola: e' proprio la confusione che questa prova deve
   escludere. */
const barattolo = () => ({ cookie: null });

async function chiama(metodo, url, corpo, chi = null) {
  const intestazioni = { 'Content-Type': 'application/json', 'X-Pathfinder-Client': 'gerarchia' };
  if (chi?.cookie) intestazioni.Cookie = chi.cookie;
  const r = await fetch(BASE + url, {
    method: metodo,
    headers: intestazioni,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const posato = r.headers.get('set-cookie');
  if (posato && chi) chi.cookie = posato.split(';')[0];
  const testo = await r.text();
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { dati = testo; }
  return { stato: r.status, dati };
}

const vivo = async () => {
  try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; }
};

async function spegniQuelCheCiSta() {
  if (!await vivo()) return;
  spawnSync('powershell', ['-NoProfile', '-Command',
    `Get-NetTCPConnection -LocalPort ${PORTA} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`],
    { stdio: 'ignore' });
  for (let i = 0; i < 40 && await vivo(); i++) await attesa(250);
}

/* Un operatore nudo: il servizio ci mette sopra PIN e impronte. */
const scheda = (id, iniziali, ruolo) => ({
  op_id: id, initials: iniziali, first_name: iniziali, last_name: 'Prova',
  role: ruolo, active: true, created_at: Date.now(), updated_at: Date.now(),
});

(async () => {
  console.log('\n  LA GERARCHIA DEGLI OPERATORI — prova di banco\n');
  await spegniQuelCheCiSta();

  const servizio = spawn(process.execPath, [path.join(RADICE, 'server', 'pathfinder-server.js')], {
    cwd: RADICE, stdio: ['ignore', 'pipe', 'pipe'],
    /* Nessun `PATHFINDER_TOKEN`: la porta di servizio scavalca la gerarchia
       per disegno — backup e installer non hanno una carica — e una prova che
       la usasse non proverebbe niente. */
    /* `PATHFINDER_PG` vuota di proposito: se la macchina di chi lancia la
       prova ha un Postgres configurato, ereditarla vorrebbe dire esercitare
       la gerarchia sul magazzino vero. */
    env: { ...process.env, PATHFINDER_PORT: String(PORTA), PATHFINDER_DB: DB,
           PATHFINDER_TOKEN: '', PATHFINDER_PG: '' },
  });
  let log = '';
  servizio.stdout.on('data', (d) => { log += d; });
  servizio.stderr.on('data', (d) => { log += d; });

  for (let i = 0; i < 60 && !(await vivo()); i++) await attesa(250);
  if (!await vivo()) { console.error('il banco non si e\' acceso:\n' + log); process.exit(2); }

  const admin = barattolo(), leader = barattolo(), estraneo = barattolo();
  try {
    /* ── 1 · IL PRIMO ADMIN, nella finestra di primo avvio ────────────── */
    const pinAdmin = await chiama('POST', '/api/op/hashPin', { pin: '482913' });
    const fugaAdmin = await chiama('POST', '/api/op/hashRecovery', { codice: 'ABCDE-FGHJK-MNPQR-STVWX' });
    ok('senza nessun PIN a database la porta e\' aperta: il primo Admin si crea',
       pinAdmin.stato === 200 && fugaAdmin.stato === 200,
       `hashPin ${pinAdmin.stato} · hashRecovery ${fugaAdmin.stato}`);
    ok('e l\'impronta del codice di ripristino e\' scrypt come quella del PIN',
       fugaAdmin.dati?.rec_algo === 'scrypt' && typeof fugaAdmin.dati?.rec_hash === 'string',
       fugaAdmin.dati?.rec_algo || '(nessun algoritmo)');

    await chiama('POST', '/api/c/operators',
      { ...scheda('OP-ADMIN', 'ADM', 'admin'), ...pinAdmin.dati, ...fugaAdmin.dati });
    const entrato = await chiama('POST', '/api/auth/login', { op_id: 'OP-ADMIN', pin: '482913' }, admin);
    ok('il primo Admin entra col suo PIN', entrato.stato === 200 && admin.cookie, `stato ${entrato.stato}`);

    /* ── 2 · L'ADMIN SCRIVE L'ANAGRAFICA ──────────────────────────────── */
    const pinLeader = await chiama('POST', '/api/op/hashPin', { pin: '571304' }, admin);
    const natoLeader = await chiama('PUT', '/api/c/operators/OP-LEADER',
      { ...scheda('OP-LEADER', 'TLD', 'leader'), ...pinLeader.dati }, admin);
    const pinOperatore = await chiama('POST', '/api/op/hashPin', { pin: '640215' }, admin);
    const natoOperatore = await chiama('PUT', '/api/c/operators/OP-BASE',
      { ...scheda('OP-BASE', 'OPB', 'operator'), ...pinOperatore.dati }, admin);
    ok('l\'Admin crea un Team Leader e un Operatore',
       natoLeader.stato === 200 && natoOperatore.stato === 200,
       `leader ${natoLeader.stato} · operatore ${natoOperatore.stato}`);

    await chiama('POST', '/api/auth/login', { op_id: 'OP-LEADER', pin: '571304' }, leader);
    await chiama('POST', '/api/auth/login', { op_id: 'OP-BASE', pin: '640215' }, estraneo);
    ok('anche il Team Leader e l\'Operatore entrano', Boolean(leader.cookie && estraneo.cookie));

    /* ── 3 · E GLI ALTRI DUE NON LA SCRIVONO ──────────────────────────── */
    const scalata = await chiama('PATCH', '/api/c/operators/OP-LEADER', { role: 'admin' }, leader);
    ok('il Team Leader NON si promuove Admin', scalata.stato === 403,
       `stato ${scalata.stato}${scalata.stato === 200 ? ' — SCALATA DI PRIVILEGI' : ''}`);

    const scalataBassa = await chiama('PATCH', '/api/c/operators/OP-BASE', { role: 'admin' }, estraneo);
    ok('nemmeno l\'Operatore', scalataBassa.stato === 403, `stato ${scalataBassa.stato}`);

    const inventato = await chiama('POST', '/api/c/operators', scheda('OP-FINTO', 'FNT', 'admin'), leader);
    ok('e il Team Leader non crea un Admin da zero', inventato.stato === 403, `stato ${inventato.stato}`);

    const conTransazione = await chiama('POST', '/api/tx', {
      collections: ['operators'],
      ops: [{ op: 'update', collection: 'operators', key: 'OP-LEADER', changes: { role: 'admin' } }],
    }, leader);
    ok('nemmeno passando da una transazione', conTransazione.stato === 403, `stato ${conTransazione.stato}`);

    const spazzato = await chiama('DELETE', '/api/c/operators', undefined, leader);
    ok('e nemmeno svuotando la collezione', spazzato.stato === 403, `stato ${spazzato.stato}`);

    const ancoraLeader = await chiama('GET', '/api/c/operators/OP-LEADER', undefined, leader);
    ok('dopo cinque tentativi la carica e\' ancora quella di prima',
       ancoraLeader.dati?.role === 'leader', 'role = ' + ancoraLeader.dati?.role);

    /* ── 4-6 · IL RINNOVO DEL PIN SEGUE LA SCALA ──────────────────────── */
    const suOperatore = await chiama('POST', '/api/op/rinnovaPin', {
      op_id: 'OP-BASE', autorizzatore_id: 'OP-LEADER',
      pin_autorizzatore: '571304', nuovo_pin: '903471',
    }, leader);
    ok('il Team Leader rinnova il PIN di un Operatore', suOperatore.stato === 200, `stato ${suOperatore.stato}`);
    const conNuovo = await chiama('POST', '/api/auth/login', { op_id: 'OP-BASE', pin: '903471' }, barattolo());
    ok('e col PIN nuovo l\'Operatore entra davvero', conNuovo.stato === 200, `stato ${conNuovo.stato}`);

    const suAdmin = await chiama('POST', '/api/op/rinnovaPin', {
      op_id: 'OP-ADMIN', autorizzatore_id: 'OP-LEADER',
      pin_autorizzatore: '571304', nuovo_pin: '111213',
    }, leader);
    ok('il Team Leader NON rinnova il PIN di un Admin', suAdmin.stato === 403,
       `stato ${suAdmin.stato}${suAdmin.stato === 200 ? ' — SCALATA DI PRIVILEGI' : ''}`);

    const admiNoPin = await chiama('POST', '/api/auth/login', { op_id: 'OP-ADMIN', pin: '111213' }, barattolo());
    ok('e infatti quel PIN non apre niente', admiNoPin.stato === 401, `stato ${admiNoPin.stato}`);

    const conPinStorto = await chiama('POST', '/api/op/rinnovaPin', {
      op_id: 'OP-BASE', autorizzatore_id: 'OP-LEADER',
      pin_autorizzatore: '000001', nuovo_pin: '445566',
    }, leader);
    ok('col PIN sbagliato di chi autorizza il rinnovo non passa', conPinStorto.stato === 401,
       `stato ${conPinStorto.stato}`);

    const daAdmin = await chiama('POST', '/api/op/rinnovaPin', {
      op_id: 'OP-LEADER', autorizzatore_id: 'OP-ADMIN',
      pin_autorizzatore: '482913', nuovo_pin: '778899',
    }, admin);
    ok('l\'Admin rinnova il PIN del Team Leader', daAdmin.stato === 200, `stato ${daAdmin.stato}`);

    /* ── 7 · L'IMPRONTA DEL CODICE NON ESCE ───────────────────────────── */
    const elenco = await chiama('GET', '/api/c/operators', undefined, admin);
    const riga = (elenco.dati || []).find((o) => o.op_id === 'OP-ADMIN');
    ok('il codice di ripristino non esce da una risposta HTTP',
       riga && riga.rec_hash === undefined && riga.rec_salt === undefined,
       riga ? `rec_hash ${riga.rec_hash === undefined ? 'assente' : 'PRESENTE'}` : '(riga non trovata)');
    ok('e al suo posto dice soltanto che una via di fuga c\'e\'', riga?.rec_set === true,
       'rec_set = ' + String(riga?.rec_set));

    const perAccesso = await chiama('GET', '/api/auth/operatori');
    const rigaAccesso = (perAccesso.dati || []).find((o) => o.op_id === 'OP-ADMIN');
    ok('lo dice anche all\'elenco che disegna la schermata di accesso',
       rigaAccesso?.rec_set === true && rigaAccesso.rec_hash === undefined,
       'rec_set = ' + String(rigaAccesso?.rec_set));

    /* ── 8-9 · LA VIA DI FUGA ─────────────────────────────────────────── */
    const storto = await chiama('POST', '/api/auth/recupero',
      { op_id: 'OP-ADMIN', codice: 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ', nuovo_pin: '246810' }, barattolo());
    ok('un codice sbagliato non riscrive niente', storto.stato === 401, `stato ${storto.stato}`);

    const suUnLeader = await chiama('POST', '/api/auth/recupero',
      { op_id: 'OP-LEADER', codice: 'ABCDE-FGHJK-MNPQR-STVWX', nuovo_pin: '246810' }, barattolo());
    ok('e la via di fuga vale solo per gli Admin', suUnLeader.stato === 401, `stato ${suUnLeader.stato}`);

    const rientro = barattolo();
    const buono = await chiama('POST', '/api/auth/recupero',
      /* Con I e O al posto di 1 e 0: e' un codice ricopiato a mano da un
         foglio, ed e' il caso per cui l'alfabeto di Crockford esiste. */
      { op_id: 'OP-ADMIN', codice: 'abcde fghjk mnpqr stvwx', nuovo_pin: '246810' }, rientro);
    ok('il codice giusto riscrive il PIN e posa una sessione',
       buono.stato === 200 && Boolean(rientro.cookie), `stato ${buono.stato}`);
    ok('e la lettura perdona spazi, minuscole e trattini mancanti', buono.stato === 200);
    ok('esce un codice nuovo, della forma giusta',
       /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/.test(String(buono.dati?.nuovoCodice || '')),
       buono.dati?.nuovoCodice || '(nessun codice)');

    const rientrato = await chiama('POST', '/api/auth/login', { op_id: 'OP-ADMIN', pin: '246810' }, barattolo());
    ok('col PIN riscritto l\'Admin rientra', rientrato.stato === 200, `stato ${rientrato.stato}`);

    const speso = await chiama('POST', '/api/auth/recupero',
      { op_id: 'OP-ADMIN', codice: 'ABCDE-FGHJK-MNPQR-STVWX', nuovo_pin: '135790' }, barattolo());
    ok('il codice speso non vale piu\'', speso.stato === 401,
       `stato ${speso.stato}${speso.stato === 200 ? ' — UN CODICE RIUSABILE E\' UN SECONDO PIN' : ''}`);

    /* Il freno ha contato i tentativi sbagliati di questo `op_id`: si aspetta
       che scada, o l'ultima domanda misurerebbe il freno e non il codice. */
    const nuovo = String(buono.dati?.nuovoCodice || '');
    let ultimo = await chiama('POST', '/api/auth/recupero',
      { op_id: 'OP-ADMIN', codice: nuovo, nuovo_pin: '135790' }, barattolo());
    if (ultimo.stato === 429) {
      console.log('  · il freno sui tentativi ha morso: attendo che scada');
      await attesa((Number(ultimo.dati?.retryAfter) + 1) * 1000);
      ultimo = await chiama('POST', '/api/auth/recupero',
        { op_id: 'OP-ADMIN', codice: nuovo, nuovo_pin: '135790' }, barattolo());
    }
    ok('e quello emesso al posto suo apre a sua volta', ultimo.stato === 200, `stato ${ultimo.stato}`);

    /* ── 11 · L'ULTIMO ADMIN NON SI TOGLIE DA SOLO — 2.16 ─────────────
       La 2.13 chiude l'anagrafica a chi non ha la carica. Restava aperta la
       porta che un Admin puo' aprire DA DENTRO: togliersi la carica, o
       disattivarsi, quando e' l'unico. Da li' non si torna — la
       Configurazione vuole un Admin e il codice di ripristino pure — e
       resterebbe la sola chiave di macchina.

       Le tre forme si provano tutte e tre, perche' e' lo STATO a essere
       vietato, non il verbo. */
    const siRetrocede = await chiama('PATCH', '/api/c/operators/OP-ADMIN', { role: 'operator' }, admin);
    ok('l\'unico Admin NON si retrocede', siRetrocede.stato === 409,
       `stato ${siRetrocede.stato}${siRetrocede.stato === 200 ? ' — VICOLO CIECO' : ''}`);

    const siSpegne = await chiama('PATCH', '/api/c/operators/OP-ADMIN', { active: false }, admin);
    ok('e non si disattiva', siSpegne.stato === 409,
       `stato ${siSpegne.stato}${siSpegne.stato === 200 ? ' — VICOLO CIECO' : ''}`);

    const siCancella = await chiama('DELETE', '/api/c/operators/OP-ADMIN', undefined, admin);
    ok('e non si cancella', siCancella.stato === 409,
       `stato ${siCancella.stato}${siCancella.stato === 200 ? ' — VICOLO CIECO' : ''}`);

    const conTx = await chiama('POST', '/api/tx', {
      collections: ['operators'],
      ops: [{ op: 'update', collection: 'operators', key: 'OP-ADMIN', changes: { role: 'leader' } }],
    }, admin);
    ok('nemmeno passando da una transazione', conTx.stato === 409, `stato ${conTx.stato}`);

    const intatto = await chiama('GET', '/api/c/operators/OP-ADMIN', undefined, admin);
    ok('dopo quattro tentativi l\'Admin e\' ancora Admin e ancora attivo',
       intatto.dati?.role === 'admin' && intatto.dati?.active !== false,
       `role ${intatto.dati?.role} · active ${String(intatto.dati?.active)}`);

    /* E LA REGOLA NON E' UN MURO: con due Admin la porta si apre. Se questa
       fallisse, la 2.16 avrebbe scambiato un vicolo cieco con un altro. */
    const secondo = await chiama('PATCH', '/api/c/operators/OP-LEADER', { role: 'admin' }, admin);
    ok('nominato un secondo Admin...', secondo.stato === 200, `stato ${secondo.stato}`);

    const adessoSi = await chiama('PATCH', '/api/c/operators/OP-ADMIN', { role: 'operator' }, admin);
    ok('...il primo si retrocede davvero', adessoSi.stato === 200,
       `stato ${adessoSi.stato}${adessoSi.stato === 409 ? ' — LA REGOLA E\' DIVENTATA UN MURO' : ''}`);

    /* Si rimette la scena com'era: la prova 10 riparte da OP-ADMIN Admin. */
    await chiama('PATCH', '/api/c/operators/OP-ADMIN', { role: 'admin' }, leader);
    await chiama('PATCH', '/api/c/operators/OP-LEADER', { role: 'leader' }, admin);
    const rimessa = await chiama('GET', '/api/c/operators/OP-ADMIN', undefined, admin);
    ok('e la scena si rimette com\'era', rimessa.dati?.role === 'admin', 'role = ' + rimessa.dati?.role);

    /* ── 10 · IL RESET, E LA PORTA CHE DEVE RIAPRIRSI ─────────────────
       L'Admin resetta il database: il reset porta via anche gli operatori,
       ma la sua sessione resta buona — il cookie e' in memoria al servizio,
       non a database. Da quell'istante ha una sessione che non corrisponde
       a nessun record, e il wizard del primo Admin deve poter scrivere lo
       stesso. E' il caso peggiore di tutti: se questa scrittura viene
       rifiutata, dal database non si rientra piu'. */
    const dopoReset = barattolo();
    await chiama('POST', '/api/auth/login', { op_id: 'OP-ADMIN', pin: '135790' }, dopoReset);
    const { NAMES } = require(path.join(RADICE, 'server', 'lib', 'schema.js'));
    const reset = await chiama('POST', '/api/tx',
      { collections: [...NAMES], ops: [{ op: 'clearMany', collections: [...NAMES] }] }, dopoReset);
    ok('l\'Admin resetta il database', reset.stato === 200, `stato ${reset.stato}`);

    const pinRinato = await chiama('POST', '/api/op/hashPin', { pin: '852074' }, dopoReset);
    const rinato = await chiama('POST', '/api/c/operators',
      { ...scheda('OP-RINATO', 'ADM1', 'admin'), ...pinRinato.dati }, dopoReset);
    ok('e col database vuoto il primo Admin si ricrea, sessione orfana o no',
       rinato.stato === 200,
       `stato ${rinato.stato}${rinato.stato === 403 ? ' — DAL DATABASE NON SI RIENTRA PIU\'' : ''}`);

    const rientroFinale = await chiama('POST', '/api/auth/login', { op_id: 'OP-RINATO', pin: '852074' }, barattolo());
    ok('e il nuovo Admin entra', rientroFinale.stato === 200, `stato ${rientroFinale.stato}`);

    /* E la finestra si richiude da sola: adesso un PIN a database c'e'. */
    const intruso = await chiama('POST', '/api/c/operators', scheda('OP-INTRUSO', 'INT', 'admin'));
    ok('appena il primo PIN esiste la finestra si richiude', intruso.stato === 401,
       `stato ${intruso.stato}${intruso.stato === 200 ? ' — LA PORTA E\' RESTATA APERTA' : ''}`);
  } catch (err) {
    console.error('\n  PROVA INTERROTTA:', err.message);
    fallite++;
  }

  servizio.kill();
  await spegniQuelCheCiSta();
  for (const coda of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB + coda, { force: true }); } catch { /* il temporaneo puo' restare */ }
  }

  console.log(`\n  ${passate} passate, ${fallite} fallite\n`);
  process.exit(fallite ? 1 : 0);
})();
