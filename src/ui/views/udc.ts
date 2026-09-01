import { type Vista, $, $sel } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { riconosci } from '../../modules/udc';
import { svg as barcodeSvg, primoCarattereFuoriSet } from '../../modules/code128';
import type { Giacenza } from '../../types/entita';

/* ═══════════════════════════════════════════════════════════════════════
   1.12 — LE UNITÀ DI CARICO, LA MASCHERA
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Un'UDC è un contenitore che sta in un'ubicazione e porta la merce con sé.
   Qui la si crea, ci si carica sopra la merce che sta nello stesso vano, e
   la si sposta — intera, in una transazione sola.

   NASCE SU COMANDO, MUORE DA SOLA: non c'è nessun pulsante «elimina». Quando
   l'ultima riga esce, il contenitore si chiude da solo, e il record resta —
   la tracciabilità di cosa ci sia stato sopra non si cancella con lui.

   La regola del codice sta in `modules/udc.ts`, quel che scrive in `Store`.
   Qui c'è solo il gesto.
   ═══════════════════════════════════════════════════════════════════════ */

export const VistaUdc = {
  _udcSel: null,

  _formUdc(el) {
    if (!el) return;
    const aperte = Store.getUdcAperte();
    const prefisso = Store.getPrefissoGS1();
    el.innerHTML = `<div class="mov-form-card">
      <h3>📦 <span class="text-sx-teal">Unità di carico</span></h3>
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① NUOVA</span> nel vano dove sta il pallet →
        <span class="wf-step">② carica</span> le righe che ci stanno sopra →
        <span class="wf-step">③ SPOSTA</span>, e la merce va con lei.
      </div>
      <div class="mov-preview ${prefisso ? 'mov-preview-ok' : ''} mb-5">
        ${prefisso
          ? `Prefisso GS1 <strong class="mono">${this._esc(prefisso)}</strong> — le etichette nuove sono <strong>SSCC</strong>.`
          : 'Nessun prefisso GS1: le etichette nuove portano un <strong>codice interno</strong>. Si cambia in Configurazione → Funzioni.'}
      </div>
      <div class="flex gap-3 flex-wrap mb-6">
        <button class="btn btn-success" onclick="App._udcNuova()">+ Nuova unità di carico</button>
      </div>
      <div id="udcElenco"></div>
      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
    this._udcRenderElenco(aperte);
  },

  _udcRenderElenco(aperte) {
    const box = $('udcElenco');
    if (!box) return;
    const lista = aperte || Store.getUdcAperte();
    if (!lista.length) {
      box.innerHTML = '<div class="empty-state p-7.5"><p>Nessuna unità di carico aperta</p></div>';
      return;
    }
    let html = `<p class="text-body-small text-sx-text-secondary mb-4"><strong>${lista.length}</strong> aperte. Una unità vuota si chiude da sola e sparisce da qui.</p>`;
    for (const u of lista) {
      const righe = Store.righeDiUdc(u.udc_id);
      const colli = righe.reduce((t, r) => t + (r.qty || 0), 0);
      const scelta = this._udcSel === u.udc_id;
      html += `<div class="inv-item-row ${scelta ? 'font-bold' : ''}">
        <div class="inv-info">
          <div class="inv-code">${this._esc(u.udc_id)} <span class="badge badge-muted">${this._esc(u.type || 'pallet')}</span></div>
          <div class="inv-lot">
            📍 ${this._esc(u.location_code || '— senza ubicazione')} ·
            ${righe.length} rig${righe.length === 1 ? 'a' : 'he'} · ${colli} Coll.
          </div>
        </div>
        <div class="inv-actions-row">
          <button class="inv-btn" title="Apri e carica la merce" onclick="App._udcApri('${this._esc(u.udc_id)}')">${scelta ? '▾' : '▸'}</button>
          <button class="inv-btn" title="Sposta l'unità intera" onclick="App._udcChiediSposta('${this._esc(u.udc_id)}')">🔀</button>
          <button class="inv-btn" title="Ristampa l'etichetta" onclick="App._udcEtichetta('${this._esc(u.udc_id)}')">🏷</button>
          <button class="inv-btn" title="Metti in quarantena tutta l'unità" onclick="App._udcChiediQuarantena('${this._esc(u.udc_id)}')">🔒</button>
          <button class="inv-btn btn-danger" title="Smaltisci tutta l'unità" onclick="App._udcChiediSmaltisci('${this._esc(u.udc_id)}')">🗑</button>
        </div>
      </div>`;
      if (scelta) html += this._udcDettaglioHTML(u, righe);
    }
    box.innerHTML = html;
  },

  /* Il contenuto, e la merce del vano che ci si può ancora caricare sopra.
     Solo quella dello STESSO vano: un contenitore sta in un'ubicazione, e
     caricarci merce che sta altrove vorrebbe dire un pallet in due posti. */
  _udcDettaglioHTML(u, righe) {
    const nel = u.location_code ? Store.getItemsAtLocation(u.location_code) : [];
    const libere = nel.filter((i: Giacenza) => !i.udc_id);
    let html = '<div class="pl-6 pb-5">';
    html += righe.length
      ? `<div class="text-label-small text-sx-text-muted mb-2">Sopra questa unità</div>${righe.map((r: Giacenza) => `
        <div class="inv-item-row">
          <div class="inv-info">
            <div class="inv-code">${this._esc(r.article_code)} <span class="font-normal text-body-small text-sx-text-secondary">${this._esc(r.article_description || '')}</span></div>
            <div class="inv-lot">Lotto ${this._esc(r.lot_code)} · ${r.qty || 0} Coll. · ⚖ ${this._esc(Store.descriviRiga(r))}</div>
          </div>
          <div class="inv-actions-row">
            <button class="inv-btn" title="Togli dall'unità: la merce resta nel vano" onclick="App._udcScarica('${this._esc(r.item_key)}')">↧</button>
          </div>
        </div>`).join('')}`
      : '<div class="text-body-small text-sx-text-muted p-3">Vuota — si chiuderà da sola appena qualcosa entra ed esce.</div>';

    if (libere.length) {
      html += `<div class="text-label-small text-sx-text-muted mt-4 mb-2">Nel vano, non ancora su un'unità</div>${libere.map((r: Giacenza) => `
        <div class="inv-item-row">
          <div class="inv-info">
            <div class="inv-code">${this._esc(r.article_code)} <span class="font-normal text-body-small text-sx-text-secondary">${this._esc(r.article_description || '')}</span></div>
            <div class="inv-lot">Lotto ${this._esc(r.lot_code)} · ${r.qty || 0} Coll.</div>
          </div>
          <div class="inv-actions-row">
            <button class="inv-btn" title="Carica su questa unità" onclick="App._udcCarica('${this._esc(r.item_key)}')">↥</button>
          </div>
        </div>`).join('')}`;
    }
    return html + '</div>';
  },

  _udcApri(id) {
    this._udcSel = this._udcSel === id ? null : id;
    this._udcRenderElenco();
  },

  _udcNuova() {
    this.showModal(
      '📦 Nuova unità di carico',
      `<div class="form-row mb-6">
        <div class="form-group">
          <label>Tipo</label>
          <select class="select" id="udcTipo">
            <option value="pallet">Pallet</option>
            <option value="cassone">Cassone</option>
            <option value="carrello">Carrello</option>
          </select>
        </div>
        <div class="form-group">
          <label>Ubicazione <span class="req">*</span></label>
          <div class="flex gap-3">
            <input class="input input-mono uppercase flex-1" id="udcLoc" placeholder="Scansiona o digita" autofocus maxlength="${Validate.MAX.LOC_CODE}"
              oninput="this.value=this.value.toUpperCase();App._previewLoc('udcLoc','udcLocPrev')"
              onkeydown="if(event.key==='Enter'){event.preventDefault();App._udcCrea()}">
            <button class="btn btn-sm" type="button" onclick="App._pickLoc('udcLoc',null)" title="Sfoglia">📍</button>
          </div>
          <div id="udcLocPrev"></div>
        </div>
      </div>
      <div class="mov-preview">
        Il codice lo assegna il sistema e <strong>non si riusa mai</strong>.
        L'etichetta si stampa subito: è quella che resterà incollata al legno.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-success" onclick="App._udcCrea()">+ Crea e stampa</button>`
    );
  },

  async _udcCrea() {
    if (!this._requireOperator('la creazione di un’unità di carico')) return;
    const loc = Validate.clean($('udcLoc')?.value, true).replace(/'/g, '-');
    if (!loc) return this.toast('Indica l’ubicazione in cui sta l’unità', 'error');
    if (!Store.locationExists(loc)) return this.toast(`Ubicazione ${loc} inesistente`, 'error');
    const stato = Store.getLocationStatus(loc);
    if (stato === 'disabled') return this.toast(`Ubicazione ${loc} disattivata`, 'error');

    let rec = null;
    try {
      rec = await Store.createUdc({ type: $sel('udcTipo')?.value || 'pallet', location_code: loc });
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    /* 2.16 — voce 34: causale sua. Un contenitore che nasce non e' la
       modifica dei dati di un articolo che non c'e'. */
    await this._logMov(MOV.UDC, '', '', '', loc, null, '', `Unità di carico creata: ${rec.udc_id}`);
    this.closeModal();
    this._udcSel = rec.udc_id;
    this._formUdc($('movFormArea'));
    this.updateSyncIndicator();
    this.toast(`📦 ${rec.udc_id} creata in ${loc}`, 'success');
    /* L'etichetta si stampa alla CREAZIONE: un pallet senza etichetta è un
       pallet che nessuno può scansionare, e stamparla dopo vuol dire
       ricordarsene. */
    this._udcEtichetta(rec.udc_id);
  },

  async _udcCarica(itemKey) {
    if (!this._udcSel) return;
    const u = Store.getUdc(this._udcSel);
    if (!u) return;
    try {
      await Store.assegnaAUdc(u.location_code || '', itemKey, u.udc_id);
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    await this._logMov(MOV.EDIT, itemKey.split('#')[0] || '', '', itemKey.split('#')[1] || '',
      u.location_code || '', null, '', `Caricato su ${u.udc_id}`);
    this._udcRenderElenco();
    this.updateSyncIndicator();
    this.toast(`↥ ${itemKey} su ${u.udc_id}`, 'success');
  },

  async _udcScarica(itemKey) {
    if (!this._udcSel) return;
    const u = Store.getUdc(this._udcSel);
    if (!u) return;
    try {
      await Store.assegnaAUdc(u.location_code || '', itemKey, null);
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    await this._logMov(MOV.EDIT, itemKey.split('#')[0] || '', '', itemKey.split('#')[1] || '',
      u.location_code || '', null, '', `Tolto da ${u.udc_id}`);
    /* Se era l'ultima, l'unità si è chiusa da sola: sparisce dall'elenco e
       la selezione non deve restare puntata su un contenitore morto. */
    if (!Store.getUdc(this._udcSel) || Store.getUdc(this._udcSel)!.status === 'empty') this._udcSel = null;
    this._formUdc($('movFormArea'));
    this.updateSyncIndicator();
    this.toast(`↧ ${itemKey} tolto da ${u.udc_id}`, 'success');
  },

  _udcChiediSposta(id) {
    const u = Store.getUdc(id);
    if (!u) return this.toast('Unità non trovata', 'error');
    const righe = Store.righeDiUdc(id);
    this.showModal(
      `🔀 Sposta ${this._esc(id)}`,
      `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        <span class="mono font-bold text-sx-teal">${this._esc(id)}</span> · ${this._esc(u.type || 'pallet')}<br>
        Adesso in <strong class="mono">${this._esc(u.location_code || '—')}</strong> ·
        <strong>${righe.length} rig${righe.length === 1 ? 'a' : 'he'}</strong> sopra
      </div>
      <div class="form-group mb-6">
        <label>Ubicazione di destinazione <span class="req">*</span></label>
        <div class="flex gap-3">
          <input class="input input-mono uppercase flex-1" id="udcDest" placeholder="Scansiona o digita" autofocus maxlength="${Validate.MAX.LOC_CODE}"
            oninput="this.value=this.value.toUpperCase();App._previewLoc('udcDest','udcDestPrev')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._udcSposta('${this._esc(id)}')}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('udcDest',null)" title="Sfoglia">📍</button>
        </div>
        <div id="udcDestPrev"></div>
      </div>
      <div class="mov-preview">
        L'unità e <strong>tutte le sue righe</strong> cambiano ubicazione insieme,
        in una transazione sola. Il contenuto non si tocca: colli e quantità restano quelli.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App._udcSposta('${this._esc(id)}')">🔀 Sposta</button>`
    );
  },

  async _udcSposta(id) {
    if (!this._requireOperator('lo spostamento di un’unità di carico')) return;
    const u = Store.getUdc(id);
    if (!u) return this.toast('Unità non trovata', 'error');
    const dest = Validate.clean($('udcDest')?.value, true).replace(/'/g, '-');
    if (!dest) return this.toast('Indica l’ubicazione di destinazione', 'error');
    const stato = Store.locationExists(dest) ? Store.getLocationStatus(dest) : null;
    if (stato === null) return this.toast(`Ubicazione ${dest} inesistente`, 'error');
    if (stato === 'blocked' || stato === 'disabled') {
      return this.toast(`Ubicazione ${dest} ${stato === 'blocked' ? 'BLOCCATA' : 'DISATTIVATA'}`, 'error');
    }
    const da = u.location_code || '';

    let esito = null;
    try {
      esito = await Store.moveUdc(id, dest, {
        type: MOV.UDC, article_code: '', article_description: '', lot_code: '',
        location_code: da, dest_location: dest,
        user: Store.getCurrentIdentity().initials, ts: Date.now(),
        notes: `Unità di carico ${id} — ${Store.righeDiUdc(id).length} righe`,
      });
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    this.closeModal();
    this._formUdc($('movFormArea'));
    this.renderMap();
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
    this.toast(`🔀 ${id}: ${da} → ${dest} · ${esito?.righe ?? 0} righe`, 'success');
  },

  /* ─── L'ETICHETTA — 2.1 ────────────────────────────────────────────
     100 × 80 mm su A4, dal browser: nessun driver, nessuna stampante
     speciale.

     SOPRA C'È IL CODICE A BARRE, E BASTA. Fino alla 2.0 l'etichetta
     portava anche mittente, tipo, ubicazione, data, operatore e numero di
     righe: sei dati che valgono il minuto in cui il foglio esce dalla
     stampante. Un pallet si sposta, si carica e si scarica — e ognuno di
     quei sei diventa una bugia incollata al legno, letta da chi passa e
     creduta. L'unico dato che non invecchia mai è il numero dell'unità,
     perché non si riusa: tutto il resto lo dice il sistema, che lo sa
     adesso e non alla stampa.

     Il numero in chiaro sotto le barre non è un dato in più: è la
     rappresentazione leggibile dello stesso codice — quella che lo standard
     chiede, e che lascia un numero da digitare a chi ha il pallet davanti
     quando il lettore non legge. */
  _udcEtichetta(id) {
    const u = Store.getUdc(id);
    if (!u) return this.toast('Unità non trovata', 'error');
    const forma = riconosci(u.udc_id);
    /* Un codice che il set B non sa scrivere non esiste in questo
       applicativo — `modules/udc.ts` li genera lui — ma se esistesse,
       stampare l'etichetta senza barre e dirlo è meglio che stampare barre
       che nessun lettore legge. */
    const fuori = primoCarattereFuoriSet(u.udc_id);
    const codice = fuori === null
      ? barcodeSvg(u.udc_id, { modulo: 0.5, altezza: 28, etichetta: u.udc_id,
                               descrizione: `Unità di carico ${u.udc_id}` })
      : `<div class="udc-label-code">${this._esc(u.udc_id)}</div>`;

    this._docPrint(`<div class="udc-label">
      <div class="udc-label-barcode">${codice}</div>
      <div class="udc-label-forma">${forma.forma === 'sscc' ? 'SSCC (GS1)' : 'Codice interno'}</div>
    </div>`);
  },

  /* ─── SMALTIRE E BLOCCARE UN'UNITÀ INTERA — 2.1 ────────────────

     UN PALLET È UN FATTO SOLO, ANCHE SE PORTA OTTO RIGHE. Chi lo smaltisce
     ha davanti un legno rotto o una merce scaduta, non otto decisioni: la
     giustificazione si scrive UNA volta e vale per tutte le righe — è la
     riga del prompt, ed è anche l'unico modo perché il registro racconti un
     fatto invece di otto coincidenze con la stessa ora.

     Quel che NON si accorpa è il documento. Ogni riga porta il suo verbale
     numerato e il suo record di quarantena, perché l'archivio dei documenti
     è fatto così dalla 1.5 e perché una ristampa deve poter nominare UN
     articolo e UN lotto: un verbale che ne elenca otto non si allega a
     nessuna delle otto pratiche. A tenerli insieme sono la causale, la
     sigla di chi ha firmato e l'ora. */

  _udcRigheOChiedi(id: string) {
    const u = Store.getUdc(id);
    if (!u) { this.toast('Unità non trovata', 'error'); return null; }
    const righe = Store.righeDiUdc(id);
    if (!righe.length) { this.toast(`${id} è vuota: non c'è niente da muovere`, 'warning'); return null; }
    return { u, righe };
  },

  _udcRiepilogoHTML(u, righe: Giacenza[]) {
    return `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
      <span class="mono font-bold text-sx-teal">${this._esc(u.udc_id)}</span> · ${this._esc(u.type || 'pallet')}
      · 📍 ${this._esc(u.location_code || '—')}<br>
      ${righe.map((r: Giacenza) => `<div class="mt-2">• <span class="mono">${this._esc(r.article_code)}</span>#${this._esc(r.lot_code)}
        — ${r.qty || 0} Coll. · ${this._esc(Store.descriviRiga(r))}</div>`).join('')}
    </div>`;
  },

  _udcChiediSmaltisci(id) {
    if (!this._requireOperator('lo smaltimento di un’unità di carico')) return;
    const dati = this._udcRigheOChiedi(id);
    if (!dati) return;
    const causali = Store.getDocConfig().disposalReasons;
    this.showModal(
      `🗑 Smaltisci ${this._esc(id)}`,
      `${this._udcRiepilogoHTML(dati.u, dati.righe)}
      <div class="mov-preview mov-preview-err mb-7">
        <strong>Escono tutte e ${dati.righe.length} le righe, per intero.</strong>
        La merce lascia definitivamente la giacenza e l'unità si chiude.
        Ogni riga porta il suo verbale numerato, ristampabile da Documenti.
      </div>
      <div class="form-group mb-6">
        <label>Motivazione <span class="req">*</span> — vale per tutte le righe</label>
        <select class="input select" id="udcDispCausale">
          ${causali.map((r) => `<option value="${this._esc(r.id)}">${this._esc(r.label)}</option>`).join('')}
          <option value="__libera">Altra motivazione…</option>
        </select>
      </div>
      <div class="form-group">
        <label>Nota</label>
        <input class="input" id="udcDispNota" maxlength="${Validate.MAX.REASON}" placeholder="Obbligatoria se la motivazione è «Altra»">
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-danger" onclick="App._udcSmaltisci('${this._esc(id)}')">🗑 Smaltisci l'unità</button>`
    );
  },

  async _udcSmaltisci(id) {
    const dati = this._udcRigheOChiedi(id);
    if (!dati) return;
    const scelta = String($sel('udcDispCausale')?.value || '');
    const nota = Validate.clean($('udcDispNota')?.value);
    const causale = scelta === '__libera'
      ? nota
      : (Store.getDocConfig().disposalReasons.find((r) => r.id === scelta)?.label || '');
    if (!causale) return this.toast('Con «Altra motivazione» la nota diventa obbligatoria', 'error');

    if (!await Dialog.confirm({
      title: 'Smaltimento dell’unità di carico',
      message: 'La merce esce definitivamente dalla giacenza e l’unità si chiude. '
             + 'L’operazione non si annulla in blocco: si rientra riga per riga da Movimenta.',
      details: Dialog.kv([
        ['Unità', id],
        ['Ubicazione', dati.u.location_code || '—'],
        ['Righe', dati.righe.length],
        ['Colli in tutto', dati.righe.reduce((t: number, r: Giacenza) => t + (r.qty || 0), 0)],
        ['Motivazione', causale],
      ]),
      confirmLabel: 'Smaltisci tutto', danger: true,
    })) return;

    const operatore = Store.getCurrentIdentity().initials;
    const note = `SMALTIMENTO UDC ${id} [${causale}]` + (scelta === '__libera' ? '' : (nota ? ` · ${nota}` : ''));
    const fatte: string[] = [];
    const fallite: string[] = [];

    for (const r of dati.righe) {
      const vano = r.location_code;
      try {
        /* Svuotamento totale: è la strada che `removeItem` lascia libera
           anche dove i colli sono dichiarati — la riga sparisce intera e
           non resta un elenco a sopravviverle. */
        const tolta = await Store.removeItem(vano, r.item_key);
        if (!tolta) { fallite.push(`${r.article_code}#${r.lot_code}`); continue; }
        const verbale = Store.nextDisposalSeq();
        await this._logMov(MOV.OUT, tolta.article_code, tolta.article_description, tolta.lot_code,
          vano, null, operatore, note, verbale,
          tolta._qty_before, tolta._qty_delta, tolta._qty_after, tolta._qty_uom_delta);
        await Store.archiveDisposal({
          doc_id: verbale,
          created_at: Date.now(),
          article_code: tolta.article_code,
          article_description: tolta.article_description || '',
          lot_code: tolta.lot_code,
          expiry_date: tolta.expiry_date || '',
          location_code: vano,
          qty: tolta._qty_before,
          qty_before: tolta._qty_before,
          qty_after: 0,
          reason: causale,
          forced_note: `Unità di carico ${id}` + (nota ? ` · ${nota}` : ''),
          operator: operatore,
          sender: Store.getDocConfig().sender,
        });
        fatte.push(verbale);
      } catch (e) {
        fallite.push(`${r.article_code}#${r.lot_code}: ${(e as Error).message}`);
      }
    }

    this.closeModal();
    this.updateSyncIndicator();
    this._refreshSessionLog();
    this.renderMovimenta();
    if (fallite.length) {
      this.toast(`Smaltite ${fatte.length} righe su ${dati.righe.length}. Non riuscite: ${fallite.join(' · ')}`, 'error');
    } else {
      this.toast(`✓ ${id} smaltita: ${fatte.length} righe, ${fatte.length} verbali · ${causale}`, 'success');
    }
  },

  _udcChiediQuarantena(id) {
    if (!this._requireOperator('la messa in quarantena di un’unità di carico')) return;
    const dati = this._udcRigheOChiedi(id);
    if (!dati) return;
    this.showModal(
      `🔒 Quarantena ${this._esc(id)}`,
      `${this._udcRiepilogoHTML(dati.u, dati.righe)}
      <div class="mov-preview mov-preview-warn mb-7">
        <strong>Tutte e ${dati.righe.length} le righe vanno in area di non conformità</strong>, per intero.
        Il cartellino non parte da qui: si ristampa dalla scheda Quarantena, uno per lotto.
      </div>
      <div class="form-group mb-6">
        <label>Motivo del blocco <span class="req">*</span> — vale per tutte le righe</label>
        <input class="input" id="udcQMotivo" maxlength="${Validate.MAX.REASON}" placeholder="Es. sospetto danno da umidità sul bancale">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Reparto richiedente <span class="req">*</span></label>
          <input class="input" id="udcQReparto" maxlength="${Validate.MAX.REF_DEPT}" placeholder="Es. Controllo Qualità">
        </div>
        <div class="form-group">
          <label>Persona di riferimento</label>
          <input class="input" id="udcQPersona" maxlength="${Validate.MAX.OPERATOR}">
        </div>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-warning" onclick="App._udcQuarantena('${this._esc(id)}')">🔒 Blocca l'unità</button>`
    );
  },

  async _udcQuarantena(id) {
    const dati = this._udcRigheOChiedi(id);
    if (!dati) return;
    const motivo = Validate.clean($('udcQMotivo')?.value);
    const reparto = Validate.clean($('udcQReparto')?.value);
    const persona = Validate.clean($('udcQPersona')?.value);
    const errori = [Validate.reason(motivo), Validate.refDept(reparto)].filter(Boolean);
    if (errori.length) return this.toast(errori[0], 'error');

    const operatore = Store.getCurrentIdentity().initials;
    const bloccate: string[] = [];
    const fallite: string[] = [];

    for (const r of dati.righe) {
      /* La riga si rilegge adesso: fra un giro e l'altro un altro terminale
         può averla mossa, e `_quarantineItemCore` vuole l'oggetto vero,
         non quello di un attimo fa. */
      const vivo = Store.getItemsAtLocation(r.location_code).find((i: Giacenza) => i.item_key === r.item_key);
      if (!vivo) { fallite.push(`${r.article_code}#${r.lot_code}: non più in ${r.location_code}`); continue; }
      if (Store.isItemQuarantined(r.item_key, r.location_code)) {
        fallite.push(`${r.article_code}#${r.lot_code}: già in quarantena`);
        continue;
      }
      const esito = await this._quarantineItemCore(vivo, {
        reason: `${motivo} — unità di carico ${id}`,
        operator: operatore, refDept: reparto, refPerson: persona,
        tutto: true, senzaCartellino: true,
      });
      if (esito?.ok) bloccate.push(`${r.article_code}#${r.lot_code}`);
      else fallite.push(`${r.article_code}#${r.lot_code}`);
    }

    this.closeModal();
    this.updateSyncIndicator();
    this._refreshSessionLog();
    this.renderMovimenta();
    if (fallite.length) {
      this.toast(`In quarantena ${bloccate.length} righe su ${dati.righe.length}. Non riuscite: ${fallite.join(' · ')}`, 'error');
    } else {
      this.toast(`🔒 ${id} in quarantena: ${bloccate.length} righe · cartellini da ristampare dalla scheda Quarantena`, 'warning');
    }
  },
} satisfies Vista;
