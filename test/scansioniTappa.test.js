/* QUANTE SCANSIONI SERVONO, E SE QUELLE IN MANO BASTANO — 2.35.1
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   IL DIFETTO CHE QUESTE PROVE DIFENDONO, per esteso, perché è di quelli che
   tornano.

   La maschera del percorso decideva in TRE posti se le scansioni fatte
   valevano: il ridisegno della scheda, il disegno del riquadro verde, e la
   conferma del prelievo. Due dei tre chiedevano alla tappa quale grammatica
   parlare — una scansione sull'unità di carico, tre sulla merce sciolta — e
   uno no: il ridisegno chiedeva `!!this._routeScan.loc`, cioè «c'è
   l'ubicazione», che su un bancale è FALSO PER COSTRUZIONE, perché su un
   bancale l'ubicazione non si scansiona mai.

   L'effetto in corsia, visto a video l'08/09/2026 e segnalato dal magazzino
   prima ancora: l'operatore legge l'etichetta del pallet, il sistema
   risponde «Unità confermata», il ridisegno che segue cancella la scansione
   appena accettata, il campo torna vuoto, e premendo CONFERMA compare
   «Serve il codice dell'unità UDC-000003 prima di confermare» — sul bancale
   giusto, appena scansionato. La preparazione di una spedizione non poteva
   avanzare di una tappa.

   La regola sta adesso in `modules/preparazione` e si chiede da un posto
   solo. Queste prove la fissano da ferme, senza DOM: sono la ragione per cui
   il quarto posto che vorrà saperlo non riscriverà una quarta versione. */

import { describe, test, expect } from 'vitest';
import { scansioniRichieste, scansioniBastano } from '../src/modules/preparazione';
import { PickRoute } from '../src/modules/pickRoute';

const UDC = { tipo: 'udc' };
const RIGA = { tipo: 'riga' };

describe('quante scansioni chiede una cosa da prendere', () => {
  test('un\'unità di carico ne chiede una, ed è il suo codice', () => {
    expect(scansioniRichieste(UDC)).toEqual(['udc']);
  });

  test('una riga sciolta ne chiede tre', () => {
    expect(scansioniRichieste(RIGA)).toEqual(['ubicazione', 'articolo', 'lotto']);
  });

  test('e senza sapere che cosa sia, si chiedono tutte e tre', () => {
    /* Il verso prudente: davanti a un dato che non dice niente si chiede di
       più, non di meno. Una scansione sola su una cosa sconosciuta sarebbe
       merce confermata senza averla identificata. */
    expect(scansioniRichieste(null)).toEqual(['ubicazione', 'articolo', 'lotto']);
    expect(scansioniRichieste(undefined)).toEqual(['ubicazione', 'articolo', 'lotto']);
  });
});

describe('e se quelle in mano bastano', () => {
  test('IL DIFETTO: il codice del bancale da solo BASTA a una tappa di unità', () => {
    /* È la riga che il ridisegno negava. Senza ubicazione, senza articolo,
       senza lotto: su un pallet imballato quei tre stanno sotto il
       cellophane, e l'etichetta è il solo dato che non invecchia. */
    expect(scansioniBastano(UDC, { udc: 'UDC-000003' })).toBe(true);
    expect(scansioniBastano(UDC, { loc: '', art: '', lot: '', udc: 'UDC-000003' })).toBe(true);
  });

  test('e l\'ubicazione da sola NON basta a un\'unità', () => {
    /* Il verso opposto: essere davanti al vano giusto non dice quale dei tre
       bancali che ci stanno è quello del documento. */
    expect(scansioniBastano(UDC, { loc: 'MAG-ACC-11' })).toBe(false);
    expect(scansioniBastano(UDC, { loc: 'MAG-ACC-11', art: '4060854/01', lot: '26A621' })).toBe(false);
  });

  test('su una riga sciolta servono tutte e tre, e ne manca una alla volta', () => {
    const piene = { loc: 'MAG-SCA-01-01-T', art: '6001418', lot: '261571' };
    expect(scansioniBastano(RIGA, piene)).toBe(true);
    expect(scansioniBastano(RIGA, { ...piene, loc: '' })).toBe(false);
    expect(scansioniBastano(RIGA, { ...piene, art: '' })).toBe(false);
    expect(scansioniBastano(RIGA, { ...piene, lot: '' })).toBe(false);
  });

  test('il codice del bancale NON sostituisce le tre di una riga sciolta', () => {
    expect(scansioniBastano(RIGA, { udc: 'UDC-000003' })).toBe(false);
  });

  test('niente in mano non basta mai, e non esplode', () => {
    expect(scansioniBastano(UDC, null)).toBe(false);
    expect(scansioniBastano(RIGA, undefined)).toBe(false);
    expect(scansioniBastano(UDC, {})).toBe(false);
  });

  test('uno spazio non è una scansione', () => {
    /* Un lettore che manda a capo su un campo vuoto, o un dito su INVIO:
       la stringa esiste e non dice niente. */
    expect(scansioniBastano(UDC, { udc: '   ' })).toBe(false);
    expect(scansioniBastano(RIGA, { loc: 'MAG-SCA-01-01-T', art: ' ', lot: '261571' })).toBe(false);
  });
});

describe('e la tappa del percorso fa la stessa domanda', () => {
  /* Le due porte di `PickRoute` sono quelle che usa la maschera: se
     rispondessero diversamente dal modulo puro, le prove qui sopra
     difenderebbero una regola che nessuno applica. */
  test('una tappa con unità: una scansione, e il codice basta', () => {
    const tappa = { udc_id: 'UDC-000003', location_code: 'MAG-ACC-11' };
    expect(PickRoute.scansioniDiTappa(tappa)).toEqual(['udc']);
    expect(PickRoute.scansioniBastanoPer(tappa, { udc: 'UDC-000003' })).toBe(true);
    expect(PickRoute.scansioniBastanoPer(tappa, { loc: 'MAG-ACC-11' })).toBe(false);
  });

  test('una tappa senza unità: tre scansioni', () => {
    const tappa = { location_code: 'MAG-SCA-01-01-T', article_code: '6001418', lot_code: '261571' };
    expect(PickRoute.scansioniDiTappa(tappa)).toEqual(['ubicazione', 'articolo', 'lotto']);
    expect(PickRoute.scansioniBastanoPer(tappa, { loc: 'X', art: 'Y', lot: 'Z' })).toBe(true);
    expect(PickRoute.scansioniBastanoPer(tappa, { loc: 'X', art: 'Y' })).toBe(false);
  });

  test('`udc_id` nullo è una tappa di merce sciolta, non un\'unità senza nome', () => {
    /* `buildPreparazione` scrive `udc_id: null` sulle righe sciolte: se
       questo contasse come «ha un'unità», ogni tappa si confermerebbe con
       una scansione che non arriva mai. */
    expect(PickRoute.scansioniDiTappa({ udc_id: null })).toEqual(['ubicazione', 'articolo', 'lotto']);
    expect(PickRoute.scansioniDiTappa({ udc_id: '' })).toEqual(['ubicazione', 'articolo', 'lotto']);
  });
});
