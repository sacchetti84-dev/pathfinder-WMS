'use strict';

/* La migrazione e' nel prodotto — `PathfinderDB._migra`, in `lib/db.js`.
   Il prototipo che stava qui e' stato tolto: adesso questo file collauda il
   codice vero, cioe' apre un database con lo schema di ieri usando il
   costruttore di oggi e guarda cosa resta.

   Non fa parte di `node test/collaudo.js`: si lancia da solo.
     node test/collaudo-migrazione-1.4.js

   Risponde a una domanda sola: dopo la modifica di schema della 1.4, i dati
   di oggi ci sono ancora? Interessano ubicazione, articolo, lotto e colli. */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

/* ── I due schemi ─────────────────────────────────────────────────────────
   `lib/schema.js` oggi E' quello della 1.4. Per costruire un magazzino con
   lo schema di ieri si tolgono le aggiunte, si scrive, e si rimettono: la
   prova sta nel riaprire quel database con il costruttore di oggi. */
const NUOVE = ['lots', 'udc', 'tasks', 'wip', 'storage_rules'];
const messeDaParte = Object.fromEntries(NUOVE.map(c => [c, schema.COLLECTIONS[c]]));

function rinomina() {
  schema.NAMES.length = 0;
  schema.NAMES.push(...Object.keys(schema.COLLECTIONS));
}

function schema12() {
  for (const c of NUOVE) delete schema.COLLECTIONS[c];
  schema.COLLECTIONS.inventory.indexed =
    schema.COLLECTIONS.inventory.indexed.filter(f => f !== 'udc_id');
  rinomina();
}

function schema14() {
  for (const c of NUOVE) schema.COLLECTIONS[c] = messeDaParte[c];
  if (!schema.COLLECTIONS.inventory.indexed.includes('udc_id')) {
    schema.COLLECTIONS.inventory.indexed.push('udc_id');
  }
  rinomina();
}

/* 2.2 — QUESTO COLLAUDO E' ASINCRONO PERCHE' LO E' DIVENTATO IL SERVIZIO
   DATI. Non cambia cosa prova: che il magazzino di ieri sopravviva a un
   cambio di schema, e che la versione di prima lo rilegga. Cambia che ogni
   lettura si attende, e che `migrazioni` si guarda dopo `pronto()` - prima
   l'apertura non e' finita, e la lista sarebbe vuota per un motivo che non
   c'entra niente con la migrazione. */

/* Cio' che va salvato a tutti i costi: ubicazione, articolo, lotto, colli. */
async function impronta(db) {
  const inv = await db.all('inventory');
  const v = inv.map(r => `${r.location_code}|${r.article_code}|${r.lot_code}|${r.qty}`).sort();
  return {
    righe: v.length,
    colli: inv.reduce((s, r) => s + (r.qty || 0), 0),
    sha: crypto.createHash('sha256').update(v.join('\n')).digest('hex').slice(0, 16),
  };
}

console.log('\n  Migrazione 1.4 — i dati di oggi sopravvivono?\n');

(async () => {

/* ── 1. Un magazzino con lo schema della 1.2 ────────────────────────────── */
schema12();
let DB = fresh();
let db = new DB(file);
await db.pronto();
let n = 0;
for (const z of ['A', 'B', 'C']) for (let corsia = 1; corsia <= 6; corsia++) for (let posto = 1; posto <= 8; posto++) {
  for (const liv of ['T', '1']) {
    if (++n % 3 === 0) continue;
    const art = `70${n % 9}${String(n % 40).padStart(3, '0')}`;
    const lot = `L2026${String(n % 90 + 1).padStart(3, '0')}`;
    await db.add('inventory', {
      location_code: `DP-${z}-${String(corsia).padStart(2, '0')}-${String(posto).padStart(2, '0')}-${liv}`,
      item_key: `${art}|${lot}`, article_code: art, article_description: `Articolo ${art}`,
      lot_code: lot, expiry_date: '2027-03-31', qty: (n % 24) + 1,
      placed_at: Date.now(), placed_by: 'AS',
    });
  }
}
await db.add('sites', { id: 'DP', name: 'Deposito' });
await db.add('articles', { code: '700001', description: 'Prova', unit: 'PZ' });
const prima = await impronta(db);
console.log(`  base di partenza: ${prima.righe} righe, ${prima.colli} colli, impronta ${prima.sha}`);
await db.close();

/* ── 2. Lo stesso file, riaperto con lo schema della 1.4 ────────────────── */
schema14();
DB = fresh();
db = new DB(file);
await db.pronto();
console.log(`  migrazione: ${db.migrazioni.map(m => `${m.collezione}.${m.campo} (${m.righe} righe)`).join(' · ') || '(niente da fare)'}\n`);
const dopo = await impronta(db);

verifica(dopo.sha === prima.sha, `ubicazione, articolo, lotto e colli identici — impronta ${dopo.sha}`);
verifica(dopo.righe === prima.righe, `nessuna riga persa — ${dopo.righe}`);
verifica(dopo.colli === prima.colli, `nessun collo perso — ${dopo.colli}`);
verifica(db.db.prepare('PRAGMA table_info(inventory)').all().some(c => c.name === 'udc_id'),
  'inventory ha la colonna udc_id');
const vuote = [];
for (const c of NUOVE) vuote.push(await db.count(c));
verifica(vuote.every(v => v === 0),
  `le ${NUOVE.length} collezioni nuove esistono e sono vuote`);

const una = (await db.all('inventory'))[0];
await db.put('inventory', { ...una, udc_id: 'UDC-000001' });
await db.add('udc', { udc_id: 'UDC-000001', location_code: una.location_code, status: 'open', site_id: 'DP' });
verifica((await db.query('inventory', { criteria: { field: 'udc_id', op: 'equals', value: 'UDC-000001' } })).length === 1,
  'la 1.4 scrive e interroga udc_id sulle righe di ieri');
await db.close();

/* ── 3. Il ritorno indietro ─────────────────────────────────────────────── */
schema12();
DB = fresh();
db = new DB(file);
await db.pronto();
const indietro = await impronta(db);
verifica(indietro.sha === prima.sha, 'la 1.2 rilegge lo stesso magazzino dal database della 1.4');
const caricato = await db.loadAll();
verifica(caricato.inventory.length === prima.righe && caricato.sites.length === 1,
  `loadAll della 1.2 non inciampa su colonne e tabelle che non conosce — ${caricato.inventory.length} righe`);
await db.close();
pulisci();

console.log(`\n  ${6 + 2 - falliti} passate, ${falliti} fallite\n`);
process.exit(falliti ? 1 : 0);

})().catch(err => { console.error('\n  COLLAUDO INTERROTTO:', err); process.exit(1); });
