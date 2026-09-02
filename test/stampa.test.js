/* IL REPORT CHE SCORRE SU PIU' A4 — 2.1.

   Un documento — DDT, verbale, cartellino — sta in UNA pagina per
   costruzione: `.doc-page` e' una colonna alta quanto il foglio. Un report
   no, e finche' la struttura era quella la testata usciva sulla prima
   pagina e basta, mentre il piede scivolava in fondo all'ultima.

   La ripetizione la fa il browser, con `table-header-group` e
   `table-footer-group`: qui si controlla che la testata finisca davvero nel
   `<thead>` e il piede nel `<tfoot>`, perche' e' quello — e non un'altezza
   calcolata a mano — a decidere se tornano su ogni pagina. Il CSS che li
   dichiara si rilegge dal foglio di stile, che e' l'altra meta' della
   promessa: senza quelle due righe la tabella stampa i due gruppi una volta
   sola e il difetto torna identico. */
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import { App } from '../src/ui/app';

const doc = (extra = {}) => App._docPageHTML({
  kind: 'RENDICONTO DI PROVA', kindSub: 'sotto', num: 'ODP-1',
  dateVal: '01/01/2026',
  headExtra: '<div id="LATESTATA"></div>',
  body: '<table class="pr-table"><tbody><tr><td>ILCORPO</td></tr></tbody></table>',
  docId: 'DOC-1',
  signs: [{ role: 'Operatore', hint: 'firma' }],
  ...extra,
});

/** Il pezzo di stringa fra due tag, per dire DOVE una cosa e' finita. */
const dentro = (html, tag) => {
  const a = html.indexOf(`<${tag}>`);
  const b = html.indexOf(`</${tag}>`);
  return a === -1 || b === -1 ? '' : html.slice(a, b);
};

describe('_docPageHTML — il documento a pagina sola non cambia', () => {
  const html = doc();

  it('resta un div, e le tre zone sono in fila', () => {
    expect(html).toMatch(/^<div class="pr-report doc-page/);
    expect(html).not.toContain('<thead>');
    const head = html.indexOf('doc-zone-head');
    const body = html.indexOf('doc-zone-body');
    const foot = html.indexOf('doc-zone-foot');
    expect(head).toBeLessThan(body);
    expect(body).toBeLessThan(foot);
  });

  it('porta testata, corpo e piede', () => {
    expect(html).toContain('LATESTATA');
    expect(html).toContain('ILCORPO');
    expect(html).toContain('Pathfinder');
  });
});

describe('_docPageHTML — il report che scorre', () => {
  const html = doc({ flow: true });

  /* E' QUESTA LA CORREZIONE: i due gruppi che si ripetono su ogni pagina
     sono `thead` e `tfoot`, e testata e piede devono starci DENTRO. */
  it('LA TESTATA STA NEL THEAD', () => {
    expect(dentro(html, 'thead')).toContain('LATESTATA');
    expect(dentro(html, 'thead')).toContain('doc-zone-head');
  });

  it('IL PIEDE STA NEL TFOOT', () => {
    const foot = dentro(html, 'tfoot');
    expect(foot).toContain('doc-zone-foot');
    expect(foot).toContain('Pathfinder');
    expect(foot).toContain('DOC-1');
  });

  it('e il corpo sta nel tbody, che e l unico a scorrere', () => {
    expect(dentro(html, 'tbody')).toContain('ILCORPO');
    expect(dentro(html, 'thead')).not.toContain('ILCORPO');
    expect(dentro(html, 'tfoot')).not.toContain('ILCORPO');
  });

  it('la pagina porta la classe che il foglio di stile cerca', () => {
    expect(html).toMatch(/^<table class="pr-report doc-page doc-page--flow/);
  });

  /* La filigrana sta nel corpo: in `position: fixed` il browser la ridisegna
     su ogni pagina, ed e' quello che un PROVVISORIO deve fare. */
  it('la filigrana c e, e sta col corpo', () => {
    const con = doc({ flow: true, watermark: 'PROVVISORIO' });
    expect(dentro(con, 'tbody')).toContain('PROVVISORIO');
  });
});

/* Le stringhe si rileggono dal CSS: sono l'altra meta' della promessa, e
   senza di loro la struttura giusta stampa lo stesso una volta sola. */
describe('il foglio di stile dichiara i due gruppi', () => {
  const css = fs.readFileSync('src/styles/05-pick-report.css', 'utf8');

  it('thead e tfoot si ripetono su ogni pagina', () => {
    expect(css).toMatch(/\.doc-page--flow > thead\s*\{[^}]*table-header-group/);
    expect(css).toMatch(/\.doc-page--flow > tfoot\s*\{[^}]*table-footer-group/);
  });

  /* Una riga tagliata a meta' fra due fogli non si rilegge, e una
     schiacciata mente sull'altezza di tutte le altre. */
  it('una riga non si spezza e tiene la sua altezza', () => {
    expect(css).toMatch(/\.doc-page--flow \.pr-table tr\s*\{[^}]*break-inside: avoid/);
    expect(css).toMatch(/\.doc-page--flow \.pr-table td\s*\{[^}]*height: 7mm/);
  });

  /* Il padding di un blocco che attraversa piu' pagine vale in cima alla
     prima e in fondo all'ultima: dalla seconda in poi la testata uscirebbe
     attaccata al bordo, e i 12mm se li devono prendere le celle. */
  it('i margini del foglio se li prendono le celle', () => {
    expect(css).toContain('#printReport:has(.doc-page--flow) { padding: 0; }');
    expect(css).toMatch(/\.doc-flow-cell\s*\{[^}]*padding: 0 12mm/);
  });
});

/* I tre report scorrono; i documenti a pagina sola no, e la differenza e'
   deliberata: un DDT e' progettato per stare in un foglio. */
describe('chi scorre e chi no', () => {
  const legge = (f) => fs.readFileSync(f, 'utf8');

  it('i tre report chiedono flow', () => {
    for (const f of ['src/ui/views/wip.ts', 'src/ui/views/inventario.ts',
                     'src/ui/views/rapportoPrelievo.ts']) {
      expect(legge(f), f).toContain('flow: true');
    }
  });

  it('verbali e cartellini restano a pagina sola', () => {
    for (const f of ['src/ui/views/smaltimento.ts',
                     'src/ui/views/campionamento.ts', 'src/ui/views/quarantena.ts']) {
      expect(legge(f).includes('flow: true'), f).toBe(false);
    }
  });

  /* 2.20 — `spedizioni.ts` stampa DUE documenti, e non scorrono allo stesso
     modo. Il DDT e' progettato per stare in un foglio: e' quello che
     accompagna il trasporto, e un DDT su tre pagine e' un DDT che si perde.
     La packing list invece e' un elenco che cresce col numero di bancali —
     dieci pallet non stanno in una pagina — e chiede `flow`, come i tre
     report. La differenza sta nello stesso file, quindi si guarda documento
     per documento e non file per file. */
  it('il DDT sta in un foglio, la packing list scorre', () => {
    const s = legge('src/ui/views/spedizioni.ts');
    const daKind = (kind) => {
      const i = s.indexOf(`kind: '${kind}'`);
      expect(i, kind).toBeGreaterThan(-1);
      /* Dal `kind` alla fine della chiamata a `_docPageHTML`: il primo
         `});` che segue chiude l'oggetto passato. */
      return s.slice(i, s.indexOf('});', i));
    };
    expect(daKind('PACKING LIST')).toContain('flow: true');
    expect(daKind('DOCUMENTO DI TRASPORTO')).not.toContain('flow: true');
  });
});
