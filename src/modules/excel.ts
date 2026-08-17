/* ── 1.7 · SheetJS SI CARICA QUANDO SERVE ─────────────────────────────────
   `xlsx` pesa 864 KB su 1,61 MB — oltre metà dell'applicativo — e serve a chi
   importa un ODP o esporta un registro: qualche volta al giorno. Fino alla 1.6
   la consegna era un file solo, che non ha pezzi: ogni terminale se lo
   riscaricava intero a ogni ricarica della pagina.

   Qui l'import è dinamico, e Rollup ne fa un chunk suo. Chi apre la mappa non
   lo scarica affatto; chi preme «Carica ordine» lo scarica una volta e basta.

   PUNTO UNICO, come `core/persistence/index.ts` lo è dell'adapter: se un
   giorno SheetJS va sostituito, si sostituisce qui. Chi importa `xlsx` in
   cima a un file lo rimette dentro al chunk principale, e la 1.7 smette di
   servire a qualcosa. */

type Excel = typeof import('xlsx');

let modulo: Excel | null = null;
let inCorso: Promise<Excel> | null = null;

/** SheetJS, caricato alla prima chiamata e tenuto da parte per le successive. */
export function caricaExcel(): Promise<Excel> {
  if (modulo) return Promise.resolve(modulo);
  /* Due export premuti a mezzo secondo di distanza sono due chiamate: senza
     questa, sarebbero due scaricamenti. */
  inCorso ??= import('xlsx').then((m) => (modulo = m));
  return inCorso;
}

/** Se è già stato caricato — per chi deve decidere se mostrare un'attesa. */
export function excelPronto(): boolean {
  return modulo !== null;
}
