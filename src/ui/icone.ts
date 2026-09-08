/* LE ICONE — 2.23
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 2.22 le icone erano 68 emoji scelte una alla volta, per 680 volte
   nel markup. Un'emoji non è un'icona: il disegno lo sceglie il sistema
   operativo — Segoe UI Emoji su Windows, Noto sul terminale Android — quindi
   la stessa maschera esce con due set diversi a seconda di dove gira; il
   colore non si comanda, e le famiglie delle tessere (viola quarantena, teal
   resi, arancio spedizioni) combattevano contro un glifo che resta del suo
   colore; e le metriche non stanno sulla linea di base. `emojiVestite.test.js`
   curava il sintomo — il selettore U+FE0F — non la causa.

   Le icone sono **Tabler outline** — MIT, griglia 24, tratto 2 — copiate in
   `src/icone/svg/` e montate in uno <symbol> dentro `index.html`. Nessuna
   dipendenza, nessun font, nessuna richiesta: su una rete interna senza
   uscita è l'unica forma che non può fallire a metà.

   SOLO IL FILO, NIENTE PIENI E NIENTE DUE TINTE. In queste maschere il colore
   porta uno STATO — vuoto, occupato, bloccato, riservato — e un'icona che si
   porta appresso un colore suo dice una cosa che non è vera. Un disegno a
   filo prende il colore di chi lo usa e tace sul resto.

   LE FRECCE RESTANO TESTO — `→ ↔ ↩ ↺ ← ↑ ↓`. Marcano righe dentro tabelle
   dense e congiungono i passi nella banda del flusso: sono congiunzioni
   tipografiche, non icone, e da icone peserebbero più di quel che
   accompagnano. È la stessa regola che `emojiVestite.test.js` teneva per
   `↔ ▶ ↩`, e non cambia. */

/* ICONE-INIZIO: generato da strumenti/genera-icone.mjs — non si scrive a mano */
export const ICONE = [
  'address-book', 'adjustments', 'alert-octagon', 'alert-triangle',
  'arrow-back-up', 'arrows-left-right', 'arrows-shuffle', 'ban', 'barcode',
  'bell', 'biohazard', 'bolt', 'book-2', 'books', 'building-community',
  'building-factory', 'building-warehouse', 'bulb', 'calculator',
  'calendar-event', 'chart-bar', 'check', 'circle-check', 'circle-x',
  'clipboard-text', 'compass', 'crown', 'database', 'device-floppy', 'download',
  'edit', 'eye', 'file-text', 'filter', 'flag', 'flame', 'flask', 'folders',
  'forklift', 'hand-move', 'hand-stop', 'help', 'history', 'home',
  'info-circle', 'key', 'link', 'list-numbers', 'lock', 'lock-access',
  'lock-open', 'logout', 'map', 'map-pin', 'package', 'pencil', 'player-pause',
  'player-play', 'plus', 'printer', 'puzzle', 'recycle', 'refresh', 'ruler',
  'scale', 'scan', 'search', 'settings', 'shield-check', 'shopping-cart',
  'spray', 'stack', 'star', 'tag', 'target', 'temperature', 'tir', 'trash',
  'truck', 'upload', 'user', 'x',
] as const;
/* ICONE-FINE */

/** Il nome di un'icona che esiste davvero nello sprite. Un nome sbagliato non
    compila: prima usciva un quadratino, e nessuno se ne accorgeva. */
export type Icona = typeof ICONE[number];

const ESISTE = new Set<string>(ICONE);

/** `true` se il nome sta nello sprite. Serve al collaudo e ai punti in cui il
    nome arriva da un dato — la causale di un compito, il tipo di una zona —
    e non da una costante scritta a mano. */
export function esiste(nome: string): nome is Icona {
  return ESISTE.has(nome);
}

/** L'icona come stringa di markup.

    `aria` è il testo per chi legge con la voce. Vuoto (il caso normale) vuol
    dire che l'icona accompagna una parola che c'è già accanto, e ripeterla
    sarebbe rumore: allora l'icona sparisce dall'albero di accessibilità.
    Quando invece l'icona è SOLA — un pulsante con la sola matita — il nome va
    detto, altrimenti quel pulsante non ha nome.

    `classi` aggiunge misura o colore: `ico-lg`, `text-sx-danger`. La misura di
    serie segue il testo (`1.15em`), perché un'icona in mezzo a una riga deve
    crescere con la riga e non per conto suo. */
export function ico(nome: Icona, aria = '', classi = ''): string {
  const cls = classi ? `ico ${classi}` : 'ico';
  const acc = aria
    ? `role="img" aria-label="${aria.replace(/"/g, '&quot;')}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="${cls}" ${acc}><use href="#i-${nome}"/></svg>`;
}

/** LA STESSA ICONA, MA COME NODO — 2.29.2.

    `ico` restituisce markup, ed e' la forma giusta dentro un letterale di
    modello. Passata a `_h` non lo e': `_h` aggiunge un figlio stringa come
    NODO DI TESTO, quindi il markup finisce a video scritto per esteso. E'
    successo sui pulsanti Modifica ed Elimina dell'anagrafica articoli — su
    tutte e 11.181 le righe — e sul pulsante di stampa del registro. Trovato
    a video l'08/09.

    NON SI RISOLVE DENTRO `_h`. Se `_h` interpretasse le stringhe come markup,
    ogni descrizione di articolo e ogni motivo di quarantena che passa di li'
    diventerebbe markup a sua volta: e' il costruttore sicuro, e deve restare
    tale. Quel che mancava e' questa: l'icona nella forma che `_h` sa gia'
    trattare.

    `createElementNS` e non `createElement`: un `<svg>` costruito nel
    namespace HTML sta nell'albero e non si disegna, che e' il difetto di
    prima con un aspetto diverso — un buco bianco invece di una scritta. */
const NS_SVG = 'http://www.w3.org/2000/svg';

export function icoNodo(nome: Icona, aria = '', classi = ''): SVGSVGElement {
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('class', classi ? `ico ${classi}` : 'ico');
  if (aria) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', aria);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }
  const use = document.createElementNS(NS_SVG, 'use');
  use.setAttribute('href', '#i-' + nome);
  svg.appendChild(use);
  return svg;
}
