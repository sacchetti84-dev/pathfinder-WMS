/* Il punto unico di mutazione della cache, finalmente collaudato.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Diciannove collezioni, ogni scrittura ci passa, e fino alla 1.4.0 non aveva
   nessuna prova — era l'aperto #6. Il motivo per cui non ce l'aveva è che per
   raggiungerlo bisognava costruire mezzo applicativo: `Store`, `Persistence`,
   un supporto. Adesso che sta in `core/cache.ts` si collauda da fermo.

   Quello che si prova qui non è «funziona»: è che le cinque FORME si comportano
   ognuna a modo suo e che gli indici derivati restano allineati alla cache
   qualunque cosa succeda. Un indice che diverge dalla cache è il modo di
   leggere un saldo sbagliato ma plausibile. */

import { describe, it, expect, beforeEach } from 'vitest';
import { COLLEZIONI } from '../src/core/../types/collezioni';
import {
  FORMA_CACHE, applicaAllaCache, ricostruisciIndici,
  indiciVuoti, metaVuota, bucketPut, bucketDelete, chiaveLotto, indicizzaGiacenza,
} from '../src/core/cache';

function cacheVuota() {
  return {
    sites: [], zones: [], articles: [], inventory: [],
    locStatus: new Map(), disabled: new Set(),
    movLog: [], quarantine: [], pendingOut: [],
    pickSessions: [], pickArchive: [], disposalArchive: [], operators: [],
    movLogTotal: 0,
    lots: [], udc: [], tasks: [], wip: [], storageRules: [],
    meta: metaVuota(),
  };
}

let C, I;
const applica = (col, op, rec) => applicaAllaCache(C, I, col, op, rec);
const giacenza = (_id, location_code, item_key, qty = 1) =>
  ({ _id, location_code, item_key, article_code: item_key.split('|')[0], lot_code: item_key.split('|')[1], qty });
const lotto = (_id, article_code, lot_code, uom_per_collo = 1000) =>
  ({ _id, article_code, lot_code, uom: 'PZ', uom_per_collo, frozen_at: 1 });

beforeEach(() => { C = cacheVuota(); I = indiciVuoti(); });

describe('la mappa delle forme', () => {
  /* Il `satisfies` in cache.ts lo garantisce a compilazione, ma il compilatore
     non gira in produzione e questo file sì. */
  it('copre tutte e diciannove le collezioni, e nessuna in più', () => {
    expect(Object.keys(FORMA_CACHE).sort()).toEqual([...COLLEZIONI].sort());
  });

  it('ogni forma che ha bisogno di una chiave ce l\'ha', () => {
    for (const [nome, f] of Object.entries(FORMA_CACHE)) {
      if (f.kind === 'single') continue;
      expect(f.key, `${nome} senza chiave`).toBeTruthy();
    }
  });

  it('una collezione sconosciuta non passa in silenzio', () => {
    expect(() => applica('inesistente', 'put', {})).toThrow(/senza mappatura/);
  });

  it('un\'operazione sconosciuta non passa in silenzio', () => {
    expect(() => applica('sites', 'upsert', { _id: 1 })).toThrow(/non supportata/);
  });

  it('put e delete senza record non passano in silenzio', () => {
    expect(() => applica('sites', 'put')).toThrow(/senza record/);
    expect(() => applica('sites', 'delete')).toThrow(/senza record/);
  });
});

describe('forma list', () => {
  it('inserisce in coda dove l\'elenco si legge dall\'inizio', () => {
    applica('sites', 'put', { _id: 1, id: 'A' });
    applica('sites', 'put', { _id: 2, id: 'B' });
    expect(C.sites.map(s => s.id)).toEqual(['A', 'B']);
  });

  /* Il registro si legge dal più recente: se questo si rovescia, quattro
     schermate mostrano per prima la riga più vecchia. */
  it('inserisce in testa nei registri cronologici', () => {
    applica('mov_log', 'put', { _id: 1, ts: 100 });
    applica('mov_log', 'put', { _id: 2, ts: 200 });
    expect(C.movLog.map(m => m._id)).toEqual([2, 1]);
  });

  it('sostituisce sul posto invece di duplicare', () => {
    applica('sites', 'put', { _id: 1, id: 'A', name: 'primo' });
    applica('sites', 'put', { _id: 2, id: 'B' });
    applica('sites', 'put', { _id: 1, id: 'A', name: 'secondo' });
    expect(C.sites).toHaveLength(2);
    expect(C.sites[0].name).toBe('secondo');
    expect(C.sites[0]._id).toBe(1);      // resta al suo posto, non salta in coda
  });

  it('cancella, e cancellare due volte non rompe niente', () => {
    applica('sites', 'put', { _id: 1, id: 'A' });
    applica('sites', 'delete', { _id: 1, id: 'A' });
    applica('sites', 'delete', { _id: 1, id: 'A' });
    expect(C.sites).toEqual([]);
  });

  it('usa la chiave giusta per collezione, non sempre _id', () => {
    applica('udc', 'put', { udc_id: 'UDC-1', status: 'open' });
    applica('udc', 'put', { udc_id: 'UDC-1', status: 'closed' });
    expect(C.udc).toHaveLength(1);
    expect(C.udc[0].status).toBe('closed');
  });
});

describe('forma map, set, single, kv', () => {
  it('map: chiave testuale, sostituisce e cancella', () => {
    applica('loc_status', 'put', { location_code: 'DP-A-01', status: 'blocked' });
    expect(C.locStatus.get('DP-A-01').status).toBe('blocked');
    applica('loc_status', 'put', { location_code: 'DP-A-01', status: 'reserved' });
    expect(C.locStatus.size).toBe(1);
    expect(C.locStatus.get('DP-A-01').status).toBe('reserved');
    applica('loc_status', 'delete', { location_code: 'DP-A-01' });
    expect(C.locStatus.size).toBe(0);
  });

  it('set: tiene il codice e non il record', () => {
    applica('disabled', 'put', { location_code: 'DP-A-01' });
    applica('disabled', 'put', { location_code: 'DP-A-01' });
    expect([...C.disabled]).toEqual(['DP-A-01']);
    applica('disabled', 'delete', { location_code: 'DP-A-01' });
    expect(C.disabled.size).toBe(0);
  });

  /* 2.30 — LE SESSIONI ERANO UNA SOLA, E QUESTA PROVA LO PRETENDEVA.
     Fino alla 2.29 `pick_session` era di forma `single`: una seconda `put`
     sostituiva la prima, e `delete` azzerava il campo. Era il riflesso in
     cache della regola «un percorso per tutto l'impianto».

     Dalla 2.30 il prelievo nasce da un'attivita' presa in carico e due
     operatori possono prenderne due insieme: la forma e' `list`, chiave
     `session_id`. Il caso che conta e' il terzo — chiuderne una lascia
     l'altra dov'e'. Con la forma vecchia quella riga era impossibile da
     scrivere, ed e' esattamente il lavoro che si perdeva. */
  it('list: due sessioni convivono, e chiuderne una non tocca l\'altra', () => {
    applica('pick_session', 'put', { session_id: 'S1', status: 'active', operator: 'AS' });
    applica('pick_session', 'put', { session_id: 'S2', status: 'active', operator: 'MR' });
    expect(C.pickSessions.map(x => x.session_id)).toEqual(['S1', 'S2']);

    applica('pick_session', 'delete', { session_id: 'S1' });
    expect(C.pickSessions.map(x => x.session_id)).toEqual(['S2']);
  });

  it('e una put sulla stessa chiave aggiorna, non duplica', () => {
    applica('pick_session', 'put', { session_id: 'S1', status: 'active' });
    applica('pick_session', 'put', { session_id: 'S1', status: 'active', odp_num: 'ODP9' });
    expect(C.pickSessions).toHaveLength(1);
    expect(C.pickSessions[0].odp_num).toBe('ODP9');
  });

  it('kv: scrive il VALORE, non il record', () => {
    applica('meta', 'put', { key: 'lastModified', value: 1234 });
    expect(C.meta.lastModified).toBe(1234);
    applica('meta', 'put', { key: 'feature.udc', value: true });
    expect(C.meta['feature.udc']).toBe(true);
    applica('meta', 'delete', { key: 'feature.udc' });
    expect('feature.udc' in C.meta).toBe(false);
  });
});

describe('clear', () => {
  it('azzera ogni forma con il contenitore giusto, non con undefined', () => {
    applica('sites', 'put', { _id: 1, id: 'A' });
    applica('loc_status', 'put', { location_code: 'X', status: 'blocked' });
    applica('disabled', 'put', { location_code: 'X' });
    applica('pick_session', 'put', { session_id: 'S1' });
    applica('meta', 'put', { key: 'lastModified', value: 9 });

    for (const c of COLLEZIONI) applica(c, 'clear');

    expect(C.sites).toEqual([]);
    expect(C.locStatus).toBeInstanceOf(Map);
    expect(C.locStatus.size).toBe(0);
    expect(C.disabled).toBeInstanceOf(Set);
    expect(C.disabled.size).toBe(0);
    expect(C.pickSessions).toEqual([]);
    expect(C.meta.lastModified).toBeNull();
  });

  /* resetAll() passa da qui su tutte e 19: se una sola non fosse dichiarata,
     l'azzeramento morirebbe a metà lasciando il magazzino in due stati. */
  it('nessuna delle diciannove collezioni fa eccezione', () => {
    for (const c of COLLEZIONI) expect(() => applica(c, 'clear')).not.toThrow();
  });

  it('azzerare inventory, articles e lots butta via anche i loro indici', () => {
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L1'));
    applica('articles', 'put', { _id: 1, code: '700' });
    applica('lots', 'put', lotto(1, '700', 'L1'));
    applica('inventory', 'clear');
    applica('articles', 'clear');
    applica('lots', 'clear');
    expect(I.invByLoc.size).toBe(0);
    expect(I.invByKey.size).toBe(0);
    expect(I.artByCode.size).toBe(0);
    expect(I.lotByKey.size).toBe(0);
  });
});

describe('indici della giacenza', () => {
  it('una riga entra in tutti e due i bucket', () => {
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L1'));
    expect(I.invByLoc.get('DP-A-01')).toHaveLength(1);
    expect(I.invByKey.get('700|L1')).toHaveLength(1);
  });

  /* Il caso che conta: la merce si sposta. Senza il confronto con `prev` la
     riga resterebbe anche nel bucket vecchio, e il saldo per ubicazione
     direbbe che la merce è in due posti. */
  it('spostare una riga la toglie dall\'ubicazione di prima', () => {
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L1'));
    applica('inventory', 'put', giacenza(1, 'DP-B-02', '700|L1'));
    expect(I.invByLoc.has('DP-A-01')).toBe(false);
    expect(I.invByLoc.get('DP-B-02')).toHaveLength(1);
    expect(I.invByKey.get('700|L1')).toHaveLength(1);
    expect(C.inventory).toHaveLength(1);
  });

  it('cambiare articolo/lotto la toglie dalla chiave di prima', () => {
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L1'));
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L2'));
    expect(I.invByKey.has('700|L1')).toBe(false);
    expect(I.invByKey.get('700|L2')).toHaveLength(1);
    expect(I.invByLoc.get('DP-A-01')).toHaveLength(1);
  });

  it('due articoli nella stessa ubicazione stanno nello stesso bucket', () => {
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L1'));
    applica('inventory', 'put', giacenza(2, 'DP-A-01', '701|L9'));
    expect(I.invByLoc.get('DP-A-01')).toHaveLength(2);
  });

  it('il bucket vuoto sparisce invece di restare a zero elementi', () => {
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L1'));
    applica('inventory', 'delete', giacenza(1, 'DP-A-01', '700|L1'));
    expect(I.invByLoc.has('DP-A-01')).toBe(false);
    expect(I.invByKey.has('700|L1')).toBe(false);
  });

  it('cancellarne una lascia in piedi l\'altra', () => {
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L1'));
    applica('inventory', 'put', giacenza(2, 'DP-A-01', '701|L9'));
    applica('inventory', 'delete', giacenza(1, 'DP-A-01', '700|L1'));
    expect(I.invByLoc.get('DP-A-01').map(r => r._id)).toEqual([2]);
  });
});

describe('indice degli articoli', () => {
  it('indicizza per codice, non per _id', () => {
    applica('articles', 'put', { _id: 1, code: '700', description: 'Uno' });
    expect(I.artByCode.get('700').description).toBe('Uno');
  });

  /* Un articolo disattivato non deve più essere proposto, ma la sua riga
     serve ancora a leggere le descrizioni dello storico. */
  it('l\'articolo disattivato esce dall\'indice e resta in cache', () => {
    applica('articles', 'put', { _id: 1, code: '700', active: true });
    applica('articles', 'put', { _id: 1, code: '700', active: false });
    expect(I.artByCode.has('700')).toBe(false);
    expect(C.articles).toHaveLength(1);
  });

  it('riattivarlo lo rimette nell\'indice', () => {
    applica('articles', 'put', { _id: 1, code: '700', active: false });
    applica('articles', 'put', { _id: 1, code: '700', active: true });
    expect(I.artByCode.has('700')).toBe(true);
  });

  it('cancellarlo lo toglie da tutti e due', () => {
    applica('articles', 'put', { _id: 1, code: '700' });
    applica('articles', 'delete', { _id: 1, code: '700' });
    expect(I.artByCode.has('700')).toBe(false);
    expect(C.articles).toEqual([]);
  });
});

/* 1.4.2 — la confezione congelata si legge a ogni riga di giacenza, e `lots`
   cresce di un record per ogni lotto mai posizionato: senza indice sarebbe
   una scansione per riga a schermata. */
describe('indice dei lotti', () => {
  it('indicizza per articolo#lotto, non per _id', () => {
    applica('lots', 'put', lotto(1, '700', 'L1'));
    expect(I.lotByKey.get('700#L1').uom_per_collo).toBe(1000);
  });

  it('la chiave alza il codice e lascia stare il lotto, come item_key', () => {
    expect(chiaveLotto(' 700 ', ' l1 ')).toBe('700#l1');
  });

  it('ricongelare lo stesso lotto sostituisce, non accoda', () => {
    applica('lots', 'put', lotto(1, '700', 'L1', 1000));
    applica('lots', 'put', lotto(1, '700', 'L1', 500));
    expect(C.lots).toHaveLength(1);
    expect(I.lotByKey.get('700#L1').uom_per_collo).toBe(500);
  });

  /* Stessa ragione del `prev` sulla giacenza: senza, la chiave vecchia resta
     appesa e due lotti diversi risponderebbero con la stessa confezione. */
  it('cambiare articolo o lotto toglie la chiave di prima', () => {
    applica('lots', 'put', lotto(1, '700', 'L1'));
    applica('lots', 'put', lotto(1, '700', 'L2'));
    expect(I.lotByKey.has('700#L1')).toBe(false);
    expect(I.lotByKey.get('700#L2')._id).toBe(1);
    expect(C.lots).toHaveLength(1);
  });

  it('cancellarlo lo toglie da tutti e due', () => {
    applica('lots', 'put', lotto(1, '700', 'L1'));
    applica('lots', 'delete', lotto(1, '700', 'L1'));
    expect(I.lotByKey.has('700#L1')).toBe(false);
    expect(C.lots).toEqual([]);
  });

  it('due lotti dello stesso articolo sono due confezioni', () => {
    applica('lots', 'put', lotto(1, '700', 'L1', 1000));
    applica('lots', 'put', lotto(2, '700', 'L2', 250));
    expect(I.lotByKey.size).toBe(2);
    expect(I.lotByKey.get('700#L2').uom_per_collo).toBe(250);
  });
});

describe('ricostruzione degli indici', () => {
  /* Le tre eccezioni — idratazione, cancellazione per prefisso, purga —
     non passano da applicaAllaCache e finiscono qui. Se il risultato non
     coincide con quello delle mutazioni una per una, la cache diverge dopo
     ogni import. */
  it('dà lo stesso risultato delle mutazioni una per una', () => {
    const righe = [
      giacenza(1, 'DP-A-01', '700|L1'),
      giacenza(2, 'DP-A-01', '701|L9'),
      giacenza(3, 'DP-B-02', '700|L1'),
    ];
    for (const r of righe) applica('inventory', 'put', r);
    applica('articles', 'put', { _id: 1, code: '700' });
    applica('articles', 'put', { _id: 2, code: '701', active: false });
    applica('lots', 'put', lotto(1, '700', 'L1'));
    applica('lots', 'put', lotto(2, '701', 'L9', 250));

    const primaLoc = new Map([...I.invByLoc].map(([k, v]) => [k, v.map(r => r._id)]));
    const primaKey = new Map([...I.invByKey].map(([k, v]) => [k, v.map(r => r._id)]));
    const primaArt = [...I.artByCode.keys()];
    const primaLot = [...I.lotByKey.keys()];

    ricostruisciIndici(C, I);

    expect(new Map([...I.invByLoc].map(([k, v]) => [k, v.map(r => r._id)]))).toEqual(primaLoc);
    expect(new Map([...I.invByKey].map(([k, v]) => [k, v.map(r => r._id)]))).toEqual(primaKey);
    expect([...I.artByCode.keys()]).toEqual(primaArt);
    expect([...I.lotByKey.keys()]).toEqual(primaLot);
  });

  it('parte da zero: non somma agli indici che c\'erano', () => {
    applica('inventory', 'put', giacenza(1, 'DP-A-01', '700|L1'));
    C.inventory = [];
    ricostruisciIndici(C, I);
    expect(I.invByLoc.size).toBe(0);
  });
});

describe('i bucket, da soli', () => {
  it('bucketPut sostituisce per _id invece di accodare un doppione', () => {
    const m = new Map();
    bucketPut(m, 'X', { _id: 1, v: 'a' });
    bucketPut(m, 'X', { _id: 1, v: 'b' });
    expect(m.get('X')).toHaveLength(1);
    expect(m.get('X')[0].v).toBe('b');
  });

  it('una chiave assente non crea un bucket fantasma', () => {
    const m = new Map();
    bucketPut(m, undefined, { _id: 1 });
    bucketPut(m, null, { _id: 2 });
    expect(m.size).toBe(0);
  });

  it('bucketDelete su una chiave che non c\'è non rompe niente', () => {
    const m = new Map();
    expect(() => bucketDelete(m, 'X', { _id: 1 })).not.toThrow();
    expect(m.size).toBe(0);
  });
});

describe('le cinque collezioni della 1.4', () => {
  /* Nascono vuote in Fase 0. La prova che «una collezione nuova si dichiara,
     non si programma» è che funzionano senza una riga di codice dedicata. */
  const casi = [
    ['lots', { _id: 1, article_code: '700', lot_code: 'L1' }, 'lots'],
    ['udc', { udc_id: 'UDC-1', status: 'open' }, 'udc'],
    ['tasks', { task_id: 'T-1', type: 'TRANSFER', priority: 3 }, 'tasks'],
    ['wip', { wip_id: 'W-1', odp_num: 'ODP-1', item_key: '700|L1', qty: 2 }, 'wip'],
    ['storage_rules', { rule_id: 'R-1', priority: 1, attiva: true }, 'storageRules'],
  ];

  for (const [collezione, record, campo] of casi) {
    it(`${collezione}: scrive, sostituisce, cancella e si azzera`, () => {
      const chiave = FORMA_CACHE[collezione].key;
      applica(collezione, 'put', record);
      expect(C[campo]).toHaveLength(1);

      applica(collezione, 'put', { ...record, marcato: true });
      expect(C[campo]).toHaveLength(1);
      expect(C[campo][0].marcato).toBe(true);

      applica(collezione, 'delete', { [chiave]: record[chiave] });
      expect(C[campo]).toEqual([]);

      applica(collezione, 'put', record);
      applica(collezione, 'clear');
      expect(C[campo]).toEqual([]);
    });
  }
});

/* 2.0 — la trappola dell'aliasing, che al banco ha fatto risultare la merce
   in due vani insieme dopo lo spostamento di un'unita' di carico. */
describe('indicizzaGiacenza — la riga spostata esce dal bucket vecchio', () => {
  const riga = (extra = {}) => ({
    _id: extra._id ?? 1, item_key: extra.key ?? 'A#L1',
    article_code: 'A', lot_code: extra.lot ?? 'L1',
    location_code: extra.loc ?? 'V1', qty: extra.qty ?? 1,
  });

  it('cambiando ubicazione la riga sta in UN solo bucket', () => {
    const indici = indiciVuoti();
    const prima = riga({ loc: 'V1' });
    indicizzaGiacenza(indici, null, prima);
    expect(indici.invByLoc.get('V1')).toHaveLength(1);

    const dopo = { ...prima, location_code: 'V2' };
    indicizzaGiacenza(indici, prima, dopo);
    expect(indici.invByLoc.get('V1')).toBeUndefined();
    expect(indici.invByLoc.get('V2')).toHaveLength(1);
  });

  it('LO STESSO OGGETTO PASSATO DUE VOLTE non si puo riparare, e chi sposta deve saperlo', () => {
    const indici = indiciVuoti();
    const r = riga({ loc: 'V1' });
    indicizzaGiacenza(indici, null, r);
    /* Questo e' il gesto sbagliato: si modifica l'oggetto che la cache gia'
       tiene e lo si ripassa. `prev` e `next` sono lo stesso oggetto, il
       confronto non ha piu' niente da confrontare, e la riga resta di la'.
       La prova sta qui per fissare il comportamento: chi sposta una riga
       scrive un oggetto nuovo — vedi `moveUdc`. */
    r.location_code = 'V2';
    indicizzaGiacenza(indici, r, r);
    expect(indici.invByLoc.get('V1')).toHaveLength(1);
    expect(indici.invByLoc.get('V2')).toHaveLength(1);
  });

  it('cambiando articolo o lotto la riga esce anche dal bucket della chiave', () => {
    const indici = indiciVuoti();
    const prima = riga({ key: 'A#L1' });
    indicizzaGiacenza(indici, null, prima);
    const dopo = { ...prima, item_key: 'A#L2', lot_code: 'L2' };
    indicizzaGiacenza(indici, prima, dopo);
    expect(indici.invByKey.get('A#L1')).toBeUndefined();
    expect(indici.invByKey.get('A#L2')).toHaveLength(1);
  });
});
