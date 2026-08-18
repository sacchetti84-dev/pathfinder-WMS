import { LOG_RETENTION_DAYS, MOV, MOV_LABELS } from '../core/costanti';
import { debounce, _h } from '../core/utils';
import { Persistence } from '../core/persistence/index';
import { Validate } from '../modules/validate';
import { pickupAlertStatus } from '../modules/pickupAlert';
import { Auth } from '../modules/auth';
import { Session } from '../modules/session';
import { Feedback } from './feedback.js';
import { Dialog } from './dialog.js';
import { Tabs } from './tabs.js';
import { Store } from '../core/store';

import { VistaDestinatari } from './views/destinatari';
import { VistaParametri } from './views/parametri';
import { VistaCompiti } from './views/compiti';
import { VistaCampionamento } from './views/campionamento';
import { VistaMovimenta } from './views/movimenta';
import { VistaPosiziona } from './views/posiziona';
import { VistaSmaltimento } from './views/smaltimento';
import { VistaPrelievo } from './views/prelievo';
import { VistaPercorso } from './views/percorso';
import { VistaRapportoPrelievo } from './views/rapportoPrelievo';
import { VistaInventario } from './views/inventario';
import { VistaQuarantena } from './views/quarantena';
import { VistaSpedizioni } from './views/spedizioni';
import { VistaDocumento } from './views/documento';
import { VistaMappa } from './views/mappa';
import { VistaGiacenze } from './views/giacenze';
import { VistaConfigOperatori } from './views/configOperatori';
import { VistaConfigSiti } from './views/configSiti';
import { VistaConfigArticoli } from './views/configArticoli';
import { VistaConfigDati } from './views/configDati';
import { VistaConfigurazione } from './views/configurazione';
import { VistaCruscotto } from './views/cruscotto';
import { VistaRegistro } from './views/registro';

const App = {
  currentView: 'dashboard',
  currentSite: null,
  currentZone: null,
  currentLevel: 'T',
  selectedLocation: null,
  mapViewMode: 'plan',
  _showRegistry: false,
  _movMode: null,
  _movSessionLog: [],       // mov della sessione corrente per pannello "Registro Sessione"
  /* 1.4.2.1 — il compito che ha aperto la maschera aperta adesso.
     { task_id, type, payload, movs: [_id] } — `movs` si riempie da `_logMov`
     e si svuota a ogni avanzamento registrato. Fuori da qui non esiste: e'
     lo stato di UNA sessione di lavoro, non un dato. */
  _taskRun: null,
  // === v3.0.0 [M1] — Carico / Scarico unificati ===
  _ioMode: 'in',            // 'in' (posiziona) | 'out' (smaltisci)
  _dispStage: 'search',     // 'search' | 'verify' — stadio del solo scarico
  _dispState: null,         // { location_code, item_key, article_code, lot_code, qty_available,
                            //   alternatives:[], scan:{loc,art,lot}, forced_note, reason_id, reason_label }
  _invState: null,
  /* v1.1.0 [N4] — La quarantena ha ora due tappe come lo scarico:
     _qStage vale 'search' o 'verify', _qState e' la tappa in corso. */
  _qState: null,
  _qStage: 'search',
  _pickCart: [],
  _moveSelection: null,
  _pickSubMode: 'cambio',
  _prodPickStartTime: null,
  _prodOrderNum: '',
  _prodOperator: '',
  _shipCart: [],               // [{ article_code, article_description, lot_code, location_code, item_key, qty, qty_at_creation, expiry_date, notes }]
  _shipState: null,            // Stato corrente lookup: { item, availableQty, totalQty, pendingQty }
  _shipStartTime: null,        // Timer inizio sessione (per report)
  // ── documento ──
  _shipCausale: '',            // id della causale di trasporto → decide MOV.RET o MOV.SHIP
  _shipDdtNum: '',             // N° del documento
  _shipDocDate: '',            // Data del documento (ISO)
  _shipOrderRef: '',           // Riferimento a ordine / commessa / DDT di origine
  // ── destinatario ──
  _shipCustomer: '',           // Denominazione del destinatario
  _shipDestAddress: '',        // Indirizzo
  _shipDestZip: '',            // CAP
  _shipDestCity: '',           // Comune
  _shipDestProvince: '',       // Sigla provincia
  _shipDestVat: '',            // Partita IVA / codice fiscale
  _shipShipTo: '',             // Luogo di destinazione, se diverso dalla sede
  // ── trasporto ──
  _shipCarrier: '',            // Vettore
  _shipTrasporto: '',          // Trasporto a cura di: Mittente | Destinatario | Vettore
  _shipPorto: '',              // Franco | Assegnato
  _shipAspetto: '',            // Aspetto esteriore dei beni (bancali, cartoni…)
  _shipStartTransport: '',     // Data e ora di inizio trasporto
  _shipExpectedDate: '',       // v2.0.0+ — Data di ritiro prevista (ISO YYYY-MM-DD)
  // ── pesi e note ──
  _shipPesoNetto: '',          // Sovrascrive il calcolo da anagrafica, se compilato
  _shipPesoLordo: '',          // Netto + tara imballi: in anagrafica non c'è
  _shipDocNotes: '',           // Annotazioni riportate in fondo al DDT
  _configTab: 'sites',
  _artFilter: '',
  _artSort: 'code_asc',
  _editingSiteId: null,

  currentOperator: null,                // es. "AS", "MR" — popolato al login
  currentOperatorRecord: null,          // v2.7.0 — record completo dell'anagrafica
  _OPERATOR_KEY: 'wm_current_operator', // chiave localStorage (NON è token, solo iniziali)
  _KNOWN_OPERATORS_KEY: 'wm_known_operators', // v2.7.0: sigle storiche, solo per la migrazione
  _MIGRATED_KEY: 'wm_operators_migrated',     // v2.7.0: la migrazione avviene una volta sola

  _scannerLayoutFix: true,
  _SCANNER_FIX_KEY: 'wm_scanner_fix',

  _wireRemote() {
    if (Persistence.kind !== 'remote') return;

    Persistence._onOffline = (err) => {
      if (err) this._showServiceDown(err);
      else this._hideServiceDown();
    };

    Persistence._onChange = (ev) => this._scheduleResync(ev);

    this._svcBeat = setInterval(async () => {
      try { await Persistence._call('GET', '/api/health'); } catch {}
    }, 20000);
  },

  /* Riallineamento accorpato: molti avvisi ravvicinati fanno UNA
     rilettura, non una ciascuno. */
  _scheduleResync(ev) {
    this._resyncPending = this._resyncPending || new Set();
    for (const c of (ev?.collections || [])) this._resyncPending.add(c);
    clearTimeout(this._resyncTimer);
    this._resyncTimer = setTimeout(() => this._doResync(), 400);
  },

  async _doResync() {
    const toccate = [...(this._resyncPending || [])];
    this._resyncPending = new Set();
    try {
      await Store.reloadCache();
    } catch (err) {
      console.error('[pathfinder] riallineamento fallito:', err);
      return;
    }
    /* Si ridisegna solo cio' che si sta guardando. Un ridisegno completo
       durante una scansione sposterebbe il fuoco dal campo. */
    if (this.currentView === 'dashboard') this.renderDashboard();
    else if (this.currentView === 'tasks') this.renderTasks();
    else if (this.currentView === 'map') { this.renderMap(); this.renderSidebar(); }
    else if (this.currentView === 'config') this.renderConfig();
    else if (this.currentView === 'archive') this.renderArchive();   // v1.1.0 [N5]
    else if (this.currentView === 'movimenta' && this._movMode === 'shipping') {
      const zona = document.getElementById('movFormArea');
      if (zona && !this._shipCart.length) this._formSpedizioni(zona);
    }
    if (toccate.length) this.updateSyncIndicator();
  },

  _showServiceDown(err) {
    if (document.getElementById('svcDown')) return;
    const el = document.createElement('div');
    el.id = 'svcDown';
    el.className = 'svc-down';
    el.innerHTML = `
      <div class="svc-down-box">
        <div class="svc-down-ico">⛔</div>
        <h2>Servizio dati non raggiungibile</h2>
        <p>Il database di Pathfinder vive sulla macchina, non in questa finestra.
           Finché il servizio non risponde <strong>non è possibile registrare nulla</strong>:
           quello che venisse scansionato adesso andrebbe perso.</p>
        <div class="svc-down-what">
          <strong>Cosa fare</strong>
          <ol>
            <li>Verificare che la macchina del servizio sia accesa.</li>
            <li>Se è accesa, riavviare il servizio <span class="mono">Pathfinder</span>
                dai Servizi di Windows.</li>
            <li>Questa finestra si sblocca da sola appena il servizio torna.</li>
          </ol>
        </div>
        <p class="svc-down-err">${this._esc(err?.message || 'connessione interrotta')}</p>
        <button class="btn btn-primary" onclick="App._retryService()">Riprova adesso</button>
      </div>`;
    document.body.appendChild(el);
    Feedback.signal?.('error', 'Servizio dati non raggiungibile',
      'Nessuna operazione può essere registrata finché non torna.');
  },

  _hideServiceDown() {
    const el = document.getElementById('svcDown');
    if (!el) return;
    el.remove();
    this.toast('✓ Servizio dati di nuovo raggiungibile', 'success');
    this._doResync();
  },

  async _retryService() {
    try {
      await Persistence._call('GET', '/api/health');
      Persistence._subscribe();
    } catch {
      this.toast('Ancora nessuna risposta dal servizio', 'error');
    }
  },

  async init() {
    try {
      await Store.init();
    } catch (err) {
      document.getElementById('bootScreen').innerHTML =
        `<div style="text-align:center;padding:2rem;color:var(--sx-danger)"><h2>Errore inizializzazione DB</h2><p style="margin-top:1rem">${this._esc(err.message)}</p><p style="margin-top:1rem;font-size: var(--md-sys-typescale-body-small-size);color:#666">Verifica che il browser supporti IndexedDB e abbia spazio sufficiente.</p></div>`;
      return;
    }
    // v1.9.1 — Carica preferenza fix scanner layout
    this._loadScannerSettings();
    // v1.9.1 — Registra listener globale per fix barcode US→IT
    document.addEventListener('keydown', (e) => this._scanKeydownFix(e), true);
    // v2.1.0 — Feedback multisensoriale, focus keeper e scorciatoie operative
    Feedback.init();
    document.addEventListener('keydown', (e) => this._focusKeeper(e), true);
    document.addEventListener('keydown', (e) => this._shortcuts(e));
    this._loadSidebarState();                 // v2.7.0 [G4]
    this._wireRemote();                       // database sulla macchina, se c'è
    document.getElementById('bootScreen').style.display = 'none';
    document.getElementById('appRoot').style.display = 'grid';
    this._syncHeaderHeight();                 // v2.7.0 [G3]
    window.addEventListener('resize', debounce(() => this._syncHeaderHeight(), 120));
    this.renderSidebar();
    this._syncFeatureNav();                   // 1.4 — le voci che dipendono da un interruttore
    this._renderOperatorBadge();
    // Primo avvio con DB vuoto → porta direttamente alla configurazione
    if (Store.getSites().length === 0) {
      this.switchView('config');
      this.toast('Benvenuto — inizia creando un Sito di stoccaggio', 'info');
    } else {
      this.renderDashboard();
    }
    this.updateSyncIndicator();
    this._checkStorageQuota();

    /* v2.8.0 [H6] — Se un'altra scheda sta gia' scrivendo, questa passa in
       sola lettura invece di lavorare su una cache che invecchia in silenzio. */
    Tabs.init((ro) => this._onReadOnlyChange(ro));

    await this._flushRecoveryQueue();
    this._renderRecoveryBanner();

    /* v2.8.0 [H5] — Chiede al browser di non cancellare il database.
       Su file:// verra' negata: lo stato reale e' in Configurazione → Dati. */
    Store.requestPersistentStorage().then(r => {
      if (!r.granted) console.info('[WM] archiviazione persistente non concessa —', r.reason);
    });

    // Auto-backup OPFS settimanale (silenzioso, in background)
    this._scheduleAutoBackup();
    // v2.8.0 [H4] — Copia esterna giornaliera sulla cartella configurata
    this._scheduleVaultBackup();

    await this._migrateLegacyOperators();
    Session.init(() => this._onSessionExpired());
    await this._openIdentityGate({ initial: true });
    setTimeout(() => this._checkPendingPickSession(), 400);
  },

  async _migrateLegacyOperators() {
    try {
      if (localStorage.getItem(this._MIGRATED_KEY) === '1') return;
    } catch { return; }   // senza localStorage non c'e' nulla da migrare
    const known = this._getKnownOperators();
    let created = 0;
    for (const sigla of known) {
      if (Store.getOperatorByInitials(sigla)) continue;
      try {
        await Store.addOperator({ initials: sigla, first_name: '', last_name: '', role: 'operator' });
        created++;
      } catch (err) {
        console.warn('[WM] migrazione operatore', sigla, err);
      }
    }
    try { localStorage.setItem(this._MIGRATED_KEY, '1'); } catch {}
    if (created) {
      this.toast(`${created} operatore/i importato/i dallo storico — completa i dati in Configurazione`, 'info');
    }
  },

  _getKnownOperators() {
    try {
      const raw = localStorage.getItem(this._KNOWN_OPERATORS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(s => /^[A-Z0-9]{2,4}$/.test(s)) : [];
    } catch { return []; }
  },

  /* Carica preferenza fix scanner da localStorage. Default: ATTIVO. */
  _loadScannerSettings() {
    try {
      const v = localStorage.getItem(this._SCANNER_FIX_KEY);
      // Se non impostato → default true. Se impostato a '0' → false.
      this._scannerLayoutFix = v === null ? true : (v === '1');
    } catch { /* localStorage disabilitato → default true */ }
  },

  /* Persiste preferenza fix scanner. */
  _setScannerLayoutFix(enabled) {
    this._scannerLayoutFix = !!enabled;
    try {
      localStorage.setItem(this._SCANNER_FIX_KEY, this._scannerLayoutFix ? '1' : '0');
    } catch {}
    this.toast(`Correzione layout scanner: ${this._scannerLayoutFix ? 'ATTIVA' : 'DISATTIVA'}`, 'info');
    if (this._configTab === 'data') this.renderConfig();
  },

  _scanKeydownFix(e) {
    if (!this._scannerLayoutFix) return;
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    if (!t.classList.contains('input-mono')) return;
    // Ignora se modificatori (Ctrl/Alt/Meta) per non interferire con scorciatoie
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // Mappa tasto fisico (event.code) → carattere atteso (layout US/scanner default fabbrica)
    const PHYS_MAP = {
      'Slash': '/',
      'Minus': '-',
      'Quote': "'",
      'Backslash': '\\',
      'Equal': '='
    };
    const expected = PHYS_MAP[e.code];
    if (!expected) return;
    // Se il carattere prodotto coincide già con quello atteso → nessuna correzione necessaria
    if (e.key === expected) return;
    // Sostituisci solo se e.key è un singolo carattere stampabile (no Enter/Tab/Backspace ecc.)
    if (typeof e.key !== 'string' || e.key.length !== 1) return;
    // Inserisci il carattere atteso al posto del default
    e.preventDefault();
    const start = t.selectionStart ?? t.value.length;
    const end = t.selectionEnd ?? t.value.length;
    const v = t.value;
    t.value = v.slice(0, start) + expected + v.slice(end);
    try { t.setSelectionRange(start + 1, start + 1); } catch {}
    // Trigger 'input' event per attivare eventuali oninput handler esistenti (es. _previewLoc)
    t.dispatchEvent(new Event('input', { bubbles: true }));
  },
  // © Andrea Sacchetti — fine modulo fix scanner v1.9.1
  // ═══════════════════════════════════════════════════════════════════

  _gateOpen: false,

  async _openIdentityGate({ initial = false, reason = '' } = {}) {
    if (this._gateOpen) return;
    this._gateOpen = true;
    Session.suspend();
    if (!Auth.available()) {
      /* Contesto non sicuro: crypto.subtle non esiste. Meglio dirlo che
         fingere una verifica che non sta avvenendo. */
      this._gateOpen = false;
      Session.resume();
      this.toast('PIN non verificabile in questo contesto (serve https, file:// o localhost) — identificazione ridotta alle iniziali', 'warning');
      return;
    }
    if (!Store.getUsableLeaders().length) this._renderFirstLeaderWizard();
    else this._renderLoginModal({ initial, reason });
  },

  _closeIdentityGate() {
    document.getElementById('identityGate')?.remove();
    this._gateOpen = false;
    Session.resume();
  },

  _gateShell(title, bodyHtml, footerHtml, { dismissible = false } = {}) {
    document.getElementById('identityGate')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'identityGate';
    overlay.className = 'modal-overlay gate-overlay';
    /* Nessun onclick di chiusura sul fondo e nessun tasto Esc: il popup e'
       un blocco, non un avviso. Si esce identificandosi. */
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <h2>${title}</h2>
          ${dismissible ? '<button class="btn btn-sm btn-icon btn-ghost" onclick="App._closeIdentityGate()">✕</button>' : ''}
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">${footerHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  },

  /* ── [G7] Wizard del primo Team Leader ────────────────────────────── */
  _renderFirstLeaderWizard() {
    this._gateShell(
      '👑 Primo accesso — Team Leader',
      `<p style="font-size: var(--md-sys-typescale-body-medium-size);color:var(--sx-text-secondary);line-height:1.6;margin-bottom:0.8rem">
        Non risulta alcun <strong>Team Leader</strong> in anagrafica. Ne serve almeno uno:
        è chi può creare gli operatori e rinnovare i PIN smarriti.<br>
        Le <strong>iniziali</strong> sono ciò che verrà scritto su ogni movimento per la tracciabilità GMP.
      </p>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="wizFirst" maxlength="40" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="wizLast" maxlength="40"></div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem">
        <label>Iniziali <span class="req">*</span> <span style="font-weight:400;color:var(--sx-text-muted)">(2-4 caratteri, maiuscole o cifre)</span></label>
        <input class="input input-mono" id="wizInitials" maxlength="4" style="text-transform:uppercase" placeholder="Es. AS"
          oninput="this.value=this.value.toUpperCase()">
      </div>
      <div class="form-row" style="margin-bottom:0.4rem">
        <div class="form-group"><label>PIN a 6 cifre <span class="req">*</span></label>
          <input class="input input-mono" id="wizPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma PIN <span class="req">*</span></label>
          <input class="input input-mono" id="wizPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._confirmFirstLeader()}"></div>
      </div>
      <div id="wizError" class="gate-error"></div>`,
      '<button class="btn btn-primary" onclick="App._confirmFirstLeader()">Crea Team Leader e accedi</button>'
    );
    setTimeout(() => document.getElementById('wizFirst')?.focus(), 80);
  },

  async _confirmFirstLeader() {
    const err = (m) => { const e = document.getElementById('wizError'); if (e) e.textContent = m; };
    const first = Validate.clean(document.getElementById('wizFirst')?.value);
    const last  = Validate.clean(document.getElementById('wizLast')?.value);
    const init  = (document.getElementById('wizInitials')?.value || '').toUpperCase().trim();
    const pin   = document.getElementById('wizPin')?.value || '';
    const pin2  = document.getElementById('wizPin2')?.value || '';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    if (!/^[A-Z0-9]{2,4}$/.test(init)) return err('Iniziali non valide: 2-4 caratteri, lettere maiuscole o cifre.');
    const pinErr = Auth.validatePin(pin);
    if (pinErr) return err(pinErr);
    if (pin !== pin2) return err('I due PIN non coincidono.');
    try {
      const fields = await Auth.buildPinFields(pin);
      const rec = await Store.addOperator({ first_name: first, last_name: last, initials: init, role: 'leader', ...fields });
      this._activateOperator(rec);
      this._closeIdentityGate();
      this.toast(`👑 Team Leader ${rec.initials} creato — sei collegato`, 'success');
      if (this.currentView === 'config') this.renderConfig();
    } catch (e) {
      err(e.message || 'Creazione non riuscita.');
    }
  },

  /* ── Login: chi sei e qual è il tuo PIN ───────────────────────────── */
  _loginSelectedId: null,
  _loginFails: 0,

  _renderLoginModal({ initial = false, reason = '' } = {}) {
    const ops = Store.getOperators({ activeOnly: true });
    this._loginSelectedId = ops.find(o => o.initials === this.currentOperator)?.op_id || null;
    const title = initial ? '👋 Identificazione' : (reason ? '🔒 Sessione bloccata' : '👤 Cambio operatore');
    this._gateShell(
      title,
      `${reason ? `<div class="mov-preview mov-preview-warn" style="margin-bottom:0.7rem">${this._esc(reason)}</div>` : ''}
      <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);margin-bottom:0.6rem">
        Seleziona il tuo nominativo e digita il PIN. Le iniziali verranno registrate su ogni movimento.
      </p>
      <div class="op-pill-grid" id="loginOps">${this._loginPillsHTML(ops)}</div>
      <div class="form-group" style="margin-top:0.7rem">
        <label>PIN a 6 cifre</label>
        <input class="input input-mono gate-pin" id="loginPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._confirmLogin()}">
      </div>
      <div id="loginError" class="gate-error"></div>
      <div style="margin-top:0.5rem;font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">
        PIN smarrito? Un <strong>Team Leader</strong> può rinnovarlo da Configurazione → Operatori.
      </div>`,
      `${initial || reason ? '' : '<button class="btn" onclick="App._closeIdentityGate()">Annulla</button>'}
       <button class="btn btn-primary" onclick="App._confirmLogin()">Accedi</button>`,
      { dismissible: !initial && !reason }
    );
    setTimeout(() => document.getElementById(this._loginSelectedId ? 'loginPin' : 'loginOps')?.focus(), 80);
  },

  _loginPillsHTML(ops) {
    if (!ops.length) return '<div class="gate-error">Nessun operatore attivo in anagrafica.</div>';
    return ops.map(o => {
      const label = (o.last_name || o.first_name)
        ? `${this._esc(o.initials)} · ${this._esc([o.first_name, o.last_name].filter(Boolean).join(' '))}`
        : `${this._esc(o.initials)} <span style="opacity:0.7">(da completare)</span>`;
      return `<button type="button" class="op-pill ${o.op_id === this._loginSelectedId ? 'active' : ''}"
        onclick="App._selectLoginOp('${o.op_id}')">${o.role === 'leader' ? '👑 ' : ''}${label}</button>`;
    }).join('');
  },

  _selectLoginOp(opId) {
    this._loginSelectedId = opId;
    const host = document.getElementById('loginOps');
    if (host) host.innerHTML = this._loginPillsHTML(Store.getOperators({ activeOnly: true }));
    document.getElementById('loginPin')?.focus();
  },

  async _confirmLogin() {
    const errEl = document.getElementById('loginError');
    const err = (m) => { if (errEl) errEl.textContent = m; };
    const op = this._loginSelectedId ? Store.getOperator(this._loginSelectedId) : null;
    if (!op) return err('Seleziona il tuo nominativo.');

    if (!op.pin_hash) { this._renderCompleteProfile(op); return; }

    const pin = document.getElementById('loginPin')?.value || '';
    if (!/^\d{6}$/.test(pin)) return err('Digita il PIN a 6 cifre.');
    if (!await Auth.verifyPin(op, pin)) {
      this._loginFails++;
      err('Nominativo o PIN non corretti.');   // messaggio generico: non si dice quale dei due
      const input = document.getElementById('loginPin');
      if (input) input.value = '';
      if (this._loginFails >= 3) {
        const wait = Math.min(20, 2 ** (this._loginFails - 2));
        if (input) { input.disabled = true; }
        err(`Nominativo o PIN non corretti — riprova fra ${wait} s.`);
        setTimeout(() => { if (input) { input.disabled = false; input.focus(); } err(''); }, wait * 1000);
      }
      return;
    }
    this._loginFails = 0;
    this._afterLogin(op);
  },

  /* Completamento della scheda importata dallo storico + primo PIN. */
  _renderCompleteProfile(op) {
    this._gateShell(
      `📝 Completa la tua scheda — ${this._esc(op.initials)}`,
      `<p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.6;margin-bottom:0.8rem">
        Le iniziali <strong>${this._esc(op.initials)}</strong> provengono dallo storico dei movimenti e restano invariate.
        Mancano nome, cognome e PIN.
      </p>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="cpFirst" maxlength="40" value="${this._esc(op.first_name || '')}" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="cpLast" maxlength="40" value="${this._esc(op.last_name || '')}"></div>
      </div>
      <div class="form-row" style="margin-bottom:0.4rem">
        <div class="form-group"><label>PIN a 6 cifre <span class="req">*</span></label>
          <input class="input input-mono" id="cpPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma PIN <span class="req">*</span></label>
          <input class="input input-mono" id="cpPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._confirmCompleteProfile('${op.op_id}')}"></div>
      </div>
      <div id="cpError" class="gate-error"></div>`,
      `<button class="btn" onclick="App._renderLoginModal({initial:true})">Indietro</button>
       <button class="btn btn-primary" onclick="App._confirmCompleteProfile('${op.op_id}')">Salva e accedi</button>`
    );
    setTimeout(() => document.getElementById('cpFirst')?.focus(), 80);
  },

  async _confirmCompleteProfile(opId) {
    const err = (m) => { const e = document.getElementById('cpError'); if (e) e.textContent = m; };
    const first = Validate.clean(document.getElementById('cpFirst')?.value);
    const last  = Validate.clean(document.getElementById('cpLast')?.value);
    const pin   = document.getElementById('cpPin')?.value || '';
    const pin2  = document.getElementById('cpPin2')?.value || '';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    const pinErr = Auth.validatePin(pin);
    if (pinErr) return err(pinErr);
    if (pin !== pin2) return err('I due PIN non coincidono.');
    try {
      const fields = await Auth.buildPinFields(pin);
      const rec = await Store.updateOperator(opId, { first_name: first, last_name: last, ...fields });
      this._afterLogin(rec);
    } catch (e) {
      err(e.message || 'Salvataggio non riuscito.');
    }
  },

  /* ── Cosa succede dopo un accesso riuscito ────────────────────────── */
  _afterLogin(op) {
    const previous = this.currentOperator;
    const changed = previous && previous !== op.initials;
    this._activateOperator(op);
    this._closeIdentityGate();

    if (changed && this._hasOpenCart()) {
      this.cancelMov();
      if (this.currentView === 'movimenta') this.renderMovimenta();
      this.toast(`Operazione aperta da ${previous} annullata: al lavoro c’è ora ${op.initials}`, 'warning');
    }
    this.toast(`👤 Operatore: ${op.initials}${op.role === 'leader' ? ' (Team Leader)' : ''}`, 'success');
  },

  _hasOpenCart() {
    return Boolean(this._movMode) || Boolean(this._pickCart?.length)
        || Boolean(this._shipCart?.length) || Boolean(this._dispState);
  },

  _activateOperator(op) {
    this.currentOperator = op.initials;
    this.currentOperatorRecord = op;
    try { localStorage.setItem(this._OPERATOR_KEY, op.initials); } catch {}
    this._renderOperatorBadge();
  },

  /* Uscita esplicita: il terminale torna disponibile a chiunque, subito.
     Prima si salva — chi smonta non deve preoccuparsi di premere altro. */
  async logoutOperator() {
    await this._saveCheckpoint().catch(() => {});
    this.currentOperator = null;
    this.currentOperatorRecord = null;
    this._renderOperatorBadge();
    this._openIdentityGate({ initial: true });
  },

  /* Il badge in barra apre le due sole azioni sensate. */
  showOperatorMenu() {
    if (!this.currentOperator) return this._openIdentityGate({ initial: true });
    const op = this.currentOperatorRecord;
    this.showModal(
      '👤 Operatore al lavoro',
      `<div style="font-size: var(--md-sys-typescale-body-medium-size);line-height:1.7">
        <div><strong>${this._esc([op?.first_name, op?.last_name].filter(Boolean).join(' ') || '—')}</strong></div>
        <div>Iniziali <span class="mono" style="font-weight:700">${this._esc(this.currentOperator)}</span>
             · ${op?.role === 'leader' ? '👑 Team Leader' : 'Operatore'}</div>
        <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-top:0.4rem">
          Blocco automatico dopo ${Session.getTimeoutMinutes() ? Session.getTimeoutMinutes() + ' min di inattività' : 'mai (disattivato)'}.
        </div>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Chiudi</button>
       <button class="btn btn-accent" onclick="App.closeModal();App._openIdentityGate({})">🔄 Cambia operatore</button>
       <button class="btn btn-warning" onclick="App.closeModal();App.logoutOperator()">🔒 Blocca ora</button>`
    );
  },

  /* ── Scadenza dell'inattività ─────────────────────────────────────── */
  async _onSessionExpired() {
    if (this._gateOpen) return;
    /* Prima si salva. Il lavoro fatto e' buono: e' l'attribuzione del lavoro
       successivo che non lo sarebbe piu'. */
    try { await Store.forceSave(); } catch (err) { console.error('[WM] salvataggio al blocco sessione:', err); }
    this.updateSyncIndicator();
    this.closeModal();
    this.closeSearchPop();
    const min = Session.getTimeoutMinutes();
    this._openIdentityGate({
      reason: `Sessione bloccata dopo ${min} minuti di inattività. I dati sono stati salvati. Identificati per riprendere.`
    });
  },

  _renderOperatorBadge() {
    const el = document.getElementById('operatorBadge');
    if (!el) return;
    if (this.currentOperator) {
      const leader = this.currentOperatorRecord?.role === 'leader';
      el.textContent = `${leader ? '👑' : '👤'} ${this.currentOperator}`;
      el.title = `Operatore corrente: ${this.currentOperator}${leader ? ' (Team Leader)' : ''} — clicca per cambiare o bloccare`;
      el.classList.remove('op-badge-empty');
    } else {
      el.textContent = '👤 —';
      el.title = 'Nessun operatore identificato — clicca per accedere';
      el.classList.add('op-badge-empty');
    }
  },

  async showOPFSBackups() {
    const list = await Store.listOPFSBackups();
    if (!list.length) {
      return this.toast('Nessuna copia locale presente — creane una con il pulsante accanto', 'info');
    }
    const righe = list.map(b => `<tr>
      <td class="mono">${this._esc(b.name)}</td>
      <td class="mono">${(b.size / 1024).toFixed(0)} KB</td>
      <td>${b.modified ? new Date(b.modified).toLocaleString('it-IT') : '—'}</td>
      <td><button class="btn btn-sm btn-accent" onclick="App.restoreOPFSBackup('${this._esc(b.name)}')">♻ Ripristina</button></td>
    </tr>`).join('');
    this.showModal(
      `🗂 Copie locali disponibili (${list.length})`,
      `<div class="mov-preview mov-preview-warn" style="margin-bottom:0.7rem">
        Queste copie stanno sullo <strong>stesso disco e nello stesso profilo browser</strong> del database.
        Servono a rimediare a un errore recente, non a un guasto della macchina: per quello serve la copia su OneDrive.<br>
        Contengono giacenze, anagrafiche, ubicazioni e quarantene, <strong>non il registro movimenti</strong>:
        il ripristino riporta indietro lo stato del magazzino e <strong>lascia intatto lo storico</strong>.
      </div>
      <div style="overflow-x:auto"><table class="sx-table">
        <thead><tr><th>File</th><th>Dimensione</th><th>Data</th><th style="width:120px">Azione</th></tr></thead>
        <tbody>${righe}</tbody></table></div>`,
      '<button class="btn" onclick="App.closeModal()">Chiudi</button>'
    );
  },

  async restoreOPFSBackup(filename) {
    try {
      const testo = await Store.readOPFSBackup(filename);
      const pacchetto = JSON.parse(testo);
      const check = Store.verifyExportPackage(pacchetto);
      const c = pacchetto._counts || Store._countsOf(pacchetto);
      if (!await Dialog.confirm({
        title: 'Ripristinare questa copia locale?',
        message: (check.ok ? '' : 'Verifica: ' + check.problemi.join(' · ') + '\n\n') +
          'I dati attualmente presenti verranno sostituiti. Verrà prima scaricato un export dello stato attuale.',
        details: Dialog.kv([
          ['File', filename],
          ['Movimenti', Number(c.mov_log || 0).toLocaleString('it-IT')],
          ['Giacenze', Number(c.inventory || 0).toLocaleString('it-IT')]
        ]),
        confirmLabel: 'Ripristina', danger: true
      })) return;
      await this.exportData();
      await Store.importAll(pacchetto, 'overwrite');
      this.closeModal();
      this.renderSidebar();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`♻ Ripristino da ${filename} completato`, 'success');
    } catch (err) {
      console.error('[WM] ripristino OPFS:', err);
      this.toast(`Ripristino non riuscito: ${err.message}`, 'error');
    }
  },

  async opfsBackupNow() {
    try {
      const r = await Store.writeOPFSBackup();
      this.toast(`💾 Copia locale creata — ${(r.size/1024).toFixed(1)} KB`, 'success');
      this.renderConfig();
    } catch (err) {
      this.toast(`Copia locale non riuscita: ${err.message}`, 'error');
    }
  },

  /* schedula auto-backup OPFS in background */
  async _scheduleAutoBackup() {
    try {
      const result = await Store.checkAutoBackup();
      if (result) {
        this.toast(`💾 Backup automatico creato — ${(result.size/1024).toFixed(1)} KB`, 'info');
      }
    } catch (err) {
      console.warn('[WM] _scheduleAutoBackup error:', err);
    }
  },

  async _checkStorageQuota() {
    const est = await Store.estimateUsage();
    if (est && est.pct != null && est.pct > 80) {
      this.toast(`⚠ Spazio DB al ${est.pct.toFixed(0)}% — considera un export e cleanup`, 'warning');
    }
  },

  // ── Routing views ──
  switchView(view) {
    this.currentView = view;
    if (view === 'dashboard') this._showRegistry = false;
    this.closeSearchPop();
    document.querySelectorAll('.nav-btn, .mob-tab, .hdr-icon-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    for (const id of ['Dashboard','Map','Movimenta','Tasks','Archive','Config']) {
      document.getElementById('view' + id)?.classList.toggle('hidden', view !== id.toLowerCase());
    }
    if (view === 'dashboard') this.renderDashboard();
    else if (view === 'tasks') this.renderTasks();
    else if (view === 'movimenta') this.renderMovimenta();
    else if (view === 'archive') this.renderArchive();
    else if (view === 'config') this.renderConfig();
    else if (view === 'map') {
      if (!this.currentSite) {
        const first = Store.getSites()[0];
        const firstZone = first?.zones?.find(z => z.active);
        if (firstZone) this.openZone(first.id, firstZone.id);
        else document.getElementById('mapContainer').innerHTML = '<div class="empty-state"><div class="empty-icon">🗺</div><p>Nessuna zona configurata — vai in Configurazione</p></div>';
      } else {
        this.renderMap();
      }
    }
  },

  _SIDEBAR_KEY: 'wm_sidebar_collapsed',

  toggleSidebar(force = null) {
    const collapsed = force === null
      ? !document.body.classList.contains('sidebar-collapsed')
      : Boolean(force);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    try { localStorage.setItem(this._SIDEBAR_KEY, collapsed ? '1' : '0'); } catch {}
    if (this.currentView === 'map' && this.currentSite) {
      setTimeout(() => this.renderMap(), 240);
    }
  },

  _loadSidebarState() {
    try {
      if (localStorage.getItem(this._SIDEBAR_KEY) === '1') {
        document.body.classList.add('sidebar-collapsed');
      }
    } catch { /* localStorage disabilitato → colonna aperta, che e' il default */ }
  },

  _syncHeaderHeight() {
    const h = document.querySelector('.app-header')?.offsetHeight;
    if (h) document.documentElement.style.setProperty('--hdr-h', `${h}px`);
  },

  // ── Sidebar ──
  renderSidebar() {
    const el = document.getElementById('sidebarContent');
    const sites = Store.getSites();
    if (!sites.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Nessun sito</p><button class="btn btn-sm btn-primary" style="margin-top:0.5rem" onclick="App.switchView(\'config\')">+ Configura</button></div>';
      return;
    }
    let html = '';
    for (const site of sites) {
      const zones = (site.zones || []).filter(z => z.active);
      const stats = Store.getSiteStats(site.id);
      const isOpen = this.currentSite === site.id;
      html += `<div class="site-group">
        <div class="site-header" onclick="App.toggleSite('${site.id}')">
          <span class="arrow ${isOpen ? 'open' : ''}">▶</span>
          <span class="site-badge">${this._esc(site.id)}</span>
          <span class="site-name truncate" title="${this._esc(site.name)}">${this._esc(site.name)}</span>
          <span class="site-count">${stats.total}</span>
        </div>
        <div class="zone-list ${isOpen ? '' : 'hidden'}">`;
      for (const zone of zones) {
        const ico = zone.type === 'RACK' ? '▦' : zone.type === 'FLOOR' ? '▤' : '▣';
        const isActive = this.currentZone === zone.id && this.currentSite === site.id;
        html += `<div class="zone-item ${isActive ? 'active' : ''}" onclick="App.openZone('${site.id}','${zone.id}')">
          <span class="zone-type-icon zone-type-${zone.type.toLowerCase()}">${ico}</span>
          <span class="truncate">${this._esc(zone.name)}</span>
        </div>`;
      }
      if (!zones.length) html += '<div style="padding:0.4rem 0.75rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">Nessuna zona</div>';
      html += `<div class="zone-item" onclick="App.showAddZoneModal('${site.id}')" style="color:var(--sx-accent)">
        <span>+</span><span>Aggiungi zona</span>
      </div>`;
      html += '</div></div>';
    }
    el.innerHTML = html;
  },

  toggleSite(siteId) {
    this.currentSite = this.currentSite === siteId ? null : siteId;
    this.renderSidebar();
  },

  openZone(siteId, zoneId) {
    this.currentSite = siteId;
    this.currentZone = zoneId;
    const zone = Store.getZone(siteId, zoneId);
    if (zone?.type === 'RACK' && zone.levels?.length) this.currentLevel = zone.levels[0];
    this.switchView('map');
    this.renderSidebar();
  },

  _fmtKg(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  },

  _isoToIt(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  /* HTML escape contro XSS */
  _esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  _payload(obj) {
    return encodeURIComponent(JSON.stringify(obj)).replace(/'/g, '%27');
  },

  _requireOperator(azione = 'questa operazione') {
    if (this._blockedByReadOnly()) return false;
    if (this.currentOperator) return true;
    this.toast(`Operatore non identificato — impossibile registrare ${azione}`, 'error');
    this._openIdentityGate({ initial: true });   // v2.7.0 [G6]
    return false;
  },

  /* v2.1.0 — Sostituto applicativo di prompt() per gli input testuali.
     Restituisce la stringa inserita oppure null se annullato. */
  _promptText({ title, message = '', placeholder = '', value = '', maxlength = 200 }) {
    const wrap = document.createElement('div');
    const input = document.createElement('input');
    input.className = 'input';
    input.id = 'dlgTextInput';
    input.type = 'text';
    input.autocomplete = 'off';
    input.maxLength = maxlength;
    input.placeholder = placeholder;
    input.value = value;
    input.style.marginTop = '0.5rem';
    // Il dialogo svuota il proprio contenitore alla chiusura: il valore va
    // catturato mentre l'utente digita, non dopo.
    this._lastTextValue = value;
    input.addEventListener('input', () => { this._lastTextValue = input.value; });
    wrap.appendChild(input);
    return Dialog.confirm({
      title, message, details: wrap,
      confirmLabel: 'Conferma', icon: '\u270E',
      focusTarget: 'dlgTextInput'
    }).then(ok => (ok ? (this._lastTextValue || '') : null))
      .catch(() => null);
  },

  /* Maschera live: rimuove i non-numerici e inserisce le barre durante la digitazione */
  _dateMaskInput(el) {
    const digits = el.value.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    el.value = out;
  },

  /* Alla perdita di focus (o su Invio) normalizza la visualizzazione:
     espande l'anno a 2 cifre e riallinea le barre. Non tocca input non validi. */
  _dateMaskBlur(el) {
    const iso = this._dateITtoISO(el.value);
    if (iso) el.value = this._dateISOtoIT(iso);
  },

  _dateITtoISO(value, warnLabel = null) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    let dd, mm, yyyy;
    if (digits.length === 6) { dd = digits.slice(0, 2); mm = digits.slice(2, 4); yyyy = '20' + digits.slice(4); }
    else if (digits.length === 8) { dd = digits.slice(0, 2); mm = digits.slice(2, 4); yyyy = digits.slice(4); }
    else {
      if (warnLabel) this.toast(`${warnLabel}: data incompleta — digitare ggmmaa oppure ggmmaaaa`, 'warning');
      return null;
    }
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    const dt = new Date(y, m - 1, d);
    const valid = y >= 2000 && y <= 2199 && m >= 1 && m <= 12 && d >= 1 &&
      dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    if (!valid) {
      if (warnLabel) this.toast(`${warnLabel}: data non valida (${dd}/${mm}/${yyyy})`, 'warning');
      return null;
    }
    return `${yyyy}-${mm}-${dd}`;
  },

  /* ISO yyyy-mm-dd (o legacy yyyy-mm) → gg/mm/aaaa per la visualizzazione nei campi */
  _dateISOtoIT(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(iso).trim());
    if (!m) return String(iso);
    return `${m[3] || '01'}/${m[2]}/${m[1]}`;
  },

  /* Normalizza input scanner barcode (layout IT vs US) */
  _normScan(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value;
    el.value = before.replace(/['\u2018\u2019`]/g, '-').toUpperCase();
    if (el.value !== before) {
      const diff = el.value.length - before.length;
      try { el.setSelectionRange(pos + diff, pos + diff); } catch {}
    }
  },

  _getLocInfo(code) {
    for (const site of Store.getSites()) {
      for (const zone of (site.zones || []).filter(z => z.active)) {
        if (Store.generateLocations(site.id, zone.id).find(l => l.code === code)) {
          return { siteName: site.name, zoneName: zone.name, status: Store.getLocationStatus(code), itemCount: Store.getItemsAtLocation(code).length };
        }
      }
    }
    return null;
  },

  _previewLoc(inputId, previewId) {
    const code = Validate.clean(document.getElementById(inputId)?.value, true).replace(/'/g, '-');
    const el = document.getElementById(previewId);
    if (!el) return;
    if (!code || code.length < 3) { el.innerHTML = ''; return; }
    const info = this._getLocInfo(code);
    if (info) {
      const cls = info.status === 'blocked' ? 'err' : info.status === 'occupied' ? 'ok' : info.status === 'reserved' ? 'warn' : '';
      el.innerHTML = `<div class="mov-preview ${cls ? 'mov-preview-'+cls : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><span class="mono" style="font-weight:700">${this._esc(code)}</span>
          <span style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-left:0.4rem">${this._esc(info.siteName)} · ${this._esc(info.zoneName)}</span></div>
          <div><span class="badge badge-${info.status === 'occupied' ? 'green' : info.status === 'blocked' ? 'red' : info.status === 'reserved' ? 'amber' : 'muted'}">${info.status}</span>
          <span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-left:0.3rem">${info.itemCount} item</span></div>
        </div>
      </div>`;
    } else if (code.length >= 5) {
      el.innerHTML = `<div class="mov-preview mov-preview-err">⚠ "${this._esc(code)}" non trovata</div>`;
    } else { el.innerHTML = ''; }
  },

  /* Modal universale selezione ubicazione */
  /* L'overlay ha un id SUO, e non quello di `showModal`. Dalla 1.4.3 questo
     selettore si apre anche da dentro una modale — la maschera di creazione
     di un'attività — e due overlay con lo stesso `modalOverlay` sono due
     elementi che `getElementById` non distingue: restituisce il primo, cioè
     la maschera sotto, e `closeModal()` chiudeva quella lasciando in piedi
     il selettore. Stessa forma di `_showReleaseDestDialog`. */
  _pickLoc(targetInputId, callbackName) {
    document.getElementById('pickLocOverlay')?.remove();
    const sites = Store.getSites();
    let html = '<div style="max-height:400px;overflow-y:auto">';
    for (const site of sites) {
      for (const zone of (site.zones || []).filter(z => z.active)) {
        const locs = Store.generateLocations(site.id, zone.id);
        const avail = locs.filter(l => { const s = Store.getLocationStatus(l.code); return s !== 'blocked' && s !== 'disabled'; });
        if (!avail.length) continue;
        html += `<div style="margin-bottom:0.5rem"><div style="font-size: var(--md-sys-typescale-label-small-size);font-weight:700;color:var(--sx-text-muted);text-transform:uppercase;margin-bottom:0.2rem">${this._esc(site.id)} · ${this._esc(zone.name)} (${avail.length})</div>`;
        for (const loc of avail.slice(0, 40)) {
          const st = Store.getLocationStatus(loc.code);
          const ic = Store.getItemsAtLocation(loc.code).length;
          const cb = callbackName ? `;App.${callbackName}()` : '';
          html += `<div class="search-result-item" onclick="document.getElementById('${targetInputId}').value='${loc.code}';App._closePickLoc()${cb}">
            <span class="mono" style="font-weight:700">${this._esc(loc.code)}</span>
            <span style="margin-left:auto;font-size: var(--md-sys-typescale-label-small-size)"><span class="badge badge-${st === 'occupied' ? 'green' : st === 'reserved' ? 'amber' : 'muted'}">${st}</span>${ic ? ' · ' + ic + ' item' : ''}</span>
          </div>`;
        }
        if (avail.length > 40) html += `<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);padding:0.2rem 0.5rem">... e altre ${avail.length - 40}</div>`;
        html += '</div>';
      }
    }
    if (html === '<div style="max-height:400px;overflow-y:auto">') html += '<div class="empty-state"><p>Nessuna ubicazione disponibile</p></div>';
    html += '</div>';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'pickLocOverlay';
    overlay.onclick = (e) => { if (e.target === overlay) this._closePickLoc(); };
    overlay.innerHTML = `<div class="modal">
      <div class="modal-header"><h2>📍 Seleziona Ubicazione</h2><button class="btn btn-sm btn-icon btn-ghost" onclick="App._closePickLoc()">✕</button></div>
      <div class="modal-body">${html}</div>
    </div>`;
    document.body.appendChild(overlay);
  },

  _closePickLoc() { document.getElementById('pickLocOverlay')?.remove(); },

  _searchLimits: { items: 50, locs: 30, arts: 30 },
  _searchHits: [],        // risultati appiattiti nell'ordine di visualizzazione
  _searchSel: -1,         // indice della riga evidenziata (navigazione a frecce)
  _searchOutsideHandler: null,

  /* Criteri identici alla v2.6.0. Nessun filtro aggiunto, nessuno tolto. */
  _searchAll(q) {
    const items = Store.findItemLocations(q);
    // Ricerca ubicazioni
    const locs = [];
    const qUpper = q.toUpperCase();
    for (const site of Store.getSites()) {
      for (const zone of (site.zones || []).filter(z => z.active)) {
        for (const loc of Store.generateLocations(site.id, zone.id)) {
          if (loc.code.includes(qUpper)) {
            locs.push({ ...loc, siteName: site.name, zoneName: zone.name, status: Store.getLocationStatus(loc.code), itemCount: Store.getItemsAtLocation(loc.code).length });
          }
        }
      }
    }
    // Articoli in anagrafica
    const arts = Store.getArticles().filter(a =>
      a.code.toLowerCase().includes(q.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(q.toLowerCase())
    );
    return { items, locs, arts };
  },

  /* Il debounce protegge le anagrafiche grandi: con 11.000 articoli filtrare a
     ogni battuta significa filtrare dieci volte per una parola di dieci lettere. */
  _searchDebounced: null,
  _onSearchInput() {
    const input = document.getElementById('hdrSearchInput');
    const wrap = document.getElementById('hdrSearch');
    wrap?.classList.toggle('has-query', Boolean(input?.value));
    if (!this._searchDebounced) {
      this._searchDebounced = debounce(() => this._renderSearchPopup(), 180);
    }
    this._searchDebounced();
  },

  _onSearchFocus() {
    const q = Validate.clean(document.getElementById('hdrSearchInput')?.value);
    if (q && q.length >= 2) this._renderSearchPopup();
  },

  _onSearchKeydown(e) {
    const pop = document.getElementById('searchPop');
    const open = pop && !pop.hidden;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (open) this.closeSearchPop(); else this.clearSearch();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open || !this._searchHits.length) return;
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const n = this._searchHits.length;
      this._searchSel = (this._searchSel + delta + n) % n;
      this._highlightSearchSel();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!open) { this._renderSearchPopup(); return; }
      /* Senza selezione esplicita si apre il primo risultato: e' cio' che si
         aspetta chi digita un codice completo e batte Invio senza guardare. */
      const idx = this._searchSel >= 0 ? this._searchSel : 0;
      this._openSearchHit(idx);
    }
  },

  _highlightSearchSel() {
    const pop = document.getElementById('searchPop');
    if (!pop) return;
    const rows = pop.querySelectorAll('.search-hit');
    rows.forEach((r, i) => r.classList.toggle('sel', i === this._searchSel));
    rows[this._searchSel]?.scrollIntoView({ block: 'nearest' });
  },

  clearSearch() {
    const input = document.getElementById('hdrSearchInput');
    if (input) input.value = '';
    document.getElementById('hdrSearch')?.classList.remove('has-query');
    this.closeSearchPop();
    input?.focus();
  },

  closeSearchPop() {
    const pop = document.getElementById('searchPop');
    if (pop) { pop.hidden = true; pop.innerHTML = ''; }
    document.getElementById('hdrSearchInput')?.setAttribute('aria-expanded', 'false');
    this._searchHits = [];
    this._searchSel = -1;
    if (this._searchOutsideHandler) {
      document.removeEventListener('mousedown', this._searchOutsideHandler, true);
      this._searchOutsideHandler = null;
    }
  },

  _armSearchOutsideClose() {
    if (this._searchOutsideHandler) return;
    this._searchOutsideHandler = (ev) => {
      if (!document.getElementById('hdrSearch')?.contains(ev.target)) this.closeSearchPop();
    };
    document.addEventListener('mousedown', this._searchOutsideHandler, true);
  },

  _renderSearchPopup() {
    const pop = document.getElementById('searchPop');
    const input = document.getElementById('hdrSearchInput');
    if (!pop || !input) return;
    const q = Validate.clean(input.value);
    if (!q || q.length < 2) { this.closeSearchPop(); return; }

    const { items, locs, arts } = this._searchAll(q);
    const L = this._searchLimits;
    this._searchHits = [];
    this._searchSel = -1;

    const section = (icon, title, total, shown, body) => `
      <div class="search-pop-sec">
        <div class="search-pop-head"><span>${icon} ${title}</span><span class="search-pop-count">${total}</span></div>
        ${body}
        ${total > shown ? `<div class="search-pop-more">… altri ${total - shown} risultati: restringi la ricerca</div>` : ''}
      </div>`;

    // ── Item a magazzino ──
    let itemsHtml = '';
    for (const it of items.slice(0, L.items)) {
      const i = this._searchHits.length;
      this._searchHits.push({ kind: 'loc', code: it.location_code });
      const qty = it.qty || 1;
      itemsHtml += `<div class="search-hit" role="option" data-idx="${i}" onclick="App._openSearchHit(${i})">
        <div class="search-hit-main">
          <div><span class="search-hit-code">${this._esc(it.article_code)}</span> <span class="search-hit-desc">${this._esc(it.article_description || '')}</span></div>
          <div class="search-hit-sub">Lotto <strong>${this._esc(it.lot_code)}</strong> · 📍 <span class="search-hit-loc">${this._esc(it.location_code)}</span>${it.expiry_date ? ` · Scad. ${this._esc(it.expiry_date)}` : ''}</div>
        </div>
        <span class="search-hit-qty">${qty} Coll.</span>
        <span class="search-hit-go">→</span>
      </div>`;
    }
    if (!itemsHtml) itemsHtml = '<div class="search-pop-empty">Nessun item a magazzino</div>';

    // ── Ubicazioni ──
    let locsHtml = '';
    for (const l of locs.slice(0, L.locs)) {
      const i = this._searchHits.length;
      this._searchHits.push({ kind: 'loc', code: l.code });
      const badge = l.status === 'occupied' ? 'green' : l.status === 'blocked' ? 'red' : l.status === 'reserved' ? 'amber' : 'muted';
      locsHtml += `<div class="search-hit" role="option" data-idx="${i}" onclick="App._openSearchHit(${i})">
        <div class="search-hit-main">
          <div><span class="search-hit-loc">${this._esc(l.code)}</span></div>
          <div class="search-hit-sub">${this._esc(l.siteName)} · ${this._esc(l.zoneName)}</div>
        </div>
        <span class="badge badge-${badge}">${l.status}</span>
        ${l.itemCount ? `<span class="search-hit-qty">${l.itemCount} item</span>` : ''}
        <span class="search-hit-go">→</span>
      </div>`;
    }
    if (!locsHtml) locsHtml = '<div class="search-pop-empty">Nessuna ubicazione</div>';

    let artsHtml = '';
    for (const a of arts.slice(0, L.arts)) {
      const where = Store.findItemLocations(a.code).filter(it => it.article_code === a.code);
      const i = this._searchHits.length;
      this._searchHits.push(
        where.length === 1 ? { kind: 'loc', code: where[0].location_code } : { kind: 'article', code: a.code, count: where.length }
      );
      const stock = where.length === 0
        ? '<span class="search-pop-empty" style="padding:0">non a magazzino</span>'
        : where.length === 1
          ? `📍 <span class="search-hit-loc">${this._esc(where[0].location_code)}</span>`
          : `📍 ${where.length} ubicazioni`;
      artsHtml += `<div class="search-hit" role="option" data-idx="${i}" onclick="App._openSearchHit(${i})">
        <div class="search-hit-main">
          <div><span class="search-hit-code">${this._esc(a.code)}</span> <span class="search-hit-desc">${this._esc(a.description)}</span></div>
          <div class="search-hit-sub">${stock}</div>
        </div>
        <span class="badge badge-muted">${this._esc(a.category || 'MP')}</span>
        ${where.length ? '<span class="search-hit-go">→</span>' : ''}
      </div>`;
    }
    if (!artsHtml) artsHtml = '<div class="search-pop-empty">Nessun articolo in anagrafica</div>';

    pop.innerHTML =
      section('📦', 'Item a magazzino', items.length, Math.min(items.length, L.items), itemsHtml) +
      section('📍', 'Ubicazioni', locs.length, Math.min(locs.length, L.locs), locsHtml) +
      section('📘', 'Articoli in anagrafica', arts.length, Math.min(arts.length, L.arts), artsHtml);
    pop.hidden = false;
    pop.scrollTop = 0;
    input.setAttribute('aria-expanded', 'true');
    this._armSearchOutsideClose();
  },

  _openSearchHit(idx) {
    const hit = this._searchHits[idx];
    if (!hit) return;
    if (hit.kind === 'loc') {
      /* Il campo si svuota ma il fuoco NON torna alla ricerca: si sta andando
         sulla mappa, e un cursore lampeggiante lassu' inviterebbe a ridigitare. */
      const input = document.getElementById('hdrSearchInput');
      if (input) input.value = '';
      document.getElementById('hdrSearch')?.classList.remove('has-query');
      this.closeSearchPop();
      this.goToLocation(hit.code);
      return;
    }
    /* Articolo su piu' ubicazioni: si riscrive la ricerca sul codice esatto,
       cosi' la sezione "Item a magazzino" elenca proprio quelle ubicazioni. */
    const input = document.getElementById('hdrSearchInput');
    if (input) {
      input.value = hit.code;
      input.focus();
      document.getElementById('hdrSearch')?.classList.add('has-query');
    }
    this._renderSearchPopup();
    this.toast(`${hit.code} presente in ${hit.count} ubicazioni — scegli quale aprire`, 'info');
  },

  goToLocation(code) {
    const parts = code.split('-');
    const siteId = parts[0];
    const site = Store.getSite(siteId);
    if (!site) return;
    for (const zone of (site.zones || []).filter(z => z.active)) {
      if (Store.generateLocations(siteId, zone.id).find(l => l.code === code)) {
        this.currentSite = siteId;
        this.currentZone = zone.id;
        if (zone.type === 'RACK') {
          const last = parts[parts.length - 1];
          if ((zone.levels || []).includes(last)) this.currentLevel = last;
        }
        this.selectedLocation = code;
        this.switchView('map');
        setTimeout(() => {
          this.renderDetail(code);
          document.getElementById('detailPanel').classList.remove('collapsed');
          this._flashLocation(code);
        }, 50);
        this.renderSidebar();
        return;
      }
    }
  },

  /* Lampeggio della cella raggiunta: su una griglia di trecento ubicazioni la
     sola selezione non basta a farsi trovare dall'occhio. */
  _flashLocation(code) {
    const cells = document.querySelectorAll(`[data-loc="${CSS.escape(code)}"]`);
    if (!cells.length) return;
    cells[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    for (const c of cells) {
      c.classList.remove('loc-cell--flash');
      void c.offsetWidth;                 // forza il restart dell'animazione
      c.classList.add('loc-cell--flash');
      setTimeout(() => c.classList.remove('loc-cell--flash'), 1400);
    }
  },

  _arcType: 'all',
  _arcText: '',
  _arcFrom: '',
  _arcTo: '',

  _ARC_KINDS: {
    ddt:      { label: 'DDT di uscita',    icon: '🚚' },
    disposal: { label: 'Verbali smalt.',   icon: '🗑️' },
    nc:       { label: 'Cartelli NC',      icon: '🚫' },
    pick:     { label: 'Report prelievo',  icon: '📋' }
  },

  /* Le quattro sorgenti ridotte a una forma sola. Ogni riga sa da dove
     viene, come si chiama e quale funzione la ristampa. */
  _archiveRows() {
    const rows = [];
    const esc = (v) => this._esc(String(v ?? ''));

    for (const d of Store.getAllOutbound()) {
      const colli = (d.lines || []).reduce((s, l) => s + (l.qty || 1), 0);
      const stato = d.status === 'pending' ? { lbl: 'Pendente', cls: 'badge-amber' }
                  : d.status === 'evaded'  ? { lbl: 'Evaso',    cls: 'badge-green' }
                  : { lbl: 'Annullato', cls: 'badge-muted' };
      rows.push({
        kind: 'ddt',
        ts: d.evaded_at || d.created_at || 0,
        num: d.ddt_num || d.doc_id,
        title: d.destination || '—',
        sub: `${(d.lines || []).length} righe · ${colli} Coll.${d.carrier ? ' · ' + d.carrier : ''}`,
        stato,
        search: `${d.ddt_num} ${d.doc_id} ${d.destination} ${d.carrier || ''} ${(d.lines || []).map(l => l.article_code + ' ' + l.lot_code).join(' ')}`,
        print: `App._printDDT('${esc(d.doc_id)}')`
      });
    }

    for (const v of Store.getDisposals()) {
      rows.push({
        kind: 'disposal',
        ts: v.created_at || 0,
        num: v.doc_id,
        title: `${v.article_code} · L:${v.lot_code}`,
        sub: `${v.qty} Coll. · ${v.reason || '—'}`,
        stato: { lbl: 'Emesso', cls: 'badge-green' },
        search: `${v.doc_id} ${v.article_code} ${v.lot_code} ${v.location_code} ${v.reason || ''} ${v.operator || ''}`,
        print: `App._printDisposal('${esc(v.doc_id)}')`
      });
    }

    for (const q of Store.getQuarantineHistory()) {
      rows.push({
        kind: 'nc',
        ts: q.created_at || 0,
        num: q.q_id,
        title: `${q.article_code} · L:${q.lot_code}`,
        sub: `${q.qty || 1} Coll.${q.partial ? ' (parziale)' : ''} · 📍 ${q.blocked_location} · ${q.reason || '—'}`,
        stato: q.status === 'active'
          ? { lbl: 'Attiva', cls: 'badge-amber' }
          : { lbl: 'Rilasciata', cls: 'badge-green' },
        search: `${q.q_id} ${q.article_code} ${q.lot_code} ${q.blocked_location} ${q.original_location} ${q.reason || ''} ${q.operator || ''}`,
        print: `App._printNCCard('${esc(q.q_id)}')`
      });
    }

    for (const p of Store.getPickReports()) {
      rows.push({
        kind: 'pick',
        ts: p.closed_at || p.ended_at || 0,
        num: p.odp_num || p.doc_id,
        title: p.odp_num ? `Ordine ${p.odp_num}` : 'Prelievo senza numero',
        sub: `${(p.rows || []).length} righe · ${p.operator || '—'}`,
        stato: { lbl: 'Chiuso', cls: 'badge-green' },
        search: `${p.doc_id} ${p.odp_num || ''} ${p.operator || ''} ${(p.rows || []).map(r => r.article_code + ' ' + r.lot_code).join(' ')}`,
        print: `App._printPickArchive('${esc(p.doc_id)}')`
      });
    }

    return rows.sort((a, b) => b.ts - a.ts);
  },

  renderArchive() {
    const el = document.getElementById('viewArchive');
    if (!el) return;

    let rows = this._archiveRows();
    const totale = rows.length;

    if (this._arcType !== 'all') rows = rows.filter(r => r.kind === this._arcType);
    const testo = this._arcText.trim().toUpperCase();
    if (testo) rows = rows.filter(r => (r.search || '').toUpperCase().includes(testo));
    if (this._arcFrom) {
      const da = new Date(this._arcFrom + 'T00:00:00').getTime();
      rows = rows.filter(r => r.ts >= da);
    }
    if (this._arcTo) {
      const a = new Date(this._arcTo + 'T23:59:59').getTime();
      rows = rows.filter(r => r.ts <= a);
    }

    const chip = (id, lbl) => `<button class="config-tab ${this._arcType === id ? 'active' : ''}"
      onclick="App._arcType='${id}';App.renderArchive()">${lbl}</button>`;

    const conteggi = {};
    for (const r of this._archiveRows()) conteggi[r.kind] = (conteggi[r.kind] || 0) + 1;

    el.innerHTML = `
      <h1 style="font-size: var(--md-sys-typescale-title-large-size);color:var(--sx-primary);font-weight:700;margin-bottom:0.35rem">🗂 Archivio documenti</h1>
      <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);margin-bottom:0.75rem;line-height:1.55">
        Ogni documento emesso dall'applicativo, aperto o chiuso, ristampabile per tutta la durata di conservazione.
        La ristampa rilegge il documento archiviato: il foglio esce identico a quello del giorno di emissione.
      </p>

      <div class="config-tabs" style="margin-bottom:0.6rem">
        ${chip('all', `Tutti (${totale})`)}
        ${Object.entries(this._ARC_KINDS).map(([id, k]) =>
          chip(id, `${k.icon} ${k.label} (${conteggi[id] || 0})`)).join('')}
      </div>

      <div class="config-card" style="margin-bottom:0.6rem">
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:flex-end">
          <div class="form-group" style="flex:1;min-width:240px;margin-bottom:0">
            <label>Cerca</label>
            <input class="input" id="arcText" placeholder="Numero, articolo, lotto, destinatario, ubicazione…"
              value="${this._esc(this._arcText)}" oninput="App._arcText=this.value;App._arcRedraw()">
          </div>
          <div class="form-group" style="width:160px;margin-bottom:0">
            <label>Dal</label>
            <input class="input" type="date" id="arcFrom" value="${this._esc(this._arcFrom)}"
              onchange="App._arcFrom=this.value;App.renderArchive()">
          </div>
          <div class="form-group" style="width:160px;margin-bottom:0">
            <label>Al</label>
            <input class="input" type="date" id="arcTo" value="${this._esc(this._arcTo)}"
              onchange="App._arcTo=this.value;App.renderArchive()">
          </div>
          <button class="btn" onclick="App._arcReset()">✕ Azzera filtri</button>
        </div>
      </div>

      <div class="config-card">
        <h3>${rows.length} document${rows.length === 1 ? 'o' : 'i'}${rows.length !== totale ? ` su ${totale}` : ''}</h3>
        ${rows.length ? `<div style="overflow-x:auto">
          <table class="sx-table">
            <thead><tr>
              <th style="width:130px">Data</th>
              <th style="width:110px">Tipo</th>
              <th style="width:150px">Numero</th>
              <th>Riferimento</th>
              <th style="width:105px">Stato</th>
              <th style="width:60px"></th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td class="mono" style="white-space:nowrap">${r.ts ? this._fmtDateTime(r.ts) : '—'}</td>
                <td><span title="${this._esc(this._ARC_KINDS[r.kind].label)}">${this._ARC_KINDS[r.kind].icon} ${this._esc(this._ARC_KINDS[r.kind].label)}</span></td>
                <td class="mono" style="font-weight:600">${this._esc(r.num)}</td>
                <td>
                  <div style="font-weight:600">${this._esc(r.title)}</div>
                  <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)" class="truncate">${this._esc(r.sub)}</div>
                </td>
                <td><span class="badge ${r.stato.cls}">${this._esc(r.stato.lbl)}</span></td>
                <td><button class="btn btn-sm btn-ghost" onclick="${r.print}" title="Ristampa">🖨</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<div class="ct-empty">Nessun documento corrisponde ai filtri.</div>`}
      </div>`;
  },

  _arcRedraw() {
    clearTimeout(this._arcTimer);
    this._arcTimer = setTimeout(() => {
      const attivo = document.activeElement?.id;
      const pos = document.getElementById('arcText')?.selectionStart;
      this.renderArchive();
      if (attivo === 'arcText') {
        const campo = document.getElementById('arcText');
        campo?.focus();
        if (pos != null) campo?.setSelectionRange(pos, pos);
      }
    }, 180);
  },

  _arcReset() {
    this._arcType = 'all'; this._arcText = ''; this._arcFrom = ''; this._arcTo = '';
    this.renderArchive();
  },

  _printPickArchive(doc_id) {
    const snap = Store.getPickReports().find(p => p.doc_id === doc_id);
    if (!snap) return this.toast('Report non trovato in archivio', 'error');
    this._emitPickReport(snap, { reprint: true });
  },

  // ═══ Modals CRUD ═══
  showModal(title, bodyHtml, footerHtml = '') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalOverlay';
    overlay.onclick = (e) => { if (e.target === overlay) this.closeModal(); };
    overlay.innerHTML = `<div class="modal">
      <div class="modal-header"><h2>${title}</h2><button class="btn btn-sm btn-icon btn-ghost" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>`;
    document.body.appendChild(overlay);
  },
  closeModal() { document.getElementById('modalOverlay')?.remove(); },

  // ═══ Sync indicator + toast ═══
  updateSyncIndicator() {
    const meta = Store.getMeta();
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncText');
    const btn = document.getElementById('syncIndicator');
    if (!dot || !text) return;
    if (this._saving) return;   // durante il checkpoint comanda manualSave()
    const when = meta.lastModified
      ? new Date(meta.lastModified).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : 'mai';
    dot.classList.remove('saving');
    if (meta.unsavedChanges) {
      dot.classList.add('unsaved');
      text.textContent = 'Non salvato';
      if (btn) btn.title = `Ci sono modifiche non salvate — ultimo salvataggio: ${when}. Clicca per salvare ora.`;
    } else {
      dot.classList.remove('unsaved');
      text.textContent = 'Salvato';
      if (btn) btn.title = `Salvato — ultimo checkpoint: ${when}. Clicca per salvare di nuovo.`;
    }
  },

  _saving: false,
  async manualSave() {
    if (this._saving) return;
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncText');
    const btn = document.getElementById('syncIndicator');
    this._saving = true;
    dot?.classList.remove('unsaved');
    dot?.classList.add('saving');
    if (text) text.textContent = 'Salvataggio…';
    if (btn) { btn.disabled = true; btn.title = 'Checkpoint in corso…'; }
    try {
      await this._saveCheckpoint();   // riscontro e ridisegno stanno gia' li'
      dot?.classList.remove('error');
    } catch {
      dot?.classList.add('error');    // il messaggio d'errore l'ha gia' dato _saveCheckpoint
    } finally {
      this._saving = false;
      if (btn) btn.disabled = false;
      this.updateSyncIndicator();
    }
  },

  toast(message, type = 'info') {
    const kindMap = { success: 'ok', error: 'error', warning: 'warn', info: 'info' };
    const kind = kindMap[type] || 'info';
    const msg = String(message ?? '');
    const sep = msg.indexOf(' · ');
    const title = sep > 0 ? msg.slice(0, sep).trim() : msg;
    const detail = sep > 0 ? msg.slice(sep + 3).trim() : '';
    Feedback.signal(kind, title, detail);
  },

  UNDO_WINDOW_MS: 120000,
  _undoEntry: null,
  _undoTimer: null,

  /* actions: [{ op:'add'|'remove', loc, art, desc, lot, exp, notes, qty }] */
  _pushUndo(label, actions) {
    if (!Array.isArray(actions) || !actions.length) return;
    this._undoEntry = { label, actions, ts: Date.now() };
    clearInterval(this._undoTimer);
    this._undoTimer = setInterval(() => this._renderUndoBar(), 1000);
    this._renderUndoBar();
  },

  _undoValid() {
    return Boolean(this._undoEntry) && (Date.now() - this._undoEntry.ts) < this.UNDO_WINDOW_MS;
  },

  _undoBarHTML() {
    if (!this._undoValid()) return '';
    const left = Math.max(0, Math.ceil((this.UNDO_WINDOW_MS - (Date.now() - this._undoEntry.ts)) / 1000));
    return `<div class="undo-bar">
      <span style="font-size: var(--md-sys-typescale-body-large-size)">↩</span>
      <span class="undo-label">Ultima operazione: <strong>${this._esc(this._undoEntry.label)}</strong></span>
      <span class="undo-timer">${left}s</span>
      <button class="btn btn-sm btn-warning" onclick="App._undoLast()">ANNULLA</button>
    </div>`;
  },

  _renderUndoBar() {
    const host = document.getElementById('undoBarArea');
    if (!host) return;
    if (!this._undoValid()) {
      host.innerHTML = '';
      clearInterval(this._undoTimer);
      this._undoEntry = null;
      return;
    }
    host.innerHTML = this._undoBarHTML();
  },

  async _undoLast() {
    if (!this._undoValid()) {
      return this.toast('Finestra di annullamento scaduta — usare una rettifica inventariale', 'warning');
    }
    const entry = this._undoEntry;
    const ok = await Dialog.confirm({
      title: 'Annullare l\u2019ultima operazione?',
      message: 'Verra\u0300 eseguito il movimento inverso e registrato a log come rettifica. Nessun dato viene cancellato.',
      details: Dialog.kv([
        ['Operazione', entry.label],
        ['Righe da stornare', entry.actions.length]
      ]),
      confirmLabel: 'Storna operazione',
      danger: true
    });
    if (!ok) return;

    let done = 0;
    for (const a of entry.actions) {
      try {
        if (a.op === 'add') {
          /* 1.4.2 — lo storno rimette esattamente le UM che erano uscite.
             `a.qty_uom` assente lascia derivare dai colli pieni, che e' il
             caso di ogni storno registrato prima di questa versione. */
          /* 1.8 — e se lo storno conosce i colli usciti li rimette uno per
             uno: `a.packs` porta anche il collo che era stato aperto, che
             derivato dai colli pieni tornerebbe intero. */
          const r = await Store.addItem(a.loc, a.art, a.desc || '', a.lot, a.exp || '', a.notes || '', a.qty, a.qty_uom ?? null, a.packs ?? null);
          await this._logMov(MOV.FIX_IN, a.art, a.desc || '', a.lot, a.loc, null, '',
            `STORNO — ${entry.label}`, '', r.qty_before, a.qty, r.qty_after, r.qty_uom_delta);
        } else {
          /* 1.8 \u2014 i colli entrati si ritrovano per misura sulla riga di
             adesso; se uno non c'\u00e8 pi\u00f9, lo storno si ferma e lo dice invece
             di portarne via un altro. */
          const rigaOra = Store.getItemsAtLocation(a.loc).find(x => x.item_key === `${a.art}#${a.lot}`);
          const scelteStorno = a.packs ? Store.scelteDaColli(rigaOra, a.packs) : null;
          const r = await Store.removeItem(a.loc, `${a.art}#${a.lot}`, a.qty, a.qty_uom ?? null, scelteStorno);
          if (!r) throw new Error('item non piu\u0300 presente');
          await this._logMov(MOV.FIX_OUT, a.art, a.desc || '', a.lot, a.loc, null, '',
            `STORNO — ${entry.label}`, '', r._qty_before, r._qty_delta, r._qty_after, r._qty_uom_delta);
        }
        done++;
      } catch (err) {
        console.error('Storno riga fallito', err);
      }
    }
    this._undoEntry = null;
    clearInterval(this._undoTimer);
    this._renderUndoBar();
    this._refreshSessionLog();
    this.updateSyncIndicator();
    if (done === entry.actions.length) {
      this.toast(`✓ Operazione stornata (${done} righe) · rettifica registrata a log`, 'success');
    } else {
      this.toast(`Storno parziale: ${done}/${entry.actions.length} righe · verificare le giacenze`, 'warning');
    }
  },

  _primaryScanField: null,

  setPrimaryScanField(id) {
    this._primaryScanField = id || null;
    const el = id ? document.getElementById(id) : null;
    document.querySelectorAll('.scan-active').forEach(n => n.classList.remove('scan-active'));
    if (el) { el.classList.add('scan-active'); el.focus(); }
  },

  _focusKeeper(e) {
    if (Dialog.isOpen) return;
    if (this._gateOpen) return;   // v2.7.0 [G6] — col gate aperto i tasti sono suoi
    if (!this._primaryScanField) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length !== 1) return;                     // solo caratteri stampabili
    const ae = document.activeElement;
    const editable = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
    if (editable) return;
    const target = document.getElementById(this._primaryScanField);
    if (!target) return;
    e.preventDefault();
    target.focus();
    target.value += e.key;
  },

  _shortcuts(e) {
    if (Dialog.isOpen) return;
    /* v2.7.0 [G6] — Il gate di identita' e' un blocco: finche' e' aperto
       nessuna scorciatoia deve poter agire su cio' che sta sotto. */
    if (this._gateOpen) return;
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);

    if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const input = document.getElementById('hdrSearchInput');
      if (input) { input.focus(); input.select(); }
      return;
    }
    /* v2.7.0 [G4] — Ctrl+B apre e chiude la colonna Siti e Zone. */
    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      this.toggleSidebar();
      return;
    }

    if (e.key === 'Escape' && this._movMode) {
      e.preventDefault();
      this.cancelMov();
      this.renderMovimenta();
      this.toast('Operazione annullata', 'info');
      return;
    }
    const fnMap = {
      F2: ['io', 'in'], F3: ['pick', null], F4: ['inv', null],
      F6: ['io', 'out'], F7: ['quarantine', null], F8: ['shipping', null]
    };
    if (fnMap[e.key]) {
      e.preventDefault();
      const [mode, dir] = fnMap[e.key];
      if (this.currentView !== 'movimenta') this.switchView('movimenta');
      setTimeout(() => this.startMov(mode, dir), 60);
      return;
    }
    if (e.key === 'F9' && !typing && this._undoValid()) {
      e.preventDefault();
      this._undoLast();
    }
  }
};

/* LE VISTE ESTRATTE RIENTRANO IN `App`.

   `app.js` si scompone in blocchi, ma `App` resta un oggetto solo: l'indice e
   i gestori costruiti dentro le stringhe lo chiamano per nome. La guardia
   serve a una cosa sola — estrarre e' SPOSTARE. Un metodo rimasto anche di
   qua verrebbe sovrascritto in silenzio, e da quel momento girerebbero due
   versioni della stessa maschera con una sola visibile. */
for (const vista of [VistaDestinatari, VistaParametri, VistaCompiti, VistaCampionamento, VistaMovimenta, VistaPosiziona, VistaSmaltimento, VistaPrelievo, VistaPercorso, VistaRapportoPrelievo, VistaInventario, VistaQuarantena, VistaSpedizioni, VistaDocumento, VistaMappa, VistaGiacenze, VistaConfigOperatori, VistaConfigSiti, VistaConfigArticoli, VistaConfigDati, VistaConfigurazione, VistaCruscotto, VistaRegistro]) {
  for (const nome of Object.keys(vista)) {
    if (nome in App) throw new Error(`vista: ${nome} e' gia' in App`);
    App[nome] = vista[nome];
  }
}

export { App };
