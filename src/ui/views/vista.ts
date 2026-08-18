/* UNA VISTA È UN BLOCCO DI `App` CHE VIVE IN UN FILE SUO.

   `App` resta un oggetto solo — l'HTML e i gestori costruiti dentro le
   stringhe lo chiamano per nome, e 258 punti smetterebbero di funzionare in
   silenzio se smettesse di esserlo. Quindi una vista non è un modulo che si
   istanzia: è un pezzo dell'oggetto, che `app.js` rimette dentro con la
   guardia in coda al file.

   `this` è il monolite intero, e finché `app.js` è JavaScript non c'è un tipo
   migliore di `any`. Non è una resa: è che i corpi si tipizzano DOPO
   l'estrazione, un file per volta, e mescolare le due cose vorrebbe dire
   riscrivere mentre si sposta. Intanto `tsc` guarda già la cosa che sbaglia
   per davvero durante un'estrazione — un import dimenticato — ed è la ragione
   per cui questi file nascono `.ts` e non `.js`.

   Il ramo che non è una funzione serve allo stato e alle tabelle di una vista
   (`_rcpFiltro`, `_PARAM_SCHEDE`): viaggiano col blocco a cui appartengono. */
type Metodo = (this: any, ...args: any[]) => any;

export type Vista = Record<
  string,
  Metodo | string | number | boolean | readonly any[] | Record<string, any> | null
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
