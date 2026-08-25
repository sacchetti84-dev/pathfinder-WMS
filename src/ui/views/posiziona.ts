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
  totaleUom as totaleUomElenco, preleva as prelevaElenco, raggruppa as raggruppaColli,
  scelteDaTaglie, riempiFabbisogno,
} from '../../modules/colli';
import { scavalco as scavalcoStoccaggio } from '../../modules/stoccaggio';

/* Le due forme che vivono solo dentro questa maschera: la dichiarazione dei
   colli in ingresso — «quanti, e da quanto» — e la finestra che chiede quali
   colli escono, con le scelte parziali segnate per posizione. */
type RigaColliIn = { colli: string; per: string };
/* 2.2 — la scelta si fa per TAGLIA: una riga per misura col numero di colli
   che si prendono, e un collo aperto in fondo se serve. `presi` e `parte`
   restano stringhe finche' non si conferma — e' la convalida a dire se ci
   stanno, e correggere mentre si digita cancella la cifra a chi sta ancora
   componendo «1.000». */
type SceltaColli = {
  elenco: number[]; uom: string;
  gruppi: { colli: number; per: number }[];
  presi: string[];
  parte: string;
  parteDa: number | null;
  /* Vero da quando l'operatore tocca la tendina: da li' in poi il sistema
     non gli cambia piu' il collo sotto le mani. Finche' e' falso la misura
     si ricalcola a ogni cifra — il piu' piccolo che basta cambia se cambia
     quel che si prende. */
  parteScelta: boolean;
};
/* 1.8.4 — la ridichiarazione: le stesse righe del posizionamento, aperte
   gia' compilate con l'elenco che la riga porta adesso. */
type StatoRidichiarazione = { righe: RigaColliIn[]; uom: string };

/* Il gestore dell'Escape della finestra dei colli. Sta QUI e non dentro
   `App`: la superficie del monolite e' un contratto — 577 nomi, e un
   collaudo che li conta — e un ascoltatore non e' un metodo che qualcuno
   chiama. Ne vive uno per volta, come la finestra. */
let escColli: ((e: KeyboardEvent) => void) | null = null;
let escRidich: ((e: KeyboardEvent) => void) | null = null;

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
          <button class="btn btn-sm" onclick="App._pickLoc('mInLoc','_cbPickIn')" title="Sfoglia le ubicazioni">📍</button>
          <button class="btn btn-sm" onclick="App._pickUdcIn()" title="Scegli un'unità di carico aperta">🔀</button>
        </div>
        <div id="mInLocPrev"></div>
      </div>
      <div class="form-group mb-5">
        <label>② Codice Articolo <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="mInArtCode" placeholder="Scansiona barcode articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
          oninput="App._anteprimaUmIn()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._autoLookupArticle('mInArtCode','mInArtInfo','mInArtDesc');App._proponiVano();$('mInLot').focus();}">
        <div class="text-label-small text-sx-text-muted mt-1.5" id="mInArtInfo"></div>
      </div>
      <div class="form-group mb-5">
        <label>③ Codice Lotto <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="mInLot" placeholder="Scansiona barcode lotto" maxlength="${Validate.MAX.LOT_CODE}"
          oninput="App._anteprimaUmIn()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._proponiVano();$('mInQty').focus();$('mInQty').select();}">
      </div>
      <div id="mInProposta"></div>
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

     2.0 — LA DICHIARAZIONE HA PRESO IL POSTO DEL CAMPO UNICO, e il campo
     unico non c'e' piu': erano due maschere per la stessa domanda, e la
     seconda si vedeva solo con un interruttore che adesso e' sparito. Un
     ramo che nessuno percorre e nessun collaudo esercita e' il posto dove un
     difetto vive piu' a lungo. */
  _campoUmIngresso() {
    return this._campoColliIngresso();
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
    if (!box || box.hidden || !this._colliIn.length) return this._anteprimaUmIn();
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
    const lot = Validate.clean($('mInLot')?.value, true);
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

  /* L'elenco da mandare a Store, o `null` su un articolo senza confezione:
     li' non c'e' niente da dichiarare. */
  _elencoDichiarato() {
    const box = $('mInColliBox');
    if (!box || box.hidden) return null;
    const art = Validate.clean($('mInArtCode')?.value, true);
    const lot = Validate.clean($('mInLot')?.value, true);
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
    return this._anteprimaColliIn();
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

  _scegliColli(item, elenco, uom, titolo = 'Quali colli', fabbisogno = null) {
    $('colliOverlay')?.remove();
    const gruppi = raggruppaColli(elenco, uom);
    const presi = riempiFabbisogno(gruppi, fabbisogno, uom).map(n => (n ? String(n) : ''));
    this._colliSel = { elenco, uom, gruppi, presi, parte: '', parteDa: null, parteScelta: false };
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
          <div class="form-row mt-6">
            <div class="form-group">
              <label>E in più, una parte di un collo — facoltativo</label>
              <input class="input input-mono" id="colliSelParte" inputmode="decimal" autocomplete="off"
                oninput="App._colliSelParte(this.value)">
            </div>
            <div class="form-group max-w-[160px]">
              <label>aperto da un collo da</label>
              <select class="select" id="colliSelParteDa" onchange="App._colliSelParteDa(this.value)"></select>
            </div>
          </div>
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

  /* UNA RIGA PER MISURA, NON PER COLLO. Settanta colli da 25 chiedevano
     settanta caselle per ottenere un numero: qui la riga dice quanti ce ne
     sono e chiede quanti se ne prendono. Le righe si ridisegnano solo alla
     riapertura — riscriverle a ogni cifra digitata sposterebbe il cursore. */
  _colliSelRender() {
    const s: SceltaColli | null = this._colliSel;
    const box = $('colliSelRighe');
    if (!s || !box) return;
    box.innerHTML = s.gruppi.map((g, i) => `
        <div class="flex gap-4 items-center py-2.5 px-0 border-b border-b-sx-border">
          <span class="flex-1"><strong class="mono">${this._esc(formattaQuantita(g.per, s.uom))} ${this._esc(s.uom)}</strong>
            <span class="text-label-small text-sx-text-muted"> · ${g.colli} disponibil${g.colli === 1 ? 'e' : 'i'}</span></span>
          <input class="input input-mono max-w-[110px] text-center" type="number" min="0" step="1" max="${g.colli}"
            placeholder="0" value="${this._esc(s.presi[i] ?? '')}"
            title="Quanti colli di questa misura escono"
            oninput="App._colliSelPreso(${i},this.value)">
        </div>`).join('');
    this._colliSelOpzioniParte();
    this._colliSelPrev();
  },

  _colliSelPreso(i, valore) {
    const s = this._colliSel;
    if (!s) return;
    s.presi[i] = String(valore).trim();
    this._colliSelOpzioniParte();
    this._colliSelPrev();
  },

  _colliSelParte(valore) {
    const s = this._colliSel;
    if (!s) return;
    s.parte = String(valore).trim();
    this._colliSelOpzioniParte();
    this._colliSelPrev();
  },

  _colliSelParteDa(valore) {
    const s = this._colliSel;
    if (!s) return;
    const n = Number(String(valore).replace(',', '.'));
    s.parteDa = Number.isFinite(n) && n > 0 ? n : null;
    s.parteScelta = s.parteDa !== null;
    this._colliSelPrev();
  },

  /* DA QUALE COLLO SI APRE. La tendina porta solo le misure che hanno ancora
     un collo INTERO non preso: aprire un collo già contato fra gli interi è
     lo stesso collo contato due volte. Il primo della tendina è il più
     piccolo che basta — aprire un sacco da 25 per prenderne 7,5 quando ce
     n'è uno da 10 lascia in giro due mezzi colli invece di uno — ma la
     scelta resta di chi ha la merce davanti. */
  _colliSelOpzioniParte() {
    const s: SceltaColli | null = this._colliSel;
    const sel = $('colliSelParteDa');
    if (!s || !sel) return;
    const chiesto = Number(String(s.parte).replace(',', '.'));
    const liberi = s.gruppi
      .map((g, i) => ({ per: g.per, liberi: g.colli - (parseInt(s.presi[i] ?? '', 10) || 0) }))
      .filter(g => g.liberi > 0);
    const bastano = liberi.filter(g => !Number.isFinite(chiesto) || chiesto <= 0 || g.per > chiesto);
    const ordinate = [...(bastano.length ? bastano : liberi)].sort((a, b) => a.per - b.per);
    if (!s.parteScelta || s.parteDa === null || !ordinate.some(g => g.per === s.parteDa)) {
      s.parteDa = ordinate.length ? ordinate[0]!.per : null;
    }
    sel.innerHTML = ordinate.map(g =>
      `<option value="${g.per}" ${g.per === s.parteDa ? 'selected' : ''}>${this._esc(formattaQuantita(g.per, s.uom))} ${this._esc(s.uom)}</option>`).join('')
      || '<option value="">nessun collo libero</option>';
  },

  _colliSelPrev() {
    const s = this._colliSel;
    const prev = $('colliSelPrev');
    if (!s || !prev) return;
    if (!s.presi.some((v: string) => (parseInt(v, 10) || 0) > 0) && !s.parte) {
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

  /* Le prese per taglia diventano scelte per indice: la regola sta in
     `modules/colli.ts`, qui si legge la maschera e basta. */
  _colliSelScelte() {
    const s: SceltaColli | null = this._colliSel;
    if (!s) return [];
    const prese = s.gruppi.map((g, i) => ({ per: g.per, colli: parseInt(s.presi[i] ?? '', 10) || 0 }));
    const parte = s.parte && s.parteDa !== null
      ? { per: s.parteDa, quantita: s.parte.replace(',', '.') }
      : null;
    return scelteDaTaglie(s.elenco, prese, s.uom, parte);
  },

  _colliSelOk() {
    const s = this._colliSel;
    if (!s) return;
    let scelte;
    try {
      scelte = this._colliSelScelte();
      if (!scelte.length) return this.toast('Scegliere almeno un collo', 'error');
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

  /* ═══ 1.8.4 — COM'E' FATTO ADESSO ══════════════════════════════════
     Chi conta un vano non toglie e non aggiunge: guarda lo scaffale e dice
     com'e' imballato quello che ha davanti. La stessa dichiarazione del
     posizionamento — «quanti, e da quanto» — aperta gia' compilata con
     l'elenco di adesso, perche' il piu' delle volte cambia una riga sola.

     Da qui esce l'elenco NUOVO, e la differenza la calcola `rettifica`. E'
     il gesto che ha tolto di mezzo l'unico «vai da un'altra parte» rimasto:
     un collo trovato ha una misura che nessuno puo' indovinare, ma chi ce
     l'ha davanti la legge.

     `undefined` se si annulla, `null` se la riga non porta un elenco. */
  _ridich: null as StatoRidichiarazione | null,
  _ridichResolve: null,

  /* `daZero` apre la dichiarazione VUOTA e non scrive com'e' a sistema: la
     Conta mirata non mostra il proprio numero prima che qualcuno abbia
     contato, e un elenco gia' compilato e' quel numero scritto per esteso.
     Nell'inventario di vano invece la riga e' li' sopra, e ricopiarla a mano
     sarebbe lavoro per niente. */
  _ridichiaraColli(item, titolo = "Com'è fatto adesso", opzioni: { daZero?: boolean } = {}) {
    const cfg = Store.getUomConfig(item?.article_code, item?.lot_code);
    const elenco = Store.colliDiRiga(item);
    if (!cfg || !elenco) return null;

    $('ridichOverlay')?.remove();
    this._ridich = {
      uom: cfg.uom,
      righe: opzioni.daZero
        ? [{ colli: '', per: '' }]
        : raggruppaColli(elenco, cfg.uom).map(g => ({ colli: String(g.colli), per: String(g.per) })),
    };
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'ridichOverlay';
    overlay.innerHTML = `
      <div class="modal max-w-[460px]">
        <div class="modal-header"><h2>📦 ${this._esc(titolo)}</h2></div>
        <div class="modal-body">
          <div class="text-body-small text-sx-text-secondary mb-6">
            <strong class="mono">${this._esc(item.article_code)}#${this._esc(item.lot_code)}</strong> in <strong class="mono">${this._esc(item.location_code)}</strong>${opzioni.daZero ? '' : ` — a sistema ${this._esc(descriviElenco(elenco, cfg.uom))}`}
          </div>
          <div id="ridichRighe"></div>
          <button class="btn btn-sm mt-3" onclick="App._ridichRigaAdd()">+ altra misura</button>
          <div class="mt-5 font-bold" id="ridichPrev"></div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="App._ridichAnnulla()">Annulla</button>
          <button class="btn btn-success" onclick="App._ridichOk()">✓ È così</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    this._ridichRender();

    escRidich = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this._ridichAnnulla();
    };
    document.addEventListener('keydown', escRidich, true);
    return new Promise(resolve => { this._ridichResolve = resolve; });
  },

  _ridichRigaAdd() {
    this._ridich?.righe.push({ colli: '', per: '' });
    this._ridichRender();
  },

  _ridichRigaDel(i) {
    const s = this._ridich;
    if (!s) return;
    s.righe.splice(i, 1);
    /* Una riga in fondo c'e' sempre: un vano svuotato si dichiara lasciandola
       vuota, e senza nessuna riga non ci sarebbe dove scrivere. */
    if (!s.righe.length) s.righe.push({ colli: '', per: '' });
    this._ridichRender();
  },

  _ridichSet(i, campo, valore) {
    const r = this._ridich?.righe[i];
    if (!r) return;
    r[campo] = valore;
    this._ridichPrev();
  },

  _ridichRender() {
    const s = this._ridich;
    const box = $('ridichRighe');
    if (!s || !box) return;
    box.innerHTML = s.righe.map((r: RigaColliIn, i: number) => `
      <div class="flex gap-3 items-center mb-2.5">
        <input class="input input-mono max-w-[90px] text-center" type="number" min="0" step="1" value="${this._esc(String(r.colli ?? ''))}" placeholder="colli"
          oninput="App._ridichSet(${i},'colli',this.value)">
        <span class="text-sx-text-muted">×</span>
        <input class="input input-mono max-w-[130px] text-center" type="number" min="0" step="0.001" value="${this._esc(String(r.per ?? ''))}" placeholder="dentro"
          oninput="App._ridichSet(${i},'per',this.value)">
        <span class="text-sx-text-muted text-label-small">${this._esc(s.uom)}</span>
        <button class="btn btn-sm" title="Togli questa misura" onclick="App._ridichRigaDel(${i})">✕</button>
      </div>`).join('');
    this._ridichPrev();
  },

  /* Un vano dichiarato vuoto e' una dichiarazione, non un errore: e' la riga
     che sparisce del tutto, e la differenza la legge chi la applica. */
  _ridichElenco() {
    const s = this._ridich;
    if (!s) return null;
    const vuota = s.righe.every((r: RigaColliIn) => !String(r.colli ?? '').trim() && !String(r.per ?? '').trim());
    if (vuota) return [];
    const errori = validaDichiarazione(s.righe, s.uom);
    if (errori.length) throw new Error(errori.join(' · '));
    return espandiColli(s.righe, s.uom) ?? [];
  },

  _ridichPrev() {
    const s = this._ridich;
    const prev = $('ridichPrev');
    if (!s || !prev) return;
    try {
      const elenco = this._ridichElenco();
      prev.style.color = elenco.length ? 'var(--sx-success)' : 'var(--sx-danger)';
      prev.textContent = elenco.length
        ? `${descriviElenco(elenco, s.uom)} — ${formattaQuantita(totaleUomElenco(elenco, s.uom), s.uom)} ${s.uom} in ${elenco.length} coll.`
        : 'Vano vuoto: la riga sparisce dalla giacenza';
    } catch (err) {
      prev.style.color = 'var(--sx-warning)';
      prev.textContent = '⚠ ' + ((err as Error).message || 'dichiarazione non valida');
    }
  },

  _ridichOk() {
    let elenco;
    try { elenco = this._ridichElenco(); }
    catch (err) { return this.toast((err as Error).message || 'Dichiarazione non valida', 'error'); }
    this._ridichChiudi(elenco);
  },

  _ridichAnnulla() { this._ridichChiudi(undefined); },

  _ridichChiudi(esito: unknown) {
    if (escRidich) {
      document.removeEventListener('keydown', escRidich, true);
      escRidich = null;
    }
    $('ridichOverlay')?.remove();
    this._ridich = null;
    const resolve = this._ridichResolve;
    this._ridichResolve = null;
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
    const elenco = Store.colliDiRiga(item);
    return elenco ? elenco.map((_, indice) => ({ indice })) : null;
  },

  /* `elencoIn` restringe la domanda a una parte della riga: il carrello del
     DDT sceglie sui colli ancora LIBERI, non su tutti — quelli che un altro
     documento pendente ha gia' impegnato non si possono prenotare due volte.
     Chi non lo passa chiede sulla riga intera, come sempre.

     Un elenco ristretto e VUOTO non e' un'assenza di elenco: e' una riga
     tutta impegnata, e vale un annullamento — se tornasse `null` la maschera
     che chiama scriverebbe una riga senza colli. */
  async _chiediColli(item, titolo, elencoIn: number[] | null = null, fabbisogno = null) {
    const cfg = Store.getUomConfig(item?.article_code, item?.lot_code);
    const elenco = elencoIn ?? Store.colliDiRiga(item);
    if (!cfg || !elenco) return null;
    if (!elenco.length) return undefined;

    /* 2.2 — QUANTI PER MISURA, E BASTA.

       Fino alla 2.1 c'erano due maschere: l'elenco collo per collo, e — solo
       quando i colli erano tutti uguali — una domanda secca «quanti ne
       servono?». La prima chiedeva settanta caselle per ottenere un numero
       su una riga con settanta colli, e in corsia era il gesto piu' lungo di
       tutta la giornata. Adesso ce n'e' una sola, e chiede la stessa cosa a
       tutte e due: quanti colli per ogni misura. Due colli della stessa
       misura, sulla stessa riga, sono la stessa cosa.

       Il fabbisogno la apre gia' compilata — l'ODP chiede chili, le altre
       maschere chiedono colli — e chi non lo sa non lo passa: le righe
       nascono a zero, che e' meglio di un numero inventato. */
    const scelte = await this._scegliColli(item, elenco, cfg.uom, titolo, fabbisogno);
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
      /* Vedi `giacenze.ts`: senza descrizione il campo resta vuoto. */
      if (descEl) descEl.value = art.description ?? '';
    } else {
      info.innerHTML = `<span class="text-sx-warning">⚠ Nuovo articolo — compilare descrizione (obbligatoria)</span>`;
      if (descEl) descEl.value = '';
      // espandi details per forzare compilazione
      $('mInDetails')?.setAttribute('open', '');
    }
  },

  /* ═══════════════════════════════════════════════════════════════════
     1.13 — IL MOTORE PROPONE, LA PERSONA DECIDE
     © Andrea Sacchetti — Dietopack S.r.l.

     Il motore non impone niente e non riempie da solo il campo ①: propone un
     vano, dice PERCHÉ quello, e sta zitto se l'ubicazione scelta va bene.
     Parla solo quando ha qualcosa da dire — un vano migliore, o un vincolo
     che quello scelto viola.

     LO SCAVALCO NON SI IMPEDISCE. Chi ha la merce in mano vede cose che il
     sistema non sa: il motore consiglia, e se la scelta è un'altra si
     registra il motivo. È l'unico dato che, fra tre mesi, dirà se le regole
     valgono o se le sta scavalcando tutti allo stesso modo.

     La regola sta in `modules/stoccaggio.ts`, i dati li raccoglie
     `Store.proponiStoccaggio`. Qui c'è il riquadro e basta.
     ═══════════════════════════════════════════════════════════════════ */

  _propostaCorrente: null,

  _proponiVano() {
    const box = $('mInProposta');
    if (!box) return;
    this._propostaCorrente = null;
    const art = Validate.clean($('mInArtCode')?.value, true);
    const lot = Validate.clean($('mInLot')?.value, true);
    if (!art) { box.innerHTML = ''; return; }
    const colli = parseInt($('mInQty')?.value, 10) || 1;

    const esito = Store.proponiStoccaggio(art, lot, colli);
    if (!esito) { box.innerHTML = ''; return; }
    this._propostaCorrente = esito;

    const scelto = Validate.clean($('mInLoc')?.value, true).replace(/'/g, '-');
    const primo = esito.proposte[0];

    /* Nessun posto passa i vincoli: è un'informazione, non un errore — la
       merce si posiziona lo stesso, e chi lo fa deve sapere che nessuna
       ubicazione mappata la accoglierebbe. */
    if (!primo) {
      box.innerHTML = `<div class="mov-preview mov-preview-warn mb-5">
        <strong>🎯 Nessuna ubicazione soddisfa i vincoli</strong> per questa merce.
        ${esito.esclusi.length ? `Il primo motivo: ${this._esc(esito.esclusi[0]!.messaggio)}.` : ''}
        Si può posizionare comunque: il motivo resta a registro.
      </div>`;
      return;
    }

    /* L'ubicazione scelta È quella proposta: non si dice niente di più di un
       segno di spunta. Un riquadro che parla anche quando tutto va bene si
       smette di leggere. */
    if (scelto && scelto === primo.location_code) {
      box.innerHTML = `<div class="mov-preview mov-preview-ok mb-5">
        <strong>🎯 ${this._esc(scelto)}</strong> è anche quella che il motore propone.
      </div>`;
      return;
    }

    const escluso = scelto ? esito.esclusi.find((e) => e.location_code === scelto) : null;
    const perche = primo.perche.length
      ? `<ul class="mt-2 mb-0 ml-8 p-0 text-body-small">${primo.perche.map((r: string) => `<li>${this._esc(r)}</li>`).join('')}</ul>`
      : '';

    box.innerHTML = `<div class="mov-preview ${escluso ? 'mov-preview-err' : ''} mb-5">
      ${escluso
        ? `<strong>⛔ ${this._esc(scelto)} non va bene:</strong> ${this._esc(escluso.messaggio)}.<br>`
        : ''}
      <strong>🎯 Proposta: <span class="mono">${this._esc(primo.location_code)}</span></strong>
      ${perche}
      <div class="flex gap-3 mt-4 flex-wrap">
        <button class="btn btn-sm btn-primary" type="button" onclick="App._usaVanoProposto()">Usa ${this._esc(primo.location_code)}</button>
        ${esito.proposte.length > 1
          ? `<button class="btn btn-sm" type="button" onclick="App._altreProposte()">Altre ${esito.proposte.length - 1}</button>`
          : ''}
        ${esito.esclusi.length
          ? `<button class="btn btn-sm" type="button" onclick="App._perchePropostaEsclusi()">Perché non altrove (${esito.esclusi.length})</button>`
          : ''}
      </div>
      ${scelto && !escluso ? `<div class="form-group mt-4 mb-0">
        <label class="text-label-small">Hai scelto ${this._esc(scelto)}: perché? (resta a registro)</label>
        <input class="input" id="mInScavalco" maxlength="${Validate.MAX.REASON}" placeholder="Es: il muletto non arriva in quota">
      </div>` : ''}
    </div>`;
  },

  _usaVanoProposto() {
    const primo = this._propostaCorrente?.proposte?.[0];
    const campo = $('mInLoc');
    if (!primo || !campo) return;
    campo.value = primo.location_code;
    this._previewLoc('mInLoc', 'mInLocPrev');
    this._proponiVano();
  },

  _altreProposte() {
    const p = this._propostaCorrente?.proposte || [];
    if (p.length < 2) return;
    this.showModal('🎯 Le altre ubicazioni possibili',
      p.slice(1, 21).map((x: { location_code: string; punteggio: number; perche: string[] }) => `
        <div class="inv-item-row">
          <div class="inv-info">
            <div class="inv-code">${this._esc(x.location_code)} <span class="badge badge-muted">${x.punteggio} punti</span></div>
            <div class="inv-lot">${x.perche.length ? this._esc(x.perche.join(' · ')) : 'Nessun criterio a favore: passa i vincoli e basta'}</div>
          </div>
        </div>`).join('') +
      (p.length > 21 ? `<div class="text-label-small text-sx-text-muted mt-4">…e altre ${p.length - 21}.</div>` : ''),
      '<button class="btn" onclick="App.closeModal()">Chiudi</button>');
  },

  _perchePropostaEsclusi() {
    const e = this._propostaCorrente?.esclusi || [];
    if (!e.length) return;
    this.showModal(`⛔ Perché queste ubicazioni no (${e.length})`,
      e.slice(0, 40).map((x: { location_code: string; messaggio: string }) => `
        <div class="inv-item-row">
          <div class="inv-info">
            <div class="inv-code">${this._esc(x.location_code)}</div>
            <div class="inv-lot">${this._esc(x.messaggio)}</div>
          </div>
        </div>`).join('') +
      (e.length > 40 ? `<div class="text-label-small text-sx-text-muted mt-4">…e altre ${e.length - 40}.</div>` : ''),
      '<button class="btn" onclick="App.closeModal()">Chiudi</button>');
  },

  /* La riga da scrivere nel movimento quando la scelta non è la proposta.
     Vuota se il motore è spento, se non ha proposto niente, o se il vano
     scelto è proprio quello proposto. */
  _notaScavalco(locScelta) {
    const primo = this._propostaCorrente?.proposte?.[0];
    if (!primo) return '';
    return scavalcoStoccaggio(primo.location_code, locScelta,
      Validate.clean($('mInScavalco')?.value)) || '';
  },

  /* 2.1 — LA DESTINAZIONE PUÒ ESSERE UN'UNITÀ DI CARICO.

     In magazzino la merce non si posa su uno scaffale: si posa su un
     pallet, che sta su uno scaffale. Fino alla 2.0 le due cose erano due
     gesti — posiziona nel vano, poi apri l'unità e caricala sopra — e il
     secondo si dimenticava: la riga restava nel vano fuori dall'unità, e
     spostando il pallet quella merce non lo seguiva.

     Il campo è UNO SOLO, e non due. Chi ha il lettore in mano scansiona
     quello che ha davanti — il cartellino del vano o l'etichetta del
     pallet — e non deve sapere in quale casella va cosa: il codice di
     un'unità aperta si riconosce da sé, e porta con sé la propria
     ubicazione. Un'unità senza ubicazione non è una destinazione: si dice
     invece di indovinare un vano. */
  _udcDestinazione(scritto: string) {
    const u = Store.getUdcAperte().find(x => x.udc_id === scritto);
    if (!u) return null;
    return { udc: u, location_code: String(u.location_code || '').trim() };
  },

  _pickUdcIn() {
    const aperte = Store.getUdcAperte().filter(u => u.location_code);
    if (!aperte.length) return this.toast('Nessuna unità di carico aperta con un’ubicazione', 'info');
    this.showModal(
      '🔀 Carica su un’unità di carico',
      `<p class="text-body-small text-sx-text-secondary mb-6">
        La merce si posiziona nel vano dell’unità e le resta sopra: spostando l’unità, si sposta anche lei.
      </p>
      <div class="form-group">
        <label>Unità aperte</label>
        <select class="input select" id="mInUdcPick">
          ${aperte.map(u => `<option value="${this._esc(u.udc_id)}">${this._esc(u.udc_id)} — 📍 ${this._esc(u.location_code)} · ${Store.righeDiUdc(u.udc_id).length} righe</option>`).join('')}
        </select>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App._cbPickUdcIn()">Usa questa unità</button>`
    );
  },

  _cbPickUdcIn() {
    const scelto = String($('mInUdcPick')?.value || '');
    if (!scelto) return;
    const campo = $('mInLoc');
    if (campo) campo.value = scelto;
    this.closeModal();
    this._previewLoc('mInLoc', 'mInLocPrev');
    $('mInArtCode')?.focus();
  },

  async _execPosiziona() {
    if (!this._requireOperator('il posizionamento')) return;   // v2.0.1 [B7]
    const scritto = Validate.clean($('mInLoc')?.value, true).replace(/'/g, '-');
    const versoUdc = this._udcDestinazione(scritto);
    if (versoUdc && !versoUdc.location_code) {
      return this.toast(`${scritto} non ha un’ubicazione: posizionala prima, o scegli un vano`, 'error');
    }
    const loc = versoUdc ? versoUdc.location_code : scritto;
    const art = Validate.clean($('mInArtCode')?.value, true);
    const desc = Validate.clean($('mInArtDesc')?.value);
    const lot = Validate.clean($('mInLot')?.value, true);
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
    /* 1.13 — se il motore proponeva un altro vano, il motivo entra nel
       movimento: è l'unico dato che dirà se le regole valgono. */
    const scavalcato = this._notaScavalco(loc);
    await this._logMov(MOV.IN, art, effectiveDesc, lot, loc, null, '',
      scavalcato + (versoUdc ? `${scavalcato ? ' · ' : ''}su unità ${versoUdc.udc.udc_id}` : ''),
      '', res.qty_before, qty, res.qty_after, res.qty_uom_delta);

    /* La riga sale sull'unità DOPO che è entrata in giacenza: prima non
       esiste ancora niente da caricare. Se l'assegnazione non riesce, il
       posizionamento resta — la merce è a scaffale davvero — e chi legge
       lo sa dal messaggio invece che dal pallet sbagliato la settimana
       dopo. */
    if (versoUdc) {
      try {
        const ok = await Store.assegnaAUdc(loc, `${art}#${lot}`, versoUdc.udc.udc_id);
        if (!ok) throw new Error('assegnazione non riuscita');
      } catch (e) {
        this.toast(`Merce posizionata in ${loc}, ma NON caricata su ${versoUdc.udc.udc_id}: ${(e as Error).message}`, 'error');
      }
    }

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
