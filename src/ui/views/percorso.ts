import { type Vista, $ } from './vista';
import { caricaExcel } from '../../modules/excel';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { OdpParser } from '../../modules/odpParser';
import { PickRoute } from '../../modules/pickRoute';
import {
  daPreparare, motivoNonPreparabile, daImballare, daImballareDalDoc, unitaGiaPronte,
} from '../../modules/preparazione';
import { zonaImballoDi, zoneImballo, zonaSpedizioneDi, zoneSpedizione } from '../../modules/bancale';
import { tappeAltrove, richiestaTrasferimento, tappaInAttesa, sitoDiCasa } from '../../modules/trasferimentiOdp';
import { etichettaTipo } from '../../modules/compiti';
import { descriviColli as descriviElencoColli, eccedenza as eccedenzaColli } from '../../modules/colli';
import { colonnaDi, type Colonna } from '../../modules/colonna';
import { formattaQuantita } from '../../modules/misure';
import type { Percorso, Tappa } from '../../modules/pickRoute';
import {
  ordineDelGiro, ricalibra, qtaPianificata, normalizzaOdp, fabbisogno, numeriDelGiro,
  chiaveRiga,
  type OrdineDelGiro, type Richiesta,
} from '../../modules/giroOdp';
import type { CoperturaRiga } from '../../modules/wip';
import type { SessionePrelievo } from '../../types/entita';
import { ScanGuard } from '../../modules/scanGuard';
import { Dialog } from '../dialog';
import { Feedback } from '../feedback';

/* Dove altro sta lo stesso lotto, quando la tappa non lo trova. */
type Alternativa = { location_code: string; item_key: string; qty_available: number };

/* Una pausa dichiarata: un'ora d'inizio, una di fine — nulla se è quella in
   corso — e chi l'ha presa. */
type Pausa = { from: number; to: number | null; by?: string };

/* 2.12 — IL GIRO LETTO, prima che diventi un percorso avviato: gli ordini
   caricati piu' la serpentina che ne esce.

   Fino alla 2.11 questo era UN ordine — `header`, `warnings`, `file_name` —
   e la maschera lo leggeva da lì. Adesso gli ordini sono uno o piu': quel
   che resta di singolare e' il CAPOFILA, che intesta il conto di produzione
   e che con un file solo e' l'unico ordine che c'e'. */
type GiroLetto = Percorso & {
  ordini: OrdineDelGiro[];
  capofila: string;
  warnings: string[];
  /** Quel che il giro chiede e che è già fermo nel vano di lavorazione. */
  copertura: CoperturaRiga[];
};

export const VistaPercorso = {
  _routeStage: 'import',        // 'import' | 'run'
  /* 2.35.1 — L'ATTIVITA' DA CUI VIENE LA DISTINTA, fra la lettura e
     l'avvio. La sessione di preparazione porta `task_id` dalla 2.31 ed e'
     cosi' che ritrova il proprio lavoro; quella del prelievo ODP non lo
     portava, quindi il percorso e l'attivita' erano due cose scollegate:
     chiudere il percorso lasciava l'attivita' in carico per sempre, e
     riprenderla non riapriva niente. Vuoto = giro caricato a mano dalla
     maschera, che di attivita' non ne ha nessuna. */
  _routeCompito: '',
  _routeParsed: null,           // il giro letto, vivo solo fra import e avvio
  /* 2.12 — GLI ORDINI CARICATI, nell'ordine in cui sono stati letti. Il
     primo e' il capofila finche' non si sceglie altrimenti. */
  _routeOrdini: [],
  _routeCapofila: '',
  /* 2.31 — `udc` accanto alle tre. Su una tappa di unità di carico è
     l'UNICA che si chiede: articolo e lotto stanno sotto il cellophane. */
  _routeScan: { loc: '', art: '', lot: '', udc: '' },
  /* 2.5 — PER QUALE TAPPA VALE LA SCANSIONE QUI SOPRA.

     `_routeScan` era azzerato dal render, e il render non è l'unico modo di
     tornare su questa schermata: si rientra dalla scheda, dalla ripresa
     all'avvio, dal cambio di sottomodo. Bastava una di quelle strade perché
     la spunta di un'ubicazione scansionata mezz'ora prima valesse ancora, e
     l'operatore confermasse un prelievo senza essere passato dal vano.

     2.12 — LA SCANSIONE VALE PER UN VANO, NON PER UNA TAPPA. Chi deve
     prendere quattro articoli dallo stesso scaffale scansionava quattro
     volte lo stesso codice a terra, e la quarta la digitava senza guardare:
     una verifica che si ripete quando non c'è niente da riverificare è una
     verifica che si smette di fare.

     La chiave e' `<ubicazione>@<apertura>`. `seq` e' uscito, e non e' un
     allentamento: quel che la spunta deve garantire e' che l'operatore sia
     passato DAVANTI A QUEL VANO in QUESTA apertura, e il numero della tappa
     non c'entrava. Cambiare vano, spostarsi su un'alternativa o rientrare
     nella schermata la invalidano tutte e tre, come prima. */
  _routeScanChiave: '',
  /* Cambia a ogni ingresso nella schermata di esecuzione: è la metà
     «apertura» della chiave qui sopra. */
  _routeApertura: 0,
  _routeStartTime: null,

  /* ─── SCHERMATA 1: IMPORT ───────────────────────────────────────── */
  _formOrdine(el) {
    /* La guardia che hanno tutte le altre maschere e questa non aveva. Chi
       chiama passa `$('pickSubForm')`, che è null ogni volta che si è usciti
       dal ramo «Da ordine» — e allora saltava un TypeError che a video
       sembrava un errore di lettura del file. Visto due volte il 19/08:
       all'import e alla richiesta di trasferimento. */
    if (!el) return;
    const session = Store.getActivePickSession();
    if (session && this._routeStage === 'run') { this._renderRouteRun(el); return; }

    if (!this._prodOperator) this._prodOperator = Store.getCurrentIdentity().initials;
    const parsed = this._routeParsed;

    el.innerHTML = `
      <div class="wf-instructions">
        <strong>Flusso:</strong> <span class="wf-step">① Carica l'XLSX dell'ODP</span> →
        <span class="wf-step">② Verifica l'esito</span> →
        <span class="wf-step">③ AVVIA PERCORSO</span> → scansione guidata tappa per tappa.
      </div>

      ${session ? `<div class="route-resume">
        <strong>⏸ Percorso gi&agrave; in corso</strong>
        <div>Ordine ${this._esc(session.odp_num)} — ${(session.stops || []).filter((s) => s.status !== 'pending').length} di ${(session.stops || []).length} tappe completate.</div>
        <div class="flex gap-5 mt-6 flex-wrap">
          <button class="btn btn-accent" onclick="App._routeResume()">▶ Riprendi</button>
          <button class="btn btn-danger" onclick="App._routeAbandon()">${this._ico('x')} Chiudi percorso</button>
        </div>
        <div class="text-body-small mt-5 opacity-85">
          Caricando un nuovo ordine questo percorso verr&agrave; chiuso.
        </div>
      </div>` : ''}

      <div class="form-group mb-6">
        <label>Operatore <span class="req">*</span></label>
        <input class="input" id="pRouteOperator" placeholder="Nome operatore" maxlength="${Validate.MAX.OPERATOR}"
          value="${this._esc(this._prodOperator)}" onchange="App._prodOperator=this.value">
      </div>

      <div class="flex gap-5 flex-wrap mb-7">
        <button class="btn btn-primary min-h-touch"
          onclick="$('fileImportOdp').click()">${this._ico('file-text')} ${parsed ? 'Aggiungi un altro ordine' : 'Carica ordine'} (.xlsx)</button>
        ${parsed ? '<button class="btn btn-ghost" onclick="App._routeClearImport()">Scarta tutto</button>' : ''}
      </div>

      <section id="routeImportResult">${parsed ? this._routeImportResultHTML() : ''}</section>

      <div class="kbd-hint mt-7">
        <span class="text-body-small text-sx-text-muted">
          Solo il file <strong>.xlsx</strong> di Sage X3 &mdash; il PDF arrotonda le quantit&agrave;.
          Pi&ugrave; ordini si caricano uno alla volta.
        </span>
      </div>`;
    this.setPrimaryScanField(null);
  },

  _routeClearImport() {
    this._routeParsed = null;
    this._routeOrdini = [];
    this._routeCapofila = '';
    this._formOrdine($('pickSubForm'));
  },

  /* ─── 2.12 · IL GIRO: PIÙ ORDINI, UN PERCORSO ───────────────────────
     © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

     Il caso e' quello dei cinque ODP che chiedono lo stesso articolo dallo
     stesso lotto: prelevati uno per volta sono cinque giri sulle stesse
     corsie, e il primo che apre un collo lascia agli altri quattro un lotto
     che a scaffale non basta piu'.

     LE DISTINTE SI SOMMANO PRIMA DEL CAMMINO. `modules/giroOdp.ts` le
     unisce, `PickRoute.buildGiro` ne fa un percorso solo, e le tappe
     portano `richieste` — quanto ne vuole ciascun ordine.

     IL CONTO DI PRODUZIONE RESTA UNO, intestato al CAPOFILA. Gli altri
     ordini stanno scritti sul movimento, e la ripartizione si dichiara alla
     chiusura, quando i numeri si sanno: prima di allora ogni quota sarebbe
     una previsione scritta come un fatto. */

  /* Ricostruisce il percorso da quel che e' caricato adesso. Si richiama a
     ogni cambiamento — un ordine in piu', uno tolto, una quantita'
     ricalibrata — perche' la serpentina dipende da TUTTE le tappe insieme:
     ricalcolarne una sola darebbe un giro che cammina all'indietro. */
  _routeRicostruisci() {
    const ordini: OrdineDelGiro[] = this._routeOrdini || [];
    if (!ordini.length) { this._routeParsed = null; this._routeCapofila = ''; return; }
    if (!ordini.some((o) => o.odp_num === this._routeCapofila)) {
      this._routeCapofila = ordini[0]!.odp_num;
    }
    const route = PickRoute.buildGiro(ordini);
    this._routeParsed = {
      ...route,
      ordini,
      capofila: this._routeCapofila,
      /* Gli avvisi portano il numero dell'ordine da cui vengono: con piu'
         file, «unita' non dichiarata» senza dire di chi manda a cercare in
         cinque fogli. */
      warnings: ordini.flatMap((o) => (o.warnings || []).map(
        (w) => (ordini.length > 1 ? `${o.odp_num} · ${w}` : w))),
      /* SI RICALCOLA A OGNI RICOSTRUZIONE, e non solo all'import: la
         quantità si ricalibra e un ordine si toglie, e con loro cambia il
         fabbisogno. Un numero fermo a com'era al primo file direbbe che è
         coperto quello che non lo è più. */
      copertura: Store.coperturaWip(fabbisogno(ordini), numeriDelGiro(ordini)),
    };
  },

  /** L'ordine capofila: quello che intesta il conto di produzione. */
  _routeSetCapofila(odp) {
    const k = normalizzaOdp(odp);
    if (!(this._routeOrdini || []).some((o: OrdineDelGiro) => o.odp_num === k)) return;
    this._routeCapofila = k;
    this._routeRicostruisci();
    this._formOrdine($('pickSubForm'));
  },

  /** Toglie un ordine dal giro. Gli altri non si ricaricano: la distinta si
      rifa' da quelli rimasti. */
  _routeTogliOrdine(odp) {
    const k = normalizzaOdp(odp);
    this._routeOrdini = (this._routeOrdini || []).filter((o: OrdineDelGiro) => o.odp_num !== k);
    this._routeRicostruisci();
    this._formOrdine($('pickSubForm'));
    this.toast(`Ordine ${k} tolto dal giro`, 'info');
  },

  /* LA QUANTITÀ TOTALE SI PUÒ CAMBIARE, E LA DISTINTA SI RICALIBRA.

     La distinta di Sage e' proporzionale alla quantita' in testata: produrre
     il doppio vuol dire il doppio di ogni materia prima. Il fattore riparte
     SEMPRE dalle righe originali — vedi `ricalibra` — perche' due
     ricalibrazioni di fila comporrebbero i fattori.

     Campo vuoto o non numerico = si torna alla quantita' dell'ordine. */
  _routeQtaOrdine(odp, valore) {
    const k = normalizzaOdp(odp);
    const i = (this._routeOrdini || []).findIndex((o: OrdineDelGiro) => o.odp_num === k);
    if (i === -1) return;
    const prima = this._routeOrdini[i];
    if (qtaPianificata(prima.header) === null && String(valore ?? '').trim()) {
      return this.toast(`${k}: la quantità dell'ordine non è un numero nel foglio — non si può ricalibrare`, 'error');
    }
    this._routeOrdini[i] = ricalibra(prima, valore);
    this._routeRicostruisci();
    this._formOrdine($('pickSubForm'));
    const f = this._routeOrdini[i].fattore;
    if (f !== 1) this.toast(`${k} ricalibrato · ×${this._qtaOrdine(f, null)}`, 'warning');
  },

  /* Lettura del file. Ogni errore è esplicito: un import che fallisce a metà
     e lascia un percorso parziale sarebbe il peggior esito possibile.

     2.12 — UN FILE SI AGGIUNGE, NON SOSTITUISCE. Il giro si compone un
     ordine alla volta, e un file che non si legge lascia intatti quelli
     gia' caricati: buttare via quattro ordini letti bene perche' il quinto
     e' il documento sbagliato sarebbe il modo di far ricominciare da capo. */
  async handleImportOdp(event) {
    const file = event.target.files?.[0];
    event.target.value = '';                     // consente di ricaricare lo stesso file
    if (!file) return;
    await this._routeLeggiFile(file);
  },

  /* 2.32 — LA LETTURA DI UNA DISTINTA, separata da chi gliela porta.
     Fino alla 2.31 il file arrivava da un solo posto: l'input della
     maschera. Dalla 2.32 ne arriva anche un secondo — l'allegato di
     un'attività, scaricato dal servizio — e le due strade devono finire
     nello stesso identico posto: stesse convalide, stessi rifiuti, stesso
     riscontro. Due letture della stessa distinta sono due parser che fra un
     mese diranno cose diverse. */
  /* 2.35.1 — RESTITUISCE SE HA LETTO DAVVERO. Ogni rifiuto qui dentro ha
     il suo riscontro; chi chiama pero' non aveva modo di saperlo, e
     `_odpAvvia` ne aggiungeva uno verde sopra. Un booleano, e i due
     riscontri non si contraddicono piu'. */
  async _routeLeggiFile(file): Promise<boolean> {
    if (!file) return false;
    if (!/\.xlsx?$/i.test(file.name)) {
      this.toast('Formato non valido · Caricare il file .xlsx esportato da Sage X3', 'error');
      return false;
    }
    try {
      /* 1.7 — il parser resta sincrono e non importa SheetJS: glielo diamo
         qui, dopo che il chunk e' arrivato. Vedi `modules/odpParser.ts`. */
      OdpParser.usaXLSX(await caricaExcel());
      const buf = await file.arrayBuffer();
      const res = OdpParser.parse(buf);
      if (!res.ok) {
        this._formOrdine($('pickSubForm'));
        this.toast(`Import non riuscito · ${res.error}`, 'error');
        return false;
      }
      const odp = normalizzaOdp(res.header.odp_num);
      /* LO STESSO ORDINE DUE VOLTE RADDOPPIEREBBE LA SUA DISTINTA, e il
         percorso chiederebbe il doppio della merce senza che si veda da
         nessuna parte. Chi voleva davvero il doppio lo scrive nella
         quantita', che e' il campo che serve a quello. */
      /* 2.35.2 — LO STESSO ORDINE RICARICATO SI RINFRESCA, NON SI RIFIUTA.

         Qui si rispondeva «è già nel giro» e non si faceva niente. La difesa
         era giusta — caricarlo due volte SOMMEREBBE le sue righe, e il
         percorso chiederebbe il doppio della merce senza che si veda da
         nessuna parte — ma il rifiuto colpiva il gesto sbagliato.

         Andrea, l'08/09: chiuso il percorso a metà, l'attività resta in
         lista; l'operatore preme di nuovo Avvia, e chi ha appena visto una
         schermata che non cambia lo preme due volte. Al secondo premere
         arrivava «è già nel giro», che a chi sta cercando di riprendere il
         lavoro suona come «non si può rifare». Il sistema aiuta, non blocca.

         Si sostituisce la copia vecchia con quella appena letta: il
         fabbisogno resta quello dell'ordine — una volta sola — e le tappe si
         ricostruiscono sul magazzino di ADESSO, che è quel che serve a chi
         riprende un giro interrotto. Chi vuole davvero il doppio lo scrive
         nella quantità, che è il campo che serve a quello. */
      const gia = (this._routeOrdini || []).findIndex((o: OrdineDelGiro) => o.odp_num === odp);
      if (gia > -1) {
        const ordini = [...this._routeOrdini];
        ordini[gia] = ordineDelGiro(res.header, res.lines, res.warnings, file.name);
        this._routeOrdini = ordini;
        this._routeRicostruisci();
        this._formOrdine($('pickSubForm'));
        const q: GiroLetto = this._routeParsed;
        this.toast(`Ordine ${odp} riletto · ${(q.stops || []).length} tappe sul magazzino di adesso`
          + ' · per prelevarne di più, cambia la quantità', 'info');
        return true;
      }
      /* 2.35.2 — E UN ORDINE CHIUSO SI PUÒ RIPRENDERE, dicendolo.

         Qui si rifiutava: «serve un numero d'ordine nuovo». Ma un numero
         d'ordine non lo inventa il magazzino, lo emette la produzione — e
         chi si trovava davanti quel rifiuto aveva davanti due strade,
         entrambe peggiori: un numero finto, o la merce portata via senza
         registrarla. Il conto tiene il fatto (`riaperto`), e chi carica lo
         legge qui. */
      const riaperto = Store.ordineWipArchiviato(odp);
      this._routeOrdini = [...(this._routeOrdini || []),
        ordineDelGiro(res.header, res.lines, res.warnings, file.name)];
      this._routeRicostruisci();
      this._formOrdine($('pickSubForm'));
      const p: GiroLetto = this._routeParsed;
      const n = (p.stops || []).length, o = p.offroute.length;
      const quanti = this._routeOrdini.length;
      /* La copertura si dice nel riscontro: il riquadro sta sotto la scheda
         dell'ordine, e chi carica cinque file non lo vede scorrere. */
      const cop = (p.copertura || []).length;
      this.toast(`Ordine ${odp} letto · ${quanti > 1 ? `${quanti} ordini nel giro · ` : ''}${n} tappe, ${o} righe in coda${cop ? ` · ${cop} già in reparto` : ''}`, n ? 'success' : 'warning');
      /* Secondo e separato, perché è un fatto sull'ORDINE e non sul giro: chi
         legge deve poterlo distinguere dal riscontro della lettura. */
      if (riaperto) {
        this.toast(`${odp} è un conto già CHIUSO: quel che prelevi adesso ci rientra dentro, e il conto risulterà riaperto. `
          + 'Le righe già scese stanno nel riquadro qui sopra.', 'warning');
      }
      return true;
    } catch (err) {
      console.error('[WM] handleImportOdp:', err);
      this._formOrdine($('pickSubForm'));
      this.toast(`Errore di lettura · ${(err as Error).message}`, 'error');
      return false;
    }
  },

  /* La scheda di UN ordine del giro: testata, quantità ricalibrabile, e i
     due gesti — farlo capofila, toglierlo. Con un ordine solo il capofila
     non si sceglie (è lui) e non si toglie (resterebbe il vuoto): quei due
     comandi nascono con il secondo file. */
  /* `primo` accende l'unica riga di spiegazione della scheda. Con cinque
     ordini caricati quella frase si ripeteva cinque volte, e cinque copie
     della stessa istruzione non insegnano cinque volte: si smette di
     leggerle tutte, compresa la prima. */
  _routeOrdineCardHTML(o: OrdineDelGiro, soli: boolean, primo = true) {
    const h = o.header;
    const base = qtaPianificata(h);
    const capo = o.odp_num === this._routeCapofila;
    const id = `rq_${o.odp_num.replace(/[^A-Z0-9]/gi, '')}`;
    return `
      <div class="route-head-card${capo && !soli ? ' route-head-card--capo' : ''}">
        <div class="route-head-grid">
          <div><span class="route-head-lbl">Ordine</span><span class="route-head-val mono">${this._esc(h.odp_num)}</span></div>
          <div><span class="route-head-lbl">Articolo finito</span><span class="route-head-val mono">${this._esc(h.article_code)}</span></div>
          <div><span class="route-head-lbl">Lotto produzione</span><span class="route-head-val mono">${this._esc(h.lot || '—')}</span></div>
          <div><span class="route-head-lbl">Qt&agrave; da ordine</span><span class="route-head-val">${this._esc(h.qty_planned)} ${this._esc(h.um)}</span></div>
        </div>
        <div class="route-head-desc">${this._esc(h.article_desc)}</div>
        <div class="route-head-tools">
          <label class="text-label-small" for="${id}">Quantit&agrave; da produrre</label>
          <input class="input input-mono w-[120px] shrink-0" id="${id}" inputmode="decimal"
            placeholder="${this._esc(String(base ?? h.qty_planned ?? ''))}"
            value="${o.qty_voluta !== null ? this._esc(String(o.qty_voluta)) : ''}"
            ${base === null ? 'disabled title="Il foglio non porta una quantità numerica in testata"' : ''}
            onchange="App._routeQtaOrdine('${this._esc(o.odp_num)}', this.value)">
          <span class="text-label-small text-sx-text-muted">${this._esc(h.um || '')}</span>
          ${o.fattore !== 1 ? `<span class="badge badge-amber">distinta ricalibrata ×${this._esc(this._qtaOrdine(o.fattore, null))}</span>`
            : (primo ? '<span class="text-label-small text-sx-text-muted">vuoto = quella dell&rsquo;ordine</span>' : '')}
          ${soli ? '' : `
            ${capo ? '<span class="badge badge-green">capofila &mdash; tiene il conto</span>'
              : `<button class="btn btn-sm" onclick="App._routeSetCapofila('${this._esc(o.odp_num)}')">Fallo capofila</button>`}
            <button class="btn btn-sm btn-ghost" onclick="App._routeTogliOrdine('${this._esc(o.odp_num)}')">${this._ico('x')} Togli</button>`}
        </div>
      </div>`;
  },

  /* ── QUELLO CHE È GIÀ DI LÀ ────────────────────────────────────────────
     Il conto lo fa `coperturaInLavorazione` (`modules/wip.ts`); qui si
     disegna e basta. NON tocca nessuna tappa: la distinta resta quella che
     l'ordine dichiara, e a decidere se scendere in corsia è l'operatore.
     Scalare da soli un fabbisogno su un residuo che nessuno è andato a
     guardare vorrebbe dire mandare a produrre con meno merce di quella che
     serve, e accorgersene a impasto avviato. */
  _routeCoperturaHTML() {
    const p: GiroLetto | null = this._routeParsed;
    const righe: CoperturaRiga[] = p?.copertura || [];
    if (!righe.length) return '';
    const fuoriGiro = new Set((p!.offroute || []).map((o) => chiaveRiga(o.article_code, o.lot_code)));
    const coperte = righe.filter((r) => r.coperta).length;

    const riga = (r: CoperturaRiga) => {
      const um = r.uom || '';
      /* L'ORDINE DELLE DOMANDE È QUELLO CHE FA L'OPERATORE: quanto ne devo
         ancora prendere? Se il numero non c'è si va a guardare; se è zero
         non si prende niente; se è meno del chiesto si prende la
         differenza; se non c'è niente di proprio, la merce è di un altro. */
      const stato = r.da_prelevare === null
        ? '<span class="badge badge-amber">da verificare di persona</span>'
        : r.coperta
          ? '<span class="badge badge-green">gi&agrave; di l&agrave; &mdash; non serve prelevarlo</span>'
          : r.suo > 0
            ? `<span class="badge badge-amber">ne mancano ${this._esc(this._qtaOrdine(r.da_prelevare, um))} ${this._esc(um)}</span>`
            : '<span class="badge badge-muted">di un altro ordine</span>';
      /* Il numero resta valido, ma di là c'è dell'altro che non si è
         potuto contare: è un MINIMO, e dirlo costa una parola. */
      const minimo = r.incerta && r.da_prelevare !== null
        ? '<span class="badge badge-amber">c&rsquo;&egrave; altra merce non conteggiabile</span>' : '';
      return `<div class="route-note-row">
        ${stato}${minimo}
        <span class="mono">${this._esc(r.article_code)}#${this._esc(r.lot_code)}</span>
        <span>chiesti <strong>${this._esc(this._qtaOrdine(r.chiesto, um))} ${this._esc(um)}</strong></span>
        ${r.suo > 0 ? `<span>gi&agrave; in reparto per il giro <strong>${this._esc(this._qtaOrdine(r.suo, um))} ${this._esc(um)}</strong></span>` : ''}
        ${r.altrui > 0 ? `<span class="text-sx-text-muted">fermi <strong>${this._esc(this._qtaOrdine(r.altrui, um))} ${this._esc(um)}</strong> sul conto di ${this._esc(r.ordini_altrui.join(', '))}</span>`
          : (r.ordini_altrui.length ? `<span class="text-sx-text-muted">c&rsquo;&egrave; merce sul conto di ${this._esc(r.ordini_altrui.join(', '))}</span>` : '')}
        ${fuoriGiro.has(r.item_key) ? '<span class="badge badge-muted">&egrave; anche fra le righe non prelevabili</span>' : ''}
      </div>`;
    };

    return `
      <div class="route-note-box">
        <strong>${this._ico('alert-triangle')} ${righe.length} rig${righe.length === 1 ? 'a &egrave; gi&agrave;' : 'he sono gi&agrave;'} in reparto produzione${coperte ? ` &mdash; ${coperte} coperte per intero` : ''}</strong>
        <div class="text-body-small mt-3 opacity-85">
          Merce di queste righe sta gi&agrave; nel vano di lavorazione. Quella scesa
          <strong>per gli ordini di questo giro</strong> scala il fabbisogno: dove copre tutto,
          la tappa non serve. Quella sul conto di <strong>altri ordini</strong> &egrave; solo
          un&rsquo;informazione &mdash; prenderla sposterebbe un conto, e si decide in produzione.
          <strong>Le tappe restano tutte:</strong> saltarle &egrave; un gesto dell&rsquo;operatore.
        </div>
        ${righe.map(riga).join('')}
      </div>`;
  },

  /* Chi ha chiesto la merce di una tappa, quando il giro porta più ordini. */
  _routeRichiesteHTML(s: Tappa) {
    const r = (s.richieste || []) as Richiesta[];
    if (r.length < 2) return '';
    return `<span class="route-prev-quote">${r.map((x) =>
      `<span class="badge badge-muted mono">${this._esc(x.odp_num)} · ${this._qtaOrdine(x.qty, s.um)}</span>`).join(' ')}</span>`;
  },

  /* Esito dell'import: testata, avvisi, ordine siti, anteprima tappe e coda. */
  _routeImportResultHTML() {
    const p: GiroLetto | null = this._routeParsed;
    if (!p) return '';
    const ordini: OrdineDelGiro[] = p.ordini || [];
    const soli = ordini.length < 2;
    const bySite: Record<string, Tappa[]> = {};
    for (const s of p.stops) (bySite[s.site_id!] = bySite[s.site_id!] || []).push(s);

    /* 1.10 — quali tappe stanno fuori dal magazzino di partenza.
       2.1 — e il magazzino di partenza adesso si può dichiarare: la tendina
       sta qui sotto, e questa riga è la stessa che ordina il giro. */
    const casa = sitoDiCasa(p.stops, PickRoute.getSiteOrder(), PickRoute.getCasaScelta());
    const siti = [...new Set(p.stops.map((s) => s.site_id).filter(Boolean))] as string[];
    const sceltaCasaHTML = siti.length > 1 ? `
      <div class="route-warn mb-5">
        <strong>Magazzino di partenza</strong>
        <div class="flex items-center gap-3 mt-3 flex-wrap">
          <select class="input select w-auto" id="routeCasa" onchange="App._routeSetCasa(this.value)">
            <option value="">Dove l'ordine ha più righe (${this._esc(Store.getSite(casa)?.name || casa)})</option>
            ${siti.map((id) => `<option value="${this._esc(id)}" ${PickRoute.getCasaScelta() === id ? 'selected' : ''}>
              ${this._esc(Store.getSite(id)?.name || id)} — ${p.stops.filter((s) => s.site_id === id).length} righe</option>`).join('')}
          </select>
          <span class="text-label-small text-sx-text-muted">
            Le righe che stanno qui si prelevano dirette: non chiedono nessun trasferimento intermedio.
          </span>
        </div>
      </div>` : '';
    const lontane = tappeAltrove(p.stops, casa, (id) => Store.getSite(id)?.name || id);
    const altrove = new Map(lontane.map((f) => [f.tappa.location_code + '|' + f.tappa.item_key, f]));

    /* IN FONDO QUELLO CHE NON E' UN GUASTO. Una riga che sta tutta in
       reparto e' spiegata dal riquadro della copertura, qui sopra: sta
       nell'elenco perche' non si preleva, non perche' ci sia da indagare. */
    const SEV = { not_mapped: 0, lot_absent_other_lots: 1, no_lot_in_odp: 2, all_blocked: 3, in_lavorazione: 4 };
    const blockers = [...p.offroute].sort((a, b) => (SEV[a.reason as keyof typeof SEV] ?? 9) - (SEV[b.reason as keyof typeof SEV] ?? 9));
    const alertHTML = blockers.length ? `
      <div class="route-alert">
        <div class="route-alert-head">
          <span class="route-alert-ico">!</span>
          <div>
            <strong>${blockers.length} riga/e non prelevabile/i dalle aree mappate</strong>
            <div class="route-alert-sub">
              Verificare su Sage o con l'Ufficio Produzione <u>prima</u> di avviare il percorso.
              Il prelievo di queste righe non &egrave; guidato.
            </div>
          </div>
        </div>
        ${blockers.map(o => this._routeTailRowHTML(o)).join('')}
      </div>` : '';

    /* Avvisi residui sulla lettura del file. Dalla v2.5.1 restano solo quelli
       che indicano un dato mancante, non differenze di arrotondamento. */
    const warnHTML = p.warnings.length ? `
      <div class="route-warn">
        <strong>${this._ico('alert-triangle')} ${p.warnings.length} avviso/i sui dati dell'ordine</strong>
        <ul class="mt-4 mr-0 mb-0 ml-10 p-0">
          ${(p.warnings || []).map((w) => `<li class="mb-2.5">${this._esc(w)}</li>`).join('')}
        </ul>
      </div>` : '';

    const notesHTML = p.notes.length ? `
      <div class="route-note-box">
        <strong>ℹ️ ${p.notes.length} segnalazione/i — merce esistente ma non prelevabile</strong>
        <div class="text-body-small mt-3 opacity-85">
          Non entra nel percorso. &Egrave; solo un'informazione per l'operatore.
        </div>
        ${(p.notes || []).map((n) => `<div class="route-note-row">
          <span class="badge badge-${n.reason === 'quarantine' ? 'red' : 'amber'}">${this._esc((PickRoute.REASON_LABELS as Record<string, string>)[n.reason || ''] || n.reason)}</span>
          <span class="mono">${this._esc(n.article_code)}#${this._esc(n.lot_code)}</span>
          <span class="mono">${this._esc(n.location_code)}</span>
        </div>`).join('')}
      </div>` : '';

    return `
      ${ordini.map((o, i) => this._routeOrdineCardHTML(o, soli, i === 0)).join('')}

      ${soli ? '' : `<div class="route-warn mb-5">
        <strong>${this._ico('link')} Giro di ${ordini.length} ordini</strong> &mdash; stesso articolo e stesso lotto fanno
        <strong>una tappa sola</strong>. Il conto lo intesta <strong class="mono">${this._esc(this._routeCapofila)}</strong>,
        e la ripartizione si dichiara alla chiusura.
      </div>`}

      ${sceltaCasaHTML}
      ${this._routeCoperturaHTML()}
      ${alertHTML}
      ${warnHTML}

      <div class="route-stats">
        <div class="route-stat"><span class="route-stat-val">${(p.stops || []).length}</span><span class="route-stat-lbl">Tappe</span></div>
        <div class="route-stat"><span class="route-stat-val">${Object.keys(bySite).length}</span><span class="route-stat-lbl">Siti</span></div>
        <div class="route-stat"><span class="route-stat-val">${p.offroute.length}</span><span class="route-stat-lbl">Da verificare</span></div>
        <div class="route-stat"><span class="route-stat-val">${p.notes.length}</span><span class="route-stat-lbl">Segnalazioni</span></div>
      </div>

      ${this._routeSiteOrderHTML()}

      ${(p.stops || []).length ? `<div class="route-preview">
        <strong class="text-body-medium">${this._ico('compass')} Anteprima percorso</strong>
        ${lontane.length ? `<div class="text-body-small opacity-85 mt-2 mb-3">
          ${this._ico('building-factory')} <strong>${lontane.length} tapp${lontane.length === 1 ? 'a sta' : 'e stanno'} in un altro magazzino.</strong>
          Chiedere il trasferimento mette la merce in coda allo schedulatore e sposta la tappa sull'ubicazione in cui la si riceve.
        </div>` : ''}
        ${(p.stops || []).map((s) => `<div class="route-prev-row">
          <span class="route-prev-seq">${s.seq}</span>
          <span class="mono route-prev-loc">${this._esc(s.location_code)}</span>
          <span class="route-prev-art"><span class="mono">${this._esc(s.article_code)}</span> · <span class="mono">${this._esc(s.lot_code)}</span></span>
          <span class="route-prev-kg">${this._qtaOrdine(s.kg_required, s.um)} ${this._esc(s.um)}</span>
          ${s.alternatives.length ? `<span class="badge badge-muted">+${s.alternatives.length} alt.</span>` : ''}
          ${this._routeRigaAltrove(s, altrove)}
          ${this._routeRichiesteHTML(s)}
        </div>`).join('')}
      </div>` : '<div class="pick-cart-empty">Nessuna tappa percorribile: tutte le righe finiscono in coda.</div>'}

      ${notesHTML}

      <div class="flex gap-5 mt-8">
        <button class="btn btn-primary btn-conferma"
          onclick="App._routeStart()" ${(p.stops || []).length ? '' : 'disabled'}>${this._ico('compass')} AVVIA PERCORSO (${(p.stops || []).length})</button>
      </div>`;
  },

  /* ═══════════════════════════════════════════════════════════════════
     1.10 — IL TRASFERIMENTO CHIESTO DALL'ORDINE
     © Andrea Sacchetti — Dietopack S.r.l.

     Quando un lotto sta nel magazzino sbagliato il percorso ci mandava
     comunque: una tappa in fondo, in un altro capannone, per tre chili.
     Nessuno ci va — si chiede che la merce arrivi, e quella richiesta
     viveva a voce, come tutto ciò che lo schedulatore ha portato a registro.

     Qui la spunta scrive: nasce un'attività di TRASFERIMENTO, si dichiara in
     quale ubicazione ricevere la merce, e la tappa si sposta lì. Chi cammina
     continua a vedere un prelievo: cambia dove, non cosa.

     LA MERCE NON SI MUOVE DA QUI. Nasce un compito, e il trasferimento lo
     esegue chi lo prende in carico: la coda non muove niente da sola.
     ═══════════════════════════════════════════════════════════════════ */

  /* Le richieste già fatte su questo ordine, per item. Servono a
     sopravvivere alla RICOSTRUZIONE del percorso: cambiare l'ordine di
     visita dei siti rifà `build` da zero, e senza questa mappa una tappa già
     spostata tornerebbe nell'altro magazzino con il compito già in coda —
     due volte la stessa merce. */
  _routeTrasf: {},

  _routeRigaAltrove(s, altrove) {
    const chiesto = this._routeTrasf[s.item_key];
    if (chiesto && chiesto.to === s.location_code) {
      return `<span class="badge badge-amber" title="${this._esc(s.forced_note || '')}">↔ in arrivo${chiesto.task_id ? ` · ${this._esc(chiesto.task_id)}` : ''}</span>`;
    }
    const f = altrove.get(s.location_code + '|' + s.item_key);
    if (!f) return '';
    const badge = `<span class="badge badge-amber" title="Questa merce sta in un altro magazzino">${this._ico('building-factory')} ${this._esc(f.site_name)}</span>`;
    return `${badge}<button class="btn btn-sm" title="Chiedi che la merce venga trasferita qui" onclick="App._routeChiediTrasf('${this._esc(s.item_key)}','${this._esc(s.location_code)}')">↔ Trasferisci</button>`;
  },

  _routeChiediTrasf(itemKey, fromLoc) {
    const p = this._routeParsed;
    const s = (p?.stops || []).find((x: Tappa) => x.item_key === itemKey && x.location_code === fromLoc);
    if (!s) return this.toast('Tappa non più in anteprima', 'error');
    const sito = Store.getSite(s.site_id);
    this.showModal(
      '↔ Trasferimento richiesto dall’ordine',
      `<div class="bg-sx-bg-alt border border-sx-border rounded-5 py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        <span class="mono font-bold text-sx-primary">${this._esc(s.article_code)}</span>
        ${this._esc(s.article_description || '')}<br>
        Lotto <strong>${this._esc(s.lot_code)}</strong> · <strong>${this._qtaOrdine(s.kg_required, s.um)} ${this._esc(s.um)}</strong> richiesti dall’ordine<br>
        Adesso in <strong class="mono">${this._esc(s.location_code)}</strong> — ${this._esc(sito?.name || s.site_id || 'altro magazzino')}
      </div>
      <div class="form-group mb-6">
        <label>Ubicazione in cui ricevere la merce <span class="req">*</span></label>
        <div class="flex gap-3">
          <input class="input input-mono uppercase flex-1" id="trfTo" placeholder="Scansiona o digita" autofocus maxlength="${Validate.MAX.LOC_CODE}"
            oninput="this.value=this.value.toUpperCase();App._previewLoc('trfTo','trfToPrev')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCreaTrasf('${this._esc(itemKey)}','${this._esc(fromLoc)}')}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('trfTo',null)" title="Sfoglia le ubicazioni">${this._ico('map-pin')}</button>
        </div>
        <div id="trfToPrev"></div>
      </div>
      <div class="mov-preview mov-preview-warn">
        La tappa del percorso si sposta su questa ubicazione, e il vano resta
        <strong>vuoto finché il trasferimento non è eseguito</strong>: il compito nasce in coda,
        e la merce si muove quando qualcuno lo prende in carico.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App._routeCreaTrasf('${this._esc(itemKey)}','${this._esc(fromLoc)}')">↔ Metti in coda</button>`
    );
  },

  async _routeCreaTrasf(itemKey, fromLoc) {
    if (!this._requireOperator('la richiesta di trasferimento')) return;
    const p = this._routeParsed;
    const s = (p?.stops || []).find((x: Tappa) => x.item_key === itemKey && x.location_code === fromLoc);
    if (!s) return this.toast('Tappa non più in anteprima', 'error');

    this._vanoDaCampo('trfTo');
    const dest = Validate.clean($('trfTo')?.value, true).replace(/'/g, '-');
    if (!dest) return this.toast('Indica l’ubicazione in cui ricevere la merce', 'error');
    if (!Store.locationExists(dest)) return this.toast(`Ubicazione ${dest} inesistente`, 'error');
    const stato = Store.getLocationStatus(dest);
    if (stato === 'blocked' || stato === 'disabled') {
      return this.toast(`Ubicazione ${dest} ${stato === 'blocked' ? 'BLOCCATA' : 'DISATTIVATA'}: la merce non ci può arrivare`, 'error');
    }

    const richiesta = richiestaTrasferimento(s, dest, { odp_num: p?.header?.odp_num });
    if (!richiesta) return this.toast('Dalla stessa ubicazione a se stessa non è un trasferimento', 'error');

    let rec = null;
    try {
      rec = await Store.createTask({ ...richiesta, requested_by: Store.getCurrentIdentity().initials });
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }

    this._routeTrasf[itemKey] = { to: dest, from: fromLoc, task_id: rec?.task_id || '' };
    this._routeApplicaTrasf(sitoDiCasa(p?.stops, PickRoute.getSiteOrder(), PickRoute.getCasaScelta()));
    this.closeModal();
    this._formOrdine($('pickSubForm'));
    this.toast(`↔ ${etichettaTipo('TRANSFER')} in coda — ${rec?.task_id}: ${s.article_code}#${s.lot_code} verso ${dest}`, 'success');
  },

  /* 2.1 — la scelta del magazzino di partenza ricostruisce il giro: da
     dove si comincia cambia l'ordine delle tappe e quali righe risultano
     «in un altro magazzino». Le richieste di trasferimento già fatte
     sopravvivono, come alla ricostruzione per l'ordine di visita. */
  _routeSetCasa(siteId) {
    PickRoute.setCasaScelta(String(siteId || '') || null);
    if (this._routeParsed) {
      this._routeRicostruisci();
      this._routeApplicaTrasf(sitoDiCasa(this._routeParsed.stops, PickRoute.getSiteOrder(), PickRoute.getCasaScelta()));
    }
    this._formOrdine($('pickSubForm'));
  },

  /* Riapplica al percorso le richieste già fatte e rimette in fila le tappe.
     Si chiama dopo ogni costruzione, non solo alla prima. */
  _routeApplicaTrasf(casa) {
    const p = this._routeParsed;
    if (!p?.stops?.length) return;
    let toccato = false;
    const stops = p.stops.map((s: Tappa) => {
      const t = this._routeTrasf[s.item_key];
      if (!t || s.location_code === t.to) return s;
      toccato = true;
      return tappaInAttesa(s, t.to, casa || s.site_id, t.task_id);
    });
    if (!toccato) return;
    this._routeParsed = { ...p, stops: PickRoute.riordina(stops) };
  },

  _routeTailRowHTML(o) {
    return `<div class="route-tail-row">
      <span class="badge badge-${o.reason === 'not_mapped' ? 'muted' : o.reason === 'marked_missing' ? 'red' : 'amber'}">${this._esc((PickRoute.REASON_LABELS as Record<string, string>)[o.reason] || o.reason)}</span>
      <span class="mono">${this._esc(o.article_code)}#${this._esc(o.lot_code)}</span>
      <span class="route-tail-desc">${this._esc(o.description || '')}</span>
      <span class="route-tail-kg">${this._qtaOrdine(o.kg_required, o.um)} ${this._esc(o.um || '')}</span>
      <div class="route-tail-detail">${this._esc(o.detail || '')}${o.forced_note ? ' — ' + this._esc(o.forced_note) : ''}</div>
    </div>`;
  },

  /* Ordine dei siti: riordinabile e persistito. Vive qui, dove è
     effettivamente rilevante, invece che sepolto in Config. */
  _routeSiteOrderHTML() {
    const order = PickRoute.getSiteOrder();
    if (order.length < 2) return '';
    return `<div class="route-siteorder">
      <strong class="text-body-medium">${this._ico('building-factory')} Ordine di visita dei siti</strong>
      <div class="text-body-small opacity-80 mt-2 mx-0 mb-4">
        Il percorso &egrave; costruito un sito per volta, in questa sequenza.
      </div>
      ${order.map((id, i) => {
        const site = Store.getSite(id);
        return `<div class="route-site-row">
          <span class="route-site-num">${i + 1}</span>
          <span class="route-site-name">${this._esc(site?.name || id)}</span>
          <button class="btn btn-sm btn-icon" onclick="App._routeMoveSite(${i},-1)" ${i === 0 ? 'disabled' : ''} title="Sposta su">↑</button>
          <button class="btn btn-sm btn-icon" onclick="App._routeMoveSite(${i},1)" ${i === order.length - 1 ? 'disabled' : ''} title="Sposta giù">↓</button>
        </div>`;
      }).join('')}
    </div>`;
  },

  _routeMoveSite(idx, delta) {
    const order = PickRoute.getSiteOrder();
    const to = idx + delta;
    if (to < 0 || to >= order.length) return;
    [order[idx], order[to]] = [order[to]!, order[idx]!];
    PickRoute.setSiteOrder(order);
    // Il percorso va ricostruito: l'ordine dei siti ne determina la sequenza
    if (this._routeParsed) {
      this._routeRicostruisci();
      /* 1.10 - le richieste gia' fatte sopravvivono alla ricostruzione. */
      this._routeApplicaTrasf(sitoDiCasa(this._routeParsed.stops, order, PickRoute.getCasaScelta()));
    }
    this._formOrdine($('pickSubForm'));
    Feedback.sound('scan');
  },

  /* ─── AVVIO DEL PERCORSO ────────────────────────────────────────── */
  async _routeStart() {
    if (!this._requireOperator('il prelievo guidato da ordine')) return;
    const p: GiroLetto | null = this._routeParsed;
    if (!p?.stops!.length) return this.toast('Nessuna tappa da percorrere', 'error');
    this._prodOperator = Validate.clean($('pRouteOperator')?.value) || this._prodOperator;
    const opErr = Validate.operator(this._prodOperator);
    if (opErr) return this.toast(opErr, 'error');

    const ordini: OrdineDelGiro[] = p.ordini || [];
    const capo = ordini.find((o) => o.odp_num === p.capofila) || ordini[0]!;
    /* 2.1 — UN ORDINE CHIUSO NON SI RICARICA. Il file di produzione porta
       lo stesso numero d'ordine di un ciclo gia' archiviato, e senza questa
       riga il percorso partiva: i prelievi scrivevano altri movimenti sotto
       quel numero e il conto sommava due lavorazioni.

       2.12 — SI RICONTROLLANO TUTTI, non solo il capofila: l'import lo
       verifica all'ingresso, ma fra il primo file e l'avvio un altro
       terminale puo' aver chiuso uno di questi ordini. */
    /* 2.35.2 — SI RICONTROLLANO ANCORA, ma per DIRLO, non per fermare.

       Il controllo all'ingresso resta utile per la ragione scritta qui
       sopra: fra il primo file e l'avvio un altro terminale puo' aver chiuso
       uno di questi ordini, e chi avvia deve saperlo adesso e non a meta'
       corsia. Quel che cambia e' la risposta. Fermare voleva dire mandare a
       inventare un numero d'ordine — che il magazzino non emette — oppure a
       portare via la merce senza registrarla. */
    const chiusi = ordini.map((o) => o.odp_num).filter((n) => Store.ordineWipArchiviato(n));
    if (chiusi.length) {
      this.toast(`${chiusi.join(', ')} ${chiusi.length === 1 ? 'è un conto già CHIUSO' : 'sono conti già CHIUSI'}: `
        + 'quel che prelevi rientra in quel conto, che risulterà riaperto.', 'warning');
    }

    const existing = Store.getActivePickSession();
    if (existing) {
      const ok = await Dialog.confirm({
        title: 'Chiudere il percorso in corso?',
        message: 'Esiste gi\u00e0 un percorso attivo. Avviandone uno nuovo il precedente viene chiuso.',
        details: Dialog.kv([
          ['Ordine in corso', existing.odp_num],
          ['Tappe completate', `${(existing.stops || []).filter(s => s.status !== 'pending').length} di ${(existing.stops || []).length}`],
          ['Nuovo ordine', ordini.map((o) => o.odp_num).join(' · ')]
        ]),
        confirmLabel: 'Chiudi e avvia il nuovo', danger: true, icon: 'alert-triangle'
      });
      if (!ok) return;
      /* I movimenti gi\u00e0 registrati restano: sono su mov_log, non qui. */
      await Store.endPickSession();
    }

    const session = {
      session_id: `PS-${capo.odp_num.replace(/\s/g, '')}-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      /* `odp_num` RESTA IL CAPOFILA e non cambia significato: e' l'ordine
         che intesta il conto di produzione, ed e' l'unico campo che il
         rendiconto, il registro e lo storico leggevano fino alla 2.11. Con
         un file solo e' l'unico ordine che c'e', e tutto si comporta come
         prima. */
      odp_num: capo.odp_num,
      odp_article: capo.header.article_code,
      odp_article_desc: capo.header.article_desc,
      odp_lot: capo.header.lot,
      odp_qty: `${capo.qty_voluta ?? capo.header.qty_planned} ${capo.header.um}`,
      /* 2.12 — l'elenco si scrive solo quando gli ordini sono piu' d'uno: un
         elenco con dentro il solo capofila direbbe che c'e' un giro dove non
         c'e', e il rendiconto lo stamperebbe. */
      ...(ordini.length > 1 ? {
        odps: ordini.map((o) => ({
          odp_num: o.odp_num,
          article_code: o.header.article_code,
          article_desc: o.header.article_desc,
          lot: o.header.lot,
          qty_planned: o.header.qty_planned,
          um: o.header.um,
          qty_voluta: o.qty_voluta,
          fattore: o.fattore,
          file_name: o.file_name,
        })),
      } : {}),
      ...(this._routeCompito ? { task_id: this._routeCompito } : {}),
      operator: this._prodOperator,
      /* 2.30 — CHI PRELEVA E CHI HA APERTO SONO DUE COSE. `_prodOperator` è
         modificabile: un Team Leader può intestare il giro a un altro, e
         quella sigla va sulle righe di registro. `owner` è chi sta al
         terminale, ed è con quella che si ritrova il proprio percorso dopo
         un ricaricamento — vedi `modules/sessioni`. */
      owner: Store.getCurrentIdentity().initials,
      status: 'active',
      created_at: Date.now(),
      site_order: PickRoute.getSiteOrder(),
      stops: p.stops,
      offroute: p.offroute,
      notes: p.notes,
      warnings: p.warnings
    };
    try {
      await Store.startPickSession(session);
    } catch (err) {
      return this.toast(`Avvio non riuscito · ${(err as Error).message}`, 'error');
    }
    this._routeParsed = null;
    this._routeOrdini = [];
    this._routeCapofila = '';
    this._routeCompito = '';
    this._routeStage = 'run';
    this._routeStartTime = Date.now();
    /* 2.12 — UN PERCORSO NUOVO E' UN'APERTURA NUOVA.

       Qui si azzerava `_routeScan` e basta, lasciando in piedi
       `_routeApertura` e `_routeScanChiave` del percorso precedente. Non
       faceva danno per un motivo solo: `_routeScan.loc` tornava vuoto, e la
       spunta si controlla anche su quello. Ma da quando la chiave e' il VANO
       e non la tappa — e i due percorsi possono cominciare dallo stesso
       scaffale — quella difesa regge per caso, e una difesa che regge per
       caso cade il giorno che qualcuno tocca la riga accanto.

       Visto al banco il 27/08: la prima tappa del secondo percorso portava
       ancora l'apertura del primo. */
    this._routeNuovaApertura();
    this._formOrdine($('pickSubForm'));
    this.toast(`Percorso avviato · ${(session.stops || []).length} tappe${ordini.length > 1 ? ` · ${ordini.length} ordini` : ''}`, 'success');
    this.updateSyncIndicator();
  },

  _routeResume() {
    this._routeStage = 'run';
    this._routeNuovaApertura();
    if (!this._routeStartTime) this._routeStartTime = Date.now();
    this._formOrdine($('pickSubForm'));
  },

  /* Ogni ingresso nella schermata di esecuzione è un'apertura nuova, e una
     scansione fatta nell'apertura precedente non vale più. */
  _routeNuovaApertura() {
    this._routeApertura = Date.now();
    this._routeScan = { loc: '', art: '', lot: '', udc: '' };
    this._routeScanChiave = '';
  },

  /* ─── LA PAUSA ──────────────────────────────────────────────────────
     2.5 — CHI SI FERMA LO DICE, E IL REPORT LO SA.

     Il tempo medio di prelievo è la durata divisa per le righe, e finché la
     durata comprendeva il pranzo, il cambio turno e l'attesa del muletto,
     quel numero misurava le pause insieme al lavoro. Una pausa dichiarata è
     un fatto con un'ora d'inizio e una di fine, come ogni altro in questo
     applicativo, e si scrive sulla sessione perché è lì che il report la
     ritrova anche dopo una chiusura imprevista.

     IN PAUSA NON SI PRELEVA. La scheda della tappa sparisce: un campo di
     scansione che accetta merce mentre il turno è fermo è il modo di
     ritrovarsi un prelievo con l'ora sbagliata. */
  _routePausaAperta(s: SessionePrelievo | null | undefined): Pausa | null {
    const p: Pausa[] = (s?.pauses || []);
    const ultima = p[p.length - 1];
    return ultima && !ultima.to ? ultima : null;
  },

  /* I millisecondi fermi, pausa in corso compresa. */
  _routeMsInPausa(s: SessionePrelievo | null | undefined, adesso = Date.now()): number {
    return (s?.pauses || []).reduce((acc: number, x: Pausa) =>
      acc + Math.max(0, (x.to ?? adesso) - x.from), 0);
  },

  async _routePausa() {
    const s = Store.getActivePickSession();
    if (!s) return;
    if (this._routePausaAperta(s)) return;
    const pauses = [...(s.pauses || []), {
      from: Date.now(), to: null,
      by: this._prodOperator || Store.getCurrentIdentity().initials,
    }];
    s.pauses = pauses;
    try {
      await Store.savePickSession(s);
    } catch (err) {
      s.pauses = pauses.slice(0, -1);
      return this.toast(`Pausa non registrata · ${(err as Error).message}`, 'error');
    }
    this.setPrimaryScanField(null);
    ScanGuard.clear();
    this._renderRouteRun($('pickSubForm'));
    this.toast('⏸ Prelievo in pausa — il tempo fermo non entra nella media', 'info');
  },

  async _routeRiprendi() {
    const s = Store.getActivePickSession();
    if (!s) return;
    const aperta = this._routePausaAperta(s);
    if (!aperta) return;
    aperta.to = Date.now();
    try {
      await Store.savePickSession(s);
    } catch (err) {
      aperta.to = null;
      return this.toast(`Ripresa non registrata · ${(err as Error).message}`, 'error');
    }
    /* Si torna in corsia da capo: l'ubicazione si riscansiona, perché fra
       l'inizio della pausa e adesso l'operatore si è mosso. */
    this._routeNuovaApertura();
    this._renderRouteRun($('pickSubForm'));
    this.toast('▶ Prelievo ripreso', 'success');
  },

  /* Il riassunto che sta nella LEGENDA: quante pause e quanto tempo fermo.
     Vuoto finché nessuno si è fermato — una legenda che dice «0 pause» conta
     una cosa che non è successa. Mentre la pausa è aperta tace, perché sopra
     c'è il pannello intero e ripetersi in due punti è rumore. */
  _routeFermoHTML(s: SessionePrelievo | null | undefined) {
    if (this._routePausaAperta(s)) return '';
    const fatte = (s?.pauses || []).filter((x: Pausa) => x.to).length;
    const fermo = this._routeMsInPausa(s);
    if (fermo <= 0) return '';
    return `<span class="route-pause-info">⏸ ${fatte} paus${fatte === 1 ? 'a' : 'e'} · ${this._esc(this._fmtDurLong(fermo / 1000))} fermo</span>`;
  },

  /* Il pannello della pausa IN CORSO. Vuoto quando non ce n'è una aperta:
     chi lo chiama lo mette solo lì, e restituire il riassunto da qui vorrebbe
     dire che lo stesso testo esce in due posti diversi. */
  _routePausaHTML(s: SessionePrelievo | null | undefined) {
    const aperta = this._routePausaAperta(s);
    if (!aperta) return '';
    return `<div class="route-paused">
      <div class="route-paused-ico">⏸</div>
      <div class="route-paused-txt">
        <strong>Prelievo in pausa</strong>
        <div>Dalle ${this._esc(this._fmtClock(aperta.from))}${aperta.by ? ' · ' + this._esc(aperta.by) : ''}. Il tempo fermo non entra nel tempo medio di prelievo.</div>
      </div>
      <button class="btn btn-success min-h-touch" onclick="App._routeRiprendi()">▶ Riprendi</button>
    </div>`;
  },

  async _routeAbandon() {
    const s = Store.getActivePickSession();
    if (!s) return;
    const done = (s.stops || []).filter(x => x.status === 'done').length;
    const left = (s.stops || []).filter(x => x.status === 'pending').length;
    const ok = await Dialog.confirm({
      title: 'Chiudere il percorso?',
      message: 'I prelievi gi\u00e0 confermati restano registrati a magazzino e a registro: sono stati scritti tappa per tappa. Viene chiusa soltanto la guida al cammino.',
      details: Dialog.kv([
        ['Ordine', s.odp_num],
        ['Tappe confermate', done],
        ['Tappe non percorse', left]
      ]),
      confirmLabel: 'Chiudi percorso', danger: true, icon: 'alert-triangle'
    });
    if (!ok) return;
    if (done) await this._emitFinalPickReport(s);
    await this._chiudiCompitoDelPercorso(s, left);
    await Store.endPickSession(s.session_id);
    this._routeStage = 'import';
    this._routeStartTime = null;
    this._formOrdine($('pickSubForm'));
    this.toast('Percorso chiuso', 'info');
  },

  /* 2.35.1 — L'ATTIVITÀ SI CHIUDE COL PERCORSO, E SOLO SE È FINITO.

     Era la richiesta scritta: l'attività «si chiude alla chiusura del
     percorso, se il percorso viene cancellato annullato o messo in pausa
     l'attività rimane disponibile». Non succedeva né l'una né l'altra cosa,
     per il motivo più semplice: la sessione del prelievo ODP non portava il
     numero del compito, quindi non c'era niente da chiudere. A video l'8/09
     un percorso chiuso lasciava l'attività `in_progress` per sempre.

     LA CONDIZIONE È «NON RESTA NIENTE DA FARE», non «tutte prelevate». Una
     tappa segnata non trovata è percorsa: l'operatore c'è andato e ha
     risposto. Restano fuori solo quelle che nessuno ha guardato — e allora
     il lavoro non è finito e l'attività torna disponibile. */
  async _chiudiCompitoDelPercorso(s, rimaste) {
    const id = String(s?.task_id || '');
    if (!id) return;
    const t = Store.getTask(id);
    if (!t || t.status === 'done' || t.status === 'cancelled') return;
    try {
      await Store.chiudiCompitoDiPercorso(id, s, Store.getCurrentIdentity().initials);
      /* Il segnalibro in memoria segue la chiusura: `_taskRun` lo cancella
         la chiusura da movimento, e questa è un'altra strada. */
      if (this._taskRun?.task_id === id) this._taskRun = null;
      this.renderTasks();
      /* 2.35.2 — QUANTE NE RESTAVANO SI DICE, perché è il fatto che chi
         guarda la coda domani vorrà sapere: l'attività è chiusa, e non tutto
         il giro è stato camminato. Quel che manca si riprende ricaricando lo
         stesso ordine — dalla 2.35.2 si può. */
      this.toast(rimaste > 0
        ? `Attività ${id} chiusa col percorso — ${rimaste} tapp${rimaste === 1 ? 'a non percorsa' : 'e non percorse'}. `
          + 'Per riprenderle si ricarica lo stesso ordine.'
        : `Attività ${id} chiusa col percorso`, rimaste > 0 ? 'warning' : 'success');
    } catch (err) {
      this.toast(`Il percorso è chiuso, l'attività ${id} no · ${(err as Error).message}`, 'warning');
    }
  },

  /* ─── SCHERMATA 2: ESECUZIONE GUIDATA ───────────────────────────── */
  _renderRouteRun(el) {
    const s = Store.getActivePickSession();
    if (!s) { this._routeStage = 'import'; this._formOrdine(el); return; }

    const done    = (s.stops || []).filter(x => x.status === 'done').length;
    const missing = (s.stops || []).filter(x => x.status === 'missing').length;
    const pending = (s.stops || []).filter(x => x.status === 'pending');
    const current = pending[0] || null;
    const sosta   = this._routeSosta();
    const pct     = Math.round(((done + missing) / (s.stops || []).length) * 100);
    const inPausa = !!this._routePausaAperta(s);
    /* 2.12 — la spunta del vano si decide PRIMA di disegnare: la scheda
       mostra il campo ① oppure la banda verde a seconda di questa, e
       calcolarla dopo vorrebbe dire disegnare col valore di prima. */
    /* 2.35.1 — LA SPUNTA CHE SOPRAVVIVE AL RIDISEGNO LA DECIDE LA TAPPA.

       Qui c'era scritto `&& !!this._routeScan.loc`, cioè la grammatica della
       sola merce sciolta. Su una tappa di unità di carico l'ubicazione non si
       scansiona MAI — si legge il codice del bancale e basta — quindi quella
       condizione era falsa per costruzione: `_routeCheckUdc` riconosceva il
       codice, chiamava questo ridisegno, e il ridisegno cancellava la
       scansione appena fatta. A video: «Unità confermata», e un istante dopo
       «Serve il codice dell'unità UDC-000003 prima di confermare», sul
       bancale giusto. La preparazione di una spedizione non poteva avanzare.

       Adesso a dire che cosa vale è `PickRoute.scansioniBastanoPer`, la
       stessa che usa la conferma: due letture della stessa regola sono due
       regole che fra un mese diranno cose diverse. */
    const spunte = !!current && !inPausa && this._routeScanValida(current)
      && PickRoute.scansioniBastanoPer(current, this._routeScan);
    if (!spunte) { this._routeScan = { loc: '', art: '', lot: '', udc: '' }; this._routeScanChiave = ''; }
    /* Le scansioni della merce sciolta si consumano una tappa per volta —
       articolo e lotto si rifanno a ogni riga — mentre il vano vale per tutta
       la sosta. Su un'unità si conserva il codice: è l'unica che c'è. */
    else if (current?.udc_id) this._routeScan = { loc: '', art: '', lot: '', udc: this._routeScan.udc };
    else this._routeScan = { loc: this._routeScan.loc, art: '', lot: '', udc: '' };

    el.innerHTML = `
      <div class="route-runbar">
        <div class="route-runbar-top">
          <span class="mono route-runbar-odp">${this._esc(s.odp_num)}</span>
          ${(s.odps || []).length > 1 ? `<span class="badge badge-muted" title="${this._esc((this._giroDellaSessione(s) || []).join(' · '))}">${this._ico('link')} giro di ${(s.odps || []).length} ordini</span>` : ''}
          <span class="route-runbar-count">${done + missing} / ${(s.stops || []).length}</span>
        </div>
        <div class="route-progress"><i style="width:${pct}%"></i></div>
        <div class="route-runbar-legend">
          <span>${this._ico('check')} ${done} prelevate</span>
          <span>${this._ico('circle-x')} ${missing} non trovate</span>
          <span>◻ ${pending.length} da fare</span>
          ${this._routeFermoHTML(s)}
        </div>
      </div>

      ${inPausa ? this._routePausaHTML(s) : ''}

      <section id="routeCurrent">${inPausa ? '' : (current ? this._routeCurrentHTML(current, sosta) : this._routeFinishHTML(s))}</section>

      <details class="route-details">
        <summary>Elenco completo delle tappe (${(s.stops || []).length})</summary>
        <div class="text-label-small text-sx-text-muted py-1.5 px-0.5">
          Una tappa già prelevata si può riaprire per correggere i colli: toccala nell'elenco.
        </div>
        <div class="route-list">${(s.stops || []).map(st => this._routeListRowHTML(st, current)).join('')}</div>
      </details>

      <div class="flex gap-5 mt-7 flex-wrap">
        ${current && !inPausa ? `<button class="btn btn-sm btn-warning min-h-touch" onclick="App._routePausa()">⏸ Pausa</button>` : ''}
        <button class="btn btn-sm" onclick="App._printRouteReport()">${this._ico('printer')} Report parziale</button>
        <button class="btn btn-sm btn-danger" onclick="App._routeAbandon()">${this._ico('x')} Chiudi percorso</button>
      </div>`;

    /* 2.5 — LA SCANSIONE SI RIFÀ A OGNI VANO E A OGNI APERTURA, e la chiave
       dice per quale dei due vale: `_routeConfirmStop` la ricontrolla prima
       di scrivere. Azzerarla e basta non bastava — questo render non è
       l'unico modo di tornare davanti alla scheda.

       2.12 — QUEL CHE VALE ANCORA NON SI BUTTA. Confermata una riga, il
       render successivo cancellava anche la spunta del vano, e la riga dopo
       ripartiva dal codice a terra: l'azzeramento è deciso sopra, dove si
       guarda se la chiave regge ancora. */
    this.setPrimaryScanField(current && !inPausa
      ? (current.udc_id ? 'rUdc' : (spunte ? 'rArt' : 'rLoc'))
      : null);
  },

  /* 2.5 — LA QUANTITÀ D'ORDINE SI SCRIVE CON I DECIMALI DELLA SUA UNITÀ.
     `_fmtKg` ne forza tre: è giusto per i chili di un ODP — 44,420 KG — e su
     una riga in PZ scriveva «500,000 PZ», cinquecento pezzi vestiti da
     pesata. Peggio ancora accanto alle UM prelevate, che l'unità la leggono:
     lo stesso numero in due celle vicine, scritto in due modi. */
  _qtaOrdine(v, um) {
    return formattaQuantita(v, um || null);
  },

  /* La chiave che lega una scansione al VANO e all'apertura in cui è stata
     fatta. Cambia l'uno o l'altra, e la spunta non vale più.

     2.12 — `seq` è uscito dalla chiave. Quel che la spunta deve garantire è
     che l'operatore sia passato davanti a QUESTO vano in QUESTA apertura;
     il numero della tappa non c'entrava, e teneva fuori il caso normale —
     quattro articoli sullo stesso scaffale — costringendo a scansionare
     quattro volte lo stesso codice a terra. */
  _routeChiaveScan(st) {
    if (!this._routeApertura) this._routeApertura = Date.now();
    return `${st?.location_code ?? ''}@${this._routeApertura}`;
  },

  /* 2.31 — LA SCANSIONE DI UN'UNITÀ DI CARICO, ed è una sola.

     Su un pallet imballato articolo e lotto stanno sotto il cellophane:
     chiederli vorrebbe dire chiedere all'operatore di aprire l'imballo per
     confermare di non doverlo aprire. Il codice dell'unità è sull'etichetta,
     ed è il solo dato che non invecchia — §8.

     SI CONFRONTA COL CODICE CHE LA TAPPA NOMINA, non con «un'unità
     qualunque»: due bancali dello stesso articolo in baia si somigliano, e
     confermare quello sbagliato manda via merce impegnata su un altro
     documento. */
  _routeCheckUdc() {
    const st = this._routeCurrentStop();
    if (!st?.udc_id) return;
    const letto = String(($('rUdc') as HTMLInputElement | null)?.value || '').trim().toUpperCase();
    if (!letto) return;
    if (letto !== String(st.udc_id).trim().toUpperCase()) {
      this._routeScan.udc = '';
      Feedback.signal('error', 'Unità sbagliata',
        `Questa tappa chiede ${st.udc_id}. Letto ${letto}.`);
      return;
    }
    this._routeScan.udc = letto;
    this._routeScanChiave = this._routeChiaveScan(st);
    Feedback.signal('ok', 'Unità confermata', String(st.udc_id));
    this._renderRouteRun($('pickSubForm'));
  },

  /** 2.31 — questa tappa è un pallet intero? */
  _routeTappaEUdc(st) {
    return !!st?.udc_id;
  },

  _routeScanValida(st) {
    return !!this._routeScanChiave && this._routeScanChiave === this._routeChiaveScan(st);
  },

  /* ─── LA SOSTA ──────────────────────────────────────────────────────
     2.12 — L'UBICAZIONE SI SCANSIONA UNA VOLTA, GLI ARTICOLI TUTTI.

     Una sosta sono le tappe ANCORA DA FARE che stanno nello stesso vano e
     che si incontrano di fila. La serpentina le tiene già adiacenti — stesso
     vano vuol dire stesse coordinate — quindi non c'è niente da riordinare:
     c'è da smettere di trattarle come quattro fermate.

     SI GUARDA L'ELENCO DELLE PENDENTI, non `stops`: una tappa già prelevata
     o rimandata in fondo non sta più fra quelle che si fanno adesso, e
     contarla romperebbe la contiguità dove non è rotta. */
  _routeSosta() {
    const s = Store.getActivePickSession();
    const pending = (s?.stops || []).filter((x) => x.status === 'pending');
    const cur = pending[0];
    if (!cur) return [];
    const out = [];
    for (const x of pending) {
      if (x.location_code !== cur.location_code) break;
      out.push(x);
    }
    return out;
  },

  /* Rifare la verifica del vano è sempre possibile, e non chiede un motivo:
     chi si è allontanato e torna vuole poterlo dire. */
  _routeRiscansionaVano() {
    /* 2.35.1 — e il rimprovero parla la lingua della tappa. Su un bancale
       diceva «riscansiona l'ubicazione» sopra una scheda che l'ubicazione
       non la chiede: manda a cercare un campo che non c'è, ed è lo stesso
       difetto del messaggio rimasto acceso sulla maschera delle attività. */
    const st = this._routeCurrentStop();
    this._routeScan = { loc: '', art: '', lot: '', udc: '' };
    this._routeScanChiave = '';
    this._renderRouteRun($('pickSubForm'));
    this._routeFb('warn', st?.udc_id
      ? 'Riscansiona il codice dell’unità per confermare di essere davanti al bancale'
      : 'Riscansiona l’ubicazione per confermare di essere davanti al vano');
  },

  /* ─── A) LA MERCE TRASFERITA ────────────────────────────────────────
     2.5 — LA TAPPA GUARDA LO SCAFFALE, NON IL SEME.

     `qty_available` è il numero che la tappa aveva il giorno in cui il
     percorso è nato: su una tappa spostata da un trasferimento vale zero per
     costruzione, perché in quel vano allora non c'era niente. Restava zero
     anche dopo che il trasferimento era stato eseguito e la merce era
     arrivata davvero — e la maschera continuava a dire «0 colli» davanti a
     uno scaffale pieno. Vale anche senza trasferimenti: fra l'import e la
     tappa un altro terminale può aver mosso quella riga.

     Qui si legge la giacenza di ADESSO, ogni volta. */
  _routeDisponibili(st) {
    if (!st?.location_code || !st?.item_key) return 0;
    /* 2.35.1 — su una preparazione si esclude il documento che la muove, o
       la scheda scrive «0 colli in ubicazione» in rosso sopra un bancale
       pieno: quei colli sono impegnati dal DDT che si sta preparando. */
    const doc = Store.getActivePickSession()?.prep_doc_id || null;
    return Store.getAvailableQty(st.location_code, st.item_key, doc);
  },

  /* Lo stato del trasferimento che ha spostato la tappa, letto dalla coda.
     `null` quando la tappa non ne ha uno. */
  _routeStatoTrasf(st) {
    if (!st?.transfer_task && !st?.transfer_from) return null;
    const disponibili = this._routeDisponibili(st);
    const task = st.transfer_task ? Store.getTask(st.transfer_task) : null;
    return {
      task_id: st.transfer_task || '',
      da: st.transfer_from || '',
      stato: task?.status || (st.transfer_task ? 'sconosciuto' : 'non richiesto'),
      arrivata: disponibili > 0,
      disponibili,
    };
  },

  _routeTrasfBandaHTML(st) {
    const t = this._routeStatoTrasf(st);
    if (!t) return '';
    if (t.arrivata) {
      return `<div class="route-trasf route-trasf--ok">
        <strong>↔ Merce arrivata</strong>
        <div>Trasferita da <span class="mono">${this._esc(t.da || '—')}</span>${t.task_id ? ` · compito <span class="mono">${this._esc(t.task_id)}</span>` : ''}. In questo vano ci sono <strong>${t.disponibili}</strong> coll.: si preleva da qui.</div>
      </div>`;
    }
    const etichetta = t.stato === 'done' || t.stato === 'closed'
      ? 'Il compito risulta chiuso, ma in questo vano non c’è ancora niente.'
      : t.stato === 'in_progress'
        ? 'Il trasferimento è stato preso in carico: la merce sta arrivando.'
        : 'Il trasferimento è ancora in coda: nessuno l’ha preso in carico.';
    return `<div class="route-trasf route-trasf--wait">
      <strong>↔ Merce non ancora arrivata</strong>
      <div>Attesa da <span class="mono">${this._esc(t.da || '—')}</span>${t.task_id ? ` · compito <span class="mono">${this._esc(t.task_id)}</span>` : ''}. ${this._esc(etichetta)}</div>
      <div class="mt-2.5 flex gap-4 flex-wrap">
        <button class="btn btn-sm" onclick="App._renderRouteRun($('pickSubForm'))">↻ Ricontrolla il vano</button>
        <button class="btn btn-sm" onclick="App._routeSaltaTappa()">↷ Salta e vai avanti</button>
      </div>
    </div>`;
  },

  /* Una tappa che aspetta merce non blocca il giro: si rimanda in coda e si
     prosegue. NON è «non trovata» — quella è una constatazione a scaffale, e
     qui la merce esiste e sta arrivando. */
  async _routeSaltaTappa() {
    const session = Store.getActivePickSession();
    const st = this._routeCurrentStop();
    if (!session || !st) return;
    const stops = session.stops || [];
    const i = stops.indexOf(st);
    if (i === -1) return;
    if (stops.filter((x) => x.status === 'pending').length < 2) {
      return this.toast('È l’ultima tappa da fare: non c’è dove rimandarla', 'warning');
    }
    stops.splice(i, 1);
    stops.push(st);
    try {
      await Store.savePickSession(session);
    } catch (err) {
      return this.toast(`Salvataggio non riuscito · ${(err as Error).message}`, 'error');
    }
    this._routeNuovaApertura();
    this._renderRouteRun($('pickSubForm'));
    this.toast(`Tappa ${st.seq} rimandata in fondo al giro`, 'info');
  },

  /* Le altre righe da prendere in questo stesso vano, con quella in corso in
     evidenza. Vuoto quando la sosta è di una riga sola: un elenco di uno
     dice solo che c'è un elenco. */
  _routeSostaHTML(st, sosta) {
    if ((sosta || []).length < 2) return '';
    return `<div class="route-sosta">
      <strong>${this._ico('package')} In questo vano ci sono ${sosta.length} righe da prelevare</strong>
      <div class="text-body-small opacity-85 mt-2 mb-3">
        L&rsquo;ubicazione si conferma una volta sola: da qui in avanti si scansionano
        articolo e lotto di ciascuna riga, senza tornare sul codice a terra.
      </div>
      ${sosta.map((x: Tappa, i: number) => `<div class="route-sosta-row${x === st ? ' route-sosta-row--cur' : ''}">
        <span class="route-sosta-ico">${x === st ? '▶' : i + 1}</span>
        <span class="mono">${this._esc(x.article_code)}#${this._esc(x.lot_code)}</span>
        <span class="route-sosta-desc">${this._esc(x.article_description || '')}</span>
        <span class="route-sosta-kg">${this._qtaOrdine(x.kg_required, x.um)} ${this._esc(x.um)}</span>
      </div>`).join('')}
    </div>`;
  },

  /* Per chi è questa tappa, quando il giro porta più ordini. La somma sta
     già nella riga «Richiesti da ordine»: qui c'è chi l'ha chiesta, che è la
     domanda che ci si fa quando si guarda il conto, non quando si cammina. */
  _routeQuoteHTML(st) {
    const r = (st?.richieste || []) as Richiesta[];
    if (r.length < 2) return '';
    return `<div class="route-stop-quote">
      <span>Per conto di</span>
      <b>${r.map((x) => `<span class="badge badge-muted mono">${this._esc(x.odp_num)} · ${this._qtaOrdine(x.qty, st.um)} ${this._esc(st.um)}</span>`).join(' ')}</b>
    </div>`;
  },

  /* ═══ 2.22 — LA CAMPATA DELLA TAPPA, VISTA DI FRONTE ════════════════

     La scheda dice `MG1-SCA-04-06-2` e chi è davanti allo scaffale deve
     tradurlo in un gesto: quale ripiano, contando da terra. Il disegno lo
     dice prima che la mano parta.

     SI GUARDA E BASTA. Nessun clic, nessun gestore: la scheda della tappa
     è aperta durante un prelievo, e ogni bottone di questo applicativo
     scrive nel magazzino di qualcuno.

     Il modulo è `modules/colonna.ts` — puro, e collaudato da fermo. Qui
     resta il disegno. Su una zona a terra o alla rinfusa torna `null` e
     non si disegna niente: una colonna di un rettangolo solo ripeterebbe
     il codice che sta già in testa alla scheda. */
  _routeColonna(st): Colonna | null {
    if (!st?.location_code) return null;
    /* La geometria si ricostruisce a ogni disegnata come fanno la mappa e
       la verifica di stoccaggio: è un giro sulle zone, non sulle giacenze. */
    const geo = Store.buildLocationGeometry();
    const g = geo.get(st.location_code);
    if (!g) return null;
    return colonnaDi({
      code: st.location_code,
      geo,
      zona: Store.getZone(g.site_id, g.zone_id),
      stato: (code) => Store.getLocationStatus(code),
      righe: (code) => Store.getItemsAtLocation(code),
      article_code: st.article_code,
      lot_code: st.lot_code,
    });
  },

  /* Le cinque etichette di stato, con le stesse parole della mappa. */
  _COL_STATI: {
    occupied: 'Occupata', empty: 'Vuota', blocked: 'Bloccata',
    reserved: 'Riservata', disabled: 'Disattivata',
  },

  _routeColonnaHTML(col: Colonna | null) {
    if (!col) return '';
    const vani = col.vani.map((v) => {
      const etichetta = v.tappa ? 'Da prelevare' : (this._COL_STATI[v.stato] || '—');
      return `<div class="route-col-vano route-col-vano--${this._esc(v.stato)}${v.tappa ? ' route-col-vano--tappa' : ''}"
          title="${this._esc(v.code)} — ${this._esc(etichetta)}">
          <span class="route-col-liv mono">${this._esc(v.level)}</span>
          <span class="route-col-stato">${this._esc(etichetta)}</span>
        </div>`;
    }).join('');
    return `<aside class="route-col" aria-label="Campata ${col.bay} della corsia ${col.aisle}, vista di fronte">
      <div class="route-col-cap">Corsia ${col.aisle} · campata ${col.bay}</div>
      <div class="route-col-pila">${vani}</div>
      <div class="route-col-terra">terra</div>
    </aside>`;
  },

  /* STESSO ARTICOLO, LOTTO DIVERSO, UN ALTRO LIVELLO. Sta con le bande e
     non in fondo, per la stessa ragione della banda del trasferimento: è
     quel che cambia il gesto, e leggerlo dopo aver preso è tardi.

     La scansione del vano non salva da questo — chi legge l'etichetta del
     livello sbagliato scansiona un codice valido, solo non è il suo. */
  _routeRischioLottoHTML(col: Colonna | null) {
    if (!col?.rischioLotto.length) return '';
    const liv = col.rischioLotto;
    const quali = liv.map((l) => `<b class="mono">${this._esc(l)}</b>`).join(', ');
    return `<div class="route-col-rischio">
      <strong>Stesso articolo, lotto diverso in questa campata</strong>
      ${liv.length === 1 ? `Il livello ${quali} tiene lo stesso articolo con un altro lotto.` :
        `I livelli ${quali} tengono lo stesso articolo con un altro lotto.`}
      Prelevare dal livello <b class="mono">${this._esc(col.vani.find((v) => v.tappa)?.level || '')}</b>.
    </div>`;
  },

  _routeCurrentHTML(st, sosta = null) {
    const site = Store.getSite(st.site_id);
    /* 2.5 — la giacenza si legge ADESSO. Vedi `_routeDisponibili`. */
    const disponibili = this._routeDisponibili(st);
    const cfg = Store.getUomConfig(st.article_code, st.lot_code);
    const riga = Store.getItemsAtLocation(st.location_code).find((i) => i.item_key === st.item_key) || null;
    const elenco = riga ? Store.colliDiRiga(riga) : null;
    const vanoOk = this._routeScanValida(st) && !!this._routeScan.loc;
    /* 2.22 — la campata si chiede UNA volta per disegnata e si passa ai due
       pezzi che la usano: la banda del rischio e il disegno. */
    const col = this._routeColonna(st);
    return `
      <article class="route-stop-card">
        <header class="route-stop-head">
          <span class="route-stop-seq">${st.seq}</span>
          <div class="route-stop-title">
            <div class="route-stop-loc mono">${this._esc(st.location_code)}</div>
            <div class="route-stop-site">${this._esc(site?.name || st.site_id || '—')}</div>
          </div>
        </header>

        ${this._routeTrasfBandaHTML(st)}
        ${this._routeSostaHTML(st, sosta)}
        ${this._routeRischioLottoHTML(col)}

        <div class="route-stop-main">
        <div class="route-stop-body">
          <div class="route-stop-kv"><span>Articolo</span><b class="mono">${this._esc(st.article_code)}</b></div>
          <div class="route-stop-kv"><span>Descrizione</span><b>${this._esc(st.article_description || '—')}</b></div>
          <div class="route-stop-kv"><span>Lotto</span><b class="mono">${this._esc(st.lot_code)}</b></div>
          <div class="route-stop-kv"><span>Scadenza</span><b>${this._esc(this._isoToIt(st.expiry_iso))}</b></div>
          <div class="route-stop-kv route-stop-kg"><span>Richiesti da ordine</span><b>${this._qtaOrdine(st.kg_required, st.um)} ${this._esc(st.um)}</b></div>
          <div class="route-stop-kv${disponibili <= 0 ? ' route-stop-vuoto' : ''}"><span>Colli in ubicazione</span><b>${disponibili}</b></div>
        </div>
        ${this._routeColonnaHTML(col)}
        </div>

        ${this._routeQuoteHTML(st)}

        ${elenco && cfg ? `<div class="route-stop-colli">
          <span>Come sono imballati</span>
          <b class="mono">${this._esc(descriviElencoColli(elenco, cfg.uom))}</b>
        </div>` : ''}

        ${this._avvisiBanda(st.article_code)}

        ${st.alternatives.length ? `<div class="route-alt">
          <strong>Altre ubicazioni con lo stesso articolo e lotto:</strong>
          ${(st.alternatives as Alternativa[]).map((a) => `<span class="badge badge-muted mono">${this._esc(a.location_code)} · ${a.qty_available} Coll.</span>`).join(' ')}
          <div class="text-label-small mt-2.5 opacity-80">Scansionandone una, la tappa si sposta l&agrave;.</div>
        </div>` : ''}

        ${this._routeTappaEUdc(st) ? `<div class="form-group mt-6 mx-0 mb-4">
          <label>Scansiona il CODICE DELL&rsquo;UNIT&Agrave; <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="rUdc" value="${this._esc(this._routeScan.udc)}"
            placeholder="Scansiona l&rsquo;etichetta del bancale" maxlength="40"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCheckUdc();}">
          <div class="text-label-small text-sx-text-muted mt-2">
            Il bancale si prende intero. Articolo e lotto stanno sotto il cellophane:
            a garantirli &egrave; l&rsquo;etichetta, e basta quella.
          </div>
        </div>
        ${(st.contenuto || []).length ? `<div class="route-alt">
          <strong>Che cosa porta sopra:</strong>
          ${(st.contenuto || []).map((c: { article_code: string; lot_code: string; colli: number }) => `<span class="badge badge-muted mono">${this._esc(c.article_code)}#${this._esc(c.lot_code)} · ${c.colli} Coll.</span>`).join(' ')}
        </div>` : ''}` : `
        ${vanoOk ? `<div class="route-vano-ok">
          <strong>${this._ico('check')} Ubicazione <span class="mono">${this._esc(st.location_code)}</span> confermata</strong>
          <div class="text-body-small opacity-85">
            Vale per tutte le righe di questo vano, fino a quando il giro non si sposta.
          </div>
          <button class="btn btn-sm" type="button" onclick="App._routeRiscansionaVano()">↻ Riscansiona l&rsquo;ubicazione</button>
        </div>` : `<div class="form-group mt-6 mx-0 mb-4">
          <label>① Scansiona UBICAZIONE <span class="req">*</span></label>
          <div class="flex gap-3">
          <input class="input input-mono" id="rLoc" placeholder="Scansiona o digita ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
            oninput="App._normScan('rLoc')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('rLoc');App._routeCheckLoc();}">
          <button class="btn btn-sm" type="button" onclick="App._pickLoc('rLoc','_routeCheckLoc')" title="Sfoglia le ubicazioni">${this._ico('map-pin')}</button>
          </div>
        </div>`}
        <div class="form-group mb-4">
          <label>② Scansiona ARTICOLO <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="rArt" placeholder="Scansiona o digita articolo" maxlength="${Validate.MAX.ARTICLE_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCheckArt();}">
        </div>
        <div class="form-group mb-4">
          <label>③ Scansiona LOTTO <span class="req">*</span></label>
          <input class="input input-mono" id="rLot" placeholder="Scansiona o digita lotto" maxlength="${Validate.MAX.LOT_CODE}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._routeCheckLot();}">
        </div>`}

        ${this._prepVersoHTML(st)}

        <div id="rFeedback"></div>

        <div class="flex gap-5 mt-6 flex-wrap">
          <button class="btn btn-primary btn-conferma"
            onclick="App._routeConfirmStop()">${this._ico('check')} CONFERMA PRELIEVO</button>
          <button class="btn btn-warning min-h-touch"
            onclick="App._routeMarkMissing()">${this._ico('circle-x')} Non trovato</button>
        </div>
      </article>`;
  },

  _routeListRowHTML(st, current) {
    const isCur = current && st.seq === current.seq;
    const icon = st.status === 'done' ? this._ico('check')
      : st.status === 'missing' ? this._ico('circle-x')
      : isCur ? '▶' : '◻';
    const cls  = st.status === 'done' ? 'ok' : st.status === 'missing' ? 'ko' : isCur ? 'cur' : '';
    const fatta = st.status === 'done';
    /* 2.5 — UNA TAPPA GIÀ PRELEVATA SI RIAPRE. Chi si accorge di aver preso
       un collo di troppo tre tappe dopo non aveva nessun posto dove dirlo: il
       giro andava avanti e la correzione finiva a voce. La riga diventa un
       pulsante, e la rettifica scrive movimenti nuovi — il prelievo di prima
       resta a registro, perché è successo. */
    /* Le UM con i decimali della LORO unita': `_fmtKg` ne forza tre, e su un
       articolo in PZ scriverebbe «12,000 PZ». */
    const uom = st.uom_picked != null && st.um
      ? ` · ${this._esc(formattaQuantita(st.uom_picked, st.um))} ${this._esc(st.um)}` : '';
    const dentro = `<span class="route-list-ico">${icon}</span>
      <span class="route-list-seq">${st.seq}</span>
      <span class="mono route-list-loc">${this._esc(st.location_code)}</span>
      <span class="mono route-list-art">${this._esc(st.article_code)}#${this._esc(st.lot_code)}</span>
      <span class="route-list-kg">${this._qtaOrdine(st.kg_required, st.um)} ${this._esc(st.um)}</span>
      ${fatta ? `<span class="badge badge-green">${st.qty_picked} Coll.${uom}</span>` : ''}
      ${st.corrections ? `<span class="badge badge-amber" title="${this._esc(st.correction_note || '')}">rettificata ×${st.corrections}</span>` : ''}
      ${st.forced_note ? `<span class="badge badge-amber" title="${this._esc(st.forced_note)}">forzata</span>` : ''}`;
    if (!fatta) return `<div class="route-list-row ${cls}">${dentro}</div>`;
    return `<button type="button" class="route-list-row route-list-row--btn ${cls}"
      title="Correggi i colli prelevati su questa tappa"
      onclick="App._routeRettifica(${Number(st.seq)})">${dentro}
      <span class="route-list-edit">${this._ico('pencil')}</span>
    </button>`;
  },

  /* ─── D) LA RETTIFICA DI UNA TAPPA GIÀ PRELEVATA ────────────────────
     2.5 — SI CORREGGE QUELLO CHE È USCITO, NON QUELLO CHE È SCRITTO.

     Il prelievo di prima resta a registro: è successo, e riscriverlo
     vorrebbe dire che il registro racconta una giornata diversa da quella
     che c'è stata. La rettifica RIMETTE A SCAFFALE i colli di troppo e
     scrive il movimento che li riporta — la stessa coppia dell'inventario,
     FIX− e FIX+, applicata a un prelievo.

     Solo IN MENO. Prendere altri colli non è una correzione, è un secondo
     prelievo: si fa con una tappa, e la tappa c'è già — questa maschera non
     inventa un movimento di uscita che nessuno ha scansionato. */
  async _routeRettifica(seq) {
    const session = Store.getActivePickSession();
    if (!session) return;
    if (this._routePausaAperta(session)) {
      return this.toast('Prelievo in pausa: premi ▶ Riprendi prima di rettificare', 'warning');
    }
    const st = (session.stops || []).find((x) => Number(x.seq) === Number(seq));
    if (!st || st.status !== 'done') return this.toast('Questa tappa non è stata prelevata', 'error');
    if (!this._requireOperator('la rettifica di un prelievo')) return;

    const presi = Number(st.qty_picked) || 0;
    if (presi <= 0) return this.toast('Su questa tappa non risulta nessun collo prelevato', 'error');

    const cfg = Store.getUomConfig(st.article_code, st.lot_code);
    const misure = Array.isArray(st.packs_picked) ? st.packs_picked : null;
    const dettaglio = misure && cfg
      ? descriviElencoColli(misure, cfg.uom)
      : `${presi} Coll.`;

    const resi = await Dialog.qty({
      title: `Rettifica tappa ${st.seq}`,
      message: `Quanti colli TORNANO a scaffale in ${st.location_code}. Il prelievo già registrato non si cancella: si scrive il movimento che li riporta indietro.`,
      details: Dialog.kv([
        ['Articolo', `${st.article_code}#${st.lot_code}`],
        ['Ubicazione', st.location_code],
        ['Prelevati', dettaglio],
        ['Richiesti da ordine', `${this._qtaOrdine(st.kg_required, st.um)} ${st.um}`],
      ]),
      value: 1, min: 1, max: presi, unit: 'Coll.',
    });
    if (resi === null) return;

    const nota = await Dialog.reason({
      title: 'Motivo della rettifica',
      message: 'Il testo va nelle note del movimento e compare sul report di prelievo.',
      placeholder: 'Es. collo di troppo, ordine cambiato, errore di conta…',
      minLen: 5, confirmLabel: 'Rettifica', icon: 'pencil',
    });
    if (!nota) return;

    /* Quali colli tornano: se il prelievo aveva le misure, si sceglie fra
       QUELLE — rimettere a scaffale «due colli» su un prelievo fatto di un
       25 e di un 7 sarebbe un saldo giusto sui colli sbagliati. */
    let daRimettere: number[] | null = null;
    if (misure && cfg) {
      const ordinate = [...misure].sort((a, b) => a - b);
      daRimettere = ordinate.slice(0, resi);
    }

    const effectiveUser = this._prodOperator || Store.getCurrentIdentity().initials;
    const notes = `Rettifica tappa ${st.seq} — ordine ${session.odp_num}: ${nota}`;
    const dove = String(st.location_code ?? '');
    const itemKey = String(st.item_key ?? `${st.article_code}#${st.lot_code}`);
    let res;
    try {
      /* 2.8 — CORREZIONE, NON POSIZIONAMENTO: la rettifica di una tappa
         rimette a scaffale colli che da quello scaffale erano usciti, e la
         regola dell'ubicazione unica non deve poter impedire di annullare
         un prelievo sbagliato. Vedi `addItem`. */
      res = await Store.addItem(dove, st.article_code, st.article_description || '',
        st.lot_code, '', notes, resi, null, daRimettere, { regolaBase: false });
    } catch (err) {
      return this.toast(`Rettifica non applicata · ${(err as Error).message}`, 'error');
    }

    await this._logMov(MOV.REPOS, st.article_code, st.article_description || '', st.lot_code,
      dove, null, effectiveUser, notes, session.odp_num,
      res.qty_before ?? null, resi, res.qty_after ?? null,
      typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null);

    /* Il conto di produzione scende di quello che è tornato indietro: la
       merce non è entrata in lavorazione. Se non riesce, la rettifica resta —
       stessa regola della conferma: la merce è già a scaffale. */
    if (session.odp_num) {
      try {
        await Store.esceDaWip(session.odp_num, {
          item_key: itemKey,
          article_code: st.article_code,
          lot_code: st.lot_code,
          qty: resi,
          qty_uom: typeof res.qty_uom_delta === 'number' ? res.qty_uom_delta : null,
          packs: daRimettere,
        });
      } catch (e) {
        this.toast(`Conto di produzione non aggiornato — ${(e as Error).message}. La rettifica resta valida.`, 'error');
      }
    }

    st.qty_picked = presi - resi;
    if (misure) st.packs_picked = misure.slice(resi).length ? [...misure].sort((a, b) => a - b).slice(resi) : [];
    if (cfg && st.packs_picked) st.uom_picked = st.packs_picked.reduce((a, n) => a + n, 0);
    st.corrections = (Number(st.corrections) || 0) + 1;
    st.correction_note = nota;
    if (st.qty_picked <= 0) { st.status = 'pending'; st.qty_picked = 0; st.done_at = null; }
    try {
      await Store.savePickSession(session);
    } catch (err) {
      this.toast(`Movimento scritto ma tappa non salvata · ${(err as Error).message}`, 'error');
    }

    this._routeNuovaApertura();
    this.updateSyncIndicator();
    this._renderRouteRun($('pickSubForm'));
    this._refreshSessionLog();
    Feedback.signal('ok', `Tappa ${st.seq} rettificata`, `${resi} Coll. tornati in ${dove}`);
  },

  /* ─── VERIFICHE DI SCANSIONE ────────────────────────────────────── */

  /* Ubicazione. Accetta quella prevista o una delle alternative: in tal caso
     la tappa si sposta, perché la merce è la stessa e l'operatore è già lì. */
  _routeCheckLoc() {
    const st = this._routeCurrentStop();
    if (!st) return;
    /* 2.36 — anche qui il codice di un bancale vale come il suo vano: chi
       arriva davanti a uno scaffale con un pallet davanti scansiona quello
       che ha sotto gli occhi. */
    this._vanoDaCampo('rLoc');
    const val = Validate.clean($('rLoc')?.value, true).replace(/'/g, '-');
    if (!val) return;
    if (val === st.location_code) {
      this._routeScan.loc = val;
      this._routeScanChiave = this._routeChiaveScan(st);
      this._routeFb('ok', `Ubicazione ${val} confermata`);
      this._campoScansionato('rLoc');
      $('rArt')?.focus();
      return;
    }
    const alt = (st.alternatives as Alternativa[]).find((a) => a.location_code === val);
    if (alt) {
      this._routeScan.loc = val;
      this._routeSwitchToAlternative(st, alt);
      return;
    }
    this._routeBlock('rLoc', 'Ubicazione errata',
      `Attesa ${st.location_code}, scansionata ${val}.`,
      async (note: string) => {
        if (!Store.locationExists(val)) {
          this.toast(`L'ubicazione ${val} non esiste a sistema`, 'error');
          return false;
        }
        /* 2.5 — L'ATTESA SI LEGGE PRIMA DI SOVRASCRIVERLA. La nota diceva
           «attesa <valore scansionato>» perché `st.location_code` era già
           stato riassegnato una riga sopra: la motivazione registrata
           nascondeva esattamente il dato per cui esiste. */
        const attesa = st.location_code;
        st.location_code = val;
        st.item_key = st.item_key || `${st.article_code}#${st.lot_code}`;
        st.forced_note = `Ubicazione forzata (attesa ${attesa}): ${note}`;
        this._routeScan.loc = val;
        this._routeScanChiave = this._routeChiaveScan(st);
        await this._routeSave();
        return true;
      });
  },

  async _routeSwitchToAlternative(st, alt) {
    const s = Store.getActivePickSession();
    const old = st.location_code;
    st.alternatives = [
      { location_code: old, item_key: st.item_key, qty_available: Store.getAvailableQty(old, st.item_key) },
      ...(st.alternatives as Alternativa[]).filter((a) => a.location_code !== alt.location_code)
    ];
    st.location_code = alt.location_code;
    st.item_key = alt.item_key;
    st.qty_available = alt.qty_available;
    const g = Store.buildLocationGeometry().get(alt.location_code);
    if (g) st.site_id = g.site_id;
    await Store.savePickSession(s!);
    this._routeFb('ok', `Tappa spostata su ${alt.location_code} (ubicazione alternativa)`);
    Feedback.signal('info', 'Ubicazione alternativa',
      `La merce viene prelevata da ${alt.location_code} invece che da ${old}.`);
    /* 2.5 — SPOSTARSI SU UN'ALTRA UBICAZIONE VUOL DIRE RISCANSIONARLA.
       Fino alla 2.4 il campo si riempiva da solo e la spunta veniva data per
       buona: l'operatore poteva confermare un prelievo da un vano davanti al
       quale non era mai passato. Il codice resta scritto nel campo perché
       serve a leggerlo, ma la spunta no — la chiave è quella della tappa
       vecchia, e `_routeScanValida` la rifiuta. */
    this._renderRouteRun($('pickSubForm'));
    $('rLoc').value = alt.location_code;
    /* La spunta decade insieme alla chiave: il codice resta scritto perche'
       serve a leggerlo, ma quel vano non l'ha ancora scansionato nessuno. */
    this._campiScansioneReset('rLoc', 'rArt', 'rLot');
    this._routeFb('warn', `Tappa spostata su ${alt.location_code}: riscansiona l’ubicazione per confermare`);
    $('rLoc')?.focus();
    $('rLoc')?.select();
  },

  _routeCheckArt() {
    const st = this._routeCurrentStop();
    if (!st) return;
    if (!this._routeScan.loc || !this._routeScanValida(st)) {
      this._routeScan = { loc: '', art: '', lot: '', udc: '' };
      this._routeScanChiave = '';
      /* 2.12 \u2014 si ridisegna, perch\u00e9 senza spunta la scheda deve tornare a
         mostrare il campo dell'ubicazione: lasciarla con la banda verde
         direbbe che il vano \u00e8 confermato mentre qui si \u00e8 appena stabilito
         che non lo \u00e8. */
      this._renderRouteRun($('pickSubForm'));
      this._campiScansioneReset('rLoc', 'rArt', 'rLot');
      this._routeFb('error', 'Scansiona prima l\u2019ubicazione');
      $('rLoc')?.focus();
      return;
    }
    const val = Validate.clean($('rArt')?.value, true);
    if (!val) return;
    if (val === st.article_code) {
      this._routeScan.art = val;
      this._routeFb('ok', `Articolo ${val} confermato`);
      this._campoScansionato('rArt');
      $('rLot')?.focus();
      return;
    }
    this._routeBlock('rArt', 'Articolo errato',
      `Atteso ${st.article_code}, scansionato ${val}.`,
      async (note: string) => {
        st.forced_note = `${st.forced_note ? st.forced_note + ' | ' : ''}Articolo forzato (atteso ${st.article_code}, letto ${val}): ${note}`;
        this._routeScan.art = st.article_code;
        await this._routeSave();
        return true;
      });
  },

  _routeCheckLot() {
    const st = this._routeCurrentStop();
    if (!st) return;
    if (!this._routeScan.art || !this._routeScanValida(st)) {
      this._routeFb('error', 'Scansiona prima l\u2019articolo');
      $('rArt')?.focus();
      return;
    }
    const val = Validate.clean($('rLot')?.value);
    if (!val) return;
    if (val === st.lot_code) {
      this._routeScan.lot = val;
      this._routeFb('ok', 'Lotto confermato — pronto per la conferma');
      this._campoScansionato('rLot');
      return;
    }
    this._routeBlock('rLot', 'Lotto errato',
      `Atteso ${st.lot_code}, scansionato ${val}. Il lotto \u00e8 assegnato dall\u2019ordine di produzione: forzarlo altera la tracciabilit\u00e0.`,
      async (note: string) => {
        st.forced_note = `${st.forced_note ? st.forced_note + ' | ' : ''}Lotto forzato (atteso ${st.lot_code}, letto ${val}): ${note}`;
        this._routeScan.lot = st.lot_code;
        await this._routeSave();
        return true;
      });
  },

  async _routeBlock(fieldId, title, message, onForce) {
    return this._scanBlock({
      fieldId, title, message, onForce,
      fbId: 'rFeedback',
      onUnlocked: () => this._renderRouteRun($('pickSubForm'))
    });
  },

  async _scanBlock({ fieldId, title, message, onForce, fbId, onUnlocked }) {
    Feedback.signal('error', title, message);
    /* Il campo che ha ricevuto la lettura sbagliata perde il verde: dopo un
       errore non c'e' niente di confermato lì dentro. */
    this._campoScansionato(fieldId, false);
    this._scanFb(fbId, 'error', `${title} — ${message}`);
    const el = $(fieldId);
    el?.select();
    const proceed = await Dialog.confirm({
      title,
      message: message + '\n\nCorreggere la scansione, oppure sbloccare motivando.',
      confirmLabel: 'Sblocca motivando', cancelLabel: 'Correggo la scansione',
      danger: true, icon: 'alert-octagon'
    });
    if (!proceed) { el?.focus(); el?.select(); return; }
    const note = await Dialog.reason({
      title: 'Motivazione dello sblocco',
      message: 'Il testo viene registrato nelle note del movimento e compare sul documento.',
      placeholder: 'Es. etichetta danneggiata, verificato su Sage con CQ…',
      minLen: 8, confirmLabel: 'Sblocca', danger: true, icon: 'alert-triangle'
    });
    if (!note) { el?.focus(); return; }
    const ok = await onForce(note);
    if (ok) {
      this._scanFb(fbId, 'warn', `Sbloccato con motivazione: ${note}`);
      Feedback.signal('warn', 'Scansione sbloccata', 'La motivazione è stata registrata.');
      onUnlocked?.();
    }
  },

  /* Riscontro d'angolo, per qualunque modulo che verifichi scansioni. */
  _scanFb(fbId, kind, msg) {
    const el = $(fbId);
    if (!el) return;
    const cls = kind === 'ok' ? 'mov-preview-ok' : kind === 'warn' ? 'mov-preview-warn' : 'mov-preview-err';
    el.innerHTML = `<div class="mov-preview ${cls}"><span class="font-bold">${this._esc(msg)}</span></div>`;
  },

  _routeFb(kind, msg) { this._scanFb('rFeedback', kind, msg); },

  _routeCurrentStop() {
    const s = Store.getActivePickSession();
    return s ? ((s.stops || []).find(x => x.status === 'pending') || null) : null;
  },

  /* 2.12 — i numeri d'ordine del giro, capofila in testa. `null` quando il
     giro è di un ordine solo: là non c'è nessun giro da nominare, e scrivere
     un elenco di uno lo farebbe comparire sul rendiconto di ogni prelievo
     normale. */
  _giroDellaSessione(session): string[] | null {
    const odps = (session?.odps || []) as { odp_num: string }[];
    if (odps.length < 2) return null;
    const capo = normalizzaOdp(session?.odp_num);
    const numeri = odps.map((o) => normalizzaOdp(o.odp_num)).filter(Boolean);
    return [capo, ...numeri.filter((x) => x !== capo)];
  },

  async _routeSave() {
    const s = Store.getActivePickSession();
    if (s) await Store.savePickSession(s);
  },

  async _routeConfirmStop() {
    const session = Store.getActivePickSession();
    const st = this._routeCurrentStop();
    if (!session || !st) return;
    if (!this._requireOperator('il prelievo guidato')) return;

    /* 2.5 — LA PAUSA NON PRELEVA. La scheda sparisce quando il turno è
       fermo, ma la scorciatoia da tastiera no: si ferma qui. */
    if (this._routePausaAperta(session)) {
      return this.toast('Prelievo in pausa: premi ▶ Riprendi prima di confermare', 'warning');
    }
    /* 2.31 — QUANTE SCANSIONI SERVONO LO DICE LA TAPPA. Una sull'unità di
       carico, tre sulla merce sciolta.
       2.35.1 — e a dirlo è `PickRoute.scansioniBastanoPer`, la stessa che usa
       il ridisegno. Erano due letture della stessa regola, e una delle due
       cancellava quel che l'altra aveva appena accettato. */
    if (!PickRoute.scansioniBastanoPer(st, this._routeScan)) {
      if (this._routeTappaEUdc(st)) {
        Feedback.signal('error', 'Scansione mancante',
          `Serve il codice dell'unità ${st.udc_id} prima di confermare.`);
      } else {
        Feedback.signal('error', 'Scansioni incomplete',
          'Servono ubicazione, articolo e lotto prima di confermare.');
      }
      return;
    }
    /* E le tre scansioni devono essere di QUESTA tappa e di QUESTA apertura:
       una spunta ereditata è un prelievo confermato senza passare dal vano. */
    if (!this._routeScanValida(st)) {
      this._routeScan = { loc: '', art: '', lot: '', udc: '' };
      this._routeScanChiave = '';
      this._renderRouteRun($('pickSubForm'));
      return this.toast('Scansione non più valida per questa tappa: riscansiona l’ubicazione', 'warning');
    }

    // ── Re-check sullo stato attuale, non su quello di quando è nato il percorso
    const bucket = Store.getItemsAtLocation(st.location_code);
    const full = bucket.find(x => x.item_key === st.item_key);
    if (!full) {
      return this.toast(`${st.article_code}#${st.lot_code} non \u00e8 pi\u00f9 presente in ${st.location_code}`, 'error');
    }
    if (Store.isItemQuarantined(st.item_key, st.location_code)) {
      return this.toast(`${st.article_code}#${st.lot_code} \u00e8 stato messo in QUARANTENA: prelievo non consentito`, 'error');
    }
    /* 2.35.1 — LA PRENOTAZIONE DEL PROPRIO DOCUMENTO NON CONTA CONTRO DI SÉ.

       Un DDT pendente prenota la merce: `getAvailableQty` sottrae quel che i
       documenti aperti hanno impegnato, ed è giusto — nessun altro deve
       poterla portare via. Ma una preparazione va a prendere ESATTAMENTE la
       merce che il suo documento ha prenotato, quindi si trovava davanti
       zero colli disponibili e si fermava con «impegnato su DDT pendente»:
       il documento diceva all'operatore che la merce era impegnata da lui
       stesso. Nessuna tappa di preparazione ha mai potuto chiudersi.

       `getAvailableQty` accetta da sempre l'esclusione di un documento — è
       lo stesso argomento che usa l'evasione. Qui mancava di passarlo. */
    const proprioDoc = session.prep_doc_id || null;
    const avail = Store.getAvailableQty(st.location_code, st.item_key, proprioDoc);
    if (avail <= 0) {
      /* 2.5 — se la tappa aspettava un trasferimento, il messaggio lo dice:
         «nessun collo disponibile» su un vano che aspetta merce manda a
         cercare un DDT che non c'è. */
      const t = this._routeStatoTrasf(st);
      return this.toast(t
        ? `${st.article_code}#${st.lot_code}: la merce da ${t.da || 'l’altro magazzino'} non è ancora arrivata in ${st.location_code}${t.task_id ? ` (compito ${t.task_id})` : ''}`
        : `${st.article_code}#${st.lot_code}: nessun collo disponibile (impegnato su DDT pendente)`, 'error');
    }

    /* 2.2 — UNA DOMANDA SOLA. Fino alla 2.1 la tappa ne faceva due: prima
       «quanti colli», poi «quali». Con la scelta per misura la prima e' la
       somma della seconda, e chiederle tutte e due vuol dire far digitare
       due volte lo stesso numero — con la possibilita' che i due non
       coincidano. La maschera dei colli si apre gia' compilata sui chili che
       l'ordine chiede, e i colli prelevati sono quelli scelti.

       La domanda secca resta per le righe che i colli non li dichiarano: li'
       non c'e' niente da scegliere, e il numero e' l'unico dato che esista. */
    /* 2.5 — IL PRELIEVO PARTE DAGLI SPAIATI. I colli piccoli di una riga
       sono quasi sempre i residui aperti in un giro precedente: prenderli per
       primi li chiude, invece di lasciarli invecchiare dietro ai pieni. È una
       regola di magazzino chiesta da Andrea, e la finestra dice in anteprima
       di quanto si eccede rispetto all'ordine — perché il verso degli spaiati
       eccede più spesso di quello dei pieni, e chi conferma deve vederlo. */
    /* 2.35.1 — SU UN'UNITÀ NON SI SCEGLIE NIENTE: si prende intera. Chiedere
       quali colli portare via da un pallet imballato è la stessa domanda che
       la scansione unica esiste per non fare. */
    const scelteColli = this._routeTappaEUdc(st) ? null : await this._chiediColli(
      { article_code: st.article_code, lot_code: st.lot_code, location_code: st.location_code, item_key: st.item_key,
        ...(Store.getItemsAtLocation(st.location_code).find(i => i.item_key === st.item_key) || {}) },
      `Quali colli si prelevano · ordine ${this._qtaOrdine(st.kg_required, st.um)} ${st.um}`,
      null, { uom: st.kg_required }, 'spaiati');
    if (scelteColli === undefined) return this.toast('Prelievo annullato', 'info');

    let qty;
    if (this._routeTappaEUdc(st)) {
      /* 2.35.1 — e nemmeno quanti: li conta l'unità. */
      qty = 0;
    } else if (scelteColli) {
      /* I colli TOCCATI, quello aperto compreso: e' il numero che la tappa
         segna come prelevato, ed e' la stessa regola del conto WIP. */
      qty = scelteColli.length;
    } else {
      qty = await Dialog.qty({
        title: 'Colli prelevati',
        message: `Ordine: ${this._qtaOrdine(st.kg_required, st.um)} ${st.um}. Indicare quanti COLLI vengono portati via.`,
        details: Dialog.kv([
          ['Ubicazione', st.location_code],
          ['Articolo', st.article_code],
          ['Lotto', st.lot_code],
          ['Colli disponibili', avail]
        ]),
        value: avail, min: 1, max: avail, unit: 'Coll.'
      });
      if (qty === null) return;
    }

    const effectiveUser = this._prodOperator || Store.getCurrentIdentity().initials;
    const notes = st.forced_note || '';
    let removed = null;

    try {
      /* ═══ 2.31 · LA PREPARAZIONE SPOSTA, IL CONTO DI PRODUZIONE SCARICA ══
         Due gesti diversi sulla stessa scheda, e la differenza non è di
         forma. Un prelievo per la produzione porta la merce fuori dal
         magazzino: si scarica. Una preparazione la porta al banco d'imballo
         e da lì sul camion: resta in giacenza, prenotata dal DDT, e a
         scaricarla è l'evasione. Scaricare qui vorrebbe dire scaricarla due
         volte, e la seconda troverebbe il vano vuoto. */
      if ((session as Record<string, unknown>).prep_doc_id) {
        /* 2.38 — IL VANO LO DICE L'OPERATORE, e non c'è più una zona
           obbligatoria da cui dedurlo: preparare vuol dire radunare, e dove
           si raduna lo decide chi raduna. La zona serve ancora, ma solo a
           PROPORRE — `_prepVersoProposto` — e una proposta che manca non
           ferma niente. */
        const verso = this._prepVersoScelto();
        if (!verso) return;
        this._prepVerso = verso;
        const movimento = {
          type: MOV.MOVE,
          article_code: st.article_code,
          article_description: st.article_description,
          lot_code: st.lot_code,
          location_code: st.location_code,
          dest_location: verso,
          user: effectiveUser,
          notes,
          doc_ref: session.odp_num,
          ts: Date.now(),
        };
        /* 2.35.1 — il bancale si muove intero, o non si muove affatto perché
           è già al banco d'imballo: `commitPreparazioneUdc`. */
        if (this._routeTappaEUdc(st)) {
          const esito = await Store.commitPreparazioneUdc({ session, stop: st, verso, movement: movimento });
          await this._prepRiallineaDoc(session, st, esito.location_code);
          this._renderRouteRun($('pickSubForm'));
          this._refreshSessionLog();
          this.updateSyncIndicator();
          Feedback.signal('ok', esito.spostata ? 'Unità portata all’imballo' : 'Unità confermata',
            `${st.udc_id} · ${esito.colli} Coll. in ${esito.location_code}`);
          return;
        }
        removed = await Store.commitPreparazioneStop({
          session, stop: st, qty, verso, scelte: scelteColli,
          movement: movimento,
        });
        await this._prepRiallineaDoc(session, st, verso);
      } else {
      removed = await Store.commitPickStop({
        session,
        stop: st,
        qty,
        scelte: scelteColli,
        movement: {
          type: MOV.PICK,
          article_code: st.article_code,
          article_description: st.article_description,
          lot_code: st.lot_code,
          location_code: st.location_code,
          dest_location: null,
          user: effectiveUser,
          notes,
          doc_ref: session.odp_num,
          ts: Date.now()
        }
      });
      }
    } catch (err) {
      console.error('[WM] _routeConfirmStop:', err);
      st.status = 'pending'; st.qty_picked = 0; st.done_at = null;
      return this.toast(`Prelievo non registrato \u00b7 ${(err as Error).message} \u2014 nessuna modifica applicata`, 'error');
    }

    /* ═══ 2.1 — ANCHE IL PRELIEVO DA FILE FINISCE NEL CONTO ═══

       Il carrello di produzione portava la merce nel vano WIP dalla 1.14;
       il prelievo guidato da ODP — quello che nasce dal foglio Excel e che
       in magazzino è il più usato dei due — la faceva sparire dalla
       giacenza e basta. Due strade per lo stesso gesto, e il consumo reale
       di produzione contava solo quella meno battuta: «702 KG entrati, 0
       consumati» sarebbe stato il numero di ogni ordine prelevato da file.

       Il conto lo tiene l'ODP, e senza numero d'ordine non c'è conto da
       tenere — non è un errore, è un percorso che non nasce da un ordine.

       SE IL CONTO NON RIESCE, IL PRELIEVO NON SI ANNULLA: la merce è già
       fuori dallo scaffale, e rimetterla dentro per un problema di
       contabilità sarebbe muovere merce vera per un numero. Stessa regola
       del carrello, e sta scritta in tutti e due i posti. */
    /* 2.31 — UNA PREPARAZIONE NON ENTRA IN REPARTO, e va detto qui perché
       qui il codice non poteva saperlo: `session.odp_num` porta il numero
       del DDT, che è vero e non nullo, e fino alla 2.30 «c'è un numero
       d'ordine» voleva dire «c'è un conto di produzione da tenere».

       Trovato a video il 08/09: la prima preparazione ha scritto DUE
       movimenti invece di uno — il trasferimento giusto in zona
       imballaggio, e un ingresso nel vano di lavorazione che non c'entra
       niente. Quella merce va sul camion, non in impasto: aprirle un conto
       di produzione vorrebbe dire che qualcuno, guardando il conto di quel
       numero, ci troverebbe dentro della merce spedita. */
    if (session.odp_num && !(session as Record<string, unknown>).prep_doc_id) {
      try {
        const entrata = await Store.entraInWip(session.odp_num, {
          item_key: st.item_key,
          article_code: st.article_code,
          article_description: st.article_description,
          lot_code: st.lot_code,
          expiry_date: full.expiry_date || '',
          qty: removed!._packs_out?.length || Math.abs(removed!._qty_delta || qty),
          qty_uom: this._umMossa(removed),
          uom: Store.getUomConfig(st.article_code, st.lot_code)?.uom ?? null,
          packs: removed!._packs_out ?? null,
          /* 2.12 — GLI ALTRI ORDINI DEL GIRO viaggiano fino al movimento. Il
             conto resta uno, intestato al capofila: questo elenco non entra
             in nessun saldo e risponde a «per chi era sceso quel sacco». La
             ripartizione si dichiara alla chiusura, quando i numeri si sanno. */
          giro_odps: this._giroDellaSessione(session),
          giro_richieste: (st.richieste || null) as Richiesta[] | null,
          giro_id: session.session_id,
        });
        /* 2.2 — L'ARRIVO NEL VANO SI SCRIVE. Il prelievo diceva da dove la
           merce usciva e nient'altro: nel vano WIP compariva una giacenza che
           nessuna riga di registro aveva portato lì, e chi rileggeva il
           registro vedeva merce sparita dallo scaffale. Sono due fatti in due
           vani diversi, come la coppia FIX−/FIX+ dell'inventario, e il secondo
           si scrive solo se il conto è riuscito davvero. */
        const altri = (this._giroDellaSessione(session) || []).filter((x: string) => x !== session.odp_num);
        await this._logMov(MOV.IN, st.article_code, st.article_description, st.lot_code,
          entrata.location_code, null, effectiveUser,
          `Entrata nel conto di produzione — ordine ${session.odp_num}${altri.length ? ` · giro con ${altri.join(', ')}` : ''}`, session.odp_num,
          entrata.qty_before ?? null,
          (entrata.qty_after ?? 0) - (entrata.qty_before ?? 0),
          entrata.qty_after ?? null,
          typeof entrata.qty_uom_delta === 'number' ? entrata.qty_uom_delta : null);
      } catch (e) {
        this.toast(`Conto di produzione non aggiornato — ${(e as Error).message}. Il prelievo resta valido.`, 'error');
      }
    }

    /* Il registro di sessione a video e la finestra di storno restano
       coerenti con gli altri flussi. */
    /* 2.35.1 — E DICE QUEL CHE È SUCCESSO. La riga a video era sempre un
       `PICK`, cioè «Prelievo Produzione», anche quando il movimento scritto
       a registro era un `MOVE` verso la zona d'imballaggio. Due registri
       della stessa giornata che si contraddicono, e quello a video è il
       primo che l'operatore legge. */
    const prep = (session as Record<string, unknown>).prep_doc_id;
    this._movSessionLog.unshift({
      type: prep ? MOV.MOVE : MOV.PICK,
      article_code: st.article_code, article_description: st.article_description,
      lot_code: st.lot_code, location_code: st.location_code,
      dest_location: prep ? (st.moved_to || null) : null,
      user: effectiveUser, notes, doc_ref: session.odp_num, ts: Date.now(),
      qty_before: removed!._qty_before, qty_delta: removed!._qty_delta, qty_after: removed!._qty_after
    });
    if (this._movSessionLog.length > 100) this._movSessionLog.length = 100;

    /* 2.0 — L'AZIONE DI ANNULLAMENTO PORTA LE MISURE, non solo un numero di
       colli. Era l'unica delle quattro a non portare nemmeno `qty_uom`:
       stornare una tappa rimetteva colli PIENI, e un collo aperto per
       prendere dieci chili tornava da venticinque. `packs_prima` serve a
       richiudere quel collo invece di accodarne uno nuovo. */
    this._pushUndo(`Tappa ${st.seq} — ${st.article_code}#${st.lot_code} da ${st.location_code} (${qty} Coll.)`,
      [{ op: 'add', loc: st.location_code, art: st.article_code, desc: st.article_description,
         lot: st.lot_code, exp: full.expiry_date || '', notes: full.notes || '',
         qty: removed!._packs_out?.length || qty,
         qty_uom: this._umMossa(removed),
         packs: removed!._packs_out ?? null,
         packs_prima: removed!._packs_before ?? null }]);

    Feedback.signal('ok', `Tappa ${st.seq} completata`, `${qty} Coll. da ${st.location_code}`);
    this.updateSyncIndicator();
    this._renderRouteRun($('pickSubForm'));
    this._refreshSessionLog();
  },

  async _routeMarkMissing() {
    const session = Store.getActivePickSession();
    const st = this._routeCurrentStop();
    if (!session || !st) return;
    const note = await Dialog.reason({
      title: 'Merce non trovata',
      message: `Tappa ${st.seq} — ${st.article_code}#${st.lot_code} in ${st.location_code}.\nLa tappa viene marcata e il percorso prosegue.`,
      placeholder: 'Es. ubicazione vuota, pallet non reperibile, bancale spostato…',
      minLen: 5, confirmLabel: 'Marca non trovato', icon: 'circle-x'
    });
    if (!note) return;
    st.status = 'missing';
    st.reason = 'marked_missing';
    st.forced_note = note;
    st.done_at = Date.now();
    try {
      await Store.savePickSession(session);
    } catch (err) {
      st.status = 'pending';
      return this.toast(`Salvataggio non riuscito · ${(err as Error).message}`, 'error');
    }
    Feedback.signal('warn', 'Tappa marcata come non trovata', 'Finir\u00e0 in coda al percorso.');
    this._renderRouteRun($('pickSubForm'));
  },

  /* ─── SCHERMATA 3: CHIUSURA ─────────────────────────────────────── */
  _routeFinishHTML(s: SessionePrelievo) {
    const done    = (s.stops || []).filter((x) => x.status === 'done');
    const missing = (s.stops || []).filter((x) => x.status === 'missing');
    const tail    = [
      ...missing.map((x) => ({
        article_code: x.article_code, description: x.article_description, lot_code: x.lot_code,
        kg_required: x.kg_required, um: x.um, reason: 'marked_missing',
        detail: `Ubicazione prevista ${x.location_code}.`, forced_note: x.forced_note
      })),
      ...(s.offroute || [])
    ];
    return `
      <div class="route-done">
        <div class="route-done-ico">${this._ico('check')}</div>
        <strong>Percorso completato</strong>
        <div>${done.length} tappe prelevate su ${(s.stops || []).length} per l'ordine ${this._esc(s.odp_num)}.</div>
        ${(s.odps || []).length > 1 ? `<div class="text-body-small mt-2 opacity-85">
          Giro di ${(s.odps || []).length} ordini &mdash; ${this._esc((this._giroDellaSessione(s) || []).join(' · '))}.
          Il conto lo tiene <strong class="mono">${this._esc(s.odp_num)}</strong>; si ripartisce alla chiusura, in <strong>WIP</strong>.
        </div>` : ''}
      </div>

      ${tail.length ? `<div class="route-tail">
        <strong class="text-body-medium">${this._ico('clipboard-text')} Da recuperare fuori percorso (${tail.length})</strong>
        <div class="text-body-small opacity-85 mt-2 mx-0 mb-4">
          Righe non prelevabili dalle aree mappate: materiale stoccato fuori mappatura,
          lotti assenti o merce non reperita.
        </div>
        ${tail.map(o => this._routeTailRowHTML(o)).join('')}
      </div>` : '<div class="pick-cart-empty">Nessuna riga rimasta in sospeso.</div>'}

      ${s.notes?.length ? `<div class="route-note-box">
        <strong>ℹ️ ${s.notes.length} segnalazione/i — merce esistente ma non prelevabile</strong>
        ${(s.notes || []).map((n) => `<div class="route-note-row">
          <span class="badge badge-${n.reason === 'quarantine' ? 'red' : 'amber'}">${this._esc((PickRoute.REASON_LABELS as Record<string, string>)[n.reason || ''] || n.reason)}</span>
          <span class="mono">${this._esc(n.article_code)}#${this._esc(n.lot_code)}</span>
          <span class="mono">${this._esc(n.location_code)}</span>
        </div>`).join('')}
      </div>` : ''}

      <div class="flex gap-5 mt-8 flex-wrap">
        <button class="btn btn-primary btn-conferma"
          onclick="App._routeClose()">${this._ico('check')} CHIUDI E STAMPA REPORT</button>
      </div>`;
  },

  async _routeClose() {
    const s = Store.getActivePickSession();
    if (!s) return;

    /* ═══ 2.38 · L'IMBALLAGGIO È UN LAVORO, E SI PUÒ NON FARLO ═══════════

       Fino alla 2.37 il percorso non si chiudeva finché la merce sciolta non
       era composta in un'unità: `motivoNonChiudibile` lo impediva, e chi non
       imballava restava con un giro aperto in mano.

       Ma imballare è un mestiere suo, e chi ha appena radunato dieci pallet
       col transpallet non sempre è chi mette il cellophane. Adesso si chiede,
       e le due risposte portano in due posti diversi:

       · SÌ, IMBALLO IO — l'unità nasce, si etichetta, si porta in zona di
         spedizione, e l'attività torna in coda «carico pronto».
       · NO — l'attività torna in coda «da imballare», e la prende chi
         imballa. La merce è radunata davvero e sta dove l'operatore l'ha
         posata: non si perde niente, e il marchio in coda lo dice.

       IN NESSUNO DEI DUE CASI SI CHIUDE. L'attività di una spedizione si
       chiude quando la merce esce — `chiudiCompitiDelDocumento`, alla
       evasione — e non quando finisce uno dei tre pezzi che la compongono. */
    if ((s as Record<string, unknown>).prep_doc_id) {
      const sciolte = daImballare(s.stops);
      if (sciolte.length && !this._prepUdcComposte.length) {
        const imballo = await Dialog.confirm({
          title: 'Lo imballi tu?',
          message: 'La merce sciolta raccolta va composta in un’unità di carico, etichettata e '
            + 'portata in zona di spedizione. Se lo fai adesso si prosegue di qui; se no '
            + 'l’attività torna in elenco marcata «da imballare», e la prende chi imballa.',
          details: Dialog.kv([
            ['Partite da imballare', sciolte.length],
            ['Colli totali', sciolte.reduce((n, r) => n + r.colli, 0)],
            ['Radunate in', [...new Set(sciolte.map((r) => r.da).filter(Boolean))].join(' · ') || null],
            ['Bancali già pronti', unitaGiaPronte(s.stops).join(' · ') || null],
          ]),
          confirmLabel: 'Imballo io', cancelLabel: 'Lo imballa un altro', icon: 'stack',
        });
        /* La croce del dialogo dà `null`, e non è «lo imballa un altro»: è
           «non ho ancora deciso». Chiudere il giro su un ripensamento
           vorrebbe dire una scelta presa da chi non l'ha presa. */
        if (imballo === null) return;
        if (imballo) { await this._prepComponiUdc(s); return; }
      }
      const pendenti = (s.stops || []).filter((x) => x && x.status === 'pending').length;
      if (pendenti && !await Dialog.confirm({
        title: `Restano ${pendenti} tappe da fare`,
        message: 'Quella merce non è stata radunata, e il DDT resterà incompleto: chi evade se ne '
          + 'accorge, perché un documento a cui manca merce non si evade. Si chiude lo stesso?',
        confirmLabel: 'Chiudi il giro', danger: true,
      })) return;
    }

    await this._emitFinalPickReport(s);
    /* 2.35.2 — l'attività si chiude PRIMA che la sessione sparisca: il
       legame fra le due è `session.task_id`, e dopo `endPickSession` non c'è
       più niente da cui leggerlo. Vale per il prelievo ODP; la preparazione
       ha la sua strada, più sotto. */
    if (!(s as Record<string, unknown>).prep_doc_id) {
      await this._chiudiCompitoDelPercorso(s, (s.stops || []).filter((x) => x.status === 'pending').length);
    }
    await Store.endPickSession(s.session_id);
    this._routeStage = 'import';
    this._routeStartTime = null;
    this._formOrdine($('pickSubForm'));
    this.toast(`Percorso ${s.odp_num} chiuso`, 'success');

    /* 2.38 — e se era una preparazione, l'attività TORNA IN CODA. Il pezzo
       fatto è scritto nei movimenti del percorso; quel che resta — imballare
       se non l'ha fatto lui, e caricare — è lavoro per chi lo prende. */
    if ((s as Record<string, unknown>).prep_doc_id) {
      const composte = this._prepUdcComposte.length;
      this._prepUdcComposte = [];
      this._prepVerso = '';
      const nota = composte
        ? `Preparato e imballato · ${composte} ${composte === 1 ? 'unità composta' : 'unità composte'}`
        : 'Merce radunata';
      try {
        const t = await Store.rimettiInCodaSpedizione(s.task_id || '', s, nota);
        this.toast(`Attività ${t.task_id} torna in elenco — ${nota.toLowerCase()}`, 'success');
        if (this.currentView === 'tasks') this.renderTasks();
      } catch (err) {
        /* IL GIRO È FATTO E LA MERCE È MOSSA. Un'attività che non torna in
           coda è una riga da sistemare a mano, e va detta forte: senza
           questo riscontro resterebbe «in corso» a nome di chi ha finito. */
        this.toast(`Il percorso è chiuso, ma l'attività non è tornata in elenco · ${(err as Error).message}`, 'error');
      }
    }
  },

  /* Le unità composte in questa chiusura. Vive quanto la chiusura: si azzera
     appena il compito avanza. Non sta nella sessione perché non è storia del
     percorso — è lo stato di un gesto che dura un minuto. */
  _prepUdcComposte: [] as string[],

  /* Il primo vano utilizzabile di una zona: è quello che si PROPONE, non
     quello che si impone.

     LO SPAZIO NON SI CONTA — è la regola della zona d'imballaggio: il banco
     è piccolo davvero, ma il limite lo governa a vista chi ci lavora.
     Quindi un vano già occupato non è un errore: si preferisce uno libero
     perché la mappa resti leggibile, e se non ce n'è si usa il primo
     utilizzabile. Stessa scelta del prodotto finito — `_pfProponiUbicazione`. */
  _prepVanoImballo(zona) {
    let ripiego = '';
    for (const u of Store.generateLocations(zona.sito.id, zona.zona.id)) {
      const stato = Store.getLocationStatus(u.code);
      if (stato === 'blocked' || stato === 'disabled') continue;
      if (!Store.getItemsAtLocation(u.code).length) return u.code;
      if (!ripiego) ripiego = u.code;
    }
    return ripiego;
  },

  /* ═══ 2.38 · PREPARARE VUOL DIRE RADUNARE, E CHI RADUNA SCEGLIE DOVE ═══

     Fino alla 2.37 una tappa di preparazione portava la merce nel vano che
     il SISTEMA sceglieva: il primo libero della zona di imballaggio. Era
     giusto finché preparare voleva dire «portare al banco d'imballo», e ha
     smesso di esserlo quando si è guardato che cosa succede davvero — i
     bancali di un DDT si radunano insieme, in un posto che decide chi ha in
     mano il transpallet guardando quel che è libero e quel che è comodo.

     QUINDI SI SCANSIONA, E IL SISTEMA PROPONE. La proposta non è una
     regola: è il primo vano utilizzabile della zona giusta di QUEL sito —
     imballaggio per la merce sciolta, spedizione per un bancale intero — e
     dalla seconda tappa in poi è l'ultimo vano usato, perché chi raduna
     dieci pallet nello stesso posto non deve scansionarlo dieci volte.

     UN VANO FUORI ZONA NON SI RIFIUTA. Le zone marcate dicono dove il
     sistema PROPONE, non dove il magazzino può posare: rifiutare vorrebbe
     dire fermare un giro perché una configurazione è indietro rispetto a un
     capannone — §2.35.2, il sistema aiuta e non blocca. Quel che si rifiuta
     è un vano che non esiste, o bloccato: là la merce non ci può stare. */

  /** L'ultimo vano su cui questa preparazione ha posato qualcosa. Vive
      quanto il percorso; chi rientra dopo un ricaricamento se lo ritrova
      dalle tappe già fatte — `_prepVersoProposto`. */
  _prepVerso: '' as string,

  /** Che cosa proporre come destinazione di questa tappa. */
  _prepVersoProposto(st) {
    if (this._prepVerso) return this._prepVerso;
    /* Chi rientra dopo un ricaricamento non ha più `_prepVerso`, ma le tappe
       già confermate sanno dove hanno posato: l'ultima è la proposta. */
    const s = Store.getActivePickSession();
    const fatte = (s?.stops || []).filter((x) => x && x.status === 'done'
      && (x as { moved_to?: string }).moved_to);
    const ultima = fatte[fatte.length - 1] as { moved_to?: string } | undefined;
    if (ultima?.moved_to) return String(ultima.moved_to);

    const siti = Store.getSites();
    const zona = this._routeTappaEUdc(st)
      ? (zonaSpedizioneDi(siti, st.site_id) || zoneSpedizione(siti)[0])
      : (zonaImballoDi(siti, st.site_id) || zoneImballo(siti)[0]);
    return zona ? this._prepVanoImballo(zona) : '';
  },

  /** Il campo del vano di destinazione, sulla scheda della tappa. Esce solo
      su una preparazione: su un prelievo di produzione la merce non si posa
      da nessuna parte, si scarica. */
  _prepVersoHTML(st) {
    const s = Store.getActivePickSession();
    if (!(s as Record<string, unknown> | null)?.prep_doc_id) return '';
    const proposta = this._prepVersoProposto(st);
    const udc = this._routeTappaEUdc(st);
    return `<div class="form-group mt-6 mx-0 mb-4">
      <label>${udc ? '②' : '④'} Scansiona DOVE SI POSA <span class="req">*</span></label>
      <div class="flex gap-3">
        <input class="input input-mono" id="rVerso" value="${this._esc(proposta)}"
          placeholder="Scansiona il vano dove raduni" maxlength="${Validate.MAX.LOC_CODE}"
          oninput="App._normScan('rVerso')"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._normScan('rVerso');App._routeConfirmStop();}">
        <button class="btn btn-sm" type="button" onclick="App._pickLoc('rVerso')" title="Sfoglia le ubicazioni">${this._ico('map-pin')}</button>
      </div>
      <div class="text-label-small text-sx-text-muted mt-2">
        ${proposta
          ? `Proposto <span class="mono">${this._esc(proposta)}</span>${this._prepVerso ? ' — l&rsquo;ultimo che hai usato' : ''}. Si pu&ograve; scansionare un altro vano.`
          : 'Nessuna zona proposta: si scansiona il vano dove si raduna.'}
      </div>
    </div>`;
  },

  /** Il vano scansionato, controllato. Torna `null` — dopo averlo detto — se
      non si può usare. */
  _prepVersoScelto(): string | null {
    const val = Validate.clean($('rVerso')?.value, true).replace(/'/g, '-').toUpperCase();
    if (!val) {
      this.toast('Scansiona il vano dove posi la merce: senza, il sistema non sa dove l’hai messa', 'error');
      $('rVerso')?.focus();
      return null;
    }
    if (!Store.locationExists(val)) {
      this.toast(`L'ubicazione ${val} non esiste a sistema`, 'error');
      $('rVerso')?.focus();
      return null;
    }
    const stato = Store.getLocationStatus(val);
    if (stato === 'blocked' || stato === 'disabled') {
      this.toast(`${val} è ${stato === 'blocked' ? 'bloccata' : 'disattivata'}: la merce non ci si posa`, 'error');
      $('rVerso')?.focus();
      return null;
    }
    return val;
  },

  /* 2.31 — LA RIGA DEL DOCUMENTO SEGUE LA MERCE.

     Il DDT dice da quale vano esce ogni riga, e dopo lo spostamento quel
     vano è un altro: un documento che nomina quello di prima manda
     l'evasione a cercare dove non c'è più niente. È la stessa cosa che fa
     `_carRiallineaDoc` per i bancali dalla 2.21, e per la stessa ragione.

     SI RIALLINEA UNA RIGA PER VOLTA, appena la tappa è confermata, e non
     tutte alla fine: se il turno si interrompe a metà, quel che è stato
     spostato deve risultare spostato anche sul documento. */
  async _prepRiallineaDoc(session, st, verso) {
    const docId = String((session as Record<string, unknown>).prep_doc_id || '');
    const doc = Store.getAllOutbound().find((d) => d.doc_id === docId);
    if (!doc) return;
    const chiave = String(st.item_key || '').toUpperCase();
    const daDove = String(st.location_code || '').toUpperCase();
    let toccata = false;
    const lines = (doc.lines || []).map((l) => {
      const suo = String(l.item_key || `${l.article_code}#${l.lot_code}`).toUpperCase();
      if (suo !== chiave || String(l.location_code || '').toUpperCase() !== daDove) return l;
      toccata = true;
      return { ...l, location_code: verso };
    });
    if (!toccata) return;
    try { await Store.updatePendingDoc(docId, { lines }); }
    catch (err) {
      this.toast(`Il documento non si è riallineato al vano nuovo · ${(err as Error).message}`, 'warning');
    }
  },

  /* ═══ 2.38 · IMBALLARE: L'UNITÀ NASCE DOVE STA LA MERCE, POI VA IN
         ZONA DI SPEDIZIONE ══════════════════════════════════════════════

     TRE GESTI, IN QUEST'ORDINE, E L'ORDINE È UN VINCOLO FISICO.

     ① L'unità nasce NEL VANO DOVE LE TAPPE HANNO POSATO LA MERCE. Non in
        uno nuovo: `moved_to` dice dove il pallet è davvero, e farlo nascere
        altrove vorrebbe dire assegnargli righe che stanno in un altro vano.
     ② SI STAMPA SUBITO. La stampante è al banco d'imballo, e chi imballa è
        lì: chiedere prima il vano di spedizione vorrebbe dire mandarlo allo
        scaffale, farlo tornare a stampare, e rimandarlo là. Un avanti e
        indietro che si smette di fare al terzo pallet.
     ③ POI si scansiona dove va, in zona di spedizione, e ci si porta.

     L'ETICHETTA NON MENTE, ANCHE SE IL PALLET SI MUOVE DOPO. Porta il
     CONTENUTO — §8, ed è il dato che non invecchia — e il contenuto c'è
     tutto già al passo ①: le righe sono assegnate PRIMA di stampare. È la
     lezione della 2.33 al contrario — là l'etichetta usciva su un'unità
     ancora vuota e dichiarava «0 partite», qui esce su una piena. */
  async _prepComponiUdc(s) {
    const udcId = await this._prepImballa(
      daImballare(s?.stops),
      s?.stops?.[0]?.site_id || '',
      String((s as Record<string, unknown>)?.prep_doc_id || ''),
      unitaGiaPronte(s?.stops),
    );
    if (udcId) this._prepUdcComposte.push(udcId);
    this._renderRouteRun($('pickSubForm'));
  },

  /* ═══ 2.38 · IMBALLARE, DA QUALUNQUE PARTE SI ARRIVI ═════════════════

     Ci si arriva in due modi: dalla chiusura del percorso, se chi ha
     radunato imballa anche; o dalla coda, prendendo in carico un'attività
     marcata «da imballare» che qualcun altro ha lasciato lì.

     È LO STESSO LAVORO, quindi è lo stesso codice. Le due strade portano
     righe da posti diversi — le tappe di una sessione, o le righe sciolte
     del documento — e da lì in poi non c'è nessuna differenza: la merce sta
     in un vano, diventa un'unità, si etichetta, va in spedizione. Scriverlo
     due volte vorrebbe dire due imballaggi che si somigliano finché qualcuno
     non corregge uno solo dei due.

     Torna il codice dell'unità nata, o `null` se non è nata. */
  async _prepImballa(
    sciolte: { item_key: string; article_code: string; lot_code: string; colli: number; um: string; da: string }[],
    sito: string, docId: string, giaPronte: string[] = [],
  ): Promise<string | null> {
    if (!sciolte.length) return null;

    const siti = Store.getSites();
    /* 2.38 — IL VANO È QUELLO DOVE LA MERCE STA, e non c'è più una zona da
       cui dedurlo: le tappe lo sanno — `moved_to` — perché a sceglierlo è
       stato l'operatore, scansionandolo. La zona di imballaggio resta solo
       come ripiego per un giro in cui nessuna tappa dice dove ha posato. */
    const vani = [...new Set(sciolte.map((r) => r.da).filter(Boolean))];
    const zonaImb = zonaImballoDi(siti, sito) || zoneImballo(siti)[0];
    const vano = vani[0] || (zonaImb ? this._prepVanoImballo(zonaImb) : '');
    if (!vano) {
      this.toast(
        'Non si sa dove sta la merce raccolta: nessuna riga dice dove è stata posata, e nessuna '
        + 'zona di imballaggio è dichiarata in Configurazione → Siti e Zone.', 'error');
      return null;
    }
    if (vani.length > 1) {
      this.toast(`La merce raccolta sta in ${vani.length} vani (${vani.join(', ')}): `
        + `l'unità nasce in ${vano} e le altre partite vanno portate lì prima.`, 'warning');
    }

    const ok = await Dialog.confirm({
      title: 'Comporre l’unità di carico?',
      message: 'La merce raccolta diventa un’unità: si compone dove sta adesso, si stampa '
             + 'l’etichetta al banco, e poi si scansiona dove la si porta in zona di spedizione.',
      details: Dialog.kv([
        ['L’unità nasce in', vano],
        ['Partite da comporre', sciolte.length],
        ['Colli totali', sciolte.reduce((n, r) => n + r.colli, 0)],
        ['Bancali già pronti', giaPronte.join(' · ') || null],
      ]),
      confirmLabel: 'Componi ed etichetta', icon: 'stack',
    });
    if (!ok) return null;

    let udc;
    try {
      const g = Store.buildLocationGeometry().get(String(vano).toUpperCase());
      udc = await Store.createUdc({ type: 'pallet', site_id: g?.site_id || sito, location_code: vano });
      /* LE RIGHE SONO GIÀ QUI. La merce è stata SPOSTATA nel vano di
         radunata — dalle tappe del percorso, o da chi l'ha radunata prima —
         quindi assegnarla all'unità è una riga sola per partita, dal vano
         dove sta adesso. Una che non si trova non ferma le altre: il
         riscontro lo dice. */
      const perse: string[] = [];
      for (const r of sciolte) {
        try { await Store.assegnaAUdc(r.da || vano, r.item_key, udc.udc_id); }
        catch { perse.push(`${r.item_key} (${r.da || vano})`); }
      }
      if (perse.length) {
        this.toast(`Non caricate sull'unità: ${perse.join(', ')} — da guardare in ${vano}`, 'warning');
      }
      this.toast(`Unità ${udc.udc_id} composta in ${vano}`, 'success');
      await this._chiediStampaEtichetta('udc', udc.udc_id);
    } catch (err) {
      this.toast(`L'unità non è nata · ${(err as Error).message}`, 'error');
      return null;
    }

    /* IL DOCUMENTO PRIMA DELLO SPOSTAMENTO, e non è un ordine indifferente:
       `_prepPortaInSpedizione` muove il pallet, e il riallineamento rilegge
       da `righeDiUdc` dove le righe stanno ADESSO. Invertirli scriverebbe
       sul DDT il vano del banco su merce che sta già in spedizione — lo
       stesso difetto della 2.35.1, dall'altra parte. */
    await this._prepRiallineaUdcDoc(docId, udc.udc_id);
    await this._prepPortaInSpedizione(udc.udc_id, vano, sito);
    await this._prepRiallineaUdcDoc(docId, udc.udc_id);
    return udc.udc_id;
  },

  /* ═══ 2.38 · E POI IN ZONA DI SPEDIZIONE ══════════════════════════════
     L'unità è fatta ed etichettata, e adesso va dove i bancali pronti
     aspettano il camion. Il vano lo scansiona chi la porta, con la proposta
     del sito giusto — la stessa regola delle tappe.

     NON PORTARLA NON È UN ERRORE. Se l'operatore chiude la finestra l'unità
     resta al banco d'imballo: esiste, è etichettata e porta la sua merce, e
     spostarla resta un normale trasferimento. Fermare qui il lavoro
     vorrebbe dire un giro che non si chiude per un gesto che si può fare
     dopo — e un'attività che non si chiude è la coda che non si smaltisce,
     §2.35.2. */
  async _prepPortaInSpedizione(udcId, da, sito) {
    const siti = Store.getSites();
    const zona = zonaSpedizioneDi(siti, sito) || zoneSpedizione(siti)[0];
    const proposta = zona ? this._prepVanoImballo(zona) : '';
    const dove = await Dialog.testo({
      title: 'Dove la porti in spedizione?',
      message: `L’unità ${udcId} è al banco, in ${da}. Scansiona il vano della zona di spedizione `
             + 'dove la posi. Si può saltare: resta al banco, e si sposta dopo con un trasferimento.',
      details: Dialog.kv([
        ['Zona di spedizione', zona ? `${zona.sito.id} / ${zona.zona.name || zona.zona.id}` : 'nessuna dichiarata'],
      ]),
      placeholder: 'Scansiona il vano',
      valore: proposta,
      /* Un codice di ubicazione è maiuscolo dappertutto: qui come nel campo
         della tappa — `CAMPI_CODICE` in `modules/maiuscole.ts`. */
      maiuscolo: true,
      confirmLabel: 'Porta qui', icon: 'map-pin',
    });
    const meta = String(dove || '').trim().toUpperCase().replace(/'/g, '-');
    if (!meta) return;
    if (meta === String(da || '').toUpperCase()) {
      return this.toast(`${meta} è il banco: l’unità resta dov’è`, 'info');
    }
    if (!Store.locationExists(meta)) return this.toast(`L'ubicazione ${meta} non esiste a sistema`, 'error');
    const stato = Store.getLocationStatus(meta);
    if (stato === 'blocked' || stato === 'disabled') {
      return this.toast(`${meta} è ${stato === 'blocked' ? 'bloccata' : 'disattivata'}: l'unità non ci si posa`, 'error');
    }
    try {
      await Store.moveUdc(udcId, meta, {
        type: MOV.UDC, article_code: '', article_description: '', lot_code: '',
        location_code: da, dest_location: meta,
        user: this._prodOperator || Store.getCurrentIdentity().initials, ts: Date.now(),
        notes: `Imballaggio spedizione — ${udcId} in zona di spedizione`,
      });
      this.toast(`Unità ${udcId} portata in ${meta}`, 'success');
    } catch (err) {
      this.toast(`${udcId} non si è spostata · ${(err as Error).message}`, 'error');
    }
  },

  /* ═══ 2.38 · IL DOCUMENTO DEVE SAPERE CHE LA MERCE ADESSO STA SU UN
         BANCALE ═════════════════════════════════════════════════════════

     Le righe di un DDT preparato si riallineano al vano di radunata una per
     una, mentre il percorso va — `_prepRiallineaDoc`. Comporre l'unità le
     mette SOTTO UN'UNITÀ, e quello sul documento non lo scriveva nessuno.

     Senza, due cose non funzionano, ed è la stessa riga che le rompe
     entrambe: il carico del camion costruisce le sue tappe dalle righe che
     portano un `udc_id` — `_carTappeDaDoc` — e non ne troverebbe nessuna,
     mandando in baia un giro a zero tappe su un pallet che c'è; e il marchio
     «carico pronto» resterebbe spento su un DDT pronto davvero, perché
     `statoSpedizione` legge la stessa colonna.

     È quel che fa `_carRiallineaDoc` dopo ogni scansione in baia, e per la
     stessa ragione: il documento è la fonte, e una fonte che non sa dov'è la
     merce manda a cercarla dove non c'è. */
  async _prepRiallineaUdcDoc(docId, udcId) {
    if (!docId) return;
    const doc = Store.getAllOutbound().find((d) => d.doc_id === docId);
    if (!doc) return;
    const righe = Store.righeDiUdc(udcId);
    if (!righe.length) return;
    const sopra = new Map(righe.map((r) => [
      String(r.item_key || `${r.article_code}#${r.lot_code}`).toUpperCase(),
      String(r.location_code || '').toUpperCase(),
    ]));
    let toccata = false;
    const lines = (doc.lines || []).map((l) => {
      const suo = String(l.udc_id || '').trim().toUpperCase();
      if (suo && suo !== String(udcId).toUpperCase()) return l;
      const k = String(l.item_key || `${l.article_code}#${l.lot_code}`).toUpperCase();
      const vano = sopra.get(k);
      if (!vano) return l;
      if (suo === String(udcId).toUpperCase() && String(l.location_code || '').toUpperCase() === vano) return l;
      toccata = true;
      return { ...l, udc_id: udcId, location_code: vano };
    });
    if (!toccata) return;
    try { await Store.updatePendingDoc(docId, { lines }); }
    catch (err) {
      this.toast(`Il documento non sa che la merce è sull’unità ${udcId} · ${(err as Error).message}`, 'warning');
    }
  },

  /* ═══ 2.38 · PRENDERE IN CARICO UN IMBALLAGGIO ═══════════════════════
     La merce è già radunata: l'ha portata al banco chi ha fatto il percorso,
     e l'ha lasciata lì marcando l'attività «da imballare». Qui non c'è
     nessun giro da aprire — c'è un pallet da comporre.

     LE RIGHE SI LEGGONO DAL DOCUMENTO, non da una sessione. La sessione di
     chi ha radunato è chiusa da un pezzo, e il DDT sa dov'è la sua merce
     perché ogni tappa l'ha riallineato mentre spostava.

     E POI L'ATTIVITÀ TORNA IN CODA, «carico pronto»: imballare è il secondo
     dei tre lavori, non l'ultimo. */
  async _prepImballaDaCompito(t) {
    const docId = String((t?.payload as Record<string, unknown> | null)?.doc_id || '');
    const doc = Store.getAllOutbound().find((d) => d.doc_id === docId);
    if (!doc) {
      return this.toast(`Il documento ${docId || '(assente)'} non esiste più: non c'è niente da imballare.`, 'error');
    }
    const motivo = motivoNonPreparabile(doc);
    if (motivo) return this.toast(`Niente da imballare — ${motivo}`, 'warning');

    const sciolte = daImballareDalDoc(doc);
    if (!sciolte.length) {
      return this.toast(`DDT ${doc.ddt_num}: ogni riga sta già su un bancale, non c'è niente da imballare.`, 'info');
    }
    const gia = [...new Set((doc.lines || [])
      .map((l) => String(l.udc_id || '').trim()).filter(Boolean))];
    const g = Store.buildLocationGeometry().get(String(sciolte[0]?.da || '').toUpperCase());

    const udcId = await this._prepImballa(sciolte, g?.site_id || '', docId, gia);
    if (!udcId) return;

    try {
      /* LA SESSIONE CHE NON C'È. `rimettiInCodaSpedizione` pretende quella
         del compito perché nasce dalla chiusura di un percorso; qui il
         percorso non c'è, e il legame è il DOCUMENTO — che è più forte:
         l'unità appena composta porta le righe di quel DDT. */
      const t2 = await Store.rimettiInCodaSpedizione(t.task_id, { task_id: t.task_id } as never,
        `Imballato · unità ${udcId}`);
      this.toast(`Attività ${t2.task_id} torna in elenco — carico pronto`, 'success');
    } catch (err) {
      this.toast(`L'unità è composta, ma l'attività non è tornata in elenco · ${(err as Error).message}`, 'error');
    }
    this.switchView('tasks');
    this.renderTasks();
  },

  /* ═══ 2.32 · PRENDERE IN CARICO UN PRELIEVO ODP ═══════════════════════
     La distinta è già allegata alla richiesta: si scarica dal servizio e si
     apre nella scheda del prelievo automatico, esattamente come se
     l'operatore l'avesse appena caricata a mano.

     IL PERCORSO NON SI AVVIA DA SOLO, e non è una dimenticanza. Fra la
     distinta letta e il giro in corsia c'è la configurazione — quale
     magazzino è casa, quali ordini stanno insieme, se una quantità va
     ricalibrata — e quelle decisioni le prende chi scende, guardando il
     magazzino di adesso e non quello di quando la richiesta è stata scritta.
     Qui si toglie il passaggio a voce, non il mestiere. */
  async _odpAvvia(t) {
    const p = (t?.payload || {}) as Record<string, unknown>;
    const id = String(p.allegato || '');
    if (!id) {
      return this.toast('Questa attività non porta nessuna distinta: chi l\'ha chiesta non l\'ha allegata.', 'error');
    }

    /* ═══ 2.35.1 · UN PERCORSO GIÀ APERTO SI GUARDA PRIMA ════════════════
       Segnalato dal magazzino l'08/09: «quando l'operatore inizia, il
       sistema non carica automaticamente il file xls per iniziare la
       configurazione del percorso».

       La causa non era la lettura del file — quella funzionava. Era che
       `_pickSub('ordine')` RICALCOLA lo stadio dalla sessione attiva:

           this._routeStage = Store.getActivePickSession() ? 'run' : 'import';

       cioè cancella l'«import» che questa funzione aveva appena scritto. Con
       un percorso aperto — e ne basta uno lasciato indietro giorni prima —
       la distinta veniva letta e messa in `_routeOrdini`, ma a video restava
       il percorso in corso e la maschera di configurazione non compariva
       mai. Sopra, un riscontro verde che diceva «configura il percorso e
       avvia»: il sistema annunciava una schermata che non aveva aperto.

       Il rimedio non è forzare `import` dopo `_pickSub` — vorrebbe dire
       nascondere un giro vivo e lasciarlo orfano. È guardare PRIMA che cosa
       c'è aperto, e dire quale delle due cose sta succedendo. */
    const aperta = Store.getActivePickSession();
    if (aperta) {
      /* Il proprio percorso di questa stessa attività: non è un ostacolo, è
         il lavoro di prima. Si riprende da dove era rimasto. */
      if (aperta.task_id && aperta.task_id === t?.task_id) {
        this._routeStage = 'run';
        this._pickSubMode = 'ordine';
        this.switchView('movimenta');
        this.startMov('pick');
        setTimeout(() => { this._pickSub('ordine'); this._routeResume(); }, 60);
        return this.toast(`Percorso ${aperta.odp_num} ripreso — era già avviato per questa attività`, 'info');
      }
      const fatte = (aperta.stops || []).filter((s) => s.status !== 'pending').length;
      this._routeStage = 'run';
      this._pickSubMode = 'ordine';
      this.switchView('movimenta');
      this.startMov('pick');
      setTimeout(() => this._pickSub('ordine'), 60);
      return this.toast(
        `C'è già un percorso aperto — ${aperta.odp_num}, ${fatte} di ${(aperta.stops || []).length} tappe. `
        + 'Chiudilo o finiscilo, poi riavvia questa attività: la distinta è ancora allegata.',
        'warning');
    }

    this._routeStage = 'import';
    this._pickSubMode = 'ordine';
    this.switchView('movimenta');
    this.startMov('pick');
    await new Promise((r) => setTimeout(r, 200));
    this._pickSub('ordine');
    await new Promise((r) => setTimeout(r, 200));

    try {
      const risposta = await fetch(`/api/allegati/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
      if (!risposta.ok) {
        throw new Error(risposta.status === 404
          ? 'la distinta non è più sul servizio'
          : `il servizio ha risposto ${risposta.status}`);
      }
      const buf = await risposta.arrayBuffer();
      const nome = String(p.allegato_nome || 'distinta.xlsx');
      /* 2.35.1 — E SI DICE «CARICATA» SOLO SE LO È. `_routeLeggiFile`
         rifiuta un ordine già nel giro, uno archiviato, un file illeggibile
         — e lo dice con un riscontro suo. Qui sopra ne arrivava un secondo,
         verde, che diceva il contrario: due riscontri opposti sullo stesso
         gesto, e quello verde era l'ultimo, quindi era quello che restava. */
      const letta = await this._routeLeggiFile(new File([buf], nome, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      if (letta) {
        /* La sessione che nascerà porta il compito: è così che il percorso e
           l'attività restano la stessa cosa — `_routeStart` lo raccoglie. */
        this._routeCompito = String(t?.task_id || '');
        this.toast(`Distinta ${nome} caricata — configura il percorso e avvia`, 'success');
      }
    } catch (err) {
      this.toast(`La distinta non si è aperta · ${(err as Error).message}`, 'error');
    }
  },

  /* ═══ 2.31 · PRENDERE IN CARICO UNA PREPARAZIONE ══════════════════════
     Il percorso non si configura: c'è già. Il documento dice articolo,
     lotto e vano di ogni riga, e li ha scelti chi ha composto il DDT — la
     merce è prenotata da quel momento. Quel che manca è andarla a prendere.

     PERCHÉ IL DOCUMENTO SI RILEGGE ADESSO E NON DAL PAYLOAD. Il compito
     porta il RIFERIMENTO, non una copia delle righe: fra la registrazione e
     la presa in carico possono passare giorni, e `updatePendingDoc` può
     averle corrette. Una copia congelata manderebbe a prendere merce che il
     documento non chiede più. */
  async _prepAvvia(t) {
    const docId = String((t?.payload as Record<string, unknown> | null)?.doc_id || '');
    const doc = Store.getAllOutbound().find((d) => d.doc_id === docId);
    if (!doc) {
      return this.toast(`Il documento ${docId || '(assente)'} non esiste più: l'attività non ha più merce da nominare.`, 'error');
    }
    const motivo = motivoNonPreparabile(doc);
    if (motivo) return this.toast(`Niente da preparare — ${motivo}`, 'warning');

    const cose = daPreparare(doc.lines);
    const p = PickRoute.buildPreparazione(cose);

    /* La sessione porta il compito: è così che, rientrando dopo un
       ricaricamento, si ritrova il lavoro giusto — `modules/sessioni`. */
    const session = {
      session_id: `PS-${(doc.ddt_num || 'DDT').replace(/\s/g, '')}-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      task_id: t.task_id,
      owner: Store.getCurrentIdentity().initials,
      operator: this._prodOperator || Store.getCurrentIdentity().initials,
      status: 'active',
      created_at: Date.now(),
      odp_num: doc.ddt_num || doc.doc_id,
      site_order: PickRoute.getSiteOrder(),
      stops: p.stops,
      offroute: [],
      notes: [],
      warnings: [],
      prep_doc_id: doc.doc_id,
    };
    try {
      await Store.startPickSession(session);
    } catch (err) {
      return this.toast(`Avvio non riuscito · ${(err as Error).message}`, 'error');
    }
    this._routeStage = 'run';
    this._pickSubMode = 'ordine';
    this.switchView('movimenta');
    this.startMov('pick');
    setTimeout(() => this._pickSub('ordine'), 60);
    this.toast(`Preparazione del DDT ${doc.ddt_num} · ${p.stops.length} tappe`, 'success');
  },

  /* ─── RIPRESA ALL'AVVIO ─────────────────────────────────────────── */
  /* Chiamata da init(). Se una sessione è sopravvissuta a una chiusura
     imprevista, l'operatore la ritrova qui invece di doverla ricostruire. */
  async _checkPendingPickSession() {
    const s = Store.getActivePickSession();
    if (!s) return;
    const done    = (s.stops || []).filter(x => x.status === 'done').length;
    const missing = (s.stops || []).filter(x => x.status === 'missing').length;
    const left    = (s.stops || []).filter(x => x.status === 'pending').length;
    if (!left) return;                       // già concluso: si riprende dalla scheda
    const resume = await Dialog.confirm({
      title: 'Percorso di prelievo in corso',
      message: 'Un percorso non \u00e8 stato concluso. I prelievi gi\u00e0 confermati sono registrati: qui si riprende soltanto il cammino rimasto.',
      details: Dialog.kv([
        ['Ordine', s.odp_num],
        ['Operatore', s.operator],
        ['Avviato il', new Date(s.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
        ['Tappe confermate', done],
        ['Non trovate', missing || null],
        ['Ancora da fare', left]
      ]),
      confirmLabel: 'Riprendi', cancelLabel: 'Non ora', icon: 'player-pause'
    });
    if (!resume) return;
    this._routeStage = 'run';
    this._pickSubMode = 'ordine';
    this.switchView('movimenta');
    this.startMov('prelievo');
    setTimeout(() => this._pickSub('ordine'), 60);
  },
} satisfies Vista;
