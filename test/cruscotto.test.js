import { describe, it, expect } from 'vitest';
import {
  componiLayout, sposta, commuta, ridimensiona, scorciatoieDaMostrare, daSalvare,
} from '../src/modules/cruscotto';

const DISPONIBILI = [
  { id: 'kpi', titolo: 'Indicatori', fisso: true, larghezzaDiSerie: 'intera' },
  { id: 'integrita', titolo: 'Avvisi di integrità', fisso: true, larghezzaDiSerie: 'intera' },
  { id: 'andamento', titolo: 'Andamento movimenti' },
  { id: 'tipi', titolo: 'Ripartizione per tipo' },
  { id: 'quarantena', titolo: 'Quarantena' },
];

describe('componiLayout — il salvato incontra quello che il codice sa fare', () => {
  it('senza niente di salvato ci sono tutti, visibili, nell’ordine del catalogo', () => {
    const l = componiLayout(null, DISPONIBILI);
    expect(l.riquadri.map(r => r.id)).toEqual(['kpi', 'integrita', 'andamento', 'tipi', 'quarantena']);
    expect(l.riquadri.every(r => r.visibile)).toBe(true);
  });

  it('l’ordine salvato comanda', () => {
    const l = componiLayout({ riquadri: [
      { id: 'quarantena', visibile: true, larghezza: 'meta' },
      { id: 'kpi', visibile: true, larghezza: 'intera' },
    ] }, DISPONIBILI);
    expect(l.riquadri.slice(0, 2).map(r => r.id)).toEqual(['quarantena', 'kpi']);
  });

  it('UN RIQUADRO NUOVO NON SPARISCE: si accoda visibile', () => {
    /* Un layout salvato oggi viene riletto da una versione che ha un
       riquadro in più. Se il nuovo non comparisse, la funzione arriverebbe
       in magazzino invisibile a chiunque abbia mai toccato il cruscotto. */
    const l = componiLayout({ riquadri: [{ id: 'kpi', visibile: true, larghezza: 'intera' }] }, DISPONIBILI);
    expect(l.riquadri.map(r => r.id)).toEqual(['kpi', 'integrita', 'andamento', 'tipi', 'quarantena']);
    expect(l.riquadri.find(r => r.id === 'quarantena').visibile).toBe(true);
  });

  it('e un riquadro che non esiste più si ignora senza rompere il resto', () => {
    const l = componiLayout({ riquadri: [
      { id: 'sparito', visibile: true, larghezza: 'meta' },
      { id: 'tipi', visibile: false, larghezza: 'meta' },
    ] }, DISPONIBILI);
    expect(l.riquadri.map(r => r.id)).not.toContain('sparito');
    expect(l.riquadri.find(r => r.id === 'tipi').visibile).toBe(false);
  });

  it('UN RIQUADRO FISSO RESTA ACCESO anche se il salvato dice di no', () => {
    const l = componiLayout({ riquadri: [{ id: 'integrita', visibile: false, larghezza: 'intera' }] }, DISPONIBILI);
    expect(l.riquadri.find(r => r.id === 'integrita').visibile).toBe(true);
  });

  it('una larghezza che non esiste ripiega su quella di serie', () => {
    const l = componiLayout({ riquadri: [{ id: 'kpi', visibile: true, larghezza: 'gigante' }] }, DISPONIBILI);
    expect(l.riquadri.find(r => r.id === 'kpi').larghezza).toBe('intera');
  });

  it('un id ripetuto nel salvato non si disegna due volte', () => {
    const l = componiLayout({ riquadri: [
      { id: 'tipi', visibile: true, larghezza: 'meta' },
      { id: 'tipi', visibile: false, larghezza: 'intera' },
    ] }, DISPONIBILI);
    expect(l.riquadri.filter(r => r.id === 'tipi')).toHaveLength(1);
  });
});

describe('spostare, spegnere, ridimensionare', () => {
  const base = componiLayout(null, DISPONIBILI).riquadri;

  it('sposta porta il riquadro dove si dice', () => {
    const r = sposta(base, 'quarantena', 0);
    expect(r.map(x => x.id)).toEqual(['quarantena', 'kpi', 'integrita', 'andamento', 'tipi']);
  });

  it('OLTRE IL BORDO NON SI VA, e non si rompe niente', () => {
    expect(sposta(base, 'kpi', -5).map(x => x.id)).toEqual(base.map(x => x.id));
    expect(sposta(base, 'kpi', 99).map(x => x.id)).toEqual(['integrita', 'andamento', 'tipi', 'quarantena', 'kpi']);
  });

  it('un id che non c’è lascia l’elenco com’era', () => {
    expect(sposta(base, 'inesistente', 0).map(x => x.id)).toEqual(base.map(x => x.id));
  });

  it('commuta spegne e riaccende', () => {
    const spento = commuta(base, 'tipi', DISPONIBILI);
    expect(spento.find(r => r.id === 'tipi').visibile).toBe(false);
    expect(commuta(spento, 'tipi', DISPONIBILI).find(r => r.id === 'tipi').visibile).toBe(true);
  });

  it('MA UN FISSO NON SI SPEGNE: gli avvisi non sono una preferenza', () => {
    expect(commuta(base, 'integrita', DISPONIBILI).find(r => r.id === 'integrita').visibile).toBe(true);
  });

  it('ridimensiona cambia solo il riquadro nominato', () => {
    const r = ridimensiona(base, 'tipi', 'intera');
    expect(r.find(x => x.id === 'tipi').larghezza).toBe('intera');
    expect(r.find(x => x.id === 'andamento').larghezza).toBe('meta');
  });
});

describe('le scorciatoie', () => {
  const TUTTE = ['io-in', 'io-out', 'move', 'pick', 'inv'];

  it('NULL SIGNIFICA «QUELLE DI SEMPRE», e non «nessuna»', () => {
    expect(scorciatoieDaMostrare({ riquadri: [], scorciatoie: null }, TUTTE)).toEqual(TUTTE);
    expect(scorciatoieDaMostrare(null, TUTTE)).toEqual(TUTTE);
  });

  it('un elenco vuoto è una scelta, e resta vuoto', () => {
    expect(scorciatoieDaMostrare({ riquadri: [], scorciatoie: [] }, TUTTE)).toEqual([]);
  });

  it('e una scorciatoia che il codice non conosce più si ignora', () => {
    expect(scorciatoieDaMostrare({ riquadri: [], scorciatoie: ['pick', 'sparita'] }, TUTTE)).toEqual(['pick']);
  });
});

describe('daSalvare', () => {
  it('scrive i soli campi che contano', () => {
    const l = componiLayout(null, DISPONIBILI);
    const salvato = daSalvare(l);
    expect(Object.keys(salvato.riquadri[0]).sort()).toEqual(['id', 'larghezza', 'visibile']);
  });

  /* Un layout che si porta dietro titoli e descrizioni li congela al
     giorno in cui è stato salvato, e il mese dopo la scheda si chiama in
     due modi: uno nel dato, uno nel codice. */
  it('e non congela i titoli, che sono del codice', () => {
    const salvato = daSalvare(componiLayout(null, DISPONIBILI));
    expect(JSON.stringify(salvato)).not.toContain('Indicatori');
  });

  it('null sulle scorciatoie resta null, non diventa elenco vuoto', () => {
    expect(daSalvare({ riquadri: [], scorciatoie: null }).scorciatoie).toBe(null);
  });
});
