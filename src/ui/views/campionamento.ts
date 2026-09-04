import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { ALLERGENI, etichettaClasse } from '../../modules/anagrafica';
import { formattaQuantita } from '../../modules/misure';
import { raggruppa as raggruppaColli } from '../../modules/colli';

/* IL VERBALE DEL CAMPIONE: non e' un record del database, e' cio' che si
   stampa. Nasce in due punti — dal campionamento appena fatto e dalla
   ristampa di un movimento — e i due devono dire le stesse cose. */
type VerbaleCampione = {
  rif: string;
  article_code: string;
  article_description?: string;
  lot_code: string;
  location_code?: string;
  qty_colli: number;
  quantita: string | null;
  per_chi: string;
  note: string;
  pulito: boolean;
  pulitoAuto: boolean;
  ts: number;
  operatore: string;
};

export const VistaCampionamento = {
  /* ═══ 5bis. CAMPIONAMENTO — 1.4.2.1 ════════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l.

     È l'unica delle otto attività che a magazzino non esisteva: la 1.4.1 ne
     aveva messo in coda la richiesta, ma non c'era nessuna maschera che la
     eseguisse. Adesso c'è, ed è la sola operazione del progetto che NON
     muove colli: cinquanta grammi presi da un sacco da venticinque chili
     lasciano il sacco a scaffale. A calare è ciò che c'è dentro — che è
     esattamente quello che la 1.4.2 ha reso scrivibile.

     Su un articolo senza quantità per collo non cala niente, e il
     campionamento si registra lo stesso: oggi quei prelievi non li scarica
     nessuno, quindi documentarli è già più di quel che c'è — decisione 47. */

  _campState: null,          // { location_code, item_key, article_code, lot_code }

  _campReset() { this._campState = null; },

  _formCampionamento(el) {
    el.innerHTML = `<div class="mov-form-card">
      <h3>${this._ico('flask')} <span class="text-sx-teal">Campionamento</span></h3>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① CERCA la merce</span> → <span class="wf-step">② scegli la riga</span> →
        <span class="wf-step">③ quantità prelevata e per chi</span> → CONFERMA.
        I colli non calano: cala la quantità dentro il collo.
      </div>
      <div class="form-group mb-5">
        <label>① Articolo <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="cpQuery" placeholder="Codice o descrizione — cerca a magazzino"
          maxlength="${Validate.MAX.ARTICLE_CODE}" autocomplete="off"
          oninput="App._campCerca()">
      </div>
      <div class="mb-5" id="cpList"></div>
      <div id="cpDetails"></div>
      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">${this._ico('x')} Chiudi</button></div>
    </div>`;
    if (this._campState) this._campRenderDettaglio();
    else $('cpQuery')?.focus();
  },

  _campCerca() {
    const box = $('cpList');
    if (!box) return;
    this._campState = null;
    const det = $('cpDetails'); if (det) det.innerHTML = '';
    const q = ($('cpQuery')?.value || '').trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    const righe = Store.findItemLocations(q).filter(it => (it.qty || 0) > 0);
    if (!righe.length) {
      box.innerHTML = `<div class="text-label-small text-sx-warning">${this._ico('alert-triangle')} Nessuna giacenza per «${this._esc(q)}»</div>`;
      return;
    }
    /* FEFO come ovunque: il campione si prende dal lotto che scade prima,
       se non c'è una ragione per prenderne un altro. */
    const ordinate = Store.sortByFEFO(righe).slice(0, 12);
    box.innerHTML = `<div class="max-h-[190px] overflow-y-auto border border-sx-border rounded-5">${
      ordinate.map(it => `<div class="search-result-item" onclick="App._campSelect('${this._esc(it.location_code)}','${this._esc(it.item_key)}')">
          <span class="mono font-bold">${this._esc(it.article_code)}</span>
          <span class="mono text-sx-text-secondary">${this._esc(it.lot_code)}</span>
          <span class="text-label-small text-sx-text-muted">${this._esc(it.location_code)}${it.expiry_date ? ' · scad ' + this._esc(it.expiry_date) : ''}</span>
          <span class="ml-auto font-bold text-sx-teal">${it.qty || 0} Coll.</span>
        </div>`).join('')}</div>`;
  },

  _campSelect(loc, itemKey) {
    const it = Store.getItemsAtLocation(loc).find(i => i.item_key === itemKey);
    if (!it) return this.toast('Quella riga non è più a magazzino', 'warning');
    if (Store.isItemQuarantined(itemKey, loc)) return this.toast('Item in quarantena: il campione si preleva dal flusso di qualità', 'error');
    this._campState = { location_code: loc, item_key: itemKey, article_code: it.article_code, lot_code: it.lot_code };
    const box = $('cpList'); if (box) box.innerHTML = '';
    const q = $('cpQuery'); if (q) q.value = it.article_code;
    this._campRenderDettaglio();
  },

  _campRenderDettaglio() {
    const el = $('cpDetails');
    const d = this._campState;
    if (!el || !d) return;
    const it = Store.getItemsAtLocation(d.location_code).find(i => i.item_key === d.item_key);
    if (!it) { this._campReset(); el.innerHTML = ''; return; }
    const cfg = Store.getUomConfig(it.article_code, it.lot_code);
    /* 1.8.4 — una riga a colli DICHIARATI si campiona anche senza il
       per-collo d'anagrafica: le UM ce le ha l'elenco. */
    const elenco = Store.colliDiRiga(it);
    const scalabile = !!cfg?.per_collo || !!elenco;
    const um = (scalabile && cfg?.per_collo) ? Store.suddivisioneDi(it) : null;
    const dentro = (um && cfg?.per_collo) ? um.pieni * cfg.per_collo + um.resto : (elenco ? 1 : null);

    el.innerHTML = `
      <div class="mov-preview bg-sx-teal-soft border-sx-teal mb-5">
        <strong class="mono text-sx-teal">${this._esc(it.article_code)}</strong>
        <span class="text-sx-text-muted">${this._esc(it.article_description || '')}</span><br>
        <span class="text-body-small text-sx-text-muted">
          Lotto <strong>${this._esc(it.lot_code)}</strong> · Ubic. <strong class="mono">${this._esc(it.location_code)}</strong> ·
          <strong>${it.qty || 0} Coll.</strong>${dentro !== null ? ` · ${this._ico('scale')} ${this._esc(Store.descriviRiga(it))}` : ''}</span>
      </div>
      ${scalabile ? `
      <div class="form-group mb-5">
        <label>② Quantità prelevata in <span class="mono">${this._esc(cfg!.uom)}</span> <span class="req">*</span></label>
        <input class="input input-mono max-w-[180px] text-center font-bold" id="cpQty" type="number" min="0" step="0.001"
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('cpFor')?.focus();}">
        <div class="text-label-small text-sx-text-muted mt-1.5">
          I colli restano ${it.qty || 0}. Cala solo la quantità dentro.</div>
      </div>
      ${elenco ? `
      <div class="form-group mb-5">
        <label>②&nbsp;bis Da quale collo <span class="req">*</span></label>
        <select class="select max-w-[240px]" id="cpCollo">
          ${raggruppaColli(elenco, cfg!.uom).map((g: { colli: number; per: number }) =>
            `<option value="${g.per}">${this._esc(formattaQuantita(g.per, cfg!.uom))} ${this._esc(cfg!.uom)} — ${g.colli} coll.</option>`).join('')}
        </select>
        <div class="text-label-small text-sx-text-muted mt-1.5">
          Il collo scelto cala di quanto esce e torna a scaffale. Un campione lascia sempre un residuo:
          per prendere tutto il collo serve un prelievo.</div>
      </div>` : ''}`
      : `<div class="mov-preview mov-preview-warn mb-5">
          ${this._ico('alert-triangle')} <strong>${this._esc(it.article_code)} non ha una quantità per collo</strong>:
          il prelievo si registra a registro, ma nessuna quantità cala.
          Si scioglie da sé compilando <span class="mono">Pezzi_Per_Collo</span> in anagrafica.
        </div>`}
      <div class="form-row mb-5">
        <div class="form-group"><label>③ Campione per chi <span class="req">*</span></label>
          <input class="input" id="cpFor" maxlength="60" placeholder="Laboratorio interno, cliente, ente…"></div>
      </div>
      ${this._campBloccoPulizia(it)}
      <div class="form-group mb-5"><label>Note</label>
        <input class="input" id="cpNotes" maxlength="${Validate.MAX.NOTES}" placeholder="Opzionale"></div>
      <button class="btn btn-conferma bg-sx-teal text-white border-sx-teal"
        onclick="App._execCampione()">${this._ico('flask')} REGISTRA IL CAMPIONE</button>
      <div class="mt-4" id="cpFeedback"></div>`;
    $(scalabile ? 'cpQty' : 'cpFor')?.focus();
  },

  /* 1.5 — LA PULIZIA DELL'AREA DI PRELIEVO, CHE LA GMP PRETENDE.
     Ha preso il posto della spunta «campione di riserva», che era una nota
     di laboratorio e non un fatto di magazzino.

     Sugli ALLERGENI non è una domanda: la merce campionata li porta, la
     zona va pulita, e la spunta arriva già segnata e non si toglie. Restare
     una scelta l'avrebbe resa una scelta anche quando non lo è — e il
     campo, disabilitato, non arriverebbe al lettore: lo porta `cpCleanAuto`,
     che è il valore vero. */
  _campBloccoPulizia(it) {
    const allergeni = Store.getArticle(it.article_code)?.allergens || [];
    const auto = allergeni.length > 0;
    const nomi = allergeni.map(a => this._etAllergene(a)).join(', ');
    return `
      <input type="hidden" id="cpCleanAuto" value="${auto ? '1' : '0'}">
      ${auto ? `
      <div class="mov-preview mov-preview-warn mb-5">
        <strong>${this._ico('alert-triangle')} ${this._esc(it.article_code)} porta allergeni: ${this._esc(nomi)}</strong><br>
        <span class="text-body-small">
          Pulire la zona di prelievo a campionamento terminato. La pulizia è
          <strong>obbligatoria</strong> e viene registrata da sé nel registro attività.</span>
      </div>` : ''}
      <div class="form-group mb-5">
        <label style="display:flex;align-items:center;gap:0.45rem;font-weight:600;text-transform:none;cursor:${auto ? 'default' : 'pointer'}">
          <input class="w-[17px] h-[17px]" type="checkbox" id="cpClean"
            ${auto ? 'checked disabled' : ''}>
          <span>${this._ico('spray')} Ho pulito l'area di campionamento${auto ? ' — obbligatorio' : ''}</span>
        </label>
        <div class="text-label-small text-sx-text-muted mt-1.5">
          Spuntata, la pulizia finisce nel registro attività col riferimento a questo campionamento — è richiesto dalla GMP.</div>
      </div>`;
  },

  async _execCampione() {
    if (!this._requireOperator('il campionamento')) return;
    const d = this._campState;
    if (!d) return this.toast('Scegli prima la merce da campionare', 'error');
    const it = Store.getItemsAtLocation(d.location_code).find(i => i.item_key === d.item_key);
    if (!it) { this._campReset(); return this.toast('Item non più presente — ricomincia la ricerca', 'error'); }

    /* Un campione senza destinatario è merce sparita dallo scaffale: la
       stessa regola della maschera di richiesta, e per la stessa ragione. */
    const perChi = Validate.clean($('cpFor')?.value);
    if (!perChi) { $('cpFor')?.focus(); return this.toast('Dire per chi è il campione', 'error'); }
    /* La pulizia obbligatoria non passa dal campo, che è disabilitato e non
       arriverebbe: passa da `cpCleanAuto`, che dice se la merce ha allergeni. */
    const pulitoAuto = $('cpCleanAuto')?.value === '1';
    const pulito = pulitoAuto || !!$('cpClean')?.checked;
    const note = Validate.clean($('cpNotes')?.value);
    if (Validate.notes(note)) return this.toast(Validate.notes(note), 'error');

    const cfg = Store.getUomConfig(it.article_code, it.lot_code);
    const scalabile = !!cfg?.per_collo;
    let esito = null;
    if (scalabile) {
      const raw = $('cpQty')?.value;
      const qta = Number(String(raw ?? '').replace(',', '.'));
      if (!(qta > 0)) { $('cpQty')?.focus(); return this.toast(`Quantità del campione in ${cfg.uom}: deve essere maggiore di zero`, 'error'); }
      /* Da quale collo esce: sulla riga senza elenco non c'e' niente da
         chiedere, e Store se ne accorge da solo. */
      const daCollo = $('cpCollo') ? Number($('cpCollo').value) : null;
      try {
        esito = await Store.sampleItem(d.location_code, d.item_key, qta, daCollo);
      } catch (err) {
        return this.toast((err as Error).message || 'Campionamento non riuscito', 'error');
      }
      if (!esito) return this.toast('Item non più presente', 'error');
    }

    const dettaglio = [
      `CAMPIONE per ${perChi}`,
      /* La pulizia sta ANCHE nel dettaglio del movimento, non solo
         nell'attività: il registro attività vive a interruttore acceso, il
         registro dei movimenti c'è sempre. Un obbligo GMP non può dipendere
         da un interruttore. */
      pulito ? (pulitoAuto ? 'area pulita — obbligatoria, allergeni' : 'area pulita') : 'area NON pulita',
      note,
    ].filter(Boolean).join(' · ');
    /* La causale nuova, la quindicesima. Il logbook dei campioni è il
       registro filtrato su di lei: nessuna collezione in più. */
    const movId = await this._logMov(MOV.SAMPLE, it.article_code, it.article_description, it.lot_code, d.location_code,
      null, Store.getCurrentIdentity().initials, dettaglio, '',
      it.qty || 0, 0, it.qty || 0, esito ? esito.qty_uom_delta : null);

    /* IL RIFERIMENTO ALL'ULTIMO CAMPIONAMENTO, che è il dato che la GMP
       chiede. È il movimento e non il compito: il campionamento esiste
       sempre, il compito solo se qualcuno l'aveva chiesto. */
    const rifCamp = typeof movId === 'number' ? `MOV-${movId}` : null;
    if (pulito) {
      try {
        await Store.logCleaningTask({
          location_code: d.location_code,
          article_code: it.article_code,
          lot_code: it.lot_code,
          sample_ref: rifCamp,
          automatica: pulitoAuto,
          note: pulitoAuto ? 'Pulizia obbligatoria: la merce campionata porta allergeni' : '',
        });
      } catch (err) {
        /* La pulizia non registrata non fa saltare il campionamento: la
           merce si è già mossa. Resta scritta nel dettaglio del movimento,
           e l'operatore lo sa. */
        this.toast(`Campione registrato, ma la pulizia non è finita nel registro attività: ${(err as Error).message || err}`, 'warning');
      }
    }

    const quanto = esito ? `${formattaQuantita(-esito.qty_uom_delta, esito.uom)} ${esito.uom}` : 'quantità non scalata';
    this.toast(`Campione registrato: ${it.article_code}#${it.lot_code} — ${quanto}`, 'success');
    const fb = $('cpFeedback');
    if (fb) fb.innerHTML = `<div class="mov-preview mov-preview-ok"><strong>${this._ico('check')} ${this._esc(it.article_code)}#${this._esc(it.lot_code)}</strong> — ${this._esc(quanto)}, per ${this._esc(perChi)}. I colli restano ${it.qty || 0}.${pulito ? ' Pulizia registrata.' : ''}</div>`;
    this.updateSyncIndicator();
    this._refreshSessionLog();
    /* Un campione è UN gesto: vale un collo di residuo. Chi ne ha chiesti
       tre passa di qui tre volte, ed è giusto così — sono tre prelievi
       distinti, con tre righe di registro. */
    await this._taskAvanza(1, ['SAMPLING']);

    /* IL VERBALE NASCE DA SÉ, come il cartellino di quarantena — D17. Un
       verbale che si stampa «quando serve» è un verbale che qualcuno
       dimentica, e il campione parte senza il foglio che lo accompagna.
       Resta ristampabile dal registro attività. */
    this._stampaVerbaleCampione({
      rif: rifCamp,
      article_code: it.article_code,
      article_description: it.article_description,
      lot_code: it.lot_code,
      location_code: d.location_code,
      qty_colli: it.qty || 0,
      quantita: esito ? `${formattaQuantita(-esito.qty_uom_delta, esito.uom)} ${esito.uom}` : null,
      per_chi: perChi,
      note,
      pulito, pulitoAuto,
      ts: Date.now(),
      operatore: Store.getCurrentIdentity().initials,
    });

    this._campReset();
    this._formCampionamento($('movFormArea'));
  },  /* 1.5 — IL VERBALE DI CAMPIONAMENTO, che accompagna il campione.
     Stesse intestazioni e stesso piè di pagina degli altri documenti: passa
     da `_docPageHTML` come il verbale di smaltimento, e non porta un layout
     suo. Ciò che ha in più è la fascia delle CONDIZIONI DI STOCCAGGIO — un
     campione che viaggia senza la sua temperatura è un campione che il
     laboratorio può rifiutare.

     I dati arrivano dal chiamante e non si rileggono dal magazzino: al
     momento della ristampa la giacenza è già cambiata, e un verbale che
     cambia dopo la firma non è un verbale. */
  _stampaVerbaleCampione(v: VerbaleCampione) {
    const fmtTs = (ms: number | null | undefined) => ms
      ? new Date(ms).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';
    const art = Store.getArticle(v.article_code);
    const allergeni = (art?.allergens || []).map(a => this._etAllergene(a)).join(', ');
    const classe = art?.temp_class ? etichettaClasse(art.temp_class) : '';

    const headExtra = `<div class="doc-idblock doc-idblock--3">
        ${this._docCell('Articolo', v.article_code)}
        ${this._docCell('Lotto', v.lot_code)}
        ${this._docCell('Ubicazione di prelievo', v.location_code)}
        ${this._docCell('Descrizione', v.article_description, 'doc-cell--wide')}
        ${this._docCell('Campione per', v.per_chi)}
      </div>`;

    const body = `
      <div class="vb-strip">CAMPIONE PRELEVATO DALLA GIACENZA</div>

      <div class="vb-reason">
        <div class="vb-reason-lbl">Condizioni di stoccaggio</div>
        <div class="vb-reason-val">${this._esc(classe || 'Classe di conservazione non dichiarata in anagrafica')}</div>
        ${allergeni ? `<div class="vb-forced">Allergeni dichiarati: ${this._esc(allergeni)}</div>` : ''}
      </div>

      <div class="vb-reason mt-4">
        <div class="vb-reason-lbl">Pulizia dell'area di campionamento</div>
        <div class="vb-reason-val">${v.pulito
          ? (v.pulitoAuto
            ? 'ESEGUITA — obbligatoria, la merce campionata porta allergeni'
            : 'ESEGUITA e registrata nel registro attività')
          : 'NON DICHIARATA'}</div>
        ${v.note ? `<div class="vb-forced">Note: ${this._esc(v.note)}</div>` : ''}
      </div>

      <div class="doc-fill"></div>

      <div class="doc-grid">
        ${this._docCell('Quantità prelevata', v.quantita || 'non scalata')}
        ${this._docCell('Colli a scaffale', String(v.qty_colli))}
        ${this._docCell('Data e ora', fmtTs(v.ts))}
        ${this._docCell('Operatore', v.operatore)}
      </div>`;

    this._docPrint(this._docPageHTML({
      kind: 'VERBALE DI CAMPIONAMENTO',
      kindSub: 'Prelievo di campione — da allegare al campione',
      num: v.rif || '—', dateVal: fmtTs(v.ts),
      headExtra, body, docId: v.rif || '', pageClass: 'doc-page--vb',
      signs: [
        { role: 'Operatore magazzino', hint: v.operatore || '' },
        { role: 'Controllo qualità', hint: 'Data e firma' },
        { role: 'Ricevente il campione', hint: v.per_chi || '' }
      ]
    }));
  },

  /* La seconda copia si ricostruisce dal MOVIMENTO, che è dove il
     campionamento è scritto — non dalla giacenza di adesso, che nel
     frattempo è cambiata. Il dettaglio è la riga che `_execCampione` ha
     composto: si rilegge com'era, senza reinterpretarla più di così. */
  _ristampaVerbaleCampione(movId) {
    const m = Store.getMovLog().find(x => x._id === movId);
    if (!m) return this.toast('Movimento non più nella finestra del registro — allargala da Configurazione', 'error');
    const pezzi = String(m.notes || '').split(' · ');
    const perChi = (pezzi.find(p => p.startsWith('CAMPIONE per ')) || '').replace('CAMPIONE per ', '');
    const pulizia = pezzi.find(p => p.startsWith('area ')) || '';
    const note = pezzi.filter(p => !p.startsWith('CAMPIONE per ') && !p.startsWith('area ')).join(' · ');
    this._stampaVerbaleCampione({
      rif: `MOV-${m._id}`,
      article_code: m.article_code,
      article_description: m.article_description,
      lot_code: m.lot_code,
      location_code: m.location_code,
      qty_colli: m.qty_after != null ? m.qty_after : 0,
      quantita: (typeof m.qty_uom_delta === 'number' && m.uom)
        ? `${formattaQuantita(-m.qty_uom_delta, m.uom)} ${m.uom}` : null,
      per_chi: perChi,
      note,
      pulito: pulizia.startsWith('area pulita'),
      pulitoAuto: pulizia.includes('allergeni'),
      ts: m.ts,
      operatore: m.user,
    });
  },
} satisfies Vista;
