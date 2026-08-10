/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — persistenza locale (IndexedDB via Dexie)
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   Prima implementazione del contratto descritto in index.js. È quella che
   serve quando l'applicativo viene aperto con doppio clic, senza servizio.
   ═══════════════════════════════════════════════════════════════════ */

import { db } from '../schema.js';

const LocalPersistence = {
  kind: 'local',

  supportsTransactions: true,
  supportsRealtime: false,
  supportsLocalBackup: true,

  /* L'elenco delle collection e' dichiarato qui e non dedotto da Dexie:
     e' il vocabolario del contratto, e deve restare identico qualunque
     sia il supporto sottostante. */
  COLLECTIONS: [
    'sites', 'zones', 'articles', 'inventory', 'loc_status', 'disabled',
    'mov_log', 'quarantine', 'pending_outbound', 'pick_session',
    'pick_archive', 'disposal_archive',           // v3.0.0 [M2] — verbali di smaltimento
    'operators', 'meta'                           // v2.7.0 [G6] — operators
  ],

  /* Dexie da qui in giu' e' un dettaglio interno. La costante `db` e la
     catena db.version(1..7) restano dove sono: sono la storia delle
     migrazioni ed hanno valore documentale. */
  _table(collection) {
    const t = db[collection];
    if (!t) throw new Error(`Collection sconosciuta: ${collection}`);
    return t;
  },

  _tables(collections) {
    return collections.map(c => this._table(c));
  },

  /* Criterio dichiarativo -> WhereClause di Dexie. Gli operatori ammessi
     sono soltanto i tre che il file usa davvero: aggiungerne di piu' "per
     comodita'" significherebbe impegnare il futuro RemoteAdapter a
     implementarli. */
  _where(collection, criteria) {
    const { field, op, value } = criteria ?? {};
    if (!field || !op) throw new Error('Criterio incompleto: servono field e op');
    const clause = this._table(collection).where(field);
    switch (op) {
      case 'equals':     return clause.equals(value);
      case 'startsWith': return clause.startsWith(value);
      case 'below':      return clause.below(value);
      /* v2.8.0 [H2] — I due criteri che servono a leggere il registro per
         intervallo di date senza tirarselo tutto in memoria. Restano gli
         unici aggiunti: ogni operatore in piu' e' un impegno che il futuro
         adapter remoto dovra' onorare. */
      case 'aboveOrEqual': return clause.aboveOrEqual(value);
      case 'between':      return clause.between(value[0], value[1], true, true);
      default: throw new Error(`Operatore non supportato: ${op}`);
    }
  },

  async open() {
    await db.open();
  },

  /* Idratazione iniziale. Restituisce le collezioni GREZZE: trasformarle
     in Map, Set od oggetti e' una scelta di rappresentazione della cache,
     quindi appartiene a Store. Se la facesse l'adapter, ogni nuovo
     adapter dovrebbe conoscere la forma interna della cache.

     v2.8.0 [H2] — Il registro movimenti NON arriva piu' per intero. Il
     chiamante passa `movLogFrom` (timestamp) e riceve solo i movimenti da
     quell'istante in poi. E' l'unica collezione che cresce senza limite: le
     altre sono fotografie del presente e restano piccole per costruzione.

     `movLogTotal` accompagna la finestra perche' l'interfaccia deve poter
     dire quanti movimenti ci sono DAVVERO in archivio, non quanti se ne
     stanno tenendo in mano. */
  async loadAll({ movLogFrom = null } = {}) {
    const movLogQuery = movLogFrom === null
      ? db.mov_log.orderBy('ts').reverse().toArray()
      : db.mov_log.where('ts').aboveOrEqual(movLogFrom).reverse().toArray();
    const [sites, zones, articles, inventory, locStatus, disabled,
           movLog, movLogTotal, quarantine, pendingOut, meta, pickSession, pickArchive,
           disposalArchive, operators] =
      await Promise.all([
        db.sites.toArray(),
        db.zones.toArray(),
        db.articles.toArray(),
        db.inventory.toArray(),
        db.loc_status.toArray(),
        db.disabled.toArray(),
        movLogQuery,
        db.mov_log.count(),
        db.quarantine.toArray(),
        db.pending_outbound.orderBy('created_at').reverse().toArray(),
        db.meta.toArray(),
        db.pick_session.toArray(),
        db.pick_archive.orderBy('closed_at').reverse().toArray(),
        db.disposal_archive.orderBy('created_at').reverse().toArray(),   // v3.0.0 [M2]
        db.operators.toArray()                       // v2.7.0 [G6]
      ]);
    return { sites, zones, articles, inventory, locStatus, disabled,
             movLog, movLogTotal, quarantine, pendingOut, meta, pickSession, pickArchive,
             disposalArchive, operators };
  },

  /* ═══════════════════════════════════════════════════════════════════
     v2.8.0 [H3] — GUARDIA SULLE SCRITTURE
     © Andrea Sacchetti — Dietopack S.r.l.

     Fino alla v2.7.0 QuotaExceededError non era gestito in nessun punto del
     file: a disco pieno una scrittura falliva, la promise veniva rifiutata e
     l'errore finiva nella console, dove nessuno guarda. Il caso peggiore e'
     documentato in [H3] del changelog: giacenza spostata, movimento non
     registrato, nessun avviso.

     Ogni scrittura passa ora di qui. Il compito e' minimo e preciso:
     riconoscere l'esaurimento dello spazio, tradurlo in un errore che dice
     cosa e' successo, e alzare una bandiera che l'interfaccia possa vedere.
     Chi decide cosa fare resta il chiamante — questo strato non nasconde
     nulla e non ritenta niente da solo.
     ═══════════════════════════════════════════════════════════════════ */
  diskFull: false,

  _isQuotaError(err) {
    return err?.name === 'QuotaExceededError'
        || err?.inner?.name === 'QuotaExceededError'
        || /quota/i.test(err?.message || '');
  },

  async _guard(collection, op, fn) {
    try {
      const out = await fn();
      this.diskFull = false;
      return out;
    } catch (err) {
      if (this._isQuotaError(err)) {
        this.diskFull = true;
        const e = new Error(`Spazio di archiviazione esaurito: impossibile scrivere in "${collection}". Liberare spazio o esportare e ridurre l’archivio.`);
        e.code = 'DISK_FULL';
        e.cause = err;
        throw e;
      }
      const e = new Error(`Scrittura non riuscita su "${collection}" (${op}): ${err?.message || 'errore sconosciuto'}`);
      e.code = 'WRITE_FAILED';
      e.cause = err;
      throw e;
    }
  },

  /* -- Scritture singole -- */
  async add(collection, record) {
    return await this._guard(collection, 'add', () => this._table(collection).add(record));
  },

  async put(collection, record) {
    return await this._guard(collection, 'put', () => this._table(collection).put(record));
  },

  async update(collection, key, changes) {
    return await this._guard(collection, 'update', () => this._table(collection).update(key, changes));
  },

  async delete(collection, key) {
    return await this._guard(collection, 'delete', () => this._table(collection).delete(key));
  },

  /* -- Scritture in blocco -- */
  async bulkAdd(collection, records) {
    if (!records?.length) return 0;
    return await this._guard(collection, 'bulkAdd', () => this._table(collection).bulkAdd(records));
  },

  async bulkPut(collection, records) {
    if (!records?.length) return 0;
    return await this._guard(collection, 'bulkPut', () => this._table(collection).bulkPut(records));
  },

  /* -- Svuotamento -- */
  async clear(collection) {
    return await this._table(collection).clear();
  },

  /* Svuotamento di piu' collection. Esiste come metodo proprio perche'
     reset e import le azzerano tutte insieme dentro un'unica transazione:
     con un backend sara' una sola chiamata, non dodici. */
  async clearMany(collections) {
    await Promise.all(collections.map(c => this.clear(c)));
  },

  /* v2.8.0 — Lettura di un singolo record per chiave primaria. Serve ai
     valori di configurazione che non vivono nella cache perche' non sono
     dati di magazzino: l'handle della cartella di backup, i suoi timestamp. */
  async get(collection, key) {
    return await this._table(collection).get(key);
  },

  /* -- Query dichiarative -- */
  async count(collection, criteria = null) {
    return criteria
      ? await this._where(collection, criteria).count()
      : await this._table(collection).count();
  },

  /* v2.8.0 [H1] — Conteggio di TUTTE le collection in un colpo solo.
     Serve al checkpoint verificato: confrontare quanti record crede di avere
     la cache con quanti ne ha davvero il supporto costa due ordini di
     grandezza meno che riscriverli tutti, e dice qualcosa di piu' utile. */
  async countAll() {
    const out = {};
    await Promise.all(this.COLLECTIONS.map(async c => { out[c] = await this.count(c); }));
    return out;
  },

  /* v2.8.0 [H2] — Lettura per criterio con ordinamento e paginazione.
     `reverse` opera sull'indice, non su un array gia' materializzato: e' la
     differenza fra scorrere 2.000 record e caricarne un milione per poi
     buttarne via 998.000. */
  async query(collection, { criteria = null, limit = null, offset = 0, reverse = false } = {}) {
    let coll = criteria ? this._where(collection, criteria) : this._table(collection).toCollection();
    if (reverse) coll = coll.reverse();
    if (offset) coll = coll.offset(offset);
    if (limit !== null) coll = coll.limit(limit);
    return await coll.toArray();
  },

  /* Scorrimento a blocchi, senza mai tenere in memoria piu' di `chunkSize`
     record. E' cosi' che l'export attraversa sei anni di archivio su una
     macchina che non ha sei anni di archivio di RAM libera. */
  async eachChunk(collection, { criteria = null, chunkSize = 5000 } = {}, fn) {
    const total = criteria
      ? await this._where(collection, criteria).count()
      : await this._table(collection).count();
    for (let off = 0; off < total; off += chunkSize) {
      const base = criteria ? this._where(collection, criteria) : this._table(collection).toCollection();
      const rows = await base.offset(off).limit(chunkSize).toArray();
      if (!rows.length) break;
      await fn(rows, off, total);
    }
    return total;
  },

  async deleteWhere(collection, criteria) {
    return await this._where(collection, criteria).delete();
  },

  /* -- Transazione atomica --
     `collections` sono NOMI, non tabelle: il chiamante non deve conoscere
     l'oggetto Dexie. Il fallimento del corpo annulla tutto. */
  async transaction(collections, fn) {
    return await db.transaction('rw', this._tables(collections), fn);
  },

  /* ═══════════════════════════════════════════════════════════════════
     SPAZIO OCCUPATO E BACKUP LOCALE
     © Andrea Sacchetti — Dietopack S.r.l.

     Sono capacita' del SUPPORTO, non della logica applicativa: la quota
     disponibile e il file system privato dell'origine esistono nel
     browser e non esisteranno sul server, dove il backup sara' un compito
     del servizio (Fase 5). Vivono quindi qui, dietro
     supportsLocalBackup, e Store conserva soltanto la POLITICA: ogni
     quanto fare il backup, quante copie tenere, quando saltarlo.

     Il comportamento e' quello della v2.5.1, riga per riga. Nessuna
     modifica: solo un cambio di indirizzo.
     ═══════════════════════════════════════════════════════════════════ */

  async estimateUsage() {
    if (!navigator.storage?.estimate) return null;
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0, pct: est.quota ? (est.usage / est.quota * 100) : 0 };
    } catch { return null; }
  },

  BACKUP_DIR: 'backups',

  /* Verifica se OPFS e' supportato dal browser (Chromium/Firefox/Safari recenti). */
  isBackupSupported() {
    return typeof navigator !== 'undefined'
        && navigator.storage
        && typeof navigator.storage.getDirectory === 'function';
  },

  /* Apre/crea la directory backups dentro OPFS. */
  async _getBackupDir() {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(this.BACKUP_DIR, { create: true });
  },

  /* Scrive il contenuto gia' serializzato. Che cosa ci sia dentro il file
     non riguarda l'adapter: e' Store a decidere che cosa sia un backup. */
  async writeBackup(filename, contents) {
    if (!this.isBackupSupported()) throw new Error('OPFS non supportato dal browser');
    const dir = await this._getBackupDir();
    const handle = await dir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return { filename, size: contents.length };
  },

  async listBackups(prefix = 'wm-auto-') {
    if (!this.isBackupSupported()) return [];
    try {
      const dir = await this._getBackupDir();
      const list = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind !== 'file' || !name.startsWith(prefix)) continue;
        const file = await handle.getFile();
        list.push({ name, size: file.size, lastModified: file.lastModified });
      }
      list.sort((a, b) => b.lastModified - a.lastModified);
      return list;
    } catch (err) {
      console.warn('[WM] OPFS listBackups error:', err);
      return [];
    }
  },

  async deleteBackup(filename) {
    const dir = await this._getBackupDir();
    try { await dir.removeEntry(filename); return true; } catch { return false; }
  },

  async readBackup(filename) {
    if (!this.isBackupSupported()) throw new Error('OPFS non supportato');
    const dir = await this._getBackupDir();
    const handle = await dir.getFileHandle(filename);
    const file = await handle.getFile();
    return await file.text();
  }
};

export { LocalPersistence };
