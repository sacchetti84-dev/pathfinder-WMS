import { describe, it, expect } from 'vitest';
import {
  PERICOLI_DI_SERIE, ALLERGENI_AZIENDALI_DI_SERIE,
  normalizzaCodice, validaVoce, ripulisciVoci, unisci, rimovibile,
  etichettaDi, parametriDiSerie, leggiParametri,
} from '../src/modules/parametri';
import { ALLERGENI } from '../src/modules/anagrafica';

const voce = (code, label) => ({ code, label });

describe('normalizzaCodice', () => {
  it('maiuscola, taglia i bordi e chiude gli spazi interni', () => {
    expect(normalizzaCodice('  lattosio ')).toBe('LATTOSIO');
    expect(normalizzaCodice('semi di sesamo')).toBe('SEMI_DI_SESAMO');
  });

  /* Un codice e' una chiave: la punteggiatura che qualcuno digita per
     abitudine non deve diventare una seconda voce in tendina. */
  it('butta via cio che non e un carattere di codice', () => {
    expect(normalizzaCodice('nocivo!')).toBe('NOCIVO');
    expect(normalizzaCodice('a.b,c')).toBe('ABC');
    expect(normalizzaCodice('FIX+')).toBe('FIX+');
  });

  it('il vuoto resta vuoto, e non diventa una voce', () => {
    expect(normalizzaCodice('')).toBe('');
    expect(normalizzaCodice(null)).toBe('');
    expect(normalizzaCodice('   ')).toBe('');
  });
});

describe('validaVoce', () => {
  it('una voce buona non ha errori', () => {
    expect(validaVoce(voce('LATTOSIO', 'Lattosio'))).toEqual([]);
  });

  it('senza codice o senza etichetta si sa quale delle due manca', () => {
    expect(validaVoce(voce('', 'Lattosio'))).toHaveLength(1);
    expect(validaVoce(voce('LATTOSIO', ''))).toHaveLength(1);
    expect(validaVoce(voce('', ''))).toHaveLength(2);
  });

  it('un codice lunghissimo si ferma qui e non in tendina', () => {
    expect(validaVoce(voce('A'.repeat(30), 'x'))).toHaveLength(1);
  });
});

describe('ripulisciVoci', () => {
  it('normalizza, e il doppione perde', () => {
    const out = ripulisciVoci([voce(' lattosio ', 'Lattosio'), voce('LATTOSIO', 'Altro')]);
    expect(out).toEqual([{ code: 'LATTOSIO', label: 'Lattosio' }]);
  });

  it('cio che non e una voce non entra', () => {
    expect(ripulisciVoci([voce('', 'x'), voce('X', ''), null, 'boh'])).toEqual([]);
    expect(ripulisciVoci(null)).toEqual([]);
    expect(ripulisciVoci('lattosio')).toEqual([]);
  });
});

/* ── D18, che e la decisione che questo modulo esiste per tenere ────── */

describe('unisci', () => {
  it('i fissi vengono prima e restano marcati fissi', () => {
    const out = unisci(ALLERGENI, [voce('LATTOSIO', 'Lattosio')]);
    expect(out).toHaveLength(15);
    expect(out.slice(0, 14).every(v => v.fissa === true)).toBe(true);
    expect(out[14]).toEqual({ code: 'LATTOSIO', label: 'Lattosio', fissa: false });
  });

  /* LA PROVA CHE VALE PIU' DELLE ALTRE. Riscrivere un codice di legge con
     un'etichetta propria sarebbe il modo di togliere «Latte e derivati»
     senza che nessuno se ne accorga: non e' vietato a parole, e' impossibile. */
  it('un aggiunto non puo riscrivere un codice di legge', () => {
    const out = unisci(ALLERGENI, [voce('LATTE', 'Non lo dichiariamo piu')]);
    expect(out).toHaveLength(14);
    expect(etichettaDi(out, 'LATTE')).toBe('Latte e derivati');
  });

  it('i 14 di legge non si possono togliere, gli aziendali si', () => {
    const out = unisci(ALLERGENI, [voce('LATTOSIO', 'Lattosio')]);
    for (const a of ALLERGENI) expect(rimovibile(out, a.code), a.code).toBe(false);
    expect(rimovibile(out, 'LATTOSIO')).toBe(true);
    expect(rimovibile(out, 'BOH')).toBe(false);
  });

  it('senza aggiunte resta l elenco di legge, intatto', () => {
    expect(unisci(ALLERGENI, []).map(v => v.code)).toEqual(ALLERGENI.map(a => a.code));
  });

  it('etichettaDi ripiega sul codice quando non lo conosce', () => {
    expect(etichettaDi(unisci(ALLERGENI, []), 'BOH')).toBe('BOH');
  });
});

describe('i valori di serie', () => {
  /* Il glutine c'e' gia' come codice di legge: aggiungerlo una seconda
     volta avrebbe fatto due voci per la stessa cosa in ogni tendina. */
  it('il glutine sta gia fra i 14, il lattosio no', () => {
    expect(ALLERGENI.some(a => a.code === 'GLUTINE')).toBe(true);
    expect(ALLERGENI.some(a => a.code === 'LATTOSIO')).toBe(false);
    expect(ALLERGENI_AZIENDALI_DI_SERIE.map(v => v.code)).toEqual(['LATTOSIO']);
  });

  it('la pericolosita nasce configurabile per intero', () => {
    const p = parametriDiSerie();
    expect(p.pericoli.map(v => v.code)).toEqual(PERICOLI_DI_SERIE.map(v => v.code));
    for (const v of unisci([], p.pericoli)) expect(v.fissa).toBe(false);
  });

  it('unita e conservazione nascono vuote: i valori di serie stanno altrove', () => {
    const p = parametriDiSerie();
    expect(p.unita).toEqual([]);
    expect(p.conservazione).toEqual([]);
  });
});

describe('leggiParametri', () => {
  it('un record assente torna ai valori di serie', () => {
    expect(leggiParametri(null).pericoli).toHaveLength(PERICOLI_DI_SERIE.length);
    expect(leggiParametri(undefined).allergeni.map(v => v.code)).toEqual(['LATTOSIO']);
  });

  /* Un record che c'e' ma e' stato SVUOTATO resta svuotato: chi ha tolto
     tutte le voci di una tendina ha fatto una scelta, e ridargliele
     indietro al ricaricamento sarebbe rifiutargliela in silenzio. */
  it('un record presente e vuoto resta vuoto', () => {
    const p = leggiParametri({ unita: [], allergeni: [], conservazione: [], pericoli: [] });
    expect(p.pericoli).toEqual([]);
    expect(p.allergeni).toEqual([]);
  });

  it('un record malformato non fa cadere niente', () => {
    const p = leggiParametri({ pericoli: 'INFIAMMABILE', allergeni: [voce('X', 'Ics')] });
    expect(p.pericoli).toEqual([]);
    expect(p.allergeni).toEqual([{ code: 'X', label: 'Ics' }]);
    expect(p.unita).toEqual([]);
  });
});
