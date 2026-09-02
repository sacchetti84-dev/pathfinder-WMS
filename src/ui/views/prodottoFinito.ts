import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { MOV } from '../../core/costanti';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { svg as barcodeSvg, primoCarattereFuoriSet } from '../../modules/code128';
import { colliAttesi, descriviModello } from '../../modules/imballo';
import { componi, alClic, segno, STATO_VUOTO } from '../../modules/tabella';
import type { Colonna, Stato } from '../../modules/tabella';
import {
  ePf, riepiloga, bancaliImpegnati, descriviContenuto, ETICHETTE_STATO, zonePf,
} from '../../modules/bancale';
import type { RiepilogoBancale } from '../../modules/bancale';
import type { Udc } from '../../types/entita';

/* Una riga della bozza: quel che sta su un bancale prima che il bancale
   esista. Nasce a video e muore alla chiusura, quando diventa giacenza. */
type RigaBozza = {
  article_code: string;
  article_description: string;
  lot_code: string;
  expiry_date: string;
  colli: number;
};

type Bozza = {
  location_code: string;
  odp_num: string;
  model_code: string;
  righe: RigaBozza[];
};

export const VistaProdottoFinito = {
  /* ═══ 2.20 · IL MAGAZZINO DEL PRODOTTO FINITO ═════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

     Il PF esce dal reparto, viene imballato su un bancale, scansionato ed
     etichettato, e messo nella zona di spedizione. Fino alla 2.19 quel
     magazzino non esisteva: la produzione registrava il CONSUMO dei
     componenti e nient'altro, e il prodotto finito viveva come una riga di
     testata sul rapporto di prelievo.

     LA MASCHERA È DEL REPARTO, E IL REPARTO STA IN PIEDI. Terminale da 4,3",
     guanti, due secondi di sguardo: un campo per gesto, il lettore che
     avanza da sé, i colli già proposti dal modello di imballo dell'articolo.

     NIENTE È BLOCCANTE. Il numero di colli proposto si riscrive senza dire
     perché, l'ordine di produzione è facoltativo, e un bancale con due
     articoli diversi passa — lo dice, e va avanti. Chi ha la merce in mano
     non si ferma per difendere un dato di configurazione. */

  /** Il bancale che si sta componendo. `null` = nessuno aperto. Vive a
      video e non a database: finché non si chiude, non esiste. */
  _pfBozza: null as Bozza | null,

  /** Ordinamento e ricerca dell'elenco. §8: ogni tabella si ordina e si
      filtra, il vuoto va in fondo nei due versi, e il terzo clic riporta
      all'ordine di partenza. */
  _pfTabella: STATO_VUOTO as Stato,

  _formProdottoFinito(el: HTMLElement) {
    const zone = zonePf(Store.getSites());
    el.innerHTML = `
      ${!zone.length ? `<div class="mov-preview mov-preview-warn mb-6 leading-[1.6]">
        <strong>Nessuna zona è dichiarata di prodotto finito.</strong> Si marca in
        Configurazione → Siti e Zone, sulla zona dove il reparto posa i bancali.
        Finché non c'è, l'ubicazione si scrive a mano — la maschera funziona lo stesso.
      </div>` : ''}
      ${this._pfBozza ? this._pfBozzaHTML() : this._pfElencoHTML()}`;
    if (this._pfBozza) this.setPrimaryScanField('pfArt');
  },

  /* ── Il bancale che si sta componendo ───────────────────────────────── */

  _pfNuovoBancale() {
    if (!this._requireOperator('la registrazione del prodotto finito')) return;
    this._pfBozza = {
      location_code: this._pfProponiUbicazione(),
      odp_num: '', model_code: '', righe: [],
    };
    this._formProdottoFinito($('movFormArea'));
  },

  /** Il primo vano libero di una zona di prodotto finito. È una proposta e
      si riscrive: un vano occupato non è un errore — su un bancale nuovo si
      posa accanto — ma partire da uno libero risparmia una digitazione. */
  _pfProponiUbicazione(): string {
    /* Il primo utilizzabile fa da ripiego: una zona di spedizione piena non
       è un errore — i bancali si posano accanto — e lasciare il campo vuoto
       obbligherebbe a digitare un codice di quindici caratteri coi guanti. */
    let ripiego = '';
    for (const { sito, zona } of zonePf(Store.getSites())) {
      for (const u of Store.generateLocations(sito.id, zona.id)) {
        const stato = Store.getLocationStatus(u.code);
        if (stato === 'blocked' || stato === 'disabled') continue;
        if (!Store.getItemsAtLocation(u.code).length) return u.code;
        if (!ripiego) ripiego = u.code;
      }
    }
    return ripiego;
  },

  _pfBozzaHTML() {
    const b = this._pfBozza as Bozza;
    const modelli = Store.getModelliImballo();
    const righe = b.righe.map((r, i) => `
      <tr>
        <td class="mono font-bold">${this._esc(r.article_code)}</td>
        <td>${this._esc(r.article_description)}</td>
        <td class="mono">${this._esc(r.lot_code)}</td>
        <td class="mono">${this._esc(r.expiry_date || '—')}</td>
        <td class="mono td-right"><strong>${r.colli}</strong></td>
        <td><button class="btn btn-sm btn-danger" onclick="App._pfTogliRiga(${i})">Togli</button></td>
      </tr>`).join('');
    const partite = new Set(b.righe.map(r => `${r.article_code}#${r.lot_code}`));

    return `
      <div class="mov-preview mb-6 leading-[1.6]">
        <strong>① ARTICOLO → ② LOTTO → ③ SCADENZA → ④ COLLI → INVIO.</strong>
        I colli arrivano dal modello di imballo dell'articolo: sono una <strong>proposta</strong>,
        si riscrivono senza dover dire perché.
      </div>

      <div class="form-row mb-6">
        <div class="form-group"><label>Ubicazione <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="pfLoc" value="${this._esc(b.location_code)}"
            placeholder="MAG1-SPED-01-01"
            oninput="App._normScan('pfLoc')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('pfLoc');$('pfArt').focus();}"></div>
        <div class="form-group"><label>Ordine di produzione</label>
          <input class="input input-mono uppercase" id="pfOdp" value="${this._esc(b.odp_num)}"
            placeholder="facoltativo" oninput="App._normScan('pfOdp')"></div>
        <div class="form-group"><label>Modello di imballo</label>
          <select class="input" id="pfModello" onchange="App._pfModelloScelto()">
            <option value="">— dall'articolo —</option>
            ${modelli.map(m => `<option value="${this._esc(m.code)}" ${b.model_code === m.code ? 'selected' : ''}>${this._esc(descriviModello(m))}</option>`).join('')}
          </select></div>
      </div>

      <div class="form-row mb-3">
        <div class="form-group"><label>① Articolo <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="pfArt"
            oninput="App._normScan('pfArt');App._pfArticoloLetto()"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('pfArt');App._pfArticoloLetto();$('pfLot').focus();}"></div>
        <div class="form-group"><label>② Lotto <span class="req">*</span></label>
          <input class="input input-mono" id="pfLot"
            onkeydown="if(event.key==='Enter'){event.preventDefault();$('pfExp').focus();}"></div>
        <div class="form-group"><label>③ Scadenza</label>
          <input class="input input-mono" id="pfExp" placeholder="gg/mm/aaaa" maxlength="10"
            onkeydown="if(event.key==='Enter'){event.preventDefault();$('pfColli').focus();$('pfColli').select();}"></div>
        <div class="form-group"><label>④ Colli <span class="req">*</span></label>
          <input class="input" id="pfColli" type="number" min="1" step="1" value="1"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._pfAggiungiRiga();}"></div>
      </div>
      <div class="text-label-small text-sx-text-muted mb-6" id="pfArtInfo"></div>

      <div class="flex gap-4 flex-wrap mb-8">
        <button class="btn btn-primary" onclick="App._pfAggiungiRiga()">+ Aggiungi partita</button>
        <button class="btn btn-success" onclick="App._pfChiudiBancale()"
          ${b.righe.length ? '' : 'disabled'}>📦 Chiudi bancale ed etichetta (${b.righe.length})</button>
        <button class="btn" onclick="App._pfAnnullaBozza()">Annulla</button>
      </div>

      ${b.righe.length ? `
        <div class="overflow-x-auto"><table class="sx-table"><thead><tr>
          <th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Scadenza</th>
          <th class="td-right">Colli</th><th class="w-[100px]"></th>
        </tr></thead><tbody>${righe}</tbody></table></div>
        ${partite.size > 1 ? `<div class="mov-preview mov-preview-warn mt-4 leading-[1.6]">
          <strong>Bancale misto — ${partite.size} partite.</strong> Passa, e non è un errore:
          l'etichetta non scriverà articolo, lotto e scadenza, perché su un bancale misto
          non sono definiti. Il dettaglio lo dice la packing list.
        </div>` : ''}`
      : `<div class="text-body-small text-sx-text-muted">Nessuna partita dichiarata: il bancale nasce alla prima.</div>`}`;
  },

  /** La descrizione e la proposta dei colli, appena l'articolo si legge.
      Un articolo che l'anagrafica non conosce non ferma niente: si dice, e
      chi imballa decide. */
  _pfArticoloLetto() {
    const code = Validate.clean($('pfArt')?.value, true);
    const info = $('pfArtInfo');
    if (!info) return;
    if (!code) { info.innerHTML = ''; return; }
    const art = Store.getArticle(code);
    /* Il modello si legge PRIMA di sapere se l'articolo esiste: quello
       scelto a mano vale comunque, e dire «nessuna proposta» mentre il campo
       colli si riempie da solo è la contraddizione peggiore da leggere. */
    const modello = this._pfModelloCorrente(code);
    const attesi = colliAttesi(modello);
    if (attesi && !($('pfColli') as HTMLInputElement)?.dataset.tocca) {
      const campo = $('pfColli');
      if (campo) campo.value = String(attesi);
    }
    if (!art) {
      info.innerHTML = `<span class="text-sx-warning">⚠️ ${this._esc(code)} non è in anagrafica: si registra lo stesso, e la descrizione resta vuota.</span>`
        + (modello ? ` · <strong>${this._esc(descriviModello(modello))}</strong>` : '');
      return;
    }
    info.innerHTML = `${this._esc(art.description || '')}`
      + (modello ? ` · <strong>${this._esc(descriviModello(modello))}</strong>` : '')
      + (art.unit ? ` · UM <span class="mono">${this._esc(String(art.unit))}</span>` : '');
  },

  /** Il modello che vale adesso: quello scelto a mano sul bancale batte
      quello dell'anagrafica — chi imballa vede il pallet, l'anagrafica no. */
  _pfModelloCorrente(articleCode: string) {
    const b = this._pfBozza as Bozza | null;
    const scelto = b?.model_code
      ? Store.getModelliImballo().find(m => m.code === b.model_code)
      : null;
    return scelto || Store.modelloDiArticolo(articleCode);
  },

  _pfModelloScelto() {
    const b = this._pfBozza;
    if (!b) return;
    b.model_code = String($('pfModello')?.value ?? '');
    this._pfArticoloLetto();
  },

  _pfAggiungiRiga() {
    const b = this._pfBozza;
    if (!b) return;
    const art = Validate.clean($('pfArt')?.value, true);
    const lot = Validate.clean($('pfLot')?.value);
    const colli = parseInt(String($('pfColli')?.value ?? ''), 10);
    const errori = [Validate.article(art), Validate.lot(lot)].filter(Boolean) as string[];
    if (errori.length) return this.toast(errori[0], 'error');
    if (!colli || colli < 1) return this.toast('Numero di colli non valido (minimo 1)', 'error');
    /* La scadenza si converte adesso: `_dateITtoISO` avvisa da sé e
       restituisce `null` su una data incompleta. */
    const exp = this._dateITtoISO($('pfExp')?.value, 'Scadenza');
    if (exp === null) return;

    /* La stessa partita due volte sullo stesso bancale è un dito che
       scivola sull'INVIO: si sommano invece di scrivere due righe che il
       servizio poi rifiuterebbe come chiave doppia nello stesso vano. */
    const esistente = b.righe.find((r: RigaBozza) => r.article_code === art && r.lot_code === lot);
    if (esistente) {
      esistente.colli += colli;
      this.toast(`${art}#${lot} era già sul bancale: ora ${esistente.colli} colli`, 'info');
    } else {
      b.righe.push({
        article_code: art,
        article_description: Store.getArticle(art)?.description || '',
        lot_code: lot, expiry_date: exp, colli,
      });
    }
    b.location_code = Validate.clean($('pfLoc')?.value, true);
    b.odp_num = Validate.clean($('pfOdp')?.value, true);
    this._formProdottoFinito($('movFormArea'));
  },

  _pfTogliRiga(i: number) {
    const b = this._pfBozza;
    if (!b) return;
    b.righe.splice(i, 1);
    this._formProdottoFinito($('movFormArea'));
  },

  async _pfAnnullaBozza() {
    const b = this._pfBozza;
    if (b?.righe.length && !await Dialog.confirm({
      title: 'Annullare il bancale?',
      message: 'Le partite dichiarate si perdono. Niente è stato scritto a magazzino: il bancale esiste solo a video finché non lo si chiude.',
      details: Dialog.kv([['Partite', b.righe.length]]),
      confirmLabel: 'Annulla il bancale', danger: true,
    })) return;
    this._pfBozza = null;
    this._formProdottoFinito($('movFormArea'));
  },

  /* ── La chiusura: qui il bancale diventa merce ───────────────────────── */

  /* L'ORDINE CONTA. Prima nasce l'unità di carico, poi entrano le righe, poi
     le righe salgono sopra: al contrario non ci sarebbe niente da caricare.
     Se una riga non entra, quel che è entrato RESTA — la merce è a scaffale
     davvero — e il messaggio dice quale manca. Un bancale a metà si vede e
     si corregge; un bancale annullato a metà lascia merce che il sistema
     non sa di avere. */
  async _pfChiudiBancale() {
    const b = this._pfBozza;
    if (!b || !b.righe.length) return;
    if (!this._requireOperator('la chiusura di un bancale')) return;

    const loc = Validate.clean($('pfLoc')?.value, true) || b.location_code;
    if (!loc) return this.toast('Manca l’ubicazione dove sta il bancale', 'error');
    if (!Store.locationExists(loc)) return this.toast(`Ubicazione ${loc} non trovata`, 'error');
    const stato = Store.getLocationStatus(loc);
    if (stato === 'blocked') return this.toast(`Ubicazione ${loc} è BLOCCATA`, 'error');
    if (stato === 'disabled') return this.toast(`Ubicazione ${loc} è DISATTIVATA`, 'error');
    b.location_code = loc;
    b.odp_num = Validate.clean($('pfOdp')?.value, true);

    let udc: Udc;
    try {
      udc = await Store.createUdc({
        type: 'pallet', location_code: loc, site_id: this._sitoDiUbicazione(loc),
        kind: 'pf', odp_num: b.odp_num, model_code: b.model_code,
      });
    } catch (e) {
      return this.toast((e as Error).message || 'Non è stato possibile creare il bancale', 'error');
    }
    await this._logMov(MOV.UDC, '', '', '', loc, null, '',
      `Bancale di prodotto finito ${udc.udc_id}${b.odp_num ? ` — ordine ${b.odp_num}` : ''}`);

    const mancate: string[] = [];
    for (const r of b.righe) {
      try {
        /* Le UM non si dichiarano qui: dove il lotto o l'anagrafica portano
           una confezione, Store le deriva dai colli pieni come nel 1.7. */
        const res = await Store.addItem(loc, r.article_code, r.article_description,
          r.lot_code, r.expiry_date, '', r.colli, null, null);
        if (!res?.ok) throw new Error('scrittura rifiutata');
        await this._logMov(MOV.PROD, r.article_code, r.article_description, r.lot_code,
          loc, null, '', `Versamento produzione su ${udc.udc_id}${b.odp_num ? ` — ordine ${b.odp_num}` : ''}`,
          '', res.qty_before, r.colli, res.qty_after, res.qty_uom_delta);
        await Store.assegnaAUdc(loc, `${r.article_code}#${r.lot_code}`, udc.udc_id);
      } catch (e) {
        mancate.push(`${r.article_code}#${r.lot_code}: ${(e as Error).message}`);
      }
    }

    this._pfBozza = null;
    this.updateSyncIndicator();
    if (mancate.length) {
      this.toast(`⚠️ ${udc.udc_id} creato, ma ${mancate.length} partite non sono entrate — ${mancate.join(' · ')}`, 'error');
    } else {
      this.toast(`📦 ${udc.udc_id} — ${b.righe.length} partite in ${loc}`, 'success');
    }
    this._formProdottoFinito($('movFormArea'));
    /* L'etichetta si stampa SUBITO, come per un'unità di carico: un bancale
       senza etichetta è un bancale che nessuno può scansionare. */
    this._pfEtichetta(udc.udc_id);
  },

  _pfEtichetta(udcId: string) {
    const u = Store.getUdc(udcId);
    if (!u) return this.toast(`${udcId} non esiste`, 'error');
    this._chiediStampaEtichetta({
      tipo: 'pf',
      udc_id: u.udc_id,
      location_code: u.location_code || '',
      titolo: `Etichetta bancale ${u.udc_id}`,
      suA4: `App._pfEtichettaA4('${u.udc_id}')`,
    });
  },

  /* L'ETICHETTA DEL BANCALE SU A4 — la via che resta quando la Zebra e'
     spenta, il rotolo e' finito o la rete e' giu'. §8: la stampante si
     affianca alla carta, non la sostituisce.

     Le barre portano il codice del bancale — la stessa stringa che manda
     alla Zebra, perche' quel che deve coincidere fra le due strade e' il
     simbolo. Sotto, quel che sta sopra il bancale: su un misto i campi
     della merce restano vuoti e la riga lo dichiara. */
  _pfEtichettaA4(udcId: string) {
    const u = Store.getUdc(udcId);
    if (!u) return this.toast(`${udcId} non esiste`, 'error');
    const r = riepiloga(u, Store.righeDiUdc(u.udc_id), null,
      (riga) => Store.getUomConfig(riga.article_code, riga.lot_code)?.uom ?? null);

    const fuori = primoCarattereFuoriSet(u.udc_id);
    const barre = fuori === null
      ? barcodeSvg(u.udc_id, { modulo: 0.5, altezza: 24, etichetta: u.udc_id,
                               descrizione: `Bancale ${u.udc_id}` })
      : `<div class="pf-label-code">${this._esc(u.udc_id)}</div>`;

    const riga = (etichetta: string, valore: string) => valore
      ? `<div class="pf-label-riga"><span>${etichetta}</span><strong>${this._esc(valore)}</strong></div>`
      : '';
    const quantita = r.uom_qty === null ? '' : `${r.uom_qty} ${r.uom}`;

    this._docPrint(`<div class="pf-label">
      <div class="pf-label-testa">${this._esc(descriviContenuto(r))}</div>
      ${r.article_description ? `<div class="pf-label-desc">${this._esc(r.article_description)}</div>` : ''}
      <div class="pf-label-barcode">${barre}</div>
      ${riga('Lotto', r.lot_code || '')}
      ${/* La data all'italiana, come sullo ZPL: due strade che stampano la
           stessa etichetta non possono scrivere la data in due modi. */''}
      ${riga('Scadenza', r.expiry_date ? this._dateISOtoIT(r.expiry_date) : '')}
      ${riga('Colli', String(r.colli))}
      ${riga('Quantità', quantita)}
      ${riga('Ordine', r.odp_num || '')}
    </div>`);
  },

  /* ── L'elenco di chi spedisce ────────────────────────────────────────── */

  /** I bancali di prodotto finito, già riepilogati. Sorgente unica per
      l'elenco, per la mappa e per quel che si carica su un DDT. */
  _pfBancali(): RiepilogoBancale[] {
    const impegnati = bancaliImpegnati(Store.getPendingOutbound());
    return (Store.getUdcList() as Udc[])
      .filter(u => ePf(u) && u.status !== 'empty')
      .map(u => riepiloga(u, Store.righeDiUdc(u.udc_id), impegnati,
        (r) => Store.getUomConfig(r.article_code, r.lot_code)?.uom ?? null))
      .sort((a, b) => a.udc_id.localeCompare(b.udc_id));
  },

  /* Le colonne dell'elenco. `valore` serve dove la cella non è un campo del
     riepilogo: il contenuto è una frase composta, e lo stato si ordina per
     come si legge, non per come si chiama dentro. */
  _pfColonne(): Colonna<RiepilogoBancale>[] {
    return [
      { campo: 'udc_id', titolo: 'Bancale' },
      { campo: 'stato', titolo: 'Stato', valore: (r) => ETICHETTE_STATO[r.stato] },
      { campo: 'contenuto', titolo: 'Contenuto', valore: (r) => descriviContenuto(r) },
      { campo: 'article_description', titolo: 'Descrizione' },
      { campo: 'expiry_date', titolo: 'Scadenza', tipo: 'data' },
      { campo: 'colli', titolo: 'Colli', tipo: 'numero', cercabile: false },
      { campo: 'uom_qty', titolo: 'Quantità', tipo: 'numero', cercabile: false },
      { campo: 'location_code', titolo: 'Ubicazione' },
      { campo: 'odp_num', titolo: 'Ordine' },
      { campo: 'azioni', titolo: '', ordinabile: false, cercabile: false },
    ];
  },

  _pfOrdina(campo: string) {
    this._pfTabella = alClic(this._pfTabella, campo);
    this._formProdottoFinito($('movFormArea'));
  },

  /* La ricerca NON ridisegna il proprio campo: perderebbe fuoco e cursore a
     ogni tasto. Ridisegna solo la tabella — stessa regola della schermata
     del conto di produzione. */
  _pfCerca(v: string) {
    this._pfTabella = { ...this._pfTabella, cerca: String(v ?? '') };
    const zona = $('pfElencoTabella');
    if (zona) zona.innerHTML = this._pfTabellaHTML();
  },

  _pfTabellaHTML() {
    const tutti = this._pfBancali() as RiepilogoBancale[];
    const colonne = this._pfColonne() as Colonna<RiepilogoBancale>[];
    const righe = componi(tutti, colonne, this._pfTabella) as RiepilogoBancale[];

    const th = (campo: string, titolo: string, classe = '') => {
      const col = colonne.find((c) => c.campo === campo)!;
      return col.ordinabile === false
        ? `<th class="${classe}">${titolo}</th>`
        : `<th class="sx-th-ord ${classe}" onclick="App._pfOrdina('${campo}')">${titolo}${segno(this._pfTabella, campo)}</th>`;
    };

    const corpo = righe.length ? righe.map((r: RiepilogoBancale) => `
      <tr class="${r.stato === 'spedito' ? 'opacity-60' : ''}">
        <td class="mono font-bold">${this._esc(r.udc_id)}</td>
        <td><span class="badge badge-${r.stato === 'pronto' ? 'success' : r.stato === 'impegnato' ? 'warning' : 'muted'}">${ETICHETTE_STATO[r.stato]}</span></td>
        <td class="mono">${this._esc(descriviContenuto(r))}</td>
        <td>${this._esc(r.article_description || '')}</td>
        <td class="mono">${this._esc(r.expiry_date ? this._dateISOtoIT(r.expiry_date) : '')}</td>
        <td class="mono td-right">${r.colli}</td>
        <td class="mono td-right">${r.uom_qty === null ? '' : `${r.uom_qty} ${this._esc(r.uom || '')}`}</td>
        <td class="mono">${this._esc(r.location_code)}</td>
        <td class="mono">${this._esc(r.odp_num || '')}</td>
        <td class="whitespace-nowrap">
          <button class="btn btn-sm" onclick="App._pfEtichetta('${this._esc(r.udc_id)}')">🏷 Etichetta</button>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="10" class="text-sx-text-muted">${tutti.length
          ? 'Nessun bancale risponde al filtro.'
          : 'Nessun bancale di prodotto finito.'}</td></tr>`;

    return `
      <div class="overflow-x-auto"><table class="sx-table"><thead><tr>
        ${th('udc_id', 'Bancale')}${th('stato', 'Stato')}${th('contenuto', 'Contenuto')}
        ${th('article_description', 'Descrizione')}${th('expiry_date', 'Scadenza')}
        ${th('colli', 'Colli', 'td-right')}${th('uom_qty', 'Quantità', 'td-right')}
        ${th('location_code', 'Ubicazione')}${th('odp_num', 'Ordine')}
        ${th('azioni', '', 'w-[140px]')}
      </tr></thead><tbody>${corpo}</tbody></table></div>
      <div class="text-label-small text-sx-text-muted mt-3">
        ${righe.length} ${righe.length === 1 ? 'bancale' : 'bancali'} su ${tutti.length}
      </div>`;
  },

  _pfElencoHTML() {
    const zona = zonePf(Store.getSites())[0];
    return `
      <div class="flex justify-between items-center flex-wrap gap-4 mb-6">
        <strong>Bancali di prodotto finito</strong>
        <div class="flex gap-3 flex-wrap">
          ${zona ? `<button class="btn" onclick="App._pfVediInMappa()">🗺 Vedi in mappa</button>` : ''}
          <button class="btn btn-primary" onclick="App._pfNuovoBancale()">+ Nuovo bancale</button>
        </div>
      </div>
      <div class="form-group mb-5">
        <input class="input" id="pfCerca" value="${this._esc(this._pfTabella.cerca)}"
               placeholder="🔍 Filtra per bancale, articolo, lotto, ubicazione, ordine…"
               oninput="App._pfCerca(this.value)">
      </div>
      <div id="pfElencoTabella">${this._pfTabellaHTML()}</div>`;
  },

  /* LA VISTA GRAFICA NON È UNA MAPPA NUOVA: è la mappa, aperta sulla zona di
     prodotto finito e col filtro acceso. Una seconda pianta da tenere
     allineata alle zone sarebbe una seconda verità sullo stesso magazzino. */
  _pfVediInMappa() {
    const zona = zonePf(Store.getSites())[0];
    if (!zona) return this.toast('Nessuna zona è dichiarata di prodotto finito', 'warning');
    this._mapFiltroPf = true;
    this.openZone(zona.sito.id, zona.zona.id);
  },

} satisfies Vista;
