/* PIÙ BANCALI DELLA STESSA MERCE IN UN VANO — 2.37
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   IL PROBLEMA, COME L'HA DETTO ANDREA IL 09/09: «una ubicazione può portare
   al suo interno più di una UDC. Se nella realtà l'ubicazione di uno
   scaffale porta 3 bancali il sistema deve essere in grado di fare lo
   stesso: non dare un limite di UDC in una ubicazione, quel limite lo dà la
   realtà.»

   E il sistema un limite lo dava, ma non dove sembrava. Le unità in un vano
   erano già più d'una — la mappa ne disegna i quadratini, il pannello le
   elenca — mentre a rifiutare era `moveUdc`: portare un bancale in un vano
   dove la STESSA merce sta già su un altro bancale rispondeva «c'è già
   6001418#261571 fuori da questa unità». Tre pallet dello stesso prodotto su
   una campata sono la cosa più normale che ci sia, e il sistema li rifiutava.

   ── PERCHÉ QUEL RIFIUTO ESISTEVA, ED ERA UN PROBLEMA VERO ──────────────
   L'indice `[location_code + item_key]` è di RICERCA, non unico: il database
   accetta il doppione, e chi legge con `find` ne trova UNA — quale, dipende
   dall'ordine di caricamento. Tre bancali dello stesso lotto in un vano
   davano quindi un saldo che ne contava uno, e il saldo cambiava da solo.

   Il rifiuto difendeva da questo, e difendere era giusto. Sbagliato era
   difendersi vietando la realtà: la coppia `(vano, merce)` non identifica
   niente, perché la merce sta SU QUALCOSA. A identificare una riga è la
   TERNA `(vano, merce, unità)` — dove «nessuna unità» è un valore come gli
   altri, ed è la merce sciolta a terra.

   ── LE TRE DOMANDE CHE CAMBIANO ────────────────────────────────────────
   · **Quanta ce n'è in questo vano?** La somma di tutte le righe, non la
     prima. È l'unica delle tre che era già sbagliata prima di questa
     versione, perché due righe con la stessa chiave potevano nascere lo
     stesso — l'indice non è unico, e la voce 98 lo dice dal 2026.
   · **Dove si aggiunge?** Sulla riga con la STESSA unità. Merce sciolta si
     somma a merce sciolta; su un pallet ci sale solo chi ci viene caricato.
     Sommare merce sciolta a una riga che sta su un bancale vuol dire
     decidere al posto di chi lavora che quella roba è salita sul pallet.
   · **Da dove si toglie?** Dalla merce sciolta per prima. È la stessa regola
     degli spaiati che il magazzino applica già ai colli: si consuma quel che
     è aperto prima di aprire il pieno, e un bancale imballato è il pieno.

   PURO: nessuno Store, nessun DOM. Le stesse tre regole le applicano il
   client e il servizio, e se divergessero il saldo dipenderebbe da chi ha
   risposto per primo. */

/** Quel poco che serve a queste regole: la merce, dove sta, quanta ce n'è e
    su che cosa. Il resto della riga di giacenza non c'entra. */
export interface RigaVano {
  item_key?: string | null;
  qty?: number | null;
  udc_id?: string | null;
}

const chiave = (v: unknown): string => String(v ?? '').trim();
/** Nessuna unità è un valore, non un'assenza: è la merce sciolta a terra. */
const unita = (r: RigaVano | null | undefined): string => chiave(r?.udc_id);

/** Tutte le righe di quella merce nel vano — una per unità, più al massimo
    quella sciolta. */
export function righeDiMerce<T extends RigaVano>(
  righe: readonly T[] | null | undefined, itemKey: string,
): T[] {
  const k = chiave(itemKey);
  if (!k) return [];
  return (righe || []).filter((r) => chiave(r?.item_key) === k);
}

/** QUANTA MERCE C'È DAVVERO. La somma, non la prima riga.

    Con tre bancali dello stesso lotto su una campata, leggere la prima riga
    dice un terzo del vero — e lo dice con l'aria di un saldo. */
export function colliDiMerce(
  righe: readonly RigaVano[] | null | undefined, itemKey: string,
): number {
  return righeDiMerce(righe, itemKey)
    .reduce((n, r) => n + (Number(r.qty) || 0), 0);
}

/** DOVE SI AGGIUNGE: sulla riga con la stessa unità, o su nessuna.

    `null` = non c'è una riga compatibile e ne va creata una nuova. Merce
    sciolta cerca merce sciolta; merce di un'unità cerca quella unità. */
export function rigaDoveSommare<T extends RigaVano>(
  righe: readonly T[] | null | undefined, itemKey: string, udcId: unknown = null,
): T | null {
  const u = chiave(udcId);
  return righeDiMerce(righe, itemKey).find((r) => unita(r) === u) || null;
}

/** DA DOVE SI TOGLIE: prima la merce sciolta, poi i bancali.

    La regola degli spaiati applicata ai contenitori: si consuma quel che è
    già aperto prima di aprire un imballo. Fra due bancali non si sceglie qui
    — non c'è niente in una riga di giacenza che dica quale dei due va preso
    prima, e inventarsi un ordine sarebbe una decisione di magazzino scritta
    dove nessuno la cerca. Si prende il primo, e chi vuole quello preciso lo
    nomina passando `udcId`. */
export function rigaDaCuiTogliere<T extends RigaVano>(
  righe: readonly T[] | null | undefined, itemKey: string, udcId: unknown = undefined,
): T | null {
  const candidate = righeDiMerce(righe, itemKey);
  if (!candidate.length) return null;
  if (udcId !== undefined) {
    const u = chiave(udcId);
    return candidate.find((r) => unita(r) === u) || null;
  }
  return candidate.find((r) => !unita(r)) || candidate[0] || null;
}

/** Le unità di carico nominate dalle righe di un vano, senza doppioni e
    nell'ordine in cui compaiono. Serve a dire a video quanti bancali ci
    sono, che è la domanda che si fa chi guarda la mappa. */
export function unitaDelVano(righe: readonly RigaVano[] | null | undefined): string[] {
  const viste = new Set<string>();
  for (const r of righe || []) {
    const u = unita(r);
    if (u) viste.add(u);
  }
  return [...viste];
}

/** Vero quando due righe sono LA STESSA riga per il modello: stessa merce,
    stesso vano (chi chiama lo garantisce) e stessa unità. È il doppione che
    non deve nascere, e l'unico. */
export function stessaRiga(a: RigaVano | null | undefined, b: RigaVano | null | undefined): boolean {
  if (!a || !b) return false;
  return chiave(a.item_key) === chiave(b.item_key) && unita(a) === unita(b);
}
