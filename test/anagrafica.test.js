import { describe, it, expect } from 'vitest';
import {
  ALLERGENI, CLASSI_TEMPERATURA, leggiAllergeni, scriviAllergeni,
  leggiClasseTemperatura, etichettaAllergene, etichettaClasse,
  allergeneValido, classeValida, fogliValoriAmmessi,
} from '../src/modules/anagrafica';

describe('tabelle', () => {
  it('gli allergeni sono i 14 dell\'Allegato II del Reg. UE 1169/2011', () => {
    expect(ALLERGENI).toHaveLength(14);
    expect(ALLERGENI.map(a => a.code)).toEqual([
      'GLUTINE', 'CROSTACEI', 'UOVA', 'PESCE', 'ARACHIDI', 'SOIA', 'LATTE',
      'FRUTTA_GUSCIO', 'SEDANO', 'SENAPE', 'SESAMO', 'SOLFITI', 'LUPINI', 'MOLLUSCHI',
    ]);
  });

  it('nessun codice allergene e\' ripetuto', () => {
    expect(new Set(ALLERGENI.map(a => a.code)).size).toBe(14);
  });

  it('le classi di temperatura sono le tre della logistica, con il loro intervallo', () => {
    expect(CLASSI_TEMPERATURA.map(c => c.code)).toEqual(['SURG', 'REFR', 'AMB']);
    expect(CLASSI_TEMPERATURA.map(c => c.range)).toEqual(['−18 °C', '+4/+8 °C', '+18/+25 °C']);
  });

  it('ogni allergene e ogni classe hanno un\'etichetta leggibile', () => {
    for (const a of ALLERGENI) expect(etichettaAllergene(a.code)).not.toBe(a.code);
    expect(etichettaClasse('REFR')).toBe('Refrigerato (+4/+8 °C)');
  });

  it('un codice sconosciuto torna indietro tale e quale invece di sparire', () => {
    expect(etichettaAllergene('PARMIGIANO')).toBe('PARMIGIANO');
    expect(etichettaClasse('T5')).toBe('T5');
    expect(etichettaClasse(null)).toBe('');
  });
});

describe('lettura degli allergeni', () => {
  it('legge un codice solo', () => {
    expect(leggiAllergeni('LATTE')).toEqual({ codici: ['LATTE'], scarti: [] });
  });

  it('legge un elenco separato da punto e virgola', () => {
    /* Escono in ordine di Allegato II: la soia e' la sesta, il latte il settimo. */
    expect(leggiAllergeni('LATTE;SOIA').codici).toEqual(['SOIA', 'LATTE']);
  });

  it('tollera spazi e minuscole, che non sono interpretazione ma igiene', () => {
    expect(leggiAllergeni(' latte ; Soia ').codici).toEqual(['SOIA', 'LATTE']);
  });

  it('ordina per tabella, non per come sono stati scritti', () => {
    expect(leggiAllergeni('MOLLUSCHI;LATTE;UOVA').codici).toEqual(['UOVA', 'LATTE', 'MOLLUSCHI']);
    expect(leggiAllergeni('LATTE;UOVA').codici).toEqual(leggiAllergeni('UOVA;LATTE').codici);
  });

  it('non ripete un codice scritto due volte', () => {
    expect(leggiAllergeni('SOIA;SOIA').codici).toEqual(['SOIA']);
  });

  it('cella vuota: nessun allergene e nessuno scarto', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(leggiAllergeni(v)).toEqual({ codici: [], scarti: [] });
    }
  });

  it('NESSUNO e\' una risposta, non uno scarto — vuol dire che qualcuno ha guardato', () => {
    expect(leggiAllergeni('NESSUNO')).toEqual({ codici: [], scarti: [] });
  });

  it('cio\' che non e\' un codice previsto viene segnalato, non indovinato', () => {
    const r = leggiAllergeni('LATTE;lattosio;FRUTTA A GUSCIO');
    expect(r.codici).toEqual(['LATTE']);
    expect(r.scarti).toEqual(['lattosio', 'FRUTTA A GUSCIO']);
  });

  it('scrivere e rileggere restituisce gli stessi codici', () => {
    const codici = ['GLUTINE', 'LATTE', 'SESAMO'];
    expect(leggiAllergeni(scriviAllergeni(codici)).codici).toEqual(codici);
  });

  it('scriviAllergeni su elenco vuoto da\' cella vuota, non "undefined"', () => {
    expect(scriviAllergeni([])).toBe('');
    expect(scriviAllergeni(null)).toBe('');
  });
});

describe('lettura della classe di temperatura', () => {
  it('legge i tre codici', () => {
    expect(leggiClasseTemperatura('SURG')).toBe('SURG');
    expect(leggiClasseTemperatura('REFR')).toBe('REFR');
    expect(leggiClasseTemperatura('AMB')).toBe('AMB');
  });

  it('tollera spazi e minuscole', () => {
    expect(leggiClasseTemperatura(' refr ')).toBe('REFR');
  });

  it('cella vuota da\' null: l\'articolo non e\' stato classificato', () => {
    for (const v of ['', '  ', null, undefined]) expect(leggiClasseTemperatura(v)).toBeNull();
  });

  it('un valore sconosciuto da\' undefined, che e\' diverso da vuoto', () => {
    /* La differenza conta: null si ignora, undefined si segnala. */
    expect(leggiClasseTemperatura('-18')).toBeUndefined();
    expect(leggiClasseTemperatura('surgelato')).toBeUndefined();
    expect(leggiClasseTemperatura('FRIGO')).toBeUndefined();
  });
});

describe('validita\'', () => {
  it('riconosce i codici buoni e rifiuta gli altri', () => {
    expect(allergeneValido('LATTE')).toBe(true);
    expect(allergeneValido('latte')).toBe(false);
    expect(classeValida('AMB')).toBe(true);
    expect(classeValida('AMBIENTE')).toBe(false);
    expect(classeValida(null)).toBe(false);
  });
});

describe('foglio dei valori ammessi', () => {
  it('contiene le tre classi, i 14 allergeni e NESSUNO', () => {
    const righe = fogliValoriAmmessi();
    expect(righe.filter(r => r.colonna === 'Temperatura')).toHaveLength(3);
    expect(righe.filter(r => r.colonna === 'Allergeni')).toHaveLength(15);
  });

  it('ogni valore del foglio e\' accettato da chi lo rilegge', () => {
    for (const r of fogliValoriAmmessi()) {
      if (r.colonna === 'Temperatura') expect(leggiClasseTemperatura(r.valore)).toBe(r.valore);
      else expect(leggiAllergeni(r.valore).scarti).toEqual([]);
    }
  });
});
