import { type Vista, $, $sel } from './vista';
import { Store } from '../../core/store';
import { proponiStampante, COPIE_MAX, leggiCopie } from '../../modules/stampanti';
import type { Stampante } from '../../modules/stampanti';

/* ═══ 2.19 · CHI STAMPA, E QUANTE ═════════════════════════════════════════
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   La maschera che sta fra «premo il pulsante» e «l'etichetta esce». Vive in
   un file suo perché la chiamano in due — l'unità di carico da `udc.ts` e
   la merce da `giacenze.ts` — e perché la stessa domanda fatta in due modi
   diversi nelle due schede sarebbe la stessa domanda imparata due volte da
   chi lavora.

   ── LE DUE COSE CHE CHIEDE, E PERCHÉ SI COMPORTANO ALL'OPPOSTO ────────────

   LA STAMPANTE SI RICORDA. Chi ha scelto una stampante sta in piedi accanto
   a quella, e resterà lì per tutto il turno: richiederglielo a ogni
   etichetta è una domanda a cui esiste già la risposta. Il ricordo sta nel
   `localStorage` di QUEL browser e non a database — quale macchina hai
   vicino è un fatto del posto in cui stai, non dell'azienda, e scriverlo a
   database vorrebbe dire che l'ultimo terminale che sceglie decide per tutti.

   LE COPIE NO, E TORNANO SEMPRE A UNA. Un'etichetta per volta è il caso
   normale; le sei copie sono l'eccezione di quel gesto lì. Ricordare «6»
   vorrebbe dire che alla prossima riga ne escono sei senza che nessuno le
   abbia chieste — sei etichette buttate, o peggio sei etichette uguali
   attaccate a merce diversa. Un'eccezione che si ricorda smette di essere
   un'eccezione.

   ── «INVIATA» NON È «STAMPATA», E LA MASCHERA LO DICE ────────────────────

   La porta 9100 accetta i byte e chiude: carta finita, testina aperta e
   nastro esaurito passano tutti come successo. Il servizio risponde con due
   fatti separati — `inviata`, certo, e `stato`, che è quel che la macchina
   ha detto a `~HQES` — e il riscontro a video dichiara quale dei due sta
   mostrando. §8: un pallet senza etichetta è un pallet che nessuno può
   scansionare, e un fallimento muto ne produce uno a ogni creazione finché
   qualcuno non va a guardare il rotolo.

   ── L'A4 RESTA, E NON È UN RIPIEGO DI CORTESIA ──────────────────────────

   §8 dice che la stampa non si migra: le tre `@media print` restano dove
   sono. Qui la regola lavora a favore — la Zebra si AFFIANCA al foglio, non
   lo sostituisce. Stampante spenta, rotolo finito, rete giù: l'etichetta
   esce lo stesso su A4 dal browser, come è sempre uscita. Senza quel
   pulsante, un guasto alla stampante fermerebbe la creazione delle unità di
   carico. */

export const VistaStampaEtichette = {

  /* Il sito di un'ubicazione è il primo pezzo del suo codice —
     `MAG1-RAKA-04-01-T`. Serve a proporre la stampante giusta: quella di
     MAG1 è quella vicina a MAG1, e mandare un'etichetta di MAG1 sulla
     stampante di MAG2 vuol dire un operatore che attraversa il magazzino
     per raccogliere un pezzo di carta. */
  _sitoDiUbicazione(code: string): string {
    return String(code ?? '').split('-')[0] || '';
  },

  /**
   * La maschera. `richiesta` dice cosa si stampa; `suA4` è la funzione che
   * stampa lo stesso su foglio, e viene da chi chiama perché le due etichette
   * hanno due `@media print` diverse.
   */
  _chiediStampaEtichetta(richiesta: {
    tipo: 'item' | 'udc';
    item_key?: string; location_code?: string; udc_id?: string;
    titolo: string; suA4: string;
  }) {
    const stampanti = Store.getStampanti().filter((s: Stampante) => s.attiva !== false);
    const servito = Store.eServito();

    /* DA FILE NON C'È NESSUNO CHE POSSA APRIRE UN SOCKET, e la maschera lo
       dice invece di offrire una tendina che non stamperà. Stessa cosa
       quando di stampanti non ne è stata configurata nessuna: si va al
       foglio, che è quel che l'applicativo faceva ieri. */
    if (!servito || !stampanti.length) {
      return this.showModal(
        `🏷 ${this._esc(richiesta.titolo)}`,
        `<div class="mov-preview mov-preview-warn mb-7 leading-[1.6]">
          ${!servito
            ? '<strong>Questa macchina lavora da file.</strong> La stampa in rete la fa il servizio: senza, non c’è nessuno che possa parlare alla stampante.'
            : '<strong>Nessuna stampante configurata.</strong> Le Zebra in rete si aggiungono in <strong>Configurazione → Stampanti</strong>.'}
          <br>L’etichetta esce su <strong>A4 dal browser</strong>, come è sempre uscita.
        </div>`,
        `<button class="btn" onclick="App.closeModal()">Annulla</button>
         <button class="btn btn-primary" onclick="App.closeModal();${richiesta.suA4}">🖨 Stampa su A4</button>`
      );
    }

    const proposta = proponiStampante(stampanti, {
      ricordata: Store.getStampanteRicordata(),
      siteId: this._sitoDiUbicazione(richiesta.location_code || ''),
    });

    const carico = JSON.stringify({
      tipo: richiesta.tipo, item_key: richiesta.item_key || '',
      location_code: richiesta.location_code || '', udc_id: richiesta.udc_id || '',
    }).replace(/"/g, '&quot;');

    this.showModal(
      `🏷 ${this._esc(richiesta.titolo)}`,
      `<div class="form-group mb-6">
        <label>Stampante <span class="req">*</span></label>
        <select class="input select" id="stpQuale">
          ${stampanti.map((s: Stampante) => `<option value="${this._esc(s.printer_id)}"
            ${proposta && s.printer_id === proposta.printer_id ? 'selected' : ''}>${this._esc(s.nome)}${s.site_id ? ` — ${this._esc(s.site_id)}` : ''}</option>`).join('')}
        </select>
        <div class="text-label-small text-sx-text-muted mt-2">
          ${proposta
            ? `Proposta: <strong>${this._esc(proposta.nome)}</strong> — ${this._esc(proposta.host)}. La scelta resta su questo terminale.`
            : 'Nessuna proposta: scegli tu, e da qui in poi resta questa.'}
        </div>
      </div>
      <div class="form-group mb-0">
        <label>Quante etichette</label>
        <input class="input" id="stpCopie" type="number" inputmode="numeric"
               value="1" min="1" max="${COPIE_MAX}" style="width:110px">
        <div class="text-label-small text-sx-text-muted mt-2">
          Torna sempre a <strong>1</strong>: le copie in più sono l’eccezione di questo gesto, non la regola del prossimo. Massimo ${COPIE_MAX}.
        </div>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn" onclick="App.closeModal();${richiesta.suA4}">🖨 Su A4</button>
       <button class="btn btn-success" onclick="App._eseguiStampaEtichetta(${carico})">🏷 Stampa</button>`
    );
    /* Il campo delle copie si prende il fuoco e si seleziona: chi ne vuole
       tre digita «3» e basta, senza prima cancellare l'uno. */
    setTimeout(() => { const c = $('stpCopie'); c?.focus(); c?.select(); }, 30);
  },

  async _eseguiStampaEtichetta(richiesta: {
    tipo: 'item' | 'udc'; item_key?: string; location_code?: string; udc_id?: string;
  }) {
    const printer_id = String($sel('stpQuale')?.value || '');
    const copie = leggiCopie($('stpCopie')?.value);
    if (!printer_id) return this.toast('Nessuna stampante scelta', 'error');
    this.closeModal();

    try {
      const esito = await Store.stampaEtichetta({ ...richiesta, printer_id, copie });
      /* La scelta si ricorda SOLO dopo una riuscita: memorizzare una
         stampante che non ha stampato vuol dire riproporla al gesto dopo,
         che fallirà anche quello. */
      Store.ricordaStampante(printer_id);
      this._riscontroStampa(esito, copie);
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  },

  /* IL RISCONTRO DICE QUALE DEI DUE FATTI STA MOSTRANDO.

     Tre casi, e sono tre messaggi diversi perché sono tre situazioni
     diverse per chi sta in corsia:

     · stampante che ha risposto e sta bene → l'etichetta è uscita, verde;
     · stampante che ha risposto ED HA UN ERRORE → l'etichetta NON è uscita
       anche se l'invio è riuscito, e questo è il caso che vale tutto il
       resto: rosso, e dice cosa guardare sulla macchina;
     · stampante che non ha risposto → inviata, stato sconosciuto. Giallo, e
       lo dice: non è un guasto — è un server di stampa che non conosce
       `~HQES` — ma non è nemmeno una conferma. */
  _riscontroStampa(esito: {
    stampante: string; stato: { noto: boolean; errori: boolean; dettagli: string[] };
  }, copie: number) {
    const quante = copie === 1 ? '1 etichetta' : `${copie} etichette`;
    if (esito.stato?.noto && esito.stato.errori) {
      return this.toast(
        `⚠️ ${esito.stampante}: inviata, ma la stampante segnala ${esito.stato.dettagli.join(', ')} — l’etichetta NON è uscita`,
        'error');
    }
    if (esito.stato?.noto) {
      return this.toast(`🏷 ${quante} da ${esito.stampante}`, 'success');
    }
    return this.toast(
      `🏷 ${quante} inviate a ${esito.stampante} — la stampante non dichiara il proprio stato: va guardata`,
      'warning');
  },

  /** La prova, dalla scheda di configurazione. Un'etichetta che non porta
      merce, e lo stato letto subito dopo. */
  async _provaStampante(printerId: string) {
    this.toast('Invio la prova…', 'info');
    try {
      const esito = await Store.provaStampante(printerId);
      if (esito.stato?.noto && esito.stato.errori) {
        return this.toast(
          `⚠️ ${esito.stampante} (${esito.host}:${esito.porta}): ${esito.stato.dettagli.join(', ')}`,
          'error');
      }
      if (esito.stato?.noto) {
        return this.toast(`✓ ${esito.stampante} risponde e sta bene — l’etichetta di prova è uscita`, 'success');
      }
      return this.toast(
        `${esito.stampante}: il collegamento c’è, la prova è partita. La macchina non dichiara il proprio stato — va guardata`,
        'warning');
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  },

} satisfies Vista;
