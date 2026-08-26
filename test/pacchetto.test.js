/* Il pacchetto di export, finalmente collaudato.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   È il percorso di backup e ripristino: cioè quello che si usa il giorno in
   cui è già andato storto qualcos'altro. Fino alla 1.4.0 non aveva nessuna
   prova, e la ragione è la solita — per raggiungerlo bisognava costruire
   mezzo applicativo.

   Le due domande a cui questo file risponde:
     · un backup che sembra completo, lo è?
     · un ripristino lascia il magazzino nello stato del file, o in una
       miscela fra il file e ciò che c'era prima? */

import { describe, it, expect } from 'vitest';
import { COLLEZIONI } from '../src/types/collezioni';
import { metaVuota } from '../src/core/cache';
import {
  FORMATO, COLLEZIONI_EXPORT, componi, conta, verifica, righeDaScrivere,
  impostazioni, IMPOSTAZIONI_ESPORTATE,
} from '../src/core/pacchetto';

function cache(sovrascrivi = {}) {
  return {
    sites: [], zones: [], articles: [], inventory: [],
    locStatus: new Map(), disabled: new Set(),
    movLog: [], quarantine: [], pendingOut: [],
    pickSession: null, pickArchive: [], disposalArchive: [], operators: [],
    movLogTotal: 0,
    lots: [], udc: [], tasks: [], wip: [], storageRules: [], recipients: [],
    locAttrs: new Map(),
    meta: metaVuota(),
    ...sovrascrivi,
  };
}

const mov = (ts) => ({ _id: ts, ts, type: 'IN', user: 'AS' });

describe('cosa entra nel pacchetto', () => {
  /* La prova che vale più di tutte: se una collezione manca dall'elenco, il
     backup sembra completo e non lo è, e il ripristino la lascia in piedi
     appesa a giacenze appena sostituite. */
  it('l\'elenco è tutte le collezioni meno meta e pick_session', () => {
    expect(COLLEZIONI_EXPORT).toHaveLength(COLLEZIONI.length - 2);
    expect(COLLEZIONI_EXPORT).not.toContain('meta');
    expect(COLLEZIONI_EXPORT).not.toContain('pick_session');
    for (const c of COLLEZIONI) {
      if (c !== 'meta' && c !== 'pick_session') expect(COLLEZIONI_EXPORT).toContain(c);
    }
  });

  it('le cinque collezioni della 1.4 sono nel pacchetto, anche vuote', () => {
    const p = componi(cache(), []);
    for (const c of ['lots', 'udc', 'tasks', 'wip', 'storage_rules']) {
      expect(p[c], c).toEqual([]);
      expect(p._counts[c], c).toBe(0);
    }
  });

  it('ogni collezione dell\'elenco compare nel pacchetto e nei conteggi', () => {
    const p = componi(cache(), []);
    for (const c of COLLEZIONI_EXPORT) {
      expect(Array.isArray(p[c]), c).toBe(true);
      expect(p._counts, c).toHaveProperty(c);
    }
  });

  /* LE UM E I COLLI VIAGGIANO NEL BACKUP, UNO PER UNO.
     `componi` copia le righe intere e non nomina un solo campo, quindi la
     prova non difende una riga di codice: difende il giorno in cui qualcuno,
     per alleggerire il file, si mette a scegliere le colonne. Un backup che
     riporta i colli e perde l'elenco delle pezzature ricostruisce un
     magazzino con lo stesso saldo e la corsia sbagliata, e la confezione
     congelata sul lotto — `lots` — è l'unico posto dove sta scritto in che
     unità quel saldo è espresso. */
  it('elenco dei colli, UM e confezione del lotto entrano nel pacchetto', () => {
    const riga = {
      _id: 1, location_code: 'DP-A-01', item_key: '700|L1', article_code: '700',
      lot_code: 'L1', qty: 11, qty_uom: 10900, packs: [1000, 1000, 900],
    };
    const p = componi(cache({
      inventory: [riga],
      lots: [{ _id: 1, article_code: '700', lot_code: 'L1', uom: 'KG', uom_per_collo: 1000 }],
    }), [{ _id: 1, ts: 100, type: 'IN', user: 'AS', qty_delta: 3, qty_uom_delta: 2900, uom: 'KG' }]);

    expect(p.inventory[0].packs).toEqual([1000, 1000, 900]);
    expect(p.inventory[0].qty_uom).toBe(10900);
    expect(p.lots[0].uom).toBe('KG');
    expect(p.lots[0].uom_per_collo).toBe(1000);
    expect(p.mov_log[0].qty_uom_delta).toBe(2900);
    expect(p.mov_log[0].uom).toBe('KG');

    /* E ci restano fino a scrivere: `righeDaScrivere` toglie `_id` e nient'altro. */
    const [scritta] = righeDaScrivere('inventory', p.inventory);
    expect(scritta.packs).toEqual([1000, 1000, 900]);
    expect(scritta.qty_uom).toBe(10900);
  });

  /* La sessione di prelievo APERTA non entra: un ripristino non deve
     riportare in vita un percorso che qualcuno aveva su un terminale. */
  it('la sessione di prelievo aperta non finisce nel backup', () => {
    const p = componi(cache({ pickSession: { session_id: 'S1', status: 'open' } }), []);
    expect(p.pick_session).toBeUndefined();
  });

  it('le zone appese ai siti escono: viaggiano come collezione loro', () => {
    const p = componi(cache({
      sites: [{ _id: 1, id: 'DP', name: 'Deposito', zones: [{ id: 'A' }] }],
      zones: [{ _id: 1, site_id: 'DP', id: 'A', name: 'Corsia A' }],
    }), []);
    expect(p.sites[0]).not.toHaveProperty('zones');
    expect(p.sites[0].id).toBe('DP');
    expect(p.zones).toHaveLength(1);
  });

  it('mappa e insieme diventano elenchi, che è la forma di un file', () => {
    const p = componi(cache({
      locStatus: new Map([['DP-A-01', { location_code: 'DP-A-01', status: 'blocked' }]]),
      disabled: new Set(['DP-A-02']),
    }), []);
    expect(p.loc_status).toEqual([{ location_code: 'DP-A-01', status: 'blocked' }]);
    expect(p.disabled).toEqual([{ location_code: 'DP-A-02' }]);
  });

  it('la configurazione dei documenti viaggia, il resto di meta no', () => {
    const meta = metaVuota();
    meta.docConfig = { sender: { name: 'Dietopack' } };
    meta['feature.udc'] = true;
    const p = componi(cache({ meta }), []);
    expect(p.doc_config).toEqual({ sender: { name: 'Dietopack' } });
    expect(p.meta).toBeUndefined();
    expect(p['feature.udc']).toBeUndefined();
  });

  it('senza configurazione documenti il campo è null, non assente', () => {
    expect(componi(cache(), []).doc_config).toBeNull();
  });
});

describe('il registro dei movimenti', () => {
  it('porta con sé l\'intervallo di date che copre', () => {
    const p = componi(cache(), [mov(300), mov(200), mov(100)]);
    expect(p._movRange).toEqual({ from: 100, to: 300 });
  });

  it('senza movimenti non dichiara un intervallo inventato', () => {
    expect(componi(cache(), [])._movRange).toBeUndefined();
  });

  /* OMISSIONE, NON DICHIARAZIONE. Un pacchetto che dice «mov_log: 0» afferma
     che movimenti non ce n'erano; qui invece non sono stati esportati, che è
     un'altra cosa. Il campo sparisce, e sparisce anche dai conteggi. */
  it('escluso il registro, il campo sparisce invece di valere zero', () => {
    const p = componi(cache(), [], { includeMovLog: false });
    expect('mov_log' in p).toBe(false);
    expect('mov_log' in p._counts).toBe(false);
  });

  /* L'ALTRA META' DELLA DISTINZIONE, e da questa dipende il ripristino.
     `Store.importAll` in overwrite svuota `mov_log` SOLO se il pacchetto lo
     nomina: chiave assente vuol dire «non lo porto» e il registro resta dov'e';
     elenco vuoto vuol dire «di movimenti non ce n'e' nessuno» e allora si
     svuota davvero. Se un giorno `componi` smettesse di scrivere `mov_log: []`
     per un magazzino senza movimenti, il ripristino non svuoterebbe piu' un
     registro che andrebbe svuotato — ed e' un difetto che nessuno vedrebbe. */
  it("un magazzino senza movimenti porta comunque un elenco vuoto, non l’assenza", () => {
    const p = componi(cache(), []);
    expect('mov_log' in p).toBe(true);
    expect(p.mov_log).toEqual([]);
    expect(p._counts.mov_log).toBe(0);
  });
});

describe('la verifica di un pacchetto che rientra', () => {
  const buono = () => componi(cache({
    articles: [{ _id: 1, code: '700' }],
    inventory: [{ _id: 1, location_code: 'DP-A-01', item_key: '700|L1', article_code: '700', lot_code: 'L1' }],
  }), [mov(1)]);

  it('un pacchetto appena composto si verifica da solo', () => {
    expect(verifica(buono())).toEqual({ ok: true, problemi: [] });
  });

  it('un file che non è un pacchetto viene respinto e lo dice', () => {
    expect(verifica(null).ok).toBe(false);
    expect(verifica('roba').ok).toBe(false);
    expect(verifica(42).problemi[0]).toMatch(/non leggibile/);
  });

  it('un formato diverso viene respinto per nome', () => {
    const p = buono(); p._format = 'qualcos-altro-v2';
    expect(verifica(p).problemi.join(' ')).toMatch(/qualcos-altro-v2/);
  });

  /* IL CASO CHE CONTA: un file troncato. I conteggi scritti dentro dicono una
     cosa, le righe ne dicono un'altra, e senza questo controllo il ripristino
     sostituirebbe il magazzino con metà magazzino. */
  it('un file troncato non passa: i conteggi non tornano', () => {
    const p = buono();
    p.inventory = [];
    const esito = verifica(p);
    expect(esito.ok).toBe(false);
    expect(esito.problemi.join(' ')).toMatch(/inventory: il file dichiara 1 record, ne contiene 0/);
  });

  it('un backup senza conteggi lo dice invece di fidarsi', () => {
    const p = buono(); delete p._counts;
    expect(verifica(p).problemi.join(' ')).toMatch(/conteggi di controllo/);
  });

  /* Un magazzino davvero vuoto esiste, ma è molto più probabile che sia il
     file sbagliato. Si segnala e si lascia decidere. */
  it('un pacchetto senza nessun record viene segnalato', () => {
    expect(verifica(componi(cache(), [])).problemi.join(' ')).toMatch(/non contiene alcun record/);
  });

  it('il formato è quello dichiarato, e non segue la versione dell\'applicativo', () => {
    const p = componi(cache(), []);
    expect(p._format).toBe(FORMATO);
    expect(p._format).not.toContain(p._appVersion);
  });
});

describe('le righe pronte da scrivere', () => {
  it('butta via l\'_id dove lo assegna il supporto', () => {
    const out = righeDaScrivere('articles', [{ _id: 7, code: '700' }]);
    expect(out).toEqual([{ code: '700' }]);
  });

  it('tiene la chiave testuale dove è il documento a portarla', () => {
    const out = righeDaScrivere('udc', [{ udc_id: 'UDC-1', status: 'open' }]);
    expect(out).toEqual([{ udc_id: 'UDC-1', status: 'open' }]);
  });

  it('sui siti cade anche zones, che in cache è ricostruito', () => {
    const out = righeDaScrivere('sites', [{ _id: 1, id: 'DP', zones: [{ id: 'A' }] }]);
    expect(out).toEqual([{ id: 'DP' }]);
  });

  it('non tocca l\'elenco che riceve', () => {
    const originale = [{ _id: 1, code: '700' }];
    righeDaScrivere('articles', originale);
    expect(originale[0]).toHaveProperty('_id', 1);
  });
});

describe('andata e ritorno', () => {
  /* La 1.2 gira sul database della 1.4 e viceversa (PIANO §5). Qui la metà
     che si può provare da fermo: un pacchetto senza i campi della 1.4 rientra,
     e uno con quei campi non li perde. */
  it('un pacchetto della 1.2 — senza le cinque nuove — si verifica lo stesso', () => {
    const p = componi(cache({ articles: [{ _id: 1, code: '700' }] }), []);
    for (const c of ['lots', 'udc', 'tasks', 'wip', 'storage_rules']) {
      delete p[c];
      delete p._counts[c];
    }
    expect(verifica(p).ok).toBe(true);
    expect(conta(p).udc).toBe(0);          // assente si legge come vuota
  });

  it('ciò che si esporta si ritrova, collezione per collezione', () => {
    const partenza = cache({
      articles: [{ _id: 1, code: '700', description: 'Uno' }],
      inventory: [{ _id: 1, location_code: 'DP-A-01', item_key: '700|L1', article_code: '700', lot_code: 'L1', qty: 5 }],
      udc: [{ udc_id: 'UDC-1', status: 'open' }],
      operators: [{ op_id: 'O1', first_name: 'A', last_name: 'S', initials: 'AS', role: 'leader' }],
    });
    const p = componi(partenza, [mov(1)]);

    for (const c of COLLEZIONI_EXPORT) {
      expect(p._counts[c], c).toBe(p[c].length);
    }
    /* Le quantità sono il minimo che deve sopravvivere a tutto. */
    expect(p.inventory[0].qty).toBe(5);
    expect(righeDaScrivere('inventory', p.inventory)[0].qty).toBe(5);
    expect(righeDaScrivere('udc', p.udc)[0].udc_id).toBe('UDC-1');
  });
});

/* 1.4.0 — Il pacchetto è una FOTOGRAFIA, non una finestra sulla cache.
   Fino a ieri conteneva il riferimento agli array veri: bastava che fra
   l'export e la serializzazione qualcuno posizionasse un collo perché il file
   cambiasse sotto i piedi di chi lo stava scrivendo. Il difetto è stato
   trovato convertendo `store.js`, provando un ripristino sul dev server. */
describe('il pacchetto non cambia sotto i piedi', () => {
  it('non tiene i riferimenti agli elenchi della cache', () => {
    const C = cache({ inventory: [{ _id: 1, location_code: 'DP-A-01', item_key: '700|L1', article_code: '700', lot_code: 'L1', qty: 1 }] });
    const p = componi(C, []);
    expect(p.inventory).not.toBe(C.inventory);
    expect(p.articles).not.toBe(C.articles);
    expect(p.udc).not.toBe(C.udc);
  });

  /* Il guaio vero non è la riga in più: è che `_counts` viene calcolato
     subito e il contenuto letto dopo. Se divergono, il pacchetto fallisce la
     PROPRIA verifica — e un controllo che grida al lupo su un backup sano è
     un controllo che si impara a ignorare. */
  it('una scrittura dopo l\'export non entra nel pacchetto né sfalsa i conteggi', () => {
    const C = cache({ inventory: [{ _id: 1, location_code: 'DP-A-01', item_key: '700|L1', article_code: '700', lot_code: 'L1', qty: 1 }] });
    const p = componi(C, []);

    C.inventory.push({ _id: 2, location_code: 'DP-B-02', item_key: '700|L2', article_code: '700', lot_code: 'L2', qty: 99 });

    expect(p.inventory).toHaveLength(1);
    expect(p._counts.inventory).toBe(1);
    expect(verifica(p).ok).toBe(true);
  });

  it('vale anche per il registro dei movimenti', () => {
    const movimenti = [mov(100)];
    const p = componi(cache(), movimenti);
    movimenti.push(mov(200));
    expect(p.mov_log).toHaveLength(1);
    expect(p._counts.mov_log).toBe(1);
  });
});


describe('le impostazioni viaggiano col backup', () => {
  /* Un ripristino che rimette le giacenze e lascia il magazzino senza area
     WIP ha rimesso i numeri e non il posto di lavoro. */
  const meta = {
    lastModified: 123, unsavedChanges: true,
    docConfig: { sender: { name: 'Dietopack Srl' } },
    areaWip: 'MAG1-WIP-01', udcPrefissoGS1: '1234567',
    dashboardLayout: { riquadri: [{ id: 'kpi' }] }, oreUrgenza: 8,
  };

  it('porta le impostazioni dichiarate', () => {
    expect(impostazioni(meta)).toEqual({
      docConfig: { sender: { name: 'Dietopack Srl' } },
      areaWip: 'MAG1-WIP-01', udcPrefissoGS1: '1234567',
      dashboardLayout: { riquadri: [{ id: 'kpi' }] }, oreUrgenza: 8,
    });
  });

  it('lascia fuori lo stato: ora di salvataggio e modifiche non salvate', () => {
    const out = impostazioni(meta);
    expect(out.lastModified).toBeUndefined();
    expect(out.unsavedChanges).toBeUndefined();
  });

  it('una chiave mai valorizzata non compare', () => {
    expect(impostazioni({ areaWip: '' })).toEqual({});
    expect(impostazioni(null)).toEqual({});
  });

  it('escono per nome, e i nomi sono quelli dell elenco', () => {
    const out = impostazioni({ ...meta, chiaveSconosciuta: 'x' });
    expect(Object.keys(out).every(k => IMPOSTAZIONI_ESPORTATE.includes(k))).toBe(true);
  });

  it('il pacchetto le porta, e `doc_config` resta dov era', () => {
    const p = componi(cache({ meta }), []);
    expect(p.impostazioni.areaWip).toBe('MAG1-WIP-01');
    expect(p.doc_config).toEqual(meta.docConfig);
  });

  it('non contano come record: `_counts` non cambia', () => {
    const conMeta = componi(cache({ meta }), []);
    const senza = componi(cache(), []);
    expect(conMeta._counts).toEqual(senza._counts);
    expect(verifica(conMeta).ok).toBe(verifica(senza).ok);
  });
});
