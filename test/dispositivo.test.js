import { describe, it, expect } from 'vitest';
import {
  eAndroid, classifica, classeCSS, classiPossibili,
  LARGHEZZA_TERMINALE, LARGHEZZA_TAVOLETTA,
} from '../src/modules/dispositivo';

const UA_MC9400 = 'Mozilla/5.0 (Linux; Android 13; MC9400) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

describe('eAndroid', () => {
  it('riconosce il terminale da magazzino', () => {
    expect(eAndroid(UA_MC9400)).toBe(true);
  });

  it('un PC non e\' Android', () => {
    expect(eAndroid(UA_WINDOWS)).toBe(false);
  });

  it('senza stringa non si indovina niente', () => {
    expect(eAndroid('')).toBe(false);
    expect(eAndroid(null)).toBe(false);
    expect(eAndroid(undefined)).toBe(false);
  });
});

describe('classifica', () => {
  it('l\'MC9400 in orizzontale — 533 px CSS — e\' un terminale', () => {
    expect(classifica({ userAgent: UA_MC9400, larghezza: 533, touch: true })).toBe('terminale');
  });

  it('l\'MC9400 in verticale — 400 px CSS — e\' un terminale', () => {
    expect(classifica({ userAgent: UA_MC9400, larghezza: 400, touch: true })).toBe('terminale');
  });

  it('A DECIDERE E\' LA LARGHEZZA: una finestra stretta su PC ha lo stesso problema', () => {
    expect(classifica({ userAgent: UA_WINDOWS, larghezza: 480, touch: false })).toBe('terminale');
  });

  it('la soglia e\' inclusiva, e appena sopra si cambia', () => {
    expect(classifica({ larghezza: LARGHEZZA_TERMINALE })).toBe('terminale');
    expect(classifica({ larghezza: LARGHEZZA_TERMINALE + 1 })).toBe('scrivania');
  });

  it('una tavoletta e\' schermo medio PIU\' un dito che tocca', () => {
    expect(classifica({ userAgent: UA_MC9400, larghezza: 800, touch: true })).toBe('tavoletta');
    expect(classifica({ userAgent: UA_WINDOWS, larghezza: 800, touch: true })).toBe('tavoletta');
  });

  it('schermo medio SENZA tocco resta una scrivania: e\' una finestra ridotta', () => {
    expect(classifica({ userAgent: UA_WINDOWS, larghezza: 800, touch: false })).toBe('scrivania');
  });

  it('Android da solo basta a dire che si tocca, anche se il browser tace', () => {
    expect(classifica({ userAgent: UA_MC9400, larghezza: 900 })).toBe('tavoletta');
  });

  it('sopra la soglia della tavoletta e\' scrivania anche col tocco', () => {
    expect(classifica({ larghezza: LARGHEZZA_TAVOLETTA, touch: true })).toBe('tavoletta');
    expect(classifica({ larghezza: LARGHEZZA_TAVOLETTA + 1, touch: true })).toBe('scrivania');
  });

  it('DAVANTI A UN DUBBIO NON SI STRINGE NIENTE: senza misure e\' scrivania', () => {
    expect(classifica({})).toBe('scrivania');
    expect(classifica(null)).toBe('scrivania');
    expect(classifica({ larghezza: 0 })).toBe('scrivania');
    expect(classifica({ larghezza: NaN, touch: true })).toBe('scrivania');
    expect(classifica({ larghezza: -100 })).toBe('scrivania');
  });
});

describe('classeCSS', () => {
  it('una classe per dispositivo, con un prefisso che non collide', () => {
    expect(classeCSS('terminale')).toBe('dispositivo-terminale');
    expect(classeCSS('scrivania')).toBe('dispositivo-scrivania');
  });

  it('le classi possibili sono tre, e si tolgono tutte prima di metterne una', () => {
    expect(classiPossibili()).toEqual([
      'dispositivo-terminale', 'dispositivo-tavoletta', 'dispositivo-scrivania',
    ]);
  });

  it('ogni classe che si puo\' assegnare e\' fra quelle che si sanno togliere', () => {
    for (const l of [320, 533, 800, 1400]) {
      expect(classiPossibili()).toContain(classeCSS(classifica({ larghezza: l, touch: true })));
    }
  });
});
