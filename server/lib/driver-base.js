'use strict';

/* IL SERVIZIO DATI, UNA VOLTA SOLA PER DUE DATABASE — 2.6.
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   QUI STA TUTTA LA LOGICA; i due driver — `driver-sqlite.js` e
   `driver-postgres.js` — portano solo i quattro gesti che un database sa
   fare: esegui, leggi righe, apri e chiudi una transazione. Ogni riga di
   comportamento scritta due volte sarebbe una riga che diverge, e la
   divergenza si scoprirebbe in magazzino.

   L'INTERFACCIA E' ASINCRONA, e non poteva essere altrimenti:
   `better-sqlite3` e' sincrono e `pg` no. Il costo si paga una volta —
   le rotte e le operazioni composte diventano `await` — e si guadagna che
   un solo corpo di codice serve tutti e due.

   LE TRANSAZIONI SI FANNO UNA PER VOLTA, E NON E' UNA SVISTA.
   Con `better-sqlite3` il database e' sincrono ma l'interfaccia no: un
   `await` dentro una transazione restituisce il controllo al ciclo degli
   eventi, e un'altra richiesta HTTP si infilerebbe DENTRO la transazione
   aperta — scrivendoci dentro, e uscendone con un COMMIT non suo. La coda
   qui sotto lo impedisce. Su PostgreSQL il pericolo e' un altro — una
   transazione vive su UNA connessione del pool, e due transazioni
   intrecciate se le scambierebbero — e la stessa coda lo chiude.

   Il prezzo e' un tetto: una transazione per volta. Oggi SQLite fa gia'
   cosi', e §6 dice che la concorrenza si risolve «con una transazione
   dentro `/api/op/…`, non con la disciplina di chi scrive»: il tetto e' il
   modo in cui quella regola resta vera anche in rete. Le LETTURE fuori
   transazione non passano dalla coda. */

const { AsyncLocalStorage } = require('node:async_hooks');
const { COLLECTIONS, NAMES, materialize, normalizza, MAIUSCOLE } = require('./schema');
const SQL = require('./sql');

class DriverBase {
  constructor(dialetto) {
    this.dialetto = dialetto;
    this._listeners = new Set();
    this._codaTx = Promise.resolve();
    /* UN FLAG NON BASTA A DIRE «SONO DENTRO UNA TRANSAZIONE».
       Con un booleano d'istanza, una SECONDA richiesta HTTP che arriva
       mentre la prima ha la transazione aperta lo trova alzato, crede di
       essere annidata, e il suo corpo gira DENTRO la transazione di un
       altro terminale: due terminali leggono lo stesso saldo e passano
       tutti e due. Su SQLite non si vedeva — gli `await` si risolvono in
       microtask e la prima transazione finisce prima che Express prenda la
       seconda richiesta — e su PostgreSQL, dove ogni `await` e' un giro di
       rete, si e' visto subito: `test/collaudo.js --pg`, 26/08.
       `AsyncLocalStorage` segue la CATENA asincrona: annidato e' solo chi
       discende davvero da quella chiamata. */
    this._contesto = new AsyncLocalStorage();
  }

  /** Il contesto della transazione a cui questa catena appartiene, o niente. */
  get _tx() { return this._contesto.getStore(); }

  /* ── I quattro gesti che ogni driver porta ─────────────────────────── */
  /* eslint-disable no-unused-vars */

  /** Esegue e dice quante righe ha toccato.
      @param {string} sql @param {any[]} args @returns {Promise<number>} */
  async _esegui(sql, args) { throw new Error('non implementato'); }

  /** Esegue e restituisce le righe. Una INSERT con RETURNING ne ha.
      @param {string} sql @param {any[]} args @returns {Promise<any[]>} */
  async _righe(sql, args) { throw new Error('non implementato'); }

  /** @returns {Promise<void>} */
  async _iniziaTx() { throw new Error('non implementato'); }
  /** @returns {Promise<void>} */
  async _confermaTx() { throw new Error('non implementato'); }
  /** @returns {Promise<void>} */
  async _annullaTx() { throw new Error('non implementato'); }
  /* eslint-enable no-unused-vars */

  /* ── Vocabolario ───────────────────────────────────────────────────── */

  _col(nome) {
    const c = COLLECTIONS[nome];
    if (!c) throw Object.assign(new Error(`Collezione sconosciuta: ${nome}`), { status: 400 });
    return c;
  }

  /* SE LA SCRITTURA MAIUSCOLA, LA LETTURA DEVE MAIUSCOLARE ANCHE LEI.
     Senza, un client rimasto indietro che chiede `cl260854` riceve «non
     c'e'» invece della riga, che adesso si chiama `CL260854`. */
  _chiave(nome, key) {
    const col = COLLECTIONS[nome];
    if (col.pkType !== 'text' || typeof key !== 'string') return key;
    return (MAIUSCOLE[nome] || []).includes(col.pk) ? key.toUpperCase() : key;
  }

  _criterio(nome, criteria) {
    if (!criteria || !(MAIUSCOLE[nome] || []).includes(criteria.field)) return criteria;
    const su = (v) => (typeof v === 'string' ? v.toUpperCase() : v);
    return { ...criteria, value: Array.isArray(criteria.value) ? criteria.value.map(su) : su(criteria.value) };
  }

  /* ── Revisione e notifica ──────────────────────────────────────────── */

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  async currentRevision() {
    const r = await this._righe('SELECT MAX(rev) AS r FROM _revision', []);
    return Number(r[0]?.r) || 0;
  }

  async _tocca(collezioni, origine) {
    const elenco = Array.isArray(collezioni) ? collezioni : [collezioni];
    const tx = this._tx;
    if (tx) { for (const c of elenco) tx.toccate.add(c); return; }
    return this._annuncia(elenco, origine);
  }

  async _annuncia(elenco, origine) {
    const ora = Date.now();
    const r = await this._righe(
      `INSERT INTO _revision(ts, collections, origin) VALUES(${SQL.segno(this.dialetto, 1)}, ${SQL.segno(this.dialetto, 2)}, ${SQL.segno(this.dialetto, 3)}) RETURNING rev`,
      [ora, JSON.stringify(elenco), origine || null]);
    const ev = { rev: Number(r[0]?.rev) || 0, collections: elenco, origin: origine || null, ts: ora };
    for (const fn of this._listeners) { try { fn(ev); } catch (e) { console.error('[pathfinder] listener:', e); } }
    return ev;
  }

  /* ── Scritture ─────────────────────────────────────────────────────── */

  async add(nome, record, origine) {
    const chiavi = await this._scrivi(nome, [record], { upsert: false });
    await this._tocca(nome, origine);
    return chiavi[0];
  }

  async put(nome, record, origine) {
    const col = this._col(nome);
    const doc = normalizza(nome, record);
    const chiave = doc[col.pk];
    if (chiave === undefined || chiave === null || chiave === '') return this.add(nome, record, origine);
    const chiavi = await this._scrivi(nome, [record], { upsert: true });
    await this._tocca(nome, origine);
    return chiavi[0];
  }

  async update(nome, chiave, modifiche, origine) {
    const corrente = await this.get(nome, chiave);
    if (!corrente) return 0;
    await this.put(nome, { ...corrente, ...modifiche }, origine);
    return 1;
  }

  /* UNA CHIAVE CHE NUMERO NON E' NON E' UNA RIGA, ED E' UNA DOMANDA VALIDA.
     `Number('non-un-numero')` fa `NaN`: SQLite lo ingoia e non trova niente,
     PostgreSQL rifiuta l'istruzione con «sintassi di input non valida per il
     tipo bigint». Due comportamenti diversi per la stessa domanda. La
     risposta giusta e' quella di SQLite — non c'e' — e si da' senza
     nemmeno chiedere al database. */
  _legame(nome, chiave) {
    const col = COLLECTIONS[nome];
    if (col.pkType !== 'auto') return String(this._chiave(nome, chiave));
    const n = Number(chiave);
    return Number.isFinite(n) ? n : null;
  }

  async delete(nome, chiave, origine) {
    this._col(nome);
    const bind = this._legame(nome, chiave);
    if (bind === null) return 0;
    const n = await this._esegui(SQL.sqlCancella(nome, this.dialetto).sql, [bind]);
    if (n) await this._tocca(nome, origine);
    return n;
  }

  async bulkAdd(nome, records, origine) {
    return this.transaction([nome], async () => {
      const chiavi = await this._scriviALotti(nome, records, { upsert: false });
      await this._tocca(nome, origine);
      return chiavi;
    }, origine);
  }

  async bulkPut(nome, records, origine) {
    return this.transaction([nome], async () => {
      const chiavi = await this._scriviALotti(nome, records, { upsert: true });
      await this._tocca(nome, origine);
      return chiavi;
    }, origine);
  }

  async clear(nome, origine) {
    this._col(nome);
    const n = await this._esegui(`DELETE FROM ${nome}`, []);
    await this._tocca(nome, origine);
    return n;
  }

  async clearMany(nomi, origine) {
    return this.transaction(nomi, async () => {
      for (const n of nomi) await this.clear(n, origine);
    }, origine);
  }

  async deleteWhere(nome, criteria, origine) {
    const c = SQL.sqlCancellaDove(nome, this._criterio(nome, criteria), this.dialetto);
    const n = await this._esegui(c.sql, c.args);
    if (n) await this._tocca(nome, origine);
    return n;
  }

  /* IL PUNTO 3 DELLA MIGRAZIONE.
     Fino alla 2.5 questo era un ciclo con dentro una INSERT: 43 microsecondi
     a riga su un file locale, e 11.197 giri di rete verso una regione Azure
     per la sola anagrafica articoli — misurati, quasi tre minuti. */
  async _scriviALotti(nome, records, opzioni) {
    if (!Array.isArray(records) || !records.length) return [];
    const fuori = [];
    for (const lotto of SQL.aLotti(nome, records, this.dialetto))
      fuori.push(...await this._scrivi(nome, lotto, opzioni));
    return fuori;
  }

  /* UN LOTTO PUO' PORTARE RIGHE NUOVE E RIGHE CHE ESISTONO GIA'.
     Su una collezione a chiave automatica le due cose si scrivono con due
     istruzioni diverse: la riga nuova lascia assegnare la chiave alla
     sequenza, quella che c'e' gia' la porta scritta o l'`ON CONFLICT` non
     ha su cosa scattare. Si separano, si scrivono, e le chiavi tornano
     nell'ordine in cui erano arrivate — chi chiama `bulkPut` le legge per
     posizione. */
  async _scrivi(nome, records, { upsert }) {
    const col = this._col(nome);
    const docs = records.map(r => normalizza(nome, r));

    if (col.pkType === 'text') {
      for (const d of docs) {
        const chiave = d[col.pk];
        if (chiave === undefined || chiave === null || chiave === '')
          throw Object.assign(new Error(`${nome}: chiave ${col.pk} mancante`), { status: 400 });
      }
      return this._scriviGruppo(nome, docs, { upsert, conChiave: true });
    }

    const haChiave = (d) => d[col.pk] !== undefined && d[col.pk] !== null && d[col.pk] !== '';
    if (docs.every(d => !haChiave(d)))
      return this._scriviGruppo(nome, docs, { upsert: false, conChiave: false });
    if (docs.every(haChiave))
      return this._scriviGruppo(nome, docs, { upsert, conChiave: true });

    const fuori = new Array(docs.length);
    const nuove = [], nuoveDove = [], vecchie = [], vecchieDove = [];
    docs.forEach((d, i) => {
      if (haChiave(d)) { vecchie.push(d); vecchieDove.push(i); }
      else { nuove.push(d); nuoveDove.push(i); }
    });
    if (nuove.length) {
      const k = await this._scriviGruppo(nome, nuove, { upsert: false, conChiave: false });
      k.forEach((v, i) => { fuori[nuoveDove[i]] = v; });
    }
    if (vecchie.length) {
      const k = await this._scriviGruppo(nome, vecchie, { upsert, conChiave: true });
      k.forEach((v, i) => { fuori[vecchieDove[i]] = v; });
    }
    return fuori;
  }

  async _scriviGruppo(nome, docs, opzioni) {
    if (!docs.length) return [];
    const col = COLLECTIONS[nome];
    const { sql, args } = SQL.sqlInserisci(nome, docs, this.dialetto, opzioni);
    const righe = await this._righe(sql, args);
    return righe.map(r => r[col.pk]);
  }

  /* ── Letture ───────────────────────────────────────────────────────── */

  async get(nome, chiave) {
    this._col(nome);
    const bind = this._legame(nome, chiave);
    if (bind === null) return null;
    const righe = await this._righe(SQL.sqlLeggi(nome, this.dialetto).sql, [bind]);
    return SQL.idrata(nome, righe[0] || null);
  }

  async all(nome) {
    this._col(nome);
    const righe = await this._righe(`SELECT * FROM ${nome}`, []);
    return righe.map(r => SQL.idrata(nome, r));
  }

  async query(nome, opzioni = {}) {
    this._col(nome);
    const o = { ...opzioni, criteria: this._criterio(nome, opzioni.criteria || null) };
    const { sql, args } = SQL.sqlSeleziona(nome, o, this.dialetto);
    const righe = await this._righe(sql, args);
    return righe.map(r => SQL.idrata(nome, r));
  }

  async count(nome, criteria = null) {
    this._col(nome);
    const { sql, args } = SQL.sqlConta(nome, this._criterio(nome, criteria), this.dialetto);
    const righe = await this._righe(sql, args);
    return Number(righe[0]?.c) || 0;
  }

  /* Venti COUNT sono venti giri di rete, e uno basta. */
  async countAll() {
    const { sql } = SQL.sqlContaTutte(NAMES, this.dialetto);
    const righe = await this._righe(sql, []);
    const out = {};
    for (const n of NAMES) out[n] = 0;
    for (const r of righe) out[r.collezione] = Number(r.c) || 0;
    return out;
  }

  /* ── Transazioni ───────────────────────────────────────────────────── */

  async transaction(collezioni, fn, origine) {
    /* Gia' dentro QUESTA transazione — cioe' discendente della chiamata che
       l'ha aperta: si prosegue in quella, senza aprirne una annidata. Le
       collezioni toccate si sommano. */
    const dentro = this._tx;
    if (dentro) { for (const c of collezioni) dentro.toccate.add(c); return fn(); }

    const mio = this._codaTx.then(async () => {
      const contesto = { toccate: new Set(collezioni) };
      await this._iniziaTx();
      let out;
      try {
        out = await this._contesto.run(contesto, fn);
        await this._confermaTx();
      } catch (err) {
        await this._annullaTx().catch(() => {});
        throw err;
      }
      const toccate = [...contesto.toccate];
      if (toccate.length) await this._annuncia(toccate, origine);
      return out;
    });
    /* La coda non deve morire con la transazione che fallisce, o da li' in
       poi ogni scrittura resterebbe appesa a una promessa gia' rifiutata. */
    this._codaTx = mio.then(() => undefined, () => undefined);
    return mio;
  }

  /* ── Caricamento iniziale ──────────────────────────────────────────── */

  async loadAll({ movLogFrom = null } = {}) {
    const out = {};
    for (const n of NAMES) {
      if (n === 'mov_log') continue;
      out[n] = await this.all(n);
    }
    out.mov_log = movLogFrom == null
      ? await this.query('mov_log', { reverse: true, orderBy: 'ts' })
      : await this.query('mov_log', { criteria: { field: 'ts', op: 'aboveOrEqual', value: movLogFrom }, reverse: true, orderBy: 'ts' });
    out._movLogTotal = await this.count('mov_log');
    out._revision = await this.currentRevision();
    return out;
  }

  /* Le colonne materializzate di un record, per chi le vuole senza scrivere. */
  materializza(nome, record) { return materialize(nome, normalizza(nome, record)); }
}

module.exports = { DriverBase };
