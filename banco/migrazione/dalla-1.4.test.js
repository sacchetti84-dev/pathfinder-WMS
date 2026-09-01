/* «NON SI PERDE NIENTE» SMETTE DI ESSERE UNA PROMESSA — voce 79.

   Si parte da un database vuoto e si importa un export vero dell'epoca della
   1.4: `14082026_warehouse-mapper-2026-08-14.json`, `_appVersion 1.6`, 11.181
   articoli, 190 giacenze, 104 movimenti, 32 compiti, 13 lotti, 5 quarantene,
   11 documenti pendenti, 19 zone su 5 siti.

   È il file più ricco che l'archivio conservi di quel mondo, ed è quel che il
   magazzino vero produrrebbe premendo «Esporta» sulla sua 1.4. */
import { test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { banco } from '../ciclo/banco.js';

const FILE = path.resolve('ARCHIVIO/BACKUP E FILE DI TEST/14082026_warehouse-mapper-2026-08-14.json');
const pacchetto = JSON.parse(fs.readFileSync(FILE, 'utf8'));

/* Le collezioni che il file porta davvero, con quante righe. */
const ATTESI = Object.fromEntries(
  Object.entries(pacchetto).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));

const API = process.env.BANCO_API;
const chiave = () => ({ 'X-Pathfinder-Token': process.env.BANCO_TOKEN });
const conta = async (col) =>
  (await fetch(`${API}/api/c/${col}/count`, { headers: chiave() }).then((r) => r.json())).count;

let Store;

beforeAll(async () => {
  ({ Store } = await banco());
  await Store.importAll(pacchetto, 'overwrite');
  await Store.init();          // si rilegge da database, come farebbe un terminale
}, 120000);

test('il formato della 1.4 è quello che la beta dichiara di leggere', () => {
  expect(pacchetto._format).toBe('warehouse-mapper-v1.5');
  expect(String(pacchetto._appVersion)).toMatch(/^1\./);
});

test('ogni collezione arriva col numero di righe che aveva', async () => {
  const mancanti = [];
  for (const [col, quante] of Object.entries(ATTESI)) {
    if (!quante) continue;
    const letto = await conta(col);
    if (letto !== quante) mancanti.push(`${col}: ${letto} su ${quante}`);
  }
  expect(mancanti, mancanti.join(' · ')).toEqual([]);
});

test('il registro dei movimenti arriva intero — è la firma GMP, e si tiene sei anni', () => {
  expect(Store.getMovLogTotal()).toBe(ATTESI.mov_log);
});

test('la merce si ritrova per ubicazione, non solo a conteggio', () => {
  const righe = pacchetto.inventory;
  const vani = [...new Set(righe.map((r) => r.location_code))];
  const persi = [];
  for (const vano of vani) {
    const attese = righe.filter((r) => r.location_code === vano).length;
    const lette = Store.getItemsAtLocation(String(vano).toUpperCase()).length;
    if (lette !== attese) persi.push(`${vano}: ${lette} su ${attese}`);
  }
  expect(persi, persi.join(' · ')).toEqual([]);
});

/* §8 · 2.6 — I CODICI SI SCRIVONO IN MAIUSCOLO, E LO FA IL SERVIZIO.
   Un export della 1.4 porta le chiavi come le aveva digitate chi lavorava: in
   questo file quattro righe hanno il lotto in minuscolo — `qwert`, `cl260279`,
   `ag`, `Qwert`. Arrivando, il servizio le maiuscola. Non è una perdita, è una
   rinomina, ed è la stessa che la voce 54 ha già fatto una volta sul magazzino
   vero. Ma va SAPUTA: un'etichetta stampata prima porta la grafia di prima. */
const CHIAVE = (v) => String(v ?? '').toUpperCase();

test('articolo, lotto e colli di ogni riga arrivano come stavano', () => {
  const storte = [];
  for (const r of pacchetto.inventory) {
    const qui = Store.getItemsAtLocation(CHIAVE(r.location_code))
      .find((x) => CHIAVE(x.item_key) === CHIAVE(r.item_key));
    if (!qui) { storte.push(`${r.item_key} sparita da ${r.location_code}`); continue; }
    /* A meno del maiuscolo: la grafia la decide il servizio, il contenuto no. */
    if (CHIAVE(qui.article_code) !== CHIAVE(r.article_code)) storte.push(`${r.item_key}: articolo ${qui.article_code} invece di ${r.article_code}`);
    if (CHIAVE(qui.lot_code) !== CHIAVE(r.lot_code)) storte.push(`${r.item_key}: lotto ${qui.lot_code} invece di ${r.lot_code}`);
    if ((qui.qty ?? null) !== (r.qty ?? null)) storte.push(`${r.item_key}: ${qui.qty} colli invece di ${r.qty}`);
  }
  expect(storte.slice(0, 8), storte.slice(0, 8).join(' · ')).toEqual([]);
});

test('le sole righe che cambiano nome sono quelle scritte in minuscolo', () => {
  /* Il conto va tenuto: sono le righe la cui etichetta stampata prima della
     migrazione non corrisponde più alla chiave a database. Su questo file
     sono quattro; sull'export vero del magazzino potrebbero essere molte, e
     allora la ristampa delle etichette è un passo della migrazione. */
  const rinominate = pacchetto.inventory.filter((r) => CHIAVE(r.item_key) !== r.item_key);
  for (const r of rinominate) {
    const qui = Store.getItemsAtLocation(CHIAVE(r.location_code))
      .find((x) => x.item_key === CHIAVE(r.item_key));
    expect(qui, `${r.item_key} non si ritrova nemmeno maiuscolata`).toBeTruthy();
    expect(qui.qty, `${r.item_key}: colli cambiati nella rinomina`).toBe(r.qty);
  }
  console.log(`  · ${rinominate.length} righe su ${pacchetto.inventory.length} rinominate dal maiuscolo` +
              (rinominate.length ? ': ' + rinominate.map((r) => r.item_key).join(', ') : ''));
});

/* ── I CAMPI CHE AD AGOSTO NON ESISTEVANO ───────────────────────────────
   §8: «ogni campo nuovo è facoltativo, e assente significa come nella 1.2».
   Qui si guarda che l'applicativo REGGA la loro assenza, invece di
   inventarsi un numero o di lanciare. */

test('le righe senza unità di misura non ne guadagnano una dal nulla', () => {
  const senzaUom = pacchetto.inventory.filter((r) => r.qty_uom == null);
  const inventate = [];
  for (const r of senzaUom) {
    const qui = Store.getItemsAtLocation(r.location_code).find((x) => x.item_key === r.item_key);
    if (qui && qui.qty_uom != null) inventate.push(`${r.item_key}: qty_uom ${qui.qty_uom} dal nulla`);
  }
  expect(inventate.slice(0, 5),
    `${senzaUom.length} righe senza UM · ` + inventate.slice(0, 5).join(' · ')).toEqual([]);
});

test('la giacenza si legge anche senza colli e senza UM dichiarati', () => {
  /* `righeLette` è il punto in cui le UM si risolvono: è lì che una riga della
     1.4, che di UM non ne aveva, o regge o lancia. */
  const vani = [...new Set(pacchetto.inventory.map((r) => CHIAVE(r.location_code)))];
  const scoppiate = [];
  for (const vano of vani) {
    try { Store.righeLette(Store.getItemsAtLocation(vano)); }
    catch (e) { scoppiate.push(`${vano}: ${e.message}`); }
  }
  expect(scoppiate, scoppiate.join(' · ')).toEqual([]);
});

test("e maiuscolando nessuna riga ne inghiotte un'altra", () => {
  /* La rinomina è innocua finché due righe non finiscono sulla STESSA chiave
     nello STESSO vano: allora una copre l'altra e la merce sparisce davvero.
     Su questo file non succede — ma è il controllo da fare sull'export vero
     del magazzino, prima di premere Importa. */
  const visto = new Map();
  const scontri = [];
  for (const r of pacchetto.inventory) {
    const k = `${CHIAVE(r.location_code)}|${CHIAVE(r.item_key)}`;
    if (visto.has(k)) scontri.push(`${k}: «${visto.get(k)}» e «${r.item_key}»`);
    else visto.set(k, r.item_key);
  }
  expect(scontri, scontri.join(' · ')).toEqual([]);
});

test('la mappa si disegna: ogni ubicazione del file esiste ancora', () => {
  const vani = [...new Set(pacchetto.inventory.map((r) => r.location_code))];
  const mute = vani.filter((v) => !Store.locationExists(v));
  expect(mute,
    `${mute.length} ubicazioni su ${vani.length} non esistono più: ` + mute.slice(0, 6).join(', ')).toEqual([]);
});

test('i compiti aperti restano aperti, e la coda si ordina senza lanciare', () => {
  const aperti = pacchetto.tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
  expect(Store.getTaskQueue().length).toBe(aperti);
});

test('i documenti pendenti e gli archivi si rileggono, non si ricostruiscono', async () => {
  for (const col of ['pending_outbound', 'pick_archive', 'disposal_archive']) {
    if (!ATTESI[col]) continue;
    expect(await conta(col), col).toBe(ATTESI[col]);
  }
});

/* ── LE PERSONE ────────────────────────────────────────────────────────── */

test('gli operatori arrivano, e senza PIN — che è il modo giusto di ripartire', async () => {
  const elenco = await fetch(`${API}/api/auth/operatori`).then((r) => r.json());
  expect(elenco.length).toBe(ATTESI.operators);
  /* Voce 80: le impronte sono uscite dagli export archiviati. Senza PIN la
     finestra del primo avvio resta aperta e il primo Admin si nomina — §8. */
  expect(elenco.filter((o) => o.pin_set)).toEqual([]);
});

test('e su quel database il primo Admin si crea davvero, e entra', async () => {
  const intestazioni = { 'Content-Type': 'application/json' };
  const pin = await fetch(`${API}/api/op/hashPin`,
    { method: 'POST', headers: intestazioni, body: JSON.stringify({ pin: '314159' }) })
    .then((r) => r.json());

  const nato = await fetch(`${API}/api/c/operators/OP-BETA-1`, {
    method: 'PUT', headers: intestazioni,
    body: JSON.stringify({ op_id: 'OP-BETA-1', initials: 'BET1', first_name: 'Primo',
                           last_name: 'Admin', role: 'admin', active: true, ...pin }),
  });
  expect(nato.status).toBe(200);

  const dentro = await fetch(`${API}/api/auth/login`,
    { method: 'POST', headers: intestazioni,
      body: JSON.stringify({ op_id: 'OP-BETA-1', pin: '314159' }) });
  expect(dentro.status).toBe(200);
});
