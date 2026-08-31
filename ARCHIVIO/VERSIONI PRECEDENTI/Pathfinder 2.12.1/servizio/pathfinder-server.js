'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');   // 2.11 — il guardiano lo usa prima del PIN
const https = require('https');
const { apriDatabase } = require('./lib/db');
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

/* LA VERSIONE DEL SERVIZIO SEGUE QUELLA DELL'APPLICATIVO - 2.2.

   Fino alla 2.0 questo numero si muoveva "quando cambia il contratto", ed
   era vero finche' il servizio si installava per conto suo. Dal 18/08 non
   e' piu' cosi': una versione E' l'applicativo PIU' il servizio, si
   installano insieme, e `installa-pathfinder.ps1` alla fine controlla che
   `service_version` sia lo stesso numero del pacchetto - se non lo e',
   dichiara fallita l'installazione, perche' quel caso significa che il
   riavvio non ha avuto effetto e sta ancora girando il processo di prima.

   Quindi questo numero si muove a OGNI versione, contratto o no: e' la
   prova che il servizio riavviato e' quello nuovo. Lasciarlo indietro
   perche' "il contratto non e' cambiato" fa fallire l'installazione con
   un messaggio che parla di riavvii. */
const VERSION = '2.12.1';

/* ── 2.10 · SU QUALE INTERFACCIA SI ASCOLTA ───────────────────────────────
   Fino alla 2.9 `listen` non diceva su quale, e Node in quel caso le prende
   TUTTE: il servizio rispondeva a chiunque sulla rete, e le rotte `/api` non
   chiedono credenziali a nessuno.

   Il valore predefinito resta quello — cambiarlo qui spegnerebbe i terminali
   di magazzino, che arrivano dalla rete, ed e' esattamente il gesto che non
   si fa in una versione che nessuno ha ancora provato. Ma adesso la scelta
   esiste e ha un nome: su una macchina dove l'applicativo si usa solo in
   locale, `PATHFINDER_HOST=127.0.0.1` chiude tutto il resto. */
const HOST = process.env.PATHFINDER_HOST || null;

const TLS_CERT = process.env.PATHFINDER_TLS_CERT || null;
const TLS_KEY  = process.env.PATHFINDER_TLS_KEY  || null;

/* IL DATABASE SI APRE PRIMA DI ASCOLTARE — 2.6.
   Con SQLite l'apertura e' immediata; con PostgreSQL e' un giro di rete,
   la creazione dello schema e il riallineamento delle sequenze. In tutti e
   due i casi la porta si apre DOPO: un terminale che riceve un 500 perche'
   il servizio non ha ancora un database e' peggio di un terminale che
   aspetta due secondi. */
let db = null;
const app = express();

/* ── 2.10 · LE TRE INTESTAZIONI CHE COSTANO DUE RIGHE ─────────────────────
   Non c'e' `Content-Security-Policy`, e non e' una dimenticanza: l'interfaccia
   costruisce i suoi gestori dentro le stringhe — 258 `onclick` — e una CSP
   seria vieta proprio quelli. Metterne una permissiva al punto da lasciarli
   passare vorrebbe dire scrivere una riga che non protegge da niente e che
   il prossimo lettore crede protegga.

   Queste tre invece valgono subito e non chiedono niente in cambio:
   · `nosniff`        — un file servito come testo non diventa uno script
                        perche' il browser ci ha guardato dentro.
   · `DENY`           — l'applicativo non si apre dentro la cornice di
                        un'altra pagina, che e' il modo in cui si fa cliccare
                        un bottone a chi crede di cliccarne un altro.
   · `same-origin`    — l'indirizzo di questa pagina non esce verso terzi.
                        Oggi non ci sono richieste all'esterno, e questa riga
                        serve a che continui a essere vero. */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '256mb' }));   // un import completo puo' pesare

const originOf = (req) => req.get('X-Pathfinder-Client') || null;

/* ── 2.10 · L'IMPRONTA DEL PIN NON ESCE DAL SERVIZIO ──────────────────────
   Fino alla 2.9 `GET /api/c/operators` rispondeva coi record interi, e
   dentro c'erano `pin_hash` e `pin_salt`. Un PIN e' di sei cifre: un milione
   di combinazioni, e SHA-256 le prova tutte in meno di due secondi su una
   CPU sola — misurato, 204 ms per trovarne uno. Il freno a cinque tentativi
   di `verifyPin` non c'entra niente: chi ha l'impronta non bussa piu'.

   Il campo non sparisce e basta: al suo posto esce `pin_set`, che e' la sola
   cosa che il client chiedeva davvero — «questo operatore ha un PIN?» — e
   che serve a `getUsableLeaders` e alla maschera che completa il profilo.
   La verifica passa da `/api/op/verifyPin`, che l'impronta la legge dal
   database e non la fa viaggiare.

   NON e' nel driver: il driver deve restituire il record com'e', e c'e' un
   collaudo che lo pretende. E' qui, sul confine, perche' il confine e'
   questo — quel che entra in una risposta HTTP. */
const senzaPin = (rec) => {
  if (!rec || typeof rec !== 'object') return rec;
  const { pin_hash, pin_salt, pin_algo, ...resto } = rec;
  return { ...resto, pin_set: Boolean(pin_hash && pin_salt) };
};

const nascondiPin = (col, dati) => {
  if (col !== 'operators') return dati;
  return Array.isArray(dati) ? dati.map(senzaPin) : senzaPin(dati);
};

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

   IL CLIENT SCEGLIE PER INDICE, QUI GLI INDICI NON ARRIVANO. E' la stessa
   ragione di `qty_uom_before`: fra il render della maschera e il tocco sul
   bottone un altro terminale puo' aver preso quel collo, e un indice vecchio
   punterebbe a merce diversa. Arriva la MISURA del collo e quanto ne esce, e
   la misura si cerca nell'elenco che la riga ha adesso — o non si trova, e
   allora e' un 409.

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

/* Le uscite: «quanto» e, quando il client lo sa, «DA QUALE COLLO».
   Il solo «quanto» non basta, e costa un saldo giusto con i colli sbagliati:
   se l'operatore apre un collo da 25 per prenderne 10 e a scaffale c'e' anche
   un collo da 10, la ricerca per quantita' porterebbe via quello — a video
   resta «1 × 15», in corsia restano due colli da 25 interi. Trovato al banco
   il 17/08 con tutte le prove verdi.
   La forma a numero solo resta valida: e' il collo che esce intero. */
const leggiUscite = (raw) => {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const v of raw) {
    if (v !== null && typeof v === 'object') {
      const da = arrotondaUom(v.da);
      const q = arrotondaUom(v.quantita ?? v.da);
      if (da === null || q === null || da <= 0 || q <= 0 || q > da) return null;
      out.push({ da, q });
      continue;
    }
    const n = arrotondaUom(v);
    if (n === null || n <= 0) return null;
    out.push({ da: null, q: n });
  }
  return out;
};

const sommaPacks = (elenco) => elenco.reduce((a, n) => arrotondaUom(a + n), 0);

/* Con `da`, il collo e' quello e nessun altro: si cerca un collo di QUELLA
   misura e se ne toglie `q`. I colli della stessa misura sono intercambiabili
   — uno da 25 vale l'altro — ma uno da 10 non vale un 25 aperto.

   Senza `da` — la forma a numero solo — vale la regola di prima: misura
   esatta, e se non c'e' si apre IL PIU' PICCOLO CHE BASTA, perche' aprire
   quello da 1.000 per prendere 300 lascerebbe due colli aperti dove ne
   bastava uno. */
const scalaPacks = (elenco, usciti) => {
  const rimasti = elenco.slice();
  let uscite = 0;
  for (const u of usciti) {
    const q = u.q;
    let i;
    if (u.da !== null) {
      i = rimasti.indexOf(u.da);
      if (i === -1) {
        throw Object.assign(new Error(`il collo da ${u.da} non e' piu' su questa riga: un altro terminale l'ha gia' mosso`), { status: 409 });
      }
    } else {
      i = rimasti.indexOf(q);
      if (i === -1) {
        for (let k = 0; k < rimasti.length; k++) {
          if (rimasti[k] > q && (i === -1 || rimasti[k] < rimasti[i])) i = k;
        }
      }
      if (i === -1) {
        throw Object.assign(new Error(`nessun collo contiene ${q}: un altro terminale ha gia' mosso questa riga`), { status: 409 });
      }
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
  const usciti = leggiUscite(packsOut);
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
  if (raw !== undefined && raw !== null && leggiUscite(raw) === null) {
    throw Object.assign(new Error('l\'elenco dei colli da prelevare non e\' leggibile'), { status: 400 });
  }
};

/* I DUE DATABASE NOMINANO LO STESSO RIFIUTO IN DUE MODI — 2.6.
   SQLite alza `SQLITE_CONSTRAINT_UNIQUE`, PostgreSQL lo SQLSTATE `23505`.
   Sono la stessa cosa per chi chiama: «quel valore c'e' gia'», cioe' un 409.
   Senza la seconda meta' della mappa, la stessa richiesta respinta tornava
   409 su SQLite e 500 su PostgreSQL: al terminale, «ci hai riprovato» contro
   «il servizio si e' rotto». */
const SQL_CONSTRAINT = {
  SQLITE_CONSTRAINT_UNIQUE:     "valore gia' presente: il vincolo di unicita' lo impedisce",
  SQLITE_CONSTRAINT_PRIMARYKEY: "chiave gia' esistente",
  SQLITE_CONSTRAINT_NOTNULL:    "campo obbligatorio mancante",
  SQLITE_CONSTRAINT_FOREIGNKEY: "riferimento a un record inesistente",
  /* PostgreSQL — classe 23, «integrity constraint violation». */
  23505: "valore gia' presente: il vincolo di unicita' lo impedisce",
  23503: "riferimento a un record inesistente",
  23502: "campo obbligatorio mancante",
  23514: "valore fuori da quanto il vincolo consente",
  "23P01": "valore in conflitto con un altro gia' presente"
};

const httpError = (err) => {
  if (err.status) return { status: err.status, message: err.message };
  const known = SQL_CONSTRAINT[err.code];
  if (known) return { status: 409, message: `${known} (${err.message})`, quiet: true };
  if (String(err.code || '').startsWith('SQLITE_CONSTRAINT'))
    return { status: 409, message: err.message, quiet: true };
  return { status: 500, message: err.message || 'errore interno' };
};

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
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


/* ══ 2.11 · LA SESSIONE, E PERCHE' IL PIN DA SOLO NON BASTAVA ═════════════
   Fino alla 2.10 le rotte `/api` non chiedevano credenziali a nessuno: chi
   raggiungeva la porta leggeva qualunque collezione, ne scriveva qualunque
   record, e con una `DELETE` svuotava le giacenze. Il PIN non era un
   controllo d'accesso — era una domanda che il client faceva a se stesso e a
   cui obbediva da solo. Chi non usava il client non ci passava nemmeno
   vicino, e la procedura di recupero PIN del §6 dell'INDEX — una `PATCH` su
   `/api/c/operators` — funzionava per chiunque sulla rete: si leggeva
   l'elenco, si sceglieva un Team Leader, si scriveva un'impronta nuova, si
   entrava come lui.

   ADESSO IL PIN EMETTE UNA SESSIONE, e senza sessione non si entra.

   UN COOKIE, NON UN'INTESTAZIONE. Tre ragioni, e la prima da sola decide:
   `EventSource` — il flusso che avvisa i terminali quando qualcun altro
   scrive — NON sa mandare intestazioni, e l'unico modo di autenticarlo con
   un token sarebbe metterlo nell'indirizzo, dove finisce nei log e nella
   cronologia. Poi: `HttpOnly` tiene il valore fuori dalla portata di
   JavaScript, quindi un XSS non se lo porta via. Infine non c'e' una riga da
   cambiare in ogni chiamata del client — il browser lo allega da solo.
   `SameSite=Strict` chiude il verso opposto: nessuna pagina di terzi puo'
   far partire una richiesta che se lo porti dietro.

   LE SESSIONI STANNO IN MEMORIA, e non e' pigrizia: e' il modo in cui un
   token che NON SCADE A TEMPO — deciso da Andrea il 27/08, perche' un
   operatore buttato fuori a meta' di un prelievo e' peggio del rischio che
   copre — resta comunque corto. Il servizio si riavvia a ogni aggiornamento
   e a ogni riaccensione della macchina, e li' tutte le sessioni cadono
   insieme. Chi smonta preme «Blocca», e la sua se ne va subito.

   LA FINESTRA DI PRIMO AVVIO. Su una macchina appena installata nessun
   operatore ha un PIN, e senza una via d'ingresso il primo non si potrebbe
   creare: il servizio allora accetta senza sessione, e lo dice all'avvio a
   lettere chiare. Appena il primo PIN esiste la finestra si chiude da sola e
   non si riapre. Si ricalcola SOLO quando qualcuno scrive sugli operatori,
   non a ogni richiesta: sarebbe una lettura di database per ogni movimento
   di magazzino.

   QUEL CHE RESTA APERTO, e va detto qui perche' e' qui che si legge: senza
   TLS il cookie viaggia in chiaro, come ci viaggiava il PIN. Chi ascolta la
   rete lo prende e lo usa finche' il servizio non si riavvia. La sessione
   chiude la porta a chi bussa; non protegge da chi ascolta il filo. */

const sessioni = new Map();   // token -> { op_id, initials, creata, ultimoUso }

const NOME_COOKIE = 'pathfinder_sessione';

/* Il token di macchina serve a chi non ha un browser e non ha un PIN: il
   backup serale, l'installer che verifica, gli script di migrazione. Lo
   scrive l'installazione fra le variabili di macchina. */
const TOKEN_MACCHINA = process.env.PATHFINDER_TOKEN || null;

const leggiCookie = (req, nome) => {
  const grezzo = req.headers.cookie;
  if (!grezzo) return null;
  for (const pezzo of grezzo.split(';')) {
    const i = pezzo.indexOf('=');
    if (i === -1) continue;
    if (pezzo.slice(0, i).trim() === nome) return decodeURIComponent(pezzo.slice(i + 1).trim());
  }
  return null;
};

/* `Secure` SOLO quando c'e' davvero TLS: messo su HTTP il browser scarta il
   cookie in silenzio, e l'applicativo non entrerebbe piu' su nessun
   terminale — un modo perfetto per non capirci niente. */
const scriviCookie = (res, token) => {
  const parti = [`${NOME_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (TLS_CERT && TLS_KEY) parti.push('Secure');
  res.set('Set-Cookie', parti.join('; '));
};

const cancellaCookie = (res) => {
  res.set('Set-Cookie', `${NOME_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
};

/* `null` = non ancora chiesto. Si azzera quando si scrive sugli operatori:
   e' l'unico gesto che puo' cambiare la risposta. */
let _primoAvvio = null;

const finestraDiPrimoAvvio = async () => {
  if (_primoAvvio !== null) return _primoAvvio;
  try {
    const ops = await db.all('operators');
    _primoAvvio = !ops.some((o) => o.pin_hash && o.pin_salt && o.active !== false);
  } catch {
    /* Se il database non risponde non si spalanca la porta: si dice di no, e
       chi ha un guasto vero lo vede da un'altra parte. */
    _primoAvvio = false;
  }
  return _primoAvvio;
};

const scordaPrimoAvvio = () => { _primoAvvio = null; };

/* Le due che rispondono senza sessione, e ognuna ha il suo perche':
   · `health`    — l'installer la interroga per dire se l'installazione e'
                   riuscita, e succede prima che esista un PIN.
   · `app-info`  — stessa ragione, ed e' la prima diagnosi di ogni guaio.
   Sotto `app.use('/api', ...)` il percorso arriva SENZA `/api`. */
const SENZA_SESSIONE = new Set(['/health', '/app-info']);

const chiSei = (req) => {
  if (TOKEN_MACCHINA) {
    const t = req.get('X-Pathfinder-Token');
    /* Confronto a tempo costante: e' una stringa che vale quanto una
       password, e costa due righe. */
    if (t && t.length === TOKEN_MACCHINA.length
          && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN_MACCHINA))) {
      return { macchina: true, initials: 'SERVIZIO' };
    }
  }
  const token = leggiCookie(req, NOME_COOKIE);
  if (!token) return null;
  const s = sessioni.get(token);
  if (!s) return null;
  s.ultimoUso = Date.now();
  return s;
};

app.use('/api', async (req, res, avanti) => {
  try {
    if (SENZA_SESSIONE.has(req.path) || req.path.startsWith('/auth/')) return avanti();

    const chi = chiSei(req);
    if (chi) { req.operatore = chi; return avanti(); }

    if (await finestraDiPrimoAvvio()) { req.operatore = { primoAvvio: true }; return avanti(); }

    /* 401 e non 403: la differenza non e' formale — il client la legge per
       decidere se riaprire la maschera dell'identificazione invece di dire
       che qualcosa non va. */
    res.status(401).json({ error: 'Sessione non valida: identificarsi.', sessione: false });
  } catch (err) {
    console.error('[pathfinder] guardiano:', err.message);
    res.status(500).json({ error: 'errore interno' });
  }
});

app.get('/api/health', wrap(async (req, res) => {
  res.json({ ok: true, service: 'pathfinder', version: VERSION,
             collections: NAMES, ...(await db.stats()) });
}));

app.get('/api/load', wrap(async (req, res) => {
  const from = req.query.movLogFrom != null && req.query.movLogFrom !== ''
    ? Number(req.query.movLogFrom) : null;
  const tutto = await db.loadAll({ movLogFrom: from });
  if (tutto.operators) tutto.operators = nascondiPin('operators', tutto.operators);
  res.json(tutto);
}));

app.get('/api/c/:col/query', wrap(async (req, res) => {
  const { col } = req.params;
  res.json(nascondiPin(col, await db.query(col, {
    criteria: parseCriteria(req.query.criteria),
    limit: req.query.limit != null && req.query.limit !== '' ? Number(req.query.limit) : null,
    offset: req.query.offset ? Number(req.query.offset) : 0,
    reverse: req.query.reverse === 'true',
    orderBy: req.query.orderBy || null
  })));
}));

app.get('/api/c/:col/count', wrap(async (req, res) => {
  res.json({ count: await db.count(req.params.col, parseCriteria(req.query.criteria)) });
}));

app.get('/api/c/:col/:key', wrap(async (req, res) => {
  const rec = await db.get(req.params.col, req.params.key);
  if (!rec) return res.status(404).json({ error: 'non trovato' });
  res.json(nascondiPin(req.params.col, rec));
}));

app.get('/api/c/:col', wrap(async (req, res) =>
  res.json(nascondiPin(req.params.col, await db.all(req.params.col)))));

app.post('/api/c/:col/bulk', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  const mode = req.query.mode === 'put' ? 'bulkPut' : 'bulkAdd';
  const records = req.body;
  if (!Array.isArray(records)) throw Object.assign(new Error('atteso un elenco di record'), { status: 400 });
  res.json({ keys: db[mode](req.params.col, records, originOf(req)) });
}));

app.post('/api/c/:col', wrap(async (req, res) => {
  /* 2.11 — scrivere un operatore puo' chiudere la finestra di primo avvio:
     la risposta tenuta da parte si butta, e la prossima richiesta la rifa'. */
  if (req.params.col === 'operators') scordaPrimoAvvio();
  res.json({ key: await db.add(req.params.col, req.body, originOf(req)) });
}));

app.put('/api/c/:col/:key', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  const rec = { ...req.body };
  res.json({ key: await db.put(req.params.col, rec, originOf(req)) });
}));

app.patch('/api/c/:col/:key', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  res.json({ changed: await db.update(req.params.col, req.params.key, req.body, originOf(req)) });
}));

app.delete('/api/c/:col/:key', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  res.json({ deleted: await db.delete(req.params.col, req.params.key, originOf(req)) });
}));

app.delete('/api/c/:col', wrap(async (req, res) => {
  if (req.params.col === 'operators') scordaPrimoAvvio();
  res.json({ deleted: await db.clear(req.params.col, originOf(req)) });
}));

app.post('/api/deleteWhere/:col', wrap(async (req, res) => {
  res.json({ deleted: await db.deleteWhere(req.params.col, req.body, originOf(req)) });
}));

app.post('/api/clear', wrap(async (req, res) => {
  scordaPrimoAvvio();
  const cols = req.body?.collections;
  if (!Array.isArray(cols)) throw Object.assign(new Error('atteso { collections: [...] }'), { status: 400 });
  await db.clearMany(cols, originOf(req));
  res.json({ ok: true });
}));

app.post('/api/tx', wrap(async (req, res) => {
  /* 2.11 — una transazione tocca quel che vuole: la risposta tenuta da parte
     si butta senza guardare. Costa una lettura la prossima volta; tenersela
     per prudenza vorrebbe dire lasciare aperta una porta che dovrebbe essersi
     chiusa. */
  scordaPrimoAvvio();
  const { collections = [], ops = [] } = req.body || {};
  if (!Array.isArray(ops)) throw Object.assign(new Error('atteso { ops: [...] }'), { status: 400 });
  const results = [];
  await db.transaction(collections.length ? collections : NAMES, async () => {
    for (const o of ops) {
      switch (o.op) {
        case 'add':         results.push(await db.add(o.collection, o.record)); break;
        case 'put':         results.push(await db.put(o.collection, o.record)); break;
        case 'update':      results.push(await db.update(o.collection, o.key, o.changes)); break;
        case 'delete':      results.push(await db.delete(o.collection, o.key)); break;
        case 'bulkAdd':     results.push(await db.bulkAdd(o.collection, o.records)); break;
        case 'bulkPut':     results.push(await db.bulkPut(o.collection, o.records)); break;
        case 'clear':       results.push(await db.clear(o.collection)); break;
        case 'clearMany':   await db.clearMany(o.collections); results.push(true); break;
        case 'deleteWhere': results.push(await db.deleteWhere(o.collection, o.criteria)); break;
        default: throw Object.assign(new Error(`operazione sconosciuta: ${o.op}`), { status: 400 });
      }
    }
  }, originOf(req));
  res.json({ ok: true, results });
}));

app.post('/api/op/removeItem', wrap(async (req, res) => {
  const { location_code, item_key, qty, qty_uom, qty_uom_before, packs_out, packs_before } = req.body || {};
  const n = Number(qty);
  assertPacksOut(packs_out);
  /* 1.8 — con l'elenco la quantita' in colli e' una conseguenza, e puo' essere
     zero: un prelievo che apre un collo senza svuotarlo non toglie colli. */
  if (!location_code || !item_key || (packs_out === undefined && (!Number.isFinite(n) || n < 1)))
    throw Object.assign(new Error('servono location_code, item_key e una quantita\' valida'), { status: 400 });

  const out = await db.transaction(['inventory'], async () => {
    const rows = await db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
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
      await db.delete('inventory', item._id);
      return { ...snapshot, _mode: 'full', _qty_before: have, _qty_delta: -usciti, _qty_after: 0, ...conti };
    }
    item.qty = after;
    if (um !== null) item.qty_uom = um.dopo;
    if (colli) item.packs = colli.rimasti;
    item.last_updated_at = Date.now();
    await db.put('inventory', item);
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
app.post('/api/op/sampleItem', wrap(async (req, res) => {
  const { location_code, item_key, qty_uom, qty_uom_before, packs_out } = req.body || {};
  const n = arrotondaUom(qty_uom);

  /* 1.8.4 — DA QUALE COLLO ESCE IL CAMPIONE.
     Fino alla 1.8.3 questa rotta scalava `qty_uom` e lasciava `packs` com'era.
     Su una riga a colli dichiarati l'elenco continuava a sommare il totale di
     prima, e siccome dove c'e' l'elenco COMANDA l'elenco, il campione spariva
     alla lettura dopo: cinquanta grammi usciti dal magazzino e nessuno che se
     ne accorgesse. E' la forma dell'incoerenza vista al banco il 18/08 —
     colli per 101 e qty_uom 81.

     Un campione esce da UN collo, quello che l'operatore ha in mano, e la sua
     misura fa parte della richiesta come per ogni altra uscita. */
  const campione = packs_out === undefined ? null : leggiUscite(packs_out);
  if (packs_out !== undefined && (!campione || campione.length !== 1)) {
    throw Object.assign(new Error('un campione esce da un collo solo: serve una misura sola'), { status: 400 });
  }
  if (!location_code || !item_key || (!campione && (n === null || n <= 0)))
    throw Object.assign(new Error('servono location_code, item_key e una quantita\' di campione valida'), { status: 400 });

  const out = await db.transaction(['inventory'], async () => {
    const rows = await db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rows.find(r => r.item_key === item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });

    if (campione) {
      const elenco = leggiPacks(item.packs);
      if (!elenco) throw Object.assign(new Error(`${item_key}: la riga non porta l'elenco dei colli`), { status: 409 });
      const { da, q } = campione[0];
      const i = elenco.findIndex(v => v === da);
      if (i === -1) {
        throw Object.assign(new Error(`Il collo da ${da} non e' piu' su questa riga: il campione non puo' uscirne`), { status: 409 });
      }
      /* UN CAMPIONE VALE UN COLLO DI RESIDUO: svuotare un collo non e'
         campionare, e' prelevarlo. Questa rotta promette che i colli non
         calano, e una promessa con un'eccezione non e' una promessa. */
      if (q >= da) {
        throw Object.assign(new Error(`Un campione lascia sempre un residuo: per prendere tutto il collo da ${da} serve un prelievo`), { status: 409 });
      }
      const dopoElenco = elenco.slice();
      dopoElenco[i] = arrotondaUom(da - q);
      const primaUm = sommaPacks(elenco);
      const dopoUm = sommaPacks(dopoElenco);
      item.packs = dopoElenco;
      item.qty_uom = dopoUm;
      item.last_updated_at = Date.now();
      await db.put('inventory', item);
      return { ok: true, qty_uom_before: primaUm, qty_uom_after: dopoUm, qty_uom_delta: -q,
               qty: item.qty, packs: dopoElenco };
    }

    const prima = arrotondaUom(item.qty_uom) ?? arrotondaUom(qty_uom_before);
    if (prima === null)
      throw Object.assign(new Error(`${item_key}: nessuna quantita' in UM da cui prelevare il campione`), { status: 409 });
    if (n > prima)
      throw Object.assign(new Error(`Restano ${prima} UM: un campione da ${n} non ci sta`), { status: 409 });

    const dopo = arrotondaUom(prima - n);
    item.qty_uom = dopo;
    item.last_updated_at = Date.now();
    await db.put('inventory', item);
    /* `qty` non compare in questo oggetto, ed e' il punto: il collo resta. */
    return { ok: true, qty_uom_before: prima, qty_uom_after: dopo, qty_uom_delta: -n, qty: item.qty };
  }, originOf(req));

  res.json(out);
}));

/* 1.12 — L'UNITA' DI CARICO SI SPOSTA INTERA, IN UNA TRANSAZIONE SOLA.
   Un pallet che si muove porta con se' tutto quello che ha sopra: se le righe
   si riscrivessero una per una dal client, un errore a meta' lascerebbe
   mezza UDC in un vano e mezza nell'altro — e nessuno saprebbe quale meta'.
   Qui la riga dell'UDC e le righe di giacenza cambiano ubicazione insieme, o
   non cambia niente.

   IL CONTENUTO NON SI TOCCA: colli, quantita' ed elenco restano quelli. Uno
   spostamento non e' un prelievo, ed e' la ragione per cui questa rotta non
   ha ne' `qty` ne' `packs_out`.

   L'ubicazione di partenza NON e' un parametro: e' quella scritta sull'UDC.
   Chiederla al client vorrebbe dire fidarsi di due dati che possono
   divergere, e sceglierne uno a caso quando divergono. */
app.post('/api/op/moveUdc', wrap(async (req, res) => {
  const { udc_id, to, movement } = req.body || {};
  if (!udc_id || !to)
    throw Object.assign(new Error('servono udc_id e l\'ubicazione di destinazione'), { status: 400 });

  const out = await db.transaction(['udc', 'inventory', 'mov_log', 'meta'], async () => {
    const udc = await db.get('udc', udc_id);
    if (!udc) throw Object.assign(new Error(`${udc_id} non esiste`), { status: 404 });
    if (udc.status === 'shipped' || udc.status === 'empty')
      throw Object.assign(new Error(`${udc_id} e' ${udc.status}: non si sposta piu'`), { status: 409 });
    const da = udc.location_code || '';
    if (da === to)
      throw Object.assign(new Error(`${udc_id} e' gia' in ${to}`), { status: 409 });

    /* Le righe si prendono per `udc_id`, non per ubicazione: se una riga
       fosse rimasta indietro da uno spostamento non riuscito, e' proprio
       quella che deve raggiungere le altre. */
    const righe = await db.query('inventory', { criteria: { field: 'udc_id', op: 'equals', value: udc_id } });

    /* DUE RIGHE CON LA STESSA CHIAVE NELLO STESSO VANO NON DEVONO NASCERE.
       L'indice [location_code+item_key] e' di ricerca, non unico: il
       database accetterebbe il doppione senza dire niente, e il client, che
       cerca con `find`, ne leggerebbe UNA — quale, dipende dall'ordine di
       caricamento. Sarebbe un saldo che cambia da solo.

       Non si fondono: unire una riga che sta su un pallet con una che sta
       sciolta nel vano vuol dire decidere al posto di chi lavora se quella
       merce sale sul pallet. Si rifiuta e si dice quale lotto e' di mezzo —
       chi ha la merce davanti sposta prima l'altra riga, o carica anche
       quella sull'unita'. Trovato al banco il 19/08, alla prima prova. */
    const gia = await db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: to } });
    const nostre = new Set(righe.map(r => r._id));
    const scontro = gia.filter(r => !nostre.has(r._id) && righe.some(n => n.item_key === r.item_key));
    if (scontro.length) {
      const quali = [...new Set(scontro.map(r => r.item_key))].join(', ');
      throw Object.assign(
        new Error(`In ${to} c'e' gia' ${quali} fuori da questa unita': spostare quella riga prima, o caricarla sull'unita'`),
        { status: 409 });
    }
    const ora = Date.now();
    for (const r of righe) {
      r.location_code = to;
      /* `last_updated_at`, NON `updated_at` — vale per TUTTE le rotte che
         scrivono una giacenza, non solo per questa. Il campo della riga di
         giacenza si chiama `last_updated_at`: e' quello che `Giacenza`
         dichiara e quello che il client legge. Fino alla 2.1 `removeItem`,
         `sampleItem` e `commitPickStop` scrivevano `updated_at`, che nessuno
         legge: la riga tornava giusta perche' il client si riallinea sulla
         risposta del servizio, e intanto a database restava un secondo campo
         con una seconda data. Tredici righe della produzione se lo portano
         ancora dietro: le ripulisce `banco/campo-fantasma.cjs`, che si passa
         una volta sola e non e' codice dell'applicativo.
         `udc.updated_at`, qui sotto, e' un'altra entita' e un altro campo:
         quello e' il suo nome vero. */
      r.last_updated_at = ora;
      await db.put('inventory', r);
    }

    udc.location_code = to;
    udc.updated_at = ora;
    await db.put('udc', udc);

    if (movement) await db.add('mov_log', { ...movement, ts: movement.ts || ora });
    return { ok: true, udc_id, from: da, to, righe: righe.length };
  }, originOf(req));

  res.json(out);
}));

app.post('/api/op/commitPickStop', wrap(async (req, res) => {
  const { location_code, item_key, qty, qty_uom, qty_uom_before, packs_out, packs_before, movement, session } = req.body || {};
  const n = Number(qty);
  assertPacksOut(packs_out);
  if (!location_code || !item_key || !session?.session_id
      || (packs_out === undefined && (!Number.isFinite(n) || n < 1)))
    throw Object.assign(new Error('parametri incompleti'), { status: 400 });

  const out = await db.transaction(['inventory', 'mov_log', 'pick_session', 'meta'], async () => {
    const rows = await db.query('inventory', { criteria: { field: 'location_code', op: 'equals', value: location_code } });
    const item = rows.find(r => r.item_key === item_key);
    if (!item) throw Object.assign(new Error(`${item_key} non e' piu' in ${location_code}`), { status: 409 });
    const colli = uscitaColli(item, packs_out, packs_before);
    const have = colli ? colli.qtyBefore : (item.qty || 1);
    const usciti = colli ? colli.qtyBefore - colli.qtyAfter : n;
    if (!colli && n > have)
      throw Object.assign(new Error(`In ${location_code} restano ${have} colli`), { status: 409 });

    const after = have - usciti;
    const um = colli ? colli.um : scalaUom(item, qty_uom, qty_uom_before, after <= 0);
    if (colli ? colli.tutto : after <= 0) await db.delete('inventory', item._id);
    else {
      item.qty = after;
      if (um !== null) item.qty_uom = um.dopo;
      if (colli) item.packs = colli.rimasti;
      item.last_updated_at = Date.now();
      await db.put('inventory', item);
    }

    /* Il movimento porta il delta in UM insieme a quello in colli: il
       registro e' la sola cosa che, fra sei anni, dira' quanto e' uscito. */
    const mov = { ...movement, ts: movement?.ts || Date.now(),
                  qty_before: have, qty_delta: -usciti, qty_after: after,
                  ...(um === null ? {} : { qty_uom_delta: um.delta }) };
    const movId = await db.add('mov_log', mov);

    await db.put('pick_session', session);
    await db.put('meta', { key: 'lastModified', value: Date.now() });

    return { removed: { ...item, _mode: (colli ? colli.tutto : after <= 0) ? 'full' : 'partial',
                        _qty_before: have, _qty_delta: -usciti, _qty_after: after,
                        ...(um === null ? {}
                          : { _qty_uom_before: um.prima, _qty_uom_delta: um.delta, _qty_uom_after: um.dopo }) },
             movement_id: movId };
  }, originOf(req));

  res.json(out);
}));

/* ── 2.10 · UN PIN DI SEI CIFRE MERITA UN CONTO LENTO ─────────────────────
   SHA-256 e' fatto per essere veloce, ed e' il difetto: un milione di
   combinazioni — tutte quelle che sei cifre possono fare — cadono in meno di
   due secondi su una CPU sola. Misurato su questo codice: 204 ms.

   `scrypt` costa memoria e tempo a ogni singolo tentativo, per costruzione.
   Con i parametri qui sotto un tentativo sta intorno ai 50-100 ms, che per
   chi digita il PIN non si vede, e porta lo spazio intero da due secondi a
   una giornata di macchina.

   SI RESTA COMPATIBILI. Le impronte gia' scritte sono SHA-256, e nessuno
   conosce i PIN per riscriverle: il record dice con quale algoritmo e' stato
   fatto, `pin_algo`, e quando manca vuol dire `sha256` — cioe' tutto quello
   che c'era prima di questa versione. Al primo accesso riuscito l'impronta
   si riscrive in scrypt, e da li' in poi il record e' nuovo. Non c'e' una
   migrazione da lanciare: il PIN lo sa solo chi lo digita, e il momento in
   cui lo digita e' l'unico in cui si puo' ricalcolare.

   IL CLIENT NON SEGUE. Nel modo «da file» il database sta in IndexedDB e la
   verifica avviene nel browser, dove `crypto.subtle` non ha scrypt: quel
   modo resta a SHA-256, e la sua superficie e' un'altra — un browser solo,
   su una macchina sola, senza una rete da cui leggere le impronte. */
const SCRYPT = { N: 16384, r: 8, p: 1, lunghezza: 32 };

const hashPin = (pin, salt) =>
  crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');

const hashPinScrypt = (pin, salt) =>
  crypto.scryptSync(String(pin), String(salt), SCRYPT.lunghezza,
                    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');

/* L'algoritmo lo dichiara il record. Assente = com'era prima. */
const impronta = (pin, salt, algo) =>
  (algo === 'scrypt' ? hashPinScrypt(pin, salt) : hashPin(pin, salt));

const campiPin = (pin) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return { pin_salt: salt, pin_hash: hashPinScrypt(pin, salt),
           pin_algo: 'scrypt', pin_set_at: Date.now() };
};

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


/* ══ 2.11 · LA PORTA ══════════════════════════════════════════════════════ */

/* CHI SONO, SE SONO QUALCUNO. E' la prima domanda che il client fa: da qui
   decide se aprire la maschera dell'identificazione o andare a caricare. */
app.get('/api/auth/stato', wrap(async (req, res) => {
  const chi = chiSei(req);
  res.json({
    sessione: Boolean(chi),
    operatore: chi && !chi.macchina ? { op_id: chi.op_id, initials: chi.initials } : null,
    macchina: Boolean(chi?.macchina),
    primoAvvio: await finestraDiPrimoAvvio(),
  });
}));

/* L'ELENCO PER LA SCHERMATA DI IDENTIFICAZIONE, e nient'altro.
   Questa risponde SENZA sessione, e allora dice il minimo che serve a
   disegnare quella schermata: chi c'e', come si chiama, che carica ha, se un
   PIN ce l'ha. Non passa da `/api/c/operators`, che adesso e' chiusa, e non
   e' un rimpiazzo: da qui non escono le date, le note, ne' i campi che una
   riga di operatore porta e che a quella maschera non servono. */
app.get('/api/auth/operatori', wrap(async (req, res) => {
  const ops = await db.all('operators');
  res.json(ops
    .filter((o) => o.active !== false)
    .map((o) => ({
      op_id: o.op_id,
      initials: o.initials,
      first_name: o.first_name || '',
      last_name: o.last_name || '',
      role: o.role || 'operator',
      pin_set: Boolean(o.pin_hash && o.pin_salt),
    })));
}));

/* IL PIN EMETTE LA SESSIONE. Il freno sui tentativi e' lo stesso di
   `verifyPin` — cinque e poi un minuto di attesa — e vale per operatore. */
app.post('/api/auth/login', wrap(async (req, res) => {
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
  if (op_id) op = await db.get('operators', op_id);
  else {
    const righe = await db.query('operators', { criteria: { field: 'initials', op: 'equals', value: String(initials).toUpperCase() } });
    op = righe[0] || null;
  }

  if (!op || !op.pin_hash || !op.pin_salt || op.active === false) {
    frenoSegna(chiave, false);
    return res.status(401).json({ ok: false, error: 'Operatore o PIN non validi' });
  }

  const buono = equal(impronta(String(pin), op.pin_salt, op.pin_algo), op.pin_hash);
  frenoSegna(chiave, buono);
  if (!buono) return res.status(401).json({ ok: false, error: 'Operatore o PIN non validi' });

  /* L'impronta vecchia si rifa' qui, come in `verifyPin`: e' l'unico istante
     in cui il PIN esiste in chiaro dentro il servizio — 2.10. */
  if (op.pin_algo !== 'scrypt') {
    try {
      const sale = crypto.randomBytes(16).toString('hex');
      await db.update('operators', op.op_id, {
        pin_salt: sale, pin_hash: hashPinScrypt(String(pin), sale),
        pin_algo: 'scrypt', updated_at: Date.now(),
      });
    } catch (err) {
      console.error('[pathfinder] impronta del PIN non rinnovata:', err.message);
    }
  }

  /* 32 byte di casualita' vera. Non deriva dal PIN, dalla sigla o dall'ora:
     un token che si puo' indovinare e' una porta che si puo' aprire. */
  const token = crypto.randomBytes(32).toString('hex');
  const adesso = Date.now();
  sessioni.set(token, { op_id: op.op_id, initials: op.initials, creata: adesso, ultimoUso: adesso });
  scriviCookie(res, token);

  res.json({ ok: true, operatore: senzaPin(op) });
}));

/* CHI SMONTA CHIUDE LA SUA SESSIONE, e non aspetta il riavvio del servizio.
   Risponde `ok` anche se non c'era niente da chiudere: «esci» e' un gesto
   che non puo' fallire. */
app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = leggiCookie(req, NOME_COOKIE);
  if (token) sessioni.delete(token);
  cancellaCookie(res);
  res.json({ ok: true });
}));

app.post('/api/op/verifyPin', wrap(async (req, res) => {
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
  if (op_id) op = await db.get('operators', op_id);
  else {
    const rows = await db.query('operators', { criteria: { field: 'initials', op: 'equals', value: String(initials).toUpperCase() } });
    op = rows[0] || null;
  }

  if (!op || !op.pin_hash || !op.pin_salt) {
    frenoSegna(chiave, false);
    return res.json({ ok: false, reason: 'operatore senza PIN impostato' });
  }

  const ok = equal(impronta(String(pin), op.pin_salt, op.pin_algo), op.pin_hash);
  frenoSegna(chiave, ok);

  /* L'IMPRONTA VECCHIA SI RIFA' QUI, e non altrove: e' l'unico istante in cui
     il PIN esiste in chiaro dentro il servizio. Se la riscrittura fallisce si
     tace e si risponde lo stesso — chi sta entrando in magazzino non deve
     sapere che una migrazione non e' andata, e al prossimo accesso ci si
     riprova. */
  if (ok && op.pin_algo !== 'scrypt') {
    try {
      const salt = crypto.randomBytes(16).toString('hex');
      await db.update('operators', op.op_id, {
        pin_salt: salt,
        pin_hash: hashPinScrypt(String(pin), salt),
        pin_algo: 'scrypt',
        updated_at: Date.now(),
      });
    } catch (err) {
      console.error('[pathfinder] impronta del PIN non rinnovata:', err.message);
    }
  }

  res.json({ ok });
}));

app.post('/api/op/hashPin', wrap(async (req, res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{6}$/.test(pin))
    throw Object.assign(new Error('serve un PIN di sei cifre'), { status: 400 });
  res.json(campiPin(pin));
}));

app.get('/api/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const me = req.query.client || null;
  res.write(`event: hello\ndata: ${JSON.stringify({ rev: await db.currentRevision(), version: VERSION })}\n\n`);

  const off = db.onChange((ev) => {
    if (me && ev.origin && ev.origin === me) return;   // non ci si avvisa da soli
    res.write(`event: change\ndata: ${JSON.stringify(ev)}\n\n`);
  });

  const beat = setInterval(() => { try { res.write(': beat\n\n'); } catch {} }, 20000);
  req.on('close', () => { off(); clearInterval(beat); });
});

/* IL BACKUP SI CHIAMA COL GIORNO DI CHI LO GUARDA, NON COL GIORNO UTC — 2.6.

   `toISOString()` scrive in UTC. Alle 01:52 del 26/08, ora di Roma, sono le
   23:52 del 25 in UTC: il file nasceva `pathfinder-2026-08-25.db`, cioe' con
   LO STESSO NOME del backup serale delle 20:00 — e glielo scriveva sopra.
   Il caso non e' di scuola: la copia che si prende prima di installare si
   prende a fine turno, ed e' esattamente la copia che serve se qualcosa va
   storto. Misurato il 26/08 prendendo una copia a mano.

   Il giorno e' quello locale, perche' «il backup del 25» per chi lavora e'
   quello di quel turno; e se un file con quel nome c'e' gia' si aggiunge
   l'ora, invece di sostituirlo. Un backup che ne cancella un altro non e'
   un backup. */
const nomeBackup = (dir, est, ora = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  const giorno = `${ora.getFullYear()}-${p(ora.getMonth() + 1)}-${p(ora.getDate())}`;
  const primo = path.join(dir, `pathfinder-${giorno}${est}`);
  if (!fs.existsSync(primo)) return primo;
  return path.join(dir, `pathfinder-${giorno}-${p(ora.getHours())}${p(ora.getMinutes())}${est}`);
};

/* ── 2.10 · DOVE PUO' FINIRE UN BACKUP ────────────────────────────────────
   `dir` arriva dal corpo della richiesta, e finche' nessuno l'ha guardata
   arrivava DAVUNQUE: una richiesta sola scriveva l'intero database in un
   percorso a scelta di chi chiamava. Il processo gira come SYSTEM, e un
   percorso di rete — una condivisione su un'altra macchina — faceva uscire
   anagrafica, movimenti e operatori dall'azienda con un `curl`.

   NON SI STRINGE A UNA CARTELLA SOLA. Il backup serale scrive nella cartella
   di backup dell'installazione, l'installer mette da parte il database prima
   di aggiornare, i collaudi scrivono in una cartella temporanea e il banco
   nella propria: erano tutti legittimi, e una radice sola li avrebbe rotti
   tutti e quattro. Si vietano invece le tre forme che nessun chiamante
   legittimo usa:

   1. I PERCORSI DI RETE — UNC e barre doppie. E' la via dell'esfiltrazione,
      e nessuno fa un backup su un'altra macchina passando da questa rotta.
   2. LE CARTELLE DI SISTEMA di Windows, dove un file scritto da SYSTEM e' un
      problema piu' grosso di un backup fuori posto.
   3. UN PERCORSO RELATIVO, che si risolverebbe sulla cartella di lavoro del
      servizio — che nessuno sa quale sia, ed e' gia' costata una versione.

   `PATHFINDER_BACKUP_ROOTS` stringe ancora, quando c'e': solo dentro quelle
   radici, separate da `;`. L'installazione la imposta, il banco no, e chi non
   la imposta resta con le tre regole qui sopra. */
const RADICI_BACKUP = (process.env.PATHFINDER_BACKUP_ROOTS || '')
  .split(';').map((s) => s.trim()).filter(Boolean).map((s) => path.resolve(s));

const CARTELLE_DI_SISTEMA = [
  process.env.SystemRoot || 'C:\\Windows',
  process.env.ProgramFiles || 'C:\\Program Files',
  process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
].map((s) => path.resolve(s));

/* `path.relative` risponde con un percorso che risale — `..` — quando il
   figlio sta fuori. E' il modo di chiederlo che regge anche i `..` scritti
   nel mezzo, che un confronto di stringhe si lascerebbe sfuggire. */
const dentro = (figlio, padre) => {
  const r = path.relative(padre, figlio);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

const controllaCartellaBackup = (dir) => {
  const grezzo = String(dir);
  const rifiuta = (m) => { throw Object.assign(new Error(m), { status: 400 }); };

  if (grezzo.startsWith('\\\\') || grezzo.startsWith('//'))
    rifiuta('Un backup non si scrive su un percorso di rete.');
  if (!path.isAbsolute(grezzo))
    rifiuta('La cartella di backup deve essere un percorso assoluto.');

  /* SU WINDOWS «ASSOLUTO» NON VUOL DIRE «SO SU CHE DISCO».
     `\qualcosa` passa `path.isAbsolute` — e' assoluto rispetto alla RADICE
     DEL DISCO CORRENTE, che e' quello della cartella di lavoro del processo:
     un dato che nessuno sa e che cambia col modo in cui il servizio e' stato
     lanciato. Trovato verificando la consegna della 2.10, e trovato per
     sbaglio: una prova scritta male ha inviato `\altra-macchinacondivisione`
     al posto del percorso di rete che voleva provare, il controllo di sopra
     non e' scattato — giustamente, quello non e' UNC — e il servizio ha
     scritto 393 kB di database nella RADICE DI `C:`.

     E' la stessa ambiguita' della terza regola qui sopra, in un vestito che
     la prima stesura non aveva riconosciuto: si pretende la lettera. */
  if (path.sep === '\\' && !/^[A-Za-z]:[\\/]/.test(grezzo))
    rifiuta('La cartella di backup deve dire su quale disco sta, per esempio C:\\Pathfinder\\backup.');

  const pieno = path.resolve(grezzo);
  for (const v of CARTELLE_DI_SISTEMA) {
    if (dentro(pieno, v)) rifiuta(`Un backup non si scrive dentro ${v}.`);
  }
  if (RADICI_BACKUP.length && !RADICI_BACKUP.some((r) => dentro(pieno, r)))
    rifiuta(`Cartella fuori dalle radici consentite: ${RADICI_BACKUP.join(' ; ')}`);

  return pieno;
};


app.post('/api/backup', wrap(async (req, res) => {
  const dir = controllaCartellaBackup(req.body?.dir || path.join(__dirname, 'data', 'backup'));
  fs.mkdirSync(dir, { recursive: true });
  /* L'ESTENSIONE LA DICE IL DRIVER, non questa rotta.
     Su SQLite la copia e' un `.db`; su PostgreSQL e' un `.dump` scritto da
     `pg_dump`. Chi chiama — `backup-serale.ps1` — non deve sapere quale dei
     due c'e' dietro: legge il nome dalla risposta, e ci scrive la riga di
     registro senza guardare l'estensione. */
  const dest = nomeBackup(dir, db.estensioneBackup);
  /* `await`, non `.then`: cosi' l'errore passa da `wrap`, che rispetta lo
     stato dichiarato dall'eccezione. */
  await db.backupTo(dest);
  res.json({ ok: true, file: dest, bytes: fs.statSync(dest).size });
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

app.get('/api/app-info', wrap(async (req, res) => {
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

const server = srv;

/* Quel che il servizio stampa quando e' in piedi. Era il corpo della
   richiamata di `listen`; dalla 2.6 e' una funzione, perche' legge la
   revisione dal database e quella lettura adesso e' asincrona. */
async function annuncia() {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`\n  Pathfinder ${VERSION} — servizio dati`);
  console.log(`  database    ${db.descrizione}`);
  console.log(`  applicativo ${schema}://localhost:${PORT}/`);
  for (const ip of lan) console.log(`  in rete     ${schema}://${ip}:${PORT}/`);
  if (schema === 'http') console.log('  ATTENZIONE  senza certificato il PIN viaggia in chiaro');
  /* 2.10 — LE DUE RIGHE CHE DESCRIVONO LA SUPERFICIE. Chi legge questo
     annuncio deve sapere a chi sta rispondendo il servizio: le rotte `/api`
     non chiedono credenziali, e finche' e' cosi' «da chi e' raggiungibile»
     e' l'unica difesa che c'e'. */
  console.log(`  ascolta su  ${HOST || 'tutte le interfacce'}`);

  /* 2.11 — CHI PUO' ENTRARE, detto all'avvio. Dalla 2.11 le rotte `/api`
     vogliono una sessione, e le due righe che seguono sono l'unico posto in
     cui si legge se quella regola e' davvero in vigore su questa macchina. */
  if (await finestraDiPrimoAvvio()) {
    console.log('  accesso     APERTO — nessun operatore ha un PIN, e il primo va pur creato');
    console.log('              la finestra si chiude da sola appena il primo PIN esiste');
  } else {
    console.log(`  accesso     chiuso: serve una sessione${TOKEN_MACCHINA ? ' (token di macchina impostato)' : ''}`);
    if (!TOKEN_MACCHINA)
      console.log('              PATHFINDER_TOKEN non impostata: backup e installer non hanno chiave');
  }
  if (schema === 'http')
    console.log('              senza TLS il cookie di sessione viaggia in chiaro, come il PIN');
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
  console.log(`  revisione   ${await db.currentRevision()}\n`);
}

const shutdown = (sig) => {
  console.log(`\n  ${sig}: chiusura ordinata…`);
  server.close(async () => {
    try { if (db) await db.close(); } catch { /* si sta chiudendo comunque */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/* SI APRE IL DATABASE, POI SI ASCOLTA — e non il contrario.
   Un terminale che riceve un 500 perche' il servizio non ha ancora un
   database e' peggio di un terminale che aspetta due secondi. Se il
   database non si apre affatto, il servizio non parte: partire senza vuol
   dire ventiquattro rotte che rispondono «db is null» a un magazzino che
   crede di stare lavorando. */
const pronto = (async () => {
  try {
    db = await apriDatabase({ file: DB_FILE });
  } catch (err) {
    console.error(`
  Il database non si apre: ${err.message}
`);
    process.exit(1);
  }
  await new Promise((ok) => {
    if (HOST) srv.listen(PORT, HOST, () => ok(undefined));
    else srv.listen(PORT, () => ok(undefined));
  });
  await annuncia();
  return db;
})();

module.exports = { app, server, pronto, get db() { return db; } };
