'use strict';

/* IL DIALETTO SQL, IN UN POSTO SOLO — 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   PURO: costruisce stringhe SQL e liste di argomenti, non apre niente e non
   esegue niente. I due driver — `driver-sqlite.js` e `driver-postgres.js` —
   chiamano queste funzioni e si limitano a mandare in esecuzione quel che
   torna. Le prove stanno in `test/sql.test.js`.

   PERCHE' STA QUI. Fino alla 2.5 lo SQL nasceva sparso dentro `db.js`,
   intrecciato a `better-sqlite3`. Con due database dietro la stessa
   interfaccia, ogni pezzo di SQL scritto due volte e' un pezzo che diverge:
   l'audit misura un difetto su un driver e non sull'altro, e nessuno lo sa
   finche' il magazzino non se ne accorge. Il dialetto e' un parametro, non
   una copia del file. */

const { COLLECTIONS, materialize } = require('./schema');

const SQLITE = 'sqlite';
const POSTGRES = 'postgres';

/* Quanti argomenti regge una sola istruzione. PostgreSQL si ferma a 65535
   perche' li conta in un intero a 16 bit; SQLite di serie a 32766. Si sta
   sotto tutti e due con un margine, perche' il numero di colonne cambia da
   collezione a collezione e il conto lo fa `lottoRighe`. */
const LIMITE_ARGOMENTI = { [SQLITE]: 30000, [POSTGRES]: 60000 };

/* Un tetto anche in righe: un'istruzione con diecimila tuple dentro e' un
   testo da megabyte che il server deve analizzare prima di eseguire, e il
   guadagno sul giro di rete finisce sotto il costo del parsing. */
const TETTO_RIGHE = 1000;

/** Il segnaposto n-esimo nel dialetto giusto. `n` parte da 1. */
function segno(dialetto, n) {
  return dialetto === POSTGRES ? `$${n}` : '?';
}

/** Un contatore di segnaposti, perche' Postgres li numera e SQLite no. */
function contatore(dialetto, da = 1) {
  let n = da;
  return () => segno(dialetto, n++);
}

/* ── Le colonne di una collezione ────────────────────────────────────── */

/** Le colonne materializzate, senza la chiave primaria. */
function colonneMaterializzate(nome) {
  const col = COLLECTIONS[nome];
  return col.indexed.filter(f => f !== col.pk);
}

/* LA CHIAVE AUTOMATICA ENTRA FRA LE COLONNE SOLO QUANDO C'E' GIA'.

   Su una riga nuova non si scrive: la assegna la sequenza. Su una riga che
   esiste si DEVE scrivere, o l'`ON CONFLICT(_id)` non ha su cosa scattare e
   l'aggiornamento diventa un inserimento — una riga nuova ogni volta che si
   salva, e il saldo che non scende. E' il difetto che ha tinto di rosso 28
   prove del servizio il 26/08. */
function colonneScrittura(nome, conChiave = null) {
  const col = COLLECTIONS[nome];
  const mat = colonneMaterializzate(nome);
  const porta = conChiave === null ? col.pkType !== 'auto' : conChiave;
  return porta ? [col.pk, ...mat, 'data'] : [...mat, 'data'];
}

/** Gli argomenti di una riga, nell'ordine di `colonneScrittura`. */
function argomentiRiga(nome, record, { conChiave = null } = {}) {
  const col = COLLECTIONS[nome];
  const mat = materialize(nome, record);
  const nomi = colonneMaterializzate(nome);
  const porta = conChiave === null ? col.pkType !== 'auto' : conChiave;

  /* La chiave automatica NON va dentro `data`: la porta la colonna, e
     `idrata` la rimette sul documento in lettura. Scriverla in tutti e due i
     posti vuol dire due valori che possono divergere. */
  const { [col.pk]: _via, ...senzaChiave } = record;
  const documento = JSON.stringify(col.pkType === 'auto' ? senzaChiave : record);

  const valori = nomi.map(c => mat[c]);
  if (!porta) return [...valori, documento];
  const chiave = col.pkType === 'auto' ? Number(record[col.pk]) : String(record[col.pk]);
  return [chiave, ...valori, documento];
}

/* ── Il numero di righe per istruzione ───────────────────────────────── */

/* IL PUNTO 3 DELLA MIGRAZIONE STA TUTTO QUI.
   Fino alla 2.5 `bulkPut` scriveva una INSERT per record dentro una
   transazione: su un file locale sono 43 microsecondi a riga e non si nota,
   su un database in una regione Azure sono 11.197 giri di rete per
   l'anagrafica articoli — misurati, quasi tre minuti, cioe' un import che
   va in timeout invece che in porto. Una sola istruzione con dentro molte
   tuple fa lo stesso lavoro in ventitre' giri. */
function lottoRighe(nome, dialetto) {
  /* Si conta col caso piu' largo — chiave compresa — o un lotto di righe che
     la portano sfonderebbe il tetto che un lotto senza chiave rispettava. */
  const perRiga = colonneScrittura(nome, true).length;
  const daArgomenti = Math.floor((LIMITE_ARGOMENTI[dialetto] || 30000) / perRiga);
  return Math.max(1, Math.min(TETTO_RIGHE, daArgomenti));
}

/** Spezza un elenco nei lotti che una sola istruzione regge. */
function aLotti(nome, records, dialetto) {
  const n = lottoRighe(nome, dialetto);
  const out = [];
  for (let i = 0; i < records.length; i += n) out.push(records.slice(i, i + n));
  return out;
}

/* ── Scrittura ───────────────────────────────────────────────────────── */

/** Una INSERT con dentro tutte le righe del lotto. */
function sqlInserisci(nome, records, dialetto, { upsert = false, conChiave = null } = {}) {
  const col = COLLECTIONS[nome];
  const cols = colonneScrittura(nome, conChiave);
  const prossimo = contatore(dialetto);
  const args = [];
  const tuple = [];

  for (const r of records) {
    const a = argomentiRiga(nome, r, { conChiave });
    args.push(...a);
    tuple.push(`(${a.map(() => prossimo()).join(', ')})`);
  }

  let sql = `INSERT INTO ${nome} (${cols.join(', ')}) VALUES ${tuple.join(', ')}`;
  if (upsert) {
    const agg = cols.filter(c => c !== col.pk).map(c => `${c}=excluded.${c}`).join(', ');
    sql += ` ON CONFLICT(${col.pk}) DO UPDATE SET ${agg}`;
  }
  /* RETURNING invece di `lastInsertRowid`: con piu' righe per istruzione il
     rowid dell'ultima non dice le altre, e Postgres non ce l'ha affatto.
     SQLite lo sostiene dalla 3.35, e `better-sqlite3` 13 ne porta una piu'
     nuova. */
  sql += ` RETURNING ${col.pk}`;
  return { sql, args };
}

/* ── Lettura e filtro ────────────────────────────────────────────────── */

/* `startsWith` NON E' UN LIKE, E NON PUO' ESSERLO — 2.6.

   Il `LIKE` di SQLite ignora le maiuscole sull'ASCII; quello di PostgreSQL
   no. Fino alla 2.5 lo stesso criterio voleva dire tre cose diverse in tre
   posti: sensibile alle maiuscole in Dexie (`local.ts`), sensibile nella
   cache del client (`String.startsWith`), INSENSIBILE sul servizio, che era
   l'unico dei tre a usare LIKE. Nessuno se n'era accorto perche' l'unico
   uso — cancellare le ubicazioni di una zona o di un sito — costruisce il
   prefisso dallo stesso identificativo che ha generato i codici, e il caso
   non diverge mai.

   `substr(colonna, 1, N) = ?` si comporta uguale nei due database, e' esatto
   come lo e' `String.startsWith`, e non ha nemmeno metacaratteri da
   proteggere: niente `%`, niente `_`, niente ESCAPE. Non usa l'indice, e su
   una cancellazione di zona — un gesto d'amministrazione su tavoli da
   centinaia di righe — non ha importanza. */

function sqlDove(nome, criteria, dialetto, da = 1) {
  if (!criteria) return { sql: '', args: [], prossimo: da };
  const col = COLLECTIONS[nome];
  const materializzate = new Set([col.pk, ...col.indexed]);
  const f = criteria.field;
  if (!materializzate.has(f))
    throw Object.assign(new Error(`${nome}: il campo "${f}" non e' indicizzato e non puo' filtrare`), { status: 400 });

  const prossimo = contatore(dialetto, da);
  let n = da;
  const p = () => { n++; return prossimo(); };

  switch (criteria.op) {
    case 'equals':       return { sql: ` WHERE ${f} = ${p()}`, args: [criteria.value], prossimo: n };
    case 'notEquals':    return { sql: ` WHERE ${f} <> ${p()}`, args: [criteria.value], prossimo: n };
    case 'startsWith': {
      const v = String(criteria.value);
      return { sql: ` WHERE substr(${f}, 1, ${p()}) = ${p()}`, args: [v.length, v], prossimo: n };
    }
    case 'below':        return { sql: ` WHERE ${f} < ${p()}`, args: [criteria.value], prossimo: n };
    case 'belowOrEqual': return { sql: ` WHERE ${f} <= ${p()}`, args: [criteria.value], prossimo: n };
    case 'above':        return { sql: ` WHERE ${f} > ${p()}`, args: [criteria.value], prossimo: n };
    case 'aboveOrEqual': return { sql: ` WHERE ${f} >= ${p()}`, args: [criteria.value], prossimo: n };
    case 'between':      return { sql: ` WHERE ${f} >= ${p()} AND ${f} <= ${p()}`,
                                  args: [criteria.value[0], criteria.value[1]], prossimo: n };
    case 'anyOf': {
      const v = Array.isArray(criteria.value) ? criteria.value : [criteria.value];
      /* Un `IN ()` vuoto non e' SQL valido da nessuna delle due parti, e il
         suo significato e' «nessuna riga»: si scrive, invece di rompersi. */
      if (!v.length) return { sql: ' WHERE 1 = 0', args: [], prossimo: n };
      /* UN ELENCO SMISURATO E' UNA RICHIESTA SBAGLIATA, NON UN GUASTO.
         Ogni valore e' un argomento, e i due database hanno un tetto: SQLite
         risponderebbe «too many SQL variables» e PostgreSQL un errore di
         protocollo. Un 500 con dentro il messaggio del motore dice al
         chiamante che il servizio si e' rotto; e' lui che ha chiesto troppo,
         e va detto con un 400. */
      const tetto = LIMITE_ARGOMENTI[dialetto] || 30000;
      if (v.length > tetto)
        throw Object.assign(
          new Error(`${nome}: "anyOf" con ${v.length} valori, il massimo e' ${tetto}. Spezzare la richiesta.`),
          { status: 400 });
      return { sql: ` WHERE ${f} IN (${v.map(() => p()).join(', ')})`, args: v, prossimo: n };
    }
    default:
      throw Object.assign(new Error(`Operatore di criterio sconosciuto: ${criteria.op}`), { status: 400 });
  }
}

function sqlSeleziona(nome, { criteria = null, limit = null, offset = 0, reverse = false, orderBy = null } = {}, dialetto) {
  const col = COLLECTIONS[nome];
  const w = sqlDove(nome, criteria, dialetto);
  const ord = orderBy && (orderBy === col.pk || col.indexed.includes(orderBy)) ? orderBy : col.pk;
  const prossimo = contatore(dialetto, w.prossimo);
  let sql = `SELECT * FROM ${nome}${w.sql} ORDER BY ${ord} ${reverse ? 'DESC' : 'ASC'}`;
  const args = [...w.args];
  if (limit != null) { sql += ` LIMIT ${prossimo()}`; args.push(limit); }
  if (offset) { sql += ` OFFSET ${prossimo()}`; args.push(offset); }
  return { sql, args };
}

function sqlConta(nome, criteria, dialetto) {
  const w = sqlDove(nome, criteria, dialetto);
  return { sql: `SELECT COUNT(*) AS c FROM ${nome}${w.sql}`, args: w.args };
}

/* VENTI COUNT SONO VENTI GIRI DI RETE, E UNO BASTA.
   `/api/health` e `stats()` li chiedono tutti insieme a ogni colpo. */
function sqlContaTutte(nomi, dialetto) {
  const parti = nomi.map(n => `SELECT '${n}' AS collezione, COUNT(*) AS c FROM ${n}`);
  return { sql: parti.join(' UNION ALL '), args: [] };
}

function sqlCancella(nome, dialetto) {
  const col = COLLECTIONS[nome];
  return { sql: `DELETE FROM ${nome} WHERE ${col.pk} = ${segno(dialetto, 1)}`, args: [] };
}

function sqlCancellaDove(nome, criteria, dialetto) {
  const w = sqlDove(nome, criteria, dialetto);
  return { sql: `DELETE FROM ${nome}${w.sql}`, args: w.args };
}

function sqlLeggi(nome, dialetto) {
  const col = COLLECTIONS[nome];
  return { sql: `SELECT * FROM ${nome} WHERE ${col.pk} = ${segno(dialetto, 1)}`, args: [] };
}

/** La chiave come la vuole la colonna: un intero per l'automatica, testo se no. */
function chiaveBind(nome, key) {
  const col = COLLECTIONS[nome];
  return col.pkType === 'auto' ? Number(key) : String(key);
}

/** Il documento ricomposto da una riga letta. */
function idrata(nome, riga) {
  if (!riga) return null;
  const col = COLLECTIONS[nome];
  /* Postgres rende JSONB gia' decodificato, SQLite una stringa. */
  const doc = typeof riga.data === 'string' ? JSON.parse(riga.data) : riga.data;
  doc[col.pk] = riga[col.pk];
  return doc;
}

module.exports = {
  SQLITE, POSTGRES, LIMITE_ARGOMENTI, TETTO_RIGHE,
  segno, contatore,
  colonneMaterializzate, colonneScrittura, argomentiRiga,
  lottoRighe, aLotti,
  sqlInserisci, sqlDove, sqlSeleziona, sqlConta, sqlContaTutte,
  sqlCancella, sqlCancellaDove, sqlLeggi,
  chiaveBind, idrata,
};
