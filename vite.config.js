import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

const CONSEGNA = 'Pathfinder 1.4';

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
    /* Il nome porta i tre numeri, non due: la serie 1.4 sono sei rilasci
       distinti (1.4.0 … 1.4.5) e ciascuno va in magazzino per conto suo. Il
       ritorno indietro e' rimettere PATHFINDER_APP sul file precedente, che
       resta in radice: senza il terzo numero i sei si sovrascriverebbero. */
    cartellaDiConsegna('pathfinder-1.4.2.html'),
  ],

  build: {
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

    minify: 'esbuild',

    cssMinify: false,
  },

  esbuild: {
    minifyIdentifiers: false,
    keepNames: true,
  },

  test: {
    setupFiles: ['./test/ambiente.js'],
    include: ['test/**/*.test.js'],
  },

  server: {
    port: 5173,
    open: false,

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
