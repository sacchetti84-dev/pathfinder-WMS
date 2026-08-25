import { type Vista, $ } from './vista';
import { caricaExcel } from '../../modules/excel';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { OdpParser } from '../../modules/odpParser';
import { PickRoute } from '../../modules/pickRoute';
import { tappeAltrove, richiestaTrasferimento, tappaInAttesa, sitoDiCasa } from '../../modules/trasferimentiOdp';
import { etichettaTipo } from '../../modules/compiti';
import { descriviColli as descriviElencoColli, eccedenza as eccedenzaColli } from '../../modules/colli';
import { formattaQuantita } from '../../modules/misure';
import type { Percorso, Tappa } from '../../modules/pickRoute';
import type { TestataODP } from '../../modules/odpParser';
import type { SessionePrelievo } from '../../types/entita';
import { ScanGuard } from '../../modules/scanGuard';
import { Dialog } from '../dialog';
import { Feedback } from '../feedback';

/* Dove altro sta lo stesso lotto, quando la tappa non lo trova. */
type Alternativa = { location_code: string; item_key: string; qty_available: number };

/* Una pausa dichiarata: un'ora d'inizio, una di fine — nulla se è quella in
   corso — e chi l'ha presa. */
type Pausa = { from: number; to: number | null; by?: string };

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
  /* 2.5 — PER QUALE TAPPA VALE LA SCANSIONE QUI SOPRA.

     `_routeScan` era azzerato dal render, e il render non è l'unico modo di
     tornare su questa schermata: si rientra dalla scheda, dalla ripresa
     all'avvio, dal cambio di sottomodo. Bastava una di quelle strade perché
     la spunta di un'ubicazione scansionata mezz'ora prima valesse ancora, e
     l'operatore confermasse un prelievo senza essere passato dal vano.

     La scansione vale per una tappa e per una sola apertura: qui si scrive
     `<seq>@<apertura>`, e ogni cosa che non corrisponde è da rifare. */
  _routeScanChiave: '',
  /* Cambia a ogni ingresso nella schermata di esecuzione: è la metà
     «apertura» della chiave qui sopra. */
  _routeApertura: 0,
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

    /* 1.10 — quali tappe stanno fuori dal magazzino di partenza.
       2.1 — e il magazzino di partenza adesso si può dichiarare: la tendina
       sta qui sotto, e questa riga è la stessa che ordina il giro. */
    const casa = sitoDiCasa(p.stops, PickRoute.getSiteOrder(), PickRoute.getCasaScelta());
    const siti = [...new Set(p.stops.map((s) => s.site_id).filter(Boolean))] as string[];
    const sceltaCasaHTML = siti.length > 1 ? `
      <div class="route-warn mb-5">
        <strong>Magazzino di partenza</strong>
        <div class="flex items-center gap-3 mt-3 flex-wrap">
          <select class="input select w-auto" id="routeCasa" onchange="App._routeSetCasa(this.value)">
            <option value="">Dove l'ordine ha più righe (${this._esc(Store.getSite(casa)?.name || casa)})</option>
            ${siti.map((id) => `<option value="${this._esc(id)}" ${PickRoute.getCasaScelta() === id ? 'selected' : ''}>
              ${this._esc(Store.getSite(id)?.name || id)} — ${p.stops.filter((s) => s.site_id === id).length} righe</option>`).join('')}
          </select>
          <span class="text-label-small text-sx-text-muted">
            Le righe che stanno qui si prelevano dirette: non chiedono nessun trasferimento intermedio.
          </span>
        </div>
      </div>` : '';
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

      ${sceltaCasaHTML}
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
          <span class="route-prev-kg">${this._qtaOrdine(s.kg_required, s.um)} ${this._esc(s.um)}</span>
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
        Lotto <strong>${this._esc(s.lot_code)}</strong> · <strong>${this._qtaOrdine(s.kg_required, s.um)} ${this._esc(s.um)}</strong> richiesti dall’ordine<br>
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
    this._routeApplicaTrasf(sitoDiCasa(p?.stops, PickRoute.getSiteOrder(), PickRoute.getCasaScelta()));
    this.closeModal();
    this._formOrdine($('pickSubForm'));
    this.toast(`↔ ${etichettaTipo('TRANSFER')} in coda — ${rec?.task_id}: ${s.article_code}#${s.lot_code} verso ${dest}`, 'success');
  },

  /* 2.1 — la scelta del magazzino di partenza ricostruisce il giro: da
     dove si comincia cambia l'ordine delle tappe e quali righe risultano
     «in un altro magazzino». Le richieste di trasferimento già fatte
     sopravvivono, come alla ricostruzione per l'ordine di visita. */
  _routeSetCasa(siteId) {
    PickRoute.setCasaScelta(String(siteId || '') || null);
    if (this._routeParsed) {
      const route = PickRoute.build(this._routeParsed.lines);
      this._routeParsed = { ...this._routeParsed, ...route };
      this._routeApplicaTrasf(sitoDiCasa(this._routeParsed.stops, PickRoute.getSiteOrder(), PickRoute.getCasaScelta()));
    }
    this._formOrdine($('pickSubForm'));
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
      <span class="route-tail-kg">${this._qtaOrdine(o.kg_required, o.um)} ${this._esc(o.um || '')}</span>
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
      this._routeApplicaTrasf(sitoDiCasa(this._routeParsed.stops, order, PickRoute.getCasaScelta()));
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

    /* 2.1 — UN ORDINE CHIUSO NON SI RICARICA. Il file di produzione porta
       lo stesso numero d'ordine di un ciclo gia' archiviato, e senza questa
       riga il percorso partiva: i prelievi scrivevano altri movimenti sotto
       quel numero e il conto sommava due lavorazioni. */
    if (Store.ordineWipArchiviato(p.header.odp_num)) {
      return this.toast(`L'ordine ${p.header.odp_num} e' chiuso e archiviato: il suo conto di produzione e' storia. Per una lavorazione nuova serve un numero d'ordine nuovo.`, 'error');
    }

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
    this._routeNuovaApertura();
    if (!this._routeStartTime) this._routeStartTime = Date.now();
    this._formOrdine($('pickSubForm'));
  },

  /* Ogni ingresso nella schermata di esecuzione è un'apertura nuova, e una
     scansione fatta nell'apertura precedente non vale più. */
  _routeNuovaApertura() {
    this._routeApertura = Date.now();
    this._routeScan = { loc: '', art: '', lot: '' };
    this._routeScanChiave = '';
  },

  /* ─── LA PAUSA ──────────────────────────────────────────────────────
     2.5 — CHI SI FERMA LO DICE, E IL REPORT LO SA.

     Il tempo medio di prelievo è la durata divisa per le righe, e finché la
     durata comprendeva il pranzo, il cambio turno e l'attesa del muletto,
     quel numero misurava le pause insieme al lavoro. Una pausa dichiarata è
     un fatto con un'ora d'inizio e una di fine, come ogni altro in questo
     applicativo, e si scrive sulla sessione perché è lì che il report la
     ritrova anche dopo una chiusura imprevista.

     IN PAUSA NON SI PRELEVA. La scheda della tappa sparisce: un campo di
     scansione che accetta merce mentre il turno è fermo è il modo di
     ritrovarsi un prelievo con l'ora sbagliata. */
  _routePausaAperta(s: SessionePrelievo | null | undefined): Pausa | null {
    const p: Pausa[] = (s?.pauses || []);
    const ultima = p[p.length - 1];
    return ultima && !ultima.to ? ultima : null;
  },

  /* I millisecondi fermi, pausa in corso compresa. */
  _routeMsInPausa(s: SessionePrelievo | null | undefined, adesso = Date.now()): number {
    return (s?.pauses || []).reduce((acc: number, x: Pausa) =>
      acc + Math.max(0, (x.to ?? adesso) - x.from), 0);
  },

  async _routePausa() {
    const s = Store.getActivePickSession();
    if (!s) return;
    if (this._routePausaAperta(s)) return;
    const pauses = [...(s.pauses || []), {
      from: Date.now(), to: null,
      by: this._prodOperator || Store.getCurrentIdentity().initials,
    }];
    s.pauses = pauses;
    try {
      await Store.savePickSession(s);
    } catch (err) {
      s.pauses = pauses.slice(0, -1);
      return this.toast(`Pausa non registrata · ${(err as Error).message}`, 'error');
    }
    this.setPrimaryScanField(null);
    ScanGuard.clear();
    this._renderRouteRun($('pickSubForm'));
    this.toast('⏸ Prelievo in pausa — il tempo fermo non entra nella media', 'info');
  },

  async _routeRiprendi() {
    const s = Store.getActivePickSession();
    if (!s) return;
    const aperta = this._routePausaAperta(s);
    if (!aperta) return;
    aperta.to = Date.now();
    try {
      await Store.savePickSession(s);
    } catch (err) {
      aperta.to = null;
      return this.toast(`Ripresa non registrata · ${(err as Error).message}`, 'error');
    }
    /* Si torna in corsia da capo: l'ubicazione si riscansiona, perché fra
       l'inizio della pausa e adesso l'operatore si è mosso. */
    this._routeNuovaApertura();
    this._renderRouteRun($('pickSubForm'));
    this.toast('▶ Prelievo ripreso', 'success');
  },

  /* Il riassunto che sta nella LEGENDA: quante pause e quanto tempo fermo.
     Vuoto finché nessuno si è fermato — una legenda che dice «0 pause» conta
     una cosa che non è successa. Mentre la pausa è aperta tace, perché sopra
     c'è il pannello intero e ripetersi in due punti è rumore. */
  _routeFermoHTML(s: SessionePrelievo | null | undefined) {
    if (this._routePausaAperta(s)) return '';
    const fatte = (s?.pauses || []).filter((x: Pausa) => x.to).length;
    const fermo = this._routeMsInPausa(s);
    if (fermo <= 0) return '';
    return `<span class="route-pause-info">⏸ ${fatte} paus${fatte === 1 ? 'a' : 'e'} · ${this._esc(this._fmtDurLong(fermo / 1000))} fermo</span>`;
  },

  /* Il pannello della pausa IN CORSO. Vuoto quando non ce n'è una aperta:
     chi lo chiama lo mette solo lì, e restituire il riassunto da qui vorrebbe
     dire che lo stesso testo esce in due posti diversi. */
  _routePausaHTML(s: SessionePrelievo | null | undefined) {
    const aperta = this._routePausaAperta(s);
    if (!aperta) return '';
    return `<div class="route-paused">
      <div class="route-paused-ico">⏸</div>
      <div class="route-paused-txt">
        <strong>Prelievo in pausa</strong>
        <div>Dalle ${this._esc(this._fmtClock(aperta.from))}${aperta.by ? ' · ' + this._esc(aperta.by) : ''}. Il tempo fermo non entra nel tempo medio di prelievo.</div>
      </div>
      <button class="btn btn-success min-h-[var(--md-touch)]" onclick="App._routeRiprendi()">▶ Riprendi</button>
    </div>`;
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
    const inPausa = !!this._routePausaAperta(s);

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
          ${this._routeFermoHTML(s)}
        </div>
      </div>

      ${inPausa ? this._routePausaHTML(s) : ''}

      <section id="routeCurrent">${inPausa ? '' : (current ? this._routeCurrentHTML(current) : this._routeFinishHTML(s))}</section>

      <details class="route-details">
        <summary>Elenco completo delle tappe (${(s.stops || []).length})</summary>
        <div class="text-label-small text-sx-text-muted py-1.5 px-0.5">
          Una tappa già prelevata si può riaprire per correggere i colli: toccala nell'elenco.
        </div>
        <div class="route-list">${(s.stops || []).map(st => this._routeListRowHTML(st, current)).join('')}</div>
      </details>

      <div class="flex gap-5 mt-7 flex-wrap">
        ${current && !inPausa ? `<button class="btn btn-sm btn-warning min-h-[var(--md-touch)]" onclick="App._routePausa()">⏸ Pausa</button>` : ''}
        <button class="btn btn-sm" onclick="App._printRouteReport()">🖨 Report parziale</button>
        <button class="btn btn-sm btn-danger" onclick="App._routeAbandon()">✕ Chiudi percorso</button>
      </div>`;

    /* 2.5 — LA SCANSIONE SI RIFÀ A OGNI TAPPA E A OGNI APERTURA.
       `_routeScan` si azzera qui come prima, ma adesso porta anche PER CHI
       vale: la chiave dice tappa e apertura, e `_routeConfermaScansioni` la
       ricontrolla prima di scrivere. Azzerarlo e basta non bastava — questo
       render non è l'unico modo di tornare davanti alla scheda. */
    if (current && !inPausa) {
      this._routeScan = { loc: '', art: '', lot: '' };
      this._routeScanChiave = '';
      this.setPrimaryScanField('rLoc');
    } else {
      this.setPrimaryScanField(null);
    }
  },

  /* 2.5 — LA QUANTITÀ D'ORDINE SI SCRIVE CON I DECIMALI DELLA SUA UNITÀ.
     `_fmtKg` ne forza tre: è giusto per i chili di un ODP — 44,420 KG — e su
     una riga in PZ scriveva «500,000 PZ», cinquecento pezzi vestiti da
     pesata. Peggio ancora accanto alle UM prelevate, che l'unità la leggono:
     lo stesso numero in due celle vicine, scritto in due modi. */
  _qtaOrdine(v, um) {
    return formattaQuantita(v, um || null);
  },

  /* La chiave che lega una scansione alla tappa e all'apertura in cui è
     stata fatta. Cambia l'una o l'altra, e la spunta non vale più. */
  _routeChiaveScan(st) {
    if (!this._routeApertura) this._routeApertura = Date.now();
    return `${st?.seq ?? '?'}@${st?.location_code ?? ''}@${this._routeApertura}`;
  },

  _routeScanValida(st) {
    return !!this._routeScanChiave && this._routeScanChiave === this._routeChiaveScan(st);
  },

  /* ─── A) LA MERCE TRASFERITA ────────────────────────────────────────
     2.5 — LA TAPPA GUARDA LO SCAFFALE, NON IL SEME.

     `qty_available` è il numero che la tappa aveva il giorno in cui il
     percorso è nato: su una tappa spostata da un trasferimento vale zero per
     costruzione, perché in quel vano allora non c'era niente. Restava zero
     anche dopo che il trasferimento era stato eseguito e la merce era
     arrivata davvero — e la maschera continuava a dire «0 colli» davanti a
     uno scaffale pieno. Vale anche senza trasferimenti: fra l'import e la
     tappa un altro terminale può aver mosso quella riga.

     Qui si legge la giacenza di ADESSO, ogni volta. */
  _routeDisponibili(st) {
    if (!st?.location_code || !st?.item_key) return 0;
    return Store.getAvailableQty(st.location_code, st.item_key);
  },

  /* Lo stato del trasferimento che ha spostato la tappa, letto dalla coda.
     `null` quando la tappa non ne ha uno. */
  _routeStatoTrasf(st) {
    if (!st?.transfer_task && !st?.transfer_from) return null;
    const disponibili = this._routeDisponibili(st);
    const task = st.transfer_task ? Store.getTask(st.transfer_task) : null;
    return {
      task_id: st.transfer_task || '',
      da: st.transfer_from || '',
      stato: task?.status || (st.transfer_task ? 'sconosciuto' : 'non richiesto'),
      arrivata: disponibili > 0,
      disponibili,
    };
  },

  _routeTrasfBandaHTML(st) {
    const t = this._routeStatoTrasf(st);
    if (!t) return '';
    if (t.arrivata) {
      return `<div class="route-trasf route-trasf--ok">
        <strong>↔ Merce arrivata</strong>
        <div>Trasferita da <span class="mono">${this._esc(t.da || '—')}</span>${t.task_id ? ` · compito <span class="mono">${this._esc(t.task_id)}</span>` : ''}. In questo vano ci sono <strong>${t.disponibili}</strong> coll.: si preleva da qui.</div>
      </div>`;
    }
    const etichetta = t.stato === 'done' || t.stato === 'closed'
      ? 'Il compito risulta chiuso, ma in questo vano non c’è ancora niente.'
      : t.stato === 'in_progress'
        ? 'Il trasferimento è stato preso in carico: la merce sta arrivando.'
        : 'Il trasferimento è ancora in coda: nessuno l’ha preso in carico.';
    return `<div class="route-trasf route-trasf--wait">
      <strong>↔ Merce non ancora arrivata</strong>
      <div>Attesa da <span class="mono">${this._esc(t.da || '—')}</span>${t.task_id ? ` · compito <span class="mono">${this._esc(t.task_id)}</span>` : ''}. ${this._esc(etichetta)}</div>
      <div class="mt-2.5 flex gap-4 flex-wrap">
        <button class="btn btn-sm" onclick="App._renderRouteRun($('pickSubForm'))">↻ Ricontrolla il vano</button>
        <button class="btn btn-sm" onclick="App._routeSaltaTappa()">↷ Salta e vai avanti</button>
      </div>
    </div>`;
  },

  /* Una tappa che aspetta merce non blocca il giro: si rimanda in coda e si
     prosegue. NON è «non trovata» — quella è una constatazione a scaffale, e
     qui la merce esiste e sta arrivando. */
  async _routeSaltaTappa() {
    const session = Store.getActivePickSession();
    const st = this._routeCurrentStop();
    if (!session || !st) return;
    const stops = session.stops || [];
    const i = stops.indexOf(st);
    if (i === -1) return;
    if (stops.filter((x) => x.status === 'pending').length < 2) {
      return this.toast('È l’ultima tappa da fare: non c’è dove rimandarla', 'warning');
    }
    stops.splice(i, 1);
    stops.push(st);
    try {
      await Store.savePickSession(session);
    } catch (err) {
      return this.toast(`Salvataggio non riuscito · ${(err as Error).message}`, 'error');
    }
    this._routeNuovaApertura();
    this._renderRouteRun($('pickSubForm'));
    this.toast(`Tappa ${st.seq} rimandata in fondo al giro`, 'info');
  },

  _routeCurrentHTML(st) {
    const site = Store.getSite(st.site_id);
    /* 2.5 — la giacenza si legge ADESSO. Vedi `_routeDisponibili`. */
    const disponibili = this._routeDisponibili(st);
    const cfg = Store.getUomConfig(st.article_code, st.lot_code);
    const riga = Store.getItemsAtLocation(st.location_code).find((i) => i.item_key === st.item_key) || null;
    const elenco = riga ? Store.colliDiRiga(riga) : null;
    return `
      <article class="route-stop-card">
        <header class="route-stop-head">
          <span class="route-stop-seq">${st.seq}</span>
          <div class="route-stop-title">
            <div class="route-stop-loc mono">${this._esc(st.location_code)}</div>
            <div class="route-stop-site">${this._esc(site?.name || st.site_id || '—')}</div>
          </div>
        </header>

        ${this._routeTrasfBandaHTML(st)}

        <div class="route-stop-body">
          <div class="route-stop-kv"><span>Articolo</span><b class="mono">${this._esc(st.article_code)}</b></div>
          <div class="route-stop-kv"><span>Descrizione</span><b>${this._esc(st.article_description || '—')}</b></div>
          <div class="route-stop-kv"><span>Lotto</span><b class="mono">${this._esc(st.lot_code)}</b></div>
          <div class="route-stop-kv"><span>Scadenza</span><b>${this._esc(this._isoToIt(st.expiry_iso))}</b></div>
          <div class="route-stop-kv route-stop-kg"><span>Richiesti da ordine</span><b>${this._qtaOrdine(st.kg_required, st.um)} ${this._esc(st.um)}</b></div>
          <div class="route-stop-kv${disponibili <= 0 ? ' route-stop-vuoto' : ''}"><span>Colli in ubicazione</span><b>${disponibili}</b></div>
        </div>

        ${elenco && cfg ? `<div class="route-stop-colli">
          <span>Come sono imballati</span>
          <b class="mono">${this._esc(descriviElencoColli(elenco, cfg.uom))}</b>
        </div>` : ''}

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
    const fatta = st.status === 'done';
    /* 2.5 — UNA TAPPA GIÀ PRELEVATA SI RIAPRE. Chi si accorge di aver preso
       un collo di troppo tre tappe dopo non aveva nessun posto dove dirlo: il
       giro andava avanti e la correzione finiva a voce. La riga diventa un
       pulsante, e la rettifica scrive movimenti nuovi — il prelievo di prima
       resta a registro, perché è successo. */
    /* Le UM con i decimali della LORO unita': `_fmtKg` ne forza tre, e su un
       articolo in PZ scriverebbe «12,000 PZ». */
    const uom = st.uom_picked != null && st.um
      ? ` · ${this._esc(formattaQuantita(st.uom_picked, st.um))} ${this._esc(st.um)}` : '';
    const dentro = `<span class="route-list-ico">${icon}</span>
      <span class="route-list-seq">${st.seq}</span>
      <span class="mono route-list-loc">${this._esc(st.location_code)}</span>
      <span class="mono route-list-art">${this._esc(st.article_code)}#${this._esc(st.lot_code)}</span>
      <span class="route-list-kg">${this._qtaOrdine(st.kg_required, st.um)} ${this._esc(st.um)}</span>
      ${fatta ? `<span class="badge badge-green">${st.qty_picked} Coll.${uom}</span>` : ''}
      ${st.corrections ? `<span class="badge badge-amber" title="${this._esc(st.correction_note || '')}">rettificata ×${st.corrections}</span>` : ''}
      ${st.forced_note ? `<span class="badge badge-amber" title="${this._esc(st.forced_note)}">forzata</span>` : ''}`;
    if (!fatta) return `<div class="route-list-row ${cls}">${dentro}</div>`;
    return `<button type="button" class="route-list-row route-list-row--btn ${cls}"
      title="Correggi i colli prelevati su questa tappa"
      onclick="App._routeRettifica(${Number(st.seq)})">${dentro}
      <span class="route-list-edit">✏</span>
    </button>`;
  },

  /* ─── D) LA RETTIFICA DI UNA TAPPA GIÀ PRELEVATA ────────────────────
     2.5 — SI CORREGGE QUELLO CHE È USCITO, NON QUELLO CHE È SCRITTO.

     Il prelievo di prima resta a registro: è successo, e riscriverlo
     vorrebbe dire che il registro racconta una giornata diversa da quella
     che c'è stata. La rettifica RIMETTE A SCAFFALE i colli di troppo e
     scrive il movimento che li riporta — la stessa coppia dell'inventario,
     FIX− e FIX+, applicata a un prelievo.

     Solo IN MENO. Prendere altri colli non è una correzione, è un secondo
     prelievo: si fa con una tappa, e la tappa c'è già — questa maschera non
     inventa un movimento di uscita che nessuno ha scansionato. */
  async _routeRettifica(seq) {
    const session = Store.getActivePickSession();
    if (!session) return;
    if (this._routePausaAperta(session)) {
      return this.toast('Prelievo in pausa: premi ▶ Riprendi prima di rettificare', 'warning');
    }
    const st = (session.stops || []).find((x) => Number(x.seq) === Number(seq));
    if (!st || st.status !== 'done') return this.toast('Questa tappa non è stata prelevata', 'error');
    if (!this._requireOperator('la rettifica di un prelievo')) return;

    const presi = Number(st.qty_picked) || 0;
    if (presi <= 0) return this.toast('Su questa tappa non risulta nessun collo prelevato', 'error');

    const cfg = Store.getUomConfig(st.article_code, st.lot_code);
    const misure = Array.isArray(st.packs_picked) ? st.packs_picked : null;
    const dettaglio = misure && cfg
      ? descriviElencoColli(misure, cfg.uom)
      : `${presi} Coll.`;

    const resi = await Dialog.qty({
      title: `Rettifica tappa ${st.seq}`,
      message: `Quanti colli TORNANO a scaffale in ${st.location_code}. Il prelievo già registrato non si cancella: si scrive il movimento che li riporta indietro.`,
      details: Dialog.kv([
        ['Articolo', `${st.article_code}#${st.lot_code}`],
        ['Ubicazione', st.location_code],
        ['Prelevati', dettaglio],
        ['Richiesti da ordine', `${this._qtaOrdine(st.kg_required, st.um)} ${st.um}`],
      ]),
      value: 1, min: 1, max: presi, unit: 'Coll.',
    });
    if (resi === null) return;

    const nota = await Dialog.reason({
      title: 'Motivo della rettifica',
      message: 'Il testo va nelle note del movimento e compare sul report di prelievo.',
      placeholder: 'Es. collo di troppo, ordine cambiato, errore di conta…',
      minLen: 5, confirmLabel: 'Rettifica', icon: '✏',
    });
    if (!nota) return;

    /* Quali colli tornano: se il prelievo aveva le misure, si sceglie fra
       QUELLE — rimettere a scaffale «due colli» su un prelievo fatto di un
       25 e di un 7 sarebbe un saldo giusto sui colli sbagliati. */
    let daRimettere: number[] | null = null;
    if (misure && cfg) {
      const ordinate = [...misure].sort((a, b) => a - b);
      daRimettere = ordinate.slice(0, resi);
    }

    const effectiveUser = this._prodOperator || Store.getCurrentIdentity().initials;
    const notes = `Rettifica tappa ${st.seq} — ordine ${session.odp_num}: ${nota}`;
    const dove = String(st.location_code ?? '');
    const itemKey = String(st.item_key ?? `${st.article_code}#${st.lot_code}`);
    let res;
    try {
      res = await Store.addItem(dove, st.article_code, st.article_description || '',
        st.lot_code, '', notes, resi, null, daRimettere);
    } catch (err) {
      return this.toast(`Rettifica non applicata · ${(err as Error).message}`, 'error');
    }

    await this._logMov(MOV.REPOS, st.article_code, st.article_description || '', st.lot_code,
      dove, null, effectiveUser, notes, session.odp_num,
      res.qty_before ?? null, resi, res.qty_after ?? null,
      typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null);

    /* Il conto di produzione scende di quello che è tornato indietro: la
       merce non è entrata in lavorazione. Se non riesce, la rettifica resta —
       stessa regola della conferma: la merce è già a scaffale. */
    if (session.odp_num) {
      try {
        await Store.esceDaWip(session.odp_num, {
          item_key: itemKey,
          article_code: st.article_code,
          lot_code: st.lot_code,
          qty: resi,
          qty_uom: typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null,
          packs: daRimettere,
        });
      } catch (e) {
        this.toast(`Conto di produzione non aggiornato — ${(e as Error).message}. La rettifica resta valida.`, 'error');
      }
    }

    st.qty_picked = presi - resi;
    if (misure) st.packs_picked = misure.slice(resi).length ? [...misure].sort((a, b) => a - b).slice(resi) : [];
    if (cfg && st.packs_picked) st.uom_picked = st.packs_picked.reduce((a, n) => a + n, 0);
    st.corrections = (Number(st.corrections) || 0) + 1;
    st.correction_note = nota;
    if (st.qty_picked <= 0) { st.status = 'pending'; st.qty_picked = 0; st.done_at = null; }
    try {
      await Store.savePickSession(session);
    } catch (err) {
      this.toast(`Movimento scritto ma tappa non salvata · ${(err as Error).message}`, 'error');
    }

    this._routeNuovaApertura();
    this.updateSyncIndicator();
    this._renderRouteRun($('pickSubForm'));
    this._refreshSessionLog();
    Feedback.signal('ok', `Tappa ${st.seq} rettificata`, `${resi} Coll. tornati in ${dove}`);
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
      this._routeScanChiave = this._routeChiaveScan(st);
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
        /* 2.5 — L'ATTESA SI LEGGE PRIMA DI SOVRASCRIVERLA. La nota diceva
           «attesa <valore scansionato>» perché `st.location_code` era già
           stato riassegnato una riga sopra: la motivazione registrata
           nascondeva esattamente il dato per cui esiste. */
        const attesa = st.location_code;
        st.location_code = val;
        st.item_key = st.item_key || `${st.article_code}#${st.lot_code}`;
        st.forced_note = `Ubicazione forzata (attesa ${attesa}): ${note}`;
        this._routeScan.loc = val;
        this._routeScanChiave = this._routeChiaveScan(st);
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
    /* 2.5 — SPOSTARSI SU UN'ALTRA UBICAZIONE VUOL DIRE RISCANSIONARLA.
       Fino alla 2.4 il campo si riempiva da solo e la spunta veniva data per
       buona: l'operatore poteva confermare un prelievo da un vano davanti al
       quale non era mai passato. Il codice resta scritto nel campo perché
       serve a leggerlo, ma la spunta no — la chiave è quella della tappa
       vecchia, e `_routeScanValida` la rifiuta. */
    this._renderRouteRun($('pickSubForm'));
    $('rLoc').value = alt.location_code;
    this._routeFb('warn', `Tappa spostata su ${alt.location_code}: riscansiona l’ubicazione per confermare`);
    $('rLoc')?.focus();
    $('rLoc')?.select();
  },

  _routeCheckArt() {
    const st = this._routeCurrentStop();
    if (!st) return;
    if (!this._routeScan.loc || !this._routeScanValida(st)) {
      this._routeScan = { loc: '', art: '', lot: '' };
      this._routeScanChiave = '';
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
    if (!this._routeScan.art || !this._routeScanValida(st)) {
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

    /* 2.5 — LA PAUSA NON PRELEVA. La scheda sparisce quando il turno è
       fermo, ma la scorciatoia da tastiera no: si ferma qui. */
    if (this._routePausaAperta(session)) {
      return this.toast('Prelievo in pausa: premi ▶ Riprendi prima di confermare', 'warning');
    }
    if (!this._routeScan.loc || !this._routeScan.art || !this._routeScan.lot) {
      Feedback.signal('error', 'Scansioni incomplete',
        'Servono ubicazione, articolo e lotto prima di confermare.');
      return;
    }
    /* E le tre scansioni devono essere di QUESTA tappa e di QUESTA apertura:
       una spunta ereditata è un prelievo confermato senza passare dal vano. */
    if (!this._routeScanValida(st)) {
      this._routeScan = { loc: '', art: '', lot: '' };
      this._routeScanChiave = '';
      this._renderRouteRun($('pickSubForm'));
      return this.toast('Scansione non più valida per questa tappa: riscansiona l’ubicazione', 'warning');
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
      /* 2.5 — se la tappa aspettava un trasferimento, il messaggio lo dice:
         «nessun collo disponibile» su un vano che aspetta merce manda a
         cercare un DDT che non c'è. */
      const t = this._routeStatoTrasf(st);
      return this.toast(t
        ? `${st.article_code}#${st.lot_code}: la merce da ${t.da || 'l’altro magazzino'} non è ancora arrivata in ${st.location_code}${t.task_id ? ` (compito ${t.task_id})` : ''}`
        : `${st.article_code}#${st.lot_code}: nessun collo disponibile (impegnato su DDT pendente)`, 'error');
    }

    /* 2.2 — UNA DOMANDA SOLA. Fino alla 2.1 la tappa ne faceva due: prima
       «quanti colli», poi «quali». Con la scelta per misura la prima e' la
       somma della seconda, e chiederle tutte e due vuol dire far digitare
       due volte lo stesso numero — con la possibilita' che i due non
       coincidano. La maschera dei colli si apre gia' compilata sui chili che
       l'ordine chiede, e i colli prelevati sono quelli scelti.

       La domanda secca resta per le righe che i colli non li dichiarano: li'
       non c'e' niente da scegliere, e il numero e' l'unico dato che esista. */
    /* 2.5 — IL PRELIEVO PARTE DAGLI SPAIATI. I colli piccoli di una riga
       sono quasi sempre i residui aperti in un giro precedente: prenderli per
       primi li chiude, invece di lasciarli invecchiare dietro ai pieni. È una
       regola di magazzino chiesta da Andrea, e la finestra dice in anteprima
       di quanto si eccede rispetto all'ordine — perché il verso degli spaiati
       eccede più spesso di quello dei pieni, e chi conferma deve vederlo. */
    const scelteColli = await this._chiediColli(
      { article_code: st.article_code, lot_code: st.lot_code, location_code: st.location_code, item_key: st.item_key,
        ...(Store.getItemsAtLocation(st.location_code).find(i => i.item_key === st.item_key) || {}) },
      `Quali colli si prelevano · ordine ${this._qtaOrdine(st.kg_required, st.um)} ${st.um}`,
      null, { uom: st.kg_required }, 'spaiati');
    if (scelteColli === undefined) return this.toast('Prelievo annullato', 'info');

    let qty;
    if (scelteColli) {
      /* I colli TOCCATI, quello aperto compreso: e' il numero che la tappa
         segna come prelevato, ed e' la stessa regola del conto WIP. */
      qty = scelteColli.length;
    } else {
      qty = await Dialog.qty({
        title: 'Colli prelevati',
        message: `Ordine: ${this._qtaOrdine(st.kg_required, st.um)} ${st.um}. Indicare quanti COLLI vengono portati via.`,
        details: Dialog.kv([
          ['Ubicazione', st.location_code],
          ['Articolo', st.article_code],
          ['Lotto', st.lot_code],
          ['Colli disponibili', avail]
        ]),
        value: avail, min: 1, max: avail, unit: 'Coll.'
      });
      if (qty === null) return;
    }

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

    /* ═══ 2.1 — ANCHE IL PRELIEVO DA FILE FINISCE NEL CONTO ═══

       Il carrello di produzione portava la merce nel vano WIP dalla 1.14;
       il prelievo guidato da ODP — quello che nasce dal foglio Excel e che
       in magazzino è il più usato dei due — la faceva sparire dalla
       giacenza e basta. Due strade per lo stesso gesto, e il consumo reale
       di produzione contava solo quella meno battuta: «702 KG entrati, 0
       consumati» sarebbe stato il numero di ogni ordine prelevato da file.

       Il conto lo tiene l'ODP, e senza numero d'ordine non c'è conto da
       tenere — non è un errore, è un percorso che non nasce da un ordine.

       SE IL CONTO NON RIESCE, IL PRELIEVO NON SI ANNULLA: la merce è già
       fuori dallo scaffale, e rimetterla dentro per un problema di
       contabilità sarebbe muovere merce vera per un numero. Stessa regola
       del carrello, e sta scritta in tutti e due i posti. */
    if (session.odp_num) {
      try {
        const entrata = await Store.entraInWip(session.odp_num, {
          item_key: st.item_key,
          article_code: st.article_code,
          article_description: st.article_description,
          lot_code: st.lot_code,
          expiry_date: full.expiry_date || '',
          qty: removed!._packs_out?.length || Math.abs(removed!._qty_delta || qty),
          qty_uom: this._umMossa(removed),
          uom: Store.getUomConfig(st.article_code, st.lot_code)?.uom ?? null,
          packs: removed!._packs_out ?? null,
        });
        /* 2.2 — L'ARRIVO NEL VANO SI SCRIVE. Il prelievo diceva da dove la
           merce usciva e nient'altro: nel vano WIP compariva una giacenza che
           nessuna riga di registro aveva portato lì, e chi rileggeva il
           registro vedeva merce sparita dallo scaffale. Sono due fatti in due
           vani diversi, come la coppia FIX−/FIX+ dell'inventario, e il secondo
           si scrive solo se il conto è riuscito davvero. */
        await this._logMov(MOV.IN, st.article_code, st.article_description, st.lot_code,
          entrata.location_code, null, effectiveUser,
          `Entrata nel conto di produzione — ordine ${session.odp_num}`, session.odp_num,
          entrata.qty_before ?? null,
          (entrata.qty_after ?? 0) - (entrata.qty_before ?? 0),
          entrata.qty_after ?? null,
          typeof entrata.qty_uom_delta === 'number' ? entrata.qty_uom_delta : null);
      } catch (e) {
        this.toast(`Conto di produzione non aggiornato — ${(e as Error).message}. Il prelievo resta valido.`, 'error');
      }
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
