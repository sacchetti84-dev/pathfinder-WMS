/* CHE COSA C'È DA PREPARARE — 2.31
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Il verso si è rovesciato: non è più il prelievo a far nascere il DDT, è il
   DDT a far nascere il lavoro. Questo modulo sta in mezzo, e risponde a una
   domanda sola — date le righe di un documento, che cosa va a prendere
   l'operatore.

   LE PROVE QUI SOTTO CERCANO DI FARLO SBAGLIARE, non di confermarlo. I casi
   che contano sono quattro, e nascono tutti da come sono fatti i documenti
   veri:

   · **Un bancale su più righe.** Un pallet che porta tre partite scrive tre
     righe di documento con lo stesso `udc_id`. Se diventassero tre tappe,
     l'operatore andrebbe tre volte allo stesso pallet — e il carico del
     camion, che questo lavoro lo fa già dalla 2.21, ne fa una sola.

   · **Le UM che non ci sono.** `qty_uom` è facoltativo. Sommare quel che c'è
     e ignorare quel che manca dà un totale più basso del vero con l'aria di
     essere giusto: è la voce 19 applicata a un bancale.

   · **Le righe a zero colli.** Restano nei documenti quando qualcuno
     corregge una riga invece di toglierla. Mandare in corsia a prendere zero
     colli è un viaggio per niente.

   · **Righe sciolte doppie.** Lo stesso lotto nello stesso vano può stare su
     due righe: `(location_code, item_key)` è un indice e non un vincolo
     (voce 98). Due tappe nello stesso vano sono una di troppo. */
import { describe, it, expect } from 'vitest';
import {
  daPreparare, scansioniRichieste, motivoNonPreparabile, richiestaPreparazione,
  daImballare, daImballareDalDoc, unitaGiaPronte,
  statoSpedizione, modiPossibili, avvisoCarico, avvisoPreparazione,
} from '../src/modules/preparazione';

const riga = (extra = {}) => ({
  article_code: '7000924',
  article_description: 'Farina di riso',
  lot_code: '123456',
  location_code: 'MAG-ACC-07',
  item_key: '7000924#123456',
  qty: 10,
  qty_uom: 200,
  uom: 'KG',
  ...extra,
});

describe('daPreparare — le unità di carico', () => {
  it('tre righe dello stesso bancale fanno UNA cosa da prendere', () => {
    const d = daPreparare([
      riga({ udc_id: 'UDC-1', lot_code: 'L1', item_key: 'A#L1', qty: 4, qty_uom: 80 }),
      riga({ udc_id: 'UDC-1', lot_code: 'L2', item_key: 'A#L2', qty: 3, qty_uom: 60 }),
      riga({ udc_id: 'UDC-1', lot_code: 'L3', item_key: 'A#L3', qty: 2, qty_uom: 40 }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].tipo).toBe('udc');
    expect(d[0].udc_id).toBe('UDC-1');
    expect(d[0].colli).toBe(9);
    expect(d[0].qty_uom).toBe(180);
    expect(d[0].righe).toBe(3);
  });

  it('e il contenuto resta attaccato, per poterlo dire a video', () => {
    const d = daPreparare([
      riga({ udc_id: 'UDC-1', lot_code: 'L1', qty: 4 }),
      riga({ udc_id: 'UDC-1', lot_code: 'L2', qty: 3 }),
    ]);
    expect(d[0].contenuto).toEqual([
      { article_code: '7000924', lot_code: 'L1', colli: 4 },
      { article_code: '7000924', lot_code: 'L2', colli: 3 },
    ]);
  });

  it('due bancali diversi restano due cose da prendere', () => {
    const d = daPreparare([
      riga({ udc_id: 'UDC-1' }),
      riga({ udc_id: 'UDC-2' }),
    ]);
    expect(d.map(x => x.udc_id)).toEqual(['UDC-1', 'UDC-2']);
  });

  it('il codice del bancale non guarda maiuscole e spazi', () => {
    const d = daPreparare([
      riga({ udc_id: 'UDC-1', qty: 4 }),
      riga({ udc_id: ' udc-1 ', qty: 3 }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].colli).toBe(7);
  });

  /* IL CASO CHE FA SBAGLIARE IL CONTO. Una riga senza `qty_uom` non vale
     zero: rende il totale del bancale indicibile. */
  it('una partita senza UM rende indicibile il totale dell\'unità', () => {
    const d = daPreparare([
      riga({ udc_id: 'UDC-1', qty: 4, qty_uom: 80 }),
      riga({ udc_id: 'UDC-1', qty: 3, qty_uom: null }),
    ]);
    expect(d[0].colli).toBe(7);
    expect(d[0].qty_uom).toBeNull();
  });

  it('e non conta se la riga senza UM arriva per prima', () => {
    const d = daPreparare([
      riga({ udc_id: 'UDC-1', qty: 3, qty_uom: null }),
      riga({ udc_id: 'UDC-1', qty: 4, qty_uom: 80 }),
    ]);
    expect(d[0].qty_uom).toBeNull();
  });

  it('due unità di misura diverse sullo stesso bancale lasciano l\'unità vuota', () => {
    const d = daPreparare([
      riga({ udc_id: 'UDC-1', uom: 'KG' }),
      riga({ udc_id: 'UDC-1', uom: 'PZ' }),
    ]);
    expect(d[0].uom).toBe('');
  });
});

describe('daPreparare — le righe sciolte', () => {
  it('una riga senza bancale è una cosa da prendere a sé', () => {
    const d = daPreparare([riga()]);
    expect(d).toHaveLength(1);
    expect(d[0].tipo).toBe('riga');
    expect(d[0].udc_id).toBeNull();
    expect(d[0].contenuto).toEqual([]);
  });

  /* Voce 98: `(location_code, item_key)` è un indice, non un vincolo. Lo
     stesso lotto nello stesso vano su due righe è uno stato possibile. */
  it('lo stesso lotto nello stesso vano fa una tappa, non due', () => {
    const d = daPreparare([riga({ qty: 4, qty_uom: 80 }), riga({ qty: 6, qty_uom: 120 })]);
    expect(d).toHaveLength(1);
    expect(d[0].colli).toBe(10);
    expect(d[0].qty_uom).toBe(200);
    expect(d[0].righe).toBe(2);
  });

  it('lo stesso lotto in due vani resta due tappe', () => {
    const d = daPreparare([riga({ location_code: 'A' }), riga({ location_code: 'B' })]);
    expect(d).toHaveLength(2);
  });

  it('e due lotti nello stesso vano restano due tappe', () => {
    const d = daPreparare([
      riga({ lot_code: 'L1', item_key: 'A#L1' }),
      riga({ lot_code: 'L2', item_key: 'A#L2' }),
    ]);
    expect(d).toHaveLength(2);
  });

  it('senza item_key la chiave si compone da articolo e lotto', () => {
    const d = daPreparare([
      riga({ item_key: undefined, qty: 4 }),
      riga({ item_key: undefined, qty: 6 }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].colli).toBe(10);
  });

  it('una riga sciolta non si fonde con una che sta su un bancale', () => {
    const d = daPreparare([riga(), riga({ udc_id: 'UDC-1' })]);
    expect(d).toHaveLength(2);
    expect(d.map(x => x.tipo)).toEqual(['riga', 'udc']);
  });
});

describe('daPreparare — quel che resta fuori', () => {
  it('una riga a zero colli non manda nessuno in corsia', () => {
    expect(daPreparare([riga({ qty: 0 })])).toEqual([]);
  });

  it('e nemmeno una a colli negativi', () => {
    expect(daPreparare([riga({ qty: -3 })])).toEqual([]);
  });

  it('una riga senza colli leggibili resta fuori', () => {
    expect(daPreparare([riga({ qty: null })])).toEqual([]);
    expect(daPreparare([riga({ qty: 'tre' })])).toEqual([]);
  });

  /* Ma una riga a zero DENTRO un bancale non deve far sparire il bancale:
     è il resto che si va a prendere comunque. */
  it('una partita a zero non fa sparire il bancale che la porta', () => {
    const d = daPreparare([
      riga({ udc_id: 'UDC-1', qty: 0 }),
      riga({ udc_id: 'UDC-1', qty: 5 }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].colli).toBe(5);
    expect(d[0].righe).toBe(1);
  });

  it('un documento vuoto non dà niente da fare', () => {
    expect(daPreparare([])).toEqual([]);
    expect(daPreparare(null)).toEqual([]);
    expect(daPreparare([null, undefined])).toEqual([]);
  });

  /* Una riga senza ubicazione ESCE comunque: non trovarla è un fatto che
     l'operatore deve vedere, non un motivo per nasconderla. */
  it('una riga senza ubicazione esce lo stesso', () => {
    const d = daPreparare([riga({ location_code: '' })]);
    expect(d).toHaveLength(1);
    expect(d[0].location_code).toBe('');
  });

  it('l\'ordine è quello del documento, e non si riordina', () => {
    const d = daPreparare([
      riga({ location_code: 'Z-99' }),
      riga({ location_code: 'A-01' }),
      riga({ udc_id: 'UDC-1', location_code: 'M-50' }),
    ]);
    expect(d.map(x => x.location_code)).toEqual(['Z-99', 'A-01', 'M-50']);
  });
});

describe('scansioniRichieste', () => {
  /* LA REGOLA DELL'08/09: su un pallet imballato articolo e lotto stanno
     sotto il cellophane. Chiederli vorrebbe dire chiedere di aprire
     l'imballo per confermare di non doverlo aprire. */
  it('un\'unità di carico si conferma con la sola scansione del suo codice', () => {
    expect(scansioniRichieste({ tipo: 'udc' })).toEqual(['udc']);
  });

  it('una riga sciolta resta a tre: lì non c\'è nessuna etichetta che garantisca il resto', () => {
    expect(scansioniRichieste({ tipo: 'riga' })).toEqual(['ubicazione', 'articolo', 'lotto']);
  });

  it('nel dubbio si chiedono tutte e tre, non una', () => {
    expect(scansioniRichieste(null)).toEqual(['ubicazione', 'articolo', 'lotto']);
    expect(scansioniRichieste({})).toEqual(['ubicazione', 'articolo', 'lotto']);
  });
});

describe('motivoNonPreparabile', () => {
  const doc = (extra = {}) => ({ status: 'pending', lines: [riga()], ...extra });

  it('un documento pendente con righe si prepara', () => {
    expect(motivoNonPreparabile(doc())).toBeNull();
  });

  it('un documento evaso no: la merce è partita', () => {
    expect(motivoNonPreparabile(doc({ status: 'evaded' }))).toMatch(/evaso/i);
  });

  it('un documento annullato non manda nessuno in corsia', () => {
    expect(motivoNonPreparabile(doc({ status: 'cancelled' }))).toMatch(/annullato/i);
  });

  /* Un'attività che nasce già finita riempie la coda di lavoro finto, e una
     coda piena di lavoro finto è una coda che si smette di guardare. */
  it('un documento con sole righe a zero non genera un\'attività vuota', () => {
    expect(motivoNonPreparabile(doc({ lines: [riga({ qty: 0 })] }))).toMatch(/righe/i);
    expect(motivoNonPreparabile(doc({ lines: [] }))).toMatch(/righe/i);
  });

  it('lo stato si legge senza badare alle maiuscole', () => {
    expect(motivoNonPreparabile(doc({ status: 'EVADED' }))).toMatch(/evaso/i);
  });

  it('senza documento lo dice invece di esplodere', () => {
    expect(motivoNonPreparabile(null)).toBeTruthy();
    expect(motivoNonPreparabile(undefined)).toBeTruthy();
  });
});

describe('richiestaPreparazione', () => {
  const doc = (extra = {}) => ({
    doc_id: 'SHIP-127-abc',
    ddt_num: '127',
    destination: 'BIOTECH SRL',
    causale_label: 'Vendita',
    status: 'pending',
    expected_pickup_date: '2026-09-25',
    lines: [riga(), riga({ udc_id: 'UDC-1', location_code: 'M03-SPE-01' })],
    ...extra,
  });

  it('nasce del tipo giusto e porta il documento', () => {
    const r = richiestaPreparazione(doc(), 'AS');
    expect(r.type).toBe('PREP_SHIP');
    expect(r.requested_by).toBe('AS');
    expect(r.source_ref).toBe('SHIP-127-abc');
    expect(r.payload.doc_id).toBe('SHIP-127-abc');
    expect(r.payload.ddt_num).toBe('127');
    expect(r.payload.destination).toBe('BIOTECH SRL');
  });

  /* IL PAYLOAD PORTA IL RIFERIMENTO, NON LE RIGHE. Le righe si correggono —
     `updatePendingDoc` le riscrive — e una copia congelata direbbe, il giorno
     dopo, una merce che il documento non chiede piu'. */
  /* IL CAMPO CHE NESSUNO SCRIVE. Il record scrive `causale_label` dalla 1.8;
     `causale` e' legacy e resta vuoto. Leggere quello sbagliato dava sempre
     stringa vuota, e la vuota aveva l'aria di essere «causale non
     impostata». Trovato a video il 08/09. */
  it('legge l etichetta che il record scrive davvero', () => {
    expect(richiestaPreparazione(doc(), 'AS').payload.causale).toBe('Vendita');
  });

  it('e ripiega sul campo legacy per i documenti antichi', () => {
    const antico = doc({ causale_label: undefined, causale: 'Vendita vecchia' });
    expect(richiestaPreparazione(antico, 'AS').payload.causale).toBe('Vendita vecchia');
  });

  it('non si porta dietro una copia delle righe', () => {
    const r = richiestaPreparazione(doc(), 'AS');
    expect(r.payload.lines).toBeUndefined();
    expect(JSON.stringify(r.payload)).not.toContain('7000924');
  });

  it('ma dice quanto lavoro c\'e, per chi guarda la coda', () => {
    const r = richiestaPreparazione(doc(), 'AS');
    expect(r.payload.cose).toBe(2);
    expect(r.payload.unita).toBe(1);
    expect(r.payload.colli).toBe(20);
  });

  /* LA SCADENZA E' LA DATA DI RITIRO, non una data inventata: e' quella che
     l'impiegato ha scritto, ed e' gia' quella su cui il cruscotto calcola i
     suoi avvisi. */
  it('la scadenza e la data di ritiro del vettore, a fine giornata', () => {
    const r = richiestaPreparazione(doc(), 'AS');
    expect(new Date(r.due_at).toISOString().slice(0, 10)).toBe('2026-09-25');
  });

  it('senza data di ritiro nasce senza scadenza, e non se ne inventa una', () => {
    expect(richiestaPreparazione(doc({ expected_pickup_date: '' }), 'AS').due_at).toBeNull();
    expect(richiestaPreparazione(doc({ expected_pickup_date: undefined }), 'AS').due_at).toBeNull();
  });

  it('e una data illeggibile non diventa una scadenza a caso', () => {
    expect(richiestaPreparazione(doc({ expected_pickup_date: 'quando capita' }), 'AS').due_at).toBeNull();
  });

  /* LO SCARICO A MANO scrive un documento e lo evade nello stesso gesto: la
     merce e' gia' partita, e un'attivita' per andarla a prendere manderebbe
     qualcuno a cercare quel che non c'e' piu'. */
  it('un documento gia evaso non genera nessuna attivita', () => {
    expect(richiestaPreparazione(doc({ status: 'evaded' }), 'AS')).toBeNull();
  });

  it('ne uno annullato, ne uno senza righe da prendere', () => {
    expect(richiestaPreparazione(doc({ status: 'cancelled' }), 'AS')).toBeNull();
    expect(richiestaPreparazione(doc({ lines: [] }), 'AS')).toBeNull();
    expect(richiestaPreparazione(doc({ lines: [riga({ qty: 0 })] }), 'AS')).toBeNull();
  });

  it('un documento senza identificativo non e un documento', () => {
    expect(richiestaPreparazione(doc({ doc_id: '' }), 'AS')).toBeNull();
    expect(richiestaPreparazione(null, 'AS')).toBeNull();
  });

  it('non tocca il documento che riceve', () => {
    const d = doc();
    const prima = JSON.stringify(d);
    richiestaPreparazione(d, 'AS');
    expect(JSON.stringify(d)).toBe(prima);
  });
});

/* LA CHIUSURA: CHE COSA RESTA DA IMBALLARE — 2.31

   Il percorso finisce quando l'ultima tappa e' confermata; il LAVORO no. La
   merce sciolta raccolta in corsia e' ancora un mucchio di colli sul
   carrello, e quel che sale sul camion e' un'unita' imballata ed
   etichettata. E' per questo che `PREP_SHIP` chiude al gesto e non a
   residuo: un conto sui colli direbbe «fatto» a meta' lavoro.

   Le prove cercano di far sbagliare in tre modi: contando una tappa non
   trovata come merce in mano, rifacendo un'unita' che c'e' gia', e
   dichiarando finito un lavoro che ha ancora tappe aperte. */
const tappa = (extra = {}) => ({
  status: 'done', udc_id: null, item_key: 'A#L1',
  article_code: 'A', lot_code: 'L1', qty_picked: 5, kg_required: 5, um: 'KG',
  ...extra,
});

describe('daImballare', () => {
  it('la merce sciolta confermata e quel che va composto in unita', () => {
    const d = daImballare([tappa()]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ item_key: 'A#L1', colli: 5, um: 'KG' });
  });

  /* UNA TAPPA NON TROVATA NON E' SUL CARRELLO. Metterla nell'elenco vorrebbe
     dire chiedere di imballare qualcosa che l'operatore non ha in mano. */
  it('una tappa non trovata non entra in quel che c e da imballare', () => {
    expect(daImballare([tappa({ status: 'missing' })])).toEqual([]);
    expect(daImballare([tappa({ status: 'pending' })])).toEqual([]);
  });

  /* UN PALLET PRESO INTERO E' GIA' UN'UNITA': ha codice, etichetta e
     contenuto. Rifarne una attorno vorrebbe dire un secondo codice sullo
     stesso legno, e un'etichetta che ne contraddice un'altra. */
  it('un unita gia presa non si rifa', () => {
    expect(daImballare([tappa({ udc_id: 'UDC-1' })])).toEqual([]);
  });

  /* 2.35.1 — E OGNI RIGA DICE DA QUALE VANO SI PRENDE.

     Chi compone l'unita' ricalcolava «il primo vano libero della zona
     d'imballaggio», e dopo che le tappe ci hanno posato la merce quel vano
     non e' piu' lo stesso — proprio perche' la merce ci e' arrivata. Al
     banco, l'08/09: merce in MAG-ACC-11, unita' nata in MAG-ACC-12, e
     nessuna assegnazione riuscita. La tappa lo sa gia': `moved_to`. */
  it('ogni riga porta il vano dove la tappa ha posato la merce', () => {
    const d = daImballare([tappa({ moved_to: 'MAG-ACC-11' })]);
    expect(d[0].da).toBe('MAG-ACC-11');
  });

  it('e senza `moved_to` il campo resta vuoto invece di inventarsi un vano', () => {
    /* Vuoto vuol dire «non lo so», e chi compone puo' ripiegare dicendolo.
       Un vano dedotto sarebbe indistinguibile da uno vero. */
    expect(daImballare([tappa()])[0].da).toBe('');
  });

  it('due tappe nello stesso vano restano una riga sola, e il vano e quello', () => {
    const d = daImballare([
      tappa({ qty_picked: 4, moved_to: 'MAG-ACC-11' }),
      tappa({ qty_picked: 6, moved_to: 'MAG-ACC-11' }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ colli: 10, da: 'MAG-ACC-11' });
  });

  it('due tappe dello stesso lotto si sommano in una riga sola', () => {
    const d = daImballare([tappa({ qty_picked: 4 }), tappa({ qty_picked: 6 })]);
    expect(d).toHaveLength(1);
    expect(d[0].colli).toBe(10);
  });

  /* Il PRELEVATO vince sul CHIESTO: un prelievo parziale mette sul carrello
     quel che e' sceso, non quel che era stato chiesto. */
  it('conta quel che e stato prelevato, non quel che era stato chiesto', () => {
    expect(daImballare([tappa({ qty_picked: 3, kg_required: 10 })])[0].colli).toBe(3);
  });

  it('ma senza il prelevato ripiega sul chiesto', () => {
    expect(daImballare([tappa({ qty_picked: 0, kg_required: 10 })])[0].colli).toBe(10);
  });

  it('una tappa a zero da tutte e due le parti resta fuori', () => {
    expect(daImballare([tappa({ qty_picked: 0, kg_required: 0 })])).toEqual([]);
  });

  it('senza tappe non esplode', () => {
    expect(daImballare(null)).toEqual([]);
    expect(daImballare([null, undefined])).toEqual([]);
  });
});

describe('unitaGiaPronte', () => {
  it('elenca i pallet presi interi, una volta ciascuno', () => {
    const u = unitaGiaPronte([
      tappa({ udc_id: 'UDC-1' }), tappa({ udc_id: 'UDC-1' }), tappa({ udc_id: 'UDC-2' }), tappa(),
    ]);
    expect(u).toEqual(['UDC-1', 'UDC-2']);
  });

  it('un pallet non trovato non e pronto', () => {
    expect(unitaGiaPronte([tappa({ udc_id: 'UDC-1', status: 'missing' })])).toEqual([]);
  });
});


/* ═══ 2.38 · A CHE PUNTO È LA SPEDIZIONE ════════════════════════════════

   Un'attività di spedizione non si chiude più a fine percorso: si raduna, si
   imballa, si carica, e fra un pezzo e l'altro torna in coda. Il punto in
   cui si trova NON si scrive sul compito — si legge dal documento, perché
   le righe dicono dov'è la merce adesso e sono la stessa fonte che
   l'evasione andrà a leggere.

   LE PROVE QUI SOTTO CERCANO DI FARLO SBAGLIARE. I casi che contano sono
   quelli in cui una lettura sbrigativa direbbe il contrario del vero:

   · Il documento VUOTO. `[].every()` è vero, quindi «tutte le righe stanno
     su un bancale» è vero su zero righe: un DDT senza niente si
     annuncerebbe pronto a salire sul camion.
   · La riga A ZERO COLLI. Resta nei documenti quando qualcuno corregge
     invece di togliere. Se contasse, un DDT pronto risulterebbe da
     preparare per una riga che non è merce.
   · La merce radunata a METÀ. Due partite sciolte, una portata al banco e
     una ancora a scaffale: «da imballare» direbbe a chi lo prende che il
     giro è finito, e quello imballerebbe metà DDT.
   · Il DDT NATO PRONTO, di sole unità già composte. È il caso che ha fatto
     nascere tutto questo: non ha mai avuto bisogno di essere preparato, e
     mandarlo in corsia è il viaggio che questa versione esiste per non
     fare. */

/* Nessun vano è zona di imballaggio: la risposta più severa. */
const nessunBanco = () => false;
/* Solo BANCO-01 lo è. */
const banco = (v) => String(v || '').toUpperCase() === 'BANCO-01';

const doc = (lines) => ({ doc_id: 'SHIP-1', ddt_num: 'DDT-1', status: 'pending', lines });

describe('statoSpedizione', () => {
  it('ogni riga su un bancale = carico pronto, e non serve nessuna zona', () => {
    const d = doc([
      riga({ udc_id: 'UDC-1' }),
      riga({ udc_id: 'UDC-2', lot_code: 'L2', item_key: 'A#L2' }),
    ]);
    expect(statoSpedizione(d, nessunBanco)).toBe('carico_pronto');
  });

  it('UN DOCUMENTO VUOTO NON E PRONTO — [].every() e vero, e mentirebbe', () => {
    expect(statoSpedizione(doc([]), banco)).toBe('da_preparare');
    expect(statoSpedizione(doc(null), banco)).toBe('da_preparare');
    expect(statoSpedizione(null, banco)).toBe('da_preparare');
  });

  it('UNA RIGA A ZERO COLLI NON CONTA: il DDT resta pronto', () => {
    const d = doc([
      riga({ udc_id: 'UDC-1' }),
      riga({ qty: 0, lot_code: 'L9', item_key: 'A#L9', location_code: 'MAG-ACC-01' }),
    ]);
    expect(statoSpedizione(d, banco)).toBe('carico_pronto');
  });

  it('merce sciolta tutta al banco = da imballare', () => {
    const d = doc([
      riga({ location_code: 'BANCO-01' }),
      riga({ location_code: 'BANCO-01', lot_code: 'L2', item_key: 'A#L2' }),
      riga({ udc_id: 'UDC-1', location_code: 'BANCO-01' }),
    ]);
    expect(statoSpedizione(d, banco)).toBe('da_imballare');
  });

  it('RADUNATA A META NON E DA IMBALLARE: una sola riga fuori basta', () => {
    const d = doc([
      riga({ location_code: 'BANCO-01' }),
      riga({ location_code: 'MAG-A-07', lot_code: 'L2', item_key: 'A#L2' }),
    ]);
    expect(statoSpedizione(d, banco)).toBe('da_preparare');
  });

  it('senza nessuna zona di imballaggio dichiarata, la merce sciolta resta da preparare', () => {
    const d = doc([riga({ location_code: 'BANCO-01' })]);
    expect(statoSpedizione(d, nessunBanco)).toBe('da_preparare');
  });
});

describe('modiPossibili — i pulsanti che l operatore vede', () => {
  /* IL CARICO C'E' SEMPRE, ed e' la risposta alla domanda da cui e' partito
     tutto: non tutti i DDT hanno bisogno di essere preparati. */
  it('il carico compare in tutti e tre gli stati', () => {
    for (const s of ['da_preparare', 'da_imballare', 'carico_pronto']) {
      expect(modiPossibili(s)).toContain('carico');
    }
  });

  it('su un DDT pronto il carico e il primo, e preparare resta possibile', () => {
    expect(modiPossibili('carico_pronto')).toEqual(['carico', 'preparazione']);
  });

  it('su uno da imballare non si propone di ripreparare', () => {
    expect(modiPossibili('da_imballare')).toEqual(['imballaggio', 'carico']);
  });

  it('su uno da preparare non si propone di imballare: non c e ancora niente al banco', () => {
    expect(modiPossibili('da_preparare')).toEqual(['preparazione', 'carico']);
  });
});

describe('gli avvisi — si dice, non si vieta', () => {
  it('su un DDT pronto il carico non ha niente da dire', () => {
    expect(avvisoCarico(doc([riga({ udc_id: 'UDC-1' })]), 'carico_pronto')).toBeNull();
  });

  it('caricare un DDT senza nessun bancale avvisa che non c e niente da scansionare', () => {
    const d = doc([riga({ location_code: 'MAG-A-07' })]);
    expect(avvisoCarico(d, 'da_preparare')).toMatch(/nessuna riga/i);
  });

  it('caricare un DDT a meta dice quante righe salgono a mano', () => {
    const d = doc([
      riga({ udc_id: 'UDC-1' }),
      riga({ lot_code: 'L2', item_key: 'A#L2', location_code: 'MAG-A-07' }),
    ]);
    expect(avvisoCarico(d, 'da_preparare')).toMatch(/^1 righe/);
  });

  it('ripreparare un DDT gia pronto avvisa; prepararne uno da fare no', () => {
    expect(avvisoPreparazione('carico_pronto')).toMatch(/gi.\s*su un bancale/i);
    expect(avvisoPreparazione('da_preparare')).toBeNull();
    expect(avvisoPreparazione('da_imballare')).toBeNull();
  });
});

describe('daImballareDalDoc — imballare senza avere il percorso davanti', () => {
  /* Chi prende in carico un'attivita' «da imballare» non ha nessuna
     sessione: il percorso l'ha chiuso un altro, magari ieri. Quel che c'e'
     da imballare lo dicono le righe sciolte del documento. */
  it('legge le sole righe che non stanno su un bancale, col vano di adesso', () => {
    const r = daImballareDalDoc(doc([
      riga({ location_code: 'BANCO-01', qty: 4 }),
      riga({ udc_id: 'UDC-1', location_code: 'BANCO-01' }),
    ]));
    expect(r).toHaveLength(1);
    expect(r[0].da).toBe('BANCO-01');
    expect(r[0].colli).toBe(4);
  });

  it('due righe della stessa partita fanno una cosa sola, coi colli sommati', () => {
    const r = daImballareDalDoc(doc([
      riga({ location_code: 'BANCO-01', qty: 4 }),
      riga({ location_code: 'BANCO-01', qty: 6 }),
    ]));
    expect(r).toHaveLength(1);
    expect(r[0].colli).toBe(10);
  });

  it('una riga a zero colli non e merce da imballare', () => {
    expect(daImballareDalDoc(doc([riga({ qty: 0 })]))).toEqual([]);
  });

  it('un DDT tutto su bancali non ha niente da imballare', () => {
    expect(daImballareDalDoc(doc([riga({ udc_id: 'UDC-1' })]))).toEqual([]);
  });

  it('senza documento non esplode', () => {
    expect(daImballareDalDoc(null)).toEqual([]);
  });
});
