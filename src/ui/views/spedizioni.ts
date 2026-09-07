import { type Vista, $, $sel } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import type { DocumentoUscita, Destinatario, RigaDocumento } from '../../types/entita';
import { Validate } from '../../modules/validate';
import { pickupAlertStatus } from '../../modules/pickupAlert';
import {
  normalizzaNome as normalizzaNomeRcp, destinazionePredefinita, descriviDestinazione,
} from '../../modules/destinatari';
import { uscite as uscitePerIlServizio, totaleUom as totaleUomColli, descriviColli } from '../../modules/colli';
import { formattaQuantita, sommaUom as sommaUomColli } from '../../modules/misure';
import { Dialog } from '../dialog';
import { Feedback } from '../feedback';
import { descriviModello as descriviModelloImballo } from '../../modules/imballo';
import { raggruppaPerPartita, distintaPerArticolo } from '../../modules/documenti';
import type { PartitaStampata, DistintaArticolo } from '../../modules/documenti';

/* Una riga del carrello DDT: la merce scelta, quanti colli, e quanti ce
   n'erano quando la riga è nata — serve a dire se nel frattempo è cambiata. */
/* Un blocco della packing list: un bancale e le righe che porta. Nasce a
   stampa e muore col foglio — non e' un record. */
type PackingBlocco = {
  udc_id: string;
  supporto: string;
  modello: string;
  tara: number | null;
  odp: string;
  righe: RigaDocumento[];
  colli: number;
};

type VoceCarrelloDDT = {
  article_code: string;
  article_description: string;
  lot_code: string;
  location_code: string;
  item_key: string;
  expiry_date: string;
  qty: number;
  qty_at_creation: number;
  notes: string;
  /* 1.8.4 — i colli si scelgono QUI, non all'evasione. Il documento nomina
     la merce, e con colli di misura diversa il numero da solo non la dice:
     senza queste tre, la colonna delle UM sul DDT non si puo' stampare. */
  packs_out: { da: number; quantita: number }[] | null;
  qty_uom: number | null;
  uom: string | null;
  /** 2.20 — il bancale da cui esce la riga, quando ne ha uno. */
  udc_id?: string;
};

export const VistaSpedizioni = {
  /* ═══ 2.23 · SPEDIZIONI HA DUE SCHEDE ═══════════════════════════════════
     Fino alla 2.22 il carico del camion era una tessera sua in Movimenta, la
     dodicesima. Ma comporre un DDT e andare a prendere i bancali che ci vanno
     sopra non sono due mestieri: sono due momenti dello stesso, e chi spedisce
     li fa nello stesso turno, sullo stesso documento. Averli in due punti del
     menu voleva dire uscire da una schermata per entrare nell'altra, e
     tornare indietro per evadere.

     Adesso è una tessera sola con due schede — come «Prelievo» ne ha quattro
     e «Inventario» tre. Stesso `prel-tabs`, stesso schema `_xxxSub` +
     `_renderXxxSub`: chi conosce una di quelle conosce anche questa.

     `startMov('load')` continua a valere e apre la scheda del camion: la
     scorciatoia del cruscotto e ogni altro richiamo non si accorgono di
     niente. */
  _formSpedizioni(el) {
    /* IL DDT SI EVADE ANCHE DA FUORI MOVIMENTA — dal riquadro in Dashboard, e
       dalla 1.4.2.1 anche dalla coda delle attività. Là dentro `movFormArea`
       non esiste, e la maschera si ridisegnava su `null`: la merce era già
       uscita e il compito già chiuso, ma l'ultima riga della funzione moriva
       e l'errore usciva in console senza che niente lo raccogliesse. Chi non
       ha un posto dove disegnare non disegna. */
    if (!el) return;
    const carico = Store.getCaricoInCorso();
    el.innerHTML = `<div class="mov-form-card">
      <h3>${this._ico('truck')} <span class="text-sx-orange">Spedizioni</span> — Documenti di trasporto in uscita</h3>
      <div class="prel-tabs">
        <button class="prel-tab ${this._shipSubMode === 'documenti' ? 'active' : ''}"
          onclick="App._shipSub('documenti')"><span class="prel-tab-icon">${this._ico('clipboard-text')}</span>Documenti</button>
        <button class="prel-tab ${this._shipSubMode === 'carico' ? 'active' : ''}"
          onclick="App._shipSub('carico')"><span class="prel-tab-icon">${this._ico('tir')}</span>Carico camion${carico ? ' •' : ''}</button>
      </div>
      <div id="shipSubForm"></div>
      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">${this._ico('x')} Chiudi</button></div>
    </div>`;
    this._renderShipSub();
  },

  _shipSub(mode) {
    this._shipSubMode = mode;
    this._formSpedizioni($('movFormArea'));
  },

  _renderShipSub() {
    const el = $('shipSubForm');
    if (!el) return;
    if (this._shipSubMode === 'carico') this._formCaricoSpedizione(el);
    else this._formDocumenti(el);
  },

  /* La composizione e l'evasione dei DDT: è quel che questa schermata faceva
     prima, dentro la sua scheda. */
  _formDocumenti(el) {
    if (!el) return;
    const pending = Store.getPendingOutbound();
    const cart = this._shipCart;
    const cfg = Store.getDocConfig();
    const gaps = this._docSenderGaps();

    // Proposta del numero: solo a carrello nuovo, e solo se non c'è già
    if (!this._shipDdtNum) this._shipDdtNum = Store.proposeDdtNumber();
    if (!this._shipDocDate) this._shipDocDate = new Date().toISOString().slice(0, 10);
    if (!this._shipCausale) this._shipCausale = cfg.causali[0]?.id || '';
    if (!this._shipPorto) this._shipPorto = cfg.ddt.default_porto;
    if (!this._shipTrasporto) this._shipTrasporto = cfg.ddt.default_trasporto;

    const causaliOpts = cfg.causali.map(c =>
      `<option value="${this._esc(c.id)}" ${this._shipCausale === c.id ? 'selected' : ''}>${this._esc(c.label)}</option>`).join('');

    /* 1.6 — L'ANAGRAFICA VIENE PRIMA DELLA DERIVAZIONE DAI DDT.
       `getKnownRecipients` ricava i destinatari scorrendo i documenti gia'
       fatti, ed e' cio' che c'era prima che l'anagrafica esistesse: resta
       come RIPIEGO per i clienti storici, che nell'anagrafica non ci sono
       finche' non gli si spedisce di nuovo. I due elenchi si uniscono, e i
       nomi doppi non si mostrano due volte. */
    const rubrica = Store.getRecipients();
    const known = Store.getKnownRecipients();
    const nomi = [];
    const visti = new Set();
    for (const r of [...rubrica.map(r => r.name), ...known.map(k => k.destination)]) {
      const n = String(r || '').trim();
      const k = n.toUpperCase();
      if (!n || visti.has(k)) continue;
      visti.add(k); nomi.push(n);
    }
    const datalist = nomi.length
      ? `<datalist id="shipRecipients">${nomi.map(n => `<option value="${this._esc(n)}"></option>`).join('')}</datalist>`
      : '';

    const totaliUom = this._ddtTotaliUom(cart);

    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso 2-stati:</strong>
        <span class="wf-step">① REGISTRA DDT</span> (testata + righe → DDT pendente, merce ancora in giacenza) →
        <span class="wf-step">② attesa ritiro vettore</span> →
        <span class="wf-step">③ EVADI DDT</span> (scarico giacenza, pratica chiusa).
        La <strong>causale</strong> distingue una spedizione da un reso.
      </div>

      ${gaps.length ? `<div class="mov-preview mov-preview-err mb-6">
        ${this._ico('alert-triangle')} <strong>Mittente incompleto</strong> — manca: ${this._esc(gaps.join(', '))}.
        I DDT si stampano lo stesso, ma con l'avviso che il documento non è conforme.
        <button class="btn btn-sm ml-4" onclick="App._configTab='docs';App.switchView('config')">Configura ora</button>
      </div>` : ''}

      <!-- ═════ LISTA DDT PENDENTI ═════ -->
      <div class="mb-8">
        <div class="flex justify-between items-center mb-3">
          <strong class="text-body-small text-sx-orange">${this._ico('clipboard-text')} DDT Pendenti <span class="badge badge-orange">${pending.length}</span></strong>
        </div>
        ${this._renderPendingDdtList(pending)}
      </div>

      <!-- ═════ COMPOSIZIONE NUOVO DDT ═════ -->
      <details class="mt-8" ${cart.length ? 'open' : ''}>
        <summary class="cursor-pointer text-body-medium font-bold text-sx-primary py-4 px-5 bg-sx-orange-soft border border-sx-orange rounded-1">
          ${this._ico('plus')} Componi Nuovo DDT ${cart.length ? `<span class="badge badge-orange">${cart.length} righe in bozza</span>` : ''}
        </summary>
        <div class="border border-sx-border [border-top:none] rounded-b-5 p-6 bg-sx-card-alt">
          ${datalist}

          <!-- ── TESTATA: documento ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">${this._ico('clipboard-text')} Documento</div>
            <div class="form-row mb-4">
              <div class="form-group">
                <label>Causale del trasporto <span class="req">*</span></label>
                <select class="select" id="pShipCausale" onchange="App._persistShipHeader();App._shipAggiornaDestLoc()">${causaliOpts}</select>
              </div>
              <div class="form-group">
                <label>N° DDT <span class="req">*</span></label>
                <input class="input input-mono" id="pShipDdt" placeholder="N° del documento" maxlength="40" value="${this._esc(this._shipDdtNum)}"
                  onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="form-row mb-0">
              <div class="form-group">
                <label>Data del documento <span class="req">*</span></label>
                <input class="input" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10" id="pShipDocDate"
                  value="${this._esc(this._dateISOtoIT(this._shipDocDate))}"
                  oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this);App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Riferimento ordine (opz.)</label>
                <input class="input" id="pShipOrderRef" maxlength="60" placeholder="Ordine cliente, commessa, DDT di origine"
                  value="${this._esc(this._shipOrderRef)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <!-- 2.20 — CONTO TERZI: la riga nasce nascosta e la accende la
                 causale. Un'ubicazione di arrivo chiesta su una vendita è una
                 domanda in più a ogni DDT. -->
            <div class="form-row mb-0 mt-4" id="pShipDestLocBox" ${this._shipETrasferimento() ? '' : 'hidden'}>
              <div class="form-group">
                <label>Ubicazione di arrivo <span class="req">*</span></label>
                <input class="input input-mono uppercase" id="pShipDestLoc" maxlength="40"
                  placeholder="M06-COM-01" value="${this._esc(this._shipDestLocation || '')}"
                  oninput="App._normScan('pShipDestLoc')" onchange="App._persistShipHeader()">
                <div class="text-label-small text-sx-text-muted mt-1.5">
                  ${this._ico('building-factory')} Conto terzi: all'evasione la merce <strong>non esce</strong> — si sposta in
                  questo vano, che sta già sulla mappa. Resta in giacenza, e il DDT accompagna il viaggio.
                </div>
              </div>
            </div>
          </div>

          <!-- ── TESTATA: destinatario ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">${this._ico('building-community')} Destinatario</div>
            <div class="form-row mb-4">
              <div class="form-group">
                <label>Denominazione <span class="req">*</span></label>
                <input class="input" id="pShipCustomer" list="shipRecipients" placeholder="Ragione sociale del destinatario" maxlength="120"
                  value="${this._esc(this._shipCustomer)}" onchange="App._shipRecipientPicked()">
                <div class="text-label-small text-sx-text-muted mt-1.5">${this._ico('bulb')} Un destinatario già usato porta con sé indirizzo e P. IVA.</div>
              </div>
              <div class="form-group">
                <label>Partita IVA / C.F.</label>
                <input class="input input-mono" id="pShipDestVat" maxlength="20" placeholder="Del destinatario"
                  value="${this._esc(this._shipDestVat)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="form-row mb-4">
              <div class="form-group">
                <label>Indirizzo</label>
                <input class="input" id="pShipDestAddress" maxlength="120" placeholder="Via, numero civico"
                  value="${this._esc(this._shipDestAddress)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>CAP</label>
                <input class="input input-mono max-w-[120px]" id="pShipDestZip" maxlength="10"
                  value="${this._esc(this._shipDestZip)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="form-row mb-4">
              <div class="form-group">
                <label>Comune</label>
                <input class="input" id="pShipDestCity" maxlength="60"
                  value="${this._esc(this._shipDestCity)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Prov.</label>
                <input class="input input-mono max-w-[110px]" id="pShipDestProvince" maxlength="4" placeholder="Sigla"
                  value="${this._esc(this._shipDestProvince)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="form-group mb-0">
              <label>Luogo di destinazione della merce</label>
              <input class="input" id="pShipShipTo" maxlength="160" placeholder="Solo se DIVERSO dalla sede del destinatario"
                value="${this._esc(this._shipShipTo)}" onchange="App._persistShipHeader()">
              <div class="text-label-small text-sx-text-muted mt-1.5">Vuoto: si consegna alla sede del destinatario.</div>
            </div>
          </div>

          <!-- ── TESTATA: trasporto ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">${this._ico('tir')} Trasporto</div>
            <div class="form-row mb-4">
              <div class="form-group">
                <label>Vettore</label>
                <input class="input" id="pShipCarrier" placeholder="Es: BRT, GLS, vettore proprio" maxlength="80"
                  value="${this._esc(this._shipCarrier)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Trasporto a cura di</label>
                <select class="select" id="pShipTrasporto" onchange="App._persistShipHeader()">
                  ${['Mittente','Destinatario','Vettore'].map(v =>
                    `<option value="${v}" ${this._shipTrasporto === v ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row mb-4">
              <div class="form-group">
                <label>Porto</label>
                <select class="select" id="pShipPorto" onchange="App._persistShipHeader()">
                  ${['Franco','Assegnato'].map(v =>
                    `<option value="${v}" ${this._shipPorto === v ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>${this._ico('calendar-event')} Data ritiro prevista <span class="text-label-small text-sx-text-muted font-normal">(per gli alert)</span></label>
                <input class="input" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10" id="pShipExpected"
                  value="${this._esc(this._dateISOtoIT(this._shipExpectedDate))}"
                  oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this);App._persistShipHeader()">
              </div>
            </div>
            <div class="form-row mb-0">
              <div class="form-group">
                <label>Data e ora inizio trasporto</label>
                <input class="input" id="pShipStartTransport" maxlength="30" placeholder="Es: 08/08/2026 14:30 — o «alla consegna»"
                  value="${this._esc(this._shipStartTransport)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Aspetto esteriore dei beni</label>
                <input class="input" id="pShipAspetto" maxlength="80" placeholder="Es: 3 bancali EPAL, 42 cartoni"
                  value="${this._esc(this._shipAspetto)}" onchange="App._persistShipHeader()">
              </div>
            </div>
          </div>

          <!-- ── TESTATA: pesi ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">${this._ico('scale')} Pesi <span class="font-normal normal-case tracking-[0]">— si scrivono a mano</span></div>
            <div class="form-row mb-0">
              <div class="form-group">
                <label>Peso netto (kg)</label>
                <input class="input input-mono" id="pShipPesoNetto" inputmode="decimal" maxlength="12"
                  placeholder="kg"
                  value="${this._esc(this._shipPesoNetto)}" oninput="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Peso lordo (kg)</label>
                <!-- I due pesi si tengono a ogni tasto, non al change: sono
                     l'ultimo campo che si tocca prima di registrare, e un
                     change che non scatta perche' il fuoco non e' mai uscito
                     dal campo li perde in silenzio. -->
                <input class="input input-mono" id="pShipPesoLordo" inputmode="decimal" maxlength="12"
                  placeholder="netto + tara imballi"
                  value="${this._esc(this._shipPesoLordo)}" oninput="App._persistShipHeader()">
              </div>
            </div>
            <div class="text-label-small text-sx-text-muted mt-3">
              I pesi non si calcolano: un documento puo' portare una riga in KG e una in PZ,
              e nessun conto sull'anagrafica sa quanto pesa insieme. Li scrive chi ha caricato.
              ${totaliUom ? `Sul carrello: <strong>${this._esc(totaliUom)}</strong>.` : ''}
            </div>
          </div>

          <!-- ── INSERIMENTO RIGA ── -->
          <div class="form-group mb-4">
            <label>① Scansiona Articolo <span class="req">*</span></label>
            <input class="input input-mono uppercase" id="pShipArt" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
              onkeydown="if(event.key==='Enter'){event.preventDefault();$('pShipLot')?.focus();}">
          </div>
          <div class="form-group mb-4">
            <label>② Scansiona Lotto <span class="req">*</span></label>
            <input class="input input-mono" id="pShipLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
              onkeydown="if(event.key==='Enter'){event.preventDefault();App._shipLookup();}">
            <div id="pShipInfo"></div>
          </div>
          <div id="pShipDetails" class="hidden">
            <div id="pShipItemPreview"></div>
            <div class="flex gap-4 mb-4 items-end" id="pShipQtyRow">
              <div class="form-group w-[130px]"><label>Colli <span class="req">*</span></label><input class="input input-mono text-center font-bold" id="pShipQty" type="number" min="1" step="1" value="1"
                onkeydown="if(event.key==='Enter'){event.preventDefault();App._shipAddToCart();}"></div>
              <div class="text-label-small text-sx-text-muted pb-4">Disponibili (esclusi pendenti): <strong class="text-sx-orange" id="pShipAvail">—</strong> Coll.</div>
            </div>
            <div class="hidden mb-4" id="pShipColliRow"></div>
            <div class="form-group mb-5">
              <label>Note riga (opz.)</label>
              <input class="input" id="pShipNotes" maxlength="${Validate.MAX.NOTES}" placeholder="Es: riferimento riga d'ordine">
            </div>
            <button class="btn btn-conferma bg-sx-orange text-white border-sx-orange" id="pShipAddBtn" onclick="App._shipAddToCart()">+ AGGIUNGI AL CARRELLO</button>
          </div>

          <!-- ── CARRELLO ── -->
          <section id="shipCartZone">${this._shipCartZoneHTML()}</section>

          <div class="form-group mt-6 mb-0">
            <label>Annotazioni sul documento (opz.)</label>
            <input class="input" id="pShipDocNotes" maxlength="200" placeholder="Testo libero riportato in fondo al DDT"
              value="${this._esc(this._shipDocNotes)}" onchange="App._persistShipHeader()">
          </div>
          <div class="mt-4" id="pShipFeedback"></div>
        </div>
      </details>`;
    if (!cart.length && !pending.length) $('pShipCustomer')?.focus();
  },

  /* 1.6 — UN DESTINATARIO GIA' IN ANAGRAFICA COMPILA IL DDT DA SE'.
     Si cerca prima in rubrica e poi, per i clienti storici, nei DDT gia'
     fatti. `fill` non sovrascrive: cio' che l'operatore ha gia' digitato e'
     una scelta, e l'anagrafica non la corregge alle sue spalle. */
  _shipRecipientPicked() {
    const name = Validate.clean($('pShipCustomer')?.value);
    this._shipCustomer = name;
    if (!name) { this._persistShipHeader(); return; }
    const fill = (id: string, val: string | number | null | undefined) => {
      const e = $(id);
      if (e && !e.value.trim() && val) e.value = String(val);
    };

    const rcp = Store.getRecipients()
      .find(r => normalizzaNomeRcp(r.name) === normalizzaNomeRcp(name));
    if (rcp) {
      fill('pShipDestVat', rcp.vat || rcp.fiscal_code);
      const d = destinazionePredefinita(rcp);
      if (d) {
        fill('pShipDestAddress', d.address);
        fill('pShipDestZip', d.zip);
        fill('pShipDestCity', d.city);
        fill('pShipDestProvince', d.province);
      }
      this._persistShipHeader();
      /* PIU' DESTINAZIONI: si sceglie, non si indovina. La prima e' solo la
         proposta — un cliente con un deposito riceve dove ha detto lui. */
      const altre = (rcp.destinations || []).length;
      this.toast(altre > 1
        ? `${name}: ${altre} destinazioni in anagrafica — si cambia dal selettore`
        : `Anagrafica di ${name} ripresa`, 'info');
      if (altre > 1) this._shipMostraDestinazioni(rcp);
      return;
    }

    const known = Store.getKnownRecipients()
      .find(r => r.destination.trim().toUpperCase() === name.trim().toUpperCase());
    if (!known) { this._persistShipHeader(); return; }
    fill('pShipDestAddress', known.dest_address);
    fill('pShipDestZip', known.dest_zip);
    fill('pShipDestCity', known.dest_city);
    fill('pShipDestProvince', known.dest_province);
    fill('pShipDestVat', known.dest_vat);
    fill('pShipShipTo', known.ship_to);
    fill('pShipCarrier', known.carrier);
    this._persistShipHeader();
    this.toast(`Anagrafica di ${name} ripresa dall'ultimo DDT`, 'info');
  },

  /* Il selettore delle destinazioni. Overlay con id PROPRIO e chiusura
     propria — trappola 31: `showModal` riusa `modalOverlay`, e aperto da
     dentro un'altra finestra chiuderebbe quella sotto. */
  _shipMostraDestinazioni(rcp: Destinatario) {
    $('destPickOverlay')?.remove();
    const righe = (rcp.destinations || []).map((d, i) => `
      <button class="btn w-full text-left mb-3"
        onclick="App._shipScegliDestinazione('${this._esc(rcp.rcp_id)}',${i})">
        <strong>${this._esc(d.label || `Destinazione ${i + 1}`)}</strong>${d.predefinita ? ' <span class="badge badge-teal">predefinita</span>' : ''}<br>
        <span class="text-label-small text-sx-text-muted">${this._esc(descriviDestinazione(d))}</span>
      </button>`).join('');
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'destPickOverlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="modal">
      <div class="modal-header"><h3>Dove consegna ${this._esc(rcp.name)}?</h3>
        <button class="modal-close" onclick="$('destPickOverlay')?.remove()">&times;</button></div>
      <div class="modal-body">${righe}</div></div>`;
    document.body.appendChild(ov);
  },

  _shipScegliDestinazione(rcpId, i) {
    const d = Store.getRecipient(rcpId)?.destinations?.[i];
    $('destPickOverlay')?.remove();
    if (!d) return;
    const set = (id: string, val: string | null | undefined) => { const e = $(id); if (e) e.value = val || ''; };
    set('pShipDestAddress', d.address);
    set('pShipDestZip', d.zip);
    set('pShipDestCity', d.city);
    set('pShipDestProvince', d.province);
    this._persistShipHeader();
    this.toast(`Destinazione: ${descriviDestinazione(d)}`, 'success');
  },

  /* I TOTALI IN UM, UNO PER UNITA'.

     Un DDT puo' portare una riga in KG e una in PZ, e sommarle darebbe un
     numero che non significa niente. Si contano separatamente e si scrivono
     accanto: «57 KG · 120 PZ». E' anche la ragione per cui i pesi netto e
     lordo si digitano a mano — fino alla 1.8.3 il netto lo proponeva
     l'anagrafica, moltiplicando un peso per collo per il numero di colli, e
     su colli di misura diversa quel prodotto e' falso. */
  _ddtTotaliUom(lines) {
    const per = new Map<string, number>();
    for (const l of lines) {
      if (l.qty_uom == null || !l.uom) continue;
      per.set(l.uom, sommaUomColli(per.get(l.uom) ?? 0, l.qty_uom, l.uom));
    }
    return [...per.entries()].map(([u, q]) => `${formattaQuantita(q, u)} ${u}`).join(' · ');
  },

  /* Lista dei DDT pendenti, tutti, ordinati per urgenza di ritiro.
     v2.0.0+ — sort by alert priority (overdue/today/tomorrow/soon/ok/none) */
  _renderPendingDdtList(pending) {
    if (!pending.length) {
      return `<div class="py-5 px-7 bg-sx-card-alt [border:1px_dashed_var(--sx-border)] rounded-1 text-body-small text-sx-text-muted text-center">Nessun DDT pendente — componine uno nuovo qui sotto</div>`;
    }
    const sorted = (pending as DocumentoUscita[]).slice().sort((a, b) => {
      const sa = pickupAlertStatus(a).sortKey;
      const sb = pickupAlertStatus(b).sortKey;
      if (sa !== sb) return sa - sb;
      return b.created_at - a.created_at;  // a parità → più recente in alto
    });
    return sorted.map((d) => this._renderPendingDocCard(d)).join('');
  },

  _renderPendingDocCard(doc: DocumentoUscita) {
    const isRet = this._docIsReturn(doc);
    const themeColor = isRet ? 'var(--sx-teal)' : 'var(--sx-orange)';
    const themeBg = isRet ? 'var(--grad-soft-teal)' : 'var(--grad-soft-orange)';
    const themeBadge = isRet ? 'badge-teal' : 'badge-orange';
    const causale = this._docCausaleLabel(doc);
    const totalColli = doc.lines.reduce((s, l) => s + (l.qty || 1), 0);
    const created = new Date(doc.created_at).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const ageMs = Date.now() - doc.created_at;
    const ageH = Math.floor(ageMs / (1000 * 60 * 60));
    const ageStr = ageH < 1 ? 'pochi minuti' : (ageH < 24 ? `${ageH}h` : `${Math.floor(ageH/24)}g`);
    // v2.0.0+ — Alert data ritiro prevista
    const alert = pickupAlertStatus(doc);
    const isUrgent = alert.level === 'overdue' || alert.level === 'today' || alert.level === 'tomorrow';
    const borderColor = isUrgent ? alert.color : themeColor;
    const borderWidth = isUrgent ? '2px' : '1px';
    const animation = (alert.level === 'overdue' || alert.level === 'today') ? 'animation:pendingPulse 2s ease-in-out infinite' : '';
    const alertBadgeSummary = alert.level === 'none'
      ? `<span class="badge bg-sx-card-alt text-sx-text-muted [border:1px_dashed_var(--sx-border-strong)] text-label-small">${this._ico('calendar-event')} da definire</span>`
      : `<span class="badge" style="background:${alert.bg};color:${alert.color};border-color:${alert.color};font-size: var(--md-sys-typescale-label-small-size);font-weight:700">${this._ico('calendar-event')} ${this._esc(alert.shortLabel)}</span>`;
    /* v2.0.1 [A-3] — Controllo di integrità delegato a Store.checkPendingDocIntegrity. */
    const integrity = Store.checkPendingDocIntegrity(doc);
    const warnings = integrity.issues.length;
    const issueByLine = new Map(integrity.issues.map(x => [x.lineIndex, x]));
    const warnBadge = warnings > 0 ? `<span class="badge bg-sx-danger-soft text-sx-danger border-sx-danger ml-3" title="${warnings} riga/e non allineata/e alla giacenza attuale">${this._ico('alert-triangle')} ${warnings}</span>` : '';
    const linesHtml = doc.lines.map((l, i) => {
      const issue = issueByLine.get(i);
      const rowStyle = issue ? 'background:var(--sx-danger-soft);' : '';
      const issueHtml = issue
        ? `<div class="text-label-small text-sx-danger pt-1.5 pr-0 pb-2.5 pl-10">${this._ico('alert-triangle')} ${this._esc(issue.message)}</div>`
        : '';
      return `<div style="${rowStyle}font-size: var(--md-sys-typescale-label-small-size);padding:0.2rem 0;border-bottom:1px dashed var(--sx-border)">
      <div class="flex justify-between gap-4">
        <span><span class="text-sx-text-muted">${i+1}.</span> <strong>${this._esc(l.article_code)}</strong> · L:${this._esc(l.lot_code)} · ${this._ico('map-pin')}${this._esc(l.location_code!)}${l.notes ? ' · <em>' + this._esc(l.notes) + '</em>' : ''}</span>
        <strong style="color:${themeColor}">${l.qty} Coll.</strong>
      </div>${issueHtml}
    </div>`;
    }).join('');
    return `<details data-doc-id="${this._esc(doc.doc_id)}" style="background:${themeBg};border:${borderWidth} solid ${borderColor};border-radius:var(--radius-md);padding:0;margin-bottom:0.4rem;${animation}">
      <summary class="cursor-pointer py-5 px-7 text-body-small font-semibold flex justify-between items-center gap-5 flex-wrap">
        <span class="flex items-center gap-4 flex-wrap">
          <strong style="color:${themeColor}">DDT ${this._esc(doc.ddt_num)}</strong> · ${this._esc(doc.destination)}${doc.carrier ? ' <span class="text-sx-text-muted">· ' + this._esc(doc.carrier) + '</span>' : ''}
          <span class="badge ${themeBadge} text-label-small">${this._esc(causale)}</span>
          ${alertBadgeSummary}
          ${warnBadge}
        </span>
        <span class="badge ${themeBadge}">${doc.lines.length} righe · ${totalColli} Coll.</span>
      </summary>
      <div style="padding:0.5rem 0.7rem;background:#fff;border-top:1px solid ${borderColor};border-radius:0 0 var(--radius-md) var(--radius-md)">
        <div class="text-label-small text-sx-text-muted mb-4">
          Registrato il ${created} <span class="text-sx-text-secondary">(${ageStr} fa)</span>
          ${doc.operator ? ' · <strong>' + this._esc(doc.operator) + '</strong>' : ''} · Destinatario: <strong>${this._esc(doc.destination)}</strong>
          ${doc.ship_to ? ' · Destinazione: <strong>' + this._esc(doc.ship_to) + '</strong>' : ''}
        </div>
        ${alert.level !== 'none' ? `<div style="background:${alert.bg};color:${alert.color};font-weight:700;font-size: var(--md-sys-typescale-body-small-size);padding:0.35rem 0.55rem;border-radius:var(--radius);margin-bottom:0.4rem;border:1px solid ${alert.color}">${alert.level === 'overdue' || alert.level === 'today' ? this._ico('alert-triangle') + ' ' : ''}${this._esc(alert.label)}</div>` : `<div class="bg-sx-card-alt text-sx-text-muted text-label-small py-3 px-5 rounded-1 mb-4 [border:1px_dashed_var(--sx-border-strong)]">${this._ico('calendar-event')} Ritiro non datato — nessun alert su questo DDT</div>`}
        <div class="mb-5">${linesHtml}</div>
        ${warnings > 0 ? `<div class="bg-sx-danger-soft text-sx-danger text-label-small py-4 px-5.5 rounded-1 mb-4 border border-sx-danger">
          <strong>${this._ico('alert-triangle')} ${warnings} riga/e NON ALLINEATA/E alla giacenza attuale.</strong><br>
          Il documento non è evadibile così com'è: usare <strong>${this._ico('edit')} Modifica</strong> per riallinearlo, oppure <strong>${this._ico('x')}</strong> per annullarlo e rifarlo.
        </div>` : ''}
        <div class="flex gap-4 flex-wrap">
          <button class="btn" style="flex:1;min-width:120px;padding:0.5rem;font-weight:700;background:${themeColor};color:#fff;border-color:${themeColor}" onclick="App._evadiSpedizione('${this._esc(doc.doc_id)}')">${this._ico('check')} EVADI DDT</button>
          <button class="btn bg-sx-accent-soft text-sx-accent border-sx-accent font-semibold" onclick="App._editPendingDoc('${this._esc(doc.doc_id)}')" title="Modifica DDT">${this._ico('edit')} Modifica</button>
          <button class="btn" onclick="App._printDDT('${this._esc(doc.doc_id)}')" title="Stampa il DDT">${this._ico('printer')}</button>
          <button class="btn" onclick="App._printPackingList('${this._esc(doc.doc_id)}')" title="Stampa la packing list — la distinta per articolo, lotto e bancale">${this._ico('package')}</button>
          <button class="btn btn-ghost text-sx-danger" onclick="App._cancelPendingShip('${this._esc(doc.doc_id)}')" title="Annulla DDT">${this._ico('x')}</button>
        </div>
      </div>
    </details>`;
  },

  _shipLookup() {
    const art = Validate.clean($('pShipArt')?.value, true);
    const lot = Validate.clean($('pShipLot')?.value);
    const info = $('pShipInfo');
    const details = $('pShipDetails');
    if (!art) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">${this._ico('circle-x')} Scansiona prima il codice articolo</div>`; $('pShipArt')?.focus(); return; }
    if (!lot) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">${this._ico('circle-x')} Scansiona il codice lotto</div>`; $('pShipLot')?.focus(); return; }
    const artErr = Validate.article(art);
    if (artErr) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">${this._ico('circle-x')} ${this._esc(artErr)}</div>`; details.classList.add('hidden'); return; }
    const lotErr = Validate.lot(lot);
    if (lotErr) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">${this._ico('circle-x')} ${this._esc(lotErr)}</div>`; details.classList.add('hidden'); return; }
    const allItems = Store.findItemLocations(art);
    const matched = allItems.filter(it => it.lot_code === lot);
    if (!matched.length) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">${this._ico('circle-x')} Item ${this._esc(art)}#${this._esc(lot)} non trovato in magazzino</div>`; details.classList.add('hidden'); return; }
    const notQuar = matched.filter(it => !Store.isItemQuarantined(it.item_key, it.location_code));
    if (!notQuar.length) { info.innerHTML = `<div class="text-body-small text-sx-purple mt-2">${this._ico('alert-triangle')} L'item ${this._esc(art)}#${this._esc(lot)} è in quarantena in tutte le ubicazioni in cui si trova</div>`; details.classList.add('hidden'); return; }
    const inCartByKey: Record<string, number> = {};
    for (const c of this._shipCart) {
      const k = `${c.location_code}#${c.item_key}`;
      inCartByKey[k] = (inCartByKey[k] || 0) + c.qty;
    }
    const enriched = notQuar.map(it => {
      const totalQty = it.qty || 1;
      const pendingQty = Store.getPendingQtyForItem(it.location_code, it.item_key);
      const cartQty = inCartByKey[`${it.location_code}#${it.item_key}`] || 0;
      const availableQty = Math.max(0, totalQty - pendingQty - cartQty);
      return { ...it, _totalQty: totalQty, _pendingQty: pendingQty, _availableQty: availableQty };
    });
    const usable = enriched.filter(it => it._availableQty > 0);
    if (!usable.length) { info.innerHTML = `<div class="text-body-small text-sx-warning mt-2">${this._ico('alert-triangle')} Tutta la giacenza di ${this._esc(art)}#${this._esc(lot)} è impegnata</div>`; details.classList.add('hidden'); return; }
    if (usable.length === 1) { this._shipSelectItem(usable[0]); return; }
    let html = '<div class="max-h-[200px] overflow-y-auto mt-3"><div class="text-label-small text-sx-text-muted mb-3">Item presente in più ubicazioni — seleziona da quale prelevare:</div>';
    for (const it of usable) {
      const p = App._payload(it);
      const pendBadge = it._pendingQty > 0 ? ` <span class="badge badge-amber">${it._pendingQty} prenotati</span>` : '';
      html += `<div class="inv-item-row cursor-pointer" onclick="App._shipSelectEnc('${p}')">
        <div class="inv-info">
          <div class="inv-code text-sx-orange">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal text-body-small">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">L:${this._esc(it.lot_code)} · ${this._ico('map-pin')} ${this._esc(it.location_code)} · <strong>${it._availableQty}/${it._totalQty} Coll.</strong>${pendBadge}${it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : ''}</div>
        </div>
        <span class="text-sx-orange text-body-small">${this._ico('truck')} Seleziona</span>
      </div>`;
    }
    info.innerHTML = html + '</div>';
    details.classList.add('hidden');
  },

  _shipSelectEnc(p) { this._shipSelectItem(JSON.parse(decodeURIComponent(p))); },

  _shipSelectItem(item) {
    const full = Store.getItemsAtLocation(item.location_code).find(i => i.item_key === item.item_key);
    if (!full) return this.toast('Item non più disponibile in giacenza', 'error');
    const totalQty = full.qty || 1;
    const pendingQty = Store.getPendingQtyForItem(item.location_code, item.item_key);
    const cartQty = this._shipCart
      .filter((c: VoceCarrelloDDT) => c.location_code === item.location_code && c.item_key === item.item_key)
      .reduce((s: number, c: VoceCarrelloDDT) => s + c.qty, 0);
    const availableQty = Math.max(0, totalQty - pendingQty - cartQty);
    if (availableQty <= 0) {
      $('pShipInfo').innerHTML = `<div class="text-body-small text-sx-warning mt-2">${this._ico('alert-triangle')} Giacenza tutta impegnata</div>`;
      return;
    }
    this._shipState = { item: full, availableQty, totalQty, pendingQty };
    const expBadge = full.expiry_date ? ` · scad. ${this._esc(full.expiry_date)}` : '';
    const pendBadge = pendingQty > 0 ? ` · <span class="text-sx-warning">${pendingQty} prenotati</span>` : '';
    $('pShipInfo').innerHTML = '';
    $('pShipItemPreview').innerHTML = `<div class="mov-preview bg-sx-orange-soft border-sx-orange mb-4">
      <strong class="text-sx-orange">${this._esc(full.article_code)}</strong>
      <span class="text-sx-text-muted">${this._esc(full.article_description || '')}</span><br>
      <span class="text-body-small text-sx-text-muted">Lotto: <strong>${this._esc(full.lot_code)}</strong> · Ubic: <strong class="mono">${this._esc(full.location_code)}</strong> · Disp. effettiva: <strong class="text-sx-orange">${availableQty} Coll.</strong> (tot. ${totalQty}${pendBadge})${expBadge}</span>
    </div>`;
    const qe = $('pShipQty');
    if (qe) { qe.value = String(availableQty); qe.max = String(availableQty); }
    const av = $('pShipAvail'); if (av) av.textContent = String(availableQty);
    const notesEl = $('pShipNotes'); if (notesEl) notesEl.value = '';
    $('pShipDetails').classList.remove('hidden');

    /* UN CAMPO CHE DIVENTA MUTO E' PEGGIO DI UN CAMPO CHE NON C'E'.
       Su una riga a colli dichiarati il numero digitato qui non deciderebbe
       niente — a decidere e' la scelta dei colli — e chi scansiona arriva
       lì col dito. Sparisce, e al suo posto si legge cosa c'e' ancora
       libero. Il campo si svuota: nascosto e' comunque scritto. */
    let liberi = null;
    try { liberi = this._shipColliLiberi(full); } catch { liberi = null; }
    const qtyRow = $('pShipQtyRow'), colliRow = $('pShipColliRow');
    const cfg = liberi ? Store.getUomConfig(full.article_code, full.lot_code) : null;
    if (liberi && cfg) {
      qtyRow?.classList.add('hidden');
      if (qe) qe.value = '';
      if (colliRow) {
        colliRow.classList.remove('hidden');
        colliRow.innerHTML = `<div class="text-label-small text-sx-text-muted">Colli liberi su questa riga: <strong class="text-sx-orange">${this._esc(descriviColli(liberi, cfg.uom))}</strong> — quali escono si sceglie aggiungendo al carrello.</div>`;
      }
      /* Il gesto centrale resta «scansiona, Invio, avanti»: senza il campo
         dei colli il passo dopo e' il pulsante, e ci si arriva da tastiera. */
      $('pShipAddBtn')?.focus();
      return;
    }
    qtyRow?.classList.remove('hidden');
    colliRow?.classList.add('hidden');
    qe?.focus();
    qe?.select();
  },

  /* I colli ancora liberi per questa riga: quelli che i DDT pendenti non
     hanno impegnato, meno quelli che il carrello in corso ha gia' preso.
     `null` sulla riga senza elenco — e allora si conta a colli, come nella
     1.7. Lancia se un pendente nomina un collo che non c'e' piu': lo dice
     chi chiama, invece di aggiungere una riga su una prenotazione rotta. */
  _shipColliLiberi(item) {
    const gia = (this._shipCart as VoceCarrelloDDT[])
      .filter(r => r.location_code === item.location_code && r.item_key === item.item_key && r.packs_out)
      .flatMap(r => r.packs_out!);
    return Store.colliLiberi(item, gia);
  },

  /* ═══ 2.20 · IL CARRELLO SI RIEMPIE DAI BANCALI ══════════════════════
     Chi spedisce sceglie i bancali dall'elenco del prodotto finito e li
     carica qui: un bancale intero per gesto, con tutti i colli che i DDT
     pendenti non hanno gia' impegnato.

     STA IN QUESTO FILE PERCHE' IL CARRELLO E' DI QUESTO FILE. La scelta dei
     colli, il conto delle UM e la forma della voce sono gia' scritti in
     `_shipAddToCart`, e una seconda copia in un'altra vista sarebbe la
     seconda verita' su come nasce una riga di DDT.

     UNA RIGA CHE NON SI PUO' PRENDERE NON FERMA LE ALTRE: si salta, e il
     riscontro dice quali e perche'. Chi ha otto bancali sul muletto non
     ricomincia da capo per il settimo. */
  async _shipCaricaDaBancali(udcIds) {
    if (!this._requireOperator('la spedizione')) return;
    const ids = Array.isArray(udcIds) ? udcIds : [udcIds];
    const { voci, saltate } = this._shipRigheDaBancali(ids, this._shipCart as VoceCarrelloDDT[]);
    for (const r of voci) {
      if (!this._shipCart.length && !this._shipStartTime) this._shipStartTime = Date.now();
      this._shipCart.push(r);
    }
    const aggiunte = voci.length;
    if (!aggiunte && !saltate.length) return this.toast('Nessun bancale scelto', 'warning');
    /* La maschera si apre comunque, anche con zero righe aggiunte: chi ha
       premuto vuole vedere il carrello, non un messaggio da solo. */
    this.startMov('shipping');
    if (aggiunte) {
      this.toast(`+ ${aggiunte} ${aggiunte === 1 ? 'riga' : 'righe'} da ${ids.length} ${ids.length === 1 ? 'bancale' : 'bancali'}`, 'success');
    }
    if (saltate.length) {
      this.toast(`${saltate.length} non ${saltate.length === 1 ? 'e\' entrata' : 'sono entrate'}: ${saltate.join(' · ')}`, 'warning');
    }
  },

  /* LE RIGHE CHE NASCONO DA UN BANCALE, IN UN POSTO SOLO. Le chiedono in
     due — il carrello del DDT, che le impila, e lo scarico a mano del
     prodotto finito, che ci fa un documento gia' evaso — e una seconda
     copia sarebbe la seconda verita' su come una riga di DDT nasce da un
     pallet: quali colli sono liberi, che unita' portano, cosa si salta.

     `esistenti` sono le righe gia' in carrello: la stessa merce due volte
     sullo stesso documento e' una prenotazione doppia sulla stessa
     giacenza. Vuoto, non c'e' niente da confrontare. */
  _shipRigheDaBancali(udcIds, esistenti = []) {
    const ids = Array.isArray(udcIds) ? udcIds : [udcIds];
    const saltate: string[] = [];
    const voci: VoceCarrelloDDT[] = [];
    const gia = new Set((esistenti as VoceCarrelloDDT[]).map(
      (r) => `${r.item_key}@${r.location_code}`));

    for (const id of ids) {
      const u = Store.getUdc(id);
      if (!u) { saltate.push(`${id}: non esiste`); continue; }
      if (u.status === 'shipped') { saltate.push(`${id}: gia' spedito`); continue; }
      const righe = Store.righeDiUdc(id);
      if (!righe.length) { saltate.push(`${id}: e' vuoto`); continue; }

      for (const item of righe) {
        const chiave = `${item.article_code}#${item.lot_code}`;
        if (Store.isItemQuarantined(item.item_key, item.location_code)) {
          saltate.push(`${chiave}: in quarantena`); continue;
        }
        if (gia.has(`${item.item_key}@${item.location_code}`)) {
          saltate.push(`${chiave}: gia' in carrello`); continue;
        }

        let liberi = null;
        try { liberi = this._shipColliLiberi(item); }
        catch (err) { saltate.push(`${chiave}: ${(err as Error).message}`); continue; }

        let packsOut = null, qty, qtyUom = null, uom = null;
        const totale = item.qty || 0;
        const impegnati = Store.getPendingQtyForItem(item.location_code, item.item_key);
        const disponibili = Math.max(0, totale - impegnati);
        if (liberi) {
          if (!liberi.length) { saltate.push(`${chiave}: tutti i colli sono su un altro DDT`); continue; }
          const cfg = Store.getUomConfig(item.article_code, item.lot_code);
          /* `colliLiberi` restituisce un elenco solo dove la confezione c'e':
             se il ramo e' questo, `cfg` c'e' — ma dirlo al compilatore con
             un `!` nasconderebbe il perche'. */
          if (!cfg) { saltate.push(`${chiave}: la confezione del lotto non si legge`); continue; }
          /* Il bancale si carica INTERO: le scelte sono tutti i colli
             liberi, presi per intero. Chi ne vuole una parte apre la
             maschera del DDT e la scrive li'. */
          const scelte = liberi.map((_: number, i: number) => ({ indice: i }));
          packsOut = uscitePerIlServizio(liberi, scelte, cfg.uom);
          qty = packsOut.length;
          qtyUom = totaleUomColli(packsOut.map((x) => x.quantita), cfg.uom);
          uom = cfg.uom;
        } else {
          if (!disponibili) { saltate.push(`${chiave}: tutto impegnato su un altro DDT`); continue; }
          qty = disponibili;
        }

        gia.add(`${item.item_key}@${item.location_code}`);
        voci.push({
          article_code: item.article_code,
          article_description: item.article_description || '',
          lot_code: item.lot_code,
          location_code: item.location_code,
          item_key: item.item_key,
          expiry_date: item.expiry_date || '',
          qty,
          qty_at_creation: disponibili,
          notes: '',
          packs_out: packsOut,
          qty_uom: qtyUom,
          uom,
          udc_id: u.udc_id,
        });
      }
    }
    return { voci, saltate };
  },

  /* IL CARRELLO CHIEDE I COLLI, E NON L'EVASIONE.

     Fino alla 1.8.3 la riga portava un numero e i colli si sceglievano al
     ritiro del vettore. Ma il documento si stampa PRIMA, e con colli di
     misura diversa «3 colli» non dice quanta merce sia: per scrivere le UM
     sulla riga bisogna sapere da quali colli esce. Da qui in poi la scelta
     sta dove nasce la riga, e l'evasione esegue cio' che c'e' scritto. */
  async _shipAddToCart() {
    if (!this._shipState?.item) return this.toast('Identifica prima un item in giacenza', 'error');
    const item = this._shipState.item;
    const availableQty = this._shipState.availableQty;
    const notes = Validate.clean($('pShipNotes')?.value);
    if (Validate.notes(notes)) return this.toast(Validate.notes(notes), 'error');

    let liberi = null;
    try { liberi = this._shipColliLiberi(item); }
    catch (err) { return this.toast((err as Error).message, 'error'); }

    let packsOut = null, qty, qtyUom = null, uom = null;
    if (liberi) {
      if (!liberi.length) return this.toast('Tutti i colli di questa riga sono già impegnati da un DDT pendente', 'error');
      const cfg = Store.getUomConfig(item.article_code, item.lot_code)!;
      const scelte = await this._chiediColli(item, `Quali colli · ${item.article_code}#${item.lot_code}`, liberi,
        { colli: parseInt($('pShipQty')?.value, 10) || null });
      if (scelte === undefined) return;
      if (!scelte) return this.toast('I colli di questa riga non si sono potuti leggere', 'error');
      packsOut = uscitePerIlServizio(liberi, scelte, cfg.uom);
      qty = packsOut.length;
      qtyUom = totaleUomColli(packsOut.map(u => u.quantita), cfg.uom);
      uom = cfg.uom;
    } else {
      const qtyRaw = $('pShipQty')?.value;
      qty = parseInt(qtyRaw);
      if (!qty || qty < 1) return this.toast('Numero di colli non valido', 'error');
      if (qty > availableQty) return this.toast(`Qty richiesta (${qty}) supera disponibilità (${availableQty})`, 'error');
    }

    if (!this._shipCart.length && !this._shipStartTime) this._shipStartTime = Date.now();
    this._shipCart.push({
      article_code: item.article_code,
      article_description: item.article_description || '',
      lot_code: item.lot_code,
      location_code: item.location_code,
      item_key: item.item_key,
      expiry_date: item.expiry_date || '',
      qty,
      qty_at_creation: availableQty,
      notes,
      packs_out: packsOut,
      qty_uom: qtyUom,
      uom
    });
    this.toast(`+ ${item.article_code}#${item.lot_code} (${qty}/${availableQty} Coll.) da ${item.location_code}`, 'success');
    for (const id of ['pShipArt','pShipLot','pShipNotes']) { const e = $(id); if (e) e.value = ''; }
    const qe = $('pShipQty'); if (qe) qe.value = '1';
    $('pShipItemPreview').innerHTML = '';
    $('pShipDetails')?.classList.add('hidden');
    this._shipState = null;
    this._persistShipHeader();
    this._updateShipCart();
    this.setPrimaryScanField('pShipArt');
  },

  /** Vero se la causale scelta SPOSTA la merce invece di scaricarla — il
      conto terzi. Una causale che non esiste più (l'elenco è un dato e si
      può cambiare) si legge come una spedizione normale: il comportamento
      di sempre, che è quello che non sorprende nessuno. */
  _shipETrasferimento(causaleId) {
    return Boolean(Store.getCausale(causaleId || this._shipCausale)?.trasferimento);
  },

  /* Il campo si accende togliendo l'attributo, non lo stile: una riga
     nascosta con `display` non ricompare più (§7). E un campo che non serve
     si nasconde E si svuota — nascondere è una cosa a video, il payload è
     storia. */
  _shipAggiornaDestLoc() {
    const box = $('pShipDestLocBox');
    if (!box) return;
    const serve = this._shipETrasferimento($sel('pShipCausale')?.value);
    box.hidden = !serve;
    if (!serve) {
      const campo = $('pShipDestLoc');
      if (campo) campo.value = '';
      this._shipDestLocation = '';
    }
  },

  _persistShipHeader() {
    const g = (id: string) => Validate.clean($(id)?.value);
    const sel = (id: string) => $(id)?.value;

    if ($('pShipCausale')) this._shipCausale = sel('pShipCausale') || this._shipCausale;
    this._shipDdtNum = g('pShipDdt') || this._shipDdtNum;
    this._shipOrderRef = $('pShipOrderRef') ? g('pShipOrderRef') : this._shipOrderRef;
    this._shipDestLocation = $('pShipDestLoc') ? g('pShipDestLoc').toUpperCase() : this._shipDestLocation;
    this._shipCustomer = g('pShipCustomer') || this._shipCustomer;

    /* Questi campi possono essere legittimamente SVUOTATI (un indirizzo
       ripreso per sbaglio va potuto cancellare), quindi niente `||`. */
    const opt = (id: string, cur: string) => $(id) ? g(id) : cur;
    this._shipDestAddress  = opt('pShipDestAddress', this._shipDestAddress);
    this._shipDestZip      = opt('pShipDestZip', this._shipDestZip);
    this._shipDestCity     = opt('pShipDestCity', this._shipDestCity);
    this._shipDestProvince = (opt('pShipDestProvince', this._shipDestProvince) || '').toUpperCase();
    this._shipDestVat      = opt('pShipDestVat', this._shipDestVat);
    this._shipShipTo       = opt('pShipShipTo', this._shipShipTo);
    this._shipCarrier      = opt('pShipCarrier', this._shipCarrier);
    this._shipAspetto      = opt('pShipAspetto', this._shipAspetto);
    this._shipPesoNetto    = opt('pShipPesoNetto', this._shipPesoNetto);
    this._shipPesoLordo    = opt('pShipPesoLordo', this._shipPesoLordo);
    this._shipStartTransport = opt('pShipStartTransport', this._shipStartTransport);
    this._shipDocNotes     = opt('pShipDocNotes', this._shipDocNotes);

    if ($('pShipPorto')) this._shipPorto = sel('pShipPorto');
    if ($('pShipTrasporto')) this._shipTrasporto = sel('pShipTrasporto');

    // v2.3.0 [D1] — i campi data sono in gg/mm/aaaa: lo stato interno resta ISO
    const dd = $('pShipDocDate');
    if (dd) { const iso = this._dateITtoISO(dd.value, 'Data documento'); this._shipDocDate = iso === null ? '' : iso; }
    const expectedEl = $('pShipExpected');
    if (expectedEl) { const iso = this._dateITtoISO(expectedEl.value, 'Data ritiro'); this._shipExpectedDate = iso === null ? '' : iso; }
  },

  _shipRemoveFromCart(idx) {
    this._shipCart.splice(idx, 1);
    this._persistShipHeader();
    this._updateShipCart();
  },

  async _shipClearCart() {
    if (!await Dialog.confirm({
      title: 'Svuotare il carrello bozza?',
      message: 'Le righe inserite vengono eliminate. La testata del DDT viene mantenuta.',
      confirmLabel: 'Svuota', danger: true
    })) return;
    this._shipCart = [];
    this._shipStartTime = null;
    this._shipState = null;
    this._persistShipHeader();
    this._updateShipCart();
  },

  /* v2.1.0 — contenuto della sola zona carrello */
  _shipCartZoneHTML() {
    const n = this._shipCart.length;
    const totalColli = (this._shipCart as VoceCarrelloDDT[]).reduce((s, r) => s + (r.qty || 0), 0);
    const totaliUom = this._ddtTotaliUom(this._shipCart);
    const wLabel = totaliUom ? ` <span class="dlg-chip">${this._esc(totaliUom)}</span>` : '';
    return `<div class="flex justify-between items-center mt-7 mx-0 mb-3.5">
        <strong class="text-body-medium">${this._ico('shopping-cart')} Carrello Bozza <span class="text-sx-orange">(${n})</span>${n ? ` <span class="dlg-chip">${totalColli} Coll.</span>${wLabel}` : ''}</strong>
        ${n ? '<button class="btn btn-sm btn-ghost" onclick="App._shipClearCart()">Svuota</button>' : ''}
      </div>
      <div class="pick-cart">${this._renderShipCart()}</div>
      ${n ? `<button class="btn btn-conferma mt-6 bg-sx-orange text-white border-sx-orange" onclick="App._saveShipPending()">${this._ico('download')} REGISTRA DDT PENDENTE (${n} righe)</button>` : ''}`;
  },

  _updateShipCart() {
    const zone = $('shipCartZone');
    if (zone) zone.innerHTML = this._shipCartZoneHTML();
    else this._formSpedizioni($('movFormArea'));   // ripiego
  },

  _renderShipCart() {
    if (!this._shipCart.length) return '<div class="pick-cart-empty">Carrello vuoto — scansiona articolo e lotto, identifica in giacenza, poi aggiungi</div>';
    return (this._shipCart as VoceCarrelloDDT[]).map((it, i) => {
      const expBadge = it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : '';
      const notesBadge = it.notes ? ` · <span class="text-sx-text-muted italic">${this._esc(it.notes)}</span>` : '';
      const partial = it.qty < (it.qty_at_creation || it.qty) ? ` <span class="badge badge-amber ml-2">PARZIALE</span>` : '';
      /* Le UM accanto ai colli: con misure diverse il numero di colli non
         dice quanta merce sia, ed e' quello che il DDT deve riportare. */
      const umBadge = it.qty_uom != null ? ` · <strong class="text-sx-orange">${this._esc(formattaQuantita(it.qty_uom, it.uom))} ${this._esc(it.uom || '')}</strong>` : '';
      return `<div class="pick-cart-item border-l-[3px] border-l-sx-orange">
        <div class="pci-num bg-sx-orange">${i+1}</div>
        <div class="pci-info">
          <div class="pci-code">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal text-label-small">${this._esc(it.article_description || '')}</span>${partial}</div>
          <div class="pci-loc">L:${this._esc(it.lot_code)} · ${this._ico('map-pin')} ${this._esc(it.location_code)} · <strong class="text-sx-orange">${it.qty} Coll.</strong>${umBadge}${expBadge}${notesBadge}</div>
        </div>
        <button class="btn btn-sm btn-ghost text-sx-danger" onclick="App._shipRemoveFromCart(${i})">${this._ico('x')}</button>
      </div>`;
    }).join('');
  },

  _shipResetHeader() {
    this._shipCart = [];
    this._shipStartTime = null;
    this._shipState = null;
    this._shipDdtNum = '';
    this._shipDocDate = '';
    this._shipOrderRef = '';
    this._shipDestLocation = '';
    this._shipCustomer = '';
    this._shipDestAddress = '';
    this._shipDestZip = '';
    this._shipDestCity = '';
    this._shipDestProvince = '';
    this._shipDestVat = '';
    this._shipShipTo = '';
    this._shipCarrier = '';
    this._shipAspetto = '';
    this._shipPesoNetto = '';
    this._shipPesoLordo = '';
    this._shipStartTransport = '';
    this._shipDocNotes = '';
    this._shipExpectedDate = '';
  },

  /* STATO 1 — Salva il DDT come pendente. La merce NON viene scaricata:
     resta in giacenza, prenotata, fino all'evasione. */
  async _saveShipPending() {
    if (!this._requireOperator('la registrazione del DDT')) return;   // v2.0.1 [B7]
    if (!this._shipCart.length) return this.toast('Carrello vuoto', 'error');
    this._persistShipHeader();
    if (!this._shipDdtNum) { $('pShipDdt')?.focus(); return this.toast('N° DDT obbligatorio', 'error'); }
    if (!this._shipCustomer) { $('pShipCustomer')?.focus(); return this.toast('Destinatario obbligatorio', 'error'); }
    if (!this._shipCausale) return this.toast('Causale del trasporto obbligatoria', 'error');

    const dupe = Store._cache.pendingOut.find(d =>
      d.status !== 'cancelled' &&
      String(d.ddt_num || '').trim().toUpperCase() === this._shipDdtNum.trim().toUpperCase());
    if (dupe && !await Dialog.confirm({
      title: 'Numero DDT già usato', icon: 'alert-triangle',
      message: 'Esiste già un documento con questo numero. Procedere solo se la ripetizione è voluta.',
      details: Dialog.kv([
        ['N° DDT', this._shipDdtNum],
        ['Documento esistente', dupe.destination],
        ['Stato', dupe.status === 'pending' ? 'pendente' : 'evaso'],
        ['Registrato il', new Date(dupe.created_at).toLocaleDateString('it-IT')]
      ]),
      confirmLabel: 'Procedo comunque', cancelLabel: 'Cambio numero', danger: true
    })) { $('pShipDdt')?.focus(); return; }

    // Re-check: per ogni riga la giacenza deve essere ancora sufficiente
    for (let i = 0; i < this._shipCart.length; i++) {
      const it = this._shipCart[i];
      const cur = Store.getItemsAtLocation(it.location_code).find(x => x.item_key === it.item_key);
      if (!cur) return this.toast(`Riga ${i+1}: ${it.article_code}#${it.lot_code} non più in ${it.location_code}`, 'error');
      /* SULLE RIGHE A COLLI SCELTI IL CONTO NON BASTA: fra la scelta e la
         registrazione un altro terminale puo' aver preso proprio quel collo,
         lasciandone lo stesso numero di misura diversa. Si verifica che le
         misure messe da parte ci siano ancora tutte — quella prova la fa
         `colliLiberi`, che lancia con il collo scritto nel motivo. */
      if (it.packs_out) {
        const tutte = (this._shipCart as VoceCarrelloDDT[])
          .filter(x => x.location_code === it.location_code && x.item_key === it.item_key && x.packs_out)
          .flatMap(x => x.packs_out!);
        try { Store.colliLiberi(cur, tutte); }
        catch (err) { return this.toast(`Riga ${i+1}: ${(err as Error).message}`, 'error'); }
        continue;
      }
      const totalQty = cur.qty || 1;
      const pendingQty = Store.getPendingQtyForItem(it.location_code, it.item_key);
      const otherCart = this._shipCart
        .filter((x: VoceCarrelloDDT, j: number) => j !== i && x.location_code === it.location_code && x.item_key === it.item_key)
        .reduce((s: number, x: VoceCarrelloDDT) => s + x.qty, 0);
      const avail = totalQty - pendingQty - otherCart;
      if (it.qty > avail) return this.toast(`Riga ${i+1}: qty richiesta (${it.qty}) > disponibilità effettiva (${avail})`, 'error');
    }

    const totalColli = (this._shipCart as VoceCarrelloDDT[]).reduce((s, it) => s + (it.qty || 1), 0);
    const causale = Store.getCausale(this._shipCausale);

    // v2.0.0+ — warning se data ritiro è oggi/passata o non specificata
    let dateWarn = '';
    if (this._shipExpectedDate) {
      const status = pickupAlertStatus({ expected_pickup_date: this._shipExpectedDate });
      if (status.level === 'overdue') dateWarn = `\n${this._ico('alert-triangle')} Data ritiro nel passato (${status.label})`;
      else if (status.level === 'today') dateWarn = `\n${this._ico('alert-triangle')} Data ritiro è OGGI`;
    } else {
      dateWarn = '\nData ritiro non specificata (nessun alert sarà attivo)';
    }

    if (!await Dialog.confirm({
      title: 'Registrare il DDT come pendente?',
      message: `La merce RIMANE in giacenza, prenotata per l’uscita. Al ritiro fisico del vettore usare "EVADI DDT".${dateWarn}`,
      details: Dialog.kv([
        ['Causale', causale?.label || '—'],
        ['N° DDT', this._shipDdtNum],
        ['Destinatario', this._shipCustomer],
        ['Destinazione', this._shipShipTo || 'sede del destinatario'],
        ['Vettore', this._shipCarrier || null],
        ['Ritiro previsto', this._shipExpectedDate ? new Date(this._shipExpectedDate + 'T00:00:00').toLocaleDateString('it-IT') : 'non indicato'],
        ['Righe', this._shipCart.length],
        ['Colli totali', totalColli]
      ]),
      confirmLabel: 'Registra DDT', icon: 'download'
    })) return;

    try {
      const doc = await Store.savePendingOutbound({
        kind: causale?.mov === 'RET' ? 'RES' : 'SHIP',
        causale_id: this._shipCausale,
        causale_label: causale?.label || '',
        causale_mov: causale?.mov || 'SHIP',
        ddt_num: this._shipDdtNum,
        doc_date: this._shipDocDate,
        order_ref: this._shipOrderRef,
        dest_location: this._shipDestLocation || '',
        destination: this._shipCustomer,
        dest_address: this._shipDestAddress,
        dest_zip: this._shipDestZip,
        dest_city: this._shipDestCity,
        dest_province: this._shipDestProvince,
        dest_vat: this._shipDestVat,
        ship_to: this._shipShipTo,
        carrier: this._shipCarrier,
        transport_by: this._shipTrasporto,
        porto: this._shipPorto,
        aspetto: this._shipAspetto,
        /* 1.8.4 — quel che c'e' scritto, e nient'altro: il netto proposto
           dall'anagrafica moltiplicava un peso per collo per il numero di
           colli, ed e' falso appena i colli hanno misure diverse. */
        peso_netto: this._shipPesoNetto,
        peso_lordo: this._shipPesoLordo,
        start_transport: this._shipStartTransport,
        doc_notes: this._shipDocNotes,
        expected_pickup_date: this._shipExpectedDate, // v2.0.0+
        operator: Store.getCurrentIdentity().initials,
        /* Il mittente viene congelato nel documento: un DDT ristampato fra
           due anni deve riportare la sede di allora [M4]. */
        sender: Store.getDocConfig().sender,
        /* Il compito che ha aperto questo prelievo resta scritto sul
           documento: dalla 1.4.4 non è più il filo della chiusura, ma resta
           il legame fra la richiesta e il documento che ne è nato — serve a
           chi, fra un mese, si chiede da dove venisse questo DDT. */
        task_id: (this._taskRun?.type === 'PICK_SHIP' || this._taskRun?.type === 'PICK_RET')
          ? this._taskRun.task_id : null,
        lines: this._shipCart.slice()
      });
      await Store.rememberDdtNumber(doc.ddt_num);
      this.toast(`DDT ${doc.ddt_num} registrato come pendente`, 'success');   // v2.2.1 [F4]
      /* 1.6 — L'ANAGRAFICA SI POPOLA QUI, e non prima: si registra ciò che è
         andato su un documento vero, non ciò che qualcuno stava digitando.
         Dopo il salvataggio, così un errore di rubrica non fa perdere un DDT. */
      await this._aggiornaRubrica();
      this.updateSyncIndicator();
      /* 1.4.4 — IL PRELIEVO SI CHIUDE QUI, ALLA REGISTRAZIONE DEL DDT.
         Il lavoro dell'operatore finisce col documento: da questo momento la
         merce aspetta il vettore, e l'evasione non dipende più da lui — può
         passare giorni, e la fa chi spedisce. Tenere il compito aperto fino
         al ritiro voleva dire lasciare in coda, addosso a chi ha prelevato,
         un'attività che non poteva più concludere. */
      const colliDdt = (this._shipCart as VoceCarrelloDDT[]).reduce((s, l) => s + (l.qty || 1), 0);
      await this._taskAvanza(colliDdt, ['PICK_SHIP', 'PICK_RET']);
      this._shipResetHeader();
      this._formSpedizioni($('movFormArea'));
    } catch (err) {
      this.toast(`Errore salvataggio: ${(err as Error).message || 'sconosciuto'}`, 'error');
    }
  },

  async _evadiSpedizione(doc_id) {
    if (!this._requireOperator("l'evasione del DDT")) return;   // v2.0.1 [B7]
    const doc = Store.getPendingDoc(doc_id);
    if (!doc || doc.status !== 'pending') return this.toast('Documento non trovato o già evaso', 'error');

    const isRet = this._docIsReturn(doc);
    const movType = isRet ? MOV.RET : MOV.SHIP;
    const causale = this._docCausaleLabel(doc);

    // Pre-check: tutte le righe devono avere giacenza sufficiente
    for (let i = 0; i < doc.lines.length; i++) {
      const l = doc.lines[i]!;
      const cur = Store.getItemsAtLocation(l.location_code!).find(x => x.item_key === l.item_key);
      if (!cur) return this.toast(`Riga ${i+1}: ${l.article_code}#${l.lot_code} non più in giacenza in ${l.location_code!} — annullare e ricreare il DDT`, 'error');
      if ((cur.qty || 1) < l.qty) return this.toast(`Riga ${i+1}: giacenza attuale (${cur.qty || 1}) < qty richiesta (${l.qty})`, 'error');
    }
    const totalColli = doc.lines.reduce((s, l) => s + (l.qty || 1), 0);

    /* 2.20 — IL CONTO TERZI NON SCARICA: SPOSTA. Su una causale marcata
       «la merce si sposta» il documento accompagna un viaggio, non un'uscita:
       i bancali cambiano ubicazione e vanno nel vano del sito di arrivo, che
       sta già sulla mappa. La merce resta in giacenza e resta nostra. */
    const trasferisce = this._shipETrasferimento(doc.causale_id);
    const arrivo = String(doc.dest_location || '').trim().toUpperCase();
    if (trasferisce) {
      if (!arrivo) {
        return this.toast('Questa causale sposta la merce, ma il documento non dice in quale ubicazione: '
          + 'si corregge con Modifica, oppure si annulla e si rifà', 'error');
      }
      if (!Store.locationExists(arrivo)) {
        return this.toast(`L’ubicazione di arrivo ${arrivo} non esiste`, 'error');
      }
    }

    /* Su un trasferimento le righe SENZA bancale non si possono spostare
       come unità, e scaricarle vorrebbe dire farle sparire da un magazzino
       che è ancora nostro. Non si blocca: si dice cosa succede, e chi evade
       decide. */
    const senzaBancale = trasferisce
      ? doc.lines.filter((l) => !String(l.udc_id || '').trim()).length : 0;

    if (!await Dialog.confirm({
      title: trasferisce ? 'Evadere il DDT e spostare la merce?' : 'Evadere il DDT?',
      message: trasferisce
        ? 'La merce NON esce dal sistema: i bancali cambiano ubicazione e vanno nel vano di arrivo. '
          + 'Il documento accompagna il viaggio.'
        : 'La merce viene SCARICATA fisicamente dalla giacenza. Confermare solo a ritiro avvenuto.',
      details: Dialog.kv([
        ['Causale', causale],
        ['N° DDT', doc.ddt_num],
        ['Destinatario', doc.destination],
        ['Movimento a registro', isRet ? 'Reso' : 'Spedizione'],
        ...(trasferisce ? [['Ubicazione di arrivo', arrivo]] as [string, string][] : []),
        ...(senzaBancale ? [['Righe senza bancale', `${senzaBancale} — queste vengono SCARICATE, non spostate`]] as [string, string][] : []),
        ['Righe', doc.lines.length],
        ['Colli totali', totalColli]
      ]),
      confirmLabel: trasferisce ? 'Evadi e sposta' : 'Evadi e scarica', danger: true
    })) return;

    if (trasferisce) return await this._evadiTrasferendo(doc, arrivo, causale);

    const reasonNotes = `${causale.toUpperCase()} → ${doc.destination}${doc.carrier ? ' (vettore: ' + doc.carrier + ')' : ''}`;
    const performed = [];
    let failedAt = -1, failMsg = '';
    for (let i = 0; i < doc.lines.length; i++) {
      const l = doc.lines[i]!;
      try {
        // Snapshot pre-rimozione per rollback
        const before = Store.getItemsAtLocation(l.location_code!).find(x => x.item_key === l.item_key);
        const backup = before ? { ...before } : null;
        /* 1.8.4 — I COLLI LI HA GIA' SCELTI CHI HA SCRITTO IL DOCUMENTO.
           Qui non si chiede piu' niente: si ritrovano per misura sull'elenco
           di adesso, e una misura che non c'e' piu' ferma l'evasione con il
           collo scritto nel motivo — la merce che sale sul camion e' quella
           che il DDT nomina, non un'altra della stessa quantita'.

           I documenti scritti prima della 1.8.4 le uscite non le portano, e
           allora i colli si chiedono qui come si faceva allora. */
        let scelteDdt = null;
        if (before && Array.isArray(l.packs_out) && l.packs_out.length) {
          scelteDdt = Store.scelteDaUscite(before, l.packs_out);
        } else if (before) {
          scelteDdt = await this._chiediColli(before, `Quali colli · riga ${i + 1} di ${doc.lines.length}`,
            null, { colli: l.qty });
          if (scelteDdt === undefined) { failedAt = i; failMsg = 'Evasione annullata alla scelta dei colli'; break; }
        }
        const removed = await Store.removeItem(l.location_code!, l.item_key as string, l.qty, null, scelteDdt);
        if (!removed) { failedAt = i; failMsg = `Rimozione fallita (riga ${i+1})`; break; }
        performed.push({ backup, mode: removed._mode, location_code: l.location_code!, item_key: l.item_key, qty_removed: l.qty, qty_before: removed._qty_before, qty_after: removed._qty_after, qty_uom_delta: removed._qty_uom_delta ?? null, packs_out: removed._packs_out ?? null });
      } catch (err) {
        failedAt = i;
        failMsg = `Errore riga ${i+1}: ${(err as Error).message || 'sconosciuto'}`;
        break;
      }
    }
    if (failedAt !== -1) {
      // Rollback
      for (let j = performed.length - 1; j >= 0; j--) {
        const p = performed[j]!;
        try {
          if (p.mode === 'full' && p.backup) await Store.restoreItem(p.backup);
          else if (p.backup) await Store.addItem(p.location_code, p.backup.article_code, p.backup.article_description!, p.backup.lot_code, p.backup.expiry_date || '', p.backup.notes || '', p.packs_out ? p.packs_out.length : p.qty_removed, null, p.packs_out ?? null);
        } catch {}
      }
      return this.toast(`${failMsg} — rollback eseguito, DDT resta pendente`, 'error');
    }
    // Log movimenti
    const movIds = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const l = doc.lines[i]!;
      const p = performed[i]!;
      const itemNotes = l.notes ? `${reasonNotes} · ${l.notes}` : reasonNotes;
      /* 2.2 — e le UM che escono col DDT, che erano l'unica colonna vuota di
         questa riga: una spedizione a peso raccontava solo i colli. */
      const _id = await this._logMov(movType, l.article_code, l.article_description, l.lot_code, l.location_code!, null, doc.operator || Store.getCurrentIdentity().initials, itemNotes, doc.ddt_num, p.qty_before, -p.qty_removed, p.qty_after, typeof p.qty_uom_delta === 'number' ? p.qty_uom_delta : null);
      if (typeof _id === 'number') movIds.push(_id);
    }
    // Aggiorna status documento → evaded
    /* 2.20 — I BANCALI CHE SI SONO SVUOTATI SONO PARTITI, e si scrive.
       `removeItem` chiude gia' da se' un'unita' rimasta vuota (`empty`), ma
       vuoto e spedito sono due fatti diversi: un bancale svuotato in
       magazzino e' un pallet libero, uno svuotato da un DDT e' merce che sta
       su un camion. L'elenco del prodotto finito li mostra diversi. */
    const bancali = new Set((doc.lines || [])
      .map((l) => String((l as { udc_id?: unknown }).udc_id ?? '').trim())
      .filter(Boolean));
    for (const id of bancali) {
      const u = Store.getUdc(id);
      if (u && u.status !== 'shipped' && !Store.righeDiUdc(id).length) {
        try { await Store.segnaUdcSpedita(id); }
        catch (e) { this.toast(`${id}: ${(e as Error).message}`, 'warning'); }
      }
    }

    await Store.updatePendingStatus(doc_id, 'evaded');
    /* 1.4.4 — QUI NON SI CHIUDE NIENTE. Il compito di prelievo si è chiuso
       alla registrazione del DDT: l'evasione è il ritiro del vettore, un
       fatto del magazzino che non ha un'attività sua e non ne conclude
       nessuna. Fino alla 1.4.3 la chiusura stava qui, e dipendeva da un
       `task_id` che veniva scritto solo se la sessione dell'operatore era
       ancora viva al salvataggio: bastava uscire da Movimenta e rientrare
       perché il filo si spezzasse e il compito non si chiudesse mai più. */
    this.toast(`DDT ${doc.ddt_num} evaso · ${doc.lines.length} righe · ${totalColli} Coll.`, 'success');
    this.updateSyncIndicator();
    if (await Dialog.confirm({
      title: 'Stampare il DDT?',
      message: 'Il documento esce senza la filigrana di bozza: la merce è uscita.',
      confirmLabel: 'Stampa', cancelLabel: 'Non ora', icon: 'printer'
    })) this._printDDT(doc_id);
    this._formSpedizioni($('movFormArea'));
    /* Evaso da fuori Movimenta, la vista da rinfrescare è quella da cui si è
       premuto: la Dashboard perde un DDT pendente, la coda può aver appena
       chiuso il prelievo che quel documento portava. */
    if (this.currentView === 'dashboard') this.renderDashboard();
    else if (this.currentView === 'tasks') this.renderTasks();
    this._refreshSessionLog();
  },

  /* Annulla DDT pendente: status → cancelled, nessun movimento di giacenza. */
  async _cancelPendingShip(doc_id) {
    if (!this._requireOperator("l'annullamento del DDT")) return;   // v2.0.1 [B7]
    const doc = Store.getPendingDoc(doc_id);
    if (!doc) return this.toast('Documento non trovato', 'error');
    if (doc.status !== 'pending') return this.toast('Documento non più pendente', 'error');
    if (!await Dialog.confirm({
      title: 'Annullare il DDT?',
      message: 'Il documento viene chiuso senza movimentare la giacenza. La merce torna interamente disponibile.',
      details: Dialog.kv([['N° DDT', doc.ddt_num], ['Destinatario', doc.destination]]),
      confirmLabel: 'Annulla il DDT', cancelLabel: 'Mantieni', danger: true
    })) return;
    await Store.updatePendingStatus(doc_id, 'cancelled');
    this.toast(`DDT ${doc.ddt_num} annullato`, 'success');
    this._formSpedizioni($('movFormArea'));
  },

  /* ═══ 2.20 · L'EVASIONE CHE SPOSTA — IL CONTO TERZI ═══════════════════
     Un DDT di conto lavorazione o di trasferimento accompagna merce che
     resta nostra: all'evasione i bancali cambiano ubicazione, e lo fanno con
     `/api/op/moveUdc` — la stessa rotta della maschera, che è
     transazionale, scrive una riga di registro per ogni partita e rifiuta se
     nel vano d'arrivo la stessa chiave sta già fuori dall'unità.

     LE RIGHE SENZA BANCALE SI SCARICANO, e la conferma l'ha detto prima: una
     riga sciolta non è un'unità che si possa spostare tutta insieme, e
     inventarle un contenitore per l'occasione sarebbe peggio.

     UN BANCALE CHE NON SI SPOSTA NON FERMA GLI ALTRI: il documento resta
     pendente e il riscontro dice quale e perché — così chi evade ha davanti
     un lavoro da finire, non un documento a metà da indovinare. */
  async _evadiTrasferendo(doc: DocumentoUscita, arrivo: string, causale: string) {
    const nota = `${causale.toUpperCase()} → ${doc.destination}${doc.carrier ? ' (vettore: ' + doc.carrier + ')' : ''}`;
    const bancali = [...new Set((doc.lines || [])
      .map((l: RigaDocumento) => String(l.udc_id || '').trim()).filter(Boolean))];

    const falliti: string[] = [];
    let spostati = 0;
    for (const id of bancali) {
      const u = Store.getUdc(id);
      if (!u) { falliti.push(`${id}: non esiste più`); continue; }
      if (u.location_code === arrivo) { spostati++; continue; }
      try {
        /* La riga del CONTENITORE dice da dove a dove, come quella della
           maschera dell'unita' di carico: la merce che porta scrive le sue
           righe da se', dentro la stessa transazione. */
        await Store.moveUdc(id, arrivo, {
          type: MOV.UDC, article_code: '', article_description: '', lot_code: '',
          location_code: u.location_code || '', dest_location: arrivo,
          user: Store.getCurrentIdentity().initials, ts: Date.now(),
          doc_ref: doc.ddt_num,
          notes: `${nota} — unità di carico ${id}`,
        });
        spostati++;
      } catch (e) {
        falliti.push(`${id}: ${(e as Error).message}`);
      }
    }

    if (falliti.length) {
      this.toast(`${falliti.length} ${falliti.length === 1 ? 'bancale non si è spostato' : 'bancali non si sono spostati'}: ${falliti.join(' · ')}`, 'error');
      this.toast('Il DDT resta pendente: si riprova quando i vani sono liberi', 'warning');
      this._formSpedizioni($('movFormArea'));
      return;
    }

    /* Le righe che non stanno su un bancale escono come su un DDT qualunque:
       la conferma l'ha appena scritto. */
    const sciolte = (doc.lines || []).filter((l: RigaDocumento) => !String(l.udc_id || '').trim());
    for (const l of sciolte) {
      try {
        const before = Store.getItemsAtLocation(l.location_code!).find((x) => x.item_key === l.item_key);
        if (!before) { falliti.push(`${l.article_code}#${l.lot_code}: non più in giacenza`); continue; }
        const scelte = (Array.isArray(l.packs_out) && l.packs_out.length)
          ? Store.scelteDaUscite(before, l.packs_out) : null;
        const res = await Store.removeItem(l.location_code!, l.item_key as string, l.qty, null, scelte);
        await this._logMov(MOV.SHIP, l.article_code, l.article_description, l.lot_code,
          l.location_code!, null, doc.ddt_num, nota, '',
          res?._qty_before, -(res?._qty_delta ?? l.qty), res?._qty_after, res?._qty_uom_delta);
      } catch (e) {
        falliti.push(`${l.article_code}#${l.lot_code}: ${(e as Error).message}`);
      }
    }

    await Store.updatePendingStatus(doc.doc_id, 'evaded');
    this.updateSyncIndicator();
    this.toast(`DDT ${doc.ddt_num} evaso — ${spostati} ${spostati === 1 ? 'bancale spostato' : 'bancali spostati'} in ${arrivo}`, 'success');
    if (falliti.length) {
      this.toast(`Righe senza bancale non scaricate: ${falliti.join(' · ')}`, 'warning');
    }
    this._formSpedizioni($('movFormArea'));
  },

  /* ═══ 2.20 · LA PACKING LIST ══════════════════════════════════════════
     NON E' UNA COLLEZIONE NUOVA: e' un secondo modo di stampare lo stesso
     documento archiviato. §8 — i documenti si rileggono, non si
     ricostruiscono: le righe del DDT portano gia' colli, uscite, unita' di
     misura e, dalla 2.20, il bancale da cui escono.

     UN BANCALE PER BLOCCO, e sotto le sue righe. E' il foglio che chi
     scarica il camion tiene in mano: cerca il codice sull'etichetta del
     pallet e ci trova sotto quello che dovrebbe esserci sopra.

     IL SUPPORTO E LA TARA SI LEGGONO ADESSO, non alla registrazione del
     documento: stanno sull'unita' di carico e nei modelli configurati, e il
     foglio lo dichiara. Congelarli sulla riga vorrebbe dire un campo in piu'
     su ogni DDT per un dato che cambia una volta ogni due anni. */
  _packingBlocchi(doc: DocumentoUscita): PackingBlocco[] {
    const modelli = Store.getModelliImballo();
    const perBancale = new Map<string, RigaDocumento[]>();
    for (const l of doc.lines || []) {
      const id = String(l.udc_id || '');
      const gruppo = perBancale.get(id) ?? [];
      gruppo.push(l);
      perBancale.set(id, gruppo);
    }
    return [...perBancale.entries()].map(([id, righe]) => {
      const u = id ? Store.getUdc(id) : null;
      const modello = u?.model_code ? modelli.find((m) => m.code === u.model_code) : null;
      return {
        udc_id: id,
        supporto: modello?.supporto || '',
        modello: modello ? descriviModelloImballo(modello) : '',
        tara: modello?.tara_kg ?? null,
        odp: u?.odp_num || '',
        righe,
        colli: righe.reduce((n: number, l: RigaDocumento) => n + (l.qty || 0), 0),
      };
    });
  },

  /** Il peso lordo dei bancali: netto piu' tare. `null` quando il netto non
      si sa — righe senza unita', o unita' diverse che non si sommano — o
      quando nessun bancale porta una tara. Un lordo inventato su
      un'etichetta di trasporto e' un numero che qualcuno mette in bolla. */
  _packingLordo(blocchi: PackingBlocco[]) {
    let netto = 0, tare = 0, unita = null, mista = false, conTara = false;
    for (const b of blocchi) {
      if (b.tara != null) { tare += b.tara * 1; conTara = true; }
      for (const l of b.righe) {
        if (l.qty_uom == null || !l.uom) { mista = true; continue; }
        if (unita && unita !== l.uom) { mista = true; continue; }
        unita = l.uom;
        netto += Number(l.qty_uom) || 0;
      }
    }
    if (mista || unita !== 'KG' || !conTara) return null;
    return netto + tare;
  },

  /** «40 × 12,5 KG» — com'e' fatto il collo, non quanti sono. Le uscite
      stanno sulla riga dalla 1.8.4; un documento scritto prima non le porta,
      e allora la cella resta VUOTA: un documento si rilegge, non si
      ricostruisce, e un «per collo» dedotto dividendo sarebbe un numero
      inventato appena i colli hanno misure diverse. */
  _packingComposizione(uscite: number[] | null, uom: string | null): string {
    if (!uscite?.length || !uom) return '';
    return descriviColli(uscite, uom);
  },

  /** Il numero e la sua unita' in due celle: e' la colonna che si legge in
      verticale scorrendo il foglio, e un'unita' incollata al numero la fa
      leggere una riga per volta. Vuota dove il totale non si puo' fare. */
  _packingQta(qty_uom: number | null, uom: string | null): string {
    if (qty_uom == null || !uom) return '<td class="c-num"></td><td class="c-uom"></td>';
    return `<td class="c-num">${this._esc(formattaQuantita(qty_uom, uom))}</td>`
      + `<td class="c-uom">${this._esc(uom)}</td>`;
  },

  /* ═══ 2.24 · LA DISTINTA: ARTICOLO, LOTTO, BANCALE ══════════════════════

     FINO ALLA 2.23 IL FOGLIO ERA PER BANCALE — un blocco per pallet, e sotto
     le righe che porta. Rispondeva alla domanda di chi scarica il camion, e
     lasciava scoperta quella di chi controlla la merce col DDT accanto:
     «questo articolo, in questo lotto, su quanti bancali e' arrivato e quanto
     fa in tutto». Su dieci blocchi quel numero non si ricava guardandoli, e
     il riepilogo in coda lo dava senza dire da dove veniva.

     ADESSO IL FOGLIO SEGUE LA DOMANDA: articolo, dentro il lotto, dentro i
     bancali. Ogni livello porta il suo totale — chi si ferma al lotto ha il
     numero del lotto, chi scende trova i pallet che lo compongono — e il
     livello del bancale porta ancora il codice da cercare sull'etichetta,
     con supporto e ordine di produzione accanto.

     UNA TABELLA SOLA, NON UNA PER ARTICOLO. Le colonne restano incolonnate da
     cima a fondo del foglio, l'intestazione si ripete su ogni pagina da se'
     (`thead`), e i tre livelli si distinguono per rientro e peso del segno.
     Tre tabelle affiancate darebbero tre griglie che non si allineano. */
  _packingDistintaHTML(doc: DocumentoUscita): string {
    const modelli = Store.getModelliImballo();
    const distinta = distintaPerArticolo(doc.lines) as DistintaArticolo[];
    if (!distinta.length) return '<div class="doc-empty">Nessuna riga su questo documento.</div>';

    const corpo = distinta.map((a: DistintaArticolo) => {
      const bancaliArticolo = new Set<string>();
      for (const l of a.lotti) for (const b of l.bancali) if (b.udc_id) bancaliArticolo.add(b.udc_id);

      const righeLotto = a.lotti.map((l) => {
        const righeUdc = l.bancali.map((b) => {
          /* SUPPORTO E ORDINE SI LEGGONO ADESSO, non alla registrazione del
             documento: stanno sull'unita' di carico e nei modelli
             configurati. Congelarli sulla riga vorrebbe dire un campo in piu'
             su ogni DDT per un dato che cambia una volta ogni due anni. */
          const u = b.udc_id ? Store.getUdc(b.udc_id) : null;
          const m = u?.model_code ? modelli.find((x) => x.code === u.model_code) : null;
          const dettaglio = [m ? descriviModelloImballo(m) : '', u?.odp_num ? `ordine ${u.odp_num}` : '']
            .filter(Boolean).join(' · ');
          return `<tr class="pk-r-udc">
            <td class="c-cod">${b.udc_id ? this._esc(b.udc_id) : '<span class="doc-empty">senza bancale</span>'}</td>
            <td class="c-desc">${this._esc(dettaglio)}</td>
            <td class="c-qty">${b.colli}</td>
            <td class="c-pcs">${this._esc(this._packingComposizione(b.uscite, b.uom))}</td>
            ${this._packingQta(b.qty_uom, b.uom)}
          </tr>`;
        }).join('');

        const scad = this._dateISOtoIT(l.expiry_date) || l.expiry_date || '';
        const quanti = l.bancali.filter((b) => b.udc_id).length;
        return `<tr class="pk-r-lot">
          <td class="c-cod">${this._esc(l.lot_code || '—')}</td>
          <td class="c-desc">${scad ? `scadenza ${this._esc(scad)}` : '<span class="doc-empty">scadenza non indicata</span>'}${
            quanti ? ` · ${quanti} ${quanti === 1 ? 'bancale' : 'bancali'}` : ''}</td>
          <td class="c-qty">${l.colli}</td>
          <td class="c-pcs"></td>
          ${this._packingQta(l.qty_uom, l.uom)}
        </tr>${righeUdc}`;
      }).join('');

      return `<tbody class="pk-gruppo">
        <tr class="pk-r-art">
          ${/* Quanti lotti e quanti bancali stanno SOTTO IL CODICE, non nella
               colonna «Per collo»: quella colonna dice com'e' fatto un collo,
               e un'intestazione che sopra una cella dice una cosa diversa da
               quello che la cella porta e' il modo in cui un foglio comincia
               a non essere creduto. */''}
          <td class="c-cod">${this._esc(a.article_code)}<div class="pk-sub">${
            a.lotti.length} ${a.lotti.length === 1 ? 'lotto' : 'lotti'}${
            bancaliArticolo.size ? ` · ${bancaliArticolo.size} ${bancaliArticolo.size === 1 ? 'bancale' : 'bancali'}` : ''}</div></td>
          <td class="c-desc">${this._esc(a.article_description || '—')}</td>
          <td class="c-qty">${a.colli}</td>
          <td class="c-pcs"></td>
          ${this._packingQta(a.qty_uom, a.uom)}
        </tr>
        ${righeLotto}
      </tbody>`;
    }).join('');

    return `<table class="ddt-table ddt-table--pk">
      <thead><tr>
        <th class="c-cod">Articolo · lotto · bancale</th>
        <th class="c-desc">Descrizione, scadenza, supporto</th>
        <th class="c-qty">Colli</th>
        <th class="c-pcs">Per collo</th>
        <th class="c-num">Quantità</th>
        <th class="c-uom">Unità</th>
      </tr></thead>
      ${corpo}
    </table>`;
  },

  /* ═══ 2.24 · IL FOGLIO SI SEPARA DALLA STAMPA ══════════════════════════

     Erano una cosa sola: `_printDDT` leggeva il documento dallo Store,
     componeva il foglio e chiamava `window.print`. Il banco a video non
     riusciva a misurare altro che i documenti gia' a database — nella copia
     di prova sono da UNA riga — e il caso che rompe un documento e' l'altro:
     quello che non sta in una pagina. La 2.23 e' passata verde su un foglio
     che non aveva niente da impaginare.

     Adesso il foglio e' una funzione del documento, e la stampa e' il gesto:
     chi prova passa un carico finto e MISURA quello che uscirebbe, senza
     scrivere niente a database. Il documento resta l'unica sorgente — nessuna
     seconda copia del markup — e le letture che restano allo Store, i modelli
     d'imballo e gli avvisi d'articolo, non trovando niente lasciano la cella
     vuota, che e' quel che fanno anche in produzione su un dato mancante. */
  _packingFoglioHTML(doc: DocumentoUscita): string {
    const blocchi = this._packingBlocchi(doc);
    const totaleColli = doc.lines.reduce((n: number, l: RigaDocumento) => n + (l.qty || 0), 0);
    const lordo = this._packingLordo(blocchi);
    const isDraft = doc.status === 'pending';

    return this._docPageHTML({
      kind: 'PACKING LIST',
      kindSub: `Distinta di imballo — allegata al DDT ${doc.ddt_num || ''}`,
      num: doc.ddt_num,
      dateVal: doc.doc_date ? this._dateISOtoIT(doc.doc_date) : new Date(doc.created_at).toLocaleDateString('it-IT'),
      sender: (doc.sender && doc.sender.name) ? doc.sender : null,
      docId: doc.doc_id,
      watermark: isDraft ? 'BOZZA' : '',
      flow: true,
      footNote: `${doc.lines.length} ${doc.lines.length === 1 ? 'riga' : 'righe'} in totale`,
      headExtra: `<div class="ddt-strip">
        <span class="ddt-strip-lbl">Destinatario</span>
        <span class="ddt-strip-val">${this._esc(doc.destination || '—')}</span>
        ${doc.ship_to ? `<span class="ddt-strip-ref">Destinazione: <strong>${this._esc(doc.ship_to)}</strong></span>` : ''}
      </div>`,
      body: `
        ${this._docWarnHTML()}
        ${isDraft ? `<div class="doc-draft-note">
          DOCUMENTO NON ANCORA EVASO — la merce è prenotata ma non è uscita dal magazzino.
        </div>` : ''}
        ${this._packingDistintaHTML(doc)}
        <div class="ddt-totals">
          ${this._docCell('Bancali', String((blocchi as PackingBlocco[]).filter((b: PackingBlocco) => b.udc_id).length))}
          ${this._docCell('Numero colli', String(totaleColli))}
          ${this._docCell('Quantità totale', this._ddtTotaliUom(doc.lines))}
          ${this._docCell('Peso lordo calcolato (kg)', lordo == null ? '' : String(lordo))}
        </div>
        <div class="doc-note-small">
          Supporti e tare sono quelli configurati <strong>alla stampa</strong>; il peso lordo è
          calcolato sommando le tare dei bancali al peso netto, e resta vuoto dove le unità di
          misura non si sommano.
        </div>`,
      /* Le firme sono OGGETTI, non coppie: `_docPageHTML` legge `role` e
         `hint`, e le tre etichette uscivano vuote da quando il foglio esiste
         — nessun errore, nessun tipo che si lamenta. */
      signs: [
        { role: 'Preparato da', hint: doc.operator || '' },
        { role: 'Verificato da', hint: 'Data e firma' },
        { role: 'Ricevuto da', hint: 'Data e firma' },
      ],
    });
  },

  /** Il gesto: legge il documento, compone il foglio, stampa. Il documento
      di una packing list si rilegge anche dall'archivio — si ristampa a
      distanza di mesi — mentre il DDT si stampa da pendente. */
  _printPackingList(doc_id) {
    const doc = Store.getPendingDoc(doc_id) || Store.getAllOutbound().find((d) => d.doc_id === doc_id);
    if (!doc) return this.toast('Documento non trovato', 'error');
    Feedback.clear();
    this._docPrint(this._packingFoglioHTML(doc));
  },

  _ddtFoglioHTML(doc: DocumentoUscita): string {
    const isRet = this._docIsReturn(doc);
    const causale = this._docCausaleLabel(doc);
    const isDraft = doc.status === 'pending';
    const totalColli = doc.lines.reduce((s, l) => s + (l.qty || 1), 0);

    const fmtDate = (iso: string | null | undefined) => iso
      ? new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '—';
    const fmtTs = (ms: number | null | undefined) => ms
      ? new Date(ms).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';

    const pesoNetto = doc.peso_netto || '';
    const pesoLordo = doc.peso_lordo || '';
    const totaliUom = this._ddtTotaliUom(doc.lines);

    // Mittente congelato nel documento, altrimenti quello corrente
    const sender = (doc.sender && doc.sender.name) ? doc.sender : null;
    const s = sender || Store.getDocConfig().sender;
    const senderLoc = [s.address, [s.zip, s.city, s.province ? `(${s.province})` : ''].filter(Boolean).join(' ')]
      .filter(Boolean).join(' — ');
    const partenza = s.warehouse_address || senderLoc;

    const destLoc = [
      doc.dest_address,
      [doc.dest_zip, doc.dest_city, doc.dest_province ? `(${doc.dest_province})` : ''].filter(Boolean).join(' ')
    ].filter(Boolean).join(' — ');

    /* 2.21 — SUL DDT UNA RIGA E' UN ARTICOLO E UN LOTTO. Tre bancali dello
       stesso lotto sono tre righe salvate — l'evasione scarica da tre vani,
       e la packing list li elenca uno per uno — ma una riga sola in bolla:
       chi riceve controlla quanto di quel lotto e' arrivato, e sommare a
       mano in banchina e' il modo di sbagliare. Il raggruppamento sta in
       `modules/documenti.ts`, che e' dove una riga di documento si compone. */
    const partite = raggruppaPerPartita(doc.lines) as PartitaStampata[];

    /* 2.24 — SEI COLONNE, E SONO QUELLE CHE SI CERCANO IN BANCHINA. Il DDT
       dice cosa c'e' sul camion: articolo, lotto, scadenza, quanto. Erano
       otto, e due rubavano lo spazio alle quattro:

         · IL NUMERO DI RIGA — nessuna norma lo chiede, e chi controlla non
           cerca «la riga 4»: cerca un lotto.
         · LE NOTE in colonna — 24 mm per un testo libero significa una
           parola per riga, e alzano la riga di tutte le altre colonne.
           Scendono SOTTO la descrizione, dove hanno la larghezza del foglio.

       La quantita' e la sua unita' stanno in DUE celle: incollate, l'unita'
       si legge una riga per volta; separate, la colonna delle unita' si
       legge in verticale e si vede subito che un DDT porta chili e pezzi
       insieme. */
    const rows = partite.map((p) => {
      /* 1.8.4 — LA QUANTITA' DELLA RIGA E' QUELLA DEI COLLI CHE ESCONO, non
         un prodotto sull'anagrafica: `pieces_per_pack × colli` e' falso
         appena la riga porta colli di misura diversa, ed e' quel che questa
         colonna stampava. Un documento scritto prima della 1.8.4 le UM non
         le porta, e allora la cella resta vuota: un documento si rilegge,
         non si ricostruisce. */
      const misurata = p.qty_uom != null && p.uom;
      const sotto = [
        p.notes || '',
        p.bancali.length > 1 ? `${p.bancali.length} bancali` : '',
      ].filter(Boolean).join(' · ');
      return `<tr>
        <td class="c-art">${this._esc(p.article_code)}</td>
        <td class="c-desc">${this._esc(p.article_description || '—')}${this._avvisiRigaStampa(p.article_code)}${
          sotto ? `<div class="ddt-sub">${this._esc(sotto)}</div>` : ''}</td>
        <td class="c-lot">${this._esc(p.lot_code)}</td>
        <td class="c-exp">${this._esc(this._dateISOtoIT(p.expiry_date) || p.expiry_date || '—')}</td>
        <td class="c-qty">${p.qty}</td>
        <td class="c-num">${misurata ? this._esc(formattaQuantita(p.qty_uom as number, p.uom)) : '—'}</td>
        <td class="c-uom">${misurata ? this._esc(p.uom) : ''}</td>
      </tr>`;
    }).join('');

    // Il mittente e i suoi campi li compone la testata condivisa.
    return this._docPageHTML({
      kind: 'DOCUMENTO DI TRASPORTO',
      kindSub: `D.P.R. 472/96 — ${isRet ? 'Reso · uscita merce' : 'Uscita merce'}`,
      num: doc.ddt_num,
      dateVal: fmtDate(doc.doc_date) === '—' ? fmtTs(doc.created_at) : fmtDate(doc.doc_date),
      sender,
      docId: doc.doc_id,
      /* `doc-page--ddt` e' uscita di qui nella 2.24: era una classe senza una
         sola regola in tutto il foglio di stile, dal giorno che e' nata. */
      watermark: isDraft ? 'BOZZA' : '',
      /* 2.24 — IL DDT SCORRE. Restava a pagina sola per scelta — accompagna
         il trasporto — ma niente faceva rispettare la scelta: un documento
         con molte partite usciva lo stesso su due fogli, e il secondo
         arrivava SENZA testata, senza il numero del DDT e a filo carta,
         perche' il margine era la padding del contenitore e vale una volta
         sola. Un foglio cosi' non dice nemmeno di che documento e' la
         seconda meta'. Adesso testata e piede tornano su ogni pagina —
         `thead` e `tfoot`, gli stessi due gruppi della packing list — e le
         firme restano in coda, una volta sola. */
      flow: true,
      footNote: `${partite.length} ${partite.length === 1 ? 'riga' : 'righe'} in totale`,

      /* Blocco d'identificazione: le parti e la causale. E' cio' che sul
         DDT occupa il residuo della fascia di testata. */
      headExtra: `
        <div class="ddt-parties">
          <div class="ddt-box">
            <div class="ddt-box-lbl">Destinatario</div>
            <div class="ddt-box-name">${this._esc(doc.destination || '—')}</div>
            <div class="ddt-box-row">${destLoc ? this._esc(destLoc) : '<span class="doc-empty">indirizzo non indicato</span>'}</div>
            <div class="ddt-box-vat">${doc.dest_vat ? 'P. IVA / C.F. ' + this._esc(doc.dest_vat) : '<span class="doc-empty">P. IVA non indicata</span>'}</div>
          </div>
          <div class="ddt-box">
            <div class="ddt-box-lbl">Luogo di destinazione della merce</div>
            <div class="ddt-box-row font-semibold">${doc.ship_to ? this._esc(doc.ship_to) : 'Come destinatario'}</div>
            <div class="ddt-box-foot"><strong>Partenza:</strong> ${this._esc(partenza || '—')}</div>
          </div>
        </div>
        <div class="ddt-strip">
          <span class="ddt-strip-lbl">Causale del trasporto</span>
          <span class="ddt-strip-val">${this._esc(causale)}</span>
          ${doc.order_ref ? `<span class="ddt-strip-ref">Rif. ordine: <strong>${this._esc(doc.order_ref)}</strong></span>` : ''}
        </div>`,

      body: `
        ${this._docWarnHTML()}

        ${isDraft ? `<div class="doc-draft-note">
          DOCUMENTO NON ANCORA EVASO — la merce è prenotata ma non è uscita dal magazzino.
          Questo foglio non accompagna il trasporto finché il DDT non viene evaso.
        </div>` : ''}

        <table class="ddt-table">
          <thead><tr>
            <th class="c-art">Articolo</th>
            <th class="c-desc">Natura e qualità dei beni</th>
            <th class="c-lot">Lotto</th>
            <th class="c-exp">Scadenza</th>
            <th class="c-qty">Colli</th>
            <th class="c-num">Quantità</th>
            <th class="c-uom">Unità</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <!-- 2.27 — QUI STAVA UN doc-fill, ED ERA UNA MOLLA CHE NON MOLLAVA.
             .doc-fill e' flex: 1 1 auto — spinge in fondo solo dentro una
             colonna flex, e il corpo di un documento che scorre e' display:
             block. Restava un separatore da 4 mm travestito da molla, e il
             separatore adesso e' dichiarato: margin-top su .ddt-totals.
             La regola .doc-fill resta, perche' i tre documenti a pagina sola
             la usano davvero, e li' spinge sul serio. -->

        <!-- Riepilogo su tre righe da sei unita'. L'ordine NON e' estetico:
             le voci con etichetta corta stanno nelle celle strette, quelle
             con etichetta lunga prendono due unita'. Una cella troppo
             stretta manda a capo l'etichetta E il valore, e alza l'intera
             riga della griglia. -->
        <div class="ddt-totals">
          ${this._docCell('Numero colli', String(totalColli))}
          ${this._docCell('Quantità totale', totaliUom)}
          ${this._docCell('Peso netto (kg)', pesoNetto)}
          ${this._docCell('Peso lordo (kg)', pesoLordo)}
          ${this._docCell('Porto', doc.porto)}
          ${this._docCell('Ritiro previsto', doc.expected_pickup_date ? fmtDate(doc.expected_pickup_date) : '')}

          ${this._docCell('Aspetto esteriore dei beni', doc.aspetto, 'doc-cell--wide')}
          ${this._docCell('Vettore', doc.carrier, 'doc-cell--wide')}
          ${this._docCell('Trasporto a cura di', doc.transport_by, 'doc-cell--wide')}

          ${this._docCell('Data e ora inizio trasporto', doc.start_transport, 'doc-cell--wide')}
          <div class="doc-cell doc-cell--rest">
            <div class="doc-cell-lbl">Annotazioni</div>
            <div class="ddt-notes-val">${doc.doc_notes ? this._esc(doc.doc_notes) : ''}</div>
          </div>
        </div>`,

      signs: [
        { role: 'Firma del mittente',     hint: doc.operator || '' },
        { role: 'Firma del vettore',      hint: 'Data e ora del ritiro' },
        { role: 'Firma del destinatario', hint: 'Data e ora della consegna' }
      ]
    });
  },

  _printDDT(doc_id) {
    const doc = Store.getPendingDoc(doc_id);
    if (!doc) return this.toast('Documento non trovato', 'error');
    Feedback.clear();   // v1.1.0 [N1] — vedi _docPrint: niente riscontri sopra il foglio
    this._docPrint(this._ddtFoglioHTML(doc));
  },
} satisfies Vista;
