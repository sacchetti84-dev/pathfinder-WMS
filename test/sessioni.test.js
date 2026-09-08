/* QUALE SESSIONE È LA MIA — 2.30
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Fino alla 2.29 la domanda non esisteva: di sessione di prelievo ne viveva
   UNA per tutto l'impianto, `startPickSession` faceva `clear` e poi `put`, e
   avviare un percorso chiudeva quello di chiunque altro — in silenzio, senza
   lasciare traccia. Ha retto finché il prelievo nasceva da un file caricato
   a mano da una persona sola.

   Dalla 2.30 il prelievo nasce da un'attività presa in carico, e due
   operatori possono prenderne due nello stesso momento. La domanda diventa
   necessaria, e la risposta sta tutta qui: `Store` apre e chiude, questo
   modulo sceglie.

   PERCHÉ SI SCEGLIE PER OPERATORE. Un terminale non ha un'identità che
   sopravviva a un ricaricamento della pagina; una sigla sì. Chi torna al
   banco dopo aver chiuso il browser deve ritrovare il SUO percorso, non
   quello che per caso è stato aperto per ultimo — che è quel che sarebbe
   successo tenendo la regola vecchia con due sessioni a database.

   Le prove qui sotto provano a far restituire la sessione sbagliata in nove
   modi: sigla con spazi, sigla in minuscolo, due sessioni della stessa
   persona, sessioni senza padrone, elenco vuoto, sigla vuota. */
import { describe, it, expect } from 'vitest';
import {
  sessioneDi, sessioneDiCompito, altriInPrelievo, sessioniOrfane,
} from '../src/modules/sessioni';

const T0 = Date.parse('2026-09-21T08:00:00Z');
const ORA = 3600_000;

const sess = (id, operator, extra = {}) => ({
  session_id: id,
  status: 'active',
  created_at: T0,
  operator,
  ...extra,
});

describe('sessioneDi', () => {
  const due = [sess('S1', 'AS'), sess('S2', 'MR')];

  it('rende la sessione di chi chiede, non la prima che trova', () => {
    expect(sessioneDi(due, 'MR').session_id).toBe('S2');
    expect(sessioneDi(due, 'AS').session_id).toBe('S1');
  });

  it('chi non ne ha una non si prende quella di un altro', () => {
    expect(sessioneDi(due, 'EFBR')).toBeNull();
  });

  /* Un lettore di codici a barre incolla volentieri uno spazio in coda, e la
     sigla arriva da un campo che l'operatore digita col guanto. */
  it('spazi e minuscole non cambiano di chi è la sessione', () => {
    expect(sessioneDi(due, ' as ').session_id).toBe('S1');
    expect(sessioneDi(due, 'mr').session_id).toBe('S2');
    expect(sessioneDi([sess('S1', ' AS ')], 'AS').session_id).toBe('S1');
  });

  /* Non deve esistere, ma se esiste vince la più recente: due sessioni della
     stessa sigla vogliono dire che qualcosa si è interrotto a metà, e
     rimettere l'operatore dove stava lavorando davvero è l'unica risposta
     che non gli fa perdere il giro in corso. */
  it('due sessioni della stessa persona: vince la più recente', () => {
    const doppie = [
      sess('VECCHIA', 'AS', { created_at: T0 }),
      sess('NUOVA', 'AS', { created_at: T0 + ORA }),
    ];
    expect(sessioneDi(doppie, 'AS').session_id).toBe('NUOVA');
    expect(sessioneDi(doppie.slice().reverse(), 'AS').session_id).toBe('NUOVA');
  });

  it('e una senza data non scavalca una che ce l\'ha', () => {
    const miste = [sess('CONDATA', 'AS', { created_at: T0 }), sess('SENZA', 'AS', { created_at: undefined })];
    expect(sessioneDi(miste, 'AS').session_id).toBe('CONDATA');
  });

  it('una sessione senza padrone non è di nessuno', () => {
    const orfana = [sess('S1', undefined), sess('S2', ''), sess('S3', '   ')];
    expect(sessioneDi(orfana, 'AS')).toBeNull();
    expect(sessioneDi(orfana, '')).toBeNull();
  });

  it('senza sigla non si indovina', () => {
    expect(sessioneDi(due, null)).toBeNull();
    expect(sessioneDi(due, undefined)).toBeNull();
    expect(sessioneDi(due, '   ')).toBeNull();
  });

  it('senza elenco non esplode', () => {
    expect(sessioneDi(null, 'AS')).toBeNull();
    expect(sessioneDi([], 'AS')).toBeNull();
    expect(sessioneDi([null, undefined], 'AS')).toBeNull();
  });

  it('non tocca l\'elenco che riceve', () => {
    const prima = [sess('S2', 'AS', { created_at: T0 }), sess('S1', 'AS', { created_at: T0 + ORA })];
    const copia = prima.map((s) => s.session_id);
    sessioneDi(prima, 'AS');
    expect(prima.map((s) => s.session_id)).toEqual(copia);
  });
});

/* CHI PRELEVA E CHI HA APERTO — 2.30
   `operator` e' modificabile nella maschera: un Team Leader avvia un giro e
   lo intesta a un altro, e quella sigla finisce sulle righe di registro. Se
   la propria sessione si cercasse per `operator`, il leader che l'ha aperta
   non la ritroverebbe piu' dopo un ricaricamento — e il percorso resterebbe
   a database, invisibile a tutti e due.

   Verificate rimettendo il difetto: cercando per `operator`, la prima e la
   seconda diventano rosse. */
describe('chi ha aperto la sessione, non chi preleva', () => {
  it('un giro intestato a un altro resta di chi l\'ha aperto', () => {
    const giro = [sess('S1', 'MR', { owner: 'AS' })];
    expect(sessioneDi(giro, 'AS').session_id).toBe('S1');
    expect(sessioneDi(giro, 'MR')).toBeNull();
  });

  it('e chi preleva per un altro non se lo vede fra i propri', () => {
    const giro = [sess('S1', 'MR', { owner: 'AS' })];
    expect(altriInPrelievo(giro, 'MR').map((s) => s.session_id)).toEqual(['S1']);
    expect(altriInPrelievo(giro, 'AS')).toEqual([]);
  });

  /* IL RIPIEGO REGGE L'AGGIORNAMENTO. Una sessione scritta prima della 2.30
     `owner` non ce l'ha: senza il ripiego su `operator`, aggiornare mentre
     qualcuno preleva renderebbe il suo percorso irraggiungibile. */
  it('una sessione senza owner risponde ancora a chi preleva', () => {
    const vecchia = [sess('S1', 'AS')];
    expect(sessioneDi(vecchia, 'AS').session_id).toBe('S1');
  });

  it('e un owner vuoto non conta come padrone', () => {
    const monca = [sess('S1', 'AS', { owner: '   ' })];
    expect(sessioneDi(monca, 'AS').session_id).toBe('S1');
    expect(sessioniOrfane(monca)).toEqual([]);
  });

  it('senza ne owner ne operator resta orfana', () => {
    const nulla = [sess('S1', '', { owner: null })];
    expect(sessioneDi(nulla, 'AS')).toBeNull();
    expect(sessioniOrfane(nulla)).toHaveLength(1);
  });
});

describe('sessioneDiCompito', () => {
  const elenco = [
    sess('S1', 'AS', { task_id: 'TA-1' }),
    sess('S2', 'MR', { task_id: 'TA-2' }),
    sess('S3', 'EF'),
  ];

  it('trova la sessione che sta servendo un\'attività', () => {
    expect(sessioneDiCompito(elenco, 'TA-2').session_id).toBe('S2');
  });

  it('un\'attività non ancora cominciata non ha sessione', () => {
    expect(sessioneDiCompito(elenco, 'TA-9')).toBeNull();
  });

  it('una sessione nata da un file a mano non risponde a nessun compito', () => {
    expect(sessioneDiCompito(elenco, null)).toBeNull();
    expect(sessioneDiCompito(elenco, '')).toBeNull();
    /* `S3` non porta `task_id`: non deve farsi trovare da una chiave vuota. */
    expect(sessioneDiCompito(elenco, '   ')).toBeNull();
  });

  it('spazi e minuscole non cambiano l\'attività', () => {
    expect(sessioneDiCompito(elenco, ' ta-1 ').session_id).toBe('S1');
  });

  it('senza elenco non esplode', () => {
    expect(sessioneDiCompito(null, 'TA-1')).toBeNull();
    expect(sessioneDiCompito([null], 'TA-1')).toBeNull();
  });
});

describe('altriInPrelievo', () => {
  const tre = [
    sess('S1', 'AS', { created_at: T0 }),
    sess('S2', 'MR', { created_at: T0 + ORA }),
    sess('S3', 'EF', { created_at: T0 + 2 * ORA }),
  ];

  it('dice chi altro sta prelievando, non chi guarda', () => {
    expect(altriInPrelievo(tre, 'AS').map((s) => s.operator)).toEqual(['EF', 'MR']);
  });

  it('il più recente per primo: è quello che è appena sceso in corsia', () => {
    expect(altriInPrelievo(tre, 'ZZ').map((s) => s.session_id)).toEqual(['S3', 'S2', 'S1']);
  });

  it('le sessioni senza padrone non contano come «un altro»', () => {
    const conOrfana = [...tre, sess('S4', '')];
    expect(altriInPrelievo(conOrfana, 'AS')).toHaveLength(2);
  });

  it('senza sigla li elenca tutti: nessuno è «io»', () => {
    expect(altriInPrelievo(tre, null)).toHaveLength(3);
  });

  it('non tocca l\'elenco che riceve', () => {
    const copia = tre.map((s) => s.session_id);
    altriInPrelievo(tre, 'AS');
    expect(tre.map((s) => s.session_id)).toEqual(copia);
  });

  it('senza elenco non esplode', () => {
    expect(altriInPrelievo(null, 'AS')).toEqual([]);
  });
});

describe('sessioniOrfane', () => {
  /* Una sessione nata prima della 2.30, o scritta da un banco, può non avere
     sigla. `sessioneDi` non la restituisce mai: senza questa funzione
     resterebbe a database senza che nessuno la veda. */
  it('nomina le sessioni che nessuno può reclamare', () => {
    const misto = [sess('S1', 'AS'), sess('S2', undefined), sess('S3', '  ')];
    expect(sessioniOrfane(misto).map((s) => s.session_id)).toEqual(['S2', 'S3']);
  });

  it('con tutte assegnate l\'elenco è vuoto', () => {
    expect(sessioniOrfane([sess('S1', 'AS')])).toEqual([]);
    expect(sessioniOrfane(null)).toEqual([]);
  });
});
