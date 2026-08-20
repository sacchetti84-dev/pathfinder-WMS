/* ORDINARE E FILTRARE UNA TABELLA — 2.1.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   §3 della richiesta del 19/08/2026: «Tutte le tabelle, registri, elenchi e
   griglie di archivio DEVONO avere colonne ordinabili e filtri di ricerca
   avanzati». Fino alla 2.0 due tabelle su nove ce li avevano, ognuna coi
   suoi: `configArticoli` ordinava con `_artSort`, `registro` filtrava con
   le sue quattro condizioni, e le altre sette si leggevano tutte.

   Qui c'è la regola, una volta sola e pura. Le viste ci passano le righe e
   la dichiarazione delle colonne; il markup lo costruiscono loro, perché il
   markup di questo applicativo nasce da stringhe dentro le viste e un
   componente qui non avrebbe dove attaccarsi.

   TRE COSE CHE SEMBRANO DETTAGLI E NON LO SONO:

   1. **L'ordinamento è STABILE.** Ordinando per stato, due righe con lo
      stesso stato devono restare nell'ordine in cui erano — che nelle
      tabelle di questo applicativo è quasi sempre quello cronologico. Un
      ordinamento instabile fa ballare le righe a ogni ridisegno, e chi sta
      leggendo perde il segno. `Array.prototype.sort` è stabile per
      specifica da ES2019, ma qui il confronto restituisce 0 sui pari
      APPOSTA: chi aggiunge un criterio di spareggio lo fa sapendo perché.

   2. **Il vuoto va in fondo, in tutti e due i versi.** Una data mancante
      non è «molto vecchia» né «molto recente»: è assente. Mandarla in cima
      ordinando per scadenza vorrebbe dire che la prima cosa che si legge in
      una tabella FEFO è la riga di cui non si sa niente.

   3. **I numeri si confrontano da numeri, le date da date, il resto con le
      regole dell'italiano.** «10» prima di «9» è quello che succede
      confrontando testo, ed è il difetto che fa sembrare rotta una tabella
      che funziona.

   Nessuno stato, nessun DOM, nessun accesso a Store. Collaudato da fermo in
   `test/tabella.test.js`. */

export type Verso = 'asc' | 'desc';

/** Come si legge una colonna. `testo` è il ripiego, e usa `localeCompare`
    con la collazione italiana: le accentate stanno dove uno se le aspetta. */
export type TipoColonna = 'testo' | 'numero' | 'data';

export interface Colonna<R = Record<string, unknown>> {
  /** L'identificativo che finisce nel gestore del clic. */
  campo: string;
  /** L'intestazione che si legge. */
  titolo: string;
  tipo?: TipoColonna;
  /** Il valore da confrontare, quando non è `riga[campo]`. */
  valore?: (riga: R) => unknown;
  /** Falso su una colonna che non ha un ordine sensato — un pulsante, un
      gruppo di azioni. Di serie è vero. */
  ordinabile?: boolean;
  /** Il testo su cui cerca il filtro. Assente = quello dell'ordinamento. */
  cercabile?: boolean;
}

export interface Stato {
  campo: string | null;
  verso: Verso;
  /** Il testo digitato nella casella di ricerca. */
  cerca: string;
  /* Le viste tengono questo stato come una loro proprieta', e il tipo
     `Vista` ammette solo forme che si possono indicizzare per nome. E'
     lo stesso varco dichiarato di `SessionePrelievo`, largo una riga. */
  [altro: string]: unknown;
}

export const STATO_VUOTO: Stato = Object.freeze({ campo: null, verso: 'asc', cerca: '' });

function valoreDi<R>(riga: R, col: Colonna<R>): unknown {
  return col.valore ? col.valore(riga) : (riga as Record<string, unknown>)[col.campo];
}

/** Vero quando il valore non c'è: `null`, `undefined`, stringa vuota. Lo
    zero e il falso NON sono vuoti — sono risposte. */
export function eVuoto(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function comeNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function comeData(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim();
  if (!s) return null;
  /* `gg/mm/aaaa` è quello che l'applicativo mostra; `aaaa-mm-gg` è quello
     che scrive. Le due si leggono tutte e due, e il resto lo tenta `Date`. */
  const it = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (it) return Date.UTC(Number(it[3]), Number(it[2]) - 1, Number(it[1]));
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Il confronto di una colonna, nel verso chiesto. Restituisce 0 sui pari:
    la stabilità dell'ordinamento la garantisce `sort`. */
export function confronta<R>(a: R, b: R, col: Colonna<R>, verso: Verso): number {
  const va = valoreDi(a, col);
  const vb = valoreDi(b, col);

  /* Il vuoto in fondo, nei due versi: si decide PRIMA di applicare il
     segno, o invertendo l'ordine tornerebbe in cima. */
  const av = eVuoto(va);
  const bv = eVuoto(vb);
  if (av && bv) return 0;
  if (av) return 1;
  if (bv) return -1;

  const segno = verso === 'desc' ? -1 : 1;
  const tipo = col.tipo ?? 'testo';

  if (tipo === 'numero') {
    const na = comeNumero(va);
    const nb = comeNumero(vb);
    if (na === null && nb === null) return 0;
    if (na === null) return 1;
    if (nb === null) return -1;
    return (na - nb) * segno;
  }

  if (tipo === 'data') {
    const da = comeData(va);
    const db = comeData(vb);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return (da - db) * segno;
  }

  return String(va).localeCompare(String(vb), 'it', { numeric: true, sensitivity: 'base' }) * segno;
}

/** Le righe ordinate. Senza colonna scelta l'elenco esce com'era: l'ordine
    di partenza di una tabella è una decisione di chi l'ha costruita, e non
    si sovrascrive con un ordine alfabetico che nessuno ha chiesto. */
export function ordina<R>(
  righe: readonly R[] | null | undefined,
  colonne: readonly Colonna<R>[],
  stato: Stato | null | undefined,
): R[] {
  const elenco = (righe ?? []).slice();
  const campo = stato?.campo;
  if (!campo) return elenco;
  const col = colonne.find(c => c.campo === campo);
  if (!col || col.ordinabile === false) return elenco;
  return elenco.sort((a, b) => confronta(a, b, col, stato?.verso === 'desc' ? 'desc' : 'asc'));
}

/** Le righe che contengono il testo cercato, in una qualunque delle colonne
    cercabili. Le parole si cercano TUTTE, in qualunque colonna e in
    qualunque ordine: «6001 gluc» trova la riga dell'articolo 6001055 con
    lotto GLUC0708 senza che chi cerca debba sapere in quale colonna sta
    cosa. */
export function filtra<R>(
  righe: readonly R[] | null | undefined,
  colonne: readonly Colonna<R>[],
  cerca: string | null | undefined,
): R[] {
  const elenco = (righe ?? []).slice();
  const parole = String(cerca ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!parole.length) return elenco;
  const cercabili = colonne.filter(c => c.cercabile !== false);
  if (!cercabili.length) return elenco;

  return elenco.filter(r => {
    const fieno = cercabili
      .map(c => { const v = valoreDi(r, c); return eVuoto(v) ? '' : String(v); })
      .join(' ')
      .toLowerCase();
    return parole.every(p => fieno.includes(p));
  });
}

/** Filtra e poi ordina, che è l'ordine giusto: ordinare per poi buttare via
    metà delle righe è lavoro fatto due volte su una tabella lunga. */
export function componi<R>(
  righe: readonly R[] | null | undefined,
  colonne: readonly Colonna<R>[],
  stato: Stato | null | undefined,
): R[] {
  return ordina(filtra(righe, colonne, stato?.cerca), colonne, stato);
}

/** Lo stato dopo un clic sull'intestazione. Primo clic: crescente. Secondo
    sulla stessa colonna: decrescente. Terzo: si torna all'ordine di
    partenza — che su un registro è quello cronologico, cioè l'unico che
    racconta come sono andate le cose, e deve essere raggiungibile senza
    ricaricare la pagina. */
export function alClic(stato: Stato | null | undefined, campo: string): Stato {
  const s = stato ?? STATO_VUOTO;
  if (s.campo !== campo) return { ...s, campo, verso: 'asc' };
  if (s.verso === 'asc') return { ...s, verso: 'desc' };
  return { ...s, campo: null, verso: 'asc' };
}

/** Il segno da scrivere accanto al titolo di una colonna. Vuoto sulle
    colonne che non ordinano niente adesso: una freccia grigia su ogni
    intestazione è rumore che si impara a non vedere. */
export function segno(stato: Stato | null | undefined, campo: string): string {
  if (!stato || stato.campo !== campo) return '';
  return stato.verso === 'asc' ? ' ▲' : ' ▼';
}
