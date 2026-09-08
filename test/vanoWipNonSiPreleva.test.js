/* DAL VANO DI LAVORAZIONE NON SI PRELEVA — 2.29

   Portare in produzione è un trasferimento: la merce esce dallo scaffale e
   resta scritta in giacenza, nel vano WIP. Per `getItemByKey` quello è
   un'ubicazione come le altre, e quando lo scaffale si svuota diventa
   l'unica che porta il lotto: il percorso mandava a prelevare dal vano WIP
   verso il vano WIP, cioè a rimettere in produzione roba che ci stava già.

   `build` ha bisogno di Store; qui Store è finto, e porta solo i sei metodi
   che `build` chiama davvero. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PickRoute } from '../src/modules/pickRoute';
import { Store } from '../src/core/store';

const WIP = 'MAG1-WIP-01';
const SCAFFALE = 'MAG1-A-01-01-T';

const originali = {};
const METODI = ['buildLocationGeometry', 'getAreaWip', 'getAvailableQty',
                'getItemByKey', 'getLotsForArticle', 'isItemQuarantined'];

/** Un magazzino finto: le ubicazioni che portano A#L1. */
function magazzino(ubicazioni, areaWip = WIP) {
  Store.buildLocationGeometry = () => new Map([
    [SCAFFALE, { site_id: 'MAG1', zone_id: 'Z', zone_idx: 0, type: 'rack', aisle: 1, bay: 1, level: 'T', level_idx: 0 }],
    [WIP,      { site_id: 'MAG1', zone_id: 'W', zone_idx: 1, type: 'rack', aisle: 9, bay: 9, level: 'T', level_idx: 0 }],
  ]);
  Store.getAreaWip = () => areaWip;
  Store.getAvailableQty = () => 99;
  Store.isItemQuarantined = () => false;
  Store.getLotsForArticle = () => [];
  Store.getItemByKey = () => ubicazioni.map((location_code) => ({
    item_key: 'A#L1', article_code: 'A', lot_code: 'L1', location_code, qty: 5,
  }));
}

const RIGA = [{
  article_code: 'A', category: 'MP', description: 'Articolo A', um: 'KG',
  qty_per_unit: null, total_qty: 10,
  lots: [{ lot_code: 'L1', supplier_lot: '', um: 'KG', qty: 10, expiry_iso: '', state: '' }],
}];

beforeEach(() => { for (const m of METODI) originali[m] = Store[m]; });
afterEach(() => { for (const m of METODI) Store[m] = originali[m]; });

describe('il vano di lavorazione non è un’ubicazione da cui si preleva', () => {
  it('con lo scaffale pieno la tappa è lo scaffale, non il vano WIP', () => {
    magazzino([SCAFFALE, WIP]);
    const p = PickRoute.build(RIGA);
    expect(p.stops).toHaveLength(1);
    expect(p.stops[0].location_code).toBe(SCAFFALE);
  });

  it('il vano WIP si dice, ma come segnalazione: la merce c’è, non si prende', () => {
    magazzino([SCAFFALE, WIP]);
    const p = PickRoute.build(RIGA);
    const n = p.notes.find((x) => x.location_code === WIP);
    expect(n).toBeTruthy();
    expect(n.reason).toBe('in_lavorazione');
  });

  /* 2.29.1 — VISTO AL BANCO L'08/09, e non rileggendo il codice.
     Quattro righe di giacenza dello stesso lotto nello stesso vano WIP
     davano QUATTRO volte la stessa frase. `(location_code, item_key)` è un
     indice e non un vincolo di unicità (`server/lib/schema.js`): due righe
     nello stesso vano ci stanno, e un caricamento di massa le fa — la
     migrazione dalla 1.4 è esattamente questo. `offroute` era già giusto,
     una voce sola: si moltiplicava l'avviso, e un avviso ripetuto spinge
     fuori dallo schermo quelli che l'operatore non ha ancora letto.
     Verificata rimettendo il difetto: senza la deduplica, esce 4. */
  it('lo stesso vano ripetuto in giacenza dà UNA nota, non una per riga', () => {
    magazzino([WIP, WIP, WIP, WIP]);
    const p = PickRoute.build(RIGA);
    const wip = p.notes.filter((x) => x.location_code === WIP && x.reason === 'in_lavorazione');
    expect(wip).toHaveLength(1);
  });

  it('ma due vani diversi restano due note: si deduplica il doppione, non il fatto', () => {
    /* Il rischio della deduplica è tacere una segnalazione vera. Qui la
       merce sta in due posti bloccati per lo stesso motivo, e l'operatore
       deve saperlo di tutti e due. */
    magazzino([WIP, WIP]);
    const ALTRO = 'MAG1-WIP-02';
    const prima = Store.getItemByKey;
    Store.getItemByKey = () => [
      { item_key: 'A#L1', article_code: 'A', lot_code: 'L1', location_code: WIP, qty: 5 },
      { item_key: 'A#L1', article_code: 'A', lot_code: 'L1', location_code: WIP, qty: 5 },
      { item_key: 'A#L1', article_code: 'A', lot_code: 'L1', location_code: ALTRO, qty: 5 },
    ];
    Store.isItemQuarantined = (_k, loc) => loc === ALTRO;
    const p = PickRoute.build(RIGA);
    Store.getItemByKey = prima;
    expect(p.notes.filter((x) => x.location_code === WIP)).toHaveLength(1);
    expect(p.notes.filter((x) => x.location_code === ALTRO)).toHaveLength(1);
  });

  it('SE IL VANO WIP È L’UNICA UBICAZIONE, NON NASCE NESSUNA TAPPA', () => {
    magazzino([WIP]);
    const p = PickRoute.build(RIGA);
    expect(p.stops).toHaveLength(0);
    expect(p.offroute).toHaveLength(1);
    expect(p.offroute[0].reason).toBe('in_lavorazione');
    expect(p.offroute[0].detail).toMatch(/reparto produzione/i);
  });

  it('e il motivo NON è «in quarantena o impegnata su un DDT», che sarebbe falso', () => {
    magazzino([WIP]);
    expect(PickRoute.build(RIGA).offroute[0].reason).not.toBe('all_blocked');
  });

  it('senza area WIP configurata non cambia niente: il vano non esiste', () => {
    magazzino([SCAFFALE, WIP], '');
    const p = PickRoute.build(RIGA);
    expect(p.stops).toHaveLength(1);
    expect(p.notes.filter((x) => x.reason === 'in_lavorazione')).toHaveLength(0);
  });

  it('un vano bloccato per altri motivi resta «all_blocked»: il motivo è di chi blocca', () => {
    magazzino([SCAFFALE]);
    Store.isItemQuarantined = () => true;
    const p = PickRoute.build(RIGA);
    expect(p.offroute[0].reason).toBe('all_blocked');
  });

  it('ogni motivo ha la sua etichetta, o l’avviso mostrerebbe un codice', () => {
    expect(PickRoute.REASON_LABELS.in_lavorazione).toBeTruthy();
  });
});
