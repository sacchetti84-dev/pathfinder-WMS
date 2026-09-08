/* IL GIRO — PIÙ ORDINI DI PRODUZIONE IN UN PERCORSO SOLO.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   IL CASO. Cinque ODP della stessa serie chiedono lo stesso articolo dallo
   stesso lotto. Prelevati uno alla volta sono cinque giri sulle stesse
   corsie, e il primo che apre un collo lascia agli altri quattro un lotto
   che a scaffale non basta più.

   QUESTO MODULO FA DUE COSE, E NESSUNA DELLE DUE TOCCA IL MAGAZZINO.

   1. RICALIBRA un ordine su una quantità diversa da quella pianificata. La
      distinta di Sage è proporzionale alla quantità in testata: chiedere il
      doppio del prodotto finito vuol dire il doppio di ogni materia prima.
      Il fattore si applica alle righe e ai lotti, con i decimali dell'unità
      di ciascuno — non con i tre di default, che su una riga in PZ
      scriverebbero mezzo pezzo.

   2. UNISCE più ordini in una distinta sola, sommando le quantità che
      chiedono lo stesso articolo e lo stesso lotto, e tenendo da parte QUANTO
      ne vuole ciascuno. Quel dettaglio — le `richieste` — non serve al
      cammino: serve al conto, che deve poter dire fra sei mesi per chi era
      sceso quel sacco.

   NON DECIDE NIENTE SUL CONTO DI PRODUZIONE. Il conto lo apre il capofila,
   e la ripartizione si dichiara alla chiusura, quando i numeri si sanno:
   vedi §6 e `modules/wip.ts`. Qui si sommano quantità, e basta.

   PURO: non conosce Store, non conosce il DOM. */

import type { LottoODP, RigaODP, TestataODP } from './odpParser';
import type { DomandaRiga } from './wip';
import { arrotonda, decimali, leggiNumero } from './misure';

/** Un ordine che partecipa al giro, come sta in memoria fra l'import e
    l'avvio. `lines` sono già ricalibrate: `fattore` resta scritto perché la
    maschera lo mostri e perché ricalibrare di nuovo riparta dall'originale. */
export interface OrdineDelGiro {
  odp_num: string;
  header: TestataODP;
  /** Le righe come le ha lette il parser, mai toccate. */
  lines_originali: RigaODP[];
  /** Le righe in vigore: `lines_originali` moltiplicate per `fattore`. */
  lines: RigaODP[];
  warnings: string[];
  file_name: string;
  /** 1 = la quantità che l'ordine dichiara. */
  fattore: number;
  /** La quantità dichiarata a mano, quando è stata cambiata. `null` = quella
      di Sage, e allora `fattore` vale 1. */
  qty_voluta: number | null;
}

/** Quanto di una riga vuole un singolo ordine. */
export interface Richiesta {
  odp_num: string;
  qty: number;
}

/** La chiave con cui una riga si riconosce fra ordini diversi. È la stessa
    forma di `item_key` — articolo e lotto — perché è su quella che il
    percorso costruisce la tappa. Una riga senza lotto tiene la chiave
    monca: l'ordine non le assegna un lotto, e non si può inventare. */
export function chiaveRiga(articolo: unknown, lotto: unknown): string {
  return `${String(articolo ?? '').trim().toUpperCase()}#${String(lotto ?? '').trim()}`;
}

export function normalizzaOdp(odp: unknown): string {
  return String(odp ?? '').trim().toUpperCase();
}

/** La quantità che l'ordine dichiara di produrre. Il parser la tiene come
    TESTO apposta — è ciò che il foglio scrive — e qui diventa un numero solo
    per farci una divisione. `null` quando non è un numero: allora la
    ricalibrazione non si può offrire, e la maschera lo dice. */
export function qtaPianificata(header: TestataODP | null | undefined): number | null {
  const n = leggiNumero(header?.qty_planned);
  return n !== null && n > 0 ? n : null;
}

/** Il fattore che porta l'ordine dalla quantità pianificata a quella voluta.
    `null` quando una delle due non è un numero utile: meglio nessuna
    ricalibrazione che una moltiplicazione per un numero inventato. */
export function fattoreDa(header: TestataODP | null | undefined, voluta: unknown): number | null {
  const base = qtaPianificata(header);
  const q = leggiNumero(voluta);
  if (base === null || q === null || q <= 0) return null;
  return q / base;
}

function scalaQta(q: unknown, fattore: number, uom: string | null | undefined): number {
  const n = leggiNumero(q) ?? 0;
  return arrotonda(n * fattore, decimali(uom ?? null)) ?? 0;
}

/** Le righe ricalibrate. Il fattore si applica al totale e a OGNI lotto:
    l'ordine assegna i lotti riga per riga, e scalare solo il totale
    lascerebbe una distinta che non somma con se stessa.

    I decimali sono quelli dell'unità DEL LOTTO, non quelli della riga: un
    articolo dichiarato in KG può portare un lotto in PZ, e il parser lo
    legge già così. */
export function scala(lines: readonly RigaODP[] | null | undefined, fattore: number): RigaODP[] {
  const f = Number(fattore);
  if (!Number.isFinite(f) || f <= 0) return [...(lines || [])];
  if (f === 1) return [...(lines || [])];
  return (lines || []).map((l) => ({
    ...l,
    total_qty: scalaQta(l.total_qty, f, l.um),
    lots: (l.lots || []).map((lot: LottoODP) => ({
      ...lot,
      qty: scalaQta(lot.qty, f, lot.um || l.um),
    })),
  }));
}

/** Un ordine appena letto, non ancora ricalibrato. */
export function ordineDelGiro(
  header: TestataODP,
  lines: RigaODP[],
  warnings: string[],
  fileName: string,
): OrdineDelGiro {
  return {
    odp_num: normalizzaOdp(header.odp_num),
    header,
    lines_originali: lines,
    lines,
    warnings: warnings || [],
    file_name: fileName,
    fattore: 1,
    qty_voluta: null,
  };
}

/** Lo stesso ordine su una quantità diversa. Riparte SEMPRE da
    `lines_originali`: ricalibrare due volte moltiplicando l'ultimo risultato
    comporrebbe i due fattori, e chi scrive «700» dopo aver scritto «350» si
    ritroverebbe millequattrocento. Quantità vuota o non valida = si torna a
    quella dell'ordine. */
export function ricalibra(o: OrdineDelGiro, voluta: unknown): OrdineDelGiro {
  const f = fattoreDa(o.header, voluta);
  if (f === null) {
    return { ...o, fattore: 1, qty_voluta: null, lines: o.lines_originali };
  }
  return {
    ...o,
    fattore: f,
    qty_voluta: leggiNumero(voluta),
    lines: scala(o.lines_originali, f),
  };
}

export interface Distinta {
  /** La distinta unita, nella forma che il percorso già sa leggere. */
  lines: RigaODP[];
  /** Per ogni riga — chiave articolo#lotto — quanto ne vuole ciascun ordine,
      nell'ordine in cui i file sono stati caricati. */
  richieste: Map<string, Richiesta[]>;
}

/** LA DISTINTA UNITA. Righe che chiedono lo stesso articolo e lo stesso lotto
    diventano una riga sola, e la somma è quella che il percorso preleva.

    L'ORDINE DELLE RIGHE È QUELLO DI PRIMO INCONTRO, non alfabetico: la
    serpentina riordina tutto dopo, e un criterio in più qui vorrebbe solo
    dire che due letture degli stessi file danno due distinte diverse a
    seconda di come Sage ha scritto i fogli.

    UNA RIGA SENZA LOTTO NON SI FONDE CON UNA CHE CE L'HA. L'ordine che non
    assegna il lotto finisce in coda al percorso — non è prelevabile — e
    sommarla a una riga assegnata la farebbe sparire dentro una tappa che
    quel lotto lo ha. */
export function unisci(ordini: readonly OrdineDelGiro[] | null | undefined): Distinta {
  const perArticolo = new Map<string, RigaODP>();
  const richieste = new Map<string, Richiesta[]>();

  const segna = (chiave: string, odp: string, qty: number) => {
    const gia = richieste.get(chiave);
    const q = Number(qty) || 0;
    if (!gia) { richieste.set(chiave, [{ odp_num: odp, qty: q }]); return; }
    const suo = gia.find((r) => r.odp_num === odp);
    if (suo) suo.qty = arrotonda(suo.qty + q) ?? suo.qty;
    else gia.push({ odp_num: odp, qty: q });
  };

  for (const o of ordini || []) {
    const odp = normalizzaOdp(o.odp_num);
    for (const l of o.lines || []) {
      const kArt = String(l.article_code ?? '').trim().toUpperCase();
      const dec = decimali(l.um ?? null);
      let riga = perArticolo.get(kArt);
      if (!riga) {
        /* La prima copia comanda su tutto quel che non è una quantità:
           descrizione, categoria e unità sono un dato d'anagrafica, e due
           ordini che li scrivono diversi hanno un problema in anagrafica,
           non qui. */
        riga = { ...l, total_qty: 0, lots: [] };
        perArticolo.set(kArt, riga);
      }
      riga.total_qty = arrotonda((riga.total_qty || 0) + (leggiNumero(l.total_qty) ?? 0), dec) ?? riga.total_qty;

      if (!(l.lots || []).length) {
        segna(chiaveRiga(kArt, ''), odp, leggiNumero(l.total_qty) ?? 0);
        continue;
      }
      for (const lot of l.lots) {
        const decLot = decimali(lot.um || l.um || null);
        const gia = riga.lots.find((x) => x.lot_code === lot.lot_code);
        if (gia) {
          gia.qty = arrotonda((gia.qty || 0) + (leggiNumero(lot.qty) ?? 0), decLot) ?? gia.qty;
        } else {
          riga.lots.push({ ...lot, qty: arrotonda(leggiNumero(lot.qty) ?? 0, decLot) ?? 0 });
        }
        segna(chiaveRiga(kArt, lot.lot_code), odp, leggiNumero(lot.qty) ?? 0);
      }
    }
  }

  return { lines: [...perArticolo.values()], richieste };
}

/** COME SI RIPARTISCE QUELLO CHE È USCITO DAVVERO.

    Il magazzino non preleva mai la cifra esatta della distinta: prende colli,
    e i colli sono interi. Questa funzione dice, di quello che è uscito, quanto
    tocca a ciascun ordine — in proporzione a quanto aveva chiesto.

    L'ULTIMO ASSORBE IL RESTO. Tre ordini su 10 KG fanno 3,333 a testa e la
    somma non torna: il residuo dell'arrotondamento va sull'ultimo, così la
    somma delle quote è ESATTAMENTE quello che è uscito. Un centesimo in più
    su una quota è un errore che si vede e si spiega; una somma che non torna
    è un conto che nessuno riesce a chiudere.

    Serve al rendiconto e alla chiusura, non al prelievo: al prelievo la merce
    esce una volta sola. */
export function quote(
  richieste: readonly Richiesta[] | null | undefined,
  uscito: unknown,
  uom: string | null = null,
): Richiesta[] {
  const righe = (richieste || []).filter((r) => r && r.odp_num);
  const tot = righe.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  const u = leggiNumero(uscito) ?? 0;
  if (!righe.length) return [];
  if (righe.length === 1) return [{ odp_num: righe[0]!.odp_num, qty: u }];
  const dec = decimali(uom);
  /* Senza richieste con dentro un numero non c'è proporzione da fare: si
     divide in parti uguali, che è l'unica ripartizione difendibile quando
     nessuno ha dichiarato di volerne più dell'altro. */
  const pesi = tot > 0 ? righe.map((r) => (Number(r.qty) || 0) / tot) : righe.map(() => 1 / righe.length);
  const out: Richiesta[] = [];
  let speso = 0;
  righe.forEach((r, i) => {
    if (i === righe.length - 1) {
      out.push({ odp_num: r.odp_num, qty: arrotonda(u - speso, dec) ?? 0 });
      return;
    }
    const q = arrotonda(u * pesi[i]!, dec) ?? 0;
    speso = arrotonda(speso + q, dec) ?? speso;
    out.push({ odp_num: r.odp_num, qty: q });
  });
  return out;
}

/** LA DOMANDA DEL GIRO, riga per riga — quanto chiede in tutto ogni
    articolo#lotto, nell'unità in cui lo chiede.

    È la stessa somma che `unisci` fa per costruire il percorso, letta in
    forma piatta: serve a `coperturaInLavorazione` (`modules/wip.ts`) per
    dire quanto di questo è già fermo in reparto. Sta qui perché la
    aggregazione per chiave è di questo modulo, e `wip.ts` non sa niente né
    di ODP né di fogli.

    UNA RIGA SENZA LOTTO NON HA UNA DOMANDA CONFRONTABILE e resta fuori: il
    vano tiene lotti, e una chiave monca appaierebbe merce a caso. Quella
    riga il percorso la manda già in coda — `no_lot_in_odp`. */
export function fabbisogno(ordini: readonly OrdineDelGiro[] | null | undefined): DomandaRiga[] {
  const { lines } = unisci(ordini);
  const out: DomandaRiga[] = [];
  for (const l of lines) {
    const art = String(l.article_code ?? '').trim().toUpperCase();
    for (const lot of l.lots || []) {
      const lotto = String(lot.lot_code ?? '').trim();
      if (!art || !lotto) continue;
      out.push({
        item_key: chiaveRiga(art, lotto),
        article_code: art,
        lot_code: lotto,
        qty: leggiNumero(lot.qty) ?? 0,
        uom: lot.um || l.um || null,
      });
    }
  }
  return out;
}

/** I numeri d'ordine del giro, capofila compreso e senza doppioni. */
export function numeriDelGiro(ordini: readonly OrdineDelGiro[] | null | undefined): string[] {
  return [...new Set((ordini || []).map((o) => normalizzaOdp(o.odp_num)).filter(Boolean))];
}
