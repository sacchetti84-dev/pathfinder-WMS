/* UN CAMPO UBICAZIONE ACCETTA ANCHE UN'UNITÀ DI CARICO — 2.36
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   LE PROVE QUI SOTTO CERCANO DI FAR SBAGLIARE LA REGOLA, e i casi che
   contano nascono tutti da com'è fatto un magazzino vero:

   · **Un codice UDC ha la stessa FORMA di un codice di ubicazione.** Sono
     gruppi di lettere e cifre separati da trattini tutti e due, e la
     convalida delle ubicazioni li accetta entrambi. Distinguerli guardando
     il testo è impossibile: si guardano i dati, e nell'ordine giusto.

   · **Un'unità può non stare da nessuna parte.** Appena creata, prima che
     qualcuno la posi. Risolverla vorrebbe dire inventare un vano.

   · **Un'unità può essere partita.** Il record resta — è storia — ma quel
     bancale non è più in magazzino.

   · **Un'unità vuota sta ancora da qualche parte.** È un contenitore senza
     merce sopra, non un contenitore che non esiste: mandarci della roba è
     legittimo, ed è anzi il gesto con cui lo si riempie. */

import { describe, it, expect } from 'vitest';
import { risolviVano, spiegaVano } from '../src/modules/vano';

/** Un magazzino finto: due vani veri, tre unità in stati diversi. */
const VANI = new Set(['MAG-ACC-11', 'MAG-SPC-01', 'MOP1-A-01-01-T']);
const UNITA = {
  'UDC-000001': { udc_id: 'UDC-000001', location_code: 'MAG-ACC-11', status: 'open' },
  'UDC-000002': { udc_id: 'UDC-000002', location_code: '', status: 'open' },
  'UDC-000003': { udc_id: 'UDC-000003', location_code: 'MAG-SPC-01', status: 'shipped' },
  'UDC-000004': { udc_id: 'UDC-000004', location_code: 'MAG-SPC-01', status: 'empty' },
};
const fonti = {
  eUbicazione: (c) => VANI.has(c),
  udc: (c) => UNITA[c] || null,
};

describe('un codice di ubicazione resta un codice di ubicazione', () => {
  it('si risolve in sé stesso, e senza nominare nessuna unità', () => {
    expect(risolviVano('MAG-ACC-11', fonti)).toEqual({ vano: 'MAG-ACC-11', udc: null, motivo: '' });
  });

  it('minuscole e spazi non cambiano la risposta', () => {
    /* Un lettore che manda spazi in coda, o un dito su una tastiera: il
       campo si normalizza altrove, ma questa regola non deve dipenderci. */
    expect(risolviVano('  mag-acc-11 ', fonti).vano).toBe('MAG-ACC-11');
  });
});

describe('un codice di unità si risolve nel vano dove sta', () => {
  it('IL CASO: l’unità porta al suo vano, e dice da dove ci si è arrivati', () => {
    expect(risolviVano('UDC-000001', fonti)).toEqual({
      vano: 'MAG-ACC-11', udc: 'UDC-000001', motivo: '',
    });
  });

  it('e un’unità VUOTA vale come le altre: è un contenitore, sta in un posto', () => {
    /* Vuota non vuol dire inesistente. Mandare merce dove sta un pallet
       vuoto è il gesto con cui lo si riempie. */
    expect(risolviVano('UDC-000004', fonti).vano).toBe('MAG-SPC-01');
  });
});

describe('e la risposta è positiva SOLO se l’unità è davvero da qualche parte', () => {
  it('un’unità senza ubicazione non risolve niente, e lo dice', () => {
    const r = risolviVano('UDC-000002', fonti);
    expect(r.vano).toBe('');
    expect(r.udc).toBe('UDC-000002');
    expect(r.motivo).toMatch(/non è ubicata/);
  });

  it('un’unità partita non risolve niente, e lo dice diversamente', () => {
    /* Due motivi diversi perché sono due situazioni diverse: una si
       risolve posando il bancale, l’altra no. */
    const r = risolviVano('UDC-000003', fonti);
    expect(r.vano).toBe('');
    expect(r.motivo).toMatch(/è partita/);
  });

  it('un codice che non è né l’uno né l’altro lo dice per esteso', () => {
    const r = risolviVano('PIPPO-1', fonti);
    expect(r).toEqual({ vano: '', udc: null, motivo: 'PIPPO-1 non è né un’ubicazione né un’unità di carico' });
  });

  it('il campo vuoto chiede di riempirlo, non parla di unità', () => {
    expect(risolviVano('', fonti).motivo).toMatch(/Indica/);
    expect(risolviVano(null, fonti).motivo).toMatch(/Indica/);
    expect(risolviVano(undefined, fonti).motivo).toMatch(/Indica/);
  });
});

describe('l’ordine di lettura: l’ubicazione viene prima', () => {
  /* SE UN VANO SI CHIAMASSE COME UN'UNITÀ, VINCE IL VANO. Non è un caso
     teorico: i codici dei vani li scrive chi configura il magazzino, e
     nessuno gli impedisce di battezzarne uno «UDC-…». Chi ci lavora si
     aspetta che quel codice sia quel vano — è quello che sta scritto sul
     montante — e dedurre altrimenti sarebbe una sorpresa. */
  it('un codice che è tutti e due si risolve come ubicazione', () => {
    const doppio = {
      eUbicazione: (c) => c === 'UDC-000001',
      udc: (c) => UNITA[c] || null,
    };
    expect(risolviVano('UDC-000001', doppio)).toEqual({ vano: 'UDC-000001', udc: null, motivo: '' });
  });
});

describe('quel che si scrive a video', () => {
  it('si spiega solo quando ci si è arrivati da un’unità', () => {
    expect(spiegaVano(risolviVano('UDC-000001', fonti))).toBe('UDC-000001 sta in MAG-ACC-11');
  });

  it('e non si spiega niente su un’ubicazione scritta come tale', () => {
    /* Scrivere «MAG-ACC-11 sta in MAG-ACC-11» è rumore, ed è il modo di
       far smettere di leggere i riscontri. */
    expect(spiegaVano(risolviVano('MAG-ACC-11', fonti))).toBe('');
  });

  it('né su un codice che non si è risolto', () => {
    expect(spiegaVano(risolviVano('UDC-000002', fonti))).toBe('');
    expect(spiegaVano(null)).toBe('');
  });
});
