# Pathfinder — INDEX

**Questo è l'unico documento del progetto.** Stato, istruzioni, regole, trappole
e coda di lavoro stanno qui dentro. Non ce n'è un secondo da leggere insieme:
tutto ciò che era sparso in `HANDOFF/` è stato assorbito qui il **17/08/2026**, e
gli originali sono scesi in `ARCHIVIO/HANDOFF STORICI/` come memoria — non sono
istruzioni e non vanno più aperti per lavorare.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
Repo privato `sacchetti84-dev/pathfinder`, branch `main` · agg. **18/08/2026**

---

## 0. Come si lavora qui

**Per chi arriva adesso (persona o agente):**

1. **Si legge questo file, e basta.** Il [README](README.md) serve solo a chi
   installa il servizio da zero o deve diagnosticare una macchina.
2. **Il primo comando di ogni conversazione che tocchi la consegna è
   `Invoke-RestMethod http://127.0.0.1:4173/api/app-info`.** Quello che risponde
   il servizio batte quello che dice questo documento: tre volte in tre giorni
   il documento diceva dove girava la produzione, e la produzione girava
   altrove.
3. **Questo file si aggiorna a fine conversazione**, non durante — e chi cambia
   uno stato (installa, accende un interruttore, chiude un aperto) aggiorna la
   riga **nello stesso gesto**. Il 13/08 `feature.tasks` è stato acceso alle
   10:31 e per mezza giornata i documenti dicevano «tutti spenti»: è il primo
   fatto che una conversazione nuova legge, e decide se un difetto segnalato sia
   «impossibile» o «normale».
4. **Installare in magazzino è un atto umano**: a fine turno, con un backup
   fresco davanti, e la decisione la prende Andrea. Un agente costruisce,
   prova al banco e prepara i comandi.
5. **Codice scarno**: commenti pochi e sul **perché**, mai sul cosa. La
   narrativa sta qui, non nei file — 5.519 righe di commento sono state tolte
   apposta.
6. **Non si segnalano ritardi di programma.** Le date si scrivono come fatti; il
   giudizio sull'andamento lo dà Andrea.

**Cos'è Pathfinder.** Applicativo web per la gestione di un magazzino alimentare
in GMP. Servito da Node + Express + SQLite su rete interna, porta **4173**,
database in `C:\Pathfinder\data\pathfinder.db`. Più terminali, un solo database,
l'arbitro è il server. UNLICENSED, uso interno.

### Le due cartelle, e non si confondono

| | Cos'è | Chi ci scrive |
|---|---|---|
| **`…\Desktop\PROGETTI E CODING\MAPPER\`** | **La cartella di lavoro.** Sorgenti, collaudi, build, documenti, banco di prova: **tutto il lavoro in corso sta qui, e solo qui** | chiunque lavori al progetto |
| **`C:\Pathfinder\`** | **La directory di installazione dell'applicativo**: `app\`, `data\`, `backup\`. Non è un posto di lavoro, e non ci si appoggia niente | solo `installa-versione.ps1`, `torna-indietro.ps1` e il backup |

**L'installazione di questa macchina è in prova sul PC di Andrea**, non è un
magazzino in funzione: ciò che si rompe qui non ferma nessuno. Il database però
porta dati veri, e per questo un collaudo si fa sempre su una **copia** — §5.

> **Un agente lavora dentro `MAPPER\` senza chiedere**: legge, scrive, costruisce,
> collauda, aggiorna questo documento. **Tutto ciò che tocca `C:\Pathfinder\`, il
> servizio, il database o le attività pianificate si propone e si aspetta il via.**

---

## 1. Stato

### La 1.7 è in servizio dal 17/08 sera, e la giunzione non c'è più

Installata alle 18:29, ha lasciato l'applicativo **giù per tre ore**: la pagina
rispondeva 500 e `/api/app-info` dava versione e impronta nulle. La causa, presa
solo dopo aver fatto dire l'errore al servizio, è in §5 e vale più della serata:
**il processo del servizio, che gira come SYSTEM, non riesce ad attraversare una
giunzione** — `UNKNOWN: unknown error, stat 'C:\Pathfinder\app\corrente'` —
mentre lo stesso percorso, dallo stesso codice, si apre senza un intoppo da una
sessione utente.

**`corrente` e `precedente` sono adesso cartelle vere**, di cui l'installazione
sostituisce il contenuto. Tutte le promesse della 1.7 restano: nessun
amministratore, nessun riavvio, ritorno indietro in un comando. Verificato in
servizio il 17/08: indice **8.542 byte** compressi e `no-cache`, i tre assets
`immutable`, **251 kB** al primo caricamento, `xlsx` solo a richiesta.

### La 1.8.4 chiude i tre buchi che il collaudo ha trovato

Il 18/08 sera, dopo l'installazione della 1.8.3, tre funzioni sono state
riscritte perché tutte e tre mentivano nello stesso modo: **scrivevano un
saldo giusto sopra un elenco di colli che era rimasto indietro.**

1. **Il DDT chiede i colli nel carrello**, non all'evasione. Il documento si
   stampa PRIMA che la merce esca, e con colli di misura diversa «3 colli»
   non dice quanta merce sia: per scrivere le UM sulla riga bisogna sapere da
   quali colli esce. La riga porta `packs_out`, `qty_uom` e `uom` —
   **l'unità è della riga, non del documento**, perché su un DDT convivono
   una riga in KG e una in PZ, ed è la ragione per cui i pesi si scrivono a
   mano. In stampa la colonna «Pezzi» era `pieces_per_pack × colli`: tre
   colli da 25+25+7 uscivano **75 invece di 57**.
2. **L'inventario di vano e la Conta rettificano ridichiarando la riga.** Su
   una riga a colli dichiarati «quanti ne hai contati» non è una domanda a
   cui si possa rispondere bene: tre colli da 25, 25 e 18 fanno tre come tre
   colli da 25, e sono diciassette chili di differenza. Si dichiara com'è
   fatto lo scaffale, e `rettifica` traduce la differenza in movimenti. **I
   colli in più non si rifiutano più**: era l'ultimo «vai da un'altra parte».
3. **Il campione esce da un collo preciso.** `sampleItem` scalava `qty_uom` e
   lasciava `packs` com'era: dove comanda l'elenco, il campione **spariva
   alla lettura dopo**. È la forma dell'incoerenza vista su
   `MAG-SCA-01-03-B` — colli per 101 e `qty_uom` 81.

**Il difetto peggiore non era in nessuno dei tre.** `savePendingOutbound` e
`updatePendingDoc` ricostruivano la riga di documento **campo per campo, in
due copie identiche**, e nessuna delle due nominava i campi nuovi: i colli
scelti a schermo venivano buttati al salvataggio, senza un errore, e
l'evasione li richiedeva da capo. `RigaDocumento` ha un indice libero e il
tipo non si è lamentato. È la trappola del «`meta` non è un sacco», in due
posti. Adesso la ricostruzione è **una sola** — `modules/documenti.ts` — e
chi aggiunge un campo lo aggiunge lì.

Nove commit, tutti con build e collaudo in mezzo. **Provata al banco**
(4199, copia della giacenza vera): quel che pretende il PIN — registrazione,
evasione, applicazione delle rettifiche — **l'ha provato Andrea**, e il DDT
funziona.

### La 1.8 è scritta per intero, e aspetta un PIN e un turno

Dal 17/08 sera il codice non è più quello della 1.7: **la suddivisione dei
colli si dichiara invece di calcolarsi**, e lo stesso articolo può stare in
colli da 25 e da 5 kg sulla stessa riga. Cinque blocchi committati — il modulo
puro, il servizio che arbitra, Store che scrive, le maschere, e ogni funzione
che toglie merce — con l'interruttore `feature.colli` **spento** e adesso
alzabile da Configurazione → Funzioni.

Quello che manca non è codice: è **provare le maschere con un operatore
identificato** e poi installare un turno e accendere il turno dopo. §2.

Il servizio **in esecuzione ha ancora il codice della 1.7 in memoria** — Node
legge all'avvio — e continua a rispondere `service_version: 1.7`. Il sorgente
dice `1.8.1`: al primo riavvio il numero cambia da solo, e con lui entrano le
rotte che conoscono `packs_out`. Sono compatibili all'indietro, e lo dicono 77
prove.

### I numeri

| Voce | Valore |
|---|---|
| In servizio — prova su questo PC | `corrente` contiene la **1.8.3**, impronta `85dcbee9…`, costruita il **18/08 alle 19:57** — chiesto al servizio a fine giornata, e **la riga di prima diceva `f7762989…` delle 15:28**: il documento era già indietro di un'installazione. **Non contiene niente della 1.8.4**: quella sta in `origin/main` e in `consegna\`, e si vede solo dopo un'installazione. Il servizio risponde `service_version 1.8.3` **e** `versione 1.8.3`: i due numeri coincidono |
| Via di ritorno | **Si reinstalla il pacchetto della versione di prima** — §4: è il solo gesto che riporta indietro anche il servizio. `precedente` contiene la **1.8.1** (`12c2e4cf…`) e serve agli assets di chi stava caricando durante uno scambio, non più a tornare indietro. Il deposito tiene `pathfinder-1.8.2\`, `pathfinder-1.7\` e `pathfinder-1.6.1\`; i pacchetti li archivia Andrea |
| Servizio | Node + Express + SQLite, porta **4173**, `modo: cartella`. Risponde `service_version` **`1.8.3`**, come il sorgente: l'installer porta anche il servizio e lo riavvia, e da qui in poi i due numeri non divergono. Gira come SYSTEM da un'attività pianificata, **dal sorgente** `MAPPER\server\` |
| Database | `C:\Pathfinder\data\pathfinder.db` — fuori da OneDrive. Revisione **23175**, 11.181 articoli, 188 righe di giacenza, 20 collezioni |
| Backup | serale automatico alle 20:00 in `C:\Pathfinder\backup\`, più a richiesta con `/api/backup` |
| Interruttori | **DUE accesi**: `feature.tasks` (13/08 10:31:06, `ANDS`) e `feature.uom` (13/08 13:54:36, `BABB`). Spenti: `colli` (nuovo, 1.8), `udc`, `putaway`, `wip`. **17/08: `uom` resta acceso** — si raccoglie cosa sbaglia, materiale per la 1.8 |
| Collaudi | **509 client** (16 suite, ~2 s) · **85 servizio** · **22 installazione** · **8 migrazione** — tutti verdi il 18/08 sera. Le ventiquattro nuove del client sono la 1.8.4: otto su `scelteDaUscite`, dieci su `rettifica`, sei sulla riga di documento. **Ognuna provata rompendo il codice** |
| Tipi | `npm run check` a 0 su client e servizio, con `strict` e `noUncheckedIndexedAccess` accesi su **tutto** il sorgente: `allowJs` è spento dal 18/08 |
| Sorgente | **64 TypeScript** · **zero JavaScript** · **10 CSS** · `index.html`. La migrazione si è chiusa il **18/08**: `tabs`, `feedback`, `dialog`, `main` e `app` (1.328 righe) sono passati a `.ts`, e `tsconfig` ha `allowJs: false` — un `.js` in `src/` adesso non compila. Il CSS in più è `00-tailwind.css`: il tema |
| Numero di build | **1.8.4** in `vite.config.js`, `package.json`, `VERSIONE_APP` e nel servizio. La 1.8.3 è in servizio: una build in avanzamento non porta il numero di ciò che sta girando, se no `consegna\` dice una cosa e la macchina un'altra — §5. Ultima costruita: impronta `fefa508e…`, **1.626.669 byte** |
| Git | `main`, **allineato con `origin/main`** — spinto il 18/08 |

### Cosa fa la 1.7, e cosa ha misurato il banco

Una versione è **una cartella** — indice, assets coi nomi a impronta, manifesto —
che vive in `C:\Pathfinder\app\`, fuori da OneDrive come il database. `xlsx` (864
KB su 1,61 MB, per una funzione che gira qualche volta al giorno) si carica **a
richiesta**. Il servizio, che non aveva mai compresso niente, passa i `.gz` che
la build scrive una volta sola.

Misurato nel browser il 17/08, contro una copia del database vero:

| | prima | 1.7 |
|---|---:|---:|
| Primo caricamento | 1.610 kB | **251 kB** |
| Ricarica | 1.610 kB | **300 byte** |
| `xlsx` | sempre, a ogni ricarica | 167 kB, solo a import o export |

### Da qui in poi si consegna un pacchetto

**Dal 17/08 una consegna è una cartella che si installa a doppio clic** —
`consegna\Pathfinder <versione>\`, prodotta dalla build, §4. Nessun comando da
ricordare, nessun percorso da digitare: l'installer capisce se la macchina ha
già Pathfinder o se è la prima volta, verifica l'impronta e apre l'applicativo.
**Installare e verificare sul campo li fa Andrea**; qui si costruisce, si
collauda al banco e si consegna il pacchetto.

---

## 2. Cosa manca — la coda di lavoro

### Da fare subito, e non è codice

| # | Cosa | Chi |
|---|---|---|
| ~~1~~ | ~~**Installare la 1.8.3 e vedere i due numeri coincidere.**~~ **Fatto il 18/08**: `/api/app-info` dice `1.8.3` due volte. L'installer nuovo — quello che porta anche il servizio e lo riavvia — ha funzionato. In `corrente` c'è la build con Tailwind acceso, impronta `3d765c51…` | fatto |
| **1-bis** | **Capire chi ha cancellato `C:\Pathfinder\app\pathfinder-1.6.1`** il 17/08 alle 19:14. La cartella è stata ricostruita dal file singolo in radice e la via di ritorno è di nuovo intera, ma la causa non si conosce: se non è stato un gesto di Andrea in un'altra finestra, qualcosa cancella dentro la directory di installazione | da chiarire |
| **2** | **Provare il pacchetto su una macchina pulita.** La strada dell'aggiornamento è provata davvero (17/08, su questo PC); quella della **prima installazione** — servizio, attività pianificate, firewall, database — è scritta e riletta ma **mai eseguita**, e serve una macchina senza Pathfinder o una virtuale. È l'unica che chiede i privilegi, ed è quella che si userà in presentazione | Andrea, prima di presentare |
| **3** | **Un secondo Team Leader.** `ANDS` è l'unico: il 13/08 il PIN si è smarrito e per ore nessuno poteva creare né rinnovare un operatore. Il PIN è rientrato, la causa no. Un minuto in Configurazione → Operatori — §6, «Il PIN smarrito» | Andrea |
| **4** | **Annullare a mano quattro attività** rimaste `in_progress` prima della 1.4.4, col motivo «chiusa dalla 1.4.4, lavoro già eseguito»: `TA-MSRAXA3Q-PQ11` (prelievo), `TA-MSRB4JXK-04C7` (quarantena), `TA-MSRB80C2-2JLC` (campionamento), `TA-MSRBEZLU-5M3E` (conta). **Non si riavviano**: rifare il gesto muoverebbe la merce due volte | Andrea, dalla vista Attività |
| 5 | **Caratterizzare le zone** in Configurazione → Zone: classe di conservazione, zona allergeni, zona pericolosi, refrigerata. Finché non è fatto **la mappa resta muta**, per quanti articoli si classifichino: la verifica confronta due metà e una manca | Andrea |
| 6 | **Compilare `pieces_per_pack`** in anagrafica (colonna `Pezzi_Per_Collo` dell'import Excel). **A `colli` acceso non è più il gate**: chi dichiara la suddivisione ha bisogno solo di un `unit` valido. Resta (a) il ponte per le righe vecchie senza elenco, (b) il valore proposto nella maschera. **Va compilato PRIMA di accendere `colli`**: un lotto congelato senza `uom_per_collo` non lo recupera più dall'anagrafica — la confezione del lotto vince sempre | import Excel |
| 7 | **Partita IVA e dati mittente** in Configurazione → DDT. La maschera c'è: è un dato da digitare | Andrea |
| 8 | **Nome DNS interno e certificato** dalla CA aziendale. Il codice è pronto: due variabili e HTTPS si accende | IT — non blocca |
| ~~9~~ | ~~**Confermare due scelte del 12/08**~~: **confermate il 18/08**. La colonna UM è `unit`, la quantità per collo è `pieces_per_pack` — è già così in `configurazione()` | fatto |

### Le versioni da costruire

Scadenza del progetto **31/12/2026**, ultima installazione utile **19/12** — poi
c'è l'inventario. La numerazione è **progressiva**: una build definitiva porta
**due numeri** (`1.8`), una di prova ne porta di più (`1.8.1`).

| Versione | Cosa |
|---|---|
| **1.8** | **UOM riscritta.** Gli item non hanno confezionamento costante: lo stesso articolo arriva in colli da 5 kg e la volta dopo da 25 kg. Al posizionamento l'operatore dichiara **la suddivisione dei colli** (10 × 1.000 + 1 × 900), **più colli incompleti sono ammessi**, il sistema calcola il totale e carica **colli e UM**. A prelievo, smaltimento e trasferimento sceglie **quali e quanti colli**. Il **prelievo parziale opera in colli e UM su tutte le funzioni**. L'unità è quella dell'articolo: kg dove è a kg, pezzi dove è a pezzi. **In costruzione — vedi sotto** |

#### La 1.8, blocco per blocco

Il dato è **`inventory.packs`**, un numero per collo dentro la riga di
giacenza. La riga resta **una** — l'indice `[location_code+item_key]` non si
tocca, e il perché è lo stesso della 1.4.2 — e dove `packs` c'è, **`qty` e
`qty_uom` diventano le sue due colonne materializzate**: le conta l'elenco,
non il client. Dove manca, tutto si legge come nella 1.7.

| | Cosa | Stato |
|---|---|---|
| 1 | **`modules/colli.ts`** — puro: dichiarazione, elenco, raggruppamento, prelievo per collo, il ponte `daSuddivisione` che legge una riga della 1.7. 39 prove | **fatto** |
| 2 | **Il servizio arbitra.** `removeItem` e `commitPickStop` accettano `packs_out` (quanto esce da ogni collo) e `packs_before` (il seme, una volta sola). Un collo della misura esatta esce intero, se non c'è si apre **il più piccolo che basta**. 12 prove nuove | **fatto** |
| 3 | **Store scrive.** `packs` su `Giacenza`, `colliDiRiga`, `descriviRiga`, `addItem` con la suddivisione dichiarata, `removeItem` con le scelte per collo. Interruttore **`feature.colli`**, che pretende `uom` acceso | **fatto** |
| 4 | **Le maschere**: il posizionamento dichiara la suddivisione (il campo ④ Colli pilota la prima riga e resta scrivibile), la riga di giacenza si descrive dall'elenco — **una sorgente sola**, `Store.descriviRiga` — e una **maschera sola**, `_scegliColli`, chiede quali colli e quanto prenderne | **fatto** |
| 5 | **Ogni funzione che toglie merce ci passa**: smaltimento, trasferimento, prelievo guidato, carrello di produzione, evasione DDT, quarantena e rilascio. Lo **spostamento** porta i colli scelti fino alla riga nuova. La **conta mirata** chiede quali colli mancano e **rifiuta la rettifica in aumento** su una riga a colli dichiarati — un collo trovato ha una misura che nessuno può indovinare, e si posiziona da Movimenta. L'**inventario di vano**, che corregge molte righe in fila, rimanda quelle a colli dichiarati alla Conta. Lo **storno** ritrova i colli per misura (`scelteDaMisure`) e si ferma se uno non c'è più | **fatto** |
| 6 | L'interruttore è **`pronta: true`**: si può accendere da Configurazione → Funzioni, e pretende `uom` acceso | **fatto** |
| 7 | **Il banco con un operatore in sessione.** Quel che si è provato è nella riga qui sotto; le maschere che pretendono l'identità — smaltimento, trasferimento, prelievo, quarantena — non sono state esercitate fino in fondo perché **il PIN lo digita Andrea** | da fare |
| 8 | **Installare e provare in magazzino**, un turno, e accendere l'interruttore **il turno dopo**: installare non è accendere | Andrea |

**Cosa ha già visto il banco** (17–18/08, copia del database vero, porta 4199,
`feature.colli` acceso): il posizionamento con «3 × 25 + 1 × 7» scrive
`packs [25,25,25,7]`; un secondo carico accoda e la riga diventa «3 × 25 +
1 × 10 + 1 × 7»; la maschera di scelta calcola cosa esce e cosa resta, e
rifiuta una quantità più grande del collo; il prelievo `{da: 25, quantita:
10}` apre il collo da 25 e **lascia intero quello da 10**; lo storno per
misura riporta la riga a `[15,25,25]`, e un collo che non c'è più viene
respinto con il motivo scritto. La riga con due colli da 5 si legge «2 × 25 +
2 × 5», dove la 1.7 diceva «2 × 25 + 1 × 10» e segnalava uno scarto che non
c'era.

**Cosa il banco non ha visto**: tutte le maschere che pretendono un operatore
identificato. Si provano in un minuto col PIN — smaltimento parziale,
trasferimento, prelievo guidato, quarantena — e sono l'ultimo passo prima di
installare.
| **1.9** | **Viste giacenza.** Selezionando un'ubicazione dalla mappa, il pannello a destra mostra la giacenza **in colli e in UM**. Più una pagina nuova: si cerca un articolo, si vedono tutti i lotti, se ne selezionano uno o più e si **apre la conta su tutti insieme**; PDF con intestazioni, piè di pagina e la lista dei lotti con ubicazione e quantità. Se costa meno, può diventare un ramo di Inventario |
| **1.10** | **Trasferimenti generati dall'ODP.** Sulla riga di avviso «articolo in un altro magazzino» — che già c'è — compare una spunta: genera un'**attività di trasferimento** nello schedulatore, il sistema **chiede in quale ubicazione** ricevere la merce, e **quell'ubicazione entra nel percorso come tappa di prelievo** |
| **1.11** | **UI mobile.** Il sistema riconosce se gira su Android e ridimensiona. Probabilmente serve **un'interfaccia apposita**, non un adattamento |
| 1.12 | **UDC** — contenitori che stanno in un'ubicazione e portano la merce con sé. `inventory.udc_id` esiste già, vuoto. Nasce su comando, **muore quando è vuota** (svuotamento automatico, creazione no), il record resta come storia e `udc_id` non si riusa mai. **L'etichetta si stampa alla creazione**, `100 × 80 mm` su A4 dal browser. Il prefisso GS1 è un **parametro di Configurazione**: vuoto → codice interno, compilato → SSCC. Lo spostamento passa da una rotta composta `moveUdc`, in **una** transazione |
| 1.13 | **Motore di stoccaggio** — dice dove mettere la merce. Funzione pura come `pickRoute`. Vincoli **duri** (sito imposto, segregazione allergeni, temperatura, capienza) e poi un **punteggio** sui morbidi. Le regole sono **un dato** in `storage_rules`, non codice: «`article_code` inizia per 700 → `MAG2`» è un record. Ogni proposta **dice perché**, e lo scavalco si registra col motivo |
| 1.14 | **WIP** — il prelievo per ODP finisce in un'ubicazione WIP invece di sparire; ciò che entra e non torna **è il consumo reale di produzione**. È l'unica funzione che cambia il significato di un movimento esistente: a `feature.wip` spento, `PICK` resta quello di sempre. Si installa il 19/12 **spento** e si accende a gennaio |

### Lavoro di fondo, non una versione

- **Il front end è passato a Tailwind il 18/08**, in trentuno commit e senza
  spostare un pixel. Non è «tutto a utility»: l'applicativo non ha componenti,
  il markup nasce da stringhe dentro venticinque viste, e la stessa fila di
  utility sarebbe finita ricopiata centinaia di volte. **I componenti e il
  telaio restano classi** — `btn`, `badge`, `input`, sidebar, modali: si
  scrivono una volta e non si ripetono. Quel che è stato tolto sono i
  **`style=`**: erano **2.187 dichiarazioni** dentro 1.092 attributi, sono
  rimasti **84 attributi**, di cui 53 portano un valore che nasce a tempo di
  esecuzione (`color:${themeColor}`, `width:${pct}%`), gli altri sono il
  disegno degli SVG dei marchi, tre misure in punti del rapporto di stampa e i
  `display:none` di `index.html`.

  **Le quattro cose da sapere prima di toccare un foglio di stile:**

  1. **`main.js` importa un CSS solo.** `00-tailwind.css` è il tema e importa
     gli altri nove con `@import ... layer(app)`. L'ordine fra i nove è la
     cascata di sempre.
  2. **L'ordine dei layer è il contratto**: `theme, base, components, app,
     utilities`. Il CSS dell'applicativo sta in `app`, **sotto** le utility:
     una utility scritta in un sorgente batte la classe. Prima della
     migrazione stava fuori dai layer, dove batteva tutto — e siccome una
     regola senza layer batte qualunque regola dentro un layer, `* { margin:
     0 }` spegneva ogni `mb-*` e ogni `p-*`: le utility nascevano morte, e
     nessun collaudo se ne accorgeva. È la trappola che ha trovato il pilota.
  3. **La spaziatura va a decimi di rem**, non a quarti come in Tailwind
     altrove: qui `mb-4` è **0,4rem**, non 1rem. La ragione è l'MC9400 — 4,3"
     da 800×480, in CSS fra i 400 e i 533 px, **sotto ogni media query che
     l'applicativo ha oggi**. La spaziatura di qui è tarata fitta apposta e
     sulla griglia da 0,25rem tre valori su quattro non ci stavano: sarebbero
     finiti scritti `mb-[0.6rem]`, più lunghi dello `style=` che sostituiscono.
     Così invece ci stanno tutti, e la densità dell'intera interfaccia ha una
     manopola sola — `--spacing` — che è quella che servirà alla 1.11.
  4. **Il tema non ha valori, ha rimandi.** Il colore si cambia in
     `01-tokens.css` come sempre. La tavolozza di serie è spenta: `bg-blue-500`
     non compila, sarebbe un colore che il sistema non ha. Raggi e ombre vanno
     **per numero** — `rounded-2`, `shadow-3` — perché `--radius-md`,
     `--shadow-sm` e `--shadow-lg` sono già token dell'applicativo e i nomi si
     sovrapporrebbero.

  **Quel che non si migra**: la stampa. Le tre `@media print` restano CSS come
  sono — DDT, verbali e cartellini sono documenti. (Convertire il markup di una
  vista che stampa è invece sicuro: quelle regole non hanno `!important`, e lo
  `style=` le batteva già.)

  **Cosa è costato e cosa ha reso**: il CSS cresce da 154,69 a 176,64 kB in
  chiaro ma **cala compresso**, 25,77 → 24,49, perché sta tutto dentro un
  layer; il JavaScript cala di **27 kB** in chiaro, che sono le stringhe
  accorciate. Il primo caricamento va da 257 a **255 kB**. In byte è quasi
  pari: quel che si è guadagnato è che la misura, il colore e la spaziatura
  hanno **una sorgente sola**, e che l'interfaccia adesso si può stringere.

- **L'estrazione delle viste è finita il 18/08.** `ui/app.js` è passato da
  **13.893 righe a 1.328** in ventitré blocchi, uno per commit, e le viste
  stanno in `src/ui/views/` — venticinque file `.ts`. Quel che resta in `app.js` ci
  resta apposta: avvio e riallineamento, identità e sessione, il telaio
  (`switchView`, barra laterale, modali, toast, scorciatoie), l'annulla e le
  utilità comuni. Come si lavora di qua adesso sta in §7.
- **La migrazione a TypeScript è finita il 18/08**, in trentadue commit, uno
  per file. Nel sorgente non c'è più JavaScript e i **446 `any`** delle viste
  sono a zero. Cosa è servito saperlo:

  1. **`App` è più grande del file che lo dichiara.** Metà dei suoi metodi
     arriva dalle viste, che rientrano con `Object.assign` in coda ad
     `app.ts`. Il ponte è `DalleViste`, un elenco di 23 metodi e 4 proprietà
     con la firma vera presa dal file dove stanno; `monolite()` è una funzione
     che a runtime non fa niente e serve solo a dare quel tipo a `this`
     dentro `app.ts`. Se una vista cambia una firma, il primo a dirlo è
     `app.ts`.
  2. **`$` non è più `any`**: dice `HTMLInputElement`, che è quel che sono i
     duecento campi che ci passano; la tendina ha `$sel`. Nove punti in quattro
     viste hanno smesso di compilare, e ognuno diceva qualcosa di vero.
  3. **Le viste sono `satisfies Vista`, non `: Vista`.** Con l'annotazione il
     tipo di ogni metodo veniva schiacciato su `Metodo` e chi importava una
     vista non vedeva più niente.
  4. **Il `this` delle viste resta `any`, e non per pigrizia.** Dargli il tipo
     vero è un ciclo che il compilatore non scioglie — TS7022 su tutte e
     venticinque, «referenced directly or indirectly in its own initializer»:
     il tipo di una vista dipenderebbe da `Monolite`, che dipende dal tipo di
     quella vista. La via d'uscita c'è ed è generare la superficie da
     `test/superficie-app.dati.js`, che quei trecento nomi già li elenca.

- **Quel che la migrazione ha fatto vedere, e che è stato dichiarato nei tipi
  invece che aggirato con un cast**: i dieci campi del DDT (`doc_date`,
  `order_ref`, `aspetto`, `porto`, `transport_by`, `start_transport`,
  `doc_notes`, `pieces_total`, `peso_netto`, `peso_lordo`) — erano dodici cast
  in `spedizioni.ts`; `qty` e `partial` sulla quarantena; `causale_id` sul
  documento; la **geometria della zona** (`levels`, `aisles`, `bays_per_aisle`,
  `mirror_frontal`, `rows`, `positions_per_row`, `positions`, `grid_cols`), che
  otto punti fra viste e `geometria.ts` leggevano passando da un cast; il
  mittente e l'operatore sul verbale di smaltimento; `diskFull` e la forma vera
  di `estimateUsage` sul contratto della persistenza; la tappa di prelievo
  (`TappaPrelievo`, `FuoriPercorso`), che adesso è una sola per le tre viste
  che la leggono.

- **Due difetti trovati dal compilatore e NON corretti**, perché correggere
  durante un trasloco è il modo di romperlo — sono la coda del ciclo di debug:
  - **La data delle copie locali è sempre vuota** (`app.ts`, tabella «Copie
    locali disponibili»): stampa `b.modified`, ma `listBackups` restituisce
    `lastModified`. La colonna mostra «—» su ogni riga, e nessuno se n'era
    accorto perché non è un errore, è un trattino. **La correzione è una
    parola.**
  - **Un articolo senza descrizione scrive «undefined»** nel campo descrizione
    di giacenza (`giacenze.ts`, `posiziona.ts`, `inventario.ts`): `.value` di
    un `undefined` diventa la stringa, e da lì finisce sulla riga.
### La sera del 18/08 — nove correzioni, tutte provate al banco

Il banco di questa sessione è `banco/prova-migrata.cjs`: serve la cartella
`consegna/Pathfinder 1.8.3/app` sulla **4199** con una copia della giacenza
vera. La copia si chiede al servizio — `POST /api/backup` accetta `dir`, quindi
la scrive **direttamente in `banco/db/`** e in `C:\Pathfinder\` non si scrive
niente. È la via giusta: una copia a caldo del file `.db` con SQLite in WAL può
uscire incoerente.

1. **`$` non era definito nei gestori inline** — 23 punti in 12 viste. Durante
   l'estrazione del 17/08 `document.getElementById(` dentro gli attributi
   `on…=` è diventato `$(`, che è un import di modulo: un attributo gira nello
   scope globale e lì quel nome non esiste. Moriva il gesto centrale —
   scansiona, Invio, campo dopo — su spedizioni, prelievo, posizionamento,
   quarantena, inventario. **`main.ts` mette `$` su `window`**, accanto a
   `window.App` che sta lì per la stessa ragione. Provato togliendolo a caldo:
   ricompare l'errore identico allo screenshot.
2. **Il contatore sulla tessera Quarantena era una fascia viola.** La regola
   `.mov-action-card .mov-badge` era stata cancellata il 17/08 con la divisione
   dei CSS (`73a43bf`) e nessuno l'aveva rimessa: il badge nasceva `static`,
   largo quanto la tessera. **Zero regole lo coprivano, non una sbagliata.**
3. **Le finestre alte non si potevano chiudere.** `.modal` aveva
   `max-height: 90vh` e `overflow-y: auto`; una regola più in basso, dello
   stesso file e stessa specificità, diceva `overflow: hidden` e vinceva. La
   scelta dei colli con 75 righe teneva i pulsanti a **2.413 px** sotto il
   bordo. Adesso `.modal` è una colonna: testata e piede fermi, **corpo che
   scorre** (`min-height: 0`, senza il quale un figlio flex non scrolla mai).
4. **`Escape` chiude anche la finestra dei colli**, che è costruita a mano e
   non passa da `Dialog`. In cattura, e l'ascoltatore si stacca alla chiusura.
5. **Colli tutti uguali: si chiede quanti, non quali.** Settantacinque caselle
   per ottenere un numero non sono una domanda. L'elenco resta dove le misure
   differiscono, che è dove quale collo prendi cambia il saldo.
6. **Un collo si può sempre aprire**, anche a misura unica: nella finestrella
   c'è il campo «una parte di un altro collo». Provato 3 interi + 7,5 KG → in
   destinazione `packs [20,20,20,7.5]`, `qty_uom 67,5`.
7. **L'inventario di vano rettifica anche le righe a colli dichiarati**: chiede
   quali mancano, con la stessa finestra delle altre maschere. Era l'unico
   punto in cui una maschera diceva «vai da un'altra parte». Resta fuori il
   caso dei colli **in più**: una misura trovata nessuno la può indovinare.
8. **Il numero di versione in pagina lo scrive la build.** Titolo, fascia e
   piede erano fermi a `1.7` per tutta la 1.8: adesso `index.html` porta un
   segnaposto e un plugin di `vite.config.js` ci mette `VERSIONE`.
9. **`VERSIONE_APP` in pari a 1.8.3**, e `vault.ts` la importa invece di
   riscriverla. `FORMATO` (`warehouse-mapper-v1.5`) **non si tocca**: quello
   decide se un pacchetto si rilegge, non con che cosa è stato scritto.

**Aperto, e deciso con Andrea:**

- ~~**I colli vanno chiesti nel carrello del DDT**~~ — **fatto il 18/08 sera**,
  ed era davvero la più invasiva: cambia cosa porta una riga di documento.
  Vedi §1, la 1.8.4.
- **Il trasferimento che diceva «servono location_code, item_key e una
  quantita' valida» non si è riprodotto** sulla copia della giacenza vera, in
  quattro combinazioni (totale e parziale, riga con e senza colli dichiarati).
  Quel messaggio nasce in `pathfinder-server.js:349` e vuole due assenze
  insieme: nessun `packs_out` **e** nessuna quantità valida.
- **Due incoerenze nei dati**, viste passando: su `MAG-SCA-01-03-B` la somma
  dei colli dichiarati fa 101 e `qty_uom` dice 81; su `MAG-ACC-07` i 75 colli
  non sono tutti uguali — ce n'è uno da 19,9, ed è il solo motivo per cui lì
  esce l'elenco lungo invece della domanda breve. **La prima ha un colpevole**:
  fino alla 1.8.4 il campionamento scalava `qty_uom` e lasciava `packs` intatto
  — vedi §1. Le righe già storte **non si riscrivono da sole**: `verificaColli`
  le mostra, e si raddrizzano con una conta.
- Restano i due difetti noti qui sotto: la data delle copie locali e la
  descrizione `undefined`.

- **Quel che l'estrazione ha fatto vedere**, e che nessuno ha corretto perché
  correggere durante un trasloco è il modo di romperlo:
  - `DocumentoUscita` non dichiara dieci campi che il DDT porta davvero —
    `doc_date`, `order_ref`, `aspetto`, `porto`, `transport_by`,
    `start_transport`, `doc_notes`, `pieces_total`, `peso_netto`, `peso_lordo`.
    In `spedizioni.ts` sono dodici cast.
  - `Quarantena` non dichiara `qty` e `partial`, che il record porta.
  - Il rollback del carrello di produzione passa `article_description` a
    `Store.addItem`, che la vuole `string` e la può ricevere `undefined`; e
    indicizza `backups[j]` e `results[j]` senza guardia.
  - `_groupProdOrders` confronta il tipo con `MOV.PICK` **e** con `'PICK'`, che
    sono la stessa stringa: una cintura in più, non un difetto.
- **`TODO F1-REVIEW` ×3**: cache svuotata prima della conferma del supporto
  (`store.ts` ×2), riallineamento ridondante dopo `resetAll()` (`app.js`).
- **`pathfinder-1.4.2.1.html`** in `ARCHIVIO/VERSIONI PRECEDENTI/` porta un nome
  che non è più vero: quella build è la 1.4.3 di oggi. Da annotare prima che
  qualcuno ci torni sopra.

---

## 3. Comandi

```bash
npm run dev      # sviluppo, ricarica a caldo — ATTENZIONE: parla col servizio VERO
npm run build    # produce "consegna/Pathfinder <ver>/" — il pacchetto da consegnare
npm run check    # tsc client + servizio, nessun file emesso
npm test         # vitest, 16 suite, 509 prove
```

```bash
node test/collaudo.js                    # 85 prove sul servizio, da server/
node test/collaudo-migrazione-1.4.js     # 8 prove sul cambio di schema, da server/
node test/collaudo-installazione.js      # 17 prove sugli script di installazione, da server/
```

`SINGLE_FILE=1 npm run build` riproduce il file unico di prima: è la via d'uscita
se il modello a cartella non convince.

**Il banco di prova**, che è l'unico posto dove si prova una versione prima di
installarla — copia a caldo del database, porta sua, cartelle sue. **Sta in
`MAPPER\banco\`**, come ogni cosa di lavoro, e `.gitignore` lo tiene fuori dal
repository perché contiene dati veri:

```powershell
$BANCO = "$PWD\banco"
Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup -ContentType 'application/json' -Body (@{dir="$BANCO\db"} | ConvertTo-Json)
.\server\installa-versione.ps1 -Da ".\consegna\Pathfinder 1.7\app" -Versione 1.7 -Casa "$BANCO\app"
$env:PATHFINDER_PORT='4199'; $env:PATHFINDER_DB="$BANCO\db\pathfinder-<data>.db"; $env:PATHFINDER_APP_DIR="$BANCO\app\corrente"; node server\pathfinder-server.js
```

**Per provare il front end** — quello che serve a un'estrazione o a una vista
nuova — al banco basta accendere Vite e dirgli con chi parlare, invece di
costruire e installare:

```powershell
$env:PATHFINDER_DEV_API='http://127.0.0.1:4199'; npm run dev     # 5173, ricarica a caldo, parla col banco
```

Senza quella variabile `npm run dev` parla col servizio **vero** sulla 4173: è
scritto in §5, ed è la ragione per cui la variabile si scrive nella stessa riga.

> **Il banco sulla 4199 va spento prima di `node test/collaudo.js`**: le 81
> prove del servizio si aprono una porta loro, ed è la 4199. Con il banco
> acceso muoiono su `EADDRINUSE` — un errore che parla di socket e non dice
> che basta chiudere una finestra.

> **Il banco non va mai in `C:\Pathfinder\`.** Ci è finito una volta, il 17/08,
> ed è esattamente la confusione che le due cartelle esistono per evitare: una
> copia del database e due cartelle-versione di prova dentro la directory di
> installazione somigliano all'installazione vera.

---

## 4. Come si consegna

**Costruire non è consegnare, e consegnare non è servire.** Tre luoghi separati,
e la separazione è la correzione di un difetto vero:

| Luogo | Chi ci **scrive** | Chi ci **legge** |
|---|---|---|
| `consegna/Pathfinder <ver>/` — il **pacchetto** | `npm run build`, che azzera `consegna/` a ogni giro | chi installa, a doppio clic — **mai il servizio** |
| `C:\Pathfinder\app\pathfinder-<versione>\` — il **deposito** | `installa-versione.ps1`, che **rifà la cartella a ogni installazione** di quel numero: un numero di versione lì dentro significa «gli ultimi byte installati con quel nome» | nessuno direttamente |
| `C:\Pathfinder\app\corrente\` e `precedente\` | i due script, che ci **materializzano** una versione del deposito | **il servizio** |
| `ARCHIVIO/` | l'archiviazione | nessuno |

**`corrente` è una copia, non un rimando.** Il deposito tiene le versioni
intatte; `corrente` e `precedente` sono due cartelle vere di cui l'installazione
sostituisce il contenuto, costruendolo accanto e rinominando — la finestra in cui
`corrente` è incompleta dura quanto un `rename`, e chi carica la pagina proprio
in quell'istante trova i suoi assets in `precedente`. **Quale versione sta dove
lo dice il manifesto**, non un registro accanto: un registro separato prima o poi
dice una cosa e le cartelle un'altra.

### Il pacchetto — quello che si consegna

`npm run build` produce **`consegna\Pathfinder <versione>\`**: una cartella che
si copia su una chiavetta e si installa **a doppio clic**, senza digitare niente.

```
Pathfinder 1.7\
  Installa Pathfinder.bat     ← doppio clic, INVIO, fine
  installa.ps1                il motore
  LEGGIMI.txt
  app\                        indice, assets, manifesto
  servizio\                   il servizio dati, i suoi script e il README
```

**UNA VERSIONE È L'APPLICATIVO PIÙ IL SERVIZIO, e si installano insieme** —
18/08/2026. Fino a quel giorno un aggiornamento toccava il solo applicativo: il
servizio restava quello del giorno dell'installazione, e `/api/app-info`
rispondeva due numeri diversi. Due numeri per una versione sola sono un numero
che non vuol dire niente, e l'installazione non aveva modo di accorgersene.

L'installer **capisce da solo** cosa ha davanti.

- **Prima installazione**: chiede **dove** — INVIO accetta `C:\Pathfinder` — e da
  quella cartella discendono `servizio\`, `app\`, `data\` e `backup\`. Poi fa
  tutto: copia il servizio, registra l'avvio all'accensione e il backup serale,
  apre la porta sul firewall, crea il database, installa l'applicativo.
- **Aggiornamento**: **non** chiede dove, lo rilegge da `PATHFINDER_APP_DIR`, e
  una radice diversa la **rifiuta** — spostare un'installazione non è
  installare. Ferma il servizio, copia applicativo **e** servizio, lo riaccende.

**L'autorizzazione di Windows serve adesso a ogni installazione**, non più solo
alla prima: fermare un'attività pianificata che gira come SYSTEM la vuole. E
l'applicativo **resta giù i secondi del riavvio** — pochi, ma non zero. È la
promessa della 1.7 che cade, ed è il prezzo di avere un numero solo.

Alla fine verifica **due** cose, non più una: l'impronta dell'applicativo e che
`service_version` sia quel numero. Se il servizio dice ancora il numero di
prima, il riavvio non ha avuto effetto e l'installazione è fallita — Node legge
all'avvio.

**Per vedere cosa farebbe senza toccare niente**: `.\installa.ps1 -NonChiedere
-Prova`. Dice radice, strada e riavvio, ed esce. Si può lanciare su una macchina
in servizio, ed è quello che esercitano cinque delle ventidue prove di
installazione.

> **Il servizio non gira mai dal pacchetto**: viene copiato in
> `C:\Pathfinder\servizio` e registrato da lì. Registrarlo dove si trova
> significherebbe un magazzino fermo il giorno che si sfila la chiavetta — è la
> stessa trappola di `outDir`, con le ruote.

> **Prima disinstalla, poi installa — sempre, che la versione sia diversa o la
> stessa.** Se quel numero è già nel deposito, la sua cartella viene tolta e
> riscritta con i byte del pacchetto. È la correzione del 18/08: fino ad allora
> l'installer passava `-Riusa` e una versione già in deposito veniva rimessa in
> servizio **com'era**, così chi rifaceva la build senza cambiare numero
> installava e restava ai byte di ieri — successo due volte con la 1.8.1 nella
> stessa notte. Da adesso un numero nel deposito significa «gli ultimi byte
> installati con quel nome», e l'impronta che l'installer verifica alla fine è
> di nuovo una prova.

> **Reinstallare la stessa versione non tocca `precedente`.** È il gesto più
> innocuo che esista — rilanciare l'installer due volte in presentazione — e
> senza quella riga cancellerebbe la via di ritorno in silenzio. Vale anche
> adesso che il deposito si riscrive: si muove solo quando cambia **il numero**
> in servizio.

> **Gli script di gestione delle versioni si rinfrescano dal pacchetto** a ogni
> aggiornamento — `installa-versione.ps1` e `torna-indietro.ps1` finiscono in
> `C:\Pathfinder\servizio` anche quando il servizio non si tocca. Nessuno li sta
> eseguendo, al contrario di `pathfinder-server.js` che vorrebbe un riavvio, e
> senza quella copia una macchina resterebbe per sempre alla logica di
> installazione del giorno in cui è nata.

### Installare a mano, quando serve

```powershell
npm run build
.\server\installa-versione.ps1 -Da ".\consegna\Pathfinder <numero>\app" -Versione <numero>
```

Lo script copia **solo** indice, assets e manifesto nel deposito — dopo aver
tolto quello che c'era sotto quel numero, così non restano assets orfani —,
materializza in `precedente` la versione che era in `corrente` e in `corrente`
quella nuova. Una consegna senza `index.html` viene respinta prima di toccare
qualunque cosa.

**Niente amministratore e niente riavvio**: il servizio rilegge la cartella a
ogni richiesta. Si verifica subito:

```powershell
Invoke-RestMethod http://127.0.0.1:4173/api/app-info
```

Deve rispondere la versione attesa **e la sua impronta**, e **nessun campo
`errore`**: due installazioni con la stessa impronta sono lo stesso applicativo,
byte per byte. È il numero che ha sostituito il conteggio dei byte. Se invece
compaiono `errore` e `utente`, quella riga dice di cosa è morto il servizio e con
quale conto stava girando — §5.

### Tornare indietro — si reinstalla il pacchetto di prima

**Dal 18/08 la via di ritorno è una sola: si reinstalla il pacchetto della
versione che si vuole.** È il solo gesto che riporta indietro anche il servizio,
e i pacchetti stanno in `consegna\` — l'archivio delle versioni lo tiene Andrea.

`torna-indietro.ps1` c'è ancora e funziona, ma **riporta indietro solo metà
versione**: scambia due cartelle di applicativo e lascia il servizio dov'è. Chi
lo lancia si ritrova il servizio nuovo che serve l'applicativo vecchio —
funziona, le rotte sono compatibili all'indietro e lo dicono 77 prove, ma i due
numeri di `/api/app-info` non coincidono più, e quello è il segno che di solito
vuol dire «installazione non riuscita». Lo script lo scrive a chi lo esegue.

**Il database non si tocca mai**: la 1.2 rilegge il database della 1.4, e lo
dimostrano le 8 prove di `collaudo-migrazione-1.4.js`.

> **Prima di tornare indietro c'è un gesto più piccolo: spegnere l'interruttore
> della funzione che dà fastidio.** Un rilascio si disinstalla, una funzione si
> spegne — e le due cose si confondono solo se si accendono nello stesso turno
> in cui si installa. Per questo si installa un turno e si accende quello dopo.


### Dove stanno le versioni

| Versione | Dove | Identità |
|---|---|---|
| **1.7** | `C:\Pathfinder\app\pathfinder-1.7\` · e il pacchetto in `consegna\Pathfinder 1.7\`, da cui **non si serve** | impronta `5df67f5c…`, 4 file |
| **1.6.1** | `C:\Pathfinder\app\pathfinder-1.6.1\` · e `pathfinder-1.6.1.html` in radice | impronta `3e98f1c8…`, 1.614.368 byte |
| 1.6 | `pathfinder-1.6.html` in radice | 1.625.239 byte |
| 1.4.4 · 1.4.3 | `ARCHIVIO/BUILD/` | 1.587.378 · 1.578.603 |
| 1.4.2.1 · 1.4.2 · 1.4.0 · 1.2 · 1.1 | `ARCHIVIO/VERSIONI PRECEDENTI/` | — |
| 1.4.3.1 | **nessuna copia esiste più** — cancellata per errore mentre era in servizio | — |

Una vecchia consegna a **file singolo** si rimette in servizio con lo stesso
script: la avvolge in una cartella col solo `index.html` e le genera il
manifesto. Il servizio ha **un modo solo**, e non esiste un ramo di codice
percorso una volta l'anno.

---

## 5. Le trappole già pagate

Ognuna è costata almeno una volta. Non sono opinioni.

### Consegna e ambiente

- **IL SERVIZIO, CHE GIRA COME SYSTEM, NON ATTRAVERSA UNA GIUNZIONE.**
  `stat` su `C:\Pathfinder\app\corrente` muore con **`UNKNOWN: unknown error`**,
  la pagina va in **500** e `/api/app-info` risponde nulle. Non sono i permessi
  (SYSTEM ha pieno controllo, nessuna negazione), non è il tag di reparse
  (`0xa0000003`, un punto di montaggio normale), e la cartella sotto va
  benissimo: SYSTEM ci **scrive** dentro. Lo stesso percorso, con lo stesso
  codice, si apre senza un intoppo da una sessione utente. Per questo dal 17/08
  `corrente` e `precedente` sono **cartelle vere di cui si sostituisce il
  contenuto** — vedi §4.
- **UN BANCO CHE GIRA CON UN ALTRO CONTO NON PROVA UN RILASCIO.** È la lezione
  vera del 17/08, e costa tre ore di applicativo giù: al banco lo scambio di
  versione era stato provato quattro volte, andata e ritorno, tutto verde —
  ma il banco lo avvia una persona, e gira nella sua sessione. Il difetto
  esisteva **solo** per il conto con cui gira il servizio. Ciò che un banco non
  riproduce va scritto accanto ai suoi risultati.
- **Un servizio che non sa dire di cosa muore costa ore.** Per tre ore
  `/api/app-info` ha risposto `versione: null` senza aggiungere altro: la
  console di un processo SYSTEM non la legge nessuno, e l'attività pianificata
  non redirige niente su file. Adesso quella rotta, **solo quando qualcosa non
  va**, porta `errore` col codice vero e `utente` con il conto del processo. È
  stato il primo dato utile della serata: chi tocca il servizio non tolga quei
  due campi.
- **Dentro OneDrive OGNI cartella porta l'attributo `ReparsePoint`** — è così
  che funziona «file su richiesta». Un controllo che cerca le giunzioni
  guardando il solo attributo scambia per giunzione qualunque cartella di
  `MAPPER` e si rifiuta di rimuoverla. **Una giunzione vera ha un bersaglio**
  (`Target`), un segnaposto di OneDrive no.
- **Prima di cancellare o spostare un file dalla radice, chiedere al servizio
  quale sta servendo** — `/api/app-info`. Il 13/08 `pathfinder-1.4.3.1.html` è
  stato rimosso credendolo non servito: lo era, installato mezz'ora prima, e la
  pagina è andata in 404. Nessun dato perso; persa **l'unica copia** di quella
  versione, e con lei la sua via di ritorno.
- **UN INSTALLER APERTO BLOCCA `npm run build`.** La build azzera `consegna/`
  per intero, e finché `Installa Pathfinder.bat` è in esecuzione — anche solo
  fermo sull'INVIO finale — Windows tiene la cartella e vite muore con
  `EPERM, Permission denied`. La cartella resta lì **vuota**, e né
  `Remove-Item`, né `Directory::Delete`, né `cmd /c rmdir` la tolgono: non è
  una giunzione e non è OneDrive, è un processo vivo. Si chiude la finestra
  dell'installer e la build riparte. `Get-CimInstance Win32_Process | Where
  CommandLine -like '*consegna*'` dice in due secondi chi la tiene.
- **IL NUMERO DELLA BUILD NON È IL NUMERO DEL CODICE.** Finché
  `vite.config.js` e `package.json` dicono `1.7`, ogni `npm run build` fatta
  mentre si costruisce la versione dopo produce una `consegna\Pathfinder 1.7\`
  **con byte diversi da quella in servizio** — stesso nome, altra impronta.
  Successo il 17/08 con i primi blocchi della 1.8: il pacchetto originale
  della 1.7 in `consegna\` non esiste più, e per fortuna quello che conta è il
  deposito. **Il numero si alza appena il codice si muove**: `1.8.1` è una
  build di prova, `1.8` sarà la definitiva.
- **La produzione non legge mai da `outDir`.** Il 14/08 la variabile puntava
  dentro la cartella che `npm run build` azzera: ogni build sarebbe finita
  davanti agli operatori. E dentro `outDir` c'era anche **il servizio** con il
  suo `node_modules`: una build avrebbe cancellato il codice in esecuzione. Per
  questo la cartella si chiama `consegna/`, senza numero. La vecchia
  `Pathfinder 1.6/` è stata **archiviata il 17/08** in
  `ARCHIVIO/17082026_Pathfinder 1.6/` — 728 file, e dentro c'è ancora quella
  copia del servizio ferma alla **1.1**: se un giorno qualcuno la ripesca, sappia
  che non conosce `PATHFINDER_APP_DIR` e servirebbe un applicativo che non c'è più.
- **Chi lancia `installa-servizio.ps1` lo lancia dal sorgente**, mai da una
  cartella di consegna: lo script registra l'attività sul percorso da cui è
  stato lanciato, e da quel momento la produzione gira da lì.
- **Mai `Remove-Item -Recurse` su una giunzione**: in PowerShell 5.1 può seguire
  il collegamento e svuotare **la cartella di destinazione**. Si usa
  `[System.IO.Directory]::Delete($p, $false)` o `cmd /c rmdir`. La funzione
  giusta — che distingue una giunzione da una cartella, e da un segnaposto di
  OneDrive — sta in `installa-versione.ps1`: chi ne scrive un'altra la copi da
  lì. Serve ancora: le giunzioni non si creano più, ma sul disco ne restano.
- **`index.html` resta `no-cache`, gli assets `immutable`.** Invertirli è il
  difetto peggiore possibile: i terminali resterebbero su una versione vecchia
  senza modo di uscirne, e nemmeno un riavvio li tirerebbe fuori. L'indice
  **nomina** gli assets; gli assets portano l'impronta nel nome.
- **Mai `express.static` sulla cartella-versione intera.** Escono solo
  `index.html` e `assets/`, e la rotta accetta **un nome, non un percorso**: il
  giorno in cui la variabile punta a un albero di sorgenti, quella riga li
  pubblicherebbe tutti sulla LAN.
- **Una cartella di `consegna\` tenuta aperta da un processo ferma la build.**
  `emptyOutDir` di Vite azzera `consegna\` all'inizio di ogni build, e se
  qualcuno tiene aperta la cartella-versione muore con **`EPERM, Permission
  denied`** prima di compilare una riga. Il segno che lo distingue da tutto il
  resto: **i file dentro si cancellano, la cartella no** — e nemmeno si
  rinomina. È un handle sulla directory, tipicamente una finestra di Esplora
  risorse aperta lì dentro o una shell che ci sta dentro col prompt.
  Si chiude quella finestra e la build riparte; il pacchetto che c'è resta
  valido nel frattempo.
  **Non è l'attributo `ReparsePoint`**: OneDrive lo mette su *ogni* voce
  sincronizzata, cartelle e file, e non dice niente su chi tiene cosa. Il
  18/08 l'ho scritto qui come se fosse la causa, e non lo era.
- **`powershell -File script.ps1 -ParametroCheNonEsiste` NON dà errore: lo
  scarta in silenzio e manda avanti lo script.** Chi credeva di simulare ha
  installato — successo il 18/08/2026 su questa macchina, chiedendo `-Prova` a
  una copia dell'installer che quel parametro non ce l'aveva ancora. Quello che
  PowerShell scarta finisce in **`$args`**, ed è l'unico posto da cui si può
  vedere: `installa-pathfinder.ps1` si ferma se ci trova qualcosa, e una prova
  lo verifica. Un `.ps1` che fa qualcosa di irreversibile guardi `$args` prima
  di muoversi.
- **Uno script `.ps1` con caratteri non ASCII vuole il BOM**: senza, PowerShell
  5.1 lo legge come ANSI e `—` diventa `â€”`, dove `”` chiude una stringa e lo
  script muore con un errore di parentesi che non c'entra niente.
- **Un manifesto si legge togliendo il BOM**: `Out-File -Encoding utf8` in
  PowerShell 5.1 lo scrive e `JSON.parse` ci lancia sopra. Costava versione e
  impronta **nulle** dopo un ritorno indietro, con tutti i collaudi verdi.
- **PowerShell distrugge gli accenti**: `Get-Content -Raw` in PowerShell 5.1
  decodifica in CP1252 quando il file non ha il BOM, e riscrivendolo in UTF-8 si
  ottiene la doppia codifica — `è` diventa `Ã¨` su tutto il file. **Successo di
  nuovo il 17/08 su questo stesso documento**, riga per riga, mentre la trappola
  era scritta qui sotto. Per riscrivere in blocco si passa da Node, UTF-8 senza
  BOM, LF; e per rimediare si rileggono i byte come UTF-8 e si riscrivono come
  CP1252, che è l'operazione inversa esatta.
- **`app.js`, `package.json` e i `.ts` di `core/` sono CRLF, e uno script che li
  rilegge in Python li converte senza dirlo**: `io.open(p).read()` traduce i
  fine riga di Windows in quelli di Unix (universal newlines), e riscrivendo il
  file la differenza diventa 13.900 righe per un import aggiunto — una
  revisione illeggibile e un commit che non si può guardare. Si legge e si
  scrive **sempre** con `newline=''`. `.gitattributes` dice `* -text`: i byte
  vanno e tornano com'erano, e nessuno li raddrizza per conto nostro. **I file
  nuovi nascono LF**, come `modules/colli.ts` e le viste.
- **Il servizio gira come SYSTEM**: non si ferma da una shell normale, e
  `Get-ScheduledTask` omette le sue attività **in silenzio**. Modificarne i file
  non basta: Node legge all'avvio.
- **Percorsi Windows oltre 260 caratteri**: `npm install` è il primo a romperlo.
  Il servizio si installa in `C:\Pathfinder\servizio`; `C:\Pathfinder\app\` è
  un'altra cosa, ed è la casa delle versioni.
- **Una collezione nuova non esiste finché il servizio non riparte**:
  `server/lib/schema.js` si legge all'avvio. È successo con `recipients`.
- **`better-sqlite3`** va tenuto a una versione con binario già compilato per il
  Node installato.

### Prove e collaudi

- **Non collaudare sul database di lavoro — e `npm run dev` NON è al riparo.**
  La pagina servita da Vite parla col servizio vero sulla 4173, perché l'adapter
  remoto non guarda da quale porta arrivi. La prova si fa su una **copia**, su
  una **porta sua**, con `PATHFINDER_DB` spostato.
- **Non installare senza aver aperto la versione in un browser**, contro una
  copia del database vero. `tsc` dice se il codice è coerente, i collaudi dicono
  se le parti fanno quello che promettono, **e nessuno dei due dice se
  l'applicativo funziona**: i difetti peggiori di ogni versione li ha trovati il
  banco, con tutto verde.
- **Un controllo che passa subito potrebbe non controllare niente.** Un collaudo
  si prova **rompendo il codice** e vedendolo fallire. E i valori di prova si
  scelgono dove il difetto vive: «5,5 − 0,1 − 0,2» passa anche senza
  arrotondamento, `0,3 − 0,1` no.
- **I collaudi si scrivono prima** del codice, non dopo.

### Codice

- **UNA QUANTITÀ NON DICE DA QUALE COLLO ESCE.** La 1.8 mandava al servizio
  solo «10 kg»: su una riga che ha anche un collo da 10, il collo aperto da 25
  restava intero e spariva quello da 10. Saldo giusto, **colli sbagliati**, e a
  video una riga che in corsia non esiste. Ogni uscita porta la **misura del
  collo** (`{da, quantita}`), e una misura che non c'è più è un 409 — non un
  ripiego su un altro collo. Trovato al banco il 17/08 **con tutte le prove
  verdi**: nessuna di loro chiedeva da dove uscisse la merce.
- **Un campo che diventa muto è peggio di un campo bloccato.** Il campo ④
  Colli, reso specchio della dichiarazione, ignorava in silenzio ciò che
  l'operatore digitava — e chi scansiona arriva lì col dito. Adesso scrive
  sulla prima riga della dichiarazione, e la dichiarazione lo rispecchia.
- **Gli import di un modulo TypeScript si scrivono senza estensione** —
  `../core/store`, non `../core/store.js`. Due specificatori diversi sono due
  moduli, e in pagina c'erano **due Store**: la dashboard leggeva quello che
  nessuno scriveva.
- **Uno spostamento è un `removeItem` seguito da un `addItem`, e il secondo
  inventa le UM**: le deriva da colli **pieni**, e spostare 11 colli da 10.100
  pz ne riscriveva 11.000. Novecento pezzi dal nulla, senza errore, su un gesto
  che si fa dieci volte al giorno. Si passa da `App._umMossa`.
- **Un `PATCH` su una chiave che non esiste CREA il record** invece di dare
  errore. E la chiave non è quella che si ha in mente: `operators` è a `op_id`,
  `tasks` a `task_id` — `types/collezioni.ts` è la sorgente unica. **Non fidarsi
  di un `op_id` scritto in un documento: si rilegge la collezione.**
- **Due elementi con lo stesso `id` non danno errore**: `getElementById`
  restituisce il primo. `showModal` appende sempre `id="modalOverlay"`, quindi
  una finestra aperta sopra un'altra **chiude quella sotto**. Chi apre una
  finestra sopra un'altra le dia un id proprio e una chiusura propria, come
  `_pickLoc` e `_showReleaseDestDialog`.
- **Un campo nascosto è comunque un campo scritto**: nascondere è una cosa a
  video, il payload è storia. Un campo che non serve a un tipo **si nasconde e
  si svuota**.
- **Articolo e lotto non si maiuscolano: sono una chiave.** `item_key` è
  `ARTICOLO#LOTTO`, e un lotto `qwert` diventato `QWERT` puntava a una riga che
  non esiste — la maschera si apriva vuota, senza errore.
- **Un campo che la maschera mostra non è un campo che si salva**:
  `ARTICLE_ATTR_FIELDS` è una **lista bianca**, e ciò che non è nominato lì
  viene scartato senza errore. Le certificazioni ci sono rimaste fuori per
  quattro versioni.
- **`meta` non è un sacco**: `_loadCache` la ricostruisce campo per campo. Chi
  aggiunge una chiave la aggiunga anche lì, o avrà scritto un dato che il
  database ha e la pagina no.
- **E NEMMENO LA RIGA DI UN DOCUMENTO.** Stessa trappola, e per due giorni in
  due copie: `savePendingOutbound` e `updatePendingDoc` ricostruivano la riga
  ognuna per conto suo. I colli scelti nel carrello si vedevano a schermo e
  non arrivavano al DDT — **nessun errore**, perché `RigaDocumento` ha un
  indice libero e il tipo tace. Adesso la ricostruzione è **una**,
  `modules/documenti.ts`, con una prova che chiede conto dei campi nuovi.
  La regola generale: **dove un record si ricostruisce campo per campo, quel
  posto dev'essere uno solo.**
- **`MOV.MOVE` scrive `qty_delta: 0` su uno spostamento totale**, e non è un
  difetto: cambia l'ubicazione, non la quantità. Chi legge il registro per sapere
  quanti colli si sono mossi trova zero — è la ragione per cui l'avanzamento di
  un'attività non passa da lì.
- **`CREATE TABLE IF NOT EXISTS` non aggiunge una colonna** a una tabella che
  esiste, e il `CREATE INDEX` dopo muore nel costruttore: il servizio non parte
  affatto. Fra `createTableSQL` e `createIndexSQL` sta `PathfinderDB._migra`:
  **sono due funzioni per questo, non rimetterle insieme.**
- **`Articolo.unit` è già la UM e `pieces_per_pack` è già la quantità per
  collo.** Prima di aggiungere un campo a un'anagrafica di trent'anni, guardare
  come si chiamano le etichette che ci sono.
- **`addArticle` esce con `false` su un codice noto** — era il motivo per cui
  l'import diceva «importati 0». C'è `upsertArticles`.
- **`Dialog.confirm` non accetta HTML**: vuole `message` (testo) e `details`
  (nodo DOM). Le classi `table`/`table-sm` non esistono: è `sx-table` dentro un
  `div` con `overflow-x:auto`. In pagina è esposto **solo `window.App`**.
- **Non togliere `window.App = App`** in coda a `main.js`: 366 punti chiamano
  `App` per nome e smetterebbero di funzionare **in silenzio**.
- **Una regola di chiusura sola non basta a sette tipi diversi.** Il residuo a
  zero descrive due tipi su sette; gli altri cinque restavano aperti per sempre.
  La domanda che nessun collaudo aveva fatto: *«questo tipo può mai arrivare a
  zero?»*

---

## 6. Le regole che non si discutono

### Architettura

- **Niente lavoro offline.** Se il servizio non risponde l'applicativo si ferma
  e lo dice a schermo intero. Niente code da risincronizzare.
- **Un solo database condiviso**, più terminali, e l'arbitro è il server: la
  concorrenza si risolve con **una transazione SQLite dentro `/api/op/…`**, non
  con la disciplina di chi scrive.
- **Documento JSON con colonne materializzate**: si indicizza solo ciò che serve,
  il resto vive in `data`. È il motivo per cui un campo nuovo non è una
  migrazione.
- **Servizio on-prem, attività pianificata**, non servizio Windows nativo (NSSM
  è il file che l'antivirus blocca alle sette di mattina). Niente Azure, niente
  Redis, niente Entra ID: si resta al PIN. Sage X3 fino al 2038.
- **`checkJs` spento sul client, acceso sul servizio.** Dove tipo e codice
  litigano, **cede il tipo**.
- **Il CSS non si minifica**: toglieva 413 caratteri su 146.368 e riscriveva le
  regole.

### Dati

- **Ogni campo nuovo è facoltativo, e assente significa «come nella 1.2».** Ogni
  collezione nuova, vuota, significa lo stesso. **Nessun campo cambia mai
  significato, nessun dato viene riscritto all'installazione.**
- **Nessuna cancellazione automatica di record.** La purga è manuale, con export
  preventivo.
- **`_format` del pacchetto di export non segue la versione dell'applicativo**:
  descrive la forma del file. A muoversi è `_appVersion`.
- **I documenti si rileggono, non si ricostruiscono**: le ristampe partono dallo
  snapshot archiviato.

### Merceologia

- **Allergeni: i 14 dell'Allegato II del Reg. UE 1169/2011.** Sono una norma:
  **non si tolgono e non si riscrivono.** Le voci aziendali — glutine, lattosio
  — si aggiungono **accanto**, dalla scheda dei parametri articolo, e un codice
  aggiunto che ripete un fisso sparisce invece di sostituirlo.
- **Temperature:** `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C.
  **Certificazioni:** elenco **aperto** — è una richiesta commerciale, non una
  norma.
- **La lettura di tutti e tre è stretta, mai tollerante**: i valori arrivano
  convalidati da Excel, e indovinare cosa intendeva chi ha scritto è il modo di
  mettere un articolo col latte in una zona senza latte.
- **Il silenzio ha due significati.** Un articolo senza attributi non è conforme
  né difforme: è **ignoto**, si conta a parte e non produce avvisi. Zero
  segnalazioni perché va tutto bene e zero perché non c'è niente da verificare
  sono due cose diverse.
- **Gli attributi si vedono dove la merce si tocca**: prelievo guidato, report
  ODP, DDT — da **una sorgente sola** per le tre viste. L'allergene è l'unico in
  rosso: è il solo che può fare male a qualcuno.
- **La cella Riservata ammette allergeni** — deroga esplicita, contata ed
  elencabile. **Sulla temperatura non deroga**: una scelta organizzativa non
  raffredda una cella.

### Attività (schedulatore)

- **Lo schedulatore LANCIA il lavoro, non lo affianca.** L'avvio apre Movimenta
  precompilata, e un compito si chiude **solo perché un movimento è stato
  confermato**. «Completa» a mano non esiste per nessun tipo.
- **Un compito si chiude in due modi, e il tipo dice quale.** *A residuo* —
  Trasferimento, Smaltimento — quando i colli chiesti sono stati mossi. *A
  gesto* — i due prelievi, Quarantena, Campionamento, Conta — quando
  l'operazione è confermata. Chi aggiunge un tipo deve dire in quale famiglia
  sta: c'è una prova che glielo chiede.
- **I parziali lasciano il residuo**: 12 chiesti, 5 mossi, restano 7. Il
  richiesto sta nel payload e non cambia mai. **Il residuo lo scala la maschera,
  non il registro**, e ogni maschera dichiara quali tipi può servire.
- **Il prelievo si chiude alla registrazione del DDT**, non all'evasione: il
  lavoro dell'operatore finisce col documento, il ritiro del vettore è giorni
  dopo e non è un'attività dello schedulatore.
- **La priorità la alza solo il Team Leader**, e alla creazione un operatore non
  supera Normale. **L'urgenza della scadenza si calcola a video, non si scrive**:
  sotto la soglia (4 h di serie, parametro di Configurazione) la coda tratta il
  compito come urgente.
- **Da uno stato chiuso non esce nessuna transizione**: se si è sbagliato se ne
  apre un altro. **Un annullamento pretende il motivo.** Un avvio che non ha
  prodotto niente torna in carico e `started_at` si azzera — è l'unico istante
  già scritto che si cancella.
- **Il campionamento non muove i colli: muove ciò che c'è dentro** (causale
  `SAMPLE`), e **un campione vale un collo di residuo**. **La Conta è un
  inventario mirato a una riga**, e il numero di sistema **non si mostra prima di
  aver contato**: un inventario che suggerisce la risposta non verifica niente.
- **Il Posizionamento non è un compito** — avviene in coda all'accettazione, che
  su Pathfinder non passa. La funzione «Posiziona» resta.

### Unità di misura

- **Il collo incompleto non è una riga di giacenza sua.** `inventory` ha l'indice
  `[location_code+item_key]` e tutto Store è scritto sopra l'idea che quella
  coppia identifichi **una** riga: due righe sono la strada più corta per un
  saldo sbagliato ma plausibile. Una riga — `qty: 11`, `qty_uom: 10100` — e il
  resto si calcola.
- **La confezione del lotto vince sull'anagrafica, sempre**: si congela al primo
  posizionamento, ed è un fatto già successo. **`qty_uom` è la quantità nell'UM
  dell'articolo**, non «pezzi».
- **Le quantità dichiarate si convalidano, quelle derivate si troncano.**
  Bloccare un prelievo fisico perché un dato è vecchio è peggio del dato vecchio;
  lo scarto lo **mostra** `verificaUom`, che non corregge niente.
- **Le UM escono dentro la stessa transazione dei colli**, e il saldo di partenza
  si legge dalla riga, non da ciò che manda il client.
- **Un campione lascia sempre un residuo.** Svuotare un collo non è
  campionare, è prelevarlo: la rotta si rifiuta, con il motivo. È ciò che
  rende vera la promessa per cui `sampleItem` esiste separata da
  `removeItem` — i colli non calano, mai.
- **Chi conta non toglie e non aggiunge: dichiara com'è fatto lo scaffale**, e
  la differenza la traduce `rettifica`. Un collo più leggero è un'uscita
  PARZIALE dallo stesso collo, non uno che se ne va e un altro che arriva: il
  24 si accoppia col 25 sceso di uno, non col 30 sceso di sei.
- **Un elenco messo da parte si ritrova per MISURA, mai per indice.** Fra la
  riga scritta a documento e il vettore che arriva passano giorni, e un altro
  terminale può aver mosso la riga. È la stessa ragione per cui il servizio
  riceve `{da, quantita}` e non un numero.

### Metodo e interfaccia

- **Un blocco per commit**, con build e collaudo in mezzo. **Chi sposta non
  corregge.**
- **Ogni funzione entra dietro un interruttore `feature.*` in `meta`, spento alla
  consegna, una chiave per una.** **Non se ne accendono due nello stesso turno**:
  se qualcosa non torna, non si sa quale dei due è stato. **Installare non è
  accendere.**
- **Italiano ovunque**, commenti compresi. Nessun `font-size` fuori dai token
  MD3. Il marchio Naturacare non si adatta al tema: verde `#94BC47`, blu
  `#21305A`. I documenti di stampa restano in `pt` e `mm`: la carta non ha un rem.
- **Niente dipendenze nuove** senza motivo forte, e **`dexie` e `xlsx` non si
  aggiornano**: l'applicativo è collaudato con quelle versioni.
- **GMP**: ogni movimento porta la sigla dell'operatore identificato, tenuta a
  sei anni (300-500 movimenti al giorno). **GDPR**: nome, cognome e iniziali,
  nessuna telemetria, nessuna richiesta verso l'esterno. **Il PIN non esiste a
  database: esiste la sua impronta.**
- **Una maschera che chiede l'identità in fondo la chiede troppo tardi**: la
  sigla si pretende prima di aprire il modulo.
- I conteggi DOM/CSS di confronto fra versioni sono **misure, non invarianti**:
  chi rimisura, rimisuri entrambe.

### Il PIN smarrito — come si esce

Il PIN non è recuperabile per costruzione: sul disco resta l'impronta SHA-256 con
un sale casuale. Il rinnovo lo autorizza un Team Leader col proprio PIN, e **con
un solo Team Leader il cerchio si chiude su se stesso** — è successo il 13/08. Si
esce dal dato, scrivendo una nuova impronta con la rotta che la calcola, così sale
e algoritmo restano quelli dell'applicativo:

```powershell
$nuovo = Read-Host 'PIN nuovo a 6 cifre' -AsSecureString
$pin = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($nuovo))
$campi = Invoke-RestMethod -Uri http://127.0.0.1:4173/api/op/hashPin -Method Post -ContentType 'application/json' -Body (@{pin=$pin} | ConvertTo-Json)
Invoke-RestMethod -Uri http://127.0.0.1:4173/api/c/operators/<op_id> -Method Patch -ContentType 'application/json' -Body ($campi | ConvertTo-Json)
```

**L'`op_id` si rilegge, non si copia** — `Invoke-RestMethod http://127.0.0.1:4173/api/c/operators`:
quello di `ANDS` è già cambiato una volta, e una PATCH su una chiave che non
esiste crea un secondo operatore invece di dare errore. E poi si toglie la causa:
**un secondo Team Leader**, un minuto in Configurazione → Operatori.

---

## 7. Mappa del codice

### Client — `src/`

| File | Righe | Ruolo |
|---|---:|---|
| `ui/app.js` | 1.328 | **Quel che non è una vista**: avvio e riallineamento col servizio, identità e sessione, il telaio (`switchView`, barra laterale, `showModal`, `toast`, scorciatoie), l'annulla, e le utilità che chiamano tutti — `_esc`, `_requireOperator`, le maschere di data, `_pickLoc`. In coda, il **rientro delle viste** |
| `core/store.ts` | 2.283 | **Le mutazioni**: tutto ciò che scrive e parla con `Persistence` |
| `core/cache.ts` | 321 | Punto unico di mutazione della cache: 5 forme, 4 indici derivati |
| `core/statistiche.ts` | 181 | Stato di una cella, conteggi, cruscotto |
| `core/pacchetto.ts` | 154 | Export: composizione, conteggi, verifica |
| `core/geometria.ts` | 123 | Le ubicazioni, generate dalla configurazione della zona |
| `core/giacenza.ts` | 94 | FEFO e ricerca della merce |
| `core/persistence/index.ts` · `remote.ts` · `local.ts` | 15 · 267 · 262 | Sceglie l'adapter e lo implementa: servito → HTTP, da file → Dexie |
| `core/schema.ts` · `utils.ts` · `costanti.ts` | 173 · 46 · 44 | Schema IndexedDB e migrazioni · `debounce` e `_h` · causali e ritenzione |
| `modules/compiti.ts` | 445 | Ciclo di vita, coda, misure, urgenza calcolata, residuo, le due famiglie di chiusura. **Puro**: non tocca Store né il DOM |
| `modules/misure.ts` | 319 | Le cinque unità, la suddivisione per collo, il collo incompleto. Puro |
| `modules/colli.ts` | 387 | **1.8 — l'elenco dei colli**: la suddivisione dichiarata, il prelievo per collo, le uscite come le capisce il servizio, il ritrovamento per misura, il ponte con la 1.7. **1.8.4**: `scelteDaUscite` (le uscite messe da parte, ritrovate) e `rettifica` (da com'era a com'è). Puro |
| `modules/documenti.ts` | 39 | **1.8.4** — la riga di un documento di uscita, ricostruita in **un posto solo**. Nasce da un difetto: era in due copie, e i colli scelti sparivano al salvataggio. Puro |
| `modules/vault.ts` | 303 | Backup su cartella locale (File System Access API) |
| `modules/pickRoute.ts` | 246 | Percorso di prelievo a serpentina |
| `modules/odpParser.ts` | 246 | Lettura degli ODP da Excel |
| `modules/destinatari.ts` | 200 | Chi è lo stesso destinatario (partita IVA), quale destinazione è nuova, cosa è cambiato |
| `modules/parametri.ts` | 165 | Le tendine che sono un dato: valori di legge davanti e non rimovibili |
| `modules/anagrafica.ts` | 158 | I 14 allergeni, le 3 classi di conservazione, le certificazioni |
| `modules/conformita.ts` | 155 | Cosa è stoccato dove non dovrebbe: il motore di stoccaggio al contrario |
| `modules/validate.ts` · `auth.ts` · `session.ts` · `pickupAlert.ts` · `scanGuard.ts` | 104 · 88 · 69 · 43 · 31 | Validazioni · PIN e impronta · sessione · allerta ritiri · guardia del lettore |
| `modules/excel.ts` | 31 | **Il punto unico da cui SheetJS si carica, e solo quando serve.** Chi rimette `import * as XLSX` in cima a un file annulla la 1.7 |
| `types/entita.ts` · `contratto.ts` · `collezioni.ts` | 409 · 146 · 58 | Le entità · l'interfaccia dei due adapter · **le 20 collezioni, sorgente unica**: il `satisfies` blocca la compilazione se adapter o servizio divergono |
| `styles/*.css` | 3.400 | **10 file**. `00-tailwind.css` è il tema — le utility, e i token dell'applicativo riletti da `@theme`: colore, scala tipografica, spaziatura a decimi di rem, raggi, ombre, soglie. Gli altri nove — token, base, componenti, layout, viste, grafici e report — **li importa lui**, dentro `@layer app`, e `main.js` importa solo lui. L'ordine fra i nove è la cascata di sempre |
| `ui/dialog.js` · `feedback.js` · `tabs.js` | 367 · 181 · 59 | Modali · toast e spinner · schede |
| `main.js` · `index.html` | 46 · 200 | Avvio e gancio globale · scheletro del DOM e marchi SVG |
| `ui/views/` | 10.520 | **Le venticinque viste**, più `vista.ts` (il tipo e i due aiuti al DOM) e `globale.d.ts`. Elenco e regole qui sotto |

### Le viste — `src/ui/views/`

**Una vista è un pezzo di `App` che vive in un file suo.** Non è un modulo che
si istanzia: `App` resta un oggetto solo, perché l'indice e i 258 gestori
costruiti dentro le stringhe lo chiamano **per nome**. In coda ad `app.js` un
ciclo le rimette dentro, e **esplode se un metodo è rimasto anche di qua** —
estrarre è spostare, e un doppione verrebbe sovrascritto in silenzio.

| File | Righe | Cosa disegna |
|---|---:|---|
| `configDati.ts` | 1.101 | Dati, resilienza, copia esterna, i tre fogli Excel, purga e reset |
| `spedizioni.ts` | 1.080 | DDT: testata, carrello, documento pendente, evasione, stampa |
| `compiti.ts` | 885 | Attività: coda, misure, registro, richiesta, i quattro gesti |
| `percorso.ts` | 822 | Prelievo guidato: ODP, serpentina, corsia, chiusura |
| `quarantena.ts` | 755 | Blocco, rilascio, cartellino di non conformità |
| `cruscotto.ts` | 750 | Le otto sezioni della Dashboard e i suoi grafici |
| `smaltimento.ts` | 664 | Scarico in tre stadi, e i **mattoni del documento** che usano tutti |
| `prelievo.ts` | 600 | Trasferimento e carrello di produzione |
| `inventario.ts` | 557 | Inventario di vano e conta mirata |
| `posiziona.ts` | 781 | Posizionamento, la dichiarazione dei colli, `_scegliColli` e **`_ridichiaraColli`** — la maschera che chiede com'è fatto adesso, condivisa con l'inventario e la Conta |
| `giacenze.ts` | 500 | Dettaglio di un'ubicazione e i cinque gesti che partono da lì |
| `configArticoli.ts` | 498 | Anagrafica articoli, allergeni, classi, certificazioni, UM |
| `configurazione.ts` | 437 | Le nove schede, gli interruttori, il DDT |
| `mappa.ts` | 418 | Pianta, frontale, conformità e deroghe |
| `documento.ts` | 410 | La correzione di un DDT pendente, su uno snapshot |
| `rapportoPrelievo.ts` | 380 | Un rapporto, tre sorgenti |
| `configSiti.ts` | 375 | Siti e zone |
| `configOperatori.ts` | 362 | Operatori, PIN, scadenza della sessione |
| `campionamento.ts` | 359 | Campionamento GMP e il verbale |
| `movimenta.ts` | 354 | Il telaio dei moduli, la coda di recupero, il registro di sessione |
| `ricerca.ts` | 227 | La ricerca in barra |
| `destinatari.ts` | 226 | Rubrica DDT, e quando un dato cambiato vale per sempre |
| `archivio.ts` | 197 | I cinque tipi di documento emesso |
| `registro.ts` | 191 | Registro movimenti completo |
| `parametri.ts` | 106 | Le quattro schede che sono un dato |
| `vista.ts` | 36 | Il tipo `Vista`, e `$`/`$q` — `getElementById` col tipo `any` |
| `globale.d.ts` | 10 | `declare const App`: il nome globale che qualche corpo usa da dentro un `setTimeout` |

**Chi ne aggiunge una** la scrive `.ts`, la tipa `Vista`, la importa in
`app.js` e la mette nell'elenco del rientro. **I corpi non sono tipizzati**:
sono usciti identici da `app.js` e portano `any` dove `tsc` lo ha chiesto —
tipizzarli è un lavoro a parte, un file per volta (§2).

**La rete**: `test/superficie-app.test.js` tiene i **577 nomi** che `App`
esponeva prima dell'estrazione, e controlla che ogni `App.qualcosa` citato
nell'indice o costruito dentro una stringa trovi a chi rispondere. Non si tocca
`superficie-app.dati.js` per farlo tacere: se suona, un metodo non è rientrato.

### Servizio — `server/`

| File | Righe | Ruolo |
|---|---:|---|
| `pathfinder-server.js` | 378 | Express: rotte, SSE, TLS opzionale, la cartella dell'applicativo, avvio |
| `lib/db.js` | 315 | Accesso SQLite, transazioni, operazioni composte, **`_migra`** |
| `lib/schema.js` | 191 | Tabelle e indici — **due funzioni separate**, con la migrazione in mezzo |
| `installa-pathfinder.ps1` | — | **L'installer**: chiede dove installare la prima volta e la rilegge dalla macchina aggiornando, capisce se è aggiornamento o prima installazione, si eleva **sempre** (ferma il servizio), porta applicativo **e** servizio, riavvia, e verifica che i due numeri coincidano. Nel pacchetto diventa `installa.ps1`. `-NonChiedere` per provarlo senza una persona davanti, **`-Prova`** per fargli dire cosa farebbe senza toccare niente |
| `Installa Pathfinder.bat` · `LEGGIMI-pacchetto.txt` | — | Il doppio clic e le istruzioni per chi installa. Nel pacchetto diventano `Installa Pathfinder.bat` e `LEGGIMI.txt` |
| `installa-servizio.ps1` | — | Registra le due attività pianificate e le variabili. Da amministratore, **una volta**, **dal sorgente** o dalla copia in `C:\Pathfinder\servizio` |
| `installa-versione.ps1` | — | **Disinstalla e reinstalla**: toglie dal deposito la cartella di quel numero, la riscrive con i byte del pacchetto e la **materializza** in `corrente`, spostando in `precedente` quella che c'era. Avvolge anche una consegna a file singolo. `-Casa` per il banco |
| `torna-indietro.ps1` | — | Scambia il contenuto di `corrente` e `precedente`. **Riporta indietro il solo applicativo**, non il servizio: dal 18/08 si torna indietro reinstallando il pacchetto della versione di prima — §4 |
| `backup-serale.ps1` | — | Backup a caldo, attività pianificata delle 20:00 |
| `test/collaudo.js` · `test/collaudo-migrazione-1.4.js` | 520 · 158 | 81 prove sul servizio vero · 8 sul cambio di schema |
| `test/collaudo-installazione.js` | — | **22 prove sugli script di installazione**: esercita `installa-versione.ps1` e `torna-indietro.ps1` su una casa temporanea, con consegne finte che si distinguono per i byte; e l'**installer a doppio clic** in `-Prova`, che è il modo di provarlo senza registrare attività pianificate su questa macchina |

### Collaudi — `test/`

`serpentina` · `fefo` (19) · `geometria` (21) · `odp` (26) · `anagrafica` (27) ·
`conformita` (19) · `cache` (43) · `pacchetto` (27) · `statistiche` (15) ·
`compiti` (114) · `misure` (65) · `colli` (66) · `parametri` (19) · `documenti` (6) ·
`destinatari` (27) · **`superficie-app` (2)** — **485 prove**. `ambiente.js` è
il preambolo comune.

`superficie-app` è la rete dell'estrazione, ed è l'unica prova che guarda
`app.js`: i nomi che `App` espone stanno in `superficie-app.dati.js`, e la
seconda prova rilegge indice e sorgenti per controllare che ogni `App.qualcosa`
scritto lì dentro trovi a chi rispondere — §7.

---

## 8. API e variabili

| Famiglia | Rotte |
|---|---|
| **Applicativo** | `/` e `/app` → l'indice, **`no-cache`** · `/assets/:file` → gli assets, **`immutable` un anno**, col ripiego su `precedente` |
| **Colli (1.8)** | `packs_out` è un elenco di `{da, quantita}` — la misura del collo e quanto ne esce; un numero solo significa «quel collo, intero». `packs_before` è il seme, come `qty_uom_before` |
| Collezioni | `GET/POST/PUT/PATCH/DELETE /api/c/:col[/:key]` · `/bulk` · `/count` · `/query` |
| Operazioni composte | `/api/tx` · `/api/op/removeItem` · `/api/op/commitPickStop` · `/api/op/sampleItem` · `/api/op/verifyPin` · `/api/op/hashPin`. **1.8**: le prime due accettano `packs_out` e `packs_before`, e con l'elenco `qty` diventa facoltativo — un prelievo che apre un collo senza svuotarlo non toglie colli |
| Servizio | `/api/health` · `/api/load` · `/api/clear` · `/api/deleteWhere/:col` · `/api/backup` · `/api/events` (SSE) · `/api/app-info` |

| Variabile di macchina | Valore |
|---|---|
| `PATHFINDER_PORT` | `4173` |
| `PATHFINDER_DB` | `C:\Pathfinder\data\pathfinder.db` |
| **`PATHFINDER_APP_DIR`** | `C:\Pathfinder\app\corrente` — **si imposta una volta sola**: dopo, le versioni si scambiano sostituendo il contenuto di quella cartella, e la variabile non si muove mai più |
| `PATHFINDER_APP_PREV` | il fratello `precedente`, da cui escono gli assets di chi stava caricando la pagina durante uno scambio. Si imposta solo per metterlo altrove |
| `PATHFINDER_APP` | il ripiego a file singolo, usato solo se `APP_DIR` è assente |
| `PATHFINDER_TLS_CERT` / `_KEY` | assenti → HTTP |

**Si leggono all'avvio**: cambiate senza riavvio non hanno effetto.

---

## 9. Dove sta il resto

| Serve | Dove |
|---|---|
| Installare il servizio da zero, diagnosticare, backup | [README.md](README.md) |
| Versioni precedenti, loghi, etichette, file di prova | `ARCHIVIO/` — e **non si cancella niente**: un archivio svuotato funziona una volta sola |
| La storia: handoff e piani fino al 17/08/2026 | `ARCHIVIO/HANDOFF STORICI/` — **memoria, non istruzioni** |
| Cosa è stato archiviato e quando | `ARCHIVIO/archive-manifest.json` |

---

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
