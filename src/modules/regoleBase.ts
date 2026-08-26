/* LE REGOLE CHE NON SI SCRIVONO — 2.8.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `storage_rules` sono le regole di POLITICA: «i 700 vanno in MAG2» cambia
   quando cambia la politica, e per questo è un record che si scrive in
   Configurazione. Qui invece stanno le due regole che NESSUNO scrive perché
   non sono una politica: sono il modo in cui un magazzino resta leggibile.

   LA PRIMA — LO STESSO ARTICOLO STA NELLA STESSA UDC. È un consiglio forte,
   non un divieto: chi ha il pallet davanti vede cose che il sistema non sa —
   il pallet è già alto, il carrello non ci arriva, quel bancale parte domani.
   L'operatore scavalca, e il motivo resta a registro.

   LA SECONDA — LO STESSO ARTICOLO/LOTTO STA NELLA STESSA UBICAZIONE. Questa
   NON si scavalca, e la ragione non è l'ordine: è che `item_key` è
   `articolo#lotto` e la giacenza di quel lotto è UNA riga per vano. Lo stesso
   lotto in due vani è la stessa merce contata due volte da chi guarda, e il
   FEFO la ordina come se fossero due partite diverse. Il 26/08 è già successo
   per una differenza di maiuscole — §2.6 — e quella volta bastò un lotto
   digitato in minuscolo. Qui si chiude la porta anche a chi lo fa apposta.

   L'ECCEZIONE, CHE È DELLO STATO DEL VANO E NON DELLA PERSONA. Se il vano di
   casa è pieno, bloccato o disattivato, il lotto non può tornarci e rifiutare
   vorrebbe dire fermare uno scarico in banchina. Allora — e SOLO allora — si
   apre un secondo vano, e la mappa lo segnala come lotto sparso: un avviso,
   non un errore. Chi decide non è l'operatore, è lo stato del vano; e appena
   il vano di casa torna disponibile la regola torna a mordere.

   LA MATRICE DI INCOMPATIBILITÀ è la terza cosa che sta qui, ed è un dato:
   quali pericolosità non possono dividere lo stesso vano. INFIAMMABILE con
   COMBURENTE è l'esempio che tutti conoscono, ma l'elenco è aziendale come i
   codici di pericolo — `modules/parametri.ts` — e quindi si configura.

   Nessuno stato, nessun accesso a Store, nessun DOM. Collaudato da fermo in
   `test/regoleBase.test.js`. */

/* ── Che cosa è già in giro ─────────────────────────────────────────── */

/** Una riga di giacenza, per quel poco che serve a queste regole. */
export interface RigaPresente {
  location_code: string;
  item_key?: string;
  article_code: string;
  lot_code?: string;
  udc_id?: string | null;
  qty?: number;
}

/** La chiave della merce, nella stessa forma di `item_key`: il lotto NON si
    alza a maiuscolo perché `item_key` a database è scritto così. Chi
    normalizza i codici è il servizio — §2.6 — e qui si confronta, non si
    corregge. */
export function chiaveMerce(articleCode: unknown, lotCode: unknown): string {
  return `${String(articleCode ?? '').trim().toUpperCase()}#${String(lotCode ?? '').trim()}`;
}

/* ── Regola 2 — lo stesso lotto, la stessa ubicazione ───────────────── */

/** I vani dove questo articolo/lotto sta GIÀ, con quanto ce n'è.

    Sono più d'uno solo quando l'eccezione ha già lavorato: in un magazzino
    in regola questo elenco ha zero o un elemento. */
export function caseDelLotto(
  righe: readonly RigaPresente[] | null | undefined,
  articleCode: string,
  lotCode: string,
  escludi: readonly string[] | null | undefined = null,
): { location_code: string; qty: number }[] {
  if (!righe?.length) return [];
  const chiave = chiaveMerce(articleCode, lotCode);
  /* LE AREE DI TRANSITO NON SONO CASA. Il vano WIP tiene merce di
     passaggio: contarlo come casa vorrebbe dire rifiutare di posizionare a
     scaffale un lotto di cui la produzione ha in mano tre colli. */
  const fuori = new Set(
    (escludi ?? []).map(c => String(c ?? '').trim().toUpperCase()).filter(Boolean));
  const per = new Map<string, number>();
  for (const r of righe) {
    if (!r?.location_code) continue;
    if (fuori.has(String(r.location_code).toUpperCase())) continue;
    const k = r.item_key || chiaveMerce(r.article_code, r.lot_code);
    if (k !== chiave) continue;
    const q = Number(r.qty) || 0;
    if (q <= 0) continue;
    per.set(r.location_code, (per.get(r.location_code) || 0) + q);
  }
  return [...per.entries()]
    .map(([location_code, qty]) => ({ location_code, qty }))
    .sort((a, b) => b.qty - a.qty || a.location_code.localeCompare(b.location_code));
}

/** Se un vano di casa può ancora ricevere merce, e altrimenti perché no.
    Lo decide chi ha lo Store: qui si dichiara solo la forma della risposta. */
export interface Disponibilita {
  ok: boolean;
  /** In chiaro. Finisce a video dentro il messaggio del verdetto. */
  motivo?: string;
}

export type EsitoCasa =
  /** Il lotto non è in nessun vano: si può mettere dove si vuole. */
  | 'primo'
  /** Il vano scelto È quello di casa. */
  | 'casa'
  /** Casa non può ricevere: il secondo vano è ammesso, e si segnala. */
  | 'estensione'
  /** Casa può ricevere: il vano scelto si rifiuta. */
  | 'vietato';

export interface VerdettoCasa {
  esito: EsitoCasa;
  /** Vero quando chi scrive DEVE rifiutare. Non c'è scavalco che lo tolga. */
  vietato: boolean;
  /** I vani dove il lotto sta già. */
  case: string[];
  /** Il vano di casa che potrebbe ricevere — è quello dove va la merce. */
  casaLibera: string | null;
  messaggio: string;
}

/** Si può mettere questo lotto in questo vano?

    `disponibile` risponde per un vano di casa: può ancora ricevere `colli`?
    Chi chiama ha lo Store e sa guardare stato, capienza e portata; qui si
    guarda solo la regola. Un vano di casa che non si sa valutare —
    `disponibile` non risponde — si considera disponibile: un vincolo che non
    si conosce non è un vincolo che si viola, come per la capienza in
    `stoccaggio.ts`. */
export function verdettoCasa(
  righe: readonly RigaPresente[] | null | undefined,
  articleCode: string,
  lotCode: string,
  sceltoCode: string | null | undefined,
  disponibile?: ((location_code: string) => Disponibilita | null | undefined) | null,
  escludi: readonly string[] | null | undefined = null,
): VerdettoCasa {
  const scelto = String(sceltoCode ?? '').trim().toUpperCase();
  const case_ = caseDelLotto(righe, articleCode, lotCode, escludi);
  const codici = case_.map(c => c.location_code);

  if (!codici.length) {
    return {
      esito: 'primo', vietato: false, case: [], casaLibera: null,
      messaggio: '',
    };
  }

  if (scelto && codici.includes(scelto)) {
    return {
      esito: 'casa', vietato: false, case: codici, casaLibera: scelto,
      messaggio: `${scelto} è dove questo lotto sta già: la giacenza resta una riga sola`,
    };
  }

  /* Fra i vani di casa, il primo che può ancora ricevere. Se ce n'è uno, la
     merce va lì e non altrove — e il messaggio lo dice col codice in chiaro,
     perché «non si può» senza «allora dove» è una porta chiusa e basta. */
  let casaLibera: string | null = null;
  const perche: string[] = [];
  for (const c of codici) {
    const d = disponibile ? disponibile(c) : null;
    if (!d || d.ok !== false) { casaLibera = c; break; }
    perche.push(`${c} — ${d.motivo || 'non può ricevere'}`);
  }

  if (casaLibera) {
    return {
      esito: 'vietato', vietato: true, case: codici, casaLibera,
      messaggio: `Il lotto ${String(lotCode ?? '').trim() || '—'} di ${String(articleCode ?? '').trim().toUpperCase()} sta in ${casaLibera}: lo stesso lotto sta in un'ubicazione sola e questa non si scavalca. Posiziona in ${casaLibera}.`,
    };
  }

  return {
    esito: 'estensione', vietato: false, case: codici, casaLibera: null,
    messaggio: `${codici.join(', ')} non ${codici.length > 1 ? 'possono' : 'può'} ricevere (${perche.join(' · ')}): il lotto si estende su un secondo vano, e la mappa lo segnala.`,
  };
}

/* ── Regola 1 — lo stesso articolo, la stessa UDC ───────────────────── */

/** Un'unità di carico candidata, con quel che c'è dentro. */
export interface UdcCandidata {
  udc_id: string;
  status?: string;
  location_code?: string | null;
  /** Le righe che stanno su questa UDC. */
  righe?: readonly RigaPresente[];
  /** Quanti colli ci stanno in tutto. Assente = non dichiarata. */
  capienza?: number | null;
  /** Quanti ce ne sono adesso. */
  occupati?: number;
}

export interface PropostaUdc {
  udc_id: string;
  /** `lotto` batte `articolo`: si somma alla riga che c'è già. */
  motivo: 'lotto' | 'articolo';
  perche: string;
}

/** Solo le UDC che possono ancora ricevere: una chiusa non si riapre, una
    spedita non è più in casa. Lo stato ignoto si considera aperto — le UDC
    scritte prima della 1.12 non ce l'hanno. */
function apertaEConSpazio(u: UdcCandidata): boolean {
  const st = String(u.status ?? 'open');
  if (st === 'closed' || st === 'shipped') return false;
  const cap = typeof u.capienza === 'number' ? u.capienza : null;
  if (cap !== null && (Number(u.occupati) || 0) >= cap) return false;
  return true;
}

/** Quanto spazio resta, per ordinare. Capienza non dichiarata = si ordina
    per quanto c'è dentro, che è l'unica cosa che si sa. */
function spazioResiduo(u: UdcCandidata): number {
  const cap = typeof u.capienza === 'number' ? u.capienza : null;
  const occ = Number(u.occupati) || 0;
  return cap !== null ? cap - occ : Number.MAX_SAFE_INTEGER - occ;
}

/** Su quale UDC va questo articolo.

    Prima una UDC che porta già lo stesso articolo E lo stesso lotto — la
    riga si somma a quella che c'è. Poi una che porta lo stesso articolo.
    Fra pari vince quella con più spazio residuo: riempire la più vuota tiene
    aperte meno unità, e un'unità aperta è una che nessuno chiude.

    `null` quando non c'è niente da consigliare — e non è un errore: la
    prima volta che un articolo entra in magazzino, nessuna UDC lo porta. */
export function udcConsigliata(
  udc: readonly UdcCandidata[] | null | undefined,
  articleCode: string,
  lotCode: string,
): PropostaUdc | null {
  if (!udc?.length) return null;
  const code = String(articleCode ?? '').trim().toUpperCase();
  if (!code) return null;
  const chiave = chiaveMerce(articleCode, lotCode);

  const conLotto: UdcCandidata[] = [];
  const conArticolo: UdcCandidata[] = [];

  for (const u of udc) {
    if (!u?.udc_id || !apertaEConSpazio(u)) continue;
    let lotto = false;
    let articolo = false;
    for (const r of (u.righe || [])) {
      if (String(r?.article_code ?? '').trim().toUpperCase() !== code) continue;
      articolo = true;
      const k = r.item_key || chiaveMerce(r.article_code, r.lot_code);
      if (k === chiave) { lotto = true; break; }
    }
    if (lotto) conLotto.push(u);
    else if (articolo) conArticolo.push(u);
  }

  const ordina = (a: UdcCandidata, b: UdcCandidata) =>
    spazioResiduo(b) - spazioResiduo(a) || a.udc_id.localeCompare(b.udc_id);

  const vinta = conLotto.sort(ordina)[0] ?? conArticolo.sort(ordina)[0] ?? null;
  if (!vinta) return null;

  const daLotto = conLotto.includes(vinta);
  return {
    udc_id: vinta.udc_id,
    motivo: daLotto ? 'lotto' : 'articolo',
    perche: daLotto
      ? `Su ${vinta.udc_id} c’è già questo lotto: la riga si somma a quella che c’è`
      : `Su ${vinta.udc_id} c’è già questo articolo: lo stesso articolo sta sulla stessa unità di carico`,
  };
}

/** Il testo dello scavalco sull'unità di carico. Come `stoccaggio.scavalco`,
    e per la stessa ragione: la regola 1 si può scavalcare, e l'unico dato che
    fra tre mesi dirà se vale è il motivo che qualcuno ha scritto. */
export function scavalcoUdc(
  propostaId: string | null | undefined,
  sceltaId: string | null | undefined,
  motivo: string | null | undefined,
): string | null {
  const p = String(propostaId ?? '').trim();
  const s = String(sceltaId ?? '').trim();
  if (!p || p === s) return null;
  const m = String(motivo ?? '').trim();
  return `UDC proposta ${p}, scelta ${s || '— nessuna'}${m ? ` — ${m}` : ''}`;
}

/* ── I motivi precompilati dello scavalco ───────────────────────────── */

/* PERCHE' TRE, E PERCHE' PRECOMPILATI.

   Fino alla 2.7 lo scavalco aveva un campo di testo libero e basta. Un
   campo libero su un terminale, con la merce in mano e il muletto acceso,
   si compila con «ok», «vedi sopra» o niente — e allora il dato che
   dovrebbe dire fra tre mesi se le regole valgono non dice piu' niente.

   Tre bottoni si premono. E sono TRE e non dieci perche' un elenco lungo
   torna a essere una scelta da leggere, cioe' lo stesso costo del campo
   libero con in piu' l'illusione di aver misurato qualcosa.

   IL TESTO LIBERO NON SPARISCE: resta accanto, per il caso che questi tre
   non coprono. Chi lo compila sta dicendo qualcosa che vale la pena
   leggere proprio perche' ha fatto la fatica di scriverlo. */
export const MOTIVI_SCAVALCO: readonly { code: string; testo: string }[] = [
  { code: 'MEZZO', testo: 'Il posto proposto non è raggiungibile col mezzo disponibile' },
  { code: 'USCITA', testo: 'Merce in uscita a breve: tenuta vicino alla baia di spedizione' },
  { code: 'SPAZIO', testo: 'Il posto proposto è occupato o non ha lo spazio che dichiara' },
];

/** Il testo di un motivo di scavalco: il precompilato scelto, quello
    scritto a mano, o tutti e due. Vuoto quando non c'è nessuno dei due —
    e chi chiama decide se pretenderlo o lasciar correre. */
export function testoScavalco(
  code: string | null | undefined,
  libero: string | null | undefined,
): string {
  const scelto = MOTIVI_SCAVALCO.find(m => m.code === String(code ?? '').trim().toUpperCase());
  const l = String(libero ?? '').trim();
  if (scelto && l) return `${scelto.testo} — ${l}`;
  if (scelto) return scelto.testo;
  return l;
}

/* ── La matrice di incompatibilità ──────────────────────────────────── */

/** Due pericolosità che non possono dividere lo stesso vano. L'ordine dentro
    la coppia non conta: la si normalizza alfabetica per poterla confrontare. */
export interface CoppiaIncompatibile {
  a: string;
  b: string;
  /** Perché, in chiaro: lo legge chi si vede escludere un vano. */
  nota?: string;
}

/** Un punto di partenza, non un vincolo: come i sei pericoli di
    `parametri.ts`, queste tre coppie si tolgono e se ne aggiungono altre.
    Sono le tre che nessun magazzino chimico discute — un comburente cede
    ossigeno a un infiammabile, un corrosivo apre i contenitori degli altri
    due — e servono a far trovare la matrice già utile al primo giorno. */
export const INCOMPATIBILITA_DI_SERIE: readonly CoppiaIncompatibile[] = [
  { a: 'COMBURENTE', b: 'INFIAMMABILE', nota: 'Il comburente alimenta la fiamma' },
  { a: 'CORROSIVO', b: 'INFIAMMABILE', nota: 'Il corrosivo apre i contenitori' },
  { a: 'COMBURENTE', b: 'CORROSIVO', nota: 'Il corrosivo apre i contenitori' },
];

function normalizzaCodice(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

/** La chiave di una coppia, indipendente dall'ordine. */
function chiaveCoppia(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

/** La matrice ripulita: codici in maiuscolo, coppie senza doppioni, e via
    quelle che non dicono niente — una coppia vuota, o un codice con se
    stesso. Due colli dello stesso pericolo stanno insieme benissimo: è
    quello il motivo per cui esistono le zone dedicate. */
export function normalizzaMatrice(raw: unknown): CoppiaIncompatibile[] {
  if (!Array.isArray(raw)) return [];
  const out: CoppiaIncompatibile[] = [];
  const viste = new Set<string>();
  for (const c of raw) {
    const a = normalizzaCodice((c as CoppiaIncompatibile)?.a);
    const b = normalizzaCodice((c as CoppiaIncompatibile)?.b);
    if (!a || !b || a === b) continue;
    const k = chiaveCoppia(a, b);
    if (viste.has(k)) continue;
    viste.add(k);
    const nota = String((c as CoppiaIncompatibile)?.nota ?? '').trim();
    out.push(a < b ? { a, b, ...(nota ? { nota } : {}) } : { a: b, b: a, ...(nota ? { nota } : {}) });
  }
  return out.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

/** Vero se queste due pericolosità non possono stare nello stesso vano. */
export function incompatibili(
  matrice: readonly CoppiaIncompatibile[] | null | undefined,
  a: string, b: string,
): boolean {
  if (!matrice?.length) return false;
  const k = chiaveCoppia(normalizzaCodice(a), normalizzaCodice(b));
  return matrice.some(c => chiaveCoppia(normalizzaCodice(c.a), normalizzaCodice(c.b)) === k);
}

export interface Scontro {
  /** La pericolosità della merce che sta arrivando. */
  entrante: string;
  /** Quella che è già nel vano. */
  presente: string;
  nota?: string;
}

/** Gli scontri fra ciò che sta arrivando e ciò che c'è già nel vano.

    Si guarda una direzione sola — entrante contro presente — perché è quella
    la domanda: la merce che c'è è già lì, e spostarla non è compito di chi
    sta posizionando. Se due cose incompatibili si trovano già insieme, a
    dirlo è la verifica di conformità, che guarda il magazzino da fermo. */
export function scontri(
  matrice: readonly CoppiaIncompatibile[] | null | undefined,
  entranti: readonly string[] | null | undefined,
  presenti: readonly string[] | null | undefined,
): Scontro[] {
  if (!matrice?.length || !entranti?.length || !presenti?.length) return [];
  const out: Scontro[] = [];
  const viste = new Set<string>();
  for (const e of entranti) {
    for (const p of presenti) {
      const ce = normalizzaCodice(e);
      const cp = normalizzaCodice(p);
      if (!ce || !cp || ce === cp) continue;
      const k = chiaveCoppia(ce, cp);
      if (viste.has(k)) continue;
      const coppia = matrice.find(c => chiaveCoppia(normalizzaCodice(c.a), normalizzaCodice(c.b)) === k);
      if (!coppia) continue;
      viste.add(k);
      out.push({ entrante: ce, presente: cp, ...(coppia.nota ? { nota: coppia.nota } : {}) });
    }
  }
  return out;
}

/* ── Le regole base, dichiarate ─────────────────────────────────────── */

/** Le due regole preinstallate, come le legge chi apre Configurazione.

    Stanno qui e non nella maschera per la stessa ragione per cui `PUNTI` sta
    in `stoccaggio.ts`: la scheda che le mostra e il motore che le applica
    devono dire la stessa cosa, e due testi separati divergono al primo
    ritocco. */
export const REGOLE_BASE = Object.freeze([
  Object.freeze({
    id: 'UDC_UNICA',
    titolo: 'Lo stesso articolo sta sulla stessa unità di carico',
    testo: 'Quando l’articolo è già su un’UDC aperta, il sistema propone quella — '
      + 'prima con lo stesso lotto, poi con lo stesso articolo, e fra pari la più vuota.',
    override: true,
    comeSiScavalca: 'L’operatore può scegliere un’altra UDC: il motivo resta a registro.',
  }),
  Object.freeze({
    id: 'UBICAZIONE_UNICA',
    titolo: 'Lo stesso articolo/lotto sta nella stessa ubicazione',
    testo: 'Quando il lotto è già in un vano, la merce di quel lotto va lì e in nessun altro posto. '
      + 'Lo stesso lotto in due vani è la stessa merce contata due volte, e il FEFO la ordina come due partite.',
    override: false,
    comeSiScavalca: 'Non si scavalca. Se il vano di casa è pieno, bloccato o disattivato — e solo allora — '
      + 'il lotto si estende su un secondo vano e la mappa lo segnala.',
  }),
] as const);
