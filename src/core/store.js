import { MOV } from './costanti';
import { Persistence } from './persistence/index';
import { App } from '../ui/app.js';

// ═══════════════════════════════════════════════════════════════════
// STORE 
// ═══════════════════════════════════════════════════════════════════

const Store = {
  /* ═══════════════════════════════════════════════════════════════════
     v2.0.1 [A3] — Guardia sulle quantità
     © Andrea Sacchetti — Dietopack S.r.l.
     Valida che una quantità sia un intero strettamente positivo.
     Lancia un Error descrittivo invece di correggere silenziosamente:
     un dato di giacenza sbagliato ma plausibile è peggio di un errore visibile.
     ═══════════════════════════════════════════════════════════════════ */
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
    meta: { lastModified: null, unsavedChanges: false }
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.8.0 [H2] — LA FINESTRA DEL REGISTRO
     © Andrea Sacchetti — Dietopack S.r.l.

     Il registro movimenti e' l'unica collezione che cresce senza limite: a
     500 movimenti al giorno sono 1.100.000 record in sei anni. Fino alla
     v2.7.0 venivano caricati TUTTI in un array JavaScript a ogni avvio e
     tenuti li' per l'intera sessione. Misurato: 2,7 secondi ogni 60.000
     record solo per leggerli, piu' alcune centinaia di MB di heap a regime.
     Dieci secondi di attesa e mezzo gigabyte di memoria per dati che
     servono quando si apre il Registro e in nessun altro momento.

     Da qui in avanti in memoria resta una FINESTRA. Cruscotto, KPI, ultimi
     movimenti e ordini di produzione leggono quella — ed e' esattamente
     cio' che mostravano prima, perche' nessuno di quei riquadri guardava
     piu' indietro di qualche settimana. Registro completo, export ed
     eliminazioni interrogano il database sull'indice ts.

     120 giorni coprono con margine il trimestre operativo e valgono ~60.000
     record al ritmo dichiarato. Il valore e' regolabile da Configurazione ->
     Dati: chi ha bisogno di piu' storico sotto mano lo allarga e paga in
     avvio; chi ha una macchina lenta lo stringe.

     NESSUN DATO VIENE PERSO O NASCOSTO: cio' che sta fuori dalla finestra e'
     su disco, interrogabile e esportabile. Cambia solo cosa si tiene in
     braccio mentre si lavora.
     ═══════════════════════════════════════════════════════════════════ */
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

  _locIndex: null,    // Set<location_code> → fast lookup
  _invByLoc: null,    // Map<location_code → item[]>
  _invByKey: null,    // Map<item_key → item[]>
  _artByCode: null,   // Map<code → article>

  // ── Init: carica tutte le tabelle in cache ──
  // v2.0.1 [B8]: RIMOSSA la chiamata a _rotateLogs(). Nessun record viene più
  // cancellato all'avvio. La purge è manuale (Config → Dati e Backup).
  async init() {
    await Persistence.open();
    await this._loadCache();
    this._rebuildIndexes();
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.6.0 [F1-2] — RIALLINEAMENTO DELLA CACHE AL SUPPORTO
     © Andrea Sacchetti — Dietopack S.r.l.

     Rilettura completa piu' ricostruzione degli indici. Due passi che
     vanno sempre insieme: ricaricare senza ricostruire lascia _invByLoc e
     _invByKey che puntano a oggetti non piu' in cache, ed e' un guasto
     silenzioso — le letture continuano a funzionare, ma su dati vecchi.

     Esiste perche' fuori da Store si chiamavano _loadCache() e
     _rebuildIndexes() in coppia, a mano: due membri privati esposti alla
     UI, con l'obbligo implicito di ricordarsi del secondo. Qui la coppia
     e' una cosa sola e ha un nome.
     ═══════════════════════════════════════════════════════════════════ */
  async reloadCache() {
    await this._loadCache();
    this._rebuildIndexes();
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.6.0 [F1-2] — ACCESSOR PUBBLICI SULLA CACHE
     © Andrea Sacchetti — Dietopack S.r.l.

     Fino alla v2.5.1 dodici punti fuori da Store leggevano `_cache`
     direttamente. Funzionava, ma con due conseguenze che questa fase deve
     chiudere:

     1. La UI riceveva il RIFERIMENTO agli array interni. Un `.sort()` o
        uno `.splice()` di troppo in un punto qualsiasi del rendering
        avrebbe riordinato o svuotato la giacenza in memoria senza che
        nulla lo segnalasse. Non e' mai successo: era comunque possibile.
     2. Quando la cache sara' alimentata dai delta realtime del server, la
        forma di `_cache` diventera' un dettaglio dell'adapter. Ogni punto
        che oggi ne conosce la struttura sarebbe un punto da riscrivere.

     Gli accessor restituiscono quindi COPIE, non riferimenti. La copia e'
     superficiale, come nel resto del file: protegge la collezione (chi
     legge non puo' aggiungere, togliere o riordinare), non i singoli
     record, che restano condivisi come lo sono sempre stati. Clonarli a
     fondo a ogni chiamata costerebbe caro dentro i cicli di rendering e
     romperebbe i confronti per identita' gia' presenti nel codice.
     ═══════════════════════════════════════════════════════════════════ */

  /* Metadati di salvataggio. Congelati: sono un referto, non uno stato
     su cui intervenire. Chi deve modificarli passa da _touchMeta(). */
  getMeta() {
    return Object.freeze({ ...this._cache.meta });
  },

  hasUnsavedChanges() {
    return !!this._cache.meta?.unsavedChanges;
  },

  /* Conteggio delle righe di giacenza. Esiste come metodo perche' il
     chiamante voleva un numero: dargli l'array intero per fargli leggere
     `.length` significa esporre la collezione per niente. */
  getInventoryCount() {
    return this._cache.inventory.length;
  },

  /* Copia della giacenza per gli export: chi la riceve la ordina, la
     raggruppa e la rimaneggia a piacere senza toccare la cache. */
  getInventorySnapshot() {
    return this._cache.inventory.slice();
  },

  /* Lotti distinti presenti a magazzino per un codice articolo.
     Serve a dire all'operatore "quel lotto non c'e', ma l'articolo si',
     con questi altri": informazione che costa nulla e cambia la mossa
     successiva. Il codice viene normalizzato qui, cosi' il chiamante non
     deve ricordarsi di farlo. */
  /* ═══════════════════════════════════════════════════════════════════
     v2.6.0 [F1-5] — IDENTITA': SOLO PREDISPOSIZIONE
     © Andrea Sacchetti — Dietopack S.r.l.

     Oggi l'operatore e' un'ETICHETTA: due o tre lettere digitate
     all'avvio e conservate in localStorage. Non e' un'identita' — non c'e'
     nulla da verificare, nessuno che possa dire se quelle iniziali
     corrispondano davvero a chi ha in mano il tablet. Va benissimo per un
     applicativo locale che supporta SAGE X3; non bastera' quando i dati
     saranno condivisi da dieci utenze su un server.

     Questo metodo esiste perche' l'attribuzione sui record passi DA UN
     SOLO PUNTO. Oggi restituisce esattamente cio' che il file scriveva
     prima, iniziali comprese: il valore memorizzato sui movimenti, sulle
     quarantene, sui DDT e sulle sessioni di prelievo NON cambia di un
     carattere. In Fase 3, quando l'utente sara' autenticato, `id` e
     `role` si popoleranno qui e nessun altro punto andra' toccato.

     NON c'e' login, NON ci sono ruoli, NON ci sono permessi: `role` vale
     'full' per tutti ed e' un segnaposto. La vista ridotta per gli
     operatori (D4) dovra' essere imposta dalle API rules di PocketBase,
     lato server: nascondere elementi nel client e' cosmesi, non controllo
     accessi. Nessun codice introdotto qui presuppone il contrario.

     NOTA DI STRATIFICAZIONE. Leggere App da Store rovescia le
     dipendenze: Store sta sotto, App sopra. E' deliberato e temporaneo —
     spostare ora la proprieta' dell'operatore significherebbe toccare la
     UI, che questa fase non deve toccare. Quando l'identita' arrivera'
     dall'autenticazione, la sorgente diventera' interna e la riga
     sparira'. E' il solo punto del file in cui Store guarda in alto.

     ───────────────────────────────────────────────────────────────────
     v2.7.0 [G6] — LA PREDISPOSIZIONE VIENE RISCOSSA
     L'identita' e' ora VERIFICATA: chi la porta ha superato un PIN. `id` e
     `role` non sono piu' segnaposto e arrivano dall'anagrafica operatori.

     E la promessa della v2.6.0 e' stata mantenuta alla lettera: l'intero
     file continua a scrivere l'attribuzione sui record attraverso QUESTO
     metodo e nient'altro, quindi introdurre l'autenticazione ha significato
     cambiare venti righe qui e zero altrove. Le `initials` restano
     esattamente quelle di prima: lo storico dei movimenti resta leggibile.

     `role` vale 'operator' o 'leader'. Resta vero cio' che diceva la nota
     originale: nascondere elementi nel client e' cosmesi, non controllo
     accessi. Il ruolo qui serve a decidere chi puo' autorizzare il rinnovo
     di un PIN su un applicativo locale a singolo utente per volta — non e',
     e non va scambiato per, una barriera di sicurezza server-side.
     ═══════════════════════════════════════════════════════════════════ */
  getCurrentIdentity() {
    const rec = (typeof App !== 'undefined' ? App.currentOperatorRecord : null) || null;
    return {
      id: rec?.op_id || null,
      initials: rec?.initials || (typeof App !== 'undefined' ? App.currentOperator : null) || '',
      role: rec?.role || 'full'
    };
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.7.0 [G6] — ANAGRAFICA OPERATORI
     © Andrea Sacchetti — Dietopack S.r.l.

     Nessun metodo di cancellazione, e non e' una dimenticanza: un operatore
     che ha firmato un movimento non puo' sparire dall'anagrafica senza
     rendere orfana la sua firma. Si disattiva — esce dalle liste di scelta,
     resta nei record. E' lo stesso principio dei documenti di non
     conformita' (v2.0.1 [B8]).
     ═══════════════════════════════════════════════════════════════════ */
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

  /* Almeno un Team Leader attivo deve esistere sempre: e' la condizione che
     garantisce che i PIN si possano rinnovare. Chi chiama la usa per decidere
     se imporre il wizard e per impedire l'ultima disattivazione. */
  getActiveLeaders() {
    return this._cache.operators.filter(o => o.role === 'leader' && o.active !== false);
  },

  /* ═══════════════════════════════════════════════════════════════════
     TEAM LEADER CHE POSSONO DAVVERO ENTRARE
     © Andrea Sacchetti — Dietopack S.r.l.

     getActiveLeaders() conta i leader che ESISTONO, e va benissimo per
     impedire che l'ultimo venga declassato o disattivato.

     Non va bene per decidere se aprire il portone d'accesso. Un Team
     Leader senza PIN esiste ma non puo' autenticarsi: contarlo li'
     significa saltare il wizard del primo accesso — che parte solo
     quando NON c'e' nessun leader — e presentare una maschera che chiede
     un PIN che non e' mai stato impostato. Fuori tutti, senza rimedio
     dall'interfaccia.

     Non e' teoria: e' successo. Un'anagrafica creata via API senza PIN
     (un collaudo, un import di un backup che li aveva persi) mette il
     sistema esattamente in quello stato, e la garanzia dichiarata piu'
     sotto — "non c'e' combinazione di stati che chiuda fuori l'utente" —
     smetteva di valere.

     Da qui in avanti chi decide l'accesso e chi autorizza un'operazione
     sensibile chiede questa lista, non l'altra: se e' vuota riparte il
     wizard, e una via d'ingresso c'e' sempre.
     ═══════════════════════════════════════════════════════════════════ */
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
    /* v2.6.0 [F1-3] — L'idratazione arriva dall'adapter in un colpo solo.
       Le collezioni tornano GREZZE: la trasformazione in Map, Set e
       oggetto che segue e' la forma della cache, cioe' una scelta di
       questo modulo. Tenerla qui significa che un secondo adapter dovra'
       sapere restituire dodici array, non conoscere il read model. */
    /* v2.8.0 [H2] — Si carica una FINESTRA del registro, non il registro.
       Vedi MOVLOG_WINDOW_DAYS per il perche' e per il come. */
    const { sites, zones, articles, inventory, locStatus: locStat, disabled,
            movLog, movLogTotal, quarantine, pendingOut, meta: metaRows,
            pickSession: pickSessions, pickArchive, disposalArchive, operators } =
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
    /* v2.5.0 — Sessione di prelievo: al massimo una. Se per qualsiasi ragione
       ne risultassero più d'una (import di un backup manipolato, interruzione
       durante la clear), si tiene la più recente invece di scegliere a caso. */
    this._cache.pickSession = pickSessions.length
      ? pickSessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0]
      : null;
    this._cache.pickArchive = pickArchive;   // v2.5.1 — già ordinati dal più recente
    this._cache.disposalArchive = disposalArchive || [];   // v3.0.0 [M2] — verbali di smaltimento
    /* v2.7.0 [G6] — Ordine alfabetico stabile: l'anagrafica si legge e si
       sceglie, non si scorre in ordine di inserimento. */
    this._cache.operators = (operators || []).sort((a, b) =>
      (a.last_name || a.initials || '').localeCompare(b.last_name || b.initials || '', 'it'));
    const metaObj = {};
    for (const m of metaRows) metaObj[m.key] = m.value;
    this._cache.meta = {
      lastModified: metaObj.lastModified || null,
      unsavedChanges: metaObj.unsavedChanges || false,
      lastAutoBackup: metaObj.lastAutoBackup || null,
      /* v3.0.0 [M4] — Configurazione documentale: mittente, causali,
         motivazioni di smaltimento, numerazione. Si legge sempre da
         Store.getDocConfig(), che la fonde con i default: qui basta
         portarsela in cache cosi' com'e' stata scritta. */
      docConfig: metaObj.docConfig || null
    };
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.0.1 [B8] — RITENZIONE DEI RECORD (decisione B-2)
     © Andrea Sacchetti — Dietopack S.r.l.

     PRIMA (v2.0.0): all'avvio venivano cancellati SILENZIOSAMENTE i movimenti
     più vecchi di 365 giorni e le quarantene rilasciate da oltre 365 giorni.
     Per un sistema che deve reggere la rintracciabilità in sede di audit questo
     è inaccettabile: distruggeva i record proprio nella finestra utile a un
     eventuale richiamo, e lo faceva senza traccia.

     ORA: nessuna cancellazione automatica, mai. I record di non conformità
     (store `quarantine`) non sono MAI eliminabili automaticamente.
     La purge è solo manuale (App.purgeOldLogsManual), con export preventivo
     obbligatorio, doppia conferma e registrazione dell'evento a registro.
     ═══════════════════════════════════════════════════════════════════ */

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

  /* Purge MANUALE del registro movimenti antecedente a cutoffTs.
     Non tocca in alcun caso lo store `quarantine`: i record NC restano permanenti.
     Ritorna il numero di record rimossi. Chiamabile solo da App.purgeOldLogsManual,
     che impone export preventivo e doppia conferma. */
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
    this._invByLoc = new Map();
    this._invByKey = new Map();
    this._artByCode = new Map();
    // Ubicazioni valide: generate da tutte le zone attive
    for (const site of this._cache.sites) {
      if (!site.active) continue;
      for (const zone of (site.zones || [])) {
        if (!zone.active) continue;
        for (const loc of this._genLocations(site.id, zone)) this._locIndex.add(loc.code);
      }
    }
    for (const it of this._cache.inventory) {
      if (!this._invByLoc.has(it.location_code)) this._invByLoc.set(it.location_code, []);
      this._invByLoc.get(it.location_code).push(it);
      if (!this._invByKey.has(it.item_key)) this._invByKey.set(it.item_key, []);
      this._invByKey.get(it.item_key).push(it);
    }
    for (const a of this._cache.articles) {
      if (a.active !== false) this._artByCode.set(a.code, a);
    }
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
     ═══════════════════════════════════════════════════════════════════ */

  /* Forma della cache per ogni collection. Il contratto parla di
     collection (i nomi dell'adapter); la cache ha nomi e strutture
     proprie, e la corrispondenza vive qui e in nessun altro posto. */
  _CACHE_SHAPE: {
    sites:            { field: 'sites',       kind: 'list',   key: '_id',           insert: 'push' },
    zones:            { field: 'zones',       kind: 'list',   key: '_id',           insert: 'push' },
    articles:         { field: 'articles',    kind: 'list',   key: '_id',           insert: 'push' },
    inventory:        { field: 'inventory',   kind: 'list',   key: '_id',           insert: 'push' },
    mov_log:          { field: 'movLog',      kind: 'list',   key: '_id',           insert: 'unshift' },
    quarantine:       { field: 'quarantine',  kind: 'list',   key: '_id',           insert: 'unshift' },
    pending_outbound: { field: 'pendingOut',  kind: 'list',   key: 'doc_id',        insert: 'unshift' },
    pick_archive:     { field: 'pickArchive', kind: 'list',   key: 'doc_id',        insert: 'unshift' },
    disposal_archive: { field: 'disposalArchive', kind: 'list', key: 'doc_id',      insert: 'unshift' },
    operators:        { field: 'operators',   kind: 'list',   key: 'op_id',         insert: 'push' },
    loc_status:       { field: 'locStatus',   kind: 'map',    key: 'location_code' },
    disabled:         { field: 'disabled',    kind: 'set',    key: 'location_code' },
    pick_session:     { field: 'pickSession', kind: 'single' },
    meta:             { field: 'meta',        kind: 'kv',     key: 'key' }
  },

  /* Inserisce o sostituisce un record dentro un bucket di indice.
     La sostituzione per _id serve quando il record e' stato ricreato:
     senza di essa il bucket conserverebbe il vecchio oggetto e le letture
     continuerebbero a vedere dati superati. */
  _bucketPut(map, mapKey, rec) {
    if (mapKey === undefined || mapKey === null) return;
    let arr = map.get(mapKey);
    if (!arr) { arr = []; map.set(mapKey, arr); }
    const i = arr.findIndex(x => x._id === rec._id);
    if (i >= 0) arr[i] = rec; else arr.push(rec);
  },

  /* Toglie un record da un bucket e rimuove il bucket se resta vuoto:
     una Map che accumula chiavi con array vuoti fa sembrare occupate
     ubicazioni che non lo sono piu'. */
  _bucketDelete(map, mapKey, rec) {
    const arr = map.get(mapKey);
    if (!arr) return;
    const i = arr.findIndex(x => x._id === rec._id);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) map.delete(mapKey);
  },

  /* Indici della giacenza. `prev` e' il record che stava in cache prima:
     se ubicazione o item_key sono cambiati — succede quando si corregge
     articolo o lotto di una riga — il record va tolto dai vecchi bucket
     prima di entrare nei nuovi, altrimenti risulterebbe in due posti. */
  _indexInventory(prev, next) {
    if (prev && prev !== next) {
      if (prev.location_code !== next.location_code) this._bucketDelete(this._invByLoc, prev.location_code, prev);
      if (prev.item_key !== next.item_key)           this._bucketDelete(this._invByKey, prev.item_key, prev);
    }
    this._bucketPut(this._invByLoc, next.location_code, next);
    this._bucketPut(this._invByKey, next.item_key, next);
  },

  _applyToCache(collection, op, record = null) {
    const shape = this._CACHE_SHAPE[collection];
    if (!shape) throw new Error(`Collection senza mappatura in cache: ${collection}`);
    const C = this._cache;

    if (op === 'clear') {
      switch (shape.kind) {
        case 'list':   C[shape.field] = []; break;
        case 'map':    C[shape.field] = new Map(); break;
        case 'set':    C[shape.field] = new Set(); break;
        case 'single': C[shape.field] = null; break;
        case 'kv':     C[shape.field] = { lastModified: null, unsavedChanges: false, lastAutoBackup: null }; break;
      }
      if (collection === 'inventory') { this._invByLoc = new Map(); this._invByKey = new Map(); }
      if (collection === 'articles')  { this._artByCode = new Map(); }
      return;
    }

    if (op !== 'put' && op !== 'delete') throw new Error(`Operazione di cache non supportata: ${op}`);
    if (!record) throw new Error(`Operazione ${op} su ${collection} senza record`);

    switch (shape.kind) {

      case 'list': {
        const arr = C[shape.field];
        const id = record[shape.key];
        const i = arr.findIndex(x => x[shape.key] === id);
        const prev = i >= 0 ? arr[i] : null;

        if (op === 'delete') {
          if (i >= 0) arr.splice(i, 1);
          if (collection === 'inventory') {
            this._bucketDelete(this._invByLoc, record.location_code, record);
            this._bucketDelete(this._invByKey, record.item_key, record);
          }
          if (collection === 'articles') this._artByCode.delete(record.code);
          return;
        }

        if (i >= 0) arr[i] = record;
        else if (shape.insert === 'unshift') arr.unshift(record);
        else arr.push(record);

        if (collection === 'inventory') this._indexInventory(prev, record);
        /* L'articolo disattivato esce dall'indice ma resta in cache: la
           riga serve ancora a leggere le descrizioni dello storico. */
        if (collection === 'articles') {
          if (record.active === false) this._artByCode.delete(record.code);
          else this._artByCode.set(record.code, record);
        }
        return;
      }

      case 'map': {
        const k = record[shape.key];
        if (op === 'delete') C[shape.field].delete(k);
        else C[shape.field].set(k, record);
        return;
      }

      case 'set': {
        const k = record[shape.key];
        if (op === 'delete') C[shape.field].delete(k);
        else C[shape.field].add(k);
        return;
      }

      case 'single': {
        C[shape.field] = (op === 'delete') ? null : record;
        return;
      }

      case 'kv': {
        if (op === 'delete') delete C[shape.field][record.key];
        else C[shape.field][record.key] = record.value;
        return;
      }
    }
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

  /* FEFO (First Expired First Out)
     Ordina items per data scadenza ascendente (lotti più vicini a scadenza per primi).
     Item senza expiry_date vanno in coda, ordinati per placed_at (FIFO secondario). */
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

  /* v1.7.0 — addItem ora gestisce qty (Colli).
     Se item_key già presente nella stessa ubicazione → INCREMENTA qty (no più duplicate error).
     Se nuovo → crea record con qty specificata (default 1).
     Ritorna { ok, item, mode: 'created'|'incremented', qty_before, qty_after } */
  async addItem(locationCode, articleCode, articleDescription, lotCode, expiryDate = '', notes = '', qty = 1) {
    // v2.0.1 [A3] — Guardia sulla quantità.
    // Prima: Math.max(1, parseInt(qty) || 1) mascherava silenziosamente sia i
    // decimali (2.7 → 2) sia i valori nulli/negativi (0 o -3 → 1). Un errore di
    // input diventava un dato di giacenza plausibile ma sbagliato, senza traccia.
    // Ora: input non valido = errore esplicito, il chiamante deve gestirlo.
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

  /* v1.7.0 — removeItem con supporto prelievo parziale.
     Parametro qtyRemove (default null = rimozione totale, retrocompatibile).
     Se qtyRemove < qty corrente → decrementa e mantiene record.
     Se qtyRemove >= qty corrente OR null → rimuove record completamente.
     Ritorna { removed, mode: 'partial'|'full', qty_before, qty_after, qty_delta } o null se item non trovato. */
  async removeItem(locationCode, itemKey, qtyRemove = null) {
    // v2.0.1 [A3] — Guardia sulla quantità.
    // Prima: nessun controllo. removeItem(loc, key, -5) su 2 colli portava la
    // giacenza a 7 (verificato in test). null resta valido = rimozione totale.
    if (qtyRemove !== null) qtyRemove = Store._assertPositiveInt(qtyRemove, 'Quantità da prelevare');
    const bucket = this._invByLoc.get(locationCode) || [];
    const idx = bucket.findIndex(i => i.item_key === itemKey);
    if (idx === -1) return null;
    const item = bucket[idx];
    const qtyBefore = item.qty || 1;

    /* ═══════════════════════════════════════════════════════════════
       DATABASE CONDIVISO — L'ARBITRO STA SUL SERVER
       © Andrea Sacchetti — Dietopack S.r.l.

       Con IndexedDB questa funzione era sola al mondo: leggeva la
       giacenza dalla cache e la riscriveva, e nessun altro poteva
       essersi messo in mezzo perche' non esisteva nessun altro.

       Con un database condiviso non e' piu' vero. Fra la riga qui sopra
       che legge `qtyBefore` dalla copia in memoria e la scrittura, un
       altro terminale puo' aver preso gli stessi colli: la cache di
       questa scheda direbbe quaranta quando a magazzino ce ne sono
       venti, e il saldo finirebbe sotto zero senza che nessuno se ne
       accorga.

       L'operazione va quindi dove c'e' il lock — sul server — che
       rilegge il saldo VERO dentro la transazione e respinge chi arriva
       secondo con un messaggio che l'operatore capisce. La cache locale
       si allinea al risultato, non lo anticipa.
       ═══════════════════════════════════════════════════════════════ */
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
  /* Modifica i campi di un item esistente.
     - Se cambiano article_code o lot_code (item_key) → remove + re-add con nuova chiave.
     - Altrimenti → update diretto dei campi sul record esistente.
     Ritorna { ok, item, keyChanged, oldKey?, newKey? } o null se item non trovato. */
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
      /* v3.0.0 [M4] — Peso e pezzi PER COLLO, che è l'unità in cui questo
         magazzino conta e in cui il DDT deve dichiarare la merce.

         Perché non si riusa `weight`: quel campo esiste dalla v1.x, è
         alimentato dagli import Excel e nessuno sa più con certezza se
         contenga il peso del pezzo o quello del collo. Su un documento di
         trasporto un peso sbagliato è peggio di un peso assente, e un
         campo compilato non lo verifica più nessuno. Questi due nascono
         vuoti e dichiarati. */
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
    const _id = await Persistence.add('articles', rec);
    const stored = { ...rec, _id };
    this._applyToCache('articles', 'put', stored);
    await this._touchMeta();
    return true;
  },

  async updateArticle(code, updates) {
    const art = this._artByCode.get(code);
    if (!art) return false;
    const fields = ['description', 'category', 'supplier', 'unit', 'notes'];
    const numFields = ['weight', 'length', 'width', 'height', 'min_stock', 'max_stock',
                       'weight_net_kg', 'pieces_per_pack'];   // v3.0.0 [M4]
    for (const f of fields) if (updates[f] !== undefined) art[f] = updates[f];
    for (const f of numFields) if (updates[f] !== undefined) art[f] = parseFloat(updates[f]) || 0;
    this._applyToCache('articles', 'put', art);
    await Persistence.put('articles', art);
    await this._touchMeta();
    return true;
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
    /* v2.8.0 [H2] — Il totale d'archivio va tenuto allineato a mano: la cache
       ne vede solo la finestra e non puo' piu' dedurlo dalla propria lunghezza.
       Un movimento appena nato cade sempre dentro la finestra, quindi qui le
       due cose crescono insieme; smetteranno di farlo con il passare dei mesi. */
    this._cache.movLogTotal++;
    // v1.5.1 fix: aggiorna metadati syncIndicator anche su log movimenti
    await this._touchMeta();
  },

  /* v2.8.0 [H2] — ATTENZIONE AL NOME, che e' rimasto quello di prima ma non
     restituisce piu' la stessa cosa: e' la FINESTRA in memoria (vedi
     MOVLOG_WINDOW_DAYS), non l'archivio. Va bene per cruscotto, KPI e ultimi
     movimenti, che guardano al presente. Per l'archivio: queryMovements(). */
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

  /* ═══════════════════════════════════════════════════════════════════
     v2.8.0 [H2] — INTERROGAZIONE DELL'ARCHIVIO
     Il filtro per data va all'indice; tipo e testo si applicano dopo, sul
     sottoinsieme gia' ristretto. L'ordine dei due passaggi non e' un
     dettaglio: invertirlo significherebbe leggere un milione di record per
     poi tenerne trenta.

     `limit` e' un tetto di sicurezza, non una paginazione: disegnare 200.000
     righe in una tabella HTML non e' un'operazione lenta, e' un'operazione
     che non finisce. Chi ha bisogno di tutto usa l'export Excel.
     ═══════════════════════════════════════════════════════════════════ */
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

  // ═══════════════════════════════════════════════════════════════════
  // © Andrea Sacchetti — Dietopack S.r.l. — Pathfinder 1.2
  // Da qui in giu' Store non nomina mai Dexie: ogni scrittura passa per
  // Persistence, ogni mutazione di cache per _applyToCache.
  // ═══════════════════════════════════════════════════════════════════

  // ═══ QUARANTINE ═══
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
      /* v1.1.0 [N2] — I colli. Campi ADDITIVI: i record scritti prima di
         questa versione non li hanno, e il ripiego a 1 vale perche' fino
         alla v3.0.0 la quarantena era per forza totale su item da un
         collo o su tutti i colli dell'item. Nessuna migrazione. */
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

  /* v2.0.1 [B6] — il rilascio registra chi lo esegue e chi lo autorizza.
     I nuovi campi released_by / released_ref_person sono additivi: i record
     storici privi di questi campi restano leggibili (nessuna migrazione). */
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

  /* ═══════════════════════════════════════════════════════════════════
     v1.1.0 [N2] — IL BLOCCO SEGUE I COLLI, NON L'ARTICOLO
     © Andrea Sacchetti — Dietopack S.r.l.

     PRIMA: la domanda era "questo articolo#lotto e' in quarantena?", e la
     risposta valeva per TUTTO il magazzino. Bloccare un collo ammaccato in
     una corsia rendeva intoccabile lo stesso lotto in ogni altra
     ubicazione, comprese le ottanta casse sane in un'altra zona. Finche' la
     quarantena era per forza totale — si bloccava l'item intero, sempre —
     la cosa non si vedeva: l'item bloccato era l'unico che esistesse.

     ORA la quarantena puo' essere PARZIALE: cinque colli su quaranta vanno
     in area NC e trentacinque restano al loro posto, conformi. Se la
     domanda restasse globale, quei trentacinque diventerebbero
     inutilizzabili per un difetto che non hanno.

     La domanda giusta ha quindi due termini: quale merce, e DOVE. Il
     record di quarantena porta gia' `blocked_location` — la posizione
     REALE, dalla v2.0.1 [B1] — e nessuna migrazione serve.

     PERCHE' L'UBICAZIONE E' OPZIONALE. Omessa, si torna alla domanda
     globale, cioe' al comportamento di prima. E' voluto: e' la direzione
     PRUDENTE. Un punto di chiamata che sfuggisse a questa revisione
     continuerebbe a bloccare troppo, non troppo poco — e in magazzino
     bloccare merce buona costa un giro, lasciar partire merce bloccata
     costa un richiamo.
     ═══════════════════════════════════════════════════════════════════ */
  isItemQuarantined(itemKey, locationCode = null) {
    return this._cache.quarantine.some(q =>
      q.status === 'active' && q.item_key === itemKey &&
      (locationCode == null || q.blocked_location === locationCode));
  },

  /* La domanda globale, per chi la vuole davvero: gli avvisi che dicono
     "attenzione, di questo lotto c'e' del materiale bloccato altrove".
     Non e' un divieto, e' un'informazione — e va tenuta distinta dal
     divieto, o si torna al punto di partenza. */
  isItemQuarantinedAnywhere(itemKey) {
    return this._cache.quarantine.some(q => q.status === 'active' && q.item_key === itemKey);
  },

  /* Le ubicazioni in cui quell'articolo#lotto risulta bloccato adesso.
     Serve ai messaggi: dire "bloccato" senza dire dove obbliga chi legge
     a cercarlo a mano. */
  quarantinedLocationsOf(itemKey) {
    return this._cache.quarantine
      .filter(q => q.status === 'active' && q.item_key === itemKey)
      .map(q => q.blocked_location);
  },

  getActiveQuarantine() { return this._cache.quarantine.filter(q => q.status === 'active'); },
  getQuarantineHistory() { return this._cache.quarantine; },

  // ═══════════════════════════════════════════════════════════════════
  // v2.0.0 — Gestione documenti uscita pendenti (Resi + Spedizioni)
  // © Andrea Sacchetti — Dietopack S.r.l.
  // I DDT pendenti sono documenti registrati ma non ancora evasi:
  // la merce è ancora in giacenza, prenotata per uscita.
  // L'evasione (= ritiro fisico del vettore) li chiude e scarica giacenza.
  // ═══════════════════════════════════════════════════════════════════

  /* Salva un nuovo DDT pendente di uscita.
     entry: { kind:'RES'|'SHIP', ddt_num, destination, carrier, expected_pickup_date, operator, lines:[...] }
     Genera doc_id automatico e setta status='pending'. Ritorna il record salvato. */
  async savePendingOutbound(entry) {
    // v2.0.1 [A2] — validazione nel dominio: nessun documento può impegnare
    // più merce di quella effettivamente disponibile.
    this._validateOutboundLines(entry.lines);
    const prefix = entry.kind === 'SHIP' ? 'SHIP' : 'RES';
    const doc_id = `${prefix}-${(entry.ddt_num || 'NA').replace(/[^A-Za-z0-9]/g,'')}-${Date.now().toString(36).toUpperCase()}`;
    /* v3.0.0 [M4] — I campi si dichiarano uno per uno, come si e' sempre
       fatto qui: uno spread dell'input lascerebbe entrare nel documento
       qualunque cosa il chiamante si porti dietro, e un documento e' la
       cosa meno adatta a contenere campi di cui nessuno sa il perche'. */
    const rec = {
      doc_id,
      /* `kind` resta e resta indicizzato: e' la chiave con cui i documenti
         pre-v3.0.0 dicono la propria natura. Dalla v3.0.0 lo scrive la
         causale, cosi' i due campi non possono divergere. */
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

  /* v2.0.0+ — Aggiorna campi modificabili di un DDT pendente.
     patch: { ddt_num?, destination?, carrier?, expected_pickup_date?, lines? }
     I campi non specificati nel patch restano invariati. Solo doc 'pending'
     possono essere modificati. Aggiunge automaticamente updated_at timestamp. */
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
  /* Documenti di uscita ancora aperti. `kind` ('RES' | 'SHIP') e'
     opzionale dalla v2.6.0 [F1-2]: omesso, restituisce i pendenti di
     entrambi i tipi. Serve al calcolo dell'anti-doppia-prenotazione, che
     deve considerare TUTTO cio' che e' gia' impegnato su un documento,
     non solo i resi o solo le spedizioni. Il valore di ritorno e' sempre
     un array nuovo: chi lo ordina non tocca la cache. */
  getPendingOutbound(kind) {
    return this._cache.pendingOut
      .filter(d => d.status === 'pending' && (kind == null || d.kind === kind))
      .sort((a, b) => b.created_at - a.created_at);
  },

  /* Restituisce un singolo documento per ID */
  getPendingDoc(doc_id) {
    return this._cache.pendingOut.find(d => d.doc_id === doc_id);
  },

  /* ═══════════════════════════════════════════════════════════════════
     v1.1.0 [N5] — TUTTI I DOCUMENTI DI USCITA, CHIUSI COMPRESI
     © Andrea Sacchetti — Dietopack S.r.l.

     getPendingOutbound() filtra su status === 'pending', ed e' giusto:
     serve a chi deve sapere cosa c'e' ancora da evadere. L'effetto
     collaterale era pero' che un DDT evaso spariva da OGNI elenco
     dell'applicativo. Il record restava — non si cancella niente qui
     dentro — e _printDDT() continuava a saperlo stampare: mancava solo un
     posto da cui chiederglielo. Un documento che esiste e non si puo'
     ristampare e' un documento perso, e su un DDT sono sei anni.
     ═══════════════════════════════════════════════════════════════════ */
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

  /* ═══════════════════════════════════════════════════════════════════
     v2.0.1 [A1] — GIACENZA FISICA vs QUANTITÀ DISPONIBILE
     © Andrea Sacchetti — Dietopack S.r.l.

     Distinzione fondamentale, prima assente:
       - giacenza FISICA  = colli presenti in ubicazione (item.qty)
       - quantità DISPONIBILE = fisica − prenotata su DDT pendenti non evasi

     La merce prenotata su un DDT è fisicamente presente in ubicazione (il flusso
     a 2 stati la scarica solo all'evasione), ma NON è più impegnabile: se il
     prelievo produzione la porta via, all'arrivo del vettore il DDT non è evadibile.
     Verificato in test sulla v2.0.0: 10 colli prenotati, 10 prelevati, DDT rimasto
     pendente su giacenza inesistente.

     REGOLA D'USO:
       - Prelievo produzione, Smaltimento, composizione DDT → usano il DISPONIBILE
       - Inventario fisico → usa la giacenza FISICA (la merce prenotata c'è, e
         durante la conta si deve trovare). Comportamento voluto, non una svista.
     ═══════════════════════════════════════════════════════════════════ */
  getPhysicalQty(location_code, item_key) {
    const item = (this._invByLoc.get(location_code) || []).find(i => i.item_key === item_key);
    if (!item) return 0;
    // `qty || 1` è la convenzione usata in TUTTO il codice preesistente per i record
    // anteriori alla v1.7.0 (semantica "presenza"). Va rispettata qui, altrimenti un
    // eventuale record privo di qty risulterebbe a zero e sparirebbe dai controlli
    // di disponibilità pur essendo fisicamente presente in ubicazione.
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

  /* ═══════════════════════════════════════════════════════════════════
     v2.0.1 [A-3] — CONTROLLO DINAMICO DI INTEGRITÀ DEI DDT PENDENTI

     Decisione A-3: la merce prenotata PUÒ essere spostata di ubicazione previa
     conferma esplicita, ma il documento registrato NON viene modificato in
     automatico — sarebbe una modifica implicita a un record già emesso.
     Il disallineamento viene invece SEGNALATO, e l'operatore decide se
     modificare il DDT (bottone Modifica) o annullarlo e rifarlo.

     Ritorna { ok, issues: [{ lineIndex, level, message }] } — sola lettura.
     ═══════════════════════════════════════════════════════════════════ */
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

  /* Validazione righe documento di uscita.
     v2.0.1 [A2] — prima questo controllo esisteva SOLO nei form della UI:
     qualunque chiamante che bypassasse il form (import, futura API, codice nuovo)
     poteva creare prenotazioni su merce inesistente. Verificato in test:
     8 colli prenotati su 4 disponibili, accettati senza errore.
     Ora la regola vive nel dominio. Lancia Error alla prima riga non valida. */
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


  /* ═══════════════════════════════════════════════════════════════════
     v2.5.0 — SESSIONE DI PRELIEVO (protezione del lavoro in corso)
     © Andrea Sacchetti — Dietopack S.r.l.

     Livello 2 della protezione descritta in [P5]. Il livello 1 (commit per
     tappa) vive in App._routeConfirmStop(): è lì che giacenza e mov_log
     vengono scritti in transazione atomica.

     Qui si conserva solo l'avanzamento del cammino, e solo finché serve.
     Ogni metodo di scrittura è deliberatamente non bufferizzato: la sessione
     va su disco nell'istante in cui cambia, altrimenti non protegge da nulla.
     ═══════════════════════════════════════════════════════════════════ */

  /* Ritorna la sessione attiva, o null. Legge dalla cache in memoria,
     allineata a ogni scrittura. */
  getActivePickSession() {
    return this._cache.pickSession || null;
  },

  /* Crea e persiste una nuova sessione. Se ne esisteva una attiva viene
     sostituita: il vincolo di unicità è imposto qui, non nella UI, così vale
     anche se un domani il percorso venisse avviato da un altro punto. */
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

  /* Riscrive la sessione attiva. Chiamata dopo ogni cambio di stato di una
     tappa. Se la scrittura fallisce l'errore RISALE al chiamante: un
     avanzamento che l'operatore crede salvato e non lo è sarebbe peggio di
     un errore visibile. */
  async savePickSession(session) {
    if (!session?.session_id) throw new Error('Sessione di prelievo priva di identificativo');
    session.updated_at = Date.now();
    await Persistence.put('pick_session', session);
    this._applyToCache('pick_session', 'put', session);
    await this._touchMeta();
    return session;
  },

  /* Chiude la sessione ELIMINANDO il record: lo stato di avanzamento del
     cammino non serve più. Ciò che resta è il `mov_log` (audit trail) e —
     dalla v2.5.1 — lo snapshot del report in `pick_archive`, scritto da
     archivePickReport() PRIMA di questa chiamata. */
  async endPickSession() {
    try {
      await Persistence.clear('pick_session');
    } catch (err) {
      console.error('[WM] endPickSession:', err);
    }
    this._applyToCache('pick_session', 'clear');
    await this._touchMeta();
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.6.0 [F1-1] — CONFERMA DI UNA TAPPA: SCRITTURA ATOMICA
     © Andrea Sacchetti — Dietopack S.r.l.

     Questa transazione viveva dentro App._routeConfirmStop(), che apriva
     Dexie in proprio, nominando le tabelle una per una nello scope della
     transazione. Era l'unico punto dell'applicazione in
     cui la UI conosceva il nome delle tabelle: con un backend remoto
     quella riga non avrebbe avuto alcun significato, e la conferma di
     tappa — l'operazione piu' delicata dell'intero applicativo — sarebbe
     stata l'unica da riscrivere in App.

     Qui si sposta SOLO la scrittura. Restano in App, invariati: i
     re-check sullo stato attuale della merce, il dialogo delle quantita',
     il riscontro sonoro e visivo, la finestra di storno, il registro di
     sessione a video. La logica di percorso non e' toccata.

     Le tre scritture sono un'unica cosa sola: se il movimento non viene
     registrato, la giacenza non deve risultare scaricata, e la tappa non
     deve risultare fatta. O passa tutto, o non passa nulla.

     In caso di errore la cache viene riallineata al disco PRIMA di
     risalire al chiamante: removeItem() aggiorna la memoria prima che la
     transazione sia confermata, quindi un abort lascerebbe la cache che
     racconta un prelievo mai avvenuto. Il disco e' la verita'.
     ═══════════════════════════════════════════════════════════════════ */
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

  /* ═══════════════════════════════════════════════════════════════════
     v2.5.1 — ARCHIVIO DEI REPORT DI PRELIEVO EMESSI
     © Andrea Sacchetti — Dietopack S.r.l.

     Un solo scopo: permettere la RISTAMPA CONFORME. Lo snapshot è già
     normalizzato dal chiamante (App._pickSnapFrom*), così il template di
     stampa legge la stessa struttura sia a caldo sia a distanza di mesi.
     Qui non si interpreta nulla: si scrive e si rilegge.
     ═══════════════════════════════════════════════════════════════════ */

  /* Scrive lo snapshot. Il fallimento NON risale al chiamante: il report
     è già a video e sta per andare in stampa, e i movimenti sono scritti
     da un pezzo. Perdere la copia d'archivio è un disservizio (niente
     ristampa conforme), non una perdita di dati: bloccare la chiusura del
     percorso per questo sarebbe una cura peggiore del male. */
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

  /* Snapshot più recente per un dato numero d'ordine, o null.
     Il confronto è normalizzato (spazi e maiuscole) perché lo stesso
     ordine può essere stato digitato in due modi in due flussi diversi. */
  getPickReportByOdp(odpNum) {
    const norm = v => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const key = norm(odpNum);
    if (!key) return null;
    return this._cache.pickArchive
      .filter(x => norm(x.odp_num) === key)
      .sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0))[0] || null;
  },

  getPickReports() { return this._cache.pickArchive; },

  /* ═══════════════════════════════════════════════════════════════════
     v3.0.0 [M2] — ARCHIVIO DEI VERBALI DI SMALTIMENTO
     © Andrea Sacchetti — Dietopack S.r.l.

     Stessa impostazione dell'archivio dei report di prelievo, e per la
     stessa ragione: un verbale si RILEGGE, non si ricostruisce. Anche il
     trattamento dell'errore e' lo stesso — la merce e' gia' uscita e il
     movimento e' gia' a registro quando questa funzione viene chiamata,
     quindi un fallimento qui costa la ristampa conforme, non il dato.
     ═══════════════════════════════════════════════════════════════════ */

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

  /* Progressivo del verbale nell'anno corrente. Non e' un contatore
     persistito: si conta cio' che c'e', cosi' non esiste un numero
     "prenotato" da un'operazione poi annullata. */
  nextDisposalSeq() {
    const anno = new Date().getFullYear();
    const n = this._cache.disposalArchive.filter(d =>
      new Date(d.created_at || 0).getFullYear() === anno).length;
    return `SMA-${anno}-${String(n + 1).padStart(4, '0')}`;
  },

  /* ═══════════════════════════════════════════════════════════════════
     v3.0.0 [M4] — CONFIGURAZIONE DOCUMENTALE
     © Andrea Sacchetti — Dietopack S.r.l.

     Mittente, causali di trasporto, motivazioni di smaltimento e formato
     del numero DDT. Vive sullo store `meta`, che e' key/value e non ha
     richiesto ne' un nuovo store ne' una migrazione.

     PERCHE' NON CABLATI NEL FILE. Una partita IVA scritta dentro il
     sorgente si corregge riaprendo il sorgente, e un applicativo che
     serve un magazzino non puo' pretendere che chi ci lavora sappia dove
     mettere le mani nell'HTML. Qui si scrivono una volta da
     Configurazione e si correggono da li'.

     I DEFAULT SONO VUOTI DI PROPOSITO per l'anagrafica del mittente:
     inventare una ragione sociale plausibile e' peggio che lasciarla in
     bianco, perche' un campo compilato non lo verifica piu' nessuno.
     Le liste (causali, motivazioni) partono invece popolate, perche' li'
     il default e' un suggerimento, non un dato di fatto.
     ═══════════════════════════════════════════════════════════════════ */

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

  /* Causale per id, con ripiego sulla prima disponibile: un DDT salvato
     con una causale poi cancellata dalla configurazione deve restare
     leggibile, non esplodere. */
  getCausale(id) {
    const list = this.getDocConfig().causali;
    return list.find(c => c.id === id) || null;
  },

  /* Tipo di movimento che una causale comanda [M3]. Il default e' SHIP:
     una causale sconosciuta e' merce che esce, e questa e' l'ipotesi che
     sbaglia meno. */
  movTypeForCausale(id) {
    const c = this.getCausale(id);
    return c && c.mov === 'RET' ? MOV.RET : MOV.SHIP;
  },

  /* Proposta per il numero del DDT successivo [M4]. NON e' un contatore:
     si limita a incrementare la coda numerica dell'ultimo numero emesso,
     conservando prefissi e zeri di riempimento. Se l'ultimo numero non
     finisce con delle cifre, non si inventa niente e si torna stringa
     vuota, lasciando il campo all'operatore. */
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

  /* Destinatari gia' usati, per l'autocomplete della testata [M4].
     Si leggono dai DDT emessi: nessun registro da mantenere, e la lista
     riflette esattamente con chi si e' lavorato davvero. Il piu' recente
     per ogni denominazione vince, perche' un indirizzo cambiato e' un
     indirizzo cambiato. */
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

  /* ═══════════════════════════════════════════════════════════════════
     v2.5.0 — GEOMETRIA DELLE UBICAZIONI PER L'ORDINAMENTO A SERPENTINA

     Costruisce una mappa codice → coordinate reali (sito, zona, corsia,
     campata, livello). Le coordinate NON sono dedotte dal testo del codice:
     provengono da _genLocations(), cioè dalla stessa funzione che i codici li
     ha generati. Interpretare la stringa a posteriori significherebbe
     ipotizzare che i separatori non compaiano mai dentro un id di sito o di
     zona, ipotesi che nessuno garantisce.

     Costo: una scansione completa delle zone, eseguita una volta per import.
     ═══════════════════════════════════════════════════════════════════ */
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
            /* Indice del livello nell'ordine configurato: si assume che
               l'elenco sia già dal basso verso l'alto, come nella UI di
               configurazione.

               Il `Math.max(0, …)` non è una regola di ordinamento, è una
               rete: un livello fuori elenco qui non può arrivare, perché
               `levels` è la stessa riga di configurazione da cui
               _genLocations() ha appena preso quel livello. Se un giorno le
               due letture divergessero, l'indice -1 diventerebbe 0 e il
               livello finirebbe a pari merito col primo — visibile,
               invece di far scendere l'ordinamento sotto zero.
               (Il commento diceva «in coda»: non è mai stato vero.) */
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
    // v2.0.1 [B1] (decisione 3-c): l'ubicazione NC può contenere più item.
    // Prima le ubicazioni bloccate già occupate erano declassate (priority 2) e
    // di fatto scartate dal flusso di quarantena, che allora NON spostava la merce
    // pur dichiarandola spostata. Ora la presenza di altri item non è più un
    // demerito: si privilegia solo la vicinanza di zona.
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
  /* ═══════════════════════════════════════════════════════════════════
     v2.8.0 [H2][H7] — EXPORT COMPLETO
     Il registro NON viene piu' preso dalla cache: la cache ne ha solo la
     finestra, e un backup con dentro quattro mesi su sei anni sarebbe la
     forma peggiore di guasto — silenziosa, e scoperta il giorno in cui
     serve. Si legge dal database, a blocchi.

     `_counts` accompagna i dati: all'import si verifica che il file contenga
     esattamente quello che dichiara di contenere.
     ═══════════════════════════════════════════════════════════════════ */
  async exportAll({ includeMovLog = true } = {}) {
    const movLog = [];
    if (includeMovLog) {
      await this.eachMovement(rows => { for (const r of rows) movLog.push(r); });
      movLog.sort((a, b) => b.ts - a.ts);
    }
    /* v2.8.0 [H4] — DIFFERENZA CHE VALE SEI ANNI DI STORICO.
       Quando il registro non e' incluso, la chiave mov_log NON deve esistere
       nel pacchetto. Un array vuoto e' una DICHIARAZIONE ("il registro e'
       vuoto") e importAll la rispetta azzerando la tabella; l'assenza della
       chiave e' una OMISSIONE ("di questo non parlo") e la lascia stare.
       Le due cose si scrivono quasi uguali e finiscono in modi opposti. */
    const data = {
      /* `_format` NON cambia con la versione dell'applicativo: descrive la
         forma del pacchetto, che è la stessa, e un file esportato dalla 1.1
         deve continuare a rientrare. `_appVersion` invece dice chi lo ha
         scritto, ed è l'unica delle due a muoversi. */
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
      /* v3.0.0 [M4] — La configurazione documentale viaggia con il backup.
         Non e' un vezzo: su una macchina nuova, ripristinare i dati senza
         l'anagrafica del mittente significherebbe ritrovarsi i DDT che si
         rifiutano di stampare finche' qualcuno non ridigita la partita IVA.
         Non entra in _counts perche' non e' una collezione: e' un oggetto. */
      doc_config: this._cache.meta?.docConfig || null,
      /* v2.7.0 [G6] — L'anagrafica operatori viaggia con l'HASH del PIN, non
         con il PIN: ripristinando un backup gli operatori tornano operativi
         senza dover ridistribuire i codici, e il file esportato non contiene
         comunque alcun segreto in chiaro. */
      operators: this._cache.operators
    };
    if (!includeMovLog) delete data.mov_log;     // omissione, non dichiarazione
    data._counts = this._countsOf(data);
    if (!includeMovLog) delete data._counts.mov_log;
    if (movLog.length) {
      data._movRange = { from: movLog[movLog.length - 1].ts, to: movLog[0].ts };
    }
    return data;
  },

  /* Conteggio per collezione di un pacchetto di export. Sta qui e non nel
     chiamante perche' lo usano sia chi scrive il file sia chi lo verifica:
     due implementazioni della stessa somma sarebbero due occasioni di
     divergere. */
  _countsOf(data) {
    const out = {};
    for (const k of ['sites','zones','articles','inventory','loc_status','disabled','mov_log','quarantine','pending_outbound','pick_archive','disposal_archive','operators']) {
      out[k] = Array.isArray(data[k]) ? data[k].length : 0;
    }
    return out;
  },

  /* Verifica di un pacchetto prima di scriverlo in database.
     Ritorna { ok, problemi[] }: un backup si controlla PRIMA di fidarsene,
     non dopo aver sovrascritto i dati buoni con quelli rotti. */
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
      /* ═══════════════════════════════════════════════════════════════
         v2.8.0 [H4] — SI AZZERA SOLO CIO' CHE SI VA A RIMPIAZZARE
         © Andrea Sacchetti — Dietopack S.r.l.

         PRIMA: la sovrascrittura svuotava TUTTE le collezioni e poi
         riempiva quelle presenti nel file. Un pacchetto parziale — per
         esempio una fotografia dello stato senza il registro storico —
         cancellava sei anni di movimenti e non li rimetteva: perdita
         totale e silenziosa, con l'unica avvisaglia di un conteggio a zero
         che nessuno avrebbe guardato subito.

         ORA una collezione assente dal pacchetto viene LASCIATA STARE.
         La regola vale sempre e rende sicuri i backup parziali, che sono
         proprio quelli che [H4] introduce: le fotografie giornaliere non
         portano il registro perche' il registro e' immutabile e viaggia
         per conto suo nei file mensili.

         Una collezione presente ma VUOTA (array vuoto) viene invece
         azzerata: e' una dichiarazione esplicita, non un'omissione. */
      const presenti = ['sites', 'zones', 'articles', 'inventory', 'loc_status', 'disabled',
                        'mov_log', 'quarantine', 'pending_outbound', 'pick_archive',
                        'disposal_archive', 'operators']
                        .filter(c => Array.isArray(data[c]));
      await Persistence.transaction([...presenti, 'meta'], async () => {
        await Persistence.clearMany(presenti);
        if (data.sites?.length) await Persistence.bulkAdd('sites', data.sites.map(({_id, zones, ...r}) => r));
        if (data.zones?.length) await Persistence.bulkAdd('zones', data.zones.map(({_id, ...r}) => r));
        if (data.articles?.length) await Persistence.bulkAdd('articles', data.articles.map(({_id, ...r}) => r));
        if (data.inventory?.length) await Persistence.bulkAdd('inventory', data.inventory.map(({_id, ...r}) => r));
        if (data.loc_status?.length) await Persistence.bulkAdd('loc_status', data.loc_status.map(({_id, ...r}) => r));
        if (data.disabled?.length) await Persistence.bulkAdd('disabled', data.disabled.map(({_id, ...r}) => r));
        if (data.mov_log?.length) await Persistence.bulkAdd('mov_log', data.mov_log.map(({_id, ...r}) => r));
        if (data.quarantine?.length) await Persistence.bulkAdd('quarantine', data.quarantine.map(({_id, ...r}) => r));
        // v2.0.0 — pending_outbound (campo opzionale, retro-compatibile con backup pre-v2.0)
        if (data.pending_outbound?.length) await Persistence.bulkAdd('pending_outbound', data.pending_outbound);
        // v2.5.1 — pick_archive (campo opzionale, retro-compatibile con backup pre-v2.5.1)
        if (data.pick_archive?.length) await Persistence.bulkAdd('pick_archive', data.pick_archive);
        // v3.0.0 [M2] — disposal_archive (campo opzionale: i backup pre-v3.0.0 non ce l'hanno)
        if (data.disposal_archive?.length) await Persistence.bulkAdd('disposal_archive', data.disposal_archive);
        /* v3.0.0 [M4] — La configurazione documentale si SOVRASCRIVE solo se
           il pacchetto ne porta una. Un backup vecchio che non ce l'ha non
           deve cancellare il mittente gia' configurato su questa macchina. */
        if (data.doc_config) await Persistence.put('meta', { key: 'docConfig', value: data.doc_config });
        /* v2.7.0 [G6] — operators: campo opzionale. Un backup v2.6.0 o
           precedente non ce l'ha, e in quel caso l'anagrafica resta vuota:
           all'avvio successivo riparte il wizard del primo Team Leader. */
        if (data.operators?.length) await Persistence.bulkAdd('operators', data.operators.map(({_id, ...r}) => r));
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
    /* v2.2.1 [F1] — BUGFIX: la tabella pending_outbound (schema v3) non era
       inclusa nella transazione: i DDT pendenti sopravvivevano al reset e
       ricomparivano alla riapertura, riferiti a ubicazioni/articoli eliminati
       (prenotazioni fantasma su getPendingQtyForItem, alert e KPI fasulli). */
    /* v2.5.0 — pick_session aggiunta alla transazione per la stessa ragione per
       cui in v2.2.1 vi era stata aggiunta pending_outbound: una sessione di
       prelievo sopravvissuta al reset punterebbe a ubicazioni e articoli non
       più esistenti, e alla riapertura l'app proporrebbe di riprendere un
       percorso impossibile. */
    /* v2.5.1 — pick_archive: il reset azzera anche il registro movimenti, e
       un archivio di report che rimandano a movimenti non più esistenti
       sarebbe una traccia orfana. Se ne va con tutto il resto. */
    /* v2.7.0 [G6] — operators: il reset azzera la cache di TUTTE le collezioni
       (riga sotto). Lasciare la tabella su disco significherebbe farla
       ricomparire alla prima ricarica con una cache che la crede vuota:
       memoria e disco divergerebbero in silenzio. Va via con il resto — e
       all'avvio successivo riparte il wizard del primo Team Leader, quindi
       nessuno resta chiuso fuori. */
    await Persistence.transaction(['sites', 'zones', 'articles', 'inventory', 'loc_status', 'disabled', 'mov_log', 'quarantine', 'pending_outbound', 'pick_session', 'pick_archive', 'disposal_archive', 'operators', 'meta'], async () => {
      await Persistence.clearMany(['sites', 'zones', 'articles', 'inventory', 'loc_status', 'disabled', 'mov_log', 'quarantine', 'pending_outbound', 'pick_session', 'pick_archive', 'disposal_archive', 'operators', 'meta']);
    });
    for (const c of Persistence.COLLECTIONS) this._applyToCache(c, 'clear');
    this._rebuildIndexes();
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.8.0 [H1] — IL CHECKPOINT VERIFICA, NON RISCRIVE
     © Andrea Sacchetti — Dietopack S.r.l.

     PRIMA (fino alla v2.7.0). forceSave() cancellava e riscriveva otto
     tabelle intere, registro movimenti compreso, e poi rileggeva tutto per
     riallineare gli _id autoincrement che si era appena rigenerato da solo.

     Due difetti, uno di costo e uno di sostanza.

     IL COSTO. A 500 movimenti al giorno, al sesto anno significava riscrivere
     un milione di record a ogni click su "Salva ora" e a ogni blocco per
     inattivita': minuti di applicazione ferma, con una crescita lineare che
     non si sarebbe mai fermata.

     LA SOSTANZA. Non serviva a niente. Ogni scrittura di questo file passa
     gia' da `await Persistence.<qualcosa>` e finisce su IndexedDB in
     transazione propria nel momento in cui avviene. Non esiste un istante in
     cui un dato registrato viva solo in memoria. Il checkpoint non aggiungeva
     durabilita': ricopiava sopra dati identici.

     E c'era di peggio. Riscrivere significa che la MEMORIA vince sul DISCO.
     Nel caso in cui i due divergano — che e' l'unico caso in cui un
     checkpoint avrebbe qualcosa da dire — il vecchio forceSave prendeva la
     cache, di cui non si puo' sapere se e' completa, e la spingeva sopra il
     disco, che invece e' la copia che sopravvive a un riavvio. Con la
     finestra del registro [H2] sarebbe diventato distruttivo: avrebbe
     riscritto sei anni di archivio con i quattro mesi che stavano in memoria.

     ORA il checkpoint CONFRONTA i conteggi delle due parti, aggiorna i
     metadati e, se divergono, riallinea la cache DAL DISCO e lo dichiara.
     Costo costante, indipendente dagli anni di storico, e un'operazione che
     puo' scoprire un problema invece di seppellirlo.
     ═══════════════════════════════════════════════════════════════════ */
  async forceSave() {
    const disco = await Persistence.countAll();

    /* Conteggi di cache confrontabili con quelli del supporto. Il registro
       e' escluso di proposito: la cache ne tiene una finestra, quindi un
       divario e' la norma e non un sintomo. Per lui vale movLogTotal. */
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
  /* v2.6.0 [F1-3] — La stima dello spazio e' una capacita' del supporto,
     non della logica applicativa: sul server non esistera'. Store conserva
     il metodo pubblico — App continua a chiamare Store.estimateUsage() —
     e lo gira all'adapter. */
  async estimateUsage() {
    return await Persistence.estimateUsage();
  },

  // ═══════════════════════════════════════════════════════════════════
  // OPFS AUTO-BACKUP
  // Backup automatico settimanale su Origin Private File System.
  // Mantiene rolling delle ultime BACKUP_KEEP copie. OPFS sopravvive
  // alla pulizia cache normale del browser, ma non al "pulisci tutto".
  //
  // v2.6.0 [F1-3] — Separazione fra POLITICA e SUPPORTO.
  // Qui resta la politica: ogni quanto, quante copie tenere, come si
  // chiama il file, quando saltare il backup perche' non c'e' niente da
  // salvare. L'accesso al file system e' passato all'adapter
  // (Persistence.writeBackup / listBackups / deleteBackup / readBackup),
  // dietro il flag supportsLocalBackup. In Fase 5 il backup diventera'
  // un compito del servizio: cambiera' l'adapter, non questa politica.
  //
  // I nomi dei metodi pubblici sono rimasti quelli della v2.5.1
  // (writeOPFSBackup, listOPFSBackups, cleanupOldOPFSBackups,
  // readOPFSBackup, shouldAutoBackup, checkAutoBackup, isOPFSSupported):
  // App li chiama cosi' e non e' stata toccata.
  // ═══════════════════════════════════════════════════════════════════

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
    /* v2.8.0 [H4] — La copia locale NON porta il registro movimenti.
       A sei anni sarebbero ~250 MB per copia e quattro copie in rotazione:
       un gigabyte sottratto alla stessa quota che serve al database, cioe'
       un backup che si mangia i dati che dovrebbe proteggere. Il registro e'
       append-only e sta al sicuro nei file mensili della copia esterna [H4];
       qui serve poter tornare indietro su giacenze e anagrafiche dopo un
       errore recente, e per quello basta la fotografia del presente.
       Il ripristino da questa copia LASCIA INTATTO il registro, perche'
       importAll azzera soltanto le collezioni contenute nel pacchetto. */
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


  /* ═══════════════════════════════════════════════════════════════════
     v2.8.0 [H5] — PERSISTENZA DELL'ARCHIVIO
     © Andrea Sacchetti — Dietopack S.r.l.

     Senza questo permesso IndexedDB e' "best-effort": il browser puo'
     cancellarlo quando lo spazio scarseggia, senza avvisare nessuno. Per un
     registro che deve durare sei anni e' il rischio piu' concreto di tutti,
     e fino alla v2.7.0 il permesso non era mai stato chiesto.

     Va detto subito che chiederlo non basta sempre: aperto come FILE LOCALE
     (file://) Chrome lo nega e non c'e' codice che possa cambiarlo. In quel
     caso il metodo lo dichiara, con il motivo e il rimedio, invece di
     restituire un "false" muto che nessuno saprebbe interpretare.
     ═══════════════════════════════════════════════════════════════════ */
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
