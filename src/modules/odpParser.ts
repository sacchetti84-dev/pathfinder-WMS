/* ── 1.7 · SheetJS ENTRA DA FUORI ─────────────────────────────────────────
   Questo modulo NON importa `xlsx`: se lo facesse, il chunk separato della
   1.7 non esisterebbe — basta un import statico da un file del chunk
   principale per riportarcelo dentro.

   E NON diventa asincrono. `parse()` è sincrona, e le 26 prove di
   `test/odp.test.js` la chiamano così: la purezza di questo modulo è il
   motivo per cui quelle prove esistono, e si collauda da fermo. Quindi il
   modulo lo riceve da fuori, una volta, con `usaXLSX()` — l'interfaccia la
   chiama dopo `caricaExcel()`, le prove in cima al file. */
type Excel = typeof import('xlsx');

let XLSX: Excel | null = null;

type Riga = any[];

export interface LottoODP {
  lot_code: string;
  supplier_lot: string;
  um: string;
  qty: number;
  /** Scadenza in AAAA-MM-GG, oppure '' se il foglio non la porta. */
  expiry_iso: string;
  state: string;
}

export interface RigaODP {
  article_code: string;
  category: string;
  description: string;
  um: string;
  /** null quando la riga porta un numero solo: nessuna quantità unitaria. */
  qty_per_unit: number | null;
  total_qty: number;
  lots: LottoODP[];
}

export interface TestataODP {
  odp_num: string;
  commessa: string;
  article_code: string;
  article_desc: string;
  lot: string;
  /** Resta testo: è ciò che il foglio dichiara, non un numero su cui contare. */
  qty_planned: string;
  um: string;
}

export type EsitoODP =
  | { ok: false; error: string }
  | { ok: true; header: TestataODP; lines: RigaODP[]; warnings: string[] };

const OdpParser = {

  /** Deposita SheetJS, che questo modulo non importa. Si chiama una volta. */
  usaXLSX(modulo: Excel): void {
    XLSX = modulo;
  },

  /* Etichette usate come ancore. Confronto normalizzato: maiuscolo, spazi
     multipli compressi, accenti irrilevanti perché mai in posizione utile. */
  _norm(v: unknown): string {
    return String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  },

  _isBlank(v: unknown): boolean {
    return v === null || v === undefined || String(v).trim() === '';
  },

  excelSerialToISO(v: unknown): string {
    if (this._isBlank(v)) return '';
    // Già in forma testuale gg/mm/aaaa
    const txt = String(v).trim();
    const it = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (it) {
      const [, d, m, y] = it;
      return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 2958465) return '';
    try {
      if (XLSX?.SSF?.parse_date_code) {
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
  _numericCells(row: Riga): { idx: number, value: number }[] {
    const out: { idx: number, value: number }[] = [];
    row.forEach((cell, idx) => {
      if (typeof cell === 'number' && Number.isFinite(cell)) out.push({ idx, value: cell });
    });
    return out;
  },

  parse(arrayBuffer: ArrayBuffer): EsitoODP {
    if (!XLSX) {
      return { ok: false, error: 'Libreria Excel non disponibile: ricaricare la pagina con connessione attiva.' };
    }
    let rows: Riga[];
    try {
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return { ok: false, error: 'Il file non contiene alcun foglio di lavoro.' };
      rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, { header: 1, raw: true, defval: '' });
    } catch (err) {
      console.error('[WM] OdpParser.parse:', err);
      return { ok: false, error: 'File non leggibile come Excel: ' + (err as Error).message };
    }
    if (!rows?.length) return { ok: false, error: 'Il foglio di lavoro è vuoto.' };

    const warnings: string[] = [];
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

  _parseHeader(rows: Riga[], warnings: string[]): TestataODP {
    const h: TestataODP = { odp_num: '', commessa: '', article_code: '', article_desc: '', lot: '', qty_planned: '', um: '' };
    const scanLimit = Math.min(rows.length, 30);

    for (let r = 0; r < scanLimit; r++) {
      const row = rows[r];
      if (!row) continue;
      for (const cell of row) {
        const t = String(cell ?? '').trim();
        if (!h.odp_num && /^ODP\s*\d+$/i.test(t)) h.odp_num = t.toUpperCase();
        if (!h.commessa && /^ODV[\w\-_]+$/i.test(t)) h.commessa = t.toUpperCase();
      }
      if (h.odp_num && h.commessa) break;
    }

    // Sezione "Articoli da Realizzare": la riga utile è quella dopo l'intestazione
    for (let r = 0; r < scanLimit; r++) {
      const row = rows[r];
      if (!row) continue;
      const first = this._norm(row[0]);
      if (first !== 'ARTICOLO') continue;
      const cols = row.map(c => this._norm(c));
      if (!cols.includes('LOTTO')) continue;          // è l'altra intestazione (materiali)
      const next = rows[r + 1];
      if (!next) break;
      h.article_code = String(next[0] ?? '').trim();
      h.article_desc = String(next[1] ?? '').trim();
      h.lot          = String(next[2] ?? '').trim();
      const nums = this._numericCells(next);
      if (nums.length) h.qty_planned = String(nums[nums.length - 1]!.value);
      const umCell = next.find(c => ['KG', 'GR', 'PZ', 'LT'].includes(this._norm(c)));
      h.um = umCell ? this._norm(umCell) : '';
      break;
    }
    if (!h.article_code) warnings.push('Articolo finito non identificato in testata.');
    return h;
  },

  _parseLines(rows: Riga[], warnings: string[]): RigaODP[] {
    const STOP = ['N°OPERAZIONE', 'N.OPERAZIONE', 'PRELIEVO CAMPIONI', 'QUANTITÀ PRODOTTA', 'QUANTITA PRODOTTA'];
    let start = -1;
    for (let r = 0; r < rows.length; r++) {
      const cols = (rows[r] ?? []).map(c => this._norm(c));
      if (cols[0] === 'ARTICOLO' && cols.some(c => c === 'CONSERVAZIONE')) { start = r + 1; break; }
    }
    if (start === -1) return [];

    const lines: RigaODP[] = [];
    let current: RigaODP | null = null;

    for (let r = start; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
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
        const scadIdx = row.findIndex(c => this._norm(c).startsWith('SCAD'));
        let qty: number | null = null, expSerial: number | null = null;
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

      const code = String(row[0] ?? '').trim();
      if (!code) continue;
      const nums = this._numericCells(row);
      if (!nums.length) continue;

      const total = nums[nums.length - 1]!.value;
      const totalIdx = nums[nums.length - 1]!.idx;
      /* Unità di misura del totale: l'etichetta immediatamente precedente. */
      let um = '';
      for (let c = totalIdx - 1; c >= 0; c--) {
        const t = this._norm(row[c]);
        if (['KG', 'GR', 'PZ', 'LT'].includes(t)) { um = t; break; }
        if (!this._isBlank(row[c])) break;
      }
      const qtyPerUnit = nums.length > 1 ? nums[nums.length - 2]!.value : null;

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

  _checkMissingLots(lines: RigaODP[], warnings: string[]): void {
    for (const line of lines) {
      if (!line.lots.length) {
        warnings.push(`${line.article_code} — ${line.description}: nessun lotto assegnato nell\u2019ordine.`);
      }
    }
  }
};

export { OdpParser };
