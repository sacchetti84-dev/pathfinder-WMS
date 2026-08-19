import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { consumo as consumoWip, daRendere } from '../../modules/wip';
import { formattaQuantita } from '../../modules/misure';

/* ═══════════════════════════════════════════════════════════════════════
   1.14 — IL CONTO DI PRODUZIONE, LA MASCHERA
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Qui si guarda un ordine: quanto è entrato in lavorazione, quanto è
   tornato, quanto è ancora fuori. Da qui si rende quello che avanza, e si
   chiude il conto — ed è la chiusura a trasformare il residuo in CONSUMO.

   IL CONSUMO NON SI DEDUCE OGNI SERA. Finché l'ordine è aperto il residuo è
   merce ancora sul bancone: chiamarlo consumo scriverebbe un numero che alle
   sette di sera è sempre sbagliato. Per questo il riquadro dice «ancora in
   lavorazione» e non «consumato», e cambia parola solo alla chiusura.

   CHIUDERE NON CANCELLA NIENTE. Le righe restano, il vano WIP resta con
   dentro quello che non è tornato, e la chiusura è un movimento come gli
   altri: la merce esce dal conto perché è finita nel prodotto.

   La regola sta in `modules/wip.ts`, pura e collaudata.
   ═══════════════════════════════════════════════════════════════════════ */

export const VistaWip = {
  _wipOrdine: '',

  _formWip(el) {
    if (!el) return;
    const area = Store.getAreaWip();
    const aperti = Store.ordiniWipAperti();
    if (!this._wipOrdine && aperti.length) this._wipOrdine = aperti[0];

    el.innerHTML = `<div>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① ORDINE</span> →
        <span class="wf-step">② rendi</span> quello che avanza →
        <span class="wf-step">③ CHIUDI</span>, e il residuo diventa consumo.
      </div>
      ${area
        ? `<div class="mov-preview mov-preview-ok mb-5">Area WIP: <strong class="mono">${this._esc(area)}</strong> — la merce in lavorazione sta lì, e a tenere distinti i conti è l'ordine su ogni riga.</div>`
        : `<div class="mov-preview mov-preview-warn mb-5"><strong>Area WIP non configurata.</strong> Si imposta in Configurazione → Funzioni: senza, il prelievo di produzione non ha dove portare la merce.</div>`}
      <div class="form-group mb-5">
        <label>① Ordine di produzione</label>
        <div class="flex gap-3">
          <input class="input input-mono uppercase flex-1" id="wipOrd" placeholder="Numero ordine" maxlength="40"
            value="${this._esc(this._wipOrdine)}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._wipApri();}">
          <button class="btn btn-sm btn-primary" onclick="App._wipApri()">Apri</button>
        </div>
        ${aperti.length ? `<div class="text-label-small text-sx-text-muted mt-2">
          Conti aperti: ${aperti.slice(0, 8).map((o) => `<button class="btn btn-sm" onclick="App._wipApri('${this._esc(o)}')">${this._esc(o)}</button>`).join(' ')}
        </div>` : '<div class="text-label-small text-sx-text-muted mt-2">Nessun conto aperto.</div>'}
      </div>
      <div id="wipConto"></div>
    </div>`;
    if (this._wipOrdine) this._wipRenderConto();
  },

  _wipApri(ordine = null) {
    const o = String(ordine ?? $('wipOrd')?.value ?? '').trim().toUpperCase();
    this._wipOrdine = o;
    const campo = $('wipOrd');
    if (campo) campo.value = o;
    this._wipRenderConto();
  },

  _wipRenderConto() {
    const box = $('wipConto');
    if (!box) return;
    const odp = this._wipOrdine;
    if (!odp) { box.innerHTML = ''; return; }
    const c = Store.contoWip(odp);
    if (!c.righe.length) {
      box.innerHTML = `<div class="empty-state p-7.5"><p>Nessun movimento sul conto di ${this._esc(odp)}</p></div>`;
      return;
    }
    const vano = Store.getAreaWip() || '—';
    const rendere = daRendere(c);

    const um = (n: number | null | undefined, u: string | null | undefined) =>
      (typeof n === 'number' && u) ? ` · ${formattaQuantita(n, u)} ${this._esc(u)}` : '';

    let html = `<div class="mov-preview ${c.incoerente ? 'mov-preview-err' : ''} mb-5">
      <strong class="mono">${this._esc(odp)}</strong> — vano <span class="mono">${this._esc(vano)}</span><br>
      Entrato <strong>${c.entrato} Coll.</strong> · reso <strong>${c.tornato}</strong>${c.consumato ? ` · <strong class="text-sx-success">consumato ${c.consumato}</strong>` : ''} ·
      <strong class="text-sx-warning">ancora in lavorazione ${c.residuo}</strong>
      ${c.incoerente ? '<br><strong>⚠ Da qualche riga è tornato più di quanto sia entrato: il conto non sta in piedi.</strong>' : ''}
    </div>`;

    for (const r of c.righe) {
      const fuori = r.residuo > 0;
      html += `<div class="inv-item-row">
        <div class="inv-info">
          <div class="inv-code">${this._esc(r.article_code)} <span class="font-normal text-body-small text-sx-text-secondary">lotto ${this._esc(r.lot_code)}</span></div>
          <div class="inv-lot">
            entrato ${r.entrato}${um(r.entrato_uom, r.uom)} ·
            reso ${r.tornato}${um(r.tornato_uom, r.uom)}${r.consumato ? ` · consumato ${r.consumato}${um(r.consumato_uom, r.uom)}` : ''} ·
            <strong class="${fuori ? 'text-sx-warning' : 'text-sx-success'}">resta ${r.residuo}${um(r.residuo_uom, r.uom)}</strong>
          </div>
        </div>
        <div class="inv-actions-row">
          ${fuori ? `<button class="inv-btn" title="Rendi a magazzino quello che avanza" onclick="App._wipChiediReso('${this._esc(r.item_key)}')">↩</button>` : '<span class="text-sx-success">✓</span>'}
        </div>
      </div>`;
    }

    html += `<div class="mov-divider"></div>
      <div class="flex gap-3 flex-wrap">
        <button class="btn btn-primary" ${c.residuo === 0 ? 'disabled' : ''} onclick="App._wipChiudi()">
          🏁 Chiudi il conto${c.residuo ? ` — ${c.residuo} Coll. diventano consumo` : ''}
        </button>
        ${rendere.length ? `<span class="text-label-small text-sx-text-muted pt-4">${rendere.length} rig${rendere.length === 1 ? 'a' : 'he'} da rendere, se non è stata consumata</span>` : ''}
      </div>`;
    box.innerHTML = html;
  },

  _wipChiediReso(itemKey) {
    const c = Store.contoWip(this._wipOrdine);
    const r = c.righe.find((x) => x.item_key === itemKey);
    if (!r) return this.toast('Riga non trovata sul conto', 'error');
    this.showModal(
      `↩ Rendi a magazzino — ${this._esc(r.article_code)}#${this._esc(r.lot_code)}`,
      `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        Ordine <strong class="mono">${this._esc(this._wipOrdine)}</strong> ·
        in lavorazione <strong>${r.residuo} Coll.</strong>
      </div>
      <div class="form-row mb-6">
        <div class="form-group">
          <label>Colli che tornano <span class="req">*</span></label>
          <input class="input input-mono text-center font-bold" id="wipQty" type="number" min="1" step="1" max="${r.residuo}" value="${r.residuo}">
        </div>
        <div class="form-group">
          <label>Ubicazione di rientro <span class="req">*</span></label>
          <div class="flex gap-3">
            <input class="input input-mono uppercase flex-1" id="wipDove" placeholder="Scansiona o digita" maxlength="${Validate.MAX.LOC_CODE}"
              oninput="this.value=this.value.toUpperCase();App._previewLoc('wipDove','wipDovePrev')">
            <button class="btn btn-sm" type="button" onclick="App._pickLoc('wipDove',null)" title="Sfoglia">📍</button>
          </div>
          <div id="wipDovePrev"></div>
        </div>
      </div>
      <div class="mov-preview">
        La merce esce dal vano dell'ordine e rientra a magazzino: il conto cala,
        e quello che resta è ancora in lavorazione.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App._wipRendi('${this._esc(itemKey)}')">↩ Rendi</button>`
    );
  },

  async _wipRendi(itemKey) {
    if (!this._requireOperator('il reso dal conto di produzione')) return;
    const c = Store.contoWip(this._wipOrdine);
    const r = c.righe.find((x) => x.item_key === itemKey);
    if (!r) return this.toast('Riga non trovata sul conto', 'error');
    const qty = parseInt($('wipQty')?.value, 10);
    if (!qty || qty < 1 || qty > r.residuo) {
      return this.toast(`I colli che tornano sono fra 1 e ${r.residuo}`, 'error');
    }
    const dove = Validate.clean($('wipDove')?.value, true).replace(/'/g, '-');
    if (!dove) return this.toast('Indica dove rientra la merce', 'error');
    if (!Store.locationExists(dove)) return this.toast(`Ubicazione ${dove} inesistente`, 'error');
    const stato = Store.getLocationStatus(dove);
    if (stato === 'blocked' || stato === 'disabled') {
      return this.toast(`Ubicazione ${dove} ${stato === 'blocked' ? 'BLOCCATA' : 'DISATTIVATA'}`, 'error');
    }

    const vano = Store.getAreaWip();

    /* QUALI COLLI TORNANO, non quanti. Il vano WIP è uno solo e ci convivono
       le righe di più ordini: la scelta si fa sull'elenco che QUEST'ORDINE
       ha ancora fuori, come il DDT la fa sui colli ancora liberi. Se il lotto
       non dichiara i colli l'elenco è vuoto e si torna a lavorare a numero,
       che è il comportamento di sempre. */
    const nelVano = Store.getItemsAtLocation(vano).find((x) => x.item_key === itemKey);
    const fuori = Store.colliFuoriWip(this._wipOrdine, itemKey);
    let scelte = null;
    if (nelVano && fuori.length) {
      scelte = await this._chiediColli(nelVano, `Quali colli tornano · ${r.article_code}#${r.lot_code}`, fuori);
      if (scelte === undefined) return this.toast('Reso annullato', 'info');
    }

    try {
      const tolti = await Store.esceDaWip(this._wipOrdine, {
        item_key: itemKey, article_code: r.article_code, lot_code: r.lot_code, qty,
        uom: r.uom,
      }, scelte);
      /* La merce rientra com'è uscita: gli stessi colli, e le stesse UM. Un
         reso che rientra «a numero» rinascerebbe con la confezione
         dell'anagrafica, che sul lotto non vale — la confezione del lotto
         vince sempre. */
      const res = await Store.addItem(dove, r.article_code, '', r.lot_code, '',
        `Reso da ordine ${this._wipOrdine}`,
        Math.abs(tolti._qty_delta ?? qty),
        typeof tolti._qty_uom_delta === 'number' ? Math.abs(tolti._qty_uom_delta) : null,
        tolti._packs_out ?? null);
      if (!res.ok) return this.toast('Reso non riuscito al rientro', 'error');
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    await this._logMov(MOV.MOVE, r.article_code, '', r.lot_code, vano, dove,
      '', `Reso dal conto di produzione ${this._wipOrdine}`);
    this.closeModal();
    this._formWip($('pickSubForm'));
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
    this.toast(`↩ ${qty} Coll. rientrati in ${dove}`, 'success');
  },

  /* LA CHIUSURA È IL MOMENTO IN CUI IL RESIDUO DIVENTA CONSUMO, ed è
     l'unica cosa che questa maschera fa e che non si può disfare leggendo:
     da qui in poi quei colli sono finiti nel prodotto. Per questo la
     conferma elenca riga per riga cosa si sta dichiarando consumato. */
  async _wipChiudi() {
    if (!this._requireOperator('la chiusura del conto di produzione')) return;
    const odp = this._wipOrdine;
    const c = Store.contoWip(odp);
    const k = consumoWip(c, true) || [];
    if (!k.length) return this.toast('Niente da chiudere: il conto è già a zero', 'info');

    if (!await Dialog.confirm({
      title: 'Chiudere il conto di produzione?',
      message: `Quello che è entrato e non è tornato viene dichiarato CONSUMATO dall'ordine ${odp}: esce dal vano di lavorazione e non torna più a magazzino.`,
      details: Dialog.kv(k.map((r) => [`${r.article_code}#${r.lot_code}`, `${r.residuo} Coll.${typeof r.residuo_uom === 'number' && r.uom ? ` · ${formattaQuantita(r.residuo_uom, r.uom)} ${r.uom}` : ''}`])),
      confirmLabel: 'Dichiara consumato', danger: true,
    })) return;

    const vano = Store.getAreaWip();
    const falliti = [];
    for (const r of k) {
      try {
        /* La chiusura dichiara consumato TUTTO il residuo di quella riga:
           non c'è niente da scegliere, e le UM si passano perché è il numero
           che qualcuno cercherà fra sei mesi — «quanto ne è finito dentro».
           Senza, a registro resta il conto dei colli e il peso sparisce. */
        await Store.esceDaWip(odp, {
          item_key: r.item_key, article_code: r.article_code, lot_code: r.lot_code,
          qty: r.residuo, qty_uom: r.residuo_uom, uom: r.uom,
        }, null, 'consumo');
        await this._logMov(MOV.PICK, r.article_code, '', r.lot_code, vano, null,
          '', `Consumo di produzione — ordine ${odp}`, odp, r.residuo, -r.residuo, 0);
      } catch (e) {
        falliti.push(`${r.article_code}#${r.lot_code}: ${(e as Error).message}`);
      }
    }
    this._formWip($('pickSubForm'));
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
    if (falliti.length) return this.toast(`Chiusura incompleta — ${falliti[0]}`, 'error');
    this.toast(`🏁 Conto ${odp} chiuso: ${k.length} rig${k.length === 1 ? 'a consumata' : 'he consumate'}`, 'success');
  },
} satisfies Vista;
