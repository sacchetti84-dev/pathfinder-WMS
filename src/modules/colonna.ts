/* LA COLONNA DI UN VANO — 2.22
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   A che altezza sta il vano che sto per prelevare. La scheda della tappa
   dice il codice — `MG1-SCA-04-06-2` — e chi è davanti allo scaffale deve
   tradurlo in un gesto: quale ripiano, contando da terra.

   QUI CI SONO SOLO GLI STATI. Gli altri livelli della campata dicono se
   sono vuoti, occupati, bloccati o riservati, e nient'altro: quello che
   c'è dentro un vano che non si deve toccare non serve a chi preleva, e
   sarebbe una riga in più da leggere in corsia con i guanti.

   L'UNICA COSA CHE SI GUARDA DENTRO è se lo STESSO articolo sta anche
   altrove nella campata con un lotto DIVERSO. Quello non è contesto: è il
   modo in cui una mano finisce sul pallet sbagliato, e la scansione del
   vano non ne salva — chi legge l'etichetta del livello sotto scansiona un
   codice valido, solo non è il suo. Si dice a parole, non disegnando il
   contenuto: vedi `rischioLotto`.

   SOLO LE SCAFFALATURE. Una zona a terra o alla rinfusa non ha livelli, e
   la sua colonna sarebbe un rettangolo solo — cioè il codice che chi
   guarda ha già letto in testa alla scheda. È la stessa regola della 2.1:
   la vista la decide la zona, e disegnare comunque vuol dire disegnare, su
   quelle zone, la cosa sbagliata. `colonnaDi` torna `null`.

   I CODICI NON SI COMPONGONO A MANO. I fratelli di un vano si prendono da
   `generaUbicazioni`, che è l'unico posto del progetto dove nasce un
   `location_code`: un id di zona può contenere un trattino, e spezzare la
   stringa darebbe una colonna plausibile e sbagliata.

   Modulo puro: entrano una geometria, una zona e due letture; non tocca
   `Store`, non tocca la cache, non scrive niente. */

import { generaUbicazioni } from '../core/geometria.js';
import type { Zona, Geometria } from '../types/entita.js';

/** Un vano della colonna, con lo stato e nient'altro. */
export interface VanoColonna {
  code: string;
  /** Il nome del livello come è configurato: 'T', '1', '2'… */
  level: string;
  /** `disabled` · `blocked` · `reserved` · `occupied` · `empty`. */
  stato: string;
  /** Il vano della tappa: è l'unico acceso. */
  tappa: boolean;
}

export interface Colonna {
  /** Dall'alto verso il basso, come si guarda una scaffalatura di fronte. */
  vani: VanoColonna[];
  /** Corsia e campata, per l'intestazione del disegno. */
  aisle: number;
  bay: number;
  /** I livelli che tengono lo stesso articolo con un lotto diverso. */
  rischioLotto: string[];
}

/** Una riga di giacenza, ridotta alle due cose che servono qui. */
interface RigaLetta { article_code?: string; lot_code?: string }

export interface DomandeColonna {
  /** Il vano della tappa. */
  code: string;
  geo: Geometria;
  /** La zona di quel vano. Assente o non a scaffale = nessuna colonna. */
  zona: Zona | null | undefined;
  stato: (code: string) => string;
  /** Le righe in un vano. Serve solo per `rischioLotto`. */
  righe: (code: string) => readonly RigaLetta[];
  /** L'articolo e il lotto della tappa. Assenti = niente avviso. */
  article_code?: string;
  lot_code?: string;
}

/**
 * La campata che contiene un vano, vista di fronte. `null` quando non c'è
 * niente di utile da disegnare: zona sconosciuta, zona non a scaffale, o
 * un codice che la geometria non riconosce.
 */
export function colonnaDi(d: DomandeColonna): Colonna | null {
  const g = d.geo.get(d.code);
  if (!g) return null;
  const zona = d.zona;
  if (!zona || zona.type !== 'RACK') return null;

  /* Stessa corsia, stessa campata: i livelli di quel montante. */
  const fratelli = generaUbicazioni(g.site_id, zona)
    .filter(l => l.aisle === g.aisle && l.bay === g.bay);
  /* Un livello solo non è una colonna: è il vano che si sta già leggendo. */
  if (fratelli.length < 2) return null;

  /* Dall'alto in basso, come la vista frontale della mappa: l'ordine è
     quello configurato, invertito — 'T' sta sotto '1' perché così è
     scritto in Configurazione, non perché venga prima in alfabeto. */
  const vani: VanoColonna[] = fratelli.map(l => ({
    code: l.code,
    level: l.level ?? '',
    stato: d.stato(l.code),
    tappa: l.code === d.code,
  })).reverse();

  return { vani, aisle: g.aisle, bay: g.bay, rischioLotto: rischio(d, vani) };
}

/* Lo stesso articolo, un lotto diverso, un altro livello di questa campata.
   Senza articolo o senza lotto non si accusa nessuno: un confronto contro
   `undefined` direbbe di sì su ogni vano occupato. */
function rischio(d: DomandeColonna, vani: readonly VanoColonna[]): string[] {
  const art = d.article_code, lotto = d.lot_code;
  if (!art || !lotto) return [];
  const out: string[] = [];
  for (const v of vani) {
    if (v.tappa) continue;
    const uguale = d.righe(v.code)
      .some(r => r.article_code === art && r.lot_code !== lotto);
    if (uguale) out.push(v.level);
  }
  return out;
}
