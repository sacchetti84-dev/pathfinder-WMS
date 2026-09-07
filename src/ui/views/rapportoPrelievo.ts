import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { PickRoute } from '../../modules/pickRoute';
import { descriviColli } from '../../modules/colli';
import { formattaQuantita } from '../../modules/misure';
import type { SessionePrelievo, Movimento, TappaPrelievo, FuoriPercorso } from '../../types/entita';

/* Un motivo di deviazione ha un'etichetta leggibile; quello che non ce l'ha
   esce come e' scritto. */
const etichettaMotivo = (reason?: string) =>
  (PickRoute.REASON_LABELS as Record<string, string>)[reason || ''] || reason || '';
import { Feedback } from '../feedback';


/* IL RAPPORTO DI PRELIEVO HA TRE SORGENTI E UNA FORMA SOLA.

   Percorso guidato, carrello, e — quando non resta altro — il registro
   movimenti. I tre normalizzatori qui sotto producono lo stesso oggetto, ed è
   quello che la stampa sa leggere: se una sorgente smette di riempire un
   campo, il compilatore lo dice prima della carta. */
type RigaRapporto = {
  seq: number | null;
  article_code: string;
  article_description: string;
  lot_code: string;
  location_code: string;
  kg_required: number | null;
  um: string;
  qty_picked: number;
  /** 2.5 — LE UM USCITE DAVVERO. Il report diceva quanti colli erano usciti
      e quanti chili l'ordine chiedeva, e fra i due non c'era il dato che
      conta: quanto è uscito. Su una riga con un collo aperto non si ricava
      dai colli, e su una con colli di misure diverse nemmeno. `null` dove la
      riga non è gestita a unità di misura. */
  uom_picked: number | null;
  /** Come erano imballati i colli usciti — «2 × 25 + 1 × 7». */
  packs_desc: string;
  /** Quante volte la tappa è stata rettificata dopo il prelievo. */
  corrections: number;
  correction_note: string;
  done_at: number | null;
};

type CodaRapporto = {
  article_code: string;
  description: string;
  lot_code: string;
  kg_required: number | null;
  um: string;
  label: string;
  detail: string;
};

type NotaRapporto = {
  article_code: string;
  lot_code: string;
  location_code: string;
  label: string;
  detail: string;
};

type RapportoPrelievo = {
  doc_id: string;
  kind: 'route' | 'cart' | 'log';
  app_ver: string;
  partial: boolean;
  degraded: boolean;
  odp_num: string;
  odp_article: string;
  odp_article_desc: string;
  odp_lot: string;
  odp_qty: string | number;
  operator: string;
  session_id: string | null;
  started_at: number;
  ended_at: number;
  closed_at: number;
  stops_total: number;
  /** 2.12 — GLI ORDINI DEL GIRO, quando il percorso ne ha serviti piu' d'uno.
      Vuoto sul prelievo di un ordine solo. Il documento e' intestato al
      CAPOFILA — `odp_num` — e chi lo rilegge fra sei mesi deve poter vedere
      per quali altri ordini quella merce e' scesa: un foglio che nomina un
      ordine solo, su un giro di cinque, ne nasconde quattro. */
  giro_odps: string[];
  /** 2.5 — i millisecondi di pausa dichiarata, da scorporare dalla durata:
      un tempo medio di prelievo che comprende il pranzo misura il pranzo. */
  paused_ms: number;
  pauses: number;
  rows: RigaRapporto[];
  tail: CodaRapporto[];
  notes: NotaRapporto[];
  warnings: string[];
};

/* Il carrello di produzione, come lo legge il rapporto. */
type VoceCarrello = {
  article_code: string;
  article_description?: string;
  lot_code: string;
  location_code: string;
  qty_pick?: number;
  _qty_delta?: number;
};

export const VistaRapportoPrelievo = {
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
  _fmtStamp(ts: number | null | undefined) {
    return ts ? new Date(ts).toLocaleString('it-IT',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  },
  _fmtDayShort(ts: number | null | undefined) {
    return ts ? new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '';
  },

  _pickDocId(prefix: string, odpNum: string | null | undefined, ts: number) {
    const core = String(odpNum || 'NA').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'NA';
    return `${prefix}-${core}-${ts.toString(36).toUpperCase().slice(-6)}`;
  },

  /* ─── NORMALIZZATORE A) sessione di prelievo guidato ─────────────── */
  _pickSnapFromSession(s: SessionePrelievo, endTs = Date.now(),
                       opt: { partial?: boolean } = {}): RapportoPrelievo {
    const tappe = s.stops || [];
    const done    = tappe.filter((x) => x.status === 'done');
    const missing = tappe.filter((x) => x.status === 'missing');
    const pending = tappe.filter((x) => x.status === 'pending');

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
      stops_total: tappe.length,
      giro_odps: (s.odps || []).length > 1
        ? (s.odps || []).map((o) => String(o.odp_num || '').trim().toUpperCase()).filter(Boolean)
        : [],
      paused_ms: (s.pauses || []).reduce((acc, x) => acc + Math.max(0, (x.to ?? endTs) - x.from), 0),
      pauses: (s.pauses || []).length,
      rows: done.map((x): RigaRapporto => ({
        seq: x.seq ?? null,
        article_code: x.article_code,
        article_description: x.article_description || '',
        lot_code: x.lot_code,
        location_code: x.location_code || '',
        kg_required: x.kg_required ?? null,
        um: x.um || '',
        qty_picked: x.qty_picked || 0,
        uom_picked: typeof x.uom_picked === 'number' ? x.uom_picked : null,
        packs_desc: Array.isArray(x.packs_picked) && x.packs_picked.length
          ? descriviColli(x.packs_picked, x.um || null) : '',
        corrections: Number(x.corrections) || 0,
        correction_note: x.correction_note || '',
        done_at: x.done_at || null
      })),
      tail: [
        ...missing.map((x): CodaRapporto => ({
          article_code: x.article_code, description: x.article_description || '',
          lot_code: x.lot_code, kg_required: x.kg_required ?? null, um: x.um || '',
          label: 'Non trovato dall’operatore',
          detail: `Ubicazione prevista ${x.location_code}. ${x.forced_note || ''}`.trim()
        })),
        ...pending.map((x): CodaRapporto => ({
          article_code: x.article_code, description: x.article_description || '',
          lot_code: x.lot_code, kg_required: x.kg_required ?? null, um: x.um || '',
          label: 'Tappa non percorsa',
          detail: `Ubicazione prevista ${x.location_code}. Percorso chiuso prima della tappa.`
        })),
        ...(s.offroute || []).map((o): CodaRapporto => ({
          article_code: o.article_code, description: o.description || '',
          lot_code: o.lot_code, kg_required: o.kg_required ?? null, um: o.um || '',
          label: etichettaMotivo(o.reason) || 'Fuori percorso',
          detail: o.detail || ''
        }))
      ],
      notes: (s.notes || []).map((n): NotaRapporto => ({
        article_code: n.article_code, lot_code: n.lot_code, location_code: n.location_code || '',
        label: etichettaMotivo(n.reason), detail: n.detail || ''
      })),
      warnings: [...(s.warnings || [])]
    };
  },

  /* ─── NORMALIZZATORE B) flusso a carrello ────────────────────────── */
  _pickSnapFromCart(cart: VoceCarrello[], meta: {
    ended_at?: number; started_at?: number; odp_num?: string; operator?: string;
  } = {}): RapportoPrelievo {
    const endTs = meta.ended_at || Date.now();
    return {
      doc_id: this._pickDocId('PP', meta.odp_num, endTs),
      kind: 'cart',
      app_ver: this._PICK_REPORT_VER,
      partial: false,
      degraded: false,
      /* Il carrello e' di UN ordine: non nasce da un giro, e non c'e' niente
         da elencare. */
      giro_odps: [],
      odp_num: meta.odp_num || '',
      odp_article: '', odp_article_desc: '', odp_lot: '', odp_qty: '',
      operator: meta.operator || '',
      session_id: null,
      started_at: meta.started_at || endTs,
      ended_at: endTs,
      closed_at: endTs,
      stops_total: cart.length,
      paused_ms: 0,
      pauses: 0,
      rows: cart.map((it): RigaRapporto => ({
        seq: null,
        article_code: it.article_code,
        article_description: it.article_description || '',
        lot_code: it.lot_code,
        location_code: it.location_code,
        kg_required: null,
        um: '',
        qty_picked: it.qty_pick || Math.abs(it._qty_delta || 0) || 1,
        uom_picked: null,
        packs_desc: '',
        corrections: 0,
        correction_note: '',
        done_at: null
      })),
      tail: [], notes: [], warnings: []
    };
  },

  /* ─── NORMALIZZATORE C) registro movimenti (solo ripiego) ────────── */
  _pickSnapFromLog(movs: Movimento[], ref: string): RapportoPrelievo {
    /* Il ripiego si chiama solo con dei movimenti in mano. */
    const start = movs[0]!.ts, end = movs[movs.length - 1]!.ts;
    const notes = [...new Set(movs.map((m) => m.notes).filter(Boolean))];
    return {
      doc_id: this._pickDocId('PP', ref, end),
      kind: 'log',
      app_ver: this._PICK_REPORT_VER,
      partial: false,
      degraded: true,
      /* Il ripiego ricostruisce dal registro, che porta il solo `doc_ref`:
         quale giro fosse non si sa, e inventarlo sarebbe peggio del vuoto. */
      giro_odps: [],
      odp_num: ref || '',
      odp_article: '', odp_article_desc: '', odp_lot: '', odp_qty: '',
      operator: [...new Set(movs.map((m) => m.user).filter(Boolean))].join(', '),
      session_id: null,
      started_at: start,
      ended_at: end,
      closed_at: end,
      stops_total: movs.length,
      /* Il registro non sa niente delle pause: chi ricostruisce da lì ha in
         mano gli orari dei movimenti, e fra due movimenti non c'è modo di
         dire se qualcuno stava camminando o mangiando. */
      paused_ms: 0,
      pauses: 0,
      rows: movs.map((m): RigaRapporto => ({
        seq: null,
        article_code: m.article_code || '',
        article_description: m.article_description || '',
        lot_code: m.lot_code || '',
        location_code: m.location_code || '',
        kg_required: null,
        um: m.uom || '',
        /* Le UM il registro CE LE HA, dalla 1.4.2: `qty_uom_delta` è l'unico
           dato che dice quanto è uscito su una riga con un collo aperto. */
        uom_picked: typeof m.qty_uom_delta === 'number' ? Math.abs(m.qty_uom_delta) : null,
        packs_desc: '',
        corrections: 0,
        correction_note: '',
        qty_picked: m.qty_delta != null ? Math.abs(m.qty_delta) : 1,
        done_at: m.ts
      })),
      tail: [], notes: [],
      warnings: notes.map(n => `Nota registrata sul movimento: ${n}`)
    };
  },

  /* ─── TEMPLATE UNICO ─────────────────────────────────────────────── */
  _buildPickReportHTML(snap: RapportoPrelievo, opt: {
    reprint?: boolean; printed_at?: number;
  } = {}) {
    const E = (v: unknown) => this._esc(v == null ? '' : v);
    const reprint = !!opt.reprint;
    const printTs = opt.printed_at || Date.now();

    /* ── Tempi. Tutto discende da started_at/ended_at dello snapshot,
          congelati alla chiusura: identici a ogni ristampa. ── */
    const nRows   = snap.rows.length;
    const durSec  = Math.max(0, Math.round(((snap.ended_at || 0) - (snap.started_at || 0)) / 1000));
    /* 2.5 — IL TEMPO MEDIO SI CALCOLA SUL TEMPO IN CUI SI È LAVORATO.
       Finché la durata comprendeva le pause dichiarate, il tempo medio di
       prelievo misurava il pranzo insieme al giro: su un ordine cominciato
       alle 11 e chiuso alle 15 con un'ora di mensa, la media di dieci righe
       usciva del venticinque per cento più alta di quella vera. La durata
       lorda resta scritta — è quella dell'orologio — e accanto compare
       quella netta, che è quella che si divide. */
    const pausaSec = Math.max(0, Math.round((snap.paused_ms || 0) / 1000));
    const nettoSec = Math.max(0, durSec - pausaSec);
    const avgSec  = nRows > 0 ? nettoSec / nRows : null;
    const sameDay = this._fmtDayShort(snap.started_at) === this._fmtDayShort(snap.ended_at);

    const totColli   = snap.rows.reduce((a, r) => a + (r.qty_picked || 0), 0);
    const uniqueLocs = new Set(snap.rows.map((r) => r.location_code).filter(Boolean)).size;
    const rettificate = snap.rows.filter((r) => (r.corrections || 0) > 0).length;

    /* Le UM prelevate si sommano PER UNITÀ: chili e pezzi in una casella sola
       sarebbero un numero che non vuol dire niente. Le righe che non sono
       gestite a unità di misura restano fuori dal totale, e non ci entrano
       come zero — uno zero direbbe «pesati, non pesano». */
    const perUnita = new Map<string, number>();
    for (const r of snap.rows) {
      if (typeof r.uom_picked !== 'number' || !r.um) continue;
      perUnita.set(r.um, (perUnita.get(r.um) || 0) + r.uom_picked);
    }
    const totUomTxt = perUnita.size
      ? [...perUnita.entries()].map(([u, v]) => `${formattaQuantita(v, u)} ${u}`).join(' · ')
      : '—';
    const senzaUom = snap.rows.filter((r) => typeof r.uom_picked !== 'number').length;

    /* 2.5 — LE UM PRELEVATE SI SCRIVONO CON I DECIMALI DELLA LORO UNITA'.
       `_fmtKg` ne forza tre, ed e' giusto per i chili che l'ODP chiede: su un
       articolo in PZ avrebbe stampato «12,000 PZ», cioe' dodici pezzi scritti
       come se fossero pesati. `formattaQuantita` legge l'unita'. */
    const uomCell = (v: number | null | undefined, um: string | undefined) => {
      if (typeof v !== 'number') return '<span class="text-sx-text-muted">—</span>';
      const u = String(um || '').trim().toUpperCase();
      return `${E(formattaQuantita(v, u || null))}${u ? ` <span style="font-size:6.5pt;color:#666">${E(u)}</span>` : ''}`;
    };

    /* 2.5 — E LA COLONNA DEGLI ORDINATI SI SCRIVE ALLO STESSO MODO.
       Usava `_fmtKg`, che forza tre decimali: accanto alla colonna nuova,
       cinquecento pezzi comparivano come «500,000» a sinistra e «500 PZ» a
       destra — lo stesso numero scritto in due modi, su due celle che si
       toccano. Sta in testa a `misure.ts` da sempre: tre formattazioni dello
       stesso numero, per chi legge, sono tre numeri diversi. */
    const kgCell = (kg: number | string | null | undefined, um: string | undefined) => {
      if (kg == null || kg === '') return '<span class="text-sx-text-muted">—</span>';
      const u = String(um || '').trim().toUpperCase();
      const suffix = (u && u !== 'KG') ? ` <span style="font-size:6.5pt;color:#666">${E(um)}</span>` : '';
      return `${E(formattaQuantita(kg, u || null))}${suffix}`;
    };

    const rowsHTML = snap.rows.map((r, i) => `<tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-num">${r.seq != null ? E(r.seq) : '<span class="text-sx-text-muted">—</span>'}</td>
      <td class="td-code">${E(r.article_code || '—')}</td>
      <td>${E(r.article_description || '—')}${this._avvisiRigaStampa(r.article_code)}${
        r.corrections ? `<div class="pr-corr">${this._ico('pencil')} rettificata ${r.corrections === 1 ? 'una volta' : r.corrections + ' volte'}${r.correction_note ? ' — ' + E(r.correction_note) : ''}</div>` : ''}</td>
      <td class="td-lot">${E(r.lot_code || '—')}</td>
      <td class="td-loc">${E(r.location_code || '—')}</td>
      <td class="td-num">${kgCell(r.kg_required, r.um)}</td>
      <td class="td-num font-bold">${E(r.qty_picked)}</td>
      <td class="td-num font-bold">${uomCell(r.uom_picked, r.um)}${
        r.packs_desc ? `<div class="pr-packs">${E(r.packs_desc)}</div>` : ''}</td>
    </tr>`).join('');

    const tailHTML = snap.tail.map((t, i) => `<tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-code">${E(t.article_code || '—')}</td>
      <td>${E(t.description || '—')}${this._avvisiRigaStampa(t.article_code)}</td>
      <td class="td-lot">${E(t.lot_code || '—')}</td>
      <td class="td-num">${kgCell(t.kg_required, t.um)}</td>
      <td class="font-semibold">${E(t.label)}</td>
      <td style="font-size:6.75pt">${E(t.detail)}</td>
      <td class="pr-check-col"><span class="pr-box"></span></td>
    </tr>`).join('');

    const notesHTML = snap.notes.map((n, i) => `<tr>
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
        ${(snap.giro_odps || []).length > 1
          ? this._docCell('Giro — ordini serviti', snap.giro_odps.join(' · '), 'doc-cell--wide')
          : ''}
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
        ${pausaSec > 0 ? `<div class="pr-time-cell">
          <div class="pr-time-lbl">Di cui in pausa</div>
          <div class="pr-time-val">${E(this._fmtDurLong(pausaSec))}</div>
          <div class="pr-time-sub">${snap.pauses} paus${snap.pauses === 1 ? 'a' : 'e'} dichiarat${snap.pauses === 1 ? 'a' : 'e'}</div>
        </div>` : ''}
        <div class="pr-time-cell pr-time-key">
          <div class="pr-time-lbl">Tempo medio di prelievo</div>
          <div class="pr-time-val">${avgSec != null ? E(this._fmtDurLong(avgSec)) : '—'}</div>
          <div class="pr-time-sub">${pausaSec > 0 ? 'tempo netto' : 'durata'} ÷ ${nRows} ${nRows === 1 ? 'prelievo' : 'prelievi'}</div>
        </div>
      </div>

      <div class="pr-summary">
        <div class="pr-summary-item">
          <div class="pr-summary-val">${nRows}${snap.stops_total > nRows ? `<span style="font-size:8.25pt;color:#666">/${snap.stops_total}</span>` : ''}</div>
          <div class="pr-summary-lbl">Righe Prelevate</div></div>
        <div class="pr-summary-item"><div class="pr-summary-val">${totColli}</div><div class="pr-summary-lbl">Colli Prelevati</div></div>
        <div class="pr-summary-item"><div class="pr-summary-val pr-summary-val--txt">${E(totUomTxt)}</div>
          <div class="pr-summary-lbl">Quantità Prelevata${senzaUom ? ` <span style="font-weight:400">(${senzaUom} rig${senzaUom === 1 ? 'a' : 'he'} a soli colli)</span>` : ''}</div></div>
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
          <th class="w-[66px] text-center">Ordinati</th>
          <th class="w-[52px] text-center">Colli</th>
          <th class="w-[78px] text-center">Prelevati</th>
        </tr></thead>
        <tbody>${rowsHTML || '<tr class="pr-empty-row"><td colspan="9">Nessuna riga prelevata</td></tr>'}</tbody>
      </table>
      ${rettificate ? `<div class="pr-sec-note pr-sec-note--block">
        ${this._ico('pencil')} ${rettificate} rig${rettificate === 1 ? 'a è stata rettificata' : 'he sono state rettificate'} dopo il prelievo:
        i colli tornati a scaffale hanno un movimento di riposizionamento a registro, e la riga qui sopra
        porta la quantità che è rimasta fuori.
      </div>` : ''}

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
        ${snap.warnings.map((w) => `<li>${E(w)}</li>`).join('')}
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
      flow: true,
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
  _printRouteReport(sess: SessionePrelievo | null = null) {
    const s = sess || Store.getActivePickSession();
    if (!s) return this.toast('Nessun percorso da stampare', 'error');
    const concluded = (s.stops || []).filter((x) => x.status === 'done' || x.status === 'missing');
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
} satisfies Vista;
