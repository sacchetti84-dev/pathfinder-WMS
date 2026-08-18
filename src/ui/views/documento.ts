import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { pickupAlertStatus } from '../../modules/pickupAlert';
import { Dialog } from '../dialog';

export const VistaDocumento: Vista = {
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
    const totalColli = s.lines.reduce((acc: any, l: any) => acc + (l.qty || 0), 0);
    // Render righe
    const linesHtml = s.lines.length === 0
      ? `<div class="pick-cart-empty">Nessuna riga — aggiungerne almeno una prima di salvare</div>`
      : s.lines.map((l: any, i: any) => {
        const expBadge = l.expiry_date ? ` · scad. ${this._esc(l.expiry_date)}` : '';
        return `<div class="pick-cart-item" style="border-left:3px solid ${themeColor};flex-wrap:wrap;align-items:flex-start">
          <div class="pci-num" style="background:${themeColor}">${i+1}</div>
          <div class="pci-info flex-1 min-w-[200px]">
            <div class="pci-code">${this._esc(l.article_code)} <span class="text-sx-text-muted font-normal text-label-small">${this._esc(l.article_description || '')}</span></div>
            <div class="pci-loc">L:${this._esc(l.lot_code)} · 📍 ${this._esc(l.location_code)}${expBadge}</div>
            <div class="flex gap-4 items-center mt-3 flex-wrap">
              <label class="text-label-small text-sx-text-muted">Qty:</label>
              <input class="input input-mono w-[70px] text-center font-bold py-2 px-3" type="number" min="1" step="1" value="${l.qty}"
                onchange="App._editLineQty(${i}, this.value)">
              <span class="text-label-small text-sx-text-muted">(orig. ${l.qty_at_creation || l.qty})</span>
            </div>
            <div class="mt-3">
              <input class="input text-label-small py-2.5 px-4" placeholder="Note riga (opz.)" maxlength="${Validate.MAX.NOTES}" value="${this._esc(l.notes || '')}"
                onchange="App._editLineNotes(${i}, this.value)">
            </div>
          </div>
          <button class="btn btn-sm btn-ghost" class="text-sx-danger self-center" onclick="App._editRemoveLine(${i})" title="Rimuovi riga">✕</button>
        </div>`;
      }).join('');
    // Form per aggiungere nuova riga
    const newLineHtml = `<details class="mt-6">
      <summary style="cursor:pointer;font-size: var(--md-sys-typescale-body-small-size);font-weight:600;color:${themeColor};padding:0.4rem 0.5rem;background:${isRes ? 'var(--grad-soft-teal)' : 'var(--grad-soft-orange)'};border:1px solid ${themeColor};border-radius:var(--radius)">
        ➕ Aggiungi nuova riga al DDT
      </summary>
      <div class="border border-sx-border [border-top:none] rounded-b-[var(--radius)] p-5 bg-sx-card-alt">
        <div class="form-group mb-3">
          <label class="text-label-small">① Articolo</label>
          <input class="input input-mono uppercase" id="pEditArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();$('pEditLot')?.focus();}">
        </div>
        <div class="form-group mb-3">
          <label class="text-label-small">② Lotto</label>
          <input class="input input-mono" id="pEditLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._editLookupNewLine();}">
          <div id="pEditInfo"></div>
        </div>
        <div id="pEditDetails" class="hidden">
          <div id="pEditPreview"></div>
          <div class="flex gap-4 mb-3 items-end">
            <div class="form-group w-[120px] mb-0">
              <label class="text-label-small">Qty</label>
              <input class="input input-mono text-center font-bold py-2 px-3" id="pEditQty" type="number" min="1" step="1" value="1"
                onkeydown="if(event.key==='Enter'){event.preventDefault();App._editAddNewLine();}">
            </div>
            <div class="text-label-small text-sx-text-muted pb-3">Disp.: <strong id="pEditAvail" style="color:${themeColor}">—</strong></div>
          </div>
          <input class="input text-label-small py-2.5 px-4 mb-3" id="pEditNotes" maxlength="${Validate.MAX.NOTES}" placeholder="Note riga (opz.)">
          <button class="btn btn-sm" style="width:100%;background:${themeColor};color:#fff;border-color:${themeColor};font-weight:700" onclick="App._editAddNewLine()">+ Aggiungi al DDT</button>
        </div>
      </div>
    </details>`;
    // Persisti header attuale prima di re-render (se modal già aperta)
    const existing = $('editPendingModal');
    if (existing) this._editPersistHeader();
    existing?.remove();
    // Crea overlay e appendi al body (pattern usato da operatorModal)
    const overlay = document.createElement('div');
    overlay.id = 'editPendingModal';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) App._editCancel(); });
    overlay.innerHTML = `<div class="modal max-w-[680px] w-[95%]">
      <div class="modal-header">
        <h2>${themeIcon} Modifica DDT ${themeLabel} pendente</h2>
        <button class="btn btn-sm btn-icon btn-ghost" onclick="App._editCancel()">✕</button>
      </div>
      <div class="modal-body">
        <div class="text-label-small text-sx-text-muted bg-[var(--grad-soft-blue)] py-4 px-5 rounded-[var(--radius)] mb-6">
          Modifiche permesse solo su DDT in stato <strong>pendente</strong>. Le righe vengono validate al salvataggio finale (re-check disponibilità).
        </div>
        <!-- TESTATA -->
        <div style="background:${isRes ? 'var(--grad-soft-teal)' : 'var(--grad-soft-orange)'};border:1px solid ${themeColor};border-radius:var(--radius);padding:0.5rem 0.6rem;margin-bottom:0.6rem">
          <div style="font-size: var(--md-sys-typescale-label-small-size);color:${themeColor};font-weight:700;margin-bottom:0.3rem">📋 TESTATA DDT</div>
          <div class="form-row mb-4">
            <div class="form-group">
              <label>N° DDT</label>
              <input class="input input-mono" id="pEditDdt" maxlength="40" value="${this._esc(s.ddt_num)}">
            </div>
            <div class="form-group">
              <label>${targetLabel}</label>
              <input class="input" id="pEditDest" placeholder="${targetPlaceholder}" maxlength="${Validate.MAX.OPERATOR}" value="${this._esc(s.destination)}">
            </div>
          </div>
          <div class="form-row mb-0">
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
        <div class="flex justify-between items-center mt-7 mx-0 mb-2.5">
          <strong class="text-body-small">📦 Righe DDT <span style="color:${themeColor}">(${s.lines.length})</span> · Tot. <strong style="color:${themeColor}">${totalColli} Coll.</strong></strong>
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
      .filter((_: any, j: any) => j !== idx)
      .filter((l2: any) => l2.location_code === line.location_code && l2.item_key === line.item_key)
      .reduce((acc: any, l2: any) => acc + (l2.qty || 0), 0);
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
    const art = Validate.clean($('pEditArt')?.value, true);
    const lot = Validate.clean($('pEditLot')?.value);
    const info = $('pEditInfo');
    const details = $('pEditDetails');
    if (!art || !lot) {
      info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">✗ Articolo e lotto obbligatori</div>`;
      return;
    }
    if (Validate.article(art) || Validate.lot(lot)) {
      info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">✗ Formato non valido</div>`;
      return;
    }
    const allItems = Store.findItemLocations(art).filter(it => it.lot_code === lot && !Store.isItemQuarantined(it.item_key, it.location_code));
    if (!allItems.length) {
      info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">✗ Item ${this._esc(art)}#${this._esc(lot)} non disponibile in magazzino</div>`;
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
        .filter((l2: any) => l2.location_code === it.location_code && l2.item_key === it.item_key)
        .reduce((acc: any, l2: any) => acc + (l2.qty || 0), 0);
      const avail = Math.max(0, totalQty - pendingFromOthers - inEditedDoc);
      return { ...it, _totalQty: totalQty, _availableQty: avail };
    });
    const usable = enriched.filter(it => it._availableQty > 0);
    if (!usable.length) {
      info.innerHTML = `<div class="text-body-small text-sx-warning mt-2">⚠ Tutta la giacenza di ${this._esc(art)}#${this._esc(lot)} è impegnata</div>`;
      details.classList.add('hidden');
      return;
    }
    if (usable.length === 1) { this._editSelectNewLineItem(usable[0]); return; }
    // Più ubicazioni: mostra elenco
    let html = '<div class="max-h-[160px] overflow-y-auto mt-3"><div class="text-label-small text-sx-text-muted mb-2">Item presente in più ubicazioni:</div>';
    for (const it of usable) {
      const p = App._payload(it);
      html += `<div class="inv-item-row cursor-pointer text-label-small" onclick="App._editSelectNewLineEnc('${p}')">
        <div class="inv-info">
          <div class="inv-code">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal text-label-small">${this._esc(it.article_description || '')}</span></div>
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
    $('pEditInfo').innerHTML = '';
    const expBadge = cur.expiry_date ? ` · scad. ${this._esc(cur.expiry_date)}` : '';
    $('pEditPreview').innerHTML = `<div class="mov-preview mb-3 text-label-small">
      <strong>${this._esc(cur.article_code)}</strong> <span class="text-sx-text-muted">${this._esc(cur.article_description || '')}</span><br>
      <span class="text-sx-text-muted text-label-small">L:${this._esc(cur.lot_code)} · 📍 ${this._esc(cur.location_code)} · disp. <strong>${item._availableQty} Coll.</strong>${expBadge}</span>
    </div>`;
    const qe = $('pEditQty');
    if (qe) { qe.value = item._availableQty; qe.max = item._availableQty; }
    const av = $('pEditAvail'); if (av) av.textContent = item._availableQty;
    $('pEditDetails').classList.remove('hidden');
    qe?.focus();
    qe?.select();
  },

  /* Aggiunge la nuova riga al DDT in edit. */
  _editAddNewLine() {
    const s = this._editState;
    if (!s?.newLineState?.item) return this.toast('Identifica prima un item', 'error');
    const ns = s.newLineState;
    const qty = parseInt($('pEditQty')?.value);
    const notes = Validate.clean($('pEditNotes')?.value);
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
    const ddt = $('pEditDdt')?.value;
    const dest = $('pEditDest')?.value;
    const carrier = $('pEditCarrier')?.value;
    const expected = $('pEditExpected')?.value;
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
        .filter((_: any, j: any) => j !== i)
        .filter((l2: any) => l2.location_code === l.location_code && l2.item_key === l.item_key)
        .reduce((acc: any, l2: any) => acc + (l2.qty || 0), 0);
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
      const fa = $('movFormArea');
      if (fa) this._formSpedizioni(fa);
      // Aggiorna anche dashboard se visibile
      if (this.currentView === 'dashboard') this.renderDashboard();
    } catch (err: any) {
      this.toast(`Errore: ${err.message || 'sconosciuto'}`, 'error');
    }
  },

  _editCancel() {
    this._editState = null;
    $('editPendingModal')?.remove();
  },
};
