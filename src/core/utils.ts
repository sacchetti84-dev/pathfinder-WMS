const debounce = <A extends unknown[]>(fn: (...args: A) => unknown, ms = 300) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

/** Ciò che `_h` accetta come figlio: testo, numero, un nodo, o niente. */
type Figlio = string | number | Node | null | undefined | false;

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
