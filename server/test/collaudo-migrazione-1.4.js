'use strict';

/* PROVA PREPARATORIA — la migrazione della 1.4.0 non e' ancora nel prodotto.
   Qui dentro c'e' il prototipo di `migra()` piu' il collaudo che dovra'
   superare. Quando la migrazione entrera' in `PathfinderDB`, `migra()` si
   toglie da qui e questo file resta come collaudo.

   Non fa parte di `node test/collaudo.js`: si lancia da solo.
     node test/collaudo-migrazione-1.4.js

   Risponde a una domanda sola: dopo la modifica di schema della 1.4, i dati
   di oggi ci sono ancora? Interessano ubicazione, articolo, lotto e colli. */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const SRV = path.join(__dirname, '..');
const file = path.join(require('os').tmpdir(), `pathfinder-migrazione-${process.pid}.db`);
const pulisci = () => { for (const f of [file, file + '-wal', file + '-shm']) { try { fs.unlinkSync(f); } catch {} } };
pulisci();

const schema = require(path.join(SRV, 'lib/schema.js'));
const dbmod = path.join(SRV, 'lib/db.js');
const fresh = () => { delete require.cache[require.resolve(dbmod)]; return require(dbmod).PathfinderDB; };

let falliti = 0;
function verifica(esito, testo) {
  console.log(`  ${esito ? 'PASSA ' : 'FALLA '}  ${testo}`);
  if (!esito) falliti++;
}

/* ── La migrazione ────────────────────────────────────────────────────────
   Va dentro `PathfinderDB`, fra `createSQL` e la creazione degli indici.
   Senza, `CREATE TABLE IF NOT EXISTS` non aggiunge la colonna nuova e il
   `CREATE INDEX` che segue muore: il servizio non parte affatto. */
function migra(fileDb, COLLECTIONS) {
  const raw = new Database(fileDb);
  const fatte = [];
  for (const [nome, col] of Object.entries(COLLECTIONS)) {
    const esiste = raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nome);
    if (!esiste) continue;                       // ci pensa CREATE TABLE IF NOT EXISTS
    const presenti = new Set(raw.prepare(`PRAGMA table_info(${nome})`).all().map(c => c.name));
    for (const campo of col.indexed) {
      if (campo === col.pk || presenti.has(campo)) continue;
      const tipo = (col.numeric || []).includes(campo) ? 'INTEGER' : 'TEXT';
      raw.exec(`ALTER TABLE ${nome} ADD COLUMN ${campo} ${tipo}`);
      /* Il valore, se esiste, e' gia' nel documento: la colonna indicizzata
         e' una copia materializzata, non la sorgente. */
      const info = raw.prepare(`UPDATE ${nome} SET ${campo} = json_extract(data, '$.${campo}')`).run();
      fatte.push(`${nome}.${campo} (${info.changes} righe)`);
    }
  }
  raw.close();
  return fatte;
}

/* Cio' che va salvato a tutti i costi: ubicazione, articolo, lotto, colli. */
function impronta(db) {
  const inv = db.all('inventory');
  const v = inv.map(r => `${r.location_code}|${r.article_code}|${r.lot_code}|${r.qty}`).sort();
  return {
    righe: v.length,
    colli: inv.reduce((s, r) => s + (r.qty || 0), 0),
    sha: crypto.createHash('sha256').update(v.join('\n')).digest('hex').slice(0, 16),
  };
}

console.log('\n  Migrazione 1.4 — i dati di oggi sopravvivono?\n');

/* ── 1. Un magazzino con lo schema di oggi ──────────────────────────────── */
let DB = fresh();
let db = new DB(file);
let n = 0;
for (const z of ['A', 'B', 'C']) for (let corsia = 1; corsia <= 6; corsia++) for (let posto = 1; posto <= 8; posto++) {
  for (const liv of ['T', '1']) {
    if (++n % 3 === 0) continue;
    const art = `70${n % 9}${String(n % 40).padStart(3, '0')}`;
    const lot = `L2026${String(n % 90 + 1).padStart(3, '0')}`;
    db.add('inventory', {
      location_code: `DP-${z}-${String(corsia).padStart(2, '0')}-${String(posto).padStart(2, '0')}-${liv}`,
      item_key: `${art}|${lot}`, article_code: art, article_description: `Articolo ${art}`,
      lot_code: lot, expiry_date: '2027-03-31', qty: (n % 24) + 1,
      placed_at: Date.now(), placed_by: 'AS',
    });
  }
}
db.add('sites', { id: 'DP', name: 'Deposito' });
db.add('articles', { code: '700001', description: 'Prova', unit: 'PZ' });
const prima = impronta(db);
console.log(`  base di partenza: ${prima.righe} righe, ${prima.colli} colli, impronta ${prima.sha}`);
db.close();

/* ── 2. Lo schema della 1.4 ─────────────────────────────────────────────── */
schema.COLLECTIONS.inventory.indexed.push('udc_id');
schema.COLLECTIONS.lots  = { pk: '_id', pkType: 'auto', indexed: ['article_code', 'lot_code'], composite: [['article_code', 'lot_code']] };
schema.COLLECTIONS.udc   = { pk: 'udc_id', pkType: 'text', indexed: ['location_code', 'status', 'site_id'] };
schema.COLLECTIONS.tasks = { pk: 'task_id', pkType: 'text', indexed: ['type', 'status', 'priority', 'requested_at'], numeric: ['requested_at'] };
schema.COLLECTIONS.wip   = { pk: 'wip_id', pkType: 'text', indexed: ['odp_num', 'item_key', 'status'] };
schema.NAMES.length = 0;
schema.NAMES.push(...Object.keys(schema.COLLECTIONS));

const fatte = migra(file, schema.COLLECTIONS);
console.log(`  migrazione: ${fatte.join(' · ') || '(niente da fare)'}\n`);

DB = fresh();
db = new DB(file);
const dopo = impronta(db);

verifica(dopo.sha === prima.sha, `ubicazione, articolo, lotto e colli identici — impronta ${dopo.sha}`);
verifica(dopo.righe === prima.righe, `nessuna riga persa — ${dopo.righe}`);
verifica(dopo.colli === prima.colli, `nessun collo perso — ${dopo.colli}`);
verifica(db.db.prepare('PRAGMA table_info(inventory)').all().some(c => c.name === 'udc_id'),
  'inventory ha la colonna udc_id');
verifica(['lots', 'udc', 'tasks', 'wip'].every(c => db.count(c) === 0),
  'le quattro collezioni nuove esistono e sono vuote');

const una = db.all('inventory')[0];
db.put('inventory', { ...una, udc_id: 'UDC-000001' });
db.add('udc', { udc_id: 'UDC-000001', location_code: una.location_code, status: 'open', site_id: 'DP' });
verifica(db.query('inventory', { criteria: { field: 'udc_id', op: 'equals', value: 'UDC-000001' } }).length === 1,
  'la 1.4 scrive e interroga udc_id sulle righe di ieri');
db.close();

/* ── 3. Il ritorno indietro ─────────────────────────────────────────────── */
for (const c of ['lots', 'udc', 'tasks', 'wip']) delete schema.COLLECTIONS[c];
schema.COLLECTIONS.inventory.indexed = schema.COLLECTIONS.inventory.indexed.filter(f => f !== 'udc_id');
schema.NAMES.length = 0;
schema.NAMES.push(...Object.keys(schema.COLLECTIONS));

DB = fresh();
db = new DB(file);
const indietro = impronta(db);
verifica(indietro.sha === prima.sha, 'la 1.2 rilegge lo stesso magazzino dal database della 1.4');
const caricato = db.loadAll();
verifica(caricato.inventory.length === prima.righe && caricato.sites.length === 1,
  `loadAll della 1.2 non inciampa su colonne e tabelle che non conosce — ${caricato.inventory.length} righe`);
db.close();
pulisci();

console.log(`\n  ${6 + 2 - falliti} passate, ${falliti} fallite\n`);
process.exit(falliti ? 1 : 0);
