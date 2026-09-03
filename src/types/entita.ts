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
  /** 2.20 — la zona tiene il PRODOTTO FINITO in attesa di partire. Non e' un
      vincolo di stoccaggio: e' dove la maschera del reparto propone di
      posare un bancale e dove l'elenco delle spedizioni va a guardare.
      Assente = zona come prima. */
  pf_zone?: boolean;
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
  /** 2.20 — il codice del MODELLO di imballo, non la sua composizione: i
      formati veri sono una decina e gli articoli undicimila. Assente = chi
      imballa dichiara i colli senza una proposta. */
  pallet_model?: string;
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
  /** 2.0 — l'elenco COM'ERA prima dell'uscita. Lo storno non ha altro modo
      di richiudere il collo che ha aperto: senza, rimette la quantità come
      un collo NUOVO, e lo scaffale si ritrova a dichiarare quattro colli
      dove ne ha tre. */
  _packs_before?: number[] | null;
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

/** 2.8 — LA CARATTERIZZAZIONE DELLA SINGOLA UBICAZIONE.

    Fino alla 2.7 temperatura, allergeni e pericolosità stavano SOLO sulla
    zona e scendevano identici a tutte le sue celle. Uno scaffale però non è
    omogeneo: il livello a terra regge il doppio di quello in quota, la cella
    accanto al portone d'ingresso è più calda del fondo corsia, e la campata
    con la vasca di contenimento è l'unica che può tenere un corrosivo.

    LA ZONA RESTA LA SORGENTE. Qui c'è solo lo SCAVALCO, e un campo assente
    vuol dire «come dice la zona» — non «nessun vincolo». È la differenza che
    tiene in piedi le migliaia di celle già configurate: nessuna di esse ha
    un record qui dentro, e continuano a valere esattamente come prima.

    Un record esiste solo per le celle che qualcuno ha davvero caratterizzato.
    Su 2.000 ubicazioni ce ne saranno dieci, ed è giusto così. */
export interface AttributiUbicazione {
  location_code: string;
  /** Scavalca `Zona.temp_class`. */
  temp_class?: ClasseTemperatura | null;
  /** Scavalca `Zona.allergen_zone`. */
  allergen_zone?: boolean | null;
  /** Scavalca `Zona.allergens`: i soli allergeni ammessi qui. */
  allergens?: CodiceAllergene[] | null;
  /** Scavalca `Zona.hazard_zone`. */
  hazard_zone?: boolean | null;
  /** Scavalca `Zona.hazards`: le sole pericolosità ammesse qui. */
  hazards?: string[] | null;
  /** Quanti colli ci stanno. È SEMPRE della cella: una capienza di zona non
      vuol dire niente, perché la zona è l'insieme dei vani, non un vano. */
  capienza?: number | null;
  /** Quanti chili regge. Il livello a terra e quello in quota non sono lo
      stesso posto, e questo è l'unico modo di scriverlo. */
  portata_kg?: number | null;
  /** Perché questa cella è diversa dalle altre. Lo legge chi la vede
      esclusa da una proposta. */
  nota?: string;
  updated_at?: Istante;
  updated_by?: string;
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
  /** 2.20 — L'UBICAZIONE DI ARRIVO, sulle causali di conto terzi: la merce
      non esce dal sistema, si sposta in quel vano. Assente su tutti gli
      altri documenti, che scaricano come hanno sempre scaricato. */
  dest_location?: string;
  /** Il mittente CONGELATO al momento dell'emissione: una ristampa fra due
      anni deve dare lo stesso foglio, anche se l'anagrafica è cambiata. */
  sender?: Mittente;
  /** 1.4.2.1 — il compito che ha aperto il documento, se ne aveva uno. Il
      prelievo si chiude all'evasione, non alla registrazione: fra le due
      può passare qualche giorno. */
  task_id?: string | null;
  /* I DIECI CAMPI CHE IL DDT PORTA DA SEMPRE E IL TIPO NON DICEVA.

     Erano dodici cast in `spedizioni.ts`, e la stampa li leggeva comunque:
     la data del documento, il riferimento all'ordine, l'aspetto dei colli,
     porto e vettore, i pesi e le annotazioni. Dichiararli non cambia un
     record — cambia che adesso chi ne dimentica uno se lo sente dire. */
  doc_date?: Giorno;
  order_ref?: string;
  aspetto?: string;
  porto?: string;
  transport_by?: string;
  start_transport?: string;
  doc_notes?: string;
  /** LEGACY 1.8.3 — i pezzi totali, quando un documento poteva averne uno
      solo. Dalla 1.8.4 non si scrive piu': le UM stanno sulla riga, e con
      righe in unita' diverse un totale unico non significa niente. Resta
      dichiarato perche' i documenti gia' scritti lo portano. */
  pieces_total?: number | null;
  peso_netto?: string;
  peso_lordo?: string;
  lines: RigaDocumento[];
}

export interface RigaDocumento {
  article_code: string;
  article_description?: string;
  lot_code?: string;
  location_code?: string;
  expiry_date?: Giorno | string;
  /** Quanti colli: sull'elenco dichiarato e' la lunghezza di `packs_out`. */
  qty: number;
  /* 1.8.4 — QUALI COLLI, E QUANTE UM. Il documento nomina la merce che
     salira' sul camion, e la nomina quando la riga entra in carrello: fra
     quel momento e il ritiro del vettore possono passare giorni. Le misure
     reggono, gli indici no — `modules/colli.ts`, `scelteDaUscite`.

     Assenti sulla riga di un documento scritto prima della 1.8.4, e allora
     i colli si scelgono all'evasione come si faceva allora. */
  packs_out?: { da: number; quantita: number }[] | null;
  /** Le UM totali della riga: la somma di cio' che esce dai colli scelti.
      E' quella che va stampata, perche' con colli di misura diversa il
      numero di colli non la dice. */
  qty_uom?: number | null;
  /** L'unita' della riga, non del documento: su un DDT possono convivere
      una riga in KG e una in PZ, ed e' la ragione per cui i pesi si
      scrivono a mano. */
  uom?: string | null;
  /** 2.20 — il bancale da cui esce la riga, quando ne ha uno. Assente sulle
      righe scritte prima: merce presa dal vano, senza contenitore. */
  udc_id?: string;
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
  /** 1.8 — le MISURE dei colli usciti. `commitPickStop` le scrive da sempre;
      il tipo non le dichiarava, e il report non poteva leggerle. */
  packs_picked?: number[] | null;
  /** 1.4.2 — le UM uscite davvero, che non si ricavano dai colli quando uno
      di loro si è aperto. */
  uom_picked?: number | null;
  /** 2.5 — il trasferimento che ha spostato questa tappa, e da dove. */
  transfer_task?: string;
  transfer_from?: string;
  /** 2.5 — quante volte questa tappa è stata rettificata dopo il prelievo, e
      l'ultima motivazione. Il registro porta i movimenti; qui resta il segno
      che la riga a video non è quella della prima conferma. */
  corrections?: number;
  correction_note?: string;
  /** 2.12 — quanto ne vuole ciascun ordine del giro. Assente quando il giro
      porta un ordine solo: vedi `Tappa` in `modules/pickRoute.ts`. */
  richieste?: { odp_num: string; qty: number }[];
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
  /** 2.12 — GLI ORDINI DEL GIRO, capofila in testa.

      `odp_num` resta il CAPOFILA e non cambia significato: è l'ordine che
      intesta il conto di produzione, ed è l'unico campo che il rendiconto, il
      registro e lo storico leggevano fino alla 2.11. Un giro di un ordine
      solo non scrive questo elenco, e allora tutto si comporta come prima. */
  odps?: {
    odp_num: string;
    article_code?: string;
    article_desc?: string;
    lot?: string;
    /** La quantità dell'ordine, come il foglio la dichiara. */
    qty_planned?: string | number;
    um?: string;
    /** La quantità su cui l'ordine è stato ricalibrato, se lo è stato. */
    qty_voluta?: number | null;
    /** 1 = nessuna ricalibrazione. */
    fattore?: number;
    file_name?: string;
  }[];
  operator?: string;
  offroute?: FuoriPercorso[];
  notes?: FuoriPercorso[];
  warnings?: string[];
  /** 2.5 — LE PAUSE, come fatti con un'ora d'inizio e una di fine.

      Il tempo medio di prelievo si calcola dividendo la durata per le righe,
      e finché la durata comprendeva il pranzo quel numero misurava la pausa
      insieme al lavoro. Una pausa aperta ha `to` nullo: è quella in corso. */
  pauses?: { from: Istante; to: Istante | null; by?: string }[];
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
  /** 2.1 — TRE CARICHE, E LA TERZA È NUOVA. `admin` è l'unica che apre
      la Configurazione e il reset dei dati; comprende tutto quello che un
      Team Leader può fare, perché una carica che autorizza il reset e non
      il rinnovo di un PIN non descrive nessuno. Un record scritto prima
      della 2.1 non porta `admin` e resta quel che era. */
  role: 'operator' | 'leader' | 'admin';
  /** 2.10 — DAL SERVIZIO QUESTI DUE ARRIVANO SEMPRE ASSENTI: l'impronta del
      PIN non esce da una risposta HTTP, e al suo posto arriva `pin_set`. Ci
      sono ancora perché nel modo «da file» il database sta nel browser e la
      verifica avviene lì — vedi `Auth.verifyPin`. Chi deve sapere se un
      operatore ha un PIN usa `Store.haPin`, mai il campo. */
  pin_hash?: string | null;
  pin_salt?: string | null;
  /** 2.10 — «questo operatore ha un PIN», che è la sola cosa che il client
      chiedeva a `pin_hash`. Lo scrive il servizio a ogni lettura. */
  pin_set?: boolean;
  /** 2.10 — con quale algoritmo è fatta l'impronta: `scrypt` dalla 2.10,
      assente per tutto ciò che è stato scritto prima. Come `pin_hash`, dal
      servizio non arriva mai. */
  pin_algo?: 'scrypt';
  pin_set_at?: Istante | null;
  /** 2.13 — LA VIA DI FUGA. Un codice di ripristino di venti caratteri
      generato quando si nomina un Admin, mostrato UNA volta e mai piu'
      rileggibile: sul disco resta la sua impronta, come per il PIN. Serve
      a una cosa sola — rientrare quando il PIN dell'Admin e' perso e non
      c'e' nessun altro Admin che possa rinnovarlo. Vale solo per il ruolo
      `admin`: un Operatore o un Team Leader che perde il PIN ha gia' chi
      glielo rinnova, e un secondo segreto sarebbe solo un secondo modo di
      entrare. Come `pin_hash`, dal servizio non arriva mai: al suo posto
      arriva `rec_set`. */
  rec_hash?: string | null;
  rec_salt?: string | null;
  rec_algo?: 'scrypt';
  rec_set_at?: Istante | null;
  /** «Questo Admin ha una via di fuga configurata?» — la sola cosa che il
      client chiede all'impronta. Lo scrive il servizio a ogni lettura. */
  rec_set?: boolean;
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
  /** 1.12 — il numero progressivo da cui è nato `udc_id`. Sta sul record
      perché il prossimo si ricava dal più alto già emesso, comprese le UDC
      morte: i buchi non si riempiono, e ricavarlo dal codice vorrebbe dire
      saperlo leggere in due forme — interna e SSCC. */
  serial?: number;
  updated_at?: Istante;
  /** Predisposto e vuoto finché non arriva il prefisso GS1, che è un
      parametro di Configurazione e non una costante del sorgente. */
  sscc?: string | null;
  created_at: Istante;
  created_by?: string;
  closed_at?: Istante | null;
  emptied_at?: Istante | null;
  /* 2.20 — IL BANCALE DI PRODOTTO FINITO È UN'UNITÀ DI CARICO, e questi tre
     campi sono tutto ciò che lo distingue. Assenti = l'unità di carico di
     prima, per sempre. */
  /** `pf` dice che è nato dal reparto e va nel magazzino del prodotto
      finito. Un'unità di carico senza questo campo resta quella della 1.12. */
  kind?: 'pf' | string;
  /** L'ordine di produzione, e NON È OBBLIGATORIO: chi imballa non si ferma
      perché non ha il numero sotto mano. */
  odp_num?: string;
  /** Il modello di imballo da cui è uscita la proposta dei colli. Resta
      scritto perché la packing list ne legge supporto e tara. */
  model_code?: string;
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
  /** Da 1 a 10: più alta = decide prima. Una regola scritta prima della 2.1
      può portare 0 e continua a valere. */
  priority: number;
  attiva: boolean;
  /* ── SU QUALI ARTICOLI, in gerarchia: il codice esatto batte il prefisso,
     e tutti e due battono la categoria. Vedi `regolePerArticolo` in
     `modules/stoccaggio.ts`, che è l'unico posto dove la gerarchia si
     applica davvero. */
  article_code?: string;
  article_prefix?: string;
  /** 2.8 — la categoria merceologica: «i detersivi stanno in MAG3» non è
      una regola sui codici, è una regola su una famiglia di merce. */
  category?: string;
  category_prefix?: string;
  /** 2.9 — gli articoli che dichiarano QUESTA pericolosità. È il livello
      più largo, e sta sotto a tutti gli altri: «tutti gli infiammabili» è
      la rete più grossa che si possa gettare. */
  hazard?: string;
  /* ── DOVE DEVONO ANDARE: un sito, oppure una zona. */
  site_id?: string;
  zone_id?: string;
  /** `impone` è un VINCOLO: fuori da lì il motore non propone niente, e chi
      posiziona altrove deve dichiarare perché — lo scavalco resta a
      registro. `preferisce` alza il punteggio e non esclude nessuno. */
  modo?: 'impone' | 'preferisce' | string;
  /** Il perché, in chiaro: lo legge chi vede la proposta. */
  nota?: string;
  /* 2.8 — `quando`/`allora` erano la forma IMMAGINATA alla 1.4.4, e non è
     mai stata scritta a database: la maschera di Configurazione scrive i
     campi piatti qui sopra dal primo giorno, e questo tipo diceva un'altra
     cosa da allora. Restano facoltativi perché nessuno ha verificato che
     non esista un record antico che li porta, e toglierli sarebbe una
     scommessa su un dato che non si è guardato. */
  quando?: { campo: string; operatore: string; valore: unknown };
  allora?: Record<string, unknown>;
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
