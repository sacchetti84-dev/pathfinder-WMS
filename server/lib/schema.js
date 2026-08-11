'use strict';

/** IL VOCABOLARIO È DICHIARATO IN UN POSTO SOLO.
   Fino a ieri l'elenco delle collezioni era scritto tre volte — qui, in
   `Persistence.COLLECTIONS` sul client, e nella mappa `_PK` dell'adapter
   remoto. Combaciavano perché qualcuno se n'era ricordato.

   Questa annotazione lo rende una cosa verificata: se qui compare una
   collezione che il client non conosce, o ne manca una che il client si
   aspetta, il controllo dei tipi si ferma. Un nome sbagliato da una parte
   sola non fa rumore — fa un 404 in mezzo a un turno.

   @type {Record<import('../../src/types/collezioni').Collezione, {
     pk: string,
     pkType: 'auto' | 'text',
     indexed: string[],
     unique?: string[],
     numeric?: string[],
     composite?: string[][],
     compositeUnique?: string[][]
   }>} */
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
