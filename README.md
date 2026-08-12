# Pathfinder

**Gestione magazzino — Dietopack S.r.l. (Naturacare Group)**
© Andrea Sacchetti · Uso interno · Tutti i diritti riservati

Applicativo web per la mappatura delle ubicazioni, i movimenti di magazzino,
il prelievo guidato da ordine di produzione, la quarantena e i documenti di
trasporto. Gira su un PC in rete locale; i terminali lo aprono con un browser
e non installano niente.

> Per chi deve **lavorarci sopra** — o riprendere il progetto in una
> conversazione nuova — il punto di partenza è [INDEX.md](INDEX.md): mappa dei
> file, comandi, aperti e trappole in due pagine. Questo README serve a chi
> deve installarlo, aggiornarlo o rimetterlo in piedi.

---

## Indice

1. [Che cos'è, in una pagina](#1-che-cosè-in-una-pagina)
2. [Requisiti](#2-requisiti)
3. [Installazione su una macchina di prova](#3-installazione-su-una-macchina-di-prova)
4. [Installazione sul PC di magazzino](#4-installazione-sul-pc-di-magazzino)
5. [Trasloco su macchina virtuale](#5-trasloco-su-macchina-virtuale)
6. [Configurazione](#6-configurazione)
7. [Backup e ripristino](#7-backup-e-ripristino)
8. [Aggiornare a una versione nuova](#8-aggiornare-a-una-versione-nuova)
9. [Quando qualcosa non va](#9-quando-qualcosa-non-va)
10. [Sviluppo](#10-sviluppo)
11. [Decisioni da conoscere prima di metterci le mani](#11-decisioni-da-conoscere-prima-di-metterci-le-mani)

---

## 1. Che cos'è, in una pagina

Due pezzi, e nient'altro.

| Pezzo | Cos'è | Dove sta |
|---|---|---|
| **Il servizio dati** | Node + Express + SQLite. Custodisce i dati e serve l'applicativo | Una macchina in LAN |
| **L'applicativo** | Un file HTML solo. Interfaccia, logica, documenti di stampa | Servito dal servizio ai terminali |

```
   Terminale ─┐
   Terminale ─┼── HTTP ──> [ servizio dati ] ──> pathfinder.db (SQLite)
   Terminale ─┘   :4173         Node             + backup serale
```

**L'applicativo sceglie da solo dove vivono i dati, in base a come è stato aperto.**

| Aperto come | Dati |
|---|---|
| `http://…` servito dal servizio | Database sulla macchina, condiviso fra tutti i terminali |
| doppio clic sul file (`file://`) | IndexedDB del browser, solo su quel PC |

Il secondo caso serve a consultare e ristampare quando il servizio è fermo,
**non** a lavorare: vedi §11.

---

## 2. Requisiti

### Servizio

| | |
|---|---|
| Sistema | Windows 10/11 o Windows Server. Gira anche su Linux, ma l'installazione automatica è in PowerShell |
| Node.js | **20 o superiore** (LTS). Collaudato su 24 |
| RAM | 512 MB per il servizio. Il database sta su disco, non in memoria |
| Disco | Vedi sotto |
| Rete | Una porta TCP, di norma la **4173**, aperta verso la LAN aziendale |
| Privilegi | Amministratore **solo per l'installazione**. Poi gira come SYSTEM |

**Spazio disco.** Un database con l'anagrafica completa (~11.000 articoli) e le
giacenze occupa circa **5 MB**. Il registro movimenti è ciò che cresce: a
300-500 movimenti al giorno e sei anni di ritenzione sono 650.000-1.100.000
record, cioè indicativamente **300-500 MB**. Con i backup giornalieri
conservati per un anno, si sta sotto i **10 GB**. Non è un vincolo stretto:
è un ordine di grandezza per non trovarsi il disco pieno al quarto anno.

### Terminali

| | |
|---|---|
| Browser | Chrome o Edge recenti. Nessuna installazione, nessuna estensione |
| Schermo | Da 1280×720 in su. Sotto i 768 px di larghezza l'interfaccia passa alle schede mobili |
| Scanner | Lettori a emulazione tastiera. L'applicativo corregge da sé il layout US→IT (v1.9.1) |
| Stampanti | Stampa dal browser. Per le etichette, stampante di etichette configurata come predefinita |

Nessun dato viene installato sul terminale, e nessuna richiesta esce dalla
rete aziendale.

---

## 3. Installazione su una macchina di prova

Serve a provare senza toccare il magazzino. **Il punto è uno solo: usare un
database usa-e-getta.** Un collaudo che scrive nel database di lavoro è già
costato un blocco d'accesso.

```powershell
cd "<cartella>\server"
npm install --omit=dev
```

Poi si avvia a mano, su una porta diversa da quella del magazzino:

```powershell
$env:PATHFINDER_PORT = '4174'
$env:PATHFINDER_DB   = "$env:TEMP\prova.db"
$env:PATHFINDER_APP  = '..\pathfinder-1.4.0.html'
node pathfinder-server.js
```

L'applicativo è su `http://localhost:4174/`. Per fermarlo: `Ctrl+C`.

> `PATHFINDER_APP` serve perché avviando **a mano** nessuno dice al servizio
> quale file servire, e lui ripiega su un nome scritto nel codice. Se sbaglia
> file lo dichiara all'avvio — `ATTENZIONE l'applicativo NON esiste` — invece
> di lasciarlo scoprire al primo terminale, che vedrebbe una pagina bianca.
> Passando da `installa-servizio.ps1` (§4) questo non serve: la variabile la
> imposta lui.

---

## 4. Installazione sul PC di magazzino

**Serve solo la cartella `Pathfinder 1.4`** — quella prodotta da
`npm run build` (§10). Dentro c'è tutto: l'applicativo, il servizio,
l'installazione, il backup e queste istruzioni. Il resto del progetto sulla
macchina di magazzino non serve.

1. Copia la cartella sulla macchina. **Sceglila corta**: `C:\Pathfinder\app`
   va bene, una decina di sottocartelle dentro Desktop no. Windows si ferma a
   260 caratteri di percorso e l'installazione delle dipendenze, che scende in
   profondità dentro `node_modules`, è la prima a sbatterci.
2. Da **PowerShell come amministratore** (tasto destro → *Esegui come
   amministratore*; nella barra del titolo deve comparire «Amministratore:»):

```powershell
cd "C:\Pathfinder\app\Pathfinder 1.4\server"
.\installa-servizio.ps1
```

Lo script fa sette cose e le dichiara mentre le fa:

1. controlla Node e installa le dipendenze se mancano;
2. **cerca l'applicativo** accanto a sé e lo dichiara in `PATHFINDER_APP`. Se
   ne trova più di uno non sceglie: si ferma e li elenca — quale versione
   vedano i terminali non è una cosa da indovinare;
3. rifiuta di partire se il database indicato sta dentro OneDrive (§11);
4. rifiuta di far nascere un database vuoto se ne esiste uno nel percorso storico;
5. apre la porta sul firewall per rete aziendale e privata;
6. registra **due attività pianificate** — il servizio e il backup serale;
7. verifica che il servizio abbia aperto **davvero** il database atteso e stia
   servendo **davvero** l'applicativo atteso, e prova subito il backup.

Alla fine stampa l'indirizzo da mettere come pagina iniziale sui terminali.

> **Le dipendenze del servizio arrivano da internet, una volta sola.** Sono
> `express` e `better-sqlite3`, ~30 MB, e non stanno nella cartella di
> consegna di proposito: `better-sqlite3` porta un pezzo compilato, e quello
> giusto lo sceglie `npm` sulla macchina dove gira. Se il PC di magazzino non
> ha linea, si esegue `npm install --omit=dev` altrove e si copia la cartella
> `node_modules` prodotta — **da una macchina con lo stesso Windows e la
> stessa versione maggiore di Node**.

### Con percorsi diversi da quelli predefiniti

```powershell
.\installa-servizio.ps1 -Database 'D:\Pathfinder\data\pathfinder.db' -Porta 4173 -OraBackup '21:30'
```

### Con più di un applicativo nella cartella

Succede in fase di rilascio, quando la versione nuova e la vecchia convivono.
Si dice quale servire:

```powershell
.\installa-servizio.ps1 -Applicativo '..\pathfinder-1.4.0.html'
```

Reinstallando su una macchina già in servizio, se `PATHFINDER_APP` è già
impostata **non viene cambiata**: chi reinstalla sta sistemando il servizio,
non rilasciando una versione.

### Per togliere il servizio

```powershell
.\installa-servizio.ps1 -Disinstalla
```

Il database **non** viene toccato.

### Le due attività registrate

| Nome | Quando parte | Come gira |
|---|---|---|
| `Pathfinder - Servizio dati` | All'accensione della macchina | SYSTEM, riparte da sola se cade |
| `Pathfinder - Backup serale` | Ogni giorno all'ora scelta (20:00) | SYSTEM, recupera se la macchina era spenta |

Girano come SYSTEM, quindi da una finestra **non** elevata risultano
invisibili: `Get-ScheduledTask` le omette in silenzio e `schtasks` risponde
«Accesso negato». Per vederle serve una finestra da amministratore:

```powershell
Get-ScheduledTask -TaskName "Pathfinder*" | Select-Object TaskName, State
```

---

## 5. Trasloco su macchina virtuale

Il servizio non ha niente cablato: si sposta copiando due cose.

1. **Copia** la cartella `Pathfinder 1.4` sulla macchina nuova (§4). Non
   serve altro: dentro c'è applicativo, servizio e installazione.
2. **Copia il database a caldo**, chiedendolo al servizio vecchio — mai con
   `Copy-Item` (§7 spiega perché):

   ```powershell
   Invoke-RestMethod -Uri http://127.0.0.1:4173/api/backup -Method Post `
     -Body (@{dir='\\nuova-macchina\c$\Pathfinder\data'} | ConvertTo-Json) `
     -ContentType 'application/json'
   ```

   Poi rinomina il file prodotto in `pathfinder.db`.
3. **Installa** il servizio sulla macchina nuova (§4).
4. **Sposta il nome**, non l'indirizzo: se i terminali puntano a un nome DNS
   interno — `https://pathfinder.azienda.local` — il trasloco è un record DNS
   da cambiare. Se puntano a un indirizzo IP, sono dieci terminali da
   riconfigurare a mano.

> **Chiedere all'IT il nome DNS prima di distribuire l'indirizzo ai terminali.**
> È la misura singola che rende questo capitolo di cinque minuti invece che
> di mezza giornata.

---

## 6. Configurazione

Il servizio non ha file di configurazione: legge **variabili d'ambiente**.
Lo script di installazione le scrive a livello di macchina, così le eredita
anche quando gira come SYSTEM.

| Variabile | Predefinito | A cosa serve |
|---|---|---|
| `PATHFINDER_DB` | `C:\Pathfinder\data\pathfinder.db` | Il database. **Mai dentro una cartella sincronizzata** |
| `PATHFINDER_PORT` | `4173` | La porta di ascolto |
| `PATHFINDER_APP` | la impostano `installa-servizio.ps1` (§4) e il rilascio di una versione nuova (§8). Solo se manca, il servizio ripiega su `<cartella accanto a server\>\pathfinder-1.1.html` e, se non c'è, **lo dichiara all'avvio** | Il file dell'applicativo da servire |
| `PATHFINDER_TLS_CERT` | — | Certificato in formato PEM. Se c'è, il servizio parla `https` |
| `PATHFINDER_TLS_KEY` | — | Chiave privata. Deve essere **leggibile da SYSTEM** |

Per leggerle o cambiarle a mano:

```powershell
[Environment]::GetEnvironmentVariable('PATHFINDER_DB','Machine')
[Environment]::SetEnvironmentVariable('PATHFINDER_DB','D:\Pathfinder\data\pathfinder.db','Machine')
```

Vengono lette **all'avvio del processo**, non al volo: dopo averle cambiate,
il servizio va riavviato.

### HTTPS

Senza certificato il servizio parte in chiaro e lo dichiara all'avvio
(`ATTENZIONE senza certificato il PIN viaggia in chiaro`). Con **entrambe**
le variabili impostate parla `https`.

Se ne è impostata **una sola**, il servizio **non parte**. È voluto: un
ripiego silenzioso in chiaro sarebbe la peggiore delle tre possibilità —
tutto funzionerebbe e tutti crederebbero che i PIN viaggino cifrati.

### Dati aziendali

Non stanno nel codice: si scrivono in **Configurazione → DDT e Documenti**.
Senza ragione sociale, indirizzo, comune e **partita IVA** i documenti escono
con l'avviso «documento non conforme».

---

## 7. Backup e ripristino

### Come si fa

Ogni sera l'attività pianificata chiede al servizio una copia e la scrive in
`C:\Pathfinder\backup`, annotando l'esito in `backup.log`.

A mano, quando serve:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:4173/api/backup -Method Post `
  -Body (@{dir='C:\Pathfinder\backup'} | ConvertTo-Json) -ContentType 'application/json'
```

> **Non copiare il file con `Copy-Item` mentre il servizio gira.** Il database
> è aperto e ha un WAL accanto: una copia fatta così sembra buona e non lo è,
> perché le scritture ancora nel WAL non ci sono. Nessuno se ne accorge finché
> non serve il backup. L'endpoint passa dall'API di backup di SQLite, che di
> una copia coerente si fa carico.

### Niente viene cancellato da solo

La rotazione dei backup vecchi esiste ma va **chiesta**:

```powershell
.\backup-serale.ps1 -GiorniDiConservazione 365
```

Con il valore predefinito (`0`) non viene rimosso nulla, mai. Stessa regola
dei record: la purge del registro è solo manuale, con export preventivo.

### Verificare che un backup sia buono

Un backup non provato non è un backup. Si apre in sola lettura e si contano
le righe:

```powershell
$env:PATHFINDER_PORT = '4199'
$env:PATHFINDER_DB   = 'C:\Pathfinder\backup\pathfinder-2026-08-10.db'
node pathfinder-server.js
```

Poi, da un'altra finestra:

```powershell
Invoke-RestMethod http://127.0.0.1:4199/api/health | Select-Object file, revision, counts
```

### Ripristino

1. Ferma il servizio (da amministratore):
   `Stop-ScheduledTask -TaskName 'Pathfinder - Servizio dati'`
2. Rinomina il database corrente invece di sovrascriverlo — è l'unica copia
   di ciò che è successo dopo il backup.
3. Copia il backup al posto suo, con il nome `pathfinder.db`.
4. Riavvia: `Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'`
5. Controlla `revision` e i conteggi con `/api/health`.

---

## 8. Aggiornare a una versione nuova

1. **Backup prima.** Sempre, anche per una modifica piccola (§7).
2. Copia il file nuovo dell'applicativo nella cartella `MAPPER`, prendendolo
   da `Pathfinder 1.4\` (§10). In radice ci sta **il file che il servizio
   serve**, ed è la ragione per cui non lo si punta direttamente dentro la
   cartella di consegna: quella la build la riscrive, e un rilascio deve
   essere un gesto, non un effetto collaterale di `npm run build`.
3. Punta `PATHFINDER_APP` al file nuovo, se il nome è cambiato.
4. **Riavvia il servizio.** Node carica il codice all'avvio: dopo una
   modifica ai file di `server/`, senza riavvio continua a rispondere col
   codice vecchio.
   ```powershell
   Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
   Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
   ```
5. Verifica che i terminali vedano davvero la versione nuova:
   ```powershell
   Invoke-RestMethod http://127.0.0.1:4173/api/app-info
   ```
   Se `mtime` non è quello del file appena copiato, il servizio sta servendo
   un'altra cartella.

L'applicativo è servito con `no-cache`, quindi il browser chiede sempre se
la copia che ha è ancora buona: non serve svuotare la cache sui terminali.

---

## 9. Quando qualcosa non va

### L'applicativo si blocca a schermo intero

È il comportamento previsto quando il servizio non risponde. Non è un
guasto dell'interfaccia: è il servizio che non c'è.

```powershell
Invoke-RestMethod http://127.0.0.1:4173/api/health
Get-NetTCPConnection -LocalPort 4173 -State Listen
```

Se non risponde, da amministratore:
`Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'`

### «Sola lettura — Lavora da qui»

Due schede aperte sullo stesso applicativo: la seconda passa in sola lettura.
Non è un guasto, è la guardia contro due finestre che scrivono insieme.
Si preme **«Lavora da qui»**, oppure si tiene aperta una scheda sola.

### Un terminale non si collega

Nell'ordine: firewall, indirizzo, rete.

```powershell
Test-NetConnection -ComputerName 192.168.1.50 -Port 4173
```

### Il servizio non si ferma da riga di comando

«Accesso negato» significa che gira come SYSTEM. Serve una finestra da
amministratore. Per collaudare una modifica senza fermarlo, si avvia una
**seconda istanza** su un'altra porta e con un database usa-e-getta (§3).

### Sembra che l'aggiornamento non abbia avuto effetto

Quasi sempre è il servizio non riavviato (§8). Il secondo sospetto è
`PATHFINDER_APP` che punta a un altro file: lo dice `/api/app-info`.

### Il backup di stanotte non c'è

```powershell
Get-Content C:\Pathfinder\backup\backup.log -Tail 10
```

Il registro riporta ogni esecuzione con esito. Se manca la riga, l'attività
non è partita: da amministratore, `Get-ScheduledTaskInfo -TaskName 'Pathfinder - Backup serale'`.

---

## 10. Sviluppo

Il sorgente è modulare; ciò che si distribuisce è un file solo. Sono due
momenti diversi, non due scelte in conflitto.

```
src/  35 file  ──build──>  Pathfinder 1.4/  (la cartella che si copia)
```

### Dove sta cosa

Aprendo `MAPPER` si vedono tre cose diverse, e non vanno confuse.

| | Cos'è | Chi la tocca |
|---|---|---|
| **`Pathfinder 1.4/`** | **La consegna, completa.** L'applicativo in un file solo, il servizio dati, l'installazione, il backup e queste istruzioni. Si copia su una macchina nuova e si installa da lì, **senza il resto del progetto** | Nessuno a mano: la **produce** `npm run build` e la **svuota** a ogni giro |
| `src/` `test/` `index.html` e i file di configurazione | Il cantiere | Chi sviluppa |
| `server/` | Il servizio dati, in funzione | Si installa una volta (§4), poi ci pensa Windows |
| `ARCHIVIO/` | Versioni precedenti, file di prova, marchi, stampa etichette | Nessuno, di norma |
| `HANDOFF/` | La memoria del progetto: perché le cose stanno come stanno | Si legge prima di metterci le mani |

> **Nella cartella di consegna non si scrive a mano.** È interamente prodotta
> dalla build, che la azzera ogni volta: un file lasciato lì sparisce al primo
> `npm run build`. Per lo stesso motivo non sta nel repository — ciò che la
> compone, il sorgente e il README, c'è già.

> **`server/` non si sposta.** L'attività pianificata registrata da
> `installa-servizio.ps1` contiene il percorso *assoluto* di
> `pathfinder-server.js`: spostare la cartella non dà errore subito, dà un
> magazzino fermo al riavvio successivo. Se un giorno va spostata, si rilancia
> l'installazione dalla posizione nuova (§4).

### Comandi

| Comando | Cosa fa |
|---|---|
| `npm install` | Dipendenze del client |
| `npm run dev` | Sviluppo con ricarica automatica su `localhost:5173` |
| `npm run build` | Rifà `Pathfinder 1.4/`: l'applicativo e una copia di queste istruzioni |
| `npm run check` | Controllo dei tipi, client **e** servizio |
| `npm test` | Collaudi automatici (serpentina, FEFO, geometria, parser ODP) — ~1 secondo |
| `cd server && npm test` | 30 prove sul servizio, con database usa-e-getta |

In sviluppo il rimando alle API va puntato su un'istanza **di prova**:

```powershell
$env:PATHFINDER_DEV_API = 'http://127.0.0.1:4174'
npm run dev
```

### Struttura

```
MAPPER/
├─ Pathfinder 1.4/       ← PRODOTTA dalla build, si copia in magazzino
│  ├─ pathfinder-1.4.0.html   l'applicativo
│  ├─ README.md             queste istruzioni
│  └─ server/               il servizio, l'installazione, il backup
│                           (senza node_modules: le installa lo script)
├─ index.html            l'ingresso: testata, marchi, scheletro della pagina
├─ src/
│  ├─ main.js            avvio, stili, rete globale sugli errori
│  ├─ types/     .ts     i contratti, condivisi col servizio
│  ├─ core/      .ts     costanti · schema · persistence/ · store · cache · …
│  ├─ modules/   .ts     auth · odpParser · pickRoute · session · vault · …
│  ├─ ui/        .js     app · dialog · feedback · tabs
│  └─ styles/            i 5 fogli, nell'ordine della cascata
├─ test/                 geometria · serpentina · FEFO · parser ODP
├─ server/               NON SI SPOSTA (vedi sopra)
│  ├─ pathfinder-server.js  gli endpoint
│  ├─ installa-servizio.ps1 · backup-serale.ps1
│  ├─ lib/{db,schema}.js    SQLite e lo schema
│  └─ test/collaudo.js      30 prove
├─ HANDOFF/              i passaggi di consegne, dal 1.0 in poi
└─ ARCHIVIO/
   ├─ VERSIONI PRECEDENTI/    1.1 e 2.8.0, intatte
   ├─ BACKUP E FILE DI TEST/  export veri: fuori dal repository
   ├─ LOGHI/                  i marchi, materiale sorgente
   └─ stampa etichette/       il tool per le etichette d'ubicazione
```

**Perché due estensioni.** La conversione a TypeScript va avanti un file per
volta, e un file che è passato non torna indietro: `checkJs` resta spento sul
client, quindi il controllo è severo su ciò che è già `.ts` e assente sul
resto. Accenderlo tutto insieme su 15.000 righe scritte prima che i tipi
esistessero produce un elenco di segnalazioni che nessuno legge, e la prima
cosa che si fa per farlo tacere è spegnerlo.

Restano in JavaScript `core/store.js` e la cartella `ui/`: sono i due pezzi
grossi, e vengono per ultimi perché sono quelli che tutto il resto usa. Dove
un modulo `.ts` deve parlare con Store c'è un **ponte** dichiarato in cima al
file — `pickRoute.ts` e `vault.ts` ne hanno uno — che elenca i metodi usati e
la loro forma. Sono righe destinate a sparire il giorno in cui Store diventa
`.ts`, e nel frattempo dicono a colpo d'occhio quanto quel modulo dipende dal
magazzino.

### Le tre famiglie di endpoint

- **`/api/c/…`** — operazioni generiche. Non sanno niente di magazzino.
- **`/api/tx`** — lotto di scritture tutto-o-niente.
- **`/api/op/…`** — operazioni che leggono, decidono e riscrivono nello stesso
  respiro. **Devono stare sul server**: fra il momento in cui un terminale
  legge «ci sono 40 colli» e quello in cui scrive «adesso sono 35», un altro
  può averne presi 10.

### Convenzioni

1. **I commenti spiegano il perché, mai il cosa.** Cosa faceva prima, cosa fa
   ora, e la ragione.
2. Nessun `font-size` fuori dai token MD3.
3. Niente dipendenze nuove senza motivo forte.
4. Nessuna cancellazione automatica di record.
5. Un documento si **rilegge**, non si ricostruisce: le ristampe partono
   dallo snapshot archiviato.
6. **Italiano** in tutto ciò che si legge, commenti compresi.

---

## 11. Decisioni da conoscere prima di metterci le mani

Sono scelte prese e verificate sul campo. Cambiarle si può, ma sapendo cosa
si sta riaprendo.

**Niente lavoro offline.** Se il servizio non risponde, l'applicativo si
ferma e lo dice, a schermo intero. Niente code da risincronizzare, nessun
dato che diverge. Un operatore che continua a scansionare col servizio morto
sta buttando via il turno.

**Un solo database condiviso.** Più terminali, un arbitro solo: il server.

**Attività pianificata, non servizio Windows nativo.** Node non dialoga col
gestore dei servizi, e servirebbe un binario di terze parti: su un PC di
magazzino è il file che l'antivirus blocca alle sette di mattina.

**Il database non sta in una cartella sincronizzata.** OneDrive che
sincronizza uno SQLite aperto, con il suo WAL, è un modo noto di corromperlo.
L'installazione si rifiuta di procedere se il percorso contiene `OneDrive`.

**Il PIN si verifica sul servizio.** I browser concedono `crypto.subtle` solo
in contesto sicuro, e un terminale su `http://192.168.x.x` non lo è: lì quella
funzione non esiste. Il calcolo sta sul servizio, dove il contesto è sempre
sicuro. Formato dell'impronta identico, quindi i PIN già impostati restano
validi.

**Documento in JSON con colonne materializzate.** Si indicizzano solo i campi
su cui si cerca; il resto vive nella colonna `data`. Normalizzare tutto
rimetterebbe la catena che IndexedDB non aveva: ogni campo nuovo un
`ALTER TABLE` e un fermo del servizio.

**I documenti di stampa restano in `pt` e `mm`.** MD3 è un sistema per lo
schermo; la carta non ha un rem.

---

## Licenza

Software proprietario. © Andrea Sacchetti — Dietopack S.r.l. (Naturacare
Group). Uso interno aziendale. Nessuna licenza d'uso, copia o distribuzione
è concessa a terzi.

**Tracciabilità GMP:** ogni movimento porta la sigla dell'operatore
identificato. **Ritenzione:** sei anni. **GDPR:** nessun dato personale oltre
nome, cognome e iniziali degli operatori; nessuna telemetria; nessuna
richiesta di rete verso l'esterno.
