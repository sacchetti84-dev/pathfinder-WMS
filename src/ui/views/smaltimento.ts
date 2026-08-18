import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog.js';
import { Feedback } from '../feedback.js';
import { descriviColli as descriviElenco, preleva as prelevaElenco } from '../../modules/colli';

export const VistaSmaltimento: Vista = {
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
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('mOutLot')?.focus();}">
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
    const art = Validate.clean($('mOutArt')?.value, true);
    const lot = Validate.clean($('mOutLot')?.value);
    const el = $('mOutResults');
    if (!art) {
      el.innerHTML = '<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);padding:0.3rem">✗ Scansiona il codice articolo</div>';
      $('mOutArt')?.focus();
      return;
    }
    if (!lot) {
      el.innerHTML = '<div style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-danger);padding:0.3rem">✗ Scansiona il codice lotto — entrambi i campi sono obbligatori</div>';
      $('mOutLot')?.focus();
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
          ${d.alternatives.map((a: any) => `<span class="badge badge-muted mono">${this._esc(a.location_code)} · ${a.qty_available} Coll.</span>`).join(' ')}
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
    const free = $('dReasonFree');
    if (d.reason_id && free) free.value = '';
    document.querySelectorAll('.disp-reason').forEach(b =>
      b.classList.toggle('active', b.textContent.trim() === r.label && !!d.reason_id));
  },

  _dispFreeReasonInput() {
    const d = this._dispState;
    if (!d) return;
    const v = $('dReasonFree')?.value || '';
    if (v.trim()) {
      d.reason_id = null;
      document.querySelectorAll('.disp-reason').forEach(b => b.classList.remove('active'));
    }
  },

  /* ─── VERIFICHE DI SCANSIONE ────────────────────────────────────── */

  _dispCheckLoc() {
    const d = this._dispState;
    if (!d) return;
    const val = Validate.clean($('dLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val === d.location_code) {
      d.scan.loc = val;
      this._scanFb('dFeedback', 'ok', `Ubicazione ${val} confermata`);
      $('dArt')?.focus();
      return;
    }
    const alt = d.alternatives.find((a: any) => a.location_code === val);
    if (alt) { this._dispSwitchToAlternative(alt); return; }
    this._scanBlock({
      fieldId: 'dLoc', fbId: 'dFeedback',
      title: 'Ubicazione errata',
      message: `Attesa ${d.location_code}, scansionata ${val}.`,
      onForce: async (note: any) => {
        if (!Store.locationExists(val)) {
          this.toast(`L'ubicazione ${val} non esiste a sistema`, 'error');
          return false;
        }
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Ubicazione forzata (attesa ${d.location_code}, letta ${val}): ${note}`;
        d.scan.loc = val;
        return true;
      },
      onUnlocked: () => $('dArt')?.focus()
    });
  },

  _dispSwitchToAlternative(alt) {
    const d = this._dispState;
    const old = d.location_code;
    d.alternatives = [
      { location_code: old, item_key: d.item_key, qty_available: Store.getAvailableQty(old, d.item_key) },
      ...d.alternatives.filter((a: any) => a.location_code !== alt.location_code)
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
    const le = $('dLoc');
    if (le) le.value = alt.location_code;
    this._dispState.scan.loc = alt.location_code;
    this._scanFb('dFeedback', 'ok', `Spostato su ${alt.location_code} (ubicazione alternativa)`);
    $('dArt')?.focus();
  },

  _dispCheckArt() {
    const d = this._dispState;
    if (!d) return;
    if (!d.scan.loc) {
      this._scanFb('dFeedback', 'error', 'Scansiona prima l’ubicazione');
      $('dLoc')?.focus();
      return;
    }
    const val = Validate.clean($('dArt')?.value, true);
    if (!val) return;
    if (val === d.article_code) {
      d.scan.art = val;
      this._scanFb('dFeedback', 'ok', `Articolo ${val} confermato`);
      $('dLot')?.focus();
      return;
    }
    this._scanBlock({
      fieldId: 'dArt', fbId: 'dFeedback',
      title: 'Articolo errato',
      message: `Atteso ${d.article_code}, scansionato ${val}.`,
      onForce: async (note: any) => {
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Articolo forzato (atteso ${d.article_code}, letto ${val}): ${note}`;
        d.scan.art = d.article_code;
        return true;
      },
      onUnlocked: () => $('dLot')?.focus()
    });
  },

  _dispCheckLot() {
    const d = this._dispState;
    if (!d) return;
    if (!d.scan.art) {
      this._scanFb('dFeedback', 'error', 'Scansiona prima l’articolo');
      $('dArt')?.focus();
      return;
    }
    const val = Validate.clean($('dLot')?.value);
    if (!val) return;
    if (val === d.lot_code) {
      d.scan.lot = val;
      this._scanFb('dFeedback', 'ok', 'Lotto confermato — indica colli e motivazione');
      $('dQty')?.focus();
      $('dQty')?.select();
      return;
    }
    this._scanBlock({
      fieldId: 'dLot', fbId: 'dFeedback',
      title: 'Lotto errato',
      message: `Atteso ${d.lot_code}, scansionato ${val}. Smaltire un lotto per un altro è un errore che non si recupera.`,
      onForce: async (note: any) => {
        d.forced_note = `${d.forced_note ? d.forced_note + ' | ' : ''}Lotto forzato (atteso ${d.lot_code}, letto ${val}): ${note}`;
        d.scan.lot = d.lot_code;
        return true;
      },
      onUnlocked: () => $('dQty')?.focus()
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
      $(missing[0] === 'ubicazione' ? 'dLoc' : missing[0] === 'articolo' ? 'dArt' : 'dLot')?.focus();
      return;
    }

    // ② la motivazione è obbligatoria: è l'intero senso di questa versione
    const free = Validate.clean($('dReasonFree')?.value);
    let reasonLabel = '';
    if (d.reason_id) {
      reasonLabel = Store.getDocConfig().disposalReasons.find(r => r.id === d.reason_id)?.label || '';
    } else if (free) {
      if (free.length < 8) {
        $('dReasonFree')?.focus();
        return this.toast('Il motivo esteso deve essere di almeno 8 caratteri', 'error');
      }
      reasonLabel = free;
    }
    if (!reasonLabel) {
      $('dReasonFree')?.focus();
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
    const qtyOut = parseInt($('dQty')?.value);
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

    const isFull = scelteColli ? !uscitaColli!.rimasti.length : qtyOut >= qtyAvail;
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
    const firme = signs.length ? `<div class="doc-signs">${signs.map((f: any) => `
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
    $('printReport').innerHTML = html;
    window.print();
    setTimeout(() => { $('printReport').innerHTML = ''; }, 1500);
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

    const fmtTs = (ms: any) => ms
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
      sender: (v.sender && (v.sender as any).name) ? v.sender : null,
      headExtra, body, docId: v.doc_id, pageClass: 'doc-page--vb',
      signs: [
        { role: 'Operatore magazzino', hint: v.operator || '' },
        { role: 'Responsabile magazzino', hint: 'Data e firma' },
        { role: 'Controllo qualità', hint: 'Data e firma' }
      ]
    }));
  },
};
