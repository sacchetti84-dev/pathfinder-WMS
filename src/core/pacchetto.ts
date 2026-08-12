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

/** Si muove a ogni rilascio. È qui e in `modules/vault.ts`: due posti, perché
    il vault scrive il proprio manifesto senza passare da `Store`. */
export const VERSIONE_APP = '1.2.0';

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

export interface Pacchetto {
  _format: string;
  _author: string;
  _appVersion: string;
  _exported: string;
  _counts?: Record<string, number>;
  _movRange?: { from: number; to: number };
  doc_config?: unknown;
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
  const data: Pacchetto = {
    _format: FORMATO,
    _author: 'Andrea Sacchetti',
    _appVersion: VERSIONE_APP,
    _exported: new Date().toISOString(),
    /* `zones` è riappeso in cache, non è una colonna: esce di qui, e la
       collezione `zones` viaggia per conto suo. */
    sites: C.sites.map(s => { const { zones, ...resto } = s; return resto; }),
    zones: C.zones,
    articles: C.articles,
    inventory: C.inventory,
    loc_status: [...C.locStatus.values()],
    disabled: [...C.disabled].map(code => ({ location_code: code })),
    mov_log: movLog,
    quarantine: C.quarantine,
    pending_outbound: C.pendingOut,
    pick_archive: C.pickArchive,
    disposal_archive: C.disposalArchive,
    doc_config: C.meta?.docConfig || null,
    operators: C.operators,
    /* 1.4.0 — vuote finché non si accende l'interruttore che le riguarda. */
    lots: C.lots,
    udc: C.udc,
    tasks: C.tasks,
    wip: C.wip,
    storage_rules: C.storageRules,
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
