import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { Dialog } from '../dialog.js';
import { validaVoce, normalizzaCodice, etichettaDi } from '../../modules/parametri';

export const VistaParametri: Vista = {
  /* ═══ PARAMETRI ARTICOLO — 1.6, PIANO §9.3 ═════════════════════════
     Fino alla 1.5 le tendine dell'anagrafica erano tutte nel sorgente:
     aggiungere una voce voleva dire un rilascio. Da qui in poi sono un dato.

     LA REGOLA STA IN `modules/parametri.ts` E NON QUI: i valori di legge —
     i 14 allergeni del Reg. UE 1169/2011, le tre classi del freddo, le
     cinque unità che il motore sa dividere — si vedono e NON si tolgono.
     Sopra si aggiunge. Il lucchetto che si vede su quelle righe è la resa
     di `Voce.fissa`, non una regola scritta due volte — D18. */
  _PARAM_SCHEDE: [
    { chiave: 'unita', titolo: 'Unità di misura', icona: '⚖',
      nota: 'Le cinque che il motore sa dividere sono fisse. Ciò che si aggiunge qui compare fra i suggerimenti dell\'anagrafica, ma resta «non gestita»: il motore non la divide.',
      elenco: 'getUnitaAmmesse' },
    { chiave: 'allergeni', titolo: 'Allergeni', icona: '⚠',
      nota: 'I 14 dell\'Allegato II del Reg. UE 1169/2011 sono una norma e non si tolgono. Le voci aziendali — il lattosio, che non è il latte — si aggiungono accanto.',
      elenco: 'getAllergeniAmmessi' },
    { chiave: 'conservazione', titolo: 'Modalità di conservazione', icona: '🌡',
      nota: 'Le tre classi della logistica del freddo sono fisse. Una quarta modalità si aggiunge qui.',
      elenco: 'getClassiConservazione' },
    { chiave: 'pericoli', titolo: 'Pericolosità', icona: '☣',
      nota: 'Configurabile per intero: non è una norma di etichettatura ma una politica di magazzino — dice dove una cosa non si può mettere, e quel «dove» cambia con le zone.',
      elenco: 'getPericoli' },
  ],

  _renderConfigParams(el) {
    const schede = this._PARAM_SCHEDE.map((s: any) => {
      const voci = (Store as any)[s.elenco]();
      const righe = voci.length ? voci.map((v: any) => `
        <tr>
          <td class="mono" style="font-weight:700">${this._esc(v.code)}</td>
          <td>${this._esc(v.label)}</td>
          <td class="td-center">${v.fissa
            ? '<span class="badge badge-muted" title="Valore di legge o di sistema: non si toglie">🔒 fisso</span>'
            : `<button class="btn btn-sm btn-danger" onclick="App.doRimuoviParam('${s.chiave}','${this._esc(v.code)}')">Togli</button>`}</td>
        </tr>`).join('')
        : `<tr><td colspan="3" style="color:var(--sx-text-muted)">Nessuna voce.</td></tr>`;
      return `
      <div class="cfg-card" style="margin-bottom:0.9rem">
        <h3 style="margin:0 0 0.25rem">${s.icona} ${this._esc(s.titolo)}</h3>
        <div style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-bottom:0.5rem">${this._esc(s.nota)}</div>
        <table class="table table-sm"><thead><tr>
          <th style="width:170px">Codice</th><th>Etichetta</th><th style="width:110px"></th>
        </tr></thead><tbody>${righe}</tbody></table>
        <div class="form-row" style="margin-top:0.4rem">
          <div class="form-group"><label>Codice nuovo</label>
            <input class="input input-mono" id="pp_${s.chiave}_code" maxlength="24" style="text-transform:uppercase" placeholder="ES_NUOVO"></div>
          <div class="form-group"><label>Etichetta</label>
            <input class="input" id="pp_${s.chiave}_label" maxlength="60" placeholder="Come la legge l'operatore"></div>
          <div class="form-group" style="max-width:130px"><label>&nbsp;</label>
            <button class="btn btn-primary" style="width:100%" onclick="App.doAggiungiParam('${s.chiave}')">Aggiungi</button></div>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="margin-bottom:0.7rem;font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-secondary)">
        Le tendine dell'anagrafica articoli e della caratterizzazione delle zone si compilano da qui.
        <strong>I valori di legge si vedono e non si tolgono</strong>: sopra si aggiunge.
      </div>
      ${schede}`;
  },

  async doAggiungiParam(chiave) {
    const code = $(`pp_${chiave}_code`)?.value;
    const label = $(`pp_${chiave}_label`)?.value;
    const errori = validaVoce({ code, label });
    if (errori.length) return this.toast(errori[0], 'error');
    const attuali = (Store.getArticleParams() as any)[chiave] || [];
    const codeN = normalizzaCodice(code);
    /* Un codice che ripete un valore di legge non si aggiunge e non si
       sovrascrive: sparirebbe in silenzio dentro `unisci`, e chi l'ha
       digitato crederebbe di averlo fatto. */
    if ((Store as any)[this._PARAM_SCHEDE.find((s: any) => s.chiave === chiave).elenco]().some((v: any) => v.code === codeN)) {
      return this.toast(`${codeN} c'è già`, 'error');
    }
    await Store.saveArticleParams({ [chiave]: [...attuali, { code: codeN, label: String(label).trim() }] });
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ ${codeN} aggiunto`, 'success');
  },

  async doRimuoviParam(chiave, code) {
    /* Togliere una voce NON tocca gli articoli che la portano: resterebbe
       un codice senza etichetta in tendina, che `etichettaDi` mostra com'è.
       È voluto — cancellare un attributo da 11.180 articoli perché qualcuno
       ha ripulito una lista è un danno che non si disfa. */
    if (!await Dialog.confirm({
      title: 'Togliere la voce dalla configurazione?',
      message: 'Gli articoli e le zone che la portano NON vengono toccati: il codice resta scritto su di loro e si continua a leggere.',
      details: Dialog.kv([['Voce', code]]),
      confirmLabel: 'Togli', danger: true,
    })) return;
    const attuali = ((Store.getArticleParams() as any)[chiave] || []).filter((v: any) => v.code !== code);
    await Store.saveArticleParams({ [chiave]: attuali });
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`${code} tolto dalla configurazione`, 'success');
  },

};
