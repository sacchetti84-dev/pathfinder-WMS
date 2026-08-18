import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { pickupAlertStatus } from '../../modules/pickupAlert';
import {
  normalizzaNome as normalizzaNomeRcp, destinazionePredefinita, descriviDestinazione,
} from '../../modules/destinatari';
import { Dialog } from '../dialog.js';
import { Feedback } from '../feedback.js';

export const VistaSpedizioni: Vista = {
  _formSpedizioni(el) {
    /* IL DDT SI EVADE ANCHE DA FUORI MOVIMENTA — dal riquadro in Dashboard, e
       dalla 1.4.2.1 anche dalla coda delle attività. Là dentro `movFormArea`
       non esiste, e la maschera si ridisegnava su `null`: la merce era già
       uscita e il compito già chiuso, ma l'ultima riga della funzione moriva
       e l'errore usciva in console senza che niente lo raccogliesse. Chi non
       ha un posto dove disegnare non disegna. */
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

    const w = this._shipComputeWeights();

    el.innerHTML = `<div class="mov-form-card">
      <h3>🚚 <span class="text-sx-orange">Spedizioni</span> — Documenti di trasporto in uscita</h3>
      <div class="wf-instructions">
        <strong>Flusso 2-stati:</strong>
        <span class="wf-step">① REGISTRA DDT</span> (testata + righe → DDT pendente, merce ancora in giacenza) →
        <span class="wf-step">② attesa ritiro vettore</span> →
        <span class="wf-step">③ EVADI DDT</span> (scarico giacenza, pratica chiusa).
        La <strong>causale</strong> distingue una spedizione da un reso.
      </div>

      ${gaps.length ? `<div class="mov-preview mov-preview-err mb-6">
        ⚠ <strong>Mittente incompleto</strong> — manca: ${this._esc(gaps.join(', '))}.
        I DDT si stampano lo stesso, ma con l'avviso che il documento non è conforme.
        <button class="btn btn-sm ml-4" onclick="App._configTab='docs';App.switchView('config')">Configura ora</button>
      </div>` : ''}

      <!-- ═════ LISTA DDT PENDENTI ═════ -->
      <div class="mb-8">
        <div class="flex justify-between items-center mb-3">
          <strong class="text-body-small text-sx-orange">📋 DDT Pendenti <span class="badge badge-orange">${pending.length}</span></strong>
        </div>
        ${this._renderPendingDdtList(pending)}
      </div>

      <!-- ═════ COMPOSIZIONE NUOVO DDT ═════ -->
      <details class="mt-8" ${cart.length ? 'open' : ''}>
        <summary class="cursor-pointer text-body-medium font-bold text-sx-primary py-4 px-5 bg-[var(--grad-soft-orange)] border border-sx-orange rounded-[var(--radius)]">
          ➕ Componi Nuovo DDT ${cart.length ? `<span class="badge badge-orange">${cart.length} righe in bozza</span>` : ''}
        </summary>
        <div class="border border-sx-border [border-top:none] rounded-b-[var(--radius-md)] p-6 bg-sx-card-alt">
          ${datalist}

          <!-- ── TESTATA: documento ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">📋 Documento</div>
            <div class="form-row mb-4">
              <div class="form-group">
                <label>Causale del trasporto <span class="req">*</span></label>
                <select class="select" id="pShipCausale" onchange="App._persistShipHeader()">${causaliOpts}</select>
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
          </div>

          <!-- ── TESTATA: destinatario ── -->
          <div class="ddt-block">
            <div class="ddt-block-lbl">🏢 Destinatario</div>
            <div class="form-row mb-4">
              <div class="form-group">
                <label>Denominazione <span class="req">*</span></label>
                <input class="input" id="pShipCustomer" list="shipRecipients" placeholder="Ragione sociale del destinatario" maxlength="120"
                  value="${this._esc(this._shipCustomer)}" onchange="App._shipRecipientPicked()">
                <div class="text-label-small text-sx-text-muted mt-1.5">💡 Un destinatario già usato porta con sé indirizzo e P. IVA.</div>
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
            <div class="ddt-block-lbl">🚛 Trasporto</div>
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
                <label>📅 Data ritiro prevista <span class="text-label-small text-sx-text-muted font-normal">(per gli alert)</span></label>
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
            <div class="ddt-block-lbl">⚖ Pesi <span class="font-normal normal-case tracking-[0]">— calcolati dall'anagrafica, correggibili a mano</span></div>
            <div class="form-row mb-0">
              <div class="form-group">
                <label>Peso netto (kg)</label>
                <input class="input input-mono" id="pShipPesoNetto" inputmode="decimal" maxlength="12"
                  placeholder="${w.net != null ? this._fmtKg(w.net) : 'non calcolabile'}"
                  value="${this._esc(this._shipPesoNetto)}" onchange="App._persistShipHeader()">
              </div>
              <div class="form-group">
                <label>Peso lordo (kg)</label>
                <input class="input input-mono" id="pShipPesoLordo" inputmode="decimal" maxlength="12"
                  placeholder="netto + tara imballi"
                  value="${this._esc(this._shipPesoLordo)}" onchange="App._persistShipHeader()">
              </div>
            </div>
            <div class="text-label-small text-sx-text-muted mt-3">
              ${w.missing.length
                ? `⚠ Peso non censito in anagrafica per: <strong>${this._esc(w.missing.slice(0, 4).join(', '))}${w.missing.length > 4 ? ` e altri ${w.missing.length - 4}` : ''}</strong> — il netto va scritto a mano.`
                : (w.net != null
                    ? `Netto calcolato sulle righe in carrello: <strong>${this._fmtKg(w.net)} kg</strong>${w.pieces != null ? ` · ${w.pieces} pz` : ''}. Lasciando il campo vuoto va sul DDT questo valore.`
                    : 'Aggiungi righe al carrello per il calcolo automatico.')}
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
            <div class="flex gap-4 mb-4 items-end">
              <div class="form-group w-[130px]"><label>Colli <span class="req">*</span></label><input class="input input-mono text-center font-bold" id="pShipQty" type="number" min="1" step="1" value="1"
                onkeydown="if(event.key==='Enter'){event.preventDefault();App._shipAddToCart();}"></div>
              <div class="text-label-small text-sx-text-muted pb-4">Disponibili (esclusi pendenti): <strong class="text-sx-orange" id="pShipAvail">—</strong> Coll.</div>
            </div>
            <div class="form-group mb-5">
              <label>Note riga (opz.)</label>
              <input class="input" id="pShipNotes" maxlength="${Validate.MAX.NOTES}" placeholder="Es: riferimento riga d'ordine">
            </div>
            <button class="btn w-full bg-sx-orange text-white border-sx-orange p-5 font-bold" onclick="App._shipAddToCart()">+ AGGIUNGI AL CARRELLO</button>
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
      </details>
      <div class="mt-6"><button class="btn" onclick="App.cancelMov()">✕ Chiudi</button></div>
    </div>`;
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
    const fill = (id: any, val: any) => {
      const e = $(id);
      if (e && !e.value.trim() && val) e.value = val;
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
  _shipMostraDestinazioni(rcp) {
    $('destPickOverlay')?.remove();
    const righe = (rcp.destinations || []).map((d: any, i: any) => `
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
    const set = (id: any, val: any) => { const e = $(id); if (e) e.value = val || ''; };
    set('pShipDestAddress', d.address);
    set('pShipDestZip', d.zip);
    set('pShipDestCity', d.city);
    set('pShipDestProvince', d.province);
    this._persistShipHeader();
    this.toast(`Destinazione: ${descriviDestinazione(d)}`, 'success');
  },

  _shipComputeWeights(lines = null) {
    const rows = lines || this._shipCart;
    if (!rows.length) return { net: null, pieces: null, missing: [] };
    let net = 0, pieces = 0, anyPieces = false;
    const missing: any[] = [];
    for (const r of rows) {
      const a = Store.getArticle(r.article_code);
      const wu = a && Number(a.weight_net_kg) > 0 ? Number(a.weight_net_kg) : null;
      if (wu === null) { if (!missing.includes(r.article_code)) missing.push(r.article_code); }
      else net += wu * (r.qty || 0);
      const pp = a && Number(a.pieces_per_pack) > 0 ? Number(a.pieces_per_pack) : null;
      if (pp !== null) { pieces += pp * (r.qty || 0); anyPieces = true; }
    }
    return {
      net: missing.length ? null : Math.round(net * 1000) / 1000,
      pieces: anyPieces ? pieces : null,
      missing
    };
  },

  /* Lista dei DDT pendenti, tutti, ordinati per urgenza di ritiro.
     v2.0.0+ — sort by alert priority (overdue/today/tomorrow/soon/ok/none) */
  _renderPendingDdtList(pending) {
    if (!pending.length) {
      return `<div class="py-5 px-7 bg-sx-card-alt [border:1px_dashed_var(--sx-border)] rounded-[var(--radius)] text-body-small text-sx-text-muted text-center">Nessun DDT pendente — componine uno nuovo qui sotto</div>`;
    }
    const sorted = pending.slice().sort((a: any, b: any) => {
      const sa = pickupAlertStatus(a).sortKey;
      const sb = pickupAlertStatus(b).sortKey;
      if (sa !== sb) return sa - sb;
      return b.created_at - a.created_at;  // a parità → più recente in alto
    });
    return sorted.map((d: any) => this._renderPendingDocCard(d)).join('');
  },

  _renderPendingDocCard(doc) {
    const isRet = this._docIsReturn(doc);
    const themeColor = isRet ? 'var(--sx-teal)' : 'var(--sx-orange)';
    const themeBg = isRet ? 'var(--grad-soft-teal)' : 'var(--grad-soft-orange)';
    const themeBadge = isRet ? 'badge-teal' : 'badge-orange';
    const causale = this._docCausaleLabel(doc);
    const totalColli = doc.lines.reduce((s: any, l: any) => s + (l.qty || 1), 0);
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
      ? `<span class="badge" class="bg-sx-card-alt text-sx-text-muted [border:1px_dashed_var(--sx-border-strong)] text-label-small">📅 da definire</span>`
      : `<span class="badge" style="background:${alert.bg};color:${alert.color};border-color:${alert.color};font-size: var(--md-sys-typescale-label-small-size);font-weight:700">📅 ${this._esc(alert.shortLabel)}</span>`;
    /* v2.0.1 [A-3] — Controllo di integrità delegato a Store.checkPendingDocIntegrity. */
    const integrity = Store.checkPendingDocIntegrity(doc);
    const warnings = integrity.issues.length;
    const issueByLine = new Map(integrity.issues.map(x => [x.lineIndex, x]));
    const warnBadge = warnings > 0 ? `<span class="badge bg-sx-danger-soft text-sx-danger border-sx-danger ml-3" title="${warnings} riga/e non allineata/e alla giacenza attuale">⚠ ${warnings}</span>` : '';
    const linesHtml = doc.lines.map((l: any, i: any) => {
      const issue = issueByLine.get(i);
      const rowStyle = issue ? 'background:var(--sx-danger-soft);' : '';
      const issueHtml = issue
        ? `<div class="text-label-small text-sx-danger pt-1.5 pr-0 pb-2.5 pl-10">⚠ ${this._esc(issue.message)}</div>`
        : '';
      return `<div style="${rowStyle}font-size: var(--md-sys-typescale-label-small-size);padding:0.2rem 0;border-bottom:1px dashed var(--sx-border)">
      <div class="flex justify-between gap-4">
        <span><span class="text-sx-text-muted">${i+1}.</span> <strong>${this._esc(l.article_code)}</strong> · L:${this._esc(l.lot_code)} · 📍${this._esc(l.location_code!)}${l.notes ? ' · <em>' + this._esc(l.notes) + '</em>' : ''}</span>
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
        ${alert.level !== 'none' ? `<div style="background:${alert.bg};color:${alert.color};font-weight:700;font-size: var(--md-sys-typescale-body-small-size);padding:0.35rem 0.55rem;border-radius:var(--radius);margin-bottom:0.4rem;border:1px solid ${alert.color}">${this._esc(alert.label)}</div>` : `<div class="bg-sx-card-alt text-sx-text-muted text-label-small py-3 px-5 rounded-[var(--radius)] mb-4 [border:1px_dashed_var(--sx-border-strong)]">📅 Ritiro non datato — nessun alert su questo DDT</div>`}
        <div class="mb-5">${linesHtml}</div>
        ${warnings > 0 ? `<div class="bg-sx-danger-soft text-sx-danger text-label-small py-4 px-5.5 rounded-[var(--radius)] mb-4 border border-sx-danger">
          <strong>⚠ ${warnings} riga/e NON ALLINEATA/E alla giacenza attuale.</strong><br>
          Il documento non è evadibile così com'è: usare <strong>📝 Modifica</strong> per riallinearlo, oppure <strong>✕</strong> per annullarlo e rifarlo.
        </div>` : ''}
        <div class="flex gap-4 flex-wrap">
          <button class="btn" style="flex:1;min-width:120px;padding:0.5rem;font-weight:700;background:${themeColor};color:#fff;border-color:${themeColor}" onclick="App._evadiSpedizione('${this._esc(doc.doc_id)}')">✓ EVADI DDT</button>
          <button class="btn bg-sx-accent-soft text-sx-accent border-sx-accent font-semibold" onclick="App._editPendingDoc('${this._esc(doc.doc_id)}')" title="Modifica DDT">📝 Modifica</button>
          <button class="btn" onclick="App._printDDT('${this._esc(doc.doc_id)}')" title="Stampa il DDT">🖨</button>
          <button class="btn btn-ghost text-sx-danger" onclick="App._cancelPendingShip('${this._esc(doc.doc_id)}')" title="Annulla DDT">✕</button>
        </div>
      </div>
    </details>`;
  },

  _shipLookup() {
    const art = Validate.clean($('pShipArt')?.value, true);
    const lot = Validate.clean($('pShipLot')?.value);
    const info = $('pShipInfo');
    const details = $('pShipDetails');
    if (!art) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">✗ Scansiona prima il codice articolo</div>`; $('pShipArt')?.focus(); return; }
    if (!lot) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">✗ Scansiona il codice lotto</div>`; $('pShipLot')?.focus(); return; }
    const artErr = Validate.article(art);
    if (artErr) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">✗ ${this._esc(artErr)}</div>`; details.classList.add('hidden'); return; }
    const lotErr = Validate.lot(lot);
    if (lotErr) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">✗ ${this._esc(lotErr)}</div>`; details.classList.add('hidden'); return; }
    const allItems = Store.findItemLocations(art);
    const matched = allItems.filter(it => it.lot_code === lot);
    if (!matched.length) { info.innerHTML = `<div class="text-body-small text-sx-danger mt-2">✗ Item ${this._esc(art)}#${this._esc(lot)} non trovato in magazzino</div>`; details.classList.add('hidden'); return; }
    const notQuar = matched.filter(it => !Store.isItemQuarantined(it.item_key, it.location_code));
    if (!notQuar.length) { info.innerHTML = `<div class="text-body-small text-sx-purple mt-2">⚠ L'item ${this._esc(art)}#${this._esc(lot)} è in quarantena in tutte le ubicazioni in cui si trova</div>`; details.classList.add('hidden'); return; }
    const inCartByKey = {};
    for (const c of this._shipCart) {
      const k = `${c.location_code}#${c.item_key}`;
      (inCartByKey as any)[k] = ((inCartByKey as any)[k] || 0) + c.qty;
    }
    const enriched = notQuar.map(it => {
      const totalQty = it.qty || 1;
      const pendingQty = Store.getPendingQtyForItem(it.location_code, it.item_key);
      const cartQty = (inCartByKey as any)[`${it.location_code}#${it.item_key}`] || 0;
      const availableQty = Math.max(0, totalQty - pendingQty - cartQty);
      return { ...it, _totalQty: totalQty, _pendingQty: pendingQty, _availableQty: availableQty };
    });
    const usable = enriched.filter(it => it._availableQty > 0);
    if (!usable.length) { info.innerHTML = `<div class="text-body-small text-sx-warning mt-2">⚠ Tutta la giacenza di ${this._esc(art)}#${this._esc(lot)} è impegnata</div>`; details.classList.add('hidden'); return; }
    if (usable.length === 1) { this._shipSelectItem(usable[0]); return; }
    let html = '<div class="max-h-[200px] overflow-y-auto mt-3"><div class="text-label-small text-sx-text-muted mb-3">Item presente in più ubicazioni — seleziona da quale prelevare:</div>';
    for (const it of usable) {
      const p = App._payload(it);
      const pendBadge = it._pendingQty > 0 ? ` <span class="badge badge-amber">${it._pendingQty} prenotati</span>` : '';
      html += `<div class="inv-item-row cursor-pointer" onclick="App._shipSelectEnc('${p}')">
        <div class="inv-info">
          <div class="inv-code text-sx-orange">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal text-body-small">${this._esc(it.article_description || '')}</span></div>
          <div class="inv-lot">L:${this._esc(it.lot_code)} · 📍 ${this._esc(it.location_code)} · <strong>${it._availableQty}/${it._totalQty} Coll.</strong>${pendBadge}${it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : ''}</div>
        </div>
        <span class="text-sx-orange text-body-small">🚚 Seleziona</span>
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
      .filter((c: any) => c.location_code === item.location_code && c.item_key === item.item_key)
      .reduce((s: any, c: any) => s + c.qty, 0);
    const availableQty = Math.max(0, totalQty - pendingQty - cartQty);
    if (availableQty <= 0) {
      $('pShipInfo').innerHTML = `<div class="text-body-small text-sx-warning mt-2">⚠ Giacenza tutta impegnata</div>`;
      return;
    }
    this._shipState = { item: full, availableQty, totalQty, pendingQty };
    const expBadge = full.expiry_date ? ` · scad. ${this._esc(full.expiry_date)}` : '';
    const pendBadge = pendingQty > 0 ? ` · <span class="text-sx-warning">${pendingQty} prenotati</span>` : '';
    $('pShipInfo').innerHTML = '';
    $('pShipItemPreview').innerHTML = `<div class="mov-preview bg-[var(--grad-soft-orange)] border-sx-orange mb-4">
      <strong class="text-sx-orange">${this._esc(full.article_code)}</strong>
      <span class="text-sx-text-muted">${this._esc(full.article_description || '')}</span><br>
      <span class="text-body-small text-sx-text-muted">Lotto: <strong>${this._esc(full.lot_code)}</strong> · Ubic: <strong class="mono">${this._esc(full.location_code)}</strong> · Disp. effettiva: <strong class="text-sx-orange">${availableQty} Coll.</strong> (tot. ${totalQty}${pendBadge})${expBadge}</span>
    </div>`;
    const qe = $('pShipQty');
    if (qe) { qe.value = availableQty; qe.max = availableQty; }
    const av = $('pShipAvail'); if (av) av.textContent = availableQty;
    const notesEl = $('pShipNotes'); if (notesEl) notesEl.value = '';
    $('pShipDetails').classList.remove('hidden');
    qe?.focus();
    qe?.select();
  },

  _shipAddToCart() {
    if (!this._shipState?.item) return this.toast('Identifica prima un item in giacenza', 'error');
    const item = this._shipState.item;
    const availableQty = this._shipState.availableQty;
    const notes = Validate.clean($('pShipNotes')?.value);
    const qtyRaw = $('pShipQty')?.value;
    const qty = parseInt(qtyRaw);
    if (!qty || qty < 1) return this.toast('Numero di colli non valido', 'error');
    if (qty > availableQty) return this.toast(`Qty richiesta (${qty}) supera disponibilità (${availableQty})`, 'error');
    if (Validate.notes(notes)) return this.toast(Validate.notes(notes), 'error');
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
      notes
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

  _persistShipHeader() {
    const g = (id: any) => Validate.clean($(id)?.value);
    const sel = (id: any) => $(id)?.value;

    if ($('pShipCausale')) this._shipCausale = sel('pShipCausale') || this._shipCausale;
    this._shipDdtNum = g('pShipDdt') || this._shipDdtNum;
    this._shipOrderRef = $('pShipOrderRef') ? g('pShipOrderRef') : this._shipOrderRef;
    this._shipCustomer = g('pShipCustomer') || this._shipCustomer;

    /* Questi campi possono essere legittimamente SVUOTATI (un indirizzo
       ripreso per sbaglio va potuto cancellare), quindi niente `||`. */
    const opt = (id: any, cur: any) => $(id) ? g(id) : cur;
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
    const totalColli = this._shipCart.reduce((s: any, r: any) => s + (r.qty || 0), 0);
    const w = this._shipComputeWeights();
    const wLabel = w.net != null ? ` <span class="dlg-chip">${this._fmtKg(w.net)} kg</span>` : '';
    return `<div class="flex justify-between items-center mt-7 mx-0 mb-3.5">
        <strong class="text-body-medium">🛒 Carrello Bozza <span class="text-sx-orange">(${n})</span>${n ? ` <span class="dlg-chip">${totalColli} Coll.</span>${wLabel}` : ''}</strong>
        ${n ? '<button class="btn btn-sm btn-ghost" onclick="App._shipClearCart()">Svuota</button>' : ''}
      </div>
      <div class="pick-cart">${this._renderShipCart()}</div>
      ${n ? `<button class="btn w-full mt-6 font-extrabold min-h-[var(--md-touch)] bg-sx-orange text-white border-sx-orange" onclick="App._saveShipPending()">📥 REGISTRA DDT PENDENTE (${n} righe)</button>` : ''}`;
  },

  _updateShipCart() {
    const zone = $('shipCartZone');
    if (zone) zone.innerHTML = this._shipCartZoneHTML();
    else this._formSpedizioni($('movFormArea'));   // ripiego
  },

  _renderShipCart() {
    if (!this._shipCart.length) return '<div class="pick-cart-empty">Carrello vuoto — scansiona articolo e lotto, identifica in giacenza, poi aggiungi</div>';
    return this._shipCart.map((it: any, i: any) => {
      const expBadge = it.expiry_date ? ` · scad. ${this._esc(it.expiry_date)}` : '';
      const notesBadge = it.notes ? ` · <span class="text-sx-text-muted italic">${this._esc(it.notes)}</span>` : '';
      const partial = it.qty < (it.qty_at_creation || it.qty) ? ` <span class="badge badge-amber ml-2">PARZIALE</span>` : '';
      return `<div class="pick-cart-item border-l-[3px] border-l-sx-orange">
        <div class="pci-num bg-sx-orange">${i+1}</div>
        <div class="pci-info">
          <div class="pci-code">${this._esc(it.article_code)} <span class="text-sx-text-muted font-normal text-label-small">${this._esc(it.article_description || '')}</span>${partial}</div>
          <div class="pci-loc">L:${this._esc(it.lot_code)} · 📍 ${this._esc(it.location_code)} · <strong class="text-sx-orange">${it.qty} Coll.</strong>${expBadge}${notesBadge}</div>
        </div>
        <button class="btn btn-sm btn-ghost text-sx-danger" onclick="App._shipRemoveFromCart(${i})">✕</button>
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
      title: '⚠ Numero DDT già usato',
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
      const totalQty = cur.qty || 1;
      const pendingQty = Store.getPendingQtyForItem(it.location_code, it.item_key);
      const otherCart = this._shipCart
        .filter((x: any, j: any) => j !== i && x.location_code === it.location_code && x.item_key === it.item_key)
        .reduce((s: any, x: any) => s + x.qty, 0);
      const avail = totalQty - pendingQty - otherCart;
      if (it.qty > avail) return this.toast(`Riga ${i+1}: qty richiesta (${it.qty}) > disponibilità effettiva (${avail})`, 'error');
    }

    const totalColli = this._shipCart.reduce((s: any, it: any) => s + (it.qty || 1), 0);
    const causale = Store.getCausale(this._shipCausale);
    const w = this._shipComputeWeights();

    // v2.0.0+ — warning se data ritiro è oggi/passata o non specificata
    let dateWarn = '';
    if (this._shipExpectedDate) {
      const status = pickupAlertStatus({ expected_pickup_date: this._shipExpectedDate });
      if (status.level === 'overdue') dateWarn = `\n⚠ Data ritiro nel passato (${status.label})`;
      else if (status.level === 'today') dateWarn = `\n⚠ Data ritiro è OGGI`;
    } else {
      dateWarn = '\n⚠ Data ritiro non specificata (nessun alert sarà attivo)';
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
      confirmLabel: 'Registra DDT', icon: '\u{1F4E5}'
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
        peso_netto: this._shipPesoNetto || (w.net != null ? String(w.net) : ''),
        peso_lordo: this._shipPesoLordo,
        pieces_total: w.pieces,
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
      this.toast(`✓ DDT ${doc.ddt_num} registrato come pendente`, 'success');   // v2.2.1 [F4]
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
      const colliDdt = this._shipCart.reduce((s: any, l: any) => s + (l.qty || 1), 0);
      await this._taskAvanza(colliDdt, ['PICK_SHIP', 'PICK_RET']);
      this._shipResetHeader();
      this._formSpedizioni($('movFormArea'));
    } catch (err: any) {
      this.toast(`Errore salvataggio: ${err.message || 'sconosciuto'}`, 'error');
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
    if (!await Dialog.confirm({
      title: 'Evadere il DDT?',
      message: 'La merce viene SCARICATA fisicamente dalla giacenza. Confermare solo a ritiro avvenuto.',
      details: Dialog.kv([
        ['Causale', causale],
        ['N° DDT', doc.ddt_num],
        ['Destinatario', doc.destination],
        ['Movimento a registro', isRet ? 'Reso' : 'Spedizione'],
        ['Righe', doc.lines.length],
        ['Colli totali', totalColli]
      ]),
      confirmLabel: 'Evadi e scarica', danger: true
    })) return;

    const reasonNotes = `${causale.toUpperCase()} → ${doc.destination}${doc.carrier ? ' (vettore: ' + doc.carrier + ')' : ''}`;
    const performed = [];
    let failedAt = -1, failMsg = '';
    for (let i = 0; i < doc.lines.length; i++) {
      const l = doc.lines[i]!;
      try {
        // Snapshot pre-rimozione per rollback
        const before = Store.getItemsAtLocation(l.location_code!).find(x => x.item_key === l.item_key);
        const backup = before ? { ...before } : null;
        /* 1.8 — anche il DDT esce a colli scelti: quello che sale sul camion
           è merce precisa, e il documento la nomina. */
        const scelteDdt = before ? await this._chiediColli(before, `Quali colli · riga ${i + 1} di ${doc.lines.length}`) : null;
        if (scelteDdt === undefined) { failedAt = i; failMsg = 'Evasione annullata alla scelta dei colli'; break; }
        const removed = await Store.removeItem(l.location_code!, l.item_key as string, l.qty, null, scelteDdt);
        if (!removed) { failedAt = i; failMsg = `Rimozione fallita (riga ${i+1})`; break; }
        performed.push({ backup, mode: removed._mode, location_code: l.location_code!, item_key: l.item_key, qty_removed: l.qty, qty_before: removed._qty_before, qty_after: removed._qty_after, packs_out: removed._packs_out ?? null });
      } catch (err: any) {
        failedAt = i;
        failMsg = `Errore riga ${i+1}: ${err.message || 'sconosciuto'}`;
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
      const _id = await this._logMov(movType, l.article_code, l.article_description, l.lot_code, l.location_code!, null, doc.operator || Store.getCurrentIdentity().initials, itemNotes, doc.ddt_num, p.qty_before, -p.qty_removed, p.qty_after);
      if (typeof _id === 'number') movIds.push(_id);
    }
    // Aggiorna status documento → evaded
    await Store.updatePendingStatus(doc_id, 'evaded');
    /* 1.4.4 — QUI NON SI CHIUDE NIENTE. Il compito di prelievo si è chiuso
       alla registrazione del DDT: l'evasione è il ritiro del vettore, un
       fatto del magazzino che non ha un'attività sua e non ne conclude
       nessuna. Fino alla 1.4.3 la chiusura stava qui, e dipendeva da un
       `task_id` che veniva scritto solo se la sessione dell'operatore era
       ancora viva al salvataggio: bastava uscire da Movimenta e rientrare
       perché il filo si spezzasse e il compito non si chiudesse mai più. */
    this.toast(`✓ DDT ${doc.ddt_num} evaso · ${doc.lines.length} righe · ${totalColli} Coll.`, 'success');
    this.updateSyncIndicator();
    if (await Dialog.confirm({
      title: 'Stampare il DDT?',
      message: 'Il documento esce senza la filigrana di bozza: la merce è uscita.',
      confirmLabel: 'Stampa', cancelLabel: 'Non ora', icon: '\u{1F5A8}'
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
    this.toast(`✓ DDT ${doc.ddt_num} annullato`, 'success');
    this._formSpedizioni($('movFormArea'));
  },

  _printDDT(doc_id) {
    const doc = Store.getPendingDoc(doc_id);
    if (!doc) return this.toast('Documento non trovato', 'error');
    Feedback.clear();   // v1.1.0 [N1] — vedi _docPrint: niente riscontri sopra il foglio

    const isRet = this._docIsReturn(doc);
    const causale = this._docCausaleLabel(doc);
    const isDraft = doc.status === 'pending';
    const totalColli = doc.lines.reduce((s, l) => s + (l.qty || 1), 0);

    const fmtDate = (iso: any) => iso
      ? new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '—';
    const fmtTs = (ms: any) => ms
      ? new Date(ms).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';

    const w = this._shipComputeWeights(doc.lines);
    const pesoNetto = (doc as any).peso_netto || (w.net != null ? this._fmtKg(w.net) : '');
    const pesoLordo = (doc as any).peso_lordo || '';
    const pezzi = (doc as any).pieces_total != null ? (doc as any).pieces_total : w.pieces;

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

    const rows = doc.lines.map((l, i) => {
      const a = Store.getArticle(l.article_code);
      const pp = a && Number(a.pieces_per_pack) > 0 ? Number(a.pieces_per_pack) : null;
      return `<tr>
        <td class="c-idx">${i+1}</td>
        <td class="c-art">${this._esc(l.article_code)}</td>
        <td class="c-desc">${this._esc(l.article_description || '—')}${this._avvisiRigaStampa(l.article_code)}</td>
        <td class="c-lot">${this._esc(l.lot_code)}</td>
        <td class="c-exp">${this._esc(this._dateISOtoIT(l.expiry_date) || l.expiry_date || '—')}</td>
        <td class="c-qty">${l.qty}</td>
        <td class="c-pcs">${pp != null ? pp * l.qty : '—'}</td>
        <td class="c-note">${this._esc(l.notes || '')}</td>
      </tr>`;
    }).join('');

    // Il mittente e i suoi campi li compone la testata condivisa.
    $('printReport').innerHTML = this._docPageHTML({
      kind: 'DOCUMENTO DI TRASPORTO',
      kindSub: `D.P.R. 472/96 — ${isRet ? 'Reso · uscita merce' : 'Uscita merce'}`,
      num: doc.ddt_num,
      dateVal: fmtDate((doc as any).doc_date) === '—' ? fmtTs(doc.created_at) : fmtDate((doc as any).doc_date),
      sender,
      docId: doc.doc_id,
      pageClass: 'doc-page--ddt',
      watermark: isDraft ? 'BOZZA' : '',

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
          ${(doc as any).order_ref ? `<span class="ddt-strip-ref">Rif. ordine: <strong>${this._esc((doc as any).order_ref)}</strong></span>` : ''}
        </div>`,

      body: `
        ${this._docWarnHTML()}

        ${isDraft ? `<div class="doc-draft-note">
          DOCUMENTO NON ANCORA EVASO — la merce è prenotata ma non è uscita dal magazzino.
          Questo foglio non accompagna il trasporto finché il DDT non viene evaso.
        </div>` : ''}

        <table class="ddt-table">
          <thead><tr>
            <th class="c-idx">#</th>
            <th class="c-art">Articolo</th>
            <th class="c-desc">Natura e qualità dei beni</th>
            <th class="c-lot">Lotto</th>
            <th class="c-exp">Scadenza</th>
            <th class="c-qty">Colli</th>
            <th class="c-pcs">Pezzi</th>
            <th class="c-note">Note</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="doc-fill"></div>

        <!-- Riepilogo su tre righe da sei unita'. L'ordine NON e' estetico:
             le voci con etichetta corta stanno nelle celle strette, quelle
             con etichetta lunga prendono due unita'. Una cella troppo
             stretta manda a capo l'etichetta E il valore, e alza l'intera
             riga della griglia. -->
        <div class="ddt-totals">
          ${this._docCell('Numero colli', String(totalColli))}
          ${this._docCell('Pezzi totali', pezzi != null ? String(pezzi) : '')}
          ${this._docCell('Peso netto (kg)', pesoNetto)}
          ${this._docCell('Peso lordo (kg)', pesoLordo)}
          ${this._docCell('Porto', (doc as any).porto)}
          ${this._docCell('Ritiro previsto', doc.expected_pickup_date ? fmtDate(doc.expected_pickup_date) : '')}

          ${this._docCell('Aspetto esteriore dei beni', (doc as any).aspetto, 'doc-cell--wide')}
          ${this._docCell('Vettore', doc.carrier, 'doc-cell--wide')}
          ${this._docCell('Trasporto a cura di', (doc as any).transport_by, 'doc-cell--wide')}

          ${this._docCell('Data e ora inizio trasporto', (doc as any).start_transport, 'doc-cell--wide')}
          <div class="doc-cell doc-cell--rest">
            <div class="doc-cell-lbl">Annotazioni</div>
            <div class="ddt-notes-val">${(doc as any).doc_notes ? this._esc((doc as any).doc_notes) : ''}</div>
          </div>
        </div>`,

      signs: [
        { role: 'Firma del mittente',     hint: doc.operator || '' },
        { role: 'Firma del vettore',      hint: 'Data e ora del ritiro' },
        { role: 'Firma del destinatario', hint: 'Data e ora della consegna' }
      ]
    });
    window.print();
    setTimeout(() => { $('printReport').innerHTML = ''; }, 1500);
  },
};
