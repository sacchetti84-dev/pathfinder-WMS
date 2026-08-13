import { describe, it, expect } from 'vitest';
import {
  TIPI_COMPITO, PRIORITA, PRIORITA_NORMALE, STATI_APERTI,
  etichettaTipo, etichettaPriorita, etichettaStato,
  transizioneAmmessa, eAperto, componiCompito, validaRichiesta,
  prioritaConsentita, ordinaCoda, misure, inRitardo, riepilogo,
  ORE_URGENZA_DEFAULT, OPERAZIONE, prioritaEffettiva, inScadenza,
  operazioneDi, chiudeAMano, vuoleColli, daGiacenza, vuoleArticolo, vuoleUbicazione,
  quantitaRichiesta, quantitaFatta, residuo, esaurito,
  avanzamento, avvioRitirabile,
} from '../src/modules/compiti';

const T0 = Date.parse('2026-09-21T08:00:00Z');
const ORA = 3600_000;

const compito = (extra = {}) => ({
  task_id: 'TA-1',
  type: 'TRANSFER',
  priority: PRIORITA_NORMALE,
  status: 'requested',
  requested_by: 'AS',
  requested_at: T0,
  assigned_to: null,
  started_at: null,
  completed_at: null,
  due_at: null,
  ...extra,
});

/* ── Le tabelle ─────────────────────────────────────────────────────── */

describe('tabelle', () => {
  it('gli otto tipi del piano, e nessun altro', () => {
    expect(Object.keys(TIPI_COMPITO)).toEqual([
      'TRANSFER', 'PICK_SHIP', 'PICK_RET', 'QUARANTINE',
      'SAMPLING', 'DISPOSAL', 'PUTAWAY', 'COUNT',
    ]);
  });

  it('ogni tipo ha etichetta e icona', () => {
    for (const t of Object.values(TIPI_COMPITO)) {
      expect(t.label.length).toBeGreaterThan(2);
      expect(t.icona.length).toBeGreaterThan(0);
    }
  });

  it('le priorita\' sono quattro e Normale e\' la 2', () => {
    expect(Object.keys(PRIORITA)).toEqual(['1', '2', '3', '4']);
    expect(PRIORITA_NORMALE).toBe(2);
  });

  it('un codice ignoto non inventa un\'etichetta', () => {
    expect(etichettaTipo('BOH')).toBe('BOH');
    expect(etichettaStato('boh')).toBe('boh');
    expect(etichettaPriorita(9)).toBe('9');
  });

  it('le etichette vere si leggono', () => {
    expect(etichettaTipo('SAMPLING')).toBe('Campionamento');
    expect(etichettaPriorita(4)).toBe('Urgente');
    expect(etichettaStato('in_progress')).toBe('In corso');
  });
});

/* ── Il ciclo di vita ───────────────────────────────────────────────── */

describe('transizioni', () => {
  it('il percorso normale e\' ammesso tutto', () => {
    expect(transizioneAmmessa('requested', 'assigned')).toBe(true);
    expect(transizioneAmmessa('assigned', 'in_progress')).toBe(true);
    expect(transizioneAmmessa('in_progress', 'done')).toBe(true);
  });

  it('si puo\' prendere in carico senza passare da assegnato', () => {
    expect(transizioneAmmessa('requested', 'in_progress')).toBe(true);
  });

  it('un compito assegnato si puo\' rimettere in coda', () => {
    expect(transizioneAmmessa('assigned', 'requested')).toBe(true);
  });

  it('si annulla da qualunque stato aperto', () => {
    for (const s of STATI_APERTI) expect(transizioneAmmessa(s, 'cancelled')).toBe(true);
  });

  /* Un compito chiuso e' un fatto: se si e' sbagliato se ne apre un altro,
     non si riscrive la storia. */
  it('da chiuso non si torna indietro', () => {
    expect(transizioneAmmessa('done', 'in_progress')).toBe(false);
    expect(transizioneAmmessa('done', 'cancelled')).toBe(false);
    expect(transizioneAmmessa('cancelled', 'requested')).toBe(false);
  });

  it('non si salta la lavorazione', () => {
    expect(transizioneAmmessa('requested', 'done')).toBe(false);
    expect(transizioneAmmessa('assigned', 'done')).toBe(false);
  });

  it('lo stato che non cambia non e\' una transizione', () => {
    expect(transizioneAmmessa('assigned', 'assigned')).toBe(false);
  });

  it('uno stato ignoto non apre nessuna porta', () => {
    expect(transizioneAmmessa('boh', 'done')).toBe(false);
    expect(transizioneAmmessa('requested', 'boh')).toBe(false);
  });

  it('eAperto distingue i tre aperti dai due chiusi', () => {
    expect(eAperto(compito({ status: 'requested' }))).toBe(true);
    expect(eAperto(compito({ status: 'assigned' }))).toBe(true);
    expect(eAperto(compito({ status: 'in_progress' }))).toBe(true);
    expect(eAperto(compito({ status: 'done' }))).toBe(false);
    expect(eAperto(compito({ status: 'cancelled' }))).toBe(false);
  });
});

/* ── La richiesta ───────────────────────────────────────────────────── */

describe('validaRichiesta', () => {
  it('la richiesta minima passa', () => {
    expect(validaRichiesta({ type: 'COUNT', requested_by: 'AS' })).toEqual([]);
  });

  it('il tipo deve essere uno degli otto', () => {
    expect(validaRichiesta({ type: 'PULIZIE', requested_by: 'AS' }))
      .toEqual(['Tipo di attività non previsto: PULIZIE']);
  });

  it('senza richiedente non si apre niente', () => {
    expect(validaRichiesta({ type: 'COUNT' })).toEqual(['Manca la sigla di chi richiede']);
  });

  it('la priorita\' sta fra 1 e 4, e intera', () => {
    expect(validaRichiesta({ type: 'COUNT', requested_by: 'AS', priority: 5 })).toHaveLength(1);
    expect(validaRichiesta({ type: 'COUNT', requested_by: 'AS', priority: 0 })).toHaveLength(1);
    expect(validaRichiesta({ type: 'COUNT', requested_by: 'AS', priority: 2.5 })).toHaveLength(1);
  });

  it('una scadenza gia\' passata e\' un errore di digitazione, non una scadenza', () => {
    expect(validaRichiesta({ type: 'COUNT', requested_by: 'AS', due_at: T0 - ORA }, T0))
      .toEqual(['La scadenza è già passata']);
  });

  it('gli errori si accumulano', () => {
    expect(validaRichiesta({ type: 'X', priority: 9 })).toHaveLength(3);
  });
});

/* LA DECISIONE D4, MISURATA. Se un operatore potesse aprire un compito
   urgente, la regola «la priorita' la alza solo il Team Leader» sarebbe
   scritta e basta: il varco non e' la modifica, e' la creazione. */
describe('prioritaConsentita', () => {
  it('l\'operatore arriva a Normale', () => {
    expect(prioritaConsentita('operator', 1)).toBe(true);
    expect(prioritaConsentita('operator', 2)).toBe(true);
    expect(prioritaConsentita('operator', 3)).toBe(false);
    expect(prioritaConsentita('operator', 4)).toBe(false);
  });

  it('il Team Leader arriva a Urgente', () => {
    for (const p of [1, 2, 3, 4]) expect(prioritaConsentita('leader', p)).toBe(true);
  });

  /* `full` e' il ruolo di ripiego di `getCurrentIdentity` quando nessuno si e'
     ancora identificato: vale operatore, non capo. */
  it('un ruolo che non e\' leader vale operatore', () => {
    expect(prioritaConsentita('full', 3)).toBe(false);
    expect(prioritaConsentita(undefined, 3)).toBe(false);
  });
});

describe('componiCompito', () => {
  it('riempie i campi che il richiedente non scrive', () => {
    const c = componiCompito({ type: 'COUNT', requested_by: 'AS' }, 'TA-9', T0);
    expect(c).toMatchObject({
      task_id: 'TA-9',
      type: 'COUNT',
      priority: PRIORITA_NORMALE,
      status: 'requested',
      requested_by: 'AS',
      requested_at: T0,
      assigned_to: null,
      started_at: null,
      completed_at: null,
      due_at: null,
      source_ref: null,
    });
  });

  it('la sigla del richiedente sale in maiuscolo, come ovunque', () => {
    expect(componiCompito({ type: 'COUNT', requested_by: ' as ' }, 'TA-9', T0).requested_by).toBe('AS');
  });

  it('il payload passa intero e non viene interpretato', () => {
    const payload = { article_code: 'ART1', lot_code: 'L1', qty: 3, da: 'A-01', a: 'B-02' };
    expect(componiCompito({ type: 'TRANSFER', requested_by: 'AS', payload }, 'TA-9', T0).payload)
      .toEqual(payload);
  });

  /* Assegnare alla nascita e' il caso del Team Leader che apre un compito
     per qualcuno: lo stato deve seguire, se no resta in coda a nome di uno. */
  it('un compito che nasce assegnato nasce in stato assegnato', () => {
    const c = componiCompito({ type: 'COUNT', requested_by: 'AS', assigned_to: 'MR' }, 'TA-9', T0);
    expect(c.status).toBe('assigned');
    expect(c.assigned_to).toBe('MR');
  });

  it('non porta a database i campi che non ha', () => {
    const c = componiCompito({ type: 'COUNT', requested_by: 'AS' }, 'TA-9', T0);
    expect('payload' in c).toBe(false);
    expect('note' in c).toBe(false);
  });
});

/* ── La coda ────────────────────────────────────────────────────────── */

describe('ordinaCoda', () => {
  it('l\'urgente passa avanti a chi aspetta da ieri', () => {
    const vecchio = compito({ task_id: 'vecchio', requested_at: T0 - 24 * ORA });
    const urgente = compito({ task_id: 'urgente', priority: 4, requested_at: T0 });
    expect(ordinaCoda([vecchio, urgente]).map(c => c.task_id)).toEqual(['urgente', 'vecchio']);
  });

  it('a parita\' di priorita\' passa avanti chi scade prima', () => {
    const tardi = compito({ task_id: 'tardi', due_at: T0 + 8 * ORA });
    const presto = compito({ task_id: 'presto', due_at: T0 + 2 * ORA });
    expect(ordinaCoda([tardi, presto]).map(c => c.task_id)).toEqual(['presto', 'tardi']);
  });

  it('chi ha una scadenza passa avanti a chi non ne ha', () => {
    const senza = compito({ task_id: 'senza', requested_at: T0 - 5 * ORA });
    const con = compito({ task_id: 'con', due_at: T0 + 48 * ORA });
    expect(ordinaCoda([senza, con]).map(c => c.task_id)).toEqual(['con', 'senza']);
  });

  it('a parita\' di tutto vince chi ha chiesto per primo', () => {
    const dopo = compito({ task_id: 'dopo', requested_at: T0 + ORA });
    const prima = compito({ task_id: 'prima', requested_at: T0 });
    expect(ordinaCoda([dopo, prima]).map(c => c.task_id)).toEqual(['prima', 'dopo']);
  });

  it('i chiusi non stanno in coda', () => {
    const aperto = compito({ task_id: 'aperto' });
    const fatto = compito({ task_id: 'fatto', status: 'done', priority: 4 });
    const annullato = compito({ task_id: 'annullato', status: 'cancelled', priority: 4 });
    expect(ordinaCoda([fatto, annullato, aperto]).map(c => c.task_id)).toEqual(['aperto']);
  });

  it('non tocca l\'elenco che riceve', () => {
    const elenco = [compito({ task_id: 'b', priority: 1 }), compito({ task_id: 'a', priority: 4 })];
    ordinaCoda(elenco);
    expect(elenco.map(c => c.task_id)).toEqual(['b', 'a']);
  });

  it('una coda vuota resta vuota', () => {
    expect(ordinaCoda([])).toEqual([]);
    expect(ordinaCoda(null)).toEqual([]);
  });
});

/* ── Le misure ──────────────────────────────────────────────────────── */

describe('misure', () => {
  it('attesa e durata dai tre istanti', () => {
    const c = compito({ status: 'done', started_at: T0 + 2 * ORA, completed_at: T0 + 5 * ORA });
    expect(misure(c)).toEqual({ attesa: 2 * ORA, durata: 3 * ORA, totale: 5 * ORA });
  });

  /* Un compito ancora in coda ha un'attesa che cresce, e dirla e' il punto:
     e' la meta' della misura che il responsabile aspetta da questa versione. */
  it('un compito ancora in coda ha l\'attesa di adesso e nessuna durata', () => {
    expect(misure(compito(), T0 + 3 * ORA)).toEqual({ attesa: 3 * ORA, durata: null, totale: null });
  });

  it('un compito in corso ha la durata di adesso', () => {
    const c = compito({ status: 'in_progress', started_at: T0 + ORA });
    expect(misure(c, T0 + 4 * ORA)).toEqual({ attesa: ORA, durata: 3 * ORA, totale: null });
  });

  /* Un compito annullato non ha «durato»: contarlo abbasserebbe la media di
     lavorazione con del lavoro che nessuno ha fatto. */
  it('un annullato non ha ne\' durata ne\' totale', () => {
    const c = compito({ status: 'cancelled', started_at: T0 + ORA, completed_at: T0 + 2 * ORA });
    expect(misure(c)).toEqual({ attesa: ORA, durata: null, totale: null });
  });

  it('un compito senza requested_at non inventa numeri', () => {
    expect(misure({ status: 'requested' }, T0)).toEqual({ attesa: null, durata: null, totale: null });
  });
});

describe('inRitardo', () => {
  it('scaduto e ancora aperto', () => {
    expect(inRitardo(compito({ due_at: T0 - ORA }), T0)).toBe(true);
  });

  it('scaduto ma chiuso non e\' piu\' un ritardo da guardare', () => {
    expect(inRitardo(compito({ due_at: T0 - ORA, status: 'done' }), T0)).toBe(false);
  });

  it('senza scadenza non si e\' mai in ritardo', () => {
    expect(inRitardo(compito(), T0 + 999 * ORA)).toBe(false);
  });

  it('sul filo non e\' ancora in ritardo', () => {
    expect(inRitardo(compito({ due_at: T0 }), T0)).toBe(false);
  });
});

/* ── Il riepilogo ───────────────────────────────────────────────────── */

/* LA TRAPPOLA DEL PIANO §4.1: «uno schedulatore che nessuno chiude e' una
   lista che invecchia». Il riepilogo esiste dal primo giorno per questo. */
describe('riepilogo', () => {
  const ELENCO = [
    compito({ task_id: '1', status: 'requested', requested_at: T0 - 4 * ORA }),
    compito({ task_id: '2', status: 'assigned', priority: 4, requested_at: T0 - 3 * ORA, assigned_to: 'MR' }),
    compito({ task_id: '3', type: 'COUNT', status: 'in_progress', requested_at: T0 - 6 * ORA, started_at: T0 - 2 * ORA, assigned_to: 'MR' }),
    compito({ task_id: '4', type: 'COUNT', status: 'done', requested_at: T0 - 10 * ORA, started_at: T0 - 8 * ORA, completed_at: T0 - 5 * ORA }),
    compito({ task_id: '5', status: 'cancelled', requested_at: T0 - 20 * ORA }),
    compito({ task_id: '6', status: 'requested', requested_at: T0 - 30 * ORA, due_at: T0 - ORA }),
  ];
  const r = riepilogo(ELENCO, T0);

  it('conta gli aperti, non tutti', () => {
    expect(r.aperti).toBe(4);
    expect(r.totale).toBe(6);
  });

  it('spacca per stato', () => {
    expect(r.perStato).toEqual({ requested: 2, assigned: 1, in_progress: 1, done: 1, cancelled: 1 });
  });

  it('spacca per tipo i soli aperti', () => {
    expect(r.perTipo).toEqual({ TRANSFER: 3, COUNT: 1 });
  });

  /* Erano 1 fino alla 1.4.1, quando urgente voleva dire «priorità 4». Dalla
     1.4.2.1 sono 2: il compito 6 è scaduto un'ora fa, e un compito scaduto
     la coda lo tratta come urgente comunque l'abbia classificato chi l'ha
     chiesto. Il suo record dice ancora Normale — la D4 regge. */
  it('conta gli urgenti aperti come li vede la coda, e i ritardi', () => {
    expect(r.urgenti).toBe(2);
    expect(r.inRitardo).toBe(1);
  });

  /* Le due misure che il piano chiede: quanto sta in coda e quanto dura.
     Si calcolano sui compiti CHIUSI BENE, che sono gli unici finiti. */
  it('le medie girano sui soli compiti conclusi', () => {
    expect(r.attesaMedia).toBe(2 * ORA);
    expect(r.durataMedia).toBe(3 * ORA);
    expect(r.conclusi).toBe(1);
  });

  it('il piu\' vecchio ancora aperto e\' quello che invecchia', () => {
    expect(r.piuVecchio?.task_id).toBe('6');
    expect(r.attesaMassima).toBe(30 * ORA);
  });

  it('su un elenco vuoto non divide per zero', () => {
    const v = riepilogo([], T0);
    expect(v.aperti).toBe(0);
    expect(v.attesaMedia).toBe(null);
    expect(v.durataMedia).toBe(null);
    expect(v.piuVecchio).toBe(null);
  });

  it('senza nessun concluso le medie sono assenti, non zero', () => {
    const v = riepilogo([compito()], T0);
    expect(v.attesaMedia).toBe(null);
    expect(v.durataMedia).toBe(null);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   1.4.2.1 — LO SCHEDULATORE LANCIA IL LAVORO
   Fin qui il compito era una richiesta che affiancava l'operazione. Da qui
   la apre, e si chiude solo perche' un movimento e' stato confermato.
   ══════════════════════════════════════════════════════════════════════ */

/* ── L'urgenza che matura, senza toccare il record ──────────────────── */

describe('prioritaEffettiva', () => {
  const conScadenza = (ore, extra = {}) =>
    compito({ due_at: T0 + ore * ORA, priority: 1, ...extra });

  it('lontana dalla scadenza vale la priorita\' che le hanno dato', () => {
    expect(prioritaEffettiva(conScadenza(48), T0)).toBe(1);
  });

  it('dentro la soglia la coda la tratta come urgente', () => {
    expect(prioritaEffettiva(conScadenza(3), T0)).toBe(4);
  });

  it('la soglia e\' inclusiva: a quattro ore esatte e\' gia\' urgente', () => {
    expect(prioritaEffettiva(conScadenza(ORE_URGENZA_DEFAULT), T0)).toBe(4);
  });

  it('scaduta e ancora aperta resta urgente, non torna indietro', () => {
    expect(prioritaEffettiva(conScadenza(-5), T0)).toBe(4);
  });

  /* IL PUNTO DI TUTTA LA SCELTA: il record non cambia. La D4 dice che la
     priorita' la alza solo il Team Leader, e continua a essere vera. */
  it('il record NON viene toccato: e\' un calcolo, non una scrittura', () => {
    const c = conScadenza(1);
    prioritaEffettiva(c, T0);
    expect(c.priority).toBe(1);
  });

  it('senza scadenza non matura niente', () => {
    expect(prioritaEffettiva(compito({ priority: 2, due_at: null }), T0)).toBe(2);
  });

  it('un compito chiuso non e\' piu\' urgente di niente', () => {
    expect(prioritaEffettiva(conScadenza(-5, { status: 'done' }), T0)).toBe(1);
    expect(prioritaEffettiva(conScadenza(-5, { status: 'cancelled' }), T0)).toBe(1);
  });

  it('non ABBASSA mai: un urgente resta urgente anche se la scadenza e\' lontana', () => {
    expect(prioritaEffettiva(compito({ priority: 4, due_at: T0 + 100 * ORA }), T0)).toBe(4);
  });

  it('la soglia si puo\' cambiare: e\' un parametro, non una costante', () => {
    expect(prioritaEffettiva(conScadenza(6), T0, 8)).toBe(4);
    expect(prioritaEffettiva(conScadenza(6), T0, 2)).toBe(1);
  });
});

describe('inScadenza', () => {
  it('dice se e\' la scadenza a renderla urgente, non chi l\'ha chiesta', () => {
    expect(inScadenza(compito({ due_at: T0 + 2 * ORA }), T0)).toBe(true);
    expect(inScadenza(compito({ due_at: T0 + 40 * ORA }), T0)).toBe(false);
    expect(inScadenza(compito({ due_at: null }), T0)).toBe(false);
  });

  it('un compito nato urgente senza scadenza non e\' in scadenza', () => {
    expect(inScadenza(compito({ priority: 4, due_at: null }), T0)).toBe(false);
  });
});

describe('ordinaCoda con la scadenza che matura', () => {
  it('una Bassa che scade fra un\'ora passa davanti a una Alta senza scadenza', () => {
    const bassa = compito({ task_id: 'B', priority: 1, due_at: T0 + ORA });
    const alta  = compito({ task_id: 'A', priority: 3, due_at: null });
    expect(ordinaCoda([alta, bassa], T0).map(c => c.task_id)).toEqual(['B', 'A']);
  });

  it('senza scadenze vicine l\'ordine e\' quello di sempre', () => {
    const bassa = compito({ task_id: 'B', priority: 1, due_at: T0 + 90 * ORA });
    const alta  = compito({ task_id: 'A', priority: 3, due_at: null });
    expect(ordinaCoda([bassa, alta], T0).map(c => c.task_id)).toEqual(['A', 'B']);
  });
});

/* ── Il compito abbandonato torna indietro ──────────────────────────── */

describe('transizioni — l\'avvio che non ha prodotto niente', () => {
  /* Chiudere la maschera senza confermare non e' una lavorazione: e' un
     ripensamento. La freccia esiste per quello, e per niente altro. */
  it('da in corso si torna in carico', () => {
    expect(transizioneAmmessa('in_progress', 'assigned')).toBe(true);
  });

  it('ma non si torna in coda saltando l\'assegnazione', () => {
    expect(transizioneAmmessa('in_progress', 'requested')).toBe(false);
  });

  it('e da chiuso non si torna comunque da nessuna parte', () => {
    expect(transizioneAmmessa('done', 'assigned')).toBe(false);
    expect(transizioneAmmessa('cancelled', 'assigned')).toBe(false);
  });
});

/* ── Quale operazione apre quale attivita' ──────────────────────────── */

describe('operazioneDi', () => {
  it('tutti e otto i tipi sanno cosa aprire', () => {
    for (const t of Object.keys(TIPI_COMPITO)) expect(operazioneDi(t)).toBeTruthy();
    expect(Object.keys(OPERAZIONE).sort()).toEqual(Object.keys(TIPI_COMPITO).sort());
  });

  it('i due prelievi vanno tutti e due sulle spedizioni', () => {
    expect(operazioneDi('PICK_SHIP').modo).toBe('shipping');
    expect(operazioneDi('PICK_RET').modo).toBe('shipping');
  });

  it('carico e scarico sono la stessa vista con due direzioni', () => {
    expect(operazioneDi('PUTAWAY').modo).toBe('io');
    expect(operazioneDi('PUTAWAY').dir).toBe('in');
    expect(operazioneDi('DISPOSAL').modo).toBe('io');
    expect(operazioneDi('DISPOSAL').dir).toBe('out');
  });

  it('un tipo ignoto non apre niente invece di aprire la cosa sbagliata', () => {
    expect(operazioneDi('BOH')).toBe(null);
  });
});

describe('le tre eccezioni per tipo', () => {
  /* La Conta che torna giusta non produce nessun movimento: senza il gesto
     a mano non si chiuderebbe mai. */
  it('solo la Conta si chiude a mano', () => {
    expect(chiudeAMano('COUNT')).toBe(true);
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (t !== 'COUNT') expect(chiudeAMano(t), t).toBe(false);
    }
  });

  it('i colli servono ovunque si muova merce, non alla Conta', () => {
    expect(vuoleColli('COUNT')).toBe(false);
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (t !== 'COUNT') expect(vuoleColli(t), t).toBe(true);
    }
  });

  /* Il Posizionamento riguarda merce che a magazzino non c'e' ancora:
     cercarla fra le giacenze non la troverebbe mai. */
  it('si cerca fra le giacenze tranne che per il Posizionamento', () => {
    expect(daGiacenza('PUTAWAY')).toBe(false);
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (t !== 'PUTAWAY') expect(daGiacenza(t), t).toBe(true);
    }
  });

  /* La Conta si fa su un vano, non su un articolo: chiederle un articolo la
     ridurrebbe a verificare cio' che il sistema gia' crede, e meta' del senso
     di un inventario e' trovare quello che non dovrebbe esserci. */
  it('solo la Conta non vuole un articolo', () => {
    expect(vuoleArticolo('COUNT')).toBe(false);
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (t !== 'COUNT') expect(vuoleArticolo(t), t).toBe(true);
    }
  });

  it('e solo la Conta pretende l\'ubicazione', () => {
    expect(vuoleUbicazione('COUNT')).toBe(true);
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (t !== 'COUNT') expect(vuoleUbicazione(t), t).toBe(false);
    }
  });

  /* Le tre regole della Conta si tengono: niente colli, niente articolo,
     e in cambio l'ubicazione. E' l'unica delle otto fatta cosi'. */
  it('la Conta e\' l\'unica senza colli e senza articolo', () => {
    expect([vuoleColli('COUNT'), vuoleArticolo('COUNT'), vuoleUbicazione('COUNT')])
      .toEqual([false, false, true]);
  });
});

/* ── Il residuo: 12 chiesti, 5 mossi, ne restano 7 ───────────────────── */

describe('residuo', () => {
  const conColli = (qty, fatti) => compito({ payload: { qty }, qty_done: fatti });

  it('quanto e\' stato chiesto sta nel payload, e non cambia mai', () => {
    expect(quantitaRichiesta(conColli(12, 5))).toBe(12);
  });

  it('quanto e\' stato fatto parte da zero', () => {
    expect(quantitaFatta(compito({ payload: { qty: 12 } }))).toBe(0);
  });

  it('12 chiesti e 5 mossi fanno 7 di residuo', () => {
    expect(residuo(conColli(12, 5))).toBe(7);
  });

  it('a residuo zero l\'attivita\' e\' esaurita', () => {
    expect(esaurito(conColli(12, 12))).toBe(true);
    expect(esaurito(conColli(12, 5))).toBe(false);
  });

  /* Un movimento piu' grosso del richiesto non lascia un residuo negativo:
     non ci sono meno di zero colli da spostare. */
  it('muoverne piu\' del richiesto esaurisce e basta', () => {
    expect(residuo(conColli(12, 20))).toBe(0);
    expect(esaurito(conColli(12, 20))).toBe(true);
  });

  it('senza quantita\' richiesta non c\'e\' residuo da calcolare', () => {
    expect(quantitaRichiesta(compito({ payload: null }))).toBe(null);
    expect(residuo(compito({ payload: null }))).toBe(null);
  });

  /* La Conta non porta colli: non e' esaurita, si chiude a mano. */
  it('un compito senza quantita\' non e\' mai esaurito da solo', () => {
    expect(esaurito(compito({ payload: null }))).toBe(false);
  });
});

/* ── L'avanzamento: il movimento confermato scala il residuo ─────────── */

describe('avanzamento', () => {
  const conColli = (qty, fatti) => compito({ payload: { qty }, qty_done: fatti });

  it('cinque colli mossi su dodici lasciano sette e non chiudono niente', () => {
    const a = avanzamento(conColli(12, 0), 5);
    expect(a.qty_done).toBe(5);
    expect(a.residuo).toBe(7);
    expect(a.chiude).toBe(false);
  });

  it('due movimenti si sommano, e il secondo chiude', () => {
    const primo = avanzamento(conColli(12, 0), 5);
    const secondo = avanzamento(conColli(12, primo.qty_done), 7);
    expect(secondo.qty_done).toBe(12);
    expect(secondo.residuo).toBe(0);
    expect(secondo.chiude).toBe(true);
  });

  /* Muoverne piu' del richiesto chiude e basta: il residuo non va sotto zero
     e `qty_done` resta il vero — quanto si e' mosso davvero. */
  it('muoverne piu\' del richiesto chiude senza residuo negativo', () => {
    const a = avanzamento(conColli(12, 0), 20);
    expect(a.qty_done).toBe(20);
    expect(a.residuo).toBe(0);
    expect(a.chiude).toBe(true);
  });

  /* La Conta non porta colli: nessun movimento la chiude, si chiude a mano. */
  it('un compito senza quantita\' non si chiude mai da solo', () => {
    const a = avanzamento(compito({ payload: null }), 9);
    expect(a.qty_done).toBe(9);
    expect(a.residuo).toBe(null);
    expect(a.chiude).toBe(false);
  });

  it('un movimento che non ha mosso niente non fa avanzare niente', () => {
    for (const v of [0, -3, null, undefined, NaN, 'tre']) {
      expect(avanzamento(conColli(12, 5), v).qty_done, String(v)).toBe(5);
    }
  });

  it('mezzo collo non esiste: si tronca', () => {
    expect(avanzamento(conColli(12, 0), 5.9).qty_done).toBe(5);
  });

  it('non tocca il compito che riceve', () => {
    const c = conColli(12, 5);
    avanzamento(c, 4);
    expect(c.qty_done).toBe(5);
  });
});

describe('avvioRitirabile — decisione 46', () => {
  it('un avvio che non ha mosso un collo si puo\' ritirare', () => {
    expect(avvioRitirabile(compito({ status: 'in_progress', started_at: T0 }))).toBe(true);
  });

  it('dopo il primo collo mosso l\'avvio e\' storia', () => {
    expect(avvioRitirabile(compito({ status: 'in_progress', qty_done: 3 }))).toBe(false);
  });

  /* La Conta non muove colli, ma un movimento l'ha prodotto lo stesso: una
     rettifica d'inventario e' un fatto, e da li' in poi l'avvio non si ritira. */
  it('e nemmeno dopo un movimento senza colli', () => {
    expect(avvioRitirabile(compito({ status: 'in_progress', mov_ids: [41] }))).toBe(false);
  });

  it('si ritira solo un avvio: non un compito in coda, assegnato o chiuso', () => {
    for (const s of ['requested', 'assigned', 'done', 'cancelled']) {
      expect(avvioRitirabile(compito({ status: s })), s).toBe(false);
    }
  });
});

describe('riepilogo — gli urgenti li conta come li vede la coda', () => {
  it('una Bassa che scade fra un\'ora e\' un urgente nel cruscotto', () => {
    const r = riepilogo([compito({ priority: 1, due_at: T0 + ORA })], T0);
    expect(r.urgenti).toBe(1);
  });

  it('e una Bassa senza scadenza no', () => {
    const r = riepilogo([compito({ priority: 1, due_at: null })], T0);
    expect(r.urgenti).toBe(0);
  });
});
