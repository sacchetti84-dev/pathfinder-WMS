/* UN CAMPO UBICAZIONE ACCETTA ANCHE UN'UNITÀ DI CARICO — 2.36
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   CHE COSA HA IN MANO L'OPERATORE. Davanti a un bancale imballato l'unica
   etichetta leggibile è quella dell'unità: il codice del vano sta sul
   montante dello scaffale, e su una banchina o in zona imballaggio spesso
   non c'è proprio. Chiedere «scansiona l'ubicazione» a chi ha in mano un
   pallet vuol dire chiedergli di cercare un cartello.

   Andrea, l'08/09: «quando c'è un campo ubicazione, questo deve accettare
   anche le UDC». Il codice dell'unità si risolve nel vano DOVE QUELL'UNITÀ
   STA ADESSO, e da lì in poi il campo si comporta come se ci fosse scritto
   quel vano. Non è un secondo significato del campo: è la stessa domanda —
   «quale vano?» — a cui si può rispondere in due modi.

   ── L'ORDINE DI LETTURA, E PERCHÉ È QUESTO ────────────────────────────
   Un codice UDC passa la stessa forma di un codice di ubicazione — sono
   tutti e due gruppi di lettere e cifre separati da trattini — quindi la
   forma non basta a distinguerli e la domanda va fatta ai dati. Si guarda
   PRIMA se il codice è un'ubicazione vera: un magazzino che battezzasse un
   vano come un'unità continuerebbe a funzionare, e il vano vincerebbe, che
   è la risposta meno sorprendente per chi ci lavora.

   ── LA RISPOSTA È POSITIVA SOLO SE L'UNITÀ È DAVVERO DA QUALCHE PARTE ──
   È la condizione che Andrea ha scritto nella stessa riga. Un'unità appena
   creata e non ancora posata non ha ubicazione: risolverla vorrebbe dire
   inventare un vano. Un'unità spedita è uscita dal magazzino. In tutti e due
   i casi il campo non si riempie e il motivo si dice.

   PURO: non conosce lo Store. Chi chiama porta due domande — «questo codice
   è un'ubicazione?» e «questo codice è un'unità, e dove sta?» — perché sono
   le uniche due cose che servono, e passarle rende questa regola provabile
   da ferma. */

/** L'unità di carico, per quel poco che serve a questa decisione. */
export interface UnitaCercata {
  udc_id: string;
  location_code?: string | null;
  status?: string | null;
}

export interface VanoRisolto {
  /** Il vano da usare. Stringa vuota quando non si è risolto. */
  vano: string;
  /** L'unità da cui ci si è arrivati, quando è stata scansionata una. `null`
      se il codice era già un'ubicazione: serve a dirlo a video, perché chi
      scansiona un pallet deve vedere dove il sistema ha capito di andare. */
  udc: string | null;
  /** Perché non si è risolto. Stringa vuota quando `vano` c'è. */
  motivo: string;
}

export interface Fonti {
  /** Vero se questo codice è un'ubicazione esistente. */
  eUbicazione: (code: string) => boolean;
  /** L'unità con questo codice, o `null`. */
  udc: (code: string) => UnitaCercata | null | undefined;
}

const pulisci = (v: unknown): string => String(v ?? '').trim().toUpperCase();

export function risolviVano(scritto: unknown, fonti: Fonti): VanoRisolto {
  const code = pulisci(scritto);
  if (!code) return { vano: '', udc: null, motivo: 'Indica un’ubicazione o un’unità di carico' };

  if (fonti.eUbicazione(code)) return { vano: code, udc: null, motivo: '' };

  const u = fonti.udc(code);
  if (!u) {
    return { vano: '', udc: null, motivo: `${code} non è né un’ubicazione né un’unità di carico` };
  }

  const stato = pulisci(u.status);
  if (stato === 'SHIPPED') {
    return { vano: '', udc: u.udc_id, motivo: `${u.udc_id} è partita: non è più in magazzino` };
  }

  const dove = pulisci(u.location_code);
  if (!dove) {
    return { vano: '', udc: u.udc_id, motivo: `${u.udc_id} non è ubicata da nessuna parte: va posata prima` };
  }

  return { vano: dove, udc: u.udc_id, motivo: '' };
}

/** Quel che si scrive a video quando il vano è stato ricavato da un'unità.
    Vuoto quando il codice era già un'ubicazione: non c'è niente da spiegare. */
export function spiegaVano(r: VanoRisolto | null | undefined): string {
  if (!r?.vano || !r.udc) return '';
  return `${r.udc} sta in ${r.vano}`;
}
