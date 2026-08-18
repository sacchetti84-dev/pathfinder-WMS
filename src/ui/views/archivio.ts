import { type Vista, $ } from './vista';
import { Store } from '../../core/store';

/* LE QUATTRO SORGENTI RIDOTTE A UNA FORMA SOLA.

   DDT, verbali, cartellini e rapporti non hanno niente in comune nel
   database: ce l'hanno in questa tabella, ed è questa riga qui. */
type GenereArchivio = 'ddt' | 'disposal' | 'nc' | 'pick';

type RigaArchivio = {
  kind: GenereArchivio;
  ts: number;
  num: string;
  title: string;
  sub: string;
  stato: { lbl: string; cls: string };
  search: string;
  print: string;
};

export const VistaArchivio: Vista = {
  _arcType: 'all' as GenereArchivio | 'all',
  _arcText: '',
  _arcFrom: '',
  _arcTo: '',

  _ARC_KINDS: {
    ddt:      { label: 'DDT di uscita',    icon: '🚚' },
    disposal: { label: 'Verbali smalt.',   icon: '🗑️' },
    nc:       { label: 'Cartelli NC',      icon: '🚫' },
    pick:     { label: 'Report prelievo',  icon: '📋' }
  },

  /* Le quattro sorgenti ridotte a una forma sola. Ogni riga sa da dove
     viene, come si chiama e quale funzione la ristampa. */
  _archiveRows() {
    const rows: RigaArchivio[] = [];
    const esc = (v: unknown) => this._esc(String(v ?? ''));

    for (const d of Store.getAllOutbound()) {
      const colli = (d.lines || []).reduce((s, l) => s + (l.qty || 1), 0);
      const stato = d.status === 'pending' ? { lbl: 'Pendente', cls: 'badge-amber' }
                  : d.status === 'evaded'  ? { lbl: 'Evaso',    cls: 'badge-green' }
                  : { lbl: 'Annullato', cls: 'badge-muted' };
      rows.push({
        kind: 'ddt',
        ts: d.evaded_at || d.created_at || 0,
        num: d.ddt_num || d.doc_id,
        title: d.destination || '—',
        sub: `${(d.lines || []).length} righe · ${colli} Coll.${d.carrier ? ' · ' + d.carrier : ''}`,
        stato,
        search: `${d.ddt_num} ${d.doc_id} ${d.destination} ${d.carrier || ''} ${(d.lines || []).map(l => l.article_code + ' ' + l.lot_code).join(' ')}`,
        print: `App._printDDT('${esc(d.doc_id)}')`
      });
    }

    for (const v of Store.getDisposals()) {
      rows.push({
        kind: 'disposal',
        ts: v.created_at || 0,
        num: v.doc_id,
        title: `${v.article_code} · L:${v.lot_code}`,
        sub: `${v.qty} Coll. · ${v.reason || '—'}`,
        stato: { lbl: 'Emesso', cls: 'badge-green' },
        search: `${v.doc_id} ${v.article_code} ${v.lot_code} ${v.location_code} ${v.reason || ''} ${v.operator || ''}`,
        print: `App._printDisposal('${esc(v.doc_id)}')`
      });
    }

    for (const q of Store.getQuarantineHistory()) {
      rows.push({
        kind: 'nc',
        ts: q.created_at || 0,
        num: q.q_id,
        title: `${q.article_code} · L:${q.lot_code}`,
        sub: `${q.qty || 1} Coll.${q.partial ? ' (parziale)' : ''} · 📍 ${q.blocked_location} · ${q.reason || '—'}`,
        stato: q.status === 'active'
          ? { lbl: 'Attiva', cls: 'badge-amber' }
          : { lbl: 'Rilasciata', cls: 'badge-green' },
        search: `${q.q_id} ${q.article_code} ${q.lot_code} ${q.blocked_location} ${q.original_location} ${q.reason || ''} ${q.operator || ''}`,
        print: `App._printNCCard('${esc(q.q_id)}')`
      });
    }

    for (const p of Store.getPickReports()) {
      rows.push({
        kind: 'pick',
        ts: p.closed_at || p.ended_at || 0,
        num: p.odp_num || p.doc_id,
        title: p.odp_num ? `Ordine ${p.odp_num}` : 'Prelievo senza numero',
        sub: `${(p.rows || []).length} righe · ${p.operator || '—'}`,
        stato: { lbl: 'Chiuso', cls: 'badge-green' },
        search: `${p.doc_id} ${p.odp_num || ''} ${p.operator || ''} ${(p.rows || []).map((r) => r.article_code + ' ' + r.lot_code).join(' ')}`,
        print: `App._printPickArchive('${esc(p.doc_id)}')`
      });
    }

    return rows.sort((a, b) => b.ts - a.ts);
  },

  renderArchive() {
    const el = $('viewArchive');
    if (!el) return;

    /* `this` dentro una vista e' ancora `any` — lo diventera' in C2 — e
       quindi cio' che si legge da li' si nomina qui. */
    let rows: RigaArchivio[] = this._archiveRows();
    const generi = this._ARC_KINDS as Record<GenereArchivio, { label: string; icon: string }>;
    const totale = rows.length;

    if (this._arcType !== 'all') rows = rows.filter((r) => r.kind === this._arcType);
    const testo = this._arcText.trim().toUpperCase();
    if (testo) rows = rows.filter((r) => (r.search || '').toUpperCase().includes(testo));
    if (this._arcFrom) {
      const da = new Date(this._arcFrom + 'T00:00:00').getTime();
      rows = rows.filter((r) => r.ts >= da);
    }
    if (this._arcTo) {
      const a = new Date(this._arcTo + 'T23:59:59').getTime();
      rows = rows.filter((r) => r.ts <= a);
    }

    const chip = (id: string, lbl: string) => `<button class="config-tab ${this._arcType === id ? 'active' : ''}"
      onclick="App._arcType='${id}';App.renderArchive()">${lbl}</button>`;

    const conteggi: Record<string, number> = {};
    for (const r of this._archiveRows()) conteggi[r.kind] = (conteggi[r.kind] || 0) + 1;

    el.innerHTML = `
      <h1 class="text-title-large text-sx-primary font-bold mb-3.5">🗂 Archivio documenti</h1>
      <p class="text-body-small text-sx-text-secondary mb-7.5 leading-[1.55]">
        Ogni documento emesso dall'applicativo, aperto o chiuso, ristampabile per tutta la durata di conservazione.
        La ristampa rilegge il documento archiviato: il foglio esce identico a quello del giorno di emissione.
      </p>

      <div class="config-tabs mb-6">
        ${chip('all', `Tutti (${totale})`)}
        ${Object.entries(generi).map(([id, k]) =>
          chip(id, `${k.icon} ${k.label} (${conteggi[id] || 0})`)).join('')}
      </div>

      <div class="config-card mb-6">
        <div class="flex gap-6 flex-wrap items-end">
          <div class="form-group flex-1 min-w-[240px] mb-0">
            <label>Cerca</label>
            <input class="input" id="arcText" placeholder="Numero, articolo, lotto, destinatario, ubicazione…"
              value="${this._esc(this._arcText)}" oninput="App._arcText=this.value;App._arcRedraw()">
          </div>
          <div class="form-group w-[160px] mb-0">
            <label>Dal</label>
            <input class="input" type="date" id="arcFrom" value="${this._esc(this._arcFrom)}"
              onchange="App._arcFrom=this.value;App.renderArchive()">
          </div>
          <div class="form-group w-[160px] mb-0">
            <label>Al</label>
            <input class="input" type="date" id="arcTo" value="${this._esc(this._arcTo)}"
              onchange="App._arcTo=this.value;App.renderArchive()">
          </div>
          <button class="btn" onclick="App._arcReset()">✕ Azzera filtri</button>
        </div>
      </div>

      <div class="config-card">
        <h3>${rows.length} document${rows.length === 1 ? 'o' : 'i'}${rows.length !== totale ? ` su ${totale}` : ''}</h3>
        ${rows.length ? `<div class="overflow-x-auto">
          <table class="sx-table">
            <thead><tr>
              <th class="w-[130px]">Data</th>
              <th class="w-[110px]">Tipo</th>
              <th class="w-[150px]">Numero</th>
              <th>Riferimento</th>
              <th class="w-[105px]">Stato</th>
              <th class="w-[60px]"></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>
                <td class="mono whitespace-nowrap">${r.ts ? this._fmtDateTime(r.ts) : '—'}</td>
                <td><span title="${this._esc(generi[r.kind].label)}">${generi[r.kind].icon} ${this._esc(generi[r.kind].label)}</span></td>
                <td class="mono font-semibold">${this._esc(r.num)}</td>
                <td>
                  <div class="font-semibold">${this._esc(r.title)}</div>
                  <div class="truncate text-label-small text-sx-text-muted">${this._esc(r.sub)}</div>
                </td>
                <td><span class="badge ${r.stato.cls}">${this._esc(r.stato.lbl)}</span></td>
                <td><button class="btn btn-sm btn-ghost" onclick="${r.print}" title="Ristampa">🖨</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<div class="ct-empty">Nessun documento corrisponde ai filtri.</div>`}
      </div>`;
  },

  _arcRedraw() {
    clearTimeout(this._arcTimer);
    this._arcTimer = setTimeout(() => {
      const attivo = document.activeElement?.id;
      const pos = $('arcText')?.selectionStart;
      this.renderArchive();
      if (attivo === 'arcText') {
        const campo = $('arcText');
        campo?.focus();
        if (pos != null) campo?.setSelectionRange(pos, pos);
      }
    }, 180);
  },

  _arcReset() {
    this._arcType = 'all'; this._arcText = ''; this._arcFrom = ''; this._arcTo = '';
    this.renderArchive();
  },

  _printPickArchive(doc_id) {
    const snap = Store.getPickReports().find(p => p.doc_id === doc_id);
    if (!snap) return this.toast('Report non trovato in archivio', 'error');
    this._emitPickReport(snap, { reprint: true });
  },
};
