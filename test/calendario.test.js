/* IL CALENDARIO DELLE SPEDIZIONI — 2.34
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Un calendario sbaglia in modi che si vedono solo il giorno sbagliato: il
   mese che comincia di domenica, quello che finisce di lunedì, il passaggio
   d'anno, l'ora legale. Queste prove li provocano tutti, adesso, invece di
   aspettare marzo.

   IL CASO CHE FA SBAGLIARE PIÙ SPESSO È IL FUSO. `toISOString()` converte in
   UTC: alle 00:30 del 3 marzo in Italia restituisce il 2, e un documento in
   partenza comparirebbe il giorno prima. Per questo il modulo compone la
   data a mano dai campi locali, e per questo c'è una prova che ci prova. */
import { describe, it, expect } from 'vitest';
import {
  grigliaMese, perGiorno, isoLocale, riepilogoGiorno,
  mesePrecedente, meseSeguente, NOMI_GIORNO,
} from '../src/modules/calendario';

const doc = (extra = {}) => ({
  doc_id: 'SHIP-1',
  ddt_num: '1',
  status: 'pending',
  expected_pickup_date: '2026-09-24',
  lines: [{ qty: 3 }],
  ...extra,
});

describe('isoLocale', () => {
  /* MEZZANOTTE E MEZZA D'ITALIA È ANCORA IERI IN UTC. Una data composta con
     `toISOString()` fa comparire la spedizione il giorno prima — e nessuno
     se ne accorge finché non lavora di notte o non cambia l'ora. */
  it('la data è quella locale, non quella UTC', () => {
    expect(isoLocale(new Date(2026, 2, 3, 0, 30))).toBe('2026-03-03');
    expect(isoLocale(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('mese e giorno hanno sempre due cifre', () => {
    expect(isoLocale(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('perGiorno', () => {
  it('raggruppa per data di ritiro previsto', () => {
    const { mappa } = perGiorno([doc(), doc({ doc_id: 'SHIP-2' }), doc({ doc_id: 'SHIP-3', expected_pickup_date: '2026-09-25' })]);
    expect(mappa.get('2026-09-24')).toHaveLength(2);
    expect(mappa.get('2026-09-25')).toHaveLength(1);
  });

  /* QUEL CHE NON HA UNA DATA NON HA UN GIORNO. Metterlo su oggi lo farebbe
     sembrare urgente; toglierlo lo farebbe sparire. Sta da parte, e chi
     guarda decide. */
  it('un documento senza data non finisce su oggi, e non sparisce', () => {
    const { mappa, senzaData } = perGiorno([doc({ expected_pickup_date: '' }), doc({ expected_pickup_date: undefined })]);
    expect(mappa.size).toBe(0);
    expect(senzaData).toHaveLength(2);
  });

  it('e nemmeno una data illeggibile diventa un giorno', () => {
    const { mappa, senzaData } = perGiorno([doc({ expected_pickup_date: 'quando capita' })]);
    expect(mappa.size).toBe(0);
    expect(senzaData).toHaveLength(1);
  });

  it('una data con l\'ora attaccata si taglia al giorno', () => {
    const { mappa } = perGiorno([doc({ expected_pickup_date: '2026-09-24T14:30:00' })]);
    expect(mappa.get('2026-09-24')).toHaveLength(1);
  });

  it('senza documenti non esplode', () => {
    expect(perGiorno(null).mappa.size).toBe(0);
    expect(perGiorno([null, undefined]).senzaData).toEqual([]);
  });
});

describe('grigliaMese', () => {
  const g = (a, m, docs = []) => grigliaMese(a, m, docs, new Date(2026, 8, 21));

  it('le settimane sono sempre di sette giorni, e cominciano di lunedì', () => {
    for (const anno of [2024, 2025, 2026]) {
      for (let m = 1; m <= 12; m++) {
        const griglia = g(anno, m);
        for (const sett of griglia) {
          expect(sett, `${anno}-${m}`).toHaveLength(7);
          expect(new Date(sett[0].iso + 'T12:00:00').getDay(), `${anno}-${m}`).toBe(1);
        }
      }
    }
  });

  /* IL MESE CHE COMINCIA DI DOMENICA è quello che rompe i calendari scritti
     con `getDay()` senza correzione: la domenica vale 0, e la settimana
     comincerebbe il giorno dopo invece che sei giorni prima. */
  it('un mese che comincia di domenica ha la sua coda davanti', () => {
    /* 1° novembre 2026 è una domenica. */
    const griglia = g(2026, 11);
    expect(griglia[0][6].iso).toBe('2026-11-01');
    expect(griglia[0].slice(0, 6).every((x) => x.fuori)).toBe(true);
  });

  it('e un mese che finisce di lunedì ha la sua ultima settimana intera', () => {
    /* 30 novembre 2026 è un lunedì: l'ultima settimana deve esserci tutta. */
    const griglia = g(2026, 11);
    const ultima = griglia[griglia.length - 1];
    expect(ultima).toHaveLength(7);
    expect(ultima.some((x) => x.iso === '2026-11-30')).toBe(true);
  });

  it('ogni giorno del mese compare una volta sola', () => {
    const griglia = g(2026, 9);
    const dentro = griglia.flat().filter((x) => !x.fuori).map((x) => x.iso);
    expect(new Set(dentro).size).toBe(dentro.length);
    expect(dentro).toHaveLength(30);
    expect(dentro[0]).toBe('2026-09-01');
    expect(dentro[dentro.length - 1]).toBe('2026-09-30');
  });

  it('febbraio bisestile ha ventinove giorni', () => {
    const dentro = g(2024, 2).flat().filter((x) => !x.fuori);
    expect(dentro).toHaveLength(29);
  });

  it('e quello non bisestile ventotto', () => {
    expect(g(2026, 2).flat().filter((x) => !x.fuori)).toHaveLength(28);
  });

  /* L'ORA LEGALE sposta gli orologi di un'ora dentro il mese: sommare
     86.400.000 millisecondi al giorno salta o ripete una data. Il modulo usa
     `setDate`, che il calendario lo sa. */
  it('il cambio d\'ora non salta né ripete un giorno', () => {
    /* In Italia l'ora legale entra l'ultima domenica di marzo. */
    const marzo = g(2026, 3).flat().filter((x) => !x.fuori).map((x) => x.iso);
    expect(marzo).toHaveLength(31);
    expect(new Set(marzo).size).toBe(31);
    const ottobre = g(2026, 10).flat().filter((x) => !x.fuori).map((x) => x.iso);
    expect(new Set(ottobre).size).toBe(31);
  });

  it('i documenti finiscono nella casella del loro giorno', () => {
    const griglia = g(2026, 9, [doc(), doc({ doc_id: 'SHIP-2' })]);
    const casella = griglia.flat().find((x) => x.iso === '2026-09-24');
    expect(casella.documenti).toHaveLength(2);
  });

  it('e le caselle vuote portano un elenco vuoto, non undefined', () => {
    const casella = g(2026, 9, [doc()]).flat().find((x) => x.iso === '2026-09-01');
    expect(casella.documenti).toEqual([]);
  });

  it('oggi è marcato, e una sola casella', () => {
    const oggi = g(2026, 9, []).flat().filter((x) => x.oggi);
    expect(oggi).toHaveLength(1);
    expect(oggi[0].iso).toBe('2026-09-21');
  });

  it('e in un mese che non contiene oggi nessuna casella lo è', () => {
    /* Le code possono contenere giorni di un altro mese: se oggi cadesse
       lì, sarebbe giusto marcarlo. Qui il mese è lontano. */
    expect(g(2026, 1, []).flat().some((x) => x.oggi)).toBe(false);
  });

  it('un documento di un altro mese non entra dove non deve', () => {
    const griglia = g(2026, 9, [doc({ expected_pickup_date: '2026-12-24' })]);
    expect(griglia.flat().every((x) => x.documenti.length === 0)).toBe(true);
  });
});

describe('i mesi accanto', () => {
  it('gennaio guarda indietro a dicembre dell\'anno prima', () => {
    expect(mesePrecedente(2026, 1)).toEqual({ anno: 2025, mese: 12 });
  });

  it('dicembre guarda avanti a gennaio dell\'anno dopo', () => {
    expect(meseSeguente(2026, 12)).toEqual({ anno: 2027, mese: 1 });
  });

  it('e in mezzo si muovono di uno', () => {
    expect(mesePrecedente(2026, 9)).toEqual({ anno: 2026, mese: 8 });
    expect(meseSeguente(2026, 9)).toEqual({ anno: 2026, mese: 10 });
  });
});

describe('riepilogoGiorno', () => {
  it('conta documenti, colli ed evasi', () => {
    const r = riepilogoGiorno({
      documenti: [doc({ lines: [{ qty: 3 }, { qty: 4 }] }), doc({ status: 'evaded', lines: [{ qty: 5 }] })],
    });
    expect(r).toEqual({ documenti: 2, colli: 12, evasi: 1 });
  });

  it('una riga senza colli leggibili vale zero, non NaN', () => {
    const r = riepilogoGiorno({ documenti: [doc({ lines: [{ qty: null }, { qty: 'tre' }] })] });
    expect(r.colli).toBe(0);
  });

  it('un giorno vuoto dà zeri', () => {
    expect(riepilogoGiorno({ documenti: [] })).toEqual({ documenti: 0, colli: 0, evasi: 0 });
    expect(riepilogoGiorno(null)).toEqual({ documenti: 0, colli: 0, evasi: 0 });
  });
});

describe('i nomi', () => {
  it('la settimana comincia di lunedì anche nelle intestazioni', () => {
    expect(NOMI_GIORNO[0]).toBe('Lun');
    expect(NOMI_GIORNO[6]).toBe('Dom');
    expect(NOMI_GIORNO).toHaveLength(7);
  });
});
