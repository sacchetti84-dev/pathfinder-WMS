/* LO SCHEDULATORE, LA PARTE CHE NON TOCCA NIENTE — 1.4.1, PIANO §4.1.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Le attività che questo modulo mette in coda l'applicativo le sa già fare
   tutte: qui non nasce nessuna operazione nuova. Nascono la RICHIESTA, la
   CODA e la MISURA — cioè le tre cose che oggi vivono a voce.

   Nessuno stato, nessun accesso a Store, nessun DOM: entrano compiti, escono
   ordinamenti e conti. È la stessa forma di `pickRoute` e `conformita`, ed è
   quello che permette di collaudarlo per intero senza aprire il browser —
   `test/compiti.test.js`. */

import type { Compito, Istante } from '../types/entita.js';

/* ── Le tabelle ─────────────────────────────────────────────────────── */

/* Gli otto tipi del piano. Sette esistono già come operazione: il
   campionamento è l'unico che nasce qui, ed è il motivo per cui sta
   nell'elenco e non fra le cose da fare dopo. */
export const TIPI_COMPITO = {
  TRANSFER:   { label: 'Trasferimento',   icona: '↔' },
  PICK_SHIP:  { label: 'Prelievo spedizione', icona: '🚚' },
  PICK_RET:   { label: 'Prelievo reso',   icona: '↩' },
  QUARANTINE: { label: 'Blocco quarantena', icona: '🚫' },
  SAMPLING:   { label: 'Campionamento',   icona: '🧪' },
  DISPOSAL:   { label: 'Smaltimento',     icona: '🗑' },
  PUTAWAY:    { label: 'Posizionamento',  icona: '📥' },
  COUNT:      { label: 'Conta',           icona: '🔢' },
} as const;

export type TipoCompito = keyof typeof TIPI_COMPITO;

/* Il numero cresce con l'urgenza: «alzare la priorità» è alzare il numero,
   che è come lo dice chi la chiede. */
export const PRIORITA: Record<number, string> = {
  1: 'Bassa', 2: 'Normale', 3: 'Alta', 4: 'Urgente',
};
export const PRIORITA_NORMALE = 2;
/* Oltre questa, serve un Team Leader — decisione D4 del 12/08. */
export const PRIORITA_MAX_OPERATORE = 2;

export const STATI: Record<string, string> = {
  requested: 'In coda', assigned: 'Assegnato', in_progress: 'In corso',
  done: 'Completato', cancelled: 'Annullato',
};

export const STATI_APERTI = ['requested', 'assigned', 'in_progress'] as const;
export type StatoAperto = typeof STATI_APERTI[number];

export const etichettaTipo = (t: string): string =>
  (TIPI_COMPITO as Record<string, { label: string }>)[t]?.label ?? String(t);
export const iconaTipo = (t: string): string =>
  (TIPI_COMPITO as Record<string, { icona: string }>)[t]?.icona ?? '•';
export const etichettaPriorita = (p: number): string => PRIORITA[p] ?? String(p);
export const etichettaStato = (s: string): string => STATI[s] ?? String(s);

/* ── Il ciclo di vita ───────────────────────────────────────────────── */

/* Da uno stato CHIUSO non esce nessuna freccia, e non è una dimenticanza:
   un compito concluso è un fatto, e i tempi che ne escono sono la misura di
   questa versione. Se si è sbagliato se ne apre un altro — la storia non si
   riscrive, come per i movimenti. */
const TRANSIZIONI: Record<string, readonly string[]> = {
  requested:   ['assigned', 'in_progress', 'cancelled'],
  assigned:    ['requested', 'in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done:        [],
  cancelled:   [],
};

export function transizioneAmmessa(da: string, a: string): boolean {
  return (TRANSIZIONI[da] ?? []).includes(a);
}

export function eAperto(c: Pick<Compito, 'status'> | null | undefined): boolean {
  return !!c && (STATI_APERTI as readonly string[]).includes(c.status);
}

/* ── La richiesta ───────────────────────────────────────────────────── */

export interface Richiesta {
  type: string;
  requested_by: string;
  priority?: number;
  assigned_to?: string | null;
  due_at?: Istante | null;
  payload?: unknown;
  source_ref?: string | null;
  note?: string;
}

/** Gli errori, in chiaro e tutti insieme: chi compila una maschera vuole
    sapere cosa manca, non cosa manca per primo. Vuoto = si può aprire. */
export function validaRichiesta(r: Partial<Richiesta>, adesso: Istante = Date.now()): string[] {
  const errori: string[] = [];
  if (!r.type || !(r.type in TIPI_COMPITO)) errori.push(`Tipo di attività non previsto: ${r.type ?? '—'}`);
  if (!String(r.requested_by ?? '').trim()) errori.push('Manca la sigla di chi richiede');
  if (r.priority !== undefined && r.priority !== null) {
    const p = Number(r.priority);
    if (!Number.isInteger(p) || p < 1 || p > 4) errori.push('La priorità è un numero da 1 a 4');
  }
  if (r.due_at && r.due_at < adesso) errori.push('La scadenza è già passata');
  return errori;
}

/* IL VARCO NON È LA MODIFICA, È LA CREAZIONE.
   Se un operatore potesse APRIRE un compito urgente, «la priorità la alza
   solo il Team Leader» sarebbe una frase e non una regola: aprirebbe tutto
   a 4 e la coda tornerebbe a essere l'ordine in cui si è chiesto. */
export function prioritaConsentita(ruolo: string | null | undefined, priorita: number): boolean {
  return ruolo === 'leader' ? priorita >= 1 && priorita <= 4 : priorita <= PRIORITA_MAX_OPERATORE;
}

/** Il record come va a database. L'identificativo lo genera chi scrive:
    qui non si inventa niente che non sia già nella richiesta. */
export function componiCompito(r: Richiesta, task_id: string, adesso: Istante = Date.now()): Compito {
  const assegnato = String(r.assigned_to ?? '').toUpperCase().trim() || null;
  const c: Compito = {
    task_id,
    type: r.type,
    priority: Number(r.priority) || PRIORITA_NORMALE,
    /* Un compito che nasce a nome di qualcuno nasce assegnato: lasciarlo in
       coda con dentro una sigla sarebbe un compito che aspetta se stesso. */
    status: assegnato ? 'assigned' : 'requested',
    requested_by: String(r.requested_by).toUpperCase().trim(),
    requested_at: adesso,
    assigned_to: assegnato,
    started_at: null,
    completed_at: null,
    due_at: r.due_at ?? null,
    source_ref: r.source_ref ?? null,
  };
  if (r.payload !== undefined && r.payload !== null) c.payload = r.payload;
  const note = String(r.note ?? '').trim();
  if (note) c.note = note;
  return c;
}

/* ── La coda ────────────────────────────────────────────────────────── */

/* L'ordine in cui si prende il prossimo compito, e le tre domande in ordine:
   quanto scotta, entro quando, da quanto aspetta. La scadenza viene prima
   dell'anzianità perché è una promessa fatta a qualcuno; l'anzianità è
   l'ultima parola, ed è ciò che impedisce a un compito senza scadenza di
   restare in fondo per sempre. */
export function ordinaCoda(compiti: readonly Compito[] | null | undefined): Compito[] {
  return (compiti ?? []).filter(eAperto).slice().sort((a, b) =>
    (b.priority || 0) - (a.priority || 0)
    || (a.due_at ?? Infinity) - (b.due_at ?? Infinity)
    || (a.requested_at || 0) - (b.requested_at || 0));
}

/* ── Le misure ──────────────────────────────────────────────────────── */

export interface Misure {
  /** Quanto è stato in coda: fino all'avvio, o fino ad adesso se è ancora lì. */
  attesa: number | null;
  /** Quanto è durato: fino alla chiusura, o fino ad adesso se è in corso. */
  durata: number | null;
  /** Dalla richiesta alla conclusione. Solo sui compiti conclusi bene. */
  totale: number | null;
}

/* Un compito ANNULLATO non ha «durato»: metterlo nella media di lavorazione
   la abbasserebbe con del lavoro che nessuno ha fatto. L'attesa invece resta
   vera — in coda c'è stato davvero. */
export function misure(c: Partial<Compito> | null | undefined, adesso: Istante = Date.now()): Misure {
  const vuote: Misure = { attesa: null, durata: null, totale: null };
  if (!c || !c.requested_at) return vuote;
  const aperto = eAperto(c as Compito);
  const fine = c.started_at ?? (aperto ? adesso : null);
  const attesa = fine === null ? null : fine - c.requested_at;
  if (c.status === 'cancelled') return { ...vuote, attesa };
  let durata: number | null = null;
  if (c.started_at) {
    const chiusura = c.completed_at ?? (aperto ? adesso : null);
    if (chiusura !== null) durata = chiusura - c.started_at;
  }
  const totale = c.status === 'done' && c.completed_at ? c.completed_at - c.requested_at : null;
  return { attesa, durata, totale };
}

export function inRitardo(c: Partial<Compito> | null | undefined, adesso: Istante = Date.now()): boolean {
  return !!c?.due_at && eAperto(c as Compito) && c.due_at < adesso;
}

/* ── Il riepilogo ───────────────────────────────────────────────────── */

export interface Riepilogo {
  totale: number;
  aperti: number;
  conclusi: number;
  perStato: Record<string, number>;
  /** Solo gli aperti: a un cruscotto interessa cosa c'è da fare, non cosa è stato. */
  perTipo: Record<string, number>;
  urgenti: number;
  inRitardo: number;
  attesaMedia: number | null;
  durataMedia: number | null;
  attesaMassima: number | null;
  piuVecchio: Compito | null;
}

/* LA TRAPPOLA DEL PIANO §4.1, e il motivo per cui questa funzione esiste dal
   primo giorno e non nella versione dopo: «uno schedulatore che nessuno
   chiude è una lista che invecchia». `piuVecchio` è la riga che lo dice.

   Le medie girano sui soli compiti CONCLUSI BENE — sono gli unici che hanno
   un inizio e una fine — e assenti significa «non ne è ancora finito
   nessuno», che è diverso da zero. */
export function riepilogo(
  compiti: readonly Compito[] | null | undefined,
  adesso: Istante = Date.now(),
): Riepilogo {
  const tutti = compiti ?? [];
  const perStato: Record<string, number> = {
    requested: 0, assigned: 0, in_progress: 0, done: 0, cancelled: 0,
  };
  const perTipo: Record<string, number> = {};
  let aperti = 0, urgenti = 0, ritardi = 0;
  let sommaAttesa = 0, sommaDurata = 0, conclusi = 0;
  let attesaMassima: number | null = null;
  let piuVecchio: Compito | null = null;

  for (const c of tutti) {
    perStato[c.status] = (perStato[c.status] ?? 0) + 1;
    if (eAperto(c)) {
      aperti++;
      perTipo[c.type] = (perTipo[c.type] ?? 0) + 1;
      if (c.priority >= 4) urgenti++;
      if (inRitardo(c, adesso)) ritardi++;
      const attesa = misure(c, adesso).attesa;
      if (attesa !== null && (attesaMassima === null || attesa > attesaMassima)) {
        attesaMassima = attesa;
        piuVecchio = c;
      }
    } else if (c.status === 'done') {
      const m = misure(c, adesso);
      if (m.attesa !== null && m.durata !== null) {
        sommaAttesa += m.attesa;
        sommaDurata += m.durata;
        conclusi++;
      }
    }
  }

  return {
    totale: tutti.length,
    aperti,
    conclusi,
    perStato,
    perTipo,
    urgenti,
    inRitardo: ritardi,
    attesaMedia: conclusi ? Math.round(sommaAttesa / conclusi) : null,
    durataMedia: conclusi ? Math.round(sommaDurata / conclusi) : null,
    attesaMassima,
    piuVecchio,
  };
}

/* Durate in forma leggibile. Sta qui e non nella UI perché la stessa misura
   compare nel cruscotto, nell'elenco e nell'export: tre formattazioni
   diverse dello stesso numero sono tre numeri diversi, per chi legge. */
export function durataUmana(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const ore = Math.floor(min / 60);
  const resto = min % 60;
  if (ore < 24) return resto ? `${ore} h ${resto} min` : `${ore} h`;
  const giorni = Math.floor(ore / 24);
  return `${giorni} g ${ore % 24} h`;
}
