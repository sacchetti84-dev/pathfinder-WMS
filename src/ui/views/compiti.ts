import { type Vista, $ } from './vista';
import { caricaExcel } from '../../modules/excel';
import { Store } from '../../core/store';
import type { Compito } from '../../types/entita';
import { Dialog } from '../dialog';
import type { RigaRegistro } from '../../modules/compiti';
import { componi, alClic, segno, STATO_VUOTO } from '../../modules/tabella';
import type { Colonna, Stato } from '../../modules/tabella';
import {
  TIPI_COMPITO, PRIORITA_NORMALE, PRIORITA_MAX_OPERATORE,
  etichettaTipo, iconaTipo, etichettaPriorita, etichettaStato,
  eAperto, misure, inRitardo, durataUmana,
  operazioneDi, vuoleColli, vuoleUbicazione, vuoleDestinazione, vuoleArticolo,
  quantitaRichiesta, quantitaFatta, residuo, tipiRichiedibili,
} from '../../modules/compiti';

/* IL `payload` DI UN COMPITO, come lo legge e lo scrive questa maschera.

   `Compito.payload` è `unknown` nel tipo condiviso, e con ragione: ogni
   genere di compito porta campi suoi. Qui si dichiara l'unione di quelli
   che le otto maschere usano davvero — tutti facoltativi, perché un
   trasferimento non ha `sample_for` e un campionamento non ha `to`. */
type PayloadCompito = {
  /* 2.32 — la distinta allegata a un prelievo ODP: il servizio la tiene, e
     qui resta il solo identificativo. Il nome originale si conserva accanto
     perche' chi apre l'attivita' fra tre giorni deve poter dire QUALE file
     era, e un nome esadecimale non lo dice a nessuno. */
  allegato?: string;
  allegato_nome?: string;
  article_code?: string;
  lot_code?: string;
  location_code?: string;
  from?: string;
  to?: string;
  qty?: number;
  /** 1.10 — la quantita' con la sua unita': un ordine di produzione
      chiede chili, e «44,42 coll.» sarebbe un altro numero. */
  qty_uom?: number;
  uom?: string;
  causale?: string;
  carrier?: string;
  destination?: string;
  sample_for?: string;
  sample_spare?: number;
  auto?: boolean;
};

export const VistaCompiti = {
  /* ═══ ATTIVITA' — 1.4.1 ════════════════════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l.

     Nessuna delle otto attivita' nasce qui: il magazzino le fa gia' tutte.
     Qui nascono la RICHIESTA, la CODA e la MISURA — le tre cose che oggi
     vivono a voce, e che a voce non si contano.

     La regola sta in `modules/compiti.ts`, che e' puro e collaudato; questa
     e' la sua faccia, e non decide niente per conto suo. */

  _taskAmbito: 'aperte',        // 'aperte' | 'mie' | 'tutte'
  _taskTipo: '',

  renderTasks() {
    const el = $('viewTasks');
    if (!el) return;
    const io = Store.getCurrentIdentity();
    const r = Store.getTasksSummary();
    const coda = Store.getTaskQueue();
    /* 1.4.2.1 — il terzo ambito e' il REGISTRO: tutte le attivita' mai
       aperte, dalla piu' recente, coi tempi e con che cosa sono state
       chiuse. E' la memoria dello schedulatore, e l'unico posto da cui
       esce un foglio Excel. */
    /* 2.1 — nel registro entrano anche i campionamenti fatti aprendo la
       funzione a mano, che un compito dietro non ce l'hanno mai avuto:
       `Store.registroAttivita` unisce le due sorgenti e ordina. */
    const elenco = this._taskAmbito === 'registro'
      ? Store.registroAttivita()
      : this._taskAmbito === 'mie'
        ? coda.filter(t => t.assigned_to === io.initials)
        : coda;
    const righe = this._taskTipo ? elenco.filter(t => t.type === this._taskTipo) : elenco;

    const opzioniTipo = Object.entries(TIPI_COMPITO).map(([k, v]) =>
      `<option value="${k}" ${this._taskTipo === k ? 'selected' : ''}>${this._esc(v.label)}</option>`).join('');

    el.innerHTML = `
      <div class="flex justify-between items-center mb-10 flex-wrap gap-5">
        <div>
          <h1 class="dash-h1">${this._ico('clipboard-text')} Attività</h1>
          <p class="dash-sub">Cosa c'è da fare, in che ordine, e da quanto aspetta</p>
        </div>
        <button class="btn btn-primary" onclick="App.showNewTaskModal()">+ Nuova attività</button>
      </div>

      ${this._renderTaskKpi(r)}

      <div class="card mb-8">
        <div class="flex gap-5 items-center flex-wrap">
          <div class="config-tabs m-0">
            ${['aperte', 'mie', 'registro'].map(a => `<button class="config-tab ${this._taskAmbito === a ? 'active' : ''}"
              onclick="App._taskAmbito='${a}';App.renderTasks()">${a === 'aperte' ? 'In coda' : a === 'mie' ? `Le mie${io.initials ? ' (' + this._esc(io.initials) + ')' : ''}` : `${this._ico('books')} Registro`}</button>`).join('')}
          </div>
          <select class="select max-w-[230px]" onchange="App._taskTipo=this.value;App.renderTasks()">
            <option value="">Tutti i tipi</option>${opzioniTipo}
          </select>
          <span class="text-body-small text-sx-text-muted">${righe.length} attività</span>
          ${this._taskAmbito === 'registro' ? `<button class="btn btn-sm ml-auto" onclick="App.exportTasksExcel()">${this._ico('chart-bar')} Esporta Excel</button>` : ''}
        </div>
      </div>

      ${righe.length
        ? (this._taskAmbito === 'registro' ? this._renderTaskRegistro(righe) : this._renderTaskTable(righe, io))
        : `<div class="empty-state"><div class="empty-icon">${this._ico('check')}</div>
        <p>${this._taskAmbito === 'mie' ? 'Non hai attività in carico.' : this._taskAmbito === 'registro' ? 'Non è stata ancora aperta nessuna attività.' : 'Nessuna attività in coda.'}</p></div>`}`;
  },

  /* Le due misure che il piano chiede — quanto sta in coda, quanto dura —
     piu' le due che dicono se la coda si sta ingrossando: gli urgenti e i
     ritardi. «Il piu' vecchio» sta qui e non in fondo perche' e' la riga
     che avvisa che lo schedulatore sta diventando una lista che invecchia. */
  _renderTaskKpi(r) {
    const vecchio = r.piuVecchio;
    return `<div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Attività aperte</div>
        <div class="kpi-value">${r.aperti}</div>
        <div class="kpi-sub">${r.perStato.requested} in coda · ${r.perStato.assigned} assegnate · ${r.perStato.in_progress} in corso</div>
      </div>
      <div class="kpi-card ${r.urgenti ? 'k-danger' : ''}">
        <div class="kpi-label">Urgenti aperte</div>
        <div class="kpi-value">${r.urgenti}</div>
        <div class="kpi-sub">${r.inRitardo} oltre la scadenza</div>
      </div>
      <div class="kpi-card k-warning">
        <div class="kpi-label">Attesa media in coda</div>
        <div class="kpi-value text-title-large">${durataUmana(r.attesaMedia)}</div>
        <div class="kpi-sub">${r.conclusi ? `su ${r.conclusi} attività conclus${r.conclusi === 1 ? 'a' : 'e'}` : 'nessuna attività conclusa finora'}</div>
      </div>
      <div class="kpi-card k-success">
        <div class="kpi-label">Durata media</div>
        <div class="kpi-value text-title-large">${durataUmana(r.durataMedia)}</div>
        <div class="kpi-sub">dalla presa in carico alla chiusura</div>
      </div>
      ${vecchio ? `<div class="kpi-card k-purple">
        <div class="kpi-label">In coda da più tempo</div>
        <div class="kpi-value text-title-large">${durataUmana(r.attesaMassima)}</div>
        <div class="kpi-sub">${this._ico(iconaTipo(vecchio.type))} ${this._esc(etichettaTipo(vecchio.type))} · ${this._esc(vecchio.requested_by)}</div>
      </div>` : ''}
    </div>`;
  },

  _renderTaskTable(righe, io) {
    const leader = io.role === 'leader';
    const corpo = (righe as Compito[]).map((t) => {
      const m = misure(t);
      const tardi = inRitardo(t);
      const aperto = eAperto(t);
      const azioni = [];
      if (aperto) {
        if (t.status === 'requested') azioni.push(`<button class="btn btn-sm btn-accent" onclick="App.doTakeTask('${t.task_id}')">Prendo io</button>`);
        /* 1.4.2.1 — «Avvia» apre l'operazione, e resta disponibile anche su
           un compito gia' in corso: e' come si riprende un parziale, o come
           lo riapre chi ha ricaricato la pagina. */
        azioni.push(`<button class="btn btn-sm" onclick="App.doStartTask('${t.task_id}')">${t.status === 'in_progress' ? '▶ Riprendi' : '▶ Avvia'}</button>`);
        /* «Fatta» a mano sopravvive per la sola Conta: le altre sette si
           chiudono perche' un movimento e' stato confermato — decisione 43. */
        /* 1.4.4 — «✓ Fatta» non c'è più: sopravviveva per la sola Conta, che
           adesso si chiude confermando il conteggio. Ogni attività si chiude
           portando a termine la sua operazione, e Store lo impone. */
        azioni.push(`<button class="btn btn-sm btn-ghost text-sx-danger" onclick="App.doCancelTask('${t.task_id}')" title="Annulla, con motivo">${this._ico('x')}</button>`);
      }
      const prio = aperto && leader
        ? `<select class="select w-[104px] py-1.5 px-3" onchange="App.doSetTaskPriority('${t.task_id}',this.value)">
             ${[4, 3, 2, 1].map(p => `<option value="${p}" ${t.priority === p ? 'selected' : ''}>${etichettaPriorita(p)}</option>`).join('')}
           </select>`
        : `<span class="badge ${this._taskPrioClasse(t.priority)}">${etichettaPriorita(t.priority)}</span>`;
      return `<tr class="bg-sx-danger-soft"${tardi ? '' : ''}>
        <td>${prio}</td>
        <td class="whitespace-nowrap"><span title="${this._esc(etichettaTipo(t.type))}">${this._ico(iconaTipo(t.type), etichettaTipo(t.type))}</span> ${this._esc(etichettaTipo(t.type))}</td>
        <td class="min-w-[240px]">${this._renderTaskPayload(t)}</td>
        <td><span class="badge ${this._taskStatoClasse(t.status)}">${this._esc(etichettaStato(t.status))}</span></td>
        <td class="mono">${this._esc(t.assigned_to || '—')}</td>
        <td class="mono whitespace-nowrap">${this._esc(t.requested_by)}<br>
            <span class="text-label-small text-sx-text-muted">${new Date(t.requested_at).toLocaleString('it-IT')}</span></td>
        <td class="whitespace-nowrap">${t.due_at
            ? `${tardi ? '⏰ ' : ''}${new Date(t.due_at).toLocaleString('it-IT')}`
            : '<span class="text-sx-text-muted">—</span>'}</td>
        <td class="whitespace-nowrap text-body-small">
            coda ${durataUmana(m.attesa)}${m.durata !== null ? `<br>lavoro ${durataUmana(m.durata)}` : ''}</td>
        <td class="min-w-[190px]"><div class="flex gap-2.5 flex-wrap">${azioni.join('')}</div></td>
      </tr>`;
    }).join('');

    /* La colonna «Cosa» e' l'unica che deve poter respirare: le altre sono
       larghezze fisse, e senza un minimo qui il payload esce una parola per
       riga. La tabella scorre in orizzontale invece di comprimersi. */
    return `<div class="card overflow-x-auto">
      <table class="sx-table min-w-[1080px]">
        <thead><tr>
          <th class="w-[110px]">Priorità</th><th>Tipo</th><th>Cosa</th><th class="w-[110px]">Stato</th>
          <th class="w-[70px]">In carico</th><th class="w-[130px]">Richiesta</th>
          <th class="w-[130px]">Scadenza</th><th class="w-[110px]">Tempi</th><th class="w-[200px]">Azioni</th>
        </tr></thead>
        <tbody>${corpo}</tbody>
      </table>
    </div>`;
  },

  /* ═══ IL REGISTRO DELLE ATTIVITÀ — 1.4.2.1 ══════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l.

     Tutte le attività mai aperte, coi tempi e con che cosa sono state
     chiuse. Non è la coda con un filtro in più: la coda dice cosa c'è da
     fare, questo dice cosa è stato fatto — e sono le due domande di due
     persone diverse. Le misure escono da `misure()`, le stesse del cruscotto:
     tre formattazioni dello stesso numero, per chi legge, sono tre numeri. */

  _tsBreve(ms) {
    return ms ? new Date(ms).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  },

  /* 2.1 — §3: il registro delle attività si ordina e si cerca.

     È la tabella più larga dell'applicativo — tredici colonne — e fino
     alla 2.0 usciva solo in ordine di richiesta. «Chi ha chiuso meno
     compiti», «quali sono rimasti in coda più a lungo», «tutto quello che
     ha toccato quel lotto» erano tre domande a cui si rispondeva
     esportando in Excel e ordinando lì. */
  _regOrdine: STATO_VUOTO,

  _regColonne(): Colonna<RigaRegistro>[] {
    return [
      { campo: 'task_id', titolo: 'Attività' },
      { campo: 'type', titolo: 'Tipo', valore: (t) => etichettaTipo(t.type) },
      { campo: 'cosa', titolo: 'Cosa', valore: (t) => {
        const p = ((t.payload && typeof t.payload === 'object') ? t.payload : {}) as PayloadCompito;
        return [p.article_code, p.lot_code, p.from, p.to].filter(Boolean).join(' ');
      } },
      { campo: 'status', titolo: 'Stato', valore: (t) => etichettaStato(t.status) },
      { campo: 'fatti', titolo: 'Colli', tipo: 'numero', valore: (t) => quantitaFatta(t) },
      { campo: 'requested_by', titolo: 'Chiesta da' },
      { campo: 'assigned_to', titolo: 'Svolta da' },
      { campo: 'requested_at', titolo: 'Richiesta', tipo: 'numero' },
      { campo: 'started_at', titolo: 'Avvio', tipo: 'numero' },
      { campo: 'completed_at', titolo: 'Chiusura', tipo: 'numero' },
      { campo: 'attesa', titolo: 'In coda', tipo: 'numero', valore: (t) => misure(t).attesa, cercabile: false },
      { campo: 'durata', titolo: 'Lavoro', tipo: 'numero', valore: (t) => misure(t).durata, cercabile: false },
    ];
  },

  _regOrdina(campo) {
    this._regOrdine = alClic(this._regOrdine, campo);
    this.renderTasks();
  },

  _regCerca(testo) {
    this._regOrdine = { ...this._regOrdine, cerca: String(testo || '') };
    this.renderTasks();
  },

  _renderTaskRegistro(tutte) {
    const finestra = Store.getMovLogWindowInfo();
    const colonne = this._regColonne();
    const righe = componi(tutte, colonne, this._regOrdine as Stato);
    const thReg = (campo: string, titolo: string, classe = '') =>
      `<th class="sx-th-ord ${classe}" onclick="App._regOrdina('${campo}')" title="Ordina per ${titolo}">${titolo}${segno(this._regOrdine as Stato, campo)}</th>`;
    const corpo = (righe as RigaRegistro[]).map((t) => {
      const daMovimento = t.origine === 'movimento';
      const m = misure(t);
      const chiesto = quantitaRichiesta(t);
      const fatti = quantitaFatta(t);
      const movs = t.mov_ids?.length || 0;
      const esito = t.status === 'cancelled'
        ? `<span class="text-sx-danger">${this._esc(t.cancel_reason || 'annullata')}</span>`
        : t.status === 'done'
          ? `${movs ? `${movs} moviment${movs === 1 ? 'o' : 'i'}` : '<span class="text-sx-text-muted">chiusa a mano</span>'}`
          : '<span class="text-sx-text-muted">—</span>';
      return `<tr>
        <td class="mono whitespace-nowrap text-label-small">${this._esc(t.task_id)}</td>
        <td class="whitespace-nowrap">${this._ico(iconaTipo(t.type))} ${this._esc(etichettaTipo(t.type))}
          ${daMovimento ? '<span class="badge badge-muted" title="Eseguito aprendo la funzione, senza passare dalla coda">fuori coda</span>' : ''}</td>
        <td class="min-w-[220px]">${this._renderTaskPayload(t)}</td>
        <td><span class="badge ${this._taskStatoClasse(t.status)}">${this._esc(etichettaStato(t.status))}</span></td>
        <td class="whitespace-nowrap">${chiesto === null ? '—' : `${fatti}/${chiesto}`}</td>
        <td class="mono">${this._esc(t.requested_by)}</td>
        <td class="mono">${this._esc(t.assigned_to || '—')}</td>
        <td class="whitespace-nowrap text-label-small">${this._tsBreve(t.requested_at)}</td>
        <td class="whitespace-nowrap text-label-small">${this._tsBreve(t.started_at)}</td>
        <td class="whitespace-nowrap text-label-small">${this._tsBreve(t.completed_at)}</td>
        <td class="whitespace-nowrap text-body-small">${durataUmana(m.attesa)}</td>
        <td class="whitespace-nowrap text-body-small">${durataUmana(m.durata)}</td>
        <td class="text-body-small">${esito}</td>
      </tr>`;
    }).join('');
    return `<div class="form-group mb-4">
      <input class="input" id="regCerca" placeholder="Cerca attività, articolo, lotto, ubicazione, sigla…"
        value="${this._esc(this._regOrdine.cerca)}" oninput="App._regCerca(this.value)">
      <div class="text-label-small text-sx-text-muted mt-2">
        ${righe.length} su ${tutte.length} attività
      </div>
    </div>
    <p class="text-body-small text-sx-text-secondary mb-4">
      I gesti <strong>fuori coda</strong> — oggi i campionamenti aperti a mano — si leggono dal registro generale
      degli ultimi <strong>${finestra.days || '\u221e'}</strong> giorni, che è la finestra tenuta in memoria.
      I compiti dello schedulatore ci sono tutti, sempre.
    </p>
    <div class="card overflow-x-auto">
      <table class="sx-table min-w-[1280px]">
        <thead><tr>
          ${thReg('task_id', 'Attività', 'w-[120px]')}${thReg('type', 'Tipo')}${thReg('cosa', 'Cosa')}${thReg('status', 'Stato', 'w-[100px]')}
          ${thReg('fatti', 'Colli', 'w-[70px]')}${thReg('requested_by', 'Chiesta da', 'w-[70px]')}${thReg('assigned_to', 'Svolta da', 'w-[70px]')}
          ${thReg('requested_at', 'Richiesta', 'w-[110px]')}${thReg('started_at', 'Avvio', 'w-[110px]')}${thReg('completed_at', 'Chiusura', 'w-[110px]')}
          ${thReg('attesa', 'In coda', 'w-[90px]')}${thReg('durata', 'Lavoro', 'w-[90px]')}<th class="w-[150px]">Chiusa con</th>
        </tr></thead>
        <tbody>${corpo}</tbody>
      </table>
    </div>`;
  },

  /* Il foglio esce con quello che serve a rispondere alle domande di fine
     mese — quante ne sono state aperte, da chi, quanto sono state ferme —
     e con le durate in DUE forme: in chiaro per chi legge, in minuti per
     chi ci fa una tabella pivot. */
  async exportTasksExcel() {
    /* 2.1 — il foglio esce con quello che si vede a video, campionamenti
       fuori coda compresi: un export che dice meno della tabella da cui
       parte è il modo di scoprire a fine mese che i conti non tornano. */
    const tutte = Store.registroAttivita();
    if (!tutte.length) return this.toast('Nessuna attività da esportare', 'error');
    const XLSX = await caricaExcel();
    const min = (ms: number | null | undefined) => (ms === null || ms === undefined) ? '' : Math.round(ms / 60000);
    const dt = (ms: number | null | undefined) => ms ? new Date(ms).toLocaleString('it-IT') : '';

    /* 2.0 — LA QUANTITÀ CHIESTA HA UN'UNITÀ, e non è sempre il collo: un
       ordine di produzione chiede chili, e «44,42 coll.» sarebbe un altro
       numero. Il fatto sta nel payload dalla 1.10 e finora non usciva di qui.
       Il FATTO in UM non c'è: `qty_done` conta colli, e un residuo in UM che
       nessuno ha scritto non si inventa in un export. */
    const headers = ['Attività', 'Tipo', 'Priorità', 'Stato', 'Articolo', 'Lotto', 'Da', 'A',
      'Colli chiesti', 'Colli fatti', 'Residuo', 'UM chieste', 'UM', 'Chiesta da', 'Svolta da', 'Chiusa da',
      'Richiesta', 'Avvio', 'Chiusura', 'Scadenza',
      'In coda', 'In coda (min)', 'Lavoro', 'Lavoro (min)', 'Totale (min)',
      'N° movimenti', 'Movimenti', 'Note', 'Motivo annullamento', 'Origine'];
    const rows = tutte.map(t => {
      const p = ((t.payload && typeof t.payload === 'object') ? t.payload : {}) as PayloadCompito;
      const m = misure(t);
      const chiesto = quantitaRichiesta(t);
      return [
        t.task_id, etichettaTipo(t.type), etichettaPriorita(t.priority), etichettaStato(t.status),
        p.article_code || '', p.lot_code || '', p.from || '', p.to || '',
        chiesto ?? '', quantitaFatta(t), chiesto === null ? '' : (residuo(t) ?? ''),
        typeof p.qty_uom === 'number' ? p.qty_uom : '',
        typeof p.qty_uom === 'number' ? (p.uom || '') : '',
        t.requested_by || '', t.assigned_to || '', t.completed_by || '',
        dt(t.requested_at), dt(t.started_at), dt(t.completed_at), dt(t.due_at),
        durataUmana(m.attesa), min(m.attesa), durataUmana(m.durata), min(m.durata), min(m.totale),
        t.mov_ids?.length || 0, (t.mov_ids || []).join(' '),
        t.note || '', t.cancel_reason || '',
        t.origine === 'movimento' ? 'fuori coda' : 'schedulatore',
      ];
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{wch:18},{wch:16},{wch:10},{wch:12},{wch:18},{wch:14},{wch:16},{wch:16},
      {wch:12},{wch:11},{wch:9},{wch:12},{wch:7},{wch:11},{wch:11},{wch:11},
      {wch:18},{wch:18},{wch:18},{wch:18},
      {wch:12},{wch:12},{wch:12},{wch:12},{wch:12},
      {wch:12},{wch:22},{wch:30},{wch:30}];
    XLSX.utils.book_append_sheet(wb, ws, 'Registro attività');

    /* Foglio 2 — le due misure per tipo. È la riga che dice se un tipo di
       attività sta in coda troppo a lungo, e senza la quale il registro è
       un elenco invece di una misura. */
    /* Per ogni genere di attività: quante sono, come sono finite, e quanto
       hanno aspettato. */
    type MisureTipo = { tot: number; aperte: number; fatte: number; annullate: number;
                        attesa: number; durata: number; conclusi: number };
    const perTipo: Record<string, MisureTipo> = {};
    for (const t of tutte) {
      const k = etichettaTipo(t.type);
      if (!perTipo[k]) perTipo[k] = { tot: 0, aperte: 0, fatte: 0, annullate: 0, attesa: 0, durata: 0, conclusi: 0 };
      const v = perTipo[k]!;
      v.tot++;
      if (eAperto(t)) v.aperte++;
      else if (t.status === 'cancelled') v.annullate++;
      else {
        v.fatte++;
        const m = misure(t);
        if (m.attesa !== null && m.durata !== null) { v.attesa += m.attesa; v.durata += m.durata; v.conclusi++; }
      }
    }
    const sum: (string | number)[][] = [['Tipo', 'Totale', 'Aperte', 'Completate', 'Annullate', 'Attesa media (min)', 'Durata media (min)']];
    for (const [k, v] of Object.entries(perTipo).sort((a, b) => b[1].tot - a[1].tot)) {
      sum.push([k, v.tot, v.aperte, v.fatte, v.annullate,
        v.conclusi ? Math.round(v.attesa / v.conclusi / 60000) : '',
        v.conclusi ? Math.round(v.durata / v.conclusi / 60000) : '']);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(sum);
    ws2['!cols'] = [{wch:22},{wch:10},{wch:10},{wch:12},{wch:11},{wch:20},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo Tipo');

    const fn = `registro-attivita-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fn);
    this.toast(`Esportato: ${fn} (${tutte.length} attività, 2 fogli)`, 'success');
  },

  _taskPrioClasse(p) { return p >= 4 ? 'badge-red' : p === 3 ? 'badge-amber' : p === 1 ? 'badge-muted' : 'badge-blue'; },
  _taskStatoClasse(s) {
    return s === 'in_progress' ? 'badge-amber' : s === 'done' ? 'badge-green'
         : s === 'cancelled' ? 'badge-muted' : s === 'assigned' ? 'badge-teal' : 'badge-blue';
  },

  /* Il payload non ha uno schema, e non deve averlo: e' quello che rende
     utile lo stesso compito a otto attivita' diverse. Qui si mostrano i
     campi che si riconoscono, e il resto si legge nella nota. */
  _renderTaskPayload(t) {
    const p = ((t.payload && typeof t.payload === 'object') ? t.payload : {}) as PayloadCompito;
    const pezzi = [];
    if (p.article_code) pezzi.push(`<span class="mono">${this._esc(p.article_code)}</span>`);
    if (p.lot_code) pezzi.push(`lotto <span class="mono">${this._esc(p.lot_code)}</span>`);
    /* 1.4.2.1 — il richiesto e il fatto sulla stessa riga: «5/12 coll.» dice
       da solo che il compito e' a meta', e quanto ne resta. */
    if (p.qty) {
      const fatti = quantitaFatta(t);
      pezzi.push(fatti ? `<strong>${fatti}/${this._esc(String(p.qty))}</strong> coll.` : `${this._esc(String(p.qty))} coll.`);
    }
    /* 1.10 — la quantità che porta la sua unità si scrive con quella, e non
       con «coll.»: sono due numeri diversi, e uno dei due sarebbe falso. */
    if (typeof p.qty_uom === 'number' && p.uom) {
      pezzi.push(`<strong>${this._esc(String(p.qty_uom))}</strong> ${this._esc(p.uom)}`);
    }
    if (p.from) pezzi.push(`da <span class="mono">${this._esc(p.from)}</span>`);
    if (p.to) pezzi.push(`a <span class="mono">${this._esc(p.to)}</span>`);
    if (p.sample_for) pezzi.push(`campione per <strong>${this._esc(p.sample_for)}</strong>${p.sample_spare ? ' · riserva a magazzino' : ''}`);
    /* 1.5 — la pulizia dice DOVE e DOPO COSA. Il «dopo cosa» è
       `source_ref`, ed è il dato che la GMP domanda: senza, la riga dice
       che si è pulito e non che si è pulito dopo un campionamento. */
    if (t.type === 'CLEANING') {
      if (p.location_code) pezzi.push(`area <span class="mono">${this._esc(p.location_code)}</span>`);
      if (t.source_ref) pezzi.push(`dopo il campionamento <span class="mono">${this._esc(t.source_ref)}</span>`);
      if (p.auto) pezzi.push('<strong>obbligatoria — allergeni</strong>');
    }
    const testa = pezzi.length ? pezzi.join(' · ') : '<span class="text-sx-text-muted">—</span>';
    const note = t.note ? `<div class="text-body-small text-sx-text-secondary">${this._esc(t.note)}</div>` : '';
    const chiuso = t.cancel_reason ? `<div class="text-label-small text-sx-danger">Annullata: ${this._esc(t.cancel_reason)}</div>` : '';
    return testa + note + chiuso;
  },

  showNewTaskModal() {
    const io = Store.getCurrentIdentity();
    /* Ogni compito porta la sigla di chi lo ha chiesto — e' la stessa regola
       dei movimenti. Dirlo qui, non in fondo a una maschera compilata. */
    if (!io.initials) return this.toast('Identificati prima di aprire un\'attività', 'warning');
    const leader = io.role === 'leader';
    const operatori = Store.getOperators({ activeOnly: true });
    this.showModal(`${this._ico('clipboard-text')} Nuova attività`, `
      <div class="form-row mb-6">
        <div class="form-group"><label>Tipo di attività <span class="req">*</span></label>
          <select class="select" id="ntType" onchange="App._ntTypeChanged()">
            ${tipiRichiedibili().map(k => `<option value="${k}">${this._esc(TIPI_COMPITO[k].label)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Priorità</label>
          <select class="select" id="ntPriority">
            ${[1, 2, 3, 4].map(p => `<option value="${p}" ${p === PRIORITA_NORMALE ? 'selected' : ''} ${p > PRIORITA_MAX_OPERATORE && !leader ? 'disabled' : ''}>${etichettaPriorita(p)}${p > PRIORITA_MAX_OPERATORE && !leader ? ' — solo Team Leader' : ''}</option>`).join('')}
          </select>
          ${leader ? '' : '<div class="text-label-small text-sx-text-muted mt-2">Oltre Normale serve un Team Leader: se tutto è urgente, la coda torna a essere l\'ordine in cui si è chiesto.</div>'}
        </div>
      </div>
      <div class="form-row mb-2">
        <div class="form-group"><label>Articolo <span class="req" id="ntArtReq">*</span></label>
          <input class="input input-mono uppercase" id="ntArticle" maxlength="40"
            placeholder="Codice o descrizione — cerca a magazzino"
            oninput="App._ntCercaArticolo()" autocomplete="off"></div>
        <div class="form-group"><label>Lotto</label>
          <input class="input input-mono" id="ntLot" maxlength="40" readonly
            placeholder="dalla disponibilità scelta"></div>
        <div class="form-group max-w-[110px]"><label>Colli <span class="req" id="ntQtyReq">*</span></label>
          <input class="input input-mono" id="ntQty" type="number" min="1" step="1"></div>
      </div>
      <!-- 1.4.2.1 — SI SCEGLIE UNA RIGA DI MAGAZZINO, NON SI DIGITA UN LOTTO.
           Lotto e ubicazione di partenza vengono dalla merce che c'e' davvero:
           un'attivita' aperta su un lotto che non esiste e' un giro a vuoto per
           chi la prende in mano. Il Posizionamento fa eccezione, e per forza —
           la sua merce a magazzino non c'e' ancora. -->
      <div class="mb-6" id="ntDisp"></div>
      <div id="ntMerceRow">
      <div class="form-row mb-6">
        <div class="form-group"><label id="ntFromLabel">Da (ubicazione)</label>
          <div class="flex gap-3">
            <input class="input input-mono uppercase" id="ntFrom" maxlength="30" placeholder="dalla disponibilità scelta">
            <button class="btn btn-sm" type="button" onclick="App._pickLoc('ntFrom')" title="Sfoglia le ubicazioni">${this._ico('map-pin')}</button>
          </div></div>
        <div class="form-group" id="ntToGroup"><label>A (ubicazione)</label>
          <div class="flex gap-3">
            <input class="input input-mono uppercase" id="ntTo" maxlength="30">
            <button class="btn btn-sm" type="button" onclick="App._pickLoc('ntTo')" title="Sfoglia le ubicazioni">${this._ico('map-pin')}</button>
          </div></div>
      </div>
      </div>
      <!-- Il DDT vuole destinatario, vettore e causale, e li sa chi CHIEDE la
           spedizione: l'operatore che preleva non deve indovinarli. Compaiono
           solo per i due prelievi, e per nessun altro tipo.
           NON SONO OBBLIGATORI QUI. Chi apre il prelievo sa cosa e quanto va
           tirato giu' prima di sapere a chi va: il destinatario e' un dato
           del DOCUMENTO, e il documento lo pretende alla registrazione, che
           e' il momento in cui si sa. Preteso alla richiesta, blocca l'unica
           cosa che a quel punto serve — mettere il lavoro in coda. -->
      <!-- 2.32 — LA DISTINTA SI ALLEGA ALLA RICHIESTA.
           Un'attivita' di prelievo ODP che non porta il file direbbe solo un
           numero d'ordine, e chi la prende in carico dovrebbe andarselo a
           cercare: e' il passaggio a voce che questa attivita' esiste per
           togliere. Il file sale al servizio e resta li'; il compito ne porta
           il riferimento.
           NASCE NASCOSTA CON LA CLASSE, non con lo stile: uno stile in riga
           non batte una classe, ed e' il difetto del 24/08 — vedi
           _ntTypeChanged e test/maschera-attivita.test.js. -->
      <div class="hidden mb-6" id="ntOdpRow">
        <div class="form-group">
          <label>Distinta dell&rsquo;ordine <span class="req">*</span></label>
          <input class="input" id="ntOdpFile" type="file" accept=".xlsx,.xls">
          <div class="text-label-small text-sx-text-muted mt-2">
            Lo stesso file che si caricherebbe in Prelievo automatico. Chi prende in
            carico l&rsquo;attivit&agrave; se lo ritrova gi&agrave; aperto: la merce la
            dice la distinta, riga per riga, e non chi chiede.
          </div>
        </div>
      </div>
      <div class="hidden mb-6" id="ntDdtRow">
        <div class="form-row mb-4">
          <div class="form-group"><label>Destinatario</label>
            <input class="input" id="ntDest" maxlength="120" placeholder="Ragione sociale — se gia' si sa"></div>
          <div class="form-group max-w-[200px]"><label>Vettore</label>
            <input class="input" id="ntCarrier" maxlength="80"></div>
        </div>
        <div class="form-group"><label>Causale di trasporto</label>
          <select class="select" id="ntCausale">${this._causaliDDT()}</select></div>
      </div>
      <!-- IL CAMPIONAMENTO PORTA UNA COSA SOLA ALLA RICHIESTA: per chi.
           Senza «per chi» un campione è merce sparita dallo scaffale.
           1.5 — LA SPUNTA «CAMPIONE DI RISERVA» È USCITA. Non era un dato del
           magazzino ma una nota di laboratorio, e al suo posto — alla
           CONFERMA, non qui — c'è la pulizia dell'area di prelievo, che la
           GMP pretende. Chi chiede il campione non sa ancora se pulirà: lo
           sa chi lo preleva, nel momento in cui l'ha prelevato. -->
      <div class="form-row mb-6 hidden" id="ntSamplingRow">
        <div class="form-group"><label>Campione per chi <span class="req">*</span></label>
          <input class="input" id="ntSampleFor" maxlength="60" placeholder="Laboratorio interno, cliente, ente…"></div>
      </div>
      <div class="form-row mb-6">
        <div class="form-group"><label>Scadenza</label>
          <input class="input" id="ntDue" type="datetime-local"></div>
        <div class="form-group"><label>Assegna a</label>
          <select class="select" id="ntAssign">
            <option value="">Lascia in coda — la prende chi può</option>
            ${operatori.map(o => `<option value="${this._esc(o.initials)}">${this._esc(o.initials)} — ${this._esc([o.first_name, o.last_name].filter(Boolean).join(' ') || 'dati incompleti')}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-group mb-4"><label>Note — le legge chi la prende</label>
        <input class="input" id="ntNote" maxlength="200" placeholder="Es: il cliente ritira giovedì mattina"></div>
      <div id="ntError" class="gate-error"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doCreateTask()">Apri l'attività</button>`);
    this._ntTypeChanged();
  },

  /* Le nove causali di trasporto vivono in Configurazione → DDT dalla v2:
     qui si leggono, non si riscrivono. */
  _causaliDDT() {
    const cfg = Store.getDocConfig().causali || [];
    return cfg.map((c) => `<option value="${this._esc(c.id)}">${this._esc(c.label)}</option>`).join('');
  },

  /* Ogni tipo di attività porta con sé le proprie regole — quali campi
     servono, dove si cerca l'articolo, se i colli sono obbligatori — e le
     regole stanno in `modules/compiti.ts`, non qui. Qui si accende e si
     spegne ciò che l'operatore vede. */
  _ntTypeChanged() {
    const tipo = $('ntType')?.value || '';
    /* SI ACCENDE LA CLASSE, NON SOLO LO STILE. Le due righe che nascono
       nascoste portano `hidden` nel markup, e `display: ''` non batte una
       classe: toglie lo stile in riga e lascia comandare il foglio. Il
       risultato e' una riga che non compare mai — e il Campionamento
       pretendeva un campo che nessuno poteva vedere. Trovato in browser il
       24/08: la maschera rispondeva «dire per chi» sopra un modulo in cui
       quel campo non c'era. */
    const mostra = (id: string, si: boolean) => {
      const e = $(id);
      if (!e) return;
      e.classList.toggle('hidden', !si);
      e.style.display = si ? '' : 'none';
    };
    mostra('ntSamplingRow', tipo === 'SAMPLING');
    mostra('ntDdtRow', tipo === 'PICK_SHIP' || tipo === 'PICK_RET');
    /* 2.32 — la distinta si allega qui, e le righe della giacenza spariscono:
       su un prelievo ODP la merce la dice il file, non chi chiede. */
    mostra('ntOdpRow', tipo === 'PICK_ODP');
    mostra('ntMerceRow', vuoleArticolo(tipo));
    /* Lo Smaltimento scarica il magazzino e non porta niente da nessuna
       parte: il campo «A» lì non è di troppo, è fuorviante. Si SVUOTA oltre
       a nascondersi, perché `doCreateTask` legge il campo e non la sua
       visibilità: compilato prima di cambiare tipo, finirebbe nel payload
       lo stesso. */
    const destOk = vuoleDestinazione(tipo);
    mostra('ntToGroup', destOk);
    const dest = $('ntTo');
    if (dest && !destOk) dest.value = '';
    const req = (id: string, si: boolean) => { const e = $(id); if (e) e.style.visibility = si ? '' : 'hidden'; };
    req('ntQtyReq', vuoleColli(tipo));
    /* 1.4.4 — TUTTI E SETTE I TIPI PESCANO DALLE GIACENZE, Conta compresa.
       Il Posizionamento era l'unico che cercava in anagrafica, e non c'è
       più; la Conta era l'unico che apriva un vano intero, e adesso è un
       inventario mirato a un articolo e un lotto. Una regola in meno per
       ramo, e la maschera si comporta allo stesso modo ovunque. */
    const daLbl = $('ntFromLabel');
    if (daLbl) daLbl.innerHTML = vuoleUbicazione(tipo)
      ? 'Ubicazione da contare <span class="req">*</span>'
      : 'Da (ubicazione)';
    this._ntCercaArticolo();
  },

  /* ── La ricerca fra le giacenze, e la scelta della riga ──────────────
     Il campo articolo si comporta come la ricerca del magazzino: si digita e
     compaiono le righe che ci sono davvero, in ordine FEFO — prima scade,
     prima si prende. I colli mostrati sono quelli DISPONIBILI, al netto di
     ciò che è già impegnato su un DDT pendente: proporre merce promessa a
     qualcun altro è il modo di aprire un'attività che fallira'. */
  _ntCercaArticolo() {
    const box = $('ntDisp');
    if (!box) return;
    const tipo = $('ntType')?.value || '';
    const q = ($('ntArticle')?.value || '').trim();
    if (!q && vuoleUbicazione(tipo)) {
      box.innerHTML = `<div class="text-label-small text-sx-text-muted">${this._ico('list-numbers')} Conta: si sceglie la riga da ricontare. L'inventario di tutto il vano sta in Movimenta → Inventario e non ha bisogno di un'attività.</div>`;
      return;
    }
    if (q.length < 2) { box.innerHTML = ''; return; }

    /* Una riga già scelta resta scelta: questa funzione la richiama anche il
       cambio di tipo, e rimettere l'elenco al posto della conferma farebbe
       credere che la scelta sia andata persa — mentre i campi ce l'hanno
       ancora. Si torna all'elenco solo se si ridigita l'articolo. */
    const lotto = $('ntLot')?.value;
    const da = $('ntFrom')?.value;
    if (lotto && da) {
      /* La chiave si compone coi valori COM'ERANO nella giacenza, non
         maiuscolati: `item_key` è `ARTICOLO#LOTTO` e distingue le
         maiuscole — vedi la nota in `doCreateTask`. */
      const scelta = Store.getItemsAtLocation(da).find(i => i.item_key === `${q}#${lotto}`);
      if (scelta) return this._ntConferma(scelta);
    }

    const righe = Store.findItemLocations(q)
      .filter(it => (Store.getAvailableQty(it.location_code, it.item_key) || 0) > 0);
    if (!righe.length) {
      box.innerHTML = `<div class="text-label-small text-sx-warning">${this._ico('alert-triangle')} Nessuna giacenza disponibile per «${this._esc(q)}»</div>`;
      return;
    }
    const ordinate = Store.sortByFEFO(righe).slice(0, 12);
    box.innerHTML = `<div class="max-h-[190px] overflow-y-auto border border-sx-border rounded-5">${
      ordinate.map(it => {
        const disp = Store.getAvailableQty(it.location_code, it.item_key) || 0;
        /* 1.8 — una sorgente sola per la descrizione della riga: dove c'è
           l'elenco lo legge, dove no ricade sulla suddivisione calcolata. */
        const descr = Store.descriviRiga(it);
        const dettaglio = descr === '—' ? '' : ` · ${this._ico('scale')} ${this._esc(descr)}`;
        return `<div class="search-result-item" onclick="App._ntScegli('${this._esc(it.location_code)}','${this._esc(it.item_key)}')">
          <span class="mono font-bold">${this._esc(it.article_code)}</span>
          <span class="mono text-sx-text-secondary">${this._esc(it.lot_code)}</span>
          <span class="text-label-small text-sx-text-muted">${this._esc(it.location_code)}${it.expiry_date ? ' · scad ' + this._esc(it.expiry_date) : ''}${dettaglio}</span>
          <span class="ml-auto font-bold text-sx-accent">${disp} Coll.</span>
        </div>`;
      }).join('')}</div>`;
  },

  /* La riga scelta compila lotto e ubicazione di partenza: sono fatti della
     merce, non cose da ricordare a memoria. */
  _ntScegli(loc, itemKey) {
    const it = Store.getItemsAtLocation(loc).find(i => i.item_key === itemKey);
    if (!it) return this.toast('Quella riga non è più a magazzino', 'warning');
    const set = (id: string, v: string) => { const e = $(id); if (e) e.value = v; };
    set('ntArticle', it.article_code);
    set('ntLot', it.lot_code);
    set('ntFrom', it.location_code);
    const disp = Store.getAvailableQty(it.location_code, it.item_key) || 0;
    const qty = $('ntQty');
    if (qty) { qty.max = String(disp); if (!qty.value) qty.value = String(disp); }
    this._ntConferma(it);
    $('ntQty')?.focus();
  },

  _ntConferma(it) {
    const box = $('ntDisp');
    if (!box) return;
    const disp = Store.getAvailableQty(it.location_code, it.item_key) || 0;
    box.innerHTML = `<div class="text-label-small text-sx-success">${this._ico('check')} ${this._esc(it.article_code)} lotto ${this._esc(it.lot_code)} in ${this._esc(it.location_code)} — ${disp} colli disponibili</div>`;
  },

  async doCreateTask() {
    const err = (m: string) => { const e = $('ntError'); if (e) e.textContent = m; };
    const val = (id: string) => ($(id)?.value || '').trim();
    const su = (id: string) => val(id).toUpperCase();
    const payload: PayloadCompito = {};
    if (val('ntType') === 'SAMPLING') {
      if (!val('ntSampleFor')) return err('Un campione senza destinatario è merce sparita dallo scaffale: dire per chi.');
      payload.sample_for = val('ntSampleFor');
    }
    const tipo = val('ntType');
    /* 1.4.2.1 — ciò che serve a precompilare il movimento è obbligatorio, e
       lo si dice PRIMA: un'attività senza articolo o senza colli è un'attività
       che chi la prende in mano non sa eseguire. Le regole per tipo stanno in
       `modules/compiti.ts`. */
    if (vuoleArticolo(tipo) && !val('ntArticle')) return err('Scegliere l\'articolo fra le giacenze: l\'attività deve dire su che cosa si lavora.');
    if (vuoleArticolo(tipo) && !val('ntLot')) return err('Scegliere una delle disponibilità proposte: lotto e ubicazione di partenza vengono da lì.');
    /* 2.32 — SENZA DISTINTA NON C'È PRELIEVO. Un'attività di prelievo ODP
       che non porta il file direbbe solo un numero d'ordine, e chi la prende
       in carico dovrebbe andarselo a cercare — che è esattamente il
       passaggio a voce che questa attività esiste per togliere. */
    if (tipo === 'PICK_ODP' && !((($('ntOdpFile') as HTMLInputElement | null)?.files || []).length)) {
      return err('Allegare la distinta dell\'ordine (.xlsx): senza, chi prende in carico non sa che cosa prelevare.');
    }
    if (vuoleUbicazione(tipo) && !su('ntFrom')) return err('Quale riga si conta: senza l\'ubicazione non c\'è niente da aprire a chi la prende in mano.');
    if (vuoleColli(tipo) && !(parseInt(val('ntQty'), 10) > 0)) return err('Quanti colli: senza, il movimento non si può preparare e l\'attività non sa quando è finita.');

    /* 1.4.4 — ARTICOLO E LOTTO SI SCRIVONO COM'ERANO, SENZA MAIUSCOLARLI.
       Insieme formano `item_key` — `ARTICOLO#LOTTO` — che è la chiave con
       cui si ritrova la riga di giacenza. Maiuscolarli qui sembrava una
       normalizzazione e invece era una riscrittura della chiave: un lotto
       registrato `qwert` diventava `QWERT`, e `_taskLancia` andava a cercare
       una riga che non esiste. La maschera si apriva vuota, e chi la prendeva
       in mano non aveva modo di capire perché. I due valori li ha scritti
       `_ntScegli` copiandoli dalla giacenza scelta: sono già quelli giusti. */
    if (val('ntArticle')) payload.article_code = val('ntArticle');
    if (val('ntLot')) payload.lot_code = val('ntLot');
    if (val('ntQty')) payload.qty = parseInt(val('ntQty'), 10);
    if (su('ntFrom')) payload.from = su('ntFrom');
    if (su('ntTo')) payload.to = su('ntTo');
    /* 2.32 — LA DISTINTA SALE PRIMA DEL COMPITO, e se non sale il compito
       non nasce. L'ordine conta: un'attività di prelievo ODP senza allegato
       è un'attività che chi la prende in carico non può eseguire, e
       lasciarla in coda vorrebbe dire riempire la coda di lavoro che non si
       può fare — che è il modo in cui una coda si smette di guardare. */
    if (tipo === 'PICK_ODP') {
      const f = (($('ntOdpFile') as HTMLInputElement | null)?.files || [])[0];
      if (!f) return err('Allegare la distinta dell\'ordine.');
      try {
        const buf = await f.arrayBuffer();
        let bin = '';
        const byte = new Uint8Array(buf);
        /* A pezzi da 8 kB: `String.fromCharCode(...tutto)` su un file da
           qualche megabyte esaurisce lo stack degli argomenti. */
        for (let i = 0; i < byte.length; i += 8192) {
          bin += String.fromCharCode(...byte.subarray(i, i + 8192));
        }
        const risposta = await fetch('/api/allegati', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ contenuto: btoa(bin) }),
        });
        if (!risposta.ok) {
          const motivo = await risposta.json().catch(() => ({}));
          throw new Error(motivo.error || `il servizio ha risposto ${risposta.status}`);
        }
        const salito = await risposta.json();
        payload.allegato = salito.id;
        payload.allegato_nome = f.name;
      } catch (e) {
        return err(`La distinta non è salita al servizio · ${(e as Error).message}`);
      }
    }
    if (tipo === 'PICK_SHIP' || tipo === 'PICK_RET') {
      /* Vuoto non si scrive: il payload e' la richiesta, e la testata del
         DDT si compila alla registrazione. */
      if (val('ntDest')) payload.destination = val('ntDest');
      if (val('ntCarrier')) payload.carrier = val('ntCarrier');
      if (val('ntCausale')) payload.causale = val('ntCausale');
    }
    const dovuto = val('ntDue');
    try {
      const rec = await Store.createTask({
        type: val('ntType'),
        priority: parseInt(val('ntPriority'), 10),
        requested_by: Store.getCurrentIdentity().initials,
        assigned_to: su('ntAssign') || null,
        due_at: dovuto ? new Date(dovuto).getTime() : null,
        note: val('ntNote'),
        payload: Object.keys(payload).length ? payload : null,
      });
      this.closeModal();
      this.toast(`${etichettaTipo(rec.type)} in coda — ${rec.task_id}`, 'success');
      this.renderTasks();
      if (this.currentView === 'dashboard') this.renderDashboard();
    } catch (e) {
      err((e as Error).message);
    }
  },

  /* I quattro gesti della coda. Uno per volta, e ognuno rilegge la vista:
     due terminali sulla stessa attivita' sono la norma, non l'eccezione. */
  async _taskAction(fn, messaggio) {
    try {
      await fn();
      if (messaggio) this.toast(messaggio, 'success');
      this.renderTasks();
      if (this.currentView === 'dashboard') this.renderDashboard();
    } catch (err) {
      this.toast((err as Error).message, 'error');
    }
  },

  doTakeTask(taskId) {
    const io = Store.getCurrentIdentity();
    if (!io.initials) return this.toast('Identificati prima di prendere un\'attività', 'warning');
    return this._taskAction(() => Store.assignTask(taskId, io.initials), `Attività in carico a ${io.initials}`);
  },

  /* ═══ 1.4.2.1 — L'AVVIO LANCIA IL LAVORO ═══════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l.

     Fino alla 1.4.1 «Avvia» segnava un'ora e «Completa» era una spunta: il
     compito AFFIANCAVA l'operazione. Da qui l'avvio apre la funzione di
     Movimenta precompilata, e il compito si chiude perche' un movimento e'
     stato confermato — decisione 43.

     Chi decide quale maschera aprire e' `operazioneDi(tipo)`, che sta nel
     modulo puro: qui si esegue, non si sceglie. */

  async doStartTask(taskId) {
    const io = Store.getCurrentIdentity();
    if (!io.initials) return this.toast('Identificati prima di avviare un\'attività', 'warning');
    const t = Store.getTask(taskId);
    if (!t) return this.toast('Attività non trovata', 'error');
    const op = operazioneDi(t.type);
    if (!op) return this.toast(`${etichettaTipo(t.type)}: nessuna operazione da aprire`, 'error');

    /* Un avvio gia' in corso su un altro compito si abbandona prima: due
       maschere precompilate da due compiti diversi sono il modo di scalare
       il residuo di quello sbagliato. */
    if (this._taskRun && this._taskRun.task_id !== taskId) {
      const altro = Store.getTask(this._taskRun.task_id);
      if (!await Dialog.confirm({
        title: 'C’è già un’attività avviata',
        message: `${etichettaTipo(altro?.type || '')} ${this._taskRun.task_id} è aperta in Movimenta. Avviandone un’altra, quella torna in carico senza aver mosso niente.`,
        confirmLabel: 'Avvia questa', danger: true,
      })) return;
      await this._taskAbbandona({ silenzioso: true });
    }

    try {
      if (t.status !== 'in_progress') await Store.startTask(taskId, io.initials);
    } catch (err) {
      return this.toast((err as Error).message, 'error');
    }
    this._taskRun = { task_id: taskId, type: t.type, payload: (t.payload && typeof t.payload === 'object') ? t.payload : {}, movs: [] };
    this.renderTasks();
    this._taskLancia(Store.getTask(taskId), op);
  },

  /* Apre la maschera e ci mette dentro cio' che il compito sa gia'. Ogni
     tipo compila i campi che gli servono: la merce si identifica sempre a
     scaffale, quindi le verifiche di scansione NON si saltano — quello che
     si salta e' la ricerca, non il controllo. */
  _taskLancia(t, op) {
    /* 2.31 — LA PREPARAZIONE NON PRECOMPILA UNA MASCHERA: COSTRUISCE UN
       PERCORSO. Gli altri sei tipi aprono Movimenta e riempiono dei campi;
       questo rilegge il documento, ne ricava le tappe e apre il giro. Esce
       prima, quindi, e non passa da `startMov`. */
    if (t?.type === 'PREP_SHIP') { void this._prepAvvia(t); return; }
    /* 2.32 — e il prelievo ODP scarica la distinta allegata e la apre nella
       scheda del prelievo automatico. Anche lui esce prima: non c'e' nessuna
       maschera da precompilare, c'e' un file da leggere. */
    if (t?.type === 'PICK_ODP') { void this._odpAvvia(t); return; }
    this.switchView('movimenta');
    this.startMov(op.modo, op.dir || null);
    const p = ((t.payload && typeof t.payload === 'object') ? t.payload : {}) as PayloadCompito;
    const set = (id: string, v: string | undefined) => { const e = $(id); if (e && v) e.value = v; };
    const resta = residuo(t);
    const colli = resta === null ? (p.qty || '') : resta;

    if (op.modo === 'io' && op.dir === 'out') {
      if (p.from && p.article_code && p.lot_code) {
        this._dispSelect(p.from, `${p.article_code}#${p.lot_code}`);
        if (colli) set('dQty', String(colli));
      }
    } else if (op.modo === 'move') {
      this._pickSub('cambio');
      set('pCambioArt', p.article_code); set('pCambioLot', p.lot_code);
      /* LA RIGA LA SCEGLIE IL COMPITO, NON LA RICERCA. Lo stesso lotto in due
         ubicazioni fa comparire l'elenco delle partenze, e l'elenco non
         seleziona niente: il modulo resterebbe precompilato ma senza merce
         sotto, e alla conferma direbbe «scansiona prima un articolo». La
         partenza il compito ce l'ha nel payload — si va diritti là. */
      if (p.from && p.article_code && p.lot_code) {
        this._cambioSelect({ loc: p.from, key: `${p.article_code}#${p.lot_code}` });
      } else if (p.article_code && p.lot_code) {
        this._cambioLookup();
      }
      set('pCambioDest', p.to);
      this._previewLoc('pCambioDest', 'pCambioDestPrev');
      if (colli) set('pCambioQty', String(colli));
    } else if (op.modo === 'quarantine') {
      if (p.from && p.article_code && p.lot_code) {
        this._qSelect(p.from, `${p.article_code}#${p.lot_code}`);
        if (colli) set('qQty', String(colli));
      }
    } else if (op.modo === 'inv' && op.dir === 'mirato') {
      /* 1.4.4 — LA CONTA È UN INVENTARIO MIRATO. Non apre più il vano
         intero: apre la riga che il compito indica, con la finestra di
         guida a scansioni come smaltimento e quarantena. */
      if (p.from && p.article_code && p.lot_code) {
        this._contaSelect(p.from, `${p.article_code}#${p.lot_code}`);
      }
    } else if (op.modo === 'shipping') {
      /* Destinatario, vettore e causale li ha detti chi ha CHIESTO il
         prelievo: qui si ritrovano in testata, e la riga entra da sola
         nel carrello con i colli che restano. */
      this._shipCustomer = p.destination || this._shipCustomer;
      this._shipCarrier = p.carrier || this._shipCarrier;
      if (p.causale) this._shipCausale = p.causale;
      this._formSpedizioni($('movFormArea'));
      set('pShipArt', p.article_code); set('pShipLot', p.lot_code);
      if (p.article_code && p.lot_code) {
        /* Come per il trasferimento: se il compito dice da dove, si va là.
           `_shipLookup` con lo stesso lotto in due ubicazioni apre l'elenco
           e non seleziona niente. */
        if (p.from) this._shipSelectItem({ location_code: p.from, item_key: `${p.article_code}#${p.lot_code}` });
        else this._shipLookup();
        if (colli) set('pShipQty', String(colli));
      }
    } else if (op.modo === 'sampling') {
      this._campReset();
      if (p.from && p.article_code && p.lot_code) this._campSelect(p.from, `${p.article_code}#${p.lot_code}`);
    }
    this._renderTaskBanner();
    this.toast(`▶ ${etichettaTipo(t.type)} avviata — ${this._esc(t.task_id)}`, 'success');
  },

  /* La striscia sopra il modulo: quale compito si sta lavorando, quanto
     resta, e la via d'uscita. Senza, chi apre Movimenta da una coda non ha
     modo di sapere che la maschera davanti a lui e' precompilata. */
  _renderTaskBanner() {
    const area = $('taskRunBanner');
    if (!area) return;
    if (!this._taskRun) { area.innerHTML = ''; return; }
    const t = Store.getTask(this._taskRun.task_id);
    if (!t || !eAperto(t)) { area.innerHTML = ''; return; }
    const resta = residuo(t);
    const fatti = quantitaFatta(t);
    const p = this._taskRun.payload;
    const dettaglio = [
      p.article_code ? `<span class="mono">${this._esc(p.article_code)}</span>` : '',
      p.lot_code ? `lotto <span class="mono">${this._esc(p.lot_code)}</span>` : '',
      p.from ? `da <span class="mono">${this._esc(p.from)}</span>` : '',
      p.to ? `a <span class="mono">${this._esc(p.to)}</span>` : '',
    ].filter(Boolean).join(' · ');
    area.innerHTML = `<div class="mov-preview bg-sx-accent-soft border-sx-accent mb-6 flex gap-6 items-center flex-wrap">
      <span class="font-bold">${this._ico(iconaTipo(t.type))} ${this._esc(etichettaTipo(t.type))}</span>
      <span class="mono text-label-small text-sx-text-muted">${this._esc(t.task_id)}</span>
      <span class="text-body-small">${dettaglio}</span>
      ${resta === null ? '' : `<span class="badge badge-blue">restano ${resta} coll.${fatti ? ` · ${fatti} già mossi` : ''}</span>`}
      ${t.note ? `<span class="text-label-small text-sx-text-secondary">${this._esc(t.note)}</span>` : ''}
      <button class="btn btn-sm btn-ghost ml-auto" onclick="App._taskLascia()">Lascia l'attività</button>
    </div>`;
  },

  /* IL MOVIMENTO CONFERMATO SCALA IL RESIDUO — decisione 45.
     La chiamano le sette maschere, una riga dopo il movimento riuscito:
     e' l'unico punto in cui un compito avanza, e sta in chiaro in ognuna
     invece che nascosto in `_logMov`, perche' quanti colli si siano mossi
     lo sa la maschera e non il registro. */
  async _taskAvanza(colli, tipi) {
    if (!this._taskRun) return;
    /* Ogni maschera dichiara quali tipi puo' servire: l'operatore puo'
       cambiare scheda dentro Movimenta, e un posizionamento non deve poter
       scalare il residuo di uno smaltimento. */
    if (tipi && !tipi.includes(this._taskRun.type)) return;
    const movs = this._taskRun.movs.slice();
    this._taskRun.movs = [];
    return await this._taskScala(this._taskRun.task_id, colli, movs);
  },

  async _taskScala(taskId, colli, movs = []) {
    let rec;
    try {
      rec = await Store.advanceTask(taskId, colli, movs);
    } catch (err) {
      /* Il movimento e' gia' andato: qui si perde solo il conto, e va detto
         forte perche' il compito resta aperto con un residuo sbagliato. */
      this.toast(`Movimento registrato, ma l'attività non è avanzata: ${(err as Error).message}`, 'error');
      return;
    }
    if (!eAperto(rec)) {
      this.toast(`${etichettaTipo(rec.type)} completata — ${rec.task_id}`, 'success');
      if (this._taskRun?.task_id === rec.task_id) this._taskRun = null;
    } else {
      const resta = residuo(rec);
      if (resta !== null) this.toast(`Restano ${resta} coll. su ${etichettaTipo(rec.type)} ${rec.task_id}`, 'info');
    }
    this._renderTaskBanner();
    if (this.currentView === 'dashboard') this.renderDashboard();
  },

  /* Maschera chiusa senza aver confermato niente → il compito torna in
     carico e `started_at` si azzera. Se invece qualcosa si e' mosso, l'avvio
     e' storia: il compito resta in corso col suo residuo. */
  async _taskAbbandona({ silenzioso = false } = {}) {
    const run = this._taskRun;
    this._taskRun = null;
    if (!run) return;
    try {
      const prima = Store.getTask(run.task_id);
      if (prima && eAperto(prima)) {
        const dopo = await Store.abandonTask(run.task_id);
        if (!silenzioso) {
          this.toast(dopo.started_at === null
            ? `Attività ${run.task_id} lasciata: torna in carico`
            : `Attività ${run.task_id} resta in corso — ${residuo(dopo) ?? 0} coll. da fare`, 'info');
        }
      }
    } catch (err) {
      if (!silenzioso) this.toast((err as Error).message, 'error');
    }
    this._renderTaskBanner();
    if (this.currentView === 'tasks') this.renderTasks();
  },

  /* Il pulsante della striscia: si lascia l'attivita' E si chiude la
     maschera, perche' una maschera precompilata da un compito che non si sta
     piu' lavorando e' la piu' facile da confermare per sbaglio. */
  _taskLascia() {
    this.cancelMov();
    this.renderMovimenta();
  },

  async doCancelTask(taskId) {
    const t = Store.getTask(taskId);
    if (!t) return;
    const motivo = await Dialog.reason({
      title: `Annullare ${etichettaTipo(t.type).toLowerCase()}?`,
      message: 'Un\'attività annullata resta nello storico con il suo motivo: fra un mese deve essere chiaro se era sbagliata o solo scomoda.',
      placeholder: 'Perché non si fa più…',
      /* Non «Annulla»: accanto al pulsante di uscita del dialogo sarebbero
         due Annulla che fanno il contrario l'uno dell'altro. */
      confirmLabel: 'Sì, annullala',
      danger: true,
    });
    if (!motivo) return;
    return this._taskAction(() => Store.cancelTask(taskId, motivo), 'Attività annullata');
  },

  doSetTaskPriority(taskId, priorita) {
    return this._taskAction(() => Store.setTaskPriority(taskId, parseInt(priorita, 10)), 'Priorità aggiornata');
  },

  /* IL RIQUADRO IN DASHBOARD, dal primo giorno e non dalla versione dopo.
     PIANO §4.1: «uno schedulatore che nessuno chiude e' una lista che
     invecchia». Chi non apre la voce Attivita' deve comunque vedere che c'e'
     qualcosa che aspetta da tre giorni. */
  _renderTasksPanel() {
    const r = Store.getTasksSummary();
    const coda = Store.getTaskQueue().slice(0, 6);
    const righe = coda.map(t => {
      const m = misure(t);
      return `<tr class="bg-sx-danger-soft"${inRitardo(t) ? '' : ''}>
        <td><span class="badge ${this._taskPrioClasse(t.priority)}">${etichettaPriorita(t.priority)}</span></td>
        <td>${this._ico(iconaTipo(t.type))} ${this._esc(etichettaTipo(t.type))}</td>
        <td class="mono">${this._esc(t.assigned_to || '—')}</td>
        <td class="whitespace-nowrap">${durataUmana(m.attesa)}</td>
      </tr>`;
    }).join('');
    return `<div class="card">
      <div class="card-title flex justify-between items-center">
        <span>${this._ico('clipboard-text')} Attività aperte</span>
        <button class="btn btn-sm" onclick="App.switchView('tasks')">Apri la coda</button>
      </div>
      ${r.aperti ? `<div class="text-body-small text-sx-text-secondary mb-4">
          <strong>${r.aperti}</strong> apert${r.aperti === 1 ? 'a' : 'e'}${r.urgenti ? ` · <strong class="text-sx-danger">${r.urgenti} urgent${r.urgenti === 1 ? 'e' : 'i'}</strong>` : ''}${r.inRitardo ? ` · ${r.inRitardo} oltre la scadenza` : ''}
          ${r.attesaMassima !== null ? ` · la più vecchia aspetta da <strong>${durataUmana(r.attesaMassima)}</strong>` : ''}
        </div>
        <div class="overflow-x-auto"><table class="sx-table">
          <thead><tr><th class="w-[90px]">Priorità</th><th>Tipo</th><th class="w-[70px]">In carico</th><th class="w-[90px]">In coda da</th></tr></thead>
          <tbody>${righe}</tbody>
        </table></div>
        ${r.aperti > coda.length ? `<div class="text-label-small text-sx-text-muted mt-3.5">altre ${r.aperti - coda.length} in coda</div>` : ''}`
      : '<div class="ct-empty">Nessuna attività aperta.</div>'}
    </div>`;
  },
} satisfies Vista;
