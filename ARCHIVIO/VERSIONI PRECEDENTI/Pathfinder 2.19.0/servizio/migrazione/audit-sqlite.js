'use strict';

/* L'AUDIT DEI DATI SPORCHI, PRIMA DI MIGRARE — 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   SI LEGGE UNA COPIA, MAI IL DATABASE IN SERVIZIO. Apre in sola lettura e
   non scrive niente da nessuna parte:

     node server/migrazione/audit-sqlite.js --da "banco\\db\\pathfinder-<data>.db"
     node server/migrazione/audit-sqlite.js --da "..." --json > banco\\audit.json

   La copia si chiede al servizio, che la scrive a caldo:

     Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup `
       -ContentType 'application/json' -Body (@{dir="$PWD\\banco\\db"} | ConvertTo-Json)

   ESCE 1 SE TROVA UN OSTACOLO CHE BLOCCA. Un audit che finisce dicendo
   «guarda che c'e' un problema» e poi esce 0 lo legge solo chi legge fino in
   fondo, e chi migra alle sette di sera non legge fino in fondo. Le
   segnalazioni che non bloccano — divergenze, riferimenti pendenti, forme di
   data — escono 0: sono cose da sapere, non da fermarsi. */

const fs = require('node:fs');
const { NAMES, COLLECTIONS } = require('../lib/schema');
const {
  dataDaCorreggere, classificaData, ostacoliPostgres, staInBigint, divergenza,
} = require('./audit');

function argomento(nome, ripiego = null) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : ripiego;
}

function apri(file) {
  if (!file) { console.error('\n  ✗ Manca il database: --da "banco\\db\\pathfinder-<data>.db"\n'); process.exit(1); }
  if (!fs.existsSync(file)) { console.error(`\n  ✗ Il file ${file} non esiste\n`); process.exit(1); }
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(file, { readOnly: true });
  } catch {
    const Database = require('better-sqlite3');
    return new Database(file, { readonly: true });
  }
}

/* I legami che nessun vincolo di integrita' tiene, perche' il documento non
   e' una tabella. Rompendoli non succede niente a SQLite e non succede
   niente a Postgres: succede che il registro delle attivita' nomina un
   movimento che non c'e'. Si guardano qui perche' e' l'unico momento in cui
   qualcuno guarda tutto insieme. */
const LEGAMI = [
  { da: 'tasks', campo: 'mov_ids', elenco: true, a: 'mov_log', chiave: '_id' },
  { da: 'inventory', campo: 'udc_id', a: 'udc', chiave: 'udc_id' },
  { da: 'mov_log', campo: 'user', a: 'operators', chiave: 'initials' },
  { da: 'wip', campo: 'item_key', a: 'inventory', chiave: 'item_key', molle: true },
];

function analizza(db) {
  const rapporto = { collezioni: {}, legami: [], date: {}, blocchi: 0, avvisi: 0 };
  const indici = {};

  for (const nome of NAMES) {
    const col = COLLECTIONS[nome];
    const righe = db.prepare(`SELECT * FROM ${nome}`).all();
    const c = {
      righe: righe.length, jsonRotto: 0, jsonNonOggetto: 0,
      divergenze: {}, ostacoli: [], fuoriBigint: [], chiaviStorte: [],
      nulliInattesi: {}, maiuscoleMiste: [],
    };
    indici[nome] = new Map();

    for (const r of righe) {
      let doc;
      try { doc = JSON.parse(r.data); } catch { c.jsonRotto++; continue; }
      if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) { c.jsonNonOggetto++; continue; }
      doc[col.pk] = r[col.pk];
      indici[nome].set(String(r[col.pk]), doc);

      /* La chiave automatica diventa BIGSERIAL: zero e i negativi non sono
         chiavi che una sequenza possa riprodurre. */
      if (col.pkType === 'auto' && !(Number.isInteger(r[col.pk]) && r[col.pk] > 0))
        c.chiaviStorte.push(r[col.pk]);

      for (const o of ostacoliPostgres(doc, nome)) {
        if (c.ostacoli.length < 20) c.ostacoli.push({ chiave: r[col.pk], ...o });
        rapporto.blocchi++;
      }

      for (const campo of col.indexed) {
        if (campo === col.pk) continue;
        const d = divergenza(nome, campo, r[campo], doc);
        if (d) {
          (c.divergenze[campo] ||= { conta: 0, campione: [] }).conta++;
          if (c.divergenze[campo].campione.length < 3)
            c.divergenze[campo].campione.push({ chiave: r[col.pk], ...d });
          rapporto.avvisi++;
        }
        /* La colonna e' NULL e il documento no: l'indice non trovera' mai
           questa riga, e il filtro dira' «non c'e'» invece di «errore». */
        if ((r[campo] === null || r[campo] === undefined) &&
            doc[campo] !== undefined && doc[campo] !== null && doc[campo] !== '') {
          c.nulliInattesi[campo] = (c.nulliInattesi[campo] || 0) + 1;
          rapporto.avvisi++;
        }
        if ((col.numeric || []).includes(campo) && r[campo] !== null && !staInBigint(Number(r[campo]))) {
          c.fuoriBigint.push({ chiave: r[col.pk], campo, valore: r[campo] });
          rapporto.blocchi++;
        }
      }

      censisciDate(nome, doc, rapporto.date);
    }

    /* LIKE non si comporta uguale nei due database — §5.
       In SQLite `LIKE` ignora le maiuscole sull'ASCII, in PostgreSQL no.
       `startsWith` di `_where` diventa un LIKE, quindi una colonna che porta
       maiuscole e minuscole insieme e' una ricerca che cambia risposta
       cambiando database. Non e' un dato sporco: e' un dato su cui la
       traduzione va scritta apposta. */
    for (const campo of col.indexed) {
      if (campo === col.pk) continue;
      let alte = 0, basse = 0;
      for (const r of righe) {
        const v = r[campo];
        if (typeof v !== 'string' || !v) continue;
        if (v !== v.toLowerCase()) alte++;
        if (v !== v.toUpperCase()) basse++;
      }
      if (alte && basse) c.maiuscoleMiste.push({ campo, conMaiuscole: alte, conMinuscole: basse });
    }

    rapporto.collezioni[nome] = c;
  }

  for (const l of LEGAMI) {
    const bersaglio = new Set();
    for (const [, doc] of indici[l.a] || []) bersaglio.add(String(doc[l.chiave]));
    const rotti = [];
    for (const [k, doc] of indici[l.da] || []) {
      const v = doc[l.campo];
      if (v === undefined || v === null || v === '') continue;
      for (const uno of (l.elenco ? (Array.isArray(v) ? v : [v]) : [v])) {
        if (uno === null || uno === undefined || uno === '') continue;
        if (!bersaglio.has(String(uno))) rotti.push({ chiave: k, valore: uno });
      }
    }
    if (rotti.length) {
      rapporto.legami.push({
        legame: `${l.da}.${l.campo} → ${l.a}.${l.chiave}`,
        rotti: rotti.length, molle: !!l.molle, campione: rotti.slice(0, 5),
      });
      if (!l.molle) rapporto.avvisi += rotti.length;
    }
  }

  return rapporto;
}

const SEMBRA_DATA = /(_at|_date|^ts$|^data_)/i;

function censisciDate(nome, doc, dentro, prefisso = null) {
  const base = prefisso || nome;
  for (const [k, v] of Object.entries(doc)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { censisciDate(nome, v, dentro, `${base}.${k}`); continue; }
    if (!SEMBRA_DATA.test(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    const forma = classificaData(v) || 'FORMA SCONOSCIUTA';
    const chiave = `${base}.${k}`;
    ((dentro[chiave] ||= {})[forma] ||= 0);
    dentro[chiave][forma]++;
    if (dataDaCorreggere(v)) (dentro[chiave].__daCorreggere ||= 0);
  }
}

/* ── Resa ────────────────────────────────────────────────────────────── */

function stampa(r) {
  const b = [];
  b.push('\n  AUDIT PRE-MIGRAZIONE — dati sporchi, date, ostacoli PostgreSQL\n');

  b.push('  COLLEZIONI');
  for (const [nome, c] of Object.entries(r.collezioni)) {
    const note = [];
    if (c.jsonRotto) note.push(`JSON illeggibile: ${c.jsonRotto}`);
    if (c.jsonNonOggetto) note.push(`documento non oggetto: ${c.jsonNonOggetto}`);
    if (c.chiaviStorte.length) note.push(`chiavi non valide per BIGSERIAL: ${c.chiaviStorte.length}`);
    const div = Object.entries(c.divergenze).map(([k, v]) => `${k}×${v.conta}`);
    if (div.length) note.push(`colonna divergente dal documento: ${div.join(' ')}`);
    const nul = Object.entries(c.nulliInattesi).map(([k, v]) => `${k}×${v}`);
    if (nul.length) note.push(`colonna NULL col documento pieno: ${nul.join(' ')}`);
    if (c.ostacoli.length) note.push(`OSTACOLI: ${c.ostacoli.length}`);
    if (c.fuoriBigint.length) note.push(`FUORI BIGINT: ${c.fuoriBigint.length}`);
    b.push(`    ${nome.padEnd(18)} ${String(c.righe).padStart(6)} righe` + (note.length ? `  — ${note.join(' · ')}` : ''));
  }

  const miste = Object.entries(r.collezioni).flatMap(([n, c]) => c.maiuscoleMiste.map(m => ({ n, ...m })));
  if (miste.length) {
    b.push('\n  MAIUSCOLE MISTE SU COLONNE INDICIZZATE — `startsWith` cambia risposta fra i due database');
    for (const m of miste) b.push(`    ${m.n}.${m.campo}: ${m.conMaiuscole} con maiuscole, ${m.conMinuscole} con minuscole`);
  }

  b.push('\n  DATE — che forma hanno');
  for (const [campo, forme] of Object.entries(r.date)) {
    const parti = Object.entries(forme).filter(([k]) => k !== '__daCorreggere')
      .map(([k, v]) => `${k}×${v}`).join(' · ');
    const bandiera = forme.__daCorreggere !== undefined ? '  ⚠ DA CORREGGERE' : '';
    b.push(`    ${campo.padEnd(34)} ${parti}${bandiera}`);
  }

  if (r.legami.length) {
    b.push('\n  RIFERIMENTI PENDENTI');
    for (const l of r.legami)
      b.push(`    ${l.legame}: ${l.rotti} rotti${l.molle ? ' (legame molle: non tutti devono esistere)' : ''}` +
        `\n      ${l.campione.map(x => `${x.chiave}→${x.valore}`).join(', ')}`);
  } else b.push('\n  RIFERIMENTI PENDENTI — nessuno');

  const ost = Object.entries(r.collezioni).flatMap(([n, c]) => c.ostacoli.map(o => ({ n, ...o })));
  if (ost.length) {
    b.push('\n  OSTACOLI CHE BLOCCANO LA MIGRAZIONE');
    for (const o of ost) b.push(`    ${o.n} [${o.chiave}] ${o.percorso}: ${o.tipo}`);
  }

  b.push(`\n  ${r.blocchi} che bloccano · ${r.avvisi} da sapere\n`);
  return b.join('\n');
}

function principale() {
  const file = argomento('--da', process.env.PATHFINDER_DB || null);
  const db = apri(file);
  const r = analizza(db);
  if (typeof db.close === 'function') db.close();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else console.log(stampa(r));
  process.exit(r.blocchi > 0 ? 1 : 0);
}

if (require.main === module) principale();

module.exports = { analizza, stampa, LEGAMI };
