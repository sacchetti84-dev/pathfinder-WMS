/* IL CALENDARIO DELLE SPEDIZIONI — 2.34
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   L'ufficio sa che cosa deve partire e quando: lo scrive sul DDT, nella data
   di ritiro previsto. Ma quel dato viveva in una colonna di una tabella
   ordinata per data di emissione, e «che cosa parte giovedì» si rispondeva
   scorrendo l'elenco con gli occhi. Una settimana disegnata risponde a
   quella domanda in un colpo, ed è la sola ragione per cui questo modulo
   esiste.

   SI USA LA DATA CHE C'È GIÀ — `expected_pickup_date`. Non è un ripiego: è
   il campo su cui il cruscotto calcola i suoi avvisi dalla 2.0, e
   inventarne un secondo vorrebbe dire due date della stessa cosa che
   divergono al primo che si dimentica di aggiornarne una.

   SENZA ORA, ED È UNA SCELTA. Il vettore passa «in mattinata», non alle
   9:40: un'ora scritta sarebbe una precisione che nessuno ha, e una griglia
   a fasce orarie mostrerebbe vuoto il novanta per cento di sé.

   QUESTO MODULO NON GUARDA NIENTE. Entrano i documenti, esce una griglia di
   settimane: nessuno Store, nessuna data di sistema se non quella che gli
   si passa. È l'unico modo di provare un calendario senza aspettare
   mercoledì. */

import type { DocumentoUscita } from '../types/entita';

export interface GiornoCalendario {
  /** `YYYY-MM-DD`. */
  iso: string;
  giorno: number;
  /** Fuori dal mese chiesto: le code della prima e dell'ultima settimana. */
  fuori: boolean;
  oggi: boolean;
  documenti: DocumentoUscita[];
}

/** Una settimana, sempre di sette giorni, da lunedì a domenica. */
export type SettimanaCalendario = GiornoCalendario[];

const due = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` di una data, in ora LOCALE.

    `toISOString()` converte in UTC, e alle 00:30 del 3 marzo in Italia
    restituisce il 2: un documento in scadenza comparirebbe il giorno prima.
    È lo stesso motivo per cui le date del documento sono stringhe e non
    istanti. */
export function isoLocale(d: Date): string {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

/** Il lunedì della settimana che contiene una data.

    `getDay()` mette la domenica a 0; qui la settimana comincia di lunedì,
    come in un magazzino italiano. */
function lunediDi(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const giorno = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - giorno);
  return x;
}

/** I documenti raggruppati per giorno di ritiro previsto.

    QUEL CHE NON HA UNA DATA NON HA UN GIORNO, e non se ne inventa uno: un
    DDT senza ritiro previsto è un DDT che nessuno ha ancora programmato, e
    metterlo su oggi lo farebbe sembrare urgente. Chi lo vuole vedere lo
    trova in `senzaData`. */
export function perGiorno(
  documenti: readonly DocumentoUscita[] | null | undefined,
): { mappa: Map<string, DocumentoUscita[]>; senzaData: DocumentoUscita[] } {
  const mappa = new Map<string, DocumentoUscita[]>();
  const senzaData: DocumentoUscita[] = [];
  for (const d of documenti || []) {
    if (!d) continue;
    const iso = String(d.expected_pickup_date || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) { senzaData.push(d); continue; }
    const gia = mappa.get(iso);
    if (gia) gia.push(d); else mappa.set(iso, [d]);
  }
  return { mappa, senzaData };
}

/** La griglia di un mese: sempre settimane intere, sempre di lunedì.

    LE CODE DEL MESE PRECEDENTE E DEL SEGUENTE CI SONO, marcate `fuori`. Un
    calendario che comincia di mercoledì con tre caselle vuote costringe a
    contare le colonne per capire che giorno è; e una spedizione del 1°
    ottobre, guardando settembre, è esattamente quella che interessa a chi
    sta programmando la settimana. */
export function grigliaMese(
  anno: number,
  mese: number,                       // 1-12, come lo dice una persona
  documenti: readonly DocumentoUscita[] | null | undefined,
  adesso: Date = new Date(),
): SettimanaCalendario[] {
  const { mappa } = perGiorno(documenti);
  const isoOggi = isoLocale(adesso);
  const primo = new Date(anno, mese - 1, 1);
  const ultimo = new Date(anno, mese, 0);
  const cursore = lunediDi(primo);
  const fine = lunediDi(ultimo);

  const settimane: SettimanaCalendario[] = [];
  /* Si va avanti FINCHÉ il lunedì corrente non ha superato quello
     dell'ultimo giorno: così l'ultima settimana entra intera, anche quando
     il mese finisce di martedì. */
  while (cursore <= fine) {
    const settimana: SettimanaCalendario = [];
    for (let i = 0; i < 7; i++) {
      const iso = isoLocale(cursore);
      settimana.push({
        iso,
        giorno: cursore.getDate(),
        fuori: cursore.getMonth() !== mese - 1,
        oggi: iso === isoOggi,
        documenti: mappa.get(iso) || [],
      });
      cursore.setDate(cursore.getDate() + 1);
    }
    settimane.push(settimana);
  }
  return settimane;
}

/** Il mese prima e quello dopo, senza sbagliare a dicembre. */
export function mesePrecedente(anno: number, mese: number): { anno: number; mese: number } {
  return mese <= 1 ? { anno: anno - 1, mese: 12 } : { anno, mese: mese - 1 };
}

export function meseSeguente(anno: number, mese: number): { anno: number; mese: number } {
  return mese >= 12 ? { anno: anno + 1, mese: 1 } : { anno, mese: mese + 1 };
}

export const NOMI_MESE = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
] as const;

export const NOMI_GIORNO = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;

/** Quanti documenti e quanti colli, in un giorno. Serve al riquadro della
    casella, che ha spazio per due numeri e non per un elenco. */
export function riepilogoGiorno(
  g: GiornoCalendario | null | undefined,
): { documenti: number; colli: number; evasi: number } {
  let colli = 0;
  let evasi = 0;
  for (const d of g?.documenti || []) {
    for (const l of d.lines || []) colli += Number(l?.qty) || 0;
    if (String(d.status) === 'evaded') evasi++;
  }
  return { documenti: (g?.documenti || []).length, colli, evasi };
}
