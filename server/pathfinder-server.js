/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — SERVIZIO DATI
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Serve due cose: l'applicativo (un file HTML) e il suo database.
   Girano sulla stessa macchina, cosi' il terminale di reparto ha un solo
   indirizzo da conoscere e non esiste il caso in cui l'uno sia
   raggiungibile e l'altro no.

   LE TRE FAMIGLIE DI ENDPOINT, e perche' sono tre e non una:

     /api/c/...      le operazioni GENERICHE del contratto. Una collezione,
                     una chiave, un documento. Non sanno niente di
                     magazzino e non devono saperlo.

     /api/tx         un LOTTO di scritture eseguito tutto o niente. Serve
                     alle cinque transazioni del client che sono sole
                     scritture (import, azzeramento, cancellazione di un
                     sito): il client le accumula e le manda in un colpo.

     /api/op/...     le operazioni di DOMINIO. Servono alle due
                     transazioni che leggono, decidono e riscrivono nello
                     stesso respiro — scaricare una giacenza controllando
                     che basti, chiudere una tappa di prelievo. Quelle non
                     si possono spezzare in chiamate separate: fra la
                     lettura e la scrittura ci passerebbe un altro
                     terminale. Vivono qui perche' e' qui che c'e' il lock.

   E' anche la ragione per cui il passaggio a piu' terminali non e' solo
   un cambio di indirizzo: con un database solo, chi arbitra fra due
   operatori che vogliono lo stesso collo dev'essere uno, e sta qui.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PathfinderDB } = require('./lib/db');
const { NAMES } = require('./lib/schema');

const PORT = Number(process.env.PATHFINDER_PORT || 4173);
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = process.env.PATHFINDER_DB || path.join(__dirname, 'data', 'pathfinder.db');
const APP_FILE = process.env.PATHFINDER_APP || path.join(ROOT, 'pathfinder-1.1.html');
const VERSION = '1.1';

const db = new PathfinderDB(DB_FILE);
const app = express();
app.use(express.json({ limit: '256mb' }));   // un import completo puo' pesare

/* Ogni client si presenta con un identificativo. Serve a NON rimandargli
   indietro la notifica di un cambiamento che ha fatto lui: altrimenti
   ogni scrittura gli farebbe ricaricare la cache che ha gia' aggiornato. */
const originOf = (req) => req.get('X-Pathfinder-Client') || null;

/* Un vincolo violato NON e' un guasto del servizio: e' il database che
   dice di no a una richiesta sbagliata — un codice articolo gia' usato,
   due operatori con le stesse iniziali. Va risposto 409 e va scritto a
   registro in una riga, non con uno stack trace: un registro pieno di
   eccezioni che sono risposte corrette e' un registro che nessuno legge
   piu', e il giorno del guasto vero non se ne accorge nessuno. */
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

// ─────────────────────────────────────────────────────────────────────
// SALUTE E CARICAMENTO
// ─────────────────────────────────────────────────────────────────────

app.get('/api/health', wrap((req, res) => {
  res.json({ ok: true, service: 'pathfinder', version: VERSION,
             collections: NAMES, ...db.stats() });
}));

app.get('/api/load', wrap((req, res) => {
  const from = req.query.movLogFrom != null && req.query.movLogFrom !== ''
    ? Number(req.query.movLogFrom) : null;
  res.json(db.loadAll({ movLogFrom: from }));
}));

// ─────────────────────────────────────────────────────────────────────
// OPERAZIONI GENERICHE DI COLLEZIONE
// ─────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────
// LOTTO ATOMICO
// ─────────────────────────────────────────────────────────────────────

/* Corpo: { collections:[...], ops:[ {op, collection, record|key|changes|criteria|records} ] }
   O passano tutte o non passa nessuna. E' la traduzione fedele delle
   transazioni di sole scritture che il client gia' dichiara. */
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

// ─────────────────────────────────────────────────────────────────────
// OPERAZIONI DI DOMINIO
// ─────────────────────────────────────────────────────────────────────

/* Scarico di una giacenza con controllo della quantita', in una sola
   transazione. E' l'operazione che con piu' terminali NON puo' stare sul
   client: fra il momento in cui A legge "ci sono 40 colli" e quello in
   cui scrive "adesso sono 35", B puo' averne presi 10. Qui la lettura e
   la scrittura sono dentro lo stesso lock, e chi arriva secondo trova il
   saldo aggiornato e viene respinto con un errore parlante. */
app.post('/api/op/removeItem', wrap((req, res) => {
  const { location_code, item_key, qty } = req.body || {};
  const n = Number(qty);
  if (!location_code || !item_key || !Number.isFinite(n) || n < 1)
    throw Object.assign(new Error('servono location_code, item_key e una quantita\' valida'), { status: 400 });

  const out = db.transaction(['inventory'], () => {
    const rows = db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rows.find(r => r.item_key === item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });

    const have = item.qty || 1;
    if (n > have)
      throw Object.assign(new Error(`In ${location_code} restano ${have} colli: un altro terminale ne ha gia' presi`), { status: 409 });

    const after = have - n;
    const snapshot = { ...item };
    if (after <= 0) {
      db.delete('inventory', item._id);
      return { ...snapshot, _mode: 'full', _qty_before: have, _qty_delta: -n, _qty_after: 0 };
    }
    item.qty = after;
    item.updated_at = Date.now();
    db.put('inventory', item);
    return { ...snapshot, qty: after, _mode: 'partial', _qty_before: have, _qty_delta: -n, _qty_after: after };
  }, originOf(req));

  res.json(out);
}));

/* Chiusura di una tappa di prelievo: scarico, movimento a registro e
   avanzamento della sessione in un colpo solo. Era gia' una transazione
   sul client (v2.5.0 "commit atomico per tappa"); qui resta una
   transazione, ma arbitrata dal server. */
app.post('/api/op/commitPickStop', wrap((req, res) => {
  const { location_code, item_key, qty, movement, session } = req.body || {};
  const n = Number(qty);
  if (!location_code || !item_key || !Number.isFinite(n) || n < 1 || !session?.session_id)
    throw Object.assign(new Error('parametri incompleti'), { status: 400 });

  const out = db.transaction(['inventory', 'mov_log', 'pick_session', 'meta'], () => {
    const rows = db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rows.find(r => r.item_key === item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });
    const have = item.qty || 1;
    if (n > have)
      throw Object.assign(new Error(`In ${location_code} restano ${have} colli`), { status: 409 });

    const after = have - n;
    if (after <= 0) db.delete('inventory', item._id);
    else { item.qty = after; item.updated_at = Date.now(); db.put('inventory', item); }

    const mov = { ...movement, ts: movement?.ts || Date.now(),
                  qty_before: have, qty_delta: -n, qty_after: after };
    const movId = db.add('mov_log', mov);

    db.put('pick_session', session);
    db.put('meta', { key: 'lastModified', value: Date.now() });

    return { removed: { ...item, _mode: after <= 0 ? 'full' : 'partial',
                        _qty_before: have, _qty_delta: -n, _qty_after: after },
             movement_id: movId };
  }, originOf(req));

  res.json(out);
}));

// ─────────────────────────────────────────────────────────────────────
// PIN — CALCOLO E VERIFICA SUL SERVER
// ─────────────────────────────────────────────────────────────────────

/* PERCHE' IL PIN SI VERIFICA QUI E NON NEL BROWSER.
   Fino alla versione a file locale non c'era scelta: non esisteva un
   server, e l'hash lo faceva `crypto.subtle` nella scheda. Ma quella
   funzione il browser la concede solo in CONTESTO SICURO — https,
   file:// o localhost — e un terminale che apre http://192.168.x.x NON
   e' in contesto sicuro. Li' crypto.subtle non esiste proprio, e
   l'applicativo si trovava a dover scegliere fra fingere una verifica e
   rinunciarci: sceglieva onestamente di rinunciarci, e degradava
   all'identificazione per sole iniziali.

   Con un servizio a disposizione la scelta non serve piu': il calcolo si
   fa dove il contesto e' sempre sicuro. Il formato dell'impronta e'
   IDENTICO a quello del browser — SHA-256 di `salt:pin` in esadecimale —
   quindi i PIN impostati dalla versione a file locale restano validi qui
   e viceversa. Nessuna migrazione, nessun PIN da rifare.

   Resta vero, e va detto: su http semplice il PIN attraversa la rete in
   chiaro. Su una rete di reparto e' un rischio che si accetta di solito,
   ma la risposta completa e' servire in https — vedi LEGGIMI. */

const crypto = require('crypto');

const hashPin = (pin, salt) =>
  crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');

const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/* Freno ai tentativi. Un PIN e' di sei cifre: un milione di combinazioni
   sono niente per un programma che le prova via rete. Cinque tentativi
   sbagliati e quella sigla aspetta un minuto. Il conteggio sta in
   memoria: al riavvio del servizio riparte, ed e' accettabile perche'
   riavviare il servizio non e' cosa che un attaccante possa fare a
   ripetizione dall'esterno. */
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

/* Calcolo dei campi PIN per un operatore che sta per essere creato o
   aggiornato. Restituisce sale e impronta senza scrivere niente: e' il
   chiamante a metterli nel record, esattamente come faceva quando il
   calcolo avveniva nel browser.

   PERCHE' COSI' E NON UN "IMPOSTA IL PIN". Due dei quattro punti che
   impostano un PIN lo fanno mentre CREANO l'operatore, quando un op_id
   ancora non esiste. Un endpoint che scrive obbligherebbe a creare prima
   l'operatore senza PIN e a completarlo dopo: due passaggi, e se il
   secondo fallisce resta a sistema un Team Leader che non puo' entrare —
   proprio lo stato che chiudeva fuori tutti. Calcolare e basta lascia i
   quattro punti di chiamata come sono, e non apre quella finestra. */
app.post('/api/op/hashPin', wrap((req, res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{6}$/.test(pin))
    throw Object.assign(new Error('serve un PIN di sei cifre'), { status: 400 });
  const salt = crypto.randomBytes(16).toString('hex');
  res.json({ pin_salt: salt, pin_hash: hashPin(pin, salt), pin_set_at: Date.now() });
}));

// ─────────────────────────────────────────────────────────────────────
// FEED DEI CAMBIAMENTI
// ─────────────────────────────────────────────────────────────────────

/* Server-Sent Events: un canale solo, in sola lettura, che il browser
   riapre da se' se cade. Ogni scrittura dice quali collezioni ha toccato,
   e i terminali che non l'hanno fatta riallineano la loro copia.

   Senza questo, con piu' terminali, il secondo lavora su giacenze vecchie
   e ci costruisce sopra documenti sbagliati: e' il difetto che il
   passaggio a un database condiviso introduce, e va chiuso qui. */
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

  /* Battito: tiene viva la connessione attraverso proxy e antivirus che
     chiudono le connessioni inattive, e fa accorgere il client se il
     servizio e' morto senza chiudere il socket. */
  const beat = setInterval(() => { try { res.write(': beat\n\n'); } catch {} }, 20000);
  req.on('close', () => { off(); clearInterval(beat); });
});

// ─────────────────────────────────────────────────────────────────────
// BACKUP
// ─────────────────────────────────────────────────────────────────────

app.post('/api/backup', wrap((req, res) => {
  const dir = req.body?.dir || path.join(__dirname, 'data', 'backup');
  const name = `pathfinder-${new Date().toISOString().slice(0, 10)}.db`;
  const dest = path.join(dir, name);
  db.backupTo(dest).then(
    () => res.json({ ok: true, file: dest }),
    (err) => res.status(500).json({ error: err.message })
  );
}));

// ─────────────────────────────────────────────────────────────────────
// L'APPLICATIVO
// ─────────────────────────────────────────────────────────────────────

/* Servire l'HTML da qui non e' una comodita': e' cio' che fa smettere di
   essere `file://`. Da http://localhost il browser concede la persistenza
   dello storage, che aperto come file locale NEGA — era il difetto [H5]
   dichiarato nella v2.8.0, e si chiude senza scrivere una riga di codice. */
/* v1.1 — L'APPLICATIVO NON SI METTE IN CACHE.
   L'applicativo e' UN file, e aggiornarlo vuol dire sostituire quel file.
   Senza dirlo esplicitamente il browser puo' continuare a servire la copia
   che ha gia', e il terminale mostra la versione di ieri: si corregge un
   difetto, si ricarica la pagina e il difetto e' ancora li'. Non e' un caso
   di scuola — e' successo.

   `no-cache` non vieta di conservare la copia: obbliga a CHIEDERE prima di
   usarla. Con l'ETag che sendFile calcola gia', se il file non e' cambiato
   la risposta e' un 304 di poche decine di byte; se e' cambiato arriva
   quello nuovo. Su una rete di reparto il costo e' nullo e la certezza di
   avere in mano la versione giusta vale molto di piu'. */
const noCache = (res) => res.set('Cache-Control', 'no-cache');

app.get('/', (req, res) => { noCache(res); res.sendFile(APP_FILE); });
app.get('/app', (req, res) => { noCache(res); res.sendFile(APP_FILE); });
app.use('/loghi', express.static(path.join(ROOT, 'LOGHI')));

/* Quale versione sta servendo QUESTA macchina, e da quale file.
   Serve a rispondere in dieci secondi alla domanda "ho aggiornato ma non
   vedo il cambiamento": se `mtime` non e' quello del file appena copiato,
   il servizio sta servendo un'altra cartella. */
app.get('/api/app-info', wrap((req, res) => {
  let stat = null;
  try { const s = fs.statSync(APP_FILE); stat = { bytes: s.size, mtime: s.mtime.toISOString() }; } catch {}
  res.json({ service_version: VERSION, app_file: APP_FILE, ...stat });
}));

app.use((req, res) => res.status(404).json({ error: 'endpoint inesistente' }));

const server = app.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`\n  Pathfinder ${VERSION} — servizio dati`);
  console.log(`  database   ${DB_FILE}`);
  console.log(`  applicativo http://localhost:${PORT}/`);
  for (const ip of lan) console.log(`  in rete     http://${ip}:${PORT}/`);
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
