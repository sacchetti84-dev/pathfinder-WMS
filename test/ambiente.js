/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — l'ambiente minimo per i collaudi
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   PERCHÉ SERVE, E PERCHÉ NON UN FINTO BROWSER INTERO.
   Il selettore della persistenza decide da DOVE è stata aperta la pagina, e
   lo fa al caricamento del modulo: chi importa qualunque cosa a valle di
   Store si porta dietro quella riga. In Node un indirizzo di pagina non
   esiste, e l'import fallisce prima ancora di arrivare al codice da
   collaudare.

   Si potrebbe installare un browser finto (jsdom, happy-dom) e chiudere la
   questione con una dipendenza. Ma per i collaudi che contano qui — un
   comparatore, una geometria, un ordinamento — non serve un DOM: servono
   tre righe che dicano «questa pagina è un file locale». Dichiararle è
   anche un modo di scrivere nero su bianco cosa il grafo dei moduli dà per
   scontato dell'ambiente in cui gira.

   `protocol: 'file:'` sceglie l'adapter LOCALE, che è quello che non parla
   con nessuno: un collaudo non deve poter toccare un servizio, e tanto meno
   quello di magazzino.
   ═══════════════════════════════════════════════════════════════════ */

globalThis.location = /** @type {any} */ ({
  search: '',
  protocol: 'file:',
  href: 'file:///pathfinder.html',
});

/* Store e PickRoute leggono preferenze di dispositivo (l'ordine dei siti,
   la finestra del registro). In collaudo non devono persistere niente. */
const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => void memoria.set(k, String(v)),
  removeItem: (k) => void memoria.delete(k),
  clear: () => memoria.clear(),
  key: (i) => [...memoria.keys()][i] ?? null,
  get length() { return memoria.size; },
});
