import { type Vista, $ } from './vista';
import { caricaExcel } from '../../modules/excel';
import { LOG_RETENTION_DAYS, LOG_RETENTION_MS, MOV, MOV_LABELS } from '../../core/costanti';
import { Persistence } from '../../core/persistence/index';
import { Store } from '../../core/store';
import { Validate } from '../../modules/validate';
import { Vault } from '../../modules/vault';
import { valoriAmmessi as valoriAmmessiUM } from '../../modules/misure';
import {
  CERTIFICAZIONI, CLASSI_TEMPERATURA, leggiAllergeni, leggiCodici, scriviAllergeni,
  leggiCertificazioni, scriviCertificazioni, leggiClasseTemperatura, fogliValoriAmmessi,
} from '../../modules/anagrafica';
import { Dialog } from '../dialog.js';
import { Feedback } from '../feedback.js';

export const VistaConfigDati: Vista = {
  _fmtUsage(est) {
    if (!est) return 'Non disponibile';
    const mb = (b: any) => ((b || 0) / 1048576).toFixed(1);
    if (est.pct == null || !est.quota) {
      /* Servizio dati: c'e' un file su un disco, non una quota del browser.
         Si dice quanto pesa e dove sta, che e' l'informazione utile. */
      return `${mb(est.usage)} MB${est.file ? ` <span class="opacity-70">— ${this._esc(est.file)}</span>` : ''}`;
    }
    return `${mb(est.usage)} MB su ${(est.quota / 1048576).toFixed(0)} MB (${est.pct.toFixed(1)}%)`;
  },

  /* Il motore vero, non quello di quando ce n'era uno solo. */
  _storageLabel() {
    return Persistence.kind === 'remote'
      ? '<span class="badge badge-green">SQLite — servizio dati</span>'
      : '<span class="badge badge-blue">IndexedDB (Dexie)</span>';
  },

  async _renderConfigData(el) {
    const meta = Store.getMeta();
    const invCount = Store.getInventoryCount();
    const est: any = await Store.estimateUsage();
    const usageStr = this._fmtUsage(est);
    const spazioLbl = Persistence.kind === 'remote' ? 'Spazio occupato dal database' : 'Spazio IndexedDB utilizzato';
    el.innerHTML = `<div id="resilienzaCard"></div>
    <div class="config-card">
      <h3>Stato Database</h3>
      <table class="sx-table mb-7.5">
        <tbody>
          <tr><td class="w-[40%] text-sx-text-secondary">Ultimo salvataggio</td><td class="mono">${meta.lastModified ? new Date(meta.lastModified).toLocaleString('it-IT') : 'Mai'}</td></tr>
          <tr><td class="text-sx-text-secondary">Modifiche non salvate</td><td>${meta.unsavedChanges ? '<span class="badge badge-amber">Sì</span>' : '<span class="badge badge-green">No</span>'}</td></tr>
          <tr><td class="text-sx-text-secondary">Item a magazzino</td><td class="mono">${invCount}</td></tr>
          <tr><td class="text-sx-text-secondary">Articoli in anagrafica</td><td class="mono">${Store.getArticles().length}</td></tr>
          <tr><td class="text-sx-text-secondary">Movimenti in archivio</td><td class="mono">${Store.getMovLogTotal().toLocaleString('it-IT')} <span class="badge badge-green">conservazione ${Math.round(LOG_RETENTION_DAYS/365)} anni</span></td></tr>
          <tr><td class="text-sx-text-secondary">di cui in memoria</td><td class="mono">${Store.getMovLogWindowInfo().inMemory.toLocaleString('it-IT')} <span class="badge badge-muted">finestra ${Store.getMovLogWindowDays() || '∞'} gg</span></td></tr>
          <tr><td class="text-sx-text-secondary">Quarantene attive</td><td class="mono">${Store.getActiveQuarantine().length}</td></tr>
          <tr><td class="text-sx-text-secondary">${spazioLbl}</td><td class="mono">${usageStr}</td></tr>
          <tr><td class="text-sx-text-secondary">Motore storage</td><td>${this._storageLabel()}</td></tr>
        </tbody>
      </table>
      <div class="flex gap-4 flex-wrap">
        <button class="btn btn-success" onclick="App.forceSave()" title="Forza checkpoint dati su IndexedDB">💾 Salva ora</button>
        <button class="btn btn-primary" onclick="App.exportData()">📤 Esporta tutto (JSON)</button>
        <button class="btn btn-accent" onclick="App.importData()">📥 Importa da JSON</button>
        <button class="btn btn-warning" onclick="App.exportMovLogExcel()">📊 Esporta Registro Movimenti (Excel)</button>
        <button class="btn btn-warning" onclick="App.exportGiacenzeExcel()" title="Esporta tutte le giacenze raggruppate per Site/Zona/Ubicazione">📦 Esporta Giacenze per Area (Excel)</button>
        <button class="btn btn-danger ml-auto" onclick="App.confirmResetData()">🗑 Reset completo DB</button>
      </div>
      <!-- v2.0.1 [B8] — Ritenzione e purge manuale (decisione B-2) -->
      <div class="bg-[var(--grad-soft-green)] border border-sx-success rounded-[var(--radius-md)] py-6 px-7.5 mt-6">
        <div class="font-bold text-body-small text-sx-success mb-3">🔒 Conservazione dei record</div>
        <p class="text-body-small text-sx-text-secondary leading-[1.5] mb-5">
          <strong>Nessun record viene mai cancellato automaticamente.</strong>
          Il registro movimenti è conservato per <strong>${LOG_RETENTION_DAYS} giorni (${Math.round(LOG_RETENTION_DAYS/365)} anni)</strong>;
          i record di <strong>non conformità non sono mai eliminabili</strong>, nemmeno con la purge manuale.
          L'eliminazione dei movimenti oltre la soglia è possibile solo con l'azione qui sotto, che impone
          l'esportazione preventiva, una doppia conferma e la registrazione dell'operazione nel registro stesso.
        </p>
        <button class="btn btn-sm btn-warning" onclick="App.purgeOldLogsManual()" title="Purge manuale del registro movimenti oltre la soglia di conservazione">
          🗄 Purge manuale registro storico…
        </button>
      </div>
    </div>
    <!-- v1.9.1 — Card impostazioni scanner barcode -->
    <div class="config-card mt-7.5">
      <h3>Scanner Barcode</h3>
      <div class="flex items-start gap-7.5 py-5 px-0">
        <label class="switch mt-1.5">
          <input type="checkbox" id="scannerFixToggle" ${this._scannerLayoutFix ? 'checked' : ''} onchange="App._setScannerLayoutFix(this.checked)">
          <span class="slider"></span>
        </label>
        <div class="flex-1">
          <div class="font-semibold text-body-medium text-sx-text">Correzione layout scanner US→IT</div>
          <div class="text-body-small text-sx-text-muted mt-2 leading-[1.5]">
            Attiva questa opzione se lo scanner barcode legge <strong>"/"</strong> come <strong>"-"</strong> (o caratteri simili).
            Lo scanner di fabbrica è in modalità tastiera US: su sistemi Windows con layout IT alcuni tasti producono caratteri sbagliati.
            Il fix usa il codice del tasto fisico (indipendente dal layout) per ricostruire il carattere originale del barcode.
            <br><strong>Disattiva</strong> solo se lo scanner è già stato programmato per il layout italiano.
          </div>
          <div class="text-label-small text-sx-text-muted mt-4">
            Caratteri corretti: <code class="bg-sx-bg-alt py-0 px-3 rounded-[2px]">/</code> · <code class="bg-sx-bg-alt py-0 px-3 rounded-[2px]">-</code> · <code class="bg-sx-bg-alt py-0 px-3 rounded-[2px]">'</code> · <code class="bg-sx-bg-alt py-0 px-3 rounded-[2px]">\\</code> · <code class="bg-sx-bg-alt py-0 px-3 rounded-[2px]">=</code>
          </div>
        </div>
      </div>
    </div>
    <!-- v2.1.0 — Card preferenze di riscontro operativo -->
    <div class="config-card mt-7.5">
      <h3>Riscontro Operativo (suono · vibrazione · messaggi)</h3>
      <p class="text-body-small text-sx-text-secondary leading-[1.55] mb-6">
        Dalla v2.1.0 l'esito di ogni operazione compare al <strong>centro dello schermo</strong>, non piu' nell'angolo,
        ed e' accompagnato da una firma sonora diversa per esito positivo, avviso ed errore.
        In reparto rumoroso alzare il volume; in ufficio disattivare l'audio.
        Le preferenze restano su questo dispositivo e non contengono alcun dato personale.
      </p>
      <div class="flex items-center gap-7.5 py-4.5 px-0">
        <label class="switch">
          <input type="checkbox" id="fbAudioToggle" ${Feedback.getPrefs().audio ? 'checked' : ''} onchange="App._setFeedbackPref('audio', this.checked)">
          <span class="slider"></span>
        </label>
        <div class="flex-1">
          <div class="font-bold text-body-medium">Segnale acustico</div>
          <div class="text-body-small text-sx-text-muted">Toni sintetizzati: nessun file, funziona offline.</div>
        </div>
        <button class="btn btn-sm" onclick="App._testFeedback()">Prova</button>
      </div>
      <div class="flex items-center gap-7.5 py-4.5 px-0 border-t border-t-sx-border">
        <label class="switch">
          <input type="checkbox" id="fbVibToggle" ${Feedback.getPrefs().vibration ? 'checked' : ''} onchange="App._setFeedbackPref('vibration', this.checked)">
          <span class="slider"></span>
        </label>
        <div class="flex-1">
          <div class="font-bold text-body-medium">Vibrazione</div>
          <div class="text-body-small text-sx-text-muted">Solo su tablet e telefoni che la supportano. Su PC non ha effetto.</div>
        </div>
      </div>
      <div class="flex items-center gap-7.5 py-4.5 px-0 border-t border-t-sx-border">
        <label class="switch">
          <input type="checkbox" id="fbFlashToggle" ${Feedback.getPrefs().flash ? 'checked' : ''} onchange="App._setFeedbackPref('flash', this.checked)">
          <span class="slider"></span>
        </label>
        <div class="flex-1">
          <div class="font-bold text-body-medium">Lampo perimetrale</div>
          <div class="text-body-small text-sx-text-muted">Bordo colorato per mezzo secondo. Escluso da solo se il sistema chiede animazioni ridotte.</div>
        </div>
      </div>
      <div class="flex items-center gap-7.5 pt-6 px-0 pb-2 border-t border-t-sx-border">
        <label class="font-bold text-body-medium min-w-[110px]" for="fbVolume">Volume</label>
        <input class="flex-1" type="range" id="fbVolume" min="0" max="100" step="5" value="${Math.round(Feedback.getPrefs().volume * 100)}" oninput="App._setFeedbackPref('volume', this.value / 100)">
        <span id="fbVolumeLabel" class="dlg-chip">${Math.round(Feedback.getPrefs().volume * 100)}%</span>
      </div>
    </div>`;
    this._renderResilienzaCard();
  },

  async _renderResilienzaCard() {
    const host = $('resilienzaCard');
    if (!host) return;

    const remoto = Persistence.kind === 'remote';
    const persist = await Store.storagePersistenceState();
    const est: any = await Store.estimateUsage();
    const vaultPerm = Vault.supported() ? await Vault.permissionState() : 'unsupported';
    const vaultLast = await Vault.lastBackupTs();
    const manifest = vaultPerm === 'granted' ? await Vault.readManifest() : null;
    const opfsList = await Store.listOPFSBackups();
    const win = Store.getMovLogWindowInfo();
    const fmt = (ts: any) => ts ? new Date(ts).toLocaleString('it-IT') : 'mai';

    const copiaEsternaFresca = vaultLast && (Date.now() - vaultLast) < 48 * 3600 * 1000;
    const livello = copiaEsternaFresca ? 'ok' : (vaultPerm === 'granted' ? 'warn' : 'bad');
    const bordo = livello === 'ok' ? 'var(--sx-success)' : livello === 'warn' ? 'var(--sx-warning)' : 'var(--sx-danger)';
    const titolo = livello === 'ok'
      ? '🛡 Copia esterna attiva e aggiornata'
      : livello === 'warn'
        ? '⚠ Copia esterna configurata ma non aggiornata'
        : '⛔ Nessuna copia fuori da questa macchina';

    const vaultRiga = () => {
      if (vaultPerm === 'unsupported') {
        return `<div class="text-sx-danger">Questo browser non consente di scegliere una cartella di destinazione.
          Usare Chrome o Edge, oppure esportare a mano il JSON e archiviarlo su OneDrive.</div>`;
      }
      if (vaultPerm === 'none') {
        return `<div class="mb-4">Nessuna cartella configurata. Sceglierne una <strong>dentro OneDrive</strong>:
          da quel momento l'applicativo ci scriverà da solo una volta al giorno.</div>
          <button class="btn btn-sm btn-primary" onclick="App.vaultChooseFolder()">📁 Scegli la cartella di backup…</button>`;
      }
      if (vaultPerm !== 'granted') {
        return `<div class="mb-4 text-sx-warning">
          Cartella configurata, ma il permesso di scrittura non è attivo in questa sessione.
          Il browser lo azzera a ogni riavvio e serve un clic per riattivarlo: è una sua regola, non un difetto.</div>
          <button class="btn btn-sm btn-warning" onclick="App.vaultReauthorize()">🔓 Riattiva il permesso</button>`;
      }
      return `<div class="mb-5">
          Ultimo backup: <strong>${fmt(vaultLast)}</strong>
          ${manifest ? ` · ${Number(manifest.movimenti_totali || 0).toLocaleString('it-IT')} movimenti su ${manifest.mesi || 0} file mensili` : ''}
        </div>
        <div class="flex gap-4 flex-wrap">
          <button class="btn btn-sm btn-success" onclick="App.vaultBackupNow()">💾 Esegui backup adesso</button>
          <button class="btn btn-sm btn-accent" onclick="App.vaultRestore()">♻ Ripristina da questa cartella…</button>
          <button class="btn btn-sm" onclick="App.vaultChooseFolder()">📁 Cambia cartella</button>
        </div>`;
    };

    host.innerHTML = `<div class="config-card" style="border-left:4px solid ${bordo};margin-bottom:0.75rem">
      <h3 style="color:${bordo}">${titolo}</h3>

      <div class="py-5 px-0 border-b border-b-sx-border">
        <div class="font-bold text-body-medium mb-2.5">📁 Copia esterna automatica (OneDrive)</div>
        <div class="text-body-small text-sx-text-secondary leading-[1.55]">${vaultRiga()}</div>
      </div>

      ${remoto ? `
      <!-- v1.1.0 [N6] — Con il servizio dati i due riquadri qui sotto NON
           valgono: parlano di un database dentro il browser, e il database
           non e' piu' li'. Dirlo comunque sarebbe peggio che tacere, perche'
           un operatore leggerebbe "il browser puo' cancellare il database"
           di un file SQLite che il browser non ha mai visto — e i due
           pulsanti OPFS fallirebbero, essendo supportsLocalBackup false. -->
      <div class="py-5 px-0 border-b border-b-sx-border">
        <div class="font-bold text-body-medium mb-2.5">
          🗄 Il database non è in questo browser <span class="badge badge-green">servizio dati</span>
        </div>
        <div class="text-body-small text-sx-text-secondary leading-[1.55]">
          Vive come file sulla macchina che ospita il servizio${est?.file ? `:<br><span class="mono text-label-small">${this._esc(est.file)}</span>` : '.'}
          <br>Non è soggetto alla cancellazione dei dati di navigazione né alla quota del browser,
          e non serve alcun permesso di archiviazione persistente.
          <strong>La copia di sicurezza è un compito del servizio</strong>, non di questa scheda:
          si esegue a caldo con <span class="mono">POST /api/backup</span> — vedi INSTALLAZIONE, sezione «Il backup».
        </div>
      </div>` : `
      <div class="py-5 px-0 border-b border-b-sx-border">
        <div class="font-bold text-body-medium mb-2.5">
          🔒 Archiviazione persistente
          ${persist.granted
            ? '<span class="badge badge-green">concessa</span>'
            : '<span class="badge badge-amber">non concessa</span>'}
        </div>
        <div class="text-body-small text-sx-text-secondary leading-[1.55]">
          ${persist.granted
            ? 'Il browser si impegna a non cancellare il database per far spazio ad altro.'
            : `Senza questo permesso il browser <strong>può cancellare il database</strong> quando il disco si riempie.
               ${persist.reason}`}
        </div>
      </div>

      <div class="py-5 px-0 border-b border-b-sx-border">
        <div class="font-bold text-body-medium mb-2.5">🗂 Backup locali settimanali (OPFS)</div>
        <div class="text-body-small text-sx-text-secondary leading-[1.55] mb-4">
          ${opfsList.length
            ? `${opfsList.length} cop${opfsList.length === 1 ? 'ia' : 'ie'} · più recente: <strong>${opfsList[0]?.name || '—'}</strong>.`
            : 'Nessuna copia presente.'}
          Stanno sullo stesso disco e nello stesso profilo browser del database:
          <strong>non sostituiscono la copia esterna</strong>, servono a rimediare a un errore recente.
        </div>
        <button class="btn btn-sm" onclick="App.showOPFSBackups()">🗂 Elenca e ripristina…</button>
        <button class="btn btn-sm" onclick="App.opfsBackupNow()">💾 Crea copia locale adesso</button>
      </div>`}

      <div class="py-5 px-0">
        <div class="font-bold text-body-medium mb-2.5">⚡ Registro in memoria</div>
        <div class="text-body-small text-sx-text-secondary leading-[1.55] mb-4">
          In archivio ci sono <strong>${win.total.toLocaleString('it-IT')}</strong> movimenti; in memoria se ne tengono
          <strong>${win.inMemory.toLocaleString('it-IT')}</strong> (ultimi ${win.days || '∞'} giorni).
          Cruscotto e KPI leggono la finestra; Registro, export e ricerche per data interrogano l'archivio completo.
          Allargarla rende l'avvio più lento, stringerla lo rende più rapido: <strong>nessun dato viene perso in nessun caso</strong>.
        </div>
        <div class="flex gap-5 items-center flex-wrap">
          <label class="text-body-small font-semibold" for="movWindowDays">Giorni in memoria</label>
          <input class="input input-mono w-[100px]" id="movWindowDays" type="number" min="0" max="${Store.MOVLOG_WINDOW_MAX}" value="${win.days}">
          <button class="btn btn-sm btn-primary" onclick="App._applyMovWindow()">Applica e ricarica</button>
          <span class="text-label-small text-sx-text-muted">0 = carica tutto (sconsigliato oltre i 100.000 movimenti)</span>
        </div>
      </div>

      <div class="text-label-small text-sx-text-muted mt-5 pt-5 border-t border-t-sx-border">
        Spazio occupato: ${this._fmtUsage(est)}
      </div>
    </div>`;
  },

  async _applyMovWindow() {
    const v = Store.setMovLogWindowDays($('movWindowDays')?.value);
    this.toast(`Finestra del registro: ${v ? v + ' giorni' : 'tutto l’archivio'} — ricarico…`, 'info');
    await Store.reloadCache();
    this.renderConfig();
  },

  /* ── Comandi della copia esterna ─────────────────────────────────── */
  async vaultChooseFolder() {
    try {
      await Vault.chooseFolder();
      this.toast('Cartella di backup configurata — eseguo la prima copia…', 'success');
      await this.vaultBackupNow();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;   // l'utente ha chiuso il selettore
      this.toast(`Cartella non configurata: ${err.message}`, 'error');
    }
    this.renderConfig();
  },

  async vaultReauthorize() {
    const p = await Vault.requestPermission();
    if (p === 'granted') { this.toast('Permesso riattivato', 'success'); await this.vaultBackupNow(); }
    else this.toast('Permesso non concesso', 'error');
    this.renderConfig();
  },

  async vaultBackupNow() {
    const host = $('resilienzaCard');
    const say = (t: any) => { if (host) { const s = host.querySelector('.vault-progress'); if (s) s.textContent = t; } };
    if (host) host.insertAdjacentHTML('afterbegin', '<div class="config-card vault-progress mb-5">Backup in corso…</div>');
    try {
      const r: any = await Vault.runBackup({ force: true, onProgress: say });
      this.toast(`💾 Backup esterno completato · ${r.movimenti.toLocaleString('it-IT')} movimenti · ${r.mesiScritti} file mensili aggiornati`, 'success');
    } catch (err: any) {
      console.error('[WM] backup esterno:', err);
      this.toast(`Backup esterno non riuscito: ${err.message}`, 'error');
    } finally {
      document.querySelector('.vault-progress')?.remove();
      if (this.currentView === 'config' && this._configTab === 'data') this.renderConfig();
    }
  },

  /* Backup automatico all'avvio, silenzioso se non c'e' niente da fare. */
  async _scheduleVaultBackup() {
    if (!Vault.supported()) return;
    try {
      if ((await Vault.permissionState()) !== 'granted') return;
      if (!(await Vault.isDue())) return;
      const r = await Vault.runBackup();
      if (r) this.toast(`💾 Copia esterna aggiornata · ${r.movimenti.toLocaleString('it-IT')} movimenti`, 'info');
    } catch (err: any) {
      console.warn('[WM] backup esterno automatico:', err);
      this.toast(`⚠ Copia esterna non riuscita: ${err.message}`, 'warning');
    }
  },

  async vaultRestore() {
    const stati = await Vault.listStates();
    if (!stati.length) return this.toast('Nella cartella non ci sono fotografie da ripristinare', 'error');
    const manifest = await Vault.readManifest();
    const opzioni = stati.map((s, i) => `<option value="${this._esc(s.name)}" ${i === 0 ? 'selected' : ''}>
      ${this._esc(s.name)} — ${(s.size/1024).toFixed(0)} KB — ${new Date(s.modified).toLocaleString('it-IT')}</option>`).join('');
    this.showModal(
      '♻ Ripristino dalla cartella di backup',
      `<div class="mov-preview mov-preview-err mb-7">
        <strong>⚠ Il ripristino SOSTITUISCE integralmente i dati presenti.</strong>
        Prima di procedere verrà scaricato un export dello stato attuale.
      </div>
      <p class="text-body-small text-sx-text-secondary leading-[1.6] mb-6">
        Verranno ricomposti la fotografia scelta e <strong>tutti</strong> i file mensili dei movimenti presenti nella cartella.
        ${manifest ? `Il manifest dichiara ${Number(manifest.movimenti_totali||0).toLocaleString('it-IT')} movimenti su ${manifest.mesi||0} mesi.` : 'Nella cartella non è presente il manifest: la verifica sarà parziale.'}
      </p>
      <div class="form-group">
        <label>Fotografia dello stato da usare</label>
        <select class="input select" id="vaultStatePick">${opzioni}</select>
      </div>
      <div class="text-body-small text-sx-text-muted mt-5 min-h-[1.2em]" id="vaultRestoreLog"></div>`,
      `<button class="btn" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-danger" onclick="App.doVaultRestore()">♻ Ripristina</button>`
    );
  },

  async doVaultRestore() {
    const nome = $('vaultStatePick')?.value;
    const log = (t: any) => { const e = $('vaultRestoreLog'); if (e) e.textContent = t; };
    try {
      log('Export di sicurezza dello stato attuale…');
      await this.exportData();
      log('Lettura del backup…');
      const pacchetto = await Vault.buildRestorePackage({ statoFile: nome, onProgress: log });
      const check = Store.verifyExportPackage(pacchetto);
      if (!check.ok && !await Dialog.confirm({
        title: '⚠ Il backup presenta anomalie',
        message: 'La verifica ha segnalato quanto segue:\n\n' + check.problemi.map(p => '  • ' + p).join('\n') +
                 '\n\nProcedere comunque significa sostituire i dati attuali con questo contenuto.',
        confirmLabel: 'Ripristina comunque', danger: true
      })) return;

      const c = pacchetto._counts;
      if (!await Dialog.confirm({
        title: 'Confermare il ripristino?',
        message: 'I dati attualmente in questo database verranno sostituiti.',
        details: Dialog.kv([
          ['Movimenti', Number((c as any).mov_log).toLocaleString('it-IT')],
          ['Giacenze', Number((c as any).inventory).toLocaleString('it-IT')],
          ['Articoli', Number((c as any).articles).toLocaleString('it-IT')],
          ['Operatori', Number((c as any).operators).toLocaleString('it-IT')]
        ]),
        confirmLabel: 'Sostituisci i dati', danger: true
      })) return;

      log('Scrittura in corso…');
      await Store.importAll(pacchetto, 'overwrite');
      this.closeModal();
      this.renderSidebar();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`♻ Ripristino completato · ${Number((c as any).mov_log).toLocaleString('it-IT')} movimenti`, 'success');
    } catch (err: any) {
      console.error('[WM] ripristino:', err);
      log(`Errore: ${err.message}`);
      this.toast(`Ripristino non riuscito: ${err.message}`, 'error');
    }
  },

  /* v2.1.0 — Preferenze di riscontro operativo (nessun dato personale trattato) */
  _setFeedbackPref(key, value) {
    Feedback.setPref(key, value);
    if (key === 'volume') {
      const lbl = $('fbVolumeLabel');
      if (lbl) lbl.textContent = `${Math.round(value * 100)}%`;
      Feedback.sound('scan');
    } else if (value) {
      Feedback.sound('ok');
    }
  },

  _testFeedback() {
    Feedback.signal('ok', 'Riscontro positivo', 'Suono breve ascendente — operazione registrata.');
    setTimeout(() => Feedback.signal('warn', 'Avviso', 'Doppio tono — richiede attenzione dell\u2019operatore.'), 1800);
    setTimeout(() => Feedback.signal('error', 'Errore', 'Tono grave ripetuto — operazione NON registrata.'), 3800);
  },  async purgeOldLogsManual() {
    if (!this._requireOperator('la purge del registro')) return;   // v2.0.1 [B7]
    const cutoffTs = Date.now() - LOG_RETENTION_MS;
    const cutoffLabel = new Date(cutoffTs).toLocaleDateString('it-IT');
    let count = 0;
    try {
      count = await Store.countPurgeableMovements(cutoffTs);
    } catch (err: any) {
      return this.toast(`Errore nel conteggio: ${err.message || 'sconosciuto'}`, 'error');
    }
    if (count === 0) {
      return this.toast(`Nessun movimento antecedente al ${cutoffLabel} — niente da eliminare`, 'info');
    }

    // Step 1 — export obbligatorio
    // v2.2.1 [F2] — migrato da confirm() nativo a Dialog (anti-scanner)
    if (!await Dialog.confirm({
      title: 'Purge manuale registro storico',
      message: 'I record di NON CONFORMITÀ non verranno toccati. Prima di procedere verrà scaricato un export JSON completo.',
      details: Dialog.kv([
        ['Movimenti antecedenti al', cutoffLabel],
        ['Record da eliminare', count],
        ['Soglia di conservazione', `${LOG_RETENTION_DAYS} giorni`]
      ]),
      confirmLabel: 'Continua con l\u2019export', danger: true, icon: '\u{1F5C4}'
    })) return;

    try {
      await this.exportData();
    } catch (err: any) {
      return this.toast(`Export preventivo fallito: ${err.message || 'sconosciuto'} — purge annullata`, 'error');
    }

    // Step 2 — conferma esplicita digitata
    // v2.2.1 [F2] — migrato da prompt() nativo a _promptText (dialogo interno)
    const typed = await this._promptText({
      title: 'Conferma definitiva purge',
      message: `Export completato: verificare che il file sia stato scaricato e archiviato. ` +
        `Stai per eliminare DEFINITIVAMENTE ${count} movimenti antecedenti al ${cutoffLabel}. ` +
        `L\u2019operazione non è reversibile. Per confermare digita: ELIMINA`,
      placeholder: 'Digita ELIMINA per confermare',
      maxlength: 10
    });
    if (typed === null) return;
    if (Validate.clean(typed, true) !== 'ELIMINA') {
      return this.toast('Conferma non corretta — purge annullata, nessun record eliminato', 'warning');
    }

    // Step 3 — esecuzione + registrazione a log
    try {
      const removed = await Store.purgeMovementsBefore(cutoffTs);
      await this._logMov(
        MOV.PURGE, '', '', '', '', null, Store.getCurrentIdentity().initials,
        `Purge manuale registro: ${removed} movimenti antecedenti al ${cutoffLabel} eliminati previo export JSON`,
        `PURGE-${new Date().toISOString().slice(0, 10)}`
      );
      this.toast(`🗄 Purge completata: ${removed} movimenti eliminati · operazione registrata a log`, 'success');
      this.updateSyncIndicator();
      this.renderConfig();
    } catch (err: any) {
      this.toast(`Errore durante la purge: ${err.message || 'sconosciuto'}`, 'error');
    }
  },

  async exportData() {
    const data = await Store.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-mapper-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await Store.markSaved();
    this.updateSyncIndicator();
    this.toast('✓ Backup JSON esportato', 'success');
  },

  importData() { $('fileImport').click(); },

  async forceSave() {
    const btn = (event?.target as any)?.closest('button');
    const originalLabel = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Salvataggio…'; }
    try {
      await this._saveCheckpoint();
    } finally {
      if (btn && originalLabel) { btn.disabled = false; btn.innerHTML = originalLabel; }
    }
  },

  /* Checkpoint condiviso. Rilancia l'errore: chi chiama decide come vestirlo. */
  async _saveCheckpoint() {
    try {
      const result = await Store.forceSave();
      const ts = new Date(result.ts).toLocaleString('it-IT');
      const total = Object.values<any>(result.counts).reduce((s, n) => s + n, 0);
      this.updateSyncIndicator();
      if (this.currentView === 'dashboard') this.renderDashboard();
      else if (this.currentView === 'config' && this._configTab === 'data') this.renderConfig();

      if (result.divergenze?.length) {
        const elenco = result.divergenze
          .map(d => `  • ${d.collection}: ${d.memoria} in memoria, ${d.disco} nel database`)
          .join('\n');
        await Dialog.confirm({
          title: '⚠ Disallineamento rilevato e corretto',
          message: 'Il controllo ha trovato una differenza fra i dati in memoria e quelli scritti nel database. ' +
                   'La memoria è stata riallineata al database, che è la copia che sopravvive al riavvio.\n\n' +
                   elenco + '\n\nSe la differenza riguarda giacenze o movimenti, verificare l’ultima operazione eseguita.',
          confirmLabel: 'Ho capito'
        });
      } else {
        this.toast(`✓ Salvataggio verificato — ${total.toLocaleString('it-IT')} record · ${ts}`, 'success');
      }
      return result;
    } catch (err: any) {
      console.error('[WM] forceSave error:', err);
      this.toast(`Errore salvataggio: ${err.message}`, 'error');
      throw err;
    }
  },

  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const check = Store.verifyExportPackage(data);
      if (!check.ok) {
        const proceed = await Dialog.confirm({
          title: '⚠ Il file presenta anomalie',
          message: 'La verifica preliminare ha segnalato quanto segue:\n\n' +
                   check.problemi.map(p => '  • ' + p).join('\n') +
                   '\n\nProseguire solo se si è certi della provenienza del file.',
          details: Dialog.kv([['File', file.name], ['Dimensione', `${(file.size/1024).toFixed(0)} KB`]]),
          confirmLabel: 'Prosegui comunque', danger: true
        });
        if (proceed !== true) { this.toast('Import annullato', 'info'); event.target.value = ''; return; }
      }

      const destinazioneVuota = Store.getSites().length === 0
                             && Store.getInventoryCount() === 0
                             && Store.getOperators().length === 0
                             && Store.getMovLogTotal() === 0;

      const NON_PORTATE = 'registro movimenti, quarantene, DDT, verbali, report di prelievo, anagrafica operatori (PIN compresi) e dati del mittente';
      const contenuto = Object.entries<any>(Store._countsOf(data))
        .filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(' · ') || 'nessun record';

      let mode = null;
      if (destinazioneVuota) {
        const scelta = await Dialog.confirm({
          title: 'Importa in un database vuoto',
          message: 'Questo database non contiene ancora nulla: si tratta di una migrazione o di un ripristino.\n\n' +
                   'L’importazione COMPLETA porta tutto il contenuto del file. Non cancella niente, perché non c’è niente da cancellare.\n\n' +
                   `Il merge, qui, porterebbe solo siti, zone, articoli e giacenze: resterebbero fuori ${NON_PORTATE}. ` +
                   'Senza operatori nessuno potrebbe entrare né registrare movimenti.',
          details: Dialog.kv([['File', file.name], ['Contenuto', contenuto]]),
          confirmLabel: 'Importa TUTTO', cancelLabel: 'Altre opzioni…', icon: '\u{1F4E5}'
        });
        if (scelta === true) {
          mode = 'overwrite';
        } else if (scelta === false) {
          if (await Dialog.confirm({
            title: 'Importare solo una parte?',
            message: 'Verranno importati solo siti, zone, articoli e giacenze.\n\n' +
                     `Resteranno fuori: ${NON_PORTATE}.`,
            confirmLabel: 'Importa solo in MERGE', danger: true
          }) === true) mode = 'merge';
        }
      } else {
        const mergeChoice = await Dialog.confirm({
          title: 'Importa dati da JSON',
          message: 'Modalità MERGE (consigliata su un database già in uso): aggiunge solo siti, zone, articoli e giacenze non già presenti, senza toccare i dati esistenti.\n\n' +
                   `Il merge NON importa ${NON_PORTATE}. Per portare tutto il contenuto del file scegliere «Altre opzioni».`,
          details: Dialog.kv([['File', file.name], ['Contenuto', contenuto]]),
          confirmLabel: 'Importa in MERGE', cancelLabel: 'Altre opzioni…', icon: '\u{1F4E5}'
        });
        if (mergeChoice === true) {
          mode = 'merge';
        } else if (mergeChoice === false) {
          if (await Dialog.confirm({
            title: 'Sovrascrivere il database?',
            message: 'Tutti i dati attuali (siti, zone, articoli, giacenze, movimenti, quarantene, DDT pendenti) saranno eliminati e sostituiti con il contenuto del file. Operazione irreversibile.',
            confirmLabel: 'SOVRASCRIVI tutto', danger: true
          }) === true) mode = 'overwrite';
        }
      }
      if (mode) {
        await Store.importAll(data, mode);
        this.currentSite = null; this.currentZone = null;
        this.renderSidebar(); this.renderDashboard(); this.renderConfig();
        this.updateSyncIndicator();
        this.toast(`✓ Dati importati (${mode})`, 'success');
      }
    } catch (err: any) {
      this.toast(`Errore import: ${err.message}`, 'error');
    }
    event.target.value = '';
  },

  /* Export Registro Movimenti completo in Excel (4 fogli) */
  async exportMovLogExcel() {
    const XLSX = await caricaExcel();
    const totale = Store.getMovLogTotal();
    if (!totale) return this.toast('Nessuna movimentazione da esportare', 'error');
    if (totale > 100000 && !await Dialog.confirm({
      title: 'Export di grandi dimensioni',
      message: `L’archivio contiene ${totale.toLocaleString('it-IT')} movimenti. La generazione del file Excel può richiedere qualche minuto e occupare parecchia memoria.`,
      details: Dialog.kv([['Movimenti', totale.toLocaleString('it-IT')], ['Formato', 'XLSX, 4 fogli']]),
      confirmLabel: 'Procedi'
    })) return;

    this.toast(`Lettura di ${totale.toLocaleString('it-IT')} movimenti dall’archivio…`, 'info');
    const log: any[] = [];
    await Store.eachMovement(rows => { for (const r of rows) log.push(r); });
    log.sort((a, b) => b.ts - a.ts);
    if (!log.length) return this.toast('Nessuna movimentazione da esportare', 'error');

    const headers = ['#', 'Tipo', 'Codice', 'Descrizione', 'Lotto', 'Ubicazione', 'Destinazione', 'Coll. Prima', 'Delta', 'Coll. Dopo', 'Operatore', 'Ordine/Doc', 'Note', 'Data', 'Ora'];
    const rows = log.map((m, i) => {
      const ts = m.ts ? new Date(m.ts) : null;
      // v1.7.0 — colonne qty: null per movimenti pre-v1.7.0 (storici)
      const qBefore = (typeof m.qty_before === 'number') ? m.qty_before : '';
      const qDelta  = (typeof m.qty_delta  === 'number') ? m.qty_delta  : '';
      const qAfter  = (typeof m.qty_after  === 'number') ? m.qty_after  : '';
      return [
        i+1, (MOV_LABELS as any)[m.type] || m.type,
        m.article_code || '', m.article_description || '', m.lot_code || '',
        m.location_code || '', m.dest_location || '',
        qBefore, qDelta, qAfter,
        m.user || '', m.doc_ref || '', m.notes || '',
        ts ? ts.toLocaleDateString('it-IT') : '', ts ? ts.toLocaleTimeString('it-IT') : ''
      ];
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{wch:5},{wch:20},{wch:18},{wch:32},{wch:15},{wch:18},{wch:18},{wch:10},{wch:8},{wch:10},{wch:16},{wch:14},{wch:20},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, 'Registro');

    // Foglio 2 — Riepilogo per tipo
    const typeSum: any = {};
    for (const m of log) typeSum[m.type] = (typeSum[m.type] || 0) + 1;
    const sumRows: any[] = [['Tipo', 'Quantità', '% Totale']];
    for (const [t, c] of Object.entries<any>(typeSum).sort((a,b)=>b[1]-a[1])) sumRows.push([(MOV_LABELS as any)[t] || t, c, Math.round(c/log.length*100)+'%']);
    sumRows.push(['TOTALE', log.length, '100%']);
    const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
    ws2['!cols'] = [{wch:24},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo Tipo');

    // Foglio 3 — Riepilogo giornaliero
    const daily: any = {};
    for (const m of log) {
      const d = m.ts ? new Date(m.ts).toISOString().slice(0,10) : 'N/A';
      if (!daily[d]) daily[d] = { tot:0, IN:0, OUT:0, MOVE:0, PICK:0, REPOS:0, FIX:0, QUAR:0, RET:0, SHIP:0, EDIT:0 };
      daily[d].tot++;
      const k = m.type === 'FIX+' || m.type === 'FIX-' ? 'FIX' : (m.type === 'QREL' ? 'QUAR' : m.type);
      daily[d][k] = (daily[d][k] || 0) + 1;
    }
    // v2.0 — colonne RET, SHIP, EDIT aggiunte al riepilogo giornaliero
    const dRows: any[] = [['Data','Totale','Posizionamenti','Smaltimenti','Cambi','Prelievi','Riposizion.','Correzioni','Quarantene','Resi','Spedizioni','Modifiche']];
    for (const [d, v] of Object.entries<any>(daily).sort()) {
      dRows.push([d !== 'N/A' ? new Date(d).toLocaleDateString('it-IT') : d, v.tot, v.IN, v.OUT, v.MOVE, v.PICK, v.REPOS, v.FIX, v.QUAR, v.RET || 0, v.SHIP || 0, v.EDIT || 0]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(dRows);
    ws3['!cols'] = [{wch:14},{wch:8},{wch:16},{wch:14},{wch:10},{wch:10},{wch:14},{wch:12},{wch:12},{wch:8},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws3, 'Riepilogo Giornaliero');

    // Foglio 4 — Top articoli
    const artFreq = {};
    for (const m of log) {
      if (!m.article_code) continue;
      if (!(artFreq as any)[m.article_code]) (artFreq as any)[m.article_code] = { desc: m.article_description || '', count: 0, last: m.ts };
      (artFreq as any)[m.article_code].count++;
      if (m.ts > (artFreq as any)[m.article_code].last) { (artFreq as any)[m.article_code].last = m.ts; if (m.article_description) (artFreq as any)[m.article_code].desc = m.article_description; }
    }
    const tRows = [['Rank','Codice','Descrizione','N° Movimenti','Ultima Movimentazione']];
    Object.entries<any>(artFreq).sort((a,b) => b[1].count - a[1].count).forEach(([c, v], i) => {
      tRows.push([i+1, c, v.desc, v.count, v.last ? new Date(v.last).toLocaleDateString('it-IT') : '']);
    });
    const ws4 = XLSX.utils.aoa_to_sheet(tRows);
    ws4['!cols'] = [{wch:6},{wch:20},{wch:32},{wch:16},{wch:22}];
    XLSX.utils.book_append_sheet(wb, ws4, 'Top Articoli');

    const fn = `registro-movimentazioni-${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fn);
    this.toast(`📊 Esportato: ${fn} (${log.length} record, 4 fogli)`, 'success');
  },

  async exportGiacenzeExcel() {
    const XLSX = await caricaExcel();
    const inventory = Store.getInventorySnapshot();
    if (!inventory.length) return this.toast('Nessuna giacenza da esportare', 'warning');

    const sites = Store.getSites();
    const siteByCode: any = {};
    const zoneByLoc: any = {};   // location_code → { siteId, siteName, zoneId, zoneName }
    sites.forEach(s => {
      siteByCode[s.id] = s;
      (s.zones || []).forEach(z => {
        // Ricostruisco i prefissi delle ubicazioni della zona
        const locs = Store.generateLocations(s.id, z.id);
        locs.forEach(l => {
          zoneByLoc[l.code] = { siteId: s.id, siteName: s.name, zoneId: z.id, zoneName: z.name };
        });
      });
    });

    // Per ogni item, risolvi site/zone dall'index
    const enriched = inventory.map(it => {
      const meta = zoneByLoc[it.location_code] || { siteId: '?', siteName: '— Non mappata —', zoneId: '?', zoneName: '— Non mappata —' };
      const qty = it.qty || 1;
      const placedAt = it.placed_at ? new Date(it.placed_at) : null;
      const lastUpd = it.last_updated_at ? new Date(it.last_updated_at) : null;
      return {
        siteId: meta.siteId, siteName: meta.siteName, zoneId: meta.zoneId, zoneName: meta.zoneName,
        location_code: it.location_code,
        article_code: it.article_code,
        article_description: it.article_description || '',
        lot_code: it.lot_code,
        qty,
        expiry_date: it.expiry_date || '',
        notes: it.notes || '',
        placed_at_str: placedAt ? placedAt.toLocaleDateString('it-IT') : '',
        last_updated_str: lastUpd ? lastUpd.toLocaleDateString('it-IT') : '',
        placed_by: it.placed_by || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const headers = ['Site', 'Zona', 'Ubicazione', 'Articolo', 'Descrizione', 'Lotto', 'Coll.', 'Scadenza', 'Posizionato il', 'Ultimo agg.', 'Operatore', 'Note'];
    const colWidths = [{wch:18},{wch:18},{wch:18},{wch:18},{wch:32},{wch:15},{wch:8},{wch:12},{wch:14},{wch:14},{wch:16},{wch:25}];
    const rowOf = (e: any) => [e.siteName, e.zoneName, e.location_code, e.article_code, e.article_description, e.lot_code, e.qty, e.expiry_date, e.placed_at_str, e.last_updated_str, e.placed_by, e.notes];

    // FOGLIO 1 — Riepilogo per Site
    const siteSummary: any = {};
    enriched.forEach(e => {
      if (!siteSummary[e.siteName]) siteSummary[e.siteName] = { lotti: 0, colli: 0, articoli: new Set(), ubicazioni: new Set() };
      const s = siteSummary[e.siteName];
      s.lotti++;
      s.colli += e.qty;
      s.articoli.add(e.article_code);
      s.ubicazioni.add(e.location_code);
    });
    const sumRows: any[] = [['Site', 'N° Lotti', 'Colli Totali', 'Articoli Univoci', 'Ubicazioni Occupate']];
    let totLotti = 0, totColli = 0;
    Object.entries<any>(siteSummary).sort().forEach(([name, s]) => {
      sumRows.push([name, s.lotti, s.colli, s.articoli.size, s.ubicazioni.size]);
      totLotti += s.lotti; totColli += s.colli;
    });
    sumRows.push(['TOTALE GENERALE', totLotti, totColli, '', '']);
    const wsSum = XLSX.utils.aoa_to_sheet(sumRows);
    wsSum['!cols'] = [{wch:24},{wch:12},{wch:14},{wch:18},{wch:20}];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Riepilogo');

    // FOGLIO 2 — Tutto Flat (per filtri Excel nativi)
    const allSorted = enriched.slice().sort((a,b) => {
      if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName);
      if (a.zoneName !== b.zoneName) return a.zoneName.localeCompare(b.zoneName);
      if (a.location_code !== b.location_code) return a.location_code.localeCompare(b.location_code);
      return a.article_code.localeCompare(b.article_code);
    });
    const wsAll = XLSX.utils.aoa_to_sheet([headers, ...allSorted.map(rowOf)]);
    wsAll['!cols'] = colWidths;
    wsAll['!autofilter'] = { ref: `A1:L${allSorted.length + 1}` };
    XLSX.utils.book_append_sheet(wb, wsAll, 'Tutte le Giacenze');

    // FOGLI 3..N — uno per Site
    const bySite: any = {};
    enriched.forEach(e => { (bySite[e.siteName] ||= []).push(e); });
    Object.entries<any>(bySite).sort().forEach(([siteName, list]) => {
      list.sort((a: any,b: any) => {
        if (a.zoneName !== b.zoneName) return a.zoneName.localeCompare(b.zoneName);
        if (a.location_code !== b.location_code) return a.location_code.localeCompare(b.location_code);
        return a.article_code.localeCompare(b.article_code);
      });
      const ws = XLSX.utils.aoa_to_sheet([headers, ...list.map(rowOf)]);
      ws['!cols'] = colWidths;
      ws['!autofilter'] = { ref: `A1:L${list.length + 1}` };
      // Excel limita nomi foglio a 31 char e vieta certi caratteri
      const sheetName = siteName.replace(/[\\/?*\[\]:]/g, '').slice(0, 31) || 'Site';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // FOGLIO FINALE — Pivot Articoli (somma colli per articolo trasversale)
    const byArt: any = {};
    enriched.forEach(e => {
      if (!byArt[e.article_code]) byArt[e.article_code] = { desc: e.article_description, totColli: 0, lotti: new Set(), ubicazioni: new Set(), siti: new Set() };
      const a = byArt[e.article_code];
      a.totColli += e.qty;
      a.lotti.add(e.lot_code);
      a.ubicazioni.add(e.location_code);
      a.siti.add(e.siteName);
    });
    const pivotRows = [['Articolo', 'Descrizione', 'Colli Totali', 'N° Lotti', 'N° Ubicazioni', 'Site Coinvolti']];
    Object.entries<any>(byArt).sort((a,b) => b[1].totColli - a[1].totColli).forEach(([code, a]) => {
      pivotRows.push([code, a.desc, a.totColli, a.lotti.size, a.ubicazioni.size, [...a.siti].join(', ')]);
    });
    const wsPivot = XLSX.utils.aoa_to_sheet(pivotRows);
    wsPivot['!cols'] = [{wch:18},{wch:34},{wch:14},{wch:10},{wch:14},{wch:30}];
    XLSX.utils.book_append_sheet(wb, wsPivot, 'Pivot Articoli');

    const fn = `giacenze-${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fn);
    this.toast(`📊 Esportato: ${fn} (${enriched.length} righe, ${Object.keys(bySite).length + 3} fogli)`, 'success');
  },

  importArticlesExcel() { $('fileImportExcel').click(); },

  /* 1.4.0 — L'import legge SOLO le colonne che il foglio porta davvero, e
     aggiorna gli articoli che gia' esistono invece di saltarli.

     Prima non lo faceva: `addArticle` esce con false su un codice noto, e su
     un'anagrafica gia' popolata l'import diceva «importati 0» senza spiegare
     perche'. Chi arricchisce 11.000 articoli con due colonne nuove ha bisogno
     esattamente del contrario. */
  async handleImportExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const XLSX = await caricaExcel();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json(ws, { defval: undefined });
      const letto = this._leggiFoglioArticoli(rows);
      if (!letto.righe.length && !letto.problemi.length) {
        return this.toast('Il foglio non contiene articoli leggibili', 'warning');
      }
      if (!await this._confermaImportArticoli(letto)) return;
      const esito = await Store.upsertArticles(letto.righe);
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`✓ ${esito.creati} creati · ${esito.modificati} aggiornati`,
        esito.creati + esito.modificati > 0 ? 'success' : 'info');
    } catch (err: any) { this.toast(`Errore Excel: ${err.message}`, 'error'); }
    event.target.value = '';
  },

  /* Dal foglio alle righe da scrivere. Nessuna scrittura qui dentro: legge,
     valida e racconta. Le colonne assenti restano `undefined`, che a valle
     significa «non toccare», non «azzera». */
  _leggiFoglioArticoli(rows) {
    const righe: any[] = [];
    const problemi: any[] = [];
    let senzaCodice = 0;
    const nuoviCodici = new Set();
    let conAllergeni = 0, conTemperatura = 0, conCertificazioni = 0;

    rows.forEach((row: any, i: any) => {
      const foglio = i + 2;                      // +1 intestazione, +1 base uno
      const code = Validate.clean(row['Codice'], true);
      if (!code) { senzaCodice++; return; }
      const errCode = Validate.article(code);
      if (errCode) { problemi.push(`Riga ${foglio} — codice "${code}": ${errCode}`); return; }

      const esiste = !!Store.getArticle(code);
      const rec: any = { code };
      const testo = (col: any, campo: any, upper = false) => {
        if (row[col] === undefined) return;
        rec[campo] = Validate.clean(row[col], upper);
      };
      const numero = (col: any, campo: any) => { if (row[col] !== undefined) rec[campo] = row[col]; };

      testo('Descrizione', 'description');
      testo('Categoria', 'category', true);
      testo('Fornitore', 'supplier');
      testo('UM', 'unit', true);
      testo('Note', 'notes');
      numero('Peso', 'weight'); numero('Lunghezza', 'length');
      numero('Larghezza', 'width'); numero('Altezza', 'height');
      /* 1.6 — `Peso_Netto_Collo` non si legge piu': D15 lo toglie dai dati
         gestiti. Una colonna vecchia nel foglio non fa danno, viene ignorata. */
      numero('Pezzi_Per_Collo', 'pieces_per_pack');
      numero('Stock_Min', 'min_stock'); numero('Stock_Max', 'max_stock');

      if (rec.description !== undefined) {
        const errDesc = Validate.articleDesc(rec.description, !esiste);
        if (errDesc) { problemi.push(`Riga ${foglio} — ${code}: ${errDesc}`); return; }
      } else if (!esiste) {
        problemi.push(`Riga ${foglio} — ${code}: articolo nuovo senza descrizione`);
        return;
      }

      if (row['Temperatura'] !== undefined) {
        const cls = leggiClasseTemperatura(row['Temperatura']);
        if (cls === undefined) {
          problemi.push(`Riga ${foglio} — ${code}: temperatura "${row['Temperatura']}" non prevista. Ammessi: ${CLASSI_TEMPERATURA.map(c => c.code).join(', ')}`);
          return;
        }
        rec.temp_class = cls;
        if (cls) conTemperatura++;
      }

      if (row['Allergeni'] !== undefined) {
        /* Le voci aziendali passano insieme ai 14: chi le ha configurate se
           le aspetta in colonna, e un rifiuto qui sarebbe incomprensibile. */
        const { codici, scarti } = leggiAllergeni(row['Allergeni'], Store.getArticleParams().allergeni);
        if (scarti.length) {
          problemi.push(`Riga ${foglio} — ${code}: allergene non previsto ${scarti.map(s => `"${s}"`).join(', ')}`);
          return;
        }
        rec.allergens = codici;
        if (codici.length) conAllergeni++;
      }

      if (row['Pericolosita'] !== undefined) {
        const ammesse = Store.getPericoli();
        const { codici, scarti } = leggiCodici(row['Pericolosita'], ammesse);
        if (scarti.length) {
          problemi.push(`Riga ${foglio} — ${code}: pericolosità non prevista ${scarti.map(s => `"${s}"`).join(', ')}. Ammesse: ${ammesse.map(h => h.code).join(', ') || 'nessuna configurata'}`);
          return;
        }
        rec.hazards = codici;
      }

      if (row['Certificazioni'] !== undefined) {
        const { codici, scarti } = leggiCertificazioni(row['Certificazioni']);
        if (scarti.length) {
          problemi.push(`Riga ${foglio} — ${code}: certificazione non prevista ${scarti.map(s => `"${s}"`).join(', ')}. Ammesse: ${CERTIFICAZIONI.map(c => c.code).join(', ')}`);
          return;
        }
        rec.certifications = codici;
        if (codici.length) conCertificazioni++;
      }

      if (!esiste) nuoviCodici.add(code);
      righe.push(rec);
    });

    return { righe, problemi, senzaCodice, nuovi: nuoviCodici.size,
             conAllergeni, conTemperatura, conCertificazioni };
  },

  async _confermaImportArticoli(letto) {
    const aggiornati = letto.righe.length - letto.nuovi;
    const wrap = document.createElement('div');

    wrap.appendChild(Dialog.kv([
      ['Articoli nuovi da creare', letto.nuovi],
      ['Articoli esistenti da aggiornare', aggiornati],
      ['Con classe di temperatura', letto.conTemperatura],
      ['Con allergeni dichiarati', letto.conAllergeni],
      ['Con certificazioni dichiarate', letto.conCertificazioni],
      ['Righe senza codice, ignorate', letto.senzaCodice || ''],
    ]));

    if (letto.problemi.length) {
      /* Le righe con un problema NON vengono scritte: si vedono tutte prima,
         si corregge il foglio e si reimporta. Scriverne meta' e' peggio che
         non scriverne nessuna. */
      const box = document.createElement('div');
      box.className = 'dlg-problemi';
      const t = document.createElement('div');
      t.className = 'dlg-problemi-t';
      t.textContent = `${letto.problemi.length} righe NON verranno importate`;
      box.appendChild(t);
      const ul = document.createElement('ul');
      for (const p of letto.problemi.slice(0, 12)) {
        const li = document.createElement('li');
        li.textContent = p;
        ul.appendChild(li);
      }
      if (letto.problemi.length > 12) {
        const li = document.createElement('li');
        li.textContent = `… e altre ${letto.problemi.length - 12}`;
        ul.appendChild(li);
      }
      box.appendChild(ul);
      wrap.appendChild(box);
    }

    const nota = document.createElement('p');
    nota.className = 'dlg-nota';
    nota.textContent = 'Le colonne assenti dal foglio non vengono toccate: un file con '
      + 'solo Codice, Temperatura e Allergeni aggiorna quei due campi e lascia il resto com’è.'
      + ' Vale anche per Certificazioni.';
    wrap.appendChild(nota);

    /* Niente da scrivere e solo problemi: non e' una conferma, e' un referto. */
    if (!letto.righe.length) {
      await Dialog.alert({ title: 'Nessuna riga importabile', icon: '⚠', details: wrap });
      return false;
    }

    return Dialog.confirm({
      title: 'Importare l’anagrafica?',
      details: wrap,
      confirmLabel: `Importa ${letto.righe.length} righe`,
      danger: letto.problemi.length > 0,
    });
  },

  async exportArticlesExcel() {
    const articles = Store.getArticles();
    if (!articles.length) return this.toast('Nessun articolo da esportare', 'warning');
    const XLSX = await caricaExcel();
    const data = articles.map(a => ({
      'Codice': a.code, 'Descrizione': a.description, 'Categoria': a.category || '',
      'Fornitore': a.supplier || '', 'UM': a.unit || 'PZ',
      'Peso': a.weight || 0, 'Lunghezza': a.length || 0, 'Larghezza': a.width || 0, 'Altezza': a.height || 0,
      // v3.0.0 [M4] — i due valori che alimentano il DDT
      'Pezzi_Per_Collo': a.pieces_per_pack || 0,
      'Stock_Min': a.min_stock || 0, 'Stock_Max': a.max_stock || 0,
      // 1.4.0 — vuote finche' non le si compila: la cella vuota dice «non
      // classificato», che e' un'informazione e non va confusa con «nessuno».
      'Temperatura': a.temp_class || '', 'Allergeni': scriviAllergeni(a.allergens),
      'Pericolosita': scriviAllergeni(a.hazards),
      'Certificazioni': scriviCertificazioni(a.certifications),
      'Note': a.notes || ''
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Articoli');
    /* Il secondo foglio e' la sorgente degli elenchi a discesa: la convalida
       di Excel si costruisce puntando qui, e resta allineata al codice. */
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      /* 1.4.2 — le cinque unita' entrano nello stesso foglio, sulla colonna
         `UM` che l'export ha da sempre: non ce n'e' una seconda. Ogni modulo
         porta i propri valori, e il foglio li mette in fila. */
      /* 1.6 — e con loro i valori CONFIGURATI, che senza questa riga
         verrebbero rifiutati dalla convalida che il foglio stesso genera:
         l'anagrafica li offre in tendina e l'import li accetta. */
      [...fogliValoriAmmessi(), ...valoriAmmessiUM(),
       ...Store.getArticleParams().allergeni.map(v => ({
         colonna: 'Allergeni', valore: v.code, significato: `${v.label} — voce aziendale` })),
       ...Store.getArticleParams().conservazione.map(v => ({
         colonna: 'Temperatura', valore: v.code, significato: `${v.label} — voce aziendale` })),
       ...Store.getPericoli().map(v => ({
         colonna: 'Pericolosita', valore: v.code, significato: v.label })),
       { colonna: 'Pericolosita', valore: 'NESSUNO', significato: 'Verificato: non pericoloso' }]
        .map(v => ({ 'Colonna': v.colonna, 'Valore': v.valore, 'Significato': v.significato }))
    ), 'Valori ammessi');
    XLSX.writeFile(wb, `anagrafica-articoli-${new Date().toISOString().slice(0,10)}.xlsx`);
    this.toast('✓ Excel esportato — foglio «Valori ammessi» per la convalida', 'success');
  },

  async importArticlesCSV() {
    const raw = Validate.clean($('csvImportArea')?.value);
    if (!raw) return this.toast('Inserisci dati CSV', 'error');
    const lines = raw.split('\n').filter(Boolean);
    let count = 0, skipped = 0;
    for (const line of lines) {
      const [code, desc, cat] = line.split(';').map(s => (s || '').trim());
      const c = Validate.clean(code, true);
      const d = Validate.clean(desc);
      if (!c || !d || Validate.article(c) || Validate.articleDesc(d, true)) { skipped++; continue; }
      const ok = await Store.addArticle({ code: c, description: d, category: Validate.clean(cat, true) || 'MP' });
      if (ok) count++;
    }
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`${count} importati (${skipped} scartati)`, count > 0 ? 'success' : 'warning');
  },

  async confirmResetData() {
    if (!await Dialog.confirm({
      title: '\u26A0 Reset completo database',
      message: 'Tutti i dati (siti, zone, articoli, inventario, movimenti, quarantene, DDT pendenti) saranno eliminati.',
      confirmLabel: 'Procedi', danger: true
    })) return;
    if (!await Dialog.confirm({
      title: 'Operazione irreversibile',
      message: 'È consigliato ESPORTARE un backup prima di continuare.',
      confirmLabel: 'Resetta tutto', danger: true
    })) return;
    await Store.resetAll();
    /* TODO F1-REVIEW: resetAll() ricostruisce gia' gli indici al proprio
       interno, quindi questo riallineamento e' ridondante. Mantenuto per non
       alterare il comportamento in questa fase. */
    await Store.reloadCache();
    this.currentSite = null; this.currentZone = null;
    this._movSessionLog = []; this._pickCart = []; this._moveSelection = null; this._invState = null; this._qState = null; this._qStage = 'search'; this._movMode = null;
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast('✓ Database resettato — configurare nuovi siti da Configurazione', 'info');
  },
};
