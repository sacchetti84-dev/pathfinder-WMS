/* Il tipo si chiama MOV come la costante, e i due nomi non possono
   convivere: qui serve il tipo, quindi lo si rinomina all'ingresso. */
import type { MOV as TipoMovimento } from '../types/contratto.js';

const DB_NAME = 'WarehouseMapperDB';
/* v2.0.1 [C6] — rimossa la costante DB_VERSION: era ferma a 2 mentre la versione
   effettiva dello schema è 3 (vedi catena db.version() sotto). Era morta e fuorviante. */

const LOG_RETENTION_DAYS = 2192;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/* Tipi movimento: stringhe brevi per risparmio spazio su IDB */
const MOV = Object.freeze({
  IN: 'IN',           // Posizionamento
  OUT: 'OUT',         // Smaltimento
  MOVE: 'MOVE',       // Cambio ubicazione
  PICK: 'PICK',       // Prelievo produzione
  REPOS: 'REPOS',     // Riposizionamento (mantenuto per storico log)
  FIX_IN: 'FIX+',     // Correzione inventario +
  FIX_OUT: 'FIX-',    // Correzione inventario -
  QUAR: 'QUAR',       // Ingresso quarantena
  Q_REL: 'QREL',      // Rilascio quarantena
  EDIT: 'EDIT',       // Modifica dati item (v1.8.1)
  RET: 'RET',         // Reso — v2.0: ora è USCITA merce ritirata da vettore
  SHIP: 'SHIP',       // Spedizione (v2.0.0) — uscita merce verso cliente
  /* 1.4.2.1 — il campionamento: i colli NON calano, cala la quantità dentro.
     Ha una causale sua e non una nota su OUT perché il logbook che la
     qualità legge è il registro filtrato su questa riga. */
  SAMPLE: 'SAMPLE',
  /* 2.16 — voce 34 · l'unita' di carico: il CONTENITORE, non quel che porta.
     La merce che si sposta con lei scrive le sue righe, una per partita. */
  UDC: 'UDC',
  PURGE: 'PURGE',     // v2.0.1 [B8] — Purge manuale registro storico (evento di audit)
  PINRESET: 'PINRESET'
} as const satisfies Record<string, TipoMovimento>);

const MOV_LABELS = {
  IN: 'Posizionamento', OUT: 'Smaltimento', MOVE: 'Trasferimento',
  PICK: 'Prelievo Produzione', REPOS: 'Riposizionamento',
  'FIX+': 'Correzione +', 'FIX-': 'Correzione −',
  QUAR: 'Quarantena', QREL: 'Rilascio Quarantena',
  EDIT: 'Modifica Dati Item',
  RET: 'Reso (Ritirato)',
  SHIP: 'Spedizione',
  SAMPLE: 'Campionamento',            // 1.4.2.1
  UDC: 'Unità di carico',             // 2.16
  PURGE: 'Purge Registro (manuale)',  // v2.0.1 [B8]
  PINRESET: 'Rinnovo PIN operatore'   // v2.7.0 [G6]
} satisfies Record<TipoMovimento, string>;

export { DB_NAME, LOG_RETENTION_DAYS, LOG_RETENTION_MS, MOV, MOV_LABELS };
