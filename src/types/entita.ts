import type { MOV } from './contratto.js';
import type { CodiceAllergene, ClasseTemperatura } from '../modules/anagrafica.js';

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
  [config: string]: unknown;
}

export interface Articolo {
  _id?: number;
  code: string;
  description?: string;
  category?: string;
  supplier?: string;
  unit?: string;
  /** v3.0.0 — servono a compilare peso e pezzi del DDT senza scriverli a mano. */
  weight_net_kg?: number;
  pieces_per_pack?: number;
  /** 1.4.0 — vincoli duri del motore di stoccaggio. Assenti = articolo non
      ancora classificato: la verifica di conformità lo salta invece di
      dichiararlo a posto. */
  allergens?: CodiceAllergene[];
  temp_class?: ClasseTemperatura;
  active?: boolean;
}

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
  notes?: string;
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
  dest_location?: string;
  user: string;
  notes?: string;
  doc_ref?: string;
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
  status: 'blocked' | 'released' | string;
}

/* ── Documenti di uscita ─────────────────────────────────────────── */

export interface DocumentoUscita {
  doc_id: string;
  kind?: 'return' | 'shipment' | string;
  causale?: string;
  ddt_num?: string;
  destination?: string;
  carrier?: string;
  expected_pickup_date?: Giorno;
  operator: string;
  status: 'pending' | 'evaded' | 'cancelled' | string;
  created_at: Istante;
  evaded_at?: Istante | null;
  cancelled_at?: Istante | null;
  /** Il mittente CONGELATO al momento dell'emissione: una ristampa fra due
      anni deve dare lo stesso foglio, anche se l'anagrafica è cambiata. */
  sender?: Mittente;
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

export interface SessionePrelievo {
  session_id: string;
  status: string;
  created_at: Istante;
  odp_num?: string;
  stops?: unknown[];
  [extra: string]: unknown;
}

export interface ReportPrelievo {
  doc_id: string;
  odp_num?: string;
  closed_at: Istante;
  [extra: string]: unknown;
}

export interface VerbaleSmaltimento {
  doc_id: string;
  created_at: Istante;
  article_code?: string;
  lot_code?: string;
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

/* ── Chiave/valore ───────────────────────────────────────────────── */

export interface Meta {
  key: string;
  value?: unknown;
  [extra: string]: unknown;
}
