import { describe, it, expect } from 'vitest';
import {
  normalizzaPIva, normalizzaNome, chiaveDestinatario, chiaveDestinazione,
  stessaDestinazione, destinazioneVuota, trovaDestinatario, cerca,
  differenze, componiDestinazione, componiDestinatario, conDestinazione,
  destinazionePredefinita, descriviDestinazione,
} from '../src/modules/destinatari';

const T0 = Date.parse('2026-08-13T10:00:00Z');

const rossi = () => ({
  rcp_id: 'RC-1', name: 'Rossi S.r.l.', vat: 'IT01234567890',
  destinations: [
    { dest_id: 'DE-1', label: 'Sede', address: 'Via Roma 1', zip: '20100', city: 'Milano', province: 'MI', predefinita: true },
  ],
});

describe('normalizzazione', () => {
  it('la partita IVA perde spazi e punteggiatura', () => {
    expect(normalizzaPIva('IT 012 345 678 90')).toBe('IT01234567890');
    expect(normalizzaPIva('it-01234567890')).toBe('IT01234567890');
    expect(normalizzaPIva(null)).toBe('');
  });

  it('il nome perde forma societaria e punteggiatura', () => {
    expect(normalizzaNome('Rossi S.r.l.')).toBe('ROSSI');
    expect(normalizzaNome('ROSSI SRL')).toBe('ROSSI');
    expect(normalizzaNome('  Rossi   S.p.A. ')).toBe('ROSSI');
  });

  /* Due nomi diversi restano diversi: la normalizzazione toglie il rumore,
     non la sostanza. Se collassasse anche questi, due clienti diventerebbero
     uno e i DDT finirebbero sotto la ragione sociale sbagliata. */
  it('due nomi davvero diversi non collassano', () => {
    expect(normalizzaNome('Rossi Srl')).not.toBe(normalizzaNome('Bianchi Srl'));
  });
});

/* ── D20, la decisione che questo modulo esiste per tenere ──────────── */

describe('chiaveDestinatario', () => {
  it('due grafie della stessa ragione sociale sono lo stesso destinatario', () => {
    const a = { name: 'Rossi Srl', vat: 'IT01234567890' };
    const b = { name: 'ROSSI S.R.L.', vat: 'IT 01234567890' };
    expect(chiaveDestinatario(a)).toBe(chiaveDestinatario(b));
  });

  it('la partita IVA vince sul nome: nomi diversi, stesso soggetto', () => {
    const a = { name: 'Rossi Srl', vat: 'IT01234567890' };
    const b = { name: 'Rossi Alimentari', vat: 'IT01234567890' };
    expect(chiaveDestinatario(a)).toBe(chiaveDestinatario(b));
  });

  /* Un DDT a un privato non ha partita IVA, e senza ripiego sul nome
     genererebbe un record nuovo a ogni documento: l'anagrafica si
     riempirebbe di doppioni proprio dove serve di piu' che non lo faccia. */
  it('senza partita IVA si ripiega sul nome normalizzato', () => {
    expect(chiaveDestinatario({ name: 'Mario Rossi' })).toBe('N:MARIO ROSSI');
    expect(chiaveDestinatario({ name: 'Rossi Srl' })).toBe('N:ROSSI');
  });

  it('il codice fiscale vale quando la partita IVA non c e', () => {
    expect(chiaveDestinatario({ name: 'X', fiscal_code: 'RSSMRA80A01H501U' }))
      .toBe('P:RSSMRA80A01H501U');
  });

  it('senza niente non c e chiave, e quindi non c e record', () => {
    expect(chiaveDestinatario({})).toBe('');
    expect(chiaveDestinatario(null)).toBe('');
  });
});

describe('chiaveDestinazione', () => {
  it('l etichetta non fa una destinazione diversa', () => {
    const a = { label: 'Sede', address: 'Via Roma 1', zip: '20100', city: 'Milano' };
    const b = { label: 'Magazzino', address: 'VIA ROMA 1', zip: '20100', city: 'MILANO' };
    expect(stessaDestinazione(a, b)).toBe(true);
  });

  it('un indirizzo diverso e una destinazione diversa', () => {
    expect(stessaDestinazione(
      { address: 'Via Roma 1', zip: '20100', city: 'Milano' },
      { address: 'Via Po 9', zip: '20100', city: 'Milano' })).toBe(false);
  });

  it('due vuote non sono la stessa destinazione, sono due campi in bianco', () => {
    expect(stessaDestinazione({}, {})).toBe(false);
    expect(destinazioneVuota({})).toBe(true);
    expect(destinazioneVuota({ label: 'Sede' })).toBe(true);
    expect(destinazioneVuota({ city: 'Milano' })).toBe(false);
  });
});

describe('trovaDestinatario e cerca', () => {
  it('trova per partita IVA scritta come capita', () => {
    expect(trovaDestinatario([rossi()], { name: 'X', vat: 'it 01234567890' })?.rcp_id).toBe('RC-1');
  });

  it('non inventa un riscontro quando non c e chiave', () => {
    expect(trovaDestinatario([rossi()], {})).toBe(null);
    expect(trovaDestinatario(null, { vat: 'IT01234567890' })).toBe(null);
  });

  it('la ricerca prende nome e partita IVA, e tace sotto due caratteri', () => {
    expect(cerca([rossi()], 'ros').map(r => r.rcp_id)).toEqual(['RC-1']);
    expect(cerca([rossi()], '0123').map(r => r.rcp_id)).toEqual(['RC-1']);
    expect(cerca([rossi()], 'r')).toEqual([]);
    expect(cerca([rossi()], 'bianchi')).toEqual([]);
  });
});

/* ── «Permanente o spot»: la domanda ha senso solo se si vede cosa cambia ── */

describe('differenze', () => {
  it('dice cosa cambierebbe, campo per campo', () => {
    const d = differenze(rossi(), { name: 'Rossi Alimentari Srl', city: 'Torino' }, rossi().destinations[0]);
    expect(d.map(x => x.campo).sort()).toEqual(['city', 'name']);
    expect(d.find(x => x.campo === 'city')).toMatchObject({ prima: 'Milano', dopo: 'Torino' });
  });

  /* UN CAMPO NON COMPILATO NON E' UNA CANCELLAZIONE. Chi compila un DDT
     lascia in bianco cio' che non gli serve, e trattarlo come «togli» vuol
     dire svuotare l'anagrafica a forza di documenti frettolosi. */
  it('un campo vuoto sul DDT non cancella niente', () => {
    expect(differenze(rossi(), { name: '', city: '' }, rossi().destinations[0])).toEqual([]);
  });

  it('su un destinatario nuovo tutto cio che e scritto e una differenza', () => {
    const d = differenze(null, { name: 'Nuovo Srl', city: 'Bari' });
    expect(d.map(x => x.campo).sort()).toEqual(['city', 'name']);
    expect(d[0].prima).toBe('');
  });

  it('niente di cambiato, niente da chiedere', () => {
    const d = differenze(rossi(), { name: 'Rossi S.r.l.', city: 'Milano', address: 'Via Roma 1' },
      rossi().destinations[0]);
    expect(d).toEqual([]);
  });
});

describe('composizione', () => {
  it('un destinatario nuovo nasce con la sua destinazione, predefinita', () => {
    const r = componiDestinatario(
      { name: ' Nuovo Srl ', vat: 'it 999', address: 'Via Po 9', city: 'Torino' },
      'RC-9', 'DE-9', T0);
    expect(r.name).toBe('Nuovo Srl');
    expect(r.vat).toBe('IT999');
    expect(r.destinations).toHaveLength(1);
    expect(r.destinations[0]).toMatchObject({ dest_id: 'DE-9', predefinita: true, city: 'Torino' });
  });

  it('senza indirizzo il destinatario nasce lo stesso, e senza destinazioni', () => {
    const r = componiDestinatario({ name: 'Solo Nome' }, 'RC-9', 'DE-9', T0);
    expect(r.destinations).toEqual([]);
    expect(r.vat).toBeUndefined();
  });

  it('i campi vuoti non finiscono nel record', () => {
    const d = componiDestinazione({ address: 'Via Po 9', city: '', label: '  ' }, 'DE-9', T0);
    expect(d).toEqual({ dest_id: 'DE-9', created_at: T0, address: 'Via Po 9' });
  });
});

/* ── La riga della nota: una destinazione diversa SI AGGIUNGE ───────── */

describe('conDestinazione', () => {
  it('una destinazione nuova si aggiunge accanto, non al posto', () => {
    const { record, aggiunta, dest } = conDestinazione(
      rossi(), { label: 'Deposito', address: 'Via Po 9', zip: '10100', city: 'Torino' }, 'DE-2', T0);
    expect(aggiunta).toBe(true);
    expect(record.destinations).toHaveLength(2);
    expect(record.destinations[0].address).toBe('Via Roma 1');   // la sede resta
    expect(dest.dest_id).toBe('DE-2');
    expect(dest.predefinita).toBeUndefined();                    // la prima resta la predefinita
  });

  it('la stessa destinazione non si sdoppia, e torna quella che c era', () => {
    const { record, aggiunta, dest } = conDestinazione(
      rossi(), { label: 'Altro nome', address: 'VIA ROMA 1', zip: '20100', city: 'MILANO' }, 'DE-2', T0);
    expect(aggiunta).toBe(false);
    expect(record.destinations).toHaveLength(1);
    expect(dest.dest_id).toBe('DE-1');
  });

  it('su un destinatario senza destinazioni la prima diventa predefinita', () => {
    const vuoto = { rcp_id: 'RC-2', name: 'Vuoto', destinations: [] };
    const { record } = conDestinazione(vuoto, { address: 'Via Po 9', city: 'Torino' }, 'DE-2', T0);
    expect(record.destinations[0].predefinita).toBe(true);
  });

  it('un indirizzo in bianco non aggiunge niente', () => {
    const { record, aggiunta } = conDestinazione(rossi(), { label: 'Solo etichetta' }, 'DE-2', T0);
    expect(aggiunta).toBe(false);
    expect(record.destinations).toHaveLength(1);
  });
});

describe('destinazionePredefinita e descrivi', () => {
  it('propone quella marcata, o la prima', () => {
    expect(destinazionePredefinita(rossi()).dest_id).toBe('DE-1');
    const senza = { rcp_id: 'X', name: 'X', destinations: [{ dest_id: 'DE-7', city: 'Bari' }] };
    expect(destinazionePredefinita(senza).dest_id).toBe('DE-7');
    expect(destinazionePredefinita({ rcp_id: 'X', name: 'X', destinations: [] })).toBe(null);
    expect(destinazionePredefinita(null)).toBe(null);
  });

  it('si legge su una riga sola', () => {
    expect(descriviDestinazione(rossi().destinations[0])).toBe('Via Roma 1 — 20100 Milano (MI)');
    expect(descriviDestinazione(null)).toBe('');
  });
});
