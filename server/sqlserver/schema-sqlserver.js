'use strict';

/* LO SCHEMA SQL SERVER, GENERATO DALLA STESSA DICHIARAZIONE - 2.2.
   (c) Andrea Sacchetti - Dietopack S.r.l. (Naturacare Group)

   RAMO PARALLELO, come lo era `azure/` per PostgreSQL: questo file NON e' in
   servizio e non lo chiama nessuno. La produzione gira su SQLite e continua a
   girarci finche' non e' scritto il contrario. Sta qui perche' il 25/08/2026
   e' stata confermata la migrazione a SQL Server (voce 36 dell'INDEX), e la
   prima cosa che serve e' lo schema - senza toccare quello che lavora.

   LE VENTI COLLEZIONI SI DICHIARANO IN UN POSTO SOLO, e quel posto resta
   `lib/schema.js`. Ricopiarle qui vorrebbe dire due vocabolari che combaciano
   finche' qualcuno se ne ricorda, che e' il difetto per cui quella
   dichiarazione unica esiste. Qui c'e' solo la traduzione dei tipi, e
   `test/schemaSqlServer.test.js` verifica che le due parti restino in pari.

   ─── COSA CAMBIA DA SQLITE, E PERCHE' ──────────────────────────────────

   1. OGNI IDENTIFICATORE VA FRA PARENTESI QUADRE, e non e' pignoleria:
      `meta` ha una colonna che si chiama **`key`**, che in T-SQL e' una
      parola riservata. Senza le quadre quel `CREATE TABLE` non compila, e
      lo si scoprirebbe a meta' migrazione. Quotare tutto costa niente e
      toglie di mezzo la categoria intera - `status` e `type` oggi passano
      lo stesso, ma nessuno deve piu' andare a controllare.

   2. `IF NOT EXISTS` NON ESISTE su CREATE TABLE ne' su CREATE INDEX. SQLite
      e PostgreSQL ce l'hanno, SQL Server no: la guardia si scrive a mano
      con `OBJECT_ID` e `sys.indexes`. Serve per la stessa ragione di la' -
      lo schema si rilancia sopra un database che gia' esiste, e deve essere
      un'operazione ripetibile.

   3. LE COLONNE MATERIALIZZATE DIVENTANO `NVARCHAR(200)`, NON `NVARCHAR(MAX)`.
      Questa e' la differenza che morde: **una chiave di indice non puo'
      essere `NVARCHAR(MAX)`**, e su SQLite quelle colonne sono TEXT senza
      limite e indicizzate tutte. Duecento caratteri sono larghi il doppio
      del necessario - il valore piu' lungo e' `item_key`, che e'
      `ARTICOLO#LOTTO` con trenta piu' trenta piu' il separatore, cioe' 61 -
      e stanno comodi sotto il limite della chiave di indice. Una prova
      verifica che nessuna colonna indicizzata nasca senza limite.

   4. `NVARCHAR`, MAI `VARCHAR`. Le descrizioni articolo, i nomi degli
      operatori e le ragioni sociali dei destinatari sono italiane e portano
      le accentate. `VARCHAR` sotto una collation non Unicode le storpia in
      silenzio, e un dato storpiato non da' errore: da' una descrizione con
      un punto interrogativo dentro, sei anni a registro.

   5. `data` E' `NVARCHAR(MAX)` CON `CHECK (ISJSON(...) = 1)`, non il tipo
      `json` nativo. Il tipo nativo esiste nelle versioni recenti, ma **quale
      versione abbia l'azienda e' una delle due domande ancora aperte** (voce
      36), e questa forma funziona su tutto quello che potrebbe rispondere -
      SQL Server dal 2016 in avanti e Azure SQL. Il `CHECK` non e' decorativo:
      e' l'unica cosa che impedisce a una riga di entrare con dentro qualcosa
      che JSON non e'. Si stringe al tipo nativo il giorno che la versione e'
      nota, ed e' un `ALTER`, non una riscrittura.

   6. **NON C'E' UN INDICE SUL DOCUMENTO, e va detto invece che nascosto.**
      Il ramo PostgreSQL metteva un GIN su `data` JSONB, e quella era «l'unica
      ragione tecnica seria per cui PostgreSQL varrebbe la pena su questo
      modello». SQL Server non ha un equivalente: si indicizza un campo del
      documento promuovendolo a **colonna calcolata persistita** e mettendo
      l'indice su quella - un campo per volta, dichiarato. Quindi qui il
      documento e' testo con un controllo di validita', e **quell'argomento
      non si trasferisce**. Non cambia la decisione, che e' presa per altre
      ragioni; cambia cosa ci si deve aspettare, ed e' meglio saperlo adesso.
      Il client di oggi comunque non lo sfruttava: legge e filtra a monte.

   7. La chiave automatica diventa `BIGINT IDENTITY(1,1)`. `_id` resta un
      intero opaco e nessuno ci fa conti sopra. **Preservarlo in migrazione
      chiede `SET IDENTITY_INSERT`** - vedi `migra-sqlite-sqlserver.js`, e il
      perche' e' che `tasks.mov_ids` e i riferimenti degli archivi puntano a
      quei numeri.

   8. I booleani restano com'erano. SQLite li scrive 0/1 perche' non ha il
      tipo, e le colonne materializzate passano da `materialize`: cambiarne
      il tipo qui vorrebbe dire due letture diverse dello stesso dato a
      seconda del database. Si stringe quando si migra davvero, non prima. */

const { COLLECTIONS, NAMES } = require('../lib/schema');

/** Quanto e' larga una colonna materializzata. Vedi il punto 3 in testa:
    non e' una stima generosa a caso, e' il doppio abbondante del valore piu'
    lungo che lo schema puo' produrre, tenuto sotto il limite della chiave
    di indice. */
const LARGHEZZA = 200;

/** Fra parentesi quadre, sempre. Punto 1 in testa: `meta.key` non e'
    un'ipotesi, e' gia' li'. */
const q = (nome) => `[${nome}]`;

/** Il tipo SQL Server di una colonna materializzata. */
function colTypeMs(col, field) {
  return (col.numeric || []).includes(field) ? 'BIGINT' : `NVARCHAR(${LARGHEZZA})`;
}

function createTableSQL(name) {
  const col = COLLECTIONS[name];
  const cols = [];

  if (col.pkType === 'auto') cols.push(`${q(col.pk)} BIGINT IDENTITY(1,1) PRIMARY KEY`);
  else cols.push(`${q(col.pk)} NVARCHAR(${LARGHEZZA}) NOT NULL PRIMARY KEY`);

  for (const f of col.indexed) {
    if (f === col.pk) continue;
    cols.push(`${q(f)} ${colTypeMs(col, f)}`);
  }
  /* NOT NULL come su SQLite: un documento senza corpo non e' un record, e' una
     riga che qualcuno ha scritto a meta'. Il CHECK e' il punto 5. */
  cols.push('[data] NVARCHAR(MAX) NOT NULL');
  cols.push(`CONSTRAINT ${q('ck_' + name + '_data_json')} CHECK (ISJSON([data]) = 1)`);

  /* La guardia del punto 2. `N'U'` e' «tabella utente»: senza, `OBJECT_ID`
     risponderebbe anche per una vista o una procedura con lo stesso nome. */
  return `IF OBJECT_ID(N'${name}', N'U') IS NULL CREATE TABLE ${q(name)} (${cols.join(', ')})`;
}

/** La guardia per un indice: stessa ragione del punto 2, sintassi diversa
    perche' un indice non ha un `OBJECT_ID` suo - vive dentro la tabella. */
function seNonCEIndice(name, indice, corpo) {
  return `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'${indice}' `
       + `AND object_id = OBJECT_ID(N'${name}', N'U')) ${corpo}`;
}

function createIndexSQL(name) {
  const col = COLLECTIONS[name];
  const stmts = [];

  for (const f of col.indexed) {
    if (f === col.pk) continue;
    const uniq = (col.unique || []).includes(f) ? 'UNIQUE ' : '';
    const ix = `ix_${name}_${f}`;
    stmts.push(seNonCEIndice(name, ix,
      `CREATE ${uniq}INDEX ${q(ix)} ON ${q(name)}(${q(f)})`));
  }
  for (const pair of (col.composite || [])) {
    const ix = `ix_${name}_${pair.join('_')}`;
    stmts.push(seNonCEIndice(name, ix,
      `CREATE INDEX ${q(ix)} ON ${q(name)}(${pair.map(q).join(', ')})`));
  }
  for (const pair of (col.compositeUnique || [])) {
    const ux = `ux_${name}_${pair.join('_')}`;
    stmts.push(seNonCEIndice(name, ux,
      `CREATE UNIQUE INDEX ${q(ux)} ON ${q(name)}(${pair.map(q).join(', ')})`));
  }
  /* Niente indice sul documento: punto 6 in testa. Non e' una dimenticanza,
     ed e' scritto li' perche' non lo diventi. */
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

module.exports = { LARGHEZZA, colTypeMs, createTableSQL, createIndexSQL, createSQL, schemaCompleto };
