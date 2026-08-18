import { Persistence } from '../core/persistence/index';
import { Store } from '../core/store';
import type { Istante, Movimento } from '../types/entita.js';
import { VERSIONE_APP } from '../core/pacchetto';

export type PermessoCartella = 'granted' | 'denied' | 'prompt';

declare global {
  interface FileSystemHandle {
    queryPermission(opzioni?: { mode?: 'read' | 'readwrite' }): Promise<PermessoCartella>;
    requestPermission(opzioni?: { mode?: 'read' | 'readwrite' }): Promise<PermessoCartella>;
  }
  interface Window {
    showDirectoryPicker?(opzioni?: { mode?: 'read' | 'readwrite', id?: string }): Promise<FileSystemDirectoryHandle>;
  }
}

/* Il ponte verso Store è caduto con la 1.4.0: `core/store.ts` è TypeScript.
   Vedi la nota in `pickRoute.ts` — stessa ragione, stesso momento. */

export interface PacchettoDati {
  mov_log?: Movimento[];
  _counts?: Record<string, number>;
  _kind?: string;
  _movFileMensili?: number;
  [collezione: string]: unknown;
}

/** Ciò che runBackup() consegna a chi lo ha chiesto. */
export interface EsitoBackup {
  ts: Istante;
  movimenti: number;
  mesiScritti: number;
  mesi: number;
  statoBytes: number;
}

const Vault = {
  HANDLE_KEY: 'vaultDirHandle',      // in meta (IndexedDB: i handle sono clonabili)
  LAST_KEY: 'vaultLastBackup',
  STATE_KEEP: 30,                    // fotografie giornaliere conservate
  INTERVAL_MS: 20 * 60 * 60 * 1000,  // ~1 volta al giorno
  MOV_SUBDIR: 'movimenti',

  _handle: null as FileSystemDirectoryHandle | null,
  _busy: false,

  supported(): boolean {
    return typeof window.showDirectoryPicker === 'function';
  },

  /* ── Handle della cartella ─────────────────────────────────────── */
  async loadHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (this._handle) return this._handle;
    try {
      const row = await Persistence.get<{ value?: FileSystemDirectoryHandle }>('meta', this.HANDLE_KEY);
      this._handle = row?.value || null;
    } catch { this._handle = null; }
    return this._handle;
  },

  async chooseFolder(): Promise<FileSystemDirectoryHandle> {
    if (!this.supported()) throw new Error('Il browser non consente di scegliere una cartella di destinazione.');
    const handle = await window.showDirectoryPicker!({ mode: 'readwrite', id: 'wm-vault' });
    /* Verifica subito di poterci scrivere: scoprirlo al primo backup
       notturno significherebbe scoprirlo quando non serve a niente. */
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Permesso di scrittura negato sulla cartella scelta.');
    this._handle = handle;
    await Persistence.put('meta', { key: this.HANDLE_KEY, value: handle });
    return handle;
  },

  async forgetFolder(): Promise<void> {
    this._handle = null;
    await Persistence.put('meta', { key: this.HANDLE_KEY, value: null });
  },

  /* 'granted' | 'prompt' | 'denied' | 'none' (nessuna cartella scelta) */
  async permissionState(): Promise<PermessoCartella | 'none'> {
    const h = await this.loadHandle();
    if (!h) return 'none';
    try { return await h.queryPermission({ mode: 'readwrite' }); }
    catch { return 'denied'; }
  },

  /* Richiede il permesso. Va invocata da un gesto dell'utente. */
  async requestPermission(): Promise<PermessoCartella | 'none'> {
    const h = await this.loadHandle();
    if (!h) return 'none';
    try { return await h.requestPermission({ mode: 'readwrite' }); }
    catch { return 'denied'; }
  },

  /* ── Scrittura ─────────────────────────────────────────────────── */
  async _writeFile(dirHandle: FileSystemDirectoryHandle, name: string, contents: string): Promise<void> {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { await w.write(contents); } finally { await w.close(); }
  },

  async _sha256(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  _monthKey(ts: Istante): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  async runBackup({ force = false, onProgress = null }: { force?: boolean, onProgress?: ((testo: string) => void) | null } = {}): Promise<EsitoBackup | null> {
    if (this._busy) throw new Error('Un backup è già in corso.');
    const dir = await this.loadHandle();
    if (!dir) throw new Error('Nessuna cartella di backup configurata.');
    const perm = await this.permissionState();
    if (perm !== 'granted') throw new Error('Permesso sulla cartella non attivo: riattivarlo dal pulsante in Configurazione → Dati.');
    if (!force && !(await this.isDue())) return null;

    this._busy = true;
    const say = (t: string) => { onProgress?.(t); };
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
      const perMese = new Map<string, Movimento[]>();
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

      const attesi: Record<string, number> = {};
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
        _appVersion: VERSIONE_APP,
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
  async _rotateStates(dir: FileSystemDirectoryHandle): Promise<number> {
    const nomi: string[] = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file' && /^wm-stato-\d{4}-\d{2}-\d{2}\.json$/.test(name)) nomi.push(name);
    }
    nomi.sort().reverse();
    for (const n of nomi.slice(this.STATE_KEEP)) {
      try { await dir.removeEntry(n); } catch (e) { console.warn('[WM] rotazione stato:', n, e); }
    }
    return Math.max(0, nomi.length - this.STATE_KEEP);
  },

  async lastBackupTs(): Promise<Istante | null> {
    try {
      const row = await Persistence.get<{ value?: Istante }>('meta', this.LAST_KEY);
      return row?.value || null;
    } catch { return null; }
  },

  async isDue(): Promise<boolean> {
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

  async buildRestorePackage({ statoFile = null, onProgress = null }: { statoFile?: string | null, onProgress?: ((testo: string) => void) | null } = {}): Promise<PacchettoDati> {
    const dir = await this.loadHandle();
    if (!dir) throw new Error('Nessuna cartella di backup configurata.');
    const say = (t: string) => onProgress?.(t);

    let nome: string | undefined | null = statoFile;
    if (!nome) {
      const manifest = await this.readManifest();
      nome = manifest?.stato_file;
    }
    if (!nome) {
      const nomi: string[] = [];
      for await (const [n, h] of dir.entries()) {
        if (h.kind === 'file' && /^wm-stato-\d{4}-\d{2}-\d{2}\.json$/.test(n)) nomi.push(n);
      }
      nomi.sort().reverse();
      nome = nomi[0];
    }
    if (!nome) throw new Error('Nella cartella non è stata trovata alcuna fotografia dello stato.');

    say(`Lettura di ${nome}…`);
    const fh = await dir.getFileHandle(nome);
    const data: PacchettoDati = JSON.parse(await (await fh.getFile()).text());

    say('Lettura dei movimenti…');
    const mov: Movimento[] = [];
    let fileMensili = 0;
    try {
      const movDir = await dir.getDirectoryHandle(this.MOV_SUBDIR);
      const files: string[] = [];
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

    if (fileMensili > 0) {
      data.mov_log = mov;
    } else {
      delete data.mov_log;
      say('Nessun file mensile trovato: il registro esistente NON verrà toccato.');
    }
    data._counts = Store._countsOf(data);
    if (fileMensili === 0) delete data._counts!.mov_log;
    data._movFileMensili = fileMensili;
    say(`Pacchetto pronto: ${mov.length.toLocaleString('it-IT')} movimenti da ${fileMensili} file mensili.`);
    return data;
  },

  async listStates(): Promise<{ name: string, size: number, modified: number }[]> {
    const dir = await this.loadHandle();
    if (!dir) return [];
    const out: { name: string, size: number, modified: number }[] = [];
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
