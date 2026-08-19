import { describe, it, expect } from 'vitest';
import {
  cifraControllo, ssccValido, validaPrefisso, sscc, codiceInterno,
  nuovoCodice, riconosci, eVuota, prossimoSeriale,
  CIFRE_SSCC, PREFISSO_INTERNO,
} from '../src/modules/udc';

describe('cifraControllo', () => {
  /* Il riscontro non e' il nostro codice: e' l'algoritmo GS1, modulo 10 con
     pesi 3 e 1 da destra. Questi valori si rifanno a mano su un foglio. */
  it('la calcola come il consorzio: 37610425002136000 chiude a 8', () => {
    /* Rifatto a mano. Somma pesata da destra, 3 e 1 alternati:
       0+0+0+6+9+1+6+0+0+5+6+4+0+1+18+7+9 = 72, e alla decina mancano 8.
       Il conto sta scritto qui perche' chi lo rifara' non debba fidarsi
       del codice che sta provando. */
    expect(cifraControllo('37610425002136000')).toBe(8);
  });

  /* LA PROVA CHE NON DIPENDE DA UN NUMERO IMPARATO A MEMORIA: per
     definizione, la somma pesata di tutte e diciotto le cifre — la cifra di
     controllo pesa 1, e a ritroso 3, 1, 3… — e' un multiplo di dieci. Vale
     per qualunque codice, e resta vera anche se l'implementazione cambia. */
  it('con la cifra di controllo il codice chiude sempre a multiplo di dieci', () => {
    const pesata = (s) => [...s].reverse()
      .reduce((t, c, i) => t + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
    for (const corpo of ['00000000000000000', '37610425002136000', '12345678901234567', '99999999999999999']) {
      expect(pesata(corpo + String(cifraControllo(corpo))) % 10).toBe(0);
    }
  });

  it('diciassette zeri danno zero', () => {
    expect(cifraControllo('00000000000000000')).toBe(0);
  });

  it('cambiare UNA cifra cambia il controllo: e\' il suo mestiere', () => {
    const a = cifraControllo('00000000000000001');
    const b = cifraControllo('00000000000000002');
    expect(a).not.toBe(b);
  });

  it('senza diciassette cifre non si calcola niente', () => {
    expect(cifraControllo('123')).toBe(null);
    expect(cifraControllo('1234567890123456789')).toBe(null);
    expect(cifraControllo('0000000000000000A')).toBe(null);
    expect(cifraControllo('')).toBe(null);
    expect(cifraControllo(null)).toBe(null);
  });
});

describe('ssccValido', () => {
  it('un codice generato da noi si rilegge valido', () => {
    const c = sscc('0712345', 42);
    expect(c).toHaveLength(CIFRE_SSCC);
    expect(ssccValido(c)).toBe(true);
  });

  it('una cifra storpiata non passa', () => {
    const c = sscc('0712345', 42);
    const storpio = c.slice(0, 17) + String((Number(c[17]) + 1) % 10);
    expect(ssccValido(storpio)).toBe(false);
  });

  it('diciassette o diciannove cifre non sono un SSCC', () => {
    expect(ssccValido('12345678901234567')).toBe(false);
    expect(ssccValido('1234567890123456789')).toBe(false);
    expect(ssccValido('')).toBe(false);
    expect(ssccValido(null)).toBe(false);
  });
});

describe('validaPrefisso', () => {
  it('VUOTO VA BENE: significa codici interni, non un dato mancante', () => {
    expect(validaPrefisso('')).toEqual([]);
    expect(validaPrefisso(null)).toEqual([]);
    expect(validaPrefisso('   ')).toEqual([]);
  });

  it('un prefisso da 7 a 10 cifre passa', () => {
    expect(validaPrefisso('0712345')).toEqual([]);
    expect(validaPrefisso('0712345678')).toEqual([]);
  });

  it('le lettere non sono un prefisso GS1', () => {
    expect(validaPrefisso('80X1234')).toContain('Il prefisso GS1 è fatto di sole cifre');
  });

  it('troppo corto o troppo lungo si dice in chiaro', () => {
    expect(validaPrefisso('123456')).toHaveLength(1);
    expect(validaPrefisso('12345678901')).toHaveLength(1);
  });
});

describe('sscc', () => {
  it('estensione, prefisso, seriale con gli zeri davanti, controllo', () => {
    const c = sscc('0712345', 42);
    expect(c.startsWith('0' + '0712345')).toBe(true);
    expect(c).toHaveLength(18);
    expect(c.slice(8, 17)).toBe('000000042');
  });

  it('due seriali diversi danno due codici diversi', () => {
    expect(sscc('0712345', 1)).not.toBe(sscc('0712345', 2));
  });

  it('l\'estensione si puo\' scegliere, ed entra nel codice', () => {
    expect(sscc('0712345', 1, 3).startsWith('3')).toBe(true);
  });

  it('SENZA PREFISSO NON NASCE UN SSCC: si finirebbe per emetterne uno altrui', () => {
    expect(sscc('', 1)).toBe(null);
    expect(sscc(null, 1)).toBe(null);
    expect(sscc('80X1234', 1)).toBe(null);
  });

  it('un seriale che non ci sta piu\' NON si accorcia: si rifiuta', () => {
    // prefisso da 10 cifre + estensione = 11, restano 6 cifre di seriale
    expect(sscc('0712345678', 999999)).not.toBe(null);
    expect(sscc('0712345678', 1000000)).toBe(null);
  });

  it('un seriale che non e\' un numero non passa', () => {
    expect(sscc('0712345', 'abc')).toBe(null);
    expect(sscc('0712345', null)).toBe(null);
    expect(sscc('0712345', -1)).toBe(null);
  });
});

describe('codiceInterno', () => {
  it('sei cifre, con gli zeri davanti', () => {
    expect(codiceInterno(42)).toBe('UDC-000042');
    expect(codiceInterno(1)).toBe(`${PREFISSO_INTERNO}-000001`);
  });

  it('oltre le sei cifre non si accorcia: si rifiuta', () => {
    expect(codiceInterno(999999)).toBe('UDC-999999');
    expect(codiceInterno(1000000)).toBe(null);
  });

  it('quel che non e\' un numero non diventa un codice', () => {
    expect(codiceInterno('abc')).toBe(null);
    expect(codiceInterno(null)).toBe(null);
  });
});

describe('nuovoCodice', () => {
  it('prefisso VUOTO: codice interno', () => {
    expect(nuovoCodice('', 7)).toBe('UDC-000007');
    expect(nuovoCodice(null, 7)).toBe('UDC-000007');
  });

  it('prefisso COMPILATO: SSCC', () => {
    const c = nuovoCodice('0712345', 7);
    expect(c).toHaveLength(18);
    expect(ssccValido(c)).toBe(true);
  });

  it('LA SCELTA STA IN UN POSTO SOLO: cambia il parametro, cambia la forma', () => {
    expect(nuovoCodice('', 7)).not.toBe(nuovoCodice('0712345', 7));
  });
});

describe('riconosci', () => {
  it('legge un\'etichetta SSCC', () => {
    expect(riconosci(sscc('0712345', 9))).toEqual({ forma: 'sscc', valido: true });
  });

  it('legge un\'etichetta interna, anche minuscola', () => {
    expect(riconosci('UDC-000042')).toEqual({ forma: 'interno', valido: true });
    expect(riconosci('udc-000042')).toEqual({ forma: 'interno', valido: true });
  });

  it('LE DUE EPOCHE CONVIVONO: chi scansiona non deve sapere quale sia', () => {
    expect(riconosci('UDC-000042').valido).toBe(true);
    expect(riconosci(sscc('0712345', 42)).valido).toBe(true);
  });

  it('un SSCC con la cifra sbagliata si riconosce come SSCC e si dice non valido', () => {
    const c = sscc('0712345', 42);
    const storpio = c.slice(0, 17) + String((Number(c[17]) + 1) % 10);
    expect(riconosci(storpio)).toEqual({ forma: 'sscc', valido: false });
  });

  it('quel che non e\' ne\' l\'uno ne\' l\'altro resta ignoto', () => {
    expect(riconosci('MAG-ACC-01')).toEqual({ forma: 'ignoto', valido: false });
    expect(riconosci('')).toEqual({ forma: 'ignoto', valido: false });
    expect(riconosci(null)).toEqual({ forma: 'ignoto', valido: false });
  });
});

describe('eVuota', () => {
  it('senza righe e\' vuota', () => {
    expect(eVuota([])).toBe(true);
    expect(eVuota(null)).toBe(true);
  });

  it('righe tutte a zero: vuota, e va chiusa', () => {
    expect(eVuota([{ qty: 0 }, { qty: 0 }])).toBe(true);
  });

  it('anche un collo solo la tiene viva', () => {
    expect(eVuota([{ qty: 0 }, { qty: 1 }])).toBe(false);
  });

  it('una riga senza quantita\' non tiene in vita niente', () => {
    expect(eVuota([{ qty: null }, {}])).toBe(true);
  });
});

describe('prossimoSeriale', () => {
  it('il primo e\' 1', () => {
    expect(prossimoSeriale(0)).toBe(1);
    expect(prossimoSeriale(null)).toBe(1);
    expect(prossimoSeriale('')).toBe(1);
  });

  it('altrimenti si va avanti di uno', () => {
    expect(prossimoSeriale(41)).toBe(42);
    expect(prossimoSeriale('41')).toBe(42);
  });

  it('I BUCHI NON SI RIEMPIONO: un numero saltato e\' un\'UDC nata e morta', () => {
    // sopravvissuta la 10, morte la 8 e la 9: il prossimo e' 11, non 8
    expect(prossimoSeriale(10)).toBe(11);
  });
});
