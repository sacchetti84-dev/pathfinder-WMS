/* LE UM NEGLI EXPORT — 2.0.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 2.0 il foglio delle giacenze dava una riga per lotto e una
   colonna «Coll.» col conto, e delle UM non diceva niente: su un magazzino
   dove lo stesso codice arriva in colli da 5 kg e la volta dopo da 25, quel
   conto non è la merce. Adesso ogni collo ha la sua riga.

   Qui si collauda la parte che si può collaudare da fermo — la somma delle
   UM e la distesa dei colli — perché il resto è SheetJS, che scrive quello
   che gli si dà. Le due domande:
     · un riepilogo che vede KG e PZ insieme, che numero scrive?
     · una riga senza elenco dei colli, quante righe fa? */

import { describe, it, expect } from 'vitest';
import {
  nuovaSomma, accumula, celleUom, colliDaStendere,
  distendiGiacenze, RIGHE_MAX_FOGLIO,
} from '../src/modules/fogli';

describe('la somma delle UM', () => {
  it('una sola unità: il totale vale, con la sua etichetta', () => {
    const s = nuovaSomma();
    accumula(s, 'KG', 10900);
    accumula(s, 'KG', 100);
    expect(celleUom(s)).toEqual([11000, 'KG']);
  });

  /* 300 KG più 40 PZ non fanno 340 di niente: il totale sparisce e la riga
     lo dichiara. È l'unica cosa onesta che un riepilogo possa scrivere. */
  it('unità diverse: MISTA, e il totale resta vuoto', () => {
    const s = nuovaSomma();
    accumula(s, 'KG', 300);
    accumula(s, 'PZ', 40);
    expect(celleUom(s)).toEqual(['', 'MISTA']);
  });

  it('niente da sommare: due celle vuote, non uno zero', () => {
    expect(celleUom(nuovaSomma())).toEqual(['', '']);
  });

  /* Una riga senza unità — articolo mai configurato — non porta nemmeno
     l'unità degli altri: entrerebbe nel totale come se fosse della stessa
     merce. */
  it('la riga senza unità non entra nel totale', () => {
    const s = nuovaSomma();
    accumula(s, '', 999);
    accumula(s, 'KG', null);
    expect(celleUom(s)).toEqual(['', '']);
  });

  it('i decimali sono quelli dell\'unità, non quelli della somma', () => {
    const s = nuovaSomma();
    accumula(s, 'KG', 0.1);
    accumula(s, 'KG', 0.2);
    expect(celleUom(s)).toEqual([0.3, 'KG']);
  });
});

describe('un collo, una riga', () => {
  it('l\'elenco dichiarato diventa una riga per collo', () => {
    expect(colliDaStendere([1000, 1000, 900], 3)).toEqual([1000, 1000, 900]);
  });

  /* Senza elenco le righe restano quante sono i colli: il foglio le conta, e
     il conto dei colli torna anche dove le UM non ci sono. */
  it('senza elenco: tante righe quanti i colli, e le UM vuote', () => {
    expect(colliDaStendere(null, 5)).toEqual([null, null, null, null, null]);
  });

  it('una riga senza quantità esce lo stesso, una volta sola', () => {
    expect(colliDaStendere(null, 0)).toHaveLength(1);
    expect(colliDaStendere(undefined, undefined)).toHaveLength(1);
  });
});

/* 2.1 — «TOO MANY PROPERTIES TO ENUMERATE», E IL MAGAZZINO CHE NON SI
   ESPORTA PIU'.

   Segnalato da Andrea il 20/08. Dalla 2.0 il foglio da' UNA RIGA PER COLLO,
   e da quel giorno un `qty` sbagliato ha smesso di essere una cella storta
   ed e' diventato un'allocazione. In produzione una giacenza portava come
   quantita' il proprio codice articolo — `3501794#CL260313` in
   `M03-STK-01-02-T`, qty 3.501.794 — e `new Array(qty)` chiedeva tre
   milioni e mezzo di righe: SheetJS tiene un foglio come un oggetto con una
   chiave per cella, e V8 si ferma con quel messaggio.

   IL LIMITE NON E' UN'OPINIONE SUL MAGAZZINO: e' il foglio di Excel, che
   tiene 1.048.576 righe. Un primo giro aveva messo un tetto a diecimila
   colli per riga, e Andrea l'ha respinto — nei semilavorati i numeri grossi
   ci stanno. Le righe pero' si stendono per COLLO, e i pezzi vivono in una
   cella sola: tre milioni di pezzi in dieci colli restano dieci righe. */
describe('una riga che non sta in un foglio non fa fuori il foglio', () => {
  it('IL CODICE ARTICOLO FINITO NELLA QUANTITA non stende tre milioni di righe', () => {
    expect(colliDaStendere(null, 3501794)).toBe(null);
  });

  /* NESSUN TETTO SULLA MERCE: il muro e' quello di Excel, e sotto ci si
     passa. Un semilavorato con centomila colli esce disteso. */
  it('centomila colli passano: il tetto non e sul magazzino', () => {
    expect(colliDaStendere(null, 100_000)).toHaveLength(100_000);
  });

  it('appena sopra il foglio no, appena sotto si', () => {
    expect(colliDaStendere(null, RIGHE_MAX_FOGLIO + 1)).toBe(null);
    expect(colliDaStendere(null, RIGHE_MAX_FOGLIO)).toHaveLength(RIGHE_MAX_FOGLIO);
  });

  it('le quantita vere del magazzino passano tutte', () => {
    for (const q of [1, 5, 69, 100, 158]) {
      expect(colliDaStendere(null, q), String(q)).toHaveLength(q);
    }
  });
});

/* IL CONTO E' DI TUTTE LE RIGHE INSIEME, e non di una: duecento righe da
   diecimila colli sono due milioni di righe, ognuna innocente e il foglio
   morto lo stesso — a contare le chiavi e' il foglio intero. */
describe('distendiGiacenze — il foglio si riempie finche ci sta', () => {
  const g = (qty, colli = null) => ({ qty, colli });
  const leggi = (r) => r;

  it('finche ci stanno, si stendono tutte', () => {
    const out = distendiGiacenze([g(3), g(2), g(1)], leggi, 10);
    expect(out.map((m) => m && m.length)).toEqual([3, 2, 1]);
  });

  it('quel che sfonda il foglio esce condensato', () => {
    const out = distendiGiacenze([g(6), g(6)], leggi, 10);
    expect(out[0]).toHaveLength(6);
    expect(out[1]).toBe(null);
  });

  /* Una riga che da sola sfonda il foglio NON consuma il budget: sarebbe una
     condanna per tutte quelle dopo, e quella riga e' un numero sbagliato,
     non merce. E' il caso vero del 20/08 — una riga marcia in mezzo a 195
     sane, e le 195 devono uscire. */
  it('LA RIGA MARCIA NON PORTA GIU LE ALTRE', () => {
    const out = distendiGiacenze([g(2), g(3501794), g(3)], leggi, 10);
    expect(out[0]).toHaveLength(2);
    expect(out[1]).toBe(null);
    expect(out[2]).toHaveLength(3);
  });

  /* L'elenco dichiarato conta per quanto e' lungo: quelle misure qualcuno le
     ha contate una per una, e non si guarda `qty`. */
  it('un elenco dichiarato conta per la sua lunghezza, non per qty', () => {
    const out = distendiGiacenze([g(999, [20, 20, 5])], leggi, 10);
    expect(out[0]).toEqual([20, 20, 5]);
  });

  it('una lista vuota non fa niente', () => {
    expect(distendiGiacenze([], leggi)).toEqual([]);
  });
});
