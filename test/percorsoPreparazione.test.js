/* IL PERCORSO DI UNA PREPARAZIONE — 2.31
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `buildPreparazione` non è `build` con un ingresso diverso, ed è la cosa
   che queste prove difendono per prima.

   `build` risolve una DOMANDA: l'ordine di produzione chiede un articolo e
   un lotto, e il magazzino risponde da quale vano conviene prenderlo — FEFO,
   alternative, quarantene, vano di lavorazione. È una ricerca.

   Una preparazione non cerca. Il documento dice già articolo, lotto E vano:
   li ha scelti chi ha composto il DDT, e da quel momento la merce è
   prenotata. Cambiarli qui vorrebbe dire prelevare merce diversa da quella
   che il documento promette — e il documento è già stato stampato.

   Quel che resta in comune è la SERPENTINA, e la prima prova è che sia
   davvero la stessa: due serpentine dello stesso magazzino sono il difetto
   che `ordinaPerCorsia` esiste per non ripetere. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PickRoute } from '../src/modules/pickRoute';
import { Store } from '../src/core/store';

const GEO = new Map([
  ['MAG1-A-01-T', { site_id: 'MAG1', zone_id: 'A', zone_idx: 0, type: 'rack', aisle: 1, bay: 1, level: 'T', level_idx: 0 }],
  ['MAG1-A-05-T', { site_id: 'MAG1', zone_id: 'A', zone_idx: 0, type: 'rack', aisle: 1, bay: 5, level: 'T', level_idx: 0 }],
  ['MAG1-B-02-T', { site_id: 'MAG1', zone_id: 'B', zone_idx: 1, type: 'rack', aisle: 2, bay: 2, level: 'T', level_idx: 0 }],
]);

const originali = {};
const METODI = ['buildLocationGeometry', 'getSiteOrder'];

beforeEach(() => {
  for (const m of METODI) originali[m] = Store[m];
  Store.buildLocationGeometry = () => GEO;
  Store.getSiteOrder = () => ['MAG1'];
});
afterEach(() => {
  for (const m of METODI) Store[m] = originali[m];
});

const cosa = (extra = {}) => ({
  tipo: 'riga',
  udc_id: null,
  location_code: 'MAG1-A-01-T',
  item_key: 'A#L1',
  article_code: 'A',
  article_description: 'Articolo A',
  lot_code: 'L1',
  colli: 5,
  qty_uom: 100,
  uom: 'KG',
  righe: 1,
  packs_out: [],
  contenuto: [],
  ...extra,
});

describe('buildPreparazione — la forma delle tappe', () => {
  it('una cosa da prendere diventa una tappa, con il vano che dice il documento', () => {
    const p = PickRoute.buildPreparazione([cosa()]);
    expect(p.stops).toHaveLength(1);
    expect(p.stops[0].location_code).toBe('MAG1-A-01-T');
    expect(p.stops[0].item_key).toBe('A#L1');
    expect(p.stops[0].seq).toBe(1);
  });

  /* IL VANO NON SI CERCA. Se la tappa scegliesse un'altra ubicazione dello
     stesso lotto, la riga del documento si scollegherebbe dalla merce che
     esce — e il documento è già stampato. */
  it('non propone alternative: il vano l\'ha scelto chi ha composto il DDT', () => {
    const p = PickRoute.buildPreparazione([cosa()]);
    expect(p.stops[0].alternatives).toEqual([]);
    expect(p.offroute).toEqual([]);
    expect(p.notes).toEqual([]);
  });

  it('il sito lo dice la geometria, non il documento', () => {
    const p = PickRoute.buildPreparazione([cosa()]);
    expect(p.stops[0].site_id).toBe('MAG1');
  });

  it('un vano che la geometria non conosce non fa saltare niente', () => {
    const p = PickRoute.buildPreparazione([cosa({ location_code: 'INVENTATO' })]);
    expect(p.stops).toHaveLength(1);
    expect(p.stops[0].site_id).toBe('');
  });

  /* I COLLI, NON LE UM. Un documento di uscita conta colli; la quantità in
     unità di misura è un di più che spesso non c'è, e metterla qui farebbe
     uscire `0` su ogni riga che non la dichiara — e uno zero ha l'aria di
     un dato vero. */
  it('la quantità della tappa sono i colli, anche quando le UM mancano', () => {
    const p = PickRoute.buildPreparazione([cosa({ colli: 7, qty_uom: null })]);
    expect(p.stops[0].kg_required).toBe(7);
  });
});

describe('buildPreparazione — le unità di carico', () => {
  const pallet = cosa({
    tipo: 'udc',
    udc_id: 'UDC-1',
    location_code: 'MAG1-B-02-T',
    colli: 12,
    contenuto: [{ article_code: 'A', lot_code: 'L1', colli: 7 }, { article_code: 'A', lot_code: 'L2', colli: 5 }],
  });

  it('una tappa di unità porta il codice del pallet', () => {
    const p = PickRoute.buildPreparazione([pallet]);
    expect(p.stops[0].udc_id).toBe('UDC-1');
  });

  it('e il contenuto, per dirlo a video senza aprire l\'imballo', () => {
    const p = PickRoute.buildPreparazione([pallet]);
    expect(p.stops[0].contenuto).toHaveLength(2);
  });

  /* Una tappa di merce sciolta NON deve portare il campo: la sua presenza è
     ciò che decide quante scansioni servono, e un `null` scritto su tutte
     renderebbe la distinzione un dettaglio invece che una regola. */
  it('una tappa di merce sciolta non porta nessun codice di unità', () => {
    const p = PickRoute.buildPreparazione([cosa()]);
    expect(p.stops[0].udc_id).toBeUndefined();
    expect(p.stops[0].contenuto).toBeUndefined();
  });

  it('unità e merce sciolta convivono nello stesso percorso', () => {
    const p = PickRoute.buildPreparazione([cosa(), pallet]);
    expect(p.stops.map(s => (s.udc_id ? 'udc' : 'riga')).sort()).toEqual(['riga', 'udc']);
  });
});

describe('buildPreparazione — la serpentina è la stessa', () => {
  /* Se questa prova fallisce, in magazzino ci sono due serpentine: quella
     del giro e quella della preparazione. `ordinaPerCorsia` esiste per non
     ripeterla. */
  it('mette in fila come `ordinaPerCorsia`, e rinumera', () => {
    const cose = [
      cosa({ location_code: 'MAG1-B-02-T', item_key: 'C#L1' }),
      cosa({ location_code: 'MAG1-A-05-T', item_key: 'B#L1' }),
      cosa({ location_code: 'MAG1-A-01-T', item_key: 'A#L1' }),
    ];
    const p = PickRoute.buildPreparazione(cose);
    const atteso = PickRoute.ordinaPerCorsia(cose).map(c => c.location_code);
    expect(p.stops.map(s => s.location_code)).toEqual(atteso);
    expect(p.stops.map(s => s.seq)).toEqual([1, 2, 3]);
  });

  it('la numerazione segue il cammino, non l\'ordine del documento', () => {
    const p = PickRoute.buildPreparazione([
      cosa({ location_code: 'MAG1-A-05-T', item_key: 'B#L1' }),
      cosa({ location_code: 'MAG1-A-01-T', item_key: 'A#L1' }),
    ]);
    const primo = p.stops.find(s => s.seq === 1);
    expect(primo.location_code).toBe('MAG1-A-01-T');
  });
});

describe('buildPreparazione — i casi vuoti', () => {
  it('niente da preparare, nessuna tappa', () => {
    expect(PickRoute.buildPreparazione([]).stops).toEqual([]);
    expect(PickRoute.buildPreparazione(null).stops).toEqual([]);
    expect(PickRoute.buildPreparazione(undefined).stops).toEqual([]);
  });
});

describe('scansioniDiTappa', () => {
  /* LA REGOLA DELL'08/09, e il ponte fra `Tappa` e `DaPreparare`: chi ha una
     tappa in mano non ha una cosa da preparare, ma la domanda è la stessa. */
  it('un\'unità di carico si conferma con la sola scansione del suo codice', () => {
    expect(PickRoute.scansioniDiTappa({ udc_id: 'UDC-1' })).toEqual(['udc']);
  });

  it('una tappa di merce sciolta resta a tre', () => {
    expect(PickRoute.scansioniDiTappa({ udc_id: null })).toEqual(['ubicazione', 'articolo', 'lotto']);
    expect(PickRoute.scansioniDiTappa({})).toEqual(['ubicazione', 'articolo', 'lotto']);
  });

  /* Un codice vuoto NON è un'unità: chiedere una scansione sola su una tappa
     che non ha un pallet da scansionare vorrebbe dire chiedere di leggere
     un'etichetta che non esiste. */
  it('un codice vuoto non fa di una tappa un\'unità', () => {
    expect(PickRoute.scansioniDiTappa({ udc_id: '' })).toEqual(['ubicazione', 'articolo', 'lotto']);
    expect(PickRoute.scansioniDiTappa(null)).toEqual(['ubicazione', 'articolo', 'lotto']);
  });
});

/* ═══ 2.38.1 · SEI COLLI NON SONO SEI CHILI ═════════════════════════════

   Il difetto, segnalato da Andrea il 09/09 sulla 2.38, e il modo in cui e'
   passato sotto a tutte le prove che c'erano.

   `kg_required` porta i COLLI dalla 2.31 — sta scritto, e c'e' una prova
   qui sopra che lo difende. Ma `um` portava l'unita' di misura
   dell'ARTICOLO, e nove punti dell'applicativo scrivono
   `${kg_required} ${um}`: su sei colli di farina da 25 KG stampavano
   **«6 KG»**. Il numero era di una grandezza, l'etichetta accanto ne
   nominava un'altra.

   E' la bugia della 2.33 rifatta altrove, con un'aggravante: «6 KG» e' un
   numero PLAUSIBILE. Un'etichetta che dice «0 partite» la si vede; una che
   dice sei chili invece di sei colli attraversa le versioni.

   Il secondo mezzo del difetto stava nella maschera dei colli, e non si
   vede da qui: `_routeConfirmStop` passava `{ uom: kg_required }` come
   fabbisogno, cioe' «riempi fino a 6 unita' di misura» su una riga che ne
   chiedeva 6 COLLI. Con colli da 25 KG la maschera ne proponeva UNO. Lo
   difende `test/prepColliDelDocumento.test.js`, che legge il sorgente,
   perche' quella maschera vuole un DOM.

   NESSUNA PROVA LO VEDEVA perche' tutte guardavano `kg_required` — il
   numero, che era giusto — e nessuna guardava l'unita' che gli sta
   accanto. */
describe('buildPreparazione — la grandezza e la sua unita', () => {
  it('L UNITA DI UNA TAPPA DI PREPARAZIONE E «Coll.», non quella dell articolo', () => {
    const p = PickRoute.buildPreparazione([cosa({ colli: 6, uom: 'KG' })]);
    expect(p.stops[0].kg_required).toBe(6);
    expect(p.stops[0].um).toBe('Coll.');
  });

  /* La quantita' vera non si perde: viaggia accanto, e la scheda la scrive
     sotto ai colli. Sono due grandezze, e adesso si vedono per due. */
  it('la quantita in unita di misura viaggia a parte, con la sua unita', () => {
    const p = PickRoute.buildPreparazione([cosa({ colli: 6, qty_uom: 150, uom: 'KG' })]);
    expect(p.stops[0].qty_uom_doc).toBe(150);
    expect(p.stops[0].uom_doc).toBe('KG');
  });

  it('un documento che non dichiara le UM non ne inventa: resta null', () => {
    const p = PickRoute.buildPreparazione([cosa({ colli: 6, qty_uom: null, uom: 'KG' })]);
    expect(p.stops[0].qty_uom_doc).toBeNull();
    expect(p.stops[0].um).toBe('Coll.');
  });

  /* §1.8.4 — i colli li ha gia' scelti chi ha scritto il documento, e quella
     scelta deve arrivare fino alla corsia: senza, la maschera si apre vuota
     e l'operatore prende altri sacchi della stessa quantita'. */
  it('i colli gia scelti dal documento arrivano sulla tappa', () => {
    const packs = [{ da: 25, quantita: 25 }, { da: 10, quantita: 4 }];
    const p = PickRoute.buildPreparazione([cosa({ packs_out: packs })]);
    expect(p.stops[0].packs_doc).toEqual(packs);
  });
});
