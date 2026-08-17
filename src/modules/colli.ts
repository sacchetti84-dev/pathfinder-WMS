/* I COLLI, UNO PER UNO — 1.8.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 1.7 la suddivisione si CALCOLAVA: un `per_collo` congelato sul
   lotto, il totale in UM, e da lì i pieni più il resto. Regge finché lo
   stesso articolo arriva sempre confezionato allo stesso modo, e in magazzino
   non è così — lo stesso codice arriva in colli da 5 kg e la volta dopo da
   25, e a volte nello stesso arrivo.

   Qui la suddivisione si DICHIARA: chi ha la merce in mano scrive «10 × 1.000
   + 1 × 900», e l'elenco dei colli è il dato. `qty` e `qty_uom` restano, e
   diventano le due colonne materializzate di quell'elenco — quante voci, e
   quanto fanno in tutto. Più colli incompleti sono ammessi: sono la norma,
   non l'eccezione.

   La riga di giacenza resta UNA: l'elenco vive dentro di lei, non accanto.
   Il perché sta in testa a `misure.ts` e non cambia con questa versione.

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato da fermo in
   `test/colli.test.js`. */

import {
  arrotonda, decimali, etichettaUnita, formattaQuantita,
  leggiNumero, sommaUom, suddividi, unitaValida,
} from './misure';

/** Una riga della maschera di posizionamento: «quanti colli» × «quanto
    dentro». Grezza, perché arriva da due campi di testo. */
export interface RigaDichiarata { colli?: unknown; per?: unknown }

/** Che cosa esce da un prelievo: i colli che restano sulla riga, quelli che
    se ne sono andati, e le UM uscite. */
export interface Esito { rimasti: number[]; usciti: number[]; uom: number }

/** Quale collo, e quanto prenderne. `quantita` assente = il collo intero;
    presente e minore = il collo si apre e il residuo resta a scaffale. */
export interface Scelta { indice: number; quantita?: unknown }

/* ── La dichiarazione ────────────────────────────────────────────────── */

/* Una riga tutta vuota non è un errore: le maschere ne tengono sempre una in
   fondo, e chi non la compila non ha sbagliato niente. Una riga a metà sì —
   i colli senza la quantità sono la merce che nessuno ha misurato. */
function rigaVuota(colli: number | null, per: number | null): boolean {
  return (colli === null || colli === 0) && (per === null || per === 0);
}

/** Le righe dichiarate diventano un collo per voce: `[{10, 1000}, {1, 900}]`
    → undici numeri. `null` se una riga non sta in piedi — gli errori in
    chiaro li dà `validaDichiarazione`, che è la funzione che parla. */
export function espandi(righe: RigaDichiarata[] | null | undefined, uom?: string | null): number[] | null {
  if (!Array.isArray(righe)) return null;
  const dec = decimali(uom);
  const out: number[] = [];
  for (const r of righe) {
    const colli = leggiNumero(r?.colli);
    const per = leggiNumero(r?.per);
    if (rigaVuota(colli, per)) continue;
    if (colli === null || colli < 0 || !Number.isInteger(colli)) return null;
    if (colli === 0) continue;
    if (per === null || per <= 0) return null;
    if (dec === 0 && !Number.isInteger(per)) return null;
    const q = arrotonda(per, dec)!;
    for (let i = 0; i < colli; i++) out.push(q);
  }
  return out.length ? out : null;
}

/** Gli errori tutti insieme e numerati per riga, come `validaConfigurazione`:
    chi compila vuole sapere cosa manca, non cosa manca per primo. */
export function validaDichiarazione(righe: RigaDichiarata[] | null | undefined, uom?: string | null): string[] {
  const errori: string[] = [];
  const dec = decimali(uom);
  let dichiarati = 0;
  const elenco = Array.isArray(righe) ? righe : [];
  elenco.forEach((r, i) => {
    const n = i + 1;
    const colli = leggiNumero(r?.colli);
    const per = leggiNumero(r?.per);
    if (rigaVuota(colli, per)) return;
    if (colli === null || colli <= 0 || !Number.isInteger(colli)) {
      errori.push(`Riga ${n}: il numero di colli è un intero maggiore di zero`);
      return;
    }
    if (per === null || per <= 0) {
      errori.push(`Riga ${n}: manca la quantità dentro il collo`);
      return;
    }
    if (dec === 0 && !Number.isInteger(per)) {
      errori.push(`Riga ${n}: in ${etichettaUnita(uom) || 'UM'} la quantità è un numero intero (ricevuto ${per})`);
      return;
    }
    dichiarati += colli;
  });
  if (!errori.length && dichiarati === 0) errori.push('Nessun collo dichiarato: la merce che entra si conta');
  return errori;
}

/* ── L'elenco già scritto ────────────────────────────────────────────── */

/** L'elenco come sta sulla riga di giacenza. `null` è un'assenza dichiarata:
    una riga senza elenco si legge come nella 1.7 — colli pieni più il resto,
    da `daSuddivisione`. All'installazione non si riscrive niente. */
export function leggiColli(raw: unknown, uom?: string | null): number[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const dec = decimali(uom);
  const out: number[] = [];
  for (const v of raw) {
    const n = leggiNumero(v);
    if (n === null || n <= 0) return null;
    out.push(arrotonda(n, dec)!);
  }
  return out;
}

/** I colli sono quanti sono: si contano, non si calcolano. È la ragione per
    cui la 1.8 può reggere colli tutti diversi. */
export function totaleColli(colli: number[] | null | undefined): number {
  return Array.isArray(colli) ? colli.length : 0;
}

export function totaleUom(colli: number[] | null | undefined, uom?: string | null): number {
  if (!Array.isArray(colli)) return 0;
  return colli.reduce((acc, n) => sommaUom(acc, n, uom), 0);
}

/* ── Come si legge ───────────────────────────────────────────────────── */

/** L'elenco raccolto per quantità, i colli più pieni davanti. È la forma in
    cui un magazziniere lo dice a voce, e quella in cui la maschera lo
    ripropone quando si riapre. */
export function raggruppa(colli: number[] | null | undefined, uom?: string | null): { colli: number; per: number }[] {
  const letti = leggiColli(colli, uom);
  if (!letti) return [];
  const conta = new Map<number, number>();
  for (const q of letti) conta.set(q, (conta.get(q) ?? 0) + 1);
  return [...conta.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([per, n]) => ({ colli: n, per }));
}

/** «10 × 1.000 + 1 × 900 PZ» — la stessa riga a video, in etichetta e sul
    report, come `descrivi` della 1.4.2 e per la stessa ragione. */
export function descriviColli(colli: number[] | null | undefined, uom?: string | null): string {
  const gruppi = raggruppa(colli, uom);
  if (!gruppi.length) return '—';
  const coda = unitaValida(uom) ? ` ${uom}` : '';
  return gruppi.map(g => `${g.colli} × ${formattaQuantita(g.per, uom)}`).join(' + ') + coda;
}

/* ── Il ponte con la 1.7 ─────────────────────────────────────────────── */

/** La riga della 1.7 — totale in UM e per-collo costante — letta come elenco:
    i pieni, più il resto se avanza. È l'unica lettura onesta di una
    suddivisione che nessuno ha mai dichiarato, ed è ciò che permette alla
    1.8 di non riscrivere una sola riga all'installazione. */
export function daSuddivisione(qtyUom: unknown, perCollo: unknown, uom?: string | null): number[] | null {
  const s = suddividi(qtyUom, perCollo, uom);
  if (!s || s.colli === 0) return null;
  const pieno = arrotonda(perCollo, decimali(uom))!;
  const out: number[] = [];
  for (let i = 0; i < s.pieni; i++) out.push(pieno);
  if (s.incompleto) out.push(s.resto);
  return out;
}

/* ── Il prelievo: quali colli, e quanti ──────────────────────────────── */

/** Toglie dall'elenco i colli scelti. Un collo preso in parte si apre: esce
    la quantità chiesta e il residuo torna a scaffale come collo incompleto —
    è il prelievo parziale della 1.8, e vale su prelievo, smaltimento e
    trasferimento allo stesso modo.

    Ogni cosa che non torna è un errore in faccia, non uno zero: un indice che
    non esiste, lo stesso collo scelto due volte, una quantità più grande di
    quello che il collo contiene. Un saldo sbagliato ma plausibile costa più
    di una maschera che si rifiuta di chiudersi. */
export function preleva(colli: number[] | null | undefined, scelte: Scelta[] | null | undefined, uom?: string | null): Esito {
  const letti = leggiColli(colli, uom);
  if (!letti) throw new Error('Non c\'è nessun collo da prelevare');
  if (!Array.isArray(scelte) || !scelte.length) throw new Error('Nessun collo scelto');
  const dec = decimali(uom);
  const visti = new Set<number>();
  const usciti: number[] = [];
  const rimasti = letti.slice();
  const svuotati: number[] = [];

  for (const s of scelte) {
    const i = Number(s?.indice);
    if (!Number.isInteger(i) || i < 0 || i >= letti.length) {
      throw new Error(`Collo ${i + 1}: non esiste su questa riga`);
    }
    if (visti.has(i)) throw new Error(`Collo ${i + 1}: scelto due volte`);
    visti.add(i);
    const dentro = letti[i]!;
    if (s.quantita === undefined || s.quantita === null || s.quantita === '') {
      usciti.push(dentro);
      svuotati.push(i);
      continue;
    }
    const q = arrotonda(leggiNumero(s.quantita), dec);
    if (q === null || q <= 0) throw new Error(`Collo ${i + 1}: la quantità da prelevare è maggiore di zero`);
    if (q > dentro) {
      throw new Error(`Collo ${i + 1}: contiene ${formattaQuantita(dentro, uom)}, non se ne possono prelevare ${formattaQuantita(q, uom)}`);
    }
    usciti.push(q);
    /* Il collo svuotato del tutto ESCE dall'elenco: uno zero a scaffale è un
       collo che non c'è, e la riga lo conterebbe. */
    if (q === dentro) svuotati.push(i);
    else rimasti[i] = arrotonda(dentro - q, dec)!;
  }

  for (const i of svuotati.sort((a, b) => b - a)) rimasti.splice(i, 1);
  return { rimasti, usciti, uom: totaleUom(usciti, uom) };
}

/** Le scelte come le capisce il servizio: per ogni uscita, LA MISURA DEL
    COLLO e quanto ne esce. Gli indici restano di qua — fra il render della
    maschera e il tocco sul bottone un altro terminale puo' aver mosso la riga
    — ma la sola quantita' non basta: «10» preso da un collo da 25, su una
    riga che ha anche un collo da 10, porterebbe via quello. Saldo giusto,
    colli sbagliati, e una riga che a video non somiglia alla corsia.

    Convalida con `preleva`: cio' che non sta in piedi non parte nemmeno. */
export function uscite(
  colli: number[] | null | undefined, scelte: Scelta[] | null | undefined, uom?: string | null,
): { da: number; quantita: number }[] {
  preleva(colli, scelte, uom);
  const letti = leggiColli(colli, uom)!;
  const dec = decimali(uom);
  return scelte!.map(s => {
    const da = letti[Number(s.indice)]!;
    const q = (s.quantita === undefined || s.quantita === null || s.quantita === '')
      ? da : arrotonda(leggiNumero(s.quantita), dec)!;
    return { da, quantita: q };
  });
}

/* ── La verifica, che mostra e non corregge ──────────────────────────── */

export interface VerificaColli {
  colliAttesi: number;
  uomAtteso: number;
  /** Dichiarato meno atteso. Negativo = ne manca all'appello. */
  scarto: number;
  scartoUom: number;
  ok: boolean;
}

/** Il conto fra le due colonne materializzate e l'elenco che le genera.
    `null` quando non c'è elenco: una verifica che non può girare non accusa
    nessuno — la stessa regola di `verifica` nella 1.4.2. */
export function verificaColli(
  qty: unknown, qtyUom: unknown, colli: number[] | null | undefined, uom?: string | null,
): VerificaColli | null {
  const letti = leggiColli(colli, uom);
  if (!letti) return null;
  const dec = decimali(uom);
  const colliAttesi = letti.length;
  const uomAtteso = totaleUom(letti, uom);
  const scarto = (arrotonda(qty, 0) ?? 0) - colliAttesi;
  const scartoUom = arrotonda((arrotonda(qtyUom, dec) ?? 0) - uomAtteso, dec)!;
  return { colliAttesi, uomAtteso, scarto, scartoUom, ok: scarto === 0 && scartoUom === 0 };
}
