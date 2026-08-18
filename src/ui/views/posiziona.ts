import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { ScanGuard } from '../../modules/scanGuard';
import { Dialog } from '../dialog';
import { formattaQuantita, descrivi as descriviColli } from '../../modules/misure';
/* 1.8 - `descriviColli` qui sopra e' la suddivisione CALCOLATA della 1.4.2, e
   questi sono l'elenco DICHIARATO: due cose diverse con un nome che si
   somiglia, e per questo portano alias distinti. */
import {
  espandi as espandiColli, validaDichiarazione, descriviColli as descriviElenco,
  totaleUom as totaleUomElenco, preleva as prelevaElenco,
} from '../../modules/colli';

/* Le due forme che vivono solo dentro questa maschera: la dichiarazione dei
   colli in ingresso — «quanti, e da quanto» — e la finestra che chiede quali
   colli escono, con le scelte parziali segnate per posizione. */
type RigaColliIn = { colli: string; per: string };
type SceltaColli = { elenco: number[]; uom: string; scelte: Map<number, number | boolean> };

/* Il gestore dell'Escape della finestra dei colli. Sta QUI e non dentro
   `App`: la superficie del monolite e' un contratto — 577 nomi, e un
   collaudo che li conta — e un ascoltatore non e' un metodo che qualcuno
   chiama. Ne vive uno per volta, come la finestra. */
let escColli: ((e: KeyboardEvent) => void) | null = null;

export const VistaPosiziona = {
  _formPosiziona(el) {
    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① UBICAZIONE</span> → <span class="wf-step">② ARTICOLO</span> → <span class="wf-step">③ LOTTO</span> → INVIO per confermare. L'ubicazione resta fissa per posizionamenti multipli.
      </div>
      <div class="form-group mb-5">
        <label>① Ubicazione <span class="req">*</span></label>
        <div class="flex gap-3">
          <input class="input input-mono flex-1" id="mInLoc" placeholder="Scansiona ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('mInLoc');App._previewLoc('mInLoc','mInLocPrev')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('mInLoc');App._previewLoc('mInLoc','mInLocPrev');$('mInArtCode').focus();}">
          <button class="btn btn-sm" onclick="App._pickLoc('mInLoc','_cbPickIn')" title="Sfoglia">📍</button>
        </div>
        <div id="mInLocPrev"></div>
      </div>
      <div class="form-group mb-5">
        <label>② Codice Articolo <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="mInArtCode" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
          oninput="App._anteprimaUmIn()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._autoLookupArticle('mInArtCode','mInArtInfo','mInArtDesc');$('mInLot').focus();}">
        <div class="text-label-small text-sx-text-muted mt-1.5" id="mInArtInfo"></div>
      </div>
      <div class="form-group mb-5">
        <label>③ Codice Lotto <span class="req">*</span></label>
        <input class="input input-mono" id="mInLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          oninput="App._anteprimaUmIn()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();$('mInQty').focus();$('mInQty').select();}">
      </div>
      <div class="form-group mb-5">
        <label>④ Colli <span class="req">*</span></label>
        <input class="input input-mono max-w-[120px] text-center font-bold" id="mInQty" type="number" min="1" step="1" value="1"
          oninput="App._colliQtyInput()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._execPosiziona();}">
        <div class="text-label-small text-sx-text-muted mt-1.5">Se il lotto è già in ubicazione, i colli si sommano.</div>
      </div>
      ${this._campoUmIngresso()}
      <details class="mb-5" id="mInDetails">
        <summary class="text-body-small text-sx-text-muted cursor-pointer">▾ Descrizione · Scadenza · Note</summary>
        <div class="pt-4">
          <div class="form-group mb-4"><label>Descrizione</label><input class="input" id="mInArtDesc" maxlength="${Validate.MAX.ARTICLE_DESC}" placeholder="Auto-compilata se articolo noto"></div>
          <div class="flex gap-4">
            <div class="form-group flex-1"><label>Scadenza</label><input class="input" id="mInExp" type="text" inputmode="numeric" placeholder="gg/mm/aaaa" maxlength="10" oninput="App._dateMaskInput(this)" onblur="App._dateMaskBlur(this)"></div>
            <div class="form-group flex-1"><label>Note</label><input class="input" id="mInNotes" maxlength="${Validate.MAX.NOTES}" placeholder="Opzionale"></div>
          </div>
        </div>
      </details>
      <div class="flex gap-4">
        <button class="btn btn-success flex-1 p-5.5 font-bold" onclick="App._execPosiziona()">✓ CONFERMA POSIZIONAMENTO</button>
      </div>
      <div class="mt-4" id="mInFeedback"></div>
      <div class="kbd-hint">
        <span class="kbd">INVIO</span><span class="text-body-small text-sx-text-muted">avanza al campo successivo</span>
        <span class="kbd">ESC</span><span class="text-body-small text-sx-text-muted">chiude il modulo</span>
        <span class="kbd">F9</span><span class="text-body-small text-sx-text-muted">annulla l'ultima operazione</span>
      </div>`;
    this.setPrimaryScanField('mInLoc');
  },

  /* 1.4.2 — IL COLLO INCOMPLETO ENTRA DA QUI, E DA NESSUN'ALTRA PARTE.
     Lasciato vuoto, il campo dice «N colli PIENI», che e' il novantanove per
     cento dei posizionamenti e non chiede niente in piu' a chi scansiona. Si
     compila solo quando l'ultimo collo non e' pieno — ed e' l'unico momento
     in cui qualcuno ha la merce in mano e lo sa davvero.

     A interruttore spento il campo non c'e': la maschera e' quella di ieri. */
  _campoUmIngresso() {
    if (!Store.isFeatureOn('uom')) return '';
    /* 1.8 — a interruttore acceso il campo unico lascia il posto alla
       dichiarazione: piu' misure di collo nello stesso posizionamento, che e'
       come la merce arriva davvero. */
    if (Store.colliOn()) return this._campoColliIngresso();
    return `
      <div class="form-group mb-5" id="mInUmBox" hidden>
        <label>Quantità totale in <span id="mInUmSigla" class="mono"></span> <span class="font-normal text-sx-text-muted">— solo se l'ultimo collo non è pieno</span></label>
        <input class="input input-mono max-w-[180px] text-center" id="mInUmQty" type="number" min="0" step="0.001" placeholder="vuoto = colli pieni" oninput="App._anteprimaUmIn()">
        <div class="text-label-small text-sx-text-muted mt-1.5" id="mInUmPrev"></div>
      </div>`;
  },

  /* 1.8 — LA SUDDIVISIONE SI DICHIARA, E LA DICHIARA CHI HA LA MERCE IN MANO.
     «10 × 1.000 + 1 × 900» sono due righe, e piu' colli incompleti sono
     ammessi: lo stesso articolo arriva in colli da 5 kg e la volta dopo da 25.

     Il campo ④ Colli non si digita piu' quando questo blocco e' aperto: lo
     conta la dichiarazione, e due numeri che dicono la stessa cosa sono il
     modo piu' corto per scriverne uno sbagliato. */
  _colliIn: [] as RigaColliIn[],

  _campoColliIngresso() {
    return `
      <div class="form-group mb-5" id="mInColliBox" hidden>
        <label>Suddivisione dei colli — <span id="mInColliSigla" class="mono"></span></label>
        <div id="mInColliRighe"></div>
        <button class="btn btn-sm mt-3" onclick="App._colliRigaAdd()">+ altra misura</button>
        <div class="text-label-small text-sx-text-muted mt-2.5" id="mInColliPrev"></div>
      </div>`;
  },

  _colliRigaAdd() {
    this._colliIn.push({ colli: '', per: '' });
    this._renderColliIn();
  },

  /* IL CAMPO ④ NON DIVENTA MUTO. Chi scansiona arriva li' col dito e digita i
     colli: se quel campo fosse solo uno specchio della dichiarazione, il
     numero digitato sparirebbe senza dire niente — ed e' il difetto che il
     banco ha trovato per primo. Scrive sulla PRIMA riga, e la dichiarazione
     lo rispecchia: un numero solo, due posti da cui muoverlo. */
  _colliQtyInput() {
    const box = $('mInColliBox');
    if (!Store.colliOn() || !box || box.hidden || !this._colliIn.length) return this._anteprimaUmIn();
    this._colliIn[0].colli = $('mInQty')?.value ?? '';
    this._renderColliIn();
  },

  _colliRigaDel(i) {
    this._colliIn.splice(i, 1);
    if (!this._colliIn.length) this._colliIn.push({ colli: '', per: '' });
    this._renderColliIn();
  },

  _colliRigaSet(i, campo, valore) {
    if (!this._colliIn[i]) return;
    this._colliIn[i][campo] = valore;
    this._anteprimaColliIn();
  },

  _renderColliIn() {
    const box = $('mInColliRighe');
    if (!box) return;
    box.innerHTML = (this._colliIn as RigaColliIn[]).map((r, i) => `
      <div class="flex gap-3 items-center mb-2.5">
        <input class="input input-mono max-w-[90px] text-center" type="number" min="1" step="1" value="${this._esc(String(r.colli ?? ''))}" placeholder="colli"
          oninput="App._colliRigaSet(${i},'colli',this.value)">
        <span class="text-sx-text-muted">×</span>
        <input class="input input-mono max-w-[130px] text-center" type="number" min="0" step="0.001" value="${this._esc(String(r.per ?? ''))}" placeholder="dentro"
          oninput="App._colliRigaSet(${i},'per',this.value)">
        <button class="btn btn-sm" title="Togli questa misura" onclick="App._colliRigaDel(${i})">✕</button>
      </div>`).join('');
    this._anteprimaColliIn();
  },

  /* La dichiarazione si apre gia' compilata con la confezione dell'anagrafica
     e i colli che sono nel campo ④: il novantanove per cento dei
     posizionamenti e' merce tutta uguale, e non deve costare un tasto in piu'. */
  _anteprimaColliIn() {
    const box = $('mInColliBox');
    if (!box) return;
    const art = Validate.clean($('mInArtCode')?.value, true);
    const lot = Validate.clean($('mInLot')?.value);
    const cfg = art ? Store.getUomConfig(art, lot) : null;
    const qtyEl = $('mInQty');
    if (!cfg?.per_collo) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    $('mInColliSigla').textContent = cfg.uom;
    if (!this._colliIn.length) {
      this._colliIn = [{ colli: parseInt(qtyEl?.value) || 1, per: cfg.per_collo }];
      return this._renderColliIn();
    }
    const prev = $('mInColliPrev');
    const errori = validaDichiarazione(this._colliIn, cfg.uom);
    if (errori.length) {
      prev.textContent = '⚖ ' + errori.join(' · ');
      prev.style.color = 'var(--sx-warning)';
      return;
    }
    const elenco = espandiColli(this._colliIn, cfg.uom);
    prev.style.color = 'var(--sx-text-muted)';
    prev.textContent = `⚖ ${descriviElenco(elenco!, cfg.uom)} — ${formattaQuantita(totaleUomElenco(elenco!, cfg.uom), cfg.uom)} ${cfg.uom} in ${elenco!.length} coll.`;
    /* I colli li conta la dichiarazione, e il campo ④ li rispecchia. Si
       riscrive solo se e' diverso: assegnare `value` mentre qualcuno sta
       digitando gli sposta il cursore in fondo. */
    if (qtyEl && qtyEl.value !== String(elenco!.length)) qtyEl.value = String(elenco!.length);
  },

  /* L'elenco da mandare a Store, o `null` se questa maschera non lo sta
     dichiarando — a interruttore spento, o su un articolo senza confezione. */
  _elencoDichiarato() {
    const box = $('mInColliBox');
    if (!Store.colliOn() || !box || box.hidden) return null;
    const art = Validate.clean($('mInArtCode')?.value, true);
    const lot = Validate.clean($('mInLot')?.value);
    const cfg = art ? Store.getUomConfig(art, lot) : null;
    if (!cfg?.per_collo) return null;
    const errori = validaDichiarazione(this._colliIn, cfg.uom);
    if (errori.length) throw new Error(errori.join(' · '));
    return espandiColli(this._colliIn, cfg.uom);
  },

  /* Il campo compare solo per l'articolo/lotto che ha una confezione, e la
     confezione la si conosce solo dopo che sono stati digitati tutti e due:
     per questo l'anteprima si ricalcola a ogni tasto invece che una volta. */
  _anteprimaUmIn() {
    if (Store.colliOn()) return this._anteprimaColliIn();
    const box = $('mInUmBox');
    if (!box) return;
    const art = Validate.clean($('mInArtCode')?.value, true);
    const lot = Validate.clean($('mInLot')?.value);
    const cfg = art ? Store.getUomConfig(art, lot) : null;
    if (!cfg?.per_collo) { box.hidden = true; return; }
    box.hidden = false;
    $('mInUmSigla').textContent = cfg.uom;
    const colli = parseInt($('mInQty')?.value) || 0;
    const raw = $('mInUmQty')?.value;
    const tot = raw === '' || raw === undefined || raw === null
      ? colli * cfg.per_collo : Number(String(raw).replace(',', '.'));
    const prev = $('mInUmPrev');
    prev.textContent = `⚖ ${descriviColli(tot, cfg.per_collo, cfg.uom)} — ${formattaQuantita(tot, cfg.uom)} ${cfg.uom} in tutto`;
  },

  /* 1.4.2 — QUANTE UM SI SONO MOSSE DAVVERO, per rimetterle dall'altra parte.

     Ogni spostamento in questo file e' un `removeItem` seguito da un
     `addItem`, e senza questo numero il secondo dei due DERIVA dai colli
     pieni: spostare 11 colli da 10.100 pz ne riscriverebbe 11.000, e il
     magazzino guadagnerebbe 900 pezzi nel passaggio da uno scaffale
     all'altro. Vale per gli spostamenti, per le quarantene e per ogni
     ripristino dopo un errore — cioe' ovunque ci sia un `addItem` che
     rimette a posto qualcosa che era appena uscito. */
  _umMossa(removed) {
    return typeof removed?._qty_uom_delta === 'number' ? -removed._qty_uom_delta : null;
  },

  /* ═══ 1.8 — QUALI COLLI, E QUANTI ═══════════════════════════════════
     Una maschera sola per tutte le funzioni che tolgono merce: smaltimento,
     trasferimento, prelievo, quarantena. Gli attributi si vedono dove la
     merce si tocca, e da una sorgente sola — vale per i colli come per gli
     allergeni: quattro maschere che elencano i colli in quattro modi sono
     quattro modi di leggere male la stessa riga.

     Restituisce le scelte — indice piu' quantita' facoltativa — oppure `null`
     se chi guarda ha annullato. L'overlay ha un id suo e una chiusura sua:
     `modalOverlay` e' uno solo, e una finestra aperta sopra un'altra chiude
     quella sotto. */
  _colliSel: null as SceltaColli | null,
  _colliResolve: null,

  _scegliColli(item, elenco, uom, titolo = 'Quali colli') {
    $('colliOverlay')?.remove();
    this._colliSel = { elenco, uom, scelte: new Map() };
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'colliOverlay';
    overlay.innerHTML = `
      <div class="modal max-w-[460px]">
        <div class="modal-header"><h2>📦 ${this._esc(titolo)}</h2></div>
        <div class="modal-body">
          <div class="text-body-small text-sx-text-secondary mb-6">
            <strong class="mono">${this._esc(item.article_code)}#${this._esc(item.lot_code)}</strong> in <strong class="mono">${this._esc(item.location_code)}</strong>
            — ${this._esc(descriviElenco(elenco, uom))}
          </div>
          <div id="colliSelRighe"></div>
          <div class="mt-5 font-bold" id="colliSelPrev"></div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="App._colliSelAnnulla()">Annulla</button>
          <button class="btn btn-success" onclick="App._colliSelOk()">✓ Conferma i colli</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    this._colliSelRender();

    /* ESCAPE CHIUDE ANCHE QUESTA, come chiude quelle di `Dialog`.

       Questa finestra e' costruita a mano — non passa da `Dialog`, perche'
       deve disegnare una riga per collo — e per questo non aveva nessun
       gestore di tasti: l'unica uscita erano i due pulsanti in fondo. In
       cattura, come fa `Dialog`, cosi' nessun campo sotto se lo mangia
       prima; e `_colliSelChiudi` lo stacca, che un ascoltatore lasciato
       vivo chiuderebbe la finestra dopo. Annullare qui e' `null`, cioe'
       "non ho scelto": la stessa cosa che dice il pulsante Annulla. */
    escColli = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this._colliSelAnnulla();
    };
    document.addEventListener('keydown', escColli, true);

    return new Promise(resolve => { this._colliResolve = resolve; });
  },

  _colliSelRender() {
    const s: SceltaColli | null = this._colliSel;
    const box = $('colliSelRighe');
    if (!s || !box) return;
    box.innerHTML = s.elenco.map((q, i) => {
      const scelto = s.scelte.has(i);
      const parziale = s.scelte.get(i);
      return `
        <div class="flex gap-4 items-center py-2.5 px-0 border-b border-b-sx-border">
          <input type="checkbox" ${scelto ? 'checked' : ''} onchange="App._colliSelToggle(${i})">
          <span class="flex-1">Collo ${i + 1} · <strong class="mono">${this._esc(formattaQuantita(q, s.uom))} ${this._esc(s.uom)}</strong></span>
          ${scelto ? `<input class="input input-mono max-w-[110px] text-center" type="number" min="0" step="0.001" max="${q}" placeholder="tutto"
              value="${parziale === null || parziale === undefined ? '' : this._esc(String(parziale))}"
              title="Vuoto = il collo esce intero. Un numero più piccolo apre il collo e il resto torna a scaffale."
              oninput="App._colliSelQta(${i},this.value)">` : ''}
        </div>`;
    }).join('');
    this._colliSelPrev();
  },

  _colliSelToggle(i) {
    const s = this._colliSel;
    if (!s) return;
    if (s.scelte.has(i)) s.scelte.delete(i); else s.scelte.set(i, null);
    this._colliSelRender();
  },

  /* Il numero si tiene com'e' stato digitato finche' non si conferma: e' la
     convalida a dire se ci sta, e dirlo mentre si scrive vorrebbe dire
     cancellare la cifra a chi sta ancora componendo «1.000». */
  _colliSelQta(i, valore) {
    const s = this._colliSel;
    if (!s || !s.scelte.has(i)) return;
    s.scelte.set(i, String(valore).trim() === '' ? null : valore);
    this._colliSelPrev();
  },

  _colliSelPrev() {
    const s = this._colliSel;
    const prev = $('colliSelPrev');
    if (!s || !prev) return;
    if (!s.scelte.size) {
      prev.textContent = 'Nessun collo scelto';
      prev.style.color = 'var(--sx-text-muted)';
      return;
    }
    try {
      const esito = prelevaElenco(s.elenco, this._colliSelScelte(), s.uom);
      prev.style.color = 'var(--sx-success)';
      prev.textContent = `Escono ${esito.usciti.length} coll. · ${formattaQuantita(esito.uom, s.uom)} ${s.uom} — restano ${descriviElenco(esito.rimasti, s.uom)}`;
    } catch (err) {
      prev.style.color = 'var(--sx-warning)';
      prev.textContent = '⚠ ' + ((err as Error).message || 'scelta non valida');
    }
  },

  _colliSelScelte() {
    const s = this._colliSel;
    return [...s.scelte.entries()].map(([indice, quantita]) => (
      quantita === null || quantita === undefined ? { indice } : { indice, quantita }
    ));
  },

  _colliSelOk() {
    const s = this._colliSel;
    if (!s?.scelte.size) return this.toast('Scegliere almeno un collo', 'error');
    const scelte = this._colliSelScelte();
    try {
      prelevaElenco(s.elenco, scelte, s.uom);
    } catch (err) {
      return this.toast((err as Error).message || 'Scelta dei colli non valida', 'error');
    }
    this._colliSelChiudi(scelte);
  },

  _colliSelAnnulla() { this._colliSelChiudi(null); },

  _colliSelChiudi(esito: unknown) {
    if (escColli) {
      document.removeEventListener('keydown', escColli, true);
      escColli = null;
    }
    $('colliOverlay')?.remove();
    this._colliSel = null;
    const resolve = this._colliResolve;
    this._colliResolve = null;
    if (resolve) resolve(esito);
  },

  /* Il gesto completo, per chi toglie merce: se la riga porta l'elenco chiede
     quali colli, se no restituisce `null` e chi chiama fa come nella 1.7.
     `undefined` significa «annullato»: e' diverso da «questa riga non ha un
     elenco», e chi chiama deve fermarsi invece di prelevare tutto. */
  /* Tutti i colli della riga, senza chiedere niente: serve dove la merce si
     sposta INTERA e non c'è nessuna scelta da fare — il rilascio dalla
     quarantena, per esempio. Senza queste scelte l'`addItem` che segue
     deriverebbe colli pieni, e l'elenco morirebbe nel passaggio. */
  _tuttiIColli(item) {
    if (!Store.colliOn()) return null;
    const elenco = Store.colliDiRiga(item);
    return elenco ? elenco.map((_, indice) => ({ indice })) : null;
  },

  async _chiediColli(item, titolo) {
    if (!Store.colliOn()) return null;
    const cfg = Store.getUomConfig(item?.article_code, item?.lot_code);
    const elenco = Store.colliDiRiga(item);
    if (!cfg || !elenco) return null;
    const scelte = await this._scegliColli(item, elenco, cfg.uom, titolo);
    return scelte === null ? undefined : scelte;
  },

  _cbPickIn() { setTimeout(() => { App._previewLoc('mInLoc','mInLocPrev'); $('mInArtCode')?.focus(); }, 30); },

  _autoLookupArticle(codeId, infoId, descId) {
    const code = Validate.clean($(codeId)?.value, true);
    if (!code) return;
    const art = Store.getArticle(code);
    const info = $(infoId);
    const descEl = descId ? $(descId) : null;
    if (art) {
      info.innerHTML = `<span class="text-sx-success">✓</span> <strong>${this._esc(art.description)}</strong> <span class="badge badge-muted">${this._esc(art.category || '')}</span>`;
      /* DIFETTO NOTO — vedi `giacenze.ts`: senza descrizione qui finisce
         la parola «undefined». */
      if (descEl) descEl.value = art.description as string;
    } else {
      info.innerHTML = `<span class="text-sx-warning">⚠ Nuovo articolo — compilare descrizione (obbligatoria)</span>`;
      if (descEl) descEl.value = '';
      // espandi details per forzare compilazione
      $('mInDetails')?.setAttribute('open', '');
    }
  },

  async _execPosiziona() {
    if (!this._requireOperator('il posizionamento')) return;   // v2.0.1 [B7]
    const loc = Validate.clean($('mInLoc')?.value, true).replace(/'/g, '-');
    const art = Validate.clean($('mInArtCode')?.value, true);
    const desc = Validate.clean($('mInArtDesc')?.value);
    const lot = Validate.clean($('mInLot')?.value);
    // v2.3.0 [D1] — il campo scadenza è in formato gg/mm/aaaa: conversione a ISO
    const exp = this._dateITtoISO($('mInExp')?.value, 'Scadenza');
    if (exp === null) return;   // data incompleta o non valida → posizionamento interrotto
    const notes = Validate.clean($('mInNotes')?.value);
    // v1.7.0 — qty (Colli)
    const qtyRaw = $('mInQty')?.value;
    const qty = parseInt(qtyRaw);
    if (!qty || qty < 1) return this.toast('Numero di colli non valido (minimo 1)', 'error');

    // Validazioni
    const errors = [
      Validate.location(loc), Validate.article(art), Validate.lot(lot),
      Validate.notes(notes)
    ].filter(Boolean);
    if (errors.length) return this.toast(errors[0], 'error');
    if (!Store.locationExists(loc)) return this.toast(`Ubicazione ${loc} non trovata`, 'error');
    const locStatus = Store.getLocationStatus(loc);
    if (locStatus === 'blocked') return this.toast(`Ubicazione ${loc} è BLOCCATA`, 'error');
    if (locStatus === 'disabled') return this.toast(`Ubicazione ${loc} è DISATTIVATA`, 'error');

    // Fix B6: articolo nuovo senza descrizione → blocca
    const existingArt = Store.getArticle(art);
    if (!existingArt && !desc) {
      $('mInDetails')?.setAttribute('open', '');
      $('mInArtDesc')?.focus();
      return this.toast('Articolo non in anagrafica: inserire una descrizione', 'error');
    }
    const effectiveDesc = existingArt?.description || desc;

    const signature = `IN|${loc}|${art}|${lot}`;
    const elapsed = ScanGuard.check(signature);
    if (elapsed !== null) {
      const proceed = await Dialog.confirm({
        title: '⚠ Scansione ripetuta',
        message: `La stessa riga è già stata posizionata ${Math.round(elapsed / 1000)} secondi fa. Confermare solo se si tratta di colli realmente diversi: in caso contrario la giacenza verrebbe raddoppiata.`,
        details: Dialog.kv([
          ['Articolo', art], ['Lotto', lot], ['Ubicazione', loc], ['Colli da aggiungere', qty]
        ]),
        confirmLabel: 'Sì, sono colli diversi',
        cancelLabel: 'Annulla',
        danger: true
      });
      if (!proceed) {
        ScanGuard.mark(signature);
        return this.toast('Posizionamento annullato — nessuna quantità aggiunta', 'info');
      }
    }
    ScanGuard.mark(signature);

    /* 1.4.2 — vuoto vuol dire «colli pieni», e Store lo deriva dalla
       confezione: qui si passa un numero solo quando qualcuno lo ha digitato,
       cioe' quando ha in mano un collo che pieno non e'. */
    const umRaw = $('mInUmQty')?.value;
    const qtyUom = umRaw === undefined || umRaw === null || String(umRaw).trim() === ''
      ? null : Number(String(umRaw).replace(',', '.'));
    let res, elenco = null;
    try {
      /* 1.8 — dove la suddivisione e' dichiarata comanda lei: i colli sono
         quanti sono nell'elenco, e `qty` qui e' gia' il suo specchio. */
      elenco = this._elencoDichiarato();
    } catch (err) {
      return this.toast((err as Error).message || 'Suddivisione dei colli incompleta', 'error');
    }
    try {
      res = await Store.addItem(loc, art, effectiveDesc, lot, exp, notes, qty, qtyUom, elenco);
    } catch (err) {
      return this.toast((err as Error).message || 'Errore posizionamento', 'error');
    }
    if (!res.ok) return this.toast('Errore posizionamento', 'error');
    // v1.7.0 — log con qty info
    await this._logMov(MOV.IN, art, effectiveDesc, lot, loc, null, '', '', '', res.qty_before, qty, res.qty_after, res.qty_uom_delta);

    const fb = $('mInFeedback');
    const modeLabel = res.mode === 'incremented' ? `<span class="text-sx-warning">⊕ INCREMENTATO</span>` : '';
    if (fb) fb.innerHTML = `<div class="mov-preview mov-preview-ok"><span class="font-bold">✓ ${this._esc(art)}#${this._esc(lot)} → ${this._esc(loc)}</span> · <strong>+${qty} Coll.</strong> (saldo: ${res.qty_after}) ${modeLabel}</div>`;
    const incrSuffix = res.mode === 'incremented' ? ` (saldo: ${res.qty_after})` : '';
    this.toast(`✓ Posizionato: ${art}#${lot} → ${loc} · +${qty} Coll.${incrSuffix}`, 'success');
    this.updateSyncIndicator();
    // Reset campi articolo ma lascia loc; reset qty al default 1
    for (const id of ['mInArtCode','mInArtDesc','mInLot','mInExp','mInNotes','mInUmQty']) { const e = $(id); if (e) e.value = ''; }
    const qtyEl = $('mInQty'); if (qtyEl) qtyEl.value = '1';
    /* 1.8 — la dichiarazione appartiene al collo che si e' appena posizionato:
       la prossima merce la dichiara chi ce l'ha in mano, da zero. */
    this._colliIn = [];
    this._anteprimaUmIn();
    $('mInArtInfo').innerHTML = '';
    $('mInDetails')?.removeAttribute('open');
    this._previewLoc('mInLoc','mInLocPrev');
    this._refreshSessionLog();
    // v2.1.0 — storno disponibile per 120 secondi
    /* 1.8 — lo storno di un posizionamento dichiarato toglie ESATTAMENTE i
       colli che erano entrati: senza l'elenco toglierebbe «tre colli», e su
       una riga imballata in due misure non sarebbero gli stessi tre. */
    this._pushUndo(`Posizionamento ${art}#${lot} → ${loc} (${qty} Coll.)`,
      [{ op: 'remove', loc, art, desc: effectiveDesc, lot, qty, qty_uom: res.qty_uom_delta ?? null, packs: elenco }]);
    /* 1.4.4 — nessun aggancio: il Posizionamento non è più un tipo di
       attività. Questa maschera resta quella di sempre per chi posiziona
       merce a mano, e non ha nessun compito da far avanzare. */
    this.setPrimaryScanField('mInArtCode');
  },
} satisfies Vista;
