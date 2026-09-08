/* IL CALENDARIO DELLE SPEDIZIONI — 2.34
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   L'ufficio sa che cosa deve partire e quando, e lo scrive sul DDT nella
   data di ritiro previsto. Ma quel dato viveva in una colonna di una tabella
   ordinata per emissione, e «che cosa parte giovedì» si rispondeva scorrendo
   l'elenco con gli occhi. Un mese disegnato risponde in un colpo.

   È UNA VOCE DELLA BARRA E NON UNA SCHEDA DI SPEDIZIONI, per scelta: chi
   programma la settimana non sta movimentando merce, e arrivarci passando
   da Movimenta vorrebbe dire attraversare la maschera del magazzino per
   guardare un'agenda.

   IL CONTO NON SI FA QUI. Settimane, caselle e riepiloghi stanno in
   `modules/calendario.ts`, che è puro: un calendario che si può provare solo
   aspettando mercoledì non si prova. */

import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import {
  grigliaMese, riepilogoGiorno, mesePrecedente, meseSeguente,
  perGiorno, isoLocale, NOMI_MESE, NOMI_GIORNO,
} from '../../modules/calendario';
import { pickupAlertStatus } from '../../modules/pickupAlert';

export const VistaCalendario = {
  /* Il mese guardato. Nasce su quello di oggi e vive quanto la pagina: non è
     una preferenza da conservare — chi torna domani vuole vedere domani. */
  _calAnno: 0,
  _calMese: 0,

  renderCalendario() {
    const el = $('viewCalendar');
    if (!el) return;
    if (!this._calAnno) {
      const oggi = new Date();
      this._calAnno = oggi.getFullYear();
      this._calMese = oggi.getMonth() + 1;
    }

    /* SI GUARDANO I DOCUMENTI PENDENTI E GLI EVASI DI RECENTE. Un DDT già
       partito resta sul calendario del suo giorno: «che cosa è uscito
       giovedì» è la stessa domanda di «che cosa esce giovedì», fatta il
       venerdì. */
    const documenti = Store.getAllOutbound();
    const settimane = grigliaMese(this._calAnno, this._calMese, documenti);
    const { senzaData } = perGiorno(documenti);
    const pendentiSenzaData = senzaData.filter((d) => d.status === 'pending');

    const prima = mesePrecedente(this._calAnno, this._calMese);
    const dopo = meseSeguente(this._calAnno, this._calMese);

    el.innerHTML = `
      <div class="ct-card">
        <div class="flex items-center justify-between flex-wrap gap-4 mb-5">
          <h1 class="text-title-large text-sx-primary font-bold">
            ${this._ico('calendar-event')} ${NOMI_MESE[this._calMese - 1]} ${this._calAnno}
          </h1>
          <div class="flex gap-3">
            <button class="btn btn-sm" onclick="App._calVai(${prima.anno},${prima.mese})" title="Mese precedente">&larr;</button>
            <button class="btn btn-sm" onclick="App._calOggi()">Oggi</button>
            <button class="btn btn-sm" onclick="App._calVai(${dopo.anno},${dopo.mese})" title="Mese seguente">&rarr;</button>
          </div>
        </div>
        <p class="text-body-small text-sx-text-secondary mb-6">
          Le spedizioni stanno sul giorno del <strong>ritiro previsto</strong> del vettore, che &egrave;
          lo stesso dato su cui il cruscotto calcola i suoi avvisi. Un documento che quella data non
          ce l&rsquo;ha non compare qui: si trova in fondo, e si programma dalla maschera del DDT.
        </p>

        <div class="cal-griglia" role="grid" aria-label="Spedizioni del mese">
          ${NOMI_GIORNO.map((g) => `<div class="cal-testata" role="columnheader">${g}</div>`).join('')}
          ${settimane.map((sett) => sett.map((g) => this._calCasellaHTML(g)).join('')).join('')}
        </div>

        ${pendentiSenzaData.length ? `<div class="mov-preview mov-preview-warn mt-6">
          <strong>${this._ico('alert-triangle')} ${pendentiSenzaData.length} document${pendentiSenzaData.length === 1 ? 'o' : 'i'} senza data di ritiro</strong>
          <div class="text-body-small mt-2 opacity-85">
            Non stanno su nessun giorno perch&eacute; nessuno ha ancora detto quando parte.
            Si compila dalla maschera del DDT, e da quel momento compaiono qui e negli avvisi.
          </div>
          <div class="mt-3 flex gap-2 flex-wrap">
            ${pendentiSenzaData.slice(0, 12).map((d) => `<button class="badge badge-amber mono"
              onclick="App._calApriDoc('${this._esc(d.doc_id)}')">${this._esc(d.ddt_num || d.doc_id)}</button>`).join('')}
            ${pendentiSenzaData.length > 12 ? `<span class="badge badge-muted">+${pendentiSenzaData.length - 12}</span>` : ''}
          </div>
        </div>` : ''}
      </div>`;
  },

  /** Una casella. Porta il numero del giorno, quante spedizioni e quanti
      colli — non l'elenco: in una casella di un mese ci stanno due numeri, e
      un elenco troncato a due righe è un elenco che mente sul resto. */
  _calCasellaHTML(g) {
    const r = riepilogoGiorno(g);
    /* Il colore lo decide lo stesso `pickupAlert` del cruscotto: un giorno
       che il cruscotto chiama «in ritardo» non può essere verde qui. */
    const stato = r.documenti ? pickupAlertStatus({ expected_pickup_date: g.iso }) : null;
    const classi = [
      'cal-casella',
      g.fuori ? 'cal-fuori' : '',
      g.oggi ? 'cal-oggi' : '',
      r.documenti ? `cal-${stato?.level || 'ok'}` : '',
    ].filter(Boolean).join(' ');

    return `<div class="${classi}" role="gridcell"
      ${r.documenti ? `onclick="App._calApriGiorno('${g.iso}')" tabindex="0"` : ''}
      aria-label="${g.iso}${r.documenti ? ` — ${r.documenti} spedizioni` : ''}">
      <div class="cal-numero">${g.giorno}</div>
      ${r.documenti ? `<div class="cal-conto">
        <span class="badge badge-green">${r.documenti} DDT</span>
        <span class="cal-colli">${r.colli} Coll.</span>
        ${r.evasi ? `<span class="badge badge-muted">${r.evasi} evasi</span>` : ''}
      </div>` : ''}
    </div>`;
  },

  _calVai(anno, mese) {
    this._calAnno = anno;
    this._calMese = mese;
    this.renderCalendario();
  },

  _calOggi() {
    const o = new Date();
    this._calVai(o.getFullYear(), o.getMonth() + 1);
  },

  /** Il dettaglio di un giorno: l'elenco che nella casella non ci stava. */
  _calApriGiorno(iso) {
    const { mappa } = perGiorno(Store.getAllOutbound());
    const docs = mappa.get(iso) || [];
    if (!docs.length) return;
    const d = new Date(iso + 'T12:00:00');
    this.showModal(
      `${this._ico('calendar-event')} ${d.getDate()} ${NOMI_MESE[d.getMonth()]} ${d.getFullYear()}`,
      `<div class="text-body-small text-sx-text-secondary mb-4">
         ${docs.length} spedizion${docs.length === 1 ? 'e' : 'i'} con ritiro previsto in questo giorno.
       </div>
       <table class="ct-table"><thead><tr>
         <th>N° DDT</th><th>Destinatario</th><th class="w-[90px]">Righe</th><th class="w-[110px]">Stato</th>
       </tr></thead><tbody>
       ${docs.map((x) => `<tr>
         <td class="mono font-semibold">${this._esc(x.ddt_num || x.doc_id)}</td>
         <td>${this._esc(x.destination || '—')}</td>
         <td class="mono">${(x.lines || []).length}</td>
         <td><span class="badge ${x.status === 'evaded' ? 'badge-muted' : 'badge-green'}">${x.status === 'evaded' ? 'Evaso' : 'Pendente'}</span></td>
       </tr>`).join('')}
       </tbody></table>`,
      '<button class="btn" onclick="App.closeModal()">Chiudi</button>',
    );
  },

  /** Dal calendario al documento: si va dove si corregge la data. */
  _calApriDoc(docId) {
    this.switchView('movimenta');
    setTimeout(() => {
      this.startMov('shipping');
      setTimeout(() => {
        const det = document.querySelector(`details[data-doc-id="${docId}"]`) as HTMLDetailsElement | null;
        if (det) { det.open = true; det.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, 120);
    }, 60);
  },
} satisfies Vista;
