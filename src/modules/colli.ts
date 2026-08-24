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

/** Le misure di colli che erano usciti, ritrovate nell'elenco di adesso: è
    quello che serve a uno storno, che deve togliere i colli che aveva
    rimesso e non altri di misura comoda. Due colli uguali sono due scelte
    diverse — la stessa posizione non si sceglie due volte.

    Lancia se una misura non c'è più: chi ha stornato ha in mano un collo
    preciso, e prenderne un altro sarebbe un saldo giusto sui colli sbagliati.
    `null` quando non c'è niente da ritrovare. */
export function scelteDaMisure(
  colli: number[] | null | undefined, misure: unknown, uom?: string | null,
): Scelta[] | null {
  const letti = leggiColli(colli, uom);
  const cercate = leggiColli(misure, uom);
  if (!letti || !cercate) return null;
  const presi = new Set<number>();
  return cercate.map(q => {
    const i = letti.findIndex((v, k) => v === q && !presi.has(k));
    if (i === -1) {
      throw new Error(`Il collo da ${formattaQuantita(q, uom)} non è più su questa riga: lo storno non può ritrovarlo`);
    }
    presi.add(i);
    return { indice: i };
  });
}

/** Le uscite messe da parte — `{da, quantita}`, la forma che capisce il
    servizio — ritrovate sull'elenco di adesso.

    IL CARRELLO DEL DDT SCEGLIE I COLLI GIORNI PRIMA CHE ESCANO. Fra la riga
    messa a documento e il vettore che arriva gli indici non valgono piu': un
    altro terminale puo' aver mosso quella riga. Le misure invece reggono, ed
    e' la stessa ragione per cui il servizio riceve `{da, quantita}` e non un
    numero — un 10 preso da un collo da 25, su una riga che ha anche un collo
    da 10, porterebbe via quello.

    Un collo che non c'e' piu' ferma l'evasione, come per lo storno: chi ha
    scritto il documento aveva in mano un collo preciso. `null` quando non
    c'e' niente da ritrovare. */
export function scelteDaUscite(
  colli: number[] | null | undefined, messe: unknown, uom?: string | null,
): Scelta[] | null {
  const letti = leggiColli(colli, uom);
  if (!letti || !Array.isArray(messe) || !messe.length) return null;
  const dec = decimali(uom);
  const presi = new Set<number>();
  return messe.map((u: any) => {
    const da = arrotonda(leggiNumero(u?.da), dec);
    const q = arrotonda(leggiNumero(u?.quantita), dec);
    if (da === null || da <= 0) throw new Error('Uscita senza la misura del collo da cui esce');
    if (q === null || q <= 0) throw new Error(`Collo da ${formattaQuantita(da, uom)}: la quantita' che esce e' maggiore di zero`);
    if (q > da) {
      throw new Error(`Un collo da ${formattaQuantita(da, uom)} non ne puo' dare ${formattaQuantita(q, uom)}`);
    }
    const i = letti.findIndex((v, k) => v === da && !presi.has(k));
    if (i === -1) {
      throw new Error(`Il collo da ${formattaQuantita(da, uom)} non e' piu' su questa riga: il documento non lo ritrova`);
    }
    presi.add(i);
    /* Il collo svuotato del tutto esce senza quantita': e' cosi' che
       `preleva` lo toglie dall'elenco invece di lasciarci uno zero. */
    return q === da ? { indice: i } : { indice: i, quantita: q };
  });
}

/* ── La rettifica: da com'era a com'e' ───────────────────────────────── */

export interface Rettifica {
  /** I colli da togliere, nella forma che capisce il servizio. */
  uscite: { da: number; quantita: number }[];
  /** Le misure dei colli da aggiungere. */
  entrate: number[];
}

/** La differenza fra l'elenco di prima e quello che l'operatore ha davanti.

    CHI CONTA UN VANO NON TOGLIE E NON AGGIUNGE: guarda lo scaffale e dice
    com'e' fatto adesso. Tradurlo in movimenti e' lavoro del sistema, e va
    fatto come il registro lo capisce.

    I colli che ci sono in tutti e due restano fermi. Di quelli che restano,
    un collo piu' leggero SI ACCOPPIA con il piu' piccolo che lo conteneva —
    il 25 che pesa 18 e' lo stesso collo con dentro 7 KG in meno, non un
    collo uscito e uno arrivato dal nulla. Quel che avanza da una parte e'
    uscito intero, quel che avanza dall'altra e' entrato.

    `null` se l'elenco di prima non si legge: senza non c'e' niente da cui
    misurare una differenza. */
export function rettifica(
  prima: number[] | null | undefined, dopo: unknown, uom?: string | null,
): Rettifica | null {
  const vecchi = leggiColli(prima, uom);
  if (!vecchi) return null;
  const nuovi = Array.isArray(dopo) ? (leggiColli(dopo, uom) ?? []) : null;
  if (nuovi === null) return null;
  const dec = decimali(uom);

  /* Quel che c'e' da entrambe le parti non si muove: si tolgono a coppie. */
  const restaPrima = vecchi.slice().sort((a, b) => b - a);
  const restaDopo = nuovi.slice().sort((a, b) => b - a);
  for (const q of [...restaDopo]) {
    const i = restaPrima.indexOf(q);
    if (i === -1) continue;
    restaPrima.splice(i, 1);
    restaDopo.splice(restaDopo.indexOf(q), 1);
  }

  const uscite: { da: number; quantita: number }[] = [];
  for (const d of [...restaDopo]) {
    /* Il piu' PICCOLO che lo contiene: 24 viene da un 25 sceso di uno, non
       da un 30 sceso di sei. */
    let scelto = -1;
    for (let i = 0; i < restaPrima.length; i++) {
      if (restaPrima[i]! > d && (scelto === -1 || restaPrima[i]! < restaPrima[scelto]!)) scelto = i;
    }
    if (scelto === -1) continue;
    uscite.push({ da: restaPrima[scelto]!, quantita: arrotonda(restaPrima[scelto]! - d, dec)! });
    restaPrima.splice(scelto, 1);
    restaDopo.splice(restaDopo.indexOf(d), 1);
  }
  for (const p of restaPrima) uscite.push({ da: p, quantita: p });
  return { uscite, entrate: restaDopo };
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


/* ── La scelta per TAGLIA ────────────────────────────────────────────────
   2.2 — QUANTI PER TAGLIA, NON QUALE COLLO.

   Una riga con settanta colli chiedeva settanta caselle per ottenere un
   numero: l'operatore scorreva un elenco lungo quanto lo scaffale per dire
   «dodici da 25». Due colli della stessa misura, sulla stessa riga di
   giacenza, sono la stessa cosa — quale dei due esca è una differenza che
   non esiste — e per questo la domanda giusta è quanti per misura.

   Il collo che si APRE resta una scelta esplicita: è l'unico caso in cui la
   misura non basta, perché un collo aperto vale meno di quello che dichiara.

   Qui non si tocca né Store né il DOM: entrano un elenco e le prese, escono
   le scelte per indice — la stessa forma che `preleva` convalida e che il
   servizio riceve come `{da, quantita}`. */

/** Quanti colli si prendono di una misura. */
export interface PresaPerTaglia { per: number; colli: number }

/** La parte che esce da un collo APERTO di quella misura. */
export interface PresaParziale { per: number; quantita: unknown }

/** Le prese per taglia tradotte in scelte per indice. Si prendono i PRIMI
    colli liberi di ogni misura: fra due colli identici non c'è un primo che
    valga più dell'altro.

    Lancia quando una misura non ha abbastanza colli — il numero digitato
    dice una corsia che non esiste — e quando il collo da aprire non c'è.
    Elenco vuoto se non si è preso niente: è chi chiama a decidere se sia un
    errore, e per la conferma lo è. */
export function scelteDaTaglie(
  colli: number[] | null | undefined,
  prese: PresaPerTaglia[] | null | undefined,
  uom?: string | null,
  parte: PresaParziale | null = null,
): Scelta[] {
  const letti = leggiColli(colli, uom);
  if (!letti) throw new Error('Non c’è nessun collo da prelevare');
  const dec = decimali(uom);
  const usati = new Set<number>();
  const scelte: Scelta[] = [];

  const libero = (misura: number) => letti.findIndex((v, i) => v === misura && !usati.has(i));

  for (const presa of prese ?? []) {
    const misura = arrotonda(leggiNumero(presa?.per), dec);
    const quanti = arrotonda(leggiNumero(presa?.colli), 0) ?? 0;
    if (misura === null || misura <= 0 || quanti <= 0) continue;
    for (let n = 0; n < quanti; n++) {
      const i = libero(misura);
      if (i === -1) {
        const disponibili = letti.filter(v => v === misura).length;
        throw new Error(`Da ${formattaQuantita(misura, uom)}${unitaValida(uom) ? ' ' + uom : ''} ce ne sono ${disponibili}: non se ne possono prendere ${quanti}`);
      }
      usati.add(i);
      scelte.push({ indice: i });
    }
  }

  if (parte) {
    const misura = arrotonda(leggiNumero(parte.per), dec);
    const q = arrotonda(leggiNumero(parte.quantita), dec);
    if (misura === null || misura <= 0) throw new Error('Da quale collo esce la parte: manca la misura');
    if (q === null || q <= 0) throw new Error('La parte che esce è maggiore di zero');
    if (q >= misura) {
      throw new Error(`Una parte è meno di un collo intero (${formattaQuantita(misura, uom)}): per prenderlo tutto conta un collo in più`);
    }
    const i = libero(misura);
    if (i === -1) {
      throw new Error(`Per aprire un collo da ${formattaQuantita(misura, uom)} ne serve uno non ancora preso: abbassa di uno i colli interi di quella misura`);
    }
    usati.add(i);
    scelte.push({ indice: i, quantita: q });
  }

  return scelte;
}

/** La maschera nasce già compilata: si riempie dalle misure più piene finché
    il fabbisogno è coperto. L'ultimo collo può eccedere — mezzo collo non si
    prende senza dirlo, e dirlo è il campo della parte.

    `uom` è il fabbisogno in unità di misura (l'ODP chiede chili), `colli` in
    colli. Chi non sa quanto serve non passa niente e le righe nascono a zero:
    proporre un numero inventato è peggio di non proporne nessuno. */
export function riempiFabbisogno(
  gruppi: { colli: number; per: number }[] | null | undefined,
  fabbisogno: { uom?: number | null; colli?: number | null } | null | undefined,
  uom?: string | null,
): number[] {
  const righe = (gruppi ?? []).map(() => 0);
  if (!gruppi?.length || !fabbisogno) return righe;
  const dec = decimali(uom);

  const perColli = arrotonda(fabbisogno.colli, 0);
  if (perColli !== null && perColli > 0) {
    let restano = perColli;
    gruppi.forEach((g, i) => {
      if (restano <= 0) return;
      const presi = Math.min(g.colli, restano);
      righe[i] = presi;
      restano -= presi;
    });
    return righe;
  }

  const perUom = arrotonda(fabbisogno.uom, dec);
  if (perUom !== null && perUom > 0) {
    let restano = perUom;
    gruppi.forEach((g, i) => {
      if (restano <= 0) return;
      const servono = Math.min(g.colli, Math.ceil(arrotonda(restano / g.per, 6)!));
      righe[i] = servono;
      restano = arrotonda(restano - servono * g.per, dec)!;
    });
  }
  return righe;
}
