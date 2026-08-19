import { type Vista, $ } from './vista';
import { caricaExcel } from '../../modules/excel';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { OdpParser } from '../../modules/odpParser';
import { PickRoute } from '../../modules/pickRoute';
import { tappeAltrove, richiestaTrasferimento, tappaInAttesa, sitoDiCasa } from '../../modules/trasferimentiOdp';
import { etichettaTipo } from '../../modules/compiti';
import type { Percorso, Tappa } from '../../modules/pickRoute';
import type { TestataODP } from '../../modules/odpParser';
import type { SessionePrelievo } from '../../types/entita';
import { Dialog } from '../dialog';
import { Feedback } from '../feedback';

/* Dove altro sta lo stesso lotto, quando la tappa non lo trova. */
type Alternativa = { location_code: string; item_key: string; qty_available: number };

/* L'ordine appena letto da Excel, prima che diventi un percorso avviato: il
   risultato del parser piu' quello della serpentina, piu' il nome del file. */
type OrdineLetto = Percorso & {
  header: TestataODP;
  warnings: string[];
  file_name: string;
};

export const VistaPercorso = {
  _routeStage: 'import',        // 'import' | 'run'
  _routeParsed: null,           // esito OdpParser, vivo solo fra import e avvio
  _routeScan: { loc: '', art: '', lot: '' },
  _routeStartTime: null,

  /* ─── SCHERMATA 1: IMPORT ───────────────────────────────────────── */
  _formOrdine(el) {
    /* La guardia che hanno tutte le altre maschere e questa non aveva. Chi
       chiama passa `$('pickSubForm')`, che è null ogni volta che si è usciti
       dal ramo «Da ordine» — e allora saltava un TypeError che a video
       sembrava un errore di lettura del file. Visto due volte il 19/08:
       all'import e alla richiesta di trasferimento. */
    if (!el) return;
    const session = Store.getActivePickSession();
    if (session && this._routeStage === 'run') { this._renderRouteRun(el); return; }

    if (!this._prodOperator) this._prodOperator = Store.getCurrentIdentity().initials;
    const parsed = this._routeParsed;

    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① Carica l'XLSX dell'ODP</span> →
        <span class="wf-step">② Verifica l'esito</span> →
        <span class="wf-step">③ AVVIA PERCORSO</span> → scansione guidata tappa per tappa.
      </div>

      ${session ? `<div class="route-resume">
        <strong>⏸ Percorso gi&agrave; in corso</strong>
        <div>Ordine ${this._esc(session.odp_num)} — ${(session.stops || []).filter((s) => s.status !== 'pending').length} di ${(session.stops || []).length} tappe completate.</div>
        <div class="flex gap-5 mt-6 flex-wrap">
          <button class="btn btn-accent" onclick="App._routeResume()">▶ Riprendi</button>
          <button class="btn btn-danger" onclick="App._routeAbandon()">✕ Chiudi percorso</button>
        </div>
        <div class="text-body-small mt-5 opacity-85">
          Caricando un nuovo ordine questo percorso verr&agrave; chiuso.
        </div>
      </div>` : ''}

      <div class="form-group mb-6">
        <label>Operatore <span class="req">*</span></label>
        <input class="input" id="pRouteOperator" placeholder="Nome operatore" maxlength="${Validate.MAX.OPERATOR}"
          value="${this._esc(this._prodOperator)}" onchange="App._prodOperator=this.value">
      </div>

      <div class="flex gap-5 flex-wrap mb-7">
        <button class="btn btn-primary min-h-[var(--md-touch)]"
          onclick="$('fileImportOdp').click()">📄 Carica ordine (.xlsx)</button>
        ${parsed ? '<button class="btn btn-ghost" onclick="App._routeClearImport()">Scarta</button>' : ''}
      </div>

      <section id="routeImportResult">${parsed ? this._routeImportResultHTML() : ''}</section>

      <div class="kbd-hint mt-7">
        <span class="text-body-small text-sx-text-muted">
          Sorgente accettata: solo il file <strong>.xlsx</strong> esportato da Sage X3.
          Il PDF dello stesso ordine espone quantit&agrave; arrotondate ed &egrave; meno affidabile.
        </span>
      </div>`;
    this.setPrimaryScanField(null);
  },

  _routeClearImport() {
    this._routeParsed = null;
    this._formOrdine($('pickSubForm'));
  },

  /* Lettura del file. Ogni errore è esplicito: un import che fallisce a metà
     e lascia un percorso parziale sarebbe il peggior esito possibile. */
  async handleImportOdp(event) {
    const file = event.target.files?.[0];
    event.target.value = '';                     // consente di ricaricare lo stesso file
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      return this.toast('Formato non valido · Caricare il file .xlsx esportato da Sage X3', 'error');
    }
    try {
      /* 1.7 — il parser resta sincrono e non importa SheetJS: glielo diamo
         qui, dopo che il chunk e' arrivato. Vedi `modules/odpParser.ts`. */
      OdpParser.usaXLSX(await caricaExcel());
      const buf = await file.arrayBuffer();
      const res = OdpParser.parse(buf);
      if (!res.ok) {
        this._routeParsed = null;
        this._formOrdine($('pickSubForm'));
        return this.toast(`Import non riuscito · ${res.error}`, 'error');
      }
      const route = PickRoute.build(res.lines);
      this._routeParsed = { ...res, ...route, file_name: file.name };
      this._formOrdine($('pickSubForm'));
      const n = (route.stops || []).length, o = route.offroute.length;
      this.toast(`Ordine ${res.header.odp_num} letto · ${n} tappe, ${o} righe in coda`, n ? 'success' : 'warning');
    } catch (err) {
      console.error('[WM] handleImportOdp:', err);
      this._routeParsed = null;
      this._formOrdine($('pickSubForm'));
      this.toast(`Errore di lettura · ${(err as Error).message}`, 'error');
    }
  },

  /* Esito dell'import: testata, avvisi, ordine siti, anteprima tappe e coda. */
  _routeImportResultHTML() {
    const p: OrdineLetto | null = this._routeParsed;
    if (!p) return '';
    const h = p.header;
    const bySite: Record<string, Tappa[]> = {};
    for (const s of p.stops) (bySite[s.site_id!] = bySite[s.site_id!] || []).push(s);

    /* 1.10 — quali tappe stanno fuori dal magazzino di partenza. Il
       magazzino di partenza e' il primo dell'ordine di visita, che e' gia'
       in questa schermata: non serve un secondo posto dove dichiararlo. */
    const casa = sitoDiCasa(p.stops, PickRoute.getSiteOrder());
    const lontane = tappeAltrove(p.stops, casa, (id) => Store.getSite(id)?.name || id);
    const altrove = new Map(lontane.map((f) => [f.tappa.location_code + '|' + f.tappa.item_key, f]));

    const SEV = { not_mapped: 0, lot_absent_other_lots: 1, no_lot_in_odp: 2, all_blocked: 3 };
    const blockers = [...p.offroute].sort((a, b) => (SEV[a.reason as keyof typeof SEV] ?? 9) - (SEV[b.reason as keyof typeof SEV] ?? 9));
    const alertHTML = blockers.length ? `
      <div class="route-alert">
        <div class="route-alert-head">
          <span class="route-alert-ico">!</span>
          <div>
            <strong>${blockers.length} riga/e non prelevabile/i dalle aree mappate</strong>
            <div class="route-alert-sub">
              Verificare su Sage o con l'Ufficio Produzione <u>prima</u> di avviare il percorso.
              Il prelievo di queste righe non &egrave; guidato.
            </div>
          </div>
        </div>
        ${blockers.map(o => this._routeTailRowHTML(o)).join('')}
      </div>` : '';

    /* Avvisi residui sulla lettura del file. Dalla v2.5.1 restano solo quelli
       che indicano un dato mancante, non differenze di arrotondamento. */
    const warnHTML = p.warnings.length ? `
      <div class="route-warn">
        <strong>⚠ ${p.warnings.length} avviso/i sui dati dell'ordine</strong>
        <ul class="mt-4 mr-0 mb-0 ml-10 p-0">
          ${(p.warnings || []).map((w) => `<li class="mb-2.5">${this._esc(w)}</li>`).join('')}
        </ul>
      </div>` : '';

    const notesHTML = p.notes.length ? `
      <div class="route-note-box">
        <strong>ℹ ${p.notes.length} segnalazione/i — merce esistente ma non prelevabile</strong>
        <div class="text-body-small mt-3 opacity-85">
          Non entra nel percorso. &Egrave; solo un'informazione per l'operatore.
        </div>
        ${(p.notes || []).map((n) => `<div class="route-note-row">
          <span class="badge badge-${n.reason === 'quarantine' ? 'red' : 'amber'}">${this._esc((PickRoute.REASON_LABELS as Record<string, string>)[n.reason || ''] || n.reason)}</span>
          <span class="mono">${this._esc(n.article_code)}#${this._esc(n.lot_code)}</span>
          <span class="mono">${this._esc(n.location_code)}</span>
        </div>`).join('')}
      </div>` : '';

    return `
      <div class="route-head-card">
        <div class="route-head-grid">
          <div><span class="route-head-lbl">Ordine</span><span class="route-head-val mono">${this._esc(h.odp_num)}</span></div>
          <div><span class="route-head-lbl">Articolo finito</span><span class="route-head-val mono">${this._esc(h.article_code)}</span></div>
          <div><span class="route-head-lbl">Lotto produzione</span><span class="route-head-val mono">${this._esc(h.lot || '—')}</span></div>
          <div><span class="route-head-lbl">Qt&agrave; prevista</span><span class="route-head-val">${this._esc(h.qty_planned)} ${this._esc(h.um)}</span></div>
        </div>
        <div class="route-head-desc">${this._esc(h.article_desc)}</div>
      </div>

      ${alertHTML}
      ${warnHTML}

      <div class="route-stats">
        <div class="route-stat"><span class="route-stat-val">${(p.stops || []).length}</span><span class="route-stat-lbl">Tappe</span></div>
        <div class="route-stat"><span class="route-stat-val">${Object.keys(bySite).length}</span><span class="route-stat-lbl">Siti</span></div>
        <div class="route-stat"><span class="route-stat-val">${p.offroute.length}</span><span class="route-stat-lbl">Da verificare</span></div>
        <div class="route-stat"><span class="route-stat-val">${p.notes.length}</span><span class="route-stat-lbl">Segnalazioni</span></div>
      </div>

      ${this._routeSiteOrderHTML()}

      ${(p.stops || []).length ? `<div class="route-preview">
        <strong class="text-body-medium">🧭 Anteprima percorso</strong>
        ${lontane.length ? `<div class="text-body-small opacity-85 mt-2 mb-3">
          🏭 <strong>${lontane.length} tapp${lontane.length === 1 ? 'a sta' : 'e stanno'} in un altro magazzino.</strong>
          Chiedere il trasferimento mette la merce in coda allo schedulatore e sposta la tappa sull'ubicazione in cui la si riceve.
        </div>` : ''}
        ${(p.stops || []).map((s) => `<div class="route-prev-row">
          <span class="route-prev-seq">${s.seq}</span>
          <span class="mono route-prev-loc">${this._esc(s.location_code)}</span>
          <span class="route-prev-art"><span class="mono">${this._esc(s.article_code)}</span> · <span class="mono">${this._esc(s.lot_code)}</span></span>
          <span class="route-prev-kg">${this._fmtKg(s.kg_required)} ${this._esc(s.um)}</span>
          ${s.alternatives.length ? `<span class="badge badge-muted">+${s.alternatives.length} alt.</span>` : ''}
          ${this._routeRigaAltrove(s, altrove)}
        </div>`).join('')}
      </div>` : '<div class="pick-cart-empty">Nessuna tappa percorribile: tutte le righe finiscono in coda.</div>'}

      ${notesHTML}

      <div class="flex gap-5 mt-8">
        <button class="btn btn-primary flex-1 font-extrabold min-h-[var(--md-touch)]"
          onclick="App._routeStart()" ${(p.stops || []).length ? '' : 'disabled'}>🧭 AVVIA PERCORSO (${(p.stops || []).length})</button>
      </div>`;
  },

  /* ═══════════════════════════════════════════════════════════════════
     1.10 — IL TRASFERIMENTO CHIESTO DALL'ORDINE
     © Andrea Sacchetti — Dietopack S.r.l.

     Quando un lotto sta nel magazzino sbagliato il percorso ci mandava
     comunque: una tappa in fondo, in un altro capannone, per tre chili.
     Nessuno ci va — si chiede che la merce arrivi, e quella richiesta
     viveva a voce, come tutto ciò che lo schedulatore ha portato a registro.

     Qui la spunta scrive: nasce un'attività di TRASFERIMENTO, si dichiara in
     quale ubicazione ricevere la merce, e la tappa si sposta lì. Chi cammina
     continua a vedere un prelievo: cambia dove, non cosa.

     LA MERCE NON SI MUOVE DA QUI. Nasce un compito, e il trasferimento lo
     esegue chi lo prende in carico: la coda non muove niente da sola.
     ═══════════════════════════════════════════════════════════════════ */

  /* Le richieste già fatte su questo ordine, per item. Servono a
     sopravvivere alla RICOSTRUZIONE del percorso: cambiare l'ordine di
     visita dei siti rifà `build` da zero, e senza questa mappa una tappa già
     spostata tornerebbe nell'altro magazzino con il compito già in coda —
     due volte la stessa merce. */
  _routeTrasf: {},

  _routeRigaAltrove(s, altrove) {
    const chiesto = this._routeTrasf[s.item_key];
    if (chiesto && chiesto.to === s.location_code) {
      return `<span class="badge badge-amber" title="${this._esc(s.forced_note || '')}">↔ in arrivo${chiesto.task_id ? ` · ${this._esc(chiesto.task_id)}` : ''}</span>`;
    }
    const f = altrove.get(s.location_code + '|' + s.item_key);
    if (!f) return '';
    const badge = `<span class="badge badge-amber" title="Questa merce sta in un altro magazzino">🏭 ${this._esc(f.site_name)}</span>`;
    return `${badge}<button class="btn btn-sm" title="Chiedi che la merce venga trasferita qui" onclick="App._routeChiediTrasf('${this._esc(s.item_key)}','${this._esc(s.location_code)}')">↔ Trasferisci</button>`;
  },

  _routeChiediTrasf(itemKey, fromLoc) {
    const p = this._routeParsed;
    const s = (p?.stops || []).find((x: Tappa) => x.item_key === itemKey && x.location_code === fromLoc);
    if (!s) return this.toast('Tappa non più in anteprima', 'error');
    const sito = Store.getSite(s.site_id);
    this.showModal(
      '↔ Trasferimento richiesto dall’ordine',
      `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        <span class="mono font-bold text-sx-primary">${this._esc(s.article_code)}</span>
        ${this._esc(s.article_description || '')}<br>
        Lotto <strong>${this._esc(s.lot_code)}</strong> · <strong>${this._fmtKg(s.kg_required)} ${this._esc(s.um)}</strong> richiesti dall’ordine<br>
        Adesso in <strong class="mono">${this._esc(s.location_code)}</strong> — ${this._esc(sito?.name || s.site_id || 'altro magazzino')}
      </div>
      <div class="form-group mb-6">
        <label>Ubicazione in cui ricevere la merce <span class="req">*</span></label>
        <div class="flex gap-3">
          <input class="input input-mono uppercase flex-1" id="trfTo" placeholder="Scansiona o digita" autofocus maxlength="${Validate.MAX.LOC_CODE}"
            oninput="this.value=this.value.toUpperCase();App._previewLoc('trfTo','trfToPrev')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCreaTrasf('${this._esc(itemKey)}','${this._esc(fromLoc)}')}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('trfTo',null)" title="Sfoglia le ubicazioni">📍</button>
        </div>
        <div id="trfToPrev"></div>
      </div>
      <div class="mov-preview mov-preview-warn">
        La tappa del percorso si sposta su questa ubicazione, e il vano resta
        <strong>vuoto finché il trasferimento non è eseguito</strong>: il compito nasce in coda,
        e la merce si muove quando qualcuno lo prende in carico.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App._routeCreaTrasf('${this._esc(itemKey)}','${this._esc(fromLoc)}')">↔ Metti in coda</button>`
    );
  },

  async _routeCreaTrasf(itemKey, fromLoc) {
    if (!this._requireOperator('la richiesta di trasferimento')) return;
    const p = this._routeParsed;
    const s = (p?.stops || []).find((x: Tappa) => x.item_key === itemKey && x.location_code === fromLoc);
    if (!s) return this.toast('Tappa non più in anteprima', 'error');

    const dest = Validate.clean($('trfTo')?.value, true).replace(/'/g, '-');
    if (!dest) return this.toast('Indica l’ubicazione in cui ricevere la merce', 'error');
    if (!Store.locationExists(dest)) return this.toast(`Ubicazione ${dest} inesistente`, 'error');
    const stato = Store.getLocationStatus(dest);
    if (stato === 'blocked' || stato === 'disabled') {
      return this.toast(`Ubicazione ${dest} ${stato === 'blocked' ? 'BLOCCATA' : 'DISATTIVATA'}: la merce non ci può arrivare`, 'error');
    }

    const richiesta = richiestaTrasferimento(s, dest, { odp_num: p?.header?.odp_num });
    if (!richiesta) return this.toast('Dalla stessa ubicazione a se stessa non è un trasferimento', 'error');

    let rec = null;
    try {
      rec = await Store.createTask({ ...richiesta, requested_by: Store.getCurrentIdentity().initials });
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }

    this._routeTrasf[itemKey] = { to: dest, from: fromLoc, task_id: rec?.task_id || '' };
    this._routeApplicaTrasf(sitoDiCasa(p?.stops, PickRoute.getSiteOrder()));
    this.closeModal();
    this._formOrdine($('pickSubForm'));
    this.toast(`↔ ${etichettaTipo('TRANSFER')} in coda — ${rec?.task_id}: ${s.article_code}#${s.lot_code} verso ${dest}`, 'success');
  },

  /* Riapplica al percorso le richieste già fatte e rimette in fila le tappe.
     Si chiama dopo ogni costruzione, non solo alla prima. */
  _routeApplicaTrasf(casa) {
    const p = this._routeParsed;
    if (!p?.stops?.length) return;
    let toccato = false;
    const stops = p.stops.map((s: Tappa) => {
      const t = this._routeTrasf[s.item_key];
      if (!t || s.location_code === t.to) return s;
      toccato = true;
      return tappaInAttesa(s, t.to, casa || s.site_id, t.task_id);
    });
    if (!toccato) return;
    this._routeParsed = { ...p, stops: PickRoute.riordina(stops) };
  },

  _routeTailRowHTML(o) {
    return `<div class="route-tail-row">
      <span class="badge badge-${o.reason === 'not_mapped' ? 'muted' : o.reason === 'marked_missing' ? 'red' : 'amber'}">${this._esc((PickRoute.REASON_LABELS as Record<string, string>)[o.reason] || o.reason)}</span>
      <span class="mono">${this._esc(o.article_code)}#${this._esc(o.lot_code)}</span>
      <span class="route-tail-desc">${this._esc(o.description || '')}</span>
      <span class="route-tail-kg">${this._fmtKg(o.kg_required)} ${this._esc(o.um || '')}</span>
      <div class="route-tail-detail">${this._esc(o.detail || '')}${o.forced_note ? ' — ' + this._esc(o.forced_note) : ''}</div>
    </div>`;
  },

  /* Ordine dei siti: riordinabile e persistito. Vive qui, dove è
     effettivamente rilevante, invece che sepolto in Config. */
  _routeSiteOrderHTML() {
    const order = PickRoute.getSiteOrder();
    if (order.length < 2) return '';
    return `<div class="route-siteorder">
      <strong class="text-body-medium">🏭 Ordine di visita dei siti</strong>
      <div class="text-body-small opacity-80 mt-2 mx-0 mb-4">
        Il percorso &egrave; costruito un sito per volta, in questa sequenza.
      </div>
      ${order.map((id, i) => {
        const site = Store.getSite(id);
        return `<div class="route-site-row">
          <span class="route-site-num">${i + 1}</span>
          <span class="route-site-name">${this._esc(site?.name || id)}</span>
          <button class="btn btn-sm btn-icon" onclick="App._routeMoveSite(${i},-1)" ${i === 0 ? 'disabled' : ''} title="Sposta su">↑</button>
          <button class="btn btn-sm btn-icon" onclick="App._routeMoveSite(${i},1)" ${i === order.length - 1 ? 'disabled' : ''} title="Sposta giù">↓</button>
        </div>`;
      }).join('')}
    </div>`;
  },

  _routeMoveSite(idx, delta) {
    const order = PickRoute.getSiteOrder();
    const to = idx + delta;
    if (to < 0 || to >= order.length) return;
    [order[idx], order[to]] = [order[to]!, order[idx]!];
    PickRoute.setSiteOrder(order);
    // Il percorso va ricostruito: l'ordine dei siti ne determina la sequenza
    if (this._routeParsed) {
      const route = PickRoute.build(this._routeParsed.lines);
      this._routeParsed = { ...this._routeParsed, ...route };
      /* 1.10 - le richieste gia' fatte sopravvivono alla ricostruzione. */
      this._routeApplicaTrasf(sitoDiCasa(this._routeParsed.stops, order));
    }
    this._formOrdine($('pickSubForm'));
    Feedback.sound('scan');
  },

  /* ─── AVVIO DEL PERCORSO ────────────────────────────────────────── */
  async _routeStart() {
    if (!this._requireOperator('il prelievo guidato da ordine')) return;
    const p: OrdineLetto | null = this._routeParsed;
    if (!p?.stops!.length) return this.toast('Nessuna tappa da percorrere', 'error');
    this._prodOperator = Validate.clean($('pRouteOperator')?.value) || this._prodOperator;
    const opErr = Validate.operator(this._prodOperator);
    if (opErr) return this.toast(opErr, 'error');

    const existing = Store.getActivePickSession();
    if (existing) {
      const ok = await Dialog.confirm({
        title: 'Chiudere il percorso in corso?',
        message: 'Esiste gi\u00e0 un percorso attivo. Avviandone uno nuovo il precedente viene chiuso.',
        details: Dialog.kv([
          ['Ordine in corso', existing.odp_num],
          ['Tappe completate', `${(existing.stops || []).filter(s => s.status !== 'pending').length} di ${(existing.stops || []).length}`],
          ['Nuovo ordine', p.header.odp_num]
        ]),
        confirmLabel: 'Chiudi e avvia il nuovo', danger: true, icon: '\u26A0'
      });
      if (!ok) return;
      /* I movimenti gi\u00e0 registrati restano: sono su mov_log, non qui. */
      await Store.endPickSession();
    }

    const session = {
      session_id: `PS-${p.header.odp_num.replace(/\s/g, '')}-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      odp_num: p.header.odp_num,
      odp_article: p.header.article_code,
      odp_article_desc: p.header.article_desc,
      odp_lot: p.header.lot,
      odp_qty: `${p.header.qty_planned} ${p.header.um}`,
      operator: this._prodOperator,
      status: 'active',
      created_at: Date.now(),
      site_order: PickRoute.getSiteOrder(),
      stops: p.stops,
      offroute: p.offroute,
      notes: p.notes,
      warnings: p.warnings
    };
    try {
      await Store.startPickSession(session);
    } catch (err) {
      return this.toast(`Avvio non riuscito · ${(err as Error).message}`, 'error');
    }
    this._routeParsed = null;
    this._routeStage = 'run';
    this._routeStartTime = Date.now();
    this._routeScan = { loc: '', art: '', lot: '' };
    this._formOrdine($('pickSubForm'));
    this.toast(`Percorso avviato · ${(session.stops || []).length} tappe`, 'success');
    this.updateSyncIndicator();
  },

  _routeResume() {
    this._routeStage = 'run';
    this._routeScan = { loc: '', art: '', lot: '' };
    if (!this._routeStartTime) this._routeStartTime = Date.now();
    this._formOrdine($('pickSubForm'));
  },

  async _routeAbandon() {
    const s = Store.getActivePickSession();
    if (!s) return;
    const done = (s.stops || []).filter(x => x.status === 'done').length;
    const left = (s.stops || []).filter(x => x.status === 'pending').length;
    const ok = await Dialog.confirm({
      title: 'Chiudere il percorso?',
      message: 'I prelievi gi\u00e0 confermati restano registrati a magazzino e a registro: sono stati scritti tappa per tappa. Viene chiusa soltanto la guida al cammino.',
      details: Dialog.kv([
        ['Ordine', s.odp_num],
        ['Tappe confermate', done],
        ['Tappe non percorse', left]
      ]),
      confirmLabel: 'Chiudi percorso', danger: true, icon: '\u26A0'
    });
    if (!ok) return;
    if (done) await this._emitFinalPickReport(s);
    await Store.endPickSession();
    this._routeStage = 'import';
    this._routeStartTime = null;
    this._formOrdine($('pickSubForm'));
    this.toast('Percorso chiuso', 'info');
  },

  /* ─── SCHERMATA 2: ESECUZIONE GUIDATA ───────────────────────────── */
  _renderRouteRun(el) {
    const s = Store.getActivePickSession();
    if (!s) { this._routeStage = 'import'; this._formOrdine(el); return; }

    const done    = (s.stops || []).filter(x => x.status === 'done').length;
    const missing = (s.stops || []).filter(x => x.status === 'missing').length;
    const pending = (s.stops || []).filter(x => x.status === 'pending');
    const current = pending[0] || null;
    const pct     = Math.round(((done + missing) / (s.stops || []).length) * 100);

    el.innerHTML = `
      <div class="route-runbar">
        <div class="route-runbar-top">
          <span class="mono route-runbar-odp">${this._esc(s.odp_num)}</span>
          <span class="route-runbar-count">${done + missing} / ${(s.stops || []).length}</span>
        </div>
        <div class="route-progress"><i style="width:${pct}%"></i></div>
        <div class="route-runbar-legend">
          <span>✓ ${done} prelevate</span>
          <span>✗ ${missing} non trovate</span>
          <span>◻ ${pending.length} da fare</span>
        </div>
      </div>

      <section id="routeCurrent">${current ? this._routeCurrentHTML(current) : this._routeFinishHTML(s)}</section>

      <details class="route-details">
        <summary>Elenco completo delle tappe (${(s.stops || []).length})</summary>
        <div class="route-list">${(s.stops || []).map(st => this._routeListRowHTML(st, current)).join('')}</div>
      </details>

      <div class="flex gap-5 mt-7 flex-wrap">
        <button class="btn btn-sm" onclick="App._printRouteReport()">🖨 Report parziale</button>
        <button class="btn btn-sm btn-danger" onclick="App._routeAbandon()">✕ Chiudi percorso</button>
      </div>`;

    if (current) {
      this._routeScan = { loc: '', art: '', lot: '' };
      this.setPrimaryScanField('rLoc');
    } else {
      this.setPrimaryScanField(null);
    }
  },

  _routeCurrentHTML(st) {
    const site = Store.getSite(st.site_id);
    return `
      <article class="route-stop-card">
        <header class="route-stop-head">
          <span class="route-stop-seq">${st.seq}</span>
          <div class="route-stop-title">
            <div class="route-stop-loc mono">${this._esc(st.location_code)}</div>
            <div class="route-stop-site">${this._esc(site?.name || st.site_id || '—')}</div>
          </div>
        </header>

        <div class="route-stop-body">
          <div class="route-stop-kv"><span>Articolo</span><b class="mono">${this._esc(st.article_code)}</b></div>
          <div class="route-stop-kv"><span>Descrizione</span><b>${this._esc(st.article_description || '—')}</b></div>
          <div class="route-stop-kv"><span>Lotto</span><b class="mono">${this._esc(st.lot_code)}</b></div>
          <div class="route-stop-kv"><span>Scadenza</span><b>${this._esc(this._isoToIt(st.expiry_iso))}</b></div>
          <div class="route-stop-kv route-stop-kg"><span>Richiesti da ordine</span><b>${this._fmtKg(st.kg_required)} ${this._esc(st.um)}</b></div>
          <div class="route-stop-kv"><span>Colli disponibili</span><b>${st.qty_available}</b></div>
        </div>

        ${this._avvisiBanda(st.article_code)}

        ${st.alternatives.length ? `<div class="route-alt">
          <strong>Altre ubicazioni con lo stesso articolo e lotto:</strong>
          ${(st.alternatives as Alternativa[]).map((a) => `<span class="badge badge-muted mono">${this._esc(a.location_code)} · ${a.qty_available} Coll.</span>`).join(' ')}
          <div class="text-label-small mt-2.5 opacity-80">Scansionandone una, la tappa si sposta l&agrave;.</div>
        </div>` : ''}

        <div class="form-group mt-6 mx-0 mb-4">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div class="flex gap-3">
          <input class="input input-mono" id="rLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('rLoc')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('rLoc');App._routeCheckLoc();}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('rLoc','_routeCheckLoc')" title="Sfoglia le ubicazioni">📍</button>
          </div>
        </div>
        <div class="form-group mb-4">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="rArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCheckArt();}">
        </div>
        <div class="form-group mb-4">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="rLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCheckLot();}">
        </div>

        <div id="rFeedback"></div>

        <div class="flex gap-5 mt-6 flex-wrap">
          <button class="btn btn-primary flex-1 font-extrabold min-h-[var(--md-touch)]"
            onclick="App._routeConfirmStop()">✓ CONFERMA PRELIEVO</button>
          <button class="btn btn-warning min-h-[var(--md-touch)]"
            onclick="App._routeMarkMissing()">✗ Non trovato</button>
        </div>
      </article>`;
  },

  _routeListRowHTML(st, current) {
    const isCur = current && st.seq === current.seq;
    const icon = st.status === 'done' ? '✓' : st.status === 'missing' ? '✗' : isCur ? '▶' : '◻';
    const cls  = st.status === 'done' ? 'ok' : st.status === 'missing' ? 'ko' : isCur ? 'cur' : '';
    return `<div class="route-list-row ${cls}">
      <span class="route-list-ico">${icon}</span>
      <span class="route-list-seq">${st.seq}</span>
      <span class="mono route-list-loc">${this._esc(st.location_code)}</span>
      <span class="mono route-list-art">${this._esc(st.article_code)}#${this._esc(st.lot_code)}</span>
      <span class="route-list-kg">${this._fmtKg(st.kg_required)} ${this._esc(st.um)}</span>
      ${st.status === 'done' ? `<span class="badge badge-green">${st.qty_picked} Coll.</span>` : ''}
      ${st.forced_note ? `<span class="badge badge-amber" title="${this._esc(st.forced_note)}">forzata</span>` : ''}
    </div>`;
  },

  /* ─── VERIFICHE DI SCANSIONE ────────────────────────────────────── */

  /* Ubicazione. Accetta quella prevista o una delle alternative: in tal caso
     la tappa si sposta, perché la merce è la stessa e l'operatore è già lì. */
  _routeCheckLoc() {
    const st = this._routeCurrentStop();
    if (!st) return;
    const val = Validate.clean($('rLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val === st.location_code) {
      this._routeScan.loc = val;
      this._routeFb('ok', `Ubicazione ${val} confermata`);
      $('rArt')?.focus();
      return;
    }
    const alt = (st.alternatives as Alternativa[]).find((a) => a.location_code === val);
    if (alt) {
      this._routeScan.loc = val;
      this._routeSwitchToAlternative(st, alt);
      return;
    }
    this._routeBlock('rLoc', 'Ubicazione errata',
      `Attesa ${st.location_code}, scansionata ${val}.`,
      async (note: string) => {
        if (!Store.locationExists(val)) {
          this.toast(`L'ubicazione ${val} non esiste a sistema`, 'error');
          return false;
        }
        st.location_code = val;
        st.forced_note = `Ubicazione forzata (attesa ${st.location_code}): ${note}`;
        this._routeScan.loc = val;
        await this._routeSave();
        return true;
      });
  },

  async _routeSwitchToAlternative(st, alt) {
    const s = Store.getActivePickSession();
    const old = st.location_code;
    st.alternatives = [
      { location_code: old, item_key: st.item_key, qty_available: Store.getAvailableQty(old, st.item_key) },
      ...(st.alternatives as Alternativa[]).filter((a) => a.location_code !== alt.location_code)
    ];
    st.location_code = alt.location_code;
    st.item_key = alt.item_key;
    st.qty_available = alt.qty_available;
    const g = Store.buildLocationGeometry().get(alt.location_code);
    if (g) st.site_id = g.site_id;
    await Store.savePickSession(s!);
    this._routeFb('ok', `Tappa spostata su ${alt.location_code} (ubicazione alternativa)`);
    Feedback.signal('info', 'Ubicazione alternativa',
      `La merce viene prelevata da ${alt.location_code} invece che da ${old}.`);
    this._renderRouteRun($('pickSubForm'));
    $('rLoc').value = alt.location_code;
    this._routeScan.loc = alt.location_code;
    $('rArt')?.focus();
  },

  _routeCheckArt() {
    const st = this._routeCurrentStop();
    if (!st) return;
    if (!this._routeScan.loc) {
      this._routeFb('error', 'Scansiona prima l\u2019ubicazione');
      $('rLoc')?.focus();
      return;
    }
    const val = Validate.clean($('rArt')?.value, true);
    if (!val) return;
    if (val === st.article_code) {
      this._routeScan.art = val;
      this._routeFb('ok', `Articolo ${val} confermato`);
      $('rLot')?.focus();
      return;
    }
    this._routeBlock('rArt', 'Articolo errato',
      `Atteso ${st.article_code}, scansionato ${val}.`,
      async (note: string) => {
        st.forced_note = `${st.forced_note ? st.forced_note + ' | ' : ''}Articolo forzato (atteso ${st.article_code}, letto ${val}): ${note}`;
        this._routeScan.art = st.article_code;
        await this._routeSave();
        return true;
      });
  },

  _routeCheckLot() {
    const st = this._routeCurrentStop();
    if (!st) return;
    if (!this._routeScan.art) {
      this._routeFb('error', 'Scansiona prima l\u2019articolo');
      $('rArt')?.focus();
      return;
    }
    const val = Validate.clean($('rLot')?.value);
    if (!val) return;
    if (val === st.lot_code) {
      this._routeScan.lot = val;
      this._routeFb('ok', 'Lotto confermato — pronto per la conferma');
      return;
    }
    this._routeBlock('rLot', 'Lotto errato',
      `Atteso ${st.lot_code}, scansionato ${val}. Il lotto \u00e8 assegnato dall\u2019ordine di produzione: forzarlo altera la tracciabilit\u00e0.`,
      async (note: string) => {
        st.forced_note = `${st.forced_note ? st.forced_note + ' | ' : ''}Lotto forzato (atteso ${st.lot_code}, letto ${val}): ${note}`;
        this._routeScan.lot = st.lot_code;
        await this._routeSave();
        return true;
      });
  },

  async _routeBlock(fieldId, title, message, onForce) {
    return this._scanBlock({
      fieldId, title, message, onForce,
      fbId: 'rFeedback',
      onUnlocked: () => this._renderRouteRun($('pickSubForm'))
    });
  },

  async _scanBlock({ fieldId, title, message, onForce, fbId, onUnlocked }) {
    Feedback.signal('error', title, message);
    this._scanFb(fbId, 'error', `${title} — ${message}`);
    const el = $(fieldId);
    el?.select();
    const proceed = await Dialog.confirm({
      title,
      message: message + '\n\nCorreggere la scansione, oppure sbloccare motivando.',
      confirmLabel: 'Sblocca motivando', cancelLabel: 'Correggo la scansione',
      danger: true, icon: '⛔'
    });
    if (!proceed) { el?.focus(); el?.select(); return; }
    const note = await Dialog.reason({
      title: 'Motivazione dello sblocco',
      message: 'Il testo viene registrato nelle note del movimento e compare sul documento.',
      placeholder: 'Es. etichetta danneggiata, verificato su Sage con CQ…',
      minLen: 8, confirmLabel: 'Sblocca', danger: true, icon: '⚠'
    });
    if (!note) { el?.focus(); return; }
    const ok = await onForce(note);
    if (ok) {
      this._scanFb(fbId, 'warn', `Sbloccato con motivazione: ${note}`);
      Feedback.signal('warn', 'Scansione sbloccata', 'La motivazione è stata registrata.');
      onUnlocked?.();
    }
  },

  /* Riscontro d'angolo, per qualunque modulo che verifichi scansioni. */
  _scanFb(fbId, kind, msg) {
    const el = $(fbId);
    if (!el) return;
    const cls = kind === 'ok' ? 'mov-preview-ok' : kind === 'warn' ? 'mov-preview-warn' : 'mov-preview-err';
    el.innerHTML = `<div class="mov-preview ${cls}"><span class="font-bold">${this._esc(msg)}</span></div>`;
  },

  _routeFb(kind, msg) { this._scanFb('rFeedback', kind, msg); },

  _routeCurrentStop() {
    const s = Store.getActivePickSession();
    return s ? ((s.stops || []).find(x => x.status === 'pending') || null) : null;
  },

  async _routeSave() {
    const s = Store.getActivePickSession();
    if (s) await Store.savePickSession(s);
  },

  async _routeConfirmStop() {
    const session = Store.getActivePickSession();
    const st = this._routeCurrentStop();
    if (!session || !st) return;
    if (!this._requireOperator('il prelievo guidato')) return;

    if (!this._routeScan.loc || !this._routeScan.art || !this._routeScan.lot) {
      Feedback.signal('error', 'Scansioni incomplete',
        'Servono ubicazione, articolo e lotto prima di confermare.');
      return;
    }

    // ── Re-check sullo stato attuale, non su quello di quando è nato il percorso
    const bucket = Store.getItemsAtLocation(st.location_code);
    const full = bucket.find(x => x.item_key === st.item_key);
    if (!full) {
      return this.toast(`${st.article_code}#${st.lot_code} non \u00e8 pi\u00f9 presente in ${st.location_code}`, 'error');
    }
    if (Store.isItemQuarantined(st.item_key, st.location_code)) {
      return this.toast(`${st.article_code}#${st.lot_code} \u00e8 stato messo in QUARANTENA: prelievo non consentito`, 'error');
    }
    const avail = Store.getAvailableQty(st.location_code, st.item_key);
    if (avail <= 0) {
      return this.toast(`${st.article_code}#${st.lot_code}: nessun collo disponibile (impegnato su DDT pendente)`, 'error');
    }

    // ── Quantità in COLLI. I kg dell'ordine restano un dato informativo:
    //    la giacenza a peso vive su Sage, qui si tracciano i colli.
    const qty = await Dialog.qty({
      title: 'Colli prelevati',
      message: `Ordine: ${this._fmtKg(st.kg_required)} ${st.um}. Indicare quanti COLLI vengono portati via.`,
      details: Dialog.kv([
        ['Ubicazione', st.location_code],
        ['Articolo', st.article_code],
        ['Lotto', st.lot_code],
        ['Colli disponibili', avail]
      ]),
      value: avail, min: 1, max: avail, unit: 'Coll.'
    });
    if (qty === null) return;

    /* 1.8 — quali colli, sulla riga che l'operatore ha davanti. Il numero
       chiesto sopra resta la misura del prelievo; l'elenco dice quali colli
       lasciano lo scaffale, e su un lotto imballato in due misure diverse i
       due dati non sono lo stesso dato. */
    const scelteColli = await this._chiediColli(
      { article_code: st.article_code, lot_code: st.lot_code, location_code: st.location_code, item_key: st.item_key,
        ...(Store.getItemsAtLocation(st.location_code).find(i => i.item_key === st.item_key) || {}) },
      'Quali colli si prelevano');
    if (scelteColli === undefined) return this.toast('Prelievo annullato', 'info');

    const effectiveUser = this._prodOperator || Store.getCurrentIdentity().initials;
    const notes = st.forced_note || '';
    let removed = null;

    try {
      removed = await Store.commitPickStop({
        session,
        stop: st,
        qty,
        scelte: scelteColli,
        movement: {
          type: MOV.PICK,
          article_code: st.article_code,
          article_description: st.article_description,
          lot_code: st.lot_code,
          location_code: st.location_code,
          dest_location: null,
          user: effectiveUser,
          notes,
          doc_ref: session.odp_num,
          ts: Date.now()
        }
      });
    } catch (err) {
      console.error('[WM] _routeConfirmStop:', err);
      st.status = 'pending'; st.qty_picked = 0; st.done_at = null;
      return this.toast(`Prelievo non registrato \u00b7 ${(err as Error).message} \u2014 nessuna modifica applicata`, 'error');
    }

    /* Il registro di sessione a video e la finestra di storno restano
       coerenti con gli altri flussi. */
    this._movSessionLog.unshift({
      type: MOV.PICK, article_code: st.article_code, article_description: st.article_description,
      lot_code: st.lot_code, location_code: st.location_code, dest_location: null,
      user: effectiveUser, notes, doc_ref: session.odp_num, ts: Date.now(),
      qty_before: removed!._qty_before, qty_delta: removed!._qty_delta, qty_after: removed!._qty_after
    });
    if (this._movSessionLog.length > 100) this._movSessionLog.length = 100;

    /* 2.0 — L'AZIONE DI ANNULLAMENTO PORTA LE MISURE, non solo un numero di
       colli. Era l'unica delle quattro a non portare nemmeno `qty_uom`:
       stornare una tappa rimetteva colli PIENI, e un collo aperto per
       prendere dieci chili tornava da venticinque. `packs_prima` serve a
       richiudere quel collo invece di accodarne uno nuovo. */
    this._pushUndo(`Tappa ${st.seq} — ${st.article_code}#${st.lot_code} da ${st.location_code} (${qty} Coll.)`,
      [{ op: 'add', loc: st.location_code, art: st.article_code, desc: st.article_description,
         lot: st.lot_code, exp: full.expiry_date || '', notes: full.notes || '',
         qty: removed!._packs_out?.length || qty,
         qty_uom: this._umMossa(removed),
         packs: removed!._packs_out ?? null,
         packs_prima: removed!._packs_before ?? null }]);

    Feedback.signal('ok', `Tappa ${st.seq} completata`, `${qty} Coll. da ${st.location_code}`);
    this.updateSyncIndicator();
    this._renderRouteRun($('pickSubForm'));
    this._refreshSessionLog();
  },

  async _routeMarkMissing() {
    const session = Store.getActivePickSession();
    const st = this._routeCurrentStop();
    if (!session || !st) return;
    const note = await Dialog.reason({
      title: 'Merce non trovata',
      message: `Tappa ${st.seq} — ${st.article_code}#${st.lot_code} in ${st.location_code}.\nLa tappa viene marcata e il percorso prosegue.`,
      placeholder: 'Es. ubicazione vuota, pallet non reperibile, bancale spostato…',
      minLen: 5, confirmLabel: 'Marca non trovato', icon: '\u2717'
    });
    if (!note) return;
    st.status = 'missing';
    st.reason = 'marked_missing';
    st.forced_note = note;
    st.done_at = Date.now();
    try {
      await Store.savePickSession(session);
    } catch (err) {
      st.status = 'pending';
      return this.toast(`Salvataggio non riuscito · ${(err as Error).message}`, 'error');
    }
    Feedback.signal('warn', 'Tappa marcata come non trovata', 'Finir\u00e0 in coda al percorso.');
    this._renderRouteRun($('pickSubForm'));
  },

  /* ─── SCHERMATA 3: CHIUSURA ─────────────────────────────────────── */
  _routeFinishHTML(s: SessionePrelievo) {
    const done    = (s.stops || []).filter((x) => x.status === 'done');
    const missing = (s.stops || []).filter((x) => x.status === 'missing');
    const tail    = [
      ...missing.map((x) => ({
        article_code: x.article_code, description: x.article_description, lot_code: x.lot_code,
        kg_required: x.kg_required, um: x.um, reason: 'marked_missing',
        detail: `Ubicazione prevista ${x.location_code}.`, forced_note: x.forced_note
      })),
      ...(s.offroute || [])
    ];
    return `
      <div class="route-done">
        <div class="route-done-ico">✓</div>
        <strong>Percorso completato</strong>
        <div>${done.length} tappe prelevate su ${(s.stops || []).length} per l'ordine ${this._esc(s.odp_num)}.</div>
      </div>

      ${tail.length ? `<div class="route-tail">
        <strong class="text-body-medium">📋 Da recuperare fuori percorso (${tail.length})</strong>
        <div class="text-body-small opacity-85 mt-2 mx-0 mb-4">
          Righe non prelevabili dalle aree mappate: materiale stoccato fuori mappatura,
          lotti assenti o merce non reperita.
        </div>
        ${tail.map(o => this._routeTailRowHTML(o)).join('')}
      </div>` : '<div class="pick-cart-empty">Nessuna riga rimasta in sospeso.</div>'}

      ${s.notes?.length ? `<div class="route-note-box">
        <strong>ℹ ${s.notes.length} segnalazione/i — merce esistente ma non prelevabile</strong>
        ${(s.notes || []).map((n) => `<div class="route-note-row">
          <span class="badge badge-${n.reason === 'quarantine' ? 'red' : 'amber'}">${this._esc((PickRoute.REASON_LABELS as Record<string, string>)[n.reason || ''] || n.reason)}</span>
          <span class="mono">${this._esc(n.article_code)}#${this._esc(n.lot_code)}</span>
          <span class="mono">${this._esc(n.location_code)}</span>
        </div>`).join('')}
      </div>` : ''}

      <div class="flex gap-5 mt-8 flex-wrap">
        <button class="btn btn-primary flex-1 font-extrabold min-h-[var(--md-touch)]"
          onclick="App._routeClose()">✓ CHIUDI E STAMPA REPORT</button>
      </div>`;
  },

  async _routeClose() {
    const s = Store.getActivePickSession();
    if (!s) return;
    await this._emitFinalPickReport(s);
    await Store.endPickSession();
    this._routeStage = 'import';
    this._routeStartTime = null;
    this._formOrdine($('pickSubForm'));
    this.toast(`Percorso ${s.odp_num} chiuso`, 'success');
  },

  /* ─── RIPRESA ALL'AVVIO ─────────────────────────────────────────── */
  /* Chiamata da init(). Se una sessione è sopravvissuta a una chiusura
     imprevista, l'operatore la ritrova qui invece di doverla ricostruire. */
  async _checkPendingPickSession() {
    const s = Store.getActivePickSession();
    if (!s) return;
    const done    = (s.stops || []).filter(x => x.status === 'done').length;
    const missing = (s.stops || []).filter(x => x.status === 'missing').length;
    const left    = (s.stops || []).filter(x => x.status === 'pending').length;
    if (!left) return;                       // già concluso: si riprende dalla scheda
    const resume = await Dialog.confirm({
      title: 'Percorso di prelievo in corso',
      message: 'Un percorso non \u00e8 stato concluso. I prelievi gi\u00e0 confermati sono registrati: qui si riprende soltanto il cammino rimasto.',
      details: Dialog.kv([
        ['Ordine', s.odp_num],
        ['Operatore', s.operator],
        ['Avviato il', new Date(s.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
        ['Tappe confermate', done],
        ['Non trovate', missing || null],
        ['Ancora da fare', left]
      ]),
      confirmLabel: 'Riprendi', cancelLabel: 'Non ora', icon: '\u23F8'
    });
    if (!resume) return;
    this._routeStage = 'run';
    this._pickSubMode = 'ordine';
    this.switchView('movimenta');
    this.startMov('prelievo');
    setTimeout(() => this._pickSub('ordine'), 60);
  },
} satisfies Vista;
