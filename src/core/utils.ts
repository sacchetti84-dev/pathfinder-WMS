/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — utility elementari
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Due funzioni, nessuna dipendenza: il ritardo sulle ricerche e la
   costruzione di un nodo DOM. Stanno insieme perché non appartengono a
   nessun dominio, non perché siano parenti.

   FASE 3 — tipizzato. Il codice eseguito è lo stesso di prima: sono state
   aggiunte annotazioni, che non producono nulla, e alcune asserzioni `as`.

   PERCHÉ `as` E NON `String(v)`. Il DOM converte da sé: `setAttribute` e
   `className` accettano qualunque valore e lo rendono stringa. Scrivere
   `String(v)` per far contento il compilatore aggiungerebbe una chiamata
   che prima non c'era — un cambiamento di codice per una ragione che non è
   il codice. L'asserzione dice al compilatore ciò che il DOM già fa, e non
   lascia traccia in ciò che il browser esegue.
   ═══════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

/* Debounce: ritarda l'esecuzione di fn finché non passano `ms` ms senza chiamate.
   Indispensabile per filtri di ricerca su dataset grandi (es. 11k articoli).

   Il generico serve a una cosa sola, ma vale: gli argomenti che arrivano alla
   funzione ritardata sono gli stessi che vuole quella originale, e chiamarla
   con i parametri sbagliati adesso non compila. */
const debounce = <A extends unknown[]>(fn: (...args: A) => unknown, ms = 300) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

/** Ciò che `_h` accetta come figlio: testo, numero, un nodo, o niente. */
type Figlio = string | number | Node | null | undefined | false;

/* DOM-safe element builder: crea un elemento con attributi e children senza
   passare per innerHTML. I valori dei figli stringa diventano textContent
   (nessun rischio XSS). I valori HTMLElement sono appesi direttamente.
   attrs: oggetto {attributo: valore}, attributi 'on*' = event listener.
   children: array di string | HTMLElement | null/undefined (skip). */
const _h = (
  tag: string,
  attrs: Record<string, unknown> = {},
  children: Figlio | Figlio[] = [],
): HTMLElement => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class' || k === 'className') {
      el.className = v as string;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k === 'dataset' && typeof v === 'object') {
      Object.assign(el.dataset, v);
    } else {
      el.setAttribute(k, v as string);
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false) continue;
    if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  return el;
};

/* fine utility */

export { debounce, _h };
