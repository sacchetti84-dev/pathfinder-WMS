# Pathfinder — originale italiano

> **Questo documento è l'originale italiano, ed è in parte fermo.** I capitoli
> da 1 a 8 sono precedenti alla 2.7: descrivono SQLite come unico database,
> l'applicativo come file HTML singolo e `installa-servizio.ps1` come
> installer. La versione corrente è [`README.md`](README.md), in inglese,
> scritta sulla 2.16.
>
> Resta qui perché porta ragionamenti che l'inglese non trasferisce, ed è la
> copia di lavoro dell'autore. Il documento autorevole del progetto resta
> [`INDEX.md`](INDEX.md).
>
> **Due sezioni sono invece aggiornate alla 2.19** e si leggono così come
> stanno: [«Stampanti di etichette»](#stampanti-di-etichette--dalla-219) nel
> capitolo 6 e [«L'etichetta non esce dalla
> Zebra»](#letichetta-non-esce-dalla-zebra) nel capitolo 9.


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
6. [Configurazione](#6-configurazione) · [Stampanti di etichette](#stampanti-di-etichette--dalla-219)
7. [Backup e ripristino](#7-backup-e-ripristino)
8. [Aggiornare a una versione nuova](#8-aggiornare-a-una-versione-nuova) · [Togliere Pathfinder](#togliere-pathfinder-da-questa-macchina)
9. [Quando qualcosa non va](#9-quando-qualcosa-non-va) · [L'etichetta non esce](#letichetta-non-esce-dalla-zebra)
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
$env:PATHFINDER_APP  = '..\pathfinder-1.4.3.html'
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

**Serve solo la cartella `consegna`** — quella prodotta da
`npm run build` (§10). Dentro c'è tutto: l'applicativo, il servizio,
l'installazione, il backup e queste istruzioni. Il resto del progetto sulla
macchina di magazzino non serve.

1. Copia la cartella sulla macchina. **Sceglila corta**: `C:\Pathfinder\servizio`
   va bene, una decina di sottocartelle dentro Desktop no. Windows si ferma a
   260 caratteri di percorso e l'installazione delle dipendenze, che scende in
   profondità dentro `node_modules`, è la prima a sbatterci.
2. Da **PowerShell come amministratore** (tasto destro → *Esegui come
   amministratore*; nella barra del titolo deve comparire «Amministratore:»):

```powershell
cd "C:\Pathfinder\servizio\consegna\server"
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
.\installa-servizio.ps1 -Applicativo '..\pathfinder-1.4.3.html'
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

1. **Copia** la cartella `consegna` sulla macchina nuova (§4). Non
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
| `PATHFINDER_APP_DIR` | **1.7** — la imposta `installa-servizio.ps1` (§4) a `C:\Pathfinder\app\corrente`, e **da lì non si tocca più**: le versioni si scambiano ripuntando la giunzione. Se la cartella non ha `index.html` e `manifest.json`, il servizio **lo dichiara all'avvio e resta vivo** | La cartella dell'applicativo |
| `PATHFINDER_APP_PREV` | il fratello `precedente` della cartella qui sopra. Si imposta solo per tenerlo altrove | Da dove arrivano gli assets della versione appena lasciata |
| `PATHFINDER_APP` | il ripiego a file singolo, usato solo se `PATHFINDER_APP_DIR` non c'è. Il vecchio ripiego a `pathfinder-1.1.html` **è stato tolto**: era un file che in radice non esisteva da mesi | Il file dell'applicativo da servire |
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

### Stampanti di etichette — dalla 2.19

Le etichette di merce e unità di carico escono su **stampanti Zebra collegate
in rete**. A parlarci è il **servizio**, non il browser: un browser non apre
un socket TCP, e la porta 9100 di una Zebra vuole esattamente quello. È anche
il motivo per cui funziona allo stesso modo dal PC e dal terminale MC9400.

**La stampa su A4 resta.** Se una stampante è spenta, il rotolo è finito o non
ne è stata configurata nessuna, l'etichetta esce sul foglio come è sempre
uscita. La Zebra si affianca alla carta, non la sostituisce.

#### Cosa deve esserci prima — è lavoro di rete, non di Pathfinder

| Cosa | Perché |
|---|---|
| **Indirizzo IP fisso**, o riserva DHCP sul MAC della stampante | Un indirizzo che cambia da solo è un'etichetta che smette di uscire senza che nessuno abbia toccato niente |
| **TCP 9100 in uscita** dalla macchina del servizio verso le stampanti | È l'unica connessione che il servizio apre verso l'esterno di sé. Se c'è un firewall o una VLAN separata fra le due, va aperta |
| Le stampanti su **rete interna** — `10.x`, `172.16-31.x`, `192.168.x` | Il servizio risolve il nome **prima** di connettersi e **rifiuta un indirizzo pubblico**: senza quel controllo diventerebbe un ponte verso l'esterno |
| **Calibrazione del supporto**, una volta per macchina | Etichette adesive staccate si rilevano a **interspazio**. Si tiene premuto **FEED** all'accensione finché non avanza da sola. Senza, l'etichetta esce sfasata e il codice a barre finisce a cavallo del taglio |
| **Calore (darkness)** adatto al supporto, dal pannello | Troppo poco e le barre sbiadiscono, troppo e si allargano fino a non essere più leggibili |

> **Pathfinder non manda mai alla stampante il tipo di supporto, il calore, lo
> spellicolatore o il salvataggio permanente** (`^MN`, `^MD`, `^MM`, `^JUS`).
> Sono configurazione della **macchina**, si fanno una volta col pannello e
> valgono per tutti. Il giorno che l'applicativo le spedisce a ogni etichetta,
> è l'applicativo a possedere la configurazione delle stampanti.

#### Aggiungere una stampante

**Configurazione → Stampanti → + Aggiungi stampante.** Serve il ruolo Admin.

| Campo | Cosa scriverci |
|---|---|
| **Nome** | Quello che l'operatore sceglie in corsia: **che dica dov'è** — «Zebra — Spedizioni», non «Stampante 2» |
| **Indirizzo** | L'IP della stampante, o il suo nome di rete |
| **Porta** | `9100`. Le altre ammesse sono 6101, 9101, 9102, 9103 — servono ai print server esterni e ai modelli a più canali |
| **Testina** | `203 dpi` per le desktop; `300` per le industriali più fitte |
| **Etichetta — larghezza / altezza** | Le misure del **rotolo montato**, in millimetri. Le nostre: **100 × 80** |
| **Sito servito** | Facoltativo, e serve a una cosa sola: proporre la stampante giusta. Quella di `MAG1` è quella vicina a MAG1, e mandare un'etichetta di MAG1 sulla stampante di MAG2 vuol dire un operatore che attraversa il magazzino per raccogliere un pezzo di carta |
| **Attiva** | Toglila e sparisce dall'elenco di chi stampa, senza cancellarla |

Poi il pulsante **🏷 Prova**: esce un'etichetta che porta nome, indirizzo,
testina e misure — **non porta dati di magazzino**, perché una prova che
stampa merce vera è un'etichetta vera che gira per il reparto senza merce
sotto. Subito dopo il servizio chiede alla macchina come sta e lo riporta.

#### Il layout dell'etichetta della merce

Stessa scheda, sotto. Otto campi che si impilano **dall'alto, in quell'ordine**;
di ognuno si decide se c'è, quanto è alto in millimetri, come si allinea e su
quante righe può andare a capo.

| Campo | Di serie |
|---|---|
| Codice articolo · Descrizione · **Codice a barre** · Lotto · Scadenza · **Peso** | **accesi** |
| Colli · Ubicazione | spenti |

- **Sotto le barre la testina scrive da sé il codice in chiaro.** Non è un dato
  in più: è la rappresentazione leggibile che lo standard chiede, e lascia un
  numero da digitare quando il lettore non legge.
- **Il «peso» è la quantità in unità di misura**, e la riga si intitola per
  quello che è: su articoli in KG o GR dice «Peso», su PZ, MT e LT dice
  «Quantità». Senza unità configurata la riga resta vuota — un peso senza
  unità non è un peso.
- **L'ubicazione nasce spenta perché invecchia.** Un pallet si sposta, e quel
  che è stampato resta incollato alla merce a dire una cosa che non è più vera.
  Chi la accende la trova dichiarata «alla stampa», in piccolo e in fondo.
- **Il totale in millimetri sta in fondo alla scheda**, confrontato con
  l'altezza del rotolo. Di serie occupa **68,5 mm degli 80**: gli 11,5 che
  restano non sono spazio sprecato — su etichette staccate il registro balla di
  un millimetro o due a ogni avanzamento, e un campo a filo del bordo prima o
  poi si taglia.
- **Un layout più alto del rotolo il servizio lo rifiuta, non lo tronca.**
  Un'etichetta troncata esce con l'aria di essere giusta e le manca l'ultima
  riga — che di serie è il peso — e chi la incolla non ha modo di accorgersene.

> **L'etichetta dell'unità di carico non ha un layout, ed è una decisione.**
> Un pallet porta N righe di N articoli diversi: descrizione, scadenza e peso
> non sono nemmeno *definiti* per un'unità di carico, e la prima volta che
> qualcuno ci carica sopra una seconda partita quel che c'è scritto diventa
> falso. L'unico dato che non invecchia è il numero, che non si riusa mai;
> tutto il resto lo dice il sistema, che lo sa adesso e non alla stampa. Quel
> che si configura è il **supporto**, che sta sulla stampante.

#### Come si stampa

| Cosa | Da dove |
|---|---|
| **Etichetta della merce** | Mappa → un vano → la riga → **🏷 Etichetta**, oppure dal pannello di dettaglio a lato |
| **Etichetta dell'unità di carico** | Esce **alla creazione**: un pallet senza etichetta è un pallet che nessuno può scansionare. Si ristampa dall'elenco delle unità di carico, col pulsante 🏷 |

La maschera chiede due cose e si comportano all'opposto:

- **la stampante si ricorda** — chi l'ha scelta ci sta accanto per tutto il
  turno, e il ricordo resta **su quel terminale**, non a database: quale
  macchina hai vicino è un fatto del posto in cui stai;
- **le copie tornano sempre a 1**, e si possono alzare fino a 50. Ricordare
  «6» vorrebbe dire che alla riga dopo ne escono sei senza che nessuno le abbia
  chieste: un'eccezione che si ricorda smette di essere un'eccezione.

> **«Inviata» non è «stampata», e il riscontro dice quale dei due sta
> mostrando.** La porta 9100 accetta i byte e chiude: carta finita, testina
> aperta e nastro esaurito **passano tutti come successo**. Il servizio manda,
> poi chiede alla macchina come sta, e il messaggio a video è verde solo quando
> la stampante ha risposto **e** sta bene. Rosso quando ha risposto con un
> errore — inviata, ma l'etichetta non è uscita. Giallo quando non ha risposto
> affatto: non è un guasto, ma non è nemmeno una conferma, e la macchina va
> guardata.

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

> **DALLA 1.7 QUESTA PROCEDURA È DUE COMANDI, e nessuno dei due vuole
> l'amministratore.** Una versione non è più un file ma una **cartella**, che
> vive in `C:\Pathfinder\app\`; `PATHFINDER_APP_DIR` punta alla giunzione
> `corrente` e non cambia mai più. Aggiornare e tornare indietro sono un
> ripuntamento, e il servizio **non va riavviato**: risolve la giunzione a ogni
> richiesta.
>
> ```powershell
> cd "…\MAPPER"
> npm run build
> .\server\installa-versione.ps1 -Da .\consegna -Versione 1.8
> Invoke-RestMethod http://127.0.0.1:4173/api/app-info   # versione e impronta
> ```
>
> E il ritorno indietro:
>
> ```powershell
> .\server\torna-indietro.ps1
> ```
>
> **`consegna\` NON è la cartella che il servizio serve**: è `outDir`, e
> `npm run build` la azzera a ogni giro. Da lì si installa. Puntarci la
> produzione è l'errore trovato il 17/08, che era in piedi da tre giorni.
>
> Il riavvio del servizio resta necessario per una cosa sola: una modifica ai
> file di `server\`, che Node carica all'avvio.
>
> Quello che segue è la procedura del modo a file singolo, che resta valida
> finché `PATHFINDER_APP_DIR` non è impostata.

1. **Backup prima.** Sempre, anche per una modifica piccola (§7).
2. Copia il file nuovo dell'applicativo nella cartella `MAPPER`, prendendolo
   da `consegna\` (§10). In radice ci sta **il file che il servizio
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

### Togliere Pathfinder da questa macchina

Dal pacchetto, in una finestra da amministratore:

```powershell
.\installa.ps1 -Disinstalla -Prova            # dice cosa toglierebbe, non tocca niente
.\installa.ps1 -Disinstalla                   # toglie servizio, attività, variabili e cartelle
.\installa.ps1 -Disinstalla -AncheIlDatabase  # toglie anche il database e il ruolo su PostgreSQL
```

> **Il database non se ne va da solo.** Senza `-AncheIlDatabase` restano il
> database e il ruolo su PostgreSQL: è voluto, perché disinstallare
> l'applicativo e buttare sei anni di registro non sono lo stesso gesto.
> **PostgreSQL non viene disinstallato in nessun caso.**

Installazione e disinstallazione **non si fanno nella stessa corsa**: chi
vuole ripartire pulito fa due corse.

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

### Ho perso il PIN, e non c'è nessuno che possa rinnovarmelo

Il PIN **non è recuperabile**: sul disco resta la sua impronta, non il
numero. Le vie d'uscita sono tre, in ordine di preferenza.

1. **Un grado più alto lo rinnova, dall'applicativo.** Configurazione →
   Operatori, il bottone del rinnovo: chi autorizza digita il **proprio**
   PIN. L'Operatore lo rinnova un Team Leader, il Team Leader un Admin,
   l'Admin chiunque.
2. **Se il PIN perso è quello dell'unico Admin: il codice di ripristino.**
   Dalla schermata di accesso, «🗝 Ho un codice di ripristino»: si sceglie
   l'Admin, si digita il codice — venti caratteri, spazi e minuscole
   perdonati — e si scrive il PIN nuovo. Il codice **si consuma**, e al suo
   posto ne compare subito un altro, mostrato **una volta sola**: si stampa
   e si mette dove stava quello di prima. Chi non ne ha uno lo genera da
   Configurazione → Operatori, col bottone 🗝.
3. **Se non c'è né l'una né l'altra: la chiave di macchina.**
   `PATHFINDER_TOKEN` apre le rotte senza sessione, e sta sulla macchina del
   servizio. **È l'uscita di servizio, non una procedura.**

La causa si toglie con **un secondo Team Leader** — un minuto in
Configurazione → Operatori — e con un codice di ripristino stampato.

### Il backup di stanotte non c'è

```powershell
Get-Content C:\Pathfinder\backup\backup.log -Tail 10
```

Il registro riporta ogni esecuzione con esito. Se manca la riga, l'attività
non è partita: da amministratore, `Get-ScheduledTaskInfo -TaskName 'Pathfinder - Backup serale'`.

### L'etichetta non esce dalla Zebra

I messaggi dicono già cosa guardare. Quelli che si vedono davvero:

| Messaggio | Cosa vuol dire, e cosa si guarda |
|---|---|
| «Nessuna stampante configurata» | Non ne è stata aggiunta nessuna. L'etichetta esce su A4, che è quel che l'applicativo faceva prima della 2.19 |
| «Questa macchina lavora da file» | Senza servizio non c'è nessuno che possa aprire un socket. Solo A4 |
| «**non risponde entro 3 s**» | La stampante è spenta, staccata dalla rete, o ha preso un altro indirizzo. Si prova a raggiungerla: `Test-NetConnection <ip> -Port 9100` dalla macchina del **servizio**, non da un'altra |
| «**connessione rifiutata**: a quell'indirizzo c'è qualcosa, ma non ascolta sulla porta di stampa» | L'indirizzo risponde ma non su quella porta. Di solito è la rete disattivata sulla stampante, o un altro apparecchio che si è preso quell'IP |
| «risolve su *x.x.x.x*, che è un **indirizzo pubblico**» | Il nome punta fuori dalla rete interna. Si scrive l'IP, o si sistema il DNS |
| «la porta *N* non è una porta di stampa Zebra» | Ammesse solo 6101, 9100, 9101, 9102, 9103 |
| «**Il layout occupa *X* mm e l'etichetta è alta *Y***» | Si spegne un campo o se ne riduce l'altezza in Configurazione → Stampanti. Il servizio rifiuta invece di troncare, di proposito |
| «Il codice *…* in Code128 occupa *X* mm e sull'etichetta ce ne sono *Y*» | Il codice è troppo lungo per il rotolo. Le barre **non si stringono sotto 0,25 mm**: sotto quella misura non le legge nessun lettore, e stampare barre illeggibili è peggio che non stamparle |
| «inviata, ma la stampante segnala **carta finita** / **testina aperta** / …» | L'invio è riuscito e **l'etichetta non è uscita**: si guarda la macchina. La porta 9100 accetta i byte comunque, ed è il motivo per cui questo messaggio esiste |
| «la stampante **non dichiara il proprio stato**» | Non risponde alla domanda `~HQES`. Non è un guasto — spesso è un print server esterno che quel comando non lo conosce — ma non è nemmeno una conferma: l'etichetta va guardata |

**L'etichetta esce sfasata, o il codice a barre finisce a cavallo del taglio.**
Non è Pathfinder: è la **calibrazione del supporto**. Etichette adesive
staccate si rilevano a interspazio, e la taratura si fa una volta per macchina
tenendo premuto **FEED** all'accensione finché non avanza da sola.

**Le barre sbiadiscono, o si allargano fino a non leggersi.** È il **calore**,
e si regola dal pannello della stampante: Pathfinder non lo manda mai, perché
è configurazione della macchina e vale per tutti i lavori.

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
| **`consegna/`** | **La consegna, completa.** L'applicativo — dalla 1.7 un indice piu' `assets/` con un manifesto, non piu' un file solo — il servizio dati, l'installazione, il backup e queste istruzioni. Si copia su una macchina nuova e si installa da lì, **senza il resto del progetto** | Nessuno a mano: la **produce** `npm run build` e la **svuota** a ogni giro |
| `src/` `test/` `index.html` e i file di configurazione | Il cantiere | Chi sviluppa |
| `server/` | Il servizio dati, in funzione | Si installa una volta (§4), poi ci pensa Windows |
| `ARCHIVIO/` | Versioni precedenti, file di prova, marchi, stampa etichette | Nessuno, di norma |
| `INDEX.md` | **L'unico documento del progetto**: stato, regole, trappole e coda di lavoro. Dal 17/08/2026 assorbe tutto ciò che stava in `HANDOFF/` | Si legge prima di metterci le mani |

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
| `npm run build` | Rifà `consegna/`: l'applicativo, il manifesto e una copia di queste istruzioni. **Non è la cartella che il servizio serve** |
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
├─ consegna/             ← PRODOTTA dalla build, si INSTALLA (non si serve da qui)
│  ├─ index.html            l'applicativo, piu' assets/ e manifest.json
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
├─ INDEX.md              stato, regole, trappole, coda di lavoro — l'unico documento
└─ ARCHIVIO/
   ├─ HANDOFF STORICI/        i passaggi di consegne e i piani, fino al 17/08/2026
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

**L'ultimo Admin non si retrocede, non si disattiva e non si cancella.** Lo
impone il **servizio**, non la maschera: senza Admin la Configurazione non si
apre e il codice di ripristino non vale — si resterebbe con la sola chiave di
macchina. Con due Admin il gesto passa. Il reset dei dati resta permesso:
svuota tutto, nessuno resta con un PIN, e la finestra del primo avvio si
riapre da sé.

**I documenti di stampa restano in `pt` e `mm`.** MD3 è un sistema per lo
schermo; la carta non ha un rem.

---

## Licenza

Software proprietario. © Andrea Sacchetti — Dietopack S.r.l. (Naturacare
Group). Uso interno aziendale. Nessuna licenza d'uso, copia o distribuzione
è concessa a terzi.

**Tracciabilità GMP:** ogni movimento porta la sigla dell'operatore
identificato, e **nessun record viene mai cancellato** — dalla 2.17 non c'è più nemmeno un numero di ritenzione nel codice, perché non cancellava niente e i sei anni non li chiedeva nessuna norma (vedi `README.md`). **GDPR:** nessun dato personale oltre
nome, cognome e iniziali degli operatori; nessuna telemetria; nessuna
richiesta di rete verso l'esterno.
