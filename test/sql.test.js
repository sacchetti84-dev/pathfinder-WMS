import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../server/lib/sql.js');
const { COLLECTIONS } = require('../server/lib/schema.js');
const { SQLITE, POSTGRES } = S;

/* LO SQL SI SCRIVE UNA VOLTA SOLA, PER DUE DATABASE.
   Ogni prova qui sotto e' un punto in cui i due dialetti potrebbero
   divergere senza che nessuno se ne accorga fino al turno di magazzino in
   cui divergono. */

describe('i segnaposti: PostgreSQL li numera, SQLite no', () => {
  it('il punto interrogativo e il dollaro', () => {
    expect(S.segno(SQLITE, 1)).toBe('?');
    expect(S.segno(SQLITE, 7)).toBe('?');
    expect(S.segno(POSTGRES, 1)).toBe('$1');
    expect(S.segno(POSTGRES, 7)).toBe('$7');
  });

  it('e il contatore non salta un numero', () => {
    const p = S.contatore(POSTGRES);
    expect([p(), p(), p()]).toEqual(['$1', '$2', '$3']);
  });
});

describe('le colonne di una riga', () => {
  it('la chiave automatica non entra fra le colonne scritte', () => {
    expect(S.colonneScrittura('inventory')).toEqual(
      ['location_code', 'item_key', 'article_code', 'lot_code', 'udc_id', 'data']);
  });

  it('quella testuale sì, ed è la prima', () => {
    expect(S.colonneScrittura('operators')[0]).toBe('op_id');
  });

  /* La chiave automatica NON va dentro `data`: la porta la colonna, e
     scriverla in tutti e due i posti vuol dire due valori che divergono. */
  it('il documento di una collezione a chiave automatica non porta la chiave', () => {
    const a = S.argomentiRiga('inventory', { _id: 99, item_key: 'A#B', qty: 3 });
    const doc = JSON.parse(a[a.length - 1]);
    expect(doc._id).toBeUndefined();
    expect(doc.qty).toBe(3);
  });

  it('quello di una collezione a chiave testuale la porta', () => {
    const a = S.argomentiRiga('operators', { op_id: 'OP-1', initials: 'AS' });
    expect(JSON.parse(a[a.length - 1]).op_id).toBe('OP-1');
  });
});

/* IL PUNTO 3 DELLA MIGRAZIONE.
   Una INSERT per riga sono 11.197 giri di rete per l'anagrafica articoli —
   misurati, quasi tre minuti verso una regione Azure. */
describe('le righe si scrivono a lotti, non una per volta', () => {
  it('un lotto sta sotto il tetto degli argomenti di tutti e due i database', () => {
    for (const nome of Object.keys(COLLECTIONS)) {
      const perRiga = S.colonneScrittura(nome).length;
      expect(S.lottoRighe(nome, POSTGRES) * perRiga).toBeLessThanOrEqual(S.LIMITE_ARGOMENTI[POSTGRES]);
      expect(S.lottoRighe(nome, SQLITE) * perRiga).toBeLessThanOrEqual(S.LIMITE_ARGOMENTI[SQLITE]);
    }
  });

  it('e sotto il tetto in righe, che è quello che comanda in pratica', () => {
    expect(S.lottoRighe('articles', POSTGRES)).toBe(S.TETTO_RIGHE);
    expect(S.lottoRighe('meta', POSTGRES)).toBe(S.TETTO_RIGHE);
  });

  it('11.197 articoli diventano 12 istruzioni, non 11.197', () => {
    const righe = Array.from({ length: 11197 }, (_, i) => ({ code: `A${i}`, category: 'MP' }));
    const lotti = S.aLotti('articles', righe, POSTGRES);
    expect(lotti).toHaveLength(12);
    expect(lotti.reduce((n, l) => n + l.length, 0)).toBe(11197);
    expect(lotti[lotti.length - 1]).toHaveLength(197);
  });

  it('un elenco vuoto non fa nessun lotto', () => {
    expect(S.aLotti('articles', [], POSTGRES)).toEqual([]);
  });

  it('una riga sola fa un lotto solo', () => {
    expect(S.aLotti('articles', [{ code: 'A' }], SQLITE)).toHaveLength(1);
  });
});

describe('la INSERT con dentro molte righe', () => {
  it('mette una tupla per riga e conta gli argomenti giusti', () => {
    const { sql, args } = S.sqlInserisci('lots',
      [{ article_code: 'A1', lot_code: 'L1' }, { article_code: 'A2', lot_code: 'L2' }], SQLITE);
    expect(sql).toContain('INSERT INTO lots (article_code, lot_code, data) VALUES');
    expect(sql).toContain('(?, ?, ?), (?, ?, ?)');
    expect(args).toHaveLength(6);
  });

  it('e in PostgreSQL i segnaposti sono numerati di seguito', () => {
    const { sql } = S.sqlInserisci('lots',
      [{ article_code: 'A1', lot_code: 'L1' }, { article_code: 'A2', lot_code: 'L2' }], POSTGRES);
    expect(sql).toContain('($1, $2, $3), ($4, $5, $6)');
  });

  it('l’upsert aggiorna tutte le colonne tranne la chiave', () => {
    const { sql } = S.sqlInserisci('operators', [{ op_id: 'OP-1', initials: 'AS' }], POSTGRES, { upsert: true });
    expect(sql).toContain('ON CONFLICT(op_id) DO UPDATE SET');
    expect(sql).toContain('initials=excluded.initials');
    expect(sql).toContain('data=excluded.data');
    expect(sql).not.toContain('op_id=excluded.op_id');
  });

  /* Con piu' righe per istruzione il rowid dell'ultima non dice le altre, e
     Postgres non ce l'ha affatto. */
  it('torna sempre le chiavi scritte', () => {
    expect(S.sqlInserisci('inventory', [{ item_key: 'A#B' }], SQLITE).sql).toMatch(/RETURNING _id$/);
    expect(S.sqlInserisci('operators', [{ op_id: 'X' }], POSTGRES).sql).toMatch(/RETURNING op_id$/);
  });
});

describe('il filtro', () => {
  it('un campo non indicizzato non può filtrare, e lo dice con un 400', () => {
    expect(() => S.sqlDove('inventory', { field: 'notes', op: 'equals', value: 'x' }, SQLITE))
      .toThrowError(/non e' indicizzato/);
    try { S.sqlDove('inventory', { field: 'notes', op: 'equals', value: 'x' }, SQLITE); }
    catch (e) { expect(e.status).toBe(400); }
  });

  it('un operatore sconosciuto pure', () => {
    expect(() => S.sqlDove('inventory', { field: 'lot_code', op: 'contiene', value: 'x' }, SQLITE))
      .toThrowError(/Operatore di criterio sconosciuto/);
  });

  /* `LIKE` di SQLite ignora le maiuscole sull'ASCII, quello di PostgreSQL
     no. `substr` si comporta uguale nei due, ed e' esatto come lo e'
     `String.startsWith` in Dexie e nella cache del client: fino alla 2.5 lo
     stesso criterio voleva dire tre cose diverse in tre posti. */
  it('startsWith NON usa LIKE, in nessuno dei due dialetti', () => {
    for (const d of [SQLITE, POSTGRES]) {
      const w = S.sqlDove('inventory', { field: 'location_code', op: 'startsWith', value: 'MAG1-' }, d);
      expect(w.sql).not.toMatch(/LIKE/i);
      expect(w.sql).toContain('substr(location_code, 1, ');
      expect(w.args).toEqual([5, 'MAG1-']);
    }
  });

  it('e non ha metacaratteri da proteggere: un prefisso col percento è un prefisso', () => {
    const w = S.sqlDove('inventory', { field: 'location_code', op: 'startsWith', value: '50%_x' }, POSTGRES);
    expect(w.args).toEqual([5, '50%_x']);
    expect(w.sql).not.toContain('ESCAPE');
  });

  it('between prende tutti e due gli estremi', () => {
    const w = S.sqlDove('mov_log', { field: 'ts', op: 'between', value: [10, 20] }, POSTGRES);
    expect(w.sql).toBe(' WHERE ts >= $1 AND ts <= $2');
    expect(w.args).toEqual([10, 20]);
  });

  it('anyOf apre un segnaposto per valore', () => {
    const w = S.sqlDove('mov_log', { field: 'type', op: 'anyOf', value: ['PICK', 'SHIP', 'EDIT'] }, POSTGRES);
    expect(w.sql).toBe(' WHERE type IN ($1, $2, $3)');
    expect(w.args).toEqual(['PICK', 'SHIP', 'EDIT']);
  });

  /* Un `IN ()` vuoto non e' SQL valido da nessuna delle due parti, e il suo
     significato e' «nessuna riga»: si scrive, invece di rompersi. */
  it('un anyOf vuoto vuol dire nessuna riga, e non un errore di sintassi', () => {
    const w = S.sqlDove('mov_log', { field: 'type', op: 'anyOf', value: [] }, POSTGRES);
    expect(w.sql).toBe(' WHERE 1 = 0');
    expect(w.args).toEqual([]);
  });

  it('nessun criterio vuol dire nessun WHERE', () => {
    expect(S.sqlDove('inventory', null, POSTGRES)).toEqual({ sql: '', args: [], prossimo: 1 });
  });
});

describe('la SELECT', () => {
  it('ordina per la chiave quando nessuno chiede altro', () => {
    expect(S.sqlSeleziona('inventory', {}, SQLITE).sql).toBe('SELECT * FROM inventory ORDER BY _id ASC');
  });

  /* Un `orderBy` su una colonna che non esiste diventerebbe SQL invalido, e
     con un valore che arriva dalla rete e' anche una via per iniettare. */
  it('un orderBy su un campo non indicizzato ripiega sulla chiave', () => {
    expect(S.sqlSeleziona('inventory', { orderBy: 'notes; DROP TABLE inventory' }, POSTGRES).sql)
      .toBe('SELECT * FROM inventory ORDER BY _id ASC');
  });

  it('limit e offset continuano la numerazione dopo il filtro', () => {
    const { sql, args } = S.sqlSeleziona('mov_log',
      { criteria: { field: 'ts', op: 'aboveOrEqual', value: 100 }, limit: 50, offset: 10, reverse: true, orderBy: 'ts' },
      POSTGRES);
    expect(sql).toBe('SELECT * FROM mov_log WHERE ts >= $1 ORDER BY ts DESC LIMIT $2 OFFSET $3');
    expect(args).toEqual([100, 50, 10]);
  });
});

describe('i conteggi', () => {
  /* Venti COUNT sono venti giri di rete, e uno basta. */
  it('countAll è UNA istruzione, non venti', () => {
    const { sql } = S.sqlContaTutte(['inventory', 'mov_log', 'articles'], POSTGRES);
    expect(sql.match(/UNION ALL/g)).toHaveLength(2);
    expect(sql).toContain("SELECT 'inventory' AS collezione, COUNT(*) AS c FROM inventory");
  });
});

describe('il documento ricomposto', () => {
  it('SQLite rende una stringa, PostgreSQL un oggetto già decodificato', () => {
    expect(S.idrata('inventory', { _id: 7, data: '{"qty":3}' })).toEqual({ qty: 3, _id: 7 });
    expect(S.idrata('inventory', { _id: 7, data: { qty: 3 } })).toEqual({ qty: 3, _id: 7 });
  });

  it('e la chiave torna sul documento, da dove `argomentiRiga` l’aveva tolta', () => {
    expect(S.idrata('operators', { op_id: 'OP-1', data: '{"initials":"AS"}' }))
      .toEqual({ op_id: 'OP-1', initials: 'AS' });
  });

  it('niente riga, niente documento', () => {
    expect(S.idrata('inventory', null)).toBeNull();
  });

  it('la chiave si lega come intero o come testo, secondo la collezione', () => {
    expect(S.chiaveBind('inventory', '42')).toBe(42);
    expect(S.chiaveBind('operators', 42)).toBe('42');
  });
});
