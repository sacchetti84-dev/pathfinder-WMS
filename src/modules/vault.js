import { Persistence } from '../core/persistence/index';
import { Store } from '../core/store.js';

// ═══════════════════════════════════════════════════════════════════
// © Andrea Sacchetti — Dietopack S.r.l.
// modulo Vault — Pathfinder Warehouse Mapper v2.8.0 [H4]
//
// COPIA ESTERNA DEI DATI.
//
// Il problema che risolve e' il piu' semplice e il piu' grave di tutti:
// fino alla v2.7.0 esisteva UNA sola copia dei dati, su UNA sola macchina.
// I backup automatici OPFS stanno nello stesso profilo browser di IndexedDB
// e se ne vanno con lo stesso clic; un guasto al disco li porta via insieme.
// Per una tracciabilita' che deve reggere sei anni non e' abbastanza.
//
// Qui l'operatore sceglie UNA VOLTA una cartella — tipicamente dentro
// OneDrive, quindi replicata fuori dall'edificio — e da quel momento
// l'applicativo ci scrive da solo.
//
// PERCHE' NON UN UNICO FILE. A 500 movimenti al giorno l'export completo
// arriva a ~370 MB al sesto anno. Riscriverlo ogni giorno significherebbe
// far transitare centinaia di MB su una cartella sincronizzata, ogni giorno,
// per riscrivere in massima parte dati identici a quelli del giorno prima.
// Il formato e' quindi incrementale, e sfrutta l'unica proprieta' davvero
// utile del registro: un movimento passato NON CAMBIA PIU'.
//
//   wm-stato-AAAA-MM-GG.json        fotografia del presente (giacenze,
//                                   anagrafiche, ubicazioni, quarantene,
//                                   DDT, operatori). Pochi MB. Se ne
//                                   conservano 30.
//   movimenti/wm-mov-AAAA-MM.jsonl  un file per mese, una riga JSON per
//                                   movimento. Viene riscritto SOLO il mese
//                                   in corso: i mesi chiusi si scrivono una
//                                   volta e non si toccano mai piu'.
//   wm-manifest.json                conteggi, intervallo di date coperto e
//                                   impronta SHA-256 dell'ultimo stato.
//                                   Serve ad accorgersi che un backup e'
//                                   incompleto PRIMA di averne bisogno.
//
// Sei anni occupano ~320 MB distribuiti su 72 file mensili, e nessuna
// singola scrittura supera i pochi MB.
//
// JSONL e non JSON per i movimenti: una riga per record si appende, si
// legge a pezzi e sopravvive a un troncamento — se l'ultima riga e' rotta si
// perde quella, non l'intero mese.
//
// NOTA SUI PERMESSI. Il permesso sulla cartella non sopravvive alla chiusura
// del browser: al riavvio Chrome lo rimette in stato "prompt" e serve un
// gesto dell'utente per riattivarlo. Non e' aggirabile ed e' giusto che sia
// cosi'. L'applicativo se ne accorge e lo chiede con un pulsante, invece di
// fallire in silenzio.
// ═══════════════════════════════════════════════════════════════════


const Vault = {
  HANDLE_KEY: 'vaultDirHandle',      // in meta (IndexedDB: i handle sono clonabili)
  LAST_KEY: 'vaultLastBackup',
  STATE_KEEP: 30,                    // fotografie giornaliere conservate
  INTERVAL_MS: 20 * 60 * 60 * 1000,  // ~1 volta al giorno
  MOV_SUBDIR: 'movimenti',

  _handle: null,
  _busy: false,

  supported() {
    return typeof window.showDirectoryPicker === 'function';
  },

  /* ── Handle della cartella ─────────────────────────────────────── */
  async loadHandle() {
    if (this._handle) return this._handle;
    try {
      const row = await Persistence.get('meta', this.HANDLE_KEY);
      this._handle = row?.value || null;
    } catch { this._handle = null; }
    return this._handle;
  },

  async chooseFolder() {
    if (!this.supported()) throw new Error('Il browser non consente di scegliere una cartella di destinazione.');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'wm-vault' });
    /* Verifica subito di poterci scrivere: scoprirlo al primo backup
       notturno significherebbe scoprirlo quando non serve a niente. */
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Permesso di scrittura negato sulla cartella scelta.');
    this._handle = handle;
    await Persistence.put('meta', { key: this.HANDLE_KEY, value: handle });
    return handle;
  },

  async forgetFolder() {
    this._handle = null;
    await Persistence.put('meta', { key: this.HANDLE_KEY, value: null });
  },

  /* 'granted' | 'prompt' | 'denied' | 'none' (nessuna cartella scelta) */
  async permissionState() {
    const h = await this.loadHandle();
    if (!h) return 'none';
    try { return await h.queryPermission({ mode: 'readwrite' }); }
    catch { return 'denied'; }
  },

  /* Richiede il permesso. Va invocata da un gesto dell'utente. */
  async requestPermission() {
    const h = await this.loadHandle();
    if (!h) return 'none';
    try { return await h.requestPermission({ mode: 'readwrite' }); }
    catch { return 'denied'; }
  },

  /* ── Scrittura ─────────────────────────────────────────────────── */
  async _writeFile(dirHandle, name, contents) {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { await w.write(contents); } finally { await w.close(); }
  },

  async _sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  _monthKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  /* Esegue il backup completo secondo la politica descritta in testa.
     `onProgress(testo)` serve a non lasciare l'operatore davanti a una
     finestra ferma mentre si scrivono decine di MB. */
  async runBackup({ force = false, onProgress = null } = {}) {
    if (this._busy) throw new Error('Un backup è già in corso.');
    const dir = await this.loadHandle();
    if (!dir) throw new Error('Nessuna cartella di backup configurata.');
    const perm = await this.permissionState();
    if (perm !== 'granted') throw new Error('Permesso sulla cartella non attivo: riattivarlo dal pulsante in Configurazione → Dati.');
    if (!force && !(await this.isDue())) return null;

    this._busy = true;
    const say = (t) => { onProgress?.(t); };
    try {
      const oggi = new Date().toISOString().slice(0, 10);

      // ── 1. Fotografia del presente, senza il registro ──
      say('Preparazione della fotografia dello stato…');
      const stato = await Store.exportAll({ includeMovLog: false });
      stato._kind = 'stato';
      const statoJson = JSON.stringify(stato);
      await this._writeFile(dir, `wm-stato-${oggi}.json`, statoJson);

      // ── 2. Movimenti, un file per mese ──
      say('Lettura del registro movimenti…');
      const movDir = await dir.getDirectoryHandle(this.MOV_SUBDIR, { create: true });
      const perMese = new Map();
      let totMov = 0;
      await Store.eachMovement(rows => {
        for (const m of rows) {
          const k = this._monthKey(m.ts);
          let arr = perMese.get(k);
          if (!arr) { arr = []; perMese.set(k, arr); }
          arr.push(m);
          totMov++;
        }
        say(`Lettura del registro movimenti… ${totMov.toLocaleString('it-IT')}`);
      });

      /* Si riscrivono solo i mesi che non risultano gia' presenti con lo
         stesso numero di righe. I mesi chiusi vengono cosi' scritti una
         volta sola nella vita del backup, e OneDrive non si vede passare
         sotto lo stesso identico file ogni notte. */
      const attesi = {};
      let scritti = 0;
      for (const [mese, righe] of [...perMese.entries()].sort()) {
        attesi[mese] = righe.length;
        const nome = `wm-mov-${mese}.jsonl`;
        let esistenti = -1;
        try {
          const fh = await movDir.getFileHandle(nome);
          const testo = await (await fh.getFile()).text();
          esistenti = testo ? testo.trimEnd().split('\n').length : 0;
        } catch { /* non esiste ancora */ }
        if (esistenti === righe.length) continue;
        righe.sort((a, b) => a.ts - b.ts);
        say(`Scrittura di ${nome} (${righe.length.toLocaleString('it-IT')} movimenti)…`);
        await this._writeFile(movDir, nome, righe.map(r => JSON.stringify(r)).join('\n') + '\n');
        scritti++;
      }

      // ── 3. Manifest di verifica ──
      say('Scrittura del manifest…');
      const manifest = {
        _format: 'warehouse-mapper-vault-1',
        _app: 'Pathfinder Warehouse Mapper',
        _appVersion: '1.1.0',
        aggiornato: new Date().toISOString(),
        stato_file: `wm-stato-${oggi}.json`,
        stato_sha256: await this._sha256(statoJson),
        stato_counts: stato._counts,
        movimenti_totali: totMov,
        movimenti_per_mese: attesi,
        mesi: Object.keys(attesi).length
      };
      await this._writeFile(dir, 'wm-manifest.json', JSON.stringify(manifest, null, 2));

      // ── 4. Rotazione delle fotografie ──
      await this._rotateStates(dir);

      const now = Date.now();
      await Persistence.put('meta', { key: this.LAST_KEY, value: now });
      Store._applyToCache('meta', 'put', { key: this.LAST_KEY, value: now });
      return { ts: now, movimenti: totMov, mesiScritti: scritti, mesi: Object.keys(attesi).length, statoBytes: statoJson.length };
    } finally {
      this._busy = false;
    }
  },

  /* Le fotografie sono ridondanti fra loro: ne bastano trenta per poter
     tornare indietro di un mese. I file dei movimenti non si toccano MAI. */
  async _rotateStates(dir) {
    const nomi = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file' && /^wm-stato-\d{4}-\d{2}-\d{2}\.json$/.test(name)) nomi.push(name);
    }
    nomi.sort().reverse();
    for (const n of nomi.slice(this.STATE_KEEP)) {
      try { await dir.removeEntry(n); } catch (e) { console.warn('[WM] rotazione stato:', n, e); }
    }
    return Math.max(0, nomi.length - this.STATE_KEEP);
  },

  async lastBackupTs() {
    try {
      const row = await Persistence.get('meta', this.LAST_KEY);
      return row?.value || null;
    } catch { return null; }
  },

  async isDue() {
    const last = await this.lastBackupTs();
    return !last || (Date.now() - last) >= this.INTERVAL_MS;
  },

  /* ── Lettura, per il ripristino ─────────────────────────────────── */
  async readManifest() {
    const dir = await this.loadHandle();
    if (!dir) return null;
    try {
      const fh = await dir.getFileHandle('wm-manifest.json');
      return JSON.parse(await (await fh.getFile()).text());
    } catch { return null; }
  },

  /* Ricompone un pacchetto di import completo dalla cartella: fotografia
     piu' scelta dei mesi. E' l'operazione inversa di runBackup, e l'unica
     ragione per cui il backup ha senso di esistere. */
  async buildRestorePackage({ statoFile = null, onProgress = null } = {}) {
    const dir = await this.loadHandle();
    if (!dir) throw new Error('Nessuna cartella di backup configurata.');
    const say = (t) => onProgress?.(t);

    let nome = statoFile;
    if (!nome) {
      const manifest = await this.readManifest();
      nome = manifest?.stato_file;
    }
    if (!nome) {
      const nomi = [];
      for await (const [n, h] of dir.entries()) {
        if (h.kind === 'file' && /^wm-stato-\d{4}-\d{2}-\d{2}\.json$/.test(n)) nomi.push(n);
      }
      nomi.sort().reverse();
      nome = nomi[0];
    }
    if (!nome) throw new Error('Nella cartella non è stata trovata alcuna fotografia dello stato.');

    say(`Lettura di ${nome}…`);
    const fh = await dir.getFileHandle(nome);
    const data = JSON.parse(await (await fh.getFile()).text());

    say('Lettura dei movimenti…');
    const mov = [];
    let fileMensili = 0;
    try {
      const movDir = await dir.getDirectoryHandle(this.MOV_SUBDIR);
      const files = [];
      for await (const [n, h] of movDir.entries()) {
        if (h.kind === 'file' && /^wm-mov-\d{4}-\d{2}\.jsonl$/.test(n)) files.push(n);
      }
      files.sort();
      fileMensili = files.length;
      for (const f of files) {
        say(`Lettura di ${f}…`);
        const testo = await (await (await movDir.getFileHandle(f)).getFile()).text();
        for (const riga of testo.split('\n')) {
          const t = riga.trim();
          if (!t) continue;
          try { mov.push(JSON.parse(t)); }
          catch { /* riga troncata: si perde quella, non il mese */ }
        }
      }
    } catch { /* sottocartella assente */ }

    /* Se non e' stato trovato NEMMENO UN file mensile, il registro non viene
       messo nel pacchetto: l'assenza dei file e' molto piu' probabilmente una
       cartella incompleta che un magazzino senza storia, e nel dubbio non si
       cancellano sei anni di movimenti. Con la chiave omessa, importAll lascia
       il registro dov'e'. */
    if (fileMensili > 0) {
      data.mov_log = mov;
    } else {
      delete data.mov_log;
      say('Nessun file mensile trovato: il registro esistente NON verrà toccato.');
    }
    data._counts = Store._countsOf(data);
    if (fileMensili === 0) delete data._counts.mov_log;
    data._movFileMensili = fileMensili;
    say(`Pacchetto pronto: ${mov.length.toLocaleString('it-IT')} movimenti da ${fileMensili} file mensili.`);
    return data;
  },

  async listStates() {
    const dir = await this.loadHandle();
    if (!dir) return [];
    const out = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file' && /^wm-stato-\d{4}-\d{2}-\d{2}\.json$/.test(name)) {
        const f = await h.getFile();
        out.push({ name, size: f.size, modified: f.lastModified });
      }
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }
};

export { Vault };
