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
  const viste = fs.readFileSync('src/styles/01-views.css', 'utf8');

  it('thead e tfoot si ripetono su ogni pagina', () => {
    expect(css).toMatch(/\.doc-page--flow > thead\s*\{[^}]*table-header-group/);
    expect(css).toMatch(/\.doc-page--flow > tfoot\s*\{[^}]*table-footer-group/);
  });

  /* 2.27 — LA BANDA DEL PIEDE, E I DUE NUMERI CHE DEVONO ESSERE UNO SOLO.

     `table-footer-group` ripete il piede alla fine di ogni FRAMMENTO, non in
     fondo alla pagina: sull'ultimo foglio galleggiava a meta'. Adesso il
     `tfoot` riserva la banda e un elemento fuori dal flusso la dipinge — e la
     riserva e il dipinto leggono la STESSA variabile. Scritti due volte
     divergono, e il giorno che divergono il piede copre l'ultima riga di ogni
     pagina piena: e' quello che questa prova sorveglia. */
  it('LA CODA E\' ANCORATA AL FONDO, E LA SUA BANDA E\' RISERVATA', () => {
    expect(css).toMatch(/\.doc-coda-ancorata \.doc-zone-foot\s*\{[^}]*position: fixed/);
    expect(css).toMatch(/\.doc-coda-ancorata \.doc-zone-foot\s*\{[^}]*bottom: 0/);
    /* La riserva di partenza sta nel foglio; l'altezza vera la scrive la
       misura, sulla cella, un istante prima di stampare. */
    expect(css).toMatch(/\.doc-page--flow \.doc-flow-cell--foot\s*\{[^}]*height: var\(--doc-piede\)/);
    expect(viste.match(/--doc-piede:/g) || []).toHaveLength(1);
    expect(css).not.toMatch(/--doc-piede:/);

    /* 2.28 — SENZA LA MISURA NON SI ROMPE NIENTE. La fascia esce dal flusso
       solo con la classe che la misura aggiunge: se lo script non gira, resta
       dov'era e il foglio e' quello della 2.27. Se un giorno il `fixed`
       finisse fuori dalla classe, questa prova suona. */
    expect(css).not.toMatch(/\.doc-page--flow \.doc-zone-foot\s*\{[^}]*position: fixed/);

    const motore = fs.readFileSync('src/ui/views/smaltimento.ts', 'utf8');
    expect(motore).toMatch(/classList\.add\('doc-coda-ancorata'\)/);
    expect(motore).toMatch(/_ancoraLaCoda\(\)/);
  });

  /* Una riga tagliata a meta' fra due fogli non si rilegge, e una
     schiacciata mente sull'altezza di tutte le altre. */
  it('una riga non si spezza e tiene la sua altezza', () => {
    expect(css).toMatch(/\.doc-page--flow \.pr-table tr\s*\{[^}]*break-inside: avoid/);
    expect(css).toMatch(/\.doc-page--flow \.pr-table td\s*\{[^}]*height: 7mm/);
  });

  /* 2.24 — IL MARGINE STA SULLA PAGINA, E IN UN POSTO SOLO. Era in due:
     una `padding: 12mm` su `#printReport`, che vale per la prima pagina e
     basta, e `padding: 0 12mm` sulle celle del documento che scorre, che era
     il modo di rimediare alla prima. Adesso lo da' `@page`, che e' dove il
     margine di una pagina sta, e vale per ogni foglio di ogni documento.
     Tenerli tutt'e due farebbe 24mm sui documenti che scorrono, e le colonne
     sono tarate su 186mm: questa prova sorveglia che non tornino. */
  it('IL MARGINE LO DA LA PAGINA, e nessun altro se lo prende', () => {
    expect(viste).toMatch(/@page\s*\{[^}]*margin: 12mm/);
    expect(viste).toMatch(/#printReport\s*\{[^}]*padding: 0;/);
    expect(css).toMatch(/\.doc-flow-cell\s*\{[^}]*padding: 0;/);
    expect(css).not.toMatch(/\.doc-flow-cell[^{]*\{[^}]*padding: 0 12mm/);
    expect(css).not.toMatch(/#printReport:has\(\.doc-page--flow\)\s*\{/);
    /* 2.27 — e nemmeno il piede se lo prende. La variante «`bottom` negativo
       piu' `margin-bottom` allargato» sembra equivalente a quella scelta e
       rimetterebbe il margine in due posti: la banda si riserva col `tfoot`,
       non allargando la pagina. */
    expect(viste).not.toMatch(/@page\s*\{[^}]*margin-bottom/);
  });

  /* Il numero di pagina si puo' scrivere solo da qui: un documento che scorre
     non sa da se' su quale foglio sta. Dove il browser non sostiene le page
     margin box non esce niente — ed e' per questo che il conto delle righe
     sta ANCHE nel piede ripetuto, che funziona ovunque. */
  it('la pagina chiede il suo numero, e il piede il conto delle righe', () => {
    expect(viste).toMatch(/@bottom-right\s*\{[^}]*counter\(page\)/);
    expect(viste).toMatch(/@bottom-right\s*\{[^}]*counter\(pages\)/);
    const smaltimento = fs.readFileSync('src/ui/views/smaltimento.ts', 'utf8');
    expect(smaltimento).toMatch(/footNote \? .*_esc\(footNote\)/);
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

  /* 2.24 — ANCHE IL DDT SCORRE, e il perche' va scritto perche' la 2.20 aveva
     deciso il contrario: un DDT e' progettato per stare in un foglio. Solo che
     NIENTE faceva rispettare la decisione. Un documento con molte partite
     usciva lo stesso su due pagine, e la seconda arrivava senza testata,
     senza il numero del DDT e a filo carta: chi la trova in mano non sa
     nemmeno di che documento e' la meta'. Fra un secondo foglio che non
     esiste e un secondo foglio che si presenta, il secondo. */
  it('i due documenti di spedizione scorrono tutti e due', () => {
    const s = legge('src/ui/views/spedizioni.ts');
    const daKind = (kind) => {
      const i = s.indexOf(`kind: '${kind}'`);
      expect(i, kind).toBeGreaterThan(-1);
      /* Dal `kind` alla fine della chiamata a `_docPageHTML`: il primo
         `});` che segue chiude l'oggetto passato. */
      return s.slice(i, s.indexOf('});', i));
    };
    expect(daKind('PACKING LIST')).toContain('flow: true');
    expect(daKind('DOCUMENTO DI TRASPORTO')).toContain('flow: true');
    /* E tutti e due dichiarano quante righe portano: e' l'unico modo, senza
       numero di pagina, di accorgersi che un foglio manca. */
    expect(daKind('PACKING LIST')).toContain('footNote:');
    expect(daKind('DOCUMENTO DI TRASPORTO')).toContain('footNote:');
  });
});

/* 2.28 — LE FIRME STANNO NELLA CODA, E LA CODA E' SU OGNI PAGINA.

   La 2.24 le aveva tolte dal piede ripetuto con questa ragione: «le tre righe
   da firmare uscivano su tutte, e chi firma non sa quale valga». La 2.28
   ribalta la decisione, e non per svista. Un foglio di magazzino ha due fasce
   fisse — testata in alto, coda in basso — e in mezzo la merce che scorre:
   chi controlla in banchina cerca totali e firme sempre alla stessa quota, e
   un foglio in cui la coda sta a meta' pagina va riletto invece che guardato.
   La coda e' la fascia bassa del FOGLIO, non la fine del documento.

   Questa prova sorveglia il ribaltamento, cosi' che nessuno lo disfi per
   errore leggendo il commento della 2.24. */
describe('le firme, e dove finiscono', () => {
  it('nel documento che scorre stanno nella coda, ripetuta a ogni foglio', () => {
    const html = doc({ flow: true });
    expect(dentro(html, 'tfoot')).toContain('doc-signs');
    expect(dentro(html, 'tfoot')).toContain('Pathfinder');
    /* E il corpo porta solo la merce: nessuna firma fra le righe. */
    expect(dentro(html, 'tbody')).not.toContain('doc-signs');
  });

  it('nel documento a pagina sola restano dove sono sempre state', () => {
    const html = doc();
    const firme = html.indexOf('doc-signs');
    expect(html.indexOf('doc-zone-foot')).toBeLessThan(firme);
    expect(html.indexOf('doc-zone-body')).toBeLessThan(firme);
  });

  /* La packing list passava COPPIE dove `_docPageHTML` legge `role` e `hint`:
     le tre etichette uscivano vuote, senza un errore e senza un tipo che si
     lamentasse. */
  it('la packing list nomina le sue tre firme', () => {
    const s = fs.readFileSync('src/ui/views/spedizioni.ts', 'utf8');
    expect(s).toContain("{ role: 'Preparato da'");
    expect(s).not.toContain("['Preparato da'");
  });
});
