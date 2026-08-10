import * as XLSX from 'xlsx';

// ═══════════════════════════════════════════════════════════════════
// © Andrea Sacchetti — Dietopack S.r.l.
// modulo OdpParser — v2.5.0
// Lettura dell'ordine di produzione esportato da Sage X3 (.xlsx)
//
// SCELTA DELLA SORGENTE. Il medesimo ordine è esportabile in PDF e in XLSX.
// Il confronto diretto sui due file ha dato: quantità a 3 decimali contro 6
// (14,790 contro 14.789618), date come testo contro seriale nativo, colonne
// ricostruite dal layout contro celle indirizzate. Il PDF è il documento di
// reparto; la sorgente dati è l'XLSX, che per giunta SheetJS — già caricato
// per l'import articoli — legge senza aggiungere alcuna dipendenza.
//
// ROBUSTEZZA. Il foglio contiene celle unite e colonne che si spostano fra
// una riga articolo e l'altra (le prime due righe del file di riferimento non
// hanno la colonna "quantità per unità"). Per questo il parser NON legge per
// indice fisso di colonna ma per ANCORE TESTUALI e per posizione relativa dei
// valori all'interno della riga.
// ═══════════════════════════════════════════════════════════════════

const OdpParser = {

  /* Etichette usate come ancore. Confronto normalizzato: maiuscolo, spazi
     multipli compressi, accenti irrilevanti perché mai in posizione utile. */
  _norm(v) {
    return String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  },

  _isBlank(v) {
    return v === null || v === undefined || String(v).trim() === '';
  },

  /* Conversione seriale Excel → ISO YYYY-MM-DD.
     Epoca 1899-12-30 (compensa il 1900 bisestile inesistente di Excel).
     Si preferisce XLSX.SSF quando disponibile: è l'implementazione della
     libreria stessa e gestisce i casi limite meglio di un calcolo manuale.
     Ritorna '' se il valore non è una data plausibile. */
  excelSerialToISO(v) {
    if (this._isBlank(v)) return '';
    // Già in forma testuale gg/mm/aaaa
    const txt = String(v).trim();
    const it = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (it) {
      const [, d, m, y] = it;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 2958465) return '';
    try {
      if (typeof XLSX !== 'undefined' && XLSX.SSF?.parse_date_code) {
        const d = XLSX.SSF.parse_date_code(n);
        if (d?.y) {
          return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
      }
    } catch (err) {
      console.warn('[WM] OdpParser: SSF non disponibile, uso il calcolo manuale', err);
    }
    const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
    const dt = new Date(ms);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  },

  /* Estrae dalla riga i valori numerici con la loro posizione, per poter
     ragionare su "l'ultimo numero della riga" senza dipendere dall'indice. */
  _numericCells(row) {
    const out = [];
    row.forEach((cell, idx) => {
      if (typeof cell === 'number' && Number.isFinite(cell)) out.push({ idx, value: cell });
    });
    return out;
  },

  /* ─────────────────────────────────────────────────────────────────
     PARSE PRINCIPALE
     Riceve un ArrayBuffer, ritorna:
       { ok, error?, header:{...}, lines:[...], warnings:[...] }
     Ogni line: { article_code, category, description, um, qty_per_unit,
                  total_qty, lots:[{lot_code, supplier_lot, um, qty,
                  expiry_iso, state}] }
     ───────────────────────────────────────────────────────────────── */
  parse(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      return { ok: false, error: 'Libreria Excel non disponibile: ricaricare la pagina con connessione attiva.' };
    }
    let rows;
    try {
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return { ok: false, error: 'Il file non contiene alcun foglio di lavoro.' };
      rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    } catch (err) {
      console.error('[WM] OdpParser.parse:', err);
      return { ok: false, error: 'File non leggibile come Excel: ' + err.message };
    }
    if (!rows?.length) return { ok: false, error: 'Il foglio di lavoro è vuoto.' };

    const warnings = [];
    const header = this._parseHeader(rows, warnings);
    if (!header.odp_num) {
      return { ok: false, error: 'Numero ordine di produzione non trovato nel file. Verificare che sia l\u2019export dell\u2019ODP e non un altro documento.' };
    }

    const lines = this._parseLines(rows, warnings);
    if (!lines.length) {
      return { ok: false, error: 'Nessuna riga materiale trovata. Il file potrebbe essere un export parziale.' };
    }

    return { ok: true, header, lines, warnings };
  },

  /* ─── TESTATA ─────────────────────────────────────────────────────
     Numero ordine e commessa si riconoscono dal loro stesso formato
     (ODP…/ODV…), più affidabile della posizione in un blocco di celle unite.
     L'articolo finito si legge dalla sezione "Articoli da Realizzare".      */
  _parseHeader(rows, warnings) {
    const h = { odp_num: '', commessa: '', article_code: '', article_desc: '', lot: '', qty_planned: '', um: '' };
    const scanLimit = Math.min(rows.length, 30);

    for (let r = 0; r < scanLimit; r++) {
      for (const cell of rows[r]) {
        const t = String(cell ?? '').trim();
        if (!h.odp_num && /^ODP\s*\d+$/i.test(t)) h.odp_num = t.toUpperCase();
        if (!h.commessa && /^ODV[\w\-_]+$/i.test(t)) h.commessa = t.toUpperCase();
      }
      if (h.odp_num && h.commessa) break;
    }

    // Sezione "Articoli da Realizzare": la riga utile è quella dopo l'intestazione
    for (let r = 0; r < scanLimit; r++) {
      const first = this._norm(rows[r][0]);
      if (first !== 'ARTICOLO') continue;
      const cols = rows[r].map(c => this._norm(c));
      if (!cols.includes('LOTTO')) continue;          // è l'altra intestazione (materiali)
      const next = rows[r + 1];
      if (!next) break;
      h.article_code = String(next[0] ?? '').trim();
      h.article_desc = String(next[1] ?? '').trim();
      h.lot          = String(next[2] ?? '').trim();
      const nums = this._numericCells(next);
      if (nums.length) h.qty_planned = String(nums[nums.length - 1].value);
      const umCell = next.find(c => ['KG', 'GR', 'PZ', 'LT'].includes(this._norm(c)));
      h.um = umCell ? this._norm(umCell) : '';
      break;
    }
    if (!h.article_code) warnings.push('Articolo finito non identificato in testata.');
    return h;
  },

  /* ─── RIGHE MATERIALI E BLOCCHI LOTTO ─────────────────────────────
     Si parte dall'intestazione che contiene "CONSERVAZIONE" (esclusiva della
     sezione materiali) e si scorre fino ai blocchi di fine documento.        */
  _parseLines(rows, warnings) {
    const STOP = ['N°OPERAZIONE', 'N.OPERAZIONE', 'PRELIEVO CAMPIONI', 'QUANTITÀ PRODOTTA', 'QUANTITA PRODOTTA'];
    let start = -1;
    for (let r = 0; r < rows.length; r++) {
      const cols = rows[r].map(c => this._norm(c));
      if (cols[0] === 'ARTICOLO' && cols.some(c => c === 'CONSERVAZIONE')) { start = r + 1; break; }
    }
    if (start === -1) return [];

    const lines = [];
    let current = null;

    for (let r = start; r < rows.length; r++) {
      const row = rows[r];
      const first = this._norm(row[0]);
      if (STOP.includes(first)) break;
      if (row.every(c => this._isBlank(c))) continue;

      // ── Riga LOTTO ──
      if (first === 'LOTTO') {
        if (!current) {
          warnings.push(`Riga ${r + 1}: blocco lotto senza riga articolo di riferimento, ignorato.`);
          continue;
        }
        const lotCode = String(row[1] ?? '').trim();
        if (!lotCode) continue;
        const nums = this._numericCells(row);
        /* La riga lotto porta due numeri: quantità e seriale di scadenza.
           La quantità precede l'etichetta "Scad.", la scadenza la segue.
           Si individua l'etichetta invece di fidarsi dell'ordine. */
        const scadIdx = row.findIndex(c => this._norm(c).startsWith('SCAD'));
        let qty = null, expSerial = null;
        for (const n of nums) {
          if (scadIdx !== -1 && n.idx > scadIdx) { if (expSerial === null) expSerial = n.value; }
          else if (qty === null) qty = n.value;
        }
        const stateIdx = row.findIndex(c => this._norm(c) === 'STATO');
        current.lots.push({
          lot_code: lotCode,
          supplier_lot: String(row[3] ?? '').trim(),
          um: (row.slice(4, 7).map(c => this._norm(c)).find(c => ['KG', 'GR', 'PZ', 'LT'].includes(c))) || current.um,
          qty: qty ?? 0,
          expiry_iso: this.excelSerialToISO(expSerial),
          state: stateIdx !== -1 ? String(row[stateIdx + 1] ?? '').trim() : ''
        });
        continue;
      }

      // ── Riga ARTICOLO ──
      // Un codice articolo è la prima cella non vuota di una riga che porta
      // almeno un numero (il totale) e una descrizione.
      const code = String(row[0] ?? '').trim();
      if (!code) continue;
      const nums = this._numericCells(row);
      if (!nums.length) continue;

      const total = nums[nums.length - 1].value;
      const totalIdx = nums[nums.length - 1].idx;
      /* Unità di misura del totale: l'etichetta immediatamente precedente. */
      let um = '';
      for (let c = totalIdx - 1; c >= 0; c--) {
        const t = this._norm(row[c]);
        if (['KG', 'GR', 'PZ', 'LT'].includes(t)) { um = t; break; }
        if (!this._isBlank(row[c])) break;
      }
      const qtyPerUnit = nums.length > 1 ? nums[nums.length - 2].value : null;

      current = {
        article_code: code,
        category: String(row[1] ?? '').trim(),
        description: String(row[2] ?? '').trim(),
        um: um || 'KG',
        qty_per_unit: qtyPerUnit,
        total_qty: total,
        lots: []
      };
      lines.push(current);
    }

    this._checkMissingLots(lines, warnings);
    return lines;
  },

  /* ─── RIGHE SENZA LOTTO ASSEGNATO ─────────────────────────────────
     v2.5.1 — Il controllo di coerenza sulla somma dei lotti e' stato RIMOSSO.

     Motivo, verificato sul campo: generava un avviso per ogni riga in cui i
     decimali non tornavano al millesimo, cioe' costantemente. L'export Sage
     arrotonda a sei decimali e i granulati sono espressi in grammi mentre il
     totale di riga e' in chilogrammi: la differenza residua era quasi sempre
     rumore di conversione, non un errore reale. Un avviso che scatta sempre
     smette di essere un avviso e insegna a ignorare anche quelli veri.

     Resta il solo controllo che porta informazione utile: una riga senza
     alcun lotto assegnato non e' prelevabile e va risolta a monte.
     ───────────────────────────────────────────────────────────────── */
  _checkMissingLots(lines, warnings) {
    for (const line of lines) {
      if (!line.lots.length) {
        warnings.push(`${line.article_code} — ${line.description}: nessun lotto assegnato nell\u2019ordine.`);
      }
    }
  }
};

export { OdpParser };
