import { describe, it, expect } from 'vitest';
import {
  conto, consumo, daRendere, attivo, ubicazioneDi, colliFuori,
  rendiconto, misureDelReso, archiviato, ordiniArchiviati, righeSenzaOrdine,
} from '../src/modules/wip';
import { scelteDaMisure } from '../src/modules/colli';

const mov = (odp, key, verso, qty, extra = {}) => ({
  odp_num: odp, item_key: key, verso, qty,
  qty_uom: extra.uom ?? null, uom: extra.unita ?? null,
  article_code: key.split('#')[0], lot_code: key.split('#')[1],
});

describe('conto', () => {
  it('somma quello che entra in lavorazione e quello che torna', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-1', 'A#L1', 'out', 3),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ entrato: 10, tornato: 3, residuo: 7 });
  });

  it('i movimenti di un ALTRO ordine non entrano nel conto', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-2', 'A#L1', 'in', 99),
    ], 'ODP-1');
    expect(c.righe[0].entrato).toBe(10);
    expect(c.entrato).toBe(10);
  });

  it('una riga per item, anche con dieci viaggi', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 5), mov('ODP-1', 'A#L1', 'in', 5),
      mov('ODP-1', 'A#L1', 'out', 2), mov('ODP-1', 'B#L2', 'in', 1),
    ], 'ODP-1');
    expect(c.righe).toHaveLength(2);
    expect(c.righe[0]).toMatchObject({ item_key: 'A#L1', entrato: 10, tornato: 2, residuo: 8 });
  });

  it('le UM si sommano accanto ai colli, senza coda binaria', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 2, { uom: 0.1, unita: 'KG' }),
      mov('ODP-1', 'A#L1', 'in', 1, { uom: 0.2, unita: 'KG' }),
      mov('ODP-1', 'A#L1', 'out', 1, { uom: 0.1, unita: 'KG' }),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ entrato_uom: 0.3, tornato_uom: 0.1, residuo_uom: 0.2, uom: 'KG' });
  });

  it('una riga a soli colli non si inventa un saldo in UM', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 4)], 'ODP-1');
    expect(c.righe[0].residuo_uom).toBe(null);
  });

  it('TORNATO PIU DI QUANTO ENTRATO si mostra, non si nasconde', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 2), mov('ODP-1', 'A#L1', 'out', 5)], 'ODP-1');
    expect(c.incoerente).toBe(true);
    expect(c.righe[0].residuo).toBe(-3);
  });

  it('le righe escono in ordine di chiave: due letture si confrontano a occhio', () => {
    const c = conto([mov('ODP-1', 'C#L3', 'in', 1), mov('ODP-1', 'A#L1', 'in', 1)], 'ODP-1');
    expect(c.righe.map(r => r.item_key)).toEqual(['A#L1', 'C#L3']);
  });

  it('nessun movimento, nessun ordine: conto vuoto e nessun errore', () => {
    expect(conto([], 'ODP-1').righe).toEqual([]);
    expect(conto(null, 'ODP-1').righe).toEqual([]);
    expect(conto([mov('ODP-1', 'A#L1', 'in', 1)], '').righe).toEqual([]);
  });
});

describe('reso e consumo non sono la stessa cosa', () => {
  /* Alla prima prova al banco la chiusura contava come «tornato 1» merce
     che a magazzino non era tornata affatto: un saldo giusto con la parola
     sbagliata resta una bugia, e la legge chi cerca il consumo fra sei mesi. */
  it('il CONSUMO esce dal conto ma non e un reso', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-1', 'A#L1', 'consumo', 7),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ entrato: 10, tornato: 0, consumato: 7, residuo: 3 });
    expect(c.tornato).toBe(0);
    expect(c.consumato).toBe(7);
  });

  it('i due versi convivono sulla stessa riga', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-1', 'A#L1', 'out', 2),
      mov('ODP-1', 'A#L1', 'consumo', 8),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ tornato: 2, consumato: 8, residuo: 0 });
  });

  it('anche in UM restano separati', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 3, { uom: 30, unita: 'KG' }),
      mov('ODP-1', 'A#L1', 'consumo', 2, { uom: 20, unita: 'KG' }),
    ], 'ODP-1');
    expect(c.righe[0]).toMatchObject({ consumato_uom: 20, tornato_uom: null, residuo_uom: 10 });
  });

  it('consumare piu di quanto sia entrato non sta in piedi, e si vede', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 2), mov('ODP-1', 'A#L1', 'consumo', 5)], 'ODP-1');
    expect(c.incoerente).toBe(true);
  });

  it('un conto chiuso del tutto non manda piu nessuno a rendere niente', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 4), mov('ODP-1', 'A#L1', 'consumo', 4)], 'ODP-1');
    expect(daRendere(c)).toEqual([]);
    expect(consumo(c, true)).toEqual([]);
  });
});

describe('consumo', () => {
  const c = conto([
    mov('ODP-1', 'A#L1', 'in', 10, { uom: 100, unita: 'KG' }),
    mov('ODP-1', 'A#L1', 'out', 3, { uom: 30, unita: 'KG' }),
    mov('ODP-1', 'B#L2', 'in', 4), mov('ODP-1', 'B#L2', 'out', 4),
  ], 'ODP-1');

  it('a ordine CHIUSO, quel che e entrato e non e tornato e il consumo reale', () => {
    const k = consumo(c, true);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ item_key: 'A#L1', residuo: 7, residuo_uom: 70 });
  });

  it('quello che e tornato tutto non ha consumato niente, e non compare', () => {
    expect(consumo(c, true).some(r => r.item_key === 'B#L2')).toBe(false);
  });

  it('A ORDINE APERTO NON C E NESSUN CONSUMO: e merce ancora sul bancone', () => {
    expect(consumo(c, false)).toBe(null);
  });

  it('senza conto non si dichiara un consumo', () => {
    expect(consumo(null, true)).toBe(null);
  });
});

describe('daRendere', () => {
  it('e l elenco di cosa deve tornare perche il conto chiuda a zero', () => {
    const c = conto([
      mov('ODP-1', 'A#L1', 'in', 10), mov('ODP-1', 'A#L1', 'out', 3),
      mov('ODP-1', 'B#L2', 'in', 4), mov('ODP-1', 'B#L2', 'out', 4),
    ], 'ODP-1');
    expect(daRendere(c).map(r => r.item_key)).toEqual(['A#L1']);
  });

  it('un conto gia a zero non manda nessuno a recuperare niente', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 2), mov('ODP-1', 'A#L1', 'out', 2)], 'ODP-1');
    expect(daRendere(c)).toEqual([]);
    expect(daRendere(null)).toEqual([]);
  });
});

describe('attivo', () => {
  it('a interruttore SPENTO questo modulo non decide niente', () => {
    expect(attivo(false)).toBe(false);
    expect(attivo(null)).toBe(false);
    expect(attivo(undefined)).toBe(false);
  });

  it('acceso e acceso solo se e proprio vero', () => {
    expect(attivo(true)).toBe(true);
  });
});

describe('ubicazioneDi', () => {
  it('una per ordine: due ODP nello stesso vano sarebbero due consumi mescolati', () => {
    expect(ubicazioneDi('WIP', 'ODP2603889')).toBe('WIP-ODP2603889');
    expect(ubicazioneDi('WIP', 'ODP-1')).not.toBe(ubicazioneDi('WIP', 'ODP-2'));
  });

  it('si maiuscola e si ripulisce, come ogni codice di ubicazione', () => {
    expect(ubicazioneDi(' wip ', ' odp-1 ')).toBe('WIP-ODP-1');
  });

  it('SENZA AREA CONFIGURATA non si inventa un vano', () => {
    expect(ubicazioneDi('', 'ODP-1')).toBe(null);
    expect(ubicazioneDi(null, 'ODP-1')).toBe(null);
    expect(ubicazioneDi('WIP', '')).toBe(null);
  });
});

describe('colliFuori', () => {
  const con = (odp, key, verso, packs) => ({ odp_num: odp, item_key: key, verso, packs });

  it('le misure entrate, meno quelle gia tornate', () => {
    expect(colliFuori([
      con('ODP-1', 'A#L1', 'in', [25, 25, 7]),
      con('ODP-1', 'A#L1', 'out', [25]),
    ], 'ODP-1', 'A#L1')).toEqual([25, 7]);
  });

  it('il consumo toglie come il reso: escono tutti e due dal conto', () => {
    expect(colliFuori([
      con('ODP-1', 'A#L1', 'in', [25, 25, 7]),
      con('ODP-1', 'A#L1', 'consumo', [25, 7]),
    ], 'ODP-1', 'A#L1')).toEqual([25]);
  });

  it('DUE ORDINI NELLO STESSO VANO non si mescolano', () => {
    const mv = [
      con('ODP-1', 'A#L1', 'in', [25, 10]),
      con('ODP-2', 'A#L1', 'in', [5, 5]),
    ];
    expect(colliFuori(mv, 'ODP-1', 'A#L1')).toEqual([25, 10]);
    expect(colliFuori(mv, 'ODP-2', 'A#L1')).toEqual([5, 5]);
  });

  it('due lotti dello stesso ordine restano distinti', () => {
    const mv = [con('ODP-1', 'A#L1', 'in', [25]), con('ODP-1', 'A#L2', 'in', [9])];
    expect(colliFuori(mv, 'ODP-1', 'A#L1')).toEqual([25]);
    expect(colliFuori(mv, 'ODP-1', 'A#L2')).toEqual([9]);
  });

  it('si toglie UNA misura per volta, non tutte quelle uguali', () => {
    expect(colliFuori([
      con('ODP-1', 'A#L1', 'in', [25, 25, 25]),
      con('ODP-1', 'A#L1', 'out', [25]),
    ], 'ODP-1', 'A#L1')).toEqual([25, 25]);
  });

  /* 2.1 — QUESTA PROVA FISSAVA UN COMPORTAMENTO SBAGLIATO, e si riscrive.
     Diceva che un reso di una misura mai uscita non toglie niente: nove
     chili tornavano a magazzino e il conto continuava a dichiararne fuori
     trentadue. Ma una misura che non combacia con nessun collo intero non e'
     merce comparsa dal nulla: e' un collo APERTO, e nove chili tolti dal
     venticinque lasciano sedici. Adesso i numeri tornano — 16 + 7 = 23, che
     e' quel che l'ordine ha davvero fuori. */
  it('un reso che non combacia con un collo intero ne apre uno', () => {
    expect(colliFuori([
      con('ODP-1', 'A#L1', 'in', [25, 7]),
      con('ODP-1', 'A#L1', 'out', [9]),
    ], 'ODP-1', 'A#L1')).toEqual([16, 7]);
  });

  it('senza colli dichiarati non c e niente da ritrovare, e si torna a lavorare a numero', () => {
    expect(colliFuori([{ odp_num: 'ODP-1', item_key: 'A#L1', verso: 'in', qty: 3 }], 'ODP-1', 'A#L1')).toEqual([]);
    expect(colliFuori([], 'ODP-1', 'A#L1')).toEqual([]);
    expect(colliFuori(null, 'ODP-1', 'A#L1')).toEqual([]);
    expect(colliFuori([con('ODP-1', 'A#L1', 'in', [25])], '', 'A#L1')).toEqual([]);
    expect(colliFuori([con('ODP-1', 'A#L1', 'in', [25])], 'ODP-1', '')).toEqual([]);
  });

  it('gli zeri e i numeri che non sono numeri non entrano nell elenco', () => {
    expect(colliFuori([con('ODP-1', 'A#L1', 'in', [25, 0, null, 'x', 7])], 'ODP-1', 'A#L1')).toEqual([25, 7]);
  });
});

/* ── 2.1 — IL RENDICONTO DI CONSUMO ─────────────────────────────────────
   Il foglio che risponde a «quanto ne è andato in quest'ordine», e il
   numero che risponde è un delta: consegnato meno reso. */
describe('rendiconto', () => {
  it('il delta è consegnato meno reso, riga per riga', () => {
    const r = rendiconto(conto([
      mov('ODP-1', 'A#L1', 'in', 10, { uom: 250, unita: 'KG' }),
      mov('ODP-1', 'A#L1', 'out', 3, { uom: 75, unita: 'KG' }),
    ], 'ODP-1'));
    expect(r.righe[0]).toMatchObject({
      consegnato: 10, reso: 3, delta: 7,
      consegnato_uom: 250, reso_uom: 75, delta_uom: 175,
    });
    expect(r.delta).toBe(7);
  });

  /* IL DELTA NON È SEMPRE CONSUMO, e il foglio deve poterlo dire: finché la
     riga non è chiusa quella merce è ancora sul bancone. */
  it('un ordine aperto NON è chiuso, e il delta resta aperto', () => {
    const r = rendiconto(conto([mov('ODP-1', 'A#L1', 'in', 10)], 'ODP-1'));
    expect(r.chiuso).toBe(false);
    expect(r.righe[0]).toMatchObject({ delta: 10, dichiarato: 0, aperto: 10 });
  });

  /* 2.1 — «CONSUNTIVO» LO DICE LA CHIUSURA SCRITTA, non le righe a zero.
     Dichiarare tutto il consumo non è chiudere l'ordine: finché la chiusura
     non c'è quell'ordine può ancora ricevere merce, e il foglio è una
     fotografia. La prova diceva `true` sui soli consumi: si riscrive. */
  it('dichiarare tutto non basta: il consuntivo vuole la chiusura', () => {
    const righe = [
      mov('ODP-1', 'A#L1', 'in', 10),
      mov('ODP-1', 'A#L1', 'out', 3),
      mov('ODP-1', 'A#L1', 'consumo', 7),
    ];
    const aperto = rendiconto(conto(righe, 'ODP-1'));
    expect(aperto.righe[0]).toMatchObject({ delta: 7, dichiarato: 7, aperto: 0 });
    expect(aperto.chiuso).toBe(false);

    const chiuso = rendiconto(conto(
      [...righe, { odp_num: 'ODP-1', verso: 'chiuso', qty: 0, ts: 9000 }], 'ODP-1'));
    expect(chiuso.chiuso).toBe(true);
  });

  /* Una riga dichiarata a metà lascia il foglio aperto: è il caso del
     consumo completo riga per riga, che chiude una riga e non l'ordine. */
  it('una riga sola dichiarata non chiude il foglio', () => {
    const r = rendiconto(conto([
      mov('ODP-1', 'A#L1', 'in', 4), mov('ODP-1', 'A#L1', 'consumo', 4),
      mov('ODP-1', 'B#L2', 'in', 6),
    ], 'ODP-1'));
    expect(r.chiuso).toBe(false);
    expect(r.righe.find((x) => x.item_key === 'A#L1').aperto).toBe(0);
    expect(r.righe.find((x) => x.item_key === 'B#L2').aperto).toBe(6);
  });

  it('le righe che non hanno mosso niente non compaiono', () => {
    expect(rendiconto(conto([], 'ODP-1')).righe).toEqual([]);
    expect(rendiconto(null).righe).toEqual([]);
    expect(rendiconto(null).chiuso).toBe(false);
  });

  /* Un reso parziale in UM: un collo sceso, sette chili e mezzo risaliti. */
  it('il reso parziale in UM entra nel delta senza toccare i colli', () => {
    const r = rendiconto(conto([
      mov('ODP-1', 'A#L1', 'in', 1, { uom: 25, unita: 'KG' }),
      mov('ODP-1', 'A#L1', 'out', 0, { uom: 7.5, unita: 'KG' }),
    ], 'ODP-1'));
    expect(r.righe[0]).toMatchObject({ consegnato: 1, reso: 0, delta: 1, delta_uom: 17.5 });
  });
});

/* ── 2.1 — UN COLLO RIENTRA APERTO ──────────────────────────────────────
   Un sacco sceso in lavorazione risale a meta': e' il caso comune, e
   finche' il reso chiedeva solo «quanti colli» non c'era modo di dirlo. */
describe('misureDelReso', () => {
  it('un collo solo, e ne rientra una parte', () => {
    expect(misureDelReso([25], 0, 7.5)).toEqual({ intere: [], apribile: 25 });
  });

  /* IL COLLO CHE SI APRE E' IL PIU' PICCOLO CHE BASTA: aprire il 25 per
     prenderne 7,5 quando c'e' un 10 lascia in giro due mezzi colli. */
  it('si apre il piu piccolo che basta', () => {
    expect(misureDelReso([25, 10, 25], 0, 7.5).apribile).toBe(10);
  });

  /* Gli interi si prendono dai piu' piccoli, cosi' quello da aprire e' il
     piu' grande fra quelli che bastano. */
  it('gli interi escono dai piu piccoli', () => {
    const m = misureDelReso([25, 5, 10], 1, 7.5);
    expect(m).toEqual({ intere: [5], apribile: 10 });
  });

  it('una parte non puo essere un collo intero', () => {
    const m = misureDelReso([10, 5], 0, 10);
    expect(m.errore).toMatch(/meno di un collo intero/);
  });

  it('e nemmeno piu di un collo intero', () => {
    expect(misureDelReso([10], 0, 12).errore).toMatch(/meno di un collo intero/);
  });

  it('non si rendono piu colli di quanti ne siano in lavorazione', () => {
    expect(misureDelReso([25, 10], 2, 3).errore).toMatch(/2 coll\. in lavorazione/);
  });

  /* Senza elenco «7,5 KG di un collo» non ha un collo a cui riferirsi. */
  it('una riga che non dichiara i colli non puo rendere una parte', () => {
    expect(misureDelReso([], 0, 7.5).errore).toMatch(/non dichiara/);
    expect(misureDelReso(null, 0, 7.5).errore).toMatch(/non dichiara/);
  });

  it('una parte che non e un numero si rifiuta', () => {
    for (const v of [0, -3, NaN]) {
      expect(misureDelReso([25], 0, v).errore, String(v)).toMatch(/non e un numero/);
    }
  });

  /* Rendere tutti gli interi tranne uno, e aprire quello: e' il caso in cui
     l'ordine si riporta indietro quasi tutto. */
  it('tutti gli interi meno uno, e quello si apre', () => {
    const m = misureDelReso([25, 25, 25], 2, 20);
    expect(m).toEqual({ intere: [25, 25], apribile: 25 });
  });
});

/* ── 2.1 — L'ORDINE CHIUSO E' ARCHIVIATO, E NON SI RIESUMA ───────────────
   Segnalato da Andrea il 20/08: «ricaricare un odp crea interferenza in
   fase di wip». Un ordine chiuso spariva e basta da `ordiniWipAperti`, che
   filtra sul residuo diverso da zero — e finche' la prova era quella,
   ricaricare lo STESSO ordine lo riportava in vita: i prelievi nuovi
   scrivevano altri movimenti sotto lo stesso numero, e `conto` li sommava a
   quelli di un ciclo gia' chiuso. Due lavorazioni in un conto solo. */
describe('archiviato', () => {
  const chiusura = (odp, ts = 5000) => ({ odp_num: odp, verso: 'chiuso', qty: 0, ts });

  it('un ordine senza chiusura non e archiviato', () => {
    expect(archiviato([mov('ODP-1', 'A#L1', 'in', 10)], 'ODP-1')).toBe(false);
  });

  /* NEMMENO A RESIDUO ZERO: tutto rientrato non vuol dire chiuso, e quello
     era esattamente il buco — un ordine a zero spariva dagli aperti e
     restava vivo. */
  it('nemmeno un ordine tornato tutto a zero e archiviato da solo', () => {
    const m = [mov('ODP-1', 'A#L1', 'in', 10), mov('ODP-1', 'A#L1', 'out', 10)];
    expect(conto(m, 'ODP-1').residuo).toBe(0);
    expect(archiviato(m, 'ODP-1')).toBe(false);
  });

  it('con la chiusura scritta, lo e', () => {
    expect(archiviato([mov('ODP-1', 'A#L1', 'in', 10), chiusura('ODP-1')], 'ODP-1')).toBe(true);
  });

  it('la chiusura di un ALTRO ordine non archivia questo', () => {
    expect(archiviato([chiusura('ODP-2')], 'ODP-1')).toBe(false);
  });

  it('senza movimenti e senza ordine, no', () => {
    expect(archiviato([], 'ODP-1')).toBe(false);
    expect(archiviato(null, 'ODP-1')).toBe(false);
    expect(archiviato([chiusura('ODP-1')], '')).toBe(false);
  });
});

describe('la chiusura nel conto', () => {
  const chiusura = (odp, ts = 5000) => ({ odp_num: odp, verso: 'chiuso', qty: 0, ts });

  /* LA CHIUSURA NON E' UNA RIGA DEL CONTO. Non porta merce e non ha una
     chiave: il ramo in fondo a `conto` somma come «entrato» tutto quel che
     non e' `out` ne' `consumo`, e senza la guardia la chiusura gonfiava
     l'ordine di un collo che non esiste. */
  it('LA CHIUSURA NON SI SOMMA COME ENTRATA', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 10), chiusura('ODP-1')], 'ODP-1');
    expect(c.entrato).toBe(10);
    expect(c.righe).toHaveLength(1);
  });

  it('il conto dice che e chiuso, e quando', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 10), chiusura('ODP-1', 7777)], 'ODP-1');
    expect(c.chiuso).toBe(true);
    expect(c.chiuso_il).toBe(7777);
  });

  it('un ordine aperto non e chiuso e non ha data', () => {
    const c = conto([mov('ODP-1', 'A#L1', 'in', 10)], 'ODP-1');
    expect(c.chiuso).toBe(false);
    expect(c.chiuso_il).toBe(null);
  });

  it('un conto vuoto non e chiuso', () => {
    expect(conto([], 'ODP-1').chiuso).toBe(false);
    expect(conto(null, null).chiuso_il).toBe(null);
  });

  /* IL RENDICONTO PRENDE `chiuso` DAL FATTO, non dalle righe a zero: un
     ordine chiuso lasciando qualcosa dichiarato a mano e' un consuntivo, e
     un ordine a zero per caso non lo e'. */
  it('il rendiconto e un consuntivo solo se l ordine e chiuso davvero', () => {
    const righe = [mov('ODP-1', 'A#L1', 'in', 10), mov('ODP-1', 'A#L1', 'out', 10)];
    expect(rendiconto(conto(righe, 'ODP-1')).chiuso).toBe(false);
    expect(rendiconto(conto([...righe, chiusura('ODP-1')], 'ODP-1')).chiuso).toBe(true);
  });
});

/* ── 2.1 — «IL COLLO DA 20 NON E' PIU' SU QUESTA RIGA» ───────────────────
   Segnalato da Andrea il 20/08 sull'ordine PROVA, `6000366B#123456`. La
   scheda diceva: entrato 2 coll. / 40 KG, reso 0 coll. / 10 KG, resta 2
   coll. / 30 KG. Cioe' due colli da 20 usciti, e da uno rientrati 10.

   Nel vano c'erano `[20, 10]`. Ma `colliFuori` sottraeva per misura ESATTA:
   cercava un 10 fra `[20, 20]`, non lo trovava, e non toglieva niente — il
   conto restava convinto di avere fuori due colli pieni. Alla chiusura
   chiedeva al vano il secondo collo da 20, e lo storno rispondeva che quel
   collo non c'era piu'.

   Un collo che torna a meta' NON esce dal conto: si svuota. */
describe('colliFuori — un collo puo tornare aperto', () => {
  const conPacks = (odp, key, verso, qty, packs) => ({
    odp_num: odp, item_key: key, verso, qty, packs,
    article_code: key.split('#')[0], lot_code: key.split('#')[1],
  });
  /* L'ORDINE DELLE MISURE NON VUOL DIRE NIENTE: chi le rilegge —
     `scelteDaMisure` — le cerca per valore, non per posto. Si confronta
     ordinato, cosi' una prova non si rompe per un dettaglio che il codice
     non promette. */
  const fuoriDi = (m, odp, key) => colliFuori(m, odp, key).slice().sort((a, b) => a - b);

  /* I NUMERI SONO QUELLI VERI, letti dal servizio il 20/08: il movimento
     `in` porta `packs [20,20]`, l'`out` porta `packs [10]`, e la riga nel
     vano `MAG1-WIP-01` porta `packs [10,20]` con 30 KG. La chiusura andava
     a chiedere al vano DUE colli da 20, e il vano ne aveva uno solo. */
  it('IL CASO DI PRODUZIONE: due colli da 20, ne rientrano 10', () => {
    const m = [
      conPacks('PROVA', '6000366B#123456', 'in', 2, [20, 20]),
      conPacks('PROVA', '6000366B#123456', 'out', 0, [10]),
    ];
    const c = conto(m, 'PROVA');
    expect(c.righe[0]).toMatchObject({ entrato: 2, tornato: 0, residuo: 2 });

    const fuori = colliFuori(m, 'PROVA', '6000366B#123456');
    expect(fuori.slice().sort((a, b) => a - b)).toEqual([10, 20]);

    /* E ADESSO IL VANO LI RITROVA: e' il passo che rispondeva «il collo da
       20 non e' piu' su questa riga». */
    const nelVano = [10, 20];
    expect(() => scelteDaMisure(nelVano, fuori, 'KG')).not.toThrow();
    expect(scelteDaMisure(nelVano, fuori, 'KG')).toHaveLength(2);
  });

  it('il reso di un collo intero lo toglie, come sempre', () => {
    const m = [
      conPacks('O', 'A#L', 'in', 2, [20, 20]),
      conPacks('O', 'A#L', 'out', 1, [20]),
    ];
    expect(colliFuori(m, 'O', 'A#L')).toEqual([20]);
  });

  /* SI SCAVA IL PIU' PICCOLO CHE BASTA: aprire il 25 quando c'e' un 12
     lascia in giro due mezzi colli invece di uno. */
  it('si scava il piu piccolo che basta', () => {
    const m = [
      conPacks('O', 'A#L', 'in', 3, [25, 12, 30]),
      conPacks('O', 'A#L', 'out', 0, [10]),
    ];
    expect(fuoriDi(m, 'O', 'A#L')).toEqual([2, 25, 30]);
  });

  it('due parti di seguito scavano due volte', () => {
    const m = [
      conPacks('O', 'A#L', 'in', 2, [20, 20]),
      conPacks('O', 'A#L', 'out', 0, [10]),
      conPacks('O', 'A#L', 'out', 0, [5]),
    ];
    expect(fuoriDi(m, 'O', 'A#L')).toEqual([5, 20]);
  });

  /* Un collo svuotato del tutto se ne va: la misura esatta combacia. */
  it('la parte grande quanto il collo lo toglie del tutto', () => {
    const m = [
      conPacks('O', 'A#L', 'in', 2, [20, 20]),
      conPacks('O', 'A#L', 'out', 1, [20]),
      conPacks('O', 'A#L', 'out', 0, [8]),
    ];
    expect(colliFuori(m, 'O', 'A#L')).toEqual([12]);
  });

  /* Piu' di quanto sia uscito non si puo' togliere: non si inventa un collo
     negativo, e `incoerente` sul conto lo dice gia' a chi guarda. */
  it('un reso piu grande di ogni collo non scava niente', () => {
    const m = [
      conPacks('O', 'A#L', 'in', 1, [20]),
      conPacks('O', 'A#L', 'out', 0, [50]),
    ];
    expect(colliFuori(m, 'O', 'A#L')).toEqual([20]);
  });

  it('anche il consumo scava, come il reso', () => {
    const m = [
      conPacks('O', 'A#L', 'in', 2, [20, 20]),
      conPacks('O', 'A#L', 'consumo', 0, [10]),
    ];
    expect(fuoriDi(m, 'O', 'A#L')).toEqual([10, 20]);
  });

  /* I decimali non lasciano code: 7,5 da 25 fa 17,5 e non 17,499999. */
  it('i decimali restano puliti', () => {
    const m = [
      conPacks('O', 'A#L', 'in', 1, [25]),
      conPacks('O', 'A#L', 'out', 0, [7.5]),
    ];
    expect(colliFuori(m, 'O', 'A#L')).toEqual([17.5]);
  });
});

/* ── 2.1 — LA CONFEZIONE APERTA TORNA A MAGAZZINO ────────────────────────
   Andrea, 20/08: «se entrano 2 colli da 20 KG e rientra 1 collo da 5 KG il
   sistema deve ricaricare a magazzino la confezione aperta, adesso il
   sistema consuma 2 colli».

   Il modello di prima diceva: tornano 5 KG e nel vano resta il sacco con
   dentro 15. In magazzino non funziona cosi': quel che risale E' IL SACCO
   APERTO, con dentro 5, e i 15 che mancano sono finiti nel prodotto. Il
   sacco esce dal vano intero e non ci resta mezzo.

   Un gesto solo, due fatti: il reso di quel che e' tornato davvero, e il
   consumo della differenza. Li scrive `esceDaWip` nella stessa chiamata,
   perche' il conto non deve mai poter essere letto a meta'. */
describe('due colli da 20, ne risale uno aperto con dentro 5', () => {
  const movimenti = [
    /* scesi in lavorazione: due sacchi da 20 */
    { odp_num: 'O', item_key: 'A#L', verso: 'in', qty: 2, qty_uom: 40, uom: 'KG', packs: [20, 20] },
    /* risale UN sacco — quello aperto — con dentro 5 */
    { odp_num: 'O', item_key: 'A#L', verso: 'out', qty: 1, qty_uom: 5, uom: 'KG', packs: [20] },
    /* e i 15 che non sono tornati sono consumo, subito */
    { odp_num: 'O', item_key: 'A#L', verso: 'consumo', qty: 0, qty_uom: 15, uom: 'KG', packs: null },
  ];

  it('IL CONTO NON RESTA A DUE COLLI', () => {
    const r = conto(movimenti, 'O').righe[0];
    expect(r).toMatchObject({ entrato: 2, tornato: 1, consumato: 0, residuo: 1 });
  });

  it('e i chili quadrano: 40 scesi, 5 resi, 15 consumati, 20 ancora fuori', () => {
    const r = conto(movimenti, 'O').righe[0];
    expect(r.entrato_uom).toBe(40);
    expect(r.tornato_uom).toBe(5);
    expect(r.consumato_uom).toBe(15);
    expect(r.residuo_uom).toBe(20);
  });

  /* IL VANO E IL CONTO DICONO LA STESSA COSA: un collo da 20, che e' il
     sacco intatto. E' la condizione perche' la chiusura ritrovi la merce. */
  it('e nel vano resta UN collo, quello intatto', () => {
    expect(colliFuori(movimenti, 'O', 'A#L')).toEqual([20]);
  });

  it('la chiusura consuma quell unico collo, non due', () => {
    const k = consumo(conto(movimenti, 'O'), true);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ residuo: 1, residuo_uom: 20 });
  });

  /* E il rendiconto dice il delta vero: 40 giu', 5 su, 35 consumati. */
  it('il rendiconto dice 35 KG consumati su 40 scesi', () => {
    const r = rendiconto(conto(movimenti, 'O')).righe[0];
    expect(r).toMatchObject({ consegnato: 2, reso: 1, delta: 1 });
    expect(r.consegnato_uom).toBe(40);
    expect(r.reso_uom).toBe(5);
    expect(r.delta_uom).toBe(35);
  });
});

/* L'ARCHIVIO SI SFOGLIA — 2.2.
   `archiviato` risponde su un ordine di cui si sa gia' il numero. Il
   consuntivo di una lavorazione si guarda mesi dopo, quando quel numero non
   ce l'ha piu' in testa nessuno: serve l'elenco. */
describe('ordiniArchiviati', () => {
  const chiusura = (odp, ts = 5000) => ({ odp_num: odp, verso: 'chiuso', qty: 0, ts });

  it('elenca solo gli ordini che hanno la chiusura scritta', () => {
    const m = [mov('ODP-1', 'A#L1', 'in', 10), chiusura('ODP-1'),
               mov('ODP-2', 'A#L1', 'in', 5)];
    expect(ordiniArchiviati(m).map(o => o.odp_num)).toEqual(['ODP-1']);
  });

  /* Un ordine tornato tutto a zero non e' archiviato: e' la stessa regola di
     `archiviato`, e qui si prova che l'elenco non la scavalca. */
  it('un ordine a residuo zero senza chiusura non entra nell elenco', () => {
    const m = [mov('ODP-1', 'A#L1', 'in', 10), mov('ODP-1', 'A#L1', 'out', 10)];
    expect(ordiniArchiviati(m)).toEqual([]);
  });

  it('porta la data della chiusura', () => {
    expect(ordiniArchiviati([chiusura('ODP-1', 1234)])).toEqual([{ odp_num: 'ODP-1', chiuso_il: 1234 }]);
  });

  /* DAL PIU' RECENTE: e' l'ordine in cui si cerca un consuntivo. */
  it('dal piu recente al piu vecchio', () => {
    const m = [chiusura('ODP-VECCHIO', 100), chiusura('ODP-NUOVO', 900), chiusura('ODP-MEZZO', 500)];
    expect(ordiniArchiviati(m).map(o => o.odp_num)).toEqual(['ODP-NUOVO', 'ODP-MEZZO', 'ODP-VECCHIO']);
  });

  /* Una chiusura senza `ts` non sparisce dall'elenco: finisce in fondo, che
     e' dove sta un ordine di cui non si sa quando e' stato chiuso. */
  it('una chiusura senza data resta in elenco, in fondo', () => {
    const m = [{ odp_num: 'ODP-SENZA', verso: 'chiuso', qty: 0 }, chiusura('ODP-CON', 900)];
    expect(ordiniArchiviati(m)).toEqual([
      { odp_num: 'ODP-CON', chiuso_il: 900 },
      { odp_num: 'ODP-SENZA', chiuso_il: null },
    ]);
  });

  /* Non dovrebbe capitare — `archiviaOrdineWip` rifiuta la seconda — ma se
     capitasse, la chiusura vera e' la prima e l'ordine compare una volta. */
  it('due chiusure sullo stesso ordine danno una riga sola, la prima', () => {
    const m = [chiusura('ODP-1', 100), chiusura('ODP-1', 900)];
    expect(ordiniArchiviati(m)).toEqual([{ odp_num: 'ODP-1', chiuso_il: 100 }]);
  });

  it('senza movimenti, elenco vuoto', () => {
    expect(ordiniArchiviati([])).toEqual([]);
    expect(ordiniArchiviati(null)).toEqual([]);
    expect(ordiniArchiviati(undefined)).toEqual([]);
  });

  it('una chiusura senza numero d ordine non entra', () => {
    expect(ordiniArchiviati([{ odp_num: '  ', verso: 'chiuso', ts: 1 }])).toEqual([]);
  });
});

/* LE RIGHE SENZA ORDINE — 2.2.
   Il vano WIP e' un'ubicazione sola e a tenere distinti i conti e' l'ordine
   su ogni movimento. Una riga che nessun movimento nomina non sta in nessun
   conto: la chiusura e il reso lavorano per ordine, e non la vedono. Il
   20/08 ce n'erano sei, trovate leggendo il database. */
describe('righeSenzaOrdine', () => {
  const riga = (key, qty = 1) => ({ item_key: key, qty });

  it('una riga che un movimento nomina non e orfana', () => {
    const m = [mov('ODP-1', 'A#L1', 'in', 10)];
    expect(righeSenzaOrdine(m, [riga('A#L1')])).toEqual([]);
  });

  it('una riga che nessun movimento nomina lo e', () => {
    const m = [mov('ODP-1', 'A#L1', 'in', 10)];
    expect(righeSenzaOrdine(m, [riga('B#L9', 3)])).toEqual([riga('B#L9', 3)]);
  });

  /* NON CONTA IL VERSO: basta essere nominata. Una riga tornata a magazzino
     e' comunque roba di cui un ordine ha risposto. */
  it('basta essere nominata da un movimento qualunque', () => {
    for (const verso of ['in', 'out', 'consumo']) {
      expect(righeSenzaOrdine([mov('ODP-1', 'A#L1', verso, 1)], [riga('A#L1')])).toEqual([]);
    }
  });

  /* L'ORDINE ARCHIVIATO RIVENDICA ANCORA LE SUE RIGHE. Chiudere non toglie
     la firma da quello che e' passato di li': se una riga resta nel vano
     dopo la chiusura, un conto che la nomina c'e' — e' storia, ma c'e'. */
  it('un ordine archiviato rivendica ancora le sue righe', () => {
    const m = [mov('ODP-1', 'A#L1', 'in', 10), { odp_num: 'ODP-1', verso: 'chiuso', qty: 0, ts: 1 }];
    expect(righeSenzaOrdine(m, [riga('A#L1')])).toEqual([]);
  });

  it('separa le rivendicate dalle orfane, e tiene l ordine del vano', () => {
    const m = [mov('ODP-1', 'A#L1', 'in', 10)];
    const vano = [riga('A#L1'), riga('B#L2', 2), riga('C#L3', 5)];
    expect(righeSenzaOrdine(m, vano).map(r => r.item_key)).toEqual(['B#L2', 'C#L3']);
  });

  /* SENZA MOVIMENTI SONO TUTTE ORFANE, e non e' un caso di scuola: e' il
     vano di chi accende `wip` dopo aver gia' posizionato merce li' dentro. */
  it('senza nessun movimento wip, tutte le righe del vano sono orfane', () => {
    const vano = [riga('A#L1'), riga('B#L2')];
    expect(righeSenzaOrdine([], vano)).toEqual(vano);
    expect(righeSenzaOrdine(null, vano)).toEqual(vano);
  });

  it('un vano vuoto non ha orfane', () => {
    expect(righeSenzaOrdine([mov('ODP-1', 'A#L1', 'in', 1)], [])).toEqual([]);
    expect(righeSenzaOrdine([mov('ODP-1', 'A#L1', 'in', 1)], null)).toEqual([]);
  });

  /* Una riga senza chiave non si puo' rivendicare ne' orfanare: non ha il
     nome con cui la si cercherebbe. Fuori dall'elenco, non in cima. */
  it('una riga senza item_key non entra nell elenco', () => {
    expect(righeSenzaOrdine([], [{ item_key: '  ', qty: 1 }, { qty: 2 }])).toEqual([]);
  });
});

describe('il numero d ordine non ha un caso', () => {
  /* 20/08 in produzione: i conti aperti erano elencati e nessuno si apriva.
     Il prelievo scriveva «prova6», la maschera chiedeva «PROVA6». */
  it('conto trova un ordine scritto in minuscolo', () => {
    const c = conto([
      mov('prova6', 'A#L1', 'in', 5),
      mov('prova6', 'A#L1', 'out', 2),
    ], 'PROVA6');
    expect(c.righe).toHaveLength(1);
    expect(c.righe[0]).toMatchObject({ entrato: 5, tornato: 2, residuo: 3 });
    expect(c.odp_num).toBe('PROVA6');
  });

  it('e un ordine scritto in maiuscolo cercato in minuscolo', () => {
    const c = conto([mov('ODP-9', 'A#L1', 'in', 4)], 'odp-9');
    expect(c.entrato).toBe(4);
  });

  it('gli ordini restano distinti: il caso non fonde due numeri diversi', () => {
    const c = conto([
      mov('prova6', 'A#L1', 'in', 5),
      mov('PROVA7', 'A#L1', 'in', 99),
    ], 'PROVA6');
    expect(c.entrato).toBe(5);
  });

  it('archiviato riconosce la chiusura scritta con un altro caso', () => {
    const m = [mov('prova3', 'A#L1', 'in', 1), { odp_num: 'prova3', verso: 'chiuso', ts: 7 }];
    expect(archiviato(m, 'PROVA3')).toBe(true);
  });

  it('ordiniArchiviati elenca in maiuscolo', () => {
    const m = [{ odp_num: 'prova3', verso: 'chiuso', ts: 7 }];
    expect(ordiniArchiviati(m)).toEqual([{ odp_num: 'PROVA3', chiuso_il: 7 }]);
  });

  it('colliFuori ritrova le misure di un ordine minuscolo', () => {
    const m = [{ odp_num: 'prova6', item_key: 'A#L1', verso: 'in', qty: 2, packs: [25, 10] }];
    expect(colliFuori(m, 'PROVA6', 'A#L1')).toEqual([25, 10]);
  });
});

describe('le UM che mancano si derivano dalla confezione', () => {
  /* Il caso vero, visto al banco il 24/08: due colli entrati PRIMA che il
     lotto dichiarasse la confezione, quindi senza misure; uno tornato con
     dentro 5 kg e venti dichiarati consumati, questi sì con le misure. Il
     conto leggeva «entrato 0 KG, uscito 25» e si dichiarava incoerente. */
  const ordine = [
    mov('ODP-9', 'A#L1', 'in', 1, { unita: 'KG' }),
    { ...mov('ODP-9', 'A#L1', 'out', 1, { uom: 5, unita: 'KG' }), packs: [25] },
    mov('ODP-9', 'A#L1', 'consumo', 0, { uom: 20, unita: 'KG' }),
  ];

  it('senza confezione il conto resta storto, e lo dice', () => {
    const c = conto(ordine, 'ODP-9');
    expect(c.righe[0].entrato_uom).toBe(null);
    expect(c.righe[0].residuo_uom).toBe(-25);
    expect(c.incoerente).toBe(true);
  });

  it('con la confezione dichiarata dopo, il conto torna', () => {
    const c = conto(ordine, 'ODP-9', () => 25);
    expect(c.righe[0]).toMatchObject({
      entrato: 1, tornato: 1, consumato: 0,
      entrato_uom: 25, tornato_uom: 5, consumato_uom: 20, residuo_uom: 0,
    });
    expect(c.incoerente).toBe(false);
  });

  it('una riga che porta le sue UM non viene toccata', () => {
    const c = conto([mov('ODP-9', 'A#L1', 'in', 2, { uom: 30, unita: 'KG' })], 'ODP-9', () => 25);
    expect(c.righe[0].entrato_uom).toBe(30);
  });

  it('la chiusura non prende misure: non muove niente', () => {
    const c = conto([
      mov('ODP-9', 'A#L1', 'in', 1, { unita: 'KG' }),
      { odp_num: 'ODP-9', verso: 'chiuso', ts: 9 },
    ], 'ODP-9', () => 25);
    expect(c.entrato).toBe(1);
    expect(c.righe[0].entrato_uom).toBe(25);
    expect(c.chiuso).toBe(true);
  });
});
