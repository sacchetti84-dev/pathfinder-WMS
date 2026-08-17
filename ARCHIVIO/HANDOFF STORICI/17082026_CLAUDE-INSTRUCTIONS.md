Istruzioni operative per Claude — Migrazione front-end da monolite a struttura multifile (Pathfinder 1.6)

Contesto
-------
Repository: Pathfinder (client)
Percorso lavoro: C:/Users/sacch/OneDrive/Desktop/PROGETTI E CODING/MAPPER
Build attuale: Vite con vite-plugin-singlefile → consegna single-file (es. pathfinder-1.6.html)
Sorgenti modulari disponibili: src/ (TypeScript/JS), test/, styles/, vite.config.js, package.json
Runtime espone globali nel bundle: window.App, window.Store (compatibilità con build single-file)
Strategia scelta: migrazione incrementale per feature (slice). Prima slice: "anagrafica".
Obiettivo: passare produzione a build multi-file, mantenere compat-layer temporanea fino a rimozione pianificata, estrarre moduli per feature con test e PR piccoli.

Scopo di questo documento
------------------------
For­nire a Claude (assistente automatizzato) tutte le istruzioni necessarie per:
- Capire il contesto del progetto
- Eseguire discovery e inventario dei punti di ingresso e dipendenze
- Eseguire la prima slice (anagrafica) con checklist completa
- Fornire patch proposte per la build multi-file
- Mantenere il loop di feedback e domande per l'utente

Regole operative e vincoli (da rispettare)
-----------------------------------------
- Migrazione incrementale per feature (non riscrivere tutto in una sola volta).
- Modifiche chirurgiche e isolate: non cambiare codice non correlato a una slice.
- Documentare ogni compat-layer e contrassegnarla chiaramente (TODO: rimuovere dopo X release).
- Aggiungere / aggiornare test per ogni modulo estratto.
- Non aggiornare dipendenze critiche senza approvazione esplicita (dexie, xlsx sono fissate).
- Le modifiche di build (vite.config.js) vanno proposte come patch e non applicate senza review.

File e percorsi prioritari da analizzare
--------------------------------------
- pathfinder-1.6.html (consegnato single-file, radice)
- index.html (radice)
- src/main.js
- src/ui/app.js
- src/core/store.ts
- src/modules/anagrafica.ts
- src/core/persistence/index.ts
- vite.config.js
- package.json
- test/ (test/*.test.js)
- ARCHIVIO/ e HANDOFF/ (documentazione storica e handoff)

Comandi utili (ambiente developer)
---------------------------------
Esegui da repository root C:/Users/sacch/OneDrive/Desktop/PROGETTI E CODING/MAPPER
- npm install
- npm run dev          → avvia vite in dev
- npm run build        → build production (oggi single-file per configurazione corrente)
- npm run anteprima    → preview build (vite preview)
- npm run check        → Type-check (tsc su tsconfig.json e tsconfig.server.json)
- npm run test         → vitest run (esegue test)

Discovery e inventario (passi iniziali)
--------------------------------------
1. Eseguire una scansione dei file per trovare riferimenti a globali: "window.App", "window.Store", assegnazioni a window, e usi senza import (regole di legacy).
2. Mappare punti di ingresso (main.js, event listener DOMContentLoaded, export default App) e assets (styles/*).
3. Generare lista dei file che risultano solo nel bundle single-file (cioè contenuti in pathfinder-1.6.html ma non in src/). Segnalare eventuali funzioni inline da estrarre.
4. Rilevare dipendenze condivise pesanti (es. xlsx, dexie, sheetjs) per decidere lazy-loading o chunking.

Prima slice: anagrafica — piano operativo dettagliato
----------------------------------------------------
Obiettivo: estrarre/valorizzare src/modules/anagrafica.ts come modulo ESM pienamente testato e verificato in UI.

Task (ordine raccomandato):
1) Inventario riferimenti
   - Cercare tutte le importazioni e tutti i riferimenti a funzioni/const esportate da anagrafica (etichettaAllergene, leggiAllergeni, CLASSI_TEMPERATURA) nella codebase.
   - Verificare se qualche codice fa riferimento a valori anagrafica tramite globali (es. window.Anagrafica). Segnalarli.

2) Test
   - Eseguire npm run test per verificare che test/anagrafica.test.js passi.
   - Aggiungere test per casi mancanti: parsing di valori sconosciuti, formati multipli, e conversione Excel (se applicabile).

3) Compat-layer temporanea
   - Se esistono caller legacy che non possono essere modificati subito, creare un modulo di compatibilità: src/compat/anagrafica-compat.js (o .ts) che importa tutto da src/modules/anagrafica.ts e assegna window.Anagrafica = { ... } (solo API necessarie).
   - Documentare nel codice la data prevista per rimozione e aggiungere comment TODO con issue id.

4) Integrazione UI
   - Verificare che src/ui/app.js importi correttamente le funzioni da src/modules/anagrafica.ts (già dovrebbero esserci import relativi).
   - Lanciare npm run dev ed eseguire i flussi manuali rilevanti (import Excel, form validazione, visualizzazione etichette).

5) PR e review
   - Creare branch feature/anagrafica
   - Limitare PR a scope ristretto (consigliato <= 400 LOC)
   - Includere descrizione e checklist dei test eseguiti

Checklist PR (minima)
- [ ] Tutti i test unitari e suite pertinenti passano
- [ ] Nessuna regressione evidente nell’interfaccia (smoke test manuale)
- [ ] Compat-layer documentata se presente
- [ ] Nota in README o HANDOFF che dice come verificare la feature

Patch proposte per build multi-file (linee guida, NON applicare senza approvazione)
-----------------------------------------------------------------------------------
Obiettivo: produrre build multi-file ottimizzata per caching (split code, css separato, chunking). Attenzione: le macchine di produzione usavano l’unico-file per facilità di deploy — concordare pianificazione.

Suggerimenti di modifica a vite.config.js:
- Rimuovere o condizionare vite-plugin-singlefile nella pipeline di produzione (plugin utile solo quando si sceglie single-file).
- In build: impostare cssCodeSplit: true (o lasciare default true), assetsInlineLimit a valore più piccolo (es. 4096), non inlineDynamicImports (lasciare chunking).
- Conservare target es2020 e minify: 'esbuild'.
- Aggiungere opzione per produzione single-file mantenuta tramite env var (es. process.env.SINGLE_FILE === '1') così da poter ancora produrre file unico quando serve.

Esempio (concettuale) — non applicare senza review:
- plugin singlefile solo se process.env.SINGLE_FILE === '1'
- build.cssCodeSplit = process.env.SINGLE_FILE !== '1'

Compat-layer: pattern consigliato
--------------------------------
- Creare src/compat/index.ts che raccoglie tutte le facciate temporanee per window.*.
- Export solo ciò che è necessario e non esportare internals privati.
- Esempio di implementazione minimale:

  // src/compat/index.ts
  import * as Anagrafica from '../modules/anagrafica';
  import { App } from '../ui/app.js';
  import { Store } from '../core/store';
  // Assegnare solo se window non ha già la cosa
  if (typeof window !== 'undefined') {
    window.Anagrafica = window.Anagrafica || Anagrafica;
    window.App = window.App || App;
    window.Store = window.Store || Store;
  }

- Documentare e contrassegnare questi file con commenti e issue link per rimozione.

Loop di collaborazione con l'utente (domande e checkpoints)
----------------------------------------------------------
Per ogni slice, seguire il loop:
1. Discovery (report) → postare lista file e potenziali rischi
2. Proposta patch minima per extraction + test → chiedere approvazione
3. Applicare patch su branch feature → eseguire test automatizzati
4. Verifica manuale e PR
5. Merge e rollout su staging

Domande che Claude deve porre all'utente (in ordine di priorità)
- Confermi la lista di file che intendo estrarre per la slice anagrafica? (fornire elenco)
- Vuoi che la compat-layer esponda window.Anagrafica con tutte le funzioni o solo subset? (consiglio: subset minimo)
- Quanti rilasci (major/minor) vogliamo attendere prima di rimuovere la compat-layer? (es. rimuovere dopo 2 release)
- Vuoi che proponga le modifiche di vite.config.js ora come PR dimostrativa o dopo 1–2 slice di prova?

Attività automatizzabili che Claude può proporre/effettuare (con permessi e branch)
- Generare patch per estrazione anagrafica (creare file compat/ wrapper se necessario)
- Aggiornare test e aggiungere test mancanti
- Produrre PR description e checklist
- Generare proposta diff per vite.config.js per build multi-file

Format to produce when reporting back to user or other agents
-------------------------------------------------------------
Ogni volta che Claude risponde con avanzamento, includere i seguenti elementi:
- Sintesi breve dello stato (1–2 frasi)
- Lista file modificati / da modificare
- Diff proposto (se applicabile) o snippet di codice
- Comandi eseguiti e output essenziali (test/build failures)
- Domande aperte e raccomandazioni per la prossima azione

Esempi di output richiesti nella comunicazione
--------------------------------------------
- "Discovery result: 3 callers legacy found: X, Y, Z — proponi compat-layer per X e Y"
- "Patch ready in branch feature/anagrafica — include 4 nuovi test — run: npm run test — 2 falliti: descrizione"

Nota sulla sicurezza e segreti
-----------------------------
- Non esporre credenziali o segreti nei file creati.
- Non commettere chiavi o file sensibili nei commit di PR.

Esempio pratico: cosa fare ora (passi immediati consigliati per la prima esecuzione)
----------------------------------------------------------------------------------
1. Eseguire npm ci / npm install
2. npm run test  → assicurarsi che i test esistenti passino
3. Aprire src/modules/anagrafica.ts e generare un report: funzioni export, test coperti, caller not found
4. Cercare riferimenti legacy (window.Anagrafica, uso senza import) e produrre elenco
5. Preparare branch feature/anagrafica e creare una PR draft con:
   - Descrizione del lavoro
   - Lista di file cambiati
   - Checklist di test

Output file richiesto da questo task
-----------------------------------
- Questo file (HANDOFF/CLAUDE-INSTRUCTIONS.md) — versione di base per Claude
- Un report discovery (markdown) con elenco caller e file isolati
- Una patch proposta (diff) per compat-layer e/o per vite.config.js (se richiesto dall'utente)

Contatti e note finali
---------------------
- Se emergono dipendenze non modulari o codice inline nel single-file, segnalarle immediatamente e proporre spike per extraction.
- Tenere PR piccoli e frequenti: obiettivo 1–3 giorni per slice (timebox consigliato).

---
Generato automaticamente per Claude su richiesta dell'utente — Pathfinder 1.6
