// I fogli di stile, NELL'ORDINE IN CUI STAVANO NEL FILE. L'ordine non è
// estetico: è la cascata. Invertirne due cambia quale regola vince.
import './styles/01-base.css';
import './styles/02-dash-charts.css';
import './styles/03-dash-sections.css';
import './styles/04-dash-quick.css';
import './styles/05-pick-report.css';

import { Persistence } from './core/persistence/index';
import { App } from './ui/app.js';

document.addEventListener('DOMContentLoaded', () => { App.init(); });

window.addEventListener('beforeunload', (e) => {
  if (App._recoveryQueue().length) {
    e.preventDefault();
    e.returnValue = 'Ci sono movimenti eseguiti ma non ancora registrati. Uscire adesso li lascia in sospeso.';
  }
});

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

// © Andrea Sacchetti — Dietopack S.r.l. — Pathfinder 1.4 — Fine script

window.App = App;
