// Un foglio solo: `00-tailwind.css` tira dentro gli altri nove con `@import
// ... layer(app)`. L'ordine fra loro e' rimasto quello di sempre — e' la
// cascata, invertirne due cambia quale regola vince — ma adesso e' scritto
// li', perche' e' l'`@import` che sa mettere un foglio dentro un layer.
import './styles/00-tailwind.css';

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

// © Andrea Sacchetti — Dietopack S.r.l. — Pathfinder 1.7 — Fine script

window.App = App;
