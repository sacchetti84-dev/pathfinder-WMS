/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — codice dell'applicativo
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   FASE 1 — questo file è il contenuto dello <script> di pathfinder-1.1.html,
   spostato senza modifiche. Non una funzione è cambiata, non una riga è stata
   riordinata: cambia solo dove vive. Le divisioni per dominio arrivano in
   Fase 2, una per volta, con il collaudo in mezzo.

   COSA È CAMBIATO DAVVERO, E PERCHÉ.

   1. Dexie e SheetJS non scendono più da un CDN. Erano due <script> nella
      testata, e volevano internet a ogni avvio: su un PC di magazzino senza
      linea l'applicativo non partiva. Ora entrano da npm e finiscono dentro
      il file costruito.

   2. In fondo c'è "window.App = App". Un modulo ES6 non regala niente al
      resto della pagina: ciò che dichiara resta suo. Ma l'HTML chiama App
      per nome in 366 punti (onclick="App.switchView(...)"), e senza quella
      riga ogni bottone smetterebbe di funzionare — in silenzio, perché
      l'errore compare solo quando qualcuno preme. È l'unico nome che deve
      restare visibile da fuori: le altre 23 dichiarazioni di questo file
      non le cerca nessuno dall'HTML. Verificato, non supposto.
   ═══════════════════════════════════════════════════════════════════ */

// I fogli di stile, NELL'ORDINE IN CUI STAVANO NEL FILE. L'ordine non è
// estetico: è la cascata. Invertirne due cambia quale regola vince.
import './styles/01-base.css';
import './styles/02-dash-charts.css';
import './styles/03-dash-sections.css';
import './styles/04-dash-quick.css';
import './styles/05-pick-report.css';

import { Persistence } from './core/persistence/index';
import { App } from './ui/app.js';


// ═══════════════════════════════════════════════════════════════════
// BOOT — © Andrea Sacchetti — Warehouse Mapper v2.1.0
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => { App.init(); });

window.addEventListener('beforeunload', (e) => {
  /* v2.8.0 [H3] — La domanda va posta se c'e' qualcosa di davvero a rischio:
     movimenti in coda di recupero. Le "modifiche non salvate" non sono un
     motivo — ogni scrittura e' gia' su disco in transazione propria, e da
     quando esiste il checkpoint verificato [H1] il flag unsavedChanges dice
     "non e' stato fatto un controllo", non "stai per perdere dati". */
  if (App._recoveryQueue().length) {
    e.preventDefault();
    e.returnValue = 'Ci sono movimenti eseguiti ma non ancora registrati. Uscire adesso li lascia in sospeso.';
  }
});

/* ═══════════════════════════════════════════════════════════════════
   v2.8.0 [H3] — RETE GLOBALE SUGLI ERRORI
   © Andrea Sacchetti — Dietopack S.r.l.

   Fino alla v2.7.0 una promise rifiutata e non gestita finiva nella console
   e basta. In un applicativo da reparto la console non la guarda nessuno:
   l'operatore vedeva un pulsante che non faceva niente e riprovava, magari
   raddoppiando un movimento. Da qui in avanti ogni errore che sfugge arriva
   a schermo, e quelli di spazio esaurito lo dicono con parole proprie.
   ═══════════════════════════════════════════════════════════════════ */
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  console.error('[WM] promise non gestita:', err);
  if (typeof App === 'undefined' || !App.toast) return;
  if (err?.code === 'DISK_FULL' || Persistence.diskFull) {
    App.toast('Spazio di archiviazione esaurito — esporta un backup e libera spazio prima di continuare', 'error');
  } else {
    App.toast(`Operazione non riuscita · ${err?.message || 'errore imprevisto'}`, 'error');
  }
});

window.addEventListener('error', (e) => {
  console.error('[WM] errore non gestito:', e.error || e.message);
  if (typeof App === 'undefined' || !App.toast) return;
  /* Gli errori di caricamento risorsa (immagini, script) hanno target e non
     riguardano l'operativita': non vale la pena allarmare per quelli. */
  if (e.target && e.target !== window) return;
  App.toast(`Errore imprevisto · ${e.message || 'vedi console'}`, 'error');
});

// © Andrea Sacchetti — Dietopack S.r.l. — Pathfinder 1.1 — Fine script

/* ═══════════════════════════════════════════════════════════════════
   L'UNICA COSA CHE ESCE DA QUESTO MODULO.
   Vedi la nota 2 in testata: l'HTML chiama App per nome. Finché gli handler
   stanno negli attributi (onclick="App.qualcosa()") questa riga è ciò che
   li tiene vivi. Il giorno in cui si passerà agli ascoltatori registrati da
   codice, questa riga sarà l'ultima a poter sparire — e sarà la prova che
   non serve più a nessuno.
   ═══════════════════════════════════════════════════════════════════ */
window.App = App;

