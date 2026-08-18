/* UNA VISTA È UN BLOCCO DI `App` CHE VIVE IN UN FILE SUO.

   `App` resta un oggetto solo — l'HTML e i gestori costruiti dentro le
   stringhe lo chiamano per nome, e 258 punti smetterebbero di funzionare in
   silenzio se smettesse di esserlo. Quindi una vista non è un modulo che si
   istanzia: è un pezzo dell'oggetto, che `app.js` rimette dentro con la
   guardia in coda al file.

   `this` è il monolite intero, e resta `any` per una ragione precisa, provata
   il 18/08 alla fine della migrazione: dargli il tipo vero — `typeof App` più
   le venticinque viste, con `ThisType` — è un ciclo che il compilatore non
   scioglie (TS7022, ventitré viste «implicitly has type any because it is
   referenced directly or indirectly in its own initializer»). Il tipo di una
   vista dipenderebbe da `Monolite`, che dipende dal tipo di quella vista.
   Uscirne vuol dire dichiarare a mano la superficie intera — le stesse
   trecento righe che `superficie-app.dati.js` già elenca — e quel documento
   esiste, quindi la strada c'è: si genera, non si scrive.

   Quel che invece è cambiato: le viste non sono più annotate `: Vista`, sono
   `satisfies Vista`. La differenza non è di stile — con l'annotazione il tipo
   di ogni metodo veniva schiacciato su `Metodo`, e chi importava una vista non
   vedeva più niente; con `satisfies` il controllo resta e la forma vera
   sopravvive.

   Il ramo che non è una funzione serve allo stato e alle tabelle di una vista
   (`_rcpFiltro`, `_PARAM_SCHEDE`): viaggiano col blocco a cui appartengono. */
type Metodo = (this: any, ...args: any[]) => any;

export type Vista = Record<
  string,
  Metodo | string | number | boolean | readonly unknown[] | Record<string, unknown> | null | Set<unknown> | Map<unknown, unknown>
>;

/* IL CAMPO CHE SI È SCRITTO TRE RIGHE SOPRA.

   `document.getElementById` restituisce `HTMLElement | null`, e queste
   maschere leggono `.value` da un campo che hanno appena disegnato loro.

   `$` continua a comportarsi come prima — se l'elemento non c'è, `.value`
   esplode adesso come esplodeva ieri — ma non è più `any`: dice
   `HTMLInputElement`, che è quel che sono i duecento campi che passano di
   qua, e da adesso chi ci scrive dentro un numero se lo sente dire. La
   tendina ha un tipo suo, perché `options` e `selectedIndex` su un campo di
   testo non esistono.

   Quel che NON è un campo — un pannello, una fascia, una cella — si prende
   con `document.getElementById` e basta: lì serve `HTMLElement | null`, e
   quattro punti fra `movimenta` e `giacenze` lo facevano già. */
export const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
export const $q = (sel: string) => document.querySelector(sel) as HTMLInputElement;
export const $sel = (id: string) => document.getElementById(id) as HTMLSelectElement;
