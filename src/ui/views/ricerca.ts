import { type Vista, $ } from './vista';
import { debounce } from '../../core/utils';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';

export const VistaRicerca: Vista = {
  _searchLimits: { items: 50, locs: 30, arts: 30 },
  _searchHits: [],        // risultati appiattiti nell'ordine di visualizzazione
  _searchSel: -1,         // indice della riga evidenziata (navigazione a frecce)
  _searchOutsideHandler: null,

  /* Criteri identici alla v2.6.0. Nessun filtro aggiunto, nessuno tolto. */
  _searchAll(q) {
    const items = Store.findItemLocations(q);
    // Ricerca ubicazioni
    const locs = [];
    const qUpper = q.toUpperCase();
    for (const site of Store.getSites()) {
      for (const zone of (site.zones || []).filter(z => z.active)) {
        for (const loc of Store.generateLocations(site.id, zone.id)) {
          if (loc.code.includes(qUpper)) {
            locs.push({ ...loc, siteName: site.name, zoneName: zone.name, status: Store.getLocationStatus(loc.code), itemCount: Store.getItemsAtLocation(loc.code).length });
          }
        }
      }
    }
    // Articoli in anagrafica
    const arts = Store.getArticles().filter(a =>
      a.code.toLowerCase().includes(q.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(q.toLowerCase())
    );
    return { items, locs, arts };
  },

  /* Il debounce protegge le anagrafiche grandi: con 11.000 articoli filtrare a
     ogni battuta significa filtrare dieci volte per una parola di dieci lettere. */
  _searchDebounced: null,
  _onSearchInput() {
    const input = $('hdrSearchInput');
    const wrap = $('hdrSearch');
    wrap?.classList.toggle('has-query', Boolean(input?.value));
    if (!this._searchDebounced) {
      this._searchDebounced = debounce(() => this._renderSearchPopup(), 180);
    }
    this._searchDebounced();
  },

  _onSearchFocus() {
    const q = Validate.clean($('hdrSearchInput')?.value);
    if (q && q.length >= 2) this._renderSearchPopup();
  },

  _onSearchKeydown(e) {
    const pop = $('searchPop');
    const open = pop && !pop.hidden;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (open) this.closeSearchPop(); else this.clearSearch();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open || !this._searchHits.length) return;
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const n = this._searchHits.length;
      this._searchSel = (this._searchSel + delta + n) % n;
      this._highlightSearchSel();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!open) { this._renderSearchPopup(); return; }
      /* Senza selezione esplicita si apre il primo risultato: e' cio' che si
         aspetta chi digita un codice completo e batte Invio senza guardare. */
      const idx = this._searchSel >= 0 ? this._searchSel : 0;
      this._openSearchHit(idx);
    }
  },

  _highlightSearchSel() {
    const pop = $('searchPop');
    if (!pop) return;
    const rows = pop.querySelectorAll('.search-hit');
    rows.forEach((r: any, i: any) => r.classList.toggle('sel', i === this._searchSel));
    rows[this._searchSel]?.scrollIntoView({ block: 'nearest' });
  },

  clearSearch() {
    const input = $('hdrSearchInput');
    if (input) input.value = '';
    $('hdrSearch')?.classList.remove('has-query');
    this.closeSearchPop();
    input?.focus();
  },

  closeSearchPop() {
    const pop = $('searchPop');
    if (pop) { pop.hidden = true; pop.innerHTML = ''; }
    $('hdrSearchInput')?.setAttribute('aria-expanded', 'false');
    this._searchHits = [];
    this._searchSel = -1;
    if (this._searchOutsideHandler) {
      document.removeEventListener('mousedown', this._searchOutsideHandler, true);
      this._searchOutsideHandler = null;
    }
  },

  _armSearchOutsideClose() {
    if (this._searchOutsideHandler) return;
    this._searchOutsideHandler = (ev: any) => {
      if (!$('hdrSearch')?.contains(ev.target)) this.closeSearchPop();
    };
    document.addEventListener('mousedown', this._searchOutsideHandler, true);
  },

  _renderSearchPopup() {
    const pop = $('searchPop');
    const input = $('hdrSearchInput');
    if (!pop || !input) return;
    const q = Validate.clean(input.value);
    if (!q || q.length < 2) { this.closeSearchPop(); return; }

    const { items, locs, arts } = this._searchAll(q);
    const L = this._searchLimits;
    this._searchHits = [];
    this._searchSel = -1;

    const section = (icon: any, title: any, total: any, shown: any, body: any) => `
      <div class="search-pop-sec">
        <div class="search-pop-head"><span>${icon} ${title}</span><span class="search-pop-count">${total}</span></div>
        ${body}
        ${total > shown ? `<div class="search-pop-more">… altri ${total - shown} risultati: restringi la ricerca</div>` : ''}
      </div>`;

    // ── Item a magazzino ──
    let itemsHtml = '';
    for (const it of items.slice(0, L.items)) {
      const i = this._searchHits.length;
      this._searchHits.push({ kind: 'loc', code: it.location_code });
      const qty = it.qty || 1;
      itemsHtml += `<div class="search-hit" role="option" data-idx="${i}" onclick="App._openSearchHit(${i})">
        <div class="search-hit-main">
          <div><span class="search-hit-code">${this._esc(it.article_code)}</span> <span class="search-hit-desc">${this._esc(it.article_description || '')}</span></div>
          <div class="search-hit-sub">Lotto <strong>${this._esc(it.lot_code)}</strong> · 📍 <span class="search-hit-loc">${this._esc(it.location_code)}</span>${it.expiry_date ? ` · Scad. ${this._esc(it.expiry_date)}` : ''}</div>
        </div>
        <span class="search-hit-qty">${qty} Coll.</span>
        <span class="search-hit-go">→</span>
      </div>`;
    }
    if (!itemsHtml) itemsHtml = '<div class="search-pop-empty">Nessun item a magazzino</div>';

    // ── Ubicazioni ──
    let locsHtml = '';
    for (const l of locs.slice(0, L.locs)) {
      const i = this._searchHits.length;
      this._searchHits.push({ kind: 'loc', code: l.code });
      const badge = l.status === 'occupied' ? 'green' : l.status === 'blocked' ? 'red' : l.status === 'reserved' ? 'amber' : 'muted';
      locsHtml += `<div class="search-hit" role="option" data-idx="${i}" onclick="App._openSearchHit(${i})">
        <div class="search-hit-main">
          <div><span class="search-hit-loc">${this._esc(l.code)}</span></div>
          <div class="search-hit-sub">${this._esc(l.siteName)} · ${this._esc(l.zoneName)}</div>
        </div>
        <span class="badge badge-${badge}">${l.status}</span>
        ${l.itemCount ? `<span class="search-hit-qty">${l.itemCount} item</span>` : ''}
        <span class="search-hit-go">→</span>
      </div>`;
    }
    if (!locsHtml) locsHtml = '<div class="search-pop-empty">Nessuna ubicazione</div>';

    let artsHtml = '';
    for (const a of arts.slice(0, L.arts)) {
      const where = Store.findItemLocations(a.code).filter(it => it.article_code === a.code);
      const i = this._searchHits.length;
      this._searchHits.push(
        where.length === 1 ? { kind: 'loc', code: where[0]!.location_code } : { kind: 'article', code: a.code, count: where.length }
      );
      const stock = where.length === 0
        ? '<span class="search-pop-empty" style="padding:0">non a magazzino</span>'
        : where.length === 1
          ? `📍 <span class="search-hit-loc">${this._esc(where[0]!.location_code)}</span>`
          : `📍 ${where.length} ubicazioni`;
      artsHtml += `<div class="search-hit" role="option" data-idx="${i}" onclick="App._openSearchHit(${i})">
        <div class="search-hit-main">
          <div><span class="search-hit-code">${this._esc(a.code)}</span> <span class="search-hit-desc">${this._esc(a.description)}</span></div>
          <div class="search-hit-sub">${stock}</div>
        </div>
        <span class="badge badge-muted">${this._esc(a.category || 'MP')}</span>
        ${where.length ? '<span class="search-hit-go">→</span>' : ''}
      </div>`;
    }
    if (!artsHtml) artsHtml = '<div class="search-pop-empty">Nessun articolo in anagrafica</div>';

    pop.innerHTML =
      section('📦', 'Item a magazzino', items.length, Math.min(items.length, L.items), itemsHtml) +
      section('📍', 'Ubicazioni', locs.length, Math.min(locs.length, L.locs), locsHtml) +
      section('📘', 'Articoli in anagrafica', arts.length, Math.min(arts.length, L.arts), artsHtml);
    pop.hidden = false;
    pop.scrollTop = 0;
    input.setAttribute('aria-expanded', 'true');
    this._armSearchOutsideClose();
  },

  _openSearchHit(idx) {
    const hit = this._searchHits[idx];
    if (!hit) return;
    if (hit.kind === 'loc') {
      /* Il campo si svuota ma il fuoco NON torna alla ricerca: si sta andando
         sulla mappa, e un cursore lampeggiante lassu' inviterebbe a ridigitare. */
      const input = $('hdrSearchInput');
      if (input) input.value = '';
      $('hdrSearch')?.classList.remove('has-query');
      this.closeSearchPop();
      this.goToLocation(hit.code);
      return;
    }
    /* Articolo su piu' ubicazioni: si riscrive la ricerca sul codice esatto,
       cosi' la sezione "Item a magazzino" elenca proprio quelle ubicazioni. */
    const input = $('hdrSearchInput');
    if (input) {
      input.value = hit.code;
      input.focus();
      $('hdrSearch')?.classList.add('has-query');
    }
    this._renderSearchPopup();
    this.toast(`${hit.code} presente in ${hit.count} ubicazioni — scegli quale aprire`, 'info');
  },
};
