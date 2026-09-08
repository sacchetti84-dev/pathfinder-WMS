/* IL CRUSCOTTO SE LO COMPONE CHI LO GUARDA — 2.1.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 2.0 la Dashboard era una sequenza fissa di riquadri, scritta
   nell'ordine in cui erano stati costruiti. Chi la apre venti volte al
   giorno non guarda venti riquadri: ne guarda due, e scorre gli altri
   diciotto per arrivarci. Da qui in poi l'ordine, la larghezza e quali
   riquadri esistano sono un DATO dell'utente, non una riga di codice.

   IL LAYOUT È UN ELENCO, NON UNA MAPPA DI COORDINATE. Un widget da
   telefono non si posa su un pixel: si posa in una griglia, e la griglia
   decide dove sta davvero. Qui è lo stesso — ordine più larghezza (metà o
   intera) — e il perché non è pigrizia: una posizione in pixel salvata su
   uno schermo da 27 pollici, riletta sull'MC9400 da 480, mette due
   riquadri uno sopra l'altro e un terzo fuori dallo schermo. L'ordine
   invece sopravvive a qualunque larghezza, che è la sola cosa che serve a
   un cruscotto guardato su tre schermi diversi.

   CHI NON CONOSCE UN RIQUADRO NON LO BUTTA. Un layout salvato oggi verrà
   riletto da una versione che ha un riquadro in più: quello nuovo si
   accoda visibile invece di sparire, e uno che non esiste più si ignora
   senza rompere il resto. È la stessa regola dei campi facoltativi di §6 —
   assente significa «come prima», mai «cancellato».

   Nessuno stato, nessun accesso a Store, nessun DOM: entra il layout
   salvato, esce quello da disegnare. Collaudato in `test/cruscotto.test.js`. */

/** Quanto spazio prende un riquadro. Due valori e non dodici: su una
    griglia larga la metà è già la misura più piccola leggibile, e
    permettere un terzo di riga vorrebbe dire una colonna di numeri alta
    otto righe. */
export type Larghezza = 'meta' | 'intera';

/** Un riquadro nel layout dell'utente. */
export interface Riquadro {
  id: string;
  visibile: boolean;
  larghezza: Larghezza;
}

/** Quello che il codice sa fare, con il nome che l'utente legge. `fisso`
    marca i riquadri che non si spengono: gli avvisi di integrità e i ritiri
    scaduti non sono una preferenza — sono la ragione per cui qualcuno deve
    guardare il cruscotto oggi invece che domani. */
export interface Disponibile {
  id: string;
  titolo: string;
  descrizione?: string;
  fisso?: boolean;
  larghezzaDiSerie?: Larghezza;
}

/** Il layout completo: i riquadri, e quali scorciatoie di Movimenta stanno
    in cima. `null` sulle scorciatoie significa «quelle di sempre», che non è
    la stessa cosa di un elenco vuoto — un elenco vuoto è una scelta, e vuol
    dire nessuna scorciatoia. */
export interface Layout {
  riquadri: Riquadro[];
  scorciatoie: string[] | null;
}

export const LAYOUT_VUOTO: Layout = Object.freeze({ riquadri: [], scorciatoie: null });

/** Il layout da disegnare: quello salvato riconciliato con quello che il
    codice sa fare oggi.

    - un riquadro salvato che non esiste più si ignora;
    - un riquadro nuovo si accoda VISIBILE, con la sua larghezza di serie;
    - un riquadro `fisso` resta visibile comunque, anche se il salvato dice
      di no: era spegnibile in una versione precedente, o qualcuno ha
      scritto a mano nel dato. */
export function componiLayout(
  salvato: Partial<Layout> | null | undefined,
  disponibili: readonly Disponibile[],
): Layout {
  const catalogo = new Map(disponibili.map(d => [d.id, d]));
  const visti = new Set<string>();
  const riquadri: Riquadro[] = [];

  for (const r of salvato?.riquadri ?? []) {
    const d = catalogo.get(r?.id ?? '');
    if (!d || visti.has(d.id)) continue;
    visti.add(d.id);
    riquadri.push({
      id: d.id,
      visibile: d.fisso ? true : r.visibile !== false,
      larghezza: r.larghezza === 'intera' || r.larghezza === 'meta'
        ? r.larghezza
        : (d.larghezzaDiSerie ?? 'meta'),
    });
  }

  for (const d of disponibili) {
    if (visti.has(d.id)) continue;
    riquadri.push({ id: d.id, visibile: true, larghezza: d.larghezzaDiSerie ?? 'meta' });
  }

  const scorciatoie = Array.isArray(salvato?.scorciatoie)
    ? salvato!.scorciatoie!.map(String)
    : null;

  return { riquadri, scorciatoie };
}

/** Sposta un riquadro di una posizione, o lo porta dove dice `a`. Fuori
    dall'elenco non si va: trascinare oltre il bordo è un gesto normale, e
    deve non fare niente invece di rompere l'ordine. */
export function sposta(riquadri: readonly Riquadro[], id: string, a: number): Riquadro[] {
  const elenco = riquadri.slice();
  const da = elenco.findIndex(r => r.id === id);
  if (da < 0) return elenco;
  const dove = Math.max(0, Math.min(elenco.length - 1, Math.trunc(a)));
  if (dove === da) return elenco;
  const [pezzo] = elenco.splice(da, 1);
  elenco.splice(dove, 0, pezzo!);
  return elenco;
}

/** Accende o spegne un riquadro. Un `fisso` non si spegne: la funzione
    restituisce l'elenco com'era, e chi chiama non deve ricordarselo. */
export function commuta(
  riquadri: readonly Riquadro[],
  id: string,
  disponibili: readonly Disponibile[],
): Riquadro[] {
  const d = disponibili.find(x => x.id === id);
  if (d?.fisso) return riquadri.slice();
  return riquadri.map(r => r.id === id ? { ...r, visibile: !r.visibile } : { ...r });
}

/** Cambia la larghezza di un riquadro. */
export function ridimensiona(riquadri: readonly Riquadro[], id: string, larghezza: Larghezza): Riquadro[] {
  return riquadri.map(r => r.id === id ? { ...r, larghezza } : { ...r });
}

/** Le scorciatoie da disegnare. `null` significa «quelle di sempre»: si
    restituiscono tutte quelle che il codice conosce. Un elenco vuoto è una
    scelta, e resta vuoto. */
export function scorciatoieDaMostrare(
  layout: Layout | null | undefined,
  tutte: readonly string[],
): string[] {
  const scelte = layout?.scorciatoie;
  if (!Array.isArray(scelte)) return tutte.slice();
  const noti = new Set(tutte);
  return scelte.filter(s => noti.has(s));
}

/** Quello che va a database: solo i campi che contano, e nient'altro. Un
    layout che si porta dietro titoli e descrizioni li congela al giorno in
    cui è stato salvato, e il mese dopo la scheda si chiama in due modi. */
export function daSalvare(layout: Layout): Layout {
  return {
    riquadri: layout.riquadri.map(r => ({ id: r.id, visibile: r.visibile, larghezza: r.larghezza })),
    scorciatoie: layout.scorciatoie === null ? null : layout.scorciatoie.slice(),
  };
}

/* I TASTI FUNZIONE, IN UN POSTO SOLO — 2.29.1.

   Fino alla 2.29 il tasto stampato sulla scheda era una stringa scritta a
   mano accanto alla scheda, e la tabella che ascolta la tastiera stava in
   `ui/app.ts`. Due elenchi separati divergono, e avevano gia' divergiuto:
   DUE schede portavano scritto «F3» — Trasferimento e Prelievo ordini — e
   F3 non faceva ne' l'una ne' l'altra. Apriva il prelievo senza dire su
   quale scheda, cioe' sull'ULTIMA USATA: `_pickSubMode` e' appiccicoso.
   Chi aveva prelevato una volta per la produzione, premendo F3 per fare un
   trasferimento, si ritrovava sul prelievo di produzione. In corsia si
   guarda lo schermo per un istante e si comincia a battere codici.

   Allo stesso tempo F4, F6, F7 e F8 esistevano e nessuna scheda lo diceva.

   Adesso il tasto della scheda si CHIEDE a questa tabella. Un tasto che non
   c'e' non si stampa, e una scheda che nessun tasto raggiunge non ne
   annuncia uno. `sub` fa parte della chiave: e' quello che mancava. */
export type Combinazione = { readonly mode: string; readonly sub: string | null };

export const TASTI_FUNZIONE: Readonly<Record<string, Combinazione>> = {
  F2: { mode: 'io',         sub: 'in' },
  F3: { mode: 'pick',       sub: 'cambio' },
  F4: { mode: 'inv',        sub: null },
  F6: { mode: 'io',         sub: 'out' },
  F7: { mode: 'quarantine', sub: null },
  F8: { mode: 'shipping',   sub: null },
};

/** Il tasto che porta esattamente li', o stringa vuota. Confronta anche
    `sub`: senza, «prelievo» e «prelievo di produzione» sarebbero la stessa
    cosa, ed e' proprio la confusione da cui nasce questa funzione. */
export function tastoPer(mode: string, sub: string | null = null): string {
  for (const [tasto, c] of Object.entries(TASTI_FUNZIONE)) {
    if (c.mode === mode && (c.sub ?? null) === (sub ?? null)) return tasto;
  }
  return '';
}
