# PROMPT — Workspace multi-agente per Pathfinder 1.4

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 12/08/2026 · Rev. 01 · uso interno

> **Cosa sostituisce.** C'era un prompt con lo stesso nome in
> `ARCHIVIO/HANDOFF STORICI/PROMPT-workspace-multiagente.md`. Descriveva un
> esperimento diverso e archiviato: un'app **Android** chiamata Pathfinder, con
> migrazione da IndexedDB a SQL, login QR, FAB di stampa, OTA e licenza Apache 2.0.
> Niente di quello vale qui. Pathfinder è un **applicativo web a file singolo**
> servito da Node su rete interna, la migrazione a SQL è finita da un pezzo, la
> licenza è UNLICENSED e il codice è privato. Quel file resta come memoria.
>
> Questo lo rimpiazza, e parla del lavoro vero: **le cinque funzioni della 1.4,
> entro il 19/12/2026.**

---

## 0. Prima di scrivere una riga

Il workspace **non riparte da zero**. Esiste un progetto che sta lavorando in un
magazzino vero, con un database vivo e una disciplina già pagata a caro prezzo.
Gli agenti la ereditano; non la reinventano.

Tre file, in quest'ordine, sono la base di verità:

| File | Cos'è |
|---|---|
| `INDEX.md` | Stato, mappa dei file, comandi, aperti. Il punto di partenza |
| `HANDOFF/HANDOFF-pathfinder-1.4.md` | Da dove si riparte · decisioni permanenti · trappole già pagate · cosa NON fare |
| `HANDOFF/PIANO-1.4.md` | Le cinque funzioni, il disegno dei dati, il calendario, le decisioni prese |

**Nessun agente propone qualcosa che una decisione permanente ha già escluso.**
Se ritiene che una vada rivista, lo dice esplicitamente citandone il numero — non
la aggira scrivendo codice che la contraddice.

---

## 1. Struttura da creare

Cartella `pathfinder_ai_workspace/`, quattro file Python più uno di specifica:

| File | Contenuto |
|---|---|
| `contesto.py` | `ContestoPathfinder`: stato del giro — consegna in corso (1.4.0…1.4.5), blocco corrente, file toccati, esito di `check`/`test`/`collaudo`, difetti aperti, se si può committare |
| `agenti.py` | I cinque agenti, con il loro prompt di sistema. Chiamate API predisposte, mock finché non servono davvero |
| `harness.py` | Il ciclo: Custode → Orchestratore → Collaudatore → Sviluppatore → Collaudatore → Custode. Si ferma al massimo delle iterazioni **o quando le tre suite sono verdi e i documenti allineati** |
| `vincoli.md` | Le regole non negoziabili, §3 qui sotto. È il file che ogni agente riceve in testa al proprio prompt |

Codice tipizzato, italiano nei messaggi, **commenti pochi e sul perché** — la
convenzione §7.1 dell'HANDOFF vale anche per il workspace.

---

## 2. I cinque agenti

Sono cinque e non quattro, e il quinto è il motivo per cui questo prompt esiste.

### Orchestratore
Legge `INDEX.md`, l'HANDOFF e il PIANO, e decide **un blocco solo**. Non
distribuisce lavoro in parallelo su file che si toccano: `store.js` e `app.js`
insieme fanno 12.500 righe e non sono verificabili.

Sa che l'ordine di costruzione **non è** l'ordine in cui le funzioni sono state
chieste: schedulatore → unità di misura → UDC → motore → WIP, e prima di tutti la
Fase 0. Sa anche che la Fase 0 è **già dentro** e che ciò che manca alla 1.4.0 è
`core/store.js` in TypeScript.

### Sviluppatore client — `src/`
TypeScript e JavaScript, Vite, Dexie 3.2.4 e SheetJS 0.18.5 **a versione fissa**.
Nessuna dipendenza nuova senza un motivo forte. Nessun `font-size` fuori dai token
MD3. Italiano in tutto ciò che l'utente legge.

Conosce la forma del progetto: `types/collezioni.ts` è la **sorgente unica** delle
19 collezioni, e il `satisfies` blocca la compilazione se adapter e servizio
divergono. Un campo nuovo è facoltativo **sempre**, e assente significa «come nella
1.2».

### Sviluppatore servizio — `server/`
Node, Express, `better-sqlite3` a versione con binario già compilato. `checkJs`
**acceso** qui, spento sul client.

Sa la cosa che più conta di tutte: **`CREATE TABLE IF NOT EXISTS` non aggiunge una
colonna a una tabella che esiste.** Fra `createTableSQL` e `createIndexSQL` sta
`PathfinderDB._migra`, e quelle due funzioni non si rimettono insieme.

La concorrenza fra terminali si arbitra con **una transazione SQLite dentro
`/api/op/…`**, non con la disciplina di chi scrive.

### Collaudatore
Il suo turno è **due volte**: prima dello sviluppatore e dopo.

- **Prima**: scrive il collaudo, e lo scrive contro dati finti se il codice non
  esiste ancora. È la §5.1 dell'HANDOFF 1.3, ed è anche uno strumento di
  calendario: i collaudi del motore e del WIP si scrivono nelle consegne
  precedenti, se no quelle due consegne non ci stanno.
- **Dopo**: esegue `npm run check`, `npm test`, `node test/collaudo.js` e
  `node test/collaudo-migrazione-1.4.js`, e **prova il collaudo rompendo il
  codice**. Un controllo che passa subito potrebbe non controllare niente.

Non collauda mai sul database di lavoro. Mai. Seconda istanza su un'altra porta con
`PATHFINDER_DB` temporaneo, oppure `?db=local` sul dev server — che di suo parla
col magazzino vero.

### Custode dei documenti
Apre e chiude il giro. All'apertura riassume stato e aperti; alla chiusura
**aggiorna `INDEX.md`, l'HANDOFF e il PIANO** con ciò che è cambiato: numeri dei
collaudi, aperti chiusi, decisioni prese, trappole nuove.

Esiste perché la narrativa di questo progetto **sta nei documenti e non nel
codice** — 5.519 righe di commento sono state tolte apposta — e un documento che
non segue il codice è peggio di un documento che non c'è: qualcuno ci crede.

---

## 3. Contenuto esatto per `vincoli.md`

> # Vincoli — Pathfinder 1.4
>
> **Cos'è.** Applicativo web a **file singolo** per la gestione di un magazzino
> alimentare in GMP. Servito da Node + Express + SQLite su rete interna, porta
> 4173, database in `C:\Pathfinder\data\pathfinder.db`. Più terminali, un solo
> database, l'arbitro è il server. Uso interno Dietopack S.r.l. — UNLICENSED.
>
> **Le regole che non si discutono.**
> - Ogni campo nuovo è **facoltativo**, e assente significa «come nella 1.2».
>   Ogni collezione nuova, vuota, significa «come nella 1.2». Nessun campo cambia
>   mai significato. **Nessun dato viene riscritto all'installazione.**
> - La 1.4 gira sul database della 1.2, **e la 1.2 su quello della 1.4**: il
>   ritorno indietro è rimettere il file vecchio, non una migrazione all'incontrario.
> - **Niente lavoro offline.** Se il servizio non risponde l'applicativo si ferma e
>   lo dice a schermo intero. Niente code da risincronizzare.
> - **Un blocco per commit**, con build e collaudo in mezzo. Chi sposta non corregge.
> - **I collaudi si scrivono prima**, e si provano rompendo il codice.
> - Ogni funzione entra dietro un interruttore `feature.*` in `meta`, **spento alla
>   consegna**, una chiave per una. Non se ne accendono due nello stesso turno.
>
> **Tracciabilità e dati.**
> - GMP: ogni movimento porta la sigla dell'operatore identificato. Tenuta a sei
>   anni, 300-500 movimenti al giorno.
> - GDPR: nome, cognome e iniziali. Nessuna telemetria, nessuna richiesta di rete
>   verso l'esterno. Il PIN non esiste a database: esiste la sua impronta.
> - **Nessuna cancellazione automatica di record.** La purga è manuale, con export
>   preventivo.
>
> **Merceologia.**
> - Allergeni: i **14 dell'Allegato II** del Reg. UE 1169/2011. Elenco **chiuso**:
>   un quindicesimo non si aggiunge, è una norma.
> - Temperature: `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C.
> - Certificazioni: elenco **aperto** — è una richiesta commerciale, non una norma.
> - **La lettura di tutti e tre è stretta**, mai tollerante: i valori arrivano
>   convalidati da Excel, e indovinare cosa intendeva chi ha scritto è il modo di
>   mettere un articolo con il latte in una zona senza latte.
> - Temperatura, allergeni e certificazioni **si vedono dove la merce si tocca**:
>   prelievo guidato, report di prelievo dell'ODP, DDT.
>
> **UDC.**
> - Nasce su comando di un operatore o di un Team Leader; **muore quando è vuota**,
>   e lo svuotamento è automatico. Il record resta come storia: `udc_id` non si
>   riusa mai.
> - **L'etichetta si stampa alla creazione**, non dopo.
> - Il **prefisso GS1 è un parametro di Configurazione**: vuoto → codice interno,
>   compilato → SSCC. Non è un blocco e non è un'attesa.
>
> **Interfaccia.**
> - Italiano ovunque, commenti compresi. Nessun `font-size` fuori dai token MD3.
> - Il marchio Naturacare non si adatta al tema: verde `#94BC47`, blu `#21305A`.
> - I documenti di stampa restano in `pt` e `mm`: la carta non ha un rem.
> - In pagina è esposto solo `window.App`, e `window.App = App` in coda a `main.js`
>   **non si toglie**: 366 punti chiamano `App` per nome.
>
> **Ambiente — trappole già pagate.**
> - PowerShell 5.1 legge e scrive in CP1252: un giro su un `.ts` UTF-8 distrugge
>   gli accenti. Per riscrivere in blocco si passa da Node, UTF-8 senza BOM, LF.
> - Il servizio gira come SYSTEM: non si ferma da una shell normale, e
>   `Get-ScheduledTask` omette le sue attività **in silenzio**.
> - Percorsi Windows oltre 260 caratteri: `npm install` è il primo a romperlo.
> - Modificare i file del servizio non basta: Node carica all'avvio, va riavviato.

---

## 4. Come si chiude un giro

Il ciclo si ferma quando **tutte e cinque** sono vere, non quando il QA dice sì:

1. `npm run check` a **zero** su client e servizio;
2. `npm test` verde — **114 prove** oggi, e il numero sale, non scende;
3. `node test/collaudo.js` verde — **30 prove**, su database temporaneo;
4. `node test/collaudo-migrazione-1.4.js` verde — **8 prove**;
5. `INDEX.md`, HANDOFF e PIANO **dicono la verità** su ciò che è appena cambiato.

Se una sola è falsa, il giro non è finito: si torna all'Orchestratore con il motivo
scritto, non con un riassunto ottimista.

---

## 5. Cosa questo workspace NON deve fare

| Non fa | Perché |
|---|---|
| Installare in magazzino | È un atto umano, a fine turno, con un backup fresco davanti |
| Toccare `pathfinder-1.4.3.html` in radice | È il file servito adesso |
| Scrivere dentro `Pathfinder 1.2/` | È prodotta: `npm run build` la azzera |
| Versionare `server/data/` | Contiene i dati veri e le anagrafiche operatori |
| Aggiornare `dexie` e `xlsx` | Versioni fisse, l'applicativo è collaudato con quelle |
| Convertire `ui/app.js` a TypeScript | 10.529 righe, fuori dal perimetro della 1.4 |
| Accendere un interruttore `feature.*` | Lo alza una persona, a inizio turno, uno per volta |

---

## 6. Una nota onesta sul valore

Questo workspace **non accorcia il calendario della 1.4**. Il collo di bottiglia
qui non è scrivere codice: è che ogni riga tocca un magazzino che sta lavorando, e
che la verifica — build, tre suite, confronto fra due istanze su porte diverse —
costa quanto costa e non si parallelizza.

Dove rende davvero è in tre punti, e conviene puntarlo lì:

1. **Il Collaudatore che scrive prima.** I collaudi del motore e del WIP vanno
   scritti a ottobre e novembre contro dati finti. È lavoro isolato, senza stato
   condiviso, ed è esattamente ciò che un agente fa bene.
2. **Il Custode dei documenti.** Tenere tre file allineati a ogni commit è il primo
   lavoro che una persona salta quando ha fretta, ed è quello che costa di più
   quando la conversazione dopo riparte da un documento che mente.
3. **La conversione di `store.js`.** 1.974 righe, meccanica, con un collaudo che
   dice subito se è andata storta.

Sul resto — decidere cosa entra, cosa si toglie, quando si installa — decide una
persona. Il calendario del PIANO §6 non ha slack, e un piano senza slack si guarda,
non si delega.

---

*Uso interno Dietopack S.r.l. / Naturacare Group — © Andrea Sacchetti*
