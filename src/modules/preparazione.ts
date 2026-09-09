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
  /** 2.38.1 — I COLLI CHE IL DOCUMENTO HA GIÀ SCELTO.

      Dalla 1.8.4 chi compone un DDT non dice soltanto QUANTI colli escono:
      dice QUALI, per misura — `packs_out` — e l'evasione li riprende senza
      chiedere niente, perché la merce che sale sul camion è quella che il
      documento nomina e non un'altra della stessa quantità.

      Una preparazione va a prendere esattamente quella merce, quindi quella
      scelta deve arrivare fino alla corsia: senza, la maschera dei colli si
      apre vuota e l'operatore ne sceglie altri: stessa quantità, sacchi
      diversi da quelli che il DDT promette. Su un lotto con colli di misure
      diverse è merce diversa.

      Vuoto quando il documento non lo dice — i DDT scritti prima della 1.8.4
      non lo portano — e allora si chiede come si faceva allora. */
  packs_out: { da: number; quantita: number }[];
  /** Le partite di un'unità, per dire a video che cosa si sta muovendo.
      Vuoto su una riga sciolta. */
  contenuto: { article_code: string; lot_code: string; colli: number }[];
}

const testo = (v: unknown): string => String(v ?? '').trim();
const chiave = (v: unknown): string => testo(v).toUpperCase();
/** I colli che una riga di documento dichiara di far uscire, per misura.
    Vuoto quando il documento non lo dice: si legge, non si inventa. */
function pacchi(l: RigaDocumento): { da: number; quantita: number }[] {
  const v = (l as { packs_out?: unknown }).packs_out;
  return Array.isArray(v) ? (v as { da: number; quantita: number }[]).filter(Boolean) : [];
}

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
        gia.packs_out.push(...pacchi(l));
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
        packs_out: pacchi(l),
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
      /* DUE RIGHE FUSE PORTANO I COLLI DI TUTTE E DUE. Sono la stessa merce
         nello stesso vano — una tappa sola — e la scelta del documento è la
         somma delle due scelte, non quella della prima che si incontra. */
      gia.packs_out.push(...pacchi(l));
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
      packs_out: pacchi(l),
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

/** Quel che l'operatore ha in mano: una scansione per casella, vuota finché
    non l'ha fatta. Sono i nomi che usa la maschera del percorso. */
export interface ScansioniInMano {
  loc?: string;
  art?: string;
  lot?: string;
  udc?: string;
}

const CASELLA: Record<string, keyof ScansioniInMano> = {
  ubicazione: 'loc', articolo: 'art', lotto: 'lot', udc: 'udc',
};

/** 2.35.1 — LE SCANSIONI IN MANO BASTANO A QUESTA TAPPA?

    `scansioniRichieste` dice QUALI servono; questa dice se ci sono. Le due
    stanno insieme perché separate si separano davvero: fino alla 2.35 la
    maschera del percorso decideva in tre posti diversi, e in uno dei tre —
    quello che ridisegna la scheda — la condizione era scritta a mano come
    «c'è l'ubicazione». Su una tappa di unità di carico l'ubicazione non si
    scansiona mai, quindi quella condizione era falsa per costruzione: il
    codice del bancale veniva letto, riconosciuto, e cancellato dal ridisegno
    che seguiva. Il magazzino ha visto «Unità confermata» e subito dopo
    «Serve il codice dell'unità».

    Il difetto non stava in una riga sbagliata: stava nell'avere la stessa
    regola scritta tre volte, e in una delle tre in una grammatica sola. */
export function scansioniBastano(
  d: DaPreparare | null | undefined,
  inMano: ScansioniInMano | null | undefined,
): boolean {
  const s = inMano || {};
  return scansioniRichieste(d).every((nome) => {
    const casella = CASELLA[nome];
    return !!casella && !!testo(s[casella]);
  });
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

/* ═══ LA CHIUSURA: CHE COSA RESTA DA IMBALLARE ═══════════════════════════

   Il percorso finisce quando l'ultima tappa è confermata. Ma il LAVORO no:
   la merce sciolta raccolta in corsia è ancora un mucchio di colli sul
   carrello, e quel che deve salire sul camion è un'unità di carico
   imballata ed etichettata. È per questo che `PREP_SHIP` chiude al gesto e
   non a residuo — un conto sui colli direbbe «fatto» a metà lavoro.

   LE UNITÀ GIÀ PRESE NON SI RIFANNO. Un pallet prelevato intero è già
   un'unità: ha il suo codice, la sua etichetta e il suo contenuto. Rifarne
   una attorno vorrebbe dire un secondo codice sullo stesso legno, e
   un'etichetta che ne contraddice un'altra. Passa in zona imballaggio come
   sta, e da lì in baia con un normale trasferimento.

   QUEL CHE VA IMBALLATO È SOLO LA MERCE SCIOLTA, e quella sì diventa una o
   più unità nuove. Quante, lo decide chi imballa guardando il bancale: qui
   si dice CHE COSA c'è da mettere sopra, non in quanti pezzi dividerlo. */

/** Le tappe confermate che portano merce sciolta, cioè quel che resta da
    comporre in unità di carico.

    UNA TAPPA NON CONFERMATA NON C'È. Se l'operatore non l'ha trovata, quella
    merce non è sul carrello: metterla nell'elenco di quel che va imballato
    vorrebbe dire chiedergli di imballare qualcosa che non ha in mano. */
export function daImballare(
  tappe: readonly {
    status?: string; udc_id?: string | null; item_key?: string;
    article_code?: string; lot_code?: string; qty_picked?: number | null;
    kg_required?: number | null; um?: string;
  }[] | null | undefined,
): { item_key: string; article_code: string; lot_code: string; colli: number; um: string; da: string }[] {
  const out = new Map<string, { item_key: string; article_code: string; lot_code: string; colli: number; um: string; da: string }>();
  for (const t of tappe || []) {
    if (!t || t.status !== 'done') continue;
    if (chiave(t.udc_id)) continue;            // già un'unità: non si rifà
    const colli = numero(t.qty_picked) || numero(t.kg_required);
    if (colli <= 0) continue;
    const k = chiave(t.item_key) || `${chiave(t.article_code)}#${chiave(t.lot_code)}`;
    const gia = out.get(k);
    if (gia) { gia.colli += colli; continue; }
    out.set(k, {
      item_key: k,
      article_code: testo(t.article_code),
      lot_code: testo(t.lot_code),
      colli,
      um: testo(t.um),
      /* 2.35.1 — DA DOVE SI PRENDE PER COMPORRE, e non è una domanda da
         rifare. La tappa timbra `moved_to` col vano dove ha davvero posato
         la merce; chi compone l'unità ricalcolava invece «il primo vano
         libero della zona d'imballaggio», e quel vano non è più lo stesso —
         proprio perché la merce ci è appena arrivata e non è più libero.
         Al banco, l'08/09: la merce era in MAG-ACC-11, l'unità è nata in
         MAG-ACC-12, e nessuna delle due si è vista l'altra. */
      da: chiave((t as { moved_to?: string }).moved_to),
    });
  }
  return [...out.values()];
}

/** 2.38 — LO STESSO ELENCO, LETTO DAL DOCUMENTO INVECE CHE DALLE TAPPE.

    Chi prende in carico un'attività «da imballare» non ha nessuna sessione
    di prelievo davanti: il percorso l'ha fatto e chiuso un altro, magari
    ieri. Quel che c'è da imballare lo dicono le righe sciolte del DDT — la
    merce che non sta ancora su un bancale — e il vano da cui prenderla è
    quello che la riga porta adesso, perché chi ha radunato l'ha riallineata
    spostandola.

    LA FORMA È QUELLA DI `daImballare`, e non per comodità: da qui in poi
    imballare è lo stesso lavoro, e due forme diverse vorrebbero dire due
    strade che si somigliano finché qualcuno ne corregge una sola. */
export function daImballareDalDoc(
  doc: Partial<DocumentoUscita> | null | undefined,
): { item_key: string; article_code: string; lot_code: string; colli: number; um: string; da: string }[] {
  const out = new Map<string, { item_key: string; article_code: string; lot_code: string; colli: number; um: string; da: string }>();
  for (const l of doc?.lines || []) {
    if (!l) continue;
    if (chiave(l.udc_id)) continue;              // già su un bancale
    const colli = numero(l.qty);
    if (colli <= 0) continue;
    const k = chiave(l.item_key) || `${chiave(l.article_code)}#${chiave(l.lot_code)}`;
    const gia = out.get(k);
    if (gia) { gia.colli += colli; continue; }
    out.set(k, {
      item_key: k,
      article_code: testo(l.article_code),
      lot_code: testo(l.lot_code),
      colli,
      um: testo(l.uom),
      da: chiave(l.location_code),
    });
  }
  return [...out.values()];
}

/** Le unità già prelevate intere: passano in zona imballaggio come stanno.

    Servono a dirlo a chi chiude — «questi tre pallet sono già pronti, non
    li rifare» — e a contarli nel riscontro finale. */
export function unitaGiaPronte(
  tappe: readonly { status?: string; udc_id?: string | null }[] | null | undefined,
): string[] {
  const viste = new Set<string>();
  for (const t of tappe || []) {
    if (!t || t.status !== 'done') continue;
    const u = chiave(t.udc_id);
    if (u) viste.add(u);
  }
  return [...viste];
}

/* ═══ 2.38 · A CHE PUNTO È LA SPEDIZIONE, LETTO DAL DOCUMENTO ════════════

   Dalla 2.38 un'attività di spedizione non si chiude alla fine del percorso:
   ne fa tre pezzi — si prepara, si imballa, si carica — e fra un pezzo e
   l'altro torna in coda perché a farli sono spesso persone diverse.

   IL PUNTO IN CUI SI TROVA NON SI SCRIVE: SI LEGGE DAL DOCUMENTO. Un campo
   sul compito direbbe quello che qualcuno ha timbrato l'ultima volta; le
   righe del DDT dicono dov'è la merce ADESSO, e sono la stessa fonte che
   l'evasione andrà a leggere. Se qualcuno sposta un pallet dalla mappa, o
   corregge il documento, il marchio si corregge da sé — e un marchio che
   mente su un DDT è il difetto della 2.33 rifatto su un'altra schermata.

   TRE PUNTI, E NON DI PIÙ:
   · `da_preparare`  — c'è merce che non è ancora stata radunata.
   · `da_imballare`  — tutto radunato, ma della merce è ancora sciolta: va
                       composta in un'unità, etichettata e portata in
                       spedizione.
   · `carico_pronto` — ogni riga sta su un bancale. Non manca niente, e
                       questo vale anche per un DDT nato così, di sole unità
                       già composte: quello non ha mai avuto bisogno di
                       essere preparato, ed è il caso che ha fatto nascere
                       tutto questo giro. */

export type StatoSpedizione = 'da_preparare' | 'da_imballare' | 'carico_pronto' | 'partita';

export const ETICHETTE_SPEDIZIONE: Record<StatoSpedizione, string> = {
  da_preparare: 'Da preparare',
  da_imballare: 'Da imballare',
  carico_pronto: 'Carico pronto',
  /* 2.38.2 — il documento è uscito, o è stato annullato: non c'è più lavoro,
     e l'attività che lo nomina va chiusa. */
  partita: 'Merce partita — da chiudere',
};

/** A che punto è la spedizione di questo documento.

    `inZonaImballo` risponde «questo vano è un banco d'imballo?». Sta fuori
    perché è una domanda sulla CONFIGURAZIONE del magazzino, e questo modulo
    del magazzino non sa niente — è la stessa separazione per cui la
    serpentina sta in `pickRoute`.

    UN DOCUMENTO SENZA RIGHE È `da_preparare`, non pronto. `[].every()` è
    vero, e lasciarlo passare vorrebbe dire un DDT vuoto che si annuncia
    pronto a salire sul camion. */
export function statoSpedizione(
  doc: Partial<DocumentoUscita> | null | undefined,
  inZonaImballo: (vano: string) => boolean,
): StatoSpedizione {
  /* ═══ 2.38.2 · UN DOCUMENTO CHE NON È PIÙ PENDENTE NON HA PIÙ LAVORO ═══

     È il quarto punto, e mancava. Un DDT evaso è merce su un camion; uno
     annullato è lavoro che nessuno farà. In tutti e due i casi l'attività
     che lo nomina non ha più niente da fare, e il primo a saperlo è il
     DOCUMENTO — che è la fonte, come per gli altri tre punti.

     PERCHÉ NON BASTAVA CHIUDERE ALL'EVASIONE. `chiudiCompitiDelDocumento`
     chiude nell'ISTANTE in cui la merce esce, ed è il gesto giusto; ma
     dipende da una scrittura che può non riuscire — un servizio che non
     risponde per un attimo — e fino alla 2.38.1 quel fallimento finiva in
     `console.error` e in nessun altro posto. Il risultato lo ha visto Andrea
     il 09/09: merce caricata, DDT evaso, e l'attività ferma «in corso» a
     nome suo, che nessuna schermata poteva più chiudere.

     Adesso lo stato lo dice il documento anche DOPO, quindi una chiusura
     mancata si vede in coda invece di nascondersi, e si ripara premendo
     Avvia. Le due cose non si escludono: una chiude al momento giusto,
     l'altra fa in modo che non resti niente in mezzo se la prima non
     riesce. */
  const stato = testo(doc?.status).toLowerCase();
  if (stato === 'evaded' || stato === 'cancelled') return 'partita';
  const righe = (doc?.lines || []).filter((l) => l && numero(l.qty) > 0);
  if (!righe.length) return 'da_preparare';
  const sciolte = righe.filter((l) => !chiave(l.udc_id));
  if (!sciolte.length) return 'carico_pronto';
  return sciolte.every((l) => inZonaImballo(chiave(l.location_code)))
    ? 'da_imballare'
    : 'da_preparare';
}

/** I gesti che hanno senso su questo documento, nell'ordine in cui si
    propongono. Il primo è quello che il magazzino farebbe adesso.

    IL CARICO C'È SEMPRE, ed è la risposta alla domanda da cui è partito
    tutto: non tutti i DDT hanno bisogno di essere preparati. Chi ha il
    camion in banchina e i pallet già pronti carica, e il sistema non lo
    manda a fare un giro che non serve. Se poi quel DDT non è pronto davvero,
    lo dice `avvisoCarico` — un avviso, non un divieto: §2.35.2, il sistema
    aiuta e non blocca. */
export type ModoSpedizione = 'preparazione' | 'imballaggio' | 'carico';

export function modiPossibili(stato: StatoSpedizione): ModoSpedizione[] {
  /* 2.38.2 — SU MERCE PARTITA NON SI FA NIENTE, e l'elenco vuoto è la
     risposta giusta: non c'è un gesto di magazzino da proporre, c'è
     un'attività da chiudere. Chi chiama distingue i due casi guardando se
     l'elenco è vuoto, invece di dover conoscere gli stati. */
  if (stato === 'partita') return [];
  if (stato === 'da_imballare') return ['imballaggio', 'carico'];
  if (stato === 'carico_pronto') return ['carico', 'preparazione'];
  return ['preparazione', 'carico'];
}

/** Quel che va detto a chi sceglie «carico» su questo documento, o `null` se
    non c'è niente da dire. Non ferma niente: si conferma e si prosegue. */
export function avvisoCarico(
  doc: Partial<DocumentoUscita> | null | undefined,
  stato: StatoSpedizione,
): string | null {
  if (stato === 'carico_pronto') return null;
  const righe = (doc?.lines || []).filter((l) => l && numero(l.qty) > 0);
  const conUdc = righe.filter((l) => chiave(l.udc_id)).length;
  if (!conUdc) {
    return 'Nessuna riga di questo DDT sta su un bancale: non c’è niente da scansionare in baia, '
      + 'e la merce si dichiara caricata a mano. Di solito prima si prepara.';
  }
  return `${righe.length - conUdc} righe di questo DDT non stanno su un bancale: `
    + 'si caricano a mano e non si scansionano. Il DDT si evade lo stesso.';
}

/** Quel che va detto a chi sceglie «preparazione» su un DDT già pronto. */
export function avvisoPreparazione(stato: StatoSpedizione): string | null {
  return stato === 'carico_pronto'
    ? 'Ogni riga di questo DDT sta già su un bancale: il percorso rifarà le tappe dei bancali, '
      + 'chiedendo di nuovo dove riposarli. Non c’è merce sciolta da radunare.'
    : null;
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
