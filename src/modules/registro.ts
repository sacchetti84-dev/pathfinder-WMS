/* LE DUE DOMANDE CHE SI FANNO A UNA RIGA DEL REGISTRO — 2.16
   © Andrea Sacchetti — Dietopack S.r.l.

   Il registro si tiene sei anni ed è la firma di chi ha mosso la merce. Due
   domande gli si fanno sempre, e fino alla 2.15 ognuna aveva la sua risposta
   sparsa in cinque posti che non andavano d'accordo (voce 33).

   1 · QUANTO È CAMBIATA LA RIGA — `quantoSiEMosso`. Se i due estremi ci
       sono, è la loro differenza: l'aritmetica batte quel che ha passato il
       chiamante. Un `PICK` scriveva `null` fra before 10 e after 9.
   2 · QUANTI COLLI HANNO CAMBIATO POSTO — `quantitaMossa`. Non è la stessa
       cosa: un trasferimento di riga intera lascia la quantità dov'era e
       cambia il vano, quindi la variazione è 0 e i colli mossi sono tutti.
       Chi leggeva `Math.abs(qty_delta)` contava zero — il cruscotto e i KPI
       davano 0 colli a 22 trasferimenti veri, misurati sul dump del 31/08.

   Modulo puro: dipende solo dai tipi, come tutti quelli di `modules/`. */
import type { Movimento } from '../types/entita.js';

type Estremi = {
  qty_before?: number | null;
  qty_delta?: number | null;
  qty_after?: number | null;
};

/** La variazione della riga. `null` = movimento storico, non si sa. */
export function quantoSiEMosso(m: Estremi): number | null {
  const prima = m.qty_before, dopo = m.qty_after;
  if (typeof prima === 'number' && typeof dopo === 'number') return dopo - prima;
  return (typeof m.qty_delta === 'number') ? m.qty_delta : null;
}

/**
 * Quanti colli hanno cambiato posto. `null` quando la riga non lo dice —
 * e `null` non è zero: zero è «non si è mosso niente», null è «non si sa».
 */
export function quantitaMossa(m: Pick<Movimento, 'qty_delta' | 'qty_before' | 'dest_location'>): number | null {
  const delta = m.qty_delta;
  if (typeof delta !== 'number') return null;
  if (delta !== 0) return Math.abs(delta);
  /* Variazione zero e una destinazione: la riga intera ha cambiato vano. */
  if (m.dest_location && typeof m.qty_before === 'number') return m.qty_before;
  return 0;
}
