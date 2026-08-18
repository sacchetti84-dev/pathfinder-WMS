import { type Vista, $ } from './vista';
import { MOV_LABELS } from '../../core/costanti';
import { Persistence } from '../../core/persistence/index';
import { Store } from '../../core/store';
import { ScanGuard } from '../../modules/scanGuard';
import { Dialog } from '../dialog.js';
import { Tabs } from '../tabs';

export const VistaMovimenta: Vista = {
  renderMovimenta() {
    const el = $('viewMovimenta');
    const logCount = this._movSessionLog.length;
    // v2.0 — conteggio DDT pendenti per badge sulle card
    const pendRes = Store.getPendingOutbound('RES').length;
    const pendShip = Store.getPendingOutbound('SHIP').length;
    el.innerHTML = `<div class="mov-container">
      <div class="mov-header">
        <div class="mov-header-icon">📦</div>
        <div class="mov-header-text">
          <h2>Movimentazione Magazzino</h2>
          <p class="text-body-small text-sx-text-secondary">Scansiona con lettore barcode · ${logCount ? `<span class="text-sx-success font-semibold">${logCount} operazioni in sessione</span>` : 'Nessuna operazione'}${(pendRes+pendShip) > 0 ? ` · <span class="text-sx-warning font-semibold">${pendRes+pendShip} DDT pendenti</span>` : ''}</p>
        </div>
      </div>
      <div class="mov-actions">
        ${this._movCard('io', 'c-green', '📦', 'Carico / Scarico', 'Posiziona e smaltisci · F2 / F6', 'var(--sx-success)')}
        ${this._movCard('pick', 'c-blue', '🏗️', 'Prelievo', 'Cambio ubicazione · Produzione · F3', 'var(--sx-accent)')}
        ${this._movCard('inv', 'c-amber', '📋', 'Inventario', 'Verifica e rettifica · F4', 'var(--sx-warning)')}
        ${this._movCard('quarantine', 'c-purple', '🚫', 'Quarantena', 'Blocco qualità · NC · F7', 'var(--sx-purple)', Store.getActiveQuarantine().length)}
        ${this._movCard('shipping', 'c-orange', '🚚', 'Spedizioni', 'DDT · Resi e spedizioni · F8', 'var(--sx-orange)', pendRes + pendShip)}
        ${/* 1.4.2.1 — l'ottava operazione, che prima non c'era. Compare con lo
             schedulatore perché è lui che l'ha fatta nascere; quanto cala lo
             decide `feature.uom`, dentro la maschera. */
          Store.isFeatureOn('tasks') ? this._movCard('sampling', 'c-teal', '🧪', 'Campionamento', 'Il collo resta, cala ciò che c\'è dentro', 'var(--sx-teal)') : ''}
      </div>
      <div id="undoBarArea">${this._undoBarHTML()}</div>
      <div id="taskRunBanner"></div>
      <div id="movFormArea"></div>
      <div id="movLogArea">${this._renderSessionLog()}</div>
    </div>`;
  },

  _movCard(mode, cls, icon, title, sub, color, badgeCount = 0) {
    const active = this._movMode === mode ? 'active' : '';
    // v2.1.0 — badge portato a dimensione leggibile e spostato su classe dedicata
    const badge = badgeCount > 0 ? `<span class="mov-badge" style="background:${color}">${badgeCount}</span>` : '';
    return `<div class="mov-action-card ${cls} ${active} relative" onclick="App.startMov('${mode}')">
      ${badge}
      <div class="mov-action-icon">${icon}</div>
      <h3 style="color:${color}">${title}</h3>
      <p>${sub}</p>
    </div>`;
  },

  startMov(mode, dir = null) {
    if (mode === 'in')  { dir = 'in';  mode = 'io'; }
    if (mode === 'out') { dir = 'out'; mode = 'io'; }
    if (mode === 'returns') mode = 'shipping';
    if (mode === 'io' && dir && dir !== this._ioMode) { this._ioMode = dir; this._dispReset(); }
    this._movMode = mode;
    document.querySelectorAll('.mov-action-card').forEach(c => c.classList.remove('active'));
    const map = { io: 'c-green', pick: 'c-blue', inv: 'c-amber', quarantine: 'c-purple', shipping: 'c-orange', sampling: 'c-teal' };
    document.querySelector(`.mov-action-card.${(map as any)[mode]}`)?.classList.add('active');
    const fa = $('movFormArea');
    const forms = { io: this._formCaricoScarico, pick: this._formPrelievo, inv: this._formInventario,
                    quarantine: this._formQuarantena, shipping: this._formSpedizioni, sampling: this._formCampionamento };
    (forms as any)[mode]?.call(this, fa);
  },

  cancelMov() {
    this._movMode = null;
    this.setPrimaryScanField(null);   // v2.1.0 — disattiva il focus keeper
    ScanGuard.clear();
    this._dispReset();                // v3.0.0 [M1] — verifica di scarico a metà: non sopravvive
    this._invState = null;
    this._pickCart = [];
    this._moveSelection = null;
    this._qState = null;
    this._qStage = 'search';          // v1.1.0 [N4] — tappa di quarantena a metà: non sopravvive
    this._campReset();                // 1.4.2.1 — e nemmeno un campione a metà
    this._shipResetHeader();
    /* 1.4.2.1 — chiudere la maschera senza aver confermato niente non e' una
       lavorazione: il compito torna in carico. Se invece qualcosa si e'
       mosso, `abandonTask` lo lascia dov'e' — decisione 46. */
    if (this._taskRun) this._taskAbbandona();
    /* 1.4.4 — la conta mirata è uno stato di lavorazione come gli altri: una
       verifica lasciata a metà non deve ricomparire alla riapertura. */
    this._contaState = null;
    const fa = $('movFormArea');
    if (fa) fa.innerHTML = '';
    document.querySelectorAll('.mov-action-card').forEach(c => c.classList.remove('active'));
  },

  async _logMov(type, art, desc, lot, loc, destLoc = null, user = '', notes = '', docRef = '', qtyBefore = null, qtyDelta = null, qtyAfter = null, qtyUomDelta = null) {
    const effectiveUser = user || Store.getCurrentIdentity().initials;
    /* 1.4.2 — l'unita' viene dal lotto, non dal chiamante: e' l'unico posto
       dove non puo' essere sbagliata, e i chiamanti sono trentotto. */
    const cfgMov = Store.getUomConfig(art, lot);
    const entry = {
      type, article_code: art, article_description: desc, lot_code: lot,
      location_code: loc, dest_location: destLoc, user: effectiveUser,
      notes, doc_ref: docRef, ts: Date.now(),
      qty_before: qtyBefore, qty_delta: qtyDelta, qty_after: qtyAfter,
      qty_uom_delta: typeof qtyUomDelta === 'number' ? qtyUomDelta : null,
      ...(cfgMov ? { uom: cfgMov.uom } : {})
    };
    this._movSessionLog.unshift(entry);
    if (this._movSessionLog.length > 100) this._movSessionLog.length = 100;
    try {
      const _id = await Store.logMovement(entry);
      /* 1.4.2.1 — se c'e' un compito avviato, questo movimento l'ha
         lavorato: l'identificativo si accumula qui e lo raccoglie
         `_taskAvanza`, che e' l'unico a sapere quanti colli si sono mossi. */
      if (this._taskRun && typeof _id === 'number') this._taskRun.movs.push(_id);
      return _id;
    } catch (err) {
      this._queueFailedMovement(entry, err);
      return null;
    }
  },

  _MOVQUEUE_KEY: 'wm_mov_recovery_queue',

  _queueFailedMovement(entry, err) {
    console.error('[WM] movimento NON registrato a log:', err, entry);
    let coda = [];
    try {
      coda = JSON.parse(localStorage.getItem(this._MOVQUEUE_KEY) || '[]');
      if (!Array.isArray(coda)) coda = [];
      coda.push({ ...entry, _failedAt: Date.now(), _error: String(err?.message || err) });
      localStorage.setItem(this._MOVQUEUE_KEY, JSON.stringify(coda));
    } catch (e2) {
      /* Anche localStorage e' pieno o disabilitato. Non resta che dirlo con
         la massima forza disponibile: il dato esiste solo a schermo. */
      console.error('[WM] coda di recupero non scrivibile:', e2);
    }
    const spazio = (Persistence as any).diskFull;
    Dialog.confirm({
      title: '⚠ MOVIMENTO NON REGISTRATO A REGISTRO',
      message: (spazio
        ? 'Lo spazio di archiviazione è esaurito. '
        : 'La scrittura nel database non è riuscita. ') +
        'L’operazione sulla giacenza È STATA ESEGUITA, ma non è stato possibile scriverla nel registro movimenti.\n\n' +
        `Il movimento è stato messo in una coda di recupero (${coda.length} in attesa) e verrà riscritto al prossimo avvio. ` +
        'Non spegnere il terminale prima di aver liberato spazio, e annotare l’operazione.',
      details: Dialog.kv([
        ['Tipo', (MOV_LABELS as any)[entry.type] || entry.type],
        ['Articolo', entry.article_code || '—'],
        ['Lotto', entry.lot_code || '—'],
        ['Ubicazione', entry.dest_location ? `${entry.location_code} → ${entry.dest_location}` : (entry.location_code || '—')],
        ['Operatore', entry.user || '—']
      ]),
      confirmLabel: 'Ho annotato', danger: true, icon: '⚠'
    });
    this._renderRecoveryBanner();
  },

  _onReadOnlyChange(readOnly) {
    let el = $('readonlyBanner');
    if (!readOnly) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'readonlyBanner';
      el.className = 'readonly-banner';
      document.body.appendChild(el);
    }
    el.innerHTML = `<span>👁 <strong>Sola lettura</strong> — l’applicativo è già aperto in un’altra finestra, che è quella che sta scrivendo. I dati qui possono non essere aggiornati.</span>
      <button class="btn btn-sm btn-warning" onclick="App.takeOverTab()">Lavora da qui</button>`;
  },

  async takeOverTab() {
    Tabs.takeOver();
    await Store.reloadCache();
    this._onReadOnlyChange(false);
    this.renderSidebar();
    if (this.currentView === 'dashboard') this.renderDashboard();
    else if (this.currentView === 'map') this.renderMap();
    else if (this.currentView === 'config') this.renderConfig();
    this.toast('Questa finestra è ora quella attiva — le altre passano in sola lettura', 'success');
  },

  /* Guardia da anteporre alle operazioni che scrivono. Non e' un controllo
     di sicurezza: e' un promemoria che evita l'errore piu' banale. */
  _blockedByReadOnly() {
    if (!Tabs.readOnly) return false;
    this.toast('Finestra in sola lettura: premi “Lavora da qui” nella fascia in basso per operare', 'warning');
    return true;
  },

  _recoveryQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(this._MOVQUEUE_KEY) || '[]');
      return Array.isArray(q) ? q : [];
    } catch { return []; }
  },

  /* Ritentativo all'avvio, prima di qualunque altra cosa: se la coda si
     svuota, la giornata comincia con un registro completo. */
  async _flushRecoveryQueue() {
    const coda = this._recoveryQueue();
    if (!coda.length) return;
    const rimasti = [];
    let scritti = 0;
    for (const entry of coda) {
      const { _failedAt, _error, ...rec } = entry;
      try {
        await Store.logMovement(rec);
        scritti++;
      } catch {
        rimasti.push(entry);
      }
    }
    try {
      if (rimasti.length) localStorage.setItem(this._MOVQUEUE_KEY, JSON.stringify(rimasti));
      else localStorage.removeItem(this._MOVQUEUE_KEY);
    } catch {}
    if (scritti) this.toast(`✓ ${scritti} movimento/i in attesa recuperato/i e scritto/i a registro`, 'success');
    if (rimasti.length) this.toast(`⚠ ${rimasti.length} movimento/i non ancora recuperabile/i — liberare spazio`, 'error');
    this._renderRecoveryBanner();
  },

  /* Fascia permanente finche' la coda non e' vuota. Non si chiude: il suo
     scopo e' essere fastidiosa. */
  _renderRecoveryBanner() {
    const n = this._recoveryQueue().length;
    let el = $('recoveryBanner');
    if (!n) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'recoveryBanner';
      el.className = 'recovery-banner';
      document.body.appendChild(el);
    }
    el.innerHTML = `<span>⚠ <strong>${n}</strong> movimento/i eseguito/i ma NON ancora scritto/i a registro.</span>
      <button class="btn btn-sm btn-warning" onclick="App._flushRecoveryQueue()">Riprova ora</button>
      <button class="btn btn-sm" onclick="App._showRecoveryQueue()">Vedi elenco</button>`;
  },

  _showRecoveryQueue() {
    const coda = this._recoveryQueue();
    if (!coda.length) return this.toast('Nessun movimento in attesa', 'info');
    const righe = coda.map((e: any) => `<tr>
      <td>${new Date(e._failedAt).toLocaleString('it-IT')}</td>
      <td>${this._esc((MOV_LABELS as any)[e.type] || e.type)}</td>
      <td class="mono">${this._esc(e.article_code || '—')}</td>
      <td class="mono">${this._esc(e.lot_code || '—')}</td>
      <td class="mono">${this._esc(e.dest_location ? `${e.location_code} → ${e.dest_location}` : (e.location_code || '—'))}</td>
      <td>${this._esc(e.user || '—')}</td>
    </tr>`).join('');
    this.showModal(
      `⚠ Movimenti in attesa di registrazione (${coda.length})`,
      `<p class="text-body-small text-sx-text-secondary mb-6">
        Queste operazioni <strong>sono state eseguite sulla giacenza</strong> ma non è stato possibile scriverle
        nel registro movimenti. Restano in coda e vengono ritentate a ogni avvio e a ogni click su “Riprova”.
      </p>
      <div class="overflow-x-auto max-h-[50vh]"><table class="sx-table">
        <thead><tr><th>Quando</th><th>Tipo</th><th>Articolo</th><th>Lotto</th><th>Ubicazione</th><th>Operatore</th></tr></thead>
        <tbody>${righe}</tbody></table></div>`,
      `<button class="btn" onclick="App.closeModal()">Chiudi</button>
       <button class="btn btn-warning" onclick="App.closeModal();App._flushRecoveryQueue()">Riprova ora</button>`
    );
  },

  _refreshSessionLog() {
    const el = $('movLogArea');
    if (el) el.innerHTML = this._renderSessionLog();
  },

  _renderSessionLog() {
    if (!this._movSessionLog.length) {
      return `<div class="mov-recent"><h3>📋 Registro Sessione
        <button class="btn btn-sm ml-auto text-label-small" onclick="App.exportMovLogExcel()">📊 Excel completo</button></h3>
        <div class="p-3 text-body-small text-sx-text-muted">Nessuna operazione in sessione</div></div>`;
    }
    const icons = {
      IN: { cls: 'mov-log-in', ico: '📦' },
      OUT: { cls: 'mov-log-out', ico: '🗑️' },
      MOVE: { cls: 'mov-log-move', ico: '🔄' },
      PICK: { cls: 'mov-log-out', ico: '🏭' },
      REPOS: { cls: 'mov-log-in', ico: '📦' },
      'FIX+': { cls: 'mov-log-fix', ico: '📋+' },
      'FIX-': { cls: 'mov-log-fix', ico: '📋−' },
      QUAR: { cls: 'mov-log-quar', ico: '🚫' },
      QREL: { cls: 'mov-log-in', ico: '✅' },
      EDIT: { cls: 'mov-log-fix', ico: '✏️' },         // v2.0
      RET: { cls: 'mov-log-out', ico: '↩️' },           // v2.0 — Reso ritirato (uscita)
      SHIP: { cls: 'mov-log-out', ico: '🚚' },          // v2.0 — Spedizione (uscita)
      PINRESET: { cls: 'mov-log-fix', ico: '🔑' }       // v2.7.0 [G6] — evento di audit, non merce
    };
    let html = `<div class="mov-recent"><h3>📋 Registro Sessione (${this._movSessionLog.length})
      <button class="btn btn-sm ml-auto text-label-small" onclick="App.exportMovLogExcel()">📊 Excel completo</button></h3>`;
    for (const m of this._movSessionLog.slice(0, 20)) {
      const c = (icons as any)[m.type] || icons.IN;
      const loc = (m.type === 'MOVE' || m.type === 'QUAR') && m.dest_location ? `${m.location_code} → ${m.dest_location}` : m.location_code;
      // v1.7.0: indicatore qty se presente
      let qtyInfo = '';
      if (typeof m.qty_delta === 'number' && m.qty_delta !== null) {
        const sign = m.qty_delta > 0 ? '+' : '';
        qtyInfo = ` · <strong>${sign}${m.qty_delta} Coll.</strong>`;
        if (typeof m.qty_after === 'number') qtyInfo += ` (saldo: ${m.qty_after})`;
      }
      html += `<div class="mov-log-item">
        <div class="mov-log-icon ${c.cls}">${c.ico}</div>
        <div class="mov-log-info">
          <div class="mov-log-primary">${this._esc((MOV_LABELS as any)[m.type] || m.type)} · ${this._esc(m.article_code)}${qtyInfo}</div>
          <div class="mov-log-secondary">L:${this._esc(m.lot_code)} · 📍${this._esc(loc)} · ${new Date(m.ts).toLocaleTimeString('it-IT')}</div>
        </div>
      </div>`;
    }
    html += '</div>';
    return html;
  },

  _formCaricoScarico(el) {
    const isOut = this._ioMode === 'out';
    el.innerHTML = `<div class="mov-form-card">
      <h3>📦 <span style="color:${isOut ? 'var(--sx-danger)' : 'var(--sx-success)'}">Carico / Scarico</span></h3>

      <div class="io-toggle" role="tablist" aria-label="Direzione del movimento">
        <button class="io-tab ${isOut ? '' : 'active'} io-tab--in" role="tab" aria-selected="${!isOut}"
          onclick="App._ioSwitch('in')">
          <span class="io-tab-sign">⊕</span>
          <span class="io-tab-txt"><b>CARICO</b><i>Posiziona a scaffale · F2</i></span>
        </button>
        <button class="io-tab ${isOut ? 'active' : ''} io-tab--out" role="tab" aria-selected="${isOut}"
          onclick="App._ioSwitch('out')">
          <span class="io-tab-sign">⊖</span>
          <span class="io-tab-txt"><b>SCARICO</b><i>Smaltisci · F6</i></span>
        </button>
      </div>

      <div id="ioSubForm"></div>

      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
    this._renderIoSub();
  },

  /* Il cambio di direzione azzera lo stato dell'altra: un carrello di
     verifica a meta' strada non deve sopravvivere a un ripensamento. */
  _ioSwitch(mode) {
    if (this._ioMode === mode) return;
    this._ioMode = mode;
    this._dispReset();
    ScanGuard.clear();
    this._formCaricoScarico($('movFormArea'));
  },

  _renderIoSub() {
    const el = $('ioSubForm');
    if (!el) return;
    if (this._ioMode === 'out') this._formSmaltire(el);
    else this._formPosiziona(el);
  },
};
