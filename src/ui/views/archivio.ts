import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { riepiloga, descriviContenuto, ETICHETTE_STATO, bancaliImpegnati } from '../../modules/bancale';
import type { Udc } from '../../types/entita';
import { ordina, alClic, segno, STATO_VUOTO } from '../../modules/tabella';
import type { Colonna, Stato } from '../../modules/tabella';
import type { Icona } from '../icone';

/* LE QUATTRO SORGENTI RIDOTTE A UNA FORMA SOLA.

   DDT, verbali, cartellini e rapporti non hanno niente in comune nel
   database: ce l'hanno in questa tabella, ed è questa riga qui. */
type GenereArchivio = 'ddt' | 'disposal' | 'nc' | 'pick' | 'odp' | 'udc';

type RigaArchivio = {
  kind: GenereArchivio;
  ts: number;
  num: string;
  title: string;
  sub: string;
  stato: { lbl: string; cls: string };
  search: string;
  print: string;
  /** 2.20 — un secondo foglio dallo stesso documento, dove esiste: la
      packing list del DDT. Assente sugli altri generi. */
  print2?: { azione: string; icona: Icona; titolo: string };
};

export const VistaArchivio = {
  _arcType: 'all' as GenereArchivio | 'all',
  _arcText: '',
  _arcFrom: '',
  _arcTo: '',

  _ARC_KINDS: {
    ddt:      { label: 'DDT di uscita',    icon: 'truck' },
    disposal: { label: 'Verbali smalt.',   icon: 'trash' },
    nc:       { label: 'Cartelli NC',      icon: 'ban' },
    pick:     { label: 'Report prelievo',  icon: 'clipboard-text' },
    /* 2.14 — GLI ORDINI DI PRODUZIONE CHIUSI. Stavano nella schermata WIP
       come una riga di pulsantini troncata a otto: un archivio che cresce
       ogni giorno e si sfoglia con gli occhi non è un archivio. Qui c'è la
       tabella che si ordina, si filtra e si cerca per data, la stessa degli
       altri quattro generi. */
    odp:      { label: 'Ordini chiusi',    icon: 'forklift' },
    /* 2.33 — LE UNITÀ DI CARICO. Stavano dietro una tessera di Movimenta,
       come se crearne una fosse un'operazione di magazzino: non lo è, è il
       modo in cui la merce viaggia, e nasce sempre dentro un altro lavoro.
       Qui c'è quel che ne è stato — chi porta ancora merce, chi è partito,
       chi è rimasto vuoto — con la stessa tabella degli altri cinque generi. */
    udc:      { label: 'Unità di carico',  icon: 'stack' }
  },

  /* Le quattro sorgenti ridotte a una forma sola. Ogni riga sa da dove
     viene, come si chiama e quale funzione la ristampa. */
  /* 2.29.2 — IN `sub` NON ENTRA UN'ICONA, E NON E' UNA PREFERENZA.
     La riga si disegna con `${this._esc(r.sub)}`: `_esc` scappa il markup,
     quindi un `_ico()` interpolato qui esce a video come la sua stringa —
     `<svg class="ico" aria-hidden="true"...`. Si vedeva su OGNI Cartello NC.

     E il rimedio non e' togliere `_esc`: `sub` porta ubicazione, motivo e
     operatore, cioe' testo che arriva dal database. Costruirlo gia' scappato
     vorrebbe dire che ogni produttore si ricorda di scappare i suoi pezzi, e
     il quinto scritto fra un mese se ne dimentica. L'escape sta in un punto
     solo, ed e' li' che deve stare: quel che non ci sta e' l'icona. Il
     genere ce l'ha gia', nella colonna Tipo. */
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
        print: `App._printDDT('${esc(d.doc_id)}')`,
        /* La packing list ha senso su un DDT che porta bancali: altrove
           sarebbe un foglio con una sola sezione «merce senza bancale». */
        print2: (d.lines || []).some((l) => l.udc_id)
          ? { azione: `App._printPackingList('${esc(d.doc_id)}')`, icona: 'package',
              titolo: 'Packing list — un bancale per blocco' }
          : undefined
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
        sub: `${q.qty || 1} Coll.${q.partial ? ' (parziale)' : ''} · ${q.blocked_location} · ${q.reason || '—'}`,
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

    /* 2.14 — GLI ORDINI DI PRODUZIONE CHIUSI. Il rendiconto non è un
       documento archiviato come gli altri quattro: si ricompone dai
       movimenti del conto ogni volta che si chiede. Per questo la riga porta
       il numero d'ordine e non un `doc_id` — non c'è nessun foglio messo da
       parte, c'è un conto che è storia e si rilegge. */
    /* 2.33 — le unità di carico, dalla più recente. Non è un documento
       emesso come gli altri cinque: è un contenitore, e quel che se ne dice
       è dove sta e che cosa porta. Per questo la data è quella della
       creazione, che è l'unico istante che un'unità ha sempre. */
    const impegnati = bancaliImpegnati(Store.getPendingOutbound());
    const CLASSE_STATO: Record<string, string> = {
      pronto: 'badge-green', impegnato: 'badge-amber', spedito: 'badge-muted', vuoto: 'badge-muted',
    };
    for (const u of (Store.getUdcList() as Udc[])) {
      const righe = Store.righeDiUdc(u.udc_id);
      const r = riepiloga(u, righe, impegnati);
      rows.push({
        kind: 'udc',
        ts: u.created_at || 0,
        num: u.udc_id,
        title: descriviContenuto(r),
        sub: `${r.colli} Coll.${u.location_code ? ` · ${u.location_code}` : ' · senza vano'}`
          + `${u.kind === 'pf' ? ' · prodotto finito' : ''}${u.odp_num ? ` · ordine ${u.odp_num}` : ''}`,
        stato: { lbl: ETICHETTE_STATO[r.stato] || r.stato, cls: CLASSE_STATO[r.stato] || 'badge-muted' },
        search: `${u.udc_id} ${u.location_code || ''} ${u.odp_num || ''} `
          + righe.map((x) => `${x.article_code} ${x.lot_code}`).join(' '),
        print: `App._udcEtichetta('${esc(u.udc_id)}')`,
      });
    }

    for (const a of Store.ordiniWipArchiviati()) {
      const c = Store.contoWip(a.odp_num);
      const serviti = Store.ordiniServitiWip(a.odp_num);
      rows.push({
        kind: 'odp',
        ts: a.chiuso_il || 0,
        num: a.odp_num,
        title: `Ordine ${a.odp_num}`,
        sub: `${c.righe.length} rig${c.righe.length === 1 ? 'a' : 'he'} · consumato ${c.consumato} Coll. · reso ${c.tornato}`
          + (serviti.length ? ` · giro di ${serviti.length + 1}` : ''),
        stato: { lbl: 'Chiuso', cls: 'badge-green' },
        search: `${a.odp_num} ${serviti.join(' ')} `
          + c.righe.map((r) => r.article_code + ' ' + r.lot_code).join(' '),
        print: `App._wipStampaRendiconto('${esc(a.odp_num)}')`
      });
    }

    return rows.sort((a, b) => b.ts - a.ts);
  },

  /* 2.1 — §3: le colonne si ordinano. La ricerca e le due date c'erano
     già; quello che mancava era poter mettere in fila per numero o per
     tipo. L'ordine di partenza resta il cronologico — su un archivio è
     l'unico che racconta come sono andate le cose — e il terzo clic ci
     riporta: vedi `alClic` in `modules/tabella.ts`. */
  _arcOrdine: STATO_VUOTO,

  _arcColonne(): Colonna<RigaArchivio>[] {
    return [
      { campo: 'ts', titolo: 'Data', tipo: 'numero' },
      { campo: 'kind', titolo: 'Tipo' },
      { campo: 'num', titolo: 'Numero' },
      { campo: 'title', titolo: 'Riferimento' },
      { campo: 'stato', titolo: 'Stato', valore: (r) => r.stato.lbl },
    ];
  },

  _arcOrdina(campo) {
    this._arcOrdine = alClic(this._arcOrdine, campo);
    this.renderArchive();
  },

  renderArchive() {
    const el = $('viewArchive');
    if (!el) return;

    /* `this` dentro una vista e' ancora `any` — lo diventera' in C2 — e
       quindi cio' che si legge da li' si nomina qui. */
    let rows: RigaArchivio[] = this._archiveRows();
    const generi = this._ARC_KINDS as Record<GenereArchivio, { label: string; icon: Icona }>;
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

    rows = ordina(rows, this._arcColonne(), this._arcOrdine as Stato);

    const th = (campo: string, titolo: string, classe = '') =>
      `<th class="sx-th-ord ${classe}" onclick="App._arcOrdina('${campo}')" title="Ordina per ${titolo}">${titolo}${segno(this._arcOrdine as Stato, campo)}</th>`;

    const chip = (id: string, lbl: string) => `<button class="config-tab ${this._arcType === id ? 'active' : ''}"
      onclick="App._arcType='${id}';App.renderArchive()">${lbl}</button>`;

    const conteggi: Record<string, number> = {};
    for (const r of this._archiveRows()) conteggi[r.kind] = (conteggi[r.kind] || 0) + 1;

    el.innerHTML = `
      <h1 class="text-title-large text-sx-primary font-bold mb-3.5">${this._ico('folders')} Archivio documenti</h1>
      <p class="text-body-small text-sx-text-secondary mb-7.5 leading-testo">
        Ogni documento emesso dall'applicativo, aperto o chiuso, ristampabile per tutta la durata di conservazione.
        La ristampa rilegge il documento archiviato: il foglio esce identico a quello del giorno di emissione.
      </p>

      <div class="config-tabs mb-6">
        ${chip('all', `Tutti (${totale})`)}
        ${Object.entries(generi).map(([id, k]) =>
          chip(id, `${this._ico(k.icon)} ${k.label} (${conteggi[id] || 0})`)).join('')}
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
          <button class="btn" onclick="App._arcReset()">${this._ico('x')} Azzera filtri</button>
        </div>
      </div>

      <div class="config-card">
        <h3>${rows.length} document${rows.length === 1 ? 'o' : 'i'}${rows.length !== totale ? ` su ${totale}` : ''}</h3>
        ${rows.length ? `<div class="overflow-x-auto">
          <table class="sx-table">
            <thead><tr>
              ${th('ts', 'Data', 'w-[130px]')}
              ${th('kind', 'Tipo', 'w-[110px]')}
              ${th('num', 'Numero', 'w-[150px]')}
              ${th('title', 'Riferimento')}
              ${th('stato', 'Stato', 'w-[105px]')}
              <th class="w-[100px]"></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>
                <td class="mono whitespace-nowrap">${r.ts ? this._fmtDateTime(r.ts) : '—'}</td>
                <td><span title="${this._esc(generi[r.kind].label)}">${this._ico(generi[r.kind].icon)} ${this._esc(generi[r.kind].label)}</span></td>
                <td class="mono font-semibold">${this._esc(r.num)}</td>
                <td>
                  <div class="font-semibold">${this._esc(r.title)}</div>
                  <div class="truncate text-label-small text-sx-text-muted">${this._esc(r.sub)}</div>
                </td>
                <td><span class="badge ${r.stato.cls}">${this._esc(r.stato.lbl)}</span></td>
                <td class="whitespace-nowrap">
                  <button class="btn btn-sm btn-ghost" onclick="${r.print}" title="Ristampa">${this._ico('printer')}</button>
                  ${r.print2 ? `<button class="btn btn-sm btn-ghost" onclick="${r.print2.azione}" title="${this._esc(r.print2.titolo)}">${this._ico(r.print2.icona, r.print2.titolo)}</button>` : ''}
                </td>
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
} satisfies Vista;
