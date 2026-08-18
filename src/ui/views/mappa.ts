import { type Vista, $ } from './vista';
import { caricaExcel } from '../../modules/excel';
import { Store } from '../../core/store';

export const VistaMappa: Vista = {
  // ═══ MAPPA ═══
  renderMap() {
    if (!this.currentSite || !this.currentZone) return;
    const site = Store.getSite(this.currentSite);
    const zone = Store.getZone(this.currentSite, this.currentZone);
    if (!site || !zone) return;
    const stats = Store.getZoneStats(this.currentSite, this.currentZone);
    const locs = Store.generateLocations(this.currentSite, this.currentZone);
    this._aggiornaConformita();

    let toolbar = `
      <div class="map-toolbar">
        <div class="map-breadcrumb">
          <span class="crumb mono">${this._esc(site.id)}</span>
          <span class="crumb-sep">›</span>
          <span class="crumb">${this._esc(site.name)}</span>
          <span class="crumb-sep">›</span>
          <span class="crumb-active">${this._esc(zone.name)}</span>
        </div>
        <div class="map-view-toggle">
          <button class="map-vt-btn ${this.mapViewMode === 'plan' ? 'active' : ''}" onclick="App.setMapView('plan')">▦ Piano</button>
          <button class="map-vt-btn ${this.mapViewMode === 'frontal' ? 'active' : ''}" onclick="App.setMapView('frontal')">▤ Frontale</button>
        </div>
        ${(zone.type === 'RACK' && this.mapViewMode === 'frontal') ? `<button class="btn btn-sm ${zone.mirror_frontal ? 'btn-warning' : ''} text-body-small" onclick="App.toggleMirrorFrontal()" title="Specchia vista frontale (dx↔sx)">${zone.mirror_frontal ? '↔ Specchiata' : '↔ Specchia'}</button>` : ''}`;
    if (zone.type === 'RACK' && (zone.levels as any[])?.length > 1 && this.mapViewMode === 'plan') {
      toolbar += '<div class="level-selector">';
      for (const lvl of (zone.levels as any[])) {
        toolbar += `<button class="level-btn ${lvl === this.currentLevel ? 'active' : ''}" onclick="App.changeLevel('${lvl}')">${lvl}</button>`;
      }
      toolbar += '</div>';
    }
    toolbar += `
        <div class="map-stats-bar">
          <div class="map-stat"><div class="dot bg-sx-text-muted"></div>${stats.total} Tot</div>
          <div class="map-stat"><div class="dot bg-sx-success"></div>${stats.occupied} Occ</div>
          <div class="map-stat"><div class="dot bg-sx-border"></div>${stats.empty} Vuote</div>
          <div class="map-stat"><div class="dot bg-sx-danger"></div>${stats.blocked} Bloc</div>
          <div class="map-stat"><div class="dot bg-sx-warning"></div>${stats.reserved} Ris</div>
          ${stats.disabled ? `<div class="map-stat"><div class="dot bg-sx-disabled"></div>${stats.disabled} Disatt</div>` : ''}
        </div>
        <div class="legend">
          <div class="legend-item"><div class="legend-dot bg-sx-border"></div>Vuota</div>
          <div class="legend-item"><div class="legend-dot bg-sx-success"></div>Occupata</div>
          <div class="legend-item"><div class="legend-dot bg-sx-danger"></div>Bloccata</div>
          <div class="legend-item"><div class="legend-dot bg-sx-warning"></div>Riservata</div>
          <div class="legend-item"><div class="legend-dot bg-sx-disabled"></div>Disatt.</div>
          <div class="legend-item ml-auto text-sx-text-muted">💡 Tasto dx = Attiva/Disattiva</div>
        </div>
        ${this._fasciaConformita(locs)}
      </div>`;
    $('mapToolbar').innerHTML = toolbar;

    if (this.mapViewMode === 'frontal') this._renderMapFrontal(zone, locs);
    else this._renderMapPlan(zone, locs);
  },

  /* La fascia parla solo della zona che si sta guardando: un conteggio di
     tutto il magazzino, sopra una corsia, non dice a nessuno cosa fare. */
  _fasciaConformita(locs) {
    const conf = this._conf;
    if (!conf) return '';
    const qui = new Set(locs.map((l: any) => l.code));
    const righe = conf.nonConformita.filter((n: any) => qui.has(n.location_code));
    const senzaAttributi = conf.articoliSenzaAttributi.size;
    const deroghe = conf.deroghe.filter((d: any) => qui.has(d.location_code)).length;
    const nastroDeroghe = deroghe
      ? `<button class="conf-deroghe" onclick="App.mostraDeroghe()" title="Allergeni ammessi per riserva della cella">
          🔓 ${deroghe} in deroga</button>`
      : '';

    if (!righe.length && deroghe) {
      return `<div class="conf-bar conf-bar--muta">
        <span>✓ Nessuna giacenza fuori posto in questa zona</span>${nastroDeroghe}
        ${senzaAttributi ? `<span class="conf-bar-nota">${senzaAttributi} articoli non ancora classificati, non verificati</span>` : ''}
      </div>`;
    }

    if (!righe.length) {
      /* Silenzio ambiguo: zero segnalazioni perche' va tutto bene, o perche'
         non c'e' ancora niente da verificare? Sono due cose diverse. */
      if (!conf.verificabili && senzaAttributi) {
        return `<div class="conf-bar conf-bar--muta">
          🧭 Verifica di stoccaggio inattiva — <strong>${senzaAttributi}</strong> articoli
          senza classe di temperatura né allergeni. Si popolano da Configurazione → Articoli → Export/Import Excel.
        </div>`;
      }
      return '';
    }

    const alte = righe.filter((n: any) => n.gravita === 'alta').length;
    return `<div class="conf-bar ${alte ? 'conf-bar--alta' : 'conf-bar--media'}">
      <span>⚠ <strong>${righe.length}</strong> ${righe.length === 1 ? 'giacenza fuori posto' : 'giacenze fuori posto'} in questa zona${alte ? ` — <strong>${alte}</strong> ${alte === 1 ? 'grave' : 'gravi'}` : ''}</span>
      <button class="btn btn-sm" onclick="App.mostraNonConformita()">Vedi elenco</button>
      ${nastroDeroghe}
      ${senzaAttributi ? `<span class="conf-bar-nota">${senzaAttributi} articoli non ancora classificati, non verificati</span>` : ''}
    </div>`;
  },

  /* L'elenco completo, di tutto il magazzino: da qui si va all'ubicazione. */
  mostraNonConformita() {
    const conf = this._conf || this._aggiornaConformita();
    if (!conf || !conf.nonConformita.length) {
      return this.toast('Nessuna giacenza fuori posto', 'success');
    }
    const perTipo = new Map();
    for (const n of conf.nonConformita) perTipo.set(n.tipo, (perTipo.get(n.tipo) || 0) + 1);

    const righe = conf.nonConformita.slice(0, 300).map((n: any) => `
      <tr class="${n.gravita === 'alta' ? 'conf-riga-alta' : ''}">
        <td>${n.gravita === 'alta' ? '⛔' : '⚠'}</td>
        <td class="mono"><button class="conf-vai" onclick="App.closeModal();App.goToLocation('${this._esc(n.location_code)}')">${this._esc(n.location_code)}</button></td>
        <td class="mono">${this._esc(n.article_code)}</td>
        <td>${this._esc(n.article_description || '')}</td>
        <td class="mono">${this._esc(n.lot_code || '')}</td>
        <td>${this._esc(n.messaggio)}</td>
      </tr>`).join('');

    this.showModal(`Giacenze fuori posto — ${conf.nonConformita.length}`, `
      <div class="conf-riepilogo">
        ${[...perTipo].map(([t, n]) => `<span class="conf-chip">${this._esc(this._etichettaTipoNC(t))}: <strong>${n}</strong></span>`).join('')}
        <span class="conf-chip conf-chip--muta">verificate ${conf.verificabili} di ${conf.righe} giacenze</span>
        ${conf.deroghe.length ? `<button class="conf-deroghe" onclick="App.mostraDeroghe()">🔓 ${conf.deroghe.length} in deroga su celle riservate</button>` : ''}
      </div>
      <div class="overflow-x-auto max-h-[56vh]">
        <table class="sx-table">
          <thead><tr><th class="w-[34px]"></th><th>Ubicazione</th><th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Perché</th></tr></thead>
          <tbody>${righe}</tbody>
        </table>
      </div>
      ${conf.nonConformita.length > 300 ? `<div class="dlg-nota">Mostrate le prime 300 di ${conf.nonConformita.length}. L'export Excel le porta tutte.</div>` : ''}
    `, `<button class="btn" onclick="App.closeModal()">Chiudi</button>
        <button class="btn btn-accent" onclick="App.esportaNonConformita()">📊 Esporta Excel</button>`);
  },

  /* Le eccezioni volute, in chiaro. Non sono difetti, ma sono la risposta a
     «dove tenete allergeni fuori dalla zona riservata», che qualcuno chiedera'. */
  mostraDeroghe() {
    const conf = this._conf || this._aggiornaConformita();
    const d = conf?.deroghe || [];
    if (!d.length) return this.toast('Nessuna deroga attiva', 'info');

    const righe = d.map((x: any) => `
      <tr>
        <td class="mono"><button class="conf-vai" onclick="App.closeModal();App.goToLocation('${this._esc(x.location_code)}')">${this._esc(x.location_code)}</button></td>
        <td class="mono">${this._esc(x.article_code)}</td>
        <td>${this._esc(x.article_description || '')}</td>
        <td class="mono">${this._esc(x.lot_code || '')}</td>
        <td>${this._esc(x.allergens.map((c: any) => this._etAllergene(c)).join(', '))}</td>
      </tr>`).join('');

    this.showModal(`Allergeni in deroga — ${d.length}`, `
      <p class="text-body-small text-sx-text-muted mb-7">
        Merce con allergeni stoccata fuori dalla zona riservata, ammessa perché
        l'ubicazione è marcata <strong>Riservata</strong>. La deroga vale sugli
        allergeni: sulla temperatura la verifica resta attiva.
      </p>
      <div class="overflow-x-auto max-h-[56vh]">
        <table class="sx-table">
          <thead><tr><th>Ubicazione</th><th>Articolo</th><th>Descrizione</th><th>Lotto</th><th>Allergeni ammessi</th></tr></thead>
          <tbody>${righe}</tbody>
        </table>
      </div>
    `, `<button class="btn" onclick="App.closeModal()">Chiudi</button>
        <button class="btn btn-accent" onclick="App.esportaDeroghe()">📊 Esporta Excel</button>`);
  },

  async esportaDeroghe() {
    const d = (this._conf || this._aggiornaConformita())?.deroghe || [];
    if (!d.length) return this.toast('Niente da esportare', 'warning');
    const XLSX = await caricaExcel();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.map((x: any) => ({
      'Ubicazione': x.location_code, 'Articolo': x.article_code,
      'Descrizione': x.article_description || '', 'Lotto': x.lot_code || '',
      'Colli': x.qty ?? '', 'Allergeni': x.allergens.map((c: any) => this._etAllergene(c)).join(', '),
    }))), 'Deroghe');
    XLSX.writeFile(wb, `allergeni-in-deroga-${new Date().toISOString().slice(0,10)}.xlsx`);
    this.toast('✓ Excel esportato', 'success');
  },

  _etichettaTipoNC(tipo: any) {
    return ({
      TEMPERATURA: 'Temperatura',
      ALLERGENE_FUORI_ZONA: 'Allergeni fuori zona',
      ALLERGENE_NON_AMMESSO: 'Allergene non ammesso',
      PULITO_IN_ZONA_ALLERGENI: 'Senza allergeni in zona riservata',
    } as any)[tipo] || tipo;
  },

  async esportaNonConformita() {
    const conf = this._conf || this._aggiornaConformita();
    if (!conf?.nonConformita.length) return this.toast('Niente da esportare', 'warning');
    const XLSX = await caricaExcel();
    const data = conf.nonConformita.map((n: any) => ({
      'Gravità': n.gravita === 'alta' ? 'ALTA' : 'MEDIA',
      'Tipo': this._etichettaTipoNC(n.tipo),
      'Ubicazione': n.location_code, 'Articolo': n.article_code,
      'Descrizione': n.article_description || '', 'Lotto': n.lot_code || '',
      'Colli': n.qty ?? '', 'Motivo': n.messaggio,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Fuori posto');
    XLSX.writeFile(wb, `giacenze-fuori-posto-${new Date().toISOString().slice(0,10)}.xlsx`);
    this.toast('✓ Excel esportato', 'success');
  },

  setMapView(mode) { this.mapViewMode = mode; this.renderMap(); },
  changeLevel(lvl) { this.currentLevel = lvl; this.selectedLocation = null; this.closeDetail(); this.renderMap(); },

  /* Toggle veloce vista frontale specchiata */
  async toggleMirrorFrontal() {
    const zone = Store.getZone(this.currentSite, this.currentZone);
    if (!zone || zone.type !== 'RACK') return;
    const newValue = !zone.mirror_frontal;
    await Store.updateZone(this.currentSite, this.currentZone, { mirror_frontal: newValue });
    this.renderMap();
    this.updateSyncIndicator();
    this.toast(newValue ? '↔ Vista frontale specchiata (dx → sx)' : '↔ Vista frontale normale (sx → dx)', 'info');
  },

  _renderMapPlan(zone, locs) {
    const cellSize = 42;
    let html = '<div class="grid-wrapper">';
    if (zone.type === 'RACK') {
      const filtered = locs.filter((l: any) => l.level === this.currentLevel);
      const cols = zone.bays_per_aisle || 1;
      const rows = zone.aisles || 1;
      html += '<div class="grid-labels-top">';
      for (let c = 1; c <= cols; c++) html += `<div class="grid-label-col" style="width:${cellSize + 3}px">C${String(c).padStart(2,'0')}</div>`;
      html += '</div>';
      for (let r = 1; r <= rows; r++) {
        html += `<div class="grid-row-wrapper"><div class="grid-label-row">A${String(r).padStart(2,'0')}</div><div class="grid-row">`;
        for (let c = 1; c <= cols; c++) {
          const loc = filtered.find((l: any) => l.aisle === r && l.bay === c);
          if (loc) html += this._renderCell(loc.code, cellSize);
        }
        html += '</div></div>';
      }
    } else if (zone.type === 'FLOOR') {
      const cols = zone.positions_per_row || 1;
      const rows = zone.rows || 1;
      html += '<div class="grid-labels-top">';
      for (let c = 1; c <= cols; c++) html += `<div class="grid-label-col" style="width:${cellSize + 3}px">P${String(c).padStart(2,'0')}</div>`;
      html += '</div>';
      for (let r = 1; r <= rows; r++) {
        html += `<div class="grid-row-wrapper"><div class="grid-label-row">F${String(r).padStart(2,'0')}</div><div class="grid-row">`;
        for (let c = 1; c <= cols; c++) {
          const loc = locs.find((l: any) => l.row === r && l.position === c);
          if (loc) html += this._renderCell(loc.code, cellSize);
        }
        html += '</div></div>';
      }
    } else if (zone.type === 'BULK') {
      const cols = zone.grid_cols || Math.ceil(Math.sqrt(zone.positions || 1));
      const total = zone.positions || 1;
      let idx = 0;
      for (let r = 0; r < Math.ceil(total / cols); r++) {
        html += '<div class="grid-row-wrapper"><div class="grid-label-row"></div><div class="grid-row">';
        for (let c = 0; c < cols && idx < total; c++, idx++) {
          const loc = locs[idx];
          if (loc) html += this._renderCell(loc.code, cellSize);
        }
        html += '</div></div>';
      }
    }
    html += '</div>';
    $('mapContainer').innerHTML = html;
  },

  /* 1.4.0 — La verifica di conformita' si calcola UNA volta per disegnata e
     si tiene qui: `_renderCell` viene chiamata una volta per cella, e su una
     zona da duemila ubicazioni ricalcolarla ogni volta sarebbe duemila giri
     sull'inventario. `renderMap` la rinfresca, il resto la legge. */
  _conf: null,

  _aggiornaConformita() {
    try { this._conf = Store.verificaStoccaggio(); }
    catch { this._conf = null; }
    return this._conf;
  },

  /* Il marcatore di una cella: niente se e' a posto, o se non c'e' niente da
     verificare. Restituisce classe e testo del title, non HTML. */
  _segnoConformita(code) {
    const nc = this._conf?.perUbicazione.get(code);
    if (!nc) return { cls: '', title: '', badge: '' };
    return {
      cls: nc.gravita === 'alta' ? ' conf-ko' : ' conf-warn',
      title: ` · ⚠ ${nc.n} fuori posto`,
      badge: '<span class="conf-mark">!</span>',
    };
  },

  _renderCell(code, size) {
    const status = Store.getLocationStatus(code);
    const items = Store.getItemsAtLocation(code);
    const selected = this.selectedLocation === code;
    const short = code.split('-').pop();
    const nc = this._segnoConformita(code);
    return `<div class="grid-cell status-${status}${nc.cls} ${selected ? 'selected' : ''}" style="width:${size}px;height:${size}px"
      data-loc="${code}"
      onclick="App.selectLocation('${code}')"
      oncontextmenu="event.preventDefault();App._mapToggleDisable('${code}')"
      title="${code} — ${status}${items.length ? ' · '+items.length+' item' : ''}${nc.title}">
      ${short}${items.length ? `<span class="item-count">${items.length}</span>` : ''}${nc.badge}
    </div>`;
  },

  _renderMapFrontal(zone, locs) {
    let html = '<div class="front-combined">';
    if (zone.type === 'RACK') {
      const mirrored = zone.mirror_frontal === true;
      const dirLabel = mirrored ? ' <span class="text-label-small text-sx-warning font-semibold normal-case">← specchiata (dx→sx)</span>' : '';
      html += `<div class="front-section"><div class="front-section-title">🏗️ Rack — Vista Frontale${dirLabel}</div>`;
      const levels = [...(zone.levels || ['T'])].reverse();
      const bays = zone.bays_per_aisle || 1;
      const aisles = zone.aisles || 1;
      /* bay order: se mirror_frontal allora dx→sx */
      const bayOrder = mirrored
        ? Array.from({ length: bays }, (_, i) => bays - i)
        : Array.from({ length: bays }, (_, i) => i + 1);
      for (let a = 1; a <= aisles; a++) {
        if (a > 1) html += '<div class="front-aisle-separator"></div>';
        html += `<div class="front-aisle"><div class="front-aisle-label">Corsia ${String(a).padStart(2,'0')}</div><div class="front-shelf">`;
        for (const lvl of levels) {
          html += `<div class="front-level"><div class="front-level-label">${lvl}</div>`;
          for (const b of bayOrder) {
            const loc = locs.find((l: any) => l.aisle === a && l.bay === b && l.level === lvl);
            if (loc) {
              const status = Store.getLocationStatus(loc.code);
              const items = Store.getItemsAtLocation(loc.code);
              const sel = this.selectedLocation === loc.code;
              const nc = this._segnoConformita(loc.code);
              html += `<div class="front-cell s-${status}${nc.cls} ${sel ? 'selected' : ''}"
                data-loc="${loc.code}"
                onclick="App.selectLocation('${loc.code}')"
                oncontextmenu="event.preventDefault();App._mapToggleDisable('${loc.code}')"
                title="${loc.code} — ${status}${items.length ? ' · '+items.length+' item' : ''}${nc.title}">
                ${String(b).padStart(2,'0')}${items.length ? `<span class="fc-badge">${items.length}</span>` : ''}${nc.badge}
              </div>`;
            }
          }
          html += '</div>';
        }
        html += '</div><div class="front-bay-labels">';
        for (const b of bayOrder) html += `<div class="front-bay-label">C${String(b).padStart(2,'0')}</div>`;
        html += '</div></div>';
      }
      html += '</div>';
    } else if (zone.type === 'FLOOR') {
      const cols = zone.positions_per_row || 1;
      const rows = zone.rows || 1;
      html += `<div class="front-section"><div class="front-section-title">📦 Floor — Stoccaggio a terra</div>
        <div class="floor-zone-vis" style="grid-template-columns:28px repeat(${cols}, 1fr)">`;
      for (let r = 1; r <= rows; r++) {
        html += `<div class="floor-row-label">F${String(r).padStart(2,'0')}</div>`;
        for (let c = 1; c <= cols; c++) {
          const loc = locs.find((l: any) => l.row === r && l.position === c);
          if (loc) {
            const status = Store.getLocationStatus(loc.code);
            const items = Store.getItemsAtLocation(loc.code);
            const sel = this.selectedLocation === loc.code;
            const stLbl = status === 'empty' ? '—' : status === 'occupied' ? 'pallet' : status === 'blocked' ? 'BLOCK' : status === 'disabled' ? 'OFF' : 'RIS';
            const nc = this._segnoConformita(loc.code);
            html += `<div class="floor-pallet fp-${status}${nc.cls} ${sel ? 'selected' : ''}"
              data-loc="${loc.code}"
              onclick="App.selectLocation('${loc.code}')"
              oncontextmenu="event.preventDefault();App._mapToggleDisable('${loc.code}')"
              title="${loc.code} — ${status}${nc.title}">
              <span class="fp-code">P${String(c).padStart(2,'0')}</span>
              <span class="fp-sub">${stLbl}</span>
              ${items.length ? `<span class="fp-badge">${items.length}</span>` : ''}${nc.badge}
            </div>`;
          }
        }
      }
      html += '</div></div>';
    } else if (zone.type === 'BULK') {
      const cols = zone.grid_cols || Math.ceil(Math.sqrt(zone.positions || 1));
      html += `<div class="front-section"><div class="front-section-title">📋 Bulk — Area libera</div>
        <div class="bulk-zone-vis" style="grid-template-columns:repeat(${cols}, 56px)">`;
      for (const loc of locs) {
        const status = Store.getLocationStatus(loc.code);
        const items = Store.getItemsAtLocation(loc.code);
        const sel = this.selectedLocation === loc.code;
        const nc = this._segnoConformita(loc.code);
        html += `<div class="floor-pallet fp-${status}${nc.cls} ${sel ? 'selected' : ''}"
          data-loc="${loc.code}"
          onclick="App.selectLocation('${loc.code}')"
          oncontextmenu="event.preventDefault();App._mapToggleDisable('${loc.code}')"
          title="${loc.code} — ${status}${nc.title}">
          <span class="fp-code">${String(loc.position).padStart(2,'0')}</span>
          ${items.length ? `<span class="fp-badge">${items.length}</span>` : ''}${nc.badge}
        </div>`;
      }
      html += '</div></div>';
    }
    html += '</div>';
    $('mapContainer').innerHTML = html;
  },

  async _mapToggleDisable(code) {
    const items = Store.getItemsAtLocation(code);
    if (items.length > 0 && !Store.isLocationDisabled(code)) return this.toast(`Impossibile disattivare ${code}: contiene ${items.length} item`, 'error');
    const ok = await Store.toggleLocationDisabled(code);
    if (!ok) return this.toast('Impossibile modificare stato', 'error');
    const newSt = Store.isLocationDisabled(code) ? 'DISATTIVATA' : 'ATTIVA';
    this.renderMap();
    if (this.selectedLocation === code) this.renderDetail(code);
    this.updateSyncIndicator();
    this.toast(`${code} → ${newSt}`, 'success');
  },
};
