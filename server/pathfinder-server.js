'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { PathfinderDB } = require('./lib/db');
const { NAMES } = require('./lib/schema');

const PORT = Number(process.env.PATHFINDER_PORT || 4173);
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = process.env.PATHFINDER_DB || path.join(__dirname, 'data', 'pathfinder.db');
/* ── 1.7 · L'APPLICATIVO E' UNA CARTELLA ──────────────────────────────────
   Fino alla 1.6 era un file HTML solo e `PATHFINDER_APP` ci puntava. Dalla
   1.7 e' una cartella — `index.html` piu' `assets/` coi nomi a impronta — e
   `PATHFINDER_APP_DIR` punta a `corrente`, una cartella che non cambia mai
   nome: installare e tornare indietro ne sostituiscono il CONTENUTO, senza
   amministratore e senza riavvio.

   NON e' una giunzione, e non deve tornare a esserlo: il 17/08/2026 lo era,
   e questo processo — che gira come SYSTEM in sessione 0 — non e' riuscito ad
   attraversarla («UNKNOWN: unknown error» su stat), mentre lo stesso percorso
   si apriva senza problemi da una sessione utente. Tre ore di applicativo giu'.

   `precedente` e' la cartella sorella, e serve gli assets della versione
   appena lasciata a chi aveva la pagina a meta' caricamento nell'istante
   dello scambio.

   `PATHFINDER_APP` resta come ripiego, per servire una vecchia consegna a
   file singolo senza avvolgerla. Non e' la strada normale: una build a file
   singolo e' una cartella con dentro il solo `index.html`, e passa di qui
   come tutte le altre. */
const APP_DIR  = process.env.PATHFINDER_APP_DIR || null;
const PREV_DIR = process.env.PATHFINDER_APP_PREV
  || (APP_DIR ? path.join(path.dirname(APP_DIR), 'precedente') : null);
const APP_FILE = process.env.PATHFINDER_APP || null;

/* La versione del SERVIZIO, non dell'applicativo — quella la dice il
   manifesto, e sono due cose diverse. Si muove quando cambia il contratto:
   qui cambia davvero, con una variabile nuova e la famiglia `/assets`. */
const VERSION = '1.7';

const TLS_CERT = process.env.PATHFINDER_TLS_CERT || null;
const TLS_KEY  = process.env.PATHFINDER_TLS_KEY  || null;

const db = new PathfinderDB(DB_FILE);
const app = express();
app.use(express.json({ limit: '256mb' }));   // un import completo puo' pesare

const originOf = (req) => req.get('X-Pathfinder-Client') || null;

/* ── 1.4.2 · Le UM escono dentro la stessa transazione dei colli ──────────
   Due scritture separate sono due numeri che divergono il primo pomeriggio in
   cui due terminali prelevano lo stesso lotto. E' esattamente la ragione per
   cui queste due rotte composte esistono, e vale per `qty_uom` come vale per
   `qty`: chi tocca l'una tocca l'altra, o nessuna delle due.

   L'arrotondamento e' quello di `src/modules/misure.ts` — DECIMALI_MAX. Qui
   e' riscritto invece che importato perche' il servizio resta JavaScript e
   non condivide moduli col client: se quella costante cambia, questa riga
   cambia con lei. */
const UOM_DECIMALI = 3;

const arrotondaUom = (n) => {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return null;
  const f = 10 ** UOM_DECIMALI;
  const r = Math.round(v * f * (1 + Number.EPSILON)) / f;
  return r === 0 ? 0 : r;
};

/* Quante UM restano dopo averne tolte `chieste`. `null` = riga a soli colli,
   cioe' il comportamento della 1.4.1 e di tutto cio' che c'era prima.

   `prima` si legge dalla RIGA, non da cio' che dice il client: e' il punto
   di tutta la transazione. `atteso` serve solo alla riga che non ha mai
   avuto un `qty_uom` — un dato che nessuno ha mai scritto — e appena uno dei
   due terminali lo scrive, il secondo trova quello e ignora la propria
   derivazione.

   Non scende sotto zero: un saldo negativo in un magazzino e' peggio di un
   prelievo rifiutato. */
const scalaUom = (item, chieste, atteso, tutto) => {
  const prima = arrotondaUom(item.qty_uom) ?? arrotondaUom(atteso);
  if (prima === null || (!tutto && arrotondaUom(chieste) === null)) return null;
  if (tutto) return { prima, dopo: 0, delta: -prima };
  const out = Math.min(arrotondaUom(chieste), prima);
  return { prima, dopo: arrotondaUom(prima - out), delta: -out };
};

/* ── 1.8 · L'ELENCO DEI COLLI, E CHI LO ARBITRA ───────────────────────────
   Dalla 1.8 la suddivisione non si calcola da un per-collo costante: la riga
   porta `packs`, un numero per collo, e lo stesso articolo puo' stare in colli
   da 5 e da 25 kg nella stessa ubicazione.

   IL CLIENT SCEGLIE PER INDICE, QUI ARRIVANO SOLO LE QUANTITA'. E' la stessa
   ragione di `qty_uom_before`: fra il render della maschera e il tocco sul
   bottone un altro terminale puo' aver preso quel collo, e un indice vecchio
   punterebbe a merce diversa. Le quantita' invece si cercano nell'elenco che
   la riga ha adesso — o non si trovano, e allora e' un 409.

   Dove c'e' `packs`, `qty` e `qty_uom` diventano derivate: le conta l'elenco,
   non il client. */
const leggiPacks = (raw) => {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const v of raw) {
    const n = arrotondaUom(v);
    if (n === null || n <= 0) return null;
    out.push(n);
  }
  return out;
};

const sommaPacks = (elenco) => elenco.reduce((a, n) => arrotondaUom(a + n), 0);

/* Un collo della misura esatta esce intero; se non c'e', si apre IL PIU'
   PICCOLO CHE BASTA — aprire quello da 1.000 per prendere 300 lascerebbe due
   colli aperti dove ne bastava uno, e il magazzino li conta a mano. */
const scalaPacks = (elenco, usciti) => {
  const rimasti = elenco.slice();
  let uscite = 0;
  for (const q of usciti) {
    let i = rimasti.indexOf(q);
    if (i === -1) {
      for (let k = 0; k < rimasti.length; k++) {
        if (rimasti[k] > q && (i === -1 || rimasti[k] < rimasti[i])) i = k;
      }
    }
    if (i === -1) {
      throw Object.assign(new Error(`nessun collo contiene ${q}: un altro terminale ha gia' mosso questa riga`), { status: 409 });
    }
    if (rimasti[i] === q) rimasti.splice(i, 1);
    else rimasti[i] = arrotondaUom(rimasti[i] - q);
    uscite = arrotondaUom(uscite + q);
  }
  return { rimasti, uscite };
};

/* Che cosa esce da una riga gestita a colli dichiarati. `null` = `packs_out`
   non c'e', e allora comanda il percorso della 1.7 — riga per riga, senza un
   ramo di codice che si percorre una volta l'anno.

   `packs_before` e' il seme, e vale una volta sola: la riga posizionata prima
   della 1.8 non ha nessun elenco, e il primo che la muove porta la propria
   lettura. Poi comanda la riga, come per `qty_uom_before`. */
const uscitaColli = (item, packsOut, packsBefore) => {
  const usciti = leggiPacks(packsOut);
  if (usciti === null) return null;
  const elenco = leggiPacks(item.packs) || leggiPacks(packsBefore);
  if (!elenco) {
    throw Object.assign(new Error(`${item.item_key}: la riga non porta l'elenco dei colli`), { status: 409 });
  }
  const { rimasti, uscite } = scalaPacks(elenco, usciti);
  const prima = sommaPacks(elenco);
  return {
    rimasti, tutto: rimasti.length === 0,
    qtyBefore: elenco.length, qtyAfter: rimasti.length,
    um: { prima, dopo: arrotondaUom(prima - uscite), delta: -uscite },
  };
};

/* `packs_out` illeggibile non ricade in silenzio sul percorso vecchio: una
   maschera che manda un elenco rotto ha un difetto, e prelevare lo stesso
   scriverebbe un saldo plausibile per il motivo sbagliato. */
const assertPacksOut = (raw) => {
  if (raw !== undefined && raw !== null && leggiPacks(raw) === null) {
    throw Object.assign(new Error('l\'elenco dei colli da prelevare non e\' leggibile'), { status: 400 });
  }
};

const SQL_CONSTRAINT = {
  SQLITE_CONSTRAINT_UNIQUE:     'valore gia\' presente: il vincolo di unicita\' lo impedisce',
  SQLITE_CONSTRAINT_PRIMARYKEY: 'chiave gia\' esistente',
  SQLITE_CONSTRAINT_NOTNULL:    'campo obbligatorio mancante',
  SQLITE_CONSTRAINT_FOREIGNKEY: 'riferimento a un record inesistente'
};

const httpError = (err) => {
  if (err.status) return { status: err.status, message: err.message };
  const known = SQL_CONSTRAINT[err.code];
  if (known) return { status: 409, message: `${known} (${err.message})`, quiet: true };
  if (String(err.code || '').startsWith('SQLITE_CONSTRAINT'))
    return { status: 409, message: err.message, quiet: true };
  return { status: 500, message: err.message || 'errore interno' };
};

const wrap = (fn) => (req, res) => {
  try { fn(req, res); }
  catch (err) {
    const e = httpError(err);
    if (e.status >= 500) console.error('[pathfinder] guasto:', err);
    else if (e.quiet) console.warn(`[pathfinder] respinta ${req.method} ${req.originalUrl}: ${e.message}`);
    res.status(e.status).json({ error: e.message });
  }
};

const parseCriteria = (raw) => {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw Object.assign(new Error('criterio non leggibile'), { status: 400 }); }
};

app.get('/api/health', wrap((req, res) => {
  res.json({ ok: true, service: 'pathfinder', version: VERSION,
             collections: NAMES, ...db.stats() });
}));

app.get('/api/load', wrap((req, res) => {
  const from = req.query.movLogFrom != null && req.query.movLogFrom !== ''
    ? Number(req.query.movLogFrom) : null;
  res.json(db.loadAll({ movLogFrom: from }));
}));

app.get('/api/c/:col/query', wrap((req, res) => {
  const { col } = req.params;
  res.json(db.query(col, {
    criteria: parseCriteria(req.query.criteria),
    limit: req.query.limit != null && req.query.limit !== '' ? Number(req.query.limit) : null,
    offset: req.query.offset ? Number(req.query.offset) : 0,
    reverse: req.query.reverse === 'true',
    orderBy: req.query.orderBy || null
  }));
}));

app.get('/api/c/:col/count', wrap((req, res) => {
  res.json({ count: db.count(req.params.col, parseCriteria(req.query.criteria)) });
}));

app.get('/api/c/:col/:key', wrap((req, res) => {
  const rec = db.get(req.params.col, req.params.key);
  if (!rec) return res.status(404).json({ error: 'non trovato' });
  res.json(rec);
}));

app.get('/api/c/:col', wrap((req, res) => res.json(db.all(req.params.col))));

app.post('/api/c/:col/bulk', wrap((req, res) => {
  const mode = req.query.mode === 'put' ? 'bulkPut' : 'bulkAdd';
  const records = req.body;
  if (!Array.isArray(records)) throw Object.assign(new Error('atteso un elenco di record'), { status: 400 });
  res.json({ keys: db[mode](req.params.col, records, originOf(req)) });
}));

app.post('/api/c/:col', wrap((req, res) => {
  res.json({ key: db.add(req.params.col, req.body, originOf(req)) });
}));

app.put('/api/c/:col/:key', wrap((req, res) => {
  const rec = { ...req.body };
  res.json({ key: db.put(req.params.col, rec, originOf(req)) });
}));

app.patch('/api/c/:col/:key', wrap((req, res) => {
  res.json({ changed: db.update(req.params.col, req.params.key, req.body, originOf(req)) });
}));

app.delete('/api/c/:col/:key', wrap((req, res) => {
  res.json({ deleted: db.delete(req.params.col, req.params.key, originOf(req)) });
}));

app.delete('/api/c/:col', wrap((req, res) => {
  res.json({ deleted: db.clear(req.params.col, originOf(req)) });
}));

app.post('/api/deleteWhere/:col', wrap((req, res) => {
  res.json({ deleted: db.deleteWhere(req.params.col, req.body, originOf(req)) });
}));

app.post('/api/clear', wrap((req, res) => {
  const cols = req.body?.collections;
  if (!Array.isArray(cols)) throw Object.assign(new Error('atteso { collections: [...] }'), { status: 400 });
  db.clearMany(cols, originOf(req));
  res.json({ ok: true });
}));

app.post('/api/tx', wrap((req, res) => {
  const { collections = [], ops = [] } = req.body || {};
  if (!Array.isArray(ops)) throw Object.assign(new Error('atteso { ops: [...] }'), { status: 400 });
  const results = [];
  db.transaction(collections.length ? collections : NAMES, () => {
    for (const o of ops) {
      switch (o.op) {
        case 'add':         results.push(db.add(o.collection, o.record)); break;
        case 'put':         results.push(db.put(o.collection, o.record)); break;
        case 'update':      results.push(db.update(o.collection, o.key, o.changes)); break;
        case 'delete':      results.push(db.delete(o.collection, o.key)); break;
        case 'bulkAdd':     results.push(db.bulkAdd(o.collection, o.records)); break;
        case 'bulkPut':     results.push(db.bulkPut(o.collection, o.records)); break;
        case 'clear':       results.push(db.clear(o.collection)); break;
        case 'clearMany':   db.clearMany(o.collections); results.push(true); break;
        case 'deleteWhere': results.push(db.deleteWhere(o.collection, o.criteria)); break;
        default: throw Object.assign(new Error(`operazione sconosciuta: ${o.op}`), { status: 400 });
      }
    }
  }, originOf(req));
  res.json({ ok: true, results });
}));

app.post('/api/op/removeItem', wrap((req, res) => {
  const { location_code, item_key, qty, qty_uom, qty_uom_before, packs_out, packs_before } = req.body || {};
  const n = Number(qty);
  assertPacksOut(packs_out);
  /* 1.8 — con l'elenco la quantita' in colli e' una conseguenza, e puo' essere
     zero: un prelievo che apre un collo senza svuotarlo non toglie colli. */
  if (!location_code || !item_key || (packs_out === undefined && (!Number.isFinite(n) || n < 1)))
    throw Object.assign(new Error('servono location_code, item_key e una quantita\' valida'), { status: 400 });

  const out = db.transaction(['inventory'], () => {
    const rows = db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rows.find(r => r.item_key === item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });

    const colli = uscitaColli(item, packs_out, packs_before);
    const have = colli ? colli.qtyBefore : (item.qty || 1);
    const usciti = colli ? colli.qtyBefore - colli.qtyAfter : n;
    if (!colli && n > have)
      throw Object.assign(new Error(`In ${location_code} restano ${have} colli: un altro terminale ne ha gia' presi`), { status: 409 });

    const after = have - usciti;
    const snapshot = { ...item };
    const um = colli ? colli.um : scalaUom(item, qty_uom, qty_uom_before, after <= 0);
    const conti = um === null ? {}
      : { _qty_uom_before: um.prima, _qty_uom_delta: um.delta, _qty_uom_after: um.dopo };

    if (colli ? colli.tutto : after <= 0) {
      db.delete('inventory', item._id);
      return { ...snapshot, _mode: 'full', _qty_before: have, _qty_delta: -usciti, _qty_after: 0, ...conti };
    }
    item.qty = after;
    if (um !== null) item.qty_uom = um.dopo;
    if (colli) item.packs = colli.rimasti;
    item.updated_at = Date.now();
    db.put('inventory', item);
    return { ...snapshot, qty: after, ...(um === null ? {} : { qty_uom: um.dopo }),
             ...(colli ? { packs: colli.rimasti } : {}),
             _mode: 'partial', _qty_before: have, _qty_delta: -usciti, _qty_after: after, ...conti };
  }, originOf(req));

  res.json(out);
}));

/* 1.4.2.1 — IL CAMPIONAMENTO: i colli non calano, cala la quantita' dentro.
   Ha una rotta sua e non un `qty: 0` su removeItem, perche' quella rotta ha
   una guardia che rifiuta le quantita' sotto l'uno — e quella guardia e' la
   ragione per cui removeItem non fa danni. Non la si allarga per far posto a
   un caso che significa un'altra cosa.

   Come ovunque, il saldo di partenza si legge dalla RIGA: `qty_uom_before`
   e' solo il seme per la riga che un `qty_uom` non lo ha mai avuto. */
app.post('/api/op/sampleItem', wrap((req, res) => {
  const { location_code, item_key, qty_uom, qty_uom_before } = req.body || {};
  const n = arrotondaUom(qty_uom);
  if (!location_code || !item_key || n === null || n <= 0)
    throw Object.assign(new Error('servono location_code, item_key e una quantita\' di campione valida'), { status: 400 });

  const out = db.transaction(['inventory'], () => {
    const rows = db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rows.find(r => r.item_key === item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });

    const prima = arrotondaUom(item.qty_uom) ?? arrotondaUom(qty_uom_before);
    if (prima === null)
      throw Object.assign(new Error(`${item_key}: nessuna quantita' in UM da cui prelevare il campione`), { status: 409 });
    if (n > prima)
      throw Object.assign(new Error(`Restano ${prima} UM: un campione da ${n} non ci sta`), { status: 409 });

    const dopo = arrotondaUom(prima - n);
    item.qty_uom = dopo;
    item.updated_at = Date.now();
    db.put('inventory', item);
    /* `qty` non compare in questo oggetto, ed e' il punto: il collo resta. */
    return { ok: true, qty_uom_before: prima, qty_uom_after: dopo, qty_uom_delta: -n, qty: item.qty };
  }, originOf(req));

  res.json(out);
}));

app.post('/api/op/commitPickStop', wrap((req, res) => {
  const { location_code, item_key, qty, qty_uom, qty_uom_before, packs_out, packs_before, movement, session } = req.body || {};
  const n = Number(qty);
  assertPacksOut(packs_out);
  if (!location_code || !item_key || !session?.session_id
      || (packs_out === undefined && (!Number.isFinite(n) || n < 1)))
    throw Object.assign(new Error('parametri incompleti'), { status: 400 });

  const out = db.transaction(['inventory', 'mov_log', 'pick_session', 'meta'], () => {
    const rows = db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rows.find(r => r.item_key === item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });
    const colli = uscitaColli(item, packs_out, packs_before);
    const have = colli ? colli.qtyBefore : (item.qty || 1);
    const usciti = colli ? colli.qtyBefore - colli.qtyAfter : n;
    if (!colli && n > have)
      throw Object.assign(new Error(`In ${location_code} restano ${have} colli`), { status: 409 });

    const after = have - usciti;
    const um = colli ? colli.um : scalaUom(item, qty_uom, qty_uom_before, after <= 0);
    if (colli ? colli.tutto : after <= 0) db.delete('inventory', item._id);
    else {
      item.qty = after;
      if (um !== null) item.qty_uom = um.dopo;
      if (colli) item.packs = colli.rimasti;
      item.updated_at = Date.now();
      db.put('inventory', item);
    }

    /* Il movimento porta il delta in UM insieme a quello in colli: il
       registro e' la sola cosa che, fra sei anni, dira' quanto e' uscito. */
    const mov = { ...movement, ts: movement?.ts || Date.now(),
                  qty_before: have, qty_delta: -usciti, qty_after: after,
                  ...(um === null ? {} : { qty_uom_delta: um.delta }) };
    const movId = db.add('mov_log', mov);

    db.put('pick_session', session);
    db.put('meta', { key: 'lastModified', value: Date.now() });

    return { removed: { ...item, _mode: (colli ? colli.tutto : after <= 0) ? 'full' : 'partial',
                        _qty_before: have, _qty_delta: -usciti, _qty_after: after,
                        ...(um === null ? {}
                          : { _qty_uom_before: um.prima, _qty_uom_delta: um.delta, _qty_uom_after: um.dopo }) },
             movement_id: movId };
  }, originOf(req));

  res.json(out);
}));

const crypto = require('crypto');

const hashPin = (pin, salt) =>
  crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');

const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const tentativi = new Map();
const MAX_TENTATIVI = 5;
const ATTESA_MS = 60000;

const frenoControlla = (chiave) => {
  const t = tentativi.get(chiave);
  if (!t) return null;
  if (Date.now() > t.fino) { tentativi.delete(chiave); return null; }
  if (t.n >= MAX_TENTATIVI) return Math.ceil((t.fino - Date.now()) / 1000);
  return null;
};

const frenoSegna = (chiave, riuscito) => {
  if (riuscito) { tentativi.delete(chiave); return; }
  const t = tentativi.get(chiave) || { n: 0, fino: 0 };
  t.n++;
  t.fino = Date.now() + ATTESA_MS;
  tentativi.set(chiave, t);
};

app.post('/api/op/verifyPin', wrap((req, res) => {
  const { op_id, initials, pin } = req.body || {};
  if (!pin || (!op_id && !initials))
    throw Object.assign(new Error('servono il PIN e l\'operatore'), { status: 400 });

  const chiave = String(op_id || initials).toUpperCase();
  const attesa = frenoControlla(chiave);
  if (attesa) {
    return res.status(429).json({ ok: false, blocked: true, retryAfter: attesa,
      error: `Troppi tentativi: riprovare fra ${attesa} secondi` });
  }

  let op = null;
  if (op_id) op = db.get('operators', op_id);
  else {
    const rows = db.query('operators', { criteria: { field: 'initials', op: 'equals', value: String(initials).toUpperCase() } });
    op = rows[0] || null;
  }

  if (!op || !op.pin_hash || !op.pin_salt) {
    frenoSegna(chiave, false);
    return res.json({ ok: false, reason: 'operatore senza PIN impostato' });
  }

  const ok = equal(hashPin(String(pin), op.pin_salt), op.pin_hash);
  frenoSegna(chiave, ok);
  res.json({ ok });
}));

app.post('/api/op/hashPin', wrap((req, res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{6}$/.test(pin))
    throw Object.assign(new Error('serve un PIN di sei cifre'), { status: 400 });
  const salt = crypto.randomBytes(16).toString('hex');
  res.json({ pin_salt: salt, pin_hash: hashPin(pin, salt), pin_set_at: Date.now() });
}));

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const me = req.query.client || null;
  res.write(`event: hello\ndata: ${JSON.stringify({ rev: db.currentRevision(), version: VERSION })}\n\n`);

  const off = db.onChange((ev) => {
    if (me && ev.origin && ev.origin === me) return;   // non ci si avvisa da soli
    res.write(`event: change\ndata: ${JSON.stringify(ev)}\n\n`);
  });

  const beat = setInterval(() => { try { res.write(': beat\n\n'); } catch {} }, 20000);
  req.on('close', () => { off(); clearInterval(beat); });
});

app.post('/api/backup', wrap((req, res) => {
  const dir = req.body?.dir || path.join(__dirname, 'data', 'backup');
  const name = `pathfinder-${new Date().toISOString().slice(0, 10)}.db`;
  const dest = path.join(dir, name);
  db.backupTo(dest).then(
    () => res.json({ ok: true, file: dest }),
    (err) => res.status(500).json({ error: err.message })
  );
}));

const noCache = (res) => res.set('Cache-Control', 'no-cache');

/* Gli assets portano l'impronta nel nome: a parita' di nome non cambiano
   mai, e il terminale non ha ragione di richiederli una seconda volta.
   `index.html` invece resta `no-cache`, perche' e' lui che li nomina: un
   indice vecchio in cache chiederebbe file che non esistono piu'.
   Invertire questi due e' il difetto peggiore possibile. */
const PER_SEMPRE = 'public, max-age=31536000, immutable';

/* Il `.gz` lo scrive la build, una volta sola e al massimo livello: questi
   file non cambiano, comprimerli a ogni richiesta sarebbe CPU spesa per
   riottenere lo stesso byte. Chi non dichiara di accettare gzip riceve il
   file in chiaro, che resta li' accanto — nessun terminale resta fuori. */
const invia = (req, res, assoluto, cache) => {
  res.set('Cache-Control', cache);
  res.set('Vary', 'Accept-Encoding');
  const gz = assoluto + '.gz';
  if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && fs.existsSync(gz)) {
    res.type(path.extname(assoluto) || 'application/octet-stream');
    res.set('Content-Encoding', 'gzip');
    return res.sendFile(gz);
  }
  res.sendFile(assoluto);
};

let erroreManifesto = null;

const leggiManifesto = () => {
  if (!APP_DIR) return null;
  try {
    /* Il BOM va tolto PRIMA di `JSON.parse`, che su di lui lancia. Non e' un
       caso di scuola: `installa-versione.ps1` genera il manifesto di una
       consegna avvolta, e in PowerShell 5.1 `Out-File -Encoding utf8` scrive
       UTF-8 CON BOM. Senza questa riga, dopo un ritorno indietro
       `/api/app-info` rispondeva versione e impronta nulle — cioe' proprio
       il numero su cui si verifica un'installazione. Trovato al banco, con
       tutti i collaudi verdi. */
    const grezzo = fs.readFileSync(path.join(APP_DIR, 'manifest.json'), 'utf8');
    erroreManifesto = null;
    return JSON.parse(grezzo.replace(/^﻿/, ''));
  } catch (e) {
    /* L'errore si TIENE, e `/api/app-info` lo dice. Il 17/08 il servizio
       rispondeva versione e impronta nulle e non c'era modo di sapere perche':
       il processo gira come SYSTEM, la sua console non la legge nessuno, e da
       una shell qualunque lo stesso percorso si apriva senza problemi. Un
       manifesto illeggibile e' il modo in cui si scopre che l'applicativo non
       verra' servito, e deve dire di cosa e' morto. */
    erroreManifesto = `${e.code || 'ERRORE'}: ${e.message}`;
    return null;
  }
};

if (APP_DIR) {
  const indice = path.join(APP_DIR, 'index.html');

  /* UN NOME, NON UN PERCORSO. `:file` non puo' contenere una barra, e il
     controllo sui caratteri chiude la porta a tutto il resto: non esiste un
     modo di uscire da `assets/`. Fuori da qui la cartella-versione non e'
     raggiungibile dalla LAN — mai `express.static` sulla cartella intera,
     perche' il giorno in cui la variabile punta a un albero di sorgenti
     quella riga li pubblica tutti. */
  app.get('/assets/:file', (req, res) => {
    const nome = req.params.file;
    if (!/^[A-Za-z0-9._-]+$/.test(nome) || nome.includes('..')) {
      return res.status(400).json({ error: 'nome di risorsa non valido' });
    }
    const qui = path.join(APP_DIR, 'assets', nome);
    if (fs.existsSync(qui)) return invia(req, res, qui, PER_SEMPRE);

    /* Il ripiego su `precedente`: chi stava caricando la pagina nell'istante
       dello scambio chiede assets che `corrente` non ha piu'. I nomi portano
       l'impronta, quindi due versioni non possono collidere. */
    const prima = PREV_DIR ? path.join(PREV_DIR, 'assets', nome) : null;
    if (prima && fs.existsSync(prima)) return invia(req, res, prima, PER_SEMPRE);

    res.status(404).json({ error: 'risorsa inesistente' });
  });

  app.get(['/', '/app'], (req, res) => invia(req, res, indice, 'no-cache'));
} else {
  app.get(['/', '/app'], (req, res) => {
    if (!APP_FILE) {
      return res.status(503).type('text/plain').send(
        'Applicativo non configurato: impostare PATHFINDER_APP_DIR e riavviare il servizio.');
    }
    noCache(res);
    res.sendFile(APP_FILE);
  });
}

app.get('/api/app-info', wrap((req, res) => {
  if (APP_DIR) {
    const m = leggiManifesto();
    /* `app_dir` e' la giunzione, `punta_a` la cartella vera: e' cosi' che si
       vede QUALE versione sta servendo senza aprire niente. */
    let punta_a = null;
    let errore = erroreManifesto;
    try { punta_a = fs.realpathSync(APP_DIR); }
    catch (e) { errore = `${e.code || 'ERRORE'}: ${e.message}`; }
    return res.json({
      service_version: VERSION,
      modo: 'cartella',
      app_dir: APP_DIR,
      punta_a,
      versione: m?.versione ?? null,
      impronta: m?.impronta ?? null,
      byte_totali: m?.byte_totali ?? null,
      costruita: m?.costruita ?? null,
      file: m?.file?.length ?? null,
      /* Presente SOLO quando qualcosa non va: un campo che compare e' un campo
         che si legge, e questa risposta e' il primo comando di ogni diagnosi. */
      ...(punta_a && !errore ? {} : { errore, utente: os.userInfo().username }),
    });
  }
  let stat = null;
  try { const s = fs.statSync(APP_FILE); stat = { bytes: s.size, mtime: s.mtime.toISOString() }; } catch {}
  res.json({ service_version: VERSION, modo: 'file', app_file: APP_FILE, ...stat });
}));

app.use((req, res) => res.status(404).json({ error: 'endpoint inesistente' }));

const creaServer = () => {
  if (!TLS_CERT && !TLS_KEY) return { srv: http.createServer(app), schema: 'http' };

  if (!TLS_CERT || !TLS_KEY) {
    console.error('\n  Certificato incompleto: servono PATHFINDER_TLS_CERT e PATHFINDER_TLS_KEY.');
    console.error(`  cert: ${TLS_CERT || '(mancante)'}`);
    console.error(`  key:  ${TLS_KEY  || '(mancante)'}`);
    console.error('  Il servizio non parte in chiaro per errore.\n');
    process.exit(1);
  }

  try {
    const opzioni = { cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) };
    return { srv: https.createServer(opzioni, app), schema: 'https' };
  } catch (err) {
    console.error(`\n  Certificato illeggibile: ${err.message}`);
    console.error('  Controllare percorsi e permessi. Il servizio gira come SYSTEM:');
    console.error('  la chiave privata deve essere leggibile da SYSTEM, non solo dall\'utente.\n');
    process.exit(1);
  }
};

const { srv, schema } = creaServer();

const server = srv.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`\n  Pathfinder ${VERSION} — servizio dati`);
  console.log(`  database   ${DB_FILE}`);
  console.log(`  applicativo ${schema}://localhost:${PORT}/`);
  for (const ip of lan) console.log(`  in rete     ${schema}://${ip}:${PORT}/`);
  if (schema === 'http') console.log('  ATTENZIONE  senza certificato il PIN viaggia in chiaro');
  /* Un applicativo che non c'e' NON ferma il servizio: le rotte `/api`
     devono rispondere lo stesso, e i terminali gia' aperti continuano a
     lavorare. E' la stessa scelta del 13/08, quando il file servito fu
     cancellato per errore e il magazzino ando' avanti. */
  if (APP_DIR) {
    const mancanti = ['index.html', 'manifest.json']
      .filter((f) => !fs.existsSync(path.join(APP_DIR, f)));
    if (mancanti.length) {
      console.error(`  ATTENZIONE  la cartella dell'applicativo non e' completa: ${APP_DIR}`);
      console.error(`              mancano: ${mancanti.join(', ')}`);
      console.error('              i terminali riceveranno una pagina vuota (404).');
      console.error('              Il servizio dati resta vivo: le rotte /api rispondono.');
    } else {
      const m = leggiManifesto();
      let punta_a = APP_DIR;
      try { punta_a = fs.realpathSync(APP_DIR); } catch {}
      console.log(`  applicativo ${m?.versione ?? '?'} — ${path.basename(punta_a)}`);
      console.log(`  impronta    ${m?.impronta ?? '(manifesto illeggibile)'}`);
    }
  } else if (!APP_FILE) {
    console.error('  ATTENZIONE  nessun applicativo configurato.');
    console.error('              Impostare PATHFINDER_APP_DIR sulla giunzione `corrente`.');
  } else if (!fs.existsSync(APP_FILE)) {
    console.error(`  ATTENZIONE  l'applicativo NON esiste: ${APP_FILE}`);
    console.error('              i terminali riceveranno una pagina vuota (404).');
    console.error('              Indicare il file giusto in PATHFINDER_APP e riavviare.');
  }
  console.log(`  revisione   ${db.currentRevision()}\n`);
});

const shutdown = (sig) => {
  console.log(`\n  ${sig}: chiusura ordinata…`);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, db, server };
