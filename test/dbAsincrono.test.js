import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { PathfinderDB, motoreScelto } = require('../server/lib/db.js');

/* IL SERVIZIO DATI E' ASINCRONO DALLA 2.2, E QUESTE PROVE GUARDANO LA COSA
   CHE QUEL CAMBIO HA INTRODOTTO: la coda delle transazioni.

   `test/collaudo.js` prova il servizio dalle rotte, ed e' li' che si vede
   che il magazzino funziona. Quel che da li' NON si vede e' il caso che il
   passaggio all'asincrono ha aperto, perche' per vederlo servono due
   operazioni che partono insieme:

   `BEGIN` e `COMMIT` valgono per la CONNESSIONE, non per la chiamata. Un
   `await` in mezzo a una transazione cede il turno, e un'altra richiesta
   che entrasse li' scriverebbe DENTRO la transazione di qualcun altro - e
   verrebbe annullata insieme a lei, o la porterebbe a termine per sbaglio.
   Non da' errore: da' due saldi che divergono il primo pomeriggio in cui
   due terminali prelevano lo stesso lotto.

   E' anche la lettura giusta di §6, «la concorrenza si risolve con una
   transazione dentro /api/op/...»: la coda e' quel che rende vera quella
   frase adesso che il codice attende. */

const temporanei = [];
function apri() {
  const file = path.join(os.tmpdir(), `pathfinder-prova-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  temporanei.push(file);
  return new PathfinderDB(file, { motore: 'sqlite' });
}

afterAll(async () => {
  for (const f of temporanei) {
    for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch { /* gia' via */ } }
  }
});

describe('il motore si sceglie, e di serie e\' quello di prima', () => {
  it('senza dire niente resta SQLite', () => {
    const prima = process.env.PATHFINDER_DB_MOTORE;
    delete process.env.PATHFINDER_DB_MOTORE;
    expect(motoreScelto()).toBe('sqlite');
    if (prima !== undefined) process.env.PATHFINDER_DB_MOTORE = prima;
  });

  it('un valore che non esiste si ferma subito, invece di ripiegare in silenzio', () => {
    const prima = process.env.PATHFINDER_DB_MOTORE;
    process.env.PATHFINDER_DB_MOTORE = 'oracle';
    expect(() => motoreScelto()).toThrow(/non prevista|non previsto/i);
    if (prima === undefined) delete process.env.PATHFINDER_DB_MOTORE;
    else process.env.PATHFINDER_DB_MOTORE = prima;
  });
});

describe('la coda delle transazioni', () => {
  it('due transazioni che partono insieme NON si infilano una nell\'altra', async () => {
    const db = apri();
    await db.pronto();
    const traccia = [];

    /* L'`await` in mezzo e' il punto della prova: e' li' che, senza coda,
       l'altra transazione entrerebbe. */
    const una = db.transaction(['meta'], async () => {
      traccia.push('A entra');
      await db.put('meta', { key: 'a', value: 1 });
      await new Promise(r => setTimeout(r, 10));
      await db.put('meta', { key: 'a2', value: 1 });
      traccia.push('A esce');
    });
    const due = db.transaction(['meta'], async () => {
      traccia.push('B entra');
      await db.put('meta', { key: 'b', value: 2 });
      traccia.push('B esce');
    });

    await Promise.all([una, due]);
    expect(traccia).toEqual(['A entra', 'A esce', 'B entra', 'B esce']);
    await db.close();
  });

  it('una transazione che fallisce non lascia niente scritto', async () => {
    const db = apri();
    await db.pronto();
    await db.put('meta', { key: 'prima', value: 'c\'era' });

    await expect(db.transaction(['meta'], async () => {
      await db.put('meta', { key: 'dentro', value: 'non deve restare' });
      throw new Error('qualcosa e\' andato storto a meta\'');
    })).rejects.toThrow(/storto/);

    expect(await db.get('meta', 'dentro')).toBeNull();
    expect((await db.get('meta', 'prima')).value).toBe('c\'era');
    await db.close();
  });

  /* Se la coda si fermasse sul primo errore, un rifiuto legittimo -
     «un altro terminale ha gia' preso quei colli» - bloccherebbe il
     magazzino invece di respingere una richiesta. */
  it('dopo una transazione fallita la coda va avanti', async () => {
    const db = apri();
    await db.pronto();
    await expect(db.transaction(['meta'], async () => { throw new Error('respinta'); }))
      .rejects.toThrow(/respinta/);
    await db.transaction(['meta'], async () => {
      await db.put('meta', { key: 'dopo', value: 'scritta' });
    });
    expect((await db.get('meta', 'dopo')).value).toBe('scritta');
    await db.close();
  });

  /* Le transazioni annidate non aprono niente: si accodano alla piu' esterna
     e le passano le collezioni toccate. Era cosi' anche prima, e deve
     restarlo - `bulkPut` chiama `put` che potrebbe aprirne un'altra. */
  it('una transazione dentro un\'altra non ne apre una seconda', async () => {
    const db = apri();
    await db.pronto();
    const fuori = await db.transaction(['meta'], async () => {
      await db.bulkPut('meta', [{ key: 'x', value: 1 }, { key: 'y', value: 2 }]);
      return 'finita';
    });
    expect(fuori).toBe('finita');
    expect((await db.get('meta', 'x')).value).toBe(1);
    expect((await db.get('meta', 'y')).value).toBe(2);
    await db.close();
  });
});

describe('la superficie non e\' cambiata, solo il modo di aspettarla', () => {
  it('scrive, rilegge, conta e cancella come prima', async () => {
    const db = apri();
    await db.pronto();

    const id = await db.add('mov_log', { ts: 1000, type: 'IN', article_code: '700', lot_code: 'L1', user: 'AS' });
    expect(typeof id).toBe('number');

    expect(await db.count('mov_log')).toBe(1);
    const uno = await db.get('mov_log', id);
    expect(uno.article_code).toBe('700');

    await db.add('mov_log', { ts: 2000, type: 'OUT', article_code: '700', lot_code: 'L1', user: 'AS' });
    const perTempo = await db.query('mov_log', { orderBy: 'ts', reverse: true });
    expect(perTempo.map(r => r.ts)).toEqual([2000, 1000]);

    /* La paginazione: su SQL Server pretende un ORDER BY, e `query` ce l'ha
       sempre - qui si prova che con SQLite dice la stessa cosa. */
    const primo = await db.query('mov_log', { orderBy: 'ts', limit: 1 });
    expect(primo).toHaveLength(1);
    expect(primo[0].ts).toBe(1000);

    expect(await db.delete('mov_log', id)).toBe(1);
    expect(await db.count('mov_log')).toBe(1);
    await db.close();
  });

  it('un campo non indicizzato non puo\' filtrare, e lo dice con 400', async () => {
    const db = apri();
    await db.pronto();
    await expect(db.query('mov_log', { criteria: { field: 'note', op: 'equals', value: 'x' } }))
      .rejects.toMatchObject({ status: 400 });
    await db.close();
  });

  it('la revisione avanza a ogni scrittura, e `loadAll` la riporta', async () => {
    const db = apri();
    await db.pronto();
    const prima = await db.currentRevision();
    await db.put('meta', { key: 'k', value: 1 });
    const dopo = await db.currentRevision();
    expect(dopo).toBeGreaterThan(prima);
    const tutto = await db.loadAll();
    expect(tutto._revision).toBe(dopo);
    expect(tutto.meta.some(m => m.key === 'k')).toBe(true);
    await db.close();
  });
});
