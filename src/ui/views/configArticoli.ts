import { type Vista, $ } from './vista';
import { debounce, _h } from '../../core/utils';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { etichettaDi } from '../../modules/parametri';
import { descriviModello as descriviModelloImballo } from '../../modules/imballo';
import {
  CERTIFICAZIONI, leggiAllergeni, leggiCodici, scriviAllergeni,
  leggiCertificazioni, scriviCertificazioni, leggiClasseTemperatura,
  etichettaAllergene, etichettaClasse, etichettaCertificazione,
} from '../../modules/anagrafica';
import {
  etichettaUnita, formattaQuantita, validaConfigurazione,
  valoriAmmessi as valoriAmmessiUM, descrivi as descriviColli,
} from '../../modules/misure';
import {
  descriviColli as descriviElenco, verificaColli as verificaElenco,
} from '../../modules/colli';
import { Dialog } from '../dialog';

/* L avviso che un articolo si porta dietro: allergeni, temperatura,
   pericolosita. Nasce in un punto solo e si stampa in due. */
type AvvisoArticolo = { tipo: string; icona: string; et: string; testo: string };

export const VistaConfigArticoli = {
  _onArtFilterInput(value) {
    if (!this._artFilterDebounced) {
      this._artFilterDebounced = debounce((v) => {
        this._artFilter = v;
        this._renderConfigArticles($('configContent'));
      }, 300);
    }
    this._artFilterDebounced(value);
  },

  _renderConfigArticles(el) {
    let articles = Store.getArticles();
    const total = articles.length;
    const catCounts: Record<string, number> = {};
    articles.forEach(a => { const c = a.category || '—'; catCounts[c] = (catCounts[c] || 0) + 1; });
    const q = this._artFilter.toLowerCase();
    if (q) articles = articles.filter(a => a.code.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q));
    const [field, dir] = this._artSort.split('_');
    articles.sort((a, b) => {
      const va = field === 'code' ? a.code : field === 'desc' ? a.description : (a.category || '');
      const vb = field === 'code' ? b.code : field === 'desc' ? b.description : (b.category || '');
      return dir === 'asc' ? va!.localeCompare(vb!) : vb!.localeCompare(va!);
    });
    // Chrome statico via template literal
    let html = `<div class="config-card">
      <h3>Anagrafica Articoli (${total}) <button class="btn btn-sm btn-primary float-right" onclick="App.showAddArticleModal()">+ Nuovo</button></h3>
      <div class="flex gap-3 mb-5 flex-wrap text-label-small">
        ${Object.entries(catCounts).sort().map(([c,n]) => `<span class="badge badge-muted">${this._esc(c)}: ${n}</span>`).join('')}
      </div>
      <div class="flex gap-4 mb-5 flex-wrap">
        <button class="btn btn-sm btn-success" onclick="App.importArticlesExcel()">📥 Import Excel</button>
        <button class="btn btn-sm btn-accent" onclick="App.exportArticlesExcel()">📊 Export Excel</button>
      </div>
      <div class="flex gap-4 mb-5 flex-wrap">
        <input class="input flex-1 min-w-[140px]" id="artFilterInput" value="${this._esc(this._artFilter)}" placeholder="🔍 Filtra... (debounce 300ms)"
          oninput="App._onArtFilterInput(this.value)">
        <select class="select" class="w-auto min-w-[140px]" onchange="App._artSort=this.value;App._renderConfigArticles($('configContent'))">
          <option value="code_asc" ${this._artSort==='code_asc'?'selected':''}>Codice A→Z</option>
          <option value="code_desc" ${this._artSort==='code_desc'?'selected':''}>Codice Z→A</option>
          <option value="desc_asc" ${this._artSort==='desc_asc'?'selected':''}>Descrizione A→Z</option>
          <option value="cat_asc" ${this._artSort==='cat_asc'?'selected':''}>Categoria</option>
        </select>
      </div>`;
    if (!articles.length) {
      html += `<div class="empty-state"><p>${q ? 'Nessun risultato per "' + this._esc(q) + '"' : 'Nessun articolo'}</p></div>`;
      html += `</div>
        <div class="config-card">
          <h3>Import da CSV</h3>
          <p class="text-body-small text-sx-text-secondary mb-3">Formato: <span class="mono">codice;descrizione;categoria</span></p>
          <textarea class="textarea" id="csvImportArea" placeholder="MP-001234;Vitamina C 500mg;MP&#10;PF-005678;Omega 3 60cps;PF" rows="3"></textarea>
          <button class="btn btn-sm btn-success mt-3" onclick="App.importArticlesCSV()">📥 Importa CSV</button>
        </div>`;
      el.innerHTML = html;
      return;
    }
    // Chrome con tabella vuota da popolare via DOM API
    html += `<div class="text-label-small text-sx-text-muted mb-2">${articles.length}${q ? ' / ' + total : ''} articoli</div>
      <div class="overflow-x-auto"><table class="sx-table"><thead><tr><th>Codice</th><th>Descrizione</th><th>Cat.</th><th>UM</th><th class="w-[100px]">Azioni</th></tr></thead><tbody id="artTbody"></tbody></table></div>`;
    html += `</div>
      <div class="config-card">
        <h3>Import da CSV</h3>
        <p class="text-body-small text-sx-text-secondary mb-3">Formato: <span class="mono">codice;descrizione;categoria</span></p>
        <textarea class="textarea" id="csvImportArea" placeholder="MP-001234;Vitamina C 500mg;MP&#10;PF-005678;Omega 3 60cps;PF" rows="3"></textarea>
        <button class="btn btn-sm btn-success mt-3" onclick="App.importArticlesCSV()">📥 Importa CSV</button>
      </div>`;
    el.innerHTML = html;
    // Costruisco le righe in un DocumentFragment (singolo reflow finale)
    const tbody = $('artTbody');
    const frag = document.createDocumentFragment();
    for (const art of articles) {
      const code = art.code;
      const desc = art.description || '';
      const cat = art.category || '—';
      const unit = art.unit || 'PZ';
      const tr = _h('tr', {}, [
        _h('td', {}, [_h('span', { class: 'mono', style: { fontWeight: '700', color: 'var(--sx-success)' } }, [code])]),
        _h('td', {}, [desc]),
        _h('td', {}, [_h('span', { class: 'badge badge-muted' }, [cat])]),
        _h('td', { class: 'mono', style: { fontSize: '0.72rem' } }, [unit]),
        _h('td', { style: { whiteSpace: 'nowrap' } }, [
          _h('button', {
            class: 'btn btn-sm',
            onclick: () => this.showEditArticleModal(code)
          }, ['✏️']),
          ' ',
          _h('button', {
            class: 'btn btn-sm btn-danger',
            onclick: () => this.confirmDeleteArticle(code)
          }, ['🗑'])
        ])
      ]);
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    const fi = $('artFilterInput');
    if (fi && q) { fi.focus(); try { fi.setSelectionRange(q.length, q.length); } catch {} }
  },  showAddArticleModal() {
    this.showModal('Nuovo Articolo', `
      <div class="form-row mb-6">
        <div class="form-group"><label>Codice <span class="req">*</span></label>
          <input class="input input-mono uppercase" id="artCode" placeholder="MP-001234" maxlength="${Validate.MAX.ARTICLE_CODE}"
            oninput="App._precompilaCategoria()"></div>
        <div class="form-group"><label>Categoria</label>
          <input class="input input-mono" id="artCategory" placeholder="MP" value="MP"
            oninput="this.dataset.tocca='1'"></div>
      </div>
      <div class="text-label-small text-sx-text-muted -mt-3.5 mx-0 mb-6">
        La categoria si compila da sé coi <strong>primi 3 caratteri</strong> del codice — è la forma più comune, non una regola: si può riscrivere.
      </div>
      <div class="form-group mb-6"><label>Descrizione <span class="req">*</span></label>
        <input class="input" id="artDesc" placeholder="Descrizione articolo" maxlength="${Validate.MAX.ARTICLE_DESC}"></div>
      <div class="form-row mb-6">
        <div class="form-group"><label>Fornitore / Cliente</label>
          <input class="input" id="artSupplier" maxlength="80"></div>
        <div class="form-group"><label>UM</label>
          <input class="input input-mono uppercase" id="artUnit" value="PZ" maxlength="5"
            list="umAmmesse" oninput="App._aggiornaNotaUM('art')"></div>
      </div>
      ${this._datalistUM()}
      <!-- 1.6 — PESO UNITARIO E PESO NETTO PER COLLO SONO USCITI (D15).
           Non erano dati che il magazzino gestisce, e stando accanto alla
           quantità per collo facevano credere che servissero tutti e tre. -->
      <div class="form-row-3 mb-3">
        <div class="form-group"><label>Quantità per collo (UM)</label><input class="input" id="artPiecesPack" type="number" step="0.001" min="0" value="0" oninput="App._aggiornaNotaUM('art')"></div>
        <div class="form-group"><label>Stock Min</label><input class="input" id="artMinStock" type="number" step="1" min="0" value="0"></div>
        <div class="form-group"><label>Stock Max</label><input class="input" id="artMaxStock" type="number" step="1" min="0" value="0"></div>
      </div>
      <div class="text-label-small text-sx-text-muted mb-6">
        📄 La quantità per collo è la riga che decide se l'articolo è gestito a unità di misura. A zero, resta a soli colli.
      </div>
      ${this._notaUM('art')}
      ${this._campoImballo(null, 'art')}
      ${this._campiAttributiArticolo(null, 'art')}
      <div class="form-group"><label>Note</label>
        <input class="input" id="artNotes" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doAddArticle()">Crea</button>`);
    /* La nota dice cosa si sta configurando: deve dirlo gia' all'apertura,
       non dal primo tasto. La maschera esiste solo dopo `showModal`. */
    this._aggiornaNotaUM('art');
  },

  /* 1.6 — LA CATEGORIA SI PRECOMPILA, E BASTA. I primi tre caratteri del
     codice sono la categoria nella grande maggioranza dei casi, ma non è una
     regola ferrea: ci sono articoli che non la seguono. Quindi si suggerisce
     e non si impone — e appena qualcuno tocca il campo, il suggerimento si
     ferma: `dataset.tocca` è il segno che una scelta è stata fatta, e
     riscriverla al tasto dopo sarebbe cancellarla. */
  _precompilaCategoria() {
    const cat = $('artCategory');
    const code = $('artCode');
    if (!cat || !code || cat.dataset.tocca === '1') return;
    const primi = String(code.value || '').trim().toUpperCase().slice(0, 3);
    if (primi) cat.value = primi;
  },

  async doAddArticle() {
    const code = Validate.clean($('artCode').value, true);
    const desc = Validate.clean($('artDesc').value);
    const cat = Validate.clean($('artCategory').value) || 'MP';
    const errs = [Validate.article(code), Validate.articleDesc(desc, true), Validate.category(cat)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    const ok = await Store.addArticle({
      code, description: desc, category: cat,
      supplier: Validate.clean($('artSupplier').value),
      unit: Validate.clean($('artUnit').value, true) || 'PZ',
      pieces_per_pack: $('artPiecesPack').value,   // v3.0.0 [M4]
      min_stock: $('artMinStock').value,
      max_stock: $('artMaxStock').value,
      notes: Validate.clean($('artNotes').value),
      pallet_model: $('artImballo')?.value || '',
      ...this._leggiAttributiArticolo('art')
    });
    if (!ok) return this.toast('Codice articolo già presente', 'error');
    this.closeModal();
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Articolo ${code} creato`, 'success');
  },

  /* ═══ AVVISI MERCEOLOGICI ═══════════════════════════════════════════
     Temperatura, allergeni e certificazioni stanno in anagrafica, ma
     servono DOVE LA MERCE SI TOCCA: davanti allo scaffale, sul report
     dell'ODP e sul DDT che accompagna il camion. Chi ha in mano il collo
     non apre la Configurazione per controllare, e un surgelato lasciato su
     un bancale a temperatura ambiente non torna indietro.

     Una sorgente sola per tre viste, perche' tre elenchi scritti a mano
     divergono: e un avviso che compare al prelievo ma non sul DDT e' peggio
     di nessun avviso, perche' insegna a non fidarsi.

     Un articolo senza attributi non produce avvisi. Il silenzio qui vuol
     dire «non e' stato classificato», non «e' a posto» — e la differenza si
     legge in Configurazione, dove si conta chi manca. */
  _avvisiArticolo(code: string): AvvisoArticolo[] {
    const a = Store.getArticle(code);
    if (!a) return [];
    const out: AvvisoArticolo[] = [];
    if (a.temp_class) {
      out.push({ tipo: 'temp', icona: '🌡', et: 'Conservazione', testo: etichettaClasse(a.temp_class) });
    }
    if (a.allergens?.length) {
      out.push({ tipo: 'all', icona: '⚠️', et: 'Allergeni', testo: a.allergens.map(c => this._etAllergene(c)).join(', ') });
    }
    if (a.certifications?.length) {
      out.push({ tipo: 'cert', icona: '✓', et: 'Certificazioni', testo: a.certifications.map(etichettaCertificazione).join(', ') });
    }
    /* 1.6 — la pericolosità viaggia come gli altri due: davanti allo
       scaffale, sul report e sul DDT. Chi ha in mano un collo di
       infiammabile deve saperlo lì, non in Configurazione. */
    if (a.hazards?.length) {
      const ammessi = Store.getPericoli();
      out.push({ tipo: 'haz', icona: '☣', et: 'Pericolosità',
                 testo: a.hazards.map(h => etichettaDi(ammessi, h)).join(', ') });
    }
    return out;
  },

  /** A video: una fascia, dove c'è spazio per leggerla per intero. */
  _avvisiBanda(code: string) {
    const av: AvvisoArticolo[] = this._avvisiArticolo(code);
    if (!av.length) return '';
    return `<div class="avv-banda">${av.map((x) => `
      <div class="avv-riga avv-riga--${x.tipo}">
        <span class="avv-ico">${x.icona}</span>
        <span class="avv-et">${this._esc(x.et)}</span>
        <b>${this._esc(x.testo)}</b>
      </div>`).join('')}</div>`;
  },

  /** In stampa: una riga sola sotto la descrizione, e nient'altro. */
  _avvisiRigaStampa(code: string) {
    const av: AvvisoArticolo[] = this._avvisiArticolo(code);
    if (!av.length) return '';
    return `<div class="avv-stampa">${
      av.map((x) => `${x.icona} ${this._esc(x.testo)}`).join(' · ')}</div>`;
  },

  /* 1.4.0 — i due attributi che il motore di stoccaggio usera' come vincoli
     duri. Stessi controlli in creazione e in modifica: due maschere che
     divergono sono due maschere che prima o poi si contraddicono. */
  /* 1.4.2 — LA COLONNA «UM» E' UNA SOLA, ED ESISTE DALLA v1.
     `unit` e' gia' etichettato UM nella maschera, nella tabella articoli e
     nella colonna dell'export: aggiungergliene accanto una seconda sarebbe
     due campi con lo stesso nome. Qui non se ne aggiunge nessuna — si
     suggeriscono le cinque unita' che il motore sa dividere, lasciando
     scrivere qualunque cosa come ha sempre fatto. Cio' che non e' fra le
     cinque si legge come «non gestita», e non succede niente. */
  _datalistUM() {
    /* 1.6 — le cinque che il motore sa dividere, più quelle configurate in
       Impostazioni. Restano un suggerimento e non un vincolo: ciò che non è
       fra le cinque si legge come «non gestita», e non succede niente. */
    return `<datalist id="umAmmesse">${Store.getUnitaAmmesse()
      .map(u => `<option value="${u.code}">${this._esc(u.label)}</option>`).join('')}</datalist>`;
  },

  /* La riga sotto «quantita' per collo» che dice cosa si sta configurando.
     Non blocca niente: un'anagrafica a meta' e' il punto di partenza, non
     un errore. */
  _notaUM(p) {
    return `<div class="text-label-small text-sx-text-muted mb-6" id="${p}NotaUM"></div>`;
  },

  _aggiornaNotaUM(p) {
    const box = $(`${p}NotaUM`);
    if (!box) return;
    const um = $(`${p}Unit`)?.value || '';
    const per = $(`${p}PiecesPack`)?.value || '';
    const errori = validaConfigurazione(um, per);
    if (errori.length) {
      box.textContent = '⚖ ' + errori.join(' · ');
      box.style.color = 'var(--sx-warning)';
      return;
    }
    const n = Number(String(per).replace(',', '.'));
    box.style.color = 'var(--sx-text-muted)';
    box.textContent = n > 0
      ? `⚖ Un collo pieno contiene ${formattaQuantita(n, um)} ${um} — ${etichettaUnita(um)}. Il collo incompleto si calcola.`
      : '⚖ Nessuna unità: l\'articolo si gestisce a soli colli, come prima.';
  },

  /* COME SI LEGGE UNA RIGA DI GIACENZA DALLA 1.4.2: «10 × 1.000 + 1 × 100 PZ».
     Vuota quando la riga e' a soli colli — cioe' sempre, finche' l'interruttore
     resta spento e finche' nessuno compila la quantita' per collo. La stessa
     riga vale a video, in etichetta e sul report: tre formattazioni dello
     stesso numero, per chi legge, sono tre numeri diversi. */
  _rigaUM(item) {
    const cfg = Store.getUomConfig(item?.article_code, item?.lot_code);
    /* 1.8 — dove la riga porta l'elenco, la riga la descrive l'elenco: sono i
       colli veri, uno per uno, e possono essere tutti di misura diversa. La
       suddivisione calcolata qui sotto non saprebbe raccontarli. */
    if (cfg && Array.isArray(item?.packs)) {
      const elenco = Store.colliDiRiga(item);
      if (elenco) {
        const v = verificaElenco(item.qty, item.qty_uom, elenco, cfg.uom);
        const scarto = v && !v.ok
          ? ` <span class="badge badge-amber" title="I colli dichiarati non corrispondono all'elenco: ne risulterebbero ${v.colliAttesi}">⚠️ ${v.scarto > 0 ? '+' : ''}${v.scarto} coll.</span>`
          : '';
        return `<div class="item-meta">⚖ ${this._esc(descriviElenco(elenco, cfg.uom))}${scarto}</div>`;
      }
    }
    if (!cfg?.per_collo) return '';
    const s = Store.suddivisioneDi(item);
    if (!s || !s.colli) return '';
    const totale = s.pieni * cfg.per_collo + s.resto;
    /* Lo SCARTO fra colli dichiarati e UM non si corregge da solo: si mostra.
       Correggere un saldo senza che nessuno abbia guardato la merce e'
       precisamente il modo di scriverne uno sbagliato ma plausibile. */
    const v = Store.verificaUom(item);
    const avviso = v && !v.ok
      ? ` <span class="badge badge-amber" title="I colli dichiarati non corrispondono alle UM: ne risulterebbero ${v.colliAttesi}">⚠️ ${v.scarto > 0 ? '+' : ''}${v.scarto} coll.</span>`
      : '';
    const incompleto = s.incompleto
      ? ' <span class="badge badge-muted" title="L\'ultimo collo non è pieno">collo incompleto</span>'
      : '';
    return `<div class="item-meta">⚖ ${this._esc(descriviColli(totale, cfg.per_collo, cfg.uom))}${incompleto}${avviso}</div>`;
  },

  /* 1.6 — LE TENDINE NON SONO PIÙ NEL SORGENTE. Classi, allergeni e
     pericolosità arrivano da Store, che unisce i valori di legge con quelli
     configurati in Impostazioni → Parametri articolo. I 14 del Reg. UE
     1169/2011 restano davanti e non si possono togliere — D18. */
  /* 1.6 — L'ETICHETTA DI UN ALLERGENE PUO' NON STARE PIU' NELLA TABELLA.
     `etichettaAllergene` conosce i 14 di legge e ripiega sul codice per
     tutto il resto: da quando D18 lascia aggiungere voci aziendali, quel
     ripiego si vede — «LATTOSIO» al posto di «Lattosio», davanti a un
     operatore e su un verbale. Trovato provando la 1.6 nel browser.
     Un punto solo, perche' la stessa etichetta esce in sei. */
  _etAllergene(code) {
    return etichettaDi(Store.getAllergeniAmmessi(), code);
  },

  _campiAttributiArticolo(art, p) {
    const attuale = art?.temp_class || '';
    const scelti = new Set(art?.allergens || []);
    const opzioni = Store.getClassiConservazione().map(c =>
      `<option value="${c.code}" ${attuale === c.code ? 'selected' : ''}>${this._esc(c.label)}</option>`
    ).join('');
    const caselle = Store.getAllergeniAmmessi().map(a =>
      `<label class="all-chip ${scelti.has(a.code) ? 'on' : ''}" ${a.fissa ? '' : 'title="Voce aziendale, aggiunta in Impostazioni"'}>
        <input type="checkbox" id="${p}All_${a.code}" value="${a.code}" ${scelti.has(a.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(a.label)}${a.fissa ? '' : ' •'}</label>`
    ).join('');
    /* La pericolosità dice dove una cosa NON si può mettere, ed è la metà
       d'articolo della spunta sulla zona. Nasce configurabile per intero:
       non è una norma di etichettatura, è una politica di magazzino. */
    const pericoli = Store.getPericoli();
    const periScelti = new Set(art?.hazards || []);
    const pericolose = pericoli.length ? pericoli.map(h =>
      `<label class="all-chip ${periScelti.has(h.code) ? 'on' : ''}">
        <input type="checkbox" id="${p}Haz_${h.code}" value="${h.code}" ${periScelti.has(h.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(h.label)}</label>`
    ).join('') : '';
    /* 1.4.0 — le certificazioni non sono un vincolo di stoccaggio: sono un
       fatto che deve arrivare fino all'operatore e fino al DDT. Stessa
       maschera degli allergeni perche' si compilano nello stesso momento. */
    const certScelte = new Set(art?.certifications || []);
    const certificati = CERTIFICAZIONI.map(c =>
      `<label class="all-chip ${certScelte.has(c.code) ? 'on' : ''}">
        <input type="checkbox" id="${p}Cert_${c.code}" value="${c.code}" ${certScelte.has(c.code) ? 'checked' : ''}
          onchange="this.parentElement.classList.toggle('on',this.checked)">
        ${this._esc(c.label)}</label>`
    ).join('');
    return `
      <div class="form-group mb-5"><label>Classe di conservazione</label>
        <select class="input" id="${p}TempClass">
          <option value="">— non classificato —</option>${opzioni}
        </select></div>
      <div class="form-group mb-3"><label>Allergeni (Reg. UE 1169/2011, più le voci aziendali •)</label>
        <div class="all-grid">${caselle}</div></div>
      ${pericolose ? `<div class="form-group mb-3"><label>Pericolosità</label>
        <div class="all-grid">${pericolose}</div></div>` : ''}
      <div class="form-group mb-3"><label>Certificazioni</label>
        <div class="all-grid">${certificati}</div></div>
      <div class="text-label-small text-sx-text-muted mb-6">
        🧭 Con questi la <strong>mappa</strong> segnala la merce fuori posto, e prelievo e DDT
        avvisano l'operatore. Lasciati vuoti, l'articolo non viene verificato.
      </div>`;
  },

  /* 2.20 — IL MODELLO DI IMBALLO NON È UN ATTRIBUTO MERCEOLOGICO, e sta in
     un metodo suo: gli attributi qui sopra usano `null` per cancellare una
     classificazione, questo è un codice che punta ai `meta.imballi` e segue
     la regola dei campi di testo. Se nessun modello è configurato la riga
     non compare: una tendina vuota è una domanda senza risposte. */
  _campoImballo(art, p) {
    const modelli = Store.getModelliImballo();
    if (!modelli.length) return '';
    const scelto = String(art?.pallet_model || '');
    const opzioni = modelli.map(m =>
      `<option value="${this._esc(m.code)}" ${scelto === m.code ? 'selected' : ''}>${this._esc(descriviModelloImballo(m))}</option>`
    ).join('');
    return `
      <div class="form-group mb-5"><label>Modello di imballo</label>
        <select class="input" id="${p}Imballo">
          <option value="">— nessuno —</option>${opzioni}
        </select>
        <div class="text-label-small text-sx-text-muted mt-2">
          Da qui esce il <strong>numero di colli proposto</strong> quando si chiude un bancale
          di prodotto finito. Resta una proposta: chi imballa lo cambia senza dire perché.
        </div>
      </div>`;
  },

  _leggiAttributiArticolo(p) {
    const cls = $(`${p}TempClass`)?.value || '';
    const allergens = Store.getAllergeniAmmessi()
      .filter(a => $(`${p}All_${a.code}`)?.checked)
      .map(a => a.code);
    const hazards = Store.getPericoli()
      .filter(h => $(`${p}Haz_${h.code}`)?.checked)
      .map(h => h.code);
    /* Nessuna casella spuntata qui vuol dire NON CLASSIFICATO, non «verificato,
       non ne ha»: da una maschera non si distingue chi ha guardato da chi e'
       passato oltre. Per dichiarare l'assenza c'e' NESSUNO nella colonna del
       foglio Excel, che qualcuno ha dovuto scrivere apposta.
       null cancella una classificazione messa per sbaglio. */
    const certifications = CERTIFICAZIONI
      .filter(c => $(`${p}Cert_${c.code}`)?.checked)
      .map(c => c.code);
    return {
      temp_class: cls || null,
      allergens: allergens.length ? allergens : null,
      hazards: hazards.length ? hazards : null,
      certifications: certifications.length ? certifications : null,
    };
  },

  showEditArticleModal(code) {
    const art = Store.getArticle(code);
    if (!art) return;
    this.showModal(`Modifica Articolo — ${code}`, `
      <div class="form-row mb-6">
        <div class="form-group"><label>Codice (non mod.)</label>
          <input class="input input-mono" value="${this._esc(code)}" disabled></div>
        <div class="form-group"><label>Categoria</label>
          <input class="input input-mono" id="eaCategory" value="${this._esc(art.category || 'MP')}"></div>
      </div>
      <div class="form-group mb-6"><label>Descrizione <span class="req">*</span></label>
        <input class="input" id="eaDesc" value="${this._esc(art.description)}" maxlength="${Validate.MAX.ARTICLE_DESC}"></div>
      <div class="form-row mb-6">
        <div class="form-group"><label>Fornitore / Cliente</label>
          <input class="input" id="eaSupplier" value="${this._esc(art.supplier || '')}" maxlength="80"></div>
        <div class="form-group"><label>UM</label>
          <input class="input input-mono uppercase" id="eaUnit" value="${this._esc(art.unit || 'PZ')}" maxlength="5"
            list="umAmmesse" oninput="App._aggiornaNotaUM('ea')"></div>
      </div>
      ${this._datalistUM()}
      <!-- 1.6 — i due pesi sono usciti, D15: non sono dati che il magazzino gestisce -->
      <div class="form-row-3 mb-3">
        <div class="form-group"><label>Quantità per collo (UM)</label><input class="input" id="eaPiecesPack" type="number" step="0.001" min="0" value="${art.pieces_per_pack || 0}" oninput="App._aggiornaNotaUM('ea')"></div>
        <div class="form-group"><label>Stock Min</label><input class="input" id="eaMinStock" type="number" step="1" min="0" value="${art.min_stock || 0}"></div>
        <div class="form-group"><label>Stock Max</label><input class="input" id="eaMaxStock" type="number" step="1" min="0" value="${art.max_stock || 0}"></div>
      </div>
      <div class="text-label-small text-sx-text-muted mb-6">
        📄 La quantità per collo è la riga che decide se l'articolo è gestito a unità di misura. A zero, resta a soli colli.
      </div>
      ${this._notaUM('ea')}
      ${this._campoImballo(art, 'ea')}
      ${this._campiAttributiArticolo(art, 'ea')}
      <div class="form-group"><label>Note</label>
        <input class="input" id="eaNotes" value="${this._esc(art.notes || '')}" maxlength="${Validate.MAX.NOTES}"></div>
    `, `<button class="btn" onclick="App.closeModal()">Annulla</button>
        <button class="btn btn-primary" onclick="App.doEditArticle('${this._esc(code)}')">Salva</button>`);
    this._aggiornaNotaUM('ea');   // vedi showAddArticleModal
  },

  async doEditArticle(code) {
    const desc = Validate.clean($('eaDesc').value);
    const cat = Validate.clean($('eaCategory').value) || 'MP';
    const errs = [Validate.articleDesc(desc, true), Validate.category(cat)].filter(Boolean);
    if (errs.length) return this.toast(errs[0], 'error');
    await Store.updateArticle(code, {
      description: desc, category: cat,
      supplier: Validate.clean($('eaSupplier').value),
      unit: Validate.clean($('eaUnit').value, true) || 'PZ',
      pieces_per_pack: $('eaPiecesPack').value,    // v3.0.0 [M4]
      min_stock: $('eaMinStock').value,
      max_stock: $('eaMaxStock').value,
      notes: Validate.clean($('eaNotes').value),
      pallet_model: $('eaImballo')?.value || '',
      ...this._leggiAttributiArticolo('ea')
    });
    this.closeModal();
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ ${code} aggiornato`, 'success');
  },

  async confirmDeleteArticle(code) {
    /* v2.2.1 [F2] — migrato da confirm() nativo a Dialog (anti-scanner) */
    if (!await Dialog.confirm({
      title: 'Eliminare l\u2019articolo dall\u2019anagrafica?',
      message: 'Gli item già posizionati non saranno toccati.',
      details: Dialog.kv([['Articolo', code]]),
      confirmLabel: 'Elimina articolo', danger: true
    })) return;
    await Store.deleteArticle(code);
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`Articolo ${code} eliminato`, 'success');
  },
} satisfies Vista;
