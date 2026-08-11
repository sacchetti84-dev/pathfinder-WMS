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
