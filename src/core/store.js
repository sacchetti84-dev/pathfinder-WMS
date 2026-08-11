import { MOV } from './costanti';
import { Persistence } from './persistence/index';
import { COLLEZIONI, CHIAVE_PRIMARIA } from '../types/collezioni';
import {
  FORMA_CACHE, applicaAllaCache, bucketPut, bucketDelete,
  indicizzaGiacenza, ricostruisciIndici, indiciVuoti, metaVuota,
} from './cache';
import { verificaConformita } from '../modules/conformita';
import { App } from '../ui/app.js';

/* L'ELENCO DELLE COLLEZIONI DA ESPORTARE STA IN UN POSTO SOLO.
   Fino a ieri era scritto a mano in tre — `exportAll`, `_countsOf`,
   `importAll` — e combaciavano perche' qualcuno se n'era ricordato. Con
   cinque collezioni in arrivo, dimenticarne una in uno dei tre significa un
   backup che sembra completo e non lo e', oppure un ripristino che azzera
   le giacenze e lascia in piedi le UDC che ci puntavano.

   Fuori restano due, ed entrambe per un motivo:
     · `meta`         — non e' un elenco, e la parte che serve viaggia come
                        `doc_config`;
     · `pick_session` — e' la sessione APERTA su un terminale. Un backup non
                        la deve riportare in vita. */
const COLLEZIONI_EXPORT = COLLEZIONI.filter(c => c !== 'meta' && c !== 'pick_session');

/* UN RILASCIO INSTALLATO NON E' UNA FUNZIONE ACCESA.
   Le cinque della 1.4 entrano in magazzino a interruttore spento e si
   accendono una alla volta, a inizio turno, su un magazzino alla volta. Se
   qualcosa si muove nel verso sbagliato si spegne l'interruttore: non si
   disinstalla niente e non si tocca il database.

   Vivono in `meta` una chiave per una, e non in un unico record, proprio
   perche' accenderne due nello stesso turno deve costare due gesti
   distinti: se poi qualcosa si muove, si sa quale delle due e' stata. */
const FEATURES = ['tasks', 'uom', 'udc', 'putaway', 'wip'];
const CHIAVE_FEATURE = (nome) => `feature.${nome}`;

const Store = {
  _assertPositiveInt(value, label = 'Quantità') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${label}: valore non numerico`);
    if (!Number.isInteger(n)) throw new Error(`${label}: sono ammessi solo numeri interi (ricevuto ${n})`);
    if (n < 1) throw new Error(`${label}: deve essere maggiore di zero (ricevuto ${n})`);
    return n;
  },

  /* Cache in-memory. Popolata all'init, aggiornata ad ogni mutazione.
     Consente letture sincrone dal layer UI senza richiedere async. */
  _cache: {
    sites: [],             // [{id, name, type, address, notes, active, created_at, updated_at}]
    zones: [],             // [{site_id, id, name, type, active, ...config}]
    articles: [],          // [{code, description, category, supplier, unit, ...}]
    inventory: [],         // [{_id, location_code, item_key, article_code, article_description, lot_code, expiry_date, placed_at, placed_by, notes}]
    locStatus: new Map(),  // location_code → {status, blocked_reason, updated_at}
    disabled: new Set(),   // set of location_code
    movLog: [],            // [{_id, ts, type, article_code, article_description, lot_code, location_code, dest_location, user, notes, doc_ref}]
    quarantine: [],        // [{_id, q_id, item_key, article_code, article_description, lot_code, original_location, blocked_location, reason, operator, reference_dept, reference_person, created_at, released_at, status}]
    pendingOut: [],        // v2.0.0 — [{doc_id, kind, ddt_num, destination, carrier, operator, status, created_at, evaded_at, cancelled_at, lines:[...]}]
    pickSession: null,     // v2.5.0 — sessione di prelievo in corso (una sola, o null)
    pickArchive: [],       // v2.5.1 — snapshot dei report di prelievo emessi, dal più recente
    disposalArchive: [],   // v3.0.0 [M2] — verbali di smaltimento emessi, dal più recente
    operators: [],         // v2.7.0 — [{op_id, first_name, last_name, initials, role, pin_hash, pin_salt, pin_set_at, active, created_at, updated_at}]
    movLogTotal: 0,        // v2.8.0 — movimenti totali a DATABASE (movLog ne tiene solo la finestra)
    /* 1.4.0 — le cinque nuove, VUOTE. Restano vuote finche' non si accende
       l'interruttore `feature.*` che le riguarda: una collezione vuota si
       comporta esattamente come nella 1.2, cioe' non esiste. */
    lots: [],              // 1.4.2 — confezione congelata per articolo/lotto
    udc: [],               // 1.4.3 — contenitori
    tasks: [],             // 1.4.1 — coda delle attivita'
    wip: [],               // 1.4.5 — conti aperti verso la produzione
    storageRules: [],      // 1.4.4 — le regole del motore, come dato
    /* Stessa forma che `_applyToCache('meta','clear')` rimette: una sola
       definizione, se no l'avvio e l'azzeramento partono da due stati diversi. */
    meta: metaVuota()
  },

  MOVLOG_WINDOW_KEY: 'wm_movlog_window_days',
  MOVLOG_WINDOW_DEFAULT: 120,
  MOVLOG_WINDOW_MIN: 7,
  MOVLOG_WINDOW_MAX: 3650,
  _movLogWindowDays: null,

  /* 0 = nessuna finestra, si carica tutto. Resta possibile per chi ha pochi
     movimenti e preferisce il comportamento della v2.7.0. */
  getMovLogWindowDays() {
    if (this._movLogWindowDays !== null) return this._movLogWindowDays;
    let v = this.MOVLOG_WINDOW_DEFAULT;
    try {
      const raw = localStorage.getItem(this.MOVLOG_WINDOW_KEY);
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) v = n === 0 ? 0 : Math.min(this.MOVLOG_WINDOW_MAX, Math.max(this.MOVLOG_WINDOW_MIN, n));
      }
    } catch { /* localStorage disabilitato → predefinito */ }
    this._movLogWindowDays = v;
    return v;
  },

  setMovLogWindowDays(days) {
    const n = parseInt(days, 10);
    const v = !Number.isFinite(n) || n === 0 ? 0 : Math.min(this.MOVLOG_WINDOW_MAX, Math.max(this.MOVLOG_WINDOW_MIN, n));
    this._movLogWindowDays = v;
    try { localStorage.setItem(this.MOVLOG_WINDOW_KEY, String(v)); } catch {}
    return v;
  },

  /* Timestamp di inizio finestra, o null se la finestra e' disattivata. */
  movLogWindowFrom() {
    const d = this.getMovLogWindowDays();
    return d === 0 ? null : Date.now() - d * 24 * 60 * 60 * 1000;
  },

  _locIndex: null,    // Set<location_code> → fast lookup. Geometria: resta qui

  /* Gli indici derivati vivono in `core/cache.ts` e ci stanno DENTRO un
     oggetto, non sparsi: `applicaAllaCache` deve poterli sostituire su
     `clear`, e tre riferimenti separati resterebbero appesi a Map morte.
     I tre getter tengono in piedi i trenta punti che li leggono per nome. */
  _indici: indiciVuoti(),
  get _invByLoc()  { return this._indici.invByLoc; },   // Map<location_code → item[]>
  get _invByKey()  { return this._indici.invByKey; },   // Map<item_key → item[]>
  get _artByCode() { return this._indici.artByCode; },  // Map<code → article>

  async init() {
    await Persistence.open();
    await this._loadCache();
    this._rebuildIndexes();
  },

  async reloadCache() {
    await this._loadCache();
    this._rebuildIndexes();
  },

  /* Metadati di salvataggio. Congelati: sono un referto, non uno stato
     su cui intervenire. Chi deve modificarli passa da _touchMeta(). */
  getMeta() {
    return Object.freeze({ ...this._cache.meta });
  },

  hasUnsavedChanges() {
    return !!this._cache.meta?.unsavedChanges;
  },

  getInventoryCount() {
    return this._cache.inventory.length;
  },

  /* Copia della giacenza per gli export: chi la riceve la ordina, la
     raggruppa e la rimaneggia a piacere senza toccare la cache. */
  getInventorySnapshot() {
    return this._cache.inventory.slice();
  },

  getCurrentIdentity() {
    const rec = (typeof App !== 'undefined' ? App.currentOperatorRecord : null) || null;
    return {
      id: rec?.op_id || null,
      initials: rec?.initials || (typeof App !== 'undefined' ? App.currentOperator : null) || '',
      role: rec?.role || 'full'
    };
  },

  getOperators({ activeOnly = false } = {}) {
    const all = this._cache.operators;
    return activeOnly ? all.filter(o => o.active !== false) : all.slice();
  },

  getOperator(opId) {
    return this._cache.operators.find(o => o.op_id === opId) || null;
  },

  getOperatorByInitials(initials) {
    const v = String(initials ?? '').toUpperCase().trim();
    return this._cache.operators.find(o => o.initials === v) || null;
  },

  getActiveLeaders() {
    return this._cache.operators.filter(o => o.role === 'leader' && o.active !== false);
  },

  getUsableLeaders() {
    return this._cache.operators.filter(o =>
      o.role === 'leader' && o.active !== false && !!o.pin_hash);
  },

  async addOperator(rec) {
    const initials = String(rec.initials ?? '').toUpperCase().trim();
    if (this.getOperatorByInitials(initials)) {
      throw new Error(`Le iniziali ${initials} sono già assegnate a un altro operatore`);
    }
    const now = Date.now();
    const record = {
      op_id: `OP-${now.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      first_name: rec.first_name || '',
      last_name:  rec.last_name || '',
      initials,
      role:       rec.role === 'leader' ? 'leader' : 'operator',
      pin_hash:   rec.pin_hash || null,
      pin_salt:   rec.pin_salt || null,
      pin_set_at: rec.pin_hash ? now : null,
      active:     true,
      created_at: now,
      updated_at: now
    };
    await Persistence.add('operators', record);
    this._applyToCache('operators', 'put', record);
    await this._touchMeta();
    return record;
  },

  async updateOperator(opId, changes) {
    const cur = this.getOperator(opId);
    if (!cur) throw new Error('Operatore non trovato');
    if (changes.initials) {
      const v = String(changes.initials).toUpperCase().trim();
      const clash = this.getOperatorByInitials(v);
      if (clash && clash.op_id !== opId) throw new Error(`Le iniziali ${v} sono già assegnate a un altro operatore`);
      changes = { ...changes, initials: v };
    }
    const updated = { ...cur, ...changes, updated_at: Date.now() };
    await Persistence.update('operators', opId, { ...changes, updated_at: updated.updated_at });
    this._applyToCache('operators', 'put', updated);
    await this._touchMeta();
    return updated;
  },

  getLotsForArticle(articleCode) {
    const code = String(articleCode ?? '').toUpperCase().trim();
    if (!code) return [];
    return [...new Set(
      this._cache.inventory
        .filter(i => i.article_code === code)
        .map(i => i.lot_code)
    )];
  },

  async _loadCache() {
    /* v2.8.0 [H2] — Si carica una FINESTRA del registro, non il registro.
       Vedi MOVLOG_WINDOW_DAYS per il perche' e per il come. */
    const { sites, zones, articles, inventory, locStatus: locStat, disabled,
            movLog, movLogTotal, quarantine, pendingOut, meta: metaRows,
            pickSession: pickSessions, pickArchive, disposalArchive, operators,
            lots, udc, tasks, wip, storageRules } =
      await Persistence.loadAll({ movLogFrom: this.movLogWindowFrom() });
    // Riassembla zones dentro sites
    const zonesBySite = {};
    for (const z of zones) { (zonesBySite[z.site_id] = zonesBySite[z.site_id] || []).push(z); }
    for (const s of sites) { s.zones = zonesBySite[s.id] || []; }
    this._cache.sites = sites;
    this._cache.zones = zones;
    this._cache.articles = articles;
    this._cache.inventory = inventory;
    this._cache.locStatus = new Map(locStat.map(l => [l.location_code, l]));
    this._cache.disabled = new Set(disabled.map(d => d.location_code));
    this._cache.movLog = movLog;
    this._cache.movLogTotal = movLogTotal;   // v2.8.0 [H2] — quanti ce ne sono davvero
    this._cache.quarantine = quarantine;
    this._cache.pendingOut = pendingOut; // v2.0.0 — DDT pendenti di uscita
    this._cache.pickSession = pickSessions.length
      ? pickSessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0]
      : null;
    this._cache.pickArchive = pickArchive;   // v2.5.1 — già ordinati dal più recente
    this._cache.disposalArchive = disposalArchive || [];   // v3.0.0 [M2] — verbali di smaltimento
    /* 1.4.0 — il `|| []` regge il ritorno indietro: un servizio 1.2 non
       manda queste chiavi, e il client non deve accorgersene. */
    this._cache.lots = lots || [];
    this._cache.udc = udc || [];
    this._cache.tasks = tasks || [];
    this._cache.wip = wip || [];
    this._cache.storageRules = storageRules || [];
    /* v2.7.0 [G6] — Ordine alfabetico stabile: l'anagrafica si legge e si
       sceglie, non si scorre in ordine di inserimento. */
    this._cache.operators = (operators || []).sort((a, b) =>
      (a.last_name || a.initials || '').localeCompare(b.last_name || b.initials || '', 'it'));
    const metaObj = {};
    for (const m of metaRows) metaObj[m.key] = m.value;
    const features = {};
    for (const f of FEATURES) features[f] = metaObj[CHIAVE_FEATURE(f)] === true;
    this._cache.meta = {
      lastModified: metaObj.lastModified || null,
      unsavedChanges: metaObj.unsavedChanges || false,
      lastAutoBackup: metaObj.lastAutoBackup || null,
      docConfig: metaObj.docConfig || null,
      features                                   // 1.4.0 — assente = spento
    };
  },

  /* ── Interruttori di funzione ───────────────────────────────────────── */

  FEATURES,

  /* Lettura sincrona: la chiama la UI a ogni render, e una funzione spenta
     deve costare quanto costava non averla. */
  isFeatureOn(nome) {
    return this._cache.meta?.features?.[nome] === true;
  },

  async setFeature(nome, acceso) {
    if (!FEATURES.includes(nome)) throw new Error(`Interruttore sconosciuto: ${nome}`);
    const rec = { key: CHIAVE_FEATURE(nome), value: acceso === true };
    await Persistence.put('meta', rec);
    this._applyToCache('meta', 'put', rec);
    if (!this._cache.meta.features) this._cache.meta.features = {};
    this._cache.meta.features[nome] = acceso === true;
    return acceso === true;
  },

  /* Conteggio dei movimenti più vecchi della soglia di retention.
     Sola lettura: non cancella nulla. Usato dalla UI di Config. */
  async countPurgeableMovements(cutoffTs) {
    try {
      return await Persistence.count('mov_log', { field: 'ts', op: 'below', value: cutoffTs });
    } catch (err) {
      console.error('[WM] countPurgeableMovements:', err);
      return 0;
    }
  },

  async purgeMovementsBefore(cutoffTs) {
    const removed = await Persistence.deleteWhere('mov_log', { field: 'ts', op: 'below', value: cutoffTs });
    if (removed > 0) {
      this._cache.movLog = this._cache.movLog.filter(m => m.ts >= cutoffTs);
      this._cache.movLogTotal = Math.max(0, this._cache.movLogTotal - removed);   // v2.8.0 [H2]
      await this._touchMeta();
    }
    return removed;
  },

  /* DB nasce vuoto: siti e zone configurati dall'utente */

  /* Rebuild indici in-memory — O(n) ad ogni mutazione massiva */
  _rebuildIndexes() {
    this._locIndex = new Set();
    // Ubicazioni valide: generate da tutte le zone attive
    for (const site of this._cache.sites) {
      if (!site.active) continue;
      for (const zone of (site.zones || [])) {
        if (!zone.active) continue;
        for (const loc of this._genLocations(site.id, zone)) this._locIndex.add(loc.code);
      }
    }
    ricostruisciIndici(this._cache, this._indici);
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.6.0 [F1-4] — PUNTO UNICO DI MUTAZIONE DELLA CACHE
     © Andrea Sacchetti — Dietopack S.r.l.

     PERCHE' ESISTE. Fino alla v2.5.1 ogni metodo di scrittura aggiornava
     la cache a modo suo: chi con push, chi con unshift, chi con splice,
     e chi si ricordava — o si dimenticava — di toccare anche gli indici.
     Finche' l'unica sorgente di modifica e' l'operatore seduto davanti al
     tablet, funziona. Con un backend, no: i delta che arrivano dal server
     via SSE devono entrare nella cache ESATTAMENTE come vi entrano quelli
     locali, e se la mutazione e' sparsa in quaranta punti il realtime va
     scritto quaranta volte. Con un punto solo, il RemotePersistence si
     limitera' a chiamare questo metodo.

     E' anche il posto dove gli indici (_invByLoc, _invByKey, _artByCode)
     smettono di essere un impegno preso col lettore e diventano una
     conseguenza automatica: nessun chiamante li nomina piu'.

     SEMANTICA INVARIATA. Questo metodo CENTRALIZZA, non corregge. Dove un
     metodo aggiornava la cache prima della scrittura sul supporto,
     continua a farlo nello stesso ordine: vedi il TODO F1-REVIEW su
     removeItem(). Le posizioni di inserimento sono quelle di prima —
     coda per anagrafiche e giacenze, testa per i registri cronologici,
     dove il piu' recente e' sempre il primo.

     LE TRE ECCEZIONI, dichiarate. Restano fuori di qui i percorsi che
     agiscono su INSIEMI e non su singoli record, perche' passarli riga
     per riga significherebbe migliaia di chiamate al posto di un filtro:
       · _loadCache()          — idratazione completa dal supporto
       · deleteSite/deleteZone — cancellazione per prefisso di ubicazione
       · purgeMovementsBefore()— purga per soglia temporale
     Tutti e tre terminano ricostruendo gli indici, quindi la cache resta
     coerente. Quando il server invieta' delta di massa, saranno questi
     tre a diventare un'operazione sola.

     DA QUI IN POI STA IN TYPESCRIPT. L'implementazione e' in
     `core/cache.ts` — primo blocco della conversione, PIANO-1.4 §3. Qui
     restano il nome e la firma, che quarantasette punti di questo file e uno
     di `vault.ts` chiamano: spostare il codice non doveva muovere nient'altro.
     Il collaudo e' `test/cache.test.js`, e prima non c'era.
     ═══════════════════════════════════════════════════════════════════ */

  _CACHE_SHAPE: FORMA_CACHE,

  _bucketPut(map, mapKey, rec) { bucketPut(map, mapKey, rec); },
  _bucketDelete(map, mapKey, rec) { bucketDelete(map, mapKey, rec); },
  _indexInventory(prev, next) { indicizzaGiacenza(this._indici, prev, next); },

  _applyToCache(collection, op, record = null) {
    applicaAllaCache(this._cache, this._indici, collection, op, record);
  },

  /* Meta persistence (ultima modifica) */
  async _touchMeta(unsaved = true) {
    this._applyToCache('meta', 'put', { key: 'lastModified', value: Date.now() });
    this._applyToCache('meta', 'put', { key: 'unsavedChanges', value: unsaved });
    await Persistence.bulkPut('meta', [
      { key: 'lastModified', value: this._cache.meta.lastModified },
      { key: 'unsavedChanges', value: unsaved }
    ]);
  },

  async markSaved() {
    this._applyToCache('meta', 'put', { key: 'unsavedChanges', value: false });
    await Persistence.put('meta', { key: 'unsavedChanges', value: false });
  },

  // ═══ SITES ═══
  getSites() { return this._cache.sites.filter(s => s.active); },
  getSite(id) { return this._cache.sites.find(s => s.id === id); },

  async addSite(site) {
    if (this._cache.sites.find(s => s.id === site.id)) return false;
    const now = Date.now();
    const rec = { ...site, active: true, created_at: now, updated_at: now };
    const _id = await Persistence.add('sites', rec);
    this._applyToCache('sites', 'put', { ...rec, _id, zones: [] });
    await this._touchMeta();
    return true;
  },

  async updateSite(id, updates) {
    const site = this.getSite(id);
    if (!site) return false;
    Object.assign(site, updates, { updated_at: Date.now() });
    const { zones, ...persistable } = site;
    await Persistence.put('sites', persistable);
    await this._touchMeta();
    return true;
  },

  async deleteSite(id) {
    const site = this.getSite(id);
    if (!site) return false;
    // Soft-delete: disattiva site + rimuovi inventory/status/disabled legati
    site.active = false;
    site.updated_at = Date.now();
    await Persistence.transaction(['sites', 'zones', 'inventory', 'loc_status', 'disabled'], async () => {
      const { zones, ...p } = site; await Persistence.put('sites', p);
      const prefix = id + '-';
      await Persistence.deleteWhere('inventory', { field: 'location_code', op: 'startsWith', value: prefix });
      await Persistence.deleteWhere('loc_status', { field: 'location_code', op: 'startsWith', value: prefix });
      await Persistence.deleteWhere('disabled', { field: 'location_code', op: 'startsWith', value: prefix });
    });
    // Aggiorna cache
    this._cache.inventory = this._cache.inventory.filter(i => !i.location_code.startsWith(id + '-'));
    for (const k of Array.from(this._cache.locStatus.keys())) {
      if (k.startsWith(id + '-')) this._cache.locStatus.delete(k);
    }
    for (const k of Array.from(this._cache.disabled)) {
      if (k.startsWith(id + '-')) this._cache.disabled.delete(k);
    }
    this._rebuildIndexes();
    await this._touchMeta();
    return true;
  },

  // ═══ ZONES ═══
  getZones(siteId) {
    const site = this.getSite(siteId);
    return site ? (site.zones || []).filter(z => z.active) : [];
  },
  getZone(siteId, zoneId) { return this.getZones(siteId).find(z => z.id === zoneId); },

  /* 1.4.0 — Cosa e' stoccato dove non dovrebbe. Il calcolo e' puro e sta in
     `modules/conformita`; qui si fornisce solo il magazzino.

     Il risultato NON viene memorizzato: chi lo usa lo chiede una volta per
     disegnata e se lo tiene. Con 2.000 celle, una chiamata per cella sarebbe
     duemila giri sull'inventario. */
  verificaStoccaggio() {
    const geo = this.buildLocationGeometry();
    const zone = new Map();
    const zonaDi = (code) => {
      if (zone.has(code)) return zone.get(code);
      const g = geo.get(code);
      const z = g ? this.getZone(g.site_id, g.zone_id) : null;
      const attr = z ? {
        zone_name: z.name,
        temp_class: z.temp_class || null,
        allergen_zone: z.allergen_zone === true,
        allergens: Array.isArray(z.allergens) ? z.allergens : null,
        /* Uno stato «Riservata» esplicito vince su «occupata» dentro
           getLocationStatus, quindi una cella riservata CON merce dentro
           resta riservata: senza quello, la deroga non scatterebbe mai. */
        riservata: this.getLocationStatus(code) === 'reserved',
      } : null;
      zone.set(code, attr);
      return attr;
    };
    return verificaConformita(this._cache.inventory, (c) => this._artByCode.get(c), zonaDi);
  },

  async addZone(siteId, zone) {
    const site = this.getSite(siteId);
    if (!site) return false;
    if ((site.zones || []).find(z => z.id === zone.id)) return false;
    const rec = { ...zone, site_id: siteId, active: true };
    const _id = await Persistence.add('zones', rec);
    const cached = { ...rec, _id };
    site.zones = site.zones || [];
    site.zones.push(cached);
    this._applyToCache('zones', 'put', cached);
    this._rebuildIndexes();
    await this._touchMeta();
    return true;
  },

  async updateZone(siteId, zoneId, updates) {
    const zone = this.getZone(siteId, zoneId);
    if (!zone) return false;
    Object.assign(zone, updates);
    await Persistence.put('zones', zone);
    this._rebuildIndexes();
    await this._touchMeta();
    return true;
  },

  async deleteZone(siteId, zoneId) {
    const zone = this.getZone(siteId, zoneId);
    if (!zone) return false;
    zone.active = false;
    const prefix = `${siteId}-${zoneId}-`;
    await Persistence.transaction(['zones', 'inventory', 'loc_status', 'disabled'], async () => {
      await Persistence.put('zones', zone);
      await Persistence.deleteWhere('inventory', { field: 'location_code', op: 'startsWith', value: prefix });
      await Persistence.deleteWhere('loc_status', { field: 'location_code', op: 'startsWith', value: prefix });
      await Persistence.deleteWhere('disabled', { field: 'location_code', op: 'startsWith', value: prefix });
    });
    this._cache.inventory = this._cache.inventory.filter(i => !i.location_code.startsWith(prefix));
    for (const k of Array.from(this._cache.locStatus.keys())) if (k.startsWith(prefix)) this._cache.locStatus.delete(k);
    for (const k of Array.from(this._cache.disabled)) if (k.startsWith(prefix)) this._cache.disabled.delete(k);
    this._rebuildIndexes();
    await this._touchMeta();
    return true;
  },

  // ═══ LOCATIONS (generate dinamicamente dalla config zona) ═══
  _genLocations(siteId, zone) {
    const locs = [];
    const prefix = `${siteId}-${zone.id}`;
    if (zone.type === 'RACK') {
      for (let a = 1; a <= (zone.aisles || 1); a++) {
        for (let b = 1; b <= (zone.bays_per_aisle || 1); b++) {
          for (const lvl of (zone.levels || ['T'])) {
            locs.push({ code: `${prefix}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}-${lvl}`, aisle: a, bay: b, level: lvl });
          }
        }
      }
    } else if (zone.type === 'FLOOR') {
      for (let r = 1; r <= (zone.rows || 1); r++) {
        for (let p = 1; p <= (zone.positions_per_row || 1); p++) {
          locs.push({ code: `${prefix}-${String(r).padStart(2,'0')}-${String(p).padStart(2,'0')}`, row: r, position: p });
        }
      }
    } else if (zone.type === 'BULK') {
      for (let p = 1; p <= (zone.positions || 1); p++) {
        locs.push({ code: `${prefix}-${String(p).padStart(2,'0')}`, position: p });
      }
    }
    return locs;
  },

  generateLocations(siteId, zoneId) {
    const zone = this.getZone(siteId, zoneId);
    return zone ? this._genLocations(siteId, zone) : [];
  },

  locationExists(code) { return this._locIndex?.has(code) ?? false; },

  getLocationStatus(code) {
    if (this._cache.disabled.has(code)) return 'disabled';
    const s = this._cache.locStatus.get(code);
    if (s) return s.status;
    return (this._invByLoc.get(code)?.length ?? 0) > 0 ? 'occupied' : 'empty';
  },

  getLocationMeta(code) { return this._cache.locStatus.get(code); },

  async setLocationStatus(code, status, reason = '') {
    await Persistence.deleteWhere('loc_status', { field: 'location_code', op: 'equals', value: code });
    this._applyToCache('loc_status', 'delete', { location_code: code });
    if (this._cache.disabled.has(code)) {
      await Persistence.deleteWhere('disabled', { field: 'location_code', op: 'equals', value: code });
      this._applyToCache('disabled', 'delete', { location_code: code });
    }
    if (status === 'blocked' || status === 'reserved') {
      const rec = { location_code: code, status, blocked_reason: reason, updated_at: Date.now() };
      const _id = await Persistence.add('loc_status', rec);
      this._applyToCache('loc_status', 'put', { ...rec, _id });
    }
    await this._touchMeta();
  },

  isLocationDisabled(code) { return this._cache.disabled.has(code); },

  async toggleLocationDisabled(code) {
    const items = this.getItemsAtLocation(code);
    if (items.length > 0 && !this._cache.disabled.has(code)) return false;
    if (this._cache.disabled.has(code)) {
      await Persistence.deleteWhere('disabled', { field: 'location_code', op: 'equals', value: code });
      this._applyToCache('disabled', 'delete', { location_code: code });
    } else {
      // rimuove eventuale blocked/reserved
      if (this._cache.locStatus.has(code)) {
        await Persistence.deleteWhere('loc_status', { field: 'location_code', op: 'equals', value: code });
        this._applyToCache('loc_status', 'delete', { location_code: code });
      }
      await Persistence.add('disabled', { location_code: code });
      this._applyToCache('disabled', 'put', { location_code: code });
    }
    await this._touchMeta();
    return true;
  },

  // ═══ INVENTORY ═══
  getItemsAtLocation(code) { return this._invByLoc.get(code) || []; },
  getItemByKey(itemKey) { return this._invByKey.get(itemKey) || []; },

  findItemLocations(query) {
    if (!query) return [];
    const q = query.toLowerCase().trim();
    // Fast path: exact itemKey match
    if (this._invByKey.has(query.toUpperCase())) return [...this._invByKey.get(query.toUpperCase())];
    const out = [];
    for (const i of this._cache.inventory) {
      if (i.article_code?.toLowerCase().includes(q) ||
          i.lot_code?.toLowerCase().includes(q) ||
          i.article_description?.toLowerCase().includes(q) ||
          i.item_key?.toLowerCase().includes(q) ||
          i.location_code?.toLowerCase().includes(q)) {
        out.push(i);
      }
    }
    return out;
  },

  sortByFEFO(items) {
    if (!items || items.length < 2) return items ? [...items] : [];
    const sorted = [...items];
    sorted.sort((a, b) => {
      const ea = (a.expiry_date || '').trim();
      const eb = (b.expiry_date || '').trim();
      // Senza scadenza → in coda, ordinati per placed_at (FIFO)
      if (!ea && !eb) return (a.placed_at || 0) - (b.placed_at || 0);
      if (!ea) return 1;
      if (!eb) return -1;
      // Confronto stringa ISO YYYY-MM-DD funziona lessicograficamente
      if (ea !== eb) return ea < eb ? -1 : 1;
      return (a.placed_at || 0) - (b.placed_at || 0);
    });
    return sorted;
  },

  /* Per un dato articolo, identifica quale item è il "FEFO consigliato"
     (il primo da prelevare). Ritorna null se non ci sono item dell'articolo. */
  getFEFOItemForArticle(articleCode) {
    const matching = this._cache.inventory.filter(i => i.article_code === articleCode);
    if (!matching.length) return null;
    return this.sortByFEFO(matching)[0];
  },

  /* Verifica se un dato item è il candidato FEFO per il suo articolo.
     Usato per evidenziare il lotto consigliato nelle UI di picking. */
  isFEFOItem(item) {
    if (!item) return false;
    const fefo = this.getFEFOItemForArticle(item.article_code);
    if (!fefo) return false;
    return fefo._id === item._id || (fefo.item_key === item.item_key && fefo.location_code === item.location_code);
  },

  async addItem(locationCode, articleCode, articleDescription, lotCode, expiryDate = '', notes = '', qty = 1) {
    const qtyAdd = Store._assertPositiveInt(qty, 'Quantità da posizionare');
    const itemKey = `${articleCode}#${lotCode}`;
    const bucket = this._invByLoc.get(locationCode) || [];
    const existing = bucket.find(i => i.item_key === itemKey);
    const now = Date.now();

    // Caso 1: item già presente in questa ubicazione → incrementa qty
    if (existing) {
      const qtyBefore = existing.qty || 1;
      const qtyAfter = qtyBefore + qtyAdd;
      existing.qty = qtyAfter;
      existing.last_updated_at = now;
      // Aggiorna metadati opzionali se passati
      if (expiryDate && !existing.expiry_date) existing.expiry_date = expiryDate;
      if (notes) existing.notes = (existing.notes ? existing.notes + ' | ' : '') + notes;
      await Persistence.update('inventory', existing._id, {
        qty: qtyAfter,
        last_updated_at: now,
        expiry_date: existing.expiry_date,
        notes: existing.notes
      });
      this._applyToCache('inventory', 'put', existing);
      await this._touchMeta();
      return { ok: true, item: existing, mode: 'incremented', qty_before: qtyBefore, qty_after: qtyAfter };
    }

    // Caso 2: nuovo item
    const rec = {
      item_key: itemKey,
      article_code: articleCode,
      article_description: articleDescription || '',
      lot_code: lotCode,
      expiry_date: expiryDate || '',
      location_code: locationCode,
      qty: qtyAdd,
      placed_at: now,
      last_updated_at: now,
      placed_by: 'operator',
      notes: notes || ''
    };
    const _id = await Persistence.add('inventory', rec);
    const stored = { ...rec, _id };
    this._applyToCache('inventory', 'put', stored);
    // Aggiorna anagrafica articoli se nuovo + descrizione presente
    if (!this._artByCode.has(articleCode) && articleDescription?.trim()) {
      await this.addArticle({ code: articleCode, description: articleDescription, category: this._guessCategory(articleCode) });
    }
    await this._touchMeta();
    return { ok: true, item: stored, mode: 'created', qty_before: 0, qty_after: qtyAdd };
  },

  /* restore esatto di un item preservando metadati incluso qty (per rollback) */
  async restoreItem(item) {
    const clean = { ...item };
    delete clean._id;
    if (typeof clean.qty !== 'number' || clean.qty < 1) clean.qty = 1;  // safety
    const _id = await Persistence.add('inventory', clean);
    const stored = { ...clean, _id };
    this._applyToCache('inventory', 'put', stored);
    await this._touchMeta();
    return stored;
  },

  async removeItem(locationCode, itemKey, qtyRemove = null) {
    if (qtyRemove !== null) qtyRemove = Store._assertPositiveInt(qtyRemove, 'Quantità da prelevare');
    const bucket = this._invByLoc.get(locationCode) || [];
    const idx = bucket.findIndex(i => i.item_key === itemKey);
    if (idx === -1) return null;
    const item = bucket[idx];
    const qtyBefore = item.qty || 1;

    if (Persistence.supportsRemoteOps) {
      const removed = await Persistence.op('removeItem', {
        location_code: locationCode, item_key: itemKey,
        qty: qtyRemove === null ? qtyBefore : qtyRemove
      });
      if (removed._mode === 'full') this._applyToCache('inventory', 'delete', item);
      else {
        item.qty = removed._qty_after;
        item.last_updated_at = Date.now();
        this._applyToCache('inventory', 'put', item);
      }
      return removed;
    }

    // Caso 1: rimozione totale (qtyRemove null o >= qtyBefore)
    if (qtyRemove === null || qtyRemove >= qtyBefore) {
      const removed = { ...item };
      /* TODO F1-REVIEW: la cache viene svuotata PRIMA che la cancellazione
         sia confermata dal supporto. Se la scrittura fallisce, memoria e
         disco divergono finche' qualcuno non chiama reloadCache() — ed e'
         esattamente cio' che fa commitPickStop() nel proprio catch.
         Ordine mantenuto identico alla v2.5.1: centralizzare, non
         correggere. */
      this._applyToCache('inventory', 'delete', item);
      await Persistence.delete('inventory', item._id);
      await this._touchMeta();
      // Decoro il removed con info quantità per logging
      removed._mode = 'full';
      removed._qty_before = qtyBefore;
      removed._qty_after = 0;
      removed._qty_delta = -qtyBefore;
      return removed;
    }

    // Caso 2: rimozione parziale (decrementa qty)
    const qtyAfter = qtyBefore - qtyRemove;
    item.qty = qtyAfter;
    item.last_updated_at = Date.now();
    this._applyToCache('inventory', 'put', item);
    await Persistence.update('inventory', item._id, { qty: qtyAfter, last_updated_at: item.last_updated_at });
    await this._touchMeta();
    // Ritorno copia decorata (NON rimuovo dalla cache)
    const removed = { ...item };
    removed._mode = 'partial';
    removed._qty_before = qtyBefore;
    removed._qty_after = qtyAfter;
    removed._qty_delta = -qtyRemove;
    return removed;
  },

  /* watermark mid-file v1.8.0 */

  // ═══ ITEM EDIT (v1.8.1) ═══
  async updateItemFields(locationCode, itemKey, changes) {
    const bucket = this._invByLoc.get(locationCode) || [];
    const item = bucket.find(i => i.item_key === itemKey);
    if (!item) return null;

    const newArtCode = (changes.article_code ?? item.article_code).toUpperCase().trim();
    const newLotCode = (changes.lot_code ?? item.lot_code).trim();
    const newKey = `${newArtCode}#${newLotCode}`;
    const keyChanged = newKey !== itemKey;

    if (keyChanged) {
      // Key change: rimuovi il record e ricrea con la nuova chiave
      const snapshot = { ...item };
      const removed = await this.removeItem(locationCode, itemKey);
      if (!removed) return null;
      const newRec = {
        item_key: newKey,
        article_code: newArtCode,
        article_description: changes.article_description ?? snapshot.article_description,
        lot_code: newLotCode,
        expiry_date: changes.expiry_date ?? snapshot.expiry_date ?? '',
        location_code: locationCode,
        qty: typeof changes.qty === 'number' ? changes.qty : (snapshot.qty || 1),
        placed_at: snapshot.placed_at,
        last_updated_at: Date.now(),
        placed_by: snapshot.placed_by || 'operator',
        notes: changes.notes ?? snapshot.notes ?? ''
      };
      const _id = await Persistence.add('inventory', newRec);
      const stored = { ...newRec, _id };
      this._applyToCache('inventory', 'put', stored);
      // Aggiorna anagrafica se il nuovo codice è sconosciuto
      if (!this._artByCode.has(newArtCode) && newRec.article_description?.trim()) {
        await this.addArticle({ code: newArtCode, description: newRec.article_description, category: this._guessCategory(newArtCode) });
      }
      await this._touchMeta();
      return { ok: true, item: stored, keyChanged: true, oldKey: itemKey, newKey };
    }

    // Campi semplici: update diretto in DB e cache
    const now = Date.now();
    const updates = { last_updated_at: now };
    if (changes.article_description !== undefined) { updates.article_description = changes.article_description; item.article_description = changes.article_description; }
    if (changes.expiry_date !== undefined)         { updates.expiry_date = changes.expiry_date;             item.expiry_date = changes.expiry_date; }
    if (typeof changes.qty === 'number')            { updates.qty = changes.qty;                             item.qty = changes.qty; }
    if (changes.notes !== undefined)               { updates.notes = changes.notes;                          item.notes = changes.notes; }
    item.last_updated_at = now;
    this._applyToCache('inventory', 'put', item);
    await Persistence.update('inventory', item._id, updates);
    await this._touchMeta();
    return { ok: true, item, keyChanged: false };
  },

  // ═══ ARTICLES ═══
  getArticles() { return this._cache.articles.filter(a => a.active !== false); },
  getArticle(code) { return this._artByCode.get(code) || null; },

  async addArticle(article) {
    if (this._artByCode.has(article.code)) return false;
    const rec = {
      code: article.code,
      description: article.description,
      category: article.category || 'MP',
      supplier: article.supplier || '',
      unit: article.unit || 'PZ',
      weight: parseFloat(article.weight) || 0,
      weight_net_kg: parseFloat(article.weight_net_kg) || 0,
      pieces_per_pack: parseInt(article.pieces_per_pack) || 0,
      length: parseFloat(article.length) || 0,
      width: parseFloat(article.width) || 0,
      height: parseFloat(article.height) || 0,
      min_stock: parseFloat(article.min_stock) || 0,
      max_stock: parseFloat(article.max_stock) || 0,
      notes: article.notes || '',
      active: true,
      created: Date.now()
    };
    /* 1.4.0 — allergeni e classe restano ASSENTI se non li si passa. Zero e
       stringa vuota direbbero «verificato, non ne ha»; assente dice «non lo
       sappiamo», ed e' l'unica delle due che e' vera prima del popolamento. */
    if (Array.isArray(article.allergens)) rec.allergens = article.allergens;
    if (article.temp_class) rec.temp_class = article.temp_class;
    const _id = await Persistence.add('articles', rec);
    const stored = { ...rec, _id };
    this._applyToCache('articles', 'put', stored);
    await this._touchMeta();
    return true;
  },

  /* L'elenco e' una lista bianca, non un filtro: un campo che non e' nominato
     qui non si aggiorna MAI. E' il motivo per cui la maschera di modifica non
     puo' cancellare per sbaglio allergeni e classe pur non mostrandoli. */
  ARTICLE_TEXT_FIELDS: ['description', 'category', 'supplier', 'unit', 'notes'],
  ARTICLE_NUM_FIELDS: ['weight', 'length', 'width', 'height', 'min_stock', 'max_stock',
                       'weight_net_kg', 'pieces_per_pack'],
  ARTICLE_ATTR_FIELDS: ['allergens', 'temp_class'],   // 1.4.0

  async updateArticle(code, updates) {
    const art = this._artByCode.get(code);
    if (!art) return false;
    this._applyArticleUpdates(art, updates);
    this._applyToCache('articles', 'put', art);
    await Persistence.put('articles', art);
    await this._touchMeta();
    return true;
  },

  _applyArticleUpdates(art, updates) {
    for (const f of this.ARTICLE_TEXT_FIELDS) if (updates[f] !== undefined) art[f] = updates[f];
    for (const f of this.ARTICLE_NUM_FIELDS) if (updates[f] !== undefined) art[f] = parseFloat(updates[f]) || 0;
    for (const f of this.ARTICLE_ATTR_FIELDS) {
      if (updates[f] === undefined) continue;
      /* null cancella esplicitamente: serve a togliere una classificazione
         sbagliata, che e' diverso dal non averla mai messa. */
      if (updates[f] === null) delete art[f];
      else art[f] = updates[f];
    }
    return art;
  },

  /* 1.4.0 — L'import dell'anagrafica scrive MIGLIAIA di righe: una per volta
     sono migliaia di richieste, e su un'anagrafica vera non finisce. Qui le
     nuove e le modificate partono in due chiamate sole.

     Aggiorna SOLO i campi presenti in ciascuna riga: un foglio con codice e
     allergeni non deve azzerare descrizioni e pesi di 11.000 articoli. */
  async upsertArticles(righe) {
    const nuovi = [], modificati = [];
    for (const r of righe) {
      const esistente = this._artByCode.get(r.code);
      if (!esistente) { nuovi.push(r); continue; }
      const prima = JSON.stringify(esistente);
      const dopo = this._applyArticleUpdates({ ...esistente }, r);
      if (JSON.stringify(dopo) !== prima) modificati.push(dopo);
    }

    const creati = [];
    for (const r of nuovi) {
      creati.push({
        code: r.code, description: r.description || '', category: r.category || 'MP',
        supplier: r.supplier || '', unit: r.unit || 'PZ',
        weight: parseFloat(r.weight) || 0, weight_net_kg: parseFloat(r.weight_net_kg) || 0,
        pieces_per_pack: parseInt(r.pieces_per_pack) || 0,
        length: parseFloat(r.length) || 0, width: parseFloat(r.width) || 0, height: parseFloat(r.height) || 0,
        min_stock: parseFloat(r.min_stock) || 0, max_stock: parseFloat(r.max_stock) || 0,
        notes: r.notes || '', active: true, created: Date.now(),
        ...(Array.isArray(r.allergens) ? { allergens: r.allergens } : {}),
        ...(r.temp_class ? { temp_class: r.temp_class } : {}),
      });
    }

    if (creati.length) {
      const ids = await Persistence.bulkAdd('articles', creati);
      creati.forEach((rec, i) => this._applyToCache('articles', 'put', { ...rec, _id: ids?.[i] }));
    }
    if (modificati.length) {
      await Persistence.bulkPut('articles', modificati);
      for (const rec of modificati) this._applyToCache('articles', 'put', rec);
    }
    if (creati.length || modificati.length) {
      this._rebuildIndexes();
      await this._touchMeta();
    }
    return { creati: creati.length, modificati: modificati.length };
  },

  async deleteArticle(code) {
    const art = this._artByCode.get(code);
    if (!art) return false;
    art.active = false;
    this._applyToCache('articles', 'put', art);
    await Persistence.put('articles', art);
    await this._touchMeta();
    return true;
  },

  _guessCategory(code) {
    const prefix = (code || '').substring(0, 2).toUpperCase();
    const cats = { MP: 'MP', SL: 'SL', PF: 'PF', AC: 'AC', IM: 'IM' };
    return cats[prefix] || 'MP';
  },

  // ═══ MOVEMENT LOG ═══
  async logMovement(entry) {
    const rec = {
      ts: Date.now(),
      type: entry.type,
      article_code: entry.article_code || '',
      article_description: entry.article_description || '',
      lot_code: entry.lot_code || '',
      location_code: entry.location_code || '',
      dest_location: entry.dest_location || null,
      user: entry.user || '',
      notes: entry.notes || '',
      doc_ref: entry.doc_ref || '',
      // v1.7.0 — tracciamento quantità (Colli)
      qty_before: (typeof entry.qty_before === 'number') ? entry.qty_before : null,
      qty_delta:  (typeof entry.qty_delta  === 'number') ? entry.qty_delta  : null,
      qty_after:  (typeof entry.qty_after  === 'number') ? entry.qty_after  : null
    };
    const _id = await Persistence.add('mov_log', rec);
    this._applyToCache('mov_log', 'put', { ...rec, _id });
    this._cache.movLogTotal++;
    // v1.5.1 fix: aggiorna metadati syncIndicator anche su log movimenti
    await this._touchMeta();
  },

  getMovLog() { return this._cache.movLog; },

  /* Quanti movimenti ci sono davvero in archivio, finestra a parte. */
  getMovLogTotal() { return this._cache.movLogTotal; },

  /* Quanti ne sto tenendo in memoria e da quando. Serve all'interfaccia per
     dire con onesta' su quale porzione di dati si sta ragionando. */
  getMovLogWindowInfo() {
    const days = this.getMovLogWindowDays();
    return {
      days,
      from: this.movLogWindowFrom(),
      inMemory: this._cache.movLog.length,
      total: this._cache.movLogTotal,
      complete: days === 0 || this._cache.movLog.length >= this._cache.movLogTotal
    };
  },

  async queryMovements({ from = null, to = null, type = '', text = '', limit = 2000 } = {}) {
    let criteria = null;
    if (from !== null && to !== null)      criteria = { field: 'ts', op: 'between', value: [from, to] };
    else if (from !== null)                criteria = { field: 'ts', op: 'aboveOrEqual', value: from };
    else if (to !== null)                  criteria = { field: 'ts', op: 'below', value: to };

    const matched = [];
    let scanned = 0, truncated = false;
    const needle = String(text || '').toLowerCase().trim();

    await Persistence.eachChunk('mov_log', { criteria, chunkSize: 5000 }, (rows) => {
      scanned += rows.length;
      for (const m of rows) {
        if (type && m.type !== type) continue;
        if (needle) {
          const hay = `${m.article_code || ''} ${m.article_description || ''} ${m.lot_code || ''} ${m.location_code || ''} ${m.dest_location || ''} ${m.user || ''} ${m.doc_ref || ''}`.toLowerCase();
          if (!hay.includes(needle)) continue;
        }
        matched.push(m);
      }
      if (matched.length > limit) truncated = true;
    });

    matched.sort((a, b) => b.ts - a.ts);
    return { rows: matched.slice(0, limit), matched: matched.length, scanned, truncated };
  },

  async countMovements(criteria = null) {
    return await Persistence.count('mov_log', criteria);
  },

  /* Attraversa TUTTO l'archivio a blocchi, senza materializzarlo.
     Unici chiamanti legittimi: export Excel ed export JSON. */
  async eachMovement(fn, chunkSize = 5000) {
    return await Persistence.eachChunk('mov_log', { chunkSize }, fn);
  },

  async quarantineItem(entry) {
    const q_id = 'Q-' + Date.now().toString(36).toUpperCase();
    const rec = {
      q_id,
      item_key: entry.item_key,
      article_code: entry.article_code,
      article_description: entry.article_description || '',
      lot_code: entry.lot_code,
      original_location: entry.original_location,
      blocked_location: entry.blocked_location,
      qty: entry.qty || 1,
      qty_at_origin_before: entry.qty_at_origin_before ?? null,
      qty_left_at_origin: entry.qty_left_at_origin ?? null,
      partial: entry.partial === true,
      reason: entry.reason,
      operator: entry.operator,
      reference_dept: entry.reference_dept,
      reference_person: entry.reference_person || '',
      created_at: Date.now(),
      released_at: null,
      status: 'active'
    };
    const _id = await Persistence.add('quarantine', rec);
    const stored = { ...rec, _id };
    this._applyToCache('quarantine', 'put', stored);
    await this._touchMeta();
    return stored;
  },

  async releaseQuarantine(q_id, attribution = {}) {
    const rec = this._cache.quarantine.find(q => q.q_id === q_id);
    if (!rec) return null;
    rec.status = 'released';
    rec.released_at = Date.now();
    rec.released_by = attribution.released_by || '';
    rec.released_ref_person = attribution.released_ref_person || '';
    this._applyToCache('quarantine', 'put', rec);
    await Persistence.put('quarantine', rec);
    await this._touchMeta();
    return rec;
  },

  isItemQuarantined(itemKey, locationCode = null) {
    return this._cache.quarantine.some(q =>
      q.status === 'active' && q.item_key === itemKey &&
      (locationCode == null || q.blocked_location === locationCode));
  },

  isItemQuarantinedAnywhere(itemKey) {
    return this._cache.quarantine.some(q => q.status === 'active' && q.item_key === itemKey);
  },

  quarantinedLocationsOf(itemKey) {
    return this._cache.quarantine
      .filter(q => q.status === 'active' && q.item_key === itemKey)
      .map(q => q.blocked_location);
  },

  getActiveQuarantine() { return this._cache.quarantine.filter(q => q.status === 'active'); },
  getQuarantineHistory() { return this._cache.quarantine; },

  async savePendingOutbound(entry) {
    // v2.0.1 [A2] — validazione nel dominio: nessun documento può impegnare
    // più merce di quella effettivamente disponibile.
    this._validateOutboundLines(entry.lines);
    const prefix = entry.kind === 'SHIP' ? 'SHIP' : 'RES';
    const doc_id = `${prefix}-${(entry.ddt_num || 'NA').replace(/[^A-Za-z0-9]/g,'')}-${Date.now().toString(36).toUpperCase()}`;
    const rec = {
      doc_id,
      kind: entry.kind,
      // ── causale [M3]: decide il tipo di movimento all'evasione ──
      causale_id: entry.causale_id || '',
      causale_label: entry.causale_label || '',
      causale_mov: entry.causale_mov || 'SHIP',
      // ── documento ──
      ddt_num: entry.ddt_num || '',
      doc_date: entry.doc_date || '',                          // ISO YYYY-MM-DD
      order_ref: entry.order_ref || '',
      // ── destinatario ──
      destination: entry.destination || '',
      dest_address: entry.dest_address || '',
      dest_zip: entry.dest_zip || '',
      dest_city: entry.dest_city || '',
      dest_province: entry.dest_province || '',
      dest_vat: entry.dest_vat || '',
      ship_to: entry.ship_to || '',                            // luogo di destinazione, se diverso
      // ── trasporto ──
      carrier: entry.carrier || '',
      transport_by: entry.transport_by || '',
      porto: entry.porto || '',
      aspetto: entry.aspetto || '',
      start_transport: entry.start_transport || '',
      expected_pickup_date: entry.expected_pickup_date || '',  // v2.0.0+ — ISO YYYY-MM-DD
      // ── pesi e note ──
      peso_netto: entry.peso_netto || '',
      peso_lordo: entry.peso_lordo || '',
      pieces_total: (typeof entry.pieces_total === 'number') ? entry.pieces_total : null,
      doc_notes: entry.doc_notes || '',
      /* Mittente CONGELATO nel documento: se l'azienda cambia sede, un DDT
         ristampato fra due anni deve riportare quella di allora. */
      sender: entry.sender || null,
      operator: entry.operator || '',
      status: 'pending',
      created_at: Date.now(),
      evaded_at: null,
      cancelled_at: null,
      lines: (entry.lines || []).map(l => ({
        article_code: l.article_code,
        article_description: l.article_description || '',
        lot_code: l.lot_code,
        location_code: l.location_code,
        item_key: l.item_key,
        expiry_date: l.expiry_date || '',
        qty: l.qty,
        qty_at_creation: l.qty_at_creation || l.qty,
        notes: l.notes || ''
      }))
    };
    await Persistence.add('pending_outbound', rec);
    this._applyToCache('pending_outbound', 'put', rec);
    await this._touchMeta();
    return rec;
  },

  /* Aggiorna stato di un documento pendente (evaded / cancelled).
     status: 'evaded' | 'cancelled' */
  async updatePendingStatus(doc_id, status) {
    const rec = this._cache.pendingOut.find(d => d.doc_id === doc_id);
    if (!rec) return null;
    rec.status = status;
    if (status === 'evaded') rec.evaded_at = Date.now();
    if (status === 'cancelled') rec.cancelled_at = Date.now();
    this._applyToCache('pending_outbound', 'put', rec);
    await Persistence.put('pending_outbound', rec);
    await this._touchMeta();
    return rec;
  },

  async updatePendingDoc(doc_id, patch) {
    const rec = this._cache.pendingOut.find(d => d.doc_id === doc_id);
    if (!rec) throw new Error('DDT non trovato');
    if (rec.status !== 'pending') throw new Error('Solo DDT pendenti possono essere modificati');
    // v2.0.1 [A2] — le righe modificate vanno rivalidate contro il disponibile,
    // escludendo dal calcolo le prenotazioni di QUESTO stesso documento.
    if (Array.isArray(patch.lines)) this._validateOutboundLines(patch.lines, doc_id);
    // Aggiorno solo i campi presenti nel patch
    if (patch.ddt_num !== undefined) rec.ddt_num = patch.ddt_num;
    if (patch.destination !== undefined) rec.destination = patch.destination;
    if (patch.carrier !== undefined) rec.carrier = patch.carrier;
    if (patch.expected_pickup_date !== undefined) rec.expected_pickup_date = patch.expected_pickup_date;
    if (Array.isArray(patch.lines)) {
      rec.lines = patch.lines.map(l => ({
        article_code: l.article_code,
        article_description: l.article_description || '',
        lot_code: l.lot_code,
        location_code: l.location_code,
        item_key: l.item_key,
        expiry_date: l.expiry_date || '',
        qty: l.qty,
        qty_at_creation: l.qty_at_creation || l.qty,
        notes: l.notes || ''
      }));
    }
    rec.updated_at = Date.now();
    this._applyToCache('pending_outbound', 'put', rec);
    await Persistence.put('pending_outbound', rec);
    await this._touchMeta();
    return rec;
  },

  /* Restituisce DDT pendenti per kind (RES | SHIP), ordinati dal più recente */
  getPendingOutbound(kind) {
    return this._cache.pendingOut
      .filter(d => d.status === 'pending' && (kind == null || d.kind === kind))
      .sort((a, b) => b.created_at - a.created_at);
  },

  /* Restituisce un singolo documento per ID */
  getPendingDoc(doc_id) {
    return this._cache.pendingOut.find(d => d.doc_id === doc_id);
  },

  getAllOutbound() {
    return [...this._cache.pendingOut].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  },

  /* True se l'item (location_code + item_key) è prenotato in almeno un DDT pendente.
     Usato per impedire doppia prenotazione della stessa giacenza. */
  isItemPendingOutbound(location_code, item_key) {
    return this._cache.pendingOut.some(d =>
      d.status === 'pending' &&
      d.lines.some(l => l.location_code === location_code && l.item_key === item_key)
    );
  },

  /* Restituisce qty totale prenotata per l'item dato (sommata su tutti i pending).
     v2.0.1: aggiunto excludeDocId per escludere il documento in corso di modifica. */
  getPendingQtyForItem(location_code, item_key, excludeDocId = null) {
    let total = 0;
    for (const d of this._cache.pendingOut) {
      if (d.status !== 'pending') continue;
      if (excludeDocId && d.doc_id === excludeDocId) continue;
      for (const l of d.lines) {
        if (l.location_code === location_code && l.item_key === item_key) total += (l.qty || 0);
      }
    }
    return total;
  },

  getPhysicalQty(location_code, item_key) {
    const item = (this._invByLoc.get(location_code) || []).find(i => i.item_key === item_key);
    if (!item) return 0;
    return item.qty || 1;
  },

  getAvailableQty(location_code, item_key, excludeDocId = null) {
    const physical = this.getPhysicalQty(location_code, item_key);
    const reserved = this.getPendingQtyForItem(location_code, item_key, excludeDocId);
    return Math.max(0, physical - reserved);
  },

  /* Elenco dei DDT pendenti che impegnano un dato item in una data ubicazione.
     Usato per la conferma esplicita in Cambio Ubicazione (decisione A-3). */
  getPendingDocsForItem(location_code, item_key) {
    return this._cache.pendingOut.filter(d =>
      d.status === 'pending' &&
      d.lines.some(l => l.location_code === location_code && l.item_key === item_key)
    );
  },

  checkPendingDocIntegrity(doc) {
    const issues = [];
    if (!doc || !Array.isArray(doc.lines)) return { ok: true, issues };
    doc.lines.forEach((l, idx) => {
      const physical = this.getPhysicalQty(l.location_code, l.item_key);
      if (physical === 0) {
        // La merce non è più nell'ubicazione indicata: spostata, prelevata o rettificata.
        const elsewhere = (this._invByKey.get(l.item_key) || []).map(i => i.location_code);
        issues.push({
          lineIndex: idx,
          level: 'error',
          message: elsewhere.length
            ? `${l.article_code}#${l.lot_code}: non più in ${l.location_code} — ora in ${elsewhere.join(', ')}`
            : `${l.article_code}#${l.lot_code}: non più presente in magazzino (${l.location_code})`
        });
      } else if (physical < (l.qty || 0)) {
        issues.push({
          lineIndex: idx,
          level: 'error',
          message: `${l.article_code}#${l.lot_code}: giacenza ${physical} < quantità impegnata ${l.qty} in ${l.location_code}`
        });
      }
    });
    return { ok: issues.length === 0, issues };
  },

  _validateOutboundLines(lines, excludeDocId = null) {
    if (!Array.isArray(lines) || !lines.length) throw new Error('Il documento non contiene righe');
    // Somma le righe che insistono sullo stesso item nello stesso documento
    const perItem = new Map();
    lines.forEach((l, idx) => {
      const qty = Store._assertPositiveInt(l.qty, `Riga ${idx + 1} — quantità`);
      const k = `${l.location_code}|${l.item_key}`;
      perItem.set(k, (perItem.get(k) || 0) + qty);
    });
    for (const [k, requested] of perItem) {
      const [location_code, item_key] = k.split('|');
      const available = this.getAvailableQty(location_code, item_key, excludeDocId);
      if (requested > available) {
        throw new Error(
          `${item_key.replace('#', ' lotto ')} in ${location_code}: richiesti ${requested} colli ` +
          `ma disponibili ${available} (fisici ${this.getPhysicalQty(location_code, item_key)}, ` +
          `già impegnati ${this.getPendingQtyForItem(location_code, item_key, excludeDocId)})`
        );
      }
    }
    return true;
  },

  // ═══ fine gestione pending_outbound v2.0.0 ═══

  /* Ritorna la sessione attiva, o null. Legge dalla cache in memoria,
     allineata a ogni scrittura. */
  getActivePickSession() {
    return this._cache.pickSession || null;
  },

  async startPickSession(session) {
    try {
      await Persistence.transaction(['pick_session'], async () => {
        await Persistence.clear('pick_session');
        await Persistence.put('pick_session', session);
      });
      this._applyToCache('pick_session', 'put', session);
      await this._touchMeta();
      return session;
    } catch (err) {
      console.error('[WM] startPickSession:', err);
      throw new Error('Impossibile salvare la sessione di prelievo: ' + err.message);
    }
  },

  async savePickSession(session) {
    if (!session?.session_id) throw new Error('Sessione di prelievo priva di identificativo');
    session.updated_at = Date.now();
    await Persistence.put('pick_session', session);
    this._applyToCache('pick_session', 'put', session);
    await this._touchMeta();
    return session;
  },

  async endPickSession() {
    try {
      await Persistence.clear('pick_session');
    } catch (err) {
      console.error('[WM] endPickSession:', err);
    }
    this._applyToCache('pick_session', 'clear');
    await this._touchMeta();
  },

  async commitPickStop({ session, stop, qty, movement }) {
    if (!session?.session_id) throw new Error('Sessione di prelievo priva di identificativo');
    if (!stop) throw new Error('Tappa non identificata');

    let removed = null;
    try {
      /* `meta` e' inclusa perche' _touchMeta() vi scrive: escluderla
         farebbe fallire la transazione con TransactionInactiveError. */
      await Persistence.transaction(['inventory', 'mov_log', 'pick_session', 'meta'], async () => {
        removed = await this.removeItem(stop.location_code, stop.item_key, qty);
        if (!removed) throw new Error('Scarico della giacenza non riuscito');

        await this.logMovement({
          ...movement,
          qty_before: removed._qty_before,
          qty_delta: removed._qty_delta,
          qty_after: removed._qty_after
        });

        stop.status = 'done';
        stop.qty_picked = qty;
        stop.done_at = Date.now();
        session.updated_at = Date.now();
        await Persistence.put('pick_session', session);
        this._applyToCache('pick_session', 'put', session);
      });
    } catch (err) {
      try {
        await this.reloadCache();
      } catch (e2) {
        console.error('[WM] commitPickStop — riallineamento cache:', e2);
      }
      throw err;
    }
    return removed;
  },

  async archivePickReport(snap) {
    if (!snap?.doc_id) return null;
    try {
      await Persistence.put('pick_archive', snap);
      this._applyToCache('pick_archive', 'put', snap);
      await this._touchMeta();
      return snap;
    } catch (err) {
      console.error('[WM] archivePickReport:', err);
      return null;
    }
  },

  getPickReportByOdp(odpNum) {
    const norm = v => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const key = norm(odpNum);
    if (!key) return null;
    return this._cache.pickArchive
      .filter(x => norm(x.odp_num) === key)
      .sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0))[0] || null;
  },

  getPickReports() { return this._cache.pickArchive; },

  async archiveDisposal(snap) {
    if (!snap?.doc_id) return null;
    try {
      await Persistence.put('disposal_archive', snap);
      this._applyToCache('disposal_archive', 'put', snap);
      await this._touchMeta();
      return snap;
    } catch (err) {
      console.error('[WM] archiveDisposal:', err);
      return null;
    }
  },

  /* Verbali dal piu' recente. `limit` esiste perche' la sezione Documenti
     ne mostra una manciata e non ha motivo di scorrere sei anni di storico. */
  getDisposals(limit = null) {
    const all = this._cache.disposalArchive;
    return limit ? all.slice(0, limit) : all;
  },

  getDisposal(doc_id) {
    return this._cache.disposalArchive.find(d => d.doc_id === doc_id) || null;
  },

  nextDisposalSeq() {
    const anno = new Date().getFullYear();
    const n = this._cache.disposalArchive.filter(d =>
      new Date(d.created_at || 0).getFullYear() === anno).length;
    return `SMA-${anno}-${String(n + 1).padStart(4, '0')}`;
  },

  DOC_CONFIG_DEFAULTS: {
    sender: {
      name: '', legal_form: '', address: '', zip: '', city: '', province: '',
      vat: '', fiscal_code: '', rea: '', phone: '', email: '',
      warehouse_address: ''      // sede operativa, se diversa dalla legale
    },
    /* `mov` decide il tipo di movimento a registro [M3]. Solo due valori
       ammessi: 'RET' e 'SHIP'. */
    causali: [
      { id: 'vendita',    label: 'Vendita',                mov: 'SHIP' },
      { id: 'reso_forn',  label: 'Reso a fornitore',       mov: 'RET'  },
      { id: 'reso_cli',   label: 'Reso da cliente',        mov: 'RET'  },
      { id: 'c_lavoraz',  label: 'Conto lavorazione',      mov: 'SHIP' },
      { id: 'c_visione',  label: 'Conto visione',          mov: 'SHIP' },
      { id: 'omaggio',    label: 'Omaggio',                mov: 'SHIP' },
      { id: 'trasf_int',  label: 'Trasferimento interno',  mov: 'SHIP' },
      { id: 'riparaz',    label: 'Riparazione',            mov: 'SHIP' },
      { id: 'campion',    label: 'Campionatura',           mov: 'SHIP' }
    ],
    disposalReasons: [
      { id: 'non_conforme', label: 'NON CONFORME' },
      { id: 'scaduto',      label: 'SCADUTO/OBSOLETO' }
    ],
    ddt: {
      last_number: '',           // ultimo numero emesso, per la proposta [M4]
      default_porto: 'Franco',   // Franco | Assegnato
      default_trasporto: 'Vettore'  // Mittente | Destinatario | Vettore
    }
  },

  /* Lettura sempre fusa con i default: una configurazione salvata da una
     versione precedente non deve far mancare le chiavi aggiunte dopo. */
  getDocConfig() {
    const saved = this._cache.meta?.docConfig || {};
    const D = this.DOC_CONFIG_DEFAULTS;
    return {
      sender: { ...D.sender, ...(saved.sender || {}) },
      causali: Array.isArray(saved.causali) && saved.causali.length ? saved.causali : D.causali.slice(),
      disposalReasons: Array.isArray(saved.disposalReasons) && saved.disposalReasons.length
        ? saved.disposalReasons : D.disposalReasons.slice(),
      ddt: { ...D.ddt, ...(saved.ddt || {}) }
    };
  },

  async saveDocConfig(cfg) {
    const merged = { ...this.getDocConfig(), ...cfg };
    await Persistence.put('meta', { key: 'docConfig', value: merged });
    this._applyToCache('meta', 'put', { key: 'docConfig', value: merged });
    this._cache.meta.docConfig = merged;
    await this._touchMeta();
    return merged;
  },

  getCausale(id) {
    const list = this.getDocConfig().causali;
    return list.find(c => c.id === id) || null;
  },

  movTypeForCausale(id) {
    const c = this.getCausale(id);
    return c && c.mov === 'RET' ? MOV.RET : MOV.SHIP;
  },

  proposeDdtNumber() {
    const last = String(this.getDocConfig().ddt.last_number || '').trim();
    if (!last) return '';
    const m = last.match(/^(.*?)(\d+)(\D*)$/);
    if (!m) return '';
    const [, prefix, digits, suffix] = m;
    const next = String(parseInt(digits, 10) + 1).padStart(digits.length, '0');
    return `${prefix}${next}${suffix}`;
  },

  /* Memorizza l'ultimo numero effettivamente usato, cosi' la proposta
     successiva riparte da li' anche se l'operatore l'aveva sovrascritto. */
  async rememberDdtNumber(num) {
    const clean = String(num || '').trim();
    if (!clean) return;
    const cfg = this.getDocConfig();
    await this.saveDocConfig({ ddt: { ...cfg.ddt, last_number: clean } });
  },

  getKnownRecipients() {
    const byName = new Map();
    for (const d of this._cache.pendingOut) {
      const key = String(d.destination || '').trim().toUpperCase();
      if (!key) continue;
      const prev = byName.get(key);
      if (prev && (prev.created_at || 0) >= (d.created_at || 0)) continue;
      byName.set(key, {
        created_at: d.created_at,
        destination: d.destination || '',
        dest_address: d.dest_address || '',
        dest_zip: d.dest_zip || '',
        dest_city: d.dest_city || '',
        dest_province: d.dest_province || '',
        dest_vat: d.dest_vat || '',
        ship_to: d.ship_to || '',
        carrier: d.carrier || ''
      });
    }
    return [...byName.values()].sort((a, b) =>
      (a.destination || '').localeCompare(b.destination || '', 'it'));
  },

  buildLocationGeometry() {
    const geo = new Map();
    for (const site of this.getSites()) {
      const zones = this.getZones(site.id);
      zones.forEach((zone, zoneIdx) => {
        const levels = zone.levels || ['T'];
        for (const loc of this._genLocations(site.id, zone)) {
          geo.set(loc.code, {
            site_id: site.id,
            zone_id: zone.id,
            zone_idx: zoneIdx,
            type: zone.type,
            aisle: loc.aisle ?? loc.row ?? 0,
            bay: loc.bay ?? loc.position ?? 0,
            level: loc.level ?? '',
            level_idx: loc.level ? Math.max(0, levels.indexOf(loc.level)) : 0
          });
        }
      });
    }
    return geo;
  },

  findNearestBlockedLocation(currentLocCode) {
    const parts = currentLocCode.split('-');
    const siteId = parts[0];
    const currentZone = parts[1] || '';
    const site = this.getSite(siteId);
    if (!site) return null;
    const candidates = [];
    for (const zone of (site.zones || []).filter(z => z.active)) {
      for (const loc of this._genLocations(siteId, zone)) {
        if (this.getLocationStatus(loc.code) === 'blocked') {
          const hasItems = (this._invByLoc.get(loc.code)?.length ?? 0) > 0;
          candidates.push({ ...loc, zoneId: zone.id, zoneName: zone.name, hasItems, priority: hasItems ? 2 : 1 });
        }
      }
    }
    candidates.sort((a, b) =>
      (a.zoneId === currentZone ? 0 : 1) - (b.zoneId === currentZone ? 0 : 1)
    );
    return candidates[0] || null;
  },

  // ═══ STATS / KPI ═══
  getSiteStats(siteId) {
    const zones = this.getZones(siteId);
    let total = 0, occupied = 0, blocked = 0, reserved = 0, disabled = 0;
    for (const zone of zones) {
      for (const loc of this._genLocations(siteId, zone)) {
        total++;
        const s = this.getLocationStatus(loc.code);
        if (s === 'occupied') occupied++;
        else if (s === 'blocked') blocked++;
        else if (s === 'reserved') reserved++;
        else if (s === 'disabled') disabled++;
      }
    }
    return { total, occupied, blocked, reserved, disabled, empty: total - occupied - blocked - reserved - disabled };
  },

  getZoneStats(siteId, zoneId) {
    const locs = this.generateLocations(siteId, zoneId);
    let total = 0, occupied = 0, blocked = 0, reserved = 0, disabled = 0;
    for (const loc of locs) {
      total++;
      const s = this.getLocationStatus(loc.code);
      if (s === 'occupied') occupied++;
      else if (s === 'blocked') blocked++;
      else if (s === 'reserved') reserved++;
      else if (s === 'disabled') disabled++;
    }
    return { total, occupied, blocked, reserved, disabled, empty: total - occupied - blocked - reserved - disabled };
  },

  computeKPIs() {
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();
    const log = this._cache.movLog;
    let totalLocs = 0, occupiedLocs = 0, blockedLocs = 0, reservedLocs = 0, disabledLocs = 0, totalItems = 0;
    const zoneSummaries = [];
    for (const site of this.getSites()) {
      for (const zone of (site.zones || []).filter(z => z.active)) {
        const locs = this._genLocations(site.id, zone);
        let zOcc = 0, zItems = 0;
        for (const loc of locs) {
          totalLocs++;
          const items = this._invByLoc.get(loc.code) || [];
          totalItems += items.length; zItems += items.length;
          const st = this.getLocationStatus(loc.code);
          if (st === 'occupied') { occupiedLocs++; zOcc++; }
          else if (st === 'blocked') blockedLocs++;
          else if (st === 'reserved') reservedLocs++;
          else if (st === 'disabled') disabledLocs++;
        }
        zoneSummaries.push({ siteId: site.id, siteName: site.name, zoneId: zone.id, zoneName: zone.name, type: zone.type, total: locs.length, occupied: zOcc, items: zItems });
      }
    }
    const emptyLocs = totalLocs - occupiedLocs - blockedLocs - reservedLocs - disabledLocs;
    const occPct = totalLocs ? Math.round(occupiedLocs / totalLocs * 100) : 0;
    const typeCounts = {};
    let todayMov = 0, todayPick = 0;
    for (const m of log) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
      if (m.ts >= todayTs) { todayMov++; if (m.type === 'PICK') todayPick++; }
    }
    const dailyTrend = [];
    for (let d = 13; d >= 0; d--) {
      const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - d);
      const start = dt.getTime(), end = start + 86400000;
      let count = 0, picks = 0;
      for (const m of log) {
        if (m.ts >= start && m.ts < end) { count++; if (m.type === 'PICK') picks++; }
      }
      dailyTrend.push({ label: dt.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit' }), total: count, picks });
    }
    const hourlyDist = new Array(24).fill(0);
    for (const m of log) if (m.ts >= todayTs) hourlyDist[new Date(m.ts).getHours()]++;
    // Avg pick times (batch 5 min)
    const pickEntries = log.filter(m => m.type === 'PICK').sort((a,b) => a.ts - b.ts);
    const pickOrders = [];
    let order = [];
    for (const p of pickEntries) {
      if (!order.length) { order.push(p); continue; }
      if (p.ts - order[order.length-1].ts < 5*60*1000) order.push(p);
      else { pickOrders.push(order); order = [p]; }
    }
    if (order.length) pickOrders.push(order);
    let avgPickTimeOrder = 0, avgPickTimeItem = 0;
    if (pickOrders.length) {
      const durs = pickOrders.map(o => Math.max((o[o.length-1].ts - o[0].ts) / 1000, 10));
      avgPickTimeOrder = Math.round(durs.reduce((s,d) => s+d, 0) / durs.length);
      const totPicks = pickOrders.reduce((s,o) => s + o.length, 0);
      const totTime = durs.reduce((s,d) => s+d, 0);
      avgPickTimeItem = totPicks ? Math.round(totTime / totPicks) : 0;
    }
    const fixCount = (typeCounts['FIX+'] || 0) + (typeCounts['FIX-'] || 0);
    const totalMovements = log.length;
    const invChecks = fixCount + (typeCounts['IN'] || 0); // denominatore più realistico
    const accuracyPct = invChecks > 0 ? Math.max(0, Math.round((1 - fixCount / invChecks) * 100)) : 100;
    const artFreq = {};
    for (const m of log) if (m.article_code) artFreq[m.article_code] = (artFreq[m.article_code] || 0) + 1;
    const topArticles = Object.entries(artFreq).sort((a,b) => b[1]-a[1]).slice(0,8).map(([code,count]) => ({ code, count }));
    return {
      totalLocs, occupiedLocs, emptyLocs, blockedLocs, reservedLocs, disabledLocs, occPct,
      totalItems, todayMov, todayPick,
      typeCounts, dailyTrend, hourlyDist, zoneSummaries,
      pickOrders: pickOrders.length, avgPickTimeOrder, avgPickTimeItem,
      accuracyPct, fixCount, totalMovements, topArticles
    };
  },

  // ═══ EXPORT / IMPORT ═══
  async exportAll({ includeMovLog = true } = {}) {
    const movLog = [];
    if (includeMovLog) {
      await this.eachMovement(rows => { for (const r of rows) movLog.push(r); });
      movLog.sort((a, b) => b.ts - a.ts);
    }
    const data = {
      _format: 'warehouse-mapper-v1.5',
      _author: 'Andrea Sacchetti',
      _appVersion: '1.2.0',
      _exported: new Date().toISOString(),
      sites: this._cache.sites.map(s => { const { zones, ...p } = s; return p; }),
      zones: this._cache.zones,
      articles: this._cache.articles,
      inventory: this._cache.inventory,
      loc_status: [...this._cache.locStatus.values()],
      disabled: [...this._cache.disabled].map(code => ({ location_code: code })),
      mov_log: movLog,
      quarantine: this._cache.quarantine,
      pending_outbound: this._cache.pendingOut,   // v2.0.0
      pick_archive: this._cache.pickArchive,      // v2.5.1 — report di prelievo emessi
      disposal_archive: this._cache.disposalArchive,   // v3.0.0 [M2] — verbali di smaltimento
      doc_config: this._cache.meta?.docConfig || null,
      operators: this._cache.operators,
      // 1.4.0 — vuote finché non si accende l'interruttore che le riguarda
      lots: this._cache.lots,
      udc: this._cache.udc,
      tasks: this._cache.tasks,
      wip: this._cache.wip,
      storage_rules: this._cache.storageRules
    };
    if (!includeMovLog) delete data.mov_log;     // omissione, non dichiarazione
    data._counts = this._countsOf(data);
    if (!includeMovLog) delete data._counts.mov_log;
    if (movLog.length) {
      data._movRange = { from: movLog[movLog.length - 1].ts, to: movLog[0].ts };
    }
    return data;
  },

  _countsOf(data) {
    const out = {};
    for (const k of COLLEZIONI_EXPORT) {
      out[k] = Array.isArray(data[k]) ? data[k].length : 0;
    }
    return out;
  },

  verifyExportPackage(data) {
    const problemi = [];
    if (!data || typeof data !== 'object') return { ok: false, problemi: ['File non leggibile o non JSON.'] };
    if (!String(data._format || '').startsWith('warehouse-mapper-v1.5')) {
      problemi.push(`Formato non riconosciuto: "${data._format || 'assente'}". Atteso warehouse-mapper-v1.5.x`);
    }
    if (data._counts) {
      const reali = this._countsOf(data);
      for (const [k, atteso] of Object.entries(data._counts)) {
        if (reali[k] !== atteso) problemi.push(`${k}: il file dichiara ${atteso} record, ne contiene ${reali[k]}`);
      }
    } else {
      problemi.push('Il file non porta i conteggi di controllo (backup anteriore alla v2.8.0): impossibile verificarne la completezza.');
    }
    /* Un pacchetto senza nessun dato di magazzino e' quasi sempre un file
       sbagliato, non un magazzino vuoto. Vale la pena chiederlo. */
    const totale = Object.values(this._countsOf(data)).reduce((s, n) => s + n, 0);
    if (totale === 0) problemi.push('Il file non contiene alcun record.');
    return { ok: problemi.length === 0, problemi };
  },

  async importAll(data, mode = 'overwrite') {
    if (!data._format?.startsWith('warehouse-mapper-v1.5')) {
      throw new Error('Formato file non supportato. Richiesto: warehouse-mapper-v1.5.x');
    }
    if (mode === 'overwrite') {
      /* SI SVUOTA TUTTO CIO' CHE SI PUO' RIEMPIRE, non solo cio' che il file
         porta. Una collezione assente dal pacchetto ma piena a database
         sopravviverebbe al ripristino: UDC e conti WIP che puntano a righe
         di giacenza appena sostituite. Il ripristino deve lasciare il
         magazzino nello stato del file, non in una miscela dei due. */
      await Persistence.transaction([...COLLEZIONI_EXPORT, 'meta'], async () => {
        await Persistence.clearMany(COLLEZIONI_EXPORT);
        for (const c of COLLEZIONI_EXPORT) {
          const righe = data[c];
          if (!Array.isArray(righe) || !righe.length) continue;
          /* `_id` lo assegna il supporto: si butta via e si riassegna. Su
             `sites` cade anche `zones`, che in cache è ricostruito e non è
             una colonna. */
          let pulite = CHIAVE_PRIMARIA[c] === '_id' ? righe.map(({ _id, ...r }) => r) : righe;
          if (c === 'sites') pulite = pulite.map(({ zones, ...r }) => r);
          await Persistence.bulkAdd(c, pulite);
        }
        if (data.doc_config) await Persistence.put('meta', { key: 'docConfig', value: data.doc_config });
      });
    } else { // merge
      await Persistence.transaction(['sites', 'zones', 'articles', 'inventory'], async () => {
        for (const s of (data.sites || [])) {
          if (!this._cache.sites.find(x => x.id === s.id)) {
            const { _id, zones, ...r } = s;
            await Persistence.add('sites', r);
          }
        }
        for (const z of (data.zones || [])) {
          if (!this._cache.zones.find(x => x.site_id === z.site_id && x.id === z.id)) {
            const { _id, ...r } = z;
            await Persistence.add('zones', r);
          }
        }
        for (const a of (data.articles || [])) {
          if (!this._artByCode.has(a.code)) {
            const { _id, ...r } = a;
            await Persistence.add('articles', r);
          }
        }
        for (const i of (data.inventory || [])) {
          const exists = this._cache.inventory.find(x => x.location_code === i.location_code && x.item_key === i.item_key);
          if (!exists) {
            const { _id, ...r } = i;
            await Persistence.add('inventory', r);
          }
        }
      });
    }
    await this._loadCache();
    this._rebuildIndexes();
  },

  async resetAll() {
    const tutte = [...COLLEZIONI];
    await Persistence.transaction(tutte, async () => {
      await Persistence.clearMany(tutte);
    });
    for (const c of Persistence.COLLECTIONS) this._applyToCache(c, 'clear');
    this._rebuildIndexes();
  },

  async forceSave() {
    const disco = await Persistence.countAll();

    const cache = {
      sites: this._cache.sites.length,
      zones: this._cache.zones.length,
      articles: this._cache.articles.length,
      inventory: this._cache.inventory.length,
      loc_status: this._cache.locStatus.size,
      disabled: this._cache.disabled.size,
      quarantine: this._cache.quarantine.length,
      pending_outbound: this._cache.pendingOut.length,
      pick_archive: this._cache.pickArchive.length,
      disposal_archive: this._cache.disposalArchive.length,   // v3.0.0 [M2]
      operators: this._cache.operators.length
    };

    const divergenze = [];
    for (const [k, n] of Object.entries(cache)) {
      if (disco[k] !== n) divergenze.push({ collection: k, memoria: n, disco: disco[k] });
    }
    if (disco.mov_log !== this._cache.movLogTotal) {
      divergenze.push({ collection: 'mov_log', memoria: this._cache.movLogTotal, disco: disco.mov_log });
    }

    const ts = Date.now();
    await Persistence.bulkPut('meta', [
      { key: 'lastModified', value: ts },
      { key: 'unsavedChanges', value: false }
    ]);
    this._applyToCache('meta', 'put', { key: 'lastModified', value: ts });
    this._applyToCache('meta', 'put', { key: 'unsavedChanges', value: false });

    /* Il disco ha ragione: e' cio' che si ritrovera' al prossimo avvio. */
    if (divergenze.length) {
      console.warn('[WM] checkpoint: cache e database divergono, riallineo dal disco', divergenze);
      await this.reloadCache();
    }

    return {
      ts,
      counts: {
        sites: disco.sites, zones: disco.zones, articles: disco.articles,
        inventory: disco.inventory, locStatus: disco.loc_status, disabled: disco.disabled,
        movLog: disco.mov_log, quarantine: disco.quarantine,
        pendingOut: disco.pending_outbound, pickArchive: disco.pick_archive,
        disposalArchive: disco.disposal_archive,   // v3.0.0 [M2]
        operators: disco.operators
      },
      divergenze
    };
  },

  // ═══ DB storage estimate ═══
  async estimateUsage() {
    return await Persistence.estimateUsage();
  },

  BACKUP_INTERVAL_MS: 7 * 24 * 60 * 60 * 1000,   // 7 giorni
  BACKUP_KEEP: 4,                                  // mantieni ultime 4 copie
  BACKUP_PREFIX: 'wm-auto-',

  /* Verifica se il supporto attivo sa fare backup locali. */
  isOPFSSupported() {
    return Persistence.supportsLocalBackup && Persistence.isBackupSupported();
  },

  /* Scrive un backup JSON corrente. Ritorna il filename. */
  async writeOPFSBackup() {
    if (!this.isOPFSSupported()) throw new Error('OPFS non supportato dal browser');
    const data = await this.exportAll({ includeMovLog: false });
    data._auto = true;
    data._partial = 'senza registro movimenti';
    const json = JSON.stringify(data);
    const ts = new Date();
    const stamp = ts.toISOString().slice(0, 10) + '_' + ts.toTimeString().slice(0, 8).replace(/:/g, '');
    const filename = `${this.BACKUP_PREFIX}${stamp}.json`;
    await Persistence.writeBackup(filename, json);
    // Aggiorna meta lastAutoBackup
    const now = Date.now();
    this._applyToCache('meta', 'put', { key: 'lastAutoBackup', value: now });
    await Persistence.put('meta', { key: 'lastAutoBackup', value: now });
    await this.cleanupOldOPFSBackups();
    return { filename, ts: now, size: json.length };
  },

  /* Elenca i backup, dal più recente al più vecchio. */
  async listOPFSBackups() {
    if (!this.isOPFSSupported()) return [];
    return await Persistence.listBackups(this.BACKUP_PREFIX);
  },

  /* Mantiene solo gli ultimi BACKUP_KEEP file. */
  async cleanupOldOPFSBackups() {
    const list = await this.listOPFSBackups();
    if (list.length <= this.BACKUP_KEEP) return 0;
    const toDelete = list.slice(this.BACKUP_KEEP);
    let removed = 0;
    for (const f of toDelete) {
      if (await Persistence.deleteBackup(f.name)) removed++;
    }
    return removed;
  },

  /* Legge il contenuto di un backup specifico (per restore manuale). */
  async readOPFSBackup(filename) {
    if (!this.isOPFSSupported()) throw new Error('OPFS non supportato');
    return await Persistence.readBackup(filename);
  },

  async requestPersistentStorage() {
    if (!navigator.storage?.persist) return { granted: false, reason: 'API non disponibile su questo browser.' };
    try {
      if (await navigator.storage.persisted()) return { granted: true, reason: '' };
      const ok = await navigator.storage.persist();
      return { granted: ok, reason: ok ? '' : this._persistDenialReason() };
    } catch (err) {
      return { granted: false, reason: `Richiesta non riuscita: ${err.message}` };
    }
  },

  async storagePersistenceState() {
    if (!navigator.storage?.persisted) return { granted: false, reason: 'API non disponibile su questo browser.' };
    try {
      const granted = await navigator.storage.persisted();
      return { granted, reason: granted ? '' : this._persistDenialReason() };
    } catch {
      return { granted: false, reason: 'Stato non verificabile.' };
    }
  },

  _persistDenialReason() {
    if (location.protocol === 'file:') {
      return 'L’applicativo è aperto come file locale (file://) e Chrome non concede la persistenza a questa origine. ' +
             'Per ottenerla va servito da http://localhost o da un indirizzo https interno. ' +
             'Finché resta un file locale, la difesa è la copia esterna su OneDrive.';
    }
    return 'Il browser ha negato la richiesta: di norma la concede dopo un uso ripetuto del sito, ' +
           'oppure se il sito viene installato o aggiunto ai preferiti.';
  },

  /* Verifica se è ora di un backup automatico (intervallo > 7gg). */
  shouldAutoBackup() {
    if (!this.isOPFSSupported()) return false;
    const last = this._cache.meta.lastAutoBackup;
    if (!last) return true;
    return (Date.now() - last) >= this.BACKUP_INTERVAL_MS;
  },

  /* Hook chiamato all'avvio: se è ora di backup, lo esegue silenziosamente. */
  async checkAutoBackup() {
    if (!this.shouldAutoBackup()) return null;
    // Niente backup se DB praticamente vuoto
    if (!this._cache.sites.length && !this._cache.articles.length && !this._cache.inventory.length) return null;
    try {
      const result = await this.writeOPFSBackup();
      console.info(`[WM] Auto-backup OPFS creato: ${result.filename} (${(result.size/1024).toFixed(1)} KB)`);
      return result;
    } catch (err) {
      console.warn('[WM] Auto-backup OPFS fallito:', err);
      return null;
    }
  }
};

export { Store };
