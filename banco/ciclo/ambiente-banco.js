/* L'AMBIENTE DEL CICLO 2.0.

   Il ciclo esercita il CLIENT VERO — `Store`, i moduli, le rotte composte —
   contro il servizio del banco sulla 4199. Non e' un doppione dei collaudi
   di `test/`: quelli provano i moduli puri da fermi, questo prova la catena
   intera con un database dentro.

   Serve percio' l'opposto di `test/ambiente.js`: `http:`, cosi' Persistence
   sceglie l'adapter remoto, e un DOM finto quel tanto che basta perche' i
   moduli si carichino. Nessuna vista viene disegnata. */

globalThis.location = /** @type {any} */ ({
  search: '',
  protocol: 'http:',
  host: '127.0.0.1:4199',
  origin: 'http://127.0.0.1:4199',
  href: 'http://127.0.0.1:4199/',
});

const memoria = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => void memoria.set(k, String(v)),
  removeItem: (k) => void memoria.delete(k),
  clear: () => memoria.clear(),
  key: (i) => [...memoria.keys()][i] ?? null,
  get length() { return memoria.size; },
});

/* Il DOM finto. `app.ts` e le viste si caricano — l'import di `Store` le
   tira dentro — ma nessuna disegna niente finche' non la si chiama: quel
   che serve e' che i pochi accessi a livello di modulo non esplodano. */
const nodoFinto = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
  setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
  querySelector: () => null, querySelectorAll: () => [],
  focus() {}, blur() {}, click() {},
  value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
  dataset: {}, children: [], parentNode: null,
});

globalThis.document = /** @type {any} */ ({
  getElementById: () => nodoFinto(),
  querySelector: () => nodoFinto(),
  querySelectorAll: () => [],
  createElement: () => nodoFinto(),
  addEventListener() {}, removeEventListener() {},
  body: nodoFinto(),
  documentElement: nodoFinto(),
  readyState: 'complete',
});

globalThis.window = /** @type {any} */ (globalThis);
if (!globalThis.navigator) globalThis.navigator = /** @type {any} */ ({ userAgent: 'banco-2.0' });
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
globalThis.EventSource = globalThis.EventSource || /** @type {any} */ (class { constructor() {} close() {} addEventListener() {} });
