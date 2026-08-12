/* Lo stato di una cella, e i numeri che ne escono.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   `statoUbicazione` è letta da mezzo applicativo — mappa, prelievo,
   posizionamento, verifica di stoccaggio — e non aveva prove. Ci passa dentro
   la trappola 10 dell'HANDOFF, che è la ragione per cui la deroga della cella
   riservata funziona: se quell'ordine si rovescia, non scatta più. */

import { describe, it, expect } from 'vitest';
import { metaVuota, indiciVuoti, applicaAllaCache } from '../src/core/cache';
import { statoUbicazione, contaStati, calcolaKPI } from '../src/core/statistiche';

function magazzino() {
  const C = {
    sites: [], zones: [], articles: [], inventory: [],
    locStatus: new Map(), disabled: new Set(),
    movLog: [], quarantine: [], pendingOut: [],
    pickSession: null, pickArchive: [], disposalArchive: [], operators: [],
    movLogTotal: 0,
    lots: [], udc: [], tasks: [], wip: [], storageRules: [],
    meta: metaVuota(),
  };
  return { C, I: indiciVuoti() };
}

const merceIn = (C, I, code, _id = 1) =>
  applicaAllaCache(C, I, 'inventory', 'put',
    { _id, location_code: code, item_key: '700|L1', article_code: '700', lot_code: 'L1', qty: 1 });

describe('stato di una cella', () => {
  it('vuota se non c\'è niente, occupata se c\'è merce', () => {
    const { C, I } = magazzino();
    expect(statoUbicazione(C, I, 'DP-A-01')).toBe('empty');
    merceIn(C, I, 'DP-A-01');
    expect(statoUbicazione(C, I, 'DP-A-01')).toBe('occupied');
  });

  /* TRAPPOLA 10. Una cella Riservata con merce dentro resta `reserved`: è la
     riga su cui poggia la deroga della cella riservata, e senza di lei quella
     deroga non scatterebbe mai. */
  it('uno stato esplicito vince su «occupata», anche con merce dentro', () => {
    const { C, I } = magazzino();
    merceIn(C, I, 'DP-A-01');
    C.locStatus.set('DP-A-01', { location_code: 'DP-A-01', status: 'reserved' });
    expect(statoUbicazione(C, I, 'DP-A-01')).toBe('reserved');
    C.locStatus.set('DP-A-01', { location_code: 'DP-A-01', status: 'blocked' });
    expect(statoUbicazione(C, I, 'DP-A-01')).toBe('blocked');
  });

  /* E «disattivata» vince su tutto: una cella che non c'è più non è né
     bloccata né occupata, qualunque cosa dica il resto. */
  it('disattivata vince anche su uno stato esplicito', () => {
    const { C, I } = magazzino();
    merceIn(C, I, 'DP-A-01');
    C.locStatus.set('DP-A-01', { location_code: 'DP-A-01', status: 'blocked' });
    C.disabled.add('DP-A-01');
    expect(statoUbicazione(C, I, 'DP-A-01')).toBe('disabled');
  });

  it('una cella che non esiste è vuota, non un errore', () => {
    const { C, I } = magazzino();
    expect(statoUbicazione(C, I, 'MAI-VISTA')).toBe('empty');
  });
});

describe('conteggio degli stati', () => {
  it('i cinque numeri sommano sempre al totale', () => {
    const { C, I } = magazzino();
    merceIn(C, I, 'DP-A-01', 1);
    merceIn(C, I, 'DP-A-02', 2);
    C.locStatus.set('DP-A-03', { location_code: 'DP-A-03', status: 'blocked' });
    C.locStatus.set('DP-A-04', { location_code: 'DP-A-04', status: 'reserved' });
    C.disabled.add('DP-A-05');

    const c = contaStati(C, I, ['DP-A-01', 'DP-A-02', 'DP-A-03', 'DP-A-04', 'DP-A-05', 'DP-A-06']);
    expect(c).toEqual({ total: 6, occupied: 2, blocked: 1, reserved: 1, disabled: 1, empty: 1 });
    expect(c.occupied + c.blocked + c.reserved + c.disabled + c.empty).toBe(c.total);
  });

  /* `empty` si calcola per differenza: se domani nascesse uno stato in più,
     i numeri continuerebbero a sommare invece di perdere celle per strada. */
  it('uno stato sconosciuto non fa sparire la cella dal totale', () => {
    const { C, I } = magazzino();
    C.locStatus.set('DP-A-01', { location_code: 'DP-A-01', status: 'in_verifica' });
    const c = contaStati(C, I, ['DP-A-01']);
    expect(c.total).toBe(1);
    expect(c.occupied + c.blocked + c.reserved + c.disabled + c.empty).toBe(1);
  });

  it('un elenco vuoto dà zeri, non un errore', () => {
    const { C, I } = magazzino();
    expect(contaStati(C, I, [])).toEqual({ total: 0, occupied: 0, blocked: 0, reserved: 0, disabled: 0, empty: 0 });
  });
});

describe('cruscotto', () => {
  const ORA = new Date('2026-08-12T14:00:00').getTime();
  const OGGI = new Date('2026-08-12T09:30:00').getTime();
  const mov = (ts, type, article_code = '700') => ({ _id: ts, ts, type, article_code, user: 'AS' });

  function conMagazzino() {
    const { C, I } = magazzino();
    C.sites = [{ _id: 1, id: 'DP', name: 'Deposito', active: true, zones: [
      { _id: 1, site_id: 'DP', id: 'A', name: 'Corsia A', type: 'BULK', positions: 4, active: true },
      { _id: 2, site_id: 'DP', id: 'X', name: 'Vecchia', type: 'BULK', positions: 9, active: false },
    ] }];
    return { C, I };
  }

  it('conta solo le zone attive, e le celle occupate davvero', () => {
    const { C, I } = conMagazzino();
    merceIn(C, I, 'DP-A-01', 1);
    merceIn(C, I, 'DP-A-02', 2);
    const k = calcolaKPI(C, I, ORA);
    expect(k.totalLocs).toBe(4);              // la zona disattivata non c'è
    expect(k.occupiedLocs).toBe(2);
    expect(k.emptyLocs).toBe(2);
    expect(k.occPct).toBe(50);
    expect(k.zoneSummaries).toHaveLength(1);
    expect(k.zoneSummaries[0].zoneId).toBe('A');
  });

  it('un magazzino senza celle non divide per zero', () => {
    const { C, I } = magazzino();
    const k = calcolaKPI(C, I, ORA);
    expect(k.totalLocs).toBe(0);
    expect(k.occPct).toBe(0);
    expect(k.accuracyPct).toBe(100);          // niente da correggere = niente errori
  });

  /* Due prelievi a meno di cinque minuti sono lo stesso giro: è così che si
     contano i giri senza che l'ODP debba dirlo. */
  it('raggruppa i prelievi vicini nel tempo in un giro solo', () => {
    const { C, I } = conMagazzino();
    C.movLog = [
      mov(OGGI, 'PICK'), mov(OGGI + 60000, 'PICK'), mov(OGGI + 120000, 'PICK'),
      mov(OGGI + 3600000, 'PICK'),
    ];
    const k = calcolaKPI(C, I, ORA);
    expect(k.pickOrders).toBe(2);
    expect(k.todayPick).toBe(4);
  });

  it('un giro di un prelievo solo dura almeno dieci secondi, non zero', () => {
    const { C, I } = conMagazzino();
    C.movLog = [mov(OGGI, 'PICK')];
    const k = calcolaKPI(C, I, ORA);
    expect(k.pickOrders).toBe(1);
    expect(k.avgPickTimeOrder).toBe(10);
  });

  /* Il denominatore dell'accuratezza sono le correzioni più i posizionamenti,
     non tutti i movimenti: uno spostamento non è un'occasione di contare male. */
  it('l\'accuratezza guarda le correzioni sui posizionamenti, non sugli spostamenti', () => {
    const { C, I } = conMagazzino();
    C.movLog = [
      mov(OGGI, 'IN'), mov(OGGI, 'IN'), mov(OGGI, 'IN'),
      mov(OGGI, 'FIX+'),
      mov(OGGI, 'MOVE'), mov(OGGI, 'MOVE'), mov(OGGI, 'MOVE'),
    ];
    /* 1 correzione su (1 + 3) occasioni = 75%. Se contasse gli spostamenti
       il numero salirebbe da solo ogni volta che si sposta un pallet. */
    expect(calcolaKPI(C, I, ORA).accuracyPct).toBe(75);
  });

  it('la tendenza è di quattordici giorni e l\'ultimo è oggi', () => {
    const { C, I } = conMagazzino();
    C.movLog = [mov(OGGI, 'IN')];
    const k = calcolaKPI(C, I, ORA);
    expect(k.dailyTrend).toHaveLength(14);
    expect(k.dailyTrend[13].label).toBe('12/08');
    expect(k.dailyTrend[13].total).toBe(1);
    expect(k.dailyTrend[0].total).toBe(0);
  });

  it('la distribuzione oraria ha ventiquattro caselle e conta solo oggi', () => {
    const { C, I } = conMagazzino();
    C.movLog = [mov(OGGI, 'IN'), mov(OGGI - 3 * 86400000, 'IN')];
    const k = calcolaKPI(C, I, ORA);
    expect(k.hourlyDist).toHaveLength(24);
    expect(k.hourlyDist.reduce((s, n) => s + n, 0)).toBe(1);
    expect(k.hourlyDist[9]).toBe(1);
  });

  it('gli articoli più movimentati sono al massimo otto, dal più mosso', () => {
    const { C, I } = conMagazzino();
    C.movLog = [];
    for (let a = 1; a <= 10; a++) {
      for (let n = 0; n < a; n++) C.movLog.push(mov(OGGI + a * 1000 + n, 'IN', `ART-${a}`));
    }
    const top = calcolaKPI(C, I, ORA).topArticles;
    expect(top).toHaveLength(8);
    expect(top[0]).toEqual({ code: 'ART-10', count: 10 });
    expect(top[7]).toEqual({ code: 'ART-3', count: 3 });
  });
});
