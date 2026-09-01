import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import type { Operatore } from '../../types/entita';
import { Validate } from '../../modules/validate';
import { Auth } from '../../modules/auth';
import { Session } from '../../modules/session';
import { Dialog } from '../dialog';
import { Persistence } from '../../core/persistence/index';
import { componi, alClic, segno, STATO_VUOTO } from '../../modules/tabella';
import type { Colonna, Stato } from '../../modules/tabella';

export const VistaConfigOperatori = {
  /* 2.1 — §3: anche questa si ordina e si cerca. Su un magazzino con
     quaranta sigle, «chi non ha il PIN» e «chi è disattivato» sono due
     domande che si fanno davvero, e prima si rispondevano leggendo. */
  _opOrdine: STATO_VUOTO,

  _opColonne(): Colonna<Operatore>[] {
    return [
      { campo: 'initials', titolo: 'Iniziali' },
      { campo: 'nome', titolo: 'Nome e cognome',
        valore: (o) => [o.first_name, o.last_name].filter(Boolean).join(' ') },
      { campo: 'role', titolo: 'Ruolo' },
      { campo: 'pin', titolo: 'PIN', valore: (o) => (Store.haPin(o) ? 'impostato' : 'mancante') },
      /* 2.13 — la colonna esiste per gli Admin e per nessun altro: un
         Operatore senza via di fuga non e' un fatto, e' la normalita'. */
      { campo: 'fuga', titolo: 'Ripristino',
        valore: (o) => (o.role !== 'admin' ? '' : Store.haCodiceRipristino(o) ? 'impostato' : 'mancante') },
      { campo: 'stato', titolo: 'Stato', valore: (o) => (o.active === false ? 'disattivato' : 'attivo') },
    ];
  },

  _opOrdina(campo) {
    this._opOrdine = alClic(this._opOrdine, campo);
    this.renderConfig();
  },

  _opCerca(testo) {
    this._opOrdine = { ...this._opOrdine, cerca: String(testo || '') };
    this.renderConfig();
  },

  /* ══ 2.13 · LA SCHEDA HA DUE LETTURE, E NON SONO DUE SCHEDE ══════════
     © Andrea Sacchetti — Dietopack S.r.l.

     L'Admin la apre per intero: crea, cambia carica, disattiva, rinnova
     qualunque PIN, genera le vie di fuga. Il Team Leader apre LA STESSA
     scheda e ci trova un elenco e una chiave: rinnova i PIN di chi sta
     sotto di lui, e non tocca nient'altro. Non è una scheda ridotta
     scritta a parte — sarebbe la copia che il primo giorno somiglia e il
     secondo no — sono gli stessi bottoni, disegnati quando spettano.

     Chi decide è lo Store, in un posto solo: `comandaGliOperatori` per i
     gesti dell'anagrafica, `puoRinnovareIlPin` riga per riga. */
  _renderConfigOperators(el) {
    const io = this.currentOperatorRecord;
    const comanda = Store.comandaGliOperatori(io);
    const ops = Store.getOperators();
    const leaders = Store.getActiveLeaders();
    const senzaFuga = Store.getAdminSenzaRipristino();
    const visibili = componi(ops, this._opColonne(), this._opOrdine as Stato);
    const thOp = (campo: string, titolo: string, classe = '') =>
      `<th class="sx-th-ord ${classe}" onclick="App._opOrdina('${campo}')" title="Ordina per ${titolo}">${titolo}${segno(this._opOrdine as Stato, campo)}</th>`;
    const rows = visibili.map(o => {
      const nome = [o.first_name, o.last_name].filter(Boolean).join(' ');
      const inactive = o.active === false;
      const rinnovabile = Store.puoRinnovareIlPin(io, o);
      const fuga = o.role !== 'admin'
        ? '<span class="text-sx-text-muted">—</span>'
        : Store.haCodiceRipristino(o)
          ? '<span class="badge badge-green">impostato</span>'
          : '<span class="badge badge-amber">mancante</span>';
      return `<tr${inactive ? ' class="opacity-55"' : ''}>
        <td><span class="mono font-bold text-sx-primary">${this._esc(o.initials)}</span></td>
        <td>${nome ? this._esc(nome) : '<span class="text-sx-warning italic">da completare</span>'}</td>
        <td>${o.role === 'admin'
              ? '<span class="badge badge-red">🛡 Admin</span>'
              : o.role === 'leader'
                ? '<span class="badge badge-blue">👑 Team Leader</span>'
                : '<span class="badge badge-muted">Operatore</span>'}</td>
        <td>${Store.haPin(o)
              ? '<span class="badge badge-green">impostato</span>'
              : '<span class="badge badge-amber">mancante</span>'}</td>
        <td>${fuga}</td>
        <td>${inactive ? '<span class="badge badge-red">disattivato</span>' : '<span class="badge badge-green">attivo</span>'}</td>
        <td class="whitespace-nowrap">
          ${comanda
            ? `<button class="btn btn-sm" onclick="App.showEditOperatorModal('${o.op_id}')" title="Modifica dati e ruolo">✏️</button>`
            : ''}
          ${rinnovabile
            ? `<button class="btn btn-sm btn-warning" onclick="App.showRenewPinModal('${o.op_id}')" title="Rinnova il PIN">🔑</button>`
            : ''}
          ${comanda && o.role === 'admin'
            ? `<button class="btn btn-sm" onclick="App.rigeneraCodiceRipristino('${o.op_id}')" title="${Store.haCodiceRipristino(o) ? 'Genera un codice nuovo: quello vecchio smette di valere' : 'Genera il codice di ripristino'}">🗝</button>`
            : ''}
          ${comanda
            ? (inactive
              ? `<button class="btn btn-sm btn-success" onclick="App.toggleOperatorActive('${o.op_id}')" title="Riattiva">✓</button>`
              : `<button class="btn btn-sm btn-danger" onclick="App.toggleOperatorActive('${o.op_id}')" title="Disattiva">⊘</button>`)
            : ''}
        </td>
      </tr>`;
    }).join('');

    /* 2.13 — L'AVVISO CHE NON SE NE VA. Le installazioni già in campo hanno
       Admin nati prima che la via di fuga esistesse: il loro PIN perso è
       ancora la Configurazione murata. L'avviso non blocca il lavoro — non
       è il momento di scoprire una regola nuova, in mezzo a un turno — e
       non sparisce finché ogni Admin attivo non ha il suo codice. */
    const avviso = (comanda && senzaFuga.length) ? `
      <div class="mov-preview mov-preview-warn mb-7 leading-[1.6]">
        <strong>🗝 Nessuna via di fuga configurata</strong> per
        ${senzaFuga.length === 1 ? 'l’Admin' : 'gli Admin'}
        ${senzaFuga.map(o => `<span class="mono">${this._esc(o.initials)}</span>`).join(', ')}.
        Se ne perde il PIN e non c’è un altro Admin che possa rinnovarglielo,
        la Configurazione non si riapre più. Il tasto <strong>🗝</strong> sulla
        riga genera il codice: si stampa, si mette in cassaforte, e non si
        rilegge mai più.
      </div>` : '';

    el.innerHTML = `<div class="config-card">
      <h3>Anagrafica Operatori
        ${comanda
          ? '<button class="btn btn-sm btn-primary float-right" onclick="App.showAddOperatorModal()">+ Nuovo operatore</button>'
          : ''}</h3>
      ${avviso}
      ${comanda ? '' : `
      <div class="mov-preview mb-7 leading-[1.6]">
        Sei collegato come <strong>Team Leader</strong>: da qui rinnovi i PIN
        di Operatori e Team Leader. Creare operatori, cambiare le cariche e
        disattivare qualcuno sono gesti dell’<strong>Admin</strong>, e il PIN
        di un Admin lo rinnova soltanto un altro Admin.
      </div>`}
      <div class="form-group mb-5">
        <input class="input" id="opCerca" placeholder="Cerca sigla, nome, ruolo, stato…"
          value="${this._esc(this._opOrdine.cerca)}" oninput="App._opCerca(this.value)">
        <div class="text-label-small text-sx-text-muted mt-2">
          ${visibili.length} su ${ops.length} operatori
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="sx-table">
          <thead><tr>${thOp('initials', 'Iniziali', 'w-[80px]')}${thOp('nome', 'Nome e cognome')}${thOp('role', 'Ruolo', 'w-[150px]')}${thOp('pin', 'PIN', 'w-[110px]')}${thOp('fuga', 'Ripristino', 'w-[110px]')}${thOp('stato', 'Stato', 'w-[110px]')}<th class="w-[160px]">Azioni</th></tr></thead>
          <tbody>${rows || `<tr><td class="text-center text-sx-text-muted italic" colspan="7">${this._opOrdine.cerca ? 'Nessun operatore corrisponde alla ricerca' : 'Nessun operatore'}</td></tr>`}</tbody>
        </table>
      </div>
      <div class="bg-[var(--grad-soft-green)] border border-sx-success rounded-[var(--radius-md)] py-6 px-7.5 mt-7">
        <div class="font-bold text-body-small text-sx-success mb-3">🔒 Come funzionano PIN, cariche e via di fuga</div>
        <p class="text-body-small text-sx-text-secondary leading-[1.6]">
          <strong>Tre cariche, e ognuna arriva fin dove serve.</strong>
          L’<strong>Operatore</strong> svolge tutte le attività di magazzino.
          Il <strong>Team Leader</strong> fa lo stesso e in più rinnova i PIN
          di Operatori e Team Leader. L’<strong>Admin</strong> non ha limiti:
          crea chiunque, di qualunque carica, rinnova qualunque PIN — quello
          di un Admin compreso — e apre la Configurazione, che agli altri due
          resta chiusa.<br>
          Il PIN è di <strong>6 cifre</strong> e non viene mai conservato in chiaro: sul disco resta solo la sua
          impronta crittografica con un sale casuale, e lo stesso vale per i backup JSON.
          Un PIN smarrito <strong>non è recuperabile</strong> — si rinnova, e il rinnovo lo autorizza
          chi sta un gradino sopra. L’operazione finisce nel registro movimenti;
          il PIN no, né in chiaro né come impronta.<br>
          <strong>🗝 Sopra l’Admin non c’è nessuno,</strong> e per questo ogni Admin ha un
          <strong>codice di ripristino</strong>: venti caratteri mostrati una volta sola,
          da stampare e custodire. Rientrato con quello, si riscrive il PIN e
          nasce subito un codice nuovo — quello speso non vale più.<br>
          <strong>Nessun operatore è eliminabile:</strong> chi ha firmato un movimento resta in anagrafica e
          al più viene disattivato. Deve esistere sempre almeno un Team Leader attivo
          (${leaders.length} attualmente): è ciò che garantisce di non restare mai chiusi fuori.
        </p>
      </div>
    </div>`;
  },

  _renderConfigSession(el) {
    const min = Session.getTimeoutMinutes();
    el.innerHTML = `<div class="config-card">
      <h3>Blocco per inattività</h3>
      <p class="text-body-small text-sx-text-secondary leading-[1.6] mb-7">
        Trascorso questo tempo senza attività, l'applicazione <strong>salva i dati</strong> e si blocca dietro
        la richiesta di identificazione. Serve a impedire che il movimento successivo venga firmato
        da chi non l'ha eseguito: su un terminale di reparto è la differenza fra un registro
        attendibile e uno che non regge un audit.<br>
        Se rientra un operatore diverso, eventuali carrelli aperti (prelievo, resi, spedizioni)
        vengono azzerati con avviso.
      </p>
      <div class="flex items-center gap-6 flex-wrap">
        <label class="text-body-small font-semibold" for="sessTimeout">Minuti di inattività</label>
        <input class="input input-mono w-[100px]" id="sessTimeout" type="number" min="0" max="${Session.MAX_MIN}" value="${min}">
        <button class="btn btn-primary btn-sm" onclick="App._applySessionTimeout()">Applica</button>
        <span class="text-body-small text-sx-text-muted">
          ${Session.MIN_MIN}–${Session.MAX_MIN} minuti · <strong>0 = blocco disattivato</strong>
        </span>
      </div>
      <div class="text-body-small text-sx-text-muted mt-6 leading-[1.6]">
        Stato attuale: <strong>${min ? `blocco dopo ${min} minuti` : 'blocco disattivato'}</strong>.
        L'impostazione vale per <strong>questo dispositivo</strong>: non entra nel database né negli export,
        perché un tablet in reparto e un PC in ufficio non hanno le stesse esigenze.
      </div>
    </div>`;
  },

  _applySessionTimeout() {
    const v = Session.setTimeoutMinutes($('sessTimeout')?.value);
    this.toast(v ? `Blocco per inattività: ${v} minuti` : 'Blocco per inattività disattivato', 'success');
    this.renderConfig();
  },

  /* ── Creazione / modifica operatore (autorizzate da un Team Leader) ── */
  showAddOperatorModal() {
    this.showModal(
      '➕ Nuovo operatore',
      `<div class="form-row mb-6">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="opFirst" maxlength="40" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="opLast" maxlength="40"></div>
      </div>
      <div class="form-row mb-6">
        <div class="form-group">
          <label>Iniziali <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="opInitials" maxlength="4" placeholder="Es. AS" oninput="this.value=this.value.toUpperCase()">
          <div class="text-label-small text-sx-text-muted mt-2">2-4 caratteri, uniche: finiscono su ogni movimento</div>
        </div>
        <div class="form-group">
          <label>Ruolo <span class="req">*</span></label>
          <select class="input select" id="opRole">
            <option value="operator">Operatore</option>
            <option value="leader">Team Leader</option>
            <option value="admin">Admin</option>
          </select>
          <div class="text-label-small text-sx-text-muted mt-2">L'<strong>Operatore</strong> svolge tutte le attività. Il <strong>Team Leader</strong> in più rinnova i PIN di Operatori e Team Leader. L'<strong>Admin</strong> non ha limiti: crea chiunque, rinnova qualunque PIN e apre la Configurazione</div>
        </div>
      </div>
      <div class="form-row mb-4">
        <div class="form-group"><label>PIN a 6 cifre <span class="req">*</span></label>
          <input class="input input-mono" id="opPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma PIN <span class="req">*</span></label>
          <input class="input input-mono" id="opPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
      </div>
      <div id="opFormError" class="gate-error"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doAddOperator()">Crea (richiede PIN Admin)</button>`
    );
  },

  async doAddOperator() {
    const err = (m: string) => { const e = $('opFormError'); if (e) e.textContent = m; };
    const first = Validate.clean($('opFirst')?.value);
    const last  = Validate.clean($('opLast')?.value);
    const init  = ($('opInitials')?.value || '').toUpperCase().trim();
    const role  = this._ruoloScelto();
    const pin   = $('opPin')?.value || '';
    const pin2  = $('opPin2')?.value || '';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    if (!/^[A-Z0-9]{2,4}$/.test(init)) return err('Iniziali non valide: 2-4 caratteri, lettere maiuscole o cifre.');
    if (Store.getOperatorByInitials(init)) return err(`Le iniziali ${init} sono già assegnate.`);
    const pinErr = Auth.validatePin(pin);
    if (pinErr) return err(pinErr);
    if (pin !== pin2) return err('I due PIN non coincidono.');

    const admin = await this._requireLeaderAuth('Creazione di un nuovo operatore', { soloAdmin: true });
    if (!admin) return;
    try {
      const fields = await Auth.buildPinFields(pin);
      /* 2.13 — UN ADMIN NASCE CON LA SUA VIA DI FUGA, nella stessa
         scrittura. Generarla dopo lascerebbe un istante — un errore di
         rete, una finestra chiusa — in cui l'Admin esiste e la porta di
         servizio no, ed è esattamente lo stato da cui non si esce. */
      const fuga = role === 'admin' ? Auth.newRecoveryCode() : null;
      const campiFuga = fuga ? await Auth.buildRecoveryFields(fuga) : {};
      const rec = await Store.addOperator({
        first_name: first, last_name: last, initials: init, role, ...fields, ...campiFuga });
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`Operatore ${rec.initials} creato`, 'success');
      if (fuga) this._mostraCodiceRipristino(rec, fuga, { nuovo: true });
    } catch (e) {
      err((e as Error).message || 'Creazione non riuscita.');
    }
  },

  showEditOperatorModal(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    this.showModal(
      `✏️ Modifica operatore — ${this._esc(op.initials)}`,
      `<div class="form-row mb-6">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="opFirst" maxlength="40" value="${this._esc(op.first_name || '')}" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="opLast" maxlength="40" value="${this._esc(op.last_name || '')}"></div>
      </div>
      <div class="form-row mb-6">
        <div class="form-group">
          <label>Iniziali <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="opInitials" maxlength="4" value="${this._esc(op.initials)}" oninput="this.value=this.value.toUpperCase()">
          <div class="text-label-small text-sx-warning mt-2">
            ⚠️ Cambiandole, i movimenti già registrati continueranno a riportare le vecchie
          </div>
        </div>
        <div class="form-group">
          <label>Ruolo <span class="req">*</span></label>
          <select class="input select" id="opRole">
            <option value="operator" ${op.role !== 'leader' && op.role !== 'admin' ? 'selected' : ''}>Operatore</option>
            <option value="leader" ${op.role === 'leader' ? 'selected' : ''}>Team Leader</option>
            <option value="admin" ${op.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
      </div>
      <div id="opFormError" class="gate-error"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doEditOperator('${opId}')">Salva (richiede PIN Admin)</button>`
    );
  },

  async doEditOperator(opId) {
    const err = (m: string) => { const e = $('opFormError'); if (e) e.textContent = m; };
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const first = Validate.clean($('opFirst')?.value);
    const last  = Validate.clean($('opLast')?.value);
    const init  = ($('opInitials')?.value || '').toUpperCase().trim();
    const role  = this._ruoloScelto();
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    if (!/^[A-Z0-9]{2,4}$/.test(init)) return err('Iniziali non valide: 2-4 caratteri, lettere maiuscole o cifre.');
    /* Un Admin è anche un Team Leader: retrocederlo a Operatore toglie
       due cariche in un colpo, e il conto dei leader lo sa già. */
    const comandava = op.role === 'leader' || op.role === 'admin';
    const comanda = role === 'leader' || role === 'admin';
    if (comandava && !comanda && Store.getActiveLeaders().length <= 1) {
      return err('È l’unico Team Leader attivo: nominane un altro prima di retrocederlo.');
    }
    /* 2.1 — E L'ULTIMO ADMIN NON SI RETROCEDE. Chi lo facesse chiuderebbe
       la Configurazione a chiave lasciando la chiave dentro: nominare un
       Admin si fa da lì, e da nessun altro posto. */
    if (op.role === 'admin' && role !== 'admin' && Store.getActiveAdmins().length <= 1) {
      return err('È l’unico Admin attivo: nominane un altro prima di retrocederlo, o la Configurazione non si riapre.');
    }
    const admin = await this._requireLeaderAuth(`Modifica dell’operatore ${op.initials}`, { soloAdmin: true });
    if (!admin) return;
    try {
      /* 2.13 — chi viene PROMOSSO ad Admin riceve la via di fuga nello
         stesso gesto: da quel momento non ha più nessuno sopra di sé, e
         un Admin senza codice è un PIN a un passo dal muro. */
      const promosso = role === 'admin' && op.role !== 'admin';
      const fuga = promosso ? Auth.newRecoveryCode() : null;
      const campiFuga = fuga ? await Auth.buildRecoveryFields(fuga) : {};
      await Store.updateOperator(opId, { first_name: first, last_name: last, initials: init, role, ...campiFuga });
      if (this.currentOperatorRecord?.op_id === opId) this._activateOperator(Store.getOperator(opId));
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`Operatore ${init} aggiornato`, 'success');
      if (fuga) this._mostraCodiceRipristino(Store.getOperator(opId), fuga, { nuovo: true });
    } catch (e) {
      err((e as Error).message || 'Salvataggio non riuscito.');
    }
  },

  async toggleOperatorActive(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const disabling = op.active !== false;
    if (disabling && (op.role === 'leader' || op.role === 'admin') && Store.getActiveLeaders().length <= 1) {
      return this.toast('È l’unico Team Leader attivo: non può essere disattivato', 'error');
    }
    if (disabling && op.role === 'admin' && Store.getActiveAdmins().length <= 1) {
      return this.toast('È l’unico Admin attivo: nominane un altro prima di disattivarlo', 'error');
    }
    if (disabling && !await Dialog.confirm({
      title: 'Disattivare l’operatore?',
      message: 'Non potrà più accedere né comparire nelle liste di scelta. I movimenti che ha firmato restano intatti: un operatore non viene mai eliminato.',
      details: Dialog.kv([['Operatore', `${op.initials} — ${[op.first_name, op.last_name].filter(Boolean).join(' ') || 'dati incompleti'}`]]),
      confirmLabel: 'Disattiva',
      danger: true
    })) return;

    const admin = await this._requireLeaderAuth(
      `${disabling ? 'Disattivazione' : 'Riattivazione'} dell’operatore ${op.initials}`, { soloAdmin: true });
    if (!admin) return;
    await Store.updateOperator(opId, { active: !disabling });
    /* Se si disattiva se stessi si perde il diritto di stare qui: si torna
       al gate, che con l'anagrafica aggiornata chiedera' chi sta lavorando. */
    if (disabling && this.currentOperatorRecord?.op_id === opId) {
      this.currentOperator = null;
      this.currentOperatorRecord = null;
      this._renderOperatorBadge();
      this._openIdentityGate({ initial: true });
    }
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`Operatore ${op.initials} ${disabling ? 'disattivato' : 'riattivato'}`, 'success');
  },

  /* ══ 2.13 · IL RINNOVO SEGUE LA GERARCHIA, E LA TENDINA LO MOSTRA ════
     La tendina non elenca «i Team Leader»: elenca chi può autorizzare il
     rinnovo di QUESTO operatore. Mostrarci un nome che poi la verifica
     rifiuta è il modo di far sembrare un guasto una regola. */
  showRenewPinModal(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    if (!Store.puoRinnovareIlPin(this.currentOperatorRecord, op)) {
      return this.toast(op.role === 'admin'
        ? 'Il PIN di un Admin lo rinnova soltanto un altro Admin'
        : 'Non hai la carica per rinnovare questo PIN', 'error');
    }
    const autorizzatori = Store.autorizzatoriPerIlPin(op);
    if (!autorizzatori.length) {
      return this.toast(op.role === 'admin'
        ? 'Nessun altro Admin con PIN in anagrafica: usa il codice di ripristino dalla schermata di accesso'
        : 'Nessun Team Leader attivo: impossibile autorizzare', 'error');
    }
    const nome = [op.first_name, op.last_name].filter(Boolean).join(' ') || op.initials;
    const carica = op.role === 'admin' ? 'Admin' : 'Team Leader';
    this.showModal(
      `🔑 Rinnovo PIN — ${this._esc(op.initials)}`,
      `<p class="text-body-small text-sx-text-secondary leading-[1.6] mb-7">
        Nuovo PIN per <strong>${this._esc(nome)}</strong>. Il PIN precedente cessa di valere immediatamente.
        L'operazione richiede l'autorizzazione di un <strong>${carica}</strong> e viene registrata nel registro movimenti.
      </p>
      <div class="form-group mb-6">
        <label>① ${carica} che autorizza <span class="req">*</span></label>
        <select class="input select" id="rpLeader">
          ${autorizzatori.map(l => `<option value="${l.op_id}">${this._esc(l.initials)} — ${this._esc([l.first_name, l.last_name].filter(Boolean).join(' ') || 'dati incompleti')}</option>`).join('')}
        </select>
      </div>
      <div class="form-group mb-8">
        <label>PIN di chi autorizza <span class="req">*</span></label>
        <input class="input input-mono gate-pin" id="rpLeaderPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off">
      </div>
      <div class="form-row mb-4">
        <div class="form-group"><label>② Nuovo PIN <span class="req">*</span></label>
          <input class="input input-mono" id="rpNewPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma nuovo PIN <span class="req">*</span></label>
          <input class="input input-mono" id="rpNewPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App.doRenewPin('${opId}')}"></div>
      </div>
      <div id="rpError" class="gate-error"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-warning" onclick="App.doRenewPin('${opId}')">🔑 Rinnova PIN</button>`
    );
    setTimeout(() => $('rpLeaderPin')?.focus(), 80);
  },

  async doRenewPin(opId) {
    const err = (m: string) => { const e = $('rpError'); if (e) e.textContent = m; };
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const leader = Store.getOperator($('rpLeader')?.value);
    const leaderPin = $('rpLeaderPin')?.value || '';
    const newPin = $('rpNewPin')?.value || '';
    const newPin2 = $('rpNewPin2')?.value || '';
    /* 2.13 — la carica si rilegge QUI e non si deduce dalla tendina: fra il
       disegno della maschera e questo istante un altro terminale può aver
       retrocesso chi sta autorizzando. E la regola è una sola, quella dello
       Store: fino alla 2.12 questa riga chiedeva `role !== 'leader'` e
       rifiutava proprio gli Admin, che erano nell'elenco. */
    if (!Store.puoRinnovareIlPin(leader, op)) return err('Autorizzatore non valido per questo operatore.');
    const pinErr = Auth.validatePin(newPin);
    if (pinErr) return err(pinErr);
    if (newPin !== newPin2) return err('I due PIN non coincidono.');

    try {
      /* ── Col servizio il rinnovo NON è una scrittura come le altre ────
         La collezione `operators` è chiusa a chi non è Admin, ed è giusto
         così: un Team Leader non deve poter nominare nessuno. Ma il PIN lo
         rinnova, e allora il gesto ha una rotta sua, dove è il servizio a
         verificare chi autorizza e su chi. Da file non c'è nessun servizio:
         si verifica qui e si scrive qui, come si è sempre fatto. */
      if (Persistence.kind === 'remote' && Persistence.rinnovaPin) {
        const r = await Persistence.rinnovaPin({
          op_id: opId,
          autorizzatore_id: leader!.op_id,
          pin_autorizzatore: leaderPin,
          nuovo_pin: newPin,
        });
        if (!r?.ok) return err('Rinnovo non riuscito.');
        /* Solo la cache: il database l'ha già scritto il servizio, e una
           PATCH su `operators` è proprio ciò che a un Team Leader viene
           rifiutato — vedi `Store.segnaPinImpostato`. */
        Store.segnaPinImpostato(opId);
      } else {
        if (!await Auth.verifyPin(leader, leaderPin)) return err('PIN di chi autorizza non corretto.');
        const fields = await Auth.buildPinFields(newPin);
        await Store.updateOperator(opId, fields);
      }
      /* A registro finisce l'EVENTO, non il segreto. */
      await this._logMov(MOV.PINRESET, '', '', '', '', null, leader!.initials,
        `PIN di ${op.initials} rinnovato da ${leader!.initials}`);
      if (this.currentOperatorRecord?.op_id === opId) this._activateOperator(Store.getOperator(opId));
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`🔑 PIN di ${op.initials} rinnovato — autorizzato da ${leader!.initials}`, 'success');
    } catch (e) {
      const stato = (e as { status?: number }).status;
      if (stato === 401) return err('PIN di chi autorizza non corretto.');
      if (stato === 403) return err('Carica insufficiente per rinnovare questo PIN.');
      if (stato === 429) return err('Troppi tentativi: attendere un minuto.');
      err((e as Error).message || 'Rinnovo non riuscito.');
    }
  },

  /* ══ 2.13 · IL CODICE SI MOSTRA UNA VOLTA, E LA PAGINA LO DICE ═══════
     Non è un avviso da chiudere con un clic distratto: è l'unico istante
     in cui quel codice esiste in un posto leggibile. Perciò la finestra
     non si chiude sul fondo, ha un tasto per stampare e uno per copiare,
     e per uscire bisogna spuntare che lo si è messo al sicuro. */
  _mostraCodiceRipristino(op, codice: string, { nuovo = false } = {}) {
    if (!op) return;
    const nome = [op.first_name, op.last_name].filter(Boolean).join(' ') || op.initials;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay gate-overlay';
    overlay.id = 'codiceRipristinoOverlay';
    overlay.innerHTML = `
      <div class="modal max-w-[520px]">
        <div class="modal-header"><h2>🗝 Codice di ripristino — ${this._esc(op.initials)}</h2></div>
        <div class="modal-body">
          <div class="mov-preview mov-preview-warn mb-7 leading-[1.6]">
            <strong>Questa schermata non si ripresenta.</strong> Il codice qui sotto
            non è conservato in chiaro da nessuna parte: sul disco resta solo la sua
            impronta, esattamente come per il PIN. Stampalo o trascrivilo adesso, e
            mettilo dove si mettono le chiavi.
          </div>
          <p class="text-body-small text-sx-text-secondary leading-[1.6] mb-6">
            Serve a <strong>${this._esc(nome)}</strong> per rientrare se perde il PIN e
            non c'è un altro Admin che possa rinnovarglielo. Si inserisce dalla
            schermata di accesso, alla voce «PIN smarrito». Vale una volta sola:
            usandolo si riscrive il PIN e nasce subito un codice nuovo.
            ${nuovo ? '' : '<br><strong>Il codice precedente, da adesso, non vale più.</strong>'}
          </p>
          <div class="mono text-title-large text-center font-bold tracking-[.08em] select-all
                      border border-sx-primary rounded-[var(--radius-md)] py-6 px-4 mb-6"
               id="codiceRipristinoTesto">${this._esc(codice)}</div>
          <label class="text-body-small flex items-center gap-3">
            <input type="checkbox" id="codiceCustodito"> L'ho stampato o trascritto e messo al sicuro
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn" id="codiceStampa">🖨 Stampa</button>
          <button class="btn" id="codiceCopia">Copia</button>
          <button class="btn btn-primary" id="codiceChiudi" disabled>Ho finito</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const dentro = (sel: string) => overlay.querySelector(sel) as HTMLElement;
    const chiudi = dentro('#codiceChiudi') as HTMLButtonElement;
    (dentro('#codiceCustodito') as HTMLInputElement).onchange = (e) => {
      chiudi.disabled = !(e.target as HTMLInputElement).checked;
    };
    dentro('#codiceCopia').onclick = async () => {
      try {
        await navigator.clipboard.writeText(codice);
        this.toast('Codice copiato negli appunti', 'success');
      } catch {
        /* Senza permesso agli appunti resta la selezione: il testo è
           `select-all`, e un triplo clic lo prende tutto. */
        this.toast('Appunti non disponibili: selezionalo e copialo a mano', 'warning');
      }
    };
    dentro('#codiceStampa').onclick = () => this._stampaCodiceRipristino(op, codice);
    chiudi.onclick = () => overlay.remove();
  },

  /* La stampa è un foglio suo, e non la pagina dell'applicativo: quel che
     finisce in cassaforte deve dirsi da solo, sei mesi dopo, a chi non
     ricorda da dove è uscito. */
  _stampaCodiceRipristino(op, codice: string) {
    const nome = [op.first_name, op.last_name].filter(Boolean).join(' ') || op.initials;
    const w = window.open('', '_blank', 'width=720,height=520');
    if (!w) return this.toast('La stampa richiede di consentire le finestre pop-up', 'warning');
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8">
      <title>Codice di ripristino — ${this._esc(op.initials)}</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 40px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #555; font-size: 13px; margin-bottom: 28px; }
        .codice { font-family: ui-monospace, Consolas, monospace; font-size: 30px;
                  letter-spacing: .1em; font-weight: 700; text-align: center;
                  border: 2px solid #111; border-radius: 8px; padding: 22px; margin: 24px 0; }
        p { font-size: 13px; line-height: 1.6; }
        .riga { border-top: 1px solid #bbb; margin-top: 36px; padding-top: 10px; font-size: 11px; color: #666; }
      </style></head><body>
      <h1>Pathfinder — codice di ripristino Admin</h1>
      <div class="sub">${this._esc(nome)} · sigla ${this._esc(op.initials)} · emesso il ${new Date().toLocaleString('it-IT')}</div>
      <div class="codice">${this._esc(codice)}</div>
      <p><strong>A cosa serve.</strong> Rientrare in Pathfinder quando il PIN di questo Admin
      è perso e non c'è un altro Admin che possa rinnovarlo. Si inserisce dalla schermata
      di accesso, alla voce «PIN smarrito».</p>
      <p><strong>Vale una volta sola.</strong> Usandolo si riscrive il PIN e viene emesso un
      codice nuovo, che prende il posto di questo foglio.</p>
      <p><strong>Custodirlo come una chiave.</strong> Chi ha questo codice può riscrivere il PIN
      di questo Admin, e quindi entrare al posto suo.</p>
      <div class="riga">Pathfinder — Dietopack S.r.l. (Naturacare Group) · uso interno</div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  },

  /* Rigenerare è un gesto dell'Admin su un Admin, e chiede il PIN come
     ogni altro: chi passa davanti a un terminale aperto non deve poter
     stampare la chiave di casa. */
  async rigeneraCodiceRipristino(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    if (op.role !== 'admin') return this.toast('Il codice di ripristino esiste solo per gli Admin', 'error');
    const aveva = Store.haCodiceRipristino(op);
    if (aveva && !await Dialog.confirm({
      title: 'Generare un codice nuovo?',
      message: 'Il codice attualmente in cassaforte smetterà di valere nell’istante in cui il nuovo viene generato. Se il foglio vecchio è ancora l’unica copia, distruggilo.',
      details: Dialog.kv([['Admin', `${op.initials} — ${[op.first_name, op.last_name].filter(Boolean).join(' ') || 'dati incompleti'}`]]),
      confirmLabel: 'Genera il nuovo',
      danger: true
    })) return;

    const admin = await this._requireLeaderAuth(
      `${aveva ? 'Rigenerazione' : 'Generazione'} del codice di ripristino di ${op.initials}`, { soloAdmin: true });
    if (!admin) return;
    try {
      const codice = Auth.newRecoveryCode();
      await Store.updateOperator(opId, await Auth.buildRecoveryFields(codice));
      await this._logMov(MOV.PINRESET, '', '', '', '', null, admin.initials,
        `Codice di ripristino di ${op.initials} ${aveva ? 'rigenerato' : 'generato'} da ${admin.initials}`);
      this.renderConfig();
      this.updateSyncIndicator();
      this._mostraCodiceRipristino(Store.getOperator(opId), codice, { nuovo: !aveva });
    } catch (e) {
      this.toast((e as Error).message || 'Generazione non riuscita', 'error');
    }
  },

  /* 2.1 — la tendina ha tre voci e si legge in un posto solo: due letture
     diverse della stessa tendina sono il modo di far sparire una carica. */
  _ruoloScelto(): 'operator' | 'leader' | 'admin' {
    const v = $('opRole')?.value;
    return v === 'admin' ? 'admin' : v === 'leader' ? 'leader' : 'operator';
  },

  /* 2.1 — LO STESSO VARCO, CON DUE SOGLIE. `soloAdmin` lo alza al ruolo
     che apre la Configurazione e il reset: una seconda finestra copiata da
     questa sarebbe la stessa maschera con un elenco diverso, e la prima
     volta che una delle due cambia le due smettono di somigliarsi. */
  _requireLeaderAuth(azione: string, opzioni: { soloAdmin?: boolean } = {}) {
    /* 2.13 — L'ECCEZIONE DEL PRIMO GIORNO VALE ANCHE QUI, e deve: finché
       nessun Admin esiste `Store.comandaLaConfigurazione` lascia le chiavi
       ai Team Leader, e se questa maschera non seguisse la stessa regola
       aprirebbe una Configurazione in cui ogni gesto viene poi rifiutato
       per mancanza di un autorizzatore che non esiste ancora. */
    const soloAdmin = opzioni.soloAdmin === true && Store.getActiveAdmins().length > 0;
    const leaders = soloAdmin ? Store.getUsableAdmins() : Store.getUsableLeaders();
    if (!leaders.length) {
      this.toast(soloAdmin
        ? 'Nessun Admin con PIN in anagrafica: nominane uno da Configurazione → Operatori'
        : 'Nessun Team Leader attivo: operazione non autorizzabile', 'error');
      return Promise.resolve(null);
    }
    return new Promise<Operatore | null>((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay gate-overlay';
      overlay.id = 'leaderAuthOverlay';
      overlay.innerHTML = `
        <div class="modal max-w-[400px]">
          <div class="modal-header"><h2>${soloAdmin ? '🛡 Autorizzazione Admin' : '👑 Autorizzazione Team Leader'}</h2></div>
          <div class="modal-body">
            <p class="text-body-small text-sx-text-secondary mb-7">${this._esc(azione)}</p>
            <div class="form-group mb-6">
              <label>${soloAdmin ? 'Admin' : 'Team Leader'}</label>
              <select class="input select" id="laWho">
                ${leaders.map(l => `<option value="${l.op_id}">${this._esc(l.initials)} — ${this._esc([l.first_name, l.last_name].filter(Boolean).join(' ') || 'dati incompleti')}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>PIN</label>
              <input class="input input-mono gate-pin" id="laPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off">
            </div>
            <div id="laError" class="gate-error"></div>
          </div>
          <div class="modal-footer">
            <button class="btn" id="laCancel">Annulla</button>
            <button class="btn btn-primary" id="laOk">Autorizza</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      /* La finestra ha un id suo e vive fuori da `Dialog`: i suoi campi si
         cercano dentro di lei, non per id globale — due finestre aperte
         insieme si ruberebbero gli elementi. */
      const dentro = (sel: string) => overlay.querySelector(sel) as HTMLInputElement;
      const close = (value: Operatore | null) => { overlay.remove(); resolve(value); };
      const attempt = async () => {
        const l = Store.getOperator(dentro('#laWho').value);
        const pin = dentro('#laPin').value || '';
        if (l && await Auth.verifyPin(l, pin)) return close(l);
        dentro('#laError').textContent = 'PIN non corretto.';
        dentro('#laPin').value = '';
        dentro('#laPin').focus();
      };
      dentro('#laCancel').onclick = () => close(null);
      dentro('#laOk').onclick = attempt;
      dentro('#laPin').onkeydown = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); attempt(); } };
      setTimeout(() => dentro('#laPin')?.focus(), 80);
    });
  },
} satisfies Vista;
