'use strict';

/* LE REGOLE DELL'AUDIT PRE-MIGRAZIONE — 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   PURO: non apre database e non stampa niente. Il lanciatore e'
   `audit-sqlite.js`, le prove stanno in `test/auditMigrazione.test.js`.

   PERCHE' ESISTE. SQLite non ha tipi: una colonna dichiarata INTEGER accetta
   la stringa 'ciao', e un TEXT accetta il byte zero. PostgreSQL non accetta
   ne' l'uno ne' l'altro, e se ne accorge a meta' migrazione — con dieci
   tavoli gia' scritti. Quello che qui si chiama «ostacolo» e' esattamente
   questo: un valore che sta a SQLite e non entra in Postgres. */

const { COLLECTIONS } = require('../lib/schema');

/* Il limite di `BIGINT`. Le colonne numeriche materializzate diventano
   BIGINT, e un epoch in millisecondi ci sta comodo — ma un numero arrivato
   da un foglio Excel storto no. */
const BIGINT_MIN = -(2n ** 63n);
const BIGINT_MAX = 2n ** 63n - 1n;

/** Le forme che una stringa-data puo' avere in questo database. */
function classificaData(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? 'epoch-ms' : 'epoch-non-intero';
  if (typeof v !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'calendario';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(v)) return 'istante-utc';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?[+-]\d{2}:?\d{2}$/.test(v)) return 'istante-con-scostamento';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'istante-senza-fuso';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return 'giorno-all-italiana';
  if (/^\d{13}$/.test(v)) return 'epoch-ms-come-stringa';
  return null;
}

/* UNA SCADENZA NON E' UN ISTANTE, E NON VA NORMALIZZATA.
   `expiry_date` e' il termine minimo di conservazione di un lotto: e' un
   giorno di calendario stampato su una confezione, non un momento. Darle un
   fuso la sposta — a Roma d'estate di due ore, cioe' di un giorno intero
   quando la scadenza e' a mezzanotte — e un lotto scaduto il 31 comincia a
   risultare scaduto il 30. Resta `YYYY-MM-DD`, e in Postgres e' `DATE`. */
const FORME_SANE = new Set(['epoch-ms', 'calendario', 'istante-utc']);

function dataDaCorreggere(v) {
  const forma = classificaData(v);
  if (forma === null) return null;
  return FORME_SANE.has(forma) ? null : forma;
}

/* ── Gli ostacoli veri: quel che SQLite ingoia e Postgres rifiuta ────── */

/** Il byte zero dentro una stringa. */
function haByteZero(s) {
  return typeof s === 'string' && s.includes('\u0000');
}

/** Un surrogato spaiato: UTF-16 valido, UTF-8 no. Postgres rifiuta. */
function haSurrogatoSpaiato(s) {
  if (typeof s !== 'string') return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/** Sta dentro un BIGINT? */
function staInBigint(n) {
  if (typeof n !== 'number') return true;
  if (!Number.isFinite(n)) return false;
  if (!Number.isInteger(n)) return false;
  const b = BigInt(Math.trunc(n));
  return b >= BIGINT_MIN && b <= BIGINT_MAX;
}

/** Tutti gli ostacoli dentro un valore, percorso compreso. Ricorsivo. */
function ostacoliPostgres(valore, percorso = '') {
  const out = [];
  const visita = (v, p) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach((x, i) => visita(x, `${p}[${i}]`)); return; }
    if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) visita(x, p ? `${p}.${k}` : k); return; }
    if (typeof v === 'string') {
      if (haByteZero(v)) out.push({ percorso: p, tipo: 'byte-zero', gravita: 'blocca' });
      if (haSurrogatoSpaiato(v)) out.push({ percorso: p, tipo: 'surrogato-spaiato', gravita: 'blocca' });
      return;
    }
    if (typeof v === 'number' && !Number.isFinite(v))
      out.push({ percorso: p, tipo: 'numero-non-finito', gravita: 'blocca' });
  };
  visita(valore, percorso);
  return out;
}

/* ── Le colonne materializzate ───────────────────────────────────────── */

/* PERCHE' SI CONFRONTA. La colonna e' una COPIA del campo dentro `data`, e
   una copia puo' restare indietro — la voce 14 della coda di lavoro,
   `updated_at` contro `last_updated_at`, e' esattamente questo. La
   migrazione ricalcola dal documento invece di copiare, quindi una
   divergenza non blocca: cambia in silenzio un valore che qualcuno legge.
   Va vista prima, non dopo. */

/** Come `materialize` scriverebbe questo campo. Stessa regola, isolata. */
function attesa(nome, campo, doc) {
  const col = COLLECTIONS[nome];
  const v = doc[campo];
  if (v === undefined || v === null) return null;
  if ((col.numeric || []).includes(campo)) return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return String(v);
}

/** La colonna letta a database contro quel che il documento dice. */
function divergenza(nome, campo, colonna, doc) {
  const att = attesa(nome, campo, doc);
  /* SQLite restituisce gli INTEGER come number e il resto come string:
     confrontare `1` con `'1'` darebbe un falso allarme a ogni riga. */
  const uguale = att === null ? colonna === null || colonna === undefined
    : typeof att === 'number' ? Number(colonna) === att
    : String(colonna) === att;
  if (uguale) return null;
  return { campo, colonna: colonna === undefined ? null : colonna, documento: att };
}

module.exports = {
  BIGINT_MIN, BIGINT_MAX, FORME_SANE,
  classificaData, dataDaCorreggere,
  haByteZero, haSurrogatoSpaiato, staInBigint, ostacoliPostgres,
  attesa, divergenza,
};
