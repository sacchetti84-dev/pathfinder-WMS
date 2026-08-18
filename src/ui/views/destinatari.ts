import { type Vista, $, $q } from './vista';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog.js';
import {
  destinazionePredefinita, descriviDestinazione, differenze as differenzeRcp,
} from '../../modules/destinatari';

export const VistaDestinatari: Vista = {
  /* ═══ ANAGRAFICA DESTINATARI — 1.6, PIANO §9.5 ═════════════════════
     QUESTA SCHEDA NON SI COMPILA: si guarda. L'anagrafica si popola da sé
     compilando i DDT, ed è la differenza che regge la funzione — nessuno
     caricherebbe mai duecento destinatari a mano. Qui si correggono i dati
     e si tolgono i doppioni che l'uso ha prodotto. */
  _rcpFiltro: '',

  _renderConfigRecipients(el) {
    const tutti = Store.getRecipients();
    const q = String(this._rcpFiltro || '').trim();
    const righe = q ? Store.searchRecipients(q, 200) : tutti;
    const senzaPiva = tutti.filter(r => !r.vat && !r.fiscal_code).length;

    const corpo = righe.length ? righe
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'))
      .map(r => {
        const dest = (r.destinations || []).map(d =>
          `<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">
            ${d.predefinita ? '★ ' : '· '}${this._esc(d.label ? `${d.label} — ` : '')}${this._esc(descriviDestinazione(d))}</div>`).join('')
          || '<div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">nessuna destinazione</div>';
        return `<tr>
          <td><strong>${this._esc(r.name)}</strong>${dest}</td>
          <td class="mono">${this._esc(r.vat || r.fiscal_code || '')}</td>
          <td class="td-center">${(r.destinations || []).length}</td>
          <td class="td-center" style="white-space:nowrap">
            <button class="btn btn-sm" onclick="App.showEditRecipientModal('${this._esc(r.rcp_id)}')">✏</button>
            <button class="btn btn-sm btn-danger" onclick="App.confirmDeleteRecipient('${this._esc(r.rcp_id)}')">🗑</button>
          </td></tr>`;
      }).join('')
      : `<tr><td colspan="4" style="color:var(--sx-text-muted)">${tutti.length ? 'Nessun riscontro.' : 'Vuota — si riempie da sé al primo DDT.'}</td></tr>`;

    el.innerHTML = `
      <div style="margin-bottom:0.6rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary)">
        <strong>Si popola da sé compilando i DDT.</strong> Un destinatario nuovo entra al primo documento;
        un indirizzo diverso si aggiunge accanto agli altri, e la volta dopo si sceglie.
        Due DDT parlano dello stesso destinatario quando coincide la <strong>partita IVA</strong>.
      </div>
      ${senzaPiva ? `<div class="mov-preview mov-preview-warn" style="margin-bottom:0.6rem">
        ⚠ <strong>${senzaPiva}</strong> ${senzaPiva === 1 ? 'destinatario è' : 'destinatari sono'} senza partita IVA: ${senzaPiva === 1 ? 'viene riconosciuto' : 'vengono riconosciuti'} dalla ragione sociale,
        e due grafie diverse ${senzaPiva === 1 ? 'ne farebbero' : 'ne farebbero'} due record.
      </div>` : ''}
      <div class="form-group" style="margin-bottom:0.5rem;max-width:340px">
        <input class="input" placeholder="Cerca per nome o partita IVA" value="${this._esc(this._rcpFiltro)}"
          oninput="App._rcpFiltro=this.value;App._renderConfigRecipients($('configContent'))">
      </div>
      <table class="table table-sm"><thead><tr>
        <th>Destinatario e destinazioni</th><th style="width:150px">P. IVA / C.F.</th>
        <th style="width:70px" class="td-center">Dest.</th><th style="width:110px"></th>
      </tr></thead><tbody>${corpo}</tbody></table>
      <div style="margin-top:0.4rem;font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted)">
        ${tutti.length} in anagrafica · ★ è la destinazione che il DDT propone
      </div>`;
  },

  showEditRecipientModal(rcpId) {
    const r = Store.getRecipient(rcpId);
    if (!r) return;
    const dest = (r.destinations || []).map((d, i) => `
      <div style="border:1px solid var(--sx-border);border-radius:var(--radius-md);padding:0.45rem;margin-bottom:0.35rem">
        <div class="form-row" style="margin-bottom:0.3rem">
          <div class="form-group"><label>Etichetta</label>
            <input class="input" id="rcD${i}Label" value="${this._esc(d.label || '')}" maxlength="40"></div>
          <div class="form-group" style="max-width:150px"><label>&nbsp;</label>
            <label style="display:flex;align-items:center;gap:0.35rem;font-weight:400;padding-top:0.4rem">
              <input type="radio" name="rcDefault" value="${i}" ${d.predefinita ? 'checked' : ''}> Predefinita</label></div>
        </div>
        <div class="form-row" style="margin-bottom:0.3rem">
          <div class="form-group"><label>Indirizzo</label>
            <input class="input" id="rcD${i}Address" value="${this._esc(d.address || '')}" maxlength="120"></div>
          <div class="form-group" style="max-width:110px"><label>CAP</label>
            <input class="input input-mono" id="rcD${i}Zip" value="${this._esc(d.zip || '')}" maxlength="10"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Comune</label>
            <input class="input" id="rcD${i}City" value="${this._esc(d.city || '')}" maxlength="60"></div>
          <div class="form-group" style="max-width:100px"><label>Prov.</label>
            <input class="input input-mono" id="rcD${i}Province" value="${this._esc(d.province || '')}" maxlength="4"></div>
          <div class="form-group" style="max-width:110px"><label>&nbsp;</label>
            <button class="btn btn-sm btn-danger" style="width:100%" onclick="App.doRimuoviDestinazione('${this._esc(rcpId)}',${i})">Togli</button></div>
        </div>
      </div>`).join('') || '<div style="color:var(--sx-text-muted);margin-bottom:0.4rem">Nessuna destinazione: si aggiunge al primo DDT.</div>';

    this.showModal(`Destinatario — ${this._esc(r.name)}`, `
      <div class="form-row" style="margin-bottom:0.6rem">
        <div class="form-group"><label>Ragione sociale <span class="req">*</span></label>
          <input class="input" id="rcName" value="${this._esc(r.name)}" maxlength="120"></div>
        <div class="form-group"><label>Partita IVA</label>
          <input class="input input-mono" id="rcVat" value="${this._esc(r.vat || '')}" maxlength="20"></div>
        <div class="form-group"><label>Codice fiscale</label>
          <input class="input input-mono" id="rcCf" value="${this._esc(r.fiscal_code || '')}" maxlength="20"></div>
      </div>
      <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.5rem">
        La partita IVA è la chiave: cambiandola, i DDT futuri con la vecchia creeranno un secondo record.
      </div>
      <div style="font-weight:700;margin-bottom:0.35rem">Destinazioni</div>
      ${dest}
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doSaveRecipient('${this._esc(rcpId)}')">Salva</button>`);
  },

  async doSaveRecipient(rcpId) {
    const r = Store.getRecipient(rcpId);
    if (!r) return;
    const nome = Validate.clean($('rcName')?.value);
    if (!nome) return this.toast('La ragione sociale non può restare vuota', 'error');
    const scelta = $q('input[name="rcDefault"]:checked')?.value;
    const destinations = (r.destinations || []).map((d, i) => {
      const v = (c: string) => Validate.clean($(`rcD${i}${c}`)?.value);
      const out = { ...d,
        label: v('Label') || undefined, address: v('Address') || undefined,
        zip: v('Zip') || undefined, city: v('City') || undefined,
        province: v('Province') || undefined };
      /* Una sola predefinita: due stelle sarebbero due proposte, e il DDT
         ne prenderebbe una a caso. */
      if (String(i) === String(scelta)) out.predefinita = true; else delete out.predefinita;
      return out;
    });
    await Store.saveRecipient({
      ...r, name: nome,
      vat: Validate.clean($('rcVat')?.value, true) || undefined,
      fiscal_code: Validate.clean($('rcCf')?.value, true) || undefined,
      destinations,
    });
    this.closeModal();
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ ${nome} aggiornato`, 'success');
  },

  async doRimuoviDestinazione(rcpId, i) {
    const r = Store.getRecipient(rcpId);
    if (!r) return;
    const d = (r.destinations || [])[i];
    if (!d) return;
    if (!await Dialog.confirm({
      title: 'Togliere questa destinazione?',
      message: 'I DDT già registrati non vengono toccati: portano il loro indirizzo scritto dentro.',
      details: Dialog.kv([['Destinazione', descriviDestinazione(d) || '—']]),
      confirmLabel: 'Togli', danger: true,
    })) return;
    const destinations = (r.destinations || []).filter((_, j) => j !== i);
    /* Tolta la predefinita, la prima rimasta prende il suo posto: senza,
       il DDT non proporrebbe più niente e nessuno saprebbe perché. */
    if (d.predefinita && destinations.length) destinations[0] = { ...destinations[0]!, predefinita: true };
    await Store.saveRecipient({ ...r, destinations });
    this.closeModal();
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast('Destinazione tolta', 'success');
  },

  async confirmDeleteRecipient(rcpId) {
    const r = Store.getRecipient(rcpId);
    if (!r) return;
    if (!await Dialog.confirm({
      title: 'Eliminare il destinatario dall’anagrafica?',
      message: 'I DDT già registrati non vengono toccati. Al prossimo documento a questo nome, il destinatario rientra da sé.',
      details: Dialog.kv([['Destinatario', r.name], ['P. IVA', r.vat || '—']]),
      confirmLabel: 'Elimina', danger: true,
    })) return;
    await Store.deleteRecipient(rcpId);
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`${r.name} eliminato dall'anagrafica`, 'success');
  },

  /* 1.6 — «PERMANENTE O SPOT», e la domanda si fa solo quando serve.
     Tre casi e una sola domanda:
     - destinatario nuovo → entra, senza chiedere niente: non c'è nulla da
       sovrascrivere, e chiederlo sarebbe un passaggio a vuoto;
     - dati identici → non si chiede e non si scrive;
     - dati diversi da quelli in rubrica → si mostra COSA cambia e si chiede
       se vale per sempre o solo per questo documento.

     La destinazione fa storia a sé e non entra nella domanda: un indirizzo
     nuovo si aggiunge sempre accanto agli altri, perché non corregge niente
     — è un posto in più dove quel cliente riceve. */
  async _aggiornaRubrica() {
    const dati = {
      name: this._shipCustomer,
      vat: this._shipDestVat,
      address: this._shipDestAddress,
      zip: this._shipDestZip,
      city: this._shipDestCity,
      province: this._shipDestProvince,
    };
    if (!String(dati.name || '').trim()) return;
    try {
      const esistente = Store.findRecipient(dati);
      let permanente = false;
      if (esistente) {
        const diff = differenzeRcp(esistente, dati, destinazionePredefinita(esistente));
        /* Le sole differenze di INDIRIZZO non aprono la domanda: quelle
           diventano una destinazione in più, e nessuno deve decidere niente. */
        const anagrafiche = diff.filter(d => ['name', 'vat', 'fiscal_code'].includes(d.campo));
        if (anagrafiche.length) {
          permanente = await Dialog.confirm({
            title: 'I dati del destinatario sono cambiati',
            message: 'Vale da adesso in poi, o solo per questo documento?\n\nIl DDT appena registrato porta comunque i valori che hai scritto: la scelta riguarda l\'anagrafica.',
            details: Dialog.kv(anagrafiche.map(d => [d.etichetta, `${d.prima || '—'} → ${d.dopo}`])),
            confirmLabel: 'Modifica permanente',
            cancelLabel: 'Solo per questo DDT',
          });
        }
      }
      const esito = await Store.upsertRecipient(dati, { permanente });
      if (!esito) return;
      if (esito.creato) this.toast(`📇 ${esito.record.name} aggiunto all'anagrafica destinatari`, 'info');
      else if (esito.destinazioneNuova) this.toast(`📇 Nuova destinazione salvata per ${esito.record.name}`, 'info');
      else if (permanente) this.toast(`📇 Anagrafica di ${esito.record.name} aggiornata`, 'info');
    } catch (err: any) {
      /* La rubrica non deve mai far sembrare fallito un DDT che è passato. */
      this.toast(`DDT registrato. L'anagrafica destinatari non si è aggiornata: ${err.message || err}`, 'warning');
    }
  },
};
