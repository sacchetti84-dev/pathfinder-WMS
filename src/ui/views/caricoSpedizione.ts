import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { MOV } from '../../core/costanti';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { PickRoute } from '../../modules/pickRoute';
import { descriviContenuto, riepiloga, zoneCarico } from '../../modules/bancale';
import type { DocumentoUscita, RigaDocumento, Udc } from '../../types/entita';

/** Una tappa del giro di carico: UN BANCALE, non una riga. Chi carica il
    camion prende pallet interi, e sull'etichetta del pallet c'è il codice —
    articolo e lotto stanno sotto il cellophane. */
type TappaCarico = {
  udc_id: string;
  /** Dove sta il bancale quando il giro comincia. Si riscrive quando il
      bancale si sposta: chi rientra deve trovare il vano di adesso. */
  location_code: string;
  contenuto: string;
  colli: number;
  stato: 'attesa' | 'caricata' | 'saltata';
  motivo?: string;
  /** Dove è stato posato in baia. Serve al riscontro e a chi rientra. */
  baia?: string;
  done_at?: number | null;
};

type DocDelCarico = {
  doc_id: string;
  ddt_num: string;
  destination: string;
  /** Le righe del documento che NON escono da un bancale: si caricano a
      mano, non si scansionano, e non impediscono di evadere. */
  righe_sciolte: number;
  tappe: TappaCarico[];
};

type Carico = {
  carico_id: string;
  operator: string;
  status: 'active';
  created_at: number;
  updated_at?: number;
  /** La zona di baia scelta all'avvio: le posizioni si prendono lì dentro,
      una per bancale. */
  baia_sito: string;
  baia_zona: string;
  documenti: DocDelCarico[];
};

export const VistaCaricoSpedizione = {
  /* ═══ 2.21 · IL CARICO DELLE SPEDIZIONI ══════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

     Fino alla 2.20 un DDT si evadeva da una schermata, con un pulsante: chi
     spediva dichiarava che la merce era uscita, e quel che succedeva in
     mezzo — qualcuno che gira per il magazzino a raccogliere otto bancali —
     non era scritto da nessuna parte. Con un camion e sei documenti quel
     giro è mezz'ora di lavoro, e l'unico modo di sapere se un bancale è
     salito davvero era guardare il camion.

     È IL GIRO DI PRELIEVO, MA LE TAPPE SONO BANCALI. La serpentina è la
     stessa — `PickRoute.ordinaPerCorsia`, che è dove quella regola vive — e
     l'operatore scansiona SOLO il codice del pallet: articolo e lotto sono
     sotto il cellophane, e chiederglieli vorrebbe dire chiedergli di
     aprirlo.

     UN DDT PER VOLTA, E POI SI CHIEDE. Finite le tappe di un documento il
     sistema chiede se se ne carica un altro: il camion ne porta più di uno,
     e uscire e rientrare da una schermata a ogni documento sarebbe il gesto
     che si smette di fare. Alla fine si evade tutto insieme.

     I BANCALI FINISCONO IN BAIA, UNA POSIZIONE PER PALLET. Non è un
     dettaglio di comodo: due bancali dello stesso lotto nello stesso vano
     sono due righe con la stessa chiave e un saldo che dipende dall'ordine
     di caricamento — `moveUdc` lo rifiuta, e ha ragione. La baia è una zona
     con delle posizioni, e la mappa mostra che cosa sta salendo sul mezzo.

     UN DDT INCOMPLETO NON SI EVADE. Un bancale che non si trova si salta
     col motivo, e quel documento resta pendente: chi spedisce decide se
     partire lo stesso togliendo la riga, o se andare a cercarlo. Evadere un
     documento a cui manca un pallet vorrebbe dire scaricare dalla giacenza
     merce che è ancora a scaffale. */

  /** Il campo di scansione ha il fuoco: qui vive solo quel che non sta a
      database — il riscontro dell'ultima scansione. */
  _carEsito: '' as string,

  /** Il carico vive dentro la scheda di Spedizioni, non più in una maschera
      sua. Un punto solo da cui ridisegnarlo, perché i richiami sono sette e
      sbagliarne uno lascia la schermata ferma su quel che c'era prima.

      SI RIDISEGNA LA SCHEDA INTERA, non solo il corpo: il pallino sulla
      linguetta dice «c'è un carico in corso», e chiudendo il carico dal di
      dentro resterebbe acceso a dire una cosa che non è più vera. */
  _carRidisegna() {
    this._formSpedizioni($('movFormArea'));
  },

  _formCaricoSpedizione(el: HTMLElement) {
    const c = Store.getCaricoInCorso() as Carico | null;
    el.innerHTML = c ? this._carGiroHTML(c) : this._carAvvioHTML();
    if (c) this.setPrimaryScanField('carScan');
  },

  /* ── L'avvio: quale baia, e quale DDT ────────────────────────────────── */

  /** I DDT che si possono caricare: pendenti, e con almeno un bancale
      sopra. Un documento di sole righe sciolte non ha niente da
      scansionare, e proporlo qui vorrebbe dire un giro a zero tappe. */
  _carDocumentiCaricabili(): DocumentoUscita[] {
    return (Store.getPendingOutbound() as DocumentoUscita[])
      .filter(d => (d.lines || []).some(l => String(l.udc_id || '').trim()))
      .sort((a, b) => String(a.ddt_num || '').localeCompare(String(b.ddt_num || '')));
  },

  _carAvvioHTML() {
    const baie = zoneCarico(Store.getSites());
    const docs = this._carDocumentiCaricabili() as DocumentoUscita[];
    if (!baie.length) {
      return `<div class="mov-preview mov-preview-warn leading-larga">
        <strong>Nessuna zona è dichiarata baia di carico.</strong> Si marca in
        Configurazione → Siti e Zone, sulla zona dove i bancali aspettano il camion.
        Serve una zona con abbastanza <strong>posizioni</strong>: in baia va una posizione
        per bancale, perché due pallet dello stesso lotto non stanno nello stesso vano.
      </div>`;
    }
    const righe = docs.map((d: DocumentoUscita) => {
      const tappe = this._carTappeDaDoc(d) as TappaCarico[];
      const sciolte = (d.lines || []).filter((l: RigaDocumento) => !String(l.udc_id || '').trim()).length;
      return `<tr>
        <td class="mono font-bold">${this._esc(d.ddt_num || '—')}</td>
        <td>${this._esc(d.destination || '')}</td>
        <td class="mono">${this._esc(d.doc_date ? this._dateISOtoIT(d.doc_date) : '')}</td>
        <td class="mono td-right">${tappe.length}</td>
        <td class="mono td-right">${sciolte || ''}</td>
        <td><button class="btn btn-sm btn-success" onclick="App._carAvvia('${this._esc(d.doc_id)}')">Carica questo</button></td>
      </tr>`;
    }).join('');

    return `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① BAIA</span> → <span class="wf-step">② DDT</span> →
        <span class="wf-step">③ SCANSIONA I BANCALI</span> → un altro DDT, oppure si evade.
        I bancali prelevati vanno <strong>in baia</strong>, e la merce esce quando il documento si evade.
      </div>

      <div class="form-group mb-6">
        <label>① Baia di carico <span class="req">*</span></label>
        <select class="input" id="carBaia">
          ${baie.map(({ sito, zona }) => `<option value="${this._esc(sito.id)}|${this._esc(zona.id)}">${this._esc(sito.id)} · ${this._esc(zona.name)}</option>`).join('')}
        </select>
        <div class="text-label-small text-sx-text-muted mt-2">
          I bancali scansionati vengono spostati qui, una posizione per bancale.
        </div>
      </div>

      <strong class="block mb-3">② I DDT che si possono caricare</strong>
      ${docs.length ? `<div class="overflow-x-auto"><table class="sx-table"><thead><tr>
        <th>DDT</th><th>Destinatario</th><th>Data</th>
        <th class="td-right">Bancali</th><th class="td-right">Righe sciolte</th><th class="w-[140px]"></th>
      </tr></thead><tbody>${righe}</tbody></table></div>
      <div class="text-label-small text-sx-text-muted mt-3">
        ${docs.length} ${docs.length === 1 ? 'documento' : 'documenti'} pendenti con almeno un bancale.
        Le <strong>righe sciolte</strong> sono merce messa sul DDT senza passare da un pallet: si
        caricano a mano e non si scansionano.
      </div>`
      : `<div class="mov-preview leading-larga">
          <strong>Nessun DDT pendente porta bancali.</strong> Un documento si carica da qui solo
          quando le sue righe escono da un pallet: si spuntano i bancali in
          <strong>Prodotto finito</strong> e si registra il DDT in <strong>Spedizioni</strong>.
        </div>`}`;
  },

  /** Le tappe di un documento: un bancale per tappa, nell'ordine della
      serpentina. Le righe dello stesso pallet stanno insieme — chi carica
      prende il pallet, non le righe. */
  _carTappeDaDoc(doc: DocumentoUscita): TappaCarico[] {
    const perUdc = new Map<string, RigaDocumento[]>();
    for (const l of doc.lines || []) {
      const id = String(l.udc_id || '').trim();
      if (!id) continue;
      perUdc.set(id, [...(perUdc.get(id) ?? []), l]);
    }
    const tappe: TappaCarico[] = [];
    for (const [id, righe] of perUdc) {
      const u = Store.getUdc(id) as Udc | undefined;
      const r = u ? riepiloga(u, Store.righeDiUdc(id), null,
        (g) => Store.getUomConfig(g.article_code, g.lot_code)?.uom ?? null) : null;
      tappe.push({
        udc_id: id,
        /* L'ubicazione la dice il BANCALE e non la riga del documento: fra
           la registrazione del DDT e il carico il pallet può essersi
           spostato, e mandare l'operatore dove stava è mandarlo davanti a un
           vano vuoto. Senza unità si ripiega su quel che dice il documento. */
        location_code: String(u?.location_code || righe[0]?.location_code || ''),
        contenuto: r ? descriviContenuto(r) : `${righe[0]?.article_code}#${righe[0]?.lot_code}`,
        colli: righe.reduce((n, l) => n + (l.qty || 0), 0),
        stato: 'attesa',
        done_at: null,
      });
    }
    return PickRoute.ordinaPerCorsia(tappe);
  },

  async _carAvvia(docId: string) {
    if (!this._requireOperator('il carico di una spedizione')) return;
    const doc = Store.getPendingDoc(docId) as DocumentoUscita | undefined;
    if (!doc || doc.status !== 'pending') return this.toast('Documento non trovato o già evaso', 'error');

    const scelta = String($('carBaia')?.value ?? '');
    const [sito, zona] = scelta.split('|');
    if (!sito || !zona) return this.toast('Scegli la baia di carico', 'error');

    const tappe = this._carTappeDaDoc(doc) as TappaCarico[];
    if (!tappe.length) return this.toast(`${doc.ddt_num || docId}: nessun bancale da caricare`, 'error');

    const carico: Carico = {
      carico_id: `CAR-${Date.now().toString(36).toUpperCase()}`,
      operator: Store.getCurrentIdentity().initials || '',
      status: 'active',
      created_at: Date.now(),
      baia_sito: sito, baia_zona: zona,
      documenti: [this._carDocDelCarico(doc, tappe)],
    };
    try { await Store.salvaCarico(carico); }
    catch (e) { return this.toast((e as Error).message || 'Avvio non riuscito', 'error'); }
    this._carEsito = '';
    this.toast(`Carico avviato · DDT ${doc.ddt_num} · ${tappe.length} bancali`, 'success');
    this.updateSyncIndicator();
    this._carRidisegna();
  },

  /* ═══ 2.38 · IL CARICO AVVIATO DA UN'ATTIVITÀ ════════════════════════
     Fino alla 2.37 il carico si apriva solo da qui dentro: si sceglieva la
     baia, si sceglieva il DDT, si partiva. Chi in coda aveva un'attività di
     spedizione non aveva modo di dire «io sto caricando questo».

     LA BAIA SI CHIEDE LO STESSO, ed è l'unica cosa che il compito non sa:
     il DDT dice che cosa esce, non da quale banchina. Se un carico è già
     aperto la baia è quella, e questo DDT gli si aggiunge — è il caso del
     camion con sei documenti, che il carico sa già fare.

     UN DDT SENZA BANCALI PARTE LO STESSO, con zero tappe. Chi ha scelto
     «carico» sapendo che non c'è niente da scansionare — l'avviso gliel'ha
     detto — sta dichiarando che la merce sale a mano, e alla chiusura quel
     documento risulta completo e si evade. Rifiutarlo qui vorrebbe dire
     rimangiarsi la risposta data due schermate prima. */
  async _carAvviaDaCompito(t) {
    const docId = String((t?.payload as Record<string, unknown> | null)?.doc_id || '');
    const doc = Store.getPendingDoc(docId) as DocumentoUscita | undefined;
    if (!doc || doc.status !== 'pending') {
      return this.toast(`Il DDT di questa attività non è più pendente: non c'è niente da caricare.`, 'error');
    }
    if (!this._requireOperator('il carico di una spedizione')) return;

    this.switchView('movimenta');
    /* `load` è il nome vecchio della tessera, e apre Spedizioni già sulla
       scheda del carico: una chiamata sola, un disegno solo. */
    this.startMov('load');

    const c = Store.getCaricoInCorso() as Carico | null;
    if (c) {
      if (c.documenti.some((d) => d.doc_id === docId)) {
        this._carRidisegna();
        return this.toast(`DDT ${doc.ddt_num} è già in questo carico`, 'info');
      }
      await this._carScegliDdt(docId);
      return;
    }

    const baie = zoneCarico(Store.getSites());
    if (!baie.length) {
      this._carRidisegna();
      return this.toast('Nessuna zona è dichiarata baia di carico: si marca in Configurazione → Siti e Zone', 'error');
    }
    const scelta = baie.length === 1
      ? `${baie[0]!.sito.id}|${baie[0]!.zona.id}`
      : await Dialog.scelta<string>({
        title: 'Da quale baia si carica?',
        message: `I bancali del DDT ${doc.ddt_num || docId} vengono spostati qui, una posizione per bancale.`,
        opzioni: baie.map(({ sito, zona }) => ({
          label: `${sito.id} · ${zona.name || zona.id}`, value: `${sito.id}|${zona.id}`,
        })),
        icon: 'tir',
      });
    if (!scelta) { this._carRidisegna(); return; }
    const [sito, zona] = String(scelta).split('|');
    if (!sito || !zona) { this._carRidisegna(); return; }

    const tappe = this._carTappeDaDoc(doc) as TappaCarico[];
    const carico: Carico = {
      carico_id: `CAR-${Date.now().toString(36).toUpperCase()}`,
      operator: Store.getCurrentIdentity().initials || '',
      status: 'active',
      created_at: Date.now(),
      baia_sito: sito, baia_zona: zona,
      documenti: [this._carDocDelCarico(doc, tappe)],
    };
    try { await Store.salvaCarico(carico); }
    catch (e) { return this.toast((e as Error).message || 'Avvio non riuscito', 'error'); }
    this._carEsito = '';
    this.toast(tappe.length
      ? `Carico avviato · DDT ${doc.ddt_num} · ${tappe.length} bancali`
      : `Carico avviato · DDT ${doc.ddt_num} · nessun bancale da scansionare, la merce sale a mano`,
      tappe.length ? 'success' : 'warning');
    this.updateSyncIndicator();
    this._carRidisegna();
  },

  _carDocDelCarico(doc: DocumentoUscita, tappe: TappaCarico[]): DocDelCarico {
    return {
      doc_id: doc.doc_id,
      ddt_num: String(doc.ddt_num || ''),
      destination: String(doc.destination || ''),
      righe_sciolte: (doc.lines || []).filter(l => !String(l.udc_id || '').trim()).length,
      tappe,
    };
  },

  /* ── Il giro ─────────────────────────────────────────────────────────── */

  /** Il documento su cui si sta lavorando: il primo che ha ancora tappe in
      attesa, altrimenti l'ultimo aggiunto — che è quello appena finito. */
  _carDocCorrente(c: Carico): DocDelCarico | null {
    return c.documenti.find(d => d.tappe.some(t => t.stato === 'attesa'))
      ?? c.documenti[c.documenti.length - 1] ?? null;
  },

  _carGiroHTML(c: Carico) {
    const corrente = this._carDocCorrente(c) as DocDelCarico | null;
    if (!corrente) return this._carAvvioHTML();
    const restanti = corrente.tappe.filter(t => t.stato === 'attesa');
    const fatte = corrente.tappe.filter(t => t.stato !== 'attesa').length;
    const finito = !restanti.length;

    const riga = (t: TappaCarico, i: number) => `
      <tr class="${t.stato === 'attesa' ? '' : 'opacity-60'}">
        <td class="mono td-right">${i + 1}</td>
        <td class="mono font-bold">${this._esc(t.udc_id)}</td>
        <td class="mono">${this._esc(t.location_code)}</td>
        <td class="mono">${this._esc(t.contenuto)}</td>
        <td class="mono td-right">${t.colli}</td>
        <td>${t.stato === 'caricata'
          ? `<span class="badge badge-green">In baia${t.baia ? ` · ${this._esc(t.baia)}` : ''}</span>`
          : t.stato === 'saltata'
            ? `<span class="badge badge-amber" title="${this._esc(t.motivo || '')}">Saltata</span>`
            : `<span class="badge badge-muted">Da caricare</span>`}</td>
        <td class="whitespace-nowrap">${t.stato === 'attesa'
          ? `<button class="btn btn-sm" onclick="App._carSalta('${this._esc(t.udc_id)}')">Non lo trovo</button>`
          : ''}</td>
      </tr>`;

    return `
      <div class="wf-instructions">
        <strong>DDT ${this._esc(corrente.ddt_num || '—')}</strong>
        ${corrente.destination ? ` · ${this._esc(corrente.destination)}` : ''} ·
        <strong>${fatte} di ${corrente.tappe.length}</strong> bancali ·
        baia <span class="mono">${this._esc(c.baia_sito)}·${this._esc(c.baia_zona)}</span>
        ${c.documenti.length > 1 ? ` · ${c.documenti.length} DDT in questo carico` : ''}
      </div>

      ${finito ? `
        <div class="mov-preview mov-preview-ok mb-6 leading-larga">
          <strong>Tappe finite su questo DDT.</strong> Si carica un altro documento sullo
          stesso mezzo, oppure si chiude: alla chiusura i DDT completi vengono evasi e la
          merce esce dalla giacenza.
        </div>
        <div class="flex gap-4 flex-wrap mb-8">
          <button class="btn btn-primary" onclick="App._carAltroDdt()">+ Carica un altro DDT</button>
          <button class="btn btn-success btn-conferma" onclick="App._carChiudi()">${this._ico('check')} HO FINITO — EVADI</button>
          <button class="btn btn-danger" onclick="App._carAbbandona()">Abbandona</button>
        </div>`
      : this._carTappaHTML(c, corrente, restanti[0], fatte)}

      <div class="overflow-x-auto"><table class="sx-table"><thead><tr>
        <th class="w-[40px]">#</th><th>Bancale</th><th>Dove sta</th><th>Contenuto</th>
        <th class="td-right">Colli</th><th>Stato</th><th class="w-[130px]"></th>
      </tr></thead><tbody>${corrente.tappe.map(riga).join('')}</tbody></table></div>
      ${corrente.righe_sciolte ? `<div class="text-label-small text-sx-text-muted mt-3">
        ${this._ico('alert-triangle')} ${corrente.righe_sciolte} righe di questo DDT non escono da un bancale: si caricano a
        mano e non si scansionano. Non impediscono di evadere.
      </div>` : ''}

      ${c.documenti.length > 1 ? `<div class="mt-6">
        <strong class="block mb-2">Gli altri DDT di questo carico</strong>
        <div class="overflow-x-auto"><table class="sx-table"><thead><tr>
          <th>DDT</th><th>Destinatario</th><th class="td-right">Caricati</th><th class="td-right">Saltati</th>
        </tr></thead><tbody>${c.documenti.filter(d => d.doc_id !== corrente.doc_id).map(d => `<tr>
          <td class="mono font-bold">${this._esc(d.ddt_num || '—')}</td>
          <td>${this._esc(d.destination)}</td>
          <td class="mono td-right">${d.tappe.filter(t => t.stato === 'caricata').length} / ${d.tappe.length}</td>
          <td class="mono td-right">${d.tappe.filter(t => t.stato === 'saltata').length || ''}</td>
        </tr>`).join('')}</tbody></table></div>
      </div>` : ''}`;
  },

  /* ── LA TAPPA CORRENTE, COME LE ALTRE ───────────────────────────────────
     2.23 — Fino alla 2.22 questo giro non aveva una scheda: la tappa da fare
     era una RIGA DI TABELLA come tutte le altre, e chi caricava il camion
     doveva cercarsela in mezzo a quelle già fatte. Le altre quattro
     schermate che stanno davanti a un vano — prelievo guidato, conta,
     quarantena, scarico — la scheda ce l'avevano dalla 2.5, ed è la stessa
     `route-stop-card`: numero della tappa, il vano grande in monospaziato,
     e sotto i dati che servono a decidere se è la merce giusta.

     Il vano è il dato più grande della scheda perché è la domanda con cui si
     apre la tappa: DOVE DEVO ANDARE. Il codice del bancale viene subito
     dopo, ed è l'unica cosa che si scansiona — articolo e lotto stanno sotto
     il cellophane.

     L'ELENCO RESTA SOTTO, e serve a un'altra domanda: a che punto sono. È lo
     stesso schema del prelievo guidato, dove la scheda della tappa sta sopra
     e `route-list-row` elenca le altre. */
  _carTappaHTML(c: Carico, doc: DocDelCarico, tappa: TappaCarico, fatte: number) {
    const dove = this._getLocInfo(tappa.location_code);
    const sito = [dove?.siteName, dove?.zoneName].filter(Boolean).join(' · ');
    return `
      <article class="route-stop-card">
        <header class="route-stop-head">
          <span class="route-stop-seq">${fatte + 1}</span>
          <div class="route-stop-title">
            <div class="route-stop-loc mono">${this._esc(tappa.location_code)}</div>
            <div class="route-stop-site">${this._esc(sito || 'Raggiungi questa ubicazione')}</div>
          </div>
        </header>

        <div class="route-stop-body">
          <div class="route-stop-kv"><span>Bancale</span><b class="mono">${this._esc(tappa.udc_id)}</b></div>
          <div class="route-stop-kv"><span>Contenuto</span><b>${this._esc(tappa.contenuto)}</b></div>
          <div class="route-stop-kv route-stop-colli"><span>Colli</span><b>${tappa.colli}</b></div>
          <div class="route-stop-kv"><span>Va in baia</span><b class="mono">${this._esc(c.baia_zona)}</b></div>
        </div>

        <div class="form-group mt-6 mx-0 mb-4">
          <label>Scansiona il BANCALE <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="carScan" placeholder="Codice sull'etichetta del pallet"
            oninput="App._normScan('carScan')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('carScan');App._carScansiona();}">
          <div class="text-label-small text-sx-text-muted mt-2">
            Si scansiona <strong>solo il bancale</strong>: articolo e lotto stanno sotto il cellophane.
          </div>
        </div>

        <div class="mb-6" id="carEsito">${this._carEsito}</div>

        <div class="flex gap-5 mt-6 flex-wrap">
          <button class="btn btn-warning btn-conferma"
            onclick="App._carSalta('${this._esc(tappa.udc_id)}')">${this._ico('circle-x')} Non lo trovo</button>
          <button class="btn min-h-touch" onclick="App._carAbbandona()">Abbandona il carico</button>
        </div>
      </article>`;
  },

  /* ── La scansione ────────────────────────────────────────────────────── */

  async _carScansiona() {
    const c = Store.getCaricoInCorso() as Carico | null;
    if (!c) return;
    const codice = Validate.clean($('carScan')?.value, true);
    if (!codice) return;
    const campo = $('carScan') as HTMLInputElement | null;
    if (campo) campo.value = '';

    const corrente = this._carDocCorrente(c) as DocDelCarico | null;
    if (!corrente) return;
    const tappa = corrente.tappe.find(t => t.udc_id === codice);
    if (!tappa) {
      /* IL CODICE GIUSTO SUL DOCUMENTO SBAGLIATO NON È «SCONOSCIUTO»: chi
         ha in mano quel pallet deve sapere che serve, ma dopo. */
      const altrove = c.documenti.find(d => d.doc_id !== corrente.doc_id
        && d.tappe.some(t => t.udc_id === codice && t.stato === 'attesa'));
      return this._carFeedback('error', altrove
        ? `${codice} è del DDT ${altrove.ddt_num}, non di questo: si carica quando tocca a lui`
        : `${codice} non è su questo DDT`);
    }
    if (tappa.stato !== 'attesa') {
      return this._carFeedback('warn', `${codice} è già ${tappa.stato === 'caricata' ? 'in baia' : 'saltato'}`);
    }

    const vano = this._carVanoLibero(c, tappa.udc_id);
    if (!vano) {
      return this._carFeedback('error',
        'La baia non ha una posizione libera per questo bancale: si svuota la baia, o si configura una zona con più posizioni');
    }

    try {
      /* LA RIGA DEL CONTENITORE SI SCRIVE INTERA, come la scrive la maschera
         delle unità di carico: da dove a dove e CHI HA FIRMATO. §8 chiede
         quei campi, e una causale `UDC` che li porta da una schermata e non
         dall'altra è la stessa causale con due forme — chi legge il registro
         fra sei mesi non sa quale delle due sta guardando. */
      await Store.moveUdc(tappa.udc_id, vano, {
        type: MOV.UDC, article_code: '', article_description: '', lot_code: '',
        location_code: tappa.location_code, dest_location: vano,
        user: Store.getCurrentIdentity().initials, ts: Date.now(),
        notes: `Carico DDT ${corrente.ddt_num} — ${tappa.udc_id} in baia`,
      });
    } catch (e) {
      return this._carFeedback('error', (e as Error).message || 'Spostamento non riuscito');
    }

    /* IL DOCUMENTO DEVE SAPERE DOV'È LA MERCE ADESSO. Le sue righe portano
       l'ubicazione di quando è stato scritto, e l'evasione ci va a cercare
       la giacenza: senza questa riga il DDT si rifiuterebbe di evadere
       dicendo che la merce non c'è più, ed è vero — sta in baia. */
    try {
      await this._carRiallineaDoc(corrente.doc_id, tappa.udc_id, vano);
    } catch (e) {
      this._carFeedback('warn', `${tappa.udc_id} è in ${vano}, ma il DDT non si è aggiornato: ${(e as Error).message}`);
    }

    tappa.stato = 'caricata';
    tappa.location_code = vano;
    tappa.baia = vano;
    tappa.done_at = Date.now();
    await Store.salvaCarico(c);
    /* 2.38.3 — niente icona nel testo: la mette `_carRiscontro`, che sa
       quale va con «ok». Qui passava `_ico('check')` e usciva il markup. */
    this._carEsito = this._carRiscontro('ok', `${tappa.udc_id} → ${vano} · ${tappa.contenuto} · ${tappa.colli} colli`);
    this.updateSyncIndicator();
    this._carRidisegna();
  },

  /** Le righe del documento che escono da questo bancale prendono
      l'ubicazione nuova. Le altre restano come stanno. */
  async _carRiallineaDoc(docId: string, udcId: string, vano: string) {
    const doc = Store.getPendingDoc(docId) as DocumentoUscita | undefined;
    if (!doc) throw new Error('documento non trovato');
    const lines = (doc.lines || []).map(l =>
      String(l.udc_id || '') === udcId ? { ...l, location_code: vano } : l);
    await Store.updatePendingDoc(docId, { lines });
  },

  /* UNA POSIZIONE PER BANCALE, FINCHÉ CE NE SONO. La baia è una pianta, non
     un sacco: chi guarda la mappa deve vedere quanti pallet stanno per
     salire e quali, e tre unità impilate nello stesso vano si disegnano
     dentro la stessa casella. Si cerca prima una posizione VUOTA.

     Se la baia è piena si ripiega su una posizione dove il bancale ci sta
     comunque — `moveUdc` rifiuta solo un vano dove la stessa chiave sta già
     fuori da questa unità, perché due righe con la stessa chiave nello
     stesso vano danno un saldo che dipende dall'ordine di caricamento. Un
     camion non si ferma perché la baia è disegnata stretta; si ferma solo
     se non c'è proprio dove metterlo, e allora lo dice. */
  _carVanoLibero(c: Carico, udcId: string): string {
    const mie = new Set(Store.righeDiUdc(udcId).map(r => r.item_key));
    let ripiego = '';
    for (const u of Store.generateLocations(c.baia_sito, c.baia_zona)) {
      const stato = Store.getLocationStatus(u.code);
      if (stato === 'blocked' || stato === 'disabled') continue;
      const dentro = Store.getItemsAtLocation(u.code);
      if (!dentro.length) return u.code;
      if (ripiego) continue;
      if (dentro.some(r => r.udc_id !== udcId && mie.has(r.item_key))) continue;
      ripiego = u.code;
    }
    return ripiego;
  },

  _carFeedback(genere: 'error' | 'warn', testo: string) {
    this._carEsito = this._carRiscontro(genere, testo);
    const zona = $('carEsito');
    if (zona) zona.innerHTML = this._carEsito;
    this.toast(testo, genere === 'error' ? 'error' : 'warning');
    $('carScan')?.focus();
  },

  /* ═══ 2.38.3 · L'ICONA LA SCEGLIE IL GENERE, NON CHI SCRIVE IL TESTO ═══

     A video, in baia: `<svg class="ico" aria-hidden="true" focusable="false">
     <use href="#i-check"/></svg> UDC-000002 → MAG1-BAI1-01-01 · 24 colli`.
     Il riscontro della scansione mostrava il proprio markup invece
     dell'icona, sulla schermata che si guarda con un pallet in mano.

     LA CAUSA È UN SINK CHE SCAPPA, e la protezione è giusta: il testo qui
     porta codici arrivati da un lettore — `_esc` c'è perché un codice non
     deve poter iniettare markup. Sbagliato era passargli l'icona DENTRO il
     testo: chi chiamava scriveva `${this._ico('check')} …`, e `_esc` faceva
     esattamente il suo mestiere trasformandola in caratteri.

     IL RIMEDIO NON È MAI INDEBOLIRE LA PROTEZIONE — è la regola della
     2.29.2, e vale anche qui: non si toglie `_esc`, si dà l'icona nella
     forma che questo punto sa già trattare. Adesso il nome dell'icona lo
     decide il GENERE del riscontro, ed è markup composto qui; il testo
     resta testo e resta scappato. Un chiamante non ha più un modo di
     infilarci markup, nemmeno volendo — che è la differenza fra correggere
     un'occorrenza e chiudere una strada.

     È IL QUINTO SINK DELLA FAMIGLIA. La 2.29.2 ne aveva chiusi quattro —
     `toast`, `textContent`, `message:`/`title:` di Dialog, gli attributi —
     e la rete di `test/icone.test.js` li cerca per nome. `_esc` non era
     nell'elenco: una rete che ispeziona trova quel che le hanno insegnato a
     cercare, e questa strada non gliel'aveva insegnata nessuno. */
  _carRiscontro(genere: 'ok' | 'error' | 'warn', testo: string) {
    const classe = genere === 'ok' ? 'mov-preview-ok' : genere === 'error' ? 'mov-preview-err' : 'mov-preview-warn';
    const icona = genere === 'ok' ? 'check' : genere === 'error' ? 'circle-x' : 'alert-triangle';
    return `<div class="mov-preview ${classe} leading-larga">${this._ico(icona)} ${this._esc(testo)}</div>`;
  },

  /* ── Saltare una tappa ───────────────────────────────────────────────── */

  /* UN BANCALE CHE NON SI TROVA NON FERMA IL CAMION, MA FERMA IL SUO DDT.
     Si salta col motivo, e quel documento resta pendente: evaderlo
     vorrebbe dire scaricare dalla giacenza un pallet che è ancora a
     scaffale, e la differenza si scoprirebbe all'inventario. */
  async _carSalta(udcId: string) {
    const c = Store.getCaricoInCorso() as Carico | null;
    if (!c) return;
    const corrente = this._carDocCorrente(c) as DocDelCarico | null;
    const tappa = corrente?.tappe.find(t => t.udc_id === udcId);
    if (!corrente || !tappa || tappa.stato !== 'attesa') return;

    const motivo = await Dialog.reason({
      title: `Saltare ${udcId}?`,
      message: 'Il bancale resta dov’è e il DDT resta pendente: un documento a cui manca un pallet '
        + 'non si evade. Chi spedisce decide se partire lo stesso togliendo la riga, o se andarlo a cercare.',
      details: Dialog.kv([
        ['Bancale', udcId], ['Dove dovrebbe stare', tappa.location_code],
        ['Contenuto', tappa.contenuto], ['DDT', corrente.ddt_num],
      ]),
      placeholder: 'Non c’è nel vano, il vano è vuoto, il pallet è rotto…',
      confirmLabel: 'Salta la tappa', danger: true,
    });
    if (!motivo) return;

    tappa.stato = 'saltata';
    tappa.motivo = motivo;
    tappa.done_at = Date.now();
    await Store.salvaCarico(c);
    this._carEsito = this._carRiscontro('warn', `${udcId} saltato — ${motivo}`);
    this._carRidisegna();
  },

  /* ── Un altro DDT ────────────────────────────────────────────────────── */

  _carAltroDdt() {
    const c = Store.getCaricoInCorso() as Carico | null;
    if (!c) return;
    const gia = new Set(c.documenti.map(d => d.doc_id));
    const liberi = (this._carDocumentiCaricabili() as DocumentoUscita[]).filter(d => !gia.has(d.doc_id));
    if (!liberi.length) return this.toast('Non ci sono altri DDT pendenti con bancali', 'warning');

    this.showModal(`${this._ico('tir')} Quale DDT si carica adesso`,
      `<div class="max-h-[400px] overflow-y-auto">${liberi.map((d: DocumentoUscita) => {
        const n = (this._carTappeDaDoc(d) as TappaCarico[]).length;
        return `<div class="search-result-item" onclick="App._carScegliDdt('${this._esc(d.doc_id)}')">
          <span class="mono font-bold">${this._esc(d.ddt_num || '—')}</span>
          <span>${this._esc(d.destination || '')}</span>
          <span class="ml-auto text-label-small">${n} ${n === 1 ? 'bancale' : 'bancali'}</span>
        </div>`;
      }).join('')}</div>`);
  },

  async _carScegliDdt(docId: string) {
    this.closeModal();
    const c = Store.getCaricoInCorso() as Carico | null;
    if (!c) return;
    const doc = Store.getPendingDoc(docId) as DocumentoUscita | undefined;
    if (!doc || doc.status !== 'pending') return this.toast('Documento non trovato o già evaso', 'error');
    const tappe = this._carTappeDaDoc(doc) as TappaCarico[];
    /* 2.38 — UN DDT SENZA BANCALI ENTRA LO STESSO, e non è un cedimento.
       L'elenco «+ Carica un altro DDT» non lo propone nemmeno, quindi di
       qui non ci si arriva per sbaglio; ci si arriva da un'attività, dove
       chi ha scelto «carico» ha già letto l'avviso che dice che non c'è
       niente da scansionare. Il giro parte a zero tappe, il documento
       risulta completo, e alla chiusura si evade: la merce sale a mano. */
    if (!tappe.length) {
      this.toast(`${doc.ddt_num || docId}: nessun bancale da scansionare, la merce sale a mano`, 'warning');
    }
    c.documenti.push(this._carDocDelCarico(doc, tappe));
    await Store.salvaCarico(c);
    this._carEsito = '';
    if (tappe.length) this.toast(`DDT ${doc.ddt_num} · ${tappe.length} bancali da caricare`, 'success');
    this._carRidisegna();
  },

  /* ── La chiusura ─────────────────────────────────────────────────────── */

  /* SI EVADE ALLA FINE, E TUTTO INSIEME. Il camion parte una volta sola, e
     i documenti che ha a bordo escono nello stesso momento. L'evasione è
     quella di sempre — `_evadiSpedizione`, che sa già come un DDT scarica e
     come un conto terzi sposta invece di scaricare — perché una seconda
     copia sarebbe la seconda verità su come la merce esce di magazzino. */
  async _carChiudi() {
    const c = Store.getCaricoInCorso() as Carico | null;
    if (!c) return;
    if (!this._requireOperator('la chiusura del carico')) return;

    const completi = c.documenti.filter(d => d.tappe.every(t => t.stato === 'caricata'));
    const incompleti = c.documenti.filter(d => d.tappe.some(t => t.stato !== 'caricata'));
    const bancali = completi.reduce((n, d) => n + d.tappe.length, 0);

    if (!completi.length) {
      if (!await Dialog.confirm({
        title: 'Chiudere senza evadere niente?',
        message: 'Nessun DDT di questo carico è completo: restano tutti pendenti, e i bancali già '
          + 'caricati restano in baia. La merce non esce.',
        details: Dialog.kv(incompleti.map(d =>
          [d.ddt_num || d.doc_id, `${d.tappe.filter(t => t.stato === 'caricata').length} di ${d.tappe.length} bancali`] as [string, string])),
        confirmLabel: 'Chiudi il carico', danger: true,
      })) return;
      await Store.chiudiCarico();
      this._carEsito = '';
      this.toast('Carico chiuso — nessun DDT evaso', 'warning');
      return this._carRidisegna();
    }

    if (!await Dialog.confirm({
      title: `Evadere ${completi.length} ${completi.length === 1 ? 'DDT' : 'DDT'}?`,
      message: 'La merce viene SCARICATA dalla giacenza — o spostata, sulle causali di conto terzi. '
        + 'Si conferma a camion carico.',
      details: Dialog.kv([
        ['DDT completi', completi.map(d => d.ddt_num || d.doc_id).join(' · ')],
        ['Bancali caricati', bancali],
        ...(incompleti.length ? [['Restano pendenti',
          incompleti.map(d => `${d.ddt_num || d.doc_id} (manca ${d.tappe.filter(t => t.stato !== 'caricata').length})`).join(' · ')]] as [string, string][] : []),
      ]),
      confirmLabel: 'Evadi e chiudi', danger: true,
    })) return;

    /* L'evasione chiede una sua conferma per documento: è la stessa che si
       vede da Spedizioni, e toglierla qui vorrebbe dire due strade per lo
       stesso gesto, una delle quali più corta. Chi annulla lì lascia quel
       DDT pendente, e il carico lo dice. */
    const evasi: string[] = [];
    const falliti: string[] = [];
    for (const d of completi) {
      const prima = Store.getPendingDoc(d.doc_id);
      if (!prima || prima.status !== 'pending') continue;
      /* UN DOCUMENTO CHE NON SI EVADE NON TIENE IN OSTAGGIO IL CARICO. Se
         l'evasione si ferma — chi conferma dice di no, una riga non è più in
         giacenza, la rotta risponde male — quel DDT resta pendente e gli
         altri escono lo stesso. Senza questa guardia il carico restava
         aperto, e chi rientrava trovava un giro già fatto da rifare. */
      try {
        await this._evadiSpedizione(d.doc_id);
      } catch (e) {
        falliti.push(`${d.ddt_num || d.doc_id}: ${(e as Error).message || 'evasione non riuscita'}`);
      }
      const dopo = Store.getPendingDoc(d.doc_id);
      if (dopo?.status === 'evaded') evasi.push(d.ddt_num || d.doc_id);
      else if (!falliti.length) falliti.push(`${d.ddt_num || d.doc_id}: resta pendente`);
    }

    /* IL CARICO SI CHIUDE COMUNQUE: il giro è stato fatto, i bancali sono in
       baia, e tenere aperta la sessione perché un documento non è uscito
       vorrebbe dire rifare le tappe. Quel che resta pendente lo dice il
       riscontro, e si evade da Spedizioni. */
    try { await Store.chiudiCarico(); }
    catch (e) { this.toast(`Il carico non si è chiuso: ${(e as Error).message}`, 'error'); }
    this._carEsito = '';
    this.updateSyncIndicator();
    if (evasi.length) this.toast(`${evasi.length} DDT evasi — ${evasi.join(' · ')}`, 'success');
    else this.toast('Carico chiuso, nessun DDT evaso', 'warning');
    if (incompleti.length) {
      this.toast(`${incompleti.length} ${incompleti.length === 1 ? 'DDT resta pendente' : 'DDT restano pendenti'}: mancano dei bancali`, 'warning');
    }
    if (falliti.length) this.toast(`Non evasi: ${falliti.join(' · ')}`, 'warning');
    this._carRidisegna();
  },

  /* ABBANDONARE NON RIMETTE INDIETRO I BANCALI. Sono in baia davvero:
     qualcuno li ha spostati fisicamente, e riportarli a scaffale nel
     sistema vorrebbe dire scrivere un movimento che non è successo. Si
     spostano con la mappa, o con un carico nuovo. */
  async _carAbbandona() {
    const c = Store.getCaricoInCorso() as Carico | null;
    if (!c) return;
    const inBaia = c.documenti.reduce((n, d) => n + d.tappe.filter(t => t.stato === 'caricata').length, 0);
    if (!await Dialog.confirm({
      title: 'Abbandonare il carico?',
      message: inBaia
        ? 'I bancali già caricati RESTANO IN BAIA: sono stati spostati davvero, e il sistema non '
          + 'scrive un movimento che non è successo. I DDT restano pendenti.'
        : 'Non è stato caricato niente. I DDT restano pendenti.',
      details: Dialog.kv([
        ['DDT nel carico', c.documenti.map(d => d.ddt_num || d.doc_id).join(' · ')],
        ['Bancali già in baia', inBaia],
      ]),
      confirmLabel: 'Abbandona', danger: true,
    })) return;
    await Store.chiudiCarico();
    this._carEsito = '';
    this.toast('Carico abbandonato — i DDT restano pendenti', 'warning');
    this._carRidisegna();
  },

} satisfies Vista;
