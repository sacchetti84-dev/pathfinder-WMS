import { type Vista, $ } from './vista';
import { MOV } from '../../core/costanti';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Auth } from '../../modules/auth';
import { Session } from '../../modules/session';
import { Dialog } from '../dialog.js';

export const VistaConfigOperatori: Vista = {
  _renderConfigOperators(el) {
    const ops = Store.getOperators();
    const leaders = Store.getActiveLeaders();
    const rows = ops.map(o => {
      const nome = [o.first_name, o.last_name].filter(Boolean).join(' ');
      const inactive = o.active === false;
      return `<tr${inactive ? ' class="opacity-55"' : ''}>
        <td><span class="mono font-bold text-sx-primary">${this._esc(o.initials)}</span></td>
        <td>${nome ? this._esc(nome) : '<span class="text-sx-warning italic">da completare</span>'}</td>
        <td>${o.role === 'leader'
              ? '<span class="badge badge-blue">👑 Team Leader</span>'
              : '<span class="badge badge-muted">Operatore</span>'}</td>
        <td>${o.pin_hash
              ? '<span class="badge badge-green">impostato</span>'
              : '<span class="badge badge-amber">mancante</span>'}</td>
        <td>${inactive ? '<span class="badge badge-red">disattivato</span>' : '<span class="badge badge-green">attivo</span>'}</td>
        <td class="whitespace-nowrap">
          <button class="btn btn-sm" onclick="App.showEditOperatorModal('${o.op_id}')" title="Modifica dati e ruolo">✏</button>
          <button class="btn btn-sm btn-warning" onclick="App.showRenewPinModal('${o.op_id}')" title="Rinnova il PIN (serve un Team Leader)">🔑</button>
          ${inactive
            ? `<button class="btn btn-sm btn-success" onclick="App.toggleOperatorActive('${o.op_id}')" title="Riattiva">✓</button>`
            : `<button class="btn btn-sm btn-danger" onclick="App.toggleOperatorActive('${o.op_id}')" title="Disattiva">⊘</button>`}
        </td>
      </tr>`;
    }).join('');

    el.innerHTML = `<div class="config-card">
      <h3>Anagrafica Operatori
        <button class="btn btn-sm btn-primary float-right" onclick="App.showAddOperatorModal()">+ Nuovo operatore</button></h3>
      <div class="overflow-x-auto">
        <table class="sx-table">
          <thead><tr><th class="w-[80px]">Iniziali</th><th>Nome e cognome</th><th class="w-[150px]">Ruolo</th><th class="w-[110px]">PIN</th><th class="w-[110px]">Stato</th><th class="w-[140px]">Azioni</th></tr></thead>
          <tbody>${rows || '<tr><td class="text-center text-sx-text-muted italic" colspan="6">Nessun operatore</td></tr>'}</tbody>
        </table>
      </div>
      <div class="bg-[var(--grad-soft-green)] border border-sx-success rounded-[var(--radius-md)] py-6 px-7.5 mt-7">
        <div class="font-bold text-body-small text-sx-success mb-3">🔒 Come funzionano PIN e ruoli</div>
        <p class="text-body-small text-sx-text-secondary leading-[1.6]">
          Il PIN è di <strong>6 cifre</strong> e non viene mai conservato in chiaro: sul disco resta solo la sua
          impronta crittografica con un sale casuale, e lo stesso vale per i backup JSON.
          Un PIN smarrito <strong>non è recuperabile</strong> — si rinnova, e il rinnovo lo autorizza un
          <strong>Team Leader</strong> con il proprio PIN. L'operazione finisce nel registro movimenti;
          il PIN no, né in chiaro né come impronta.<br>
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
          </select>
          <div class="text-label-small text-sx-text-muted mt-2">Solo i Team Leader rinnovano i PIN</div>
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
       <button class="btn btn-primary" onclick="App.doAddOperator()">Crea (richiede PIN Team Leader)</button>`
    );
  },

  async doAddOperator() {
    const err = (m: any) => { const e = $('opFormError'); if (e) e.textContent = m; };
    const first = Validate.clean($('opFirst')?.value);
    const last  = Validate.clean($('opLast')?.value);
    const init  = ($('opInitials')?.value || '').toUpperCase().trim();
    const role  = $('opRole')?.value === 'leader' ? 'leader' : 'operator';
    const pin   = $('opPin')?.value || '';
    const pin2  = $('opPin2')?.value || '';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    if (!/^[A-Z0-9]{2,4}$/.test(init)) return err('Iniziali non valide: 2-4 caratteri, lettere maiuscole o cifre.');
    if (Store.getOperatorByInitials(init)) return err(`Le iniziali ${init} sono già assegnate.`);
    const pinErr = Auth.validatePin(pin);
    if (pinErr) return err(pinErr);
    if (pin !== pin2) return err('I due PIN non coincidono.');

    const leader = await this._requireLeaderAuth('Creazione di un nuovo operatore');
    if (!leader) return;
    try {
      const fields = await Auth.buildPinFields(pin);
      const rec = await Store.addOperator({ first_name: first, last_name: last, initials: init, role, ...fields });
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`Operatore ${rec.initials} creato`, 'success');
    } catch (e: any) {
      err(e.message || 'Creazione non riuscita.');
    }
  },

  showEditOperatorModal(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    this.showModal(
      `✏ Modifica operatore — ${this._esc(op.initials)}`,
      `<div class="form-row mb-6">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="opFirst" maxlength="40" value="${this._esc(op.first_name || '')}" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="opLast" maxlength="40" value="${this._esc(op.last_name || '')}"></div>
      </div>
      <div class="form-row mb-6">
        <div class="form-group">
          <label>Iniziali <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="opInitials" maxlength="4" value="${this._esc(op.initials)}" oninput="this.value=this.value.toUpperCase()">
          <div class="text-label-small text-sx-warning mt-2">
            ⚠ Cambiandole, i movimenti già registrati continueranno a riportare le vecchie
          </div>
        </div>
        <div class="form-group">
          <label>Ruolo <span class="req">*</span></label>
          <select class="input select" id="opRole">
            <option value="operator" ${op.role !== 'leader' ? 'selected' : ''}>Operatore</option>
            <option value="leader" ${op.role === 'leader' ? 'selected' : ''}>Team Leader</option>
          </select>
        </div>
      </div>
      <div id="opFormError" class="gate-error"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.doEditOperator('${opId}')">Salva (richiede PIN Team Leader)</button>`
    );
  },

  async doEditOperator(opId) {
    const err = (m: any) => { const e = $('opFormError'); if (e) e.textContent = m; };
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const first = Validate.clean($('opFirst')?.value);
    const last  = Validate.clean($('opLast')?.value);
    const init  = ($('opInitials')?.value || '').toUpperCase().trim();
    const role  = $('opRole')?.value === 'leader' ? 'leader' : 'operator';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    if (!/^[A-Z0-9]{2,4}$/.test(init)) return err('Iniziali non valide: 2-4 caratteri, lettere maiuscole o cifre.');
    if (op.role === 'leader' && role !== 'leader' && Store.getActiveLeaders().length <= 1) {
      return err('È l’unico Team Leader attivo: nominane un altro prima di retrocederlo.');
    }
    const leader = await this._requireLeaderAuth(`Modifica dell’operatore ${op.initials}`);
    if (!leader) return;
    try {
      await Store.updateOperator(opId, { first_name: first, last_name: last, initials: init, role });
      if (this.currentOperatorRecord?.op_id === opId) this._activateOperator(Store.getOperator(opId));
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`Operatore ${init} aggiornato`, 'success');
    } catch (e: any) {
      err(e.message || 'Salvataggio non riuscito.');
    }
  },

  async toggleOperatorActive(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const disabling = op.active !== false;
    if (disabling && op.role === 'leader' && Store.getActiveLeaders().length <= 1) {
      return this.toast('È l’unico Team Leader attivo: non può essere disattivato', 'error');
    }
    if (disabling && !await Dialog.confirm({
      title: 'Disattivare l’operatore?',
      message: 'Non potrà più accedere né comparire nelle liste di scelta. I movimenti che ha firmato restano intatti: un operatore non viene mai eliminato.',
      details: Dialog.kv([['Operatore', `${op.initials} — ${[op.first_name, op.last_name].filter(Boolean).join(' ') || 'dati incompleti'}`]]),
      confirmLabel: 'Disattiva',
      danger: true
    })) return;

    const leader = await this._requireLeaderAuth(`${disabling ? 'Disattivazione' : 'Riattivazione'} dell’operatore ${op.initials}`);
    if (!leader) return;
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

  showRenewPinModal(opId) {
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const leaders = Store.getUsableLeaders();
    if (!leaders.length) return this.toast('Nessun Team Leader attivo: impossibile autorizzare', 'error');
    const nome = [op.first_name, op.last_name].filter(Boolean).join(' ') || op.initials;
    this.showModal(
      `🔑 Rinnovo PIN — ${this._esc(op.initials)}`,
      `<p class="text-body-small text-sx-text-secondary leading-[1.6] mb-7">
        Nuovo PIN per <strong>${this._esc(nome)}</strong>. Il PIN precedente cessa di valere immediatamente.
        L'operazione richiede l'autorizzazione di un <strong>Team Leader</strong> e viene registrata nel registro movimenti.
      </p>
      <div class="form-group mb-6">
        <label>① Team Leader che autorizza <span class="req">*</span></label>
        <select class="input select" id="rpLeader">
          ${leaders.map(l => `<option value="${l.op_id}">${this._esc(l.initials)} — ${this._esc([l.first_name, l.last_name].filter(Boolean).join(' ') || 'dati incompleti')}</option>`).join('')}
        </select>
      </div>
      <div class="form-group mb-8">
        <label>PIN del Team Leader <span class="req">*</span></label>
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
    const err = (m: any) => { const e = $('rpError'); if (e) e.textContent = m; };
    const op = Store.getOperator(opId);
    if (!op) return this.toast('Operatore non trovato', 'error');
    const leader = Store.getOperator($('rpLeader')?.value);
    const leaderPin = $('rpLeaderPin')?.value || '';
    const newPin = $('rpNewPin')?.value || '';
    const newPin2 = $('rpNewPin2')?.value || '';
    if (!leader || leader.role !== 'leader' || leader.active === false) return err('Autorizzatore non valido.');
    const pinErr = Auth.validatePin(newPin);
    if (pinErr) return err(pinErr);
    if (newPin !== newPin2) return err('I due PIN non coincidono.');
    if (!await Auth.verifyPin(leader, leaderPin)) return err('PIN del Team Leader non corretto.');

    try {
      const fields = await Auth.buildPinFields(newPin);
      await Store.updateOperator(opId, fields);
      /* A registro finisce l'EVENTO, non il segreto. */
      await this._logMov(MOV.PINRESET, '', '', '', '', null, leader.initials,
        `PIN di ${op.initials} rinnovato da ${leader.initials}`);
      if (this.currentOperatorRecord?.op_id === opId) this._activateOperator(Store.getOperator(opId));
      this.closeModal();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`🔑 PIN di ${op.initials} rinnovato — autorizzato da ${leader.initials}`, 'success');
    } catch (e: any) {
      err(e.message || 'Rinnovo non riuscito.');
    }
  },

  _requireLeaderAuth(azione) {
    const leaders = Store.getUsableLeaders();
    if (!leaders.length) {
      this.toast('Nessun Team Leader attivo: operazione non autorizzabile', 'error');
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay gate-overlay';
      overlay.id = 'leaderAuthOverlay';
      overlay.innerHTML = `
        <div class="modal max-w-[400px]">
          <div class="modal-header"><h2>👑 Autorizzazione Team Leader</h2></div>
          <div class="modal-body">
            <p class="text-body-small text-sx-text-secondary mb-7">${this._esc(azione)}</p>
            <div class="form-group mb-6">
              <label>Team Leader</label>
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
      const close = (value: any) => { overlay.remove(); resolve(value); };
      const attempt = async () => {
        const l = Store.getOperator((overlay.querySelector as any)('#laWho').value);
        const pin = (overlay.querySelector as any)('#laPin').value || '';
        if (l && await Auth.verifyPin(l, pin)) return close(l);
        (overlay.querySelector as any)('#laError').textContent = 'PIN non corretto.';
        (overlay.querySelector as any)('#laPin').value = '';
        (overlay.querySelector as any)('#laPin').focus();
      };
      (overlay.querySelector as any)('#laCancel').onclick = () => close(null);
      (overlay.querySelector as any)('#laOk').onclick = attempt;
      (overlay.querySelector as any)('#laPin').onkeydown = (e: any) => { if (e.key === 'Enter') { e.preventDefault(); attempt(); } };
      setTimeout(() => (overlay.querySelector as any)('#laPin')?.focus(), 80);
    });
  },
};
