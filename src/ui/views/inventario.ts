import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import type { Giacenza } from '../../types/entita';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { rettifica, descriviColli, totaleUom as totaleUomColli } from '../../modules/colli';
import { formattaQuantita } from '../../modules/misure';
import { riepiloga, codaDiConta, chiaveRiga } from '../../modules/giacenzaArticolo';
import type { RigaArticolo } from '../../modules/giacenzaArticolo';

/* L'inventario di un vano mentre lo si conta: le righe a sistema con la
   spunta di chi le ha viste, e le righe trovate che a sistema non c'erano. */
type RigaInventario = Giacenza & {
  confirmed: boolean;
  missing: boolean;
  checked: boolean;
  counted_qty: number | null;
  /* 1.8.4 — l'elenco com'e' a scaffale, dichiarato da chi ha contato. Su
     una riga a colli dichiarati «tre colli» non dice niente: dice tutto
     «due da 25 e uno da 18». */
  colli_dopo: number[] | null;
  uom_dopo?: string | null;
};

type RigaExtra = {
  article_code: string;
  article_description?: string;
  lot_code: string;
  qty: number;
};

type StatoInventario = { loc: string; items: RigaInventario[]; extras: RigaExtra[] };

export const VistaInventario = {
  // ═══ 4. INVENTARIO ═══
  _formInventario(el) {
    if (!el) return;
    /* 1.4.4 — Con una Conta avviata comanda lei: la finestra di guida sulla
       riga sola, e nessuna scelta di ramo da rifare. */
    if (this._contaState) { this._contaRenderVerify(el); return; }
    /* 1.9 — DUE RAMI, DUE DOMANDE. «Per vano» è l'inventario di sempre: si
       apre un'ubicazione e si verifica cosa c'è dentro. «Per articolo» è la
       domanda che si fa in corsia — di questo codice, quanto ne ho e dove
       sta — e da lì si conta, su uno o su tutti i lotti in fila. Lo stesso
       mestiere a due granularità, nella stessa voce di Movimenta: chi lavora
       non deve sapere in anticipo quale delle due gli serve. */
    el.innerHTML = `<div class="mov-form-card">
      <h3>${this._ico('clipboard-text')} <span class="text-sx-warning">Inventario</span></h3>
      <div class="prel-tabs">
        <button class="prel-tab ${this._invSubMode === 'vano' ? 'active' : ''}" onclick="App._invSub('vano')"><span class="prel-tab-icon">${this._ico('map-pin')}</span>Per vano</button>
        <button class="prel-tab ${this._invSubMode === 'articolo' ? 'active' : ''}" onclick="App._invSub('articolo')"><span class="prel-tab-icon">${this._ico('package')}</span>Per articolo</button>
        <button class="prel-tab ${this._invSubMode === 'udc' ? 'active' : ''}" onclick="App._invSub('udc')"><span class="prel-tab-icon">${this._ico('arrows-shuffle')}</span>Per unità</button>
      </div>
      <div id="invSubForm"></div>
      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">${this._ico('x')} Chiudi</button></div>
    </div>`;
    this._renderInvSub();
  },

  _invSubMode: 'vano',

  _invSub(mode) {
    this._invSubMode = mode;
    this._formInventario($('movFormArea'));
  },

  _renderInvSub() {
    const el = $('invSubForm');
    if (!el) return;
    if (this._invSubMode === 'articolo') this._invFormArticolo(el);
    else if (this._invSubMode === 'udc') this._invFormUdc(el);
    else this._invFormVano(el);
  },

  /* ═══ 2.1 — L'INVENTARIO DI UN'UNITÀ DI CARICO ══════════════════════

     IL TERZO RAMO NASCE DA UN GESTO, NON DA UNA DOMANDA. «Per vano» e «per
     articolo» si aprono digitando; questo si apre passando il lettore
     sull'etichetta del pallet che si ha davanti — che dalla 2.1 porta un
     Code128 e nient'altro, apposta.

     Quel che il sistema restituisce è l'ELENCO DI COSA DOVREBBE ESSERCI
     SOPRA, e da lì parte la stessa coda di conte del ramo «per articolo»:
     una riga per volta, nell'ordine dello scaffale, col numero di sistema
     nascosto finché non si è contato — che è la regola di §6 e non cambia
     perché la merce sta su un pallet invece che su una mensola.

     Un'unità chiusa non si conta: non esiste più, e cercarla col lettore
     dà una risposta chiara invece di un elenco vuoto. */
  _invUdcState: null,

  _invFormUdc(el) {
    const st = this._invUdcState;
    el.innerHTML = `<div>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① SCANSIONA L'ETICHETTA UDC</span> → il sistema elenca cosa c'è sopra → <span class="wf-step">② CONTA</span> riga per riga.
      </div>
      <div class="form-group mb-5">
        <label>Unità di carico</label>
        <div class="flex gap-3">
          <input class="input input-mono flex-1" id="invUdcCode" placeholder="Scansiona il codice a barre dell'unità"
            value="${this._esc(st?.udc_id || '')}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._invUdcCerca();}">
          <button class="btn btn-sm btn-primary" onclick="App._invUdcCerca()">Apri</button>
        </div>
      </div>
      <div id="invUdcContent"></div>
    </div>`;
    this.setPrimaryScanField('invUdcCode');
    if (st) this._invUdcRender();
  },

  _invUdcCerca() {
    const q = Validate.clean($('invUdcCode')?.value, true);
    if (!q) return;
    const u = Store.getUdc(q);
    if (!u) {
      this._invUdcState = null;
      const box = $('invUdcContent');
      if (box) box.innerHTML = `<div class="mov-preview mov-preview-err"><strong>${this._esc(q)}</strong> non esiste.</div>`;
      return;
    }
    if (u.status === 'empty' || u.status === 'shipped') {
      this._invUdcState = null;
      const box = $('invUdcContent');
      if (box) box.innerHTML = `<div class="mov-preview mov-preview-warn">
        <strong>${this._esc(q)}</strong> è <strong>${this._esc(u.status)}</strong>: l'unità è chiusa e non porta più niente.
        Il record resta come storia — non si riapre e il codice non si riusa.</div>`;
      return;
    }
    this._invUdcState = { udc_id: u.udc_id, sel: null };
    this._invUdcRender();
  },

  _invUdcRighe() {
    const st = this._invUdcState;
    return st ? Store.righeDiUdc(st.udc_id) : [];
  },

  _invUdcRender() {
    const st = this._invUdcState;
    const box = $('invUdcContent');
    if (!st || !box) return;
    const righe = this._invUdcRighe();
    const u = Store.getUdc(st.udc_id);

    /* Alla prima apertura sono spuntate tutte: chi ha il pallet davanti lo
       conta intero, e togliere una riga è l'eccezione. */
    if (st.sel === null) st.sel = righe.map((r: Giacenza) => r.item_key);
    const vive = new Set(righe.map((r: Giacenza) => r.item_key));
    st.sel = st.sel.filter((k: string) => vive.has(k));

    if (!righe.length) {
      box.innerHTML = `<div class="mov-preview mov-preview-warn">
        <strong>${this._esc(st.udc_id)}</strong> non porta nessuna riga. Si chiuderà da sola appena qualcosa entra ed esce.</div>`;
      return;
    }

    const colli = righe.reduce((t: number, r: Giacenza) => t + (r.qty || 0), 0);
    let html = `<div class="mov-preview mov-preview-ok mb-5">
      <strong class="mono">${this._esc(st.udc_id)}</strong> · ${this._esc(u?.type || 'pallet')}
      · ${this._ico('map-pin')} <strong>${this._esc(u?.location_code || '— senza ubicazione')}</strong><br>
      <strong>${righe.length} rig${righe.length === 1 ? 'a' : 'he'}</strong> · ${colli} Coll. dichiarati a sistema
    </div>`;

    for (const r of righe) {
      const spuntata = st.sel.includes(r.item_key);
      html += `<div class="inv-item-row">
        <input type="checkbox" ${spuntata ? 'checked' : ''} onchange="App._invUdcToggle('${this._esc(r.item_key)}')">
        <div class="inv-info">
          <div class="inv-code">${this._esc(r.article_code)}
            <span class="font-normal text-body-small text-sx-text-secondary">${this._esc(r.article_description || '')}</span></div>
          <div class="inv-lot">Lotto ${this._esc(r.lot_code)}
            ${r.expiry_date ? ` · ⏱ ${this._esc(this._dateISOtoIT(r.expiry_date))}` : ''}
            · ${this._ico('map-pin')} ${this._esc(r.location_code)}</div>
        </div>
      </div>`;
    }

    const n = st.sel.length;
    html += `<div class="flex gap-3 flex-wrap my-5">
        <button class="btn btn-sm" onclick="App._invUdcTutti(true)">Seleziona tutto</button>
        <button class="btn btn-sm" onclick="App._invUdcTutti(false)">Nessuno</button>
      </div>
      <button class="btn btn-primary btn-conferma" ${n ? '' : 'disabled'} onclick="App._invUdcConta()">
        ${this._ico('list-numbers')} CONTA ${n ? `${n} rig${n === 1 ? 'a' : 'he'}` : '— spunta almeno una riga'}
      </button>`;
    box.innerHTML = html;
  },

  _invUdcToggle(itemKey) {
    const st = this._invUdcState;
    if (!st) return;
    const i = st.sel.indexOf(itemKey);
    if (i >= 0) st.sel.splice(i, 1); else st.sel.push(itemKey);
    this._invUdcRender();
  },

  _invUdcTutti(on) {
    const st = this._invUdcState;
    if (!st) return;
    st.sel = on ? this._invUdcRighe().map((r: Giacenza) => r.item_key) : [];
    this._invUdcRender();
  },

  _invUdcConta() {
    const st = this._invUdcState;
    if (!st) return;
    if (!this._requireOperator('la conta')) return;
    const coda = this._invUdcRighe()
      .filter((r: Giacenza) => st.sel.includes(r.item_key))
      .map((r: Giacenza) => ({ location_code: r.location_code, item_key: r.item_key }));
    if (!coda.length) return this.toast('Nessuna riga da contare: quelle spuntate non sono più sull\u2019unità', 'error');
    this._contaAvviaCoda(coda);
  },

  _invFormVano(el) {
    el.innerHTML = `<div>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① UBICAZIONE</span> → INVIO per caricare → <span class="wf-step">② ${this._ico('check')}/${this._ico('circle-x')}</span> per ogni item → aggiungi <strong>extra</strong> trovati → <span class="wf-step">③ APPLICA</span>.
      </div>
      <div class="form-group mb-5">
        <label>Ubicazione da verificare</label>
        <div class="flex gap-3">
          <input class="input input-mono flex-1" id="mInvLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('mInvLoc');App._previewLoc('mInvLoc','mInvLocPrev')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('mInvLoc');App._loadInv();}">
          <button class="btn btn-sm" onclick="App._pickLoc('mInvLoc','_cbPickInv')">${this._ico('map-pin')}</button>
          <button class="btn btn-sm btn-primary" onclick="App._loadInv()">Carica</button>
        </div>
        <div id="mInvLocPrev"></div>
      </div>
      <div id="mInvContent"></div>
    </div>`;
  },

  _cbPickInv() { setTimeout(() => { App._previewLoc('mInvLoc','mInvLocPrev'); App._loadInv(); }, 30); },

  _loadInv() {
    const loc = Validate.clean($('mInvLoc')?.value, true).replace(/'/g, '-');
    const el = $('mInvContent');
    if (!loc) return;
    if (!Store.locationExists(loc)) { el.innerHTML = '<div class="text-sx-danger text-body-small p-3">Ubicazione non trovata</div>'; return; }
    const items = Store.getItemsAtLocation(loc);
    // v1.7.0 — counted_qty: null = non ancora contato. confirmed/missing semantica preservata per compatibilità.
    this._invState = { loc, items: items.map(i => ({ ...i, confirmed: false, missing: false, checked: false, counted_qty: null, colli_dopo: null, uom_dopo: null })), extras: [] };
    let html = '<div class="mt-7.5">';
    html += `<p class="text-body-small text-sx-text-secondary mb-5">Sistema: <strong>${items.length}</strong> lotti registrati. Verifica ciascuno: <strong class="text-sx-success">${this._ico('check')}</strong> conferma giacenza · <strong class="text-sx-danger">${this._ico('circle-x')}</strong> mancante totale · <strong class="text-sx-warning">${this._ico('clipboard-text')}</strong> conta fisica diversa.</p>`;
    if (!items.length) html += '<div class="text-body-small text-sx-text-muted p-3">Nessun item registrato</div>';
    else {
      html += '<div>';
      items.forEach((it, idx) => {
        const sysQty = it.qty || 1;
        html += `<div class="inv-item-row" id="invRow${idx}">
          <div class="inv-info">
            <div class="inv-code">${this._esc(it.article_code)} <span class="font-normal text-sx-text-secondary text-body-small">${this._esc(it.article_description || '')}</span></div>
            <div class="inv-lot">Lotto: ${this._esc(it.lot_code)} · Sistema: <strong class="text-sx-accent">${sysQty} Coll.</strong> <span class="text-label-small" id="invCountInfo${idx}"></span></div>
          </div>
          <div class="inv-actions-row">
            <button class="inv-btn" onclick="App._invConfirm(${idx},true)" id="invOk${idx}" title="Conferma quantità di sistema">${this._ico('check')}</button>
            <button class="inv-btn" onclick="App._invConfirm(${idx},false)" id="invMiss${idx}" title="Mancante totale (rimuovi tutto)">${this._ico('circle-x')}</button>
            <button class="inv-btn text-body-medium" onclick="App._invCount(${idx})" id="invCnt${idx}" title="Conta fisica diversa">${this._ico('clipboard-text')}</button>
          </div>
        </div>`;
      });
      html += '</div>';
    }
    html += `<div class="mov-divider"></div>
      <p class="text-body-small text-sx-text-secondary mb-4"><strong>Item extra</strong> — trovati fisicamente ma non registrati</p>
      <div id="mInvExtras"></div>
      <div class="flex gap-3 mb-6">
        <input class="input input-mono uppercase flex-1" id="mInvExtraArt" placeholder="Cod. Articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('mInvExtraLot').focus();}">
        <input class="input input-mono flex-[0.8]" id="mInvExtraLot" placeholder="Lotto" maxlength="${Validate.MAX.LOT_CODE}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('mInvExtraQty').focus();}">
        <input class="input input-mono w-[70px] text-center" id="mInvExtraQty" type="number" min="1" step="1" value="1" placeholder="Coll."
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._invAddExtra();}">
        <button class="btn btn-sm btn-success" onclick="App._invAddExtra()">+</button>
      </div>
      <button class="btn btn-primary btn-conferma" onclick="App._execInventario()">${this._ico('clipboard-text')} APPLICA CORREZIONI</button>
    </div>`;
    el.innerHTML = html;
  },

  _invConfirm(idx, present) {
    if (!this._invState) return;
    this._invState.items[idx].confirmed = present;
    this._invState.items[idx].missing = !present;
    this._invState.items[idx].checked = true;
    this._invState.items[idx].counted_qty = null;  // reset eventuale conta precedente
    this._invState.items[idx].colli_dopo = null;
    this._invState.items[idx].uom_dopo = null;
    const row = $(`invRow${idx}`);
    row.className = `inv-item-row ${present ? 'inv-row-confirmed' : 'inv-row-missing'}`;
    $(`invOk${idx}`).className = `inv-btn ${present ? 'inv-ok' : ''}`;
    $(`invMiss${idx}`).className = `inv-btn ${!present ? 'inv-miss' : ''}`;
    const cnt = $(`invCnt${idx}`); if (cnt) cnt.className = 'inv-btn';
    const info = $(`invCountInfo${idx}`); if (info) info.innerHTML = '';
  },

  /* v1.7.0 — conta fisica diversa: applica delta qty (FIX+/FIX- con qty_delta)

     1.8.4 — E LA DOMANDA CAMBIA CON LA RIGA. Dove i colli sono dichiarati
     «quanti ne hai contati» non e' una domanda a cui si possa rispondere
     bene: tre colli da 25, 25 e 18 fanno tre come tre colli da 25 — e sono
     diciassette chili di differenza. Si chiede com'e' fatto adesso, con la
     stessa dichiarazione del posizionamento, e la differenza la calcola
     `rettifica`.

     E' cosi' che sparisce l'ultimo «vai da un'altra parte»: anche i colli
     IN PIU' si rettificano qui. Una misura trovata nessuno la puo'
     indovinare, ma chi ha il collo davanti la legge. */
  async _invCount(idx) {
    if (!this._invState) return;
    const it = this._invState.items[idx];
    const sysQty = it.qty || 1;
    let counted;

    const elenco = Store.colliDiRiga(it);
    if (elenco) {
      const cfg = Store.getUomConfig(it.article_code, it.lot_code)!;
      const nuovo = await this._ridichiaraColli(it, `Com'è fatto adesso · ${it.article_code}#${it.lot_code}`);
      if (nuovo === undefined) return;
      it.colli_dopo = nuovo;
      it.uom_dopo = cfg.uom;
      counted = nuovo.length;
    } else {
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
      counted = inp;   // `Dialog.qty` da' gia' un intero
      if (isNaN(counted) || counted < 0) return this.toast('Numero non valido', 'error');
    }
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
      /* Dove i colli sono dichiarati si rilegge la dichiarazione, non il
         conto: e' quella che dice se il vano torna. */
      info.innerHTML = it.colli_dopo
        ? ` · Contato: <strong style="color:${color}">${this._esc(it.colli_dopo.length ? descriviColli(it.colli_dopo, it.uom_dopo) : 'vano vuoto')}</strong>`
        : ` · Contati: <strong style="color:${color}">${counted} (${sign}${delta})</strong>`;
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
    if ((this._invState as StatoInventario).extras.find((e) => e.article_code === art && e.lot_code === lot)) return this.toast('Item già nella lista extra', 'warning');
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
    (this._invState as StatoInventario).extras.forEach((ex, idx) => {
      const exQty = ex.qty || 1;
      html += `<div class="inv-item-row inv-row-extra">
        <div class="inv-info">
          <div class="inv-code text-sx-warning">${this._esc(ex.article_code)} <span class="font-normal">${this._esc(ex.article_description || '')}</span></div>
          <div class="inv-lot">Lotto: ${this._esc(ex.lot_code)} · <strong class="text-sx-warning">${exQty} Coll.</strong></div>
        </div>
        <button class="btn btn-sm btn-danger btn-icon" onclick="App._invRemoveExtra(${idx})">${this._ico('x')}</button>
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
    const { loc, items, extras } = this._invState as StatoInventario;
    const unchecked = items.filter((i) => !i.checked);
    if (unchecked.length > 0) {
      const msg = `${this._ico('alert-triangle')} ${unchecked.length} item non verificati.\n\nOK = considera quantità di sistema CORRETTE (nessuna azione)\nAnnulla = torna alla verifica`;
      if (!await Dialog.confirm({
        title: 'Item non verificati',
        message: msg,
        confirmLabel: 'Considera corrette le quantità di sistema',
        cancelLabel: 'Torna alla verifica',
        danger: true
      })) return;
    }
    let corrections = 0;
    /* 1.8 — SU UNA RIGA A COLLI DICHIARATI SI CHIEDE QUALI, E SI RETTIFICA QUI.

       Fino a ieri questo giro le saltava e mandava l'operatore alla Conta
       mirata: era l'unico punto in cui una maschera diceva «questo non lo so
       fare, vai da un'altra parte», e chi aveva appena contato il vano doveva
       rifare la stessa riga altrove. Adesso la domanda — quali colli mancano —
       la fa qui, con la stessa finestra di tutte le altre maschere.

       Resta fuori un caso solo: i colli **in più**. Un collo trovato ha una
       misura che nessuno può indovinare, e inventargliela scriverebbe una
       giacenza plausibile e falsa: quello si posiziona da Movimenta, dove la
       suddivisione si dichiara. */
    for (const it of items) {
      const sysQty = it.qty || 1;

      /* 1.8.4 — LA RIGA RIDICHIARATA: da com'era a com'e', in due movimenti
         veri. Cio' che manca esce, cio' che si e' trovato entra, e un collo
         piu' leggero e' un'uscita parziale dallo stesso collo — non uno che
         se ne va e un altro che arriva. Il rimando a Movimenta non c'e'
         piu': anche i colli in piu' si rettificano qui. */
      if (!it.missing && it.colli_dopo) {
        const cfg = Store.getUomConfig(it.article_code, it.lot_code);
        const diff = cfg ? rettifica(Store.colliDiRiga(it), it.colli_dopo, cfg.uom) : null;
        if (!diff || (!diff.uscite.length && !diff.entrate.length)) continue;
        const motivo = `Inventario: ${it.colli_dopo.length ? descriviColli(it.colli_dopo, cfg!.uom) : 'vano vuoto'}`;
        if (diff.uscite.length) {
          const scelte = Store.scelteDaUscite(it, diff.uscite);
          const removed = await Store.removeItem(loc, it.item_key, null, null, scelte);
          if (removed) {
            await this._logMov(MOV.FIX_OUT, it.article_code, it.article_description, it.lot_code, loc, null, Store.getCurrentIdentity().initials, motivo, '', removed._qty_before, removed._qty_after - removed._qty_before, removed._qty_after, removed._qty_uom_delta ?? null);
            corrections++;
          }
        }
        if (diff.entrate.length) {
          /* 2.8 — CORREZIONE, NON POSIZIONAMENTO. Una rettifica di inventario
             registra quel che l'operatore ha CONTATO in quel vano: la merce è
             già fisicamente lì, e la regola dell'ubicazione unica non deve
             poter impedire di scrivere un fatto. Se il conto rivela un lotto
             sparso su due vani, a dirlo è la mappa — `LOTTO_SPARSO` in
             `modules/conformita.ts` — non un rifiuto che blocca la conta.
             Vale per tutte le `addItem` di questa vista. */
          const res = await Store.addItem(loc, it.article_code, it.article_description ?? '', it.lot_code, it.expiry_date || '', '', diff.entrate.length, null, diff.entrate, { regolaBase: false });
          if (res.ok) {
            await this._logMov(MOV.FIX_IN, it.article_code, it.article_description, it.lot_code, loc, null, Store.getCurrentIdentity().initials, `${motivo} · trovati ${formattaQuantita(totaleUomColli(diff.entrate, cfg!.uom), cfg!.uom)} ${cfg!.uom}`, '', res.qty_before, diff.entrate.length, res.qty_after, typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null);
            corrections++;
          }
        }
        continue;
      }

      // Caso 1: missing totale → FIX- intero
      if (it.missing) {
        const removed = await Store.removeItem(loc, it.item_key);
        if (removed) {
          await this._logMov(MOV.FIX_OUT, it.article_code, it.article_description, it.lot_code, loc, null, Store.getCurrentIdentity().initials, 'Mancante a inventario', '', sysQty, -sysQty, 0, removed._qty_uom_delta ?? null);   // v2.0.1 [B7] operatore esplicito
          corrections++;
        }
      }
      // Caso 2: conta fisica diversa (counted_qty != null)
      else if (typeof it.counted_qty === 'number') {
        const delta = it.counted_qty - sysQty;
        if (delta === 0) continue;  // nessuna azione
        if (delta < 0) {
          // FIX-: rimuovi |delta| colli — e quali, se la riga li dichiara
          const removed = await Store.removeItem(loc, it.item_key, Math.abs(delta));
          if (removed) {
            await this._logMov(MOV.FIX_OUT, it.article_code, it.article_description, it.lot_code, loc, null, Store.getCurrentIdentity().initials, `Conta fisica: ${it.counted_qty}/${sysQty}`, '', sysQty, delta, it.counted_qty, removed._qty_uom_delta ?? null);   // v2.0.1 [B7]
            corrections++;
          }
        } else {
          // FIX+: aggiungi delta colli (incrementa record esistente)
          /* DIFETTO NOTO — una riga senza descrizione la scrive `undefined`
             in giacenza; vedi `giacenze.ts`. Non si corregge qui. */
          const res = await Store.addItem(loc, it.article_code, it.article_description ?? '', it.lot_code, it.expiry_date || '', '', delta, null, null, { regolaBase: false });
          if (res.ok) {
            await this._logMov(MOV.FIX_IN, it.article_code, it.article_description, it.lot_code, loc, null, Store.getCurrentIdentity().initials, `Conta fisica: ${it.counted_qty}/${sysQty}`, '', sysQty, delta, it.counted_qty, typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null);   // v2.0.1 [B7]
            corrections++;
          }
        }
      }
      // Caso 3: confirmed=true → nessuna azione
    }
    // Extras: nuovi item trovati fisicamente
    for (const ex of extras) {
      const exQty = ex.qty || 1;
      const res = await Store.addItem(loc, ex.article_code, ex.article_description ?? '', ex.lot_code, '', '', exQty, null, null, { regolaBase: false });
      if (res.ok) {
        await this._logMov(MOV.FIX_IN, ex.article_code, ex.article_description, ex.lot_code, loc, null, Store.getCurrentIdentity().initials, 'Item extra trovato a inventario', '', res.qty_before, exQty, res.qty_after, typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null);   // v2.0.1 [B7]
        corrections++;
      }
    }
    if (corrections === 0) this.toast('Nessuna correzione — inventario confermato', 'info');
    else this.toast(`${corrections} correzion${corrections === 1 ? 'e applicata' : 'i applicate'}`, 'success');
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

  /* 1.9 — LE RIGHE CHE ASPETTANO IL LORO TURNO. Vuota quando la conta è
     una sola, che è il caso del compito. Una conta per volta resta la
     regola: la coda dice solo quale sia la prossima. */
  _contaCoda: [],
  _contaFatte: 0,
  _contaTotale: 0,

  /* Apre la riga indicata dal compito. La giacenza si rilegge ADESSO: fra
     la richiesta e l'arrivo davanti allo scaffale può essere passato un
     turno, e contro un numero vecchio si conterebbe a vuoto.

     Chiude la coda: una conta chiesta dal compito non è la prosecuzione di
     un giro che qualcun altro aveva impostato. */
  _contaSelect(loc, itemKey) {
    this._contaCoda = [];
    this._contaFatte = 0;
    this._contaTotale = 0;
    this._contaApri(loc, itemKey);
  },

  /* 1.9 — Un giro di conte: la prima si apre, le altre aspettano. */
  _contaAvviaCoda(righe) {
    if (!righe?.length) return;
    this._contaCoda = righe.slice(1);
    this._contaFatte = 0;
    this._contaTotale = righe.length;
    this._contaApri(righe[0].location_code, righe[0].item_key);
  },

  /* La prossima della coda. Una riga sparita nel frattempo NON ferma il
     giro: si salta e si va avanti, perché chi sta in corsia ha altre
     quattro ubicazioni da fare e una riga uscita non è un errore suo. */
  _contaProssima() {
    while (this._contaCoda.length) {
      const p = this._contaCoda.shift();
      if (Store.getItemsAtLocation(p.location_code).some(i => i.item_key === p.item_key)) {
        this._contaApri(p.location_code, p.item_key);
        return;
      }
      this.toast(`${p.location_code} — quella riga non è più in giacenza: saltata`, 'warning');
    }
    this._contaFineCoda();
  },

  _contaSalta() {
    if (!this._contaCoda.length) return this._contaBack();
    this._contaState = null;
    this._contaProssima();
  },

  _contaFineCoda() {
    const fatte = this._contaFatte;
    const totale = this._contaTotale;
    this._contaCoda = [];
    this._contaFatte = 0;
    this._contaTotale = 0;
    this._contaState = null;
    if (totale > 1) this.toast(`Giro di conte concluso: ${fatte} rig${fatte === 1 ? 'a contata' : 'he contate'} su ${totale}`, 'success');
    this._formInventario($('movFormArea'));
  },

  _contaApri(loc, itemKey) {
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

  /* «Lascia» lascia TUTTO, coda compresa: chi esce da un giro esce dal giro,
     e ritrovarsi davanti la riga successiva sarebbe il contrario. */
  _contaBack() {
    this._contaState = null;
    if (this._contaTotale) { this._contaFineCoda(); return; }
    this._formInventario($('movFormArea'));
  },

  _contaRenderVerify(el) {
    const d = this._contaState;
    const dove = this._getLocInfo(d.location_code);
    /* Dentro un giro, a che punto si è. Il numero serve a decidere se
       prendere il carrello o finire a mano. */
    const indice = this._contaTotale ? this._contaTotale - this._contaCoda.length : 0;
    el.innerHTML = `
      <article class="route-stop-card">
        ${this._contaTotale > 1 ? `<div class="mov-preview mov-preview-ok m-0 mb-4">
          <strong>Giro di conte — riga ${indice} di ${this._contaTotale}.</strong>
          ${this._contaCoda.length ? `Dopo questa ne restano ${this._contaCoda.length}.` : 'È l\'ultima.'}
        </div>` : ''}
        <header class="route-stop-head">
          <span class="route-stop-seq">${this._ico('list-numbers')}</span>
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
        <div class="mov-preview mov-preview-warn my-5 mx-0">
          <strong>Conta i colli che vedi a scaffale.</strong>
          Il numero a sistema compare dopo, quando c'è qualcosa da confrontare.
        </div>

        <div class="form-group mt-6 mx-0 mb-4">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div class="flex gap-3">
            <input class="input input-mono" id="cnLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
              oninput="App._normScan('cnLoc')"
              onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('cnLoc');App._contaCheckLoc();}">
            <button class="btn btn-sm" type="button" onclick="App._pickLoc('cnLoc','_contaCheckLoc')" title="Sfoglia le ubicazioni">${this._ico('map-pin')}</button>
          </div>
        </div>
        <div class="form-group mb-4">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="cnArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._contaCheckArt();}">
        </div>
        <div class="form-group mb-4">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="cnLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._contaCheckLot();}">
        </div>

        <div id="cnFeedback"></div>

        <div class="disp-confirm">
          <div class="form-group w-[180px] mb-5">
            <label class="whitespace-nowrap">④ Colli contati <span class="req">*</span></label>
            <input class="input input-mono text-center font-bold text-title-medium" id="cnQty" type="number" min="0" step="1"
              oninput="App._contaAnteprima()">
          </div>
          <div id="cnConfronto"></div>
          <div class="form-group mb-0">
            <label>Nota (opz.) — se il conteggio non torna, perché</label>
            <input class="input" id="cnNota" maxlength="${Validate.MAX.REASON}" placeholder="Es: due colli trovati nel vano accanto">
          </div>
        </div>

        <div class="flex gap-5 mt-7 flex-wrap">
          <button class="btn btn-primary btn-conferma"
            onclick="App._execConta()">${this._ico('list-numbers')} CONFERMA CONTEGGIO</button>
          ${this._contaCoda.length ? `<button class="btn min-h-touch" onclick="App._contaSalta()" title="Passa alla riga successiva senza contare questa">↷ Salta</button>` : ''}
          <button class="btn min-h-touch" onclick="App._contaBack()">← Lascia</button>
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
      box.innerHTML = `<div class="mov-preview mov-preview-ok mb-5"><strong>${this._ico('check')} Torna.</strong> A sistema ci sono ${d.qty_system} Coll., e ne hai contati altrettanti.</div>`;
      return;
    }
    const segno = delta > 0 ? '+' : '';
    box.innerHTML = `<div class="mov-preview mov-preview-warn mb-5">
      <strong>${this._ico('alert-triangle')} Non torna: ${segno}${delta} Coll.</strong>
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
      this._campoScansionato('cnLoc', false);
      this._scanFb('cnFeedback', 'error', `Sei in ${val}, ma la conta è su ${d.location_code}`);
      return;
    }
    d.scan.loc = val;
    this._scanFb('cnFeedback', 'ok', `Ubicazione ${val} confermata`);
    this._campoScansionato('cnLoc');
    $('cnArt')?.focus();
  },

  _contaCheckArt() {
    const d = this._contaState;
    if (!d) return;
    const val = Validate.clean($('cnArt')?.value, true);
    if (!val) return;
    if (val !== d.article_code) {
      d.scan.art = '';
      this._campoScansionato('cnArt', false);
      this._scanFb('cnFeedback', 'error', `Articolo ${val} diverso da quello da contare (${d.article_code})`);
      return;
    }
    d.scan.art = val;
    this._scanFb('cnFeedback', 'ok', `Articolo ${val} confermato`);
    this._campoScansionato('cnArt');
    $('cnLot')?.focus();
  },

  _contaCheckLot() {
    const d = this._contaState;
    if (!d) return;
    const val = Validate.clean($('cnLot')?.value);
    if (!val) return;
    if (val !== d.lot_code) {
      d.scan.lot = '';
      this._campoScansionato('cnLot', false);
      this._scanFb('cnFeedback', 'error', `Lotto ${val} diverso da quello da contare (${d.lot_code})`);
      return;
    }
    d.scan.lot = val;
    this._scanFb('cnFeedback', 'ok', `Lotto ${val} confermato — adesso conta i colli`);
    this._campoScansionato('cnLot');
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

    /* 1.8.4 — SU UNA RIGA A COLLI DICHIARATI, UNA CONTA NON È UN NUMERO SOLO.
       Fino alla 1.8.3 qui si chiedeva QUALI colli mancano, e i colli in più
       si rifiutavano: erano da posizionare da Movimenta. Adesso si chiede
       com'è fatto quello che si ha davanti, come nell'inventario di vano, e
       la differenza la calcola `rettifica` — in meno e in più.

       LA DICHIARAZIONE PARTE VUOTA, e non è una svista: la Conta non mostra
       il proprio numero prima che qualcuno abbia contato, e un elenco già
       compilato sarebbe quel numero scritto per esteso.

       Il numero di ④ resta, e fa da riscontro: se i due non dicono la stessa
       cosa la rettifica non parte. Contare dieci colli e dichiararne nove è
       un conto che non torna, e a dire quale dei due sia giusto non è il
       sistema. */
    const elencoConta = Store.colliDiRiga(it);
    let colliDopo = null;
    if (elencoConta) {
      colliDopo = await this._ridichiaraColli(it, "Com'è fatto quello che hai contato", { daZero: true });
      if (colliDopo === undefined) return this.toast('Conta annullata', 'info');
      if (colliDopo.length !== contati) {
        return this.toast(`Hai contato ${contati} coll. e ne hai dichiarati ${colliDopo.length}: i due numeri devono dire la stessa cosa`, 'error');
      }
    }

    try {
      if (colliDopo) {
        const cfgConta = Store.getUomConfig(it.article_code, it.lot_code)!;
        const diff = rettifica(elencoConta, colliDopo, cfgConta.uom);
        const motivo = `${dettaglio} · ${colliDopo.length ? descriviColli(colliDopo, cfgConta.uom) : 'vano vuoto'}`;
        if (diff?.uscite.length) {
          const tolti = await Store.removeItem(d.location_code, d.item_key, null, null, Store.scelteDaUscite(it, diff.uscite));
          if (!tolti) return this.toast('Rettifica non riuscita', 'error');
          await this._logMov(MOV.FIX_OUT, d.article_code, d.article_description, d.lot_code,
            d.location_code, null, sigla, motivo, '', tolti._qty_before, tolti._qty_after - tolti._qty_before, tolti._qty_after,
            tolti._qty_uom_delta ?? null);
        }
        if (diff?.entrate.length) {
          const res = await Store.addItem(d.location_code, d.article_code, d.article_description,
            d.lot_code, d.expiry_date || '', '', diff.entrate.length, null, diff.entrate, { regolaBase: false });
          if (!res.ok) return this.toast('Rettifica non riuscita', 'error');
          await this._logMov(MOV.FIX_IN, d.article_code, d.article_description, d.lot_code,
            d.location_code, null, sigla, `${motivo} · trovati ${formattaQuantita(totaleUomColli(diff.entrate, cfgConta.uom), cfgConta.uom)} ${cfgConta.uom}`, '', res.qty_before, diff.entrate.length, res.qty_after,
            typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null);
        }
      } else if (delta < 0) {
        const tolti = contati === 0
          ? await Store.removeItem(d.location_code, d.item_key)
          : await Store.removeItem(d.location_code, d.item_key, Math.abs(delta));
        if (!tolti) return this.toast('Rettifica non riuscita', 'error');
        await this._logMov(MOV.FIX_OUT, d.article_code, d.article_description, d.lot_code,
          d.location_code, null, sigla, dettaglio, '', sistema, tolti._qty_delta ?? delta, tolti._qty_after ?? contati,
          tolti._qty_uom_delta ?? null);
      } else if (delta > 0) {
        const res = await Store.addItem(d.location_code, d.article_code, d.article_description,
          d.lot_code, d.expiry_date || '', '', delta, null, null, { regolaBase: false });
        if (!res.ok) return this.toast('Rettifica non riuscita', 'error');
        await this._logMov(MOV.FIX_IN, d.article_code, d.article_description, d.lot_code,
          d.location_code, null, sigla, dettaglio, '', sistema, delta, contati,
          typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null);
      }
    } catch (err) {
      return this.toast(`Rettifica non riuscita: ${(err as Error).message || 'errore'}`, 'error');
    }

    if (delta === 0) this.toast(`Conta confermata: ${contati} Coll., come a sistema`, 'success');
    else this.toast(`Giacenza rettificata a ${contati} Coll. (${delta > 0 ? '+' : ''}${delta})`, 'success');
    this.updateSyncIndicator();
    this._refreshSessionLog();

    /* 1.4.4 — LA CONTA SI CHIUDE QUI, CONFERMATA O RETTIFICATA CHE SIA.
       È un tipo «a gesto»: quanti colli si siano corretti non decide niente,
       perché un inventario che torna giusto non produce nessuna riga ed è
       comunque un lavoro fatto. I colli passati sono lo scarto assoluto, e
       servono al registro delle attività per dire quanto ha pesato. */
    await this._taskAvanza(Math.abs(delta), ['COUNT']);
    this._contaState = null;
    /* 1.9 — se questa conta faceva parte di un giro, la successiva si apre
       da sola: chi ha spuntato cinque lotti ha chiesto un giro, non cinque
       volte la stessa maschera. */
    if (this._contaTotale) { this._contaFatte++; this._contaProssima(); return; }
    this._formInventario($('movFormArea'));
  },

  /* ═══════════════════════════════════════════════════════════════════
     1.9 — L'INVENTARIO PER ARTICOLO
     © Andrea Sacchetti — Dietopack S.r.l.

     Di un articolo si vuole sapere quanto ce n'è e dove sta, e da lì
     partire a contarlo. Fino alla 1.8 la risposta si otteneva dalla ricerca
     in barra, che restituisce un elenco piatto: lo stesso lotto compariva
     tre volte perché sta in tre ubicazioni, e il totale se lo faceva a
     mente chi guardava.

     Qui i lotti si raggruppano e si ordinano FEFO — `modules/giacenzaArticolo`
     — e ogni riga si può spuntare. Le righe spuntate diventano UNA CODA DI
     CONTE, che è la ragione per cui questo ramo sta in Inventario e non in
     una pagina sua: la conta è quella di sempre, riga per riga, con le sue
     tre scansioni. Cambia solo che alla fine di una parte la successiva,
     nell'ordine dello scaffale e non in quello in cui si è spuntato.
     ═══════════════════════════════════════════════════════════════════ */

  /* L'articolo aperto e le righe spuntate. La giacenza NON sta qui dentro:
     si rilegge a ogni disegno, perché fra una spunta e l'altra un altro
     terminale può aver mosso una riga. */
  _gaState: null,

  _invFormArticolo(el) {
    const st = this._gaState;
    el.innerHTML = `<div>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① ARTICOLO</span> → INVIO per cercare → <span class="wf-step">② spunta i lotti</span> da verificare → <span class="wf-step">③ CONTA</span> o <span class="wf-step">${this._ico('printer')} STAMPA</span>.
      </div>
      <div class="form-group mb-5">
        <label>Articolo — codice o descrizione</label>
        <div class="flex gap-3">
          <input class="input input-mono uppercase flex-1" id="invArtQ" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
            value="${this._esc(st?.code || '')}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._invArtCerca();}">
          <button class="btn btn-sm btn-primary" onclick="App._invArtCerca()">Cerca</button>
        </div>
      </div>
      <div id="invArtContent"></div>
    </div>`;
    if (st) this._invArtRender();
    setTimeout(() => $('invArtQ')?.focus(), 30);
  },

  /* Un codice esatto apre direttamente; altrimenti si mostrano i candidati.
     Cercare per descrizione è il caso di chi ha in mano il cartellino e non
     il codice, ed è quello in cui un elenco serve davvero. */
  _invArtCerca() {
    const q = Validate.clean($('invArtQ')?.value, true);
    const box = $('invArtContent');
    if (!box) return;
    if (!q || q.length < 2) {
      this._gaState = null;
      box.innerHTML = '<div class="text-body-small text-sx-text-muted p-3">Digita almeno due caratteri.</div>';
      return;
    }
    if (Store.getArticle(q)) { this._invArtApri(q); return; }
    const cand = Store.getArticles().filter(a =>
      a.code.toUpperCase().includes(q) || (a.description || '').toUpperCase().includes(q));
    if (cand.length === 1) { this._invArtApri(cand[0]!.code); return; }
    this._gaState = null;
    if (!cand.length) {
      box.innerHTML = `<div class="text-sx-danger text-body-small p-3">Nessun articolo trovato per «${this._esc(q)}»</div>`;
      return;
    }
    const righe = cand.slice(0, 30).map(a => {
      const dove = Store.findItemLocations(a.code).filter(i => i.article_code === a.code);
      return `<div class="inv-item-row" onclick="App._invArtApri('${this._esc(a.code)}')">
        <div class="inv-info">
          <div class="inv-code">${this._esc(a.code)} <span class="font-normal text-sx-text-secondary text-body-small">${this._esc(a.description || '')}</span></div>
          <div class="inv-lot">${dove.length ? `${this._ico('map-pin')} ${dove.length} ubicazion${dove.length === 1 ? 'e' : 'i'}` : 'non a magazzino'}</div>
        </div>
        <div class="inv-actions-row"><span class="text-sx-text-muted">→</span></div>
      </div>`;
    }).join('');
    box.innerHTML = `<p class="text-body-small text-sx-text-secondary mb-4"><strong>${cand.length}</strong> articoli corrispondono — scegli quale aprire${cand.length > 30 ? ' (primi 30)' : ''}.</p>${righe}`;
  },

  _invArtApri(code) {
    const art = Store.getArticle(code);
    this._gaState = { code, desc: art?.description || '', sel: [] };
    const campo = $('invArtQ');
    if (campo) campo.value = code;
    this._invArtRender();
  },

  /* Le righe dell'articolo con le UM già risolte: la regola di lettura è
     quella di Store, e resta una sola — dove c'è l'elenco dei colli comanda
     l'elenco. */
  _invArtRighe() {
    const code = this._gaState?.code;
    if (!code) return [];
    return Store.righeLette(Store.findItemLocations(code).filter(i => i.article_code === code));
  },

  _invArtRender() {
    const st = this._gaState;
    const box = $('invArtContent');
    if (!st || !box) return;
    const righe = this._invArtRighe();
    /* Le spunte su righe sparite si buttano: la selezione non deve
       sopravvivere alla merce che nominava. */
    const vive = new Set(righe.map((r: RigaArticolo) => chiaveRiga(r)));
    st.sel = st.sel.filter((k: string) => vive.has(k));
    const r = riepiloga(righe);

    if (!righe.length) {
      box.innerHTML = `<div class="mov-preview mov-preview-warn">
        <strong>${this._esc(st.code)}</strong> ${this._esc(st.desc || '')} — <strong>non è a magazzino.</strong>
        Non c'è niente da contare.</div>`;
      return;
    }

    const uom = r.totali.map(t => `${formattaQuantita(t.quantita, t.uom)} ${this._esc(t.uom)}`).join(' · ');
    let html = `<div class="mov-preview mov-preview-ok mb-5">
      <strong class="mono">${this._esc(st.code)}</strong> ${this._esc(st.desc || '')}<br>
      <strong>${r.colli} Coll.</strong>${uom ? ` · <strong>${uom}</strong>` : ''} —
      ${r.lotti.length} lott${r.lotti.length === 1 ? 'o' : 'i'} su ${r.ubicazioni} ubicazion${r.ubicazioni === 1 ? 'e' : 'i'}
      ${r.senzaUnita ? `<br><span class="text-sx-warning">${this._ico('alert-triangle')} ${r.senzaUnita} righe senza unità: il totale in UM non racconta tutta la giacenza</span>` : ''}
    </div>`;

    for (const g of r.lotti) {
      const chiavi = g.righe.map(x => chiaveRiga(x));
      const tutte = chiavi.every(k => st.sel.includes(k));
      html += `<div class="mt-5">
        <div class="flex items-center gap-3 mb-2">
          <input type="checkbox" id="gaLot${this._esc(g.lot_code)}" ${tutte ? 'checked' : ''}
            onchange="App._invArtToggleLotto('${this._esc(g.lot_code)}')">
          <label class="mb-0 font-bold" for="gaLot${this._esc(g.lot_code)}">Lotto ${this._esc(g.lot_code)}</label>
          <span class="text-label-small text-sx-text-muted">
            ${g.expiry_date ? `⏱ Scad. ${this._esc(this._dateISOtoIT(g.expiry_date))} · ` : ''}
            ${g.colli} Coll.${typeof g.uom_qty === 'number' && g.uom ? ` · ${formattaQuantita(g.uom_qty, g.uom)} ${this._esc(g.uom)}` : ''}
          </span>
        </div>`;
      for (const riga of g.righe) {
        const k = chiaveRiga(riga);
        html += `<div class="inv-item-row">
          <div class="inv-info flex items-center gap-3">
            <input type="checkbox" ${st.sel.includes(k) ? 'checked' : ''} onchange="App._invArtToggle('${this._esc(k)}')">
            <div>
              <div class="inv-code">${this._ico('map-pin')} ${this._esc(riga.location_code)}</div>
              <div class="inv-lot">${riga.colli} Coll.${riga.descrizione && riga.descrizione !== '—' ? ` · ${this._ico('scale')} ${this._esc(riga.descrizione)}` : ''}</div>
            </div>
          </div>
          <div class="inv-actions-row">
            <button class="inv-btn" title="Apri l'ubicazione sulla mappa" onclick="App.goToLocation('${this._esc(riga.location_code)}')">${this._ico('map')}</button>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    const n = st.sel.length;
    html += `<div class="mov-divider"></div>
      <div class="flex gap-3 flex-wrap mb-5">
        <button class="btn btn-sm" onclick="App._invArtTutti(true)">Seleziona tutto</button>
        <button class="btn btn-sm" onclick="App._invArtTutti(false)">Nessuno</button>
        <button class="btn btn-sm" onclick="App._invArtStampa()">${this._ico('printer')} Stampa riepilogo</button>
      </div>
      <button class="btn btn-primary btn-conferma" ${n ? '' : 'disabled'} onclick="App._invArtConta()">
        ${this._ico('list-numbers')} CONTA ${n ? `${n} rig${n === 1 ? 'a' : 'he'}` : '— spunta almeno una riga'}
      </button>`;
    box.innerHTML = html;
  },

  _invArtToggle(chiave) {
    const st = this._gaState;
    if (!st) return;
    const i = st.sel.indexOf(chiave);
    if (i >= 0) st.sel.splice(i, 1); else st.sel.push(chiave);
    this._invArtRender();
  },

  _invArtToggleLotto(lot) {
    const st = this._gaState;
    if (!st) return;
    const chiavi: string[] = this._invArtRighe()
      .filter((r: RigaArticolo) => r.lot_code === lot)
      .map((r: RigaArticolo) => chiaveRiga(r));
    const tutte = chiavi.every((k: string) => st.sel.includes(k));
    st.sel = tutte
      ? st.sel.filter((k: string) => !chiavi.includes(k))
      : [...new Set([...st.sel, ...chiavi])];
    this._invArtRender();
  },

  _invArtTutti(on) {
    const st = this._gaState;
    if (!st) return;
    st.sel = on ? this._invArtRighe().map((r: RigaArticolo) => chiaveRiga(r)) : [];
    this._invArtRender();
  },

  /* Le righe spuntate diventano la coda, nell'ordine dello scaffale. */
  _invArtConta() {
    const st = this._gaState;
    if (!st) return;
    if (!this._requireOperator('la conta')) return;
    const coda = codaDiConta(this._invArtRighe(), st.sel);
    if (!coda.length) return this.toast('Nessuna riga da contare: quelle spuntate non sono più in giacenza', 'error');
    this._contaAvviaCoda(coda.map(r => ({ location_code: r.location_code, item_key: r.item_key })));
  },

  /* IL RIEPILOGO SU CARTA: si porta a scaffale e ci si scrive sopra. Per
     questo la colonna «Contati» esce vuota — un foglio che porta già il
     numero di sistema non è una verifica, è un suggerimento, ed è la stessa
     ragione per cui la maschera della Conta lo nasconde finché non si è
     contato. */
  _invArtStampa() {
    const st = this._gaState;
    if (!st) return;
    const righe = this._invArtRighe();
    if (!righe.length) return this.toast('Niente da stampare: articolo non a magazzino', 'error');
    const r = riepiloga(righe);
    const E = (v: unknown) => this._esc(v);

    let corpo = '';
    for (const g of r.lotti) {
      for (const riga of g.righe) {
        corpo += `<tr>
          <td class="td-lot">${E(g.lot_code)}</td>
          <td class="td-num">${g.expiry_date ? E(this._dateISOtoIT(g.expiry_date)) : '—'}</td>
          <td class="td-loc">${E(riga.location_code)}</td>
          <td class="td-num">${riga.colli}</td>
          <td class="td-num">${typeof riga.uom_qty === 'number' && riga.uom ? `${E(formattaQuantita(riga.uom_qty, riga.uom))} ${E(riga.uom)}` : '—'}</td>
          <td class="td-num"></td>
        </tr>`;
      }
    }

    const totali = r.totali.map(t => `${formattaQuantita(t.quantita, t.uom)} ${t.uom}`).join(' · ');
    const body = `
      <div class="pr-sec">Riepilogo
        <span class="pr-sec-note">— lotti in ordine di scadenza, il primo è il primo che esce</span></div>
      <table class="pr-table">
        <thead><tr>
          <th>Lotto</th>
          <th class="w-[86px]">Scadenza</th>
          <th class="w-[110px]">Ubicazione</th>
          <th class="w-[60px] text-center">Colli</th>
          <th class="w-[90px] text-center">Quantità</th>
          <th class="w-[80px] text-center">Contati</th>
        </tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr>
          <td colspan="3"><b>Totale a sistema</b></td>
          <td class="td-num"><b>${r.colli}</b></td>
          <td class="td-num"><b>${E(totali || '—')}</b></td>
          <td class="td-num"></td>
        </tr></tfoot>
      </table>
      ${r.senzaUnita ? `<p class="doc-note">${this._ico('alert-triangle')} ${r.senzaUnita} righe senza unità di misura: il totale in quantità non copre tutta la giacenza.</p>` : ''}`;

    this._docPrint(this._docPageHTML({
      kind: 'RIEPILOGO DI GIACENZA',
      kindSub: st.desc || 'Articolo',
      numLabel: 'Articolo',
      num: st.code,
      dateLabel: 'al',
      dateVal: this._fmtStamp(Date.now()),
      body,
      docId: `GIAC-${st.code}`,
      flow: true,
      signs: [{ role: 'Operatore magazzino', hint: 'Data e firma' }],
    }));
  },
} satisfies Vista;
