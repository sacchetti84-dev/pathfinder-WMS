/* LA RETE DELL'ESTRAZIONE DELLE VISTE.

   Le viste escono da `app.js` a blocchi e rientrano in `App` con
   `Object.assign`. Niente, in questo giro, e' coperto dai collaudi che
   contano: `app.js` non ha prove sue, e un metodo perso o mai rientrato si
   vede solo il giorno che qualcuno preme quel pulsante in corsia.

   Queste due prove sono l'unica cosa che sta fra un'estrazione e un pulsante
   muto. La prima dice che App espone ancora gli stessi nomi; la seconda che
   ogni `App.qualcosa` scritto nell'indice o costruito dentro una stringa
   trova a chi rispondere. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { App } from '../src/ui/app.js';
import { SUPERFICIE } from './superficie-app.dati.js';

test('App espone gli stessi nomi di prima dell\'estrazione', () => {
  expect(Object.keys(App).sort()).toEqual([...SUPERFICIE].sort());
});

test('ogni App.qualcosa citato nel sorgente esiste', () => {
  const viste = fs.existsSync('src/ui/views')
    ? fs.readdirSync('src/ui/views').filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .map((f) => path.join('src/ui/views', f))
    : [];
  const sorgente = ['index.html', 'src/ui/app.js', 'src/main.js', ...viste]
    .map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  /* `App.${...}` dentro un template non e' un nome, e' un nome calcolato. */
  const citati = [...new Set([...sorgente.matchAll(/App\.([_a-zA-Z][_a-zA-Z0-9]*)/g)]
    .map((m) => m[1]))].sort();

  expect(citati.filter((nome) => !(nome in App))).toEqual([]);
  expect(citati.length).toBeGreaterThan(200);
});
