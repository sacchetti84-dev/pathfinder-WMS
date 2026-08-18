import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { PickRoute } from '../../modules/pickRoute.js';
import { Feedback } from '../feedback';

export const VistaRapportoPrelievo: Vista = {
  _PICK_REPORT_VER: '1.0',

  _fmtDurLong(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '—';
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  },
  _fmtClock(ts) {
    return ts ? new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
  },
  _fmtStamp(ts) {
    return ts ? new Date(ts).toLocaleString('it-IT',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  },
  _fmtDayShort(ts) {
    return ts ? new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '';
  },

  _pickDocId(prefix, odpNum, ts) {
    const core = String(odpNum || 'NA').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'NA';
    return `${prefix}-${core}-${ts.toString(36).toUpperCase().slice(-6)}`;
  },

  /* ─── NORMALIZZATORE A) sessione di prelievo guidato ─────────────── */
  _pickSnapFromSession(s, endTs = Date.now(), opt = {}) {
    const done    = s.stops.filter((x: any) => x.status === 'done');
    const missing = s.stops.filter((x: any) => x.status === 'missing');
    const pending = s.stops.filter((x: any) => x.status === 'pending');

    return {
      doc_id: this._pickDocId('PG', s.odp_num, endTs),
      kind: 'route',
      app_ver: this._PICK_REPORT_VER,
      partial: !!opt.partial,
      degraded: false,
      odp_num: s.odp_num || '',
      odp_article: s.odp_article || '',
      odp_article_desc: s.odp_article_desc || '',
      odp_lot: s.odp_lot || '',
      odp_qty: s.odp_qty || '',
      operator: s.operator || '',
      session_id: s.session_id || null,
      started_at: s.created_at || endTs,
      ended_at: endTs,
      closed_at: endTs,
      stops_total: s.stops.length,
      rows: done.map((x: any) => ({
        seq: x.seq,
        article_code: x.article_code,
        article_description: x.article_description || '',
        lot_code: x.lot_code,
        location_code: x.location_code,
        kg_required: x.kg_required,
        um: x.um || '',
        qty_picked: x.qty_picked || 0,
        done_at: x.done_at || null
      })),
      tail: [
        ...missing.map((x: any) => ({
          article_code: x.article_code, description: x.article_description || '',
          lot_code: x.lot_code, kg_required: x.kg_required, um: x.um || '',
          label: 'Non trovato dall’operatore',
          detail: `Ubicazione prevista ${x.location_code}. ${x.forced_note || ''}`.trim()
        })),
        ...pending.map((x: any) => ({
          article_code: x.article_code, description: x.article_description || '',
          lot_code: x.lot_code, kg_required: x.kg_required, um: x.um || '',
          label: 'Tappa non percorsa',
          detail: `Ubicazione prevista ${x.location_code}. Percorso chiuso prima della tappa.`
        })),
        ...(s.offroute || []).map((o: any) => ({
          article_code: o.article_code, description: o.description || '',
          lot_code: o.lot_code, kg_required: o.kg_required, um: o.um || '',
          label: (PickRoute.REASON_LABELS as any)[o.reason] || o.reason || 'Fuori percorso',
          detail: o.detail || ''
        }))
      ],
      notes: (s.notes || []).map((n: any) => ({
        article_code: n.article_code, lot_code: n.lot_code, location_code: n.location_code,
        label: (PickRoute.REASON_LABELS as any)[n.reason] || n.reason || '', detail: n.detail || ''
      })),
      warnings: [...(s.warnings || [])]
    };
  },

  /* ─── NORMALIZZATORE B) flusso a carrello ────────────────────────── */
  _pickSnapFromCart(cart, meta = {}) {
    const endTs = meta.ended_at || Date.now();
    return {
      doc_id: this._pickDocId('PP', meta.odp_num, endTs),
      kind: 'cart',
      app_ver: this._PICK_REPORT_VER,
      partial: false,
      degraded: false,
      odp_num: meta.odp_num || '',
      odp_article: '', odp_article_desc: '', odp_lot: '', odp_qty: '',
      operator: meta.operator || '',
      session_id: null,
      started_at: meta.started_at || endTs,
      ended_at: endTs,
      closed_at: endTs,
      stops_total: cart.length,
      rows: cart.map((it: any) => ({
        seq: null,
        article_code: it.article_code,
        article_description: it.article_description || '',
        lot_code: it.lot_code,
        location_code: it.location_code,
        kg_required: null,
        um: '',
        qty_picked: it.qty_pick || Math.abs(it._qty_delta || 0) || 1,
        done_at: null
      })),
      tail: [], notes: [], warnings: []
    };
  },

  /* ─── NORMALIZZATORE C) registro movimenti (solo ripiego) ────────── */
  _pickSnapFromLog(movs, ref) {
    const start = movs[0].ts, end = movs[movs.length - 1].ts;
    const notes = [...new Set(movs.map((m: any) => m.notes).filter(Boolean))];
    return {
      doc_id: this._pickDocId('PP', ref, end),
      kind: 'log',
      app_ver: this._PICK_REPORT_VER,
      partial: false,
      degraded: true,
      odp_num: ref || '',
      odp_article: '', odp_article_desc: '', odp_lot: '', odp_qty: '',
      operator: [...new Set(movs.map((m: any) => m.user).filter(Boolean))].join(', '),
      session_id: null,
      started_at: start,
      ended_at: end,
      closed_at: end,
      stops_total: movs.length,
      rows: movs.map((m: any) => ({
        seq: null,
        article_code: m.article_code || '',
        article_description: m.article_description || '',
        lot_code: m.lot_code || '',
        location_code: m.location_code || '',
        kg_required: null,
        um: '',
        qty_picked: m.qty_delta != null ? Math.abs(m.qty_delta) : 1,
        done_at: m.ts
      })),
      tail: [], notes: [],
      warnings: notes.map(n => `Nota registrata sul movimento: ${n}`)
    };
  },

  /* ─── TEMPLATE UNICO ─────────────────────────────────────────────── */
  _buildPickReportHTML(snap, opt = {}) {
    const E = (v: any) => this._esc(v == null ? '' : v);
    const reprint = !!opt.reprint;
    const printTs = opt.printed_at || Date.now();

    /* ── Tempi. Tutto discende da started_at/ended_at dello snapshot,
          congelati alla chiusura: identici a ogni ristampa. ── */
    const nRows   = snap.rows.length;
    const durSec  = Math.max(0, Math.round(((snap.ended_at || 0) - (snap.started_at || 0)) / 1000));
    const avgSec  = nRows > 0 ? durSec / nRows : null;
    const sameDay = this._fmtDayShort(snap.started_at) === this._fmtDayShort(snap.ended_at);

    const totColli   = snap.rows.reduce((a: any, r: any) => a + (r.qty_picked || 0), 0);
    const uniqueLocs = new Set(snap.rows.map((r: any) => r.location_code).filter(Boolean)).size;

    const kgCell = (kg: any, um: any) => {
      if (kg == null || kg === '') return '<span class="text-[#999]">—</span>';
      const u = String(um || '').trim().toUpperCase();
      const suffix = (u && u !== 'KG') ? ` <span style="font-size:7pt;color:#666">${E(um)}</span>` : '';
      return `${E(this._fmtKg(kg))}${suffix}`;
    };

    const rowsHTML = snap.rows.map((r: any, i: any) => `<tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-num">${r.seq != null ? E(r.seq) : '<span class="text-[#999]">—</span>'}</td>
      <td class="td-code">${E(r.article_code || '—')}</td>
      <td>${E(r.article_description || '—')}${this._avvisiRigaStampa(r.article_code)}</td>
      <td class="td-lot">${E(r.lot_code || '—')}</td>
      <td class="td-loc">${E(r.location_code || '—')}</td>
      <td class="td-num">${kgCell(r.kg_required, r.um)}</td>
      <td class="td-num font-bold">${E(r.qty_picked)}</td>
    </tr>`).join('');

    const tailHTML = snap.tail.map((t: any, i: any) => `<tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-code">${E(t.article_code || '—')}</td>
      <td>${E(t.description || '—')}${this._avvisiRigaStampa(t.article_code)}</td>
      <td class="td-lot">${E(t.lot_code || '—')}</td>
      <td class="td-num">${kgCell(t.kg_required, t.um)}</td>
      <td class="font-semibold">${E(t.label)}</td>
      <td style="font-size:7.5pt">${E(t.detail)}</td>
      <td class="pr-check-col"><span class="pr-box"></span></td>
    </tr>`).join('');

    const notesHTML = snap.notes.map((n: any, i: any) => `<tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-code">${E(n.article_code || '—')}</td>
      <td class="td-lot">${E(n.lot_code || '—')}</td>
      <td class="td-loc">${E(n.location_code || '—')}</td>
      <td>${E(n.label)}${n.detail ? ' — ' + E(n.detail) : ''}</td>
    </tr>`).join('');

    const bands = [
      reprint ? `<div class="pr-reprint">
        <strong>RISTAMPA — COPIA CONFORME</strong>
        Copia del report emesso il ${E(this._fmtStamp(snap.closed_at))}, ristampata il ${E(this._fmtStamp(printTs))}.
        Dati, tempi e identificativo del documento sono quelli dell’originale, che questa copia non sostituisce.
      </div>` : '',
      snap.degraded ? `<div class="pr-reprint pr-reprint-warn">
        <strong>DOCUMENTO RICOSTRUITO DAL REGISTRO MOVIMENTI</strong>
        Ordine prelevato con una versione precedente dell’applicativo: il report originale non esiste.
        Numero di tappa, kg d’ordine, righe fuori percorso e segnalazioni NON sono disponibili.
        I tempi indicati sono quelli del primo e dell’ultimo movimento registrato.
      </div>` : '',
      snap.partial ? `<div class="pr-reprint pr-reprint-warn">
        <strong>REPORT PARZIALE — PRELIEVO NON CONCLUSO</strong>
        ${snap.kind === 'cart'
          ? 'Contenuto del carrello all’ora indicata: i prelievi NON sono ancora stati confermati e la giacenza non è stata scaricata.'
          : 'Fotografia dello stato di avanzamento all’ora indicata: il percorso è ancora aperto.'}
        Il report definitivo viene emesso alla conferma del prelievo e non è questo foglio.
      </div>` : ''
    ].join('');

    /* Blocco d'identificazione: l'ordine di produzione. Sta nella fascia
       di testata, dove ogni documento mette cio' che lo identifica. */
    const headExtra = `<div class="doc-idblock doc-idblock--3">
        ${this._docCell('N° ordine produzione', snap.odp_num)}
        ${this._docCell('Lotto produzione', snap.odp_lot)}
        ${this._docCell('Quantità ordine', snap.odp_qty)}
        ${this._docCell('Articolo finito',
            snap.odp_article ? snap.odp_article + (snap.odp_article_desc ? ' — ' + snap.odp_article_desc : '') : '',
            'doc-cell--wide')}
        ${this._docCell('Operatore', snap.operator)}
      </div>`;

    const body = `
      ${bands}

      <div class="pr-sec">Tempi di prelievo</div>
      <div class="pr-times">
        <div class="pr-time-cell">
          <div class="pr-time-lbl">Inizio</div>
          <div class="pr-time-val">${E(this._fmtClock(snap.started_at))}</div>
          <div class="pr-time-sub">${E(this._fmtDayShort(snap.started_at))}</div>
        </div>
        <div class="pr-time-cell">
          <div class="pr-time-lbl">Fine</div>
          <div class="pr-time-val">${E(this._fmtClock(snap.ended_at))}</div>
          <div class="pr-time-sub">${sameDay ? 'stessa giornata' : E(this._fmtDayShort(snap.ended_at))}</div>
        </div>
        <div class="pr-time-cell">
          <div class="pr-time-lbl">Durata totale</div>
          <div class="pr-time-val">${E(this._fmtDurLong(durSec))}</div>
          <div class="pr-time-sub">da inizio a chiusura</div>
        </div>
        <div class="pr-time-cell pr-time-key">
          <div class="pr-time-lbl">Tempo medio di prelievo</div>
          <div class="pr-time-val">${avgSec != null ? E(this._fmtDurLong(avgSec)) : '—'}</div>
          <div class="pr-time-sub">durata ÷ ${nRows} ${nRows === 1 ? 'prelievo' : 'prelievi'}</div>
        </div>
      </div>

      <div class="pr-summary">
        <div class="pr-summary-item">
          <div class="pr-summary-val">${nRows}${snap.stops_total > nRows ? `<span style="font-size:9pt;color:#666">/${snap.stops_total}</span>` : ''}</div>
          <div class="pr-summary-lbl">Righe Prelevate</div></div>
        <div class="pr-summary-item"><div class="pr-summary-val">${totColli}</div><div class="pr-summary-lbl">Colli Prelevati</div></div>
        <div class="pr-summary-item"><div class="pr-summary-val">${uniqueLocs}</div><div class="pr-summary-lbl">Ubicazioni</div></div>
        <div class="pr-summary-item"><div class="pr-summary-val">${snap.tail.length}</div><div class="pr-summary-lbl">Righe da Recuperare</div></div>
      </div>

      <div class="pr-sec">Righe prelevate</div>
      <table class="pr-table">
        <thead><tr>
          <th class="w-[22px]">#</th>
          <th class="w-[40px] text-center">Tappa</th>
          <th class="w-[86px]">Codice</th>
          <th>Descrizione</th>
          <th class="w-[76px]">Lotto</th>
          <th class="w-[100px]">Ubicazione</th>
          <th class="w-[66px] text-center">Kg ordine</th>
          <th class="w-[58px] text-center">Colli prelevati</th>
        </tr></thead>
        <tbody>${rowsHTML || '<tr class="pr-empty-row"><td colspan="8">Nessuna riga prelevata</td></tr>'}</tbody>
      </table>

      ${snap.tail.length ? `
      <div class="pr-sec">Da recuperare fuori percorso
        <span class="pr-sec-note">— barrare la casella a recupero avvenuto</span></div>
      <table class="pr-table">
        <thead><tr>
          <th class="w-[22px]">#</th>
          <th class="w-[86px]">Codice</th>
          <th>Descrizione</th>
          <th class="w-[76px]">Lotto</th>
          <th class="w-[66px] text-center">Kg ordine</th>
          <th class="w-[104px]">Motivo</th>
          <th>Dettaglio</th>
          <th class="pr-check-col">Recuperato</th>
        </tr></thead>
        <tbody>${tailHTML}</tbody>
      </table>` : ''}

      ${notesHTML ? `
      <div class="pr-sec">Segnalazioni
        <span class="pr-sec-note">— merce presente in ubicazione ma non prelevabile</span></div>
      <table class="pr-table">
        <thead><tr>
          <th class="w-[22px]">#</th>
          <th class="w-[86px]">Codice</th>
          <th class="w-[76px]">Lotto</th>
          <th class="w-[100px]">Ubicazione</th>
          <th>Motivo</th>
        </tr></thead>
        <tbody>${notesHTML}</tbody>
      </table>` : ''}

      ${snap.warnings?.length ? `
      <div class="pr-sec">Avvisi rilevati sui dati dell’ordine</div>
      <ul class="pr-warn-list">
        ${snap.warnings.map((w: any) => `<li>${E(w)}</li>`).join('')}
      </ul>` : ''}`;

    return this._docPageHTML({
      kind: 'REPORT DI PRELIEVO',
      kindSub: 'Ordine di produzione',
      num: snap.odp_num || snap.doc_id,
      dateLabel: reprint ? 'originale del' : 'del',
      dateVal: this._fmtStamp(snap.closed_at),
      headExtra, body,
      docId: snap.doc_id,
      pageClass: 'doc-page--pick',
      printedLabel: reprint ? 'ristampato il' : 'stampato il',
      signs: [
        { role: 'Operatore magazzino', hint: snap.operator || 'Data e firma' },
        { role: 'Responsabile magazzino', hint: 'Data e firma' },
        { role: 'Produzione', hint: 'Ricevuto il' }
      ]
    });
  },

  _emitPickReport(snap, opt = {}) {
    Feedback.clear();   // v1.1.0 [N1] — vedi _docPrint: niente riscontri sopra il foglio
    $('printReport').innerHTML =
      this._buildPickReportHTML(snap, { ...opt, printed_at: opt.printed_at || Date.now() });
    window.print();
    setTimeout(() => { $('printReport').innerHTML = ''; }, 1500);
  },

  /* ─── REPORT PARZIALE (percorso ancora aperto) ───────────────────── */
  _printRouteReport(sess = null) {
    const s = sess || Store.getActivePickSession();
    if (!s) return this.toast('Nessun percorso da stampare', 'error');
    const concluded = s.stops.filter((x: any) => x.status === 'done' || x.status === 'missing');
    if (!concluded.length) return this.toast('Niente da stampare: nessuna tappa conclusa', 'error');
    this._emitPickReport(this._pickSnapFromSession(s, Date.now(), { partial: true }), { reprint: false });
  },

  /* ─── REPORT DEFINITIVO DI CHIUSURA ──────────────────────────────── */
  async _emitFinalPickReport(s) {
    const snap = this._pickSnapFromSession(s, Date.now(), { partial: false });
    const saved = await Store.archivePickReport(snap);
    this._emitPickReport(snap, { reprint: false });
    if (!saved) {
      this.toast('Report stampato ma non archiviato: la ristampa conforme non sarà disponibile', 'error');
    }
    return snap;
  },
};
