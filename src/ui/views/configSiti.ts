import { type Vista, $, $sel } from './vista';
import { Store } from '../../core/store';
import type { Zona } from '../../types/entita';
import { Validate } from '../../modules/validate';
import { marcata } from '../../modules/bancale';
import { Dialog } from '../dialog';

export const VistaConfigSiti = {
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
          <button class="btn btn-sm" onclick="App.showEditSiteModal('${site.id}')" title="Modifica">${this._ico('pencil')}</button>
          <button class="btn btn-sm" onclick="App.showAddZoneModal('${site.id}')" title="Aggiungi zona">+ Zona</button>
          <button class="btn btn-sm btn-danger" onclick="App.confirmDeleteSite('${site.id}')" title="Elimina">${this._ico('trash')}</button>
        </td>
      </tr>`;
      for (const zone of zones) {
        const dim = zone.type === 'RACK' ? `${zone.aisles}c × ${zone.bays_per_aisle}b × ${zone.levels?.length || 1}l` :
          zone.type === 'FLOOR' ? `${zone.rows}f × ${zone.positions_per_row}p` : `${zone.positions} pos`;
        html += `<tr class="bg-sx-accent-soft">
          <td></td>
          <td class="pl-12.5">↳ <span class="badge ${zone.type === 'RACK' ? 'badge-blue' : zone.type === 'FLOOR' ? 'badge-green' : 'badge-amber'}">${zone.type}</span> ${this._esc(zone.name)}</td>
          <td class="mono text-body-small text-sx-text-muted">${dim}</td>
          <td colspan="2">${Store.getZoneStats(site.id, zone.id).total}</td>
          <td class="whitespace-nowrap">
            <button class="btn btn-sm" onclick="App.showEditZoneModal('${site.id}','${zone.id}')">${this._ico('pencil')}</button>
            <button class="btn btn-sm btn-danger" onclick="App.confirmDeleteZone('${site.id}','${zone.id}')">${this._ico('trash')}</button>
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
    this.toast(`Sito ${id} creato`, 'success');
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
    this.toast(`Sito ${siteId} aggiornato`, 'success');
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
    const fields: Record<string, string> = {
      RACK: `<div class="form-row mb-6">
        <div class="form-group"><label>Corsie</label><input class="input" id="zfAisles" type="number" min="1" max="99" value="5"></div>
        <div class="form-group"><label>Campate/corsia</label><input class="input" id="zfBays" type="number" min="1" max="99" value="10"></div>
      </div>
      <div class="form-group mb-6"><label>Livelli (virgola)</label><input class="input input-mono" id="zfLevels" value="T,A,B,C,D" placeholder="T,A,B,C,D"></div>
      <div class="form-group"><label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
        <input class="w-casella h-casella cursor-pointer" type="checkbox" id="zfMirror">
        <span>Vista frontale specchiata (campate dx → sx)</span>
      </label>
      <div class="text-label-small text-sx-text-muted mt-2 pl-14">${this._ico('bulb')} Per chi lavora dal lato opposto alla numerazione delle campate</div></div>`,
      FLOOR: `<div class="form-row">
        <div class="form-group"><label>File</label><input class="input" id="zfRows" type="number" min="1" max="99" value="4"></div>
        <div class="form-group"><label>Posizioni/fila</label><input class="input" id="zfPosPerRow" type="number" min="1" max="99" value="8"></div>
      </div>`,
      BULK: `<div class="form-row">
        <div class="form-group"><label>N° Posizioni</label><input class="input" id="zfPositions" type="number" min="1" max="999" value="20"></div>
        <div class="form-group"><label>Colonne griglia</label><input class="input" id="zfGridCols" type="number" min="1" max="20" value="5"></div>
      </div>`
    };
    el.innerHTML = fields[type] || '';
  },

  async doAddZone(siteId: string) {
    const id = Validate.clean($('newZoneId').value, true);
    const name = Validate.clean($('newZoneName').value);
    const type = $('newZoneType').value;
    const errs = [Validate.zoneId(id), Validate.siteName(name)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    const zone: Partial<Zona> & { id: string; name: string; type: string } = { id, name, type };
    if (type === 'RACK') {
      zone.aisles = Math.max(1, Math.min(99, parseInt($('zfAisles').value) || 1));
      zone.bays_per_aisle = Math.max(1, Math.min(99, parseInt($('zfBays').value) || 1));
      zone.levels = Validate.clean($('zfLevels').value, true).split(',').map(s => s.trim()).filter(Boolean);
      if (!zone.levels.length) zone.levels = ['T'];
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
    this.toast(`Zona ${id} creata in ${siteId}`, 'success');
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
    /* 2.38 — la zona di SPEDIZIONE, che fino alla 2.37 si chiamava «di
       prodotto finito». Sta insieme agli altri tre perche' si compila nello
       stesso momento, ma non e' un attributo di destinazione d'uso: non
       verifica niente e non esclude nessuno.

       SI LEGGONO TUTTI E DUE I NOMI, si scrive solo il nuovo: una zona
       marcata prima dell'aggiornamento porta `pf_zone`, e ritrovarla senza
       spunta vorrebbe dire che il magazzino si riconfigura la mattina in cui
       si installa. */
    const spedizione = marcata(zone, 'shipping_zone', 'pf_zone');
    /* 2.21 — la baia di carico. Sta accanto alla zona di spedizione perche'
       sono i due capi dello stesso viaggio: dove un bancale aspetta, e dove
       aspetta il camion. */
    const baiaCarico = zone?.dock_zone === true;
    /* 2.30 — la zona di imballaggio. È la terza dello stesso gruppo, e
       l'unica di cui ne SERVE una per sito: è dove nasce l'unità di carico
       di una spedizione preparata. L'avviso sui siti scoperti sta in cima
       alla scheda, non qui: qui si marca una zona, di là si vede se ne
       manca una. */
    const imballaggio = zone?.pack_zone === true;
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
            <input class="w-casella h-casella cursor-pointer" type="checkbox" id="ezAllergenZone" ${riservata ? 'checked' : ''}
              onchange="$('ezAllergenList').hidden=!this.checked">
            <span>Zona riservata alla merce con allergeni</span>
          </label></div>
        <div class="form-group" id="ezAllergenList" ${riservata ? '' : 'hidden'}>
          <label>Allergeni ammessi — nessuno spuntato = tutti</label>
          <div class="all-grid">${caselle}</div></div>
        <div class="form-group mb-4">
          <label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
            <input class="w-casella h-casella cursor-pointer" type="checkbox" id="ezHazardZone" ${pericolosa ? 'checked' : ''}
              onchange="$('ezHazardList').hidden=!this.checked">
            <span>Zona dedicata alla merce pericolosa</span>
          </label></div>
        <div class="form-group" id="ezHazardList" ${pericolosa ? '' : 'hidden'}>
          <label>Pericolosità ammesse — nessuna spuntata = tutte</label>
          ${pericoli.length
            ? `<div class="all-grid">${hazCaselle}</div>`
            : `<div class="text-label-small text-sx-text-muted">Nessuna pericolosità configurata — si aggiungono in Configurazione → Parametri articolo.</div>`}</div>
        <div class="form-group mb-4 [border-top:1px_dashed_var(--sx-border)] pt-6">
          <label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
            <input class="w-casella h-casella cursor-pointer" type="checkbox" id="ezPfZone" ${spedizione ? 'checked' : ''}>
            <span>Zona di <strong>spedizione</strong> — qui i bancali pronti aspettano di partire</span>
          </label>
          <div class="text-label-small text-sx-text-muted mt-2">
            Non è un vincolo di stoccaggio e non esclude niente: dice dove il reparto propone
            di posare un bancale finito, dove finisce un'unità appena imballata per una
            spedizione, e dove l'elenco delle spedizioni va a guardare.
            <strong>Vale anche su un sito terzista</strong>, che è dove la merce finisce
            quando viaggia in conto lavorazione.
          </div>
        </div>
        <div class="form-group mb-4">
          <label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
            <input class="w-casella h-casella cursor-pointer" type="checkbox" id="ezDockZone" ${baiaCarico ? 'checked' : ''}>
            <span>Zona di <strong>baia di carico</strong> — qui i bancali aspettano di salire sul camion</span>
          </label>
          <div class="text-label-small text-sx-text-muted mt-2">
            Non è un vincolo di stoccaggio. Il carico delle spedizioni ci porta i bancali
            prelevati per un DDT: <strong>una posizione per bancale</strong>, così la mappa
            mostra che cosa sta salendo sul mezzo. Serve una zona con abbastanza posizioni —
            a terra o alla rinfusa — perché due bancali dello stesso lotto non stanno nello
            stesso vano.
          </div>
        </div>
        <div class="form-group mb-4">
          <label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
            <input class="w-casella h-casella cursor-pointer" type="checkbox" id="ezPackZone" ${imballaggio ? 'checked' : ''}>
            <span>Zona di <strong>imballaggio</strong> — qui la merce prelevata diventa un'unità di carico</span>
          </label>
          <div class="text-label-small text-sx-text-muted mt-2">
            Non è un vincolo di stoccaggio. È dove finisce un prelievo di spedizione: la
            merce raccolta si compone in unità di carico, si imballa e si etichetta, poi
            passa in baia con un normale trasferimento. <strong>Ne serve una per
            sito</strong>, e a differenza della baia <strong>lo spazio non si conta</strong>:
            il banco è piccolo davvero, ma il limite lo governa a vista chi ci lavora.
          </div>
        </div>
        <div class="text-label-small text-sx-text-muted mt-3">
          ${this._ico('compass')} Lasciata non caratterizzata, la zona non segnala nulla.<br>
          ${this._ico('lock-open')} Una singola ubicazione marcata <strong>Riservata</strong> ammette allergeni
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
      /* 2.38 — si scrive il nome nuovo e basta. Riscrivere anche `pf_zone`
         vorrebbe dire due campi che dicono la stessa cosa e possono
         discordare: chi legge ripiega sul vecchio finché c'è, e questa
         salvataggio lo lascia indietro senza toglierlo di mano a nessuno. */
      shipping_zone: $('ezPfZone')?.checked === true,
      dock_zone: $('ezDockZone')?.checked === true,
      pack_zone: $('ezPackZone')?.checked === true,
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
      <div class="form-group mb-6"><label>Livelli</label><input class="input input-mono" id="ezLevels" value="${this._esc((zone!.levels || []).join(','))}"></div>
      <div class="form-group"><label class="flex items-center gap-4 cursor-pointer normal-case text-body-small">
        <input class="w-casella h-casella cursor-pointer" type="checkbox" id="ezMirror" ${zone.mirror_frontal ? 'checked' : ''}>
        <span>Vista frontale specchiata (campate dx → sx)</span>
      </label>
      <div class="text-label-small text-sx-text-muted mt-2 pl-14">${this._ico('bulb')} Per chi lavora dal lato opposto alla numerazione delle campate</div></div>`;
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
      <p class="text-body-small text-sx-warning mb-5">${this._ico('alert-triangle')} Modificare le dimensioni può generare ubicazioni orfane per item già posizionati oltre la nuova griglia.</p>
      ${configFields}
      ${this._campiDestinazioneZona(zone)}
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doEditZone('${siteId}','${zoneId}')">Salva</button>`);
  },

  async doEditZone(siteId: string, zoneId: string) {
    const name = Validate.clean($('ezName')?.value);
    const err = Validate.siteName(name);
    if (err) return this.toast(err, 'error');
    const zone = Store.getZone(siteId, zoneId);
    const updates: Partial<Zona> = { name };
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
    this.toast(`Zona ${zoneId} aggiornata`, 'success');
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

  /* ═══════════════════════════════════════════════════════════════════
     2.8 — CARATTERIZZARE UNA SINGOLA UBICAZIONE
     © Andrea Sacchetti — Dietopack S.r.l.

     Fino alla 2.7 questa maschera non esisteva: temperatura, allergeni e
     pericolosità stavano solo sulla zona e scendevano identiche a tutte le
     sue celle. Uno scaffale però non è omogeneo — il livello a terra regge
     il doppio di quello in quota, la cella davanti al portone è più calda
     del fondo corsia, e la campata con la vasca di contenimento è l'unica
     che può tenere un corrosivo.

     OGNI CAMPO HA TRE STATI, NON DUE, ed è il punto di tutta la maschera:
     «come la zona», «così», e — per gli interruttori — «qui no». Un campo
     lasciato su «come la zona» NON scrive niente: la cella resta agganciata
     alla zona e la segue se la zona cambia. È la differenza che tiene in
     piedi le migliaia di celle già configurate, e per questo la tendina
     dice «come la zona (…)» col valore vero fra parentesi, invece di
     presentare un campo vuoto che sembra «nessun vincolo».

     La capienza e la portata sono l'eccezione: sono SEMPRE della cella,
     perché una capienza di zona non vuol dire niente — la zona è l'insieme
     dei vani, non un vano. Fino alla 2.7 il motore le cercava su
     `zona.capienza`, che non è mai esistita nemmeno come campo.
     ═══════════════════════════════════════════════════════════════════ */

  showCaratterizzaUbicazione(code: string) {
    if (!this._requireOperator('la caratterizzazione di un’ubicazione')) return;
    const c = String(code || '').toUpperCase();
    const g = Store.buildLocationGeometry().get(c);
    const zona = g ? Store.getZone(g.site_id, g.zone_id) : null;
    if (!zona) return this.toast('Ubicazione non mappata: non appartiene a nessuna zona', 'error');
    const cella = Store.getLocationAttrs(c);
    const eff = Store.attributiPosto(c);

    /* Il valore della zona, scritto in chiaro dentro l'opzione «come la
       zona»: chi sceglie deve vedere da cosa si sta staccando. */
    const daZona = (v: unknown, vuoto = 'non caratterizzata') =>
      (v === undefined || v === null || v === '' ? vuoto : String(v));

    const classi = Store.getClassiConservazione();
    const tempSel = cella?.temp_class === undefined ? '' : (cella.temp_class ?? 'NO');
    const opzTemp = classi.map((x) =>
      `<option value="${x.code}" ${tempSel === x.code ? 'selected' : ''}>${this._esc(x.label)}</option>`).join('');

    const tri = (id: string, etichetta: string, valCella: boolean | null | undefined, valZona: boolean) => {
      const v = valCella === undefined ? '' : (valCella === true ? 'SI' : 'NO');
      return `<div class="form-group mb-5">
        <label>${etichetta}</label>
        <select class="select" id="${id}">
          <option value="" ${v === '' ? 'selected' : ''}>Come la zona (${valZona ? 'sì' : 'no'})</option>
          <option value="SI" ${v === 'SI' ? 'selected' : ''}>Sì, questa cella sì</option>
          <option value="NO" ${v === 'NO' ? 'selected' : ''}>No, questa cella no</option>
        </select></div>`;
    };

    const chip = (prefisso: string, voci: { code: string; label: string }[], scelti: Set<string>) =>
      voci.map((v) => `<label class="all-chip ${scelti.has(v.code) ? 'on' : ''}">
        <input type="checkbox" id="${prefisso}${v.code}" ${scelti.has(v.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(v.label)}</label>`).join('');

    const allScelti = new Set(cella?.allergens ?? []);
    const hazScelti = new Set(cella?.hazards ?? []);
    const pericoli = Store.getPericoli();

    this.showModal(`${this._ico('target')} Caratterizza ${this._esc(c)}`, `
      <div class="mov-preview mb-5 leading-larga">
        Vale <strong>solo per questa cella</strong> e scavalca la zona
        <span class="mono">${this._esc(zona.name || zona.id)}</span>.
        Un campo lasciato su <em>«come la zona»</em> non scrive niente: la cella resta
        agganciata alla zona e la segue se la zona cambia.
      </div>

      <div class="form-group mb-5">
        <label>Classe di conservazione</label>
        <select class="select" id="laTemp">
          <option value="" ${tempSel === '' ? 'selected' : ''}>Come la zona (${this._esc(daZona(zona.temp_class))})</option>
          <option value="NO" ${tempSel === 'NO' ? 'selected' : ''}>Nessuna: qui la temperatura non si verifica</option>
          ${opzTemp}
        </select></div>

      ${tri('laAllZone', 'Riservata alla merce con allergeni', cella?.allergen_zone, zona.allergen_zone === true)}
      <div class="form-group mb-5">
        <label>Allergeni ammessi in questa cella — nessuno spuntato = come la zona</label>
        <div class="all-grid">${chip('laAll_', Store.getAllergeniAmmessi(), allScelti)}</div></div>

      ${tri('laHazZone', 'Dedicata alla merce pericolosa', cella?.hazard_zone, zona.hazard_zone === true)}
      <div class="form-group mb-5">
        <label>Pericolosità ammesse in questa cella — nessuna spuntata = come la zona</label>
        ${pericoli.length
          ? `<div class="all-grid">${chip('laHaz_', pericoli, hazScelti)}</div>`
          : '<div class="text-label-small text-sx-text-muted">Nessuna pericolosità configurata — si aggiungono in Configurazione → Parametri Articolo.</div>'}</div>

      <div class="form-row mb-5">
        <div class="form-group">
          <label>Capienza — quanti colli ci stanno</label>
          <input class="input input-mono" id="laCapienza" type="number" min="1" max="99999"
                 value="${cella?.capienza ?? ''}" placeholder="non dichiarata">
        </div>
        <div class="form-group">
          <label>Portata — quanti chili regge</label>
          <input class="input input-mono" id="laPortata" type="number" min="1" max="999999"
                 value="${cella?.portata_kg ?? ''}" placeholder="non dichiarata">
        </div>
      </div>
      <!-- 1.13 — un vincolo che nessuno ha scritto non e' un vincolo che si
           viola: lasciati vuoti, capienza e portata non escludono nessuno. -->
      <div class="text-label-small text-sx-text-muted mb-5">
        Lasciati vuoti non escludono nessuno: il motore non può far rispettare un numero
        che nessuno ha scritto. Oggi in questa cella ci sono
        <strong>${Store.getItemsAtLocation(c).reduce((t: number, r: { qty?: number }) => t + (r.qty || 0), 0)}</strong> colli.
      </div>

      <div class="form-group mb-0">
        <label>Perché questa cella è diversa — lo legge chi la vede esclusa</label>
        <input class="input" id="laNota" maxlength="${Validate.MAX.REASON}"
               value="${this._esc(cella?.nota ?? '')}" placeholder="Es: unica campata con la vasca di contenimento">
      </div>

      <div class="mov-preview mt-5 text-label-small">
        <strong>Adesso qui vale:</strong>
        ${this._esc(eff.temp_class ? String(eff.temp_class) : 'nessuna classe')} ·
        ${eff.allergen_zone ? 'zona allergeni' : 'non zona allergeni'} ·
        ${eff.hazard_zone ? 'area pericoli' : 'non area pericoli'} ·
        capienza ${eff.capienza ?? '—'} · portata ${eff.portata_kg ?? '—'}
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       ${cella ? `<button class="btn btn-danger" onclick="App._scaratterizzaUbicazione('${this._esc(c)}')">↺ Torna alla zona</button>` : ''}
       <button class="btn btn-primary" onclick="App._salvaCaratterizzazione('${this._esc(c)}')">Salva</button>`);
  },

  async _salvaCaratterizzazione(code: string) {
    /* `undefined` = come la zona, `null` = qui no. Sono due decisioni
       diverse e vanno scritte diverse: vedi `_fondiAttributi` in `store.ts`,
       che è l'unico posto dove la differenza si legge. */
    const triLeggi = (id: string): boolean | null | undefined => {
      const v = String($sel(id)?.value || '');
      return v === '' ? undefined : v === 'SI';
    };
    const numero = (id: string): number | undefined => {
      const raw = String($(id)?.value ?? '').trim();
      if (!raw) return undefined;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };

    const temp = String($sel('laTemp')?.value || '');
    const all = Store.getAllergeniAmmessi().filter((a) => $(`laAll_${a.code}`)?.checked).map((a) => a.code);
    const haz = Store.getPericoli().filter((h) => $(`laHaz_${h.code}`)?.checked).map((h) => h.code);

    try {
      await Store.saveLocationAttrs(code, {
        temp_class: temp === '' ? undefined : (temp === 'NO' ? null : temp as never),
        allergen_zone: triLeggi('laAllZone'),
        allergens: all.length ? all as never : undefined,
        hazard_zone: triLeggi('laHazZone'),
        hazards: haz.length ? haz : undefined,
        capienza: numero('laCapienza') ?? null,
        portata_kg: numero('laPortata') ?? null,
        nota: Validate.clean($('laNota')?.value),
      });
      this.closeModal();
      this.renderMap();
      this.renderDetail(code);
      this.updateSyncIndicator();
      this.toast(`${code} caratterizzata`, 'success');
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  },

  /* Togliere il record NON disattiva la cella: la rimanda a quel che dice la
     sua zona, che è dove stava prima che qualcuno la caratterizzasse. */
  async _scaratterizzaUbicazione(code: string) {
    if (!await Dialog.confirm({
      title: 'Rimandare alla zona?',
      message: 'Le eccezioni scritte su questa cella spariscono e la cella torna a valere '
        + 'esattamente come dice la sua zona. Non si disattiva niente.',
      details: Dialog.kv([['Ubicazione', code]]),
      confirmLabel: 'Torna alla zona', danger: true,
    })) return;
    await Store.deleteLocationAttrs(code);
    this.closeModal();
    this.renderMap();
    this.renderDetail(code);
    this.updateSyncIndicator();
    this.toast(`${code} segue di nuovo la sua zona`, 'success');
  },
} satisfies Vista;
