/* IL CONTO DI PRODUZIONE — 1.14.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 1.13 un prelievo per ordine di produzione fa sparire la merce dal
   magazzino: esce, e da lì in poi non se ne sa più niente. Quello che
   davvero è finito nel prodotto e quello che è tornato indietro sono la
   stessa riga, e nessuno dei due numeri esiste.

   La 1.14 mette in mezzo un'ubicazione WIP. Il prelievo non è un'uscita, è un
   TRASFERIMENTO verso il conto di quell'ordine; il reso è il viaggio
   contrario; e ciò che è entrato e non è tornato — a ordine chiuso — è il
   CONSUMO REALE di produzione. È l'unico numero che oggi non si può avere.

   È L'UNICA FUNZIONE CHE CAMBIA IL SIGNIFICATO DI UN MOVIMENTO ESISTENTE:
   dove questo modulo decide, `PICK` non vuol più dire quel che voleva dire
   prima. Gli interruttori sono stati tolti con la 2.0 e non c'è più niente da
   abbassare — la funzione è attiva, e chi cambia questo file cambia il
   significato dei movimenti che il magazzino sta scrivendo adesso.

   IL CONSUMO SI DICHIARA CHIUSO, NON SI DEDUCE OGNI SERA. Finché l'ordine è
   aperto, il residuo è merce ancora in lavorazione: chiamarlo consumo
   vorrebbe dire contare come consumato un sacco che alle sette di sera sta
   ancora sul bancone.

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato da fermo in
   `test/wip.test.js`. */

/** Un movimento sul conto di un ordine.

    `in` è la merce che entra in lavorazione, `out` quella che TORNA a
    magazzino, `consumo` quella che alla chiusura si dichiara finita nel
    prodotto. Gli ultimi due escono tutti e due dal conto, e non sono la
    stessa cosa: alla prima prova al banco la chiusura contava come «tornato
    1» merce che a magazzino non era tornata affatto. Un saldo giusto con la
    parola sbagliata è comunque una bugia, e questa la leggerà chi cerca il
    consumo di un ordine fra sei mesi. */
export interface MovimentoWip {
  odp_num: string;
  item_key: string;
  article_code?: string;
  lot_code?: string;
  /** `chiuso` non muove niente: è la CHIUSURA dell'ordine, scritta come un
      movimento perché è un fatto con una data e una firma, non uno stato che
      qualcuno ha ricalcolato. */
  verso: 'in' | 'out' | 'consumo' | 'chiuso' | string;
  /** Colli. Resta il conto di sempre. */
  qty?: number;
  /** Le UM, quando la riga le ha: è il numero che la produzione userà. */
  qty_uom?: number | null;
  uom?: string | null;
  /** LE MISURE DEI COLLI CHE SI SONO MOSSI.

      L'area WIP è UNA ubicazione, e nel vano ci stanno insieme le righe di
      più ordini: `inventory` ne tiene una sola per articolo e lotto. Senza
      queste misure, «rendi tre colli» su una riga che ne ha dodici di sei
      misure diverse non ha una risposta — e a scaricarla a numero si scrive
      un saldo sopra un elenco rimasto indietro. Sono le stesse misure che
      lo storno usa per ritrovare i colli usciti: un elenco messo da parte si
      ritrova per MISURA, mai per indice. */
  packs?: number[] | null;
  /* 2.12 — IL GIRO CHE HA PORTATO GIÙ QUESTA MERCE.

     Quando un percorso serve più ordini insieme, il conto lo intesta UNO —
     il capofila, che è `odp_num` — e gli altri stanno scritti qui. Non è un
     secondo conto e non entra in nessun saldo: `conto()` non lo guarda. È la
     risposta alla domanda che si fa la produzione fra sei mesi, «per chi era
     sceso quel sacco», e la si scrive nel momento in cui la si sa.

     LA RIPARTIZIONE NON SI FA QUI E NON SI FA ADESSO. Un collo che scende
     per cinque ordini si divide quando si dichiara il consumo, cioè alla
     chiusura, quando i numeri esistono: prima di allora ogni quota sarebbe
     una previsione scritta come un fatto. Vedi §6. */
  giro_odps?: string[] | null;
  /** QUANTO NE AVEVA CHIESTO CIASCUN ORDINE, su questa riga. È un fatto del
      momento in cui la merce è scesa — sta scritto nei file di produzione —
      e NON è una quota di consumo: quella si sa alla chiusura, e si calcola
      da qui in proporzione. Vedi `quote` in `modules/giroOdp.ts`. */
  giro_richieste?: { odp_num: string; qty: number }[] | null;
  /** L'identificativo del percorso che ha scritto il movimento: lega fra
      loro le righe di un giro, anche quelle di ordini diversi. */
  giro_id?: string | null;
  ts?: number;
}

/** Il conto di una riga: quanto è entrato, quanto è tornato, quanto resta. */
export interface ContoRiga {
  item_key: string;
  article_code: string;
  lot_code: string;
  entrato: number;
  tornato: number;
  /** Quello che alla chiusura è stato dichiarato finito nel prodotto. */
  consumato: number;
  /** Entrato meno tornato meno consumato: quello che è ancora fuori. */
  residuo: number;
  entrato_uom: number | null;
  tornato_uom: number | null;
  consumato_uom: number | null;
  residuo_uom: number | null;
  uom: string | null;
}

export interface ContoOrdine {
  odp_num: string;
  righe: ContoRiga[];
  entrato: number;
  tornato: number;
  consumato: number;
  residuo: number;
  /** Vero quando qualcosa è tornato indietro più di quanto sia entrato: è un
      dato che non può stare in piedi, e va mostrato invece che nascosto. */
  incoerente: boolean;
  /** 2.1 — L'ORDINE È CHIUSO E ARCHIVIATO, e non è una deduzione dal
      residuo: è un movimento scritto. Vedi `archiviato`. */
  chiuso: boolean;
  /** Quando è stato chiuso. `null` se è ancora aperto. */
  chiuso_il: number | null;
}

function arrotonda(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** IL NUMERO D'ORDINE SI CONFRONTA A MAIUSCOLE, SEMPRE.

    La maschera del conto legge l'ordine in maiuscolo — è un campo che si
    scansiona, come tutti gli altri — mentre il prelievo di produzione
    scriveva nei movimenti quello che era stato digitato. Per un confronto
    esatto «prova6» a registro e «PROVA6» in maschera sono due ordini
    diversi: il 20/08 la maschera elencava tre conti aperti e nessuno dei
    tre si apriva — «Nessun movimento sul conto di PROVA6» su un ordine che
    di movimenti ne aveva. Un numero d'ordine non ha un caso, e quello che
    si scrive è quello che si legge. */
function chiave(odp: unknown): string {
  return String(odp ?? '').trim().toUpperCase();
}

/** Quanto contiene un collo di quella riga, per chi lo sa: la confezione
    del lotto, che il conto da solo non conosce. Chi non ne ha una torna
    `null`, e il conto resta a soli colli come prima. */
export type PerCollo = (riga: { item_key: string; article_code: string; lot_code: string }) => number | null;

/** Il conto di un ordine, riga per riga. Le righe escono in ordine di
    chiave, così due letture dello stesso ordine si confrontano a occhio.

    2.2 — LE UM CHE MANCANO SI DERIVANO DALLA CONFEZIONE, ALLA LETTURA.

    Un movimento porta le UM solo se al momento in cui è stato scritto il
    lotto dichiarava la sua confezione. Dichiararla dopo — ed è il caso di
    tutte le materie prime, che a sistema hanno l'unità e non la quantità per
    collo — lasciava un conto storto in un modo che a schermo si legge come
    un errore di magazzino: due colli entrati senza misura, uno tornato con
    dentro 5 kg e venti dichiarati consumati, e il conto diceva «tornato più
    di quanto sia uscito, −25 KG». Non era falso: era mezzo scritto.

    Le misure che mancano si derivano qui, dai colli e dalla confezione di
    ADESSO, come `colliDiRiga` fa con le righe di giacenza. Non si riscrive
    nessun movimento: il conto è storia, e la storia non si corregge — si
    legge con quello che nel frattempo si è saputo. Una riga che porta già le
    sue UM non viene toccata, mai. */
export function conto(
  movimenti: readonly MovimentoWip[] | null | undefined,
  odpNum: string | null | undefined,
  perCollo: PerCollo | null = null,
): ContoOrdine {
  const odp = chiave(odpNum);
  const vuoto: ContoOrdine = { odp_num: odp, righe: [], entrato: 0, tornato: 0, consumato: 0, residuo: 0, incoerente: false, chiuso: false, chiuso_il: null };
  if (!movimenti?.length || !odp) return vuoto;

  let chiuso_il: number | null = null;
  const per = new Map<string, ContoRiga>();
  for (const m of movimenti) {
    if (!m || chiave(m.odp_num) !== odp) continue;
    /* LA CHIUSURA NON È UNA RIGA DEL CONTO. Non porta merce e non ha una
       chiave: sommarla come «entrato» — che è quel che il ramo in fondo
       farebbe, perché lì ci cade tutto quel che non è `out` né `consumo` —
       gonfierebbe l'ordine di un collo che non esiste. */
    if (m.verso === 'chiuso') {
      const t = Number(m.ts) || 0;
      if (chiuso_il === null || t > chiuso_il) chiuso_il = t;
      continue;
    }
    if (!m.item_key) continue;
    let r = per.get(m.item_key);
    if (!r) {
      r = {
        item_key: m.item_key,
        article_code: m.article_code || m.item_key.split('#')[0] || '',
        lot_code: m.lot_code || m.item_key.split('#')[1] || '',
        entrato: 0, tornato: 0, consumato: 0, residuo: 0,
        entrato_uom: null, tornato_uom: null, consumato_uom: null, residuo_uom: null,
        uom: m.uom ?? null,
      };
      per.set(m.item_key, r);
    }
    if (!r.uom && m.uom) r.uom = m.uom;
    const colli = Number(m.qty) || 0;
    let um = typeof m.qty_uom === 'number' ? m.qty_uom : null;
    if (um === null && colli > 0 && perCollo) {
      const per = perCollo({ item_key: r.item_key, article_code: r.article_code, lot_code: r.lot_code });
      if (typeof per === 'number' && per > 0) um = arrotonda(colli * per);
    }
    if (m.verso === 'consumo') {
      r.consumato += colli;
      if (um !== null) r.consumato_uom = arrotonda((r.consumato_uom ?? 0) + um);
    } else if (m.verso === 'out') {
      r.tornato += colli;
      if (um !== null) r.tornato_uom = arrotonda((r.tornato_uom ?? 0) + um);
    } else {
      r.entrato += colli;
      if (um !== null) r.entrato_uom = arrotonda((r.entrato_uom ?? 0) + um);
    }
  }

  let entrato = 0, tornato = 0, consumato = 0, incoerente = false;
  const righe = [...per.values()];
  for (const r of righe) {
    r.residuo = arrotonda(r.entrato - r.tornato - r.consumato);
    r.residuo_uom = r.entrato_uom === null && r.tornato_uom === null && r.consumato_uom === null
      ? null
      : arrotonda((r.entrato_uom ?? 0) - (r.tornato_uom ?? 0) - (r.consumato_uom ?? 0));
    if (r.residuo < 0 || (r.residuo_uom !== null && r.residuo_uom < 0)) incoerente = true;
    entrato += r.entrato;
    tornato += r.tornato;
    consumato += r.consumato;
  }
  righe.sort((a, b) => a.item_key.localeCompare(b.item_key));

  return {
    odp_num: odp, righe,
    entrato: arrotonda(entrato), tornato: arrotonda(tornato),
    consumato: arrotonda(consumato),
    residuo: arrotonda(entrato - tornato - consumato),
    incoerente,
    chiuso: chiuso_il !== null,
    chiuso_il,
  };
}

/** L'ORDINE È CHIUSO E ARCHIVIATO: NON SI TOCCA PIÙ.

    Un ordine chiuso spariva e basta da `ordiniWipAperti`, che filtra sul
    residuo diverso da zero — e finché la prova era quella, ricaricare lo
    STESSO ordine lo riportava in vita: i prelievi nuovi scrivevano altri
    movimenti sotto lo stesso numero, e `conto` li sommava a quelli di un
    ciclo già chiuso. Due lavorazioni diverse in un conto solo, e il consumo
    dichiarato a novembre mescolato a quello di gennaio.

    Adesso la chiusura è un MOVIMENTO, con la sua data e la sua firma, e da
    lì in poi quell'ordine è storia: non entra merce, non ne esce, e il
    rendiconto resta leggibile e stampabile per sempre. Un ordine che
    davvero ricomincia è un ordine nuovo, e un numero nuovo ce l'ha. */
export function archiviato(
  movimenti: readonly MovimentoWip[] | null | undefined,
  odpNum: string | null | undefined,
): boolean {
  const odp = chiave(odpNum);
  if (!movimenti?.length || !odp) return false;
  return movimenti.some((m) => m && chiave(m.odp_num) === odp && m.verso === 'chiuso');
}

/** LE RIGHE CHE STANNO NEL VANO WIP E CHE NESSUN ORDINE RIVENDICA.

    Il vano WIP è un'ubicazione sola, e a tenere distinti i conti è l'ordine
    scritto su ogni movimento — non il posto. Una riga che sta lì dentro e
    che nessun movimento nomina non appartiene a nessun conto: la chiusura
    lavora per ordine e non la vede, il reso lavora per ordine e non la vede.
    Resta ferma, e nessuna maschera di produzione la consuma.

    Il 20/08 ce n'erano sei, ed è stato un guardiano a trovarle leggendo il
    database — non l'applicativo, che non aveva nessun posto in cui dirlo.
    Questa funzione è quel posto: chi apre la produzione le vede elencate, e
    da lì sa che vanno mosse da Movimenta o caricate su un ordine.

    Non è un difetto da correggere una volta: è una condizione che il vano
    può assumere di nuovo ogni volta che qualcuno ci posiziona merce a mano.

    `righeVano` sono le giacenze GIÀ filtrate sull'area WIP: questo modulo
    non sa cosa sia un'ubicazione, e chi chiama sì. */
export function righeSenzaOrdine<T extends { item_key?: string | null }>(
  movimenti: readonly MovimentoWip[] | null | undefined,
  righeVano: readonly T[] | null | undefined,
): T[] {
  if (!righeVano?.length) return [];
  const rivendicate = new Set<string>();
  for (const m of movimenti ?? []) {
    if (!m) continue;
    const k = String(m.item_key ?? '').trim();
    if (k) rivendicate.add(k);
  }
  return righeVano.filter((r) => {
    const k = String(r?.item_key ?? '').trim();
    return k !== '' && !rivendicate.has(k);
  });
}

/** GLI ORDINI ARCHIVIATI, DAL PIÙ RECENTE — l'archivio da sfogliare.

    `archiviato` risponde su UN ordine di cui si sa già il numero, e finché
    c'era solo quello l'archivio esisteva ma non si apriva: un ordine chiuso
    spariva dai conti aperti, e per rileggerlo bisognava ricordarsi come si
    chiamava. Il consuntivo di una lavorazione si guarda mesi dopo, quando il
    numero non se lo ricorda più nessuno.

    Torna il numero e la data di chiusura, che sono le due cose con cui si
    sceglie una riga da un elenco. La data è quella del movimento `chiuso`;
    se un ordine ne portasse più d'uno — non dovrebbe, `archiviaOrdineWip`
    lo rifiuta — vale il primo, che è la chiusura vera. */
export function ordiniArchiviati(
  movimenti: readonly MovimentoWip[] | null | undefined,
): { odp_num: string; chiuso_il: number | null }[] {
  if (!movimenti?.length) return [];
  const visti = new Map<string, number | null>();
  for (const m of movimenti) {
    if (!m || m.verso !== 'chiuso') continue;
    const odp = chiave(m.odp_num);
    if (!odp || visti.has(odp)) continue;
    visti.set(odp, typeof m.ts === 'number' ? m.ts : null);
  }
  return [...visti.entries()]
    .map(([odp_num, chiuso_il]) => ({ odp_num, chiuso_il }))
    .sort((a, b) => (b.chiuso_il ?? 0) - (a.chiuso_il ?? 0));
}

/** 2.12 — QUANTO AVEVANO CHIESTO GLI ORDINI DEL GIRO, su una riga di questo
    conto. Somma le richieste scritte sulle entrate: una riga può essere
    scesa in più viaggi, e ogni viaggio porta le sue.

    Vuoto quando la riga non è di un giro. Chi la usa per ripartire un
    consumo deve sapere che questo è quel che era stato CHIESTO, non quel
    che è stato preso: la proporzione fra i due la fa `quote`. */
export function richiesteDiRiga(
  movimenti: readonly MovimentoWip[] | null | undefined,
  odpNum: string | null | undefined,
  itemKey: string | null | undefined,
): { odp_num: string; qty: number }[] {
  const odp = chiave(odpNum);
  const k = String(itemKey ?? '').trim();
  if (!odp || !k) return [];
  const somma = new Map<string, number>();
  for (const m of movimenti ?? []) {
    if (!m || m.verso !== 'in') continue;
    if (chiave(m.odp_num) !== odp) continue;
    if (String(m.item_key ?? '').trim() !== k) continue;
    for (const r of m.giro_richieste ?? []) {
      const a = chiave(r?.odp_num);
      if (!a) continue;
      somma.set(a, arrotonda((somma.get(a) ?? 0) + (Number(r.qty) || 0)));
    }
  }
  return [...somma.entries()].map(([odp_num, qty]) => ({ odp_num, qty }));
}

/** 2.12 — QUANTO HA CONSUMATO CIASCUN ORDINE DEL GIRO, articolo per articolo.

    Legge le quote scritte sulle dichiarazioni di consumo — non le richieste:
    quelle dicono quanto era stato CHIESTO, e fra il chiesto e il consumato
    ci sono il reso e i colli interi. È il numero che va sul rendiconto, ed
    è l'unica risposta alla domanda «quanto ne è finito nel prodotto di
    quest'ordine» quando la merce è scesa sotto un altro numero.

    Vuoto finché nessuna riga è stata dichiarata: prima della chiusura il
    consumo di un ordine non esiste, e nemmeno la sua quota. */
export function consumoPerOrdine(
  movimenti: readonly MovimentoWip[] | null | undefined,
  odpNum: string | null | undefined,
): { odp_num: string; item_key: string; article_code: string; lot_code: string; qty: number; uom: string | null }[] {
  const odp = chiave(odpNum);
  if (!odp) return [];
  const out = new Map<string, { odp_num: string; item_key: string; article_code: string; lot_code: string; qty: number; uom: string | null }>();
  for (const m of movimenti ?? []) {
    if (!m || m.verso !== 'consumo') continue;
    if (chiave(m.odp_num) !== odp) continue;
    for (const q of m.giro_richieste ?? []) {
      const a = chiave(q?.odp_num);
      if (!a) continue;
      const k = `${a}|${String(m.item_key ?? '')}`;
      const gia = out.get(k);
      if (gia) { gia.qty = arrotonda(gia.qty + (Number(q.qty) || 0)) ?? gia.qty; continue; }
      out.set(k, {
        odp_num: a,
        item_key: String(m.item_key ?? ''),
        article_code: String(m.article_code ?? ''),
        lot_code: String(m.lot_code ?? ''),
        qty: arrotonda(Number(q.qty) || 0) ?? 0,
        uom: m.uom ?? null,
      });
    }
  }
  return [...out.values()];
}

/** 2.12 — DOVE STA IL CONTO DI UN ORDINE CHE NON LO TIENE LUI.

    Un ordine prelevato dentro un giro non ha movimenti suoi: la merce è
    scesa sotto il capofila, e il suo numero sta nel `giro_odps` di quelle
    righe. Cercarlo con `conto()` e trovare zero sarebbe la risposta
    sbagliata alla domanda giusta — «di quest'ordine non risulta niente»
    quando invece la merce è in reparto da stamattina.

    Torna il capofila e l'identificativo del giro, oppure `null` quando
    l'ordine il conto ce l'ha per conto suo (o non ne ha nessuno). Un ordine
    che è capofila di se stesso NON esce di qui: per lui `conto()` risponde,
    ed è quella la strada. */
export function contoTenutoDa(
  movimenti: readonly MovimentoWip[] | null | undefined,
  odpNum: string | null | undefined,
): { capofila: string; giro_id: string | null } | null {
  const odp = chiave(odpNum);
  if (!odp) return null;
  for (const m of movimenti ?? []) {
    if (!m || !Array.isArray(m.giro_odps)) continue;
    const capofila = chiave(m.odp_num);
    if (capofila === odp) return null;
    if (!m.giro_odps.some((x) => chiave(x) === odp)) continue;
    return { capofila, giro_id: m.giro_id ? String(m.giro_id) : null };
  }
  return null;
}

/** GLI ALTRI ORDINI SERVITI DAL CONTO DI QUESTO, senza doppioni e senza se
    stesso. È la faccia opposta di `contoTenutoDa`: la legge il rendiconto del
    capofila, che deve dichiarare per chi ha prelevato. */
export function ordiniServiti(
  movimenti: readonly MovimentoWip[] | null | undefined,
  odpNum: string | null | undefined,
): string[] {
  const odp = chiave(odpNum);
  if (!odp) return [];
  const out = new Set<string>();
  for (const m of movimenti ?? []) {
    if (!m || chiave(m.odp_num) !== odp || !Array.isArray(m.giro_odps)) continue;
    for (const x of m.giro_odps) {
      const k = chiave(x);
      if (k && k !== odp) out.add(k);
    }
  }
  return [...out];
}

/** Il consumo reale di un ordine: quello che è entrato e non è tornato.

    `null` finché l'ordine è APERTO, e non è una cortesia: il residuo di un
    ordine in corso è merce ancora sul bancone, e chiamarlo consumo
    scriverebbe un numero che alle sette di sera è sempre sbagliato. Chi lo
    vuole vedere prima guarda il residuo, che si chiama così apposta. */
export function consumo(
  contoOrdine: ContoOrdine | null | undefined,
  chiuso: boolean,
): ContoRiga[] | null {
  if (!contoOrdine || !chiuso) return null;
  return contoOrdine.righe.filter(r => r.residuo !== 0 || (r.residuo_uom ?? 0) !== 0);
}

/** LE MISURE DEI COLLI CHE UN ORDINE HA ANCORA FUORI: quelle entrate, meno
    quelle già tornate o dichiarate consumate.

    Sono l'elenco con cui si ritrovano, dentro la riga del vano WIP, i colli
    di QUEL LOTTO E DI QUELL'ORDINE — il vano è uno solo e le righe di due
    ordini ci convivono. Si sottrae per misura e non per indice, come ovunque
    nell'applicativo: fra il prelievo e la chiusura passano ore, e un altro
    terminale può aver mosso la riga.

    Vuoto quando l'ordine non ha mosso colli dichiarati: allora non c'è
    niente da ritrovare, e chi chiama torna a lavorare a numero come nella
    1.7. */
export function colliFuori(
  movimenti: readonly MovimentoWip[] | null | undefined,
  odpNum: string | null | undefined,
  itemKey: string | null | undefined,
): number[] {
  const odp = chiave(odpNum);
  const key = String(itemKey ?? '').trim();
  if (!movimenti?.length || !odp || !key) return [];

  const fuori: number[] = [];
  const tolti: number[] = [];
  for (const m of movimenti) {
    if (!m || chiave(m.odp_num) !== odp || m.item_key !== key) continue;
    const misure = Array.isArray(m.packs) ? m.packs.filter((n) => Number.isFinite(n) && n > 0) : [];
    if (!misure.length) continue;
    (m.verso === 'out' || m.verso === 'consumo' ? tolti : fuori).push(...misure);
  }

  /* Si toglie una misura per volta, e la prima che combacia: due colli da 25
     sono indistinguibili, e cercare «quello giusto» vorrebbe dire dare un
     nome a una differenza che non esiste.

     2.1 — E UN COLLO PUÒ TORNARE APERTO. Da due colli da 20 rientrano 10:
     il collo non è uscito dal conto, si è svuotato a metà, e quel che
     l'ordine ha ancora fuori è `[20, 10]` — non `[20, 20]`.

     Finché la sottrazione cercava la sola misura ESATTA, un 10 fra due 20
     non combaciava con niente e non toglieva niente: il conto restava
     convinto di avere fuori due colli pieni mentre nel vano ce n'erano uno
     pieno e uno a metà. Alla chiusura chiedeva al vano il secondo collo da
     20, e il vano rispondeva «il collo da 20 non è più su questa riga».
     Visto in produzione il 20/08 sull'ordine PROVA, `6000366B#123456`.

     Il collo che si scava è IL PIÙ PICCOLO CHE BASTA, la stessa regola del
     servizio e di `misureDelReso`: aprirne uno grande quando ne basta uno
     piccolo lascia in giro due mezzi colli invece di uno. */
  for (const t of tolti) {
    const esatto = fuori.findIndex((n) => Math.abs(n - t) < 1e-6);
    if (esatto > -1) { fuori.splice(esatto, 1); continue; }

    let scelto = -1;
    for (let i = 0; i < fuori.length; i++) {
      if (fuori[i]! <= t + 1e-9) continue;
      if (scelto === -1 || fuori[i]! < fuori[scelto]!) scelto = i;
    }
    /* Nessun collo abbastanza grande: il dato non sta in piedi — è tornato
       più di quanto sia uscito. Non si inventa un collo negativo, e
       `incoerente` sul conto lo dice già a chi guarda. */
    if (scelto === -1) continue;
    fuori[scelto] = arrotonda(fuori[scelto]! - t);
  }
  return fuori;
}

/** Che cosa deve tornare a magazzino perché il conto si chiuda a zero: è
    l'elenco che si mette in mano a chi va a recuperare il rimanente prima di
    dichiarare chiuso un ordine. Le righe già a zero non ci sono. */
export function daRendere(contoOrdine: ContoOrdine | null | undefined): ContoRiga[] {
  if (!contoOrdine?.righe?.length) return [];
  return contoOrdine.righe.filter(r => r.residuo > 0 || (r.residuo_uom ?? 0) > 0);
}

/** UNA RIGA DEL RENDICONTO DI CONSUMO. */
export interface RigaRendiconto {
  item_key: string;
  article_code: string;
  lot_code: string;
  /** Quello che è sceso in lavorazione. */
  consegnato: number;
  consegnato_uom: number | null;
  /** Quello che è risalito a magazzino. */
  reso: number;
  reso_uom: number | null;
  /** Consegnato meno reso: è il delta, ed è il numero del rendiconto. */
  delta: number;
  delta_uom: number | null;
  /** Quanta parte del delta è già stata DICHIARATA consumata alla chiusura
      di una riga. Il resto è ancora sul bancone. */
  dichiarato: number;
  dichiarato_uom: number | null;
  /** Il delta meno quello che è già dichiarato: merce ancora fuori. */
  aperto: number;
  aperto_uom: number | null;
  uom: string | null;
}

export interface Rendiconto {
  odp_num: string;
  righe: RigaRendiconto[];
  consegnato: number;
  reso: number;
  delta: number;
  /** Vero quando ogni riga ha il delta già dichiarato consumato: allora il
      foglio è un consuntivo. Falso: è una fotografia di metà lavorazione, e
      il documento deve dirlo invece di far credere il contrario. */
  chiuso: boolean;
}

/** IL RENDICONTO DI CONSUMO: QUANTO È SCESO, QUANTO È RISALITO, LA
    DIFFERENZA.

    È il foglio che si mette in mano a chi chiede «quanto ne è andato in
    quest'ordine», e il numero che risponde è un delta: consegnato meno
    reso. Non è un terzo conto — esce da `conto()` e da nient'altro — ma è
    il taglio che serve su carta, dove le tre colonne dell'applicativo
    (entrato, reso, consumato) sono una in più di quante ne servano.

    IL DELTA NON È SEMPRE CONSUMO, E IL FOGLIO DEVE POTERLO DIRE. Finché una
    riga non è stata chiusa, la sua parte di delta è merce ancora sul
    bancone: `dichiarato` è quel che la chiusura ha già scritto, `aperto` il
    resto. `chiuso` è vero solo quando non resta niente di aperto — cioè
    quando il foglio è un consuntivo e non una fotografia. È la stessa
    regola di `consumo()`, che davanti a un ordine aperto risponde `null`
    invece di inventare un numero che alle sette di sera è sempre sbagliato.

    Le righe che non hanno mosso niente non ci sono: un rendiconto elenca
    quello che è successo. */
export function rendiconto(
  contoOrdine: ContoOrdine | null | undefined,
): Rendiconto {
  const odp = contoOrdine?.odp_num ?? '';
  const vuoto: Rendiconto = { odp_num: odp, righe: [], consegnato: 0, reso: 0, delta: 0, chiuso: false };
  if (!contoOrdine?.righe?.length) return vuoto;

  const somma = (a: number | null, b: number | null): number | null =>
    a === null && b === null ? null : arrotonda((a ?? 0) - (b ?? 0));

  const righe: RigaRendiconto[] = contoOrdine.righe
    .filter((r) => r.entrato !== 0 || r.tornato !== 0 || r.consumato !== 0)
    .map((r) => ({
      item_key: r.item_key,
      article_code: r.article_code,
      lot_code: r.lot_code,
      consegnato: r.entrato,
      consegnato_uom: r.entrato_uom,
      reso: r.tornato,
      reso_uom: r.tornato_uom,
      delta: arrotonda(r.entrato - r.tornato),
      delta_uom: somma(r.entrato_uom, r.tornato_uom),
      dichiarato: r.consumato,
      dichiarato_uom: r.consumato_uom,
      aperto: r.residuo,
      aperto_uom: r.residuo_uom,
      uom: r.uom,
    }));

  const tot = (f: (r: RigaRendiconto) => number) =>
    arrotonda(righe.reduce((n, r) => n + f(r), 0));

  return {
    odp_num: odp,
    righe,
    consegnato: tot((r) => r.consegnato),
    reso: tot((r) => r.reso),
    delta: tot((r) => r.delta),
    /* 2.1 — CHIUSO È UN FATTO SCRITTO, non «tutte le righe tornano a zero»:
       un ordine si chiude anche lasciando qualcosa dichiarato a mano, e un
       ordine a zero per caso non è chiuso. */
    chiuso: contoOrdine.chiuso,
  };
}
/** QUALI COLLI TORNANO QUANDO UNO RIENTRA APERTO.

    Un sacco sceso in lavorazione risale a meta': e' il caso comune, e finche'
    il reso chiedeva solo «quanti colli» non c'era modo di dirlo. Qui si
    decide, dalle misure che l'ordine ha ancora fuori, QUALI colli escono
    interi e QUALE si apre.

    IL COLLO CHE SI APRE E' IL PIU' PICCOLO CHE BASTA, la stessa regola che il
    servizio applica quando la misura esatta non c'e': aprire un sacco da 25
    per prenderne 7,5 quando ce n'e' uno da 10 lascia in giro due mezzi colli
    invece di uno. E gli interi si prendono dai piu' piccoli, cosi' quello che
    resta da aprire e' il piu' grande fra quelli che bastano.

    Torna `{ intere, apribile }` con le misure da chiedere, oppure
    `{ errore }` col motivo: non lancia, perche' qui non c'e' niente di
    eccezionale — sono le risposte a una domanda, e una risposta che non sta
    in piedi si dice a chi l'ha data. */
export interface MisureDelReso {
  intere: number[];
  apribile: number;
}

export function misureDelReso(
  disponibili: readonly number[] | null | undefined,
  interi: number,
  parte: number,
): MisureDelReso | { errore: string } {
  const misure = (disponibili ?? []).filter((n) => Number.isFinite(n) && n > 0);
  if (!misure.length) return { errore: 'Questa riga non dichiara i suoi colli' };
  const n = Number.isFinite(interi) && interi > 0 ? Math.floor(interi) : 0;
  if (!Number.isFinite(parte) || parte <= 0) return { errore: 'La parte che rientra non e un numero' };
  if (n + 1 > misure.length) {
    return { errore: `Ci sono ${misure.length} coll. in lavorazione: non se ne possono rendere ${n} interi piu' una parte di un altro` };
  }

  const ordinate = [...misure].sort((a, b) => a - b);
  const intere = ordinate.splice(0, n);
  const apribile = ordinate.find((m) => m > parte + 1e-9);
  if (apribile === undefined) {
    return { errore: `Una parte e' meno di un collo intero: il piu' grande che resta e' da ${Math.max(...ordinate)}. Per prenderlo tutto conta un collo intero in piu'` };
  }
  return { intere, apribile };
}

/** A interruttore spento questo modulo non decide niente, e il chiamante
    deve poterlo chiedere con una riga sola invece di ricordarsene ogni
    volta. `PICK` resta quello di sempre, e nessun conto si apre. */
export function attivo(featureOn: boolean | null | undefined): boolean {
  return featureOn === true;
}

/** Il vano di un ordine, quando il magazzino ne tiene uno per ODP.

    NON È QUELLO CHE L'APPLICATIVO USA OGGI, ed è deliberato. Un vano per
    ordine vorrebbe dire creare e mappare un'ubicazione a ogni ordine nuovo:
    impraticabile in corsia, e la prima prova al banco lo ha mostrato subito
    — l'area passava il controllo e poi la merce finiva in un vano che
    nessuno aveva disegnato. Oggi l'area WIP è UNA ubicazione mappata, e a
    tenere distinti i conti sono le righe di `wip`, che portano l'ordine.

    La funzione resta perché la regola è giusta il giorno in cui i vani per
    ordine si generano dalla configurazione della zona, come tutti gli altri.

    `null` senza area o senza ordine: un vano non si inventa. */
export function ubicazioneDi(
  areaWip: string | null | undefined,
  odpNum: string | null | undefined,
): string | null {
  const area = String(areaWip ?? '').trim().toUpperCase();
  const odp = String(odpNum ?? '').trim().toUpperCase();
  if (!area || !odp) return null;
  return `${area}-${odp}`;
}
