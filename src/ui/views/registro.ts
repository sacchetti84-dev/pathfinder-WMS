import { type Vista, $ } from './vista';
import { LOG_RETENTION_DAYS, MOV, MOV_LABELS } from '../../core/costanti';
import { debounce, _h } from '../../core/utils';
import { Store } from '../../core/store';
import type { Movimento } from '../../types/entita';
import { ordina, alClic, segno, STATO_VUOTO } from '../../modules/tabella';
import type { Colonna, Stato } from '../../modules/tabella';

export const VistaRegistro = {
  /* Registro movimenti completo */
  _regRange: null as { from: string; to: string } | null,

  _regDefaultRange() {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
  },

  _renderMovRegistry() {
    if (!this._regRange) this._regRange = this._regDefaultRange();
    const info = Store.getMovLogWindowInfo();
    const r = this._regRange;
    return `<div>
      <div class="flex items-center justify-between mb-7.5 flex-wrap gap-5">
        <div>
          <h1 class="text-title-large text-sx-primary font-bold">📋 Registro Movimentazioni</h1>
          <p class="text-body-small text-sx-text-muted">${info.total.toLocaleString('it-IT')} movimentazioni in archivio · conservazione ${Math.round(LOG_RETENTION_DAYS/365)} anni</p>
        </div>
        <div class="flex gap-4 items-center flex-wrap">
          <button class="btn btn-sm btn-accent" onclick="App.exportMovLogExcel()">📊 Excel Movimenti</button>
          <button class="btn btn-sm btn-accent" onclick="App.exportGiacenzeExcel()" title="Export Giacenze per Area">📦 Excel Giacenze</button>
          <button class="btn btn-sm" onclick="App._showRegistry=false;App.renderDashboard()">← Dashboard</button>
        </div>
      </div>
      <div class="card mb-6 py-6 px-7.5">
        <div class="flex gap-5 items-end flex-wrap">
          <div class="form-group m-0">
            <label class="text-label-small">Dal</label>
            <input class="input w-[150px]" type="date" id="regFrom" value="${r.from}" onchange="App._filterRegistry()">
          </div>
          <div class="form-group m-0">
            <label class="text-label-small">Al</label>
            <input class="input w-[150px]" type="date" id="regTo" value="${r.to}" onchange="App._filterRegistry()">
          </div>
          <div class="form-group m-0 flex-[1_1_200px]">
            <label class="text-label-small">Filtro testo</label>
            <input class="input" id="regFilterText" placeholder="🔍 Articolo, lotto, ubicazione, operatore, documento…" oninput="App._filterRegistryDebounced()">
          </div>
          <div class="form-group m-0">
            <label class="text-label-small">Tipo</label>
            <select class="select w-[170px]" id="regFilterType" onchange="App._filterRegistry()">
              <option value="">Tutti i tipi</option>
              ${Object.entries(MOV_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-sm" onclick="App._regQuickRange(30)">30 gg</button>
            <button class="btn btn-sm" onclick="App._regQuickRange(365)">1 anno</button>
            <button class="btn btn-sm" onclick="App._regQuickRange(0)">Tutto</button>
          </div>
        </div>
        <div class="text-label-small text-sx-text-muted mt-4" id="regStatus">Interrogazione in corso…</div>
      </div>
      <div class="card p-0">
        <div id="regTableWrap"><div class="empty-state p-20"><p>Interrogazione dell’archivio…</p></div></div>
      </div>
    </div>`;
  },

  _regQuickRange(days: number) {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const to = new Date();
    const from = days === 0 ? new Date('2020-01-01T00:00:00') : new Date(to.getTime() - days * 86400000);
    this._regRange = { from: iso(from), to: iso(to) };
    const f = $('regFrom'); if (f) f.value = this._regRange.from;
    const t = $('regTo');   if (t) t.value = this._regRange.to;
    this._filterRegistry();
  },

  /* 2.1 — §3: anche il registro dei movimenti si ordina.

     I filtri c'erano — date, tipo, testo — e l'ordine no: usciva sempre
     dal più recente, che è il predefinito giusto e resta tale. Quello che
     mancava è mettere in fila per articolo o per operatore le duecento
     righe che i filtri hanno già scelto.

     L'ORDINAMENTO AGISCE SULLE RIGHE ESTRATTE, non sull'archivio. `limit:
     200` sceglie le duecento più recenti nell'intervallo, e ordinarle per
     operatore riordina quelle duecento: non va a prendere le prime
     duecento in ordine di operatore dentro sei anni di registro. È scritto
     accanto al conteggio, perché è la differenza fra «le prime duecento» e
     «duecento a caso». */
  _movOrdine: STATO_VUOTO,

  _movColonne(): Colonna<Movimento>[] {
    return [
      { campo: 'type', titolo: 'Tipo', valore: (m) => MOV_LABELS[m.type] || m.type },
      { campo: 'article_code', titolo: 'Articolo' },
      { campo: 'article_description', titolo: 'Descrizione' },
      { campo: 'lot_code', titolo: 'Lotto' },
      { campo: 'location_code', titolo: 'Ubicazione' },
      { campo: 'qty_delta', titolo: 'Coll.', tipo: 'numero' },
      { campo: 'user', titolo: 'Operatore' },
      { campo: 'doc_ref', titolo: 'Doc.' },
      { campo: 'ts', titolo: 'Data/Ora', tipo: 'numero' },
    ];
  },

  _movOrdina(campo) {
    this._movOrdine = alClic(this._movOrdine, campo);
    this._filterRegistry();
  },

  _buildRegistryTable(log: Movimento[], maxRows = 200, totale: number | null = null) {
    if (!log.length) return '<div class="empty-state p-20"><p>Nessuna movimentazione nell’intervallo selezionato</p></div>';
    const tot = totale === null ? log.length : totale;
    const th = (campo: string, titolo: string, classe = '') =>
      `<th class="sx-th-ord ${classe}" onclick="App._movOrdina('${campo}')" title="Ordina per ${titolo}">${titolo}${segno(this._movOrdine as Stato, campo)}</th>`;
    let html = `<div class="overflow-x-auto"><table class="sx-table"><thead><tr><th class="w-[40px]">#</th>${th('type', 'Tipo')}${th('article_code', 'Articolo')}${th('article_description', 'Descrizione')}${th('lot_code', 'Lotto')}${th('location_code', 'Ubicazione')}${th('qty_delta', 'Coll.', 'w-[60px] text-center')}${th('user', 'Operatore')}${th('doc_ref', 'Doc.')}${th('ts', 'Data/Ora')}</tr></thead><tbody id="regTbody"></tbody></table></div>`;
    if (tot > maxRows) html += `<div class="text-center p-6 text-sx-text-muted text-body-small bg-sx-bg-alt border-t border-t-sx-border">Prime ${maxRows} righe di ${tot.toLocaleString('it-IT')}. Restringi le date o esporta in Excel.</div>`;
    return html;
  },

  /* Popola il tbody #regTbody con righe costruite via DOM API (no innerHTML).
     Va chiamato DOPO che il chrome HTML è già stato inserito nel DOM. */
  _populateRegistryRows(log: Movimento[], maxRows = 200) {
    const tbody = $('regTbody');
    if (!tbody) return;
    // v2.0 — aggiunti colori per EDIT, RET, SHIP
    const colors = {
      IN:'var(--sx-success)', OUT:'var(--sx-danger)', PICK:'var(--sx-warning)',
      MOVE:'var(--sx-accent)', REPOS:'var(--sx-teal)',
      'FIX+':'var(--sx-purple)', 'FIX-':'var(--sx-warning)',
      QUAR:'var(--sx-purple)', QREL:'var(--sx-success)',
      EDIT:'var(--sx-primary-light)', RET:'var(--sx-teal)', SHIP:'var(--sx-orange)'
    };
    const shown = log.slice(0, maxRows);
    const frag = document.createDocumentFragment();
    shown.forEach((m, i) => {
      const lbl = MOV_LABELS[m.type] || m.type;
      /* La tavolozza copre i movimenti che si vedono in registro; gli altri —
         `SAMPLE`, `PURGE`, `PINRESET` — escono grigi, come prima. */
      const color = (colors as Partial<Record<Movimento['type'], string>>)[m.type] || 'var(--sx-text-muted)';
      const ts = m.ts ? new Date(m.ts) : null;
      const locStr = (m.type === 'MOVE' || m.type === 'QUAR') && m.dest_location ? `${m.location_code} → ${m.dest_location}` : (m.location_code || '');
      const tsStr = ts ? ts.toLocaleDateString('it-IT') + ' ' + ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
      // v1.7.0 — cella qty: mostra delta firmato e saldo dopo
      let qtyCellText = '';
      let qtyCellColor = 'var(--sx-text-muted)';
      if (typeof m.qty_delta === 'number' && m.qty_delta !== null) {
        const sign = m.qty_delta > 0 ? '+' : '';
        qtyCellText = `${sign}${m.qty_delta}`;
        if (m.qty_delta > 0) qtyCellColor = 'var(--sx-success)';
        else if (m.qty_delta < 0) qtyCellColor = 'var(--sx-danger)';
        if (typeof m.qty_after === 'number') qtyCellText += ` (${m.qty_after})`;
      } else {
        qtyCellText = '—';  // movimento storico pre-v1.7.0
      }
      const tr = _h('tr', {}, [
        _h('td', { class: 'td-center mono', style: { color: 'var(--sx-text-muted)' } }, [String(i+1)]),
        _h('td', { style: { whiteSpace: 'nowrap' } }, [
          _h('span', { style: { color, fontWeight: '600' } }, [lbl]),
          /* 1.5 — LA RISTAMPA DEL VERBALE, dove il campionamento è scritto.
             Il verbale nasce da sé alla conferma (D17); qui c'è la seconda
             copia, per il campione che ne ha perso una. Solo sulle righe
             SAMPLE, e solo se il movimento ha un identificativo — quelli
             scritti prima della 1.5 ce l'hanno lo stesso. */
          ...(m.type === MOV.SAMPLE && typeof m._id === 'number' ? [
            _h('button', {
              class: 'btn btn-sm',
              style: { marginLeft: '0.35rem', padding: '0 0.3rem' },
              title: 'Ristampa il verbale di campionamento',
              onclick: () => this._ristampaVerbaleCampione(m._id),
            }, ['🖨'])
          ] : [])
        ]),
        _h('td', {}, [
          _h('span', { class: 'mono', style: { fontWeight: '700', color: 'var(--sx-primary)' } }, [m.article_code || ''])
        ]),
        _h('td', { class: 'truncate', style: { maxWidth: '220px' } }, [m.article_description || '']),
        _h('td', { class: 'mono', style: { fontSize: '0.74rem' } }, [m.lot_code || '']),
        _h('td', { class: 'mono', style: { fontSize: '0.74rem' } }, [locStr]),
        _h('td', { class: 'mono td-center', style: { fontSize: '0.74rem', fontWeight: '700', color: qtyCellColor } }, [qtyCellText]),
        _h('td', { style: { fontSize: '0.74rem' } }, [m.user || '']),
        _h('td', { class: 'mono', style: { fontSize: '0.72rem' } }, [m.doc_ref || '']),
        _h('td', { style: { fontSize: '0.7rem', whiteSpace: 'nowrap', color: 'var(--sx-text-muted)' } }, [tsStr])
      ]);
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  },

  _filterRegistryDebounced() {
    if (!this._regDebounce) this._regDebounce = debounce(() => this._filterRegistry(), 250);
    this._regDebounce();
  },

  async _filterRegistry() {
    const wrap = $('regTableWrap');
    const status = $('regStatus');
    if (!wrap) return;
    const text = $('regFilterText')?.value || '';
    const type = $('regFilterType')?.value || '';
    const fromStr = $('regFrom')?.value || this._regRange?.from;
    const toStr   = $('regTo')?.value   || this._regRange?.to;
    this._regRange = { from: fromStr, to: toStr };

    const from = fromStr ? new Date(fromStr + 'T00:00:00').getTime() : null;
    const to   = toStr   ? new Date(toStr   + 'T23:59:59.999').getTime() : null;
    if (from !== null && to !== null && from > to) {
      if (status) status.textContent = 'Intervallo non valido: la data iniziale è successiva a quella finale.';
      return;
    }

    if (status) status.textContent = 'Interrogazione in corso…';
    const t0 = performance.now();
    try {
      const res = await Store.queryMovements({ from, to, type, text, limit: 200 });
      /* Si ordinano le righe ESTRATTE. Vedi il commento su
         `_buildRegistryTable`: la differenza è scritta accanto al conteggio
         perché è quella fra «le prime duecento» e «duecento a caso». */
      const righe = ordina(res.rows, this._movColonne(), this._movOrdine as Stato);
      wrap.innerHTML = this._buildRegistryTable(righe, 200, res.matched);
      this._populateRegistryRows(righe, 200);
      if (status) {
        const ms = Math.round(performance.now() - t0);
        const nota = this._movOrdine.campo
          ? ' · ordinamento applicato alle righe estratte, non all’archivio'
          : '';
        status.textContent = `${res.matched.toLocaleString('it-IT')} movimenti corrispondenti su ${res.scanned.toLocaleString('it-IT')} esaminati nell’intervallo · ${ms} ms${nota}`;
      }
    } catch (err) {
      console.error('[WM] registro:', err);
      wrap.innerHTML = '<div class="empty-state p-20"><p>Errore nella lettura dell’archivio</p></div>';
      if (status) status.textContent = `Errore: ${(err as Error).message || 'sconosciuto'}`;
    }
  },
} satisfies Vista;
