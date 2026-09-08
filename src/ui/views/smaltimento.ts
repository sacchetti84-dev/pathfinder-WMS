import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { Feedback } from '../feedback';
import { descriviColli as descriviElenco, preleva as prelevaElenco } from '../../modules/colli';
import { VERSIONE_APP } from '../../core/pacchetto';
import { svg as barcodeSvg, primoCarattereFuoriSet } from '../../modules/code128';

/* Dove altro sta lo stesso lotto, quando lo scarico non lo trova qui. */
type Alternativa = { location_code: string; item_key: string; qty_available: number };

/* Una firma in calce a un documento: chi firma, e cosa scrive sotto. */
type Firma = { role: string; hint?: string };

export const VistaSmaltimento = {
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
      <div class="form-group mb-5">
        <label>① Scansiona Articolo <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="mOutArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('mOutLot')?.focus();}">
      </div>
      <div class="form-group mb-6">
        <label>② Scansiona Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="mOutLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._searchOut();}">
      </div>
      <div id="mOutResults"><div class="text-body-medium text-sx-text-muted p-4">Scansiona articolo e lotto, poi premi INVIO</div></div>`;
    this.setPrimaryScanField('mOutArt');
  },

  _searchOut() {
    const art = Validate.clean($('mOutArt')?.value, true);
    const lot = Validate.clean($('mOutLot')?.value);
    const el = $('mOutResults');
    if (!art) {
      el.innerHTML = `<div class="text-body-small text-sx-danger p-3">${this._ico('circle-x')} Scansiona il codice articolo</div>`;
      $('mOutArt')?.focus();
      return;
    }
    if (!lot) {
      el.innerHTML = `<div class="text-body-small text-sx-danger p-3">${this._ico('circle-x')} Scansiona il codice lotto — entrambi i campi sono obbligatori</div>`;
      $('mOutLot')?.focus();
      return;
    }
    const allItems = Store.findItemLocations(art);
    const tutte = allItems.filter(it => it.lot_code === lot);
    if (!tutte.length) {
      el.innerHTML = `<div class="text-body-small text-sx-text-muted p-3">Nessun item trovato per ${this._esc(art)}#${this._esc(lot)}</div>`;
      return;
    }

    const itemsRaw = tutte.filter(it => !Store.isItemQuarantined(it.item_key, it.location_code));
    const bloccate = tutte.filter(it => Store.isItemQuarantined(it.item_key, it.location_code));
    const avvisoNC = bloccate.length ? `<div class="mov-preview mov-preview-err my-4 mx-0">
      ${this._ico('ban')} <strong>In quarantena</strong>, non smaltibile da qui:
      ${bloccate.map(b => `<span class="mono">${this._esc(b.location_code)}</span> (${b.qty || 1} Coll.)`).join(' · ')}<br>
      <span class="text-label-small">Gestire l'esito tramite <strong>Quarantena → Rilascio</strong>.</span>
    </div>` : '';

    if (!itemsRaw.length) {
      el.innerHTML = avvisoNC || `<div class="text-body-small text-sx-text-muted p-3">Nessun item trovato per ${this._esc(art)}#${this._esc(lot)}</div>`;
      return;
    }
    // Ordina FEFO: lotti in scadenza per primi
    const items = Store.sortByFEFO(itemsRaw);
    let html = `${avvisoNC}<div class="text-label-small text-sx-text-muted mt-3 mx-0 mb-2">
      Seleziona da quale ubicazione scaricare: si aprirà la verifica a scaffale.</div>
      <div class="max-h-[320px] overflow-y-auto">`;
    items.forEach((it, idx) => {
      const isFEFO = idx === 0;
      const expiryLabel = it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : '';
      // v2.0.1 [A1] — si mostra e si smaltisce solo il DISPONIBILE
      const qtyPhys = it.qty || 1;
      const qtyAvail = Store.getAvailableQty(it.location_code, it.item_key);
      const reserved = qtyPhys - qtyAvail;
      const reservedLabel = reserved > 0
        ? ` · <span class="text-sx-orange font-bold">${reserved} impegnati su DDT</span>`
        : '';
      html += `<div class="inv-item-row${isFEFO ? ' fefo-row' : ''}">
        <div class="inv-info">
          <div class="inv-code">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal text-body-small">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">Lotto: ${this._esc(it.lot_code)} · ${this._ico('map-pin')} <strong>${this._esc(it.location_code)}</strong> · <strong class="text-sx-accent">${qtyAvail} Coll. disp.</strong> (fisici ${qtyPhys})${reservedLabel}${expiryLabel}</div>
        </div>
        ${qtyAvail > 0
          ? `<button class="btn btn-sm btn-danger" onclick="App._dispSelect('${this._esc(it.location_code)}','${this._esc(it.item_key)}')">➜ Vai e verifica</button>`
          : `<span class="text-label-small text-sx-text-muted">Interamente impegnato</span>`}
      </div>`;
    });
    el.innerHTML = html + '</div>';
  },

  _dispSelect(loc, key) {
    const bucket = Store.getItemsAtLocation(loc);
    const item = bucket.find(i => i.item_key === key);
    if (!item) return this.toast('Item non più presente in questa ubicazione', 'error');
    if (Store.isItemQuarantined(key, loc)) return this.toast('Item in quarantena in questa ubicazione — usare il flusso di rilascio', 'error');
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
          <span class="route-stop-seq">${this._ico('trash')}</span>
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
          ${(d.alternatives as Alternativa[]).map((a) => `<span class="badge badge-muted mono">${this._esc(a.location_code)} · ${a.qty_available} Coll.</span>`).join(' ')}
          <div class="text-label-small mt-2.5 opacity-80">Scansionandone una, lo scarico si sposta là.</div>
        </div>` : ''}

        <div class="form-group mt-6 mx-0 mb-4">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div class="flex gap-3">
          <input class="input input-mono" id="dLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('dLoc')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('dLoc');App._dispCheckLoc();}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('dLoc','_dispCheckLoc')" title="Sfoglia le ubicazioni">${this._ico('map-pin')}</button>
          </div>
        </div>
        <div class="form-group mb-4">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="dArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._dispCheckArt();}">
        </div>
        <div class="form-group mb-4">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="dLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._dispCheckLot();}">
        </div>

        <div id="dFeedback"></div>

        <!-- ⑤ COLLI E MOTIVAZIONE -->
        <div class="disp-confirm">
          <div class="flex gap-6 items-end flex-wrap mb-5">
            <div class="form-group w-[165px] mb-0">
              <label class="whitespace-nowrap">④ Colli da smaltire <span class="req">*</span></label>
              <input class="input input-mono text-center font-bold" id="dQty" type="number" min="1" step="1" max="${d.qty_available}"
                value="${d.qty_available}">
            </div>
            <div class="text-label-small text-sx-text-muted pb-4">
              Disponibili: <strong class="text-sx-danger">${d.qty_available} Coll.</strong>
              ${d.qty_physical > d.qty_available ? `<br><span class="text-sx-orange">${d.qty_physical - d.qty_available} impegnati su DDT, non smaltibili</span>` : ''}
            </div>
          </div>

          <label class="block mb-2.5">⑤ Motivazione <span class="req">*</span></label>
          <div class="disp-reasons">${reasonBtns}</div>
          <input class="input" id="dReasonFree" maxlength="${Validate.MAX.NOTES}"
            placeholder="…oppure scrivi qui un motivo esteso (minimo 8 caratteri)"
            value="${this._esc(d.reason_id ? '' : d.reason_label)}"
            oninput="App._dispFreeReasonInput()">
          <div class="text-label-small text-sx-text-muted mt-2.5">
            Finisce nelle note del movimento e sul verbale. Obbligatoria.
          </div>
        </div>

        <div class="flex gap-5 mt-7 flex-wrap">
          <button class="btn btn-danger btn-conferma"
            onclick="App._execSmaltire()">${this._ico('trash')} CONFERMA SMALTIMENTO</button>
          <button class="btn min-h-touch" onclick="App._dispBack()">← Cambia ubicazione</button>
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
    this._vanoDaCampo('dLoc');
    const val = Validate.clean($('dLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val === d.location_code) {
      d.scan.loc = val;
      this._scanFb('dFeedback', 'ok', `Ubicazione ${val} confermata`);
      $('dArt')?.focus();
      return;
    }
    const alt = (d.alternatives as Alternativa[]).find((a) => a.location_code === val);
    if (alt) { this._dispSwitchToAlternative(alt); return; }
    this._scanBlock({
      fieldId: 'dLoc', fbId: 'dFeedback',
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
      onUnlocked: () => $('dArt')?.focus()
    });
  },

  _dispSwitchToAlternative(alt) {
    const d = this._dispState;
    const old = d.location_code;
    d.alternatives = [
      { location_code: old, item_key: d.item_key, qty_available: Store.getAvailableQty(old, d.item_key) },
      ...(d.alternatives as Alternativa[]).filter((a) => a.location_code !== alt.location_code)
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
      onForce: async (note: string) => {
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
      onForce: async (note: string) => {
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
    if (Store.isItemQuarantined(key, loc)) return this.toast('Item in quarantena in questa ubicazione — usare il flusso di rilascio', 'error');
    const qtyAvail = Store.getAvailableQty(loc, key);
    if (qtyAvail < 1) return this.toast('Merce interamente impegnata su DDT pendenti — modificare o annullare il DDT', 'error');
    const qtyOut = parseInt($('dQty')?.value);
    if (!qtyOut || qtyOut < 1) return this.toast('Quantità non valida', 'error');
    if (qtyOut > qtyAvail) return this.toast(`Quantità superiore al disponibile (${qtyAvail} Coll.)`, 'error');

    // ④ avviso non-FEFO — invariato dalla v1.7.0
    if (!Store.isFEFOItem(item)) {
      const fefo = Store.getFEFOItemForArticle(item.article_code);
      if (fefo && fefo.expiry_date && (!item.expiry_date || item.expiry_date > fefo.expiry_date)) {
        const msg = `${this._ico('alert-triangle')} NON-FEFO\n\nStai per smaltire ${item.article_code}#${item.lot_code}` +
          (item.expiry_date ? ` (scad. ${item.expiry_date})` : '') +
          `\n\nIl lotto FEFO consigliato è: ${fefo.lot_code}` +
          (fefo.expiry_date ? ` (scad. ${fefo.expiry_date})` : '') +
          ` in ${fefo.location_code}\n\nProcedere comunque?`;
        if (!await Dialog.confirm({
          title: 'Smaltimento NON conforme a FEFO', icon: 'alert-triangle',
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
    const scelteColli = await this._chiediColli(item, 'Quali colli si smaltiscono',
      null, { colli: qtyOut });
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
         qty_uom: this._umMossa(removed), packs: colliUsciti,
         packs_prima: removed._packs_before ?? null }]);

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
    this.toast(`Smaltito ${qtyOut} Coll. ${modeLabel}: ${removed.article_code}#${removed.lot_code} · ${verbale}`, 'success');
    this.updateSyncIndicator();
    this._refreshSessionLog();
    await this._taskAvanza(qtyOut, ['DISPOSAL']);   // 1.4.2.1

    if (await Dialog.confirm({
      title: 'Stampare il verbale di smaltimento?',
      message: `Il verbale ${verbale} riporta articolo, lotto, ubicazione, colli, motivazione e operatore, con spazio per la firma. Resta ristampabile dalla sezione Documenti.`,
      confirmLabel: 'Stampa', cancelLabel: 'Non ora', icon: 'printer'
    })) this._printDisposal(verbale);

    // Si torna alla ricerca: lo scarico successivo è quasi sempre un'altra merce
    this._dispReset();
    this._renderIoSub();
  },

  /* Striscia d'identita': marchio e mittente a sinistra, natura e numero
     del documento a destra. Identica su ogni foglio.

     2.1 — E SOTTO IL NUMERO, IL NUMERO IN BARRE.

     Sette documenti passano di qui — DDT, verbale di smaltimento, verbale
     di campionamento, cartellino di non conformita', riepilogo inventario,
     rapporto di prelievo ODP, ristampa di un pendente — e fino alla 2.0
     nessuno di loro si poteva rimettere dentro l'applicativo se non
     digitandone il riferimento. Chi torna dal magazzino col foglio in mano
     porta i guanti e ha fretta: quattordici caratteri battuti a mano sono
     l'errore che si scopre due settimane dopo, quando il documento
     richiamato era un altro.

     Il codice a barre porta ESATTAMENTE il riferimento gia' scritto
     accanto, e non un formato suo: cosi' il numero letto dal lettore e
     quello letto dall'occhio sono la stessa stringa, e nessuno deve sapere
     che esiste una traduzione. Un documento senza riferimento — un'anteprima
     non ancora numerata — non porta barre: un simbolo che codifica il
     nulla si scansiona lo stesso, e restituisce il nulla.

     `modules/code128.ts` dice cosa questo simbolo NON e': un GS1-128 col
     suo FNC1. Dentro l'azienda non serve, e questi fogli non escono. */
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
            <div class="doc-sender-name">${s.name ? this._esc(s.name) : '<span class="doc-empty">Ragione sociale non configurata</span>'}${s.legal_form ? ` <span class="font-normal text-sx-text-secondary">· ${this._esc(s.legal_form)}</span>` : ''}</div>
            ${sede ? `<div>${this._esc(sede)}</div>` : ''}
            ${fisco ? `<div>${this._esc(fisco)}</div>` : ''}
            ${contatti ? `<div>${this._esc(contatti)}</div>` : ''}
          </div>
        </div>
        <div class="doc-title">
          <div class="doc-title-main">${this._esc(kind)}</div>
          <div class="doc-title-sub">${this._esc(kindSub)}</div>
          <div class="doc-title-num">${this._esc(numLabel)} <b>${this._esc(num || '—')}</b>&nbsp;&nbsp;${this._esc(dateLabel)} <b>${this._esc(dateVal)}</b></div>
          ${this._docBarcodeHTML(num)}
        </div>
      </div>
      <div class="doc-hr"></div>`;
  },

  /* Il simbolo del riferimento, o niente. Sta in un metodo suo perche' i
     tre casi in cui non si stampa — riferimento assente, riferimento con
     caratteri che il set B non scrive, tabella che si rifiuta — devono
     stare tutti insieme: un documento che non si puo' scansionare esce
     comunque, e la testata resta quella di sempre. */
  _docBarcodeHTML(num) {
    const rif = String(num ?? '').trim();
    if (!rif || primoCarattereFuoriSet(rif) !== null) return '';
    try {
      return `<div class="doc-title-barcode">${barcodeSvg(rif, {
        modulo: 0.28, altezza: 9, margine: 6, descrizione: `Riferimento ${rif}`,
      })}</div>`;
    } catch {
      return '';
    }
  },

  /* 1.9 — IL NUMERO DI VERSIONE NEL PIEDE LO PORTA LA BUILD. Era scritto a
     mano e fermo a «1.7» su ogni foglio — DDT, verbali, cartellini, report —
     mentre in servizio girava la 1.8.3: su carta che va in audit un numero
     sbagliato e' un difetto, e index.html aveva gia' smesso di scriverlo a
     mano il 18/08. */
  _docPageHTML({ kind, kindSub, numLabel, num, dateLabel, dateVal, sender = null,
                 headExtra = '', body = '', coda = '', signs = [], docId = '',
                 watermark = '', pageClass = '', printedLabel = 'stampato il',
                 flow = false, footNote = '' }) {
    const fmt = new Date().toLocaleString('it-IT',
      { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const firme = signs.length ? `<div class="doc-signs">${(signs as Firma[]).map((f) => `
        <div><div class="doc-sign-role">${this._esc(f.role)}</div><div class="doc-sign-hint">${this._esc(f.hint || '')}</div><div class="doc-sign-line"></div></div>`).join('')}
      </div>` : '';

    const testata = `${this._docHeadHTML({ kind, kindSub, numLabel, num, dateLabel, dateVal, sender })}
        ${headExtra}`;
    /* 2.24 — LE FIRME NON SI RIPETONO SU OGNI FOGLIO. In un documento che
       scorre il piede sta nel `tfoot`, che e' il gruppo che il browser
       ristampa a ogni pagina: le tre righe da firmare uscivano su tutte, e
       chi firma non sa quale valga. Vanno in coda al CORPO, che finisce una
       volta sola; nel piede ripetuto resta cio' che ha senso ripetere — il
       numero del documento e la data di stampa. Il documento a pagina sola
       non cambia: li' testata, corpo e piede escono una volta ciascuno. */
    const piede = `${flow ? '' : firme}
        <div class="pr-footer">
          <span class="pr-footer-copy">© Andrea Sacchetti — Pathfinder ${VERSIONE_APP} — Dietopack S.r.l. / Naturacare Group</span>
          ${/* 2.24 — CIO' CHE SI RIPETE SU OGNI FOGLIO. In un documento che
                scorre questo piede torna a ogni pagina, ed e' l'unico posto
                dove chi riceve puo' accorgersi che un foglio manca: il conto
                delle righe si confronta con quelle che ha in mano. Il numero
                di pagina lo scrivono le page margin box di `@page`, dove il
                browser le sostiene. */''}
          <span>${this._esc(docId)}${footNote ? ` · ${this._esc(footNote)}` : ''} — ${this._esc(printedLabel)} ${this._esc(fmt)}</span>
        </div>`;
    const filigrana = watermark ? `<div class="doc-draft">${this._esc(watermark)}</div>` : '';

    /* 2.1 — IL REPORT CHE SCORRE SU PIU' A4.

       Un documento — DDT, verbale, cartellino — sta in UNA pagina per
       costruzione: `.doc-page` e' una colonna alta quanto il foglio, con le
       tre zone a misura fissa. Un report no: le righe sono quante sono, e
       finche' la struttura era quella la testata usciva sulla prima pagina
       e basta, mentre il piede scivolava in fondo all'ultima.

       QUI LA RIPETIZIONE LA FA IL BROWSER, e non un calcolo di altezze: la
       testata sta in un `<thead>` e il piede in un `<tfoot>`, che in stampa
       sono `table-header-group` e `table-footer-group` — cioe' i due gruppi
       che si ripetono su OGNI pagina, ed e' la stessa strada che le tabelle
       di questo progetto usano gia' per l'intestazione delle colonne. Un
       header a `position: fixed` avrebbe voluto un margine calcolato a mano
       per non coprire il testo, e un margine calcolato a mano e' sbagliato
       il giorno che la testata cambia una riga.

       Il documento a pagina sola non cambia di una virgola: `flow` e' falso
       e la struttura resta quella di prima. */
    if (flow) {
      return `<table class="pr-report doc-page doc-page--flow ${pageClass}">
        <thead><tr><td class="doc-flow-cell doc-flow-cell--head">
          <header class="doc-zone-head">${testata}</header>
        </td></tr></thead>
        ${/* 2.28 — LA CODA STA IN OGNI PAGINA, COME LA TESTATA.

              Un foglio di magazzino ha due fasce fisse e una che scorre: in
              alto chi manda e chi riceve, in basso i totali, il vettore, le
              date e le firme, e in mezzo la merce. Chi controlla in banchina
              li cerca sempre nello stesso punto del foglio — se la coda
              seguisse l'ultima riga starebbe a meta' pagina su un DDT da due
              partite e in fondo su uno da venti, e il foglio andrebbe riletto
              invece che guardato.

              QUINDI LA CODA STA DOVE STA IL PIEDE: nel `tfoot`, che e' il
              gruppo che il browser ripete su ogni foglio, e dipinta fuori dal
              flusso a `bottom: 0` come la filigrana. Il `tfoot` riserva la
              banda — l'altezza gliela scrive `_ancoraLaCoda`, che la misura
              una volta sola — e nessuna riga di merce puo' finirci dentro.

              CAMBIA UNA DECISIONE DELLA 2.24, e va detto: allora le firme
              erano state tolte dal piede perche' uscivano su ogni pagina e
              «chi firma non sa quale valga». Adesso escono su ogni pagina di
              proposito: la coda e' la fascia bassa del foglio, non la fine
              del documento, ed e' cosi' che il DDT si legge in banchina. */''}
        <tfoot><tr><td class="doc-flow-cell doc-flow-cell--foot">
          <footer class="doc-zone-foot">${coda}${firme}${piede}</footer>
        </td></tr></tfoot>
        <tbody><tr><td class="doc-flow-cell doc-flow-cell--body">
          ${filigrana}
          <section class="doc-zone-body">${body}</section>
        </td></tr></tbody>
      </table>`;
    }

    return `<div class="pr-report doc-page ${pageClass}">
      ${filigrana}

      <header class="doc-zone-head">${testata}</header>

      <section class="doc-zone-body">${body}${coda}</section>

      <footer class="doc-zone-foot">${piede}</footer>
    </div>`;
  },

  /* Emissione: riempie il contenitore, stampa, lo svuota. Il contenitore
     resta vuoto fuori dalla stampa. */
  _docPrint(html) {
    Feedback.clear();
    $('printReport').innerHTML = html;
    this._ancoraLaCoda();
    window.print();
    setTimeout(() => { $('printReport').innerHTML = ''; }, 1500);
  },

  /* ═══ 2.28 · LA BANDA DELLA CODA ════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

     La coda sta nel `tfoot` e il browser la ripete su ogni foglio, come la
     testata. Manca un numero solo: QUANTO ALTA è, perché il `tfoot` deve
     riservare in fondo a ogni pagina esattamente la banda che la coda
     dipinge. Riserva e disegno sono lo stesso numero — la regola della 2.27,
     estesa dal piede a tutta la fascia bassa — e se divergono la coda copre
     l'ultima riga di merce.

     IL NUMERO NON SI PUÒ SCRIVERE NEL FOGLIO DI STILE: la coda è alta quanto
     il documento la fa: un DDT con le annotazioni lunghe ha una fascia più
     alta di uno senza. Si misura, e si misura UNA volta: niente impaginazione
     rifatta a mano, nessun conto di righe. È la differenza fra questa versione
     e il primo tentativo, che provava a indovinare dove cadessero le pagine
     per mettere la coda in fondo all'ultima — e sbagliava di una riga.

     SI MISURA CON LE REGOLE DELLA CARTA. Vivono dentro `@media print`, che a
     video non si applica mai: senza tirarle fuori si misurerebbe un documento
     in rem al posto di uno in punti. Si rimettono fuori dal loro involucro per
     il tempo della misura — la stessa strada del banco a video — e si tolgono
     subito, dentro un giro solo: nessun disegno in mezzo, nessuno vede niente.

     SE LA MISURA NON SI PUÒ FARE non si rompe niente: senza la classe
     `doc-coda-ancorata` la fascia resta nel flusso del `tfoot`, cioè dove
     stava fino alla 2.27 — in fondo alle pagine piene e sotto l'ultima riga
     sull'ultima. Peggio, non rotto. */
  _ancoraLaCoda() {
    const foglio = $('printReport');
    const tabella = foglio?.querySelector('.doc-page--flow');
    const cella = tabella?.querySelector('.doc-flow-cell--foot') as HTMLElement | null;
    const fascia = tabella?.querySelector('.doc-zone-foot') as HTMLElement | null;
    /* Solo i documenti che scorrono: a pagina sola la colonna è flex, e la
       fascia bassa sta già in fondo per costruzione. */
    if (!foglio || !tabella || !cella || !fascia) return;

    const stile = document.createElement('style');
    stile.textContent = this._regoleDellaCarta()
      + '\n#printReport{display:block!important;position:absolute;left:-10000px;top:0;'
      + 'width:186mm;padding:0;box-sizing:border-box;}';
    document.head.appendChild(stile);
    try {
      /* Si misura la fascia PRIMA di toglierla dal flusso: un elemento
         `position: fixed` non ha più la larghezza della colonna, e le righe
         che porta si conterebbero sbagliate. */
      const alta = fascia.getBoundingClientRect().height;
      if (!(alta > 0)) return;
      cella.style.height = `${alta}px`;
      tabella.classList.add('doc-coda-ancorata');
    } finally {
      stile.remove();
    }
  },

  /* Le regole di stampa, fuori dal loro `@media`. Si scende dentro gli
     involucri — in questo applicativo i fogli stanno in `@layer app`, e un
     giro che guarda solo il primo livello non trova una sola regola di
     stampa. Rimesse fuori vincono su quelle dentro il layer, che e' lo stesso
     rapporto che hanno sulla carta. */
  _regoleDellaCarta() {
    const fuori: string[] = [];
    const scendi = (regole: CSSRuleList) => {
      for (const r of Array.from(regole)) {
        if (r instanceof CSSMediaRule) {
          if (/print/.test(r.conditionText || '')) {
            for (const d of Array.from(r.cssRules)) fuori.push(d.cssText);
          }
          continue;
        }
        const dentro = (r as CSSGroupingRule).cssRules;
        if (dentro && !(r instanceof CSSStyleRule)) scendi(dentro);
      }
    };
    for (const f of Array.from(document.styleSheets)) {
      try { scendi(f.cssRules); } catch { /* foglio di un'altra origine */ }
    }
    return fuori.join('\n');
  },

  _docWarnHTML() {
    const gaps = this._docSenderGaps();
    if (!gaps.length) return '';
    return `<div class="doc-warn">
      <b>${this._ico('alert-triangle')} Documento non conforme — anagrafica del mittente incompleta</b>
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

    const fmtTs = (ms: number | null | undefined) => ms
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
      sender: v.sender?.name ? v.sender : null,
      headExtra, body, docId: v.doc_id, pageClass: 'doc-page--vb',
      signs: [
        { role: 'Operatore magazzino', hint: v.operator || '' },
        { role: 'Responsabile magazzino', hint: 'Data e firma' },
        { role: 'Controllo qualità', hint: 'Data e firma' }
      ]
    }));
  },
} satisfies Vista;
