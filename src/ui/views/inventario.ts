import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog.js';

export const VistaInventario: Vista = {
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
    const loc = Validate.clean($('mInvLoc')?.value, true).replace(/'/g, '-');
    const el = $('mInvContent');
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
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('mInvExtraLot').focus();}">
        <input class="input input-mono" id="mInvExtraLot" placeholder="Lotto" maxlength="${Validate.MAX.LOT_CODE}" style="flex:0.8"
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('mInvExtraQty').focus();}">
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
    const row = $(`invRow${idx}`);
    row.className = `inv-item-row ${present ? 'inv-row-confirmed' : 'inv-row-missing'}`;
    $(`invOk${idx}`).className = `inv-btn ${present ? 'inv-ok' : ''}`;
    $(`invMiss${idx}`).className = `inv-btn ${!present ? 'inv-miss' : ''}`;
    const cnt = $(`invCnt${idx}`); if (cnt) cnt.className = 'inv-btn';
    const info = $(`invCountInfo${idx}`); if (info) info.innerHTML = '';
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
    const row = $(`invRow${idx}`);
    const delta = counted - sysQty;
    let cls = 'inv-row-confirmed';
    if (counted === 0) cls = 'inv-row-missing';
    else if (delta !== 0) cls = '';
    row.className = `inv-item-row ${cls}`;
    $(`invOk${idx}`).className = 'inv-btn';
    $(`invMiss${idx}`).className = 'inv-btn';
    const cnt = $(`invCnt${idx}`); if (cnt) cnt.className = 'inv-btn inv-ok';
    const info = $(`invCountInfo${idx}`);
    if (info) {
      const sign = delta > 0 ? '+' : '';
      const color = delta === 0 ? 'var(--sx-success)' : (delta > 0 ? 'var(--sx-warning)' : 'var(--sx-danger)');
      info.innerHTML = ` · Contati: <strong style="color:${color}">${counted} (${sign}${delta})</strong>`;
    }
  },

  _invAddExtra() {
    if (!this._invState) return;
    const art = Validate.clean($('mInvExtraArt')?.value, true);
    const lot = Validate.clean($('mInvExtraLot')?.value);
    const qtyRaw = $('mInvExtraQty')?.value;
    const qty = parseInt(qtyRaw);
    const errs = [Validate.article(art), Validate.lot(lot)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    if (!qty || qty < 1) return this.toast('Numero colli non valido (minimo 1)', 'error');
    // Check articolo esistente per descrizione
    const artInfo = Store.getArticle(art);
    if (!artInfo) return this.toast(`Articolo ${art} non in anagrafica. Usa Configurazione o "Posiziona" per crearlo`, 'error');
    // Evita duplicato extras
    if (this._invState.extras.find((e: any) => e.article_code === art && e.lot_code === lot)) return this.toast('Item già nella lista extra', 'warning');
    this._invState.extras.push({ article_code: art, article_description: artInfo.description, lot_code: lot, qty });
    $('mInvExtraArt').value = '';
    $('mInvExtraLot').value = '';
    $('mInvExtraQty').value = '1';
    this._renderInvExtras();
    $('mInvExtraArt').focus();
  },

  _renderInvExtras() {
    const el = $('mInvExtras');
    if (!this._invState?.extras.length) { el.innerHTML = ''; return; }
    let html = '';
    this._invState.extras.forEach((ex: any, idx: any) => {
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
    const unchecked = items.filter((i: any) => !i.checked);
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
      this._formInventario($('movFormArea'));
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
    this._formInventario($('movFormArea'));
  },

  _contaBack() {
    this._contaState = null;
    this._formInventario($('movFormArea'));
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
    const box = $('cnConfronto');
    if (!d || !box) return;
    const v = $('cnQty')?.value;
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
    const val = Validate.clean($('cnLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val !== d.location_code) {
      d.scan.loc = '';
      this._scanFb('cnFeedback', 'error', `Sei in ${val}, ma la conta è su ${d.location_code}`);
      return;
    }
    d.scan.loc = val;
    this._scanFb('cnFeedback', 'ok', `Ubicazione ${val} confermata`);
    $('cnArt')?.focus();
  },

  _contaCheckArt() {
    const d = this._contaState;
    if (!d) return;
    const val = Validate.clean($('cnArt')?.value, true);
    if (!val) return;
    if (val !== d.article_code) {
      d.scan.art = '';
      this._scanFb('cnFeedback', 'error', `Articolo ${val} diverso da quello da contare (${d.article_code})`);
      return;
    }
    d.scan.art = val;
    this._scanFb('cnFeedback', 'ok', `Articolo ${val} confermato`);
    $('cnLot')?.focus();
  },

  _contaCheckLot() {
    const d = this._contaState;
    if (!d) return;
    const val = Validate.clean($('cnLot')?.value);
    if (!val) return;
    if (val !== d.lot_code) {
      d.scan.lot = '';
      this._scanFb('cnFeedback', 'error', `Lotto ${val} diverso da quello da contare (${d.lot_code})`);
      return;
    }
    d.scan.lot = val;
    this._scanFb('cnFeedback', 'ok', `Lotto ${val} confermato — adesso conta i colli`);
    $('cnQty')?.focus();
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
      $(mancanti[0] === 'ubicazione' ? 'cnLoc' : mancanti[0] === 'articolo' ? 'cnArt' : 'cnLot')?.focus();
      return;
    }

    const grezzo = $('cnQty')?.value;
    const contati = parseInt(grezzo, 10);
    if (grezzo === '' || !Number.isFinite(contati) || contati < 0) {
      $('cnQty')?.focus();
      return this.toast('Quanti colli hai contato: zero è una risposta, vuoto no', 'error');
    }

    /* La giacenza si rilegge un'ultima volta: fra l'apertura della maschera
       e la conferma un altro terminale può aver mosso questa riga. */
    const it = Store.getItemsAtLocation(d.location_code).find(i => i.item_key === d.item_key);
    if (!it) return this.toast('La riga non è più in giacenza — ricomincia', 'error');
    const sistema = it.qty || 0;
    const delta = contati - sistema;
    const nota = Validate.clean($('cnNota')?.value);
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
    } catch (err: any) {
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
    this._formInventario($('movFormArea'));
  },
};
