import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import type { Mittente } from '../../types/entita';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { Tabs } from '../tabs';

/* UNA FUNZIONE DIETRO INTERRUTTORE, COME LA VEDE LA SCHEDA.

   `nome` è la chiave dell'interruttore in `Store`, `pronta` dice se si può
   accendere: una funzione scritta a metà resta elencata e spenta. */
type FunzioneOpzionale = {
  nome: string;
  ver: string;
  label: string;
  icona: string;
  cosa: string;
  cambia: string;
  pronta: boolean;
};

/* Il campo del mittente, e la sua etichetta a video. */
type CampoMittente = [chiave: keyof Mittente, etichetta: string];

export const VistaConfigurazione = {
  renderConfig() {
    const el = $('viewConfig');
    el.innerHTML = `<div class="config-container">
      <h1 class="text-title-large text-sx-primary font-bold mb-7.5">⚙ Configurazione</h1>
      <div class="config-tabs">
        <button class="config-tab ${this._configTab === 'sites' ? 'active' : ''}" onclick="App._configTab='sites';App.renderConfig()">Siti e Zone</button>
        <button class="config-tab ${this._configTab === 'articles' ? 'active' : ''}" onclick="App._configTab='articles';App.renderConfig()">Anagrafica Articoli</button>
        <button class="config-tab ${this._configTab === 'params' ? 'active' : ''}" onclick="App._configTab='params';App.renderConfig()">Parametri Articolo</button>
        <button class="config-tab ${this._configTab === 'recipients' ? 'active' : ''}" onclick="App._configTab='recipients';App.renderConfig()">Destinatari</button>
        <button class="config-tab ${this._configTab === 'operators' ? 'active' : ''}" onclick="App._configTab='operators';App.renderConfig()">Operatori</button>
        <button class="config-tab ${this._configTab === 'docs' ? 'active' : ''}" onclick="App._configTab='docs';App.renderConfig()">DDT e Documenti</button>
        <button class="config-tab ${this._configTab === 'session' ? 'active' : ''}" onclick="App._configTab='session';App.renderConfig()">Sessione</button>
        <button class="config-tab ${this._configTab === 'features' ? 'active' : ''}" onclick="App._configTab='features';App.renderConfig()">Funzioni</button>
        <button class="config-tab ${this._configTab === 'data' ? 'active' : ''}" onclick="App._configTab='data';App.renderConfig()">Dati e Backup</button>
      </div>
      <div id="configContent"></div>
    </div>`;
    const content = $('configContent');
    if (this._configTab === 'sites') this._renderConfigSites(content);
    else if (this._configTab === 'articles') this._renderConfigArticles(content);
    else if (this._configTab === 'params') this._renderConfigParams(content);
    else if (this._configTab === 'recipients') this._renderConfigRecipients(content);
    else if (this._configTab === 'operators') this._renderConfigOperators(content);
    else if (this._configTab === 'docs') this._renderConfigDocs(content);   // v3.0.0 [M4]
    else if (this._configTab === 'session') this._renderConfigSession(content);
    else if (this._configTab === 'features') this._renderConfigFeatures(content);
    else this._renderConfigData(content);
  },

  /* ═══ INTERRUTTORI DI FUNZIONE — 1.4 ═══════════════════════════════
     Le cinque funzioni della 1.4 entrano in magazzino spente e si accendono
     una alla volta. Questa scheda e' l'unico posto da cui si alzano, e ogni
     interruttore e' un gesto suo: accenderne due nello stesso turno deve
     costare due volte, se no il giorno dopo non si sa quale delle due ha
     mosso qualcosa.

     La riga «Cosa cambia» non e' cortesia: chi alza l'interruttore deve
     leggere cosa vedra' il turno dopo, prima e non dopo. */
  _FUNZIONI: [
    { nome: 'tasks', ver: '1.4.1', label: 'Schedulatore di attività', icona: '📋',
      cosa: 'Le attività che il magazzino fa già — trasferimenti, prelievi, quarantene, campionamenti — diventano richieste con una coda, una priorità e dei tempi.',
      cambia: 'Compare la voce «Attività» in barra e il riquadro delle attività aperte in Dashboard. Nessuna operazione cambia: cambia che si può chiedere prima di fare.',
      pronta: true },
    { nome: 'uom', ver: '1.4.2', label: 'Unità di misura e colli', icona: '⚖',
      cosa: 'PZ, MT, LT, KG, GR accanto ai colli. Al primo posizionamento la confezione del lotto si congela, e da lì il sistema calcola la suddivisione e quantifica il collo incompleto.',
      cambia: 'Sotto ogni riga di giacenza compare com\'è imballata — «10 × 1.000 + 1 × 100 PZ» — e nel posizionamento un campo per dichiarare il totale quando l\'ultimo collo non è pieno. Gli articoli senza quantità per collo restano a soli colli, come oggi.',
      pronta: true },
    { nome: 'colli', ver: '1.8', label: 'Colli dichiarati', icona: '📦',
      cosa: 'La suddivisione non si calcola più da una quantità per collo costante: al posizionamento si dichiara com\'è imballata la merce — «10 × 1.000 + 1 × 900» — e più colli incompleti sono ammessi. A prelievo, smaltimento e trasferimento si sceglie quali colli e quanto prenderne.',
      cambia: 'Il posizionamento chiede la suddivisione invece della sola quantità, e ogni funzione che toglie merce — smaltimento, trasferimento, prelievo, spedizione, quarantena, conta — chiede prima quali colli. Le righe già a scaffale continuano a leggersi come oggi finché non le si muove. Richiede le unità di misura accese, e l\'inventario di vano rimanda alla Conta mirata le righe a colli dichiarati.',
      pronta: true },
    { nome: 'udc', ver: '1.4.3', label: 'UDC — unità di carico', icona: '🟫',
      cosa: 'Pallet, cassoni e carrelli che si spostano interi, con l\'etichetta stampata alla creazione.',
      cambia: 'Non ancora costruita: arriva con la 1.4.3.', pronta: false },
    { nome: 'putaway', ver: '1.4.4', label: 'Motore di stoccaggio', icona: '🎯',
      cosa: 'Propone dove mettere la merce, e dice perché.',
      cambia: 'Non ancora costruita: arriva con la 1.4.4.', pronta: false },
    { nome: 'wip', ver: '1.4.5', label: 'WIP — conto di produzione', icona: '🏭',
      cosa: 'Il prelievo di produzione diventa un trasferimento verso l\'ubicazione WIP, e ciò che non torna è il consumo reale.',
      cambia: 'Non ancora costruita: arriva con la 1.4.5, e si accende a gennaio.', pronta: false },
  ],

  /* 12 ore: un turno, con il margine di chi accende a fine giornata. */
  _TURNO_MS: 12 * 3600 * 1000,

  _renderConfigFeatures(el: HTMLElement) {
    const log = Store.getFeatureLog();
    const ultimaAccensione = log.find(v => v.acceso);
    const recente = ultimaAccensione && (Date.now() - ultimaAccensione.at) < this._TURNO_MS
      ? ultimaAccensione : null;

    const righe = (this._FUNZIONI as FunzioneOpzionale[]).map((f) => {
      const on = Store.isFeatureOn(f.nome);
      const voce = log.find(v => v.nome === f.nome);
      return `<div class="config-card" style="margin-bottom:0.7rem;${on ? 'border-left:3px solid var(--sx-success)' : ''}">
        <div class="flex items-start gap-8 flex-wrap">
          <div class="text-[1.5rem] leading-[1.2]">${f.icona}</div>
          <div class="flex-1 min-w-[240px]">
            <div class="flex items-center gap-5 flex-wrap">
              <strong>${this._esc(f.label)}</strong>
              <span class="mono text-label-small text-sx-text-muted">${f.ver}</span>
              <span class="badge ${on ? 'badge-green' : 'badge-muted'} text-label-small">${on ? 'ACCESA' : 'spenta'}</span>
              ${f.pronta ? '' : '<span class="text-label-small text-sx-text-muted">non ancora costruita</span>'}
            </div>
            <div class="text-body-small text-sx-text-secondary leading-[1.6] mt-3">${this._esc(f.cosa)}</div>
            <div class="text-body-small text-sx-text-muted leading-[1.6] mt-2"><strong>Cosa cambia a video:</strong> ${this._esc(f.cambia)}</div>
            ${voce ? `<div class="text-label-small text-sx-text-muted mt-3">
              Ultimo cambio: ${voce.acceso ? 'accesa' : 'spenta'} il ${new Date(voce.at).toLocaleString('it-IT')}${voce.by ? ` da ${this._esc(voce.by)}` : ''}</div>` : ''}
          </div>
          <button class="btn btn-sm ${on ? '' : 'btn-primary'}" ${f.pronta ? '' : 'disabled'}
            onclick="App._toggleFeature('${f.nome}')">${on ? 'Spegni' : 'Accendi'}</button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="mov-preview mb-8 leading-[1.6]">
        Le funzioni della <strong>1.4</strong> sono installate ma spente: il codice è in magazzino,
        il comportamento no. Si accende <strong>una funzione alla volta, a inizio turno</strong>, e se
        qualcosa si muove nel verso sbagliato si rispegne — senza disinstallare niente e
        <strong>senza toccare il database</strong>.<br>
        Alzare un interruttore richiede il <strong>PIN di un Team Leader</strong>.
      </div>
      ${recente ? `<div class="mov-preview mov-preview-warn mb-8 leading-[1.6]">
        ⚠ <strong>${this._esc(recente.nome)}</strong> è stata accesa
        ${new Date(recente.at).toLocaleString('it-IT')}${recente.by ? ` da ${this._esc(recente.by)}` : ''}.
        Accenderne una seconda adesso significa che, se qualcosa cambia, non si saprà quale delle due.
        Meglio aspettare il turno dopo.
      </div>` : ''}
      ${righe}`;
  },

  async _toggleFeature(nome: string) {
    const f = (this._FUNZIONI as FunzioneOpzionale[]).find((x) => x.nome === nome);
    if (!f) return;
    const on = Store.isFeatureOn(nome);
    const conferma = await Dialog.confirm({
      title: on ? `Spegnere ${f.label}?` : `Accendere ${f.label}?`,
      message: on
        ? `La funzione sparisce dalle schermate al prossimo disegno. I dati già scritti restano dove sono: spegnere non cancella niente.`
        : `${f.cambia}\n\nSi accende una funzione alla volta, a inizio turno. Se qualcosa si muove nel verso sbagliato, si rispegne da qui.`,
      confirmLabel: on ? 'Spegni' : 'Accendi',
      danger: on,
    });
    if (!conferma) return;
    const leader = await this._requireLeaderAuth(`${on ? 'Spegnimento' : 'Accensione'} di «${f.label}»`);
    if (!leader) return;
    try {
      await Store.setFeature(nome, !on);
      this.toast(`${f.icona} ${f.label}: ${!on ? 'ACCESA' : 'spenta'}`, 'success');
      this._syncFeatureNav();
      this.renderConfig();
    } catch (err) {
      this.toast(`Interruttore non cambiato: ${(err as Error).message}`, 'error');
    }
  },

  /* Le voci di barra che dipendono da un interruttore. Si chiama all'avvio e
     ogni volta che un interruttore si muove: un pulsante che porta a una
     funzione spenta e' peggio di un pulsante che non c'e'. */
  _syncFeatureNav() {
    const acceso = Store.isFeatureOn('tasks');
    for (const el of document.querySelectorAll('[data-feature="tasks"]')) {
      el.classList.toggle('hidden', !acceso);
    }
    if (!acceso && this.currentView === 'tasks') this.switchView('dashboard');
  },

  /* Campi del mittente senza i quali il DDT non e' conforme. Il resto
     (REA, telefono, email, sede operativa) e' utile ma non dirimente. */
  _DOC_REQUIRED: [
    ['name',    'Ragione sociale'],
    ['address', 'Indirizzo'],
    ['city',    'Comune'],
    ['vat',     'Partita IVA']
  ],

  /* Cosa manca al mittente per poter emettere un DDT. Array vuoto = a posto.
     Usata sia dalla scheda di configurazione sia dalla stampa. */
  _docSenderGaps(sender: Mittente | null = null) {
    const s: Mittente = sender || Store.getDocConfig().sender;
    return (this._DOC_REQUIRED as CampoMittente[])
      .filter(([k]) => !String(s[k] || '').trim())
      .map(([, label]) => label);
  },

  _renderConfigDocs(el) {
    const cfg = Store.getDocConfig();
    const s = cfg.sender;
    const gaps = this._docSenderGaps(s);

    const causaliRows = cfg.causali.map((c, i) => `
      <tr>
        <td><input class="input" value="${this._esc(c.label)}" maxlength="60"
              onchange="App._docCausaleEdit(${i},'label',this.value)"></td>
        <td class="w-[190px]">
          <select class="select" onchange="App._docCausaleEdit(${i},'mov',this.value)">
            <option value="SHIP" ${c.mov !== 'RET' ? 'selected' : ''}>Spedizione (uscita)</option>
            <option value="RET"  ${c.mov === 'RET' ? 'selected' : ''}>Reso</option>
          </select>
        </td>
        <td class="w-[44px] text-center">
          <button class="btn btn-sm btn-ghost text-sx-danger"
            onclick="App._docCausaleRemove(${i})" title="Rimuovi la causale">✕</button>
        </td>
      </tr>`).join('');

    const reasonRows = cfg.disposalReasons.map((r, i) => `
      <tr>
        <td><input class="input" value="${this._esc(r.label)}" maxlength="60"
              onchange="App._docReasonEdit(${i},this.value)"></td>
        <td class="w-[44px] text-center">
          <button class="btn btn-sm btn-ghost text-sx-danger"
            onclick="App._docReasonRemove(${i})" title="Rimuovi la motivazione">✕</button>
        </td>
      </tr>`).join('');

    const fld = (id: string, label: string, value: string | number | null | undefined, opts: {
      style?: string; req?: boolean; mono?: boolean; max?: number; ph?: string;
    } = {}) => `
      <div class="form-group" style="${opts.style || ''}">
        <label>${label}${opts.req ? ' <span class="req">*</span>' : ''}</label>
        <input class="input${opts.mono ? ' input-mono' : ''}" id="${id}" value="${this._esc(value || '')}"
          maxlength="${opts.max || 80}" placeholder="${this._esc(opts.ph || '')}">
      </div>`;

    el.innerHTML = `
      ${gaps.length ? `<div class="mov-preview mov-preview-err mb-7">
        ⚠ <strong>Il mittente è incompleto</strong> — manca: ${this._esc(gaps.join(', '))}.<br>
        <span class="text-body-small">Finché questi campi restano vuoti i DDT si stampano, ma escono con l'avviso che il documento non è conforme.</span>
      </div>` : `<div class="mov-preview mov-preview-ok mb-7">
        ✓ <strong>Mittente configurato</strong> — i DDT possono essere emessi.
      </div>`}

      <!-- ══ MITTENTE ══ -->
      <div class="config-card">
        <h3 class="text-body-medium font-bold text-sx-primary mb-2">🏢 Mittente</h3>
        <p class="text-body-small text-sx-text-muted mb-6">
          In alto a sinistra su ogni documento, accanto al logo. Si scrivono una volta.
        </p>
        <div class="form-row">
          ${fld('dcName', 'Ragione sociale', s.name, { req: true, max: 120, ph: 'Es: Dietopack S.r.l.' })}
          ${fld('dcLegalForm', 'Forma / gruppo', s.legal_form, { max: 80, ph: 'Es: Naturacare Group' })}
        </div>
        <div class="form-row">
          ${fld('dcAddress', 'Indirizzo sede legale', s.address, { req: true, max: 120, ph: 'Via, numero civico' })}
          ${fld('dcZip', 'CAP', s.zip, { max: 10, mono: true, style: 'max-width:120px' })}
        </div>
        <div class="form-row">
          ${fld('dcCity', 'Comune', s.city, { req: true, max: 60 })}
          ${fld('dcProvince', 'Provincia', s.province, { max: 4, mono: true, style: 'max-width:110px', ph: 'Sigla' })}
        </div>
        <div class="form-row">
          ${fld('dcVat', 'Partita IVA', s.vat, { req: true, max: 20, mono: true })}
          ${fld('dcFiscal', 'Codice fiscale', s.fiscal_code, { max: 20, mono: true, ph: 'Se diverso dalla P. IVA' })}
        </div>
        <div class="form-row">
          ${fld('dcRea', 'N° REA', s.rea, { max: 30, mono: true })}
          ${fld('dcPhone', 'Telefono', s.phone, { max: 40 })}
        </div>
        <div class="form-row">
          ${fld('dcEmail', 'Email / PEC', s.email, { max: 80 })}
          ${fld('dcWarehouse', 'Indirizzo del magazzino', s.warehouse_address, { max: 140, ph: 'Solo se la merce parte da un indirizzo diverso dalla sede legale' })}
        </div>
        <div class="text-label-small text-sx-text-muted mt-1 mx-0 mb-6">
          💡 Il luogo di partenza compare sul DDT solo se questo campo è compilato. Lasciandolo vuoto si intende la sede legale.
        </div>
        <button class="btn btn-primary font-bold" onclick="App._docSaveSender()">✓ Salva i dati del mittente</button>
      </div>

      <!-- ══ CAUSALI ══ -->
      <div class="config-card mt-10">
        <h3 class="text-body-medium font-bold text-sx-primary mb-2">🚚 Causali di trasporto</h3>
        <p class="text-body-small text-sx-text-muted mb-6">
          La causale compare sul DDT e <strong>decide il tipo di movimento a registro</strong>: le causali marcate
          <em>Reso</em> scrivono un movimento di reso, tutte le altre una spedizione. È così che il cruscotto continua
          a distinguerli dopo l'unificazione dei due moduli.
        </p>
        <table class="sx-table w-full">
          <thead><tr><th>Descrizione</th><th>Movimento a registro</th><th></th></tr></thead>
          <tbody>${causaliRows}</tbody>
        </table>
        <div class="flex gap-4 mt-5 flex-wrap">
          <button class="btn btn-sm" onclick="App._docCausaleAdd()">+ Aggiungi causale</button>
          <button class="btn btn-sm btn-ghost" onclick="App._docResetList('causali')">↺ Ripristina l'elenco di serie</button>
        </div>
      </div>

      <!-- ══ MOTIVAZIONI SMALTIMENTO ══ -->
      <div class="config-card mt-10">
        <h3 class="text-body-medium font-bold text-sx-primary mb-2">🗑️ Motivazioni di smaltimento</h3>
        <p class="text-body-small text-sx-text-muted mb-6">
          Compaiono come pulsanti nel modulo di scarico. Una motivazione è <strong>sempre obbligatoria</strong>:
          l'operatore sceglie fra queste oppure scrive un motivo esteso.
        </p>
        <table class="sx-table w-full">
          <thead><tr><th>Motivazione</th><th></th></tr></thead>
          <tbody>${reasonRows}</tbody>
        </table>
        <div class="flex gap-4 mt-5 flex-wrap">
          <button class="btn btn-sm" onclick="App._docReasonAdd()">+ Aggiungi motivazione</button>
          <button class="btn btn-sm btn-ghost" onclick="App._docResetList('disposalReasons')">↺ Ripristina l'elenco di serie</button>
        </div>
      </div>

      <!-- ══ NUMERAZIONE ══ -->
      <div class="config-card mt-10">
        <h3 class="text-body-medium font-bold text-sx-primary mb-2">🔢 Numerazione e valori predefiniti</h3>
        <p class="text-body-small text-sx-text-muted mb-6">
          Il numero del DDT resta <strong>a compilazione libera</strong>: qui si tiene solo l'ultimo emesso, per
          proporre il successivo. Nessun contatore, nessun numero prenotato da un documento poi annullato.
        </p>
        <div class="form-row">
          ${fld('dcLastNum', 'Ultimo n° DDT emesso', cfg.ddt.last_number, { mono: true, max: 40, ph: 'Es: 2026/000123' })}
          <div class="form-group">
            <label>Prossimo proposto</label>
            <input class="input input-mono opacity-70" value="${this._esc(Store.proposeDdtNumber() || '— nessuna proposta')}" disabled>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Porto predefinito</label>
            <select class="select" id="dcPorto">
              <option value="Franco" ${cfg.ddt.default_porto === 'Franco' ? 'selected' : ''}>Franco</option>
              <option value="Assegnato" ${cfg.ddt.default_porto === 'Assegnato' ? 'selected' : ''}>Assegnato</option>
            </select>
          </div>
          <div class="form-group">
            <label>Trasporto a cura di (predefinito)</label>
            <select class="select" id="dcTrasporto">
              <option value="Mittente" ${cfg.ddt.default_trasporto === 'Mittente' ? 'selected' : ''}>Mittente</option>
              <option value="Destinatario" ${cfg.ddt.default_trasporto === 'Destinatario' ? 'selected' : ''}>Destinatario</option>
              <option value="Vettore" ${cfg.ddt.default_trasporto === 'Vettore' ? 'selected' : ''}>Vettore</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary font-bold" onclick="App._docSaveNumbering()">✓ Salva numerazione</button>
      </div>`;
  },

  async _docSaveSender() {
    const g = (id: string) => Validate.clean($(id)?.value);
    const sender = {
      name: g('dcName'), legal_form: g('dcLegalForm'),
      address: g('dcAddress'), zip: g('dcZip'), city: g('dcCity'),
      province: g('dcProvince').toUpperCase(),
      vat: g('dcVat'), fiscal_code: g('dcFiscal'), rea: g('dcRea'),
      phone: g('dcPhone'), email: g('dcEmail'),
      warehouse_address: g('dcWarehouse')
    };
    await Store.saveDocConfig({ sender });
    const gaps = this._docSenderGaps(sender);
    this.toast(gaps.length
      ? `Salvato, ma resta da compilare: ${gaps.join(', ')}`
      : '✓ Mittente salvato — i DDT sono emettibili', gaps.length ? 'info' : 'success');
    this.updateSyncIndicator();
    this.renderConfig();
  },

  async _docSaveNumbering() {
    const cfg = Store.getDocConfig();
    await Store.saveDocConfig({
      ddt: {
        ...cfg.ddt,
        last_number: Validate.clean($('dcLastNum')?.value),
        default_porto: $('dcPorto')?.value || 'Franco',
        default_trasporto: $('dcTrasporto')?.value || 'Vettore'
      }
    });
    this.toast('✓ Numerazione salvata', 'success');
    this.updateSyncIndicator();
    this.renderConfig();
  },

  async _docCausaleEdit(i, field, value) {
    const cfg = Store.getDocConfig();
    if (!cfg.causali[i]) return;
    if (field === 'label') {
      const v = Validate.clean(value);
      if (!v) return this.toast('La descrizione della causale non può essere vuota', 'error');
      cfg.causali[i].label = v;
    } else {
      cfg.causali[i].mov = value === 'RET' ? 'RET' : 'SHIP';
    }
    await Store.saveDocConfig({ causali: cfg.causali });
    this.updateSyncIndicator();
  },

  async _docCausaleAdd() {
    const cfg = Store.getDocConfig();
    cfg.causali.push({ id: `cau_${Date.now().toString(36)}`, label: 'Nuova causale', mov: 'SHIP' });
    await Store.saveDocConfig({ causali: cfg.causali });
    this.renderConfig();
  },

  async _docCausaleRemove(i: number) {
    const cfg = Store.getDocConfig();
    const c = cfg.causali[i];
    if (!c) return;
    if (cfg.causali.length <= 1) return this.toast('Deve restare almeno una causale', 'error');
    const usata = Store._cache.pendingOut.some(d => d.causale_id === c.id);
    if (!await Dialog.confirm({
      title: 'Rimuovere la causale?',
      message: usata
        ? 'Questa causale è usata da documenti già emessi. Rimuovendola quei documenti restano leggibili e conservano la descrizione che avevano al momento dell’emissione, ma la causale non sarà più selezionabile.'
        : 'La causale non sarà più selezionabile per i nuovi documenti.',
      details: Dialog.kv([['Causale', c.label], ['Movimento', c.mov === 'RET' ? 'Reso' : 'Spedizione']]),
      confirmLabel: 'Rimuovi', danger: true
    })) return;
    cfg.causali.splice(i, 1);
    await Store.saveDocConfig({ causali: cfg.causali });
    this.renderConfig();
  },

  async _docReasonEdit(i, value) {
    const cfg = Store.getDocConfig();
    if (!cfg.disposalReasons[i]) return;
    const v = Validate.clean(value);
    if (!v) return this.toast('La motivazione non può essere vuota', 'error');
    cfg.disposalReasons[i].label = v;
    await Store.saveDocConfig({ disposalReasons: cfg.disposalReasons });
    this.updateSyncIndicator();
  },

  async _docReasonAdd() {
    const cfg = Store.getDocConfig();
    cfg.disposalReasons.push({ id: `mot_${Date.now().toString(36)}`, label: 'NUOVA MOTIVAZIONE' });
    await Store.saveDocConfig({ disposalReasons: cfg.disposalReasons });
    this.renderConfig();
  },

  async _docReasonRemove(i) {
    const cfg = Store.getDocConfig();
    if (cfg.disposalReasons.length <= 1) return this.toast('Deve restare almeno una motivazione', 'error');
    cfg.disposalReasons.splice(i, 1);
    await Store.saveDocConfig({ disposalReasons: cfg.disposalReasons });
    this.renderConfig();
  },

  async _docResetList(which: 'causali' | 'disposalReasons') {
    const label = which === 'causali' ? 'le causali di trasporto' : 'le motivazioni di smaltimento';
    if (!await Dialog.confirm({
      title: 'Ripristinare l’elenco di serie?',
      message: `Le voci personalizzate vengono sostituite da quelle predefinite. I documenti già emessi non vengono toccati.`,
      confirmLabel: 'Ripristina', danger: true
    })) return;
    await Store.saveDocConfig({ [which]: Store.DOC_CONFIG_DEFAULTS[which].slice() });
    this.toast(`✓ Ripristinate ${label}`, 'success');
    this.renderConfig();
  },
} satisfies Vista;
