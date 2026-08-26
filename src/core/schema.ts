import Dexie, { type Table } from 'dexie';
import { DB_NAME } from './costanti';
import type {
  Sito, Zona, Articolo, Giacenza, StatoUbicazione, UbicazioneDisattivata,
  Movimento, Quarantena, DocumentoUscita, SessionePrelievo, ReportPrelievo,
  VerbaleSmaltimento, Operatore, Meta,
  Lotto, Udc, Compito, ContoWip, RegolaStoccaggio, Destinatario,
  AttributiUbicazione,
} from '../types/entita.js';

class PathfinderDB extends Dexie {
  sites!: Table<Sito, number>;
  zones!: Table<Zona, number>;
  articles!: Table<Articolo, number>;
  inventory!: Table<Giacenza, number>;
  loc_status!: Table<StatoUbicazione, number>;
  disabled!: Table<UbicazioneDisattivata, number>;
  mov_log!: Table<Movimento, number>;
  quarantine!: Table<Quarantena, number>;
  pending_outbound!: Table<DocumentoUscita, string>;
  pick_session!: Table<SessionePrelievo, string>;
  pick_archive!: Table<ReportPrelievo, string>;
  disposal_archive!: Table<VerbaleSmaltimento, string>;
  operators!: Table<Operatore, string>;
  meta!: Table<Meta, string>;
  lots!: Table<Lotto, number>;
  udc!: Table<Udc, string>;
  tasks!: Table<Compito, string>;
  wip!: Table<ContoWip, string>;
  storage_rules!: Table<RegolaStoccaggio, string>;
  recipients!: Table<Destinatario, string>;
  location_attrs!: Table<AttributiUbicazione, string>;
}

const db = new PathfinderDB(DB_NAME);
db.version(1).stores({
  sites:        '++_id, &id',                                   // unique by code
  zones:        '++_id, site_id, &[site_id+id]',                // unique per site
  articles:     '++_id, &code, category',                       // unique by code
  inventory:    '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:   '++_id, &location_code, status',                // blocked/reserved by code
  disabled:     '++_id, &location_code',
  mov_log:      '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:   '++_id, &q_id, item_key, status, article_code, lot_code',
  meta:         'key'                                           // key/value simple store
});

db.version(2).stores({
  sites:        '++_id, &id',
  zones:        '++_id, site_id, &[site_id+id]',
  articles:     '++_id, &code, category',
  inventory:    '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:   '++_id, &location_code, status',
  disabled:     '++_id, &location_code',
  mov_log:      '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:   '++_id, &q_id, item_key, status, article_code, lot_code',
  meta:         'key'
}).upgrade(async tx => {
  // Default qty=1 su inventario esistente
  await tx.table('inventory').toCollection().modify(item => {
    if (typeof item.qty !== 'number' || item.qty < 1) item.qty = 1;
  });
  // Default qty fields su mov_log esistente (storici)
  await tx.table('mov_log').toCollection().modify(rec => {
    if (typeof rec.qty_delta !== 'number') rec.qty_delta = null;     // null = movimento storico pre-qty
    if (typeof rec.qty_before !== 'number') rec.qty_before = null;
    if (typeof rec.qty_after !== 'number') rec.qty_after = null;
  });
});

db.version(3).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  meta:             'key'
});

db.version(4).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  meta:             'key'
});

db.version(5).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  meta:             'key'
});

db.version(6).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  operators:        '&op_id, &initials, role, active',
  meta:             'key'
});

db.version(7).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  disposal_archive: '&doc_id, created_at, article_code, lot_code',
  operators:        '&op_id, &initials, role, active',
  meta:             'key'
});

/* 1.4.0 — LO SCHEMA SI MUOVE UNA VOLTA SOLA, E QUESTA È QUELLA VOLTA.
   Cinque collezioni nuove, vuote, e `udc_id` indicizzato su `inventory`.
   Nessun `.upgrade()`: non c'è niente da riscrivere. Dexie aggiunge gli
   store che mancano e l'indice che manca, e un indice su un campo che nessun
   record possiede è un indice vuoto — non un errore.

   Il ramo remoto fa la stessa cosa con `PathfinderDB._migra`, che è il posto
   dove invece serviva scriverlo a mano: SQLite non ha `version()`. */
db.version(8).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, udc_id, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  disposal_archive: '&doc_id, created_at, article_code, lot_code',
  operators:        '&op_id, &initials, role, active',
  meta:             'key',
  lots:             '++_id, article_code, lot_code, &[article_code+lot_code]',
  udc:              '&udc_id, location_code, status, site_id',
  tasks:            '&task_id, type, status, priority, requested_at, assigned_to',
  wip:              '&wip_id, odp_num, item_key, status',
  storage_rules:    '&rule_id, priority, attiva'
});

/* 1.6 — LO SCHEMA SI MUOVE UNA SECONDA VOLTA, e vale la pena dire perche'
   non e' la stessa cosa della version(8). Quella aggiungeva cinque collezioni
   VUOTE in anticipo, per non doverlo rifare; questa ne aggiunge una che si
   popola da se' al primo DDT. Non c'era modo di prevederla: i destinatari
   sono nati dall'uso, come tutta la §9.

   Nessun `.upgrade()`: non c'e' niente da riscrivere. Il ramo remoto fa la
   stessa cosa con `PathfinderDB._migra`, che non ha bisogno di sapere che
   collezione sia — legge `NAMES`. */
db.version(9).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, udc_id, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  disposal_archive: '&doc_id, created_at, article_code, lot_code',
  operators:        '&op_id, &initials, role, active',
  meta:             'key',
  lots:             '++_id, article_code, lot_code, &[article_code+lot_code]',
  udc:              '&udc_id, location_code, status, site_id',
  tasks:            '&task_id, type, status, priority, requested_at, assigned_to',
  wip:              '&wip_id, odp_num, item_key, status',
  storage_rules:    '&rule_id, priority, attiva',
  /* `vat` NON e' unico a livello di indice: un record senza partita IVA e'
     ammesso — si compila un DDT a un privato — e due `null` violerebbero un
     indice unico. L'unicita' la fa `Store.upsertRecipient`, che cerca prima. */
  recipients:       '&rcp_id, vat, name'
});

/* 2.8 — LO SCHEMA SI MUOVE UNA TERZA VOLTA, e come la version(9) e' una
   collezione che nasce dall'uso: la caratterizzazione della singola
   ubicazione. Fino alla 2.7 temperatura, allergeni e pericolosita' stavano
   solo sulla zona, e uno scaffale non e' omogeneo — il livello a terra regge
   il doppio di quello in quota.

   NESSUN `.upgrade()`, e qui va detto perche' non serve davvero: un record
   di `location_attrs` e' uno SCAVALCO, e la sua assenza vuol dire «come dice
   la zona». Un database che si apre con questa versione e nessun record
   dentro si comporta esattamente come il giorno prima. */
db.version(10).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, udc_id, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  disposal_archive: '&doc_id, created_at, article_code, lot_code',
  operators:        '&op_id, &initials, role, active',
  meta:             'key',
  lots:             '++_id, article_code, lot_code, &[article_code+lot_code]',
  udc:              '&udc_id, location_code, status, site_id',
  tasks:            '&task_id, type, status, priority, requested_at, assigned_to',
  wip:              '&wip_id, odp_num, item_key, status',
  storage_rules:    '&rule_id, priority, attiva',
  recipients:       '&rcp_id, vat, name',
  location_attrs:   '&location_code'
});

export { db };
