import { type Vista, $ } from './vista';
import { LOG_RETENTION_DAYS, MOV, MOV_LABELS } from '../../core/costanti';
import { debounce, _h } from '../../core/utils';
import { Store } from '../../core/store';

export const VistaRegistro: Vista = {
  /* Registro movimenti completo */
  _regRange: null,     // { from: 'AAAA-MM-GG', to: 'AAAA-MM-GG' }

  _regDefaultRange() {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86400000);
    const iso = (d: any) => d.toISOString().slice(0, 10);
    return { from: iso(from), to: iso(to) };
  },

  _renderMovRegistry() {
    if (!this._regRange) this._regRange = this._regDefaultRange();
    const info = Store.getMovLogWindowInfo();
    const r = this._regRange;
    return `<div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
        <div>
          <h1 style="font-size: var(--md-sys-typescale-title-large-size);color:var(--sx-primary);font-weight:700">📋 Registro Movimentazioni</h1>
          <p style="font-size: var(--md-sys-typescale-body-small-size);color:var(--sx-text-muted)">${info.total.toLocaleString('it-IT')} movimentazioni in archivio · conservazione ${Math.round(LOG_RETENTION_DAYS/365)} anni</p>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap">
          <button class="btn btn-sm btn-accent" onclick="App.exportMovLogExcel()">📊 Excel Movimenti</button>
          <button class="btn btn-sm btn-accent" onclick="App.exportGiacenzeExcel()" title="Export Giacenze per Area">📦 Excel Giacenze</button>
          <button class="btn btn-sm" onclick="App._showRegistry=false;App.renderDashboard()">← Dashboard</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:0.6rem;padding:0.6rem 0.75rem">
        <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="margin:0">
            <label style="font-size: var(--md-sys-typescale-label-small-size)">Dal</label>
            <input class="input" type="date" id="regFrom" value="${r.from}" style="width:150px" onchange="App._filterRegistry()">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size: var(--md-sys-typescale-label-small-size)">Al</label>
            <input class="input" type="date" id="regTo" value="${r.to}" style="width:150px" onchange="App._filterRegistry()">
          </div>
          <div class="form-group" style="margin:0;flex:1 1 200px">
            <label style="font-size: var(--md-sys-typescale-label-small-size)">Filtro testo</label>
            <input class="input" id="regFilterText" placeholder="🔍 Articolo, lotto, ubicazione, operatore, documento…" oninput="App._filterRegistryDebounced()">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size: var(--md-sys-typescale-label-small-size)">Tipo</label>
            <select class="select" id="regFilterType" style="width:170px" onchange="App._filterRegistry()">
              <option value="">Tutti i tipi</option>
              ${Object.entries(MOV_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:0.3rem">
            <button class="btn btn-sm" onclick="App._regQuickRange(30)">30 gg</button>
            <button class="btn btn-sm" onclick="App._regQuickRange(365)">1 anno</button>
            <button class="btn btn-sm" onclick="App._regQuickRange(0)">Tutto</button>
          </div>
        </div>
        <div id="regStatus" style="font-size: var(--md-sys-typescale-label-small-size);color:var(--sx-text-muted);margin-top:0.4rem">Interrogazione in corso…</div>
      </div>
      <div class="card" style="padding:0">
        <div id="regTableWrap"><div class="empty-state" style="padding:2rem"><p>Interrogazione dell’archivio…</p></div></div>
      </div>
    </div>`;
  },

  _regQuickRange(days) {
    const iso = (d: any) => d.toISOString().slice(0, 10);
    const to = new Date();
    const from = days === 0 ? new Date('2020-01-01T00:00:00') : new Date(to.getTime() - days * 86400000);
    this._regRange = { from: iso(from), to: iso(to) };
    const f = $('regFrom'); if (f) f.value = this._regRange.from;
    const t = $('regTo');   if (t) t.value = this._regRange.to;
    this._filterRegistry();
  },

  _buildRegistryTable(log, maxRows = 200, totale = null) {
    if (!log.length) return '<div class="empty-state" style="padding:2rem"><p>Nessuna movimentazione nell’intervallo selezionato</p></div>';
    const tot = totale === null ? log.length : totale;
    let html = '<div style="overflow-x:auto"><table class="sx-table"><thead><tr><th style="width:40px">#</th><th>Tipo</th><th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Ubicazione</th><th style="width:60px;text-align:center">Coll.</th><th>Operatore</th><th>Doc.</th><th>Data/Ora</th></tr></thead><tbody id="regTbody"></tbody></table></div>';
    if (tot > maxRows) html += `<div style="text-align:center;padding:0.6rem;color:var(--sx-text-muted);font-size: var(--md-sys-typescale-body-small-size);background:var(--sx-bg-alt);border-top:1px solid var(--sx-border)">Prime ${maxRows} righe di ${tot.toLocaleString('it-IT')}. Restringi le date o esporta in Excel.</div>`;
    return html;
  },

  /* Popola il tbody #regTbody con righe costruite via DOM API (no innerHTML).
     Va chiamato DOPO che il chrome HTML è già stato inserito nel DOM. */
  _populateRegistryRows(log, maxRows = 200) {
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
    shown.forEach((m: any, i: any) => {
      const lbl = (MOV_LABELS as any)[m.type] || m.type;
      const color = (colors as any)[m.type] || 'var(--sx-text-muted)';
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
      wrap.innerHTML = this._buildRegistryTable(res.rows, 200, res.matched);
      this._populateRegistryRows(res.rows, 200);
      if (status) {
        const ms = Math.round(performance.now() - t0);
        status.textContent = `${res.matched.toLocaleString('it-IT')} movimenti corrispondenti su ${res.scanned.toLocaleString('it-IT')} esaminati nell’intervallo · ${ms} ms`;
      }
    } catch (err: any) {
      console.error('[WM] registro:', err);
      wrap.innerHTML = '<div class="empty-state" style="padding:2rem"><p>Errore nella lettura dell’archivio</p></div>';
      if (status) status.textContent = `Errore: ${err.message || 'sconosciuto'}`;
    }
  },
};
