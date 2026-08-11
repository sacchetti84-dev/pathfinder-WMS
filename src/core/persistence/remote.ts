/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — persistenza remota (il servizio dati)
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Seconda implementazione dello stesso contratto. Non importa niente: parla
   col servizio via fetch, e non sa nemmeno che esista un IndexedDB.
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   REMOTE PERSISTENCE — IL DATABASE VIVE SULLA MACCHINA
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Secondo adapter del contratto. Stessi metodi, stesso vocabolario di
   collezioni, stessa semantica: cambia solo che sotto non c'e' IndexedDB
   ma un servizio Node con SQLite, sulla stessa macchina o in rete.

   PERCHE' ESISTE. Con IndexedDB ogni terminale ha il SUO database e i
   dati non si parlano: due postazioni in magazzino sono due magazzini
   diversi che si somigliano. E il deposito e' il profilo del browser —
   lo stesso pulsante "Cancella dati di navigazione" lo porta via. Un
   file .db sulla macchina si copia, si mette in backup e lo vedono tutti.

   COSA CAMBIA PER CHI STA SOPRA: niente. Store non sa e non deve sapere
   quale dei due adapter ha sotto. Le tre differenze vere sono dichiarate
   dai capability flag, e Store le interroga invece di indovinarle.

   LE TRE DIFFERENZE:

   1. TRANSAZIONI. `transaction(collections, fn)` non puo' eseguire una
      funzione del browser dentro una transazione del server. L'adapter
      allora BUFFERIZZA: dentro il callback le scritture non partono, si
      accodano, e a fine callback vanno al server in un colpo solo su
      /api/tx — o passano tutte o non passa nessuna. I sei punti di
      chiamata che sono sole scritture non se ne accorgono.

   2. LETTURA-MODIFICA-SCRITTURA. Le operazioni che leggono, decidono e
      riscrivono — scaricare una giacenza controllando che basti — NON si
      possono bufferizzare: fra la lettura e la scrittura ci passerebbe un
      altro terminale. Vanno al server come operazioni di dominio
      (`op()`), dove lettura e scrittura stanno dentro lo stesso lock.
      E' `supportsRemoteOps` a dirlo a Store.

   3. AVVISI. Con un database solo e piu' terminali, la copia in memoria
      di ciascuno invecchia appena un altro scrive. Il server manda un
      flusso di eventi e l'adapter riallinea. E' `supportsRealtime`.
   ═══════════════════════════════════════════════════════════════════ */

import { CHIAVE_PRIMARIA, COLLEZIONI } from '../../types/collezioni.js';
import type { Collezione } from '../../types/collezioni.js';
import type { Criterio, OpzioniQuery } from '../../types/contratto.js';
import type { Istante } from '../../types/entita.js';

/* Un errore che viene dal servizio porta con sé lo stato HTTP e la
   distinzione fra «il server ha detto di no» e «il server non ha risposto». */
type ErroreServizio = Error & { status: number; isConflict: boolean };

/* Una scrittura in attesa dentro una transazione. La forma dipende
   dall'operazione — `add` porta un record, `clear` solo il nome della
   collezione — ed è il server a rileggerla: qui è solo un pacco da
   consegnare, e dichiararne quattordici varianti non aggiungerebbe nessun
   controllo che il server non faccia già. */
type ScritturaInAttesa = { op: string; [campo: string]: unknown };

/* Lo stato interno della connessione, dichiarato in un posto solo. Prima
   quattro di questi campi (`serverVersion`, `dbFile`, `revision`, `_es`)
   nascevano dall'assegnazione, sparsi fra tre metodi: esistevano dopo
   `open()` e non prima, e per saperlo bisognava leggere il file. */
const RemotePersistence = {
  kind: 'remote' as const,

  supportsTransactions: true,
  supportsRealtime: true,
  supportsLocalBackup: false,   // il backup e' un compito del servizio
  supportsRemoteOps: true,      // le operazioni di dominio stanno sul server

  /* Come per l'adapter locale: l'elenco arriva da `types/collezioni.ts`.
     Erano due copie della stessa riga in due file, e il compilatore non
     poteva accorgersi se un giorno avessero smesso di combaciare. */
  COLLECTIONS: COLLEZIONI,

  /* Base vuota = stessa origine da cui e' stata servita la pagina. E' il
     caso normale: il servizio serve sia l'applicativo sia i dati, quindi
     non c'e' un indirizzo da configurare e non esiste il caso in cui uno
     risponda e l'altro no. */
  base: '',

  /* Identificativo di questo terminale, stabile per la durata della
     scheda. Serve al server per NON rimandarci l'avviso di un
     cambiamento che abbiamo fatto noi. */
  clientId: 'PF-' + Math.random().toString(36).slice(2, 10).toUpperCase(),

  _tx: null as { collections: Collezione[], ops: ScritturaInAttesa[] } | null,  // buffer delle scritture dentro una transazione
  _online: true,
  _onOffline: null as ((err: unknown) => void) | null,   // callback verso App: il servizio non risponde
  _onChange: null as ((ev: unknown) => void) | null,     // callback verso App: qualcun altro ha scritto
  _es: null as EventSource | null,                       // il flusso di eventi aperto

  /* Diagnostica: chi risponde e su quale file sta lavorando. Non entrano in
     nessuna decisione — si leggono quando qualcosa non torna. */
  serverVersion: null as string | null,
  dbFile: null as string | null,
  revision: null as number | null,

  // ── Trasporto ────────────────────────────────────────────────────

  /* `Promise<any>`: di là c'è JSON, e la sua forma cambia da endpoint a
     endpoint. Fingere un tipo qui vorrebbe dire dichiarare quattordici
     risposte che nessuno verificherebbe — il controllo vero su quella forma
     sta nei collaudi del servizio, dove i dati sono veri. */
  async _call(method: string, path: string, body?: unknown, { raw = false }: { raw?: boolean } = {}): Promise<any> {
    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Pathfinder-Client': this.clientId },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (err) {
      /* Rete caduta o servizio fermo. Non e' un errore applicativo: e'
         la fine della possibilita' di lavorare, e va detto a chi sta
         sopra perche' fermi l'operatore invece di lasciarlo scrivere
         nel vuoto. */
      this._goOffline(err);
      throw new Error('Servizio dati non raggiungibile');
    }
    if (!this._online) this._goOnline();

    if (res.status === 404 && raw) return null;
    if (!res.ok) {
      let msg = `Errore ${res.status}`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
      const err = new Error(msg) as ErroreServizio;
      err.status = res.status;
      /* 409 = il server ha detto di no per un motivo legittimo (giacenza
         insufficiente, chiave duplicata). Va distinto da un guasto:
         chi chiama puo' mostrarlo all'operatore cosi' com'e'. */
      err.isConflict = res.status === 409;
      throw err;
    }
    if (res.status === 204) return null;
    return await res.json();
  },

  _goOffline(err: unknown) {
    if (!this._online) return;
    this._online = false;
    console.error('[pathfinder] servizio dati non raggiungibile:', (err as Error)?.message || err);
    this._onOffline?.(err);
  },

  _goOnline() {
    this._online = true;
    this._onOffline?.(null);
  },

  // ── Apertura e caricamento ───────────────────────────────────────

  async open() {
    const salute = await this._call('GET', '/api/health');
    this.serverVersion = salute.version;
    this.dbFile = salute.file;
    this._subscribe();
    return true;
  },

  async loadAll({ movLogFrom = null }: { movLogFrom?: Istante | null } = {}) {
    const qs = movLogFrom == null ? '' : `?movLogFrom=${encodeURIComponent(movLogFrom)}`;
    const d = await this._call('GET', '/api/load' + qs);
    this.revision = d._revision;
    /* Si restituisce la STESSA forma dell'adapter locale: dodici array
       piu' i due conteggi. Store non deve accorgersi di niente. */
    return {
      sites: d.sites, zones: d.zones, articles: d.articles, inventory: d.inventory,
      locStatus: d.loc_status, disabled: d.disabled,
      movLog: d.mov_log, movLogTotal: d._movLogTotal,
      quarantine: d.quarantine, pendingOut: d.pending_outbound,
      meta: d.meta, pickSession: d.pick_session,
      pickArchive: d.pick_archive, disposalArchive: d.disposal_archive,
      operators: d.operators
    };
  },

  // ── Scritture ────────────────────────────────────────────────────

  async add<T>(collection: Collezione, record: T) {
    if (this._tx) { this._tx.ops.push({ op: 'add', collection, record }); return undefined; }
    const r = await this._call('POST', `/api/c/${collection}`, record);
    return r.key;
  },

  async put<T>(collection: Collezione, record: T) {
    if (this._tx) { this._tx.ops.push({ op: 'put', collection, record }); return undefined; }
    const key = (record as Record<string, unknown>)[this._pk(collection)];
    const r = await this._call('PUT', `/api/c/${collection}/${encodeURIComponent(String(key ?? ''))}`, record);
    return r.key;
  },

  async update(collection: Collezione, key: string | number, changes: Record<string, unknown>) {
    if (this._tx) { this._tx.ops.push({ op: 'update', collection, key, changes }); return undefined; }
    const r = await this._call('PATCH', `/api/c/${collection}/${encodeURIComponent(key)}`, changes);
    return r.changed;
  },

  async delete(collection: Collezione, key: string | number) {
    if (this._tx) { this._tx.ops.push({ op: 'delete', collection, key }); return undefined; }
    const r = await this._call('DELETE', `/api/c/${collection}/${encodeURIComponent(key)}`);
    return r.deleted;
  },

  async bulkAdd<T>(collection: Collezione, records: T[]) {
    if (this._tx) { this._tx.ops.push({ op: 'bulkAdd', collection, records }); return undefined; }
    const r = await this._call('POST', `/api/c/${collection}/bulk?mode=add`, records);
    return r.keys;
  },

  async bulkPut<T>(collection: Collezione, records: T[]) {
    if (this._tx) { this._tx.ops.push({ op: 'bulkPut', collection, records }); return undefined; }
    const r = await this._call('POST', `/api/c/${collection}/bulk?mode=put`, records);
    return r.keys;
  },

  async clear(collection: Collezione) {
    if (this._tx) { this._tx.ops.push({ op: 'clear', collection }); return undefined; }
    const r = await this._call('DELETE', `/api/c/${collection}`);
    return r.deleted;
  },

  async clearMany(collections: Collezione[]) {
    if (this._tx) { this._tx.ops.push({ op: 'clearMany', collections }); return undefined; }
    await this._call('POST', '/api/clear', { collections });
  },

  async deleteWhere(collection: Collezione, criteria: Criterio) {
    if (this._tx) { this._tx.ops.push({ op: 'deleteWhere', collection, criteria }); return undefined; }
    const r = await this._call('POST', `/api/deleteWhere/${collection}`, criteria);
    return r.deleted;
  },

  // ── Letture ──────────────────────────────────────────────────────

  async get<T>(collection: Collezione, key: string | number): Promise<T | undefined> {
    return await this._call('GET', `/api/c/${collection}/${encodeURIComponent(key)}`, undefined, { raw: true });
  },

  async count(collection: Collezione, criteria: Criterio | null = null): Promise<number> {
    const qs = criteria ? `?criteria=${encodeURIComponent(JSON.stringify(criteria))}` : '';
    const r = await this._call('GET', `/api/c/${collection}/count${qs}`);
    return r.count;
  },

  async countAll(): Promise<Record<string, number>> {
    const s = await this._call('GET', '/api/health');
    return s.counts;
  },

  /* Le due conversioni esplicite su `limit` e `offset` sono l'unico punto
     in cui questo file scrive `String(…)` dove prima non c'era, e non è la
     stessa cosa dei cast usati altrove: lì il valore era già una stringa e a
     essere larga era la dichiarazione; qui è davvero un numero, e a
     convertirlo era la coercizione implicita di URLSearchParams. La riga ora
     dice quello che succedeva comunque. */
  async query<T>(collection: Collezione, { criteria = null, limit = null, offset = 0, reverse = false, orderBy = null }: OpzioniQuery = {}): Promise<T[]> {
    const p = new URLSearchParams();
    if (criteria) p.set('criteria', JSON.stringify(criteria));
    if (limit != null) p.set('limit', String(limit));
    if (offset) p.set('offset', String(offset));
    if (reverse) p.set('reverse', 'true');
    if (orderBy) p.set('orderBy', orderBy);
    const qs = p.toString();
    return await this._call('GET', `/api/c/${collection}/query${qs ? '?' + qs : ''}`);
  },

  /** A blocchi, per non portare in memoria sei anni di registro. La
     paginazione la fa il server con LIMIT/OFFSET: qui si scorre. */
  async eachChunk<T>(
    collection: Collezione,
    { criteria = null, chunkSize = 5000 }: { criteria?: Criterio | null, chunkSize?: number } = {},
    fn: (blocco: T[]) => void | Promise<void>,
  ): Promise<number> {
    let offset = 0, totale = 0;
    for (;;) {
      const rows = await this.query<T>(collection, { criteria, limit: chunkSize, offset });
      if (!rows.length) break;
      await fn(rows);
      totale += rows.length;
      if (rows.length < chunkSize) break;
      offset += chunkSize;
    }
    return totale;
  },

  // ── Transazioni ──────────────────────────────────────────────────

  /* Le scritture del callback si accodano e partono insieme. Se il
     callback solleva, la coda si butta e al server non arriva niente:
     una transazione fallita a meta' non esiste, ne' qui ne' li'. */
  async transaction<T>(collections: Collezione[], fn: () => Promise<T>): Promise<T> {
    if (this._tx) return await fn();          // annidata: si unisce a quella di fuori
    this._tx = { collections, ops: [] };
    let out;
    try {
      out = await fn();
    } catch (err) {
      this._tx = null;
      throw err;
    }
    const { collections: cols, ops } = this._tx;
    this._tx = null;
    if (ops.length) await this._call('POST', '/api/tx', { collections: cols, ops });
    return out;
  },

  // ── Operazioni di dominio ────────────────────────────────────────

  /* Lettura, decisione e scrittura nello stesso lock del server. Store
     le usa al posto della sequenza locale quando supportsRemoteOps e'
     vero — vedi Store.removeItem. */
  async op<T>(nome: string, payload: unknown): Promise<T> {
    return await this._call('POST', `/api/op/${nome}`, payload);
  },

  // ── Avvisi dagli altri terminali ─────────────────────────────────

  /* Un canale in sola lettura che il browser riapre da se' se cade.
     Quando un altro terminale scrive, qui si sa quali collezioni ha
     toccato e si puo' riallineare invece di lavorare su dati vecchi.

     I due `as EventListener`: per un nome d'evento che il browser non
     conosce in anticipo — 'hello' e 'change' sono nostri — la firma
     dichiarata è quella generica, con un `Event` che non ha `data`. Il
     dato c'è, ed è un MessageEvent: il cast dice al compilatore ciò che
     il server garantisce. */
  _subscribe() {
    if (this._es) { try { this._es.close(); } catch {} }
    const es = new EventSource(`${this.base}/api/events?client=${encodeURIComponent(this.clientId)}`);
    this._es = es;
    es.addEventListener('hello', ((e: MessageEvent) => {
      try { this.revision = JSON.parse(e.data).rev; } catch {}
      this._goOnline();
    }) as EventListener);
    es.addEventListener('change', ((e: MessageEvent) => {
      let ev = null;
      try { ev = JSON.parse(e.data); } catch { return; }
      this.revision = ev.rev;
      this._onChange?.(ev);
    }) as EventListener);
    /* EventSource riprova da solo. Si segnala l'interruzione perche'
       l'operatore sappia che sta guardando dati che potrebbero non
       essere piu' quelli veri. */
    es.onerror = () => { if (es.readyState === EventSource.CLOSED || es.readyState === EventSource.CONNECTING) this._goOffline(new Error('flusso eventi interrotto')); };
  },

  // ── Spazio e backup ──────────────────────────────────────────────

  /* Il backup non e' piu' un compito del browser: lo fa il servizio, che
     sa copiare il database a caldo. supportsLocalBackup e' false e Store
     non prova nemmeno a passare da qui. */
  isBackupSupported(): boolean { return false; },

  /* ═══════════════════════════════════════════════════════════════════
     v1.1.0 [N6] — LO SPAZIO SI DICHIARA CON LE PAROLE DEL CONTRATTO
     © Andrea Sacchetti — Dietopack S.r.l.

     Questo metodo restituiva `percent`, mentre il contratto — cioe' cio'
     che LocalPersistence restituisce e cio' che la UI legge — parla di
     `pct`. Nessuno se ne accorgeva finche' non si apriva Configurazione ->
     Dati e Backup con l'adapter remoto: li' `est.pct.toFixed(1)` trovava
     undefined e l'INTERA scheda non si disegnava. Restava vuota, con un
     messaggio d'errore, e con dentro il pulsante «Importa da JSON» —
     cioe' proprio il passo con cui si porta un magazzino locale sul
     servizio. Il difetto rendeva impossibile la migrazione.

     `quota` e `pct` restano NULL, e non e' una svista: su un servizio non
     esiste una quota del browser da riempire. C'e' un disco, e quanto sia
     grande questo applicativo non lo sa e non deve fingere di saperlo.
     Chi legge distingue "non applicabile" da "zero per cento" perche' i
     tre punti di lettura ora controllano prima di dividere.
     ═══════════════════════════════════════════════════════════════════ */
  async estimateUsage() {
    const s = await this._call('GET', '/api/health');
    return { usage: s.bytes, quota: null, pct: null, remote: true, file: s.file };
  },

  /* Chiave primaria per collezione. Serve a put(), che deve sapere quale
     campo del documento e' la chiave.

     Era una copia della mappa che sta nello schema del server, con scritto
     accanto che le due dovevano coincidere e che questo era «l'unico punto
     in cui questa conoscenza e' duplicata». Adesso non lo è più: la mappa
     sta in `types/collezioni.ts`, e il servizio importa quel file. Restano
     due letture della stessa riga, non due righe da tenere allineate. */
  _pk(collection: Collezione): string { return CHIAVE_PRIMARIA[collection] || '_id'; }
};

export { RemotePersistence };
