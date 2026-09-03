import { describe, it, expect } from 'vitest';
import {
  colliAttesi, pesoLordo, validaModello, leggiModelli, trovaModello, descriviModello,
  modelloAppreso, modelloConColli,
} from '../src/modules/imballo';

const epal = () => ({
  code: 'EPAL85', label: 'EPAL 8 per strato', supporto: 'EPAL',
  colli_strato: 8, strati: 5, tara_kg: 25,
});

describe('colliAttesi', () => {
  it('e il prodotto dei due conteggi', () => {
    expect(colliAttesi(epal())).toBe(40);
  });

  /* Una proposta che non c'e' si lascia in bianco: uno zero direbbe «ci sta
     zero colli», che non e' la stessa cosa di «non lo so». */
  it('senza i due conteggi non inventa uno zero', () => {
    expect(colliAttesi({ code: 'X', label: 'X' })).toBe(null);
    expect(colliAttesi({ colli_strato: 8, strati: 0 })).toBe(null);
    expect(colliAttesi(null)).toBe(null);
  });
});

describe('pesoLordo', () => {
  it('somma la tara al netto', () => {
    expect(pesoLordo(300, 25)).toBe(325);
  });

  it('senza tara il lordo e il netto, senza netto non esiste', () => {
    expect(pesoLordo(300, null)).toBe(300);
    expect(pesoLordo(null, 25)).toBe(null);
  });
});

describe('validaModello', () => {
  it('un modello buono non ha errori', () => {
    expect(validaModello(epal())).toEqual([]);
  });

  it('dice quale dei due manca', () => {
    expect(validaModello({ ...epal(), code: '' })).toHaveLength(1);
    expect(validaModello({ ...epal(), label: '' })).toHaveLength(1);
  });

  /* I colli sono un conteggio: mezzo collo per strato non esiste, e un
     decimale letto come intero cambierebbe la proposta in silenzio. */
  it('i conteggi sono interi e maggiori di zero', () => {
    expect(validaModello({ ...epal(), colli_strato: 0 })).toHaveLength(1);
    expect(validaModello({ ...epal(), strati: 2.5 })).toHaveLength(1);
    expect(validaModello({ ...epal(), colli_strato: -3 })).toHaveLength(1);
  });

  it('tara e altezza sono facoltative, ma se ci sono sono misure', () => {
    expect(validaModello({ ...epal(), tara_kg: undefined })).toEqual([]);
    expect(validaModello({ ...epal(), tara_kg: -1 })).toHaveLength(1);
    expect(validaModello({ ...epal(), altezza_max_mm: 0 })).toHaveLength(1);
  });

  it('un codice gia in elenco si rifiuta', () => {
    const altri = [epal()];
    expect(validaModello({ ...epal(), label: 'Doppione' }, altri)).toHaveLength(1);
    expect(validaModello({ ...epal(), code: 'MEZZO' }, altri)).toEqual([]);
  });

  it('il codice si confronta normalizzato, non alla lettera', () => {
    expect(validaModello({ ...epal(), code: ' epal85 ' }, [epal()])).toHaveLength(1);
  });
});

describe('leggiModelli', () => {
  it('cio che non e un elenco non e un elenco vuoto per sbaglio', () => {
    expect(leggiModelli(null)).toEqual([]);
    expect(leggiModelli({ code: 'EPAL85' })).toEqual([]);
  });

  it('maiuscola il codice e taglia i bordi', () => {
    const [m] = leggiModelli([{ ...epal(), code: ' epal85 ', label: '  EPAL  ' }]);
    expect(m.code).toBe('EPAL85');
    expect(m.label).toBe('EPAL');
  });

  it('scarta i doppioni e i modelli che non stanno in piedi', () => {
    const letti = leggiModelli([
      epal(),
      { ...epal(), label: 'Doppione' },
      { code: 'ROTTO', label: 'Rotto', colli_strato: 0, strati: 5 },
    ]);
    expect(letti.map(m => m.code)).toEqual(['EPAL85']);
  });

  /* Assente e zero sono due cose diverse: un `?? 0` scritto per prudenza
     direbbe che un supporto mai pesato pesa zero. */
  it('una tara mai compilata resta assente, non diventa zero', () => {
    const [m] = leggiModelli([{ code: 'X', label: 'X', colli_strato: 4, strati: 2 }]);
    expect('tara_kg' in m).toBe(false);
    const [z] = leggiModelli([{ code: 'X', label: 'X', colli_strato: 4, strati: 2, tara_kg: 0 }]);
    expect(z.tara_kg).toBe(0);
  });

  it('i numeri arrivati come testo diventano numeri', () => {
    const [m] = leggiModelli([{ code: 'X', label: 'X', colli_strato: '8', strati: '5' }]);
    expect(colliAttesi(m)).toBe(40);
  });
});

describe('trovaModello e descriviModello', () => {
  it('si cerca per codice normalizzato', () => {
    const elenco = leggiModelli([epal()]);
    expect(trovaModello(elenco, 'epal85')?.label).toBe('EPAL 8 per strato');
    expect(trovaModello(elenco, 'ALTRO')).toBe(null);
    expect(trovaModello(elenco, '')).toBe(null);
    expect(trovaModello(null, 'EPAL85')).toBe(null);
  });

  it('la descrizione porta supporto e conto dei colli', () => {
    expect(descriviModello(epal())).toBe('EPAL 8 per strato (EPAL) — 8 × 5 = 40 colli');
    expect(descriviModello(null)).toBe('');
  });
});

/* 2.21 — IL MODELLO DI CARICO SI IMPARA DAL PRIMO BANCALE.
   Undicimila articoli non ricevono un modello perche' qualcuno si siede a
   scriverli: lo ricevono il giorno in cui il reparto imballa il primo
   bancale di quell'articolo. */
describe('modelloAppreso', () => {
  it('nasce dai soli colli pieni, a uno strato', () => {
    const m = modelloAppreso(40);
    expect(m).toEqual({ code: 'AUTO-40', label: 'Appreso dal reparto', colli_strato: 40, strati: 1 });
    expect(colliAttesi(m)).toBe(40);
  });

  it('e un modello valido: se non lo fosse, `leggiModelli` lo butterebbe in silenzio', () => {
    expect(validaModello(modelloAppreso(12), [])).toEqual([]);
    expect(leggiModelli([modelloAppreso(12)])).toHaveLength(1);
  });

  it('non nasce da un numero che non e un conteggio', () => {
    expect(modelloAppreso(0)).toBe(null);
    expect(modelloAppreso(-3)).toBe(null);
    expect(modelloAppreso('')).toBe(null);
    expect(modelloAppreso(null)).toBe(null);
    expect(modelloAppreso('sette')).toBe(null);
  });

  it('i decimali si troncano: un collo e un conteggio', () => {
    expect(modelloAppreso(40.7).colli_strato).toBe(40);
  });
});

describe('modelloConColli', () => {
  it('ritrova quello gia appreso invece di crearne un secondo', () => {
    const elenco = leggiModelli([modelloAppreso(40), modelloAppreso(12)]);
    expect(modelloConColli(elenco, 40)?.code).toBe('AUTO-40');
    expect(modelloConColli(elenco, 12)?.code).toBe('AUTO-12');
    expect(modelloConColli(elenco, 99)).toBe(null);
  });

  /* UN EPAL DA 40 E UN CASSONE DA 40 PORTANO TARE DIVERSE, e assegnarne uno
     a caso metterebbe un peso lordo sbagliato in bolla: scegliere fra due
     formati veri e' un gesto umano, e si fa in Parametri. */
  it('non pesca fra i modelli configurati a mano, nemmeno a conto uguale', () => {
    const elenco = leggiModelli([epal()]);        // 8 x 5 = 40, tara 25
    expect(colliAttesi(elenco[0])).toBe(40);
    expect(modelloConColli(elenco, 40)).toBe(null);
  });

  it('niente da imparare, niente da ritrovare', () => {
    expect(modelloConColli(leggiModelli([modelloAppreso(40)]), 0)).toBe(null);
    expect(modelloConColli(null, 40)).toBe(null);
  });
});

/* A UNO STRATO SOLO LA MOLTIPLICAZIONE NON DICE NIENTE: «40 x 1 = 40» e' il
   numero scritto tre volte, ed e' la forma dei modelli appresi. */
describe('descriviModello a uno strato', () => {
  it('scrive il conto senza la moltiplicazione', () => {
    expect(descriviModello(modelloAppreso(40))).toBe('Appreso dal reparto — 40 colli');
  });

  it('con piu strati la moltiplicazione resta: dice come si impila', () => {
    expect(descriviModello(epal())).toBe('EPAL 8 per strato (EPAL) — 8 × 5 = 40 colli');
  });
});
