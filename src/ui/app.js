/* 1.7 — SheetJS non si importa piu' in cima: e' 864 KB su 1,61 MB, e serve
   sette volte in tutto il file. `caricaExcel()` lo prende quando serve, una
   volta sola. Chi rimette qui `import * as XLSX from 'xlsx'` se lo riporta
   dentro al chunk principale e annulla la 1.7 — vedi `modules/excel.ts`. */
import { caricaExcel } from '../modules/excel';
import { LOG_RETENTION_DAYS, LOG_RETENTION_MS, MOV, MOV_LABELS } from '../core/costanti';
import { debounce, _h } from '../core/utils';
import { Persistence } from '../core/persistence/index';
import { Validate } from '../modules/validate';
import { pickupAlertStatus } from '../modules/pickupAlert';
import { OdpParser } from '../modules/odpParser';
import { ScanGuard } from '../modules/scanGuard';
import { Auth } from '../modules/auth';
import { Session } from '../modules/session';
import { Feedback } from './feedback.js';
import { Dialog } from './dialog.js';
import { Tabs } from './tabs.js';
import { Store } from '../core/store';
import { PickRoute } from '../modules/pickRoute.js';
import { Vault } from '../modules/vault';
import {
  ALLERGENI, CLASSI_TEMPERATURA, CERTIFICAZIONI,
  leggiAllergeni, leggiCodici, scriviAllergeni, leggiCertificazioni, scriviCertificazioni,
  leggiClasseTemperatura, etichettaAllergene, etichettaClasse,
  etichettaCertificazione, fogliValoriAmmessi,
} from '../modules/anagrafica';
import { etichettaDi } from '../modules/parametri';
import {
  normalizzaNome as normalizzaNomeRcp, destinazionePredefinita, descriviDestinazione,
} from '../modules/destinatari';
import {
  UNITA_MISURA, etichettaUnita, formattaQuantita, descrivi as descriviColli,
  validaConfigurazione, valoriAmmessi as valoriAmmessiUM,
} from '../modules/misure';
/* 1.8 — `descriviColli` qui sopra e' la suddivisione CALCOLATA della 1.4.2, e
   questi sono l'elenco DICHIARATO: due cose diverse con un nome che si
   somiglia, e per questo portano alias distinti. */
import {
  espandi as espandiColli, validaDichiarazione, descriviColli as descriviElenco,
  totaleUom as totaleUomElenco, verificaColli as verificaElenco,
  preleva as prelevaElenco,
} from '../modules/colli';

import { VistaDestinatari } from './views/destinatari';
import { VistaParametri } from './views/parametri';
import { VistaCompiti } from './views/compiti';
import { VistaCampionamento } from './views/campionamento';
import { VistaMovimenta } from './views/movimenta';
import { VistaPosiziona } from './views/posiziona';

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

  // ── Dashboard ──
  renderDashboard() {
    const el = document.getElementById('viewDashboard');
    if (this._showRegistry) {
      el.innerHTML = this._renderMovRegistry();
      this._filterRegistry();
      return;
    }

    const sites = Store.getSites();
    const kpi = Store.computeKPIs();
    const meta = Store.getMeta();

    const sparkline = (vals, w = 80, h = 22, color = 'var(--md-sys-color-primary)') => {
      if (!vals.length || vals.every(v => v === 0)) return `<svg class="kpi-sparkline" width="${w}" height="${h}"></svg>`;
      const max = Math.max(...vals, 1);
      const step = w / Math.max(vals.length - 1, 1);
      const pts = vals.map((v, i) => ({ x: i * step, y: h - 1 - (v / max) * (h - 3) }));
      const last = pts[pts.length - 1];
      return `<svg class="kpi-sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
        <path d="${this._smoothPath(pts)}" style="fill:none;stroke:${color};stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round"/>
        <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.2" style="fill:${color}"/>
      </svg>`;
    };

    const dailyVals = kpi.dailyTrend.map(d => d.total);

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">
        <div>
          <h1 class="dash-h1">Dashboard Operativa</h1>
          <p class="dash-sub">Ultimo salvataggio: ${meta.lastModified ? new Date(meta.lastModified).toLocaleString('it-IT') : 'Mai'}</p>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <!-- v2.7.0 [G3] — "Salva ora" ed "Export JSON" sono usciti di qui:
               il primo e' diventato l'indicatore in barra, il secondo vive in
               Configurazione -> Dati insieme agli altri comandi di esportazione. -->
          <button class="btn btn-sm" onclick="App._showRegistry=true;App.renderDashboard()">📋 Registro Movimenti</button>
        </div>
      </div>

      <!-- v2.4.5 [Q1] — Scorciatoie: le azioni prima degli indicatori -->
      ${this._renderQuickActions()}

      <!-- KPI cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Ubicazioni totali</div>
          <div class="kpi-value">${kpi.totalLocs}</div>
          <div class="kpi-sub">${kpi.occPct}% occupate · ${kpi.emptyLocs} libere</div>
        </div>
        <div class="kpi-card k-success">
          <div class="kpi-label">Item a magazzino</div>
          <div class="kpi-value">${kpi.totalItems}</div>
          <div class="kpi-sub">in ${kpi.occupiedLocs} ubicazioni</div>
        </div>
        <div class="kpi-card k-warning">
          <div class="kpi-label">Movimenti oggi</div>
          <div class="kpi-value">${kpi.todayMov}</div>
          <div class="kpi-sub">${kpi.todayPick} prelievi</div>
          ${sparkline(dailyVals, 90, 22, 'var(--sx-warning)')}
        </div>
        <div class="kpi-card k-danger">
          <div class="kpi-label">Bloccate / Riservate</div>
          <div class="kpi-value">${kpi.blockedLocs + kpi.reservedLocs}</div>
          <div class="kpi-sub">${kpi.blockedLocs} bloc · ${kpi.reservedLocs} ris · ${kpi.disabledLocs} disatt.</div>
        </div>
        <div class="kpi-card k-purple">
          <div class="kpi-label">Quarantena attiva</div>
          <div class="kpi-value">${Store.getActiveQuarantine().length}</div>
          <div class="kpi-sub">Non conformità aperte</div>
        </div>
        ${this._renderKpiPendingOutbound()}
        <div class="kpi-card">
          <div class="kpi-label">Accuratezza inventario</div>
          <div class="kpi-value">${kpi.accuracyPct}%</div>
          <div class="kpi-sub">${kpi.fixCount} correzioni su ${kpi.totalMovements} movimenti</div>
        </div>
      </div>

      ${this._renderIntegrityAlertsSection()}

      ${this._renderPickupAlertsSection()}

      ${Store.isFeatureOn('tasks') ? `<div class="panels-row">${this._renderTasksPanel()}</div>` : ''}

      <div class="panels-row">
        <!-- Andamento movimenti: serie temporale a curva morbida -->
        <div class="card">
          <div class="card-title">Andamento movimenti — ultimi 14 giorni</div>
          ${this._renderDailyBars(kpi.dailyTrend)}
        </div>

        <!-- Ripartizione per tipo: grafico a ciambella -->
        <div class="card">
          <div class="card-title">Ripartizione per tipo di movimento</div>
          ${this._renderTypeCounts(kpi.typeCounts, kpi.totalMovements)}
        </div>
      </div>

      <div class="panels-row">
        <!-- Occupazione per sito: anelli di riempimento -->
        <div class="card">
          <div class="card-title">Occupazione per sito</div>
          ${sites.length ? this._renderSiteOccupancy(sites) : '<div class="ct-empty">Nessun sito configurato. Aprire Configurazione per crearne uno.</div>'}
        </div>

        <!-- Classifica articoli movimentati -->
        <div class="card">
          <div class="card-title">Articoli piu' movimentati</div>
          ${kpi.topArticles.length ? this._renderTopArticles(kpi.topArticles) : '<div class="ct-empty">Nessun movimento registrato finora.</div>'}
        </div>
      </div>

      <!-- v2.4.3 [S1] — Sezioni operative: sola lettura + stampa -->
      <div class="panels-row">
        ${this._renderLastMovements(20)}
        ${this._renderProdOrders()}
      </div>

      <div class="panels-row">
        ${this._renderPendingDocs()}
        ${this._renderQuarantineList()}
      </div>

      <!-- v3.0.0 [M2] — I verbali di smaltimento sono documenti emessi come
           gli altri, e stanno dove stanno gli altri. -->
      <div class="panels-row">
        ${this._renderDisposalDocs()}
      </div>`;
    el.innerHTML = html;
  },

  _goOp(mode, sub = null) {
    this.switchView('movimenta');
    const run = () => {
      if (mode === 'io') { this.startMov('io', sub || 'in'); return; }
      this.startMov(mode);
      if (sub) this._pickSub(sub);
    };
    if (document.getElementById('movFormArea')) run();
    else setTimeout(run, 50);
  },

  _renderQuickActions() {
    const ops = [
      { mode: 'io',   sub: 'in',         color: 'var(--ct-cat-in)',   icon: '\u{1F4E6}',
        title: 'Carico / Scarico', sub_txt: 'Posiziona e smaltisci', key: 'F2' },
      { mode: 'pick', sub: 'cambio',     color: 'var(--ct-cat-move)', icon: '\u{1F504}',
        title: 'Trasferimento',  sub_txt: 'Cambio ubicazione',      key: 'F3' },
      { mode: 'pick', sub: 'produzione', color: 'var(--ct-cat-pick)', icon: '\u{1F3ED}',
        title: 'Prelievo ordini', sub_txt: 'Prelievo produzione',   key: 'F3' }
    ];
    const btns = ops.map(o => `<button type="button" class="qa-btn" style="--qa-c:${o.color}"
        onclick="App._goOp('${o.mode}'${o.sub ? `,'${o.sub}'` : ''})"
        aria-label="${this._esc(o.title)} — ${this._esc(o.sub_txt)}">
        <span class="qa-ico" aria-hidden="true">${o.icon}</span>
        <span class="qa-txt">
          <span class="qa-title">${this._esc(o.title)}</span>
          <span class="qa-sub">${this._esc(o.sub_txt)}</span>
        </span>
        <span class="qa-key" aria-hidden="true">${this._esc(o.key)}</span>
      </button>`).join('');
    return `<nav class="qa-bar" aria-label="Scorciatoie operazioni principali">${btns}</nav>`;
  },

  /* Etichette compatte per la colonna tipo: i nomi estesi non stanno in
     68px e troncati diventano ambigui ("Prelievo Pro...", "Posizioname..."). */
  _MOV_SHORT: {
    IN: 'ENTRATA', OUT: 'SMALT.', MOVE: 'CAMBIO U.', PICK: 'PRELIEVO',
    REPOS: 'RIPOSIZ.', 'FIX+': 'RETT. +', 'FIX-': 'RETT. −',
    QUAR: 'QUARANT.', QREL: 'RILASCIO', EDIT: 'MODIFICA',
    RET: 'RESO', SHIP: 'SPEDIZ.'
  },
  _movShort(type) { return this._MOV_SHORT[type] || type; },

  _fmtDateTime(ts) {
    return new Date(ts).toLocaleString('it-IT',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  },

  /* ── A) Ultimi 20 movimenti ──────────────────────────────────────── */
  _renderLastMovements(limit = 20) {
    const log = [...Store.getMovLog()].sort((a, b) => b.ts - a.ts).slice(0, limit);
    const head = `<div class="dl-head">
      <span class="dl-head-title">Ultimi movimenti</span>
      <span class="dl-badge">${log.length}</span>
      <button class="dl-btn" onclick="App._showRegistry=true;App.renderDashboard()"
        title="Apri il registro movimenti completo">Registro</button>
    </div>`;
    if (!log.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessun movimento registrato. Le operazioni compaiono qui appena eseguite.</div></div>`;
    }
    const rows = log.map(m => {
      const qty = m.qty_delta != null ? Math.abs(m.qty_delta) : null;
      const dest = m.dest_location ? ` → <span class="mono">${this._esc(m.dest_location)}</span>` : '';
      const ref = m.doc_ref ? ` · rif. ${this._esc(m.doc_ref)}` : '';
      return `<div class="dl-row" title="${this._esc((MOV_LABELS[m.type] || m.type) + ' — ' + (m.article_description || m.article_code))}">
        <span class="dl-tag" style="border-left-color:${this._movColor(m.type)}">${this._esc(this._movShort(m.type))}</span>
        <div class="dl-main">
          <div class="dl-p"><span class="mono">${this._esc(m.article_code || '—')}</span>${m.lot_code ? ' · lotto <span class="mono">' + this._esc(m.lot_code) + '</span>' : ''}</div>
          <div class="dl-s"><span class="mono">${this._esc(m.location_code || '—')}</span>${dest} · ${this._esc(m.user || 'n.d.')}${ref}</div>
        </div>
        <div class="dl-end">
          ${qty != null ? `<span class="dl-qty">${qty}</span>&nbsp;Coll.` : ''}
          <span>${this._esc(this._fmtDateTime(m.ts))}</span>
        </div>
      </div>`;
    }).join('');
    return `<div class="card">${head}<div class="dl-list">${rows}</div></div>`;
  },

  /* ── B) Ordini di produzione prelevati ───────────────────────────── */
  _groupProdOrders() {
    const map = new Map();
    for (const m of Store.getMovLog()) {
      if (m.type !== MOV.PICK && m.type !== 'PICK') continue;
      const ref = m.doc_ref || '(senza numero)';
      let g = map.get(ref);
      if (!g) { g = { ref, rows: 0, colli: 0, first: m.ts, last: m.ts, users: new Set(), articles: new Set() }; map.set(ref, g); }
      g.rows++;
      g.colli += m.qty_delta != null ? Math.abs(m.qty_delta) : 1;
      g.first = Math.min(g.first, m.ts);
      g.last = Math.max(g.last, m.ts);
      if (m.user) g.users.add(m.user);
      if (m.article_code) g.articles.add(m.article_code);
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
  },

  _renderProdOrders(limit = 30) {
    const all = this._groupProdOrders();
    const list = all.slice(0, limit);
    const head = `<div class="dl-head">
      <span class="dl-head-title">Ordini di produzione prelevati</span>
      <span class="dl-badge">${all.length}</span>
    </div>`;
    if (!list.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessun prelievo di produzione registrato. Gli ordini compaiono qui dopo la conferma del prelievo.</div></div>`;
    }
    const rows = list.map(g => {
      const users = [...g.users].join(', ') || 'n.d.';
      const sameDay = new Date(g.first).toDateString() === new Date(g.last).toDateString();
      const when = sameDay ? this._fmtDateTime(g.last) : `${this._fmtDateTime(g.first)} — ${this._fmtDateTime(g.last)}`;
      return `<div class="dl-row" title="Ordine ${this._esc(g.ref)}: ${g.rows} lotti, ${g.colli} colli, ${g.articles.size} articoli">
        <span class="dl-tag" style="border-left-color:var(--ct-cat-pick)">ORDINE</span>
        <div class="dl-main">
          <div class="dl-p"><span class="mono">${this._esc(g.ref)}</span></div>
          <div class="dl-s">${g.rows} lotti · ${g.articles.size} articoli · ${this._esc(users)} · ${this._esc(when)}</div>
        </div>
        <div class="dl-end"><span class="dl-qty">${g.colli}</span>&nbsp;Coll.</div>
        <button class="dl-btn" title="Stampa il report di prelievo dell'ordine ${this._esc(g.ref)}"
          onclick="App._printProdOrderFromLog('${encodeURIComponent(g.ref)}')">&#128424;</button>
      </div>`;
    }).join('');
    const foot = all.length > limit
      ? `<div class="dl-foot">Mostrati i ${limit} ordini più recenti su ${all.length} — il registro completo è in Registro Movimenti.</div>` : '';
    return `<div class="card">${head}<div class="dl-list">${rows}</div>${foot}</div>`;
  },

  async _printProdOrderFromLog(encodedRef) {
    const ref = decodeURIComponent(encodedRef);

    const snap = ref === '(senza numero)' ? null : Store.getPickReportByOdp(ref);
    if (snap) return this._emitPickReport(snap, { reprint: true });

    const res = await Store.queryMovements({ type: MOV.PICK, limit: 100000 });
    const movs = res.rows
      .filter(m => (m.doc_ref || '(senza numero)') === ref)
      .sort((a, b) => a.ts - b.ts);
    if (!movs.length) return this.toast('Ordine non trovato nel registro movimenti', 'error');

    this._emitPickReport(this._pickSnapFromLog(movs, ref), { reprint: true });
  },

  /* ── C) DDT di uscita pendenti ───────────────────────────────────── */
  _renderPendingDocs() {
    const docs = Store.getPendingOutbound()
      .map(d => ({ d, a: pickupAlertStatus(d) }))
      .sort((x, y) => x.a.sortKey - y.a.sortKey);
    const urgent = docs.filter(x => ['overdue', 'today'].includes(x.a.level)).length;
    const head = `<div class="dl-head">
      <span class="dl-head-title">DDT pendenti</span>
      <span class="dl-badge${urgent ? ' is-alert' : ''}">${docs.length}</span>
    </div>`;
    if (!docs.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessun documento aperto. I DDT registrati e non ancora evasi compaiono qui.</div></div>`;
    }
    const rows = docs.map(({ d, a }) => {
      const isRet = this._docIsReturn(d);
      const colli = (d.lines || []).reduce((s, l) => s + (l.qty || 0), 0);
      const dest = d.destination || 'destinatario non indicato';
      const causale = this._docCausaleLabel(d);
      return `<div class="dl-row" title="${this._esc(a.label)}">
        <span class="dl-tag" style="border-left-color:${isRet ? 'var(--ct-cat-ret)' : 'var(--ct-cat-ship)'}">${isRet ? 'RESO' : 'SPEDIZ.'}</span>
        <div class="dl-main">
          <div class="dl-p">DDT <span class="mono">${this._esc(d.ddt_num || '—')}</span> · ${this._esc(dest)}</div>
          <div class="dl-s">${this._esc(causale)} · ${(d.lines || []).length} righe · ${colli} Coll.${d.carrier ? ' · vett. ' + this._esc(d.carrier) : ''}${d.operator ? ' · ' + this._esc(d.operator) : ''}</div>
        </div>
        <span class="dl-chip" style="color:${a.color}">${this._esc(a.shortLabel)}</span>
        <button class="dl-btn" title="Stampa il documento ${this._esc(d.ddt_num || d.doc_id)}"
          onclick="App._printDDT('${this._esc(d.doc_id)}')">&#128424;</button>
      </div>`;
    }).join('');
    return `<div class="card">${head}<div class="dl-list">${rows}</div></div>`;
  },

  _renderDisposalDocs(limit = 20) {
    const all = Store.getDisposals();
    const list = all.slice(0, limit);
    const head = `<div class="dl-head">
      <span class="dl-head-title">Verbali di smaltimento</span>
      <span class="dl-badge">${all.length}</span>
    </div>`;
    if (!list.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessuno smaltimento registrato. I verbali compaiono qui appena emessi e restano ristampabili.</div></div>`;
    }
    const rows = list.map(v => `<div class="dl-row" title="${this._esc(v.reason || '')}">
        <span class="dl-tag" style="border-left-color:var(--ct-cat-out)">SMALT.</span>
        <div class="dl-main">
          <div class="dl-p"><span class="mono">${this._esc(v.article_code)}</span> · lotto <span class="mono">${this._esc(v.lot_code)}</span></div>
          <div class="dl-s"><span class="mono">${this._esc(v.doc_id)}</span> · ${this._esc(v.location_code)} · ${this._esc(v.reason || 'motivo n.d.')} · ${this._esc(v.operator || 'n.d.')}</div>
        </div>
        <div class="dl-end">
          <span class="dl-qty">${v.qty}</span>&nbsp;Coll.
          <span>${this._esc(this._fmtDateTime(v.created_at))}</span>
        </div>
        <button class="dl-btn" title="Ristampa il verbale ${this._esc(v.doc_id)}"
          onclick="App._printDisposal('${this._esc(v.doc_id)}')">&#128424;</button>
      </div>`).join('');
    return `<div class="card">${head}<div class="dl-list">${rows}</div></div>`;
  },

  _docCausaleLabel(d) {
    if (d.causale_label) return d.causale_label;
    const c = d.causale_id ? Store.getCausale(d.causale_id) : null;
    if (c) return c.label;
    return d.kind === 'RES' ? 'Reso a fornitore' : 'Vendita';
  },

  _docIsReturn(d) {
    if (d.causale_id) {
      const c = Store.getCausale(d.causale_id);
      if (c) return c.mov === 'RET';
    }
    if (d.causale_mov) return d.causale_mov === 'RET';
    return d.kind === 'RES';
  },

  /* ── D) Item in quarantena ───────────────────────────────────────── */
  _renderQuarantineList() {
    const list = [...Store.getActiveQuarantine()].sort((a, b) => a.created_at - b.created_at);
    const head = `<div class="dl-head">
      <span class="dl-head-title">Item in quarantena</span>
      <span class="dl-badge${list.length ? ' is-alert' : ''}">${list.length}</span>
    </div>`;
    if (!list.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessun item bloccato. Le non conformità aperte compaiono qui.</div></div>`;
    }
    const rows = list.map(q => {
      const days = Math.floor((Date.now() - q.created_at) / 86400000);
      const aging = days === 0 ? 'oggi' : days === 1 ? '1 giorno' : `${days} giorni`;
      const who = [q.reference_dept, q.reference_person].filter(Boolean).join(' / ') || 'reparto n.d.';
      return `<div class="dl-row" title="${this._esc(q.reason || 'motivo non indicato')}">
        <span class="dl-tag" style="border-left-color:var(--ct-cat-quar)">NC</span>
        <div class="dl-main">
          <div class="dl-p"><span class="mono">${this._esc(q.article_code)}</span> · lotto <span class="mono">${this._esc(q.lot_code)}</span></div>
          <div class="dl-s">${this._esc(q.blocked_location || '—')} · ${this._esc(who)} · ${this._esc(q.reason || 'motivo non indicato')}</div>
        </div>
        <div class="dl-end"><span class="dl-qty">${aging}</span></div>
        <button class="dl-btn" title="Stampa il cartello di non conformità ${this._esc(q.q_id)}"
          onclick="App._printNCCard('${this._esc(q.q_id)}')">&#128424;</button>
      </div>`;
    }).join('');
    return `<div class="card">${head}<div class="dl-list">${rows}</div></div>`;
  },

  _smoothPath(pts) {
    const n = pts.length;
    if (n === 0) return '';
    if (n === 1) return `M${pts[0].x},${pts[0].y}`;
    if (n === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    const dx = [], dy = [], slope = [];
    for (let i = 0; i < n - 1; i++) {
      dx.push(pts[i + 1].x - pts[i].x);
      dy.push(pts[i + 1].y - pts[i].y);
      slope.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
    }
    const tan = [slope[0]];
    for (let i = 1; i < n - 1; i++) {
      if (slope[i - 1] * slope[i] <= 0) { tan.push(0); continue; }
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tan.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
    tan.push(slope[n - 2]);
    let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += ` C${(pts[i].x + h).toFixed(2)},${(pts[i].y + tan[i] * h).toFixed(2)}` +
           ` ${(pts[i + 1].x - h).toFixed(2)},${(pts[i + 1].y - tan[i + 1] * h).toFixed(2)}` +
           ` ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
    }
    return d;
  },

  _MOV_COLORS: {
    IN:    'var(--ct-cat-in)',
    PICK:  'var(--ct-cat-pick)',
    MOVE:  'var(--ct-cat-move)',
    OUT:   'var(--ct-cat-out)',
    QUAR:  'var(--ct-cat-quar)',
    QREL:  'var(--ct-cat-qrel)',
    RET:   'var(--ct-cat-ret)',
    SHIP:  'var(--ct-cat-ship)',
    EDIT:  'var(--ct-cat-edit)',
    'FIX+': 'var(--ct-cat-fixp)',
    'FIX-': 'var(--ct-cat-fixm)',
    REPOS: 'var(--ct-cat-repos)'
  },
  _movColor(type) { return this._MOV_COLORS[type] || 'var(--md-sys-color-outline)'; },

  _svgDonut(segments, opts = {}) {
    const {
      size = 196, thickness = 30, centerLabel = 'TOTALE',   // v2.4.4 [N1] — riquadro condiviso
      gapDeg = 2.2, ariaLabel = 'Grafico a ciambella'
    } = opts;
    const list = segments.filter(s => s.value > 0);
    const total = list.reduce((s, x) => s + x.value, 0);
    if (!total) return '<div class="ct-empty">Nessun dato da rappresentare.</div>';

    const cx = size / 2, cy = size / 2;
    const r = (size - thickness) / 2 - 1;
    const circ = 2 * Math.PI * r;
    const gap = list.length > 1 ? (gapDeg / 360) * circ : 0;

    let acc = 0;
    let arcs = '';
    for (const s of list) {
      const frac = s.value / total;
      const len = Math.max(frac * circ - gap, 0.6);   // sempre visibile
      const pct = Math.round(frac * 100);
      const title = `${s.label}: ${s.value} (${pct}%)`;
      arcs += `<circle class="ct-seg" cx="${cx}" cy="${cy}" r="${r.toFixed(2)}"
        style="stroke:${s.color};stroke-width:${thickness}"
        stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"
        stroke-dashoffset="${(-acc * circ).toFixed(2)}"><title>${this._esc(title)}</title></circle>`;
      acc += frac;
    }

    const svg = `<svg class="chart" viewBox="0 0 ${size} ${size}" style="max-width:${size}px;margin:0 auto"
      role="img" aria-label="${this._esc(ariaLabel)}">
      <g transform="rotate(-90 ${cx} ${cy})">
        <circle class="ct-track" cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" style="stroke-width:${thickness}"/>
        ${arcs}
      </g>
      <text class="ct-total" x="${cx}" y="${cy - 1}" text-anchor="middle" dominant-baseline="middle">${total}</text>
      <text class="ct-total-lbl" x="${cx}" y="${cy + 17}" text-anchor="middle">${this._esc(centerLabel)}</text>
    </svg>`;

    const legend = list.map(s => {
      const pct = Math.round(s.value / total * 100);
      return `<div class="ct-legend-row" title="${this._esc(s.label)}: ${s.value} (${pct}%)">
        <span class="ct-swatch" style="background:${s.color}"></span>
        <span class="ct-legend-name">${this._esc(s.label)}</span>
        <span class="ct-legend-val">${s.value}</span>
        <span class="ct-legend-pct">${pct}%</span>
      </div>`;
    }).join('');

    return `<div class="chart-wrap ct-anim">${svg}<div class="ct-legend">${legend}</div></div>`;
  },

  _renderDailyBars(trend) {
    if (!trend?.length) return '<div class="ct-empty">Nessun dato disponibile.</div>';
    const totalSum = trend.reduce((s, d) => s + d.total, 0);
    if (totalSum === 0) {
      return '<div class="ct-empty">Nessun movimento registrato negli ultimi 14 giorni.</div>';
    }

    const W = 440, H = 196;
    const padL = 30, padR = 16, padT = 14, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    const rawMax = Math.max(...trend.map(d => d.total), 1);
    // Massimo arrotondato: la griglia cade su valori leggibili, non su decimali
    const step = rawMax <= 4 ? 1 : rawMax <= 10 ? 2 : rawMax <= 25 ? 5 : rawMax <= 60 ? 10 : Math.ceil(rawMax / 4 / 25) * 25;
    const max = Math.ceil(rawMax / step) * step;
    const yOf = v => padT + plotH - (v / max) * plotH;
    const xOf = i => padL + (i * plotW) / Math.max(trend.length - 1, 1);

    // Griglia orizzontale
    let grid = '';
    for (let v = 0; v <= max; v += step) {
      const y = yOf(v);
      grid += `<line class="${v === 0 ? 'ct-grid-0' : 'ct-grid'}" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>
        <text class="ct-axis" x="${padL - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${v}</text>`;
    }

    const pts = trend.map((d, i) => ({ x: xOf(i), y: yOf(d.total) }));
    const line = this._smoothPath(pts);
    const area = `${line} L${pts[pts.length - 1].x.toFixed(2)},${yOf(0).toFixed(2)} L${pts[0].x.toFixed(2)},${yOf(0).toFixed(2)} Z`;

    const lastIdx = trend.length - 1;
    let xLabels = '', dots = '';
    trend.forEach((d, i) => {
      const isToday = i === lastIdx;
      if ((lastIdx - i) % 2 === 0) {
        const anchor = isToday ? 'end' : i === 0 ? 'start' : 'middle';
        xLabels += `<text class="ct-axis${isToday ? ' ct-axis-now' : ''}" x="${xOf(i).toFixed(1)}" y="${H - 10}" text-anchor="${anchor}">${this._esc(d.label)}</text>`;
      }
      const tip = `${d.label}: ${d.total} movimenti · ${d.picks} prelievi${isToday ? ' · oggi' : ''}`;
      dots += `<circle class="ct-hit" cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}" r="11"><title>${this._esc(tip)}</title></circle>`;
      if (isToday || d.total === Math.max(...trend.map(t => t.total))) {
        dots += `<circle class="${isToday ? 'ct-dot-now' : 'ct-dot'}" cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}" r="4"/>`;
      }
    });

    const avg = (totalSum / trend.length).toFixed(1);
    const peak = trend.reduce((m, d) => (d.total > m.total ? d : m), trend[0]);

    return `<div class="chart-wrap ct-anim">
      <svg class="chart chart--area" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Andamento dei movimenti negli ultimi 14 giorni: ${totalSum} movimenti totali, media ${avg} al giorno, picco di ${peak.total} il ${this._esc(peak.label)}">
        <defs>
          <linearGradient id="ctAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   style="stop-color:var(--md-sys-color-primary);stop-opacity:0.26"/>
            <stop offset="100%" style="stop-color:var(--md-sys-color-primary);stop-opacity:0.02"/>
          </linearGradient>
        </defs>
        ${grid}
        <path class="ct-area" d="${area}" style="fill:url(#ctAreaGrad)"/>
        <path class="ct-line" d="${line}"/>
        ${dots}
        ${xLabels}
      </svg>
      <div class="ct-summary">
        <span>Totale <strong>${totalSum}</strong> mov.</span>
        <span>Media <strong>${avg}</strong>/giorno</span>
        <span>Picco <strong>${peak.total}</strong> il ${this._esc(peak.label)}</span>
      </div>
    </div>`;
  },

  _renderTypeCounts(counts, total) {
    if (!total) return '<div class="ct-empty">Nessun movimento registrato.</div>';
    const segments = Object.entries(counts)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        label: MOV_LABELS[type] || type,
        value: count,
        color: this._movColor(type)
      }));
    return this._svgDonut(segments, {
      centerLabel: 'MOVIMENTI',
      ariaLabel: `Ripartizione di ${total} movimenti per tipo`
    });
  },

  _renderSiteOccupancy(sites) {
    const cells = sites.map(site => {
      const st = Store.getSiteStats(site.id);
      const pct = st.total ? Math.round(st.occupied / st.total * 100) : 0;
      // Soglia cromatica: oltre l'85% il magazzino e' prossimo alla saturazione
      const color = pct >= 85 ? 'var(--md-sys-color-error)'
                  : pct >= 65 ? 'var(--md-ext-warning)'
                  : 'var(--md-ext-success)';
      const size = 76, thick = 9, r = (size - thick) / 2 - 1;
      const circ = 2 * Math.PI * r;
      const len = (pct / 100) * circ;
      const label = `${site.name}: ${pct}% occupato, ${st.occupied} di ${st.total} ubicazioni`;
      return `<article class="ct-gauge-cell" tabindex="0" role="button"
          title="${this._esc(label)} · ${st.blocked} bloccate · ${st.reserved} riservate"
          onclick="App.currentSite='${this._esc(site.id)}';App.switchView('map')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.currentSite='${this._esc(site.id)}';App.switchView('map')}">
        <svg class="chart" viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px" role="img" aria-label="${this._esc(label)}">
          <g transform="rotate(-90 ${size / 2} ${size / 2})">
            <circle class="ct-track" cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(2)}" style="stroke-width:${thick}"/>
            <circle cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(2)}"
              style="fill:none;stroke:${color};stroke-width:${thick};stroke-linecap:round"
              stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"/>
          </g>
          <text class="ct-gauge" x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="middle">${pct}%</text>
        </svg>
        <span class="ct-gauge-name">${this._esc(site.name)}</span>
        <span class="ct-gauge-sub">${st.occupied}/${st.total} ubic.</span>
      </article>`;
    }).join('');
    return `<div class="ct-gauge-grid ct-anim">${cells}</div>`;
  },

  _renderTopArticles(topArticles) {
    if (!topArticles?.length) return '<div class="ct-empty">Nessun movimento registrato.</div>';
    const max = Math.max(...topArticles.map(a => a.count), 1);
    const rows = topArticles.map((art, i) => {
      const pct = Math.round(art.count / max * 100);
      const desc = Store.getArticle(art.code)?.description || '';
      const tip = desc ? `${art.code} — ${desc}: ${art.count} movimenti` : `${art.code}: ${art.count} movimenti`;
      return `<div class="ct-bar-row" title="${this._esc(tip)}">
        <div class="ct-bar-head">
          <span class="ct-bar-rank">${i + 1}</span>
          <span class="mono truncate" style="flex:1 1 auto;font-weight:700;color:var(--md-sys-color-on-surface)">${this._esc(art.code)}</span>
          <span class="ct-legend-val" style="white-space:nowrap">${art.count} <span style="font-weight:400;color:var(--md-sys-color-on-surface-variant)">mov.</span></span>
        </div>
        <div class="ct-bar-track"><div class="ct-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
    return `<div class="chart-wrap ct-anim">${rows}</div>`;
  },

  /* KPI card "DDT Pendenti" con conteggio totale e breakdown urgenti.
     Rosso se ci sono scaduti, arancio se urgenti, neutro altrimenti. */
  _renderKpiPendingOutbound() {
    const allPending = [...Store.getPendingOutbound('RES'), ...Store.getPendingOutbound('SHIP')];
    const total = allPending.length;
    if (total === 0) {
      return `<div class="kpi-card">
        <div class="kpi-label">DDT Pendenti</div>
        <div class="kpi-value">0</div>
        <div class="kpi-sub">Nessun documento aperto</div>
      </div>`;
    }
    // Categorizza per urgenza
    let overdue = 0, today = 0, tomorrow = 0, soon = 0, ok = 0, none = 0;
    for (const d of allPending) {
      const lvl = pickupAlertStatus(d).level;
      if (lvl === 'overdue') overdue++;
      else if (lvl === 'today') today++;
      else if (lvl === 'tomorrow') tomorrow++;
      else if (lvl === 'soon') soon++;
      else if (lvl === 'ok') ok++;
      else none++;
    }
    // Determina classe in base ad urgenza
    let cls = '';
    if (overdue > 0 || today > 0) cls = 'k-danger';
    else if (tomorrow > 0 || soon > 0) cls = 'k-warning';
    else if (none > 0 && ok === 0) cls = '';
    // Composizione sub-label sintetica
    const subParts = [];
    if (overdue > 0) subParts.push(`<span style="color:var(--sx-danger);font-weight:700">⚠ ${overdue} scaduti</span>`);
    if (today > 0) subParts.push(`<span style="color:var(--sx-danger);font-weight:700">${today} oggi</span>`);
    if (tomorrow > 0) subParts.push(`<span style="color:var(--sx-warning);font-weight:600">${tomorrow} domani</span>`);
    if (soon > 0) subParts.push(`<span style="color:var(--sx-warning)">${soon} a breve</span>`);
    if (none > 0) subParts.push(`<span style="color:var(--sx-text-muted)">${none} senza data</span>`);
    if (subParts.length === 0 && ok > 0) subParts.push(`<span style="color:var(--sx-success)">${ok} programmati</span>`);
    const sub = subParts.join(' · ') || `${total} aperti`;
    return `<div class="kpi-card ${cls}" style="cursor:pointer" onclick="App.switchView('movimenta');setTimeout(()=>App.startMov('returns'),50)" title="Vai a Resi/Spedizioni">
      <div class="kpi-label">📋 DDT Pendenti Uscita</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-sub" style="line-height:1.3">${sub}</div>
    </div>`;
  },

  /* v2.0.1 — Deep-link a un DDT pendente: apre la tab Movimenta, il modulo
     corretto (Resi o Spedizioni) e scrolla al documento espandendolo. */
  _gotoPendingDoc(doc_id, kind) {
    this.switchView('movimenta');
    setTimeout(() => {
      this.startMov(kind === 'SHIP' ? 'shipping' : 'returns');
      setTimeout(() => {
        const det = document.querySelector(`details[data-doc-id="${doc_id}"]`);
        if (det) { det.open = true; det.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, 90);
    }, 50);
  },

  _renderIntegrityAlertsSection() {
    const broken = [...Store.getPendingOutbound('RES'), ...Store.getPendingOutbound('SHIP')]
      .map(doc => ({ doc, integrity: Store.checkPendingDocIntegrity(doc) }))
      .filter(x => !x.integrity.ok);
    if (!broken.length) return '';
    const rows = broken.map(({ doc, integrity }) => {
      const kindLabel = doc.kind === 'SHIP' ? 'Spedizione' : 'Reso';
      const detail = integrity.issues
        .map(i => `<div style="font-size:var(--dash-fs-meta);color:var(--sx-danger);padding-left:0.9rem">• ${this._esc(i.message)}</div>`)
        .join('');
      return `<div style="padding:0.4rem 0.55rem;border-bottom:1px solid var(--sx-border)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">
          <span style="font-size:var(--dash-fs-body)"><strong>DDT ${this._esc(doc.ddt_num)}</strong>
            <span style="color:var(--sx-text-muted)">· ${kindLabel} · ${this._esc(doc.destination)}</span>
            <span class="badge" style="background:var(--sx-danger-soft);color:var(--sx-danger);border-color:var(--sx-danger);margin-left:0.3rem">⚠ ${integrity.issues.length}</span>
          </span>
          <button class="btn btn-sm" onclick="App._gotoPendingDoc('${this._esc(doc.doc_id)}','${this._esc(doc.kind)}')" title="Vai al DDT">→ Apri</button>
        </div>
        ${detail}
      </div>`;
    }).join('');
    return `<section class="card" style="margin-bottom:0.6rem;border-left:3px solid var(--sx-danger)">
      <div class="card-title" style="color:var(--sx-danger)">⚠ DDT non allineati alla giacenza (${broken.length})</div>
      <div style="font-size:var(--dash-fs-meta);color:var(--sx-text-secondary);padding:0 0.55rem 0.4rem">
        Documenti registrati le cui righe non trovano più riscontro in magazzino: la merce è stata spostata,
        prelevata o rettificata dopo la registrazione. Vanno modificati o annullati prima dell'evasione.
      </div>
      ${rows}
    </section>`;
  },

  _renderPickupAlertsSection() {
    const allPending = Store.getPendingOutbound();   // v3.0.0 [M3] — un elenco solo
    if (!allPending.length) return '';
    // Filtra solo quelli urgenti
    const urgent = allPending.filter(d => {
      const lvl = pickupAlertStatus(d).level;
      return lvl === 'overdue' || lvl === 'today' || lvl === 'tomorrow';
    });
    if (!urgent.length) return '';
    // Ordina per priorità
    urgent.sort((a, b) => {
      const sa = pickupAlertStatus(a).sortKey;
      const sb = pickupAlertStatus(b).sortKey;
      return sa - sb;
    });
    const rows = urgent.map(d => {
      const alert = pickupAlertStatus(d);
      // v3.0.0 [M3] — la natura del documento viene dalla causale
      const isRes = this._docIsReturn(d);
      const themeColor = isRes ? 'var(--sx-teal)' : 'var(--sx-orange)';
      const themeIcon = isRes ? '↩️' : '🚚';
      const totalColli = d.lines.reduce((s, l) => s + (l.qty || 1), 0);
      const targetLabel = 'Destinatario';
      return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.6rem;background:${alert.bg};border:1px solid ${alert.color};border-radius:var(--radius);margin-bottom:0.3rem">
        <div style="font-size:var(--dash-fs-head)">${themeIcon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--dash-fs-body);font-weight:700;color:${alert.color}">${this._esc(alert.shortLabel)} · DDT ${this._esc(d.ddt_num)}</div>
          <div style="font-size:var(--dash-fs-meta);color:var(--sx-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${targetLabel}: <strong>${this._esc(d.destination)}</strong>${d.carrier ? ' · ' + this._esc(d.carrier) : ''} · ${d.lines.length} righe · ${totalColli} Coll.
          </div>
        </div>
        <div style="display:flex;gap:0.3rem;flex-shrink:0">
          <button class="btn btn-sm" style="background:${themeColor};color:#fff;border-color:${themeColor};font-weight:700" onclick="App.switchView('movimenta');setTimeout(()=>{App.startMov('shipping');setTimeout(()=>{const det=document.querySelector('details[data-doc-id=\\'${this._esc(d.doc_id)}\\']');if(det){det.open=true;det.scrollIntoView({behavior:'smooth',block:'center'});}},80);},50)" title="Vai al DDT">→ Apri</button>
          <button class="btn btn-sm" style="background:${themeColor};color:#fff;border-color:${themeColor};font-weight:700" onclick="App._evadiSpedizione('${this._esc(d.doc_id)}')" title="Evadi DDT">✓ EVADI</button>
          <button class="btn btn-sm btn-ghost" onclick="App._printDDT('${this._esc(d.doc_id)}')" title="Stampa">🖨</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:1rem;border-left:3px solid var(--sx-danger);background:var(--grad-soft-red)">
      <div class="card-title" style="color:var(--sx-danger)">🔔 DDT in Scadenza <span class="badge" style="background:var(--sx-danger);color:#fff;border-color:var(--sx-danger);margin-left:0.4rem">${urgent.length}</span></div>
      <div style="font-size:var(--dash-fs-meta);color:var(--sx-text-secondary);margin-bottom:0.5rem">Documenti pendenti il cui ritiro è scaduto, oggi o domani — verificare disponibilità giacenza e contattare vettore.</div>
      ${rows}
    </div>`;
  },

  /* Registro movimenti completo */
  _regRange: null,     // { from: 'AAAA-MM-GG', to: 'AAAA-MM-GG' }

  _regDefaultRange() {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
  },

  _renderMovRegistry() {
    if (!this._regRange) this._regRange = this._regDefaultRange();
    const info = Store.getMovLogWindowInfo();
    const r = this._regRange;
    return `<div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
        <div>
          <h1 style="font-size: var(--md-sys-typescale-title-large-size);color:var(--sx-primary);font-weight:700">📋 Registro Movimentazioni</h1>
          <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">${info.total.toLocaleString('it-IT')} movimentazioni in archivio · conservazione ${Math.round(LOG_RETENTION_DAYS/365)} anni</p>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap">
          <button class="btn btn-sm btn-accent" onclick="App.exportMovLogExcel()">📊 Excel Movimenti</button>
          <button class="btn btn-sm btn-accent" onclick="App.exportGiacenzeExcel()" title="Export Giacenze per Area">📦 Excel Giacenze</button>
          <button class="btn btn-sm" onclick="App._showRegistry=false;App.renderDashboard()">← Dashboard</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:0.6rem;padding:0.6rem 0.75rem">
        <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="margin:0">
            <label style="font-size: var(--md-sys-typescale-label-small-size)">Dal</label>
            <input class="input" type="date" id="regFrom" value="${r.from}" style="width:150px" onchange="App._filterRegistry()">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size: var(--md-sys-typescale-label-small-size)">Al</label>
            <input class="input" type="date" id="regTo" value="${r.to}" style="width:150px" onchange="App._filterRegistry()">
          </div>
          <div class="form-group" style="margin:0;flex:1 1 200px">
            <label style="font-size: var(--md-sys-typescale-label-small-size)">Filtro testo</label>
            <input class="input" id="regFilterText" placeholder="🔍 Articolo, lotto, ubicazione, operatore, documento…" oninput="App._filterRegistryDebounced()">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size: var(--md-sys-typescale-label-small-size)">Tipo</label>
            <select class="select" id="regFilterType" style="width:170px" onchange="App._filterRegistry()">
              <option value="">Tutti i tipi</option>
              ${Object.entries(MOV_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:0.3rem">
            <button class="btn btn-sm" onclick="App._regQuickRange(30)">30 gg</button>
            <button class="btn btn-sm" onclick="App._regQuickRange(365)">1 anno</button>
            <button class="btn btn-sm" onclick="App._regQuickRange(0)">Tutto</button>
          </div>
        </div>
        <div id="regStatus" style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.4rem">Interrogazione in corso…</div>
      </div>
      <div class="card" style="padding:0">
        <div id="regTableWrap"><div class="empty-state" style="padding:2rem"><p>Interrogazione dell’archivio…</p></div></div>
      </div>
    </div>`;
  },

  _regQuickRange(days) {
    const iso = (d) => d.toISOString().slice(0, 10);
    const to = new Date();
    const from = days === 0 ? new Date('2020-01-01T00:00:00') : new Date(to.getTime() - days * 86400000);
    this._regRange = { from: iso(from), to: iso(to) };
    const f = document.getElementById('regFrom'); if (f) f.value = this._regRange.from;
    const t = document.getElementById('regTo');   if (t) t.value = this._regRange.to;
    this._filterRegistry();
  },

  _buildRegistryTable(log, maxRows = 200, totale = null) {
    if (!log.length) return '<div class="empty-state" style="padding:2rem"><p>Nessuna movimentazione nell’intervallo selezionato</p></div>';
    const tot = totale === null ? log.length : totale;
    let html = '<div style="overflow-x:auto"><table class="sx-table"><thead><tr><th style="width:40px">#</th><th>Tipo</th><th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Ubicazione</th><th style="width:60px;text-align:center">Coll.</th><th>Operatore</th><th>Doc.</th><th>Data/Ora</th></tr></thead><tbody id="regTbody"></tbody></table></div>';
    if (tot > maxRows) html += `<div style="text-align:center;padding:0.6rem;color:var(--sx-text-muted);font-size: var(--md-sys-typescale-body-small-size);background:var(--sx-bg-alt);border-top:1px solid var(--sx-border)">Prime ${maxRows} righe di ${tot.toLocaleString('it-IT')}. Restringi le date o esporta in Excel.</div>`;
    return html;
  },

  /* Popola il tbody #regTbody con righe costruite via DOM API (no innerHTML).
     Va chiamato DOPO che il chrome HTML è già stato inserito nel DOM. */
  _populateRegistryRows(log, maxRows = 200) {
    const tbody = document.getElementById('regTbody');
    if (!tbody) return;
    // v2.0 — aggiunti colori per EDIT, RET, SHIP
    const colors = {
      IN:'var(--sx-success)', OUT:'var(--sx-danger)', PICK:'var(--sx-warning)',
      MOVE:'var(--sx-accent)', REPOS:'var(--sx-teal)',
      'FIX+':'var(--sx-purple)', 'FIX-':'var(--sx-warning)',
      QUAR:'var(--sx-purple)', QREL:'var(--sx-success)',
      EDIT:'var(--sx-primary-light)', RET:'var(--sx-teal)', SHIP:'var(--sx-orange)'
    };
    const shown = log.slice(0, maxRows);
    const frag = document.createDocumentFragment();
    shown.forEach((m, i) => {
      const lbl = MOV_LABELS[m.type] || m.type;
      const color = colors[m.type] || 'var(--sx-text-muted)';
      const ts = m.ts ? new Date(m.ts) : null;
      const locStr = (m.type === 'MOVE' || m.type === 'QUAR') && m.dest_location ? `${m.location_code} → ${m.dest_location}` : (m.location_code || '');
      const tsStr = ts ? ts.toLocaleDateString('it-IT') + ' ' + ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
      // v1.7.0 — cella qty: mostra delta firmato e saldo dopo
      let qtyCellText = '';
      let qtyCellColor = 'var(--sx-text-muted)';
      if (typeof m.qty_delta === 'number' && m.qty_delta !== null) {
        const sign = m.qty_delta > 0 ? '+' : '';
        qtyCellText = `${sign}${m.qty_delta}`;
        if (m.qty_delta > 0) qtyCellColor = 'var(--sx-success)';
        else if (m.qty_delta < 0) qtyCellColor = 'var(--sx-danger)';
        if (typeof m.qty_after === 'number') qtyCellText += ` (${m.qty_after})`;
      } else {
        qtyCellText = '—';  // movimento storico pre-v1.7.0
      }
      const tr = _h('tr', {}, [
        _h('td', { class: 'td-center mono', style: { color: 'var(--sx-text-muted)' } }, [String(i+1)]),
        _h('td', { style: { whiteSpace: 'nowrap' } }, [
          _h('span', { style: { color, fontWeight: '600' } }, [lbl]),
          /* 1.5 — LA RISTAMPA DEL VERBALE, dove il campionamento è scritto.
             Il verbale nasce da sé alla conferma (D17); qui c'è la seconda
             copia, per il campione che ne ha perso una. Solo sulle righe
             SAMPLE, e solo se il movimento ha un identificativo — quelli
             scritti prima della 1.5 ce l'hanno lo stesso. */
          ...(m.type === MOV.SAMPLE && typeof m._id === 'number' ? [
            _h('button', {
              class: 'btn btn-sm',
              style: { marginLeft: '0.35rem', padding: '0 0.3rem' },
              title: 'Ristampa il verbale di campionamento',
              onclick: () => this._ristampaVerbaleCampione(m._id),
            }, ['🖨'])
          ] : [])
        ]),
        _h('td', {}, [
          _h('span', { class: 'mono', style: { fontWeight: '700', color: 'var(--sx-primary)' } }, [m.article_code || ''])
        ]),
        _h('td', { class: 'truncate', style: { maxWidth: '220px' } }, [m.article_description || '']),
        _h('td', { class: 'mono', style: { fontSize: '0.74rem' } }, [m.lot_code || '']),
        _h('td', { class: 'mono', style: { fontSize: '0.74rem' } }, [locStr]),
        _h('td', { class: 'mono td-center', style: { fontSize: '0.74rem', fontWeight: '700', color: qtyCellColor } }, [qtyCellText]),
        _h('td', { style: { fontSize: '0.74rem' } }, [m.user || '']),
        _h('td', { class: 'mono', style: { fontSize: '0.72rem' } }, [m.doc_ref || '']),
        _h('td', { style: { fontSize: '0.7rem', whiteSpace: 'nowrap', color: 'var(--sx-text-muted)' } }, [tsStr])
      ]);
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  },

  _filterRegistryDebounced() {
    if (!this._regDebounce) this._regDebounce = debounce(() => this._filterRegistry(), 250);
    this._regDebounce();
  },

  async _filterRegistry() {
    const wrap = document.getElementById('regTableWrap');
    const status = document.getElementById('regStatus');
    if (!wrap) return;
    const text = document.getElementById('regFilterText')?.value || '';
    const type = document.getElementById('regFilterType')?.value || '';
    const fromStr = document.getElementById('regFrom')?.value || this._regRange?.from;
    const toStr   = document.getElementById('regTo')?.value   || this._regRange?.to;
    this._regRange = { from: fromStr, to: toStr };

    const from = fromStr ? new Date(fromStr + 'T00:00:00').getTime() : null;
    const to   = toStr   ? new Date(toStr   + 'T23:59:59.999').getTime() : null;
    if (from !== null && to !== null && from > to) {
      if (status) status.textContent = 'Intervallo non valido: la data iniziale è successiva a quella finale.';
      return;
    }

    if (status) status.textContent = 'Interrogazione in corso…';
    const t0 = performance.now();
    try {
      const res = await Store.queryMovements({ from, to, type, text, limit: 200 });
      wrap.innerHTML = this._buildRegistryTable(res.rows, 200, res.matched);
      this._populateRegistryRows(res.rows, 200);
      if (status) {
        const ms = Math.round(performance.now() - t0);
        status.textContent = `${res.matched.toLocaleString('it-IT')} movimenti corrispondenti su ${res.scanned.toLocaleString('it-IT')} esaminati nell’intervallo · ${ms} ms`;
      }
    } catch (err) {
      console.error('[WM] registro:', err);
      wrap.innerHTML = '<div class="empty-state" style="padding:2rem"><p>Errore nella lettura dell’archivio</p></div>';
      if (status) status.textContent = `Errore: ${err.message || 'sconosciuto'}`;
    }
  },

  // ═══ MAPPA ═══
  renderMap() {
    if (!this.currentSite || !this.currentZone) return;
    const site = Store.getSite(this.currentSite);
    const zone = Store.getZone(this.currentSite, this.currentZone);
    if (!site || !zone) return;
    const stats = Store.getZoneStats(this.currentSite, this.currentZone);
    const locs = Store.generateLocations(this.currentSite, this.currentZone);
    this._aggiornaConformita();

    let toolbar = `
      <div class="map-toolbar">
        <div class="map-breadcrumb">
          <span class="crumb mono">${this._esc(site.id)}</span>
          <span class="crumb-sep">›</span>
          <span class="crumb">${this._esc(site.name)}</span>
          <span class="crumb-sep">›</span>
          <span class="crumb-active">${this._esc(zone.name)}</span>
        </div>
        <div class="map-view-toggle">
          <button class="map-vt-btn ${this.mapViewMode === 'plan' ? 'active' : ''}" onclick="App.setMapView('plan')">▦ Piano</button>
          <button class="map-vt-btn ${this.mapViewMode === 'frontal' ? 'active' : ''}" onclick="App.setMapView('frontal')">▤ Frontale</button>
        </div>
        ${(zone.type === 'RACK' && this.mapViewMode === 'frontal') ? `<button class="btn btn-sm ${zone.mirror_frontal ? 'btn-warning' : ''}" onclick="App.toggleMirrorFrontal()" title="Specchia vista frontale (dx↔sx)" style="font-size: var(--md-sys-typescale-body-small-size)">${zone.mirror_frontal ? '↔ Specchiata' : '↔ Specchia'}</button>` : ''}`;
    if (zone.type === 'RACK' && zone.levels?.length > 1 && this.mapViewMode === 'plan') {
      toolbar += '<div class="level-selector">';
      for (const lvl of zone.levels) {
        toolbar += `<button class="level-btn ${lvl === this.currentLevel ? 'active' : ''}" onclick="App.changeLevel('${lvl}')">${lvl}</button>`;
      }
      toolbar += '</div>';
    }
    toolbar += `
        <div class="map-stats-bar">
          <div class="map-stat"><div class="dot" style="background:var(--sx-text-muted)"></div>${stats.total} Tot</div>
          <div class="map-stat"><div class="dot" style="background:var(--sx-success)"></div>${stats.occupied} Occ</div>
          <div class="map-stat"><div class="dot" style="background:var(--sx-border)"></div>${stats.empty} Vuote</div>
          <div class="map-stat"><div class="dot" style="background:var(--sx-danger)"></div>${stats.blocked} Bloc</div>
          <div class="map-stat"><div class="dot" style="background:var(--sx-warning)"></div>${stats.reserved} Ris</div>
          ${stats.disabled ? `<div class="map-stat"><div class="dot" style="background:var(--sx-disabled)"></div>${stats.disabled} Disatt</div>` : ''}
        </div>
        <div class="legend">
          <div class="legend-item"><div class="legend-dot" style="background:var(--sx-border)"></div>Vuota</div>
          <div class="legend-item"><div class="legend-dot" style="background:var(--sx-success)"></div>Occupata</div>
          <div class="legend-item"><div class="legend-dot" style="background:var(--sx-danger)"></div>Bloccata</div>
          <div class="legend-item"><div class="legend-dot" style="background:var(--sx-warning)"></div>Riservata</div>
          <div class="legend-item"><div class="legend-dot" style="background:var(--sx-disabled)"></div>Disatt.</div>
          <div class="legend-item" style="margin-left:auto;color:var(--sx-text-muted)">💡 Tasto dx = Attiva/Disattiva</div>
        </div>
        ${this._fasciaConformita(locs)}
      </div>`;
    document.getElementById('mapToolbar').innerHTML = toolbar;

    if (this.mapViewMode === 'frontal') this._renderMapFrontal(zone, locs);
    else this._renderMapPlan(zone, locs);
  },

  /* La fascia parla solo della zona che si sta guardando: un conteggio di
     tutto il magazzino, sopra una corsia, non dice a nessuno cosa fare. */
  _fasciaConformita(locs) {
    const conf = this._conf;
    if (!conf) return '';
    const qui = new Set(locs.map(l => l.code));
    const righe = conf.nonConformita.filter(n => qui.has(n.location_code));
    const senzaAttributi = conf.articoliSenzaAttributi.size;
    const deroghe = conf.deroghe.filter(d => qui.has(d.location_code)).length;
    const nastroDeroghe = deroghe
      ? `<button class="conf-deroghe" onclick="App.mostraDeroghe()" title="Allergeni ammessi per riserva della cella">
          🔓 ${deroghe} in deroga</button>`
      : '';

    if (!righe.length && deroghe) {
      return `<div class="conf-bar conf-bar--muta">
        <span>✓ Nessuna giacenza fuori posto in questa zona</span>${nastroDeroghe}
        ${senzaAttributi ? `<span class="conf-bar-nota">${senzaAttributi} articoli non ancora classificati, non verificati</span>` : ''}
      </div>`;
    }

    if (!righe.length) {
      /* Silenzio ambiguo: zero segnalazioni perche' va tutto bene, o perche'
         non c'e' ancora niente da verificare? Sono due cose diverse. */
      if (!conf.verificabili && senzaAttributi) {
        return `<div class="conf-bar conf-bar--muta">
          🧭 Verifica di stoccaggio inattiva — <strong>${senzaAttributi}</strong> articoli
          senza classe di temperatura né allergeni. Si popolano da Configurazione → Articoli → Export/Import Excel.
        </div>`;
      }
      return '';
    }

    const alte = righe.filter(n => n.gravita === 'alta').length;
    return `<div class="conf-bar ${alte ? 'conf-bar--alta' : 'conf-bar--media'}">
      <span>⚠ <strong>${righe.length}</strong> ${righe.length === 1 ? 'giacenza fuori posto' : 'giacenze fuori posto'} in questa zona${alte ? ` — <strong>${alte}</strong> ${alte === 1 ? 'grave' : 'gravi'}` : ''}</span>
      <button class="btn btn-sm" onclick="App.mostraNonConformita()">Vedi elenco</button>
      ${nastroDeroghe}
      ${senzaAttributi ? `<span class="conf-bar-nota">${senzaAttributi} articoli non ancora classificati, non verificati</span>` : ''}
    </div>`;
  },

  /* L'elenco completo, di tutto il magazzino: da qui si va all'ubicazione. */
  mostraNonConformita() {
    const conf = this._conf || this._aggiornaConformita();
    if (!conf || !conf.nonConformita.length) {
      return this.toast('Nessuna giacenza fuori posto', 'success');
    }
    const perTipo = new Map();
    for (const n of conf.nonConformita) perTipo.set(n.tipo, (perTipo.get(n.tipo) || 0) + 1);

    const righe = conf.nonConformita.slice(0, 300).map(n => `
      <tr class="${n.gravita === 'alta' ? 'conf-riga-alta' : ''}">
        <td>${n.gravita === 'alta' ? '⛔' : '⚠'}</td>
        <td class="mono"><button class="conf-vai" onclick="App.closeModal();App.goToLocation('${this._esc(n.location_code)}')">${this._esc(n.location_code)}</button></td>
        <td class="mono">${this._esc(n.article_code)}</td>
        <td>${this._esc(n.article_description || '')}</td>
        <td class="mono">${this._esc(n.lot_code || '')}</td>
        <td>${this._esc(n.messaggio)}</td>
      </tr>`).join('');

    this.showModal(`Giacenze fuori posto — ${conf.nonConformita.length}`, `
      <div class="conf-riepilogo">
        ${[...perTipo].map(([t, n]) => `<span class="conf-chip">${this._esc(this._etichettaTipoNC(t))}: <strong>${n}</strong></span>`).join('')}
        <span class="conf-chip conf-chip--muta">verificate ${conf.verificabili} di ${conf.righe} giacenze</span>
        ${conf.deroghe.length ? `<button class="conf-deroghe" onclick="App.mostraDeroghe()">🔓 ${conf.deroghe.length} in deroga su celle riservate</button>` : ''}
      </div>
      <div style="overflow-x:auto;max-height:56vh">
        <table class="sx-table">
          <thead><tr><th style="width:34px"></th><th>Ubicazione</th><th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Perché</th></tr></thead>
          <tbody>${righe}</tbody>
        </table>
      </div>
      ${conf.nonConformita.length > 300 ? `<div class="dlg-nota">Mostrate le prime 300 di ${conf.nonConformita.length}. L'export Excel le porta tutte.</div>` : ''}
    `, `<button class="btn" onclick="App.closeModal()">Chiudi</button>
        <button class="btn btn-accent" onclick="App.esportaNonConformita()">📊 Esporta Excel</button>`);
  },

  /* Le eccezioni volute, in chiaro. Non sono difetti, ma sono la risposta a
     «dove tenete allergeni fuori dalla zona riservata», che qualcuno chiedera'. */
  mostraDeroghe() {
    const conf = this._conf || this._aggiornaConformita();
    const d = conf?.deroghe || [];
    if (!d.length) return this.toast('Nessuna deroga attiva', 'info');

    const righe = d.map(x => `
      <tr>
        <td class="mono"><button class="conf-vai" onclick="App.closeModal();App.goToLocation('${this._esc(x.location_code)}')">${this._esc(x.location_code)}</button></td>
        <td class="mono">${this._esc(x.article_code)}</td>
        <td>${this._esc(x.article_description || '')}</td>
        <td class="mono">${this._esc(x.lot_code || '')}</td>
        <td>${this._esc(x.allergens.map(c => this._etAllergene(c)).join(', '))}</td>
      </tr>`).join('');

    this.showModal(`Allergeni in deroga — ${d.length}`, `
      <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-bottom:0.7rem">
        Merce con allergeni stoccata fuori dalla zona riservata, ammessa perché
        l'ubicazione è marcata <strong>Riservata</strong>. La deroga vale sugli
        allergeni: sulla temperatura la verifica resta attiva.
      </p>
      <div style="overflow-x:auto;max-height:56vh">
        <table class="sx-table">
          <thead><tr><th>Ubicazione</th><th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Allergeni ammessi</th></tr></thead>
          <tbody>${righe}</tbody>
        </table>
      </div>
    `, `<button class="btn" onclick="App.closeModal()">Chiudi</button>
        <button class="btn btn-accent" onclick="App.esportaDeroghe()">📊 Esporta Excel</button>`);
  },

  async esportaDeroghe() {
    const d = (this._conf || this._aggiornaConformita())?.deroghe || [];
    if (!d.length) return this.toast('Niente da esportare', 'warning');
    const XLSX = await caricaExcel();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.map(x => ({
      'Ubicazione': x.location_code, 'Articolo': x.article_code,
      'Descrizione': x.article_description || '', 'Lotto': x.lot_code || '',
      'Colli': x.qty ?? '', 'Allergeni': x.allergens.map(c => this._etAllergene(c)).join(', '),
    }))), 'Deroghe');
    XLSX.writeFile(wb, `allergeni-in-deroga-${new Date().toISOString().slice(0,10)}.xlsx`);
    this.toast('✓ Excel esportato', 'success');
  },

  _etichettaTipoNC(tipo) {
    return {
      TEMPERATURA: 'Temperatura',
      ALLERGENE_FUORI_ZONA: 'Allergeni fuori zona',
      ALLERGENE_NON_AMMESSO: 'Allergene non ammesso',
      PULITO_IN_ZONA_ALLERGENI: 'Senza allergeni in zona riservata',
    }[tipo] || tipo;
  },

  async esportaNonConformita() {
    const conf = this._conf || this._aggiornaConformita();
    if (!conf?.nonConformita.length) return this.toast('Niente da esportare', 'warning');
    const XLSX = await caricaExcel();
    const data = conf.nonConformita.map(n => ({
      'Gravità': n.gravita === 'alta' ? 'ALTA' : 'MEDIA',
      'Tipo': this._etichettaTipoNC(n.tipo),
      'Ubicazione': n.location_code, 'Articolo': n.article_code,
      'Descrizione': n.article_description || '', 'Lotto': n.lot_code || '',
      'Colli': n.qty ?? '', 'Motivo': n.messaggio,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Fuori posto');
    XLSX.writeFile(wb, `giacenze-fuori-posto-${new Date().toISOString().slice(0,10)}.xlsx`);
    this.toast('✓ Excel esportato', 'success');
  },

  setMapView(mode) { this.mapViewMode = mode; this.renderMap(); },
  changeLevel(lvl) { this.currentLevel = lvl; this.selectedLocation = null; this.closeDetail(); this.renderMap(); },

  /* Toggle veloce vista frontale specchiata */
  async toggleMirrorFrontal() {
    const zone = Store.getZone(this.currentSite, this.currentZone);
    if (!zone || zone.type !== 'RACK') return;
    const newValue = !zone.mirror_frontal;
    await Store.updateZone(this.currentSite, this.currentZone, { mirror_frontal: newValue });
    this.renderMap();
    this.updateSyncIndicator();
    this.toast(newValue ? '↔ Vista frontale specchiata (dx → sx)' : '↔ Vista frontale normale (sx → dx)', 'info');
  },

  _renderMapPlan(zone, locs) {
    const cellSize = 42;
    let html = '<div class="grid-wrapper">';
    if (zone.type === 'RACK') {
      const filtered = locs.filter(l => l.level === this.currentLevel);
      const cols = zone.bays_per_aisle || 1;
      const rows = zone.aisles || 1;
      html += '<div class="grid-labels-top">';
      for (let c = 1; c <= cols; c++) html += `<div class="grid-label-col" style="width:${cellSize + 3}px">C${String(c).padStart(2,'0')}</div>`;
      html += '</div>';
      for (let r = 1; r <= rows; r++) {
        html += `<div class="grid-row-wrapper"><div class="grid-label-row">A${String(r).padStart(2,'0')}</div><div class="grid-row">`;
        for (let c = 1; c <= cols; c++) {
          const loc = filtered.find(l => l.aisle === r && l.bay === c);
          if (loc) html += this._renderCell(loc.code, cellSize);
        }
        html += '</div></div>';
      }
    } else if (zone.type === 'FLOOR') {
      const cols = zone.positions_per_row || 1;
      const rows = zone.rows || 1;
      html += '<div class="grid-labels-top">';
      for (let c = 1; c <= cols; c++) html += `<div class="grid-label-col" style="width:${cellSize + 3}px">P${String(c).padStart(2,'0')}</div>`;
      html += '</div>';
      for (let r = 1; r <= rows; r++) {
        html += `<div class="grid-row-wrapper"><div class="grid-label-row">F${String(r).padStart(2,'0')}</div><div class="grid-row">`;
        for (let c = 1; c <= cols; c++) {
          const loc = locs.find(l => l.row === r && l.position === c);
          if (loc) html += this._renderCell(loc.code, cellSize);
        }
        html += '</div></div>';
      }
    } else if (zone.type === 'BULK') {
      const cols = zone.grid_cols || Math.ceil(Math.sqrt(zone.positions || 1));
      const total = zone.positions || 1;
      let idx = 0;
      for (let r = 0; r < Math.ceil(total / cols); r++) {
        html += '<div class="grid-row-wrapper"><div class="grid-label-row"></div><div class="grid-row">';
        for (let c = 0; c < cols && idx < total; c++, idx++) {
          const loc = locs[idx];
          if (loc) html += this._renderCell(loc.code, cellSize);
        }
        html += '</div></div>';
      }
    }
    html += '</div>';
    document.getElementById('mapContainer').innerHTML = html;
  },

  /* 1.4.0 — La verifica di conformita' si calcola UNA volta per disegnata e
     si tiene qui: `_renderCell` viene chiamata una volta per cella, e su una
     zona da duemila ubicazioni ricalcolarla ogni volta sarebbe duemila giri
     sull'inventario. `renderMap` la rinfresca, il resto la legge. */
  _conf: null,

  _aggiornaConformita() {
    try { this._conf = Store.verificaStoccaggio(); }
    catch { this._conf = null; }
    return this._conf;
  },

  /* Il marcatore di una cella: niente se e' a posto, o se non c'e' niente da
     verificare. Restituisce classe e testo del title, non HTML. */
  _segnoConformita(code) {
    const nc = this._conf?.perUbicazione.get(code);
    if (!nc) return { cls: '', title: '', badge: '' };
    return {
      cls: nc.gravita === 'alta' ? ' conf-ko' : ' conf-warn',
      title: ` · ⚠ ${nc.n} fuori posto`,
      badge: '<span class="conf-mark">!</span>',
    };
  },

  _renderCell(code, size) {
    const status = Store.getLocationStatus(code);
    const items = Store.getItemsAtLocation(code);
    const selected = this.selectedLocation === code;
    const short = code.split('-').pop();
    const nc = this._segnoConformita(code);
    return `<div class="grid-cell status-${status}${nc.cls} ${selected ? 'selected' : ''}" style="width:${size}px;height:${size}px"
      data-loc="${code}"
      onclick="App.selectLocation('${code}')"
      oncontextmenu="event.preventDefault();App._mapToggleDisable('${code}')"
      title="${code} — ${status}${items.length ? ' · '+items.length+' item' : ''}${nc.title}">
      ${short}${items.length ? `<span class="item-count">${items.length}</span>` : ''}${nc.badge}
    </div>`;
  },

  _renderMapFrontal(zone, locs) {
    let html = '<div class="front-combined">';
    if (zone.type === 'RACK') {
      const mirrored = zone.mirror_frontal === true;
      const dirLabel = mirrored ? ' <span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-warning);font-weight:600;text-transform:none">← specchiata (dx→sx)</span>' : '';
      html += `<div class="front-section"><div class="front-section-title">🏗️ Rack — Vista Frontale${dirLabel}</div>`;
      const levels = [...(zone.levels || ['T'])].reverse();
      const bays = zone.bays_per_aisle || 1;
      const aisles = zone.aisles || 1;
      /* bay order: se mirror_frontal allora dx→sx */
      const bayOrder = mirrored
        ? Array.from({ length: bays }, (_, i) => bays - i)
        : Array.from({ length: bays }, (_, i) => i + 1);
      for (let a = 1; a <= aisles; a++) {
        if (a > 1) html += '<div class="front-aisle-separator"></div>';
        html += `<div class="front-aisle"><div class="front-aisle-label">Corsia ${String(a).padStart(2,'0')}</div><div class="front-shelf">`;
        for (const lvl of levels) {
          html += `<div class="front-level"><div class="front-level-label">${lvl}</div>`;
          for (const b of bayOrder) {
            const loc = locs.find(l => l.aisle === a && l.bay === b && l.level === lvl);
            if (loc) {
              const status = Store.getLocationStatus(loc.code);
              const items = Store.getItemsAtLocation(loc.code);
              const sel = this.selectedLocation === loc.code;
              const nc = this._segnoConformita(loc.code);
              html += `<div class="front-cell s-${status}${nc.cls} ${sel ? 'selected' : ''}"
                data-loc="${loc.code}"
                onclick="App.selectLocation('${loc.code}')"
                oncontextmenu="event.preventDefault();App._mapToggleDisable('${loc.code}')"
                title="${loc.code} — ${status}${items.length ? ' · '+items.length+' item' : ''}${nc.title}">
                ${String(b).padStart(2,'0')}${items.length ? `<span class="fc-badge">${items.length}</span>` : ''}${nc.badge}
              </div>`;
            }
          }
          html += '</div>';
        }
        html += '</div><div class="front-bay-labels">';
        for (const b of bayOrder) html += `<div class="front-bay-label">C${String(b).padStart(2,'0')}</div>`;
        html += '</div></div>';
      }
      html += '</div>';
    } else if (zone.type === 'FLOOR') {
      const cols = zone.positions_per_row || 1;
      const rows = zone.rows || 1;
      html += `<div class="front-section"><div class="front-section-title">📦 Floor — Stoccaggio a terra</div>
        <div class="floor-zone-vis" style="grid-template-columns:28px repeat(${cols}, 1fr)">`;
      for (let r = 1; r <= rows; r++) {
        html += `<div class="floor-row-label">F${String(r).padStart(2,'0')}</div>`;
        for (let c = 1; c <= cols; c++) {
          const loc = locs.find(l => l.row === r && l.position === c);
          if (loc) {
            const status = Store.getLocationStatus(loc.code);
            const items = Store.getItemsAtLocation(loc.code);
            const sel = this.selectedLocation === loc.code;
            const stLbl = status === 'empty' ? '—' : status === 'occupied' ? 'pallet' : status === 'blocked' ? 'BLOCK' : status === 'disabled' ? 'OFF' : 'RIS';
            const nc = this._segnoConformita(loc.code);
            html += `<div class="floor-pallet fp-${status}${nc.cls} ${sel ? 'selected' : ''}"
              data-loc="${loc.code}"
              onclick="App.selectLocation('${loc.code}')"
              oncontextmenu="event.preventDefault();App._mapToggleDisable('${loc.code}')"
              title="${loc.code} — ${status}${nc.title}">
              <span class="fp-code">P${String(c).padStart(2,'0')}</span>
              <span class="fp-sub">${stLbl}</span>
              ${items.length ? `<span class="fp-badge">${items.length}</span>` : ''}${nc.badge}
            </div>`;
          }
        }
      }
      html += '</div></div>';
    } else if (zone.type === 'BULK') {
      const cols = zone.grid_cols || Math.ceil(Math.sqrt(zone.positions || 1));
      html += `<div class="front-section"><div class="front-section-title">📋 Bulk — Area libera</div>
        <div class="bulk-zone-vis" style="grid-template-columns:repeat(${cols}, 56px)">`;
      for (const loc of locs) {
        const status = Store.getLocationStatus(loc.code);
        const items = Store.getItemsAtLocation(loc.code);
        const sel = this.selectedLocation === loc.code;
        const nc = this._segnoConformita(loc.code);
        html += `<div class="floor-pallet fp-${status}${nc.cls} ${sel ? 'selected' : ''}"
          data-loc="${loc.code}"
          onclick="App.selectLocation('${loc.code}')"
          oncontextmenu="event.preventDefault();App._mapToggleDisable('${loc.code}')"
          title="${loc.code} — ${status}${nc.title}">
          <span class="fp-code">${String(loc.position).padStart(2,'0')}</span>
          ${items.length ? `<span class="fp-badge">${items.length}</span>` : ''}${nc.badge}
        </div>`;
      }
      html += '</div></div>';
    }
    html += '</div>';
    document.getElementById('mapContainer').innerHTML = html;
  },

  async _mapToggleDisable(code) {
    const items = Store.getItemsAtLocation(code);
    if (items.length > 0 && !Store.isLocationDisabled(code)) return this.toast(`Impossibile disattivare ${code}: contiene ${items.length} item`, 'error');
    const ok = await Store.toggleLocationDisabled(code);
    if (!ok) return this.toast('Impossibile modificare stato', 'error');
    const newSt = Store.isLocationDisabled(code) ? 'DISATTIVATA' : 'ATTIVA';
    this.renderMap();
    if (this.selectedLocation === code) this.renderDetail(code);
    this.updateSyncIndicator();
    this.toast(`${code} → ${newSt}`, 'success');
  },

  selectLocation(code) {
    this.selectedLocation = code;
    this.renderMap();
    this.renderDetail(code);
    document.getElementById('detailPanel').classList.remove('collapsed');
  },

  closeDetail() {
    this.selectedLocation = null;
    document.getElementById('detailPanel').classList.add('collapsed');
    if (this.currentView === 'map') this.renderMap();
  },

  renderDetail(code) {
    const status = Store.getLocationStatus(code);
    const items = Store.getItemsAtLocation(code);
    const meta = Store.getLocationMeta(code);
    document.getElementById('detailTitle').textContent = code;
    let html = `<div class="detail-section">
      <div class="detail-section-title">Informazioni</div>
      <div class="detail-field"><span class="df-label">Codice</span><span class="df-value mono">${this._esc(code)}</span></div>
      <div class="detail-field"><span class="df-label">Stato</span><span class="df-value"><span class="badge badge-${status === 'occupied' ? 'green' : status === 'blocked' ? 'red' : status === 'reserved' ? 'amber' : 'muted'}">${status}</span></span></div>
      ${meta?.blocked_reason ? `<div class="detail-field"><span class="df-label">Motivo</span><span class="df-value" style="font-size: var(--md-sys-typescale-body-small-size)">${this._esc(meta.blocked_reason)}</span></div>` : ''}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Azioni Stato</div>
      <div class="flex gap-sm" style="flex-wrap:wrap">
        ${status !== 'blocked' && status !== 'disabled' ? `<button class="btn btn-sm btn-danger" onclick="App.setLocStatus('${code}','blocked')">🚫 Blocca</button>` : ''}
        ${status !== 'reserved' && status !== 'disabled' ? `<button class="btn btn-sm btn-warning" onclick="App.setLocStatus('${code}','reserved')">📋 Riserva</button>` : ''}
        ${(status === 'blocked' || status === 'reserved') ? `<button class="btn btn-sm btn-success" onclick="App.setLocStatus('${code}','empty')">✓ Libera</button>` : ''}
        ${status !== 'disabled' && items.length === 0 ? `<button class="btn btn-sm" onclick="App.toggleLocDisabled('${code}')">⊘ Disattiva</button>` : ''}
        ${status === 'disabled' ? `<button class="btn btn-sm btn-success" onclick="App.toggleLocDisabled('${code}')">✓ Riattiva</button>` : ''}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Item presenti (${items.length})</div>`;
    if (!items.length) {
      html += '<div class="empty-state" style="padding:0.75rem"><p>Nessun item</p></div>';
    } else {
      html += '<div class="item-list">';
      for (const item of items) {
        const qty = item.qty || 1;
        const quarantined = Store.isItemQuarantined(item.item_key, code);
        const k = this._esc(item.item_key);
        html += `<div class="item-card">
          <div class="item-card-header">
            <span class="item-code">${this._esc(item.article_code)}</span>
            <span style="font-weight:700;color:var(--sx-accent);font-size: var(--md-sys-typescale-body-small-size)">${qty} Coll.</span>
            ${quarantined ? '<span class="badge" style="background:var(--sx-purple-soft);color:var(--sx-purple);border:1px solid var(--sx-purple)" title="Item già in quarantena">🔒 NC</span>' : ''}
          </div>
          <div class="item-desc">${this._esc(item.article_description || '—')}</div>
          <div class="item-lot">Lotto: ${this._esc(item.lot_code)}</div>
          ${this._rigaUM(item)}
          <div class="item-meta">
            ${item.placed_at ? `<span>📅 ${new Date(item.placed_at).toLocaleDateString('it-IT')}</span>` : ''}
            ${item.expiry_date ? `<span>⏱ Scad: ${this._esc(item.expiry_date)}</span>` : ''}
            ${item.notes ? `<span title="${this._esc(item.notes)}">📝 Note</span>` : ''}
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-accent" title="Modifica i dati dell’item" onclick="App.showEditItemModal('${this._esc(code)}','${k}')">✏️ Modifica</button>
            <button class="btn btn-sm btn-primary" title="Trasferisci in un’altra ubicazione" onclick="App.showMoveItemModal('${this._esc(code)}','${k}')">🔀 Trasferisci</button>
            ${quarantined
              ? '<button class="btn btn-sm" disabled title="Item gia’ in quarantena — il rilascio si fa da Movimenta">🔒 In quarantena</button>'
              : `<button class="btn btn-sm btn-warning" title="Blocco qualità / non conformità" onclick="App.showQuarantineItemModal('${this._esc(code)}','${k}')">🚫 Quarantena</button>`}
          </div>
        </div>`;
      }
      html += '</div>';
    }
    html += `</div>
      <div class="detail-section">
        <button class="btn btn-success" style="width:100%" onclick="App.showAddItemModal('${code}')">+ Aggiungi item</button>
        <p style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.45rem;line-height:1.5">
          L’uscita di giacenza non si esegue da qui: usare <strong>Movimenta → Smaltire</strong>,
          che registra il movimento con la sua causale.
        </p>
      </div>`;
    document.getElementById('detailBody').innerHTML = html;
  },

  showMoveItemModal(locationCode, itemKey) {
    const item = Store.getItemsAtLocation(locationCode).find(i => i.item_key === itemKey);
    if (!item) return this.toast('Item non trovato', 'error');
    const qty = item.qty || 1;
    this.showModal(
      `🔀 Trasferimento — da ${this._esc(locationCode)}`,
      `<div style="background:var(--sx-bg-alt);border:1px solid var(--sx-border);border-radius:var(--radius-md);padding:0.55rem 0.75rem;margin-bottom:0.85rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary)">
        <span class="mono" style="font-weight:700;color:var(--sx-primary)">${this._esc(item.article_code)}</span>
        ${this._esc(item.article_description || '')}<br>
        Lotto <strong>${this._esc(item.lot_code)}</strong> · giacenza <strong style="color:var(--sx-accent)">${qty} Coll.</strong>
        ${item.expiry_date ? ` · Scad. ${this._esc(item.expiry_date)}` : ''}
      </div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group">
          <label>Ubicazione di destinazione <span class="req">*</span></label>
          <input class="input input-mono" id="moveItemDest" placeholder="Scansiona o digita" autofocus
            style="text-transform:uppercase" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="this.value=this.value.toUpperCase();App._moveItemDestPreview()"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App.doMoveItem('${this._esc(locationCode)}','${this._esc(itemKey)}')}">
          <div id="moveItemDestPrev" style="font-size: var(--md-sys-typescale-label-small-size);margin-top:0.2rem;min-height:1em"></div>
        </div>
        <div class="form-group">
          <label>Colli da spostare <span class="req">*</span></label>
          <input class="input input-mono" id="moveItemQty" type="number" min="1" max="${qty}" value="${qty}">
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.2rem">Massimo ${qty} — lasciando ${qty} si sposta l’intera riga</div>
        </div>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doMoveItem('${this._esc(locationCode)}','${this._esc(itemKey)}')">🔀 Trasferisci</button>`
    );
  },

  /* Anteprima della destinazione: dire subito "bloccata" evita di scoprirlo
     dopo aver premuto conferma, con il carrello gia' davanti allo scaffale. */
  _moveItemDestPreview() {
    const el = document.getElementById('moveItemDestPrev');
    if (!el) return;
    const dest = Validate.clean(document.getElementById('moveItemDest')?.value, true).replace(/'/g, '-');
    if (!dest) { el.innerHTML = ''; return; }
    if (!Store.locationExists(dest)) {
      el.innerHTML = '<span style="color:var(--sx-danger)">✗ Ubicazione inesistente</span>';
      return;
    }
    const st = Store.getLocationStatus(dest);
    const n = Store.getItemsAtLocation(dest).length;
    if (st === 'blocked')  { el.innerHTML = '<span style="color:var(--sx-danger)">✗ Ubicazione BLOCCATA</span>'; return; }
    if (st === 'disabled') { el.innerHTML = '<span style="color:var(--sx-danger)">✗ Ubicazione DISATTIVATA</span>'; return; }
    el.innerHTML = `<span style="color:var(--sx-success)">✓ ${this._esc(dest)}</span> <span style="color:var(--sx-text-muted)">— ${st}${n ? ` · ${n} item già presenti` : ' · vuota'}</span>`;
  },

  async doMoveItem(locationCode, itemKey) {
    if (!this._requireOperator('lo spostamento di un item')) return;
    const item = Store.getItemsAtLocation(locationCode).find(i => i.item_key === itemKey);
    if (!item) return this.toast('Item non più disponibile', 'error');
    const dest = Validate.clean(document.getElementById('moveItemDest')?.value, true).replace(/'/g, '-');
    const qty = parseInt(document.getElementById('moveItemQty')?.value, 10);

    const out = await this._moveItemCore({ item, dest, qty });
    if (!out.ok) return;
    this.closeModal();
    this.renderMap();
    this.renderDetail(locationCode);
  },

  showQuarantineItemModal(locationCode, itemKey) {
    const item = Store.getItemsAtLocation(locationCode).find(i => i.item_key === itemKey);
    if (!item) return this.toast('Item non trovato', 'error');
    if (Store.isItemQuarantined(item.item_key, locationCode)) return this.toast('Item già in quarantena in questa ubicazione', 'warning');
    const nearest = Store.findNearestBlockedLocation(locationCode);
    /* v1.1.0 [N3] — Senza area NC la quarantena non parte piu': il messaggio
       lo dice qui, prima che l'operatore compili tre campi per niente. */
    const destInfo = nearest
      ? `<div class="mov-preview mov-preview-err" style="margin-bottom:0.6rem">
          <strong>📍 Ubicazione NC di destinazione:</strong> <span class="mono" style="font-weight:700">${this._esc(nearest.code)}</span>
          <span style="color:var(--sx-text-muted);font-size: var(--md-sys-typescale-label-small-size)"> (${this._esc(nearest.zoneName)}${nearest.hasItems ? ' — già contiene item' : ' — vuota'})</span>
        </div>`
      : `<div class="mov-preview mov-preview-warn" style="margin-bottom:0.6rem">
          <strong>⛔ Nessuna ubicazione BLOCCATA configurata.</strong> La quarantena non può partire:
          scegliere in Mappa un'ubicazione da destinare alle NC e premere «Blocca».
        </div>`;
    this.showModal(
      `🚫 Quarantena item — ${this._esc(locationCode)}`,
      `<div style="background:var(--sx-bg-alt);border:1px solid var(--sx-border);border-radius:var(--radius-md);padding:0.55rem 0.75rem;margin-bottom:0.85rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary)">
        <span class="mono" style="font-weight:700;color:var(--sx-purple)">${this._esc(item.article_code)}</span>
        ${this._esc(item.article_description || '')}<br>
        Lotto <strong>${this._esc(item.lot_code)}</strong> · <strong>${item.qty || 1} Coll.</strong>
      </div>
      ${destInfo}
      <!-- v1.1.0 [N2] — Colli da bloccare: la scheda ubicazione ha l'item
           davanti e puo' bloccarne una parte, come la maschera di Movimenta. -->
      <div style="display:flex;gap:0.6rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.6rem">
        <div class="form-group" style="width:150px;margin-bottom:0">
          <label style="white-space:nowrap">Colli da bloccare <span class="req">*</span></label>
          <input class="input input-mono" id="qiQty" type="number" min="1" step="1" max="${item.qty || 1}"
            value="${item.qty || 1}" style="text-align:center;font-weight:700">
        </div>
        <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);padding-bottom:0.4rem;flex:1">
          Presenti <strong>${item.qty || 1} Coll.</strong> — bloccarne meno lascia gli altri conformi e utilizzabili.
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem">
        <label>Motivo del blocco <span class="req">*</span></label>
        <textarea class="input textarea" id="qiReason" rows="2" maxlength="${Validate.MAX.REASON}" placeholder="Descrivi il motivo della non conformità…" autofocus></textarea>
      </div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group">
          <label>Operatore <span class="req">*</span></label>
          <input class="input" id="qiOperator" maxlength="${Validate.MAX.OPERATOR}" placeholder="Nome operatore" value="${this._esc(this.currentOperator || '')}">
        </div>
        <div class="form-group">
          <label>Reparto/Ufficio <span class="req">*</span></label>
          <input class="input" id="qiRefDept" maxlength="${Validate.MAX.REF_DEPT}" placeholder="Es: CQ, Produzione">
        </div>
      </div>
      <div class="form-group">
        <label>Referente (opz.)</label>
        <input class="input" id="qiRefPerson" maxlength="${Validate.MAX.OPERATOR}" placeholder="Nome specifico">
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-warning" onclick="App.doQuarantineItem('${this._esc(locationCode)}','${this._esc(itemKey)}')">🚫 Conferma quarantena</button>`
    );
  },

  async doQuarantineItem(locationCode, itemKey) {
    if (!this._requireOperator('la messa in quarantena')) return;
    const item = Store.getItemsAtLocation(locationCode).find(i => i.item_key === itemKey);
    if (!item) return this.toast('Item non più disponibile', 'error');

    const qtyBlock = parseInt(document.getElementById('qiQty')?.value);
    if (!qtyBlock || qtyBlock < 1) {
      document.getElementById('qiQty')?.focus();
      return this.toast('Colli da bloccare: valore non valido', 'error');
    }

    const out = await this._quarantineItemCore(item, {
      reason:    Validate.clean(document.getElementById('qiReason')?.value),
      operator:  Validate.clean(document.getElementById('qiOperator')?.value),
      refDept:   Validate.clean(document.getElementById('qiRefDept')?.value),
      refPerson: Validate.clean(document.getElementById('qiRefPerson')?.value),
      qty:       qtyBlock
    });
    if (!out.ok) return;
    this.closeModal();
    this.renderMap();
    this.renderDetail(locationCode);
  },

  async setLocStatus(code, status) {
    if (status === 'blocked' || status === 'reserved') {
      // v2.1.0 — prompt() nativo sostituito: era accettabile con un solo
      // ritorno a capo del lettore, registrando un motivo vuoto.
      const reason = await this._promptText({
        title: `Motivo ${status === 'blocked' ? 'blocco' : 'riserva'}`,
        message: `Ubicazione ${code} — indicare la causale. Il testo finisce nel registro e nella documentazione di non conformità.`,
        placeholder: 'Es: danno strutturale, merce in attesa esito CQ'
      });
      if (reason === null) return;
      await Store.setLocationStatus(code, status, reason || '');
    } else {
      await Store.setLocationStatus(code, 'empty', '');
    }
    this.renderMap();
    this.renderDetail(code);
    this.updateSyncIndicator();
    this.toast(`${code}: stato → ${status}`, 'success');
  },

  async toggleLocDisabled(code) {
    await this._mapToggleDisable(code);
  },

  async confirmRemoveItem(locationCode, itemKey) {
    if (!await Dialog.confirm({
      title: 'Rimuovere l\u2019item dall\u2019ubicazione?',
      message: 'La giacenza viene azzerata per questa riga. L\u2019operazione resta tracciata nel registro movimenti.',
      details: Dialog.kv([['Item', itemKey], ['Ubicazione', locationCode]]),
      confirmLabel: 'Rimuovi',
      danger: true
    })) return;
    const removed = await Store.removeItem(locationCode, itemKey);
    if (removed) {
      await this._logMov(MOV.OUT, removed.article_code, removed.article_description, removed.lot_code, locationCode);
      this.renderMap();
      this.renderDetail(locationCode);
      this.updateSyncIndicator();
      this.toast(`Item rimosso da ${locationCode}`, 'success');
    }
  },

  // ═══ MODIFICA DATI ITEM (v1.8.1) ═══
  /* Apre il modal di modifica per un item esistente, con tutti i campi precompilati.
     I campi article_code e lot_code modificano l'item_key → segnalato con avviso. */
  showEditItemModal(locationCode, itemKey) {
    const bucket = Store.getItemsAtLocation(locationCode);
    const item = bucket.find(i => i.item_key === itemKey);
    if (!item) return this.toast('Item non trovato', 'error');

    const fmtDate = (ts) => ts ? new Date(ts).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

    this.showModal(
      `✏️ Modifica Item — ${this._esc(locationCode)}`,
      `<div style="background:var(--sx-bg-alt);border:1px solid var(--sx-border);border-radius:var(--radius-md);padding:0.55rem 0.75rem;margin-bottom:0.85rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary)">
        <span class="mono" style="font-weight:700;color:var(--sx-primary)">${this._esc(item.article_code)}</span> ·
        Lotto <strong>${this._esc(item.lot_code)}</strong> ·
        📅 Inserito: ${fmtDate(item.placed_at)}
      </div>

      <div style="background:var(--sx-warning-soft);border:1px solid var(--sx-warning);border-radius:var(--radius);padding:0.45rem 0.6rem;margin-bottom:0.85rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-warning)">
        ⚠ Modificare <strong>Codice Articolo</strong> o <strong>Lotto</strong> cambia l'identificativo dell'item e viene registrato nel log.
      </div>

      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group">
          <label>Codice Articolo <span class="req">*</span></label>
          <input class="input input-mono" id="editItemArt" value="${this._esc(item.article_code)}" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"
            oninput="this.value=this.value.toUpperCase();App._editItemArtLookup()">
          <div id="editItemArtInfo" style="font-size: var(--md-sys-typescale-label-small-size);margin-top:0.15rem;color:var(--sx-text-muted)"></div>
        </div>
        <div class="form-group">
          <label>Lotto <span class="req">*</span></label>
          <input class="input input-mono" id="editItemLot" value="${this._esc(item.lot_code)}" maxlength="${Validate.MAX.LOT_CODE}">
        </div>
      </div>

      <div class="form-group" style="margin-bottom:0.6rem">
        <label>Descrizione Articolo</label>
        <input class="input" id="editItemDesc" value="${this._esc(item.article_description || '')}" maxlength="120" placeholder="Descrizione articolo">
      </div>

      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group">
          <label>Data Scadenza</label>
          <input class="input" id="editItemExp" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10"
            value="${this._esc(this._dateISOtoIT(item.expiry_date || ''))}"
            oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this)">   <!-- v2.3.0 [D1] -->
        </div>
        <div class="form-group">
          <label>Colli (Qty) <span class="req">*</span></label>
          <input class="input input-mono" id="editItemQty" type="number" min="1" max="9999" value="${item.qty || 1}">
        </div>
      </div>

      <div class="form-group" style="margin-bottom:0.4rem">
        <label>Note</label>
        <textarea class="input textarea" id="editItemNotes" rows="2" maxlength="${Validate.MAX.NOTES}" placeholder="Note operative (opzionale)">${this._esc(item.notes || '')}</textarea>
      </div>

      <div id="editItemKeyWarn" style="display:none;background:var(--sx-danger-soft);border:1px solid var(--sx-danger);border-radius:var(--radius);padding:0.45rem 0.6rem;margin-top:0.5rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger)">
        ⚠ <strong>Cambio identificativo:</strong> il codice articolo o il lotto sono stati modificati. L'operazione ricreerà l'item con il nuovo ID e verrà tracciata nel log movimenti.
      </div>`,

      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doEditItem('${this._esc(locationCode)}','${this._esc(itemKey)}')">💾 Salva Modifiche</button>`
    );

    // Pre-popola info articolo dall'anagrafica
    this._editItemArtLookup();
  },

  /* Aggiorna il badge info articolo nel modal di modifica */
  _editItemArtLookup() {
    const code = (document.getElementById('editItemArt')?.value || '').toUpperCase().trim();
    const info = document.getElementById('editItemArtInfo');
    const warnEl = document.getElementById('editItemKeyWarn');
    if (!info) return;
    const art = Store.getArticle(code);
    if (art) {
      info.innerHTML = `<span style="color:var(--sx-success)">✓</span> ${this._esc(art.description)} <span class="badge badge-muted">${this._esc(art.category || '')}</span>`;
      // Suggerisce descrizione se campo vuoto
      const descEl = document.getElementById('editItemDesc');
      if (descEl && !descEl.value.trim()) descEl.value = art.description;
    } else if (code) {
      info.innerHTML = `<span style="color:var(--sx-warning)">⚠ Codice non in anagrafica — verrà aggiunto automaticamente al salvataggio</span>`;
    } else {
      info.innerHTML = '';
    }
    // Mostra avviso cambio key se articolo o lotto sono diversi dall'originale
    if (warnEl) {
      const lotEl = document.getElementById('editItemLot');
      const origKey = document.getElementById('editItemArt')?.closest('.modal')
        ? null : null; // non disponibile qui, gestito in doEditItem
      warnEl.style.display = 'none'; // aggiornato in doEditItem al click
    }
  },

  /* Esegue il salvataggio delle modifiche all'item */
  async doEditItem(locationCode, originalItemKey) {
    if (!this._requireOperator('la modifica dati item')) return;   // v2.0.1 [B7]
    const art = Validate.clean(document.getElementById('editItemArt')?.value, true);
    const lot = Validate.clean(document.getElementById('editItemLot')?.value);
    const desc = Validate.clean(document.getElementById('editItemDesc')?.value);
    // v2.3.0 [D1] — il campo è in formato gg/mm/aaaa: conversione a ISO per lo storage/FEFO
    const exp = this._dateITtoISO(document.getElementById('editItemExp')?.value, 'Scadenza');
    if (exp === null) return;   // data incompleta o non valida → salvataggio interrotto
    const qtyRaw = parseInt(document.getElementById('editItemQty')?.value);
    const notes = Validate.clean(document.getElementById('editItemNotes')?.value);

    // Validazioni
    const artErr = Validate.article(art);
    if (artErr) return this.toast(artErr, 'error');
    const lotErr = Validate.lot(lot);
    if (lotErr) return this.toast(lotErr, 'error');
    if (!qtyRaw || qtyRaw < 1) return this.toast('Numero di colli non valido (minimo 1)', 'error');
    if (notes) {
      const notesErr = Validate.notes(notes);
      if (notesErr) return this.toast(notesErr, 'error');
    }

    const newItemKey = `${art}#${lot}`;
    const keyChanged = newItemKey !== originalItemKey;

    // Se la nuova chiave esiste già in questa ubicazione (e non è la stessa) → blocco
    if (keyChanged) {
      const existing = Store.getItemsAtLocation(locationCode).find(i => i.item_key === newItemKey);
      if (existing) {
        return this.toast(`Item ${newItemKey} esiste già in ${locationCode} — usa Inventario per correggere le quantità`, 'error');
      }
      // Mostra avviso e chiede conferma per cambio key
      const warnEl = document.getElementById('editItemKeyWarn');
      if (warnEl) warnEl.style.display = 'block';
      if (!await Dialog.confirm({
        title: 'Modifica dell\u2019identificativo item',
        message: 'Si sta cambiando la coppia articolo/lotto che identifica la merce in ubicazione. L\u2019operazione viene registrata nel log movimenti.',
        details: Dialog.kv([['Identificativo attuale', originalItemKey], ['Nuovo identificativo', newItemKey]]),
        confirmLabel: 'Modifica identificativo',
        danger: true
      })) return;
    }

    const changes = { article_code: art, lot_code: lot, article_description: desc, expiry_date: exp, qty: qtyRaw, notes: notes || '' };
    const result = await Store.updateItemFields(locationCode, originalItemKey, changes);

    if (!result?.ok) return this.toast('Salvataggio fallito — item non trovato', 'error');

    // Log del movimento
    if (keyChanged) {
      // Key change: logga come FIX_OUT (vecchio) + EDIT (nuovo)
      await this._logMov(MOV.FIX_OUT, originalItemKey.split('#')[0], '', originalItemKey.split('#')[1], locationCode, null, '', `Modifica ID: ${originalItemKey} → ${newItemKey}`);
      await this._logMov(MOV.EDIT, art, desc, lot, locationCode, null, '', `Modifica ID da ${originalItemKey}`);
      this.toast(`✓ Item aggiornato: ${originalItemKey} → ${newItemKey}`, 'success');
    } else {
      await this._logMov(MOV.EDIT, art, desc, lot, locationCode, null, '', 'Modifica dati item');
      this.toast(`✓ Dati aggiornati: ${art}#${lot}`, 'success');
    }

    this.closeModal();
    this.renderMap();
    this.renderDetail(locationCode);
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
  },

  // ── 1B. SCARICO ─────────────────────────────────────────────────────
  // Tre stadi, uno stato solo: this._dispState.

  _dispReset() {
    this._dispStage = 'search';
    this._dispState = null;
  },

  _formSmaltire(el) {
    if (!this._dispStage) this._dispStage = 'search';
    if (this._dispStage === 'verify' && this._dispState) { this._dispRenderVerify(el); return; }
    this._dispRenderSearch(el);
  },

  /* ① RICERCA + ② SELEZIONE — vivono nella stessa schermata: l'elenco
     compare sotto i campi appena la ricerca ha un esito. */
  _dispRenderSearch(el) {
    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① ARTICOLO</span> → <span class="wf-step">② LOTTO</span> → INVIO per cercare →
        <span class="wf-step">③ SCEGLI L'UBICAZIONE</span> → <span class="wf-step">④ VERIFICA A SCAFFALE</span> → colli e motivazione.
      </div>
      <div class="form-group" style="margin-bottom:0.5rem">
        <label>① Scansiona Articolo <span class="req">*</span></label>
        <input class="input input-mono" id="mOutArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('mOutLot')?.focus();}">
      </div>
      <div class="form-group" style="margin-bottom:0.6rem">
        <label>② Scansiona Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="mOutLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._searchOut();}">
      </div>
      <div id="mOutResults"><div style="font-size: var(--md-sys-typescale-body-medium-size);color:var(--sx-text-muted);padding:0.4rem">Scansiona articolo e lotto, poi premi INVIO</div></div>`;
    this.setPrimaryScanField('mOutArt');
  },

  _searchOut() {
    const art = Validate.clean(document.getElementById('mOutArt')?.value, true);
    const lot = Validate.clean(document.getElementById('mOutLot')?.value);
    const el = document.getElementById('mOutResults');
    if (!art) {
      el.innerHTML = '<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);padding:0.3rem">✗ Scansiona il codice articolo</div>';
      document.getElementById('mOutArt')?.focus();
      return;
    }
    if (!lot) {
      el.innerHTML = '<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);padding:0.3rem">✗ Scansiona il codice lotto — entrambi i campi sono obbligatori</div>';
      document.getElementById('mOutLot')?.focus();
      return;
    }
    const allItems = Store.findItemLocations(art);
    const tutte = allItems.filter(it => it.lot_code === lot);
    if (!tutte.length) {
      el.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);padding:0.3rem">Nessun item trovato per ${this._esc(art)}#${this._esc(lot)}</div>`;
      return;
    }

    const itemsRaw = tutte.filter(it => !Store.isItemQuarantined(it.item_key, it.location_code));
    const bloccate = tutte.filter(it => Store.isItemQuarantined(it.item_key, it.location_code));
    const avvisoNC = bloccate.length ? `<div class="mov-preview mov-preview-err" style="margin:0.4rem 0">
      🚫 <strong>In quarantena</strong>, non smaltibile da qui:
      ${bloccate.map(b => `<span class="mono">${this._esc(b.location_code)}</span> (${b.qty || 1} Coll.)`).join(' · ')}<br>
      <span style="font-size: var(--md-sys-typescale-label-small-size)">Gestire l'esito tramite <strong>Quarantena → Rilascio</strong>.</span>
    </div>` : '';

    if (!itemsRaw.length) {
      el.innerHTML = avvisoNC || `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);padding:0.3rem">Nessun item trovato per ${this._esc(art)}#${this._esc(lot)}</div>`;
      return;
    }
    // Ordina FEFO: lotti in scadenza per primi
    const items = Store.sortByFEFO(itemsRaw);
    let html = `${avvisoNC}<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin:0.3rem 0 0.2rem">
      Seleziona da quale ubicazione scaricare: si aprirà la verifica a scaffale.</div>
      <div style="max-height:320px;overflow-y:auto">`;
    items.forEach((it, idx) => {
      const isFEFO = idx === 0;
      const expiryLabel = it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : '';
      // v2.0.1 [A1] — si mostra e si smaltisce solo il DISPONIBILE
      const qtyPhys = it.qty || 1;
      const qtyAvail = Store.getAvailableQty(it.location_code, it.item_key);
      const reserved = qtyPhys - qtyAvail;
      const reservedLabel = reserved > 0
        ? ` · <span style="color:var(--sx-orange);font-weight:700">${reserved} impegnati su DDT</span>`
        : '';
      html += `<div class="inv-item-row${isFEFO ? ' fefo-row' : ''}">
        <div class="inv-info">
          <div class="inv-code">${this._esc(it.article_code)} <span style="color:var(--sx-text-muted);font-weight:400;font-size: var(--md-sys-typescale-body-small-size)">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">Lotto: ${this._esc(it.lot_code)} · 📍 <strong>${this._esc(it.location_code)}</strong> · <strong style="color:var(--sx-accent)">${qtyAvail} Coll. disp.</strong> (fisici ${qtyPhys})${reservedLabel}${expiryLabel}</div>
        </div>
        ${qtyAvail > 0
          ? `<button class="btn btn-sm btn-danger" onclick="App._dispSelect('${this._esc(it.location_code)}','${this._esc(it.item_key)}')">➜ Vai e verifica</button>`
          : `<span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">Interamente impegnato</span>`}
      </div>`;
    });
    el.innerHTML = html + '</div>';
  },

  _dispSelect(loc, key) {
    const bucket = Store.getItemsAtLocation(loc);
    const item = bucket.find(i => i.item_key === key);
    if (!item) return this.toast('Item non più presente in questa ubicazione', 'error');
    if (Store.isItemQuarantined(key, loc)) return this.toast('🚫 Item in quarantena in questa ubicazione — usare il flusso di rilascio', 'error');
    const qtyAvail = Store.getAvailableQty(loc, key);
    if (qtyAvail < 1) return this.toast('Merce interamente impegnata su DDT pendenti — modificare o annullare il DDT', 'error');

    /* v1.1.0 [N2] — Un'ubicazione in quarantena non e' un'alternativa
       valida: scansionandola, lo scarico ci si sposterebbe sopra. */
    const alternatives = Store.findItemLocations(item.article_code)
      .filter(x => x.lot_code === item.lot_code && x.location_code !== loc)
      .filter(x => !Store.isItemQuarantined(x.item_key, x.location_code))
      .map(x => ({ location_code: x.location_code, item_key: x.item_key,
                   qty_available: Store.getAvailableQty(x.location_code, x.item_key) }))
      .filter(x => x.qty_available > 0);

    const geo = Store.buildLocationGeometry().get(loc);
    this._dispState = {
      location_code: loc,
      item_key: key,
      article_code: item.article_code,
      article_description: item.article_description || '',
      lot_code: item.lot_code,
      expiry_date: item.expiry_date || '',
      qty_available: qtyAvail,
      qty_physical: item.qty || 1,
      site_id: geo?.site_id || null,
      alternatives,
      scan: { loc: '', art: '', lot: '' },
      forced_note: '',
      reason_id: null,
      reason_label: ''
    };
    this._dispStage = 'verify';
    this._renderIoSub();
  },

  _dispRenderVerify(el) {
    const d = this._dispState;
    const site = d.site_id ? Store.getSite(d.site_id) : null;
    const reasons = Store.getDocConfig().disposalReasons;

    const reasonBtns = reasons.map(r => `
      <button class="disp-reason ${d.reason_id === r.id ? 'active' : ''}"
        onclick="App._dispPickReason('${this._esc(r.id)}')">${this._esc(r.label)}</button>`).join('');

    el.innerHTML = `
      <article class="route-stop-card route-stop-card--out">
        <header class="route-stop-head">
          <span class="route-stop-seq">🗑️</span>
          <div class="route-stop-title">
            <div class="route-stop-loc mono">${this._esc(d.location_code)}</div>
            <div class="route-stop-site">${this._esc(site?.name || d.site_id || 'Raggiungi questa ubicazione')}</div>
          </div>
        </header>

        <div class="route-stop-body">
          <div class="route-stop-kv"><span>Articolo</span><b class="mono">${this._esc(d.article_code)}</b></div>
          <div class="route-stop-kv"><span>Descrizione</span><b>${this._esc(d.article_description || '—')}</b></div>
          <div class="route-stop-kv"><span>Lotto</span><b class="mono">${this._esc(d.lot_code)}</b></div>
          <div class="route-stop-kv"><span>Scadenza</span><b>${this._esc(d.expiry_date || '—')}</b></div>
          <div class="route-stop-kv"><span>Colli disponibili</span><b>${d.qty_available}</b></div>
          <div class="route-stop-kv"><span>Colli fisici</span><b>${d.qty_physical}</b></div>
        </div>

        ${d.alternatives.length ? `<div class="route-alt">
          <strong>Stesso articolo e lotto anche in:</strong>
          ${d.alternatives.map(a => `<span class="badge badge-muted mono">${this._esc(a.location_code)} · ${a.qty_available} Coll.</span>`).join(' ')}
          <div style="font-size: var(--md-sys-typescale-label-small-size);margin-top:0.25rem;opacity:0.8">Scansionandone una, lo scarico si sposta là.</div>
        </div>` : ''}

        <div class="form-group" style="margin:0.6rem 0 0.4rem">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div style="display:flex;gap:0.3rem">
          <input class="input input-mono" id="dLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('dLoc')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('dLoc');App._dispCheckLoc();}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('dLoc','_dispCheckLoc')" title="Sfoglia le ubicazioni">📍</button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono" id="dArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._dispCheckArt();}">
        </div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="dLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._dispCheckLot();}">
        </div>

        <div id="dFeedback"></div>

        <!-- ⑤ COLLI E MOTIVAZIONE -->
        <div class="disp-confirm">
          <div style="display:flex;gap:0.6rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.5rem">
            <div class="form-group" style="width:165px;margin-bottom:0">
              <label style="white-space:nowrap">④ Colli da smaltire <span class="req">*</span></label>
              <input class="input input-mono" id="dQty" type="number" min="1" step="1" max="${d.qty_available}"
                value="${d.qty_available}" style="text-align:center;font-weight:700">
            </div>
            <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);padding-bottom:0.4rem">
              Disponibili: <strong style="color:var(--sx-danger)">${d.qty_available} Coll.</strong>
              ${d.qty_physical > d.qty_available ? `<br><span style="color:var(--sx-orange)">${d.qty_physical - d.qty_available} impegnati su DDT, non smaltibili</span>` : ''}
            </div>
          </div>

          <label style="display:block;margin-bottom:0.25rem">⑤ Motivazione <span class="req">*</span></label>
          <div class="disp-reasons">${reasonBtns}</div>
          <input class="input" id="dReasonFree" maxlength="${Validate.MAX.NOTES}"
            placeholder="…oppure scrivi qui un motivo esteso (minimo 8 caratteri)"
            value="${this._esc(d.reason_id ? '' : d.reason_label)}"
            oninput="App._dispFreeReasonInput()">
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.25rem">
            Finisce nelle note del movimento e sul verbale. Obbligatoria.
          </div>
        </div>

        <div style="display:flex;gap:0.5rem;margin-top:0.7rem;flex-wrap:wrap">
          <button class="btn btn-danger" style="flex:1;font-weight:800;min-height:var(--md-touch)"
            onclick="App._execSmaltire()">🗑️ CONFERMA SMALTIMENTO</button>
          <button class="btn" style="min-height:var(--md-touch)" onclick="App._dispBack()">← Cambia ubicazione</button>
        </div>
      </article>`;
    this._dispState.scan = { loc: '', art: '', lot: '' };
    this.setPrimaryScanField('dLoc');
  },

  _dispBack() {
    this._dispReset();
    this._renderIoSub();
  },

  _dispPickReason(id) {
    const d = this._dispState;
    if (!d) return;
    const r = Store.getDocConfig().disposalReasons.find(x => x.id === id);
    if (!r) return;
    d.reason_id = (d.reason_id === id) ? null : id;
    d.reason_label = d.reason_id ? r.label : '';
    const free = document.getElementById('dReasonFree');
    if (d.reason_id && free) free.value = '';
    document.querySelectorAll('.disp-reason').forEach(b =>
      b.classList.toggle('active', b.textContent.trim() === r.label && !!d.reason_id));
  },

  _dispFreeReasonInput() {
    const d = this._dispState;
    if (!d) return;
    const v = document.getElementById('dReasonFree')?.value || '';
    if (v.trim()) {
      d.reason_id = null;
      document.querySelectorAll('.disp-reason').forEach(b => b.classList.remove('active'));
    }
  },

  /* ─── VERIFICHE DI SCANSIONE ────────────────────────────────────── */

  _dispCheckLoc() {
    const d = this._dispState;
    if (!d) return;
    const val = Validate.clean(document.getElementById('dLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val === d.location_code) {
      d.scan.loc = val;
      this._scanFb('dFeedback', 'ok', `Ubicazione ${val} confermata`);
      document.getElementById('dArt')?.focus();
      return;
    }
    const alt = d.alternatives.find(a => a.location_code === val);
    if (alt) { this._dispSwitchToAlternative(alt); return; }
    this._scanBlock({
      fieldId: 'dLoc', fbId: 'dFeedback',
      title: 'Ubicazione errata',
      message: `Attesa ${d.location_code}, scansionata ${val}.`,
      onForce: async (note) => {
        if (!Store.locationExists(val)) {
          this.toast(`L'ubicazione ${val} non esiste a sistema`, 'error');
          return false;
        }
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Ubicazione forzata (attesa ${d.location_code}, letta ${val}): ${note}`;
        d.scan.loc = val;
        return true;
      },
      onUnlocked: () => document.getElementById('dArt')?.focus()
    });
  },

  _dispSwitchToAlternative(alt) {
    const d = this._dispState;
    const old = d.location_code;
    d.alternatives = [
      { location_code: old, item_key: d.item_key, qty_available: Store.getAvailableQty(old, d.item_key) },
      ...d.alternatives.filter(a => a.location_code !== alt.location_code)
    ].filter(a => a.qty_available > 0);
    d.location_code = alt.location_code;
    d.item_key = alt.item_key;
    d.qty_available = alt.qty_available;
    const cur = Store.getItemsAtLocation(alt.location_code).find(i => i.item_key === alt.item_key);
    d.qty_physical = cur?.qty || alt.qty_available;
    const geo = Store.buildLocationGeometry().get(alt.location_code);
    d.site_id = geo?.site_id || null;
    Feedback.signal('info', 'Ubicazione alternativa',
      `Lo scarico avviene da ${alt.location_code} invece che da ${old}.`);
    this._renderIoSub();
    const le = document.getElementById('dLoc');
    if (le) le.value = alt.location_code;
    this._dispState.scan.loc = alt.location_code;
    this._scanFb('dFeedback', 'ok', `Spostato su ${alt.location_code} (ubicazione alternativa)`);
    document.getElementById('dArt')?.focus();
  },

  _dispCheckArt() {
    const d = this._dispState;
    if (!d) return;
    if (!d.scan.loc) {
      this._scanFb('dFeedback', 'error', 'Scansiona prima l’ubicazione');
      document.getElementById('dLoc')?.focus();
      return;
    }
    const val = Validate.clean(document.getElementById('dArt')?.value, true);
    if (!val) return;
    if (val === d.article_code) {
      d.scan.art = val;
      this._scanFb('dFeedback', 'ok', `Articolo ${val} confermato`);
      document.getElementById('dLot')?.focus();
      return;
    }
    this._scanBlock({
      fieldId: 'dArt', fbId: 'dFeedback',
      title: 'Articolo errato',
      message: `Atteso ${d.article_code}, scansionato ${val}.`,
      onForce: async (note) => {
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Articolo forzato (atteso ${d.article_code}, letto ${val}): ${note}`;
        d.scan.art = d.article_code;
        return true;
      },
      onUnlocked: () => document.getElementById('dLot')?.focus()
    });
  },

  _dispCheckLot() {
    const d = this._dispState;
    if (!d) return;
    if (!d.scan.art) {
      this._scanFb('dFeedback', 'error', 'Scansiona prima l’articolo');
      document.getElementById('dArt')?.focus();
      return;
    }
    const val = Validate.clean(document.getElementById('dLot')?.value);
    if (!val) return;
    if (val === d.lot_code) {
      d.scan.lot = val;
      this._scanFb('dFeedback', 'ok', 'Lotto confermato — indica colli e motivazione');
      document.getElementById('dQty')?.focus();
      document.getElementById('dQty')?.select();
      return;
    }
    this._scanBlock({
      fieldId: 'dLot', fbId: 'dFeedback',
      title: 'Lotto errato',
      message: `Atteso ${d.lot_code}, scansionato ${val}. Smaltire un lotto per un altro è un errore che non si recupera.`,
      onForce: async (note) => {
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Lotto forzato (atteso ${d.lot_code}, letto ${val}): ${note}`;
        d.scan.lot = d.lot_code;
        return true;
      },
      onUnlocked: () => document.getElementById('dQty')?.focus()
    });
  },

  async _execSmaltire() {
    if (!this._requireOperator('lo smaltimento')) return;   // v2.0.1 [B7]
    const d = this._dispState;
    if (!d) return this.toast('Nessun item selezionato', 'error');

    // ① la merce va identificata a scaffale, sempre
    const missing = [];
    if (!d.scan.loc) missing.push('ubicazione');
    if (!d.scan.art) missing.push('articolo');
    if (!d.scan.lot) missing.push('lotto');
    if (missing.length) {
      this._scanFb('dFeedback', 'error', `Verifica incompleta — manca la scansione di: ${missing.join(', ')}`);
      document.getElementById(missing[0] === 'ubicazione' ? 'dLoc' : missing[0] === 'articolo' ? 'dArt' : 'dLot')?.focus();
      return;
    }

    // ② la motivazione è obbligatoria: è l'intero senso di questa versione
    const free = Validate.clean(document.getElementById('dReasonFree')?.value);
    let reasonLabel = '';
    if (d.reason_id) {
      reasonLabel = Store.getDocConfig().disposalReasons.find(r => r.id === d.reason_id)?.label || '';
    } else if (free) {
      if (free.length < 8) {
        document.getElementById('dReasonFree')?.focus();
        return this.toast('Il motivo esteso deve essere di almeno 8 caratteri', 'error');
      }
      reasonLabel = free;
    }
    if (!reasonLabel) {
      document.getElementById('dReasonFree')?.focus();
      return this.toast('Motivazione obbligatoria — scegline una o scrivine una', 'error');
    }
    if (Validate.notes(reasonLabel)) return this.toast(Validate.notes(reasonLabel), 'error');

    // ③ quantità, ricontrollata sul disponibile REALE di adesso
    const loc = d.location_code, key = d.item_key;
    const bucket = Store.getItemsAtLocation(loc);
    const item = bucket.find(i => i.item_key === key);
    if (!item) return this.toast('Item non più presente — ricomincia la ricerca', 'error');
    if (Store.isItemQuarantined(key, loc)) return this.toast('🚫 Item in quarantena in questa ubicazione — usare il flusso di rilascio', 'error');
    const qtyAvail = Store.getAvailableQty(loc, key);
    if (qtyAvail < 1) return this.toast('Merce interamente impegnata su DDT pendenti — modificare o annullare il DDT', 'error');
    const qtyOut = parseInt(document.getElementById('dQty')?.value);
    if (!qtyOut || qtyOut < 1) return this.toast('Quantità non valida', 'error');
    if (qtyOut > qtyAvail) return this.toast(`Quantità superiore al disponibile (${qtyAvail} Coll.)`, 'error');

    // ④ avviso non-FEFO — invariato dalla v1.7.0
    if (!Store.isFEFOItem(item)) {
      const fefo = Store.getFEFOItemForArticle(item.article_code);
      if (fefo && fefo.expiry_date && (!item.expiry_date || item.expiry_date > fefo.expiry_date)) {
        const msg = `⚠ NON-FEFO\n\nStai per smaltire ${item.article_code}#${item.lot_code}` +
          (item.expiry_date ? ` (scad. ${item.expiry_date})` : '') +
          `\n\nIl lotto FEFO consigliato è: ${fefo.lot_code}` +
          (fefo.expiry_date ? ` (scad. ${fefo.expiry_date})` : '') +
          ` in ${fefo.location_code}\n\nProcedere comunque?`;
        if (!await Dialog.confirm({
          title: '⚠ Smaltimento NON conforme a FEFO',
          message: msg,
          confirmLabel: 'Smaltisci comunque questo lotto',
          cancelLabel: 'Annulla',
          danger: true
        })) return;
      }
    }

    /* 1.8 — quali colli, prima di chiedere conferma: il numero digitato in ③
       dice quanti, l'elenco dice quali, e cio' che esce davvero lo racconta
       il riepilogo qui sotto. */
    const scelteColli = await this._chiediColli(item, 'Quali colli si smaltiscono');
    if (scelteColli === undefined) return this.toast('Smaltimento annullato', 'info');
    const uscitaColli = scelteColli
      ? prelevaElenco(Store.colliDiRiga(item), scelteColli, Store.getUomConfig(item.article_code, item.lot_code)?.uom)
      : null;

    const isFull = scelteColli ? !uscitaColli.rimasti.length : qtyOut >= qtyAvail;
    if (!await Dialog.confirm({
      title: isFull ? 'Smaltimento TOTALE' : 'Smaltimento PARZIALE',
      message: isFull
        ? 'La merce esce definitivamente dalla giacenza. Viene emesso un verbale numerato, ristampabile dalla sezione Documenti.'
        : `Restano ${qtyAvail - qtyOut} Coll. in ${loc}. Viene emesso un verbale numerato, ristampabile dalla sezione Documenti.`,
      details: Dialog.kv([
        ['Articolo', item.article_code],
        ['Lotto', item.lot_code],
        ['Ubicazione', loc],
        ['Colli da smaltire', uscitaColli
          ? descriviElenco(uscitaColli.usciti, Store.getUomConfig(item.article_code, item.lot_code)?.uom)
          : qtyOut],
        ['Saldo dopo', uscitaColli
          ? `${uscitaColli.rimasti.length} Coll. — ${descriviElenco(uscitaColli.rimasti, Store.getUomConfig(item.article_code, item.lot_code)?.uom)}`
          : `${qtyAvail - qtyOut} Coll.`],
        ['Motivazione', reasonLabel]
      ]),
      confirmLabel: 'Smaltisci', danger: true
    })) return;

    const removed = await Store.removeItem(loc, key, qtyOut, null, scelteColli);
    if (!removed) return this.toast('Rimozione fallita', 'error');

    const notes = `SMALTIMENTO [${reasonLabel}]` + (d.forced_note ? ` · ${d.forced_note}` : '');
    const operator = Store.getCurrentIdentity().initials;
    const verbale = Store.nextDisposalSeq();
    await this._logMov(MOV.OUT, removed.article_code, removed.article_description, removed.lot_code,
      loc, null, operator, notes, verbale, removed._qty_before, removed._qty_delta, removed._qty_after, removed._qty_uom_delta);

    // v2.1.0 — storno disponibile per 120 secondi
    /* 1.8 — lo storno rimette DENTRO i colli che sono usciti, non un numero
       che ci somiglia: `_packs_out` li porta uno per uno, e senza di lui un
       collo aperto tornerebbe pieno. */
    const colliUsciti = removed._packs_out ?? null;
    this._pushUndo(`Smaltimento ${removed.article_code}#${removed.lot_code} da ${loc} (${colliUsciti ? colliUsciti.length : qtyOut} Coll.)`,
      [{ op: 'add', loc, art: removed.article_code, desc: removed.article_description,
         lot: removed.lot_code, exp: removed.expiry_date || '', notes: removed.notes || '',
         qty: colliUsciti ? colliUsciti.length : qtyOut,
         qty_uom: this._umMossa(removed), packs: colliUsciti }]);

    const snap = {
      doc_id: verbale,
      created_at: Date.now(),
      article_code: removed.article_code,
      article_description: removed.article_description || '',
      lot_code: removed.lot_code,
      expiry_date: removed.expiry_date || '',
      location_code: loc,
      qty: qtyOut,
      qty_before: removed._qty_before,
      qty_after: removed._qty_after,
      reason: reasonLabel,
      forced_note: d.forced_note || '',
      operator,
      sender: Store.getDocConfig().sender
    };
    const archived = await Store.archiveDisposal(snap);
    if (!archived) this.toast('Verbale non archiviato: la ristampa non sarà disponibile', 'error');

    const modeLabel = removed._mode === 'partial' ? `parziale (${removed._qty_after} rimasti)` : 'totale';
    this.toast(`✓ Smaltito ${qtyOut} Coll. ${modeLabel}: ${removed.article_code}#${removed.lot_code} · ${verbale}`, 'success');
    this.updateSyncIndicator();
    this._refreshSessionLog();
    await this._taskAvanza(qtyOut, ['DISPOSAL']);   // 1.4.2.1

    if (await Dialog.confirm({
      title: 'Stampare il verbale di smaltimento?',
      message: `Il verbale ${verbale} riporta articolo, lotto, ubicazione, colli, motivazione e operatore, con spazio per la firma. Resta ristampabile dalla sezione Documenti.`,
      confirmLabel: 'Stampa', cancelLabel: 'Non ora', icon: '🖨'
    })) this._printDisposal(verbale);

    // Si torna alla ricerca: lo scarico successivo è quasi sempre un'altra merce
    this._dispReset();
    this._renderIoSub();
  },

  /* Striscia d'identita': marchio e mittente a sinistra, natura e numero
     del documento a destra. Identica su ogni foglio. */
  _docHeadHTML({ kind, kindSub, numLabel = 'N°', num, dateLabel = 'del', dateVal, sender = null }) {
    const s = sender || Store.getDocConfig().sender;
    const sede = [s.address, [s.zip, s.city, s.province ? `(${s.province})` : ''].filter(Boolean).join(' ')]
      .filter(Boolean).join(' — ');
    const fisco = [
      s.vat ? `P. IVA ${s.vat}` : '',
      (s.fiscal_code && s.fiscal_code !== s.vat) ? `C.F. ${s.fiscal_code}` : '',
      s.rea ? `REA ${s.rea}` : ''
    ].filter(Boolean).join(' · ');
    const contatti = [s.phone, s.email].filter(Boolean).join(' · ');

    return `<div class="doc-ident">
        <div class="doc-brand">
          <svg class="doc-logo" viewBox="0 0 282 52" role="img" aria-label="Naturacare"><use href="#ncLogo"/></svg>
          <div class="doc-sender">
            <div class="doc-sender-name">${s.name ? this._esc(s.name) : '<span class="doc-empty">Ragione sociale non configurata</span>'}${s.legal_form ? ` <span style="font-weight:400;color:#666">· ${this._esc(s.legal_form)}</span>` : ''}</div>
            ${sede ? `<div>${this._esc(sede)}</div>` : ''}
            ${fisco ? `<div>${this._esc(fisco)}</div>` : ''}
            ${contatti ? `<div>${this._esc(contatti)}</div>` : ''}
          </div>
        </div>
        <div class="doc-title">
          <div class="doc-title-main">${this._esc(kind)}</div>
          <div class="doc-title-sub">${this._esc(kindSub)}</div>
          <div class="doc-title-num">${this._esc(numLabel)} <b>${this._esc(num || '—')}</b>&nbsp;&nbsp;${this._esc(dateLabel)} <b>${this._esc(dateVal)}</b></div>
        </div>
      </div>
      <div class="doc-hr"></div>`;
  },

  _docPageHTML({ kind, kindSub, numLabel, num, dateLabel, dateVal, sender = null,
                 headExtra = '', body = '', signs = [], docId = '',
                 watermark = '', pageClass = '', printedLabel = 'stampato il' }) {
    const fmt = new Date().toLocaleString('it-IT',
      { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const firme = signs.length ? `<div class="doc-signs">${signs.map(f => `
        <div><div class="doc-sign-role">${this._esc(f.role)}</div><div class="doc-sign-hint">${this._esc(f.hint || '')}</div><div class="doc-sign-line"></div></div>`).join('')}
      </div>` : '';

    return `<div class="pr-report doc-page ${pageClass}">
      ${watermark ? `<div class="doc-draft">${this._esc(watermark)}</div>` : ''}

      <header class="doc-zone-head">
        ${this._docHeadHTML({ kind, kindSub, numLabel, num, dateLabel, dateVal, sender })}
        ${headExtra}
      </header>

      <section class="doc-zone-body">${body}</section>

      <footer class="doc-zone-foot">
        ${firme}
        <div class="pr-footer">
          <span class="pr-footer-copy">© Andrea Sacchetti — Pathfinder 1.7 — Dietopack S.r.l. / Naturacare Group</span>
          <span>${this._esc(docId)} — ${this._esc(printedLabel)} ${this._esc(fmt)}</span>
        </div>
      </footer>
    </div>`;
  },

  /* Emissione: riempie il contenitore, stampa, lo svuota. Il contenitore
     resta vuoto fuori dalla stampa. */
  _docPrint(html) {
    Feedback.clear();
    document.getElementById('printReport').innerHTML = html;
    window.print();
    setTimeout(() => { document.getElementById('printReport').innerHTML = ''; }, 1500);
  },

  _docWarnHTML() {
    const gaps = this._docSenderGaps();
    if (!gaps.length) return '';
    return `<div class="doc-warn">
      <b>⚠ Documento non conforme — anagrafica del mittente incompleta</b>
      Mancano: ${this._esc(gaps.join(', '))}. Compilare in Configurazione → DDT e Documenti e ristampare.
    </div>`;
  },

  /* Celle etichettate del blocco d'identificazione. Le usano tutti i
     documenti, con voci diverse. */
  _docCell(lbl, val, cls = '') {
    return `<div class="doc-cell ${cls}"><div class="doc-cell-lbl">${this._esc(lbl)}</div><div class="doc-cell-val">${val ? this._esc(val) : '—'}</div></div>`;
  },

  _printDisposal(doc_id) {
    const v = Store.getDisposal(doc_id);
    if (!v) return this.toast('Verbale non trovato in archivio', 'error');

    const fmtTs = (ms) => ms
      ? new Date(ms).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';

    /* Blocco d'identificazione: la merce uscita. Sta nella fascia di
       testata, dove ogni documento mette cio' che lo identifica. */
    const headExtra = `<div class="doc-idblock doc-idblock--3">
        ${this._docCell('Articolo', v.article_code)}
        ${this._docCell('Lotto', v.lot_code)}
        ${this._docCell('Ubicazione', v.location_code)}
        ${this._docCell('Descrizione', v.article_description, 'doc-cell--wide')}
        ${this._docCell('Scadenza', this._dateISOtoIT(v.expiry_date) || v.expiry_date)}
      </div>`;

    const body = `
      <div class="vb-strip">MERCE RIMOSSA DALLA GIACENZA</div>

      <div class="vb-reason">
        <div class="vb-reason-lbl">Motivazione dello smaltimento</div>
        <div class="vb-reason-val">${this._esc(v.reason || '—')}</div>
        ${v.forced_note ? `<div class="vb-forced">Nota di sblocco scansione: ${this._esc(v.forced_note)}</div>` : ''}
      </div>

      <div class="doc-fill"></div>

      <div class="doc-grid">
        ${this._docCell('Colli prima', v.qty_before != null ? String(v.qty_before) : '')}
        ${this._docCell('Colli smaltiti', String(v.qty))}
        ${this._docCell('Colli residui', v.qty_after != null ? String(v.qty_after) : '')}
        ${this._docCell('Operatore', v.operator)}
      </div>`;

    this._docPrint(this._docPageHTML({
      kind: 'VERBALE DI SMALTIMENTO',
      kindSub: 'Uscita definitiva dalla giacenza',
      num: v.doc_id, dateVal: fmtTs(v.created_at),
      sender: (v.sender && v.sender.name) ? v.sender : null,
      headExtra, body, docId: v.doc_id, pageClass: 'doc-page--vb',
      signs: [
        { role: 'Operatore magazzino', hint: v.operator || '' },
        { role: 'Responsabile magazzino', hint: 'Data e firma' },
        { role: 'Controllo qualità', hint: 'Data e firma' }
      ]
    }));
  },

  // ═══ 3. PRELIEVO (3 sub-flussi) ═══
  _formPrelievo(el) {
    el.innerHTML = `<div class="mov-form-card">
      <h3>🏗️ <span style="color:var(--sx-accent)">Prelievo</span></h3>
      <div class="prel-tabs">
        <button class="prel-tab ${this._pickSubMode === 'cambio' ? 'active' : ''}" onclick="App._pickSub('cambio')"><span class="prel-tab-icon">🔄</span>Trasferimento</button>
        <button class="prel-tab ${this._pickSubMode === 'produzione' ? 'active' : ''}" onclick="App._pickSub('produzione')"><span class="prel-tab-icon">🏭</span>Prelievo Produzione</button>
        <button class="prel-tab ${this._pickSubMode === 'ordine' ? 'active' : ''}" onclick="App._pickSub('ordine')"><span class="prel-tab-icon">🧭</span>Da Ordine (XLSX)</button>
      </div>
      <div id="pickSubForm"></div>
      <div style="margin-top:0.6rem"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
    this._renderPickSub();
  },

  _pickSub(mode) {
    this._pickSubMode = mode;
    this._pickCart = [];
    this._moveSelection = null;
    if (mode === 'produzione') this._prodPickStartTime = null;
    if (mode === 'ordine') {
      this._routeStage = Store.getActivePickSession() ? 'run' : 'import';
    }
    this._formPrelievo(document.getElementById('movFormArea'));
  },

  _renderPickSub() {
    const el = document.getElementById('pickSubForm');
    if (!el) return;
    if (this._pickSubMode === 'cambio') this._formCambio(el);
    else if (this._pickSubMode === 'produzione') this._formProduzione(el);
    else if (this._pickSubMode === 'ordine') this._formOrdine(el);   // v2.5.0
  },

  // ── 3A. CAMBIO UBICAZIONE ──
  // v1.8.0: richiede scansione ARTICOLO + LOTTO (doppia identificazione obbligatoria)
  _formCambio(el) {
    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① ARTICOLO</span> → <span class="wf-step">② LOTTO</span> → INVIO per cercare → <span class="wf-step">③ NUOVA UBICAZIONE</span> → INVIO per trasferire.
      </div>
      <div class="form-group" style="margin-bottom:0.5rem">
        <label>① Scansiona Articolo <span class="req">*</span></label>
        <input class="input input-mono" id="pCambioArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('pCambioLot')?.focus();}">
      </div>
      <div class="form-group" style="margin-bottom:0.5rem">
        <label>② Scansiona Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="pCambioLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._cambioLookup();}">
        <div id="pCambioInfo"></div>
      </div>
      <div id="pCambioDestArea" class="hidden">
        <div class="form-group" style="margin-bottom:0.5rem">
          <label>③ Nuova Ubicazione <span class="req">*</span></label>
          <div style="display:flex;gap:0.3rem">
            <input class="input input-mono" id="pCambioDest" placeholder="Scansiona destinazione" maxlength="${Validate.MAX.LOC_CODE}" style="flex:1"
              oninput="App._normScan('pCambioDest');App._previewLoc('pCambioDest','pCambioDestPrev')"
              onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('pCambioDest');App._execCambio();}">
            <button class="btn btn-sm" onclick="App._pickLoc('pCambioDest','_cbPickCambio')">📍</button>
          </div>
          <div id="pCambioDestPrev"></div>
        </div>
        ${/* 1.4.2.1 — il campo dei colli compare SOLO quando il cambio e' stato
             aperto da un'attivita': fuori di li' il cambio ubicazione sposta il
             lotto intero, ed e' cosi' da sempre. Un compito invece puo' chiederne
             una parte, e i parziali lasciano il residuo — decisione 45. */
          this._taskRun?.type === 'TRANSFER' ? `
        <div class="form-group" style="margin-bottom:0.5rem">
          <label>Colli da spostare <span class="req">*</span></label>
          <input class="input input-mono" id="pCambioQty" type="number" min="1" step="1"
            style="max-width:120px;text-align:center;font-weight:700">
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.15rem">Spostarne meno lascia il resto in attività.</div>
        </div>` : ''}
        <button class="btn btn-primary" style="width:100%;padding:0.55rem;font-weight:700" onclick="App._execCambio()">🔄 CONFERMA CAMBIO</button>
      </div>
      <div id="pCambioFeedback" style="margin-top:0.4rem"></div>`;
    document.getElementById('pCambioArt')?.focus();
  },

  _cbPickCambio() { setTimeout(() => App._previewLoc('pCambioDest','pCambioDestPrev'), 30); },

  _cambioLookup() {
    // v1.8.0: identificazione obbligatoria con ARTICOLO + LOTTO
    const art = Validate.clean(document.getElementById('pCambioArt')?.value, true);
    const lot = Validate.clean(document.getElementById('pCambioLot')?.value);
    const info = document.getElementById('pCambioInfo');
    if (!art) {
      info.innerHTML = `<div class="mov-preview mov-preview-err" style="margin-top:0.3rem">✗ Scansiona prima il codice articolo</div>`;
      document.getElementById('pCambioArt')?.focus();
      return;
    }
    if (!lot) {
      info.innerHTML = `<div class="mov-preview mov-preview-err" style="margin-top:0.3rem">✗ Scansiona il codice lotto — entrambi i campi sono obbligatori</div>`;
      document.getElementById('pCambioLot')?.focus();
      return;
    }
    const itemKey = `${art}#${lot}`;
    if (Store.isItemQuarantined(itemKey)) {
      info.innerHTML = `<div class="mov-preview mov-preview-err" style="margin-top:0.3rem">
        🚫 <strong>Item in QUARANTENA</strong> — spostamento non consentito.<br>
        <span style="font-size: var(--md-sys-typescale-label-small-size)">Per rimetterlo in circolo usare <strong>Quarantena → Rilascio</strong>, che registra operatore, responsabile e ubicazione di destinazione conforme.</span>
      </div>`;
      return;
    }
    const allItems = Store.findItemLocations(art);
    const matched = allItems.filter(it => it.lot_code === lot);
    if (!matched.length) {
      info.innerHTML = `<div class="mov-preview mov-preview-err" style="margin-top:0.3rem">✗ Item ${this._esc(art)}#${this._esc(lot)} non trovato in nessuna ubicazione</div>`;
      return;
    }
    if (matched.length === 1) { this._cambioSelect(matched[0]); return; }
    // Multipli (stesso lotto in ubicazioni diverse)
    let html = '<div style="max-height:180px;overflow-y:auto;margin-top:0.3rem"><div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.3rem">Stesso lotto presente in più ubicazioni — seleziona la partenza:</div>';
    for (const it of matched) {
      const payload = App._payload({ loc: it.location_code, key: it.item_key, art: it.article_code, lot: it.lot_code, desc: it.article_description || '' });
      html += `<div class="inv-item-row" style="cursor:pointer" onclick="App._cambioSelectEnc('${payload}')">
        <div class="inv-info">
          <div class="inv-code">${this._esc(it.article_code)} <span style="color:var(--sx-text-muted);font-weight:400">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">Lotto: ${this._esc(it.lot_code)} · 📍 <strong>${this._esc(it.location_code)}</strong> · <strong style="color:var(--sx-accent)">${it.qty || 1} Coll.</strong></div>
        </div>
        <span style="color:var(--sx-accent)">→</span>
      </div>`;
    }
    info.innerHTML = html + '</div>';
  },

  _cambioSelectEnc(payload) { this._cambioSelect(JSON.parse(decodeURIComponent(payload))); },
  _cambioSelect(sel) {
    const locCode = sel.loc ?? sel.location_code;
    const keyCode = sel.key ?? sel.item_key;
    // Trova l'item completo per avere _id/placed_at per rollback
    const full = Store.getItemsAtLocation(locCode).find(i => i.item_key === keyCode);
    if (!full) return this.toast('Item non più disponibile', 'error');
    this._moveSelection = full;
    document.getElementById('pCambioInfo').innerHTML = `<div class="mov-preview mov-preview-ok" style="margin-top:0.3rem">
      <span class="mono" style="font-weight:700">${this._esc(full.article_code)}</span> — ${this._esc(full.article_description || '')}
      <div class="mono" style="font-size: var(--md-sys-typescale-body-small-size);margin-top:2px">Lotto: ${this._esc(full.lot_code)} · DA: <strong>${this._esc(full.location_code)}</strong></div>
    </div>`;
    document.getElementById('pCambioDestArea')?.classList.remove('hidden');
    document.getElementById('pCambioDest')?.focus();
  },

  async _moveItemCore({ item, dest, qty = null }) {
    const err = Validate.location(dest);
    if (err) { this.toast(err, 'error'); return { ok: false }; }
    if (!Store.locationExists(dest)) { this.toast(`Ubicazione ${dest} non trovata`, 'error'); return { ok: false }; }
    const destStatus = Store.getLocationStatus(dest);
    if (destStatus === 'blocked')  { this.toast(`Destinazione ${dest} BLOCCATA`, 'error'); return { ok: false }; }
    if (destStatus === 'disabled') { this.toast(`Destinazione ${dest} DISATTIVATA`, 'error'); return { ok: false }; }
    if (item.location_code === dest) { this.toast('Origine e destinazione coincidono', 'error'); return { ok: false }; }

    const qtyAvail = item.qty || 1;
    const qtyToMove = qty === null ? qtyAvail : Number(qty);
    if (!Number.isInteger(qtyToMove) || qtyToMove < 1) { this.toast('Quantità da spostare non valida', 'error'); return { ok: false }; }
    if (qtyToMove > qtyAvail) { this.toast(`In ${item.location_code} ci sono ${qtyAvail} Coll., non ${qtyToMove}`, 'error'); return { ok: false }; }
    const partial = qtyToMove < qtyAvail;

    const impactedDocs = Store.getPendingDocsForItem(item.location_code, item.item_key);
    if (impactedDocs.length) {
      const elenco = impactedDocs
        .map(d => `  • ${d.kind === 'SHIP' ? 'Spedizione' : 'Reso'} DDT ${d.ddt_num} → ${d.destination}`)
        .join('\n');
      const msg = `⚠ MERCE IMPEGNATA SU DDT PENDENTI\n\n` +
        `${item.article_code} lotto ${item.lot_code} risulta impegnato sui seguenti documenti:\n${elenco}\n\n` +
        `Spostando la merce in ${dest} le righe di questi DDT continueranno a indicare ` +
        `${item.location_code} e verranno segnalate come NON ALLINEATE.\n\n` +
        `I documenti NON vengono modificati automaticamente: dovrai aggiornarli o annullarli.\n\nProcedere con lo spostamento?`;
      if (!await Dialog.confirm({
        title: '\u26A0 Merce impegnata su DDT pendenti',
        message: msg,
        confirmLabel: 'Trasferisci comunque',
        danger: true
      })) return { ok: false };
    }

    /* 1.8 — QUALI COLLI SI SPOSTANO. Uno spostamento è un `removeItem` più un
       `addItem`, e il secondo deve rimettere GLI STESSI colli: senza l'elenco
       li deriverebbe pieni, ed è la trappola che faceva nascere 900 pezzi dal
       nulla nel passaggio da uno scaffale all'altro. */
    const scelteColli = await this._chiediColli(item, 'Quali colli si spostano');
    if (scelteColli === undefined) { this.toast('Trasferimento annullato', 'info'); return { ok: false }; }

    // v1.7.0 — Se in destinazione lo stesso lotto è già presente, i colli
    // vengono sommati (gestito da addItem con mode='incremented').
    const backup = { ...item };  // snapshot per rollback
    const removed = await Store.removeItem(item.location_code, item.item_key, partial ? qtyToMove : null, null, scelteColli);
    if (!removed) { this.toast('Rimozione dall\'origine fallita', 'error'); return { ok: false }; }
    // Add in destinazione preservando metadati e quantità
    const umMossa = this._umMossa(removed);   // 1.4.2 — il collo incompleto si sposta con la merce
    const colliMossi = removed._packs_out ?? null;
    const nMossi = colliMossi ? colliMossi.length : qtyToMove;
    const res = await Store.addItem(dest, item.article_code, item.article_description, item.lot_code, item.expiry_date || '', item.notes || '', nMossi, umMossa, colliMossi);
    if (!res.ok) {
      if (partial || (colliMossi && removed._mode === 'partial')) await Store.addItem(item.location_code, item.article_code, item.article_description, item.lot_code, item.expiry_date || '', item.notes || '', nMossi, umMossa, colliMossi);
      else await Store.restoreItem(backup);
      this.toast('Conflitto destinazione — rollback eseguito', 'error');
      return { ok: false };
    }
    // Log con qty info: il record completo cambia ubicazione
    // v2.0.1 [B7]+[A-3] — operatore esplicito e nota di audit sui DDT impattati
    const impactNote = impactedDocs.length
      ? `Merce impegnata su DDT: ${impactedDocs.map(d => d.ddt_num).join(', ')} — righe da riallineare`
      : '';
    /* Con l'elenco il parziale lo dice il servizio, non il numero digitato: un
       collo aperto e rimesso a scaffale lascia la riga viva anche quando i
       colli chiesti erano tutti. */
    const parzialeVero = colliMossi ? removed._mode === 'partial' : partial;
    await this._logMov(MOV.MOVE, item.article_code, item.article_description, item.lot_code, item.location_code, dest, Store.getCurrentIdentity().initials, impactNote, '', qtyAvail, parzialeVero ? -nMossi : 0, parzialeVero ? removed._qty_after : nMossi);
    const mergeMsg = res.mode === 'incremented' ? ` (sommato: saldo ${res.qty_after} Coll. in ${dest})` : '';
    this.toast(`✓ ${item.article_code}#${item.lot_code}: ${item.location_code} → ${dest} · ${nMossi} Coll.${mergeMsg}`, 'success');
    if (impactedDocs.length) {
      this.toast(`⚠ ${impactedDocs.length} DDT pendente/i ora disallineato/i — verificare in Movimenta`, 'warning');
    }
    this.updateSyncIndicator();
    this._refreshSessionLog();
    await this._taskAvanza(nMossi, ['TRANSFER']);   // 1.4.2.1
    return { ok: true, qtyMoved: nMossi, mergeMsg, impactedDocs, partial: parzialeVero };
  },

  async _execCambio() {
    if (!this._requireOperator('il cambio ubicazione')) return;   // v2.0.1 [B7]
    if (!this._moveSelection) return this.toast('Scansiona prima un articolo', 'error');
    const dest = Validate.clean(document.getElementById('pCambioDest')?.value, true).replace(/'/g, '-');

    /* Il campo esiste solo sotto un'attivita': senza, `null` vuol dire «tutto
       il lotto», che e' il cambio ubicazione di sempre. */
    const qtyEl = document.getElementById('pCambioQty');
    const qtyTask = qtyEl ? parseInt(qtyEl.value, 10) : null;
    if (qtyEl && !(qtyTask > 0)) { qtyEl.focus(); return this.toast('Colli da spostare: valore non valido', 'error'); }

    const out = await this._moveItemCore({ item: this._moveSelection, dest, qty: qtyEl ? qtyTask : null });
    if (!out.ok) return;

    const fb = document.getElementById('pCambioFeedback');
    if (fb) fb.innerHTML = `<div class="mov-preview mov-preview-ok"><span style="font-weight:700">✓ Trasferimento completato — ${out.qtyMoved} Coll.${out.mergeMsg}</span></div>`;
    this._moveSelection = null;
    document.getElementById('pCambioArt').value = '';
    document.getElementById('pCambioLot').value = '';
    document.getElementById('pCambioDest').value = '';
    document.getElementById('pCambioDestPrev').innerHTML = '';
    document.getElementById('pCambioInfo').innerHTML = '';
    document.getElementById('pCambioDestArea').classList.add('hidden');
    document.getElementById('pCambioArt')?.focus();
  },

  // ── 3B. PRELIEVO PRODUZIONE ──
  _formProduzione(el) {
    // Timer parte al primo add al carrello (non all'apertura del form)
    // pre-popola operatore con quello globale se vuoto
    if (!this._prodOperator) this._prodOperator = Store.getCurrentIdentity().initials;
    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① Compila ordine e operatore</span> → <span class="wf-step">② Scansiona ARTICOLO</span> (lotti multipli OK) → si accumula nel carrello → <span class="wf-step">③ CONFERMA</span>.
      </div>
      <div class="form-row" style="margin-bottom:0.5rem">
        <div class="form-group"><label>N° Ordine Produzione <span class="req">*</span></label>
          <input class="input input-mono" id="pProdOrder" placeholder="Scansiona o digita ordine" maxlength="40" value="${this._esc(this._prodOrderNum)}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._prodOrderNum=this.value;document.getElementById('pProdOperator')?.focus();}"></div>
        <div class="form-group"><label>Operatore <span class="req">*</span></label>
          <input class="input" id="pProdOperator" placeholder="Nome operatore" maxlength="${Validate.MAX.OPERATOR}" value="${this._esc(this._prodOperator)}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._prodOperator=this.value;document.getElementById('pProdArt')?.focus();}"></div>
      </div>
      <div class="form-group" style="margin-bottom:0.5rem">
        <label>② Scansiona Articolo <span class="req">*</span></label>
        <input class="input input-mono" id="pProdArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('pProdLot')?.focus();}">
      </div>
      <div class="form-group" style="margin-bottom:0.5rem">
        <label>③ Scansiona Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="pProdLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._prodLookup();}">
        <div id="pProdInfo"></div>
      </div>
      <section id="prodCartZone">${this._prodCartZoneHTML()}</section>
      <div id="pProdFeedback" style="margin-top:0.4rem"></div>
      <div class="kbd-hint">
        <span class="kbd">INVIO</span><span style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">articolo → lotto → ricerca</span>
        <span class="kbd">ESC</span><span style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">chiude il modulo</span>
      </div>`;
    this.setPrimaryScanField('pProdArt');
  },

  _prodCartZoneHTML() {
    const n = this._pickCart.length;
    const totalColli = this._pickCart.reduce((s, it) => s + (it.qty_pick || 1), 0);
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin:0.7rem 0 0.35rem">
        <strong style="font-size: var(--md-sys-typescale-body-large-size)">🛒 Carrello Prelievo <span style="color:var(--sx-accent)">(${n})</span>${n ? ` <span class="dlg-chip">${totalColli} Coll.</span>` : ''}</strong>
        ${n ? '<button class="btn btn-sm btn-ghost" onclick="App._prodClearCart()">Svuota</button>' : ''}
      </div>
      <div class="pick-cart">${this._renderPickCart()}</div>
      ${n ? `<div style="display:flex;gap:0.5rem;margin-top:0.6rem">
        <button class="btn btn-primary" style="flex:1;font-weight:800;min-height:var(--md-touch)" onclick="App._execProduzione()">🏭 CONFERMA PRELIEVO (${n})</button>
        <button class="btn" style="min-height:var(--md-touch)" onclick="App._printProdReport()" title="Stampa report">🖨</button>
      </div>` : ''}`;
  },

  _updateProdCart() {
    const zone = document.getElementById('prodCartZone');
    if (zone) zone.innerHTML = this._prodCartZoneHTML();
    else this._formProduzione(document.getElementById('pickSubForm'));   // ripiego
  },

  // v1.8.0: identificazione obbligatoria con ARTICOLO + LOTTO
  _prodLookup() {
    const art = Validate.clean(document.getElementById('pProdArt')?.value, true);
    const lot = Validate.clean(document.getElementById('pProdLot')?.value);
    const info = document.getElementById('pProdInfo');
    if (!art) {
      info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Scansiona prima il codice articolo</div>`;
      document.getElementById('pProdArt')?.focus();
      return;
    }
    if (!lot) {
      info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Scansiona il codice lotto — entrambi i campi sono obbligatori</div>`;
      document.getElementById('pProdLot')?.focus();
      return;
    }
    this._prodOrderNum = Validate.clean(document.getElementById('pProdOrder')?.value) || this._prodOrderNum;
    this._prodOperator = Validate.clean(document.getElementById('pProdOperator')?.value) || this._prodOperator;
    const all = Store.findItemLocations(art);
    const allForLot = all.filter(it => it.lot_code === lot);
    const itemsRaw = allForLot
      .filter(it => !Store.isItemQuarantined(it.item_key, it.location_code))
      .filter(it => Store.getAvailableQty(it.location_code, it.item_key) > 0);
    if (!itemsRaw.length) {
      const inQuar = allForLot.some(it => Store.isItemQuarantined(it.item_key, it.location_code));
      const allReserved = allForLot.length > 0 && !inQuar &&
        allForLot.every(it => Store.getAvailableQty(it.location_code, it.item_key) === 0);
      if (allReserved) {
        info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-orange);margin-top:0.2rem">
          ⚠ ${this._esc(art)}#${this._esc(lot)} è <strong>interamente impegnato su DDT pendenti</strong> — non prelevabile.<br>
          <span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">Modificare o annullare il DDT in Movimenta → Resi / Spedizioni.</span>
        </div>`;
        return;
      }
      info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Item ${this._esc(art)}#${this._esc(lot)} non disponibile${inQuar ? ' <span style="color:var(--sx-purple)">(in quarantena)</span>' : !allForLot.length ? ' — non trovato in magazzino' : ''}</div>`;
      return;
    }
    if (itemsRaw.length === 1) { this._prodAddToCart(itemsRaw[0]); return; }
    // Stesso lotto in più ubicazioni → mostra selezione
    let html = '<div style="max-height:200px;overflow-y:auto;margin-top:0.3rem"><div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.3rem">Stesso lotto in più ubicazioni — seleziona:</div>';
    for (const it of itemsRaw) {
      const inCart = this._pickCart.some(c => c.item_key === it.item_key && c.location_code === it.location_code);
      // v2.0.1 [A1] — si espone il DISPONIBILE, non la giacenza fisica
      const qtyPhys = it.qty || 1;
      const qtyAvail = Store.getAvailableQty(it.location_code, it.item_key);
      const reservedLbl = (qtyPhys - qtyAvail) > 0
        ? ` <span style="color:var(--sx-orange);font-size: var(--md-sys-typescale-label-small-size)">(${qtyPhys - qtyAvail} su DDT)</span>` : '';
      const payload = App._payload(it);
      html += `<div class="inv-item-row" style="cursor:pointer;${inCart ? 'opacity:0.4' : ''}" onclick="App._prodAddEnc('${payload}')">
        <div class="inv-info">
          <div class="inv-code">${this._esc(it.article_code)} <span style="color:var(--sx-text-muted);font-weight:400">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">L:${this._esc(it.lot_code)} · 📍 <strong>${this._esc(it.location_code)}</strong> · <strong style="color:var(--sx-accent)">${qtyAvail} Coll. disp.</strong>${reservedLbl}</div>
        </div>
        ${inCart ? '<span style="color:var(--sx-text-muted);font-size: var(--md-sys-typescale-body-small-size)">✓ In carrello</span>' : '<span style="color:var(--sx-success)">+ Aggiungi</span>'}
      </div>`;
    }
    info.innerHTML = html + '</div>';
  },

  _prodAddEnc(p) { this._prodAddToCart(JSON.parse(decodeURIComponent(p))); },
  /* v2.1.0 — resa asincrona: i dialoghi applicativi sostituiscono
     confirm()/prompt() nativi, che il lettore barcode poteva confermare da solo. */
  async _prodAddToCart(item) {
    const dup = this._pickCart.find(c => c.item_key === item.item_key && c.location_code === item.location_code);
    if (dup) { this.toast('Item già nel carrello', 'warning'); return; }
    // Avviso non-FEFO al picking produzione
    if (!Store.isFEFOItem(item)) {
      const fefo = Store.getFEFOItemForArticle(item.article_code);
      if (fefo && fefo.expiry_date && (!item.expiry_date || item.expiry_date > fefo.expiry_date)) {
        const msg = `⚠ NON-FEFO\n\nStai per prelevare ${item.article_code}#${item.lot_code}` +
          (item.expiry_date ? ` (scad. ${item.expiry_date})` : ' (senza scadenza)') +
          `\n\nIl lotto FEFO consigliato è: ${fefo.lot_code}` +
          (fefo.expiry_date ? ` (scad. ${fefo.expiry_date})` : '') +
          ` in ${fefo.location_code}\n\nProcedere comunque con il lotto selezionato?`;
        if (!await Dialog.confirm({
          title: '\u26A0 Prelievo NON conforme a FEFO',
          message: msg,
          confirmLabel: 'Preleva comunque questo lotto',
          cancelLabel: 'Usa il lotto FEFO',
          danger: true
        })) return;
      }
    }
    const qtyPhys = item.qty || 1;
    const qtyReserved = Store.getPendingQtyForItem(item.location_code, item.item_key);
    const qtyInCart = this._pickCart
      .filter(c => c.item_key === item.item_key && c.location_code === item.location_code)
      .reduce((sum, c) => sum + (c.qty_pick || 0), 0);
    const qtyAvail = Math.max(0, qtyPhys - qtyReserved - qtyInCart);
    if (qtyAvail < 1) {
      this.toast(`${item.article_code}#${item.lot_code}: nessun collo disponibile (fisici ${qtyPhys}, impegnati su DDT ${qtyReserved})`, 'error');
      return;
    }
    const reservedInfo = qtyReserved > 0 ? `\n⚠ ${qtyReserved} Coll. impegnati su DDT pendenti (non prelevabili)` : '';
    const qtyInput = await Dialog.qty({
      title: 'Colli da prelevare',
      message: reservedInfo ? reservedInfo.trim() : 'Impostare il numero di colli da portare in produzione.',
      details: Dialog.kv([
        ['Articolo', item.article_code],
        ['Lotto', item.lot_code],
        ['Ubicazione', item.location_code],
        ['Giacenza fisica', `${qtyPhys} Coll.`],
        ['Impegnati su DDT', qtyReserved > 0 ? `${qtyReserved} Coll.` : null],
        ['Disponibili', `${qtyAvail} Coll.`]
      ]),
      value: qtyAvail, min: 1, max: qtyAvail
    });
    if (qtyInput === null) return;  // annullato
    const qtyPick = parseInt(qtyInput, 10);
    if (!Number.isInteger(qtyPick) || qtyPick < 1) { this.toast('Quantità non valida — inserire un intero maggiore di zero', 'error'); return; }
    if (qtyPick > qtyAvail) { this.toast(`Quantità superiore al disponibile (${qtyAvail} Coll.)`, 'error'); return; }
    // Fix B5 raffinato: il timer parte al primo item, non all'apertura del form
    if (!this._pickCart.length && !this._prodPickStartTime) this._prodPickStartTime = Date.now();
    // Aggiungo qty_pick + qty_avail nello snapshot del carrello
    this._pickCart.push({ ...item, qty_pick: qtyPick, qty_avail: qtyAvail, qty_phys: qtyPhys });   // v2.0.1 [A1]
    const artEl = document.getElementById('pProdArt'); if (artEl) artEl.value = '';
    const lotEl = document.getElementById('pProdLot'); if (lotEl) lotEl.value = '';
    const infoEl = document.getElementById('pProdInfo'); if (infoEl) infoEl.innerHTML = '';
    this._updateProdCart();
    this.toast(`+ ${item.article_code}#${item.lot_code} · ${qtyPick} Coll. da ${item.location_code}`, 'success');
    this.setPrimaryScanField('pProdArt');
  },

  _prodRemoveFromCart(idx) {
    const removed = this._pickCart.splice(idx, 1)[0];
    this._updateProdCart();
    if (removed) this.toast(`Riga rimossa dal carrello · ${removed.article_code}#${removed.lot_code}`, 'info');
    this.setPrimaryScanField('pProdArt');
  },

  async _prodClearCart() {
    if (!this._pickCart.length) return;
    if (!await Dialog.confirm({
      title: 'Svuotare il carrello di prelievo?',
      message: 'Le righe raccolte vengono eliminate. Nessuna giacenza è stata ancora movimentata.',
      confirmLabel: 'Svuota', danger: true
    })) return;
    this._pickCart = [];
    this._prodPickStartTime = null;
    this._updateProdCart();
    this.setPrimaryScanField('pProdArt');
  },

  _renderPickCart() {
    if (!this._pickCart.length) return '<div class="pick-cart-empty">Carrello vuoto — scansiona articoli</div>';
    return this._pickCart.map((it, i) => {
      const qtyPick = it.qty_pick || 1;
      const qtyAvail = it.qty_avail || qtyPick;
      const isPartial = qtyPick < qtyAvail;
      const partialBadge = isPartial ? ` <span style="color:var(--sx-warning);font-size: var(--md-sys-typescale-label-small-size);font-weight:700">PARZIALE (${qtyPick}/${qtyAvail})</span>` : '';
      return `<div class="pick-cart-item">
      <div class="pci-num">${i+1}</div>
      <div class="pci-info">
        <div class="pci-code">${this._esc(it.article_code)} <span style="color:var(--sx-text-muted);font-weight:400;font-size: var(--md-sys-typescale-label-small-size)">${this._esc(it.article_description || '')}</span></div>
        <div class="pci-loc">L:${this._esc(it.lot_code)} · 📍 ${this._esc(it.location_code)} · <strong style="color:var(--sx-accent)">${qtyPick} Coll.</strong>${partialBadge}</div>
      </div>
      <button class="btn btn-sm btn-ghost" style="color:var(--sx-danger)" onclick="App._prodRemoveFromCart(${i})">✕</button>
    </div>`;
    }).join('');
  },

  async _execProduzione() {
    if (!this._requireOperator('il prelievo di produzione')) return;   // v2.0.1 [B7]
    if (!this._pickCart.length) return this.toast('Carrello vuoto', 'error');
    this._prodOrderNum = Validate.clean(document.getElementById('pProdOrder')?.value) || this._prodOrderNum;
    this._prodOperator = Validate.clean(document.getElementById('pProdOperator')?.value) || this._prodOperator;
    if (!this._prodOrderNum) return this.toast('N° ordine produzione obbligatorio', 'error');
    const opErr = Validate.operator(this._prodOperator);
    if (opErr) return this.toast(opErr, 'error');

    const count = this._pickCart.length;
    const totalColli = this._pickCart.reduce((s, it) => s + (it.qty_pick || 1), 0);
    const partialCount = this._pickCart.filter(it => (it.qty_pick || 1) < (it.qty_avail || 1)).length;
    const partialNote = partialCount > 0 ? `\n(${partialCount} prelievi parziali)` : '';
    if (!await Dialog.confirm({
      title: 'Confermare il prelievo di produzione?',
      message: 'La merce viene scaricata dalle ubicazioni e resa disponibile alla produzione.',
      details: Dialog.kv([
        ['Ordine produzione', this._prodOrderNum],
        ['Lotti', count],
        ['Colli totali', totalColli],
        ['Prelievi parziali', partialCount > 0 ? partialCount : null]
      ]),
      confirmLabel: `Preleva ${totalColli} Coll.`,
      icon: '\u{1F3ED}'
    })) return;

    // Batch atomico: rimuoviamo tutto, teniamo backup per rollback
    const backups = [];
    const results = [];
    let failedAt = -1, failReason = '';   // v2.0.1 — motivo esplicito del fallimento
    for (let i = 0; i < this._pickCart.length; i++) {
      const it = this._pickCart[i];
      const qtyPick = it.qty_pick || 1;
      const bucket = Store.getItemsAtLocation(it.location_code);
      const full = bucket.find(x => x.item_key === it.item_key);
      if (!full) { failedAt = i; failReason = `${it.article_code}#${it.lot_code} non più presente in ${it.location_code}`; break; }
      // v2.0.1 [B4] — un item messo in quarantena dopo l'inserimento nel carrello
      // non deve poter uscire dal magazzino verso la produzione.
      if (Store.isItemQuarantined(it.item_key, it.location_code)) {
        failedAt = i; failReason = `${it.article_code}#${it.lot_code} in ${it.location_code} è stato messo in QUARANTENA`; break;
      }
      // v2.0.1 [A1] — re-check sul DISPONIBILE, non sul fisico: nel frattempo la
      // merce potrebbe essere stata impegnata su un DDT di reso o spedizione.
      const availNow = Store.getAvailableQty(it.location_code, it.item_key);
      if (availNow < qtyPick) {
        failedAt = i;
        failReason = `${it.article_code}#${it.lot_code}: disponibili ${availNow} Coll. contro ${qtyPick} richiesti (fisici ${full.qty || 1})`;
        break;
      }
      backups.push({ ...full });
      /* 1.8 — riga per riga, quali colli lasciano lo scaffale. Chi annulla
         qui ferma il carrello: le righe già scaricate tornano indietro dal
         rollback qui sotto, che è la stessa strada di ogni altro guasto. */
      const sceltePick = await this._chiediColli(full, `Quali colli · ${it.article_code}#${it.lot_code}`);
      if (sceltePick === undefined) {
        failedAt = i; failReason = 'Prelievo annullato alla scelta dei colli';
        backups.pop();
        break;
      }
      // Rimozione parziale o totale a seconda di qtyPick
      const removed = await Store.removeItem(it.location_code, it.item_key, qtyPick, null, sceltePick);
      if (!removed) { failedAt = i; break; }
      results.push({ ...it, _qty_before: removed._qty_before, _qty_delta: removed._qty_delta, _qty_after: removed._qty_after, _mode: removed._mode,
                     _qty_uom_delta: removed._qty_uom_delta ?? null, _packs_out: removed._packs_out ?? null });
    }
    if (failedAt !== -1) {
      // Rollback: per ogni item processato, se era partial → reincrementa, se era full → restoreItem
      for (let j = backups.length - 1; j >= 0; j--) {
        const b = backups[j];
        const mode = results[j]?._mode;
        if (mode === 'partial') {
          // ripristina addItem con qty_delta (re-incrementa)
          // 1.4.2 — e con le UM che erano uscite, se no il rollback ne inventa
          await Store.addItem(b.location_code, b.article_code, b.article_description, b.lot_code, b.expiry_date || '', b.notes || '', Math.abs(results[j]._qty_delta) || (results[j]._packs_out?.length ?? 1), this._umMossa(results[j]), results[j]._packs_out ?? null);
        } else {
          await Store.restoreItem(b);
        }
      }
      return this.toast(`Riga ${failedAt+1} — ${failReason || 'errore'}: rollback eseguito, nessun prelievo effettuato`, 'error');
    }
    // Log tutti i movimenti (con order_num in doc_ref, operator in user, qty info)
    for (const it of results) {
      await this._logMov(MOV.PICK, it.article_code, it.article_description, it.lot_code, it.location_code, null, this._prodOperator, '', this._prodOrderNum, it._qty_before, it._qty_delta, it._qty_after, it._qty_uom_delta);
    }
    // v2.1.0 — storno del batch entro la finestra temporale
    this._pushUndo(`Prelievo produzione ord. ${this._prodOrderNum} (${results.length} lotti)`,
      results.map(it => ({
        op: 'add', loc: it.location_code, art: it.article_code,
        desc: it.article_description, lot: it.lot_code,
        exp: it.expiry_date || '', notes: it.notes || '',
        qty: Math.abs(it._qty_delta || it.qty_pick || 1),
        qty_uom: this._umMossa(it)          // 1.4.2 — vedi _umMossa
      })));
    this.toast(`✓ Prelevati ${results.length} lotti (${totalColli} Coll.) per ord. ${this._prodOrderNum}`, 'success');
    this.updateSyncIndicator();

    const prodSnap  = this._prodCartSnapshot(results, { partial: false });
    const prodSaved = await Store.archivePickReport(prodSnap);
    if (await Dialog.confirm({
      title: 'Stampare il report di prelievo?',
      message: 'Il report riporta righe, lotti, ubicazioni, quantit\u00e0 e tempi di prelievo dell\u2019ordine di produzione. Resta ristampabile dal registro degli ordini prelevati.',
      confirmLabel: 'Stampa', cancelLabel: 'Non ora', icon: '\u{1F5A8}'
    })) this._emitPickReport(prodSnap, { reprint: false });
    if (!prodSaved) this.toast('Report non archiviato: la ristampa conforme non sar\u00e0 disponibile', 'error');
    // Reset carrello + timer
    this._pickCart = [];
    this._prodPickStartTime = null;
    this._formProduzione(document.getElementById('pickSubForm'));
    this._refreshSessionLog();
  },

  _prodCartSnapshot(cart, opt = {}) {
    this._prodOrderNum = Validate.clean(document.getElementById('pProdOrder')?.value) || this._prodOrderNum;
    this._prodOperator = Validate.clean(document.getElementById('pProdOperator')?.value) || this._prodOperator;
    const snap = this._pickSnapFromCart(cart, {
      odp_num: this._prodOrderNum || '',
      operator: this._prodOperator || '',
      started_at: this._prodPickStartTime || Date.now(),
      ended_at: Date.now()
    });
    snap.partial = !!opt.partial;
    return snap;
  },

  _printProdReport(fromCart = null) {
    const cart = fromCart || this._pickCart;
    if (!cart.length) return this.toast('Niente da stampare', 'error');
    this._emitPickReport(this._prodCartSnapshot(cart, { partial: true }), { reprint: false });
  },

  _routeStage: 'import',        // 'import' | 'run'
  _routeParsed: null,           // esito OdpParser, vivo solo fra import e avvio
  _routeScan: { loc: '', art: '', lot: '' },
  _routeStartTime: null,

  /* ─── SCHERMATA 1: IMPORT ───────────────────────────────────────── */
  _formOrdine(el) {
    const session = Store.getActivePickSession();
    if (session && this._routeStage === 'run') { this._renderRouteRun(el); return; }

    if (!this._prodOperator) this._prodOperator = Store.getCurrentIdentity().initials;
    const parsed = this._routeParsed;

    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① Carica l'XLSX dell'ODP</span> →
        <span class="wf-step">② Verifica l'esito</span> →
        <span class="wf-step">③ AVVIA PERCORSO</span> → scansione guidata tappa per tappa.
      </div>

      ${session ? `<div class="route-resume">
        <strong>⏸ Percorso gi&agrave; in corso</strong>
        <div>Ordine ${this._esc(session.odp_num)} — ${session.stops.filter(s => s.status !== 'pending').length} di ${session.stops.length} tappe completate.</div>
        <div style="display:flex;gap:0.5rem;margin-top:0.6rem;flex-wrap:wrap">
          <button class="btn btn-accent" onclick="App._routeResume()">▶ Riprendi</button>
          <button class="btn btn-danger" onclick="App._routeAbandon()">✕ Chiudi percorso</button>
        </div>
        <div style="font-size: var(--md-sys-typescale-body-small-size);margin-top:0.5rem;opacity:0.85">
          Caricando un nuovo ordine questo percorso verr&agrave; chiuso.
        </div>
      </div>` : ''}

      <div class="form-group" style="margin-bottom:0.6rem">
        <label>Operatore <span class="req">*</span></label>
        <input class="input" id="pRouteOperator" placeholder="Nome operatore" maxlength="${Validate.MAX.OPERATOR}"
          value="${this._esc(this._prodOperator)}" onchange="App._prodOperator=this.value">
      </div>

      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.7rem">
        <button class="btn btn-primary" style="min-height:var(--md-touch)"
          onclick="document.getElementById('fileImportOdp').click()">📄 Carica ordine (.xlsx)</button>
        ${parsed ? '<button class="btn btn-ghost" onclick="App._routeClearImport()">Scarta</button>' : ''}
      </div>

      <section id="routeImportResult">${parsed ? this._routeImportResultHTML() : ''}</section>

      <div class="kbd-hint" style="margin-top:0.7rem">
        <span style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">
          Sorgente accettata: solo il file <strong>.xlsx</strong> esportato da Sage X3.
          Il PDF dello stesso ordine espone quantit&agrave; arrotondate ed &egrave; meno affidabile.
        </span>
      </div>`;
    this.setPrimaryScanField(null);
  },

  _routeClearImport() {
    this._routeParsed = null;
    this._formOrdine(document.getElementById('pickSubForm'));
  },

  /* Lettura del file. Ogni errore è esplicito: un import che fallisce a metà
     e lascia un percorso parziale sarebbe il peggior esito possibile. */
  async handleImportOdp(event) {
    const file = event.target.files?.[0];
    event.target.value = '';                     // consente di ricaricare lo stesso file
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      return this.toast('Formato non valido · Caricare il file .xlsx esportato da Sage X3', 'error');
    }
    try {
      /* 1.7 — il parser resta sincrono e non importa SheetJS: glielo diamo
         qui, dopo che il chunk e' arrivato. Vedi `modules/odpParser.ts`. */
      OdpParser.usaXLSX(await caricaExcel());
      const buf = await file.arrayBuffer();
      const res = OdpParser.parse(buf);
      if (!res.ok) {
        this._routeParsed = null;
        this._formOrdine(document.getElementById('pickSubForm'));
        return this.toast(`Import non riuscito · ${res.error}`, 'error');
      }
      const route = PickRoute.build(res.lines);
      this._routeParsed = { ...res, ...route, file_name: file.name };
      this._formOrdine(document.getElementById('pickSubForm'));
      const n = route.stops.length, o = route.offroute.length;
      this.toast(`Ordine ${res.header.odp_num} letto · ${n} tappe, ${o} righe in coda`, n ? 'success' : 'warning');
    } catch (err) {
      console.error('[WM] handleImportOdp:', err);
      this._routeParsed = null;
      this._formOrdine(document.getElementById('pickSubForm'));
      this.toast(`Errore di lettura · ${err.message}`, 'error');
    }
  },

  /* Esito dell'import: testata, avvisi, ordine siti, anteprima tappe e coda. */
  _routeImportResultHTML() {
    const p = this._routeParsed;
    if (!p) return '';
    const h = p.header;
    const bySite = {};
    for (const s of p.stops) (bySite[s.site_id] = bySite[s.site_id] || []).push(s);

    const SEV = { not_mapped: 0, lot_absent_other_lots: 1, no_lot_in_odp: 2, all_blocked: 3 };
    const blockers = [...p.offroute].sort((a, b) => (SEV[a.reason] ?? 9) - (SEV[b.reason] ?? 9));
    const alertHTML = blockers.length ? `
      <div class="route-alert">
        <div class="route-alert-head">
          <span class="route-alert-ico">!</span>
          <div>
            <strong>${blockers.length} riga/e non prelevabile/i dalle aree mappate</strong>
            <div class="route-alert-sub">
              Verificare su Sage o con l'Ufficio Produzione <u>prima</u> di avviare il percorso.
              Il prelievo di queste righe non &egrave; guidato.
            </div>
          </div>
        </div>
        ${blockers.map(o => this._routeTailRowHTML(o)).join('')}
      </div>` : '';

    /* Avvisi residui sulla lettura del file. Dalla v2.5.1 restano solo quelli
       che indicano un dato mancante, non differenze di arrotondamento. */
    const warnHTML = p.warnings.length ? `
      <div class="route-warn">
        <strong>⚠ ${p.warnings.length} avviso/i sui dati dell'ordine</strong>
        <ul style="margin:0.4rem 0 0 1rem;padding:0">
          ${p.warnings.map(w => `<li style="margin-bottom:0.25rem">${this._esc(w)}</li>`).join('')}
        </ul>
      </div>` : '';

    const notesHTML = p.notes.length ? `
      <div class="route-note-box">
        <strong>ℹ ${p.notes.length} segnalazione/i — merce esistente ma non prelevabile</strong>
        <div style="font-size: var(--md-sys-typescale-body-small-size);margin-top:0.3rem;opacity:0.85">
          Non entra nel percorso. &Egrave; solo un'informazione per l'operatore.
        </div>
        ${p.notes.map(n => `<div class="route-note-row">
          <span class="badge badge-${n.reason === 'quarantine' ? 'red' : 'amber'}">${this._esc(PickRoute.REASON_LABELS[n.reason] || n.reason)}</span>
          <span class="mono">${this._esc(n.article_code)}#${this._esc(n.lot_code)}</span>
          <span class="mono">${this._esc(n.location_code)}</span>
        </div>`).join('')}
      </div>` : '';

    return `
      <div class="route-head-card">
        <div class="route-head-grid">
          <div><span class="route-head-lbl">Ordine</span><span class="route-head-val mono">${this._esc(h.odp_num)}</span></div>
          <div><span class="route-head-lbl">Articolo finito</span><span class="route-head-val mono">${this._esc(h.article_code)}</span></div>
          <div><span class="route-head-lbl">Lotto produzione</span><span class="route-head-val mono">${this._esc(h.lot || '—')}</span></div>
          <div><span class="route-head-lbl">Qt&agrave; prevista</span><span class="route-head-val">${this._esc(h.qty_planned)} ${this._esc(h.um)}</span></div>
        </div>
        <div class="route-head-desc">${this._esc(h.article_desc)}</div>
      </div>

      ${alertHTML}
      ${warnHTML}

      <div class="route-stats">
        <div class="route-stat"><span class="route-stat-val">${p.stops.length}</span><span class="route-stat-lbl">Tappe</span></div>
        <div class="route-stat"><span class="route-stat-val">${Object.keys(bySite).length}</span><span class="route-stat-lbl">Siti</span></div>
        <div class="route-stat"><span class="route-stat-val">${p.offroute.length}</span><span class="route-stat-lbl">Da verificare</span></div>
        <div class="route-stat"><span class="route-stat-val">${p.notes.length}</span><span class="route-stat-lbl">Segnalazioni</span></div>
      </div>

      ${this._routeSiteOrderHTML()}

      ${p.stops.length ? `<div class="route-preview">
        <strong style="font-size: var(--md-sys-typescale-body-medium-size)">🧭 Anteprima percorso</strong>
        ${p.stops.map(s => `<div class="route-prev-row">
          <span class="route-prev-seq">${s.seq}</span>
          <span class="mono route-prev-loc">${this._esc(s.location_code)}</span>
          <span class="route-prev-art"><span class="mono">${this._esc(s.article_code)}</span> · <span class="mono">${this._esc(s.lot_code)}</span></span>
          <span class="route-prev-kg">${this._fmtKg(s.kg_required)} ${this._esc(s.um)}</span>
          ${s.alternatives.length ? `<span class="badge badge-muted">+${s.alternatives.length} alt.</span>` : ''}
        </div>`).join('')}
      </div>` : '<div class="pick-cart-empty">Nessuna tappa percorribile: tutte le righe finiscono in coda.</div>'}

      ${notesHTML}

      <div style="display:flex;gap:0.5rem;margin-top:0.8rem">
        <button class="btn btn-primary" style="flex:1;font-weight:800;min-height:var(--md-touch)"
          onclick="App._routeStart()" ${p.stops.length ? '' : 'disabled'}>🧭 AVVIA PERCORSO (${p.stops.length})</button>
      </div>`;
  },

  _routeTailRowHTML(o) {
    return `<div class="route-tail-row">
      <span class="badge badge-${o.reason === 'not_mapped' ? 'muted' : o.reason === 'marked_missing' ? 'red' : 'amber'}">${this._esc(PickRoute.REASON_LABELS[o.reason] || o.reason)}</span>
      <span class="mono">${this._esc(o.article_code)}#${this._esc(o.lot_code)}</span>
      <span class="route-tail-desc">${this._esc(o.description || '')}</span>
      <span class="route-tail-kg">${this._fmtKg(o.kg_required)} ${this._esc(o.um || '')}</span>
      <div class="route-tail-detail">${this._esc(o.detail || '')}${o.forced_note ? ' — ' + this._esc(o.forced_note) : ''}</div>
    </div>`;
  },

  /* Ordine dei siti: riordinabile e persistito. Vive qui, dove è
     effettivamente rilevante, invece che sepolto in Config. */
  _routeSiteOrderHTML() {
    const order = PickRoute.getSiteOrder();
    if (order.length < 2) return '';
    return `<div class="route-siteorder">
      <strong style="font-size: var(--md-sys-typescale-body-medium-size)">🏭 Ordine di visita dei siti</strong>
      <div style="font-size: var(--md-sys-typescale-body-small-size);opacity:0.8;margin:0.2rem 0 0.4rem">
        Il percorso &egrave; costruito un sito per volta, in questa sequenza.
      </div>
      ${order.map((id, i) => {
        const site = Store.getSite(id);
        return `<div class="route-site-row">
          <span class="route-site-num">${i + 1}</span>
          <span class="route-site-name">${this._esc(site?.name || id)}</span>
          <button class="btn btn-sm btn-icon" onclick="App._routeMoveSite(${i},-1)" ${i === 0 ? 'disabled' : ''} title="Sposta su">↑</button>
          <button class="btn btn-sm btn-icon" onclick="App._routeMoveSite(${i},1)" ${i === order.length - 1 ? 'disabled' : ''} title="Sposta giù">↓</button>
        </div>`;
      }).join('')}
    </div>`;
  },

  _routeMoveSite(idx, delta) {
    const order = PickRoute.getSiteOrder();
    const to = idx + delta;
    if (to < 0 || to >= order.length) return;
    [order[idx], order[to]] = [order[to], order[idx]];
    PickRoute.setSiteOrder(order);
    // Il percorso va ricostruito: l'ordine dei siti ne determina la sequenza
    if (this._routeParsed) {
      const route = PickRoute.build(this._routeParsed.lines);
      this._routeParsed = { ...this._routeParsed, ...route };
    }
    this._formOrdine(document.getElementById('pickSubForm'));
    Feedback.sound('scan');
  },

  /* ─── AVVIO DEL PERCORSO ────────────────────────────────────────── */
  async _routeStart() {
    if (!this._requireOperator('il prelievo guidato da ordine')) return;
    const p = this._routeParsed;
    if (!p?.stops.length) return this.toast('Nessuna tappa da percorrere', 'error');
    this._prodOperator = Validate.clean(document.getElementById('pRouteOperator')?.value) || this._prodOperator;
    const opErr = Validate.operator(this._prodOperator);
    if (opErr) return this.toast(opErr, 'error');

    const existing = Store.getActivePickSession();
    if (existing) {
      const ok = await Dialog.confirm({
        title: 'Chiudere il percorso in corso?',
        message: 'Esiste gi\u00e0 un percorso attivo. Avviandone uno nuovo il precedente viene chiuso.',
        details: Dialog.kv([
          ['Ordine in corso', existing.odp_num],
          ['Tappe completate', `${existing.stops.filter(s => s.status !== 'pending').length} di ${existing.stops.length}`],
          ['Nuovo ordine', p.header.odp_num]
        ]),
        confirmLabel: 'Chiudi e avvia il nuovo', danger: true, icon: '\u26A0'
      });
      if (!ok) return;
      /* I movimenti gi\u00e0 registrati restano: sono su mov_log, non qui. */
      await Store.endPickSession();
    }

    const session = {
      session_id: `PS-${p.header.odp_num.replace(/\s/g, '')}-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      odp_num: p.header.odp_num,
      odp_article: p.header.article_code,
      odp_article_desc: p.header.article_desc,
      odp_lot: p.header.lot,
      odp_qty: `${p.header.qty_planned} ${p.header.um}`,
      operator: this._prodOperator,
      status: 'active',
      created_at: Date.now(),
      site_order: PickRoute.getSiteOrder(),
      stops: p.stops,
      offroute: p.offroute,
      notes: p.notes,
      warnings: p.warnings
    };
    try {
      await Store.startPickSession(session);
    } catch (err) {
      return this.toast(`Avvio non riuscito · ${err.message}`, 'error');
    }
    this._routeParsed = null;
    this._routeStage = 'run';
    this._routeStartTime = Date.now();
    this._routeScan = { loc: '', art: '', lot: '' };
    this._formOrdine(document.getElementById('pickSubForm'));
    this.toast(`Percorso avviato · ${session.stops.length} tappe`, 'success');
    this.updateSyncIndicator();
  },

  _routeResume() {
    this._routeStage = 'run';
    this._routeScan = { loc: '', art: '', lot: '' };
    if (!this._routeStartTime) this._routeStartTime = Date.now();
    this._formOrdine(document.getElementById('pickSubForm'));
  },

  async _routeAbandon() {
    const s = Store.getActivePickSession();
    if (!s) return;
    const done = s.stops.filter(x => x.status === 'done').length;
    const left = s.stops.filter(x => x.status === 'pending').length;
    const ok = await Dialog.confirm({
      title: 'Chiudere il percorso?',
      message: 'I prelievi gi\u00e0 confermati restano registrati a magazzino e a registro: sono stati scritti tappa per tappa. Viene chiusa soltanto la guida al cammino.',
      details: Dialog.kv([
        ['Ordine', s.odp_num],
        ['Tappe confermate', done],
        ['Tappe non percorse', left]
      ]),
      confirmLabel: 'Chiudi percorso', danger: true, icon: '\u26A0'
    });
    if (!ok) return;
    if (done) await this._emitFinalPickReport(s);
    await Store.endPickSession();
    this._routeStage = 'import';
    this._routeStartTime = null;
    this._formOrdine(document.getElementById('pickSubForm'));
    this.toast('Percorso chiuso', 'info');
  },

  /* ─── SCHERMATA 2: ESECUZIONE GUIDATA ───────────────────────────── */
  _renderRouteRun(el) {
    const s = Store.getActivePickSession();
    if (!s) { this._routeStage = 'import'; this._formOrdine(el); return; }

    const done    = s.stops.filter(x => x.status === 'done').length;
    const missing = s.stops.filter(x => x.status === 'missing').length;
    const pending = s.stops.filter(x => x.status === 'pending');
    const current = pending[0] || null;
    const pct     = Math.round(((done + missing) / s.stops.length) * 100);

    el.innerHTML = `
      <div class="route-runbar">
        <div class="route-runbar-top">
          <span class="mono route-runbar-odp">${this._esc(s.odp_num)}</span>
          <span class="route-runbar-count">${done + missing} / ${s.stops.length}</span>
        </div>
        <div class="route-progress"><i style="width:${pct}%"></i></div>
        <div class="route-runbar-legend">
          <span>✓ ${done} prelevate</span>
          <span>✗ ${missing} non trovate</span>
          <span>◻ ${pending.length} da fare</span>
        </div>
      </div>

      <section id="routeCurrent">${current ? this._routeCurrentHTML(current) : this._routeFinishHTML(s)}</section>

      <details class="route-details">
        <summary>Elenco completo delle tappe (${s.stops.length})</summary>
        <div class="route-list">${s.stops.map(st => this._routeListRowHTML(st, current)).join('')}</div>
      </details>

      <div style="display:flex;gap:0.5rem;margin-top:0.7rem;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="App._printRouteReport()">🖨 Report parziale</button>
        <button class="btn btn-sm btn-danger" onclick="App._routeAbandon()">✕ Chiudi percorso</button>
      </div>`;

    if (current) {
      this._routeScan = { loc: '', art: '', lot: '' };
      this.setPrimaryScanField('rLoc');
    } else {
      this.setPrimaryScanField(null);
    }
  },

  _routeCurrentHTML(st) {
    const site = Store.getSite(st.site_id);
    return `
      <article class="route-stop-card">
        <header class="route-stop-head">
          <span class="route-stop-seq">${st.seq}</span>
          <div class="route-stop-title">
            <div class="route-stop-loc mono">${this._esc(st.location_code)}</div>
            <div class="route-stop-site">${this._esc(site?.name || st.site_id || '—')}</div>
          </div>
        </header>

        <div class="route-stop-body">
          <div class="route-stop-kv"><span>Articolo</span><b class="mono">${this._esc(st.article_code)}</b></div>
          <div class="route-stop-kv"><span>Descrizione</span><b>${this._esc(st.article_description || '—')}</b></div>
          <div class="route-stop-kv"><span>Lotto</span><b class="mono">${this._esc(st.lot_code)}</b></div>
          <div class="route-stop-kv"><span>Scadenza</span><b>${this._esc(this._isoToIt(st.expiry_iso))}</b></div>
          <div class="route-stop-kv route-stop-kg"><span>Richiesti da ordine</span><b>${this._fmtKg(st.kg_required)} ${this._esc(st.um)}</b></div>
          <div class="route-stop-kv"><span>Colli disponibili</span><b>${st.qty_available}</b></div>
        </div>

        ${this._avvisiBanda(st.article_code)}

        ${st.alternatives.length ? `<div class="route-alt">
          <strong>Altre ubicazioni con lo stesso articolo e lotto:</strong>
          ${st.alternatives.map(a => `<span class="badge badge-muted mono">${this._esc(a.location_code)} · ${a.qty_available} Coll.</span>`).join(' ')}
          <div style="font-size: var(--md-sys-typescale-label-small-size);margin-top:0.25rem;opacity:0.8">Scansionandone una, la tappa si sposta l&agrave;.</div>
        </div>` : ''}

        <div class="form-group" style="margin:0.6rem 0 0.4rem">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div style="display:flex;gap:0.3rem">
          <input class="input input-mono" id="rLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('rLoc')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('rLoc');App._routeCheckLoc();}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('rLoc','_routeCheckLoc')" title="Sfoglia le ubicazioni">📍</button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono" id="rArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCheckArt();}">
        </div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="rLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCheckLot();}">
        </div>

        <div id="rFeedback"></div>

        <div style="display:flex;gap:0.5rem;margin-top:0.6rem;flex-wrap:wrap">
          <button class="btn btn-primary" style="flex:1;font-weight:800;min-height:var(--md-touch)"
            onclick="App._routeConfirmStop()">✓ CONFERMA PRELIEVO</button>
          <button class="btn btn-warning" style="min-height:var(--md-touch)"
            onclick="App._routeMarkMissing()">✗ Non trovato</button>
        </div>
      </article>`;
  },

  _routeListRowHTML(st, current) {
    const isCur = current && st.seq === current.seq;
    const icon = st.status === 'done' ? '✓' : st.status === 'missing' ? '✗' : isCur ? '▶' : '◻';
    const cls  = st.status === 'done' ? 'ok' : st.status === 'missing' ? 'ko' : isCur ? 'cur' : '';
    return `<div class="route-list-row ${cls}">
      <span class="route-list-ico">${icon}</span>
      <span class="route-list-seq">${st.seq}</span>
      <span class="mono route-list-loc">${this._esc(st.location_code)}</span>
      <span class="mono route-list-art">${this._esc(st.article_code)}#${this._esc(st.lot_code)}</span>
      <span class="route-list-kg">${this._fmtKg(st.kg_required)} ${this._esc(st.um)}</span>
      ${st.status === 'done' ? `<span class="badge badge-green">${st.qty_picked} Coll.</span>` : ''}
      ${st.forced_note ? `<span class="badge badge-amber" title="${this._esc(st.forced_note)}">forzata</span>` : ''}
    </div>`;
  },

  /* ─── VERIFICHE DI SCANSIONE ────────────────────────────────────── */

  /* Ubicazione. Accetta quella prevista o una delle alternative: in tal caso
     la tappa si sposta, perché la merce è la stessa e l'operatore è già lì. */
  _routeCheckLoc() {
    const st = this._routeCurrentStop();
    if (!st) return;
    const val = Validate.clean(document.getElementById('rLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val === st.location_code) {
      this._routeScan.loc = val;
      this._routeFb('ok', `Ubicazione ${val} confermata`);
      document.getElementById('rArt')?.focus();
      return;
    }
    const alt = st.alternatives.find(a => a.location_code === val);
    if (alt) {
      this._routeScan.loc = val;
      this._routeSwitchToAlternative(st, alt);
      return;
    }
    this._routeBlock('rLoc', 'Ubicazione errata',
      `Attesa ${st.location_code}, scansionata ${val}.`,
      async (note) => {
        if (!Store.locationExists(val)) {
          this.toast(`L'ubicazione ${val} non esiste a sistema`, 'error');
          return false;
        }
        st.location_code = val;
        st.forced_note = `Ubicazione forzata (attesa ${st.location_code}): ${note}`;
        this._routeScan.loc = val;
        await this._routeSave();
        return true;
      });
  },

  async _routeSwitchToAlternative(st, alt) {
    const s = Store.getActivePickSession();
    const old = st.location_code;
    st.alternatives = [
      { location_code: old, item_key: st.item_key, qty_available: Store.getAvailableQty(old, st.item_key) },
      ...st.alternatives.filter(a => a.location_code !== alt.location_code)
    ];
    st.location_code = alt.location_code;
    st.item_key = alt.item_key;
    st.qty_available = alt.qty_available;
    const g = Store.buildLocationGeometry().get(alt.location_code);
    if (g) st.site_id = g.site_id;
    await Store.savePickSession(s);
    this._routeFb('ok', `Tappa spostata su ${alt.location_code} (ubicazione alternativa)`);
    Feedback.signal('info', 'Ubicazione alternativa',
      `La merce viene prelevata da ${alt.location_code} invece che da ${old}.`);
    this._renderRouteRun(document.getElementById('pickSubForm'));
    document.getElementById('rLoc').value = alt.location_code;
    this._routeScan.loc = alt.location_code;
    document.getElementById('rArt')?.focus();
  },

  _routeCheckArt() {
    const st = this._routeCurrentStop();
    if (!st) return;
    if (!this._routeScan.loc) {
      this._routeFb('error', 'Scansiona prima l\u2019ubicazione');
      document.getElementById('rLoc')?.focus();
      return;
    }
    const val = Validate.clean(document.getElementById('rArt')?.value, true);
    if (!val) return;
    if (val === st.article_code) {
      this._routeScan.art = val;
      this._routeFb('ok', `Articolo ${val} confermato`);
      document.getElementById('rLot')?.focus();
      return;
    }
    this._routeBlock('rArt', 'Articolo errato',
      `Atteso ${st.article_code}, scansionato ${val}.`,
      async (note) => {
        st.forced_note = `${st.forced_note ? st.forced_note + ' | ' : ''}Articolo forzato (atteso ${st.article_code}, letto ${val}): ${note}`;
        this._routeScan.art = st.article_code;
        await this._routeSave();
        return true;
      });
  },

  _routeCheckLot() {
    const st = this._routeCurrentStop();
    if (!st) return;
    if (!this._routeScan.art) {
      this._routeFb('error', 'Scansiona prima l\u2019articolo');
      document.getElementById('rArt')?.focus();
      return;
    }
    const val = Validate.clean(document.getElementById('rLot')?.value);
    if (!val) return;
    if (val === st.lot_code) {
      this._routeScan.lot = val;
      this._routeFb('ok', 'Lotto confermato — pronto per la conferma');
      return;
    }
    this._routeBlock('rLot', 'Lotto errato',
      `Atteso ${st.lot_code}, scansionato ${val}. Il lotto \u00e8 assegnato dall\u2019ordine di produzione: forzarlo altera la tracciabilit\u00e0.`,
      async (note) => {
        st.forced_note = `${st.forced_note ? st.forced_note + ' | ' : ''}Lotto forzato (atteso ${st.lot_code}, letto ${val}): ${note}`;
        this._routeScan.lot = st.lot_code;
        await this._routeSave();
        return true;
      });
  },

  async _routeBlock(fieldId, title, message, onForce) {
    return this._scanBlock({
      fieldId, title, message, onForce,
      fbId: 'rFeedback',
      onUnlocked: () => this._renderRouteRun(document.getElementById('pickSubForm'))
    });
  },

  async _scanBlock({ fieldId, title, message, onForce, fbId, onUnlocked }) {
    Feedback.signal('error', title, message);
    this._scanFb(fbId, 'error', `${title} — ${message}`);
    const el = document.getElementById(fieldId);
    el?.select();
    const proceed = await Dialog.confirm({
      title,
      message: message + '\n\nCorreggere la scansione, oppure sbloccare motivando.',
      confirmLabel: 'Sblocca motivando', cancelLabel: 'Correggo la scansione',
      danger: true, icon: '⛔'
    });
    if (!proceed) { el?.focus(); el?.select(); return; }
    const note = await Dialog.reason({
      title: 'Motivazione dello sblocco',
      message: 'Il testo viene registrato nelle note del movimento e compare sul documento.',
      placeholder: 'Es. etichetta danneggiata, verificato su Sage con CQ…',
      minLen: 8, confirmLabel: 'Sblocca', danger: true, icon: '⚠'
    });
    if (!note) { el?.focus(); return; }
    const ok = await onForce(note);
    if (ok) {
      this._scanFb(fbId, 'warn', `Sbloccato con motivazione: ${note}`);
      Feedback.signal('warn', 'Scansione sbloccata', 'La motivazione è stata registrata.');
      onUnlocked?.();
    }
  },

  /* Riscontro d'angolo, per qualunque modulo che verifichi scansioni. */
  _scanFb(fbId, kind, msg) {
    const el = document.getElementById(fbId);
    if (!el) return;
    const cls = kind === 'ok' ? 'mov-preview-ok' : kind === 'warn' ? 'mov-preview-warn' : 'mov-preview-err';
    el.innerHTML = `<div class="mov-preview ${cls}"><span style="font-weight:700">${this._esc(msg)}</span></div>`;
  },

  _routeFb(kind, msg) { this._scanFb('rFeedback', kind, msg); },

  _routeCurrentStop() {
    const s = Store.getActivePickSession();
    return s ? (s.stops.find(x => x.status === 'pending') || null) : null;
  },

  async _routeSave() {
    const s = Store.getActivePickSession();
    if (s) await Store.savePickSession(s);
  },

  async _routeConfirmStop() {
    const session = Store.getActivePickSession();
    const st = this._routeCurrentStop();
    if (!session || !st) return;
    if (!this._requireOperator('il prelievo guidato')) return;

    if (!this._routeScan.loc || !this._routeScan.art || !this._routeScan.lot) {
      Feedback.signal('error', 'Scansioni incomplete',
        'Servono ubicazione, articolo e lotto prima di confermare.');
      return;
    }

    // ── Re-check sullo stato attuale, non su quello di quando è nato il percorso
    const bucket = Store.getItemsAtLocation(st.location_code);
    const full = bucket.find(x => x.item_key === st.item_key);
    if (!full) {
      return this.toast(`${st.article_code}#${st.lot_code} non \u00e8 pi\u00f9 presente in ${st.location_code}`, 'error');
    }
    if (Store.isItemQuarantined(st.item_key, st.location_code)) {
      return this.toast(`${st.article_code}#${st.lot_code} \u00e8 stato messo in QUARANTENA: prelievo non consentito`, 'error');
    }
    const avail = Store.getAvailableQty(st.location_code, st.item_key);
    if (avail <= 0) {
      return this.toast(`${st.article_code}#${st.lot_code}: nessun collo disponibile (impegnato su DDT pendente)`, 'error');
    }

    // ── Quantità in COLLI. I kg dell'ordine restano un dato informativo:
    //    la giacenza a peso vive su Sage, qui si tracciano i colli.
    const qty = await Dialog.qty({
      title: 'Colli prelevati',
      message: `Ordine: ${this._fmtKg(st.kg_required)} ${st.um}. Indicare quanti COLLI vengono portati via.`,
      details: Dialog.kv([
        ['Ubicazione', st.location_code],
        ['Articolo', st.article_code],
        ['Lotto', st.lot_code],
        ['Colli disponibili', avail]
      ]),
      value: avail, min: 1, max: avail, unit: 'Coll.'
    });
    if (qty === null) return;

    /* 1.8 — quali colli, sulla riga che l'operatore ha davanti. Il numero
       chiesto sopra resta la misura del prelievo; l'elenco dice quali colli
       lasciano lo scaffale, e su un lotto imballato in due misure diverse i
       due dati non sono lo stesso dato. */
    const scelteColli = await this._chiediColli(
      { article_code: st.article_code, lot_code: st.lot_code, location_code: st.location_code, item_key: st.item_key,
        ...(Store.getItemsAtLocation(st.location_code).find(i => i.item_key === st.item_key) || {}) },
      'Quali colli si prelevano');
    if (scelteColli === undefined) return this.toast('Prelievo annullato', 'info');

    const effectiveUser = this._prodOperator || Store.getCurrentIdentity().initials;
    const notes = st.forced_note || '';
    let removed = null;

    try {
      removed = await Store.commitPickStop({
        session,
        stop: st,
        qty,
        scelte: scelteColli,
        movement: {
          type: MOV.PICK,
          article_code: st.article_code,
          article_description: st.article_description,
          lot_code: st.lot_code,
          location_code: st.location_code,
          dest_location: null,
          user: effectiveUser,
          notes,
          doc_ref: session.odp_num,
          ts: Date.now()
        }
      });
    } catch (err) {
      console.error('[WM] _routeConfirmStop:', err);
      st.status = 'pending'; st.qty_picked = 0; st.done_at = null;
      return this.toast(`Prelievo non registrato \u00b7 ${err.message} \u2014 nessuna modifica applicata`, 'error');
    }

    /* Il registro di sessione a video e la finestra di storno restano
       coerenti con gli altri flussi. */
    this._movSessionLog.unshift({
      type: MOV.PICK, article_code: st.article_code, article_description: st.article_description,
      lot_code: st.lot_code, location_code: st.location_code, dest_location: null,
      user: effectiveUser, notes, doc_ref: session.odp_num, ts: Date.now(),
      qty_before: removed._qty_before, qty_delta: removed._qty_delta, qty_after: removed._qty_after
    });
    if (this._movSessionLog.length > 100) this._movSessionLog.length = 100;

    this._pushUndo(`Tappa ${st.seq} — ${st.article_code}#${st.lot_code} da ${st.location_code} (${qty} Coll.)`,
      [{ op: 'add', loc: st.location_code, art: st.article_code, desc: st.article_description,
         lot: st.lot_code, exp: full.expiry_date || '', notes: full.notes || '', qty }]);

    Feedback.signal('ok', `Tappa ${st.seq} completata`, `${qty} Coll. da ${st.location_code}`);
    this.updateSyncIndicator();
    this._renderRouteRun(document.getElementById('pickSubForm'));
    this._refreshSessionLog();
  },

  async _routeMarkMissing() {
    const session = Store.getActivePickSession();
    const st = this._routeCurrentStop();
    if (!session || !st) return;
    const note = await Dialog.reason({
      title: 'Merce non trovata',
      message: `Tappa ${st.seq} — ${st.article_code}#${st.lot_code} in ${st.location_code}.\nLa tappa viene marcata e il percorso prosegue.`,
      placeholder: 'Es. ubicazione vuota, pallet non reperibile, bancale spostato…',
      minLen: 5, confirmLabel: 'Marca non trovato', icon: '\u2717'
    });
    if (!note) return;
    st.status = 'missing';
    st.reason = 'marked_missing';
    st.forced_note = note;
    st.done_at = Date.now();
    try {
      await Store.savePickSession(session);
    } catch (err) {
      st.status = 'pending';
      return this.toast(`Salvataggio non riuscito · ${err.message}`, 'error');
    }
    Feedback.signal('warn', 'Tappa marcata come non trovata', 'Finir\u00e0 in coda al percorso.');
    this._renderRouteRun(document.getElementById('pickSubForm'));
  },

  /* ─── SCHERMATA 3: CHIUSURA ─────────────────────────────────────── */
  _routeFinishHTML(s) {
    const done    = s.stops.filter(x => x.status === 'done');
    const missing = s.stops.filter(x => x.status === 'missing');
    const tail    = [
      ...missing.map(x => ({
        article_code: x.article_code, description: x.article_description, lot_code: x.lot_code,
        kg_required: x.kg_required, um: x.um, reason: 'marked_missing',
        detail: `Ubicazione prevista ${x.location_code}.`, forced_note: x.forced_note
      })),
      ...s.offroute
    ];
    return `
      <div class="route-done">
        <div class="route-done-ico">✓</div>
        <strong>Percorso completato</strong>
        <div>${done.length} tappe prelevate su ${s.stops.length} per l'ordine ${this._esc(s.odp_num)}.</div>
      </div>

      ${tail.length ? `<div class="route-tail">
        <strong style="font-size: var(--md-sys-typescale-body-medium-size)">📋 Da recuperare fuori percorso (${tail.length})</strong>
        <div style="font-size: var(--md-sys-typescale-body-small-size);opacity:0.85;margin:0.2rem 0 0.4rem">
          Righe non prelevabili dalle aree mappate: materiale stoccato fuori mappatura,
          lotti assenti o merce non reperita.
        </div>
        ${tail.map(o => this._routeTailRowHTML(o)).join('')}
      </div>` : '<div class="pick-cart-empty">Nessuna riga rimasta in sospeso.</div>'}

      ${s.notes?.length ? `<div class="route-note-box">
        <strong>ℹ ${s.notes.length} segnalazione/i — merce esistente ma non prelevabile</strong>
        ${s.notes.map(n => `<div class="route-note-row">
          <span class="badge badge-${n.reason === 'quarantine' ? 'red' : 'amber'}">${this._esc(PickRoute.REASON_LABELS[n.reason] || n.reason)}</span>
          <span class="mono">${this._esc(n.article_code)}#${this._esc(n.lot_code)}</span>
          <span class="mono">${this._esc(n.location_code)}</span>
        </div>`).join('')}
      </div>` : ''}

      <div style="display:flex;gap:0.5rem;margin-top:0.8rem;flex-wrap:wrap">
        <button class="btn btn-primary" style="flex:1;font-weight:800;min-height:var(--md-touch)"
          onclick="App._routeClose()">✓ CHIUDI E STAMPA REPORT</button>
      </div>`;
  },

  async _routeClose() {
    const s = Store.getActivePickSession();
    if (!s) return;
    await this._emitFinalPickReport(s);
    await Store.endPickSession();
    this._routeStage = 'import';
    this._routeStartTime = null;
    this._formOrdine(document.getElementById('pickSubForm'));
    this.toast(`Percorso ${s.odp_num} chiuso`, 'success');
  },

  /* ─── RIPRESA ALL'AVVIO ─────────────────────────────────────────── */
  /* Chiamata da init(). Se una sessione è sopravvissuta a una chiusura
     imprevista, l'operatore la ritrova qui invece di doverla ricostruire. */
  async _checkPendingPickSession() {
    const s = Store.getActivePickSession();
    if (!s) return;
    const done    = s.stops.filter(x => x.status === 'done').length;
    const missing = s.stops.filter(x => x.status === 'missing').length;
    const left    = s.stops.filter(x => x.status === 'pending').length;
    if (!left) return;                       // già concluso: si riprende dalla scheda
    const resume = await Dialog.confirm({
      title: 'Percorso di prelievo in corso',
      message: 'Un percorso non \u00e8 stato concluso. I prelievi gi\u00e0 confermati sono registrati: qui si riprende soltanto il cammino rimasto.',
      details: Dialog.kv([
        ['Ordine', s.odp_num],
        ['Operatore', s.operator],
        ['Avviato il', new Date(s.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
        ['Tappe confermate', done],
        ['Non trovate', missing || null],
        ['Ancora da fare', left]
      ]),
      confirmLabel: 'Riprendi', cancelLabel: 'Non ora', icon: '\u23F8'
    });
    if (!resume) return;
    this._routeStage = 'run';
    this._pickSubMode = 'ordine';
    this.switchView('movimenta');
    this.startMov('prelievo');
    setTimeout(() => this._pickSub('ordine'), 60);
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

  _PICK_REPORT_VER: '1.0',

  _fmtDurLong(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '—';
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  },
  _fmtClock(ts) {
    return ts ? new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
  },
  _fmtStamp(ts) {
    return ts ? new Date(ts).toLocaleString('it-IT',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  },
  _fmtDayShort(ts) {
    return ts ? new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '';
  },

  _pickDocId(prefix, odpNum, ts) {
    const core = String(odpNum || 'NA').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'NA';
    return `${prefix}-${core}-${ts.toString(36).toUpperCase().slice(-6)}`;
  },

  /* ─── NORMALIZZATORE A) sessione di prelievo guidato ─────────────── */
  _pickSnapFromSession(s, endTs = Date.now(), opt = {}) {
    const done    = s.stops.filter(x => x.status === 'done');
    const missing = s.stops.filter(x => x.status === 'missing');
    const pending = s.stops.filter(x => x.status === 'pending');

    return {
      doc_id: this._pickDocId('PG', s.odp_num, endTs),
      kind: 'route',
      app_ver: this._PICK_REPORT_VER,
      partial: !!opt.partial,
      degraded: false,
      odp_num: s.odp_num || '',
      odp_article: s.odp_article || '',
      odp_article_desc: s.odp_article_desc || '',
      odp_lot: s.odp_lot || '',
      odp_qty: s.odp_qty || '',
      operator: s.operator || '',
      session_id: s.session_id || null,
      started_at: s.created_at || endTs,
      ended_at: endTs,
      closed_at: endTs,
      stops_total: s.stops.length,
      rows: done.map(x => ({
        seq: x.seq,
        article_code: x.article_code,
        article_description: x.article_description || '',
        lot_code: x.lot_code,
        location_code: x.location_code,
        kg_required: x.kg_required,
        um: x.um || '',
        qty_picked: x.qty_picked || 0,
        done_at: x.done_at || null
      })),
      tail: [
        ...missing.map(x => ({
          article_code: x.article_code, description: x.article_description || '',
          lot_code: x.lot_code, kg_required: x.kg_required, um: x.um || '',
          label: 'Non trovato dall’operatore',
          detail: `Ubicazione prevista ${x.location_code}. ${x.forced_note || ''}`.trim()
        })),
        ...pending.map(x => ({
          article_code: x.article_code, description: x.article_description || '',
          lot_code: x.lot_code, kg_required: x.kg_required, um: x.um || '',
          label: 'Tappa non percorsa',
          detail: `Ubicazione prevista ${x.location_code}. Percorso chiuso prima della tappa.`
        })),
        ...(s.offroute || []).map(o => ({
          article_code: o.article_code, description: o.description || '',
          lot_code: o.lot_code, kg_required: o.kg_required, um: o.um || '',
          label: PickRoute.REASON_LABELS[o.reason] || o.reason || 'Fuori percorso',
          detail: o.detail || ''
        }))
      ],
      notes: (s.notes || []).map(n => ({
        article_code: n.article_code, lot_code: n.lot_code, location_code: n.location_code,
        label: PickRoute.REASON_LABELS[n.reason] || n.reason || '', detail: n.detail || ''
      })),
      warnings: [...(s.warnings || [])]
    };
  },

  /* ─── NORMALIZZATORE B) flusso a carrello ────────────────────────── */
  _pickSnapFromCart(cart, meta = {}) {
    const endTs = meta.ended_at || Date.now();
    return {
      doc_id: this._pickDocId('PP', meta.odp_num, endTs),
      kind: 'cart',
      app_ver: this._PICK_REPORT_VER,
      partial: false,
      degraded: false,
      odp_num: meta.odp_num || '',
      odp_article: '', odp_article_desc: '', odp_lot: '', odp_qty: '',
      operator: meta.operator || '',
      session_id: null,
      started_at: meta.started_at || endTs,
      ended_at: endTs,
      closed_at: endTs,
      stops_total: cart.length,
      rows: cart.map(it => ({
        seq: null,
        article_code: it.article_code,
        article_description: it.article_description || '',
        lot_code: it.lot_code,
        location_code: it.location_code,
        kg_required: null,
        um: '',
        qty_picked: it.qty_pick || Math.abs(it._qty_delta || 0) || 1,
        done_at: null
      })),
      tail: [], notes: [], warnings: []
    };
  },

  /* ─── NORMALIZZATORE C) registro movimenti (solo ripiego) ────────── */
  _pickSnapFromLog(movs, ref) {
    const start = movs[0].ts, end = movs[movs.length - 1].ts;
    const notes = [...new Set(movs.map(m => m.notes).filter(Boolean))];
    return {
      doc_id: this._pickDocId('PP', ref, end),
      kind: 'log',
      app_ver: this._PICK_REPORT_VER,
      partial: false,
      degraded: true,
      odp_num: ref || '',
      odp_article: '', odp_article_desc: '', odp_lot: '', odp_qty: '',
      operator: [...new Set(movs.map(m => m.user).filter(Boolean))].join(', '),
      session_id: null,
      started_at: start,
      ended_at: end,
      closed_at: end,
      stops_total: movs.length,
      rows: movs.map(m => ({
        seq: null,
        article_code: m.article_code || '',
        article_description: m.article_description || '',
        lot_code: m.lot_code || '',
        location_code: m.location_code || '',
        kg_required: null,
        um: '',
        qty_picked: m.qty_delta != null ? Math.abs(m.qty_delta) : 1,
        done_at: m.ts
      })),
      tail: [], notes: [],
      warnings: notes.map(n => `Nota registrata sul movimento: ${n}`)
    };
  },

  /* ─── TEMPLATE UNICO ─────────────────────────────────────────────── */
  _buildPickReportHTML(snap, opt = {}) {
    const E = v => this._esc(v == null ? '' : v);
    const reprint = !!opt.reprint;
    const printTs = opt.printed_at || Date.now();

    /* ── Tempi. Tutto discende da started_at/ended_at dello snapshot,
          congelati alla chiusura: identici a ogni ristampa. ── */
    const nRows   = snap.rows.length;
    const durSec  = Math.max(0, Math.round(((snap.ended_at || 0) - (snap.started_at || 0)) / 1000));
    const avgSec  = nRows > 0 ? durSec / nRows : null;
    const sameDay = this._fmtDayShort(snap.started_at) === this._fmtDayShort(snap.ended_at);

    const totColli   = snap.rows.reduce((a, r) => a + (r.qty_picked || 0), 0);
    const uniqueLocs = new Set(snap.rows.map(r => r.location_code).filter(Boolean)).size;

    const kgCell = (kg, um) => {
      if (kg == null || kg === '') return '<span style="color:#999">—</span>';
      const u = String(um || '').trim().toUpperCase();
      const suffix = (u && u !== 'KG') ? ` <span style="font-size:7pt;color:#666">${E(um)}</span>` : '';
      return `${E(this._fmtKg(kg))}${suffix}`;
    };

    const rowsHTML = snap.rows.map((r, i) => `<tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-num">${r.seq != null ? E(r.seq) : '<span style="color:#999">—</span>'}</td>
      <td class="td-code">${E(r.article_code || '—')}</td>
      <td>${E(r.article_description || '—')}${this._avvisiRigaStampa(r.article_code)}</td>
      <td class="td-lot">${E(r.lot_code || '—')}</td>
      <td class="td-loc">${E(r.location_code || '—')}</td>
      <td class="td-num">${kgCell(r.kg_required, r.um)}</td>
      <td class="td-num" style="font-weight:700">${E(r.qty_picked)}</td>
    </tr>`).join('');

    const tailHTML = snap.tail.map((t, i) => `<tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-code">${E(t.article_code || '—')}</td>
      <td>${E(t.description || '—')}${this._avvisiRigaStampa(t.article_code)}</td>
      <td class="td-lot">${E(t.lot_code || '—')}</td>
      <td class="td-num">${kgCell(t.kg_required, t.um)}</td>
      <td style="font-weight:600">${E(t.label)}</td>
      <td style="font-size:7.5pt">${E(t.detail)}</td>
      <td class="pr-check-col"><span class="pr-box"></span></td>
    </tr>`).join('');

    const notesHTML = snap.notes.map((n, i) => `<tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-code">${E(n.article_code || '—')}</td>
      <td class="td-lot">${E(n.lot_code || '—')}</td>
      <td class="td-loc">${E(n.location_code || '—')}</td>
      <td>${E(n.label)}${n.detail ? ' — ' + E(n.detail) : ''}</td>
    </tr>`).join('');

    const bands = [
      reprint ? `<div class="pr-reprint">
        <strong>RISTAMPA — COPIA CONFORME</strong>
        Copia del report emesso il ${E(this._fmtStamp(snap.closed_at))}, ristampata il ${E(this._fmtStamp(printTs))}.
        Dati, tempi e identificativo del documento sono quelli dell’originale, che questa copia non sostituisce.
      </div>` : '',
      snap.degraded ? `<div class="pr-reprint pr-reprint-warn">
        <strong>DOCUMENTO RICOSTRUITO DAL REGISTRO MOVIMENTI</strong>
        Ordine prelevato con una versione precedente dell’applicativo: il report originale non esiste.
        Numero di tappa, kg d’ordine, righe fuori percorso e segnalazioni NON sono disponibili.
        I tempi indicati sono quelli del primo e dell’ultimo movimento registrato.
      </div>` : '',
      snap.partial ? `<div class="pr-reprint pr-reprint-warn">
        <strong>REPORT PARZIALE — PRELIEVO NON CONCLUSO</strong>
        ${snap.kind === 'cart'
          ? 'Contenuto del carrello all’ora indicata: i prelievi NON sono ancora stati confermati e la giacenza non è stata scaricata.'
          : 'Fotografia dello stato di avanzamento all’ora indicata: il percorso è ancora aperto.'}
        Il report definitivo viene emesso alla conferma del prelievo e non è questo foglio.
      </div>` : ''
    ].join('');

    /* Blocco d'identificazione: l'ordine di produzione. Sta nella fascia
       di testata, dove ogni documento mette cio' che lo identifica. */
    const headExtra = `<div class="doc-idblock doc-idblock--3">
        ${this._docCell('N° ordine produzione', snap.odp_num)}
        ${this._docCell('Lotto produzione', snap.odp_lot)}
        ${this._docCell('Quantità ordine', snap.odp_qty)}
        ${this._docCell('Articolo finito',
            snap.odp_article ? snap.odp_article + (snap.odp_article_desc ? ' — ' + snap.odp_article_desc : '') : '',
            'doc-cell--wide')}
        ${this._docCell('Operatore', snap.operator)}
      </div>`;

    const body = `
      ${bands}

      <div class="pr-sec">Tempi di prelievo</div>
      <div class="pr-times">
        <div class="pr-time-cell">
          <div class="pr-time-lbl">Inizio</div>
          <div class="pr-time-val">${E(this._fmtClock(snap.started_at))}</div>
          <div class="pr-time-sub">${E(this._fmtDayShort(snap.started_at))}</div>
        </div>
        <div class="pr-time-cell">
          <div class="pr-time-lbl">Fine</div>
          <div class="pr-time-val">${E(this._fmtClock(snap.ended_at))}</div>
          <div class="pr-time-sub">${sameDay ? 'stessa giornata' : E(this._fmtDayShort(snap.ended_at))}</div>
        </div>
        <div class="pr-time-cell">
          <div class="pr-time-lbl">Durata totale</div>
          <div class="pr-time-val">${E(this._fmtDurLong(durSec))}</div>
          <div class="pr-time-sub">da inizio a chiusura</div>
        </div>
        <div class="pr-time-cell pr-time-key">
          <div class="pr-time-lbl">Tempo medio di prelievo</div>
          <div class="pr-time-val">${avgSec != null ? E(this._fmtDurLong(avgSec)) : '—'}</div>
          <div class="pr-time-sub">durata ÷ ${nRows} ${nRows === 1 ? 'prelievo' : 'prelievi'}</div>
        </div>
      </div>

      <div class="pr-summary">
        <div class="pr-summary-item">
          <div class="pr-summary-val">${nRows}${snap.stops_total > nRows ? `<span style="font-size:9pt;color:#666">/${snap.stops_total}</span>` : ''}</div>
          <div class="pr-summary-lbl">Righe Prelevate</div></div>
        <div class="pr-summary-item"><div class="pr-summary-val">${totColli}</div><div class="pr-summary-lbl">Colli Prelevati</div></div>
        <div class="pr-summary-item"><div class="pr-summary-val">${uniqueLocs}</div><div class="pr-summary-lbl">Ubicazioni</div></div>
        <div class="pr-summary-item"><div class="pr-summary-val">${snap.tail.length}</div><div class="pr-summary-lbl">Righe da Recuperare</div></div>
      </div>

      <div class="pr-sec">Righe prelevate</div>
      <table class="pr-table">
        <thead><tr>
          <th style="width:22px">#</th>
          <th style="width:40px;text-align:center">Tappa</th>
          <th style="width:86px">Codice</th>
          <th>Descrizione</th>
          <th style="width:76px">Lotto</th>
          <th style="width:100px">Ubicazione</th>
          <th style="width:66px;text-align:center">Kg ordine</th>
          <th style="width:58px;text-align:center">Colli prelevati</th>
        </tr></thead>
        <tbody>${rowsHTML || '<tr class="pr-empty-row"><td colspan="8">Nessuna riga prelevata</td></tr>'}</tbody>
      </table>

      ${snap.tail.length ? `
      <div class="pr-sec">Da recuperare fuori percorso
        <span class="pr-sec-note">— barrare la casella a recupero avvenuto</span></div>
      <table class="pr-table">
        <thead><tr>
          <th style="width:22px">#</th>
          <th style="width:86px">Codice</th>
          <th>Descrizione</th>
          <th style="width:76px">Lotto</th>
          <th style="width:66px;text-align:center">Kg ordine</th>
          <th style="width:104px">Motivo</th>
          <th>Dettaglio</th>
          <th class="pr-check-col">Recuperato</th>
        </tr></thead>
        <tbody>${tailHTML}</tbody>
      </table>` : ''}

      ${notesHTML ? `
      <div class="pr-sec">Segnalazioni
        <span class="pr-sec-note">— merce presente in ubicazione ma non prelevabile</span></div>
      <table class="pr-table">
        <thead><tr>
          <th style="width:22px">#</th>
          <th style="width:86px">Codice</th>
          <th style="width:76px">Lotto</th>
          <th style="width:100px">Ubicazione</th>
          <th>Motivo</th>
        </tr></thead>
        <tbody>${notesHTML}</tbody>
      </table>` : ''}

      ${snap.warnings?.length ? `
      <div class="pr-sec">Avvisi rilevati sui dati dell’ordine</div>
      <ul class="pr-warn-list">
        ${snap.warnings.map(w => `<li>${E(w)}</li>`).join('')}
      </ul>` : ''}`;

    return this._docPageHTML({
      kind: 'REPORT DI PRELIEVO',
      kindSub: 'Ordine di produzione',
      num: snap.odp_num || snap.doc_id,
      dateLabel: reprint ? 'originale del' : 'del',
      dateVal: this._fmtStamp(snap.closed_at),
      headExtra, body,
      docId: snap.doc_id,
      pageClass: 'doc-page--pick',
      printedLabel: reprint ? 'ristampato il' : 'stampato il',
      signs: [
        { role: 'Operatore magazzino', hint: snap.operator || 'Data e firma' },
        { role: 'Responsabile magazzino', hint: 'Data e firma' },
        { role: 'Produzione', hint: 'Ricevuto il' }
      ]
    });
  },

  _emitPickReport(snap, opt = {}) {
    Feedback.clear();   // v1.1.0 [N1] — vedi _docPrint: niente riscontri sopra il foglio
    document.getElementById('printReport').innerHTML =
      this._buildPickReportHTML(snap, { ...opt, printed_at: opt.printed_at || Date.now() });
    window.print();
    setTimeout(() => { document.getElementById('printReport').innerHTML = ''; }, 1500);
  },

  /* ─── REPORT PARZIALE (percorso ancora aperto) ───────────────────── */
  _printRouteReport(sess = null) {
    const s = sess || Store.getActivePickSession();
    if (!s) return this.toast('Nessun percorso da stampare', 'error');
    const concluded = s.stops.filter(x => x.status === 'done' || x.status === 'missing');
    if (!concluded.length) return this.toast('Niente da stampare: nessuna tappa conclusa', 'error');
    this._emitPickReport(this._pickSnapFromSession(s, Date.now(), { partial: true }), { reprint: false });
  },

  /* ─── REPORT DEFINITIVO DI CHIUSURA ──────────────────────────────── */
  async _emitFinalPickReport(s) {
    const snap = this._pickSnapFromSession(s, Date.now(), { partial: false });
    const saved = await Store.archivePickReport(snap);
    this._emitPickReport(snap, { reprint: false });
    if (!saved) {
      this.toast('Report stampato ma non archiviato: la ristampa conforme non sarà disponibile', 'error');
    }
    return snap;
  },

  // ═══ 4. INVENTARIO ═══
  _formInventario(el) {
    if (!el) return;
    /* 1.4.4 — DUE RAMI, UNA FUNZIONE. Di serie l'inventario di vano, quello
       di sempre. Con una Conta avviata, la finestra di guida sulla riga sola
       che il compito indica: è lo stesso mestiere a due granularità, e
       tenerle nella stessa voce di Movimenta evita a chi lavora di dover
       sapere in anticipo quale delle due gli serve. */
    if (this._contaState) { this._contaRenderVerify(el); return; }
    el.innerHTML = `<div class="mov-form-card">
      <h3>📋 <span style="color:var(--sx-warning)">Inventario</span> — Verifica Ubicazione</h3>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① UBICAZIONE</span> → INVIO per caricare → <span class="wf-step">② ✓/✗</span> per ogni item → aggiungi <strong>extra</strong> trovati → <span class="wf-step">③ APPLICA</span>.
      </div>
      <div class="form-group" style="margin-bottom:0.5rem">
        <label>Ubicazione da verificare</label>
        <div style="display:flex;gap:0.3rem">
          <input class="input input-mono" id="mInvLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}" style="flex:1"
            oninput="App._normScan('mInvLoc');App._previewLoc('mInvLoc','mInvLocPrev')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('mInvLoc');App._loadInv();}">
          <button class="btn btn-sm" onclick="App._pickLoc('mInvLoc','_cbPickInv')">📍</button>
          <button class="btn btn-sm btn-primary" onclick="App._loadInv()">Carica</button>
        </div>
        <div id="mInvLocPrev"></div>
      </div>
      <div id="mInvContent"></div>
      <div style="margin-top:0.6rem"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
  },

  _cbPickInv() { setTimeout(() => { App._previewLoc('mInvLoc','mInvLocPrev'); App._loadInv(); }, 30); },

  _loadInv() {
    const loc = Validate.clean(document.getElementById('mInvLoc')?.value, true).replace(/'/g, '-');
    const el = document.getElementById('mInvContent');
    if (!loc) return;
    if (!Store.locationExists(loc)) { el.innerHTML = '<div style="color:var(--sx-danger);font-size: var(--md-sys-typescale-body-small-size);padding:0.3rem">Ubicazione non trovata</div>'; return; }
    const items = Store.getItemsAtLocation(loc);
    // v1.7.0 — counted_qty: null = non ancora contato. confirmed/missing semantica preservata per compatibilità.
    this._invState = { loc, items: items.map(i => ({ ...i, confirmed: false, missing: false, checked: false, counted_qty: null })), extras: [] };
    let html = '<div style="margin-top:0.75rem">';
    html += `<p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);margin-bottom:0.5rem">Sistema: <strong>${items.length}</strong> lotti registrati. Verifica ciascuno: <strong style="color:var(--sx-success)">✓</strong> conferma giacenza · <strong style="color:var(--sx-danger)">✗</strong> mancante totale · <strong style="color:var(--sx-warning)">📋</strong> conta fisica diversa.</p>`;
    if (!items.length) html += '<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);padding:0.3rem">Nessun item registrato</div>';
    else {
      html += '<div>';
      items.forEach((it, idx) => {
        const sysQty = it.qty || 1;
        html += `<div class="inv-item-row" id="invRow${idx}">
          <div class="inv-info">
            <div class="inv-code">${this._esc(it.article_code)} <span style="font-weight:400;color:var(--sx-text-secondary);font-size: var(--md-sys-typescale-body-small-size)">${this._esc(it.article_description || '')}</span></div>
            <div class="inv-lot">Lotto: ${this._esc(it.lot_code)} · Sistema: <strong style="color:var(--sx-accent)">${sysQty} Coll.</strong> <span id="invCountInfo${idx}" style="font-size: var(--md-sys-typescale-label-small-size)"></span></div>
          </div>
          <div class="inv-actions-row">
            <button class="inv-btn" onclick="App._invConfirm(${idx},true)" id="invOk${idx}" title="Conferma quantità di sistema">✓</button>
            <button class="inv-btn" onclick="App._invConfirm(${idx},false)" id="invMiss${idx}" title="Mancante totale (rimuovi tutto)">✗</button>
            <button class="inv-btn" onclick="App._invCount(${idx})" id="invCnt${idx}" title="Conta fisica diversa" style="font-size: var(--md-sys-typescale-body-medium-size)">📋</button>
          </div>
        </div>`;
      });
      html += '</div>';
    }
    html += `<div class="mov-divider"></div>
      <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);margin-bottom:0.4rem"><strong>Item extra</strong> — trovati fisicamente ma non registrati</p>
      <div id="mInvExtras"></div>
      <div style="display:flex;gap:0.3rem;margin-bottom:0.6rem">
        <input class="input input-mono" id="mInvExtraArt" placeholder="Cod. Articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase;flex:1"
          onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('mInvExtraLot').focus();}">
        <input class="input input-mono" id="mInvExtraLot" placeholder="Lotto" maxlength="${Validate.MAX.LOT_CODE}" style="flex:0.8"
          onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('mInvExtraQty').focus();}">
        <input class="input input-mono" id="mInvExtraQty" type="number" min="1" step="1" value="1" placeholder="Coll." style="width:70px;text-align:center"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._invAddExtra();}">
        <button class="btn btn-sm btn-success" onclick="App._invAddExtra()">+</button>
      </div>
      <button class="btn btn-primary" style="width:100%;padding:0.55rem;font-weight:700" onclick="App._execInventario()">📋 APPLICA CORREZIONI</button>
    </div>`;
    el.innerHTML = html;
  },

  _invConfirm(idx, present) {
    if (!this._invState) return;
    this._invState.items[idx].confirmed = present;
    this._invState.items[idx].missing = !present;
    this._invState.items[idx].checked = true;
    this._invState.items[idx].counted_qty = null;  // reset eventuale conta precedente
    const row = document.getElementById(`invRow${idx}`);
    row.className = `inv-item-row ${present ? 'inv-row-confirmed' : 'inv-row-missing'}`;
    document.getElementById(`invOk${idx}`).className = `inv-btn ${present ? 'inv-ok' : ''}`;
    document.getElementById(`invMiss${idx}`).className = `inv-btn ${!present ? 'inv-miss' : ''}`;
    const cnt = document.getElementById(`invCnt${idx}`); if (cnt) cnt.className = 'inv-btn';
    const info = document.getElementById(`invCountInfo${idx}`); if (info) info.innerHTML = '';
  },

  /* v1.7.0 — conta fisica diversa: applica delta qty (FIX+/FIX- con qty_delta) */
  async _invCount(idx) {
    if (!this._invState) return;
    const it = this._invState.items[idx];
    const sysQty = it.qty || 1;
    const inp = await Dialog.qty({
      title: 'Conta fisica',
      message: 'Inserire il numero di colli effettivamente contati a scaffale.',
      details: Dialog.kv([
        ['Articolo', it.article_code],
        ['Lotto', it.lot_code],
        ['Quantità a sistema', `${sysQty} Coll.`]
      ]),
      value: sysQty, min: 0, max: 99999
    });
    if (inp === null) return;
    const counted = parseInt(inp);
    if (isNaN(counted) || counted < 0) return this.toast('Numero non valido', 'error');
    it.counted_qty = counted;
    it.checked = true;
    if (counted === 0) {
      it.confirmed = false; it.missing = true;
    } else if (counted === sysQty) {
      it.confirmed = true; it.missing = false;
    } else {
      it.confirmed = false; it.missing = false;  // delta non-zero
    }
    const row = document.getElementById(`invRow${idx}`);
    const delta = counted - sysQty;
    let cls = 'inv-row-confirmed';
    if (counted === 0) cls = 'inv-row-missing';
    else if (delta !== 0) cls = '';
    row.className = `inv-item-row ${cls}`;
    document.getElementById(`invOk${idx}`).className = 'inv-btn';
    document.getElementById(`invMiss${idx}`).className = 'inv-btn';
    const cnt = document.getElementById(`invCnt${idx}`); if (cnt) cnt.className = 'inv-btn inv-ok';
    const info = document.getElementById(`invCountInfo${idx}`);
    if (info) {
      const sign = delta > 0 ? '+' : '';
      const color = delta === 0 ? 'var(--sx-success)' : (delta > 0 ? 'var(--sx-warning)' : 'var(--sx-danger)');
      info.innerHTML = ` · Contati: <strong style="color:${color}">${counted} (${sign}${delta})</strong>`;
    }
  },

  _invAddExtra() {
    if (!this._invState) return;
    const art = Validate.clean(document.getElementById('mInvExtraArt')?.value, true);
    const lot = Validate.clean(document.getElementById('mInvExtraLot')?.value);
    const qtyRaw = document.getElementById('mInvExtraQty')?.value;
    const qty = parseInt(qtyRaw);
    const errs = [Validate.article(art), Validate.lot(lot)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    if (!qty || qty < 1) return this.toast('Numero colli non valido (minimo 1)', 'error');
    // Check articolo esistente per descrizione
    const artInfo = Store.getArticle(art);
    if (!artInfo) return this.toast(`Articolo ${art} non in anagrafica. Usa Configurazione o "Posiziona" per crearlo`, 'error');
    // Evita duplicato extras
    if (this._invState.extras.find(e => e.article_code === art && e.lot_code === lot)) return this.toast('Item già nella lista extra', 'warning');
    this._invState.extras.push({ article_code: art, article_description: artInfo.description, lot_code: lot, qty });
    document.getElementById('mInvExtraArt').value = '';
    document.getElementById('mInvExtraLot').value = '';
    document.getElementById('mInvExtraQty').value = '1';
    this._renderInvExtras();
    document.getElementById('mInvExtraArt').focus();
  },

  _renderInvExtras() {
    const el = document.getElementById('mInvExtras');
    if (!this._invState?.extras.length) { el.innerHTML = ''; return; }
    let html = '';
    this._invState.extras.forEach((ex, idx) => {
      const exQty = ex.qty || 1;
      html += `<div class="inv-item-row inv-row-extra">
        <div class="inv-info">
          <div class="inv-code" style="color:var(--sx-warning)">${this._esc(ex.article_code)} <span style="font-weight:400">${this._esc(ex.article_description || '')}</span></div>
          <div class="inv-lot">Lotto: ${this._esc(ex.lot_code)} · <strong style="color:var(--sx-warning)">${exQty} Coll.</strong></div>
        </div>
        <button class="btn btn-sm btn-danger btn-icon" onclick="App._invRemoveExtra(${idx})">✕</button>
      </div>`;
    });
    el.innerHTML = html;
  },

  _invRemoveExtra(idx) { if (this._invState) { this._invState.extras.splice(idx,1); this._renderInvExtras(); } },

  /* Fix B2: alert item non verificati
     v1.7.0: gestione conta fisica diversa con FIX+/FIX- e qty_delta. */
  async _execInventario() {
    if (!this._requireOperator('le rettifiche inventariali')) return;   // v2.0.1 [B7]
    if (!this._invState) return;
    const { loc, items, extras } = this._invState;
    const unchecked = items.filter(i => !i.checked);
    if (unchecked.length > 0) {
      const msg = `⚠ ${unchecked.length} item non verificati.\n\nOK = considera quantità di sistema CORRETTE (nessuna azione)\nAnnulla = torna alla verifica`;
      if (!await Dialog.confirm({
        title: 'Item non verificati',
        message: msg,
        confirmLabel: 'Considera corrette le quantità di sistema',
        cancelLabel: 'Torna alla verifica',
        danger: true
      })) return;
    }
    let corrections = 0;
    /* 1.8 — le righe a colli dichiarati non si rettificano al buio da qui.
       Questo giro corregge molte righe in fila, e su una suddivisione
       dichiarata «due colli in meno» non dice QUALI: si passa dalla Conta
       mirata, che li fa scegliere uno per uno. Il mancante totale invece si
       applica — la riga sparisce, e non resta nessun elenco da disallineare. */
    const rimandate = [];
    for (const it of items) {
      const sysQty = it.qty || 1;
      if (!it.missing && typeof it.counted_qty === 'number' && it.counted_qty !== sysQty
          && Store.colliDiRiga(it)) {
        rimandate.push(`${it.article_code}#${it.lot_code}`);
        continue;
      }
      // Caso 1: missing totale → FIX- intero
      if (it.missing) {
        const removed = await Store.removeItem(loc, it.item_key);
        if (removed) {
          await this._logMov(MOV.FIX_OUT, it.article_code, it.article_description, it.lot_code, loc, null, Store.getCurrentIdentity().initials, 'Mancante a inventario', '', sysQty, -sysQty, 0);   // v2.0.1 [B7] operatore esplicito
          corrections++;
        }
      }
      // Caso 2: conta fisica diversa (counted_qty != null)
      else if (typeof it.counted_qty === 'number') {
        const delta = it.counted_qty - sysQty;
        if (delta === 0) continue;  // nessuna azione
        if (delta < 0) {
          // FIX-: rimuovi |delta| colli
          const removed = await Store.removeItem(loc, it.item_key, Math.abs(delta));
          if (removed) {
            await this._logMov(MOV.FIX_OUT, it.article_code, it.article_description, it.lot_code, loc, null, Store.getCurrentIdentity().initials, `Conta fisica: ${it.counted_qty}/${sysQty}`, '', sysQty, delta, it.counted_qty);   // v2.0.1 [B7]
            corrections++;
          }
        } else {
          // FIX+: aggiungi delta colli (incrementa record esistente)
          const res = await Store.addItem(loc, it.article_code, it.article_description, it.lot_code, it.expiry_date || '', '', delta);
          if (res.ok) {
            await this._logMov(MOV.FIX_IN, it.article_code, it.article_description, it.lot_code, loc, null, Store.getCurrentIdentity().initials, `Conta fisica: ${it.counted_qty}/${sysQty}`, '', sysQty, delta, it.counted_qty);   // v2.0.1 [B7]
            corrections++;
          }
        }
      }
      // Caso 3: confirmed=true → nessuna azione
    }
    // Extras: nuovi item trovati fisicamente
    for (const ex of extras) {
      const exQty = ex.qty || 1;
      const res = await Store.addItem(loc, ex.article_code, ex.article_description, ex.lot_code, '', '', exQty);
      if (res.ok) {
        await this._logMov(MOV.FIX_IN, ex.article_code, ex.article_description, ex.lot_code, loc, null, Store.getCurrentIdentity().initials, 'Item extra trovato a inventario', '', res.qty_before, exQty, res.qty_after);   // v2.0.1 [B7]
        corrections++;
      }
    }
    if (corrections === 0) this.toast('Nessuna correzione — inventario confermato ✓', 'info');
    else this.toast(`✓ ${corrections} correzion${corrections === 1 ? 'e applicata' : 'i applicate'}`, 'success');
    if (rimandate.length) {
      this.toast(`⚠ ${rimandate.length} rig${rimandate.length === 1 ? 'a a colli dichiarati non rettificata' : 'he a colli dichiarati non rettificate'} — vanno contate una per una da Attività → Conta, che chiede quali colli: ${rimandate.join(', ')}`, 'warning');
    }
    this.updateSyncIndicator();
    /* 1.4.4 — QUI NON SI CHIUDE NESSUN COMPITO. L'inventario di vano è una
       funzione di magazzino che esiste da sempre e non nasce mai da
       un'attività: la Conta ha il suo ramo mirato, con la sua conferma.
       Lasciare l'aggancio qui avrebbe voluto dire che un inventario massivo
       fatto per altre ragioni chiudeva la Conta di qualcun altro. */
    this._invState = null;
    this._loadInv();
    this._refreshSessionLog();
  },

  /* ═══════════════════════════════════════════════════════════════════
     LA CONTA — inventario MIRATO a una riga sola (1.4.4)
     © Andrea Sacchetti — Dietopack S.r.l.

     Fino alla 1.4.3 la Conta apriva il vano intero, cioè la stessa cosa che
     l'inventario di magazzino fa da sempre: un'attività che duplicava una
     funzione. Quello che serviva era il contrario — poter dire «vai a
     ricontare QUESTO articolo, QUESTO lotto», su una riga sola, e chiudere
     quando il conteggio è confermato: giusto o sbagliato che sia, il lavoro
     è stato fatto.

     La finestra è quella di guida delle altre operazioni fisiche —
     smaltimento, quarantena, prelievo guidato: si raggiunge l'ubicazione, si
     scansionano ubicazione, articolo e lotto, e solo allora si digita quanto
     si è contato. Un inventario si fida di ciò che l'operatore ha davanti,
     e le tre scansioni sono ciò che dimostra che ce l'aveva davvero.
     ═══════════════════════════════════════════════════════════════════ */

  _contaState: null,

  /* Apre la riga indicata dal compito. La giacenza si rilegge ADESSO: fra
     la richiesta e l'arrivo davanti allo scaffale può essere passato un
     turno, e contro un numero vecchio si conterebbe a vuoto. */
  _contaSelect(loc, itemKey) {
    const it = Store.getItemsAtLocation(loc).find(i => i.item_key === itemKey);
    if (!it) {
      this._contaState = null;
      this.toast('Quella riga non è più in giacenza: la conta non ha un oggetto', 'warning');
      this._formInventario(document.getElementById('movFormArea'));
      return;
    }
    this._contaState = {
      location_code: it.location_code,
      item_key: it.item_key,
      article_code: it.article_code,
      article_description: it.article_description || '',
      lot_code: it.lot_code,
      expiry_date: it.expiry_date || '',
      qty_system: it.qty || 0,
      scan: { loc: '', art: '', lot: '' },
    };
    this._formInventario(document.getElementById('movFormArea'));
  },

  _contaBack() {
    this._contaState = null;
    this._formInventario(document.getElementById('movFormArea'));
  },

  _contaRenderVerify(el) {
    const d = this._contaState;
    const dove = this._getLocInfo(d.location_code);
    el.innerHTML = `
      <article class="route-stop-card">
        <header class="route-stop-head">
          <span class="route-stop-seq">🔢</span>
          <div class="route-stop-title">
            <div class="route-stop-loc mono">${this._esc(d.location_code)}</div>
            <div class="route-stop-site">${this._esc([dove?.siteName, dove?.zoneName].filter(Boolean).join(' · ') || 'Raggiungi questa ubicazione')}</div>
          </div>
        </header>

        <div class="route-stop-body">
          <div class="route-stop-kv"><span>Articolo</span><b class="mono">${this._esc(d.article_code)}</b></div>
          <div class="route-stop-kv"><span>Descrizione</span><b>${this._esc(d.article_description || '—')}</b></div>
          <div class="route-stop-kv"><span>Lotto</span><b class="mono">${this._esc(d.lot_code)}</b></div>
          <div class="route-stop-kv"><span>Scadenza</span><b>${this._esc(d.expiry_date || '—')}</b></div>
        </div>

        <!-- LA QUANTITÀ DI SISTEMA NON SI MOSTRA PRIMA DI AVER CONTATO.
             Un numero davanti agli occhi è un suggerimento, e un inventario
             che suggerisce la risposta non verifica niente: si confronta
             dopo, ed è il confronto a essere il risultato. -->
        <div class="mov-preview mov-preview-warn" style="margin:0.5rem 0">
          <strong>Conta i colli che vedi a scaffale.</strong>
          Il numero a sistema compare dopo, quando c'è qualcosa da confrontare.
        </div>

        <div class="form-group" style="margin:0.6rem 0 0.4rem">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div style="display:flex;gap:0.3rem">
            <input class="input input-mono" id="cnLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
              oninput="App._normScan('cnLoc')"
              onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('cnLoc');App._contaCheckLoc();}">
            <button class="btn btn-sm" type="button" onclick="App._pickLoc('cnLoc','_contaCheckLoc')" title="Sfoglia le ubicazioni">📍</button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono" id="cnArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._contaCheckArt();}">
        </div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="cnLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._contaCheckLot();}">
        </div>

        <div id="cnFeedback"></div>

        <div class="disp-confirm">
          <div class="form-group" style="width:180px;margin-bottom:0.5rem">
            <label style="white-space:nowrap">④ Colli contati <span class="req">*</span></label>
            <input class="input input-mono" id="cnQty" type="number" min="0" step="1"
              style="text-align:center;font-weight:700;font-size: var(--md-sys-typescale-title-medium-size)"
              oninput="App._contaAnteprima()">
          </div>
          <div id="cnConfronto"></div>
          <div class="form-group" style="margin-bottom:0">
            <label>Nota (opz.) — se il conteggio non torna, perché</label>
            <input class="input" id="cnNota" maxlength="${Validate.MAX.REASON}" placeholder="Es: due colli trovati nel vano accanto">
          </div>
        </div>

        <div style="display:flex;gap:0.5rem;margin-top:0.7rem;flex-wrap:wrap">
          <button class="btn btn-primary" style="flex:1;font-weight:800;min-height:var(--md-touch)"
            onclick="App._execConta()">🔢 CONFERMA CONTEGGIO</button>
          <button class="btn" style="min-height:var(--md-touch)" onclick="App._contaBack()">← Lascia</button>
        </div>
      </article>`;
    this._contaState.scan = { loc: '', art: '', lot: '' };
    this.setPrimaryScanField('cnLoc');
  },

  /* Il confronto compare solo DOPO che un numero è stato digitato: prima
     non c'è niente da confrontare, e mostrarlo sarebbe suggerire. */
  _contaAnteprima() {
    const d = this._contaState;
    const box = document.getElementById('cnConfronto');
    if (!d || !box) return;
    const v = document.getElementById('cnQty')?.value;
    if (v === '' || v === null || v === undefined) { box.innerHTML = ''; return; }
    const contati = parseInt(v, 10);
    if (!Number.isFinite(contati) || contati < 0) { box.innerHTML = ''; return; }
    const delta = contati - d.qty_system;
    if (delta === 0) {
      box.innerHTML = `<div class="mov-preview mov-preview-ok" style="margin-bottom:0.5rem"><strong>✓ Torna.</strong> A sistema ci sono ${d.qty_system} Coll., e ne hai contati altrettanti.</div>`;
      return;
    }
    const segno = delta > 0 ? '+' : '';
    box.innerHTML = `<div class="mov-preview mov-preview-warn" style="margin-bottom:0.5rem">
      <strong>⚠ Non torna: ${segno}${delta} Coll.</strong>
      A sistema ${d.qty_system}, contati ${contati}. Confermando, la giacenza viene rettificata a <strong>${contati}</strong> e il movimento resta a registro con la tua sigla.
    </div>`;
  },

  /* ─── Le tre scansioni ─────────────────────────────────────────────── */

  _contaCheckLoc() {
    const d = this._contaState;
    if (!d) return;
    const val = Validate.clean(document.getElementById('cnLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val !== d.location_code) {
      d.scan.loc = '';
      this._scanFb('cnFeedback', 'error', `Sei in ${val}, ma la conta è su ${d.location_code}`);
      return;
    }
    d.scan.loc = val;
    this._scanFb('cnFeedback', 'ok', `Ubicazione ${val} confermata`);
    document.getElementById('cnArt')?.focus();
  },

  _contaCheckArt() {
    const d = this._contaState;
    if (!d) return;
    const val = Validate.clean(document.getElementById('cnArt')?.value, true);
    if (!val) return;
    if (val !== d.article_code) {
      d.scan.art = '';
      this._scanFb('cnFeedback', 'error', `Articolo ${val} diverso da quello da contare (${d.article_code})`);
      return;
    }
    d.scan.art = val;
    this._scanFb('cnFeedback', 'ok', `Articolo ${val} confermato`);
    document.getElementById('cnLot')?.focus();
  },

  _contaCheckLot() {
    const d = this._contaState;
    if (!d) return;
    const val = Validate.clean(document.getElementById('cnLot')?.value);
    if (!val) return;
    if (val !== d.lot_code) {
      d.scan.lot = '';
      this._scanFb('cnFeedback', 'error', `Lotto ${val} diverso da quello da contare (${d.lot_code})`);
      return;
    }
    d.scan.lot = val;
    this._scanFb('cnFeedback', 'ok', `Lotto ${val} confermato — adesso conta i colli`);
    document.getElementById('cnQty')?.focus();
  },

  /* ─── La conferma ──────────────────────────────────────────────────── */

  async _execConta() {
    if (!this._requireOperator('la conta')) return;
    const d = this._contaState;
    if (!d) return this.toast('Nessuna riga da contare', 'error');

    const mancanti = [];
    if (!d.scan.loc) mancanti.push('ubicazione');
    if (!d.scan.art) mancanti.push('articolo');
    if (!d.scan.lot) mancanti.push('lotto');
    if (mancanti.length) {
      this._scanFb('cnFeedback', 'error', `Verifica incompleta — manca la scansione di: ${mancanti.join(', ')}`);
      document.getElementById(mancanti[0] === 'ubicazione' ? 'cnLoc' : mancanti[0] === 'articolo' ? 'cnArt' : 'cnLot')?.focus();
      return;
    }

    const grezzo = document.getElementById('cnQty')?.value;
    const contati = parseInt(grezzo, 10);
    if (grezzo === '' || !Number.isFinite(contati) || contati < 0) {
      document.getElementById('cnQty')?.focus();
      return this.toast('Quanti colli hai contato: zero è una risposta, vuoto no', 'error');
    }

    /* La giacenza si rilegge un'ultima volta: fra l'apertura della maschera
       e la conferma un altro terminale può aver mosso questa riga. */
    const it = Store.getItemsAtLocation(d.location_code).find(i => i.item_key === d.item_key);
    if (!it) return this.toast('La riga non è più in giacenza — ricomincia', 'error');
    const sistema = it.qty || 0;
    const delta = contati - sistema;
    const nota = Validate.clean(document.getElementById('cnNota')?.value);
    const sigla = Store.getCurrentIdentity().initials;
    const dettaglio = [`Conta mirata: ${contati}/${sistema}`, nota].filter(Boolean).join(' — ');

    if (delta !== 0 && !await Dialog.confirm({
      title: 'Rettificare la giacenza?',
      message: `La giacenza di ${d.article_code}#${d.lot_code} in ${d.location_code} passa da ${sistema} a ${contati} Coll.`,
      details: Dialog.kv([
        ['A sistema', `${sistema} Coll.`],
        ['Contati', `${contati} Coll.`],
        ['Differenza', `${delta > 0 ? '+' : ''}${delta} Coll.`],
      ]),
      confirmLabel: 'Rettifica', danger: true,
    })) return;

    /* 1.8 — SU UNA RIGA A COLLI DICHIARATI, UNA CONTA NON È UN NUMERO SOLO.
       In meno: si dice QUALI colli mancano, e chi conta li ha davanti. In
       più: un collo trovato ha una misura che nessuno può indovinare, e
       inventargliela scriverebbe una giacenza plausibile e falsa — si
       posiziona da Movimenta, dove la suddivisione si dichiara. */
    const elencoConta = Store.colliDiRiga(it);
    let scelteConta = null;
    if (elencoConta && delta < 0) {
      scelteConta = await this._chiediColli(it, 'Quali colli mancano');
      if (scelteConta === undefined) return this.toast('Conta annullata', 'info');
    }
    if (elencoConta && delta > 0) {
      return this.toast('Colli in più su una riga a colli dichiarati: posizionali da Movimenta → Posiziona, dichiarando com\'è imballato ciò che hai trovato', 'warning');
    }

    try {
      if (delta < 0) {
        const tolti = contati === 0 && !scelteConta
          ? await Store.removeItem(d.location_code, d.item_key)
          : await Store.removeItem(d.location_code, d.item_key, Math.abs(delta), null, scelteConta);
        if (!tolti) return this.toast('Rettifica non riuscita', 'error');
        await this._logMov(MOV.FIX_OUT, d.article_code, d.article_description, d.lot_code,
          d.location_code, null, sigla, dettaglio, '', sistema, tolti._qty_delta ?? delta, tolti._qty_after ?? contati);
      } else if (delta > 0) {
        const res = await Store.addItem(d.location_code, d.article_code, d.article_description,
          d.lot_code, d.expiry_date || '', '', delta);
        if (!res.ok) return this.toast('Rettifica non riuscita', 'error');
        await this._logMov(MOV.FIX_IN, d.article_code, d.article_description, d.lot_code,
          d.location_code, null, sigla, dettaglio, '', sistema, delta, contati);
      }
    } catch (err) {
      return this.toast(`Rettifica non riuscita: ${err.message || 'errore'}`, 'error');
    }

    if (delta === 0) this.toast(`✓ Conta confermata: ${contati} Coll., come a sistema`, 'success');
    else this.toast(`✓ Giacenza rettificata a ${contati} Coll. (${delta > 0 ? '+' : ''}${delta})`, 'success');
    this.updateSyncIndicator();
    this._refreshSessionLog();

    /* 1.4.4 — LA CONTA SI CHIUDE QUI, CONFERMATA O RETTIFICATA CHE SIA.
       È un tipo «a gesto»: quanti colli si siano corretti non decide niente,
       perché un inventario che torna giusto non produce nessuna riga ed è
       comunque un lavoro fatto. I colli passati sono lo scarto assoluto, e
       servono al registro delle attività per dire quanto ha pesato. */
    await this._taskAvanza(Math.abs(delta), ['COUNT']);
    this._contaState = null;
    this._formInventario(document.getElementById('movFormArea'));
  },

  // ═══ 5. QUARANTENA ═══
  // v1.8.0: richiede scansione ARTICOLO + LOTTO (doppia identificazione obbligatoria)
  _formQuarantena(el) {
    if (!this._qStage) this._qStage = 'search';
    if (this._qStage === 'verify' && this._qState) { this._qRenderVerify(el); return; }
    this._qRenderSearch(el);
  },

  /* ①+②+③ — ricerca e selezione nella stessa schermata, come lo scarico:
     l'elenco compare sotto i campi appena la ricerca ha un esito. */
  _qRenderSearch(el) {
    const activeQ = Store.getActiveQuarantine();
    el.innerHTML = `<div class="mov-form-card">
      <h3>🚫 <span style="color:var(--sx-purple)">Quarantena</span> — Blocco Qualità</h3>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① ARTICOLO</span> → <span class="wf-step">② LOTTO</span> → INVIO per cercare →
        <span class="wf-step">③ SCEGLI L'UBICAZIONE</span> → <span class="wf-step">④ VERIFICA A SCAFFALE</span> → colli e motivo → <span class="wf-step">⑤ Cartello NC</span>.
      </div>
      <div class="form-group" style="margin-bottom:0.5rem">
        <label>① Scansiona Articolo <span class="req">*</span></label>
        <input class="input input-mono" id="qArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('qLot')?.focus();}">
      </div>
      <div class="form-group" style="margin-bottom:0.6rem">
        <label>② Scansiona Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="qLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._searchQuar();}">
      </div>
      <div id="qResults"><div style="font-size: var(--md-sys-typescale-body-medium-size);color:var(--sx-text-muted);padding:0.4rem">Scansiona articolo e lotto, poi premi INVIO</div></div>
      ${activeQ.length ? `<div style="margin-top:1rem;border-top:1px solid var(--sx-border);padding-top:0.75rem">
        <strong style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary)">🔒 Attive (${activeQ.length})</strong>
        <div style="max-height:180px;overflow-y:auto;margin-top:0.4rem">
          ${activeQ.map(q => `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;border:1px solid var(--sx-purple);background:var(--sx-purple-soft);border-radius:var(--radius);margin-bottom:0.25rem;font-size: var(--md-sys-typescale-body-small-size)">
            <span class="mono" style="color:var(--sx-purple);font-weight:700">${this._esc(q.article_code)}</span>
            <span class="mono" style="color:var(--sx-text-muted);font-size: var(--md-sys-typescale-label-small-size)">L:${this._esc(q.lot_code)}</span>
            <span class="mono" style="color:var(--sx-text-muted);font-size: var(--md-sys-typescale-label-small-size)">📍${this._esc(q.blocked_location)} · ${q.qty || 1} Coll.${q.partial ? ' (parz.)' : ''}</span>
            <span style="color:var(--sx-text-muted);font-size: var(--md-sys-typescale-label-small-size);flex:1" class="truncate" title="${this._esc(q.reason)}">${this._esc(q.reason)}</span>
            <button class="btn btn-sm btn-success" onclick="App._releaseQuarantine('${this._esc(q.q_id)}')">✓ Rilascia</button>
            <button class="btn btn-sm" onclick="App._printNCCard('${this._esc(q.q_id)}')" title="Ristampa il cartello NC">🖨</button>
          </div>`).join('')}
        </div>
      </div>` : ''}
      <div style="margin-top:0.6rem"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
    this.setPrimaryScanField('qArt');
  },

  /* Ricerca per ARTICOLO + LOTTO, entrambi obbligatori. L'esito e' l'elenco
     delle ubicazioni che li contengono, ordinato FEFO. */
  _searchQuar() {
    const art = Validate.clean(document.getElementById('qArt')?.value, true);
    const lot = Validate.clean(document.getElementById('qLot')?.value);
    const el = document.getElementById('qResults');
    if (!art) {
      el.innerHTML = '<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);padding:0.3rem">✗ Scansiona il codice articolo</div>';
      document.getElementById('qArt')?.focus();
      return;
    }
    if (!lot) {
      el.innerHTML = '<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);padding:0.3rem">✗ Scansiona il codice lotto — entrambi i campi sono obbligatori</div>';
      document.getElementById('qLot')?.focus();
      return;
    }

    const tutte = Store.findItemLocations(art).filter(it => it.lot_code === lot);
    if (!tutte.length) {
      el.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);padding:0.3rem">Nessun item trovato per ${this._esc(art)}#${this._esc(lot)}</div>`;
      return;
    }

    const gia = tutte.filter(it => Store.isItemQuarantined(it.item_key, it.location_code));
    const libere = tutte.filter(it => !Store.isItemQuarantined(it.item_key, it.location_code));
    const avvisoGia = gia.length ? `<div class="mov-preview" style="background:var(--sx-purple-soft);border-color:var(--sx-purple);margin:0.4rem 0">
      🔒 <strong style="color:var(--sx-purple)">Già in quarantena</strong>:
      ${gia.map(g => `<span class="mono">${this._esc(g.location_code)}</span> (${g.qty || 1} Coll.)`).join(' · ')}
    </div>` : '';

    if (!libere.length) {
      el.innerHTML = avvisoGia + `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-purple);padding:0.3rem">Tutta la merce di ${this._esc(art)}#${this._esc(lot)} è già bloccata.</div>`;
      return;
    }

    const items = Store.sortByFEFO(libere);
    let html = `${avvisoGia}<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin:0.3rem 0 0.2rem">
      Seleziona quale ubicazione bloccare: si aprirà la verifica a scaffale.</div>
      <div style="max-height:320px;overflow-y:auto">`;
    items.forEach((it, idx) => {
      const isFEFO = idx === 0;
      const expiryLabel = it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : '';
      const qtyPhys = it.qty || 1;
      const qtyAvail = Store.getAvailableQty(it.location_code, it.item_key);
      const reserved = qtyPhys - qtyAvail;
      const reservedLabel = reserved > 0
        ? ` · <span style="color:var(--sx-orange);font-weight:700">${reserved} impegnati su DDT</span>`
        : '';
      html += `<div class="inv-item-row${isFEFO ? ' fefo-row' : ''}">
        <div class="inv-info">
          <div class="inv-code" style="color:var(--sx-purple)">${this._esc(it.article_code)} <span style="color:var(--sx-text-muted);font-weight:400;font-size: var(--md-sys-typescale-body-small-size)">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">Lotto: ${this._esc(it.lot_code)} · 📍 <strong>${this._esc(it.location_code)}</strong> · <strong style="color:var(--sx-purple)">${qtyPhys} Coll. fisici</strong>${reservedLabel}${expiryLabel}</div>
        </div>
        <button class="btn btn-sm" style="background:var(--sx-purple);color:#fff" onclick="App._qSelect('${this._esc(it.location_code)}','${this._esc(it.item_key)}')">➜ Vai e verifica</button>
      </div>`;
    });
    el.innerHTML = html + '</div>';
  },

  _qSelect(loc, key) {
    const bucket = Store.getItemsAtLocation(loc);
    const item = bucket.find(i => i.item_key === key);
    if (!item) return this.toast('Item non più presente in questa ubicazione', 'error');
    if (Store.isItemQuarantined(key, loc)) return this.toast('🔒 Questa ubicazione è già in quarantena', 'warning');

    /* L'area NC si decide adesso e si mostra sulla tappa: l'operatore deve
       sapere dove dovrà portare la merce PRIMA di confermare, non dopo. */
    const nearest = Store.findNearestBlockedLocation(loc);

    const alternatives = Store.findItemLocations(item.article_code)
      .filter(x => x.lot_code === item.lot_code && x.location_code !== loc)
      .filter(x => !Store.isItemQuarantined(x.item_key, x.location_code))
      .map(x => ({ location_code: x.location_code, item_key: x.item_key,
                   qty_physical: x.qty || 1 }));

    const geo = Store.buildLocationGeometry().get(loc);
    this._qState = {
      location_code: loc,
      item_key: key,
      article_code: item.article_code,
      article_description: item.article_description || '',
      lot_code: item.lot_code,
      expiry_date: item.expiry_date || '',
      qty_physical: item.qty || 1,
      qty_available: Store.getAvailableQty(loc, key),
      site_id: geo?.site_id || null,
      nearestBlocked: nearest,
      alternatives,
      scan: { loc: '', art: '', lot: '' },
      forced_note: ''
    };
    this._qStage = 'verify';
    this._formQuarantena(document.getElementById('movFormArea'));
  },

  /* ④+⑤ TAPPA GUIDATA E VERIFICA — stessa forma della tappa dello scarico
     e del percorso di prelievo, perche' e' lo stesso gesto. */
  _qRenderVerify(el) {
    const d = this._qState;
    const site = d.site_id ? Store.getSite(d.site_id) : null;
    const nc = d.nearestBlocked;
    const riservati = d.qty_physical - d.qty_available;

    el.innerHTML = `
      <article class="route-stop-card">
        <header class="route-stop-head">
          <span class="route-stop-seq">🚫</span>
          <div class="route-stop-title">
            <div class="route-stop-loc mono">${this._esc(d.location_code)}</div>
            <div class="route-stop-site">${this._esc(site?.name || d.site_id || 'Raggiungi questa ubicazione')}</div>
          </div>
        </header>

        <div class="route-stop-body">
          <div class="route-stop-kv"><span>Articolo</span><b class="mono">${this._esc(d.article_code)}</b></div>
          <div class="route-stop-kv"><span>Descrizione</span><b>${this._esc(d.article_description || '—')}</b></div>
          <div class="route-stop-kv"><span>Lotto</span><b class="mono">${this._esc(d.lot_code)}</b></div>
          <div class="route-stop-kv"><span>Scadenza</span><b>${this._esc(d.expiry_date || '—')}</b></div>
          <div class="route-stop-kv"><span>Colli fisici</span><b>${d.qty_physical}</b></div>
          <div class="route-stop-kv"><span>Destinazione NC</span><b class="mono">${nc ? this._esc(nc.code) : '— nessuna —'}</b></div>
        </div>

        ${nc
          ? `<div class="mov-preview mov-preview-err" style="margin:0.5rem 0">
              <strong>📍 La merce bloccata andrà in ${this._esc(nc.code)}</strong>
              <span style="color:var(--sx-text-muted);font-size: var(--md-sys-typescale-label-small-size)"> (${this._esc(nc.zoneName)}${nc.hasItems ? ' — già contiene item' : ' — vuota'})</span>
            </div>`
          : `<div class="mov-preview mov-preview-warn" style="margin:0.5rem 0">
              <strong>⛔ Nessuna ubicazione BLOCCATA configurata.</strong>
              La quarantena non può partire: aprire Mappa, scegliere un'ubicazione da destinare alle NC e premere «Blocca».
            </div>`}

        ${riservati > 0 ? `<div class="mov-preview mov-preview-warn" style="margin-bottom:0.5rem">
          <strong>⚠ ${riservati} Coll. sono impegnati su un DDT pendente.</strong>
          Bloccandoli, quel documento non sarà più evadibile e andrà corretto.
        </div>` : ''}

        ${d.alternatives.length ? `<div class="route-alt">
          <strong>Stesso articolo e lotto anche in:</strong>
          ${d.alternatives.map(a => `<span class="badge badge-muted mono">${this._esc(a.location_code)} · ${a.qty_physical} Coll.</span>`).join(' ')}
          <div style="font-size: var(--md-sys-typescale-label-small-size);margin-top:0.25rem;opacity:0.8">Scansionandone una, il blocco si sposta là.</div>
        </div>` : ''}

        <div class="form-group" style="margin:0.6rem 0 0.4rem">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div style="display:flex;gap:0.3rem">
          <input class="input input-mono" id="qvLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('qvLoc')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('qvLoc');App._qCheckLoc();}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('qvLoc','_qCheckLoc')" title="Sfoglia le ubicazioni">📍</button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono" id="qvArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._qCheckArt();}">
        </div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="qvLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._qCheckLot();}">
        </div>

        <div id="qFeedback"></div>

        <div class="disp-confirm">
          <div style="display:flex;gap:0.6rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.5rem">
            <div class="form-group" style="width:165px;margin-bottom:0">
              <label style="white-space:nowrap">④ Colli da bloccare <span class="req">*</span></label>
              <input class="input input-mono" id="qQty" type="number" min="1" step="1" max="${d.qty_physical}"
                value="${d.qty_physical}" style="text-align:center;font-weight:700">
            </div>
            <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);padding-bottom:0.4rem">
              Presenti: <strong style="color:var(--sx-purple)">${d.qty_physical} Coll.</strong><br>
              <span>Bloccarne meno lascia gli altri conformi e utilizzabili.</span>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0.5rem">
            <label>⑤ Motivo del blocco <span class="req">*</span></label>
            <textarea class="input" id="qReason" rows="2" maxlength="${Validate.MAX.REASON}" placeholder="Descrivi il motivo della non conformità..."></textarea>
          </div>
          <div class="form-row" style="margin-bottom:0.5rem">
            <div class="form-group"><label>Operatore <span class="req">*</span></label><input class="input" id="qOperator" maxlength="${Validate.MAX.OPERATOR}" placeholder="Nome operatore" value="${this._esc(this.currentOperator || '')}"></div>
            <div class="form-group"><label>Reparto/Ufficio <span class="req">*</span></label><input class="input" id="qRefDept" maxlength="${Validate.MAX.REF_DEPT}" placeholder="Es: CQ, Produzione"></div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Referente (opz.)</label>
            <input class="input" id="qRefPerson" maxlength="${Validate.MAX.OPERATOR}" placeholder="Nome specifico">
          </div>
        </div>

        <div style="display:flex;gap:0.5rem;margin-top:0.7rem;flex-wrap:wrap">
          <button class="btn btn-warning" style="flex:1;font-weight:800;min-height:var(--md-touch)"
            onclick="App._execQuarantena()">🚫 CONFERMA QUARANTENA</button>
          <button class="btn" style="min-height:var(--md-touch)" onclick="App._qBack()">← Cambia ubicazione</button>
        </div>
      </article>`;
    this._qState.scan = { loc: '', art: '', lot: '' };
    this.setPrimaryScanField('qvLoc');
  },

  _qBack() {
    this._qState = null;
    this._qStage = 'search';
    this._formQuarantena(document.getElementById('movFormArea'));
  },

  /* ─── VERIFICHE DI SCANSIONE ────────────────────────────────────── */

  _qCheckLoc() {
    const d = this._qState;
    if (!d) return;
    const val = Validate.clean(document.getElementById('qvLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val === d.location_code) {
      d.scan.loc = val;
      this._scanFb('qFeedback', 'ok', `Ubicazione ${val} confermata`);
      document.getElementById('qvArt')?.focus();
      return;
    }
    const alt = d.alternatives.find(a => a.location_code === val);
    if (alt) { this._qSwitchToAlternative(alt); return; }
    this._scanBlock({
      fieldId: 'qvLoc', fbId: 'qFeedback',
      title: 'Ubicazione errata',
      message: `Attesa ${d.location_code}, scansionata ${val}.`,
      onForce: async (note) => {
        if (!Store.locationExists(val)) {
          this.toast(`L'ubicazione ${val} non esiste a sistema`, 'error');
          return false;
        }
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Ubicazione forzata (attesa ${d.location_code}, letta ${val}): ${note}`;
        d.scan.loc = val;
        return true;
      },
      onUnlocked: () => document.getElementById('qvArt')?.focus()
    });
  },

  _qSwitchToAlternative(alt) {
    const d = this._qState;
    const old = d.location_code;
    const cur = Store.getItemsAtLocation(alt.location_code).find(i => i.item_key === alt.item_key);
    if (!cur) return this.toast(`In ${alt.location_code} quella merce non c'è più`, 'error');

    d.alternatives = [
      { location_code: old, item_key: d.item_key, qty_physical: d.qty_physical },
      ...d.alternatives.filter(a => a.location_code !== alt.location_code)
    ];
    d.location_code = alt.location_code;
    d.item_key = alt.item_key;
    d.qty_physical = cur.qty || 1;
    d.qty_available = Store.getAvailableQty(alt.location_code, alt.item_key);
    d.nearestBlocked = Store.findNearestBlockedLocation(alt.location_code);
    const geo = Store.buildLocationGeometry().get(alt.location_code);
    d.site_id = geo?.site_id || null;

    Feedback.signal('info', 'Ubicazione alternativa',
      `Il blocco avviene su ${alt.location_code} invece che su ${old}.`);
    this._formQuarantena(document.getElementById('movFormArea'));
    const le = document.getElementById('qvLoc');
    if (le) le.value = alt.location_code;
    this._qState.scan.loc = alt.location_code;
    this._scanFb('qFeedback', 'ok', `Spostato su ${alt.location_code} (ubicazione alternativa)`);
    document.getElementById('qvArt')?.focus();
  },

  _qCheckArt() {
    const d = this._qState;
    if (!d) return;
    if (!d.scan.loc) {
      this._scanFb('qFeedback', 'error', 'Scansiona prima l’ubicazione');
      document.getElementById('qvLoc')?.focus();
      return;
    }
    const val = Validate.clean(document.getElementById('qvArt')?.value, true);
    if (!val) return;
    if (val === d.article_code) {
      d.scan.art = val;
      this._scanFb('qFeedback', 'ok', `Articolo ${val} confermato`);
      document.getElementById('qvLot')?.focus();
      return;
    }
    this._scanBlock({
      fieldId: 'qvArt', fbId: 'qFeedback',
      title: 'Articolo errato',
      message: `Atteso ${d.article_code}, scansionato ${val}.`,
      onForce: async (note) => {
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Articolo forzato (atteso ${d.article_code}, letto ${val}): ${note}`;
        d.scan.art = d.article_code;
        return true;
      },
      onUnlocked: () => document.getElementById('qvLot')?.focus()
    });
  },

  _qCheckLot() {
    const d = this._qState;
    if (!d) return;
    if (!d.scan.art) {
      this._scanFb('qFeedback', 'error', 'Scansiona prima l’articolo');
      document.getElementById('qvArt')?.focus();
      return;
    }
    const val = Validate.clean(document.getElementById('qvLot')?.value);
    if (!val) return;
    if (val === d.lot_code) {
      d.scan.lot = val;
      this._scanFb('qFeedback', 'ok', 'Lotto confermato — indica colli e motivo');
      document.getElementById('qQty')?.focus();
      document.getElementById('qQty')?.select();
      return;
    }
    this._scanBlock({
      fieldId: 'qvLot', fbId: 'qFeedback',
      title: 'Lotto errato',
      message: `Atteso ${d.lot_code}, scansionato ${val}. Bloccare un lotto per un altro lascia in giro quello davvero non conforme.`,
      onForce: async (note) => {
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Lotto forzato (atteso ${d.lot_code}, letto ${val}): ${note}`;
        d.scan.lot = d.lot_code;
        return true;
      },
      onUnlocked: () => document.getElementById('qQty')?.focus()
    });
  },

  async _quarantineItemCore(item, { reason, operator, refDept, refPerson = '', nearest = undefined, qty = null }) {
    const errs = [Validate.reason(reason), Validate.operator(operator), Validate.refDept(refDept)].filter(Boolean);
    if (errs.length) { this.toast(errs[0], 'error'); return { ok: false }; }
    if (nearest === undefined) nearest = Store.findNearestBlockedLocation(item.location_code);
    const backup = { ...item };

    if (!nearest) {
      await Dialog.alert({
        title: 'Nessuna ubicazione BLOCCATA configurata',
        message: 'La quarantena sposta la merce in un’area di non conformità, e a sistema non ne esiste nessuna.\n\n' +
                 'Aprire Mappa, scegliere un’ubicazione da destinare alle NC e premere «Blocca». ' +
                 'Da quel momento la quarantena la userà come destinazione.',
        icon: '⛔'
      });
      return { ok: false };
    }

    const qtyPhys = item.qty || 1;
    let qtyToMove = qty == null ? qtyPhys : Number(qty);
    if (!Number.isInteger(qtyToMove) || qtyToMove < 1) {
      this.toast('Colli da bloccare: serve un intero maggiore di zero', 'error');
      return { ok: false };
    }
    if (qtyToMove > qtyPhys) {
      this.toast(`In ${item.location_code} ci sono ${qtyPhys} Coll.: non se ne possono bloccare ${qtyToMove}`, 'error');
      return { ok: false };
    }
    const parziale = qtyToMove < qtyPhys;

    /* Lo spostamento in area NC ora avviene SEMPRE — `nearest` e' garantito
       dalla guardia qui sopra — e sposta solo i colli bloccati. */
    const blockedLoc = nearest.code;
    /* 1.8 — in area NC ci vanno i colli bloccati, quelli e non altri: la
       quarantena nomina merce precisa, e un collo diverso da quello che il
       controllo qualità ha guardato è un altro fatto. */
    const scelteNC = await this._chiediColli(item, 'Quali colli vanno in quarantena');
    if (scelteNC === undefined) { this.toast('Quarantena annullata', 'info'); return { ok: false }; }
    const removed = await Store.removeItem(item.location_code, item.item_key, qtyToMove, null, scelteNC);
    if (!removed) { this.toast('Item non più disponibile — operazione annullata', 'error'); return { ok: false }; }
    const umNC = this._umMossa(removed);   // 1.4.2 — vedi _umMossa
    const colliNC = removed._packs_out ?? null;
    if (colliNC) qtyToMove = colliNC.length;
    try {
      const res = await Store.addItem(nearest.code, item.article_code, item.article_description, item.lot_code, item.expiry_date || '', 'QUARANTENA: ' + reason, qtyToMove, umNC, colliNC);
      if (!res.ok) throw new Error('addItem non riuscito');
      await this._logMov(MOV.MOVE, item.article_code, item.article_description, item.lot_code, item.location_code, nearest.code, operator, 'Spostamento in quarantena', '', qtyToMove, 0, qtyToMove);
    } catch (err) {
      if (removed._mode === 'partial')
        await Store.addItem(item.location_code, item.article_code, item.article_description, item.lot_code, item.expiry_date || '', '', qtyToMove, umNC, colliNC);
      else
        await Store.restoreItem(backup);
      this.toast(`Spostamento in area NC fallito (${err.message || 'errore'}) — operazione annullata, nessuna quarantena registrata`, 'error');
      return { ok: false };
    }

    // Crea record quarantena
    const qRecord = await Store.quarantineItem({
      item_key: item.item_key,
      article_code: item.article_code,
      article_description: item.article_description || '',
      lot_code: item.lot_code,
      original_location: item.location_code,
      blocked_location: blockedLoc,
      qty: qtyToMove,
      qty_at_origin_before: qtyPhys,
      /* Con i colli scelti il residuo lo dice la riga, non la sottrazione: un
         collo aperto e rimesso a scaffale lascia l'origine viva. */
      qty_left_at_origin: colliNC ? removed._qty_after : qtyPhys - qtyToMove,
      partial: colliNC ? removed._mode === 'partial' : parziale,
      reason, operator, reference_dept: refDept, reference_person: refPerson
    });

    await this._logMov(MOV.QUAR, item.article_code, item.article_description, item.lot_code, item.location_code, blockedLoc, operator,
      parziale ? `${reason} — blocco parziale ${qtyToMove}/${qtyPhys} Coll.` : reason,
      '', qtyPhys, -qtyToMove, qtyPhys - qtyToMove);

    this.updateSyncIndicator();
    this._printNCCardFromRecord(qRecord);
    this._refreshSessionLog();
    await this._taskAvanza(qtyToMove, ['QUARANTINE']);   // 1.4.2.1
    Feedback.signal('ok', `${item.article_code}#${item.lot_code} in QUARANTENA`,
      parziale
        ? `${qtyToMove} Coll. su ${qtyPhys} → ${blockedLoc}. In ${item.location_code} restano ${qtyPhys - qtyToMove} Coll. conformi.`
        : `${qtyToMove} Coll. → ${blockedLoc}. Trasferire fisicamente la merce da ${item.location_code}.`);
    return { ok: true, record: qRecord, blockedLoc, moved: true, qty: qtyToMove, partial: parziale };
  },

  async _execQuarantena() {
    if (!this._requireOperator('la messa in quarantena')) return;   // v2.0.1 [B7]
    const d = this._qState;
    if (!d) return this.toast('Nessun item selezionato', 'error');

    // ① la merce va identificata a scaffale, sempre
    const missing = [];
    if (!d.scan.loc) missing.push('ubicazione');
    if (!d.scan.art) missing.push('articolo');
    if (!d.scan.lot) missing.push('lotto');
    if (missing.length) {
      this._scanFb('qFeedback', 'error', `Verifica incompleta — manca la scansione di: ${missing.join(', ')}`);
      document.getElementById(missing[0] === 'ubicazione' ? 'qvLoc' : missing[0] === 'articolo' ? 'qvArt' : 'qvLot')?.focus();
      return;
    }

    // ② l'item, ricontrollato sullo stato di adesso
    const bucket = Store.getItemsAtLocation(d.location_code);
    const item = bucket.find(i => i.item_key === d.item_key);
    if (!item) return this.toast('Item non più presente — ricomincia la ricerca', 'error');
    if (Store.isItemQuarantined(d.item_key, d.location_code))
      return this.toast('🔒 Questa ubicazione è già in quarantena', 'warning');

    // ③ i colli
    const qtyPhys = item.qty || 1;
    const qtyBlock = parseInt(document.getElementById('qQty')?.value);
    if (!qtyBlock || qtyBlock < 1) {
      document.getElementById('qQty')?.focus();
      return this.toast('Colli da bloccare: valore non valido', 'error');
    }
    if (qtyBlock > qtyPhys) {
      document.getElementById('qQty')?.focus();
      return this.toast(`In ${d.location_code} ci sono ${qtyPhys} Coll.`, 'error');
    }

    const reasonBase = Validate.clean(document.getElementById('qReason')?.value);
    const reason = d.forced_note ? `${reasonBase} [Sblocco scansione: ${d.forced_note}]` : reasonBase;

    const out = await this._quarantineItemCore(item, {
      reason,
      operator:  Validate.clean(document.getElementById('qOperator')?.value),
      refDept:   Validate.clean(document.getElementById('qRefDept')?.value),
      refPerson: Validate.clean(document.getElementById('qRefPerson')?.value),
      nearest:   d.nearestBlocked,
      qty:       qtyBlock
    });
    if (!out.ok) return;
    this._qState = null;
    this._qStage = 'search';
    this._formQuarantena(document.getElementById('movFormArea'));
  },

  // v1.8.0: rilascio quarantena con scansione OBBLIGATORIA dell'ubicazione di destinazione conforme.
  // Un item conforme non può stazionare in un'ubicazione bloccata o NC.
  async _releaseQuarantine(q_id) {
    if (!await Dialog.confirm({
      title: 'Rilasciare l\u2019item dalla quarantena?',
      message: 'Dopo il rilascio sarà obbligatorio scansionare un\u2019ubicazione di destinazione CONFORME (non bloccata) dove riposizionare l\u2019item.',
      confirmLabel: 'Rilascia',
      icon: '\u2705'
    })) return;

    // Recupera il record di quarantena
    const allQ = Store.getQuarantineHistory();
    const qRec = allQ.find(q => q.q_id === q_id);
    if (!qRec) return this.toast('Record quarantena non trovato', 'error');

    // Mostra il dialog per scansione ubicazione destinazione
    this._showReleaseDestDialog(q_id, qRec);
  },

  /* Mostra dialog di scansione ubicazione destinazione post-rilascio.
     L'item conforme DEVE essere spostato in un'ubicazione non bloccata / non NC. */
  _showReleaseDestDialog(q_id, qRec) {
    // Rimuove eventuali overlay precedenti
    document.getElementById('releaseDestOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'releaseDestOverlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2>✓ Rilascio Quarantena — Ubicazione Destinazione</h2>
        </div>
        <div class="modal-body">
          <div style="background:var(--sx-success-soft);border:1px solid var(--sx-success);border-radius:var(--radius-md);padding:0.65rem 0.85rem;margin-bottom:0.85rem">
            <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-bottom:0.2rem">Item rilasciato dalla quarantena:</div>
            <div style="font-weight:700;color:var(--sx-primary);font-family:var(--mono)">${this._esc(qRec.article_code)}</div>
            <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary)">Lotto: <strong>${this._esc(qRec.lot_code)}</strong> · Da: <strong>${this._esc(qRec.blocked_location)}</strong></div>
          </div>
          <div style="background:var(--sx-warning-soft);border:1px solid var(--sx-warning);border-radius:var(--radius);padding:0.5rem 0.65rem;margin-bottom:0.85rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-warning)">
            ⚠ <strong>Obbligatorio:</strong> un item conforme non può stazionare in un'ubicazione bloccata o di non conformità. Scansiona l'ubicazione di destinazione idonea.
          </div>
          <div class="form-group">
            <label>Scansiona Ubicazione di Destinazione <span class="req">*</span></label>
            <div style="display:flex;gap:0.3rem">
              <input class="input input-mono" id="releaseDestLoc" placeholder="Scansiona barcode ubicazione" maxlength="${Validate.MAX.LOC_CODE}" style="flex:1"
                oninput="App._normScan('releaseDestLoc');App._previewReleaseDest()"
                onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('releaseDestLoc');document.getElementById('releaseOperator')?.focus();}">
              <button class="btn btn-sm" onclick="App._pickLoc('releaseDestLoc','_cbPickReleaseDest')">📍</button>
            </div>
            <div id="releaseDestPrev" style="margin-top:0.3rem"></div>
          </div>
          <!-- v2.0.1 [B6] — Il rilascio da quarantena è una decisione di qualità:
               prima veniva loggato senza alcun operatore. Ora esecutore e
               responsabile che autorizza sono entrambi obbligatori. -->
          <div class="form-row">
            <div class="form-group">
              <label>Operatore esecutore <span class="req">*</span></label>
              <input class="input" id="releaseOperator" placeholder="Chi esegue il rilascio" maxlength="${Validate.MAX.OPERATOR}"
                value="${this._esc(this.currentOperator || '')}"
                onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('releaseRefPerson')?.focus();}">
            </div>
            <div class="form-group">
              <label>Responsabile che autorizza <span class="req">*</span></label>
              <input class="input" id="releaseRefPerson" placeholder="Es. CQ — nome referente" maxlength="${Validate.MAX.OPERATOR}"
                value="${this._esc(qRec.reference_person || '')}"
                onkeydown="if(event.key==='Enter'){event.preventDefault();App._execReleaseDest('${q_id}');}">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="document.getElementById('releaseDestOverlay').remove()">Annulla</button>
          <button class="btn btn-success" onclick="App._execReleaseDest('${q_id}')">✓ Conferma e Riposiziona</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('releaseDestLoc')?.focus(), 80);
  },

  _previewReleaseDest() { this._previewLoc('releaseDestLoc', 'releaseDestPrev'); },
  _cbPickReleaseDest() { setTimeout(() => this._previewReleaseDest(), 30); },

  /* Esegue il rilascio e lo spostamento fisico verso l'ubicazione destinazione conforme. */
  async _execReleaseDest(q_id) {
    if (!this._requireOperator('il rilascio dalla quarantena')) return;   // v2.0.1 [B7]
    const dest = Validate.clean(document.getElementById('releaseDestLoc')?.value, true)?.replace(/'/g, '-');
    if (!dest) return this.toast('Scansiona l\'ubicazione di destinazione', 'error');
    const locErr = Validate.location(dest);
    if (locErr) return this.toast(locErr, 'error');
    if (!Store.locationExists(dest)) return this.toast(`Ubicazione ${dest} non trovata — scansiona un\'ubicazione valida`, 'error');

    // Blocco critico: l'ubicazione destinazione NON può essere bloccata o riservata NC
    const destStatus = Store.getLocationStatus(dest);
    if (destStatus === 'blocked') {
      return this.toast(`❌ UBICAZIONE BLOCCATA — ${dest} non è idonea per item conformi. Scansiona un\'ubicazione libera o occupata normale.`, 'error');
    }
    if (destStatus === 'disabled') {
      return this.toast(`❌ Ubicazione ${dest} disattivata. Scansiona un\'ubicazione attiva.`, 'error');
    }

    // v2.0.1 [B6] — identificazione obbligatoria: esecutore + responsabile
    const relOperator = Validate.clean(document.getElementById('releaseOperator')?.value);
    const relRefPerson = Validate.clean(document.getElementById('releaseRefPerson')?.value);
    const relErr = Validate.operator(relOperator);
    if (relErr) return this.toast(`Operatore esecutore: ${relErr}`, 'error');
    if (!relRefPerson) return this.toast('Indicare il responsabile che autorizza il rilascio', 'error');
    if (relRefPerson.length > Validate.MAX.OPERATOR) return this.toast(`Responsabile: max ${Validate.MAX.OPERATOR} caratteri`, 'error');

    // Rilascia il record di quarantena nel DB
    const rec = await Store.releaseQuarantine(q_id, { released_by: relOperator, released_ref_person: relRefPerson });
    if (!rec) return this.toast('Rilascio quarantena fallito', 'error');

    // Determina la posizione attuale dell'item (blocked_location o original_location)
    const currentLoc = rec.blocked_location !== 'DA DEFINIRE' ? rec.blocked_location : rec.original_location;
    const itemKey = rec.item_key;

    // Sposta l'item dall'ubicazione bloccata alla destinazione conforme
    let moved = false;
    let moveErr = '';
    const srcItems = Store.getItemsAtLocation(currentLoc);
    const srcItem = srcItems.find(i => i.item_key === itemKey);

    if (srcItem) {
      const inNC = srcItem.qty || 1;
      let qtyToMove = Math.min(rec.qty || inNC, inNC);
      const backup = { ...srcItem };
      /* 1.8 — il rilascio non è una scelta: esce dall'area NC ciò che ci era
         entrato, e i colli viaggiano com'erano. Solo un rilascio parziale
         chiede quali, ed è un caso che il controllo qualità decide. */
      const scelteRil = qtyToMove >= inNC
        ? this._tuttiIColli(srcItem)
        : await this._chiediColli(srcItem, 'Quali colli si rilasciano');
      if (scelteRil === undefined) return this.toast('Rilascio annullato', 'info');
      const removed = await Store.removeItem(currentLoc, itemKey, qtyToMove, null, scelteRil);
      if (removed) {
        const umRil = this._umMossa(removed);   // 1.4.2 — vedi _umMossa
        const colliRil = removed._packs_out ?? null;
        if (colliRil) qtyToMove = colliRil.length;
        const res = await Store.addItem(dest, srcItem.article_code, srcItem.article_description, srcItem.lot_code, srcItem.expiry_date || '', (srcItem.notes || '').replace(/^QUARANTENA:\s*/i, '').trim(), qtyToMove, umRil, colliRil);
        if (res.ok) {
          moved = true;
          await this._logMov(MOV.MOVE, srcItem.article_code, srcItem.article_description, srcItem.lot_code, currentLoc, dest, relOperator, 'Rilascio quarantena → riposizionamento conforme', rec.q_id, qtyToMove, 0, qtyToMove);   // v2.0.1 [B6]
        } else {
          if (removed._mode === 'partial')
            await Store.addItem(currentLoc, srcItem.article_code, srcItem.article_description, srcItem.lot_code, srcItem.expiry_date || '', '', qtyToMove, umRil, colliRil);
          else
            await Store.restoreItem(backup);
          moveErr = `Impossibile posizionare in ${dest} — item ripristinato in ${currentLoc}`;
        }
      } else {
        moveErr = `Item non trovato fisicamente in ${currentLoc} — aggiorna manualmente l\'ubicazione`;
      }
    } else {
      moveErr = `Item non trovato in ${currentLoc} — verifica manualmente l\'ubicazione fisica`;
    }

    // v2.0.1 [B6] — prima questo movimento veniva registrato senza operatore
    await this._logMov(MOV.Q_REL, rec.article_code, rec.article_description, rec.lot_code, currentLoc, dest,
      relOperator, `Rilascio autorizzato da: ${relRefPerson}`, rec.q_id);

    document.getElementById('releaseDestOverlay')?.remove();
    if (moved) {
      this.toast(`✓ ${rec.article_code}#${rec.lot_code} rilasciato e spostato in ${dest}`, 'success');
    } else {
      this.toast(`✓ ${rec.article_code}#${rec.lot_code} rilasciato${moveErr ? ` — ⚠ ${moveErr}` : ''}`, moveErr ? 'warning' : 'success');
    }
    this._formQuarantena(document.getElementById('movFormArea'));
    this._refreshSessionLog();
  },

  _printNCCard(q_id) {
    const rec = Store.getQuarantineHistory().find(q => q.q_id === q_id);
    if (rec) this._printNCCardFromRecord(rec);
  },

  _printNCCardFromRecord(rec) {
    const fmtDate = (d) => new Date(d).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    /* v1.1.0 [N2] — I colli bloccati stanno in testata, accanto a lotto e
       ubicazione: e' la prima domanda di chi trova il cartello appeso. */
    const colli = rec.qty || 1;
    const headExtra = `<div class="doc-idblock doc-idblock--3">
        ${this._docCell('Articolo', rec.article_code)}
        ${this._docCell('Lotto', rec.lot_code)}
        ${this._docCell('Ubicazione bloccata', rec.blocked_location)}
        ${this._docCell('Descrizione', rec.article_description, 'doc-cell--wide')}
        ${this._docCell('Colli bloccati', String(colli))}
      </div>`;

    const body = `
      <div class="nc-alert-strip">🚫 MATERIALE BLOCCATO<br>NON UTILIZZARE — ATTENDERE AUTORIZZAZIONE CQ</div>

      <div class="nc-reason">
        <div class="nc-reason-lbl">Motivo del blocco</div>
        <div class="nc-reason-val">${this._esc(rec.reason)}</div>
      </div>

      <div class="doc-fill"></div>

      <div class="nc-instructions">
        <strong>Istruzioni.</strong> Non utilizzare, spedire o movimentare senza autorizzazione del Controllo Qualità.
        Il cartello resta sul materiale fino a risoluzione. Per rilascio o smaltimento contattare
        <strong>${this._esc(rec.reference_dept)}</strong>${rec.reference_person ? ` (rif. ${this._esc(rec.reference_person)})` : ''}.
        <br><br>
        <strong>Trasferimento fisico.</strong> Portare <strong>${colli} Coll.</strong> da
        <strong class="mono">${this._esc(rec.original_location)}</strong> a
        <strong class="mono">${this._esc(rec.blocked_location)}</strong>, se non è già stato fatto.
        ${rec.partial
          ? `<br><strong>Blocco parziale.</strong> In <strong class="mono">${this._esc(rec.original_location)}</strong>
             restano <strong>${rec.qty_left_at_origin} Coll.</strong> dello stesso articolo e lotto,
             <strong>conformi e utilizzabili</strong>. Questo cartello riguarda solo i colli trasferiti.`
          : ''}
      </div>

      <div class="doc-grid">
        ${this._docCell('Data del blocco', fmtDate(rec.created_at))}
        ${this._docCell('Operatore magazzino', rec.operator)}
        ${this._docCell('Reparto di riferimento', rec.reference_dept)}
        ${this._docCell('Ubicazione di origine', rec.original_location)}
      </div>`;

    this._docPrint(this._docPageHTML({
      kind: 'NON CONFORMITÀ',
      kindSub: 'Cartello di blocco — Controllo Qualità',
      num: rec.q_id, dateVal: fmtDate(rec.created_at),
      headExtra, body, docId: rec.q_id, pageClass: 'doc-page--nc',
      signs: [
        { role: 'Operatore magazzino', hint: rec.operator || 'Data e firma' },
        { role: 'Controllo qualità', hint: 'Data e firma' },
        { role: `Resp. ${rec.reference_dept || 'reparto'}`, hint: 'Data e firma' }
      ]
    }));
  },

  _formSpedizioni(el) {
    /* IL DDT SI EVADE ANCHE DA FUORI MOVIMENTA — dal riquadro in Dashboard, e
       dalla 1.4.2.1 anche dalla coda delle attività. Là dentro `movFormArea`
       non esiste, e la maschera si ridisegnava su `null`: la merce era già
       uscita e il compito già chiuso, ma l'ultima riga della funzione moriva
       e l'errore usciva in console senza che niente lo raccogliesse. Chi non
       ha un posto dove disegnare non disegna. */
    if (!el) return;
    const pending = Store.getPendingOutbound();
    const cart = this._shipCart;
    const cfg = Store.getDocConfig();
    const gaps = this._docSenderGaps();

    // Proposta del numero: solo a carrello nuovo, e solo se non c'è già
    if (!this._shipDdtNum) this._shipDdtNum = Store.proposeDdtNumber();
    if (!this._shipDocDate) this._shipDocDate = new Date().toISOString().slice(0, 10);
    if (!this._shipCausale) this._shipCausale = cfg.causali[0]?.id || '';
    if (!this._shipPorto) this._shipPorto = cfg.ddt.default_porto;
    if (!this._shipTrasporto) this._shipTrasporto = cfg.ddt.default_trasporto;

    const causaliOpts = cfg.causali.map(c =>
      `<option value="${this._esc(c.id)}" ${this._shipCausale === c.id ? 'selected' : ''}>${this._esc(c.label)}</option>`).join('');

    /* 1.6 — L'ANAGRAFICA VIENE PRIMA DELLA DERIVAZIONE DAI DDT.
       `getKnownRecipients` ricava i destinatari scorrendo i documenti gia'
       fatti, ed e' cio' che c'era prima che l'anagrafica esistesse: resta
       come RIPIEGO per i clienti storici, che nell'anagrafica non ci sono
       finche' non gli si spedisce di nuovo. I due elenchi si uniscono, e i
       nomi doppi non si mostrano due volte. */
    const rubrica = Store.getRecipients();
    const known = Store.getKnownRecipients();
    const nomi = [];
    const visti = new Set();
    for (const r of [...rubrica.map(r => r.name), ...known.map(k => k.destination)]) {
      const n = String(r || '').trim();
      const k = n.toUpperCase();
      if (!n || visti.has(k)) continue;
      visti.add(k); nomi.push(n);
    }
    const datalist = nomi.length
      ? `<datalist id="shipRecipients">${nomi.map(n => `<option value="${this._esc(n)}"></option>`).join('')}</datalist>`
      : '';

    const w = this._shipComputeWeights();

    el.innerHTML = `<div class="mov-form-card">
      <h3>🚚 <span style="color:var(--sx-orange)">Spedizioni</span> — Documenti di trasporto in uscita</h3>
      <div class="wf-instructions">
        <strong>Flusso 2-stati:</strong>
        <span class="wf-step">① REGISTRA DDT</span> (testata + righe → DDT pendente, merce ancora in giacenza) →
        <span class="wf-step">② attesa ritiro vettore</span> →
        <span class="wf-step">③ EVADI DDT</span> (scarico giacenza, pratica chiusa).
        La <strong>causale</strong> distingue una spedizione da un reso.
      </div>

      ${gaps.length ? `<div class="mov-preview mov-preview-err" style="margin-bottom:0.6rem">
        ⚠ <strong>Mittente incompleto</strong> — manca: ${this._esc(gaps.join(', '))}.
        I DDT si stampano lo stesso, ma con l'avviso che il documento non è conforme.
        <button class="btn btn-sm" style="margin-left:0.4rem" onclick="App._configTab='docs';App.switchView('config')">Configura ora</button>
      </div>` : ''}

      <!-- ═════ LISTA DDT PENDENTI ═════ -->
      <div style="margin-bottom:0.8rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
          <strong style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-orange)">📋 DDT Pendenti <span class="badge badge-orange">${pending.length}</span></strong>
        </div>
        ${this._renderPendingDdtList(pending)}
      </div>

      <!-- ═════ COMPOSIZIONE NUOVO DDT ═════ -->
      <details ${cart.length ? 'open' : ''} style="margin-top:0.8rem">
        <summary style="cursor:pointer;font-size: var(--md-sys-typescale-body-medium-size);font-weight:700;color:var(--sx-primary);padding:0.4rem 0.5rem;background:var(--grad-soft-orange);border:1px solid var(--sx-orange);border-radius:var(--radius)">
          ➕ Componi Nuovo DDT ${cart.length ? `<span class="badge badge-orange">${cart.length} righe in bozza</span>` : ''}
        </summary>
        <div style="border:1px solid var(--sx-border);border-top:none;border-radius:0 0 var(--radius-md) var(--radius-md);padding:0.6rem;background:var(--sx-card-alt)">
          ${datalist}

          <!-- ── TESTATA: documento ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">📋 Documento</div>
            <div class="form-row" style="margin-bottom:0.4rem">
              <div class="form-group">
                <label>Causale del trasporto <span class="req">*</span></label>
                <select class="select" id="pShipCausale" onchange="App._persistShipHeader()">${causaliOpts}</select>
              </div>
              <div class="form-group">
                <label>N° DDT <span class="req">*</span></label>
                <input class="input input-mono" id="pShipDdt" placeholder="N° del documento" maxlength="40" value="${this._esc(this._shipDdtNum)}"
                  onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="form-row" style="margin-bottom:0">
              <div class="form-group">
                <label>Data del documento <span class="req">*</span></label>
                <input class="input" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10" id="pShipDocDate"
                  value="${this._esc(this._dateISOtoIT(this._shipDocDate))}"
                  oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this);App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Riferimento ordine (opz.)</label>
                <input class="input" id="pShipOrderRef" maxlength="60" placeholder="Ordine cliente, commessa, DDT di origine"
                  value="${this._esc(this._shipOrderRef)}" onchange="App._persistShipHeader()">
              </div>
            </div>
          </div>

          <!-- ── TESTATA: destinatario ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">🏢 Destinatario</div>
            <div class="form-row" style="margin-bottom:0.4rem">
              <div class="form-group">
                <label>Denominazione <span class="req">*</span></label>
                <input class="input" id="pShipCustomer" list="shipRecipients" placeholder="Ragione sociale del destinatario" maxlength="120"
                  value="${this._esc(this._shipCustomer)}" onchange="App._shipRecipientPicked()">
                <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.15rem">💡 Un destinatario già usato porta con sé indirizzo e P. IVA.</div>
              </div>
              <div class="form-group">
                <label>Partita IVA / C.F.</label>
                <input class="input input-mono" id="pShipDestVat" maxlength="20" placeholder="Del destinatario"
                  value="${this._esc(this._shipDestVat)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="form-row" style="margin-bottom:0.4rem">
              <div class="form-group">
                <label>Indirizzo</label>
                <input class="input" id="pShipDestAddress" maxlength="120" placeholder="Via, numero civico"
                  value="${this._esc(this._shipDestAddress)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>CAP</label>
                <input class="input input-mono" id="pShipDestZip" maxlength="10" style="max-width:120px"
                  value="${this._esc(this._shipDestZip)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="form-row" style="margin-bottom:0.4rem">
              <div class="form-group">
                <label>Comune</label>
                <input class="input" id="pShipDestCity" maxlength="60"
                  value="${this._esc(this._shipDestCity)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Prov.</label>
                <input class="input input-mono" id="pShipDestProvince" maxlength="4" style="max-width:110px" placeholder="Sigla"
                  value="${this._esc(this._shipDestProvince)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>Luogo di destinazione della merce</label>
              <input class="input" id="pShipShipTo" maxlength="160" placeholder="Solo se DIVERSO dalla sede del destinatario"
                value="${this._esc(this._shipShipTo)}" onchange="App._persistShipHeader()">
              <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.15rem">Vuoto: si consegna alla sede del destinatario.</div>
            </div>
          </div>

          <!-- ── TESTATA: trasporto ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">🚛 Trasporto</div>
            <div class="form-row" style="margin-bottom:0.4rem">
              <div class="form-group">
                <label>Vettore</label>
                <input class="input" id="pShipCarrier" placeholder="Es: BRT, GLS, vettore proprio" maxlength="80"
                  value="${this._esc(this._shipCarrier)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Trasporto a cura di</label>
                <select class="select" id="pShipTrasporto" onchange="App._persistShipHeader()">
                  ${['Mittente','Destinatario','Vettore'].map(v =>
                    `<option value="${v}" ${this._shipTrasporto === v ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row" style="margin-bottom:0.4rem">
              <div class="form-group">
                <label>Porto</label>
                <select class="select" id="pShipPorto" onchange="App._persistShipHeader()">
                  ${['Franco','Assegnato'].map(v =>
                    `<option value="${v}" ${this._shipPorto === v ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>📅 Data ritiro prevista <span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);font-weight:400">(per gli alert)</span></label>
                <input class="input" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10" id="pShipExpected"
                  value="${this._esc(this._dateISOtoIT(this._shipExpectedDate))}"
                  oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this);App._persistShipHeader()">
              </div>
            </div>
            <div class="form-row" style="margin-bottom:0">
              <div class="form-group">
                <label>Data e ora inizio trasporto</label>
                <input class="input" id="pShipStartTransport" maxlength="30" placeholder="Es: 08/08/2026 14:30 — o «alla consegna»"
                  value="${this._esc(this._shipStartTransport)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Aspetto esteriore dei beni</label>
                <input class="input" id="pShipAspetto" maxlength="80" placeholder="Es: 3 bancali EPAL, 42 cartoni"
                  value="${this._esc(this._shipAspetto)}" onchange="App._persistShipHeader()">
              </div>
            </div>
          </div>

          <!-- ── TESTATA: pesi ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">⚖ Pesi <span style="font-weight:400;text-transform:none;letter-spacing:0">— calcolati dall'anagrafica, correggibili a mano</span></div>
            <div class="form-row" style="margin-bottom:0">
              <div class="form-group">
                <label>Peso netto (kg)</label>
                <input class="input input-mono" id="pShipPesoNetto" inputmode="decimal" maxlength="12"
                  placeholder="${w.net != null ? this._fmtKg(w.net) : 'non calcolabile'}"
                  value="${this._esc(this._shipPesoNetto)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Peso lordo (kg)</label>
                <input class="input input-mono" id="pShipPesoLordo" inputmode="decimal" maxlength="12"
                  placeholder="netto + tara imballi"
                  value="${this._esc(this._shipPesoLordo)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.3rem">
              ${w.missing.length
                ? `⚠ Peso non censito in anagrafica per: <strong>${this._esc(w.missing.slice(0, 4).join(', '))}${w.missing.length > 4 ? ` e altri ${w.missing.length - 4}` : ''}</strong> — il netto va scritto a mano.`
                : (w.net != null
                    ? `Netto calcolato sulle righe in carrello: <strong>${this._fmtKg(w.net)} kg</strong>${w.pieces != null ? ` · ${w.pieces} pz` : ''}. Lasciando il campo vuoto va sul DDT questo valore.`
                    : 'Aggiungi righe al carrello per il calcolo automatico.')}
            </div>
          </div>

          <!-- ── INSERIMENTO RIGA ── -->
          <div class="form-group" style="margin-bottom:0.4rem">
            <label>① Scansiona Articolo <span class="req">*</span></label>
            <input class="input input-mono" id="pShipArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"
              onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('pShipLot')?.focus();}">
          </div>
          <div class="form-group" style="margin-bottom:0.4rem">
            <label>② Scansiona Lotto <span class="req">*</span></label>
            <input class="input input-mono" id="pShipLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
              onkeydown="if(event.key==='Enter'){event.preventDefault();App._shipLookup();}">
            <div id="pShipInfo"></div>
          </div>
          <div id="pShipDetails" class="hidden">
            <div id="pShipItemPreview"></div>
            <div style="display:flex;gap:0.4rem;margin-bottom:0.4rem;align-items:flex-end">
              <div class="form-group" style="width:130px"><label>Colli <span class="req">*</span></label><input class="input input-mono" id="pShipQty" type="number" min="1" step="1" value="1" style="text-align:center;font-weight:700"
                onkeydown="if(event.key==='Enter'){event.preventDefault();App._shipAddToCart();}"></div>
              <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);padding-bottom:0.4rem">Disponibili (esclusi pendenti): <strong id="pShipAvail" style="color:var(--sx-orange)">—</strong> Coll.</div>
            </div>
            <div class="form-group" style="margin-bottom:0.5rem">
              <label>Note riga (opz.)</label>
              <input class="input" id="pShipNotes" maxlength="${Validate.MAX.NOTES}" placeholder="Es: riferimento riga d'ordine">
            </div>
            <button class="btn" style="width:100%;background:var(--sx-orange);color:#fff;border-color:var(--sx-orange);padding:0.5rem;font-weight:700" onclick="App._shipAddToCart()">+ AGGIUNGI AL CARRELLO</button>
          </div>

          <!-- ── CARRELLO ── -->
          <section id="shipCartZone">${this._shipCartZoneHTML()}</section>

          <div class="form-group" style="margin-top:0.6rem;margin-bottom:0">
            <label>Annotazioni sul documento (opz.)</label>
            <input class="input" id="pShipDocNotes" maxlength="200" placeholder="Testo libero riportato in fondo al DDT"
              value="${this._esc(this._shipDocNotes)}" onchange="App._persistShipHeader()">
          </div>
          <div id="pShipFeedback" style="margin-top:0.4rem"></div>
        </div>
      </details>
      <div style="margin-top:0.6rem"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
    if (!cart.length && !pending.length) document.getElementById('pShipCustomer')?.focus();
  },

  /* 1.6 — UN DESTINATARIO GIA' IN ANAGRAFICA COMPILA IL DDT DA SE'.
     Si cerca prima in rubrica e poi, per i clienti storici, nei DDT gia'
     fatti. `fill` non sovrascrive: cio' che l'operatore ha gia' digitato e'
     una scelta, e l'anagrafica non la corregge alle sue spalle. */
  _shipRecipientPicked() {
    const name = Validate.clean(document.getElementById('pShipCustomer')?.value);
    this._shipCustomer = name;
    if (!name) { this._persistShipHeader(); return; }
    const fill = (id, val) => {
      const e = document.getElementById(id);
      if (e && !e.value.trim() && val) e.value = val;
    };

    const rcp = Store.getRecipients()
      .find(r => normalizzaNomeRcp(r.name) === normalizzaNomeRcp(name));
    if (rcp) {
      fill('pShipDestVat', rcp.vat || rcp.fiscal_code);
      const d = destinazionePredefinita(rcp);
      if (d) {
        fill('pShipDestAddress', d.address);
        fill('pShipDestZip', d.zip);
        fill('pShipDestCity', d.city);
        fill('pShipDestProvince', d.province);
      }
      this._persistShipHeader();
      /* PIU' DESTINAZIONI: si sceglie, non si indovina. La prima e' solo la
         proposta — un cliente con un deposito riceve dove ha detto lui. */
      const altre = (rcp.destinations || []).length;
      this.toast(altre > 1
        ? `${name}: ${altre} destinazioni in anagrafica — si cambia dal selettore`
        : `Anagrafica di ${name} ripresa`, 'info');
      if (altre > 1) this._shipMostraDestinazioni(rcp);
      return;
    }

    const known = Store.getKnownRecipients()
      .find(r => r.destination.trim().toUpperCase() === name.trim().toUpperCase());
    if (!known) { this._persistShipHeader(); return; }
    fill('pShipDestAddress', known.dest_address);
    fill('pShipDestZip', known.dest_zip);
    fill('pShipDestCity', known.dest_city);
    fill('pShipDestProvince', known.dest_province);
    fill('pShipDestVat', known.dest_vat);
    fill('pShipShipTo', known.ship_to);
    fill('pShipCarrier', known.carrier);
    this._persistShipHeader();
    this.toast(`Anagrafica di ${name} ripresa dall'ultimo DDT`, 'info');
  },

  /* Il selettore delle destinazioni. Overlay con id PROPRIO e chiusura
     propria — trappola 31: `showModal` riusa `modalOverlay`, e aperto da
     dentro un'altra finestra chiuderebbe quella sotto. */
  _shipMostraDestinazioni(rcp) {
    document.getElementById('destPickOverlay')?.remove();
    const righe = (rcp.destinations || []).map((d, i) => `
      <button class="btn" style="width:100%;text-align:left;margin-bottom:0.3rem"
        onclick="App._shipScegliDestinazione('${this._esc(rcp.rcp_id)}',${i})">
        <strong>${this._esc(d.label || `Destinazione ${i + 1}`)}</strong>${d.predefinita ? ' <span class="badge badge-teal">predefinita</span>' : ''}<br>
        <span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">${this._esc(descriviDestinazione(d))}</span>
      </button>`).join('');
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'destPickOverlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="modal">
      <div class="modal-header"><h3>Dove consegna ${this._esc(rcp.name)}?</h3>
        <button class="modal-close" onclick="document.getElementById('destPickOverlay')?.remove()">&times;</button></div>
      <div class="modal-body">${righe}</div></div>`;
    document.body.appendChild(ov);
  },

  _shipScegliDestinazione(rcpId, i) {
    const d = Store.getRecipient(rcpId)?.destinations?.[i];
    document.getElementById('destPickOverlay')?.remove();
    if (!d) return;
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ''; };
    set('pShipDestAddress', d.address);
    set('pShipDestZip', d.zip);
    set('pShipDestCity', d.city);
    set('pShipDestProvince', d.province);
    this._persistShipHeader();
    this.toast(`Destinazione: ${descriviDestinazione(d)}`, 'success');
  },

  _shipComputeWeights(lines = null) {
    const rows = lines || this._shipCart;
    if (!rows.length) return { net: null, pieces: null, missing: [] };
    let net = 0, pieces = 0, anyPieces = false;
    const missing = [];
    for (const r of rows) {
      const a = Store.getArticle(r.article_code);
      const wu = a && Number(a.weight_net_kg) > 0 ? Number(a.weight_net_kg) : null;
      if (wu === null) { if (!missing.includes(r.article_code)) missing.push(r.article_code); }
      else net += wu * (r.qty || 0);
      const pp = a && Number(a.pieces_per_pack) > 0 ? Number(a.pieces_per_pack) : null;
      if (pp !== null) { pieces += pp * (r.qty || 0); anyPieces = true; }
    }
    return {
      net: missing.length ? null : Math.round(net * 1000) / 1000,
      pieces: anyPieces ? pieces : null,
      missing
    };
  },

  /* Lista dei DDT pendenti, tutti, ordinati per urgenza di ritiro.
     v2.0.0+ — sort by alert priority (overdue/today/tomorrow/soon/ok/none) */
  _renderPendingDdtList(pending) {
    if (!pending.length) {
      return `<div style="padding:0.5rem 0.7rem;background:var(--sx-card-alt);border:1px dashed var(--sx-border);border-radius:var(--radius);font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);text-align:center">Nessun DDT pendente — componine uno nuovo qui sotto</div>`;
    }
    const sorted = pending.slice().sort((a, b) => {
      const sa = pickupAlertStatus(a).sortKey;
      const sb = pickupAlertStatus(b).sortKey;
      if (sa !== sb) return sa - sb;
      return b.created_at - a.created_at;  // a parità → più recente in alto
    });
    return sorted.map(d => this._renderPendingDocCard(d)).join('');
  },

  _renderPendingDocCard(doc) {
    const isRet = this._docIsReturn(doc);
    const themeColor = isRet ? 'var(--sx-teal)' : 'var(--sx-orange)';
    const themeBg = isRet ? 'var(--grad-soft-teal)' : 'var(--grad-soft-orange)';
    const themeBadge = isRet ? 'badge-teal' : 'badge-orange';
    const causale = this._docCausaleLabel(doc);
    const totalColli = doc.lines.reduce((s, l) => s + (l.qty || 1), 0);
    const created = new Date(doc.created_at).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const ageMs = Date.now() - doc.created_at;
    const ageH = Math.floor(ageMs / (1000 * 60 * 60));
    const ageStr = ageH < 1 ? 'pochi minuti' : (ageH < 24 ? `${ageH}h` : `${Math.floor(ageH/24)}g`);
    // v2.0.0+ — Alert data ritiro prevista
    const alert = pickupAlertStatus(doc);
    const isUrgent = alert.level === 'overdue' || alert.level === 'today' || alert.level === 'tomorrow';
    const borderColor = isUrgent ? alert.color : themeColor;
    const borderWidth = isUrgent ? '2px' : '1px';
    const animation = (alert.level === 'overdue' || alert.level === 'today') ? 'animation:pendingPulse 2s ease-in-out infinite' : '';
    const alertBadgeSummary = alert.level === 'none'
      ? `<span class="badge" style="background:var(--sx-card-alt);color:var(--sx-text-muted);border:1px dashed var(--sx-border-strong);font-size: var(--md-sys-typescale-label-small-size)">📅 da definire</span>`
      : `<span class="badge" style="background:${alert.bg};color:${alert.color};border-color:${alert.color};font-size: var(--md-sys-typescale-label-small-size);font-weight:700">📅 ${this._esc(alert.shortLabel)}</span>`;
    /* v2.0.1 [A-3] — Controllo di integrità delegato a Store.checkPendingDocIntegrity. */
    const integrity = Store.checkPendingDocIntegrity(doc);
    const warnings = integrity.issues.length;
    const issueByLine = new Map(integrity.issues.map(x => [x.lineIndex, x]));
    const warnBadge = warnings > 0 ? `<span class="badge" style="background:var(--sx-danger-soft);color:var(--sx-danger);border-color:var(--sx-danger);margin-left:0.3rem" title="${warnings} riga/e non allineata/e alla giacenza attuale">⚠ ${warnings}</span>` : '';
    const linesHtml = doc.lines.map((l, i) => {
      const issue = issueByLine.get(i);
      const rowStyle = issue ? 'background:var(--sx-danger-soft);' : '';
      const issueHtml = issue
        ? `<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-danger);padding:0.15rem 0 0.25rem 1rem">⚠ ${this._esc(issue.message)}</div>`
        : '';
      return `<div style="${rowStyle}font-size: var(--md-sys-typescale-label-small-size);padding:0.2rem 0;border-bottom:1px dashed var(--sx-border)">
      <div style="display:flex;justify-content:space-between;gap:0.4rem">
        <span><span style="color:var(--sx-text-muted)">${i+1}.</span> <strong>${this._esc(l.article_code)}</strong> · L:${this._esc(l.lot_code)} · 📍${this._esc(l.location_code)}${l.notes ? ' · <em>' + this._esc(l.notes) + '</em>' : ''}</span>
        <strong style="color:${themeColor}">${l.qty} Coll.</strong>
      </div>${issueHtml}
    </div>`;
    }).join('');
    return `<details data-doc-id="${this._esc(doc.doc_id)}" style="background:${themeBg};border:${borderWidth} solid ${borderColor};border-radius:var(--radius-md);padding:0;margin-bottom:0.4rem;${animation}">
      <summary style="cursor:pointer;padding:0.5rem 0.7rem;font-size: var(--md-sys-typescale-body-small-size);font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap">
          <strong style="color:${themeColor}">DDT ${this._esc(doc.ddt_num)}</strong> · ${this._esc(doc.destination)}${doc.carrier ? ' <span style="color:var(--sx-text-muted)">· ' + this._esc(doc.carrier) + '</span>' : ''}
          <span class="badge ${themeBadge}" style="font-size: var(--md-sys-typescale-label-small-size)">${this._esc(causale)}</span>
          ${alertBadgeSummary}
          ${warnBadge}
        </span>
        <span class="badge ${themeBadge}">${doc.lines.length} righe · ${totalColli} Coll.</span>
      </summary>
      <div style="padding:0.5rem 0.7rem;background:#fff;border-top:1px solid ${borderColor};border-radius:0 0 var(--radius-md) var(--radius-md)">
        <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.4rem">
          Registrato il ${created} <span style="color:var(--sx-text-secondary)">(${ageStr} fa)</span>
          ${doc.operator ? ' · <strong>' + this._esc(doc.operator) + '</strong>' : ''} · Destinatario: <strong>${this._esc(doc.destination)}</strong>
          ${doc.ship_to ? ' · Destinazione: <strong>' + this._esc(doc.ship_to) + '</strong>' : ''}
        </div>
        ${alert.level !== 'none' ? `<div style="background:${alert.bg};color:${alert.color};font-weight:700;font-size: var(--md-sys-typescale-body-small-size);padding:0.35rem 0.55rem;border-radius:var(--radius);margin-bottom:0.4rem;border:1px solid ${alert.color}">${this._esc(alert.label)}</div>` : `<div style="background:var(--sx-card-alt);color:var(--sx-text-muted);font-size: var(--md-sys-typescale-label-small-size);padding:0.3rem 0.5rem;border-radius:var(--radius);margin-bottom:0.4rem;border:1px dashed var(--sx-border-strong)">📅 Ritiro non datato — nessun alert su questo DDT</div>`}
        <div style="margin-bottom:0.5rem">${linesHtml}</div>
        ${warnings > 0 ? `<div style="background:var(--sx-danger-soft);color:var(--sx-danger);font-size: var(--md-sys-typescale-label-small-size);padding:0.4rem 0.55rem;border-radius:var(--radius);margin-bottom:0.4rem;border:1px solid var(--sx-danger)">
          <strong>⚠ ${warnings} riga/e NON ALLINEATA/E alla giacenza attuale.</strong><br>
          Il documento non è evadibile così com'è: usare <strong>📝 Modifica</strong> per riallinearlo, oppure <strong>✕</strong> per annullarlo e rifarlo.
        </div>` : ''}
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn" style="flex:1;min-width:120px;padding:0.5rem;font-weight:700;background:${themeColor};color:#fff;border-color:${themeColor}" onclick="App._evadiSpedizione('${this._esc(doc.doc_id)}')">✓ EVADI DDT</button>
          <button class="btn" style="background:var(--sx-accent-soft);color:var(--sx-accent);border-color:var(--sx-accent);font-weight:600" onclick="App._editPendingDoc('${this._esc(doc.doc_id)}')" title="Modifica DDT">📝 Modifica</button>
          <button class="btn" onclick="App._printDDT('${this._esc(doc.doc_id)}')" title="Stampa il DDT">🖨</button>
          <button class="btn btn-ghost" style="color:var(--sx-danger)" onclick="App._cancelPendingShip('${this._esc(doc.doc_id)}')" title="Annulla DDT">✕</button>
        </div>
      </div>
    </details>`;
  },

  _shipLookup() {
    const art = Validate.clean(document.getElementById('pShipArt')?.value, true);
    const lot = Validate.clean(document.getElementById('pShipLot')?.value);
    const info = document.getElementById('pShipInfo');
    const details = document.getElementById('pShipDetails');
    if (!art) { info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Scansiona prima il codice articolo</div>`; document.getElementById('pShipArt')?.focus(); return; }
    if (!lot) { info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Scansiona il codice lotto</div>`; document.getElementById('pShipLot')?.focus(); return; }
    const artErr = Validate.article(art);
    if (artErr) { info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ ${this._esc(artErr)}</div>`; details.classList.add('hidden'); return; }
    const lotErr = Validate.lot(lot);
    if (lotErr) { info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ ${this._esc(lotErr)}</div>`; details.classList.add('hidden'); return; }
    const allItems = Store.findItemLocations(art);
    const matched = allItems.filter(it => it.lot_code === lot);
    if (!matched.length) { info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Item ${this._esc(art)}#${this._esc(lot)} non trovato in magazzino</div>`; details.classList.add('hidden'); return; }
    const notQuar = matched.filter(it => !Store.isItemQuarantined(it.item_key, it.location_code));
    if (!notQuar.length) { info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-purple);margin-top:0.2rem">⚠ L'item ${this._esc(art)}#${this._esc(lot)} è in quarantena in tutte le ubicazioni in cui si trova</div>`; details.classList.add('hidden'); return; }
    const inCartByKey = {};
    for (const c of this._shipCart) {
      const k = `${c.location_code}#${c.item_key}`;
      inCartByKey[k] = (inCartByKey[k] || 0) + c.qty;
    }
    const enriched = notQuar.map(it => {
      const totalQty = it.qty || 1;
      const pendingQty = Store.getPendingQtyForItem(it.location_code, it.item_key);
      const cartQty = inCartByKey[`${it.location_code}#${it.item_key}`] || 0;
      const availableQty = Math.max(0, totalQty - pendingQty - cartQty);
      return { ...it, _totalQty: totalQty, _pendingQty: pendingQty, _availableQty: availableQty };
    });
    const usable = enriched.filter(it => it._availableQty > 0);
    if (!usable.length) { info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-warning);margin-top:0.2rem">⚠ Tutta la giacenza di ${this._esc(art)}#${this._esc(lot)} è impegnata</div>`; details.classList.add('hidden'); return; }
    if (usable.length === 1) { this._shipSelectItem(usable[0]); return; }
    let html = '<div style="max-height:200px;overflow-y:auto;margin-top:0.3rem"><div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.3rem">Item presente in più ubicazioni — seleziona da quale prelevare:</div>';
    for (const it of usable) {
      const p = App._payload(it);
      const pendBadge = it._pendingQty > 0 ? ` <span class="badge badge-amber">${it._pendingQty} prenotati</span>` : '';
      html += `<div class="inv-item-row" style="cursor:pointer" onclick="App._shipSelectEnc('${p}')">
        <div class="inv-info">
          <div class="inv-code" style="color:var(--sx-orange)">${this._esc(it.article_code)} <span style="color:var(--sx-text-muted);font-weight:400;font-size: var(--md-sys-typescale-body-small-size)">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">L:${this._esc(it.lot_code)} · 📍 ${this._esc(it.location_code)} · <strong>${it._availableQty}/${it._totalQty} Coll.</strong>${pendBadge}${it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : ''}</div>
        </div>
        <span style="color:var(--sx-orange);font-size: var(--md-sys-typescale-body-small-size)">🚚 Seleziona</span>
      </div>`;
    }
    info.innerHTML = html + '</div>';
    details.classList.add('hidden');
  },

  _shipSelectEnc(p) { this._shipSelectItem(JSON.parse(decodeURIComponent(p))); },

  _shipSelectItem(item) {
    const full = Store.getItemsAtLocation(item.location_code).find(i => i.item_key === item.item_key);
    if (!full) return this.toast('Item non più disponibile in giacenza', 'error');
    const totalQty = full.qty || 1;
    const pendingQty = Store.getPendingQtyForItem(item.location_code, item.item_key);
    const cartQty = this._shipCart
      .filter(c => c.location_code === item.location_code && c.item_key === item.item_key)
      .reduce((s, c) => s + c.qty, 0);
    const availableQty = Math.max(0, totalQty - pendingQty - cartQty);
    if (availableQty <= 0) {
      document.getElementById('pShipInfo').innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-warning);margin-top:0.2rem">⚠ Giacenza tutta impegnata</div>`;
      return;
    }
    this._shipState = { item: full, availableQty, totalQty, pendingQty };
    const expBadge = full.expiry_date ? ` · scad. ${this._esc(full.expiry_date)}` : '';
    const pendBadge = pendingQty > 0 ? ` · <span style="color:var(--sx-warning)">${pendingQty} prenotati</span>` : '';
    document.getElementById('pShipInfo').innerHTML = '';
    document.getElementById('pShipItemPreview').innerHTML = `<div class="mov-preview" style="background:var(--grad-soft-orange);border-color:var(--sx-orange);margin-bottom:0.4rem">
      <strong style="color:var(--sx-orange)">${this._esc(full.article_code)}</strong>
      <span style="color:var(--sx-text-muted)">${this._esc(full.article_description || '')}</span><br>
      <span style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">Lotto: <strong>${this._esc(full.lot_code)}</strong> · Ubic: <strong class="mono">${this._esc(full.location_code)}</strong> · Disp. effettiva: <strong style="color:var(--sx-orange)">${availableQty} Coll.</strong> (tot. ${totalQty}${pendBadge})${expBadge}</span>
    </div>`;
    const qe = document.getElementById('pShipQty');
    if (qe) { qe.value = availableQty; qe.max = availableQty; }
    const av = document.getElementById('pShipAvail'); if (av) av.textContent = availableQty;
    const notesEl = document.getElementById('pShipNotes'); if (notesEl) notesEl.value = '';
    document.getElementById('pShipDetails').classList.remove('hidden');
    qe?.focus();
    qe?.select();
  },

  _shipAddToCart() {
    if (!this._shipState?.item) return this.toast('Identifica prima un item in giacenza', 'error');
    const item = this._shipState.item;
    const availableQty = this._shipState.availableQty;
    const notes = Validate.clean(document.getElementById('pShipNotes')?.value);
    const qtyRaw = document.getElementById('pShipQty')?.value;
    const qty = parseInt(qtyRaw);
    if (!qty || qty < 1) return this.toast('Numero di colli non valido', 'error');
    if (qty > availableQty) return this.toast(`Qty richiesta (${qty}) supera disponibilità (${availableQty})`, 'error');
    if (Validate.notes(notes)) return this.toast(Validate.notes(notes), 'error');
    if (!this._shipCart.length && !this._shipStartTime) this._shipStartTime = Date.now();
    this._shipCart.push({
      article_code: item.article_code,
      article_description: item.article_description || '',
      lot_code: item.lot_code,
      location_code: item.location_code,
      item_key: item.item_key,
      expiry_date: item.expiry_date || '',
      qty,
      qty_at_creation: availableQty,
      notes
    });
    this.toast(`+ ${item.article_code}#${item.lot_code} (${qty}/${availableQty} Coll.) da ${item.location_code}`, 'success');
    for (const id of ['pShipArt','pShipLot','pShipNotes']) { const e = document.getElementById(id); if (e) e.value = ''; }
    const qe = document.getElementById('pShipQty'); if (qe) qe.value = '1';
    document.getElementById('pShipItemPreview').innerHTML = '';
    document.getElementById('pShipDetails')?.classList.add('hidden');
    this._shipState = null;
    this._persistShipHeader();
    this._updateShipCart();
    this.setPrimaryScanField('pShipArt');
  },

  _persistShipHeader() {
    const g = id => Validate.clean(document.getElementById(id)?.value);
    const sel = id => document.getElementById(id)?.value;

    if (document.getElementById('pShipCausale')) this._shipCausale = sel('pShipCausale') || this._shipCausale;
    this._shipDdtNum = g('pShipDdt') || this._shipDdtNum;
    this._shipOrderRef = document.getElementById('pShipOrderRef') ? g('pShipOrderRef') : this._shipOrderRef;
    this._shipCustomer = g('pShipCustomer') || this._shipCustomer;

    /* Questi campi possono essere legittimamente SVUOTATI (un indirizzo
       ripreso per sbaglio va potuto cancellare), quindi niente `||`. */
    const opt = (id, cur) => document.getElementById(id) ? g(id) : cur;
    this._shipDestAddress  = opt('pShipDestAddress', this._shipDestAddress);
    this._shipDestZip      = opt('pShipDestZip', this._shipDestZip);
    this._shipDestCity     = opt('pShipDestCity', this._shipDestCity);
    this._shipDestProvince = (opt('pShipDestProvince', this._shipDestProvince) || '').toUpperCase();
    this._shipDestVat      = opt('pShipDestVat', this._shipDestVat);
    this._shipShipTo       = opt('pShipShipTo', this._shipShipTo);
    this._shipCarrier      = opt('pShipCarrier', this._shipCarrier);
    this._shipAspetto      = opt('pShipAspetto', this._shipAspetto);
    this._shipPesoNetto    = opt('pShipPesoNetto', this._shipPesoNetto);
    this._shipPesoLordo    = opt('pShipPesoLordo', this._shipPesoLordo);
    this._shipStartTransport = opt('pShipStartTransport', this._shipStartTransport);
    this._shipDocNotes     = opt('pShipDocNotes', this._shipDocNotes);

    if (document.getElementById('pShipPorto')) this._shipPorto = sel('pShipPorto');
    if (document.getElementById('pShipTrasporto')) this._shipTrasporto = sel('pShipTrasporto');

    // v2.3.0 [D1] — i campi data sono in gg/mm/aaaa: lo stato interno resta ISO
    const dd = document.getElementById('pShipDocDate');
    if (dd) { const iso = this._dateITtoISO(dd.value, 'Data documento'); this._shipDocDate = iso === null ? '' : iso; }
    const expectedEl = document.getElementById('pShipExpected');
    if (expectedEl) { const iso = this._dateITtoISO(expectedEl.value, 'Data ritiro'); this._shipExpectedDate = iso === null ? '' : iso; }
  },

  _shipRemoveFromCart(idx) {
    this._shipCart.splice(idx, 1);
    this._persistShipHeader();
    this._updateShipCart();
  },

  async _shipClearCart() {
    if (!await Dialog.confirm({
      title: 'Svuotare il carrello bozza?',
      message: 'Le righe inserite vengono eliminate. La testata del DDT viene mantenuta.',
      confirmLabel: 'Svuota', danger: true
    })) return;
    this._shipCart = [];
    this._shipStartTime = null;
    this._shipState = null;
    this._persistShipHeader();
    this._updateShipCart();
  },

  /* v2.1.0 — contenuto della sola zona carrello */
  _shipCartZoneHTML() {
    const n = this._shipCart.length;
    const totalColli = this._shipCart.reduce((s, r) => s + (r.qty || 0), 0);
    const w = this._shipComputeWeights();
    const wLabel = w.net != null ? ` <span class="dlg-chip">${this._fmtKg(w.net)} kg</span>` : '';
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin:0.7rem 0 0.35rem">
        <strong style="font-size: var(--md-sys-typescale-body-medium-size)">🛒 Carrello Bozza <span style="color:var(--sx-orange)">(${n})</span>${n ? ` <span class="dlg-chip">${totalColli} Coll.</span>${wLabel}` : ''}</strong>
        ${n ? '<button class="btn btn-sm btn-ghost" onclick="App._shipClearCart()">Svuota</button>' : ''}
      </div>
      <div class="pick-cart">${this._renderShipCart()}</div>
      ${n ? `<button class="btn" style="width:100%;margin-top:0.6rem;font-weight:800;min-height:var(--md-touch);background:var(--sx-orange);color:#fff;border-color:var(--sx-orange)" onclick="App._saveShipPending()">📥 REGISTRA DDT PENDENTE (${n} righe)</button>` : ''}`;
  },

  _updateShipCart() {
    const zone = document.getElementById('shipCartZone');
    if (zone) zone.innerHTML = this._shipCartZoneHTML();
    else this._formSpedizioni(document.getElementById('movFormArea'));   // ripiego
  },

  _renderShipCart() {
    if (!this._shipCart.length) return '<div class="pick-cart-empty">Carrello vuoto — scansiona articolo e lotto, identifica in giacenza, poi aggiungi</div>';
    return this._shipCart.map((it, i) => {
      const expBadge = it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : '';
      const notesBadge = it.notes ? ` · <span style="color:var(--sx-text-muted);font-style:italic">${this._esc(it.notes)}</span>` : '';
      const partial = it.qty < (it.qty_at_creation || it.qty) ? ` <span class="badge badge-amber" style="margin-left:0.2rem">PARZIALE</span>` : '';
      return `<div class="pick-cart-item" style="border-left:3px solid var(--sx-orange)">
        <div class="pci-num" style="background:var(--sx-orange)">${i+1}</div>
        <div class="pci-info">
          <div class="pci-code">${this._esc(it.article_code)} <span style="color:var(--sx-text-muted);font-weight:400;font-size: var(--md-sys-typescale-label-small-size)">${this._esc(it.article_description || '')}</span>${partial}</div>
          <div class="pci-loc">L:${this._esc(it.lot_code)} · 📍 ${this._esc(it.location_code)} · <strong style="color:var(--sx-orange)">${it.qty} Coll.</strong>${expBadge}${notesBadge}</div>
        </div>
        <button class="btn btn-sm btn-ghost" style="color:var(--sx-danger)" onclick="App._shipRemoveFromCart(${i})">✕</button>
      </div>`;
    }).join('');
  },

  _shipResetHeader() {
    this._shipCart = [];
    this._shipStartTime = null;
    this._shipState = null;
    this._shipDdtNum = '';
    this._shipDocDate = '';
    this._shipOrderRef = '';
    this._shipCustomer = '';
    this._shipDestAddress = '';
    this._shipDestZip = '';
    this._shipDestCity = '';
    this._shipDestProvince = '';
    this._shipDestVat = '';
    this._shipShipTo = '';
    this._shipCarrier = '';
    this._shipAspetto = '';
    this._shipPesoNetto = '';
    this._shipPesoLordo = '';
    this._shipStartTransport = '';
    this._shipDocNotes = '';
    this._shipExpectedDate = '';
  },

  /* STATO 1 — Salva il DDT come pendente. La merce NON viene scaricata:
     resta in giacenza, prenotata, fino all'evasione. */
  async _saveShipPending() {
    if (!this._requireOperator('la registrazione del DDT')) return;   // v2.0.1 [B7]
    if (!this._shipCart.length) return this.toast('Carrello vuoto', 'error');
    this._persistShipHeader();
    if (!this._shipDdtNum) { document.getElementById('pShipDdt')?.focus(); return this.toast('N° DDT obbligatorio', 'error'); }
    if (!this._shipCustomer) { document.getElementById('pShipCustomer')?.focus(); return this.toast('Destinatario obbligatorio', 'error'); }
    if (!this._shipCausale) return this.toast('Causale del trasporto obbligatoria', 'error');

    const dupe = Store._cache.pendingOut.find(d =>
      d.status !== 'cancelled' &&
      String(d.ddt_num || '').trim().toUpperCase() === this._shipDdtNum.trim().toUpperCase());
    if (dupe && !await Dialog.confirm({
      title: '⚠ Numero DDT già usato',
      message: 'Esiste già un documento con questo numero. Procedere solo se la ripetizione è voluta.',
      details: Dialog.kv([
        ['N° DDT', this._shipDdtNum],
        ['Documento esistente', dupe.destination],
        ['Stato', dupe.status === 'pending' ? 'pendente' : 'evaso'],
        ['Registrato il', new Date(dupe.created_at).toLocaleDateString('it-IT')]
      ]),
      confirmLabel: 'Procedo comunque', cancelLabel: 'Cambio numero', danger: true
    })) { document.getElementById('pShipDdt')?.focus(); return; }

    // Re-check: per ogni riga la giacenza deve essere ancora sufficiente
    for (let i = 0; i < this._shipCart.length; i++) {
      const it = this._shipCart[i];
      const cur = Store.getItemsAtLocation(it.location_code).find(x => x.item_key === it.item_key);
      if (!cur) return this.toast(`Riga ${i+1}: ${it.article_code}#${it.lot_code} non più in ${it.location_code}`, 'error');
      const totalQty = cur.qty || 1;
      const pendingQty = Store.getPendingQtyForItem(it.location_code, it.item_key);
      const otherCart = this._shipCart
        .filter((x, j) => j !== i && x.location_code === it.location_code && x.item_key === it.item_key)
        .reduce((s, x) => s + x.qty, 0);
      const avail = totalQty - pendingQty - otherCart;
      if (it.qty > avail) return this.toast(`Riga ${i+1}: qty richiesta (${it.qty}) > disponibilità effettiva (${avail})`, 'error');
    }

    const totalColli = this._shipCart.reduce((s, it) => s + (it.qty || 1), 0);
    const causale = Store.getCausale(this._shipCausale);
    const w = this._shipComputeWeights();

    // v2.0.0+ — warning se data ritiro è oggi/passata o non specificata
    let dateWarn = '';
    if (this._shipExpectedDate) {
      const status = pickupAlertStatus({ expected_pickup_date: this._shipExpectedDate });
      if (status.level === 'overdue') dateWarn = `\n⚠ Data ritiro nel passato (${status.label})`;
      else if (status.level === 'today') dateWarn = `\n⚠ Data ritiro è OGGI`;
    } else {
      dateWarn = '\n⚠ Data ritiro non specificata (nessun alert sarà attivo)';
    }

    if (!await Dialog.confirm({
      title: 'Registrare il DDT come pendente?',
      message: `La merce RIMANE in giacenza, prenotata per l’uscita. Al ritiro fisico del vettore usare "EVADI DDT".${dateWarn}`,
      details: Dialog.kv([
        ['Causale', causale?.label || '—'],
        ['N° DDT', this._shipDdtNum],
        ['Destinatario', this._shipCustomer],
        ['Destinazione', this._shipShipTo || 'sede del destinatario'],
        ['Vettore', this._shipCarrier || null],
        ['Ritiro previsto', this._shipExpectedDate ? new Date(this._shipExpectedDate + 'T00:00:00').toLocaleDateString('it-IT') : 'non indicato'],
        ['Righe', this._shipCart.length],
        ['Colli totali', totalColli]
      ]),
      confirmLabel: 'Registra DDT', icon: '\u{1F4E5}'
    })) return;

    try {
      const doc = await Store.savePendingOutbound({
        kind: causale?.mov === 'RET' ? 'RES' : 'SHIP',
        causale_id: this._shipCausale,
        causale_label: causale?.label || '',
        causale_mov: causale?.mov || 'SHIP',
        ddt_num: this._shipDdtNum,
        doc_date: this._shipDocDate,
        order_ref: this._shipOrderRef,
        destination: this._shipCustomer,
        dest_address: this._shipDestAddress,
        dest_zip: this._shipDestZip,
        dest_city: this._shipDestCity,
        dest_province: this._shipDestProvince,
        dest_vat: this._shipDestVat,
        ship_to: this._shipShipTo,
        carrier: this._shipCarrier,
        transport_by: this._shipTrasporto,
        porto: this._shipPorto,
        aspetto: this._shipAspetto,
        peso_netto: this._shipPesoNetto || (w.net != null ? String(w.net) : ''),
        peso_lordo: this._shipPesoLordo,
        pieces_total: w.pieces,
        start_transport: this._shipStartTransport,
        doc_notes: this._shipDocNotes,
        expected_pickup_date: this._shipExpectedDate, // v2.0.0+
        operator: Store.getCurrentIdentity().initials,
        /* Il mittente viene congelato nel documento: un DDT ristampato fra
           due anni deve riportare la sede di allora [M4]. */
        sender: Store.getDocConfig().sender,
        /* Il compito che ha aperto questo prelievo resta scritto sul
           documento: dalla 1.4.4 non è più il filo della chiusura, ma resta
           il legame fra la richiesta e il documento che ne è nato — serve a
           chi, fra un mese, si chiede da dove venisse questo DDT. */
        task_id: (this._taskRun?.type === 'PICK_SHIP' || this._taskRun?.type === 'PICK_RET')
          ? this._taskRun.task_id : null,
        lines: this._shipCart.slice()
      });
      await Store.rememberDdtNumber(doc.ddt_num);
      this.toast(`✓ DDT ${doc.ddt_num} registrato come pendente`, 'success');   // v2.2.1 [F4]
      /* 1.6 — L'ANAGRAFICA SI POPOLA QUI, e non prima: si registra ciò che è
         andato su un documento vero, non ciò che qualcuno stava digitando.
         Dopo il salvataggio, così un errore di rubrica non fa perdere un DDT. */
      await this._aggiornaRubrica();
      this.updateSyncIndicator();
      /* 1.4.4 — IL PRELIEVO SI CHIUDE QUI, ALLA REGISTRAZIONE DEL DDT.
         Il lavoro dell'operatore finisce col documento: da questo momento la
         merce aspetta il vettore, e l'evasione non dipende più da lui — può
         passare giorni, e la fa chi spedisce. Tenere il compito aperto fino
         al ritiro voleva dire lasciare in coda, addosso a chi ha prelevato,
         un'attività che non poteva più concludere. */
      const colliDdt = this._shipCart.reduce((s, l) => s + (l.qty || 1), 0);
      await this._taskAvanza(colliDdt, ['PICK_SHIP', 'PICK_RET']);
      this._shipResetHeader();
      this._formSpedizioni(document.getElementById('movFormArea'));
    } catch (err) {
      this.toast(`Errore salvataggio: ${err.message || 'sconosciuto'}`, 'error');
    }
  },

  async _evadiSpedizione(doc_id) {
    if (!this._requireOperator("l'evasione del DDT")) return;   // v2.0.1 [B7]
    const doc = Store.getPendingDoc(doc_id);
    if (!doc || doc.status !== 'pending') return this.toast('Documento non trovato o già evaso', 'error');

    const isRet = this._docIsReturn(doc);
    const movType = isRet ? MOV.RET : MOV.SHIP;
    const causale = this._docCausaleLabel(doc);

    // Pre-check: tutte le righe devono avere giacenza sufficiente
    for (let i = 0; i < doc.lines.length; i++) {
      const l = doc.lines[i];
      const cur = Store.getItemsAtLocation(l.location_code).find(x => x.item_key === l.item_key);
      if (!cur) return this.toast(`Riga ${i+1}: ${l.article_code}#${l.lot_code} non più in giacenza in ${l.location_code} — annullare e ricreare il DDT`, 'error');
      if ((cur.qty || 1) < l.qty) return this.toast(`Riga ${i+1}: giacenza attuale (${cur.qty || 1}) < qty richiesta (${l.qty})`, 'error');
    }
    const totalColli = doc.lines.reduce((s, l) => s + (l.qty || 1), 0);
    if (!await Dialog.confirm({
      title: 'Evadere il DDT?',
      message: 'La merce viene SCARICATA fisicamente dalla giacenza. Confermare solo a ritiro avvenuto.',
      details: Dialog.kv([
        ['Causale', causale],
        ['N° DDT', doc.ddt_num],
        ['Destinatario', doc.destination],
        ['Movimento a registro', isRet ? 'Reso' : 'Spedizione'],
        ['Righe', doc.lines.length],
        ['Colli totali', totalColli]
      ]),
      confirmLabel: 'Evadi e scarica', danger: true
    })) return;

    const reasonNotes = `${causale.toUpperCase()} → ${doc.destination}${doc.carrier ? ' (vettore: ' + doc.carrier + ')' : ''}`;
    const performed = [];
    let failedAt = -1, failMsg = '';
    for (let i = 0; i < doc.lines.length; i++) {
      const l = doc.lines[i];
      try {
        // Snapshot pre-rimozione per rollback
        const before = Store.getItemsAtLocation(l.location_code).find(x => x.item_key === l.item_key);
        const backup = before ? { ...before } : null;
        /* 1.8 — anche il DDT esce a colli scelti: quello che sale sul camion
           è merce precisa, e il documento la nomina. */
        const scelteDdt = before ? await this._chiediColli(before, `Quali colli · riga ${i + 1} di ${doc.lines.length}`) : null;
        if (scelteDdt === undefined) { failedAt = i; failMsg = 'Evasione annullata alla scelta dei colli'; break; }
        const removed = await Store.removeItem(l.location_code, l.item_key, l.qty, null, scelteDdt);
        if (!removed) { failedAt = i; failMsg = `Rimozione fallita (riga ${i+1})`; break; }
        performed.push({ backup, mode: removed._mode, location_code: l.location_code, item_key: l.item_key, qty_removed: l.qty, qty_before: removed._qty_before, qty_after: removed._qty_after, packs_out: removed._packs_out ?? null });
      } catch (err) {
        failedAt = i;
        failMsg = `Errore riga ${i+1}: ${err.message || 'sconosciuto'}`;
        break;
      }
    }
    if (failedAt !== -1) {
      // Rollback
      for (let j = performed.length - 1; j >= 0; j--) {
        const p = performed[j];
        try {
          if (p.mode === 'full' && p.backup) await Store.restoreItem(p.backup);
          else if (p.backup) await Store.addItem(p.location_code, p.backup.article_code, p.backup.article_description, p.backup.lot_code, p.backup.expiry_date || '', p.backup.notes || '', p.packs_out ? p.packs_out.length : p.qty_removed, null, p.packs_out ?? null);
        } catch {}
      }
      return this.toast(`${failMsg} — rollback eseguito, DDT resta pendente`, 'error');
    }
    // Log movimenti
    const movIds = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const l = doc.lines[i];
      const p = performed[i];
      const itemNotes = l.notes ? `${reasonNotes} · ${l.notes}` : reasonNotes;
      const _id = await this._logMov(movType, l.article_code, l.article_description, l.lot_code, l.location_code, null, doc.operator || Store.getCurrentIdentity().initials, itemNotes, doc.ddt_num, p.qty_before, -p.qty_removed, p.qty_after);
      if (typeof _id === 'number') movIds.push(_id);
    }
    // Aggiorna status documento → evaded
    await Store.updatePendingStatus(doc_id, 'evaded');
    /* 1.4.4 — QUI NON SI CHIUDE NIENTE. Il compito di prelievo si è chiuso
       alla registrazione del DDT: l'evasione è il ritiro del vettore, un
       fatto del magazzino che non ha un'attività sua e non ne conclude
       nessuna. Fino alla 1.4.3 la chiusura stava qui, e dipendeva da un
       `task_id` che veniva scritto solo se la sessione dell'operatore era
       ancora viva al salvataggio: bastava uscire da Movimenta e rientrare
       perché il filo si spezzasse e il compito non si chiudesse mai più. */
    this.toast(`✓ DDT ${doc.ddt_num} evaso · ${doc.lines.length} righe · ${totalColli} Coll.`, 'success');
    this.updateSyncIndicator();
    if (await Dialog.confirm({
      title: 'Stampare il DDT?',
      message: 'Il documento esce senza la filigrana di bozza: la merce è uscita.',
      confirmLabel: 'Stampa', cancelLabel: 'Non ora', icon: '\u{1F5A8}'
    })) this._printDDT(doc_id);
    this._formSpedizioni(document.getElementById('movFormArea'));
    /* Evaso da fuori Movimenta, la vista da rinfrescare è quella da cui si è
       premuto: la Dashboard perde un DDT pendente, la coda può aver appena
       chiuso il prelievo che quel documento portava. */
    if (this.currentView === 'dashboard') this.renderDashboard();
    else if (this.currentView === 'tasks') this.renderTasks();
    this._refreshSessionLog();
  },

  /* Annulla DDT pendente: status → cancelled, nessun movimento di giacenza. */
  async _cancelPendingShip(doc_id) {
    if (!this._requireOperator("l'annullamento del DDT")) return;   // v2.0.1 [B7]
    const doc = Store.getPendingDoc(doc_id);
    if (!doc) return this.toast('Documento non trovato', 'error');
    if (doc.status !== 'pending') return this.toast('Documento non più pendente', 'error');
    if (!await Dialog.confirm({
      title: 'Annullare il DDT?',
      message: 'Il documento viene chiuso senza movimentare la giacenza. La merce torna interamente disponibile.',
      details: Dialog.kv([['N° DDT', doc.ddt_num], ['Destinatario', doc.destination]]),
      confirmLabel: 'Annulla il DDT', cancelLabel: 'Mantieni', danger: true
    })) return;
    await Store.updatePendingStatus(doc_id, 'cancelled');
    this.toast(`✓ DDT ${doc.ddt_num} annullato`, 'success');
    this._formSpedizioni(document.getElementById('movFormArea'));
  },

  _printDDT(doc_id) {
    const doc = Store.getPendingDoc(doc_id);
    if (!doc) return this.toast('Documento non trovato', 'error');
    Feedback.clear();   // v1.1.0 [N1] — vedi _docPrint: niente riscontri sopra il foglio

    const isRet = this._docIsReturn(doc);
    const causale = this._docCausaleLabel(doc);
    const isDraft = doc.status === 'pending';
    const totalColli = doc.lines.reduce((s, l) => s + (l.qty || 1), 0);

    const fmtDate = (iso) => iso
      ? new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '—';
    const fmtTs = (ms) => ms
      ? new Date(ms).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';

    const w = this._shipComputeWeights(doc.lines);
    const pesoNetto = doc.peso_netto || (w.net != null ? this._fmtKg(w.net) : '');
    const pesoLordo = doc.peso_lordo || '';
    const pezzi = doc.pieces_total != null ? doc.pieces_total : w.pieces;

    // Mittente congelato nel documento, altrimenti quello corrente
    const sender = (doc.sender && doc.sender.name) ? doc.sender : null;
    const s = sender || Store.getDocConfig().sender;
    const senderLoc = [s.address, [s.zip, s.city, s.province ? `(${s.province})` : ''].filter(Boolean).join(' ')]
      .filter(Boolean).join(' — ');
    const partenza = s.warehouse_address || senderLoc;

    const destLoc = [
      doc.dest_address,
      [doc.dest_zip, doc.dest_city, doc.dest_province ? `(${doc.dest_province})` : ''].filter(Boolean).join(' ')
    ].filter(Boolean).join(' — ');

    const rows = doc.lines.map((l, i) => {
      const a = Store.getArticle(l.article_code);
      const pp = a && Number(a.pieces_per_pack) > 0 ? Number(a.pieces_per_pack) : null;
      return `<tr>
        <td class="c-idx">${i+1}</td>
        <td class="c-art">${this._esc(l.article_code)}</td>
        <td class="c-desc">${this._esc(l.article_description || '—')}${this._avvisiRigaStampa(l.article_code)}</td>
        <td class="c-lot">${this._esc(l.lot_code)}</td>
        <td class="c-exp">${this._esc(this._dateISOtoIT(l.expiry_date) || l.expiry_date || '—')}</td>
        <td class="c-qty">${l.qty}</td>
        <td class="c-pcs">${pp != null ? pp * l.qty : '—'}</td>
        <td class="c-note">${this._esc(l.notes || '')}</td>
      </tr>`;
    }).join('');

    // Il mittente e i suoi campi li compone la testata condivisa.
    document.getElementById('printReport').innerHTML = this._docPageHTML({
      kind: 'DOCUMENTO DI TRASPORTO',
      kindSub: `D.P.R. 472/96 — ${isRet ? 'Reso · uscita merce' : 'Uscita merce'}`,
      num: doc.ddt_num,
      dateVal: fmtDate(doc.doc_date) === '—' ? fmtTs(doc.created_at) : fmtDate(doc.doc_date),
      sender,
      docId: doc.doc_id,
      pageClass: 'doc-page--ddt',
      watermark: isDraft ? 'BOZZA' : '',

      /* Blocco d'identificazione: le parti e la causale. E' cio' che sul
         DDT occupa il residuo della fascia di testata. */
      headExtra: `
        <div class="ddt-parties">
          <div class="ddt-box">
            <div class="ddt-box-lbl">Destinatario</div>
            <div class="ddt-box-name">${this._esc(doc.destination || '—')}</div>
            <div class="ddt-box-row">${destLoc ? this._esc(destLoc) : '<span class="doc-empty">indirizzo non indicato</span>'}</div>
            <div class="ddt-box-vat">${doc.dest_vat ? 'P. IVA / C.F. ' + this._esc(doc.dest_vat) : '<span class="doc-empty">P. IVA non indicata</span>'}</div>
          </div>
          <div class="ddt-box">
            <div class="ddt-box-lbl">Luogo di destinazione della merce</div>
            <div class="ddt-box-row" style="font-weight:600">${doc.ship_to ? this._esc(doc.ship_to) : 'Come destinatario'}</div>
            <div class="ddt-box-foot"><strong>Partenza:</strong> ${this._esc(partenza || '—')}</div>
          </div>
        </div>
        <div class="ddt-strip">
          <span class="ddt-strip-lbl">Causale del trasporto</span>
          <span class="ddt-strip-val">${this._esc(causale)}</span>
          ${doc.order_ref ? `<span class="ddt-strip-ref">Rif. ordine: <strong>${this._esc(doc.order_ref)}</strong></span>` : ''}
        </div>`,

      body: `
        ${this._docWarnHTML()}

        ${isDraft ? `<div class="doc-draft-note">
          DOCUMENTO NON ANCORA EVASO — la merce è prenotata ma non è uscita dal magazzino.
          Questo foglio non accompagna il trasporto finché il DDT non viene evaso.
        </div>` : ''}

        <table class="ddt-table">
          <thead><tr>
            <th class="c-idx">#</th>
            <th class="c-art">Articolo</th>
            <th class="c-desc">Natura e qualità dei beni</th>
            <th class="c-lot">Lotto</th>
            <th class="c-exp">Scadenza</th>
            <th class="c-qty">Colli</th>
            <th class="c-pcs">Pezzi</th>
            <th class="c-note">Note</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="doc-fill"></div>

        <!-- Riepilogo su tre righe da sei unita'. L'ordine NON e' estetico:
             le voci con etichetta corta stanno nelle celle strette, quelle
             con etichetta lunga prendono due unita'. Una cella troppo
             stretta manda a capo l'etichetta E il valore, e alza l'intera
             riga della griglia. -->
        <div class="ddt-totals">
          ${this._docCell('Numero colli', String(totalColli))}
          ${this._docCell('Pezzi totali', pezzi != null ? String(pezzi) : '')}
          ${this._docCell('Peso netto (kg)', pesoNetto)}
          ${this._docCell('Peso lordo (kg)', pesoLordo)}
          ${this._docCell('Porto', doc.porto)}
          ${this._docCell('Ritiro previsto', doc.expected_pickup_date ? fmtDate(doc.expected_pickup_date) : '')}

          ${this._docCell('Aspetto esteriore dei beni', doc.aspetto, 'doc-cell--wide')}
          ${this._docCell('Vettore', doc.carrier, 'doc-cell--wide')}
          ${this._docCell('Trasporto a cura di', doc.transport_by, 'doc-cell--wide')}

          ${this._docCell('Data e ora inizio trasporto', doc.start_transport, 'doc-cell--wide')}
          <div class="doc-cell doc-cell--rest">
            <div class="doc-cell-lbl">Annotazioni</div>
            <div class="ddt-notes-val">${doc.doc_notes ? this._esc(doc.doc_notes) : ''}</div>
          </div>
        </div>`,

      signs: [
        { role: 'Firma del mittente',     hint: doc.operator || '' },
        { role: 'Firma del vettore',      hint: 'Data e ora del ritiro' },
        { role: 'Firma del destinatario', hint: 'Data e ora della consegna' }
      ]
    });
    window.print();
    setTimeout(() => { document.getElementById('printReport').innerHTML = ''; }, 1500);
  },

  /* Apre il modal di edit per un DDT pendente. Crea uno snapshot mutabile in
     this._editState (NO mutazione diretta del cache fino al salvataggio). */
  _editPendingDoc(doc_id) {
    const doc = Store.getPendingDoc(doc_id);
    if (!doc) return this.toast('DDT non trovato', 'error');
    if (doc.status !== 'pending') return this.toast('Solo DDT pendenti possono essere modificati', 'error');
    // Snapshot mutabile (deep copy delle righe)
    this._editState = {
      doc_id: doc.doc_id,
      kind: doc.kind,
      ddt_num: doc.ddt_num,
      destination: doc.destination,
      carrier: doc.carrier || '',
      expected_pickup_date: doc.expected_pickup_date || '',
      lines: doc.lines.map(l => ({ ...l })),
      newLineState: null  // stato corrente per aggiungere una nuova riga
    };
    this._renderEditModal();
  },

  _renderEditModal() {
    const s = this._editState;
    if (!s) return;
    const isRes = s.kind === 'RES';
    const themeColor = isRes ? 'var(--sx-teal)' : 'var(--sx-orange)';
    const themeIcon = isRes ? '↩️' : '🚚';
    const themeLabel = isRes ? 'Reso' : 'Spedizione';
    const targetLabel = isRes ? 'Destinatario / Fornitore' : 'Cliente';
    const targetPlaceholder = isRes ? 'Fornitore a cui torna la merce' : 'Cliente destinatario';
    // Calcolo alert sulla data corrente in edit
    const tmpAlert = pickupAlertStatus({ expected_pickup_date: s.expected_pickup_date });
    const totalColli = s.lines.reduce((acc, l) => acc + (l.qty || 0), 0);
    // Render righe
    const linesHtml = s.lines.length === 0
      ? `<div class="pick-cart-empty">Nessuna riga — aggiungerne almeno una prima di salvare</div>`
      : s.lines.map((l, i) => {
        const expBadge = l.expiry_date ? ` · scad. ${this._esc(l.expiry_date)}` : '';
        return `<div class="pick-cart-item" style="border-left:3px solid ${themeColor};flex-wrap:wrap;align-items:flex-start">
          <div class="pci-num" style="background:${themeColor}">${i+1}</div>
          <div class="pci-info" style="flex:1;min-width:200px">
            <div class="pci-code">${this._esc(l.article_code)} <span style="color:var(--sx-text-muted);font-weight:400;font-size: var(--md-sys-typescale-label-small-size)">${this._esc(l.article_description || '')}</span></div>
            <div class="pci-loc">L:${this._esc(l.lot_code)} · 📍 ${this._esc(l.location_code)}${expBadge}</div>
            <div style="display:flex;gap:0.4rem;align-items:center;margin-top:0.3rem;flex-wrap:wrap">
              <label style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">Qty:</label>
              <input class="input input-mono" type="number" min="1" step="1" value="${l.qty}" style="width:70px;text-align:center;font-weight:700;padding:0.2rem 0.3rem"
                onchange="App._editLineQty(${i}, this.value)">
              <span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">(orig. ${l.qty_at_creation || l.qty})</span>
            </div>
            <div style="margin-top:0.3rem">
              <input class="input" placeholder="Note riga (opz.)" maxlength="${Validate.MAX.NOTES}" value="${this._esc(l.notes || '')}" style="font-size: var(--md-sys-typescale-label-small-size);padding:0.25rem 0.4rem"
                onchange="App._editLineNotes(${i}, this.value)">
            </div>
          </div>
          <button class="btn btn-sm btn-ghost" style="color:var(--sx-danger);align-self:center" onclick="App._editRemoveLine(${i})" title="Rimuovi riga">✕</button>
        </div>`;
      }).join('');
    // Form per aggiungere nuova riga
    const newLineHtml = `<details style="margin-top:0.6rem">
      <summary style="cursor:pointer;font-size: var(--md-sys-typescale-body-small-size);font-weight:600;color:${themeColor};padding:0.4rem 0.5rem;background:${isRes ? 'var(--grad-soft-teal)' : 'var(--grad-soft-orange)'};border:1px solid ${themeColor};border-radius:var(--radius)">
        ➕ Aggiungi nuova riga al DDT
      </summary>
      <div style="border:1px solid var(--sx-border);border-top:none;border-radius:0 0 var(--radius) var(--radius);padding:0.5rem;background:var(--sx-card-alt)">
        <div class="form-group" style="margin-bottom:0.3rem">
          <label style="font-size: var(--md-sys-typescale-label-small-size)">① Articolo</label>
          <input class="input input-mono" id="pEditArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"
            onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('pEditLot')?.focus();}">
        </div>
        <div class="form-group" style="margin-bottom:0.3rem">
          <label style="font-size: var(--md-sys-typescale-label-small-size)">② Lotto</label>
          <input class="input input-mono" id="pEditLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._editLookupNewLine();}">
          <div id="pEditInfo"></div>
        </div>
        <div id="pEditDetails" class="hidden">
          <div id="pEditPreview"></div>
          <div style="display:flex;gap:0.4rem;margin-bottom:0.3rem;align-items:flex-end">
            <div class="form-group" style="width:120px;margin-bottom:0">
              <label style="font-size: var(--md-sys-typescale-label-small-size)">Qty</label>
              <input class="input input-mono" id="pEditQty" type="number" min="1" step="1" value="1" style="text-align:center;font-weight:700;padding:0.2rem 0.3rem"
                onkeydown="if(event.key==='Enter'){event.preventDefault();App._editAddNewLine();}">
            </div>
            <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);padding-bottom:0.3rem">Disp.: <strong id="pEditAvail" style="color:${themeColor}">—</strong></div>
          </div>
          <input class="input" id="pEditNotes" maxlength="${Validate.MAX.NOTES}" placeholder="Note riga (opz.)" style="font-size: var(--md-sys-typescale-label-small-size);padding:0.25rem 0.4rem;margin-bottom:0.3rem">
          <button class="btn btn-sm" style="width:100%;background:${themeColor};color:#fff;border-color:${themeColor};font-weight:700" onclick="App._editAddNewLine()">+ Aggiungi al DDT</button>
        </div>
      </div>
    </details>`;
    // Persisti header attuale prima di re-render (se modal già aperta)
    const existing = document.getElementById('editPendingModal');
    if (existing) this._editPersistHeader();
    existing?.remove();
    // Crea overlay e appendi al body (pattern usato da operatorModal)
    const overlay = document.createElement('div');
    overlay.id = 'editPendingModal';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) App._editCancel(); });
    overlay.innerHTML = `<div class="modal" style="max-width:680px;width:95%">
      <div class="modal-header">
        <h2>${themeIcon} Modifica DDT ${themeLabel} pendente</h2>
        <button class="btn btn-sm btn-icon btn-ghost" onclick="App._editCancel()">✕</button>
      </div>
      <div class="modal-body">
        <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);background:var(--grad-soft-blue);padding:0.4rem 0.5rem;border-radius:var(--radius);margin-bottom:0.6rem">
          Modifiche permesse solo su DDT in stato <strong>pendente</strong>. Le righe vengono validate al salvataggio finale (re-check disponibilità).
        </div>
        <!-- TESTATA -->
        <div style="background:${isRes ? 'var(--grad-soft-teal)' : 'var(--grad-soft-orange)'};border:1px solid ${themeColor};border-radius:var(--radius);padding:0.5rem 0.6rem;margin-bottom:0.6rem">
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:${themeColor};font-weight:700;margin-bottom:0.3rem">📋 TESTATA DDT</div>
          <div class="form-row" style="margin-bottom:0.4rem">
            <div class="form-group">
              <label>N° DDT</label>
              <input class="input input-mono" id="pEditDdt" maxlength="40" value="${this._esc(s.ddt_num)}">
            </div>
            <div class="form-group">
              <label>${targetLabel}</label>
              <input class="input" id="pEditDest" placeholder="${targetPlaceholder}" maxlength="${Validate.MAX.OPERATOR}" value="${this._esc(s.destination)}">
            </div>
          </div>
          <div class="form-row" style="margin-bottom:0">
            <div class="form-group">
              <label>📅 Data Ritiro Prevista <span style="font-size: var(--md-sys-typescale-label-small-size);color:${tmpAlert.color};font-weight:600">${tmpAlert.shortLabel || ''}</span></label>
              <input class="input" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10" id="pEditExpected" value="${this._esc(this._dateISOtoIT(s.expected_pickup_date))}"
                oninput="App._dateMaskInput(this)"
                onchange="App._editPersistHeader();App._renderEditModal()">
            </div>
            <div class="form-group">
              <label>Vettore</label>
              <input class="input" id="pEditCarrier" placeholder="Es: BRT, GLS" maxlength="${Validate.MAX.OPERATOR}" value="${this._esc(s.carrier)}">
            </div>
          </div>
        </div>
        <!-- RIGHE -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin:0.7rem 0 0.25rem">
          <strong style="font-size: var(--md-sys-typescale-body-small-size)">📦 Righe DDT <span style="color:${themeColor}">(${s.lines.length})</span> · Tot. <strong style="color:${themeColor}">${totalColli} Coll.</strong></strong>
        </div>
        <div class="pick-cart">${linesHtml}</div>
        ${newLineHtml}
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="App._editCancel()">✕ Annulla</button>
        <button class="btn" style="background:${themeColor};color:#fff;border-color:${themeColor};font-weight:700" onclick="App._editSave()">💾 Salva Modifiche</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  },

  /* Aggiorna qty di una riga in edit. Validazione: deve essere intero ≥ 1 e
     ≤ disponibilità attuale (esclude prenotazioni di altri DDT pendenti). */
  _editLineQty(idx, value) {
    const s = this._editState;
    if (!s || !s.lines[idx]) return;
    const newQty = parseInt(value);
    if (!newQty || newQty < 1) {
      this.toast('Qty non valida', 'error');
      this._renderEditModal();
      return;
    }
    // Verifica disponibilità: qty totale - prenotazioni altri DDT pendenti (esclude questo) - altre righe carrello stesso item
    const line = s.lines[idx];
    const cur = Store.getItemsAtLocation(line.location_code).find(x => x.item_key === line.item_key);
    if (!cur) {
      this.toast(`Item ${line.article_code}#${line.lot_code} non più in giacenza in ${line.location_code}`, 'error');
      this._renderEditModal();
      return;
    }
    const totalQty = cur.qty || 1;
    // Pending qty da OTHERS (non questo doc)
    let pendingFromOthers = 0;
    for (const d of Store.getPendingOutbound()) {
      if (d.status !== 'pending' || d.doc_id === s.doc_id) continue;
      for (const l of d.lines) {
        if (l.location_code === line.location_code && l.item_key === line.item_key) pendingFromOthers += (l.qty || 0);
      }
    }
    // Altre righe stesso item nel medesimo DDT in edit (escluse questa riga idx)
    const sameItemOtherRows = s.lines
      .filter((_, j) => j !== idx)
      .filter(l2 => l2.location_code === line.location_code && l2.item_key === line.item_key)
      .reduce((acc, l2) => acc + (l2.qty || 0), 0);
    const maxAllowed = totalQty - pendingFromOthers - sameItemOtherRows;
    if (newQty > maxAllowed) {
      this.toast(`Qty (${newQty}) supera disponibilità effettiva (${maxAllowed})`, 'error');
      this._renderEditModal();
      return;
    }
    s.lines[idx].qty = newQty;
    this._renderEditModal();
  },

  _editLineNotes(idx, value) {
    const s = this._editState;
    if (!s || !s.lines[idx]) return;
    const v = Validate.clean(value);
    const err = Validate.notes(v);
    if (err) { this.toast(err, 'error'); this._renderEditModal(); return; }
    s.lines[idx].notes = v;
  },

  async _editRemoveLine(idx) {
    const s = this._editState;
    if (!s || !s.lines[idx]) return;
    const line = s.lines[idx];
    if (!await Dialog.confirm({
      title: `Rimuovere la riga ${idx + 1}?`,
      details: Dialog.kv([
        ['Articolo', line.article_code],
        ['Lotto', line.lot_code],
        ['Quantità', `${line.qty} Coll.`],
        ['Ubicazione', line.location_code]
      ]),
      confirmLabel: 'Rimuovi riga', danger: true
    })) return;
    s.lines.splice(idx, 1);
    this._renderEditModal();
  },

  /* Lookup item per aggiungere una nuova riga al DDT in edit. Stesso meccanismo
     di _shipLookup ma scrive risultato in this._editState.newLineState. */
  _editLookupNewLine() {
    const s = this._editState;
    if (!s) return;
    const art = Validate.clean(document.getElementById('pEditArt')?.value, true);
    const lot = Validate.clean(document.getElementById('pEditLot')?.value);
    const info = document.getElementById('pEditInfo');
    const details = document.getElementById('pEditDetails');
    if (!art || !lot) {
      info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Articolo e lotto obbligatori</div>`;
      return;
    }
    if (Validate.article(art) || Validate.lot(lot)) {
      info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Formato non valido</div>`;
      return;
    }
    const allItems = Store.findItemLocations(art).filter(it => it.lot_code === lot && !Store.isItemQuarantined(it.item_key, it.location_code));
    if (!allItems.length) {
      info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);margin-top:0.2rem">✗ Item ${this._esc(art)}#${this._esc(lot)} non disponibile in magazzino</div>`;
      details.classList.add('hidden');
      return;
    }
    // Calcolo disponibilità per ciascuna ubicazione
    const enriched = allItems.map(it => {
      const totalQty = it.qty || 1;
      let pendingFromOthers = 0;
      for (const d of Store.getPendingOutbound()) {
        if (d.status !== 'pending' || d.doc_id === s.doc_id) continue;
        for (const l of d.lines) {
          if (l.location_code === it.location_code && l.item_key === it.item_key) pendingFromOthers += (l.qty || 0);
        }
      }
      const inEditedDoc = s.lines
        .filter(l2 => l2.location_code === it.location_code && l2.item_key === it.item_key)
        .reduce((acc, l2) => acc + (l2.qty || 0), 0);
      const avail = Math.max(0, totalQty - pendingFromOthers - inEditedDoc);
      return { ...it, _totalQty: totalQty, _availableQty: avail };
    });
    const usable = enriched.filter(it => it._availableQty > 0);
    if (!usable.length) {
      info.innerHTML = `<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-warning);margin-top:0.2rem">⚠ Tutta la giacenza di ${this._esc(art)}#${this._esc(lot)} è impegnata</div>`;
      details.classList.add('hidden');
      return;
    }
    if (usable.length === 1) { this._editSelectNewLineItem(usable[0]); return; }
    // Più ubicazioni: mostra elenco
    let html = '<div style="max-height:160px;overflow-y:auto;margin-top:0.3rem"><div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.2rem">Item presente in più ubicazioni:</div>';
    for (const it of usable) {
      const p = App._payload(it);
      html += `<div class="inv-item-row" style="cursor:pointer;font-size: var(--md-sys-typescale-label-small-size)" onclick="App._editSelectNewLineEnc('${p}')">
        <div class="inv-info">
          <div class="inv-code">${this._esc(it.article_code)} <span style="color:var(--sx-text-muted);font-weight:400;font-size: var(--md-sys-typescale-label-small-size)">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">L:${this._esc(it.lot_code)} · 📍 ${this._esc(it.location_code)} · <strong>${it._availableQty}/${it._totalQty} Coll.</strong></div>
        </div>
      </div>`;
    }
    info.innerHTML = html + '</div>';
    details.classList.add('hidden');
  },

  _editSelectNewLineEnc(p) { this._editSelectNewLineItem(JSON.parse(decodeURIComponent(p))); },

  _editSelectNewLineItem(item) {
    const s = this._editState;
    if (!s) return;
    const cur = Store.getItemsAtLocation(item.location_code).find(i => i.item_key === item.item_key);
    if (!cur) return this.toast('Item non più disponibile', 'error');
    s.newLineState = { item: cur, availableQty: item._availableQty };
    document.getElementById('pEditInfo').innerHTML = '';
    const expBadge = cur.expiry_date ? ` · scad. ${this._esc(cur.expiry_date)}` : '';
    document.getElementById('pEditPreview').innerHTML = `<div class="mov-preview" style="margin-bottom:0.3rem;font-size: var(--md-sys-typescale-label-small-size)">
      <strong>${this._esc(cur.article_code)}</strong> <span style="color:var(--sx-text-muted)">${this._esc(cur.article_description || '')}</span><br>
      <span style="color:var(--sx-text-muted);font-size: var(--md-sys-typescale-label-small-size)">L:${this._esc(cur.lot_code)} · 📍 ${this._esc(cur.location_code)} · disp. <strong>${item._availableQty} Coll.</strong>${expBadge}</span>
    </div>`;
    const qe = document.getElementById('pEditQty');
    if (qe) { qe.value = item._availableQty; qe.max = item._availableQty; }
    const av = document.getElementById('pEditAvail'); if (av) av.textContent = item._availableQty;
    document.getElementById('pEditDetails').classList.remove('hidden');
    qe?.focus();
    qe?.select();
  },

  /* Aggiunge la nuova riga al DDT in edit. */
  _editAddNewLine() {
    const s = this._editState;
    if (!s?.newLineState?.item) return this.toast('Identifica prima un item', 'error');
    const ns = s.newLineState;
    const qty = parseInt(document.getElementById('pEditQty')?.value);
    const notes = Validate.clean(document.getElementById('pEditNotes')?.value);
    if (!qty || qty < 1) return this.toast('Qty non valida', 'error');
    if (qty > ns.availableQty) return this.toast(`Qty supera disponibilità (${ns.availableQty})`, 'error');
    if (Validate.notes(notes)) return this.toast(Validate.notes(notes), 'error');
    s.lines.push({
      article_code: ns.item.article_code,
      article_description: ns.item.article_description || '',
      lot_code: ns.item.lot_code,
      location_code: ns.item.location_code,
      item_key: ns.item.item_key,
      expiry_date: ns.item.expiry_date || '',
      qty,
      qty_at_creation: ns.availableQty,
      notes
    });
    s.newLineState = null;
    this.toast(`+ Riga aggiunta: ${ns.item.article_code}#${ns.item.lot_code} (${qty} Coll.)`, 'success');
    // Persisti i campi testata in editState prima di re-render
    this._editPersistHeader();
    this._renderEditModal();
  },

  /* Persiste i campi testata correnti dal DOM nello _editState (per non perderli a re-render). */
  _editPersistHeader() {
    const s = this._editState;
    if (!s) return;
    const ddt = document.getElementById('pEditDdt')?.value;
    const dest = document.getElementById('pEditDest')?.value;
    const carrier = document.getElementById('pEditCarrier')?.value;
    const expected = document.getElementById('pEditExpected')?.value;
    if (ddt !== undefined) s.ddt_num = Validate.clean(ddt);
    if (dest !== undefined) s.destination = Validate.clean(dest);
    if (carrier !== undefined) s.carrier = Validate.clean(carrier);
    // v2.3.0 [D1] — il campo è in gg/mm/aaaa; su data non valida mantiene la precedente
    // (il modale si ri-renderizza subito e azzererebbe la digitazione in corso)
    if (expected !== undefined) {
      const iso = this._dateITtoISO(expected, 'Data ritiro');
      s.expected_pickup_date = iso === null ? (s.expected_pickup_date || '') : iso;
    }
  },

  /* Salva le modifiche del DDT pendente: validazioni complete + Store.updatePendingDoc. */
  async _editSave() {
    if (!this._requireOperator('la modifica del DDT')) return;   // v2.0.1 [B7]
    const s = this._editState;
    if (!s) return;
    this._editPersistHeader();
    if (!s.ddt_num) return this.toast('N° DDT obbligatorio', 'error');
    if (!s.destination) return this.toast('Destinatario / Cliente obbligatorio', 'error');
    if (!s.lines.length) return this.toast('Il DDT deve contenere almeno una riga', 'error');
    // Re-validazione disponibilità per tutte le righe (potrebbe essere cambiata)
    for (let i = 0; i < s.lines.length; i++) {
      const l = s.lines[i];
      const cur = Store.getItemsAtLocation(l.location_code).find(x => x.item_key === l.item_key);
      if (!cur) return this.toast(`Riga ${i+1}: ${l.article_code}#${l.lot_code} non più in ${l.location_code}`, 'error');
      const totalQty = cur.qty || 1;
      let pendingFromOthers = 0;
      for (const d of Store.getPendingOutbound()) {
        if (d.status !== 'pending' || d.doc_id === s.doc_id) continue;
        for (const l2 of d.lines) {
          if (l2.location_code === l.location_code && l2.item_key === l.item_key) pendingFromOthers += (l2.qty || 0);
        }
      }
      const sameItemOtherRows = s.lines
        .filter((_, j) => j !== i)
        .filter(l2 => l2.location_code === l.location_code && l2.item_key === l.item_key)
        .reduce((acc, l2) => acc + (l2.qty || 0), 0);
      const maxAllowed = totalQty - pendingFromOthers - sameItemOtherRows;
      if (l.qty > maxAllowed) return this.toast(`Riga ${i+1}: qty (${l.qty}) > disponibilità effettiva (${maxAllowed})`, 'error');
    }
    try {
      await Store.updatePendingDoc(s.doc_id, {
        ddt_num: s.ddt_num,
        destination: s.destination,
        carrier: s.carrier,
        expected_pickup_date: s.expected_pickup_date,
        lines: s.lines
      });
      this.toast(`✓ DDT ${s.ddt_num} aggiornato`, 'success');
      this.updateSyncIndicator();
      this._editCancel();
      // Re-render del form per mostrare il DDT aggiornato
      // v3.0.0 [M3] — un modulo solo: niente più da scegliere in base al kind
      const fa = document.getElementById('movFormArea');
      if (fa) this._formSpedizioni(fa);
      // Aggiorna anche dashboard se visibile
      if (this.currentView === 'dashboard') this.renderDashboard();
    } catch (err) {
      this.toast(`Errore: ${err.message || 'sconosciuto'}`, 'error');
    }
  },

  _editCancel() {
    this._editState = null;
    document.getElementById('editPendingModal')?.remove();
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

  renderConfig() {
    const el = document.getElementById('viewConfig');
    el.innerHTML = `<div class="config-container">
      <h1 style="font-size: var(--md-sys-typescale-title-large-size);color:var(--sx-primary);font-weight:700;margin-bottom:0.75rem">⚙ Configurazione</h1>
      <div class="config-tabs">
        <button class="config-tab ${this._configTab === 'sites' ? 'active' : ''}" onclick="App._configTab='sites';App.renderConfig()">Siti e Zone</button>
        <button class="config-tab ${this._configTab === 'articles' ? 'active' : ''}" onclick="App._configTab='articles';App.renderConfig()">Anagrafica Articoli</button>
        <button class="config-tab ${this._configTab === 'params' ? 'active' : ''}" onclick="App._configTab='params';App.renderConfig()">Parametri Articolo</button>
        <button class="config-tab ${this._configTab === 'recipients' ? 'active' : ''}" onclick="App._configTab='recipients';App.renderConfig()">Destinatari</button>
        <button class="config-tab ${this._configTab === 'operators' ? 'active' : ''}" onclick="App._configTab='operators';App.renderConfig()">Operatori</button>
        <button class="config-tab ${this._configTab === 'docs' ? 'active' : ''}" onclick="App._configTab='docs';App.renderConfig()">DDT e Documenti</button>
        <button class="config-tab ${this._configTab === 'session' ? 'active' : ''}" onclick="App._configTab='session';App.renderConfig()">Sessione</button>
        <button class="config-tab ${this._configTab === 'features' ? 'active' : ''}" onclick="App._configTab='features';App.renderConfig()">Funzioni</button>
        <button class="config-tab ${this._configTab === 'data' ? 'active' : ''}" onclick="App._configTab='data';App.renderConfig()">Dati e Backup</button>
      </div>
      <div id="configContent"></div>
    </div>`;
    const content = document.getElementById('configContent');
    if (this._configTab === 'sites') this._renderConfigSites(content);
    else if (this._configTab === 'articles') this._renderConfigArticles(content);
    else if (this._configTab === 'params') this._renderConfigParams(content);
    else if (this._configTab === 'recipients') this._renderConfigRecipients(content);
    else if (this._configTab === 'operators') this._renderConfigOperators(content);
    else if (this._configTab === 'docs') this._renderConfigDocs(content);   // v3.0.0 [M4]
    else if (this._configTab === 'session') this._renderConfigSession(content);
    else if (this._configTab === 'features') this._renderConfigFeatures(content);
    else this._renderConfigData(content);
  },

  /* ═══ INTERRUTTORI DI FUNZIONE — 1.4 ═══════════════════════════════
     Le cinque funzioni della 1.4 entrano in magazzino spente e si accendono
     una alla volta. Questa scheda e' l'unico posto da cui si alzano, e ogni
     interruttore e' un gesto suo: accenderne due nello stesso turno deve
     costare due volte, se no il giorno dopo non si sa quale delle due ha
     mosso qualcosa.

     La riga «Cosa cambia» non e' cortesia: chi alza l'interruttore deve
     leggere cosa vedra' il turno dopo, prima e non dopo. */
  _FUNZIONI: [
    { nome: 'tasks', ver: '1.4.1', label: 'Schedulatore di attività', icona: '📋',
      cosa: 'Le attività che il magazzino fa già — trasferimenti, prelievi, quarantene, campionamenti — diventano richieste con una coda, una priorità e dei tempi.',
      cambia: 'Compare la voce «Attività» in barra e il riquadro delle attività aperte in Dashboard. Nessuna operazione cambia: cambia che si può chiedere prima di fare.',
      pronta: true },
    { nome: 'uom', ver: '1.4.2', label: 'Unità di misura e colli', icona: '⚖',
      cosa: 'PZ, MT, LT, KG, GR accanto ai colli. Al primo posizionamento la confezione del lotto si congela, e da lì il sistema calcola la suddivisione e quantifica il collo incompleto.',
      cambia: 'Sotto ogni riga di giacenza compare com\'è imballata — «10 × 1.000 + 1 × 100 PZ» — e nel posizionamento un campo per dichiarare il totale quando l\'ultimo collo non è pieno. Gli articoli senza quantità per collo restano a soli colli, come oggi.',
      pronta: true },
    { nome: 'colli', ver: '1.8', label: 'Colli dichiarati', icona: '📦',
      cosa: 'La suddivisione non si calcola più da una quantità per collo costante: al posizionamento si dichiara com\'è imballata la merce — «10 × 1.000 + 1 × 900» — e più colli incompleti sono ammessi. A prelievo, smaltimento e trasferimento si sceglie quali colli e quanto prenderne.',
      cambia: 'Il posizionamento chiede la suddivisione invece della sola quantità, e ogni funzione che toglie merce — smaltimento, trasferimento, prelievo, spedizione, quarantena, conta — chiede prima quali colli. Le righe già a scaffale continuano a leggersi come oggi finché non le si muove. Richiede le unità di misura accese, e l\'inventario di vano rimanda alla Conta mirata le righe a colli dichiarati.',
      pronta: true },
    { nome: 'udc', ver: '1.4.3', label: 'UDC — unità di carico', icona: '🟫',
      cosa: 'Pallet, cassoni e carrelli che si spostano interi, con l\'etichetta stampata alla creazione.',
      cambia: 'Non ancora costruita: arriva con la 1.4.3.', pronta: false },
    { nome: 'putaway', ver: '1.4.4', label: 'Motore di stoccaggio', icona: '🎯',
      cosa: 'Propone dove mettere la merce, e dice perché.',
      cambia: 'Non ancora costruita: arriva con la 1.4.4.', pronta: false },
    { nome: 'wip', ver: '1.4.5', label: 'WIP — conto di produzione', icona: '🏭',
      cosa: 'Il prelievo di produzione diventa un trasferimento verso l\'ubicazione WIP, e ciò che non torna è il consumo reale.',
      cambia: 'Non ancora costruita: arriva con la 1.4.5, e si accende a gennaio.', pronta: false },
  ],

  /* 12 ore: un turno, con il margine di chi accende a fine giornata. */
  _TURNO_MS: 12 * 3600 * 1000,

  _renderConfigFeatures(el) {
    const log = Store.getFeatureLog();
    const ultimaAccensione = log.find(v => v.acceso);
    const recente = ultimaAccensione && (Date.now() - ultimaAccensione.at) < this._TURNO_MS
      ? ultimaAccensione : null;

    const righe = this._FUNZIONI.map(f => {
      const on = Store.isFeatureOn(f.nome);
      const voce = log.find(v => v.nome === f.nome);
      return `<div class="config-card" style="margin-bottom:0.7rem;${on ? 'border-left:3px solid var(--sx-success)' : ''}">
        <div style="display:flex;align-items:flex-start;gap:0.8rem;flex-wrap:wrap">
          <div style="font-size:1.5rem;line-height:1.2">${f.icona}</div>
          <div style="flex:1;min-width:240px">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
              <strong>${this._esc(f.label)}</strong>
              <span class="mono" style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">${f.ver}</span>
              <span class="badge ${on ? 'badge-green' : 'badge-muted'}" style="font-size: var(--md-sys-typescale-label-small-size)">${on ? 'ACCESA' : 'spenta'}</span>
              ${f.pronta ? '' : '<span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">non ancora costruita</span>'}
            </div>
            <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.6;margin-top:0.3rem">${this._esc(f.cosa)}</div>
            <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);line-height:1.6;margin-top:0.2rem"><strong>Cosa cambia a video:</strong> ${this._esc(f.cambia)}</div>
            ${voce ? `<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.3rem">
              Ultimo cambio: ${voce.acceso ? 'accesa' : 'spenta'} il ${new Date(voce.at).toLocaleString('it-IT')}${voce.by ? ` da ${this._esc(voce.by)}` : ''}</div>` : ''}
          </div>
          <button class="btn btn-sm ${on ? '' : 'btn-primary'}" ${f.pronta ? '' : 'disabled'}
            onclick="App._toggleFeature('${f.nome}')">${on ? 'Spegni' : 'Accendi'}</button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="mov-preview" style="margin-bottom:0.8rem;line-height:1.6">
        Le funzioni della <strong>1.4</strong> sono installate ma spente: il codice è in magazzino,
        il comportamento no. Si accende <strong>una funzione alla volta, a inizio turno</strong>, e se
        qualcosa si muove nel verso sbagliato si rispegne — senza disinstallare niente e
        <strong>senza toccare il database</strong>.<br>
        Alzare un interruttore richiede il <strong>PIN di un Team Leader</strong>.
      </div>
      ${recente ? `<div class="mov-preview mov-preview-warn" style="margin-bottom:0.8rem;line-height:1.6">
        ⚠ <strong>${this._esc(recente.nome)}</strong> è stata accesa
        ${new Date(recente.at).toLocaleString('it-IT')}${recente.by ? ` da ${this._esc(recente.by)}` : ''}.
        Accenderne una seconda adesso significa che, se qualcosa cambia, non si saprà quale delle due.
        Meglio aspettare il turno dopo.
      </div>` : ''}
      ${righe}`;
  },

  async _toggleFeature(nome) {
    const f = this._FUNZIONI.find(x => x.nome === nome);
    if (!f) return;
    const on = Store.isFeatureOn(nome);
    const conferma = await Dialog.confirm({
      title: on ? `Spegnere ${f.label}?` : `Accendere ${f.label}?`,
      message: on
        ? `La funzione sparisce dalle schermate al prossimo disegno. I dati già scritti restano dove sono: spegnere non cancella niente.`
        : `${f.cambia}\n\nSi accende una funzione alla volta, a inizio turno. Se qualcosa si muove nel verso sbagliato, si rispegne da qui.`,
      confirmLabel: on ? 'Spegni' : 'Accendi',
      danger: on,
    });
    if (!conferma) return;
    const leader = await this._requireLeaderAuth(`${on ? 'Spegnimento' : 'Accensione'} di «${f.label}»`);
    if (!leader) return;
    try {
      await Store.setFeature(nome, !on);
      this.toast(`${f.icona} ${f.label}: ${!on ? 'ACCESA' : 'spenta'}`, 'success');
      this._syncFeatureNav();
      this.renderConfig();
    } catch (err) {
      this.toast(`Interruttore non cambiato: ${err.message}`, 'error');
    }
  },

  /* Le voci di barra che dipendono da un interruttore. Si chiama all'avvio e
     ogni volta che un interruttore si muove: un pulsante che porta a una
     funzione spenta e' peggio di un pulsante che non c'e'. */
  _syncFeatureNav() {
    const acceso = Store.isFeatureOn('tasks');
    for (const el of document.querySelectorAll('[data-feature="tasks"]')) {
      el.classList.toggle('hidden', !acceso);
    }
    if (!acceso && this.currentView === 'tasks') this.switchView('dashboard');
  },

  /* Campi del mittente senza i quali il DDT non e' conforme. Il resto
     (REA, telefono, email, sede operativa) e' utile ma non dirimente. */
  _DOC_REQUIRED: [
    ['name',    'Ragione sociale'],
    ['address', 'Indirizzo'],
    ['city',    'Comune'],
    ['vat',     'Partita IVA']
  ],

  /* Cosa manca al mittente per poter emettere un DDT. Array vuoto = a posto.
     Usata sia dalla scheda di configurazione sia dalla stampa. */
  _docSenderGaps(sender = null) {
    const s = sender || Store.getDocConfig().sender;
    return this._DOC_REQUIRED
      .filter(([k]) => !String(s[k] || '').trim())
      .map(([, label]) => label);
  },

  _renderConfigDocs(el) {
    const cfg = Store.getDocConfig();
    const s = cfg.sender;
    const gaps = this._docSenderGaps(s);

    const causaliRows = cfg.causali.map((c, i) => `
      <tr>
        <td><input class="input" value="${this._esc(c.label)}" maxlength="60"
              onchange="App._docCausaleEdit(${i},'label',this.value)"></td>
        <td style="width:190px">
          <select class="select" onchange="App._docCausaleEdit(${i},'mov',this.value)">
            <option value="SHIP" ${c.mov !== 'RET' ? 'selected' : ''}>Spedizione (uscita)</option>
            <option value="RET"  ${c.mov === 'RET' ? 'selected' : ''}>Reso</option>
          </select>
        </td>
        <td style="width:44px;text-align:center">
          <button class="btn btn-sm btn-ghost" style="color:var(--sx-danger)"
            onclick="App._docCausaleRemove(${i})" title="Rimuovi la causale">✕</button>
        </td>
      </tr>`).join('');

    const reasonRows = cfg.disposalReasons.map((r, i) => `
      <tr>
        <td><input class="input" value="${this._esc(r.label)}" maxlength="60"
              onchange="App._docReasonEdit(${i},this.value)"></td>
        <td style="width:44px;text-align:center">
          <button class="btn btn-sm btn-ghost" style="color:var(--sx-danger)"
            onclick="App._docReasonRemove(${i})" title="Rimuovi la motivazione">✕</button>
        </td>
      </tr>`).join('');

    const fld = (id, label, value, opts = {}) => `
      <div class="form-group" style="${opts.style || ''}">
        <label>${label}${opts.req ? ' <span class="req">*</span>' : ''}</label>
        <input class="input${opts.mono ? ' input-mono' : ''}" id="${id}" value="${this._esc(value || '')}"
          maxlength="${opts.max || 80}" placeholder="${this._esc(opts.ph || '')}">
      </div>`;

    el.innerHTML = `
      ${gaps.length ? `<div class="mov-preview mov-preview-err" style="margin-bottom:0.7rem">
        ⚠ <strong>Il mittente è incompleto</strong> — manca: ${this._esc(gaps.join(', '))}.<br>
        <span style="font-size: var(--md-sys-typescale-body-small-size)">Finché questi campi restano vuoti i DDT si stampano, ma escono con l'avviso che il documento non è conforme.</span>
      </div>` : `<div class="mov-preview mov-preview-ok" style="margin-bottom:0.7rem">
        ✓ <strong>Mittente configurato</strong> — i DDT possono essere emessi.
      </div>`}

      <!-- ══ MITTENTE ══ -->
      <div class="config-card">
        <h3 style="font-size: var(--md-sys-typescale-body-medium-size);font-weight:700;color:var(--sx-primary);margin-bottom:0.2rem">🏢 Mittente</h3>
        <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-bottom:0.6rem">
          In alto a sinistra su ogni documento, accanto al logo. Si scrivono una volta.
        </p>
        <div class="form-row">
          ${fld('dcName', 'Ragione sociale', s.name, { req: true, max: 120, ph: 'Es: Dietopack S.r.l.' })}
          ${fld('dcLegalForm', 'Forma / gruppo', s.legal_form, { max: 80, ph: 'Es: Naturacare Group' })}
        </div>
        <div class="form-row">
          ${fld('dcAddress', 'Indirizzo sede legale', s.address, { req: true, max: 120, ph: 'Via, numero civico' })}
          ${fld('dcZip', 'CAP', s.zip, { max: 10, mono: true, style: 'max-width:120px' })}
        </div>
        <div class="form-row">
          ${fld('dcCity', 'Comune', s.city, { req: true, max: 60 })}
          ${fld('dcProvince', 'Provincia', s.province, { max: 4, mono: true, style: 'max-width:110px', ph: 'Sigla' })}
        </div>
        <div class="form-row">
          ${fld('dcVat', 'Partita IVA', s.vat, { req: true, max: 20, mono: true })}
          ${fld('dcFiscal', 'Codice fiscale', s.fiscal_code, { max: 20, mono: true, ph: 'Se diverso dalla P. IVA' })}
        </div>
        <div class="form-row">
          ${fld('dcRea', 'N° REA', s.rea, { max: 30, mono: true })}
          ${fld('dcPhone', 'Telefono', s.phone, { max: 40 })}
        </div>
        <div class="form-row">
          ${fld('dcEmail', 'Email / PEC', s.email, { max: 80 })}
          ${fld('dcWarehouse', 'Indirizzo del magazzino', s.warehouse_address, { max: 140, ph: 'Solo se la merce parte da un indirizzo diverso dalla sede legale' })}
        </div>
        <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin:0.1rem 0 0.6rem">
          💡 Il luogo di partenza compare sul DDT solo se questo campo è compilato. Lasciandolo vuoto si intende la sede legale.
        </div>
        <button class="btn btn-primary" style="font-weight:700" onclick="App._docSaveSender()">✓ Salva i dati del mittente</button>
      </div>

      <!-- ══ CAUSALI ══ -->
      <div class="config-card" style="margin-top:1rem">
        <h3 style="font-size: var(--md-sys-typescale-body-medium-size);font-weight:700;color:var(--sx-primary);margin-bottom:0.2rem">🚚 Causali di trasporto</h3>
        <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-bottom:0.6rem">
          La causale compare sul DDT e <strong>decide il tipo di movimento a registro</strong>: le causali marcate
          <em>Reso</em> scrivono un movimento di reso, tutte le altre una spedizione. È così che il cruscotto continua
          a distinguerli dopo l'unificazione dei due moduli.
        </p>
        <table class="sx-table" style="width:100%">
          <thead><tr><th>Descrizione</th><th>Movimento a registro</th><th></th></tr></thead>
          <tbody>${causaliRows}</tbody>
        </table>
        <div style="display:flex;gap:0.4rem;margin-top:0.5rem;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="App._docCausaleAdd()">+ Aggiungi causale</button>
          <button class="btn btn-sm btn-ghost" onclick="App._docResetList('causali')">↺ Ripristina l'elenco di serie</button>
        </div>
      </div>

      <!-- ══ MOTIVAZIONI SMALTIMENTO ══ -->
      <div class="config-card" style="margin-top:1rem">
        <h3 style="font-size: var(--md-sys-typescale-body-medium-size);font-weight:700;color:var(--sx-primary);margin-bottom:0.2rem">🗑️ Motivazioni di smaltimento</h3>
        <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-bottom:0.6rem">
          Compaiono come pulsanti nel modulo di scarico. Una motivazione è <strong>sempre obbligatoria</strong>:
          l'operatore sceglie fra queste oppure scrive un motivo esteso.
        </p>
        <table class="sx-table" style="width:100%">
          <thead><tr><th>Motivazione</th><th></th></tr></thead>
          <tbody>${reasonRows}</tbody>
        </table>
        <div style="display:flex;gap:0.4rem;margin-top:0.5rem;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="App._docReasonAdd()">+ Aggiungi motivazione</button>
          <button class="btn btn-sm btn-ghost" onclick="App._docResetList('disposalReasons')">↺ Ripristina l'elenco di serie</button>
        </div>
      </div>

      <!-- ══ NUMERAZIONE ══ -->
      <div class="config-card" style="margin-top:1rem">
        <h3 style="font-size: var(--md-sys-typescale-body-medium-size);font-weight:700;color:var(--sx-primary);margin-bottom:0.2rem">🔢 Numerazione e valori predefiniti</h3>
        <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-bottom:0.6rem">
          Il numero del DDT resta <strong>a compilazione libera</strong>: qui si tiene solo l'ultimo emesso, per
          proporre il successivo. Nessun contatore, nessun numero prenotato da un documento poi annullato.
        </p>
        <div class="form-row">
          ${fld('dcLastNum', 'Ultimo n° DDT emesso', cfg.ddt.last_number, { mono: true, max: 40, ph: 'Es: 2026/000123' })}
          <div class="form-group">
            <label>Prossimo proposto</label>
            <input class="input input-mono" value="${this._esc(Store.proposeDdtNumber() || '— nessuna proposta')}" disabled
              style="opacity:0.7">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Porto predefinito</label>
            <select class="select" id="dcPorto">
              <option value="Franco" ${cfg.ddt.default_porto === 'Franco' ? 'selected' : ''}>Franco</option>
              <option value="Assegnato" ${cfg.ddt.default_porto === 'Assegnato' ? 'selected' : ''}>Assegnato</option>
            </select>
          </div>
          <div class="form-group">
            <label>Trasporto a cura di (predefinito)</label>
            <select class="select" id="dcTrasporto">
              <option value="Mittente" ${cfg.ddt.default_trasporto === 'Mittente' ? 'selected' : ''}>Mittente</option>
              <option value="Destinatario" ${cfg.ddt.default_trasporto === 'Destinatario' ? 'selected' : ''}>Destinatario</option>
              <option value="Vettore" ${cfg.ddt.default_trasporto === 'Vettore' ? 'selected' : ''}>Vettore</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" style="font-weight:700" onclick="App._docSaveNumbering()">✓ Salva numerazione</button>
      </div>`;
  },

  async _docSaveSender() {
    const g = id => Validate.clean(document.getElementById(id)?.value);
    const sender = {
      name: g('dcName'), legal_form: g('dcLegalForm'),
      address: g('dcAddress'), zip: g('dcZip'), city: g('dcCity'),
      province: g('dcProvince').toUpperCase(),
      vat: g('dcVat'), fiscal_code: g('dcFiscal'), rea: g('dcRea'),
      phone: g('dcPhone'), email: g('dcEmail'),
      warehouse_address: g('dcWarehouse')
    };
    await Store.saveDocConfig({ sender });
    const gaps = this._docSenderGaps(sender);
    this.toast(gaps.length
      ? `Salvato, ma resta da compilare: ${gaps.join(', ')}`
      : '✓ Mittente salvato — i DDT sono emettibili', gaps.length ? 'info' : 'success');
    this.updateSyncIndicator();
    this.renderConfig();
  },

  async _docSaveNumbering() {
    const cfg = Store.getDocConfig();
    await Store.saveDocConfig({
      ddt: {
        ...cfg.ddt,
        last_number: Validate.clean(document.getElementById('dcLastNum')?.value),
        default_porto: document.getElementById('dcPorto')?.value || 'Franco',
        default_trasporto: document.getElementById('dcTrasporto')?.value || 'Vettore'
      }
    });
    this.toast('✓ Numerazione salvata', 'success');
    this.updateSyncIndicator();
    this.renderConfig();
  },

  async _docCausaleEdit(i, field, value) {
    const cfg = Store.getDocConfig();
    if (!cfg.causali[i]) return;
    if (field === 'label') {
      const v = Validate.clean(value);
      if (!v) return this.toast('La descrizione della causale non può essere vuota', 'error');
      cfg.causali[i].label = v;
    } else {
      cfg.causali[i].mov = value === 'RET' ? 'RET' : 'SHIP';
    }
    await Store.saveDocConfig({ causali: cfg.causali });
    this.updateSyncIndicator();
  },

  async _docCausaleAdd() {
    const cfg = Store.getDocConfig();
    cfg.causali.push({ id: `cau_${Date.now().toString(36)}`, label: 'Nuova causale', mov: 'SHIP' });
    await Store.saveDocConfig({ causali: cfg.causali });
    this.renderConfig();
  },

  async _docCausaleRemove(i) {
    const cfg = Store.getDocConfig();
    const c = cfg.causali[i];
    if (!c) return;
    if (cfg.causali.length <= 1) return this.toast('Deve restare almeno una causale', 'error');
    const usata = Store._cache.pendingOut.some(d => d.causale_id === c.id);
    if (!await Dialog.confirm({
      title: 'Rimuovere la causale?',
      message: usata
        ? 'Questa causale è usata da documenti già emessi. Rimuovendola quei documenti restano leggibili e conservano la descrizione che avevano al momento dell’emissione, ma la causale non sarà più selezionabile.'
        : 'La causale non sarà più selezionabile per i nuovi documenti.',
      details: Dialog.kv([['Causale', c.label], ['Movimento', c.mov === 'RET' ? 'Reso' : 'Spedizione']]),
      confirmLabel: 'Rimuovi', danger: true
    })) return;
    cfg.causali.splice(i, 1);
    await Store.saveDocConfig({ causali: cfg.causali });
    this.renderConfig();
  },

  async _docReasonEdit(i, value) {
    const cfg = Store.getDocConfig();
    if (!cfg.disposalReasons[i]) return;
    const v = Validate.clean(value);
    if (!v) return this.toast('La motivazione non può essere vuota', 'error');
    cfg.disposalReasons[i].label = v;
    await Store.saveDocConfig({ disposalReasons: cfg.disposalReasons });
    this.updateSyncIndicator();
  },

  async _docReasonAdd() {
    const cfg = Store.getDocConfig();
    cfg.disposalReasons.push({ id: `mot_${Date.now().toString(36)}`, label: 'NUOVA MOTIVAZIONE' });
    await Store.saveDocConfig({ disposalReasons: cfg.disposalReasons });
    this.renderConfig();
  },

  async _docReasonRemove(i) {
    const cfg = Store.getDocConfig();
    if (cfg.disposalReasons.length <= 1) return this.toast('Deve restare almeno una motivazione', 'error');
    cfg.disposalReasons.splice(i, 1);
    await Store.saveDocConfig({ disposalReasons: cfg.disposalReasons });
    this.renderConfig();
  },

  async _docResetList(which) {
    const label = which === 'causali' ? 'le causali di trasporto' : 'le motivazioni di smaltimento';
    if (!await Dialog.confirm({
      title: 'Ripristinare l’elenco di serie?',
      message: `Le voci personalizzate vengono sostituite da quelle predefinite. I documenti già emessi non vengono toccati.`,
      confirmLabel: 'Ripristina', danger: true
    })) return;
    await Store.saveDocConfig({ [which]: Store.DOC_CONFIG_DEFAULTS[which].slice() });
    this.toast(`✓ Ripristinate ${label}`, 'success');
    this.renderConfig();
  },

  _renderConfigOperators(el) {
    const ops = Store.getOperators();
    const leaders = Store.getActiveLeaders();
    const rows = ops.map(o => {
      const nome = [o.first_name, o.last_name].filter(Boolean).join(' ');
      const inactive = o.active === false;
      return `<tr${inactive ? ' style="opacity:0.55"' : ''}>
        <td><span class="mono" style="font-weight:700;color:var(--sx-primary)">${this._esc(o.initials)}</span></td>
        <td>${nome ? this._esc(nome) : '<span style="color:var(--sx-warning);font-style:italic">da completare</span>'}</td>
        <td>${o.role === 'leader'
              ? '<span class="badge badge-blue">👑 Team Leader</span>'
              : '<span class="badge badge-muted">Operatore</span>'}</td>
        <td>${o.pin_hash
              ? '<span class="badge badge-green">impostato</span>'
              : '<span class="badge badge-amber">mancante</span>'}</td>
        <td>${inactive ? '<span class="badge badge-red">disattivato</span>' : '<span class="badge badge-green">attivo</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" onclick="App.showEditOperatorModal('${o.op_id}')" title="Modifica dati e ruolo">✏</button>
          <button class="btn btn-sm btn-warning" onclick="App.showRenewPinModal('${o.op_id}')" title="Rinnova il PIN (serve un Team Leader)">🔑</button>
          ${inactive
            ? `<button class="btn btn-sm btn-success" onclick="App.toggleOperatorActive('${o.op_id}')" title="Riattiva">✓</button>`
            : `<button class="btn btn-sm btn-danger" onclick="App.toggleOperatorActive('${o.op_id}')" title="Disattiva">⊘</button>`}
        </td>
      </tr>`;
    }).join('');

    el.innerHTML = `<div class="config-card">
      <h3>Anagrafica Operatori
        <button class="btn btn-sm btn-primary" style="float:right" onclick="App.showAddOperatorModal()">+ Nuovo operatore</button></h3>
      <div style="overflow-x:auto">
        <table class="sx-table">
          <thead><tr><th style="width:80px">Iniziali</th><th>Nome e cognome</th><th style="width:150px">Ruolo</th><th style="width:110px">PIN</th><th style="width:110px">Stato</th><th style="width:140px">Azioni</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--sx-text-muted);font-style:italic">Nessun operatore</td></tr>'}</tbody>
        </table>
      </div>
      <div style="background:var(--grad-soft-green);border:1px solid var(--sx-success);border-radius:var(--radius-md);padding:0.6rem 0.75rem;margin-top:0.7rem">
        <div style="font-weight:700;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-success);margin-bottom:0.3rem">🔒 Come funzionano PIN e ruoli</div>
        <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.6">
          Il PIN è di <strong>6 cifre</strong> e non viene mai conservato in chiaro: sul disco resta solo la sua
          impronta crittografica con un sale casuale, e lo stesso vale per i backup JSON.
          Un PIN smarrito <strong>non è recuperabile</strong> — si rinnova, e il rinnovo lo autorizza un
          <strong>Team Leader</strong> con il proprio PIN. L'operazione finisce nel registro movimenti;
          il PIN no, né in chiaro né come impronta.<br>
          <strong>Nessun operatore è eliminabile:</strong> chi ha firmato un movimento resta in anagrafica e
          al più viene disattivato. Deve esistere sempre almeno un Team Leader attivo
          (${leaders.length} attualmente): è ciò che garantisce di non restare mai chiusi fuori.
        </p>
      </div>
    </div>`;
  },

  _renderConfigSession(el) {
    const min = Session.getTimeoutMinutes();
    el.innerHTML = `<div class="config-card">
      <h3>Blocco per inattività</h3>
      <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.6;margin-bottom:0.7rem">
        Trascorso questo tempo senza attività, l'applicazione <strong>salva i dati</strong> e si blocca dietro
        la richiesta di identificazione. Serve a impedire che il movimento successivo venga firmato
        da chi non l'ha eseguito: su un terminale di reparto è la differenza fra un registro
        attendibile e uno che non regge un audit.<br>
        Se rientra un operatore diverso, eventuali carrelli aperti (prelievo, resi, spedizioni)
        vengono azzerati con avviso.
      </p>
      <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">
        <label for="sessTimeout" style="font-size: var(--md-sys-typescale-body-small-size);font-weight:600">Minuti di inattività</label>
        <input class="input input-mono" id="sessTimeout" type="number" min="0" max="${Session.MAX_MIN}" value="${min}" style="width:100px">
        <button class="btn btn-primary btn-sm" onclick="App._applySessionTimeout()">Applica</button>
        <span style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">
          ${Session.MIN_MIN}–${Session.MAX_MIN} minuti · <strong>0 = blocco disattivato</strong>
        </span>
      </div>
      <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-top:0.6rem;line-height:1.6">
        Stato attuale: <strong>${min ? `blocco dopo ${min} minuti` : 'blocco disattivato'}</strong>.
        L'impostazione vale per <strong>questo dispositivo</strong>: non entra nel database né negli export,
        perché un tablet in reparto e un PC in ufficio non hanno le stesse esigenze.
      </div>
    </div>`;
  },

  _applySessionTimeout() {
    const v = Session.setTimeoutMinutes(document.getElementById('sessTimeout')?.value);
    this.toast(v ? `Blocco per inattività: ${v} minuti` : 'Blocco per inattività disattivato', 'success');
    this.renderConfig();
  },

  /* ── Creazione / modifica operatore (autorizzate da un Team Leader) ── */
  showAddOperatorModal() {
    this.showModal(
      '➕ Nuovo operatore',
      `<div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="opFirst" maxlength="40" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="opLast" maxlength="40"></div>
      </div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group">
          <label>Iniziali <span class="req">*</span></label>
          <input class="input input-mono" id="opInitials" maxlength="4" style="text-transform:uppercase" placeholder="Es. AS" oninput="this.value=this.value.toUpperCase()">
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.2rem">2-4 caratteri, uniche: finiscono su ogni movimento</div>
        </div>
        <div class="form-group">
          <label>Ruolo <span class="req">*</span></label>
          <select class="input select" id="opRole">
            <option value="operator">Operatore</option>
            <option value="leader">Team Leader</option>
          </select>
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.2rem">Solo i Team Leader rinnovano i PIN</div>
        </div>
      </div>
      <div class="form-row" style="margin-bottom:0.4rem">
        <div class="form-group"><label>PIN a 6 cifre <span class="req">*</span></label>
          <input class="input input-mono" id="opPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma PIN <span class="req">*</span></label>
          <input class="input input-mono" id="opPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
      </div>
      <div id="opFormError" class="gate-error"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doAddOperator()">Crea (richiede PIN Team Leader)</button>`
    );
  },

  async doAddOperator() {
    const err = (m) => { const e = document.getElementById('opFormError'); if (e) e.textContent = m; };
    const first = Validate.clean(document.getElementById('opFirst')?.value);
    const last  = Validate.clean(document.getElementById('opLast')?.value);
    const init  = (document.getElementById('opInitials')?.value || '').toUpperCase().trim();
    const role  = document.getElementById('opRole')?.value === 'leader' ? 'leader' : 'operator';
    const pin   = document.getElementById('opPin')?.value || '';
    const pin2  = document.getElementById('opPin2')?.value || '';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    if (!/^[A-Z0-9]{2,4}$/.test(init)) return err('Iniziali non valide: 2-4 caratteri, lettere maiuscole o cifre.');
    if (Store.getOperatorByInitials(init)) return err(`Le iniziali ${init} sono già assegnate.`);
    const pinErr = Auth.validatePin(pin);
    if (pinErr) return err(pinErr);
    if (pin !== pin2) return err('I due PIN non coincidono.');

    const leader = await this._requireLeaderAuth('Creazione di un nuovo operatore');
    if (!leader) return;
    try {
      const fields = await Auth.buildPinFields(pin);
      const rec = await Store.addOperator({ first_name: first, last_name: last, initials: init, role, ...fields });
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`Operatore ${rec.initials} creato`, 'success');
    } catch (e) {
      err(e.message || 'Creazione non riuscita.');
    }
  },

  showEditOperatorModal(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    this.showModal(
      `✏ Modifica operatore — ${this._esc(op.initials)}`,
      `<div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="opFirst" maxlength="40" value="${this._esc(op.first_name || '')}" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="opLast" maxlength="40" value="${this._esc(op.last_name || '')}"></div>
      </div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group">
          <label>Iniziali <span class="req">*</span></label>
          <input class="input input-mono" id="opInitials" maxlength="4" style="text-transform:uppercase" value="${this._esc(op.initials)}" oninput="this.value=this.value.toUpperCase()">
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-warning);margin-top:0.2rem">
            ⚠ Cambiandole, i movimenti già registrati continueranno a riportare le vecchie
          </div>
        </div>
        <div class="form-group">
          <label>Ruolo <span class="req">*</span></label>
          <select class="input select" id="opRole">
            <option value="operator" ${op.role !== 'leader' ? 'selected' : ''}>Operatore</option>
            <option value="leader" ${op.role === 'leader' ? 'selected' : ''}>Team Leader</option>
          </select>
        </div>
      </div>
      <div id="opFormError" class="gate-error"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doEditOperator('${opId}')">Salva (richiede PIN Team Leader)</button>`
    );
  },

  async doEditOperator(opId) {
    const err = (m) => { const e = document.getElementById('opFormError'); if (e) e.textContent = m; };
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const first = Validate.clean(document.getElementById('opFirst')?.value);
    const last  = Validate.clean(document.getElementById('opLast')?.value);
    const init  = (document.getElementById('opInitials')?.value || '').toUpperCase().trim();
    const role  = document.getElementById('opRole')?.value === 'leader' ? 'leader' : 'operator';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    if (!/^[A-Z0-9]{2,4}$/.test(init)) return err('Iniziali non valide: 2-4 caratteri, lettere maiuscole o cifre.');
    if (op.role === 'leader' && role !== 'leader' && Store.getActiveLeaders().length <= 1) {
      return err('È l’unico Team Leader attivo: nominane un altro prima di retrocederlo.');
    }
    const leader = await this._requireLeaderAuth(`Modifica dell’operatore ${op.initials}`);
    if (!leader) return;
    try {
      await Store.updateOperator(opId, { first_name: first, last_name: last, initials: init, role });
      if (this.currentOperatorRecord?.op_id === opId) this._activateOperator(Store.getOperator(opId));
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`Operatore ${init} aggiornato`, 'success');
    } catch (e) {
      err(e.message || 'Salvataggio non riuscito.');
    }
  },

  async toggleOperatorActive(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const disabling = op.active !== false;
    if (disabling && op.role === 'leader' && Store.getActiveLeaders().length <= 1) {
      return this.toast('È l’unico Team Leader attivo: non può essere disattivato', 'error');
    }
    if (disabling && !await Dialog.confirm({
      title: 'Disattivare l’operatore?',
      message: 'Non potrà più accedere né comparire nelle liste di scelta. I movimenti che ha firmato restano intatti: un operatore non viene mai eliminato.',
      details: Dialog.kv([['Operatore', `${op.initials} — ${[op.first_name, op.last_name].filter(Boolean).join(' ') || 'dati incompleti'}`]]),
      confirmLabel: 'Disattiva',
      danger: true
    })) return;

    const leader = await this._requireLeaderAuth(`${disabling ? 'Disattivazione' : 'Riattivazione'} dell’operatore ${op.initials}`);
    if (!leader) return;
    await Store.updateOperator(opId, { active: !disabling });
    /* Se si disattiva se stessi si perde il diritto di stare qui: si torna
       al gate, che con l'anagrafica aggiornata chiedera' chi sta lavorando. */
    if (disabling && this.currentOperatorRecord?.op_id === opId) {
      this.currentOperator = null;
      this.currentOperatorRecord = null;
      this._renderOperatorBadge();
      this._openIdentityGate({ initial: true });
    }
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`Operatore ${op.initials} ${disabling ? 'disattivato' : 'riattivato'}`, 'success');
  },

  showRenewPinModal(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const leaders = Store.getUsableLeaders();
    if (!leaders.length) return this.toast('Nessun Team Leader attivo: impossibile autorizzare', 'error');
    const nome = [op.first_name, op.last_name].filter(Boolean).join(' ') || op.initials;
    this.showModal(
      `🔑 Rinnovo PIN — ${this._esc(op.initials)}`,
      `<p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.6;margin-bottom:0.7rem">
        Nuovo PIN per <strong>${this._esc(nome)}</strong>. Il PIN precedente cessa di valere immediatamente.
        L'operazione richiede l'autorizzazione di un <strong>Team Leader</strong> e viene registrata nel registro movimenti.
      </p>
      <div class="form-group" style="margin-bottom:0.6rem">
        <label>① Team Leader che autorizza <span class="req">*</span></label>
        <select class="input select" id="rpLeader">
          ${leaders.map(l => `<option value="${l.op_id}">${this._esc(l.initials)} — ${this._esc([l.first_name, l.last_name].filter(Boolean).join(' ') || 'dati incompleti')}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0.8rem">
        <label>PIN del Team Leader <span class="req">*</span></label>
        <input class="input input-mono gate-pin" id="rpLeaderPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off">
      </div>
      <div class="form-row" style="margin-bottom:0.4rem">
        <div class="form-group"><label>② Nuovo PIN <span class="req">*</span></label>
          <input class="input input-mono" id="rpNewPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma nuovo PIN <span class="req">*</span></label>
          <input class="input input-mono" id="rpNewPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App.doRenewPin('${opId}')}"></div>
      </div>
      <div id="rpError" class="gate-error"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-warning" onclick="App.doRenewPin('${opId}')">🔑 Rinnova PIN</button>`
    );
    setTimeout(() => document.getElementById('rpLeaderPin')?.focus(), 80);
  },

  async doRenewPin(opId) {
    const err = (m) => { const e = document.getElementById('rpError'); if (e) e.textContent = m; };
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const leader = Store.getOperator(document.getElementById('rpLeader')?.value);
    const leaderPin = document.getElementById('rpLeaderPin')?.value || '';
    const newPin = document.getElementById('rpNewPin')?.value || '';
    const newPin2 = document.getElementById('rpNewPin2')?.value || '';
    if (!leader || leader.role !== 'leader' || leader.active === false) return err('Autorizzatore non valido.');
    const pinErr = Auth.validatePin(newPin);
    if (pinErr) return err(pinErr);
    if (newPin !== newPin2) return err('I due PIN non coincidono.');
    if (!await Auth.verifyPin(leader, leaderPin)) return err('PIN del Team Leader non corretto.');

    try {
      const fields = await Auth.buildPinFields(newPin);
      await Store.updateOperator(opId, fields);
      /* A registro finisce l'EVENTO, non il segreto. */
      await this._logMov(MOV.PINRESET, '', '', '', '', null, leader.initials,
        `PIN di ${op.initials} rinnovato da ${leader.initials}`);
      if (this.currentOperatorRecord?.op_id === opId) this._activateOperator(Store.getOperator(opId));
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`🔑 PIN di ${op.initials} rinnovato — autorizzato da ${leader.initials}`, 'success');
    } catch (e) {
      err(e.message || 'Rinnovo non riuscito.');
    }
  },

  _requireLeaderAuth(azione) {
    const leaders = Store.getUsableLeaders();
    if (!leaders.length) {
      this.toast('Nessun Team Leader attivo: operazione non autorizzabile', 'error');
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay gate-overlay';
      overlay.id = 'leaderAuthOverlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:400px">
          <div class="modal-header"><h2>👑 Autorizzazione Team Leader</h2></div>
          <div class="modal-body">
            <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);margin-bottom:0.7rem">${this._esc(azione)}</p>
            <div class="form-group" style="margin-bottom:0.6rem">
              <label>Team Leader</label>
              <select class="input select" id="laWho">
                ${leaders.map(l => `<option value="${l.op_id}">${this._esc(l.initials)} — ${this._esc([l.first_name, l.last_name].filter(Boolean).join(' ') || 'dati incompleti')}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>PIN</label>
              <input class="input input-mono gate-pin" id="laPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off">
            </div>
            <div id="laError" class="gate-error"></div>
          </div>
          <div class="modal-footer">
            <button class="btn" id="laCancel">Annulla</button>
            <button class="btn btn-primary" id="laOk">Autorizza</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = (value) => { overlay.remove(); resolve(value); };
      const attempt = async () => {
        const l = Store.getOperator(overlay.querySelector('#laWho').value);
        const pin = overlay.querySelector('#laPin').value || '';
        if (l && await Auth.verifyPin(l, pin)) return close(l);
        overlay.querySelector('#laError').textContent = 'PIN non corretto.';
        overlay.querySelector('#laPin').value = '';
        overlay.querySelector('#laPin').focus();
      };
      overlay.querySelector('#laCancel').onclick = () => close(null);
      overlay.querySelector('#laOk').onclick = attempt;
      overlay.querySelector('#laPin').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); attempt(); } };
      setTimeout(() => overlay.querySelector('#laPin')?.focus(), 80);
    });
  },

  _renderConfigSites(el) {
    const sites = Store.getSites();
    let html = `<div class="config-card">
      <h3>Siti di Stoccaggio <button class="btn btn-sm btn-primary" style="float:right" onclick="App.showAddSiteModal()">+ Nuovo Sito</button></h3>
      <div style="overflow-x:auto">
      <table class="sx-table">
        <thead><tr><th>Codice</th><th>Nome</th><th>Tipo</th><th>Zone</th><th>Ubic.</th><th style="width:180px">Azioni</th></tr></thead><tbody>`;
    for (const site of sites) {
      const zones = (site.zones || []).filter(z => z.active);
      const stats = Store.getSiteStats(site.id);
      html += `<tr>
        <td><span class="mono" style="font-weight:700;color:var(--sx-primary)">${this._esc(site.id)}</span></td>
        <td>${this._esc(site.name)}</td>
        <td><span class="badge ${site.type === 'proprio' ? 'badge-blue' : 'badge-amber'}">${this._esc(site.type)}</span></td>
        <td>${zones.length}</td>
        <td>${stats.total}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" onclick="App.showEditSiteModal('${site.id}')" title="Modifica">✏</button>
          <button class="btn btn-sm" onclick="App.showAddZoneModal('${site.id}')" title="Aggiungi zona">+ Zona</button>
          <button class="btn btn-sm btn-danger" onclick="App.confirmDeleteSite('${site.id}')" title="Elimina">🗑</button>
        </td>
      </tr>`;
      for (const zone of zones) {
        const dim = zone.type === 'RACK' ? `${zone.aisles}c × ${zone.bays_per_aisle}b × ${zone.levels?.length || 1}l` :
          zone.type === 'FLOOR' ? `${zone.rows}f × ${zone.positions_per_row}p` : `${zone.positions} pos`;
        html += `<tr style="background:var(--sx-accent-soft)">
          <td></td>
          <td style="padding-left:1.25rem">↳ <span class="badge ${zone.type === 'RACK' ? 'badge-blue' : zone.type === 'FLOOR' ? 'badge-green' : 'badge-amber'}">${zone.type}</span> ${this._esc(zone.name)}</td>
          <td class="mono" style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">${dim}</td>
          <td colspan="2">${Store.getZoneStats(site.id, zone.id).total}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm" onclick="App.showEditZoneModal('${site.id}','${zone.id}')">✏</button>
            <button class="btn btn-sm btn-danger" onclick="App.confirmDeleteZone('${site.id}','${zone.id}')">🗑</button>
          </td>
        </tr>`;
      }
    }
    html += '</tbody></table></div></div>';
    el.innerHTML = html;
  },

  _onArtFilterInput(value) {
    if (!this._artFilterDebounced) {
      this._artFilterDebounced = debounce((v) => {
        this._artFilter = v;
        this._renderConfigArticles(document.getElementById('configContent'));
      }, 300);
    }
    this._artFilterDebounced(value);
  },

  _renderConfigArticles(el) {
    let articles = Store.getArticles();
    const total = articles.length;
    const catCounts = {};
    articles.forEach(a => { const c = a.category || '—'; catCounts[c] = (catCounts[c] || 0) + 1; });
    const q = this._artFilter.toLowerCase();
    if (q) articles = articles.filter(a => a.code.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q));
    const [field, dir] = this._artSort.split('_');
    articles.sort((a, b) => {
      const va = field === 'code' ? a.code : field === 'desc' ? a.description : (a.category || '');
      const vb = field === 'code' ? b.code : field === 'desc' ? b.description : (b.category || '');
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    // Chrome statico via template literal
    let html = `<div class="config-card">
      <h3>Anagrafica Articoli (${total}) <button class="btn btn-sm btn-primary" style="float:right" onclick="App.showAddArticleModal()">+ Nuovo</button></h3>
      <div style="display:flex;gap:0.3rem;margin-bottom:0.5rem;flex-wrap:wrap;font-size: var(--md-sys-typescale-label-small-size)">
        ${Object.entries(catCounts).sort().map(([c,n]) => `<span class="badge badge-muted">${this._esc(c)}: ${n}</span>`).join('')}
      </div>
      <div style="display:flex;gap:0.4rem;margin-bottom:0.5rem;flex-wrap:wrap">
        <button class="btn btn-sm btn-success" onclick="App.importArticlesExcel()">📥 Import Excel</button>
        <button class="btn btn-sm btn-accent" onclick="App.exportArticlesExcel()">📊 Export Excel</button>
      </div>
      <div style="display:flex;gap:0.4rem;margin-bottom:0.5rem;flex-wrap:wrap">
        <input class="input" id="artFilterInput" value="${this._esc(this._artFilter)}" placeholder="🔍 Filtra... (debounce 300ms)" style="flex:1;min-width:140px"
          oninput="App._onArtFilterInput(this.value)">
        <select class="select" style="width:auto;min-width:140px" onchange="App._artSort=this.value;App._renderConfigArticles(document.getElementById('configContent'))">
          <option value="code_asc" ${this._artSort==='code_asc'?'selected':''}>Codice A→Z</option>
          <option value="code_desc" ${this._artSort==='code_desc'?'selected':''}>Codice Z→A</option>
          <option value="desc_asc" ${this._artSort==='desc_asc'?'selected':''}>Descrizione A→Z</option>
          <option value="cat_asc" ${this._artSort==='cat_asc'?'selected':''}>Categoria</option>
        </select>
      </div>`;
    if (!articles.length) {
      html += `<div class="empty-state"><p>${q ? 'Nessun risultato per "' + this._esc(q) + '"' : 'Nessun articolo'}</p></div>`;
      html += `</div>
        <div class="config-card">
          <h3>Import da CSV</h3>
          <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);margin-bottom:0.3rem">Formato: <span class="mono">codice;descrizione;categoria</span></p>
          <textarea class="textarea" id="csvImportArea" placeholder="MP-001234;Vitamina C 500mg;MP&#10;PF-005678;Omega 3 60cps;PF" rows="3"></textarea>
          <button class="btn btn-sm btn-success" style="margin-top:0.3rem" onclick="App.importArticlesCSV()">📥 Importa CSV</button>
        </div>`;
      el.innerHTML = html;
      return;
    }
    // Chrome con tabella vuota da popolare via DOM API
    html += `<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.2rem">${articles.length}${q ? ' / ' + total : ''} articoli</div>
      <div style="overflow-x:auto"><table class="sx-table"><thead><tr><th>Codice</th><th>Descrizione</th><th>Cat.</th><th>UM</th><th style="width:100px">Azioni</th></tr></thead><tbody id="artTbody"></tbody></table></div>`;
    html += `</div>
      <div class="config-card">
        <h3>Import da CSV</h3>
        <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);margin-bottom:0.3rem">Formato: <span class="mono">codice;descrizione;categoria</span></p>
        <textarea class="textarea" id="csvImportArea" placeholder="MP-001234;Vitamina C 500mg;MP&#10;PF-005678;Omega 3 60cps;PF" rows="3"></textarea>
        <button class="btn btn-sm btn-success" style="margin-top:0.3rem" onclick="App.importArticlesCSV()">📥 Importa CSV</button>
      </div>`;
    el.innerHTML = html;
    // Costruisco le righe in un DocumentFragment (singolo reflow finale)
    const tbody = document.getElementById('artTbody');
    const frag = document.createDocumentFragment();
    for (const art of articles) {
      const code = art.code;
      const desc = art.description || '';
      const cat = art.category || '—';
      const unit = art.unit || 'PZ';
      const tr = _h('tr', {}, [
        _h('td', {}, [_h('span', { class: 'mono', style: { fontWeight: '700', color: 'var(--sx-success)' } }, [code])]),
        _h('td', {}, [desc]),
        _h('td', {}, [_h('span', { class: 'badge badge-muted' }, [cat])]),
        _h('td', { class: 'mono', style: { fontSize: '0.72rem' } }, [unit]),
        _h('td', { style: { whiteSpace: 'nowrap' } }, [
          _h('button', {
            class: 'btn btn-sm',
            onclick: () => this.showEditArticleModal(code)
          }, ['✏']),
          ' ',
          _h('button', {
            class: 'btn btn-sm btn-danger',
            onclick: () => this.confirmDeleteArticle(code)
          }, ['🗑'])
        ])
      ]);
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    const fi = document.getElementById('artFilterInput');
    if (fi && q) { fi.focus(); try { fi.setSelectionRange(q.length, q.length); } catch {} }
  },

  _fmtUsage(est) {
    if (!est) return 'Non disponibile';
    const mb = (b) => ((b || 0) / 1048576).toFixed(1);
    if (est.pct == null || !est.quota) {
      /* Servizio dati: c'e' un file su un disco, non una quota del browser.
         Si dice quanto pesa e dove sta, che e' l'informazione utile. */
      return `${mb(est.usage)} MB${est.file ? ` <span style="opacity:0.7">— ${this._esc(est.file)}</span>` : ''}`;
    }
    return `${mb(est.usage)} MB su ${(est.quota / 1048576).toFixed(0)} MB (${est.pct.toFixed(1)}%)`;
  },

  /* Il motore vero, non quello di quando ce n'era uno solo. */
  _storageLabel() {
    return Persistence.kind === 'remote'
      ? '<span class="badge badge-green">SQLite — servizio dati</span>'
      : '<span class="badge badge-blue">IndexedDB (Dexie)</span>';
  },

  async _renderConfigData(el) {
    const meta = Store.getMeta();
    const invCount = Store.getInventoryCount();
    const est = await Store.estimateUsage();
    const usageStr = this._fmtUsage(est);
    const spazioLbl = Persistence.kind === 'remote' ? 'Spazio occupato dal database' : 'Spazio IndexedDB utilizzato';
    el.innerHTML = `<div id="resilienzaCard"></div>
    <div class="config-card">
      <h3>Stato Database</h3>
      <table class="sx-table" style="margin-bottom:0.75rem">
        <tbody>
          <tr><td style="width:40%;color:var(--sx-text-secondary)">Ultimo salvataggio</td><td class="mono">${meta.lastModified ? new Date(meta.lastModified).toLocaleString('it-IT') : 'Mai'}</td></tr>
          <tr><td style="color:var(--sx-text-secondary)">Modifiche non salvate</td><td>${meta.unsavedChanges ? '<span class="badge badge-amber">Sì</span>' : '<span class="badge badge-green">No</span>'}</td></tr>
          <tr><td style="color:var(--sx-text-secondary)">Item a magazzino</td><td class="mono">${invCount}</td></tr>
          <tr><td style="color:var(--sx-text-secondary)">Articoli in anagrafica</td><td class="mono">${Store.getArticles().length}</td></tr>
          <tr><td style="color:var(--sx-text-secondary)">Movimenti in archivio</td><td class="mono">${Store.getMovLogTotal().toLocaleString('it-IT')} <span class="badge badge-green">conservazione ${Math.round(LOG_RETENTION_DAYS/365)} anni</span></td></tr>
          <tr><td style="color:var(--sx-text-secondary)">di cui in memoria</td><td class="mono">${Store.getMovLogWindowInfo().inMemory.toLocaleString('it-IT')} <span class="badge badge-muted">finestra ${Store.getMovLogWindowDays() || '∞'} gg</span></td></tr>
          <tr><td style="color:var(--sx-text-secondary)">Quarantene attive</td><td class="mono">${Store.getActiveQuarantine().length}</td></tr>
          <tr><td style="color:var(--sx-text-secondary)">${spazioLbl}</td><td class="mono">${usageStr}</td></tr>
          <tr><td style="color:var(--sx-text-secondary)">Motore storage</td><td>${this._storageLabel()}</td></tr>
        </tbody>
      </table>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
        <button class="btn btn-success" onclick="App.forceSave()" title="Forza checkpoint dati su IndexedDB">💾 Salva ora</button>
        <button class="btn btn-primary" onclick="App.exportData()">📤 Esporta tutto (JSON)</button>
        <button class="btn btn-accent" onclick="App.importData()">📥 Importa da JSON</button>
        <button class="btn btn-warning" onclick="App.exportMovLogExcel()">📊 Esporta Registro Movimenti (Excel)</button>
        <button class="btn btn-warning" onclick="App.exportGiacenzeExcel()" title="Esporta tutte le giacenze raggruppate per Site/Zona/Ubicazione">📦 Esporta Giacenze per Area (Excel)</button>
        <button class="btn btn-danger" onclick="App.confirmResetData()" style="margin-left:auto">🗑 Reset completo DB</button>
      </div>
      <!-- v2.0.1 [B8] — Ritenzione e purge manuale (decisione B-2) -->
      <div style="background:var(--grad-soft-green);border:1px solid var(--sx-success);border-radius:var(--radius-md);padding:0.6rem 0.75rem;margin-top:0.6rem">
        <div style="font-weight:700;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-success);margin-bottom:0.3rem">🔒 Conservazione dei record</div>
        <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.5;margin-bottom:0.5rem">
          <strong>Nessun record viene mai cancellato automaticamente.</strong>
          Il registro movimenti è conservato per <strong>${LOG_RETENTION_DAYS} giorni (${Math.round(LOG_RETENTION_DAYS/365)} anni)</strong>;
          i record di <strong>non conformità non sono mai eliminabili</strong>, nemmeno con la purge manuale.
          L'eliminazione dei movimenti oltre la soglia è possibile solo con l'azione qui sotto, che impone
          l'esportazione preventiva, una doppia conferma e la registrazione dell'operazione nel registro stesso.
        </p>
        <button class="btn btn-sm btn-warning" onclick="App.purgeOldLogsManual()" title="Purge manuale del registro movimenti oltre la soglia di conservazione">
          🗄 Purge manuale registro storico…
        </button>
      </div>
    </div>
    <!-- v1.9.1 — Card impostazioni scanner barcode -->
    <div class="config-card" style="margin-top:0.75rem">
      <h3>Scanner Barcode</h3>
      <div style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.5rem 0">
        <label class="switch" style="margin-top:0.15rem">
          <input type="checkbox" id="scannerFixToggle" ${this._scannerLayoutFix ? 'checked' : ''} onchange="App._setScannerLayoutFix(this.checked)">
          <span class="slider"></span>
        </label>
        <div style="flex:1">
          <div style="font-weight:600;font-size: var(--md-sys-typescale-body-medium-size);color:var(--sx-text)">Correzione layout scanner US→IT</div>
          <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-top:0.2rem;line-height:1.5">
            Attiva questa opzione se lo scanner barcode legge <strong>"/"</strong> come <strong>"-"</strong> (o caratteri simili).
            Lo scanner di fabbrica è in modalità tastiera US: su sistemi Windows con layout IT alcuni tasti producono caratteri sbagliati.
            Il fix usa il codice del tasto fisico (indipendente dal layout) per ricostruire il carattere originale del barcode.
            <br><strong>Disattiva</strong> solo se lo scanner è già stato programmato per il layout italiano.
          </div>
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.4rem">
            Caratteri corretti: <code style="background:var(--sx-bg-alt);padding:0 0.3rem;border-radius:2px">/</code> · <code style="background:var(--sx-bg-alt);padding:0 0.3rem;border-radius:2px">-</code> · <code style="background:var(--sx-bg-alt);padding:0 0.3rem;border-radius:2px">'</code> · <code style="background:var(--sx-bg-alt);padding:0 0.3rem;border-radius:2px">\\</code> · <code style="background:var(--sx-bg-alt);padding:0 0.3rem;border-radius:2px">=</code>
          </div>
        </div>
      </div>
    </div>
    <!-- v2.1.0 — Card preferenze di riscontro operativo -->
    <div class="config-card" style="margin-top:0.75rem">
      <h3>Riscontro Operativo (suono · vibrazione · messaggi)</h3>
      <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.55;margin-bottom:0.6rem">
        Dalla v2.1.0 l'esito di ogni operazione compare al <strong>centro dello schermo</strong>, non piu' nell'angolo,
        ed e' accompagnato da una firma sonora diversa per esito positivo, avviso ed errore.
        In reparto rumoroso alzare il volume; in ufficio disattivare l'audio.
        Le preferenze restano su questo dispositivo e non contengono alcun dato personale.
      </p>
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.45rem 0">
        <label class="switch">
          <input type="checkbox" id="fbAudioToggle" ${Feedback.getPrefs().audio ? 'checked' : ''} onchange="App._setFeedbackPref('audio', this.checked)">
          <span class="slider"></span>
        </label>
        <div style="flex:1">
          <div style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size)">Segnale acustico</div>
          <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">Toni sintetizzati: nessun file, funziona offline.</div>
        </div>
        <button class="btn btn-sm" onclick="App._testFeedback()">Prova</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.45rem 0;border-top:1px solid var(--sx-border)">
        <label class="switch">
          <input type="checkbox" id="fbVibToggle" ${Feedback.getPrefs().vibration ? 'checked' : ''} onchange="App._setFeedbackPref('vibration', this.checked)">
          <span class="slider"></span>
        </label>
        <div style="flex:1">
          <div style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size)">Vibrazione</div>
          <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">Solo su tablet e telefoni che la supportano. Su PC non ha effetto.</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.45rem 0;border-top:1px solid var(--sx-border)">
        <label class="switch">
          <input type="checkbox" id="fbFlashToggle" ${Feedback.getPrefs().flash ? 'checked' : ''} onchange="App._setFeedbackPref('flash', this.checked)">
          <span class="slider"></span>
        </label>
        <div style="flex:1">
          <div style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size)">Lampo perimetrale</div>
          <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">Bordo colorato per mezzo secondo. Escluso da solo se il sistema chiede animazioni ridotte.</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0 0.2rem;border-top:1px solid var(--sx-border)">
        <label for="fbVolume" style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size);min-width:110px">Volume</label>
        <input type="range" id="fbVolume" min="0" max="100" step="5" value="${Math.round(Feedback.getPrefs().volume * 100)}"
          style="flex:1" oninput="App._setFeedbackPref('volume', this.value / 100)">
        <span id="fbVolumeLabel" class="dlg-chip">${Math.round(Feedback.getPrefs().volume * 100)}%</span>
      </div>
    </div>`;
    this._renderResilienzaCard();
  },

  async _renderResilienzaCard() {
    const host = document.getElementById('resilienzaCard');
    if (!host) return;

    const remoto = Persistence.kind === 'remote';
    const persist = await Store.storagePersistenceState();
    const est = await Store.estimateUsage();
    const vaultPerm = Vault.supported() ? await Vault.permissionState() : 'unsupported';
    const vaultLast = await Vault.lastBackupTs();
    const manifest = vaultPerm === 'granted' ? await Vault.readManifest() : null;
    const opfsList = await Store.listOPFSBackups();
    const win = Store.getMovLogWindowInfo();
    const fmt = (ts) => ts ? new Date(ts).toLocaleString('it-IT') : 'mai';

    const copiaEsternaFresca = vaultLast && (Date.now() - vaultLast) < 48 * 3600 * 1000;
    const livello = copiaEsternaFresca ? 'ok' : (vaultPerm === 'granted' ? 'warn' : 'bad');
    const bordo = livello === 'ok' ? 'var(--sx-success)' : livello === 'warn' ? 'var(--sx-warning)' : 'var(--sx-danger)';
    const titolo = livello === 'ok'
      ? '🛡 Copia esterna attiva e aggiornata'
      : livello === 'warn'
        ? '⚠ Copia esterna configurata ma non aggiornata'
        : '⛔ Nessuna copia fuori da questa macchina';

    const vaultRiga = () => {
      if (vaultPerm === 'unsupported') {
        return `<div style="color:var(--sx-danger)">Questo browser non consente di scegliere una cartella di destinazione.
          Usare Chrome o Edge, oppure esportare a mano il JSON e archiviarlo su OneDrive.</div>`;
      }
      if (vaultPerm === 'none') {
        return `<div style="margin-bottom:0.4rem">Nessuna cartella configurata. Sceglierne una <strong>dentro OneDrive</strong>:
          da quel momento l'applicativo ci scriverà da solo una volta al giorno.</div>
          <button class="btn btn-sm btn-primary" onclick="App.vaultChooseFolder()">📁 Scegli la cartella di backup…</button>`;
      }
      if (vaultPerm !== 'granted') {
        return `<div style="margin-bottom:0.4rem;color:var(--sx-warning)">
          Cartella configurata, ma il permesso di scrittura non è attivo in questa sessione.
          Il browser lo azzera a ogni riavvio e serve un clic per riattivarlo: è una sua regola, non un difetto.</div>
          <button class="btn btn-sm btn-warning" onclick="App.vaultReauthorize()">🔓 Riattiva il permesso</button>`;
      }
      return `<div style="margin-bottom:0.5rem">
          Ultimo backup: <strong>${fmt(vaultLast)}</strong>
          ${manifest ? ` · ${Number(manifest.movimenti_totali || 0).toLocaleString('it-IT')} movimenti su ${manifest.mesi || 0} file mensili` : ''}
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn btn-sm btn-success" onclick="App.vaultBackupNow()">💾 Esegui backup adesso</button>
          <button class="btn btn-sm btn-accent" onclick="App.vaultRestore()">♻ Ripristina da questa cartella…</button>
          <button class="btn btn-sm" onclick="App.vaultChooseFolder()">📁 Cambia cartella</button>
        </div>`;
    };

    host.innerHTML = `<div class="config-card" style="border-left:4px solid ${bordo};margin-bottom:0.75rem">
      <h3 style="color:${bordo}">${titolo}</h3>

      <div style="padding:0.5rem 0;border-bottom:1px solid var(--sx-border)">
        <div style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size);margin-bottom:0.25rem">📁 Copia esterna automatica (OneDrive)</div>
        <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.55">${vaultRiga()}</div>
      </div>

      ${remoto ? `
      <!-- v1.1.0 [N6] — Con il servizio dati i due riquadri qui sotto NON
           valgono: parlano di un database dentro il browser, e il database
           non e' piu' li'. Dirlo comunque sarebbe peggio che tacere, perche'
           un operatore leggerebbe "il browser puo' cancellare il database"
           di un file SQLite che il browser non ha mai visto — e i due
           pulsanti OPFS fallirebbero, essendo supportsLocalBackup false. -->
      <div style="padding:0.5rem 0;border-bottom:1px solid var(--sx-border)">
        <div style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size);margin-bottom:0.25rem">
          🗄 Il database non è in questo browser <span class="badge badge-green">servizio dati</span>
        </div>
        <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.55">
          Vive come file sulla macchina che ospita il servizio${est?.file ? `:<br><span class="mono" style="font-size: var(--md-sys-typescale-label-small-size)">${this._esc(est.file)}</span>` : '.'}
          <br>Non è soggetto alla cancellazione dei dati di navigazione né alla quota del browser,
          e non serve alcun permesso di archiviazione persistente.
          <strong>La copia di sicurezza è un compito del servizio</strong>, non di questa scheda:
          si esegue a caldo con <span class="mono">POST /api/backup</span> — vedi INSTALLAZIONE, sezione «Il backup».
        </div>
      </div>` : `
      <div style="padding:0.5rem 0;border-bottom:1px solid var(--sx-border)">
        <div style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size);margin-bottom:0.25rem">
          🔒 Archiviazione persistente
          ${persist.granted
            ? '<span class="badge badge-green">concessa</span>'
            : '<span class="badge badge-amber">non concessa</span>'}
        </div>
        <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.55">
          ${persist.granted
            ? 'Il browser si impegna a non cancellare il database per far spazio ad altro.'
            : `Senza questo permesso il browser <strong>può cancellare il database</strong> quando il disco si riempie.
               ${persist.reason}`}
        </div>
      </div>

      <div style="padding:0.5rem 0;border-bottom:1px solid var(--sx-border)">
        <div style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size);margin-bottom:0.25rem">🗂 Backup locali settimanali (OPFS)</div>
        <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.55;margin-bottom:0.4rem">
          ${opfsList.length
            ? `${opfsList.length} cop${opfsList.length === 1 ? 'ia' : 'ie'} · più recente: <strong>${opfsList[0]?.name || '—'}</strong>.`
            : 'Nessuna copia presente.'}
          Stanno sullo stesso disco e nello stesso profilo browser del database:
          <strong>non sostituiscono la copia esterna</strong>, servono a rimediare a un errore recente.
        </div>
        <button class="btn btn-sm" onclick="App.showOPFSBackups()">🗂 Elenca e ripristina…</button>
        <button class="btn btn-sm" onclick="App.opfsBackupNow()">💾 Crea copia locale adesso</button>
      </div>`}

      <div style="padding:0.5rem 0">
        <div style="font-weight:700;font-size: var(--md-sys-typescale-body-medium-size);margin-bottom:0.25rem">⚡ Registro in memoria</div>
        <div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.55;margin-bottom:0.4rem">
          In archivio ci sono <strong>${win.total.toLocaleString('it-IT')}</strong> movimenti; in memoria se ne tengono
          <strong>${win.inMemory.toLocaleString('it-IT')}</strong> (ultimi ${win.days || '∞'} giorni).
          Cruscotto e KPI leggono la finestra; Registro, export e ricerche per data interrogano l'archivio completo.
          Allargarla rende l'avvio più lento, stringerla lo rende più rapido: <strong>nessun dato viene perso in nessun caso</strong>.
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
          <label for="movWindowDays" style="font-size: var(--md-sys-typescale-body-small-size);font-weight:600">Giorni in memoria</label>
          <input class="input input-mono" id="movWindowDays" type="number" min="0" max="${Store.MOVLOG_WINDOW_MAX}" value="${win.days}" style="width:100px">
          <button class="btn btn-sm btn-primary" onclick="App._applyMovWindow()">Applica e ricarica</button>
          <span style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">0 = carica tutto (sconsigliato oltre i 100.000 movimenti)</span>
        </div>
      </div>

      <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--sx-border)">
        Spazio occupato: ${this._fmtUsage(est)}
      </div>
    </div>`;
  },

  async _applyMovWindow() {
    const v = Store.setMovLogWindowDays(document.getElementById('movWindowDays')?.value);
    this.toast(`Finestra del registro: ${v ? v + ' giorni' : 'tutto l’archivio'} — ricarico…`, 'info');
    await Store.reloadCache();
    this.renderConfig();
  },

  /* ── Comandi della copia esterna ─────────────────────────────────── */
  async vaultChooseFolder() {
    try {
      await Vault.chooseFolder();
      this.toast('Cartella di backup configurata — eseguo la prima copia…', 'success');
      await this.vaultBackupNow();
    } catch (err) {
      if (err?.name === 'AbortError') return;   // l'utente ha chiuso il selettore
      this.toast(`Cartella non configurata: ${err.message}`, 'error');
    }
    this.renderConfig();
  },

  async vaultReauthorize() {
    const p = await Vault.requestPermission();
    if (p === 'granted') { this.toast('Permesso riattivato', 'success'); await this.vaultBackupNow(); }
    else this.toast('Permesso non concesso', 'error');
    this.renderConfig();
  },

  async vaultBackupNow() {
    const host = document.getElementById('resilienzaCard');
    const say = (t) => { if (host) { const s = host.querySelector('.vault-progress'); if (s) s.textContent = t; } };
    if (host) host.insertAdjacentHTML('afterbegin', '<div class="config-card vault-progress" style="margin-bottom:0.5rem">Backup in corso…</div>');
    try {
      const r = await Vault.runBackup({ force: true, onProgress: say });
      this.toast(`💾 Backup esterno completato · ${r.movimenti.toLocaleString('it-IT')} movimenti · ${r.mesiScritti} file mensili aggiornati`, 'success');
    } catch (err) {
      console.error('[WM] backup esterno:', err);
      this.toast(`Backup esterno non riuscito: ${err.message}`, 'error');
    } finally {
      document.querySelector('.vault-progress')?.remove();
      if (this.currentView === 'config' && this._configTab === 'data') this.renderConfig();
    }
  },

  /* Backup automatico all'avvio, silenzioso se non c'e' niente da fare. */
  async _scheduleVaultBackup() {
    if (!Vault.supported()) return;
    try {
      if ((await Vault.permissionState()) !== 'granted') return;
      if (!(await Vault.isDue())) return;
      const r = await Vault.runBackup();
      if (r) this.toast(`💾 Copia esterna aggiornata · ${r.movimenti.toLocaleString('it-IT')} movimenti`, 'info');
    } catch (err) {
      console.warn('[WM] backup esterno automatico:', err);
      this.toast(`⚠ Copia esterna non riuscita: ${err.message}`, 'warning');
    }
  },

  async vaultRestore() {
    const stati = await Vault.listStates();
    if (!stati.length) return this.toast('Nella cartella non ci sono fotografie da ripristinare', 'error');
    const manifest = await Vault.readManifest();
    const opzioni = stati.map((s, i) => `<option value="${this._esc(s.name)}" ${i === 0 ? 'selected' : ''}>
      ${this._esc(s.name)} — ${(s.size/1024).toFixed(0)} KB — ${new Date(s.modified).toLocaleString('it-IT')}</option>`).join('');
    this.showModal(
      '♻ Ripristino dalla cartella di backup',
      `<div class="mov-preview mov-preview-err" style="margin-bottom:0.7rem">
        <strong>⚠ Il ripristino SOSTITUISCE integralmente i dati presenti.</strong>
        Prima di procedere verrà scaricato un export dello stato attuale.
      </div>
      <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary);line-height:1.6;margin-bottom:0.6rem">
        Verranno ricomposti la fotografia scelta e <strong>tutti</strong> i file mensili dei movimenti presenti nella cartella.
        ${manifest ? `Il manifest dichiara ${Number(manifest.movimenti_totali||0).toLocaleString('it-IT')} movimenti su ${manifest.mesi||0} mesi.` : 'Nella cartella non è presente il manifest: la verifica sarà parziale.'}
      </p>
      <div class="form-group">
        <label>Fotografia dello stato da usare</label>
        <select class="input select" id="vaultStatePick">${opzioni}</select>
      </div>
      <div id="vaultRestoreLog" style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted);margin-top:0.5rem;min-height:1.2em"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-danger" onclick="App.doVaultRestore()">♻ Ripristina</button>`
    );
  },

  async doVaultRestore() {
    const nome = document.getElementById('vaultStatePick')?.value;
    const log = (t) => { const e = document.getElementById('vaultRestoreLog'); if (e) e.textContent = t; };
    try {
      log('Export di sicurezza dello stato attuale…');
      await this.exportData();
      log('Lettura del backup…');
      const pacchetto = await Vault.buildRestorePackage({ statoFile: nome, onProgress: log });
      const check = Store.verifyExportPackage(pacchetto);
      if (!check.ok && !await Dialog.confirm({
        title: '⚠ Il backup presenta anomalie',
        message: 'La verifica ha segnalato quanto segue:\n\n' + check.problemi.map(p => '  • ' + p).join('\n') +
                 '\n\nProcedere comunque significa sostituire i dati attuali con questo contenuto.',
        confirmLabel: 'Ripristina comunque', danger: true
      })) return;

      const c = pacchetto._counts;
      if (!await Dialog.confirm({
        title: 'Confermare il ripristino?',
        message: 'I dati attualmente in questo database verranno sostituiti.',
        details: Dialog.kv([
          ['Movimenti', Number(c.mov_log).toLocaleString('it-IT')],
          ['Giacenze', Number(c.inventory).toLocaleString('it-IT')],
          ['Articoli', Number(c.articles).toLocaleString('it-IT')],
          ['Operatori', Number(c.operators).toLocaleString('it-IT')]
        ]),
        confirmLabel: 'Sostituisci i dati', danger: true
      })) return;

      log('Scrittura in corso…');
      await Store.importAll(pacchetto, 'overwrite');
      this.closeModal();
      this.renderSidebar();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`♻ Ripristino completato · ${Number(c.mov_log).toLocaleString('it-IT')} movimenti`, 'success');
    } catch (err) {
      console.error('[WM] ripristino:', err);
      log(`Errore: ${err.message}`);
      this.toast(`Ripristino non riuscito: ${err.message}`, 'error');
    }
  },

  /* v2.1.0 — Preferenze di riscontro operativo (nessun dato personale trattato) */
  _setFeedbackPref(key, value) {
    Feedback.setPref(key, value);
    if (key === 'volume') {
      const lbl = document.getElementById('fbVolumeLabel');
      if (lbl) lbl.textContent = `${Math.round(value * 100)}%`;
      Feedback.sound('scan');
    } else if (value) {
      Feedback.sound('ok');
    }
  },

  _testFeedback() {
    Feedback.signal('ok', 'Riscontro positivo', 'Suono breve ascendente — operazione registrata.');
    setTimeout(() => Feedback.signal('warn', 'Avviso', 'Doppio tono — richiede attenzione dell\u2019operatore.'), 1800);
    setTimeout(() => Feedback.signal('error', 'Errore', 'Tono grave ripetuto — operazione NON registrata.'), 3800);
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

  showAddSiteModal() {
    this.showModal('Nuovo Sito di Stoccaggio', `
      <div class="form-group" style="margin-bottom:0.6rem"><label>Codice Sito (2-4 car.) <span class="req">*</span></label>
        <input class="input input-mono" id="newSiteId" placeholder="Es: MOP1, UNT" maxlength="${Validate.MAX.SITE_ID}" style="text-transform:uppercase"></div>
      <div class="form-group" style="margin-bottom:0.6rem"><label>Nome <span class="req">*</span></label>
        <input class="input" id="newSiteName" placeholder="Es: Magazzino Operativo 1" maxlength="${Validate.MAX.SITE_NAME}"></div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Tipo</label>
          <select class="select" id="newSiteType"><option value="proprio">Proprio</option><option value="terzista">Terzista</option></select></div>
        <div class="form-group"><label>Indirizzo</label>
          <input class="input" id="newSiteAddress" placeholder="Opzionale" maxlength="120"></div>
      </div>
      <div class="form-group"><label>Note</label>
        <input class="input" id="newSiteNotes" placeholder="Opzionale" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doAddSite()">Crea Sito</button>`);
  },

  async doAddSite() {
    const id = Validate.clean(document.getElementById('newSiteId').value, true);
    const name = Validate.clean(document.getElementById('newSiteName').value);
    const errs = [Validate.siteId(id), Validate.siteName(name)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    const ok = await Store.addSite({
      id, name,
      type: document.getElementById('newSiteType').value,
      address: Validate.clean(document.getElementById('newSiteAddress').value),
      notes: Validate.clean(document.getElementById('newSiteNotes').value)
    });
    if (!ok) return this.toast('Codice sito già esistente', 'error');
    this.closeModal();
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Sito ${id} creato`, 'success');
  },

  showEditSiteModal(siteId) {
    const site = Store.getSite(siteId);
    if (!site) return;
    this.showModal(`Modifica Sito — ${siteId}`, `
      <div class="form-group" style="margin-bottom:0.6rem"><label>Codice (non modificabile)</label>
        <input class="input input-mono" value="${this._esc(siteId)}" disabled></div>
      <div class="form-group" style="margin-bottom:0.6rem"><label>Nome <span class="req">*</span></label>
        <input class="input" id="editSiteName" value="${this._esc(site.name)}" maxlength="${Validate.MAX.SITE_NAME}"></div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Tipo</label>
          <select class="select" id="editSiteType">
            <option value="proprio" ${site.type === 'proprio' ? 'selected' : ''}>Proprio</option>
            <option value="terzista" ${site.type === 'terzista' ? 'selected' : ''}>Terzista</option>
          </select></div>
        <div class="form-group"><label>Indirizzo</label>
          <input class="input" id="editSiteAddress" value="${this._esc(site.address || '')}" maxlength="120"></div>
      </div>
      <div class="form-group"><label>Note</label>
        <input class="input" id="editSiteNotes" value="${this._esc(site.notes || '')}" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doEditSite('${siteId}')">Salva</button>`);
  },

  async doEditSite(siteId) {
    const name = Validate.clean(document.getElementById('editSiteName')?.value);
    const err = Validate.siteName(name);
    if (err) return this.toast(err, 'error');
    await Store.updateSite(siteId, {
      name,
      type: document.getElementById('editSiteType')?.value || 'proprio',
      address: Validate.clean(document.getElementById('editSiteAddress')?.value),
      notes: Validate.clean(document.getElementById('editSiteNotes')?.value)
    });
    this.closeModal();
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Sito ${siteId} aggiornato`, 'success');
  },

  async confirmDeleteSite(siteId) {
    if (!await Dialog.confirm({
      title: 'Eliminare il sito?',
      message: 'Tutti i dati di inventario associati saranno rimossi. Operazione irreversibile.',
      details: Dialog.kv([['Sito', siteId]]),
      confirmLabel: 'Elimina sito', danger: true
    })) return;
    if (!await Dialog.confirm({
      title: 'Conferma definitiva',
      message: `Si eliminano anche tutti gli item e gli status delle ubicazioni di ${siteId}.`,
      confirmLabel: 'Elimina definitivamente', danger: true
    })) return;
    await Store.deleteSite(siteId);
    if (this.currentSite === siteId) { this.currentSite = null; this.currentZone = null; }
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`Sito ${siteId} eliminato`, 'success');
  },

  showAddZoneModal(siteId) {
    this._editingSiteId = siteId;
    this.showModal(`Nuova Zona in ${siteId}`, `
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Codice Zona <span class="req">*</span></label>
          <input class="input input-mono" id="newZoneId" placeholder="Es: A, B, BULK1" maxlength="${Validate.MAX.ZONE_ID}" style="text-transform:uppercase"></div>
        <div class="form-group"><label>Tipo</label>
          <select class="select" id="newZoneType" onchange="App.updateZoneFields()">
            <option value="RACK">RACK — Scaffalature</option>
            <option value="FLOOR">FLOOR — Stoccaggio a terra</option>
            <option value="BULK">BULK — Area libera</option>
          </select></div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem"><label>Nome <span class="req">*</span></label>
        <input class="input" id="newZoneName" placeholder="Es: Zona Rack MP" maxlength="${Validate.MAX.ZONE_NAME}"></div>
      <div id="zoneTypeFields"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doAddZone('${siteId}')">Crea Zona</button>`);
    this.updateZoneFields();
  },

  updateZoneFields() {
    const type = document.getElementById('newZoneType').value;
    const el = document.getElementById('zoneTypeFields');
    const fields = {
      RACK: `<div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Corsie</label><input class="input" id="zfAisles" type="number" min="1" max="99" value="5"></div>
        <div class="form-group"><label>Campate/corsia</label><input class="input" id="zfBays" type="number" min="1" max="99" value="10"></div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem"><label>Livelli (virgola)</label><input class="input input-mono" id="zfLevels" value="T,A,B,C,D" placeholder="T,A,B,C,D"></div>
      <div class="form-group"><label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;text-transform:none;font-size: var(--md-sys-typescale-body-small-size)">
        <input type="checkbox" id="zfMirror" style="width:16px;height:16px;cursor:pointer">
        <span>Vista frontale specchiata (campate dx → sx)</span>
      </label>
      <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.2rem;padding-left:1.4rem">💡 Per chi lavora dal lato opposto alla numerazione delle campate</div></div>`,
      FLOOR: `<div class="form-row">
        <div class="form-group"><label>File</label><input class="input" id="zfRows" type="number" min="1" max="99" value="4"></div>
        <div class="form-group"><label>Posizioni/fila</label><input class="input" id="zfPosPerRow" type="number" min="1" max="99" value="8"></div>
      </div>`,
      BULK: `<div class="form-row">
        <div class="form-group"><label>N° Posizioni</label><input class="input" id="zfPositions" type="number" min="1" max="999" value="20"></div>
        <div class="form-group"><label>Colonne griglia</label><input class="input" id="zfGridCols" type="number" min="1" max="20" value="5"></div>
      </div>`
    };
    el.innerHTML = fields[type] || '';
  },

  async doAddZone(siteId) {
    const id = Validate.clean(document.getElementById('newZoneId').value, true);
    const name = Validate.clean(document.getElementById('newZoneName').value);
    const type = document.getElementById('newZoneType').value;
    const errs = [Validate.zoneId(id), Validate.siteName(name)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    const zone = { id, name, type };
    if (type === 'RACK') {
      zone.aisles = Math.max(1, Math.min(99, parseInt(document.getElementById('zfAisles').value) || 1));
      zone.bays_per_aisle = Math.max(1, Math.min(99, parseInt(document.getElementById('zfBays').value) || 1));
      zone.levels = Validate.clean(document.getElementById('zfLevels').value, true).split(',').map(s => s.trim()).filter(Boolean);
      if (!zone.levels.length) zone.levels = ['T'];
      zone.mirror_frontal = document.getElementById('zfMirror')?.checked === true;
    } else if (type === 'FLOOR') {
      zone.rows = Math.max(1, Math.min(99, parseInt(document.getElementById('zfRows').value) || 1));
      zone.positions_per_row = Math.max(1, Math.min(99, parseInt(document.getElementById('zfPosPerRow').value) || 1));
    } else {
      zone.positions = Math.max(1, Math.min(999, parseInt(document.getElementById('zfPositions').value) || 1));
      zone.grid_cols = Math.max(1, Math.min(20, parseInt(document.getElementById('zfGridCols').value) || 5));
    }
    const ok = await Store.addZone(siteId, zone);
    if (!ok) return this.toast('Codice zona già esistente in questo sito', 'error');
    this.closeModal();
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Zona ${id} creata in ${siteId}`, 'success');
  },

  /* 1.4.0 — La destinazione d'uso della zona: e' la meta' contro cui si
     verificano gli attributi dell'articolo. Senza questa, nessuna
     segnalazione puo' comparire sulla mappa, per quanti articoli si
     classifichino. */
  _campiDestinazioneZona(zone) {
    const attuale = zone?.temp_class || '';
    const riservata = zone?.allergen_zone === true;
    const scelti = new Set(zone?.allergens || []);
    const opzioni = Store.getClassiConservazione().map(c =>
      `<option value="${c.code}" ${attuale === c.code ? 'selected' : ''}>${this._esc(c.label)}</option>`
    ).join('');
    const caselle = Store.getAllergeniAmmessi().map(a =>
      `<label class="all-chip ${scelti.has(a.code) ? 'on' : ''}">
        <input type="checkbox" id="ezAll_${a.code}" ${scelti.has(a.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(a.label)}</label>`
    ).join('');
    /* 1.6 — IL TERZO ATTRIBUTO DI DESTINAZIONE D'USO, D19. Si imposta sulla
       zona come gli altri due e scende a tutte le sue celle: un gesto solo,
       e il motore di verifica legge dove legge gia'. */
    const pericolosa = zone?.hazard_zone === true;
    const pericoli = Store.getPericoli();
    const hazScelti = new Set(zone?.hazards || []);
    const hazCaselle = pericoli.map(h =>
      `<label class="all-chip ${hazScelti.has(h.code) ? 'on' : ''}">
        <input type="checkbox" id="ezHaz_${h.code}" ${hazScelti.has(h.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(h.label)}</label>`
    ).join('');
    return `
      <div style="border-top:1px dashed var(--sx-border);margin:0.8rem 0 0.6rem;padding-top:0.7rem">
        <div class="form-group" style="margin-bottom:0.5rem"><label>Classe di conservazione della zona</label>
          <select class="input" id="ezTempClass">
            <option value="">— non caratterizzata —</option>${opzioni}
          </select></div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;text-transform:none;font-size: var(--md-sys-typescale-body-small-size)">
            <input type="checkbox" id="ezAllergenZone" style="width:16px;height:16px;cursor:pointer" ${riservata ? 'checked' : ''}
              onchange="document.getElementById('ezAllergenList').hidden=!this.checked">
            <span>Zona riservata alla merce con allergeni</span>
          </label></div>
        <div class="form-group" id="ezAllergenList" ${riservata ? '' : 'hidden'}>
          <label>Allergeni ammessi — nessuno spuntato = tutti</label>
          <div class="all-grid">${caselle}</div></div>
        <div class="form-group" style="margin-bottom:0.4rem">
          <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;text-transform:none;font-size: var(--md-sys-typescale-body-small-size)">
            <input type="checkbox" id="ezHazardZone" style="width:16px;height:16px;cursor:pointer" ${pericolosa ? 'checked' : ''}
              onchange="document.getElementById('ezHazardList').hidden=!this.checked">
            <span>Zona dedicata alla merce pericolosa</span>
          </label></div>
        <div class="form-group" id="ezHazardList" ${pericolosa ? '' : 'hidden'}>
          <label>Pericolosità ammesse — nessuna spuntata = tutte</label>
          ${pericoli.length
            ? `<div class="all-grid">${hazCaselle}</div>`
            : `<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">Nessuna pericolosità configurata — si aggiungono in Configurazione → Parametri articolo.</div>`}</div>
        <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.3rem">
          🧭 Lasciata non caratterizzata, la zona non segnala nulla.<br>
          🔓 Una singola ubicazione marcata <strong>Riservata</strong> ammette allergeni
          comunque, ovunque si trovi — la deroga si vede in mappa e si elenca.
          Sulla temperatura la verifica resta attiva.
        </div>
      </div>`;
  },

  _leggiDestinazioneZona() {
    const riservata = document.getElementById('ezAllergenZone')?.checked === true;
    const allergens = Store.getAllergeniAmmessi()
      .filter(a => document.getElementById(`ezAll_${a.code}`)?.checked)
      .map(a => a.code);
    const pericolosa = document.getElementById('ezHazardZone')?.checked === true;
    const hazards = Store.getPericoli()
      .filter(h => document.getElementById(`ezHaz_${h.code}`)?.checked)
      .map(h => h.code);
    return {
      temp_class: document.getElementById('ezTempClass')?.value || undefined,
      allergen_zone: riservata,
      allergens: riservata && allergens.length ? allergens : undefined,
      hazard_zone: pericolosa,
      hazards: pericolosa && hazards.length ? hazards : undefined,
    };
  },

  showEditZoneModal(siteId, zoneId) {
    const zone = Store.getZone(siteId, zoneId);
    if (!zone) return;
    let configFields = '';
    if (zone.type === 'RACK') {
      configFields = `<div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Corsie</label><input class="input" id="ezAisles" type="number" min="1" max="99" value="${zone.aisles}"></div>
        <div class="form-group"><label>Campate/corsia</label><input class="input" id="ezBays" type="number" min="1" max="99" value="${zone.bays_per_aisle}"></div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem"><label>Livelli</label><input class="input input-mono" id="ezLevels" value="${this._esc((zone.levels || []).join(','))}"></div>
      <div class="form-group"><label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;text-transform:none;font-size: var(--md-sys-typescale-body-small-size)">
        <input type="checkbox" id="ezMirror" style="width:16px;height:16px;cursor:pointer" ${zone.mirror_frontal ? 'checked' : ''}>
        <span>Vista frontale specchiata (campate dx → sx)</span>
      </label>
      <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.2rem;padding-left:1.4rem">💡 Per chi lavora dal lato opposto alla numerazione delle campate</div></div>`;
    } else if (zone.type === 'FLOOR') {
      configFields = `<div class="form-row">
        <div class="form-group"><label>File</label><input class="input" id="ezRows" type="number" min="1" max="99" value="${zone.rows}"></div>
        <div class="form-group"><label>Posizioni/fila</label><input class="input" id="ezPos" type="number" min="1" max="99" value="${zone.positions_per_row}"></div>
      </div>`;
    } else {
      configFields = `<div class="form-row">
        <div class="form-group"><label>N° Posizioni</label><input class="input" id="ezPositions" type="number" min="1" max="999" value="${zone.positions}"></div>
        <div class="form-group"><label>Colonne griglia</label><input class="input" id="ezCols" type="number" min="1" max="20" value="${zone.grid_cols || 5}"></div>
      </div>`;
    }
    this.showModal(`Modifica Zona — ${zoneId} (${zone.type})`, `
      <div class="form-group" style="margin-bottom:0.6rem"><label>Nome <span class="req">*</span></label>
        <input class="input" id="ezName" value="${this._esc(zone.name)}" maxlength="${Validate.MAX.ZONE_NAME}"></div>
      <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-warning);margin-bottom:0.5rem">⚠ Modificare le dimensioni può generare ubicazioni orfane per item già posizionati oltre la nuova griglia.</p>
      ${configFields}
      ${this._campiDestinazioneZona(zone)}
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doEditZone('${siteId}','${zoneId}')">Salva</button>`);
  },

  async doEditZone(siteId, zoneId) {
    const name = Validate.clean(document.getElementById('ezName')?.value);
    const err = Validate.siteName(name);
    if (err) return this.toast(err, 'error');
    const zone = Store.getZone(siteId, zoneId);
    const updates = { name };
    if (zone.type === 'RACK') {
      updates.aisles = Math.max(1, Math.min(99, parseInt(document.getElementById('ezAisles').value) || 1));
      updates.bays_per_aisle = Math.max(1, Math.min(99, parseInt(document.getElementById('ezBays').value) || 1));
      updates.levels = Validate.clean(document.getElementById('ezLevels').value, true).split(',').map(s => s.trim()).filter(Boolean);
      if (!updates.levels.length) updates.levels = ['T'];
      updates.mirror_frontal = document.getElementById('ezMirror')?.checked === true;
    } else if (zone.type === 'FLOOR') {
      updates.rows = Math.max(1, Math.min(99, parseInt(document.getElementById('ezRows').value) || 1));
      updates.positions_per_row = Math.max(1, Math.min(99, parseInt(document.getElementById('ezPos').value) || 1));
    } else {
      updates.positions = Math.max(1, Math.min(999, parseInt(document.getElementById('ezPositions').value) || 1));
      updates.grid_cols = Math.max(1, Math.min(20, parseInt(document.getElementById('ezCols').value) || 5));
    }
    Object.assign(updates, this._leggiDestinazioneZona());
    await Store.updateZone(siteId, zoneId, updates);
    this.closeModal();
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    if (this.currentSite === siteId && this.currentZone === zoneId) this.renderMap();
    this.updateSyncIndicator();
    this.toast(`✓ Zona ${zoneId} aggiornata`, 'success');
  },

  async confirmDeleteZone(siteId, zoneId) {
    /* v2.2.1 [F2] — migrato da confirm() nativo a Dialog (anti-scanner) */
    if (!await Dialog.confirm({
      title: 'Eliminare la zona?',
      message: 'Tutti i dati di inventario della zona saranno rimossi. Operazione irreversibile.',
      details: Dialog.kv([['Sito', siteId], ['Zona', zoneId]]),
      confirmLabel: 'Elimina zona', danger: true
    })) return;
    await Store.deleteZone(siteId, zoneId);
    if (this.currentZone === zoneId && this.currentSite === siteId) this.currentZone = null;
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`Zona ${zoneId} eliminata`, 'success');
  },

  showAddItemModal(locationCode) {
    const articles = Store.getArticles();
    let artOptions = '<option value="">— Seleziona o digita nuovo —</option>';
    for (const a of articles) artOptions += `<option value="${this._esc(a.code)}" data-desc="${this._esc(a.description)}">${this._esc(a.code)} — ${this._esc(a.description)}</option>`;
    this.showModal(`Aggiungi Item — ${locationCode}`, `
      <div class="form-group" style="margin-bottom:0.6rem"><label>Articolo esistente</label>
        <select class="select" id="itemArticleSelect" onchange="App.onArticleSelect()">${artOptions}</select></div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Codice Articolo <span class="req">*</span></label>
          <input class="input input-mono" id="itemArticleCode" placeholder="MP-001234" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"></div>
        <div class="form-group"><label>Descrizione <span class="req">*</span></label>
          <input class="input" id="itemArticleDesc" placeholder="Vitamina C 500mg" maxlength="${Validate.MAX.ARTICLE_DESC}"></div>
      </div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Codice Lotto <span class="req">*</span></label>
          <input class="input input-mono" id="itemLotCode" placeholder="L240815" maxlength="${Validate.MAX.LOT_CODE}"></div>
        <div class="form-group"><label>Scadenza (opz.)</label>
          <input class="input" id="itemExpiry" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10" oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this)"></div>   <!-- v2.3.0 [D1]: era type=month -->
      </div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Colli <span class="req">*</span></label>
          <input class="input input-mono" id="itemQty" type="number" min="1" step="1" value="1" style="text-align:center;font-weight:700"></div>
        <div class="form-group"><label>&nbsp;</label>
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);padding-top:0.4rem">Se il lotto è già presente, i colli si sommano.</div></div>
      </div>
      <div class="form-group"><label>Note</label>
        <input class="input" id="itemNotes" placeholder="Opzionale" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-success" onclick="App.doAddItem('${locationCode}')">✓ Aggiungi</button>`);
  },

  onArticleSelect() {
    const sel = document.getElementById('itemArticleSelect');
    const opt = sel.options[sel.selectedIndex];
    if (opt.value) {
      document.getElementById('itemArticleCode').value = opt.value;
      document.getElementById('itemArticleDesc').value = opt.dataset.desc || '';
    }
  },

  async doAddItem(locationCode) {
    const code = Validate.clean(document.getElementById('itemArticleCode').value, true);
    const desc = Validate.clean(document.getElementById('itemArticleDesc').value);
    const lot = Validate.clean(document.getElementById('itemLotCode').value);
    // v2.3.0 [D1] — il campo scadenza è in formato gg/mm/aaaa: conversione a ISO
    const expiry = this._dateITtoISO(document.getElementById('itemExpiry').value, 'Scadenza');
    if (expiry === null) return;   // data incompleta o non valida → inserimento interrotto
    const notes = Validate.clean(document.getElementById('itemNotes').value);
    const qty = parseInt(document.getElementById('itemQty')?.value) || 1;  // v1.7.0
    const errs = [Validate.article(code), Validate.articleDesc(desc, true), Validate.lot(lot), Validate.notes(notes)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    if (qty < 1) return this.toast('Numero colli non valido (minimo 1)', 'error');
    const res = await Store.addItem(locationCode, code, desc, lot, expiry, notes, qty);
    if (!res.ok) return this.toast('Errore posizionamento', 'error');
    await this._logMov(MOV.IN, code, desc, lot, locationCode, null, '', '', '', res.qty_before, qty, res.qty_after);
    this.closeModal();
    this.renderMap();
    this.renderDetail(locationCode);
    this.updateSyncIndicator();
    const incrSuffix = res.mode === 'incremented' ? ` (saldo: ${res.qty_after})` : '';
    this.toast(`✓ ${code}#${lot} aggiunto a ${locationCode} · +${qty} Coll.${incrSuffix}`, 'success');
  },

  showAddArticleModal() {
    this.showModal('Nuovo Articolo', `
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Codice <span class="req">*</span></label>
          <input class="input input-mono" id="artCode" placeholder="MP-001234" maxlength="${Validate.MAX.ARTICLE_CODE}" style="text-transform:uppercase"
            oninput="App._precompilaCategoria()"></div>
        <div class="form-group"><label>Categoria</label>
          <input class="input input-mono" id="artCategory" placeholder="MP" maxlength="5" value="MP" style="text-transform:uppercase"
            oninput="this.dataset.tocca='1'"></div>
      </div>
      <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin:-0.35rem 0 0.6rem">
        La categoria si compila da sé coi <strong>primi 3 caratteri</strong> del codice — è la forma più comune, non una regola: si può riscrivere.
      </div>
      <div class="form-group" style="margin-bottom:0.6rem"><label>Descrizione <span class="req">*</span></label>
        <input class="input" id="artDesc" placeholder="Descrizione articolo" maxlength="${Validate.MAX.ARTICLE_DESC}"></div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Fornitore / Cliente</label>
          <input class="input" id="artSupplier" maxlength="80"></div>
        <div class="form-group"><label>UM</label>
          <input class="input input-mono" id="artUnit" value="PZ" maxlength="5" style="text-transform:uppercase"
            list="umAmmesse" oninput="App._aggiornaNotaUM('art')"></div>
      </div>
      ${this._datalistUM()}
      <!-- 1.6 — PESO UNITARIO E PESO NETTO PER COLLO SONO USCITI (D15).
           Non erano dati che il magazzino gestisce, e stando accanto alla
           quantità per collo facevano credere che servissero tutti e tre. -->
      <div class="form-row-3" style="margin-bottom:0.3rem">
        <div class="form-group"><label>Quantità per collo (UM)</label><input class="input" id="artPiecesPack" type="number" step="0.001" min="0" value="0" oninput="App._aggiornaNotaUM('art')"></div>
        <div class="form-group"><label>Stock Min</label><input class="input" id="artMinStock" type="number" step="1" min="0" value="0"></div>
        <div class="form-group"><label>Stock Max</label><input class="input" id="artMaxStock" type="number" step="1" min="0" value="0"></div>
      </div>
      <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.6rem">
        📄 La quantità per collo è la riga che decide se l'articolo è gestito a unità di misura. A zero, resta a soli colli.
      </div>
      ${this._notaUM('art')}
      ${this._campiAttributiArticolo(null, 'art')}
      <div class="form-group"><label>Note</label>
        <input class="input" id="artNotes" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doAddArticle()">Crea</button>`);
    /* La nota dice cosa si sta configurando: deve dirlo gia' all'apertura,
       non dal primo tasto. La maschera esiste solo dopo `showModal`. */
    this._aggiornaNotaUM('art');
  },

  /* 1.6 — LA CATEGORIA SI PRECOMPILA, E BASTA. I primi tre caratteri del
     codice sono la categoria nella grande maggioranza dei casi, ma non è una
     regola ferrea: ci sono articoli che non la seguono. Quindi si suggerisce
     e non si impone — e appena qualcuno tocca il campo, il suggerimento si
     ferma: `dataset.tocca` è il segno che una scelta è stata fatta, e
     riscriverla al tasto dopo sarebbe cancellarla. */
  _precompilaCategoria() {
    const cat = document.getElementById('artCategory');
    const code = document.getElementById('artCode');
    if (!cat || !code || cat.dataset.tocca === '1') return;
    const primi = String(code.value || '').trim().toUpperCase().slice(0, 3);
    if (primi) cat.value = primi;
  },

  async doAddArticle() {
    const code = Validate.clean(document.getElementById('artCode').value, true);
    const desc = Validate.clean(document.getElementById('artDesc').value);
    const cat = Validate.clean(document.getElementById('artCategory').value, true) || 'MP';
    const errs = [Validate.article(code), Validate.articleDesc(desc, true), Validate.category(cat)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    const ok = await Store.addArticle({
      code, description: desc, category: cat,
      supplier: Validate.clean(document.getElementById('artSupplier').value),
      unit: Validate.clean(document.getElementById('artUnit').value, true) || 'PZ',
      pieces_per_pack: document.getElementById('artPiecesPack').value,   // v3.0.0 [M4]
      min_stock: document.getElementById('artMinStock').value,
      max_stock: document.getElementById('artMaxStock').value,
      notes: Validate.clean(document.getElementById('artNotes').value),
      ...this._leggiAttributiArticolo('art')
    });
    if (!ok) return this.toast('Codice articolo già presente', 'error');
    this.closeModal();
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Articolo ${code} creato`, 'success');
  },

  /* ═══ AVVISI MERCEOLOGICI ═══════════════════════════════════════════
     Temperatura, allergeni e certificazioni stanno in anagrafica, ma
     servono DOVE LA MERCE SI TOCCA: davanti allo scaffale, sul report
     dell'ODP e sul DDT che accompagna il camion. Chi ha in mano il collo
     non apre la Configurazione per controllare, e un surgelato lasciato su
     un bancale a temperatura ambiente non torna indietro.

     Una sorgente sola per tre viste, perche' tre elenchi scritti a mano
     divergono: e un avviso che compare al prelievo ma non sul DDT e' peggio
     di nessun avviso, perche' insegna a non fidarsi.

     Un articolo senza attributi non produce avvisi. Il silenzio qui vuol
     dire «non e' stato classificato», non «e' a posto» — e la differenza si
     legge in Configurazione, dove si conta chi manca. */
  _avvisiArticolo(code) {
    const a = Store.getArticle(code);
    if (!a) return [];
    const out = [];
    if (a.temp_class) {
      out.push({ tipo: 'temp', icona: '🌡', et: 'Conservazione', testo: etichettaClasse(a.temp_class) });
    }
    if (a.allergens?.length) {
      out.push({ tipo: 'all', icona: '⚠', et: 'Allergeni', testo: a.allergens.map(c => this._etAllergene(c)).join(', ') });
    }
    if (a.certifications?.length) {
      out.push({ tipo: 'cert', icona: '✓', et: 'Certificazioni', testo: a.certifications.map(etichettaCertificazione).join(', ') });
    }
    /* 1.6 — la pericolosità viaggia come gli altri due: davanti allo
       scaffale, sul report e sul DDT. Chi ha in mano un collo di
       infiammabile deve saperlo lì, non in Configurazione. */
    if (a.hazards?.length) {
      const ammessi = Store.getPericoli();
      out.push({ tipo: 'haz', icona: '☣', et: 'Pericolosità',
                 testo: a.hazards.map(h => etichettaDi(ammessi, h)).join(', ') });
    }
    return out;
  },

  /** A video: una fascia, dove c'è spazio per leggerla per intero. */
  _avvisiBanda(code) {
    const av = this._avvisiArticolo(code);
    if (!av.length) return '';
    return `<div class="avv-banda">${av.map(x => `
      <div class="avv-riga avv-riga--${x.tipo}">
        <span class="avv-ico">${x.icona}</span>
        <span class="avv-et">${this._esc(x.et)}</span>
        <b>${this._esc(x.testo)}</b>
      </div>`).join('')}</div>`;
  },

  /** In stampa: una riga sola sotto la descrizione, e nient'altro. */
  _avvisiRigaStampa(code) {
    const av = this._avvisiArticolo(code);
    if (!av.length) return '';
    return `<div class="avv-stampa">${
      av.map(x => `${x.icona} ${this._esc(x.testo)}`).join(' · ')}</div>`;
  },

  /* 1.4.0 — i due attributi che il motore di stoccaggio usera' come vincoli
     duri. Stessi controlli in creazione e in modifica: due maschere che
     divergono sono due maschere che prima o poi si contraddicono. */
  /* 1.4.2 — LA COLONNA «UM» E' UNA SOLA, ED ESISTE DALLA v1.
     `unit` e' gia' etichettato UM nella maschera, nella tabella articoli e
     nella colonna dell'export: aggiungergliene accanto una seconda sarebbe
     due campi con lo stesso nome. Qui non se ne aggiunge nessuna — si
     suggeriscono le cinque unita' che il motore sa dividere, lasciando
     scrivere qualunque cosa come ha sempre fatto. Cio' che non e' fra le
     cinque si legge come «non gestita», e non succede niente. */
  _datalistUM() {
    /* 1.6 — le cinque che il motore sa dividere, più quelle configurate in
       Impostazioni. Restano un suggerimento e non un vincolo: ciò che non è
       fra le cinque si legge come «non gestita», e non succede niente. */
    return `<datalist id="umAmmesse">${Store.getUnitaAmmesse()
      .map(u => `<option value="${u.code}">${this._esc(u.label)}</option>`).join('')}</datalist>`;
  },

  /* La riga sotto «quantita' per collo» che dice cosa si sta configurando.
     Non blocca niente: un'anagrafica a meta' e' il punto di partenza, non un
     errore — e con l'interruttore spento questa riga non compare affatto. */
  _notaUM(p) {
    if (!Store.isFeatureOn('uom')) return '';
    return `<div id="${p}NotaUM" style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.6rem"></div>`;
  },

  _aggiornaNotaUM(p) {
    const box = document.getElementById(`${p}NotaUM`);
    if (!box) return;
    const um = document.getElementById(`${p}Unit`)?.value || '';
    const per = document.getElementById(`${p}PiecesPack`)?.value || '';
    const errori = validaConfigurazione(um, per);
    if (errori.length) {
      box.textContent = '⚖ ' + errori.join(' · ');
      box.style.color = 'var(--sx-warning)';
      return;
    }
    const n = Number(String(per).replace(',', '.'));
    box.style.color = 'var(--sx-text-muted)';
    box.textContent = n > 0
      ? `⚖ Un collo pieno contiene ${formattaQuantita(n, um)} ${um} — ${etichettaUnita(um)}. Il collo incompleto si calcola.`
      : '⚖ Nessuna unità: l\'articolo si gestisce a soli colli, come prima.';
  },

  /* COME SI LEGGE UNA RIGA DI GIACENZA DALLA 1.4.2: «10 × 1.000 + 1 × 100 PZ».
     Vuota quando la riga e' a soli colli — cioe' sempre, finche' l'interruttore
     resta spento e finche' nessuno compila la quantita' per collo. La stessa
     riga vale a video, in etichetta e sul report: tre formattazioni dello
     stesso numero, per chi legge, sono tre numeri diversi. */
  _rigaUM(item) {
    const cfg = Store.getUomConfig(item?.article_code, item?.lot_code);
    /* 1.8 — dove la riga porta l'elenco, la riga la descrive l'elenco: sono i
       colli veri, uno per uno, e possono essere tutti di misura diversa. La
       suddivisione calcolata qui sotto non saprebbe raccontarli. */
    if (cfg && Array.isArray(item?.packs)) {
      const elenco = Store.colliDiRiga(item);
      if (elenco) {
        const v = verificaElenco(item.qty, item.qty_uom, elenco, cfg.uom);
        const scarto = v && !v.ok
          ? ` <span class="badge badge-amber" title="I colli dichiarati non corrispondono all'elenco: ne risulterebbero ${v.colliAttesi}">⚠ ${v.scarto > 0 ? '+' : ''}${v.scarto} coll.</span>`
          : '';
        return `<div class="item-meta">⚖ ${this._esc(descriviElenco(elenco, cfg.uom))}${scarto}</div>`;
      }
    }
    if (!cfg?.per_collo) return '';
    const s = Store.suddivisioneDi(item);
    if (!s || !s.colli) return '';
    const totale = s.pieni * cfg.per_collo + s.resto;
    /* Lo SCARTO fra colli dichiarati e UM non si corregge da solo: si mostra.
       Correggere un saldo senza che nessuno abbia guardato la merce e'
       precisamente il modo di scriverne uno sbagliato ma plausibile. */
    const v = Store.verificaUom(item);
    const avviso = v && !v.ok
      ? ` <span class="badge badge-amber" title="I colli dichiarati non corrispondono alle UM: ne risulterebbero ${v.colliAttesi}">⚠ ${v.scarto > 0 ? '+' : ''}${v.scarto} coll.</span>`
      : '';
    const incompleto = s.incompleto
      ? ' <span class="badge badge-muted" title="L\'ultimo collo non è pieno">collo incompleto</span>'
      : '';
    return `<div class="item-meta">⚖ ${this._esc(descriviColli(totale, cfg.per_collo, cfg.uom))}${incompleto}${avviso}</div>`;
  },

  /* 1.6 — LE TENDINE NON SONO PIÙ NEL SORGENTE. Classi, allergeni e
     pericolosità arrivano da Store, che unisce i valori di legge con quelli
     configurati in Impostazioni → Parametri articolo. I 14 del Reg. UE
     1169/2011 restano davanti e non si possono togliere — D18. */
  /* 1.6 — L'ETICHETTA DI UN ALLERGENE PUO' NON STARE PIU' NELLA TABELLA.
     `etichettaAllergene` conosce i 14 di legge e ripiega sul codice per
     tutto il resto: da quando D18 lascia aggiungere voci aziendali, quel
     ripiego si vede — «LATTOSIO» al posto di «Lattosio», davanti a un
     operatore e su un verbale. Trovato provando la 1.6 nel browser.
     Un punto solo, perche' la stessa etichetta esce in sei. */
  _etAllergene(code) {
    return etichettaDi(Store.getAllergeniAmmessi(), code);
  },

  _campiAttributiArticolo(art, p) {
    const attuale = art?.temp_class || '';
    const scelti = new Set(art?.allergens || []);
    const opzioni = Store.getClassiConservazione().map(c =>
      `<option value="${c.code}" ${attuale === c.code ? 'selected' : ''}>${this._esc(c.label)}</option>`
    ).join('');
    const caselle = Store.getAllergeniAmmessi().map(a =>
      `<label class="all-chip ${scelti.has(a.code) ? 'on' : ''}" ${a.fissa ? '' : 'title="Voce aziendale, aggiunta in Impostazioni"'}>
        <input type="checkbox" id="${p}All_${a.code}" value="${a.code}" ${scelti.has(a.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(a.label)}${a.fissa ? '' : ' •'}</label>`
    ).join('');
    /* La pericolosità dice dove una cosa NON si può mettere, ed è la metà
       d'articolo della spunta sulla zona. Nasce configurabile per intero:
       non è una norma di etichettatura, è una politica di magazzino. */
    const pericoli = Store.getPericoli();
    const periScelti = new Set(art?.hazards || []);
    const pericolose = pericoli.length ? pericoli.map(h =>
      `<label class="all-chip ${periScelti.has(h.code) ? 'on' : ''}">
        <input type="checkbox" id="${p}Haz_${h.code}" value="${h.code}" ${periScelti.has(h.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(h.label)}</label>`
    ).join('') : '';
    /* 1.4.0 — le certificazioni non sono un vincolo di stoccaggio: sono un
       fatto che deve arrivare fino all'operatore e fino al DDT. Stessa
       maschera degli allergeni perche' si compilano nello stesso momento. */
    const certScelte = new Set(art?.certifications || []);
    const certificati = CERTIFICAZIONI.map(c =>
      `<label class="all-chip ${certScelte.has(c.code) ? 'on' : ''}">
        <input type="checkbox" id="${p}Cert_${c.code}" value="${c.code}" ${certScelte.has(c.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(c.label)}</label>`
    ).join('');
    return `
      <div class="form-group" style="margin-bottom:0.5rem"><label>Classe di conservazione</label>
        <select class="input" id="${p}TempClass">
          <option value="">— non classificato —</option>${opzioni}
        </select></div>
      <div class="form-group" style="margin-bottom:0.3rem"><label>Allergeni (Reg. UE 1169/2011, più le voci aziendali •)</label>
        <div class="all-grid">${caselle}</div></div>
      ${pericolose ? `<div class="form-group" style="margin-bottom:0.3rem"><label>Pericolosità</label>
        <div class="all-grid">${pericolose}</div></div>` : ''}
      <div class="form-group" style="margin-bottom:0.3rem"><label>Certificazioni</label>
        <div class="all-grid">${certificati}</div></div>
      <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.6rem">
        🧭 Con questi la <strong>mappa</strong> segnala la merce fuori posto, e prelievo e DDT
        avvisano l'operatore. Lasciati vuoti, l'articolo non viene verificato.
      </div>`;
  },

  _leggiAttributiArticolo(p) {
    const cls = document.getElementById(`${p}TempClass`)?.value || '';
    const allergens = Store.getAllergeniAmmessi()
      .filter(a => document.getElementById(`${p}All_${a.code}`)?.checked)
      .map(a => a.code);
    const hazards = Store.getPericoli()
      .filter(h => document.getElementById(`${p}Haz_${h.code}`)?.checked)
      .map(h => h.code);
    /* Nessuna casella spuntata qui vuol dire NON CLASSIFICATO, non «verificato,
       non ne ha»: da una maschera non si distingue chi ha guardato da chi e'
       passato oltre. Per dichiarare l'assenza c'e' NESSUNO nella colonna del
       foglio Excel, che qualcuno ha dovuto scrivere apposta.
       null cancella una classificazione messa per sbaglio. */
    const certifications = CERTIFICAZIONI
      .filter(c => document.getElementById(`${p}Cert_${c.code}`)?.checked)
      .map(c => c.code);
    return {
      temp_class: cls || null,
      allergens: allergens.length ? allergens : null,
      hazards: hazards.length ? hazards : null,
      certifications: certifications.length ? certifications : null,
    };
  },

  showEditArticleModal(code) {
    const art = Store.getArticle(code);
    if (!art) return;
    this.showModal(`Modifica Articolo — ${code}`, `
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Codice (non mod.)</label>
          <input class="input input-mono" value="${this._esc(code)}" disabled></div>
        <div class="form-group"><label>Categoria</label>
          <input class="input input-mono" id="eaCategory" value="${this._esc(art.category || 'MP')}" maxlength="5" style="text-transform:uppercase"></div>
      </div>
      <div class="form-group" style="margin-bottom:0.6rem"><label>Descrizione <span class="req">*</span></label>
        <input class="input" id="eaDesc" value="${this._esc(art.description)}" maxlength="${Validate.MAX.ARTICLE_DESC}"></div>
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Fornitore / Cliente</label>
          <input class="input" id="eaSupplier" value="${this._esc(art.supplier || '')}" maxlength="80"></div>
        <div class="form-group"><label>UM</label>
          <input class="input input-mono" id="eaUnit" value="${this._esc(art.unit || 'PZ')}" maxlength="5" style="text-transform:uppercase"
            list="umAmmesse" oninput="App._aggiornaNotaUM('ea')"></div>
      </div>
      ${this._datalistUM()}
      <!-- 1.6 — i due pesi sono usciti, D15: non sono dati che il magazzino gestisce -->
      <div class="form-row-3" style="margin-bottom:0.3rem">
        <div class="form-group"><label>Quantità per collo (UM)</label><input class="input" id="eaPiecesPack" type="number" step="0.001" min="0" value="${art.pieces_per_pack || 0}" oninput="App._aggiornaNotaUM('ea')"></div>
        <div class="form-group"><label>Stock Min</label><input class="input" id="eaMinStock" type="number" step="1" min="0" value="${art.min_stock || 0}"></div>
        <div class="form-group"><label>Stock Max</label><input class="input" id="eaMaxStock" type="number" step="1" min="0" value="${art.max_stock || 0}"></div>
      </div>
      <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.6rem">
        📄 La quantità per collo è la riga che decide se l'articolo è gestito a unità di misura. A zero, resta a soli colli.
      </div>
      ${this._notaUM('ea')}
      ${this._campiAttributiArticolo(art, 'ea')}
      <div class="form-group"><label>Note</label>
        <input class="input" id="eaNotes" value="${this._esc(art.notes || '')}" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doEditArticle('${this._esc(code)}')">Salva</button>`);
    this._aggiornaNotaUM('ea');   // vedi showAddArticleModal
  },

  async doEditArticle(code) {
    const desc = Validate.clean(document.getElementById('eaDesc').value);
    const cat = Validate.clean(document.getElementById('eaCategory').value, true) || 'MP';
    const errs = [Validate.articleDesc(desc, true), Validate.category(cat)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    await Store.updateArticle(code, {
      description: desc, category: cat,
      supplier: Validate.clean(document.getElementById('eaSupplier').value),
      unit: Validate.clean(document.getElementById('eaUnit').value, true) || 'PZ',
      pieces_per_pack: document.getElementById('eaPiecesPack').value,    // v3.0.0 [M4]
      min_stock: document.getElementById('eaMinStock').value,
      max_stock: document.getElementById('eaMaxStock').value,
      notes: Validate.clean(document.getElementById('eaNotes').value),
      ...this._leggiAttributiArticolo('ea')
    });
    this.closeModal();
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ ${code} aggiornato`, 'success');
  },

  async confirmDeleteArticle(code) {
    /* v2.2.1 [F2] — migrato da confirm() nativo a Dialog (anti-scanner) */
    if (!await Dialog.confirm({
      title: 'Eliminare l\u2019articolo dall\u2019anagrafica?',
      message: 'Gli item già posizionati non saranno toccati.',
      details: Dialog.kv([['Articolo', code]]),
      confirmLabel: 'Elimina articolo', danger: true
    })) return;
    await Store.deleteArticle(code);
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`Articolo ${code} eliminato`, 'success');
  },

  async purgeOldLogsManual() {
    if (!this._requireOperator('la purge del registro')) return;   // v2.0.1 [B7]
    const cutoffTs = Date.now() - LOG_RETENTION_MS;
    const cutoffLabel = new Date(cutoffTs).toLocaleDateString('it-IT');
    let count = 0;
    try {
      count = await Store.countPurgeableMovements(cutoffTs);
    } catch (err) {
      return this.toast(`Errore nel conteggio: ${err.message || 'sconosciuto'}`, 'error');
    }
    if (count === 0) {
      return this.toast(`Nessun movimento antecedente al ${cutoffLabel} — niente da eliminare`, 'info');
    }

    // Step 1 — export obbligatorio
    // v2.2.1 [F2] — migrato da confirm() nativo a Dialog (anti-scanner)
    if (!await Dialog.confirm({
      title: 'Purge manuale registro storico',
      message: 'I record di NON CONFORMITÀ non verranno toccati. Prima di procedere verrà scaricato un export JSON completo.',
      details: Dialog.kv([
        ['Movimenti antecedenti al', cutoffLabel],
        ['Record da eliminare', count],
        ['Soglia di conservazione', `${LOG_RETENTION_DAYS} giorni`]
      ]),
      confirmLabel: 'Continua con l\u2019export', danger: true, icon: '\u{1F5C4}'
    })) return;

    try {
      await this.exportData();
    } catch (err) {
      return this.toast(`Export preventivo fallito: ${err.message || 'sconosciuto'} — purge annullata`, 'error');
    }

    // Step 2 — conferma esplicita digitata
    // v2.2.1 [F2] — migrato da prompt() nativo a _promptText (dialogo interno)
    const typed = await this._promptText({
      title: 'Conferma definitiva purge',
      message: `Export completato: verificare che il file sia stato scaricato e archiviato. ` +
        `Stai per eliminare DEFINITIVAMENTE ${count} movimenti antecedenti al ${cutoffLabel}. ` +
        `L\u2019operazione non è reversibile. Per confermare digita: ELIMINA`,
      placeholder: 'Digita ELIMINA per confermare',
      maxlength: 10
    });
    if (typed === null) return;
    if (Validate.clean(typed, true) !== 'ELIMINA') {
      return this.toast('Conferma non corretta — purge annullata, nessun record eliminato', 'warning');
    }

    // Step 3 — esecuzione + registrazione a log
    try {
      const removed = await Store.purgeMovementsBefore(cutoffTs);
      await this._logMov(
        MOV.PURGE, '', '', '', '', null, Store.getCurrentIdentity().initials,
        `Purge manuale registro: ${removed} movimenti antecedenti al ${cutoffLabel} eliminati previo export JSON`,
        `PURGE-${new Date().toISOString().slice(0, 10)}`
      );
      this.toast(`🗄 Purge completata: ${removed} movimenti eliminati · operazione registrata a log`, 'success');
      this.updateSyncIndicator();
      this.renderConfig();
    } catch (err) {
      this.toast(`Errore durante la purge: ${err.message || 'sconosciuto'}`, 'error');
    }
  },

  async exportData() {
    const data = await Store.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-mapper-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await Store.markSaved();
    this.updateSyncIndicator();
    this.toast('✓ Backup JSON esportato', 'success');
  },

  importData() { document.getElementById('fileImport').click(); },

  async forceSave() {
    const btn = event?.target?.closest('button');
    const originalLabel = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Salvataggio…'; }
    try {
      await this._saveCheckpoint();
    } finally {
      if (btn && originalLabel) { btn.disabled = false; btn.innerHTML = originalLabel; }
    }
  },

  /* Checkpoint condiviso. Rilancia l'errore: chi chiama decide come vestirlo. */
  async _saveCheckpoint() {
    try {
      const result = await Store.forceSave();
      const ts = new Date(result.ts).toLocaleString('it-IT');
      const total = Object.values(result.counts).reduce((s, n) => s + n, 0);
      this.updateSyncIndicator();
      if (this.currentView === 'dashboard') this.renderDashboard();
      else if (this.currentView === 'config' && this._configTab === 'data') this.renderConfig();

      if (result.divergenze?.length) {
        const elenco = result.divergenze
          .map(d => `  • ${d.collection}: ${d.memoria} in memoria, ${d.disco} nel database`)
          .join('\n');
        await Dialog.confirm({
          title: '⚠ Disallineamento rilevato e corretto',
          message: 'Il controllo ha trovato una differenza fra i dati in memoria e quelli scritti nel database. ' +
                   'La memoria è stata riallineata al database, che è la copia che sopravvive al riavvio.\n\n' +
                   elenco + '\n\nSe la differenza riguarda giacenze o movimenti, verificare l’ultima operazione eseguita.',
          confirmLabel: 'Ho capito'
        });
      } else {
        this.toast(`✓ Salvataggio verificato — ${total.toLocaleString('it-IT')} record · ${ts}`, 'success');
      }
      return result;
    } catch (err) {
      console.error('[WM] forceSave error:', err);
      this.toast(`Errore salvataggio: ${err.message}`, 'error');
      throw err;
    }
  },

  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const check = Store.verifyExportPackage(data);
      if (!check.ok) {
        const proceed = await Dialog.confirm({
          title: '⚠ Il file presenta anomalie',
          message: 'La verifica preliminare ha segnalato quanto segue:\n\n' +
                   check.problemi.map(p => '  • ' + p).join('\n') +
                   '\n\nProseguire solo se si è certi della provenienza del file.',
          details: Dialog.kv([['File', file.name], ['Dimensione', `${(file.size/1024).toFixed(0)} KB`]]),
          confirmLabel: 'Prosegui comunque', danger: true
        });
        if (proceed !== true) { this.toast('Import annullato', 'info'); event.target.value = ''; return; }
      }

      const destinazioneVuota = Store.getSites().length === 0
                             && Store.getInventoryCount() === 0
                             && Store.getOperators().length === 0
                             && Store.getMovLogTotal() === 0;

      const NON_PORTATE = 'registro movimenti, quarantene, DDT, verbali, report di prelievo, anagrafica operatori (PIN compresi) e dati del mittente';
      const contenuto = Object.entries(Store._countsOf(data))
        .filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(' · ') || 'nessun record';

      let mode = null;
      if (destinazioneVuota) {
        const scelta = await Dialog.confirm({
          title: 'Importa in un database vuoto',
          message: 'Questo database non contiene ancora nulla: si tratta di una migrazione o di un ripristino.\n\n' +
                   'L’importazione COMPLETA porta tutto il contenuto del file. Non cancella niente, perché non c’è niente da cancellare.\n\n' +
                   `Il merge, qui, porterebbe solo siti, zone, articoli e giacenze: resterebbero fuori ${NON_PORTATE}. ` +
                   'Senza operatori nessuno potrebbe entrare né registrare movimenti.',
          details: Dialog.kv([['File', file.name], ['Contenuto', contenuto]]),
          confirmLabel: 'Importa TUTTO', cancelLabel: 'Altre opzioni…', icon: '\u{1F4E5}'
        });
        if (scelta === true) {
          mode = 'overwrite';
        } else if (scelta === false) {
          if (await Dialog.confirm({
            title: 'Importare solo una parte?',
            message: 'Verranno importati solo siti, zone, articoli e giacenze.\n\n' +
                     `Resteranno fuori: ${NON_PORTATE}.`,
            confirmLabel: 'Importa solo in MERGE', danger: true
          }) === true) mode = 'merge';
        }
      } else {
        const mergeChoice = await Dialog.confirm({
          title: 'Importa dati da JSON',
          message: 'Modalità MERGE (consigliata su un database già in uso): aggiunge solo siti, zone, articoli e giacenze non già presenti, senza toccare i dati esistenti.\n\n' +
                   `Il merge NON importa ${NON_PORTATE}. Per portare tutto il contenuto del file scegliere «Altre opzioni».`,
          details: Dialog.kv([['File', file.name], ['Contenuto', contenuto]]),
          confirmLabel: 'Importa in MERGE', cancelLabel: 'Altre opzioni…', icon: '\u{1F4E5}'
        });
        if (mergeChoice === true) {
          mode = 'merge';
        } else if (mergeChoice === false) {
          if (await Dialog.confirm({
            title: 'Sovrascrivere il database?',
            message: 'Tutti i dati attuali (siti, zone, articoli, giacenze, movimenti, quarantene, DDT pendenti) saranno eliminati e sostituiti con il contenuto del file. Operazione irreversibile.',
            confirmLabel: 'SOVRASCRIVI tutto', danger: true
          }) === true) mode = 'overwrite';
        }
      }
      if (mode) {
        await Store.importAll(data, mode);
        this.currentSite = null; this.currentZone = null;
        this.renderSidebar(); this.renderDashboard(); this.renderConfig();
        this.updateSyncIndicator();
        this.toast(`✓ Dati importati (${mode})`, 'success');
      }
    } catch (err) {
      this.toast(`Errore import: ${err.message}`, 'error');
    }
    event.target.value = '';
  },

  /* Export Registro Movimenti completo in Excel (4 fogli) */
  async exportMovLogExcel() {
    const XLSX = await caricaExcel();
    const totale = Store.getMovLogTotal();
    if (!totale) return this.toast('Nessuna movimentazione da esportare', 'error');
    if (totale > 100000 && !await Dialog.confirm({
      title: 'Export di grandi dimensioni',
      message: `L’archivio contiene ${totale.toLocaleString('it-IT')} movimenti. La generazione del file Excel può richiedere qualche minuto e occupare parecchia memoria.`,
      details: Dialog.kv([['Movimenti', totale.toLocaleString('it-IT')], ['Formato', 'XLSX, 4 fogli']]),
      confirmLabel: 'Procedi'
    })) return;

    this.toast(`Lettura di ${totale.toLocaleString('it-IT')} movimenti dall’archivio…`, 'info');
    const log = [];
    await Store.eachMovement(rows => { for (const r of rows) log.push(r); });
    log.sort((a, b) => b.ts - a.ts);
    if (!log.length) return this.toast('Nessuna movimentazione da esportare', 'error');

    const headers = ['#', 'Tipo', 'Codice', 'Descrizione', 'Lotto', 'Ubicazione', 'Destinazione', 'Coll. Prima', 'Delta', 'Coll. Dopo', 'Operatore', 'Ordine/Doc', 'Note', 'Data', 'Ora'];
    const rows = log.map((m, i) => {
      const ts = m.ts ? new Date(m.ts) : null;
      // v1.7.0 — colonne qty: null per movimenti pre-v1.7.0 (storici)
      const qBefore = (typeof m.qty_before === 'number') ? m.qty_before : '';
      const qDelta  = (typeof m.qty_delta  === 'number') ? m.qty_delta  : '';
      const qAfter  = (typeof m.qty_after  === 'number') ? m.qty_after  : '';
      return [
        i+1, MOV_LABELS[m.type] || m.type,
        m.article_code || '', m.article_description || '', m.lot_code || '',
        m.location_code || '', m.dest_location || '',
        qBefore, qDelta, qAfter,
        m.user || '', m.doc_ref || '', m.notes || '',
        ts ? ts.toLocaleDateString('it-IT') : '', ts ? ts.toLocaleTimeString('it-IT') : ''
      ];
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{wch:5},{wch:20},{wch:18},{wch:32},{wch:15},{wch:18},{wch:18},{wch:10},{wch:8},{wch:10},{wch:16},{wch:14},{wch:20},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, 'Registro');

    // Foglio 2 — Riepilogo per tipo
    const typeSum = {};
    for (const m of log) typeSum[m.type] = (typeSum[m.type] || 0) + 1;
    const sumRows = [['Tipo', 'Quantità', '% Totale']];
    for (const [t, c] of Object.entries(typeSum).sort((a,b)=>b[1]-a[1])) sumRows.push([MOV_LABELS[t] || t, c, Math.round(c/log.length*100)+'%']);
    sumRows.push(['TOTALE', log.length, '100%']);
    const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
    ws2['!cols'] = [{wch:24},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo Tipo');

    // Foglio 3 — Riepilogo giornaliero
    const daily = {};
    for (const m of log) {
      const d = m.ts ? new Date(m.ts).toISOString().slice(0,10) : 'N/A';
      if (!daily[d]) daily[d] = { tot:0, IN:0, OUT:0, MOVE:0, PICK:0, REPOS:0, FIX:0, QUAR:0, RET:0, SHIP:0, EDIT:0 };
      daily[d].tot++;
      const k = m.type === 'FIX+' || m.type === 'FIX-' ? 'FIX' : (m.type === 'QREL' ? 'QUAR' : m.type);
      daily[d][k] = (daily[d][k] || 0) + 1;
    }
    // v2.0 — colonne RET, SHIP, EDIT aggiunte al riepilogo giornaliero
    const dRows = [['Data','Totale','Posizionamenti','Smaltimenti','Cambi','Prelievi','Riposizion.','Correzioni','Quarantene','Resi','Spedizioni','Modifiche']];
    for (const [d, v] of Object.entries(daily).sort()) {
      dRows.push([d !== 'N/A' ? new Date(d).toLocaleDateString('it-IT') : d, v.tot, v.IN, v.OUT, v.MOVE, v.PICK, v.REPOS, v.FIX, v.QUAR, v.RET || 0, v.SHIP || 0, v.EDIT || 0]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(dRows);
    ws3['!cols'] = [{wch:14},{wch:8},{wch:16},{wch:14},{wch:10},{wch:10},{wch:14},{wch:12},{wch:12},{wch:8},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws3, 'Riepilogo Giornaliero');

    // Foglio 4 — Top articoli
    const artFreq = {};
    for (const m of log) {
      if (!m.article_code) continue;
      if (!artFreq[m.article_code]) artFreq[m.article_code] = { desc: m.article_description || '', count: 0, last: m.ts };
      artFreq[m.article_code].count++;
      if (m.ts > artFreq[m.article_code].last) { artFreq[m.article_code].last = m.ts; if (m.article_description) artFreq[m.article_code].desc = m.article_description; }
    }
    const tRows = [['Rank','Codice','Descrizione','N° Movimenti','Ultima Movimentazione']];
    Object.entries(artFreq).sort((a,b) => b[1].count - a[1].count).forEach(([c, v], i) => {
      tRows.push([i+1, c, v.desc, v.count, v.last ? new Date(v.last).toLocaleDateString('it-IT') : '']);
    });
    const ws4 = XLSX.utils.aoa_to_sheet(tRows);
    ws4['!cols'] = [{wch:6},{wch:20},{wch:32},{wch:16},{wch:22}];
    XLSX.utils.book_append_sheet(wb, ws4, 'Top Articoli');

    const fn = `registro-movimentazioni-${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fn);
    this.toast(`📊 Esportato: ${fn} (${log.length} record, 4 fogli)`, 'success');
  },

  async exportGiacenzeExcel() {
    const XLSX = await caricaExcel();
    const inventory = Store.getInventorySnapshot();
    if (!inventory.length) return this.toast('Nessuna giacenza da esportare', 'warning');

    const sites = Store.getSites();
    const siteByCode = {};
    const zoneByLoc = {};   // location_code → { siteId, siteName, zoneId, zoneName }
    sites.forEach(s => {
      siteByCode[s.id] = s;
      (s.zones || []).forEach(z => {
        // Ricostruisco i prefissi delle ubicazioni della zona
        const locs = Store.generateLocations(s.id, z.id);
        locs.forEach(l => {
          zoneByLoc[l.code] = { siteId: s.id, siteName: s.name, zoneId: z.id, zoneName: z.name };
        });
      });
    });

    // Per ogni item, risolvi site/zone dall'index
    const enriched = inventory.map(it => {
      const meta = zoneByLoc[it.location_code] || { siteId: '?', siteName: '— Non mappata —', zoneId: '?', zoneName: '— Non mappata —' };
      const qty = it.qty || 1;
      const placedAt = it.placed_at ? new Date(it.placed_at) : null;
      const lastUpd = it.last_updated_at ? new Date(it.last_updated_at) : null;
      return {
        siteId: meta.siteId, siteName: meta.siteName, zoneId: meta.zoneId, zoneName: meta.zoneName,
        location_code: it.location_code,
        article_code: it.article_code,
        article_description: it.article_description || '',
        lot_code: it.lot_code,
        qty,
        expiry_date: it.expiry_date || '',
        notes: it.notes || '',
        placed_at_str: placedAt ? placedAt.toLocaleDateString('it-IT') : '',
        last_updated_str: lastUpd ? lastUpd.toLocaleDateString('it-IT') : '',
        placed_by: it.placed_by || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const headers = ['Site', 'Zona', 'Ubicazione', 'Articolo', 'Descrizione', 'Lotto', 'Coll.', 'Scadenza', 'Posizionato il', 'Ultimo agg.', 'Operatore', 'Note'];
    const colWidths = [{wch:18},{wch:18},{wch:18},{wch:18},{wch:32},{wch:15},{wch:8},{wch:12},{wch:14},{wch:14},{wch:16},{wch:25}];
    const rowOf = e => [e.siteName, e.zoneName, e.location_code, e.article_code, e.article_description, e.lot_code, e.qty, e.expiry_date, e.placed_at_str, e.last_updated_str, e.placed_by, e.notes];

    // FOGLIO 1 — Riepilogo per Site
    const siteSummary = {};
    enriched.forEach(e => {
      if (!siteSummary[e.siteName]) siteSummary[e.siteName] = { lotti: 0, colli: 0, articoli: new Set(), ubicazioni: new Set() };
      const s = siteSummary[e.siteName];
      s.lotti++;
      s.colli += e.qty;
      s.articoli.add(e.article_code);
      s.ubicazioni.add(e.location_code);
    });
    const sumRows = [['Site', 'N° Lotti', 'Colli Totali', 'Articoli Univoci', 'Ubicazioni Occupate']];
    let totLotti = 0, totColli = 0;
    Object.entries(siteSummary).sort().forEach(([name, s]) => {
      sumRows.push([name, s.lotti, s.colli, s.articoli.size, s.ubicazioni.size]);
      totLotti += s.lotti; totColli += s.colli;
    });
    sumRows.push(['TOTALE GENERALE', totLotti, totColli, '', '']);
    const wsSum = XLSX.utils.aoa_to_sheet(sumRows);
    wsSum['!cols'] = [{wch:24},{wch:12},{wch:14},{wch:18},{wch:20}];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Riepilogo');

    // FOGLIO 2 — Tutto Flat (per filtri Excel nativi)
    const allSorted = enriched.slice().sort((a,b) => {
      if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName);
      if (a.zoneName !== b.zoneName) return a.zoneName.localeCompare(b.zoneName);
      if (a.location_code !== b.location_code) return a.location_code.localeCompare(b.location_code);
      return a.article_code.localeCompare(b.article_code);
    });
    const wsAll = XLSX.utils.aoa_to_sheet([headers, ...allSorted.map(rowOf)]);
    wsAll['!cols'] = colWidths;
    wsAll['!autofilter'] = { ref: `A1:L${allSorted.length + 1}` };
    XLSX.utils.book_append_sheet(wb, wsAll, 'Tutte le Giacenze');

    // FOGLI 3..N — uno per Site
    const bySite = {};
    enriched.forEach(e => { (bySite[e.siteName] ||= []).push(e); });
    Object.entries(bySite).sort().forEach(([siteName, list]) => {
      list.sort((a,b) => {
        if (a.zoneName !== b.zoneName) return a.zoneName.localeCompare(b.zoneName);
        if (a.location_code !== b.location_code) return a.location_code.localeCompare(b.location_code);
        return a.article_code.localeCompare(b.article_code);
      });
      const ws = XLSX.utils.aoa_to_sheet([headers, ...list.map(rowOf)]);
      ws['!cols'] = colWidths;
      ws['!autofilter'] = { ref: `A1:L${list.length + 1}` };
      // Excel limita nomi foglio a 31 char e vieta certi caratteri
      const sheetName = siteName.replace(/[\\/?*\[\]:]/g, '').slice(0, 31) || 'Site';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // FOGLIO FINALE — Pivot Articoli (somma colli per articolo trasversale)
    const byArt = {};
    enriched.forEach(e => {
      if (!byArt[e.article_code]) byArt[e.article_code] = { desc: e.article_description, totColli: 0, lotti: new Set(), ubicazioni: new Set(), siti: new Set() };
      const a = byArt[e.article_code];
      a.totColli += e.qty;
      a.lotti.add(e.lot_code);
      a.ubicazioni.add(e.location_code);
      a.siti.add(e.siteName);
    });
    const pivotRows = [['Articolo', 'Descrizione', 'Colli Totali', 'N° Lotti', 'N° Ubicazioni', 'Site Coinvolti']];
    Object.entries(byArt).sort((a,b) => b[1].totColli - a[1].totColli).forEach(([code, a]) => {
      pivotRows.push([code, a.desc, a.totColli, a.lotti.size, a.ubicazioni.size, [...a.siti].join(', ')]);
    });
    const wsPivot = XLSX.utils.aoa_to_sheet(pivotRows);
    wsPivot['!cols'] = [{wch:18},{wch:34},{wch:14},{wch:10},{wch:14},{wch:30}];
    XLSX.utils.book_append_sheet(wb, wsPivot, 'Pivot Articoli');

    const fn = `giacenze-${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fn);
    this.toast(`📊 Esportato: ${fn} (${enriched.length} righe, ${Object.keys(bySite).length + 3} fogli)`, 'success');
  },

  importArticlesExcel() { document.getElementById('fileImportExcel').click(); },

  /* 1.4.0 — L'import legge SOLO le colonne che il foglio porta davvero, e
     aggiorna gli articoli che gia' esistono invece di saltarli.

     Prima non lo faceva: `addArticle` esce con false su un codice noto, e su
     un'anagrafica gia' popolata l'import diceva «importati 0» senza spiegare
     perche'. Chi arricchisce 11.000 articoli con due colonne nuove ha bisogno
     esattamente del contrario. */
  async handleImportExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const XLSX = await caricaExcel();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: undefined });
      const letto = this._leggiFoglioArticoli(rows);
      if (!letto.righe.length && !letto.problemi.length) {
        return this.toast('Il foglio non contiene articoli leggibili', 'warning');
      }
      if (!await this._confermaImportArticoli(letto)) return;
      const esito = await Store.upsertArticles(letto.righe);
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`✓ ${esito.creati} creati · ${esito.modificati} aggiornati`,
        esito.creati + esito.modificati > 0 ? 'success' : 'info');
    } catch (err) { this.toast(`Errore Excel: ${err.message}`, 'error'); }
    event.target.value = '';
  },

  /* Dal foglio alle righe da scrivere. Nessuna scrittura qui dentro: legge,
     valida e racconta. Le colonne assenti restano `undefined`, che a valle
     significa «non toccare», non «azzera». */
  _leggiFoglioArticoli(rows) {
    const righe = [];
    const problemi = [];
    let senzaCodice = 0;
    const nuoviCodici = new Set();
    let conAllergeni = 0, conTemperatura = 0, conCertificazioni = 0;

    rows.forEach((row, i) => {
      const foglio = i + 2;                      // +1 intestazione, +1 base uno
      const code = Validate.clean(row['Codice'], true);
      if (!code) { senzaCodice++; return; }
      const errCode = Validate.article(code);
      if (errCode) { problemi.push(`Riga ${foglio} — codice "${code}": ${errCode}`); return; }

      const esiste = !!Store.getArticle(code);
      const rec = { code };
      const testo = (col, campo, upper = false) => {
        if (row[col] === undefined) return;
        rec[campo] = Validate.clean(row[col], upper);
      };
      const numero = (col, campo) => { if (row[col] !== undefined) rec[campo] = row[col]; };

      testo('Descrizione', 'description');
      testo('Categoria', 'category', true);
      testo('Fornitore', 'supplier');
      testo('UM', 'unit', true);
      testo('Note', 'notes');
      numero('Peso', 'weight'); numero('Lunghezza', 'length');
      numero('Larghezza', 'width'); numero('Altezza', 'height');
      /* 1.6 — `Peso_Netto_Collo` non si legge piu': D15 lo toglie dai dati
         gestiti. Una colonna vecchia nel foglio non fa danno, viene ignorata. */
      numero('Pezzi_Per_Collo', 'pieces_per_pack');
      numero('Stock_Min', 'min_stock'); numero('Stock_Max', 'max_stock');

      if (rec.description !== undefined) {
        const errDesc = Validate.articleDesc(rec.description, !esiste);
        if (errDesc) { problemi.push(`Riga ${foglio} — ${code}: ${errDesc}`); return; }
      } else if (!esiste) {
        problemi.push(`Riga ${foglio} — ${code}: articolo nuovo senza descrizione`);
        return;
      }

      if (row['Temperatura'] !== undefined) {
        const cls = leggiClasseTemperatura(row['Temperatura']);
        if (cls === undefined) {
          problemi.push(`Riga ${foglio} — ${code}: temperatura "${row['Temperatura']}" non prevista. Ammessi: ${CLASSI_TEMPERATURA.map(c => c.code).join(', ')}`);
          return;
        }
        rec.temp_class = cls;
        if (cls) conTemperatura++;
      }

      if (row['Allergeni'] !== undefined) {
        /* Le voci aziendali passano insieme ai 14: chi le ha configurate se
           le aspetta in colonna, e un rifiuto qui sarebbe incomprensibile. */
        const { codici, scarti } = leggiAllergeni(row['Allergeni'], Store.getArticleParams().allergeni);
        if (scarti.length) {
          problemi.push(`Riga ${foglio} — ${code}: allergene non previsto ${scarti.map(s => `"${s}"`).join(', ')}`);
          return;
        }
        rec.allergens = codici;
        if (codici.length) conAllergeni++;
      }

      if (row['Pericolosita'] !== undefined) {
        const ammesse = Store.getPericoli();
        const { codici, scarti } = leggiCodici(row['Pericolosita'], ammesse);
        if (scarti.length) {
          problemi.push(`Riga ${foglio} — ${code}: pericolosità non prevista ${scarti.map(s => `"${s}"`).join(', ')}. Ammesse: ${ammesse.map(h => h.code).join(', ') || 'nessuna configurata'}`);
          return;
        }
        rec.hazards = codici;
      }

      if (row['Certificazioni'] !== undefined) {
        const { codici, scarti } = leggiCertificazioni(row['Certificazioni']);
        if (scarti.length) {
          problemi.push(`Riga ${foglio} — ${code}: certificazione non prevista ${scarti.map(s => `"${s}"`).join(', ')}. Ammesse: ${CERTIFICAZIONI.map(c => c.code).join(', ')}`);
          return;
        }
        rec.certifications = codici;
        if (codici.length) conCertificazioni++;
      }

      if (!esiste) nuoviCodici.add(code);
      righe.push(rec);
    });

    return { righe, problemi, senzaCodice, nuovi: nuoviCodici.size,
             conAllergeni, conTemperatura, conCertificazioni };
  },

  async _confermaImportArticoli(letto) {
    const aggiornati = letto.righe.length - letto.nuovi;
    const wrap = document.createElement('div');

    wrap.appendChild(Dialog.kv([
      ['Articoli nuovi da creare', letto.nuovi],
      ['Articoli esistenti da aggiornare', aggiornati],
      ['Con classe di temperatura', letto.conTemperatura],
      ['Con allergeni dichiarati', letto.conAllergeni],
      ['Con certificazioni dichiarate', letto.conCertificazioni],
      ['Righe senza codice, ignorate', letto.senzaCodice || ''],
    ]));

    if (letto.problemi.length) {
      /* Le righe con un problema NON vengono scritte: si vedono tutte prima,
         si corregge il foglio e si reimporta. Scriverne meta' e' peggio che
         non scriverne nessuna. */
      const box = document.createElement('div');
      box.className = 'dlg-problemi';
      const t = document.createElement('div');
      t.className = 'dlg-problemi-t';
      t.textContent = `${letto.problemi.length} righe NON verranno importate`;
      box.appendChild(t);
      const ul = document.createElement('ul');
      for (const p of letto.problemi.slice(0, 12)) {
        const li = document.createElement('li');
        li.textContent = p;
        ul.appendChild(li);
      }
      if (letto.problemi.length > 12) {
        const li = document.createElement('li');
        li.textContent = `… e altre ${letto.problemi.length - 12}`;
        ul.appendChild(li);
      }
      box.appendChild(ul);
      wrap.appendChild(box);
    }

    const nota = document.createElement('p');
    nota.className = 'dlg-nota';
    nota.textContent = 'Le colonne assenti dal foglio non vengono toccate: un file con '
      + 'solo Codice, Temperatura e Allergeni aggiorna quei due campi e lascia il resto com’è.'
      + ' Vale anche per Certificazioni.';
    wrap.appendChild(nota);

    /* Niente da scrivere e solo problemi: non e' una conferma, e' un referto. */
    if (!letto.righe.length) {
      await Dialog.alert({ title: 'Nessuna riga importabile', icon: '⚠', details: wrap });
      return false;
    }

    return Dialog.confirm({
      title: 'Importare l’anagrafica?',
      details: wrap,
      confirmLabel: `Importa ${letto.righe.length} righe`,
      danger: letto.problemi.length > 0,
    });
  },

  async exportArticlesExcel() {
    const articles = Store.getArticles();
    if (!articles.length) return this.toast('Nessun articolo da esportare', 'warning');
    const XLSX = await caricaExcel();
    const data = articles.map(a => ({
      'Codice': a.code, 'Descrizione': a.description, 'Categoria': a.category || '',
      'Fornitore': a.supplier || '', 'UM': a.unit || 'PZ',
      'Peso': a.weight || 0, 'Lunghezza': a.length || 0, 'Larghezza': a.width || 0, 'Altezza': a.height || 0,
      // v3.0.0 [M4] — i due valori che alimentano il DDT
      'Pezzi_Per_Collo': a.pieces_per_pack || 0,
      'Stock_Min': a.min_stock || 0, 'Stock_Max': a.max_stock || 0,
      // 1.4.0 — vuote finche' non le si compila: la cella vuota dice «non
      // classificato», che e' un'informazione e non va confusa con «nessuno».
      'Temperatura': a.temp_class || '', 'Allergeni': scriviAllergeni(a.allergens),
      'Pericolosita': scriviAllergeni(a.hazards),
      'Certificazioni': scriviCertificazioni(a.certifications),
      'Note': a.notes || ''
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Articoli');
    /* Il secondo foglio e' la sorgente degli elenchi a discesa: la convalida
       di Excel si costruisce puntando qui, e resta allineata al codice. */
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      /* 1.4.2 — le cinque unita' entrano nello stesso foglio, sulla colonna
         `UM` che l'export ha da sempre: non ce n'e' una seconda. Ogni modulo
         porta i propri valori, e il foglio li mette in fila. */
      /* 1.6 — e con loro i valori CONFIGURATI, che senza questa riga
         verrebbero rifiutati dalla convalida che il foglio stesso genera:
         l'anagrafica li offre in tendina e l'import li accetta. */
      [...fogliValoriAmmessi(), ...valoriAmmessiUM(),
       ...Store.getArticleParams().allergeni.map(v => ({
         colonna: 'Allergeni', valore: v.code, significato: `${v.label} — voce aziendale` })),
       ...Store.getArticleParams().conservazione.map(v => ({
         colonna: 'Temperatura', valore: v.code, significato: `${v.label} — voce aziendale` })),
       ...Store.getPericoli().map(v => ({
         colonna: 'Pericolosita', valore: v.code, significato: v.label })),
       { colonna: 'Pericolosita', valore: 'NESSUNO', significato: 'Verificato: non pericoloso' }]
        .map(v => ({ 'Colonna': v.colonna, 'Valore': v.valore, 'Significato': v.significato }))
    ), 'Valori ammessi');
    XLSX.writeFile(wb, `anagrafica-articoli-${new Date().toISOString().slice(0,10)}.xlsx`);
    this.toast('✓ Excel esportato — foglio «Valori ammessi» per la convalida', 'success');
  },

  async importArticlesCSV() {
    const raw = Validate.clean(document.getElementById('csvImportArea')?.value);
    if (!raw) return this.toast('Inserisci dati CSV', 'error');
    const lines = raw.split('\n').filter(Boolean);
    let count = 0, skipped = 0;
    for (const line of lines) {
      const [code, desc, cat] = line.split(';').map(s => (s || '').trim());
      const c = Validate.clean(code, true);
      const d = Validate.clean(desc);
      if (!c || !d || Validate.article(c) || Validate.articleDesc(d, true)) { skipped++; continue; }
      const ok = await Store.addArticle({ code: c, description: d, category: Validate.clean(cat, true) || 'MP' });
      if (ok) count++;
    }
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`${count} importati (${skipped} scartati)`, count > 0 ? 'success' : 'warning');
  },

  async confirmResetData() {
    if (!await Dialog.confirm({
      title: '\u26A0 Reset completo database',
      message: 'Tutti i dati (siti, zone, articoli, inventario, movimenti, quarantene, DDT pendenti) saranno eliminati.',
      confirmLabel: 'Procedi', danger: true
    })) return;
    if (!await Dialog.confirm({
      title: 'Operazione irreversibile',
      message: 'È consigliato ESPORTARE un backup prima di continuare.',
      confirmLabel: 'Resetta tutto', danger: true
    })) return;
    await Store.resetAll();
    /* TODO F1-REVIEW: resetAll() ricostruisce gia' gli indici al proprio
       interno, quindi questo riallineamento e' ridondante. Mantenuto per non
       alterare il comportamento in questa fase. */
    await Store.reloadCache();
    this.currentSite = null; this.currentZone = null;
    this._movSessionLog = []; this._pickCart = []; this._moveSelection = null; this._invState = null; this._qState = null; this._qStage = 'search'; this._movMode = null;
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast('✓ Database resettato — configurare nuovi siti da Configurazione', 'info');
  },

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
for (const vista of [VistaDestinatari, VistaParametri, VistaCompiti, VistaCampionamento, VistaMovimenta, VistaPosiziona]) {
  for (const nome of Object.keys(vista)) {
    if (nome in App) throw new Error(`vista: ${nome} e' gia' in App`);
    App[nome] = vista[nome];
  }
}

export { App };
