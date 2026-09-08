/* LO SCHEDULATORE, LA PARTE CHE NON TOCCA NIENTE — 1.4.1, PIANO §4.1.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Le attività che questo modulo mette in coda l'applicativo le sa già fare
   tutte: qui non nasce nessuna operazione nuova. Nascono la RICHIESTA, la
   CODA e la MISURA — cioè le tre cose che oggi vivono a voce.

   Nessuno stato, nessun accesso a Store, nessun DOM: entrano compiti, escono
   ordinamenti e conti. È la stessa forma di `pickRoute` e `conformita`, ed è
   quello che permette di collaudarlo per intero senza aprire il browser —
   `test/compiti.test.js`. */

import type { Compito, Istante } from '../types/entita.js';
import { quantitaMossa } from './registro.js';

/* ── Le tabelle ─────────────────────────────────────────────────────── */

/* SETTE TIPI, non gli otto del piano. Il **Posizionamento è uscito il
   13/08**: mettere a scaffale la merce appena arrivata succede in coda
   all'accettazione, che su Pathfinder non passa — nessuno l'avrebbe mai
   chiesto come compito, e un tipo che non si usa è una voce in più in ogni
   tendina e un ramo in più in ogni regola. La funzione «Posiziona» di
   Movimenta resta dov'è: a sparire è il compito, non l'operazione. */
export const TIPI_COMPITO = {
  TRANSFER:   { label: 'Trasferimento',   icona: 'arrows-left-right' },
  /* 2.31 — LA PREPARAZIONE DI UNA SPEDIZIONE, e il verso rovesciato.

     Fino alla 2.30 era il prelievo a far nascere il DDT: l'operatore
     scansionava la merce, il carrello diventava un documento, e il documento
     chiudeva il compito. Chi in ufficio sapeva che cosa doveva partire non
     aveva un modo per dirlo se non scendendo a dirlo a voce.

     Adesso l'impiegato registra il DDT e da quel gesto nasce l'attività:
     merce e destinatario sono già decisi, e quel che resta è andarla a
     prendere, comporla in unità di carico, imballarla ed etichettarla.

     UN TIPO SOLO PER SPEDIZIONI E RESI. Erano due — `PICK_SHIP` e
     `PICK_RET` — ma la maschera è sempre stata la stessa e a distinguerli è
     sempre stata la CAUSALE del documento, non il lavoro di magazzino: in
     corsia si va a prendere la stessa merce nello stesso modo. I due vecchi
     restano dichiarati perché l'archivio li porta — un compito chiuso il
     mese scorso deve continuare a dire come si chiamava. */
  PREP_SHIP:  { label: 'Preparazione spedizioni', icona: 'truck' },
  PICK_SHIP:  { label: 'Prelievo spedizione', icona: 'truck' },
  PICK_RET:   { label: 'Prelievo reso',   icona: 'arrow-back-up' },
  QUARANTINE: { label: 'Blocco quarantena', icona: 'ban' },
  SAMPLING:   { label: 'Campionamento',   icona: 'flask' },
  DISPOSAL:   { label: 'Smaltimento',     icona: 'trash' },
  COUNT:      { label: 'Conta',           icona: 'list-numbers' },
  /* 1.5 — LA PULIZIA DELL'AREA DI PRELIEVO DOPO UN CAMPIONAMENTO, che la GMP
     pretende registrata. Non si chiede a mano e non sta in nessuna tendina:
     nasce dalla conferma di un campionamento e nasce gia' chiusa (D16). Sta
     fra i tipi lo stesso perche' deve comparire nel registro delle attivita'
     come attivita' vera, con i suoi tempi e la sua sigla — un'annotazione
     libera non sarebbe interrogabile in audit. */
  CLEANING:   { label: 'Pulizia post-campionamento', icona: 'spray' },
} as const;

export type TipoCompito = keyof typeof TIPI_COMPITO;

/* I tipi che il SISTEMA apre da se', e che nessuno puo' chiedere dalla
   maschera di creazione. Sono fuori dalla tendina e fuori da `_taskLancia`:
   nascono chiusi, quindi non c'e' niente da lanciare. */
export const TIPI_SISTEMA: readonly string[] = ['CLEANING'];

export function nasceDalSistema(t: string): boolean {
  return TIPI_SISTEMA.includes(t);
}

/* 2.31 — I TIPI RITIRATI: si leggono, non si creano più.

   `PICK_SHIP` e `PICK_RET` sono stati sostituiti da `PREP_SHIP`, che li fa
   tutti e due. Toglierli dall'elenco vorrebbe dire che un compito chiuso il
   mese scorso, in archivio, perde il proprio nome e compare col codice
   grezzo: la storia si legge ancora, ma smette di essere leggibile.

   Fuori dalla tendina, quindi, ma dentro alle etichette. È la stessa
   distinzione di `TIPI_SISTEMA`, con un motivo diverso: quelli non si
   chiedono perché nascono da soli, questi perché non si usano più.

   E `PREP_SHIP` STA IN QUESTO ELENCO ANCHE LUI. Non si chiede a mano: nasce
   dalla registrazione di un DDT, ed è quel documento a dire che cosa
   prendere. Un'attività di preparazione senza documento non saprebbe che
   merce nominare. */
export const TIPI_RITIRATI: readonly string[] = ['PICK_SHIP', 'PICK_RET'];

export function eRitirato(t: string): boolean {
  return TIPI_RITIRATI.includes(t);
}

/* 2.31 — i tipi che nascono da un documento e non da una tendina. Come
   `TIPI_SISTEMA` non si chiedono a mano, ma a differenza di quelli NON
   nascono chiusi: c'è un lavoro vero da fare, e `_taskLancia` lo apre. */
export const TIPI_DA_DOCUMENTO: readonly string[] = ['PREP_SHIP'];

export function nasceDaDocumento(t: string): boolean {
  return TIPI_DA_DOCUMENTO.includes(t);
}

/** I tipi che si possono chiedere a mano — quelli della tendina. */
export function tipiRichiedibili(): TipoCompito[] {
  return (Object.keys(TIPI_COMPITO) as TipoCompito[])
    .filter(t => !nasceDalSistema(t) && !eRitirato(t) && !nasceDaDocumento(t));
}

/* Il numero cresce con l'urgenza: «alzare la priorità» è alzare il numero,
   che è come lo dice chi la chiede. */
export const PRIORITA: Record<number, string> = {
  1: 'Bassa', 2: 'Normale', 3: 'Alta', 4: 'Urgente',
};
export const PRIORITA_NORMALE = 2;
export const PRIORITA_URGENTE = 4;
/* Oltre questa, serve un Team Leader — decisione D4 del 12/08. */
export const PRIORITA_MAX_OPERATORE = 2;

/* I TIPI CHE NON ASPETTANO IL LORO TURNO — 2.30.

   Una richiesta di quarantena non si mette in fila. Sta in cima perché la
   merce che nomina è già ferma e sospetta: finché il cartello non è appeso,
   quel lotto può essere prelevato da chiunque passi di lì. Le altre attività
   dicono che cosa fare; questa dice che cosa NON si può più toccare.

   STA QUI E NON NEL RECORD, ed è la stessa ragione della scadenza qui sotto:
   scrivere `priority: 4` alla creazione vorrebbe dire che fra un mese quel
   compito dichiara un'urgenza che nessuno ha chiesto, e la decisione D4 — «la
   priorità la alza solo il Team Leader» — diventerebbe «solo il Team Leader,
   e il sistema». Il numero scritto resta quello di chi ha chiesto; è la coda
   che sa in che ordine si lavora. Un Team Leader può ancora alzare gli altri
   fino a qui, non oltre: la quarantena non si scavalca.

   È un elenco e non un `if` perché il giorno che ne arriva un secondo si
   aggiunge una riga, e la prova che li conta lo dice subito. */
export const TIPI_SEMPRE_URGENTI: readonly string[] = ['QUARANTINE'];

/* 1.4.2.1 — sotto questa distanza dalla scadenza la coda tratta un compito
   come urgente. È un PARAMETRO e non una costante: quante ore prima una
   cosa diventi urgente è una politica di magazzino, e le politiche
   cambiano senza che cambi la versione — stessa forma del prefisso GS1. */
export const ORE_URGENZA_DEFAULT = 4;

export const STATI: Record<string, string> = {
  requested: 'In coda', assigned: 'Assegnato', in_progress: 'In corso',
  done: 'Completato', cancelled: 'Annullato',
};

export const STATI_APERTI = ['requested', 'assigned', 'in_progress'] as const;
export type StatoAperto = typeof STATI_APERTI[number];

export const etichettaTipo = (t: string): string =>
  (TIPI_COMPITO as Record<string, { label: string }>)[t]?.label ?? String(t);
export const iconaTipo = (t: string): string =>
  (TIPI_COMPITO as Record<string, { icona: string }>)[t]?.icona ?? 'help';
export const etichettaPriorita = (p: number): string => PRIORITA[p] ?? String(p);
export const etichettaStato = (s: string): string => STATI[s] ?? String(s);

/* ── Il ciclo di vita ───────────────────────────────────────────────── */

/* Da uno stato CHIUSO non esce nessuna freccia, e non è una dimenticanza:
   un compito concluso è un fatto, e i tempi che ne escono sono la misura di
   questa versione. Se si è sbagliato se ne apre un altro — la storia non si
   riscrive, come per i movimenti.

   1.4.2.1 — `in_progress → assigned` è la freccia dell'AVVIO CHE NON HA
   PRODOTTO NIENTE: l'operatore apre la maschera dell'operazione e la chiude
   senza confermare. Non è una lavorazione, è un ripensamento, e con lei
   `started_at` torna a `null`. È l'unico punto del progetto in cui si
   cancella un istante già scritto, ed è deliberato: un avvio che non ha
   mosso un collo non è storia. Non porta a `requested` — chi l'aveva in
   mano ce l'ha ancora. */
const TRANSIZIONI: Record<string, readonly string[]> = {
  requested:   ['assigned', 'in_progress', 'cancelled'],
  assigned:    ['requested', 'in_progress', 'cancelled'],
  in_progress: ['assigned', 'done', 'cancelled'],
  done:        [],
  cancelled:   [],
};

export function transizioneAmmessa(da: string, a: string): boolean {
  return (TRANSIZIONI[da] ?? []).includes(a);
}

export function eAperto(c: Pick<Compito, 'status'> | null | undefined): boolean {
  return !!c && (STATI_APERTI as readonly string[]).includes(c.status);
}

/* ── L'urgenza che matura ───────────────────────────────────────────── */

/** Vera quando è la SCADENZA a rendere urgente un compito, non chi l'ha
    chiesto. Serve a scriverlo a video — «scade fra 3 h» — senza far credere
    che qualcuno abbia alzato la priorità. */
export function inScadenza(
  c: Partial<Compito> | null | undefined,
  adesso: Istante = Date.now(),
  oreSoglia: number = ORE_URGENZA_DEFAULT,
): boolean {
  if (!c?.due_at || !eAperto(c as Compito)) return false;
  return c.due_at - adesso <= oreSoglia * 3_600_000;
}

/* LA PRIORITÀ CON CUI LA CODA TRATTA UN COMPITO ADESSO — e il record non si
   tocca. Sotto la soglia una scadenza vale quanto un'urgenza, perché una
   promessa fatta a qualcuno per le sedici, alle dodici, è urgente comunque
   l'abbia classificata chi l'ha chiesta.

   È un CALCOLO e non una scrittura, e la ragione è la decisione D4: «la
   priorità la alza solo il Team Leader». Se il sistema alzasse il campo, fra
   un mese quel record direbbe 4 senza che nessuno l'abbia chiesto, e la
   regola diventerebbe «solo il Team Leader, e il sistema». Così invece resta
   vera: il numero scritto è quello di chi l'ha chiesta, l'ordine della coda
   è quello che serve a chi lavora.

   Non ABBASSA mai: un compito nato urgente resta urgente.

   2.30 — e alcuni tipi partono di lì: vedi `TIPI_SEMPRE_URGENTI`. */
export function prioritaEffettiva(
  c: Partial<Compito> | null | undefined,
  adesso: Istante = Date.now(),
  oreSoglia: number = ORE_URGENZA_DEFAULT,
): number {
  const p = Number(c?.priority) || PRIORITA_NORMALE;
  if (TIPI_SEMPRE_URGENTI.includes(String(c?.type))) return PRIORITA_URGENTE;
  return inScadenza(c, adesso, oreSoglia) ? Math.max(p, PRIORITA_URGENTE) : p;
}

/* ── La richiesta ───────────────────────────────────────────────────── */

export interface Richiesta {
  type: string;
  requested_by: string;
  priority?: number;
  assigned_to?: string | null;
  due_at?: Istante | null;
  payload?: unknown;
  source_ref?: string | null;
  note?: string;
}

/** Gli errori, in chiaro e tutti insieme: chi compila una maschera vuole
    sapere cosa manca, non cosa manca per primo. Vuoto = si può aprire. */
export function validaRichiesta(r: Partial<Richiesta>, adesso: Istante = Date.now()): string[] {
  const errori: string[] = [];
  if (!r.type || !(r.type in TIPI_COMPITO)) errori.push(`Tipo di attività non previsto: ${r.type ?? '—'}`);
  if (!String(r.requested_by ?? '').trim()) errori.push('Manca la sigla di chi richiede');
  if (r.priority !== undefined && r.priority !== null) {
    const p = Number(r.priority);
    if (!Number.isInteger(p) || p < 1 || p > 4) errori.push('La priorità è un numero da 1 a 4');
  }
  if (r.due_at && r.due_at < adesso) errori.push('La scadenza è già passata');
  return errori;
}

/* IL VARCO NON È LA MODIFICA, È LA CREAZIONE.
   Se un operatore potesse APRIRE un compito urgente, «la priorità la alza
   solo il Team Leader» sarebbe una frase e non una regola: aprirebbe tutto
   a 4 e la coda tornerebbe a essere l'ordine in cui si è chiesto. */
export function prioritaConsentita(ruolo: string | null | undefined, priorita: number): boolean {
  /* 2.1 — l'Admin è un Team Leader che ha anche le chiavi: dove passa un
     leader passa lui, e la coda non fa eccezione. */
  const comanda = ruolo === 'leader' || ruolo === 'admin';
  return comanda ? priorita >= 1 && priorita <= 4 : priorita <= PRIORITA_MAX_OPERATORE;
}

/** Il record come va a database. L'identificativo lo genera chi scrive:
    qui non si inventa niente che non sia già nella richiesta. */
export function componiCompito(r: Richiesta, task_id: string, adesso: Istante = Date.now()): Compito {
  const assegnato = String(r.assigned_to ?? '').toUpperCase().trim() || null;
  const c: Compito = {
    task_id,
    type: r.type,
    priority: Number(r.priority) || PRIORITA_NORMALE,
    /* Un compito che nasce a nome di qualcuno nasce assegnato: lasciarlo in
       coda con dentro una sigla sarebbe un compito che aspetta se stesso. */
    status: assegnato ? 'assigned' : 'requested',
    requested_by: String(r.requested_by).toUpperCase().trim(),
    requested_at: adesso,
    assigned_to: assegnato,
    started_at: null,
    completed_at: null,
    due_at: r.due_at ?? null,
    source_ref: r.source_ref ?? null,
  };
  if (r.payload !== undefined && r.payload !== null) c.payload = r.payload;
  const note = String(r.note ?? '').trim();
  if (note) c.note = note;
  return c;
}

/* ── La coda ────────────────────────────────────────────────────────── */

/* L'ordine in cui si prende il prossimo compito, e le tre domande in ordine:
   quanto scotta, entro quando, da quanto aspetta. La scadenza viene prima
   dell'anzianità perché è una promessa fatta a qualcuno; l'anzianità è
   l'ultima parola, ed è ciò che impedisce a un compito senza scadenza di
   restare in fondo per sempre. */
export function ordinaCoda(
  compiti: readonly Compito[] | null | undefined,
  adesso: Istante = Date.now(),
  oreSoglia: number = ORE_URGENZA_DEFAULT,
): Compito[] {
  return (compiti ?? []).filter(eAperto).slice().sort((a, b) =>
    prioritaEffettiva(b, adesso, oreSoglia) - prioritaEffettiva(a, adesso, oreSoglia)
    || (a.due_at ?? Infinity) - (b.due_at ?? Infinity)
    || (a.requested_at || 0) - (b.requested_at || 0));
}

/* ── Che cosa apre ogni tipo, e le eccezioni ────────────────────────── */

/* 1.4.2.1 — DA QUI LO SCHEDULATORE SMETTE DI AFFIANCARE IL LAVORO E LO APRE.
   Ogni tipo dice quale funzione di Movimenta lanciare, precompilata coi dati
   del compito. La tabella sta qui e non nella UI perché è una regola, non un
   dettaglio di resa: chi aggiunge un tipo deve dire cosa apre, e il collaudo
   glielo chiede. */
export const OPERAZIONE = {
  TRANSFER:   { modo: 'move' },
  /* 2.31 — la preparazione apre il PERCORSO, non la maschera del documento.
     Il documento c'è già: quel che manca è andare a prendere la merce, e
     quella è la scheda del prelievo automatico. `sub` la porta sulla scheda
     giusta senza passare da quella di prima. */
  PREP_SHIP:  { modo: 'pick', dir: 'preparazione' },
  PICK_SHIP:  { modo: 'shipping', kind: 'shipment' },
  PICK_RET:   { modo: 'shipping', kind: 'return' },
  QUARANTINE: { modo: 'quarantine' },
  SAMPLING:   { modo: 'sampling' },
  DISPOSAL:   { modo: 'io', dir: 'out' },
  /* La Conta apre l'inventario nel suo ramo MIRATO: un articolo e un lotto
     soli, non tutto il vano — `dir: 'mirato'` è ciò che distingue i due. */
  COUNT:      { modo: 'inv', dir: 'mirato' },
  /* La pulizia non apre niente: nasce chiusa insieme al campionamento che
     l'ha resa necessaria. `none` e' esplicito apposta — la tabella pretende
     che ogni tipo dica cosa apre, e «niente» e' una risposta. */
  CLEANING:   { modo: 'none' },
} as const satisfies Record<TipoCompito, { modo: string; dir?: string; kind?: string }>;

export type Operazione = { modo: string; dir?: string; kind?: string };

/** `null` su un tipo sconosciuto — e sui tipi che non si lanciano: meglio
    non aprire niente che aprire la maschera sbagliata a chi ha in mano un
    carrello. */
export function operazioneDi(t: string): Operazione | null {
  const op = (OPERAZIONE as Record<string, Operazione>)[t];
  return !op || op.modo === 'none' ? null : op;
}

/* ── LE DUE FAMIGLIE: a residuo e a gesto ───────────────────────────── */

/* 1.4.4 — LA CORREZIONE PIÙ IMPORTANTE DI QUESTA VERSIONE.
   Fino alla 1.4.3 un compito si chiudeva in un modo solo: quando il residuo
   dei colli arrivava a zero. Regge per i due tipi che spostano una quantità
   — 12 chiesti, 5 mossi, ne restano 7 — e NON regge per gli altri cinque,
   che si concludono col gesto e non con un conteggio:

   - una **quarantena** confermata è fatta, che si siano bloccati 4 colli su
     13 o tutti e 13: quei 4 sono la decisione di qualità che è stata presa;
   - un **campione** è un prelievo solo, e vale un collo per decisione 53:
     con la richiesta precompilata a tutta la giacenza non si esauriva mai;
   - una **conta** può concludersi senza produrre nessuna riga — un
     inventario che torna giusto è un esito, non un nulla di fatto;
   - un **prelievo** si conclude quando il DDT è registrato: da lì in poi
     l'evasione è merce che aspetta il vettore, e non dipende più
     dall'operatore che ha prelevato.

   Il risultato pratico è che quattro tipi su sette non si chiudevano mai e
   restavano in coda a invecchiare — cioè proprio «la lista che invecchia»
   che il piano §4.1 voleva evitare.

   2.1 — IL TRASFERIMENTO PASSA AL GESTO, ED È UNA DECISIONE DI ANDREA:
   «le attività si devono chiudere nel momento in cui il trasferimento viene
   confermato, obbligatorio». Restava a residuo, e a residuo ha due modi di
   non chiudersi mai: una richiesta nata da un ODP non porta colli — quanti
   ne servano per fare 44,42 kg lo sa la giacenza, non l'ordine — e un
   trasferimento parziale lascia in coda una riga che nessuno riprenderà,
   perché la merce che restava è già stata guardata da chi l'aveva in mano.
   Vale la stessa frase della quarantena: chi conferma DECIDE quanto si
   muove, e la conferma è la fine del lavoro. Il residuo continua a essere
   scritto e dice cosa è successo; smette solo di decidere la chiusura.
   Resta a residuo il solo Smaltimento, che è l'unico in cui «ne restano 7»
   significa davvero che sette colli aspettano ancora. */
export function chiudeAlGesto(t: string): boolean {
  /* 2.31 — `PREP_SHIP` chiude al GESTO e non a residuo, ed è una decisione.
     Il residuo conta i colli mossi; ma il lavoro di una preparazione non
     finisce quando l'ultimo collo è sceso dallo scaffale: finisce quando le
     unità di carico sono imballate ed etichettate in zona imballaggio. Un
     conto sui colli direbbe «fatto» a metà lavoro. */
  return t === 'TRANSFER'
      || t === 'PREP_SHIP'
      || t === 'PICK_SHIP' || t === 'PICK_RET'
      || t === 'QUARANTINE' || t === 'SAMPLING' || t === 'COUNT'
      || t === 'CLEANING';
}

/** I colli servono ovunque si muova una quantità decisa in anticipo. La
    Conta no: quanti ce ne siano è la domanda, non il dato. La Pulizia
    nemmeno: non tocca merce. */
export function vuoleColli(t: string): boolean {
  /* 2.31 — la preparazione non li chiede a chi la crea: quanti colli e quali
     lo dice il DOCUMENTO, riga per riga. Un numero digitato a mano accanto a
     un documento che ne porta già dodici sarebbe un secondo conto, e due
     conti della stessa cosa divergono. */
  return t !== 'COUNT' && t !== 'CLEANING' && t !== 'PREP_SHIP';
}

/** LA CONTA È UN INVENTARIO MIRATO A UN ARTICOLO E UN LOTTO, non l'apertura
    di un vano intero. L'inventario di tutto il vano esiste già in Movimenta
    e non ha bisogno di un compito; quello che serviva era poter dire «vai a
    contare QUESTO», ed è una riga di giacenza come per ogni altro tipo. */
export function vuoleUbicazione(t: string): boolean {
  return t === 'COUNT';
}

/** Una destinazione ce l'ha il solo Trasferimento, che è l'unico tipo
    rimasto a portare merce da un vano a un altro. Lo Smaltimento scarica il
    magazzino, un prelievo esce con un DDT, un campione non muove colli.
    Chiederla lo stesso non è un campo di troppo: `doCreateTask` la
    scriverebbe nel payload, e il payload è la richiesta — cioè storia, che
    chi prende in mano l'attività si trova davanti. */
export function vuoleDestinazione(t: string): boolean {
  return t === 'TRANSFER';
}

/* ── Il residuo ─────────────────────────────────────────────────────── */

/* 12 colli chiesti, 5 mossi: ne restano 7, e il compito resta aperto.
   Ciò che è stato CHIESTO sta nel payload e non cambia mai — è la richiesta,
   ed è storia; ciò che è stato FATTO cresce a ogni movimento confermato. */

export function quantitaRichiesta(c: Partial<Compito> | null | undefined): number | null {
  const q = Number((c?.payload as Record<string, unknown> | null)?.qty);
  return Number.isFinite(q) && q > 0 ? q : null;
}

export function quantitaFatta(c: Partial<Compito> | null | undefined): number {
  const q = Number(c?.qty_done);
  return Number.isFinite(q) && q > 0 ? q : 0;
}

/** `null` = compito senza quantità, che non si esaurisce da solo. */
export function residuo(c: Partial<Compito> | null | undefined): number | null {
  const chiesto = quantitaRichiesta(c);
  return chiesto === null ? null : Math.max(0, chiesto - quantitaFatta(c));
}

/** Vero quando non resta più niente da muovere: è il momento in cui il
    compito si chiude da solo. Un movimento più grosso del richiesto lo
    esaurisce e basta — non esistono meno di zero colli da spostare. */
export function esaurito(c: Partial<Compito> | null | undefined): boolean {
  return residuo(c) === 0;
}

/* ── L'avanzamento ──────────────────────────────────────────────────── */

export interface Avanzamento {
  /** Quanti colli risultano mossi DOPO questo movimento. */
  qty_done: number;
  /** Quanti ne restano, o `null` per un compito senza quantità. */
  residuo: number | null;
  /** Vero quando il movimento appena confermato chiude il compito. */
  chiude: boolean;
}

/* 1.4.2.1 — IL MOVIMENTO CONFERMATO SCALA IL RESIDUO, E LA REGOLA STA QUI.
   Entrano un compito e i colli che si sono mossi davvero, esce quanto è
   fatto e se il compito è finito. Non tocca il record: chi scrive è Store,
   e lo fa con questi tre numeri davanti.

   I colli si troncano a interi non negativi: un movimento che non ha mosso
   niente non fa avanzare niente, e mezzo collo non esiste.

   1.4.4 — SUI TIPI A GESTO IL CONTEGGIO NON DECIDE NIENTE. Arrivare qui
   vuol dire che l'operazione è stata confermata, ed è quella la prova che
   il compito è finito: `chiude` è vero comunque, anche con zero colli —
   una conta che torna giusta non produce nessuna riga e resta un lavoro
   fatto. Il `qty_done` si aggiorna lo stesso, perché il registro delle
   attività mostra quanto si è mosso davvero.

   2.1 — E LA TERZA CLAUSOLA È LA RETE PER I TIPI CHE NON SI CONOSCONO.
   `Compito.type` finisce con `| string`: i record di un tipo uscito dal
   progetto restano leggibili — `PUTAWAY` è il caso vero — e un tipo che
   `chiudeAlGesto` non riconosce ricade a residuo. Se quel record non porta
   nemmeno i colli chiesti ha `residuo` `null`, `esaurito()` falso, e resta
   aperto per sempre: è la forma esatta di quel che il 20/08 si è visto in
   produzione su due trasferimenti di ODP2603889, merce già arrivata e
   attività che continuava a chiedere. Quei due oggi li chiude `gesto`;
   questa clausola tiene chi verrà dopo.

   Non si inventa un numero che nessuno ha chiesto: dove non c'è una
   quantità da esaurire, la prova che il lavoro è finito è il gesto. Serve
   però un movimento vero — `mossi > 0` — o aprire la maschera e non
   confermare niente chiuderebbe la richiesta. */
export function avanzamento(
  c: Partial<Compito> | null | undefined,
  colli: number | null | undefined,
): Avanzamento {
  const n = Number(colli);
  const mossi = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const qty_done = quantitaFatta(c) + mossi;
  const dopo = { ...(c ?? {}), qty_done } as Partial<Compito>;
  const gesto = chiudeAlGesto(String(c?.type ?? ''));
  const senzaQuantitaChiesta = quantitaRichiesta(c) === null;
  return {
    qty_done,
    residuo: residuo(dopo),
    chiude: gesto || esaurito(dopo) || (senzaQuantitaChiesta && mossi > 0),
  };
}

/* UN AVVIO CHE NON HA PRODOTTO NIENTE TORNA IN CARICO — decisione 46.
   È l'unico punto del progetto in cui si cancella un istante già scritto,
   e vale solo finché non si è mosso un collo: dopo il primo movimento
   quell'avvio è storia, e il compito resta in corso col suo residuo. */
export function avvioRitirabile(c: Partial<Compito> | null | undefined): boolean {
  return c?.status === 'in_progress'
      && quantitaFatta(c) === 0
      && !(c?.mov_ids?.length);
}

/* ── Le misure ──────────────────────────────────────────────────────── */

export interface Misure {
  /** Quanto è stato in coda: fino all'avvio, o fino ad adesso se è ancora lì. */
  attesa: number | null;
  /** Quanto è durato: fino alla chiusura, o fino ad adesso se è in corso. */
  durata: number | null;
  /** Dalla richiesta alla conclusione. Solo sui compiti conclusi bene. */
  totale: number | null;
}

/* Un compito ANNULLATO non ha «durato»: metterlo nella media di lavorazione
   la abbasserebbe con del lavoro che nessuno ha fatto. L'attesa invece resta
   vera — in coda c'è stato davvero. */
export function misure(c: Partial<Compito> | null | undefined, adesso: Istante = Date.now()): Misure {
  const vuote: Misure = { attesa: null, durata: null, totale: null };
  if (!c || !c.requested_at) return vuote;
  const aperto = eAperto(c as Compito);
  const fine = c.started_at ?? (aperto ? adesso : null);
  const attesa = fine === null ? null : fine - c.requested_at;
  if (c.status === 'cancelled') return { ...vuote, attesa };
  let durata: number | null = null;
  if (c.started_at) {
    const chiusura = c.completed_at ?? (aperto ? adesso : null);
    if (chiusura !== null) durata = chiusura - c.started_at;
  }
  const totale = c.status === 'done' && c.completed_at ? c.completed_at - c.requested_at : null;
  return { attesa, durata, totale };
}

export function inRitardo(c: Partial<Compito> | null | undefined, adesso: Istante = Date.now()): boolean {
  return !!c?.due_at && eAperto(c as Compito) && c.due_at < adesso;
}

/* ── Il riepilogo ───────────────────────────────────────────────────── */

export interface Riepilogo {
  totale: number;
  aperti: number;
  conclusi: number;
  perStato: Record<string, number>;
  /** Solo gli aperti: a un cruscotto interessa cosa c'è da fare, non cosa è stato. */
  perTipo: Record<string, number>;
  urgenti: number;
  inRitardo: number;
  attesaMedia: number | null;
  durataMedia: number | null;
  attesaMassima: number | null;
  piuVecchio: Compito | null;
}

/* LA TRAPPOLA DEL PIANO §4.1, e il motivo per cui questa funzione esiste dal
   primo giorno e non nella versione dopo: «uno schedulatore che nessuno
   chiude è una lista che invecchia». `piuVecchio` è la riga che lo dice.

   Le medie girano sui soli compiti CONCLUSI BENE — sono gli unici che hanno
   un inizio e una fine — e assenti significa «non ne è ancora finito
   nessuno», che è diverso da zero. */
export function riepilogo(
  compiti: readonly Compito[] | null | undefined,
  adesso: Istante = Date.now(),
  oreSoglia: number = ORE_URGENZA_DEFAULT,
): Riepilogo {
  const tutti = compiti ?? [];
  const perStato: Record<string, number> = {
    requested: 0, assigned: 0, in_progress: 0, done: 0, cancelled: 0,
  };
  const perTipo: Record<string, number> = {};
  let aperti = 0, urgenti = 0, ritardi = 0;
  let sommaAttesa = 0, sommaDurata = 0, conclusi = 0;
  let attesaMassima: number | null = null;
  let piuVecchio: Compito | null = null;

  for (const c of tutti) {
    perStato[c.status] = (perStato[c.status] ?? 0) + 1;
    if (eAperto(c)) {
      aperti++;
      perTipo[c.type] = (perTipo[c.type] ?? 0) + 1;
      /* Gli urgenti sono quelli che la CODA vede come urgenti: una Bassa che
         scade fra un'ora, nel cruscotto, è un urgente. */
      if (prioritaEffettiva(c, adesso, oreSoglia) >= PRIORITA_URGENTE) urgenti++;
      if (inRitardo(c, adesso)) ritardi++;
      const attesa = misure(c, adesso).attesa;
      if (attesa !== null && (attesaMassima === null || attesa > attesaMassima)) {
        attesaMassima = attesa;
        piuVecchio = c;
      }
    } else if (c.status === 'done') {
      const m = misure(c, adesso);
      if (m.attesa !== null && m.durata !== null) {
        sommaAttesa += m.attesa;
        sommaDurata += m.durata;
        conclusi++;
      }
    }
  }

  return {
    totale: tutti.length,
    aperti,
    conclusi,
    perStato,
    perTipo,
    urgenti,
    inRitardo: ritardi,
    attesaMedia: conclusi ? Math.round(sommaAttesa / conclusi) : null,
    durataMedia: conclusi ? Math.round(sommaDurata / conclusi) : null,
    attesaMassima,
    piuVecchio,
  };
}

/* Durate in forma leggibile. Sta qui e non nella UI perché la stessa misura
   compare nel cruscotto, nell'elenco e nell'export: tre formattazioni
   diverse dello stesso numero sono tre numeri diversi, per chi legge. */
export function durataUmana(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const ore = Math.floor(min / 60);
  const resto = min % 60;
  if (ore < 24) return resto ? `${ore} h ${resto} min` : `${ore} h`;
  const giorni = Math.floor(ore / 24);
  return `${giorni} g ${ore % 24} h`;
}

/* ═══════════════════════════════════════════════════════════════════
   2.1 — IL REGISTRO DELLE ATTIVITÀ LEGGE ANCHE IL REGISTRO GENERALE

   PERCHÉ NON È UNA VISTA, E BASTA. La richiesta dice «strutturare il
   Registro Attività come un'estrazione filtrata del Registro Generale dei
   Movimenti». Metà si può, metà no, e la metà che non si può è quella che
   conta: un movimento sa cosa è stato mosso, quando e da chi — non sa chi
   l'aveva CHIESTO, quando l'ha chiesto, quanto è rimasto in coda, con
   quale priorità, né perché è stato annullato. Quei campi vivono solo su
   `tasks`, e un registro costruito sul solo `mov_log` li perderebbe: la
   metà dei numeri dei KPI del 19/08 — mediana di attesa, mediana di
   lavoro — smetterebbe di esistere.

   QUEL CHE MANCAVA DAVVERO ERANO I CAMPIONAMENTI. Un campionamento nato
   dallo schedulatore ha il suo compito e si vedeva già. Uno fatto aprendo
   la funzione «Campionamento» a mano — che è come si fa quando la qualità
   passa e chiede una presa — scriveva `SAMPLE` a registro generale e non
   compariva da nessuna parte fra le attività. Chi a fine mese contava le
   prese ne trovava una parte, senza modo di sapere che era una parte.

   Qui il registro diventa L'UNIONE dei due: i compiti come sono, più i
   campionamenti del registro generale che nessun compito rivendica. Il
   legame è `mov_ids`, lo stesso che dice «chiusa con due movimenti»: un
   movimento già citato da un compito non si conta due volte.

   La riga che nasce da un movimento si riconosce: `task_id` porta il
   riferimento del movimento e `origine` vale `'movimento'`. Non finisce
   mai a database — è un oggetto che vive il tempo di disegnare una
   tabella.
   ═══════════════════════════════════════════════════════════════════ */

/** Un movimento come lo vede il registro delle attività. */
export interface MovimentoLetto {
  _id?: number;
  ts: Istante;
  type: string;
  article_code?: string;
  lot_code?: string;
  location_code?: string;
  user?: string;
  notes?: string;
  qty_delta?: number | null;
  /* 2.16 — voce 33: senza questi due, un trasferimento di riga intera
     risultava «0 fatto». La quantita' mossa si legge da tutti e tre. */
  qty_before?: number | null;
  dest_location?: string | null;
}

/** Una riga del registro: o un compito, o un movimento che compito non è
    mai stato. `origine` dice quale delle due, e chi disegna la tabella non
    deve indovinarlo dal fatto che manchi un campo. */
export type RigaRegistro = Compito & { origine: 'compito' | 'movimento' };

/* Le causali del registro generale che valgono un'attività anche senza un
   compito dietro. Oggi una sola, e sta scritta qui invece che dentro un
   `if`: il giorno che se ne aggiunge un'altra, si aggiunge qui. */
export const CAUSALI_SENZA_COMPITO: Record<string, string> = {
  SAMPLE: 'SAMPLING',
};

export function registroAttivita(
  compiti: readonly Compito[] | null | undefined,
  movimenti: readonly MovimentoLetto[] | null | undefined,
): RigaRegistro[] {
  const daCompiti: RigaRegistro[] = (compiti ?? []).map(c => ({ ...c, origine: 'compito' as const }));

  /* I movimenti che un compito rivendica già. Un `_id` assente non si
     mette nell'insieme: `undefined` fa combaciare tutti i movimenti senza
     identificativo, e li farebbe sparire tutti insieme. */
  const rivendicati = new Set<number>();
  for (const c of compiti ?? []) {
    for (const id of c.mov_ids ?? []) {
      if (typeof id === 'number') rivendicati.add(id);
    }
  }

  const daMovimenti: RigaRegistro[] = [];
  for (const m of movimenti ?? []) {
    const tipo = CAUSALI_SENZA_COMPITO[String(m?.type ?? '')];
    if (!tipo) continue;
    if (typeof m._id === 'number' && rivendicati.has(m._id)) continue;
    daMovimenti.push({
      task_id: `MOV-${m._id ?? m.ts}`,
      type: tipo,
      priority: PRIORITA_NORMALE,
      status: 'done',
      requested_by: m.user || '',
      requested_at: m.ts,
      assigned_to: m.user || null,
      /* Un gesto fatto senza passare dalla coda non è stato in coda: avvio
         e chiusura coincidono con l'istante del movimento, e l'attesa vale
         zero. Scrivere `null` direbbe «non si sa», che è un'altra cosa. */
      started_at: m.ts,
      completed_at: m.ts,
      completed_by: m.user || null,
      payload: {
        article_code: m.article_code,
        lot_code: m.lot_code,
        location_code: m.location_code,
      },
      note: m.notes || '',
      /* 2.16 — voce 33: un trasferimento di riga intera faceva «0 fatto». */
      qty_done: quantitaMossa(m) ?? 0,
      mov_ids: typeof m._id === 'number' ? [m._id] : [],
      origine: 'movimento',
    });
  }

  return [...daCompiti, ...daMovimenti]
    .sort((a, b) => (b.requested_at || 0) - (a.requested_at || 0));
}
