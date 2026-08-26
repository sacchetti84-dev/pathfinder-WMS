import { describe, it, expect } from 'vitest';
import {
  chiaveMerce, caseDelLotto, verdettoCasa,
  udcConsigliata, scavalcoUdc,
  MOTIVI_SCAVALCO, testoScavalco, REGOLE_BASE,
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

describe('2.9 — la regola che GUIDA, e non blocca piu\u2019 niente', () => {
  const righe = [riga('A-01', '7001', 'L1', 5)];

  /* LA PROVA CHE VALE PIU\u2019 DI TUTTE. Fino alla 2.8 questo modulo aveva un
     campo `vietato`, e chi lo leggeva rifiutava l'operazione. Non c'e\u2019 piu\u2019:
     se un giorno tornasse, tornerebbe anche il cancello che la 2.9 ha tolto,
     e questa riga se ne accorge. */
  it('NESSUN verdetto porta piu\u2019 un divieto', () => {
    const casi = [
      verdettoCasa([], '7001', 'L1', 'B-99'),
      verdettoCasa(righe, '7001', 'L1', 'A-01'),
      verdettoCasa(righe, '7001', 'L1', 'B-02', () => ({ ok: true })),
      verdettoCasa(righe, '7001', 'L1', 'B-02', () => ({ ok: false, motivo: 'piena' })),
    ];
    for (const v of casi) expect(v.vietato).toBeUndefined();
  });

  it('un lotto mai visto non ha niente da suggerire, e non e\u2019 un errore', () => {
    const v = verdettoCasa([], '7001', 'L1', 'B-99');
    expect(v.esito).toBe('primo');
    expect(v.segnala).toBe(false);
    expect(v.suggerita).toBeNull();
  });

  it('il vano di casa e\u2019 quello giusto, e lo conferma', () => {
    const v = verdettoCasa(righe, '7001', 'L1', 'A-01');
    expect(v.esito).toBe('casa');
    expect(v.suggerita).toBe('A-01');
    expect(v.casaLibera).toBe('A-01');
  });

  /* IL CUORE DEL MODELLO GUIDATO: il campo si precompila con `suggerita`, e
     il messaggio dice dove va la merce invece di dire che non si puo\u2019. */
  it('guardando altrove, SUGGERISCE la casa e dice dove portarla', () => {
    const v = verdettoCasa(righe, '7001', 'L1', 'B-02', () => ({ ok: true }));
    expect(v.esito).toBe('altrove');
    expect(v.segnala).toBe(true);
    expect(v.suggerita).toBe('A-01');
    expect(v.messaggio).toContain('A-01');
    /* Il tono conta: e\u2019 un'indicazione, non un rifiuto. */
    expect(v.messaggio).not.toContain('non si scavalca');
  });

  /* Quando casa non puo\u2019 ricevere non si suggerisce niente: sceglie il
     motore fra i vani liberi, e mandare qualcuno su un vano pieno e\u2019 il
     modo di far smettere di leggere i suggerimenti. */
  it('se casa non puo\u2019 ricevere, il lotto si estende e non si suggerisce', () => {
    const v = verdettoCasa(righe, '7001', 'L1', 'B-02',
      () => ({ ok: false, motivo: 'piena \u2014 ci stanno 10 colli e ce ne sono 10' }));
    expect(v.esito).toBe('estensione');
    expect(v.suggerita).toBeNull();
    expect(v.casaLibera).toBeNull();
    expect(v.messaggio).toContain('piena');
  });

  it('fra due case si suggerisce la prima che puo\u2019 ricevere', () => {
    const due = [riga('A-01', '7001', 'L1', 5), riga('A-02', '7001', 'L1', 2)];
    const v = verdettoCasa(due, '7001', 'L1', 'C-03',
      (c) => (c === 'A-01' ? { ok: false, motivo: 'bloccata' } : { ok: true }));
    expect(v.suggerita).toBe('A-02');
  });

  /* Un vincolo che non si conosce non e\u2019 un vincolo che si viola: la stessa
     regola della capienza in `stoccaggio.ts`. */
  it('senza modo di valutare casa, casa si considera disponibile', () => {
    const v = verdettoCasa(righe, '7001', 'L1', 'B-02', null);
    expect(v.suggerita).toBe('A-01');
  });

  it('tutte e due le regole base sono dichiarate scavalcabili', () => {
    for (const r of REGOLE_BASE) expect(r.override).toBe(true);
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
