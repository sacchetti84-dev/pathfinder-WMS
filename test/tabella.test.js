import { describe, it, expect } from 'vitest';
import {
  ordina, filtra, componi, alClic, segno, confronta, eVuoto, STATO_VUOTO,
} from '../src/modules/tabella';

const COLONNE = [
  { campo: 'code', titolo: 'Articolo' },
  { campo: 'qty', titolo: 'Colli', tipo: 'numero' },
  { campo: 'exp', titolo: 'Scadenza', tipo: 'data' },
  { campo: 'azioni', titolo: '', ordinabile: false, cercabile: false },
];

const R = [
  { code: 'B9', qty: 9, exp: '2026-03-01', azioni: 'x' },
  { code: 'A10', qty: 10, exp: '', azioni: 'x' },
  { code: 'A2', qty: 2, exp: '01/02/2026', azioni: 'x' },
  { code: 'C1', qty: null, exp: '2025-12-31', azioni: 'x' },
];

const st = (campo, verso = 'asc', cerca = '') => ({ campo, verso, cerca });

describe('ordinare', () => {
  it('SENZA COLONNA SCELTA l’elenco esce com’era', () => {
    /* L'ordine di partenza di una tabella è una decisione di chi l'ha
       costruita: quasi sempre è quello cronologico. */
    expect(ordina(R, COLONNE, STATO_VUOTO).map(r => r.code)).toEqual(['B9', 'A10', 'A2', 'C1']);
    expect(ordina(R, COLONNE, null).map(r => r.code)).toEqual(['B9', 'A10', 'A2', 'C1']);
  });

  it('I NUMERI SI CONFRONTANO DA NUMERI: 9 prima di 10, non dopo', () => {
    expect(ordina(R, COLONNE, st('qty')).map(r => r.qty)).toEqual([2, 9, 10, null]);
  });

  it('e anche nel testo, dove un numero c’è: A2 prima di A10', () => {
    expect(ordina(R, COLONNE, st('code')).map(r => r.code)).toEqual(['A2', 'A10', 'B9', 'C1']);
  });

  it('IL VUOTO VA IN FONDO NEI DUE VERSI, perché assente non è «molto vecchio»', () => {
    const su = ordina(R, COLONNE, st('exp', 'asc')).map(r => r.code);
    const giu = ordina(R, COLONNE, st('exp', 'desc')).map(r => r.code);
    expect(su[su.length - 1]).toBe('A10');
    expect(giu[giu.length - 1]).toBe('A10');
  });

  it('le date si leggono in tutti e due i formati che l’applicativo usa', () => {
    expect(ordina(R, COLONNE, st('exp')).map(r => r.code)).toEqual(['C1', 'A2', 'B9', 'A10']);
  });

  it('una colonna non ordinabile non ordina niente', () => {
    expect(ordina(R, COLONNE, st('azioni')).map(r => r.code)).toEqual(R.map(r => r.code));
  });

  it('e una colonna che non esiste nemmeno', () => {
    expect(ordina(R, COLONNE, st('inventata')).map(r => r.code)).toEqual(R.map(r => r.code));
  });

  it('L’ORDINAMENTO È STABILE: i pari restano nell’ordine di partenza', () => {
    const righe = [
      { code: 'primo', stato: 'done' }, { code: 'secondo', stato: 'done' },
      { code: 'terzo', stato: 'aperto' }, { code: 'quarto', stato: 'done' },
    ];
    const col = [{ campo: 'stato', titolo: 'Stato' }];
    expect(ordina(righe, col, st('stato')).map(r => r.code))
      .toEqual(['terzo', 'primo', 'secondo', 'quarto']);
  });

  it('non tocca l’array che riceve', () => {
    const copia = R.map(r => r.code);
    ordina(R, COLONNE, st('qty'));
    expect(R.map(r => r.code)).toEqual(copia);
  });

  it('lo zero NON è un vuoto: è una risposta', () => {
    expect(eVuoto(0)).toBe(false);
    expect(eVuoto(false)).toBe(false);
    expect(eVuoto('')).toBe(true);
    expect(eVuoto('  ')).toBe(true);
    expect(eVuoto(null)).toBe(true);
    expect(eVuoto(undefined)).toBe(true);
  });

  it('un valore si può calcolare invece che leggere', () => {
    const col = [{ campo: 'tot', titolo: 'Totale', tipo: 'numero', valore: (r) => r.a + r.b }];
    const righe = [{ a: 5, b: 5 }, { a: 1, b: 1 }];
    expect(ordina(righe, col, st('tot')).map(r => r.a)).toEqual([1, 5]);
  });
});

describe('filtrare', () => {
  it('senza testo non filtra niente', () => {
    expect(filtra(R, COLONNE, '')).toHaveLength(4);
    expect(filtra(R, COLONNE, null)).toHaveLength(4);
  });

  it('LE PAROLE SI CERCANO TUTTE, in qualunque colonna e in qualunque ordine', () => {
    /* Chi cerca non sa in quale colonna sta cosa, e non deve saperlo. */
    const righe = [
      { code: '6001055', lot: 'GLUC0708', desc: 'Manganese solfato' },
      { code: '7001099', lot: 'ALTRO', desc: 'Glucosio' },
    ];
    const col = [{ campo: 'code', titolo: 'C' }, { campo: 'lot', titolo: 'L' }, { campo: 'desc', titolo: 'D' }];
    expect(filtra(righe, col, '6001 gluc').map(r => r.code)).toEqual(['6001055']);
    expect(filtra(righe, col, 'gluc 6001').map(r => r.code)).toEqual(['6001055']);
  });

  it('non guarda le colonne dichiarate non cercabili', () => {
    expect(filtra(R, COLONNE, 'x')).toHaveLength(0);
  });

  it('e non distingue maiuscole da minuscole', () => {
    expect(filtra(R, COLONNE, 'a10')).toHaveLength(1);
    expect(filtra(R, COLONNE, 'A10')).toHaveLength(1);
  });
});

describe('componi — si filtra e POI si ordina', () => {
  it('restituisce le righe che restano, nell’ordine chiesto', () => {
    const out = componi(R, COLONNE, st('qty', 'asc', 'a'));
    expect(out.map(r => r.code)).toEqual(['A2', 'A10']);
  });
});

describe('il clic sull’intestazione', () => {
  it('primo crescente, secondo decrescente, TERZO torna all’ordine di partenza', () => {
    /* Su un registro l'ordine di partenza è quello cronologico, cioè
       l'unico che racconta come sono andate le cose: dev'essere
       raggiungibile senza ricaricare la pagina. */
    let s = STATO_VUOTO;
    s = alClic(s, 'qty'); expect(s).toMatchObject({ campo: 'qty', verso: 'asc' });
    s = alClic(s, 'qty'); expect(s).toMatchObject({ campo: 'qty', verso: 'desc' });
    s = alClic(s, 'qty'); expect(s.campo).toBe(null);
  });

  it('cambiando colonna si riparte da crescente', () => {
    const s = alClic({ campo: 'qty', verso: 'desc', cerca: '' }, 'code');
    expect(s).toMatchObject({ campo: 'code', verso: 'asc' });
  });

  it('e il testo cercato non si perde per strada', () => {
    expect(alClic({ campo: null, verso: 'asc', cerca: 'gluc' }, 'code').cerca).toBe('gluc');
  });

  it('il segno si scrive solo sulla colonna che ordina adesso', () => {
    expect(segno({ campo: 'qty', verso: 'asc', cerca: '' }, 'qty')).toBe(' ▲');
    expect(segno({ campo: 'qty', verso: 'desc', cerca: '' }, 'qty')).toBe(' ▼');
    expect(segno({ campo: 'qty', verso: 'asc', cerca: '' }, 'code')).toBe('');
    expect(segno(null, 'code')).toBe('');
  });
});

describe('confronta, da solo', () => {
  it('restituisce 0 sui pari: la stabilità la garantisce sort', () => {
    const col = { campo: 'a', titolo: 'A' };
    expect(confronta({ a: 'x' }, { a: 'x' }, col, 'asc')).toBe(0);
  });

  it('e un numero che numero non è finisce in fondo', () => {
    const col = { campo: 'a', titolo: 'A', tipo: 'numero' };
    expect(confronta({ a: 'due' }, { a: 2 }, col, 'asc')).toBe(1);
    expect(confronta({ a: 'due' }, { a: 2 }, col, 'desc')).toBe(1);
  });
});
