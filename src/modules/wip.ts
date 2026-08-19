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

   È L'UNICA FUNZIONE CHE CAMBIA IL SIGNIFICATO DI UN MOVIMENTO ESISTENTE, e
   per questo l'interruttore conta più che altrove: a `feature.wip` SPENTO,
   `PICK` resta quello di sempre e questo modulo non decide niente. Si
   installa a dicembre spento, e si accende a gennaio — cioè in un momento in
   cui, se i numeri non tornano, c'è tempo per accorgersene.

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
  verso: 'in' | 'out' | 'consumo' | string;
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
}

function arrotonda(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Il conto di un ordine, riga per riga. Le righe escono in ordine di
    chiave, così due letture dello stesso ordine si confrontano a occhio. */
export function conto(
  movimenti: readonly MovimentoWip[] | null | undefined,
  odpNum: string | null | undefined,
): ContoOrdine {
  const odp = String(odpNum ?? '').trim();
  const vuoto: ContoOrdine = { odp_num: odp, righe: [], entrato: 0, tornato: 0, consumato: 0, residuo: 0, incoerente: false };
  if (!movimenti?.length || !odp) return vuoto;

  const per = new Map<string, ContoRiga>();
  for (const m of movimenti) {
    if (!m || m.odp_num !== odp || !m.item_key) continue;
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
    const um = typeof m.qty_uom === 'number' ? m.qty_uom : null;
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
  };
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
  const odp = String(odpNum ?? '').trim();
  const key = String(itemKey ?? '').trim();
  if (!movimenti?.length || !odp || !key) return [];

  const fuori: number[] = [];
  const tolti: number[] = [];
  for (const m of movimenti) {
    if (!m || m.odp_num !== odp || m.item_key !== key) continue;
    const misure = Array.isArray(m.packs) ? m.packs.filter((n) => Number.isFinite(n) && n > 0) : [];
    if (!misure.length) continue;
    (m.verso === 'out' || m.verso === 'consumo' ? tolti : fuori).push(...misure);
  }

  /* Si toglie una misura per volta, e la prima che combacia: due colli da 25
     sono indistinguibili, e cercare «quello giusto» vorrebbe dire dare un
     nome a una differenza che non esiste. */
  for (const t of tolti) {
    const i = fuori.findIndex((n) => Math.abs(n - t) < 1e-6);
    if (i > -1) fuori.splice(i, 1);
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
