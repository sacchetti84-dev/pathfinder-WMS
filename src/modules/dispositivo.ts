/* SU CHE COSA STA GIRANDO — 1.11.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   L'applicativo nasce su un monitor da scrivania e si usa su un terminale:
   l'MC9400 ha un 4,3" da 800×480, che in CSS sono fra i 400 e i 533 px di
   larghezza — sotto ogni media query che l'applicativo aveva fino alla 1.10,
   dove la più bassa stava a 700. Su quello schermo la pagina si vedeva
   intera e sbagliata: margini da scrivania su una striscia di vetro.

   La manopola c'è dal 18/08 ed è una sola — `--spacing`, i decimi di rem di
   `00-tailwind.css`. Quel che mancava era CHI la gira, e questo modulo è la
   regola: entrano le misure e la stringa del browser, esce il nome della
   classe di dispositivo. Nient'altro.

   A DECIDERE È LA LARGHEZZA, NON IL SISTEMA OPERATIVO. Android si riconosce
   e si registra — la 1.11 lo chiede — ma un terminale è tale perché lo
   schermo è stretto: la stessa pagina in una finestra da 500 px ha lo stesso
   problema, e risolverlo per uno solo dei due casi vorrebbe dire scrivere
   due volte le stesse regole.

   Nessuno stato, nessun accesso a Store, nessun DOM: le misure gliele passa
   chi lo chiama. Collaudato da fermo in `test/dispositivo.test.js`. */

export type ClasseDispositivo = 'terminale' | 'tavoletta' | 'scrivania';

/** Quel che serve per decidere. Tutto facoltativo: da un ambiente che non
    dice niente esce «scrivania», che è l'interfaccia di sempre — davanti a
    un dubbio non si stringe niente. */
export interface Ambiente {
  userAgent?: string | null;
  /** Larghezza in px CSS, cioè `innerWidth`: non i pixel fisici. */
  larghezza?: number | null;
  altezza?: number | null;
  /** Vero se il vetro si tocca — `maxTouchPoints > 0`. */
  touch?: boolean | null;
}

/** Sopra questa larghezza non è più un terminale. 560 e non 533: l'MC9400 in
    orizzontale sta a 533, e un margine di ventisette pixel evita che un
    arrotondamento del browser faccia cambiare interfaccia a metà turno. */
export const LARGHEZZA_TERMINALE = 560;

/** Sopra questa, con un dito che tocca, è una scrivania a tutti gli effetti. */
export const LARGHEZZA_TAVOLETTA = 1024;

/** Se il browser dichiara Android. Non decide il layout — lo decide la
    larghezza — ma è il fatto che la 1.11 chiede di riconoscere, e serve a
    chi legge un registro per sapere da che macchina è arrivato un gesto. */
export function eAndroid(userAgent: string | null | undefined): boolean {
  return /android/i.test(String(userAgent ?? ''));
}

/** Il terminale da magazzino: schermo stretto, un dito solo, guanti. */
export function classifica(a: Ambiente | null | undefined): ClasseDispositivo {
  const larghezza = Number(a?.larghezza);
  if (!Number.isFinite(larghezza) || larghezza <= 0) return 'scrivania';
  if (larghezza <= LARGHEZZA_TERMINALE) return 'terminale';
  const tocca = Boolean(a?.touch) || eAndroid(a?.userAgent);
  if (tocca && larghezza <= LARGHEZZA_TAVOLETTA) return 'tavoletta';
  return 'scrivania';
}

/** La classe che finisce sul `body`. Una per volta: si toglie l'altra prima
    di metterla, e le regole di stile stanno in `01-layout.css`. */
export function classeCSS(c: ClasseDispositivo): string {
  return `dispositivo-${c}`;
}

/** Tutte le classi che questo modulo può mettere, per toglierle prima di
    riscriverne una: un dispositivo che ruota cambia classe, e due classi
    insieme sono due interfacce sovrapposte. */
export function classiPossibili(): string[] {
  return (['terminale', 'tavoletta', 'scrivania'] as ClasseDispositivo[]).map(classeCSS);
}
