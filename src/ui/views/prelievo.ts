import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import type { Giacenza } from '../../types/entita';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';

/* Una riga del carrello di produzione: la giacenza da cui si preleva, più
   quanto se ne porta via e quanto ce n'era. */
type VoceCarrelloProd = Giacenza & {
  qty_pick: number;
  qty_avail: number;
  qty_phys: number;
};

export const VistaPrelievo = {
  // ═══ 3. PRELIEVO (3 sub-flussi) ═══
  _formPrelievo(el) {
    el.innerHTML = `<div class="mov-form-card">
      <h3>${this._ico('forklift')} <span class="text-sx-accent">Prelievo</span></h3>
      <div class="prel-tabs">
        <button class="prel-tab ${this._pickSubMode === 'cambio' ? 'active' : ''}" onclick="App._pickSub('cambio')"><span class="prel-tab-icon">${this._ico('refresh')}</span>Trasferimento</button>
        <button class="prel-tab ${this._pickSubMode === 'produzione' ? 'active' : ''}" onclick="App._pickSub('produzione')"><span class="prel-tab-icon">${this._ico('building-factory')}</span>Prelievo Produzione</button>
        <button class="prel-tab ${this._pickSubMode === 'ordine' ? 'active' : ''}" onclick="App._pickSub('ordine')"><span class="prel-tab-icon">${this._ico('compass')}</span>Prelievo automatico</button>
        <button class="prel-tab ${this._pickSubMode === 'wip' ? 'active' : ''}" onclick="App._pickSub('wip')"><span class="prel-tab-icon">${this._ico('forklift')}</span>WIP</button>
      </div>
      <div id="pickSubForm"></div>
      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">${this._ico('x')} Chiudi</button></div>
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
    this._formPrelievo($('movFormArea'));
  },

  _renderPickSub() {
    const el = $('pickSubForm');
    if (!el) return;
    if (this._pickSubMode === 'cambio') this._formCambio(el);
    else if (this._pickSubMode === 'produzione') this._formProduzione(el);
    else if (this._pickSubMode === 'ordine') this._formOrdine(el);   // v2.5.0
    else if (this._pickSubMode === 'wip') this._formWip(el);         // 1.14
  },

  // ── 3A. CAMBIO UBICAZIONE ──
  // v1.8.0: richiede scansione ARTICOLO + LOTTO (doppia identificazione obbligatoria)
  _formCambio(el) {
    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① ARTICOLO</span> → <span class="wf-step">② LOTTO</span> → INVIO per cercare → <span class="wf-step">③ NUOVA UBICAZIONE</span> → INVIO per trasferire.
      </div>
      <div class="form-group mb-5">
        <label>① Scansiona Articolo <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="pCambioArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('pCambioLot')?.focus();}">
      </div>
      <div class="form-group mb-5">
        <label>② Scansiona Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="pCambioLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._cambioLookup();}">
        <div id="pCambioInfo"></div>
      </div>
      <div id="pCambioDestArea" class="hidden">
        <div class="form-group mb-5">
          <label>③ Nuova Ubicazione <span class="req">*</span></label>
          <div class="flex gap-3">
            <input class="input input-mono flex-1" id="pCambioDest" placeholder="Scansiona destinazione" maxlength="${Validate.MAX.LOC_CODE}"
              oninput="App._normScan('pCambioDest');App._previewLoc('pCambioDest','pCambioDestPrev')"
              onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('pCambioDest');App._execCambio();}">
            <button class="btn btn-sm" onclick="App._pickLoc('pCambioDest','_cbPickCambio')">${this._ico('map-pin')}</button>
          </div>
          <div id="pCambioDestPrev"></div>
        </div>
        ${/* 1.4.2.1 — il campo dei colli compare SOLO quando il cambio e' stato
             aperto da un'attivita': fuori di li' il cambio ubicazione sposta il
             lotto intero, ed e' cosi' da sempre. Un compito invece puo' chiederne
             una parte, e i parziali lasciano il residuo — decisione 45. */
          this._taskRun?.type === 'TRANSFER' ? `
        <div class="form-group mb-5">
          <label>Colli da spostare <span class="req">*</span></label>
          <input class="input input-mono max-w-[120px] text-center font-bold" id="pCambioQty" type="number" min="1" step="1">
          <div class="text-label-small text-sx-text-muted mt-1.5">Spostarne meno lascia il resto in attività.</div>
        </div>` : ''}
        <button class="btn btn-primary btn-conferma" onclick="App._execCambio()">${this._ico('refresh')} CONFERMA CAMBIO</button>
      </div>
      <div class="mt-4" id="pCambioFeedback"></div>`;
    $('pCambioArt')?.focus();
  },

  _cbPickCambio() { setTimeout(() => App._previewLoc('pCambioDest','pCambioDestPrev'), 30); },

  _cambioLookup() {
    // v1.8.0: identificazione obbligatoria con ARTICOLO + LOTTO
    const art = Validate.clean($('pCambioArt')?.value, true);
    const lot = Validate.clean($('pCambioLot')?.value);
    const info = $('pCambioInfo');
    if (!art) {
      info.innerHTML = `<div class="mov-preview mov-preview-err mt-3">${this._ico('circle-x')} Scansiona prima il codice articolo</div>`;
      $('pCambioArt')?.focus();
      return;
    }
    if (!lot) {
      info.innerHTML = `<div class="mov-preview mov-preview-err mt-3">${this._ico('circle-x')} Scansiona il codice lotto — entrambi i campi sono obbligatori</div>`;
      $('pCambioLot')?.focus();
      return;
    }
    const itemKey = `${art}#${lot}`;
    if (Store.isItemQuarantined(itemKey)) {
      info.innerHTML = `<div class="mov-preview mov-preview-err mt-3">
        ${this._ico('ban')} <strong>Item in QUARANTENA</strong> — spostamento non consentito.<br>
        <span class="text-label-small">Per rimetterlo in circolo usare <strong>Quarantena → Rilascio</strong>, che registra operatore, responsabile e ubicazione di destinazione conforme.</span>
      </div>`;
      return;
    }
    const allItems = Store.findItemLocations(art);
    const matched = allItems.filter(it => it.lot_code === lot);
    if (!matched.length) {
      info.innerHTML = `<div class="mov-preview mov-preview-err mt-3">${this._ico('circle-x')} Item ${this._esc(art)}#${this._esc(lot)} non trovato in nessuna ubicazione</div>`;
      return;
    }
    if (matched.length === 1) { this._cambioSelect(matched[0]); return; }
    // Multipli (stesso lotto in ubicazioni diverse)
    let html = '<div class="max-h-[180px] overflow-y-auto mt-3"><div class="text-label-small text-sx-text-muted mb-3">Stesso lotto presente in più ubicazioni — seleziona la partenza:</div>';
    for (const it of matched) {
      const payload = App._payload({ loc: it.location_code, key: it.item_key, art: it.article_code, lot: it.lot_code, desc: it.article_description || '' });
      html += `<div class="inv-item-row cursor-pointer" onclick="App._cambioSelectEnc('${payload}')">
        <div class="inv-info">
          <div class="inv-code">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">Lotto: ${this._esc(it.lot_code)} · ${this._ico('map-pin')} <strong>${this._esc(it.location_code)}</strong> · <strong class="text-sx-accent">${it.qty || 1} Coll.</strong></div>
        </div>
        <span class="text-sx-accent">→</span>
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
    $('pCambioInfo').innerHTML = `<div class="mov-preview mov-preview-ok mt-3">
      <span class="mono font-bold">${this._esc(full.article_code)}</span> — ${this._esc(full.article_description || '')}
      <div class="mono text-body-small mt-[2px]">Lotto: ${this._esc(full.lot_code)} · DA: <strong>${this._esc(full.location_code)}</strong></div>
    </div>`;
    $('pCambioDestArea')?.classList.remove('hidden');
    $('pCambioDest')?.focus();
  },

  async _moveItemCore({ item, dest, qty = null }) {
    const err = Validate.location(dest);
    if (err) { this.toast(err, 'error'); return { ok: false }; }
    if (!Store.locationExists(dest)) { this.toast(`Ubicazione ${dest} non trovata`, 'error'); return { ok: false }; }
    const destStatus = Store.getLocationStatus(dest);
    if (destStatus === 'blocked')  { this.toast(`Destinazione ${dest} BLOCCATA`, 'error'); return { ok: false }; }
    if (destStatus === 'disabled') { this.toast(`Destinazione ${dest} DISATTIVATA`, 'error'); return { ok: false }; }
    if (item.location_code === dest) { this.toast('Origine e destinazione coincidono', 'error'); return { ok: false }; }

    /* ═══ 2.35.1 · UNA RIGA SU UN BANCALE SI SPOSTA COL BANCALE ══════════
       Segnalato dal magazzino l'08/09: trasferendo un'unità dalla zona
       imballaggio alla zona spedizioni «viene trasferito solo il contenuto e
       l'UDC rimane in zona imballaggi sparendo».

       Ed era esatto. Questo trasferimento è un `removeItem` più un
       `addItem`, e `addItem` non ha nessun argomento per l'unità: la riga
       arrivava di là SENZA `udc_id`, cioè come merce sciolta, e il
       contenitore restava indietro nel vano di partenza — vuoto, quindi
       marcato `empty` e sparito dall'elenco. Un bancale etichettato e
       imballato diventava merce anonima in banchina, e il carico del camion
       — che si fa scansionando il codice del pallet — non aveva più niente
       da scansionare.

       `Store.moveUdc` esiste dalla 1.4 e fa la cosa giusta: righe e
       contenitore insieme, in una transazione sola sul servizio. Nessuno la
       chiamava da qui. Adesso sì.

       E UN PARZIALE SU UN'UNITÀ NON È UN TRASFERIMENTO: è aprire il
       bancale. Si dice, e non si fa di nascosto. */
    if (item.udc_id) {
      const u = Store.getUdc(item.udc_id);
      const parzialeChiesto = qty !== null && Number(qty) < (item.qty || 1);
      if (parzialeChiesto) {
        this.toast(`${item.article_code}#${item.lot_code} sta sull'unità ${item.udc_id}: `
          + 'per portarne via una parte va prima scaricata dall’unità.', 'error');
        return { ok: false };
      }
      const righe = Store.righeDiUdc(item.udc_id);
      /* I DDT che hanno prenotato quel che sta sopra: le loro righe
         continueranno a nominare il vano di prima, ed è lo stesso avviso che
         la merce sciolta riceve più sotto. */
      const impegni = [...new Set(righe.flatMap((r) =>
        Store.getPendingDocsForItem(r.location_code, r.item_key).map((d) => d.ddt_num)))];
      const ok = await Dialog.confirm({
        title: 'Spostare tutta l’unità?',
        message: `${item.article_code}#${item.lot_code} sta sull’unità ${item.udc_id}. `
          + 'Il bancale si sposta intero: contenitore ed etichetta vanno in destinazione con la merce.'
          + (impegni.length ? '\n\nLe righe dei DDT qui sotto continueranno a indicare il vano di partenza: vanno riallineate.' : ''),
        details: Dialog.kv([
          ['Unità', item.udc_id],
          ['Da', u?.location_code || item.location_code],
          ['A', dest],
          ['Partite a bordo', righe.length],
          ['Colli totali', righe.reduce((s, r) => s + (Number(r.qty) || 0), 0)],
          ['DDT pendenti', impegni.length ? impegni.join(', ') : null]
        ]),
        confirmLabel: 'Sposta l’unità', icon: 'forklift'
      });
      if (!ok) { this.toast('Trasferimento annullato', 'info'); return { ok: false }; }
      const utente = Store.getCurrentIdentity().initials;
      try {
        await Store.moveUdc(item.udc_id, dest, {
          type: MOV.MOVE, article_code: item.article_code,
          article_description: item.article_description || '', lot_code: item.lot_code,
          location_code: u?.location_code || item.location_code, dest_location: dest,
          user: utente, notes: `Unità ${item.udc_id} spostata intera`, ts: Date.now(),
        });
      } catch (err) {
        this.toast(`L’unità non si è spostata · ${(err as Error).message}`, 'error');
        return { ok: false };
      }
      const mossi = righe.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      this.toast(`${item.udc_id}: ${u?.location_code || item.location_code} → ${dest} · `
        + `${righe.length} partit${righe.length === 1 ? 'a' : 'e'}, ${mossi} Coll.`, 'success');
      this.updateSyncIndicator();
      this._refreshSessionLog();
      await this._taskAvanza(mossi, ['TRANSFER']);
      return { ok: true, qtyMoved: mossi, mergeMsg: '', impactedDocs: [], partial: false };
    }

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
      const msg = `${this._ico('alert-triangle')} MERCE IMPEGNATA SU DDT PENDENTI\n\n` +
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
    const scelteColli = await this._chiediColli(item, 'Quali colli si spostano',
      null, { colli: partial ? qtyToMove : (item.qty || 1) });
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
    await this._logMov(MOV.MOVE, item.article_code, item.article_description, item.lot_code, item.location_code, dest, Store.getCurrentIdentity().initials, impactNote, '', qtyAvail, parzialeVero ? -nMossi : 0, parzialeVero ? removed._qty_after : nMossi, this._umMossa(removed));
    const mergeMsg = res.mode === 'incremented' ? ` (sommato: saldo ${res.qty_after} Coll. in ${dest})` : '';
    this.toast(`${item.article_code}#${item.lot_code}: ${item.location_code} → ${dest} · ${nMossi} Coll.${mergeMsg}`, 'success');
    if (impactedDocs.length) {
      this.toast(`${impactedDocs.length} DDT pendente/i ora disallineato/i — verificare in Movimenta`, 'warning');
    }
    this.updateSyncIndicator();
    this._refreshSessionLog();
    await this._taskAvanza(nMossi, ['TRANSFER']);   // 1.4.2.1
    return { ok: true, qtyMoved: nMossi, mergeMsg, impactedDocs, partial: parzialeVero };
  },

  async _execCambio() {
    if (!this._requireOperator('il cambio ubicazione')) return;   // v2.0.1 [B7]
    if (!this._moveSelection) return this.toast('Scansiona prima un articolo', 'error');
    const dest = Validate.clean($('pCambioDest')?.value, true).replace(/'/g, '-');

    /* Il campo esiste solo sotto un'attivita': senza, `null` vuol dire «tutto
       il lotto», che e' il cambio ubicazione di sempre. */
    const qtyEl = $('pCambioQty');
    const qtyTask = qtyEl ? parseInt(qtyEl.value, 10) : null;
    if (qtyEl && !(qtyTask! > 0)) { qtyEl.focus(); return this.toast('Colli da spostare: valore non valido', 'error'); }

    const out = await this._moveItemCore({ item: this._moveSelection, dest, qty: qtyEl ? qtyTask : null });
    if (!out.ok) return;

    const fb = $('pCambioFeedback');
    if (fb) fb.innerHTML = `<div class="mov-preview mov-preview-ok"><span class="font-bold">${this._ico('check')} Trasferimento completato — ${out.qtyMoved} Coll.${out.mergeMsg}</span></div>`;
    this._moveSelection = null;
    $('pCambioArt').value = '';
    $('pCambioLot').value = '';
    $('pCambioDest').value = '';
    $('pCambioDestPrev').innerHTML = '';
    $('pCambioInfo').innerHTML = '';
    $('pCambioDestArea').classList.add('hidden');
    $('pCambioArt')?.focus();
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
      <div class="form-row mb-5">
        <div class="form-group"><label>N° Ordine Produzione <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="pProdOrder" placeholder="Scansiona o digita ordine" maxlength="40" value="${this._esc(this._prodOrderNum)}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._prodOrderNum=this.value.trim().toUpperCase();$('pProdOperator')?.focus();}"></div>
        <div class="form-group"><label>Operatore <span class="req">*</span></label>
          <input class="input" id="pProdOperator" placeholder="Nome operatore" maxlength="${Validate.MAX.OPERATOR}" value="${this._esc(this._prodOperator)}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._prodOperator=this.value;$('pProdArt')?.focus();}"></div>
      </div>
      <div class="form-group mb-5">
        <label>② Scansiona Articolo <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="pProdArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}" autofocus
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('pProdLot')?.focus();}">
      </div>
      <div class="form-group mb-5">
        <label>③ Scansiona Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="pProdLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._prodLookup();}">
        <div id="pProdInfo"></div>
      </div>
      <section id="prodCartZone">${this._prodCartZoneHTML()}</section>
      <div class="mt-4" id="pProdFeedback"></div>
      <div class="kbd-hint">
        <span class="kbd">INVIO</span><span class="text-body-small text-sx-text-muted">articolo → lotto → ricerca</span>
        <span class="kbd">ESC</span><span class="text-body-small text-sx-text-muted">chiude il modulo</span>
      </div>`;
    this.setPrimaryScanField('pProdArt');
  },

  _prodCartZoneHTML() {
    const n = this._pickCart.length;
    const totalColli = (this._pickCart as VoceCarrelloProd[]).reduce((s, it) => s + (it.qty_pick || 1), 0);
    return `<div class="flex justify-between items-center mt-7 mx-0 mb-3.5">
        <strong class="text-body-large">${this._ico('shopping-cart')} Carrello Prelievo <span class="text-sx-accent">(${n})</span>${n ? ` <span class="dlg-chip">${totalColli} Coll.</span>` : ''}</strong>
        ${n ? '<button class="btn btn-sm btn-ghost" onclick="App._prodClearCart()">Svuota</button>' : ''}
      </div>
      <div class="pick-cart">${this._renderPickCart()}</div>
      ${n ? `<div class="flex gap-5 mt-6">
        <button class="btn btn-primary btn-conferma" onclick="App._execProduzione()">${this._ico('building-factory')} CONFERMA PRELIEVO (${n})</button>
        <button class="btn min-h-touch" onclick="App._printProdReport()" title="Stampa report">${this._ico('printer')}</button>
      </div>` : ''}`;
  },

  _updateProdCart() {
    const zone = $('prodCartZone');
    if (zone) zone.innerHTML = this._prodCartZoneHTML();
    else this._formProduzione($('pickSubForm'));   // ripiego
  },

  // v1.8.0: identificazione obbligatoria con ARTICOLO + LOTTO
  _prodLookup() {
    const art = Validate.clean($('pProdArt')?.value, true);
    const lot = Validate.clean($('pProdLot')?.value);
    const info = $('pProdInfo');
    if (!art) {
      info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">${this._ico('circle-x')} Scansiona prima il codice articolo</div>`;
      $('pProdArt')?.focus();
      return;
    }
    if (!lot) {
      info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">${this._ico('circle-x')} Scansiona il codice lotto — entrambi i campi sono obbligatori</div>`;
      $('pProdLot')?.focus();
      return;
    }
    this._prodOrderNum = Validate.clean($('pProdOrder')?.value, true) || this._prodOrderNum;
    this._prodOperator = Validate.clean($('pProdOperator')?.value) || this._prodOperator;
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
        info.innerHTML = `<div class="text-body-small text-sx-orange mt-2">
          ${this._ico('alert-triangle')} ${this._esc(art)}#${this._esc(lot)} è <strong>interamente impegnato su DDT pendenti</strong> — non prelevabile.<br>
          <span class="text-label-small text-sx-text-muted">Modificare o annullare il DDT in Movimenta → Resi / Spedizioni.</span>
        </div>`;
        return;
      }
      info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">${this._ico('circle-x')} Item ${this._esc(art)}#${this._esc(lot)} non disponibile${inQuar ? ' <span class="text-sx-purple">(in quarantena)</span>' : !allForLot.length ? ' — non trovato in magazzino' : ''}</div>`;
      return;
    }
    if (itemsRaw.length === 1) { this._prodAddToCart(itemsRaw[0]); return; }
    // Stesso lotto in più ubicazioni → mostra selezione
    let html = '<div class="max-h-[200px] overflow-y-auto mt-3"><div class="text-label-small text-sx-text-muted mb-3">Stesso lotto in più ubicazioni — seleziona:</div>';
    for (const it of itemsRaw) {
      const inCart = (this._pickCart as VoceCarrelloProd[]).some((c) => c.item_key === it.item_key && c.location_code === it.location_code);
      // v2.0.1 [A1] — si espone il DISPONIBILE, non la giacenza fisica
      const qtyPhys = it.qty || 1;
      const qtyAvail = Store.getAvailableQty(it.location_code, it.item_key);
      const reservedLbl = (qtyPhys - qtyAvail) > 0
        ? ` <span class="text-sx-orange text-label-small">(${qtyPhys - qtyAvail} su DDT)</span>` : '';
      const payload = App._payload(it);
      html += `<div class="inv-item-row" style="cursor:pointer;${inCart ? 'opacity:0.4' : ''}" onclick="App._prodAddEnc('${payload}')">
        <div class="inv-info">
          <div class="inv-code">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">L:${this._esc(it.lot_code)} · ${this._ico('map-pin')} <strong>${this._esc(it.location_code)}</strong> · <strong class="text-sx-accent">${qtyAvail} Coll. disp.</strong>${reservedLbl}</div>
        </div>
        ${inCart ? `<span class="text-sx-text-muted text-body-small">${this._ico('check')} In carrello</span>` : '<span class="text-sx-success">+ Aggiungi</span>'}
      </div>`;
    }
    info.innerHTML = html + '</div>';
  },

  _prodAddEnc(p) { this._prodAddToCart(JSON.parse(decodeURIComponent(p))); },
  /* v2.1.0 — resa asincrona: i dialoghi applicativi sostituiscono
     confirm()/prompt() nativi, che il lettore barcode poteva confermare da solo. */
  async _prodAddToCart(item) {
    const dup = (this._pickCart as VoceCarrelloProd[]).find((c) => c.item_key === item.item_key && c.location_code === item.location_code);
    if (dup) { this.toast('Item già nel carrello', 'warning'); return; }
    // Avviso non-FEFO al picking produzione
    if (!Store.isFEFOItem(item)) {
      const fefo = Store.getFEFOItemForArticle(item.article_code);
      if (fefo && fefo.expiry_date && (!item.expiry_date || item.expiry_date > fefo.expiry_date)) {
        const msg = `${this._ico('alert-triangle')} NON-FEFO\n\nStai per prelevare ${item.article_code}#${item.lot_code}` +
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
      .filter((c: VoceCarrelloProd) => c.item_key === item.item_key && c.location_code === item.location_code)
      .reduce((sum: number, c: VoceCarrelloProd) => sum + (c.qty_pick || 0), 0);
    const qtyAvail = Math.max(0, qtyPhys - qtyReserved - qtyInCart);
    if (qtyAvail < 1) {
      this.toast(`${item.article_code}#${item.lot_code}: nessun collo disponibile (fisici ${qtyPhys}, impegnati su DDT ${qtyReserved})`, 'error');
      return;
    }
    const reservedInfo = qtyReserved > 0 ? `\n${this._ico('alert-triangle')} ${qtyReserved} Coll. impegnati su DDT pendenti (non prelevabili)` : '';
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
    const qtyPick = qtyInput;   // `Dialog.qty` da' gia' un intero
    if (!Number.isInteger(qtyPick) || qtyPick < 1) { this.toast('Quantità non valida — inserire un intero maggiore di zero', 'error'); return; }
    if (qtyPick > qtyAvail) { this.toast(`Quantità superiore al disponibile (${qtyAvail} Coll.)`, 'error'); return; }
    // Fix B5 raffinato: il timer parte al primo item, non all'apertura del form
    if (!this._pickCart.length && !this._prodPickStartTime) this._prodPickStartTime = Date.now();
    // Aggiungo qty_pick + qty_avail nello snapshot del carrello
    this._pickCart.push({ ...item, qty_pick: qtyPick, qty_avail: qtyAvail, qty_phys: qtyPhys });   // v2.0.1 [A1]
    const artEl = $('pProdArt'); if (artEl) artEl.value = '';
    const lotEl = $('pProdLot'); if (lotEl) lotEl.value = '';
    const infoEl = $('pProdInfo'); if (infoEl) infoEl.innerHTML = '';
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
    return (this._pickCart as VoceCarrelloProd[]).map((it, i) => {
      const qtyPick = it.qty_pick || 1;
      const qtyAvail = it.qty_avail || qtyPick;
      const isPartial = qtyPick < qtyAvail;
      const partialBadge = isPartial ? ` <span class="text-sx-warning text-label-small font-bold">PARZIALE (${qtyPick}/${qtyAvail})</span>` : '';
      return `<div class="pick-cart-item">
      <div class="pci-num">${i+1}</div>
      <div class="pci-info">
        <div class="pci-code">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal text-label-small">${this._esc(it.article_description || '')}</span></div>
        <div class="pci-loc">L:${this._esc(it.lot_code)} · ${this._ico('map-pin')} ${this._esc(it.location_code)} · <strong class="text-sx-accent">${qtyPick} Coll.</strong>${partialBadge}</div>
      </div>
      <button class="btn btn-sm btn-ghost text-sx-danger" onclick="App._prodRemoveFromCart(${i})">${this._ico('x')}</button>
    </div>`;
    }).join('');
  },

  async _execProduzione() {
    if (!this._requireOperator('il prelievo di produzione')) return;   // v2.0.1 [B7]
    if (!this._pickCart.length) return this.toast('Carrello vuoto', 'error');
    this._prodOrderNum = Validate.clean($('pProdOrder')?.value, true) || this._prodOrderNum;
    this._prodOperator = Validate.clean($('pProdOperator')?.value) || this._prodOperator;
    if (!this._prodOrderNum) return this.toast('N° ordine produzione obbligatorio', 'error');
    /* 2.35.2 — UN ORDINE CHIUSO RIPRENDE, E LO SI DICE PRIMA di scaricare lo
       scaffale.

       Qui si rifiutava. La ragione era che il conto avrebbe sommato due
       lavorazioni sotto lo stesso numero — vera — ma il rimedio mandava a
       inventare un numero d'ordine, che il magazzino non emette, o a
       portare via la merce senza registrarla. Adesso si avvisa, il prelievo
       va avanti, e il conto porta scritto di essere stato riaperto
       (`riaperto`, in `modules/wip.ts`).

       L'avviso resta QUI e non solo dentro `entraInWip` per la ragione di
       sempre: li' la merce e' gia' fuori dallo scaffale, e chi legge deve
       poter decidere prima di muoverla. */
    if (Store.ordineWipArchiviato(this._prodOrderNum)) {
      this.toast(`${this._prodOrderNum} è un conto già CHIUSO: quel che prelevi ci rientra dentro, `
        + 'e il conto risulterà riaperto.', 'warning');
    }
    const opErr = Validate.operator(this._prodOperator);
    if (opErr) return this.toast(opErr, 'error');

    const count = this._pickCart.length;
    const totalColli = (this._pickCart as VoceCarrelloProd[]).reduce((s, it) => s + (it.qty_pick || 1), 0);
    const partialCount = (this._pickCart as VoceCarrelloProd[]).filter((it) => (it.qty_pick || 1) < (it.qty_avail || 1)).length;
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
      icon: 'building-factory'
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
      const sceltePick = await this._chiediColli(full, `Quali colli · ${it.article_code}#${it.lot_code}`,
        null, { colli: qtyPick });
      if (sceltePick === undefined) {
        failedAt = i; failReason = 'Prelievo annullato alla scelta dei colli';
        backups.pop();
        break;
      }
      // Rimozione parziale o totale a seconda di qtyPick
      const removed = await Store.removeItem(it.location_code, it.item_key, qtyPick, null, sceltePick);
      if (!removed) { failedAt = i; break; }
      results.push({ ...it, _qty_before: removed._qty_before, _qty_delta: removed._qty_delta, _qty_after: removed._qty_after, _mode: removed._mode,
                     _qty_uom_delta: removed._qty_uom_delta ?? null, _packs_out: removed._packs_out ?? null,
                     _packs_before: removed._packs_before ?? null });
    }
    if (failedAt !== -1) {
      // Rollback: per ogni item processato, se era partial → reincrementa, se era full → restoreItem
      for (let j = backups.length - 1; j >= 0; j--) {
        const b = backups[j]!;
        const mode = results[j]?._mode;
        if (mode === 'partial') {
          // ripristina addItem con qty_delta (re-incrementa)
          // 1.4.2 — e con le UM che erano uscite, se no il rollback ne inventa
          await Store.addItem(b.location_code, b.article_code, b.article_description!, b.lot_code, b.expiry_date || '', b.notes || '', Math.abs(results[j]!._qty_delta) || (results[j]!._packs_out?.length ?? 1), this._umMossa(results[j]), results[j]!._packs_out ?? null);
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
    /* ═══ 1.14 — LA MERCE NON SPARISCE: VA NEL CONTO DELL'ORDINE ═══
       Il prelievo di produzione e' un trasferimento verso l'ubicazione WIP, e
       la merce resta in giacenza li' finche' non torna o finche' l'ordine non
       si chiude.

       Se il conto non riesce, il prelievo NON si annulla: la merce e' gia'
       fuori dallo scaffale, e rimetterla dentro per un problema di
       contabilita' sarebbe muovere merce vera per un numero. Si dice, e si
       lascia la riga a registro. */
    {
      const falliti = [];
      for (const it of results) {
        try {
          const entrata = await Store.entraInWip(this._prodOrderNum, {
            item_key: it.item_key, article_code: it.article_code,
            article_description: it.article_description, lot_code: it.lot_code,
            expiry_date: it.expiry_date || '',
            qty: Math.abs(it._qty_delta || it.qty_pick || 1),
            qty_uom: this._umMossa(it), uom: Store.getUomConfig(it.article_code, it.lot_code)?.uom ?? null,
            packs: it._packs_out ?? null,
          });
          /* 2.2 — L'ARRIVO NEL VANO SI SCRIVE, come nel prelievo guidato: il
             registro non deve avere merce che compare in un'ubicazione senza
             una riga che ce l'abbia portata. */
          await this._logMov(MOV.IN, it.article_code, it.article_description, it.lot_code,
            entrata.location_code, null, this._prodOperator,
            `Entrata nel conto di produzione — ordine ${this._prodOrderNum}`, this._prodOrderNum,
            entrata.qty_before ?? null,
            (entrata.qty_after ?? 0) - (entrata.qty_before ?? 0),
            entrata.qty_after ?? null,
            typeof entrata.qty_uom_delta === 'number' ? entrata.qty_uom_delta : null);
        } catch (e) {
          falliti.push(`${it.article_code}#${it.lot_code}: ${(e as Error).message}`);
        }
      }
      if (falliti.length) {
        this.toast(`Conto di produzione incompleto — ${falliti[0]}. Il prelievo resta valido.`, 'error');
      }
    }

    // v2.1.0 — storno del batch entro la finestra temporale
    /* 2.0 — L'AZIONE DI ANNULLAMENTO PORTA I COLLI, non solo un numero.
       Senza `packs` lo storno rimetteva colli PIENI su una riga che l'elenco
       lo dichiara: `addItem` alzava `qty` e `qty_uom` e lasciava `packs`
       com'era, e da lì in poi la riga diceva un numero e l'elenco un altro.
       `qty` si conta sull'elenco e non sul calo dello scaffale: aprendo un
       collo i due numeri divergono — è lo stesso difetto chiuso nel conto
       di produzione. E `packs_prima` serve a richiudere il collo aperto
       invece di accodarne uno nuovo. */
    this._pushUndo(`Prelievo produzione ord. ${this._prodOrderNum} (${results.length} lotti)`,
      results.map(it => ({
        op: 'add', loc: it.location_code, art: it.article_code,
        desc: it.article_description, lot: it.lot_code,
        exp: it.expiry_date || '', notes: it.notes || '',
        qty: it._packs_out?.length || Math.abs(it._qty_delta || it.qty_pick || 1),
        qty_uom: this._umMossa(it),          // 1.4.2 — vedi _umMossa
        packs: it._packs_out ?? null,
        packs_prima: it._packs_before ?? null,
      })));
    this.toast(`Prelevati ${results.length} lotti (${totalColli} Coll.) per ord. ${this._prodOrderNum}`, 'success');
    this.updateSyncIndicator();

    const prodSnap  = this._prodCartSnapshot(results, { partial: false });
    const prodSaved = await Store.archivePickReport(prodSnap);
    if (await Dialog.confirm({
      title: 'Stampare il report di prelievo?',
      message: 'Il report riporta righe, lotti, ubicazioni, quantit\u00e0 e tempi di prelievo dell\u2019ordine di produzione. Resta ristampabile dal registro degli ordini prelevati.',
      confirmLabel: 'Stampa', cancelLabel: 'Non ora', icon: 'printer'
    })) this._emitPickReport(prodSnap, { reprint: false });
    if (!prodSaved) this.toast('Report non archiviato: la ristampa conforme non sar\u00e0 disponibile', 'error');
    // Reset carrello + timer
    this._pickCart = [];
    this._prodPickStartTime = null;
    this._formProduzione($('pickSubForm'));
    this._refreshSessionLog();
  },

  _prodCartSnapshot(cart, opt = {}) {
    this._prodOrderNum = Validate.clean($('pProdOrder')?.value, true) || this._prodOrderNum;
    this._prodOperator = Validate.clean($('pProdOperator')?.value) || this._prodOperator;
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
} satisfies Vista;
