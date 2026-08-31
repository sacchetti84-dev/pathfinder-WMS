import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog';
import { consumo as consumoWip, daRendere, rendiconto, misureDelReso,
         motivoNonStornabile } from '../../modules/wip';
import type { RigaInLavorazione, Reso } from '../../modules/wip';
import { quote as quoteGiro } from '../../modules/giroOdp';
import { formattaQuantita } from '../../modules/misure';
import { componi, alClic, segno, STATO_VUOTO } from '../../modules/tabella';
import type { Colonna, Stato } from '../../modules/tabella';

/* ═══════════════════════════════════════════════════════════════════════
   1.14 — IL CONTO DI PRODUZIONE, LA MASCHERA
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Qui si guarda un ordine: quanto è entrato in lavorazione, quanto è
   tornato, quanto è ancora fuori. Da qui si rende quello che avanza, e si
   chiude il conto — ed è la chiusura a trasformare il residuo in CONSUMO.

   IL CONSUMO NON SI DEDUCE OGNI SERA. Finché l'ordine è aperto il residuo è
   merce ancora sul bancone: chiamarlo consumo scriverebbe un numero che alle
   sette di sera è sempre sbagliato. Per questo il riquadro dice «ancora in
   lavorazione» e non «consumato», e cambia parola solo alla chiusura.

   CHIUDERE NON CANCELLA NIENTE. Le righe restano, il vano WIP resta con
   dentro quello che non è tornato, e la chiusura è un movimento come gli
   altri: la merce esce dal conto perché è finita nel prodotto.

   ── 2.14 · LA SCHERMATA PARTE DALLA MERCE, NON DAL NUMERO ──────────────

   Fino alla 2.13 qui si entrava per numero d'ordine: una riga di pulsantini
   coi conti aperti, una con quelli serviti da un giro, una con gli
   archiviati — che si allungava per sempre e si troncava a otto. Per vedere
   che cosa ci fosse nel vano bisognava aprire gli ordini uno per uno, e chi
   il numero non ce l'aveva in testa non arrivava alla merce.

   Adesso il primo elenco è QUELLO CHE È FERMO DI LÀ: una riga per ogni
   articolo#lotto di ogni ordine, ordinabile e filtrabile, coi due gesti
   sulla riga. Gli ordini aperti restano in un elenco compatto sotto, che è
   dove si chiude un conto — chiudere è un gesto sull'ordine, non sulla
   merce. **L'archivio è uscito da qui**: gli ordini chiusi stanno in
   Archivio insieme agli altri documenti, dove c'è una tabella che si
   ordina, si filtra e si cerca per data.

   La regola sta in `modules/wip.ts`, pura e collaudata.
   ═══════════════════════════════════════════════════════════════════════ */

export const VistaWip = {
  _wipOrdine: '',
  /** Ordinamento e filtro della lista in lavorazione. Vedi `modules/tabella.ts`. */
  _wipTabella: STATO_VUOTO as Stato,
  /** Le righe che nessun ordine rivendica: un avviso, non il lavoro. Stanno
      chiuse finché qualcuno non le apre. */
  _wipOrfaneAperte: false,

  _wipColonne(): Colonna<RigaInLavorazione>[] {
    return [
      { campo: 'article_code', titolo: 'Articolo' },
      { campo: 'descrizione', titolo: 'Descrizione',
        valore: (r) => Store.getArticle(r.article_code)?.description || '' },
      { campo: 'lot_code', titolo: 'Lotto' },
      { campo: 'odp_num', titolo: 'Ordine' },
      { campo: 'residuo', titolo: 'Colli', tipo: 'numero', cercabile: false },
      { campo: 'residuo_uom', titolo: 'Quantità', tipo: 'numero', cercabile: false },
      { campo: 'dal', titolo: 'In lavorazione da', tipo: 'data', cercabile: false },
      { campo: 'azioni', titolo: '', ordinabile: false, cercabile: false },
    ];
  },

  _wipOrdina(campo) {
    this._wipTabella = alClic(this._wipTabella, campo);
    this._wipRidisegnaLista();
  },

  /* La casella di ricerca non si ridisegna: ridisegnare l'input mentre ci si
     scrive dentro perde il fuoco e il punto del cursore, e chi digita se ne
     accorge alla seconda lettera. Si ridisegna solo la tabella. */
  _wipCerca(v) {
    this._wipTabella = { ...this._wipTabella, cerca: String(v ?? '') };
    this._wipRidisegnaLista();
  },

  _wipRidisegnaLista() {
    const box = $('wipLista');
    if (box) box.innerHTML = this._wipListaHTML();
  },

  /* Quanto è ancora fuori, in colli e — quando si sa — nella sua unità. */
  _wipQta(colli: number, um: number | null | undefined, u: string | null | undefined) {
    return `${colli} Coll.${(typeof um === 'number' && u) ? ` · ${formattaQuantita(um, u)} ${this._esc(u)}` : ''}`;
  },

  /* ── LA LISTA DI QUELLO CHE È FERMO IN LAVORAZIONE ────────────────────
     Una riga per ordine × articolo#lotto: è l'unità su cui si agisce,
     perché il vano è uno e a tenere distinti i conti è l'ordine. */
  _wipListaHTML() {
    const tutte: RigaInLavorazione[] = Store.righeInLavorazioneWip();
    const colonne = this._wipColonne();
    const righe = componi(tutte, colonne, this._wipTabella);

    if (!tutte.length) {
      return '<div class="empty-state p-7.5"><p>Nel vano di lavorazione non c’è niente di nessun ordine.</p></div>';
    }

    const th = (campo: string, titolo: string, classe = '') =>
      `<th class="sx-th-ord ${classe}" onclick="App._wipOrdina('${campo}')" title="Ordina per ${titolo}">${titolo}${segno(this._wipTabella, campo)}</th>`;

    const corpo = righe.map((r) => {
      const desc = Store.getArticle(r.article_code)?.description || '';
      /* UN RESIDUO NEGATIVO NON SI NASCONDE: è il conto che non sta in piedi
         (voce 61), e questa è l'unica schermata da cui si vede. */
      const storto = r.residuo < 0 || (r.residuo_uom ?? 0) < 0;
      return `<tr class="${storto ? 'wip-storta' : ''}">
        <td>
          <div class="mono font-semibold">${this._esc(r.article_code)}</div>
          ${desc ? `<div class="wip-desc truncate text-label-small text-sx-text-muted">${this._esc(desc)}</div>` : ''}
        </td>
        <td class="mono">${this._esc(r.lot_code)}</td>
        <td>
          <button class="btn btn-sm btn-ghost mono" title="Apri il conto di ${this._esc(r.odp_num)}"
            onclick="App._wipApri('${this._esc(r.odp_num)}')">${this._esc(r.odp_num)}</button>
          ${r.serviti.length ? `<span class="badge badge-muted" title="Questo conto serve anche ${this._esc(r.serviti.join(', '))}">🔗 ${r.serviti.length + 1}</span>` : ''}
        </td>
        <td class="td-num ${storto ? 'text-sx-danger font-bold' : ''}">${r.residuo}</td>
        <td class="td-num">${(typeof r.residuo_uom === 'number' && r.uom)
          ? `${formattaQuantita(r.residuo_uom, r.uom)} ${this._esc(r.uom)}` : '—'}</td>
        <td class="wip-col-data mono whitespace-nowrap text-label-small">${r.dal ? this._esc(this._fmtStamp(r.dal)) : '—'}</td>
        <td class="whitespace-nowrap">
          <button class="inv-btn" title="Rendi a magazzino quello che avanza"
            onclick="App._wipDaRiga('${this._esc(r.odp_num)}','${this._esc(r.item_key)}','reso')">↩</button>
          <button class="inv-btn" title="Consumato del tutto: niente rientra, e questa riga si chiude"
            onclick="App._wipDaRiga('${this._esc(r.odp_num)}','${this._esc(r.item_key)}','consumo')">🔥</button>
        </td>
      </tr>`;
    }).join('');

    return `<div class="wip-lista overflow-x-auto">
      <table class="sx-table">
        <thead><tr>
          ${th('article_code', 'Articolo')}
          ${th('lot_code', 'Lotto', 'w-[120px]')}
          ${th('odp_num', 'Ordine', 'w-[140px]')}
          ${th('residuo', 'Colli', 'w-[70px]')}
          ${th('residuo_uom', 'Quantità', 'w-[120px]')}
          ${th('dal', 'Da', 'w-[130px] wip-col-data')}
          <th class="w-[90px]"></th>
        </tr></thead>
        <tbody>${corpo}</tbody>
      </table>
    </div>
    ${righe.length !== tutte.length
      ? `<div class="text-label-small text-sx-text-muted mt-3">${righe.length} righe su ${tutte.length}.</div>` : ''}
    ${!righe.length ? '<div class="ct-empty">Nessuna riga corrisponde alla ricerca.</div>' : ''}`;
  },

  /* Rendere o consumare una riga presi dalla lista: l'ordine si apre prima,
     perché tutto il resto della maschera lavora su `_wipOrdine`. */
  _wipDaRiga(odp, itemKey, gesto) {
    this._wipOrdine = String(odp ?? '').trim().toUpperCase();
    if (gesto === 'consumo') return this._wipConsumaTutto(itemKey);
    return this._wipChiediReso(itemKey);
  },

  /* ── GLI ORDINI APERTI ────────────────────────────────────────────────
     Chiudere è un gesto sull'ORDINE, non sulla merce: sta qui e non sulla
     riga. Un ordine a residuo zero e non ancora archiviato compare lo
     stesso — non ha niente in lavorazione, ma è ancora vivo e il file di
     produzione lo può ricaricare finché nessuno lo chiude. */
  _wipOrdiniHTML() {
    const aperti: string[] = Store.ordiniWipAperti();
    const daChiudere: string[] = [];
    for (const m of Store.getWipMovimenti() as { odp_num?: string }[]) {
      const o = String(m?.odp_num ?? '').trim().toUpperCase();
      if (!o || aperti.includes(o) || daChiudere.includes(o)) continue;
      if (!Store.ordineWipArchiviato(o)) daChiudere.push(o);
    }
    const tutti = [...aperti, ...daChiudere];
    if (!tutti.length) return '<div class="ct-empty">Nessun conto aperto.</div>';

    return tutti.map((odp) => {
      const c = Store.contoWip(odp);
      const serviti = Store.ordiniServitiWip(odp);
      const vuoto = c.residuo === 0;
      return `<div class="wip-ordine ${this._wipOrdine === odp ? 'wip-ordine--aperto' : ''}">
        <div class="wip-ordine-testa">
          <button class="btn btn-sm btn-ghost mono font-bold" onclick="App._wipApri('${this._esc(odp)}')">${this._esc(odp)}</button>
          ${serviti.length ? `<span class="badge badge-muted" title="Serve anche ${this._esc(serviti.join(', '))}">🔗 giro di ${serviti.length + 1}</span>` : ''}
          ${c.incoerente ? '<span class="badge badge-red" title="Da qualche riga è tornato più di quanto sia entrato">⚠ conto storto</span>' : ''}
          ${vuoto ? '<span class="badge badge-green">tutto rientrato — resta da chiudere</span>' : ''}
        </div>
        <div class="wip-ordine-conto text-label-small text-sx-text-muted">
          entrato ${c.entrato} · reso ${c.tornato}${c.consumato ? ` · consumato ${c.consumato}` : ''} ·
          <strong class="${c.residuo ? 'text-sx-warning' : 'text-sx-success'}">in lavorazione ${c.residuo}</strong>
        </div>
        <div class="wip-ordine-gesti">
          <!-- «Chiudi» da solo no: sotto c'è il pulsante che chiude la SCHERMATA,
               e due Chiudi a due centimetri l'uno dall'altro sono uno che si
               preme per sbaglio su un gesto che archivia un ordine. -->
          <button class="btn btn-sm btn-primary" onclick="App._wipApri('${this._esc(odp)}');App._wipChiudi()">🏁 Chiudi e archivia</button>
          <button class="btn btn-sm" onclick="App._wipApri('${this._esc(odp)}');App._wipCorreggiReso()">⟲ Correggi un reso</button>
          <button class="btn btn-sm btn-ghost" onclick="App._wipApri('${this._esc(odp)}');App._wipStampaRendiconto()">🖨 Report</button>
        </div>
      </div>`;
    }).join('');
  },

  _formWip(el) {
    if (!el) return;
    const area = Store.getAreaWip();
    const righe: RigaInLavorazione[] = area ? Store.righeInLavorazioneWip() : [];
    const orfane = Store.righeWipSenzaOrdine();
    const colli = righe.reduce((s, r) => s + (r.residuo > 0 ? r.residuo : 0), 0);
    const ordini = new Set(righe.map((r) => r.odp_num)).size;

    el.innerHTML = `<div>
      ${area
        ? `<div class="wip-testa">
             <div>
               <span class="wip-testa-lbl">Vano di lavorazione</span>
               <span class="mono font-bold">${this._esc(area)}</span>
             </div>
             <div class="wip-testa-conti">
               <span><strong>${righe.length}</strong> righe</span>
               <span><strong>${colli}</strong> Coll.</span>
               <span><strong>${ordini}</strong> ordin${ordini === 1 ? 'e' : 'i'}</span>
             </div>
             <button class="btn btn-sm btn-ghost" title="Gli ordini chiusi stanno in Archivio, con gli altri documenti"
               onclick="App._wipVaiAllArchivio()">🗄 Archivio ODP</button>
           </div>`
        : `<div class="mov-preview mov-preview-warn mb-5"><strong>Area WIP non configurata.</strong>
             Si imposta in Configurazione → Funzioni: senza, il prelievo di produzione non ha dove portare la merce.</div>`}

      ${orfane.length ? `<div class="mov-preview mov-preview-warn mb-5">
        <button class="wip-orfane-testa" onclick="App._wipOrfaneAperte=!App._wipOrfaneAperte;App._formWip($('pickSubForm'))">
          <strong>⚠ ${orfane.length} rig${orfane.length === 1 ? 'a' : 'he'} nel vano che nessun ordine rivendica</strong>
          <span>${this._wipOrfaneAperte ? '▾' : '▸'}</span>
        </button>
        ${this._wipOrfaneAperte ? `<div class="mt-3 text-body-small">
          Il reso e la chiusura lavorano per ordine e non ${orfane.length === 1 ? 'la' : 'le'} vedono.
          Si ${orfane.length === 1 ? 'muove' : 'muovono'} da <strong>Movimenta</strong>, o si ${orfane.length === 1 ? 'carica' : 'caricano'} su un ordine con un prelievo di produzione.
          <div class="mt-2">${orfane.map((r) => `<span class="badge badge-muted mono mr-2">${this._esc(r.item_key)} · ${r.qty} Coll.</span>`).join('')}</div>
        </div>` : ''}
      </div>` : ''}

      <div class="wip-cerca">
        <input class="input" id="wipCerca" placeholder="Cerca articolo, descrizione, lotto o ordine…"
          value="${this._esc(this._wipTabella.cerca)}" oninput="App._wipCerca(this.value)">
        <input class="input input-mono uppercase" id="wipOrd" placeholder="Apri un ordine" maxlength="40"
          value="${this._esc(this._wipOrdine)}"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._wipApri();}">
        <button class="btn btn-sm" onclick="App._wipApri()">Apri</button>
      </div>

      <div id="wipLista" class="mb-6">${area ? this._wipListaHTML() : ''}</div>

      <h4 class="wip-sezione">Conti aperti</h4>
      <div class="mb-6">${this._wipOrdiniHTML()}</div>

      <div id="wipConto"></div>
    </div>`;
    if (this._wipOrdine) this._wipRenderConto();
  },

  /* L'archivio degli ordini chiusi sta in Archivio, filtrato sul suo genere:
     ci si arriva da qui senza doverlo cercare fra i DDT. */
  _wipVaiAllArchivio() {
    this._arcType = 'odp';
    this._arcText = '';
    this.switchView('archive');
  },

  _wipApri(ordine = null) {
    const o = String(ordine ?? $('wipOrd')?.value ?? '').trim().toUpperCase();
    this._wipOrdine = o;
    const campo = $('wipOrd');
    if (campo) campo.value = o;
    this._wipRenderConto();
  },


  _wipRenderConto() {
    const box = $('wipConto');
    if (!box) return;
    const odp = this._wipOrdine;
    if (!odp) { box.innerHTML = ''; return; }
    const c = Store.contoWip(odp);
    if (!c.righe.length) {
      /* 2.12 — UN ORDINE PRELEVATO DENTRO UN GIRO NON HA MOVIMENTI SUOI: la
         merce e' scesa sotto il capofila, e il suo numero sta scritto su
         quelle righe. Rispondere «nessun movimento» sarebbe la risposta
         sbagliata alla domanda giusta — di quest'ordine non risulta niente
         mentre la merce e' in reparto da stamattina. */
      const altrove = Store.contoTenutoDaWip(odp);
      box.innerHTML = altrove
        ? `<div class="mov-preview mov-preview-warn p-7.5">
             <strong>🔗 Il conto di ${this._esc(odp)} lo tiene ${this._esc(altrove.capofila)}</strong><br>
             Prelevato in un giro con altri: la merce e' scesa una volta sola, sotto il
             capofila, e la ripartizione si dichiara alla chiusura di quel conto.
             <div class="mt-4"><button class="btn btn-primary" onclick="App._wipApri('${this._esc(altrove.capofila)}')">Apri il conto di ${this._esc(altrove.capofila)}</button></div>
           </div>`
        : `<div class="empty-state p-7.5"><p>Nessun movimento sul conto di ${this._esc(odp)}</p></div>`;
      return;
    }
    /* Gli altri ordini che questo conto sta servendo. */
    const serviti = Store.ordiniServitiWip(odp);
    const vano = Store.getAreaWip() || '—';
    const rendere = daRendere(c);
    /* 2.1 — UN ORDINE ARCHIVIATO SI LEGGE E SI STAMPA, E NON SI TOCCA.
       I pulsanti che muovono merce spariscono invece di essere spenti: un
       pulsante grigio dice «adesso no», e qui la risposta è «mai più». */
    const archiviato = c.chiuso;

    const um = (n: number | null | undefined, u: string | null | undefined) =>
      (typeof n === 'number' && u) ? ` · ${formattaQuantita(n, u)} ${this._esc(u)}` : '';

    let html = `${archiviato ? `<div class="mov-preview mov-preview-ok mb-5">
      <strong>🗄 Ordine chiuso e archiviato</strong>${c.chiuso_il ? ` il ${this._fmtStamp(c.chiuso_il)}` : ''} —
      il conto è storia: non entra merce e non ne esce, nemmeno ricaricando lo stesso ordine.
      Il rendiconto si stampa.
    </div>` : ''}
    <div class="mov-preview ${c.incoerente ? 'mov-preview-err' : ''} mb-5">
      <strong class="mono">${this._esc(odp)}</strong> — vano <span class="mono">${this._esc(vano)}</span><br>
      Entrato <strong>${c.entrato} Coll.</strong> · reso <strong>${c.tornato}</strong>${c.consumato ? ` · <strong class="text-sx-success">consumato ${c.consumato}</strong>` : ''} ·
      <strong class="text-sx-warning">ancora in lavorazione ${c.residuo}</strong>
      ${c.incoerente ? '<br><strong>⚠ Da qualche riga è tornato più di quanto sia entrato: il conto non sta in piedi.</strong>' : ''}
    </div>
    ${serviti.length ? `<div class="mov-preview mov-preview-warn mb-5">
      <strong>🔗 Serve ${serviti.length + 1} ordini</strong> — ${this._esc([odp, ...serviti].join(' · '))}.
      Alla chiusura il consumo si ripartisce in proporzione a quanto ciascuno aveva chiesto.
    </div>` : ''}`;

    for (const r of c.righe) {
      const fuori = r.residuo > 0;
      html += `<div class="inv-item-row">
        <div class="inv-info">
          <div class="inv-code">${this._esc(r.article_code)} <span class="font-normal text-body-small text-sx-text-secondary">lotto ${this._esc(r.lot_code)}</span></div>
          <div class="inv-lot">
            entrato ${r.entrato}${um(r.entrato_uom, r.uom)} ·
            reso ${r.tornato}${um(r.tornato_uom, r.uom)}${r.consumato ? ` · consumato ${r.consumato}${um(r.consumato_uom, r.uom)}` : ''} ·
            <strong class="${fuori ? 'text-sx-warning' : 'text-sx-success'}">resta ${r.residuo}${um(r.residuo_uom, r.uom)}</strong>
          </div>
        </div>
        <div class="inv-actions-row">
          ${archiviato ? '<span class="text-sx-text-muted">🗄</span>'
            : fuori ? `<button class="inv-btn" title="Rendi a magazzino quello che avanza" onclick="App._wipChiediReso('${this._esc(r.item_key)}')">↩</button>
            <button class="inv-btn" title="Consumato del tutto: niente rientra, e questa riga si chiude" onclick="App._wipConsumaTutto('${this._esc(r.item_key)}')">🔥</button>` : '<span class="text-sx-success">✓</span>'}
        </div>
      </div>`;
    }

    html += `<div class="mov-divider"></div>
      <div class="flex gap-3 flex-wrap">
        ${archiviato ? '' : `<button class="btn btn-primary" onclick="App._wipChiudi()">
          🏁 Chiudi e archivia${c.residuo ? ` — ${c.residuo} Coll. diventano consumo` : ''}
        </button>`}
        <button class="btn" onclick="App._wipStampaRendiconto()">🖨 Report consumo</button>
        ${!archiviato && rendere.length ? `<span class="text-label-small text-sx-text-muted pt-4">${rendere.length} rig${rendere.length === 1 ? 'a' : 'he'} da rendere, se non è stata consumata</span>` : ''}
      </div>`;
    box.innerHTML = html;
  },

  /* ══ 2.14 · CORREGGERE UN RESO SBAGLIATO ══════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

     Un reso finito nel vano sbagliato, o fatto su una riga per un'altra,
     fin qui non aveva una via d'uscita: la merce era a scaffale sotto una
     causale che diceva una cosa non vera, e il conto era calato di colli
     che in reparto c'erano ancora. Si usciva riposizionando a mano da
     Movimenta, e il conto di produzione restava storto lo stesso.

     LA MASCHERA ELENCA I RESI, non chiede di descriverne uno: chi corregge
     sta guardando una riga che esiste, e sceglierla è più sicuro che
     ridigitarla. Accanto a ciascuno c'è quello che serve a riconoscerlo —
     quando, che cosa, quanto, dove è andato e chi l'ha firmato — e il
     motivo, quando quel reso non si può annullare.

     La regola sta in `Store.stornaResoWip` e in `motivoNonStornabile`. */
  _wipCorreggiReso() {
    const odp = this._wipOrdine;
    if (!odp) return this.toast('Apri prima un ordine', 'error');
    if (Store.ordineWipArchiviato(odp)) {
      return this.toast(`L'ordine ${odp} è chiuso e archiviato: sul suo conto non si scrive più`, 'error');
    }
    const elenco: Reso[] = Store.resiWip(odp);
    if (!elenco.length) return this.toast(`Sul conto di ${odp} non risulta nessun reso`, 'info');

    const righe = elenco.map((r) => {
      const motivo = motivoNonStornabile(r);
      const quanto = `${r.qty} Coll.`
        + (typeof r.qty_uom === 'number' && r.uom ? ` · ${formattaQuantita(r.qty_uom, r.uom)} ${this._esc(r.uom)}` : '');
      return `<div class="wip-reso ${motivo ? 'wip-reso--no' : ''}">
        <div class="wip-reso-che">
          <div><strong class="mono">${this._esc(r.article_code)}</strong>
            <span class="text-body-small text-sx-text-secondary">lotto ${this._esc(r.lot_code)}</span></div>
          <div class="text-label-small text-sx-text-muted">
            ${r.ts ? this._esc(this._fmtStamp(r.ts)) : '—'} ·
            <strong>${quanto}</strong> ·
            ${r.dove ? `in <span class="mono">${this._esc(r.dove)}</span>` : '<em>ubicazione non registrata</em>'}
            ${r.user ? ` · ${this._esc(r.user)}` : ''}
          </div>
          ${r.vuoto ? `<div class="text-label-small text-sx-warning">
            Con una confezione aperta: ${typeof r.vuoto.qty_uom === 'number' && r.uom
              ? `${formattaQuantita(r.vuoto.qty_uom, r.uom)} ${this._esc(r.uom)}` : 'una parte'}
            ${'sono già a consumo e restano dichiarati — quella merce è finita nel prodotto.'}
          </div>` : ''}
          ${motivo ? `<div class="text-label-small text-sx-danger mt-1">${this._esc(motivo)}</div>` : ''}
        </div>
        ${motivo ? '' : `<div class="wip-reso-gesto">
          ${r.dove ? '' : `<input class="input input-mono uppercase w-[150px]" id="stornoDove_${this._esc(r.wip_id)}"
            placeholder="Da dove" maxlength="${Validate.MAX.LOC_CODE}" oninput="this.value=this.value.toUpperCase()">`}
          <button class="btn btn-sm btn-warning" onclick="App._wipStorna('${this._esc(r.wip_id)}')">⟲ Storna</button>
        </div>`}
      </div>`;
    }).join('');

    this.showModal(
      `⟲ Correggi un reso — ordine ${this._esc(odp)}`,
      `<div class="mov-preview mb-5">
        La merce torna nel vano di lavorazione e il conto risale. <strong>Il reso resta scritto</strong>:
        accanto nasce il movimento che lo annulla, con la data e la firma di adesso.
      </div>
      ${righe}`,
      '<button class="btn" onclick="App.closeModal()">Chiudi</button>'
    );
  },

  async _wipStorna(wipId) {
    if (!this._requireOperator('lo storno di un reso')) return;
    const odp = this._wipOrdine;
    const r = Store.resiWip(odp).find((x) => x.wip_id === wipId);
    if (!r) return this.toast('Reso non trovato sul conto', 'error');
    const motivo = motivoNonStornabile(r);
    if (motivo) return this.toast(motivo, 'error');

    /* Dove riprendere la merce: quello scritto sul reso, o quello che
       l'operatore indica sulle righe vecchie che non lo portano. */
    const scritto = $(`stornoDove_${wipId}`)?.value;
    const da = Validate.clean(scritto ?? r.dove ?? '', true).replace(/'/g, '-');
    if (!da) return this.toast('Indica da quale ubicazione riprendere la merce', 'error');
    if (!Store.locationExists(da)) return this.toast(`Ubicazione ${da} inesistente`, 'error');

    const quanto = `${r.qty} Coll.`
      + (typeof r.qty_uom === 'number' && r.uom ? ` · ${formattaQuantita(r.qty_uom, r.uom)} ${r.uom}` : '');
    if (!await Dialog.confirm({
      title: 'Stornare questo reso?',
      message: `${r.article_code}#${r.lot_code}: ${quanto} escono da ${da} e tornano nel vano di `
        + `lavorazione, sul conto di ${odp}. Il reso resta scritto e accanto nasce il movimento che lo annulla.`
        + (r.vuoto ? ' La parte già dichiarata a consumo NON torna indietro: quella merce è finita nel prodotto.' : ''),
      /* «Annulla» è già il pulsante che NON fa niente: due Annulla su una
         finestra che muove merce sono due modi di premere quello sbagliato. */
      confirmLabel: '⟲ Storna il reso',
      danger: true,
    })) return;

    let esito;
    try {
      esito = await Store.stornaResoWip(odp, wipId, da);
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    /* IL REGISTRO PORTA IL VERSO GIUSTO. I numeri sono quelli
       dell'ubicazione da cui la merce esce, come li scrive ogni altro
       trasferimento — qui il lato che cala è lo scaffale, non il vano. */
    const u = esito.uscita as Record<string, any>;
    await this._logMov(MOV.MOVE, r.article_code, '', r.lot_code, da, esito.vano,
      '', `Storno del reso al conto di produzione ${odp}`, odp,
      u?._qty_before ?? null, u?._qty_delta ?? null, u?._qty_after ?? null,
      typeof u?._qty_uom_delta === 'number' ? u._qty_uom_delta : null);

    this.closeModal();
    this._formWip($('pickSubForm'));
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
    this.toast(`⟲ Reso annullato — ${esito.colli} Coll. tornati in ${esito.vano}`, 'success');
  },


  _wipChiediReso(itemKey) {
    const c = Store.contoWip(this._wipOrdine);
    const r = c.righe.find((x) => x.item_key === itemKey);
    if (!r) return this.toast('Riga non trovata sul conto', 'error');
    /* 2.2 — IL LOTTO CHE NON DICHIARA I SUOI COLLI LO PUO' DICHIARARE QUI.
       Mezza anagrafica la quantità per collo non ce l'ha, e senza quella una
       confezione aperta non ha un collo a cui riferirsi: fin qui il reso
       parziale si rifiutava e l'operatore restava col sacco in mano. Il campo
       compare SOLO su queste righe — dove le misure ci sono già, chiederle
       sarebbe una domanda a cui il magazzino ha già risposto. */
    const senzaMisure = !(Store.colliDiRiga(
      Store.getItemsAtLocation(Store.getAreaWip()).find((x) => x.item_key === itemKey)) || []).length;
    this.showModal(
      '↩ Rendi a magazzino',
      `<div class="bg-sx-bg-alt border border-sx-border rounded-[var(--radius-md)] py-5.5 px-7.5 mb-8.5 text-body-small text-sx-text-secondary">
        <strong class="mono">${this._esc(r.article_code)}</strong> lotto <span class="mono">${this._esc(r.lot_code)}</span> ·
        ordine <strong class="mono">${this._esc(this._wipOrdine)}</strong> ·
        in lavorazione <strong>${r.residuo} Coll.</strong>
      </div>
      <div class="form-row mb-6">
        <div class="form-group">
          <label>Colli interi che tornano</label>
          <input class="input input-mono text-center font-bold" id="wipQty" type="number" min="0" step="1" max="${r.residuo}" value="${r.residuo}">
        </div>
        <div class="form-group">
          <label>Più una confezione aperta, con dentro${r.uom ? ` (${this._esc(r.uom)})` : ''}</label>
          <input class="input input-mono" id="wipParte" inputmode="decimal" autocomplete="off" placeholder="facoltativo — es. 5">
        </div>
        ${senzaMisure ? `<div class="form-group col-span-2">
          <label>Quanto contiene un collo intero${r.uom ? ` (${this._esc(r.uom)})` : ''}</label>
          <input class="input input-mono" id="wipPerCollo" inputmode="decimal" autocomplete="off" placeholder="es. 25">
          <div class="text-label-small text-sx-text-muted mt-2">Il lotto non dichiara le misure dei suoi colli: si scrive una volta sola e vale per tutti.</div>
        </div>` : ''}
        <div class="form-group col-span-2">
          <label>Ubicazione di rientro <span class="req">*</span></label>
          <div class="flex gap-3">
            <input class="input input-mono uppercase flex-1" id="wipDove" placeholder="Scansiona o digita l’ubicazione" maxlength="${Validate.MAX.LOC_CODE}"
              oninput="this.value=this.value.toUpperCase();App._previewLoc('wipDove','wipDovePrev')">
            <button class="btn btn-sm" type="button" onclick="App._pickLoc('wipDove',null)" title="Sfoglia">📍</button>
          </div>
          <div id="wipDovePrev"></div>
        </div>
      </div>
      <div class="mov-preview">
        Il conto cala di quello che rientra. <strong>Una confezione aperta torna a scaffale
        con dentro quel che resta</strong>, e la differenza va a consumo: dal vano è uscita.
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App._wipRendi('${this._esc(itemKey)}')">↩ Rendi</button>`
    );
  },

  async _wipRendi(itemKey) {
    if (!this._requireOperator('il reso dal conto di produzione')) return;
    const c = Store.contoWip(this._wipOrdine);
    const r = c.righe.find((x) => x.item_key === itemKey);
    if (!r) return this.toast('Riga non trovata sul conto', 'error');
    /* 2.1 — UN COLLO RIENTRA ANCHE APERTO, ed è il caso comune: un sacco
       sceso in lavorazione risale a metà. Il campo della parte ha la stessa
       forma che ha in `_chiediColli` — «e in più, una parte di un altro
       collo» — perché è la stessa domanda, e due maschere che chiedono la
       stessa cosa con parole diverse si rispondono in modo diverso. */
    const interi = parseInt($('wipQty')?.value, 10) || 0;
    const scritto = String($('wipParte')?.value ?? '').trim();
    const parte = scritto ? Number(scritto.replace(',', '.')) : 0;
    if (scritto && (!Number.isFinite(parte) || parte <= 0)) {
      return this.toast('La parte che rientra non è un numero', 'error');
    }
    /* I colli TOCCATI: quelli interi più quello che si apre. È questo il
       numero che il conto vede scendere, non le UM. */
    const qty = interi + (parte > 0 ? 1 : 0);
    if (qty < 1) return this.toast('Indica quanti colli tornano, o che parte di uno', 'error');
    if (qty > r.residuo) {
      return this.toast(`Quest'ordine ha ${r.residuo} coll. in lavorazione: non ne possono tornare ${qty}`, 'error');
    }
    const dove = Validate.clean($('wipDove')?.value, true).replace(/'/g, '-');
    if (!dove) return this.toast('Indica dove rientra la merce', 'error');
    if (!Store.locationExists(dove)) return this.toast(`Ubicazione ${dove} inesistente`, 'error');
    const stato = Store.getLocationStatus(dove);
    if (stato === 'blocked' || stato === 'disabled') {
      return this.toast(`Ubicazione ${dove} ${stato === 'blocked' ? 'BLOCCATA' : 'DISATTIVATA'}`, 'error');
    }

    const vano = Store.getAreaWip();

    /* QUALI COLLI TORNANO, non quanti. Il vano WIP è uno solo e ci convivono
       le righe di più ordini: la scelta si fa sull'elenco che QUEST'ORDINE
       ha ancora fuori, come il DDT la fa sui colli ancora liberi. Se il lotto
       non dichiara i colli l'elenco è vuoto e si torna a lavorare a numero,
       che è il comportamento di sempre. */
    const nelVano = Store.getItemsAtLocation(vano).find((x) => x.item_key === itemKey);

    let rientrati = '';
    /* Quanto rientra DAVVERO in UM, e con quali colli: con una confezione
       aperta i due numeri non sono quelli che escono dal vano. */
    let umResa: number | null = null;
    let packsRientro: number[] | null = null;
    let scelte;
    if (parte > 0 && !(Store.colliDiRiga(nelVano) || []).length) {
      /* La misura si scrive PRIMA di toccare la merce: da qui in poi la riga
         dichiara i suoi colli e il reso parziale è un reso parziale come gli
         altri. Se la dichiarazione non riesce non si muove niente. */
      const scrittoPer = String($('wipPerCollo')?.value ?? '').trim();
      if (!scrittoPer) {
        return this.toast(`${r.article_code}#${r.lot_code} non dichiara le misure dei suoi colli: `
          + 'dire quanto contiene un collo intero, o rendere solo colli interi', 'error');
      }
      const perCollo = Number(scrittoPer.replace(',', '.'));
      if (!Number.isFinite(perCollo) || perCollo <= 0) {
        return this.toast('Quanto contiene un collo intero: non è un numero', 'error');
      }
      try {
        const cfgNuova = await Store.dichiaraConfezioneLotto(r.article_code, r.lot_code, perCollo);
        await this._logMov(MOV.EDIT, r.article_code, '', r.lot_code, vano, null, '',
          `Confezione del lotto dichiarata: ${formattaQuantita(cfgNuova.per_collo, cfgNuova.uom)} ${cfgNuova.uom} per collo`,
          this._wipOrdine);
      } catch (e) {
        return this.toast((e as Error).message, 'error');
      }
    }
    if (parte > 0) {
      /* Aprire un collo pretende di sapere QUALE si apre, e quindi che la
         riga i colli li dichiari: senza elenco «7,5 KG di un collo» non ha
         un collo a cui riferirsi, e scriverlo lo stesso lascerebbe un saldo
         sopra un elenco che non c'è. */
      const esito = this._wipScelteConParte(nelVano, itemKey, interi, parte, r);
      if (typeof esito === 'string') return this.toast(esito, 'error');
      scelte = esito.scelte;
      /* QUANTO RIENTRA DAVVERO: i colli interi per intero, più quel che c'è
         dentro la confezione aperta. È il numero che va a registro come
         reso; il resto del collo aperto è consumo. */
      umResa = esito.misure.intere.reduce((n: number, m: number) => n + m, 0) + parte;
      /* A magazzino rientrano i colli interi COM'ERANO, e la confezione
         aperta con dentro quel che resta — non con quanto pesava prima. */
      packsRientro = [...esito.misure.intere, parte];
    } else {
      scelte = await this._wipScegliColli(nelVano, itemKey, qty,
        `Quali colli tornano · ${r.article_code}#${r.lot_code}`);
      if (scelte === undefined) return this.toast('Reso annullato', 'info');
    }

    let uscita: Record<string, any> | null = null;
    try {
      /* 2.14 — DOVE RIENTRA E CON QUALI COLLI si scrive sul reso, perché è
         da lì che lo storno riprende la merce. I colli rientrati si passano
         solo quando divergono da quelli usciti — cioè quando una confezione
         si è aperta: negli altri casi sono gli stessi, e `resi` li ritrova. */
      const tolti = await Store.esceDaWip(this._wipOrdine, {
        item_key: itemKey, article_code: r.article_code, lot_code: r.lot_code, qty,
        uom: r.uom,
      }, scelte, 'out', umResa, { dove, packs: packsRientro });
      uscita = tolti as Record<string, any>;
      /* La merce rientra com'è uscita: gli stessi colli, e le stesse UM. Un
         reso che rientra «a numero» rinascerebbe con la confezione
         dell'anagrafica, che sul lotto non vale — la confezione del lotto
         vince sempre. */
      const packs = packsRientro ?? tolti._packs_out ?? null;
      const res = await Store.addItem(dove, r.article_code, '', r.lot_code, '',
        `Reso da ordine ${this._wipOrdine}`,
        packs ? packs.length : Math.abs(tolti._qty_delta ?? qty),
        umResa ?? (typeof tolti._qty_uom_delta === 'number' ? Math.abs(tolti._qty_uom_delta) : null),
        packs);
      if (!res.ok) return this.toast('Reso non riuscito al rientro', 'error');
      /* QUANTO È RIENTRATO DAVVERO. Con una confezione aperta i colli sono
         quelli che tornano sullo scaffale — l'aperta compresa — ma le UM
         sono meno di quelle uscite dal vano: la differenza è consumo, e
         dirla «resa» sarebbe merce che sullo scaffale nessuno trova. */
      const colli = packs ? packs.length : Math.abs(tolti._qty_delta ?? qty);
      const misura = umResa ?? (typeof tolti._qty_uom_delta === 'number' ? Math.abs(tolti._qty_uom_delta) : null);
      rientrati = `${colli} Coll.`
        + (misura !== null && r.uom ? ` · ${formattaQuantita(misura, r.uom)} ${r.uom}` : '')
        + (parte > 0 ? ' (una confezione aperta)' : '');
    } catch (e) {
      return this.toast((e as Error).message, 'error');
    }
    /* IL REGISTRO DICE ANCHE QUANTO. Fino alla 2.2 questa riga portava solo
       la nota: il reso risultava «avvenuto» e non «di sei colli», e il numero
       d'ordine non c'era nemmeno. I numeri sono quelli del VANO, che è il lato
       da cui la merce esce — come li scrive ogni altro trasferimento. */
    await this._logMov(MOV.MOVE, r.article_code, '', r.lot_code, vano, dove,
      '', `Reso dal conto di produzione ${this._wipOrdine}`, this._wipOrdine,
      uscita?._qty_before ?? null, uscita?._qty_delta ?? null, uscita?._qty_after ?? null,
      typeof uscita?._qty_uom_delta === 'number' ? uscita._qty_uom_delta : null);
    this.closeModal();
    this._formWip($('pickSubForm'));
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
    this.toast(`↩ ${rientrati} rientrati in ${dove}`, 'success');
  },

  /* 2.1 — LE SCELTE QUANDO RIENTRA UNA CONFEZIONE APERTA.

     Restituisce l'elenco per `removeItem` e le misure che l'hanno composto,
     oppure una STRINGA col motivo: chi chiama la mostra e si ferma. Non
     lancia, perché qui non c'è niente di eccezionale — sono le risposte a
     una domanda, e una risposta che non sta in piedi si dice a chi l'ha
     data.

     IL COLLO CHE SI APRE È IL PIÙ PICCOLO CHE BASTA, come fa il servizio
     quando la misura esatta non c'è: aprire un sacco da 25 per prenderne 7,5
     quando ce n'è uno da 10 lascia in giro due mezzi colli invece di uno. */
  _wipScelteConParte(nelVano, itemKey, interi: number, parte: number, r) {
    const elenco = Store.colliDiRiga(nelVano);
    if (!elenco || !elenco.length) {
      return `${r.article_code}#${r.lot_code} non dichiara i suoi colli, e un `
        + 'rientro parziale va detto su un collo preciso. Rendi i colli interi: '
        + 'la differenza si dichiara alla chiusura.';
    }

    /* Le misure che QUEST'ORDINE ha ancora fuori, non quelle del vano: nel
       vano ci convivono le righe di più ordini. Quando l'ordine non ha le
       misure a conto — le righe scritte prima della 2.0 — si guarda
       l'elenco intero, che è quanto di più onesto si possa fare. */
    const fuori = Store.colliFuoriWip(this._wipOrdine, itemKey);
    const disponibili = fuori.length ? fuori : elenco;

    /* Quali interi e quale si apre lo decide `misureDelReso`, che sta nel
       modulo ed è collaudato da fermo: qui si traducono le misure in scelte
       per il servizio, che è l'unica cosa che pretende Store. */
    const misure = misureDelReso(disponibili, interi, parte);
    if ('errore' in misure) return misure.errore;

    let scelte;
    try {
      scelte = Store.scelteDaColli(nelVano, [...misure.intere, misure.apribile]);
    } catch (e) {
      return (e as Error).message;
    }
    if (!scelte || !scelte.length) {
      return `I colli di ${this._wipOrdine} non si ritrovano più nel vano: un altro terminale ha mosso la riga.`;
    }
    /* IL COLLO APERTO ESCE INTERO DAL VANO, e non per metà: quel che torna
       a magazzino È la confezione aperta, con dentro quel che resta. Il vuoto
       — la differenza fra quanto pesava e quanto ne rientra — è merce finita
       nel prodotto, e la scrive `esceDaWip` come consumo nello stesso gesto.
       Lasciarne mezza nel vano terrebbe aperta una riga per un sacco che sullo
       scaffale c'è già, e alla chiusura l'ordine chiederebbe un collo di più
       di quanti ne abbia. */
    return { scelte, misure };
  },
  /* 2.1 — QUALI COLLI ESCONO DAL VANO WIP, per il reso e per la chiusura.

     Le due strade facevano cose diverse sullo stesso problema: il reso
     chiedeva l'elenco solo se l'ordine aveva le misure a conto, la chiusura
     non chiedeva mai e passava `null`. Su ogni riga entrata in lavorazione
     prima che il conto registrasse le misure — cioè tutte quelle scritte
     fino alla 2.0 — la chiusura finiva a chiedere «togline tre» a
     `removeItem`, che dalla 2.0 rifiuta: **il consumo non si riusciva a
     dichiarare**, e il messaggio parlava di colli senza nominare l'ordine.

     Adesso la regola è una sola e vale per tutte e due: se la riga nel vano
     dichiara i colli e non se ne porta via tutti, si chiede QUALI. Le misure
     dell'ordine, quando ci sono, restringono la scelta a quelle; quando non
     ci sono si sceglie sull'elenco intero del vano — che è quanto di più
     onesto si possa fare, perché la merce è lì e chi ha il bancale davanti
     sa quale sacco ha finito.

     `undefined` = chi sceglieva ha annullato. `null` = non c'era niente da
     scegliere, e si lavora a numero come nella 1.7. */
  async _wipScegliColli(nelVano, itemKey, quanti, titolo) {
    if (!nelVano) return null;
    const elenco = Store.colliDiRiga(nelVano);
    if (!elenco || !elenco.length) return null;
    /* Portarsi via tutto quello che c'è nel vano non è una scelta: lo
       svuotamento totale è la strada che `removeItem` lascia libera anche
       dove i colli sono dichiarati. */
    if (quanti >= elenco.length) return null;
    const fuori = Store.colliFuoriWip(this._wipOrdine, itemKey);
    return this._chiediColli(nelVano, titolo, fuori.length ? fuori : null, { colli: quanti });
  },

  /* 2.1 — IL RENDICONTO DI CONSUMO, SU CARTA.

     Il numero che il foglio dà è un DELTA: quanto è sceso in lavorazione
     meno quanto è risalito. È la domanda che si fa chi chiede «quanto ne è
     andato in quest'ordine», e le tre colonne dell'applicativo — entrato,
     reso, consumato — sono una in più di quante ne servano su carta.

     IL FOGLIO DICE SE È UN CONSUNTIVO O UNA FOTOGRAFIA, e non è una
     cortesia: finché una riga non è chiusa, la sua parte di delta è merce
     ancora sul bancone, e un foglio che la chiama consumo scrive un numero
     che alle sette di sera è sempre sbagliato. Un ordine ancora aperto
     esce con la filigrana «PROVVISORIO», come una bozza di DDT.

     La regola sta in `modules/wip.ts`, pura e collaudata: qui c'è la
     tabella e basta. */
  /* 2.14 — SI RISTAMPA ANCHE DA FUORI. L'archivio degli ordini chiusi sta in
     Archivio, e da lì il rendiconto si chiede per numero senza dover prima
     aprire la maschera del conto. Senza argomento vale l'ordine aperto, che
     è come lo chiamava la 2.1. */
  _wipStampaRendiconto(ordine: string | null = null) {
    const odp = String(ordine ?? this._wipOrdine ?? '').trim().toUpperCase();
    if (!odp) return this.toast('Apri prima un ordine', 'error');
    const r = rendiconto(Store.contoWip(odp));
    if (!r.righe.length) return this.toast(`Nessun movimento sul conto di ${odp}`, 'info');

    const E = (v: unknown) => this._esc(String(v));
    const um = (n: number | null | undefined, u: string | null | undefined) =>
      (typeof n === 'number' && u) ? `${formattaQuantita(n, u)} ${u}` : '—';

    const corpo = r.righe.map((x) => `<tr>
        <td class="mono">${E(x.article_code)}</td>
        <td class="mono">${E(x.lot_code)}</td>
        <td class="td-num">${E(x.consegnato)}</td>
        <td class="td-num">${E(um(x.consegnato_uom, x.uom))}</td>
        <td class="td-num">${E(x.reso)}</td>
        <td class="td-num">${E(um(x.reso_uom, x.uom))}</td>
        <td class="td-num"><b>${E(x.delta)}</b></td>
        <td class="td-num"><b>${E(um(x.delta_uom, x.uom))}</b></td>
        <td>${x.aperto === 0 && (x.aperto_uom ?? 0) === 0
          ? 'dichiarato'
          : `ancora in lavorazione ${E(x.aperto)} coll.`}</td>
      </tr>`).join('');

    /* 2.12 — LA RIPARTIZIONE FRA GLI ORDINI DEL GIRO.
       Un rendiconto che nomina un ordine solo, su una merce scesa per
       cinque, dichiara a nome di uno il consumo di tutti. Le quote sono
       quelle scritte alla chiusura, e la loro somma per riga fa il consumo
       della riga: se non ci sono, questo blocco non c'e' e il foglio resta
       quello di sempre. */
    const perOrdine = Store.consumoWipPerOrdine(odp);
    const giro = Store.ordiniServitiWip(odp);
    const bloccoGiro = perOrdine.length ? `
      <h3 class="pr-h3">Ripartizione fra gli ordini del giro</h3>
      <table class="pr-table">
        <thead><tr><th>Ordine</th><th>Articolo</th><th>Lotto</th><th class="text-center">Consumo</th></tr></thead>
        <tbody>${perOrdine.map((q) => `<tr>
          <td class="mono">${E(q.odp_num)}</td>
          <td class="mono">${E(q.article_code)}</td>
          <td class="mono">${E(q.lot_code)}</td>
          <td class="td-num"><b>${E(um(q.qty, q.uom))}</b></td>
        </tr>`).join('')}</tbody>
      </table>
      <p class="text-body-small">La merce e' scesa dallo scaffale <b>una volta sola</b>, sotto
      l'ordine ${E(odp)}. Le quote qui sopra ripartiscono il consumo dichiarato in proporzione a
      quanto ciascun ordine aveva chiesto: la loro somma, riga per riga, e' il consumo della riga.</p>`
      : (giro.length ? `<p class="text-body-small"><b>🔗 Giro di ${giro.length + 1} ordini</b> —
        ${E([odp, ...giro].join(' · '))}. La ripartizione del consumo fra gli ordini si scrive
        alla chiusura: finche' il conto e' aperto non c'e' consumo da ripartire.</p>` : '');

    const body = `
      <table class="pr-table">
        <thead>
          <tr>
            <th rowspan="2">Articolo</th><th rowspan="2">Lotto</th>
            <th colspan="2" class="text-center">Consegnato in lavorazione</th>
            <th colspan="2" class="text-center">Reso a magazzino</th>
            <th colspan="2" class="text-center">Consumo (delta)</th>
            <th rowspan="2">Stato</th>
          </tr>
          <tr>
            <th class="text-center">Coll.</th><th class="text-center">Quantità</th>
            <th class="text-center">Coll.</th><th class="text-center">Quantità</th>
            <th class="text-center">Coll.</th><th class="text-center">Quantità</th>
          </tr>
        </thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr>
          <td colspan="2"><b>Totali in colli</b></td>
          <td class="td-num"><b>${E(r.consegnato)}</b></td><td></td>
          <td class="td-num"><b>${E(r.reso)}</b></td><td></td>
          <td class="td-num"><b>${E(r.delta)}</b></td><td></td>
          <td></td>
        </tr></tfoot>
      </table>
      <p class="text-body-small">Il consumo è la <b>differenza fra quanto è sceso in lavorazione e
      quanto è risalito a magazzino</b>. Le quantità non si sommano fra articoli: un lotto a
      chili e uno a pezzi non fanno un totale.</p>
      ${r.chiuso
        ? '<p class="text-body-small">Ogni riga di questo ordine è stata dichiarata: il foglio è un <b>consuntivo</b>.</p>'
        : '<p class="text-body-small"><b>⚠ Ordine ancora aperto.</b> Le righe segnate «ancora in lavorazione» portano merce che sta sul bancone: quel delta non è consumo finché non viene dichiarato.</p>'}
      ${bloccoGiro}`;

    this._docPrint(this._docPageHTML({
      kind: 'RENDICONTO DI CONSUMO',
      kindSub: 'Ordine di produzione — consegnato meno reso',
      numLabel: 'Ordine', num: odp,
      dateLabel: 'al', dateVal: this._fmtStamp(Date.now()),
      headExtra: `<div class="doc-idblock doc-idblock--3">
        ${this._docCell('Vano di lavorazione', Store.getAreaWip() || '')}
        ${this._docCell('Righe', String(r.righe.length))}
        ${this._docCell('Stato del conto', r.chiuso ? 'chiuso — consuntivo' : 'aperto — provvisorio')}
        ${giro.length ? this._docCell('Giro — ordini serviti', [odp, ...giro].join(' · '), 'doc-cell--wide') : ''}
      </div>`,
      body,
      docId: `CONS-${odp}`,
      watermark: r.chiuso ? '' : 'PROVVISORIO',
      /* Le righe sono quante sono: il foglio scorre, e testata e piede
         tornano su ogni pagina. Vedi `_docPageHTML`. */
      flow: true,
      signs: [
        { role: 'Operatore magazzino', hint: 'Data e firma' },
        { role: 'Responsabile produzione', hint: 'Data e firma' },
      ],
    }));
  },
  /* 2.1 — DICHIARARE CONSUMATA UNA RIGA, e nient'altro.

     È il gesto che la chiusura fa su tutte le righe, e che adesso si può
     fare su una sola: se in lavorazione è sceso un collo e non rientra, è
     sottinteso che sia finito nel prodotto, e aspettare la chiusura
     dell'ordine per dirlo tiene aperta una riga che nessuno riprenderà.

     Il motore è UNO — questo — e lo chiamano tutte e due le strade: due
     copie della stessa scrittura sono due posti dove aggiungere le UM, e la
     seconda volta se ne aggiunge una sola. Restituisce `null` se è andata,
     o la riga di errore da mostrare.

     Le UM si passano sempre: è il numero che qualcuno cercherà fra sei mesi
     — «quanto ne è finito dentro» — e senza, a registro resta il conto dei
     colli e il peso sparisce. QUALI colli va chiesto: il vano è uno solo e
     le righe di più ordini ci convivono. Vedi `_wipScegliColli`. */
  /* Come si ripartisce fra gli ordini del giro il consumo di UNA riga.
     `null` quando la riga non e' di un giro, o quando non si sa in UM
     quanto sia il consumo: ripartire i COLLI non si puo' — un collo e' di
     uno solo, e le quote no. Vedi `quote` in `modules/giroOdp.ts`. */
  _wipQuoteConsumo(odp: string, r): { odp_num: string; qty: number }[] | null {
    const richieste = Store.richiesteWipDiRiga(odp, r.item_key);
    if (richieste.length < 2) return null;
    if (typeof r.residuo_uom !== 'number') return null;
    return quoteGiro(richieste, r.residuo_uom, r.uom ?? null);
  },

  async _wipDichiaraConsumata(odp: string, r): Promise<string | null> {
    const vano = Store.getAreaWip();
    try {
      const nelVano = Store.getItemsAtLocation(vano).find((x) => x.item_key === r.item_key);
      const scelte = await this._wipScegliColli(nelVano, r.item_key, r.residuo,
        `Quali colli ha consumato ${odp} · ${r.article_code}#${r.lot_code}`);
      if (scelte === undefined) return `${r.article_code}#${r.lot_code}: scelta dei colli annullata`;
      /* 2.12 — LA QUOTA PER ORDINE SI DICHIARA QUI, e non prima.

         Quando la riga e' scesa in un giro, `giro_richieste` dice quanto ne
         aveva chiesto ciascun ordine: e' un fatto del file di produzione,
         scritto nel momento in cui la merce e' uscita dallo scaffale. Il
         consumo si ripartisce in quella proporzione — e la somma delle quote
         fa ESATTAMENTE il consumo, perche' l'ultima assorbe il resto
         dell'arrotondamento.

         Prima della chiusura questa quota non esisteva: il residuo di un
         ordine aperto e' merce sul bancone, e ripartirla sarebbe stato
         scrivere una previsione come un fatto. */
      const quoteConsumo = this._wipQuoteConsumo(odp, r);
      await Store.esceDaWip(odp, {
        item_key: r.item_key, article_code: r.article_code, lot_code: r.lot_code,
        qty: r.residuo, qty_uom: r.residuo_uom, uom: r.uom,
        giro_richieste: quoteConsumo,
      }, scelte, 'consumo');
      await this._logMov(MOV.PICK, r.article_code, '', r.lot_code, vano, null,
        '', `Consumo di produzione — ordine ${odp}`
          + (quoteConsumo ? ` · ripartito: ${quoteConsumo.map((q: { odp_num: string; qty: number }) => `${q.odp_num} ${formattaQuantita(q.qty, r.uom)}${r.uom ? ' ' + r.uom : ''}`).join(', ')}` : ''),
        odp, r.residuo, -r.residuo, 0,
        typeof r.residuo_uom === 'number' ? -r.residuo_uom : null);
      return null;
    } catch (e) {
      return `${r.article_code}#${r.lot_code}: ${(e as Error).message}`;
    }
  },

  /* «CONSUMATO DEL TUTTO» SU UNA RIGA SOLA. Non chiude l'ordine: chiude
     quella riga, e il conto resta aperto per le altre. La conferma dice
     quanto si sta dichiarando, perché da qui in poi quella merce non torna
     più a magazzino — è la stessa cosa che dice la chiusura, su una riga. */
  async _wipConsumaTutto(itemKey) {
    if (!this._requireOperator('la dichiarazione di consumo')) return;
    const odp = this._wipOrdine;
    const c = Store.contoWip(odp);
    const r = c.righe.find((x) => x.item_key === itemKey);
    if (!r) return this.toast('Riga non trovata sul conto', 'error');
    if (r.residuo <= 0) return this.toast('Su questa riga non resta niente in lavorazione', 'info');

    const quanto = `${r.residuo} Coll.`
      + (typeof r.residuo_uom === 'number' && r.uom ? ` · ${formattaQuantita(r.residuo_uom, r.uom)} ${r.uom}` : '');
    if (!await Dialog.confirm({
      title: 'Consumata del tutto?',
      message: `${r.article_code}#${r.lot_code}: ${quanto} vengono dichiarati CONSUMATI dall'ordine ${odp}. `
        + 'Escono dal vano di lavorazione e non tornano più a magazzino.',
      confirmLabel: 'Dichiara consumato', danger: true,
    })) return;

    const errore = await this._wipDichiaraConsumata(odp, r);
    this._formWip($('pickSubForm'));
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
    if (errore) return this.toast(`Consumo non dichiarato — ${errore}`, 'error');
    this.toast(`🔥 ${r.article_code}#${r.lot_code}: ${quanto} a consumo di ${odp}`, 'success');
  },
  /* LA CHIUSURA È IL MOMENTO IN CUI IL RESIDUO DIVENTA CONSUMO, ed è
     l'unica cosa che questa maschera fa e che non si può disfare leggendo:
     da qui in poi quei colli sono finiti nel prodotto. Per questo la
     conferma elenca riga per riga cosa si sta dichiarando consumato.

     2.1 — E CHIUDERE ARCHIVIA. Un ordine a residuo zero — tutto rientrato —
     non aveva niente da dichiarare e quindi non si chiudeva affatto:
     spariva dall'elenco degli aperti, che filtra sul residuo, e restava
     un ordine vivo che il file di produzione poteva ricaricare. È la
     riesumazione che Andrea ha visto il 20/08. Adesso si chiude anche
     quando non c'è niente da consumare: il gesto scrive l'archiviazione. */
  async _wipChiudi() {
    if (!this._requireOperator('la chiusura del conto di produzione')) return;
    const odp = this._wipOrdine;
    if (Store.ordineWipArchiviato(odp)) return this.toast(`L'ordine ${odp} è già archiviato`, 'info');
    const c = Store.contoWip(odp);
    if (!c.righe.length) return this.toast(`Nessun movimento sul conto di ${odp}`, 'info');
    const k = consumoWip(c, true) || [];

    /* 2.12 — SE IL CONTO E' DI UN GIRO, LA CONFERMA LO DICE E MOSTRA LE QUOTE.

       Il testo diceva «viene dichiarato CONSUMATO dall'ordine ODP-1» anche
       quando quel conto ne serviva altri quattro: su venticinque chili, venti
       erano di ordini che la finestra non nominava. Ed e' QUESTA la finestra
       che conta — la ripartizione la si scopriva dopo, sul rendiconto, cioe'
       dopo aver dichiarato. Chi dichiara deve vedere per chi sta dichiarando
       PRIMA di premere, non dopo. */
    const serviti = Store.ordiniServitiWip(odp);
    const quotePerRiga = k.map((r) => [r, this._wipQuoteConsumo(odp, r)]);
    const conQuote = quotePerRiga.filter(([, q]) => q && q.length > 1);
    /* Le righe di un giro che una quota non ce l'hanno: senza UM non si puo'
       ripartire — un collo e' di uno solo, e le quote no. Va detto, perche'
       su quelle righe il consumo resta tutto intestato al capofila. */
    const senzaQuote = serviti.length ? quotePerRiga.filter(([, q]) => !q || q.length < 2) : [];

    const dettaglio: [string, unknown][] = [];
    for (const [r, q] of quotePerRiga) {
      const quanto = `${r.residuo} Coll.${typeof r.residuo_uom === 'number' && r.uom ? ` · ${formattaQuantita(r.residuo_uom, r.uom)} ${r.uom}` : ''}`;
      dettaglio.push([`${r.article_code}#${r.lot_code}`, quanto]);
      if (q && q.length > 1) {
        for (const x of q) {
          dettaglio.push([`  ↳ ${x.odp_num}`, `${formattaQuantita(x.qty, r.uom)}${r.uom ? ' ' + r.uom : ''}`]);
        }
      } else if (serviti.length) {
        dettaglio.push(['  ↳ non ripartibile', 'senza UM il consumo resta tutto sul capofila']);
      }
    }

    if (!await Dialog.confirm({
      title: k.length ? 'Chiudere e archiviare il conto?' : "Archiviare l'ordine?",
      message: (k.length
        ? (serviti.length
          ? `Questo conto serve ${serviti.length + 1} ordini — ${[odp, ...serviti].join(', ')}. `
            + `Quello che è entrato e non è tornato viene dichiarato CONSUMATO e RIPARTITO fra loro, `
            + `in proporzione a quanto ciascuno aveva chiesto${conQuote.length ? ' (le quote sono qui sotto)' : ''}: `
            + `esce dal vano di lavorazione e non torna più a magazzino. `
            + `Da qui in poi la ripartizione è scritta e non si corregge. `
          : `Quello che è entrato e non è tornato viene dichiarato CONSUMATO dall'ordine ${odp}: esce dal vano di lavorazione e non torna più a magazzino. `)
        : `Sul conto di ${odp} non resta niente in lavorazione: tutto è già rientrato o è già stato dichiarato. `)
        + `L'ordine ${serviti.length ? 'capofila ' : ''}viene ARCHIVIATO: non entrerà più merce nel suo conto e non ne uscirà, `
        + 'nemmeno ricaricando lo stesso ordine dal file di produzione. Il rendiconto resta stampabile.'
        + (senzaQuote.length ? `

⚠ ${senzaQuote.length} rig${senzaQuote.length === 1 ? 'a non è' : 'he non sono'} ripartibil${senzaQuote.length === 1 ? 'e' : 'i'}: senza unità di misura il consumo resta intestato tutto a ${odp}.` : ''),
      details: dettaglio.length ? Dialog.kv(dettaglio) : undefined,
      confirmLabel: k.length
        ? (serviti.length ? 'Dichiara, ripartisci e archivia' : 'Dichiara consumato e archivia')
        : "Archivia l'ordine",
      danger: true,
    })) return;

    const falliti = [];
    for (const r of k) {
      const errore = await this._wipDichiaraConsumata(odp, r);
      if (errore) falliti.push(errore);
    }

    /* 2.1 — L'ORDINE CHIUSO SI ARCHIVIA, e la chiusura è un movimento
       scritto: da qui in poi non entra merce e non ne esce, nemmeno
       ricaricando lo stesso ordine dal file. Vedi `archiviato`.

       SI ARCHIVIA SOLO SE È ANDATA TUTTA. Una chiusura a metà lascia merce
       nel vano, e murare l'ordine sopra quella merce vorrebbe dire non
       poterla più né rendere né dichiarare: resta aperto, e il messaggio
       dice cosa è mancato. */
    if (!falliti.length) {
      try {
        await Store.archiviaOrdineWip(odp);
      } catch (e) {
        falliti.push(`archiviazione: ${(e as Error).message}`);
      }
    }

    this._formWip($('pickSubForm'));
    this.updateSyncIndicator();
    this._refreshSessionLog?.();
    if (falliti.length) return this.toast(`Chiusura incompleta — ${falliti[0]}`, 'error');
    this.toast(`🏁 Ordine ${odp} chiuso e archiviato: ${k.length} rig${k.length === 1 ? 'a consumata' : 'he consumate'}`, 'success');
  },
} satisfies Vista;
