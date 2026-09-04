import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { Dialog } from '../dialog';
import { validaVoce, normalizzaCodice, etichettaDi } from '../../modules/parametri';
import type { Voce, ParametriArticolo } from '../../modules/parametri';
import { validaModello, colliAttesi, descriviModello } from '../../modules/imballo';
import type { ModelloImballo } from '../../modules/imballo';
import type { Icona } from '../icone';

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
  icona: Icona;
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
    { chiave: 'unita', titolo: 'Unità di misura', icona: 'scale',
      nota: 'Le cinque che il motore sa dividere sono fisse. Ciò che si aggiunge qui compare fra i suggerimenti dell\'anagrafica, ma resta «non gestita»: il motore non la divide.',
      elenco: 'getUnitaAmmesse' },
    { chiave: 'allergeni', titolo: 'Allergeni', icona: 'alert-triangle',
      nota: 'I 14 dell\'Allegato II del Reg. UE 1169/2011 sono una norma e non si tolgono. Le voci aziendali — il lattosio, che non è il latte — si aggiungono accanto.',
      elenco: 'getAllergeniAmmessi' },
    { chiave: 'conservazione', titolo: 'Modalità di conservazione', icona: 'temperature',
      nota: 'Le tre classi della logistica del freddo sono fisse. Una quarta modalità si aggiunge qui.',
      elenco: 'getClassiConservazione' },
    { chiave: 'pericoli', titolo: 'Pericolosità', icona: 'biohazard',
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
            ? `<span class="badge badge-muted" title="Valore di legge o di sistema: non si toglie">${this._ico('lock')} fisso</span>`
            : `<button class="btn btn-sm btn-danger" onclick="App.doRimuoviParam('${s.chiave}','${this._esc(v.code)}')">Togli</button>`}</td>
        </tr>`).join('')
        : `<tr><td colspan="3" class="text-sx-text-muted">Nessuna voce.</td></tr>`;
      return `
      <div class="mb-9">
        <h3 class="m-0 mb-2.5">${this._ico(s.icona)} ${this._esc(s.titolo)}</h3>
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
      ${schede}
      ${this._imballiHTML()}`;
  },

  /* ═══ 2.20 · I MODELLI DI IMBALLO ══════════════════════════════════
     Sta qui e non in una scheda sua perché è la stessa cosa delle quattro
     sopra: una tendina dell'anagrafica che è un dato. Cambia la forma —
     un modello porta due conteggi e una tara, non un codice e un'etichetta —
     e per questo si compila in una finestra invece che in una riga.

     IL MODELLO PROPONE. Il numero di colli che esce da qui è quello che la
     maschera del prodotto finito scrive nel campo prima che l'operatore lo
     guardi: se il bancale vero ne porta 37, vince il bancale. */
  _imballiHTML() {
    const modelli = Store.getModelliImballo() as ModelloImballo[];
    const righe = modelli.length ? modelli.map((m) => `
      <tr>
        <td class="mono font-bold">${this._esc(m.code)}</td>
        <td>${this._esc(m.label)}</td>
        <td>${this._esc(m.supporto || '—')}</td>
        <td class="mono td-right">${m.colli_strato} × ${m.strati} = <strong>${colliAttesi(m)}</strong></td>
        <td class="mono td-right">${m.tara_kg == null ? '—' : `${m.tara_kg} KG`}</td>
        <td class="whitespace-nowrap">
          <button class="btn btn-sm" onclick="App._imballoModifica('${this._esc(m.code)}')">${this._ico('pencil')} Modifica</button>
          <button class="btn btn-sm btn-danger" onclick="App._imballoTogli('${this._esc(m.code)}')">Togli</button>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="6" class="text-sx-text-muted">Nessun modello. Chi imballa dichiara i colli senza una proposta.</td></tr>`;

    return `
      <div class="mb-9">
        <div class="flex justify-between items-center flex-wrap gap-4">
          <h3 class="m-0">${this._ico('package')} Modelli di imballo (${modelli.length})</h3>
          <button class="btn btn-sm btn-primary" onclick="App._imballoModifica('')">+ Aggiungi modello</button>
        </div>
        <div class="text-label-small text-sx-text-muted mb-5 mt-2.5">
          Come si compone un bancale: supporto, colli per strato, strati, tara.
          L'articolo ne indica <strong>uno</strong> in anagrafica, e da lì esce la proposta
          dei colli. <strong>La tara serve al peso lordo</strong> della packing list: senza,
          il lordo non si scrive.
        </div>
        <div class="overflow-x-auto"><table class="sx-table"><thead><tr>
          <th class="w-[150px]">Codice</th><th>Nome</th><th class="w-[140px]">Supporto</th>
          <th class="w-[170px]">Colli</th><th class="w-[110px]">Tara</th><th class="w-[220px]">Azioni</th>
        </tr></thead><tbody>${righe}</tbody></table></div>
      </div>`;
  },

  _imballoModifica(code: string) {
    if (!this._requireOperator('la configurazione degli imballi')) return;
    const elenco = Store.getModelliImballo() as ModelloImballo[];
    const m = elenco.find((x) => x.code === code)
      || { code: '', label: '', supporto: '', colli_strato: 0, strati: 0 } as ModelloImballo;
    const nuovo = !m.code;

    this.showModal(
      nuovo ? `${this._ico('package')} Nuovo modello di imballo` : `${this._ico('package')} ${this._esc(m.label)}`,
      `<div class="flex gap-3 flex-wrap">
        <div class="form-group mb-6 w-[170px]">
          <label>Codice <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="imbCode" maxlength="24"
                 value="${this._esc(m.code)}" ${nuovo ? '' : 'disabled'} placeholder="EPAL85">
        </div>
        <div class="form-group mb-6 flex-1 min-w-[200px]">
          <label>Nome <span class="req">*</span></label>
          <input class="input" id="imbLabel" maxlength="60" value="${this._esc(m.label)}"
                 placeholder="EPAL 8 per strato">
        </div>
      </div>
      <div class="flex gap-3 flex-wrap">
        <div class="form-group mb-6 flex-1 min-w-[160px]">
          <label>Supporto</label>
          <input class="input" id="imbSupporto" maxlength="40" value="${this._esc(m.supporto || '')}"
                 placeholder="EPAL · mezzo bancale · cassone">
        </div>
        <div class="form-group mb-6 w-[140px]">
          <label>Colli per strato <span class="req">*</span></label>
          <input class="input" id="imbColliStrato" type="number" min="1" step="1" value="${m.colli_strato || ''}">
        </div>
        <div class="form-group mb-6 w-[140px]">
          <label>Strati <span class="req">*</span></label>
          <input class="input" id="imbStrati" type="number" min="1" step="1" value="${m.strati || ''}">
        </div>
      </div>
      <div class="flex gap-3 flex-wrap">
        <div class="form-group mb-6 w-[160px]">
          <label>Tara del supporto (KG)</label>
          <input class="input" id="imbTara" type="number" min="0" step="0.1"
                 value="${m.tara_kg == null ? '' : m.tara_kg}" placeholder="25">
        </div>
        <div class="form-group mb-6 w-[180px]">
          <label>Altezza massima (mm)</label>
          <input class="input" id="imbAltezza" type="number" min="1" step="10"
                 value="${m.altezza_max_mm == null ? '' : m.altezza_max_mm}" placeholder="1800">
        </div>
      </div>
      <div class="text-body-small text-sx-text-secondary leading-larga">
        Colli per strato e strati fanno il <strong>numero atteso</strong>, e nient'altro:
        chi imballa lo trova già scritto e lo cambia senza dover dire perché.
        <strong>Tara e altezza sono facoltative</strong> — lasciate in bianco restano
        «non lo so», che è diverso da zero.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-success" onclick="App._imballoSalva('${this._esc(m.code)}')">Salva</button>`
    );
  },

  async _imballoSalva(code: string) {
    const elenco = Store.getModelliImballo() as ModelloImballo[];
    const numero = (id: string) => {
      const v = String($(id)?.value ?? '').trim();
      return v === '' ? undefined : Number(v);
    };
    const rec: ModelloImballo = {
      code: normalizzaCodice(code || $('imbCode')?.value),
      label: String($('imbLabel')?.value ?? '').trim(),
      supporto: String($('imbSupporto')?.value ?? '').trim(),
      colli_strato: Number($('imbColliStrato')?.value),
      strati: Number($('imbStrati')?.value),
    };
    const tara = numero('imbTara');
    if (tara !== undefined) rec.tara_kg = tara;
    const altezza = numero('imbAltezza');
    if (altezza !== undefined) rec.altezza_max_mm = altezza;

    const altri = elenco.filter((x) => x.code !== rec.code);
    const errori = validaModello(rec, altri);
    if (errori.length) return this.toast(errori.join(' · '), 'error');

    const i = elenco.findIndex((x) => x.code === rec.code);
    if (i >= 0) elenco[i] = rec; else elenco.push(rec);
    try {
      await Store.saveModelliImballo(elenco);
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    this.closeModal();
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`${descriviModello(rec)}`, 'success');
  },

  async _imballoTogli(code: string) {
    if (!this._requireOperator('la configurazione degli imballi')) return;
    const elenco = Store.getModelliImballo() as ModelloImballo[];
    const m = elenco.find((x) => x.code === code);
    if (!m) return;
    /* Come le voci qui sopra: togliere il modello NON tocca gli articoli che
       lo nominano. Restano senza proposta, e chi imballa digita i colli. */
    if (!await Dialog.confirm({
      title: 'Togliere il modello di imballo?',
      message: 'Gli articoli che lo indicano NON vengono toccati: restano senza proposta, '
             + 'e chi imballa dichiara i colli a mano. I bancali già chiusi non cambiano.',
      details: Dialog.kv([['Modello', descriviModello(m)]]),
      confirmLabel: 'Togli', danger: true,
    })) return;
    await Store.saveModelliImballo(elenco.filter((x) => x.code !== code));
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`${code} tolto dalla configurazione`, 'success');
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
    this.toast(`${codeN} aggiunto`, 'success');
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
