import type { MOV } from './contratto.js';
import type {
  CodiceAllergene, ClasseTemperatura, CodiceCertificazione,
} from '../modules/anagrafica.js';

/** 1.4.2 — l'unità in cui si contano i pezzi dentro il collo.
    Assente sull'articolo = gestione a soli colli, cioè come nella 1.2. */
export type UnitaMisura = 'PZ' | 'MT' | 'LT' | 'KG' | 'GR';

/** Millisecondi dall'epoca, come li scrive `Date.now()`. */
export type Istante = number;

/** Data in forma `AAAA-MM-GG`, come la scrive `toISOString().slice(0,10)`. */
export type Giorno = string;

/* ── Anagrafiche ─────────────────────────────────────────────────── */

export interface Sito {
  _id?: number;
  id: string;
  name: string;
  type?: string;
  address?: string;
  notes?: string;
  active?: boolean;
  created_at?: Istante;
  updated_at?: Istante;
  /** Riappeso in cache da `_loadCache`, non è una colonna: `zones` è una
      collezione sua, e all'export questo campo viene tolto. */
  zones?: Zona[];
}

export interface Zona {
  _id?: number;
  site_id: string;
  id: string;
  name: string;
  type?: 'rack' | 'floor' | 'bulk' | string;
  active?: boolean;
  /** 1.4.0 — la destinazione d'uso della zona, contro cui si verifica la
      merce. Assenti = zona non caratterizzata: non accusa nessuno. */
  temp_class?: ClasseTemperatura;
  allergen_zone?: boolean;
  /** Se valorizzato, i soli allergeni ammessi. Vuoto su zona riservata = tutti. */
  allergens?: CodiceAllergene[];
  /** 1.6 — la zona e' dedicata alla merce pericolosa. Terzo attributo di
      destinazione d'uso, accanto a temperatura e allergeni: si imposta sulla
      zona e scende a tutte le sue celle, come gli altri due (D19). */
  hazard_zone?: boolean;
  /** Se valorizzato, le sole pericolosita' ammesse. Vuoto su zona pericolosa = tutte. */
  hazards?: string[];
  /** LA GEOMETRIA DELLA ZONA — da qui `geometria.ts` genera le ubicazioni.
      Una zona a scaffale ha corsie, campate e livelli; una a terra file e
      posizioni; una alla rinfusa posizioni e colonne di griglia. Erano tutte
      sotto l'indice generico, e ogni lettura passava da un cast. */
  aisles?: number;
  bays_per_aisle?: number;
  mirror_frontal?: boolean;
  rows?: number;
  positions_per_row?: number;
  positions?: number;
  grid_cols?: number;
  /** I livelli di una zona a scaffale — ["T","1","2"]. C'erano dalla v1 e
      mancavano solo da questo tipo: sei punti fra viste e geometria li
      leggevano passando da un cast. Trovati convertendo `app.js`. */
  levels?: string[];
  [config: string]: unknown;
}

export interface Articolo {
  _id?: number;
  code: string;
  description?: string;
  category?: string;
  supplier?: string;
  unit?: string;
  /** Ingombro e peso unitari, e le soglie di scorta. Erano in anagrafica
      dalla v1: mancavano solo da questo tipo — trovati convertendo `store.js`
      in TypeScript, perché il compilatore li ha chiesti uno per uno. */
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  min_stock?: number;
  max_stock?: number;
  notes?: string;
  /** v3.0.0 — servono a compilare peso e pezzi del DDT senza scriverli a mano. */
  weight_net_kg?: number;
  pieces_per_pack?: number;
  /** 1.4.0 — vincoli duri del motore di stoccaggio. Assenti = articolo non
      ancora classificato: la verifica di conformità lo salta invece di
      dichiararlo a posto. */
  allergens?: CodiceAllergene[];
  temp_class?: ClasseTemperatura;
  /** 1.4.0 — certificazioni di prodotto. Non è un vincolo di stoccaggio: è
      un fatto che deve viaggiare fino all'operatore e fino al DDT. */
  certifications?: CodiceCertificazione[];
  /** 1.6 — la pericolosita', che e' configurabile per intero: non e' una
      norma di etichettatura come gli allergeni ma una politica di magazzino,
      e i codici vivono in `meta.articleParams` — vedi `modules/parametri.ts`. */
  hazards?: string[];
  /** 1.4.2 — l'unità dentro il collo. `uom_per_collo` assente legge
      `pieces_per_pack`: una sorgente sola, con un ripiego. */
  uom?: UnitaMisura;
  uom_per_collo?: number;
  /** 1.4.4 — punteggio morbido del motore: chi pesa sta in basso. */
  stackable?: boolean;
  active?: boolean;
  /** Quando è stato creato. Si chiama `created` e non `created_at` come sui
      siti: è così dalla v1 e rinominarlo vorrebbe dire riscrivere righe. */
  created?: Istante;
  /** L'anagrafica cresce: un campo aggiunto in Configurazione non deve far
      fallire il compilatore prima ancora di essere usato. */
  [extra: string]: unknown;
}

/** Un articolo come ARRIVA — da una maschera o da un foglio Excel — dove i
    numeri sono spesso stringhe e i campi facoltativi mancano del tutto.
    Non è pigrizia: è il confine dove il dato grezzo diventa dato, e la
    conversione (`parseFloat`, `parseInt`) è il primo gesto di chi lo riceve. */
export type IngressoArticolo = { code: string } & Record<string, any>;

/* ── Giacenza ────────────────────────────────────────────────────── */

/* `item_key` identifica la merce, non la riga: è ciò che tiene insieme lo
   stesso articolo/lotto quando cambia ubicazione. La riga è `_id`. */
export interface Giacenza {
  _id?: number;
  location_code: string;
  item_key: string;
  article_code: string;
  article_description?: string;
  lot_code: string;
  expiry_date?: Giorno;
  qty?: number;
  placed_at?: Istante;
  placed_by?: string;
  /** Ultima modifica della riga. Assente sulle giacenze mai toccate dalla
      v1.8.1 in poi: si legge come «mai modificata dopo il posizionamento». */
  last_updated_at?: Istante;
  notes?: string;
  /** 1.4.3 — assente = merce direttamente in ubicazione, cioè il
      comportamento di oggi, per sempre. Se c'è, `location_code` DEVE essere
      quello della UDC: l'invariante la difende `/api/op/moveUdc`, non la
      disciplina di chi scrive. */
  udc_id?: string;
  /** 1.4.2 — UM totali nella riga, accanto a `qty` che resta i colli.
      Il collo incompleto NON è una riga sua: si calcola. */
  qty_uom?: number;
  /** 1.8 — un numero per collo, come li ha dichiarati chi ha posizionato la
      merce. Dove c'è, `qty` e `qty_uom` sono le sue due colonne
      materializzate; dove manca, la riga si legge come nella 1.7. */
  packs?: number[];
}

/** Ciò che `removeItem` restituisce: la riga com'era, più il conto di che
    cosa è uscito. Il trattino basso dice che questi quattro campi **non**
    finiscono a database — servono a chi scrive il movimento subito dopo, che
    altrimenti dovrebbe rileggere una riga che magari non esiste più. */
export interface GiacenzaRimossa extends Giacenza {
  _mode: 'full' | 'partial';
  _qty_before: number;
  _qty_after: number;
  _qty_delta: number;
  /** 1.4.2 — gli stessi tre conti in UM. `null` su una riga a soli colli:
      è un'assenza dichiarata, non uno zero. */
  _qty_uom_before?: number | null;
  _qty_uom_after?: number | null;
  _qty_uom_delta?: number | null;
  /** 1.8 — quali colli sono usciti, e come resta la riga. Servono alla
      maschera che deve dire «sono usciti 1 × 1.000 + 1 × 300», e valgono
      `null` su una riga che l'elenco non ce l'ha. */
  _packs_out?: number[] | null;
  _packs_after?: number[] | null;
}

export interface StatoUbicazione {
  _id?: number;
  location_code: string;
  status: string;
  blocked_reason?: string;
  updated_at?: Istante;
}

export interface UbicazioneDisattivata {
  _id?: number;
  location_code: string;
}

/* ── Registro ────────────────────────────────────────────────────── */

/* Ogni movimento porta la sigla di chi lo ha fatto: è il requisito GMP, e
   `user` non è mai facoltativo per quel motivo. */
export interface Movimento {
  _id?: number;
  ts: Istante;
  type: MOV;
  article_code?: string;
  article_description?: string;
  lot_code?: string;
  location_code?: string;
  /* Un movimento senza destinazione scrive `null`, non l'assenza del campo. */
  dest_location?: string | null;
  user: string;
  notes?: string;
  doc_ref?: string;
  /** v2.x — le quantità del movimento. `null` sui movimenti storici scritti
      prima che esistessero: è un'assenza dichiarata, non uno zero. */
  qty_delta?: number | null;
  qty_before?: number | null;
  qty_after?: number | null;
  /** 1.4.2 — quanto si è mosso in UM, e in quale unità. Assenti sui
      movimenti storici esattamente come `qty_delta` lo era prima della v2:
      un movimento senza queste due righe è un movimento a soli colli. */
  qty_uom_delta?: number | null;
  uom?: UnitaMisura;
}

/* ── Quarantena ──────────────────────────────────────────────────── */

/* v1.1.0 [N2] — il blocco segue i colli, non l'articolo: `blocked_location`
   è dove la merce è stata spostata, `original_location` da dove veniva. */
export interface Quarantena {
  _id?: number;
  q_id: string;
  item_key: string;
  article_code: string;
  article_description?: string;
  lot_code: string;
  original_location?: string;
  blocked_location?: string;
  reason: string;
  operator: string;
  reference_dept?: string;
  reference_person?: string;
  created_at: Istante;
  released_at?: Istante | null;
  released_by?: string;
  released_ref_dept?: string;
  released_ref_person?: string;
  status: 'blocked' | 'released' | string;
  /** 1.8 — quanti colli sono bloccati e se il blocco è parziale. Il record li
      porta dalla 1.8, il tipo no: l'archivio li leggeva con un cast. */
  qty?: number;
  partial?: boolean;
}

/* ── Documenti di uscita ─────────────────────────────────────────── */

export interface DocumentoUscita {
  doc_id: string;
  kind?: 'return' | 'shipment' | string;
  causale?: string;
  /** L id della causale scelta: e quello che il registro rilegge per sapere
      se il documento e una spedizione o un reso. */
  causale_id?: string;
  ddt_num?: string;
  destination?: string;
  carrier?: string;
  expected_pickup_date?: Giorno;
  operator: string;
  status: 'pending' | 'evaded' | 'cancelled' | string;
  created_at: Istante;
  updated_at?: Istante;
  evaded_at?: Istante | null;
  cancelled_at?: Istante | null;
  /** Il destinatario, congelato come il mittente: una ristampa fra due anni
      deve dare lo stesso foglio anche se l'anagrafica è cambiata. */
  dest_address?: string;
  dest_zip?: string;
  dest_city?: string;
  dest_province?: string;
  dest_vat?: string;
  /** Dove va la merce, se diverso dalla sede del destinatario. */
  ship_to?: string;
  /** Il mittente CONGELATO al momento dell'emissione: una ristampa fra due
      anni deve dare lo stesso foglio, anche se l'anagrafica è cambiata. */
  sender?: Mittente;
  /** 1.4.2.1 — il compito che ha aperto il documento, se ne aveva uno. Il
      prelievo si chiude all'evasione, non alla registrazione: fra le due
      può passare qualche giorno. */
  task_id?: string | null;
  lines: RigaDocumento[];
}

export interface RigaDocumento {
  article_code: string;
  article_description?: string;
  lot_code?: string;
  location_code?: string;
  qty: number;
  [extra: string]: unknown;
}

/** I dati del mittente. Vivono in Configurazione, non nel sorgente. */
export interface Mittente {
  name: string;
  legal_form?: string;
  address: string;
  zip?: string;
  city: string;
  province?: string;
  /** Senza partita IVA il documento esce dichiarando di non essere conforme. */
  vat: string;
  fiscal_code?: string;
  rea?: string;
  phone?: string;
  email?: string;
  warehouse_address?: string;
}

/* ── Geometria ───────────────────────────────────────────────────── */

export interface Coordinate {
  site_id: string;
  zone_id: string;
  /** Posizione della zona nell'ordine di configurazione, non alfabetico. */
  zone_idx: number;
  type: string;
  aisle: number;
  bay: number;
  level: string;
  /** Posizione del livello nell'elenco configurato, dal basso verso l'alto. */
  level_idx: number;
}

/** Codice ubicazione → dove si trova. È ciò su cui lavora la serpentina. */
export type Geometria = Map<string, Coordinate>;

/* ── Prelievo ────────────────────────────────────────────────────── */

/* UNA TAPPA DEL PERCORSO DI PRELIEVO.

   Nasce dalla serpentina, la percorre l'operatore e la rilegge il rapporto:
   tre file la leggono, e per questo il tipo sta qui e non dentro una vista. */
export interface TappaPrelievo {
  seq?: number | null;
  status?: 'pending' | 'done' | 'missing' | string;
  article_code: string;
  article_description?: string;
  lot_code: string;
  item_key?: string;
  location_code?: string;
  site_id?: string;
  kg_required?: number | null;
  um?: string;
  qty_available?: number;
  qty_picked?: number;
  expiry_iso?: string;
  done_at?: Istante | null;
  forced_note?: string;
  reason?: string;
  alternatives?: unknown[];
}

/* Una riga presa fuori percorso, o una nota lasciata su una tappa: portano
   il motivo, che l'elenco traduce in parole. */
export interface FuoriPercorso {
  article_code: string;
  description?: string;
  lot_code: string;
  location_code?: string;
  kg_required?: number | null;
  um?: string;
  reason?: string;
  detail?: string;
}

export interface SessionePrelievo {
  session_id: string;
  status: string;
  created_at: Istante;
  odp_num?: string;
  stops?: TappaPrelievo[];
  /** La testata dell ODP e chi sta prelevando: erano gia nel record, e il
      rapporto di prelievo li leggeva attraverso l indice generico. */
  odp_article?: string;
  odp_article_desc?: string;
  odp_lot?: string;
  odp_qty?: string | number;
  operator?: string;
  offroute?: FuoriPercorso[];
  notes?: FuoriPercorso[];
  warnings?: string[];
  [extra: string]: unknown;
}

export interface ReportPrelievo {
  doc_id: string;
  odp_num?: string;
  closed_at: Istante;
  /** Ciò che l'archivio legge di un rapporto senza aprirlo. Erano già scritti
      nel record: mancavano solo da qui. */
  ended_at?: Istante;
  operator?: string;
  rows?: RigaReportPrelievo[];
  [extra: string]: unknown;
}

export interface RigaReportPrelievo {
  article_code: string;
  lot_code: string;
  [extra: string]: unknown;
}

export interface VerbaleSmaltimento {
  doc_id: string;
  created_at: Istante;
  article_code?: string;
  lot_code?: string;
  /** Il mittente congelato all'emissione, come sul DDT: una ristampa
      deve dare lo stesso foglio. */
  sender?: Mittente;
  operator?: string;
  [extra: string]: unknown;
}

/* ── Operatori ───────────────────────────────────────────────────── */

/* GDPR §10: nome, cognome e iniziali. Nient'altro, e nessuna telemetria.
   Il PIN non c'è: c'è la sua impronta, SHA-256 di `salt:pin`. */
export interface Operatore {
  op_id: string;
  first_name: string;
  last_name: string;
  initials: string;
  role: 'operator' | 'leader';
  pin_hash?: string | null;
  pin_salt?: string | null;
  pin_set_at?: Istante | null;
  active?: boolean;
  created_at?: Istante;
  updated_at?: Istante;
}

/* ── Le cinque della 1.4 ─────────────────────────────────────────── */

/* Dichiarate in Fase 0, popolate quando si accende l'interruttore che le
   riguarda. Una collezione vuota si comporta come la 1.2: non esiste. */

/** 1.4.2 — la confezione, CONGELATA al primo posizionamento. È un fatto del
    lotto e non della riga di giacenza: sopravvive all'ultimo collo che esce
    e vale ancora per quello che rientra tre settimane dopo. */
export interface Lotto {
  _id?: number;
  article_code: string;
  lot_code: string;
  uom?: UnitaMisura;
  uom_per_collo?: number;
  frozen_at?: Istante;
}

/** 1.4.3 — un contenitore che sta in un'ubicazione e si sposta intero.
    Nasce su comando di un operatore o di un Team Leader, con la sua
    etichetta; muore quando non ha più colli dentro. Il record resta:
    la tracciabilità GMP non ammette che una UDC sparisca dallo storico. */
export interface Udc {
  udc_id: string;
  type?: 'pallet' | 'cassone' | 'carrello' | string;
  location_code?: string;
  site_id?: string;
  status: 'open' | 'closed' | 'shipped' | 'empty' | string;
  /** Predisposto e vuoto finché non arriva il prefisso GS1, che è un
      parametro di Configurazione e non una costante del sorgente. */
  sscc?: string | null;
  created_at: Istante;
  created_by?: string;
  closed_at?: Istante | null;
  emptied_at?: Istante | null;
}

/** 1.4.1 — la richiesta di un'attività che l'applicativo sa già fare.
    Da `requested_at → started_at → completed_at` escono le due misure che
    servono davvero: quanto sta in coda, e quanto dura. */
export interface Compito {
  task_id: string;
  /* 1.4.4 — `PUTAWAY` è uscito: il posizionamento avviene in coda
     all'accettazione, che su Pathfinder non passa. I record già scritti
     restano leggibili — l'unione finisce con `string`, e le etichette di
     un tipo sconosciuto ripiegano sul codice. */
  type: 'TRANSFER' | 'PICK_SHIP' | 'PICK_RET' | 'QUARANTINE' | 'SAMPLING'
      | 'DISPOSAL' | 'COUNT' | 'CLEANING' | string;
  /** 1-4. La alza SOLO un Team Leader, altrimenti diventa urgente tutto. */
  priority: number;
  status: 'requested' | 'assigned' | 'in_progress' | 'done' | 'cancelled' | string;
  requested_by: string;
  requested_at: Istante;
  assigned_to?: string | null;
  started_at?: Istante | null;
  completed_at?: Istante | null;
  due_at?: Istante | null;
  payload?: unknown;
  source_ref?: string | null;
  /** Il perché della richiesta, in chiaro. Chi prende il compito legge questa
      riga prima di muoversi: il `payload` dice cosa, la nota dice perché. */
  note?: string;
  /** Chi ha chiuso, e — se annullato — perché. Un compito concluso è
      un'operazione, e un'operazione porta la sigla di chi l'ha fatta. */
  completed_by?: string | null;
  cancel_reason?: string;
  /** 1.4.2.1 — quanti colli sono stati mossi finora. Il richiesto sta nel
      payload e non cambia mai: questo cresce a ogni movimento confermato, e
      quando il residuo arriva a zero il compito si chiude da solo. */
  qty_done?: number;
  /** 1.4.2.1 — i movimenti che hanno lavorato questo compito, per `_id`.
      È il legame che il registro delle attività legge per dire con che cosa
      un compito è stato chiuso. */
  mov_ids?: number[];
}

/** 1.4.5 — il conto aperto di ciò che è uscito verso la produzione.
    Ciò che entra e non torna è il consumo reale: oggi quel numero non esiste. */
export interface ContoWip {
  wip_id: string;
  odp_num: string;
  item_key: string;
  article_code?: string;
  lot_code?: string;
  qty: number;
  qty_uom?: number;
  status: 'open' | 'closed' | string;
  opened_at: Istante;
  closed_at?: Istante | null;
}

/** 1.4.4 — una regola del motore. È un DATO scritto in Configurazione, non
    un rilascio: «`article_code` inizia per 700 → `site_id` = MAG2» cambia
    quando cambia la politica, non quando cambia la versione. */
export interface RegolaStoccaggio {
  rule_id: string;
  priority: number;
  attiva: boolean;
  quando: { campo: string; operatore: string; valore: unknown };
  allora: Record<string, unknown>;
  note?: string;
  updated_at?: Istante;
  updated_by?: string;
}

/* ── 1.6 — I DESTINATARI DEI DDT, E LE LORO DESTINAZIONI ──────────
   Un destinatario è un SOGGETTO, e un soggetto ha più indirizzi dove
   riceve: la sede legale, il deposito, il conto terzi. Per questo le
   destinazioni sono una lista dentro il record e non un campo — «un
   destinatario può avere diverse destinazioni», PIANO §9.5. */

export interface Destinazione {
  dest_id: string;
  /** Come la chiama chi la sceglie: «Sede», «Deposito Nord». */
  label?: string;
  address?: string;
  zip?: string;
  city?: string;
  province?: string;
  country?: string;
  /** La prima che si è vista, e quella che il DDT propone. */
  predefinita?: boolean;
  created_at?: Istante;
}

export interface Destinatario {
  rcp_id: string;
  name: string;
  /** LA CHIAVE DI RICONOSCIMENTO — D20. Due DDT parlano dello stesso
      destinatario quando coincide questa, non la ragione sociale: «Rossi
      Srl» e «ROSSI S.R.L.» sono lo stesso soggetto. Può mancare — un DDT a
      un privato — e allora si ripiega sul nome normalizzato. */
  vat?: string;
  fiscal_code?: string;
  destinations: Destinazione[];
  created_at?: Istante;
  updated_at?: Istante;
  updated_by?: string;
}

/* ── Chiave/valore ───────────────────────────────────────────────── */

export interface Meta {
  key: string;
  value?: unknown;
  [extra: string]: unknown;
}
