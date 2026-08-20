import { type Vista, $, $sel } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { riepiloga } from '../../modules/giacenzaArticolo';
import { formattaQuantita } from '../../modules/misure';
import { svg as barcodeSvg, primoCarattereFuoriSet } from '../../modules/code128';

export const VistaGiacenze = {
  selectLocation(code) {
    this.selectedLocation = code;
    this.renderDetail(code);
    $('detailPanel').classList.remove('collapsed');
    /* 2.1 — la classe stringe la zona centrale, e la mappa si ridisegna
       DOPO: disegnarla prima vorrebbe dire calcolarla sulla larghezza di
       un attimo fa, cioè sulla larghezza sbagliata. */
    document.body.classList.add('detail-open');
    this.renderMap();
  },

  closeDetail() {
    this.selectedLocation = null;
    $('detailPanel').classList.add('collapsed');
    document.body.classList.remove('detail-open');
    if (this.currentView === 'map') this.renderMap();
  },

  renderDetail(code) {
    const status = Store.getLocationStatus(code);
    const items = Store.getItemsAtLocation(code);
    const meta = Store.getLocationMeta(code);
    $('detailTitle').textContent = code;
    let html = `<div class="detail-section">
      <div class="detail-section-title">Informazioni</div>
      <div class="detail-field"><span class="df-label">Codice</span><span class="df-value mono">${this._esc(code)}</span></div>
      <div class="detail-field"><span class="df-label">Stato</span><span class="df-value"><span class="badge badge-${status === 'occupied' ? 'green' : status === 'blocked' ? 'red' : status === 'reserved' ? 'amber' : 'muted'}">${status}</span></span></div>
      ${meta?.blocked_reason ? `<div class="detail-field"><span class="df-label">Motivo</span><span class="df-value text-body-small">${this._esc(meta.blocked_reason)}</span></div>` : ''}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Azioni Stato</div>
      <div class="flex gap-sm flex-wrap">
        ${status !== 'blocked' && status !== 'disabled' ? `<button class="btn btn-sm btn-danger" onclick="App.setLocStatus('${code}','blocked')">🚫 Blocca</button>` : ''}
        ${status !== 'reserved' && status !== 'disabled' ? `<button class="btn btn-sm btn-warning" onclick="App.setLocStatus('${code}','reserved')">📋 Riserva</button>` : ''}
        ${(status === 'blocked' || status === 'reserved') ? `<button class="btn btn-sm btn-success" onclick="App.setLocStatus('${code}','empty')">✓ Libera</button>` : ''}
        ${status !== 'disabled' && items.length === 0 ? `<button class="btn btn-sm" onclick="App.toggleLocDisabled('${code}')">⊘ Disattiva</button>` : ''}
        ${status === 'disabled' ? `<button class="btn btn-sm btn-success" onclick="App.toggleLocDisabled('${code}')">✓ Riattiva</button>` : ''}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Item presenti (${items.length})</div>
      ${this._rigaTotaleVano(items)}`;
    if (!items.length) {
      html += '<div class="empty-state p-7.5"><p>Nessun item</p></div>';
    } else {
      html += '<div class="item-list">';
      for (const item of items) {
        const qty = item.qty || 1;
        const quarantined = Store.isItemQuarantined(item.item_key, code);
        const k = this._esc(item.item_key);
        /* 2.1 — LA GERARCHIA DELLA SCHEDA, e non è un riordino estetico.

           Chi apre un vano sulla mappa sta cercando UNA cosa: quale merce
           c'è e quanta ce n'è. Fino alla 2.0 leggeva codice e colli, poi
           la descrizione, poi il lotto, poi le UM: il lotto — che insieme
           al codice IDENTIFICA la merce, ed è il campo su cui si decide se
           quella è la riga giusta — arrivava terzo, dopo una descrizione
           commerciale che di righe ne descrive centinaia uguali.

           L'ordine adesso è: ① chi è (articolo e lotto) ② quanto ce n'è
           (colli e UM) ③ com'è fatto (descrizione) ④ com'è impilato (la
           distinta dei colli). Data di posizionamento, scadenza e note
           escono da qui e stanno dietro «Dettaglio»: si guardano quando
           servono, e non sono mai la domanda con cui si apre un vano. */
        html += `<div class="item-card">
          <div class="item-card-header">
            <span class="item-code">${this._esc(item.article_code)}</span>
            <span class="item-lot-inline mono">${this._esc(item.lot_code)}</span>
            ${quarantined ? '<span class="badge bg-sx-purple-soft text-sx-purple border border-sx-purple" title="Item già in quarantena">🔒 NC</span>' : ''}
          </div>
          <div class="item-qty">${qty} Coll.${this._umTotaliRiga(item)}</div>
          <div class="item-desc">${this._esc(item.article_description || '—')}</div>
          ${this._rigaUM(item)}
          <div class="item-actions item-actions-pari">
            <button class="btn btn-sm" title="Modifica i dati dell’item" onclick="App.showEditItemModal('${this._esc(code)}','${k}')">✏️ Modifica</button>
            <button class="btn btn-sm" title="Trasferisci in un’altra ubicazione" onclick="App.showMoveItemModal('${this._esc(code)}','${k}')">🔀 Trasferisci</button>
            ${quarantined
              ? '<button class="btn btn-sm" disabled title="Item gia’ in quarantena — il rilascio si fa da Movimenta">🔒 In quarantena</button>'
              : `<button class="btn btn-sm" title="Blocco qualità / non conformità" onclick="App.showQuarantineItemModal('${this._esc(code)}','${k}')">🚫 Quarantena</button>`}
            <button class="btn btn-sm" title="Tutto il resto: posizionamento, scadenza, note" onclick="App._dettaglioItem('${this._esc(code)}','${k}')">🔍 Dettaglio</button>
            <button class="btn btn-sm" title="Stampa l’etichetta identificativa" onclick="App._stampaEtichettaItem('${this._esc(code)}','${k}')">🏷 Etichetta</button>
          </div>
        </div>`;
      }
      html += '</div>';
    }
    html += `</div>
      <div class="detail-section">
        <button class="btn btn-success w-full" onclick="App.showAddItemModal('${code}')">+ Aggiungi item</button>
        <p class="text-label-small text-sx-text-muted mt-4.5 leading-[1.5]">
          L’uscita di giacenza non si esegue da qui: usare <strong>Movimenta → Smaltire</strong>,
          che registra il movimento con la sua causale.
        </p>
      </div>`;
    $('detailBody').innerHTML = html;
  },

  /* Le UM totali della riga, accanto ai colli. Vuoto dove la riga è a
     soli colli: uno zero direbbe che di quella merce ce n'è zero. */
  _umTotaliRiga(item) {
    const cfg = Store.getUomConfig(item?.article_code, item?.lot_code);
    if (!cfg) return '';
    const um = Store._uomDiRiga(item, cfg);
    if (typeof um !== 'number') return '';
    return ` · <span class="item-qty-uom">${this._esc(formattaQuantita(um, cfg.uom))} ${this._esc(cfg.uom)}</span>`;
  },

  /* 2.1 — TUTTO IL RESTO, dietro un pulsante. Posizionamento, scadenza,
     note e stato di quarantena non sono la domanda con cui si apre un
     vano, ma quando servono servono per intero: qui non si riassume
     niente. */
  _dettaglioItem(locationCode, itemKey) {
    const item = Store.getItemsAtLocation(locationCode).find((i) => i.item_key === itemKey);
    if (!item) return this.toast('Item non più presente in questa ubicazione', 'error');
    const q = Store.isItemQuarantined(itemKey, locationCode);
    this.showModal(
      `🔍 ${this._esc(item.article_code)} · lotto ${this._esc(item.lot_code)}`,
      `<div class="detail-section">
        <div class="detail-field"><span class="df-label">Ubicazione</span><span class="df-value mono">${this._esc(locationCode)}</span></div>
        <div class="detail-field"><span class="df-label">Descrizione</span><span class="df-value">${this._esc(item.article_description || '—')}</span></div>
        <div class="detail-field"><span class="df-label">Colli</span><span class="df-value">${item.qty || 0}</span></div>
        <div class="detail-field"><span class="df-label">Distinta colli</span><span class="df-value">${this._esc(Store.descriviRiga(item))}</span></div>
        <div class="detail-field"><span class="df-label">Scadenza</span><span class="df-value">${item.expiry_date ? this._esc(this._dateISOtoIT(item.expiry_date)) : '—'}</span></div>
        <div class="detail-field"><span class="df-label">Posizionato il</span><span class="df-value">${item.placed_at ? new Date(item.placed_at).toLocaleString('it-IT') : '—'}</span></div>
        <div class="detail-field"><span class="df-label">Da</span><span class="df-value mono">${this._esc(item.placed_by || '—')}</span></div>
        <div class="detail-field"><span class="df-label">Ultimo aggiornamento</span><span class="df-value">${item.last_updated_at ? new Date(item.last_updated_at).toLocaleString('it-IT') : '—'}</span></div>
        <div class="detail-field"><span class="df-label">Unità di carico</span><span class="df-value mono">${this._esc(item.udc_id || '—')}</span></div>
        <div class="detail-field"><span class="df-label">Quarantena</span><span class="df-value">${q ? '🔒 attiva' : 'no'}</span></div>
        <div class="detail-field"><span class="df-label">Note</span><span class="df-value">${this._esc(item.notes || '—')}</span></div>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Chiudi</button>
       <button class="btn btn-primary" onclick="App._stampaEtichettaItem('${this._esc(locationCode)}','${this._esc(itemKey)}')">🏷 Stampa etichetta</button>`
    );
  },

  /* 2.1 — L'ETICHETTA IDENTIFICATIVA DELLA MERCE, dalla sidebar.

     Non è l'etichetta di un'unità di carico: quella porta il solo codice
     perché il pallet si muove e tutto il resto invecchia. Questa sta
     attaccata a UNA merce in UN lotto, e i suoi dati non cambiano finché
     la merce è quella — articolo, lotto, scadenza. L'ubicazione invece sì:
     esce come «al momento della stampa», scritta piccola, perché chi
     rietichetta dopo uno spostamento deve poterlo vedere.

     Il codice a barre porta la chiave della riga, `ARTICOLO#LOTTO`, che è
     esattamente ciò che le maschere di Movimenta cercano. */
  _stampaEtichettaItem(locationCode, itemKey) {
    const item = Store.getItemsAtLocation(locationCode).find((i) => i.item_key === itemKey);
    if (!item) return this.toast('Item non più presente in questa ubicazione', 'error');
    const chiave = item.item_key;
    const fuori = primoCarattereFuoriSet(chiave);
    const codice = fuori === null
      ? barcodeSvg(chiave, { modulo: 0.4, altezza: 20, etichetta: chiave, descrizione: `Merce ${chiave}` })
      : `<div class="item-label-code">${this._esc(chiave)}</div>`;

    this.closeModal();
    this._docPrint(`<div class="item-label">
      <div class="item-label-art">${this._esc(item.article_code)}</div>
      <div class="item-label-desc">${this._esc(item.article_description || '')}</div>
      <div class="item-label-barcode">${codice}</div>
      <div class="item-label-body">
        <div><span>Lotto</span><b>${this._esc(item.lot_code)}</b></div>
        <div><span>Scadenza</span><b>${item.expiry_date ? this._esc(this._dateISOtoIT(item.expiry_date)) : '—'}</b></div>
        <div><span>Colli</span><b>${item.qty || 0}</b></div>
      </div>
      <div class="item-label-foot">Ubicazione alla stampa: ${this._esc(locationCode)}</div>
    </div>`);
  },

  /* 1.9 — QUANTO C'È IN QUESTO VANO, IN COLLI E IN UM. Le singole righe lo
     dicevano già una per una; il totale no, e chi guarda un'ubicazione con
     sei lotti dentro sommava a mente. I totali si fanno PER UNITÀ: in un
     vano possono convivere una riga a KG e una a PZ, e sommarle sarebbe
     scrivere un numero che non significa niente.

     Vuota quando la giacenza non ha unità: un vano a soli colli ha già il
     suo numero nel titolo della sezione, e ripeterlo non aggiunge niente. */
  _rigaTotaleVano(items) {
    if (!items?.length) return '';
    const r = riepiloga(Store.righeLette(items));
    if (!r.totali.length) return '';
    const um = r.totali.map((t) => `${formattaQuantita(t.quantita, t.uom)} ${this._esc(t.uom)}`).join(' · ');
    return `<div class="detail-field">
      <span class="df-label">In giacenza</span>
      <span class="df-value"><strong class="text-sx-accent">${r.colli} Coll.</strong> · <strong>${um}</strong>${
        r.senzaUnita ? ` <span class="badge badge-amber" title="${r.senzaUnita} righe non hanno unità di misura: il totale in UM non le comprende">⚠ ${r.senzaUnita} senza UM</span>` : ''
      }</span>
    </div>`;
  },

  showMoveItemModal(locationCode, itemKey) {
    const item = Store.getItemsAtLocation(locationCode).find(i => i.item_key === itemKey);
    if (!item) return this.toast('Item non trovato', 'error');
    const qty = item.qty || 1;
    this.showModal(
      `🔀 Trasferimento — da ${this._esc(locationCode)}`,
      `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        <span class="mono font-bold text-sx-primary">${this._esc(item.article_code)}</span>
        ${this._esc(item.article_description || '')}<br>
        Lotto <strong>${this._esc(item.lot_code)}</strong> · giacenza <strong class="text-sx-accent">${qty} Coll.</strong>
        ${item.expiry_date ? ` · Scad. ${this._esc(item.expiry_date)}` : ''}
      </div>
      <div class="form-row mb-6">
        <div class="form-group">
          <label>Ubicazione di destinazione <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="moveItemDest" placeholder="Scansiona o digita" autofocus maxlength="${Validate.MAX.LOC_CODE}"
            oninput="this.value=this.value.toUpperCase();App._moveItemDestPreview()"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App.doMoveItem('${this._esc(locationCode)}','${this._esc(itemKey)}')}">
          <div class="text-label-small mt-2 min-h-[1em]" id="moveItemDestPrev"></div>
        </div>
        <div class="form-group">
          <label>Colli da spostare <span class="req">*</span></label>
          <input class="input input-mono" id="moveItemQty" type="number" min="1" max="${qty}" value="${qty}">
          <div class="text-label-small text-sx-text-muted mt-2">Massimo ${qty} — lasciando ${qty} si sposta l’intera riga</div>
        </div>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doMoveItem('${this._esc(locationCode)}','${this._esc(itemKey)}')">🔀 Trasferisci</button>`
    );
  },

  /* Anteprima della destinazione: dire subito "bloccata" evita di scoprirlo
     dopo aver premuto conferma, con il carrello gia' davanti allo scaffale. */
  _moveItemDestPreview() {
    const el = $('moveItemDestPrev');
    if (!el) return;
    const dest = Validate.clean($('moveItemDest')?.value, true).replace(/'/g, '-');
    if (!dest) { el.innerHTML = ''; return; }
    if (!Store.locationExists(dest)) {
      el.innerHTML = '<span class="text-sx-danger">✗ Ubicazione inesistente</span>';
      return;
    }
    const st = Store.getLocationStatus(dest);
    const n = Store.getItemsAtLocation(dest).length;
    if (st === 'blocked')  { el.innerHTML = '<span class="text-sx-danger">✗ Ubicazione BLOCCATA</span>'; return; }
    if (st === 'disabled') { el.innerHTML = '<span class="text-sx-danger">✗ Ubicazione DISATTIVATA</span>'; return; }
    el.innerHTML = `<span class="text-sx-success">✓ ${this._esc(dest)}</span> <span class="text-sx-text-muted">— ${st}${n ? ` · ${n} item già presenti` : ' · vuota'}</span>`;
  },

  async doMoveItem(locationCode, itemKey) {
    if (!this._requireOperator('lo spostamento di un item')) return;
    const item = Store.getItemsAtLocation(locationCode).find(i => i.item_key === itemKey);
    if (!item) return this.toast('Item non più disponibile', 'error');
    const dest = Validate.clean($('moveItemDest')?.value, true).replace(/'/g, '-');
    const qty = parseInt($('moveItemQty')?.value, 10);

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
      ? `<div class="mov-preview mov-preview-err mb-6">
          <strong>📍 Ubicazione NC di destinazione:</strong> <span class="mono font-bold">${this._esc(nearest.code)}</span>
          <span class="text-sx-text-muted text-label-small"> (${this._esc(nearest.zoneName)}${nearest.hasItems ? ' — già contiene item' : ' — vuota'})</span>
        </div>`
      : `<div class="mov-preview mov-preview-warn mb-6">
          <strong>⛔ Nessuna ubicazione BLOCCATA configurata.</strong> La quarantena non può partire:
          scegliere in Mappa un'ubicazione da destinare alle NC e premere «Blocca».
        </div>`;
    this.showModal(
      `🚫 Quarantena item — ${this._esc(locationCode)}`,
      `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        <span class="mono font-bold text-sx-purple">${this._esc(item.article_code)}</span>
        ${this._esc(item.article_description || '')}<br>
        Lotto <strong>${this._esc(item.lot_code)}</strong> · <strong>${item.qty || 1} Coll.</strong>
      </div>
      ${destInfo}
      <!-- v1.1.0 [N2] — Colli da bloccare: la scheda ubicazione ha l'item
           davanti e puo' bloccarne una parte, come la maschera di Movimenta. -->
      <div class="flex gap-6 items-end flex-wrap mb-6">
        <div class="form-group w-[150px] mb-0">
          <label class="whitespace-nowrap">Colli da bloccare <span class="req">*</span></label>
          <input class="input input-mono text-center font-bold" id="qiQty" type="number" min="1" step="1" max="${item.qty || 1}"
            value="${item.qty || 1}">
        </div>
        <div class="text-label-small text-sx-text-muted pb-4 flex-1">
          Presenti <strong>${item.qty || 1} Coll.</strong> — bloccarne meno lascia gli altri conformi e utilizzabili.
        </div>
      </div>
      <div class="form-group mb-6">
        <label>Motivo del blocco <span class="req">*</span></label>
        <textarea class="input textarea" id="qiReason" rows="2" maxlength="${Validate.MAX.REASON}" placeholder="Descrivi il motivo della non conformità…" autofocus></textarea>
      </div>
      <div class="form-row mb-6">
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

    const qtyBlock = parseInt($('qiQty')?.value);
    if (!qtyBlock || qtyBlock < 1) {
      $('qiQty')?.focus();
      return this.toast('Colli da bloccare: valore non valido', 'error');
    }

    const out = await this._quarantineItemCore(item, {
      reason:    Validate.clean($('qiReason')?.value),
      operator:  Validate.clean($('qiOperator')?.value),
      refDept:   Validate.clean($('qiRefDept')?.value),
      refPerson: Validate.clean($('qiRefPerson')?.value),
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

    const fmtDate = (ts: number | null | undefined) => ts ? new Date(ts).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

    this.showModal(
      `✏️ Modifica Item — ${this._esc(locationCode)}`,
      `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        <span class="mono font-bold text-sx-primary">${this._esc(item.article_code)}</span> ·
        Lotto <strong>${this._esc(item.lot_code)}</strong> ·
        📅 Inserito: ${fmtDate(item.placed_at)}
      </div>

      <div class="bg-sx-warning-soft border border-sx-warning rounded-[var(--radius)] py-4.5 px-6 mb-8.5 text-body-small text-sx-warning">
        ⚠ Modificare <strong>Codice Articolo</strong> o <strong>Lotto</strong> cambia l'identificativo dell'item e viene registrato nel log.
      </div>

      <div class="form-row mb-6">
        <div class="form-group">
          <label>Codice Articolo <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="editItemArt" value="${this._esc(item.article_code)}" maxlength="${Validate.MAX.ARTICLE_CODE}"
            oninput="this.value=this.value.toUpperCase();App._editItemArtLookup()">
          <div class="text-label-small mt-1.5 text-sx-text-muted" id="editItemArtInfo"></div>
        </div>
        <div class="form-group">
          <label>Lotto <span class="req">*</span></label>
          <input class="input input-mono" id="editItemLot" value="${this._esc(item.lot_code)}" maxlength="${Validate.MAX.LOT_CODE}">
        </div>
      </div>

      <div class="form-group mb-6">
        <label>Descrizione Articolo</label>
        <input class="input" id="editItemDesc" value="${this._esc(item.article_description || '')}" maxlength="120" placeholder="Descrizione articolo">
      </div>

      <div class="form-row mb-6">
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

      <div class="form-group mb-4">
        <label>Note</label>
        <textarea class="input textarea" id="editItemNotes" rows="2" maxlength="${Validate.MAX.NOTES}" placeholder="Note operative (opzionale)">${this._esc(item.notes || '')}</textarea>
      </div>

      <div class="hidden bg-sx-danger-soft border border-sx-danger rounded-[var(--radius)] py-4.5 px-6 mt-5 text-body-small text-sx-danger" id="editItemKeyWarn">
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
    const code = ($('editItemArt')?.value || '').toUpperCase().trim();
    const info = $('editItemArtInfo');
    const warnEl = $('editItemKeyWarn');
    if (!info) return;
    const art = Store.getArticle(code);
    if (art) {
      info.innerHTML = `<span class="text-sx-success">✓</span> ${this._esc(art.description)} <span class="badge badge-muted">${this._esc(art.category || '')}</span>`;
      // Suggerisce descrizione se campo vuoto
      const descEl = $('editItemDesc');
      /* UN ARTICOLO SENZA DESCRIZIONE LASCIA IL CAMPO VUOTO, non ci scrive
         la parola «undefined». `.value` di un `undefined` diventa quella
         stringa, e da lì finiva sulla riga di giacenza e in ogni export che
         la rilegge. Il `as string` che stava qui non convertiva niente:
         diceva al compilatore di non guardare. La descrizione è
         facoltativa in anagrafica, quindi l'assenza è un caso normale e si
         scrive come si scrive un'assenza. */
      if (descEl && !descEl.value.trim()) descEl.value = art.description ?? '';
    } else if (code) {
      info.innerHTML = `<span class="text-sx-warning">⚠ Codice non in anagrafica — verrà aggiunto automaticamente al salvataggio</span>`;
    } else {
      info.innerHTML = '';
    }
    // Mostra avviso cambio key se articolo o lotto sono diversi dall'originale
    if (warnEl) {
      const lotEl = $('editItemLot');
      const origKey = $('editItemArt')?.closest('.modal')
        ? null : null; // non disponibile qui, gestito in doEditItem
      warnEl.style.display = 'none'; // aggiornato in doEditItem al click
    }
  },

  /* Esegue il salvataggio delle modifiche all'item */
  async doEditItem(locationCode, originalItemKey) {
    if (!this._requireOperator('la modifica dati item')) return;   // v2.0.1 [B7]
    const art = Validate.clean($('editItemArt')?.value, true);
    const lot = Validate.clean($('editItemLot')?.value);
    const desc = Validate.clean($('editItemDesc')?.value);
    // v2.3.0 [D1] — il campo è in formato gg/mm/aaaa: conversione a ISO per lo storage/FEFO
    const exp = this._dateITtoISO($('editItemExp')?.value, 'Scadenza');
    if (exp === null) return;   // data incompleta o non valida → salvataggio interrotto
    const qtyRaw = parseInt($('editItemQty')?.value);
    const notes = Validate.clean($('editItemNotes')?.value);

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
      const warnEl = $('editItemKeyWarn');
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
  },  showAddItemModal(locationCode) {
    const articles = Store.getArticles();
    let artOptions = '<option value="">— Seleziona o digita nuovo —</option>';
    for (const a of articles) artOptions += `<option value="${this._esc(a.code)}" data-desc="${this._esc(a.description)}">${this._esc(a.code)} — ${this._esc(a.description)}</option>`;
    this.showModal(`Aggiungi Item — ${locationCode}`, `
      <div class="form-group mb-6"><label>Articolo esistente</label>
        <select class="select" id="itemArticleSelect" onchange="App.onArticleSelect()">${artOptions}</select></div>
      <div class="form-row mb-6">
        <div class="form-group"><label>Codice Articolo <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="itemArticleCode" placeholder="MP-001234" maxlength="${Validate.MAX.ARTICLE_CODE}"></div>
        <div class="form-group"><label>Descrizione <span class="req">*</span></label>
          <input class="input" id="itemArticleDesc" placeholder="Vitamina C 500mg" maxlength="${Validate.MAX.ARTICLE_DESC}"></div>
      </div>
      <div class="form-row mb-6">
        <div class="form-group"><label>Codice Lotto <span class="req">*</span></label>
          <input class="input input-mono" id="itemLotCode" placeholder="L240815" maxlength="${Validate.MAX.LOT_CODE}"></div>
        <div class="form-group"><label>Scadenza (opz.)</label>
          <input class="input" id="itemExpiry" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10" oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this)"></div>   <!-- v2.3.0 [D1]: era type=month -->
      </div>
      <div class="form-row mb-6">
        <div class="form-group"><label>Colli <span class="req">*</span></label>
          <input class="input input-mono text-center font-bold" id="itemQty" type="number" min="1" step="1" value="1"></div>
        <div class="form-group"><label>&nbsp;</label>
          <div class="text-label-small text-sx-text-muted pt-4">Se il lotto è già presente, i colli si sommano.</div></div>
      </div>
      <div class="form-group"><label>Note</label>
        <input class="input" id="itemNotes" placeholder="Opzionale" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-success" onclick="App.doAddItem('${locationCode}')">✓ Aggiungi</button>`);
  },

  onArticleSelect() {
    const sel = $sel('itemArticleSelect');
    /* Il gestore parte da un cambio della tendina: una voce scelta c'e'. */
    const opt = sel.options[sel.selectedIndex]!;
    if (opt.value) {
      $('itemArticleCode').value = opt.value;
      $('itemArticleDesc').value = opt.dataset.desc || '';
    }
  },

  async doAddItem(locationCode) {
    const code = Validate.clean($('itemArticleCode').value, true);
    const desc = Validate.clean($('itemArticleDesc').value);
    const lot = Validate.clean($('itemLotCode').value);
    // v2.3.0 [D1] — il campo scadenza è in formato gg/mm/aaaa: conversione a ISO
    const expiry = this._dateITtoISO($('itemExpiry').value, 'Scadenza');
    if (expiry === null) return;   // data incompleta o non valida → inserimento interrotto
    const notes = Validate.clean($('itemNotes').value);
    const qty = parseInt($('itemQty')?.value) || 1;  // v1.7.0
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
} satisfies Vista;
