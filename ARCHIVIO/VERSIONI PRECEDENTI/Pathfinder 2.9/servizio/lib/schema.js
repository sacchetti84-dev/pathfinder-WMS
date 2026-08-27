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
    indexed: ['location_code', 'item_key', 'article_code', 'lot_code', 'udc_id'], unique: [],
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
  },

  /* ── Le cinque della 1.4, create vuote in Fase 0 ────────────────────────
     Nascono adesso, mentre non servono a nessuno, perche' lo schema si
     muove UNA volta sola su un magazzino che sta lavorando. Finche' gli
     interruttori `feature.*` sono spenti restano vuote, e una collezione
     vuota si comporta esattamente come la 1.2: non esiste. */

  /* La confezione e' un fatto del lotto, non della riga di giacenza: deve
     sopravvivere quando l'ultimo collo esce e tre settimane dopo rientra. */
  lots: {
    pk: '_id', pkType: 'auto',
    indexed: ['article_code', 'lot_code'], unique: [],
    compositeUnique: [['article_code', 'lot_code']]
  },
  udc: {
    pk: 'udc_id', pkType: 'text',
    indexed: ['location_code', 'status', 'site_id'], unique: []
  },
  tasks: {
    pk: 'task_id', pkType: 'text',
    indexed: ['type', 'status', 'priority', 'requested_at', 'assigned_to'], unique: [],
    numeric: ['priority', 'requested_at']
  },
  wip: {
    pk: 'wip_id', pkType: 'text',
    indexed: ['odp_num', 'item_key', 'status'], unique: []
  },
  /* Le regole del motore sono un DATO, non un rilascio: «700* va in MAG2»
     e' un record che scrive il Team Leader. Nasce qui e non a novembre
     perche' altrimenti lo schema si muoverebbe una sesta volta. */
  storage_rules: {
    pk: 'rule_id', pkType: 'text',
    indexed: ['priority', 'attiva'], unique: [],
    numeric: ['priority']
  },

  /* ── 1.6 — la ventesima, e la prima nata dall'uso ──────────────────────
     I destinatari dei DDT si popolano da se': compilando un documento a un
     soggetto che non c'e', il soggetto entra. `vat` NON e' unico a livello
     di indice — un DDT a un privato non ha partita IVA, e due NULL
     violerebbero un vincolo unico. L'unicita' la fa il client cercando
     prima di scrivere, che e' dove sa anche COSA fare del doppione. */
  recipients: {
    pk: 'rcp_id', pkType: 'text',
    indexed: ['vat', 'name'], unique: []
  },

  /* ── 2.8 — la ventunesima: la caratterizzazione della singola cella ────
     Fino alla 2.7 temperatura, allergeni e pericolosita' stavano SOLO sulla
     zona e scendevano identiche a tutte le sue celle. Uno scaffale non e'
     omogeneo: il livello a terra regge il doppio di quello in quota, e la
     campata con la vasca di contenimento e' l'unica che tiene un corrosivo.

     E' uno SCAVALCO, non una copia: un campo assente vuol dire «come dice
     la zona», e un record esiste solo per le celle davvero caratterizzate.
     Su duemila ubicazioni ce ne saranno dieci, ed e' giusto cosi'. La
     chiave primaria E' il codice: una cella, un record. */
  location_attrs: {
    pk: 'location_code', pkType: 'text',
    indexed: [], unique: []
  }
};

const NAMES = Object.keys(COLLECTIONS);

/* I CODICI SI SCRIVONO IN MAIUSCOLO, E LO DECIDE IL SERVIZIO — 2.6.

   PERCHE'. Il 26/08, in `MAG1-RAKA-01-05-C`, lo stesso lotto stava a
   scaffale DUE volte: `6001412#cl260854` con 5 pezzi e `6001412#CL260854`
   con 1. Stessa merce, stesso scaffale, due righe, perche' una volta era
   stato digitato in minuscolo. Il FEFO le ordinava separate e chi prelevava
   ne trovava una e non l'altra. Un codice scritto in due grafie non e' un
   problema di resa a video: e' una seconda entita' che nasce.

   DOVE SI NORMALIZZA. Qui, sul servizio, che §6 dichiara l'arbitro. Il
   client maiuscola anche lui — a video, mentre si digita, e sul lettore —
   ma quello e' comodo, non e' la garanzia: due terminali e un import da
   Excel non passano tutti dalla stessa maschera.

   COSA NON SI TOCCA, E NON E' UNA DIMENTICANZA:
   · `meta.key` — le chiavi di configurazione sono in camelCase (`areaWip`,
     `udcPrefissoGS1`): maiuscolarle vorrebbe dire perderle tutte.
   · `pin_hash` e `pin_salt` — sono base64, e maiuscolarli toglie il PIN a
     ogni operatore del magazzino.
   · `status`, `type`, `role`, `verso`, `kind` — sono enum confrontati alla
     lettera nel codice (`'empty'`, `'pallet'`, `'open'`, `'in'`).
   · descrizioni, note, nomi e indirizzi — sono prosa, non codici.

   LA SINTASSI DEI PERCORSI: `campo`, `oggetto.campo`, `elenco[].campo`. */
const MAIUSCOLE = {
  sites:            ['id'],
  zones:            ['site_id', 'id'],
  articles:         ['code', 'category'],
  inventory:        ['item_key', 'article_code', 'lot_code', 'location_code', 'udc_id'],
  loc_status:       ['location_code'],
  disabled:         ['location_code'],
  mov_log:          ['article_code', 'lot_code', 'location_code', 'dest_location', 'user', 'uom', 'doc_ref'],
  quarantine:       ['q_id', 'item_key', 'article_code', 'lot_code', 'original_location', 'blocked_location', 'operator', 'released_by'],
  pending_outbound: ['doc_id', 'ddt_num'],
  pick_session:     ['session_id', 'odp_num', 'odp_article', 'odp_lot', 'operator',
                     'stops[].article_code', 'stops[].lot_code', 'stops[].location_code', 'stops[].item_key', 'stops[].uom'],
  pick_archive:     ['doc_id', 'odp_num', 'odp_article', 'odp_lot', 'operator',
                     'stops[].article_code', 'stops[].lot_code', 'stops[].location_code', 'stops[].item_key', 'stops[].uom'],
  disposal_archive: ['doc_id', 'article_code', 'lot_code', 'location_code',
                     'righe[].article_code', 'righe[].lot_code', 'righe[].location_code'],
  operators:        ['op_id', 'initials'],
  /* meta NON si tocca: le chiavi sono camelCase. */
  meta:             [],
  lots:             ['article_code', 'lot_code', 'uom'],
  udc:              ['udc_id', 'sscc', 'location_code', 'site_id'],
  tasks:            ['task_id', 'assigned_to', 'requested_by', 'completed_by',
                     'payload.article_code', 'payload.lot_code', 'payload.item_key',
                     'payload.from', 'payload.to', 'payload.location_code',
                     'payload.odp_num', 'payload.uom'],
  wip:              ['wip_id', 'odp_num', 'item_key', 'article_code', 'lot_code', 'location_code', 'uom'],
  storage_rules:    ['rule_id'],
  recipients:       ['rcp_id', 'vat'],
  /* Il codice dell'ubicazione e' la chiave primaria: se arriva in minuscolo
     e non si maiuscola, la cella caratterizzata diventa una SECONDA cella
     che non corrisponde a nessuna ubicazione generata. */
  location_attrs:   ['location_code'],
};

/** Scrive un percorso dentro un documento, elenchi compresi. */
function _perCiascuno(oggetto, percorso, fn) {
  if (oggetto === null || typeof oggetto !== 'object') return;
  const punto = percorso.indexOf('.');
  const testa = punto === -1 ? percorso : percorso.slice(0, punto);
  const coda = punto === -1 ? null : percorso.slice(punto + 1);

  if (testa.endsWith('[]')) {
    const nome = testa.slice(0, -2);
    const elenco = oggetto[nome];
    if (!Array.isArray(elenco)) return;
    for (const voce of elenco) {
      if (coda === null) continue;          // `campo[]` senza coda non ha senso
      _perCiascuno(voce, coda, fn);
    }
    return;
  }
  if (coda === null) { fn(oggetto, testa); return; }
  _perCiascuno(oggetto[testa], coda, fn);
}

/* IL DOCUMENTO SI NORMALIZZA PRIMA DI ESSERE SCRITTO, non dopo.
   Restituisce una copia: chi chiama passa spesso un record che il chiamante
   di sopra tiene ancora, e maiuscolarlo sotto i piedi e' il genere di
   effetto che si scopre tre viste piu' in la'. */
function normalizza(nome, record) {
  const percorsi = MAIUSCOLE[nome];
  if (!percorsi || !percorsi.length || record === null || typeof record !== 'object') return record;
  const copia = JSON.parse(JSON.stringify(record));
  for (const p of percorsi) {
    _perCiascuno(copia, p, (dentro, campo) => {
      const v = dentro[campo];
      if (typeof v === 'string' && v) dentro[campo] = v.toUpperCase();
    });
  }
  return copia;
}

/** Il valore di un singolo campo, maiuscolato se quel campo e' un codice. */
function normalizzaCampo(nome, campo, valore) {
  if (typeof valore !== 'string' || !valore) return valore;
  const percorsi = MAIUSCOLE[nome] || [];
  return percorsi.includes(campo) ? valore.toUpperCase() : valore;
}

function colType(col, field) {
  return (col.numeric || []).includes(field) ? 'INTEGER' : 'TEXT';
}

function createTableSQL(name) {
  const col = COLLECTIONS[name];
  const cols = [];

  if (col.pkType === 'auto') cols.push(`${col.pk} INTEGER PRIMARY KEY AUTOINCREMENT`);
  else cols.push(`${col.pk} TEXT PRIMARY KEY`);

  for (const f of col.indexed) {
    if (f === col.pk) continue;
    cols.push(`${f} ${colType(col, f)}`);
  }
  cols.push('data TEXT NOT NULL');

  return `CREATE TABLE IF NOT EXISTS ${name} (${cols.join(', ')})`;
}

/* TABELLE E INDICI SONO DUE PASSI, NON UNO.
   Fra i due ci va la migrazione: `CREATE TABLE IF NOT EXISTS` non aggiunge
   una colonna a una tabella che esiste gia', e il `CREATE INDEX` che segue
   morirebbe nel costruttore. Vedi `PathfinderDB._migra`. */
function createIndexSQL(name) {
  const col = COLLECTIONS[name];
  const stmts = [];

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

function createSQL(name) {
  return [createTableSQL(name), ...createIndexSQL(name)];
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

module.exports = {
  COLLECTIONS, NAMES, createTableSQL, createIndexSQL, createSQL, materialize, colType,
  MAIUSCOLE, normalizza, normalizzaCampo,
};
