import { describe, it, expect } from 'vitest';
import { Store } from '../src/core/store.js';
import { primoFEFO, eFEFO, cercaGiacenze } from '../src/core/giacenza';

const lotto = (lot_code, expiry_date, placed_at = 0) =>
  ({ lot_code, expiry_date, placed_at, article_code: 'ART-1' });

const codici = (items) => Store.sortByFEFO(items).map(i => i.lot_code);

describe('FEFO', () => {
  it('mette davanti la scadenza più vicina', () => {
    expect(codici([
      lotto('C', '2027-01-10'),
      lotto('A', '2026-03-01'),
      lotto('B', '2026-11-30'),
    ])).toEqual(['A', 'B', 'C']);
  });

  it('confronta le date come stringhe ISO, quindi anche a cavallo d’anno', () => {
    expect(codici([
      lotto('DOPO', '2027-01-02'),
      lotto('PRIMA', '2026-12-31'),
    ])).toEqual(['PRIMA', 'DOPO']);
  });

  it('i lotti senza scadenza vanno in coda — con l’elenco in un ordine', () => {
    expect(codici([
      lotto('SENZA', ''),
      lotto('CON', '2030-01-01'),
    ])).toEqual(['CON', 'SENZA']);
  });

  it('i lotti senza scadenza vanno in coda — e con l’elenco nell’altro', () => {
    expect(codici([
      lotto('CON', '2030-01-01'),
      lotto('SENZA', ''),
    ])).toEqual(['CON', 'SENZA']);
  });

  it('fra due lotti senza scadenza vince il più vecchio in magazzino (FIFO)', () => {
    expect(codici([
      lotto('NUOVO', null, 2000),
      lotto('VECCHIO', null, 1000),
    ])).toEqual(['VECCHIO', 'NUOVO']);
  });

  it('a parità di scadenza esce prima quello posizionato prima', () => {
    expect(codici([
      lotto('B', '2026-06-01', 2000),
      lotto('A', '2026-06-01', 1000),
    ])).toEqual(['A', 'B']);
  });

  it('una scadenza fatta di spazi vale come assente', () => {
    expect(codici([
      lotto('VUOTA', '   '),
      lotto('VERA', '2029-01-01'),
    ])).toEqual(['VERA', 'VUOTA']);
  });

  it('non riordina l’elenco che riceve', () => {
    const originale = [lotto('C', '2027-01-01'), lotto('A', '2026-01-01')];
    const prima = originale.map(i => i.lot_code);
    Store.sortByFEFO(originale);
    expect(originale.map(i => i.lot_code)).toEqual(prima);
  });

  it('regge elenco vuoto, elenco da uno, e assenza di elenco', () => {
    expect(Store.sortByFEFO([])).toEqual([]);
    expect(Store.sortByFEFO(null)).toEqual([]);
    expect(codici([lotto('SOLO', '2026-01-01')])).toEqual(['SOLO']);
  });
});

/* 1.4.0 — Il consiglio che l'operatore vede davvero. `sortByFEFO` ordina un
   elenco; queste tre decidono COSA viene evidenziato davanti allo scaffale, e
   non avevano prove. */

const riga = (o) => ({
  _id: o._id, location_code: o.loc || 'DP-A-01', article_code: o.art || 'ART-1',
  lot_code: o.lot, item_key: `${o.art || 'ART-1'}|${o.lot}`,
  expiry_date: o.exp || '', placed_at: o.at || 0,
  article_description: o.desc || '',
});

describe('il lotto consigliato', () => {
  const magazzino = [
    riga({ _id: 1, lot: 'VECCHIO', exp: '2026-01-01' }),
    riga({ _id: 2, lot: 'NUOVO', exp: '2027-01-01' }),
    riga({ _id: 3, lot: 'ALTRO', art: 'ART-2', exp: '2025-01-01' }),
  ];

  it('è quello che scade prima, fra i lotti di QUELL\'articolo', () => {
    expect(primoFEFO(magazzino, 'ART-1').lot_code).toBe('VECCHIO');
    /* ART-2 scade prima di tutti, ma non c'entra: il consiglio è per articolo. */
    expect(primoFEFO(magazzino, 'ART-2').lot_code).toBe('ALTRO');
  });

  it('è null se di quell\'articolo non c\'è niente a magazzino', () => {
    expect(primoFEFO(magazzino, 'MAI-VISTO')).toBeNull();
    expect(primoFEFO([], 'ART-1')).toBeNull();
  });

  it('riconosce la riga consigliata e scarta le altre', () => {
    expect(eFEFO(magazzino, magazzino[0])).toBe(true);
    expect(eFEFO(magazzino, magazzino[1])).toBe(false);
    expect(eFEFO(magazzino, null)).toBe(false);
    expect(eFEFO(magazzino, riga({ _id: 9, lot: 'FANTASMA', art: 'MAI-VISTO' }))).toBe(false);
  });

  /* Una riga ricostruita da un documento non porta l'_id della cache: a
     identificarla restano ubicazione e articolo/lotto. Senza questa strada il
     consiglio sparirebbe proprio nelle schermate che rileggono un documento. */
  it('riconosce anche una riga senza _id, per ubicazione e articolo/lotto', () => {
    const senzaId = { location_code: 'DP-A-01', article_code: 'ART-1', lot_code: 'VECCHIO', item_key: 'ART-1|VECCHIO' };
    expect(eFEFO(magazzino, senzaId)).toBe(true);
  });

  it('la stessa merce in un\'altra ubicazione non è la riga consigliata', () => {
    const altrove = { location_code: 'DP-Z-99', article_code: 'ART-1', lot_code: 'VECCHIO', item_key: 'ART-1|VECCHIO' };
    expect(eFEFO(magazzino, altrove)).toBe(false);
  });
});

describe('ricerca della merce', () => {
  const magazzino = [
    riga({ _id: 1, lot: 'L1', art: '700123', loc: 'DP-A-01-01-T', desc: 'Farina di riso' }),
    riga({ _id: 2, lot: 'L2', art: '700124', loc: 'DP-B-02-03-1', desc: 'Zucchero di canna' }),
  ];
  const indice = new Map([['700123|L1', [magazzino[0]]]]);

  it('cerca per pezzi di codice, lotto, descrizione e ubicazione', () => {
    expect(cercaGiacenze(magazzino, indice, '70012').map(r => r._id)).toEqual([1, 2]);
    expect(cercaGiacenze(magazzino, indice, 'canna').map(r => r._id)).toEqual([2]);
    expect(cercaGiacenze(magazzino, indice, 'DP-B').map(r => r._id)).toEqual([2]);
    expect(cercaGiacenze(magazzino, indice, 'l2').map(r => r._id)).toEqual([2]);
  });

  /* La scansione col lettore produce un item_key esatto: è il caso più
     frequente, e passa dall'indice invece che da undicimila righe. */
  it('una chiave esatta passa dall\'indice, in maiuscolo', () => {
    expect(cercaGiacenze(magazzino, indice, '700123|l1').map(r => r._id)).toEqual([1]);
  });

  it('non restituisce l\'array dell\'indice, ma una copia', () => {
    const trovati = cercaGiacenze(magazzino, indice, '700123|L1');
    trovati.push('sporcizia');
    expect(indice.get('700123|L1')).toHaveLength(1);
  });

  it('query vuota non è «tutto»: è niente', () => {
    expect(cercaGiacenze(magazzino, indice, '')).toEqual([]);
    expect(cercaGiacenze(magazzino, indice, null)).toEqual([]);
  });

  it('ciò che non c\'è dà elenco vuoto, non un errore', () => {
    expect(cercaGiacenze(magazzino, indice, 'zzz')).toEqual([]);
  });
});
