/* L'ATTIVITÀ DI SPEDIZIONE NON SI CHIUDE A META' — 2.38
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 2.37 un'attività di spedizione nasceva col DDT e MORIVA alla
   fine del percorso di prelievo. Il carico del camion era una schermata a
   parte che nessuna coda nominava, e l'imballaggio non era di nessuno: due
   dei tre lavori vivevano a voce, che è esattamente la cosa che quella coda
   esiste per togliere.

   Dalla 2.38 il pezzo finito RESTITUISCE il compito, e a chiuderlo è
   l'uscita della merce. Le due strade nuove sono qui sotto, e queste prove
   cercano di far sbagliare l'una e l'altra.

   ── PERCHE' SI STUBBA `_moveTask` ──────────────────────────────────────
   Quel metodo scrive su Persistence e sulla cache, che a `npm test` non ci
   sono. Quel che qui va difeso non è la scrittura — è la GUARDIA e la
   DESTINAZIONE: chi può passare, in che stato si finisce, e che cosa si
   porta dietro. Stubbandolo si legge esattamente quello, e una guardia che
   cede si vede subito.

   ── I CASI CHE ROMPONO ─────────────────────────────────────────────────
   · La sessione di UN ALTRO compito. Senza il controllo, un percorso
     qualunque potrebbe scaricare in coda un'attività qualunque — e chi
     l'aveva in mano la ritroverebbe libera senza aver fatto niente.
   · La sigla che RESTA attaccata. Un'attività «in coda» col nome di
     qualcuno sopra è la coda che gli altri saltano: chi ha il transpallet
     non è chi ha il muletto in banchina.
   · Un compito GIA' CHIUSO. Rimetterlo in coda vorrebbe dire riaprire un
     fatto, e in questo progetto uno stato chiuso non ha frecce in uscita.
   · Il documento di UN ALTRO DDT. `chiudiCompitiDelDocumento` cerca per
     `payload.doc_id`: se prendesse anche gli altri, evadere un documento ne
     chiuderebbe le attività a caso.
   · Un compito che NON È di spedizione. Una conta che nomina lo stesso
     documento non ha niente a che fare con l'uscita di quella merce.
   · La chiusura CHE FALLISCE su uno solo. La merce è già uscita: fermarsi
     lì lascerebbe gli altri compiti aperti, e non farebbe tornare indietro
     il camion. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../src/core/store';

const METODI = ['_moveTask', 'getTask', 'getCurrentIdentity', 'cancelTask'];
const originali = {};

/** Quel che `_moveTask` si è sentito chiedere. */
let mosse;
/** Quel che `cancelTask` si è sentito chiedere. */
let annullati;

const compito = (extra = {}) => ({
  task_id: 'TA-1',
  type: 'PREP_SHIP',
  status: 'in_progress',
  assigned_to: 'AS',
  started_at: 1000,
  payload: { doc_id: 'SHIP-1', ddt_num: 'DDT-1' },
  ...extra,
});

beforeEach(() => {
  for (const m of METODI) originali[m] = Store[m];
  mosse = [];
  annullati = [];
  Store.getCurrentIdentity = () => ({ initials: 'MR' });
  Store._moveTask = async (id, stato, patch) => {
    mosse.push({ id, stato, patch });
    return { ...compito({ task_id: id }), ...patch, status: stato };
  };
  Store.cancelTask = async (id, motivo) => {
    annullati.push({ id, motivo });
    return compito({ task_id: id, status: 'cancelled' });
  };
});

afterEach(() => {
  for (const m of METODI) Store[m] = originali[m];
});

/* ═══ IL PEZZO FINITO TORNA IN CODA ══════════════════════════════════ */

describe('rimettiInCodaSpedizione', () => {
  const sessione = (extra = {}) => ({ session_id: 'PS-1', task_id: 'TA-1', ...extra });

  it('torna in coda LIBERA, e senza avvio: ne comincia un altro', async () => {
    Store.getTask = () => compito();
    await Store.rimettiInCodaSpedizione('TA-1', sessione(), 'Merce radunata');
    expect(mosse).toHaveLength(1);
    expect(mosse[0].stato).toBe('requested');
    expect(mosse[0].patch.assigned_to).toBeNull();
    expect(mosse[0].patch.started_at).toBeNull();
  });

  it('scrive CHE COSA e stato fatto e da chi: la coda deve poterlo dire', async () => {
    Store.getTask = () => compito();
    await Store.rimettiInCodaSpedizione('TA-1', sessione(), 'Imballato · unità UDC-9');
    expect(mosse[0].patch.payload.ultimo_passo).toBe('Imballato · unità UDC-9');
    expect(mosse[0].patch.payload.ultimo_passo_da).toBe('MR');
    /* Il payload di prima non si butta: il documento resta nominato. */
    expect(mosse[0].patch.payload.doc_id).toBe('SHIP-1');
  });

  it('LA SESSIONE DI UN ALTRO COMPITO NON SCARICA QUESTO', async () => {
    Store.getTask = () => compito();
    await expect(Store.rimettiInCodaSpedizione('TA-1', sessione({ task_id: 'TA-9' })))
      .rejects.toThrow(/non è quella del compito/i);
    expect(mosse).toEqual([]);
  });

  it('senza sessione non si rimette in coda niente', async () => {
    Store.getTask = () => compito();
    await expect(Store.rimettiInCodaSpedizione('TA-1', null)).rejects.toThrow();
    expect(mosse).toEqual([]);
  });

  it('senza compito non si rimette in coda niente', async () => {
    Store.getTask = () => null;
    await expect(Store.rimettiInCodaSpedizione('TA-1', sessione())).rejects.toThrow(/non esiste/i);
    expect(mosse).toEqual([]);
  });

  it('UN COMPITO GIA CHIUSO RESTA CHIUSO — non si riapre un fatto', async () => {
    for (const stato of ['done', 'cancelled']) {
      Store.getTask = () => compito({ status: stato });
      const r = await Store.rimettiInCodaSpedizione('TA-1', sessione());
      expect(r.status).toBe(stato);
    }
    expect(mosse).toEqual([]);
  });
});

/* ═══ IL DOCUMENTO CHE ESCE CHIUDE LA SUA ATTIVITA' ══════════════════ */

describe('chiudiCompitiDelDocumento', () => {
  const conCoda = (compiti) => { Store._cache.tasks = compiti; };
  let codaPrima;

  beforeEach(() => { codaPrima = Store._cache.tasks; });
  afterEach(() => { Store._cache.tasks = codaPrima; });

  it('il DDT evaso chiude la sua attivita, e la firma', async () => {
    conCoda([compito()]);
    const { chiusi, falliti } = await Store.chiudiCompitiDelDocumento('SHIP-1', 'evaded');
    expect(chiusi).toEqual(['TA-1']);
    expect(falliti).toEqual([]);
    expect(mosse[0].stato).toBe('done');
    expect(mosse[0].patch.completed_by).toBe('MR');
  });

  it('IL DOCUMENTO DI UN ALTRO DDT NON SI TOCCA', async () => {
    conCoda([compito({ task_id: 'TA-2', payload: { doc_id: 'SHIP-9' } }), compito()]);
    const { chiusi } = await Store.chiudiCompitiDelDocumento('SHIP-1', 'evaded');
    expect(chiusi).toEqual(['TA-1']);
  });

  it('UN COMPITO CHE NON E DI SPEDIZIONE NON SI CHIUDE, anche se nomina il DDT', async () => {
    conCoda([compito({ task_id: 'TA-3', type: 'COUNT' })]);
    expect((await Store.chiudiCompitiDelDocumento('SHIP-1', 'evaded')).chiusi).toEqual([]);
    expect(mosse).toEqual([]);
  });

  it('un compito gia chiuso non si richiude', async () => {
    conCoda([compito({ status: 'done' }), compito({ task_id: 'TA-4', status: 'cancelled' })]);
    expect((await Store.chiudiCompitiDelDocumento('SHIP-1', 'evaded')).chiusi).toEqual([]);
  });

  it('il DDT annullato ANNULLA la sua attivita, col motivo', async () => {
    conCoda([compito()]);
    const { chiusi: toccati } = await Store.chiudiCompitiDelDocumento('SHIP-1', 'cancelled');
    expect(toccati).toEqual(['TA-1']);
    expect(annullati[0].motivo).toMatch(/annullato/i);
    /* Non si chiude come «fatto»: nessuno l'ha fatto. */
    expect(mosse).toEqual([]);
  });

  it('LA MERCE E GIA USCITA: se uno non si chiude, gli altri si chiudono lo stesso', async () => {
    conCoda([compito(), compito({ task_id: 'TA-5' })]);
    Store._moveTask = async (id, stato, patch) => {
      if (id === 'TA-1') throw new Error('scrittura non riuscita');
      mosse.push({ id, stato, patch });
      return { task_id: id, status: stato };
    };
    const { chiusi, falliti } = await Store.chiudiCompitiDelDocumento('SHIP-1', 'evaded');
    expect(chiusi).toEqual(['TA-5']);
    /* ═══ 2.38.2 · E QUEL CHE NON SI È CHIUSO TORNA A CHI CHIAMA ════════

       Fino alla 2.38.1 il motivo finiva in `console.error` e in nessun
       altro posto. Chi lavora non apre gli strumenti del browser: quel che
       restava a video era un'attivita' «in corso» che nessuna schermata
       sapeva piu' chiudere. Visto in magazzino il 09/09 — merce caricata,
       DDT evaso, attivita' ferma in carico a chi l'aveva presa.

       La merce esce lo stesso, e quella regola resta: rifiutare l'evasione
       perche' un compito non si chiude vorrebbe dire un DDT pendente su
       merce che sta su un camion. Ma il silenzio no. */
    expect(falliti).toEqual([{ task_id: 'TA-1', motivo: 'scrittura non riuscita' }]);
  });

  it('senza documento non esplode', async () => {
    conCoda([compito()]);
    expect((await Store.chiudiCompitiDelDocumento('', 'evaded')).chiusi).toEqual([]);
  });
});
