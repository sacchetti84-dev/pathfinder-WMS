# HANDOFF PROJECT INITIALIZATION: Sistema Multi-Agente per "Pathfinder"

Sei un Senior Software Architect e AI Engineer. Il tuo compito è configurare l'infrastruttura di un sistema multi-agente in Python che guiderà lo sviluppo iterativo e il refactoring dell'applicazione mobile **Pathfinder** (parte del nuovo ecosistema Vanguard). 

L'obiettivo immediato è creare l'impalcatura del progetto (Harness e Contesto) e i file di base, predisponendo i mock o le chiamate API per gli agenti che lavoreranno allo sviluppo dell'app.

## 1. Architettura Richiesta (File da creare)
Crea una directory denominata `pathfinder_ai_workspace` e al suo interno genera i seguenti 4 file con il codice Python relativo:

1.  `context.py`: Una classe `PathfinderContext` che mantenga lo stato dell'applicazione (iterazione corrente, codice frontend, codice backend, lista dei bug, stato di completamento).
2.  `agents.py`: Le funzioni per i 4 agenti del sistema. Predisponi la struttura per le chiamate API, o inserisci dei mock intelligenti per il momento:
    *   **Orchestratore**: Valuta i bug e instrada il lavoro.
    *   **Frontend Developer**: Deve generare UI mobili Android.
    *   **Backend Engineer**: Deve generare codice SQL e API.
    *   **QA Tester**: Valuta il codice unito e genera bug o dà il semaforo verde.
3.  `harness.py`: Il loop di esecuzione principale che istanzia il contesto, esegue gli agenti in cascata (Orchestratore -> Frontend/Backend -> QA) e si ferma a un limite massimo di iterazioni (es. 5) o quando il QA approva la release.
4.  `pathfinder_prompt.md`: Il file delle specifiche fondanti (vedi sezione 2).

## 2. Contenuto esatto per `pathfinder_prompt.md`
Crea questo file e inserisci esattamente il seguente testo, che servirà come base di verità per tutti gli agenti:

> # Specifiche Core: Pathfinder
> **Ruolo:** App mobile esclusivamente operativa per Android. Nessuna funzione manageriale (delegate all'app Commodore).
> **UI/UX:** Estetica minimale e pulita ispirata ai prodotti Apple. Palette colori rigorosa: verde salvia (sfondi/card), verde petrolio (bottoni primari/azioni), tiffany (alert/successi). Tipografia: caratteri futuristici ma semplici per massima leggibilità.
> **Backend/Dati:** Migrazione totale completata dalla vecchia struttura IndexedDB verso un'architettura SQL.
> **Funzionalità:**
> - Login: Rapido tramite scansione QR Code (ID univoco: Nome + PIN criptato). Divieto assoluto di PIN duplicati a database.
> - Stampa: Pulsante "Floating Action Button" (FAB) in overlay su tutte le schermate, a scomparsa quando si apre la tastiera. Stampa centralizzata di etichette GS1-128 via Wi-Fi Print Server. Dati logistici e UDM in sola lettura.
> - OTA (Over-The-Air): Aggiornamenti silenti con orario configurabile dal dipartimento IT, non hardcoded.
> **Licenza:** Apache License 2.0.

## 3. Istruzioni di Esecuzione per Claude Code
1.  Analizza queste direttive.
2.  Crea la struttura delle cartelle e genera i 4 file Python e Markdown con codice robusto, tipizzato e ben commentato.
3.  Nel file `agents.py`, scrivi le istruzioni di sistema (system prompts) specifiche per ogni agente assicurandoti che il Frontend Developer riceva le direttive estetiche e che il Backend Engineer riceva le specifiche sul database SQL e la migrazione da IndexedDB.
4.  Al termine della creazione, esegui automaticamente uno script di test di validazione (`python harness.py`) per dimostrare che il loop multi-agente si avvia correttamente, esegue una simulazione e si arresta.