import { type Vista, $ } from './vista';
import { MOV, MOV_LABELS } from '../../core/costanti';
import { quantitaMossa } from '../../modules/registro';
import { Store } from '../../core/store';
import type { Sito } from '../../types/entita';
import { pickupAlertStatus } from '../../modules/pickupAlert';
import {
  componiLayout, sposta, commuta, ridimensiona, scorciatoieDaMostrare, daSalvare, tastoPer,
} from '../../modules/cruscotto';
import type { Disponibile, Layout, Riquadro } from '../../modules/cruscotto';
import type { Icona } from '../icone';
import type { ModoMovimenta } from './movimenta';

/* Una scorciatoia del cruscotto: quel che serve a disegnare il pulsante e a
   sapere quale maschera apre.

   2.23 — `mode` NON è una stringa qualunque: è uno dei modi che `startMov`
   sa aprire. Fino alla 2.22 lo era, e tre scorciatoie su sette puntavano a
   un nome che non esisteva — `quar` invece di `quarantine`, `camp` invece di
   `sampling`, `ship` invece di `shipping`. Non davano errore da nessuna
   parte: `forms[mode]` tornava `undefined`, l'optional chaining lo ingoiava,
   e restavano tre pulsanti che non facevano niente. Adesso non compilano. */
type Scorciatoia = {
  id: string; mode: ModoMovimenta; sub: string | null; color: string;
  icon: Icona; label: string; sub_txt: string; key: string;
};

/* LE FORME DEI GRAFICI. Non sono dati del magazzino: sono quel che i
   disegnatori qui sotto si passano l'un l'altro. */
type Punto = { x: number; y: number };

/* Un articolo della classifica: quante volte si e' mosso. */
type ArticoloTop = { code: string; count: number };

/* Uno spicchio della ciambella, o una voce di legenda. */
type Segmento = { label: string; value: number; color?: string };

/* Un giorno della barra dei movimenti: il totale e la sua data. */
type GiornoTrend = { total: number; label: string; picks: number };

/* Un ordine di produzione raggruppato dai movimenti che lo compongono. */
type OrdineRaggruppato = {
  ref: string;
  users: Set<string>;
  articles: Set<string>;
  rows: number;
  colli: number;
  first: number;
  last: number;
};

export const VistaCruscotto = {
  // ── Dashboard ──
  renderDashboard() {
    const el = $('viewDashboard');
    if (this._showRegistry) {
      el.innerHTML = this._renderMovRegistry();
      this._filterRegistry();
      return;
    }

    const sites = Store.getSites();
    const kpi = Store.computeKPIs();
    const meta = Store.getMeta();

    const sparkline = (vals: number[], w = 80, h = 22, color = 'var(--md-sys-color-primary)') => {
      if (!vals.length || vals.every((v) => v === 0)) return `<svg class="kpi-sparkline" width="${w}" height="${h}"></svg>`;
      const max = Math.max(...vals, 1);
      const step = w / Math.max(vals.length - 1, 1);
      const pts = vals.map((v, i) => ({ x: i * step, y: h - 1 - (v / max) * (h - 3) }));
      const last = pts[pts.length - 1]!;
      return `<svg class="kpi-sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
        <path d="${this._smoothPath(pts)}" style="fill:none;stroke:${color};stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round"/>
        <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.2" style="fill:${color}"/>
      </svg>`;
    };

    const dailyVals = kpi.dailyTrend.map(d => d.total);

    let html = `
      <div class="flex justify-between items-center mb-10 flex-wrap gap-5">
        <div>
          <h1 class="dash-h1">Dashboard Operativa</h1>
          <!-- 2.16 — servito non si «salva»: si scrive, e la data e' quella
               dell'ultima scrittura. La parola vecchia diceva a chi lavora
               che fra un salvataggio e l'altro qualcosa poteva perdersi. -->
          <p class="dash-sub">${Store.eServito() ? 'Ultima scrittura' : 'Ultimo salvataggio'}: ${meta.lastModified ? new Date(meta.lastModified).toLocaleString('it-IT') : 'Mai'}</p>
        </div>
        <div class="flex gap-4 flex-wrap">
          <!-- v2.7.0 [G3] — "Salva ora" ed "Export JSON" sono usciti di qui:
               il primo e' diventato l'indicatore in barra, il secondo vive in
               Configurazione -> Dati insieme agli altri comandi di esportazione. -->
          <button class="btn btn-sm" onclick="App._personalizzaCruscotto()">${this._ico('puzzle')} Personalizza</button>
          <button class="btn btn-sm" onclick="App._showRegistry=true;App.renderDashboard()">${this._ico('clipboard-text')} Registro Movimenti</button>
        </div>
      </div>

      <!-- v2.4.5 [Q1] — Scorciatoie: le azioni prima degli indicatori -->
      ${this._renderQuickActions()}
      ${this._renderRiquadri(kpi, sites, sparkline, dailyVals)}`;
    el.innerHTML = html;
  },

  /* ═══ 2.1 — I RIQUADRI SONO UN ELENCO, NON UNA SEQUENZA SCRITTA ═════

     Fino alla 2.0 il corpo della Dashboard era otto blocchi in fila
     nell'ordine in cui erano stati costruiti, e cambiarlo voleva dire una
     build. Adesso ognuno è una voce del catalogo qui sotto, e l'ordine, la
     larghezza e quali esistano stanno in `meta` come JSON.

     IL CATALOGO È LA SORGENTE UNICA. Il titolo che l'utente legge nella
     scheda «Personalizza» e quello scritto sul riquadro escono di qui, non
     da due stringhe che si somigliano: il giorno che una cambia, cambiano
     tutte e due insieme. E il layout salvato NON porta i titoli — vedi
     `daSalvare` — proprio perché il testo appartiene al codice.

     `fisso` non è una comodità: gli avvisi di integrità e i ritiri scaduti
     sono la ragione per cui qualcuno deve guardare il cruscotto oggi
     invece che domani, e spegnerli è l'unico modo di non vedere l'unica
     cosa che andava vista. */
  _riquadriDisponibili(): Disponibile[] {
    return [
      { id: 'kpi', titolo: 'Indicatori', larghezzaDiSerie: 'intera',
        descrizione: 'Ubicazioni, item, movimenti di oggi, blocchi, quarantena, accuratezza' },
      { id: 'integrita', titolo: 'Avvisi di integrità', fisso: true, larghezzaDiSerie: 'intera',
        descrizione: 'Non si spegne: parla di dati che non tornano' },
      { id: 'ritiri', titolo: 'Ritiri in scadenza', fisso: true, larghezzaDiSerie: 'intera',
        descrizione: 'Non si spegne: un ritiro mancato è un camion che torna vuoto' },
      { id: 'attivita', titolo: 'Attività in coda', larghezzaDiSerie: 'intera' },
      { id: 'andamento', titolo: 'Andamento movimenti — 14 giorni' },
      { id: 'tipi', titolo: 'Ripartizione per tipo di movimento' },
      { id: 'occupazione', titolo: 'Occupazione per sito' },
      { id: 'top', titolo: 'Articoli più movimentati' },
      { id: 'ultimi', titolo: 'Ultimi movimenti' },
      { id: 'ordini', titolo: 'Ordini di produzione' },
      { id: 'documenti', titolo: 'Documenti aperti' },
      { id: 'quarantena', titolo: 'Quarantena attiva' },
      { id: 'smaltimenti', titolo: 'Verbali di smaltimento' },
    ];
  },

  _layoutCruscotto(): Layout {
    return componiLayout(Store.getDashboardLayout(), this._riquadriDisponibili());
  },

  /* Il contenuto di un riquadro. Un `id` che il catalogo dichiara e questo
     `switch` non conosce restituisce stringa vuota: è un riquadro annunciato
     e non scritto, e sbagliare qui deve lasciare il cruscotto in piedi. */
  _contenutoRiquadro(id: string, kpi, sites, sparkline, dailyVals) {
    switch (id) {
      case 'kpi': return this._renderKpiGrid(kpi, sparkline, dailyVals);
      case 'integrita': return this._renderIntegrityAlertsSection();
      case 'ritiri': return this._renderPickupAlertsSection();
      case 'attivita': return this._renderTasksPanel();
      case 'andamento': return `<div class="card">
        <div class="card-title">Andamento movimenti — ultimi 14 giorni</div>
        ${this._renderDailyBars(kpi.dailyTrend)}</div>`;
      case 'tipi': return `<div class="card">
        <div class="card-title">Ripartizione per tipo di movimento</div>
        ${this._renderTypeCounts(kpi.typeCounts, kpi.totalMovements)}</div>`;
      case 'occupazione': return `<div class="card">
        <div class="card-title">Occupazione per sito</div>
        ${sites.length ? this._renderSiteOccupancy(sites) : '<div class="ct-empty">Nessun sito configurato. Aprire Configurazione per crearne uno.</div>'}</div>`;
      case 'top': return `<div class="card">
        <div class="card-title">Articoli piu' movimentati</div>
        ${kpi.topArticles.length ? this._renderTopArticles(kpi.topArticles) : '<div class="ct-empty">Nessun movimento registrato finora.</div>'}</div>`;
      case 'ultimi': return this._renderLastMovements(20);
      case 'ordini': return this._renderProdOrders();
      case 'documenti': return this._renderPendingDocs();
      case 'quarantena': return this._renderQuarantineList();
      case 'smaltimenti': return this._renderDisposalDocs();
      default: return '';
    }
  },

  _renderRiquadri(kpi, sites, sparkline, dailyVals) {
    const layout = this._layoutCruscotto();
    const pezzi = layout.riquadri
      .filter((r: Riquadro) => r.visibile)
      .map((r: Riquadro) => {
        const corpo = this._contenutoRiquadro(r.id, kpi, sites, sparkline, dailyVals);
        /* Un riquadro che oggi non ha niente da dire non lascia un buco:
           `_renderIntegrityAlertsSection` restituisce stringa vuota quando
           tutto torna, ed è giusto così. */
        if (!corpo) return '';
        return `<div class="dash-slot dash-slot-${r.larghezza}" data-riquadro="${this._esc(r.id)}">${corpo}</div>`;
      })
      .filter(Boolean);
    return `<div class="dash-griglia">${pezzi.join('')}</div>`;
  },

  /* ═══ LA SCHEDA «PERSONALIZZA» ══════════════════════════════════════

     Si trascina per riordinare, si spunta per accendere, si sceglie metà o
     intera. Nessuna coordinata in pixel: vedi il perché in
     `modules/cruscotto.ts`.

     LE MODIFICHE SI SCRIVONO SUBITO. Un pulsante «salva» in fondo a un
     elenco di tredici righe è la trappola di chi chiude la finestra
     contento e ritrova tutto com'era. */
  _personalizzaCruscotto() {
    const layout = this._layoutCruscotto();
    const catalogo = new Map<string, Disponibile>(
      this._riquadriDisponibili().map((d: Disponibile) => [d.id, d] as [string, Disponibile]));
    const righe = layout.riquadri.map((r: Riquadro, i: number) => {
      const d = catalogo.get(r.id);
      return `<div class="dash-cfg-row" draggable="true"
        ondragstart="App._dashDragStart(event,'${this._esc(r.id)}')"
        ondragover="App._dashDragOver(event)"
        ondrop="App._dashDrop(event,${i})">
        <span class="dash-cfg-grip" title="Trascina per riordinare">⣿</span>
        <label class="dash-cfg-nome">
          <input type="checkbox" ${r.visibile ? 'checked' : ''} ${d?.fisso ? 'disabled' : ''}
            onchange="App._dashCommuta('${this._esc(r.id)}')">
          <span>${this._esc(d?.titolo || r.id)}</span>
          ${d?.fisso ? '<span class="badge badge-muted">sempre acceso</span>' : ''}
        </label>
        <select class="select select-sm" onchange="App._dashLarghezza('${this._esc(r.id)}', this.value)">
          <option value="meta" ${r.larghezza === 'meta' ? 'selected' : ''}>Metà riga</option>
          <option value="intera" ${r.larghezza === 'intera' ? 'selected' : ''}>Riga intera</option>
        </select>
        ${d?.descrizione ? `<div class="dash-cfg-nota">${this._esc(d.descrizione)}</div>` : ''}
      </div>`;
    }).join('');

    const catalogoScorciatoie: Scorciatoia[] = this._scorciatoieDisponibili();
    const scelte = scorciatoieDaMostrare(layout, catalogoScorciatoie.map((s) => s.id));
    const scorciatoie = catalogoScorciatoie.map((s) => `
      <label class="dash-cfg-short">
        <input type="checkbox" ${scelte.includes(s.id) ? 'checked' : ''}
          onchange="App._dashCommutaScorciatoia('${this._esc(s.id)}')">
        <span>${this._ico(s.icon)} ${this._esc(s.label)}</span>
      </label>`).join('');

    this.showModal(
      `${this._ico('puzzle')} Personalizza il cruscotto`,
      `<p class="text-body-small text-sx-text-secondary mb-6">
        Trascina per riordinare, spunta per accendere, scegli quanto spazio prende.
        Le modifiche si scrivono subito e sono <strong>tue</strong>: valgono su
        ogni terminale dove entri con la tua sigla, e non cambiano il cruscotto
        agli altri.
      </p>
      <div class="dash-cfg">${righe}</div>
      <div class="detail-section-title mt-7">Scorciatoie a Movimenta</div>
      <div class="dash-cfg-shorts">${scorciatoie}</div>`,
      `<button class="btn" onclick="App._dashRipristina()">↺ Come di serie</button>
       <button class="btn btn-primary" onclick="App.closeModal()">Chiudi</button>`
    );
  },

  _dashTrascinato: null,
  _dashDragStart(ev, id) { this._dashTrascinato = id; try { ev.dataTransfer.effectAllowed = 'move'; } catch {} },
  _dashDragOver(ev) { if (this._dashTrascinato) ev.preventDefault(); },

  async _dashDrop(ev, indice) {
    ev.preventDefault();
    const id = this._dashTrascinato;
    this._dashTrascinato = null;
    if (!id) return;
    const layout = this._layoutCruscotto();
    await this._dashScrivi({ ...layout, riquadri: sposta(layout.riquadri, id, indice) });
  },

  async _dashCommuta(id) {
    const layout = this._layoutCruscotto();
    await this._dashScrivi({ ...layout, riquadri: commuta(layout.riquadri, id, this._riquadriDisponibili()) });
  },

  async _dashLarghezza(id, larghezza) {
    const layout = this._layoutCruscotto();
    await this._dashScrivi({ ...layout, riquadri: ridimensiona(layout.riquadri, id, larghezza) });
  },

  async _dashCommutaScorciatoia(id: string) {
    const layout = this._layoutCruscotto();
    const tutte: string[] = this._scorciatoieDisponibili().map((s: Scorciatoia) => s.id);
    const ora = scorciatoieDaMostrare(layout, tutte);
    const dopo = ora.includes(id) ? ora.filter((x) => x !== id) : tutte.filter((x) => ora.includes(x) || x === id);
    await this._dashScrivi({ ...layout, scorciatoie: dopo });
  },

  /* «Come di serie» cancella il dato invece di riscriverlo con i valori di
     oggi: un layout salvato uguale al predefinito smetterebbe di seguire il
     predefinito il giorno che il predefinito cambia. */
  async _dashRipristina() {
    try {
      await Store.setDashboardLayout(null);
      this.renderDashboard();
      this._personalizzaCruscotto();
      this.toast('Cruscotto riportato come di serie', 'success');
    } catch (e) {
      this.toast(`Layout non salvato: ${(e as Error).message}`, 'error');
    }
  },

  async _dashScrivi(layout: Layout) {
    try {
      await Store.setDashboardLayout(daSalvare(layout));
      this.renderDashboard();
      this._personalizzaCruscotto();
    } catch (e) {
      this.toast(`Layout non salvato: ${(e as Error).message}`, 'error');
    }
  },

  _renderKpiGrid(kpi, sparkline, dailyVals) {
    return `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Ubicazioni totali</div>
          <div class="kpi-value">${kpi.totalLocs}</div>
          <div class="kpi-sub">${kpi.occPct}% occupate · ${kpi.emptyLocs} libere</div>
        </div>
        <div class="kpi-card k-success">
          <div class="kpi-label">Item a magazzino</div>
          <div class="kpi-value">${kpi.totalItems}</div>
          <div class="kpi-sub">in ${kpi.occupiedLocs} ubicazioni</div>
        </div>
        <div class="kpi-card k-warning">
          <div class="kpi-label">Movimenti oggi</div>
          <div class="kpi-value">${kpi.todayMov}</div>
          <div class="kpi-sub">${kpi.todayPick} prelievi</div>
          ${sparkline(dailyVals, 90, 22, 'var(--sx-warning)')}
        </div>
        <div class="kpi-card k-danger">
          <div class="kpi-label">Bloccate / Riservate</div>
          <div class="kpi-value">${kpi.blockedLocs + kpi.reservedLocs}</div>
          <div class="kpi-sub">${kpi.blockedLocs} bloc · ${kpi.reservedLocs} ris · ${kpi.disabledLocs} disatt.</div>
        </div>
        <div class="kpi-card k-purple">
          <div class="kpi-label">Quarantena attiva</div>
          <div class="kpi-value">${Store.getActiveQuarantine().length}</div>
          <div class="kpi-sub">Non conformità aperte</div>
        </div>
        ${this._renderKpiPendingOutbound()}
        <div class="kpi-card">
          <div class="kpi-label">Accuratezza inventario</div>
          <div class="kpi-value">${kpi.accuracyPct}%</div>
          <div class="kpi-sub">${kpi.fixCount} correzioni su ${kpi.totalMovements} movimenti</div>
        </div>
      </div>`;
  },

  /* 2.23 — LA SOTTOSCHEDA NON E' SEMPRE QUELLA DEL PRELIEVO. Fino alla 2.22
     `sub` finiva dritto in `_pickSub`, perché il prelievo era l'unica maschera
     con delle schede. Adesso ne ha anche Spedizioni — documenti e carico
     camion — e una scorciatoia che dicesse `_pickSub('carico')` aprirebbe il
     prelievo su una scheda che non esiste, lasciando la schermata vuota.
     Chi sa aprire la scheda è la maschera stessa. */
  _SOTTOSCHEDE: { pick: '_pickSub', shipping: '_shipSub' } as Record<string, string>,

  _goOp(mode, sub = null) {
    this.switchView('movimenta');
    const run = () => {
      if (mode === 'io') { this.startMov('io', sub || 'in'); return; }
      this.startMov(mode);
      const apri = sub && this._SOTTOSCHEDE[mode];
      if (apri) this[apri](sub);
    };
    if ($('movFormArea')) run();
    else setTimeout(run, 50);
  },

  /* 2.1 — LE SCORCIATOIE SONO UN CATALOGO, e quali si vedono lo sceglie
     chi lavora, da «Personalizza». Un magazzino che non campiona mai da
     terminale non ha bisogno di quel pulsante in cima allo schermo, e uno
     che conta ogni giorno sì: prima erano tre, uguali per tutti, scritte
     qui dentro.

     L'`id` è quello che finisce nel layout salvato e non cambia mai; il
     titolo è testo, e può cambiare quando serve. */
  /* 2.29.1 — IL TASTO NON SI SCRIVE QUI. Lo dice `tastoPer`, che legge la
     stessa tabella che ascolta la tastiera: una scheda non puo' piu'
     annunciare un tasto che porta da un'altra parte, ne' tacerne uno che
     porta da lei. Vedi `modules/cruscotto.ts`. */
  _scorciatoieDisponibili(): Scorciatoia[] {
    const catalogo: Omit<Scorciatoia, 'key'>[] = [
      { id: 'io-in',         mode: 'io',   sub: 'in',         color: 'var(--ct-cat-in)',   icon: 'package',
        label: 'Carico / Scarico', sub_txt: 'Posiziona e smaltisci' },
      { id: 'pick-cambio',   mode: 'pick', sub: 'cambio',     color: 'var(--ct-cat-move)', icon: 'refresh',
        label: 'Trasferimento',    sub_txt: 'Cambio ubicazione' },
      { id: 'pick-prod',     mode: 'pick', sub: 'produzione', color: 'var(--ct-cat-pick)', icon: 'building-factory',
        label: 'Prelievo ordini',  sub_txt: 'Prelievo produzione' },
      { id: 'inventario',    mode: 'inv',  sub: null,         color: 'var(--sx-warning)',  icon: 'clipboard-text',
        label: 'Inventario',       sub_txt: 'Vano, articolo o unità' },
      { id: 'quarantena',    mode: 'quarantine', sub: null,         color: 'var(--sx-purple)',   icon: 'lock',
        label: 'Quarantena',       sub_txt: 'Blocco qualità' },
      { id: 'campionamento', mode: 'sampling', sub: null,         color: 'var(--sx-teal)',     icon: 'flask',
        label: 'Campionamento',    sub_txt: 'Presa per la qualità' },
      { id: 'spedizioni',    mode: 'shipping', sub: 'documenti',  color: 'var(--ct-cat-out)',  icon: 'truck',
        label: 'Spedizioni',       sub_txt: 'DDT e uscite' },
      /* 2.23 — Il carico del camion era una tessera di Movimenta e non aveva
         una scorciatoia; adesso è una scheda di Spedizioni, e chi carica ci
         va venti volte al giorno. */
      { id: 'carico-camion', mode: 'shipping', sub: 'carico',     color: 'var(--ct-cat-out)',  icon: 'tir',
        label: 'Carico camion',    sub_txt: 'Bancali in baia' },
    ];
    return catalogo.map((o) => ({ ...o, key: tastoPer(o.mode, o.sub) }));
  },

  _renderQuickActions() {
    const catalogo: Scorciatoia[] = this._scorciatoieDisponibili();
    const scelte = scorciatoieDaMostrare(this._layoutCruscotto(), catalogo.map((s) => s.id));
    const ops = catalogo.filter((s) => scelte.includes(s.id));
    if (!ops.length) return '';
    const btns = ops.map((o) => `<button type="button" class="qa-btn" style="--qa-c:${o.color}"
        onclick="App._goOp('${o.mode}'${o.sub ? `,'${o.sub}'` : ''})"
        aria-label="${this._esc(o.label)} — ${this._esc(o.sub_txt)}">
        <span class="qa-ico">${this._ico(o.icon)}</span>
        <span class="qa-txt">
          <span class="qa-title">${this._esc(o.label)}</span>
          <span class="qa-sub">${this._esc(o.sub_txt)}</span>
        </span>
        ${o.key ? `<span class="qa-key" aria-hidden="true">${this._esc(o.key)}</span>` : ''}
      </button>`).join('');
    return `<nav class="qa-bar" aria-label="Scorciatoie operazioni principali">${btns}</nav>`;
  },

  /* Etichette compatte per la colonna tipo: i nomi estesi non stanno in
     68px e troncati diventano ambigui ("Prelievo Pro...", "Posizioname..."). */
  _MOV_SHORT: {
    IN: 'ENTRATA', OUT: 'SMALT.', MOVE: 'CAMBIO U.', PICK: 'PRELIEVO',
    REPOS: 'RIPOSIZ.', 'FIX+': 'RETT. +', 'FIX-': 'RETT. −',
    QUAR: 'QUARANT.', QREL: 'RILASCIO', EDIT: 'MODIFICA',
    RET: 'RESO', SHIP: 'SPEDIZ.'
  },
  _movShort(type) { return this._MOV_SHORT[type] || type; },

  _fmtDateTime(ts) {
    return new Date(ts).toLocaleString('it-IT',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  },

  /* ── A) Ultimi 20 movimenti ──────────────────────────────────────── */
  _renderLastMovements(limit = 20) {
    const log = [...Store.getMovLog()].sort((a, b) => b.ts - a.ts).slice(0, limit);
    const head = `<div class="dl-head">
      <span class="dl-head-title">Ultimi movimenti</span>
      <span class="dl-badge">${log.length}</span>
      <button class="dl-btn" onclick="App._showRegistry=true;App.renderDashboard()"
        title="Apri il registro movimenti completo">Registro</button>
    </div>`;
    if (!log.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessun movimento registrato. Le operazioni compaiono qui appena eseguite.</div></div>`;
    }
    const rows = log.map(m => {
      const qty = quantitaMossa(m);
      const dest = m.dest_location ? ` → <span class="mono">${this._esc(m.dest_location)}</span>` : '';
      const ref = m.doc_ref ? ` · rif. ${this._esc(m.doc_ref)}` : '';
      return `<div class="dl-row" title="${this._esc((MOV_LABELS[m.type] || m.type) + ' — ' + (m.article_description || m.article_code))}">
        <span class="dl-tag" style="border-left-color:${this._movColor(m.type)}">${this._esc(this._movShort(m.type))}</span>
        <div class="dl-main">
          <div class="dl-p"><span class="mono">${this._esc(m.article_code || '—')}</span>${m.lot_code ? ' · lotto <span class="mono">' + this._esc(m.lot_code) + '</span>' : ''}</div>
          <div class="dl-s"><span class="mono">${this._esc(m.location_code || '—')}</span>${dest} · ${this._esc(m.user || 'n.d.')}${ref}</div>
        </div>
        <div class="dl-end">
          ${qty != null ? `<span class="dl-qty">${qty}</span>&nbsp;Coll.` : ''}
          <span>${this._esc(this._fmtDateTime(m.ts))}</span>
        </div>
      </div>`;
    }).join('');
    return `<div class="card">${head}<div class="dl-list">${rows}</div></div>`;
  },

  /* ── B) Ordini di produzione prelevati ───────────────────────────── */
  _groupProdOrders() {
    const map = new Map();
    for (const m of Store.getMovLog()) {
      if (m.type !== MOV.PICK) continue;   // `MOV.PICK` E' la stringa 'PICK': il doppio confronto era una cintura in piu'
      const ref = m.doc_ref || '(senza numero)';
      let g = map.get(ref);
      if (!g) { g = { ref, rows: 0, colli: 0, first: m.ts, last: m.ts, users: new Set(), articles: new Set() }; map.set(ref, g); }
      g.rows++;
      g.colli += quantitaMossa(m) ?? 1;
      g.first = Math.min(g.first, m.ts);
      g.last = Math.max(g.last, m.ts);
      if (m.user) g.users.add(m.user);
      if (m.article_code) g.articles.add(m.article_code);
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
  },

  _renderProdOrders(limit = 30) {
    const all = this._groupProdOrders();
    const list = all.slice(0, limit);
    const head = `<div class="dl-head">
      <span class="dl-head-title">Ordini di produzione prelevati</span>
      <span class="dl-badge">${all.length}</span>
    </div>`;
    if (!list.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessun prelievo di produzione registrato. Gli ordini compaiono qui dopo la conferma del prelievo.</div></div>`;
    }
    const rows = (list as OrdineRaggruppato[]).map((g) => {
      const users = [...g.users].join(', ') || 'n.d.';
      const sameDay = new Date(g.first).toDateString() === new Date(g.last).toDateString();
      const when = sameDay ? this._fmtDateTime(g.last) : `${this._fmtDateTime(g.first)} — ${this._fmtDateTime(g.last)}`;
      return `<div class="dl-row" title="Ordine ${this._esc(g.ref)}: ${g.rows} lotti, ${g.colli} colli, ${g.articles.size} articoli">
        <span class="dl-tag [border-left-color:var(--ct-cat-pick)]">ORDINE</span>
        <div class="dl-main">
          <div class="dl-p"><span class="mono">${this._esc(g.ref)}</span></div>
          <div class="dl-s">${g.rows} lotti · ${g.articles.size} articoli · ${this._esc(users)} · ${this._esc(when)}</div>
        </div>
        <div class="dl-end"><span class="dl-qty">${g.colli}</span>&nbsp;Coll.</div>
        <button class="dl-btn" title="Stampa il report di prelievo dell'ordine ${this._esc(g.ref)}"
          onclick="App._printProdOrderFromLog('${encodeURIComponent(g.ref)}')">${this._ico('printer', 'Stampa')}</button>
      </div>`;
    }).join('');
    const foot = all.length > limit
      ? `<div class="dl-foot">Mostrati i ${limit} ordini più recenti su ${all.length} — il registro completo è in Registro Movimenti.</div>` : '';
    return `<div class="card">${head}<div class="dl-list">${rows}</div>${foot}</div>`;
  },

  async _printProdOrderFromLog(encodedRef) {
    const ref = decodeURIComponent(encodedRef);

    const snap = ref === '(senza numero)' ? null : Store.getPickReportByOdp(ref);
    if (snap) return this._emitPickReport(snap, { reprint: true });

    const res = await Store.queryMovements({ type: MOV.PICK, limit: 100000 });
    const movs = res.rows
      .filter(m => (m.doc_ref || '(senza numero)') === ref)
      .sort((a, b) => a.ts - b.ts);
    if (!movs.length) return this.toast('Ordine non trovato nel registro movimenti', 'error');

    this._emitPickReport(this._pickSnapFromLog(movs, ref), { reprint: true });
  },

  /* ── C) DDT di uscita pendenti ───────────────────────────────────── */
  _renderPendingDocs() {
    const docs = Store.getPendingOutbound()
      .map(d => ({ d, a: pickupAlertStatus(d) }))
      .sort((x, y) => x.a.sortKey - y.a.sortKey);
    const urgent = docs.filter(x => ['overdue', 'today'].includes(x.a.level)).length;
    const head = `<div class="dl-head">
      <span class="dl-head-title">DDT pendenti</span>
      <span class="dl-badge${urgent ? ' is-alert' : ''}">${docs.length}</span>
    </div>`;
    if (!docs.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessun documento aperto. I DDT registrati e non ancora evasi compaiono qui.</div></div>`;
    }
    const rows = docs.map(({ d, a }) => {
      const isRet = this._docIsReturn(d);
      const colli = (d.lines || []).reduce((s, l) => s + (l.qty || 0), 0);
      const dest = d.destination || 'destinatario non indicato';
      const causale = this._docCausaleLabel(d);
      return `<div class="dl-row" title="${this._esc(a.label)}">
        <span class="dl-tag" style="border-left-color:${isRet ? 'var(--ct-cat-ret)' : 'var(--ct-cat-ship)'}">${isRet ? 'RESO' : 'SPEDIZ.'}</span>
        <div class="dl-main">
          <div class="dl-p">DDT <span class="mono">${this._esc(d.ddt_num || '—')}</span> · ${this._esc(dest)}</div>
          <div class="dl-s">${this._esc(causale)} · ${(d.lines || []).length} righe · ${colli} Coll.${d.carrier ? ' · vett. ' + this._esc(d.carrier) : ''}${d.operator ? ' · ' + this._esc(d.operator) : ''}</div>
        </div>
        <span class="dl-chip" style="color:${a.color}">${this._esc(a.shortLabel)}</span>
        <button class="dl-btn" title="Stampa il documento ${this._esc(d.ddt_num || d.doc_id)}"
          onclick="App._printDDT('${this._esc(d.doc_id)}')">${this._ico('printer', 'Stampa')}</button>
      </div>`;
    }).join('');
    return `<div class="card">${head}<div class="dl-list">${rows}</div></div>`;
  },

  _renderDisposalDocs(limit = 20) {
    const all = Store.getDisposals();
    const list = all.slice(0, limit);
    const head = `<div class="dl-head">
      <span class="dl-head-title">Verbali di smaltimento</span>
      <span class="dl-badge">${all.length}</span>
    </div>`;
    if (!list.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessuno smaltimento registrato. I verbali compaiono qui appena emessi e restano ristampabili.</div></div>`;
    }
    const rows = list.map(v => `<div class="dl-row" title="${this._esc(v.reason || '')}">
        <span class="dl-tag [border-left-color:var(--ct-cat-out)]">SMALT.</span>
        <div class="dl-main">
          <div class="dl-p"><span class="mono">${this._esc(v.article_code)}</span> · lotto <span class="mono">${this._esc(v.lot_code)}</span></div>
          <div class="dl-s"><span class="mono">${this._esc(v.doc_id)}</span> · ${this._esc(v.location_code)} · ${this._esc(v.reason || 'motivo n.d.')} · ${this._esc(v.operator || 'n.d.')}</div>
        </div>
        <div class="dl-end">
          <span class="dl-qty">${v.qty}</span>&nbsp;Coll.
          <span>${this._esc(this._fmtDateTime(v.created_at))}</span>
        </div>
        <button class="dl-btn" title="Ristampa il verbale ${this._esc(v.doc_id)}"
          onclick="App._printDisposal('${this._esc(v.doc_id)}')">${this._ico('printer', 'Stampa')}</button>
      </div>`).join('');
    return `<div class="card">${head}<div class="dl-list">${rows}</div></div>`;
  },

  _docCausaleLabel(d) {
    if (d.causale_label) return d.causale_label;
    const c = d.causale_id ? Store.getCausale(d.causale_id) : null;
    if (c) return c.label;
    return d.kind === 'RES' ? 'Reso a fornitore' : 'Vendita';
  },

  _docIsReturn(d) {
    if (d.causale_id) {
      const c = Store.getCausale(d.causale_id);
      if (c) return c.mov === 'RET';
    }
    if (d.causale_mov) return d.causale_mov === 'RET';
    return d.kind === 'RES';
  },

  /* ── D) Item in quarantena ───────────────────────────────────────── */
  _renderQuarantineList() {
    const list = [...Store.getActiveQuarantine()].sort((a, b) => a.created_at - b.created_at);
    const head = `<div class="dl-head">
      <span class="dl-head-title">Item in quarantena</span>
      <span class="dl-badge${list.length ? ' is-alert' : ''}">${list.length}</span>
    </div>`;
    if (!list.length) {
      return `<div class="card">${head}<div class="dl-empty">Nessun item bloccato. Le non conformità aperte compaiono qui.</div></div>`;
    }
    const rows = list.map(q => {
      const days = Math.floor((Date.now() - q.created_at) / 86400000);
      const aging = days === 0 ? 'oggi' : days === 1 ? '1 giorno' : `${days} giorni`;
      const who = [q.reference_dept, q.reference_person].filter(Boolean).join(' / ') || 'reparto n.d.';
      return `<div class="dl-row" title="${this._esc(q.reason || 'motivo non indicato')}">
        <span class="dl-tag [border-left-color:var(--ct-cat-quar)]">NC</span>
        <div class="dl-main">
          <div class="dl-p"><span class="mono">${this._esc(q.article_code)}</span> · lotto <span class="mono">${this._esc(q.lot_code)}</span></div>
          <div class="dl-s">${this._esc(q.blocked_location || '—')} · ${this._esc(who)} · ${this._esc(q.reason || 'motivo non indicato')}</div>
        </div>
        <div class="dl-end"><span class="dl-qty">${aging}</span></div>
        <button class="dl-btn" title="Stampa il cartello di non conformità ${this._esc(q.q_id)}"
          onclick="App._printNCCard('${this._esc(q.q_id)}')">${this._ico('printer', 'Stampa')}</button>
      </div>`;
    }).join('');
    return `<div class="card">${head}<div class="dl-list">${rows}</div></div>`;
  },

  _smoothPath(pts: Punto[]) {
    const n = pts.length;
    if (n === 0) return '';
    if (n === 1) return `M${pts[0]!.x},${pts[0]!.y}`;
    if (n === 2) return `M${pts[0]!.x},${pts[0]!.y} L${pts[1]!.x},${pts[1]!.y}`;
    const dx: number[] = [], dy: number[] = [], slope: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      dx.push(pts[i + 1]!.x - pts[i]!.x);
      dy.push(pts[i + 1]!.y - pts[i]!.y);
      slope.push(dx[i]! === 0 ? 0 : dy[i]! / dx[i]!);
    }
    const tan = [slope[0]!];
    for (let i = 1; i < n - 1; i++) {
      if (slope[i - 1]! * slope[i]! <= 0) { tan.push(0); continue; }
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      tan.push((w1 + w2) / (w1 / slope[i - 1]! + w2 / slope[i]!));
    }
    tan.push(slope[n - 2]!);
    let d = `M${pts[0]!.x.toFixed(2)},${pts[0]!.y.toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i]! / 3;
      d += ` C${(pts[i]!.x + h).toFixed(2)},${(pts[i]!.y + tan[i]! * h).toFixed(2)}` +
           ` ${(pts[i + 1]!.x - h).toFixed(2)},${(pts[i + 1]!.y - tan[i + 1]! * h).toFixed(2)}` +
           ` ${pts[i + 1]!.x.toFixed(2)},${pts[i + 1]!.y.toFixed(2)}`;
    }
    return d;
  },

  _MOV_COLORS: {
    IN:    'var(--ct-cat-in)',
    PICK:  'var(--ct-cat-pick)',
    MOVE:  'var(--ct-cat-move)',
    OUT:   'var(--ct-cat-out)',
    QUAR:  'var(--ct-cat-quar)',
    QREL:  'var(--ct-cat-qrel)',
    RET:   'var(--ct-cat-ret)',
    SHIP:  'var(--ct-cat-ship)',
    EDIT:  'var(--ct-cat-edit)',
    'FIX+': 'var(--ct-cat-fixp)',
    'FIX-': 'var(--ct-cat-fixm)',
    REPOS: 'var(--ct-cat-repos)'
  },
  _movColor(type) { return this._MOV_COLORS[type] || 'var(--md-sys-color-outline)'; },

  _svgDonut(segments: Segmento[], opts: {
    size?: number; thickness?: number; centerLabel?: string; gapDeg?: number; ariaLabel?: string;
  } = {}) {
    const {
      size = 196, thickness = 30, centerLabel = 'TOTALE',   // v2.4.4 [N1] — riquadro condiviso
      gapDeg = 2.2, ariaLabel = 'Grafico a ciambella'
    } = opts;
    const list = segments.filter((s) => s.value > 0);
    const total = list.reduce((s, x) => s + x.value, 0);
    if (!total) return '<div class="ct-empty">Nessun dato da rappresentare.</div>';

    const cx = size / 2, cy = size / 2;
    const r = (size - thickness) / 2 - 1;
    const circ = 2 * Math.PI * r;
    const gap = list.length > 1 ? (gapDeg / 360) * circ : 0;

    let acc = 0;
    let arcs = '';
    for (const s of list) {
      const frac = s.value / total;
      const len = Math.max(frac * circ - gap, 0.6);   // sempre visibile
      const pct = Math.round(frac * 100);
      const title = `${s.label}: ${s.value} (${pct}%)`;
      arcs += `<circle class="ct-seg" cx="${cx}" cy="${cy}" r="${r.toFixed(2)}"
        style="stroke:${s.color};stroke-width:${thickness}"
        stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"
        stroke-dashoffset="${(-acc * circ).toFixed(2)}"><title>${this._esc(title)}</title></circle>`;
      acc += frac;
    }

    const svg = `<svg class="chart" viewBox="0 0 ${size} ${size}" style="max-width:${size}px;margin:0 auto"
      role="img" aria-label="${this._esc(ariaLabel)}">
      <g transform="rotate(-90 ${cx} ${cy})">
        <circle class="ct-track" cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" style="stroke-width:${thickness}"/>
        ${arcs}
      </g>
      <text class="ct-total" x="${cx}" y="${cy - 1}" text-anchor="middle" dominant-baseline="middle">${total}</text>
      <text class="ct-total-lbl" x="${cx}" y="${cy + 17}" text-anchor="middle">${this._esc(centerLabel)}</text>
    </svg>`;

    const legend = list.map((s) => {
      const pct = Math.round(s.value / total * 100);
      return `<div class="ct-legend-row" title="${this._esc(s.label)}: ${s.value} (${pct}%)">
        <span class="ct-swatch" style="background:${s.color}"></span>
        <span class="ct-legend-name">${this._esc(s.label)}</span>
        <span class="ct-legend-val">${s.value}</span>
        <span class="ct-legend-pct">${pct}%</span>
      </div>`;
    }).join('');

    return `<div class="chart-wrap ct-anim">${svg}<div class="ct-legend">${legend}</div></div>`;
  },

  _renderDailyBars(trend: GiornoTrend[]) {
    if (!trend?.length) return '<div class="ct-empty">Nessun dato disponibile.</div>';
    const totalSum = trend.reduce((s, d) => s + d.total, 0);
    if (totalSum === 0) {
      return '<div class="ct-empty">Nessun movimento registrato negli ultimi 14 giorni.</div>';
    }

    const W = 440, H = 196;
    const padL = 30, padR = 16, padT = 14, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    const rawMax = Math.max(...trend.map((d) => d.total), 1);
    // Massimo arrotondato: la griglia cade su valori leggibili, non su decimali
    const step = rawMax <= 4 ? 1 : rawMax <= 10 ? 2 : rawMax <= 25 ? 5 : rawMax <= 60 ? 10 : Math.ceil(rawMax / 4 / 25) * 25;
    const max = Math.ceil(rawMax / step) * step;
    const yOf = (v: number) => padT + plotH - (v / max) * plotH;
    const xOf = (i: number) => padL + (i * plotW) / Math.max(trend.length - 1, 1);

    // Griglia orizzontale
    let grid = '';
    for (let v = 0; v <= max; v += step) {
      const y = yOf(v);
      grid += `<line class="${v === 0 ? 'ct-grid-0' : 'ct-grid'}" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>
        <text class="ct-axis" x="${padL - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${v}</text>`;
    }

    const pts = trend.map((d, i) => ({ x: xOf(i), y: yOf(d.total) }));
    const line = this._smoothPath(pts);
    const area = `${line} L${pts[pts.length - 1]!.x.toFixed(2)},${yOf(0).toFixed(2)} L${pts[0]!.x.toFixed(2)},${yOf(0).toFixed(2)} Z`;

    const lastIdx = trend.length - 1;
    let xLabels = '', dots = '';
    trend.forEach((d, i) => {
      const isToday = i === lastIdx;
      if ((lastIdx - i) % 2 === 0) {
        const anchor = isToday ? 'end' : i === 0 ? 'start' : 'middle';
        xLabels += `<text class="ct-axis${isToday ? ' ct-axis-now' : ''}" x="${xOf(i).toFixed(1)}" y="${H - 10}" text-anchor="${anchor}">${this._esc(d.label)}</text>`;
      }
      const tip = `${d.label}: ${d.total} movimenti · ${d.picks} prelievi${isToday ? ' · oggi' : ''}`;
      dots += `<circle class="ct-hit" cx="${pts[i]!.x.toFixed(1)}" cy="${pts[i]!.y.toFixed(1)}" r="11"><title>${this._esc(tip)}</title></circle>`;
      if (isToday || d.total === Math.max(...trend.map((t) => t.total))) {
        dots += `<circle class="${isToday ? 'ct-dot-now' : 'ct-dot'}" cx="${pts[i]!.x.toFixed(1)}" cy="${pts[i]!.y.toFixed(1)}" r="4"/>`;
      }
    });

    const avg = (totalSum / trend.length).toFixed(1);
    const peak = trend.reduce((m, d) => (d.total > m.total ? d : m), trend[0]!);

    return `<div class="chart-wrap ct-anim">
      <svg class="chart chart--area" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Andamento dei movimenti negli ultimi 14 giorni: ${totalSum} movimenti totali, media ${avg} al giorno, picco di ${peak.total} il ${this._esc(peak.label)}">
        <defs>
          <linearGradient id="ctAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   style="stop-color:var(--md-sys-color-primary);stop-opacity:0.26"/>
            <stop offset="100%" style="stop-color:var(--md-sys-color-primary);stop-opacity:0.02"/>
          </linearGradient>
        </defs>
        ${grid}
        <path class="ct-area" d="${area}" style="fill:url(#ctAreaGrad)"/>
        <path class="ct-line" d="${line}"/>
        ${dots}
        ${xLabels}
      </svg>
      <div class="ct-summary">
        <span>Totale <strong>${totalSum}</strong> mov.</span>
        <span>Media <strong>${avg}</strong>/giorno</span>
        <span>Picco <strong>${peak.total}</strong> il ${this._esc(peak.label)}</span>
      </div>
    </div>`;
  },

  _renderTypeCounts(counts: Record<string, number>, total: number) {
    if (!total) return '<div class="ct-empty">Nessun movimento registrato.</div>';
    const segments = Object.entries(counts)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        label: MOV_LABELS[type as keyof typeof MOV_LABELS] || type,
        value: count,
        color: this._movColor(type)
      }));
    return this._svgDonut(segments, {
      centerLabel: 'MOVIMENTI',
      ariaLabel: `Ripartizione di ${total} movimenti per tipo`
    });
  },

  _renderSiteOccupancy(sites) {
    const cells = (sites as Sito[]).map((site) => {
      const st = Store.getSiteStats(site.id);
      const pct = st.total ? Math.round(st.occupied / st.total * 100) : 0;
      // Soglia cromatica: oltre l'85% il magazzino e' prossimo alla saturazione
      const color = pct >= 85 ? 'var(--md-sys-color-error)'
                  : pct >= 65 ? 'var(--md-ext-warning)'
                  : 'var(--md-ext-success)';
      const size = 76, thick = 9, r = (size - thick) / 2 - 1;
      const circ = 2 * Math.PI * r;
      const len = (pct / 100) * circ;
      const label = `${site.name}: ${pct}% occupato, ${st.occupied} di ${st.total} ubicazioni`;
      return `<article class="ct-gauge-cell" tabindex="0" role="button"
          title="${this._esc(label)} · ${st.blocked} bloccate · ${st.reserved} riservate"
          onclick="App.currentSite='${this._esc(site.id)}';App.switchView('map')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.currentSite='${this._esc(site.id)}';App.switchView('map')}">
        <svg class="chart" viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px" role="img" aria-label="${this._esc(label)}">
          <g transform="rotate(-90 ${size / 2} ${size / 2})">
            <circle class="ct-track" cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(2)}" style="stroke-width:${thick}"/>
            <circle cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(2)}"
              style="fill:none;stroke:${color};stroke-width:${thick};stroke-linecap:round"
              stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"/>
          </g>
          <text class="ct-gauge" x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="middle">${pct}%</text>
        </svg>
        <span class="ct-gauge-name">${this._esc(site.name)}</span>
        <span class="ct-gauge-sub">${st.occupied}/${st.total} ubic.</span>
      </article>`;
    }).join('');
    return `<div class="ct-gauge-grid ct-anim">${cells}</div>`;
  },

  _renderTopArticles(topArticles) {
    if (!topArticles?.length) return '<div class="ct-empty">Nessun movimento registrato.</div>';
    const max = Math.max(...(topArticles as ArticoloTop[]).map((a) => a.count), 1);
    const rows = (topArticles as ArticoloTop[]).map((art, i) => {
      const pct = Math.round(art.count / max * 100);
      const desc = Store.getArticle(art.code)?.description || '';
      const tip = desc ? `${art.code} — ${desc}: ${art.count} movimenti` : `${art.code}: ${art.count} movimenti`;
      return `<div class="ct-bar-row" title="${this._esc(tip)}">
        <div class="ct-bar-head">
          <span class="ct-bar-rank">${i + 1}</span>
          <span class="mono truncate flex-[1_1_auto] font-bold text-sx-text">${this._esc(art.code)}</span>
          <span class="ct-legend-val whitespace-nowrap">${art.count} <span class="font-normal text-sx-text-secondary">mov.</span></span>
        </div>
        <div class="ct-bar-track"><div class="ct-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
    return `<div class="chart-wrap ct-anim">${rows}</div>`;
  },

  /* KPI card "DDT Pendenti" con conteggio totale e breakdown urgenti.
     Rosso se ci sono scaduti, arancio se urgenti, neutro altrimenti. */
  _renderKpiPendingOutbound() {
    const allPending = [...Store.getPendingOutbound('RES'), ...Store.getPendingOutbound('SHIP')];
    const total = allPending.length;
    if (total === 0) {
      return `<div class="kpi-card">
        <div class="kpi-label">DDT Pendenti</div>
        <div class="kpi-value">0</div>
        <div class="kpi-sub">Nessun documento aperto</div>
      </div>`;
    }
    // Categorizza per urgenza
    let overdue = 0, today = 0, tomorrow = 0, soon = 0, ok = 0, none = 0;
    for (const d of allPending) {
      const lvl = pickupAlertStatus(d).level;
      if (lvl === 'overdue') overdue++;
      else if (lvl === 'today') today++;
      else if (lvl === 'tomorrow') tomorrow++;
      else if (lvl === 'soon') soon++;
      else if (lvl === 'ok') ok++;
      else none++;
    }
    // Determina classe in base ad urgenza
    let cls = '';
    if (overdue > 0 || today > 0) cls = 'k-danger';
    else if (tomorrow > 0 || soon > 0) cls = 'k-warning';
    else if (none > 0 && ok === 0) cls = '';
    // Composizione sub-label sintetica
    const subParts = [];
    if (overdue > 0) subParts.push(`<span class="text-sx-danger font-bold">${this._ico('alert-triangle')} ${overdue} scaduti</span>`);
    if (today > 0) subParts.push(`<span class="text-sx-danger font-bold">${today} oggi</span>`);
    if (tomorrow > 0) subParts.push(`<span class="text-sx-warning font-semibold">${tomorrow} domani</span>`);
    if (soon > 0) subParts.push(`<span class="text-sx-warning">${soon} a breve</span>`);
    if (none > 0) subParts.push(`<span class="text-sx-text-muted">${none} senza data</span>`);
    if (subParts.length === 0 && ok > 0) subParts.push(`<span class="text-sx-success">${ok} programmati</span>`);
    const sub = subParts.join(' · ') || `${total} aperti`;
    return `<div class="kpi-card ${cls} cursor-pointer" onclick="App.switchView('movimenta');setTimeout(()=>App.startMov('returns'),50)" title="Vai a Resi/Spedizioni">
      <div class="kpi-label">${this._ico('clipboard-text')} DDT Pendenti Uscita</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-sub leading-stretta">${sub}</div>
    </div>`;
  },

  /* v2.0.1 — Deep-link a un DDT pendente: apre la tab Movimenta, il modulo
     corretto (Resi o Spedizioni) e scrolla al documento espandendolo. */
  _gotoPendingDoc(doc_id, kind) {
    this.switchView('movimenta');
    setTimeout(() => {
      this.startMov(kind === 'SHIP' ? 'shipping' : 'returns');
      setTimeout(() => {
        const det = document.querySelector(`details[data-doc-id="${doc_id}"]`);
        if (det) { (det as HTMLDetailsElement).open = true; det.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, 90);
    }, 50);
  },

  _renderIntegrityAlertsSection() {
    const broken = [...Store.getPendingOutbound('RES'), ...Store.getPendingOutbound('SHIP')]
      .map(doc => ({ doc, integrity: Store.checkPendingDocIntegrity(doc) }))
      .filter(x => !x.integrity.ok);
    if (!broken.length) return '';
    const rows = broken.map(({ doc, integrity }) => {
      const kindLabel = doc.kind === 'SHIP' ? 'Spedizione' : 'Reso';
      const detail = integrity.issues
        .map(i => `<div class="text-label-small text-sx-danger pl-9">• ${this._esc(i.message)}</div>`)
        .join('');
      return `<div class="py-4 px-5.5 border-b border-b-sx-border">
        <div class="flex justify-between items-center gap-5 flex-wrap">
          <span class="text-body-small"><strong>DDT ${this._esc(doc.ddt_num)}</strong>
            <span class="text-sx-text-muted">· ${kindLabel} · ${this._esc(doc.destination)}</span>
            <span class="badge bg-sx-danger-soft text-sx-danger border-sx-danger ml-3">${this._ico('alert-triangle')} ${integrity.issues.length}</span>
          </span>
          <button class="btn btn-sm" onclick="App._gotoPendingDoc('${this._esc(doc.doc_id)}','${this._esc(doc.kind)}')" title="Vai al DDT">→ Apri</button>
        </div>
        ${detail}
      </div>`;
    }).join('');
    return `<section class="card mb-6 border-l-[3px] border-l-sx-danger">
      <div class="card-title text-sx-danger">${this._ico('alert-triangle')} DDT non allineati alla giacenza (${broken.length})</div>
      <div class="text-label-small text-sx-text-secondary pt-0 px-5.5 pb-4">
        Documenti registrati le cui righe non trovano più riscontro in magazzino: la merce è stata spostata,
        prelevata o rettificata dopo la registrazione. Vanno modificati o annullati prima dell'evasione.
      </div>
      ${rows}
    </section>`;
  },

  _renderPickupAlertsSection() {
    const allPending = Store.getPendingOutbound();   // v3.0.0 [M3] — un elenco solo
    if (!allPending.length) return '';
    // Filtra solo quelli urgenti
    const urgent = allPending.filter(d => {
      const lvl = pickupAlertStatus(d).level;
      return lvl === 'overdue' || lvl === 'today' || lvl === 'tomorrow';
    });
    if (!urgent.length) return '';
    // Ordina per priorità
    urgent.sort((a, b) => {
      const sa = pickupAlertStatus(a).sortKey;
      const sb = pickupAlertStatus(b).sortKey;
      return sa - sb;
    });
    const rows = urgent.map(d => {
      const alert = pickupAlertStatus(d);
      // v3.0.0 [M3] — la natura del documento viene dalla causale
      const isRes = this._docIsReturn(d);
      const themeColor = isRes ? 'var(--sx-teal)' : 'var(--sx-orange)';
      const themeIcon = this._ico(isRes ? 'arrow-back-up' : 'truck');
      const totalColli = d.lines.reduce((s, l) => s + (l.qty || 1), 0);
      const targetLabel = 'Destinatario';
      return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.6rem;background:${alert.bg};border:1px solid ${alert.color};border-radius:var(--radius);margin-bottom:0.3rem">
        <div class="text-title-small">${themeIcon}</div>
        <div class="flex-1 min-w-0">
          <div style="font-size:var(--dash-fs-body);font-weight:700;color:${alert.color}">${this._esc(alert.shortLabel)} · DDT ${this._esc(d.ddt_num)}</div>
          <div class="text-label-small text-sx-text-secondary truncate">
            ${targetLabel}: <strong>${this._esc(d.destination)}</strong>${d.carrier ? ' · ' + this._esc(d.carrier) : ''} · ${d.lines.length} righe · ${totalColli} Coll.
          </div>
        </div>
        <div class="flex gap-3 shrink-0">
          <button class="btn btn-sm" style="background:${themeColor};color:#fff;border-color:${themeColor};font-weight:700" onclick="App.switchView('movimenta');setTimeout(()=>{App.startMov('shipping');setTimeout(()=>{const det=document.querySelector('details[data-doc-id=\\'${this._esc(d.doc_id)}\\']');if(det){det.open=true;det.scrollIntoView({behavior:'smooth',block:'center'});}},80);},50)" title="Vai al DDT">→ Apri</button>
          <button class="btn btn-sm" style="background:${themeColor};color:#fff;border-color:${themeColor};font-weight:700" onclick="App._evadiSpedizione('${this._esc(d.doc_id)}')" title="Evadi DDT">${this._ico('check')} EVADI</button>
          <button class="btn btn-sm btn-ghost" onclick="App._printDDT('${this._esc(d.doc_id)}')" title="Stampa">${this._ico('printer')}</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="card mb-10 border-l-[3px] border-l-sx-danger bg-sx-danger-soft">
      <div class="card-title text-sx-danger">${this._ico('bell')} DDT in Scadenza <span class="badge bg-sx-danger text-white border-sx-danger ml-4">${urgent.length}</span></div>
      <div class="text-label-small text-sx-text-secondary mb-5">Documenti pendenti il cui ritiro è scaduto, oggi o domani — verificare disponibilità giacenza e contattare vettore.</div>
      ${rows}
    </div>`;
  },
} satisfies Vista;
