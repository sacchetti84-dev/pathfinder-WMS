/* LA GIACENZA DI UN ARTICOLO, LOTTO PER LOTTO — 1.9.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Le viste di magazzino guardano un VANO: si apre un'ubicazione e si vede
   cosa c'è dentro. La domanda che si fa in corsia è però l'altra — «di questo
   articolo, quanto ne ho e dove sta?» — e fino alla 1.8 si rispondeva
   aprendo la ricerca in barra e leggendo un elenco piatto, dove lo stesso
   lotto compariva tre volte perché sta in tre ubicazioni.

   Qui l'elenco si RAGGRUPPA per lotto e si ordina FEFO, che è l'ordine in cui
   quella merce uscirà: chi conta parte da ciò che scade prima. Le ubicazioni
   di un lotto restano dentro il lotto, in ordine di codice, perché il giro
   che si fa a scaffale è quello.

   Le UM NON si calcolano qui. Arrivano già risolte dentro la riga, perché la
   regola di lettura è una sola e sta in `Store._uomDiRiga`: due letture della
   stessa riga sono due saldi, ed è il difetto che la 1.8.4 ha chiuso.

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato da fermo in
   `test/giacenzaArticolo.test.js`. */

/** Una riga di giacenza di un articolo, con le UM già risolte da chi la
    legge. `uom_qty` a `null` = quella riga non ha unità, e non è uno zero. */
export interface RigaArticolo {
  location_code: string;
  lot_code: string;
  item_key: string;
  expiry_date?: string | null;
  placed_at?: number | null;
  colli: number;
  uom_qty?: number | null;
  uom?: string | null;
  /** Come la riga si legge per esteso — «3 × 25 + 1 × 7 KG». La scrive chi
      legge la giacenza, con `Store.descriviRiga`: qui viaggia e basta. */
  descrizione?: string;
}

/** Un lotto e le ubicazioni in cui sta. `uom_qty` è `null` quando NESSUNA
    delle sue righe ha unità; se ne ha anche una sola, il totale è la somma
    di quelle che ce l'hanno. */
export interface LottoArticolo {
  lot_code: string;
  expiry_date: string;
  uom: string | null;
  colli: number;
  uom_qty: number | null;
  righe: RigaArticolo[];
}

/** Il totale di un'unità di misura. Un articolo ha di norma una sola unità,
    ma il lotto porta la sua confezione congelata e due lotti possono averla
    diversa: si sommano per unità, mai fra unità. */
export interface TotaleUnita { uom: string; quantita: number }

export interface Riepilogo {
  lotti: LottoArticolo[];
  righe: number;
  ubicazioni: number;
  colli: number;
  totali: TotaleUnita[];
  /** Quante righe non portano unità: è il numero che dice se il totale in UM
      racconta tutta la giacenza o solo una parte. */
  senzaUnita: number;
}

/* Le somme in UM si arrotondano al terzo decimale prima di confrontarle: il
   totale di venti righe a virgola mobile esce con la coda binaria, e a video
   diventerebbe «81,00000000000001». `misure.arrotonda` fa lo stesso lavoro,
   ma tenerlo qui evita a questo modulo di dipendere dall'unità. */
function pulisci(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/* FEFO fra due lotti: prima chi scade prima, e chi non ha scadenza va in
   CODA — un lotto di cui non si conosce la scadenza non è un lotto che scade
   domani. È la stessa regola di `core/giacenza.ordinaFEFO`, applicata al
   gruppo invece che alla riga. */
function confrontaFEFO(a: LottoArticolo, b: LottoArticolo): number {
  const ea = (a.expiry_date || '').trim();
  const eb = (b.expiry_date || '').trim();
  if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;
  const pa = Math.min(...a.righe.map(r => r.placed_at || Number.MAX_SAFE_INTEGER));
  const pb = Math.min(...b.righe.map(r => r.placed_at || Number.MAX_SAFE_INTEGER));
  if (pa !== pb) return pa - pb;
  return a.lot_code < b.lot_code ? -1 : a.lot_code > b.lot_code ? 1 : 0;
}

/** Le righe di un articolo raggruppate per lotto e ordinate FEFO. Le righe
    di un lotto escono in ordine di ubicazione. */
export function perLotto(righe: readonly RigaArticolo[] | null | undefined): LottoArticolo[] {
  if (!righe?.length) return [];
  const gruppi = new Map<string, LottoArticolo>();
  for (const r of righe) {
    if (!r) continue;
    const chiave = r.lot_code || '';
    let g = gruppi.get(chiave);
    if (!g) {
      g = { lot_code: chiave, expiry_date: '', uom: null, colli: 0, uom_qty: null, righe: [] };
      gruppi.set(chiave, g);
    }
    g.righe.push(r);
    g.colli += r.colli || 0;
    /* La scadenza è del lotto, non della riga: la prima che si trova vale
       per tutte, e se due righe dello stesso lotto la portano diversa vince
       la più vicina — fra due date discordi, contro la merce, la prudente. */
    const scad = (r.expiry_date || '').trim();
    if (scad && (!g.expiry_date || scad < g.expiry_date)) g.expiry_date = scad;
    if (!g.uom && r.uom) g.uom = r.uom;
    if (typeof r.uom_qty === 'number') g.uom_qty = pulisci((g.uom_qty ?? 0) + r.uom_qty);
  }
  const out = [...gruppi.values()];
  for (const g of out) {
    g.righe.sort((x, y) => (x.location_code < y.location_code ? -1 : x.location_code > y.location_code ? 1 : 0));
  }
  out.sort(confrontaFEFO);
  return out;
}

/** Quanto c'è, in colli e in UM, e su quante ubicazioni. */
export function riepiloga(righe: readonly RigaArticolo[] | null | undefined): Riepilogo {
  const lotti = perLotto(righe);
  const ubicazioni = new Set<string>();
  const perUnita = new Map<string, number>();
  let colli = 0;
  let conta = 0;
  let senzaUnita = 0;
  for (const g of lotti) {
    for (const r of g.righe) {
      conta++;
      ubicazioni.add(r.location_code);
      colli += r.colli || 0;
      if (typeof r.uom_qty === 'number' && r.uom) {
        perUnita.set(r.uom, pulisci((perUnita.get(r.uom) ?? 0) + r.uom_qty));
      } else {
        senzaUnita++;
      }
    }
  }
  const totali = [...perUnita.entries()]
    .map(([uom, quantita]) => ({ uom, quantita }))
    .sort((a, b) => (a.uom < b.uom ? -1 : a.uom > b.uom ? 1 : 0));
  return { lotti, righe: conta, ubicazioni: ubicazioni.size, colli, totali, senzaUnita };
}

/** Le righe scelte a schermo, nell'ordine in cui si andrà a contarle:
    l'ordine è quello del riepilogo — FEFO fra i lotti, ubicazione dentro il
    lotto — e non quello in cui sono state spuntate. Chi conta cinque lotti
    fa un giro solo, e il giro lo decide lo scaffale.

    Le chiavi che non trovano una riga si scartano in silenzio: una giacenza
    può essere uscita fra la spunta e la conferma, e fermare tutto per una
    riga sparita vorrebbe dire ricominciare la selezione. */
export function codaDiConta(
  righe: readonly RigaArticolo[] | null | undefined,
  chiavi: readonly string[] | null | undefined,
): RigaArticolo[] {
  if (!righe?.length || !chiavi?.length) return [];
  const volute = new Set(chiavi);
  const out: RigaArticolo[] = [];
  for (const g of perLotto(righe)) {
    for (const r of g.righe) {
      if (volute.has(chiaveRiga(r))) out.push(r);
    }
  }
  return out;
}

/** Come si nomina una riga in una selezione: ubicazione e item, che insieme
    sono l'indice della giacenza — `[location_code+item_key]`, quello che la
    1.4.2 ha deciso di non toccare mai più. */
export function chiaveRiga(r: Pick<RigaArticolo, 'location_code' | 'item_key'>): string {
  return `${r.location_code}|${r.item_key}`;
}
