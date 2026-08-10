/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — collaudo della geometria delle ubicazioni
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   COSA COLLAUDA, E PERCHÉ.
   buildLocationGeometry() è ciò che sta A MONTE della serpentina: traduce
   ogni codice di ubicazione nelle sue coordinate reali (sito, zona, corsia,
   campata, livello). Il collaudo della serpentina parte da coordinate già
   pronte; qui si verifica che quelle coordinate siano quelle giuste. Se
   sbagliano loro, il percorso è ordinato benissimo — nel posto sbagliato.

   Il punto che vale davvero è dichiarato nel commento della funzione: le
   coordinate NON si deducono dal testo del codice, vengono da chi il codice
   l'ha generato. Qui sotto c'è una prova che lo dimostra invece di crederci:
   un sito e una zona con il trattino nel nome, cioè proprio il separatore.

   FINGE LA CACHE DI STORE, e nient'altro. getSites() e getZones() leggono
   _cache.sites: riempirlo è tutto ciò che serve, senza database, senza rete
   e senza adapter di persistenza.
   ═══════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../src/core/store.js';

/* Un magazzino finto, della stessa forma che _loadCache() costruisce:
   i siti portano le proprie zone appese. */
function magazzino(...sites) {
  Store._cache.sites = sites.map(s => ({ active: true, zones: [], ...s }));
}

const zona = (z) => ({ active: true, ...z });

/* Le zone attive di un sito, con i default di configurazione compilati.
   RACK: corsie × campate × livelli. FLOOR: file × posizioni. BULK: posizioni. */
const rack  = (id, cfg) => zona({ id, type: 'RACK',  ...cfg });
const floor = (id, cfg) => zona({ id, type: 'FLOOR', ...cfg });
const bulk  = (id, cfg) => zona({ id, type: 'BULK',  ...cfg });

beforeEach(() => { Store._cache.sites = []; });

describe('generazione delle ubicazioni', () => {
  it('una scaffalatura è corsie × campate × livelli, con i numeri a due cifre', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 2, bays_per_aisle: 2, levels: ['T', '1'] })] });
    expect(Store.generateLocations('DP', 'A').map(l => l.code)).toEqual([
      'DP-A-01-01-T', 'DP-A-01-01-1',
      'DP-A-01-02-T', 'DP-A-01-02-1',
      'DP-A-02-01-T', 'DP-A-02-01-1',
      'DP-A-02-02-T', 'DP-A-02-02-1',
    ]);
  });

  /* PERCHÉ LE DUE CIFRE CONTANO. I codici finiscono su etichette, su
     scansioni e nei filtri per prefisso di deleteZone(). Passare da 01 a 1
     dopo che il magazzino è etichettato significa ristampare tutto. */
  it('la decina non cambia formato: la campata 10 è 10, non 010', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 1, bays_per_aisle: 10, levels: ['T'] })] });
    const codici = Store.generateLocations('DP', 'A').map(l => l.code);
    expect(codici[8]).toBe('DP-A-01-09-T');
    expect(codici[9]).toBe('DP-A-01-10-T');
  });

  it('una zona a terra è file × posizioni, senza livello', () => {
    magazzino({ id: 'DP', zones: [floor('P', { rows: 2, positions_per_row: 2 })] });
    expect(Store.generateLocations('DP', 'P')).toEqual([
      { code: 'DP-P-01-01', row: 1, position: 1 },
      { code: 'DP-P-01-02', row: 1, position: 2 },
      { code: 'DP-P-02-01', row: 2, position: 1 },
      { code: 'DP-P-02-02', row: 2, position: 2 },
    ]);
  });

  it('una zona alla rinfusa è un elenco piatto di posizioni', () => {
    magazzino({ id: 'DP', zones: [bulk('R', { positions: 3 })] });
    expect(Store.generateLocations('DP', 'R').map(l => l.code))
      .toEqual(['DP-R-01', 'DP-R-02', 'DP-R-03']);
  });

  /* Una zona appena creata, prima che qualcuno la configuri, non deve
     produrre zero ubicazioni: zero ubicazioni è una zona che non esiste, e
     la si cercherebbe come un guasto. Produce la singola ubicazione di
     partenza, che si vede e si corregge. */
  it('una zona senza configurazione vale una sola ubicazione, non nessuna', () => {
    magazzino({ id: 'DP', zones: [rack('A'), floor('P'), bulk('R')] });
    expect(Store.generateLocations('DP', 'A').map(l => l.code)).toEqual(['DP-A-01-01-T']);
    expect(Store.generateLocations('DP', 'P').map(l => l.code)).toEqual(['DP-P-01-01']);
    expect(Store.generateLocations('DP', 'R').map(l => l.code)).toEqual(['DP-R-01']);
  });

  it('una zona di tipo sconosciuto non genera niente invece di indovinare', () => {
    magazzino({ id: 'DP', zones: [zona({ id: 'X', type: 'FRIGO', positions: 5 })] });
    expect(Store.generateLocations('DP', 'X')).toEqual([]);
  });

  it('una zona che non c’è non fa fallire la chiamata', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 1 })] });
    expect(Store.generateLocations('DP', 'MAI-ESISTITA')).toEqual([]);
    expect(Store.generateLocations('MAI-ESISTITO', 'A')).toEqual([]);
  });
});

describe('geometria delle ubicazioni', () => {
  it('la scaffalatura porta corsia, campata e livello come li ha generati', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 2, bays_per_aisle: 3, levels: ['T', '1', '2'] })] });
    const geo = Store.buildLocationGeometry();

    expect(geo.size).toBe(18);
    expect(geo.get('DP-A-02-03-2')).toEqual({
      site_id: 'DP', zone_id: 'A', zone_idx: 0, type: 'RACK',
      aisle: 2, bay: 3, level: '2', level_idx: 2,
    });
  });

  /* IL COLLAUDO CHE GIUSTIFICA L'INTERA FUNZIONE.
     Il commento di buildLocationGeometry() dice che interpretare la stringa
     a posteriori significherebbe dare per scontato che il separatore non
     compaia mai dentro un id. Qui compare in tutti e due: sito «MAG-1»,
     zona «A-B». Un parser che spezzasse su '-' leggerebbe corsia «1» e
     campata «A» — e manderebbe l'operatore da un'altra parte.
     Rompendo il codice per farlo leggere dal codice, questa prova cade e le
     altre no: è l'unica che distingue le due implementazioni. */
  it('le coordinate non vengono lette dal codice: reggono il trattino negli id', () => {
    magazzino({ id: 'MAG-1', zones: [rack('A-B', { aisles: 1, bays_per_aisle: 2, levels: ['T'] })] });
    const geo = Store.buildLocationGeometry();

    expect([...geo.keys()]).toEqual(['MAG-1-A-B-01-01-T', 'MAG-1-A-B-01-02-T']);
    expect(geo.get('MAG-1-A-B-01-02-T')).toMatchObject({
      site_id: 'MAG-1', zone_id: 'A-B', aisle: 1, bay: 2, level: 'T',
    });
  });

  /* A terra non ci sono corsie e campate, ma il percorso ha bisogno di due
     numeri per ordinare: la fila fa da corsia e la posizione da campata.
     È la traduzione che permette alla serpentina di attraversare zone di
     tipo diverso senza sapere di che tipo sono. */
  it('a terra la fila fa da corsia e la posizione da campata', () => {
    magazzino({ id: 'DP', zones: [floor('P', { rows: 2, positions_per_row: 2 })] });
    const geo = Store.buildLocationGeometry();

    expect(geo.get('DP-P-02-01')).toEqual({
      site_id: 'DP', zone_id: 'P', zone_idx: 0, type: 'FLOOR',
      aisle: 2, bay: 1, level: '', level_idx: 0,
    });
  });

  it('alla rinfusa la posizione fa da campata e la corsia resta a zero', () => {
    magazzino({ id: 'DP', zones: [bulk('R', { positions: 2 })] });
    expect(Store.buildLocationGeometry().get('DP-R-02')).toEqual({
      site_id: 'DP', zone_id: 'R', zone_idx: 0, type: 'BULK',
      aisle: 0, bay: 2, level: '', level_idx: 0,
    });
  });

  /* L'ordine dei livelli è quello configurato, non quello alfabetico: se
     fosse alfabetico, 'T' (terra) finirebbe dopo '1' e '2' e l'operatore si
     sentirebbe dire di partire dal ripiano alto per poi chinarsi. */
  it('il livello pesa per la posizione in elenco, non per il suo nome', () => {
    magazzino({ id: 'DP', zones: [rack('A', { aisles: 1, bays_per_aisle: 1, levels: ['T', '1', '2'] })] });
    const geo = Store.buildLocationGeometry();

    expect(geo.get('DP-A-01-01-T').level_idx).toBe(0);
    expect(geo.get('DP-A-01-01-1').level_idx).toBe(1);
    expect(geo.get('DP-A-01-01-2').level_idx).toBe(2);
  });

  it('le zone prendono il numero d’ordine dalla configurazione', () => {
    magazzino({
      id: 'DP',
      zones: [
        rack('SECONDA-IN-ELENCO', { aisles: 1, bays_per_aisle: 1, levels: ['T'] }),
        rack('PRIMA-IN-ALFABETO', { aisles: 1, bays_per_aisle: 1, levels: ['T'] }),
      ],
    });
    const geo = Store.buildLocationGeometry();

    expect(geo.get('DP-SECONDA-IN-ELENCO-01-01-T').zone_idx).toBe(0);
    expect(geo.get('DP-PRIMA-IN-ALFABETO-01-01-T').zone_idx).toBe(1);
  });

  /* Un sito o una zona disattivati sono spariti dal magazzino: le loro
     ubicazioni non devono comparire in un percorso di prelievo. La
     serpentina, per parte sua, mette in coda ciò che non ha geometria — che
     è esattamente dove deve finire una riga rimasta appesa a una zona
     chiusa. */
  it('siti e zone disattivati non entrano nella geometria', () => {
    magazzino(
      { id: 'DP', zones: [
        rack('VIVA',   { aisles: 1, bays_per_aisle: 1, levels: ['T'] }),
        { id: 'CHIUSA', type: 'RACK', active: false, aisles: 1, bays_per_aisle: 1, levels: ['T'] },
      ] },
      { id: 'DISMESSO', active: false, zones: [rack('A', { aisles: 1, bays_per_aisle: 1, levels: ['T'] })] },
    );
    expect([...Store.buildLocationGeometry().keys()]).toEqual(['DP-VIVA-01-01-T']);
  });

  it('più siti convivono nella stessa mappa, ognuno con il proprio', () => {
    magazzino(
      { id: 'DP', zones: [bulk('R', { positions: 1 })] },
      { id: 'MG', zones: [bulk('R', { positions: 1 })] },
    );
    const geo = Store.buildLocationGeometry();

    expect(geo.size).toBe(2);
    expect(geo.get('DP-R-01').site_id).toBe('DP');
    expect(geo.get('MG-R-01').site_id).toBe('MG');
  });

  it('un magazzino non ancora configurato dà una mappa vuota, non un errore', () => {
    magazzino();
    expect(Store.buildLocationGeometry().size).toBe(0);
  });
});
