import { type Vista, $ } from './vista';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Dialog } from '../dialog.js';

export const VistaConfigSiti: Vista = {
  _renderConfigSites(el) {
    const sites = Store.getSites();
    let html = `<div class="config-card">
      <h3>Siti di Stoccaggio <button class="btn btn-sm btn-primary float-right" onclick="App.showAddSiteModal()">+ Nuovo Sito</button></h3>
      <div class="overflow-x-auto">
      <table class="sx-table">
        <thead><tr><th>Codice</th><th>Nome</th><th>Tipo</th><th>Zone</th><th>Ubic.</th><th class="w-[180px]">Azioni</th></tr></thead><tbody>`;
    for (const site of sites) {
      const zones = (site.zones || []).filter(z => z.active);
      const stats = Store.getSiteStats(site.id);
      html += `<tr>
        <td><span class="mono font-bold text-sx-primary">${this._esc(site.id)}</span></td>
        <td>${this._esc(site.name)}</td>
        <td><span class="badge ${site.type === 'proprio' ? 'badge-blue' : 'badge-amber'}">${this._esc(site.type)}</span></td>
        <td>${zones.length}</td>
        <td>${stats.total}</td>
        <td class="whitespace-nowrap">
          <button class="btn btn-sm" onclick="App.showEditSiteModal('${site.id}')" title="Modifica">✏</button>
          <button class="btn btn-sm" onclick="App.showAddZoneModal('${site.id}')" title="Aggiungi zona">+ Zona</button>
          <button class="btn btn-sm btn-danger" onclick="App.confirmDeleteSite('${site.id}')" title="Elimina">🗑</button>
        </td>
      </tr>`;
      for (const zone of zones) {
        const dim = zone.type === 'RACK' ? `${zone.aisles}c × ${zone.bays_per_aisle}b × ${((zone!.levels as any[]) as any[])?.length || 1}l` :
          zone.type === 'FLOOR' ? `${zone.rows}f × ${zone.positions_per_row}p` : `${zone.positions} pos`;
        html += `<tr class="bg-sx-accent-soft">
          <td></td>
          <td class="pl-12.5">↳ <span class="badge ${zone.type === 'RACK' ? 'badge-blue' : zone.type === 'FLOOR' ? 'badge-green' : 'badge-amber'}">${zone.type}</span> ${this._esc(zone.name)}</td>
          <td class="mono text-body-small text-sx-text-muted">${dim}</td>
          <td colspan="2">${Store.getZoneStats(site.id, zone.id).total}</td>
          <td class="whitespace-nowrap">
            <button class="btn btn-sm" onclick="App.showEditZoneModal('${site.id}','${zone.id}')">✏</button>
            <button class="btn btn-sm btn-danger" onclick="App.confirmDeleteZone('${site.id}','${zone.id}')">🗑</button>
          </td>
        </tr>`;
      }
    }
    html += '</tbody></table></div></div>';
    el.innerHTML = html;
  },  showAddSiteModal() {
    this.showModal('Nuovo Sito di Stoccaggio', `
      <div class="form-group mb-6"><label>Codice Sito (2-4 car.) <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="newSiteId" placeholder="Es: MOP1, UNT" maxlength="${Validate.MAX.SITE_ID}"></div>
      <div class="form-group mb-6"><label>Nome <span class="req">*</span></label>
        <input class="input" id="newSiteName" placeholder="Es: Magazzino Operativo 1" maxlength="${Validate.MAX.SITE_NAME}"></div>
      <div class="form-row mb-6">
        <div class="form-group"><label>Tipo</label>
          <select class="select" id="newSiteType"><option value="proprio">Proprio</option><option value="terzista">Terzista</option></select></div>
        <div class="form-group"><label>Indirizzo</label>
          <input class="input" id="newSiteAddress" placeholder="Opzionale" maxlength="120"></div>
      </div>
      <div class="form-group"><label>Note</label>
        <input class="input" id="newSiteNotes" placeholder="Opzionale" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doAddSite()">Crea Sito</button>`);
  },

  async doAddSite() {
    const id = Validate.clean($('newSiteId').value, true);
    const name = Validate.clean($('newSiteName').value);
    const errs = [Validate.siteId(id), Validate.siteName(name)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    const ok = await Store.addSite({
      id, name,
      type: $('newSiteType').value,
      address: Validate.clean($('newSiteAddress').value),
      notes: Validate.clean($('newSiteNotes').value)
    });
    if (!ok) return this.toast('Codice sito già esistente', 'error');
    this.closeModal();
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Sito ${id} creato`, 'success');
  },

  showEditSiteModal(siteId) {
    const site = Store.getSite(siteId);
    if (!site) return;
    this.showModal(`Modifica Sito — ${siteId}`, `
      <div class="form-group mb-6"><label>Codice (non modificabile)</label>
        <input class="input input-mono" value="${this._esc(siteId)}" disabled></div>
      <div class="form-group mb-6"><label>Nome <span class="req">*</span></label>
        <input class="input" id="editSiteName" value="${this._esc(site.name)}" maxlength="${Validate.MAX.SITE_NAME}"></div>
      <div class="form-row mb-6">
        <div class="form-group"><label>Tipo</label>
          <select class="select" id="editSiteType">
            <option value="proprio" ${site.type === 'proprio' ? 'selected' : ''}>Proprio</option>
            <option value="terzista" ${site.type === 'terzista' ? 'selected' : ''}>Terzista</option>
          </select></div>
        <div class="form-group"><label>Indirizzo</label>
          <input class="input" id="editSiteAddress" value="${this._esc(site.address || '')}" maxlength="120"></div>
      </div>
      <div class="form-group"><label>Note</label>
        <input class="input" id="editSiteNotes" value="${this._esc(site.notes || '')}" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doEditSite('${siteId}')">Salva</button>`);
  },

  async doEditSite(siteId) {
    const name = Validate.clean($('editSiteName')?.value);
    const err = Validate.siteName(name);
    if (err) return this.toast(err, 'error');
    await Store.updateSite(siteId, {
      name,
      type: $('editSiteType')?.value || 'proprio',
      address: Validate.clean($('editSiteAddress')?.value),
      notes: Validate.clean($('editSiteNotes')?.value)
    });
    this.closeModal();
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Sito ${siteId} aggiornato`, 'success');
  },

  async confirmDeleteSite(siteId) {
    if (!await Dialog.confirm({
      title: 'Eliminare il sito?',
      message: 'Tutti i dati di inventario associati saranno rimossi. Operazione irreversibile.',
      details: Dialog.kv([['Sito', siteId]]),
      confirmLabel: 'Elimina sito', danger: true
    })) return;
    if (!await Dialog.confirm({
      title: 'Conferma definitiva',
      message: `Si eliminano anche tutti gli item e gli status delle ubicazioni di ${siteId}.`,
      confirmLabel: 'Elimina definitivamente', danger: true
    })) return;
    await Store.deleteSite(siteId);
    if (this.currentSite === siteId) { this.currentSite = null; this.currentZone = null; }
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`Sito ${siteId} eliminato`, 'success');
  },

  showAddZoneModal(siteId) {
    this._editingSiteId = siteId;
    this.showModal(`Nuova Zona in ${siteId}`, `
      <div class="form-row mb-6">
        <div class="form-group"><label>Codice Zona <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="newZoneId" placeholder="Es: A, B, BULK1" maxlength="${Validate.MAX.ZONE_ID}"></div>
        <div class="form-group"><label>Tipo</label>
          <select class="select" id="newZoneType" onchange="App.updateZoneFields()">
            <option value="RACK">RACK — Scaffalature</option>
            <option value="FLOOR">FLOOR — Stoccaggio a terra</option>
            <option value="BULK">BULK — Area libera</option>
          </select></div>
      </div>
      <div class="form-group mb-6"><label>Nome <span class="req">*</span></label>
        <input class="input" id="newZoneName" placeholder="Es: Zona Rack MP" maxlength="${Validate.MAX.ZONE_NAME}"></div>
      <div id="zoneTypeFields"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doAddZone('${siteId}')">Crea Zona</button>`);
    this.updateZoneFields();
  },

  updateZoneFields() {
    const type = $('newZoneType').value;
    const el = $('zoneTypeFields');
    const fields = {
      RACK: `<div class="form-row mb-6">
        <div class="form-group"><label>Corsie</label><input class="input" id="zfAisles" type="number" min="1" max="99" value="5"></div>
        <div class="form-group"><label>Campate/corsia</label><input class="input" id="zfBays" type="number" min="1" max="99" value="10"></div>
      </div>
      <div class="form-group mb-6"><label>Livelli (virgola)</label><input class="input input-mono" id="zfLevels" value="T,A,B,C,D" placeholder="T,A,B,C,D"></div>
      <div class="form-group"><label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
        <input class="w-[16px] h-[16px] cursor-pointer" type="checkbox" id="zfMirror">
        <span>Vista frontale specchiata (campate dx → sx)</span>
      </label>
      <div class="text-label-small text-sx-text-muted mt-2 pl-14">💡 Per chi lavora dal lato opposto alla numerazione delle campate</div></div>`,
      FLOOR: `<div class="form-row">
        <div class="form-group"><label>File</label><input class="input" id="zfRows" type="number" min="1" max="99" value="4"></div>
        <div class="form-group"><label>Posizioni/fila</label><input class="input" id="zfPosPerRow" type="number" min="1" max="99" value="8"></div>
      </div>`,
      BULK: `<div class="form-row">
        <div class="form-group"><label>N° Posizioni</label><input class="input" id="zfPositions" type="number" min="1" max="999" value="20"></div>
        <div class="form-group"><label>Colonne griglia</label><input class="input" id="zfGridCols" type="number" min="1" max="20" value="5"></div>
      </div>`
    };
    el.innerHTML = (fields as any)[type] || '';
  },

  async doAddZone(siteId) {
    const id = Validate.clean($('newZoneId').value, true);
    const name = Validate.clean($('newZoneName').value);
    const type = $('newZoneType').value;
    const errs = [Validate.zoneId(id), Validate.siteName(name)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    const zone: any = { id, name, type };
    if (type === 'RACK') {
      zone.aisles = Math.max(1, Math.min(99, parseInt($('zfAisles').value) || 1));
      zone.bays_per_aisle = Math.max(1, Math.min(99, parseInt($('zfBays').value) || 1));
      (zone!.levels as any[]) = Validate.clean($('zfLevels').value, true).split(',').map(s => s.trim()).filter(Boolean);
      if (!(zone!.levels as any[]).length) (zone!.levels as any[]) = ['T'];
      zone.mirror_frontal = $('zfMirror')?.checked === true;
    } else if (type === 'FLOOR') {
      zone.rows = Math.max(1, Math.min(99, parseInt($('zfRows').value) || 1));
      zone.positions_per_row = Math.max(1, Math.min(99, parseInt($('zfPosPerRow').value) || 1));
    } else {
      zone.positions = Math.max(1, Math.min(999, parseInt($('zfPositions').value) || 1));
      zone.grid_cols = Math.max(1, Math.min(20, parseInt($('zfGridCols').value) || 5));
    }
    const ok = await Store.addZone(siteId, zone);
    if (!ok) return this.toast('Codice zona già esistente in questo sito', 'error');
    this.closeModal();
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Zona ${id} creata in ${siteId}`, 'success');
  },

  /* 1.4.0 — La destinazione d'uso della zona: e' la meta' contro cui si
     verificano gli attributi dell'articolo. Senza questa, nessuna
     segnalazione puo' comparire sulla mappa, per quanti articoli si
     classifichino. */
  _campiDestinazioneZona(zone) {
    const attuale = zone?.temp_class || '';
    const riservata = zone?.allergen_zone === true;
    const scelti = new Set(zone?.allergens || []);
    const opzioni = Store.getClassiConservazione().map(c =>
      `<option value="${c.code}" ${attuale === c.code ? 'selected' : ''}>${this._esc(c.label)}</option>`
    ).join('');
    const caselle = Store.getAllergeniAmmessi().map(a =>
      `<label class="all-chip ${scelti.has(a.code) ? 'on' : ''}">
        <input type="checkbox" id="ezAll_${a.code}" ${scelti.has(a.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(a.label)}</label>`
    ).join('');
    /* 1.6 — IL TERZO ATTRIBUTO DI DESTINAZIONE D'USO, D19. Si imposta sulla
       zona come gli altri due e scende a tutte le sue celle: un gesto solo,
       e il motore di verifica legge dove legge gia'. */
    const pericolosa = zone?.hazard_zone === true;
    const pericoli = Store.getPericoli();
    const hazScelti = new Set(zone?.hazards || []);
    const hazCaselle = pericoli.map(h =>
      `<label class="all-chip ${hazScelti.has(h.code) ? 'on' : ''}">
        <input type="checkbox" id="ezHaz_${h.code}" ${hazScelti.has(h.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(h.label)}</label>`
    ).join('');
    return `
      <div class="[border-top:1px_dashed_var(--sx-border)] mt-8 mx-0 mb-6 pt-7">
        <div class="form-group mb-5"><label>Classe di conservazione della zona</label>
          <select class="input" id="ezTempClass">
            <option value="">— non caratterizzata —</option>${opzioni}
          </select></div>
        <div class="form-group mb-4">
          <label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
            <input class="w-[16px] h-[16px] cursor-pointer" type="checkbox" id="ezAllergenZone" ${riservata ? 'checked' : ''}
              onchange="$('ezAllergenList').hidden=!this.checked">
            <span>Zona riservata alla merce con allergeni</span>
          </label></div>
        <div class="form-group" id="ezAllergenList" ${riservata ? '' : 'hidden'}>
          <label>Allergeni ammessi — nessuno spuntato = tutti</label>
          <div class="all-grid">${caselle}</div></div>
        <div class="form-group mb-4">
          <label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
            <input class="w-[16px] h-[16px] cursor-pointer" type="checkbox" id="ezHazardZone" ${pericolosa ? 'checked' : ''}
              onchange="$('ezHazardList').hidden=!this.checked">
            <span>Zona dedicata alla merce pericolosa</span>
          </label></div>
        <div class="form-group" id="ezHazardList" ${pericolosa ? '' : 'hidden'}>
          <label>Pericolosità ammesse — nessuna spuntata = tutte</label>
          ${pericoli.length
            ? `<div class="all-grid">${hazCaselle}</div>`
            : `<div class="text-label-small text-sx-text-muted">Nessuna pericolosità configurata — si aggiungono in Configurazione → Parametri articolo.</div>`}</div>
        <div class="text-label-small text-sx-text-muted mt-3">
          🧭 Lasciata non caratterizzata, la zona non segnala nulla.<br>
          🔓 Una singola ubicazione marcata <strong>Riservata</strong> ammette allergeni
          comunque, ovunque si trovi — la deroga si vede in mappa e si elenca.
          Sulla temperatura la verifica resta attiva.
        </div>
      </div>`;
  },

  _leggiDestinazioneZona() {
    const riservata = $('ezAllergenZone')?.checked === true;
    const allergens = Store.getAllergeniAmmessi()
      .filter(a => $(`ezAll_${a.code}`)?.checked)
      .map(a => a.code);
    const pericolosa = $('ezHazardZone')?.checked === true;
    const hazards = Store.getPericoli()
      .filter(h => $(`ezHaz_${h.code}`)?.checked)
      .map(h => h.code);
    return {
      temp_class: $('ezTempClass')?.value || undefined,
      allergen_zone: riservata,
      allergens: riservata && allergens.length ? allergens : undefined,
      hazard_zone: pericolosa,
      hazards: pericolosa && hazards.length ? hazards : undefined,
    };
  },

  showEditZoneModal(siteId, zoneId) {
    const zone = Store.getZone(siteId, zoneId);
    if (!zone) return;
    let configFields = '';
    if (zone.type === 'RACK') {
      configFields = `<div class="form-row mb-6">
        <div class="form-group"><label>Corsie</label><input class="input" id="ezAisles" type="number" min="1" max="99" value="${zone.aisles}"></div>
        <div class="form-group"><label>Campate/corsia</label><input class="input" id="ezBays" type="number" min="1" max="99" value="${zone.bays_per_aisle}"></div>
      </div>
      <div class="form-group mb-6"><label>Livelli</label><input class="input input-mono" id="ezLevels" value="${this._esc(((zone!.levels as any[]) || []).join(','))}"></div>
      <div class="form-group"><label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
        <input class="w-[16px] h-[16px] cursor-pointer" type="checkbox" id="ezMirror" ${zone.mirror_frontal ? 'checked' : ''}>
        <span>Vista frontale specchiata (campate dx → sx)</span>
      </label>
      <div class="text-label-small text-sx-text-muted mt-2 pl-14">💡 Per chi lavora dal lato opposto alla numerazione delle campate</div></div>`;
    } else if (zone.type === 'FLOOR') {
      configFields = `<div class="form-row">
        <div class="form-group"><label>File</label><input class="input" id="ezRows" type="number" min="1" max="99" value="${zone.rows}"></div>
        <div class="form-group"><label>Posizioni/fila</label><input class="input" id="ezPos" type="number" min="1" max="99" value="${zone.positions_per_row}"></div>
      </div>`;
    } else {
      configFields = `<div class="form-row">
        <div class="form-group"><label>N° Posizioni</label><input class="input" id="ezPositions" type="number" min="1" max="999" value="${zone.positions}"></div>
        <div class="form-group"><label>Colonne griglia</label><input class="input" id="ezCols" type="number" min="1" max="20" value="${zone.grid_cols || 5}"></div>
      </div>`;
    }
    this.showModal(`Modifica Zona — ${zoneId} (${zone.type})`, `
      <div class="form-group mb-6"><label>Nome <span class="req">*</span></label>
        <input class="input" id="ezName" value="${this._esc(zone.name)}" maxlength="${Validate.MAX.ZONE_NAME}"></div>
      <p class="text-body-small text-sx-warning mb-5">⚠ Modificare le dimensioni può generare ubicazioni orfane per item già posizionati oltre la nuova griglia.</p>
      ${configFields}
      ${this._campiDestinazioneZona(zone)}
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doEditZone('${siteId}','${zoneId}')">Salva</button>`);
  },

  async doEditZone(siteId, zoneId) {
    const name = Validate.clean($('ezName')?.value);
    const err = Validate.siteName(name);
    if (err) return this.toast(err, 'error');
    const zone = Store.getZone(siteId, zoneId);
    const updates: any = { name };
    if (zone!.type === 'RACK') {
      updates.aisles = Math.max(1, Math.min(99, parseInt($('ezAisles').value) || 1));
      updates.bays_per_aisle = Math.max(1, Math.min(99, parseInt($('ezBays').value) || 1));
      updates.levels = Validate.clean($('ezLevels').value, true).split(',').map(s => s.trim()).filter(Boolean);
      if (!updates.levels.length) updates.levels = ['T'];
      updates.mirror_frontal = $('ezMirror')?.checked === true;
    } else if (zone!.type === 'FLOOR') {
      updates.rows = Math.max(1, Math.min(99, parseInt($('ezRows').value) || 1));
      updates.positions_per_row = Math.max(1, Math.min(99, parseInt($('ezPos').value) || 1));
    } else {
      updates.positions = Math.max(1, Math.min(999, parseInt($('ezPositions').value) || 1));
      updates.grid_cols = Math.max(1, Math.min(20, parseInt($('ezCols').value) || 5));
    }
    Object.assign(updates, this._leggiDestinazioneZona());
    await Store.updateZone(siteId, zoneId, updates);
    this.closeModal();
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    if (this.currentSite === siteId && this.currentZone === zoneId) this.renderMap();
    this.updateSyncIndicator();
    this.toast(`✓ Zona ${zoneId} aggiornata`, 'success');
  },

  async confirmDeleteZone(siteId, zoneId) {
    /* v2.2.1 [F2] — migrato da confirm() nativo a Dialog (anti-scanner) */
    if (!await Dialog.confirm({
      title: 'Eliminare la zona?',
      message: 'Tutti i dati di inventario della zona saranno rimossi. Operazione irreversibile.',
      details: Dialog.kv([['Sito', siteId], ['Zona', zoneId]]),
      confirmLabel: 'Elimina zona', danger: true
    })) return;
    await Store.deleteZone(siteId, zoneId);
    if (this.currentZone === zoneId && this.currentSite === siteId) this.currentZone = null;
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`Zona ${zoneId} eliminata`, 'success');
  },
};
