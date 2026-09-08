import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { MOV } from '../../core/costanti';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { svg as barcodeSvg, primoCarattereFuoriSet } from '../../modules/code128';
import { colliAttesi, descriviModello, modelloAppreso } from '../../modules/imballo';
import {
  espandi as espandiColli, validaDichiarazione,
  descriviColli as descriviElenco, totaleUom as totaleUomElenco,
} from '../../modules/colli';
import { decimali as decimaliUom, formattaQuantita } from '../../modules/misure';
import { componi, alClic, segno, STATO_VUOTO } from '../../modules/tabella';
import type { Colonna, Stato } from '../../modules/tabella';
import {
  ePf, riepiloga, bancaliImpegnati, descriviContenuto, ETICHETTE_STATO, zonePf, zoneImballo,
  spedizioniDiBancale,
} from '../../modules/bancale';
import type { RiepilogoBancale } from '../../modules/bancale';
import type { Udc } from '../../types/entita';

/* Una riga della bozza: quel che sta su un bancale prima che il bancale
   esista. Nasce a video e muore alla chiusura, quando diventa giacenza.

   2.21 — LA RIGA PORTA LA SUDDIVISIONE, non un numero solo. «40 × 12,5 KG
   + 1 × 7 KG» sono quarantuno colli e 507 KG, e i due numeri non si
   ricavano l'uno dall'altro: `elenco` è quel che entra in giacenza,
   `interi` è quel che diventa modello di carico. */
type RigaBozza = {
  article_code: string;
  article_description: string;
  lot_code: string;
  expiry_date: string;
  colli: number;
  /** La suddivisione dichiarata, o `null` su un articolo senza unità: lì
      non c'è niente da dividere e si carica a soli colli, come nella 1.7. */
  elenco: number[] | null;
  uom: string | null;
  /** I soli colli PIENI — la prima riga della dichiarazione. È quel che
      diventa modello di carico: un modello non ha mai colli incompleti. */
  interi: number;
};

/* LE DUE FASI, E L'ORDINE È QUELLO DEL REPARTO. Prima si dichiara che cosa
   c'è sopra, poi il bancale nasce e l'etichetta esce, e SOLO DOPO si dice
   dove è stato posato: il muletto porta via il pallet etichettato, e
   l'ubicazione la scansiona chi lo posa, non chi lo imballa. */
type Fase = 'partite' | 'ubicazione';

type Bozza = {
  fase: Fase;
  /** Vuoto in fase «partite»: il bancale non esiste ancora. */
  udc_id: string;
  location_code: string;
  odp_num: string;
  model_code: string;
  righe: RigaBozza[];
};

/** Una riga della dichiarazione: «quanti colli, e quanto dentro». La prima
    è quella dei colli pieni; le altre sono gli incompleti. Restano stringhe
    finché non si conferma — correggere mentre si digita cancella la cifra a
    chi sta ancora componendo «12,5». */
type RigaColli = { colli: string; per: string };

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

  /** I bancali spuntati, per codice. Vive quanto la schermata: chi esce da
      Movimenta ricomincia, come per il carrello del DDT. */
  _pfSel: new Set<string>(),

  _formProdottoFinito(el: HTMLElement) {
    const zone = zonePf(Store.getSites());
    el.innerHTML = `
      ${!zone.length ? `<div class="mov-preview mov-preview-warn mb-6 leading-larga">
        <strong>Nessuna zona è dichiarata di prodotto finito.</strong> Si marca in
        Configurazione → Siti e Zone, sulla zona dove il reparto posa i bancali.
        Finché non c'è, l'ubicazione si scrive a mano — la maschera funziona lo stesso.
      </div>` : ''}
      ${this._pfBozza ? '' : this._pfOrfaniHTML()}
      ${this._pfBozza ? this._pfBozzaHTML() : this._pfElencoHTML()}`;
    if (this._pfBozza) {
      this.setPrimaryScanField(this._pfBozza.fase === 'ubicazione' ? 'pfLoc' : 'pfArt');
      if (this._pfBozza.fase === 'partite') this._pfRenderColli();
    }
  },

  /* ── Il bancale che si sta componendo ───────────────────────────────── */

  /** La dichiarazione dei colli della partita che si sta scrivendo: la
      prima riga sono i colli pieni, le altre gli incompleti. */
  _pfColli: [] as RigaColli[],
  /** A quale articolo#lotto appartengono le righe qui sopra. Cambiando
      partita la dichiarazione riparte: righe di un altro articolo con la
      sigla nuova accanto sono un totale sbagliato che non si annuncia. */
  _pfColliChiave: '' as string,

  _pfNuovoBancale() {
    if (!this._requireOperator('la registrazione del prodotto finito')) return;
    this._pfBozza = {
      fase: 'partite', udc_id: '', location_code: '',
      odp_num: '', model_code: '', righe: [],
    };
    this._pfColli = [];
    this._pfColliChiave = '';
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
    return b.fase === 'ubicazione' ? this._pfUbicazioneHTML() : this._pfPartiteHTML();
  },

  /* LA MASCHERA È QUELLA DEL CARICO MERCE, E NON PER SOMIGLIANZA: chi
     imballa il prodotto finito è la stessa persona che posiziona la merce
     in arrivo, e due maschere diverse per lo stesso gesto sono due gesti da
     imparare. ① articolo → ② lotto → ③ colli pieni × quanto dentro, e il
     lettore avanza da sé. */
  _pfPartiteHTML() {
    const b = this._pfBozza as Bozza;
    const modelli = Store.getModelliImballo();
    const righe = b.righe.map((r, i) => `
      <tr>
        <td class="mono font-bold">${this._esc(r.article_code)}</td>
        <td>${this._esc(r.article_description)}</td>
        <td class="mono">${this._esc(r.lot_code)}</td>
        <td class="mono">${this._esc(r.expiry_date ? this._dateISOtoIT(r.expiry_date) : '—')}</td>
        <td class="mono td-right"><strong>${r.colli}</strong></td>
        <td class="mono td-right">${r.elenco && r.uom
          ? `${this._esc(formattaQuantita(totaleUomElenco(r.elenco, r.uom), r.uom))} ${this._esc(r.uom)}` : ''}</td>
        <td><button class="btn btn-sm btn-danger" onclick="App._pfTogliRiga(${i})">Togli</button></td>
      </tr>`).join('');
    const partite = new Set(b.righe.map(r => `${r.article_code}#${r.lot_code}`));

    return `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① ARTICOLO</span> → <span class="wf-step">② LOTTO</span> → <span class="wf-step">③ COLLI × QUANTO DENTRO</span> → INVIO.
        I colli arrivano dal modello di carico dell'articolo: sono una <strong>proposta</strong>, si riscrivono senza dover dire perché.
      </div>

      <div class="form-row mb-3">
        <div class="form-group"><label>① Articolo <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="pfArt" maxlength="${Validate.MAX.ARTICLE_CODE}"
            oninput="App._normScan('pfArt');App._pfArticoloLetto()"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('pfArt');App._pfArticoloLetto();$('pfLot').focus();}"></div>
        <div class="form-group"><label>② Lotto <span class="req">*</span></label>
          <input class="input input-mono" id="pfLot" maxlength="${Validate.MAX.LOT_CODE}"
            oninput="App._pfArticoloLetto()"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._pfArticoloLetto();App._pfFuocoColli();}"></div>
      </div>
      <div class="text-label-small text-sx-text-muted mb-5" id="pfArtInfo"></div>

      ${this._pfCampoColliHTML()}

      <details class="mb-5" id="pfExtra">
        <summary class="text-body-small text-sx-text-muted cursor-pointer">▾ Scadenza · Ordine di produzione · Modello di carico</summary>
        <div class="pt-4">
          <div class="form-row mb-4">
            <div class="form-group"><label>Scadenza</label>
              <input class="input input-mono" id="pfExp" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10"
                oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this)"></div>
            <div class="form-group"><label>Ordine di produzione</label>
              <input class="input input-mono uppercase" id="pfOdp" value="${this._esc(b.odp_num)}"
                placeholder="facoltativo" oninput="App._normScan('pfOdp')"></div>
          </div>
          <div class="form-group"><label>Modello di carico</label>
            <select class="input" id="pfModello" onchange="App._pfModelloScelto()">
              <option value="">— dall'articolo —</option>
              ${modelli.map(m => `<option value="${this._esc(m.code)}" ${b.model_code === m.code ? 'selected' : ''}>${this._esc(descriviModello(m))}</option>`).join('')}
            </select>
            <div class="text-label-small text-sx-text-muted mt-2">
              L'articolo che non ne ha uno lo <strong>impara adesso</strong>: i colli pieni
              dichiarati qui sotto diventano il suo modello, e dal bancale dopo sono già proposti.
            </div>
          </div>
        </div>
      </details>

      <div class="flex gap-4 flex-wrap mb-8">
        <button class="btn btn-primary" onclick="App._pfAggiungiRiga()">+ Aggiungi partita</button>
        <button class="btn btn-success" onclick="App._pfChiudiBancale()"
          ${b.righe.length ? '' : 'disabled'}>${this._ico('tag')} Chiudi bancale ed etichetta (${b.righe.length})</button>
        <button class="btn" onclick="App._pfAnnullaBozza()">Annulla</button>
      </div>

      ${b.righe.length ? `
        <div class="overflow-x-auto"><table class="sx-table"><thead><tr>
          <th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Scadenza</th>
          <th class="td-right">Colli</th><th class="td-right">Quantità</th><th class="w-[100px]"></th>
        </tr></thead><tbody>${righe}</tbody></table></div>
        ${partite.size > 1 ? `<div class="mov-preview mov-preview-warn mt-4 leading-larga">
          <strong>Bancale a lotti multipli — ${partite.size} partite.</strong> Passa, e non è un errore:
          l'etichetta non scriverà articolo, lotto e scadenza, perché su un bancale così
          non sono definiti. Il dettaglio lo dice la packing list.
        </div>` : ''}`
      : `<div class="text-body-small text-sx-text-muted">Nessuna partita dichiarata: il bancale nasce alla prima.</div>`}`;
  },

  /* ③ — I DUE CAMPI, E IL COLLO INCOMPLETO CHE SI AGGIUNGE SOTTO.
     «Colli pieni × quanto dentro» è il novantanove per cento dei bancali, e
     non costa un tasto in più. Il fine produzione porta il resto, e quello
     si dichiara con una riga in fondo — non riscrivendo il numero di sopra. */
  _pfCampoColliHTML() {
    return `
      <div class="text-label-small text-sx-text-muted mb-5" id="pfColliNota" hidden></div>
      <div class="form-group mb-5" id="pfColliBox" hidden>
        <label>③ Colli — <span id="pfColliSigla" class="mono"></span></label>
        <div id="pfColliRighe"></div>
        <button class="btn btn-sm mt-3" onclick="App._pfColliRigaAdd()">+ collo incompleto</button>
        <div class="text-label-small text-sx-text-muted mt-2.5" id="pfColliPrev"></div>
      </div>
      <div class="form-group mb-5" id="pfColliSoloBox" hidden>
        <label>③ Colli <span class="req">*</span></label>
        <input class="input input-mono max-w-[120px] text-center font-bold" id="pfColliSolo"
          type="number" min="1" step="1" value="1"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._pfAggiungiRiga();}">
      </div>`;
  },

  _pfFuocoColli() {
    const solo = $('pfColliSolo') as HTMLInputElement | null;
    if (solo && !$('pfColliSoloBox')?.hidden) { solo.focus(); solo.select(); return; }
    const primo = document.querySelector('#pfColliRighe input') as HTMLInputElement | null;
    if (primo) { primo.focus(); primo.select(); }
  },

  /** La descrizione, il modello e la dichiarazione, appena l'articolo si
      legge. Un articolo che l'anagrafica non conosce non ferma niente: si
      dice, e chi imballa decide. */
  _pfArticoloLetto() {
    const code = Validate.clean($('pfArt')?.value, true);
    const info = $('pfArtInfo');
    if (!info) return;
    if (!code) { info.innerHTML = ''; this._pfRenderColli(); return; }
    const art = Store.getArticle(code);
    /* Il modello si legge PRIMA di sapere se l'articolo esiste: quello
       scelto a mano vale comunque, e dire «nessuna proposta» mentre il campo
       colli si riempie da solo è la contraddizione peggiore da leggere. */
    const modello = this._pfModelloCorrente(code);
    if (!art) {
      info.innerHTML = `<span class="text-sx-warning">${this._ico('alert-triangle')} ${this._esc(code)} non è in anagrafica: si registra lo stesso, e la descrizione resta vuota.</span>`
        + (modello ? ` · <strong>${this._esc(descriviModello(modello))}</strong>` : '');
    } else {
      info.innerHTML = `${this._esc(art.description || '')}`
        + (modello
          ? ` · <strong>${this._esc(descriviModello(modello))}</strong>`
          : ` · <span class="text-sx-text-muted">nessun modello di carico — lo impara da questo bancale</span>`);
    }
    this._pfRenderColli();
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
    this._pfColliChiave = '';
    this._pfArticoloLetto();
  },

  /* ── La dichiarazione dei colli ──────────────────────────────────────── */

  /** L'unità e la quantità per collo che valgono adesso. */
  _pfConfezione(code: string) {
    return code ? Store.getUomConfig(code, Validate.clean($('pfLot')?.value)) : null;
  },

  _pfColliRigaAdd() {
    this._pfColli.push({ colli: '1', per: '' });
    this._pfRenderColli();
  },

  _pfColliRigaDel(i: number) {
    this._pfColli.splice(i, 1);
    if (!this._pfColli.length) this._pfColli.push({ colli: '', per: '' });
    this._pfRenderColli();
  },

  _pfColliRigaSet(i: number, campo: 'colli' | 'per', valore: string) {
    if (!this._pfColli[i]) return;
    this._pfColli[i][campo] = valore;
    this._pfAnteprimaColli();
  },

  /* La dichiarazione si apre già compilata: i colli dal modello di carico,
     il «quanto dentro» dall'anagrafica. Dove l'anagrafica non lo sa, il
     campo resta VUOTO e obbligatorio — proporre un numero inventato è
     peggio di non proporne nessuno — e quel che si scrive qui FINISCE IN
     ANAGRAFICA: l'articolo lo impara una volta, da chi ha il collo in mano. */
  _pfRenderColli() {
    const art = Validate.clean($('pfArt')?.value, true);
    const lot = Validate.clean($('pfLot')?.value);
    const cfg = this._pfConfezione(art);
    const box = $('pfColliBox'), solo = $('pfColliSoloBox'), nota = $('pfColliNota');
    if (!box || !solo || !nota) return;

    /* SENZA UNITÀ NON C'È NIENTE DA DIVIDERE, e il ramo si vede: un blocco
       che c'è su un articolo e non sull'altro, senza una riga che dica
       perché, è l'applicativo che «alcune volte funziona e altre no». */
    if (!cfg?.uom) {
      box.hidden = true;
      solo.hidden = false;
      nota.hidden = !art;
      nota.textContent = art
        ? `${this._ico('scale')} ${art}: nessuna unità di misura in anagrafica — si carica a soli colli. Si compila in Configurazione → Articoli.`
        : '';
      return;
    }
    box.hidden = false;
    solo.hidden = true;
    nota.hidden = true;
    const sigla = $('pfColliSigla');
    if (sigla) sigla.textContent = cfg.uom;

    const chiave = `${art}#${lot}#${(this._pfBozza as Bozza)?.model_code ?? ''}`;
    if (this._pfColliChiave !== chiave) {
      this._pfColliChiave = chiave;
      const attesi = colliAttesi(this._pfModelloCorrente(art));
      this._pfColli = [{
        colli: attesi === null ? '' : String(attesi),
        per: cfg.per_collo === null ? '' : String(cfg.per_collo),
      }];
    }

    const passo = decimaliUom(cfg.uom) === 0 ? '1' : '0.001';
    const campi = $('pfColliRighe');
    if (campi) {
      campi.innerHTML = (this._pfColli as RigaColli[]).map((r, i) => `
        <div class="flex gap-3 items-center mb-2.5">
          <input class="input input-mono max-w-[90px] text-center" type="number" min="1" step="1"
            value="${this._esc(String(r.colli ?? ''))}" placeholder="colli"
            oninput="App._pfColliRigaSet(${i},'colli',this.value)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._pfAggiungiRiga();}">
          <span class="text-sx-text-muted">×</span>
          <input class="input input-mono max-w-[130px] text-center" type="number" min="0" step="${passo}"
            value="${this._esc(String(r.per ?? ''))}" placeholder="${i ? 'quanto dentro' : 'per collo pieno'}"
            oninput="App._pfColliRigaSet(${i},'per',this.value)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._pfAggiungiRiga();}">
          <span class="text-label-small text-sx-text-muted mono">${this._esc(cfg.uom)}</span>
          ${i ? `<button class="btn btn-sm" title="Togli questo collo incompleto" onclick="App._pfColliRigaDel(${i})">${this._ico('x')}</button>`
              : `<span class="text-label-small text-sx-text-muted">colli pieni</span>`}
        </div>`).join('');
    }
    this._pfAnteprimaColli();
  },

  _pfAnteprimaColli() {
    const prev = $('pfColliPrev');
    if (!prev) return;
    const art = Validate.clean($('pfArt')?.value, true);
    const cfg = this._pfConfezione(art);
    if (!cfg?.uom) { prev.textContent = ''; return; }
    const errori = validaDichiarazione(this._pfColli, cfg.uom);
    if (errori.length) {
      prev.textContent = errori.join(' · ');
      prev.style.color = 'var(--sx-warning)';
      return;
    }
    const elenco = espandiColli(this._pfColli, cfg.uom)!;
    prev.style.color = 'var(--sx-text-muted)';
    prev.textContent = `${descriviElenco(elenco, cfg.uom)} — ${formattaQuantita(totaleUomElenco(elenco, cfg.uom), cfg.uom)} ${cfg.uom} in ${elenco.length} coll.`;
  },

  /* ── La partita entra nella bozza ────────────────────────────────────── */

  async _pfAggiungiRiga() {
    const b = this._pfBozza;
    if (!b) return;
    const art = Validate.clean($('pfArt')?.value, true);
    const lot = Validate.clean($('pfLot')?.value);
    const errori = [Validate.article(art), Validate.lot(lot)].filter(Boolean) as string[];
    if (errori.length) return this.toast(errori[0], 'error');
    /* La scadenza si converte adesso: `_dateITtoISO` avvisa da sé e
       restituisce `null` su una data incompleta. */
    const exp = this._dateITtoISO($('pfExp')?.value, 'Scadenza');
    if (exp === null) return;

    const cfg = this._pfConfezione(art);
    let elenco: number[] | null = null;
    let colli: number;
    let interi: number;
    if (cfg?.uom) {
      const problemi = validaDichiarazione(this._pfColli, cfg.uom);
      if (problemi.length) return this.toast(problemi.join(' · '), 'error');
      elenco = espandiColli(this._pfColli, cfg.uom);
      if (!elenco?.length) return this.toast('Dichiara almeno un collo', 'error');
      colli = elenco.length;
      /* I COLLI PIENI SONO LA PRIMA RIGA, E SOLO QUELLA. Le successive sono
         il resto di quel bancale — fine produzione, coda di lotto — e un
         modello di carico non porta mai un collo incompleto. */
      interi = parseInt(String(this._pfColli[0]?.colli ?? ''), 10) || 0;
      /* QUEL CHE È STATO SCRITTO QUI FINISCE IN ANAGRAFICA. L'articolo che
         la quantità per collo non ce l'ha la impara adesso, da chi ha il
         collo in mano — ed è l'unico momento in cui qualcuno la sa davvero. */
      if (cfg.per_collo === null && Store.getArticle(art)) {
        const per = this._pfColli[0]?.per;
        try {
          await Store.dichiaraConfezioneArticolo(art, cfg.uom, per);
          this.toast(`${art}: un collo pieno fa ${per} ${cfg.uom} — scritto in anagrafica`, 'info');
        } catch (e) {
          this.toast(`La confezione di ${art} non è stata scritta in anagrafica: ${(e as Error).message}`, 'warning');
        }
      }
    } else {
      colli = parseInt(String($('pfColliSolo')?.value ?? ''), 10);
      if (!colli || colli < 1) return this.toast('Numero di colli non valido (minimo 1)', 'error');
      interi = colli;
    }

    /* La stessa partita due volte sullo stesso bancale è un dito che
       scivola sull'INVIO: si sommano invece di scrivere due righe che il
       servizio poi rifiuterebbe come chiave doppia nello stesso vano. */
    const esistente = b.righe.find((r: RigaBozza) => r.article_code === art && r.lot_code === lot);
    if (esistente) {
      esistente.colli += colli;
      esistente.interi += interi;
      if (esistente.elenco && elenco) esistente.elenco = [...esistente.elenco, ...elenco];
      this.toast(`${art}#${lot} era già sul bancale: ora ${esistente.colli} colli`, 'info');
    } else {
      b.righe.push({
        article_code: art,
        article_description: Store.getArticle(art)?.description || '',
        lot_code: lot, expiry_date: exp, colli, elenco, uom: cfg?.uom ?? null, interi,
      });
    }
    b.odp_num = Validate.clean($('pfOdp')?.value, true);
    this._pfColliChiave = '';
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
    if (!b) return;
    if (b.fase === 'ubicazione') {
      if (!await Dialog.confirm({
        title: 'Buttare il bancale etichettato?',
        message: 'Il bancale è nato e l’etichetta è uscita, ma la merce NON è entrata in giacenza: '
          + 'senza un’ubicazione non c’è niente da scrivere. Il codice resta bruciato e l’etichetta si butta.',
        details: Dialog.kv([['Bancale', b.udc_id], ['Partite dichiarate', b.righe.length]]),
        confirmLabel: 'Butta il bancale', danger: true,
      })) return;
      try { await Store.chiudiUdcSeVuota(b.udc_id); } catch { /* già chiuso: non è un errore */ }
      this.toast(`${b.udc_id} chiuso vuoto — l'etichetta si butta`, 'warning');
    } else if (b.righe.length && !await Dialog.confirm({
      title: 'Annullare il bancale?',
      message: 'Le partite dichiarate si perdono. Niente è stato scritto a magazzino: il bancale esiste solo a video finché non lo si chiude.',
      details: Dialog.kv([['Partite', b.righe.length]]),
      confirmLabel: 'Annulla il bancale', danger: true,
    })) return;
    this._pfBozza = null;
    this._pfColli = [];
    this._pfColliChiave = '';
    this._formProdottoFinito($('movFormArea'));
  },

  /* ── La chiusura: il bancale nasce, e l'etichetta esce ───────────────── */

  /* ═══ 2.33 · IL BANCALE NASCE IN ZONA IMBALLAGGIO, E L'ETICHETTA DICE IL VERO ══

     FINO ALLA 2.32 L'ETICHETTA DICHIARAVA IL FALSO, e non per un campo che
     mancava. Il bancale nasceva senza ubicazione e senza merce — le righe
     entravano dopo, alla scansione del vano — quindi `riepiloga` leggeva
     zero partite e `CAMPI_PF.articolo` stampava letteralmente
     «LOTTI MULTIPLI — 0 partite» su un pallet che ne portava una sola.
     Un'etichetta vuota si vede; una che dichiara il contrario del vero no.

     La ragione di allora era buona: l'etichetta deve uscire mentre il pallet
     è ancora al banco d'imballo, e il vano lo scansiona chi lo posa un
     minuto dopo. Ma quel «dopo» era un'attesa senza motivo — il banco
     d'imballo È un posto, e dalla 2.30 il sistema sa quale: `pack_zone`.
     Il bancale ci nasce dentro, con la merce sopra, e l'etichetta esce
     completa. Poi in spedizioni ci va con un normale trasferimento.

     L'UBICAZIONE RESTA FUORI DALL'ETICHETTA — §8. Quel che mancava non era
     il vano: era sapere che cosa c'è sopra, e adesso si sa. Il vano cambierà
     appena il pallet si sposta, e un'etichetta che lo nomina diventa una
     bugia incollata al legno.

     SENZA ZONA DI IMBALLAGGIO SI TORNA AL GIRO DI PRIMA, in due tempi.
     Bloccare la produzione perché una zona non è marcata sarebbe un vincolo
     formale pagato da chi imballa: si avvisa, e si lascia lavorare. */
  async _pfChiudiBancale() {
    const b = this._pfBozza;
    if (!b || !b.righe.length || b.fase !== 'partite') return;
    if (!this._requireOperator('la chiusura di un bancale')) return;
    b.odp_num = Validate.clean($('pfOdp')?.value, true);

    const zona = zoneImballo(Store.getSites())[0] || null;
    const vanoImballo = zona ? this._pfVanoDiZona(zona) : '';

    let udc: Udc;
    try {
      udc = await Store.createUdc({
        type: 'pallet', kind: 'pf', odp_num: b.odp_num,
        model_code: b.model_code || this._pfModelloDelBancale(b),
        ...(vanoImballo ? { site_id: zona!.sito.id, location_code: vanoImballo } : {}),
      });
    } catch (e) {
      return this.toast((e as Error).message || 'Non è stato possibile creare il bancale', 'error');
    }
    b.udc_id = udc.udc_id;

    if (!vanoImballo) {
      /* La strada di prima: due tempi, e l'etichetta si ristampa dal vano. */
      b.fase = 'ubicazione';
      b.location_code = this._pfProponiUbicazione();
      this.updateSyncIndicator();
      this._formProdottoFinito($('movFormArea'));
      this.toast('Nessuna zona di imballaggio dichiarata: si posa il bancale e si ristampa l\'etichetta dal vano.', 'warning');
      this._pfEtichetta(udc.udc_id);
      return;
    }

    /* LA MERCE ENTRA ADESSO, ed è tutta la differenza: `_pfEtichetta` legge
       `righeDiUdc`, e quelle righe devono esistere PRIMA che la stampa parta. */
    b.location_code = vanoImballo;
    await this._pfDeposita(b, vanoImballo);
    this._pfEtichetta(udc.udc_id);
  },

  /** Il vano dove posare un bancale dentro una zona marcata.
      Libero se ce n'è uno, altrimenti il primo utilizzabile: lo spazio del
      banco d'imballo non si conta — §8, `pack_zone`. */
  _pfVanoDiZona(zona) {
    let ripiego = '';
    for (const u of Store.generateLocations(zona.sito.id, zona.zona.id)) {
      const stato = Store.getLocationStatus(u.code);
      if (stato === 'blocked' || stato === 'disabled') continue;
      if (!Store.getItemsAtLocation(u.code).length) return u.code;
      if (!ripiego) ripiego = u.code;
    }
    return ripiego;
  },

  /** Il modello che questo bancale porta scritto sopra: quello dell'articolo
      se ce l'ha, altrimenti quello che sta per fargli imparare — il codice è
      deterministico e si sa già, anche se il modello nascerà fra un istante,
      a merce entrata. Senza, il bancale resterebbe l'unico a non nominare il
      formato con cui è stato fatto, e la packing list non saprebbe dove
      leggerne supporto e tara.

      Solo su un bancale a UNA partita: con due articoli sopra non c'è «il»
      modello di quel pallet, e sceglierne uno sarebbe sceglierne uno a caso. */
  _pfModelloDelBancale(b: Bozza): string {
    if (b.righe.length !== 1) return '';
    const r = b.righe[0]!;
    return Store.modelloDiArticolo(r.article_code)?.code
      ?? modelloAppreso(r.interi)?.code ?? '';
  },

  _pfUbicazioneHTML() {
    const b = this._pfBozza as Bozza;
    const totale = b.righe.reduce((n, r) => n + r.colli, 0);
    return `
      <div class="wf-instructions">
        <strong>④ UBICAZIONE.</strong> Il bancale <span class="mono font-bold">${this._esc(b.udc_id)}</span>
        è nato e l'etichetta è uscita. <strong>Posa il bancale e scansiona il vano</strong>:
        la merce entra in giacenza lì.
      </div>

      <div class="form-group mb-5">
        <label>Ubicazione <span class="req">*</span></label>
        <div class="flex gap-3">
          <input class="input input-mono flex-1 uppercase" id="pfLoc" value="${this._esc(b.location_code)}"
            placeholder="Scansiona il vano" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('pfLoc');App._previewLoc('pfLoc','pfLocPrev')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('pfLoc');App._pfPosiziona();}">
          <button class="btn btn-sm" onclick="App._pickLoc('pfLoc','_cbPickPf')" title="Sfoglia le ubicazioni">${this._ico('map-pin')}</button>
        </div>
        <div id="pfLocPrev"></div>
      </div>

      <div class="flex gap-4 flex-wrap mb-8">
        <button class="btn btn-success btn-conferma" onclick="App._pfPosiziona()">${this._ico('check')} POSIZIONA IL BANCALE</button>
        <button class="btn" onclick="App._pfEtichetta('${this._esc(b.udc_id)}')">${this._ico('tag')} Ristampa etichetta</button>
        <button class="btn btn-danger" onclick="App._pfAnnullaBozza()">Butta</button>
      </div>

      <div class="overflow-x-auto"><table class="sx-table"><thead><tr>
        <th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Scadenza</th><th class="td-right">Colli</th>
      </tr></thead><tbody>${b.righe.map(r => `<tr>
        <td class="mono font-bold">${this._esc(r.article_code)}</td>
        <td>${this._esc(r.article_description)}</td>
        <td class="mono">${this._esc(r.lot_code)}</td>
        <td class="mono">${this._esc(r.expiry_date ? this._dateISOtoIT(r.expiry_date) : '—')}</td>
        <td class="mono td-right"><strong>${r.colli}</strong></td>
      </tr>`).join('')}</tbody></table></div>
      <div class="text-label-small text-sx-text-muted mt-3">${b.righe.length} ${b.righe.length === 1 ? 'partita' : 'partite'} · ${totale} colli</div>`;
  },

  _cbPickPf() { setTimeout(() => { App._previewLoc('pfLoc', 'pfLocPrev'); $('pfLoc')?.focus(); }, 30); },

  /* L'ORDINE CONTA. Prima il bancale prende il suo vano, poi entrano le
     righe, poi le righe salgono sopra: al contrario non ci sarebbe niente da
     caricare. Se una riga non entra, quel che è entrato RESTA — la merce è a
     scaffale davvero — e il messaggio dice quale manca. Un bancale a metà si
     vede e si corregge; un bancale annullato a metà lascia merce che il
     sistema non sa di avere. */
  async _pfPosiziona() {
    const b = this._pfBozza;
    if (!b || b.fase !== 'ubicazione') return;
    if (!this._requireOperator('il posizionamento di un bancale')) return;

    this._vanoDaCampo('pfLoc');
    const loc = Validate.clean($('pfLoc')?.value, true) || b.location_code;
    if (!loc) return this.toast('Manca l’ubicazione dove sta il bancale', 'error');
    if (!Store.locationExists(loc)) return this.toast(`Ubicazione ${loc} non trovata`, 'error');
    const stato = Store.getLocationStatus(loc);
    if (stato === 'blocked') return this.toast(`Ubicazione ${loc} è BLOCCATA`, 'error');
    if (stato === 'disabled') return this.toast(`Ubicazione ${loc} è DISATTIVATA`, 'error');
    b.location_code = loc;

    try {
      await Store.posizionaUdcVuota(b.udc_id, loc);
    } catch (e) {
      return this.toast((e as Error).message || `Non è stato possibile posizionare ${b.udc_id}`, 'error');
    }
    await this._pfDeposita(b, loc);
  },

  /* ═══ 2.33 · LA MERCE SALE SUL BANCALE, in un posto solo ══════════════
     Prima stava dentro `_pfPosiziona`, ed era l'unica strada. Dalla 2.33 le
     strade sono due — la chiusura in zona imballaggio, e il posizionamento a
     mano quando quella zona non c'è — e devono fare la stessa identica cosa:
     scrivere le righe, timbrare il versamento di produzione, legarle
     all'unità, imparare il modello di carico. Due copie di questo ciclo
     sarebbero due modi di far nascere un bancale, e il secondo dimenticherebbe
     l'apprendimento del modello il giorno che qualcuno lo tocca. */
  async _pfDeposita(b, loc) {
    await this._logMov(MOV.UDC, '', '', '', loc, null, '',
      `Bancale di prodotto finito ${b.udc_id}${b.odp_num ? ` — ordine ${b.odp_num}` : ''}`);

    const mancate: string[] = [];
    const imparati: string[] = [];
    for (const r of b.righe) {
      try {
        /* Dove la suddivisione è dichiarata comanda lei: i colli sono quanti
           sono nell'elenco e le UM sono la loro somma. Dove non c'è, Store
           deriva dai colli pieni come nella 1.7. */
        const res = await Store.addItem(loc, r.article_code, r.article_description,
          r.lot_code, r.expiry_date, '', r.colli, null, r.elenco);
        if (!res?.ok) throw new Error('scrittura rifiutata');
        await this._logMov(MOV.PROD, r.article_code, r.article_description, r.lot_code,
          loc, null, '', `Versamento produzione su ${b.udc_id}${b.odp_num ? ` — ordine ${b.odp_num}` : ''}`,
          '', res.qty_before, r.colli, res.qty_after, res.qty_uom_delta);
        await Store.assegnaAUdc(loc, `${r.article_code}#${r.lot_code}`, b.udc_id);
        /* IL MODELLO DI CARICO SI IMPARA QUI, a merce entrata: un articolo
           che non ne aveva uno lo riceve dai colli pieni di questo bancale, e
           dal prossimo il numero è già proposto. Chi ce l'ha già non lo
           cambia — la proposta segue il caso normale, non l'ultimo. */
        const code = await Store.apprendiModelloDiArticolo(r.article_code, r.interi);
        if (code) imparati.push(`${r.article_code} → ${r.interi} colli`);
      } catch (e) {
        mancate.push(`${r.article_code}#${r.lot_code}: ${(e as Error).message}`);
      }
    }

    const partite = b.righe.length;
    const udcId = b.udc_id;
    this._pfBozza = null;
    this._pfColli = [];
    this._pfColliChiave = '';
    this.updateSyncIndicator();
    if (mancate.length) {
      this.toast(`${udcId} posizionato in ${loc}, ma ${mancate.length} partite non sono entrate — ${mancate.join(' · ')}`, 'error');
    } else {
      this.toast(`${udcId} — ${partite} ${partite === 1 ? 'partita' : 'partite'} in ${loc}`, 'success');
    }
    if (imparati.length) {
      this.toast(`Modello di carico appreso: ${imparati.join(' · ')}`, 'info');
    }
    this._formProdottoFinito($('movFormArea'));
  },

  /* ── I bancali etichettati e mai riempiti ────────────────────────────── */

  /** Nati, etichettati, e abbandonati prima del vano. Non portano merce e
      non ne hanno mai portata: sono etichette da buttare, e si dicono in
      cima all'elenco perché un codice stampato che nessuno chiude resta lì. */
  _pfOrfani(): Udc[] {
    return (Store.getUdcList() as Udc[]).filter(u =>
      ePf(u) && u.status === 'open' && !u.location_code && !Store.righeDiUdc(u.udc_id).length);
  },

  async _pfScartaOrfano(udcId: string) {
    if (!await Dialog.confirm({
      title: 'Buttare l’etichetta?',
      message: 'Questo bancale è nato, è stato etichettato e non ha mai ricevuto né merce né ubicazione. '
        + 'Si chiude vuoto: il codice resta bruciato e l’etichetta si butta.',
      details: Dialog.kv([['Bancale', udcId]]),
      confirmLabel: 'Butta', danger: true,
    })) return;
    try { await Store.chiudiUdcSeVuota(udcId); } catch (e) {
      return this.toast((e as Error).message || 'Non è stato possibile chiuderlo', 'error');
    }
    this.updateSyncIndicator();
    this._formProdottoFinito($('movFormArea'));
  },

  _pfOrfaniHTML() {
    const orfani = this._pfOrfani() as Udc[];
    if (!orfani.length) return '';
    return `<div class="mov-preview mov-preview-warn mb-6 leading-larga">
      <strong>${orfani.length} ${orfani.length === 1 ? 'bancale etichettato e mai riempito' : 'bancali etichettati e mai riempiti'}.</strong>
      Sono nati, l'etichetta è uscita, e nessuno ha scansionato il vano: non portano merce.
      <div class="flex gap-3 flex-wrap mt-3">
        ${orfani.map(u => `<button class="btn btn-sm btn-danger" onclick="App._pfScartaOrfano('${this._esc(u.udc_id)}')">${this._esc(u.udc_id)} · butta</button>`).join('')}
      </div>
    </div>`;
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

  /** Quali stati si guardano. Di serie i bancali SPEDITI restano fuori:
      sono merce su un camion, e chi apre questa schermata cerca quel che
      deve ancora partire. L'elenco dichiara sempre cosa non sta guardando. */
  _pfFiltroStato: 'attivi' as 'attivi' | 'pronto' | 'impegnato' | 'spedito' | 'tutti',

  /** I bancali di prodotto finito, già riepilogati. Sorgente unica per
      l'elenco, per la mappa e per quel che si carica su un DDT. */
  _pfBancali(): RiepilogoBancale[] {
    const impegnati = bancaliImpegnati(Store.getPendingOutbound());
    /* Il viaggio si rilegge dai documenti EVASI, una volta per disegno e non
       una per riga: con duecento bancali e trecento documenti, cercare il
       DDT riga per riga vorrebbe dire sessantamila giri. */
    const viaggi = spedizioniDiBancale(Store.getAllOutbound());
    return (Store.getUdcList() as Udc[])
      .filter(u => ePf(u) && u.status !== 'empty')
      .map(u => riepiloga(u, Store.righeDiUdc(u.udc_id), impegnati,
        (r) => Store.getUomConfig(r.article_code, r.lot_code)?.uom ?? null, viaggi))
      .sort((a, b) => a.udc_id.localeCompare(b.udc_id));
  },

  /** Quel che il filtro di stato lascia passare. */
  _pfFiltrati(tutti: RiepilogoBancale[]): RiepilogoBancale[] {
    const f = this._pfFiltroStato;
    if (f === 'tutti') return tutti;
    if (f === 'attivi') return tutti.filter(r => r.stato !== 'spedito');
    return tutti.filter(r => r.stato === f);
  },

  /* Le colonne dell'elenco. `valore` serve dove la cella non è un campo del
     riepilogo: lo stato si ordina per come si legge, non per come si chiama
     dentro, e l'articolo di un bancale a lotti multipli è una frase.

     2.21 — ARTICOLO E LOTTO SONO DUE COLONNE, e non una frase sola. Sono i
     due campi su cui si decide se è la riga giusta, e cercare «LOT2408» in
     una colonna che porta `ART#LOT` funziona per caso: funziona finché il
     lotto non contiene un cancelletto. L'ordine è quello della scheda —
     chi è, quanto ce n'è, com'è fatto. */
  _pfColonne(): Colonna<RiepilogoBancale>[] {
    return [
      { campo: 'udc_id', titolo: 'Bancale' },
      { campo: 'stato', titolo: 'Stato', valore: (r) => ETICHETTE_STATO[r.stato] },
      { campo: 'article_code', titolo: 'Articolo', valore: (r) => this._pfArticoloCella(r) },
      { campo: 'lot_code', titolo: 'Lotto' },
      { campo: 'colli', titolo: 'Colli', tipo: 'numero', cercabile: false },
      { campo: 'uom_qty', titolo: 'Quantità', tipo: 'numero', cercabile: false },
      { campo: 'article_description', titolo: 'Descrizione' },
      { campo: 'expiry_date', titolo: 'Scadenza', tipo: 'data' },
      { campo: 'location_code', titolo: 'Ubicazione' },
      { campo: 'odp_num', titolo: 'Ordine' },
      { campo: 'ddt_num', titolo: 'DDT' },
      { campo: 'shipped_at', titolo: 'Spedito il', tipo: 'data', cercabile: false },
      { campo: 'azioni', titolo: '', ordinabile: false, cercabile: false },
    ];
  },

  /** Che cosa scrive la colonna Articolo. Su un bancale con più partite non
      c'è UN articolo: si dichiara, col numero — «due» e «nove» non portano
      a controllare la stessa cosa — e la colonna Lotto resta vuota, che è
      un'assenza e non un dato inventato. */
  _pfArticoloCella(r: RiepilogoBancale): string {
    return r.mono ? (r.article_code || '') : descriviContenuto(r);
  },

  _pfOrdina(campo: string) {
    this._pfTabella = alClic(this._pfTabella, campo);
    this._formProdottoFinito($('movFormArea'));
  },

  _pfStato(valore: string) {
    this._pfFiltroStato = valore as typeof this._pfFiltroStato;
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
    const visibili = this._pfFiltrati(tutti);
    const colonne = this._pfColonne() as Colonna<RiepilogoBancale>[];
    const righe = componi(visibili, colonne, this._pfTabella) as RiepilogoBancale[];
    const fuori = tutti.length - visibili.length;

    const th = (campo: string, titolo: string, classe = '') => {
      const col = colonne.find((c) => c.campo === campo)!;
      return col.ordinabile === false
        ? `<th class="${classe}">${titolo}</th>`
        : `<th class="sx-th-ord ${classe}" onclick="App._pfOrdina('${campo}')">${titolo}${segno(this._pfTabella, campo)}</th>`;
    };

    const corpo = righe.length ? righe.map((r: RiepilogoBancale) => `
      <tr class="${r.stato === 'spedito' ? 'opacity-60' : ''}">
        <td>${r.stato === 'pronto'
          ? `<input type="checkbox" class="w-[18px] h-[18px] cursor-pointer"
               ${this._pfSel.has(r.udc_id) ? 'checked' : ''}
               onchange="App._pfSpunta('${this._esc(r.udc_id)}', this.checked)">`
          : `<span class="text-sx-text-muted" title="${r.stato === 'impegnato'
              ? 'Già su un DDT pendente: si corregge da quel documento'
              : ETICHETTE_STATO[r.stato]}">—</span>`}</td>
        <td class="mono font-bold">${this._esc(r.udc_id)}</td>
        <td><span class="badge badge-${r.stato === 'pronto' ? 'success' : r.stato === 'impegnato' ? 'warning' : 'muted'}">${ETICHETTE_STATO[r.stato]}</span></td>
        <td class="mono ${r.mono ? 'font-bold' : 'text-sx-text-muted'}">${this._esc(this._pfArticoloCella(r))}</td>
        <td class="mono">${this._esc(r.lot_code || '')}</td>
        <td class="mono td-right">${r.colli}</td>
        <td class="mono td-right">${r.uom_qty === null ? '' : `${r.uom_qty} ${this._esc(r.uom || '')}`}</td>
        <td>${this._esc(r.article_description || '')}</td>
        <td class="mono">${this._esc(r.expiry_date ? this._dateISOtoIT(r.expiry_date) : '')}</td>
        <td class="mono">${this._esc(r.location_code)}</td>
        <td class="mono">${this._esc(r.odp_num || '')}</td>
        <td class="mono">${this._esc(r.ddt_num || '')}</td>
        <td class="mono">${r.shipped_at ? new Date(r.shipped_at).toLocaleDateString('it-IT') : ''}</td>
        <td class="whitespace-nowrap">
          <button class="btn btn-sm" onclick="App._pfEtichetta('${this._esc(r.udc_id)}')">${this._ico('tag')} Etichetta</button>
        </td>
      </tr>`).join('')
      : `<tr><td colspan="14" class="text-sx-text-muted">${visibili.length || tutti.length
          ? 'Nessun bancale risponde al filtro.'
          : 'Nessun bancale di prodotto finito.'}</td></tr>`;

    return `
      <div class="overflow-x-auto"><table class="sx-table"><thead><tr>
        <th class="w-[40px]"></th>
        ${th('udc_id', 'Bancale')}${th('stato', 'Stato')}
        ${th('article_code', 'Articolo')}${th('lot_code', 'Lotto')}
        ${th('colli', 'Colli', 'td-right')}${th('uom_qty', 'Quantità', 'td-right')}
        ${th('article_description', 'Descrizione')}${th('expiry_date', 'Scadenza')}
        ${th('location_code', 'Ubicazione')}${th('odp_num', 'Ordine')}
        ${th('ddt_num', 'DDT')}${th('shipped_at', 'Spedito il')}
        ${th('azioni', '', 'w-[140px]')}
      </tr></thead><tbody>${corpo}</tbody></table></div>
      <div class="text-label-small text-sx-text-muted mt-3">
        ${righe.length} ${righe.length === 1 ? 'bancale' : 'bancali'} su ${tutti.length}
        ${fuori ? ` · <strong>${fuori}</strong> fuori dal filtro di stato` : ''}
        ${this._pfSel.size ? ` · <strong>${this._pfSel.size} ${this._pfSel.size === 1 ? 'scelto' : 'scelti'}</strong>` : ''}
      </div>`;
  },

  /* La spunta non ridisegna la tabella: cambiarla sotto le dita di chi sta
     spuntando la quarta riga di otto perde la posizione. Si aggiornano i
     soli pulsanti, che sono l'unica cosa che dipende da quanti sono. */
  _pfSpunta(udcId: string, acceso: boolean) {
    if (acceso) this._pfSel.add(udcId); else this._pfSel.delete(udcId);
    const b = $('pfCaricaDdt');
    if (b) {
      b.textContent = `Carica in DDT (${this._pfSel.size})`;
      (b as unknown as HTMLButtonElement).disabled = this._pfSel.size === 0;
    }
    const m = $('pfScaricoManuale');
    if (m) {
      m.textContent = `Scarica a mano (${this._pfSel.size})`;
      (m as unknown as HTMLButtonElement).disabled = this._pfSel.size === 0;
    }
  },

  /* SI CARICA E BASTA: il DDT lo scrive la maschera delle spedizioni, che è
     dove la testata vive. Da qui escono le righe, non il documento. */
  async _pfCaricaInDdt() {
    if (!this._pfSel.size) return;
    const scelti = [...this._pfSel];
    this._pfSel = new Set();
    await this._shipCaricaDaBancali(scelti);
  },

  /* ── Lo scarico a mano ───────────────────────────────────────────────── */

  /* 2.21 — LA MERCE È GIÀ PARTITA, E IL DOCUMENTO L'HA SCRITTO IL
     GESTIONALE. Non c'è un DDT da comporre qui: c'è un numero già emesso
     altrove e dei bancali che sono saliti su un camion. Si chiede quel
     numero e basta — destinatario, vettore e causale sono già su un foglio
     che qualcun altro ha stampato, e richiederli qui vorrebbe dire farli
     ricopiare a chi li ha già davanti.

     SI SCRIVE COMUNQUE UN DOCUMENTO, e non uno scarico secco: senza, la
     colonna DDT e la data di spedizione resterebbero vuote proprio sui
     bancali che sono partiti, la packing list non si potrebbe più stampare,
     e il registro direbbe «uscito» senza dire con che cosa. L'evasione è
     quella di sempre — `_evadiSpedizione` — perché come un DDT scarica la
     merce è già scritto, e una seconda copia sarebbe la seconda verità. */
  async _pfScaricoManuale() {
    if (!this._pfSel.size) return;
    if (!this._requireOperator('lo scarico manuale del prodotto finito')) return;
    const scelti = [...this._pfSel];

    const { voci, saltate } = this._shipRigheDaBancali(scelti, []);
    if (!voci.length) {
      return this.toast(saltate.length
        ? `Nessuna riga da scaricare: ${saltate.join(' · ')}`
        : 'Nessuna riga da scaricare', 'error');
    }

    const causale = this._pfCausaleUscita();
    if (!causale) {
      return this.toast('Nessuna causale di uscita configurata: si aggiunge in Configurazione → Documenti', 'error');
    }

    const colli = voci.reduce((n: number, l: { qty?: number }) => n + (l.qty || 0), 0);
    const num = await Dialog.testo({
      title: 'Scarico a mano — numero del DDT',
      message: 'Il numero è quello del documento già emesso dal gestionale. '
        + 'I bancali scelti escono con quel numero, e la merce viene scaricata dalla giacenza.',
      details: Dialog.kv([
        ['Bancali', scelti.length],
        ['Righe', voci.length],
        ['Colli totali', colli],
        ['Causale', causale.label],
        ...(saltate.length ? [['Righe saltate', saltate.join(' · ')]] as [string, string][] : []),
      ]),
      placeholder: 'DDT 2026/1234',
      maiuscolo: true,
      confirmLabel: 'Continua',
      nota: 'Scritto dal gestionale — Pathfinder non lo genera',
    });
    if (!num) return;

    let doc;
    try {
      doc = await Store.savePendingOutbound({
        kind: 'SHIP',
        causale_id: causale.id, causale_label: causale.label, causale_mov: causale.mov || 'SHIP',
        ddt_num: num,
        doc_date: new Date().toISOString().slice(0, 10),
        operator: Store.getCurrentIdentity().initials,
        sender: Store.getDocConfig().sender,
        doc_notes: 'Scarico manuale del prodotto finito',
        lines: voci,
      });
    } catch (e) {
      return this.toast(`Il documento non è stato scritto: ${(e as Error).message || 'errore'}`, 'error');
    }

    this._pfSel = new Set();
    if (saltate.length) {
      this.toast(`${saltate.length} righe non sono entrate nel documento: ${saltate.join(' · ')}`, 'warning');
    }
    /* Il documento nasce pendente e si evade subito: fra i due gesti non c'è
       niente da decidere — la merce è già sul camion — ma passare di lì vuol
       dire che la giacenza cala come cala sempre, con le stesse guardie. */
    await this._evadiSpedizione(doc.doc_id);
    this._formProdottoFinito($('movFormArea'));
  },

  /** La causale con cui esce uno scarico a mano: la prima di uscita che NON
      sposta la merce. Il conto terzi non scarica — sposta — e uno scarico a
      mano che spostasse la merce in un vano sarebbe l'opposto del gesto. */
  _pfCausaleUscita() {
    const causali = Store.getDocConfig().causali as
      { id: string; label: string; mov?: string; trasferimento?: boolean }[];
    return causali.find(c => c.mov !== 'RET' && !c.trasferimento) ?? null;
  },

  _pfElencoHTML() {
    const zona = zonePf(Store.getSites())[0];
    const scelta = (id: string, etichetta: string) =>
      `<button class="level-btn ${this._pfFiltroStato === id ? 'active' : ''}"
         onclick="App._pfStato('${id}')">${etichetta}</button>`;
    return `
      <div class="flex justify-between items-center flex-wrap gap-4 mb-6">
        <strong>Bancali di prodotto finito</strong>
        <div class="flex gap-3 flex-wrap">
          <button class="btn btn-success" id="pfCaricaDdt" onclick="App._pfCaricaInDdt()"
            ${this._pfSel.size ? '' : 'disabled'}>${this._ico('truck')} Carica in DDT (${this._pfSel.size})</button>
          <button class="btn" id="pfScaricoManuale" onclick="App._pfScaricoManuale()"
            ${this._pfSel.size ? '' : 'disabled'}>${this._ico('upload')} Scarica a mano (${this._pfSel.size})</button>
          ${zona ? `<button class="btn" onclick="App._pfVediInMappa()">${this._ico('map')} Vedi in mappa</button>` : ''}
          <button class="btn btn-primary" onclick="App._pfNuovoBancale()">+ Nuovo bancale</button>
        </div>
      </div>
      <div class="text-label-small text-sx-text-muted mb-4">
        Si spuntano i bancali <strong>pronti</strong>. <strong>Carica in DDT</strong> li porta nel
        carrello delle spedizioni, dove si compila la testata; <strong>Scarica a mano</strong> li fa
        uscire subito con un numero di DDT già emesso dal gestionale. Un bancale già impegnato su un
        documento pendente non si spunta: si corregge da quel documento.
      </div>
      <div class="flex gap-2 flex-wrap mb-4">
        ${scelta('attivi', 'Da spedire')}${scelta('pronto', 'Pronti')}
        ${scelta('impegnato', 'Impegnati')}${scelta('spedito', 'Spediti')}${scelta('tutti', 'Tutti')}
      </div>
      <div class="form-group mb-5">
        <input class="input" id="pfCerca" value="${this._esc(this._pfTabella.cerca)}"
               placeholder="Filtra per bancale, articolo, lotto, ubicazione, ordine, DDT…"
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
