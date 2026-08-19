import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { OdpParser } from '../src/modules/odpParser';

/* 1.7 — il parser non importa piu' SheetJS: nel prodotto arriva da un chunk
   caricato a richiesta, qui glielo diamo noi. Una riga, e le 26 prove sotto
   restano quelle che erano. */
OdpParser.usaXLSX(XLSX);

/* Da matrice di celle a .xlsx a ArrayBuffer, che è ciò che il parser riceve
   dall'input file dell'interfaccia. */
function foglio(righe) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

const TESTATA = () => [
  ["QTA'  PREVISTA", 'N.ORDINE ', 'DATA PROGRAMMAZIONE', 380.25, 'KG', 'ARTICOLO',
   'N.Ordine cliente', 'Andrea Sacchetti', "QTA'  REALIZZATA", 'ODP2603889', 46239,
   '4060854/01', '', 'Commessa', 'Cliente', '', '', 'ODV260183_1000'],
  [],
  ['Articoli da Realizzare:'],
  ['Articolo', 'Descrizione', 'Lotto', 'Scad.', 'Qtà  Prevista'],
  ['4060854/01', 'GLUCAJONE miscela per bustine da 7,5 g', '26A621', '', 'KG', 380.25],
  ['Art. cliente:'],
  [],
];

/* L'intestazione della sezione materiali. «Conservazione» è la parola che la
   distingue dall'altra intestazione «Articolo» della testata. */
const MATERIALI = () => [
  ['Articolo', 'Descrizione', 'Conservazione', 'Quantità x unità', 'Quantità  TOTALE'],
  [],
];

const CODA = () => [
  [],
  ['N°Operazione', 5, 'PESATURA', 'Centro princ.'],
  ['N°Operazione', 10, 'MISCELAZIONE POLVERI', 'Centro princ.'],
  ['Prelievo campioni', '1 barattolo I-M-F'],
  ['Quantità Prodotta'],
];

const articolo = (code, cat, desc, perUnita, um, totale) =>
  [code, cat, desc, '', 'GR', perUnita, um, totale];

const lotto = (code, fornitore, um, qty, resto = []) =>
  ['Lotto', code, 'Lotto fornitore', fornitore, um, qty, ...resto];

/* Un ODP completo: testata + materiali + coda, con in mezzo le righe date. */
const odp = (...corpo) => foglio([...TESTATA(), ...MATERIALI(), ...corpo, ...CODA()]);

const CALCIO = articolo('6001418', 'Materie prime ALIMENTARI', 'CALCIO LATTATO GLUCONATO (Ca:13%)', 3.846, 'KG', 194.9922);

describe('ODP — testata', () => {
  it('legge numero ordine, commessa e articolo finito dal documento vero', () => {
    const r = OdpParser.parse(odp(CALCIO, [], lotto('261571', '3071555', 'KG', 194.9922)));

    expect(r.ok).toBe(true);
    expect(r.header).toEqual({
      odp_num: 'ODP2603889',
      commessa: 'ODV260183_1000',
      article_code: '4060854/01',
      article_desc: 'GLUCAJONE miscela per bustine da 7,5 g',
      lot: '26A621',
      qty_planned: '380.25',
      um: 'KG',
    });
  });

  it('numero e commessa si riconoscono dalla forma, non da dove sono finiti', () => {
    const righe = TESTATA();
    righe[0][9] = '';                     // via da dove stavano
    righe[0][17] = '';
    righe[1] = ['', '', 'ODV999_1', '', '', '', 'ODP2600001'];

    const r = OdpParser.parse(foglio([...righe, ...MATERIALI(), CALCIO, ...CODA()]));
    expect(r.header.odp_num).toBe('ODP2600001');
    expect(r.header.commessa).toBe('ODV999_1');
  });

  it('senza numero d’ordine il file viene respinto, non letto a metà', () => {
    const righe = TESTATA();
    righe[0][9] = '';

    const r = OdpParser.parse(foglio([...righe, ...MATERIALI(), CALCIO, ...CODA()]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Numero ordine di produzione non trovato/);
  });

  it('non confonde l’intestazione dell’articolo finito con quella dei materiali', () => {
    const r = OdpParser.parse(odp(CALCIO, [], lotto('261571', '3071555', 'KG', 194.9922)));
    expect(r.header.article_code).toBe('4060854/01');
    expect(r.header.article_code).not.toBe(r.lines[0].article_code);
  });

  it('se l’articolo finito non si trova lo dichiara, invece di tacere', () => {
    const righe = TESTATA();
    righe[3] = ['Articolo', 'Descrizione', 'Conservazione'];  // niente «Lotto»: sezione non riconosciuta

    const r = OdpParser.parse(foglio([...righe, ...MATERIALI(), CALCIO, ...CODA()]));
    expect(r.ok).toBe(true);
    expect(r.header.article_code).toBe('');
    expect(r.warnings).toContain('Articolo finito non identificato in testata.');
  });
});

describe('ODP — righe materiali', () => {
  it('una riga materiale porta categoria, descrizione, unità e le due quantità', () => {
    const r = OdpParser.parse(odp(CALCIO, [], lotto('261571', '3071555', 'KG', 194.9922)));

    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({
      article_code: '6001418',
      category: 'Materie prime ALIMENTARI',
      description: 'CALCIO LATTATO GLUCONATO (Ca:13%)',
      um: 'KG',
      qty_per_unit: 3.846,
      total_qty: 194.9922,
    });
  });

  it('l’unità del totale è quella accanto al totale, non la prima della riga', () => {
    const r = OdpParser.parse(odp(
      ['6000500', 'Imballi', 'BUSTINE STAMPATE', '', 'GR', 7.5, 'PZ', 50700],
      lotto('260900', 'B-77', 'PZ', 50700),
    ));
    expect(r.lines[0].um).toBe('PZ');
    expect(r.lines[0].total_qty).toBe(50700);
  });

  it('un codice articolo numerico resta un codice, non diventa una quantità', () => {
    const r = OdpParser.parse(odp(
      articolo(6000886, 'Materie prime ALIMENTARI', 'MAGNESIO CITRATO', 0.955, 'KG', 48.4185),
      [], lotto('260545', 'NMFA25020', 'KG', 48.419),
    ));
    expect(r.lines[0].article_code).toBe('6000886');
    expect(r.lines[0].total_qty).toBe(48.4185);
  });

  it('una riga con un solo numero non inventa la quantità per unità', () => {
    const r = OdpParser.parse(odp(
      ['6000001', 'Materie prime', 'ARTICOLO SENZA UNITARIA', '', 'KG', 12.5],
      [], lotto('260001', 'F-1', 'KG', 12.5),
    ));
    expect(r.lines[0].qty_per_unit).toBeNull();
    expect(r.lines[0].total_qty).toBe(12.5);
  });

  it('le righe delle lavorazioni non diventano materiali da prelevare', () => {
    const r = OdpParser.parse(odp(CALCIO, [], lotto('261571', '3071555', 'KG', 194.9922)));
    expect(r.lines.map(l => l.article_code)).toEqual(['6001418']);
  });

  it('senza sezione materiali il file viene respinto', () => {
    const r = OdpParser.parse(foglio([...TESTATA(), ...CODA()]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Nessuna riga materiale trovata/);
  });

  it('un foglio vuoto viene respinto invece di dare zero righe', () => {
    expect(OdpParser.parse(foglio([[]])).ok).toBe(false);
  });
});

describe('ODP — blocchi lotto', () => {
  it('i lotti si attaccano all’articolo che li precede, non a quello dopo', () => {
    const r = OdpParser.parse(odp(
      CALCIO,
      lotto('261571', '3071555', 'KG', 100),
      lotto('261572', '3071556', 'KG', 94.9922),
      articolo('6000149', 'Materie prime ALIMENTARI', 'GLUCOSAMINA SOLFATO', 1, 'KG', 50.7),
      lotto('261177', 'SN2025080805', 'KG', 50.7),
    ));

    expect(r.lines.map(l => l.lots.map(x => x.lot_code))).toEqual([
      ['261571', '261572'],
      ['261177'],
    ]);
  });

  it('il lotto porta lotto fornitore, unità e quantità', () => {
    const r = OdpParser.parse(odp(CALCIO, lotto('261571', '3071555', 'KG', 194.9922)));
    expect(r.lines[0].lots[0]).toMatchObject({
      lot_code: '261571', supplier_lot: '3071555', um: 'KG', qty: 194.9922,
    });
  });

  /* IL DIFETTO DELL'ODP 2603889, trovato il 19/08 su un file vero. Finche'
     Sage esportava i lotti come TESTO il primo numero della riga era davvero
     la quantita'; un lotto tutto cifre esce NUMERICO, e diventava lui la
     quantita' — «260.594 KG» al posto di 0,315, su una miscela da 380 kg. */
  it("UN LOTTO NUMERICO NON DIVENTA LA QUANTITA", () => {
    const r = OdpParser.parse(odp(CALCIO, ['Lotto', 260594, 'Lotto fornitore', '2024081203', 'KG', 0.315]));
    expect(r.lines[0].lots[0]).toMatchObject({ lot_code: '260594', qty: 0.315 });
  });

  it("e nemmeno quando la quantita manca del tutto: resta zero, non il lotto", () => {
    const r = OdpParser.parse(odp(CALCIO, ['Lotto', 260594, 'Lotto fornitore', '2024081203', 'KG']));
    expect(r.lines[0].lots[0]).toMatchObject({ lot_code: '260594', qty: 0 });
  });

  it('un lotto senza unità eredita quella dell’articolo', () => {
    const r = OdpParser.parse(odp(CALCIO, ['Lotto', '261571', 'Lotto fornitore', '3071555', '', 194.9922]));
    expect(r.lines[0].lots[0].um).toBe('KG');
  });

  it('la scadenza e lo stato si leggono dopo le loro etichette', () => {
    const r = OdpParser.parse(odp(
      CALCIO,
      lotto('261571', '3071555', 'KG', 194.9922, ['Scad.', 46023, 'Stato', 'A - Accettato']),
    ));
    expect(r.lines[0].lots[0]).toMatchObject({
      qty: 194.9922,
      expiry_iso: '2026-01-01',
      state: 'A - Accettato',
    });
  });

  it('un lotto senza quantità non si prende il seriale della scadenza per quantità', () => {
    const r = OdpParser.parse(odp(
      CALCIO,
      ['Lotto', '261571', 'Lotto fornitore', '3071555', 'KG', '', 'Scad.', 46023],
    ));
    expect(r.lines[0].lots[0].qty).toBe(0);
    expect(r.lines[0].lots[0].expiry_iso).toBe('2026-01-01');
  });

  it('un blocco lotto senza articolo di riferimento non fa perdere il file', () => {
    const r = OdpParser.parse(odp(
      lotto('ORFANO', 'F-1', 'KG', 10),
      CALCIO,
      lotto('261571', '3071555', 'KG', 194.9922),
    ));
    expect(r.ok).toBe(true);
    expect(r.lines[0].lots.map(l => l.lot_code)).toEqual(['261571']);
    expect(r.warnings.some(w => /blocco lotto senza riga articolo/.test(w))).toBe(true);
  });

  it('una riga senza alcun lotto assegnato produce un avviso', () => {
    const r = OdpParser.parse(odp(CALCIO));
    expect(r.warnings).toContain('6001418 — CALCIO LATTATO GLUCONATO (Ca:13%): nessun lotto assegnato nell’ordine.');
  });

  it('un lotto senza codice viene saltato senza portarsi via la riga', () => {
    const r = OdpParser.parse(odp(
      CALCIO,
      ['Lotto', '', 'Lotto fornitore', '', 'KG', 10],
      lotto('261571', '3071555', 'KG', 194.9922),
    ));
    expect(r.lines[0].lots.map(l => l.lot_code)).toEqual(['261571']);
  });
});

describe('ODP — date di scadenza', () => {
  it('converte il seriale Excel nella data giusta, non in quella dopo', () => {
    expect(OdpParser.excelSerialToISO(46023)).toBe('2026-01-01');
    expect(OdpParser.excelSerialToISO(46024)).toBe('2026-01-02');
    expect(OdpParser.excelSerialToISO(46239)).toBe('2026-08-05');
  });

  it('se SheetJS non risponde, il calcolo manuale dà la stessa data', () => {
    const vero = XLSX.SSF.parse_date_code;
    XLSX.SSF.parse_date_code = () => { throw new Error('SSF non disponibile (finto)'); };
    try {
      expect(OdpParser.excelSerialToISO(46023)).toBe('2026-01-01');
      expect(OdpParser.excelSerialToISO(46239)).toBe('2026-08-05');
    } finally {
      XLSX.SSF.parse_date_code = vero;
    }
  });

  it('accetta anche la data già scritta a mano, in forma italiana', () => {
    expect(OdpParser.excelSerialToISO('5/8/2026')).toBe('2026-08-05');
    expect(OdpParser.excelSerialToISO('05/08/2026')).toBe('2026-08-05');
    expect(OdpParser.excelSerialToISO('05-08-2026')).toBe('2026-08-05');
  });

  it('ciò che non è una data resta vuoto', () => {
    expect(OdpParser.excelSerialToISO('')).toBe('');
    expect(OdpParser.excelSerialToISO(null)).toBe('');
    expect(OdpParser.excelSerialToISO(undefined)).toBe('');
    expect(OdpParser.excelSerialToISO('n.d.')).toBe('');
    expect(OdpParser.excelSerialToISO(0)).toBe('');
    expect(OdpParser.excelSerialToISO(-5)).toBe('');
    expect(OdpParser.excelSerialToISO(9999999)).toBe('');
  });
});

describe('ODP — file che non è un ODP', () => {
  it('un file illeggibile come Excel dà un errore leggibile, non un’eccezione', () => {
    const r = OdpParser.parse(new Uint8Array([1, 2, 3, 4, 5]).buffer);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/non leggibile come Excel|non contiene alcun foglio|Numero ordine di produzione non trovato/i);
  });

  it('un foglio che è un altro documento viene respinto sul numero d’ordine', () => {
    const r = OdpParser.parse(foglio([
      ['Fattura n.', 123, 'del', '05/08/2026'],
      ['Articolo', 'Descrizione', 'Prezzo'],
      ['6001418', 'CALCIO LATTATO', 12.5],
    ]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Numero ordine di produzione non trovato/);
  });
});
