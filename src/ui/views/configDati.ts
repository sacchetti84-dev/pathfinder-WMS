import { type Vista, $ } from './vista';
import { caricaExcel } from '../../modules/excel';
import { LOG_RETENTION_DAYS, LOG_RETENTION_MS, MOV, MOV_LABELS } from '../../core/costanti';
import { Persistence } from '../../core/persistence/index';
import { Store } from '../../core/store';
import type { Movimento, Articolo, Sito } from '../../types/entita';
import { Validate } from '../../modules/validate';
import { valoriAmmessi as valoriAmmessiUM } from '../../modules/misure';
import { totaleUom } from '../../modules/colli';
import {
  type Cella, type Foglio, type SommaUom,
  accumula, celleUom, distendiGiacenze, nuovaSomma,
} from '../../modules/fogli';
import {
  CERTIFICAZIONI, CLASSI_TEMPERATURA, leggiAllergeni, leggiCodici, scriviAllergeni,
  leggiCertificazioni, scriviCertificazioni, leggiClasseTemperatura, fogliValoriAmmessi,
} from '../../modules/anagrafica';
import { Dialog } from '../dialog';
import { Feedback } from '../feedback';


/* LE FORME DEGLI EXPORT.

   Un foglio Excel è una matrice di celle, e le tabelle qui sotto la
   costruiscono riga per riga. `Cella`, la somma delle UM e la distesa dei
   colli stanno in `modules/fogli.ts`: sono pure, e da qui non si potrebbero
   collaudare — questa vista si importa solo passando da `App`. */

/* Una riga di giacenza arricchita di dove sta: sito, zona, e i nomi
   leggibili che l'ubicazione da sola non porta. */
type GiacenzaEstesa = {
  siteName: string;
  zoneName: string;
  siteId: string;
  location_code: string;
  article_code: string;
  article_description: string;
  lot_code: string;
  qty: number;
  expiry_date: string;
  placed_at_str: string;
  last_updated_str: string;
  placed_by: string;
  notes: string;
  /** L'unità del lotto — quella congelata al primo posizionamento, non quella
      dell'anagrafica di oggi. Stringa vuota su una riga a soli colli. */
  uom: string;
  /** I colli uno per uno, come `Store.colliDiRiga` li legge: dall'elenco
      dichiarato dove c'è, dalla suddivisione della 1.7 dove no. `null` su un
      articolo senza unità, e allora il foglio conta colli e basta. */
  colli: number[] | null;
  /** Le UM totali della riga. `null` è un'assenza dichiarata: significa che
      di quella merce si sanno i colli e nient'altro. */
  uomTot: number | null;
};

/* Le righe che arrivano da un foglio Excel letto: intestazione → valore. */
type RigaFoglio = Record<string, string | number | undefined>;

export const VistaConfigDati = {
  _fmtUsage(est) {
    if (!est) return 'Non disponibile';
    const mb = (b: number | null | undefined) => ((b || 0) / 1048576).toFixed(1);
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
    const est = await Store.estimateUsage();
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
        <button class="btn btn-primary" onclick="App.exportData()" title="Scrive un file JSON con tutto il magazzino: giacenze, registro, quarantene, documenti, operatori e impostazioni">💾 Salva backup (JSON)</button>
        <button class="btn btn-accent" onclick="App.importData()" title="Rimette in questo database il contenuto di un backup JSON">♻ Recupera da backup (JSON)</button>
        <button class="btn btn-warning" onclick="App.exportMovLogExcel()">📊 Esporta Registro Movimenti (Excel)</button>
        <button class="btn btn-warning" onclick="App.exportGiacenzeExcel()" title="Esporta tutte le giacenze raggruppate per Site/Zona/Ubicazione">📦 Esporta Giacenze per Area (Excel)</button>
        <button class="btn btn-danger ml-auto" onclick="App.confirmResetData()">🗑 Reset completo DB</button>
      </div>
      <!-- 2.1 — LA PURGA NON C'È PIÙ, E LA FRASE QUI SOTTO È DIVENTATA VERA.
           Fino alla 2.0 «nessun record viene mai cancellato automaticamente»
           aveva un'eccezione a un clic di distanza: la purga manuale toglieva
           i movimenti oltre la soglia. Adesso non c'è nessuna strada, e la
           soglia resta quel che è sempre stata — la conservazione dichiarata,
           non un permesso di cancellare. -->
      <div class="bg-[var(--grad-soft-green)] border border-sx-success rounded-[var(--radius-md)] py-6 px-7.5 mt-6">
        <div class="font-bold text-body-small text-sx-success mb-3">🔒 Conservazione dei record</div>
        <p class="text-body-small text-sx-text-secondary leading-[1.5]">
          <strong>Nessun record viene mai cancellato, né automaticamente né a mano.</strong>
          Il registro movimenti è conservato per <strong>${LOG_RETENTION_DAYS} giorni (${Math.round(LOG_RETENTION_DAYS/365)} anni)</strong>
          ed è la firma GMP di chi ha mosso la merce; i record di <strong>non conformità</strong> non sono eliminabili in nessun caso.
          Per portare via i dati si usa <strong>Salva backup</strong> qui sopra, che non toglie niente da dove sta.
        </p>
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
    const est = await Store.estimateUsage();
    const opfsList = await Store.listOPFSBackups();
    const win = Store.getMovLogWindowInfo();
    const fmt = (ts: number | null | undefined) => ts ? new Date(ts).toLocaleString('it-IT') : 'mai';

    /* 2.1 — IL LIVELLO LO DICE DOVE STA IL DATABASE, non più quanto è
       fresca una copia in una cartella. La copia esterna era una funzione
       del browser su una cartella scelta a mano: il backup adesso è un
       compito del servizio, e questa scheda lo dice invece di farlo. */
    const livello = remoto ? 'ok' : (persist.granted ? 'warn' : 'bad');
    const bordo = livello === 'ok' ? 'var(--sx-success)' : livello === 'warn' ? 'var(--sx-warning)' : 'var(--sx-danger)';
    const titolo = livello === 'ok'
      ? '🛡 Il database vive nel servizio dati'
      : livello === 'warn'
        ? '⚠ Il database vive dentro questo browser'
        : '⛔ Database dentro il browser, senza archiviazione persistente';

    host.innerHTML = `<div class="config-card" style="border-left:4px solid ${bordo};margin-bottom:0.75rem">
      <h3 style="color:${bordo}">${titolo}</h3>

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
          <strong>La copia automatica è un compito del servizio</strong>: la scrive tutte le sere a caldo
          in <span class="mono">C:\\Pathfinder\\backup</span>, ed è un file di database che si rimette al suo posto
          da fuori — servizio fermo, file sostituito, servizio riavviato.
          <br><strong>Il salvataggio e il recupero a mano si fanno da qui</strong>, con i due pulsanti
          «Salva backup» e «Recupera da backup» della scheda Stato Database: quelli lavorano a servizio acceso e
          passano dall'applicativo, che sa cosa sta scrivendo.
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
          servono a rimediare a un errore recente, non a un disco che muore.
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
  },

  /* 2.2 — QUESTO E' IL SALVATAGGIO A MANO DEL BACKUP, non piu' «un export».
     La copia automatica la scrive il servizio tutte le sere, ed e' un file di
     database che si rimette al suo posto da fuori: servizio fermo, file
     sostituito, servizio riavviato. Questa invece si fa a servizio acceso, da
     dentro l'applicativo, e la rimette dentro il pulsante qui accanto.

     IL NOME DEL FILE DICE CHE COS'E' E DI QUANDO E'. `warehouse-mapper-2026-08-20`
     erano il nome di un applicativo che non si chiama piu' cosi' e una data
     senza ora: due backup dello stesso giorno si sovrascrivevano nella
     cartella dei download, e il secondo vinceva senza dirlo. */
  async exportData() {
    const data = await Store.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const t = new Date();
    const due = (n: number) => String(n).padStart(2, '0');
    a.download = `pathfinder-backup-${t.getFullYear()}-${due(t.getMonth() + 1)}-${due(t.getDate())}-${due(t.getHours())}${due(t.getMinutes())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await Store.markSaved();
    this.updateSyncIndicator();
    const righe = Object.values<number>(Store._countsOf(data) as Record<string, number>)
      .reduce((somma, n) => somma + n, 0);
    this.toast(`✓ Backup salvato — ${righe.toLocaleString('it-IT')} record in ${a.download}`, 'success');
  },

  importData() { $('fileImport').click(); },

  /* Checkpoint condiviso. Rilancia l'errore: chi chiama decide come vestirlo. */
  async _saveCheckpoint() {
    try {
      const result = await Store.forceSave();
      const ts = new Date(result.ts).toLocaleString('it-IT');
      const total = Object.values<number>(result.counts as Record<string, number>).reduce((s, n) => s + n, 0);
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
    } catch (err) {
      console.error('[WM] forceSave error:', err);
      this.toast(`Errore salvataggio: ${(err as Error).message}`, 'error');
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
      const contenuto = Object.entries<number>(Store._countsOf(data))
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
        /* 2.2 — QUI SI RECUPERA UN BACKUP, e la scelta principale è quella.
           Fino a stamattina il pulsante si chiamava «Importa da JSON» e
           proponeva per primo il MERGE: giusto per chi porta dentro
           l'anagrafica di un altro magazzino, sbagliato per chi ha in mano il
           backup di QUESTO e vuole tornare a com'era. Il merge, su un
           ripristino, lascia in piedi tutto quello che è successo dopo il
           backup e ci appoggia sopra i dati vecchi: il risultato non è né
           prima né dopo, ed è la miscela che nessuno sa più leggere.

           Il ripristino resta a due conferme, e la seconda dice cosa sparisce
           adesso — contato dal database, non dal file. */
        const scelta = await Dialog.confirm({
          title: 'Recupera da backup',
          message: 'Il RIPRISTINO riporta il magazzino esattamente allo stato del file: giacenze, registro, ' +
                   'quarantene, documenti, operatori e impostazioni. Quello che è stato fatto dopo quel backup ' +
                   'non c’è più.\n\n' +
                   'Se invece il file viene da un ALTRO magazzino e serve solo aggiungere quello che qui non ' +
                   'c’è, la strada è il merge: sta in «Altre opzioni».',
          details: Dialog.kv([
            ['File', file.name],
            ['Scritto il', String(data._exported || '—').slice(0, 16).replace('T', ' ')],
            ['Contenuto', contenuto],
          ]),
          confirmLabel: 'RIPRISTINA tutto', cancelLabel: 'Altre opzioni…', danger: true, icon: '\u267B'
        });
        if (scelta === true) {
          const adesso = `giacenze ${Store.getInventoryCount()} · movimenti ${Store.getMovLogTotal().toLocaleString('it-IT')} · operatori ${Store.getOperators().length}`;
          if (await Dialog.confirm({
            title: 'Confermi il ripristino?',
            message: 'Il contenuto attuale di questo database viene eliminato e sostituito con quello del file. ' +
                     'Operazione irreversibile: se il magazzino di adesso serve ancora, si salva PRIMA un backup ' +
                     'con il pulsante «Salva backup».',
            details: Dialog.kv([['Adesso a database', adesso], ['Nel file', contenuto]]),
            confirmLabel: 'RIPRISTINA, ho un backup di adesso', danger: true
          }) === true) mode = 'overwrite';
        } else if (scelta === false) {
          if (await Dialog.confirm({
            title: 'Importare solo una parte?',
            message: 'Modalità MERGE: aggiunge solo siti, zone, articoli e giacenze non già presenti, senza ' +
                     `toccare i dati esistenti.\n\nIl merge NON importa ${NON_PORTATE}.`,
            confirmLabel: 'Importa in MERGE'
          }) === true) mode = 'merge';
        }
      }
      if (mode) {
        await Store.importAll(data, mode);
        this.currentSite = null; this.currentZone = null;
        this.renderSidebar(); this.renderDashboard(); this.renderConfig();
        this.updateSyncIndicator();
        this.toast(mode === 'overwrite'
          ? '✓ Backup ripristinato: il magazzino è quello del file'
          : '✓ Dati importati in merge', 'success');
      }
    } catch (err) {
      this.toast(`Errore import: ${(err as Error).message}`, 'error');
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
    const log: Movimento[] = [];
    await Store.eachMovement(rows => { for (const r of rows) log.push(r); });
    log.sort((a, b) => b.ts - a.ts);
    if (!log.length) return this.toast('Nessuna movimentazione da esportare', 'error');

    /* IL SALDO IN UM NON ESISTE, IL MOVIMENTO IN UM SÌ.
       Un movimento porta `qty_uom_delta` e la sua unità: quanto si è mosso, e
       di che cosa. Il prima e il dopo in UM non sono mai stati scritti, e
       ricostruirli risalendo la catena darebbe un numero plausibile e falso
       su ogni riga storica — che è il difetto peggiore di tutti. Due colonne,
       quindi, e non cinque: vuote sui movimenti a soli colli. */
    const headers = ['#', 'Tipo', 'Codice', 'Descrizione', 'Lotto', 'Ubicazione', 'Destinazione', 'Coll. Prima', 'Delta', 'Coll. Dopo', 'Delta UM', 'UM', 'Operatore', 'Ordine/Doc', 'Note', 'Data', 'Ora'];
    const rows = log.map((m, i) => {
      const ts = m.ts ? new Date(m.ts) : null;
      // v1.7.0 — colonne qty: null per movimenti pre-v1.7.0 (storici)
      const qBefore = (typeof m.qty_before === 'number') ? m.qty_before : '';
      const qDelta  = (typeof m.qty_delta  === 'number') ? m.qty_delta  : '';
      const qAfter  = (typeof m.qty_after  === 'number') ? m.qty_after  : '';
      const uDelta  = (typeof m.qty_uom_delta === 'number') ? m.qty_uom_delta : '';
      return [
        i+1, MOV_LABELS[m.type] || m.type,
        m.article_code || '', m.article_description || '', m.lot_code || '',
        m.location_code || '', m.dest_location || '',
        qBefore, qDelta, qAfter,
        uDelta, uDelta === '' ? '' : (m.uom || ''),
        m.user || '', m.doc_ref || '', m.notes || '',
        ts ? ts.toLocaleDateString('it-IT') : '', ts ? ts.toLocaleTimeString('it-IT') : ''
      ];
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{wch:5},{wch:20},{wch:18},{wch:32},{wch:15},{wch:18},{wch:18},{wch:10},{wch:8},{wch:10},{wch:11},{wch:7},{wch:16},{wch:14},{wch:20},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, 'Registro');

    // Foglio 2 — Riepilogo per tipo
    const typeSum: Record<string, number> = {};
    for (const m of log) typeSum[m.type] = (typeSum[m.type] || 0) + 1;
    const sumRows: Foglio = [['Tipo', 'Quantità', '% Totale']];
    for (const [t, c] of Object.entries(typeSum).sort((a,b)=>b[1]-a[1])) sumRows.push([MOV_LABELS[t as keyof typeof MOV_LABELS] || t, c, Math.round(c/log.length*100)+'%']);
    sumRows.push(['TOTALE', log.length, '100%']);
    const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
    ws2['!cols'] = [{wch:24},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo Tipo');

    // Foglio 3 — Riepilogo giornaliero
    const daily: Record<string, Record<string, number>> = {};
    for (const m of log) {
      const d = m.ts ? new Date(m.ts).toISOString().slice(0,10) : 'N/A';
      if (!daily[d]) daily[d] = { tot:0, IN:0, OUT:0, MOVE:0, PICK:0, REPOS:0, FIX:0, QUAR:0, RET:0, SHIP:0, EDIT:0 };
      daily[d]!.tot!++;
      const k = m.type === 'FIX+' || m.type === 'FIX-' ? 'FIX' : (m.type === 'QREL' ? 'QUAR' : m.type);
      daily[d]![k] = (daily[d]![k] || 0) + 1;
    }
    // v2.0 — colonne RET, SHIP, EDIT aggiunte al riepilogo giornaliero
    const dRows: Foglio = [['Data','Totale','Posizionamenti','Smaltimenti','Cambi','Prelievi','Riposizion.','Correzioni','Quarantene','Resi','Spedizioni','Modifiche']];
    for (const [d, v] of Object.entries(daily).sort()) {
      dRows.push([d !== 'N/A' ? new Date(d).toLocaleDateString('it-IT') : d, v.tot, v.IN, v.OUT, v.MOVE, v.PICK, v.REPOS, v.FIX, v.QUAR, v.RET || 0, v.SHIP || 0, v.EDIT || 0]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(dRows);
    ws3['!cols'] = [{wch:14},{wch:8},{wch:16},{wch:14},{wch:10},{wch:10},{wch:14},{wch:12},{wch:12},{wch:8},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws3, 'Riepilogo Giornaliero');

    // Foglio 4 — Top articoli
    /* Le UM movimentate si contano in VALORE ASSOLUTO: un carico da 500 e uno
       scarico da 500 sono mille chili che hanno attraversato il magazzino, non
       zero. È la stessa lettura del conteggio dei movimenti, che sta accanto. */
    const artFreq: Record<string, { desc: string; count: number; last: number; uom: SommaUom }> = {};
    for (const m of log) {
      if (!m.article_code) continue;
      if (!artFreq[m.article_code]) artFreq[m.article_code] = { desc: m.article_description || '', count: 0, last: m.ts, uom: nuovaSomma() };
      artFreq[m.article_code]!.count++;
      if (typeof m.qty_uom_delta === 'number') accumula(artFreq[m.article_code]!.uom, m.uom || '', Math.abs(m.qty_uom_delta));
      if (m.ts > artFreq[m.article_code]!.last) { artFreq[m.article_code]!.last = m.ts; if (m.article_description) artFreq[m.article_code]!.desc = m.article_description; }
    }
    const tRows: Foglio = [['Rank','Codice','Descrizione','N° Movimenti','UM Movimentate','UM','Ultima Movimentazione']];
    Object.entries(artFreq).sort((a,b) => b[1].count - a[1].count).forEach(([c, v], i) => {
      const [tot, unita] = celleUom(v.uom);
      tRows.push([i+1, c, v.desc, v.count, tot, unita, v.last ? new Date(v.last).toLocaleDateString('it-IT') : '']);
    });
    const ws4 = XLSX.utils.aoa_to_sheet(tRows);
    ws4['!cols'] = [{wch:6},{wch:20},{wch:32},{wch:16},{wch:16},{wch:7},{wch:22}];
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
    const siteByCode: Record<string, Sito> = {};
    const zoneByLoc: Record<string, { siteId: string; siteName: string; zoneId: string; zoneName: string }> = {};
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
      /* Le UM si leggono da dove le legge tutto il resto dell'applicativo:
         `Store`, che conosce la confezione congelata sul lotto. Rifarle qui
         vorrebbe dire un secondo saldo, e due saldi della stessa riga sono
         due numeri diversi il giorno che divergono. */
      const cfg = Store.getUomConfig(it.article_code, it.lot_code);
      const uom = cfg?.uom || '';
      const colli = Store.colliDiRiga(it);
      const uomTot = colli ? totaleUom(colli, uom)
                   : (typeof it.qty_uom === 'number' ? it.qty_uom : null);
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
        placed_by: it.placed_by || '',
        uom,
        colli,
        uomTot: uom ? uomTot : null
      };
    });

    const wb = XLSX.utils.book_new();
    /* UN COLLO, UNA RIGA.
       Fino alla 2.0 il foglio dava una riga per lotto e una colonna «Coll.»
       col conto: con colli tutti diversi — 10 × 1.000 + 1 × 900 — quel conto
       non dice quanta merce c'è, e le UM non c'erano affatto. Adesso ogni
       collo ha la sua riga, e le due somme che chi apre il file vuole fare
       tornano da sole: contare le righe dà i colli, sommare «UM Collo» dà le
       UM. Nessuna cella ripete un totale di riga — un totale ripetuto su
       undici righe è un numero che chi trascina la somma conta undici volte.

       La riga senza elenco (articolo senza unità) esce lo stesso, una per
       collo, con le due celle delle UM vuote: è un'assenza dichiarata. */
    const headers = ['Site', 'Zona', 'Ubicazione', 'Articolo', 'Descrizione', 'Lotto', 'Collo', 'UM Collo', 'UM', 'Scadenza', 'Posizionato il', 'Ultimo agg.', 'Operatore', 'Note'];
    const colWidths = [{wch:18},{wch:18},{wch:18},{wch:18},{wch:32},{wch:15},{wch:9},{wch:11},{wch:7},{wch:12},{wch:14},{wch:14},{wch:16},{wch:25}];
    /* LA RIGA CHE NON STA NEL FOGLIO ESCE LO STESSO, UNA SOLA.
       Un foglio di Excel tiene 1.048.576 righe, e SheetJS lo tiene in
       memoria come un oggetto con UNA CHIAVE PER CELLA: oltre quel muro non
       c'è un export più grande, non c'è export — il 20/08 una giacenza con
       3.501.794 al posto dei colli faceva morire l'intero file con «too many
       properties to enumerate», un messaggio che della riga non diceva
       niente. Così invece il file esce, e chi lo apre trova scritto dove
       andare a guardare.

       Il conto è di TUTTE le righe insieme e non di una: duecento righe da
       diecimila colli sono duemilioni di righe, ognuna innocente e il foglio
       morto lo stesso. Lo tiene `distendiGiacenze`. */
    const stendi = (list: GiacenzaEstesa[]): Cella[][] => {
      const distese = distendiGiacenze(list, (e) => ({ colli: e.colli, qty: e.qty }));
      return list.flatMap((e, k) => {
        const misure = distese[k];
        if (!misure) {
          return [[
            e.siteName, e.zoneName, e.location_code, e.article_code, e.article_description, e.lot_code,
            `${e.qty} ?`, '', '',
            e.expiry_date, e.placed_at_str, e.last_updated_str, e.placed_by,
            `⚠ ${e.qty} coll. su una riga sola: non ci stanno in un foglio Excel, `
              + 'e la riga non è stata distesa per collo. Da verificare con una Conta'
              + (e.notes ? ` — ${e.notes}` : ''),
          ]];
        }
        return misure.map((q, i) => [
          e.siteName, e.zoneName, e.location_code, e.article_code, e.article_description, e.lot_code,
          `${i + 1}/${misure.length}`, q === null ? '' : q, q === null ? '' : e.uom,
          e.expiry_date, e.placed_at_str, e.last_updated_str, e.placed_by, e.notes,
        ]);
      });
    };

    // FOGLIO 1 — Riepilogo per Site
    const siteSummary: Record<string, { lotti: number; colli: number; uom: SommaUom; articoli: Set<string>; ubicazioni: Set<string> }> = {};
    enriched.forEach(e => {
      if (!siteSummary[e.siteName]) siteSummary[e.siteName] = { lotti: 0, colli: 0, uom: nuovaSomma(), articoli: new Set(), ubicazioni: new Set() };
      const s = siteSummary[e.siteName]!;
      s.lotti++;
      s.colli += e.qty;
      accumula(s.uom, e.uom, e.uomTot);
      s.articoli.add(e.article_code);
      s.ubicazioni.add(e.location_code);
    });
    const sumRows: Foglio = [['Site', 'N° Lotti', 'Colli Totali', 'UM Totali', 'UM', 'Articoli Univoci', 'Ubicazioni Occupate']];
    let totLotti = 0, totColli = 0;
    const totUom = nuovaSomma();
    Object.entries(siteSummary).sort().forEach(([name, s]) => {
      const [tot, unita] = celleUom(s.uom);
      sumRows.push([name, s.lotti, s.colli, tot, unita, s.articoli.size, s.ubicazioni.size]);
      totLotti += s.lotti; totColli += s.colli;
      s.uom.unita.forEach(u => totUom.unita.add(u));
      totUom.tot += s.uom.tot;
    });
    const [totGenUom, totGenUnita] = celleUom(totUom);
    sumRows.push(['TOTALE GENERALE', totLotti, totColli, totGenUom, totGenUnita, '', '']);
    const wsSum = XLSX.utils.aoa_to_sheet(sumRows);
    wsSum['!cols'] = [{wch:24},{wch:12},{wch:14},{wch:14},{wch:8},{wch:18},{wch:20}];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Riepilogo');

    // FOGLIO 2 — Tutto Flat (per filtri Excel nativi)
    const allSorted = enriched.slice().sort((a,b) => {
      if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName);
      if (a.zoneName !== b.zoneName) return a.zoneName.localeCompare(b.zoneName);
      if (a.location_code !== b.location_code) return a.location_code.localeCompare(b.location_code);
      return a.article_code.localeCompare(b.article_code);
    });
    const righeAll = stendi(allSorted);
    const wsAll = XLSX.utils.aoa_to_sheet([headers, ...righeAll]);
    wsAll['!cols'] = colWidths;
    wsAll['!autofilter'] = { ref: `A1:N${righeAll.length + 1}` };
    XLSX.utils.book_append_sheet(wb, wsAll, 'Tutte le Giacenze');

    // FOGLI 3..N — uno per Site
    const bySite: Record<string, GiacenzaEstesa[]> = {};
    enriched.forEach(e => { (bySite[e.siteName] ||= []).push(e); });
    Object.entries(bySite).sort().forEach(([siteName, list]) => {
      list.sort((a, b) => {
        if (a.zoneName !== b.zoneName) return a.zoneName.localeCompare(b.zoneName);
        if (a.location_code !== b.location_code) return a.location_code.localeCompare(b.location_code);
        return a.article_code.localeCompare(b.article_code);
      });
      const righeSito = stendi(list);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...righeSito]);
      ws['!cols'] = colWidths;
      ws['!autofilter'] = { ref: `A1:N${righeSito.length + 1}` };
      // Excel limita nomi foglio a 31 char e vieta certi caratteri
      const sheetName = siteName.replace(/[\\/?*\[\]:]/g, '').slice(0, 31) || 'Site';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // FOGLIO FINALE — Pivot Articoli (somma colli per articolo trasversale)
    const byArt: Record<string, { desc: string; totColli: number; uom: SommaUom; lotti: Set<string>; ubicazioni: Set<string>; siti: Set<string> }> = {};
    enriched.forEach(e => {
      if (!byArt[e.article_code]) byArt[e.article_code] = { desc: e.article_description, totColli: 0, uom: nuovaSomma(), lotti: new Set(), ubicazioni: new Set(), siti: new Set() };
      const a = byArt[e.article_code]!;
      a.totColli += e.qty;
      accumula(a.uom, e.uom, e.uomTot);
      a.lotti.add(e.lot_code);
      a.ubicazioni.add(e.location_code);
      a.siti.add(e.siteName);
    });
    const pivotRows: Foglio = [['Articolo', 'Descrizione', 'Colli Totali', 'UM Totali', 'UM', 'N° Lotti', 'N° Ubicazioni', 'Site Coinvolti']];
    Object.entries(byArt).sort((a,b) => b[1].totColli - a[1].totColli).forEach(([code, a]) => {
      const [tot, unita] = celleUom(a.uom);
      pivotRows.push([code, a.desc, a.totColli, tot, unita, a.lotti.size, a.ubicazioni.size, [...a.siti].join(', ')]);
    });
    const wsPivot = XLSX.utils.aoa_to_sheet(pivotRows);
    wsPivot['!cols'] = [{wch:18},{wch:34},{wch:14},{wch:14},{wch:8},{wch:10},{wch:14},{wch:30}];
    XLSX.utils.book_append_sheet(wb, wsPivot, 'Pivot Articoli');

    const fn = `giacenze-${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fn);
    this.toast(`📊 Esportato: ${fn} (${righeAll.length} colli su ${enriched.length} lotti, ${Object.keys(bySite).length + 3} fogli)`, 'success');
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
    } catch (err) { this.toast(`Errore Excel: ${(err as Error).message}`, 'error'); }
    event.target.value = '';
  },

  /* Dal foglio alle righe da scrivere. Nessuna scrittura qui dentro: legge,
     valida e racconta. Le colonne assenti restano `undefined`, che a valle
     significa «non toccare», non «azzera». */
  _leggiFoglioArticoli(rows: RigaFoglio[]) {
    const righe: Partial<Articolo>[] = [];
    const problemi: string[] = [];
    let senzaCodice = 0;
    const nuoviCodici = new Set();
    let conAllergeni = 0, conTemperatura = 0, conCertificazioni = 0;

    rows.forEach((row, i) => {
      const foglio = i + 2;                      // +1 intestazione, +1 base uno
      const code = Validate.clean(row['Codice'], true);
      if (!code) { senzaCodice++; return; }
      const errCode = Validate.article(code);
      if (errCode) { problemi.push(`Riga ${foglio} — codice "${code}": ${errCode}`); return; }

      const esiste = !!Store.getArticle(code);
      const rec: Record<string, unknown> = { code };
      const testo = (col: string, campo: string, upper = false) => {
        if (row[col] === undefined) return;
        rec[campo] = Validate.clean(row[col], upper);
      };
      const numero = (col: string, campo: string) => { if (row[col] !== undefined) rec[campo] = row[col]; };

      testo('Descrizione', 'description');
      testo('Categoria', 'category');   // 2.1 — si prende com'e' scritta
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
        const errDesc = Validate.articleDesc(rec.description as string, !esiste);
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
      const ok = await Store.addArticle({ code: c, description: d, category: Validate.clean(cat) || 'MP' });
      if (ok) count++;
    }
    this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`${count} importati (${skipped} scartati)`, count > 0 ? 'success' : 'warning');
  },

  /* 2.1 — IL RESET È DELL'ADMIN, E CHIEDE IL SUO PIN.

     Due conferme a schermo le clicca chiunque abbia in mano il terminale
     nel momento sbagliato: il PIN è l'unico passaggio che pretende una
     persona, e finisce a registro con la sigla di quella persona. Il varco
     sta in fondo apposta — prima l'operatore ha letto cosa sparisce. */
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
    const admin = await this._requireLeaderAuth('Reset completo del database', { soloAdmin: true });
    if (!admin) return;
    await Store.resetAll();
    /* TODO F1-REVIEW: resetAll() ricostruisce gia' gli indici al proprio
       interno, quindi questo riallineamento e' ridondante. Mantenuto per non
       alterare il comportamento in questa fase. */
    await Store.reloadCache();
    this.currentSite = null; this.currentZone = null;
    this._movSessionLog = []; this._pickCart = []; this._moveSelection = null; this._invState = null; this._qState = null; this._qStage = 'search'; this._movMode = null;
    this.renderSidebar(); this.renderDashboard(); this.renderConfig();
    this.updateSyncIndicator();
    this.toast(`✓ Database resettato da ${admin.initials} — configurare nuovi siti da Configurazione`, 'info');
  },
} satisfies Vista;
