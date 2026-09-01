import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { Dialog } from '../dialog';
import { validaVoce, normalizzaCodice, etichettaDi } from '../../modules/parametri';
import type { Voce, ParametriArticolo } from '../../modules/parametri';

/* UNA SCHEDA È UNA TENDINA DELL'ANAGRAFICA.

   `chiave` è il campo dentro `ParametriArticolo`, `elenco` è il metodo di
   `Store` che restituisce le voci **già unite** a quelle di legge. Sono due
   nomi, non due stringhe: scritti come unione, una scheda nuova con un nome
   sbagliato non compila, e prima usciva `undefined is not a function` in
   faccia all'operatore. */
type ChiaveParam = keyof ParametriArticolo;
type ElencoVoci = 'getUnitaAmmesse' | 'getAllergeniAmmessi' | 'getClassiConservazione' | 'getPericoli';

type SchedaParam = {
  chiave: ChiaveParam;
  titolo: string;
  icona: string;
  nota: string;
  elenco: ElencoVoci;
};

export const VistaParametri = {
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
    { chiave: 'allergeni', titolo: 'Allergeni', icona: '⚠️',
      nota: 'I 14 dell\'Allegato II del Reg. UE 1169/2011 sono una norma e non si tolgono. Le voci aziendali — il lattosio, che non è il latte — si aggiungono accanto.',
      elenco: 'getAllergeniAmmessi' },
    { chiave: 'conservazione', titolo: 'Modalità di conservazione', icona: '🌡',
      nota: 'Le tre classi della logistica del freddo sono fisse. Una quarta modalità si aggiunge qui.',
      elenco: 'getClassiConservazione' },
    { chiave: 'pericoli', titolo: 'Pericolosità', icona: '☣',
      nota: 'Configurabile per intero: non è una norma di etichettatura ma una politica di magazzino — dice dove una cosa non si può mettere, e quel «dove» cambia con le zone.',
      elenco: 'getPericoli' },
  ] as SchedaParam[],

  _renderConfigParams(el: HTMLElement) {
    const schede = (this._PARAM_SCHEDE as SchedaParam[]).map((s) => {
      const voci = Store[s.elenco]();
      const righe = voci.length ? voci.map((v: Voce) => `
        <tr>
          <td class="mono font-bold">${this._esc(v.code)}</td>
          <td>${this._esc(v.label)}</td>
          <td class="td-center">${v.fissa
            ? '<span class="badge badge-muted" title="Valore di legge o di sistema: non si toglie">🔒 fisso</span>'
            : `<button class="btn btn-sm btn-danger" onclick="App.doRimuoviParam('${s.chiave}','${this._esc(v.code)}')">Togli</button>`}</td>
        </tr>`).join('')
        : `<tr><td colspan="3" class="text-sx-text-muted">Nessuna voce.</td></tr>`;
      return `
      <div class="mb-9">
        <h3 class="m-0 mb-2.5">${s.icona} ${this._esc(s.titolo)}</h3>
        <div class="text-label-small text-sx-text-muted mb-5">${this._esc(s.nota)}</div>
        <table><thead><tr>
          <th class="w-[170px]">Codice</th><th>Etichetta</th><th class="w-[110px]"></th>
        </tr></thead><tbody>${righe}</tbody></table>
        <div class="form-row mt-4">
          <div class="form-group"><label>Codice nuovo</label>
            <input class="input input-mono uppercase" id="pp_${s.chiave}_code" maxlength="24" placeholder="ES_NUOVO"></div>
          <div class="form-group"><label>Etichetta</label>
            <input class="input" id="pp_${s.chiave}_label" maxlength="60" placeholder="Come la legge l'operatore"></div>
          <div class="form-group max-w-[130px]"><label>&nbsp;</label>
            <button class="btn btn-primary w-full" onclick="App.doAggiungiParam('${s.chiave}')">Aggiungi</button></div>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="mb-7 text-body-small text-sx-text-secondary">
        Le tendine dell'anagrafica articoli e della caratterizzazione delle zone si compilano da qui.
        <strong>I valori di legge si vedono e non si tolgono</strong>: sopra si aggiunge.
      </div>
      ${schede}`;
  },

  async doAggiungiParam(chiave: ChiaveParam) {
    const code = $(`pp_${chiave}_code`)?.value;
    const label = $(`pp_${chiave}_label`)?.value;
    const errori = validaVoce({ code, label });
    if (errori.length) return this.toast(errori[0], 'error');
    const attuali = Store.getArticleParams()[chiave] || [];
    const codeN = normalizzaCodice(code);
    /* Un codice che ripete un valore di legge non si aggiunge e non si
       sovrascrive: sparirebbe in silenzio dentro `unisci`, e chi l'ha
       digitato crederebbe di averlo fatto. */
    const scheda = (this._PARAM_SCHEDE as SchedaParam[]).find((s) => s.chiave === chiave)!;
    if (Store[scheda.elenco]().some((v: Voce) => v.code === codeN)) {
      return this.toast(`${codeN} c'è già`, 'error');
    }
    await Store.saveArticleParams({ [chiave]: [...attuali, { code: codeN, label: String(label).trim() }] });
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ ${codeN} aggiunto`, 'success');
  },

  async doRimuoviParam(chiave: ChiaveParam, code: string) {
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
    const attuali = (Store.getArticleParams()[chiave] || []).filter((v: Voce) => v.code !== code);
    await Store.saveArticleParams({ [chiave]: attuali });
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`${code} tolto dalla configurazione`, 'success');
  },

} satisfies Vista;
