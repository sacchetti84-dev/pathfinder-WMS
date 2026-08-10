/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — utility elementari
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Due funzioni, nessuna dipendenza: il ritardo sulle ricerche e la
   costruzione di un nodo DOM. Stanno insieme perché non appartengono a
   nessun dominio, non perché siano parenti.
   ═══════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════
// UTILITY 
// ═══════════════════════════════════════════════════════════════════

/* Debounce: ritarda l'esecuzione di fn finché non passano `ms` ms senza chiamate.
   Indispensabile per filtri di ricerca su dataset grandi (es. 11k articoli). */
const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

/* DOM-safe element builder: crea un elemento con attributi e children senza
   passare per innerHTML. I valori dei figli stringa diventano textContent
   (nessun rischio XSS). I valori HTMLElement sono appesi direttamente.
   attrs: oggetto {attributo: valore}, attributi 'on*' = event listener.
   children: array di string | HTMLElement | null/undefined (skip). */
const _h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'class' || k === 'className') {
      el.className = v;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k === 'dataset' && typeof v === 'object') {
      Object.assign(el.dataset, v);
    } else {
      el.setAttribute(k, v);
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
