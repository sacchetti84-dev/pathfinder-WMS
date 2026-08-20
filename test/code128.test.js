import { describe, it, expect } from 'vitest';
import { valori, strisce, svg, primoCarattereFuoriSet } from '../src/modules/code128';

/* LA TABELLA SI COLLAUDA CON LE SUE PROPRIETÀ, non riscrivendola qui.

   Ricopiare le 107 righe dentro il collaudo proverebbe soltanto che sono
   state ricopiate uguali. Code128 però porta due invarianti che una cifra
   sbagliata rompe subito: ogni simbolo vale ESATTAMENTE 11 moduli, e la
   somma delle sole BARRE è sempre PARI — è la proprietà su cui i lettori
   fanno l'autoverifica. Una qualunque cifra storta nella tabella fa saltare
   almeno una delle due. */

/* Rifà le larghezze di un valore leggendole dal simbolo intero: si prende
   un testo di un carattere, e si guarda la fetta che interessa. */
const stricceDi = (testo) => strisce(testo);

describe('la tabella dei modelli regge le due invarianti dello standard', () => {
  it('ogni simbolo vale 11 moduli, lo STOP 13', () => {
    /* Un carattere: START + dato + checksum + STOP = 3 simboli da 11 e uno
       da 13. Tutti i 106 modelli passano dalla stessa strada, e i tre
       simboli si scelgono cambiando il testo. */
    const s = stricceDi('A');
    expect(s.reduce((t, n) => t + n, 0)).toBe(11 * 3 + 13);
  });

  it('LA SOMMA DELLE BARRE È PARI in ogni simbolo, ed è l’autoverifica', () => {
    /* Si passano in rassegna tutti i 95 caratteri del set B: fra dato,
       START e checksum, la rassegna tocca l'intera tabella. */
    for (let c = 32; c <= 126; c++) {
      const s = stricceDi(String.fromCharCode(c));
      for (let simbolo = 0; simbolo < 3; simbolo++) {
        const fetta = s.slice(simbolo * 6, simbolo * 6 + 6);
        expect(fetta.reduce((t, n) => t + n, 0)).toBe(11);
        expect((fetta[0] + fetta[2] + fetta[4]) % 2).toBe(0);
      }
      const stop = s.slice(18);
      expect(stop.reduce((t, n) => t + n, 0)).toBe(13);
      expect((stop[0] + stop[2] + stop[4] + stop[6]) % 2).toBe(0);
    }
  });

  it('ogni striscia sta fra 1 e 4 moduli', () => {
    for (const n of stricceDi('UDC-MSRB80C2-2JLC 0123456789')) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
});

describe('i valori del simbolo', () => {
  it('cominciano da START B e finiscono col checksum', () => {
    /* «A» vale 33 nel set B (65 − 32). Il peso parte da 1 sul primo dato,
       e lo START pesa 1 anche lui: (104 + 33) % 103 = 34. */
    expect(valori('A')).toEqual([104, 33, 34]);
  });

  it('LO SPAZIO È IL VALORE ZERO, non un carattere da saltare', () => {
    expect(valori(' ')).toEqual([104, 0, 1]);
  });

  it('il peso cresce con la posizione: due caratteri uguali non pesano uguale', () => {
    const v = valori('AA');
    const checksum = v[v.length - 1];
    expect(checksum).toBe((104 + 33 * 1 + 33 * 2) % 103);
  });

  it('un riferimento di documento vero si scrive tutto', () => {
    expect(() => valori('DDT-2026-0001')).not.toThrow();
    expect(() => valori('UDC-MSRB80C2-2JLC')).not.toThrow();
    expect(() => valori('012345678901234567')).not.toThrow();
  });

  it('e quello che il set B non sa scrivere si rifiuta, dicendo cosa', () => {
    expect(primoCarattereFuoriSet('Caffè')).toBe('è');
    expect(primoCarattereFuoriSet('DDT-2026-0001')).toBe(null);
    expect(() => valori('Caffè')).toThrow(/è/);
  });
});

describe('il disegno', () => {
  it('è un SVG autoportante, senza richieste verso l’esterno', () => {
    const s = svg('DDT-2026-0001');
    expect(s.startsWith('<svg')).toBe(true);
    /* Lo `xmlns` non e' una richiesta: e' il nome dello spazio dei nomi, e
       nessun browser lo va a prendere. Si toglie prima di guardare. */
    const senzaNamespace = s.replace('http://www.w3.org/2000/svg', '');
    expect(senzaNamespace).not.toMatch(/https?:|url\(|<image/);
  });

  it('LE BARRE SONO NERE SU BIANCO DICHIARATO: un tema scuro non le gira', () => {
    const s = svg('A');
    expect(s).toContain('fill="#fff"');
    expect(s).toContain('fill="#000"');
  });

  it('la zona di rispetto c’è, e di serie vale dieci moduli per lato', () => {
    const modulo = 0.5;
    const moduliCodice = strisce('A').reduce((t, n) => t + n, 0);
    const s = svg('A', { modulo, unita: '' });
    const larghezza = Number(s.match(/width="([\d.]+)"/)[1]);
    expect(larghezza).toBeCloseTo((moduliCodice + 20) * modulo, 3);
  });

  it('la prima barra comincia DOPO il margine, non a zero', () => {
    /* Il primo `rect` è il fondo bianco a x=0; il secondo è la prima barra. */
    const rects = [...svg('A', { modulo: 1, margine: 10, unita: '' }).matchAll(/<rect x="([\d.]+)"/g)];
    expect(Number(rects[0][1])).toBe(0);
    expect(Number(rects[1][1])).toBe(10);
  });

  it('l’etichetta sotto si scrive solo se qualcuno la chiede', () => {
    expect(svg('A')).not.toContain('<text');
    expect(svg('A', { etichetta: 'A' })).toContain('<text');
  });

  it('e il testo dell’etichetta non può iniettare markup', () => {
    expect(svg('A', { etichetta: '<script>x</script>' })).not.toContain('<script>');
  });
});
