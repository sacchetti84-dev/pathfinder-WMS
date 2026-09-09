import { describe, it, expect } from 'vitest';
import {
  TIPI_COMPITO, PRIORITA, PRIORITA_NORMALE, STATI_APERTI,
  etichettaTipo, etichettaPriorita, etichettaStato,
  transizioneAmmessa, eAperto, componiCompito, validaRichiesta,
  prioritaConsentita, ordinaCoda, misure, inRitardo, riepilogo,
  registroAttivita,
  avanzamento,
  ORE_URGENZA_DEFAULT, OPERAZIONE, prioritaEffettiva, inScadenza,
  TIPI_SEMPRE_URGENTI,
  operazioneDi, chiudeAlGesto, vuoleColli, vuoleUbicazione,
  vuoleDestinazione, tipiRichiedibili, nasceDalSistema,
  TIPI_RITIRATI, eRitirato, TIPI_DA_DOCUMENTO, nasceDaDocumento,
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
  /* 2.31 — NOVE DICHIARATI, CINQUE RICHIEDIBILI, e le tre ragioni per cui
     un tipo esce dalla tendina sono diverse fra loro:
     · `CLEANING` nasce dal SISTEMA — 1.5, nasce gia' chiusa;
     · `PICK_SHIP` e `PICK_RET` sono RITIRATI — 2.31, li fa `PREP_SHIP`;
     · `PREP_SHIP` nasce da un DOCUMENTO — senza DDT non saprebbe che merce
       nominare.
     Restano dichiarati tutti e quattro perche' l'archivio li porta: un
     compito chiuso il mese scorso deve continuare a dire come si chiamava. */
  it('i dieci tipi dichiarati, e i sei che si possono chiedere', () => {
    expect(Object.keys(TIPI_COMPITO)).toEqual([
      'TRANSFER', 'PREP_SHIP', 'PICK_ODP', 'PICK_SHIP', 'PICK_RET',
      'QUARANTINE', 'SAMPLING', 'DISPOSAL', 'COUNT', 'CLEANING',
    ]);
    expect(tipiRichiedibili()).toEqual([
      'TRANSFER', 'PICK_ODP', 'QUARANTINE', 'SAMPLING', 'DISPOSAL', 'COUNT',
    ]);
  });

  /* 2.32 — IL PRELIEVO ODP SI CHIEDE, la preparazione no, e la differenza
     non e' arbitraria: la preparazione nasce da un documento che dice gia'
     che cosa prendere, il prelievo ODP nasce da una DISTINTA che qualcuno
     allega. Senza allegato non saprebbe che merce nominare, ma l'allegato
     lo mette chi chiede — quindi la richiesta esiste. */
  it('il prelievo ODP sta in tendina, la preparazione no', () => {
    expect(tipiRichiedibili()).toContain('PICK_ODP');
    expect(tipiRichiedibili()).not.toContain('PREP_SHIP');
    expect(nasceDaDocumento('PICK_ODP')).toBe(false);
    expect(eRitirato('PICK_ODP')).toBe(false);
  });

  /* I due prelievi vecchi si LEGGONO ancora: toglierli farebbe perdere il
     nome a quel che sta in archivio, e la storia smetterebbe di essere
     leggibile pur restando scritta. */
  it('i due prelievi ritirati non si creano piu, ma si leggono ancora', () => {
    expect([...TIPI_RITIRATI]).toEqual(['PICK_SHIP', 'PICK_RET']);
    for (const t of TIPI_RITIRATI) {
      expect(eRitirato(t), t).toBe(true);
      expect(tipiRichiedibili(), t).not.toContain(t);
      expect(TIPI_COMPITO[t]?.label, t).toBeTruthy();
    }
  });

  it('la preparazione nasce da un documento, non da una tendina', () => {
    expect([...TIPI_DA_DOCUMENTO]).toEqual(['PREP_SHIP']);
    expect(nasceDaDocumento('PREP_SHIP')).toBe(true);
    expect(tipiRichiedibili()).not.toContain('PREP_SHIP');
    /* E non nasce chiusa come la Pulizia: c'e' un lavoro vero da fare. */
    expect(nasceDalSistema('PREP_SHIP')).toBe(false);
  });

  it('le tre ragioni per stare fuori dalla tendina non si sovrappongono', () => {
    for (const t of Object.keys(TIPI_COMPITO)) {
      const fuori = [nasceDalSistema(t), eRitirato(t), nasceDaDocumento(t)].filter(Boolean);
      expect(fuori.length, t).toBeLessThanOrEqual(1);
    }
  });

  /* 1.5 — LA PULIZIA NON STA IN NESSUNA TENDINA. Nasce dalla conferma di un
     campionamento e nasce gia' chiusa: se comparisse fra le scelte,
     qualcuno aprirebbe una pulizia a mano e resterebbe li' per sempre. */
  it('la Pulizia nasce dal sistema e nessuno la puo chiedere', () => {
    expect(nasceDalSistema('CLEANING')).toBe(true);
    expect(tipiRichiedibili()).not.toContain('CLEANING');
    for (const t of tipiRichiedibili()) expect(nasceDalSistema(t), t).toBe(false);
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

  /* 2.1 — l'Admin è un Team Leader con le chiavi in piu': dove passa un
     leader passa lui. Una carica piu' alta che potesse meno sarebbe la
     riga che, il giorno che si nomina Admin l'unico capo del magazzino,
     abbassa la coda a Normale senza dire niente a nessuno. */
  it('e l’Admin arriva dove arriva il Team Leader', () => {
    for (const p of [1, 2, 3, 4]) expect(prioritaConsentita('admin', p)).toBe(true);
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

  /* ── 2.30 · I TIPI CHE NON ASPETTANO IL LORO TURNO ─────────────────
     Una richiesta di quarantena sta in cima sempre: finche' il cartello non
     e' appeso, il lotto che nomina puo' essere prelevato da chiunque passi.
     Le prove qui sotto provano a farlo scendere in cinque modi diversi.
     Verificate rimettendo il difetto: senza la riga in `prioritaEffettiva`
     diventano rosse. */
  it('una quarantena e\' urgente anche se chi l\'ha chiesta l\'ha messa bassa', () => {
    expect(prioritaEffettiva(compito({ type: 'QUARANTINE', priority: 1 }), T0)).toBe(4);
  });

  it('e lo e\' senza nessuna scadenza: non aspetta di maturare', () => {
    expect(prioritaEffettiva(compito({ type: 'QUARANTINE', priority: 1, due_at: null }), T0)).toBe(4);
  });

  it('e lo resta con una scadenza lontanissima', () => {
    const c = compito({ type: 'QUARANTINE', priority: 1, due_at: T0 + 1000 * ORA });
    expect(prioritaEffettiva(c, T0)).toBe(4);
  });

  it('nemmeno una soglia a zero ore la fa scendere', () => {
    /* La soglia e' un parametro di magazzino: portata a zero, nessuna
       scadenza matura piu'. La quarantena non passa di li'. */
    expect(prioritaEffettiva(compito({ type: 'QUARANTINE', priority: 1 }), T0, 0)).toBe(4);
  });

  it('e nemmeno qui il record viene toccato', () => {
    const c = compito({ type: 'QUARANTINE', priority: 1 });
    prioritaEffettiva(c, T0);
    expect(c.priority).toBe(1);
  });

  it('gli altri tipi restano come sono: non e\' diventato urgente tutto', () => {
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (TIPI_SEMPRE_URGENTI.includes(t)) continue;
      expect(prioritaEffettiva(compito({ type: t, priority: 1, due_at: null }), T0), t).toBe(1);
    }
  });

  it('un tipo che non esiste non diventa urgente per sbaglio', () => {
    expect(prioritaEffettiva(compito({ type: 'INVENTATO', priority: 1, due_at: null }), T0)).toBe(1);
  });

  it('l\'elenco ne dichiara uno solo: chi ne aggiunge un secondo lo scrive qui', () => {
    expect([...TIPI_SEMPRE_URGENTI]).toEqual(['QUARANTINE']);
  });

  it('in coda una quarantena bassa passa davanti a un\'alta di un altro tipo', () => {
    const q = compito({ task_id: 'TA-Q', type: 'QUARANTINE', priority: 1, due_at: null });
    const t = compito({ task_id: 'TA-T', type: 'TRANSFER', priority: 3, due_at: null });
    expect(ordinaCoda([t, q], T0).map((c) => c.task_id)).toEqual(['TA-Q', 'TA-T']);
  });

  it('e il riepilogo la conta fra gli urgenti', () => {
    const q = compito({ task_id: 'TA-Q', type: 'QUARANTINE', priority: 1, due_at: null });
    expect(riepilogo([q], T0).urgenti).toBe(1);
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

  /* ═══ 2.38 · DUE FRECCE CHE PARTONO DALLO STESSO STATO E DICONO IL
         CONTRARIO ═══════════════════════════════════════════════════════

     Fino alla 2.37 `in_progress → requested` era VIETATA, e la prova qui
     sotto lo difendeva: chi apriva una maschera e la chiudeva senza
     confermare non doveva perdere il compito che aveva in mano.

     Quella regola vale ancora, ed e' la freccia verso `assigned` — che e'
     l'unica che `abandonTask` percorre, e solo se non si e' mosso un collo
     (`avvioRitirabile`).

     Ma dalla 2.38 c'e' un secondo gesto, che non e' un ripensamento: una
     spedizione e' tre lavori — radunare, imballare, caricare — e chi ne
     finisce uno RESTITUISCE il compito perche' il prossimo lo faccia un
     altro. La sigla se ne va con lui: chi ha il transpallet non e' chi ha
     il muletto in banchina, e un'attivita' «in coda» che porta ancora un
     nome e' la coda che gli altri saltano.

     Le due frecce restano distinte perche' le percorrono due metodi
     diversi, ognuno col suo controllo — `abandonTask` guarda che non si sia
     mosso niente, `rimettiInCodaSpedizione` guarda che la sessione sia
     davvero quella del compito. */
  it('e si torna anche in coda, ma e un altro gesto — 2.38', () => {
    expect(transizioneAmmessa('in_progress', 'requested')).toBe(true);
  });

  it('e da chiuso non si torna comunque da nessuna parte', () => {
    expect(transizioneAmmessa('done', 'assigned')).toBe(false);
    expect(transizioneAmmessa('cancelled', 'assigned')).toBe(false);
  });
});

/* ── Quale operazione apre quale attivita' ──────────────────────────── */

describe('operazioneDi', () => {
  it('tutti i tipi richiedibili sanno cosa aprire', () => {
    for (const t of tipiRichiedibili()) expect(operazioneDi(t), t).toBeTruthy();
    expect(Object.keys(OPERAZIONE).sort()).toEqual(Object.keys(TIPI_COMPITO).sort());
  });

  /* La Pulizia dichiara `none`, e `operazioneDi` traduce «niente da
     aprire» in `null`: e' la stessa risposta di un tipo sconosciuto, ed e'
     voluto — chi la prendesse in mano non deve trovarsi una maschera. */
  it('la Pulizia non apre niente, perche nasce gia chiusa', () => {
    expect(OPERAZIONE.CLEANING.modo).toBe('none');
    expect(operazioneDi('CLEANING')).toBe(null);
  });

  it('i due prelievi vanno tutti e due sulle spedizioni', () => {
    expect(operazioneDi('PICK_SHIP').modo).toBe('shipping');
    expect(operazioneDi('PICK_RET').modo).toBe('shipping');
  });

  /* Lo Smaltimento resta l'unico che apre Carico/Scarico, in uscita: il
     Posizionamento era l'altra direzione, e non e' piu' un compito. */
  it('lo scarico apre Carico/Scarico in uscita', () => {
    expect(operazioneDi('DISPOSAL').modo).toBe('io');
    expect(operazioneDi('DISPOSAL').dir).toBe('out');
  });

  it('un tipo ignoto non apre niente invece di aprire la cosa sbagliata', () => {
    expect(operazioneDi('BOH')).toBe(null);
  });
});

describe('le eccezioni per tipo', () => {
  /* IL POSIZIONAMENTO NON ESISTE PIU' — 13/08. Mettere a scaffale la merce
     appena arrivata succede in coda all'accettazione, che su Pathfinder non
     passa: nessuno l'avrebbe mai chiesto come compito. La prova sta qui
     perche' un tipo tolto e' una decisione, e chi lo rimettesse deve
     inciampare in una riga rossa e non in una tendina piu' lunga. */
  it('il Posizionamento non e\' piu\' un tipo di attivita\'', () => {
    expect(TIPI_COMPITO.PUTAWAY).toBeUndefined();
    expect(operazioneDi('PUTAWAY')).toBe(null);
    expect(tipiRichiedibili()).toHaveLength(6);
  });

  it('i colli servono ovunque si muova una quantita\' decisa prima, non alla Conta', () => {
    expect(vuoleColli('COUNT')).toBe(false);
    /* La Pulizia nemmeno: non tocca merce. */
    expect(vuoleColli('CLEANING')).toBe(false);
    /* 2.31/2.32 — E NEMMENO I DUE CHE LEGGONO UN FILE. La preparazione
       prende i colli dal DOCUMENTO, il prelievo ODP dalla DISTINTA: riga per
       riga, e non un numero solo. Chiederlo a chi crea l'attivita' vorrebbe
       dire tenere un secondo conto accanto a uno che c'e' gia', e due conti
       della stessa cosa divergono. */
    expect(vuoleColli('PREP_SHIP')).toBe(false);
    expect(vuoleColli('PICK_ODP')).toBe(false);
    const senzaColli = new Set(['COUNT', 'CLEANING', 'PREP_SHIP', 'PICK_ODP']);
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (!senzaColli.has(t)) expect(vuoleColli(t), t).toBe(true);
    }
  });

  it('solo la Conta pretende l\'ubicazione', () => {
    expect(vuoleUbicazione('COUNT')).toBe(true);
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (t !== 'COUNT') expect(vuoleUbicazione(t), t).toBe(false);
    }
  });

  /* La destinazione la legge un consumatore solo: `_taskLancia` la usa per
     precompilare `pCambioDest`, e da quando il Posizionamento non c'e' piu'
     quello e' l'unico modo che la guarda. */
  it('la destinazione la vuole il solo Trasferimento', () => {
    expect(vuoleDestinazione('TRANSFER')).toBe(true);
    for (const t of Object.keys(TIPI_COMPITO)) {
      if (t !== 'TRANSFER') expect(vuoleDestinazione(t), t).toBe(false);
    }
  });

  it('un tipo sconosciuto non vuole destinazione', () => {
    expect(vuoleDestinazione('BOH')).toBe(false);
    expect(vuoleDestinazione('')).toBe(false);
  });

  /* La Conta apre l'inventario nel ramo MIRATO: stesso modo dell'inventario
     di vano, ma su un articolo e un lotto soli. E' `dir` a distinguerli. */
  it('la Conta apre l\'inventario mirato', () => {
    expect(operazioneDi('COUNT')).toEqual({ modo: 'inv', dir: 'mirato' });
  });
});

/* ── Le due famiglie: a residuo e a gesto ───────────────────────────── */

describe('chiudeAlGesto', () => {
  /* Si concludono col gesto confermato e non con un conteggio che arriva a
     zero. E' la correzione della 1.4.4: prima restavano aperti per sempre,
     perche' il residuo non ci arrivava mai. */
  it('i tipi a gesto storici', () => {
    for (const t of ['PICK_SHIP', 'PICK_RET', 'QUARANTINE', 'SAMPLING', 'COUNT']) {
      expect(chiudeAlGesto(t), t).toBe(true);
    }
  });

  /* 2.1 — IL TRASFERIMENTO E' PASSATO AL GESTO, ed e' una decisione di
     Andrea: si chiude nel momento in cui viene confermato. A residuo aveva
     due modi di non chiudersi mai — la richiesta nata da un ODP, che colli
     non ne porta, e il trasferimento parziale, che lasciava in coda una riga
     che nessuno riprendeva. La prova diceva `false`: si riscrive. */
  it('il trasferimento chiude al gesto', () => {
    expect(chiudeAlGesto('TRANSFER')).toBe(true);
  });

  /* Resta a residuo lo Smaltimento, e resta solo: e' l'unico in cui «ne
     restano 7» vuol dire che sette colli aspettano ancora — decisione 45. */
  it('lo smaltimento resta a residuo, e resta solo', () => {
    expect(chiudeAlGesto('DISPOSAL')).toBe(false);
    expect(Object.keys(TIPI_COMPITO).filter((t) => !chiudeAlGesto(t))).toEqual(['DISPOSAL']);
  });

  it('un tipo sconosciuto non chiude al gesto', () => {
    expect(chiudeAlGesto('BOH')).toBe(false);
    expect(chiudeAlGesto('')).toBe(false);
  });

  /* Ogni tipo dichiarato sta in una delle due famiglie e in una sola: se
     domani se ne aggiunge uno, questa prova chiede di dire quale. */
  it('ogni tipo sta in una famiglia', () => {
    for (const t of Object.keys(TIPI_COMPITO)) {
      expect(typeof chiudeAlGesto(t), t).toBe('boolean');
    }
    const gesto = Object.keys(TIPI_COMPITO).filter(chiudeAlGesto);
    expect(gesto).toHaveLength(9);
    /* 2.31 — LA PREPARAZIONE CHIUDE AL GESTO, non a residuo, ed e' una
       decisione: il residuo conta i colli mossi, ma il lavoro non finisce
       quando l'ultimo collo e' sceso dallo scaffale — finisce quando le
       unita' sono imballate ed etichettate. Un conto sui colli direbbe
       «fatto» a meta' lavoro. */
    expect(chiudeAlGesto('PREP_SHIP')).toBe(true);
    /* La Pulizia si chiude al gesto per costruzione: nasce fatta. */
    expect(chiudeAlGesto('CLEANING')).toBe(true);
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
  /* 2.1 — QUI SI MISURA LA FAMIGLIA A RESIDUO, e il tipo adesso va detto:
     il Trasferimento e' passato al gesto e lo Smaltimento e' rimasto solo. */
  const conColli = (qty, fatti) =>
    compito({ type: 'DISPOSAL', payload: { qty }, qty_done: fatti });

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

  /* 2.1 — LA REGOLA E' CAMBIATA, E QUESTA PROVA DICE COME.

     Fino alla 2.0 qui c'era scritto il contrario: «un tipo a residuo senza
     quantita' non si chiude mai da solo — non c'e' niente che possa
     arrivare a zero». Era coerente, e in produzione voleva dire un'altra
     cosa: la 1.10 crea i trasferimenti chiesti da un ordine SENZA numero di
     colli — apposta, perche' quanti ne servano per fare 44,42 kg lo sa la
     giacenza e non l'ordine — e quelle richieste restavano aperte per
     sempre. Trovate cosi' il 20/08 su ODP2603889: merce trasferita,
     attivita' che continuava a chiedere.

     Dove non c'e' una quantita' da esaurire, la prova che il lavoro e'
     finito e' il GESTO. Non si inventa un numero che nessuno ha chiesto. */
  it('un tipo a residuo SENZA quantita\' chiesta si chiude al primo movimento', () => {
    /* `BOH` sta per un tipo uscito dal progetto — `PUTAWAY` e' il caso vero:
       non lo riconosce `chiudeAlGesto`, quindi ricade a residuo. */
    const a = avanzamento(compito({ type: 'BOH', payload: null }), 9);
    expect(a.qty_done).toBe(9);
    expect(a.residuo).toBe(null);
    expect(a.chiude).toBe(true);
  });

  /* ── 1.4.4: i tipi a gesto si chiudono confermando ──────────────────
     Qui c'e' il difetto che il magazzino ha visto in mezza giornata: con la
     sola regola del residuo, quarantena, campionamento, conta e i due
     prelievi restavano aperti per sempre. */

  it('una quarantena si chiude anche bloccando meno colli di quanti chiesti', () => {
    const a = avanzamento(compito({ type: 'QUARANTINE', payload: { qty: 13 } }), 4);
    expect(a.qty_done).toBe(4);
    expect(a.residuo).toBe(9);      // il residuo resta VERO: dice cosa e' successo
    expect(a.chiude).toBe(true);    // ...ma non e' lui a decidere la chiusura
  });

  /* Decisione 53: un campione vale un collo. Con la richiesta precompilata a
     tutta la giacenza — 13 colli — non si esauriva mai. */
  it('un campione chiude il compito pur valendo un collo su tredici', () => {
    const a = avanzamento(compito({ type: 'SAMPLING', payload: { qty: 13 } }), 1);
    expect(a.chiude).toBe(true);
  });

  /* UNA CONTA CHE TORNA GIUSTA NON PRODUCE NESSUNA RIGA, e resta un lavoro
     fatto: zero correzioni deve chiudere esattamente come dieci. */
  it('una conta si chiude con ZERO correzioni', () => {
    const a = avanzamento(compito({ type: 'COUNT', payload: null }), 0);
    expect(a.qty_done).toBe(0);
    expect(a.chiude).toBe(true);
  });

  it('una conta si chiude anche con delle correzioni', () => {
    expect(avanzamento(compito({ type: 'COUNT', payload: null }), 3).chiude).toBe(true);
  });

  /* Il prelievo si chiude alla REGISTRAZIONE del DDT: da li' in poi la merce
     aspetta il vettore, e non dipende piu' da chi ha prelevato. */
  it('un prelievo chiude alla registrazione, anche parziale', () => {
    for (const t of ['PICK_SHIP', 'PICK_RET']) {
      expect(avanzamento(compito({ type: t, payload: { qty: 40 } }), 12).chiude, t).toBe(true);
    }
  });

  /* La prova che separa le due famiglie: stessi numeri, esito opposto. */
  it('stessi numeri, famiglie diverse, esito opposto', () => {
    /* Il lato a residuo e' lo Smaltimento: il Trasferimento e' passato di la'. */
    const parziale = { payload: { qty: 12 } };
    expect(avanzamento(compito({ ...parziale, type: 'DISPOSAL' }), 5).chiude).toBe(false);
    expect(avanzamento(compito({ ...parziale, type: 'QUARANTINE' }), 5).chiude).toBe(true);
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

/* 2.1 — IL REGISTRO DELLE ATTIVITÀ LEGGE ANCHE IL REGISTRO GENERALE.

   Un campionamento aperto a mano scriveva `SAMPLE` a registro generale e
   non compariva fra le attività: chi contava le prese a fine mese ne
   trovava una parte, senza modo di sapere che era una parte. */
describe('registroAttivita', () => {
  const compito = (id, extra = {}) => ({
    task_id: id, type: 'SAMPLING', priority: 2, status: 'done',
    requested_by: 'AS', requested_at: 1000, ...extra,
  });
  const mov = (id, ts, extra = {}) => ({
    _id: id, ts, type: 'SAMPLE', user: 'DP',
    article_code: '6001055', lot_code: 'L1', location_code: 'M03-A-01', ...extra,
  });

  it('un campionamento senza compito ENTRA, e si dichiara fuori coda', () => {
    const r = registroAttivita([], [mov(7, 2000)]);
    expect(r).toHaveLength(1);
    expect(r[0].origine).toBe('movimento');
    expect(r[0].type).toBe('SAMPLING');
    expect(r[0].requested_by).toBe('DP');
  });

  it('UN MOVIMENTO CHE UN COMPITO RIVENDICA NON SI CONTA DUE VOLTE', () => {
    const r = registroAttivita([compito('TA-1', { mov_ids: [7] })], [mov(7, 2000)]);
    expect(r).toHaveLength(1);
    expect(r[0].origine).toBe('compito');
  });

  it('le altre causali del registro generale non sono attività', () => {
    const r = registroAttivita([], [mov(1, 100, { type: 'IN' }), mov(2, 200, { type: 'PICK' })]);
    expect(r).toEqual([]);
  });

  it('si ordina dal più recente, mescolando le due sorgenti', () => {
    const r = registroAttivita(
      [compito('TA-1', { requested_at: 1500 }), compito('TA-2', { requested_at: 3000 })],
      [mov(9, 2000)]);
    expect(r.map(x => x.task_id)).toEqual(['TA-2', 'MOV-9', 'TA-1']);
  });

  /* Un gesto fatto senza passare dalla coda non è stato in coda: attesa
     zero è un fatto, `null` sarebbe «non si sa». */
  it('il gesto fuori coda non ha atteso: i tre istanti coincidono', () => {
    const [r] = registroAttivita([], [mov(7, 2000)]);
    expect(r.requested_at).toBe(2000);
    expect(r.started_at).toBe(2000);
    expect(r.completed_at).toBe(2000);
    expect(misure(r).attesa).toBe(0);
  });

  it('un movimento senza _id non fa sparire gli altri senza _id', () => {
    const r = registroAttivita([compito('TA-1', { mov_ids: [] })],
      [{ ts: 10, type: 'SAMPLE', user: 'AS' }, { ts: 20, type: 'SAMPLE', user: 'AS' }]);
    expect(r.filter(x => x.origine === 'movimento')).toHaveLength(2);
  });

  it('e i colli mossi si leggono in valore assoluto', () => {
    const [r] = registroAttivita([], [mov(7, 2000, { qty_delta: -3 })]);
    expect(r.qty_done).toBe(3);
  });
});

/* 2.1 — IL TRASFERIMENTO SI CHIUDE QUANDO VIENE CONFERMATO, E BASTA.

   Prima stava a residuo, e a residuo aveva due modi di non chiudersi mai.
   Il primo: la richiesta che nasce da un ordine di produzione non porta un
   numero di colli — è deliberato, quanti ne servano per fare 44,42 kg lo sa
   la giacenza e non l'ordine — e un residuo `null` a zero non ci arriva.
   Visto in produzione il 20/08 su due richieste di ODP2603889, merce già
   trasferita e attività che continuava a chiedere. Il secondo: un
   trasferimento parziale lasciava in coda una riga che nessuno riprendeva.

   Decisione di Andrea, 20/08: si chiude nel momento in cui il trasferimento
   viene confermato. È la stessa frase della quarantena — chi ha la merce in
   mano DECIDE quanto si muove, e la conferma è la fine del lavoro. */
describe('2.1 — il trasferimento si chiude alla conferma', () => {
  const daOdp = (extra = {}) => ({
    task_id: 'TA-1', type: 'TRANSFER', priority: 2, status: 'in_progress',
    requested_by: 'AS', requested_at: 1000,
    payload: { article_code: '6000149', lot_code: '261177', qty_uom: 44.42, uom: 'KG',
               from: 'MAG-ACC-06', to: 'M03-STK-02-01-T', odp_num: 'ODP2603889' },
    ...extra,
  });

  it('IL MOVIMENTO CONFERMATO LO CHIUDE, anche senza colli chiesti', () => {
    const a = avanzamento(daOdp(), 1);
    expect(a.qty_done).toBe(1);
    expect(a.residuo).toBe(null);
    expect(a.chiude).toBe(true);
  });

  /* IL PARZIALE CHIUDE, ed è il verso nuovo: la prova diceva `false` e si
     riscrive. Il residuo continua a essere scritto e dice cosa è successo —
     sette colli non si sono mossi — ma non tiene più aperta l'attività. */
  it('cinque colli su dodici chiudono lo stesso, e il residuo resta scritto', () => {
    const conQty = daOdp({ payload: { qty: 12, from: 'A', to: 'B' } });
    const a = avanzamento(conQty, 5);
    expect(a.qty_done).toBe(5);
    expect(a.residuo).toBe(7);
    expect(a.chiude).toBe(true);
  });

  /* `_taskAvanza` si raggiunge solo dopo un movimento riuscito — in
     `prelievo.ts` la maschera esce prima se si annulla la scelta dei colli.
     Arrivare qui vuol dire che il trasferimento è stato confermato, ed è
     quella la prova, non il conteggio: la stessa regola della conta, che
     con zero correzioni si chiude perché tornare giusti è un esito. */
  it('arrivare qui vuol dire confermato: chiude anche a zero colli', () => {
    expect(avanzamento(daOdp(), 0).chiude).toBe(true);
    expect(avanzamento(daOdp(), null).chiude).toBe(true);
    expect(avanzamento(daOdp(), 0).qty_done).toBe(0);
  });

  /* Lo Smaltimento è rimasto l'unico a residuo, e li' «ne restano 7» vuol
     dire davvero che sette colli aspettano ancora. */
  it('lo smaltimento invece non chiude col parziale', () => {
    const smalt = daOdp({ type: 'DISPOSAL', payload: { qty: 12 } });
    expect(avanzamento(smalt, 5).residuo).toBe(7);
    expect(avanzamento(smalt, 5).chiude).toBe(false);
    expect(avanzamento({ ...smalt, qty_done: 5 }, 7).chiude).toBe(true);
  });

  it('i tipi a gesto non cambiano: chiudono comunque', () => {
    expect(avanzamento({ type: 'COUNT', payload: {} }, 0).chiude).toBe(true);
  });
});
