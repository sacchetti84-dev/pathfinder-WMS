# HANDOFF — Pathfinder 1.4

**L'unico passaggio di consegne in vigore.** Assorbe e sostituisce gli HANDOFF
1.0, 1.2 e 1.3: gli aperti che si trascinavano sono nella §4, le decisioni
permanenti nella §5, le trappole nella §6, le convenzioni nella §7. I documenti
vecchi restano leggibili in `ARCHIVIO/HANDOFF STORICI/` — vedi §10.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 12/08/2026 · Rev. 03 — la 1.2 è in magazzino, la Fase 0 è dentro

---

## 0. Come si riprende, in tre righe

Dare **[INDEX.md](../INDEX.md)** e **questo file**. Basta.
Quando si comincia a costruire, aprire **[PIANO-1.4.md](PIANO-1.4.md)**: lì c'è il
disegno dei dati, il calendario e il perché di ogni scelta. Il [README](../README.md)
serve a chi installa, aggiorna o diagnostica.

Repo privato `sacchetti84-dev/pathfinder`, branch `main`, albero pulito e in pari.

---

## 1. Stato, al minuto

| Voce | Valore |
|---|---|
| In magazzino, **adesso** | `pathfinder-1.2.html` — verificato su `/api/app-info`, 1.486.348 byte |
| In lavorazione | **1.4.0**, Fase 0 dentro. Manca `store.js` in TypeScript |
| Sorgente | 25 file in `src/`: **19 TypeScript**, 6 JavaScript, più 5 CSS |
| Ancora JavaScript | `core/store.js` · `main.js` · `ui/` (4 file) |
| Collezioni | **19** — le 14 di sempre più `lots` `udc` `tasks` `wip` `storage_rules`, vuote |
| Collaudi | **114 client** · **30 servizio** · **8 migrazione** — tutti verdi |
| Tipi | `npm run check` a 0 su client e servizio |
| Scadenza progetto | **31/12/2026** · ultima installazione utile **19/12** |

> **Il disallineamento è finito.** Il magazzino gira sulla 1.2: i cinque comandi
> sono stati impartiti l'11/08 e `/api/app-info` lo conferma. La verifica di
> stoccaggio è in servizio, e `pathfinder-1.1.html` è uscito dalla radice — resta
> in `ARCHIVIO/VERSIONI PRECEDENTI/`, identico byte per byte, per il ritorno
> indietro.
>
> **Ma la 1.4.0 non è ancora in magazzino**: quello che c'è di 1.4 sta nel
> sorgente, non nel file servito. Non si installa finché `store.js` non è
> convertito e l'intera 1.4.0 non è chiusa — vedi §3.

---

## 2. Cosa è successo nell'ultima sessione

| Commit | Cosa |
|---|---|
| `05cfe74` | **Avvisi merceologici**: temperatura, allergeni e certificazioni al prelievo guidato, sul report ODP e sul DDT |
| `ae1ec86` | **1.4.0 Fase 0**: migrazione `ALTER TABLE` nel prodotto, schema mosso una volta (19 collezioni), export/import da `COLLEZIONI`, interruttori `feature.*` |
| `b104bc7` | La 1.2 entra in magazzino, `pathfinder-1.1.html` esce dalla radice |
| `ccf249f` | Un handoff solo, e gli aperti smettono di trascinarsi |
| `60ddceb` | **5.519 righe di commento** tolte da 39 file, provando che il bundle minificato resta identico byte per byte. Nasce `INDEX.md` |
| `3127d79` | **PIANO-1.4**: le cinque funzioni riordinate per dipendenza, calendario, e il bloccante della §1 |
| `2142031` | Il collaudo che dimostra che i dati sopravvivono al cambio di schema, più il prototipo della migrazione |
| `99d7bb3` | Le tre decisioni: WIP dentro, verifica a fine ottobre, `store.js` in Fase 0 |
| `548c3df` `e7e6512` | **Verifica di stoccaggio**: attributi articolo e zona, import/export Excel, segnalazione in mappa, deroga della cella Riservata |
| `58e95e1` | Questo documento |

---

## 3. Da dove si riparte, in ordine

### Prima cosa, e non è codice — resta da fare

**Caratterizzare le zone** in Configurazione → Zone: classe di conservazione e la
spunta sulla zona allergeni. Finché non è fatto la mappa resta muta, per quanti
articoli si classifichino: la verifica confronta due metà e una manca.

Poi **esportare l'anagrafica** e costruire le tendine in Excel puntando al foglio
**«Valori ammessi»** che l'export porta con sé — che da oggi descrive anche la
colonna `Certificazioni`.

### Il codice della 1.4.0 — dove siamo

| # | Cosa | Stato |
|---|---|---|
| 1 | La migrazione `ALTER TABLE` dentro `PathfinderDB` | **fatto** — `_migra`, `server/lib/db.js` |
| 2 | **`core/store.js` in TypeScript**, a blocchi. Cache e `_applyToCache` per primi | **da fare — è il prossimo lavoro** |
| 3 | `_CACHE_SHAPE` a 19 collezioni (aperto #6) | **fatto** |
| 4 | Schema mosso una volta: `udc_id`, `lots` `udc` `tasks` `wip` `storage_rules`, Dexie `version(8)` | **fatto** |
| 5 | Export/import da `COLLEZIONI` invece che da tre elenchi a mano | **fatto** |
| 6 | Interruttori `feature.*` in `meta`, tutti spenti | **fatto** |

**Il prossimo lavoro è il punto 2, e solo quello.** Vale la regola di sempre:
`store.js` e `app.js` **non nello stesso commit**, `app.js` non si tocca affatto,
conversione **a blocchi** con build e collaudo in mezzo a ognuno, e in coda
spariscono i due ponti verso Store in cima a `pickRoute.ts` e `vault.ts`.

Poi si costruisce, si installa la 1.4.0, e solo allora comincia la 1.4.1.

Criterio di riuscita della 1.4.0: **si installa e non cambia niente a video.**
Con una eccezione dichiarata: gli **avvisi merceologici** (PIANO §4.4ter) si
vedono, ed è voluto — non passano da un interruttore perché non cambiano nessun
comportamento, mostrano un dato che c'era già.

---

## 4. Il registro degli aperti

Tutti gli aperti dei tre handoff precedenti, verificati uno per uno. La colonna
*origine* dice da dove viene, così non si riaprono discussioni già chiuse.

### Ancora aperti

| # | Cosa | Origine | Chi |
|---|---|---|---|
| 1 | **`core/store.js` in TypeScript** — il pezzo che manca alla 1.4.0. 1.974 righe, a blocchi | PIANO-1.4 §3 | **prossimo lavoro** |
| 2 | **Caratterizzare le zone** e popolare gli attributi in anagrafica. Senza, la mappa resta muta | nuovo | Andrea, alla configurazione |
| 3 | **Partita IVA e dati del mittente** in Configurazione → DDT. La maschera c'è: è un dato da digitare, non codice da scrivere | **1.0 §7.1** | Andrea, quando opportuno |
| 4 | **Nome DNS interno e certificato** dalla CA aziendale. **Il codice è pronto e non aspetta niente**: due variabili e HTTPS si accende. Il certificato arriva a lavori finiti | **1.0 §7.2** · 1.2 §6.1 | IT — non blocca |
| 5 | **`weight_net_kg` in anagrafica.** Il campo è cablato ovunque — maschere, import, export, calcolo peso del DDT: è **solo da compilare**, colonna `Peso_Netto_Collo`. `pieces_per_pack` diventa la UM-per-collo in 1.4.2 | **1.0 §7.6** | import Excel |
| 6 | **`ui/` in TypeScript**, `app.js` da solo sono 10.529 righe. Fuori dalla 1.4 | 1.2 §6.4 · 1.3 §6.4 | grande |
| 7 | **`TODO F1-REVIEW` ×3**: cache svuotata prima della conferma del supporto (`store.js` ×2), riallineamento ridondante dopo `resetAll()` (`app.js`) | 1.3 | piccolo |

### I cinque comandi — **impartiti l'11/08**, restano qui perché servono a ogni versione

Da **PowerShell come amministratore** (il servizio gira come SYSTEM), **a fine
turno** e **con un backup fresco davanti**. Si rifanno tali e quali per installare
la 1.4.0, cambiando il nome del file.

Prima dell'11/08 `PATHFINDER_APP` era **vuota** e il servizio ripiegava sul nome
scritto nel codice, `pathfinder-1.1.html`: è il motivo per cui il passo 3 non era
facoltativo. Adesso la variabile è impostata, e il passo 3 serve solo quando il
nome del file cambia — cioè a ogni versione.

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:4173/api/backup -Method Post `
  -Body (@{dir='C:\Pathfinder\backup'} | ConvertTo-Json) -ContentType 'application/json'
```

```powershell
cd "C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER"
Copy-Item "Pathfinder 1.2\pathfinder-1.2.html" pathfinder-1.2.html
```

```powershell
[Environment]::SetEnvironmentVariable('PATHFINDER_APP',
  'C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER\pathfinder-1.2.html','Machine')
```

```powershell
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
```

```powershell
Invoke-RestMethod http://127.0.0.1:4173/api/app-info
```

Se `app_file` non è la 1.2 o `mtime` non è quello del file appena copiato, il
servizio sta servendo un'altra cartella: non insistere, leggere il README §9.

**Il ritorno indietro è il punto 3 all'incontrario, più un riavvio.**
`pathfinder-1.1.html` resta in radice — nessuno di questi passi lo sposta, proprio
per questo — e il database non viene toccato.

### Chiusi — non riaprirli

| Cosa | Origine | Come è finita |
|---|---|---|
| Backup automatico serale del `.db` | 1.0 §7.5 | **Fatto**: `backup-serale.ps1`, attività pianificata alle 20:00 |
| Database fuori da OneDrive | 2.0 Fase 0 | **Fatto**: `C:\Pathfinder\data\`, `PATHFINDER_DB` esplicito |
| Git e repository privato | 2.0 Fase 0 | **Fatto** |
| HTTPS *nel codice* | 1.0 §7.2 | **Fatto**: due variabili e si accende. Manca solo il certificato (aperto 4) |
| `persistence/{local,remote}` in TypeScript | 1.2 §6.4 | **Fatto** (1.3) |
| `modules/` in TypeScript | 1.2 §6.4 | **Fatto**: tutti e otto (1.3) |
| Collaudi geometria ubicazioni e parser ODP | 1.2 §6.5 | **Fatto**: 16 + 26 prove (1.3) |
| La cartella `HANDSOFF` con la esse di troppo | 1.2 §6 | **Fatto** (1.3) |
| Allergeni: quali tracciare | PIANO-1.4 A1 | **Chiuso**: i 14 dell'Allegato II, segregazione per zona |
| Classi di temperatura | PIANO-1.4 A2 | **Chiuso**: `SURG` −18 · `REFR` +4/+8 · `AMB` +18/+25 |
| Portare la 1.2 in magazzino | 1.2 §6.6 · 1.3 §6 | **Fatto 11/08**: cinque comandi, `/api/app-info` lo conferma |
| `pathfinder-1.1.html` in radice e in archivio | 1.2 §6 · 1.3 §6 | **Fatto 12/08**: la radice serve la 1.2, la copia morta è uscita |
| Schede grafico che tagliano ~6 px | 1.0 §7.3 | **Chiuso 12/08**: vanno bene così, non è un difetto da inseguire |
| Elenco causali di trasporto | 1.0 §7.4 | **Chiuso 12/08**: le nove di serie sono validate |
| Prefisso aziendale GS1 | PIANO-1.4 §4.3 | **Chiuso 12/08**: non è un'attesa, è un parametro di Configurazione (D7) |
| Chi alza la priorità di un compito | PIANO-1.4 §4.1 | **Chiuso 12/08**: solo il Team Leader (D4) |
| `ARCHIVIO/LOGHI/` — file doppi e nomi generati | 1.2 §6 · 1.3 §6 | **Fuori perimetro 12/08**: non è un compito del progetto |
| Collaudi su `_applyToCache` | 1.3 §6.5 | **Fatto 12/08**: 19 collezioni dichiarate, `resetAll` le pulisce tutte |

---

## 5. Decisioni permanenti

Non si rimettono in discussione. Fonte fra parentesi.

### Architettura e dati
1. **Niente lavoro offline.** Se il servizio non risponde l'app si ferma e lo dice, a schermo intero. Niente code da risincronizzare (1.0 §4.1).
2. **Un solo database condiviso**, più terminali in rete. L'arbitro fra terminali è il server (1.0 §4.2).
3. **Attività pianificata, non servizio Windows nativo**: NSSM è il file che l'antivirus blocca alle sette di mattina (1.0 §4.3).
4. **Documento JSON con colonne materializzate.** Si indicizza solo ciò che Dexie indicizzava; il resto vive in `data`. È il motivo per cui un campo nuovo non è una migrazione (1.0 §4.4).
5. **Servizio on-prem.** Niente Azure SQL, niente Redis, niente Static Web Apps: la concorrenza è già arbitrata da una transazione SQLite dentro `/api/op/…` (1.2 §3.4).
6. **Niente Entra ID.** Si resta al PIN/QR: MSAL non funziona su `file://` e rimetterebbe la dipendenza dalla WAN (1.2 §3.2).
7. **Sage X3 fino al 2038.** Nessun adapter D365: resta solo la cucitura, il parser dietro un'interfaccia (1.2 §3.3).

### Build e forma
8. **Il sorgente si scompone, la distribuzione si ricompone**: un file solo resta la forma in cui l'applicativo arriva in magazzino (1.2 §3.1).
9. **Il CSS non si minifica**: toglieva 413 caratteri su 146.368 e riscriveva le regole (1.2 §3.5).
10. **La copia a file singolo lavora in sola lettura** (1.2 §3.6).
11. **`checkJs` spento sul client, acceso sul servizio** (1.2 §3.7).
12. **I tipi non fanno cambiare il codice**: dove tipo e codice litigano, cede il tipo (1.2 §3.8).
13. **`_format` del pacchetto di export non segue la versione dell'applicativo**: descrive la forma del file. A muoversi è `_appVersion` (1.3 §5.4).

### Metodo
14. **Un blocco per commit**, con build e collaudo in mezzo. Chi sposta non corregge (1.2 §5.1).
15. **I collaudi si scrivono prima** della conversione, non dopo (1.3 §5.1).
16. **Un collaudo si prova rompendo il codice** e vedendolo fallire (1.2 §4.1 · 1.3 §5.2).
17. **I documenti si rileggono, non si ricostruiscono**: le ristampe partono dallo snapshot archiviato (1.0 §9.5).

### 1.4
18. **Il WIP resta nella 1.4** (1.4.5, installato il 19/12 a interruttore spento).
19. **Verifica dell'andamento il 31/10**, con la scala di cosa togliere già decisa.
20. **Allergeni:** i 14 dell'Allegato II del Reg. UE 1169/2011. Elenco chiuso.
21. **Temperature:** `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C.
22. **Lettura stretta**, non tollerante: i valori arrivano convalidati da Excel.
23. **La cella Riservata ammette allergeni** — deroga esplicita, contata ed elencabile. Sulla temperatura non deroga.
24. **Ogni campo nuovo è facoltativo**, e assente significa «come nella 1.2».
25. **La priorità di un compito la alza solo il Team Leader** (12/08, D4).
26. **La UDC nasce su comando e muore quando è vuota**: lo svuotamento è automatico, la creazione no. Il record resta come storia, e `udc_id` non si riusa mai (12/08, D5).
27. **L'etichetta si stampa alla creazione della UDC**, non dopo. Non è più una cosa che si può togliere dal calendario (12/08, D6).
28. **Il prefisso GS1 è un parametro di Configurazione**: vuoto → codice interno, compilato → SSCC. Il giorno che arriva nessuno installa niente (12/08, D7).
29. **Le certificazioni sono il terzo attributo dell'articolo.** Il loro elenco NON è chiuso — non è una norma, è una richiesta commerciale — ma la lettura resta stretta (12/08, D8).
30. **Temperatura, allergeni e certificazioni si vedono dove la merce si tocca**: prelievo guidato, report ODP, DDT. Una sorgente sola per le tre viste (12/08, D9).
31. **Gli interruttori `feature.*` sono una chiave per una in `meta`**, non un unico record: accenderne due nello stesso turno deve costare due gesti distinti.

---

## 6. Trappole già pagate

### Ambiente e strumenti
1. **PowerShell distrugge gli accenti.** `Get-Content`/`Set-Content` in WinPS 5.1 leggono e scrivono in CP1252: un giro su un `.ts` UTF-8 trasforma `Quantità` in `QuantitÃ `. Per riscrivere in blocco si passa da Node in **UTF-8 senza BOM, LF**. I due `.ps1` invece **hanno** il BOM e va lasciato.
2. **Il dev server parla col magazzino vero**: `vite.config.js` rimanda `/api` a `127.0.0.1:4173`. Per provare senza toccare niente, **`?db=local`**.
3. **Il servizio gira come SYSTEM**: non si ferma da una shell normale. Per collaudare, seconda istanza su un'altra porta con `PATHFINDER_DB` temporaneo (1.0 §5.3).
4. **Le attività pianificate come SYSTEM sono invisibili** da una finestra normale: `Get-ScheduledTask` le omette **in silenzio** (1.2 §4.2).
5. **Modificare i file del server non basta**: Node carica all'avvio, il servizio va riavviato (1.0 §5.4).
6. **`better-sqlite3`** va tenuto a una versione con binario già compilato per il Node installato (1.0 §5.5).
7. **Percorsi Windows oltre 260 caratteri**: `npm install` è il primo a romperlo. Installare in `C:\Pathfinder\app` (1.3).
8. **I backtick nei messaggi di commit** vengono interpretati dalla shell: heredoc con apici (1.2 §4.5).

### Codice
9. **`CREATE TABLE IF NOT EXISTS` non aggiunge colonne**, e il `CREATE INDEX` dopo muore nel costruttore: il servizio non parte affatto. Era il bloccante della PIANO-1.4 §1, **tolto il 12/08** con `PathfinderDB._migra`. Resta scritto qui perché la ragione per cui `createTableSQL` e `createIndexSQL` sono due funzioni e non una è esattamente questa: **non rimetterle insieme.**
9bis. **Il collaudo della migrazione costruisce lo schema di ieri togliendo le aggiunte a `schema.COLLECTIONS`** e poi le rimette. Chi aggiunge una collezione alla 1.4 la aggiunga anche all'elenco `NUOVE` di `collaudo-migrazione-1.4.js`, se no la prova gira su due schemi identici e non prova niente.
10. **`getLocationStatus`: uno stato esplicito vince su «occupata».** Una cella Riservata con merce dentro resta `reserved` — senza questo la deroga non scatterebbe mai.
11. **`addArticle` esce con `false` su un codice noto.** Era il motivo per cui l'import diceva «importati 0». Ora c'è `upsertArticles`.
12. **`Dialog.confirm` non accetta HTML**: vuole `message` (testo) e `details` (nodo DOM). È deliberato.
13. **Le classi `table` / `table-sm` non esistono**: è `sx-table`, dentro un `div` con `overflow-x:auto`.
14. **Nella pagina è esposto solo `window.App`**, non `Store`.
15. **L'ordine degli allergeni è quello dell'Allegato II**, non quello di digitazione: `SOIA` prima di `LATTE`.
16. **Il prefisso `nc-` era già preso** dalle stampe del cartellone non conformità: le classi nuove usano `conf-`.
17. **Un controllo che passa subito potrebbe non controllare niente**: JSDoc in `/*` invece di `/**` non viene letto; un `sort()` su due elementi chiama il comparatore una volta sola (1.2 §4.1).
18. **La guardia multi-scheda** mette la seconda scheda in sola lettura: una scheda sola quando si misura (1.0 §5.2 · 1.2 §4.4).
19. **Le sequenze `\uXXXX` letterali** nel file monolitico rompono le sostituzioni testuali che le attraversano (1.0 §5.1) — vale sui file in `ARCHIVIO`.

---

## 7. Convenzioni e vincoli permanenti

### Convenzioni (1.0 §9, aggiornate)
1. **I commenti spiegano il PERCHÉ, mai il cosa** — e sono **pochi**: la narrativa sta nell'INDEX e negli handoff, non nel codice.
2. **Nessun `font-size` fuori dai token MD3.**
3. **Niente dipendenze nuove** senza motivo forte.
4. **Nessuna cancellazione automatica di record.** La purge è manuale, con export preventivo.
5. **Italiano** in tutto ciò che l'utente legge, commenti compresi.

### Vincoli permanenti (1.0 §10)
- Uso interno Dietopack S.r.l. / Naturacare Group. Copyright Andrea Sacchetti su ogni file.
- **Tracciabilità GMP**: ogni movimento porta la sigla dell'operatore identificato.
- **Tenuta del dato a sei anni** (300-500 movimenti/giorno → 650k-1,1M record).
- Il marchio Naturacare non si adatta al tema: verde `#94BC47`, blu `#21305A`, sempre.
- **GDPR**: nessun dato personale oltre nome, cognome e iniziali; nessuna telemetria; nessuna richiesta di rete verso l'esterno.
- **I documenti di stampa restano in `pt` e `mm`**: la carta non ha un rem.

---

## 8. Cosa NON fare

- **Non installare una 1.4.x parziale.** La Fase 0 è dentro ma `store.js` è ancora JavaScript: si installa quando la 1.4.0 è chiusa per intero, non prima.
- **Non toccare `pathfinder-1.2.html` in radice**: è quello servito adesso.
- **Non convertire `store.js` e `app.js` nello stesso commit.**
- **Non togliere i ponti verso Store** finché Store è JavaScript: cadono con la 1.4.0.
- **Non togliere `window.App = App`** in coda a `main.js`: 366 punti chiamano `App` per nome e smetterebbero di funzionare **in silenzio**.
- **Non scrivere a mano dentro `Pathfinder 1.2/`**: è prodotta, la build la azzera.
- **Non versionare `server/data/`**: contiene i dati veri e le anagrafiche operatori.
- **Non aggiornare `dexie` e `xlsx`**: versioni fisse, l'applicativo è collaudato con quelle.
- **Non collaudare sul database di lavoro.** Mai. È già costato un blocco d'accesso (1.0 §5.6).
- **Non accendere due interruttori `feature.*` nello stesso turno.**
- **Non aggiungere un quindicesimo allergene**: è una norma. Le esigenze locali si esprimono con la deroga della cella Riservata.
- **Non rendere tollerante** la lettura di allergeni e temperature.
- **Non convertire il servizio a TypeScript** senza un motivo forte.
- I conteggi DOM/CSS di confronto fra versioni sono **misure, non invarianti**: chi rimisura, rimisuri entrambe.

---

## 9. Comandi

```bash
npm run check                       # tsc client + servizio
npm test                            # 114 prove client
npm run build                       # produce "Pathfinder 1.2/"
```

```bash
node test/collaudo.js               # 30 prove servizio, da server/
```

```bash
node test/collaudo-migrazione-1.4.js   # 8 prove sul cambio di schema, da server/
```

---

## 10. I documenti vecchi, e dove sono finiti

Spostati in **`ARCHIVIO/HANDOFF STORICI/`**. Restano leggibili come memoria; non
servono per lavorare, perché tutto ciò che era ancora vivo sta nelle §4-§8.

| Documento | Perché è uscito |
|---|---|
| `HANDOFF-pathfinder-1.0.md` | Aperti, decisioni, trappole, convenzioni e vincoli: assorbiti in §4-§7. Resta la cronaca della prima versione client-server |
| `HANDOFF-pathfinder-1.2.md` | Idem. Resta il racconto dello spacchettamento del monolite |
| `HANDOFF-pathfinder-1.3.md` | Idem. Resta il dettaglio delle sei differenze fra ciò che il codice prometteva e ciò che faceva |
| `PIANO-AZIONE-Pathfinder-2.0.md` | Era già marcato **superato** dal suo stesso autore. Le fasi 0-4 sono state eseguite; le decisioni D3 (Entra) e Fase 6 (D365) sono state ribaltate |
| `Pathfinder_Handoff_Valutazione_Tecnica_ES6 TYPESCRIPT.md` | **Eseguito**: è stata scelta l'Opzione C, TypeScript + Vite, ed è quello che gira |
| `Pathfinder_Handoff_Infrastruttura_Azure_ERP_REDIS.md` | **Respinto**: Azure Static Web Apps, Redis e la coda offline su IndexedDB sono tutti esclusi dalle decisioni 5, 6 e 1 della §5 |
| `PROMPT-workspace-multiagente.md` | Prompt per un esperimento archiviato (app Android multi-agente), senza vincoli sul core. **Rimpiazzato il 12/08** da [`PROMPT-workspace-multiagente-1.4.md`](PROMPT-workspace-multiagente-1.4.md), che parla del lavoro vero |

---

*Uso interno Dietopack S.r.l. / Naturacare Group — © Andrea Sacchetti*
