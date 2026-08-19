/* LA MERCE CHE STA NELL'ALTRO MAGAZZINO — 1.10.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Il percorso di prelievo è costruito un sito per volta, nell'ordine di
   visita che l'operatore decide. Quando un lotto sta in un magazzino che non
   è quello dove si sta lavorando, fino alla 1.9 il percorso ci mandava
   comunque: una tappa in fondo, in un altro capannone, per tre chili.

   Chi lavora, quella tappa, non la fa: chiede che la merce arrivi. La 1.10
   scrive quella richiesta invece di lasciarla a voce — nasce un'attività di
   TRASFERIMENTO nello schedulatore, con l'ubicazione in cui riceverla, e la
   tappa del percorso si sposta su quell'ubicazione. L'operatore continua a
   vedere una tappa di prelievo: cambia dove, non cosa.

   IL TRASFERIMENTO NON SI ESEGUE QUI. Nasce un compito, e la merce si muove
   quando qualcuno lo prende in carico: è la stessa regola di ogni altro
   tipo: la coda non muove niente da sola.

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato da fermo in
   `test/trasferimentiOdp.test.js`. */

import type { Tappa } from './pickRoute';

/** Una tappa che sta fuori dal magazzino in cui si lavora, con il nome del
    sito dove sta davvero — perché «MAG2» su un pulsante non dice niente a
    chi deve decidere se aspettare la merce o andarsela a prendere. */
export interface TappaAltrove {
  tappa: Tappa;
  site_id: string;
  site_name: string;
}

/** Il compito che nasce dalla spunta, nella forma che `Store.createTask`
    accetta. Il `payload` è quello del TRANSFER di sempre: `from` e `to` sono
    ubicazioni, e nessuno le inventa qui. */
export interface RichiestaTrasferimento {
  type: 'TRANSFER';
  priority: number;
  note: string;
  payload: {
    article_code: string;
    lot_code: string;
    /** La quantità che l'ordine chiede, NELLA SUA unità — un ODP chiede
        chili, non colli. `qty` resta fuori apposta: quanti colli servano a
        fare 44,42 kg lo sa la riga di giacenza, non l'ordine, e scriverci
        dentro un numero di chili sotto il nome «colli» è come la coda lo
        leggerebbe. Visto il 19/08: «44.42 coll.» per 44,42 KG. */
    qty_uom: number;
    uom: string;
    from: string;
    to: string;
    odp_num?: string;
  };
}

/** Dove si sta lavorando, per QUESTO ordine: **il magazzino con più
    prelievi**. È la regola che il magazzino segue davvero — detta da Andrea
    il 19/08 — e dice una cosa semplice: si va dove c'è il grosso della
    merce, e il resto lo si fa arrivare.

    Non è il primo dell'ordine di visita. Provato lo stesso giorno con un ODP
    vero — 380 kg di miscela, dieci tappe fra M03 e MAG1 — l'ordine di visita
    partiva da `MAG`, dove quell'ordine non aveva una sola riga: tutte e
    dieci le tappe risultavano «in un altro magazzino». Vero, e inutile: un
    avviso che si accende su tutto non dice niente. Con la regola dei più
    prelievi casa è M03, con sette tappe, e le tre di MAG1 sono quelle da
    farsi portare.

    A PARITÀ decide l'ordine di visita, che è la preferenza dell'operatore:
    due magazzini con lo stesso numero di righe sono davvero equivalenti, e a
    quel punto sceglie chi cammina. */
export function sitoDiCasa(
  stops: readonly Tappa[] | null | undefined,
  ordineVisita: readonly string[] | null | undefined,
): string {
  if (!stops?.length) return '';
  const quante = new Map<string, number>();
  for (const t of stops) {
    const s = t.site_id;
    if (s) quante.set(s, (quante.get(s) ?? 0) + 1);
  }
  if (!quante.size) return '';
  const massimo = Math.max(...quante.values());
  const primi = [...quante.keys()].filter(s => quante.get(s) === massimo);
  if (primi.length === 1) return primi[0]!;
  for (const id of ordineVisita ?? []) if (primi.includes(id)) return id;
  /* Nessuno dei pari merito sta nell'ordine di visita: casa è quello della
     prima tappa fra loro, che è dove il percorso comincia. */
  return stops.find(t => primi.includes(t.site_id))?.site_id || primi[0]!;
}

/** Le tappe che stanno in un magazzino diverso da quello dove si lavora.
    Con un sito solo non c'è nessun altrove, e l'elenco esce vuoto. */
export function tappeAltrove(
  stops: readonly Tappa[] | null | undefined,
  sitoDiCasa: string | null | undefined,
  nomeSito: (id: string) => string = (id) => id,
): TappaAltrove[] {
  if (!stops?.length || !sitoDiCasa) return [];
  const out: TappaAltrove[] = [];
  for (const t of stops) {
    const sito = t.site_id || '';
    if (!sito || sito === sitoDiCasa) continue;
    out.push({ tappa: t, site_id: sito, site_name: nomeSito(sito) || sito });
  }
  return out;
}

/** La richiesta di trasferimento che nasce da una tappa. La quantità è
    quella che l'ordine chiede su quella riga: chiederne meno vorrebbe dire
    tornare a prendere il resto, chiederne di più è merce che nessuno ha
    ordinato.

    `null` quando manca l'ubicazione di ricezione o quando è la stessa da cui
    la merce dovrebbe uscire: un trasferimento da un vano a se stesso non è
    un trasferimento, è un compito che qualcuno chiuderà senza fare niente. */
export function richiestaTrasferimento(
  tappa: Tappa | null | undefined,
  aUbicazione: string | null | undefined,
  opzioni: { priorita?: number; odp_num?: string; nota?: string } = {},
): RichiestaTrasferimento | null {
  if (!tappa) return null;
  const a = String(aUbicazione ?? '').trim().toUpperCase();
  if (!a) return null;
  if (a === String(tappa.location_code ?? '').toUpperCase()) return null;

  const odp = String(opzioni.odp_num ?? '').trim();
  const nota = [
    opzioni.nota,
    odp ? `Richiesto dall’ordine ${odp}` : 'Richiesto da un ordine di produzione',
    `${tappa.kg_required} ${tappa.um} da ${tappa.location_code} a ${a}`,
  ].filter(Boolean).join(' — ');

  return {
    type: 'TRANSFER',
    priority: Number(opzioni.priorita) || 2,
    note: nota,
    payload: {
      article_code: tappa.article_code,
      lot_code: tappa.lot_code,
      qty_uom: tappa.kg_required,
      uom: tappa.um,
      from: tappa.location_code,
      to: a,
      ...(odp ? { odp_num: odp } : {}),
    },
  };
}

/** La tappa spostata sull'ubicazione in cui la merce arriverà. Resta una
    tappa di PRELIEVO — è quello che l'operatore farà davvero — e porta con
    sé il compito che l'ha generata, perché un percorso che manda a un vano
    ancora vuoto deve poter dire perché.

    Le ALTERNATIVE si buttano: erano le altre ubicazioni del magazzino
    lontano, e mandarci l'operatore è esattamente ciò che il trasferimento
    serve a evitare. Il seme `qty_available` va a zero: in quel vano, adesso,
    non c'è niente, e scrivere la giacenza del vano di partenza sarebbe un
    numero vero riferito al posto sbagliato. */
export function tappaInAttesa(
  tappa: Tappa | null | undefined,
  aUbicazione: string | null | undefined,
  sitoDiCasa: string | null | undefined,
  taskId: string | null | undefined,
): Tappa | null {
  if (!tappa) return null;
  const a = String(aUbicazione ?? '').trim().toUpperCase();
  if (!a) return null;
  return {
    ...tappa,
    site_id: sitoDiCasa || tappa.site_id,
    location_code: a,
    alternatives: [],
    qty_available: 0,
    status: 'pending',
    forced_note: [
      `In arrivo da ${tappa.location_code}`,
      taskId ? `trasferimento ${taskId}` : 'trasferimento richiesto',
    ].join(' — '),
  };
}
