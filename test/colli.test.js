import { describe, it, expect } from 'vitest';
import {
  espandi, leggiColli, validaDichiarazione,
  totaleColli, totaleUom, raggruppa, descriviColli,
  daSuddivisione, preleva, uscite, scelteDaMisure, scelteDaUscite, rettifica, verificaColli,
  scelteDaTaglie, riempiFabbisogno, preselezioneDaUscite,
} from '../src/modules/colli';

/* ── La dichiarazione: 10 x 1.000 + 1 x 900 ─────────────────────────── */

describe('espandi', () => {
  it('la dichiarazione del piano diventa un collo per voce', () => {
    const e = espandi([{ colli: 10, per: 1000 }, { colli: 1, per: 900 }], 'PZ');
    expect(e).toHaveLength(11);
    expect(totaleUom(e, 'PZ')).toBe(10900);
  });

  it('PIU\' COLLI INCOMPLETI SONO AMMESSI — e\' la 1.8 in una riga', () => {
    const e = espandi([{ colli: 5, per: 1000 }, { colli: 1, per: 400 }, { colli: 1, per: 250 }], 'PZ');
    expect(e).toHaveLength(7);
    expect(totaleUom(e, 'PZ')).toBe(5650);
  });

  it('lo stesso articolo puo\' arrivare in colli da 5 e da 25 kg', () => {
    const e = espandi([{ colli: 3, per: 25 }, { colli: 2, per: 5 }], 'KG');
    expect(e).toEqual([25, 25, 25, 5, 5]);
    expect(totaleUom(e, 'KG')).toBe(85);
  });

  it('una riga vuota di maschera non e\' un errore: si salta', () => {
    expect(espandi([{ colli: 2, per: 100 }, { colli: '', per: '' }], 'PZ')).toEqual([100, 100]);
    expect(espandi([{ colli: 0, per: 100 }, { colli: 1, per: 50 }], 'PZ')).toEqual([50]);
  });

  it('una riga con i colli e senza la quantita\' non si indovina', () => {
    expect(espandi([{ colli: 3, per: '' }], 'PZ')).toBe(null);
    expect(espandi([{ colli: 3, per: 0 }], 'PZ')).toBe(null);
    expect(espandi([{ colli: 3, per: -10 }], 'PZ')).toBe(null);
  });

  it('i colli sono un numero intero: mezzo collo non esiste', () => {
    expect(espandi([{ colli: 2.5, per: 100 }], 'PZ')).toBe(null);
  });

  it('la precisione la decide l\'unita\', e i pezzi non hanno decimali', () => {
    expect(espandi([{ colli: 1, per: 1000.5 }], 'PZ')).toBe(null);
    expect(espandi([{ colli: 1, per: 10.125 }], 'KG')).toEqual([10.125]);
    expect(espandi([{ colli: 1, per: '10,125' }], 'KG')).toEqual([10.125]);
  });

  it('niente da espandere e\' un\'assenza, non un elenco vuoto', () => {
    expect(espandi([], 'PZ')).toBe(null);
    expect(espandi(null, 'PZ')).toBe(null);
    expect(espandi([{ colli: 0, per: 0 }], 'PZ')).toBe(null);
  });
});

/* ── Gli errori in chiaro, tutti insieme ────────────────────────────── */

describe('validaDichiarazione', () => {
  it('una dichiarazione buona non ha niente da dire', () => {
    expect(validaDichiarazione([{ colli: 10, per: 1000 }, { colli: 1, per: 900 }], 'PZ')).toEqual([]);
  });

  it('dice tutto cio\' che manca, non solo il primo', () => {
    const err = validaDichiarazione([{ colli: 3, per: '' }, { colli: 2.5, per: 100 }], 'PZ');
    expect(err).toHaveLength(2);
    expect(err[0]).toMatch(/riga 1/i);
    expect(err[1]).toMatch(/riga 2/i);
  });

  it('una dichiarazione vuota lo dice a parole', () => {
    expect(validaDichiarazione([], 'PZ')).toHaveLength(1);
    expect(validaDichiarazione([{ colli: '', per: '' }], 'PZ')).toHaveLength(1);
  });

  it('il decimale su un\'unita\' che conta oggetti si nomina', () => {
    const err = validaDichiarazione([{ colli: 1, per: 10.5 }], 'PZ');
    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(/intero/i);
  });
});

/* ── Leggere un elenco gia' scritto ─────────────────────────────────── */

describe('leggiColli', () => {
  it('l\'elenco del database torna com\'e\', alla precisione dell\'unita\'', () => {
    expect(leggiColli([25, 25, 5], 'KG')).toEqual([25, 25, 5]);
    expect(leggiColli([10.1249, 5], 'KG')).toEqual([10.125, 5]);
  });

  it('la virgola decimale italiana e\' un dato, non un errore', () => {
    expect(leggiColli(['10,5', '4'], 'KG')).toEqual([10.5, 4]);
  });

  it('un elemento che numero non e\' invalida l\'elenco intero', () => {
    expect(leggiColli([100, 'boh'], 'PZ')).toBe(null);
    expect(leggiColli([100, null], 'PZ')).toBe(null);
    expect(leggiColli([100, 0], 'PZ')).toBe(null);
    expect(leggiColli([100, -5], 'PZ')).toBe(null);
  });

  it('l\'assenza e\' assenza: una riga senza elenco si comporta come nella 1.7', () => {
    expect(leggiColli(undefined, 'PZ')).toBe(null);
    expect(leggiColli([], 'PZ')).toBe(null);
    expect(leggiColli('11', 'PZ')).toBe(null);
  });
});

/* ── I due totali, che sono le colonne materializzate ───────────────── */

describe('totali', () => {
  it('i colli sono quanti sono, non quanti se ne calcolano', () => {
    expect(totaleColli([1000, 1000, 900])).toBe(3);
    expect(totaleColli(null)).toBe(0);
  });

  it('il totale in UM somma alla precisione dell\'unita\'', () => {
    expect(totaleUom([0.1, 0.2], 'KG')).toBe(0.3);
    expect(totaleUom([1000, 1000, 900], 'PZ')).toBe(2900);
    expect(totaleUom(null, 'PZ')).toBe(0);
  });
});

/* ── Come si legge ──────────────────────────────────────────────────── */

describe('raggruppa e descrivi', () => {
  it('raggruppa i colli uguali e mette i pieni davanti', () => {
    expect(raggruppa([900, 1000, 1000, 1000], 'PZ')).toEqual([
      { colli: 3, per: 1000 }, { colli: 1, per: 900 },
    ]);
  });

  it('descrive la riga come la legge chi ce l\'ha davanti', () => {
    expect(descriviColli([1000, 1000, 900], 'PZ')).toBe('2 × 1.000 + 1 × 900 PZ');
    expect(descriviColli([25, 25, 5, 5], 'KG')).toBe('2 × 25 + 2 × 5 KG');
  });

  it('due incompleti diversi restano due voci', () => {
    expect(descriviColli([1000, 400, 250], 'PZ')).toBe('1 × 1.000 + 1 × 400 + 1 × 250 PZ');
  });

  it('niente colli, niente descrizione', () => {
    expect(descriviColli([], 'PZ')).toBe('—');
    expect(descriviColli(null, 'PZ')).toBe('—');
  });
});

/* ── Il ponte con la 1.7 ────────────────────────────────────────────── */

describe('daSuddivisione', () => {
  it('una riga della 1.7 si legge come colli pieni piu\' il resto', () => {
    expect(daSuddivisione(10100, 1000, 'PZ')).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 100]);
  });

  it('una divisione tonda non inventa un collo incompleto', () => {
    expect(daSuddivisione(3000, 1000, 'PZ')).toEqual([1000, 1000, 1000]);
  });

  it('la deriva del virgola mobile non fa sparire un collo pieno', () => {
    expect(daSuddivisione(0.3, 0.1, 'KG')).toEqual([0.1, 0.1, 0.1]);
  });

  it('senza quantita\' per collo non c\'e\' niente da dividere', () => {
    expect(daSuddivisione(10100, null, 'PZ')).toBe(null);
    expect(daSuddivisione(10100, 0, 'PZ')).toBe(null);
    expect(daSuddivisione(null, 1000, 'PZ')).toBe(null);
    expect(daSuddivisione(0, 1000, 'PZ')).toBe(null);
  });
});

/* ── Il prelievo: quali colli, e quanti ─────────────────────────────── */

describe('preleva', () => {
  const riga = () => [1000, 1000, 900];

  it('escono i colli scelti, e restano gli altri', () => {
    const r = preleva(riga(), [{ indice: 2 }], 'PZ');
    expect(r.usciti).toEqual([900]);
    expect(r.rimasti).toEqual([1000, 1000]);
    expect(r.uom).toBe(900);
  });

  it('piu\' colli in un gesto solo', () => {
    const r = preleva(riga(), [{ indice: 0 }, { indice: 2 }], 'PZ');
    expect(r.usciti).toEqual([1000, 900]);
    expect(r.rimasti).toEqual([1000]);
    expect(r.uom).toBe(1900);
  });

  it('IL PARZIALE APRE UN COLLO: quello che resta e\' un incompleto in piu\'', () => {
    const r = preleva(riga(), [{ indice: 0, quantita: 300 }], 'PZ');
    expect(r.usciti).toEqual([300]);
    expect(r.rimasti).toEqual([700, 1000, 900]);
    expect(r.uom).toBe(300);
  });

  it('un parziale che svuota il collo lo fa uscire, non lascia uno zero', () => {
    const r = preleva(riga(), [{ indice: 2, quantita: 900 }], 'PZ');
    expect(r.rimasti).toEqual([1000, 1000]);
  });

  it('cio\' che esce piu\' cio\' che resta e\' cio\' che c\'era', () => {
    const r = preleva(riga(), [{ indice: 1, quantita: 250 }, { indice: 2 }], 'PZ');
    expect(totaleUom(r.rimasti, 'PZ') + r.uom).toBe(2900);
  });

  it('il prelievo totale svuota la riga', () => {
    const r = preleva(riga(), [{ indice: 0 }, { indice: 1 }, { indice: 2 }], 'PZ');
    expect(r.rimasti).toEqual([]);
    expect(r.uom).toBe(2900);
  });

  it('un collo che non c\'e\' e\' un errore in faccia, non uno zero', () => {
    expect(() => preleva(riga(), [{ indice: 3 }], 'PZ')).toThrow();
    expect(() => preleva(riga(), [{ indice: -1 }], 'PZ')).toThrow();
  });

  it('lo stesso collo due volte e\' merce contata due volte', () => {
    expect(() => preleva(riga(), [{ indice: 0 }, { indice: 0 }], 'PZ')).toThrow();
  });

  it('da un collo non esce piu\' di quanto ci sta dentro', () => {
    expect(() => preleva(riga(), [{ indice: 2, quantita: 901 }], 'PZ')).toThrow();
    expect(() => preleva(riga(), [{ indice: 0, quantita: 0 }], 'PZ')).toThrow();
  });

  it('senza scelte non si muove niente', () => {
    expect(() => preleva(riga(), [], 'PZ')).toThrow();
  });
});

/* ── Ciò che si dice al servizio ────────────────────────────────────── */

describe('uscite', () => {
  const riga = () => [25, 25, 10];

  it('ogni uscita porta DA QUALE COLLO esce, non solo quanto', () => {
    expect(uscite(riga(), [{ indice: 0, quantita: 10 }], 'KG')).toEqual([{ da: 25, quantita: 10 }]);
  });

  it('IL COLLO SBAGLIATO: 10 preso da un 25 non e\' il collo da 10', () => {
    const u = uscite(riga(), [{ indice: 0, quantita: 10 }], 'KG');
    expect(u[0].da).toBe(25);
    expect(uscite(riga(), [{ indice: 2 }], 'KG')).toEqual([{ da: 10, quantita: 10 }]);
  });

  it('un collo intero dichiara la propria misura come quantita\'', () => {
    expect(uscite(riga(), [{ indice: 1 }], 'KG')).toEqual([{ da: 25, quantita: 25 }]);
  });

  it('piu\' scelte restano nell\'ordine in cui si sono fatte', () => {
    expect(uscite(riga(), [{ indice: 2 }, { indice: 0, quantita: 5 }], 'KG'))
      .toEqual([{ da: 10, quantita: 10 }, { da: 25, quantita: 5 }]);
  });

  it('cio\' che `preleva` rifiuta non arriva al servizio', () => {
    expect(() => uscite(riga(), [{ indice: 9 }], 'KG')).toThrow();
    expect(() => uscite(riga(), [{ indice: 0, quantita: 30 }], 'KG')).toThrow();
    expect(() => uscite(riga(), [], 'KG')).toThrow();
  });
});

/* ── Ritrovare i colli che erano usciti ─────────────────────────────── */

describe('scelteDaMisure', () => {
  it('lo storno ritrova i colli entrati e li sceglie per misura', () => {
    expect(scelteDaMisure([25, 25, 10, 7], [25, 7], 'KG')).toEqual([{ indice: 0 }, { indice: 3 }]);
  });

  it('due colli della stessa misura sono due scelte diverse', () => {
    expect(scelteDaMisure([25, 25, 10], [25, 25], 'KG')).toEqual([{ indice: 0 }, { indice: 1 }]);
  });

  it('un collo che non c\'e\' piu\' ferma lo storno invece di prenderne un altro', () => {
    expect(() => scelteDaMisure([25, 25], [25, 7], 'KG')).toThrow();
    expect(() => scelteDaMisure([25], [25, 25], 'KG')).toThrow();
  });

  it('senza elenco o senza misure non c\'e\' niente da ritrovare', () => {
    expect(scelteDaMisure(null, [25], 'KG')).toBe(null);
    expect(scelteDaMisure([25], null, 'KG')).toBe(null);
  });
});

/* ── La verifica, che mostra e non corregge ─────────────────────────── */

describe('verificaColli', () => {
  it('le due colonne materializzate contro l\'elenco', () => {
    const v = verificaColli(3, 2900, [1000, 1000, 900], 'PZ');
    expect(v).toMatchObject({ ok: true, scarto: 0, scartoUom: 0, colliAttesi: 3, uomAtteso: 2900 });
  });

  it('lo scarto si mostra, con il segno di chi ne ha di meno', () => {
    const v = verificaColli(2, 2900, [1000, 1000, 900], 'PZ');
    expect(v.ok).toBe(false);
    expect(v.scarto).toBe(-1);
  });

  it('una verifica che non puo\' girare non accusa nessuno', () => {
    expect(verificaColli(3, 2900, null, 'PZ')).toBe(null);
    expect(verificaColli(3, 2900, [], 'PZ')).toBe(null);
  });
});

/* ── Le uscite messe da parte, e ritrovate dopo ──────────────────────── */

/* Il carrello del DDT sceglie i colli quando la riga entra, e la merce esce
   giorni dopo, all'evasione. Fra i due momenti gli indici non valgono piu' —
   un altro terminale puo' aver mosso la riga — e quel che si mette da parte
   sono le MISURE, come per il servizio. Qui si torna indietro. */
describe('scelteDaUscite', () => {
  it('i colli interi messi da parte si ritrovano per misura', () => {
    expect(scelteDaUscite([25, 25, 10, 7], [{ da: 25, quantita: 25 }, { da: 7, quantita: 7 }], 'KG'))
      .toEqual([{ indice: 0 }, { indice: 3 }]);
  });

  it('UN COLLO APERTO NON DIVENTA UN ALTRO COLLO: 10 preso da un 25 resta un 25 aperto', () => {
    /* La riga ha anche un collo da 10: prenderlo sarebbe il difetto del
       17/08 al contrario — saldo giusto, colli sbagliati. */
    expect(scelteDaUscite([25, 25, 10], [{ da: 25, quantita: 10 }], 'KG'))
      .toEqual([{ indice: 0, quantita: 10 }]);
  });

  it('due colli della stessa misura sono due scelte diverse', () => {
    expect(scelteDaUscite([25, 25, 10], [{ da: 25, quantita: 25 }, { da: 25, quantita: 5 }], 'KG'))
      .toEqual([{ indice: 0 }, { indice: 1, quantita: 5 }]);
  });

  it('una misura che non c\'e\' piu\' ferma l\'evasione invece di prenderne un\'altra', () => {
    expect(() => scelteDaUscite([25, 10], [{ da: 7, quantita: 7 }], 'KG')).toThrow();
    expect(() => scelteDaUscite([25], [{ da: 25, quantita: 25 }, { da: 25, quantita: 25 }], 'KG')).toThrow();
  });

  it('una quantita\' piu\' grande del collo non parte', () => {
    expect(() => scelteDaUscite([25, 10], [{ da: 10, quantita: 12 }], 'KG')).toThrow();
  });

  it('senza elenco o senza uscite non c\'e\' niente da ritrovare', () => {
    expect(scelteDaUscite(null, [{ da: 25, quantita: 25 }], 'KG')).toBe(null);
    expect(scelteDaUscite([25], null, 'KG')).toBe(null);
    expect(scelteDaUscite([25], [], 'KG')).toBe(null);
  });

  it('ANDATA E RITORNO: cio\' che `uscite` mette da parte, `scelteDaUscite` lo ritrova uguale', () => {
    const colli = [25, 25, 10, 7];
    const scelte = [{ indice: 0 }, { indice: 2, quantita: 4 }];
    const messe = uscite(colli, scelte, 'KG');
    expect(scelteDaUscite(colli, messe, 'KG')).toEqual(scelte);
  });

  it('la seconda riga del carrello vede la riga gia\' impegnata dalla prima', () => {
    /* Due righe di DDT sullo stesso lotto non possono prenotare lo stesso
       collo: la seconda sceglie su cio' che la prima ha lasciato. */
    const colli = [25, 25, 10];
    const prima = uscite(colli, [{ indice: 0, quantita: 7 }], 'KG');
    const restano = preleva(colli, scelteDaUscite(colli, prima, 'KG'), 'KG').rimasti;
    expect(restano).toEqual([18, 25, 10]);
  });
});

/* ── Da com'era a com'e': la rettifica d'inventario ──────────────────── */

/* Chi conta un vano non toglie e non aggiunge: guarda lo scaffale e dice
   com'e' fatto adesso. La differenza fra i due elenchi la calcola il
   sistema, e deve saperla dire come il registro la capisce — cosa e'
   uscito, cosa e' entrato. */
describe('rettifica', () => {
  it('due elenchi uguali non muovono niente', () => {
    const r = rettifica([25, 25, 10], [25, 10, 25], 'KG');
    expect(r).toEqual({ uscite: [], entrate: [] });
  });

  it('un collo che manca esce intero', () => {
    expect(rettifica([25, 25, 10], [25, 10], 'KG'))
      .toEqual({ uscite: [{ da: 25, quantita: 25 }], entrate: [] });
  });

  it('UN COLLO PIU\' LEGGERO NON E\' UN COLLO USCITO E UN ALTRO ENTRATO', () => {
    /* Il 25 che pesa 18 e' lo stesso collo con dentro 7 KG in meno: il
       registro deve leggere un\'uscita da 7, non un collo andato via e uno
       arrivato dal nulla. */
    expect(rettifica([25, 25, 10], [25, 18, 10], 'KG'))
      .toEqual({ uscite: [{ da: 25, quantita: 7 }], entrate: [] });
  });

  it('un collo trovato entra con la misura che ha', () => {
    expect(rettifica([25, 25], [25, 25, 10], 'KG'))
      .toEqual({ uscite: [], entrate: [10] });
  });

  it('manca e si trova insieme: due movimenti, non uno di comodo', () => {
    expect(rettifica([25, 25, 10], [25, 18, 10, 5], 'KG'))
      .toEqual({ uscite: [{ da: 25, quantita: 7 }], entrate: [5] });
  });

  it('il vano vuoto porta via tutto', () => {
    expect(rettifica([25, 10], [], 'KG'))
      .toEqual({ uscite: [{ da: 25, quantita: 25 }, { da: 10, quantita: 10 }], entrate: [] });
  });

  it('il collo calato si accoppia col piu\' piccolo che lo contiene', () => {
    /* 24 viene da un 25 sceso di uno, non da un 30 sceso di sei. */
    expect(rettifica([30, 25], [24], 'KG'))
      .toEqual({ uscite: [{ da: 25, quantita: 1 }, { da: 30, quantita: 30 }], entrate: [] });
  });

  it('un collo piu\' grande di tutti quelli di prima e\' entrato, non calato', () => {
    expect(rettifica([10], [25], 'KG'))
      .toEqual({ uscite: [{ da: 10, quantita: 10 }], entrate: [25] });
  });

  it('senza l\'elenco di prima non c\'e\' niente da rettificare', () => {
    expect(rettifica(null, [25], 'KG')).toBe(null);
  });

  it('i decimali non derivano: 5,5 meno 0,1 meno 0,2 resta esatto', () => {
    expect(rettifica([5.5], [5.2], 'KG'))
      .toEqual({ uscite: [{ da: 5.5, quantita: 0.3 }], entrate: [] });
  });
});

/* ── 2.2 — la scelta per taglia ─────────────────────────────────────── */

describe('scelteDaTaglie', () => {
  const elenco = [25, 25, 25, 10, 10, 5];

  it('dodici caselle diventano due numeri', () => {
    const s = scelteDaTaglie(elenco, [{ per: 25, colli: 2 }, { per: 10, colli: 1 }], 'KG');
    expect(s).toEqual([{ indice: 0 }, { indice: 1 }, { indice: 3 }]);
    expect(preleva(elenco, s, 'KG').uom).toBe(60);
  });

  it('prende i primi liberi di quella misura, non i primi dell elenco', () => {
    const s = scelteDaTaglie(elenco, [{ per: 5, colli: 1 }], 'KG');
    expect(s).toEqual([{ indice: 5 }]);
  });

  it('una misura che non ha abbastanza colli si rifiuta, e dice quanti ce ne sono', () => {
    expect(() => scelteDaTaglie(elenco, [{ per: 10, colli: 3 }], 'KG')).toThrow(/ce ne sono 2/);
  });

  it('il collo aperto esce dalla misura scelta, e non da un altra', () => {
    const s = scelteDaTaglie(elenco, [{ per: 25, colli: 1 }], 'KG', { per: 10, quantita: 4 });
    expect(s).toEqual([{ indice: 0 }, { indice: 3, quantita: 4 }]);
    expect(preleva(elenco, s, 'KG').uom).toBe(29);
  });

  it('il collo aperto non puo essere gia preso per intero', () => {
    expect(() => scelteDaTaglie(elenco, [{ per: 5, colli: 1 }], 'KG', { per: 5, quantita: 2 }))
      .toThrow(/abbassa di uno/);
  });

  it('una parte grande quanto il collo non e una parte', () => {
    expect(() => scelteDaTaglie(elenco, [], 'KG', { per: 10, quantita: 10 }))
      .toThrow(/collo intero/);
  });

  it('zero colli su una taglia non scrive niente', () => {
    expect(scelteDaTaglie(elenco, [{ per: 25, colli: 0 }], 'KG')).toEqual([]);
  });
});

describe('riempiFabbisogno', () => {
  const gruppi = [{ colli: 3, per: 25 }, { colli: 2, per: 10 }, { colli: 1, per: 5 }];

  it('in colli riempie dalle misure piu piene', () => {
    expect(riempiFabbisogno(gruppi, { colli: 4 }, 'KG')).toEqual([3, 1, 0]);
  });

  it('in UM si ferma appena copre, e l ultimo collo puo eccedere', () => {
    expect(riempiFabbisogno(gruppi, { uom: 60 }, 'KG')).toEqual([3, 0, 0]);
    expect(riempiFabbisogno(gruppi, { uom: 80 }, 'KG')).toEqual([3, 1, 0]);
  });

  it('un fabbisogno piu grande di quello che c e prende tutto', () => {
    expect(riempiFabbisogno(gruppi, { uom: 1000 }, 'KG')).toEqual([3, 2, 1]);
  });

  it('senza fabbisogno le righe nascono a zero', () => {
    expect(riempiFabbisogno(gruppi, null, 'KG')).toEqual([0, 0, 0]);
    expect(riempiFabbisogno(gruppi, { uom: null, colli: null }, 'KG')).toEqual([0, 0, 0]);
  });
});

/* ═══ 2.38.1 · LA SCELTA DEL DOCUMENTO, RIMESSA NELLA MASCHERA ═══════════

   `scelteDaUscite` traduce le uscite di un documento in POSIZIONI, ed e'
   quel che serve a chi esegue. La maschera dei colli pero' ragiona per
   MISURA dalla 2.2 — «quanti da 25, quanti da 10», piu' l'eventuale parte di
   un collo aperto — e in mezzo mancava il passaggio.

   Serve a un caso solo: una tappa di preparazione. Il DDT ha gia' scelto
   quali colli escono (§1.8.4) e l'operatore quella scelta la deve VEDERE e
   confermare, non rifarla: su un lotto con colli di misure diverse, «sei
   colli qualunque» e «questi sei colli» sono due merci diverse.

   LE PROVE QUI SOTTO CERCANO I CASI IN CUI UNA PROPOSTA SAREBBE PEGGIO DI
   NESSUNA PROPOSTA, ed e' il motivo per cui questa funzione torna `null`
   invece di fare del suo meglio:

   · La misura CHE NON C'E' PIU'. Fra la registrazione del DDT e il prelievo
     qualcuno ha preso quel collo: proporre la misura piu' vicina vorrebbe
     dire far confermare merce che il documento non nomina.
   · PIU' COLLI DI QUANTI CE NE SIANO. Stessa cosa, vista dall'altro verso.
   · DUE COLLI APERTI. La maschera ne tiene un campo solo, e mostrarne uno
     dei due sarebbe una proposta che dichiara meno di quel che il documento
     chiede — e chi conferma manda meno merce. */
describe('preselezioneDaUscite', () => {
  const gruppi = [{ colli: 4, per: 25 }, { colli: 3, per: 10 }];

  it('i colli interi diventano quanti per misura, nell ordine dei gruppi', () => {
    const p = preselezioneDaUscite(gruppi, [
      { da: 25, quantita: 25 }, { da: 25, quantita: 25 }, { da: 10, quantita: 10 },
    ], 'KG');
    expect(p.righe).toEqual([2, 1]);
    expect(p.parte).toBe('');
    expect(p.parteDa).toBeNull();
  });

  it('un collo aperto finisce nel campo della parte, con la misura da cui esce', () => {
    const p = preselezioneDaUscite(gruppi, [
      { da: 25, quantita: 25 }, { da: 10, quantita: 4 },
    ], 'KG');
    expect(p.righe).toEqual([1, 0]);
    expect(p.parte).toBe('4');
    expect(p.parteDa).toBe(10);
  });

  it('UNA MISURA CHE NON C E PIU NON SI SOSTITUISCE: nessuna proposta', () => {
    expect(preselezioneDaUscite(gruppi, [{ da: 50, quantita: 50 }], 'KG')).toBeNull();
  });

  it('PIU COLLI DI QUANTI CE NE SIANO: nessuna proposta', () => {
    const messe = Array.from({ length: 5 }, () => ({ da: 25, quantita: 25 }));
    expect(preselezioneDaUscite(gruppi, messe, 'KG')).toBeNull();
  });

  it('DUE COLLI APERTI non ci stanno nella maschera: nessuna proposta', () => {
    expect(preselezioneDaUscite(gruppi, [
      { da: 25, quantita: 5 }, { da: 10, quantita: 3 },
    ], 'KG')).toBeNull();
  });

  it('senza gruppi o senza uscite non esplode', () => {
    expect(preselezioneDaUscite(null, [{ da: 25, quantita: 25 }], 'KG')).toBeNull();
    expect(preselezioneDaUscite(gruppi, null, 'KG')).toBeNull();
    expect(preselezioneDaUscite(gruppi, [], 'KG')).toBeNull();
  });

  it('un uscita senza misura o a quantita zero non si indovina', () => {
    expect(preselezioneDaUscite(gruppi, [{ da: 0, quantita: 5 }], 'KG')).toBeNull();
    expect(preselezioneDaUscite(gruppi, [{ da: 25, quantita: 0 }], 'KG')).toBeNull();
  });
});
