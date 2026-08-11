import Dexie, { type Table } from 'dexie';
import { DB_NAME } from './costanti';
import type {
  Sito, Zona, Articolo, Giacenza, StatoUbicazione, UbicazioneDisattivata,
  Movimento, Quarantena, DocumentoUscita, SessionePrelievo, ReportPrelievo,
  VerbaleSmaltimento, Operatore, Meta,
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

/* schema IndexedDB atomic-ready */

export { db };
