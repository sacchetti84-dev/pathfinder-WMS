import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const a = require('../server/migrazione/audit.js');

/* LE REGOLE DELL'AUDIT SI COLLAUDANO SENZA UN DATABASE.

   Il lanciatore apre una copia e stampa; qui si prova quel che decide se un
   valore passa o no, ed è l'unica parte che sbagliando fa danno: un audit
   che dice «pulito» su un database che pulito non è manda in migrazione
   qualcuno che si fida. Ogni prova che segue è un valore che SQLite accetta
   e PostgreSQL rifiuta. */

describe('le forme di data, e quale va corretta', () => {
  it('un epoch in millisecondi è già UTC, e non si tocca', () => {
    expect(a.classificaData(1787594538401)).toBe('epoch-ms');
    expect(a.dataDaCorreggere(1787594538401)).toBeNull();
  });

  /* Una scadenza di lotto è un giorno stampato sulla confezione, non un
     istante. Darle un fuso la sposta di due ore, e un lotto scaduto il 31
     comincia a risultare scaduto il 30. */
  it('una scadenza YYYY-MM-DD è un giorno di calendario, e NON va normalizzata', () => {
    expect(a.classificaData('2027-03-14')).toBe('calendario');
    expect(a.dataDaCorreggere('2027-03-14')).toBeNull();
  });

  it('un istante senza fuso va corretto: chi lo rilegge indovina', () => {
    expect(a.classificaData('2026-08-25T22:38:26')).toBe('istante-senza-fuso');
    expect(a.dataDaCorreggere('2026-08-25T22:38:26')).toBe('istante-senza-fuso');
  });

  it('un istante con la Z è UTC dichiarato, e passa', () => {
    expect(a.dataDaCorreggere('2026-08-25T22:38:26.545Z')).toBeNull();
  });

  it('uno scostamento esplicito va corretto: è vero, ma non è la forma di casa', () => {
    expect(a.classificaData('2026-08-26T00:38:26+02:00')).toBe('istante-con-scostamento');
    expect(a.dataDaCorreggere('2026-08-26T00:38:26+02:00')).toBe('istante-con-scostamento');
  });

  it('un giorno all’italiana è ambiguo, e va corretto', () => {
    expect(a.classificaData('03/04/2026')).toBe('giorno-all-italiana');
    expect(a.dataDaCorreggere('03/04/2026')).toBe('giorno-all-italiana');
  });

  it('un epoch scritto come stringa non è un numero, e va corretto', () => {
    expect(a.classificaData('1787594538401')).toBe('epoch-ms-come-stringa');
    expect(a.dataDaCorreggere('1787594538401')).toBe('epoch-ms-come-stringa');
  });

  it('un epoch con la virgola non è un istante che BIGINT sappia scrivere', () => {
    expect(a.classificaData(1787594538401.5)).toBe('epoch-non-intero');
    expect(a.dataDaCorreggere(1787594538401.5)).toBe('epoch-non-intero');
  });

  it('quel che data non è, non viene classificato', () => {
    expect(a.classificaData('MAG1-RAKA-01-04-A')).toBeNull();
    expect(a.classificaData(null)).toBeNull();
    expect(a.classificaData('')).toBeNull();
  });
});

describe('gli ostacoli: quel che SQLite ingoia e PostgreSQL rifiuta', () => {
  /* Il byte zero è LA trappola di questa migrazione. SQLite lo tiene dentro
     una TEXT senza fiatare; Postgres rifiuta l'intera INSERT, e succede a
     metà tavolo con dieci tavoli già scritti. */
  it('il byte zero dentro una stringa si vede', () => {
    expect(a.haByteZero('MP\u0000849')).toBe(true);
    expect(a.haByteZero('MP849')).toBe(false);
    expect(a.haByteZero(849)).toBe(false);
  });

  it('e si vede anche in fondo a un documento annidato', () => {
    const doc = { payload: { note: ['va bene', 'PALMITOIL\u0000ETANOLAMIDE'] } };
    const o = a.ostacoliPostgres(doc, 'tasks');
    expect(o).toHaveLength(1);
    expect(o[0].tipo).toBe('byte-zero');
    expect(o[0].percorso).toBe('tasks.payload.note[1]');
    expect(o[0].gravita).toBe('blocca');
  });

  /* UTF-16 accetta un surrogato spaiato, UTF-8 no: un codice a barre letto
     male da un terminale può farne nascere uno. */
  it('un surrogato spaiato è UTF-16 valido e UTF-8 rotto', () => {
    expect(a.haSurrogatoSpaiato('\uD800')).toBe(true);
    expect(a.haSurrogatoSpaiato('\uDC00 in coda')).toBe(true);
    expect(a.haSurrogatoSpaiato('😀')).toBe(false);
    expect(a.haSurrogatoSpaiato('lotto normale')).toBe(false);
  });

  it('un numero non finito non è un numero che si scriva', () => {
    const o = a.ostacoliPostgres({ qty: Infinity });
    expect(o).toHaveLength(1);
    expect(o[0].tipo).toBe('numero-non-finito');
  });

  it('un documento pulito non alza niente', () => {
    const doc = { item_key: '6001668#262567', qty: 1, expiry_date: '2027-03-14', notes: '' };
    expect(a.ostacoliPostgres(doc, 'inventory')).toEqual([]);
  });

  it('BIGINT ha un bordo, e un epoch ci sta dentro con larghezza', () => {
    expect(a.staInBigint(1787594538401)).toBe(true);
    expect(a.staInBigint(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(a.staInBigint(1e300)).toBe(false);
    expect(a.staInBigint(1.5)).toBe(false);
    expect(a.staInBigint(NaN)).toBe(false);
  });
});

describe('la colonna materializzata contro il documento', () => {
  it('quando combaciano non dice niente', () => {
    const doc = { item_key: '6001668#262567', location_code: 'MAG1-RAKA-01-01-A' };
    expect(a.divergenza('inventory', 'location_code', 'MAG1-RAKA-01-01-A', doc)).toBeNull();
  });

  /* La voce 14 della coda di lavoro è esattamente questa forma: la colonna
     resta indietro e nessuno se ne accorge, perché il client legge `data`. */
  it('quando la colonna è rimasta indietro lo dice, e dice tutti e due i valori', () => {
    const doc = { location_code: 'MAG1-RAKA-01-01-A' };
    const d = a.divergenza('inventory', 'location_code', 'MAG1-RAKA-04-05-B', doc);
    expect(d).toEqual({ campo: 'location_code', colonna: 'MAG1-RAKA-04-05-B', documento: 'MAG1-RAKA-01-01-A' });
  });

  /* SQLite rende gli INTEGER come number e il resto come string: confrontare
     `1` con `'1'` alzerebbe un falso allarme su ogni riga di ogni tavolo. */
  it('un numero e la sua stringa NON sono una divergenza', () => {
    const doc = { ts: 1787594538401 };
    expect(a.divergenza('mov_log', 'ts', 1787594538401, doc)).toBeNull();
    expect(a.divergenza('mov_log', 'ts', '1787594538401', doc)).toBeNull();
  });

  it('un booleano vale 1 o 0, come lo scrive `materialize`', () => {
    expect(a.attesa('operators', 'active', { active: true })).toBe(1);
    expect(a.attesa('operators', 'active', { active: false })).toBe(0);
    expect(a.divergenza('operators', 'active', 1, { active: true })).toBeNull();
  });

  it('assente nel documento vuol dire NULL in colonna, e viceversa è divergenza', () => {
    expect(a.attesa('inventory', 'udc_id', {})).toBeNull();
    expect(a.divergenza('inventory', 'udc_id', null, {})).toBeNull();
    const d = a.divergenza('inventory', 'udc_id', null, { udc_id: '012345670000000015' });
    expect(d.documento).toBe('012345670000000015');
    expect(d.colonna).toBeNull();
  });

  it('la stringa vuota NON è assente: è un valore, e la colonna deve portarlo', () => {
    expect(a.attesa('inventory', 'udc_id', { udc_id: '' })).toBe('');
    expect(a.divergenza('inventory', 'udc_id', '', { udc_id: '' })).toBeNull();
  });
});
