/* LE STAMPANTI DI ETICHETTE, E COME SI DISPONE UN'ETICHETTA — 2.19.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Un record di stampante è un DATO, non una costante del sorgente: l'IP di
   una Zebra cambia quando cambia lo switch, e il layout di un'etichetta
   cambia quando il magazzino decide che sull'etichetta ci va anche il peso.
   Nessuna delle due cose vale una ricompilazione, ed è lo stesso motivo per
   cui il prefisso GS1 e le regole di stoccaggio stanno in `meta`.

   QUI NON C'È LO ZPL, E NON DEVE ESSERCI. Le barre e i comandi li scrive il
   servizio (`server/lib/zpl.js`): l'etichetta deve dire quel che sta a
   database, non quel che il browser dichiara, e un documento GMP costruito
   dal client si falsifica scrivendo in una console. Qui c'è la forma del
   dato, la sua convalida, e il conto dei millimetri che serve alla maschera
   di configurazione per dire a chi guarda se ci sta.

   IL CONTO DEI MILLIMETRI È SCRITTO DUE VOLTE, E SI SA. `disponi` sta anche
   in `server/lib/zpl.js`, che è quello che comanda: il servizio RIFIUTA un
   layout più alto del supporto, e la sua parola è l'ultima. Questa copia
   serve a una cosa sola — che chi sposta un cursore veda subito i millimetri
   invece di scoprirlo in corsia — e non può divergere in silenzio: sono gli
   stessi numeri, e `test/stampanti.test.js` li inchioda a quelli che il
   banco del servizio misura sul layout di serie. Il client ESM e il servizio
   CommonJS non possono importarsi a vicenda, e questo è il prezzo.

   Nessuno stato, nessun DOM, nessun accesso a Store: entrano oggetti,
   escono oggetti. Collaudato da fermo in `test/stampanti.test.js`. */

/** I dpi di una testina Zebra. Non è un numero libero: la conversione
    millimetri → punti dipende da questo, e una risoluzione inventata produce
    un'etichetta della misura sbagliata senza dirlo. */
export const DPI_AMMESSI = [203, 300, 600] as const;
export type Dpi = typeof DPI_AMMESSI[number];

/** Le porte RAW delle Zebra. L'elenco è chiuso, e il servizio ne tiene una
    copia sua: una «stampante» a `127.0.0.1:5432` farebbe parlare il servizio
    col proprio PostgreSQL, e il cancello che conta è quello di là. */
export const PORTE_AMMESSE = [6101, 9100, 9101, 9102, 9103] as const;

/** Quante etichette per invio. Non è un limite tecnico: è un dito che
    scivola. «1» diventa «100» con uno zero di troppo. */
export const COPIE_MAX = 50;

/* Le tre misure che decidono dove finisce ogni riga. Sono le stesse di
   `server/lib/zpl.js`, e le prove le confrontano. */
export const MARGINE_MM = 3;
export const INTERLINEA_MM = 1;
/** La riga in chiaro che la testina stampa sotto le barre, e che non entra
    nell'altezza dichiarata del simbolo. Non contarla vuol dire il campo
    successivo stampato sopra il codice. */
export const INTERPRETAZIONE_MM = 3.5;

export interface Stampante {
  printer_id: string;
  nome: string;
  host: string;
  porta: number;
  dpi: Dpi;
  /** Il SUPPORTO montato sulla macchina, non il layout: è una proprietà
      della stampante, e due stampanti con la stessa disposizione di campi
      possono avere rotoli diversi. */
  larghezza_mm: number;
  altezza_mm: number;
  /** Facoltativo, e serve a UNA cosa: proporre la stampante giusta. La
      stampante di MAG1 è quella vicina a MAG1, e chi etichetta merce che sta
      in MAG1 non deve sceglierla da un elenco ogni volta. */
  site_id: string;
  attiva: boolean;
}

export type Allineamento = 'L' | 'C' | 'R';

export interface RigaEtichetta {
  campo: string;
  attivo: boolean;
  altezza_mm: number;
  allineamento: Allineamento;
  /** Quante righe di testo il campo può occupare mandando a capo. Serve alla
      descrizione, che a 120 caratteri su 100 mm non ci sta in una. */
  righe_testo: number;
}

export interface LayoutEtichetta { righe: RigaEtichetta[]; }

/* ── I CAMPI CHE UN'ETICHETTA MERCE PUÒ PORTARE ───────────────────────────

   L'elenco è quello di `server/lib/zpl.js`, che è chi li sa leggere dal
   database: qui ci sono i nomi a video e la nota che spiega cosa si sta
   accendendo. Chi configura sceglie QUALI, in che ordine e quanto grandi;
   inventarne uno che il servizio non conosce non è possibile, ed è il motivo
   per cui questa tabella sta nel codice e il layout nei dati. */
export const CAMPI_ETICHETTA: readonly {
  campo: string; nome: string; nota: string; barre?: boolean; invecchia?: boolean;
}[] = [
  { campo: 'articolo',    nome: 'Codice articolo',
    nota: 'Il codice, in chiaro e in cima: si legge senza lettore.' },
  { campo: 'descrizione', nome: 'Descrizione',
    nota: 'La descrizione d’anagrafica. Va a capo su più righe se serve.' },
  { campo: 'barcode',     nome: 'Codice a barre', barre: true,
    nota: 'Code128 con ARTICOLO#LOTTO — la stessa chiave che Movimenta cerca. Sotto le barre la testina scrive il codice in chiaro.' },
  { campo: 'lotto',       nome: 'Lotto',
    nota: 'Il lotto, che non cambia finché la merce è quella.' },
  { campo: 'scadenza',    nome: 'Scadenza',
    nota: 'La data di scadenza, in giorno/mese/anno.' },
  { campo: 'peso',        nome: 'Peso / quantità in UM',
    nota: 'La quantità in unità di misura. Su un articolo in KG o GR la riga dice «Peso», sugli altri «Quantità»: chiamare peso dei pezzi è una bugia che resta incollata per mesi.' },
  { campo: 'colli',       nome: 'Colli',
    nota: 'Quanti colli porta la riga adesso.' },
  { campo: 'ubicazione',  nome: 'Ubicazione', invecchia: true,
    nota: '⚠️ INVECCHIA. Un pallet si sposta, e un’ubicazione stampata resta a dire una cosa che non è più vera. Esce dichiarata «alla stampa».' },
];

const CAMPI_PER_NOME = new Map(CAMPI_ETICHETTA.map((c) => [c.campo, c]));

/* ── I CAMPI DELL'ETICHETTA DI UN BANCALE — 2.20 ─────────────────────────

   Catalogo suo, non un'aggiunta a quello della merce: le due etichette
   rispondono a domande diverse. Quella della merce identifica una RIGA DI
   GIACENZA (`item_key`), questa identifica il BANCALE (`udc_id`), che e'
   l'oggetto che il muletto sposta e che il DDT nomina.

   L'elenco e' quello di `server/lib/zpl.js`, che e' chi li sa leggere dal
   database: qui ci sono i nomi a video e la nota. */
export const CAMPI_ETICHETTA_PF: readonly {
  campo: string; nome: string; nota: string; barre?: boolean; invecchia?: boolean;
}[] = [
  { campo: 'bancale',     nome: 'Codice bancale', barre: true,
    nota: 'Code128 col numero del bancale — la stessa stringa dell’etichetta su A4. Sotto le barre la testina scrive il codice in chiaro.' },
  { campo: 'articolo',    nome: 'Codice articolo',
    nota: 'Su un bancale misto la riga dice «MISTO — n partite»: un pallet con due partite non ha «un» articolo.' },
  { campo: 'descrizione', nome: 'Descrizione',
    nota: 'La descrizione d’anagrafica. Vuota su un bancale misto.' },
  { campo: 'lotto',       nome: 'Lotto',
    nota: 'Vuoto su un bancale misto: il dettaglio lo porta la packing list.' },
  { campo: 'scadenza',    nome: 'Scadenza',
    nota: 'Vuota su un bancale misto, per la stessa ragione del lotto.' },
  { campo: 'colli',       nome: 'Colli',
    nota: 'Quanti colli porta il bancale adesso — la somma di tutte le sue righe.' },
  { campo: 'peso',        nome: 'Peso / quantità in UM',
    nota: 'La quantità in unità di misura. Con unità diverse sul bancale la riga resta vuota: 300 KG più 40 PZ fanno 340 di niente.' },
  { campo: 'odp',         nome: 'Ordine di produzione',
    nota: 'Quando c’è: il legame all’ordine è facoltativo per decisione. Nasce spento.' },
  { campo: 'ubicazione',  nome: 'Ubicazione', invecchia: true,
    nota: '⚠️ INVECCHIA. Un bancale si sposta, e l’ubicazione stampata resta a dire una cosa che non è più vera.' },
];

const CAMPI_PF_PER_NOME = new Map(CAMPI_ETICHETTA_PF.map((c) => [c.campo, c]));

/** Quale delle due etichette a layout: la merce o il bancale. */
export type GenereEtichetta = 'merce' | 'bancale';

export function campiDi(genere: GenereEtichetta = 'merce') {
  return genere === 'bancale' ? CAMPI_ETICHETTA_PF : CAMPI_ETICHETTA;
}

/** Il layout di serie: i quattro dati che l'etichetta deve portare — barre,
    descrizione, scadenza, peso — più i due che la rendono leggibile senza
    lettore. Colli e ubicazione esistono e nascono spenti.

    LE MISURE SONO QUELLE DEL SUPPORTO VERO: adesive staccate 100 × 80. Occupa
    68,5 mm degli 80, e gli 11,5 che restano non sono spazio sprecato — su
    un'etichetta staccata il registro balla di un millimetro o due a ogni
    avanzamento, e un campo a filo del bordo è un campo che prima o poi si
    taglia. Con colli e ubicazione accesi si sale a 78,7: ci sta, appena, e la
    scheda di configurazione lo dice mentre li si accende.

    I CORPI SONO GRANDI PERCHÉ CHI LEGGE HA I GUANTI. Il peso è il numero che
    l'operatore cerca per primo, e ha il corpo del codice articolo. */
export const LAYOUT_DI_SERIE: LayoutEtichetta = {
  righe: [
    { campo: 'articolo',    attivo: true,  altezza_mm: 6.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'descrizione', attivo: true,  altezza_mm: 4,   allineamento: 'L', righe_testo: 2 },
    { campo: 'barcode',     attivo: true,  altezza_mm: 22,  allineamento: 'C', righe_testo: 1 },
    { campo: 'lotto',       attivo: true,  altezza_mm: 5.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'scadenza',    attivo: true,  altezza_mm: 5.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'peso',        attivo: true,  altezza_mm: 6.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'colli',       attivo: false, altezza_mm: 5,   allineamento: 'L', righe_testo: 1 },
    { campo: 'ubicazione',  attivo: false, altezza_mm: 3.2, allineamento: 'R', righe_testo: 1 },
  ],
};

/* IL LAYOUT DI SERIE DEL BANCALE — 2.20. Le barre col codice del bancale in
   mezzo, sopra il codice articolo e la descrizione, sotto lotto, scadenza,
   colli e peso. Ordine di produzione e ubicazione nascono spenti: il primo
   non ce l'hanno tutti i bancali, la seconda invecchia.

   Sullo stesso supporto della merce — 100 × 80 — occupa 70 mm degli 80. È lo
   stesso elenco di `server/lib/zpl.js`, e `test/stampanti.test.js` confronta
   i due conti riga per riga. */
export const LAYOUT_PF_DI_SERIE: LayoutEtichetta = {
  righe: [
    { campo: 'articolo',    attivo: true,  altezza_mm: 6.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'descrizione', attivo: true,  altezza_mm: 4,   allineamento: 'L', righe_testo: 1 },
    { campo: 'bancale',     attivo: true,  altezza_mm: 20,  allineamento: 'C', righe_testo: 1 },
    { campo: 'lotto',       attivo: true,  altezza_mm: 5.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'scadenza',    attivo: true,  altezza_mm: 5.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'colli',       attivo: true,  altezza_mm: 6.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'peso',        attivo: true,  altezza_mm: 6.5, allineamento: 'L', righe_testo: 1 },
    { campo: 'odp',         attivo: false, altezza_mm: 4,   allineamento: 'L', righe_testo: 1 },
    { campo: 'ubicazione',  attivo: false, altezza_mm: 3.2, allineamento: 'R', righe_testo: 1 },
  ],
};

/** Una stampante nuova, con le misure del supporto in uso: **adesive staccate
    100 × 80 su testina a 203 dpi**, che è la serie ZD200 del magazzino.
    Larghezza di stampa 799 punti, dentro i 104 mm che una desktop da 4
    pollici copre.

    Non è la misura dell'etichetta su A4 (`.item-label`, 100 × 60): quella è
    un ripiego su foglio e non deve imitare il rotolo. §8 — la stampa non si
    migra, e le due strade portano lo stesso codice a barre, non lo stesso
    formato. */
export function stampanteDiSerie(): Stampante {
  return {
    printer_id: '', nome: '', host: '', porta: 9100, dpi: 203,
    larghezza_mm: 100, altezza_mm: 80, site_id: '', attiva: true,
  };
}

const ALLINEAMENTI = new Set<Allineamento>(['L', 'C', 'R']);

/** Una riga di layout ripulita e completata coi valori di serie: un layout
    salvato da una versione precedente non deve far mancare le chiavi aggiunte
    dopo. È la stessa regola di `getDocConfig`, e la ragione è la stessa. */
export function leggiRiga(
  r: Partial<RigaEtichetta> | null | undefined,
  genere: GenereEtichetta = 'merce',
): RigaEtichetta | null {
  const campo = String(r?.campo ?? '');
  const noti = genere === 'bancale' ? CAMPI_PF_PER_NOME : CAMPI_PER_NOME;
  if (!noti.has(campo)) return null;
  const alta = Number(r?.altezza_mm);
  const quante = Math.trunc(Number(r?.righe_testo));
  return {
    campo,
    attivo: r?.attivo !== false,
    altezza_mm: Number.isFinite(alta) && alta > 0 ? alta : 4,
    allineamento: ALLINEAMENTI.has(r?.allineamento as Allineamento)
      ? (r!.allineamento as Allineamento) : 'L',
    righe_testo: Number.isFinite(quante) && quante > 0 ? Math.min(quante, 4) : 1,
  };
}

/** Il layout com'è scritto nei dati, o quello di serie se non c'è. Un layout
    senza nemmeno una riga valida non è un layout: si ripiega. */
export function leggiLayout(salvato: unknown, genere: GenereEtichetta = 'merce'): LayoutEtichetta {
  const serie = genere === 'bancale' ? LAYOUT_PF_DI_SERIE : LAYOUT_DI_SERIE;
  const grezze = Array.isArray((salvato as LayoutEtichetta)?.righe)
    ? (salvato as LayoutEtichetta).righe : [];
  const righe = grezze.map((r) => leggiRiga(r, genere))
    .filter((r): r is RigaEtichetta => r !== null);
  return righe.length
    ? { righe }
    : { righe: serie.righe.map((r) => leggiRiga(r, genere)) as RigaEtichetta[] };
}

export interface BloccoDisposto extends RigaEtichetta { y_mm: number; alta_mm: number; }
export interface Disposizione {
  blocchi: BloccoDisposto[];
  usato_mm: number;
  disponibile_mm: number | null;
  ci_sta: boolean;
}

/** Dove finisce ogni riga, e quanto occupa il tutto. Lo stesso conto del
    servizio — vedi la testata: là RIFIUTA, qui avvisa mentre si configura. */
export function disponi(
  layout: unknown,
  altezzaSupportoMm?: number | null,
  genere: GenereEtichetta = 'merce',
): Disposizione {
  const righe = leggiLayout(layout, genere).righe;
  const blocchi: BloccoDisposto[] = [];
  let y = MARGINE_MM;
  for (const r of righe) {
    if (!r.attivo) continue;
    const alta = (genere === 'bancale' ? CAMPI_PF_PER_NOME : CAMPI_PER_NOME).get(r.campo)?.barre
      ? r.altezza_mm + INTERPRETAZIONE_MM
      : r.altezza_mm * r.righe_testo;
    blocchi.push({ ...r, y_mm: y, alta_mm: alta });
    y += alta + INTERLINEA_MM;
  }
  const usato = blocchi.length ? y - INTERLINEA_MM + MARGINE_MM : MARGINE_MM * 2;
  const disponibile = Number(altezzaSupportoMm);
  return {
    blocchi,
    usato_mm: Math.round(usato * 10) / 10,
    disponibile_mm: Number.isFinite(disponibile) ? disponibile : null,
    ci_sta: Number.isFinite(disponibile) ? usato <= disponibile + 0.05 : true,
  };
}

/* ── LA CONVALIDA ─────────────────────────────────────────────────────────

   Le stesse regole del servizio, e non è una duplicazione da togliere: il
   servizio non si fida del client per principio — `meta` la scrive chiunque
   abbia una sessione, non solo la maschera — e il client non manda a
   sbattere chi sta compilando un modulo. Uno difende, l'altro accompagna.

   Restituisce l'elenco dei motivi, vuoto quando va bene: è la forma che
   `validaPrefissoGS1` usa già. */
export function validaStampante(s: Partial<Stampante>, altre: Stampante[] = []): string[] {
  const e: string[] = [];
  const nome = String(s.nome ?? '').trim();
  if (!nome) e.push('Il nome serve: è quello che l’operatore sceglie in corsia');
  if (nome.length > 60) e.push('Il nome sta in 60 caratteri');

  const host = String(s.host ?? '').trim();
  if (!host) e.push('Manca l’indirizzo IP o il nome di rete della stampante');
  else if (host.length > 100) e.push('L’indirizzo sta in 100 caratteri');
  else if (/[\s/\\@]/.test(host)) e.push('L’indirizzo non porta spazi né barre: è un IP o un nome di rete');

  if (!(PORTE_AMMESSE as readonly number[]).includes(Number(s.porta))) {
    e.push(`La porta dev’essere una porta di stampa Zebra: ${PORTE_AMMESSE.join(', ')}`);
  }
  if (!(DPI_AMMESSI as readonly number[]).includes(Number(s.dpi))) {
    e.push(`I dpi della testina sono ${DPI_AMMESSI.join(', ')}`);
  }
  for (const [v, come] of [[s.larghezza_mm, 'larghezza'], [s.altezza_mm, 'altezza']] as const) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 10 || n > 300) {
      e.push(`La ${come} del supporto sta fra 10 e 300 mm`);
    }
  }
  /* Due stampanti con lo stesso nome sono due stampanti che in corsia si
     scelgono a caso. L'identificativo invece lo genera il codice. */
  if (nome && altre.some((a) => a.printer_id !== s.printer_id
      && a.nome.trim().toLowerCase() === nome.toLowerCase())) {
    e.push(`C’è già una stampante che si chiama «${nome}»`);
  }
  return e;
}

/** Un identificativo nuovo, che non collide con quelli già in elenco. Non è
    un numero d'ordine: è una chiave, e non si riusa mai — un'etichetta
    stampata da `STP-3` deve restare rintracciabile anche dopo che quella
    stampante è stata tolta. */
export function nuovoIdStampante(esistenti: Stampante[]): string {
  const usati = new Set(esistenti.map((s) => s.printer_id));
  let n = esistenti.length + 1;
  while (usati.has(`STP-${n}`)) n++;
  return `STP-${n}`;
}

/**
 * Quale stampante proporre a chi sta per stampare.
 *
 * L'ORDINE È UNA REGOLA DI MAGAZZINO, non una preferenza. Chi ha appena
 * scelto una stampante la vuole ancora — sta in piedi accanto a quella. Chi
 * non ha mai scelto vuole quella del proprio sito, perché la stampante di
 * MAG1 è quella vicina a MAG1: mandare un'etichetta di MAG1 sulla stampante
 * di MAG2 vuol dire un operatore che attraversa il magazzino per raccogliere
 * un pezzo di carta.
 *
 * `ricordata` viene dal browser di quel terminale — vedi `Store` — e non dal
 * database: quale macchina hai vicino è un fatto del posto in cui stai, non
 * dell'azienda.
 */
export function proponiStampante(
  stampanti: Stampante[],
  { ricordata = '', siteId = '' }: { ricordata?: string; siteId?: string } = {},
): Stampante | null {
  const attive = stampanti.filter((s) => s.attiva !== false);
  if (!attive.length) return null;
  return attive.find((s) => s.printer_id === ricordata)
      ?? (siteId ? attive.find((s) => s.site_id && s.site_id === siteId) : undefined)
      ?? (attive.length === 1 ? attive[0] : null)
      ?? null;
}

/** Le copie, dentro i limiti. Il servizio ne tiene una copia sua e rifiuta
    sopra il tetto: qui si accompagna chi digita, là si difende. */
export function leggiCopie(n: unknown): number {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(v, COPIE_MAX);
}
