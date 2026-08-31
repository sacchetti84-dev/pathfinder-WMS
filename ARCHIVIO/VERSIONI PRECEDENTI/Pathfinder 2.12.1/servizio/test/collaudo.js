'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const zlib = require('zlib');
const crypto = require('crypto');   // 2.10 — le prove di sicurezza

const TMP = path.join(os.tmpdir(), `pathfinder-collaudo-${Date.now()}.db`);
process.env.PATHFINDER_DB = TMP;
process.env.PATHFINDER_PORT = '4199';

/* ── 1.7 · UNA CARTELLA-VERSIONE FINTA ────────────────────────────────────
   Il servizio legge le variabili all'avvio, quindi la cartella va costruita
   PRIMA del `require`. Sono due: `corrente`, con l'indice e un asset, e
   `precedente` con un asset che `corrente` non ha — cosi' si prova il
   ripiego che copre chi stava caricando la pagina durante lo scambio. */
const APP = path.join(os.tmpdir(), `pathfinder-app-${Date.now()}`);
const ORA = path.join(APP, 'corrente');
const PRIMA = path.join(APP, 'precedente');

const INDICE = '<!doctype html><title>finta</title><p>PATHFINDER-COLLAUDO';
const ASSET_ORA = 'export const dove = "corrente";';
const ASSET_PRIMA = 'export const dove = "precedente";';

fs.mkdirSync(path.join(ORA, 'assets'), { recursive: true });
fs.mkdirSync(path.join(PRIMA, 'assets'), { recursive: true });
fs.writeFileSync(path.join(ORA, 'index.html'), INDICE);
fs.writeFileSync(path.join(ORA, 'assets', 'index-AAAA1111.js'), ASSET_ORA);
/* Il `.gz` porta un contenuto DIVERSO dal file in chiaro. Non e' un dispetto:
   e' l'unico modo di provare quale dei due percorsi ha risposto, visto che
   `fetch` decomprime da solo e la forma compressa non si vede piu' arrivata
   la risposta. In produzione i due contenuti sono lo stesso byte. */
fs.writeFileSync(path.join(ORA, 'assets', 'index-AAAA1111.js.gz'),
                 zlib.gzipSync(ASSET_ORA.replace('corrente', 'corrente-compresso')));
fs.writeFileSync(path.join(PRIMA, 'assets', 'index-BBBB2222.js'), ASSET_PRIMA);
/* IL BOM DAVANTI E' VOLUTO. `installa-versione.ps1` genera il manifesto di una
   consegna avvolta, e in PowerShell 5.1 `Out-File -Encoding utf8` scrive UTF-8
   col BOM: `JSON.parse` su di lui lancia, e `/api/app-info` rispondeva versione
   e impronta NULLE dopo un ritorno indietro. Trovato al banco il 17/08 con
   tutti i collaudi verdi — da qui in avanti lo copre una prova. */
fs.writeFileSync(path.join(ORA, 'manifest.json'), '﻿' + JSON.stringify({
  versione: '1.7-collaudo',
  costruita: new Date().toISOString(),
  byte_totali: INDICE.length + ASSET_ORA.length,
  file: [{ percorso: 'index.html', byte: INDICE.length, sha256: 'x' }],
  impronta: 'impronta-di-prova',
}));

process.env.PATHFINDER_APP_DIR = ORA;
/* 2.6 — LE STESSE 98 PROVE, SUI DUE DATABASE.
   Di serie gira su SQLite, e lo DICE invece di lasciarlo decidere a un
   `.env.local` che magari sta li' da un'altra prova. Con
   `PATHFINDER_COLLAUDO_PG=1` gira le stesse identiche prove contro
   PostgreSQL, prendendo la stringa da `.env.local`:

     $env:PATHFINDER_COLLAUDO_PG='1'; node test/collaudo.js

   Non e' lo stesso di `test/driver.test.js`: li' si prova il driver, qui si
   prova IL SERVIZIO — le ventiquattro rotte, le operazioni composte, la
   contesa fra due terminali, le notifiche. E' l'unico posto in cui si vede
   se un magazzino vero funzionerebbe dall'altra parte. */
const SU_PG = process.env.PATHFINDER_COLLAUDO_PG === '1';
if (SU_PG) {
  const { leggiEnvLocale } = require('../lib/db.js');
  const env = leggiEnvLocale(path.join(__dirname, "..", ".."));
  /* IL DATABASE DEI COLLAUDI, NON QUELLO SU CUI SI PROVA — 26/08.
     Qui sotto c'e un TRUNCATE di tutti i tavoli. Puntato al database dove
     qualcuno sta provando l'applicativo, gli porta via i dati sotto i piedi:
     e' successo il 26/08 su , con dentro gli 11.197
     articoli appena migrati, e se n'e accorto solo chi e' andato a
     guardare i conteggi. Si usa , e NON si ripiega
     in silenzio su : il ripiego e' il gesto che ha fatto il danno. */
  const pg = process.env.PATHFINDER_PG_COLLAUDO || env.PATHFINDER_PG_COLLAUDO;
  if (!pg) { console.error("\n  PATHFINDER_COLLAUDO_PG=1 ma PATHFINDER_PG_COLLAUDO non e' impostata.\n"); process.exit(1); }
  /* La cintura, oltre alle bretelle: anche impostando la variabile sul
     database sbagliato, il nome deve dirlo. */
  const nomeDb = (() => { try { return new URL(pg).pathname.slice(1); } catch { return String(); } })();
  if (!/_collaudo$/.test(nomeDb)) {
    console.error(`
  Il database si chiama "${nomeDb}" e non finisce per "_collaudo".
  Questo banco svuota i tavoli: non lo fa su un database di lavoro.
`);
    process.exit(1);
  }
  process.env.PATHFINDER_PG = pg;
  /* Si parte da vuoto: le prove contano le righe che scrivono loro. */
  const { Client } = require('../node_modules/pg');
  const { NAMES } = require('../lib/schema.js');
  const c = new Client({ connectionString: pg, ssl: false });
  module.exports = c.connect()
    .then(() => c.query(`TRUNCATE ${[...NAMES, '_revision'].join(', ')} RESTART IDENTITY CASCADE`).catch(() => {}))
    .then(() => c.end());
} else {
  process.env.PATHFINDER_PG = '';
}

/* 2.11 — LA CHIAVE DI QUESTE PROVE, e si imposta PRIMA del `require`: il
   servizio legge `PATHFINDER_TOKEN` una volta sola, all'avvio del processo,
   e qui il processo e' questo. Dalla 2.11 le rotte `/api` vogliono una
   sessione, e un collaudo non ha un browser dove posare un cookie: entra
   dalla porta di servizio, quella che il backup serale e l'installer usano
   sulla macchina vera. */
const TOKEN = 'collaudo-' + crypto.randomBytes(16).toString('hex');
process.env.PATHFINDER_TOKEN = TOKEN;

/* 2.6 — `db` e' un getter: il servizio lo apre dentro `pronto`, e prima di
   quel momento vale `null`. Destrutturarlo qui darebbe null per sempre. */
const servizio = require('../pathfinder-server.js');
const { app, server } = servizio;

const BASE = 'http://127.0.0.1:4199';
let passate = 0, fallite = 0;

const ok = (nome, cond, nota = '') => {
  if (cond) { passate++; console.log(`  PASSA   ${nome}${nota ? ' — ' + nota : ''}`); }
  else { fallite++; console.log(`  FALLISCE ${nome}${nota ? ' — ' + nota : ''}`); }
};

const call = async (metodo, url, corpo, cliente = 'T1', { senzaChiave = false } = {}) => {
  const intestazioni = { 'Content-Type': 'application/json', 'X-Pathfinder-Client': cliente };
  if (!senzaChiave) intestazioni['X-Pathfinder-Token'] = TOKEN;
  const r = await fetch(BASE + url, {
    method: metodo,
    headers: intestazioni,
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  const testo = await r.text();
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { dati = testo; }
  return { stato: r.status, dati };
};

(async () => {
  console.log('\n  COLLAUDO DEL SERVIZIO DATI\n');
  await new Promise(r => setTimeout(r, 300));

  // ── Salute ────────────────────────────────────────────────────────
  const salute = await call('GET', '/api/health');
  ok('Servizio risponde', salute.stato === 200 && salute.dati.ok);
  /* Quattordici fino alla 1.2, diciannove dalla 1.4.0, venti dalla 1.6,
     VENTUNO dalla 2.8 con `location_attrs`:
     le cinque della 1.4 nascono vuote in Fase 0 perche' lo schema si muova
     una volta sola; `recipients` no — e' nata dall'uso, e non c'era modo di
     prevederla. Che i nomi siano quelli che il client si aspetta lo prova il
     tipo in `lib/schema.js`, non questo conteggio. */
  const NUOVE_14 = ['lots', 'udc', 'tasks', 'wip', 'storage_rules'];
  ok('Ventuno collezioni dichiarate', salute.dati.collections.length === 21,
     salute.dati.collections.length + '');
  ok('le cinque collezioni della 1.4 ci sono e sono vuote',
     NUOVE_14.every(c => salute.dati.collections.includes(c))
       && NUOVE_14.every(c => (salute.dati.counts?.[c] ?? 0) === 0),
     NUOVE_14.join(' · '));
  /* 1.6 — la ventesima nasce vuota come le altre: un'anagrafica che si
     popola da se' e' vuota finche' non si compila il primo DDT. */
  ok('recipients c e ed e vuota',
     salute.dati.collections.includes('recipients')
       && (salute.dati.counts?.recipients ?? 0) === 0,
     'recipients');

  // ── Chiave autoincrementale ───────────────────────────────────────
  const a1 = await call('POST', '/api/c/articles',
    { code: 'MP-1', description: 'Maltodestrine', category: 'MP', weight_net_kg: 2.5 });
  ok('add restituisce la chiave generata', a1.stato === 200 && typeof a1.dati.key === 'number',
     'key=' + a1.dati.key);

  const a1letto = await call('GET', '/api/c/articles/' + a1.dati.key);
  ok('get rilegge il documento intero', a1letto.dati.description === 'Maltodestrine' && a1letto.dati.weight_net_kg === 2.5);
  ok('la chiave torna dentro il documento', a1letto.dati._id === a1.dati.key);

  // ── Unicita' ──────────────────────────────────────────────────────
  const dup = await call('POST', '/api/c/articles', { code: 'MP-1', description: 'Doppione' });
  ok('chiave duplicata respinta con 409, non 500', dup.stato === 409, 'stato ' + dup.stato);

  // ── Campo nuovo mai dichiarato ────────────────────────────────────
  const a2 = await call('POST', '/api/c/articles',
    { code: 'MP-2', description: 'Proteine', campo_inventato_domani: 'valore' });
  const a2letto = await call('GET', '/api/c/articles/' + a2.dati.key);
  ok('un campo nuovo entra senza migrazione', a2letto.dati.campo_inventato_domani === 'valore');

  // ── Chiave naturale ───────────────────────────────────────────────
  await call('PUT', '/api/c/operators/OP-1',
    { op_id: 'OP-1', initials: 'ANDS', first_name: 'Andrea', role: 'leader', active: true });
  const op = await call('GET', '/api/c/operators/OP-1');
  ok('chiave naturale di testo', op.dati.initials === 'ANDS');

  // ── Modifica parziale ─────────────────────────────────────────────
  await call('PATCH', '/api/c/operators/OP-1', { role: 'operator' });
  const opMod = await call('GET', '/api/c/operators/OP-1');
  ok('PATCH cambia un campo e lascia gli altri',
     opMod.dati.role === 'operator' && opMod.dati.first_name === 'Andrea');

  // ── Criteri dichiarativi ──────────────────────────────────────────
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', article_code: 'MP-1', lot_code: 'L1', qty: 40 },
    { location_code: 'DP-A-01-02-T', item_key: 'MP-1#L2', article_code: 'MP-1', lot_code: 'L2', qty: 25 },
    { location_code: 'DP-B-01-01',   item_key: 'MP-2#L3', article_code: 'MP-2', lot_code: 'L3', qty: 12 }
  ]);
  const perPrefisso = await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'location_code', op: 'startsWith', value: 'DP-A' })));
  ok('criterio startsWith', perPrefisso.dati.length === 2, perPrefisso.dati.length + ' righe');

  const conta = await call('GET',
    '/api/c/inventory/count?criteria=' + encodeURIComponent(JSON.stringify({ field: 'article_code', op: 'equals', value: 'MP-1' })));
  ok('criterio equals con conteggio', conta.dati.count === 2);

  const campoNonIndicizzato = await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'qty', op: 'equals', value: 40 })));
  ok('filtrare su un campo non indicizzato viene respinto con un motivo',
     campoNonIndicizzato.stato === 400, campoNonIndicizzato.dati.error);

  // ── Registro e finestra temporale ─────────────────────────────────
  const ora = Date.now();
  await call('POST', '/api/c/mov_log/bulk', [
    { ts: ora - 400 * 86400e3, type: 'IN',  article_code: 'MP-1', lot_code: 'L1', location_code: 'DP-A-01-01-T' },
    { ts: ora - 10 * 86400e3,  type: 'OUT', article_code: 'MP-1', lot_code: 'L1', location_code: 'DP-A-01-01-T' },
    { ts: ora,                 type: 'IN',  article_code: 'MP-2', lot_code: 'L3', location_code: 'DP-B-01-01' }
  ]);
  const finestra = await call('GET', '/api/load?movLogFrom=' + (ora - 120 * 86400e3));
  ok('la finestra del registro esclude il vecchio', finestra.dati.mov_log.length === 2,
     finestra.dati.mov_log.length + ' in finestra');
  ok('il totale a database resta quello vero', finestra.dati._movLogTotal === 3);
  ok('load porta tutte le collezioni in una chiamata',
     Array.isArray(finestra.dati.articles) && Array.isArray(finestra.dati.inventory) && Array.isArray(finestra.dati.operators));

  // ── Lotto atomico ─────────────────────────────────────────────────
  const revPrima = (await call('GET', '/api/health')).dati.revision;
  const tx = await call('POST', '/api/tx', {
    collections: ['sites', 'zones'],
    ops: [
      { op: 'add', collection: 'sites', record: { id: 'DP', name: 'Deposito Principale' } },
      { op: 'add', collection: 'zones', record: { site_id: 'DP', id: 'A', name: 'Corsia A', type: 'RACK' } }
    ]
  });
  ok('lotto atomico eseguito', tx.stato === 200 && tx.dati.ok);
  const revDopo = (await call('GET', '/api/health')).dati.revision;
  ok('il lotto conta come UNA revisione, non due', revDopo === revPrima + 1,
     revPrima + ' → ' + revDopo);

  // ── Il lotto fallisce tutto insieme ───────────────────────────────
  const sitiPrima = (await call('GET', '/api/c/sites')).dati.length;
  const txKo = await call('POST', '/api/tx', {
    collections: ['sites'],
    ops: [
      { op: 'add', collection: 'sites', record: { id: 'DP2', name: 'Secondo' } },
      { op: 'add', collection: 'sites', record: { id: 'DP', name: 'Doppione che deve far fallire tutto' } }
    ]
  });
  const sitiDopo = (await call('GET', '/api/c/sites')).dati.length;
  ok('se una operazione del lotto fallisce, non passa nessuna',
     txKo.stato === 409 && sitiDopo === sitiPrima, `stato ${txKo.stato}, siti ${sitiPrima}→${sitiDopo}`);

  // ── Operazione di dominio: scarico con controllo ──────────────────
  const scarico = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 5 });
  ok('scarico parziale', scarico.stato === 200 && scarico.dati._qty_after === 35,
     'saldo ' + scarico.dati._qty_after);
  ok('lo scarico dichiara il prima e il dopo',
     scarico.dati._qty_before === 40 && scarico.dati._qty_delta === -5 && scarico.dati._mode === 'partial');

  const troppo = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 999 });
  ok('scarico oltre la giacenza respinto', troppo.stato === 409, troppo.dati.error);

  /* ── IL CAMPO FANTASMA — 2.2 ────────────────────────────────────────
     La riga di giacenza ha UN campo per l'ultima modifica e si chiama
     `last_updated_at`: e' quello che `Giacenza` dichiara e quello che il
     client legge. Fino alla 2.1 tre rotte su quattro scrivevano
     `updated_at`, che nessuno legge — e il difetto non si vedeva, perche'
     il client si riallinea sulla risposta del servizio e la riga a schermo
     tornava giusta. A database, intanto, restavano due campi e due date.
     La prova guarda LA RIGA SCRITTA, non la risposta: e' l'unico posto da
     cui quel difetto si vedeva. Si aggancia allo scarico parziale qui
     sopra e non toglie merce sua: un collo consumato in piu' sposterebbe
     ogni saldo delle prove che seguono. */
  const timbrata = (await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'item_key', op: 'equals', value: 'MP-1#L1' })))).dati[0];
  ok('lo scarico timbra `last_updated_at` sulla riga',
     timbrata && typeof timbrata.last_updated_at === 'number'
       && Date.now() - timbrata.last_updated_at < 60_000,
     'last_updated_at ' + (timbrata ? timbrata.last_updated_at : 'riga sparita'));
  ok('e non lascia dietro il campo fantasma `updated_at`',
     timbrata && timbrata.updated_at === undefined,
     timbrata && timbrata.updated_at !== undefined ? 'updated_at ' + timbrata.updated_at : 'assente, come deve');

  // ── LA PROVA CHE CONTA: due terminali sullo stesso collo ──────────
  const [t1, t2] = await Promise.all([
    call('POST', '/api/op/removeItem', { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 20 }, 'TERMINALE-1'),
    call('POST', '/api/op/removeItem', { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 20 }, 'TERMINALE-2')
  ]);
  const passati = [t1, t2].filter(r => r.stato === 200).length;
  const respinti = [t1, t2].filter(r => r.stato === 409).length;
  const resto = (await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'item_key', op: 'equals', value: 'MP-1#L1' })))).dati[0];
  ok('contesa fra due terminali: passa uno solo', passati === 1 && respinti === 1,
     `${passati} passati, ${respinti} respinti`);
  ok('la giacenza non va mai sotto zero', resto && resto.qty === 15, 'saldo ' + (resto ? resto.qty : 'riga sparita'));

  // ── Scarico totale ────────────────────────────────────────────────
  const totale = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-A-01-01-T', item_key: 'MP-1#L1', qty: 15 });
  const sparito = (await call('GET',
    '/api/c/inventory/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'item_key', op: 'equals', value: 'MP-1#L1' })))).dati;
  ok('scarico totale rimuove la riga', totale.dati._mode === 'full' && sparito.length === 0);

  // ── Tappa di prelievo ─────────────────────────────────────────────
  const tappa = await call('POST', '/api/op/commitPickStop', {
    location_code: 'DP-A-01-02-T', item_key: 'MP-1#L2', qty: 5,
    movement: { type: 'PICK', article_code: 'MP-1', lot_code: 'L2',
                location_code: 'DP-A-01-02-T', user: 'ANDS', doc_ref: 'ODP-1' },
    session: { session_id: 'S1', status: 'active', created_at: Date.now(), stops: [] }
  });
  ok('tappa di prelievo: scarico, movimento e sessione insieme',
     tappa.stato === 200 && tappa.dati.movement_id > 0 && tappa.dati.removed._qty_after === 20,
     'saldo ' + tappa.dati.removed._qty_after);
  const sess = await call('GET', '/api/c/pick_session/S1');
  ok('la sessione di prelievo e\' stata salvata nella stessa transazione', sess.dati?.session_id === 'S1');

  /* ── 1.4.2 — le UM escono dentro la stessa transazione dei colli ────
     La ragione per cui queste rotte composte esistono e' che due terminali
     prelevano lo stesso lotto nello stesso pomeriggio. Dalla 1.4.2 i numeri
     da tenere insieme sono due, e valgono le stesse regole: chi tocca l'uno
     tocca l'altro, o nessuno dei due. */
  const RIGA = (q) => '/api/c/inventory/query?criteria=' + encodeURIComponent(
    JSON.stringify({ field: 'item_key', op: 'equals', value: q }));
  const leggiRiga = async (k) => (await call('GET', RIGA(k))).dati[0];

  await call('POST', '/api/c/inventory/bulk', [
    /* L'esempio del piano §4.2: 10.100 pz da 1.000 per collo. */
    { location_code: 'DP-C-01-01', item_key: 'MP-3#L4', article_code: 'MP-3', lot_code: 'L4', qty: 11, qty_uom: 10100 },
    { location_code: 'DP-C-01-02', item_key: 'MP-3#L5', article_code: 'MP-3', lot_code: 'L5', qty: 11 },
    { location_code: 'DP-C-01-03', item_key: 'MP-3#L6', article_code: 'MP-3', lot_code: 'L6', qty: 40, qty_uom: 40000 },
    { location_code: 'DP-C-01-04', item_key: 'MP-3#L7', article_code: 'MP-3', lot_code: 'L7', qty: 10 },
    { location_code: 'DP-C-01-05', item_key: 'MP-3#L8', article_code: 'MP-3', lot_code: 'L8', qty: 10, qty_uom: 0.3 },
    { location_code: 'DP-C-01-06', item_key: 'MP-3#L9', article_code: 'MP-3', lot_code: 'L9', qty: 10, qty_uom: 100 }
  ]);

  /* Il caso di tutti i giorni finche' non si accende l'interruttore: una riga
     a soli colli resta a soli colli. Il servizio non inventa un qty_uom. */
  const soliColli = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-04', item_key: 'MP-3#L7', qty: 2 });
  const l7 = await leggiRiga('MP-3#L7');
  ok('senza UM il servizio non ne inventa: la riga resta a soli colli',
     soliColli.dati._qty_uom_after === undefined && l7.qty === 8 && l7.qty_uom === undefined,
     'qty ' + l7.qty);

  const conUm = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-01', item_key: 'MP-3#L4', qty: 1, qty_uom: 1000, qty_uom_before: 10100 });
  const l4 = await leggiRiga('MP-3#L4');
  ok('colli e UM scendono insieme, nella stessa transazione',
     l4.qty === 10 && l4.qty_uom === 9100 && conUm.dati._qty_uom_delta === -1000,
     `${l4.qty} colli · ${l4.qty_uom} pz`);

  /* Il seme: una riga posizionata prima della 1.4.2 non ha nessun qty_uom, e
     il primo che la muove porta la propria derivazione. Vale UNA volta. */
  const seme = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-02', item_key: 'MP-3#L5', qty: 1, qty_uom: 1000, qty_uom_before: 11000 });
  const l5 = await leggiRiga('MP-3#L5');
  ok('la riga che non ha mai avuto UM le prende dal primo che la muove',
     l5.qty_uom === 10000 && seme.dati._qty_uom_before === 11000, 'saldo ' + l5.qty_uom);

  /* LA PROVA CHE CONTA PIU' DI TUTTE: il servizio legge il PROPRIO saldo, non
     quello che gli dice il client. Se cosi' non fosse, il secondo terminale
     riscriverebbe il numero del primo con una fotografia vecchia. */
  const bugia = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-01', item_key: 'MP-3#L4', qty: 1, qty_uom: 1000, qty_uom_before: 999999 });
  const l4bis = await leggiRiga('MP-3#L4');
  ok('il servizio legge il proprio saldo in UM, non quello del client',
     bugia.dati._qty_uom_before === 9100 && l4bis.qty_uom === 8100, 'saldo ' + l4bis.qty_uom);

  /* Un saldo negativo in un magazzino e' peggio di un prelievo rifiutato:
     si tronca a cio' che c'e'. */
  const troppeUm = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-02', item_key: 'MP-3#L5', qty: 1, qty_uom: 99999, qty_uom_before: 0 });
  const l5bis = await leggiRiga('MP-3#L5');
  ok('le UM non scendono mai sotto zero: si troncano a cio\' che c\'e\'',
     l5bis.qty_uom === 0 && troppeUm.dati._qty_uom_delta === -10000, 'saldo ' + l5bis.qty_uom);

  /* Lo scarico totale porta via tutto, e lo dichiara anche se il client non
     ha mandato nessun numero: la riga sparisce, il conto no. */
  const tuttoFuori = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-01', item_key: 'MP-3#L4', qty: 9 });
  ok('lo scarico totale dichiara quante UM sono uscite',
     tuttoFuori.dati._mode === 'full' && tuttoFuori.dati._qty_uom_delta === -8100
       && tuttoFuori.dati._qty_uom_after === 0,
     'uscite ' + tuttoFuori.dati._qty_uom_delta);

  const [u1, u2] = await Promise.all([
    call('POST', '/api/op/removeItem',
      { location_code: 'DP-C-01-03', item_key: 'MP-3#L6', qty: 25, qty_uom: 25000 }, 'TERMINALE-1'),
    call('POST', '/api/op/removeItem',
      { location_code: 'DP-C-01-03', item_key: 'MP-3#L6', qty: 25, qty_uom: 25000 }, 'TERMINALE-2')
  ]);
  const l6 = await leggiRiga('MP-3#L6');
  ok('contesa sulle UM: passa un terminale solo, e i due saldi restano coerenti',
     [u1, u2].filter(r => r.stato === 200).length === 1 && l6.qty === 15 && l6.qty_uom === 15000,
     `${l6.qty} colli · ${l6.qty_uom} UM`);

  /* L'arrotondamento e' quello di modules/misure.ts, riscritto qui perche' il
     servizio resta JavaScript. I numeri di questa prova NON sono a caso:
     `0,3 − 0,1` in virgola mobile vale 0,19999999999999998, e un saldo cosi'
     non si azzera mai. Quasi tutte le altre coppie di decimali cadono esatte
     e non proverebbero niente — vedi trappola 17. */
  await call('POST', '/api/op/removeItem',
    { location_code: 'DP-C-01-05', item_key: 'MP-3#L8', qty: 1, qty_uom: 0.1 });
  const l8 = await leggiRiga('MP-3#L8');
  ok('i decimali non lasciano code: 0,3 meno 0,1 fa 0,2 e non 0,19999999999999998',
     l8.qty_uom === 0.2, 'saldo ' + l8.qty_uom);

  const tappaUm = await call('POST', '/api/op/commitPickStop', {
    location_code: 'DP-C-01-06', item_key: 'MP-3#L9', qty: 2, qty_uom: 20,
    movement: { type: 'PICK', article_code: 'MP-3', lot_code: 'L9',
                location_code: 'DP-C-01-06', user: 'ANDS', doc_ref: 'ODP-2' },
    session: { session_id: 'S2', status: 'active', created_at: Date.now(), stops: [] }
  });
  const movUm = (await call('GET',
    '/api/c/mov_log/query?criteria=' + encodeURIComponent(
      JSON.stringify({ field: 'lot_code', op: 'equals', value: 'L9' })))).dati[0];
  const l9 = await leggiRiga('MP-3#L9');
  ok('la tappa di prelievo scrive il delta in UM nel registro, non solo i colli',
     tappaUm.stato === 200 && movUm?.qty_uom_delta === -20 && l9.qty_uom === 80,
     `registro ${movUm?.qty_uom_delta} · saldo ${l9.qty_uom}`);


  /* ── 1.4.2.1 — il campionamento: il collo resta, cala cio' che c'e' dentro ──
     Un campione esce dal magazzino ma il sacco da 25 kg torna a scaffale: i
     colli non calano. E' la ragione per cui questa rotta esiste separata da
     removeItem, che una quantita' sotto l'uno la rifiuta — e fa bene. */
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', article_code: 'MP-4', lot_code: 'C1', qty: 11, qty_uom: 275 },
    { location_code: 'DP-D-01-02', item_key: 'MP-4#C2', article_code: 'MP-4', lot_code: 'C2', qty: 4 }
  ]);

  const camp = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 0.05 });
  const c1 = await leggiRiga('MP-4#C1');
  ok('il campione cala dalle UM e NON dai colli',
     camp.stato === 200 && c1.qty === 11 && c1.qty_uom === 274.95,
     `${c1.qty} colli · ${c1.qty_uom} UM`);

  ok('la rotta dichiara il prima, il dopo e quanto e\' uscito',
     camp.dati.qty_uom_before === 275 && camp.dati.qty_uom_after === 274.95
       && camp.dati.qty_uom_delta === -0.05);

  /* Un campione piu' grosso di cio' che c'e' e' un numero sbagliato, e un
     numero DICHIARATO da chi ha la merce in mano si convalida: si rifiuta. */
  const troppoGrosso = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 9999 });
  ok('un campione piu\' grande della giacenza viene respinto, non troncato',
     troppoGrosso.stato === 409, troppoGrosso.dati.error);

  const zero = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 0 });
  ok('un campione da zero non e\' un campione', zero.stato === 400, 'stato ' + zero.stato);

  /* La riga a soli colli non ha niente da cui prelevare: si dice, non si
     inventa un saldo. */
  const senzaUm = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-02', item_key: 'MP-4#C2', qty_uom: 1 });
  ok('senza quantita\' in UM il campione viene respinto con un motivo',
     senzaUm.stato === 409, senzaUm.dati.error);

  /* Il seme vale una volta, come per removeItem: la riga che un qty_uom non
     lo ha mai avuto lo prende dal primo che la tocca. */
  const conSeme = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-02', item_key: 'MP-4#C2', qty_uom: 2, qty_uom_before: 100 });
  const c2 = await leggiRiga('MP-4#C2');
  ok('la riga senza UM le prende dal seme, e i colli restano quelli',
     conSeme.stato === 200 && c2.qty_uom === 98 && c2.qty === 4,
     `${c2.qty} colli · ${c2.qty_uom} UM`);

  const [s1, s2] = await Promise.all([
    call('POST', '/api/op/sampleItem', { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 0.5 }, 'TERMINALE-1'),
    call('POST', '/api/op/sampleItem', { location_code: 'DP-D-01-01', item_key: 'MP-4#C1', qty_uom: 0.5 }, 'TERMINALE-2')
  ]);
  const c1bis = await leggiRiga('MP-4#C1');
  ok('due campioni insieme scalano tutti e due, dentro la transazione',
     s1.stato === 200 && s2.stato === 200 && c1bis.qty_uom === 273.95,
     'saldo ' + c1bis.qty_uom);

  /* ── 1.8.4 — IL CAMPIONE ESCE DA UN COLLO PRECISO ──────────────────
     Fino alla 1.8.3 il campionamento scalava `qty_uom` e lasciava `packs`
     com'era: su una riga a colli dichiarati l'elenco continuava a sommare
     il vecchio totale, e siccome dove c'e' l'elenco comanda l'elenco, il
     campione SPARIVA alla lettura dopo. E' la forma dell'incoerenza vista
     al banco su MAG-SCA-01-03-B: colli per 101, `qty_uom` 81. */
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-D-01-03', item_key: 'MP-5#S1', article_code: 'MP-5', lot_code: 'S1',
      qty: 3, qty_uom: 60, packs: [25, 25, 10] }
  ]);

  const campCollo = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-03', item_key: 'MP-5#S1', packs_out: [{ da: 25, quantita: 0.05 }] });
  const s1riga = await leggiRiga('MP-5#S1');
  ok('il campione apre il collo scelto e lo lascia a scaffale',
     campCollo.stato === 200 && s1riga.qty === 3
       && JSON.stringify(s1riga.packs) === JSON.stringify([24.95, 25, 10])
       && s1riga.qty_uom === 59.95,
     `${s1riga.qty} colli · ${JSON.stringify(s1riga.packs)} · ${s1riga.qty_uom} UM`);

  /* Il collo da cui esce il campione e' quello che l'operatore ha in mano:
     una misura che non c'e' piu' non ripiega su un'altra comoda. */
  const campMisuraAssente = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-03', item_key: 'MP-5#S1', packs_out: [{ da: 7, quantita: 0.05 }] });
  ok("un campione da una misura che non c'e' viene respinto",
     campMisuraAssente.stato === 409, campMisuraAssente.dati.error);

  /* UN CAMPIONE VALE UN COLLO DI RESIDUO: svuotare un collo non e'
     campionare, e' prelevarlo. La rotta si ferma invece di far sparire un
     collo da una funzione che promette di non toccarli. */
  const campSvuota = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-03', item_key: 'MP-5#S1', packs_out: [{ da: 10, quantita: 10 }] });
  ok('un campione che svuota il collo viene respinto: il collo resta sempre',
     campSvuota.stato === 409, campSvuota.dati.error);

  const campDueColli = await call('POST', '/api/op/sampleItem',
    { location_code: 'DP-D-01-03', item_key: 'MP-5#S1',
      packs_out: [{ da: 25, quantita: 0.05 }, { da: 10, quantita: 0.05 }] });
  ok("un campione esce da un collo solo: due non e' un campione",
     campDueColli.stato === 400, campDueColli.dati.error);

  /* ── 1.8 — L'ELENCO DEI COLLI, ARBITRATO DAL SERVIZIO ──────────────
     Dalla 1.8 la suddivisione non si calcola da un per-collo costante: si
     dichiara, e la riga porta `packs`, un numero per collo. Il client sceglie
     QUALI colli per indice; qui gli indici non arrivano nemmeno, e il motivo
     e' lo stesso di `qty_uom_before`: la fotografia del client e' vecchia di
     un pomeriggio. Arriva `packs_out`, cioe' QUANTO esce da ogni collo, e il
     servizio lo applica al proprio elenco.

     Le due colonne diventano derivate: dove c'e' `packs`, `qty` e `qty_uom`
     li conta l'elenco e non il client. */
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-E-01-01', item_key: 'MP-5#P1', article_code: 'MP-5', lot_code: 'P1',
      qty: 3, qty_uom: 2900, packs: [1000, 1000, 900] },
    { location_code: 'DP-E-01-02', item_key: 'MP-5#P2', article_code: 'MP-5', lot_code: 'P2',
      qty: 2, qty_uom: 1500, packs: [1000, 500] },
    { location_code: 'DP-E-01-03', item_key: 'MP-5#P3', article_code: 'MP-5', lot_code: 'P3',
      qty: 2, qty_uom: 1300, packs: [1000, 300] },
    { location_code: 'DP-E-01-04', item_key: 'MP-5#P4', article_code: 'MP-5', lot_code: 'P4', qty: 3, qty_uom: 2900 },
    { location_code: 'DP-E-01-05', item_key: 'MP-5#P5', article_code: 'MP-5', lot_code: 'P5',
      qty: 2, qty_uom: 200, packs: [100, 100] },
    { location_code: 'DP-E-01-06', item_key: 'MP-5#P6', article_code: 'MP-5', lot_code: 'P6',
      qty: 1, qty_uom: 1000, packs: [1000] },
    { location_code: 'DP-E-01-07', item_key: 'MP-5#P7', article_code: 'MP-5', lot_code: 'P7',
      qty: 3, qty_uom: 0.3, packs: [0.1, 0.1, 0.1] },
    { location_code: 'DP-E-01-08', item_key: 'MP-5#P8', article_code: 'MP-5', lot_code: 'P8',
      qty: 2, qty_uom: 2000, packs: [1000, 1000] },
    { location_code: 'DP-E-01-09', item_key: 'MP-5#P9', article_code: 'MP-5', lot_code: 'P9',
      qty: 1, qty_uom: 900, packs: [900] }
  ]);

  const interoFuori = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-01-01', item_key: 'MP-5#P1', packs_out: [900] });
  const p1 = await leggiRiga('MP-5#P1');
  ok('esce il collo scelto, e le due colonne le riconta l\'elenco',
     interoFuori.stato === 200 && p1.qty === 2 && p1.qty_uom === 2000
       && JSON.stringify(p1.packs) === '[1000,1000]',
     `${p1.qty} colli · ${p1.qty_uom} UM · ${JSON.stringify(p1.packs)}`);

  /* IL PARZIALE APRE IL COLLO PIU' PICCOLO CHE BASTA: aprire quello da 1.000
     per prendere 300 lascerebbe due colli aperti dove ne bastava uno. */
  const aperto = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-01-02', item_key: 'MP-5#P2', qty: 1, packs_out: [300] });
  const p2 = await leggiRiga('MP-5#P2');
  ok('il parziale apre il collo piu\' piccolo che basta, e i colli non calano',
     p2.qty === 2 && p2.qty_uom === 1200 && JSON.stringify(p2.packs) === '[1000,200]',
     `${p2.qty} colli · ${JSON.stringify(p2.packs)}`);
  ok('con l\'elenco i colli li conta l\'elenco, non il `qty` del client',
     aperto.dati._qty_after === 2 && aperto.dati._mode === 'partial',
     'saldo ' + aperto.dati._qty_after);

  const esatto = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-01-03', item_key: 'MP-5#P3', packs_out: [300] });
  const p3 = await leggiRiga('MP-5#P3');
  ok('un collo della misura esatta esce intero invece di aprirne un altro',
     esatto.stato === 200 && p3.qty === 1 && JSON.stringify(p3.packs) === '[1000]',
     JSON.stringify(p3.packs));

  /* Il seme, come per `qty_uom`: la riga posizionata prima della 1.8 non ha
     nessun elenco, e il primo che la muove porta la propria lettura — colli
     pieni piu' il resto. Vale UNA volta, poi comanda la riga. */
  const seminata = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-01-04', item_key: 'MP-5#P4', packs_out: [900], packs_before: [1000, 1000, 900] });
  const p4 = await leggiRiga('MP-5#P4');
  ok('la riga che non ha mai avuto un elenco lo prende dal primo che la muove',
     seminata.stato === 200 && JSON.stringify(p4.packs) === '[1000,1000]' && p4.qty_uom === 2000,
     JSON.stringify(p4.packs));

  const nonCiSta = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-01-05', item_key: 'MP-5#P5', packs_out: [150] });
  ok('una quantita\' che nessun collo contiene viene respinta, non spalmata',
     nonCiSta.stato === 409, nonCiSta.dati.error);

  const dueVolte = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-01-06', item_key: 'MP-5#P6', packs_out: [1000, 1000] });
  const p6 = await leggiRiga('MP-5#P6');
  ok('lo stesso collo non esce due volte: la riga resta intera',
     dueVolte.stato === 409 && p6.qty === 1, `stato ${dueVolte.stato}, colli ${p6.qty}`);

  await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-01-07', item_key: 'MP-5#P7', packs_out: [0.1] });
  const p7 = await leggiRiga('MP-5#P7');
  ok('i decimali dell\'elenco non lasciano code: restano 0,2 e non 0,19999999999999998',
     p7.qty_uom === 0.2 && p7.qty === 2, `${p7.qty} colli · ${p7.qty_uom} UM`);

  const [c1t, c2t] = await Promise.all([
    call('POST', '/api/op/removeItem',
      { location_code: 'DP-E-01-08', item_key: 'MP-5#P8', packs_out: [1000, 1000] }, 'TERMINALE-1'),
    call('POST', '/api/op/removeItem',
      { location_code: 'DP-E-01-08', item_key: 'MP-5#P8', packs_out: [1000, 1000] }, 'TERMINALE-2')
  ]);
  const p8 = (await call('GET', RIGA('MP-5#P8'))).dati;
  ok('contesa sull\'elenco: passa un terminale solo, e la riga sparisce una volta',
     [c1t, c2t].filter(r => r.stato === 200).length === 1 && p8.length === 0,
     `${[c1t, c2t].filter(r => r.stato === 200).length} passati`);

  const svuotata = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-01-09', item_key: 'MP-5#P9', packs_out: [900] });
  ok('l\'ultimo collo che esce porta via la riga',
     svuotata.dati._mode === 'full' && svuotata.dati._qty_uom_after === 0,
     'modo ' + svuotata.dati._mode);

  /* LA PROVA CHE IL BANCO HA PAGATO: «10 kg» non basta a dire da dove escono.
     Se sulla riga c'e' anche un collo da 10 e l'operatore ha aperto quello da
     25, la ricerca per sola quantita' porta via il collo sbagliato — saldo
     giusto, colli sbagliati, e a video una riga che non esiste in corsia. */
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-E-03-01', item_key: 'MP-7#D1', article_code: 'MP-7', lot_code: 'D1',
      qty: 3, qty_uom: 60, packs: [25, 25, 10] },
    { location_code: 'DP-E-03-02', item_key: 'MP-7#D2', article_code: 'MP-7', lot_code: 'D2',
      qty: 2, qty_uom: 35, packs: [25, 10] }
  ]);

  const daQualeCollo = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-03-01', item_key: 'MP-7#D1', packs_out: [{ da: 25, quantita: 10 }] });
  const d1 = await leggiRiga('MP-7#D1');
  ok('«10 da un collo da 25» apre il 25, e NON porta via il collo da 10',
     daQualeCollo.stato === 200 && JSON.stringify(d1.packs) === '[15,25,10]' && d1.qty === 3,
     JSON.stringify(d1.packs));

  const colloSparito = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-03-02', item_key: 'MP-7#D2', packs_out: [{ da: 20, quantita: 5 }] });
  ok('un collo di quella misura che non c\'e\' e\' un 409, non un ripiego',
     colloSparito.stato === 409, colloSparito.dati.error);

  const oltreIlCollo = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-03-02', item_key: 'MP-7#D2', packs_out: [{ da: 10, quantita: 12 }] });
  ok('da un collo non si dichiara di prendere piu\' di quanto ne contiene',
     oltreIlCollo.stato === 400, 'stato ' + oltreIlCollo.stato);

  const interoDichiarato = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-03-02', item_key: 'MP-7#D2', packs_out: [{ da: 10 }] });
  const d2 = await leggiRiga('MP-7#D2');
  ok('senza quantita\' il collo dichiarato esce intero',
     interoDichiarato.stato === 200 && JSON.stringify(d2.packs) === '[25]',
     JSON.stringify(d2.packs));

  /* La 1.7 non cambia di una riga: senza `packs_out` la rotta e' quella di
     prima, ed e' la ragione per cui la 1.8 si installa a interruttore spento. */
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-E-02-01', item_key: 'MP-6#V1', article_code: 'MP-6', lot_code: 'V1', qty: 10, qty_uom: 1000 }
  ]);
  const comePrima = await call('POST', '/api/op/removeItem',
    { location_code: 'DP-E-02-01', item_key: 'MP-6#V1', qty: 2, qty_uom: 200 });
  const v1 = await leggiRiga('MP-6#V1');
  ok('senza elenco il prelievo e\' quello della 1.7, e nessun `packs` compare',
     comePrima.stato === 200 && v1.qty === 8 && v1.qty_uom === 800 && v1.packs === undefined,
     `${v1.qty} colli · ${v1.qty_uom} UM`);

  const tappaColli = await call('POST', '/api/op/commitPickStop', {
    location_code: 'DP-E-01-01', item_key: 'MP-5#P1', packs_out: [1000],
    movement: { type: 'PICK', article_code: 'MP-5', lot_code: 'P1',
                location_code: 'DP-E-01-01', user: 'ANDS', doc_ref: 'ODP-3' },
    session: { session_id: 'S3', status: 'active', created_at: Date.now(), stops: [] }
  });
  const p1bis = await leggiRiga('MP-5#P1');
  const movColli = (await call('GET',
    '/api/c/mov_log/query?criteria=' + encodeURIComponent(
      JSON.stringify({ field: 'lot_code', op: 'equals', value: 'P1' })))).dati[0];
  ok('la tappa di prelievo muove l\'elenco dentro la stessa transazione del registro',
     tappaColli.stato === 200 && JSON.stringify(p1bis.packs) === '[1000]'
       && movColli?.qty_uom_delta === -1000,
     `${JSON.stringify(p1bis?.packs)} · registro ${movColli?.qty_uom_delta}`);

  /* ── 1.4.1 — le attivita' passano dal servizio come tutto il resto ──
     Lo schedulatore non ha rotte sue: e' una collezione a chiave di testo,
     e le due domande che la coda fa davvero — «cosa e' aperto» e «cosa ho
     io» — devono poter girare su un indice e non su una scansione. */
  const compito = {
    task_id: 'TA-1', type: 'TRANSFER', priority: 4, status: 'requested',
    requested_by: 'ANDS', requested_at: Date.now(), assigned_to: null,
    payload: { article_code: 'MP-2', lot_code: 'L3', qty: 12, a: 'DP-A-01-02-T' }
  };
  const tc = await call('POST', '/api/c/tasks', compito);
  ok('un\'attivita\' entra con la sua chiave di testo', tc.stato === 200 && tc.dati.key === 'TA-1',
     'key=' + tc.dati.key);

  const tcLetto = await call('GET', '/api/c/tasks/TA-1');
  ok('il payload dell\'attivita\' rientra intero, senza schema',
     tcLetto.dati?.payload?.qty === 12 && tcLetto.dati.payload.a === 'DP-A-01-02-T');

  await call('POST', '/api/c/tasks', { ...compito, task_id: 'TA-2', priority: 2, status: 'done' });
  const aperte = await call('GET',
    '/api/c/tasks/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'status', op: 'equals', value: 'requested' })));
  ok('la coda si interroga per stato su un indice', aperte.dati.length === 1 && aperte.dati[0].task_id === 'TA-1',
     aperte.dati.length + ' aperte');

  await call('PATCH', '/api/c/tasks/TA-1', { status: 'in_progress', assigned_to: 'ANDS', started_at: Date.now() });
  const mie = await call('GET',
    '/api/c/tasks/query?criteria=' + encodeURIComponent(JSON.stringify({ field: 'assigned_to', op: 'equals', value: 'ANDS' })));
  ok('presa in carico: lo stato cambia e la sigla diventa interrogabile',
     mie.dati.length === 1 && mie.dati[0].status === 'in_progress' && mie.dati[0].payload.qty === 12);

  /* ── 1.4.2.1 — il residuo e i movimenti che l'hanno prodotto ──
     `qty_done` e `mov_ids` non hanno una colonna: vivono nel documento JSON,
     ed e' la ragione per cui un campo nuovo non e' una migrazione. Ma il
     registro delle attivita' li rilegge, quindi devono tornare interi — un
     array di numeri compreso. */
  await call('PATCH', '/api/c/tasks/TA-1', { qty_done: 5, mov_ids: [101, 102] });
  const parziale = await call('GET', '/api/c/tasks/TA-1');
  ok('un parziale resta in corso e porta con se\' il conto',
     parziale.dati?.qty_done === 5 && parziale.dati.status === 'in_progress'
     && parziale.dati.payload.qty === 12,
     'qty_done=' + parziale.dati?.qty_done);
  ok('gli identificativi dei movimenti rientrano come array di numeri',
     Array.isArray(parziale.dati?.mov_ids) && parziale.dati.mov_ids.length === 2
     && parziale.dati.mov_ids[1] === 102);

  await call('PATCH', '/api/c/tasks/TA-1', { qty_done: 12, mov_ids: [101, 102, 103], status: 'done', completed_at: Date.now() });
  const chiuso = await call('GET', '/api/c/tasks/TA-1');
  ok('a residuo zero il compito e\' chiuso, e dice con che cosa',
     chiuso.dati?.status === 'done' && chiuso.dati.qty_done === 12 && chiuso.dati.mov_ids.length === 3);

  /* La richiesta non cambia mai: `payload.qty` e' quello che si e' chiesto,
     ed e' storia. Chi lo riscrivesse ai colli mossi cancellerebbe il perche'
     di ogni parziale mai registrato. */
  ok('il richiesto resta il richiesto anche a compito chiuso',
     chiuso.dati?.payload?.qty === 12 && chiuso.dati.payload.article_code === 'MP-2');

  // ── Notifica ai terminali ─────────────────────────────────────────
  const eventi = [];
  const es = await fetch(BASE + '/api/events?client=TERMINALE-2', { headers: { Accept: 'text/event-stream' } });
  const lettore = es.body.getReader();
  const dec = new TextDecoder();
  (async () => {
    try {
      while (true) {
        const { value, done } = await lettore.read();
        if (done) break;
        const t = dec.decode(value);
        for (const blocco of t.split('\n\n')) {
          const m = blocco.match(/event: (\w+)\ndata: (.+)/);
          if (m) eventi.push({ tipo: m[1], dati: JSON.parse(m[2]) });
        }
      }
    } catch {}
  })();
  await new Promise(r => setTimeout(r, 200));

  await call('POST', '/api/c/articles', { code: 'MP-9', description: 'Fatto dal terminale 1' }, 'TERMINALE-1');
  await new Promise(r => setTimeout(r, 250));
  const cambi = eventi.filter(e => e.tipo === 'change');
  ok('il terminale 2 viene avvisato della scrittura del terminale 1',
     cambi.length === 1 && cambi[0].dati.collections.includes('articles'),
     cambi.length + ' notifiche');

  await call('POST', '/api/c/articles', { code: 'MP-10', description: 'Fatto dal terminale 2' }, 'TERMINALE-2');
  await new Promise(r => setTimeout(r, 250));
  ok('un terminale NON viene avvisato di cio\' che ha fatto lui',
     eventi.filter(e => e.tipo === 'change').length === 1,
     eventi.filter(e => e.tipo === 'change').length + ' notifiche totali');
  try { await lettore.cancel(); } catch {}

  // ── Backup a caldo ────────────────────────────────────────────────
  const dirBackup = path.join(os.tmpdir(), 'pathfinder-backup-' + Date.now());
  const bk = await call('POST', '/api/backup', { dir: dirBackup });
  if (SU_PG) {
    /* IL BACKUP CAMBIA PADRONE, E DALLA 2.6 SA CAMBIARLO.
       Con SQLite e' una copia coerente del file; con PostgreSQL un
       `pg_dump` in formato custom, riletto con `pg_restore --list` prima
       di essere dichiarato buono. La prova non guarda che il file esista
       — un file esiste anche quando dentro non c'e' niente — ma che pesi
       e che si chiami `.dump`, cioe' che sia quel che dice di essere. */
    const f = bk.dati.file || '';
    ok('il backup su PostgreSQL e un pg_dump vero',
       bk.stato === 200 && /\.dump$/.test(f) && fs.existsSync(f) && fs.statSync(f).size > 1024,
       bk.stato === 200 ? `${path.basename(f)} (${bk.dati.bytes} byte)` : bk.dati.error);
  } else {
    ok('backup a caldo del database', bk.stato === 200 && fs.existsSync(bk.dati.file),
       bk.dati.file ? path.basename(bk.dati.file) : bk.dati.error);
  }

  // ── 1.7 · L'applicativo servito da una cartella ───────────────────
  /* `fetch` chiede gzip da solo e lo decomprime senza dirlo: per sapere QUALE
     dei due file ha risposto si guarda il contenuto, non l'intestazione. */
  const chiedi = async (url, intestazioni = {}) => {
    const r = await fetch(BASE + url, { headers: intestazioni });
    return { stato: r.status, cache: r.headers.get('cache-control'), testo: await r.text() };
  };

  const indice = await chiedi('/');
  ok('la radice serve l index.html della cartella',
     indice.stato === 200 && indice.testo.includes('PATHFINDER-COLLAUDO'));
  ok('l indice NON si mette in cache', indice.cache === 'no-cache', indice.cache);

  const inChiaro = await chiedi('/assets/index-AAAA1111.js', { 'accept-encoding': 'identity' });
  ok('un asset di `corrente` viene servito',
     inChiaro.stato === 200 && inChiaro.testo.includes('"corrente"'));
  ok('gli assets si mettono in cache per sempre',
     /immutable/.test(inChiaro.cache || '') && /31536000/.test(inChiaro.cache || ''),
     inChiaro.cache);

  const compresso = await chiedi('/assets/index-AAAA1111.js', { 'accept-encoding': 'gzip' });
  ok('a chi accetta gzip arriva il .gz scritto dalla build',
     compresso.testo.includes('"corrente-compresso"'), compresso.testo.trim());

  const ripiego = await chiedi('/assets/index-BBBB2222.js');
  ok('un asset che `corrente` non ha piu arriva da `precedente`',
     ripiego.stato === 200 && ripiego.testo.includes('"precedente"'),
     'copre chi stava caricando la pagina durante lo scambio');

  const fuori = await chiedi('/assets/..%2Fmanifest.json');
  ok('non si esce dalla cartella assets', fuori.stato === 400, 'stato ' + fuori.stato);

  const mancante = await chiedi('/assets/index-CCCC3333.js');
  ok('un asset inesistente da 404', mancante.stato === 404, 'stato ' + mancante.stato);

  /* ── 1.12 — L'UNITA' DI CARICO SI SPOSTA INTERA ────────────────────
     Un pallet porta con se' quello che ha sopra. Se le righe si
     riscrivessero una per una, un errore a meta' lascerebbe mezza UDC di
     qua e mezza di la' — e nessuno saprebbe quale meta'. */
  await call('POST', '/api/c/udc/bulk', [
    { udc_id: 'UDC-000001', location_code: 'DP-U-01', status: 'open', created_at: Date.now() },
    { udc_id: 'UDC-000002', location_code: 'DP-U-02', status: 'shipped', created_at: Date.now() },
  ]);
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-U-01', item_key: 'MP-9#U1', article_code: 'MP-9', lot_code: 'U1', qty: 4, udc_id: 'UDC-000001' },
    { location_code: 'DP-U-01', item_key: 'MP-9#U2', article_code: 'MP-9', lot_code: 'U2', qty: 2, qty_uom: 50, packs: [25, 25], udc_id: 'UDC-000001' },
    { location_code: 'DP-U-01', item_key: 'MP-9#U3', article_code: 'MP-9', lot_code: 'U3', qty: 7 },
  ]);

  const spost = await call('POST', '/api/op/moveUdc', { udc_id: 'UDC-000001', to: 'DP-U-09' });
  const riga1 = await leggiRiga('MP-9#U1');
  const riga2 = await leggiRiga('MP-9#U2');
  const riga3 = await leggiRiga('MP-9#U3');
  ok('l\'UDC porta con se\' tutte le sue righe, e solo le sue',
     spost.stato === 200 && spost.dati.righe === 2
       && riga1.location_code === 'DP-U-09' && riga2.location_code === 'DP-U-09'
       && riga3.location_code === 'DP-U-01',
     `${spost.dati.righe} righe · la riga senza UDC e' rimasta in ${riga3.location_code}`);

  ok('IL CONTENUTO NON SI TOCCA: uno spostamento non e\' un prelievo',
     riga2.qty === 2 && riga2.qty_uom === 50 && JSON.stringify(riga2.packs) === JSON.stringify([25, 25]),
     `${riga2.qty} colli · ${JSON.stringify(riga2.packs)} · ${riga2.qty_uom} UM`);

  const udcDopo = (await call('GET', '/api/c/udc/UDC-000001')).dati;
  ok('anche la riga dell\'UDC si sposta, nella stessa transazione',
     udcDopo.location_code === 'DP-U-09', udcDopo.location_code);

  ok('la rotta dice da dove a dove, per il registro',
     spost.dati.from === 'DP-U-01' && spost.dati.to === 'DP-U-09',
     `${spost.dati.from} -> ${spost.dati.to}`);

  const fermo = await call('POST', '/api/op/moveUdc', { udc_id: 'UDC-000001', to: 'DP-U-09' });
  ok('spostarla dove gia\' sta non e\' uno spostamento', fermo.stato === 409, fermo.dati.error);

  const spedita = await call('POST', '/api/op/moveUdc', { udc_id: 'UDC-000002', to: 'DP-U-09' });
  ok('un\'UDC gia\' spedita non si sposta piu\'', spedita.stato === 409, spedita.dati.error);

  const inesistente = await call('POST', '/api/op/moveUdc', { udc_id: 'UDC-999999', to: 'DP-U-09' });
  ok('un\'UDC che non esiste da 404, non un movimento a vuoto',
     inesistente.stato === 404, 'stato ' + inesistente.stato);

  const senzaDove = await call('POST', '/api/op/moveUdc', { udc_id: 'UDC-000001' });
  ok('senza destinazione non si sposta niente', senzaDove.stato === 400, 'stato ' + senzaDove.stato);

  /* IL DOPPIONE DI CHIAVE. L'indice [location_code+item_key] e' di ricerca,
     non unico: senza questa guardia il database accetterebbe due righe
     uguali nello stesso vano, e il client ne leggerebbe una a caso.
     Trovato al banco il 19/08, alla prima prova dello spostamento. */
  await call('POST', '/api/c/inventory/bulk', [
    { location_code: 'DP-U-20', item_key: 'MP-9#U1', article_code: 'MP-9', lot_code: 'U1', qty: 3 }
  ]);
  const scontro = await call('POST', '/api/op/moveUdc', { udc_id: 'UDC-000001', to: 'DP-U-20' });
  const restata = await leggiRiga('MP-9#U1');
  ok("non si sposta dove la stessa chiave sta gia fuori dall unita",
     scontro.stato === 409 && restata.location_code === 'DP-U-09',
     scontro.dati.error);

  ok("e il rifiuto dice QUALE lotto e di mezzo",
     String(scontro.dati.error || '').includes('MP-9#U1'), scontro.dati.error);

  const conMov = await call('POST', '/api/op/moveUdc',
    { udc_id: 'UDC-000001', to: 'DP-U-10',
      movement: { type: 'MOVE', article_code: 'MP-9', location_code: 'DP-U-09', dest_location: 'DP-U-10', user: 'ANDS' } });
  const registro = (await call('GET', '/api/c/mov_log')).dati.filter(m => m.dest_location === 'DP-U-10');
  ok('il movimento entra a registro dentro la stessa transazione',
     conMov.stato === 200 && registro.length === 1, `${registro.length} righe a registro`);

  const info = await call('GET', '/api/app-info');
  ok('app-info dice modo, versione e impronta del manifesto',
     info.dati.modo === 'cartella'
       && info.dati.versione === '1.7-collaudo'
       && info.dati.impronta === 'impronta-di-prova',
     `${info.dati.versione} · ${info.dati.impronta}`);
  ok('app-info dice quale cartella sta servendo',
     typeof info.dati.punta_a === 'string' && info.dati.punta_a.length > 0,
     info.dati.punta_a ? path.basename(info.dati.punta_a) : '(nessuna)');


  // ── 2.10 · Sicurezza ──────────────────────────────────────────────
  /* Le quattro correzioni di sicurezza della 2.10, provate dall'esterno —
     cioe' da dove arriverebbe chi le aggira: una richiesta HTTP. */

  // 1 · L'impronta del PIN non esce
  const nuovoPin = await call('POST', '/api/op/hashPin', { pin: '482913' });
  ok('hashPin risponde con scrypt, non piu\' con SHA-256',
     nuovoPin.dati.pin_algo === 'scrypt' && typeof nuovoPin.dati.pin_hash === 'string',
     nuovoPin.dati.pin_algo || '(nessun algoritmo dichiarato)');

  await call('POST', '/api/c/operators', {
    op_id: 'OP-SIC-1', initials: 'SIC1', first_name: 'Prova', last_name: 'Sicurezza',
    role: 'operator', active: true, ...nuovoPin.dati,
  });

  const elenco = await call('GET', '/api/c/operators');
  const sic = (elenco.dati || []).find(o => o.op_id === 'OP-SIC-1');
  ok('l\'elenco degli operatori non porta fuori l\'impronta del PIN',
     !!sic && sic.pin_hash === undefined && sic.pin_salt === undefined,
     sic ? `pin_hash ${sic.pin_hash === undefined ? 'assente' : 'PRESENTE'} · pin_salt ${sic.pin_salt === undefined ? 'assente' : 'PRESENTE'}` : '(operatore non trovato)');
  ok('e al suo posto dice soltanto se un PIN c\'e\'', sic?.pin_set === true,
     'pin_set = ' + String(sic?.pin_set));

  const singolo = await call('GET', '/api/c/operators/OP-SIC-1');
  ok('nemmeno leggendo il singolo operatore', singolo.dati.pin_hash === undefined,
     singolo.dati.pin_hash === undefined ? 'assente' : 'PRESENTE');

  const tutto = await call('GET', '/api/load');
  const daLoad = (tutto.dati.operators || []).find(o => o.op_id === 'OP-SIC-1');
  ok('ne\' dal carico iniziale, che e\' la strada che usa il client',
     !!daLoad && daLoad.pin_hash === undefined && daLoad.pin_set === true,
     daLoad ? (daLoad.pin_hash === undefined ? 'assente' : 'PRESENTE') : '(non trovato)');

  // 2 · Il PIN si verifica lo stesso, ed e' il punto
  const buono = await call('POST', '/api/op/verifyPin', { op_id: 'OP-SIC-1', pin: '482913' });
  ok('il PIN giusto entra, con l\'impronta scrypt', buono.dati.ok === true);
  const storto = await call('POST', '/api/op/verifyPin', { op_id: 'OP-SIC-1', pin: '000000' });
  ok('e quello sbagliato no', storto.dati.ok === false);

  // 3 · L'impronta vecchia si rifa' da sola al primo accesso riuscito
  const saleVecchio = crypto.randomBytes(16).toString('hex');
  await call('POST', '/api/c/operators', {
    op_id: 'OP-SIC-2', initials: 'SIC2', first_name: 'Impronta', last_name: 'Vecchia',
    role: 'operator', active: true, pin_salt: saleVecchio,
    pin_hash: crypto.createHash('sha256').update(`${saleVecchio}:271828`).digest('hex'),
  });
  const vecchioOk = await call('POST', '/api/op/verifyPin', { op_id: 'OP-SIC-2', pin: '271828' });
  ok('un PIN scritto prima della 2.10 entra ancora', vecchioOk.dati.ok === true);
  const rifatto = await servizio.db.get('operators', 'OP-SIC-2');
  ok('e la sua impronta viene rifatta in scrypt, senza che nessuno lo chieda',
     rifatto.pin_algo === 'scrypt' && rifatto.pin_salt !== saleVecchio,
     rifatto.pin_algo || '(rimasta com\'era)');
  const ancora = await call('POST', '/api/op/verifyPin', { op_id: 'OP-SIC-2', pin: '271828' });
  ok('e lo stesso PIN entra anche dopo che l\'impronta e\' cambiata', ancora.dati.ok === true);

  // 4 · Il backup non esce dalla macchina
  const rete = await call('POST', '/api/backup', { dir: '\\\\\\\\altra-macchina\\\\condivisione' });
  ok('un backup verso un percorso di rete viene rifiutato', rete.stato === 400,
     `stato ${rete.stato}`);
  const relativo = await call('POST', '/api/backup', { dir: 'backup' });
  ok('e uno verso un percorso relativo pure', relativo.stato === 400,
     `stato ${relativo.stato}`);
  const sistema = await call('POST', '/api/backup', { dir: path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp', 'pf') });
  ok('e uno dentro le cartelle di Windows, dove il servizio scrive come SYSTEM',
     sistema.stato === 400, `stato ${sistema.stato}`);

  /* TROVATA VERIFICANDO LA CONSEGNA DELLA 2.10, e trovata per sbaglio: una
     prova scritta male ha inviato questa forma al posto del percorso di rete
     che voleva provare, il controllo dell'UNC non e' scattato — giustamente,
     quello non e' UNC — e il servizio ha scritto 393 kB di database nella
     RADICE DI `C:`. `\qualcosa` passa `path.isAbsolute`: e' assoluto rispetto
     al disco della cartella di lavoro, che nessuno sa quale sia. */
  const senzaDisco = await call('POST', '/api/backup', { dir: '\\radice-a-caso' });
  ok('e uno che non dice su quale disco sta', senzaDisco.stato === 400,
     `stato ${senzaDisco.stato}`);

  // 5 · Le intestazioni
  const teste = await fetch(BASE + '/api/health');
  ok('ogni risposta porta le tre intestazioni di sicurezza',
     teste.headers.get('x-content-type-options') === 'nosniff'
       && teste.headers.get('x-frame-options') === 'DENY'
       && teste.headers.get('referrer-policy') === 'same-origin',
     `${teste.headers.get('x-content-type-options')} · ${teste.headers.get('x-frame-options')} · ${teste.headers.get('referrer-policy')}`);

  // 6 · Un codice non spezza un gestore dell'interfaccia
  const codiceOstile = await call('POST', '/api/c/articles', {
    code: "MP-9'); alert(1); //", description: 'articolo con un apice nel codice',
  });
  ok('un codice con dentro un apice viene rifiutato, non maiuscolato',
     codiceOstile.stato === 400, `stato ${codiceOstile.stato}`);


  // ── 2.11 · La porta ───────────────────────────────────────────────
  /* A questo punto del collaudo un operatore con PIN esiste gia' — la
     finestra di primo avvio si e' chiusa da sola quando e' stato scritto.
     Da qui in poi si prova quel che vede chi arriva senza chiave. */

  const statoPorta = await call('GET', '/api/auth/stato', undefined, 'T1', { senzaChiave: true });
  ok('la finestra di primo avvio si e chiusa da sola col primo PIN',
     statoPorta.dati.primoAvvio === false, 'primoAvvio=' + statoPorta.dati.primoAvvio);

  const chiuse = [
    ['GET', '/api/load'], ['GET', '/api/c/inventory'], ['GET', '/api/c/operators'],
    ['POST', '/api/c/articles'], ['DELETE', '/api/c/inventory'], ['POST', '/api/clear'],
    ['POST', '/api/tx'], ['POST', '/api/backup'], ['POST', '/api/op/removeItem'],
  ];
  let apertaRimasta = '';
  for (const [m, u] of chiuse) {
    const r = await call(m, u, m === 'GET' ? undefined : {}, 'T1', { senzaChiave: true });
    if (r.stato !== 401) apertaRimasta += ` ${m} ${u}=${r.stato}`;
  }
  ok('le nove rotte che contano rispondono 401 senza sessione',
     apertaRimasta === '', apertaRimasta || 'tutte 401');

  const salutePubblica = await call('GET', '/api/health', undefined, 'T1', { senzaChiave: true });
  ok('health resta aperta: la interroga l installer prima che esista un PIN',
     salutePubblica.stato === 200);
  const infoPubblica = await call('GET', '/api/app-info', undefined, 'T1', { senzaChiave: true });
  ok('e app-info pure, che e la prima diagnosi di ogni guaio', infoPubblica.stato === 200);

  /* L'ELENCO PER IDENTIFICARSI risponde senza chiave — deve, o nessuno
     potrebbe disegnare la maschera — e allora dice il minimo. */
  const perAccesso = await call('GET', '/api/auth/operatori', undefined, 'T1', { senzaChiave: true });
  const sicuro = (perAccesso.dati || []).find((o) => o.op_id === 'OP-SIC-1');
  ok('l elenco per identificarsi risponde senza sessione',
     perAccesso.stato === 200 && !!sicuro);
  ok('e non porta l impronta, ne i campi che a quella maschera non servono',
     sicuro && sicuro.pin_set === true && sicuro.pin_hash === undefined
       && sicuro.pin_salt === undefined && sicuro.created_at === undefined,
     sicuro ? Object.keys(sicuro).join(',') : '(non trovato)');

  /* IL PIN EMETTE LA SESSIONE. Il cookie si legge dalla risposta e si
     rimanda a mano: qui non c'e' un browser che lo faccia da solo. */
  const rifiutato = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initials: 'SIC1', pin: '000000' }),
  });
  ok('il PIN sbagliato non apre e non posa cookie',
     rifiutato.status === 401 && !rifiutato.headers.get('set-cookie'),
     'stato ' + rifiutato.status);

  const entrata = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initials: 'SIC1', pin: '482913' }),
  });
  const cookieSessione = (entrata.headers.get('set-cookie') || '').split(';')[0];
  ok('il PIN giusto apre', entrata.status === 200);
  ok('e il cookie e HttpOnly e SameSite=Strict',
     /HttpOnly/i.test(entrata.headers.get('set-cookie') || '')
       && /SameSite=Strict/i.test(entrata.headers.get('set-cookie') || ''));

  const conCookie = await fetch(BASE + '/api/load', { headers: { Cookie: cookieSessione } });
  ok('col cookie si carica', conCookie.status === 200, 'stato ' + conCookie.status);

  const uscita = await fetch(BASE + '/api/auth/logout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieSessione },
  });
  ok('il logout risponde ok', uscita.status === 200);
  const dopoUscita = await fetch(BASE + '/api/load', { headers: { Cookie: cookieSessione } });
  ok('e il cookie di prima non vale piu', dopoUscita.status === 401, 'stato ' + dopoUscita.status);

  /* IL TOKEN DI MACCHINA e' l'altra chiave, quella di chi non ha un browser:
     il backup serale, l'installer che verifica, la migrazione. */
  const tokenStorto = await fetch(BASE + '/api/load', {
    headers: { 'X-Pathfinder-Token': 'x'.repeat(TOKEN.length) },
  });
  ok('un token di macchina sbagliato non apre', tokenStorto.status === 401,
     'stato ' + tokenStorto.status);

  // ── Chiusura ──────────────────────────────────────────────────────
  console.log(`\n  ${passate} passate, ${fallite} fallite\n`);
  server.close();
  await servizio.db.close();
  try {
    fs.unlinkSync(TMP);
    fs.rmSync(dirBackup, { recursive: true, force: true });
    fs.rmSync(APP, { recursive: true, force: true });
  } catch {}
  process.exit(fallite ? 1 : 0);
})().catch(err => {
  console.error('\n  COLLAUDO INTERROTTO:', err);
  process.exit(1);
});
