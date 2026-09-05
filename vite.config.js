import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

/* ── 1.7 · LA CONSEGNA E' UNA CARTELLA ────────────────────────────────────
   Fino alla 1.6 una versione era un file HTML solo, e il nome portava il
   numero. Dalla 1.7 una versione e' una CARTELLA — `index.html` piu'
   `assets/` coi nomi a impronta — e il numero sta nel nome della cartella,
   che glielo da' l'installazione. Qui la cartella si chiama sempre
   `consegna/`, senza numero: cosi' non somiglia a un artefatto rilasciato e
   nessuno e' tentato di puntarci la produzione.

   E' esattamente l'errore trovato il 17/08: `PATHFINDER_APP` puntava DENTRO
   questa cartella, che la build azzera a ogni giro. Vedi PIANO-CONSEGNA-1.7 §3.

   `SINGLE_FILE=1` riproduce il file unico di prima, ed e' la via d'uscita se
   il modello nuovo non convince. Anche in quel caso il file si chiama
   `index.html` e sta in `consegna/`: una build a file singolo e' una cartella
   con dentro solo l'indice, e il servizio non deve sapere che e' diversa. */
const CONSEGNA = 'consegna';
const VERSIONE = '2.26.0';
const UNICO = process.env.SINGLE_FILE === '1';

const DAL_SERVIZIO = [
  'pathfinder-server.js',   // il servizio
  'lib',                    // i due driver e lo schema
  'installa-servizio.ps1',  // l'installazione, in un comando
  'installa-versione.ps1',  // lo scambio di giunzione, senza amministratore
  'prepara-postgres.ps1',   // 2.7 — controlla PostgreSQL e prepara ruolo e database
  'crea-certificato.ps1',   // 2.26 — il certificato della macchina, senza scaricare niente
  'migrazione',             // 2.7 — il passaggio da SQLite a PostgreSQL, e l'audit
  'torna-indietro.ps1',     // il ritorno indietro, un comando
  'backup-serale.ps1',      // il backup che l'installazione registra
  'test',                   // il collaudo: si verifica l'installazione appena fatta
  'package.json',
  'package-lock.json',
  'LEGGIMI.md',
];

/* ── 2.12 · SVUOTARE `consegna/` QUANDO ONEDRIVE LA TIENE ────────────────
   © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

   IL DIFETTO. `npm run build` moriva con

       [vite:prepare-out-dir] EPERM, Permission denied:
       \?\...\consegna\Pathfinder 2.12

   e il messaggio non nominava la causa. Questa cartella sta dentro OneDrive:
   la build ci scrive 1,8 MB, OneDrive comincia subito a sincronizzarla, e la
   build DOPO la trova occupata mentre Vite prova a svuotarla. La cartella
   diventa un segnaposto di OneDrive — punto di reparse `0x9000e01a`, e a
   volte con l'attributo di sola lettura — e la cancellazione ricorsiva di
   Node si rifiuta.

   IL BLOCCO E' TRANSITORIO, ed e' il fatto che decide la correzione: la
   stessa cancellazione che fallisce riesce da sola qualche secondo dopo,
   quando la sincronizzazione ha finito. Misurato il 27/08, due volte.

   QUINDI LA BUILD ASPETTA, invece di morire. Si svuota la cartella qui —
   prima che Vite ci arrivi, `emptyOutDir` e' spento apposta — riprovando per
   trenta secondi e togliendo la sola lettura a ogni giro. Se dopo trenta
   secondi non passa, non e' piu' una sincronizzazione in corso: e' qualcuno
   che tiene la cartella aperta, e il messaggio lo dice invece di lasciare uno
   stack di rollup.

   NON SI SPOSTA `consegna/` FUORI DA ONEDRIVE, ed e' una scelta: quel
   percorso e' scritto in §4 dell'INDEX, nel LEGGIMI del pacchetto e nella
   testa di chi installa. Si cambia il modo di svuotarla, non dove sta. */

const ATTESA_MASSIMA_MS = 30_000;
const RITENTA_OGNI_MS = 400;

/* Un'attesa SINCRONA, perche' `buildStart` di Vite qui non e' asincrono e
   renderlo tale cambierebbe l'ordine dei plugin. `Atomics.wait` su un buffer
   che nessuno tocca e' il modo di fermarsi senza girare a vuoto. */
function dormi(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/* Su Windows il bit di scrittura di `chmod` E' l'attributo di sola lettura.
   Si toglie a tutto l'albero: basta un file dentro per fermare la
   cancellazione della cartella che lo contiene. */
function togliSolaLettura(dir) {
  let voci;
  try { voci = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  try { fs.chmodSync(dir, 0o777); } catch { /* niente da fare, si prova oltre */ }
  for (const v of voci) {
    const dentro = path.resolve(dir, v.name);
    if (v.isDirectory()) togliSolaLettura(dentro);
    else { try { fs.chmodSync(dentro, 0o666); } catch { /* idem */ } }
  }
}

function svuotaConInsistenza(dir) {
  if (!fs.existsSync(dir)) return;
  const inizio = Date.now();
  let avvisato = false;
  let ultimo = null;
  for (;;) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; }
    catch (err) {
      ultimo = err;
      /* Un errore che non e' «occupato» non si riprova: se il percorso e'
         sbagliato o il disco e' pieno, aspettare trenta secondi non aiuta e
         nasconde la causa vera. */
      if (!['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(err.code)) throw err;
      if (Date.now() - inizio >= ATTESA_MASSIMA_MS) break;
      if (!avvisato) {
        /* Le cause viste sono due, e si somigliano da qui dentro: OneDrive
           che sincronizza, e una finestra rimasta aperta dentro la cartella.
           Non si indovina quale sia: si dicono tutte e due. */
        console.log([
          '',
          `  «${path.basename(dir)}» e' occupata: aspetto che si liberi (fino a ${ATTESA_MASSIMA_MS / 1000}s).`,
          '  Di solito e\' OneDrive che la sta sincronizzando, o una finestra',
          '  rimasta aperta dentro quella cartella.',
        ].join('\n'));
        avvisato = true;
      }
      togliSolaLettura(dir);
      dormi(RITENTA_OGNI_MS);
    }
  }
  /* Il messaggio si compone a righe invece che a `\n` incollati: una guida
     che si legge di corsa, a build ferma, non va scritta su una riga sola. */
  throw new Error([
    `Non si riesce a svuotare «${dir}» dopo ${ATTESA_MASSIMA_MS / 1000} secondi (${ultimo?.code}).`,
    "  Non e' piu' una sincronizzazione in corso: qualcuno tiene quella cartella.",
    "  Di solito e' la finestra dell'installer rimasta aperta su «Premere un tasto",
    '  per chiudere», che ha quella cartella come directory di lavoro. Si chiude',
    '  la finestra e si rilancia la build. In alternativa, mettere OneDrive in',
    '  pausa per il tempo della build.',
  ].join('\n'));
}

/* Svuota la cartella di consegna PRIMA che ci arrivi Vite. `enforce: 'pre'` e
   `buildStart` la mettono davanti a `vite:prepare-out-dir`, che con
   `emptyOutDir: false` non ci prova nemmeno. */
function svuotaLaConsegna() {
  return {
    name: 'pathfinder-svuota-la-consegna',
    apply: 'build',
    enforce: 'pre',
    buildStart() { svuotaConInsistenza(path.resolve(CONSEGNA)); },
  };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* I file che COMPONGONO l'applicativo: l'indice e gli assets, nient'altro.
   Il servizio e il README viaggiano nella stessa cartella ma non sono cio'
   che il browser scarica, e contarli nell'impronta farebbe risultare diverse
   due consegne identiche a video. */
function fileDellApplicativo(radice) {
  const elenco = [];
  if (fs.existsSync(path.resolve(radice, 'index.html'))) elenco.push('index.html');

  const cammina = (dir, prefisso) => {
    for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefisso}/${voce.name}`;
      if (voce.isDirectory()) cammina(path.resolve(dir, voce.name), rel);
      /* I `.gz` sono lo stesso contenuto in un'altra forma: contarli
         raddoppierebbe l'elenco e falserebbe `byte_totali`. */
      else if (!voce.name.endsWith('.gz')) elenco.push(rel);
    }
  };
  const assets = path.resolve(radice, 'assets');
  if (fs.existsSync(assets)) cammina(assets, 'assets');

  return elenco.sort();
}

/* ── IL MANIFESTO, che sostituisce il conteggio dei byte ──────────────────
   La verifica di un'installazione e' sempre stata «confronta `app_file` E
   `bytes`». Con una cartella «i byte» non sono un numero solo, e un rituale
   di verifica che muore in silenzio e' peggio di uno cambiato.

   `impronta` e' lo sha256 dell'elenco ordinato `percorso:sha256`: e' il nuovo
   `1.625.239`. Due installazioni con la stessa impronta sono lo stesso
   applicativo, byte per byte, su qualunque macchina. `/api/app-info` la
   restituisce, e il controllo dopo l'installazione resta un comando solo. */
function scriviManifesto(radice, versione) {
  const elenco = fileDellApplicativo(radice).map((percorso) => {
    const contenuto = fs.readFileSync(path.resolve(radice, percorso));
    return { percorso, byte: contenuto.length, sha256: sha256(contenuto) };
  });

  const manifesto = {
    versione,
    costruita: new Date().toISOString(),
    byte_totali: elenco.reduce((somma, f) => somma + f.byte, 0),
    file: elenco,
    impronta: sha256(elenco.map((f) => `${f.percorso}:${f.sha256}`).join('\n')),
  };

  fs.writeFileSync(
    path.resolve(radice, 'manifest.json'),
    JSON.stringify(manifesto, null, 2) + '\n'
  );
  return manifesto;
}

/* ── LA COMPRESSIONE SI PAGA UNA VOLTA SOLA ───────────────────────────────
   Il servizio non ha mai compresso niente: fino alla 1.6 ogni terminale
   scaricava 1,61 MB in chiaro a ogni ricarica. Comprimere a ogni richiesta
   vorrebbe dire spendere CPU per riottenere sempre lo stesso byte — questi
   file non cambiano mai, il nome porta l'impronta.

   Quindi il `.gz` lo scrive la build, al massimo livello, e il servizio lo
   passa a chi dichiara di accettarlo. Chi non lo accetta riceve il file in
   chiaro, che resta lì accanto: nessun terminale può restare fuori. */
function comprimi(radice, manifesto) {
  let totale = 0;
  for (const f of manifesto.file) {
    const assoluto = path.resolve(radice, f.percorso);
    const gz = zlib.gzipSync(fs.readFileSync(assoluto), { level: 9 });
    fs.writeFileSync(assoluto + '.gz', gz);
    totale += gz.length;
  }
  return totale;
}

function cartellaDiConsegna(versione) {
  return {
    name: 'pathfinder-cartella-di-consegna',
    /* SOLO in build. Senza, `closeBundle` scatta anche quando vitest chiude il
       suo server, e `npm test` riscriverebbe la cartella di consegna — con un
       manifesto nuovo, e quindi un'impronta diversa, per una build che nessuno
       ha chiesto. */
    apply: 'build',
    closeBundle() {
      const radice = path.resolve(CONSEGNA);
      if (!fs.existsSync(path.resolve(radice, 'index.html'))) return;

      const manifesto = scriviManifesto(radice, versione);
      const compresso = comprimi(radice, manifesto);

      /* ── IL PACCHETTO ────────────────────────────────────────────────────
         Quello che esce dalla build non e' un mucchio di file da mettere
         insieme a mano: e' UNA CARTELLA che si copia su una chiavetta e si
         installa con un doppio clic. Il numero di versione sta nel nome,
         cosi' due consegne non si confondono mai.

             consegna/Pathfinder 1.7/
               Installa Pathfinder.bat   <- doppio clic, e basta
               installa.ps1              il motore
               LEGGIMI.txt
               app/                      l'applicativo e il suo manifesto
               servizio/                 il servizio dati e i suoi script

         Nasce il 17/08/2026 da una richiesta precisa: «non posso mettermi a
         compilare il terminale in fase di presentazione». Fino a ieri
         installare voleva dire ricordarsi un comando con due parametri. */
      const pacchetto = path.resolve(radice, `Pathfinder ${versione}`);
      const dentroApp = path.resolve(pacchetto, 'app');
      const dentroServizio = path.resolve(pacchetto, 'servizio');
      fs.mkdirSync(dentroApp, { recursive: true });
      fs.mkdirSync(dentroServizio, { recursive: true });

      /* L'applicativo si SPOSTA, non si copia: quello che resta nella radice
         di `consegna/` verrebbe scambiato per una consegna a sua volta, ed e'
         esattamente il genere di ambiguita' che il 14/08 e' costata cara. */
      for (const voce of fs.readdirSync(radice)) {
        if (voce === `Pathfinder ${versione}`) continue;
        fs.renameSync(path.resolve(radice, voce), path.resolve(dentroApp, voce));
      }

      for (const voce of DAL_SERVIZIO) {
        const sorgente = path.resolve('server', voce);
        if (!fs.existsSync(sorgente)) {
          console.warn(`  ATTENZIONE: server/${voce} non trovato, non entra nel pacchetto`);
          continue;
        }
        fs.cpSync(sorgente, path.resolve(dentroServizio, voce), { recursive: true });
      }
      fs.copyFileSync(path.resolve('README.md'), path.resolve(dentroServizio, 'README.md'));

      /* Il .bat e il motore stanno in `server/` come tutto il resto degli
         script, e qui prendono il nome con cui li vede chi installa. */
      for (const [da, a] of [
        ['Installa Pathfinder.bat', 'Installa Pathfinder.bat'],
        ['installa-pathfinder.ps1', 'installa.ps1'],
        ['LEGGIMI-pacchetto.txt', 'LEGGIMI.txt'],
      ]) {
        const sorgente = path.resolve('server', da);
        if (!fs.existsSync(sorgente)) {
          console.warn(`  ATTENZIONE: server/${da} non trovato: il pacchetto non si installa da solo`);
          continue;
        }
        fs.copyFileSync(sorgente, path.resolve(pacchetto, a));
      }

      const mb = (manifesto.byte_totali / 1024 / 1024).toFixed(2);
      const kb = (compresso / 1024).toFixed(0);
      console.log(`\n  ${CONSEGNA}/Pathfinder ${versione}/${UNICO ? '  (file unico)' : ''}`);
      console.log(`  app/       ${manifesto.file.length} file, ${mb} MB — ${kb} kB sul filo, compressi`);
      console.log(`  impronta   ${manifesto.impronta}`);
      console.log(`  servizio/  il servizio dati, ${DAL_SERVIZIO.length} voci`);
      console.log('\n  Si consegna cosi\' com\'e\': doppio clic su «Installa Pathfinder.bat».');
      console.log('  NON si serve da qui: la build azzera questa cartella a ogni giro.\n');
    },
  };
}

/* IL NUMERO DI VERSIONE IN PAGINA LO SCRIVE LA BUILD.

   Stava a mano in tre punti di `index.html` — titolo, fascia in alto, piede —
   ed e' rimasto **1.7** per tutta la 1.8: nessuno guarda tre stringhe quando
   cambia un numero, e la pagina diceva una versione che non era quella che
   girava. Adesso c'e' un segnaposto e questo lo sostituisce, in sviluppo come
   nella consegna: la sorgente resta `VERSIONE`, qui sopra, la stessa che da'
   il nome alla cartella. */
const versioneInPagina = (versione) => ({
  name: 'versione-in-pagina',
  transformIndexHtml: (html) => html.replaceAll('__VERSIONE__', versione),
});

export default defineConfig({

  plugins: [
    /* Tailwind legge i sorgenti e scrive le sole utility che trova scritte.
       Va per primo: produce il CSS che gli altri due poi impacchettano. */
    tailwindcss(),
    ...(UNICO ? [viteSingleFile()] : []),
    versioneInPagina(VERSIONE),
    /* 2.12 — svuota `consegna/` aspettando OneDrive, al posto di
       `emptyOutDir`. Vedi `svuotaConInsistenza`. */
    svuotaLaConsegna(),
    cartellaDiConsegna(VERSIONE),
  ],

  build: {
    outDir: CONSEGNA,
    /* 2.12 — LA SVUOTA IL PLUGIN, NON VITE. `vite:prepare-out-dir` cancella
       e basta: su una cartella che OneDrive sta sincronizzando alza EPERM e
       ferma la build con uno stack di rollup che non nomina la causa.
       `svuotaLaConsegna()` fa la stessa cosa aspettando, e se non ce la fa
       dice cosa guardare. */
    emptyOutDir: false,
    /* I terminali di magazzino montano Chrome recenti, ma non c'è ragione di
       chiedere più di quello che il codice usa davvero. */
    target: 'es2020',

    /* Un file solo vuol dire: niente CSS separato, niente chunk, niente
       risorsa che resti fuori per una soglia di dimensione. A file separati
       vale l'opposto, ed è tutto il punto della 1.7: `xlsx` pesa 864 KB su
       1,61 MB e serve a chi importa un ODP o esporta — qualche volta al
       giorno. In un file solo lo riscaricano tutti a ogni ricarica. */
    cssCodeSplit: !UNICO,
    assetsInlineLimit: UNICO ? 100 * 1024 * 1024 : 4096,
    chunkSizeWarningLimit: 8000,

    rollupOptions: {
      /* `inlineDynamicImports` spegne il code-splitting: con lei accesa
         l'import dinamico di `xlsx` non produrrebbe nessun chunk separato, e
         la 1.7 non servirebbe a niente. Va accesa SOLO col file unico. */
      output: UNICO ? { inlineDynamicImports: true } : {},
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
