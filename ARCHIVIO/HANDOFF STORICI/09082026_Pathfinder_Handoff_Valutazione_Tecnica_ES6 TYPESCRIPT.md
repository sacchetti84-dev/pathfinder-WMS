# Handoff Tecnico: Evoluzione Architetturale di Pathfinder

**Progetto:** Pathfinder (Warehouse Mapper & Route Optimizer)  
**Oggetto:** Valutazione dell'architettura e piano di transizione da Single-File Monolitico a Moduli ES6 / TypeScript  
**Data:** 9 Agosto 2026  
**Stato:** Valutazione Architetturale Completata (In attesa di approvazione)

---

## 1. Contestualizzazione e Obiettivo

L'applicazione **Pathfinder** ha raggiunto una complessità funzionale notevole, integrando in un unico file monolitico (`index.html`) la logica di parsing ODP/Sage X3, la gestione del database locale via IndexedDB (Dexie.js), gli algoritmi di stima e ottimizzazione percorsi (serpentina) e l'interfaccia utente Material Design 3.

L'obiettivo di questo documento di handoff è formalizzare le valutazioni tecniche effettuate per la transizione dalla struttura monolitica attuale a un'**architettura modulare moderna**, individuando lo standard tecnologico più idoneo per garantire scalabilità, manutenibilità e testabilità nel tempo.

---

## 2. Valutazione delle Opzioni Tecnologiche

### 2.1 Opzione A: Mantenimento Single-File Monolitico
* **Descrizione:** Mantenimento dell'attuale struttura `index.html` contenente HTML, CSS e JavaScript inline.
* **Pro:** Nessuna necessità di server web locale (`file://` funzionante), nessun processo di build.
* **Contro:** Elevata difficoltà di manutenzione, assenza di isolamento dello scope, impossibilità di eseguire unit test automatizzati sui singoli moduli.

### 2.2 Opzione B: Moduli ES6 (JavaScript Moderno Native/HTTP) — *Consigliato per Transizione Diretta*
* **Descrizione:** Separazione del codice in file JavaScript modulari tramite direttive `import` ed `export` nativi dell'ECMAScript 2015+.
* **Pro:**
  * Separazione netta delle responsabilità (Parser ODP, PickRoute, Persistenza, UI).
  * Nessun inquinamento dello scope globale `window`.
  * Riuso ed isolamento del codice senza necessità di riscrittura della logica di business.
* **Impatti / Requisiti:**
  * Richiede l'esecuzione dell'app tramite server Web (HTTP/HTTPS) locale o di rete LAN a causa delle restrizioni CORS sui moduli via protocollo `file://` (allineato alle raccomandazioni H5 della documentazione interna).

### 2.3 Opzione C: TypeScript + Moduli ES6 — *Consigliato per Evoluzione Enterprise*
* **Descrizione:** Aggiunta del livello di tipizzazione statica (TypeScript) con compilazione/bundling (es. tramite Vite) in moduli ES6 distribuiti nella cartella `dist/`.
* **Pro:**
  * Rilevamento immediato degli errori in fase di sviluppo (es. rinomina di campi ODP, incompatibilità di dati).
  * Autocompletamento e intellisense avanzato sulle strutture dati del magazzino.
  * Piena integrazione tipizzata con Dexie.js e SheetJS.
* **Impatti / Requisiti:**
  * Introduzione di un semplice processo di build automatizzato (`npm run build`).

---

## 3. Matrice Comparativa di Sintesi

| Criterio | Single-File (Attuale) | Moduli ES6 (JavaScript) | TypeScript + ES6 |
| :--- | :--- | :--- | :--- |
| **Organizzazione Codice** | Monolitica / Piatta | Modulare per domini | Modulare e fortemente tipizzata |
| **Prevenzione Bug** | Bassa (Runtime unicamente) | Media (Scope isolati) | Massima (Controllo a compile-time) |
| **Testabilità Unitaria** | Molto complessa | Elevata | Eccellente |
| **Requisito Esecuzione** | File system (`file://`) | Server Web (HTTP/LAN) | Server Web (HTTP/LAN) |
| **Processo di Build** | Nessuno | Opzionale | Richiesto (Vite / tsc) |

---

## 4. Struttura Target Proposta per Pathfinder

```text
pathfinder/
├── index.html                  # Entry point HTML (scheletro DOM)
├── package.json                # Dipendenze e script di build (Vite / TypeScript)
├── tsconfig.json               # Configurazione del compilatore TypeScript
├── src/                        # Codice Sorgente
│   ├── main.ts                 # Entry-point dell'applicazione
│   ├── types/                  # Definizioni delle interfacce dati
│   │   ├── odp.ts              # Struttura record ODP e righe
│   │   ├── route.ts            # Coordinate, percorsi e campate
│   │   └── config.ts           # Impostazioni dell'app e MD3
│   ├── core/
│   │   ├── config.ts           # Costanti e configurazioni generali
│   │   ├── persistence.ts      # Adattatore Dexie / IndexedDB
│   │   └── store.ts            # Gestione dello stato e cache
│   ├── modules/
│   │   ├── odpParser.ts        # Logica parsing Excel / Sage X3
│   │   ├── pickRoute.ts        # Algoritmo calcolo rotta di picking
│   │   └── quarantine.ts       # Gestione blocchi e quarantene
│   └── ui/
│       ├── app.ts              # Controller di interfaccia
│       └── components/         # Componenti di visualizzazione e modali
└── dist/                       # Output compilato (distribuito sul server Web)
    └── main.js
```

---

## 5. Piano Operativo di Transizione Suggerito

1. **Fase 1: Setup dell'Ambiente**
   * Inizializzazione del progetto con Vite + TypeScript.
   * Configurazione del server di sviluppo locale.

2. **Fase 2: Tipizzazione delle Entità Core**
   * Creazione delle interfacce per la struttura ODP, le tabelle Dexie e le rotte di picking all'interno della cartella `src/types/`.

3. **Fase 3: Estrazione e Modularizzazione della Logica di Business**
   * Spostamento sequenziale dei blocchi esistenti dal file monolitico ai singoli file modulari (`odpParser.ts`, `pickRoute.ts`, `persistence.ts`).

4. **Fase 4: Integrazione e Deploy**
   * Generazione della build compilata in `dist/`.
   * Distribuzione sul server Web locale/aziendale.

---

*Documento generato per il passaggio di consegne e la pianificazione delle attività di refactoring del progetto Pathfinder.*
