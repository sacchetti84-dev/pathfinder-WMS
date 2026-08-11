/** I nomi delle collezioni, nell'ordine in cui il progetto li ha sempre elencati.
    Le ultime cinque sono della 1.4: create vuote in Fase 0, si popolano
    quando si accende l'interruttore `feature.*` che le riguarda. */
export const COLLEZIONI = [
  'sites', 'zones', 'articles', 'inventory', 'loc_status', 'disabled',
  'mov_log', 'quarantine', 'pending_outbound', 'pick_session',
  'pick_archive', 'disposal_archive', 'operators', 'meta',
  'lots', 'udc', 'tasks', 'wip', 'storage_rules',
] as const;

/** Una collezione, e nient'altro: `Persistence.get('sitess', …)` non compila. */
export type Collezione = typeof COLLEZIONI[number];

export const CHIAVE_PRIMARIA = {
  sites: '_id', zones: '_id', articles: '_id', inventory: '_id',
  loc_status: '_id', disabled: '_id', mov_log: '_id', quarantine: '_id',
  pending_outbound: 'doc_id', pick_session: 'session_id',
  pick_archive: 'doc_id', disposal_archive: 'doc_id',
  operators: 'op_id', meta: 'key',
  lots: '_id', udc: 'udc_id', tasks: 'task_id', wip: 'wip_id',
  storage_rules: 'rule_id',
} as const satisfies Record<Collezione, string>;

export type ChiavePrimaria = typeof CHIAVE_PRIMARIA;

export const CAMPI_INDICIZZATI = {
  sites: ['id'],
  zones: ['site_id', 'id'],
  articles: ['code', 'category'],
  inventory: ['location_code', 'item_key', 'article_code', 'lot_code', 'udc_id'],
  loc_status: ['location_code', 'status'],
  disabled: ['location_code'],
  mov_log: ['ts', 'type', 'article_code', 'lot_code', 'location_code'],
  quarantine: ['q_id', 'item_key', 'status', 'article_code', 'lot_code'],
  pending_outbound: ['kind', 'status', 'ddt_num', 'created_at'],
  pick_session: ['status', 'created_at'],
  pick_archive: ['odp_num', 'closed_at'],
  disposal_archive: ['created_at', 'article_code', 'lot_code'],
  operators: ['initials', 'role', 'active'],
  meta: [],
  lots: ['article_code', 'lot_code'],
  udc: ['location_code', 'status', 'site_id'],
  tasks: ['type', 'status', 'priority', 'requested_at', 'assigned_to'],
  wip: ['odp_num', 'item_key', 'status'],
  storage_rules: ['priority', 'attiva'],
} as const satisfies Record<Collezione, readonly string[]>;

/** I campi su cui si può davvero costruire un criterio, per collezione. */
export type CampoIndicizzato<C extends Collezione> = typeof CAMPI_INDICIZZATI[C][number];
