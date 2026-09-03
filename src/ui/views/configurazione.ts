import { type Vista, $, $sel } from './vista';
import { Store } from '../../core/store';
import type { Mittente } from '../../types/entita';
import { Validate } from '../../modules/validate';
import { PRIORITA_MIN, PRIORITA_MAX, PRIORITA_PREDEFINITA } from '../../modules/stoccaggio';
import { Dialog } from '../dialog';
import { Tabs } from '../tabs';
import {
  CAMPI_ETICHETTA, DPI_AMMESSI, PORTE_AMMESSE, LAYOUT_DI_SERIE, LAYOUT_PF_DI_SERIE,
  stampanteDiSerie, validaStampante, nuovoIdStampante, disponi as disponiEtichetta,
  campiDi as campiEtichettaDi,
} from '../../modules/stampanti';
import type {
  Stampante, RigaEtichetta, Allineamento, GenereEtichetta,
} from '../../modules/stampanti';

/* Il campo del mittente, e la sua etichetta a video. */
type CampoMittente = [chiave: keyof Mittente, etichetta: string];

export const VistaConfigurazione = {
  /* 2.1 — LA CONFIGURAZIONE È DELL'ADMIN, E IL VARCO STA QUI.

     Non in `switchView`: quando l'applicativo si avvia su un database
     vuoto porta l'utente in Configurazione PRIMA di chiedere chi è, e un
     varco lì sopra sbatterebbe fuori una persona che non ha ancora avuto
     modo di dire il proprio nome. Qui invece la scheda si disegna sempre,
     e quando chi guarda non ha le chiavi al posto delle nove schede trova
     scritto perché — che è l'unica cosa utile da leggere.

     Chi decide è `Store.comandaLaConfigurazione`, che tiene anche
     l'eccezione del primo giorno: finché nessun Admin esiste, comandano i
     Team Leader. */
  renderConfig() {
    const el = $('viewConfig');
    const io = this.currentOperatorRecord;
    const comanda = Store.comandaLaConfigurazione(io);

    /* 2.13 — IL TEAM LEADER ENTRA DA UNA PORTA SOLA, e dentro c'è una
       stanza sola. I PIN li rinnova lui: l'elenco degli operatori deve
       poterlo vedere, o il mestiere per cui la carica esiste non si fa.
       Tutto il resto — siti, articoli, regole, backup, reset — resta
       dell'Admin, e qui non compare nemmeno come scheda spenta: una
       linguetta che c'è e non si apre è una domanda in più a ogni turno. */
    if (!comanda && Store.vedeGliOperatori(io)) {
      el.innerHTML = `<div class="config-container">
        <h1 class="text-title-large text-sx-primary font-bold mb-7.5">⚙️ Configurazione</h1>
        <div id="configContent"></div>
      </div>`;
      this._renderConfigOperators($('configContent'));
      return;
    }

    if (!comanda) {
      el.innerHTML = `<div class="config-container">
        <h1 class="text-title-large text-sx-primary font-bold mb-7.5">⚙️ Configurazione</h1>
        <div class="config-card">
          <h3>🛡 Riservata all'Admin</h3>
          <p class="text-body-small text-sx-text-secondary leading-[1.6] mt-4">
            Le schede di configurazione e il reset dei dati sono aperti al solo ruolo <strong>Admin</strong>.
            ${io
              ? `Sei collegato come <span class="mono">${this._esc(io.initials)}</span> — ${io.role === 'leader' ? 'Team Leader' : 'Operatore'}.`
              : 'Nessun operatore identificato in questa sessione.'}
            Chiedi a un Admin di aprirla, oppure di assegnarti la carica da Configurazione → Operatori.
          </p>
        </div>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="config-container">
      <h1 class="text-title-large text-sx-primary font-bold mb-7.5">⚙️ Configurazione</h1>
      <div class="config-tabs">
        <button class="config-tab ${this._configTab === 'sites' ? 'active' : ''}" onclick="App._configTab='sites';App.renderConfig()">Siti e Zone</button>
        <button class="config-tab ${this._configTab === 'articles' ? 'active' : ''}" onclick="App._configTab='articles';App.renderConfig()">Anagrafica Articoli</button>
        <button class="config-tab ${this._configTab === 'params' ? 'active' : ''}" onclick="App._configTab='params';App.renderConfig()">Parametri Articolo</button>
        <button class="config-tab ${this._configTab === 'recipients' ? 'active' : ''}" onclick="App._configTab='recipients';App.renderConfig()">Destinatari</button>
        <button class="config-tab ${this._configTab === 'operators' ? 'active' : ''}" onclick="App._configTab='operators';App.renderConfig()">Operatori</button>
        <button class="config-tab ${this._configTab === 'docs' ? 'active' : ''}" onclick="App._configTab='docs';App.renderConfig()">DDT e Documenti</button>
        <button class="config-tab ${this._configTab === 'session' ? 'active' : ''}" onclick="App._configTab='session';App.renderConfig()">Sessione</button>
        <button class="config-tab ${this._configTab === 'features' ? 'active' : ''}" onclick="App._configTab='features';App.renderConfig()">Produzione ed etichette</button>
        <button class="config-tab ${this._configTab === 'printers' ? 'active' : ''}" onclick="App._configTab='printers';App.renderConfig()">Stampanti</button>
        <button class="config-tab ${this._configTab === 'rules' ? 'active' : ''}" onclick="App._configTab='rules';App.renderConfig()">Regole di stoccaggio</button>
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
    else if (this._configTab === 'rules') this._renderConfigRules(content);
    else if (this._configTab === 'docs') this._renderConfigDocs(content);   // v3.0.0 [M4]
    else if (this._configTab === 'session') this._renderConfigSession(content);
    else if (this._configTab === 'features') this._renderConfigFeatures(content);
    else if (this._configTab === 'printers') this._renderConfigStampanti(content);
    else this._renderConfigData(content);
  },

  /* ═══ PRODUZIONE ED ETICHETTE ══════════════════════════════════════
     2.0 — QUI STAVANO GLI INTERRUTTORI, e non ci sono piu': dalla 1.4 ogni
     funzione entrava spenta e si accendeva un turno per volta, ma al
     19/08/2026 erano accese tutte e sei e nessuno le abbassava. Restano i
     due parametri che quella scheda ospitava, e che parametri sono sempre
     stati: dove va la merce in lavorazione, e che forma hanno i codici
     sulle etichette. */
  _renderConfigFeatures(el: HTMLElement) {
    el.innerHTML = `
      <div class="mov-preview mb-8 leading-[1.6]">
        Due impostazioni, e nessuna delle due si cambia a cuor leggero:
        l'<strong>area WIP</strong> è il vano dove la produzione tiene quello
        che sta lavorando, e il <strong>prefisso GS1</strong> decide se le
        etichette portano un codice interno o un SSCC vero — e vale solo per
        le etichette nuove, perché una già stampata non si riscrive.
      </div>
      ${this._areaWipHTML()}
      ${this._prefissoGS1HTML()}`;
  },

  /* ═══ 2.19 · LE STAMPANTI ZEBRA IN RETE ════════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l.

     Due cose in una scheda, e stanno insieme perché non si configurano una
     senza l'altra: CHI stampa — indirizzo, porta, testina, supporto — e COSA
     c'è sull'etichetta della merce.

     LE MISURE DEL SUPPORTO STANNO SULLA STAMPANTE, NON SUL LAYOUT. Il rotolo
     montato è una proprietà della macchina: due stampanti con la stessa
     disposizione di campi possono avere etichette di formato diverso, e
     legare la misura al layout vorrebbe dire un layout per rotolo.

     L'ETICHETTA DELL'UNITÀ DI CARICO NON SI CONFIGURA, ed è una decisione di
     §8 e non una funzione mancante — il perché sta scritto nella scheda. */
  _renderConfigStampanti(el: HTMLElement) {
    const stampanti = Store.getStampanti() as Stampante[];
    const servito = Store.eServito();
    el.innerHTML = `
      <div class="mov-preview mb-8 leading-[1.6]">
        Le <strong>Zebra in rete</strong> stampano le etichette della merce e delle unità di
        carico. A parlarci è il <strong>servizio</strong>, non il browser: un browser non apre
        un socket TCP, e la porta 9100 di una Zebra vuole esattamente quello.
        <br><strong>La stampa su A4 resta</strong>: se una stampante è spenta o il rotolo è
        finito, l'etichetta esce sul foglio come è sempre uscita.
      </div>
      ${!servito ? `<div class="mov-preview mov-preview-warn mb-8 leading-[1.6]">
        <strong>Questa macchina lavora da file.</strong> Le stampanti si configurano lo stesso
        e il dato si conserva, ma finché non c'è un servizio nessuno può parlare alla stampante.
      </div>` : ''}
      ${this._stampantiElencoHTML(stampanti)}
      ${this._layoutEtichettaHTML(stampanti, 'merce')}
      ${this._layoutEtichettaHTML(stampanti, 'bancale')}
      <div class="config-card mt-8">
        <strong>🏷 L'etichetta dell'unità di carico non ha un layout</strong>
        <div class="text-body-small text-sx-text-secondary leading-[1.6] mt-3">
          E non è una funzione mancante. Un pallet porta N righe di N articoli diversi:
          descrizione, scadenza e peso non sono nemmeno <em>definiti</em> per un'unità di carico,
          e la prima volta che qualcuno ci carica sopra una seconda partita quel che c'è scritto
          diventa falso — incollato al legno, e letto da chi passa.
          <strong>L'unico dato che non invecchia è il numero</strong>, che non si riusa mai:
          tutto il resto lo dice il sistema, che lo sa adesso e non alla stampa.
          Quel che si configura è il <strong>supporto</strong> — misure e testina — che sta sulla stampante.
        </div>
      </div>`;
  },

  _stampantiElencoHTML(stampanti: Stampante[]) {
    const righe = stampanti.map((s) => `<tr class="${s.attiva === false ? 'opacity-60' : ''}">
      <td><strong>${this._esc(s.nome)}</strong>${s.attiva === false ? ' <span class="badge badge-muted">disattivata</span>' : ''}</td>
      <td class="mono">${this._esc(s.host)}:${s.porta}</td>
      <td class="whitespace-nowrap">${s.dpi} dpi · ${s.larghezza_mm}×${s.altezza_mm} mm</td>
      <td class="mono">${this._esc(s.site_id || '—')}</td>
      <td class="whitespace-nowrap">
        <button class="btn btn-sm" onclick="App._stampanteModifica('${this._esc(s.printer_id)}')">✏️ Modifica</button>
        <button class="btn btn-sm btn-accent" onclick="App._provaStampante('${this._esc(s.printer_id)}')">🏷 Prova</button>
        <button class="btn btn-sm btn-danger" onclick="App._stampanteTogli('${this._esc(s.printer_id)}')">Togli</button>
      </td>
    </tr>`).join('');

    return `<div class="config-card">
      <div class="flex justify-between items-center flex-wrap gap-4">
        <strong>Stampanti configurate (${stampanti.length})</strong>
        <button class="btn btn-sm btn-primary" onclick="App._stampanteModifica('')">+ Aggiungi stampante</button>
      </div>
      <div class="text-body-small text-sx-text-secondary leading-[1.6] mt-3">
        Il <strong>sito</strong> è facoltativo e serve a una cosa sola: proporre la stampante
        giusta. Quella di MAG1 è quella vicina a MAG1, e mandare un'etichetta di MAG1 sulla
        stampante di MAG2 vuol dire un operatore che attraversa il magazzino per raccogliere
        un pezzo di carta.
      </div>
      ${stampanti.length
        ? `<div class="overflow-x-auto mt-6"><table class="sx-table">
            <thead><tr><th>Nome</th><th>Indirizzo</th><th>Testina e supporto</th><th>Sito</th><th class="w-[280px]">Azioni</th></tr></thead>
            <tbody>${righe}</tbody></table></div>`
        : `<div class="text-body-small text-sx-text-muted mt-6">
            Nessuna stampante. Finché non ce n'è una, le etichette escono su A4 dal browser.
          </div>`}
    </div>`;
  },

  _stampanteModifica(printerId: string) {
    if (!this._requireOperator('la configurazione delle stampanti')) return;
    const elenco = Store.getStampanti() as Stampante[];
    const s = elenco.find((x) => x.printer_id === printerId) || stampanteDiSerie();
    const nuova = !s.printer_id;

    this.showModal(
      nuova ? '🖨 Nuova stampante Zebra' : `🖨 ${this._esc(s.nome)}`,
      `<div class="form-group mb-6">
        <label>Nome <span class="req">*</span></label>
        <input class="input" id="stpNome" maxlength="60" value="${this._esc(s.nome)}"
               placeholder="Es: Zebra ZT411 — Spedizioni">
        <div class="text-label-small text-sx-text-muted mt-2">È quello che l'operatore sceglie in corsia: che dica dov'è.</div>
      </div>
      <div class="flex gap-3 flex-wrap">
        <div class="form-group mb-6 flex-1 min-w-[200px]">
          <label>Indirizzo IP o nome di rete <span class="req">*</span></label>
          <input class="input input-mono" id="stpHost" maxlength="100" value="${this._esc(s.host)}"
                 placeholder="10.0.1.50">
        </div>
        <div class="form-group mb-6 w-[130px]">
          <label>Porta</label>
          <select class="input select" id="stpPorta">
            ${PORTE_AMMESSE.map((p) => `<option value="${p}" ${s.porta === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="mov-preview mb-6 text-body-small leading-[1.6]">
        L'indirizzo dev'essere sulla <strong>rete interna</strong> — 10.x, 172.16-31.x, 192.168.x —
        e la porta una <strong>porta di stampa Zebra</strong>. Il servizio rifiuta il resto:
        senza quei due cancelli, questa scheda diventa il modo di far parlare il servizio
        con qualunque macchina raggiungibile.
      </div>
      <div class="flex gap-3 flex-wrap">
        <div class="form-group mb-6 w-[150px]">
          <label>Testina</label>
          <select class="input select" id="stpDpi">
            ${DPI_AMMESSI.map((d) => `<option value="${d}" ${s.dpi === d ? 'selected' : ''}>${d} dpi</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-6 w-[150px]">
          <label>Etichetta — larghezza</label>
          <input class="input" id="stpLarghezza" type="number" step="0.5" min="10" max="300" value="${s.larghezza_mm}">
        </div>
        <div class="form-group mb-6 w-[150px]">
          <label>Etichetta — altezza</label>
          <input class="input" id="stpAltezza" type="number" step="0.5" min="10" max="300" value="${s.altezza_mm}">
        </div>
        <div class="form-group mb-6 w-[150px]">
          <label>Sito servito</label>
          <input class="input input-mono uppercase" id="stpSito" maxlength="4" value="${this._esc(s.site_id)}" placeholder="MAG1">
        </div>
      </div>
      <div class="text-body-small text-sx-text-secondary leading-[1.6] mb-6">
        Le misure sono quelle del <strong>rotolo montato</strong>, in millimetri. Non si mandano
        alla stampante il tipo di supporto, il calore e lo spellicolatore: sono la configurazione
        della macchina, si fanno una volta col pannello e valgono per tutti.
      </div>
      <div class="form-group mb-0">
        <label class="flex items-center gap-3">
          <input type="checkbox" id="stpAttiva" ${s.attiva !== false ? 'checked' : ''}>
          Attiva — compare nell'elenco di chi stampa
        </label>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-success" onclick="App._stampanteSalva('${this._esc(s.printer_id)}')">Salva</button>`
    );
  },

  async _stampanteSalva(printerId: string) {
    const elenco = Store.getStampanti() as Stampante[];
    const rec: Stampante = {
      printer_id: printerId || nuovoIdStampante(elenco),
      nome: String($('stpNome')?.value ?? '').trim(),
      host: String($('stpHost')?.value ?? '').trim(),
      porta: Number($sel('stpPorta')?.value),
      dpi: Number($sel('stpDpi')?.value) as Stampante['dpi'],
      larghezza_mm: Number($('stpLarghezza')?.value),
      altezza_mm: Number($('stpAltezza')?.value),
      site_id: String($('stpSito')?.value ?? '').trim().toUpperCase(),
      attiva: Boolean(($('stpAttiva') as unknown as HTMLInputElement)?.checked),
    };
    const errori = validaStampante(rec, elenco);
    if (errori.length) return this.toast(errori.join(' · '), 'error');

    /* IL LAYOUT DEVE STARE SUL SUPPORTO DI QUESTA STAMPANTE, e si dice
       adesso: scoprirlo al primo pallet vuol dire un operatore fermo davanti
       a un rifiuto che non sa risolvere. Non blocca — il rotolo può essere
       destinato alle sole unità di carico, che un layout non ce l'hanno — ma
       non lo si tace. */
    const posa = disponiEtichetta(Store.getLayoutEtichetta(), rec.altezza_mm);

    const i = elenco.findIndex((x) => x.printer_id === rec.printer_id);
    if (i >= 0) elenco[i] = rec; else elenco.push(rec);

    try {
      await Store.saveStampanti(elenco);
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    this.closeModal();
    this.renderConfig();
    this.toast(`🖨 ${rec.nome} — ${rec.host}:${rec.porta}`, 'success');
    if (!posa.ci_sta) {
      this.toast(
        `⚠️ Il layout dell'etichetta merce occupa ${posa.usato_mm} mm e questo supporto è alto ${rec.altezza_mm}: su questa stampante la merce non si stampa finché non si spegne un campo`,
        'warning');
    }
  },

  async _stampanteTogli(printerId: string) {
    if (!this._requireOperator('la configurazione delle stampanti')) return;
    const elenco = Store.getStampanti() as Stampante[];
    const s = elenco.find((x) => x.printer_id === printerId);
    if (!s) return;
    if (!await Dialog.confirm({
      title: 'Togliere la stampante?',
      message: 'Sparisce dall’elenco di chi stampa. Le etichette già uscite non cambiano, '
             + 'e chi l’aveva scelta su un terminale si ritrova la proposta di serie.',
      details: Dialog.kv([['Nome', s.nome], ['Indirizzo', `${s.host}:${s.porta}`]]),
      confirmLabel: 'Togli', danger: true,
    })) return;
    await Store.saveStampanti(elenco.filter((x) => x.printer_id !== printerId));
    this.renderConfig();
    this.toast(`${s.nome} tolta`, 'success');
  },

  /* ── LA DISPOSIZIONE DELL'ETICHETTA MERCE ───────────────────────────────

     I campi si impilano dall'alto nell'ordine in cui stanno qui. Di ognuno si
     decide se c'è, quanto è alto in millimetri, come si allinea e su quante
     righe può andare a capo.

     I MILLIMETRI SI VEDONO MENTRE SI SCEGLIE. Il totale sta in fondo,
     confrontato con l'altezza del supporto: un layout più alto del rotolo il
     servizio lo RIFIUTA — non lo tronca — perché un'etichetta troncata esce
     con l'aria di essere giusta e le manca l'ultima riga, che è il peso.
     Scoprirlo qui costa un secondo; scoprirlo in corsia costa un turno. */
  /* 2.20 — LA SCHEDA E' UNA SOLA PER DUE ETICHETTE, e il genere e' un
     parametro: merce e bancale hanno campi diversi ma la stessa meccanica —
     accendi, alza, allinea, e in fondo i millimetri confrontati col
     supporto. Due copie di questa tabella divergerebbero alla prima
     modifica. Gli identificativi cambiano col prefisso, o le due schede
     sulla stessa pagina si leggerebbero a vicenda. */
  _layoutEtichettaHTML(stampanti: Stampante[], genere: GenereEtichetta = 'merce') {
    const bancale = genere === 'bancale';
    const pre = bancale ? 'layPf' : 'lay';
    const layout = bancale ? Store.getLayoutEtichettaPf() : Store.getLayoutEtichetta();
    const campi = campiEtichettaDi(genere);
    const rif = stampanti.find((s) => s.attiva !== false) || null;
    const altezza = rif?.altezza_mm ?? 60;
    const posa = disponiEtichetta(layout, altezza, genere);
    const perCampo = new Map(layout.righe.map((r: RigaEtichetta) => [r.campo, r]));

    const righe = campi.map((c) => {
      const r = perCampo.get(c.campo) || { attivo: false, altezza_mm: 4, allineamento: 'L', righe_testo: 1 };
      return `<tr class="${r.attivo ? '' : 'opacity-60'}">
        <td><label class="flex items-center gap-3">
          <input type="checkbox" id="${pre}_${c.campo}_on" ${r.attivo ? 'checked' : ''}>
          <strong>${this._esc(c.nome)}</strong>${c.invecchia ? ' ⚠️' : ''}
        </label>
        <div class="text-label-small text-sx-text-muted mt-1">${c.nota}</div></td>
        <td><input class="input" id="${pre}_${c.campo}_h" type="number" step="0.1" min="1" max="60"
                   value="${r.altezza_mm}" style="width:80px"></td>
        <td><select class="input select" id="${pre}_${c.campo}_a" style="width:110px" ${c.barre ? 'disabled' : ''}>
          ${([['L', 'Sinistra'], ['C', 'Centro'], ['R', 'Destra']] as [Allineamento, string][])
            .map(([v, n]) => `<option value="${v}" ${r.allineamento === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select></td>
        <td><input class="input" id="${pre}_${c.campo}_r" type="number" min="1" max="4"
                   value="${r.righe_testo}" style="width:70px" ${c.barre ? 'disabled' : ''}></td>
      </tr>`;
    }).join('');

    return `<div class="config-card mt-8">
      <strong>Layout dell'etichetta ${bancale ? 'del bancale di prodotto finito' : 'della merce'}</strong>
      <div class="text-body-small text-sx-text-secondary leading-[1.6] mt-3">
        I campi si impilano <strong>dall'alto, in quest'ordine</strong>. L'altezza è quella del
        carattere in millimetri; sotto le barre la testina scrive da sé il codice in chiaro —
        non è un dato in più, è la rappresentazione leggibile che lo standard chiede, e lascia
        un numero da digitare quando il lettore non legge.
      </div>
      <div class="overflow-x-auto mt-6"><table class="sx-table">
        <thead><tr><th>Campo</th><th class="w-[110px]">Altezza mm</th><th class="w-[140px]">Allineamento</th><th class="w-[100px]">Righe</th></tr></thead>
        <tbody>${righe}</tbody></table></div>
      <div class="mov-preview ${posa.ci_sta ? '' : 'mov-preview-err'} mt-6 leading-[1.6]">
        Occupa <strong>${posa.usato_mm} mm</strong>
        ${rif
          ? `su un supporto di <strong>${altezza} mm</strong> — «${this._esc(rif.nome)}».`
          : `. Nessuna stampante configurata: il confronto è su <strong>${altezza} mm</strong>, la misura di serie.`}
        ${posa.ci_sta
          ? ' Ci sta.'
          : ' <strong>Non ci sta</strong>: su quel supporto il servizio rifiuta la stampa invece di troncare l\'etichetta. Si spegne un campo o se ne riduce l\'altezza.'}
        <br><span class="text-label-small text-sx-text-muted">
          Nel conto ci sono i ${(3 * 2)} mm di margine, l'interlinea fra le righe, e i 3,5 mm
          della riga in chiaro sotto le barre — che la testina aggiunge e il layout non chiede.
        </span>
      </div>
      <div class="flex gap-3 mt-6 flex-wrap">
        <button class="btn btn-sm btn-primary" onclick="App._layoutEtichettaSalva('${genere}')">Salva il layout</button>
        <button class="btn btn-sm" onclick="App._layoutEtichettaDiSerie('${genere}')">Torna a quello di serie</button>
      </div>
    </div>`;
  },

  _layoutEtichettaLetto(genere: GenereEtichetta = 'merce'): { righe: RigaEtichetta[] } {
    const pre = genere === 'bancale' ? 'layPf' : 'lay';
    return {
      righe: campiEtichettaDi(genere).map((c) => ({
        campo: c.campo,
        attivo: Boolean(($(`${pre}_${c.campo}_on`) as unknown as HTMLInputElement)?.checked),
        altezza_mm: Number($(`${pre}_${c.campo}_h`)?.value),
        allineamento: (c.barre ? 'C' : String($sel(`${pre}_${c.campo}_a`)?.value || 'L')) as Allineamento,
        righe_testo: c.barre ? 1 : Number($(`${pre}_${c.campo}_r`)?.value),
      })),
    };
  },

  async _layoutEtichettaSalva(genere: GenereEtichetta = 'merce') {
    if (!this._requireOperator('la modifica del layout dell’etichetta')) return;
    const layout = this._layoutEtichettaLetto(genere);
    if (!layout.righe.some((r: RigaEtichetta) => r.attivo)) {
      return this.toast('Un’etichetta senza nemmeno un campo acceso non è un’etichetta', 'error');
    }
    try {
      if (genere === 'bancale') await Store.saveLayoutEtichettaPf(layout);
      else await Store.saveLayoutEtichetta(layout);
      this.renderConfig();
      this.toast('Layout salvato — vale per le etichette nuove', 'success');
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  },

  async _layoutEtichettaDiSerie(genere: GenereEtichetta = 'merce') {
    if (!this._requireOperator('la modifica del layout dell’etichetta')) return;
    const bancale = genere === 'bancale';
    if (!await Dialog.confirm({
      title: 'Tornare al layout di serie?',
      message: bancale
        ? 'Codice articolo, descrizione, barre del bancale, lotto, scadenza, colli e peso accesi; '
          + 'ordine di produzione e ubicazione spenti. Le etichette già stampate non cambiano.'
        : 'Barre, codice articolo, descrizione, lotto, scadenza e peso accesi; '
          + 'colli e ubicazione spenti. Le etichette già stampate non cambiano.',
      confirmLabel: 'Torna al layout di serie',
    })) return;
    if (bancale) await Store.saveLayoutEtichettaPf(LAYOUT_PF_DI_SERIE);
    else await Store.saveLayoutEtichetta(LAYOUT_DI_SERIE);
    this.renderConfig();
    this.toast('Layout di serie ripristinato', 'success');
  },

  /* ═══════════════════════════════════════════════════════════════════
     1.13 — LE REGOLE DI STOCCAGGIO SONO UN DATO
     © Andrea Sacchetti — Dietopack S.r.l.

     «Gli articoli che iniziano per 700 vanno in MAG2» è un record che
     scrive un Team Leader, non una riga di codice da ricompilare e
     reinstallare. Questa scheda è dove si scrive.

     DUE MODI, E LA DIFFERENZA È TUTTA. «Impone» è un vincolo duro: fuori da
     lì il motore non propone niente. «Preferisce» alza il punteggio e non
     esclude nessuno. Chi scrive una regola deve sapere quale delle due sta
     scrivendo, e per questo la tendina dice cosa fanno invece di dire i
     loro nomi.

     Una tabella VUOTA non è un errore: senza regole valgono i soli vincoli
     — allergeni, temperatura, stato del vano, capienza — che sono già
     quattro, e bastano al primo giorno.
     ═══════════════════════════════════════════════════════════════════ */

  _renderConfigRules(el: HTMLElement) {
    const regole = Store.getStorageRules();
    const siti = Store.getSites();
    const zone = siti.flatMap((s) => (s.zones || []).filter((z) => z.active).map((z) => ({ ...z, siteName: s.name })));

    const righe = regole.length ? regole
      .slice()
      .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))
      .map((r) => `<div class="inv-item-row ${r.attiva === false ? 'opacity-60' : ''}">
        <div class="inv-info">
          <div class="inv-code">
            ${r.article_code ? `articolo <span class="mono">${this._esc(r.article_code)}</span>`
              : r.article_prefix ? `codici che iniziano per <span class="mono">${this._esc(r.article_prefix)}</span>`
              : r.category ? `categoria <span class="mono">${this._esc(r.category)}</span>`
              : r.category_prefix ? `categorie che iniziano per <span class="mono">${this._esc(r.category_prefix)}</span>`
              : `articoli <span class="mono">${this._esc(r.hazard || '')}</span>`}
            <span class="badge ${r.modo === 'impone' ? 'badge-red' : 'badge-muted'}">${r.modo === 'impone' ? 'impone' : 'preferisce'}</span>
            ${r.attiva === false ? '<span class="badge badge-muted">spenta</span>' : ''}
          </div>
          <div class="inv-lot">
            → ${r.zone_id ? `zona <span class="mono">${this._esc(r.zone_id)}</span>` : `sito <span class="mono">${this._esc(r.site_id || '')}</span>`}
            · priorità ${Number(r.priority) || 0}${r.nota ? ` · ${this._esc(r.nota)}` : ''}
          </div>
        </div>
        <div class="inv-actions-row">
          <button class="inv-btn" title="${r.attiva === false ? 'Riaccendi' : 'Spegni'} la regola" onclick="App._toggleRegola('${this._esc(r.rule_id)}')">${r.attiva === false ? '✓' : '⊘'}</button>
          <button class="inv-btn" title="Elimina la regola" onclick="App._eliminaRegola('${this._esc(r.rule_id)}')">🗑</button>
        </div>
      </div>`).join('')
      : '<div class="empty-state p-7.5"><p>Nessuna regola. Valgono i soli vincoli: allergeni, temperatura, stato del vano, capienza.</p></div>';

    el.innerHTML = `
      ${this._regoleBaseHtml()}
      <div class="mov-preview mb-8 leading-[1.6]">
        Una regola dice <strong>su quali articoli</strong> vale e <strong>dove</strong> devono andare.
        <strong>Impone</strong> è un vincolo: fuori da lì il motore non propone niente, e lo dice.
        <strong>Preferisce</strong> alza il punteggio e non esclude nessuno.<br>
        Le regole non impediscono un posizionamento: il motore consiglia, e uno scavalco
        resta a registro col suo motivo.
      </div>
      <div class="config-card mb-8">
        <strong>Nuova regola</strong>
        <div class="form-row mt-5 mb-5">
          <div class="form-group">
            <label>Su quali articoli <span class="req">*</span></label>
            <div class="flex gap-3">
              <select class="select w-[200px]" id="srSuCosa" onchange="App._srCambiaBersaglio()">
                <option value="prefisso">Codici che iniziano per…</option>
                <option value="esatto">Questo articolo esatto</option>
                <!-- 2.8 — LA CATEGORIA E' IL TERZO MODO, e in magazzino è il
                     primo che viene in mente: «i detersivi stanno in MAG3» non
                     è una regola sui codici, è una regola su una famiglia di
                     merce. Scriverla come prefisso funziona solo dove tutti i
                     detersivi cominciano con le stesse cifre, e nessuna
                     anagrafica cresciuta in vent'anni ce l'ha. -->
                <option value="categoria">Questa categoria esatta</option>
                <option value="catPrefisso">Categorie che iniziano per…</option>
                <!-- 2.9 — LA PERICOLOSITA' ENTRA QUI, e la griglia di
                     incompatibilità è uscita. Chiedevano la stessa cosa in due
                     forme diverse, in due schermate diverse: un posto in più
                     dove guardare, uno in più da tenere in pari, e due modi di
                     dire la stessa politica che prima o poi si contraddicono. -->
                <option value="pericolo">Questa pericolosità</option>
              </select>
              <input class="input input-mono uppercase flex-1" id="srPrefisso" maxlength="${Validate.MAX.ARTICLE_CODE}" placeholder="Es: 700">
              <select class="select flex-1 hidden" id="srPericolo">
                ${Store.getPericoli().map((h) => `<option value="${this._esc(h.code)}">${this._esc(h.label)}</option>`).join('')}
              </select>
            </div>
            <!-- 1.13 — LA SCELTA E' ESPLICITA, e non si indovina dal fatto che
                 il valore esista in anagrafica: «6000366» e' un codice vero E
                 il prefisso di «6000366B», e indovinando si sceglieva sempre
                 il primo. Chi voleva il prefisso non aveva modo di dirlo.
                 Trovato al banco il 19/08, alla prima regola scritta. -->
            <div class="text-label-small text-sx-text-muted mt-2">Un prefisso vale per tutti i codici che iniziano così — anche se quel prefisso è a sua volta un codice.<br>
              <strong>Chi è più preciso zittisce chi è più generale:</strong> l'articolo esatto batte il prefisso, il prefisso batte la categoria, e la categoria batte la pericolosità — che è la rete più larga.</div>
          </div>
          <div class="form-group">
            <label>Dove <span class="req">*</span></label>
            <select class="select" id="srDove">
              <option value="">— scegli —</option>
              ${siti.map((s) => `<option value="sito:${this._esc(s.id)}">Sito ${this._esc(s.name)}</option>`).join('')}
              ${zone.map((z) => `<option value="zona:${this._esc(z.id)}">Zona ${this._esc(z.name)} — ${this._esc(z.siteName)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row mb-5">
          <div class="form-group">
            <label>Come vale</label>
            <select class="select" id="srModo">
              <option value="preferisce">Preferisce — sale nella proposta, non esclude nessuno</option>
              <option value="impone">Impone — fuori da lì non si propone niente</option>
            </select>
          </div>
          <div class="form-group">
            <label>Priorità</label>
            <input class="input input-mono" id="srPriorita" type="number" min="${PRIORITA_MIN}" max="${PRIORITA_MAX}" value="${PRIORITA_PREDEFINITA}">
            <div class="text-label-small text-sx-text-muted mt-2">Da ${PRIORITA_MIN} a ${PRIORITA_MAX}: più alta = decide prima, fra regole che si sovrappongono.</div>
          </div>
        </div>
        <div class="form-group mb-5">
          <label>Perché — lo legge chi vede la proposta</label>
          <input class="input" id="srNota" maxlength="${Validate.MAX.REASON}" placeholder="Es: i 700 stanno in MAG2 per la temperatura">
        </div>
        <button class="btn btn-primary" onclick="App._salvaRegola()">+ Aggiungi regola</button>
      </div>
      <strong class="text-body-medium">Regole scritte (${regole.length})</strong>
      <div class="mt-4">${righe}</div>`;
  },

  /* ═══════════════════════════════════════════════════════════════════
     2.8 — LE DUE REGOLE CHE NON SI SCRIVONO, E LA MATRICE

     Le regole base non hanno una maschera perché non hanno un record: sono
     il modo in cui il magazzino resta leggibile, e non una politica che
     cambia. Ma vanno LETTE — chi si vede rifiutare un posizionamento deve
     poter trovare scritto perché, e trovarlo qui e non nel manuale.

     Il testo viene da `REGOLE_BASE` in `modules/regoleBase.ts`, che è lo
     stesso posto da cui il motore le applica: due testi separati
     divergerebbero al primo ritocco.
     ═══════════════════════════════════════════════════════════════════ */

  _regoleBaseHtml() {
    return `<div class="config-card mb-8">
      <strong>Regole preinstallate</strong>
      <div class="text-label-small text-sx-text-muted mt-2 mb-4">
        Non si scrivono e non si cancellano: valgono sempre, anche senza nessuna regola in tabella.
      </div>
      ${Store.getRegoleBase().map((r) => `<div class="inv-item-row">
        <div class="inv-info">
          <div class="inv-code">
            ${this._esc(r.titolo)}
            <span class="badge ${r.override ? 'badge-muted' : 'badge-red'}">${r.override ? 'scavalcabile' : 'non si scavalca'}</span>
          </div>
          <div class="inv-lot">${this._esc(r.testo)}<br><em>${this._esc(r.comeSiScavalca)}</em></div>
        </div>
      </div>`).join('')}
    </div>`;
  },

  /* 2.9 — IL CAMPO CAMBIA FORMA CON IL BERSAGLIO. Un codice e un prefisso
     si digitano; una pericolosità no — è un elenco chiuso che qualcuno ha
     configurato in Parametri Articolo, e farla digitare vorrebbe dire
     accettare «INFIAMABILE» e non applicarla mai a niente. */
  _srCambiaBersaglio() {
    const pericolo = $sel('srSuCosa')?.value === 'pericolo';
    $('srPrefisso')?.classList.toggle('hidden', pericolo);
    $sel('srPericolo')?.classList.toggle('hidden', !pericolo);
  },

  async _salvaRegola() {
    if (!this._requireOperator('la scrittura di una regola di stoccaggio')) return;
    const su = Validate.clean($('srPrefisso')?.value, true);
    const dove = String($sel('srDove')?.value || '');
    const [tipo, id] = dove.split(':');
    /* La distinzione la dichiara chi scrive, non il sistema: vedi il
       commento nella maschera. */
    const suCosa = String($sel('srSuCosa')?.value || 'prefisso');
    try {
      await Store.saveStorageRule({
        article_code: suCosa === 'esatto' ? su : undefined,
        article_prefix: suCosa === 'prefisso' ? (su || undefined) : undefined,
        category: suCosa === 'categoria' ? su : undefined,
        category_prefix: suCosa === 'catPrefisso' ? (su || undefined) : undefined,
        hazard: suCosa === 'pericolo' ? (String($sel('srPericolo')?.value || '') || undefined) : undefined,
        site_id: tipo === 'sito' ? id : undefined,
        zone_id: tipo === 'zona' ? id : undefined,
        modo: String($sel('srModo')?.value || 'preferisce'),
        priority: parseInt($('srPriorita')?.value, 10) || PRIORITA_PREDEFINITA,
        nota: Validate.clean($('srNota')?.value),
      });
      this.renderConfig();
      this.toast('Regola scritta', 'success');
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  },

  /* Spegnere invece di cancellare: una regola spenta si riaccende, e nel
     frattempo si vede che qualcuno l'aveva pensata. */
  async _toggleRegola(ruleId: string) {
    if (!this._requireOperator('la modifica di una regola')) return;
    const r = Store.getStorageRules().find((x) => x.rule_id === ruleId);
    if (!r) return;
    try {
      await Store.saveStorageRule({ ...r, attiva: r.attiva === false });
      this.renderConfig();
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  },

  async _eliminaRegola(ruleId: string) {
    if (!this._requireOperator('l’eliminazione di una regola')) return;
    if (!await Dialog.confirm({
      title: 'Eliminare la regola?',
      message: 'Sparisce dall’elenco e il motore smette di applicarla. Per toglierla temporaneamente basta spegnerla.',
      details: Dialog.kv([['Regola', ruleId]]),
      confirmLabel: 'Elimina', danger: true,
    })) return;
    await Store.deleteStorageRule(ruleId);
    this.renderConfig();
    this.toast('Regola eliminata', 'success');
  },

  /* 1.12 — IL PREFISSO GS1 È UN PARAMETRO, NON UNA COSTANTE DEL SORGENTE.
     Vuoto, i codici delle unità di carico sono interni e valgono dentro
     l'azienda; compilato, sono SSCC veri, che un cliente legge col suo
     lettore. Chi lo compila cambia forma alle etichette NUOVE, e a quelle
     sole: un'etichetta già stampata non si riscrive, e le due forme
     convivono in magazzino. Sta qui, accanto all'interruttore che lo usa. */
  _prefissoGS1HTML() {
    const p = Store.getPrefissoGS1();
    return `<div class="config-card mt-8">
      <strong>Prefisso GS1 per le unità di carico</strong>
      <div class="text-body-small text-sx-text-secondary leading-[1.6] mt-3">
        Vuoto: i codici sono <strong>interni</strong> — <span class="mono">UDC-000001</span>.
        Compilato: sono <strong>SSCC</strong> a 18 cifre con la cifra di controllo, leggibili da chiunque.
        Cambia le etichette <strong>nuove</strong>: quelle già stampate restano valide.
      </div>
      <div class="flex gap-3 items-end flex-wrap mt-5">
        <div class="form-group mb-0 w-[220px]">
          <label>Prefisso assegnato dal consorzio</label>
          <input class="input input-mono" id="cfgGS1" maxlength="10" placeholder="da 7 a 10 cifre"
            value="${this._esc(p)}" inputmode="numeric">
        </div>
        <button class="btn btn-sm btn-primary" onclick="App._salvaPrefissoGS1()">Salva</button>
        <div class="text-label-small text-sx-text-muted pb-3">
          ${p ? `Adesso: <strong class="mono">${this._esc(p)}</strong> — etichette SSCC` : 'Adesso: nessuno — etichette interne'}
        </div>
      </div>
    </div>`;
  },

  /* 1.14 — L'AREA DEL CONTO DI PRODUZIONE. Ogni ordine ha il suo vano
     dentro quest'area — `WIP-ODP2603889` — perché due ordini nello stesso
     vano sarebbero due consumi mescolati, e nessuno saprebbe più quale
     merce è finita in quale prodotto.

     Senza area configurata il prelievo di produzione non ha dove portare la
     merce: l'interruttore si può accendere lo stesso, e il primo prelievo
     lo dice invece di scrivere giacenza in un vano che nessuno ha mappato. */
  _areaWipHTML() {
    const a = Store.getAreaWip();
    return `<div class="config-card mt-8">
      <strong>Area del conto di produzione (WIP)</strong>
      <div class="text-body-small text-sx-text-secondary leading-[1.6] mt-3">
        <strong>Un'ubicazione mappata</strong>, dove la merce sta mentre la produzione la lavora.
        A tenere distinti i conti dei vari ordini sono le righe, che portano il numero d'ordine:
        un vano per ordine vorrebbe dire mapparne uno nuovo a ogni ordine.
      </div>
      <div class="flex gap-3 items-end flex-wrap mt-5">
        <div class="form-group mb-0 w-[220px]">
          <label>Prefisso dell'area</label>
          <input class="input input-mono uppercase" id="cfgAreaWip" maxlength="${Validate.MAX.LOC_CODE}"
            placeholder="Es: WIP" value="${this._esc(a)}">
        </div>
        <button class="btn btn-sm btn-primary" onclick="App._salvaAreaWip()">Salva</button>
        <div class="text-label-small text-sx-text-muted pb-3">
          ${a ? `Adesso: <strong class="mono">${this._esc(a)}</strong>` : 'Adesso: nessuna — il conto di produzione non può partire'}
        </div>
      </div>
    </div>`;
  },

  async _salvaAreaWip() {
    if (!this._requireOperator('la modifica dell’area WIP')) return;
    try {
      const a = await Store.setAreaWip($('cfgAreaWip')?.value ?? '');
      this.renderConfig();
      this.toast(a ? `Area WIP: ${a}` : 'Nessuna area WIP', 'success');
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  },

  async _salvaPrefissoGS1() {
    if (!this._requireOperator('la modifica del prefisso GS1')) return;
    try {
      const p = await Store.setPrefissoGS1($('cfgGS1')?.value ?? '');
      this.renderConfig();
      this.toast(p ? `Prefisso GS1 ${p}: le etichette nuove sono SSCC` : 'Nessun prefisso: le etichette nuove sono interne', 'success');
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
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
        <td class="w-[190px]">
          <label class="flex items-center gap-3 cursor-pointer normal-case text-body-small">
            <input class="w-[16px] h-[16px] cursor-pointer" type="checkbox" ${c.trasferimento ? 'checked' : ''}
              onchange="App._docCausaleEdit(${i},'trasferimento',this.checked)">
            <span>La merce si sposta</span>
          </label>
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
        ⚠️ <strong>Il mittente è incompleto</strong> — manca: ${this._esc(gaps.join(', '))}.<br>
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
        <p class="text-body-small text-sx-text-muted mb-6">
          <strong>«La merce si sposta»</strong> è la causale del conto terzi — conto lavorazione,
          conto deposito, trasferimento fra magazzini: all'evasione la merce <strong>non esce dal
          sistema</strong>, cambia ubicazione e va nel vano del sito di arrivo, che sta già sulla
          mappa. Resta in giacenza, resta nostra, e il DDT accompagna il viaggio.
          Le causali già salvate non cambiano da sole: la spunta si mette una volta.
        </p>
        <table class="sx-table w-full">
          <thead><tr><th>Descrizione</th><th>Movimento a registro</th><th>Conto terzi</th><th></th></tr></thead>
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
    } else if (field === 'trasferimento') {
      /* Assente e falso sono la stessa cosa qui — una causale non marcata
         scarica come ha sempre scaricato — quindi la spunta si scrive come
         booleano e non lascia un terzo stato da interpretare. */
      cfg.causali[i].trasferimento = value === true || value === 'true';
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
