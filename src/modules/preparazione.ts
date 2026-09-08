/* CHE COSA C'È DA PREPARARE, LETTO DAL DOCUMENTO — 2.31
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   IL VERSO SI È ROVESCIATO, ED È TUTTA LA 2.31. Fino alla 2.30 era il
   prelievo a far nascere il DDT: l'operatore scansionava la merce, il
   carrello diventava un documento, e il documento chiudeva il compito. Chi
   in ufficio sapeva che cosa doveva partire non aveva un modo per dirlo se
   non scendendo a dirlo a voce.

   Adesso l'impiegato registra il DDT, e dal DDT nasce l'attività. Questo
   modulo risponde alla sola domanda che sta in mezzo: **date le righe di un
   documento, che cosa deve andare a prendere l'operatore.**

   È PURO E NON SA NIENTE DEL MAGAZZINO. Non guarda le giacenze, non ordina
   niente e non decide da dove si preleva: quella è la serpentina, e sta in
   `pickRoute`. Qui si legge un documento e si dice che forma ha il lavoro.

   ── LE UNITÀ DI CARICO NON SI SCOMPONGONO ──────────────────────────────
   Un bancale si prende intero, ed è già così che funziona il carico del
   camion (`caricoSpedizione.ts`): si scansiona il codice del pallet, non
   quello che porta sopra. Quindi tutte le righe che nominano la stessa UDC
   diventano UNA cosa da prendere, e il conto di quel che c'è sopra resta
   attaccato per poterlo dire a video — ma non genera tappe sue.

   ── E SI CONFERMANO CON UNA SCANSIONE SOLA ─────────────────────────────
   Su un pallet imballato articolo e lotto stanno sotto il cellophane:
   chiederli vorrebbe dire chiedere all'operatore di aprire l'imballo per
   confermare di non doverlo aprire. Il codice UDC invece è sull'etichetta,
   ed è il solo dato che non invecchia. Una riga sciolta resta a tre
   scansioni — ubicazione, articolo, lotto — perché lì non c'è nessuna
   etichetta che garantisca il resto. */

import type { DocumentoUscita, RigaDocumento } from '../types/entita';

/** Una cosa da andare a prendere. O un'unità intera, o una riga di merce
    sciolta: non esiste una terza forma, e il campo `tipo` è quello che
    decide quante scansioni servono per confermarla. */
export interface DaPreparare {
  tipo: 'udc' | 'riga';
  /** Valorizzato solo su `tipo: 'udc'`. */
  udc_id: string | null;
  /** Dove sta adesso. Vuoto = il documento non lo dice, e allora la riga
      esce comunque: non trovarla è un fatto che l'operatore deve vedere,
      non un motivo per nasconderla. */
  location_code: string;
  /** Su una riga sciolta identifica la merce; su un'unità è la chiave della
      prima partita che porta, e serve solo a dire che cosa c'è sopra. */
  item_key: string;
  article_code: string;
  article_description: string;
  lot_code: string;
  /** I colli. Su un'unità è la somma di quelli delle sue righe. */
  colli: number;
  /** Le UM totali, quando il documento le dichiara. `null` = non le dice, e
      allora non si inventa un numero: è la regola della voce 19. */
  qty_uom: number | null;
  uom: string;
  /** Quante righe del documento questa cosa copre. Su una riga sciolta è 1;
      su un'unità è il numero di partite che porta. */
  righe: number;
  /** Le partite di un'unità, per dire a video che cosa si sta muovendo.
      Vuoto su una riga sciolta. */
  contenuto: { article_code: string; lot_code: string; colli: number }[];
}

const testo = (v: unknown): string => String(v ?? '').trim();
const chiave = (v: unknown): string => testo(v).toUpperCase();
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** La chiave con cui due righe sciolte si fondono: stessa merce, stesso
    posto. Due righe dello stesso lotto nello stesso vano sono una tappa
    sola — mandarci due volte è mandarci una volta di troppo. */
function chiaveRiga(l: RigaDocumento): string {
  const item = chiave(l.item_key) || `${chiave(l.article_code)}#${chiave(l.lot_code)}`;
  return `${chiave(l.location_code)}|${item}`;
}

/** Che cosa deve andare a prendere l'operatore, letto dalle righe di un
    documento.

    L'ORDINE È QUELLO DEL DOCUMENTO, e non è una scelta di comodo: qui non si
    sa niente di corsie e di geometria, e ordinare per qualcos'altro
    darebbe l'illusione di un percorso quando il percorso non c'è ancora. A
    metterle in fila è `PickRoute.ordinaPerCorsia`, dopo.

    UNA RIGA A ZERO COLLI RESTA FUORI. Non è merce da prendere: è una riga
    che qualcuno ha lasciato a metà, e mandare un operatore a prendere zero
    colli è mandarlo a fare un viaggio per niente. */
export function daPreparare(
  righe: readonly RigaDocumento[] | null | undefined,
): DaPreparare[] {
  const unita = new Map<string, DaPreparare>();
  const sciolte = new Map<string, DaPreparare>();
  const ordine: DaPreparare[] = [];

  for (const l of righe || []) {
    if (!l) continue;
    const colli = numero(l.qty);
    if (colli <= 0) continue;

    const udc = chiave(l.udc_id);
    const art = testo(l.article_code);
    const lot = testo(l.lot_code);
    const item = chiave(l.item_key) || `${chiave(art)}#${chiave(lot)}`;

    if (udc) {
      const gia = unita.get(udc);
      if (gia) {
        gia.colli += colli;
        gia.righe += 1;
        gia.qty_uom = sommaUom(gia.qty_uom, l.qty_uom);
        if (chiave(gia.uom) !== chiave(l.uom)) gia.uom = '';
        gia.contenuto.push({ article_code: art, lot_code: lot, colli });
        continue;
      }
      const nuova: DaPreparare = {
        tipo: 'udc',
        udc_id: udc,
        location_code: testo(l.location_code),
        item_key: item,
        article_code: art,
        article_description: testo(l.article_description),
        lot_code: lot,
        colli,
        qty_uom: l.qty_uom == null ? null : numero(l.qty_uom),
        uom: testo(l.uom),
        righe: 1,
        contenuto: [{ article_code: art, lot_code: lot, colli }],
      };
      unita.set(udc, nuova);
      ordine.push(nuova);
      continue;
    }

    const k = chiaveRiga(l);
    const gia = sciolte.get(k);
    if (gia) {
      gia.colli += colli;
      gia.righe += 1;
      gia.qty_uom = sommaUom(gia.qty_uom, l.qty_uom);
      continue;
    }
    const nuova: DaPreparare = {
      tipo: 'riga',
      udc_id: null,
      location_code: testo(l.location_code),
      item_key: item,
      article_code: art,
      article_description: testo(l.article_description),
      lot_code: lot,
      colli,
      qty_uom: l.qty_uom == null ? null : numero(l.qty_uom),
      uom: testo(l.uom),
      righe: 1,
      contenuto: [],
    };
    sciolte.set(k, nuova);
    ordine.push(nuova);
  }

  return ordine;
}

/** La somma di due quantità in unità di misura, dove `null` è contagioso.

    UN NUMERO CHE NON C'È NON VALE ZERO. Se una sola delle righe non dichiara
    le UM, il totale dell'unità non si può dire — e dirlo lo stesso, sommando
    quel che c'è, darebbe un numero più basso del vero con l'aria di essere
    giusto. È la stessa regola con cui `documenti.ts` lascia vuoto il totale
    di una partita con unità discordi. */
function sommaUom(a: number | null, b: unknown): number | null {
  if (a === null || b == null) return null;
  const n = Number(b);
  return Number.isFinite(n) ? a + n : null;
}

/** Quante scansioni servono per confermare una cosa da prendere.

    Una sola sull'unità di carico, tre sulla riga sciolta. Sta qui e non
    nella maschera perché è una regola, non un dettaglio di disegno: chi
    scriverà la prossima schermata di prelievo deve trovarla scritta, non
    doverla dedurre da un `if` in mezzo a un `render`. */
export function scansioniRichieste(d: DaPreparare | null | undefined): string[] {
  return d?.tipo === 'udc' ? ['udc'] : ['ubicazione', 'articolo', 'lotto'];
}

/** La richiesta di preparazione che nasce da un documento registrato.

    NON CREA NIENTE: compone il record e basta, così si può provare da fermo
    e chi lo scrive non deve avere uno Store davanti. A scriverlo è
    `Store.createTask`, come per ogni altro compito.

    LA SCADENZA È LA DATA DI RITIRO DEL VETTORE, quando c'è. Non è una data
    inventata: è quella che l'impiegato ha scritto sul documento, ed è già
    quella su cui il cruscotto calcola i suoi avvisi. Senza, il compito nasce
    senza scadenza e resta a priorità normale — che è la verità: nessuno ha
    detto per quando serve.

    IL PAYLOAD PORTA IL NUMERO DEL DOCUMENTO, NON LE SUE RIGHE. Le righe si
    correggono — `updatePendingDoc` le riscrive — e una copia congelata nel
    compito direbbe, il giorno dopo, una merce che il documento non chiede
    più. Il documento è la fonte; il compito ne porta il riferimento. */
export function richiestaPreparazione(
  doc: Partial<DocumentoUscita> | null | undefined,
  chiHaRegistrato: string,
): {
  type: string;
  requested_by: string;
  source_ref: string;
  due_at: number | null;
  payload: Record<string, unknown>;
} | null {
  if (!doc?.doc_id) return null;
  if (motivoNonPreparabile(doc)) return null;

  const cose = daPreparare(doc.lines);
  const ritiro = testo(doc.expected_pickup_date);
  const scadenza = ritiro ? Date.parse(`${ritiro}T23:59:59`) : NaN;

  return {
    type: 'PREP_SHIP',
    requested_by: testo(chiHaRegistrato),
    source_ref: testo(doc.doc_id),
    due_at: Number.isFinite(scadenza) ? scadenza : null,
    payload: {
      doc_id: testo(doc.doc_id),
      ddt_num: testo(doc.ddt_num),
      destination: testo(doc.destination),
      /* `causale_label` è quello che il record scrive; `causale` è un campo
         legacy che nessuno valorizza più. Il ripiego regge i documenti
         antichi, che quello vecchio ce l'hanno. */
      causale: testo(doc.causale_label) || testo(doc.causale),
      /* Quante cose ci sono da prendere, e quante sono unità intere: serve a
         chi guarda la coda per capire quanto dura, senza aprire il
         documento. Sono numeri, non merce: si ricalcolano ogni volta che il
         percorso si costruisce. */
      cose: cose.length,
      unita: cose.filter((c) => c.tipo === 'udc').length,
      colli: cose.reduce((n, c) => n + c.colli, 0),
    },
  };
}

/** Il documento è pronto per diventare un'attività di preparazione?

    NON BASTA CHE ESISTA. Un documento già evaso è merce partita; uno
    annullato non deve mandare nessuno in corsia; uno senza righe da prendere
    genererebbe un'attività che nasce già finita, e una coda che si riempie
    di lavoro finto è una coda che si smette di guardare.

    Torna il motivo, o `null` se va bene: chi chiama lo mostra a chi ha
    registrato il documento, nel momento in cui l'ha registrato. */
export function motivoNonPreparabile(
  doc: Partial<DocumentoUscita> | null | undefined,
): string | null {
  if (!doc) return 'Documento assente.';
  const stato = testo(doc.status).toLowerCase();
  if (stato === 'evaded') return 'Il documento è già evaso: la merce è partita.';
  if (stato === 'cancelled') return 'Il documento è annullato.';
  if (!daPreparare(doc.lines).length) return 'Il documento non ha righe da preparare.';
  return null;
}
