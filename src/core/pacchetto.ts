/* IL PACCHETTO DI EXPORT: COSA ESCE, E COSA SI CONTROLLA QUANDO RIENTRA.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Quarto blocco della conversione di `store.js` (PIANO-1.4 §3). Qui dentro
   non si scrive niente sul supporto: si COMPONE il pacchetto e lo si VERIFICA.
   La transazione di ripristino resta in `Store`, perché parla con
   `Persistence`, ed è l'unica parte che non si può collaudare da fermo.

   Questo blocco non aveva nessuna prova, ed è il percorso di backup e
   ripristino: cioè quello che si usa il giorno in cui è già andato storto
   qualcos'altro. */

import { COLLEZIONI, CHIAVE_PRIMARIA, type Collezione } from '../types/collezioni.js';
import type { Cache } from './cache.js';
import type { Movimento } from '../types/entita.js';

/* `_format` NON segue la versione dell'applicativo: descrive la FORMA del
   file, che non cambia. A muoversi è `_appVersion` (HANDOFF, decisione 13).
   È il motivo per cui un export della 1.2 rientra in una 1.4 e viceversa. */
export const FORMATO = 'warehouse-mapper-v1.5';

/** Si muove a ogni rilascio, e il timbro finisce dentro `_appVersion` di ogni
    export e di ogni backup: dice con quale applicativo è stato scritto quel
    pacchetto, e non decide niente — a decidere se un pacchetto si può rileggere
    è `FORMATO`, qui sopra.

    Era rimasto a `1.7` per tutta la 1.8, ed era scritto in due posti: qui e
    nella copia esterna, che il proprio manifesto lo scriveva senza passare da
    `Store`. La copia esterna è uscita con la 2.1.

    **E POI E' RIMASTO A `2.9` PER LA 2.10, LA 2.11 E MEZZA 2.12**, trovato al
    banco il 27/08 leggendo il piede di un rendiconto stampato. Non e' una
    riga di poco conto: questo numero finisce sul PIEDE DI OGNI DOCUMENTO —
    DDT, rendiconto di consumo, verbale di campionamento, cartellino di non
    conformita', rapporto di prelievo — e in testa a ogni export. Un
    documento che si tiene sei anni e dichiara la versione sbagliata dice una
    cosa falsa su come e' stato prodotto, e nessuno se ne accorge guardandolo.

    LA RIGA QUI SOTTO NON E' L'UNICO POSTO DOVE IL NUMERO E' SCRITTO, e
    scriverlo qui sopra non lo ha reso vero: gli altri tre sono
    `package.json`, `const VERSIONE` in `vite.config.js` e `const VERSION` in
    `server/pathfinder-server.js`. A tenerli allineati adesso c'e'
    `test/versioni.test.js`, che li legge tutti e quattro e fallisce se uno
    diverge. */
export const VERSIONE_APP = '2.21.1';

/* L'ELENCO DELLE COLLEZIONI DA ESPORTARE STA IN UN POSTO SOLO.
   Fino alla 1.4.0 era scritto a mano in tre — `exportAll`, `_countsOf`,
   `importAll` — e combaciavano perché qualcuno se n'era ricordato. Con cinque
   collezioni in arrivo, dimenticarne una in uno dei tre significa un backup
   che sembra completo e non lo è, oppure un ripristino che azzera le giacenze
   e lascia in piedi le UDC che ci puntavano.

   Fuori restano due, ed entrambe per un motivo:
     · `meta`         — non è un elenco, e la parte che serve viaggia come
                        `doc_config`;
     · `pick_session` — è la sessione APERTA su un terminale. Un backup non la
                        deve riportare in vita. */
export const COLLEZIONI_EXPORT: Collezione[] =
  COLLEZIONI.filter(c => c !== 'meta' && c !== 'pick_session');

/* LE IMPOSTAZIONI VIAGGIANO COL BACKUP, E FINO ALLA 2.2 NON VIAGGIAVANO.

   `meta` resta fuori da `COLLEZIONI_EXPORT` — non è un elenco di record, e
   ci vivono anche cose che non hanno senso altrove: l'ora dell'ultimo
   salvataggio, il segno delle modifiche non salvate, il riferimento a una
   cartella scelta in un altro browser. Ma dentro `meta` stanno anche le
   IMPOSTAZIONI del magazzino, e un ripristino che le lascia indietro
   restituisce un magazzino che non sa più dov'è il vano di lavorazione né
   che forma ha il suo cruscotto.

   Escono per nome, non per esclusione: una chiave nuova entra nel backup il
   giorno in cui qualcuno la aggiunge a questo elenco, e finché non lo fa il
   backup non porta silenziosamente in giro dati di cui nessuno ha deciso
   niente. `docConfig` esce anche come `doc_config`, che è dove i pacchetti
   fino alla 2.1 lo tenevano: un backup vecchio deve continuare a rientrare. */
export const IMPOSTAZIONI_ESPORTATE = [
  'docConfig', 'areaWip', 'udcPrefissoGS1', 'dashboardLayout', 'oreUrgenza',
] as const;

/** Le impostazioni da mettere nel pacchetto. Le chiavi mai valorizzate non
    ci sono: un backup dice quello che c'è, non elenca quello che manca. */
export function impostazioni(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of IMPOSTAZIONI_ESPORTATE) {
    const v = meta?.[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

export interface Pacchetto {
  _format: string;
  _author: string;
  _appVersion: string;
  _exported: string;
  _counts?: Record<string, number>;
  _movRange?: { from: number; to: number };
  doc_config?: unknown;
  impostazioni?: Record<string, unknown>;
  [collezione: string]: unknown;
}

/** Quante righe porta davvero, collezione per collezione. Si scrive nel
    pacchetto e si ricalcola quando rientra: è il confronto fra i due che dice
    se il file è arrivato intero. */
export function conta(data: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of COLLEZIONI_EXPORT) {
    out[k] = Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0;
  }
  return out;
}

/** Il pacchetto, dalla cache. `movLog` arriva da fuori perché leggerlo è
    l'unica parte asincrona, e sta in `Store`. */
export function componi(
  C: Cache,
  movLog: Movimento[],
  { includeMovLog = true }: { includeMovLog?: boolean } = {},
): Pacchetto {
  /* IL PACCHETTO È UNA FOTOGRAFIA, NON UNA FINESTRA.
     Fino alla 1.4.0 qui si scriveva `inventory: C.inventory` — cioè si
     metteva nel pacchetto il RIFERIMENTO all'array della cache, non una
     copia. Finché fra l'export e la serializzazione non succede niente
     funziona; ma chi fra i due legge tutto il registro movimenti — su un
     magazzino vero un'attesa lunga — lo fa proprio mentre qualcuno sta
     lavorando.

     Il guaio non è che il file contenga una riga in più: è che `_counts`
     viene calcolato SUBITO e il contenuto viene letto DOPO. I due divergono,
     e il pacchetto fallisce la propria verifica — cioè il controllo che
     esiste per accorgersi di un file troncato griderebbe al lupo su un
     backup sano, che è il modo più veloce di insegnare a ignorarlo.

     Una copia dell'elenco basta: `_counts` misura quante righe ci sono, e
     l'appartenenza è ciò che si congela qui. */
  const data: Pacchetto = {
    _format: FORMATO,
    _author: 'Andrea Sacchetti',
    _appVersion: VERSIONE_APP,
    _exported: new Date().toISOString(),
    /* `zones` è riappeso in cache, non è una colonna: esce di qui, e la
       collezione `zones` viaggia per conto suo. */
    sites: C.sites.map(s => { const { zones, ...resto } = s; return resto; }),
    zones: [...C.zones],
    articles: [...C.articles],
    inventory: [...C.inventory],
    loc_status: [...C.locStatus.values()],
    disabled: [...C.disabled].map(code => ({ location_code: code })),
    mov_log: [...movLog],
    quarantine: [...C.quarantine],
    pending_outbound: [...C.pendingOut],
    pick_archive: [...C.pickArchive],
    disposal_archive: [...C.disposalArchive],
    doc_config: C.meta?.docConfig || null,
    /* 2.2 — le impostazioni, perché un ripristino le deve rimettere. */
    impostazioni: impostazioni(C.meta as Record<string, unknown>),
    operators: [...C.operators],
    /* 1.4.0 — vuote finché non si accende l'interruttore che le riguarda. */
    lots: [...C.lots],
    udc: [...C.udc],
    tasks: [...C.tasks],
    wip: [...C.wip],
    storage_rules: [...C.storageRules],
    recipients: [...C.recipients],
    /* 2.8 — la caratterizzazione delle celle. Sono dieci record su duemila
       ubicazioni, e sono esattamente quelli che nessuno ha voglia di
       riscrivere a mano dopo un ripristino: le eccezioni le ricorda solo
       chi le ha decise. */
    location_attrs: [...C.locAttrs.values()],
  };

  /* Senza registro il campo SPARISCE, non resta a zero: un pacchetto che
     dichiara «mov_log: 0» direbbe che di movimenti non ce n'erano, che è
     un'altra cosa dal non averli esportati. Vale anche per il suo conteggio. */
  if (!includeMovLog) delete data.mov_log;
  data._counts = conta(data);
  if (!includeMovLog) delete data._counts!.mov_log;

  if (movLog.length) {
    data._movRange = { from: movLog[movLog.length - 1]!.ts, to: movLog[0]!.ts };
  }
  return data;
}

/** Cosa non torna in un pacchetto che sta per rientrare. Si guarda PRIMA di
    scrivere, perché dopo il ripristino ha già sostituito il magazzino. */
export function verifica(data: unknown): { ok: boolean; problemi: string[] } {
  const problemi: string[] = [];
  if (!data || typeof data !== 'object') {
    return { ok: false, problemi: ['File non leggibile o non JSON.'] };
  }
  const d = data as Record<string, unknown>;

  if (!String(d._format || '').startsWith(FORMATO)) {
    problemi.push(`Formato non riconosciuto: "${d._format || 'assente'}". Atteso ${FORMATO}.x`);
  }

  if (d._counts) {
    const reali = conta(d);
    for (const [k, atteso] of Object.entries(d._counts as Record<string, number>)) {
      if (reali[k] !== atteso) {
        problemi.push(`${k}: il file dichiara ${atteso} record, ne contiene ${reali[k]}`);
      }
    }
  } else {
    problemi.push('Il file non porta i conteggi di controllo (backup anteriore alla v2.8.0): impossibile verificarne la completezza.');
  }

  /* Un pacchetto senza nessun dato di magazzino è quasi sempre un file
     sbagliato, non un magazzino vuoto. Vale la pena chiederlo. */
  const totale = Object.values(conta(d)).reduce((s, n) => s + n, 0);
  if (totale === 0) problemi.push('Il file non contiene alcun record.');

  return { ok: problemi.length === 0, problemi };
}

/** Le righe pronte da scrivere. `_id` lo assegna il supporto: si butta via e
    si riassegna, se no due pacchetti diversi si contenderebbero le stesse
    chiavi. Su `sites` cade anche `zones`, che in cache è ricostruito. */
export function righeDaScrivere(
  collezione: Collezione, righe: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  let pulite = CHIAVE_PRIMARIA[collezione] === '_id'
    ? righe.map(({ _id, ...r }) => r)
    : [...righe];
  if (collezione === 'sites') pulite = pulite.map(({ zones, ...r }) => r);
  return pulite as Record<string, unknown>[];
}
