/* `App` E' UN NOME GLOBALE IN PAGINA, E QUALCHE CORPO ESTRATTO LO USA.

   `main.js` scrive `window.App = App`, ed e' cosi' che i 258 gestori
   costruiti dentro le stringhe lo chiamano — `onclick="App.<metodo>()"`.
   Qualche metodo fa la stessa cosa da dentro un `setTimeout`, e quando esce
   da `app.js` quel nome non e' piu' il `const` del modulo: e' il globale.

   Dichiararlo qui e' l'unico modo di spostare quei corpi senza riscriverli.
   Non aggiunge niente in pagina: un file `.d.ts` non produce codice. */
declare const App: any;
