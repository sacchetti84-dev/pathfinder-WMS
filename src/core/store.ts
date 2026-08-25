import { MOV } from './costanti';
import type { MOV as MovTipo, Criterio } from '../types/contratto';
import { Persistence } from './persistence/index';
import { COLLEZIONI, type Collezione } from '../types/collezioni';
import type {
  StatoUbicazione, UbicazioneDisattivata,
  Sito, Zona, Articolo, Giacenza, Movimento, Quarantena, DocumentoUscita,
  RigaDocumento, SessionePrelievo, ReportPrelievo, VerbaleSmaltimento,
  Operatore, Istante, Coordinate, GiacenzaRimossa, IngressoArticolo, Compito,
  Lotto, Destinatario, Destinazione, Udc,
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
  suddividi, uomDaColli, verifica as verificaUm, descrivi as descriviUom,
  sommaUom, sottraiUom, arrotonda as arrotondaUom, decimali as decimaliUom,
  validaConfigurazione as validaConfezione,
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
import { rigaDocumento } from '../modules/documenti';
import {
  leggiColli, daSuddivisione, totaleUom as totaleUomColli,
  descriviColli, preleva as prelevaColli, uscite as uscitePerIlServizio,
  scelteDaMisure as scelteDaMisureColli, scelteDaUscite as scelteDaUsciteColli,
  type Scelta,
} from '../modules/colli';
import type { RigaArticolo } from '../modules/giacenzaArticolo';
import {
  nuovoCodice as nuovoCodiceUdc, prossimoSeriale as prossimoSerialeUdc,
  eVuota as udcVuota, validaPrefisso as validaPrefissoGS1,
} from '../modules/udc';
import {
  proponi as proponiStoccaggio, validaRegola as validaRegolaStoccaggio,
} from '../modules/stoccaggio';
import type { PostoCandidato, RegolaStoccaggio } from '../modules/stoccaggio';
import { conto as contoWip, colliFuori as colliFuoriWip, archiviato as archiviatoWip,
         ordiniArchiviati as ordiniArchiviatiWip,
         righeSenzaOrdine as righeSenzaOrdineWip } from '../modules/wip';
import { registroAttivita as registroAttivitaPuro } from '../modules/compiti';
import {
  perPersona as kpiPerPersona, perMovimento as kpiPerMovimento, perArticolo as kpiPerArticolo,
} from '../modules/kpi';
import type { Finestra } from '../modules/kpi';
import { generaUbicazioni, codiciAttivi, costruisciGeometria } from './geometria';
import { ordinaFEFO, primoFEFO, eFEFO, cercaGiacenze } from './giacenza';
import {
  FORMATO as FORMATO_PACCHETTO, COLLEZIONI_EXPORT, righeDaScrivere,
  componi as componiPacchetto, conta as contaPacchetto, verifica as verificaPacchetto,
} from './pacchetto';
import { statoUbicazione, contaStati, calcolaKPI } from './statistiche';
import { verificaConformita } from '../modules/conformita';
import { App } from '../ui/app.js';

/* 2.0 — GLI INTERRUTTORI NON CI SONO PIU'.

   Dalla 1.4 ogni funzione entrava in magazzino spenta e si accendeva una
   alla volta: serviva a tornare indietro senza disinstallare, nei mesi in
   cui il codice arrivava piu' in fretta di quanto il magazzino potesse
   provarlo. Al 19/08/2026 tutte e sei erano accese in produzione, e un
   interruttore che nessuno abbassa piu' non e' una via di ritorno: e' un
   ramo di codice che nessuno percorre e che nessun collaudo esercita — cioe'
   il posto dove un difetto vive piu' a lungo.

   Le chiavi `feature.*` restano scritte in `meta` e non si cancellano —
   nessun dato viene riscritto all'installazione, §6 — ma nessuno le legge
   piu'. Una funzione che da' fastidio si toglie reinstallando il pacchetto
   di prima, che dal 18/08 e' comunque l'unica via di ritorno intera. */

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

  /* 2.1 — L'ADMIN CONTA COME TEAM LEADER, dappertutto. Dove serviva «un
     leader attivo» — autorizzare un rinnovo di PIN, alzare una priorità,
     non restare senza nessuno che possa — una carica più alta non può
     valere meno: senza questa riga, nominare Admin l'unico leader del
     magazzino chiuderebbe il cerchio esattamente come il 13/08. */
  _comanda(o: Operatore) { return o.role === 'leader' || o.role === 'admin'; },

  getActiveLeaders() {
    return this._cache.operators.filter(o => this._comanda(o) && o.active !== false);
  },

  getUsableLeaders() {
    return this._cache.operators.filter(o =>
      this._comanda(o) && o.active !== false && !!o.pin_hash);
  },

  getActiveAdmins() {
    return this._cache.operators.filter(o => o.role === 'admin' && o.active !== false);
  },

  getUsableAdmins() {
    return this._cache.operators.filter(o =>
      o.role === 'admin' && o.active !== false && !!o.pin_hash);
  },

  /** 2.1 — CHI PUÒ APRIRE LA CONFIGURAZIONE E IL RESET.

      L'Admin, e basta. Con un'eccezione dichiarata e temporanea: **finché
      nessun Admin esiste**, le chiavi restano ai Team Leader. Senza quella
      riga l'installazione di questa versione su un magazzino dove nessuno
      è ancora Admin — cioè ogni installazione, il primo giorno — murerebbe
      la Configurazione, e la Configurazione è l'unico posto da cui si
      nomina un Admin. Un cerchio chiuso su se stesso, come il PIN del
      13/08. Nominato il primo Admin, l'eccezione si spegne da sola. */
  comandaLaConfigurazione(op: Operatore | null | undefined): boolean {
    if (!op || op.active === false) return false;
    if (op.role === 'admin') return true;
    return op.role === 'leader' && this.getActiveAdmins().length === 0;
  },

  async addOperator(rec: Partial<Operatore> & { initials: string }): Promise<Operatore> {
    const initials = String(rec.initials ?? '').toUpperCase().trim();
    if (this.getOperatorByInitials(initials)) {
      throw new Error(`Le iniziali ${initials} sono già assegnate a un altro operatore`);
    }
    const now = Date.now();
    const record: Operatore = {
      op_id: `OP-${now.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      first_name: rec.first_name || '',
      last_name:  rec.last_name || '',
      initials,
      role:       rec.role === 'admin' ? 'admin' : rec.role === 'leader' ? 'leader' : 'operator',
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
    this._cache.meta = {
      lastModified: metaObj.lastModified || null,
      unsavedChanges: metaObj.unsavedChanges || false,
      lastAutoBackup: metaObj.lastAutoBackup || null,
      docConfig: metaObj.docConfig || null,
      /* 1.4.2.1 — TRAPPOLA 22: una chiave di `meta` che non e' dichiarata qui
         vive in cache finche' qualcuno non ricarica, e poi sparisce. */
      oreUrgenza: metaObj.oreUrgenza ?? null,
      /* 1.12 — il prefisso GS1. Vuoto = codici UDC interni; compilato =
         SSCC veri. Dichiarato QUI per la trappola 22 qui sopra. */
      udcPrefissoGS1: metaObj.udcPrefissoGS1 ?? '',
      /* 1.14 — l'area del conto di produzione. Trappola 22: dichiarata qui. */
      areaWip: metaObj.areaWip ?? '',
      /* 2.1 — il layout del cruscotto. Trappola 22: dichiarata qui, o
         vivrebbe in cache fino al primo ricaricamento e poi sparirebbe. */
      dashboardLayout: metaObj.dashboardLayout ?? null
    };
  },

  /* 2.1 — LA PURGA NON C'È PIÙ, e con lei le due funzioni che la
     servivano. `purgeMovementsBefore` era l'unica strada per cui un
     movimento poteva sparire da questo database: il registro è la firma
     GMP di chi ha mosso la merce e si tiene sei anni, e un modo di
     cancellarlo — per quanto protetto da export e doppia conferma — è un
     modo che prima o poi qualcuno percorre. Per portare via i dati resta
     l'export JSON, che non toglie niente da dove sta. */

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

     LE DUE ECCEZIONI, dichiarate. Restano fuori di qui i percorsi che
     agiscono su INSIEMI e non su singoli record, perche' passarli riga
     per riga significherebbe migliaia di chiamate al posto di un filtro:
       · _loadCache()          — idratazione completa dal supporto
       · deleteSite/deleteZone — cancellazione per prefisso di ubicazione
     Tutte e due terminano ricostruendo gli indici, quindi la cache resta
     coerente. Quando il server invieta' delta di massa, saranno queste
     a diventare un'operazione sola.

     DA QUI IN POI STA IN TYPESCRIPT. L'implementazione e' in
     `core/cache.ts` — primo blocco della conversione, PIANO-1.4 §3. Qui
     restano il nome e la firma, che quarantasette punti di questo file
     chiamano: spostare il codice non doveva muovere nient'altro.
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

  getLot(articleCode: string, lotCode: string) {
    return this._lotByKey.get(chiaveLotto(articleCode, lotCode)) || null;
  },

  /* LA CONFEZIONE DEL LOTTO VINCE SU QUELLA DELL'ANAGRAFICA, sempre: e' un
     fatto gia' successo, e i colli a scaffale sono imballati come allora.
     L'anagrafica si legge solo per il lotto che non e' mai stato posizionato. */
  getUomConfig(articleCode: string, lotCode: string): Configurazione | null {
    const daArticolo = configurazioneUom(this.getArticle(articleCode));
    const delLotto = daLotto(this.getLot(articleCode, lotCode));
    if (!delLotto) return daArticolo;
    if (delLotto.per_collo) return delLotto;
    /* 2.5 — UN LOTTO CONGELATO SENZA QUANTITA' PER COLLO NON RESTA ROTTO PER
       SEMPRE. `_congelaLotto` copia dall'anagrafica al primo posizionamento, e
       mezza anagrafica quel numero non ce l'ha: quei lotti nascevano con
       l'unita' scritta e il per-collo vuoto, e da li' in poi `daLotto`
       restituiva un oggetto NON nullo — quindi il `??` non ripiegava mai e
       compilare l'articolo dopo non riparava niente.

       Il ripiego vale solo a LETTURA e solo a UNITA' UGUALE: un per-collo in
       KG non si presta a un lotto in PZ. Niente viene riscritto — il lotto che
       la quantita' ce l'ha continua a vincere, come sempre. */
    if (daArticolo?.per_collo && daArticolo.uom === delLotto.uom) {
      return { uom: delLotto.uom, per_collo: daArticolo.per_collo };
    }
    return delLotto;
  },

  /* IL CONGELAMENTO, AL PRIMO POSIZIONAMENTO.
     Un lotto gia' a magazzino non ha un record in `lots`: nasce qui, al primo
     movimento della 1.4.2, con l'unita' presa dall'anagrafica. Nessuna riga
     viene riscritta all'installazione — e un articolo senza `uom` non congela
     niente, cioe' si comporta come nella 1.2. */
  async _congelaLotto(articleCode: string, lotCode: string, adesso: Istante = Date.now()) {
    const gia = this.getLot(articleCode, lotCode);
    if (gia) return gia;
    const rec = congelaLotto(this.getArticle(articleCode), articleCode, lotCode, adesso);
    if (!rec) return null;
    const _id = await Persistence.add('lots', rec);
    const stored = { ...rec, _id } as Lotto;
    this._applyToCache('lots', 'put', stored);
    return stored;
  },

  /* 2.2 — LA CONFEZIONE SI PUO' DICHIARARE DOPO, E LA DICHIARA CHI HA I
     COLLI IN MANO.

     `_congelaLotto` copia dall'anagrafica, e mezza anagrafica la
     quantita' per collo non ce l'ha: quei lotti arrivano a scaffale con
     l'unita' scritta e il per-collo vuoto, e da li' in poi non dichiarano i
     loro colli. Il conto torna lo stesso finche' si muovono colli interi, e
     si ferma al primo collo aperto: aprirne uno vuol dire dire QUALE, e
     senza misure non c'e' un quale.

     Il numero non si indovina: lo dice l'operatore che ha il sacco davanti,
     ed e' una DICHIARAZIONE come l'inventario — per questo si scrive sul
     lotto e non sulla riga. La confezione e' un fatto del lotto, e vale per
     tutti i suoi colli, ovunque stiano.

     Non tocca le giacenze: `colliDiRiga` e `suddivisioneDi` derivano da qui
     alla prima lettura utile. Chi chiama scrive il movimento — questo posto
     non ha un registro. */
  async dichiaraConfezioneLotto(articleCode: string, lotCode: string, perCollo: unknown) {
    const art = String(articleCode ?? '').trim().toUpperCase();
    const lot = String(lotCode ?? '').trim();
    if (!art || !lot) throw new Error('Serve articolo e lotto per dichiarare la confezione');
    const cfg = this.getUomConfig(art, lot);
    if (!cfg?.uom) {
      throw new Error(`${art}#${lot}: manca l'unità di misura, e una quantità per collo senza unità non è un numero. Si compila in Configurazione → Articoli`);
    }
    const errori = validaConfezione(cfg.uom, perCollo);
    if (errori.length) throw new Error(errori.join(' · '));
    const per = arrotondaUom(perCollo, decimaliUom(cfg.uom))!;
    const gia = this.getLot(art, lot);
    const now = Date.now();
    const rec: Lotto = {
      ...(gia ?? {}),
      article_code: art, lot_code: lot, uom: cfg.uom,
      uom_per_collo: per, frozen_at: gia?.frozen_at ?? now,
    };
    if (gia?._id) {
      await Persistence.update('lots', gia._id, { uom: cfg.uom, uom_per_collo: per });
      this._applyToCache('lots', 'put', rec);
    } else {
      const _id = await Persistence.add('lots', rec);
      this._applyToCache('lots', 'put', { ...rec, _id } as Lotto);
    }
    await this._touchMeta();
    return { uom: cfg.uom, per_collo: per };
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

  /* ═══════════════════════════════════════════════════════════════════
     1.8 — L'ELENCO DEI COLLI
     © Andrea Sacchetti — Dietopack S.r.l.

     Lo stesso articolo arriva in colli da 5 kg e la volta dopo da 25: la
     suddivisione non si calcola piu' da un per-collo costante, si DICHIARA.
     La regola pura sta in `modules/colli.ts`; qui c'e' solo cio' che scrive.

     L'interruttore e' suo, e non e' `uom`: `uom` e' acceso in magazzino dal
     13/08, e installare la 1.8 non deve cambiare da solo il modo in cui si
     posiziona la merce. Installare non e' accendere.
     ═══════════════════════════════════════════════════════════════════ */

  /* Senza le unita' di misura non c'e' niente da dichiarare: l'elenco e'
     fatto di quantita', e una quantita' senza unita' non e' un numero. */
  /* L'elenco di una riga, o la lettura onesta di una riga che non ce l'ha:
     colli PIENI piu' il resto, che e' esattamente ciò che la 1.7 mostrava.
     Nessuna riga viene riscritta finche' qualcuno non la muove. */
  colliDiRiga(item: Giacenza | null | undefined): number[] | null {
    if (!item) return null;
    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg) return null;
    return leggiColli(item.packs, cfg.uom)
        ?? daSuddivisione(item.qty_uom ?? uomDaColli(item.qty ?? 0, cfg.per_collo, cfg.uom), cfg.per_collo, cfg.uom);
  },

  /* Le scelte che ritrovano, sulla riga di adesso, i colli che erano usciti:
     la usa lo storno, che deve togliere quelli e non altri della stessa
     misura comoda. `null` se la riga non porta un elenco. */
  scelteDaColli(item: Giacenza | null | undefined, misure: unknown): Scelta[] | null {
    if (!item) return null;
    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg) return null;
    return scelteDaMisureColli(this.colliDiRiga(item), misure, cfg.uom);
  },

  /* I COLLI ANCORA LIBERI SU UNA RIGA.

     Un DDT pendente non toglie niente dalla giacenza: prenota. Fino alla
     1.8.3 la prenotazione era un numero — tre colli su cinque — e bastava,
     perche' i colli erano indistinguibili. Con l'elenco non lo sono piu': se
     un documento ha gia' impegnato il collo aperto da 7, chi scrive il
     documento dopo non lo puo' scegliere di nuovo.

     `ancheQueste` sono le uscite che chi chiama sta per impegnare e che a
     documento non ci sono ancora — il carrello in corso. `excludeDocId`
     salta un documento: serve a chi riapre il proprio.

     Lancia se un documento pendente nomina un collo che non c'e' piu': e'
     un fatto che qualcuno deve sapere, non un elenco da accorciare in
     silenzio. `null` se la riga non porta un elenco. */
  colliLiberi(item: Giacenza | null | undefined, ancheQueste: unknown[] | null = null, excludeDocId: string | null = null): number[] | null {
    const elenco = this.colliDiRiga(item);
    if (!item || !elenco) return null;
    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg) return null;
    const impegnate: unknown[] = [];
    for (const d of this._cache.pendingOut) {
      if (d.status !== 'pending' || (excludeDocId && d.doc_id === excludeDocId)) continue;
      for (const l of d.lines) {
        if (l.location_code === item.location_code && l.item_key === item.item_key
            && Array.isArray(l.packs_out)) impegnate.push(...l.packs_out);
      }
    }
    if (Array.isArray(ancheQueste)) impegnate.push(...ancheQueste);
    if (!impegnate.length) return elenco;
    return prelevaColli(elenco, scelteDaUsciteColli(elenco, impegnate, cfg.uom), cfg.uom).rimasti;
  },

  /* 1.9 — LE RIGHE COME LE LEGGONO LE VISTE: colli, UM risolte e la
     descrizione per esteso, in una forma che non e' piu' quella del
     database. Sta qui e non nelle viste perche' la lettura delle UM e' una
     sola — `_uomDiRiga` — e due letture della stessa riga sono due saldi. */
  righeLette(items: readonly Giacenza[] | null | undefined): RigaArticolo[] {
    if (!items?.length) return [];
    return items.map(i => {
      const cfg = this.getUomConfig(i.article_code, i.lot_code);
      return {
        location_code: i.location_code,
        lot_code: i.lot_code,
        item_key: i.item_key,
        expiry_date: i.expiry_date || '',
        placed_at: i.placed_at || 0,
        colli: i.qty || 0,
        uom_qty: this._uomDiRiga(i, cfg),
        uom: cfg?.uom || null,
        descrizione: this.descriviRiga(i),
      };
    });
  },

  /* Le uscite scritte su un documento, ritrovate sulla riga di adesso: la
     usa l'evasione del DDT, che esegue una scelta fatta giorni prima. `null`
     se la riga non porta un elenco, o se il documento non porta le uscite —
     un DDT scritto prima della 1.8.4, e allora i colli si chiedono. */
  scelteDaUscite(item: Giacenza | null | undefined, messe: unknown): Scelta[] | null {
    if (!item) return null;
    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg) return null;
    return scelteDaUsciteColli(this.colliDiRiga(item), messe, cfg.uom);
  },

  /* Come si legge una riga: dall'elenco quando c'e', dalla suddivisione
     calcolata quando no. Una sola funzione perche' due formattazioni dello
     stesso numero, per chi legge, sono due numeri diversi. */
  descriviRiga(item: Giacenza | null | undefined): string {
    if (!item) return '—';
    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg) return '—';
    const elenco = this.colliDiRiga(item);
    if (elenco) return descriviColli(elenco, cfg.uom);
    const s = this.suddivisioneDi(item);
    return s ? descriviUom(item.qty_uom ?? uomDaColli(item.qty ?? 0, cfg.per_collo, cfg.uom), cfg.per_collo, cfg.uom) : '—';
  },

  /* Le UM di una riga, anche quando `qty_uom` non c'e' ancora.
     RETROCOMPATIBILITA': una giacenza posizionata prima della 1.4.2 si legge
     come colli PIENI, che e' l'unica lettura onesta di un dato che nessuno ha
     mai dichiarato. Il valore non viene scritto finche' qualcuno non muove
     quella riga: all'installazione non si riscrive niente. */
  _uomDiRiga(item: Giacenza, cfg: Configurazione | null): number | null {
    if (!cfg) return null;
    /* 1.8 — DOVE C'E' L'ELENCO, COMANDA L'ELENCO: `qty_uom` e' la sua colonna
       materializzata, e fra i due il dato vero e' quello che descrive i colli
       uno per uno. E' la stessa regola che il servizio applica nella
       transazione — se le due letture divergessero, divergerebbero i saldi. */
    const elenco = leggiColli(item.packs, cfg.uom);
    if (elenco) return totaleUomColli(elenco, cfg.uom);
    if (!cfg.per_collo) return null;
    if (typeof item.qty_uom === 'number') return item.qty_uom;
    return uomDaColli(item.qty ?? 0, cfg.per_collo, cfg.uom);
  },

  async addItem(locationCode: string, articleCode: string, articleDescription: string, lotCode: string, expiryDate: string = '', notes: string = '', qty: number = 1, qtyUom: number | null = null, packsIn: number[] | null = null) {
    const itemKey = `${articleCode}#${lotCode}`;
    const bucket = this._invByLoc.get(locationCode) || [];
    const existing = bucket.find(i => i.item_key === itemKey);
    const now = Date.now();

    /* 1.4.2 — la confezione si congela QUI, al primo posizionamento: da
       questo momento e' un fatto del lotto e non segue piu' l'anagrafica. */
    await this._congelaLotto(articleCode, lotCode, now);
    const cfg = this.getUomConfig(articleCode, lotCode);

    /* 1.8 — LA SUDDIVISIONE DICHIARATA VINCE SU TUTTO CIO' CHE ARRIVA CON
       LEI: i colli sono quanti sono nell'elenco, e le UM sono la loro somma.
       Chi ha la merce in mano ha contato; `qty` e `qty_uom` qui diventano due
       conseguenze, e passarli diversi non li fa diventare veri. */
    const packs = (packsIn && cfg) ? leggiColli(packsIn, cfg.uom) : null;
    const qtyAdd = packs ? packs.length : Store._assertPositiveInt(qty, 'Quantità da posizionare');
    const uomAdd = packs ? totaleUomColli(packs, cfg!.uom) : this._uomInIngresso(qtyAdd, qtyUom, cfg);

    // Caso 1: item già presente in questa ubicazione → incrementa qty
    if (existing) {
      /* 1.8 — l'elenco di PRIMA si legge prima di toccare la riga: il ponte
         `daSuddivisione` deriva da `qty_uom`, e su una riga già incrementata
         deriverebbe i colli nuovi due volte. */
      const colliPrima = packs ? this.colliDiRiga(existing) : null;
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
      /* 1.8 — i colli nuovi si accodano a quelli che c'erano. Se la riga non
         ha un elenco NE' se ne puo' derivare uno, non se ne inventa uno con i
         soli colli nuovi: la riga resterebbe con meno colli di quanti ne ha
         a scaffale. Si comporta come nella 1.7, e l'elenco nascerà il giorno
         che quella riga si svuota e si riposiziona. */
      if (packs && colliPrima) {
        existing.packs = [...colliPrima, ...packs];
        /* Le due colonne le riconta l'elenco, come fa il servizio dentro la
           transazione: due letture che divergono sono due saldi che divergono. */
        existing.qty = existing.packs.length;
        existing.qty_uom = totaleUomColli(existing.packs, cfg!.uom);
        updates.packs = existing.packs;
        updates.qty = existing.qty;
        updates.qty_uom = existing.qty_uom;
      }
      await Persistence.update('inventory', existing._id!, updates);
      this._applyToCache('inventory', 'put', existing);
      await this._touchMeta();
      return { ok: true, item: existing, mode: 'incremented', qty_before: qtyBefore, qty_after: existing.qty,
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
    if (packs) rec.packs = packs;
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

  /* 1.8 — L'USCITA A COLLI SCELTI.

     Il client sceglie per INDICE, perche' e' quello che l'operatore tocca a
     video; al servizio arrivano solo le quantita' — `packs_out` — e le cerca
     nell'elenco che la riga ha in quel momento. Un indice viaggia male: fra il
     render della maschera e il tocco sul bottone un altro terminale puo' aver
     preso quel collo, e l'indice punterebbe a merce diversa.

     `preleva` lancia su tutto cio' che non torna, e lancia PRIMA di scrivere:
     un collo che non esiste, lo stesso scelto due volte, una quantita' piu'
     grande di quello che il collo contiene. */
  async _prelevaColli(locationCode: string, item: Giacenza, scelte: Scelta[]) {
    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    const elenco = this.colliDiRiga(item);
    if (!cfg || !elenco) {
      throw new Error(`${item.item_key}: questa riga non porta l'elenco dei colli`);
    }
    const esito = prelevaColli(elenco, scelte, cfg.uom);
    const qtyBefore = elenco.length;
    const uomBefore = totaleUomColli(elenco, cfg.uom);
    const uomAfter = totaleUomColli(esito.rimasti, cfg.uom);
    const tutto = esito.rimasti.length === 0;

    if (Persistence.supportsRemoteOps) {
      const removed = await Persistence.op!<GiacenzaRimossa>('removeItem', {
        location_code: locationCode, item_key: item.item_key,
        packs_out: uscitePerIlServizio(elenco, scelte, cfg.uom), packs_before: elenco,
      });
      if (removed._mode === 'full') this._applyToCache('inventory', 'delete', item);
      else {
        item.qty = removed._qty_after;
        if (typeof removed._qty_uom_after === 'number') item.qty_uom = removed._qty_uom_after;
        if (Array.isArray(removed.packs)) item.packs = removed.packs;
        item.last_updated_at = Date.now();
        this._applyToCache('inventory', 'put', item);
      }
      removed._packs_out = esito.usciti;
      removed._packs_before = elenco;
      removed._packs_after = removed._mode === 'full' ? [] : (removed.packs ?? esito.rimasti);
      return removed;
    }

    const removed = { ...item } as GiacenzaRimossa;
    removed._mode = tutto ? 'full' : 'partial';
    removed._qty_before = qtyBefore;
    removed._qty_after = esito.rimasti.length;
    removed._qty_delta = esito.rimasti.length - qtyBefore;
    removed._qty_uom_before = uomBefore;
    removed._qty_uom_after = tutto ? 0 : uomAfter;
    removed._qty_uom_delta = -esito.uom;
    removed._packs_out = esito.usciti;
    removed._packs_before = elenco;
    removed._packs_after = esito.rimasti;

    if (tutto) {
      this._applyToCache('inventory', 'delete', item);
      await Persistence.delete('inventory', item._id!);
      await this._touchMeta();
      return removed;
    }
    item.packs = esito.rimasti;
    item.qty = esito.rimasti.length;
    item.qty_uom = uomAfter;
    item.last_updated_at = Date.now();
    this._applyToCache('inventory', 'put', item);
    await Persistence.update('inventory', item._id!, {
      packs: item.packs, qty: item.qty, qty_uom: item.qty_uom, last_updated_at: item.last_updated_at,
    });
    await this._touchMeta();
    return removed;
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

  async removeItem(locationCode: string, itemKey: string, qtyRemove: number | null = null, qtyUomRemove: number | null = null, scelte: Scelta[] | null = null) {
    if (qtyRemove !== null) qtyRemove = Store._assertPositiveInt(qtyRemove, 'Quantità da prelevare');
    const bucket = this._invByLoc.get(locationCode) || [];
    const idx = bucket.findIndex(i => i.item_key === itemKey);
    if (idx === -1) return null;
    const item = bucket[idx]!;
    const qtyBefore = item.qty || 1;
    /* 2.0 — L'UNITÀ DI CARICO MUORE QUANDO ESCE L'ULTIMA RIGA, e l'ultima
       riga esce da qui: prelievo, spedizione, smaltimento, quarantena
       passano tutti per `removeItem`. Fino alla 2.0 `chiudiUdcSeVuota` la
       chiamava solo `assegnaAUdc`, cioè il caso in cui una riga viene
       SCARICATA dal pallet — e un pallet svuotato prelevandolo restava
       aperto per sempre, contato fra le unità in giro e ancora spostabile
       benché non avesse più niente sopra. La chiave si legge adesso: fra un
       attimo la riga non c'è più. */
    const udcDellaRiga = item.udc_id ?? null;

    /* 1.8 — chi sceglie i colli passa di qua e non tocca il resto: senza
       scelte questa funzione e' quella della 1.7, riga per riga. */
    if (scelte) {
      const esito = await this._prelevaColli(locationCode, item, scelte);
      if (esito?._mode === 'full' && udcDellaRiga) await this.chiudiUdcSeVuota(udcDellaRiga);
      return esito;
    }

    /* 2.0 — UNA RIGA CHE DICHIARA I COLLI NON SI SCARICA A NUMERO.

       Senza scelte il servizio cala `qty` e lascia dov'erano `packs` e
       `qty_uom`: la riga esce da qui dicendo tre colli con l'elenco di sette
       e il peso di sette. E' la stessa incoerenza che la 1.8.4 ha chiuso su
       documenti, inventario e campionamento — un saldo scritto sopra un
       elenco rimasto indietro — e fino alla 2.0 rientrava dal conto di
       produzione, che era l'unico chiamante a chiedere «togline tre».

       Il rifiuto guarda `packs` DICHIARATI, non `colliDiRiga`: quella legge
       un elenco anche dove nessuno l'ha mai scritto, e rifiutare li' vorrebbe
       dire fermare la rettifica di inventario sulle righe della 1.7.

       Lo svuotamento totale resta libero: la riga sparisce intera, e non
       resta niente a cui l'elenco possa sopravvivere. */
    if (qtyRemove !== null && qtyRemove < qtyBefore
        && Array.isArray(item.packs) && item.packs.length) {
      throw new Error(`${itemKey} in ${locationCode} dichiara i suoi colli: per toglierne ${qtyRemove} bisogna dire QUALI`);
    }

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
      if (removed._mode === 'full') {
        this._applyToCache('inventory', 'delete', item);
        if (udcDellaRiga) await this.chiudiUdcSeVuota(udcDellaRiga);
      } else {
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
      if (udcDellaRiga) await this.chiudiUdcSeVuota(udcDellaRiga);
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

  async sampleItem(locationCode: string, itemKey: string, qtyUom: number, daCollo: number | null = null) {
    const bucket = this._invByLoc.get(locationCode) || [];
    const item = bucket.find(i => i.item_key === itemKey);
    if (!item) return null;

    const cfg = this.getUomConfig(item.article_code, item.lot_code);
    if (!cfg) throw new Error(`${item.article_code} non ha un'unità di misura: il campione non si può quantificare`);
    const prelevate = arrotondaUom(qtyUom, decimaliUom(cfg.uom));
    if (prelevate === null || prelevate <= 0) throw new Error(`Quantità del campione in ${cfg.uom}: deve essere maggiore di zero`);

    /* 1.8.4 — IL CAMPIONE ESCE DA UN COLLO PRECISO, e quel collo cala.
       Prima di qui il campionamento scalava solo `qty_uom`: su una riga a
       colli dichiarati l'elenco restava pieno, e siccome dove c'e' l'elenco
       comanda l'elenco, il campione spariva alla lettura dopo. */
    const elenco = this.colliDiRiga(item);
    if (elenco && daCollo === null) {
      throw new Error(`${item.item_key}: questa riga porta l'elenco dei colli — dire da quale collo esce il campione`);
    }
    if (elenco) {
      const uscita = [{ da: daCollo!, quantita: prelevate }];
      const scelte = scelteDaUsciteColli(elenco, uscita, cfg.uom)!;
      const esito = prelevaColli(elenco, scelte, cfg.uom);
      /* Un campione vale un collo di residuo: se il collo si svuota non e'
         un campionamento, e la rotta lo rifiuta. Si dice di qua, prima. */
      if (esito.rimasti.length !== elenco.length) {
        throw new Error(`Un campione lascia sempre un residuo: per prendere tutto il collo da ${daCollo} ${cfg.uom} serve un prelievo`);
      }
      const primaUm = totaleUomColli(elenco, cfg.uom);
      const dopoUm = totaleUomColli(esito.rimasti, cfg.uom);
      if (Persistence.supportsRemoteOps) {
        const res = await Persistence.op!<{ qty_uom_before: number; qty_uom_after: number; packs: number[] }>('sampleItem', {
          location_code: locationCode, item_key: itemKey, packs_out: uscita,
        });
        item.qty_uom = res.qty_uom_after;
        if (Array.isArray(res.packs)) item.packs = res.packs;
        item.last_updated_at = Date.now();
        this._applyToCache('inventory', 'put', item);
        return { ok: true, item, uom: cfg.uom, qty_uom_before: res.qty_uom_before,
                 qty_uom_after: res.qty_uom_after, qty_uom_delta: -prelevate };
      }
      item.packs = esito.rimasti;
      item.qty_uom = dopoUm;
      item.last_updated_at = Date.now();
      this._applyToCache('inventory', 'put', item);
      await Persistence.update('inventory', item._id!, { packs: esito.rimasti, qty_uom: dopoUm, last_updated_at: item.last_updated_at });
      await this._touchMeta();
      return { ok: true, item, uom: cfg.uom, qty_uom_before: primaUm,
               qty_uom_after: dopoUm, qty_uom_delta: -prelevate };
    }

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

  async queryMovements({ from = null, to = null, type = '', text = '', limit = 2000 }: {
    from?: number | null; to?: number | null; type?: string; text?: string; limit?: number;
  } = {}) {
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
     Chiamanti legittimi: export Excel, export JSON, e i KPI qui sotto. */
  async eachMovement(fn: (blocco: Movimento[]) => void | Promise<void>, chunkSize: number = 5000) {
    return await Persistence.eachChunk('mov_log', { chunkSize }, fn);
  },

  /* ═══════════════════════════════════════════════════════════════════
     2.0 — I NUMERI DI ARTICOLI, MOVIMENTI E PERSONE

     La regola sta in `modules/kpi.ts` ed è pura. Qui c'è solo il lavoro di
     andare a prendere quello che le serve, e una decisione che vale più del
     resto del blocco:

     I KPI LEGGONO L'ARCHIVIO INTERO, NON LA FINESTRA DEL REGISTRO.
     `getMovLog()` restituisce gli ultimi N giorni — è la finestra che tiene
     leggera la cache, e va benissimo per il registro a video. Un KPI letto
     da lì direbbe «nessun movimento» per il mese scorso, e chi legge non
     avrebbe modo di distinguerlo da un mese senza lavoro. Si paga un giro su
     tutto l'archivio, ed è il motivo per cui queste tre sono `async` mentre
     `computeKPIs()` non lo è.
     ═══════════════════════════════════════════════════════════════════ */

  async _movimentiInFinestra(finestra: Finestra | null): Promise<Movimento[]> {
    const out: Movimento[] = [];
    await this.eachMovement((blocco) => {
      for (const m of blocco) {
        if (!m) continue;
        if (finestra && !(m.ts >= finestra.da && m.ts < finestra.a)) continue;
        out.push(m);
      }
    });
    return out;
  },

  /** Chi ha mosso cosa, e quanto ci ha messo. */
  async kpiPersone(finestra: Finestra | null = null) {
    return kpiPerPersona(await this._movimentiInFinestra(finestra), this._cache.tasks as Compito[], finestra);
  },

  /** I movimenti per causale, sito, ora e giorno. */
  async kpiMovimenti(finestra: Finestra | null = null) {
    return kpiPerMovimento(await this._movimentiInFinestra(finestra), finestra);
  },

  /** Gli articoli: rotazione, giacenza, fermi, scadenze, e quanta anagrafica
      manca sotto la merce che si sta già muovendo. */
  async kpiArticoli(opzioni: { finestra?: Finestra | null; giorniFermi?: number; giorniScadenza?: number } = {}) {
    const finestra = opzioni.finestra ?? null;
    return kpiPerArticolo(this._cache.inventory, await this._movimentiInFinestra(finestra),
      this._cache.articles, { ...opzioni, finestra });
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
  getTasks() { return this._cache.tasks; },

  /** 2.1 — IL REGISTRO DELLE ATTIVITÀ, compresi i campionamenti che nessun
      compito rivendica. La regola sta in `modules/compiti.ts` ed è pura;
      qui si passano le due sorgenti.

      I movimenti sono quelli IN FINESTRA, non l'archivio intero: la
      lettura è sincrona perché lo è la vista che la disegna, e allargare
      la finestra è un parametro di Configurazione. La vista lo dichiara —
      un elenco che tace su cosa non sta guardando è peggio di un elenco
      corto. */
  registroAttivita() {
    return registroAttivitaPuro(this._cache.tasks as Compito[], this._cache.movLog);
  },
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

  /* ═══════════════════════════════════════════════════════════════════
     1.14 — IL CONTO DI PRODUZIONE
     © Andrea Sacchetti — Dietopack S.r.l.

     A interruttore acceso il prelievo per ordine non fa sparire la merce: la
     porta nell'ubicazione WIP di quell'ordine. Da lì torna indietro quello
     che avanza, e ciò che resta a ordine chiuso è il consumo reale.

     LA MERCE RESTA IN GIACENZA, e non è un dettaglio: un vano WIP con dentro
     quello che la produzione ha in mano è la sola forma in cui quel numero
     esiste. Fino alla 1.13 quella merce non era da nessuna parte.

     A INTERRUTTORE SPENTO QUESTO BLOCCO NON GIRA. `PICK` resta l'uscita di
     sempre, e nessuna riga di `wip` nasce: è la ragione per cui la 1.14 si
     installa a dicembre spenta.

     La regola sta in `modules/wip.ts`, pura e collaudata.
     ═══════════════════════════════════════════════════════════════════ */

  getAreaWip(): string {
    return String((this._cache.meta as Record<string, any>).areaWip ?? '').trim();
  },

  async setAreaWip(area: string) {
    const a = String(area ?? '').trim().toUpperCase();
    /* Un'area che non esiste non si salva: il primo prelievo scriverebbe
       giacenza in un vano che nessuno ha mappato, e la scoprirebbe chi va a
       cercarla sulla mappa. */
    /* L'AREA E' UN'UBICAZIONE VERA, non un prefisso. Un vano per ordine
       vorrebbe dire mapparne uno a ogni ordine nuovo, e al banco il controllo
       sul prefisso passava mentre la merce sarebbe finita in un vano che
       nessuno aveva disegnato. A tenere distinti i conti sono le righe di
       `wip`, che portano l'ordine. */
    if (a && !this.locationExists(a)) {
      throw new Error(`L'ubicazione ${a} non esiste: l'area WIP dev'essere un vano mappato`);
    }
    const rec = { key: 'areaWip', value: a };
    await Persistence.put('meta', rec);
    this._applyToCache('meta', 'put', rec);
    (this._cache.meta as Record<string, any>).areaWip = a;
    return a;
  },

  /* ═══ 2.1 — IL CRUSCOTTO SE LO COMPONE CHI LO GUARDA ══════════

     Il layout è un documento JSON dentro `meta`, come l'area WIP e il
     prefisso GS1: nessuna collezione nuova, nessuna migrazione, e un campo
     assente significa «come nella 2.0» — cioè tutti i riquadri, nell'ordine
     del codice.

     È UNO SOLO PER MAGAZZINO, non uno per operatore. Su un terminale di
     corsia si alternano quattro persone nello stesso turno, e un cruscotto
     che cambia forma a ogni cambio sigla è un cruscotto che nessuno impara.
     Il giorno che servisse per persona, la chiave diventa `dashboard:<op>` e
     questa riga resta il ripiego.

     La regola che riconcilia il salvato col codice sta in
     `modules/cruscotto.ts`, ed è pura. */
  getDashboardLayout() {
    const raw = (this._cache.meta as Record<string, any>).dashboardLayout;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  },

  async setDashboardLayout(layout: unknown) {
    const rec = { key: 'dashboardLayout', value: layout };
    await Persistence.put('meta', rec);
    this._applyToCache('meta', 'put', rec);
    (this._cache.meta as Record<string, any>).dashboardLayout = layout;
    return layout;
  },

  getWipMovimenti() { return this._cache.wip; },

  /** Il conto di un ordine: entrato, tornato, residuo. */
  contoWip(odpNum: string) {
    /* 2.2 — la confezione la conosce Store, non il modulo: le UM che i
       movimenti non portano si derivano da qui, dal lotto di adesso. Vale
       per gli ordini prelevati prima che qualcuno dichiarasse la confezione,
       che sono la quasi totalità. */
    return contoWip(this._cache.wip as any[], odpNum,
      (r) => this.getUomConfig(r.article_code, r.lot_code)?.per_collo ?? null);
  },

  /** 2.1 — L'ORDINE CHIUSO È ARCHIVIATO, e non si tocca più. La prova è un
      movimento scritto, non il residuo a zero: vedi `archiviato` in
      `modules/wip.ts`. */
  ordineWipArchiviato(odpNum: string): boolean {
    return archiviatoWip(this._cache.wip as any[], odpNum);
  },

  /** Gli ordini che hanno un conto aperto, dal più recente. Un ordine
      archiviato non è aperto, nemmeno se qualcosa gli è rimasto nel vano. */
  ordiniWipAperti(): string[] {
    const visti = new Map<string, number>();
    for (const m of this._cache.wip as any[]) {
      if (!m?.odp_num) continue;
      /* In maiuscolo, come li confronta `modules/wip.ts`: un ordine scritto
         «prova6» prima della correzione si elenca e si apre come PROVA6, e
         non compare due volte se è stato preso in tutti e due i modi. */
      const odp = String(m.odp_num).trim().toUpperCase();
      const t = Number(m.ts) || 0;
      if (!visti.has(odp) || t > visti.get(odp)!) visti.set(odp, t);
    }
    return [...visti.entries()]
      .filter(([odp]) => !this.ordineWipArchiviato(odp) && this.contoWip(odp).residuo !== 0)
      .sort((a, b) => b[1] - a[1])
      .map(([odp]) => odp);
  },

  /** Gli ordini archiviati, dal più recente: l'archivio da sfogliare.
      Vedi `ordiniArchiviati` in `modules/wip.ts`. */
  ordiniWipArchiviati(): { odp_num: string; chiuso_il: number | null }[] {
    return ordiniArchiviatiWip(this._cache.wip as any[]);
  },

  /** Le righe ferme nel vano WIP che nessun ordine rivendica. Vuoto quando
      l'area WIP non è configurata: senza vano non c'è niente da guardare.
      Vedi `righeSenzaOrdine` in `modules/wip.ts`. */
  righeWipSenzaOrdine() {
    const vano = this.getAreaWip();
    if (!vano) return [];
    return righeSenzaOrdineWip(this._cache.wip as any[], this.getItemsAtLocation(vano));
  },

  /** La merce entra in lavorazione: si posiziona nel vano WIP dell'ordine e
      il movimento resta scritto. Chi chiama l'ha già tolta dal suo vano —
      questa funzione non toglie niente, aggiunge. */
  async entraInWip(odpNum: string, riga: {
    item_key: string; article_code: string; article_description?: string;
    lot_code: string; expiry_date?: string; qty: number;
    qty_uom?: number | null; uom?: string | null; packs?: number[] | null;
  }) {
    const dove = this.getAreaWip();
    if (!dove) throw new Error('Area WIP non configurata — si imposta in Configurazione → Funzioni');
    /* QUI SI FERMA LA RIESUMAZIONE. Ricaricare lo stesso ordine dopo la
       chiusura scriveva altri movimenti sotto lo stesso numero, e il conto
       li sommava a quelli di un ciclo già chiuso: due lavorazioni in un
       conto solo. Un ordine che ricomincia davvero è un ordine nuovo. */
    if (this.ordineWipArchiviato(odpNum)) {
      throw new Error(`L'ordine ${odpNum} è stato chiuso e archiviato: non può tornare in lavorazione. Se è una lavorazione nuova, serve un numero d'ordine nuovo.`);
    }
    const res = await this.addItem(dove, riga.article_code, riga.article_description || '',
      riga.lot_code, riga.expiry_date || '', `Ordine ${odpNum}`, riga.qty,
      typeof riga.qty_uom === 'number' ? riga.qty_uom : null, riga.packs ?? null);
    if (!res.ok) throw new Error(`Non è stato possibile portare ${riga.item_key} in ${dove}`);

    /* 2.0 — I COLLI DEL CONTO SONO QUELLI CHE SI SONO MOSSI, non il calo
       dello scaffale. I due numeri divergono ogni volta che un collo si
       apre: prelevando 50,7 kg da `[25, 25, 25, 18.795]` escono TRE colli —
       due interi e la parte del terzo — ma a scaffale i posti calano di due,
       perché il terzo resta lì spaiato. Il chiamante passava il calo, e il
       vano WIP nasceva con tre colli mentre il conto ne dichiarava due: alla
       chiusura il conto chiedeva indietro meno merce di quanta ce ne fosse,
       e l'ordine non si chiudeva più. `addItem` conta l'elenco: qui si conta
       lo stesso elenco. */
    const colliMossi = Array.isArray(riga.packs) && riga.packs.length ? riga.packs.length : riga.qty;
    await this._scriviWip(odpNum, { ...riga, qty: colliMossi }, 'in', dove);
    return { ...res, ok: true, location_code: dove };
  },

  /** Le misure dei colli che un ordine ha ancora nel vano WIP. Vedi
      `colliFuori` in `modules/wip.ts`: il vano è uno e i conti sono le
      righe, quindi i colli di un ordine si ritrovano per misura. */
  colliFuoriWip(odpNum: string, itemKey: string): number[] {
    return colliFuoriWip(this._cache.wip as any[], odpNum, itemKey);
  },

  /** La merce torna a magazzino: esce dal vano WIP e il conto lo registra.
      Chi chiama la riposiziona dove va — anche qui, una cosa per volta.

      SI ESCE COME SI ESCE DA OGNI ALTRO VANO: dicendo QUALI colli. Fino alla
      2.0 questa era l'unica funzione che toglieva merce passando un numero
      di colli senza le scelte, e su una riga che l'elenco lo dichiara il
      servizio calava `qty` lasciando `packs` e `qty_uom` dov'erano: tre colli
      che pesano quanto sette, e il consumo di produzione in UM che non
      arrivava mai a registro. Se chi chiama non sceglie, le scelte si
      ritrovano per misura da ciò che quell'ordine ha ancora fuori. */
  async esceDaWip(odpNum: string, riga: {
    item_key: string; article_code: string; article_description?: string;
    lot_code: string; qty: number; qty_uom?: number | null; uom?: string | null;
    packs?: number[] | null;
  }, scelte: Scelta[] | null = null, verso: 'out' | 'consumo' = 'out',
     umResa: number | null = null) {
    const dove = this.getAreaWip();
    if (!dove) throw new Error('Area WIP non configurata');
    if (this.ordineWipArchiviato(odpNum)) {
      throw new Error(`L'ordine ${odpNum} è chiuso e archiviato: dal suo conto non esce più niente`);
    }

    const nelVano = (this._invByLoc.get(dove) || []).find(i => i.item_key === riga.item_key);
    const elenco = this.colliDiRiga(nelVano);
    let uscite = scelte;
    let misure = Array.isArray(riga.packs) ? riga.packs : null;

    if (elenco && !uscite) {
      const fuori = this.colliFuoriWip(odpNum, riga.item_key);
      /* Un reso parziale su misure diverse è una scelta, non un numero: chi
         ha la merce in mano sa quale sacco sta riportando, e indovinare al
         posto suo è come rifiutarlo — solo peggio, perché non si vede. */
      if (fuori.length && riga.qty < fuori.length) {
        throw new Error(`${riga.item_key}: quest'ordine ha ${fuori.length} colli in lavorazione di misure diverse — vanno scelti quali tornano`);
      }
      misure = fuori.length ? fuori : null;
      uscite = misure ? this.scelteDaColli(nelVano, misure) : null;
      if (misure && !uscite) {
        throw new Error(`${riga.item_key}: i colli di ${odpNum} non si ritrovano più in ${dove} — un altro terminale ha mosso la riga`);
      }

      /* 2.1 — L'ORDINE SENZA MISURE A CONTO NON PUÒ USCIRE A NUMERO.

         `colliFuori` è vuoto quando l'ordine ha portato la merce nel vano
         PRIMA che il conto registrasse le misure dei colli — cioè su tutte
         le righe scritte fino alla 2.0. Fin qui si ripiegava su un numero, e
         dalla 2.0 `removeItem` lo rifiuta: la riga dichiara i colli, e
         toglierne tre senza dire QUALI scrive un saldo sopra un elenco
         rimasto indietro.

         In corsia il risultato era un consumo che non si riusciva a
         dichiarare, con un messaggio che parlava di colli senza nominare
         l'ordine. Adesso lo dice, e dice anche perché.

         Lo SVUOTAMENTO TOTALE resta libero — la riga sparisce intera e non
         resta niente a cui l'elenco possa sopravvivere — ed è il caso in cui
         l'ordine si porta via tutto quello che nel vano c'è. */
      if (!uscite && riga.qty < elenco.length) {
        throw new Error(
          `${riga.item_key}: nel vano ${dove} ci sono ${elenco.length} colli dichiarati e `
          + `${odpNum} ne muove ${riga.qty}: vanno scelti QUALI. `
          + `Quest'ordine non ha le misure a conto — è entrato in lavorazione prima che venissero registrate.`);
      }
    }

    /* Le UM che escono si dichiarano sempre: derivarle dai colli pretende un
       `pieces_per_pack` in anagrafica che oggi è vuoto su tutte le materie
       prime, e senza quello `_uomInUscita` torna `null` e la riga non cala. */
    const um = typeof riga.qty_uom === 'number' && riga.qty_uom > 0
      ? riga.qty_uom
      : (misure ? totaleUomColli(misure, this.getUomConfig(riga.article_code, riga.lot_code)?.uom ?? null) : null);

    const tolti = await this.removeItem(dove, riga.item_key, uscite ? null : riga.qty, um, uscite);
    if (!tolti) throw new Error(`${riga.item_key} non è più in ${dove}`);

    const uscitoUom = typeof tolti._qty_uom_delta === 'number' ? Math.abs(tolti._qty_uom_delta) : (um ?? null);
    const usciti = uscite ? Math.abs(tolti._qty_delta ?? riga.qty) : riga.qty;

    /* 2.1 — LA CONFEZIONE APERTA TORNA A MAGAZZINO CON DENTRO QUEL CHE
       RESTA, E IL VUOTO È CONSUMO.

       Due sacchi da 20 scendono in lavorazione e ne risale UNO, aperto, con
       dentro 5: quel sacco esce dal vano intero — non ci resta mezzo — e
       quindici chili non sono tornati perché sono finiti nel prodotto.
       Scriverli come «reso» direbbe che a magazzino sono rientrati venti
       chili che sullo scaffale nessuno trova; lasciarli nel conto come
       residuo terrebbe aperta una riga per merce che non c'è più, e alla
       chiusura l'ordine chiederebbe al vano DUE colli quando ne ha uno.

       Un gesto solo, due fatti: il reso di quel che è tornato davvero, e il
       consumo della differenza. Stanno nella stessa chiamata perché il conto
       non deve mai poter essere letto a metà. */
    if (verso === 'out' && typeof umResa === 'number' && uscitoUom !== null
        && umResa > 0 && umResa < uscitoUom) {
      await this._scriviWip(odpNum, {
        ...riga, qty: usciti, qty_uom: umResa, packs: tolti._packs_out ?? misure ?? null,
      }, 'out', dove);
      await this._scriviWip(odpNum, {
        ...riga, qty: 0, packs: null,
        qty_uom: arrotondaUom(uscitoUom - umResa, decimaliUom(riga.uom ?? null)),
      }, 'consumo', dove);
      return tolti;
    }

    await this._scriviWip(odpNum, {
      ...riga,
      qty: usciti,
      qty_uom: uscitoUom,
      packs: tolti._packs_out ?? misure ?? null,
    }, verso, dove);
    return tolti;
  },

  /** LA CHIUSURA DELL'ORDINE, SCRITTA. Da qui in poi quell'ordine è storia:
      `entraInWip` e `esceDaWip` lo rifiutano, `ordiniWipAperti` non lo
      elenca, e il rendiconto resta leggibile e stampabile per sempre.

      Non cancella e non sposta niente — chiudere non ha mai cancellato
      niente, ed è la promessa della 1.14. Aggiunge un fatto. */
  async archiviaOrdineWip(odpNum: string) {
    const odp = String(odpNum ?? '').trim();
    if (!odp) throw new Error('Ordine non indicato');
    if (this.ordineWipArchiviato(odp)) throw new Error(`L'ordine ${odp} è già archiviato`);
    return await this._scriviWip(odp, { item_key: '', article_code: '', lot_code: '', qty: 0 },
      'chiuso', this.getAreaWip());
  },

  async _scriviWip(odpNum: string, riga: any, verso: 'in' | 'out' | 'consumo' | 'chiuso', dove: string) {
    const rec = {
      wip_id: `WIP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      /* IL NUMERO D'ORDINE SI SCRIVE IN MAIUSCOLO. La maschera del conto lo
         legge in maiuscolo, e finché qui finiva quello che era stato
         digitato, un ordine preso come «prova6» restava elencato fra i conti
         aperti e non si apriva. Vedi `chiave` in `modules/wip.ts`, che regge
         le righe scritte prima di questa correzione. */
      odp_num: String(odpNum ?? '').trim().toUpperCase(),
      item_key: riga.item_key,
      article_code: riga.article_code,
      lot_code: riga.lot_code,
      status: verso === 'in' ? 'open' : verso === 'consumo' ? 'consumed'
        : verso === 'chiuso' ? 'archived' : 'returned',
      verso,
      qty: Number(riga.qty) || 0,
      qty_uom: typeof riga.qty_uom === 'number' ? riga.qty_uom : null,
      uom: riga.uom ?? null,
      /* Le misure dei colli mossi: senza, «rendi tre colli» su un vano che
         ne contiene dodici di sei ordini diversi non ha una risposta. */
      packs: Array.isArray(riga.packs) && riga.packs.length ? riga.packs : null,
      location_code: dove,
      user: this.getCurrentIdentity().initials,
      ts: Date.now(),
    };
    await Persistence.add('wip', rec);
    this._applyToCache('wip', 'put', rec);
    await this._touchMeta();
    return rec;
  },

  /* ═══════════════════════════════════════════════════════════════════
     1.13 — IL MOTORE DI STOCCAGGIO, ATTACCATO AI DATI
     © Andrea Sacchetti — Dietopack S.r.l.

     La regola sta in `modules/stoccaggio.ts` ed è pura. Qui c'è solo il
     lavoro di raccogliere quello che le serve: le ubicazioni attive, gli
     attributi della zona che le contiene, cosa c'è già dentro, e le regole
     scritte in `storage_rules`.

     GLI ATTRIBUTI DELLA ZONA SI LEGGONO UNA VOLTA PER ZONA, non una per
     ubicazione: uno scaffale da trecento vani ha trecento volte gli stessi
     quattro valori, e rileggerli è il modo di rendere lento un motore che
     deve rispondere mentre qualcuno scansiona.
     ═══════════════════════════════════════════════════════════════════ */

  getStorageRules(): RegolaStoccaggio[] { return this._cache.storageRules; },

  async saveStorageRule(regola: Partial<RegolaStoccaggio>) {
    const r = { ...regola } as RegolaStoccaggio;
    if (!r.rule_id) r.rule_id = `SR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const errori = validaRegolaStoccaggio(r);
    if (errori.length) throw new Error(errori.join(' · '));
    r.attiva = r.attiva !== false;
    r.priority = Number(r.priority) || 0;
    await Persistence.put('storage_rules', r);
    this._applyToCache('storage_rules', 'put', r);
    await this._touchMeta();
    return r;
  },

  async deleteStorageRule(ruleId: string) {
    await Persistence.delete('storage_rules', ruleId);
    this._applyToCache('storage_rules', 'delete', { rule_id: ruleId });
    await this._touchMeta();
    return true;
  },

  /** Dove si può mettere questa merce, e dove conviene. `null` a motore
      spento: chi chiama non deve ricordarsi di controllare l'interruttore,
      ma nemmeno ricevere una proposta che nessuno ha chiesto. */
  proponiStoccaggio(articleCode: string, lotCode: string, colli: number = 1) {
    const art = this._artByCode.get(String(articleCode ?? '').toUpperCase().trim());
    if (!art) return null;

    const geo = this.buildLocationGeometry();
    const attributiZona = new Map<string, any>();
    const posti: PostoCandidato[] = [];
    const chiaveItem = `${String(articleCode).toUpperCase().trim()}#${String(lotCode ?? '').trim()}`;

    for (const site of this.getSites()) {
      for (const zona of (site.zones || []).filter((z: Zona) => z.active)) {
        const kz = `${site.id}|${zona.id}`;
        if (!attributiZona.has(kz)) {
          attributiZona.set(kz, {
            zone_name: zona.name,
            temp_class: (zona as any).temp_class || null,
            allergen_zone: (zona as any).allergen_zone === true,
            allergens: Array.isArray((zona as any).allergens) ? (zona as any).allergens : null,
          });
        }
        const attr = attributiZona.get(kz);
        const ubicazioni = this.generateLocations(site.id, zona.id);
        ubicazioni.forEach((loc: { code: string }, indice: number) => {
          const dentro = this._invByLoc.get(loc.code) || [];
          const stato = this.getLocationStatus(loc.code);
          posti.push({
            location_code: loc.code,
            site_id: site.id,
            zone_id: zona.id,
            zone_name: attr.zone_name,
            status: stato,
            allergen_zone: attr.allergen_zone,
            allergens: attr.allergens,
            temp_class: attr.temp_class,
            /* Come in `conformita`: «Riservata» è una decisione presa su un
               vano preciso, e deroga sugli allergeni. */
            riservata: stato === 'reserved',
            capienza: (zona as any).capienza ?? null,
            occupati: dentro.reduce((t: number, r: Giacenza) => t + (r.qty || 0), 0),
            stesso_articolo: dentro.some((r: Giacenza) => r.article_code === art.code),
            stesso_lotto: dentro.some((r: Giacenza) => r.item_key === chiaveItem),
            /* La distanza è la posizione nella sequenza della zona, che è
               già l'ordine in cui la corsia si percorre: non è un metro, è
               un passo, e serve solo a ordinare fra pari. */
            distanza: indice,
          });
        });
      }
    }
    void geo;

    return proponiStoccaggio({
      article_code: art.code,
      description: art.description,
      allergens: Array.isArray((art as any).allergens) ? (art as any).allergens : [],
      temp_class: (art as any).temp_class || null,
      lot_code: lotCode,
      colli: Number(colli) || 0,
    }, posti, this._cache.storageRules);
  },

  /* ═══════════════════════════════════════════════════════════════════
     1.12 — LE UNITÀ DI CARICO
     © Andrea Sacchetti — Dietopack S.r.l.

     Un'UDC è un contenitore che sta in un'ubicazione e porta la merce con
     sé. La colonna `inventory.udc_id` esiste dalla 1.4 ed è sempre stata
     vuota; la collezione `udc` pure. Qui si riempiono.

     NASCE SU COMANDO, MUORE DA SOLA. Crearne una è un gesto di chi ha il
     pallet davanti; svuotarla no — quando l'ultima riga esce, il
     contenitore è vuoto e va chiuso senza che nessuno se ne debba
     ricordare. Un'UDC vuota che resta in elenco è la «lista che invecchia»:
     chi cerca un pallet libero ne troverebbe cento che non esistono più.

     IL RECORD RESTA, E IL CODICE NON SI RIUSA MAI. Un'UDC chiusa è storia —
     la tracciabilità GMP non ammette che sparisca — e due pallet con lo
     stesso codice sono due tracciabilità sovrapposte.

     La regola del codice sta in `modules/udc.ts`, e si collauda da fermo.
     ═══════════════════════════════════════════════════════════════════ */

  getUdcList(): Udc[] { return this._cache.udc; },
  getUdc(id: string): Udc | null {
    return this._cache.udc.find(u => u.udc_id === id) || null;
  },
  /** Le UDC vive, cioè quelle che si possono ancora riempire o spostare. */
  getUdcAperte(): Udc[] {
    return this._cache.udc.filter(u => u.status !== 'empty' && u.status !== 'shipped');
  },
  getUdcInLocation(locationCode: string): Udc[] {
    return this.getUdcAperte().filter(u => u.location_code === locationCode);
  },
  /** Le righe di giacenza che stanno sopra un'unità di carico. */
  righeDiUdc(id: string): Giacenza[] {
    if (!id) return [];
    return this._cache.inventory.filter(i => i.udc_id === id);
  },

  /** Il prefisso GS1, che è un parametro e non una costante del sorgente:
      vuoto, i codici sono interni; compilato, sono SSCC. */
  getPrefissoGS1(): string {
    return String((this._cache.meta as Record<string, any>).udcPrefissoGS1 ?? '').trim();
  },

  async setPrefissoGS1(prefisso: string) {
    const p = String(prefisso ?? '').trim();
    const errori = validaPrefissoGS1(p);
    if (errori.length) throw new Error(errori.join(' · '));
    const rec = { key: 'udcPrefissoGS1', value: p };
    await Persistence.put('meta', rec);
    this._applyToCache('meta', 'put', rec);
    (this._cache.meta as Record<string, any>).udcPrefissoGS1 = p;
    return p;
  },

  /* Il seriale successivo si ricava dal PIÙ ALTO già emesso, comprese le UDC
     morte: i buchi non si riempiono, e un numero saltato è un'unità nata e
     morta. Contare quelle vive darebbe un codice già usato. */
  _prossimoSerialeUdc(): number {
    let massimo = 0;
    for (const u of this._cache.udc) {
      const n = Number(u.serial ?? 0);
      if (Number.isFinite(n) && n > massimo) massimo = n;
    }
    return prossimoSerialeUdc(massimo);
  },

  async createUdc(dati: { type?: string; location_code?: string; site_id?: string } = {}) {
    const seriale = this._prossimoSerialeUdc();
    const codice = nuovoCodiceUdc(this.getPrefissoGS1(), seriale);
    if (!codice) {
      throw new Error('Non è più possibile emettere un codice: il seriale ha esaurito le cifre disponibili');
    }
    const io = this.getCurrentIdentity();
    const rec: Udc = {
      udc_id: codice,
      serial: seriale,
      type: dati.type || 'pallet',
      location_code: dati.location_code || '',
      site_id: dati.site_id || '',
      status: 'open',
      /* `sscc` porta il codice SOLO quando è davvero un SSCC: un codice
         interno in quel campo verrebbe letto come tale da chi lo esporta. */
      sscc: this.getPrefissoGS1() ? codice : null,
      created_at: Date.now(),
      created_by: io.initials || '',
      closed_at: null,
      emptied_at: null,
    };
    await Persistence.add('udc', rec);
    this._applyToCache('udc', 'put', rec);
    await this._touchMeta();
    return rec;
  },

  /** Mette una riga di giacenza sopra un'unità di carico, o la toglie
      passando `null`. La riga resta dov'è: cambia di chi è, non dove sta. */
  async assegnaAUdc(locationCode: string, itemKey: string, udcId: string | null) {
    const bucket = this._invByLoc.get(locationCode) || [];
    const item = bucket.find(i => i.item_key === itemKey);
    if (!item) throw new Error(`${itemKey} non è in ${locationCode}`);
    if (udcId) {
      const u = this.getUdc(udcId);
      if (!u) throw new Error(`${udcId} non esiste`);
      if (u.status === 'empty' || u.status === 'shipped') {
        throw new Error(`${udcId} è ${u.status}: non si riempie più`);
      }
      /* Un'UDC sta in UN'ubicazione: caricarci sopra merce che sta altrove
         vorrebbe dire un contenitore in due posti. */
      if (u.location_code && u.location_code !== locationCode) {
        throw new Error(`${udcId} sta in ${u.location_code}, non in ${locationCode}`);
      }
      if (!u.location_code) await this._patchUdc(udcId, { location_code: locationCode });
    }
    const precedente = item.udc_id || null;
    item.udc_id = udcId || undefined;
    item.last_updated_at = Date.now();
    await Persistence.put('inventory', item);
    this._applyToCache('inventory', 'put', item);
    /* Togliendo l'ultima riga, il contenitore di prima resta vuoto: si
       chiude adesso, non alla prossima occasione. */
    if (precedente && precedente !== udcId) await this.chiudiUdcSeVuota(precedente);
    await this._touchMeta();
    return item;
  },

  async _patchUdc(id: string, campi: Partial<Udc>) {
    const u = this.getUdc(id);
    if (!u) return null;
    const agg = { ...u, ...campi, updated_at: Date.now() } as Udc;
    await Persistence.put('udc', agg);
    this._applyToCache('udc', 'put', agg);
    return agg;
  },

  /** Se non ha più niente sopra, l'unità di carico si chiude. Il record
      resta, con l'istante in cui è rimasta vuota. */
  async chiudiUdcSeVuota(id: string) {
    const u = this.getUdc(id);
    if (!u || u.status === 'empty' || u.status === 'shipped') return null;
    if (!udcVuota(this.righeDiUdc(id))) return null;
    return await this._patchUdc(id, { status: 'empty', emptied_at: Date.now() });
  },

  /** Lo spostamento: l'unità e tutte le sue righe cambiano ubicazione
      insieme, o non cambia niente. Sul servizio è una transazione sola —
      `/api/op/moveUdc` — e il perché sta scritto lì. */
  async moveUdc(id: string, destinazione: string, movimento: unknown = null) {
    const dest = String(destinazione ?? '').trim().toUpperCase();
    const u = this.getUdc(id);
    if (!u) throw new Error(`${id} non esiste`);
    if (u.status === 'empty' || u.status === 'shipped') {
      throw new Error(`${id} è ${u.status}: non si sposta più`);
    }
    if (!dest) throw new Error('Indica l’ubicazione di destinazione');
    if (u.location_code === dest) throw new Error(`${id} è già in ${dest}`);
    if (!this.locationExists(dest)) throw new Error(`Ubicazione ${dest} inesistente`);

    const righe = this.righeDiUdc(id);
    /* La stessa guardia del servizio, davanti invece che dietro: qui c'è la
       cache e si può dire di no PRIMA di far partire una transazione. Il
       perché — due righe con la stessa chiave nello stesso vano, e un saldo
       che dipende dall'ordine di caricamento — sta in `/api/op/moveUdc`, e
       lì resta anche se questa sparisse. */
    const gia = this._invByLoc.get(dest) || [];
    const scontro = [...new Set(
      gia.filter(r => r.udc_id !== id && righe.some(n => n.item_key === r.item_key))
         .map(r => r.item_key))];
    if (scontro.length) {
      throw new Error(`In ${dest} c'è già ${scontro.join(', ')} fuori da questa unità: sposta prima quella riga, o caricala sull'unità`);
    }

    if (Persistence.supportsRemoteOps) {
      const esito = await Persistence.op!<{ ok: boolean; from: string; to: string; righe: number }>(
        'moveUdc', { udc_id: id, to: dest, movement: movimento });
      /* La cache si riallinea su ciò che il servizio ha fatto davvero: è la
         stessa regola di `removeItem`, e la ragione è la stessa — due
         terminali sulla stessa merce.

         2.0 — SI SCRIVE UNA RIGA NUOVA, NON SI MODIFICA QUELLA IN CACHE.
         `indicizzaGiacenza` toglie la riga dal bucket del vano vecchio
         confrontando `prev.location_code` con quello nuovo, e `prev` lo
         ritrova per `_id` dentro la cache: cambiando l'ubicazione
         sull'oggetto che LA CACHE GIÀ TIENE, `prev` e `next` diventano lo
         stesso oggetto, il confronto non trova differenze e la riga resta
         anche di là. Al banco l'unità si spostava e la merce risultava in
         due vani insieme — il servizio aveva ragione, l'indice del client
         no, e il saldo per ubicazione diceva il doppio. */
      const ora = Date.now();
      for (const r of righe) {
        this._applyToCache('inventory', 'put', { ...r, location_code: dest, last_updated_at: ora });
      }
      this._applyToCache('udc', 'put', { ...u, location_code: dest, updated_at: ora });
      return esito;
    }

    /* Da file, senza servizio: non c'è una transazione da chiedere a
       nessuno, e l'ordine è quello che lascia il danno minore se si
       interrompe — prima le righe, poi il contenitore. Un contenitore che
       dice ancora il vano vecchio si corregge riaprendo lo spostamento;
       righe sparpagliate no. */
    const da = u.location_code || '';
    for (const r of righe) {
      /* Riga nuova e non modificata, per la ragione scritta qui sopra. */
      const spostata = { ...r, location_code: dest, last_updated_at: Date.now() };
      await Persistence.put('inventory', spostata);
      this._applyToCache('inventory', 'put', spostata);
    }
    await this._patchUdc(id, { location_code: dest });
    await this._touchMeta();
    return { ok: true, from: da, to: dest, righe: righe.length };
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
      lines: (entry.lines || []).map(rigaDocumento)
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
      rec.lines = patch.lines.map(rigaDocumento);
    }
    rec.updated_at = Date.now();
    this._applyToCache('pending_outbound', 'put', rec);
    await Persistence.put('pending_outbound', rec);
    await this._touchMeta();
    return rec;
  },

  /* Restituisce DDT pendenti per kind (RES | SHIP), ordinati dal più recente */
  getPendingOutbound(kind?: string | null) {
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

  async commitPickStop({ session, stop, qty, movement, scelte = null }: { session: SessionePrelievo; stop: Record<string, any>; qty: number; movement: Partial<Movimento> & { type: MovTipo }; scelte?: Scelta[] | null }) {
    if (!session?.session_id) throw new Error('Sessione di prelievo priva di identificativo');
    if (!stop) throw new Error('Tappa non identificata');

    let removed = null;
    try {
      /* `meta` e' inclusa perche' _touchMeta() vi scrive: escluderla
         farebbe fallire la transazione con TransactionInactiveError. */
      await Persistence.transaction(['inventory', 'mov_log', 'pick_session', 'meta'], async () => {
        /* 1.8 — la tappa prende i colli che l'operatore ha scelto, e senza
           scelte resta il prelievo a numero di colli della 1.7. */
        removed = await this.removeItem(stop.location_code, stop.item_key, qty, null, scelte);
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
        stop.qty_picked = removed._packs_out ? removed._packs_out.length : qty;
        if (removed._packs_out) stop.packs_picked = removed._packs_out;
        /* 2.5 — LE UM USCITE SI SCRIVONO SULLA TAPPA, non solo sul movimento.
           Il report di prelievo legge le tappe: senza questo numero poteva
           dire quanti colli sono usciti e non quanto pesavano, e su una riga
           con un collo aperto i due dati non si ricavano l'uno dall'altro. */
        stop.uom_picked = typeof removed._qty_uom_delta === 'number'
          ? Math.abs(removed._qty_uom_delta) : null;
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
         magazzino nello stato del file, non in una miscela dei due.
         UNA SOLA ECCEZIONE, ed e' il registro: qui sotto. */
      /* IL REGISTRO NON SI SVUOTA SE IL PACCHETTO NON LO PORTA.

         Le copie automatiche locali (`writeOPFSBackup`) escono con
         `includeMovLog: false` e `componi` fa `delete data.mov_log`: il file
         non porta il registro, e si dichiara con `_partial`. Rimettendone
         dentro una, il `clearMany` qui sotto svuotava `mov_log` e il ciclo lo
         saltava perche' non c'era niente da scrivere — il registro spariva, e
         nessuno lo diceva. E' successo davvero: 253 movimenti al 19/08, uno
         al 20/08, zero il 22 e il 23.

         La distinzione e' fra CHIAVE ASSENTE e ELENCO VUOTO: un pacchetto che
         non nomina `mov_log` non porta il registro, e il registro resta dov'e';
         un pacchetto con `mov_log: []` dice che di movimenti non ce n'e'
         nessuno, e allora svuotare e' giusto.

         Per tutte le altre collezioni lo svuotamento in blocco resta com'era, e
         il perche' e' scritto qui sopra: sono STATO, e devono combaciare con le
         giacenze che stanno rientrando. Il registro non e' stato — e' storia
         che si accumula, e non ha nessun vincolo di coerenza da rispettare. */
      const portaRegistro = Array.isArray(data['mov_log']);
      const daSvuotare = portaRegistro
        ? COLLEZIONI_EXPORT
        : COLLEZIONI_EXPORT.filter(c => c !== 'mov_log');

      await Persistence.transaction([...COLLEZIONI_EXPORT, 'meta'], async () => {
        await Persistence.clearMany(daSvuotare);
        for (const c of COLLEZIONI_EXPORT) {
          const righe = data[c];
          if (!Array.isArray(righe) || !righe.length) continue;
          await Persistence.bulkAdd(c, righeDaScrivere(c, righe));
        }
        /* 2.2 — LE IMPOSTAZIONI TORNANO CON I DATI. Un ripristino che
           rimette le giacenze e lascia il magazzino senza area WIP, senza
           prefisso GS1 e col cruscotto di fabbrica ha rimesso i numeri e
           non il posto di lavoro. `doc_config` resta letto a parte: i
           pacchetti fino alla 2.1 tenevano lì i dati del mittente, e un
           backup vecchio deve continuare a rientrare. */
        const imp = data.impostazioni;
        if (imp && typeof imp === 'object') {
          for (const [chiave, valore] of Object.entries(imp as Record<string, unknown>)) {
            if (valore === undefined) continue;
            await Persistence.put('meta', { key: chiave, value: valore });
          }
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
