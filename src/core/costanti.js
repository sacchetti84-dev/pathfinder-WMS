/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — costanti di dominio
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Nome del database, ritenzione del registro, tipi di movimento e loro
   etichette. Non dipendono da niente e non fanno niente: sono le uniche
   cose del progetto che si possono leggere senza sapere il resto.
   ═══════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════
// DATABASE 
// ═══════════════════════════════════════════════════════════════════

const DB_NAME = 'WarehouseMapperDB';
/* v2.0.1 [C6] — rimossa la costante DB_VERSION: era ferma a 2 mentre la versione
   effettiva dello schema è 3 (vedi catena db.version() sotto). Era morta e fuorviante. */

/* v2.0.1 [B8] — RETENTION 6 ANNI (2192 giorni, include 2 anni bisestili).
   ATTENZIONE: questo valore NON innesca più alcuna cancellazione automatica.
   È usato esclusivamente come SOGLIA SUGGERITA per la purge MANUALE in
   Config → Dati e Backup. Nessun record viene mai eliminato senza azione
   esplicita dell'operatore, export preventivo e registrazione a log. */
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
  PURGE: 'PURGE',     // v2.0.1 [B8] — Purge manuale registro storico (evento di audit)
  /* v2.7.0 [G6] — Rinnovo di un PIN smarrito. Non muove merce: e' un evento
     di audit, come PURGE. A registro finisce CHI ha rinnovato il PIN di CHI;
     il PIN non compare, ne' in chiaro ne' come impronta. */
  PINRESET: 'PINRESET'
});

const MOV_LABELS = {
  IN: 'Posizionamento', OUT: 'Smaltimento', MOVE: 'Cambio Ubicazione',
  PICK: 'Prelievo Produzione', REPOS: 'Riposizionamento',
  'FIX+': 'Correzione +', 'FIX-': 'Correzione −',
  QUAR: 'Quarantena', QREL: 'Rilascio Quarantena',
  EDIT: 'Modifica Dati Item',
  RET: 'Reso (Ritirato)',
  SHIP: 'Spedizione',
  PURGE: 'Purge Registro (manuale)',  // v2.0.1 [B8]
  PINRESET: 'Rinnovo PIN operatore'   // v2.7.0 [G6]
};

export { DB_NAME, LOG_RETENTION_DAYS, LOG_RETENTION_MS, MOV, MOV_LABELS };
