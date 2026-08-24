import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { Feedback } from '../feedback';

/* Dove altro sta lo stesso lotto: la quarantena le propone come lo scarico. */
type Alternativa = { location_code: string; item_key: string; qty_available: number; qty_physical: number };

export const VistaQuarantena = {
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
      <h3>🚫 <span class="text-sx-purple">Quarantena</span> — Blocco Qualità</h3>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① ARTICOLO</span> → <span class="wf-step">② LOTTO</span> → INVIO per cercare →
        <span class="wf-step">③ SCEGLI L'UBICAZIONE</span> → <span class="wf-step">④ VERIFICA A SCAFFALE</span> → colli e motivo → <span class="wf-step">⑤ Cartello NC</span>.
      </div>
      <div class="form-group mb-5">
        <label>① Scansiona Articolo <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="qArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('qLot')?.focus();}">
      </div>
      <div class="form-group mb-6">
        <label>② Scansiona Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="qLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._searchQuar();}">
      </div>
      <div id="qResults"><div class="text-body-medium text-sx-text-muted p-4">Scansiona articolo e lotto, poi premi INVIO</div></div>
      ${activeQ.length ? `<div class="mt-10 border-t border-t-sx-border pt-7.5">
        <strong class="text-body-small text-sx-text-secondary">🔒 Attive (${activeQ.length})</strong>
        <div class="max-h-[180px] overflow-y-auto mt-4">
          ${activeQ.map(q => `<div class="flex items-center gap-5 py-3.5 px-5 border border-sx-purple bg-sx-purple-soft rounded-[var(--radius)] mb-2.5 text-body-small">
            <span class="mono text-sx-purple font-bold">${this._esc(q.article_code)}</span>
            <span class="mono text-sx-text-muted text-label-small">L:${this._esc(q.lot_code)}</span>
            <span class="mono text-sx-text-muted text-label-small">📍${this._esc(q.blocked_location)} · ${q.qty || 1} Coll.${q.partial ? ' (parz.)' : ''}</span>
            <span class="truncate text-sx-text-muted text-label-small flex-1" title="${this._esc(q.reason)}">${this._esc(q.reason)}</span>
            <button class="btn btn-sm btn-success" onclick="App._releaseQuarantine('${this._esc(q.q_id)}')">✓ Rilascia</button>
            <button class="btn btn-sm" onclick="App._printNCCard('${this._esc(q.q_id)}')" title="Ristampa il cartello NC">🖨</button>
          </div>`).join('')}
        </div>
      </div>` : ''}
      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
    this.setPrimaryScanField('qArt');
  },

  /* Ricerca per ARTICOLO + LOTTO, entrambi obbligatori. L'esito e' l'elenco
     delle ubicazioni che li contengono, ordinato FEFO. */
  _searchQuar() {
    const art = Validate.clean($('qArt')?.value, true);
    const lot = Validate.clean($('qLot')?.value);
    const el = $('qResults');
    if (!art) {
      el.innerHTML = '<div class="text-body-small text-sx-danger p-3">✗ Scansiona il codice articolo</div>';
      $('qArt')?.focus();
      return;
    }
    if (!lot) {
      el.innerHTML = '<div class="text-body-small text-sx-danger p-3">✗ Scansiona il codice lotto — entrambi i campi sono obbligatori</div>';
      $('qLot')?.focus();
      return;
    }

    const tutte = Store.findItemLocations(art).filter(it => it.lot_code === lot);
    if (!tutte.length) {
      el.innerHTML = `<div class="text-body-small text-sx-text-muted p-3">Nessun item trovato per ${this._esc(art)}#${this._esc(lot)}</div>`;
      return;
    }

    const gia = tutte.filter(it => Store.isItemQuarantined(it.item_key, it.location_code));
    const libere = tutte.filter(it => !Store.isItemQuarantined(it.item_key, it.location_code));
    const avvisoGia = gia.length ? `<div class="mov-preview bg-sx-purple-soft border-sx-purple my-4 mx-0">
      🔒 <strong class="text-sx-purple">Già in quarantena</strong>:
      ${gia.map(g => `<span class="mono">${this._esc(g.location_code)}</span> (${g.qty || 1} Coll.)`).join(' · ')}
    </div>` : '';

    if (!libere.length) {
      el.innerHTML = avvisoGia + `<div class="text-body-small text-sx-purple p-3">Tutta la merce di ${this._esc(art)}#${this._esc(lot)} è già bloccata.</div>`;
      return;
    }

    const items = Store.sortByFEFO(libere);
    let html = `${avvisoGia}<div class="text-label-small text-sx-text-muted mt-3 mx-0 mb-2">
      Seleziona quale ubicazione bloccare: si aprirà la verifica a scaffale.</div>
      <div class="max-h-[320px] overflow-y-auto">`;
    items.forEach((it, idx) => {
      const isFEFO = idx === 0;
      const expiryLabel = it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : '';
      const qtyPhys = it.qty || 1;
      const qtyAvail = Store.getAvailableQty(it.location_code, it.item_key);
      const reserved = qtyPhys - qtyAvail;
      const reservedLabel = reserved > 0
        ? ` · <span class="text-sx-orange font-bold">${reserved} impegnati su DDT</span>`
        : '';
      html += `<div class="inv-item-row${isFEFO ? ' fefo-row' : ''}">
        <div class="inv-info">
          <div class="inv-code text-sx-purple">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal text-body-small">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">Lotto: ${this._esc(it.lot_code)} · 📍 <strong>${this._esc(it.location_code)}</strong> · <strong class="text-sx-purple">${qtyPhys} Coll. fisici</strong>${reservedLabel}${expiryLabel}</div>
        </div>
        <button class="btn btn-sm bg-sx-purple text-white" onclick="App._qSelect('${this._esc(it.location_code)}','${this._esc(it.item_key)}')">➜ Vai e verifica</button>
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
    this._formQuarantena($('movFormArea'));
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
          ? `<div class="mov-preview mov-preview-err my-5 mx-0">
              <strong>📍 La merce bloccata andrà in ${this._esc(nc.code)}</strong>
              <span class="text-sx-text-muted text-label-small"> (${this._esc(nc.zoneName)}${nc.hasItems ? ' — già contiene item' : ' — vuota'})</span>
            </div>`
          : `<div class="mov-preview mov-preview-warn my-5 mx-0">
              <strong>⛔ Nessuna ubicazione BLOCCATA configurata.</strong>
              La quarantena non può partire: aprire Mappa, scegliere un'ubicazione da destinare alle NC e premere «Blocca».
            </div>`}

        ${riservati > 0 ? `<div class="mov-preview mov-preview-warn mb-5">
          <strong>⚠ ${riservati} Coll. sono impegnati su un DDT pendente.</strong>
          Bloccandoli, quel documento non sarà più evadibile e andrà corretto.
        </div>` : ''}

        ${d.alternatives.length ? `<div class="route-alt">
          <strong>Stesso articolo e lotto anche in:</strong>
          ${(d.alternatives as Alternativa[]).map((a) => `<span class="badge badge-muted mono">${this._esc(a.location_code)} · ${a.qty_physical} Coll.</span>`).join(' ')}
          <div class="text-label-small mt-2.5 opacity-80">Scansionandone una, il blocco si sposta là.</div>
        </div>` : ''}

        <div class="form-group mt-6 mx-0 mb-4">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div class="flex gap-3">
          <input class="input input-mono" id="qvLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('qvLoc')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('qvLoc');App._qCheckLoc();}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('qvLoc','_qCheckLoc')" title="Sfoglia le ubicazioni">📍</button>
          </div>
        </div>
        <div class="form-group mb-4">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="qvArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._qCheckArt();}">
        </div>
        <div class="form-group mb-4">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="qvLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._qCheckLot();}">
        </div>

        <div id="qFeedback"></div>

        <div class="disp-confirm">
          <div class="flex gap-6 items-end flex-wrap mb-5">
            <div class="form-group w-[165px] mb-0">
              <label class="whitespace-nowrap">④ Colli da bloccare <span class="req">*</span></label>
              <input class="input input-mono text-center font-bold" id="qQty" type="number" min="1" step="1" max="${d.qty_physical}"
                value="${d.qty_physical}">
            </div>
            <div class="text-label-small text-sx-text-muted pb-4">
              Presenti: <strong class="text-sx-purple">${d.qty_physical} Coll.</strong><br>
              <span>Bloccarne meno lascia gli altri conformi e utilizzabili.</span>
            </div>
          </div>

          <div class="form-group mb-5">
            <label>⑤ Motivo del blocco <span class="req">*</span></label>
            <textarea class="input" id="qReason" rows="2" maxlength="${Validate.MAX.REASON}" placeholder="Descrivi il motivo della non conformità..."></textarea>
          </div>
          <div class="form-row mb-5">
            <div class="form-group"><label>Operatore <span class="req">*</span></label><input class="input" id="qOperator" maxlength="${Validate.MAX.OPERATOR}" placeholder="Nome operatore" value="${this._esc(this.currentOperator || '')}"></div>
            <div class="form-group"><label>Reparto/Ufficio <span class="req">*</span></label><input class="input" id="qRefDept" maxlength="${Validate.MAX.REF_DEPT}" placeholder="Es: CQ, Produzione"></div>
          </div>
          <div class="form-group mb-0">
            <label>Referente (opz.)</label>
            <input class="input" id="qRefPerson" maxlength="${Validate.MAX.OPERATOR}" placeholder="Nome specifico">
          </div>
        </div>

        <div class="flex gap-5 mt-7 flex-wrap">
          <button class="btn btn-warning flex-1 font-extrabold min-h-[var(--md-touch)]"
            onclick="App._execQuarantena()">🚫 CONFERMA QUARANTENA</button>
          <button class="btn min-h-[var(--md-touch)]" onclick="App._qBack()">← Cambia ubicazione</button>
        </div>
      </article>`;
    this._qState.scan = { loc: '', art: '', lot: '' };
    this.setPrimaryScanField('qvLoc');
  },

  _qBack() {
    this._qState = null;
    this._qStage = 'search';
    this._formQuarantena($('movFormArea'));
  },

  /* ─── VERIFICHE DI SCANSIONE ────────────────────────────────────── */

  _qCheckLoc() {
    const d = this._qState;
    if (!d) return;
    const val = Validate.clean($('qvLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val === d.location_code) {
      d.scan.loc = val;
      this._scanFb('qFeedback', 'ok', `Ubicazione ${val} confermata`);
      $('qvArt')?.focus();
      return;
    }
    const alt = (d.alternatives as Alternativa[]).find((a) => a.location_code === val);
    if (alt) { this._qSwitchToAlternative(alt); return; }
    this._scanBlock({
      fieldId: 'qvLoc', fbId: 'qFeedback',
      title: 'Ubicazione errata',
      message: `Attesa ${d.location_code}, scansionata ${val}.`,
      onForce: async (note: string) => {
        if (!Store.locationExists(val)) {
          this.toast(`L'ubicazione ${val} non esiste a sistema`, 'error');
          return false;
        }
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Ubicazione forzata (attesa ${d.location_code}, letta ${val}): ${note}`;
        d.scan.loc = val;
        return true;
      },
      onUnlocked: () => $('qvArt')?.focus()
    });
  },

  _qSwitchToAlternative(alt) {
    const d = this._qState;
    const old = d.location_code;
    const cur = Store.getItemsAtLocation(alt.location_code).find(i => i.item_key === alt.item_key);
    if (!cur) return this.toast(`In ${alt.location_code} quella merce non c'è più`, 'error');

    d.alternatives = [
      { location_code: old, item_key: d.item_key, qty_physical: d.qty_physical },
      ...(d.alternatives as Alternativa[]).filter((a) => a.location_code !== alt.location_code)
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
    this._formQuarantena($('movFormArea'));
    const le = $('qvLoc');
    if (le) le.value = alt.location_code;
    this._qState.scan.loc = alt.location_code;
    this._scanFb('qFeedback', 'ok', `Spostato su ${alt.location_code} (ubicazione alternativa)`);
    $('qvArt')?.focus();
  },

  _qCheckArt() {
    const d = this._qState;
    if (!d) return;
    if (!d.scan.loc) {
      this._scanFb('qFeedback', 'error', 'Scansiona prima l’ubicazione');
      $('qvLoc')?.focus();
      return;
    }
    const val = Validate.clean($('qvArt')?.value, true);
    if (!val) return;
    if (val === d.article_code) {
      d.scan.art = val;
      this._scanFb('qFeedback', 'ok', `Articolo ${val} confermato`);
      $('qvLot')?.focus();
      return;
    }
    this._scanBlock({
      fieldId: 'qvArt', fbId: 'qFeedback',
      title: 'Articolo errato',
      message: `Atteso ${d.article_code}, scansionato ${val}.`,
      onForce: async (note: string) => {
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Articolo forzato (atteso ${d.article_code}, letto ${val}): ${note}`;
        d.scan.art = d.article_code;
        return true;
      },
      onUnlocked: () => $('qvLot')?.focus()
    });
  },

  _qCheckLot() {
    const d = this._qState;
    if (!d) return;
    if (!d.scan.art) {
      this._scanFb('qFeedback', 'error', 'Scansiona prima l’articolo');
      $('qvArt')?.focus();
      return;
    }
    const val = Validate.clean($('qvLot')?.value);
    if (!val) return;
    if (val === d.lot_code) {
      d.scan.lot = val;
      this._scanFb('qFeedback', 'ok', 'Lotto confermato — indica colli e motivo');
      $('qQty')?.focus();
      $('qQty')?.select();
      return;
    }
    this._scanBlock({
      fieldId: 'qvLot', fbId: 'qFeedback',
      title: 'Lotto errato',
      message: `Atteso ${d.lot_code}, scansionato ${val}. Bloccare un lotto per un altro lascia in giro quello davvero non conforme.`,
      onForce: async (note: string) => {
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Lotto forzato (atteso ${d.lot_code}, letto ${val}): ${note}`;
        d.scan.lot = d.lot_code;
        return true;
      },
      onUnlocked: () => $('qQty')?.focus()
    });
  },

  /* 2.1 — `tutto` E `senzaCartellino`, per chi blocca un'unità di carico.

     Un pallet in quarantena è UN fatto con molte righe: chiedere «quali
     colli» riga per riga sarebbe una finestra a lotto per una risposta che
     si sa già — tutti — e stampare un cartellino a riga sarebbe una pila
     di fogli per un unico legno fermo. Con `tutto` la riga esce intera, che
     è la strada che `removeItem` lascia libera anche dove i colli sono
     dichiarati; con `senzaCartellino` il foglio non parte, e i cartellini
     restano ristampabili uno per uno dalla scheda Quarantena. */
  async _quarantineItemCore(item, { reason, operator, refDept, refPerson = '', nearest = undefined, qty = null, tutto = false, senzaCartellino = false }) {
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
    const scelteNC = tutto
      ? null
      : await this._chiediColli(item, 'Quali colli vanno in quarantena', null, { colli: qtyToMove });
    if (scelteNC === undefined) { this.toast('Quarantena annullata', 'info'); return { ok: false }; }
    const removed = tutto
      ? await Store.removeItem(item.location_code, item.item_key)
      : await Store.removeItem(item.location_code, item.item_key, qtyToMove, null, scelteNC);
    if (!removed) { this.toast('Item non più disponibile — operazione annullata', 'error'); return { ok: false }; }
    const umNC = this._umMossa(removed);   // 1.4.2 — vedi _umMossa
    const colliNC = removed._packs_out ?? null;
    if (colliNC) qtyToMove = colliNC.length;
    try {
      const res = await Store.addItem(nearest.code, item.article_code, item.article_description, item.lot_code, item.expiry_date || '', 'QUARANTENA: ' + reason, qtyToMove, umNC, colliNC);
      if (!res.ok) throw new Error('addItem non riuscito');
      await this._logMov(MOV.MOVE, item.article_code, item.article_description, item.lot_code, item.location_code, nearest.code, operator, 'Spostamento in quarantena', '', qtyToMove, 0, qtyToMove, umNC);
    } catch (err) {
      if (removed._mode === 'partial')
        await Store.addItem(item.location_code, item.article_code, item.article_description, item.lot_code, item.expiry_date || '', '', qtyToMove, umNC, colliNC);
      else
        await Store.restoreItem(backup);
      this.toast(`Spostamento in area NC fallito (${(err as Error).message || 'errore'}) — operazione annullata, nessuna quarantena registrata`, 'error');
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
      '', qtyPhys, -qtyToMove, qtyPhys - qtyToMove, typeof umNC === 'number' ? -umNC : null);

    this.updateSyncIndicator();
    if (!senzaCartellino) this._printNCCardFromRecord(qRecord);
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
      $(missing[0] === 'ubicazione' ? 'qvLoc' : missing[0] === 'articolo' ? 'qvArt' : 'qvLot')?.focus();
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
    const qtyBlock = parseInt($('qQty')?.value);
    if (!qtyBlock || qtyBlock < 1) {
      $('qQty')?.focus();
      return this.toast('Colli da bloccare: valore non valido', 'error');
    }
    if (qtyBlock > qtyPhys) {
      $('qQty')?.focus();
      return this.toast(`In ${d.location_code} ci sono ${qtyPhys} Coll.`, 'error');
    }

    const reasonBase = Validate.clean($('qReason')?.value);
    const reason = d.forced_note ? `${reasonBase} [Sblocco scansione: ${d.forced_note}]` : reasonBase;

    const out = await this._quarantineItemCore(item, {
      reason,
      operator:  Validate.clean($('qOperator')?.value),
      refDept:   Validate.clean($('qRefDept')?.value),
      refPerson: Validate.clean($('qRefPerson')?.value),
      nearest:   d.nearestBlocked,
      qty:       qtyBlock
    });
    if (!out.ok) return;
    this._qState = null;
    this._qStage = 'search';
    this._formQuarantena($('movFormArea'));
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
    $('releaseDestOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'releaseDestOverlay';
    overlay.innerHTML = `
      <div class="modal max-w-[420px]">
        <div class="modal-header">
          <h2>✓ Rilascio Quarantena — Ubicazione Destinazione</h2>
        </div>
        <div class="modal-body">
          <div class="bg-sx-success-soft border border-sx-success rounded-[var(--radius-md)] py-6.5 px-8.5 mb-8.5">
            <div class="text-body-small text-sx-text-muted mb-2">Item rilasciato dalla quarantena:</div>
            <div class="font-bold text-sx-primary font-mono">${this._esc(qRec.article_code)}</div>
            <div class="text-body-small text-sx-text-secondary">Lotto: <strong>${this._esc(qRec.lot_code)}</strong> · Da: <strong>${this._esc(qRec.blocked_location)}</strong></div>
          </div>
          <div class="bg-sx-warning-soft border border-sx-warning rounded-[var(--radius)] py-5 px-6.5 mb-8.5 text-body-small text-sx-warning">
            ⚠ <strong>Obbligatorio:</strong> un item conforme non può stazionare in un'ubicazione bloccata o di non conformità. Scansiona l'ubicazione di destinazione idonea.
          </div>
          <div class="form-group">
            <label>Scansiona Ubicazione di Destinazione <span class="req">*</span></label>
            <div class="flex gap-3">
              <input class="input input-mono flex-1" id="releaseDestLoc" placeholder="Scansiona barcode ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
                oninput="App._normScan('releaseDestLoc');App._previewReleaseDest()"
                onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('releaseDestLoc');$('releaseOperator')?.focus();}">
              <button class="btn btn-sm" onclick="App._pickLoc('releaseDestLoc','_cbPickReleaseDest')">📍</button>
            </div>
            <div class="mt-3" id="releaseDestPrev"></div>
          </div>
          <!-- v2.0.1 [B6] — Il rilascio da quarantena è una decisione di qualità:
               prima veniva loggato senza alcun operatore. Ora esecutore e
               responsabile che autorizza sono entrambi obbligatori. -->
          <div class="form-row">
            <div class="form-group">
              <label>Operatore esecutore <span class="req">*</span></label>
              <input class="input" id="releaseOperator" placeholder="Chi esegue il rilascio" maxlength="${Validate.MAX.OPERATOR}"
                value="${this._esc(this.currentOperator || '')}"
                onkeydown="if(event.key==='Enter'){event.preventDefault();$('releaseRefPerson')?.focus();}">
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
          <button class="btn" onclick="$('releaseDestOverlay').remove()">Annulla</button>
          <button class="btn btn-success" onclick="App._execReleaseDest('${q_id}')">✓ Conferma e Riposiziona</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => $('releaseDestLoc')?.focus(), 80);
  },

  _previewReleaseDest() { this._previewLoc('releaseDestLoc', 'releaseDestPrev'); },
  _cbPickReleaseDest() { setTimeout(() => this._previewReleaseDest(), 30); },

  /* Esegue il rilascio e lo spostamento fisico verso l'ubicazione destinazione conforme. */
  async _execReleaseDest(q_id) {
    if (!this._requireOperator('il rilascio dalla quarantena')) return;   // v2.0.1 [B7]
    const dest = Validate.clean($('releaseDestLoc')?.value, true)?.replace(/'/g, '-');
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
    const relOperator = Validate.clean($('releaseOperator')?.value);
    const relRefPerson = Validate.clean($('releaseRefPerson')?.value);
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
    /* 2.2 — quanto è tornato conforme: serve alla riga del rilascio, che sta
       fuori da questo blocco e fin qui usciva senza quantità. */
    let colliRilasciati: number | null = null;
    let umRilasciate: number | null = null;
    const srcItems = Store.getItemsAtLocation(currentLoc!);
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
        : await this._chiediColli(srcItem, 'Quali colli si rilasciano', null, { colli: qtyToMove });
      if (scelteRil === undefined) return this.toast('Rilascio annullato', 'info');
      const removed = await Store.removeItem(currentLoc!, itemKey, qtyToMove, null, scelteRil);
      if (removed) {
        const umRil = this._umMossa(removed);   // 1.4.2 — vedi _umMossa
        const colliRil = removed._packs_out ?? null;
        if (colliRil) qtyToMove = colliRil.length;
        colliRilasciati = qtyToMove;
        umRilasciate = umRil;
        const res = await Store.addItem(dest, srcItem.article_code, srcItem.article_description!, srcItem.lot_code, srcItem.expiry_date || '', (srcItem.notes || '').replace(/^QUARANTENA:\s*/i, '').trim(), qtyToMove, umRil, colliRil);
        if (res.ok) {
          moved = true;
          await this._logMov(MOV.MOVE, srcItem.article_code, srcItem.article_description, srcItem.lot_code, currentLoc, dest, relOperator, 'Rilascio quarantena → riposizionamento conforme', rec.q_id, qtyToMove, 0, qtyToMove, umRil);   // v2.0.1 [B6]
        } else {
          if (removed._mode === 'partial')
            await Store.addItem(currentLoc!, srcItem.article_code, srcItem.article_description!, srcItem.lot_code, srcItem.expiry_date || '', '', qtyToMove, umRil, colliRil);
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
    /* 2.2 — e con le quantità: la riga del rilascio diceva chi aveva
       autorizzato e non quanta merce fosse tornata conforme. Sono i colli che
       si sono mossi davvero: se il riposizionamento non è riuscito restano
       vuoti, perché non è tornato niente. */
    await this._logMov(MOV.Q_REL, rec.article_code, rec.article_description, rec.lot_code, currentLoc, dest,
      relOperator, `Rilascio autorizzato da: ${relRefPerson}`, rec.q_id,
      moved ? colliRilasciati : null, moved ? 0 : null, moved ? colliRilasciati : null,
      moved ? umRilasciate : null);

    $('releaseDestOverlay')?.remove();
    if (moved) {
      this.toast(`✓ ${rec.article_code}#${rec.lot_code} rilasciato e spostato in ${dest}`, 'success');
    } else {
      this.toast(`✓ ${rec.article_code}#${rec.lot_code} rilasciato${moveErr ? ` — ⚠ ${moveErr}` : ''}`, moveErr ? 'warning' : 'success');
    }
    this._formQuarantena($('movFormArea'));
    this._refreshSessionLog();
  },

  _printNCCard(q_id) {
    const rec = Store.getQuarantineHistory().find(q => q.q_id === q_id);
    if (rec) this._printNCCardFromRecord(rec);
  },

  _printNCCardFromRecord(rec) {
    const fmtDate = (d: number | string) => new Date(d).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

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
} satisfies Vista;
