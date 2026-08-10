/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — SCHEMA DEL DATABASE
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   LO SCHEMA E' LA TRADUZIONE DEL CONTRATTO, NON UN NUOVO MODELLO.
   Le quattordici collezioni sono le stesse che il client dichiara in
   Persistence.COLLECTIONS, con le stesse chiavi e gli stessi indici che
   Dexie aveva. Il vocabolario non cambia passando da IndexedDB a SQLite:
   cambia solo dove i dati dormono.

   PERCHE' UNA COLONNA `data` IN JSON E NON UNA COLONNA PER CAMPO.
   I record dell'applicativo hanno forma VARIABILE nel tempo: la v3.0.0 ha
   aggiunto `weight_net_kg` e `pieces_per_pack` agli articoli, e dodici
   campi nuovi ai documenti di uscita, senza nessuna migrazione — perche'
   IndexedDB non ha uno schema di colonne. Normalizzare tutto qui
   significherebbe rimettere quella catena: ogni campo nuovo diventerebbe
   un ALTER TABLE e un fermo del servizio.

   Si tiene quindi il documento intero in `data`, e si MATERIALIZZANO come
   colonne vere soltanto i campi su cui si cerca davvero — cioe' esattamente
   quelli che Dexie aveva indicizzato. Quelli hanno indice e valgono per le
   query; tutto il resto vive nel JSON e non ha bisogno di permesso per
   esistere.

   Le colonne materializzate sono scritte dal server a ogni put/add
   leggendole dal documento: non esiste il caso in cui divergano, perche'
   non c'e' un percorso che scriva la colonna senza scrivere il documento.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* Per ogni collezione:
     pk        nome della chiave primaria
     pkType    'auto'   → INTEGER PRIMARY KEY AUTOINCREMENT (il vecchio ++_id)
               'text'   → chiave naturale di testo, fornita dal client
     indexed   campi materializzati in colonna e indicizzati
     unique    campi con vincolo di unicita' (erano gli & di Dexie)
     numeric   campi materializzati come numero: servono ai confronti
               d'intervallo (la purge del registro lavora su ts) */
const COLLECTIONS = {
  sites: {
    pk: '_id', pkType: 'auto',
    indexed: ['id'], unique: ['id']
  },
  zones: {
    pk: '_id', pkType: 'auto',
    indexed: ['site_id', 'id'], unique: [],
    compositeUnique: [['site_id', 'id']]
  },
  articles: {
    pk: '_id', pkType: 'auto',
    indexed: ['code', 'category'], unique: ['code']
  },
  inventory: {
    pk: '_id', pkType: 'auto',
    indexed: ['location_code', 'item_key', 'article_code', 'lot_code'], unique: [],
    composite: [['location_code', 'item_key']]
  },
  loc_status: {
    pk: '_id', pkType: 'auto',
    indexed: ['location_code', 'status'], unique: ['location_code']
  },
  disabled: {
    pk: '_id', pkType: 'auto',
    indexed: ['location_code'], unique: ['location_code']
  },
  mov_log: {
    pk: '_id', pkType: 'auto',
    indexed: ['ts', 'type', 'article_code', 'lot_code', 'location_code'], unique: [],
    numeric: ['ts']
  },
  quarantine: {
    pk: '_id', pkType: 'auto',
    indexed: ['q_id', 'item_key', 'status', 'article_code', 'lot_code'], unique: ['q_id']
  },
  pending_outbound: {
    pk: 'doc_id', pkType: 'text',
    indexed: ['kind', 'status', 'ddt_num', 'created_at'], unique: [],
    numeric: ['created_at']
  },
  pick_session: {
    pk: 'session_id', pkType: 'text',
    indexed: ['status', 'created_at'], unique: [],
    numeric: ['created_at']
  },
  pick_archive: {
    pk: 'doc_id', pkType: 'text',
    indexed: ['odp_num', 'closed_at'], unique: [],
    numeric: ['closed_at']
  },
  disposal_archive: {
    pk: 'doc_id', pkType: 'text',
    indexed: ['created_at', 'article_code', 'lot_code'], unique: [],
    numeric: ['created_at']
  },
  operators: {
    pk: 'op_id', pkType: 'text',
    indexed: ['initials', 'role', 'active'], unique: ['op_id', 'initials']
  },
  meta: {
    pk: 'key', pkType: 'text',
    indexed: [], unique: []
  }
};

const NAMES = Object.keys(COLLECTIONS);

/* Il tipo SQL di una colonna materializzata. Il default e' TEXT: i codici
   di articolo, lotto e ubicazione sono testo, e confrontarli come numeri
   sarebbe sbagliato anche quando sembrano numeri. */
function colType(col, field) {
  return (col.numeric || []).includes(field) ? 'INTEGER' : 'TEXT';
}

function createSQL(name) {
  const col = COLLECTIONS[name];
  const cols = [];

  if (col.pkType === 'auto') cols.push(`${col.pk} INTEGER PRIMARY KEY AUTOINCREMENT`);
  else cols.push(`${col.pk} TEXT PRIMARY KEY`);

  for (const f of col.indexed) {
    if (f === col.pk) continue;
    cols.push(`${f} ${colType(col, f)}`);
  }
  cols.push('data TEXT NOT NULL');

  const stmts = [`CREATE TABLE IF NOT EXISTS ${name} (${cols.join(', ')})`];

  for (const f of col.indexed) {
    if (f === col.pk) continue;
    const uniq = (col.unique || []).includes(f) ? 'UNIQUE ' : '';
    stmts.push(`CREATE ${uniq}INDEX IF NOT EXISTS ix_${name}_${f} ON ${name}(${f})`);
  }
  for (const pair of (col.composite || [])) {
    stmts.push(`CREATE INDEX IF NOT EXISTS ix_${name}_${pair.join('_')} ON ${name}(${pair.join(', ')})`);
  }
  for (const pair of (col.compositeUnique || [])) {
    stmts.push(`CREATE UNIQUE INDEX IF NOT EXISTS ux_${name}_${pair.join('_')} ON ${name}(${pair.join(', ')})`);
  }
  return stmts;
}

/* Le colonne materializzate di un record, pronte per il bind. */
function materialize(name, record) {
  const col = COLLECTIONS[name];
  const out = {};
  for (const f of col.indexed) {
    if (f === col.pk) continue;
    const v = record[f];
    if (v === undefined || v === null) { out[f] = null; continue; }
    out[f] = (col.numeric || []).includes(f) ? Number(v)
           : (typeof v === 'boolean' ? (v ? 1 : 0) : String(v));
  }
  return out;
}

module.exports = { COLLECTIONS, NAMES, createSQL, materialize, colType };
