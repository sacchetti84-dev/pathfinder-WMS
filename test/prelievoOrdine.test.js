/* IL PRELIEVO DA ORDINE — 2.5.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Quattro regole nuove, tutte collaudabili da fermo perché stanno nei moduli
   puri e non nella maschera:

   - il VERSO con cui la finestra dei colli si precompila — il prelievo parte
     dagli spaiati, tutto il resto dai pieni — e i due arrotondamenti
     opposti: i pieni prendono l'ultimo collo intero, gli spaiati lo aprono;
   - l'ECCEDENZA rispetto a ciò che l'ordine chiede, che chi conferma vede in
     anteprima invece di scoprirla a merce già uscita;
   - la tappa spostata da un trasferimento, che adesso PORTA CON SÉ il
     compito e il vano di partenza invece di lasciarli in una mappa che muore
     all'avvio del percorso;
   - il conto del tempo fermo, che il report scorpora dalla durata. */

import { describe, it, expect } from 'vitest';
import { raggruppa, riempiFabbisogno, restoDaAprire, eccedenza, espandi, totaleUom } from '../src/modules/colli';
import { tappaInAttesa, richiestaTrasferimento, sitoDiCasa } from '../src/modules/trasferimentiOdp';

/* Una riga di giacenza imballata così: due sacchi pieni e due residui. */
const RIGA = espandi([{ colli: '2', per: '25' }, { colli: '1', per: '10' }, { colli: '2', per: '7' }], 'KG');

/** Quanto esce, date le righe che `riempiFabbisogno` ha proposto. */
function esce(gruppi, righe, uom) {
  return gruppi.reduce((acc, g, i) => acc + g.per * (righe[i] || 0), 0);
}

describe('riempiFabbisogno — il verso', () => {
  const gruppi = raggruppa(RIGA, 'KG');

  it('le misure restano in ordine di riga: dalla più piena', () => {
    expect(gruppi.map(g => g.per)).toEqual([25, 10, 7]);
    expect(gruppi.map(g => g.colli)).toEqual([2, 1, 2]);
  });

  it('dai PIENI: 25 KG si fanno con un sacco solo', () => {
    const righe = riempiFabbisogno(gruppi, { uom: 25 }, 'KG', 'pieni');
    expect(righe).toEqual([1, 0, 0]);
    expect(esce(gruppi, righe, 'KG')).toBe(25);
  });

  it('dagli SPAIATI: 25 KG chiudono i residui e NON sfondano l’ordine', () => {
    const righe = riempiFabbisogno(gruppi, { uom: 25 }, 'KG', 'spaiati');
    /* 2 × 7 = 14, poi il 10 arriva a 24. Il 25 NON si prende: coprirebbe
       l'ultimo chilo con un sacco intero, e il totale andrebbe a 49. */
    expect(righe).toEqual([0, 1, 2]);
    expect(esce(gruppi, righe, 'KG')).toBe(24);
  });

  it('l’ultimo chilo si prende APRENDO il collo più piccolo che basta', () => {
    const righe = riempiFabbisogno(gruppi, { uom: 25 }, 'KG', 'spaiati');
    /* 7 e 10 sono finiti: resta il 25, ed è da lì che si apre. */
    expect(restoDaAprire(gruppi, righe, 25, 'KG')).toEqual({ per: 25, quantita: 1 });
  });

  it('nessuno dei due versi eccede l’ordine su questa riga', () => {
    const pieni   = riempiFabbisogno(gruppi, { uom: 25 }, 'KG', 'pieni');
    const spaiati = riempiFabbisogno(gruppi, { uom: 25 }, 'KG', 'spaiati');
    expect(eccedenza(esce(gruppi, pieni, 'KG'), 25, 'KG')).toBe(0);
    expect(eccedenza(esce(gruppi, spaiati, 'KG'), 25, 'KG')).toBe(-1);
  });

  it('quando il fabbisogno sta tutto nei residui, gli spaiati NON toccano i pieni', () => {
    const righe = riempiFabbisogno(gruppi, { uom: 14 }, 'KG', 'spaiati');
    expect(righe).toEqual([0, 0, 2]);
    expect(esce(gruppi, righe, 'KG')).toBe(14);
  });

  it('il verso predefinito è quello di sempre: dai pieni', () => {
    expect(riempiFabbisogno(gruppi, { uom: 25 }, 'KG'))
      .toEqual(riempiFabbisogno(gruppi, { uom: 25 }, 'KG', 'pieni'));
  });

  it('a COLLI il verso vale lo stesso: tre colli dai pieni non sono tre dagli spaiati', () => {
    expect(riempiFabbisogno(gruppi, { colli: 3 }, 'KG', 'pieni')).toEqual([2, 1, 0]);
    expect(riempiFabbisogno(gruppi, { colli: 3 }, 'KG', 'spaiati')).toEqual([0, 1, 2]);
  });

  it('un fabbisogno più grande della riga prende tutto e non di più', () => {
    const righe = riempiFabbisogno(gruppi, { uom: 9999 }, 'KG', 'spaiati');
    expect(righe).toEqual([2, 1, 2]);
    expect(esce(gruppi, righe, 'KG')).toBe(totaleUom(RIGA, 'KG'));
    /* Non è rimasto niente da aprire: la proposta si ferma qui. */
    expect(restoDaAprire(gruppi, righe, 9999, 'KG')).toBeNull();
  });

  it('un fabbisogno più piccolo di ogni collo non prende niente e ne apre uno', () => {
    const righe = riempiFabbisogno(gruppi, { uom: 5 }, 'KG', 'spaiati');
    expect(righe).toEqual([0, 0, 0]);
    expect(restoDaAprire(gruppi, righe, 5, 'KG')).toEqual({ per: 7, quantita: 5 });
  });

  it('44,42 KG dalla riga vera dell’ODP: interi che stanno dentro, più l’apertura', () => {
    const g = raggruppa(espandi([{ colli: '4', per: '25' }], 'KG'), 'KG');
    const righe = riempiFabbisogno(g, { uom: 44.42 }, 'KG', 'spaiati');
    expect(righe).toEqual([1]);
    expect(restoDaAprire(g, righe, 44.42, 'KG')).toEqual({ per: 25, quantita: 19.42 });
  });

  it('senza fabbisogno le righe nascono a zero, in tutti e due i versi', () => {
    expect(riempiFabbisogno(gruppi, null, 'KG', 'spaiati')).toEqual([0, 0, 0]);
    expect(riempiFabbisogno(gruppi, { uom: 0 }, 'KG', 'spaiati')).toEqual([0, 0, 0]);
  });
});

describe('restoDaAprire', () => {
  const gruppi = raggruppa(RIGA, 'KG');

  it('niente da aprire quando i colli interi coprono l’ordine esatto', () => {
    expect(restoDaAprire(gruppi, [0, 0, 2], 14, 'KG')).toBeNull();
  });

  it('sceglie il più piccolo che BASTA, non il primo libero', () => {
    /* Mancano 8: il 10 basta, il 7 no. Si apre il 10. */
    expect(restoDaAprire(gruppi, [0, 0, 2], 22, 'KG')).toEqual({ per: 10, quantita: 8 });
  });

  it('senza fabbisogno in UM non c’è niente da proporre', () => {
    expect(restoDaAprire(gruppi, [0, 0, 0], null, 'KG')).toBeNull();
    expect(restoDaAprire(gruppi, [0, 0, 0], 0, 'KG')).toBeNull();
  });

  it('mai più di quanto il collo contenga', () => {
    const r = restoDaAprire(gruppi, [2, 1, 2], 999, 'KG');
    expect(r).toBeNull();
  });
});

describe('eccedenza', () => {
  it('positiva quando si porta via più dell’ordine, negativa quando meno', () => {
    expect(eccedenza(49, 25, 'KG')).toBe(24);
    expect(eccedenza(20, 25, 'KG')).toBe(-5);
    expect(eccedenza(25, 25, 'KG')).toBe(0);
  });

  it('null senza un fabbisogno con cui confrontarsi: non si accusa nessuno', () => {
    expect(eccedenza(49, null, 'KG')).toBeNull();
    expect(eccedenza(49, 0, 'KG')).toBeNull();
  });

  it('arrotonda all’unità, non alla deriva del virgola mobile', () => {
    expect(eccedenza(0.3, 0.1, 'KG')).toBe(0.2);
  });
});

/* ── La tappa che aspetta la merce ─────────────────────────────────── */

const TAPPA = {
  seq: 3, site_id: 'MAG1', location_code: 'MAG1-A-01-01-A',
  item_key: 'ART-1#L9', article_code: 'ART-1', article_description: 'Miscela',
  lot_code: 'L9', expiry_iso: '', kg_required: 44.42, um: 'KG',
  alternatives: [{ location_code: 'MAG1-B-02-01-A', item_key: 'ART-1#L9', qty_available: 3 }],
  qty_available: 5, status: 'pending', reason: '', forced_note: '',
  qty_picked: 0, done_at: null,
};

describe('tappaInAttesa — il trasferimento viaggia CON la tappa', () => {
  const spostata = tappaInAttesa(TAPPA, 'M03-RIC-01', 'M03', 'T-0042');

  it('porta il compito e il vano di partenza, che prima morivano all’avvio', () => {
    expect(spostata.transfer_task).toBe('T-0042');
    expect(spostata.transfer_from).toBe('MAG1-A-01-01-A');
  });

  it('la tappa si sposta sul vano di ricezione e resta un prelievo', () => {
    expect(spostata.location_code).toBe('M03-RIC-01');
    expect(spostata.site_id).toBe('M03');
    expect(spostata.status).toBe('pending');
  });

  it('il vano di ricezione è vuoto e le alternative del magazzino lontano si buttano', () => {
    expect(spostata.qty_available).toBe(0);
    expect(spostata.alternatives).toEqual([]);
  });

  it('senza identificativo del compito resta la partenza, che è l’altra metà', () => {
    const senza = tappaInAttesa(TAPPA, 'M03-RIC-01', 'M03', null);
    expect(senza.transfer_task).toBeUndefined();
    expect(senza.transfer_from).toBe('MAG1-A-01-01-A');
  });

  it('la tappa originale non viene toccata', () => {
    expect(TAPPA.location_code).toBe('MAG1-A-01-01-A');
    expect(TAPPA.transfer_task).toBeUndefined();
  });
});

describe('richiestaTrasferimento — la quantità resta nella sua unità', () => {
  it('chiede i chili dell’ordine, e non li chiama colli', () => {
    const r = richiestaTrasferimento(TAPPA, 'M03-RIC-01', { odp_num: 'ODP1' });
    expect(r.payload.qty_uom).toBe(44.42);
    expect(r.payload.uom).toBe('KG');
    expect(r.payload).not.toHaveProperty('qty');
    expect(r.payload.from).toBe('MAG1-A-01-01-A');
    expect(r.payload.to).toBe('M03-RIC-01');
  });

  it('da un vano a se stesso non è un trasferimento', () => {
    expect(richiestaTrasferimento(TAPPA, 'MAG1-A-01-01-A', {})).toBeNull();
  });
});

describe('sitoDiCasa — resta la regola dei più prelievi', () => {
  const stops = [
    { ...TAPPA, site_id: 'M03' }, { ...TAPPA, site_id: 'M03' },
    { ...TAPPA, site_id: 'MAG1' },
  ];
  it('casa è il magazzino con più righe', () => {
    expect(sitoDiCasa(stops, ['MAG1', 'M03'], '')).toBe('M03');
  });
  it('una scelta dichiarata comanda, se ha righe', () => {
    expect(sitoDiCasa(stops, ['MAG1', 'M03'], 'MAG1')).toBe('MAG1');
  });
  it('una scelta senza righe si ignora: un avviso su tutto non dice niente', () => {
    expect(sitoDiCasa(stops, ['MAG1', 'M03'], 'MAG9')).toBe('M03');
  });
});

/* ── Il tempo fermo ────────────────────────────────────────────────── */

/** La stessa somma che fanno `_routeMsInPausa` e il normalizzatore del
    report: una pausa aperta si conta fino ad adesso. */
const msInPausa = (pauses, adesso) =>
  (pauses || []).reduce((acc, x) => acc + Math.max(0, (x.to ?? adesso) - x.from), 0);

describe('il tempo fermo esce dalla durata', () => {
  it('somma le pause chiuse', () => {
    expect(msInPausa([{ from: 1000, to: 4000 }, { from: 9000, to: 10000 }], 99999)).toBe(4000);
  });

  it('una pausa aperta si conta fino ad adesso', () => {
    expect(msInPausa([{ from: 1000, to: null }], 6000)).toBe(5000);
  });

  it('nessuna pausa è zero fermo, non una durata mancante', () => {
    expect(msInPausa([], 6000)).toBe(0);
    expect(msInPausa(undefined, 6000)).toBe(0);
  });

  it('il tempo medio si divide sul netto: un’ora di mensa non è un prelievo lento', () => {
    const durata = 4 * 3600e3;          // 4 ore d'orologio
    const fermo  = msInPausa([{ from: 0, to: 3600e3 }], durata);
    const righe  = 10;
    expect(fermo).toBe(3600e3);
    expect((durata - fermo) / 1000 / righe).toBe(1080);   // 18 minuti a riga
    expect(durata / 1000 / righe).toBe(1440);             // 24, col pranzo dentro
  });
});
