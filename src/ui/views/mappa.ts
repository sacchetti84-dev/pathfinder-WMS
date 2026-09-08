import { type Vista, $ } from './vista';
import { caricaExcel } from '../../modules/excel';
import { Store } from '../../core/store';
import { ePf, riepiloga, bancaliImpegnati, ETICHETTE_STATO } from '../../modules/bancale';
import type { StatoBancale } from '../../modules/bancale';
import type { Ubicazione } from '../../core/geometria';
import type { NonConformita, Deroga } from '../../modules/conformita';
import type { CodiceAllergene } from '../../modules/anagrafica';
import { MOV } from '../../core/costanti';
import { Dialog } from '../dialog';

export const VistaMappa = {
  // ═══ MAPPA ═══
  renderMap() {
    if (!this.currentSite || !this.currentZone) return;
    const site = Store.getSite(this.currentSite);
    const zone = Store.getZone(this.currentSite, this.currentZone);
    if (!site || !zone) return;
    const stats = Store.getZoneStats(this.currentSite, this.currentZone);
    const locs = Store.generateLocations(this.currentSite, this.currentZone);
    this._aggiornaConformita();
    /* 2.1 — la vista la decide la zona, non chi guarda: vedi
       `_vistaDiZona`. Si scrive nel campo di sempre perche' tutto quel che
       disegna legge di lì. */
    this.mapViewMode = this._vistaDiZona(zone);

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
          <span class="map-vt-btn active" title="${this.mapViewMode === 'frontal' ? 'Una scaffalatura si guarda di fronte: dall\u2019alto i livelli si sovrappongono' : 'Un\u2019area a terra si guarda dall\u2019alto: di fronte non c\u2019\u00e8 niente da impilare'}">
            ${this.mapViewMode === 'frontal' ? '▤ Frontale' : '▦ Dall\u2019alto'}
          </span>
        </div>
        ${zone.type === 'RACK' ? `<button class="btn btn-sm ${zone.mirror_frontal ? 'btn-warning' : ''} text-body-small" onclick="App.toggleMirrorFrontal()" title="Specchia vista frontale (dx↔sx)">${zone.mirror_frontal ? '↔ Specchiata' : '↔ Specchia'}</button>` : ''}`;
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
          ${this._mapFiltroPf ? `
            <div class="legend-item"><div class="legend-dot bg-sx-accent"></div>Bancale PF pronto</div>
            <div class="legend-item"><div class="legend-dot bg-sx-warning"></div>Impegnato su DDT</div>
            <div class="legend-item"><div class="legend-dot bg-sx-text-muted"></div>Spedito</div>` : ''}
          <div class="legend-item ml-auto text-sx-text-muted">${this._ico('bulb')} Tasto dx = Attiva/Disattiva</div>
        </div>
        <div class="legend">
          <button class="btn btn-sm ${this._mapFiltroPf ? 'btn-primary' : ''}"
            onclick="App._mapToggleFiltroPf()"
            title="Tinge i bancali di prodotto finito con lo stato che hanno">
            ${this._ico('building-factory')} ${this._mapFiltroPf ? 'Prodotto finito: acceso' : 'Prodotto finito'}
          </button>
        </div>
        ${this._fasciaInMano()}
        ${this._fasciaConformita(locs)}
      </div>`;
    $('mapToolbar').innerHTML = toolbar;
    document.body.classList.toggle('udc-in-mano', !!this._udcInMano);

    if (this.mapViewMode === 'frontal') this._renderMapFrontal(zone, locs);
    else this._renderMapPlan(zone, locs);
  },

  /* ═══ 2.1 — LA VISTA LA DECIDE LA ZONA, non chi guarda ══════════════

     Una scaffalatura vista dall'alto sovrappone i livelli: si vede il
     piano scelto e gli altri quattro no, e chi guarda crede di vedere la
     corsia. Un'area a terra vista di fronte è una fila di rettangoli tutti
     alla stessa quota, cioè un disegno che non aggiunge niente alla
     pianta. Erano due viste offerte su ogni zona, e su ogni zona una delle
     due era quella sbagliata.

     Adesso: SCAFFALI → frontale, con «Specchia» per chi percorre la corsia
     nell'altro verso. TERRA e SFUSO → dall'alto. Il selettore dei livelli
     esce con la vista a piano dei rack: nella frontale i livelli si vedono
     tutti insieme, che è la ragione per cui è quella giusta.

     `mapViewMode` resta e resta scrivibile — ci passano `setMapView` e chi
     lo legge — ma la disegnata la comanda questa riga. */
  _vistaDiZona(zone) {
    return zone?.type === 'RACK' ? 'frontal' : 'plan';
  },

  /* 2.36 — QUEL CHE SI HA IN MANO SI VEDE SEMPRE, e da qui si lascia.

     Un bancale «in mano» sopravvive al cambio di zona: è il punto del
     gesto. Ma qualcosa che sopravvive a un cambio schermata e non si vede
     è una trappola — si cambia zona per un'altra ragione, si tocca un vano
     per aprirlo, e si sposta un pallet senza volerlo. La fascia sta in cima
     alla mappa, dice quale unità e da dove, e ha il tasto per lasciarla. */
  _fasciaInMano() {
    const id = this._udcInMano;
    if (!id) return '';
    const u = Store.getUdc(id);
    if (!u) { this._udcInMano = ''; return ''; }
    const righe = Store.righeDiUdc(id).length;
    return `<div class="conf-bar conf-bar--mano">
      <span>${this._ico('forklift')} <strong class="mono">${this._esc(id)}</strong> in mano —
      ${righe} rig${righe === 1 ? 'a' : 'he'}, da <span class="mono">${this._esc(u.location_code || '—')}</span>.
      Tocca il vano dove posarla, anche in un'altra zona.</span>
      <button class="btn btn-sm" onclick="App._udcPrendi('${this._esc(id)}')">${this._ico('x')} Lascia</button>
    </div>`;
  },

  /* La fascia parla solo della zona che si sta guardando: un conteggio di
     tutto il magazzino, sopra una corsia, non dice a nessuno cosa fare. */
  _fasciaConformita(locs) {
    const conf = this._conf;
    if (!conf) return '';
    const qui = new Set(locs.map((l: Ubicazione) => l.code));
    const righe = conf.nonConformita.filter((n: NonConformita) => qui.has(n.location_code));
    const senzaAttributi = conf.articoliSenzaAttributi.size;
    const deroghe = conf.deroghe.filter((d: Deroga) => qui.has(d.location_code)).length;
    const nastroDeroghe = deroghe
      ? `<button class="conf-deroghe" onclick="App.mostraDeroghe()" title="Allergeni ammessi per riserva della cella">
          ${this._ico('lock-open')} ${deroghe} in deroga</button>`
      : '';

    if (!righe.length && deroghe) {
      return `<div class="conf-bar conf-bar--muta">
        <span>${this._ico('check')} Nessuna giacenza fuori posto in questa zona</span>${nastroDeroghe}
        ${senzaAttributi ? `<span class="conf-bar-nota">${senzaAttributi} articoli non ancora classificati, non verificati</span>` : ''}
      </div>`;
    }

    if (!righe.length) {
      /* Silenzio ambiguo: zero segnalazioni perche' va tutto bene, o perche'
         non c'e' ancora niente da verificare? Sono due cose diverse. */
      if (!conf.verificabili && senzaAttributi) {
        return `<div class="conf-bar conf-bar--muta">
          ${this._ico('compass')} Verifica di stoccaggio inattiva — <strong>${senzaAttributi}</strong> articoli
          senza classe di temperatura, allergeni né pericolosità. Si popolano da Configurazione → Articoli → Export/Import Excel.
        </div>`;
      }
      return '';
    }

    const alte = righe.filter((n: NonConformita) => n.gravita === 'alta').length;
    return `<div class="conf-bar ${alte ? 'conf-bar--alta' : 'conf-bar--media'}">
      <span>${this._ico('alert-triangle')} <strong>${righe.length}</strong> ${righe.length === 1 ? 'giacenza fuori posto' : 'giacenze fuori posto'} in questa zona${alte ? ` — <strong>${alte}</strong> ${alte === 1 ? 'grave' : 'gravi'}` : ''}</span>
      <button class="btn btn-sm" onclick="App.mostraNonConformita()">Vedi elenco</button>
      ${nastroDeroghe}
      ${senzaAttributi ? `<span class="conf-bar-nota">${senzaAttributi} articoli non ancora classificati, non verificati</span>` : ''}
    </div>`;
  },

  /* 2.9 — L'elenco si segna aperto: `doMoveItem` lo ridisegna appena
     un'anomalia è risolta, così la riga sistemata sparisce sotto gli occhi
     invece di restare lì a dire una cosa che non è più vera. */
  _elencoNCAperto: false,

  _trasferisciDaElenco(locationCode: string, itemKey: string, dest: string) {
    this.closeModal();
    this.selectedLocation = locationCode;
    this.showMoveItemModal(locationCode, itemKey, dest);
  },

  /* L'elenco completo, di tutto il magazzino: da qui si va all'ubicazione. */
  mostraNonConformita() {
    const conf = this._aggiornaConformita();
    if (!conf || !conf.nonConformita.length) {
      this._elencoNCAperto = false;
      this.closeModal();
      this.renderMap();
      return this.toast('Nessuna giacenza fuori posto', 'success');
    }
    this._elencoNCAperto = true;
    const perTipo = new Map();
    for (const n of conf.nonConformita) perTipo.set(n.tipo, (perTipo.get(n.tipo) || 0) + 1);

    /* ── 2.9 — QUARANTASEI RIGHE DEVONO STARE IN UNA SCHERMATA.

       Ogni riga segnalata porta il suo tasto, e il tasto sa già dove va la
       merce: senza, chi legge doveva ricordarsi il codice, chiudere, aprire
       la mappa, trovare il vano, aprire il pannello e premere Trasferisci —
       sei gesti per uno.

       COME SI TENGONO BASSE LE RIGHE, che è il vero problema di un elenco
       lungo. Alla prima stesura le colonne erano sette e il riquadro largo
       442 px utili: ognuna si spezzava su cinque righe, e una riga alta 261
       px ne lasciava vedere DUE per schermata. Tre correzioni, tutte sulla
       stessa idea — dare a ogni dato lo spazio che merita e non di più:

       ① LA DESCRIZIONE SCENDE SOTTO IL CODICE, e non occupa una colonna sua.
          Non identifica niente — centinaia di righe la portano uguale — ma
          serve a riconoscere la merce a colpo d'occhio, e sotto al codice fa
          quel lavoro senza rubare larghezza a nessuno.
       ② UNA RIGA DI TESTO E BASTA, con i puntini. Il messaggio completo sta
          nel `title`, e chi lo vuole ci passa sopra: mandarlo a capo cinque
          volte per farlo leggere tutto insieme costa l'intera schermata.
       ③ IL «VA IN» DIVENTA UNA PASTIGLIA IN LINEA, non una seconda riga.
          È l'informazione che fa agire, e messa a capo raddoppiava l'altezza
          di ogni singola riga per una parola e un codice.

       Il `<colgroup>` fissa le proporzioni una volta sola: senza, il browser
       le ricalcola sul contenuto e una descrizione lunga si prende metà
       tabella lasciando il codice a spezzarsi. */
    const righe = conf.nonConformita.slice(0, 300).map((n: NonConformita) => {
      const dove = n.item_key
        ? Store.destinazioneSuggerita(n.article_code, n.lot_code || '', n.location_code, n.qty || 1)
        : null;
      return `
      <tr class="${n.gravita === 'alta' ? 'conf-riga-alta' : ''}">
        <td class="text-center">${n.gravita === 'alta' ? this._ico('alert-octagon', 'Grave') : this._ico('alert-triangle', 'Avviso')}</td>
        <td><button class="conf-vai mono" onclick="App.closeModal();App.goToLocation('${this._esc(n.location_code)}')">${this._esc(n.location_code)}</button></td>
        <td>
          <div class="mono font-bold nc-una-riga">${this._esc(n.article_code)}</div>
          <div class="nc-desc nc-una-riga" title="${this._esc(n.article_description || '')}">${this._esc(n.article_description || '')}</div>
        </td>
        <td class="mono nc-una-riga">${this._esc(n.lot_code || '')}</td>
        <td>
          <div class="nc-una-riga" title="${this._esc(n.messaggio)}">${this._esc(n.messaggio)}</div>
          ${dove ? `<span class="nc-va-in">→ <span class="mono">${this._esc(dove.location_code)}</span></span>` : ''}
        </td>
        <td class="text-right">${n.item_key
          ? `<button class="btn btn-sm btn-primary whitespace-nowrap" title="${
              dove ? `Rimetti a posto in ${this._esc(dove.location_code)}` : 'Scegli la destinazione'
            }" onclick="App._trasferisciDaElenco('${this._esc(n.location_code)}','${this._esc(n.item_key)}','${this._esc(dove?.location_code || '')}')">${this._ico('arrows-shuffle')}<span class="nc-tasto-testo"> Trasferisci</span></button>`
          : ''}</td>
      </tr>`;
    }).join('');

    this.showModal(`Giacenze fuori posto — ${conf.nonConformita.length}`, `
      <div class="conf-riepilogo">
        ${[...perTipo].map(([t, n]) => `<span class="conf-chip">${this._esc(this._etichettaTipoNC(t))}: <strong>${n}</strong></span>`).join('')}
        <span class="conf-chip conf-chip--muta">verificate ${conf.verificabili} di ${conf.righe} giacenze</span>
        ${conf.deroghe.length ? `<button class="conf-deroghe" onclick="App.mostraDeroghe()">${this._ico('lock-open')} ${conf.deroghe.length} in deroga su celle riservate</button>` : ''}
      </div>
      <div class="overflow-x-auto max-h-[62vh]">
        <table class="sx-table sx-table-nc">
          <colgroup>
            <col style="width:30px"><col style="width:145px"><col style="width:26%">
            <col style="width:100px"><col><col style="width:130px">
          </colgroup>
          <thead><tr><th></th><th>Ubicazione</th><th>Articolo</th><th>Lotto</th><th>Perché</th><th></th></tr></thead>
          <tbody>${righe}</tbody>
        </table>
      </div>
      ${conf.nonConformita.length > 300 ? `<div class="dlg-nota">Mostrate le prime 300 di ${conf.nonConformita.length}. L'export Excel le porta tutte.</div>` : ''}
    `, `<button class="btn" onclick="App.closeModal()">Chiudi</button>
        <button class="btn btn-accent" onclick="App.esportaNonConformita()">${this._ico('chart-bar')} Esporta Excel</button>`,
        'modal-larga');
  },

  /* Le eccezioni volute, in chiaro. Non sono difetti, ma sono la risposta a
     «dove tenete allergeni fuori dalla zona riservata», che qualcuno chiedera'. */
  mostraDeroghe() {
    const conf = this._conf || this._aggiornaConformita();
    const d = conf?.deroghe || [];
    if (!d.length) return this.toast('Nessuna deroga attiva', 'info');

    const righe = d.map((x: Deroga) => `
      <tr>
        <td class="mono"><button class="conf-vai" onclick="App.closeModal();App.goToLocation('${this._esc(x.location_code)}')">${this._esc(x.location_code)}</button></td>
        <td class="mono">${this._esc(x.article_code)}</td>
        <td>${this._esc(x.article_description || '')}</td>
        <td class="mono">${this._esc(x.lot_code || '')}</td>
        <td>${this._esc(x.allergens.map((c: CodiceAllergene) => this._etAllergene(c)).join(', '))}</td>
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
        <button class="btn btn-accent" onclick="App.esportaDeroghe()">${this._ico('chart-bar')} Esporta Excel</button>`);
  },

  /* QUANTA MERCE È FUORI POSTO, non solo quante righe.
     La conformità guarda DOVE sta la merce e ignora le quantità, ed è giusto
     così. Ma chi apre il foglio deve decidere che cosa spostare per primo, e
     «3 colli» di un articolo a chili non glielo dice: qui accanto ci vanno le
     UM e la lettura per esteso dei colli. Le legge `Store`, che è l'unico
     posto dove la confezione del lotto è quella congelata.

     Queste righe restano UNA PER LOTTO: una non conformità non si moltiplica
     per il numero di colli — è la stessa merce nello stesso vano sbagliato. */
  _umFuoriPosto(location_code: string, item_key: string | undefined) {
    const riga = (item_key ? Store.getItemByKey(item_key) : [])
      .find((i: { location_code: string }) => i.location_code === location_code);
    const letta = riga ? Store.righeLette([riga])[0] : null;
    if (!letta) return { qta: '' as string | number, uom: '', dettaglio: '' };
    return {
      qta: letta.uom_qty ?? '',
      uom: letta.uom_qty === null ? '' : (letta.uom || ''),
      dettaglio: letta.descrizione === '—' ? '' : letta.descrizione,
    };
  },

  async esportaDeroghe() {
    const d = (this._conf || this._aggiornaConformita())?.deroghe || [];
    if (!d.length) return this.toast('Niente da esportare', 'warning');
    const XLSX = await caricaExcel();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.map((x: Deroga) => {
      const um = this._umFuoriPosto(x.location_code, x.item_key);
      return {
        'Ubicazione': x.location_code, 'Articolo': x.article_code,
        'Descrizione': x.article_description || '', 'Lotto': x.lot_code || '',
        'Colli': x.qty ?? '', 'UM Totali': um.qta, 'UM': um.uom, 'Dettaglio Colli': um.dettaglio,
        'Allergeni': x.allergens.map((c: CodiceAllergene) => this._etAllergene(c)).join(', '),
      };
    })), 'Deroghe');
    XLSX.writeFile(wb, `allergeni-in-deroga-${new Date().toISOString().slice(0,10)}.xlsx`);
    this.toast('Excel esportato', 'success');
  },

  _etichettaTipoNC(tipo: string) {
    return ({
      TEMPERATURA: 'Temperatura',
      ALLERGENE_FUORI_ZONA: 'Allergeni fuori zona',
      ALLERGENE_NON_AMMESSO: 'Allergene non ammesso',
      PULITO_IN_ZONA_ALLERGENI: 'Senza allergeni in zona riservata',
      /* 2.8 — la pericolosità, la matrice e la regola base 2. */
      PERICOLO_FUORI_ZONA: 'Merce pericolosa fuori area',
      PERICOLO_NON_AMMESSO: 'Pericolo non ammesso',
      PULITO_IN_ZONA_PERICOLI: 'Merce non pericolosa in area pericoli',
      INCOMPATIBILITA: 'Pericoli incompatibili nello stesso vano',
      LOTTO_SPARSO: 'Stesso lotto in più ubicazioni',
    } as Record<string, string>)[tipo] || tipo;
  },

  async esportaNonConformita() {
    const conf = this._conf || this._aggiornaConformita();
    if (!conf?.nonConformita.length) return this.toast('Niente da esportare', 'warning');
    const XLSX = await caricaExcel();
    const data = conf.nonConformita.map((n: NonConformita) => {
      const um = this._umFuoriPosto(n.location_code, n.item_key);
      return {
        'Gravità': n.gravita === 'alta' ? 'ALTA' : 'MEDIA',
        'Tipo': this._etichettaTipoNC(n.tipo),
        'Ubicazione': n.location_code, 'Articolo': n.article_code,
        'Descrizione': n.article_description || '', 'Lotto': n.lot_code || '',
        'Colli': n.qty ?? '', 'UM Totali': um.qta, 'UM': um.uom, 'Dettaglio Colli': um.dettaglio,
        'Motivo': n.messaggio,
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Fuori posto');
    XLSX.writeFile(wb, `giacenze-fuori-posto-${new Date().toISOString().slice(0,10)}.xlsx`);
    this.toast('Excel esportato', 'success');
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
      const filtered = locs.filter((l: Ubicazione) => l.level === this.currentLevel);
      const cols = zone.bays_per_aisle || 1;
      const rows = zone.aisles || 1;
      html += '<div class="grid-labels-top">';
      for (let c = 1; c <= cols; c++) html += `<div class="grid-label-col" style="width:${cellSize + 3}px">C${String(c).padStart(2,'0')}</div>`;
      html += '</div>';
      for (let r = 1; r <= rows; r++) {
        html += `<div class="grid-row-wrapper"><div class="grid-label-row">A${String(r).padStart(2,'0')}</div><div class="grid-row">`;
        for (let c = 1; c <= cols; c++) {
          const loc = filtered.find((l: Ubicazione) => l.aisle === r && l.bay === c);
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
          const loc = locs.find((l: Ubicazione) => l.row === r && l.position === c);
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
      title: ` · ${nc.n} fuori posto`,
      badge: '<span class="conf-mark">!</span>',
    };
  },

  /* ═══ 2.1 — LE UNITÀ DI CARICO SI VEDONO DENTRO IL VANO ═════════════

     Un'unità è un contenitore che sta IN un'ubicazione: disegnarla come
     una casella annidata dice esattamente quello, e dice anche quante ce
     ne sono senza far leggere un numero. Le caselle si stringono da sole
     al crescere del numero — è una divisione, non una tabella di misure —
     e sotto una certa larghezza smettono di essere disegnate: tre righe di
     un pixel non sono tre pallet, sono sporco sullo schermo.

     E SI TRASCINANO. Portare una casella in un altro vano è lo stesso
     gesto che si fa col muletto, e genera lo stesso movimento che genera
     la maschera: `Store.moveUdc`, una transazione, l'unità e tutte le sue
     righe insieme. Non è una scorciatoia che salta un controllo — il
     controllo è dentro `moveUdc` e vale per tutti e due i modi. */
  /** 2.20 — quando è acceso, i bancali di prodotto finito si tingono dello
      stato che hanno: pronto, impegnato su un DDT, spedito. Lo accende chi
      arriva dall'elenco del prodotto finito, e si spegne da qui. */
  _mapFiltroPf: false,

  _mapToggleFiltroPf() {
    this._mapFiltroPf = !this._mapFiltroPf;
    this.renderMap();
  },

  /** Lo stato dei bancali, per codice di unità, calcolato una volta per
      disegnata: `_renderCell` passa su ogni vano, e chiederlo cella per
      cella vorrebbe dire rileggere i DDT pendenti per ogni casella. */
  _pfStatiBancali() {
    const impegnati = bancaliImpegnati(Store.getPendingOutbound());
    const stati = new Map<string, StatoBancale>();
    for (const u of Store.getUdcList()) {
      if (!ePf(u)) continue;
      stati.set(u.udc_id, riepiloga(u, Store.righeDiUdc(u.udc_id), impegnati).stato);
    }
    return stati;
  },

  _udcNelVanoHTML(code, size) {
    const dentro = Store.getUdcInLocation(code);
    if (!dentro.length) return '';
    /* 2.1 — QUADRATI, non righe. Una striscia larga e alta sei pixel non
       somiglia a un pallet: somiglia a una sottolineatura, e sulla pianta si
       legge come un segno di stato invece che come merce.

       Il lato è il più piccolo fra quello che concede la larghezza — divisa
       fra le unità presenti — e un terzo dell'altezza della cella, che è lo
       spazio che si può prendere in basso senza coprire il codice del vano.
       Sotto i 5px non si disegna più niente: quattro quadratini da tre pixel
       non sono quattro pallet, sono sporco sullo schermo, e allora si scrive
       il numero, che è il dato che comunque serviva. */
    const perLarghezza = Math.floor((size - 6) / dentro.length) - 1;
    const lato = Math.min(perLarghezza, Math.floor(size * 0.34));
    /* 2.37 — CHE COSA PORTA OGNI BANCALE, e non quante righe ha.

       Tre pallet dello stesso lotto su una campata si somigliano: sono tre
       quadratini identici, e «2 righe» non ne distingue nessuno. Il titolo
       dice il codice, che cosa porta e quanti colli — che è la sola cosa che
       li distingue quando si sta cercando quello giusto. */
    const cosaPorta = (id: string) => {
      const righe = Store.righeDiUdc(id);
      const capo = righe[0];
      if (!capo) return 'vuota';
      const colli = righe.reduce((n, r) => n + (Number(r.qty) || 0), 0);
      const prima = `${capo.article_code}#${capo.lot_code}`;
      return righe.length === 1
        ? `${prima} · ${colli} Coll.`
        : `${prima} e altre ${righe.length - 1} · ${colli} Coll.`;
    };
    if (lato < 5) {
      return `<span class="cell-udc-many" title="${this._esc(dentro.length + ' unità di carico: '
        + dentro.map((u) => `${u.udc_id} (${cosaPorta(u.udc_id)})`).join(' · '))}">▣${dentro.length}</span>`;
    }
    /* Il colore dice lo stato SOLO col filtro acceso, e mai da solo: il
       titolo lo scrive, perché un magazzino ha daltonici come qualunque
       altro posto e un quadratino di sei pixel non ha spazio per un'icona. */
    const stati = this._mapFiltroPf
      ? this._pfStatiBancali() as Map<string, StatoBancale> : null;
    return `<span class="cell-udc-box">${dentro.map((u) => {
      const stato = stati?.get(u.udc_id) || null;
      const inMano = this._udcInMano === u.udc_id;
      /* 2.37 — E SI PRENDE TOCCANDOLO. Era solo trascinabile, e trascinare
         non porta in un'altra zona (§ prendi-e-posa). `stopPropagation`
         perché il tocco sulla CELLA, con qualcosa in mano, posa: senza,
         toccare un bancale per prenderlo lo poserebbe dov'è già. */
      return `<i class="cell-udc${stato ? ` pf-${stato}` : ''}${inMano ? ' cell-udc--mano' : ''}"
      style="--lato:${lato}px"
      draggable="true"
      data-udc="${this._esc(u.udc_id)}"
      ondragstart="App._udcDragStart(event,'${this._esc(u.udc_id)}')"
      onclick="event.stopPropagation();App._udcPrendi('${this._esc(u.udc_id)}')"
      title="${this._esc(u.udc_id)}${stato ? ` — ${ETICHETTE_STATO[stato]}` : ''} — ${this._esc(cosaPorta(u.udc_id))}${
        inMano ? ' · IN MANO — tocca un vano per posarla' : ' · tocca per prenderla, o trascinala'}"></i>`;
    }).join('')}</span>`;
  },

  _renderCell(code, size) {
    const status = Store.getLocationStatus(code);
    const items = Store.getItemsAtLocation(code);
    const selected = this.selectedLocation === code;
    const short = code.split('-').pop();
    const nc = this._segnoConformita(code);
    return `<div class="grid-cell status-${status}${nc.cls} ${selected ? 'selected' : ''}" style="width:${size}px;height:${size}px"
      data-loc="${code}"
      onclick="App._toccaVano('${code}')"
      oncontextmenu="event.preventDefault();App._mapToggleDisable('${code}')"
      ondragover="App._udcDragOver(event,'${code}')"
      ondragleave="App._udcDragLeave(event)"
      ondrop="App._udcDrop(event,'${code}')"
      title="${code} — ${status}${items.length ? ' · '+items.length+' item' : ''}${nc.title}">
      ${short}${items.length ? `<span class="item-count">${items.length}</span>` : ''}${nc.badge}${this._udcNelVanoHTML(code, size)}
    </div>`;
  },

  /* ═══ 2.36 · PRENDI E POSA, PERCHÉ IL TRASCINAMENTO NON CAMBIA ZONA ═══

     Segnalato da Andrea l'08/09: «al momento la funzione di trascinamento
     funziona solo all'interno della stessa zona». Ed è esatto, ma la causa
     non sta nel trascinamento: sta nella mappa, che disegna una zona e un
     livello per volta. Un bancale si può lasciar cadere solo su una cella
     che c'è, e le celle dell'altro capannone non sono disegnate.

     Non è una cosa che si aggiusta nel gestore del `drop`. Serve un gesto
     che SOPRAVVIVA al cambio di zona, ed è il gesto vero del magazzino: si
     prende il pallet, si cammina, lo si posa. Il bancale resta «in mano»
     mentre si cambia zona, livello o vista; al tocco sul vano di arrivo
     compare la stessa finestra di conferma del trascinamento — unità, da, a,
     righe — perché è lo stesso spostamento e non deve avere due facce.

     Il trascinamento resta: dentro la stessa zona è più veloce di due
     tocchi, e chi lo usa non deve cambiare abitudine. */
  _udcInMano: '',

  /* Il tocco su un vano: con un bancale in mano lo posa, senza apre il
     pannello. Un gesto solo con due significati è accettabile perché i due
     non si confondono mai — o si ha qualcosa in mano o non si ha — e
     l'alternativa sarebbe un secondo modo della mappa da accendere e
     spegnere, cioè una cosa in più da ricordare in corsia. */
  _toccaVano(code) {
    if (this._udcInMano) { void this._udcPosa(this._udcInMano, code); return; }
    this.selectLocation(code);
  },

  _udcPrendi(id) {
    if (!this._requireOperator('lo spostamento di un’unità di carico')) return;
    if (this._udcInMano === id) {
      this._udcInMano = '';
      this.toast('Unità lasciata dov’era', 'info');
    } else {
      const u = Store.getUdc(id);
      if (!u) return this.toast('Unità non trovata', 'error');
      this._udcInMano = id;
      this.toast(`${id} in mano — tocca il vano dove posarla, anche in un’altra zona`, 'info');
    }
    this.renderMap();
    if (this.selectedLocation) this.renderDetail(this.selectedLocation);
  },

  /* Lo spostamento vero, uno solo per tutte e tre le strade — trascinamento,
     prendi-e-posa, campo di testo nel pannello. Tre gesti diversi che
     scrivessero tre spostamenti diversi sarebbero tre comportamenti da
     tenere allineati a mano. */
  async _udcPosa(id, code) {
    if (!this._requireOperator('lo spostamento di un’unità di carico')) return false;
    const u = Store.getUdc(id);
    if (!u) { this.toast('Unità non trovata', 'error'); return false; }
    const da = u.location_code || '';
    if (da === code) { this.toast(`${id} è già in ${code}`, 'warning'); return false; }
    const stato = Store.getLocationStatus(code);
    if (stato === 'blocked' || stato === 'disabled') {
      this.toast(`Ubicazione ${code} ${stato === 'blocked' ? 'BLOCCATA' : 'DISATTIVATA'}`, 'error');
      return false;
    }

    const righe = Store.righeDiUdc(id);
    if (!await Dialog.confirm({
      title: 'Spostare l’unità di carico?',
      message: 'L’unità e tutte le sue righe cambiano ubicazione insieme, in una transazione sola. Il contenuto non si tocca.',
      details: Dialog.kv([['Unità', id], ['Da', da || '—'], ['A', code], ['Righe', righe.length]]),
      confirmLabel: 'Sposta',
    })) return false;

    try {
      const esito = await Store.moveUdc(id, code, {
        type: MOV.UDC, article_code: '', article_description: '', lot_code: '',
        location_code: da, dest_location: code,
        user: Store.getCurrentIdentity().initials, ts: Date.now(),
        notes: `Unità di carico ${id} — ${righe.length} righe`,
      });
      this._udcInMano = '';
      this.renderMap();
      if (this.selectedLocation) this.renderDetail(this.selectedLocation);
      this.updateSyncIndicator();
      this._refreshSessionLog?.();
      this.toast(`${id}: ${da || '—'} → ${code} · ${esito?.righe ?? righe.length} righe`, 'success');
      return true;
    } catch (e) {
      this.toast((e as Error).message, 'error');
      return false;
    }
  },

  /* Il pezzo trascinato si tiene qui e non solo in `dataTransfer`: durante
     il `dragover` il contenuto non è leggibile — è una regola del browser,
     non un difetto — e senza questo la cella non saprebbe se rifiutare. */
  _udcTrascinata: null,

  _udcDragStart(ev, id) {
    this._udcTrascinata = id;
    try {
      ev.dataTransfer.setData('text/plain', id);
      ev.dataTransfer.effectAllowed = 'move';
    } catch { /* qualche browser non lo consente: resta la variabile */ }
    ev.stopPropagation();
  },

  _udcDragOver(ev, code) {
    if (!this._udcTrascinata) return;
    const u = Store.getUdc(this._udcTrascinata);
    if (!u || u.location_code === code) return;
    const stato = Store.getLocationStatus(code);
    if (stato === 'blocked' || stato === 'disabled') return;
    ev.preventDefault();
    ev.currentTarget?.classList.add('drop-target');
  },

  _udcDragLeave(ev) {
    ev.currentTarget?.classList.remove('drop-target');
  },

  async _udcDrop(ev, code) {
    ev.preventDefault();
    ev.currentTarget?.classList.remove('drop-target');
    const id = this._udcTrascinata || (() => { try { return ev.dataTransfer.getData('text/plain'); } catch { return ''; } })();
    this._udcTrascinata = null;
    if (!id) return;
    /* 2.36 — lo spostamento vero sta in `_udcPosa`, ed è lo stesso per il
       trascinamento, per il prendi-e-posa e per il campo di testo del
       pannello: tre gesti, uno spostamento. */
    await this._udcPosa(id, code);
  },

  _renderMapFrontal(zone, locs) {
    let html = '<div class="front-combined">';
    if (zone.type === 'RACK') {
      const mirrored = zone.mirror_frontal === true;
      const dirLabel = mirrored ? ' <span class="text-label-small text-sx-warning font-semibold normal-case">← specchiata (dx→sx)</span>' : '';
      html += `<div class="front-section"><div class="front-section-title">${this._ico('forklift')} Rack — Vista Frontale${dirLabel}</div>`;
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
            const loc = locs.find((l: Ubicazione) => l.aisle === a && l.bay === b && l.level === lvl);
            if (loc) {
              const status = Store.getLocationStatus(loc.code);
              const items = Store.getItemsAtLocation(loc.code);
              const sel = this.selectedLocation === loc.code;
              const nc = this._segnoConformita(loc.code);
              html += `<div class="front-cell s-${status}${nc.cls} ${sel ? 'selected' : ''}"
                data-loc="${loc.code}"
                onclick="App._toccaVano('${loc.code}')"
                oncontextmenu="event.preventDefault();App._mapToggleDisable('${loc.code}')"
                ondragover="App._udcDragOver(event,'${loc.code}')"
                ondragleave="App._udcDragLeave(event)"
                ondrop="App._udcDrop(event,'${loc.code}')"
                title="${loc.code} — ${status}${items.length ? ' · '+items.length+' item' : ''}${nc.title}">
                ${String(b).padStart(2,'0')}${items.length ? `<span class="fc-badge">${items.length}</span>` : ''}${nc.badge}${this._udcNelVanoHTML(loc.code, 44)}
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
      html += `<div class="front-section"><div class="front-section-title">${this._ico('package')} Floor — Stoccaggio a terra</div>
        <div class="floor-zone-vis" style="grid-template-columns:28px repeat(${cols}, 1fr)">`;
      for (let r = 1; r <= rows; r++) {
        html += `<div class="floor-row-label">F${String(r).padStart(2,'0')}</div>`;
        for (let c = 1; c <= cols; c++) {
          const loc = locs.find((l: Ubicazione) => l.row === r && l.position === c);
          if (loc) {
            const status = Store.getLocationStatus(loc.code);
            const items = Store.getItemsAtLocation(loc.code);
            const sel = this.selectedLocation === loc.code;
            const stLbl = status === 'empty' ? '—' : status === 'occupied' ? 'pallet' : status === 'blocked' ? 'BLOCK' : status === 'disabled' ? 'OFF' : 'RIS';
            const nc = this._segnoConformita(loc.code);
            html += `<div class="floor-pallet fp-${status}${nc.cls} ${sel ? 'selected' : ''}"
              data-loc="${loc.code}"
              onclick="App._toccaVano('${loc.code}')"
              oncontextmenu="event.preventDefault();App._mapToggleDisable('${loc.code}')"
              ondragover="App._udcDragOver(event,'${loc.code}')"
              ondragleave="App._udcDragLeave(event)"
              ondrop="App._udcDrop(event,'${loc.code}')"
              title="${loc.code} — ${status}${nc.title}">
              <span class="fp-code">P${String(c).padStart(2,'0')}</span>
              <span class="fp-sub">${stLbl}</span>
              ${items.length ? `<span class="fp-badge">${items.length}</span>` : ''}${nc.badge}${this._udcNelVanoHTML(loc.code, 60)}
            </div>`;
          }
        }
      }
      html += '</div></div>';
    } else if (zone.type === 'BULK') {
      const cols = zone.grid_cols || Math.ceil(Math.sqrt(zone.positions || 1));
      html += `<div class="front-section"><div class="front-section-title">${this._ico('clipboard-text')} Bulk — Area libera</div>
        <div class="bulk-zone-vis" style="grid-template-columns:repeat(${cols}, 56px)">`;
      for (const loc of locs) {
        const status = Store.getLocationStatus(loc.code);
        const items = Store.getItemsAtLocation(loc.code);
        const sel = this.selectedLocation === loc.code;
        const nc = this._segnoConformita(loc.code);
        html += `<div class="floor-pallet fp-${status}${nc.cls} ${sel ? 'selected' : ''}"
          data-loc="${loc.code}"
          onclick="App._toccaVano('${loc.code}')"
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
} satisfies Vista;
