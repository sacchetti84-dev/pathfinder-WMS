import { type Vista, $, $sel } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { riconosci } from '../../modules/udc';
import type { Giacenza } from '../../types/entita';

/* ═══════════════════════════════════════════════════════════════════════
   1.12 — LE UNITÀ DI CARICO, LA MASCHERA
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Un'UDC è un contenitore che sta in un'ubicazione e porta la merce con sé.
   Qui la si crea, ci si carica sopra la merce che sta nello stesso vano, e
   la si sposta — intera, in una transazione sola.

   NASCE SU COMANDO, MUORE DA SOLA: non c'è nessun pulsante «elimina». Quando
   l'ultima riga esce, il contenitore si chiude da solo, e il record resta —
   la tracciabilità di cosa ci sia stato sopra non si cancella con lui.

   La regola del codice sta in `modules/udc.ts`, quel che scrive in `Store`.
   Qui c'è solo il gesto.
   ═══════════════════════════════════════════════════════════════════════ */

export const VistaUdc = {
  _udcSel: null,

  _formUdc(el) {
    if (!el) return;
    const aperte = Store.getUdcAperte();
    const prefisso = Store.getPrefissoGS1();
    el.innerHTML = `<div class="mov-form-card">
      <h3>📦 <span class="text-sx-teal">Unità di carico</span></h3>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① NUOVA</span> nel vano dove sta il pallet →
        <span class="wf-step">② carica</span> le righe che ci stanno sopra →
        <span class="wf-step">③ SPOSTA</span>, e la merce va con lei.
      </div>
      <div class="mov-preview ${prefisso ? 'mov-preview-ok' : ''} mb-5">
        ${prefisso
          ? `Prefisso GS1 <strong class="mono">${this._esc(prefisso)}</strong> — le etichette nuove sono <strong>SSCC</strong>.`
          : 'Nessun prefisso GS1: le etichette nuove portano un <strong>codice interno</strong>. Si cambia in Configurazione → Funzioni.'}
      </div>
      <div class="flex gap-3 flex-wrap mb-6">
        <button class="btn btn-success" onclick="App._udcNuova()">+ Nuova unità di carico</button>
      </div>
      <div id="udcElenco"></div>
      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
    this._udcRenderElenco(aperte);
  },

  _udcRenderElenco(aperte) {
    const box = $('udcElenco');
    if (!box) return;
    const lista = aperte || Store.getUdcAperte();
    if (!lista.length) {
      box.innerHTML = '<div class="empty-state p-7.5"><p>Nessuna unità di carico aperta</p></div>';
      return;
    }
    let html = `<p class="text-body-small text-sx-text-secondary mb-4"><strong>${lista.length}</strong> aperte. Una unità vuota si chiude da sola e sparisce da qui.</p>`;
    for (const u of lista) {
      const righe = Store.righeDiUdc(u.udc_id);
      const colli = righe.reduce((t, r) => t + (r.qty || 0), 0);
      const scelta = this._udcSel === u.udc_id;
      html += `<div class="inv-item-row ${scelta ? 'font-bold' : ''}">
        <div class="inv-info">
          <div class="inv-code">${this._esc(u.udc_id)} <span class="badge badge-muted">${this._esc(u.type || 'pallet')}</span></div>
          <div class="inv-lot">
            📍 ${this._esc(u.location_code || '— senza ubicazione')} ·
            ${righe.length} rig${righe.length === 1 ? 'a' : 'he'} · ${colli} Coll.
          </div>
        </div>
        <div class="inv-actions-row">
          <button class="inv-btn" title="Apri e carica la merce" onclick="App._udcApri('${this._esc(u.udc_id)}')">${scelta ? '▾' : '▸'}</button>
          <button class="inv-btn" title="Sposta l'unità intera" onclick="App._udcChiediSposta('${this._esc(u.udc_id)}')">🔀</button>
          <button class="inv-btn" title="Ristampa l'etichetta" onclick="App._udcEtichetta('${this._esc(u.udc_id)}')">🏷</button>
        </div>
      </div>`;
      if (scelta) html += this._udcDettaglioHTML(u, righe);
    }
    box.innerHTML = html;
  },

  /* Il contenuto, e la merce del vano che ci si può ancora caricare sopra.
     Solo quella dello STESSO vano: un contenitore sta in un'ubicazione, e
     caricarci merce che sta altrove vorrebbe dire un pallet in due posti. */
  _udcDettaglioHTML(u, righe) {
    const nel = u.location_code ? Store.getItemsAtLocation(u.location_code) : [];
    const libere = nel.filter((i: Giacenza) => !i.udc_id);
    let html = '<div class="pl-6 pb-5">';
    html += righe.length
      ? `<div class="text-label-small text-sx-text-muted mb-2">Sopra questa unità</div>${righe.map((r: Giacenza) => `
        <div class="inv-item-row">
          <div class="inv-info">
            <div class="inv-code">${this._esc(r.article_code)} <span class="font-normal text-body-small text-sx-text-secondary">${this._esc(r.article_description || '')}</span></div>
            <div class="inv-lot">Lotto ${this._esc(r.lot_code)} · ${r.qty || 0} Coll. · ⚖ ${this._esc(Store.descriviRiga(r))}</div>
          </div>
          <div class="inv-actions-row">
            <button class="inv-btn" title="Togli dall'unità: la merce resta nel vano" onclick="App._udcScarica('${this._esc(r.item_key)}')">↧</button>
          </div>
        </div>`).join('')}`
      : '<div class="text-body-small text-sx-text-muted p-3">Vuota — si chiuderà da sola appena qualcosa entra ed esce.</div>';

    if (libere.length) {
      html += `<div class="text-label-small text-sx-text-muted mt-4 mb-2">Nel vano, non ancora su un'unità</div>${libere.map((r: Giacenza) => `
        <div class="inv-item-row">
          <div class="inv-info">
            <div class="inv-code">${this._esc(r.article_code)} <span class="font-normal text-body-small text-sx-text-secondary">${this._esc(r.article_description || '')}</span></div>
            <div class="inv-lot">Lotto ${this._esc(r.lot_code)} · ${r.qty || 0} Coll.</div>
          </div>
          <div class="inv-actions-row">
            <button class="inv-btn" title="Carica su questa unità" onclick="App._udcCarica('${this._esc(r.item_key)}')">↥</button>
          </div>
        </div>`).join('')}`;
    }
    return html + '</div>';
  },

  _udcApri(id) {
    this._udcSel = this._udcSel === id ? null : id;
    this._udcRenderElenco();
  },

  _udcNuova() {
    this.showModal(
      '📦 Nuova unità di carico',
      `<div class="form-row mb-6">
        <div class="form-group">
          <label>Tipo</label>
          <select class="select" id="udcTipo">
            <option value="pallet">Pallet</option>
            <option value="cassone">Cassone</option>
            <option value="carrello">Carrello</option>
          </select>
        </div>
        <div class="form-group">
          <label>Ubicazione <span class="req">*</span></label>
          <div class="flex gap-3">
            <input class="input input-mono uppercase flex-1" id="udcLoc" placeholder="Scansiona o digita" autofocus maxlength="${Validate.MAX.LOC_CODE}"
              oninput="this.value=this.value.toUpperCase();App._previewLoc('udcLoc','udcLocPrev')"
              onkeydown="if(event.key==='Enter'){event.preventDefault();App._udcCrea()}">
            <button class="btn btn-sm" type="button" onclick="App._pickLoc('udcLoc',null)" title="Sfoglia">📍</button>
          </div>
          <div id="udcLocPrev"></div>
        </div>
      </div>
      <div class="mov-preview">
        Il codice lo assegna il sistema e <strong>non si riusa mai</strong>.
        L'etichetta si stampa subito: è quella che resterà incollata al legno.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-success" onclick="App._udcCrea()">+ Crea e stampa</button>`
    );
  },

  async _udcCrea() {
    if (!this._requireOperator('la creazione di un’unità di carico')) return;
    const loc = Validate.clean($('udcLoc')?.value, true).replace(/'/g, '-');
    if (!loc) return this.toast('Indica l’ubicazione in cui sta l’unità', 'error');
    if (!Store.locationExists(loc)) return this.toast(`Ubicazione ${loc} inesistente`, 'error');
    const stato = Store.getLocationStatus(loc);
    if (stato === 'disabled') return this.toast(`Ubicazione ${loc} disattivata`, 'error');

    let rec = null;
    try {
      rec = await Store.createUdc({ type: $sel('udcTipo')?.value || 'pallet', location_code: loc });
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    await this._logMov(MOV.EDIT, '', '', '', loc, null, '', `Unità di carico creata: ${rec.udc_id}`);
    this.closeModal();
    this._udcSel = rec.udc_id;
    this._formUdc($('movFormArea'));
    this.updateSyncIndicator();
    this.toast(`📦 ${rec.udc_id} creata in ${loc}`, 'success');
    /* L'etichetta si stampa alla CREAZIONE: un pallet senza etichetta è un
       pallet che nessuno può scansionare, e stamparla dopo vuol dire
       ricordarsene. */
    this._udcEtichetta(rec.udc_id);
  },

  async _udcCarica(itemKey) {
    if (!this._udcSel) return;
    const u = Store.getUdc(this._udcSel);
    if (!u) return;
    try {
      await Store.assegnaAUdc(u.location_code || '', itemKey, u.udc_id);
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    await this._logMov(MOV.EDIT, itemKey.split('#')[0] || '', '', itemKey.split('#')[1] || '',
      u.location_code || '', null, '', `Caricato su ${u.udc_id}`);
    this._udcRenderElenco();
    this.updateSyncIndicator();
    this.toast(`↥ ${itemKey} su ${u.udc_id}`, 'success');
  },

  async _udcScarica(itemKey) {
    if (!this._udcSel) return;
    const u = Store.getUdc(this._udcSel);
    if (!u) return;
    try {
      await Store.assegnaAUdc(u.location_code || '', itemKey, null);
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    await this._logMov(MOV.EDIT, itemKey.split('#')[0] || '', '', itemKey.split('#')[1] || '',
      u.location_code || '', null, '', `Tolto da ${u.udc_id}`);
    /* Se era l'ultima, l'unità si è chiusa da sola: sparisce dall'elenco e
       la selezione non deve restare puntata su un contenitore morto. */
    if (!Store.getUdc(this._udcSel) || Store.getUdc(this._udcSel)!.status === 'empty') this._udcSel = null;
    this._formUdc($('movFormArea'));
    this.updateSyncIndicator();
    this.toast(`↧ ${itemKey} tolto da ${u.udc_id}`, 'success');
  },

  _udcChiediSposta(id) {
    const u = Store.getUdc(id);
    if (!u) return this.toast('Unità non trovata', 'error');
    const righe = Store.righeDiUdc(id);
    this.showModal(
      `🔀 Sposta ${this._esc(id)}`,
      `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        <span class="mono font-bold text-sx-teal">${this._esc(id)}</span> · ${this._esc(u.type || 'pallet')}<br>
        Adesso in <strong class="mono">${this._esc(u.location_code || '—')}</strong> ·
        <strong>${righe.length} rig${righe.length === 1 ? 'a' : 'he'}</strong> sopra
      </div>
      <div class="form-group mb-6">
        <label>Ubicazione di destinazione <span class="req">*</span></label>
        <div class="flex gap-3">
          <input class="input input-mono uppercase flex-1" id="udcDest" placeholder="Scansiona o digita" autofocus maxlength="${Validate.MAX.LOC_CODE}"
            oninput="this.value=this.value.toUpperCase();App._previewLoc('udcDest','udcDestPrev')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._udcSposta('${this._esc(id)}')}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('udcDest',null)" title="Sfoglia">📍</button>
        </div>
        <div id="udcDestPrev"></div>
      </div>
      <div class="mov-preview">
        L'unità e <strong>tutte le sue righe</strong> cambiano ubicazione insieme,
        in una transazione sola. Il contenuto non si tocca: colli e quantità restano quelli.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App._udcSposta('${this._esc(id)}')">🔀 Sposta</button>`
    );
  },

  async _udcSposta(id) {
    if (!this._requireOperator('lo spostamento di un’unità di carico')) return;
    const u = Store.getUdc(id);
    if (!u) return this.toast('Unità non trovata', 'error');
    const dest = Validate.clean($('udcDest')?.value, true).replace(/'/g, '-');
    if (!dest) return this.toast('Indica l’ubicazione di destinazione', 'error');
    const stato = Store.locationExists(dest) ? Store.getLocationStatus(dest) : null;
    if (stato === null) return this.toast(`Ubicazione ${dest} inesistente`, 'error');
    if (stato === 'blocked' || stato === 'disabled') {
      return this.toast(`Ubicazione ${dest} ${stato === 'blocked' ? 'BLOCCATA' : 'DISATTIVATA'}`, 'error');
    }
    const da = u.location_code || '';

    let esito = null;
    try {
      esito = await Store.moveUdc(id, dest, {
        type: MOV.MOVE, article_code: '', article_description: '', lot_code: '',
        location_code: da, dest_location: dest,
        user: Store.getCurrentIdentity().initials, ts: Date.now(),
        notes: `Unità di carico ${id} — ${Store.righeDiUdc(id).length} righe`,
      });
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    this.closeModal();
    this._formUdc($('movFormArea'));
    this.renderMap();
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
    this.toast(`🔀 ${id}: ${da} → ${dest} · ${esito?.righe ?? 0} righe`, 'success');
  },

  /* ─── L'ETICHETTA ──────────────────────────────────────────────────
     100 × 80 mm su A4, dal browser: nessun driver, nessuna stampante
     speciale. Il codice si scrive grande e in chiaro sotto la
     rappresentazione: un lettore che non legge lascia comunque a chi ha il
     pallet davanti un numero da digitare. */
  _udcEtichetta(id) {
    const u = Store.getUdc(id);
    if (!u) return this.toast('Unità non trovata', 'error');
    const forma = riconosci(u.udc_id);
    const righe = Store.righeDiUdc(id);
    const creata = new Date(u.created_at || Date.now()).toLocaleString('it-IT',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const sede = Store.getDocConfig().sender;

    this._docPrint(`<div class="udc-label">
      <div class="udc-label-head">
        <div class="udc-label-mitt">${this._esc(sede?.name || 'Dietopack S.r.l.')}</div>
        <div class="udc-label-tipo">${this._esc((u.type || 'pallet').toUpperCase())}</div>
      </div>
      <div class="udc-label-code">${this._esc(u.udc_id)}</div>
      <div class="udc-label-forma">${forma.forma === 'sscc' ? 'SSCC (GS1)' : 'Codice interno'}</div>
      <div class="udc-label-body">
        <div><span>Ubicazione</span><b>${this._esc(u.location_code || '—')}</b></div>
        <div><span>Creata il</span><b>${this._esc(creata)}</b></div>
        <div><span>Da</span><b>${this._esc(u.created_by || '—')}</b></div>
        <div><span>Righe alla stampa</span><b>${righe.length}</b></div>
      </div>
      <div class="udc-label-foot">Pathfinder — l'etichetta resta valida finché l'unità esiste. Il codice non si riusa.</div>
    </div>`);
  },
} satisfies Vista;
