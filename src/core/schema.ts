/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — schema IndexedDB e migrazioni
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Le sette versioni dello schema, dalla v1 alla v7, con le loro migrazioni.

   PERCHÉ RESTA, ORA CHE I DATI STANNO SUL SERVIZIO.
   Questo è lo schema del ramo LOCALE: quello che serve quando l'applicativo
   viene aperto con doppio clic, senza servizio, per consultare o ristampare.
   Le migrazioni non si cancellano nemmeno quando sembrano vecchie: un file
   fermo alla v4 in un backup di due anni fa deve poter ancora salire fino
   alla v7, e la scala si sale un gradino per volta.

   FASE 3 — PERCHÉ QUESTO FILE È DIVENTATO .ts PRIMA DEGLI ADAPTER.
   `new Dexie(nome)` restituisce un oggetto che non ha, per il compilatore,
   né `db.sites` né `db.mov_log`: le tabelle nascono dalle stringhe passate a
   `.stores()`, che sono testo e restano testo. Finché era così, l'adapter
   locale non poteva essere controllato — ogni riga che tocca una tabella
   sarebbe stata un errore, e l'unico modo di andare avanti sarebbe stato un
   `as any` che spegne il controllo proprio dove serve.

   La classe qui sotto dichiara le quattordici tabelle con le entità che ci
   stanno dentro. Non aggiunge comportamento e non cambia una riga di
   migrazione: mette in una forma leggibile dal compilatore ciò che le
   stringhe di `.stores()` dicevano già. Da qui in avanti scrivere una
   `Giacenza` dentro `db.articles` non compila.
   ═══════════════════════════════════════════════════════════════════ */

import Dexie, { type Table } from 'dexie';
import { DB_NAME } from './costanti';
import type {
  Sito, Zona, Articolo, Giacenza, StatoUbicazione, UbicazioneDisattivata,
  Movimento, Quarantena, DocumentoUscita, SessionePrelievo, ReportPrelievo,
  VerbaleSmaltimento, Operatore, Meta,
} from '../types/entita.js';

/* Il secondo parametro di `Table` è il tipo della CHIAVE PRIMARIA, e le due
   famiglie non sono intercambiabili: `number` dove Dexie assegna un `++_id`,
   `string` dove la chiave è naturale e il client la conosce prima di
   scrivere il record (vedi il commento di CHIAVE_PRIMARIA in collezioni.ts). */
class PathfinderDB extends Dexie {
  sites!: Table<Sito, number>;
  zones!: Table<Zona, number>;
  articles!: Table<Articolo, number>;
  inventory!: Table<Giacenza, number>;
  loc_status!: Table<StatoUbicazione, number>;
  disabled!: Table<UbicazioneDisattivata, number>;
  mov_log!: Table<Movimento, number>;
  quarantine!: Table<Quarantena, number>;
  pending_outbound!: Table<DocumentoUscita, string>;
  pick_session!: Table<SessionePrelievo, string>;
  pick_archive!: Table<ReportPrelievo, string>;
  disposal_archive!: Table<VerbaleSmaltimento, string>;
  operators!: Table<Operatore, string>;
  meta!: Table<Meta, string>;
}

const db = new PathfinderDB(DB_NAME);
db.version(1).stores({
  sites:        '++_id, &id',                                   // unique by code
  zones:        '++_id, site_id, &[site_id+id]',                // unique per site
  articles:     '++_id, &code, category',                       // unique by code
  inventory:    '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:   '++_id, &location_code, status',                // blocked/reserved by code
  disabled:     '++_id, &location_code',
  mov_log:      '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:   '++_id, &q_id, item_key, status, article_code, lot_code',
  meta:         'key'                                           // key/value simple store
});

/* v1.7.0 — Migrazione schema v1 → v2
   Aggiunta logica di gestione qty (Colli) su inventory e mov_log.
   Tutti i record esistenti pre-v1.7.0 ricevono qty=1 di default. */
db.version(2).stores({
  sites:        '++_id, &id',
  zones:        '++_id, site_id, &[site_id+id]',
  articles:     '++_id, &code, category',
  inventory:    '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:   '++_id, &location_code, status',
  disabled:     '++_id, &location_code',
  mov_log:      '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:   '++_id, &q_id, item_key, status, article_code, lot_code',
  meta:         'key'
}).upgrade(async tx => {
  // Default qty=1 su inventario esistente
  await tx.table('inventory').toCollection().modify(item => {
    if (typeof item.qty !== 'number' || item.qty < 1) item.qty = 1;
  });
  // Default qty fields su mov_log esistente (storici)
  await tx.table('mov_log').toCollection().modify(rec => {
    if (typeof rec.qty_delta !== 'number') rec.qty_delta = null;     // null = movimento storico pre-qty
    if (typeof rec.qty_before !== 'number') rec.qty_before = null;
    if (typeof rec.qty_after !== 'number') rec.qty_after = null;
  });
});

/* v2.0.0 — Migrazione schema v2 → v3
   Nuovo store `pending_outbound`: traccia DDT di reso/spedizione registrati
   ma non ancora evasi fisicamente. La merce resta in giacenza fino al click
   del bottone "EVADI" (il vettore fisicamente preleva la merce).
   Schema record:
     {
       doc_id (PK)         — 'RES-...' o 'SHIP-...'
       kind                — 'RES' | 'SHIP'
       ddt_num             — numero DDT (testata)
       destination         — fornitore (RES) o cliente (SHIP)
       carrier             — vettore (opzionale)
       operator            — utente che ha registrato il documento
       status              — 'pending' | 'evaded' | 'cancelled'
       created_at          — timestamp creazione documento
       evaded_at | null    — timestamp evasione
       cancelled_at | null — timestamp annullamento
       lines               — array di righe { article_code, article_description,
                                             lot_code, location_code, item_key,
                                             expiry_date, qty, qty_at_creation, notes }
     }
   La giacenza NON viene toccata alla creazione: solo all'evasione.
   L'item resta in giacenza ma è MARCATO come "in attesa di uscita" tramite
   Store.isItemPendingOutbound(location_code, item_key) e, dalla v2.0.1,
   quantificato da Store.getAvailableQty(location_code, item_key). */
db.version(3).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  meta:             'key'
});

/* ═══════════════════════════════════════════════════════════════════
   v2.5.0 — Migrazione schema v3 → v4
   © Andrea Sacchetti — Dietopack S.r.l.

   Nuovo store `pick_session`: SESSIONE DI PRELIEVO IN CORSO.

   Non è un archivio documentale e non deve diventarlo. L'ordine di
   produzione importato NON viene conservato: qui vive solo lo stato di
   avanzamento del cammino fisico in magazzino, per il tempo strettamente
   necessario a percorrerlo. A percorso concluso (o chiuso dall'operatore)
   il record viene ELIMINATO. Sopravvive unicamente il `mov_log`, che resta
   la sola fonte di verità per l'audit trail GMP.

   Perché esiste: i movimenti sono già scritti tappa per tappa (difesa
   primaria), ma senza questo store la CODA RESIDUA del percorso — quali
   tappe mancano, in che ordine, con quali alternative e quali note — vivrebbe
   solo in memoria. Una scheda chiusa per errore costringerebbe a ricostruire
   a mente il lavoro rimasto, con il rischio di saltare una riga.

   Vincolo di unicità: UNA SOLA sessione attiva per volta. Aprire un secondo
   percorso mentre uno è in corso richiede conferma esplicita.

   Schema record:
     session_id (PK)  — 'PS-<ODP>-<base36>'
     odp_num          — n. ordine di produzione (riferimento, non archivio)
     odp_article      — codice articolo finito
     odp_lot          — lotto di produzione
     odp_qty          — quantità prevista (testo, come da ODP)
     operator         — operatore che ha avviato il percorso
     status           — 'active'
     created_at       — timestamp di avvio
     site_order       — ordine dei siti usato per costruire il percorso
     stops            — tappe [{ seq, site_id, location_code, article_code,
                                 article_description, lot_code, item_key,
                                 kg_required, um, expiry_iso, alternatives[],
                                 status, reason, forced_note,
                                 qty_picked, done_at }]
     offroute         — righe non percorribili [{ article_code, description,
                                 lot_code, kg_required, reason, detail }]
     warnings         — anomalie rilevate in fase di import
   ═══════════════════════════════════════════════════════════════════ */
db.version(4).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  meta:             'key'
});

/* ═══════════════════════════════════════════════════════════════════
   v2.5.1 — Migrazione schema v4 → v5
   © Andrea Sacchetti — Dietopack S.r.l.

   Nuovo store `pick_archive`: SNAPSHOT DEL REPORT EMESSO ALLA CHIUSURA.

   Perché esiste. Il report di prelievo deve poter essere ristampato dal
   registro degli ordini prelevati IDENTICO a quello emesso a fine
   percorso. Fino alla v2.5.1 non era possibile: `pick_session` viene
   cancellato alla chiusura (e resta giusto così — non è un archivio) e il
   `mov_log` non conosce il numero di tappa, i kg d'ordine, le righe
   rimaste fuori percorso, le segnalazioni né gli avvisi d'import. La
   ristampa ricostruiva quindi un documento DIVERSO dall'originale: per un
   documento GMP è un difetto, non un dettaglio.

   Che cosa NON è. Non è una seconda verità sul magazzino. Le giacenze e
   l'audit trail restano dove sono sempre stati: `inventory` e `mov_log`.
   Questo store conserva la FOTOGRAFIA DEL FOGLIO STAMPATO, congelata
   nell'istante della chiusura, e nient'altro. Se un domani sparisse, non
   si perderebbe alcun dato di magazzino: si perderebbe la possibilità di
   ristampare una copia conforme.

   Retention. Nessuna cancellazione automatica, coerentemente con la
   decisione B-2 (v2.0.1 [B8]): la purge dei record è manuale, da
   Configurazione → Dati e Backup. Un record pesa pochi KB.

   Schema record (snapshot normalizzato, vedi App._pickSnapFrom*):
     doc_id (PK)   — identificativo del documento, stabile per sempre
     odp_num       — n. ordine di produzione (indice di ricerca)
     closed_at     — istante di emissione dell'originale
     kind          — 'route' (prelievo guidato) | 'cart' (flusso a carrello)
     …             — l'intero snapshot letto dal template di stampa
   ═══════════════════════════════════════════════════════════════════ */
db.version(5).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  meta:             'key'
});

/* ═══════════════════════════════════════════════════════════════════
   v2.7.0 [G6] — SCHEMA v6: ANAGRAFICA OPERATORI
   © Andrea Sacchetti — Dietopack S.r.l.

   Una sola collezione in piu'. Le dodici precedenti sono ripetute identiche
   perche' Dexie richiede lo schema completo a ogni versione: nessuna di esse
   viene toccata, riscritta o migrata, e all'apertura di un database v5 Dexie
   crea il solo store `operators`, vuoto.

   Che cosa contiene. Nome, cognome, iniziali, ruolo e — per chi lo ha
   impostato — l'HASH del PIN con il suo salt. Il PIN in chiaro non entra qui
   e non entra da nessun'altra parte: vedi il modulo Auth.

   Perche' le iniziali restano la chiave di attribuzione. Sono cio' che i
   movimenti, le quarantene e i DDT hanno scritto dentro dal 2024. Cambiare
   ora l'identificatore significherebbe rendere illeggibile lo storico o
   riscriverlo: la prima cosa e' un danno, la seconda in un sistema GMP non
   si fa. `op_id` esiste per il futuro (utenze su server), le iniziali per il
   passato: entrambe convivono senza che nessuno debba scegliere oggi.

     op_id       — identificativo interno stabile
     initials    — 2-4 caratteri, UNICHE, cio' che finisce sui record
     role        — 'operator' | 'leader'
     pin_hash    — SHA-256 di salt+':'+pin, esadecimale (mai il PIN)
     pin_salt    — 16 byte casuali, esadecimale
     active      — false = non piu' selezionabile. Non si cancella: chi ha
                   firmato un movimento resta in anagrafica per sempre.
   ═══════════════════════════════════════════════════════════════════ */
db.version(6).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  operators:        '&op_id, &initials, role, active',
  meta:             'key'
});

/* ═══════════════════════════════════════════════════════════════════
   v3.0.0 [M2] — Migrazione schema v6 → v7
   © Andrea Sacchetti — Dietopack S.r.l.

   Un solo store nuovo: `disposal_archive`, i verbali di smaltimento
   emessi. Nessuno store esistente viene toccato, nessun record viene
   riscritto: Dexie porta avanti i dati da se'.

   PERCHE' UN ARCHIVIO E NON IL SOLO REGISTRO. Il registro movimenti
   sa che dodici colli sono usciti e adesso — [M1] — sa anche perche'.
   Ma un verbale ricostruito dal registro sarebbe un foglio NUOVO,
   compilato oggi con i dati di allora: numero diverso, intestazione
   diversa, firma di nessuno. Un documento che si ristampa deve essere
   LO STESSO documento, ed e' la ragione per cui la v2.5.1 aveva gia'
   fatto questa scelta per i report di prelievo. Qui si ripete, non si
   inventa.

   I campi indicizzati sono quelli su cui si cerca davvero: la data di
   emissione (elenco cronologico) e la coppia articolo/lotto (a un audit
   si chiede "fammi vedere gli smaltimenti di QUEL lotto").

   NOTA SUI CAMPI NUOVI DELL'ANAGRAFICA ARTICOLI. `weight_net_kg` e
   `pieces_per_pack` [M4] NON compaiono qui e non e' una dimenticanza:
   sono proprieta' interne al record, non indici, e IndexedDB non ha
   uno schema di colonne da dichiarare. Gli articoli che non le hanno
   restano validi e leggono undefined, che e' esattamente il caso
   "peso non censito" che la testata del DDT lascia compilare a mano.
   ═══════════════════════════════════════════════════════════════════ */
db.version(7).stores({
  sites:            '++_id, &id',
  zones:            '++_id, site_id, &[site_id+id]',
  articles:         '++_id, &code, category',
  inventory:        '++_id, location_code, item_key, article_code, lot_code, [location_code+item_key]',
  loc_status:       '++_id, &location_code, status',
  disabled:         '++_id, &location_code',
  mov_log:          '++_id, ts, type, article_code, lot_code, location_code',
  quarantine:       '++_id, &q_id, item_key, status, article_code, lot_code',
  pending_outbound: '&doc_id, kind, status, ddt_num, created_at',
  pick_session:     '&session_id, status, created_at',
  pick_archive:     '&doc_id, odp_num, closed_at',
  disposal_archive: '&doc_id, created_at, article_code, lot_code',
  operators:        '&op_id, &initials, role, active',
  meta:             'key'
});

/* schema IndexedDB atomic-ready */

export { db };
