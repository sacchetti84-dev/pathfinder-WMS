import { MOV } from './costanti';
import type { MOV as MovTipo, Criterio } from '../types/contratto';
import { Persistence } from './persistence/index';
import { COLLEZIONI, type Collezione } from '../types/collezioni';
import type {
  StatoUbicazione, UbicazioneDisattivata,
  Sito, Zona, Articolo, Giacenza, Movimento, Quarantena, DocumentoUscita,
  RigaDocumento, SessionePrelievo, ReportPrelievo, VerbaleSmaltimento,
  Operatore, Istante, Coordinate, GiacenzaRimossa, IngressoArticolo, Compito,
  Lotto, Destinatario, Destinazione,
} from '../types/entita';
import {
  PRIORITA_NORMALE, ORE_URGENZA_DEFAULT, eAperto, ordinaCoda, componiCompito, validaRichiesta,
  prioritaConsentita, transizioneAmmessa, etichettaPriorita, etichettaStato,
  riepilogo as riepilogoCompiti, type Richiesta as RichiestaCompito,
  avanzamento, avvioRitirabile,
} from '../modules/compiti';
import {
  FORMA_CACHE, applicaAllaCache, bucketPut, bucketDelete,
  indicizzaGiacenza, ricostruisciIndici, indiciVuoti, metaVuota, cacheVuota,
  chiaveLotto, type Operazione,
} from './cache';
import {
  configurazione as configurazioneUom, congela as congelaLotto, daLotto,
  suddividi, uomDaColli, verifica as verificaUm,
  sommaUom, sottraiUom, arrotonda as arrotondaUom, decimali as decimaliUom,
  type Configurazione,
} from '../modules/misure';
import {
  parametriDiSerie, leggiParametri, unisci as unisciVoci,
  type ParametriArticolo, type Voce,
} from '../modules/parametri';
import { ALLERGENI, CLASSI_TEMPERATURA } from '../modules/anagrafica';
import {
  trovaDestinatario, cerca as cercaDestinatari, chiaveDestinatario,
  componiDestinatario, conDestinazione, normalizzaPIva,
} from '../modules/destinatari';
import { UNITA_MISURA } from '../modules/misure';
import { generaUbicazioni, codiciAttivi, costruisciGeometria } from './geometria';
import { ordinaFEFO, primoFEFO, eFEFO, cercaGiacenze } from './giacenza';
import {
  FORMATO as FORMATO_PACCHETTO, COLLEZIONI_EXPORT, righeDaScrivere,
  componi as componiPacchetto, conta as contaPacchetto, verifica as verificaPacchetto,
} from './pacchetto';
import { statoUbicazione, contaStati, calcolaKPI } from './statistiche';
import { verificaConformita } from '../modules/conformita';
import { App } from '../ui/app.js';

/* UN RILASCIO INSTALLATO NON E' UNA FUNZIONE ACCESA.
   Le cinque della 1.4 entrano in magazzino a interruttore spento e si
   accendono una alla volta, a inizio turno, su un magazzino alla volta. Se
   qualcosa si muove nel verso sbagliato si spegne l'interruttore: non si
   disinstalla niente e non si tocca il database.

   Vivono in `meta` una chiave per una, e non in un unico record, proprio
   perche' accenderne due nello stesso turno deve costare due gesti
   distinti: se poi qualcosa si muove, si sa quale delle due e' stata. */
const FEATURES = ['tasks', 'uom', 'udc', 'putaway', 'wip'];
const CHIAVE_FEATURE = (nome: string) => `feature.${nome}`;

const Store = {
  _assertPositiveInt(value: unknown, label: string = 'Quantità') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${label}: valore non numerico`);
    if (!Number.isInteger(n)) throw new Error(`${label}: sono ammessi solo numeri interi (ricevuto ${n})`);
    if (n < 1) throw new Error(`${label}: deve essere maggiore di zero (ricevuto ${n})`);
    return n;
  },

  /* Cache in-memory. Popolata all'init, aggiornata ad ogni mutazione.
     Consente letture sincrone dal layer UI senza richiedere async.

     La forma sta in `core/cache.ts`, insieme alle prove: chi la costruisce
     qui e chi la costruisce in un collaudo partono dallo stesso oggetto. */
  _cache: cacheVuota(),

  MOVLOG_WINDOW_KEY: 'wm_movlog_window_days',
  MOVLOG_WINDOW_DEFAULT: 120,
  MOVLOG_WINDOW_MIN: 7,
  MOVLOG_WINDOW_MAX: 3650,
  _movLogWindowDays: null as number | null,

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

  setMovLogWindowDays(days: number | string) {
    const n = parseInt(String(days), 10);
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

  /* `null` fino al primo `_rebuildIndexes()`: prima di allora nessuna
     ubicazione esiste ancora, e `locationExists` deve dire di no invece di
     rispondere su un insieme vuoto che sembra costruito. */
  _locIndex: null as Set<string> | null,

  /* Gli indici derivati vivono in `core/cache.ts` e ci stanno DENTRO un
     oggetto, non sparsi: `applicaAllaCache` deve poterli sostituire su
     `clear`, e tre riferimenti separati resterebbero appesi a Map morte.
     I tre getter tengono in piedi i trenta punti che li leggono per nome. */
  _indici: indiciVuoti(),
  get _invByLoc()  { return this._indici.invByLoc; },   // Map<location_code → item[]>
  get _invByKey()  { return this._indici.invByKey; },   // Map<item_key → item[]>
  get _artByCode() { return this._indici.artByCode; },  // Map<code → article>
  get _lotByKey()  { return this._indici.lotByKey; },   // Map<articolo#lotto → lotto>

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
    const rec = ((typeof App !== 'undefined' ? App.currentOperatorRecord : null) || null) as Operatore | null;
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

  getOperator(opId: string) {
    return this._cache.operators.find(o => o.op_id === opId) || null;
  },

  getOperatorByInitials(initials: string) {
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

  async addOperator(rec: Partial<Operatore> & { initials: string }) {
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

  async updateOperator(opId: string, changes: Partial<Operatore>) {
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

  getLotsForArticle(articleCode: string) {
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
    const zonesBySite: Record<string, Zona[]> = {};
    for (const z of zones) { (zonesBySite[z.site_id] = zonesBySite[z.site_id] || []).push(z); }
    for (const s of sites) { s.zones = zonesBySite[s.id] || []; }
    this._cache.sites = sites;
    this._cache.zones = zones;
    this._cache.articles = articles;
    this._cache.inventory = inventory;
    this._cache.locStatus = new Map(locStat.map((l: StatoUbicazione) => [l.location_code, l]));
    this._cache.disabled = new Set(disabled.map((d: UbicazioneDisattivata) => d.location_code));
    this._cache.movLog = movLog;
    this._cache.movLogTotal = movLogTotal;   // v2.8.0 [H2] — quanti ce ne sono davvero
    this._cache.quarantine = quarantine;
    this._cache.pendingOut = pendingOut; // v2.0.0 — DDT pendenti di uscita
    this._cache.pickSession = pickSessions.length
      ? pickSessions.sort((a: SessionePrelievo, b: SessionePrelievo) => (b.created_at || 0) - (a.created_at || 0))[0] ?? null
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
    this._cache.operators = (operators || []).sort((a: Operatore, b: Operatore) =>
      (a.last_name || a.initials || '').localeCompare(b.last_name || b.initials || '', 'it'));
    const metaObj: Record<string, any> = {};
    for (const m of metaRows) metaObj[m.key] = m.value;
    const features: Record<string, boolean> = {};
    for (const f of FEATURES) features[f] = metaObj[CHIAVE_FEATURE(f)] === true;
    this._cache.meta = {
      lastModified: metaObj.lastModified || null,
      unsavedChanges: metaObj.unsavedChanges || false,
      lastAutoBackup: metaObj.lastAutoBackup || null,
      docConfig: metaObj.docConfig || null,
      features,                                  // 1.4.0 — assente = spento
      featureLog: metaObj.featureLog || [],      // 1.4.1 — chi ha acceso cosa
      /* 1.4.2.1 — TRAPPOLA 22: una chiave di `meta` che non e' dichiarata qui
         vive in cache finche' qualcuno non ricarica, e poi sparisce. */
      oreUrgenza: metaObj.oreUrgenza ?? null
    };
  },

  /* ── Interruttori di funzione ───────────────────────────────────────── */

  FEATURES,

  /* Lettura sincrona: la chiama la UI a ogni render, e una funzione spenta
     deve costare quanto costava non averla. */
  isFeatureOn(nome: string) {
    return this._cache.meta?.features?.[nome] === true;
  },

  async setFeature(nome: string, acceso: boolean) {
    if (!FEATURES.includes(nome)) throw new Error(`Interruttore sconosciuto: ${nome}`);
    const rec = { key: CHIAVE_FEATURE(nome), value: acceso === true };
    await Persistence.put('meta', rec);
    this._applyToCache('meta', 'put', rec);
    if (!this._cache.meta.features) this._cache.meta.features = {};
    this._cache.meta.features[nome] = acceso === true;
    await this._logFeature(nome, acceso === true);
    return acceso === true;
  },

  /* CHI HA ACCESO COSA, E QUANDO.
     Serve a rispondere alla domanda che si fa il giorno dopo — «da quando si
     comporta così?» — e a far vedere a chi sta per accendere il secondo
     interruttore che il primo è di stamattina. Un elenco corto: le ultime
     cinquanta, che sono dieci volte gli interruttori che esistono. */
  FEATURE_LOG_KEY: 'featureLog',

  getFeatureLog(): { nome: string; acceso: boolean; at: Istante; by: string }[] {
    const v = (this._cache.meta as Record<string, any>)[this.FEATURE_LOG_KEY];
    return Array.isArray(v) ? v : [];
  },

  async _logFeature(nome: string, acceso: boolean) {
    const voce = { nome, acceso, at: Date.now(), by: this.getCurrentIdentity().initials || '' };
    const elenco = [voce, ...this.getFeatureLog()].slice(0, 50);
    const rec = { key: this.FEATURE_LOG_KEY, value: elenco };
    await Persistence.put('meta', rec);
    this._applyToCache('meta', 'put', rec);
  },

  /* Conteggio dei movimenti più vecchi della soglia di retention.
     Sola lettura: non cancella nulla. Usato dalla UI di Config. */
  async countPurgeableMovements(cutoffTs: number) {
    try {
      return await Persistence.count('mov_log', { field: 'ts', op: 'below', value: cutoffTs });
    } catch (err) {
      console.error('[WM] countPurgeableMovements:', err);
      return 0;
    }
  },

  async purgeMovementsBefore(cutoffTs: number) {
    const removed = await Persistence.deleteWhere('mov_log', { field: 'ts', op: 'below', value: cutoffTs }) as number;
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
    this._locIndex = codiciAttivi(this._cache.sites);
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

  _bucketPut(map: Map<string, any[]>, mapKey: string, rec: any) { bucketPut(map, mapKey, rec); },
  _bucketDelete(map: Map<string, any[]>, mapKey: string, rec: any) { bucketDelete(map, mapKey, rec); },
  _indexInventory(prev: any, next: any) { indicizzaGiacenza(this._indici, prev, next); },

  _applyToCache(collection: Collezione, op: Operazione, record: any = null) {
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
  getSite(id: string) { return this._cache.sites.find(s => s.id === id); },

  async addSite(site: Partial<Sito> & { id: string }) {
    if (this._cache.sites.find(s => s.id === site.id)) return false;
    const now = Date.now();
    const rec = { ...site, active: true, created_at: now, updated_at: now };
    const _id = await Persistence.add('sites', rec);
    this._applyToCache('sites', 'put', { ...rec, _id, zones: [] });
    await this._touchMeta();
    return true;
  },

  async updateSite(id: string, updates: Partial<Sito>) {
    const site = this.getSite(id);
    if (!site) return false;
    Object.assign(site, updates, { updated_at: Date.now() });
    const { zones, ...persistable } = site;
    await Persistence.put('sites', persistable);
    await this._touchMeta();
    return true;
  },

  async deleteSite(id: string) {
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
  getZones(siteId: string) {
    const site = this.getSite(siteId);
    return site ? (site.zones || []).filter(z => z.active) : [];
  },
  getZone(siteId: string, zoneId: string) { return this.getZones(siteId).find(z => z.id === zoneId); },

  /* 1.4.0 — Cosa e' stoccato dove non dovrebbe. Il calcolo e' puro e sta in
     `modules/conformita`; qui si fornisce solo il magazzino.

     Il risultato NON viene memorizzato: chi lo usa lo chiede una volta per
     disegnata e se lo tiene. Con 2.000 celle, una chiamata per cella sarebbe
     duemila giri sull'inventario. */
  verificaStoccaggio() {
    const geo = this.buildLocationGeometry();
    const zone = new Map();
    const zonaDi = (code: string) => {
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

  async addZone(siteId: string, zone: Partial<Zona> & { id: string }) {
    const site = this.getSite(siteId);
    if (!site) return false;
    if ((site.zones || []).find(z => z.id === zone.id)) return false;
    const rec = { ...zone, site_id: siteId, active: true };
    const _id = await Persistence.add('zones', rec);
    const cached = { ...rec, _id } as Zona;
    site.zones = site.zones || [];
    site.zones.push(cached);
    this._applyToCache('zones', 'put', cached);
    this._rebuildIndexes();
    await this._touchMeta();
    return true;
  },

  async updateZone(siteId: string, zoneId: string, updates: Partial<Zona>) {
    const zone = this.getZone(siteId, zoneId);
    if (!zone) return false;
    Object.assign(zone, updates);
    await Persistence.put('zones', zone);
    this._rebuildIndexes();
    await this._touchMeta();
    return true;
  },

  async deleteZone(siteId: string, zoneId: string) {
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

  /* ═══ UBICAZIONI ═══
     Generate dalla configurazione della zona, mai scritte a database.
     L'implementazione sta in `core/geometria.ts` — secondo blocco della
     conversione. Qui resta il nome, che sei punti di questo file chiamano. */
  _genLocations(siteId: string, zone: Zona) { return generaUbicazioni(siteId, zone); },

  generateLocations(siteId: string, zoneId: string) {
    const zone = this.getZone(siteId, zoneId);
    return zone ? this._genLocations(siteId, zone) : [];
  },

  locationExists(code: string) { return this._locIndex?.has(code) ?? false; },

  getLocationStatus(code: string) { return statoUbicazione(this._cache, this._indici, code); },

  getLocationMeta(code: string) { return this._cache.locStatus.get(code); },

  async setLocationStatus(code: string, status: string, reason: string = '') {
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

  isLocationDisabled(code: string) { return this._cache.disabled.has(code); },

  async toggleLocationDisabled(code: string) {
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
  getItemsAtLocation(code: string) { return this._invByLoc.get(code) || []; },
  getItemByKey(itemKey: string) { return this._invByKey.get(itemKey) || []; },

  /* ═══ LETTURE DELLA GIACENZA ═══
     FEFO e ricerca stanno in `core/giacenza.ts` — terzo blocco della
     conversione. Qui restano i nomi che l'interfaccia chiama. */
  findItemLocations(query: string) { return cercaGiacenze(this._cache.inventory, this._invByKey, query); },
  sortByFEFO(items: Giacenza[] | null | undefined) { return ordinaFEFO(items); },
  getFEFOItemForArticle(articleCode: string) { return primoFEFO(this._cache.inventory, articleCode); },
  isFEFOItem(item: Giacenza | null | undefined) { return eFEFO(this._cache.inventory, item); },

  /* ═══════════════════════════════════════════════════════════════════
     1.4.2 — UNITA' DI MISURA E COLLI
     © Andrea Sacchetti — Dietopack S.r.l.

     `qty` resta i colli, come dalla v1: qui accanto compare `qty_uom`, cioe'
     cio' che c'e' dentro. Il collo incompleto NON e' una riga sua — si
     calcola, e il perche' sta in testa a `modules/misure.ts`.

     La regola pura sta li'; qui c'e' solo cio' che scrive.
     ═══════════════════════════════════════════════════════════════════ */

  /* A interruttore spento non si scrive un `qty_uom`, non nasce un `lots` e
     una giacenza si comporta esattamente come nella 1.4.1. */
  _assertUomOn() {
    if (!this.isFeatureOn('uom')) {
      throw new Error('Le unità di misura sono spente — si accendono in Configurazione → Funzioni');
    }
  },

  getLot(articleCode: string, lotCode: string) {
    return this._lotByKey.get(chiaveLotto(articleCode, lotCode)) || null;
  },

  /* LA CONFEZIONE DEL LOTTO VINCE SU QUELLA DELL'ANAGRAFICA, sempre: e' un
     fatto gia' successo, e i colli a scaffale sono imballati come allora.
     L'anagrafica si legge solo per il lotto che non e' mai stato posizionato. */
  getUomConfig(articleCode: string, lotCode: string): Configurazione | null {
    if (!this.isFeatureOn('uom')) return null;
    return daLotto(this.getLot(articleCode, lotCode))
        ?? configurazioneUom(this.getArticle(articleCode));
  },

  /* IL CONGELAMENTO, AL PRIMO POSIZIONAMENTO.
     Un lotto gia' a magazzino non ha un record in `lots`: nasce qui, al primo
     movimento della 1.4.2, con l'unita' presa dall'anagrafica. Nessuna riga
     viene riscritta all'installazione — e un articolo senza `uom` non congela
     niente, cioe' si comporta come nella 1.2. */
  async _congelaLotto(articleCode: string, lotCode: string, adesso: Istante = Date.now()) {
    if (!this.isFeatureOn('uom')) return null;
    const gia = this.getLot(articleCode, lotCode);
    if (gia) return gia;
    const rec = congelaLotto(this.getArticle(articleCode), articleCode, lotCode, adesso);
    if (!rec) return null;
    const _id = await Persistence.add('lots', rec);
    const stored = { ...rec, _id } as Lotto;
    this._applyToCache('lots', 'put', stored);
    return stored;
  },

  /* Come si legge una riga di giacenza: «10 × 1.000 + 1 × 100 PZ», o niente
     se il lotto non e' configurato. La usa la UI a ogni render, ed e' per
     questo che `lotByKey` e' un indice e non un `find`. */
  suddivisioneDi(item: Giacenza | null | undefined) {
    if (!item) return null;
    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg?.per_collo) return null;
    return suddividi(item.qty_uom ?? uomDaColli(item.qty ?? 0, cfg.per_collo, cfg.uom), cfg.per_collo, cfg.uom);
  },

  /* Il conto fra i colli dichiarati e le UM: `null` quando non c'e' niente da
     confrontare. Lo scarto lo mostra la UI — qui non si corregge niente,
     perche' correggere un saldo senza che nessuno abbia guardato la merce e'
     precisamente il modo di scriverne uno sbagliato ma plausibile. */
  verificaUom(item: Giacenza | null | undefined) {
    if (!item) return null;
    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg?.per_collo) return null;
    return verificaUm(item.qty ?? 0, item.qty_uom, cfg.per_collo, cfg.uom);
  },

  /* Le UM di una riga, anche quando `qty_uom` non c'e' ancora.
     RETROCOMPATIBILITA': una giacenza posizionata prima della 1.4.2 si legge
     come colli PIENI, che e' l'unica lettura onesta di un dato che nessuno ha
     mai dichiarato. Il valore non viene scritto finche' qualcuno non muove
     quella riga: all'installazione non si riscrive niente. */
  _uomDiRiga(item: Giacenza, cfg: Configurazione | null): number | null {
    if (!cfg?.per_collo) return null;
    if (typeof item.qty_uom === 'number') return item.qty_uom;
    return uomDaColli(item.qty ?? 0, cfg.per_collo, cfg.uom);
  },

  async addItem(locationCode: string, articleCode: string, articleDescription: string, lotCode: string, expiryDate: string = '', notes: string = '', qty: number = 1, qtyUom: number | null = null) {
    const qtyAdd = Store._assertPositiveInt(qty, 'Quantità da posizionare');
    const itemKey = `${articleCode}#${lotCode}`;
    const bucket = this._invByLoc.get(locationCode) || [];
    const existing = bucket.find(i => i.item_key === itemKey);
    const now = Date.now();

    /* 1.4.2 — la confezione si congela QUI, al primo posizionamento: da
       questo momento e' un fatto del lotto e non segue piu' l'anagrafica. */
    await this._congelaLotto(articleCode, lotCode, now);
    const cfg = this.getUomConfig(articleCode, lotCode);
    const uomAdd = this._uomInIngresso(qtyAdd, qtyUom, cfg);

    // Caso 1: item già presente in questa ubicazione → incrementa qty
    if (existing) {
      const qtyBefore = existing.qty || 1;
      const qtyAfter = qtyBefore + qtyAdd;
      existing.qty = qtyAfter;
      existing.last_updated_at = now;
      // Aggiorna metadati opzionali se passati
      if (expiryDate && !existing.expiry_date) existing.expiry_date = expiryDate;
      if (notes) existing.notes = (existing.notes ? existing.notes + ' | ' : '') + notes;
      const updates: Record<string, any> = {
        qty: qtyAfter,
        last_updated_at: now,
        expiry_date: existing.expiry_date,
        notes: existing.notes
      };
      if (uomAdd !== null) {
        existing.qty_uom = sommaUom(this._uomDiRiga(existing, cfg) ?? 0, uomAdd, cfg!.uom);
        updates.qty_uom = existing.qty_uom;
      }
      await Persistence.update('inventory', existing._id!, updates);
      this._applyToCache('inventory', 'put', existing);
      await this._touchMeta();
      return { ok: true, item: existing, mode: 'incremented', qty_before: qtyBefore, qty_after: qtyAfter,
               qty_uom_delta: uomAdd, qty_uom_after: existing.qty_uom ?? null };
    }

    // Caso 2: nuovo item
    const rec: Giacenza = {
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
    if (uomAdd !== null) rec.qty_uom = uomAdd;
    const _id = await Persistence.add('inventory', rec);
    const stored = { ...rec, _id };
    this._applyToCache('inventory', 'put', stored);
    // Aggiorna anagrafica articoli se nuovo + descrizione presente
    if (!this._artByCode.has(articleCode) && articleDescription?.trim()) {
      await this.addArticle({ code: articleCode, description: articleDescription, category: this._guessCategory(articleCode) });
    }
    await this._touchMeta();
    return { ok: true, item: stored, mode: 'created', qty_before: 0, qty_after: qtyAdd,
             qty_uom_delta: uomAdd, qty_uom_after: uomAdd };
  },

  /* Quante UM entrano con N colli. Dichiarate da chi ha la merce in mano —
     ed e' l'unico modo di far entrare un collo incompleto — oppure derivate
     da colli PIENI, che e' cio' che si posiziona nel novantanove per cento
     dei casi. `null` = riga a soli colli, cioe' il comportamento di sempre. */
  _uomInIngresso(colli: number, dichiarate: number | null, cfg: Configurazione | null): number | null {
    if (!cfg) return null;
    if (dichiarate !== null && dichiarate !== undefined) {
      const v = arrotondaUom(dichiarate, decimaliUom(cfg.uom));
      if (v === null || v <= 0) throw new Error(`Quantità in ${cfg.uom}: deve essere maggiore di zero`);
      return v;
    }
    return cfg.per_collo ? uomDaColli(colli, cfg.per_collo, cfg.uom) : null;
  },

  /* restore esatto di un item preservando metadati incluso qty (per rollback) */
  async restoreItem(item: Giacenza) {
    const clean = { ...item };
    delete clean._id;
    if (typeof clean.qty !== 'number' || clean.qty < 1) clean.qty = 1;  // safety
    const _id = await Persistence.add('inventory', clean);
    const stored = { ...clean, _id };
    this._applyToCache('inventory', 'put', stored);
    await this._touchMeta();
    return stored;
  },

  async removeItem(locationCode: string, itemKey: string, qtyRemove: number | null = null, qtyUomRemove: number | null = null) {
    if (qtyRemove !== null) qtyRemove = Store._assertPositiveInt(qtyRemove, 'Quantità da prelevare');
    const bucket = this._invByLoc.get(locationCode) || [];
    const idx = bucket.findIndex(i => i.item_key === itemKey);
    if (idx === -1) return null;
    const item = bucket[idx]!;
    const qtyBefore = item.qty || 1;

    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    const uomBefore = this._uomDiRiga(item, cfg);
    const totale = qtyRemove === null || qtyRemove >= qtyBefore;
    const uomOut = totale ? uomBefore : this._uomInUscita(qtyRemove!, qtyUomRemove, uomBefore, cfg);
    const uomAfter = uomBefore === null ? null : sottraiUom(uomBefore, uomOut ?? 0, cfg!.uom);

    if (Persistence.supportsRemoteOps) {
      const removed = await Persistence.op!<GiacenzaRimossa>('removeItem', {
        location_code: locationCode, item_key: itemKey,
        qty: qtyRemove === null ? qtyBefore : qtyRemove,
        /* La transazione che arbitra fra due terminali deve muovere i due
           numeri insieme: assente = riga a soli colli, cioe' la 1.4.1.
           `qty_uom_before` serve solo alla riga che un `qty_uom` non lo ha
           mai avuto — il servizio lo usa come seme e poi legge il proprio. */
        ...(uomOut === null ? {} : { qty_uom: uomOut, qty_uom_before: uomBefore }),
      });
      if (removed._mode === 'full') this._applyToCache('inventory', 'delete', item);
      else {
        item.qty = removed._qty_after;
        if (typeof removed._qty_uom_after === 'number') item.qty_uom = removed._qty_uom_after;
        item.last_updated_at = Date.now();
        this._applyToCache('inventory', 'put', item);
      }
      return removed;
    }

    // Caso 1: rimozione totale (qtyRemove null o >= qtyBefore)
    if (qtyRemove === null || qtyRemove >= qtyBefore) {
      const removed = { ...item } as GiacenzaRimossa;
      /* TODO F1-REVIEW: la cache viene svuotata PRIMA che la cancellazione
         sia confermata dal supporto. Se la scrittura fallisce, memoria e
         disco divergono finche' qualcuno non chiama reloadCache() — ed e'
         esattamente cio' che fa commitPickStop() nel proprio catch.
         Ordine mantenuto identico alla v2.5.1: centralizzare, non
         correggere. */
      this._applyToCache('inventory', 'delete', item);
      await Persistence.delete('inventory', item._id!);
      await this._touchMeta();
      // Decoro il removed con info quantità per logging
      removed._mode = 'full';
      removed._qty_before = qtyBefore;
      removed._qty_after = 0;
      removed._qty_delta = -qtyBefore;
      removed._qty_uom_before = uomBefore;
      removed._qty_uom_after = uomBefore === null ? null : 0;
      removed._qty_uom_delta = uomBefore === null ? null : -uomBefore;
      return removed;
    }

    // Caso 2: rimozione parziale (decrementa qty)
    const qtyAfter = qtyBefore - qtyRemove;
    item.qty = qtyAfter;
    item.last_updated_at = Date.now();
    const updates: Record<string, any> = { qty: qtyAfter, last_updated_at: item.last_updated_at };
    if (uomAfter !== null) { item.qty_uom = uomAfter; updates.qty_uom = uomAfter; }
    this._applyToCache('inventory', 'put', item);
    await Persistence.update('inventory', item._id!, updates);
    await this._touchMeta();
    // Ritorno copia decorata (NON rimuovo dalla cache)
    const removed = { ...item } as GiacenzaRimossa;
    removed._mode = 'partial';
    removed._qty_before = qtyBefore;
    removed._qty_after = qtyAfter;
    removed._qty_delta = -qtyRemove;
    removed._qty_uom_before = uomBefore;
    removed._qty_uom_after = uomAfter;
    removed._qty_uom_delta = uomOut === null ? null : -uomOut;
    return removed;
  },

  /* ═══════════════════════════════════════════════════════════════════
     1.4.2.1 — IL CAMPIONAMENTO
     © Andrea Sacchetti — Dietopack S.r.l.

     Un campione esce dal magazzino ma il collo resta a scaffale: cinquanta
     grammi presi da un sacco da venticinque chili. I colli non calano,
     cala la quantita' DENTRO — che e' esattamente cio' che la 1.4.2 ha
     appena reso possibile scrivere.

     Sugli articoli senza quantita' per collo non cala niente, e non e' un
     difetto: oggi i prelievi di campione non li scarica nessuno, quindi
     documentarli e basta e' gia' piu' di quel che c'e'. La condizione si
     scioglie da sola man mano che l'anagrafica si popola.
     ═══════════════════════════════════════════════════════════════════ */

  async sampleItem(locationCode: string, itemKey: string, qtyUom: number) {
    this._assertUomOn();
    const bucket = this._invByLoc.get(locationCode) || [];
    const item = bucket.find(i => i.item_key === itemKey);
    if (!item) return null;

    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg) throw new Error(`${item.article_code} non ha un'unità di misura: il campione non si può quantificare`);
    const prelevate = arrotondaUom(qtyUom, decimaliUom(cfg.uom));
    if (prelevate === null || prelevate <= 0) throw new Error(`Quantità del campione in ${cfg.uom}: deve essere maggiore di zero`);

    const prima = this._uomDiRiga(item, cfg);
    if (prima === null) throw new Error(`${item.article_code} lotto ${item.lot_code}: manca la quantità per collo, il campione non si può scalare`);
    /* `sottraiUom` fa saltare il campionamento se non ce n'e' abbastanza: e'
       una quantita' DICHIARATA da chi ha la merce in mano, e le dichiarate
       si convalidano — vedi il commento di `_uomInUscita`. */
    const dopo = sottraiUom(prima, prelevate, cfg.uom);

    if (Persistence.supportsRemoteOps) {
      const esito = await Persistence.op!<{ qty_uom_before: number; qty_uom_after: number }>('sampleItem', {
        location_code: locationCode, item_key: itemKey,
        qty_uom: prelevate, qty_uom_before: prima,
      });
      item.qty_uom = esito.qty_uom_after;
      item.last_updated_at = Date.now();
      this._applyToCache('inventory', 'put', item);
      return { ok: true, item, uom: cfg.uom, qty_uom_before: esito.qty_uom_before,
               qty_uom_after: esito.qty_uom_after, qty_uom_delta: -prelevate };
    }

    item.qty_uom = dopo;
    item.last_updated_at = Date.now();
    this._applyToCache('inventory', 'put', item);
    await Persistence.update('inventory', item._id!, { qty_uom: dopo, last_updated_at: item.last_updated_at });
    await this._touchMeta();
    return { ok: true, item, uom: cfg.uom, qty_uom_before: prima,
             qty_uom_after: dopo, qty_uom_delta: -prelevate };
  },

  /* Quante UM escono con N colli, e le due strade non si trattano uguale.

     DICHIARATE da chi ha la merce in mano: si convalidano, e se non ci sono
     `sottraiUom` fa saltare il prelievo. Un numero digitato che non torna e'
     un numero sbagliato, e va detto subito.

     DERIVATE dai colli: si TRONCANO a cio' che c'e'. Sembra il contrario del
     rigore, e non lo e': la deriva puo' esistere solo su una riga gia'
     incoerente — un dato vecchio, un import a meta' — e bloccare un prelievo
     fisico perche' un numero e' stale e' peggio del numero stale. Lo scarto
     non sparisce: lo mostra `verificaUom`, che e' il posto giusto per dirlo. */
  _uomInUscita(colli: number, dichiarate: number | null, disponibili: number | null, cfg: Configurazione | null): number | null {
    if (!cfg || disponibili === null) return null;
    if (dichiarate !== null && dichiarate !== undefined) {
      const v = arrotondaUom(dichiarate, decimaliUom(cfg.uom));
      if (v === null || v <= 0) throw new Error(`Quantità in ${cfg.uom}: deve essere maggiore di zero`);
      return v;
    }
    if (!cfg.per_collo) return null;
    return Math.min(uomDaColli(colli, cfg.per_collo, cfg.uom) ?? 0, disponibili);
  },

  /* watermark mid-file v1.8.0 */

  // ═══ ITEM EDIT (v1.8.1) ═══
  async updateItemFields(locationCode: string, itemKey: string, changes: Record<string, any>) {
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
      const newRec: Giacenza = {
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
      /* 1.4.2 — la riga cambia articolo o lotto, quindi cambia CONFEZIONE: le
         UM di prima descrivevano un'altra merce. Si ricalcolano sulla nuova,
         e la nuova si congela adesso — e' un primo posizionamento a tutti gli
         effetti. */
      await this._congelaLotto(newArtCode, newLotCode, newRec.last_updated_at!);
      const cfgNuova = this.getUomConfig(newArtCode, newLotCode);
      const uomNuova = typeof changes.qty_uom === 'number'
        ? this._uomInIngresso(newRec.qty!, changes.qty_uom, cfgNuova)
        : this._uomInIngresso(newRec.qty!, null, cfgNuova);
      if (uomNuova !== null) newRec.qty_uom = uomNuova;
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
    const updates: Record<string, any> = { last_updated_at: now };
    if (changes.article_description !== undefined) { updates.article_description = changes.article_description; item.article_description = changes.article_description; }
    if (changes.expiry_date !== undefined)         { updates.expiry_date = changes.expiry_date;             item.expiry_date = changes.expiry_date; }
    if (typeof changes.qty === 'number')            { updates.qty = changes.qty;                             item.qty = changes.qty; }
    if (changes.notes !== undefined)               { updates.notes = changes.notes;                          item.notes = changes.notes; }
    /* 1.4.2 — la correzione a mano delle UM. Passa dall'arrotondamento
       dell'unità come ogni altra scrittura, e non tocca i colli: sono due
       numeri che chi corregge vede tutti e due, e `verificaUom` gli dice
       subito se non tornano. */
    if (changes.qty_uom !== undefined) {
      const cfgRiga = this.getUomConfig(item.article_code, item.lot_code);
      const v = cfgRiga === null ? null : arrotondaUom(changes.qty_uom, decimaliUom(cfgRiga.uom));
      if (v !== null) {
        if (v < 0) throw new Error(`Quantità in ${cfgRiga!.uom}: non può essere negativa`);
        updates.qty_uom = v; item.qty_uom = v;
      }
    }
    item.last_updated_at = now;
    this._applyToCache('inventory', 'put', item);
    await Persistence.update('inventory', item._id!, updates);
    await this._touchMeta();
    return { ok: true, item, keyChanged: false };
  },

  // ═══ ARTICLES ═══
  getArticles() { return this._cache.articles.filter(a => a.active !== false); },
  getArticle(code: string) { return this._artByCode.get(code) || null; },

  async addArticle(article: IngressoArticolo) {
    if (this._artByCode.has(article.code)) return false;
    const rec: Articolo = {
      code: article.code,
      description: article.description,
      category: article.category || 'MP',
      supplier: article.supplier || '',
      unit: article.unit || 'PZ',
      weight: parseFloat(article.weight) || 0,
      weight_net_kg: parseFloat(article.weight_net_kg) || 0,
      /* 1.4.2 — `parseFloat` e non piu' `parseInt`: da quando questo campo e'
         anche la UM-per-collo, un collo da 12,5 kg esiste. Sui pezzi non
         cambia niente, e il DDT legge lo stesso numero di prima. */
      pieces_per_pack: parseFloat(article.pieces_per_pack) || 0,
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
  /* 1.6 — `certifications` MANCAVA DA QUANDO ESISTE, e la lista bianca la
     scartava in silenzio: la maschera di modifica mostrava le caselle, le
     rileggeva, e `updateArticle` le buttava via. Solo l'import Excel le
     scriveva, il che spiega perche' nessuno se n'era accorto — le
     certificazioni arrivano da li'. Trovato provando la 1.6 nel browser:
     `hazards` stava per prendere la stessa strada. */
  ARTICLE_ATTR_FIELDS: ['allergens', 'temp_class', 'certifications', 'hazards'],

  async updateArticle(code: string, updates: Partial<Articolo>) {
    const art = this._artByCode.get(code);
    if (!art) return false;
    this._applyArticleUpdates(art, updates);
    this._applyToCache('articles', 'put', art);
    await Persistence.put('articles', art);
    await this._touchMeta();
    return true;
  },

  _applyArticleUpdates(art: Articolo, updates: Record<string, any>): Articolo {
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
  async upsertArticles(righe: IngressoArticolo[]) {
    const nuovi: IngressoArticolo[] = [], modificati: Articolo[] = [];
    for (const r of righe) {
      const esistente = this._artByCode.get(r.code);
      if (!esistente) { nuovi.push(r); continue; }
      const prima = JSON.stringify(esistente);
      const dopo = this._applyArticleUpdates({ ...esistente }, r);
      if (JSON.stringify(dopo) !== prima) modificati.push(dopo);
    }

    const creati: Articolo[] = [];
    for (const r of nuovi) {
      creati.push({
        code: r.code, description: r.description || '', category: r.category || 'MP',
        supplier: r.supplier || '', unit: r.unit || 'PZ',
        weight: parseFloat(r.weight) || 0, weight_net_kg: parseFloat(r.weight_net_kg) || 0,
        pieces_per_pack: parseFloat(r.pieces_per_pack) || 0,   // 1.4.2 — vedi addArticle
        length: parseFloat(r.length) || 0, width: parseFloat(r.width) || 0, height: parseFloat(r.height) || 0,
        min_stock: parseFloat(r.min_stock) || 0, max_stock: parseFloat(r.max_stock) || 0,
        notes: r.notes || '', active: true, created: Date.now(),
        ...(Array.isArray(r.allergens) ? { allergens: r.allergens } : {}),
        ...(r.temp_class ? { temp_class: r.temp_class } : {}),
      });
    }

    if (creati.length) {
      const ids = await Persistence.bulkAdd('articles', creati) as (number | undefined)[] | undefined;
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

  async deleteArticle(code: string) {
    const art = this._artByCode.get(code);
    if (!art) return false;
    art.active = false;
    this._applyToCache('articles', 'put', art);
    await Persistence.put('articles', art);
    await this._touchMeta();
    return true;
  },

  _guessCategory(code: string) {
    const prefix = (code || '').substring(0, 2).toUpperCase();
    const cats: Record<string, string> = { MP: 'MP', SL: 'SL', PF: 'PF', AC: 'AC', IM: 'IM' };
    return cats[prefix] || 'MP';
  },

  // ═══ MOVEMENT LOG ═══
  async logMovement(entry: Partial<Movimento> & { type: MovTipo }) {
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
      qty_after:  (typeof entry.qty_after  === 'number') ? entry.qty_after  : null,
      /* 1.4.2 — quanto si è mosso in UM, e in quale unità. `null` e assente
         sono la stessa cosa e vogliono dire «movimento a soli colli»: è la
         stessa assenza dichiarata che `qty_delta` ha sui movimenti scritti
         prima della v2. */
      qty_uom_delta: (typeof entry.qty_uom_delta === 'number') ? entry.qty_uom_delta : null,
      ...(entry.uom ? { uom: entry.uom } : {}),
    };
    const _id = await Persistence.add('mov_log', rec);
    this._applyToCache('mov_log', 'put', { ...rec, _id });
    this._cache.movLogTotal++;
    // v1.5.1 fix: aggiorna metadati syncIndicator anche su log movimenti
    await this._touchMeta();
    /* 1.4.2.1 — l'identificativo torna al chiamante: e' il filo che lega un
       compito ai movimenti che l'hanno lavorato, e senza di lui il registro
       delle attivita' direbbe «chiuso» senza poter dire «con che cosa». */
    return _id;
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
    let criteria: Criterio | null = null;
    if (from !== null && to !== null)      criteria = { field: 'ts', op: 'between', value: [from, to] };
    else if (from !== null)                criteria = { field: 'ts', op: 'aboveOrEqual', value: from };
    else if (to !== null)                  criteria = { field: 'ts', op: 'below', value: to };

    const matched: Movimento[] = [];
    let scanned = 0, truncated = false;
    const needle = String(text || '').toLowerCase().trim();

    await Persistence.eachChunk<Movimento>('mov_log', { criteria, chunkSize: 5000 }, (rows) => {
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
  async eachMovement(fn: (blocco: Movimento[]) => void | Promise<void>, chunkSize: number = 5000) {
    return await Persistence.eachChunk('mov_log', { chunkSize }, fn);
  },

  async quarantineItem(entry: Record<string, any>) {
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

  async releaseQuarantine(q_id: string, attribution: Record<string, any> = {}) {
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

  isItemQuarantined(itemKey: string, locationCode: string | null = null) {
    return this._cache.quarantine.some(q =>
      q.status === 'active' && q.item_key === itemKey &&
      (locationCode == null || q.blocked_location === locationCode));
  },

  isItemQuarantinedAnywhere(itemKey: string) {
    return this._cache.quarantine.some(q => q.status === 'active' && q.item_key === itemKey);
  },

  quarantinedLocationsOf(itemKey: string) {
    return this._cache.quarantine
      .filter(q => q.status === 'active' && q.item_key === itemKey)
      .map(q => q.blocked_location);
  },

  getActiveQuarantine() { return this._cache.quarantine.filter(q => q.status === 'active'); },
  getQuarantineHistory() { return this._cache.quarantine; },

  /* ═══════════════════════════════════════════════════════════════════
     1.4.1 — SCHEDULATORE DI ATTIVITA'
     © Andrea Sacchetti — Dietopack S.r.l.

     Qui non nasce nessuna operazione: le otto attivita' l'applicativo le sa
     gia' fare. Nasce la richiesta, e con lei i tre istanti da cui escono le
     due misure che il responsabile aspetta — quanto sta in coda, quanto dura.

     La regola del ciclo di vita sta in `modules/compiti.ts`, che e' puro e
     collaudato da fermo; qui c'e' solo cio' che scrive.
     ═══════════════════════════════════════════════════════════════════ */

  /* Un rilascio installato non e' una funzione accesa: a interruttore spento
     lo schedulatore non scrive una riga. La UI non lo mostra nemmeno, ma la
     guardia sta anche qui — l'interruttore e' una promessa sul database. */
  _assertTasksOn() {
    if (!this.isFeatureOn('tasks')) {
      throw new Error('Lo schedulatore di attività è spento — si accende in Configurazione → Funzioni');
    }
  },

  getTasks() { return this._cache.tasks; },
  getTask(taskId: string) { return this._cache.tasks.find(t => t.task_id === taskId) || null; },
  getOpenTasks() { return this._cache.tasks.filter(eAperto); },

  /* 1.4.2.1 — QUANTE ORE PRIMA DELLA SCADENZA UN COMPITO DIVENTA URGENTE.
     Vive in `meta` come gli altri parametri di Configurazione, e non nel
     sorgente: e' una politica di magazzino, e le politiche cambiano senza
     che cambi la versione. Fuori dai limiti si torna al valore di serie —
     una soglia di zero spegnerebbe la regola in silenzio. */
  URGENZA_MIN_ORE: 1,
  URGENZA_MAX_ORE: 72,

  getOreUrgenza(): number {
    const v = Number((this._cache.meta as Record<string, any>).oreUrgenza);
    if (!Number.isFinite(v) || v < this.URGENZA_MIN_ORE || v > this.URGENZA_MAX_ORE) return ORE_URGENZA_DEFAULT;
    return v;
  },

  async setOreUrgenza(ore: number | string) {
    const v = Number(ore);
    if (!Number.isFinite(v) || v < this.URGENZA_MIN_ORE || v > this.URGENZA_MAX_ORE) {
      throw new Error(`La soglia di urgenza è un numero di ore fra ${this.URGENZA_MIN_ORE} e ${this.URGENZA_MAX_ORE}`);
    }
    const rec = { key: 'oreUrgenza', value: v };
    await Persistence.put('meta', rec);
    this._applyToCache('meta', 'put', rec);
    return v;
  },

  /** La coda, nell'ordine in cui si prende il prossimo. */
  getTaskQueue(adesso: number = Date.now()) {
    return ordinaCoda(this._cache.tasks, adesso, this.getOreUrgenza());
  },
  getTasksAssignedTo(initials: string) {
    const v = String(initials ?? '').toUpperCase().trim();
    return this.getTaskQueue().filter(t => t.assigned_to === v);
  },
  getTasksSummary(adesso: number = Date.now()) {
    return riepilogoCompiti(this._cache.tasks, adesso, this.getOreUrgenza());
  },

  async createTask(richiesta: RichiestaCompito) {
    this._assertTasksOn();
    const io = this.getCurrentIdentity();
    const r: RichiestaCompito = { ...richiesta, requested_by: richiesta.requested_by || io.initials };
    const errori = validaRichiesta(r);
    if (errori.length) throw new Error(errori.join(' · '));
    const priorita = Number(r.priority) || PRIORITA_NORMALE;
    /* D4 — la priorita' la alza solo il Team Leader, e il varco da chiudere
       e' la creazione: aperto a 4, un compito non ha bisogno di essere alzato. */
    if (!prioritaConsentita(io.role, priorita)) {
      throw new Error(`Priorità ${etichettaPriorita(priorita)}: la può chiedere solo un Team Leader`);
    }
    const now = Date.now();
    const taskId = `TA-${now.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const rec = componiCompito({ ...r, priority: priorita }, taskId, now);
    await Persistence.add('tasks', rec);
    this._applyToCache('tasks', 'put', rec);
    await this._touchMeta();
    return rec;
  },

  /* 1.5 — LA PULIZIA POST-CAMPIONAMENTO, CHE NASCE GIA' CHIUSA — D16.
     La GMP pretende che la pulizia dell'area di prelievo sia registrata e
     riferita al campionamento che l'ha resa necessaria. Qui non c'e' niente
     da mettere in coda: il gesto e' gia' stato fatto quando l'operatore
     conferma, e un compito aperto che nessuno prendera' mai sarebbe la
     «lista che invecchia» del piano §4.1.

     Non passa da `_moveTask` perche' non e' una transizione: e' un record
     che nasce nel suo stato finale, con richiesta e chiusura nello stesso
     istante. E' l'unico punto del progetto in cui succede, e sta scritto
     qui perche' si veda.

     A interruttore SPENTO non scrive e non solleva: il campionamento deve
     poter andare avanti comunque, e la pulizia resta scritta nel dettaglio
     del movimento — che c'e' sempre. */
  async logCleaningTask(
    dati: { location_code: string; article_code?: string; lot_code?: string;
            sample_ref?: string | null; automatica?: boolean; note?: string },
  ) {
    if (!this.isFeatureOn('tasks')) return null;
    const io = this.getCurrentIdentity();
    const sigla = String(io.initials ?? '').toUpperCase().trim();
    if (!sigla) return null;
    const now = Date.now();
    const taskId = `TA-${now.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const rec: Compito = {
      task_id: taskId,
      type: 'CLEANING',
      priority: PRIORITA_NORMALE,
      status: 'done',
      requested_by: sigla,
      requested_at: now,
      assigned_to: sigla,
      started_at: now,
      completed_at: now,
      completed_by: sigla,
      due_at: null,
      /* IL RIFERIMENTO ALL'ULTIMO CAMPIONAMENTO E' IL DATO CHE LA GMP CHIEDE:
         senza, la riga dice «e' stato pulito» e non «e' stato pulito dopo
         cosa», che e' l'unica cosa che un auditor domanda. */
      source_ref: dati.sample_ref ?? null,
      payload: {
        location_code: dati.location_code,
        article_code: dati.article_code ?? null,
        lot_code: dati.lot_code ?? null,
        auto: dati.automatica === true,
      },
      qty_done: 0,
    };
    const note = String(dati.note ?? '').trim();
    if (note) rec.note = note;
    await Persistence.add('tasks', rec);
    this._applyToCache('tasks', 'put', rec);
    await this._touchMeta();
    return rec;
  },

  /* Il passaggio di stato passa tutto da qui: una transizione non ammessa
     deve costare un errore in faccia a chi la chiede, non una riga strana
     che qualcuno leggera' fra un mese. */
  async _moveTask(taskId: string, nuovo: string, patch: Partial<Compito> = {}) {
    this._assertTasksOn();
    const cur = this.getTask(taskId);
    if (!cur) throw new Error('Attività non trovata');
    if (!transizioneAmmessa(cur.status, nuovo)) {
      throw new Error(`Un'attività ${etichettaStato(cur.status).toLowerCase()} non può passare a ${etichettaStato(nuovo).toLowerCase()}`);
    }
    const rec: Compito = { ...cur, ...patch, status: nuovo };
    await Persistence.put('tasks', rec);
    this._applyToCache('tasks', 'put', rec);
    await this._touchMeta();
    return rec;
  },

  async assignTask(taskId: string, initials: string) {
    const v = String(initials ?? '').toUpperCase().trim();
    if (!v) throw new Error('Manca la sigla di chi prende l\'attività');
    if (!this.getOperatorByInitials(v)) throw new Error(`Nessun operatore con le iniziali ${v}`);
    return await this._moveTask(taskId, 'assigned', { assigned_to: v });
  },

  /** Rimette in coda un compito assegnato: la sigla se ne va con lui. */
  async unassignTask(taskId: string) {
    return await this._moveTask(taskId, 'requested', { assigned_to: null });
  },

  async startTask(taskId: string, initials: string = '') {
    const v = String(initials || this.getCurrentIdentity().initials || '').toUpperCase().trim();
    const cur = this.getTask(taskId);
    return await this._moveTask(taskId, 'in_progress', {
      assigned_to: cur?.assigned_to || v || null,
      started_at: Date.now(),
    });
  },

  async completeTask(taskId: string, initials: string = '') {
    const v = String(initials || this.getCurrentIdentity().initials || '').toUpperCase().trim();
    const cur = this.getTask(taskId);
    /* 1.4.4 — «COMPLETA» A MANO NON ESISTE PIU', PER NESSUN TIPO.
       Sopravviveva per la sola Conta, che con la regola del residuo non
       poteva chiudersi da sola. Adesso la Conta e' un inventario mirato che
       si chiude confermando il conteggio — anche quando il conteggio torna
       giusto e non produce nessuna riga — quindi l'ultimo tipo che aveva
       bisogno del gesto a mano non ce l'ha piu'.

       La guardia resta e diventa assoluta: un compito si chiude perche'
       un'operazione e' stata confermata, e la sola strada e' `advanceTask`.
       Dichiarare fatto del lavoro che nessuno ha registrato non e' una
       scorciatoia, e' un buco nella tracciabilita' GMP. */
    if (!this._chiusuraAmmessa) {
      throw new Error('Questa attività si chiude confermando l\'operazione: premere ▶ Avvia e portarla a termine');
    }
    void cur;
    return await this._moveTask(taskId, 'done', { completed_at: Date.now(), completed_by: v || null });
  },

  /* Alzata dalla sola `advanceTask`: e' la chiusura che arriva da un
     movimento confermato, ed e' l'unica strada per gli altri sette tipi. */
  _chiusuraAmmessa: false,

  /* ═══════════════════════════════════════════════════════════════════
     1.4.2.1 — IL MOVIMENTO CONFERMATO SCALA IL RESIDUO
     © Andrea Sacchetti — Dietopack S.r.l.

     Fino alla 1.4.1 «Completa» era una spunta, e il compito affiancava il
     lavoro invece di lanciarlo. Da qui un compito si chiude solo perche'
     un movimento e' stato confermato: 12 chiesti, 5 mossi, ne restano 7 e
     il compito resta aperto — decisione 45.

     Il conto lo fa `avanzamento`, che e' puro e collaudato da fermo. Qui
     c'e' solo cio' che scrive.
     ═══════════════════════════════════════════════════════════════════ */

  async advanceTask(taskId: string, colli: number, movIds: number[] = []) {
    this._assertTasksOn();
    const cur = this.getTask(taskId);
    if (!cur) throw new Error('Attività non trovata');
    if (cur.status !== 'in_progress') {
      throw new Error(`Un'attività ${etichettaStato(cur.status).toLowerCase()} non registra movimenti`);
    }
    const a = avanzamento(cur, colli);
    /* Gli identificativi si accodano senza doppioni: lo stesso movimento
       non deve poter comparire due volte nel registro di un compito. */
    const ids = [...(cur.mov_ids ?? [])];
    for (const id of movIds) if (typeof id === 'number' && !ids.includes(id)) ids.push(id);

    if (a.chiude) {
      const v = String(this.getCurrentIdentity().initials || '').toUpperCase().trim();
      this._chiusuraAmmessa = true;
      try {
        return await this._moveTask(taskId, 'done', {
          qty_done: a.qty_done, mov_ids: ids,
          completed_at: Date.now(), completed_by: v || null,
        });
      } finally {
        this._chiusuraAmmessa = false;
      }
    }
    /* Un parziale non cambia stato: resta in corso, con meno da fare. */
    const rec: Compito = { ...cur, qty_done: a.qty_done, mov_ids: ids };
    await Persistence.put('tasks', rec);
    this._applyToCache('tasks', 'put', rec);
    await this._touchMeta();
    return rec;
  },

  /* UN AVVIO CHE NON HA PRODOTTO NIENTE TORNA IN CARICO — decisione 46.
     `started_at` torna a `null`, ed e' l'unico istante gia' scritto che
     questo progetto cancella: un avvio che non ha mosso un collo non e'
     storia, e' un ripensamento. Chi l'aveva in mano ce l'ha ancora, quindi
     si torna ad «assegnato» e non in coda. */
  async abandonTask(taskId: string) {
    this._assertTasksOn();
    const cur = this.getTask(taskId);
    if (!cur) throw new Error('Attività non trovata');
    if (!avvioRitirabile(cur)) return cur;
    return await this._moveTask(taskId, 'assigned', { started_at: null });
  },

  /* Un annullamento senza motivo e' un compito che sparisce: fra un mese
     nessuno sa se era sbagliato o solo scomodo. */
  async cancelTask(taskId: string, motivo: string) {
    const m = String(motivo ?? '').trim();
    if (!m) throw new Error('Serve il motivo dell\'annullamento');
    const v = String(this.getCurrentIdentity().initials || '').toUpperCase().trim();
    return await this._moveTask(taskId, 'cancelled', {
      completed_at: Date.now(), completed_by: v || null, cancel_reason: m,
    });
  },

  async setTaskPriority(taskId: string, priorita: number) {
    this._assertTasksOn();
    const p = Number(priorita);
    if (!Number.isInteger(p) || p < 1 || p > 4) throw new Error('La priorità è un numero da 1 a 4');
    const io = this.getCurrentIdentity();
    if (!prioritaConsentita(io.role, p)) {
      throw new Error(`Priorità ${etichettaPriorita(p)}: la può assegnare solo un Team Leader`);
    }
    const cur = this.getTask(taskId);
    if (!cur) throw new Error('Attività non trovata');
    if (!eAperto(cur)) throw new Error('L\'attività è chiusa: la priorità non si tocca più');
    const rec: Compito = { ...cur, priority: p };
    await Persistence.put('tasks', rec);
    this._applyToCache('tasks', 'put', rec);
    await this._touchMeta();
    return rec;
  },

  async savePendingOutbound(entry: Record<string, any>) {
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
      /* 1.4.2.1 — il compito che ha aperto questo DDT. Un prelievo si chiude
         quando la merce ESCE, e fra il documento e il ritiro del vettore
         possono passare dei giorni: senza questo filo il compito resterebbe
         in corso per sempre, o si chiuderebbe su un documento che nessuno ha
         ancora evaso. */
      task_id: entry.task_id || null,
      status: 'pending',
      created_at: Date.now(),
      evaded_at: null,
      cancelled_at: null,
      lines: (entry.lines || []).map((l: RigaDocumento) => ({
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
  async updatePendingStatus(doc_id: string, status: string) {
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

  async updatePendingDoc(doc_id: string, patch: Record<string, any>) {
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
      rec.lines = patch.lines.map((l: RigaDocumento) => ({
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
  getPendingOutbound(kind: string) {
    return this._cache.pendingOut
      .filter(d => d.status === 'pending' && (kind == null || d.kind === kind))
      .sort((a, b) => b.created_at - a.created_at);
  },

  /* Restituisce un singolo documento per ID */
  getPendingDoc(doc_id: string) {
    return this._cache.pendingOut.find(d => d.doc_id === doc_id);
  },

  getAllOutbound() {
    return [...this._cache.pendingOut].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  },

  /* True se l'item (location_code + item_key) è prenotato in almeno un DDT pendente.
     Usato per impedire doppia prenotazione della stessa giacenza. */
  isItemPendingOutbound(location_code: string, item_key: string) {
    return this._cache.pendingOut.some(d =>
      d.status === 'pending' &&
      d.lines.some(l => l.location_code === location_code && l.item_key === item_key)
    );
  },

  /* Restituisce qty totale prenotata per l'item dato (sommata su tutti i pending).
     v2.0.1: aggiunto excludeDocId per escludere il documento in corso di modifica. */
  getPendingQtyForItem(location_code: string, item_key: string, excludeDocId: string | null = null) {
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

  getPhysicalQty(location_code: string, item_key: string) {
    const item = (this._invByLoc.get(location_code) || []).find(i => i.item_key === item_key);
    if (!item) return 0;
    return item.qty || 1;
  },

  getAvailableQty(location_code: string, item_key: string, excludeDocId: string | null = null) {
    const physical = this.getPhysicalQty(location_code, item_key);
    const reserved = this.getPendingQtyForItem(location_code, item_key, excludeDocId);
    return Math.max(0, physical - reserved);
  },

  /* Elenco dei DDT pendenti che impegnano un dato item in una data ubicazione.
     Usato per la conferma esplicita in Cambio Ubicazione (decisione A-3). */
  getPendingDocsForItem(location_code: string, item_key: string) {
    return this._cache.pendingOut.filter(d =>
      d.status === 'pending' &&
      d.lines.some(l => l.location_code === location_code && l.item_key === item_key)
    );
  },

  checkPendingDocIntegrity(doc: DocumentoUscita | null | undefined) {
    const issues: { lineIndex: number; level: string; message: string }[] = [];
    if (!doc || !Array.isArray(doc.lines)) return { ok: true, issues };
    doc.lines.forEach((l: RigaDocumento, idx: number) => {
      const physical = this.getPhysicalQty(l.location_code || '', String(l.item_key || ''));
      if (physical === 0) {
        // La merce non è più nell'ubicazione indicata: spostata, prelevata o rettificata.
        const elsewhere = (this._invByKey.get(String(l.item_key || '')) || []).map(i => i.location_code);
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

  _validateOutboundLines(lines: RigaDocumento[], excludeDocId: string | null = null) {
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

  async startPickSession(session: Partial<SessionePrelievo> & { session_id: string }) {
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
      throw new Error('Impossibile salvare la sessione di prelievo: ' + (err as Error).message);
    }
  },

  async savePickSession(session: SessionePrelievo) {
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

  async commitPickStop({ session, stop, qty, movement }: { session: SessionePrelievo; stop: Record<string, any>; qty: number; movement: Partial<Movimento> & { type: MovTipo } }) {
    if (!session?.session_id) throw new Error('Sessione di prelievo priva di identificativo');
    if (!stop) throw new Error('Tappa non identificata');

    let removed = null;
    try {
      /* `meta` e' inclusa perche' _touchMeta() vi scrive: escluderla
         farebbe fallire la transazione con TransactionInactiveError. */
      await Persistence.transaction(['inventory', 'mov_log', 'pick_session', 'meta'], async () => {
        removed = await this.removeItem(stop.location_code, stop.item_key, qty);
        if (!removed) throw new Error('Scarico della giacenza non riuscito');

        /* 1.4.2 — quanto e' uscito in UM. Fra sei anni il registro e' la sola
           cosa che potra' dirlo: una riga che non lo porta non si ricostruisce
           da nessun'altra parte. */
        const cfgUscita = this.getUomConfig(removed.article_code, removed.lot_code);
        await this.logMovement({
          ...movement,
          qty_before: removed._qty_before,
          qty_delta: removed._qty_delta,
          qty_after: removed._qty_after,
          qty_uom_delta: removed._qty_uom_delta ?? null,
          ...(cfgUscita ? { uom: cfgUscita.uom } : {}),
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

  async archivePickReport(snap: Partial<ReportPrelievo> & { doc_id: string }) {
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

  getPickReportByOdp(odpNum: string) {
    const norm = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const key = norm(odpNum);
    if (!key) return null;
    return this._cache.pickArchive
      .filter(x => norm(x.odp_num) === key)
      .sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0))[0] || null;
  },

  getPickReports() { return this._cache.pickArchive; },

  async archiveDisposal(snap: Partial<VerbaleSmaltimento> & { doc_id: string }) {
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

  getDisposal(doc_id: string) {
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
    const saved = (this._cache.meta?.docConfig || {}) as Record<string, any>;
    const D = this.DOC_CONFIG_DEFAULTS;
    return {
      sender: { ...D.sender, ...(saved.sender || {}) },
      causali: Array.isArray(saved.causali) && saved.causali.length ? saved.causali : D.causali.slice(),
      disposalReasons: Array.isArray(saved.disposalReasons) && saved.disposalReasons.length
        ? saved.disposalReasons : D.disposalReasons.slice(),
      ddt: { ...D.ddt, ...(saved.ddt || {}) }
    };
  },

  async saveDocConfig(cfg: Record<string, any>) {
    const merged = { ...this.getDocConfig(), ...cfg };
    await Persistence.put('meta', { key: 'docConfig', value: merged });
    this._applyToCache('meta', 'put', { key: 'docConfig', value: merged });
    this._cache.meta.docConfig = merged;
    await this._touchMeta();
    return merged;
  },

  /* ── 1.6 — I PARAMETRI DELL'ARTICOLO, CHE SONO UN DATO ──────────────
     Vivono in `meta` come `docConfig` e la soglia di urgenza: sono una
     politica di magazzino, e le politiche cambiano senza che cambi la
     versione. Le tendine dell'anagrafica le leggono da qui.

     `undefined` e «record svuotato» sono due cose diverse, e la differenza
     conta: chi non ha mai aperto la scheda si trova i valori di serie, chi
     ha tolto tutte le voci di una tendina se le ritrova tolte. Rimettergliele
     al ricaricamento sarebbe rifiutargli una scelta in silenzio. */
  getArticleParams(): ParametriArticolo {
    const saved = (this._cache.meta as Record<string, any>)?.articleParams;
    return saved === undefined || saved === null
      ? parametriDiSerie()
      : leggiParametri(saved);
  },

  async saveArticleParams(p: Partial<ParametriArticolo>) {
    const merged = leggiParametri({ ...this.getArticleParams(), ...p });
    await Persistence.put('meta', { key: 'articleParams', value: merged });
    this._applyToCache('meta', 'put', { key: 'articleParams', value: merged });
    (this._cache.meta as Record<string, any>).articleParams = merged;
    await this._touchMeta();
    return merged;
  },

  /* Gli elenchi COME LI VEDE UNA TENDINA: i valori di legge davanti e
     marcati, gli aggiunti dietro. Stanno qui e non nella UI perche' la
     stessa unione serve alla maschera, all'import Excel e al foglio
     «Valori ammessi» — tre elenchi scritti a mano divergono. */
  getAllergeniAmmessi(): Voce[] {
    return unisciVoci(ALLERGENI, this.getArticleParams().allergeni);
  },
  getClassiConservazione(): Voce[] {
    return unisciVoci(
      CLASSI_TEMPERATURA.map(c => ({ code: c.code, label: `${c.label} (${c.range})` })),
      this.getArticleParams().conservazione);
  },
  getUnitaAmmesse(): Voce[] {
    return unisciVoci(
      UNITA_MISURA.map(u => ({ code: u.code, label: u.label })),
      this.getArticleParams().unita);
  },
  /* La pericolosita' non ha niente di fisso dietro: e' una classificazione
     di magazzino, non una norma di etichettatura. */
  getPericoli(): Voce[] {
    return unisciVoci([], this.getArticleParams().pericoli);
  },

  /* ── 1.6 — I DESTINATARI DEI DDT ────────────────────────────────────
     L'anagrafica si popola da se': non c'e' un momento in cui qualcuno la
     carica, c'e' un DDT che si compila. Le regole — chi e' lo stesso
     destinatario, quale destinazione e' nuova — stanno in
     `modules/destinatari.ts`; qui si scrive e basta. */
  getRecipients() { return this._cache.recipients; },
  getRecipient(rcpId: string) {
    return this._cache.recipients.find(r => r.rcp_id === rcpId) || null;
  },
  findRecipient(dati: Partial<Destinatario>) {
    return trovaDestinatario(this._cache.recipients, dati);
  },
  searchRecipients(query: string, max = 8) {
    return cercaDestinatari(this._cache.recipients, query, max);
  },

  /* IL CUORE: entra cio' che c'e' scritto sul DDT, esce il record.
     Tre casi, e sono i tre della nota — PIANO §9.5:
     - non c'e' → nasce, con la sua destinazione;
     - c'e', stessa destinazione → non si tocca niente;
     - c'e', destinazione diversa → la destinazione si AGGIUNGE accanto.

     `permanente` decide solo il quarto caso: i dati anagrafici cambiati sul
     documento. Falso — cioe' «spot» — lascia il record com'era e il DDT
     porta i suoi valori: e' un documento, non una correzione. */
  async upsertRecipient(
    dati: Partial<Destinatario & Destinazione>,
    { permanente = false }: { permanente?: boolean } = {},
  ) {
    const now = Date.now();
    const nuovoId = (p: string) => `${p}-${now.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const esistente = this.findRecipient(dati);

    if (!esistente) {
      /* Senza chiave non nasce niente: un DDT senza ragione sociale ne'
         partita IVA non e' un destinatario, e scriverlo vorrebbe dire un
         record anonimo in piu' a ogni documento incompleto. */
      if (!chiaveDestinatario(dati)) return null;
      const rec = componiDestinatario(dati, nuovoId('RC'), nuovoId('DE'), now);
      rec.updated_by = this.getCurrentIdentity().initials || undefined;
      await Persistence.add('recipients', rec);
      this._applyToCache('recipients', 'put', rec);
      await this._touchMeta();
      return { record: rec, creato: true, destinazioneNuova: rec.destinations.length > 0 };
    }

    let rec: Destinatario = esistente;
    let mosso = false;
    if (permanente) {
      const patch: Partial<Destinatario> = {};
      const nome = String(dati.name ?? '').trim();
      if (nome && nome !== rec.name) patch.name = nome;
      const vat = normalizzaPIva(dati.vat);
      if (vat && vat !== rec.vat) patch.vat = vat;
      const cf = normalizzaPIva(dati.fiscal_code);
      if (cf && cf !== rec.fiscal_code) patch.fiscal_code = cf;
      if (Object.keys(patch).length) {
        rec = { ...rec, ...patch, updated_at: now, updated_by: this.getCurrentIdentity().initials };
        mosso = true;
      }
    }
    /* La destinazione si aggiunge SEMPRE, anche a modifica «spot»: un
       indirizzo nuovo non e' una correzione di quello vecchio — e' un posto
       in piu' dove quel cliente riceve, e la volta dopo si sceglie. */
    const esito = conDestinazione(rec, dati, nuovoId('DE'), now);
    if (esito.aggiunta) { rec = esito.record; mosso = true; }

    if (mosso) {
      await Persistence.put('recipients', rec);
      this._applyToCache('recipients', 'put', rec);
      await this._touchMeta();
    }
    return { record: rec, creato: false, destinazioneNuova: esito.aggiunta };
  },

  async saveRecipient(rec: Destinatario) {
    if (!rec?.rcp_id) throw new Error('Destinatario senza identificativo');
    const agg = { ...rec, updated_at: Date.now(), updated_by: this.getCurrentIdentity().initials };
    await Persistence.put('recipients', agg);
    this._applyToCache('recipients', 'put', agg);
    await this._touchMeta();
    return agg;
  },

  async deleteRecipient(rcpId: string) {
    await Persistence.delete('recipients', rcpId);
    this._applyToCache('recipients', 'delete', { rcp_id: rcpId });
    await this._touchMeta();
  },

  getCausale(id: string) {
    const list = this.getDocConfig().causali;
    return list.find((c: { id: string }) => c.id === id) || null;
  },

  movTypeForCausale(id: string) {
    const c = this.getCausale(id);
    return c && c.mov === 'RET' ? MOV.RET : MOV.SHIP;
  },

  proposeDdtNumber() {
    const last = String(this.getDocConfig().ddt.last_number || '').trim();
    if (!last) return '';
    const m = last.match(/^(.*?)(\d+)(\D*)$/);
    if (!m) return '';
    const [, prefix, digits, suffix] = m as unknown as [string, string, string, string];
    const next = String(parseInt(digits, 10) + 1).padStart(digits.length, '0');
    return `${prefix}${next}${suffix}`;
  },

  /* Memorizza l'ultimo numero effettivamente usato, cosi' la proposta
     successiva riparte da li' anche se l'operatore l'aveva sovrascritto. */
  async rememberDdtNumber(num: string) {
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

  buildLocationGeometry() { return costruisciGeometria(this._cache.sites); },

  findNearestBlockedLocation(currentLocCode: string) {
    const parts = currentLocCode.split('-');
    const siteId = parts[0] || '';
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

  /* ═══ STATS / KPI ═══
     Contare gli stati e comporre il cruscotto stanno in
     `core/statistiche.ts` — quinto blocco della conversione, e l'ultimo che
     si stacca senza toccare il supporto. */
  getSiteStats(siteId: string) {
    const codici = this.getZones(siteId).flatMap(z => generaUbicazioni(siteId, z).map(l => l.code));
    return contaStati(this._cache, this._indici, codici);
  },

  getZoneStats(siteId: string, zoneId: string) {
    return contaStati(this._cache, this._indici, this.generateLocations(siteId, zoneId).map(l => l.code));
  },

  computeKPIs() { return calcolaKPI(this._cache, this._indici); },

  /* ═══ EXPORT / IMPORT ═══
     Comporre il pacchetto e verificarlo stanno in `core/pacchetto.ts` —
     quarto blocco della conversione. Qui resta cio' che parla col supporto:
     leggere il registro, e la transazione di ripristino. */
  async exportAll({ includeMovLog = true } = {}) {
    const movLog: Movimento[] = [];
    if (includeMovLog) {
      await this.eachMovement(rows => { for (const r of rows) movLog.push(r); });
      movLog.sort((a, b) => b.ts - a.ts);
    }
    return componiPacchetto(this._cache, movLog, { includeMovLog });
  },

  _countsOf(data: Record<string, unknown>) { return contaPacchetto(data); },

  verifyExportPackage(data: unknown) { return verificaPacchetto(data); },

  async importAll(data: Record<string, any>, mode: string = 'overwrite') {
    if (!data._format?.startsWith(FORMATO_PACCHETTO)) {
      throw new Error(`Formato file non supportato. Richiesto: ${FORMATO_PACCHETTO}.x`);
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
          await Persistence.bulkAdd(c, righeDaScrivere(c, righe));
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
    await Persistence.writeBackup!(filename, json);
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
    return await Persistence.listBackups!(this.BACKUP_PREFIX);
  },

  /* Mantiene solo gli ultimi BACKUP_KEEP file. */
  async cleanupOldOPFSBackups() {
    const list = await this.listOPFSBackups();
    if (list.length <= this.BACKUP_KEEP) return 0;
    const toDelete = list.slice(this.BACKUP_KEEP);
    let removed = 0;
    for (const f of toDelete) {
      if (await Persistence.deleteBackup!(f.name)) removed++;
    }
    return removed;
  },

  /* Legge il contenuto di un backup specifico (per restore manuale). */
  async readOPFSBackup(filename: string) {
    if (!this.isOPFSSupported()) throw new Error('OPFS non supportato');
    return await Persistence.readBackup!(filename);
  },

  async requestPersistentStorage() {
    if (!navigator.storage?.persist) return { granted: false, reason: 'API non disponibile su questo browser.' };
    try {
      if (await navigator.storage.persisted()) return { granted: true, reason: '' };
      const ok = await navigator.storage.persist();
      return { granted: ok, reason: ok ? '' : this._persistDenialReason() };
    } catch (err) {
      return { granted: false, reason: `Richiesta non riuscita: ${(err as Error).message}` };
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
