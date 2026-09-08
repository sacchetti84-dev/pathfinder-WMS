import { MOV, MOV_LABELS } from '../core/costanti';
import { debounce, _h } from '../core/utils';
import { Persistence } from '../core/persistence/index';
import type { RemotePersistence } from '../core/persistence/index';
import { Validate } from '../modules/validate';
import { pickupAlertStatus } from '../modules/pickupAlert';
import { Auth } from '../modules/auth';
import { Session } from '../modules/session';
import { Feedback } from './feedback';
import { Dialog } from './dialog';
import { Tabs } from './tabs';
import { ico, type Icona } from './icone';
import { classifica, classeCSS, classiPossibili, eAndroid, LARGHEZZA_TERMINALE, LARGHEZZA_TAVOLETTA } from '../modules/dispositivo';
import type { ClasseDispositivo } from '../modules/dispositivo';
import { stato as statoChiosco, type StatoChiosco } from '../modules/chiosco';
import { TASTI_FUNZIONE } from '../modules/cruscotto';
import { Store } from '../core/store';
import { rettifica as rettificaColli } from '../modules/colli';
import { accendi as accendiMaiuscole } from '../modules/maiuscole';
import type { Operatore } from '../types/entita';

/* IL CAMPO CHE LA MASCHERA HA APPENA DISEGNATO.

   E' l'aiuto che nelle viste si chiama `$`. `getElementById` restituisce
   `HTMLElement | null`, e questi punti leggono `.value`, `.disabled`,
   `.selectionStart` da un campo che hanno disegnato loro.

   `campo` non promette che ci sia — chi lo chiama si guarda come si
   guardava prima. `nodo` dice che c'e' perche' sta scritto in
   `index.html`: se sparisse di la', la riga esplode adesso come
   esplodeva ieri. */
const campo = (id: string) => document.getElementById(id) as HTMLInputElement | null;
const pulsante = (id: string) => document.getElementById(id) as HTMLButtonElement | null;
const nodo = (id: string) => document.getElementById(id) as HTMLElement;

/* L'avviso che arriva dal servizio quando ha scritto qualcun altro, e la
   voce dell'annulla: due forme che vivono in memoria e in nessun
   database. */
type AvvisoCambio = { collections?: string[] };

type AzioneAnnulla = {
  op: 'add' | 'remove';
  loc: string;
  art: string;
  lot: string;
  qty: number;
  desc?: string;
  exp?: string;
  notes?: string;
  qty_uom?: number | null;
  packs?: number[] | null;
  /** 2.0 — l'elenco COM'ERA prima dell'operazione. Rimettere a posto un
      collo aperto non è aggiungerne uno: prelevando 10 KG da un collo da 25
      e stornando, `addItem` accodava un collo NUOVO da 10 e lo scaffale
      passava da tre colli a quattro. Il totale tornava — 56 KG prima, 56
      dopo — e l'elenco no, che è la forma peggiore di un saldo sbagliato:
      quella che si scopre contando. Con questo, lo storno RIDICHIARA la
      riga com'era, e la differenza la traduce `rettifica` — la stessa
      strada dell'inventario e della conta. */
  packs_prima?: number[] | null;
};

type VoceAnnulla = { label: string; actions: AzioneAnnulla[]; ts: number };

import { VistaDestinatari } from './views/destinatari';
import { VistaParametri } from './views/parametri';
import { VistaCompiti } from './views/compiti';
import { VistaCampionamento } from './views/campionamento';
import { VistaMovimenta } from './views/movimenta';
import { VistaPosiziona } from './views/posiziona';
import { VistaSmaltimento } from './views/smaltimento';
import { VistaPrelievo } from './views/prelievo';
import { VistaPercorso } from './views/percorso';
import { VistaRapportoPrelievo } from './views/rapportoPrelievo';
import { VistaInventario } from './views/inventario';
import { VistaUdc } from './views/udc';
import { VistaProdottoFinito } from './views/prodottoFinito';
import { VistaCaricoSpedizione } from './views/caricoSpedizione';
import { VistaWip } from './views/wip';
import { VistaQuarantena } from './views/quarantena';
import { VistaSpedizioni } from './views/spedizioni';
import { VistaDocumento } from './views/documento';
import { VistaMappa } from './views/mappa';
import { VistaGiacenze } from './views/giacenze';
/* 2.19 — la maschera che sta fra il pulsante e l'etichetta. In un file suo
   perche' la chiamano in due — l'unita' di carico e la merce — e la stessa
   domanda fatta in due modi sarebbe la stessa domanda imparata due volte. */
import { VistaStampaEtichette } from './views/stampaEtichette';
import { VistaConfigOperatori } from './views/configOperatori';
import { VistaConfigSiti } from './views/configSiti';
import { VistaConfigArticoli } from './views/configArticoli';
import { VistaConfigDati } from './views/configDati';
import { VistaConfigurazione } from './views/configurazione';
import { VistaCruscotto } from './views/cruscotto';
import { VistaRegistro } from './views/registro';
import { VistaArchivio } from './views/archivio';
import { VistaRicerca } from './views/ricerca';

/* IL MONOLITE E' PIU' GRANDE DI QUESTO FILE.

   `App` e' un oggetto solo, ma meta' dei suoi metodi arriva dalle
   venticinque viste, che rientrano con l'assegnazione in coda al file. Un
   `this.renderConfig()` scritto qui dentro chiama codice che sta in
   `views/configurazione.ts`, e `tsc` da solo non puo' saperlo.

   Questo elenco e' il ponte: dice quali nomi delle viste passano di qua e
   con che forma. Non e' il contratto delle viste — quello nasce in fase B —
   ed e' scritto stretto apposta: se una vista cambia una firma, il primo a
   dirlo e' questo file.

   Le quattro proprieta' in fondo non sono di nessuna vista: nascono a
   runtime dentro i metodi che le usano, e nell'oggetto letterale non ci
   sono mai state. */
interface DalleViste {
  renderDashboard(): void;
  renderTasks(): void;
  renderMap(): void;
  renderMovimenta(): void;
  renderConfig(): void;
  renderArchive(): void;
  renderDetail(code: string): void;
  cancelMov(): void;
  closeSearchPop(): void;
  exportData(): Promise<void>;
  startMov(mode: string, dir?: string | null): void;
  _goOp(mode: string, sub?: string | null): void;
  _prepAvvia(t: unknown): Promise<void>;
  _odpAvvia(t: unknown): Promise<void>;
  _routeLeggiFile(file: File): Promise<void>;
  _formSpedizioni(el: HTMLElement): void;
  _checkPendingPickSession(): Promise<void>;
  _flushRecoveryQueue(): Promise<void>;
  _renderRecoveryBanner(): void;
  _recoveryQueue(): unknown[];
  _saveCheckpoint(): Promise<void>;
  _onReadOnlyChange(readOnly: boolean): void;
  _blockedByReadOnly(): boolean;
  _refreshSessionLog(): void;
  _logMov(
    type: string, art: string, desc: string, lot: string, loc: string,
    destLoc?: string | null, user?: string, notes?: string, docRef?: string,
    qtyBefore?: number | null, qtyDelta?: number | null, qtyAfter?: number | null,
    qtyUomDelta?: number | null,
  ): Promise<void>;

  /* 2.13 — vive in `configOperatori`, ma la chiamano anche il wizard del
     primo Admin e la maschera del ripristino: la superficie condivisa è
     questa, e un metodo che due file chiamano va dichiarato qui. */
  _mostraCodiceRipristino(
    op: Operatore | null | undefined, codice: string, opzioni?: { nuovo?: boolean },
  ): void;

  _svcBeat: ReturnType<typeof setInterval> | undefined;
  _resyncPending: Set<string> | undefined;
  _resyncTimer: ReturnType<typeof setTimeout> | undefined;
  _lastTextValue: string | undefined;
}

/* `ThisType` e' l'unico modo di dire "dentro questi metodi `this` e' anche
   quello": l'oggetto letterale resta scritto com'era, e nessuna riga porta
   un cast. */
function monolite<T extends object>(corpo: T & ThisType<T & DalleViste>): T & DalleViste {
  return corpo as T & DalleViste;
}

const App = monolite({
  currentView: 'dashboard',
  currentSite: null as string | null,
  currentZone: null as string | null,
  currentLevel: 'T',
  selectedLocation: null as string | null,
  mapViewMode: 'plan',
  _showRegistry: false,
  _movMode: null,
  _movSessionLog: [],       // mov della sessione corrente per pannello "Registro Sessione"
  /* 1.4.2.1 — il compito che ha aperto la maschera aperta adesso.
     { task_id, type, payload, movs: [_id] } — `movs` si riempie da `_logMov`
     e si svuota a ogni avanzamento registrato. Fuori da qui non esiste: e'
     lo stato di UNA sessione di lavoro, non un dato. */
  _taskRun: null,
  // === v3.0.0 [M1] — Carico / Scarico unificati ===
  _ioMode: 'in',            // 'in' (posiziona) | 'out' (smaltisci)
  _dispStage: 'search',     // 'search' | 'verify' — stadio del solo scarico
  _dispState: null,         // { location_code, item_key, article_code, lot_code, qty_available,
                            //   alternatives:[], scan:{loc,art,lot}, forced_note, reason_id, reason_label }
  _invState: null,
  /* v1.1.0 [N4] — La quarantena ha ora due tappe come lo scarico:
     _qStage vale 'search' o 'verify', _qState e' la tappa in corso. */
  _qState: null,
  _qStage: 'search',
  _pickCart: [],
  _moveSelection: null,
  _pickSubMode: 'cambio',
  /* 2.23 — Spedizioni ha due schede: il documento e il camion. */
  _shipSubMode: 'documenti',
  _prodPickStartTime: null,
  _prodOrderNum: '',
  _prodOperator: '',
  _shipCart: [],               // [{ article_code, article_description, lot_code, location_code, item_key, qty, qty_at_creation, expiry_date, notes }]
  _shipState: null,            // Stato corrente lookup: { item, availableQty, totalQty, pendingQty }
  _shipStartTime: null,        // Timer inizio sessione (per report)
  // ── documento ──
  _shipCausale: '',            // id della causale di trasporto → decide MOV.RET o MOV.SHIP
  _shipDdtNum: '',             // N° del documento
  _shipDocDate: '',            // Data del documento (ISO)
  _shipOrderRef: '',           // Riferimento a ordine / commessa / DDT di origine
  /* 2.20 — l'ubicazione di arrivo, sulle sole causali di conto terzi. */
  _shipDestLocation: '',
  // ── destinatario ──
  _shipCustomer: '',           // Denominazione del destinatario
  _shipDestAddress: '',        // Indirizzo
  _shipDestZip: '',            // CAP
  _shipDestCity: '',           // Comune
  _shipDestProvince: '',       // Sigla provincia
  _shipDestVat: '',            // Partita IVA / codice fiscale
  _shipShipTo: '',             // Luogo di destinazione, se diverso dalla sede
  // ── trasporto ──
  _shipCarrier: '',            // Vettore
  _shipTrasporto: '',          // Trasporto a cura di: Mittente | Destinatario | Vettore
  _shipPorto: '',              // Franco | Assegnato
  _shipAspetto: '',            // Aspetto esteriore dei beni (bancali, cartoni…)
  _shipStartTransport: '',     // Data e ora di inizio trasporto
  _shipExpectedDate: '',       // v2.0.0+ — Data di ritiro prevista (ISO YYYY-MM-DD)
  // ── pesi e note ──
  _shipPesoNetto: '',          // Sovrascrive il calcolo da anagrafica, se compilato
  _shipPesoLordo: '',          // Netto + tara imballi: in anagrafica non c'è
  _shipDocNotes: '',           // Annotazioni riportate in fondo al DDT
  _configTab: 'sites',
  _artFilter: '',
  _artSort: 'code_asc',
  _editingSiteId: null,

  currentOperator: null as string | null,          // es. "AS", "MR" — popolato al login
  currentOperatorRecord: null as Operatore | null, // v2.7.0 — record completo dell'anagrafica
  _OPERATOR_KEY: 'wm_current_operator', // chiave localStorage (NON è token, solo iniziali)
  _KNOWN_OPERATORS_KEY: 'wm_known_operators', // v2.7.0: sigle storiche, solo per la migrazione
  _MIGRATED_KEY: 'wm_operators_migrated',     // v2.7.0: la migrazione avviene una volta sola

  _scannerLayoutFix: true,
  _SCANNER_FIX_KEY: 'wm_scanner_fix',

  _wireRemote() {
    if (Persistence.kind !== 'remote') return;
    /* Oltre questa riga l'adapter e' quello remoto, ed e' l'unico che ha i
       ganci del servizio: il contratto comune non li porta. */
    const remoto = Persistence as typeof RemotePersistence;

    remoto._onOffline = (err) => {
      if (err) this._showServiceDown(err);
      else this._hideServiceDown();
    };

    remoto._onChange = (ev) => this._scheduleResync(ev as AvvisoCambio);

    /* 2.11 — LA SESSIONE E' CADUTA MENTRE SI LAVORAVA. Succede per due
       ragioni, e tutte e due sono normali: il servizio e' stato riavviato —
       un aggiornamento, una riaccensione della macchina — oppure qualcuno ha
       premuto «Blocca» su un'altra scheda di questo stesso terminale.

       Non e' un guasto e non e' un errore che l'operatore possa risolvere
       leggendolo: si riapre la maschera dell'identificazione, che e' l'unica
       cosa che serve. `_gateOpen` fa da guardia — venti chiamate che
       tornano 401 insieme non devono disegnare venti maschere. */
    remoto._onSenzaSessione = () => {
      if (this._gateOpen) return;
      this.currentOperator = null;
      this.currentOperatorRecord = null;
      this._renderOperatorBadge();
      this._openIdentityGate({ initial: true, reason: 'La sessione è scaduta: identificati di nuovo.' });
    };

    this._svcBeat = setInterval(async () => {
      try { await remoto._call('GET', '/api/health'); } catch {}
    }, 20000);
  },

  /* Riallineamento accorpato: molti avvisi ravvicinati fanno UNA
     rilettura, non una ciascuno. */
  _scheduleResync(ev: AvvisoCambio | null) {
    this._resyncPending = this._resyncPending || new Set();
    for (const c of (ev?.collections || [])) this._resyncPending.add(c);
    clearTimeout(this._resyncTimer);
    this._resyncTimer = setTimeout(() => this._doResync(), 400);
  },

  async _doResync() {
    const toccate = [...(this._resyncPending || [])];
    this._resyncPending = new Set();
    try {
      await Store.reloadCache();
    } catch (err) {
      console.error('[pathfinder] riallineamento fallito:', err);
      return;
    }
    /* Si ridisegna solo cio' che si sta guardando. Un ridisegno completo
       durante una scansione sposterebbe il fuoco dal campo. */
    if (this.currentView === 'dashboard') this.renderDashboard();
    else if (this.currentView === 'tasks') this.renderTasks();
    else if (this.currentView === 'map') { this.renderMap(); this.renderSidebar(); }
    else if (this.currentView === 'config') this.renderConfig();
    else if (this.currentView === 'archive') this.renderArchive();   // v1.1.0 [N5]
    else if (this.currentView === 'movimenta' && this._movMode === 'shipping') {
      const zona = document.getElementById('movFormArea');
      if (zona && !this._shipCart.length) this._formSpedizioni(zona);
    }
    if (toccate.length) this.updateSyncIndicator();
  },

  _showServiceDown(err: unknown) {
    if (document.getElementById('svcDown')) return;
    const el = document.createElement('div');
    el.id = 'svcDown';
    el.className = 'svc-down';
    el.innerHTML = `
      <div class="svc-down-box">
        <div class="svc-down-ico">${this._ico('alert-octagon', 'Servizio non raggiungibile', 'ico-xl')}</div>
        <h2>Servizio dati non raggiungibile</h2>
        <p>Il database di Pathfinder vive sulla macchina, non in questa finestra.
           Finché il servizio non risponde <strong>non è possibile registrare nulla</strong>:
           quello che venisse scansionato adesso andrebbe perso.</p>
        <div class="svc-down-what">
          <strong>Cosa fare</strong>
          <ol>
            <li>Verificare che la macchina del servizio sia accesa.</li>
            <li>Se è accesa, riavviare il servizio <span class="mono">Pathfinder</span>
                dai Servizi di Windows.</li>
            <li>Questa finestra si sblocca da sola appena il servizio torna.</li>
          </ol>
        </div>
        <p class="svc-down-err">${this._esc((err as Error | null)?.message || 'connessione interrotta')}</p>
        <button class="btn btn-primary" onclick="App._retryService()">Riprova adesso</button>
      </div>`;
    document.body.appendChild(el);
    Feedback.signal?.('error', 'Servizio dati non raggiungibile',
      'Nessuna operazione può essere registrata finché non torna.');
  },

  _hideServiceDown() {
    const el = document.getElementById('svcDown');
    if (!el) return;
    el.remove();
    this.toast('Servizio dati di nuovo raggiungibile', 'success');
    this._doResync();
  },

  async _retryService() {
    /* Il pulsante esiste solo dentro la fascia "servizio non raggiungibile",
       che nasce solo da remoto. */
    const remoto = Persistence as typeof RemotePersistence;
    try {
      await remoto._call('GET', '/api/health');
      remoto._subscribe();
    } catch {
      this.toast('Ancora nessuna risposta dal servizio', 'error');
    }
  },

  /* ── 2.11 · L'ORDINE DELL'AVVIO SI E' ROVESCIATO ──────────────────────
     Fino alla 2.10 l'applicativo caricava TUTTO e poi chiedeva chi fossi:
     l'identificazione era l'ultima riga di `init`, e serviva a scrivere una
     sigla sui movimenti — non ad aprire una porta, perche' la porta non
     c'era. Dalla 2.11 `/api/load` vuole una sessione, e allora l'ordine
     giusto e' l'unico possibile: si apre il collegamento, si chiede al
     servizio chi siamo, e se non siamo nessuno **si aspetta davanti alla
     maschera** prima di caricare una riga.

     `_attesaIdentificazione` e' la promessa che quella maschera scioglie.
     Non e' un giro di parole per far sembrare sincrono cio' che non lo e':
     `_openIdentityGate` disegna e ritorna, e senza qualcosa che aspetti il
     carico partirebbe un istante dopo, contro un servizio che risponde 401. */
  _attesaIdentificazione: null as { promessa: Promise<void>; sciogli: () => void } | null,

  /* L'operatore che il servizio dice essere gia' dentro: si riprende dopo il
     carico, quando la sua scheda intera e' finalmente in cache. */
  _sessioneRipresa: null as string | null,

  _aspettaIdentificazione(): Promise<void> {
    if (!this._attesaIdentificazione) {
      let sciogli: () => void = () => {};
      const promessa = new Promise<void>((ok) => { sciogli = ok; });
      this._attesaIdentificazione = { promessa, sciogli };
    }
    return this._attesaIdentificazione.promessa;
  },

  _identificato() {
    this._attesaIdentificazione?.sciogli();
    this._attesaIdentificazione = null;
  },

  async init() {
    try {
      await Store.apri();

      /* CHI SIAMO, PRIMA DI CHIEDERE COSA C'E'. Solo col servizio: da file
         non esiste una porta, e `statoSessione` non c'e' nemmeno. */
      if (Persistence.kind === 'remote' && Persistence.statoSessione) {
        const stato = await Persistence.statoSessione();
        /* CHI RICARICA LA PAGINA NON RIDIGITA IL PIN. `currentOperator` vive
           in memoria e un ricaricamento se lo porta via, ma la sessione sul
           servizio no: e' li' che sta scritto chi siamo. Chiedere di nuovo
           il PIN mentre il servizio risponde «sei PROV» sarebbe un attrito
           inventato — e peggio, due versioni della stessa verita'. */
        if (stato.sessione && stato.operatore) this._sessioneRipresa = stato.operatore.op_id;
        if (!stato.sessione && !stato.primoAvvio) {
          /* Gli operatori arrivano ridotti: bastano a disegnare la maschera,
             e sono tutto quel che il servizio da' a chi non e' ancora
             nessuno. */
          await Store.caricaOperatoriPerAccesso();
          nodo('bootScreen').style.display = 'none';
          await this._openIdentityGate({ initial: true });
          await this._aspettaIdentificazione();
        }
      }

      await Store.carica();
    } catch (err) {
      nodo('bootScreen').innerHTML =
        `<div class="text-center p-20 text-sx-danger"><h2>Errore inizializzazione DB</h2><p class="mt-10">${this._esc((err as Error).message)}</p><p class="mt-10 text-body-small text-sx-text-secondary">Verifica che il browser supporti IndexedDB e abbia spazio sufficiente.</p></div>`;
      return;
    }
    // v1.9.1 — Carica preferenza fix scanner layout
    this._loadScannerSettings();
    // v1.9.1 — Registra listener globale per fix barcode US→IT
    document.addEventListener('keydown', (e) => this._scanKeydownFix(e), true);
    /* 2.6 — I CODICI SI DIGITANO IN MAIUSCOLO, lettore ottico compreso: il
       lettore e' una tastiera, e digita dentro il campo che ha il fuoco.
       Un ascoltatore solo e in delega, perche' le maschere nascono dentro
       le modali e riagganciarsi a ogni apertura vuol dire dimenticarsene
       una. La garanzia resta sul servizio — `MAIUSCOLE` in `schema.js`. */
    accendiMaiuscole(document);
    // v2.1.0 — Feedback multisensoriale, focus keeper e scorciatoie operative
    Feedback.init();
    document.addEventListener('keydown', (e) => this._focusKeeper(e), true);
    document.addEventListener('keydown', (e) => this._shortcuts(e));
    this._loadSidebarState();                 // v2.7.0 [G4]
    this._wireRemote();                       // database sulla macchina, se c'è
    nodo('bootScreen').style.display = 'none';
    nodo('appRoot').style.display = 'grid';
    this._syncHeaderHeight();                 // v2.7.0 [G3]
    window.addEventListener('resize', debounce(() => this._syncHeaderHeight(), 120));
    this.renderSidebar();
    this._renderOperatorBadge();
    // Primo avvio con DB vuoto → porta direttamente alla configurazione
    if (Store.getSites().length === 0) {
      this.switchView('config');
      this.toast('Benvenuto — inizia creando un Sito di stoccaggio', 'info');
    } else {
      this.renderDashboard();
    }
    this.updateSyncIndicator();
    this._checkStorageQuota();

    /* v2.8.0 [H6] — Se un'altra scheda sta gia' scrivendo, questa passa in
       sola lettura invece di lavorare su una cache che invecchia in silenzio. */
    Tabs.init((ro) => this._onReadOnlyChange(ro));

    /* 1.11 — su che cosa sta girando. La classe finisce sul body e gira la
       manopola della densita'; le regole stanno in `01-layout.css`. */
    this._applicaDispositivo();
    /* TRE SORGENTI, e non e' abbondanza. `matchMedia` e' l'unica che scatta
       DAVVERO quando la larghezza attraversa una soglia — ed e' il solo
       momento in cui l'interfaccia deve cambiare; `resize` non arriva in
       tutti i casi (una tastiera virtuale che si apre cambia l'altezza e
       basta) e `orientationchange` su Android precede la misura nuova. */
    for (const soglia of [LARGHEZZA_TERMINALE, LARGHEZZA_TAVOLETTA]) {
      window.matchMedia(`(max-width: ${soglia}px)`)
        .addEventListener('change', () => this._applicaDispositivo());
    }
    window.addEventListener('resize', debounce(() => this._applicaDispositivo(), 200));
    window.addEventListener('orientationchange', () => setTimeout(() => this._applicaDispositivo(), 120));

    /* 2.25 — il chiosco. Si registra qui e non piu' tardi: `beforeinstallprompt`
       arriva una volta sola, presto, e chi non lo prende al volo non lo rivede. */
    this._avviaChiosco();

    await this._flushRecoveryQueue();
    this._renderRecoveryBanner();

    /* v2.8.0 [H5] — Chiede al browser di non cancellare il database.
       Su file:// verra' negata: lo stato reale e' in Configurazione → Dati. */
    Store.requestPersistentStorage().then(r => {
      if (!r.granted) console.info('[WM] archiviazione persistente non concessa —', r.reason);
    });

    // Auto-backup OPFS settimanale (silenzioso, in background)
    this._scheduleAutoBackup();

    await this._migrateLegacyOperators();
    Session.init(() => this._onSessionExpired());
    /* 2.11 — LA SESSIONE CHE C'ERA GIA' si riprende qui, e non prima: prima
       del carico in cache c'e' solo l'elenco ridotto, e quel che serve e' la
       scheda intera — nome, cognome, carica — perche' e' quella che va nel
       badge e nel registro. */
    if (this._sessioneRipresa && !this.currentOperator) {
      const rec = Store.getOperator(this._sessioneRipresa);
      if (rec) this._activateOperator(rec);
      this._sessioneRipresa = null;
    }

    /* Col servizio l'identificazione e' gia' avvenuta prima del carico, e
       riaprirla qui vorrebbe dire chiederla due volte. Resta per il modo
       «da file», dove non c'e' nessuna porta e la maschera serve solo a
       sapere chi scrive sui movimenti. */
    if (!this.currentOperator) await this._openIdentityGate({ initial: true });
    setTimeout(() => this._checkPendingPickSession(), 400);
  },

  async _migrateLegacyOperators() {
    try {
      if (localStorage.getItem(this._MIGRATED_KEY) === '1') return;
    } catch { return; }   // senza localStorage non c'e' nulla da migrare
    const known = this._getKnownOperators();
    let created = 0;
    for (const sigla of known) {
      if (Store.getOperatorByInitials(sigla)) continue;
      try {
        await Store.addOperator({ initials: sigla, first_name: '', last_name: '', role: 'operator' });
        created++;
      } catch (err) {
        console.warn('[WM] migrazione operatore', sigla, err);
      }
    }
    try { localStorage.setItem(this._MIGRATED_KEY, '1'); } catch {}
    if (created) {
      this.toast(`${created} operatore/i importato/i dallo storico — completa i dati in Configurazione`, 'info');
    }
  },

  _getKnownOperators() {
    try {
      const raw = localStorage.getItem(this._KNOWN_OPERATORS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(s => /^[A-Z0-9]{2,4}$/.test(s)) : [];
    } catch { return []; }
  },

  /* Carica preferenza fix scanner da localStorage. Default: ATTIVO. */
  _loadScannerSettings() {
    try {
      const v = localStorage.getItem(this._SCANNER_FIX_KEY);
      // Se non impostato → default true. Se impostato a '0' → false.
      this._scannerLayoutFix = v === null ? true : (v === '1');
    } catch { /* localStorage disabilitato → default true */ }
  },

  /* Persiste preferenza fix scanner. */
  _setScannerLayoutFix(enabled: boolean) {
    this._scannerLayoutFix = !!enabled;
    try {
      localStorage.setItem(this._SCANNER_FIX_KEY, this._scannerLayoutFix ? '1' : '0');
    } catch {}
    this.toast(`Correzione layout scanner: ${this._scannerLayoutFix ? 'ATTIVA' : 'DISATTIVA'}`, 'info');
    if (this._configTab === 'data') this.renderConfig();
  },

  _scanKeydownFix(e: KeyboardEvent) {
    if (!this._scannerLayoutFix) return;
    const t = e.target as HTMLInputElement | null;
    if (!t || t.tagName !== 'INPUT') return;
    if (!t.classList.contains('input-mono')) return;
    // Ignora se modificatori (Ctrl/Alt/Meta) per non interferire con scorciatoie
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // Mappa tasto fisico (event.code) → carattere atteso (layout US/scanner default fabbrica)
    const PHYS_MAP = {
      'Slash': '/',
      'Minus': '-',
      'Quote': "'",
      'Backslash': '\\',
      'Equal': '='
    };
    const expected = PHYS_MAP[e.code as keyof typeof PHYS_MAP];
    if (!expected) return;
    // Se il carattere prodotto coincide già con quello atteso → nessuna correzione necessaria
    if (e.key === expected) return;
    // Sostituisci solo se e.key è un singolo carattere stampabile (no Enter/Tab/Backspace ecc.)
    if (typeof e.key !== 'string' || e.key.length !== 1) return;
    // Inserisci il carattere atteso al posto del default
    e.preventDefault();
    const start = t.selectionStart ?? t.value.length;
    const end = t.selectionEnd ?? t.value.length;
    const v = t.value;
    t.value = v.slice(0, start) + expected + v.slice(end);
    try { t.setSelectionRange(start + 1, start + 1); } catch {}
    // Trigger 'input' event per attivare eventuali oninput handler esistenti (es. _previewLoc)
    t.dispatchEvent(new Event('input', { bubbles: true }));
  },
  // © Andrea Sacchetti — fine modulo fix scanner v1.9.1
  // ═══════════════════════════════════════════════════════════════════

  _gateOpen: false,

  async _openIdentityGate({ initial = false, reason = '' } = {}) {
    if (this._gateOpen) return;
    this._gateOpen = true;
    Session.suspend();
    if (!Auth.available()) {
      /* Contesto non sicuro: crypto.subtle non esiste. Meglio dirlo che
         fingere una verifica che non sta avvenendo. */
      this._gateOpen = false;
      Session.resume();
      this.toast('PIN non verificabile in questo contesto (serve https, file:// o localhost) — identificazione ridotta alle iniziali', 'warning');
      return;
    }
    if (!Store.getUsableLeaders().length) this._renderFirstLeaderWizard();
    else this._renderLoginModal({ initial, reason });
  },

  _closeIdentityGate() {
    document.getElementById('identityGate')?.remove();
    this._gateOpen = false;
    Session.resume();
  },

  _gateShell(title: string, bodyHtml: string, footerHtml: string,
             { dismissible = false }: { dismissible?: boolean } = {}) {
    document.getElementById('identityGate')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'identityGate';
    overlay.className = 'modal-overlay gate-overlay';
    /* Nessun onclick di chiusura sul fondo e nessun tasto Esc: il popup e'
       un blocco, non un avviso. Si esce identificandosi. */
    overlay.innerHTML = `
      <div class="modal max-w-[440px]">
        <div class="modal-header">
          <h2>${title}</h2>
          ${dismissible ? `<button class="btn btn-sm btn-icon btn-ghost" onclick="App._closeIdentityGate()">${this._ico('x', 'Chiudi')}</button>` : ''}
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">${footerHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  },

  /* ── [G7] Wizard del primo Team Leader ────────────────────────────── */
  _renderFirstLeaderWizard() {
    this._gateShell(
      `${this._ico('shield-check')} Primo accesso — Admin`,
      `<p class="text-body-medium text-sx-text-secondary leading-larga mb-8">
        Non risulta alcun operatore in anagrafica. Il primo nasce <strong>Admin</strong>:
        è chi crea gli altri, rinnova i PIN smarriti e apre la Configurazione.<br>
        Le <strong>iniziali</strong> sono ciò che verrà scritto su ogni movimento per la tracciabilità GMP.
      </p>
      <div class="form-row mb-6">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="wizFirst" maxlength="40" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="wizLast" maxlength="40"></div>
      </div>
      <div class="form-group mb-6">
        <label>Iniziali <span class="req">*</span> <span class="font-normal text-sx-text-muted">(2-4 caratteri, maiuscole o cifre)</span></label>
        <input class="input input-mono uppercase" id="wizInitials" maxlength="4" placeholder="Es. AS"
          oninput="this.value=this.value.toUpperCase()">
      </div>
      <div class="form-row mb-4">
        <div class="form-group"><label>PIN a 6 cifre <span class="req">*</span></label>
          <input class="input input-mono" id="wizPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma PIN <span class="req">*</span></label>
          <input class="input input-mono" id="wizPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._confirmFirstLeader()}"></div>
      </div>
      <div id="wizError" class="gate-error"></div>`,
      '<button class="btn btn-primary" onclick="App._confirmFirstLeader()">Crea Admin e accedi</button>'
    );
    setTimeout(() => document.getElementById('wizFirst')?.focus(), 80);
  },

  async _confirmFirstLeader() {
    const err = (m: string) => { const e = document.getElementById('wizError'); if (e) e.textContent = m; };
    const first = Validate.clean(campo('wizFirst')?.value);
    const last  = Validate.clean(campo('wizLast')?.value);
    const init  = (campo('wizInitials')?.value || '').toUpperCase().trim();
    const pin   = campo('wizPin')?.value || '';
    const pin2  = campo('wizPin2')?.value || '';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    if (!/^[A-Z0-9]{2,4}$/.test(init)) return err('Iniziali non valide: 2-4 caratteri, lettere maiuscole o cifre.');
    const pinErr = Auth.validatePin(pin);
    if (pinErr) return err(pinErr);
    if (pin !== pin2) return err('I due PIN non coincidono.');
    try {
      const fields = await Auth.buildPinFields(pin);
      /* 2.13 — IL PRIMO ADMIN NASCE CON LA VIA DI FUGA, e nasce con lei
         perché è il caso peggiore di tutti: un magazzino appena installato
         ha un Admin solo, e il suo PIN perso è la Configurazione murata
         senza nessuno che possa riaprirla. */
      const fuga = Auth.newRecoveryCode();
      const campiFuga = await Auth.buildRecoveryFields(fuga);
      /* 2.29.1 — `senzaMeta`, E L'ORDINE E' TUTTO. Fino alla 2.29 questa riga
         scriveva l'operatore E POI toccava `meta`: ma la prima scrittura
         chiude la finestra di primo avvio, quindi la seconda partiva senza
         sessione e si prendeva un 401. `addOperator` lanciava e le tre righe
         qui sotto non venivano mai eseguite — nessuna sessione, wizard
         aperto, «Sessione non valida: identificarsi» — su un Admin che a
         database c'era. Chi riprovava incassava «Le iniziali sono gia'
         assegnate», e non c'era una riga che dicesse di ricaricare ed
         entrare col PIN appena scelto. Visto al banco l'08/09. */
      const rec = await Store.addOperator({ first_name: first, last_name: last, initials: init, role: 'admin', ...fields, ...campiFuga }, { senzaMeta: true });
      /* 2.11 — e' il PIN che chiude la finestra di primo avvio: da questo
         istante il servizio chiede una sessione, e chi ha appena creato
         l'Admin deve averla. */
      await Auth.accedi(rec, pin);
      await Store._touchMeta();
      this._activateOperator(rec);
      this._closeIdentityGate();
      this._identificato();
      this.toast(`Admin ${rec.initials} creato — sei collegato`, 'success');
      if (this.currentView === 'config') this.renderConfig();
      this._mostraCodiceRipristino(rec, fuga, { nuovo: true });
    } catch (e) {
      err((e as Error).message || 'Creazione non riuscita.');
    }
  },

  /* ── Login: chi sei e qual è il tuo PIN ───────────────────────────── */
  _loginSelectedId: null as string | null,
  _loginFails: 0,

  _renderLoginModal({ initial = false, reason = '' } = {}) {
    const ops = Store.getOperators({ activeOnly: true });
    this._loginSelectedId = ops.find(o => o.initials === this.currentOperator)?.op_id || null;
    const title = initial ? `${this._ico('hand-move')} Identificazione`
      : (reason ? `${this._ico('lock')} Sessione bloccata`
               : `${this._ico('user')} Cambio operatore`);
    this._gateShell(
      title,
      `${reason ? `<div class="mov-preview mov-preview-warn mb-7">${this._esc(reason)}</div>` : ''}
      <p class="text-body-small text-sx-text-secondary mb-6">
        Seleziona il tuo nominativo e digita il PIN. Le iniziali verranno registrate su ogni movimento.
      </p>
      <div class="op-pill-grid" id="loginOps">${this._loginPillsHTML(ops)}</div>
      <div class="form-group mt-7">
        <label>PIN a 6 cifre</label>
        <input class="input input-mono gate-pin" id="loginPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off"
          onkeydown="if(event.key==='Enter'){event.preventDefault();App._confirmLogin()}">
      </div>
      <div id="loginError" class="gate-error"></div>
      <div class="mt-5 text-label-small text-sx-text-muted">
        PIN smarrito? Un <strong>Team Leader</strong> o un <strong>Admin</strong> può rinnovarlo
        da Configurazione → Operatori.
        <button class="btn btn-sm btn-ghost mt-3" onclick="App._renderRecoveryGate()">${this._ico('lock-access')} Ho un codice di ripristino</button>
      </div>`,
      `${initial || reason ? '' : '<button class="btn" onclick="App._closeIdentityGate()">Annulla</button>'}
       <button class="btn btn-primary" onclick="App._confirmLogin()">Accedi</button>`,
      { dismissible: !initial && !reason }
    );
    setTimeout(() => document.getElementById(this._loginSelectedId ? 'loginPin' : 'loginOps')?.focus(), 80);
  },

  /* 2.18 — LA MASCHERA MOSTRA LA SIGLA, NON IL NOME.
     Fino alla 2.17 questa lista arrivava da `/api/auth/operatori`, che
     risponde SENZA sessione, e portava nome e cognome di ogni operatore
     attivo: chiunque fosse sulla rete aveva l'elenco nominativo del
     personale di magazzino senza autenticarsi. Adesso da li' escono sigla e
     ruolo — la sigla e' gia' stampata su ogni documento e su ogni riga di
     registro, e non e' un segreto — e nome e cognome arrivano dopo
     l'ingresso, quando una sessione c'e'.
     Se un giorno il record completo fosse gia' in cache (chi rientra dopo un
     logout senza ricaricare la pagina) il nome si mostra: non e' uscito da
     una rotta pubblica, e toglierlo confonderebbe chi lo vedeva prima. */
  _loginPillsHTML(ops: Operatore[]) {
    if (!ops.length) return '<div class="gate-error">Nessun operatore attivo in anagrafica.</div>';
    return ops.map(o => {
      const label = (o.last_name || o.first_name)
        ? `${this._esc(o.initials)} · ${this._esc([o.first_name, o.last_name].filter(Boolean).join(' '))}`
        : `${this._esc(o.initials)}`;
      return `<button type="button" class="op-pill ${o.op_id === this._loginSelectedId ? 'active' : ''}"
        onclick="App._selectLoginOp('${o.op_id}')">${o.role === 'operator' ? '' : this._ico(this._etichettaRuolo(o.role).icona) + ' '}${label}</button>`;
    }).join('');
  },

  _selectLoginOp(opId: string) {
    this._loginSelectedId = opId;
    const host = document.getElementById('loginOps');
    if (host) host.innerHTML = this._loginPillsHTML(Store.getOperators({ activeOnly: true }));
    document.getElementById('loginPin')?.focus();
  },

  async _confirmLogin() {
    const errEl = document.getElementById('loginError');
    const err = (m: string) => { if (errEl) errEl.textContent = m; };
    const op = this._loginSelectedId ? Store.getOperator(this._loginSelectedId) : null;
    if (!op) return err('Seleziona il tuo nominativo.');

    if (!Store.haPin(op)) { this._renderCompleteProfile(op); return; }

    const pin = campo('loginPin')?.value || '';
    if (!/^\d{6}$/.test(pin)) return err('Digita il PIN a 6 cifre.');
    /* 2.11 — `accedi`, non `verifyPin`: questo e' l'ingresso, e deve
       lasciare una sessione dietro di se'. `verifyPin` resta per i gesti che
       chiedono un PIN a sessione gia' aperta. */
    if (!await Auth.accedi(op, pin)) {
      this._loginFails++;
      err('Nominativo o PIN non corretti.');   // messaggio generico: non si dice quale dei due
      const input = campo('loginPin');
      if (input) input.value = '';
      if (this._loginFails >= 3) {
        const wait = Math.min(20, 2 ** (this._loginFails - 2));
        if (input) { input.disabled = true; }
        err(`Nominativo o PIN non corretti — riprova fra ${wait} s.`);
        setTimeout(() => { if (input) { input.disabled = false; input.focus(); } err(''); }, wait * 1000);
      }
      return;
    }
    this._loginFails = 0;
    this._afterLogin(op);
    this._identificato();
  },

  /* ══ 2.13 · LA VIA DI FUGA, DAL DI FUORI ═════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l.

     Questa maschera si apre quando tutte le altre strade sono chiuse: il
     PIN di un Admin è perso e non c'è un altro Admin che possa rinnovarlo.
     È l'unico punto dell'applicativo in cui si riscrive un PIN senza che
     nessuno lo autorizzi con il proprio — e per questo chiede un segreto
     che vale più di un PIN, e lo consuma nell'usarlo.

     NON È UN SECONDO INGRESSO. Non apre l'applicativo: apre la riscrittura
     del PIN di quell'Admin, e finisce mostrando il codice che prende il
     posto di quello appena speso. Chi esce di qui ha un PIN nuovo e la
     cassaforte di nuovo piena. */
  _renderRecoveryGate() {
    /* 2.18 — GLI ADMIN, TUTTI. Fino alla 2.17 questa lista teneva solo
       quelli che una via di fuga ce l'avevano davvero, e il filtro leggeva
       `rec_set` da `/api/auth/operatori` — una rotta che risponde SENZA
       sessione. Cioe': chiunque fosse sulla rete poteva chiedere al servizio
       quali Admin avessero una seconda via d'ingresso. E' la mezza
       informazione piu' utile a chi attacca e la meno utile a chi ha
       dimenticato il PIN, che il suo foglio in cassaforte ce l'ha o non ce
       l'ha e lo sa da se'.
       Adesso il campo non esce piu' e la maschera li elenca tutti: chi
       sceglie un Admin senza codice si prende un rifiuto dal servizio, che
       e' esattamente lo stesso rifiuto di chi sbaglia a digitare. */
    const admin = Store.getOperators({ activeOnly: true })
      .filter(o => o.role === 'admin' && Store.haPin(o));
    if (!admin.length) {
      this._gateShell(
        `${this._ico('lock-access')} Codice di ripristino`,
        `<p class="text-body-small text-sx-text-secondary leading-larga">
          Nessun Admin di questa installazione ha un PIN registrato.
          Il PIN si rinnova da <strong>Configurazione → Operatori</strong>, autorizzato
          da chi sta un gradino sopra: un Team Leader per gli Operatori, un Admin per tutti.
        </p>`,
        '<button class="btn btn-primary" onclick="App._renderLoginModal({initial:true})">Indietro</button>'
      );
      return;
    }
    this._gateShell(
      `${this._ico('lock-access')} Rientro con codice di ripristino`,
      `<p class="text-body-small text-sx-text-secondary leading-larga mb-7">
        Il codice è di ${Auth.RIPRISTINO_LUNGHEZZA} caratteri, come sul foglio in cassaforte.
        Trattini e spazi si possono digitare o omettere.
        <strong>Vale una volta sola:</strong> con il PIN nuovo verrà emesso un codice nuovo,
        mostrato subito e mai più.
      </p>
      <div class="form-group mb-6">
        <label>Admin <span class="req">*</span></label>
        <select class="input select" id="recWho">
          ${admin.map(o => {
            /* 2.18 — la sigla basta, e prima dell'ingresso e' tutto quello che
               c'e': `/api/auth/operatori` non risponde piu' coi nomi. */
            const nome = [o.first_name, o.last_name].filter(Boolean).join(' ');
            return `<option value="${o.op_id}">${this._esc(o.initials)}${nome ? ' — ' + this._esc(nome) : ''}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-group mb-7">
        <label>Codice di ripristino <span class="req">*</span></label>
        <input class="input input-mono uppercase" id="recCode" autocomplete="off" spellcheck="false"
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX" maxlength="32"
          oninput="this.value=this.value.toUpperCase()">
      </div>
      <div class="form-row mb-4">
        <div class="form-group"><label>Nuovo PIN a 6 cifre <span class="req">*</span></label>
          <input class="input input-mono" id="recPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma nuovo PIN <span class="req">*</span></label>
          <input class="input input-mono" id="recPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._confirmRecovery()}"></div>
      </div>
      <div id="recError" class="gate-error"></div>`,
      `<button class="btn" onclick="App._renderLoginModal({initial:true})">Indietro</button>
       <button class="btn btn-primary" onclick="App._confirmRecovery()">Riscrivi il PIN e rientra</button>`
    );
    setTimeout(() => document.getElementById('recCode')?.focus(), 80);
  },

  async _confirmRecovery() {
    const err = (m: string) => { const e = document.getElementById('recError'); if (e) e.textContent = m; };
    const op = Store.getOperator(campo('recWho')?.value || '');
    const codice = campo('recCode')?.value || '';
    const pin = campo('recPin')?.value || '';
    const pin2 = campo('recPin2')?.value || '';
    if (!op) return err('Seleziona l’Admin da riaprire.');
    const codErr = Auth.validateRecoveryCode(codice);
    if (codErr) return err(codErr);
    const pinErr = Auth.validatePin(pin);
    if (pinErr) return err(pinErr);
    if (pin !== pin2) return err('I due PIN non coincidono.');

    try {
      let nuovoCodice: string;
      if (Persistence.kind === 'remote' && Persistence.recupera) {
        /* Col servizio l'impronta non viaggia: il codice si manda là dove
           l'impronta sta, e da lì torna la sessione insieme al codice
           nuovo. È la stessa ragione per cui `verifyPin` vive sul
           servizio, applicata a un segreto che vale di più. */
        const r = await Persistence.recupera({ op_id: op.op_id, codice, nuovo_pin: pin });
        if (!r?.ok) return err('Codice di ripristino non valido.');
        nuovoCodice = r.nuovoCodice;
      } else {
        if (!await Auth.verifyRecoveryCode(op, codice)) return err('Codice di ripristino non valido.');
        nuovoCodice = Auth.newRecoveryCode();
        /* PIN nuovo e codice nuovo nella stessa scrittura: se passasse solo
           il primo, l'Admin rientrerebbe senza più via di fuga e senza
           saperlo. */
        await Store.updateOperator(op.op_id, {
          ...await Auth.buildPinFields(pin),
          ...await Auth.buildRecoveryFields(nuovoCodice),
        });
      }
      /* Da qui in poi è un accesso riuscito come un altro: la cache si
         rilegge perché la maschera l'aveva caricata ridotta, e chi rientra
         deve trovarsi il magazzino, non l'elenco degli operatori. */
      await Store.carica();
      const rec = Store.getOperator(op.op_id) || op;
      this._afterLogin(rec);
      this._identificato();
      this._mostraCodiceRipristino(rec, nuovoCodice);
    } catch (e) {
      const stato = (e as { status?: number }).status;
      if (stato === 401) return err('Codice di ripristino non valido.');
      if (stato === 429) return err('Troppi tentativi: attendere un minuto.');
      err((e as Error).message || 'Ripristino non riuscito.');
    }
  },

  /* Completamento della scheda importata dallo storico + primo PIN. */
  _renderCompleteProfile(op: Operatore) {
    this._gateShell(
      `${this._ico('edit')} Completa la tua scheda — ${this._esc(op.initials)}`,
      `<p class="text-body-small text-sx-text-secondary leading-larga mb-8">
        Le iniziali <strong>${this._esc(op.initials)}</strong> provengono dallo storico dei movimenti e restano invariate.
        Mancano nome, cognome e PIN.
      </p>
      <div class="form-row mb-6">
        <div class="form-group"><label>Nome <span class="req">*</span></label><input class="input" id="cpFirst" maxlength="40" value="${this._esc(op.first_name || '')}" autofocus></div>
        <div class="form-group"><label>Cognome <span class="req">*</span></label><input class="input" id="cpLast" maxlength="40" value="${this._esc(op.last_name || '')}"></div>
      </div>
      <div class="form-row mb-4">
        <div class="form-group"><label>PIN a 6 cifre <span class="req">*</span></label>
          <input class="input input-mono" id="cpPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="form-group"><label>Conferma PIN <span class="req">*</span></label>
          <input class="input input-mono" id="cpPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App._confirmCompleteProfile('${op.op_id}')}"></div>
      </div>
      <div id="cpError" class="gate-error"></div>`,
      `<button class="btn" onclick="App._renderLoginModal({initial:true})">Indietro</button>
       <button class="btn btn-primary" onclick="App._confirmCompleteProfile('${op.op_id}')">Salva e accedi</button>`
    );
    setTimeout(() => document.getElementById('cpFirst')?.focus(), 80);
  },

  async _confirmCompleteProfile(opId: string) {
    const err = (m: string) => { const e = document.getElementById('cpError'); if (e) e.textContent = m; };
    const first = Validate.clean(campo('cpFirst')?.value);
    const last  = Validate.clean(campo('cpLast')?.value);
    const pin   = campo('cpPin')?.value || '';
    const pin2  = campo('cpPin2')?.value || '';
    if (!first || !last) return err('Nome e cognome sono obbligatori.');
    const pinErr = Auth.validatePin(pin);
    if (pinErr) return err(pinErr);
    if (pin !== pin2) return err('I due PIN non coincidono.');
    try {
      const fields = await Auth.buildPinFields(pin);
      const rec = await Store.updateOperator(opId, { first_name: first, last_name: last, ...fields });
      /* 2.11 — SCRIVERE UN PIN PUO' CHIUDERE LA FINESTRA DI PRIMO AVVIO, e
         chi l'ha appena scritto si troverebbe fuori dalla porta che ha
         appena serrato: si entra subito, col PIN che si ha in mano. */
      await Auth.accedi(rec, pin);
      this._afterLogin(rec);
      this._identificato();
    } catch (e) {
      err((e as Error).message || 'Salvataggio non riuscito.');
    }
  },

  /* ── Cosa succede dopo un accesso riuscito ────────────────────────── */
  _afterLogin(op: Operatore) {
    const previous = this.currentOperator;
    const changed = previous && previous !== op.initials;
    this._activateOperator(op);
    this._closeIdentityGate();

    if (changed && this._hasOpenCart()) {
      this.cancelMov();
      if (this.currentView === 'movimenta') this.renderMovimenta();
      this.toast(`Operazione aperta da ${previous} annullata: al lavoro c’è ora ${op.initials}`, 'warning');
    }
    /* 2.23 — IL CRUSCOTTO E' DI CHI GUARDA, quindi cambia con la sigla. Senza
       questa riga chi subentra vedrebbe i riquadri di prima fino al primo
       cambio di vista: non un errore che si nota, ma un cruscotto che per
       qualche minuto racconta le priorita' di un altro. Si ridisegna solo se
       si sta guardando, e solo a sigla cambiata. */
    if (changed && this.currentView === 'dashboard') this.renderDashboard();
    this.toast(`Operatore: ${op.initials} (${this._etichettaRuolo(op.role).nome})`, 'success');
  },

  _hasOpenCart() {
    return Boolean(this._movMode) || Boolean(this._pickCart?.length)
        || Boolean(this._shipCart?.length) || Boolean(this._dispState);
  },

  _activateOperator(op: Operatore) {
    this.currentOperator = op.initials;
    this.currentOperatorRecord = op;
    try { localStorage.setItem(this._OPERATOR_KEY, op.initials); } catch {}
    this._renderOperatorBadge();
  },

  /* Uscita esplicita: il terminale torna disponibile a chiunque, subito.
     Prima si salva — chi smonta non deve preoccuparsi di premere altro. */
  async logoutOperator() {
    await this._saveCheckpoint().catch(() => {});
    /* 2.11 — «Blocca» chiude la sessione anche sul servizio: senza, il
       terminale resterebbe una porta aperta finche' qualcuno non riavvia il
       servizio, che e' l'unica altra cosa che le chiude. */
    await Auth.esci();
    this.currentOperator = null;
    this.currentOperatorRecord = null;
    this._renderOperatorBadge();
    this._openIdentityGate({ initial: true });
  },

  /* Il badge in barra apre le due sole azioni sensate. */
  showOperatorMenu() {
    if (!this.currentOperator) return this._openIdentityGate({ initial: true });
    const op = this.currentOperatorRecord;
    this.showModal(
      `${this._ico('user')} Operatore al lavoro`,
      `<div class="text-body-medium leading-ampia">
        <div><strong>${this._esc([op?.first_name, op?.last_name].filter(Boolean).join(' ') || '—')}</strong></div>
        <div>Iniziali <span class="mono font-bold">${this._esc(this.currentOperator)}</span>
             · ${this._ico(this._etichettaRuolo(op?.role).icona)} ${this._etichettaRuolo(op?.role).nome}</div>
        <div class="text-body-small text-sx-text-muted mt-4">
          Blocco automatico dopo ${Session.getTimeoutMinutes() ? Session.getTimeoutMinutes() + ' min di inattività' : 'mai (disattivato)'}.
        </div>
      </div>`,
      `<button class="btn" onclick="App.closeModal()">Chiudi</button>
       <button class="btn btn-accent" onclick="App.closeModal();App._openIdentityGate({})">${this._ico('refresh')} Cambia operatore</button>
       <button class="btn btn-warning" onclick="App.closeModal();App.logoutOperator()">${this._ico('lock')} Blocca ora</button>`
    );
  },

  /* ── Scadenza dell'inattività ─────────────────────────────────────── */
  async _onSessionExpired() {
    if (this._gateOpen) return;
    /* Prima si salva. Il lavoro fatto e' buono: e' l'attribuzione del lavoro
       successivo che non lo sarebbe piu'. */
    try { await Store.forceSave(); } catch (err) { console.error('[WM] salvataggio al blocco sessione:', err); }
    this.updateSyncIndicator();
    this.closeModal();
    this.closeSearchPop();
    const min = Session.getTimeoutMinutes();
    this._openIdentityGate({
      reason: `Sessione bloccata dopo ${min} minuti di inattività. I dati sono stati salvati. Identificati per riprendere.`
    });
  },

  /* 2.1 — il ruolo si scrive in un posto solo: quattro punti lo dicevano
     ciascuno a modo suo, e la carica nuova sarebbe comparsa in tre. */
  _etichettaRuolo(ruolo: string | null | undefined) {
    return ruolo === 'admin' ? { icona: 'shield-check' as const, nome: 'Admin' }
         : ruolo === 'leader' ? { icona: 'crown' as const, nome: 'Team Leader' }
         : { icona: 'user' as const, nome: 'Operatore' };
  },

  _renderOperatorBadge() {
    const el = document.getElementById('operatorBadge');
    if (!el) return;
    if (this.currentOperator) {
      const r = this._etichettaRuolo(this.currentOperatorRecord?.role);
      /* 2.23 — `textContent`: qui un SVG uscirebbe come testo. Il badge
         porta le iniziali, che sono la cosa che si legge; la carica sta
         nel `title` qui sotto e nel menu che si apre cliccando. */
      el.textContent = this.currentOperator;
      el.title = `Operatore corrente: ${this.currentOperator} (${r.nome}) — clicca per cambiare o bloccare`;
      el.classList.remove('op-badge-empty');
    } else {
      el.textContent = '—';
      el.title = 'Nessun operatore identificato — clicca per accedere';
      el.classList.add('op-badge-empty');
    }
  },

  async showOPFSBackups() {
    const list = await Store.listOPFSBackups();
    if (!list.length) {
      return this.toast('Nessuna copia locale presente — creane una con il pulsante accanto', 'info');
    }
    /* IL CAST NASCONDEVA IL NOME SBAGLIATO. `listBackups` torna
       `lastModified`, non `modified`: la colonna Data stampava un trattino
       su ogni riga, e un trattino non e' un errore — nessuno l'ha letto
       come tale finche' il compilatore non ha chiesto di che tipo fosse
       `b`. Qui non serve nessun cast: il tipo ce l'ha gia'. */
    const righe = list.map(b => `<tr>
      <td class="mono">${this._esc(b.name)}</td>
      <td class="mono">${(b.size / 1024).toFixed(0)} KB</td>
      <td>${b.lastModified
              ? new Date(b.lastModified).toLocaleString('it-IT') : '—'}</td>
      <td><button class="btn btn-sm btn-accent" onclick="App.restoreOPFSBackup('${this._esc(b.name)}')">${this._ico('recycle')} Ripristina</button></td>
    </tr>`).join('');
    this.showModal(
      `${this._ico('folders')} Copie locali disponibili (${list.length})`,
      `<div class="mov-preview mov-preview-warn mb-7">
        Queste copie stanno sullo <strong>stesso disco e nello stesso profilo browser</strong> del database.
        Servono a rimediare a un errore recente, non a un guasto della macchina: per quello serve la copia su OneDrive.<br>
        Contengono giacenze, anagrafiche, ubicazioni e quarantene, <strong>non il registro movimenti</strong>:
        il ripristino riporta indietro lo stato del magazzino e <strong>lascia intatto lo storico</strong>.
      </div>
      <div class="overflow-x-auto"><table class="sx-table">
        <thead><tr><th>File</th><th>Dimensione</th><th>Data</th><th class="w-[120px]">Azione</th></tr></thead>
        <tbody>${righe}</tbody></table></div>`,
      '<button class="btn" onclick="App.closeModal()">Chiudi</button>'
    );
  },

  async restoreOPFSBackup(filename: string) {
    try {
      const testo = await Store.readOPFSBackup(filename);
      const pacchetto = JSON.parse(testo);
      const check = Store.verifyExportPackage(pacchetto);
      const c = pacchetto._counts || Store._countsOf(pacchetto);
      /* LE COPIE AUTOMATICHE NON PORTANO IL REGISTRO, e chi ripristina deve
         saperlo prima di premere. Escono da `writeOPFSBackup` con
         `includeMovLog: false`, quindi `_counts.mov_log` non c'e' e la riga
         dei Movimenti mostrava «0» — che si legge «questo file non ha
         movimenti», mentre vuol dire «questo file non li porta». Il registro
         adesso resta dov'e' (vedi `importAll`), e va detto anche questo. */
      const senzaRegistro = !Array.isArray(pacchetto.mov_log);
      if (!await Dialog.confirm({
        title: 'Ripristinare questa copia locale?',
        message: (check.ok ? '' : 'Verifica: ' + check.problemi.join(' · ') + '\n\n') +
          'I dati attualmente presenti verranno sostituiti. Verrà prima scaricato un export dello stato attuale.' +
          (senzaRegistro ? '\n\nQuesta copia NON contiene il registro movimenti. Il registro di adesso resta dov\u2019è: non viene né sostituito né cancellato.' : ''),
        details: Dialog.kv([
          ['File', filename],
          ['Movimenti', senzaRegistro ? 'non inclusi nella copia — il registro attuale resta' : Number(c.mov_log || 0).toLocaleString('it-IT')],
          ['Giacenze', Number(c.inventory || 0).toLocaleString('it-IT')]
        ]),
        confirmLabel: 'Ripristina', danger: true
      })) return;
      await this.exportData();
      await Store.importAll(pacchetto, 'overwrite');
      this.closeModal();
      this.renderSidebar();
      this.renderConfig();
      this.updateSyncIndicator();
      this.toast(`Ripristino da ${filename} completato`, 'success');
    } catch (err) {
      console.error('[WM] ripristino OPFS:', err);
      this.toast(`Ripristino non riuscito: ${(err as Error).message}`, 'error');
    }
  },

  async opfsBackupNow() {
    try {
      const r = await Store.writeOPFSBackup();
      this.toast(`Copia locale creata — ${(r.size/1024).toFixed(1)} KB`, 'success');
      this.renderConfig();
    } catch (err) {
      this.toast(`Copia locale non riuscita: ${(err as Error).message}`, 'error');
    }
  },

  /* schedula auto-backup OPFS in background */
  async _scheduleAutoBackup() {
    try {
      const result = await Store.checkAutoBackup();
      if (result) {
        this.toast(`Backup automatico creato — ${(result.size/1024).toFixed(1)} KB`, 'info');
      }
    } catch (err) {
      console.warn('[WM] _scheduleAutoBackup error:', err);
    }
  },

  async _checkStorageQuota() {
    const est = await Store.estimateUsage();
    if (est && est.pct != null && est.pct > 80) {
      this.toast(`Spazio DB al ${est.pct.toFixed(0)}% — considera un export e cleanup`, 'warning');
    }
  },

  // ── Routing views ──
  /* 1.11 — LA CLASSE DEL DISPOSITIVO SUL BODY.
     Si rifa' a ogni ridimensionamento e a ogni rotazione: un terminale che
     gira passa da 400 a 533 px, e restare sull'interfaccia di prima
     vorrebbe dire tenere il layout stretto su uno schermo che non lo e'
     piu'. La regola sta in `modules/dispositivo.ts`, qui c'e' solo il
     gesto. */
  _dispositivo: 'scrivania',

  _applicaDispositivo() {
    const classe = classifica({
      userAgent: navigator.userAgent,
      larghezza: window.innerWidth,
      altezza: window.innerHeight,
      touch: (navigator.maxTouchPoints || 0) > 0,
    });
    if (classe === this._dispositivo && document.body.classList.contains(classeCSS(classe))) return;
    this._dispositivo = classe;
    document.body.classList.remove(...classiPossibili());
    document.body.classList.add(classeCSS(classe));
    /* Android si registra ma non decide il layout: serve a chi legge un
       registro per sapere da che macchina e' arrivato un gesto. */
    document.body.classList.toggle('dispositivo-android', eAndroid(navigator.userAgent));
    /* La mappa e' disegnata su misura del contenitore: cambiata la densita',
       va ridisegnata o resta della misura di prima. */
    if (this.currentView === 'map' && this.currentSite) this.renderMap();
  },

  /* ═══ 2.25 · IL CHIOSCO ═══════════════════════════════════════════════
     © Andrea Sacchetti — Dietopack S.r.l.

     Tre fatti, e nessuno di questi e' una preferenza da salvare: se la
     pagina gira gia' come applicazione installata, se l'indirizzo e' sicuro,
     e se il browser ha offerto l'installazione. La regola che li mette
     insieme sta in `modules/chiosco.ts`, qui c'e' solo il filo col browser. */

  /** L'invito del browser, preso al volo e tenuto: `beforeinstallprompt`
      passa una volta sola e non si puo' richiamare. */
  _invitoChiosco: null as (Event & { prompt?: () => Promise<void> }) | null,

  _avviaChiosco() {
    this._segnaChiosco();
    /* `preventDefault` toglie la barretta di serie del browser: l'invito lo
       fa l'applicativo, nella scheda dove sta scritto anche il perche'. */
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this._invitoChiosco = e as Event & { prompt?: () => Promise<void> };
      if (this.currentView === 'config' && this._configTab === 'session') this.renderConfig();
    });
    window.addEventListener('appinstalled', () => {
      this._invitoChiosco = null;
      this._segnaChiosco();
      this.toast('Pathfinder e\' installato su questo terminale', 'success');
      if (this.currentView === 'config' && this._configTab === 'session') this.renderConfig();
    });
    /* Da installato la finestra nasce in `standalone`, ma su Android ci si
       arriva anche DOPO, dalla stessa scheda: la classe deve seguire. */
    window.matchMedia('(display-mode: standalone)')
      .addEventListener('change', () => this._segnaChiosco());
  },

  /** Vero se questa finestra e' l'applicazione installata e non una scheda.
      Due domande perche' iOS non risponde alla prima. */
  _eChiosco(): boolean {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches;
    return standalone || (navigator as { standalone?: boolean }).standalone === true;
  },

  _segnaChiosco() {
    document.body.classList.toggle('chiosco', this._eChiosco());
  },

  /** Lo stato da scrivere nella scheda Sessione. */
  statoChiosco(): StatoChiosco {
    return statoChiosco({
      classe: this._dispositivo as ClasseDispositivo,
      installato: this._eChiosco(),
      origineSicura: window.isSecureContext,
      invitoPronto: !!this._invitoChiosco,
    });
  },

  async installaChiosco() {
    const invito = this._invitoChiosco;
    if (!invito?.prompt) return;
    /* L'invito si consuma nell'uso: che l'operatore accetti o rifiuti, il
       browser non lo ripropone, e tenerne una copia vorrebbe dire un
       pulsante che dalla seconda volta non fa piu' niente. */
    this._invitoChiosco = null;
    try { await invito.prompt(); } catch { /* rifiutato: non e' un guasto */ }
    this.renderConfig();
  },

  switchView(view: string) {
    this.currentView = view;
    if (view === 'dashboard') this._showRegistry = false;
    this.closeSearchPop();
    document.querySelectorAll<HTMLElement>('.nav-btn, .mob-tab, .hdr-icon-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    for (const id of ['Dashboard','Map','Movimenta','Tasks','Archive','Config']) {
      document.getElementById('view' + id)?.classList.toggle('hidden', view !== id.toLowerCase());
    }
    if (view === 'dashboard') this.renderDashboard();
    else if (view === 'tasks') this.renderTasks();
    else if (view === 'movimenta') this.renderMovimenta();
    else if (view === 'archive') this.renderArchive();
    else if (view === 'config') this.renderConfig();
    else if (view === 'map') {
      if (!this.currentSite) {
        const first = Store.getSites()[0];
        const firstZone = first?.zones?.find(z => z.active);
        if (firstZone) this.openZone(first!.id, firstZone.id);
        else nodo('mapContainer').innerHTML = `<div class="empty-state"><div class="empty-icon">${this._ico('map', '', 'ico-xl')}</div><p>Nessuna zona configurata — vai in Configurazione</p></div>`;
      } else {
        this.renderMap();
      }
    }
  },

  _SIDEBAR_KEY: 'wm_sidebar_collapsed',

  toggleSidebar(force = null) {
    const collapsed = force === null
      ? !document.body.classList.contains('sidebar-collapsed')
      : Boolean(force);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    try { localStorage.setItem(this._SIDEBAR_KEY, collapsed ? '1' : '0'); } catch {}
    if (this.currentView === 'map' && this.currentSite) {
      setTimeout(() => this.renderMap(), 240);
    }
  },

  _loadSidebarState() {
    try {
      if (localStorage.getItem(this._SIDEBAR_KEY) === '1') {
        document.body.classList.add('sidebar-collapsed');
      }
    } catch { /* localStorage disabilitato → colonna aperta, che e' il default */ }
  },

  _syncHeaderHeight() {
    const h = document.querySelector<HTMLElement>('.app-header')?.offsetHeight;
    if (h) document.documentElement.style.setProperty('--hdr-h', `${h}px`);
  },

  // ── Sidebar ──
  renderSidebar() {
    const el = nodo('sidebarContent');
    const sites = Store.getSites();
    if (!sites.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">${this._ico('package', '', 'ico-xl')}</div><p>Nessun sito</p><button class="btn btn-sm btn-primary mt-5" onclick="App.switchView('config')">+ Configura</button></div>`;
      return;
    }
    let html = '';
    for (const site of sites) {
      const zones = (site.zones || []).filter(z => z.active);
      const stats = Store.getSiteStats(site.id);
      const isOpen = this.currentSite === site.id;
      html += `<div class="site-group">
        <div class="site-header" onclick="App.toggleSite('${site.id}')">
          <span class="arrow ${isOpen ? 'open' : ''}">▶</span>
          <span class="site-badge">${this._esc(site.id)}</span>
          <span class="site-name truncate" title="${this._esc(site.name)}">${this._esc(site.name)}</span>
          <span class="site-count">${stats.total}</span>
        </div>
        <div class="zone-list ${isOpen ? '' : 'hidden'}">`;
      for (const zone of zones) {
        const ico = zone.type === 'RACK' ? '▦' : zone.type === 'FLOOR' ? '▤' : '▣';
        const isActive = this.currentZone === zone.id && this.currentSite === site.id;
        html += `<div class="zone-item ${isActive ? 'active' : ''}" onclick="App.openZone('${site.id}','${zone.id}')">
          <span class="zone-type-icon zone-type-${zone.type!.toLowerCase()}">${ico}</span>
          <span class="truncate">${this._esc(zone.name)}</span>
        </div>`;
      }
      if (!zones.length) html += '<div class="py-4 px-7.5 text-body-small text-sx-text-muted">Nessuna zona</div>';
      html += `<div class="zone-item text-sx-accent" onclick="App.showAddZoneModal('${site.id}')">
        <span>+</span><span>Aggiungi zona</span>
      </div>`;
      html += '</div></div>';
    }
    el.innerHTML = html;
  },

  toggleSite(siteId: string) {
    this.currentSite = this.currentSite === siteId ? null : siteId;
    this.renderSidebar();
  },

  openZone(siteId: string, zoneId: string) {
    this.currentSite = siteId;
    this.currentZone = zoneId;
    const zone = Store.getZone(siteId, zoneId);
    if (zone?.type === 'RACK' && zone.levels?.length) this.currentLevel = zone.levels[0]!;
    this.switchView('map');
    this.renderSidebar();
  },

  _fmtKg(v: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  },

  _isoToIt(iso: string) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  /* HTML escape contro XSS */
  _esc(str: unknown) {
    if (str === null || str === undefined) return '';
    /* La tabella ha esattamente i cinque caratteri che l'espressione
       trova: il ripiego su `c` non scatta mai. */
    return String(str).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string, string>)[c] ?? c);
  },

  _payload(obj: unknown) {
    return encodeURIComponent(JSON.stringify(obj)).replace(/'/g, '%27');
  },

  /* 2.23 — L'ICONA. Sta accanto a `_esc` perche' fa lo stesso mestiere: e' un
     pezzo di markup che le viste chiedono da dentro una stringa, e le viste
     chiamano `App` per nome. Il tipo `Icona` fa il resto — un nome che non
     sta nello sprite non compila, mentre prima usciva un quadratino e non se
     ne accorgeva nessuno. */
  _ico(nome: Icona, aria = '', classi = '') {
    return ico(nome, aria, classi);
  },

  _requireOperator(azione = 'questa operazione') {
    if (this._blockedByReadOnly()) return false;
    if (this.currentOperator) return true;
    this.toast(`Operatore non identificato — impossibile registrare ${azione}`, 'error');
    this._openIdentityGate({ initial: true });   // v2.7.0 [G6]
    return false;
  },

  /* v2.1.0 — Sostituto applicativo di prompt() per gli input testuali.
     Restituisce la stringa inserita oppure null se annullato. */
  _promptText({ title, message = '', placeholder = '', value = '', maxlength = 200 }: {
    title: string; message?: string; placeholder?: string; value?: string; maxlength?: number;
  }) {
    const wrap = document.createElement('div');
    const input = document.createElement('input');
    input.className = 'input';
    input.id = 'dlgTextInput';
    input.type = 'text';
    input.autocomplete = 'off';
    input.maxLength = maxlength;
    input.placeholder = placeholder;
    input.value = value;
    input.style.marginTop = '0.5rem';
    // Il dialogo svuota il proprio contenitore alla chiusura: il valore va
    // catturato mentre l'utente digita, non dopo.
    this._lastTextValue = value;
    input.addEventListener('input', () => { this._lastTextValue = input.value; });
    wrap.appendChild(input);
    return Dialog.confirm({
      title, message, details: wrap,
      confirmLabel: 'Conferma', icon: 'pencil',
      focusTarget: 'dlgTextInput'
    }).then(ok => (ok ? (this._lastTextValue || '') : null))
      .catch(() => null);
  },

  /* Maschera live: rimuove i non-numerici e inserisce le barre durante la digitazione */
  _dateMaskInput(el: HTMLInputElement) {
    const digits = el.value.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    el.value = out;
  },

  /* Alla perdita di focus (o su Invio) normalizza la visualizzazione:
     espande l'anno a 2 cifre e riallinea le barre. Non tocca input non validi. */
  _dateMaskBlur(el: HTMLInputElement) {
    const iso = this._dateITtoISO(el.value);
    if (iso) el.value = this._dateISOtoIT(iso);
  },

  _dateITtoISO(value: string, warnLabel: string | null = null) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    let dd, mm, yyyy;
    if (digits.length === 6) { dd = digits.slice(0, 2); mm = digits.slice(2, 4); yyyy = '20' + digits.slice(4); }
    else if (digits.length === 8) { dd = digits.slice(0, 2); mm = digits.slice(2, 4); yyyy = digits.slice(4); }
    else {
      if (warnLabel) this.toast(`${warnLabel}: data incompleta — digitare ggmmaa oppure ggmmaaaa`, 'warning');
      return null;
    }
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    const dt = new Date(y, m - 1, d);
    const valid = y >= 2000 && y <= 2199 && m >= 1 && m <= 12 && d >= 1 &&
      dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    if (!valid) {
      if (warnLabel) this.toast(`${warnLabel}: data non valida (${dd}/${mm}/${yyyy})`, 'warning');
      return null;
    }
    return `${yyyy}-${mm}-${dd}`;
  },

  /* ISO yyyy-mm-dd (o legacy yyyy-mm) → gg/mm/aaaa per la visualizzazione nei campi */
  _dateISOtoIT(iso: string) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(iso).trim());
    if (!m) return String(iso);
    return `${m[3] || '01'}/${m[2]}/${m[1]}`;
  },

  /* Normalizza input scanner barcode (layout IT vs US) */
  _normScan(fieldId: string) {
    const el = campo(fieldId);
    if (!el) return;
    /* Un campo che non e' di testo non ha cursore: `null` contava zero
       anche prima, nella somma qui sotto. */
    const pos = el.selectionStart ?? 0;
    const before = el.value;
    el.value = before.replace(/['\u2018\u2019`]/g, '-').toUpperCase();
    if (el.value !== before) {
      const diff = el.value.length - before.length;
      try { el.setSelectionRange(pos + diff, pos + diff); } catch {}
    }
  },

  /* ═══════════════════════════════════════════════════════════════════
     2.9 — IL CAMPO SCANSIONATO BENE SI VEDE DA LONTANO
     © Andrea Sacchetti — Dietopack S.r.l.

     Fino alla 2.8 la conferma di una lettura era un suono e una riga di
     testo sotto la maschera. Vanno bene tutti e due, e nessuno dei due
     risponde alla domanda che l'operatore si fa davvero: «quali ho già
     fatto?». Il suono è passato — chi arriva un secondo dopo non l'ha
     sentito — e la riga di testo parla dell'ULTIMA lettura, non delle tre.

     Il colore invece RESTA, e resta su ogni campo per conto suo: uno
     sguardo alla maschera da un metro e mezzo dice quanti passi mancano,
     senza leggere niente. È l'unica forma di riscontro che funziona con i
     guanti, il rumore del muletto e il terminale appoggiato al bancale.

     PERCHÉ NON BASTA IL BORDO VERDE. Un filetto da un pixel a un metro e
     mezzo non esiste. Servono tre cose insieme: la barra spessa a sinistra,
     che è la parte che si vede per prima perché è la più grande area di
     colore pieno; lo sfondo tenue, che colora il campo INTERO; e la spunta
     a destra, che disambigua per chi non distingue bene i colori — un verde
     e un grigio chiaro si somigliano molto in una deuteranopia.

     SI SPEGNE DA SÉ AL PRIMO TASTO. Un campo che resta verde dopo che
     qualcuno ha ricominciato a scriverci dentro è peggio di nessun
     riscontro: dichiara vero un dato che nessuno ha più verificato. Il
     `once: true` fa sparire il segno alla prima modifica, e tocca alla
     maschera rimetterlo dopo il controllo nuovo. */
  _campoScansionato(fieldId: string, ok = true) {
    const el = campo(fieldId);
    if (!el) return;
    el.classList.toggle('campo-ok', !!ok);
    if (!ok) return;
    el.addEventListener('input', () => el.classList.remove('campo-ok'), { once: true });
  },

  /** Spegne il segno su più campi in un gesto: serve quando una maschera si
      riapre, o quando un passo precedente decade e i successivi con lui. */
  _campiScansioneReset(...fieldIds: string[]) {
    for (const id of fieldIds) campo(id)?.classList.remove('campo-ok');
  },

  _getLocInfo(code: string) {
    for (const site of Store.getSites()) {
      for (const zone of (site.zones || []).filter(z => z.active)) {
        if (Store.generateLocations(site.id, zone.id).find(l => l.code === code)) {
          return { siteName: site.name, zoneName: zone.name, status: Store.getLocationStatus(code), itemCount: Store.getItemsAtLocation(code).length };
        }
      }
    }
    return null;
  },

  _previewLoc(inputId: string, previewId: string) {
    const code = Validate.clean(campo(inputId)?.value, true).replace(/'/g, '-');
    const el = document.getElementById(previewId);
    if (!el) return;
    if (!code || code.length < 3) { el.innerHTML = ''; return; }
    /* 2.1  IL CAMPO ACCETTA ANCHE UN'UNITA' DI CARICO, E L'ANTEPRIMA
       DEVE SAPERLO.

       Il posizionamento prende come destinazione un vano OPPURE il codice
       di un'unita' aperta  un campo solo, perche' chi ha il lettore in
       mano scansiona quello che ha davanti e non deve sapere in quale
       casella va cosa. Ma l'anteprima cercava solo fra le ubicazioni, e a
       un'etichetta di pallet rispondeva «non trovata» in rosso: la
       conferma sarebbe andata a buon fine, e intanto lo schermo diceva a
       chi sta lavorando che quel codice non esiste. Trovato da Andrea in
       produzione, alla prima scansione, il 19/08.

       Qui si dice cosa succedera' davvero: quale unita', in quale vano, e
       quante righe ci sono gia' sopra. */
    const versoUdc = Store.getUdcAperte().find(u => u.udc_id === code);
    if (versoUdc) {
      const dove = String(versoUdc.location_code || '').trim();
      const righe = Store.righeDiUdc(versoUdc.udc_id).length;
      el.innerHTML = dove
        ? `<div class="mov-preview mov-preview-ok">
            <div class="flex justify-between items-center">
              <div>${this._ico('arrows-shuffle')} <span class="mono font-bold">${this._esc(code)}</span>
              <span class="text-body-small text-sx-text-muted ml-4">unità di carico · ${this._esc(versoUdc.type || 'pallet')}</span></div>
              <div><span class="badge badge-green">${this._ico('map-pin')} ${this._esc(dove)}</span>
              <span class="text-label-small text-sx-text-muted ml-3">${righe} righe sopra</span></div>
            </div>
            <div class="text-label-small text-sx-text-muted mt-2">La merce si posiziona nel vano dell'unità e le resta sopra: spostando l'unità, si sposta anche lei.</div>
          </div>`
        : `<div class="mov-preview mov-preview-err">${this._ico('alert-triangle')} <span class="mono">${this._esc(code)}</span> non ha un'ubicazione: posizionala prima, o scegli un vano</div>`;
      return;
    }

    const info = this._getLocInfo(code);
    if (info) {
      const cls = info.status === 'blocked' ? 'err' : info.status === 'occupied' ? 'ok' : info.status === 'reserved' ? 'warn' : '';
      el.innerHTML = `<div class="mov-preview ${cls ? 'mov-preview-'+cls : ''}">
        <div class="flex justify-between items-center">
          <div><span class="mono font-bold">${this._esc(code)}</span>
          <span class="text-body-small text-sx-text-muted ml-4">${this._esc(info.siteName)} · ${this._esc(info.zoneName)}</span></div>
          <div><span class="badge badge-${info.status === 'occupied' ? 'green' : info.status === 'blocked' ? 'red' : info.status === 'reserved' ? 'amber' : 'muted'}">${info.status}</span>
          <span class="text-label-small text-sx-text-muted ml-3">${info.itemCount} item</span></div>
        </div>
      </div>`;
    } else if (code.length >= 5) {
      el.innerHTML = `<div class="mov-preview mov-preview-err">${this._ico('alert-triangle')} "${this._esc(code)}" non trovata</div>`;
    } else { el.innerHTML = ''; }
  },

  /* Modal universale selezione ubicazione */
  /* L'overlay ha un id SUO, e non quello di `showModal`. Dalla 1.4.3 questo
     selettore si apre anche da dentro una modale — la maschera di creazione
     di un'attività — e due overlay con lo stesso `modalOverlay` sono due
     elementi che `getElementById` non distingue: restituisce il primo, cioè
     la maschera sotto, e `closeModal()` chiudeva quella lasciando in piedi
     il selettore. Stessa forma di `_showReleaseDestDialog`. */
  _pickLoc(targetInputId: string, callbackName: string) {
    document.getElementById('pickLocOverlay')?.remove();
    const sites = Store.getSites();
    let html = '<div class="max-h-[400px] overflow-y-auto">';
    for (const site of sites) {
      for (const zone of (site.zones || []).filter(z => z.active)) {
        const locs = Store.generateLocations(site.id, zone.id);
        const avail = locs.filter(l => { const s = Store.getLocationStatus(l.code); return s !== 'blocked' && s !== 'disabled'; });
        if (!avail.length) continue;
        html += `<div class="mb-5"><div class="text-label-small font-bold text-sx-text-muted uppercase mb-2">${this._esc(site.id)} · ${this._esc(zone.name)} (${avail.length})</div>`;
        for (const loc of avail.slice(0, 40)) {
          const st = Store.getLocationStatus(loc.code);
          const ic = Store.getItemsAtLocation(loc.code).length;
          const cb = callbackName ? `;App.${callbackName}()` : '';
          html += `<div class="search-result-item" onclick="document.getElementById('${targetInputId}').value='${loc.code}';App._closePickLoc()${cb}">
            <span class="mono font-bold">${this._esc(loc.code)}</span>
            <span class="ml-auto text-label-small"><span class="badge badge-${st === 'occupied' ? 'green' : st === 'reserved' ? 'amber' : 'muted'}">${st}</span>${ic ? ' · ' + ic + ' item' : ''}</span>
          </div>`;
        }
        if (avail.length > 40) html += `<div class="text-label-small text-sx-text-muted py-2 px-5">... e altre ${avail.length - 40}</div>`;
        html += '</div>';
      }
    }
    if (html === '<div class="max-h-[400px] overflow-y-auto">') html += '<div class="empty-state"><p>Nessuna ubicazione disponibile</p></div>';
    html += '</div>';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'pickLocOverlay';
    overlay.onclick = (e) => { if (e.target === overlay) this._closePickLoc(); };
    overlay.innerHTML = `<div class="modal">
      <div class="modal-header"><h2>${this._ico('map-pin')} Seleziona Ubicazione</h2><button class="btn btn-sm btn-icon btn-ghost" onclick="App._closePickLoc()">${this._ico('x', 'Chiudi')}</button></div>
      <div class="modal-body">${html}</div>
    </div>`;
    document.body.appendChild(overlay);
  },

  _closePickLoc() { document.getElementById('pickLocOverlay')?.remove(); },

  goToLocation(code: string) {
    const parts = code.split('-');
    const siteId = parts[0]!;   // una stringa divisa ha sempre un primo pezzo
    const site = Store.getSite(siteId);
    if (!site) return;
    for (const zone of (site.zones || []).filter(z => z.active)) {
      if (Store.generateLocations(siteId, zone.id).find(l => l.code === code)) {
        this.currentSite = siteId;
        this.currentZone = zone.id;
        if (zone.type === 'RACK') {
          const last = parts[parts.length - 1]!;
          if ((zone.levels || []).includes(last)) this.currentLevel = last;
        }
        this.selectedLocation = code;
        this.switchView('map');
        setTimeout(() => {
          this.renderDetail(code);
          nodo('detailPanel').classList.remove('collapsed');
          document.body.classList.add('detail-open');
          this._flashLocation(code);
        }, 50);
        this.renderSidebar();
        return;
      }
    }
  },

  /* Lampeggio della cella raggiunta: su una griglia di trecento ubicazioni la
     sola selezione non basta a farsi trovare dall'occhio. */
  _flashLocation(code: string) {
    const cells = document.querySelectorAll<HTMLElement>(`[data-loc="${CSS.escape(code)}"]`);
    if (!cells.length) return;
    cells[0]!.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    for (const c of cells) {
      c.classList.remove('loc-cell--flash');
      void c.offsetWidth;                 // forza il restart dell'animazione
      c.classList.add('loc-cell--flash');
      setTimeout(() => c.classList.remove('loc-cell--flash'), 1400);
    }
  },

  // ═══ Modals CRUD ═══
  /* Si toglie quello di prima: `modalOverlay` e' uno solo, come gia' fanno
     `_pickLoc`, `_scegliColli` e `_shipMostraDestinazioni` con i loro id.
     Senza questa riga una finestra che si ridisegna da dentro un proprio
     gestore — Personalizza il cruscotto, a ogni spunta — ne impila una nuova
     sopra l'altra, e `closeModal()` toglie la PRIMA del documento, cioe'
     quella sotto: si clicca Chiudi tante volte quante sono le modifiche. */
  /* 2.9 — `classi` allarga il riquadro dove serve, e SOLO dove serve.

     I 500 px di `.modal` sono giusti per una domanda con due campi, ed è
     il caso di quasi tutte le maschere. Un ELENCO è un'altra cosa: sette
     colonne in 442 px utili si spezzano ognuna su cinque righe, e una
     riga alta 261 px ne lascia vedere due per schermata. Misurato il
     26/08 sull'elenco delle giacenze fuori posto, che ne ha 46. */
  showModal(title: string, bodyHtml: string, footerHtml = '', classi = '') {
    document.getElementById('modalOverlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalOverlay';
    overlay.onclick = (e) => { if (e.target === overlay) this.closeModal(); };
    overlay.innerHTML = `<div class="modal ${classi}">
      <div class="modal-header"><h2>${title}</h2><button class="btn btn-sm btn-icon btn-ghost" onclick="App.closeModal()">${this._ico('x', 'Chiudi')}</button></div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>`;
    document.body.appendChild(overlay);
  },
  closeModal() { document.getElementById('modalOverlay')?.remove(); },

  // ═══ Sync indicator + toast ═══
  updateSyncIndicator() {
    const meta = Store.getMeta();
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncText');
    const btn = document.getElementById('syncIndicator');
    if (!dot || !text) return;
    if (this._saving) return;   // durante il checkpoint comanda _saveCheckpoint()
    const when = meta.lastModified
      ? new Date(meta.lastModified).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : 'mai';
    dot.classList.remove('saving');
    /* 2.16 — SERVITO, «NON SALVATO» E' UNA BUGIA ROSSA.
       `_touchMeta` alza `unsavedChanges` a ogni mutazione, e da quando il
       salvataggio a mano non c'e' piu' (2.1) nessuno lo riabbassa: su una
       macchina servita l'indicatore restava rosso per sempre, e diceva a chi
       lavora che la merce appena scansionata poteva perdersi. Non e' vero —
       la riga e' in PostgreSQL prima che la chiamata torni. Il servizio che
       non risponde ha gia' la sua schermata, `_showServiceDown`. */
    if (Store.eServito()) {
      dot.classList.remove('unsaved');
      text.textContent = 'In linea';
      if (btn) btn.title = `Ogni gesto è scritto sul database del servizio — ultima scrittura: ${when}.`;
      return;
    }
    if (meta.unsavedChanges) {
      dot.classList.add('unsaved');
      text.textContent = 'Non salvato';
      if (btn) btn.title = `Ci sono modifiche non ancora scritte — ultimo salvataggio: ${when}.`;
    } else {
      dot.classList.remove('unsaved');
      text.textContent = 'Salvato';
      if (btn) btn.title = `Salvato — ultimo checkpoint: ${when}.`;
    }
  },

  /* 2.1 — IL SALVATAGGIO A MANO NON C'È PIÙ.

     `manualSave` viveva sotto il clic dell'indicatore in barra ed era la
     terza faccia dello stesso gesto — «💾 Salva ora» in Configurazione, la
     stessa in Dashboard, e questa. Non c'era niente da forzare: ogni
     mutazione passa già da `Persistence`, e il checkpoint resta dove serve
     davvero — all'uscita dell'operatore e alla scadenza della sessione, dove
     chi smonta non deve ricordarsi di premere nulla.

     L'indicatore resta, e dice soltanto: è il suo mestiere. */
  _saving: false,

  toast(message: unknown, type = 'info') {
    const kindMap = { success: 'ok', error: 'error', warning: 'warn', info: 'info' };
    const kind = kindMap[type as keyof typeof kindMap] || 'info';
    const msg = String(message ?? '');
    const sep = msg.indexOf(' · ');
    const title = sep > 0 ? msg.slice(0, sep).trim() : msg;
    const detail = sep > 0 ? msg.slice(sep + 3).trim() : '';
    Feedback.signal(kind, title, detail);
  },

  UNDO_WINDOW_MS: 120000,
  _undoEntry: null as VoceAnnulla | null,
  /* `undefined` e non `null`: `clearInterval` accetta l'uno e non l'altro. */
  _undoTimer: undefined as ReturnType<typeof setInterval> | undefined,

  /* actions: [{ op:'add'|'remove', loc, art, desc, lot, exp, notes, qty }] */
  _pushUndo(label: string, actions: AzioneAnnulla[]) {
    if (!Array.isArray(actions) || !actions.length) return;
    this._undoEntry = { label, actions, ts: Date.now() };
    clearInterval(this._undoTimer);
    this._undoTimer = setInterval(() => this._renderUndoBar(), 1000);
    this._renderUndoBar();
  },

  _undoValid() {
    return Boolean(this._undoEntry) && (Date.now() - this._undoEntry!.ts) < this.UNDO_WINDOW_MS;
  },

  _undoBarHTML() {
    if (!this._undoValid()) return '';
    const left = Math.max(0, Math.ceil((this.UNDO_WINDOW_MS - (Date.now() - this._undoEntry!.ts)) / 1000));
    return `<div class="undo-bar">
      <span class="text-body-large">↩</span>
      <span class="undo-label">Ultima operazione: <strong>${this._esc(this._undoEntry!.label)}</strong></span>
      <span class="undo-timer">${left}s</span>
      <button class="btn btn-sm btn-warning" onclick="App._undoLast()">ANNULLA</button>
    </div>`;
  },

  _renderUndoBar() {
    const host = document.getElementById('undoBarArea');
    if (!host) return;
    if (!this._undoValid()) {
      host.innerHTML = '';
      clearInterval(this._undoTimer);
      this._undoEntry = null;
      return;
    }
    host.innerHTML = this._undoBarHTML();
  },

  async _undoLast() {
    if (!this._undoValid()) {
      return this.toast('Finestra di annullamento scaduta — usare una rettifica inventariale', 'warning');
    }
    /* `_undoValid()` due righe sopra ha gia' guardato che ci sia. */
    const entry = this._undoEntry!;
    const ok = await Dialog.confirm({
      title: 'Annullare l\u2019ultima operazione?',
      message: 'Verra\u0300 eseguito il movimento inverso e registrato a log come rettifica. Nessun dato viene cancellato.',
      details: Dialog.kv([
        ['Operazione', entry.label],
        ['Righe da stornare', entry.actions.length]
      ]),
      confirmLabel: 'Storna operazione',
      danger: true
    });
    if (!ok) return;

    let done = 0;
    for (const a of entry.actions) {
      try {
        if (a.op === 'add') {
          /* 1.4.2 — lo storno rimette esattamente le UM che erano uscite.
             `a.qty_uom` assente lascia derivare dai colli pieni, che e' il
             caso di ogni storno registrato prima di questa versione. */
          /* 1.8 — e se lo storno conosce i colli usciti li rimette uno per
             uno: `a.packs` porta anche il collo che era stato aperto, che
             derivato dai colli pieni tornerebbe intero. */
          /* 2.0 — E SE SA COM'ERA LA RIGA, LA RIDICHIARA. Rimettere dieci
             chili presi da un sacco da venticinque non e' aggiungere un
             sacco da dieci: il sacco torna pieno, e a scaffale i colli
             restano quelli di prima. Senza questo il totale tornava e
             l'elenco no — tre colli diventavano quattro, e lo scopriva chi
             andava a contare. */
          const rigaOra = Store.getItemsAtLocation(a.loc).find(x => x.item_key === `${a.art}#${a.lot}`);
          const cfgOra = a.packs_prima ? Store.getUomConfig(a.art, a.lot) : null;
          const elencoOra = cfgOra && rigaOra ? Store.colliDiRiga(rigaOra) : null;
          const diff = (cfgOra && elencoOra) ? rettificaColli(elencoOra, a.packs_prima!, cfgOra.uom) : null;

          if (diff) {
            /* Chi conta non toglie e non aggiunge: dichiara com'e' fatto lo
               scaffale, e la differenza la traduce `rettifica`. Le uscite
               vengono prima: una riga che deve calare e crescere insieme,
               fatta al contrario, passa da un massimo che a scaffale non
               c'e' mai stato. */
            if (diff.uscite.length) {
              const scelteGiu = Store.scelteDaUscite(rigaOra, diff.uscite);
              const via = await Store.removeItem(a.loc, `${a.art}#${a.lot}`, null, null, scelteGiu);
              if (via) {
                await this._logMov(MOV.FIX_OUT, a.art, a.desc || '', a.lot, a.loc, null, '',
                  `STORNO — ${entry.label}`, '', via._qty_before, via._qty_delta, via._qty_after, via._qty_uom_delta);
              }
            }
            if (diff.entrate.length) {
              /* 2.8 — CORREZIONE, NON POSIZIONAMENTO: uno storno rimette la merce
                 dov'era, e la regola dell'ubicazione unica non deve poter
                 impedire di correggere un errore. Vedi `addItem`. */
              const su = await Store.addItem(a.loc, a.art, a.desc || '', a.lot, a.exp || '', a.notes || '', diff.entrate.length, null, diff.entrate, { regolaBase: false });
              await this._logMov(MOV.FIX_IN, a.art, a.desc || '', a.lot, a.loc, null, '',
                `STORNO — ${entry.label}`, '', su.qty_before, diff.entrate.length, su.qty_after, su.qty_uom_delta);
            }
          } else {
            const r = await Store.addItem(a.loc, a.art, a.desc || '', a.lot, a.exp || '', a.notes || '', a.qty, a.qty_uom ?? null, a.packs ?? null, { regolaBase: false });
            await this._logMov(MOV.FIX_IN, a.art, a.desc || '', a.lot, a.loc, null, '',
              `STORNO — ${entry.label}`, '', r.qty_before, a.qty, r.qty_after, r.qty_uom_delta);
          }
        } else {
          /* 1.8 \u2014 i colli entrati si ritrovano per misura sulla riga di
             adesso; se uno non c'\u00e8 pi\u00f9, lo storno si ferma e lo dice invece
             di portarne via un altro. */
          const rigaOra = Store.getItemsAtLocation(a.loc).find(x => x.item_key === `${a.art}#${a.lot}`);
          const scelteStorno = a.packs ? Store.scelteDaColli(rigaOra, a.packs) : null;
          const r = await Store.removeItem(a.loc, `${a.art}#${a.lot}`, a.qty, a.qty_uom ?? null, scelteStorno);
          if (!r) throw new Error('item non piu\u0300 presente');
          await this._logMov(MOV.FIX_OUT, a.art, a.desc || '', a.lot, a.loc, null, '',
            `STORNO — ${entry.label}`, '', r._qty_before, r._qty_delta, r._qty_after, r._qty_uom_delta);
        }
        done++;
      } catch (err) {
        console.error('Storno riga fallito', err);
      }
    }
    this._undoEntry = null;
    clearInterval(this._undoTimer);
    this._renderUndoBar();
    this._refreshSessionLog();
    this.updateSyncIndicator();
    if (done === entry.actions.length) {
      this.toast(`Operazione stornata (${done} righe) · rettifica registrata a log`, 'success');
    } else {
      this.toast(`Storno parziale: ${done}/${entry.actions.length} righe · verificare le giacenze`, 'warning');
    }
  },

  _primaryScanField: null as string | null,

  setPrimaryScanField(id: string | null) {
    this._primaryScanField = id || null;
    const el = id ? document.getElementById(id) : null;
    document.querySelectorAll('.scan-active').forEach(n => n.classList.remove('scan-active'));
    if (el) { el.classList.add('scan-active'); el.focus(); }
  },

  _focusKeeper(e: KeyboardEvent) {
    if (Dialog.isOpen) return;
    if (this._gateOpen) return;   // v2.7.0 [G6] — col gate aperto i tasti sono suoi
    if (!this._primaryScanField) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key.length !== 1) return;                     // solo caratteri stampabili
    const ae = document.activeElement as HTMLElement | null;
    const editable = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
    if (editable) return;
    const target = campo(this._primaryScanField);
    if (!target) return;
    e.preventDefault();
    target.focus();
    target.value += e.key;
  },

  _shortcuts(e: KeyboardEvent) {
    if (Dialog.isOpen) return;
    /* v2.7.0 [G6] — Il gate di identita' e' un blocco: finche' e' aperto
       nessuna scorciatoia deve poter agire su cio' che sta sotto. */
    if (this._gateOpen) return;
    const ae = document.activeElement as HTMLElement | null;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);

    if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const input = campo('hdrSearchInput');
      if (input) { input.focus(); input.select(); }
      return;
    }
    /* v2.7.0 [G4] — Ctrl+B apre e chiude la colonna Siti e Zone. */
    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      this.toggleSidebar();
      return;
    }

    if (e.key === 'Escape' && this._movMode) {
      e.preventDefault();
      this.cancelMov();
      this.renderMovimenta();
      this.toast('Operazione annullata', 'info');
      return;
    }
    /* 2.29.1 — LA TABELLA STA IN `modules/cruscotto.ts`, non piu' qui.
       Era scritta due volte — una per ascoltare la tastiera, una per
       stampare il tasto sulla scheda — e le due copie erano divergiute: due
       schede dicevano F3 e F3 non portava a nessuna delle due. Adesso c'e'
       un elenco solo, e la scheda gli chiede il suo tasto.

       E si passa per `_goOp`, non piu' per `startMov`: e' `_goOp` che sa
       aprire anche la SOTTOSCHEDA. Senza, F3 apriva il prelievo sull'ultima
       scheda usata invece che sul trasferimento. */
    const combinazione = TASTI_FUNZIONE[e.key];
    if (combinazione) {
      e.preventDefault();
      this._goOp(combinazione.mode, combinazione.sub);
      return;
    }
    if (e.key === 'F9' && !typing && this._undoValid()) {
      e.preventDefault();
      this._undoLast();
    }
  }
});

/* LE VISTE ESTRATTE RIENTRANO IN `App`.

   `app.js` si scompone in blocchi, ma `App` resta un oggetto solo: l'indice e
   i gestori costruiti dentro le stringhe lo chiamano per nome. La guardia
   serve a una cosa sola — estrarre e' SPOSTARE. Un metodo rimasto anche di
   qua verrebbe sovrascritto in silenzio, e da quel momento girerebbero due
   versioni della stessa maschera con una sola visibile. */
for (const vista of [VistaDestinatari, VistaParametri, VistaCompiti, VistaCampionamento, VistaMovimenta, VistaPosiziona, VistaSmaltimento, VistaPrelievo, VistaPercorso, VistaRapportoPrelievo, VistaInventario, VistaUdc, VistaProdottoFinito, VistaCaricoSpedizione, VistaWip, VistaQuarantena, VistaSpedizioni, VistaDocumento, VistaMappa, VistaGiacenze, VistaStampaEtichette, VistaConfigOperatori, VistaConfigSiti, VistaConfigArticoli, VistaConfigDati, VistaConfigurazione, VistaCruscotto, VistaRegistro, VistaArchivio, VistaRicerca]) {
  /* Qui si scrive per nome, e un nome non e' una chiave dichiarata: le due
     letture servono a questo e non aggiungono niente a runtime. */
  const dentro = App as unknown as Record<string, unknown>;
  const fuori = vista as unknown as Record<string, unknown>;
  for (const nome of Object.keys(vista)) {
    if (nome in App) throw new Error(`vista: ${nome} e' gia' in App`);
    dentro[nome] = fuori[nome];
  }
}


export { App };
