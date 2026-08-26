'use strict';

/* LO SCHEMA POSTGRESQL, GENERATO DALLA STESSA DICHIARAZIONE — 2.1, in
   servizio dalla 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   NON È PIÙ UN RAMO PARALLELO. Fino alla 2.5 questo file stava in
   `server/azure/` e non lo chiamava nessuno. Dalla 2.6 lo chiama
   `driver-postgres.js` all'avvio, quando `PATHFINDER_PG` è impostata, ed è
   per questo che è sceso in `lib/`: un file che il servizio esegue non può
   stare in una cartella esclusa da `tsconfig.server.json`.

   LE VENTI COLLEZIONI SI DICHIARANO IN UN POSTO SOLO, e quel posto resta
   `lib/schema.js`. Ricopiarle qui vorrebbe dire due vocabolari che
   combaciano finché qualcuno se ne ricorda — che è esattamente il difetto
   che quella dichiarazione unica esiste per chiudere. Qui c'è solo la
   traduzione dei tipi, e una prova che verifica che le due parti restino
   in pari.

   COSA CAMBIA DA SQLITE, E PERCHÉ:

   1. `data` diventa **JSONB**, non TEXT. È l'unica ragione tecnica seria
      per cui PostgreSQL varrebbe la pena su questo modello: il documento
      resta un documento, ma si può interrogare senza rileggerlo tutto in
      memoria. Il client di oggi non lo sfrutta — legge e filtra a monte —
      e questo è un fatto da sapere prima di firmare, non dopo.

   2. La chiave automatica diventa **BIGSERIAL**. `AUTOINCREMENT` di SQLite
      e `SERIAL` di Postgres si comportano uguale su quello che serve qui,
      e `_id` resta un intero: il client lo usa come identificativo opaco e
      non ci fa conti.

   3. I booleani. SQLite li scrive 0/1 perché non ha il tipo; le colonne
      materializzate qui restano TEXT/NUMERIC come là — `active`, `attiva`
      passano da `materialize`, e cambiarne il tipo qui vorrebbe dire due
      letture diverse dello stesso dato a seconda del database. Il tipo si
      stringe il giorno che si migra davvero, non prima.

   4. **PostGIS non serve.** La richiesta lo nomina per «le coordinate della
      mappa 2D/3D», ma le ubicazioni di Pathfinder non hanno coordinate:
      `core/geometria.ts` le GENERA dalla configurazione della zona —
      corsie, campate, livelli — e la mappa disegna una griglia, non un
      piano cartesiano. Un'estensione spaziale su dati che non sono spaziali
      è una dipendenza in più e nessuna query in meno. Se un giorno le
      ubicazioni porteranno metri veri, se ne riparla allora.

   Collaudato in `test/schemaPostgres.test.js`, che è l'unica cosa di questo
   ramo che gira a ogni `npm test`. */

const { COLLECTIONS, NAMES } = require('./schema');

/* IL TESTO SI CONFRONTA BYTE PER BYTE, COME IN SQLITE — 2.6.

   SQLite confronta il testo con la collazione BINARY, cioè byte per byte.
   PostgreSQL usa quella del database, e con `it_IT` o `en_US` l'ordine
   cambia: la punteggiatura pesa meno, le maiuscole si mescolano alle
   minuscole. `ORDER BY location_code` è quello che il client legge per
   disegnare una corsia, e due ordini diversi vogliono dire un magazzino
   che si vede rimescolato passando da un database all'altro.

   `COLLATE "C"` sulla colonna lo fissa qui, invece di dipendere da come
   qualcuno ha creato il database. Dove il database è già stato creato con
   `LC_COLLATE 'C'` non cambia niente; dove non lo è, questo lo salva.
   È anche quel che rende l'indice utilizzabile da un confronto di
   prefisso. */
const COLLAZIONE = ' COLLATE "C"';

/** Il tipo Postgres di una colonna materializzata. */
function colTypePg(col, field) {
  return (col.numeric || []).includes(field) ? 'BIGINT' : 'TEXT';
}

/** Il tipo con la collazione, come va scritto dentro il CREATE TABLE. */
function colDdlPg(col, field) {
  const t = colTypePg(col, field);
  return t === 'TEXT' ? t + COLLAZIONE : t;
}

function createTableSQL(name) {
  const col = COLLECTIONS[name];
  const cols = [];

  if (col.pkType === 'auto') cols.push(`${col.pk} BIGSERIAL PRIMARY KEY`);
  else cols.push(`${col.pk} TEXT${COLLAZIONE} PRIMARY KEY`);

  for (const f of col.indexed) {
    if (f === col.pk) continue;
    cols.push(`${f} ${colDdlPg(col, f)}`);
  }
  /* NOT NULL come su SQLite: un documento senza corpo non è un record, è
     una riga che qualcuno ha scritto a metà. */
  cols.push('data JSONB NOT NULL');

  return `CREATE TABLE IF NOT EXISTS ${name} (${cols.join(', ')})`;
}

function createIndexSQL(name) {
  const col = COLLECTIONS[name];
  const stmts = [];

  for (const f of col.indexed) {
    if (f === col.pk) continue;
    const uniq = (col.unique || []).includes(f) ? 'UNIQUE ' : '';
    stmts.push(`CREATE ${uniq}INDEX IF NOT EXISTS ix_${name}_${f} ON ${name}(${f})`);
  }
  for (const pair of (col.composite || [])) {
    stmts.push(`CREATE INDEX IF NOT EXISTS ix_${name}_${pair.join('_')} ON ${name}(${pair.join(', ')})`);
  }
  for (const pair of (col.compositeUnique || [])) {
    stmts.push(`CREATE UNIQUE INDEX IF NOT EXISTS ux_${name}_${pair.join('_')} ON ${name}(${pair.join(', ')})`);
  }
  /* L'indice sul documento: è il motivo per cui `data` è JSONB e non TEXT.
     `jsonb_path_ops` costa meno spazio di `jsonb_ops` e copre l'operatore
     di contenimento, che è quello che serve a «trovami le righe che hanno
     questo campo così». */
  stmts.push(`CREATE INDEX IF NOT EXISTS gx_${name}_data ON ${name} USING GIN (data jsonb_path_ops)`);
  return stmts;
}

function createSQL(name) {
  return [createTableSQL(name), ...createIndexSQL(name)];
}

/** Lo schema intero, nell'ordine in cui va eseguito. */
function schemaCompleto() {
  const out = [];
  for (const name of NAMES) out.push(...createSQL(name));
  return out;
}

module.exports = { COLLAZIONE, colTypePg, colDdlPg, createTableSQL, createIndexSQL, createSQL, schemaCompleto };
