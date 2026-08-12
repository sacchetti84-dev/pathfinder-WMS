import { describe, it, expect } from 'vitest';
import {
  UNITA_MISURA, DECIMALI_MAX,
  etichettaUnita, unitaValida, decimali, leggiUnita,
  arrotonda, sommaUom, sottraiUom,
  configurazione, gestitaAUM, validaConfigurazione, congela, daLotto,
  suddividi, uomDaColli, verifica,
  formattaQuantita, descrivi, valoriAmmessi,
} from '../src/modules/misure';

const T0 = Date.parse('2026-10-05T07:30:00Z');

/* L'articolo del piano §4.2: 1.000 pezzi per collo. */
const art = (extra = {}) => ({ code: 'ART1', uom: 'PZ', uom_per_collo: 1000, ...extra });

/* ── Le tabelle ─────────────────────────────────────────────────────── */

describe('tabelle', () => {
  it('le cinque unita\' del piano, e nessun\'altra', () => {
    expect(UNITA_MISURA.map(u => u.code)).toEqual(['PZ', 'MT', 'LT', 'KG', 'GR']);
  });

  it('ogni unita\' ha etichetta e decimali dichiarati', () => {
    for (const u of UNITA_MISURA) {
      expect(u.label.length).toBeGreaterThan(2);
      expect(Number.isInteger(u.decimali)).toBe(true);
    }
  });

  it('cio\' che conta oggetti non ha decimali, cio\' che si misura si\'', () => {
    expect(decimali('PZ')).toBe(0);
    expect(decimali('GR')).toBe(0);
    expect(decimali('KG')).toBe(DECIMALI_MAX);
    expect(decimali('LT')).toBe(DECIMALI_MAX);
    expect(decimali('MT')).toBe(DECIMALI_MAX);
  });

  it('un codice ignoto non inventa un\'etichetta ne\' una precisione', () => {
    expect(etichettaUnita('CT')).toBe('CT');
    expect(decimali('CT')).toBe(DECIMALI_MAX);
    expect(unitaValida('CT')).toBe(false);
  });
});

/* ── La lettura, che e' stretta ─────────────────────────────────────── */

describe('leggiUnita', () => {
  it('la cella vuota e\' un\'assenza, non un errore', () => {
    expect(leggiUnita('')).toBe(null);
    expect(leggiUnita(null)).toBe(null);
    expect(leggiUnita(undefined)).toBe(null);
    expect(leggiUnita('   ')).toBe(null);
  });

  it('maiuscolo e spazi ai bordi sono igiene, non interpretazione', () => {
    expect(leggiUnita('pz')).toBe('PZ');
    expect(leggiUnita(' Kg ')).toBe('KG');
  });

  it('cio\' che non e\' un codice previsto non viene indovinato', () => {
    expect(leggiUnita('CT')).toBe(undefined);
    expect(leggiUnita('pezzi')).toBe(undefined);
    expect(leggiUnita('KG.')).toBe(undefined);
  });
});

/* ── L'aritmetica, e la deriva del virgola mobile ───────────────────── */

describe('arrotonda', () => {
  it('taglia alla precisione chiesta', () => {
    expect(arrotonda(10.4449, 2)).toBe(10.44);
    expect(arrotonda(10.5, 0)).toBe(11);
    expect(arrotonda(2.0005, 3)).toBe(2.001);
  });

  it('non lascia passare cio\' che numero non e\'', () => {
    expect(arrotonda('boh', 2)).toBe(null);
    expect(arrotonda(Infinity, 2)).toBe(null);
    expect(arrotonda(null, 2)).toBe(null);
  });
});

describe('somma e sottrazione', () => {
  it('0,1 + 0,2 fa 0,3 — e nel magazzino non c\'e\' un altro numero', () => {
    expect(sommaUom(0.1, 0.2, 'KG')).toBe(0.3);
  });

  it('la sottrazione non lascia code di virgola mobile', () => {
    expect(sottraiUom(10.5, 0.3, 'KG')).toBe(10.2);
    expect(sottraiUom(1000, 100, 'PZ')).toBe(900);
  });

  it('un saldo che scende sotto zero e\' un errore in faccia, non una riga strana', () => {
    expect(() => sottraiUom(100, 101, 'PZ')).toThrow(/negativ/i);
  });

  it('a zero ci si arriva: e\' l\'ultimo collo che esce', () => {
    expect(sottraiUom(100, 100, 'PZ')).toBe(0);
  });
});

/* ── La configurazione dell'articolo ────────────────────────────────── */

describe('configurazione', () => {
  it('senza `uom` l\'articolo si comporta come nella 1.2: a soli colli', () => {
    expect(configurazione({ code: 'ART1' })).toBe(null);
    expect(configurazione({ code: 'ART1', uom_per_collo: 1000 })).toBe(null);
    expect(configurazione(null)).toBe(null);
  });

  it('un\'unita\' che non e\' fra le cinque non configura niente', () => {
    expect(configurazione({ code: 'ART1', uom: 'CT', uom_per_collo: 10 })).toBe(null);
  });

  it('legge `uom_per_collo` quando c\'e\'', () => {
    expect(configurazione(art())).toEqual({ uom: 'PZ', per_collo: 1000 });
  });

  it('RIPIEGO: `pieces_per_pack` quando `uom_per_collo` manca — una sorgente sola', () => {
    const a = { code: 'ART1', uom: 'PZ', pieces_per_pack: 250 };
    expect(configurazione(a)).toEqual({ uom: 'PZ', per_collo: 250 });
  });

  it('lo zero di `pieces_per_pack` e\' l\'assenza con cui l\'ha sempre scritto Store', () => {
    const a = { code: 'ART1', uom: 'PZ', uom_per_collo: 0, pieces_per_pack: 0 };
    expect(configurazione(a)).toEqual({ uom: 'PZ', per_collo: null });
  });

  it('`uom_per_collo` vince sul ripiego quando ci sono entrambi', () => {
    const a = { code: 'ART1', uom: 'PZ', uom_per_collo: 1000, pieces_per_pack: 250 };
    expect(configurazione(a).per_collo).toBe(1000);
  });

  it('numeri arrivati da Excel come stringhe restano numeri', () => {
    expect(configurazione({ code: 'ART1', uom: 'kg', uom_per_collo: '12,5' }).per_collo).toBe(12.5);
    expect(configurazione({ code: 'ART1', uom: 'PZ', uom_per_collo: '1000' }).per_collo).toBe(1000);
  });

  it('un per-collo negativo non e\' un per-collo', () => {
    expect(configurazione({ code: 'ART1', uom: 'PZ', uom_per_collo: -5 }).per_collo).toBe(null);
  });
});

describe('gestitaAUM', () => {
  it('serve l\'unita\' E il per-collo: senza il secondo non si divide niente', () => {
    expect(gestitaAUM({ uom: 'PZ', per_collo: 1000 })).toBe(true);
    expect(gestitaAUM({ uom: 'PZ', per_collo: null })).toBe(false);
    expect(gestitaAUM(null)).toBe(false);
  });
});

describe('validaConfigurazione', () => {
  it('nessuna unita\', nessun errore: e\' il caso di oggi', () => {
    expect(validaConfigurazione('', '')).toEqual([]);
    expect(validaConfigurazione(null, null)).toEqual([]);
  });

  it('un\'unita\' fuori elenco si dice, non si scarta in silenzio', () => {
    expect(validaConfigurazione('CT', 10)).toHaveLength(1);
    expect(validaConfigurazione('CT', 10)[0]).toMatch(/CT/);
  });

  it('l\'unita\' senza il per-collo e\' una configurazione da finire', () => {
    const e = validaConfigurazione('PZ', 0);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/per collo/i);
  });

  it('un per-collo frazionario su PZ non e\' un numero di pezzi', () => {
    expect(validaConfigurazione('PZ', 2.5)).toHaveLength(1);
    expect(validaConfigurazione('KG', 2.5)).toEqual([]);
  });

  it('il per-collo senza unita\' non configura niente, e va detto', () => {
    expect(validaConfigurazione('', 1000)).toHaveLength(1);
  });
});

/* ── Il congelamento al primo posizionamento ────────────────────────── */

describe('congela', () => {
  it('scrive la configurazione dell\'articolo, con l\'istante', () => {
    expect(congela(art(), 'ART1', 'L001', T0)).toEqual({
      article_code: 'ART1', lot_code: 'L001',
      uom: 'PZ', uom_per_collo: 1000, frozen_at: T0,
    });
  });

  it('un articolo non configurato non congela niente', () => {
    expect(congela({ code: 'ART1' }, 'ART1', 'L001', T0)).toBe(null);
  });

  it('congela anche l\'unita\' senza per-collo: e\' cio\' che c\'era davvero', () => {
    const l = congela({ code: 'ART1', uom: 'KG' }, 'ART1', 'L001', T0);
    expect(l.uom).toBe('KG');
    expect(l.uom_per_collo).toBe(null);
  });

  /* Il lotto si taglia ai bordi e NON si alza a maiuscolo, perche' cosi' lo
     tratta `item_key` da sempre — `Validate.clean(lot)` senza `upper`, e
     `article#lot` costruito con quello. Un `lots` che alzasse il caso
     avrebbe chiavi diverse dalla giacenza che descrive. */
  it('il codice sale a maiuscolo, il lotto no: sono le chiavi che gia\' esistono', () => {
    const l = congela(art(), ' art1 ', ' l001 ', T0);
    expect(l.article_code).toBe('ART1');
    expect(l.lot_code).toBe('l001');
  });
});

describe('daLotto', () => {
  it('IL LOTTO VINCE SULL\'ANAGRAFICA: e\' un fatto gia\' successo', () => {
    const l = { article_code: 'ART1', lot_code: 'L001', uom: 'PZ', uom_per_collo: 500 };
    expect(daLotto(l)).toEqual({ uom: 'PZ', per_collo: 500 });
  });

  it('un lotto senza unita\' non configura niente', () => {
    expect(daLotto({ article_code: 'ART1', lot_code: 'L001' })).toBe(null);
    expect(daLotto(null)).toBe(null);
  });
});

/* ── La suddivisione, che e' il cuore ───────────────────────────────── */

describe('suddividi', () => {
  it('l\'esempio del piano: 10.100 pz da 1.000 sono 10 pieni + 1 da 100', () => {
    expect(suddividi(10100, 1000, 'PZ')).toEqual({
      colli: 11, pieni: 10, resto: 100, incompleto: true,
    });
  });

  it('tondo: nessun collo incompleto', () => {
    expect(suddividi(10000, 1000, 'PZ')).toEqual({
      colli: 10, pieni: 10, resto: 0, incompleto: false,
    });
  });

  it('meno di un collo e\' un collo, ed e\' incompleto', () => {
    expect(suddividi(500, 1000, 'PZ')).toEqual({
      colli: 1, pieni: 0, resto: 500, incompleto: true,
    });
  });

  it('zero non e\' un collo', () => {
    expect(suddividi(0, 1000, 'PZ')).toEqual({
      colli: 0, pieni: 0, resto: 0, incompleto: false,
    });
  });

  it('un per-collo assente o non positivo non divide niente', () => {
    expect(suddividi(10100, null, 'PZ')).toBe(null);
    expect(suddividi(10100, 0, 'PZ')).toBe(null);
    expect(suddividi(10100, -1, 'PZ')).toBe(null);
  });

  it('una quantita\' negativa non si suddivide', () => {
    expect(suddividi(-1, 1000, 'PZ')).toBe(null);
  });

  it('LA DERIVA: 0,3 kg da 0,1 sono TRE colli pieni, non due e un resto', () => {
    expect(suddividi(0.3, 0.1, 'KG')).toEqual({
      colli: 3, pieni: 3, resto: 0, incompleto: false,
    });
  });

  it('i decimali reggono: 10,5 kg da 2,5 sono 4 pieni + 1 da 0,5', () => {
    expect(suddividi(10.5, 2.5, 'KG')).toEqual({
      colli: 5, pieni: 4, resto: 0.5, incompleto: true,
    });
  });

  it('un resto sotto la precisione dell\'unita\' non e\' un collo', () => {
    expect(suddividi(1000.0004, 1000, 'KG').colli).toBe(1);
    expect(suddividi(1000.0004, 1000, 'KG').incompleto).toBe(false);
  });
});

describe('uomDaColli', () => {
  it('N colli pieni sono N per-collo', () => {
    expect(uomDaColli(11, 1000, 'PZ')).toBe(11000);
    expect(uomDaColli(3, 2.5, 'KG')).toBe(7.5);
  });

  it('zero colli sono zero UM', () => {
    expect(uomDaColli(0, 1000, 'PZ')).toBe(0);
  });

  it('senza per-collo non si deriva niente: si dice che manca', () => {
    expect(uomDaColli(11, null, 'PZ')).toBe(null);
  });
});

/* ── La verifica del collo incompleto ───────────────────────────────── */

describe('verifica', () => {
  it('11 colli con 10.100 pz e\' coerente: 10 pieni + 1 incompleto', () => {
    expect(verifica(11, 10100, 1000, 'PZ')).toEqual({
      colliAttesi: 11, scarto: 0, ok: true, incompleto: true, resto: 100,
    });
  });

  it('10 colli con 10.100 pz non torna: manca il collo del resto', () => {
    const v = verifica(10, 10100, 1000, 'PZ');
    expect(v.ok).toBe(false);
    expect(v.scarto).toBe(-1);
    expect(v.colliAttesi).toBe(11);
  });

  it('12 colli con 10.100 pz non torna: ce n\'e\' uno di troppo', () => {
    expect(verifica(12, 10100, 1000, 'PZ').scarto).toBe(1);
  });

  it('senza configurazione non c\'e\' niente da verificare', () => {
    expect(verifica(11, 10100, null, 'PZ')).toBe(null);
  });

  it('senza il totale in UM non si verifica: la riga e\' a soli colli', () => {
    expect(verifica(11, null, 1000, 'PZ')).toBe(null);
  });
});

/* ── Come si legge a video ──────────────────────────────────────────── */

describe('formattaQuantita', () => {
  it('le migliaia si separano come le scrive chi legge', () => {
    expect(formattaQuantita(10100, 'PZ')).toBe('10.100');
  });

  it('i decimali arrivano fino alla precisione dell\'unita\', non oltre', () => {
    expect(formattaQuantita(10.5, 'KG')).toBe('10,5');
    expect(formattaQuantita(10.5, 'PZ')).toBe('11');
  });

  it('cio\' che numero non e\' si legge come un trattino', () => {
    expect(formattaQuantita(null, 'PZ')).toBe('—');
    expect(formattaQuantita(undefined)).toBe('—');
  });
});

describe('descrivi', () => {
  it('l\'esempio del piano si legge «10 × 1.000 + 1 × 100 PZ»', () => {
    expect(descrivi(10100, 1000, 'PZ')).toBe('10 × 1.000 + 1 × 100 PZ');
  });

  it('tondo: nessun addendo di troppo', () => {
    expect(descrivi(10000, 1000, 'PZ')).toBe('10 × 1.000 PZ');
  });

  it('solo il resto: un collo, e si vede che e\' incompleto', () => {
    expect(descrivi(500, 1000, 'PZ')).toBe('1 × 500 PZ');
  });

  it('niente merce, niente descrizione', () => {
    expect(descrivi(0, 1000, 'PZ')).toBe('—');
    expect(descrivi(10100, null, 'PZ')).toBe('—');
  });

  it('senza unita\' si legge lo stesso: il numero c\'e\'', () => {
    expect(descrivi(10100, 1000)).toBe('10 × 1.000 + 1 × 100');
  });
});

/* ── Il foglio che accompagna l'export ──────────────────────────────── */

describe('valoriAmmessi', () => {
  it('una riga per unita\', tutte sulla colonna UM', () => {
    const righe = valoriAmmessi();
    expect(righe).toHaveLength(UNITA_MISURA.length);
    expect(righe.every(r => r.colonna === 'UM')).toBe(true);
    expect(righe.map(r => r.valore)).toEqual(UNITA_MISURA.map(u => u.code));
  });

  it('il significato dice cosa si conta, non ripete il codice', () => {
    for (const r of valoriAmmessi()) expect(r.significato.length).toBeGreaterThan(2);
  });
});
