import { describe, it, expect } from 'vitest';
import {
  chiaveMerce, caseDelLotto, verdettoCasa,
  udcConsigliata, scavalcoUdc,
  normalizzaMatrice, incompatibili, scontri,
  INCOMPATIBILITA_DI_SERIE, MOTIVI_SCAVALCO, testoScavalco, REGOLE_BASE,
} from '../src/modules/regoleBase';

/* Una riga di giacenza, come la scrive `addItem`: `item_key` c'è sempre, e
   il lotto NON è maiuscolato — vedi `chiaveMerce`. */
const riga = (loc, art, lot, qty = 1, udc = null) => ({
  location_code: loc,
  item_key: `${art}#${lot}`,
  article_code: art,
  lot_code: lot,
  qty,
  udc_id: udc,
});

/* ═══════════════════════════════════════════════════════════════════
   REGOLA 2 — LO STESSO ARTICOLO/LOTTO STA NELLA STESSA UBICAZIONE
   ═══════════════════════════════════════════════════════════════════ */

describe('dove il lotto sta già', () => {
  it('un magazzino in regola ha zero o una casa per lotto', () => {
    const righe = [riga('A-01', '7001', 'L1', 5), riga('A-02', '7001', 'L2', 3)];
    expect(caseDelLotto(righe, '7001', 'L1')).toEqual([{ location_code: 'A-01', qty: 5 }]);
    expect(caseDelLotto(righe, '7001', 'MAI')).toEqual([]);
  });

  it('le case si ordinano dalla più piena: è quella che conta di più', () => {
    const righe = [riga('A-01', '7001', 'L1', 2), riga('A-09', '7001', 'L1', 40)];
    expect(caseDelLotto(righe, '7001', 'L1').map(c => c.location_code)).toEqual(['A-09', 'A-01']);
  });

  /* Una riga a zero non è merce: è una riga che qualcuno non ha ancora
     ripulito, e difendere una casa vuota vorrebbe dire rifiutare di
     posizionare il lotto da qualunque altra parte per sempre. */
  it('una riga a quantità zero non è una casa', () => {
    expect(caseDelLotto([riga('A-01', '7001', 'L1', 0)], '7001', 'L1')).toEqual([]);
  });

  it('l’articolo si confronta in maiuscolo, il lotto no', () => {
    const righe = [riga('A-01', '7001', 'cl260854', 5)];
    expect(caseDelLotto(righe, '7001', 'cl260854')).toHaveLength(1);
    expect(caseDelLotto(righe, '7001', 'CL260854')).toHaveLength(0);
    expect(chiaveMerce('7001', 'cl260854')).toBe('7001#cl260854');
  });

  /* L'area WIP è un conto di produzione, non uno scaffale: contarla come
     casa rifiuterebbe di posizionare un lotto di cui il reparto ha in mano
     tre colli. Vedi `entraInWip` in `store.ts`. */
  it('le aree di transito non sono casa', () => {
    const righe = [riga('MAG1-WIP-01', '7001', 'L1', 3)];
    expect(caseDelLotto(righe, '7001', 'L1')).toHaveLength(1);
    expect(caseDelLotto(righe, '7001', 'L1', ['MAG1-WIP-01'])).toHaveLength(0);
  });
});

describe('la regola che non si scavalca', () => {
  const righe = [riga('A-01', '7001', 'L1', 5)];

  it('un lotto mai visto si posiziona dove si vuole', () => {
    const v = verdettoCasa([], '7001', 'L1', 'B-99');
    expect(v.esito).toBe('primo');
    expect(v.vietato).toBe(false);
  });

  it('il vano di casa è sempre ammesso', () => {
    const v = verdettoCasa(righe, '7001', 'L1', 'A-01');
    expect(v.esito).toBe('casa');
    expect(v.vietato).toBe(false);
    expect(v.casaLibera).toBe('A-01');
  });

  /* IL CUORE DELLA REGOLA. Casa può ricevere, quindi il secondo vano si
     rifiuta — e il messaggio porta il codice di casa, perché «non si può»
     senza «allora dove» è una porta chiusa e basta. */
  it('con casa disponibile, un altro vano è VIETATO e il messaggio dice dove andare', () => {
    const v = verdettoCasa(righe, '7001', 'L1', 'B-02', () => ({ ok: true }));
    expect(v.esito).toBe('vietato');
    expect(v.vietato).toBe(true);
    expect(v.casaLibera).toBe('A-01');
    expect(v.messaggio).toContain('A-01');
  });

  /* L'ECCEZIONE, E CHI LA DECIDE: lo stato del vano, non la persona. */
  it('se casa non può ricevere, il lotto si estende e NON è vietato', () => {
    const v = verdettoCasa(righe, '7001', 'L1', 'B-02',
      () => ({ ok: false, motivo: 'piena — ci stanno 10 colli e ce ne sono 10' }));
    expect(v.esito).toBe('estensione');
    expect(v.vietato).toBe(false);
    expect(v.casaLibera).toBeNull();
    expect(v.messaggio).toContain('piena');
  });

  it('fra due case, basta che UNA possa ricevere perché il resto si rifiuti', () => {
    const due = [riga('A-01', '7001', 'L1', 5), riga('A-02', '7001', 'L1', 2)];
    const v = verdettoCasa(due, '7001', 'L1', 'C-03',
      (c) => (c === 'A-01' ? { ok: false, motivo: 'bloccata' } : { ok: true }));
    expect(v.vietato).toBe(true);
    expect(v.casaLibera).toBe('A-02');
  });

  /* Un vincolo che non si conosce non è un vincolo che si viola: la stessa
     regola della capienza in `stoccaggio.ts`. */
  it('senza modo di valutare casa, casa si considera disponibile', () => {
    const v = verdettoCasa(righe, '7001', 'L1', 'B-02', null);
    expect(v.vietato).toBe(true);
  });

  it('la regola 2 è dichiarata come NON scavalcabile', () => {
    const r = REGOLE_BASE.find(x => x.id === 'UBICAZIONE_UNICA');
    expect(r.override).toBe(false);
    expect(REGOLE_BASE.find(x => x.id === 'UDC_UNICA').override).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   REGOLA 1 — LO STESSO ARTICOLO STA SULLA STESSA UDC
   ═══════════════════════════════════════════════════════════════════ */

const udc = (id, righe, extra = {}) => ({
  udc_id: id,
  status: extra.status ?? 'open',
  location_code: extra.loc ?? 'A-01',
  righe,
  capienza: extra.capienza ?? null,
  occupati: extra.occupati ?? righe.reduce((t, r) => t + (r.qty || 0), 0),
});

describe('su quale unità di carico va questo articolo', () => {
  it('senza unità di carico non c’è niente da consigliare, e non è un errore', () => {
    expect(udcConsigliata([], '7001', 'L1')).toBeNull();
    expect(udcConsigliata(null, '7001', 'L1')).toBeNull();
  });

  it('lo stesso LOTTO batte lo stesso articolo: la riga si somma a quella che c’è', () => {
    const p = udcConsigliata([
      udc('UDC-000001', [riga('A-01', '7001', 'L9', 4, 'UDC-000001')]),
      udc('UDC-000002', [riga('A-01', '7001', 'L1', 1, 'UDC-000002')]),
    ], '7001', 'L1');
    expect(p.udc_id).toBe('UDC-000002');
    expect(p.motivo).toBe('lotto');
  });

  it('senza il lotto, lo stesso articolo basta', () => {
    const p = udcConsigliata([
      udc('UDC-000001', [riga('A-01', '9999', 'L1', 4, 'UDC-000001')]),
      udc('UDC-000002', [riga('A-01', '7001', 'L9', 1, 'UDC-000002')]),
    ], '7001', 'L1');
    expect(p.udc_id).toBe('UDC-000002');
    expect(p.motivo).toBe('articolo');
  });

  /* Riempire la più vuota tiene aperte meno unità, e un'unità aperta è una
     che nessuno chiude. */
  it('fra pari vince quella con più spazio residuo', () => {
    const p = udcConsigliata([
      udc('UDC-000001', [riga('A-01', '7001', 'L1', 9, 'UDC-000001')], { capienza: 10 }),
      udc('UDC-000002', [riga('A-01', '7001', 'L1', 2, 'UDC-000002')], { capienza: 10 }),
    ], '7001', 'L1');
    expect(p.udc_id).toBe('UDC-000002');
  });

  it('una UDC chiusa o spedita non riceve più niente', () => {
    expect(udcConsigliata([
      udc('UDC-000001', [riga('A-01', '7001', 'L1', 1, 'UDC-000001')], { status: 'closed' }),
      udc('UDC-000002', [riga('A-01', '7001', 'L1', 1, 'UDC-000002')], { status: 'shipped' }),
    ], '7001', 'L1')).toBeNull();
  });

  it('una UDC piena non riceve più niente', () => {
    expect(udcConsigliata([
      udc('UDC-000001', [riga('A-01', '7001', 'L1', 10, 'UDC-000001')], { capienza: 10 }),
    ], '7001', 'L1')).toBeNull();
  });

  /* Le UDC scritte prima della 1.12 non hanno stato: si leggono aperte, che
     è l'unica lettura onesta di un dato che nessuno ha dichiarato. */
  it('lo stato ignoto si legge come aperto', () => {
    const p = udcConsigliata([
      { udc_id: 'UDC-000001', righe: [riga('A-01', '7001', 'L1', 1, 'UDC-000001')] },
    ], '7001', 'L1');
    expect(p.udc_id).toBe('UDC-000001');
  });

  it('lo scavalco si scrive solo quando c’è davvero uno scavalco', () => {
    expect(scavalcoUdc('UDC-000001', 'UDC-000001', 'x')).toBeNull();
    expect(scavalcoUdc(null, 'UDC-000002', 'x')).toBeNull();
    expect(scavalcoUdc('UDC-000001', 'UDC-000002', 'il pallet è già alto'))
      .toBe('UDC proposta UDC-000001, scelta UDC-000002 — il pallet è già alto');
    expect(scavalcoUdc('UDC-000001', '', '')).toBe('UDC proposta UDC-000001, scelta — nessuna');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   LA MATRICE DI INCOMPATIBILITÀ
   ═══════════════════════════════════════════════════════════════════ */

describe('quali pericolosità non dividono un vano', () => {
  it('le coppie si normalizzano in ordine, e i doppioni spariscono', () => {
    const m = normalizzaMatrice([
      { a: 'infiammabile', b: 'COMBURENTE' },
      { a: 'COMBURENTE', b: 'INFIAMMABILE' },
      { a: ' corrosivo ', b: 'infiammabile' },
    ]);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ a: 'COMBURENTE', b: 'INFIAMMABILE' });
  });

  /* Due colli dello stesso pericolo stanno insieme benissimo: è quello il
     motivo per cui esistono le zone dedicate. */
  it('una coppia vuota o un codice con se stesso non dicono niente', () => {
    expect(normalizzaMatrice([
      { a: 'INFIAMMABILE', b: 'INFIAMMABILE' },
      { a: '', b: 'NOCIVO' },
      { a: 'NOCIVO', b: '' },
    ])).toEqual([]);
  });

  it('quel che non è un elenco non è una matrice', () => {
    expect(normalizzaMatrice(null)).toEqual([]);
    expect(normalizzaMatrice('INFIAMMABILE')).toEqual([]);
  });

  it('l’ordine dentro la coppia non conta', () => {
    const m = normalizzaMatrice([{ a: 'COMBURENTE', b: 'INFIAMMABILE' }]);
    expect(incompatibili(m, 'INFIAMMABILE', 'COMBURENTE')).toBe(true);
    expect(incompatibili(m, 'COMBURENTE', 'INFIAMMABILE')).toBe(true);
    expect(incompatibili(m, 'COMBURENTE', 'NOCIVO')).toBe(false);
    expect(incompatibili([], 'COMBURENTE', 'INFIAMMABILE')).toBe(false);
  });

  it('le tre di serie sono le tre che nessun magazzino discute', () => {
    expect(normalizzaMatrice(INCOMPATIBILITA_DI_SERIE)).toHaveLength(3);
    expect(incompatibili(INCOMPATIBILITA_DI_SERIE, 'INFIAMMABILE', 'COMBURENTE')).toBe(true);
  });

  it('gli scontri sono fra quel che arriva e quel che c’è già', () => {
    const s = scontri(INCOMPATIBILITA_DI_SERIE, ['INFIAMMABILE'], ['NOCIVO', 'COMBURENTE']);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ entrante: 'INFIAMMABILE', presente: 'COMBURENTE' });
    expect(s[0].nota).toBeTruthy();
  });

  it('un vano vuoto non scontra con niente', () => {
    expect(scontri(INCOMPATIBILITA_DI_SERIE, ['INFIAMMABILE'], [])).toEqual([]);
    expect(scontri(INCOMPATIBILITA_DI_SERIE, [], ['COMBURENTE'])).toEqual([]);
  });

  it('la stessa coppia si conta una volta sola', () => {
    const s = scontri(INCOMPATIBILITA_DI_SERIE,
      ['INFIAMMABILE', 'COMBURENTE'], ['COMBURENTE', 'INFIAMMABILE']);
    expect(s).toHaveLength(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   I MOTIVI PRECOMPILATI DELLO SCAVALCO
   ═══════════════════════════════════════════════════════════════════ */

describe('i tre motivi che si premono invece di scriverli', () => {
  /* Tre e non dieci: un elenco lungo torna a essere una scelta da leggere,
     cioè lo stesso costo del campo libero con in più l'illusione di aver
     misurato qualcosa. */
  it('sono tre, e ognuno ha un codice e un testo', () => {
    expect(MOTIVI_SCAVALCO).toHaveLength(3);
    for (const m of MOTIVI_SCAVALCO) {
      expect(m.code).toMatch(/^[A-Z]+$/);
      expect(m.testo.length).toBeGreaterThan(10);
    }
  });

  it('il precompilato diventa testo, e il libero gli si accoda', () => {
    expect(testoScavalco('MEZZO', '')).toBe(MOTIVI_SCAVALCO[0].testo);
    expect(testoScavalco('MEZZO', 'quota 4')).toBe(`${MOTIVI_SCAVALCO[0].testo} — quota 4`);
  });

  /* Il testo libero non sparisce: chi lo compila sta dicendo qualcosa che
     vale la pena leggere proprio perché ha fatto la fatica di scriverlo. */
  it('senza precompilato resta il libero, e senza nessuno dei due resta vuoto', () => {
    expect(testoScavalco('', 'il muletto non arriva in quota')).toBe('il muletto non arriva in quota');
    expect(testoScavalco(null, null)).toBe('');
    expect(testoScavalco('CODICE-CHE-NON-ESISTE', '')).toBe('');
  });
});
