import { describe, it, expect } from 'vitest';
import { tappeAltrove, richiestaTrasferimento, tappaInAttesa, sitoDiCasa } from '../src/modules/trasferimentiOdp';

/* Una tappa come la costruisce PickRoute.build. */
const tappa = (loc, site, extra = {}) => ({
  seq: extra.seq ?? 1,
  site_id: site,
  location_code: loc,
  item_key: 'ART-1#L1',
  article_code: 'ART-1',
  article_description: 'polvere di prova',
  lot_code: 'L1',
  expiry_iso: '',
  kg_required: extra.kg ?? 30,
  um: extra.um ?? 'KG',
  alternatives: extra.alternatives ?? [{ location_code: 'MAG2-B-02', item_key: 'ART-1#L1', qty_available: 5 }],
  qty_available: extra.disponibili ?? 12,
  status: 'pending',
  reason: '',
  forced_note: '',
  qty_picked: 0,
  done_at: null,
});

describe('sitoDiCasa', () => {
  /* M03 ha due tappe, MAG1 una: e' la forma dell'ODP vero del 19/08. */
  const stops = [tappa('M03-A-01', 'M03'), tappa('MAG1-B-02', 'MAG1'), tappa('M03-A-02', 'M03')];

  it("e il MAGAZZINO CON PIU PRELIEVI: si va dove c e il grosso", () => {
    expect(sitoDiCasa(stops, ['MAG', 'MAG1', 'M03'])).toBe('M03');
  });

  it("i piu prelievi battono l ordine di visita, anche se lo contraddicono", () => {
    expect(sitoDiCasa(stops, ['MAG1', 'M03'])).toBe('M03');
  });

  it("un ordine di visita che parte da un sito non toccato non sposta niente", () => {
    expect(sitoDiCasa(stops, ['MAG', 'M06'])).toBe('M03');
    expect(sitoDiCasa(stops, [])).toBe('M03');
    expect(sitoDiCasa(stops, null)).toBe('M03');
  });

  it("A PARITA decide l ordine di visita: due siti pari sono equivalenti", () => {
    const pari = [tappa('M03-A-01', 'M03'), tappa('MAG1-B-02', 'MAG1')];
    expect(sitoDiCasa(pari, ['MAG1', 'M03'])).toBe('MAG1');
    expect(sitoDiCasa(pari, ['M03', 'MAG1'])).toBe('M03');
  });

  it("a parita e senza ordine di visita, casa e la prima tappa", () => {
    const pari = [tappa('MAG1-B-02', 'MAG1'), tappa('M03-A-01', 'M03')];
    expect(sitoDiCasa(pari, [])).toBe('MAG1');
  });

  it("un sito solo: e quello, e non c e nessun altrove", () => {
    const uno = [tappa('M03-A-01', 'M03')];
    expect(sitoDiCasa(uno, ['MAG', 'M03'])).toBe('M03');
    expect(tappeAltrove(uno, sitoDiCasa(uno, ['MAG', 'M03']))).toEqual([]);
  });

  it("nessuna tappa: nessuna casa", () => {
    expect(sitoDiCasa([], ['MAG'])).toBe('');
    expect(sitoDiCasa(null, ['MAG'])).toBe('');
  });

  it("CON LA CASA GIUSTA l avviso si accende su una parte, non su tutto", () => {
    const casa = sitoDiCasa(stops, ['MAG', 'M03', 'MAG1']);
    expect(tappeAltrove(stops, casa).map(f => f.tappa.location_code)).toEqual(['MAG1-B-02']);
  });
});

describe('tappeAltrove', () => {
  const stops = [
    tappa('MAG1-A-01', 'MAG1'),
    tappa('MAG2-C-09', 'MAG2'),
    tappa('MAG1-A-02', 'MAG1'),
    tappa('MAG3-D-01', 'MAG3'),
  ];

  it('sono le tappe che NON stanno nel magazzino di partenza', () => {
    const fuori = tappeAltrove(stops, 'MAG1');
    expect(fuori.map(f => f.tappa.location_code)).toEqual(['MAG2-C-09', 'MAG3-D-01']);
  });

  it('il nome del sito si mostra per esteso: «MAG2» non dice niente a chi decide', () => {
    const fuori = tappeAltrove(stops, 'MAG1', (id) => id === 'MAG2' ? 'Deposito esterno' : id);
    expect(fuori[0].site_name).toBe('Deposito esterno');
    expect(fuori[1].site_name).toBe('MAG3');
  });

  it('un magazzino solo: nessun altrove', () => {
    expect(tappeAltrove([tappa('MAG1-A-01', 'MAG1')], 'MAG1')).toEqual([]);
  });

  it('senza sito di partenza non si dichiara nessuna tappa lontana', () => {
    expect(tappeAltrove(stops, '')).toEqual([]);
    expect(tappeAltrove(stops, null)).toEqual([]);
  });

  it('una tappa senza sito non e\' «altrove»: e\' un dato che manca', () => {
    expect(tappeAltrove([tappa('X-01', '')], 'MAG1')).toEqual([]);
  });

  it('nessuna tappa: nessun elenco, nessun errore', () => {
    expect(tappeAltrove([], 'MAG1')).toEqual([]);
    expect(tappeAltrove(null, 'MAG1')).toEqual([]);
  });
});

describe('richiestaTrasferimento', () => {
  const t = tappa('MAG2-C-09', 'MAG2', { kg: 30, um: 'KG' });

  it('nasce un TRANSFER con articolo, lotto, quantita\' e le due ubicazioni', () => {
    const r = richiestaTrasferimento(t, 'MAG1-RIC-01');
    expect(r.type).toBe('TRANSFER');
    expect(r.payload).toMatchObject({
      article_code: 'ART-1', lot_code: 'L1', qty_uom: 30, uom: 'KG',
      from: 'MAG2-C-09', to: 'MAG1-RIC-01',
    });
  });

  it('la quantita\' e\' quella che l\'ordine chiede, non quella disponibile', () => {
    const r = richiestaTrasferimento(tappa('MAG2-C-09', 'MAG2', { kg: 30, disponibili: 500 }), 'MAG1-RIC-01');
    expect(r.payload.qty_uom).toBe(30);
    expect(r.payload.qty).toBeUndefined();
  });

  it('l\'ordine che l\'ha chiesto resta scritto: e\' il perche\' del compito', () => {
    const r = richiestaTrasferimento(t, 'MAG1-RIC-01', { odp_num: 'ODP-4471' });
    expect(r.payload.odp_num).toBe('ODP-4471');
    expect(r.note).toContain('ODP-4471');
    expect(r.note).toContain('30 KG da MAG2-C-09 a MAG1-RIC-01');
  });

  it('senza numero d\'ordine la nota dice comunque da dove nasce', () => {
    expect(richiestaTrasferimento(t, 'MAG1-RIC-01').note)
      .toContain('Richiesto da un ordine di produzione');
  });

  it('l\'ubicazione di ricezione si maiuscola e si ripulisce', () => {
    expect(richiestaTrasferimento(t, '  mag1-ric-01 ').payload.to).toBe('MAG1-RIC-01');
  });

  it('senza ubicazione di ricezione non nasce niente', () => {
    expect(richiestaTrasferimento(t, '')).toBe(null);
    expect(richiestaTrasferimento(t, null)).toBe(null);
    expect(richiestaTrasferimento(t, '   ')).toBe(null);
  });

  it('DA UN VANO A SE STESSO NON E\' UN TRASFERIMENTO: non nasce', () => {
    expect(richiestaTrasferimento(t, 'MAG2-C-09')).toBe(null);
    expect(richiestaTrasferimento(t, 'mag2-c-09')).toBe(null);
  });

  it('priorita\' normale di serie, alzabile da chi puo\'', () => {
    expect(richiestaTrasferimento(t, 'MAG1-RIC-01').priority).toBe(2);
    expect(richiestaTrasferimento(t, 'MAG1-RIC-01', { priorita: 4 }).priority).toBe(4);
  });

  it('nessuna tappa: nessuna richiesta', () => {
    expect(richiestaTrasferimento(null, 'MAG1-RIC-01')).toBe(null);
  });
});

describe('tappaInAttesa', () => {
  const t = tappa('MAG2-C-09', 'MAG2');

  it('la tappa si sposta sull\'ubicazione di ricezione, e resta un prelievo', () => {
    const n = tappaInAttesa(t, 'MAG1-RIC-01', 'MAG1', 'TA-XYZ');
    expect(n.location_code).toBe('MAG1-RIC-01');
    expect(n.site_id).toBe('MAG1');
    expect(n.status).toBe('pending');
    expect(n.article_code).toBe('ART-1');
    expect(n.kg_required).toBe(30);
  });

  it('le ALTERNATIVE si buttano: erano nel magazzino che si voleva evitare', () => {
    expect(tappaInAttesa(t, 'MAG1-RIC-01', 'MAG1', 'TA-XYZ').alternatives).toEqual([]);
  });

  it('nel vano di arrivo, adesso, non c\'e\' niente: la disponibilita\' e\' zero', () => {
    expect(tappaInAttesa(t, 'MAG1-RIC-01', 'MAG1', 'TA-XYZ').qty_available).toBe(0);
  });

  it('la tappa dice da dove arriva e con quale compito', () => {
    const n = tappaInAttesa(t, 'MAG1-RIC-01', 'MAG1', 'TA-XYZ');
    expect(n.forced_note).toContain('MAG2-C-09');
    expect(n.forced_note).toContain('TA-XYZ');
  });

  it('senza compito lo dice lo stesso, invece di tacere', () => {
    expect(tappaInAttesa(t, 'MAG1-RIC-01', 'MAG1', null).forced_note)
      .toContain('trasferimento richiesto');
  });

  it('l\'originale non si tocca', () => {
    tappaInAttesa(t, 'MAG1-RIC-01', 'MAG1', 'TA-XYZ');
    expect(t.location_code).toBe('MAG2-C-09');
    expect(t.alternatives).toHaveLength(1);
  });

  it('senza ubicazione di ricezione non si sposta niente', () => {
    expect(tappaInAttesa(t, '', 'MAG1', 'TA-XYZ')).toBe(null);
    expect(tappaInAttesa(null, 'MAG1-RIC-01', 'MAG1', 'TA-XYZ')).toBe(null);
  });
});
