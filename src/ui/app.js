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
for (const vista of [VistaDestinatari, VistaParametri, VistaCompiti, VistaCampionamento, VistaMovimenta, VistaPosiziona, VistaSmaltimento, VistaPrelievo, VistaPercorso, VistaRapportoPrelievo, VistaInventario, VistaQuarantena, VistaSpedizioni, VistaDocumento, VistaMappa, VistaGiacenze, VistaConfigOperatori, VistaConfigSiti, VistaConfigArticoli]) {
  for (const nome of Object.keys(vista)) {
    if (nome in App) throw new Error(`vista: ${nome} e' gia' in App`);
    App[nome] = vista[nome];
  }
}

export { App };
