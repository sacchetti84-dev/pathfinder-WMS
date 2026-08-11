/* ═══════════════════════════════════════════════════════════════════
   PATHFINDER — configurazione della build
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   PERCHÉ UNA BUILD CHE PRODUCE UN FILE SOLO.
   Il sorgente si scompone perché 17.700 righe in un file non si mantengono.
   La distribuzione si ricompone perché in magazzino un applicativo che è un
   file solo si copia, si apre con doppio clic quando il servizio è giù, e
   non ha una cartella di pezzi che qualcuno può copiare a metà.
   Le due esigenze non sono in conflitto: sono due momenti diversi.
   ═══════════════════════════════════════════════════════════════════ */
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

/* La cartella di consegna: quella che si copia sul PC di magazzino. Si chiama
   come la versione perché il nome della cartella è la prima cosa che si legge,
   e deve dire cosa c'è dentro senza aprirla. */
const CONSEGNA = 'Pathfinder 1.2';

/* ═══════════════════════════════════════════════════════════════════
   COSA DEL SERVIZIO ENTRA NEL PACCHETTO — E PERCHÉ UN ELENCO, NON UN FILTRO

   È un elenco di ciò che si copia, non di ciò che si esclude, e la
   differenza è tutta qui: `server/data/` contiene il DATABASE VERO del
   magazzino, con dentro le anagrafiche degli operatori. Con un filtro a
   esclusioni basterebbe che un giorno nascesse una cartella nuova e
   finirebbe nel pacchetto senza che nessuno l'abbia deciso; con un elenco,
   ciò che non è nominato resta fuori per costruzione.

   `node_modules` non c'è di proposito: sono 29 MB con dentro un binario
   compilato per un Node preciso, e `installa-servizio.ps1` le dipendenze se
   le installa da sé quando non le trova. Copiarle significherebbe portarsi
   dietro un `better-sqlite3` costruito per la macchina di partenza.
   ═══════════════════════════════════════════════════════════════════ */
const DAL_SERVIZIO = [
  'pathfinder-server.js',   // il servizio
  'lib',                    // SQLite e lo schema
  'installa-servizio.ps1',  // l'installazione, in un comando
  'backup-serale.ps1',      // il backup che l'installazione registra
  'test',                   // le 29 prove: si verifica l'installazione appena fatta
  'package.json',
  'package-lock.json',
  'LEGGIMI.md',
];

/* Vite chiama il suo prodotto index.html, perché così si chiama l'ingresso.
   In magazzino il nome del file è l'identità della versione: è quello che si
   legge nella cartella per sapere cosa gira.

   Insieme al file entrano il README e il servizio, perché la cartella deve
   poter essere COPIATA SU UNA MACCHINA NUOVA E INSTALLATA DA LÌ, senza il
   resto del repository. Non sono seconde copie da tenere allineate a mano: le
   rifà la build a ogni giro, e gli originali restano uno solo per parte. */
function cartellaDiConsegna(nome) {
  return {
    name: 'pathfinder-cartella-di-consegna',
    closeBundle() {
      const da = path.resolve(CONSEGNA, 'index.html');
      const a = path.resolve(CONSEGNA, nome);
      if (!fs.existsSync(da)) return;
      fs.renameSync(da, a);
      fs.copyFileSync(path.resolve('README.md'), path.resolve(CONSEGNA, 'README.md'));

      const dentro = path.resolve(CONSEGNA, 'server');
      fs.mkdirSync(dentro, { recursive: true });
      for (const voce of DAL_SERVIZIO) {
        const sorgente = path.resolve('server', voce);
        if (!fs.existsSync(sorgente)) {
          console.warn(`  ATTENZIONE: server/${voce} non trovato, non entra nel pacchetto`);
          continue;
        }
        fs.cpSync(sorgente, path.resolve(dentro, voce), { recursive: true });
      }

      const mb = (fs.statSync(a).size / 1024 / 1024).toFixed(2);
      console.log(`\n  ${CONSEGNA}/${nome} — ${mb} MB — l'applicativo, un file solo`);
      console.log(`  ${CONSEGNA}/README.md — le istruzioni, copiate dalla radice`);
      console.log(`  ${CONSEGNA}/server/ — il servizio dati, ${DAL_SERVIZIO.length} voci`);
      console.log(`\n  La cartella si copia su una macchina nuova e si installa da lì.\n`);
    },
  };
}

export default defineConfig({
  plugins: [
    viteSingleFile(),
    cartellaDiConsegna('pathfinder-1.2.html'),
  ],

  build: {
    /* Non `dist`: la cartella di consegna ha il nome della versione, e chi
       apre MAPPER capisce a colpo d'occhio qual è la roba da portare in
       magazzino e quale è il cantiere. `emptyOutDir` resta acceso — è la
       stessa cartella che la build possiede per intero, e un file rimasto lì
       da un rilascio precedente sarebbe peggio di uno mancante. */
    outDir: CONSEGNA,
    /* I terminali di magazzino montano Chrome recenti, ma non c'è ragione di
       chiedere più di quello che il codice usa davvero. */
    target: 'es2020',

    /* Un file solo vuol dire: niente CSS separato, niente chunk, niente
       risorsa che resti fuori per una soglia di dimensione. */
    cssCodeSplit: false,
    assetsInlineLimit: 100 * 1024 * 1024,
    chunkSizeWarningLimit: 8000,

    /* SheetJS pesa, e sarà sempre sopra la soglia di avviso: l'avviso qui non
       è una notizia. Ciò che conta è che il file resti un file. */
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },

    /* PERCHÉ NON SI OFFUSCA IL CODICE.
       Il file finisce su un PC di magazzino, e chi deve metterci le mani è la
       stessa persona che lo ha scritto. Un errore in produzione si legge
       aprendo la console, e lì serve un nome di funzione leggibile, non `t(e)`.
       La compressione degli spazi resta; la storpiatura dei nomi no. */
    minify: 'esbuild',

    /* PERCHÉ IL CSS NON SI MINIFICA AFFATTO.
       Misurato su questo progetto: la minificazione del CSS toglie 413
       caratteri su 146.368, lo 0,3% di un file da 1,4 MB. In cambio riscrive
       le regole — fonde due selettori adiacenti con le stesse dichiarazioni,
       toglie gli spazi dentro rgba() e transition — e ogni riscrittura è una
       cosa che va verificata prima di poter dire "il costruito si comporta
       come il sorgente". Ho passato mezz'ora a inseguire due regole che
       sembravano sparite e invece erano state fuse.

       Senza minificazione il CSS dentro il file costruito è, riga per riga,
       quello dei file in src/styles/. Una regressione grafica si trova
       cercando il selettore, non ricostruendo cosa ha fatto il minificatore. */
    cssMinify: false,
  },

  esbuild: {
    minifyIdentifiers: false,
    keepNames: true,
  },

  /* I collaudi passano da Vite perché passano dal suo resolver: gli import
     senza estensione — quelli che puntano ai moduli diventati .ts — Node da
     solo non li risolve. Vitest riusa questa configurazione, quindi non c'è
     una seconda verità su come i moduli si trovano fra loro. */
  test: {
    setupFiles: ['./test/ambiente.js'],
    include: ['test/**/*.test.js'],
  },

  server: {
    port: 5173,
    open: false,

    /* PERCHÉ IL RIMANDO AL SERVIZIO È OBBLIGATORIO IN SVILUPPO.
       Aperto da un indirizzo http, l'applicativo sceglie RemotePersistence e
       cerca /api sul proprio indirizzo. Il server di sviluppo di Vite non è il
       servizio dati: senza questo rimando l'app si bloccherebbe a schermo
       intero al primo avvio — correttamente, perché è ciò che deve fare
       quando il servizio non risponde (decisione 4.1).

       PATHFINDER_DEV_API punta a un'istanza di PROVA, non a quella di
       magazzino: un collaudo che scrive nel database di lavoro costa un
       blocco d'accesso, ed è già successo (trappola 5.6).
         $env:PATHFINDER_DEV_API = 'http://127.0.0.1:4174'; npm run dev */
    proxy: {
      '/api': {
        target: process.env.PATHFINDER_DEV_API || 'http://127.0.0.1:4173',
        changeOrigin: true,
        /* Il feed SSE non deve essere accumulato in memoria dal rimando:
           arriva a pezzi, e a pezzi deve passare. */
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (String(proxyRes.headers['content-type']).includes('event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform';
            }
          });
        },
      },
    },
  },
});
