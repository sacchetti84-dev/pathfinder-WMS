/* Il tipo si chiama MOV come la costante, e i due nomi non possono
   convivere: qui serve il tipo, quindi lo si rinomina all'ingresso. */
import type { MOV as TipoMovimento } from '../types/contratto.js';

const DB_NAME = 'WarehouseMapperDB';
/* v2.0.1 [C6] — rimossa la costante DB_VERSION: era ferma a 2 mentre la versione
   effettiva dello schema è 3 (vedi catena db.version() sotto). Era morta e fuorviante. */

/* 2.17 — IL LIMITE DI RITENZIONE NON C'E' PIU', E NON C'E' MAI STATO.
   Qui stavano `LOG_RETENTION_DAYS = 2192` e il suo millisecondo. Sei anni
   esatti, e non li chiedeva nessuna norma: la guida della Commissione sull'art.
   18 del Reg. 178/2002 raccomanda 5 anni per la rintracciabilita', l'art. 2220
   c.c. ne vuole 10 per fatture e documenti commerciali (i DDT), e l'Annex 11
   lega l'audit trail al record che documenta. Sei stava in mezzo, senza fonte.

   E soprattutto NON CANCELLAVA NIENTE: la purga e' uscita con la 2.1 (§8), e
   quella costante finiva in tre etichette a video. Una diceva «conservazione 6
   anni» due righe sotto «nessun record viene mai cancellato»: chi legge non sa
   quale delle due credere, e la risposta era la seconda.

   Il registro non ha una scadenza dentro l'applicativo. Per quanto si tenga lo
   decide la SOP, e a quel punto e' una politica di backup e di database, non un
   numero compilato dentro un pacchetto. */

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
  /* 2.20 — il versamento del prodotto finito: la merce che il reparto ha
     fatto entra a magazzino con una causale sua. */
  PROD: 'PROD',
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
  PROD: 'Versamento produzione',      // 2.20
  PURGE: 'Purge Registro (manuale)',  // v2.0.1 [B8]
  PINRESET: 'Rinnovo PIN operatore'   // v2.7.0 [G6]
} satisfies Record<TipoMovimento, string>;

export { DB_NAME, MOV, MOV_LABELS };
