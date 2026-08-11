/* LE UBICAZIONI NON SONO UN DATO: SONO UNA CONSEGUENZA.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Secondo blocco della conversione di `store.js` (PIANO-1.4 §3). Come il
   primo, qui non c'è niente di nuovo: è il codice che stava in `Store`,
   spostato e tipizzato, e le 16 prove di `test/geometria.test.js` — che
   passano da `Store` e non da qui — sono ciò che dimostra che non si è mosso.

   PERCHÉ NON SI SCRIVONO A DATABASE. Duemila celle sarebbero duemila righe da
   tenere allineate a mano ogni volta che una zona cambia forma. Invece la zona
   dichiara la propria geometria — corsie, campate, livelli — e le ubicazioni
   si generano. Aggiungere una campata è cambiare un numero in Configurazione.

   PERCHÉ È UN BLOCCO A SÉ. Non tocca la cache, non tocca il supporto, non
   tocca `Persistence`: entrano siti e zone, escono codici. È l'unico posto del
   progetto dove nasce un `location_code`, e da qui lo leggono la mappa, il
   percorso a serpentina, le statistiche e la verifica di stoccaggio. */

import type { Sito, Zona, Coordinate, Geometria } from '../types/entita.js';

/** Una posizione generata. I campi cambiano con il tipo di zona: la
    scaffalatura ha corsia/campata/livello, il pavimento fila/posizione, la
    rinfusa la sola posizione. Solo `code` c'è sempre. */
export interface Ubicazione {
  code: string;
  aisle?: number;
  bay?: number;
  level?: string;
  row?: number;
  position?: number;
}

/** Due cifre. La decina non cambia formato: la campata 10 è `10`, non `010`. */
const due = (n: number): string => String(n).padStart(2, '0');

/* I tre tipi di zona, e nient'altro. Una zona di tipo sconosciuto genera zero
   ubicazioni invece di indovinarne una forma: meglio una zona che non compare
   sulla mappa di una zona che compare sbagliata. */
export function generaUbicazioni(siteId: string, zona: Zona): Ubicazione[] {
  const locs: Ubicazione[] = [];
  const prefix = `${siteId}-${zona.id}`;

  if (zona.type === 'RACK') {
    const aisles = (zona.aisles as number) || 1;
    const bays = (zona.bays_per_aisle as number) || 1;
    const levels = (zona.levels as string[]) || ['T'];
    for (let a = 1; a <= aisles; a++) {
      for (let b = 1; b <= bays; b++) {
        for (const lvl of levels) {
          locs.push({ code: `${prefix}-${due(a)}-${due(b)}-${lvl}`, aisle: a, bay: b, level: lvl });
        }
      }
    }
  } else if (zona.type === 'FLOOR') {
    const rows = (zona.rows as number) || 1;
    const perRow = (zona.positions_per_row as number) || 1;
    for (let r = 1; r <= rows; r++) {
      for (let p = 1; p <= perRow; p++) {
        locs.push({ code: `${prefix}-${due(r)}-${due(p)}`, row: r, position: p });
      }
    }
  } else if (zona.type === 'BULK') {
    const posizioni = (zona.positions as number) || 1;
    for (let p = 1; p <= posizioni; p++) {
      locs.push({ code: `${prefix}-${due(p)}`, position: p });
    }
  }
  return locs;
}

/** Le zone attive di un sito attivo. Filtrare qui e non nei chiamanti è ciò
    che tiene allineati l'indice delle ubicazioni valide e la geometria: se
    divergessero, `locationExists` direbbe di sì su una cella che la mappa non
    disegna. */
function zoneAttive(sito: Sito): Zona[] {
  return (sito.zones || []).filter(z => z.active);
}

/** L'insieme dei codici che esistono davvero. È ciò contro cui si valida una
    scansione: un codice fuori di qui non è un'ubicazione, è un errore di
    lettura del barcode. */
export function codiciAttivi(siti: readonly Sito[]): Set<string> {
  const out = new Set<string>();
  for (const sito of siti) {
    if (!sito.active) continue;
    for (const zona of zoneAttive(sito)) {
      for (const loc of generaUbicazioni(sito.id, zona)) out.add(loc.code);
    }
  }
  return out;
}

/* Codice ubicazione → dove si trova. È ciò su cui lavora la serpentina, e per
   questo le coordinate NON si leggono dal codice: un id di zona può contenere
   un trattino, e spezzare la stringa darebbe un percorso plausibile e
   sbagliato. Si generano insieme al codice, dalla stessa sorgente. */
export function costruisciGeometria(siti: readonly Sito[]): Geometria {
  const geo: Geometria = new Map<string, Coordinate>();
  for (const sito of siti) {
    if (!sito.active) continue;
    /* Il numero d'ordine della zona è la sua posizione fra le ATTIVE, non
       nell'elenco completo: è l'ordine in cui l'operatore le percorre. */
    zoneAttive(sito).forEach((zona, zoneIdx) => {
      const levels = (zona.levels as string[]) || ['T'];
      for (const loc of generaUbicazioni(sito.id, zona)) {
        geo.set(loc.code, {
          site_id: sito.id,
          zone_id: zona.id,
          zone_idx: zoneIdx,
          type: zona.type as string,
          aisle: loc.aisle ?? loc.row ?? 0,
          bay: loc.bay ?? loc.position ?? 0,
          level: loc.level ?? '',
          /* Il livello pesa per la sua posizione in elenco, non per il nome:
             'T' sotto '1' sotto '2' perché così sono configurati, non perché
             'T' venga prima in ordine alfabetico. */
          level_idx: loc.level ? Math.max(0, levels.indexOf(loc.level)) : 0,
        });
      }
    });
  }
  return geo;
}
