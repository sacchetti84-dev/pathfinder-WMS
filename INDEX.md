# Pathfinder — INDEX

**Questo è l'unico documento del progetto.** Stato, istruzioni, regole, trappole
e coda di lavoro stanno qui dentro. Non ce n'è un secondo da leggere insieme:
tutto ciò che era sparso in `HANDOFF/` è stato assorbito qui il **17/08/2026**, e
gli originali sono scesi in `ARCHIVIO/HANDOFF STORICI/` come memoria — non sono
istruzioni e non vanno più aperti per lavorare.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
Repo privato `sacchetti84-dev/pathfinder-WMS`, branch `main` · agg. **25/08/2026**

**La 2.3 è costruita e NON installata** — `consegna/Pathfinder 2.3/`,
impronta `367d977e…`, 4 file. Porta il giro conto nel vano di lavorazione,
il controllo pre-percorso su quel che il reparto ha già in mano, la lista
piatta dei colli e il percorso di più ODP insieme — §1. Provata al banco
sulla 4199 contro una copia del magazzino, e in browser sul pacchetto
minificato. **Installare non è accendere, e installare lo fa Andrea.**

**IL CODICE DELLA 2.3 STA SUL RAMO `2.3-reparto-e-giro-conto`, NON SU
`main`.** Su `main` c'è la 2.2, che è quella in servizio e quella che si
consolida: chi lavora alla 2.2 non deve scansare la 2.3 per farlo. Il ramo
si rilegge con `git show 2.3-reparto-e-giro-conto:<file>` e si riprende con
`git checkout 2.3-reparto-e-giro-conto`. **La 2.3 è stata giudicata un passo
più lungo della gamba il 25/08, e messa da parte**: quello che porta è
scritto qui sotto perché il giorno che si riprende non si ricominci a
ragionarci da capo.

Il pacchetto costruito sta in `consegna/Pathfinder 2.3/`, che **git non
traccia e la prossima build azzera**: ricostruirlo è un comando —
`git checkout 2.3-reparto-e-giro-conto && npm run build`.

**L'APPLICATIVO IN SERVIZIO È LA 2.2 GIUSTA — `08ce3f69…`, 1.777.087 byte**,
installata il 25/08 all'01:39 dal pacchetto ricostruito. **Il servizio dice
ancora 2.3**, e l'installazione si è fermata sulla verifica finale: l'attività
pianificata lancia il file del repository, non quello installato. Il comando
che lo corregge sta nella voce 39.

La riga qui sotto racconta com'era prima di quell'installazione.

**Prima di quell'installazione c'era un applicativo 2.2 SBAGLIATO e un servizio 2.3**,
`C:\Pathfinder\app\corrente` portava l'impronta
`62992e15…` — la build del 20/08, quella difettosa — e la 4173 rispondeva
`service_version` **2.3**. Ci si era arrivati installando la 2.3 all'01:29 e
tornando indietro all'01:35: `torna-indietro.ps1` riporta **solo
l'applicativo**, per scelta scritta. §1.

**Il servizio esegue `MAPPER\server\pathfinder-server.js`**, cioè il file
della cartella di lavoro: chi tocca quel file tocca la produzione, e
nessuna installazione riuscirà finché l'attività pianificata punta lì. §1,
voce 39.

**La riga qui sotto era vera il 24/08 e non lo è più.** Resta perché dice
qual è il pacchetto giusto: **la 2.2 del 24/08** — impronta `08ce3f69…`,
1.777.087 byte, 4 file, costruita alle **21:50** e installata alle **22:22**.
Quel pacchetto era andato perso e il 25/08 è stato **ricostruito dal commit
`495f38c` con la stessa identica impronta**: sta in
`ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.2\`.

**Tre ore prima era stata installata la 2.2 SBAGLIATA** — impronta
`62992e15…`, costruita il 20/08 alle 11:22 — e il difetto che si stava
correggendo è rimasto in servizio come se la correzione non fosse mai
esistita. Quei byte venivano da
`MAPPER.worktrees/push-repo-su-github/consegna/`: il worktree porta una
`consegna/` sua, ferma alla build vecchia, con lo stesso nome di cartella.
**Si installa da `MAPPER\consegna\`, e da nessun'altra.** La prova che
l'installazione sia quella giusta è l'impronta, non il numero di versione —
due pacchetti si chiamano `2.2` tutti e due.

> **Il kit demo vive dentro `consegna/` e la build lo cancella.** `Avvia
> Demo.bat`, i tre `README-DEMO` e i tre `IT-TECH-SHEET` non li produce
> `vite.config.js`: stanno solo lì, e `npm run build` azzera quella cartella
> a ogni giro. Il 24/08 sono stati messi da parte e rimessi dentro a mano
> quattro volte. Se devono vivere, il posto è fuori da `consegna/` o dentro
> la lista dei file del plugin di build.
>
> **Il 25/08 la build ha girato altre quattro volte, e `consegna/` contiene
> soltanto `Pathfinder 2.3/`.** Del kit demo non c'è traccia da nessuna
> parte sul disco — né in `ARCHIVIO/`, né nel worktree. Se il 24/08 era
> stato rimesso dentro dopo l'ultima build, adesso non c'è più.

**Il repository è in pari.** Il lavoro del 24/08 sta su `origin/main`
(`eb39f0a`): 19 file, 907 righe entrate e 172 uscite. Il 20/08 era successo
il contrario — la 2.1 installata e sette moduli nuovi vivevano su un disco
solo, sessanta file fuori da git, e ci sono voluti due giorni per
accorgersene (`68c48db`, `cb38527`).

**Il repository ha cambiato nome: `pathfinder-WMS`.** Il vecchio indirizzo
risponde ancora per redirezione — il push del 24/08 e' passato di lì con un
avviso — e `origin` adesso punta al nome nuovo. Chi ha un clone vecchio
aggiorna con `git remote set-url`.

Il database **non è stato migrato**, perché non c'era niente da migrare:
né la 2.1 né la 2.2 toccano `lib/schema.js`.

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

### Il 25/08 — IL SERVIZIO IN PRODUZIONE GIRA DALLA CARTELLA DI LAVORO

**È il motivo per cui la 2.2 non si installa, ed è la trappola più grossa
trovata finora.** L'installazione del 10/08 lo aveva scritto nel suo log e
nessuno lo ha più riletto:

```
Applicativo   C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER\server\pathfinder-server.js
```

L'attività pianificata «Pathfinder - Servizio dati» lancia **il file del
repository**, non `C:\Pathfinder\servizio\pathfinder-server.js`. La prova,
misurata il 25/08:

| | dice |
|---|---|
| `C:\Pathfinder\servizio\pathfinder-server.js` | `VERSION = '2.2'`, ultima modifica **20/08 11:16** |
| `MAPPER\server\pathfinder-server.js` | `VERSION = '2.3'` |
| `/api/app-info` sulla 4173 | `service_version` **2.3** |

L'unico file che dice 2.3 è quello nella cartella di lavoro, ed è quello che
la produzione sta eseguendo. L'installazione della 2.3 ha aggiornato
`C:\Pathfinder\app\` e ha copiato il servizio in `C:\Pathfinder\servizio\`,
ma quel file **non lo apre nessuno**.

**Due conseguenze, e sono tutte e due serie.**

**1. Chi lavora al progetto scrive in produzione senza saperlo.** Cambiare
`VERSION` nel repository — cosa che ogni versione nuova fa, ed è il primo
gesto della lista — cambia il numero che il servizio in magazzino dichiara
al riavvio successivo. Vale per `VERSION` e vale per tutto il resto del
file: rotte, transazioni, `removeItem`. Il 25/08 il numero è passato a 2.3
per questa strada, non per un'installazione.

**2. L'installazione della 2.2 non può riuscire.** L'installer copia
l'applicativo, copia il servizio, riavvia l'attività e alla fine confronta
`service_version` col numero del pacchetto. L'attività riparte sul file del
repository, che dice 2.3: il confronto fallisce e l'installer dichiara
«Il servizio non è quello di questa versione». Il messaggio parla di
riavvii perché è il caso che si aspettava — un processo vecchio ancora vivo
— e qui il processo è nuovo e legge il file sbagliato.

**Non è stato corretto**: tocca l'attività pianificata e il servizio, e
quello si propone. Vedi la voce 39.

### Lo stato vero della produzione, misurato il 25/08 all'01:40

| | |
|---|---|
| applicativo in `C:\Pathfinder\app\corrente` | **2.2**, impronta `62992e15…` — **la 2.2 SBAGLIATA**, quella del 20/08 |
| servizio che risponde sulla 4173 | **2.3** |
| `C:\Pathfinder\app\pathfinder-2.3` | 2.3, impronta `367d977e…`, installata all'**01:29** |
| `C:\Pathfinder\app\precedente` | 2.3 |

Letto dalle date: la 2.3 è stata installata all'01:29 e alle 01:35 è stato
fatto un `torna-indietro`, che ha rimesso `corrente` sulla 2.2. **Lo script
riporta indietro solo l'applicativo, per scelta scritta** — §5 e la sua
testata: «il servizio dati resta quello di adesso, e i due numeri di
/api/app-info non coincidono». Quindi servizio 2.3 e applicativo 2.2 è lo
stato che quel gesto lascia, non un guasto.

**Ma l'applicativo tornato indietro è la 2.2 sbagliata**, e non c'è nessun
posto in `C:\Pathfinder\app\` dove stia la `08ce3f69…`: la 2.2 giusta, in
quella macchina, non c'è più.

### La 2.2 in archivio era quella sbagliata — sistemata il 25/08

`ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.2\` conteneva l'impronta
`62992e15…`, 1.768.752 byte, costruita il 20/08 alle 11:22: **la build
sbagliata**, la stessa che il 24/08 era finita in servizio per tre ore.
Chi la installava installava il difetto.

Adesso lì c'è la 2.2 vera, **ricostruita dal commit `495f38c`** — impronta
`08ce3f69331985…`, **1.777.087 byte**, gli stessi che l'INDEX dichiarava.
Quella sbagliata non è stata cancellata: sta accanto, come
`Pathfinder 2.2 (build sbagliata 20-08 62992e15)`.

**E si è imparata una cosa che non si sapeva: LA BUILD È RIPRODUCIBILE BIT
PER BIT.** Ricostruendo lo stesso commit a cinque giorni di distanza esce la
stessa impronta, cifra per cifra. Vuol dire che un pacchetto perso non è
perso: si riottiene dal commit, e che l'impronta è una prova di *quale
codice* c'è dentro, non solo di quali byte.

### Il 25/08 — il reparto, e il conto che passa da un ordine all'altro

**Il caso.** Cinque ODP della stessa serie chiedono 5 KG dello stesso lotto
l'uno, e a magazzino c'è una confezione da 25. Il primo prelievo si portava
via il collo intero — non c'era modo di prenderne cinque — e i quattro
percorsi dopo dicevano **«lotto non trovato»**. Non era vero: quella merce
era a disposizione del reparto, ferma nel vano di lavorazione, e nessuna
maschera la nominava. Andrea, 24/08.

**1. IL GIRO CONTO — la merce non si muove, il conto cambia nome.** Un `out`
sul cedente e un `in` sul ricevente, nessuna giacenza toccata. Passa una
QUANTITÀ, non un collo: dei 25 KG scesi per il primo ordine, quattro volte
cinque vanno agli altri e cinque restano suoi — ed è quel residuo che alla
chiusura diventa il suo consumo. Cedere il collo intero direbbe che chi lo
ha fatto scendere non ne ha consumato niente. `qty` è **zero** apposta: i
colli restano di chi li ha portati giù, e a passare sono i chili.

Il giro usa `out` e `in`, non un verso nuovo: il ramo in fondo a `conto()`
raccoglie tutto quel che non è `out` né `consumo`, e un verso nuovo ci
cadrebbe dentro come merce entrata dallo scaffale. A distinguerlo è
**`giro_odp`**, il nome dell'altro ordine sul movimento. Non serve al saldo:
serve al rendiconto.

Lo fa il magazziniere **al controllo pre-percorso**, prima di camminare, e a
registro va con una causale sua — **`WIPGIRO`**, «Giro conto WIP». Un
movimento che non sposta merce sta a registro perché la domanda che ci si fa
fra tre anni è «di chi era quel sacco».

**2. IL FABBISOGNO SI SCONTA DI QUEL CHE IL REPARTO HA GIÀ IN MANO**, in UM.
La tappa nasce già ridotta — «servono 5, ne ha 5, non si va» — e non è uno
stato salvato da qualche parte: si **rilegge dai movimenti** a ogni
costruzione del percorso. Fare il giro e ricostruire dà una tappa più corta;
non farlo la lascia intera; ricaricare lo stesso file due volte dà lo stesso
risultato. Dove le UM non si sanno — `coperturaUom` torna `null`, non zero —
**la tappa non si riduce** e decide chi ha la merce davanti.

Il controllo dice due cose diverse con due riquadri diversi: **verde**, «già
in reparto per quest'ordine, non serve prelevarne dell'altra»; **giallo**,
«il reparto ce l'ha per un altro conto» col pulsante che gira.

**3. IL VANO NON È PIÙ UNA TAPPA.** `PickRoute.build` cercava con
`getItemByKey` su TUTTE le ubicazioni e scartava solo quarantena e impegno
su DDT: il vano WIP è un'ubicazione mappata, quindi ci mandava a prelevare —
merce di un altro ordine, portata via senza passare dal conto. Adesso è
escluso dalle candidate, e ne esce solo col giro conto o col reso.

**4. IL VANO WIP È UNA LISTA PIATTA, UNA RIGA PER COLLO**, con dentro i nomi
degli ordini che se lo dividono e per quanto: «📦 25 KG — ODP-1 · 20 KG,
ODP-2 · 5 KG». Si rende, si dichiara consumato e si gira di conto da lì,
senza passare dall'ordine, perché chi ha il bancale davanti vede il collo e
non il numero d'ordine. Le quote le calcola `quoteVano`, puro: assegna col
criterio di sempre — la misura esatta, poi il più piccolo che basta — e
quello che avanza su un collo è **scoperto**, merce che nessun ordine
rivendica. Quel che un conto reclama e nel vano non si ritrova esce in
**`senzaPosto`** invece di sparire: un conto e uno scaffale fuori passo si
mostrano.

**Il conto per ordine si è spostato in un registro suo** — scheda «Registro
ODP», `views/wipRegistro.ts`: conto, chiusura, rendiconto, archivio. Le due
domande sono diverse — «cosa c'è in reparto e di chi è» contro «come si è
chiuso quest'ordine» — e stavano in una maschera sola perché fino alla 2.2
un collo apparteneva a un ordine solo.

**5. IL RESO TRABOCCA, E SI SCARICA DAL PIÙ VECCHIO.** La produzione rende
quando ha finito, non quando un ordine chiude, e spesso rende più di quanto
un solo conto avesse fuori. `ripartisciReso` consuma le quote nell'ordine in
cui arrivano — le ordina la maschera, che sa quale riga il magazziniere ha
toccato — e l'eccedenza passa alla successiva. Dentro, comanda l'anzianità
dell'ordine aperto; le quote senza padrone vanno in fondo.

**6. SI ESCE DAL VANO PER QUANTITÀ, NON PER COLLI.** Un collo diviso fra due
ordini non si può portare via intero perché il conto dice «un collo»:
`pianoUscita` (in `modules/colli.ts`) traduce una quantità in
`{da, quantita}` per collo — la misura esatta, poi il più piccolo che basta
— e `esceDaVanoWip` fa **una** chiamata alla giacenza e **un movimento di
conto per ogni ordine toccato**. Il collo che esce intero si conta a chi ne
ha la quota più grande: i colli sono interi e le quote no, e la quantità
resta esatta per tutti.

**7. PIÙ ODP IN UN GIRO SOLO.** Si caricano più file: le righe che chiedono
lo stesso lotto dalla stessa ubicazione diventano **una tappa**, con dentro
`richieste` — quanto ne vuole ciascun ordine. Al prelievo la merce entra nel
vano **una volta sola** (`entraInWip` aggiunge giacenza: chiamarla cinque
volte caricherebbe cinque volte la stessa roba) e agli altri passa col giro
conto, in proporzione a quel che avevano chiesto. Un ordine si toglie dal
giro senza ricaricare gli altri.

### Tre difetti trovati costruendo, non leggendo

**`ordiniWipAperti` filtrava sul residuo in COLLI.** Un ordine servito da una
quota di un collo altrui ha cinque chili in lavorazione e **zero colli**:
spariva dagli ordini aperti il giorno stesso in cui nasceva. Adesso la prova
è il residuo in colli **o** in UM.

**«L'ordine più vecchio» era ordinato sull'ULTIMO movimento.**
`ordiniWipAperti` ordina sul più recente — giusto per un elenco da cui si
sceglie — e rovesciare quell'elenco metteva per ultimo proprio l'ordine
sceso per primo: chi aveva ceduto una quota a quattro altri portava il suo
ultimo movimento in fondo alla giornata. Il reso si scaricava dall'ordine
sbagliato. Adesso «più vecchio» è **quando l'ordine è nato**. Trovato al
banco, sul ciclo dei cinque ODP.

**Il rendiconto stampava un foglio bianco, e prima ancora una bugia.** Il
filtro delle righe guardava i soli colli: un ordine servito interamente da
quote altrui — cinque chili ricevuti, cinque dichiarati consumati — usciva
con zero righe. E il **reso** portava dentro anche il ceduto: «venticinque
chili rientrati a magazzino» a chi poi va a cercarli sullo scaffale e ne
trova cinque. Adesso il reso sul foglio è quello che è **davvero risalito**,
ceduto e ricevuto hanno le loro colonne, e reso + ceduto + consumo fa il
consegnato.

### Come è stato provato

**Al banco, sul pacchetto costruito** — 4199, copia del magazzino del 20/08,
`banco/banco-2.3.cjs`. Il ciclo dei cinque ODP gira per intero in
`banco/ciclo/reparto.test.js`, **10 passi**: il collo da 25 entra a
scaffale, il primo ordine se lo porta in reparto, il secondo si sente dire
che la merce c'è, il giro conto passa 5 KG e la giacenza non si muove di un
grammo, il percorso ricostruito non ha più quella tappa, il collo porta
cinque nomi e la somma delle quote fa 25, la produzione rende 5 KG senza
dire per chi e si scarica il più vecchio, un ordine dichiara la sua parte e
agli altri non tocca niente, un ordine archiviato rifiuta anche un giro
conto.

**In browser, sul pacchetto minificato**: le due schede disegnano, il
riquadro giallo elenca le quote col pulsante, il giro conto eseguito porta
le tappe da 1 a 0 e il riquadro diventa verde — «già in reparto per
quest'ordine: 5 KG» — e a registro compare
`WIPGIRO · 0 colli · 5 KG · ODP-BROWSER-1 · Giro conto: … → …`.

`npm run check` pulito, **947 prove in 33 file** nel client, **98** nel
servizio, **22** sull'installazione.

**Tre prove del ciclo al banco falliscono, e fallivano già sulla 2.2** —
verificato costruendo un worktree su `HEAD` e facendole girare lì: il reso
del ciclo 2.0 (③), l'attività di `funzioni`, e la testata dell'ODP in
`percorso` (il file locale è `ODP2607777`, `ricetta.js` dice `ODP2603889`).
Non le tocca questa versione.

### Il 24/08 — la maschera delle attività, il registro, i colli per misura

**1. Un'attività di prelievo non si riusciva ad aprire, e il campo che la
bloccava non era a schermo.** Due difetti sovrapposti, e il secondo è quello
vero. `doCreateTask` pretendeva il destinatario per i due prelievi: è un dato
del DOCUMENTO — il DDT lo chiede alla registrazione, che è il momento in cui
si sa — e alla richiesta blocca l'unica cosa che serve, mettere il lavoro in
coda. Adesso è facoltativo e resta a video. Ma il campo **non compariva**:
`_ntTypeChanged` accendeva le righe con `style.display = ''`, e quelle due
righe portano `hidden` nel markup — lo stile in riga vuoto non batte una
classe, e la riga non si vedeva mai. La maschera rifiutava la conferma
indicando un campo assente dallo schermo. Stessa cosa sul Campionamento, dove
«Campione per chi» è obbligatorio: quel tipo di attività **non si poteva
creare affatto**. `mostra()` adesso toglie la classe. Trovato in browser sul
pacchetto costruito, non leggendo.

**2. Il registro aveva una riga che non esisteva e quattro mute.** L'entrata
nel vano WIP non era scritta: la merce spariva dallo scaffale e ricompariva
in `M06-COM-01` senza una riga che ce l'avesse portata — adesso il prelievo
guidato e il carrello scrivono un `IN` sul vano, **dopo** che il conto è
riuscito. Scrivevano solo la nota, senza quantità: il reso dal conto di
produzione, la rimozione a mano di una riga, il rilascio dalla quarantena e
la chiusura della chiave vecchia. E la colonna delle UM mancava su
trasferimento, quarantena, consumo, posizionamento a mano e su tutte e dieci
le rettifiche d'inventario: un trasferimento a peso raccontava i colli e non
i chili. **Le uniche causali senza quantità restano le tre che non muovono
merce** — modifica dati, purga, rinnovo PIN.

**3. I colli parziali sui lotti che non dichiarano le misure.** Mezza
anagrafica la quantità per collo non ce l'ha: quei lotti arrivano a scaffale
con l'unità scritta e il per-collo vuoto, e il reso parziale si rifiutava —
aprire un collo vuol dire dire QUALE, e senza misure non c'è un quale.
Adesso la maschera del reso chiede quanto contiene un collo intero, e il
numero si scrive **sul lotto**: è una dichiarazione di chi ha i colli in
mano, come l'inventario, e vale per tutti i colli di quel lotto.

**4. Il conto di produzione derivava male, e lo diceva.** Dichiarando la
confezione a lavorazione aperta, l'entrata restava senza misure e le uscite
le avevano: il conto leggeva «entrato 0 KG, uscito 25» e si dichiarava
incoerente — «da qualche riga è tornato più di quanto sia uscito, −25 KG».
Non era falso, era mezzo scritto. Le UM che un movimento non porta **si
derivano alla lettura**, dai colli e dalla confezione di adesso, come
`colliDiRiga` fa con le righe di giacenza. Nessun movimento riscritto: il
conto è storia. Vale all'indietro su ogni ordine prelevato prima che qualcuno
dichiarasse la confezione.

**5. La scelta dei colli si fa per MISURA.** Una riga con settanta colli
chiedeva settanta caselle per ottenere un numero, ed era il gesto più lungo
della giornata. Adesso una riga per misura — «25 KG · 3 disponibili» — col
numero di colli che escono, e in fondo un campo per la parte di un collo con
la tendina della taglia che si apre. Il default è il più piccolo che basta e
resta un default finché l'operatore non lo tocca. La maschera nasce
**precompilata sul fabbisogno**: in UM dove il chiamante lo sa (l'ODP chiede
chili), in colli altrove. L'elenco collo per collo non c'è più, e con lui la
domanda secca «sono tutti uguali, quanti ne servono?»: erano tre maschere per
la stessa domanda. **Nel prelievo da ODP la domanda è una sola** — prima
chiedeva «quanti» e poi «quali», cioè lo stesso numero due volte.

Provato al banco sul pacchetto minificato con l'ODP2607777 vero: 10 tappe,
prelievo, reso, chiusura e archiviazione, poi un trasferimento con un collo
aperto — `[25, 4]` a destinazione, `[25, 25, 10, 10, 1]` all'origine.
`npm run check` pulito, **925 prove in 32 file** nel client, **98** nel
servizio, **22** sull'installazione.

### La 2.2 — cinque difetti chiusi, e il lavoro rimesso in salvo

Costruita il **20/08**, non installata. `npm run check` pulito, **894 prove
in 30 file** nel client e **98 nel servizio** — queste ultime fatte girare
anche DAL PACCHETTO, non solo dal sorgente.

**IL NUMERO DI VERSIONE STA IN QUATTRO POSTI, NON TRE.** Oltre a
`vite.config.js`, `package.json` e `VERSIONE_APP` c'è **`VERSION` dentro
`server/pathfinder-server.js`**: alla fine dell'installazione
`installa-pathfinder.ps1` confronta `service_version` col numero del
pacchetto e **dichiara fallita l'installazione** se non coincidono, perché
quel caso significa che sta ancora girando il processo di prima. Lasciato
indietro, la 2.2 si sarebbe rifiutata di installarsi con un messaggio che
parla di riavvii. Trovato costruendo, non leggendo.

**1. Il campo fantasma sulle giacenze — voce 14, chiusa.** `removeItem`,
`sampleItem` (due rami) e `commitPickStop` timbravano `item.updated_at`,
che il tipo `Giacenza` non dichiara e che nessuno legge: il campo della riga
si chiama `last_updated_at`. Il difetto non si vedeva perché il client si
riallinea sulla risposta del servizio e la riga a schermo tornava giusta; a
database restavano due campi e due date. Le due prove nuove del collaudo
guardano **la riga scritta e non la risposta**, che è l'unico posto da cui
si vedeva.

**Le tredici righe già storte sono raddrizzate in produzione**, il 20/08,
dopo una copia in `C:\Pathfinder\backup\`. Zero righe su 199 portano
ancora `updated_at`. **Dodici delle tredici avevano `updated_at` PIÙ
RECENTE**: dichiaravano «modificata il 07/08» merce toccata il 20/08, ed è
quella la data che hanno tenuto. Lo ha fatto `banco/campo-fantasma.cjs`,
che di suo non scrive niente — serve `--scrivi`.

**2. L'archivio degli ODP si sfoglia — voce 29, chiusa.** `archiviato()`
risponde su un ordine di cui si sa già il numero; il consuntivo di una
lavorazione si guarda mesi dopo, quando quel numero non ce l'ha più in testa
nessuno. `ordiniArchiviati()` torna l'elenco con la data di chiusura, dal
più recente, e la vista lo mostra accanto ai conti aperti.

**3. Le righe ferme nel vano WIP che nessun ordine rivendica — voce 30,
chiusa.** Il vano è un'ubicazione sola e a tenere distinti i conti è
l'ordine su ogni movimento: una riga che nessun movimento nomina non sta in
nessun conto, e né la chiusura né il reso — che lavorano per ordine — la
vedono passare. Il 20/08 ce n'erano sei e le ha trovate un guardiano
leggendo il database, perché l'applicativo non aveva **nessun posto in cui
dirlo**. Adesso ce l'ha. Non è una toppa: la condizione si ripresenta ogni
volta che qualcuno posiziona a mano in quel vano.

**4. La data delle copie locali era sempre un trattino.** `listBackups`
torna `lastModified`, `app.ts` leggeva `.modified` attraverso un cast. Un
trattino non è un errore, ed è il motivo per cui nessuno l'aveva letto come
tale.

**5. Un articolo senza descrizione scriveva «undefined»** nel campo
descrizione, e da lì sulla riga di giacenza e in ogni export che la rilegge.
Cinque `as string` che non convertivano niente: dicevano al compilatore di
non guardare.

**Cosa ha visto il browser** (servizio sulla 4199 contro una copia della
produzione, poi **il pacchetto 2.2 minificato** e non il dev server): i due
riquadri nuovi rispondono, un ordine archiviato si riapre dall'elenco col
suo rendiconto, console pulita, tutto dentro **a 480 px**.

**Una trappola nuova, pagata scrivendo.** `.gitattributes` dice `* -text`:
Git non deve toccare i fine riga. Uno script che rilegge un file in Python e
lo riscrive con `newline=''` **converte CRLF in LF** e fa risultare
modificata ogni riga del file — il diff è passato da 4.248 righe a 13.016
prima che qualcuno se ne accorgesse. Chi modifica un file da uno script
rilegge in **binario** e riscrive con lo stesso terminatore che ha trovato.

### La 2.1 — quello che la richiesta del 19/08 chiedeva, meno Azure

**Il verso è 2.1, dichiarato da Andrea**: aggiustamento del ramo 2.x, non
architettura nuova. `npm run check` pulito, **811 prove in 28 file**
(erano 725 in 24), più le 22 dell'installazione e le 8 del cambio di
schema. **Impacchettata il 19/08, non installata**: installare è un atto
umano, §0 punto 4.

**IL NUMERO DI VERSIONE STA IN TRE POSTI, E `package.json` NON È NESSUNO
DEI TRE.** La prima build della 2.1 è uscita chiamandosi «Pathfinder
2.0» con dentro i byte della 2.1: il nome della cartella e il numero in
pagina li dà `VERSIONE` in `vite.config.js`, e `package.json` non lo
legge nessuno. Il terzo posto è `VERSION` in `pathfinder-server.js`, che
era rimasto a `2.0` — e l'installer **rifiuta** un pacchetto il cui
servizio dichiara un numero diverso, con un messaggio che parla di
riavvii. I tre numeri adesso dicono 2.1 tutti e tre. §5, «I tre posti
del numero di versione».

**Azure resta fuori dal servizio, e la decisione è di Andrea**: il ramo
`server/azure/` c'è — schema PostgreSQL, script di migrazione, 8 prove —
e non lo chiama nessuno. §6 dice «niente Azure» e continua a valere: quel
ramo esiste perché la decisione si possa prendere coi numeri davanti.
Cosa costerebbe davvero sta scritto in `server/azure/LEGGIMI.md`, e i
quattro punti che decidono sono: il magazzino si ferma quando cade la
linea, la latenza di ogni transazione composta, il backup che cambia
padrone, e `lib/db.js` che va riscritto da sincrono ad asincrono insieme
alle sue 85 prove.

**Cosa è entrato:**

- **Il codice a barre, scritto in casa** — `modules/code128.ts`, 14 prove.
  Ogni documento stampato porta in testata il proprio riferimento in
  Code128 (una riga sola: `_docHeadHTML`, da cui passano tutti e sette),
  e l'etichetta UDC porta **quello e nient'altro**: ubicazione, data e
  operatore sono usciti perché valgono il minuto della stampa e restano
  incollati al legno per mesi. Dalla sidebar della mappa si stampa anche
  l'etichetta identificativa di una merce. **Non è un GS1-128**: manca
  FNC1, e sta scritto nel modulo — dentro l'azienda si scansiona e si
  ritrova il documento, fuori dal cancello no.
- **Il ruolo ADMIN.** Terza carica, comprende il Team Leader. È l'unico
  che apre la Configurazione e il reset dei dati, e il reset adesso
  pretende il suo PIN. **L'eccezione del primo giorno è dichiarata**:
  finché nessun Admin esiste comandano i Team Leader, o l'installazione
  murerebbe la Configurazione, che è l'unico posto da cui si nomina un
  Admin — lo stesso cerchio del PIN del 13/08. Il primo accesso su un
  database vuoto crea un Admin, non un leader.
- **La purga non c'è più**, e con lei `purgeMovementsBefore`. Era l'unica
  strada per cui un movimento poteva sparire. **La copia esterna su
  cartella non c'è più**: `modules/vault.ts` cancellato, 6 metodi usciti
  da `App`; il backup è un compito del servizio. **I due salvataggi a
  mano non ci sono più** — «💾 Salva ora» e il clic sull'indicatore:
  ogni mutazione passa già da `Persistence`, e il checkpoint resta dove
  serve, all'uscita dell'operatore.
- **Il cruscotto se lo compone chi lo guarda** — `modules/cruscotto.ts`,
  19 prove. Tredici riquadri, ordine e larghezza a scelta, si trascinano;
  le scorciatoie a Movimenta da tre fisse diventano sette a scelta. Il
  layout è JSON in `meta`. **Ordine e larghezza, non coordinate in
  pixel**: una posizione salvata su un 27 pollici, riletta sull'MC9400,
  mette due riquadri uno sull'altro. Quello che avvisa non si spegne.
- **Ordinare e filtrare** — `modules/tabella.ts`, 22 prove. Applicato ad
  Archivio, Operatori, Registro attività e Registro movimenti, che non ce
  l'avevano. Tre cose che sembrano dettagli: l'ordinamento è **stabile**,
  il **vuoto va in fondo nei due versi** (una data mancante non è «molto
  vecchia»), e i numeri si confrontano da numeri — «10» prima di «9» è il
  difetto che fa sembrare rotta una tabella che funziona.
- **Il registro delle attività legge anche il registro generale.** I
  campionamenti aperti a mano — che un compito dietro non l'hanno mai
  avuto — comparivano da nessuna parte: chi contava le prese a fine mese
  ne trovava una parte, senza modo di saperlo. **Non è una vista SQL, e
  il perché è dichiarato**: un movimento non sa chi l'aveva chiesto né
  quanto è rimasto in coda, e un registro costruito sul solo `mov_log`
  perderebbe la metà dei numeri dei KPI.
- **Il prelievo da file finisce nel conto WIP.** Il carrello di
  produzione ci portava la merce dalla 1.14; il prelievo guidato da ODP —
  che in magazzino è il più usato dei due — la faceva sparire e basta.
  «702 KG entrati, 0 consumati» sarebbe stato il numero di ogni ordine
  prelevato da file.
- **Il magazzino di partenza si dichiara.** «Dove c'è il grosso della
  merce» resta il predefinito; chi comincia da MAG1 perché il camion
  scarica lì lo dice, e le righe di quel magazzino smettono di chiedere
  trasferimenti intermedi. Una scelta senza righe si ignora — un avviso
  che si accende su tutto non dice niente.
- **Le unità di carico**: si smaltiscono e si mettono in quarantena
  **intere**, con una giustificazione sola per tutte le righe; si vedono
  **dentro il vano** sulla mappa, come caselle annidate che si stringono
  da sole; **si trascinano** da un'ubicazione all'altra, e il
  trascinamento passa da `moveUdc` come la maschera. Il carico può avere
  un'unità come destinazione — un campo solo, e il codice di un'unità
  aperta si riconosce da sé. L'inventario ha un terzo ramo, **per unità**,
  che si apre scansionando l'etichetta.
- **La mappa**: la sidebar **non copre più la pianta** — i 360px coperti
  erano la corsia che l'operatore aveva appena cliccato — la vista la
  decide la zona (scaffali → frontale con «Specchia», terra → dall'alto),
  e la scheda di un item cambia gerarchia: ① articolo e lotto ② colli e UM
  ③ descrizione ④ distinta colli, con data, scadenza e note dietro
  «Dettaglio». I quattro pulsanti hanno la stessa dimensione e lo stesso
  peso: il colore diceva un'importanza che non c'è.
- **La categoria articolo non ha più una forma.** Era `^[A-Z]{1,5}$`;
  adesso resta il solo controllo che vale ovunque, i caratteri che
  romperebbero una pagina.
- **Una skill** per il disegno di interfacce ERP/WMS, in
  `.claude/skills/erp-wms-frontend/`.

**I due difetti del motore di stoccaggio, trovati leggendo il codice:**

1. **La cella riservata era irraggiungibile, e la deroga con lei.**
   `reserved` usciva fra i vincoli duri insieme a «bloccata», e trenta
   righe più in basso `posto.riservata` — che il chiamante calcola proprio
   come `stato === 'reserved'` — avrebbe fatto derogare gli allergeni. Non
   è mai successo: il vano era già fuori. La deroga esisteva **solo nei
   collaudi**, dove `riservata` e `status` si passano separati, cioè in una
   combinazione che `Store.proponiStoccaggio` non produce. Adesso: con
   allergeni è un candidato, senza allergeni resta escluso.
2. **La distanza schiacciava tutto il resto.** `distanza` è la posizione
   nella sequenza della zona, e pesava −1 a passo: su 274 ubicazioni
   arriva a −273 mentre «qui c'è già questo articolo» vale 40. Il
   raggruppamento del lotto non ha mai spostato una proposta. Adesso la
   penalità ha un tetto — `DISTANZA_MAX: 15`, meno di STESSO_ARTICOLO e
   più di VUOTO.

**La priorità di una regola va da 1 a 10** (era «da zero in su», senza
tetto). Una regola vecchia con 0 si rilegge buona: in lettura si è
tolleranti, in scrittura no.

**Il difetto che Andrea ha segnalato — «l'ubicazione non soddisfa i
criteri anche quando la regola è definita correttamente» — NON è stato
riprodotto.** I due qui sopra sono altra cosa. Serve la regola esatta, il
codice del vano e il messaggio a video.

### La sera del 20/08 — il magazzino in mano a un operatore, e quattro difetti

**Andrea ha lavorato sulla 2.1 in produzione mentre un guardiano in sola
lettura leggeva il servizio ogni quindici secondi** e controllava quattro
cose su ogni movimento: che il saldo torni (`prima + delta = dopo`), che
l'elenco dei colli combaci con le UM, che ci sia la firma, e che nessuna
attività resti aperta col residuo a zero. Lo script sta in
`banco/` e non è codice dell'applicativo.

**Quello che è stato corretto**, e sta nel sorgente — **non nel pacchetto
installato**, §4:

1. **IL CONSUMO IN WIP NON SI RIUSCIVA A DICHIARARE.** Reso e chiusura
   facevano cose diverse sullo stesso problema: il reso chiedeva quali colli
   solo se l'ordine aveva le misure a conto, **la chiusura non chiedeva mai**
   e passava `null`. Su ogni riga entrata in lavorazione prima che il conto
   registrasse le misure — cioè **tutte e diciotto quelle in produzione, che
   hanno `packs: null`** — la chiusura finiva a chiedere «togline tre» a
   `removeItem`, che dalla 2.0 rifiuta. Adesso la regola è una sola:
   `_wipScegliColli`, e se la riga dichiara i colli e non se ne portano via
   tutti, si chiede QUALI. Lo svuotamento totale resta libero.

2. **I TRASFERIMENTI CHIESTI DA UN ODP NON SI CHIUDEVANO MAI.** Due regole
   giuste che si sono incontrate male: la 1.10 crea quelle richieste **senza
   numero di colli** — apposta, perché quanti ne servano per fare 44,42 kg lo
   sa la giacenza e non l'ordine — e la famiglia «a residuo» chiude quando il
   residuo arriva a zero. Un residuo `null` non ci arriva. Trovati due in
   produzione, `TA-MT0N4CWQ-TFUT` e `TA-MT0N4JYO-5FER`, con la merce già
   trasferita e l'attività che continuava a chiedere. **Dove non c'è una
   quantità da esaurire, la prova che il lavoro è finito è il gesto**: non si
   inventa un numero che nessuno ha chiesto. La prova che fissava il
   comportamento di prima è stata riscritta, non cancellata.

3. **Le unità di carico sulla mappa sono quadrate.** Erano strisce alte sei
   pixel, e una striscia non somiglia a un pallet: somiglia a una
   sottolineatura, cioè a un segno di stato.

4. **L'anteprima dell'ubicazione riconosce un'unità di carico.** Il campo del
   posizionamento accetta un vano O il codice di un'unità aperta; l'anteprima
   cercava solo fra le ubicazioni e a un'etichetta di pallet rispondeva
   **«non trovata» in rosso** mentre la conferma sarebbe andata a buon fine.
   Trovato scansionando, alla prima etichetta.

**Quello che il guardiano ha trovato nei dati e che NON è codice da
correggere** — sono righe di magazzino da raddrizzare, §2:

- **Una riga con due verità.** `6000366B#123456` in `MAG-SCA-01-03-B`:
  l'elenco dice `[9×9 + 20]` = **101 KG**, il saldo dice **81**. Nasce dal
  campionamento del 18/08 all'01:00, nella finestra in cui la 1.8.4 non era
  ancora installata: allora il campione calava `qty_uom` e lasciava l'elenco
  pieno. Oggi il difetto è chiuso — il client manda `packs_out` — ma la riga
  è rimasta storta. Si raddrizza da Conta.
- **Un collo comparso senza movimento.** `7000924#123456` in `MAG-SPC-01`:
  la quarantena del 18/08 lascia il saldo a **8**, la spedizione del 19/08
  alle 00:20 parte da **9** e scrive **8** togliendone 2. È l'unico saldo che
  non torna su 256 movimenti, ed è capitato su un'uscita verso un cliente.
- **Sei righe nel vano WIP che nessun conto rivendica** — `3370013#GI`,
  `3670002#GI`, `3370005#GI`, `3650001#GI`, `3660001#GI`, `3370003#ag`.
  Nessun movimento di `wip` le nomina, quindi **nessuna maschera le può
  consumare**: la chiusura lavora per ordine, e loro un ordine non ce l'hanno.
- **Il registro racconta male i trasferimenti**: 54 movimenti su 256 sono
  `MOVE` con `delta 0` e saldo invariato, e i `QREL` non portano nessuna
  quantità. La merce si sposta davvero — verificato — ma fra sei anni quel
  registro non si sa rileggere.
- **Un movimento `EDIT` senza merce**: `# MAG-ACC-03`, articolo e lotto
  vuoti.

### La 2.1 è stata provata in browser — 19/08, sera

**Su una copia a caldo del magazzino vero** — 196 giacenze, 132 movimenti,
524 ubicazioni — servita sulla 4199, con Vite sulla 5199 e un operatore di
prova che esiste solo nella copia. In produzione non è stata scritta una
riga: gli operatori sono ancora tre.

- **Il cruscotto**: riordino per trascinamento, spegnimento, larghezza. Il
  layout arriva a `meta/dashboardLayout` e **non porta i titoli**. «Come di
  serie» cancella il dato invece di riscriverlo.
- **La mappa**: zona a scaffale → frontale con «Specchia», selettore dei
  livelli sparito; zona a terra → dall'alto. Col pannello aperto la zona
  centrale rientra di 360px e la pianta arriva a 1024 contro un pannello
  che comincia a 1040: **non si toccano**.
- **Le unità di carico**: tre caselle annidate nello stesso vano, 11×6px,
  strette da sole. Trascinata una da `M03-CAT-20` a `M03-CAT-01`: unità
  spostata, riga al seguito, `MOVE` a registro firmato, e sulla mappa la
  merce sta **in un vano solo** — la trappola della 2.0 regge.
- **La scheda di un item**: l'ordine è quello nuovo, e i cinque pulsanti
  misurano 150×32 tutti e cinque.
- **L'ordinamento**: primo clic crescente, secondo decrescente, **terzo
  torna al cronologico** e la freccia sparisce.
- **Il registro delle attività**: 65 righe, di cui **17 «fuori coda»** —
  campionamenti aperti a mano che prima non comparivano da nessuna parte.
  Sul magazzino vero, non su un caso costruito.
- **L'inventario per unità**, il Code128 in testata (50 barre per
  `DDT-2026-0001`, in millimetri) e il ruolo Admin col suo segno.

**UNA COSA DA SAPERE PRIMA DI PROVARE UN'INTERFACCIA SENZA SCHERMO.** Il
pannello del browser di collaudo **non compone i fotogrammi**, e allora
nessuna transizione avanza: ogni proprietà animata resta al valore di
partenza, per sempre. Misurando così, `padding-right` e `transform` — le
due che la 2.1 mette in transizione — leggono zero, e sembrano due difetti
che non esistono. Mezz'ora buttata. Si spengono le transizioni prima di
misurare:

```js
document.head.insertAdjacentHTML('beforeend',
  '<style>*,*::before,*::after{transition:none!important;animation:none!important}</style>');
```

**Quel che il browser NON ha esercitato**: le maschere che muovono merce
con un operatore vero — smaltimento, quarantena, conta, DDT, reso e
chiusura del conto. Restano la voce 20.

### La 2.0 è costruita, e ha chiuso otto difetti che nessuno aveva visto leggendo

**Il numero di build è `2.0`** e `consegna\Pathfinder 2.0\` esiste: 4 file,
impronta `33e3ae3b…`, **436 kB sul filo**. Non è installata: quello lo fa
Andrea, a fine turno e con un backup davanti.

**Il ciclo di debug del 19/08 non ha letto il codice: l'ha esercitato.** Un
banco headless — `banco/ciclo/` — carica il **client vero** (`Store`, i
moduli, le rotte composte) contro una copia a caldo del magazzino di
produzione, e gli fa fare quello che fa un turno: carico a scaffale con la
suddivisione dichiarata, prelievo di produzione, WIP, reso, chiusura del
conto, e poi UDC, quarantena, campionamento, conta, DDT, smaltimento,
attività, stoccaggio, FEFO, storno, export, conformità. **Quattro ordini
costruiti dall'ODP vero** (`07082026_gluc.xlsx`, quindici componenti,
380,25 kg che sommano esatti).

**Gli otto difetti, e sono tutti dello stesso ceppo**: un saldo scritto sopra
un elenco di colli rimasto indietro — la trappola che la 1.8.4 aveva chiuso
in tre posti e che era rimasta aperta in altri cinque.

1. **Una riga a colli dichiarati si scaricava «a numero».** `esceDaWip`
   chiedeva «togline tre» a `removeItem` senza dire QUALI: il servizio calava
   `qty` e lasciava `packs` e `qty_uom` dov'erano. Al banco: **7 colli → 6,
   elenco fermo a 7 voci, 93,795 KG fermi a 93,795**. Adesso `removeItem`
   **rifiuta** una rimozione parziale su una riga che i colli li dichiara, e
   il rifiuto dice quale riga.
2. **Il reso dal conto di produzione non scriveva le UM.** I colli calavano,
   i chili no: `tornato_uom` restava `null`.
3. **La chiusura del conto non scriveva le UM del consumo.** Su quattro
   ordini, **0 KG consumati su 702 entrati** — cioè «l'unico numero che oggi
   non si può avere», che è il motivo per cui la 1.14 esiste, non arrivava a
   registro.
4. **Il conto contava i colli col calo dello scaffale.** Prelevando 50,7 kg
   da `[25,25,25,18.795]` escono TRE colli — due interi e la parte del terzo
   — ma a scaffale i posti calano di due. Il vano WIP nasceva con tre e il
   conto ne dichiarava due, e l'ordine **non si chiudeva più**.
5. **Dopo `moveUdc` la merce risultava in DUE vani.** Il servizio aveva
   ragione — una transazione sola — ma il client modificava l'ubicazione
   sull'oggetto che la cache già teneva: `indicizzaGiacenza` confronta
   `prev` con `next` per togliere la riga dal bucket vecchio, e passandogli
   lo stesso oggetto due volte non trovava niente da riparare. **Chi sposta
   una riga scrive un oggetto nuovo**, e adesso c'è una prova che lo fissa.
6. **Un'unità di carico svuotata prelevandone l'ultima riga non si chiudeva
   mai.** `chiudiUdcSeVuota` la chiamava solo `assegnaAUdc` — il caso in cui
   una riga viene SCARICATA dal pallet — mentre l'ultima riga esce da
   `removeItem`: prelievo, spedizione, smaltimento, quarantena. Il pallet
   restava contato fra quelli in giro e ancora spostabile senza niente sopra.
7. **Lo storno creava un collo che a scaffale non c'era.** Da `[25,25,6]` si
   prendevano 10 KG e lo storno lasciava `[15,25,6,10]`: il totale tornava —
   56 KG prima, 56 dopo — e l'elenco no. Quattro colli dove lo scaffale ne ha
   tre, e a scoprirlo sarebbe andato chi conta. Adesso l'azione di
   annullamento porta `packs_prima` e lo storno **ridichiara la riga com'era**,
   traducendo la differenza con `rettifica` — la stessa strada dell'inventario.
8. **Due maschere su quattro scrivevano un'azione di annullamento
   incompleta**: `prelievo.ts` senza `packs`, `percorso.ts` senza `packs`
   **e senza `qty_uom`**. C'è una prova che rilegge il sorgente e lo controlla.

**E una regola che valeva solo per metà.** «Il percorso dell'ODP parte dal
magazzino con più prelievi» stava scritta in `sitoDiCasa`, ma la usava solo
l'avviso «articolo in un altro magazzino»: **l'ordine delle tappe lo dava
ancora il solo ordine di visita**, e sull'ODP vero la prima tappa era in
`MAG` per una riga sola mentre le tredici di `M03` venivano dopo. Adesso
`build` e `riordina` mettono casa davanti — `M03 → MAG → MAG1`.

**Il ciclo quadra a zero.** Quattro ordini, 702,594 KG dentro il conto,
702,594 nel vano WIP, e alla chiusura tutto ritrovato fra scaffale, resi e
consumato: **scarto complessivo 0 KG**.

### Gli export dicono le UM — 19/08

**Quattro fogli su cinque parlavano ancora solo di colli.** Il dato c'era da
mesi — `packs`, `qty_uom`, `qty_uom_delta`, `payload.qty_uom` — e non usciva:
chi apriva `giacenze-…​.xlsx` leggeva «7 colli» di un articolo a chili e non
sapeva se erano 35 kg o 175.

- **Giacenze** — **una riga per collo**, dai fogli «Tutte le Giacenze» e da
  quelli per sito: `Collo` (3/11), `UM Collo`, `UM`. Le due somme che chi apre
  il file vuole fare tornano da sole. «Riepilogo» e «Pivot Articoli» guadagnano
  `UM Totali` e `UM`, con **MISTA** dove le unità si mescolano.
- **Registro movimenti** — `Delta UM` e `UM` accanto alle tre colonne in
  colli; «Top Articoli» somma le UM movimentate in valore assoluto.
- **Registro attività** — `UM chieste` e `UM`: un ordine di produzione chiede
  chili, e «44,42 coll.» è un altro numero. Il **fatto** in UM non c'è —
  `qty_done` conta colli — e non si inventa in un export.
- **Allergeni in deroga** e **giacenze fuori posto** — `UM Totali`, `UM` e il
  `Dettaglio Colli` per esteso, letti da `Store.righeLette`. Queste righe
  restano **una per lotto**: una non conformità non si moltiplica per il
  numero di colli, è la stessa merce nello stesso vano sbagliato.
- **Il pacchetto JSON non aveva niente da correggere**: `componi` copia le
  righe intere e non nomina un campo. Adesso c'è una prova che lo fissa — un
  backup che riporta i colli e perde l'elenco delle pezzature ricostruisce un
  magazzino con lo stesso saldo e la corsia sbagliata.

Le due funzioni pure sono uscite in `modules/fogli.ts` — 9 prove — perché una
vista si importa solo passando da `App`. `npm run check` pulito, **725 prove**
in 24 file.

### Gli interruttori non ci sono più

Al 19/08 tutte e sei le funzioni erano accese in produzione da giorni, e
`areaWip` era già configurata su `M06-COM-01`. Un interruttore che nessuno
abbassa più non è una via di ritorno: è un ramo di codice che nessuno percorre
e che nessun collaudo esercita — cioè il posto dove un difetto vive più a
lungo. Tolti da **74 punti in 12 file**: `isFeatureOn`, `setFeature`,
`featureLog`, le cinque guardie `_assert*On`, `colliOn`, `wipOn`, la scheda
«Funzioni», gli attributi `data-feature` e i due rami morti che vivevano solo
a interruttore spento (il campo UM singolo del posizionamento e le tre viste
che disegnavano «questa funzione è spenta»).

**Le chiavi `feature.*` restano scritte in `meta` e non si cancellano** —
nessun dato viene riscritto all'installazione, §6 — ma nessuno le legge più.
La scheda diventa **«Produzione ed etichette»** e tiene i due parametri che
parametri sono sempre stati: l'area WIP e il prefisso GS1. «Regole di
stoccaggio» non compare più a intermittenza.

**Una funzione che dà fastidio adesso si toglie reinstallando il pacchetto di
prima**, che dal 18/08 è comunque l'unica via di ritorno intera.

### I KPI di articoli, movimenti e persone

`modules/kpi.ts`, puro, 32 prove. Nessun campo nuovo, nessuna migrazione:
esce tutto da quello che il database porta già.

- **Le persone.** Ogni movimento porta la sigla di chi l'ha fatto — è la
  firma GMP, tenuta a sei anni — e nessuno l'aveva mai sommata. Movimenti per
  causale, colli e UM mossi, giorni davvero lavorati, le ventiquattro ore,
  compiti presi/chiusi/annullati, e i due tempi che lo schedulatore già scrive:
  quanto un compito resta in coda e quanto ci si mette a farlo, **in mediana**
  — un compito lasciato aperto per il fine settimana sposterebbe una media di
  ore e non direbbe niente su come si lavora.
- **I movimenti.** Per causale, per sito, per ora, per giorno; colli e UM in
  valore assoluto; le rettifiche in percentuale; e due numeri che si vedono
  solo sommando: quanti movimenti **non portano una firma** (oggi: zero) e
  quanti non portano le quantità (12, tutti storici).
- **Gli articoli.** Rotazione, giacenza in colli e UM, giorni fermi, prima
  scadenza, e la **copertura dell'anagrafica sotto la merce che si muove**,
  che è la sola misura di quanto gli altri numeri valgano.

**Quello che oggi NON si può misurare sta scritto nel modulo**, con accanto
il campo che servirebbe: la durata di un singolo movimento, i colli all'ora
per operatore, la distanza percorsa, la saturazione di un vano. Chi cerca un
numero che non trova capisce in dieci secondi se manca la funzione o manca il
dato.

**Cosa hanno detto sul magazzino vero**: quattro sigle firmano movimenti e
**due di quelle quattro non sono in anagrafica operatori** — `DP` con 14
movimenti e `AS` con 2. Fra tre anni quella firma non risponde a un nome.
E **151 articoli su 153 a giacenza non hanno `pieces_per_pack`**, 152 non
hanno allergeni, 151 non hanno la classe di conservazione.

### Cosa il ciclo ha guardato e non ha trovato niente

Quarantena col blocco parziale, campionamento (i colli non calano, il collo
non si svuota, il rifiuto c'è), conta e rettifica su riga a colli dichiarati,
DDT (il documento prenota e non toglie, l'evasione ritrova i colli per
misura), spostamento, smaltimento parziale, attività (residuo sui parziali,
chiusura automatica, nessuna transizione da uno stato chiuso, annullamento
col motivo), motore di stoccaggio (274 ubicazioni in 3 ms, ogni proposta col
perché e ogni escluso col motivo), FEFO, inventario di vano su tre righe in
fila, ramo «Per articolo», export e import del pacchetto.

**La conformità funziona e non ha con cosa lavorare.** Il motore distingue
già l'ignoto — l'esito porta `verificabili` e `articoliSenzaAttributi`
accanto a `nonConformita` — e sulle dodici righe che riesce a guardare trova
tre non conformità vere (LECITINA DI SOIA fuori zona in due vani, una
temperatura) e una deroga. Ma **copre il 6% delle righe**: sul resto non tace
perché va bene, tace perché non ha con cosa confrontare. Una zona su
quattordici porta la classe di conservazione. È §2, voce 5, con un numero
davanti.

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

### La 1.9, la 1.10 e la 1.11 sono scritte, e la 1.12 è cominciata

Il 19/08, in una sessione sola, quattro voci della coda hanno smesso di essere
un elenco. **Nessuna è installata e nessuna è stata costruita in un pacchetto**:
il numero di build resta `1.8.4`, e il perché sta due righe più sotto.

**La 1.9 — le viste giacenza.** Il pannello della mappa dice adesso quanto c'è
in un vano **in colli e in UM**, e i totali si fanno per unità: in un'ubicazione
convivono una riga a KG e una a PZ, e sommarle sarebbe scrivere un numero che
non significa niente. La riga compare solo dove un'unità c'è — un vano a soli
colli ha già il suo numero nel titolo, e ripeterlo non aggiunge niente.

La pagina nuova **non è una pagina**: è il secondo ramo di Inventario, «Per
articolo», e l'INDEX lo prevedeva («se costa meno»). Costa meno davvero, e non
per pigrizia: la conta che ne esce è quella di sempre, riga per riga, con le
sue tre scansioni — cambia solo che alla fine di una parte la successiva. Si
cerca un articolo, si vedono i lotti raggruppati e ordinati FEFO, se ne
spuntano uno o più, e **le righe spuntate diventano un giro di conte**
nell'ordine dello scaffale, non in quello in cui si è spuntato. Il riepilogo si
stampa con intestazione, piede e firma, e **la colonna «Contati» esce vuota**:
un foglio che porta già il numero di sistema non è una verifica, è un
suggerimento — la stessa ragione per cui la maschera della Conta lo nasconde.

**La 1.10 — i trasferimenti generati dall'ODP.** La riga di avviso «articolo in
un altro magazzino» che questo documento dava per esistente **non esisteva**:
il percorso mandava a prelevare nell'altro capannone senza dire niente, e la
richiesta che nessuno ci andasse viveva a voce. Adesso, nell'anteprima del
percorso, ogni tappa il cui sito non è il primo dell'ordine di visita porta il
nome del magazzino in chiaro e un pulsante: nasce un'attività di
**TRASFERIMENTO**, si dichiara in quale ubicazione ricevere la merce, e la
tappa si sposta lì — resta un prelievo, cambia il dove. **La merce non si muove
da qui**: il compito nasce in coda e lo esegue chi lo prende in carico. Il vano
di arrivo risulta vuoto finché non è eseguito, ed è scritto nella maschera.

Le richieste già fatte **sopravvivono alla ricostruzione del percorso**: cambiare
l'ordine di visita dei siti rifà `build` da zero, e senza quella memoria una
tappa già spostata tornerebbe nell'altro magazzino con il compito già in coda —
due volte la stessa merce.

**La 1.11 — il terminale.** La manopola l'aveva lasciata la migrazione a
Tailwind: `--spacing`, e le utility che sono `calc(var(--spacing) * N)`.
Mancava chi la gira. Adesso `modules/dispositivo.ts` guarda la larghezza e
mette una classe sul body, e sotto i 560 px la densità dell'intera interfaccia
si stringe in un colpo — **senza toccare una vista**. Quel che resta sotto sono
le poche misure che una manopola non raggiunge: il bersaglio del dito, che
**non si stringe mai** perché si lavora coi guanti, e ciò che su una striscia
di vetro non ci sta.

**A decidere è la larghezza, non il sistema operativo.** Android si riconosce e
si registra — la 1.11 lo chiede — ma un terminale è tale perché lo schermo è
stretto: la stessa pagina in una finestra da 500 px ha lo stesso problema, e
risolverlo per uno solo dei due casi vorrebbe dire scrivere due volte le stesse
regole. Provata a **533 e a 480 px**: nessun trabocco in orizzontale, pulsanti
a 48 px, `mb-6` che scende da 9,6 a 6,72 px.

**Quel che la 1.11 NON è**: un'interfaccia apposita. Questo documento la dava
per «probabile», ed è una decisione di prodotto che nessuno ha ancora preso:
qui c'è l'adattamento, fatto bene e su una manopola sola.

**La 1.12 — solo il codice dell'UDC.** `modules/udc.ts` genera il codice che
finisce sull'etichetta: interno finché il prefisso GS1 in Configurazione è
vuoto, **SSCC vero** appena qualcuno lo compila, con la cifra di controllo
modulo 10. Sta da solo e si collauda da fermo perché **un'etichetta dura**: si
stampa una volta e resta incollata al legno per mesi, e se il modo di generarla
dipendesse da Store o dallo schermo non ci sarebbe modo di provarla se non
stampandola. **Un seriale che non ci sta più non si accorcia: si rifiuta** — un
codice più corto è un codice che un altro pallet ha già avuto. Il resto
dell'UDC — nascere, riempirsi, morire, la rotta composta `moveUdc` — **non è
cominciato**, e tocca lo schema.

**Il difetto trovato passando, e corretto**: il piede di **ogni foglio
stampato** — DDT, verbali, cartellini, report — diceva «Pathfinder 1.7» mentre
in servizio girava la 1.8.3. Era scritto a mano in `_docPageHTML`; adesso lo
porta `VERSIONE_APP`. Su carta che va in audit un numero di versione sbagliato
è un difetto, non un dettaglio.

### La 1.14 è costruita, e la coda delle versioni è finita

Il numero di build è **1.14** e `consegna\Pathfinder 1.14\` esiste: **4 file,
1,63 MB, 437 kB sul filo**, impronta `86d1e7e1…`. Provato servendo il pacchetto
vero al banco: `/api/app-info` dice `service_version 1.14` **e** `versione
1.14`, e dentro ci sono davvero il riquadro del motore e la scheda del conto di
produzione. Non è `npm run dev`: sono i byte che si installano.

**Le sei versioni della coda sono scritte.** Restano da fare due cose che il
codice non può fare da solo: provarle in magazzino, e accendere gli
interruttori un turno per volta.

### La 1.13 e la 1.14 sono cablate, e non solo scritte

**La 1.13 — il motore propone, la persona decide.** Nel posizionamento, dopo
articolo e lotto, compare un riquadro: l'ubicazione proposta e il **perché** di
quella scelta. Si accetta con un tasto; si può aprire l'elenco delle altre e
quello degli **esclusi col motivo**. Se il vano già digitato viola un vincolo
il riquadro lo dice in rosso, e **non impedisce niente**: chi ha la merce in
mano vede cose che il sistema non sa, e scavalcando scrive il motivo — che
finisce nel movimento e resta a registro. È l'unico dato che fra tre mesi dirà
se le regole valgono o se le si scavalca tutte allo stesso modo.

**Misurato al banco su dati veri: 274 ubicazioni valutate in 2 millisecondi**,
mentre qualcuno scansiona. Le regole si scrivono nella scheda «Regole di
stoccaggio», che compare con l'interruttore.

**La 1.14 — la merce non sparisce, va nel conto dell'ordine.** Il prelievo di
produzione porta la merce nell'ubicazione WIP invece di farla uscire dal
magazzino, e la scheda «Conto produzione» in Prelievo mostra per ogni ordine
quanto è entrato, quanto è tornato, quanto è ancora fuori. Da lì si rende
quello che avanza e si **chiude il conto** — ed è la chiusura a dichiarare il
residuo **consumato**.

**Il ciclo intero, provato al banco**: prelievo di 5 colli dal vano 89 → il
vano scende a 84 e il conto dice «entrato 5, in lavorazione 5»; reso di 2 → il
vano risale a 86 e il conto dice «reso 2, resta 3»; chiusura → «reso 2 ·
consumato 3 · in lavorazione 0», e il vano WIP resta vuoto. **89 − 5 + 2 = 86**:
i numeri quadrano.

**Se il conto non riesce, il prelievo NON si annulla.** La merce è già fuori
dallo scaffale, e rimetterla dentro per un problema di contabilità sarebbe
muovere merce vera per un numero: si dice, e la riga resta a registro.

### I quattro difetti che il cablaggio ha fatto uscire

1. **«Tornato» e «consumato» erano la stessa cosa.** Alla prima chiusura al
   banco il conto diceva «tornato 1» per merce che a magazzino non era tornata
   affatto. Il saldo era giusto e la parola era falsa — e quella parola la
   legge chi cerca il consumo di un ordine fra sei mesi. Adesso i versi sono
   tre: `in`, `out`, `consumo`.
2. **Un vano WIP per ordine non sta in piedi.** `WIP-ODP2603889` avrebbe
   preteso di mappare un'ubicazione nuova a ogni ordine: al banco il controllo
   sull'area passava e la merce sarebbe finita in un vano che nessuno aveva
   disegnato. **L'area WIP è UNA ubicazione mappata**, e a tenere distinti i
   conti sono le righe, che portano l'ordine. `wip.ubicazioneDi` resta nel
   modulo — la regola torna giusta il giorno in cui i vani per ordine si
   generano dalla configurazione della zona.
3. **«Prefisso o codice esatto» non si indovina.** La maschera delle regole
   deduceva il tipo dal fatto che il valore esistesse in anagrafica: «6000366»
   è un codice vero **e** il prefisso di «6000366B», e indovinando si sceglieva
   sempre il primo — la regola non copriva l'articolo che si voleva. Chi voleva
   il prefisso non aveva modo di dirlo. Adesso la scelta è una tendina.
4. **`_formOrdine` non aveva la guardia `if (!el) return`** che hanno tutte le
   altre maschere — vedi §5.

### La 1.12 chiude le unità di carico, e la 1.13 e la 1.14 hanno il motore

**La 1.12 — le unità di carico.** `inventory.udc_id` e la collezione `udc`
esistevano dalla 1.4, vuote: **nessuna migrazione di schema**, ed è la ragione
per cui questa versione si è potuta costruire in una sessione. Un'unità nasce
su comando in un vano, ci si carica sopra le righe di quel vano, e si sposta
intera — `/api/op/moveUdc`, **una transazione**: l'unità e le sue righe
cambiano ubicazione insieme, o non cambia niente.

**Muore da sola.** Non c'è nessun pulsante «elimina»: quando esce l'ultima
riga il contenitore si chiude, sparisce dall'elenco, e il record resta come
storia. **Il codice non si riusa mai** — provato al banco: chiusa la
`UDC-000001`, la successiva è nata `UDC-000002`.

**Due forme di etichetta, una scelta sola.** Il prefisso GS1 è un parametro in
Configurazione → Funzioni: vuoto, i codici sono interni; compilato, sono
**SSCC** a 18 cifre con la cifra di controllo. Provato al banco compilando
`0712345`: è uscito `007123450000000033`, e la somma pesata chiude a multiplo
di dieci — il conto rifatto nel browser, non chiesto al modulo che lo scrive.
Le due forme **convivono**: un'etichetta stampata non si riscrive.

**Il difetto peggiore l'ha trovato la prima prova.** Spostando un'unità in un
vano dove lo stesso lotto stava già **fuori** dall'unità nascevano due righe
con la stessa chiave nello stesso vano. L'indice `[location_code+item_key]` è
di ricerca e **non è unico**: il database le accettava senza dire niente, e il
client — che cerca con `find` — ne avrebbe letta **una**, quale a seconda
dell'ordine di caricamento. Un saldo che cambia da solo. Adesso si rifiuta, e
il rifiuto dice quale lotto è di mezzo. Non si fondono: unire una riga che sta
su un pallet con una sciolta vuol dire decidere al posto di chi lavora.

**La 1.13 — il motore di stoccaggio.** `modules/stoccaggio.ts`: prima i
vincoli **duri** — stato del vano, regola che impone, temperatura, allergeni,
capienza — e chi non li passa **esce**, senza punteggio che lo recuperi; poi
un **punteggio** sui morbidi, che ordina e basta. Le regole sono un dato:
«`article_code` inizia per 700 → MAG2» è un record di `storage_rules` con
`modo: impone` o `preferisce`. Ogni proposta porta i suoi **perché**, ogni
escluso il suo motivo, e `scavalco()` compone la riga da registrare quando
l'operatore sceglie un altro vano. **La maschera di posizionamento non lo
interroga ancora**: l'interruttore resta `pronta: false`, e acceso oggi non
cambierebbe niente a video.

**La 1.14 — il conto di produzione.** `modules/wip.ts` tiene il conto per
ordine: quanto è entrato in lavorazione, quanto è tornato, quanto resta. **Il
consumo si dichiara a ordine CHIUSO**, e `consumo()` restituisce `null`
finché è aperto — il residuo di un ordine in corso è merce ancora sul bancone,
e chiamarlo consumo scriverebbe un numero che alle sette di sera è sempre
sbagliato. Un reso più grande dell'entrata **si mostra** invece di essere
nascosto. Anche qui il cablaggio nel prelievo guidato non c'è: si installa
spenta, e si accende a gennaio.

### La sera del 19/08 — quattro difetti trovati provando, non leggendo

1. **Il piede di OGNI foglio stampato diceva «Pathfinder 1.7»** mentre girava
   la 1.8.3. Era scritto a mano in `_docPageHTML`; adesso lo porta
   `VERSIONE_APP`. Su carta che va in audit è un difetto, non un dettaglio.
2. **L'ODP 2603889 chiedeva 260.594 KG di VITAMINA A** — il numero di lotto
   letto come quantità, al posto di 0,315 kg, su una miscela da 380 kg in
   tutto. Finché Sage esportava i lotti come **testo** il primo numero della
   riga era davvero la quantità; un lotto tutto cifre esce **numerico**. Il
   percorso si costruiva lo stesso: la tappa c'era, ed era il numero a essere
   assurdo. Adesso la colonna del lotto si salta.
3. **`_formOrdine` non aveva la guardia `if (!el) return`** che hanno tutte le
   altre maschere: usciti dal ramo «Da ordine», `$('pickSubForm')` è null e
   saltava un TypeError che a video sembrava un errore di lettura del file.
   Visto due volte nella stessa sera.
4. **Il compito di trasferimento diceva «44.42 coll.»** per 44,42 **KG**: un
   ordine di produzione chiede chili, e il payload portava quel numero sotto
   il nome dei colli. Adesso porta `qty_uom` e `uom`, e la coda li scrive con
   la loro unità. I compiti già in coda restano come sono: è il dato che è
   stato scritto allora.

**E una regola che il codice aveva indovinato male.** «Il percorso dell'ODP
parte sempre dal magazzino con più prelievi» — detta da Andrea il 19/08. Il
codice prendeva il primo dell'ordine di visita: sull'ODP vero era `MAG`, dove
quell'ordine non ha una riga, e **tutte e dieci** le tappe risultavano «in un
altro magazzino». Vero, e inutile. Con la regola giusta casa è M03, con sette
tappe, e le tre di MAG1 sono quelle da farsi portare.

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
| Interruttori | **NON CI SONO PIU'** — 2.0. Al 19/08 erano accesi tutti e sei in produzione e `areaWip` era gia' `M06-COM-01`: un interruttore che nessuno abbassa non e' una via di ritorno. Le chiavi `feature.*` restano scritte in `meta` e nessuno le legge. Si torna indietro reinstallando il pacchetto di prima |
| Collaudi | **716 client** (23 suite, ~2 s) · **96 servizio** · **22 installazione** · **8 migrazione** · **47 passi del ciclo al banco** (`banco/ciclo/`, 7 file, contro una copia del magazzino vero). Tutti verdi. Le 43 prove nuove sono `kpi` (32), `colliFuori` in `wip` (8) e l'aliasing della cache in `cache` (3) — ognuna nata da un difetto trovato provando |
| Tipi | `npm run check` a 0 su client e servizio, con `strict` e `noUncheckedIndexedAccess` accesi su **tutto** il sorgente: `allowJs` è spento dal 18/08 |
| Sorgente | **73 TypeScript** — il nuovo e' `modules/kpi.ts` — · **zero JavaScript** · **10 CSS** · `index.html`. I **sei** moduli nati il 19/08 — `giacenzaArticolo`, `trasferimentiOdp`, `dispositivo`, `udc`, `stoccaggio`, `wip` — sono tutti **puri**: nessuno tocca Store, nessuno tocca il DOM, tutti si collaudano da fermo. Le due viste nuove sono `udc.ts` e il ramo «Per articolo» dentro `inventario.ts` |
| Numero di build | **2.0** in `vite.config.js`, `package.json`, `VERSIONE_APP` e nel servizio. Il pacchetto `consegna\Pathfinder 2.0\` esiste: impronta `33e3ae3b…`, **1.708.669 byte**, 4 file, **436 kB sul filo**. `FORMATO` resta `warehouse-mapper-v1.5`: descrive la forma del file, non con cosa e' stato scritto |
| Git | `main`, **in pari con `origin/main`** dal 19/08. Com'era prima: `origin/main` indietro di dieci commit — l'intero blocco della **1.8.4**, committato in locale e mai spinto, mentre la riga qui diceva «allineato» — e sopra, tutto nell'albero e senza un commit, il lavoro dalla **1.9 alla 1.14** e poi la **2.0**. Sul remoto c'erano anche due caricamenti dal browser che avevano scritto l'INDEX della 1.8.4 **senza il codice della 1.8.4**: risolti con una fusione, §5. Il repository non ospita `banco/ciclo/ricetta.js`, `verbale.md` e `difetti.json` — sono dato, e la ricetta si rifà con `node banco/ciclo/rifai-ricetta.cjs` |

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
| ~~10~~ | ~~**Cablare il motore di stoccaggio**~~ — **fatto il 19/08**: riquadro nel posizionamento, esclusi col motivo, scavalco a registro, scheda delle regole. `storage_rules` resta **vuota**: le prime regole le scrive Andrea, e finche' non ci sono valgono i quattro vincoli | fatto |
| ~~11~~ | ~~**Cablare il conto WIP**~~ — **fatto il 19/08**: il prelievo di produzione porta la merce nel vano WIP, la scheda mostra il conto, la chiusura dichiara il consumo | fatto |
| **15** | **Configurare l'area WIP** prima di accendere `wip`: e' **un'ubicazione mappata**, non un prefisso. Senza, il prelievo di produzione non ha dove portare la merce e lo dice | Andrea |
| **16** | **Scrivere le prime regole di stoccaggio**, se servono. Senza regole il motore lavora sui soli vincoli — allergeni, temperatura, stato del vano, capienza — e propone gia' qualcosa di sensato | Andrea |
| **17** | **La capienza dei vani non e' dichiarata da nessuna parte.** Il motore la userebbe — il vincolo c'e' ed e' collaudato — ma nessuna zona la porta, quindi non esclude mai per pieno. Va aggiunta alla configurazione della zona il giorno che serve | da costruire |
| **12** | **Provare le unita' di carico in magazzino, con un pallet vero.** Al banco funzionano — creazione, carico, spostamento, chiusura automatica, etichetta — ma nessuno le ha ancora usate con il muletto in mano. `feature.udc` e' **spento** in produzione | Andrea |
| **13** | **Decidere il prefisso GS1**, o lasciarlo vuoto. Vuoto: codici interni, che bastano dentro l'azienda. Compilato: SSCC veri, che un cliente legge — e allora serve il prefisso assegnato dal consorzio. Si cambia in Configurazione → Funzioni, e vale solo per le etichette nuove | Andrea |
| ~~**14**~~ | ~~**`updated_at` contro `last_updated_at`** sulle giacenze~~ — **chiusa il 20/08, codice e dato.** Le tre rotte che scrivevano il campo sbagliato (`removeItem`, `sampleItem` in due rami, `commitPickStop`) adesso scrivono `last_updated_at` come `moveUdc`, e **due prove nuove nel collaudo del servizio guardano la riga scritta invece della risposta** — era l'unico posto da cui il difetto si vedeva. Le **tredici** righe già storte sono raddrizzate in produzione dopo una copia: zero su 199 portano ancora `updated_at`, e dodici su tredici hanno tenuto la data di `updated_at` perché era **la più recente delle due**. Vedi §1 | fatto |
| **18** | **Due sigle firmano movimenti e non sono in anagrafica operatori** — `DP` (14 movimenti) e `AS` (2). Il registro si tiene sei anni e la domanda che ci si fa fra tre e' «chi»: una sigla senza un nome dietro non risponde. O sono operatori cancellati, o sigle digitate a mano. Trovato dai KPI del 19/08 | Andrea |
| **19** | **`6001055` MANGANESE SOLFATO: l'ODP lo chiede in KG, l'anagrafica lo dichiara PZ.** Il magazzino conta pezzi dove la produzione pesa chili, e nessuna delle due parti se ne accorge. E' un dato, non un difetto — ma va raddrizzato prima che qualcuno prelevi quella riga | Andrea |
| **20** | **Provare le maschere che pretendono l'identita', col PIN.** Il banco del 19/08 ha esercitato la catena intera senza browser, e il browser ha confermato che la 2.0 si carica pulita a 480 px. Quello che resta fuori sono le maschere che chiedono un operatore identificato — smaltimento, trasferimento, prelievo, quarantena, conta, DDT, reso e chiusura del conto: **un minuto a maschera, e il PIN lo digita Andrea** | Andrea, prima di installare |
| ~~9~~ | ~~**Confermare due scelte del 12/08**~~: **confermate il 18/08**. La colonna UM è `unit`, la quantità per collo è `pieces_per_pack` — è già così in `configurazione()` | fatto |
| ~~21~~ | ~~**Provare la 2.1 in browser**~~ — **fatto il 19/08 sera**, al banco sulla 4199 con una copia a caldo del magazzino vero: cruscotto, mappa, UDC trascinate, ordinamenti, registro attività, inventario per unità, Code128. §1. Restano fuori le maschere che pretendono un operatore vero — voce 20 | fatto |
| **22** | **Il difetto delle regole di stoccaggio va riprodotto.** «L'ubicazione non soddisfa i criteri anche quando la regola è definita correttamente»: i due difetti chiusi con la 2.1 sono altra cosa. Serve la regola esatta, il vano e il messaggio a video | Andrea |
| **23** | **Leggere un'etichetta col lettore vero.** `modules/code128.ts` è collaudato sulle due invarianti dello standard — 11 moduli per simbolo, somma delle barre pari — che una cifra storta nella tabella rompe subito. Ma nessun lettore ottico ha ancora letto un foglio stampato da questo codice, e finché non succede il barcode è una promessa | Andrea, un minuto |
| **24** | **Decidere se le etichette escono dal cancello.** Quello che questo applicativo stampa è **Code128, non GS1-128**: manca l'FNC1 e l'identificativo `(00)`. Dentro l'azienda si scansiona e si ritrova il documento, ed è tutto quello che serve. Il giorno che un cliente deve leggere un SSCC, `modules/code128.ts` va esteso — non aggirato | da decidere |
| **25** | **La vista 3D della mappa: valutata, e per adesso no.** Le ubicazioni non hanno coordinate — `core/geometria.ts` le genera da corsie, campate e livelli — quindi una vista 3D sarebbe un rendering della stessa griglia con la prospettiva in più: costo alto, informazione zero. Diventa sensata il giorno che i vani porteranno misure vere e la capienza (voce 17). **La vista frontale con «Specchia» copre quello che serviva davvero**: vedere la corsia com'è, dal verso in cui la si percorre | valutato, non si fa |
| ~~**27**~~ | ~~**ERRORE GRAVE SULL'EXPORT DELLE GIACENZE.**~~ **Chiuso, e lo era già — verificato il 20/08.** Il difetto era il foglio che moriva con «too many properties to enumerate»: dalla 2.0 l'export dà una riga per collo, e da quel giorno un `qty` sbagliato ha smesso di essere una cella storta ed è diventato un'allocazione. Una giacenza portava 3.501.794 al posto dei colli e **il magazzino intero non si esportava più**. Lo regge `distendiGiacenze` in `src/modules/fogli.ts`: il conto è di TUTTE le righe insieme, il file esce lo stesso, e la riga che non ci sta lo dice scritto in cella. **Il dato è rientrato**: quella riga oggi porta `qty` 350 | fatto |
| **28** | **Il campionamento non sa prendere un collo intero.** Il CQ a volte ha bisogno di tutto il collo, e la rotta si rifiuta: «un campione lascia sempre un residuo». È una regola di §6, e cambiarla è una decisione di Andrea — che l'ha chiesta il 20/08. Va deciso **cosa diventa** quel movimento: se resta `SAMPLE` la promessa «i colli non calano, mai» cade e il logbook della qualità cambia significato; se diventa un prelievo, il CQ deve saperlo | da decidere |
| ~~**29**~~ | ~~**L'ODP chiuso va archiviato**~~ — Andrea, 20/08: «una volta chiuso l'ODP con quello che rientra da WIP, l'ordine è archiviato». **Fatto il 20/08, e per metà c'era già**: la chiusura era già un movimento con la sua data e la sua firma, e un ordine archiviato era già fuori da `ordiniWipAperti`, rifiutato da `entraInWip` e da `esceDaWip`, e stampato «chiuso — consuntivo» invece che «PROVVISORIO». Mancava **l'elenco da sfogliare**: l'archivio esisteva ma si apriva solo digitando a memoria il numero, e il consuntivo di una lavorazione si guarda mesi dopo. Ora c'è — `ordiniArchiviati()`, §1 | fatto |
| ~~**30**~~ | ~~**Le sei righe orfane nel vano WIP.**~~ **Chiusa il 20/08, in due pezzi.** *Il dato*: quelle sei righe non sono più nel vano WIP — stanno in `M06-COM-01`, dove sono merce normale che qualunque maschera consuma. La premessa «nessuna maschera le può consumare» non vale più. *Il buco*: quello valeva ancora, e adesso c'è la difesa — `righeSenzaOrdine()` e il riquadro nel conto produzione, §1. Si ripresenta ogni volta che qualcuno posiziona a mano nel vano | fatto |
| ~~**31**~~ | ~~**Le due righe di magazzino storte**~~ — **il saldo torna, misurato il 20/08.** `6000366B#123456` in `MAG-SCA-01-03-B` faceva elenco 101 contro saldo 81: adesso 3 colli, elenco e `qty_uom` tutti e due a 27. `7000924#123456` in `MAG-SPC-01`: 6 colli, tutti e due a 150. **E non è un caso isolato che si è sistemato**: su tutte e quindici le righe a colli dichiarati del magazzino, zero hanno l'elenco che non torna col saldo o col numero di colli. Resta vero il fatto storico — il collo di `MAG-SPC-01` comparve senza un movimento che lo spiegasse, il 19/08 — ma è una domanda sul registro, non una riga da raddrizzare | fatto |
| **26** | **Decidere se Azure si accende.** Il ramo `server/azure/` è pronto e non lo chiama nessuno. I quattro punti che decidono stanno in `server/azure/LEGGIMI.md`, e il primo è che il magazzino si fermerebbe quando cade la linea | Andrea |
| **32** | **Installare la 2.2 e vedere i due numeri coincidere.** Il pacchetto è in `consegna/Pathfinder 2.2/`, impronta `3945a5de…`. Prima di installare restano le maschere col PIN — voce 20 — e vale la trappola di §5: **installare non è accendere** | Andrea |
| **33** | **Il registro racconta male i trasferimenti** — §1, trovato dal guardiano il 20/08: **54 movimenti su 256 sono `MOVE` con `delta 0`** e saldo invariato, e i `QREL` non portano nessuna quantità. La merce si sposta davvero, verificato. Ma il registro si tiene **sei anni**, e la domanda che ci si fa fra tre è «quanto»: un movimento che non porta la quantità a quella domanda non risponde. Non è un difetto che si vede lavorando, ed è il motivo per cui va scritto qui | da costruire |
| **34** | **Un movimento `EDIT` senza merce** — `# MAG-ACC-03`, articolo e lotto vuoti. Uno solo su 256, trovato dal guardiano il 20/08 | da chiarire |
| **36** | **Installare la 2.3 e vedere i due numeri coincidere.** Il pacchetto è in `consegna/Pathfinder 2.3/`, impronta `367d977e…`. Restano prima le maschere col PIN — voce 20: **nessuna maschera della 2.3 è stata provata con un operatore identificato vero**, al banco l'identità è stata messa a mano come fa `banco/ciclo/banco.js`. Vale la trappola di §5 | Andrea |
| **37** | **Il vano WIP di produzione è `M06-COM-01`, quello del banco `MAG1-WIP-01`.** La 2.3 esclude il vano dalle ubicazioni in cui il percorso manda a prelevare: è giusto solo se l'area configurata è quella vera. Si controlla in Configurazione → Funzioni **prima** di installare | Andrea |
| **38** | **Le righe già nel vano al momento dell'installazione non hanno misure a conto.** `quoteVano` le legge dai `packs` dell'inventario e dai `colliFuori` di ogni ordine: dove i movimenti non portano i colli — tutto quel che è entrato prima della 2.0 — la riga finisce fra quelle «senza misure dichiarate» e si lavora a numero. Non è un difetto: è la stessa condizione della voce 6 | da chiarire |
| **39** | **L'ATTIVITÀ PIANIFICATA PUNTA AL REPOSITORY — e c'è il comando che la sistema.** Da PowerShell **come amministratore**: `& 'C:\Pathfinder\servizio\installa-servizio.ps1' -Porta 4173 -Database 'C:\Pathfinder\data\pathfinder.db' -CartellaBackup 'C:\Pathfinder\backup' -CartellaApplicativo 'C:\Pathfinder\app\corrente'`. Lo script disinstalla l'attività e la ri-registra con `$Qui` = la cartella da cui viene lanciato: lanciandolo da `C:\Pathfinder\servizio` l'attività punterà finalmente lì. Il magazzino resta giù i secondi del riavvio, il database non si tocca. Poi `/api/app-info` deve dire **2.2 due volte**. §1 | Andrea, a magazzino fermo |
| **40** | **`PATHFINDER_APP` punta ancora a `MAPPER\pathfinder-1.6.1.html`** — un secondo filo fra la produzione e la cartella di lavoro, residuo del modo «file singolo». Oggi non serve a niente: `/api/app-info` dice `modo: cartella` e comanda `PATHFINDER_APP_DIR`, che è `C:\Pathfinder\app\corrente`. Va svuotata il giorno che si tocca il servizio, non prima: `installa-servizio.ps1` senza `-Applicativo` la lascia com'è apposta | da chiarire |
| **35** | **La 2.1 è in servizio da un pacchetto che nessun documento nominava.** L'impronta in produzione (`7cd16b50…`, costruita il 20/08 alle 08:31) non è quella che l'INDEX dichiarava (`29f215e1…`). È la **terza volta in quattro giorni** che il documento dice dove gira la produzione e la produzione gira altrove. Non è una riga da correggere: è il motivo per cui §0 punto 2 esiste, e va riletto da chi apre una conversazione nuova | letto, non si chiude |

**Quanto pesano le due voci qui sopra, misurato il 19/08.** La voce 5 (zone
da caratterizzare) e la voce 6 (`pieces_per_pack`) non sono due righe di
manutenzione: sono il motivo per cui **la verifica di conformità copre il 6%
delle righe a scaffale** — 12 su 194 — e per cui **151 articoli su 153 a
giacenza non hanno una quantità per collo**. Su tutto il resto la mappa non
tace perché va bene: tace perché non ha con cosa confrontare, e chi la guarda
vede un verde che non significa niente.

### Le versioni da costruire

Scadenza del progetto **31/12/2026**, ultima installazione utile **19/12** — poi
c'è l'inventario. La numerazione è **progressiva**: una build definitiva porta
**due numeri** (`1.8`), una di prova ne porta di più (`1.8.1`).

| Versione | Cosa |
|---|---|
| **2.3** | **Il reparto, e il giro conto.** Un collo nel vano di lavorazione appartiene a **più ordini per quote**: il conto passa da uno all'altro senza che la merce si muova, il fabbisogno di una tappa si sconta di quel che il reparto ha già in mano, il vano è una lista piatta di colli e non più il conto di un ordine, e un percorso può portare **più ODP insieme**. **Costruita il 25/08, non installata** — §1 |
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
| ~~**1.9**~~ | **Viste giacenza — scritta il 19/08.** Il pannello della mappa dice colli e UM; il resto e' il ramo «Per articolo» di Inventario, con il giro di conte e il riepilogo stampabile. §1. **Non installata, non impacchettata.** Originale: Selezionando un'ubicazione dalla mappa, il pannello a destra mostra la giacenza **in colli e in UM**. Più una pagina nuova: si cerca un articolo, si vedono tutti i lotti, se ne selezionano uno o più e si **apre la conta su tutti insieme**; PDF con intestazioni, piè di pagina e la lista dei lotti con ubicazione e quantità. Se costa meno, può diventare un ramo di Inventario |
| ~~**1.10**~~ | **Trasferimenti dall'ODP — scritta il 19/08.** La riga d'avviso non esisteva: adesso e' la tappa fuori sito nell'anteprima del percorso. §1. **Non installata.** Originale: Sulla riga di avviso «articolo in un altro magazzino» — che già c'è — compare una spunta: genera un'**attività di trasferimento** nello schedulatore, il sistema **chiede in quale ubicazione** ricevere la merce, e **quell'ubicazione entra nel percorso come tappa di prelievo** |
| ~~**1.11**~~ | **Il terminale — scritta il 19/08**, come adattamento su `--spacing`, non come interfaccia apposita: quella resta da decidere. §1. **Non installata.** Originale: Il sistema riconosce se gira su Android e ridimensiona. Probabilmente serve **un'interfaccia apposita**, non un adattamento |
| ~~**1.12**~~ | **UDC — FATTA il 19/08**, e senza toccare lo schema: la collezione c'era gia' vuota dalla 1.4. Modulo del codice, Store, rotta composta `moveUdc`, maschera, etichetta 100x80. §1. **Costruita nel pacchetto 1.12, non installata.** Originale: contenitori che stanno in un'ubicazione e portano la merce con sé. `inventory.udc_id` esiste già, vuoto. Nasce su comando, **muore quando è vuota** (svuotamento automatico, creazione no), il record resta come storia e `udc_id` non si riusa mai. **L'etichetta si stampa alla creazione**, `100 × 80 mm` su A4 dal browser. Il prefisso GS1 è un **parametro di Configurazione**: vuoto → codice interno, compilato → SSCC. Lo spostamento passa da una rotta composta `moveUdc`, in **una** transazione |
| ~~**1.13**~~ | **Motore di stoccaggio — FATTO il 19/08**, motore e faccia: riquadro nel posizionamento, elenco degli esclusi col motivo, scavalco a registro, scheda delle regole. 274 ubicazioni in 2 ms. §1. **Non installata.** Originale: dice dove mettere la merce. Funzione pura come `pickRoute`. Vincoli **duri** (sito imposto, segregazione allergeni, temperatura, capienza) e poi un **punteggio** sui morbidi. Le regole sono **un dato** in `storage_rules`, non codice: «`article_code` inizia per 700 → `MAG2`» è un record. Ogni proposta **dice perché**, e lo scavalco si registra col motivo |
| ~~**1.14**~~ | **Conto di produzione — FATTO il 19/08**: il prelievo porta la merce nel vano WIP, la scheda «Conto produzione» mostra entrato/reso/consumato, e la chiusura dichiara il consumo. Ciclo provato al banco. §1. **Non installata, e si accende a gennaio.** Originale: il prelievo per ODP finisce in un'ubicazione WIP invece di sparire; ciò che entra e non torna **è il consumo reale di produzione**. È l'unica funzione che cambia il significato di un movimento esistente: a `feature.wip` spento, `PICK` resta quello di sempre. Si installa il 19/12 **spento** e si accende a gennaio |

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

- ~~**Due difetti trovati dal compilatore e NON corretti**~~ — **corretti
  tutti e due il 20/08, con la 2.2.** Erano rimasti indietro perché
  correggere durante un trasloco è il modo di romperlo, ed è stata la scelta
  giusta: fuori dal trasloco sono costati due righe.
  - **La data delle copie locali era sempre vuota** (`app.ts`, tabella «Copie
    locali disponibili»): stampava `b.modified`, ma `listBackups` restituisce
    `lastModified`. La colonna mostrava «—» su ogni riga, e nessuno se n'era
    accorto perché non è un errore, è un trattino. **A nascondere il nome
    sbagliato era un cast**, tolto insieme al difetto.
  - **Un articolo senza descrizione scriveva «undefined»** nel campo
    descrizione di giacenza (`giacenze.ts`, `posiziona.ts`, `inventario.ts`):
    `.value` di un `undefined` diventa la stringa, e da lì finiva sulla riga
    e in ogni export che la rilegge. Cinque `as string` che non convertivano
    niente — dicevano al compilatore di non guardare — sostituiti da `?? ''`.
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
npm test         # vitest, 28 suite, 811 prove
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

- **I TRE POSTI DEL NUMERO DI VERSIONE, E `package.json` NON È NESSUNO DEI
  TRE — 19/08.** Alzare `package.json` a `2.1.0` non sposta niente: la
  build non lo legge. I posti veri sono

  1. **`VERSIONE` in `vite.config.js`** — il nome della cartella di
     consegna e il numero scritto in pagina;
  2. **`VERSION` in `pathfinder-server.js`** — quello che `/api/app-info`
     risponde come `service_version`;
  3. **`VERSIONE_APP` in `core/pacchetto.ts`** — il timbro dentro ogni
     export e nel piede di ogni documento stampato.

  La prima build della 2.1 è uscita chiamandosi **«Pathfinder 2.0» con
  dentro i byte della 2.1**, perché il primo era rimasto indietro: un
  pacchetto che, installato, avrebbe riscritto `pathfinder-2.0` nel
  deposito con byte che non sono la 2.0 — cioè avrebbe fatto sparire la
  via di ritorno lasciandone il nome. Cartella cancellata e ricostruita.

  Il secondo ha una guardia che il primo non ha: l'installer **rifiuta**
  un pacchetto il cui servizio dichiara un numero diverso da quello
  dell'applicativo, e lo dice con un messaggio che parla di riavvii — che
  è la causa più comune, ma non l'unica. Il commento che diceva «si muove
  quando cambia il contratto» era vero fino al 17/08 e falso dal 18, da
  quando applicativo e servizio si installano insieme: adesso quel numero
  si muove a ogni versione, contratto o no.

  **Chi rilascia li cambia tutti e tre**, e la prova che sono in pari è
  l'installer stesso, in fondo.
- **CARICARE FILE DALL'INTERFACCIA WEB DI GITHUB SCRIVE UN ALBERO CHE NON
  ESISTE.** Il 19/08, alle 00:31 e alle 00:32, `INDEX.md`, `package.json` e
  `vite.config.js` sono finiti su `origin/main` caricati a mano dal browser,
  allo stato della 1.8.4 — **sopra un albero che alla 1.8.4 non c'era ancora
  arrivato**, perché i dieci commit veri erano in locale e non erano mai
  stati spinti. Il risultato: il remoto **dichiarava build 1.8.4 e non aveva
  `src/modules/documenti.ts`**, che della 1.8.4 è il pezzo centrale — la riga
  di documento ricostruita in un posto solo. Mancava anche il suo collaudo.
  Chi avesse clonato avrebbe avuto un applicativo che diceva un numero e ne
  conteneva un altro, e i colli scelti sarebbero tornati a sparire al
  salvataggio.

  **Un caricamento dal browser non è un commit: è un commit su una base che
  non si è scelta.** Git non se ne accorge, perché dal suo punto di vista è
  una modifica come un'altra. Si è risolto con una **fusione**, tenendo il
  locale sui tre file — il contenuto caricato era identico byte per byte al
  nostro `779f2c1`, verificato file per file, quindi non si è perso niente e
  non si è forzato niente. **Il codice si spinge con `git push`**, e se il
  push viene rifiutato si guarda cosa c'è dall'altra parte prima di
  insistere.

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
- **I FINE RIGA NON SONO UNIFORMI, E UNO SCRIPT CHE LO IGNORA NON TROVA
  NIENTE — 2.2.** `quarantena.ts` è LF, `spedizioni.ts` è misto, quasi tutto
  il resto è CRLF. Uno script che cerca un blocco di due righe convertendo a
  CRLF non lo trova nei file LF: l'errore è «zero occorrenze», che somiglia a
  «quel codice non c'è più» e manda a cercare la cosa sbagliata. Chi modifica
  un file da uno script **legge il terminatore dal file** e usa quello.
- **Un movimento di merce dichiara anche le quantità — 2.2.** Le tredici
  posizioni di `_logMov` arrivano fino alle UM: colli prima, delta, dopo, e la
  variazione in unità di misura. Una riga che dice solo la nota racconta che è
  successo qualcosa, non cosa — a un controllo non serve. Le tre causali che
  non muovono merce (modifica dati, purga, rinnovo PIN) restano fuori: lì una
  quantità sarebbe inventata. Lo tiene `test/registro-completo.test.js`, che
  legge tutte le chiamate nel sorgente.
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

- **UNA COSTRUZIONE «PER VEDERE SE COMPILA» SOSTITUISCE UN PACCHETTO PRONTO.**
  Il 19/08 `npm run build` e' stata lanciata per verificare che quattro
  versioni nuove compilassero — compilano — e ha riscritto
  `consegna\Pathfinder 1.8.4\` con un pacchetto che conteneva anche la 1.9,
  la 1.10, la 1.11 e la 1.12, **sotto il numero della 1.8.4**. Non e' un
  difetto della build: `emptyOutDir` fa quel che dice, ed e' scritto qui
  sotto. E' un difetto del gesto. **Prima di costruire si copia il pacchetto
  che sta in `consegna\`**, se e' uno che aspetta un'installazione; e a
  ripristino avvenuto **si chiede al servizio**, non alla cartella:
  `/api/app-info` ha detto `fefa508e…` e 1.626.669 byte, ed e' l'unica
  conferma che vale. Il numero di build si alza **prima** di costruire, mai
  dopo.
- **UN VALORE ATTESO SCRITTO A MEMORIA NON E' UNA PROVA.** La prima prova
  sulla cifra di controllo GS1 diceva `1` perche' quel numero era stato
  scritto senza calcolarlo: l'implementazione diceva `8`, ed era
  l'implementazione ad avere ragione. Quando un valore atteso e' il
  risultato di un algoritmo, o si rifa' il conto a mano **e lo si scrive nel
  commento**, o si prova una **proprieta'** — per l'SSCC, che la somma
  pesata chiuda a multiplo di dieci — che resta vera anche se il codice
  cambia. Le due cose insieme sono meglio di ognuna delle due.
- **UN PANNELLO CHE RIDIMENSIONA NON MANDA `resize` ALLA PAGINA.** Provando
  la 1.11 il ridimensionamento del browser di prova cambiava `innerWidth` e
  faceva valutare bene le media query CSS, ma **non consegnava alcun evento**
  — verificato con una spia: zero. Il codice che ascolta `resize`,
  `orientationchange` e `matchMedia` non e' esercitabile li', e **il
  ricalcolo dinamico della classe di dispositivo resta da provare su un
  terminale vero**. La classe iniziale, quella si': provata a 533 e a 480 px.

- **UN INDICE «composite» NON E' «compositeUnique».** `inventory` indicizza
  `[location_code+item_key]` per CERCARE, non per vietare: due righe con la
  stessa chiave nello stesso vano il database le accetta senza fiatare, e il
  client — che le cerca con `find` — ne legge UNA, quale a seconda
  dell'ordine di caricamento. E' un saldo che cambia da solo. Trovato il
  19/08 alla prima prova dello spostamento di un'unita' di carico. Chi scrive
  una rotta che sposta righe fra ubicazioni **controlla lui** che la chiave
  non collida: lo schema non lo fa.
- **IL CLIENT SCRIVE `last_updated_at`, IL SERVIZIO SCRIVE `updated_at`.**
  Sulle giacenze sono due campi diversi, e il secondo non lo legge nessuno:
  la data di ultima modifica non si muove quando la riga passa da una rotta
  composta. `moveUdc` usa quello giusto; `removeItem`, `sampleItem` e
  `commitPickStop` no, e **non sono state toccate** — correggerle e' un
  ciclo di debug con la sua prova, non una riga da cambiare di passaggio.
- **UN PARSER CHE LEGGE «IL PRIMO NUMERO DELLA RIGA» E' UNA SCOMMESSA SUL
  TIPO DELLA CELLA.** Finche' Sage esportava i lotti come testo funzionava;
  il primo lotto tutto cifre e' diventato la quantita' — 260.594 KG al posto
  di 0,315, su un ordine da 380 kg. Nessuno se n'era accorto perche' il
  percorso si costruisce lo stesso: la tappa c'e', ed e' il numero a essere
  assurdo. Dove una colonna ha un significato noto, **si salta per posizione**.
- **UNA REGOLA DI MAGAZZINO NON SI DEDUCE DAL CODICE.** Il sito «di casa» di
  un ODP era stato dedotto dall'ordine di visita, che e' una preferenza di
  interfaccia; la regola vera — «si parte dal magazzino con piu' prelievi» —
  l'ha detta Andrea in una riga, e ha cambiato l'avviso da «10 tappe su 10»
  a «3 su 10». Prima di indovinare una regola di mestiere, si chiede.

- **UN SALDO GIUSTO CON LA PAROLA SBAGLIATA E' UNA BUGIA.** La chiusura del
  conto di produzione contava il consumo come «tornato»: il numero tornava,
  ma diceva che la merce era rientrata a magazzino quando era finita nel
  prodotto. Nessun collaudo se ne sarebbe accorto — i totali erano esatti —
  e a leggerlo sarebbe stato chi cerca il consumo di un ordine fra sei mesi.
  Dove due cose escono dallo stesso conto per ragioni diverse, servono due
  nomi: `out` e `consumo`.
- **UN'AREA NON E' UN'UBICAZIONE.** Il conto di produzione doveva tenere un
  vano per ordine — `WIP-ODP2603889` — e il controllo verificava che
  QUALCHE ubicazione cominciasse per «WIP»: passava, e poi la merce sarebbe
  finita in un vano che nessuno aveva mai disegnato. Un vano per ordine
  pretende di mapparne uno nuovo a ogni ordine, che in corsia non succede.
  L'area WIP e' **un'ubicazione mappata**, e a tenere distinti i conti sono
  le righe.
- **QUANDO DUE COSE SI SOMIGLIANO, LA SCELTA LA DICHIARA CHI SCRIVE.** La
  maschera delle regole deduceva «prefisso o codice esatto» dal fatto che il
  valore esistesse in anagrafica: «6000366» e' un codice vero E il prefisso
  di «6000366B», e indovinando si sceglieva sempre il primo. La regola
  sembrava scritta e non si applicava a niente — il modo peggiore di
  sbagliare, perche' non da' errore.

### Codice

- **CHI MODIFICA UN FILE DA UNO SCRIPT LO RILEGGE IN BINARIO.**
  `.gitattributes` dice `* -text`: Git non deve toccare i fine riga, e il
  perché sta scritto lì dentro. Uno script Python che apre un file in
  modalità testo e lo riscrive con `newline=''` **converte CRLF in LF senza
  dirlo**: il contenuto è identico, ogni riga risulta modificata, e il diff
  della sessione è passato da 4.248 righe a **13.016** — illeggibile, e un
  commit fatto in quello stato avrebbe seppellito le correzioni vere sotto
  novemila righe di niente. Si rilegge `'rb'`, si guarda se c'è `
`, e si
  riscrive con quello che si è trovato. Vale anche per `sed -i`. Trovato il
  20/08, e recuperato prima del commit solo perché il numero saltava
  all'occhio.

- **UN CAST NON CONVERTE NIENTE: DICE AL COMPILATORE DI NON GUARDARE.** I due
  difetti che la migrazione a TypeScript aveva trovato e lasciato aperti — la
  data delle copie locali e la descrizione «undefined» — erano tutti e due
  **dietro un cast**, e il cast è esattamente ciò che li teneva invisibili:
  `b as { modified?: number }` su un oggetto che quel campo non ce l'ha,
  `art.description as string` su un campo facoltativo. Nessuno dei due
  sbagliava a compilare, e nessuno dei due funzionava. Dove viene voglia di
  scrivere `as`, la domanda giusta è che cosa si sta nascondendo.

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
- **NESSUNA CANCELLAZIONE DI RECORD, PUNTO — 2.1.** Fino alla 2.0 la frase
  era «nessuna cancellazione *automatica*: la purga è manuale, con export
  preventivo», e l'eccezione stava a un clic di distanza in Configurazione.
  Con la 2.1 la purga non c'è più, e `purgeMovementsBefore` nemmeno: era
  l'unica strada per cui un movimento poteva sparire da questo database. Il
  registro è la firma GMP di chi ha mosso la merce e si tiene sei anni; un
  modo di cancellarlo — per quanto protetto da export e doppia conferma — è
  un modo che prima o poi qualcuno percorre. Per portare via i dati resta
  l'export JSON, che non toglie niente da dove sta.
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
- **Chi CHIEDE un prelievo non deve sapere a chi va — 2.2.** Destinatario,
  vettore e causale restano nella maschera perché chi li sa li scriva subito,
  ma non bloccano la conferma: sono dati del DOCUMENTO, e il documento li
  pretende alla registrazione. Preteso alla richiesta, il destinatario ferma
  l'unica cosa che a quel punto serve — mettere il lavoro in coda.
- **Una riga che nasce `hidden` si accende togliendo la classe, non lo
  stile.** `display: ''` toglie lo stile in riga e lascia comandare il foglio:
  la riga non compare mai. Vale per ogni maschera che accende campi per tipo,
  e il modo di accorgersene è aprirla in browser — un campo obbligatorio
  dentro una riga invisibile blocca la conferma indicando qualcosa che non
  c'è.

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
- **UNA RIGA CHE DICHIARA I COLLI NON SI SCARICA A NUMERO — 2.0.** Senza le
  scelte il servizio cala `qty` e lascia dov'erano `packs` e `qty_uom`: la
  riga esce dicendo tre colli con l'elenco e il peso di sette. `removeItem`
  adesso **si rifiuta**, e il rifiuto dice quale riga. Il rifiuto guarda i
  `packs` DICHIARATI e non `colliDiRiga`, che legge un elenco anche dove
  nessuno l'ha mai scritto: rifiutare lì fermerebbe la rettifica di inventario
  sulle righe della 1.7. Lo svuotamento totale resta libero — la riga sparisce
  intera, e non resta niente a cui l'elenco possa sopravvivere.
- **Chi rimette a posto ridichiara, non aggiunge.** Rimettere dieci chili
  presi da un sacco da venticinque non è aggiungere un sacco da dieci: il
  sacco torna pieno. L'azione di annullamento porta `packs_prima` e la
  differenza la traduce `rettifica`, come nell'inventario e nella conta.
- **Chi sposta una riga di giacenza scrive un OGGETTO NUOVO.**
  `indicizzaGiacenza` toglie la riga dal bucket del vano vecchio confrontando
  `prev` con `next`, e `prev` lo ritrova per `_id` dentro la cache:
  modificando l'ubicazione sull'oggetto che la cache già tiene, i due
  diventano lo stesso oggetto e il confronto non ha più niente da riparare.
  È successo a `moveUdc`, e a video la merce stava in due vani insieme.
- **LA CONFEZIONE SI PUÒ DICHIARARE DOPO, E LA DICHIARA CHI HA I COLLI IN
  MANO — 2.2.** `_congelaLotto` copia dall'anagrafica, e mezza anagrafica la
  quantità per collo non ce l'ha: quei lotti non dichiarano i loro colli, il
  conto torna finché si muovono colli interi e si ferma al primo collo aperto.
  Il numero non si indovina: lo dice l'operatore che ha il sacco davanti, e si
  scrive **sul lotto** — la confezione è un fatto del lotto e vale per tutti i
  suoi colli, ovunque stiano. `Store.dichiaraConfezioneLotto`, e chi la chiama
  scrive il movimento.
- **LE UM CHE UN MOVIMENTO NON PORTA SI DERIVANO ALLA LETTURA — 2.2.** Il
  conto di produzione somma i movimenti; quelli scritti prima che il lotto
  dichiarasse la confezione le UM non le hanno, e mescolati a quelli che le
  hanno danno un conto che si dichiara incoerente. Si derivano dai colli e
  dalla confezione di adesso — mai riscrivendo un movimento: il conto è
  storia, e la storia si rilegge con quello che nel frattempo si è saputo. Una
  riga che porta già le sue UM non si tocca.
- **QUANTI PER MISURA, NON QUALE COLLO — 2.2.** Due colli della stessa misura,
  sulla stessa riga di giacenza, sono la stessa cosa: quale esca è una
  differenza che non esiste, e chiederla costava una casella per collo. La
  maschera dà una riga per misura e prende i primi liberi di quella misura. Il
  collo che si APRE resta una scelta esplicita — è l'unico caso in cui la
  misura non basta, perché un collo aperto vale meno di quel che dichiara — e
  il più piccolo che basta è un default, non una regola: aprire un sacco da 25
  per prenderne 7,5 quando ce n'è uno da 10 lascia in giro due mezzi colli
  invece di uno, ma chi ha la merce davanti può decidere altro.
- **UN EXPORT CHE NON NOMINA LE UM RACCONTA UN ALTRO MAGAZZINO — 2.0.** Fino
  al 19/08 il foglio delle giacenze aveva una colonna sola, «Coll.», e il
  registro tre — prima, delta, dopo — tutte in colli: su un magazzino dove lo
  stesso codice arriva in colli da 5 kg e la volta dopo da 25, quel conto non
  è la merce. **Adesso il foglio delle giacenze dà una riga per collo**:
  contare le righe dà i colli, sommare «UM Collo» dà le UM, e nessuna cella
  ripete un totale di riga — un totale ripetuto su undici righe lo si somma
  undici volte. La riga di un articolo senza unità esce lo stesso, una per
  collo, con le due celle vuote.
- **Un riepilogo che vede unità diverse non somma: dichiara MISTA.** 300 KG
  più 40 PZ fanno 340 di niente. `modules/fogli.ts` accumula tenendo da parte
  le unità viste: una sola e il totale vale, più d'una e la cella del totale
  resta vuota — un'assenza, non uno zero.
- **Il saldo in UM non esiste, il movimento in UM sì.** Un movimento porta
  `qty_uom_delta` e la sua unità; il prima e il dopo in UM non sono mai stati
  scritti. Il registro esce con **due colonne, non cinque**: ricostruirli
  risalendo la catena darebbe un numero plausibile e falso su ogni riga
  storica, che è il difetto peggiore di tutti.

### Stoccaggio — 2.1

- **La priorità di una regola va da 1 a 10.** Era «da zero in su» e non
  aveva un tetto: due regole a 100 e a 3.000 si ordinano lo stesso, ma
  nessuno sa più che numero scrivere alla terza. Una regola vecchia con 0
  si rilegge buona — in lettura si è tolleranti, in scrittura no.
- **La cella «Riservata» è riservata A QUALCOSA, e §6 dice a cosa**: è il
  vano dove gli allergeni ci possono stare per decisione presa. Quindi
  esclude la merce PULITA — che di quella decisione non ha bisogno e
  occuperebbe il posto di chi sì — e ammette quella con allergeni. Fino
  alla 2.0 usciva fra i vincoli duri insieme a «bloccata», e la deroga non
  poteva scattare mai.
- **La distanza ha un tetto.** È la posizione nella sequenza della zona:
  senza tetto, su 274 ubicazioni decideva da sola e il raggruppamento del
  lotto non spostava niente.

### Mappa — 2.1

- **La vista la decide la zona, non chi guarda.** Scaffali → frontale, con
  «Specchia» per chi percorre la corsia nell'altro verso. Terra e sfuso →
  dall'alto. Una scaffalatura vista dall'alto sovrappone i livelli; un'area
  a terra vista di fronte è una fila di rettangoli alla stessa quota:
  offrire tutte e due su ogni zona vuol dire offrire, su ogni zona, quella
  sbagliata.
- **Il pannello di dettaglio non copre la pianta**: la zona centrale si
  stringe della sua larghezza. I 360px coperti erano esattamente la corsia
  che l'operatore stava guardando, perché ci aveva appena cliccato.
- **Un'unità di carico si disegna DENTRO il vano**, come casella annidata,
  e si trascina. Il trascinamento passa da `moveUdc` come la maschera: non
  è una scorciatoia che salta un controllo.

### Documenti ed etichette — 2.1

- **Ogni documento stampato porta in testata il proprio riferimento in
  Code128**, e la riga sta in un posto solo — `_docHeadHTML`, da cui
  passano tutti e sette. Chi torna dal magazzino col foglio in mano lo
  rimette dentro col lettore invece di digitare quattordici caratteri coi
  guanti.
- **Un'etichetta porta solo quello che non invecchia.** Sull'unità di
  carico l'unico dato che non invecchia è il numero — non si riusa mai:
  ubicazione, data e operatore sono usciti perché diventano una bugia
  incollata al legno. Su un'etichetta di merce articolo, lotto e scadenza
  restano veri, e l'ubicazione si scrive dichiarata come «alla stampa».
- **Le barre sono nere su bianco dichiarato**: un tema scuro che le gira le
  rende illeggibili a qualunque lettore ottico. La carta non ha un tema.
- **Quello che esce è Code128, non GS1-128**: manca FNC1. Dentro l'azienda
  è ciò che serve; il giorno che le etichette escono dal cancello, il
  modulo va esteso — non aggirato.

### Metodo e interfaccia

- **Un blocco per commit**, con build e collaudo in mezzo. **Chi sposta non
  corregge.**
- **Gli interruttori `feature.*` sono stati tolti con la 2.0**, dopo che tutte
  e sei erano rimaste accese in produzione. Servivano a tornare indietro senza
  disinstallare, nei mesi in cui il codice arrivava più in fretta di quanto il
  magazzino potesse provarlo. **Da qui in poi si torna indietro reinstallando
  il pacchetto di prima**, che dal 18/08 è comunque l'unica via di ritorno
  intera — un `torna-indietro.ps1` riporta solo metà versione. Chi rimette un
  interruttore rimette anche un ramo che nessun collaudo esercita.
- **Ogni tabella si ordina e si filtra — 2.1, §3.** La regola sta in
  `modules/tabella.ts` e le viste ci passano le colonne: l'ordinamento è
  **stabile**, il **vuoto va in fondo nei due versi** — una data mancante
  non è «molto vecchia», è assente — e il terzo clic sulla stessa colonna
  riporta all'ordine di partenza, che su un registro è quello cronologico.
- **Il cruscotto se lo compone chi lo guarda — 2.1.** Ordine, larghezza e
  quali riquadri esistano sono un dato in `meta`, non righe di codice.
  **Ordine e larghezza, mai coordinate in pixel.** Quello che avvisa —
  integrità, ritiri in scadenza — **non si spegne**: è la ragione per cui
  qualcuno deve guardare il cruscotto oggi invece che domani.
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

### Le tre cariche — 2.1

- **`operator` · `leader` · `admin`.** L'Admin **comprende** il Team
  Leader: dove passa un leader passa lui — autorizzare un rinnovo di PIN,
  alzare una priorità, contare come «leader attivo». Una carica più alta
  che potesse meno sarebbe la riga che, il giorno che si nomina Admin
  l'unico capo del magazzino, chiude il cerchio esattamente come il 13/08.
- **Solo l'Admin apre la Configurazione e il reset dei dati**, e il reset
  pretende il suo PIN. Il varco sta in `renderConfig`, non in
  `switchView`: all'avvio su un database vuoto l'applicativo porta in
  Configurazione **prima** di chiedere chi sei.
- **L'eccezione del primo giorno è dichiarata e si spegne da sola**:
  finché nessun Admin esiste, comandano i Team Leader. Senza, installare
  la 2.1 su un magazzino dove nessuno è ancora Admin murerebbe la
  Configurazione — che è l'unico posto da cui si nomina un Admin.
- **L'ultimo Admin non si retrocede e non si disattiva.** Stesso motivo.

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
| `modules/compiti.ts` | 555 | Ciclo di vita, coda, misure, urgenza calcolata, residuo, le due famiglie di chiusura. **2.1**: `registroAttivita` unisce i compiti ai campionamenti che il registro generale porta e nessun compito rivendica. **Puro**: non tocca Store né il DOM |
| `modules/misure.ts` | 319 | Le cinque unità, la suddivisione per collo, il collo incompleto. Puro |
| `modules/colli.ts` | 578 | **1.8 — l'elenco dei colli**: la suddivisione dichiarata, il prelievo per collo, le uscite come le capisce il servizio, il ritrovamento per misura, il ponte con la 1.7. **1.8.4**: `scelteDaUscite` (le uscite messe da parte, ritrovate) e `rettifica` (da com'era a com'è). **2.2**: `scelteDaTaglie` (quanti per misura → scelte per indice, col collo che si apre) e `riempiFabbisogno` (la maschera nasce compilata dalle misure più piene). **2.3**: `pianoUscita` — una QUANTITA' tradotta in colli, la misura esatta e poi il piu' piccolo che basta: nel vano di lavorazione un collo e' di piu' ordini, e chi dichiara la sua parte non se lo puo' portare via intero. Puro |
| `modules/documenti.ts` | 39 | **1.8.4** — la riga di un documento di uscita, ricostruita in **un posto solo**. Nasce da un difetto: era in due copie, e i colli scelti sparivano al salvataggio. Puro |
| `modules/giacenzaArticolo.ts` | 175 | **1.9** — la giacenza di un articolo raggruppata per lotto e ordinata FEFO, i totali per unita', e la coda di conte nell'ordine dello scaffale. Le UM **non** si calcolano qui: arrivano risolte da `Store.righeLette`, perche' due letture della stessa riga sono due saldi. Puro |
| `modules/trasferimentiOdp.ts` | 142 | **1.10** — quali tappe stanno in un altro magazzino, il compito di trasferimento che ne nasce, e la tappa spostata sull'ubicazione di ricezione. Puro |
| `modules/dispositivo.ts` | 74 | **1.11** — su che cosa sta girando. A decidere e' la larghezza, non il sistema operativo; Android si riconosce e si registra. Puro |
| `modules/udc.ts` | 162 | **1.12** — il codice sull'etichetta: interno o SSCC con la cifra di controllo GS1. Sta da solo perche' **un'etichetta dura**, e provarla altrimenti vorrebbe dire stamparla. Puro |
| `modules/udc.ts` | 162 | **1.12** — il codice sull'etichetta: interno o SSCC con la cifra di controllo GS1. Sta da solo perche' **un'etichetta dura**, e provarla altrimenti vorrebbe dire stamparla. Puro |
| `modules/stoccaggio.ts` | 355 | **1.13** — dove si mette la merce: vincoli duri, poi punteggio. Le regole sono un dato di `storage_rules`. Ogni proposta dice perche'. Puro |
| `modules/wip.ts` | 813 | **1.14** — il conto di un ordine: entrato, tornato, residuo. Il consumo si dichiara **a ordine chiuso**, mai prima. **2.0**: `colliFuori` — le misure dei colli che un ordine ha ancora nel vano WIP, entrate meno quelle gia' tornate o consumate. Il vano e' UNO e ci convivono le righe di piu' ordini: senza queste misure, «rendi tre colli» non ha una risposta. **2.1**: `archiviato` — la chiusura e' un movimento, non il residuo a zero. **2.2**: `ordiniArchiviati` (l'archivio da sfogliare, col numero e la data, dal piu' recente) e `righeSenzaOrdine` (quel che sta nel vano e nessun movimento nomina: la chiusura e il reso lavorano per ordine, e non lo vedono). **2.3**: UN COLLO E' DI PIU' ORDINI — `quoteVano` (il vano collo per collo, con gli ordini che lo richiamano e quel che nessuno rivendica), `coperturaUom` (quanto un ordine ha gia' in mano, `null` quando non si sa), `ripartisciReso` (un reso che non dice per chi si scarica in ordine e TRABOCCA), `giro_odp` sul movimento e `ceduto_uom`/`ricevuto_uom` sul conto: il giro conto usa `out` e `in`, e il rendiconto non chiama «reso» merce mai risalita. Puro |
| `modules/kpi.ts` | 330 | **2.0** — i numeri di articoli, movimenti e persone, che stanno gia' a database e nessuno sommava. Ogni movimento porta la sigla di chi l'ha fatto e ogni compito i suoi due tempi. `NON_MISURABILE` elenca cosa oggi non si puo' chiedere e quale campo servirebbe: chi cerca un numero che non trova capisce in dieci secondi se manca la funzione o manca il dato. Puro |
| `modules/code128.ts` | 150 | **2.1** — il codice a barre, disegnato in casa. Solo il sottoinsieme B, e il perché è dichiarato: copre tutto quello che questo applicativo mette in un riferimento. **Non è un GS1-128** — manca FNC1 — e sta scritto nel modulo, non in una nota. La tabella dei 107 modelli si collauda con le due invarianti dello standard, non ricopiandola. Puro |
| `modules/cruscotto.ts` | 155 | **2.1** — il layout della Dashboard: ordine, larghezza, quali riquadri, quali scorciatoie. Riconcilia il salvato con quello che il codice sa fare oggi — un riquadro nuovo si accoda visibile, uno sparito si ignora. **Ordine e larghezza, non coordinate**: una posizione in pixel salvata su un 27 pollici, riletta a 480, mette due riquadri uno sull'altro. Puro |
| `modules/tabella.ts` | 200 | **2.1** — ordinare e filtrare, §3. Ordinamento stabile, il vuoto in fondo nei due versi, numeri confrontati da numeri. Il markup lo costruiscono le viste: qui c'è la regola. Puro |
| `modules/pickRoute.ts` | 471 | Percorso di prelievo a serpentina. **2.3**: `buildSerie` — piu' ODP in un giro solo, con `richieste` sulla tappa; il fabbisogno scontato di quel che il reparto ha gia' in mano (`in_wip`, `in_reparto_altrui`, `reparto`); e **il vano WIP escluso dalle ubicazioni in cui si preleva** |
| `modules/odpParser.ts` | 246 | Lettura degli ODP da Excel |
| `modules/destinatari.ts` | 200 | Chi è lo stesso destinatario (partita IVA), quale destinazione è nuova, cosa è cambiato |
| `modules/parametri.ts` | 165 | Le tendine che sono un dato: valori di legge davanti e non rimovibili |
| `modules/anagrafica.ts` | 158 | I 14 allergeni, le 3 classi di conservazione, le certificazioni |
| `modules/conformita.ts` | 155 | Cosa è stoccato dove non dovrebbe: il motore di stoccaggio al contrario |
| `modules/validate.ts` · `auth.ts` · `session.ts` · `pickupAlert.ts` · `scanGuard.ts` | 104 · 88 · 69 · 43 · 31 | Validazioni · PIN e impronta · sessione · allerta ritiri · guardia del lettore |
| `modules/excel.ts` | 31 | **Il punto unico da cui SheetJS si carica, e solo quando serve.** Chi rimette `import * as XLSX` in cima a un file annulla la 1.7 |
| `modules/fogli.ts` | 112 | **2.0** — le due domande di un foglio Excel che non riguardano SheetJS: quante righe fa una giacenza (`colliDaStendere`: una per collo) e che numero scrive un riepilogo che ha visto unità diverse (`celleUom`: MISTA, e il totale vuoto). Sta qui e non nella vista perché una vista si importa solo passando da `App`, e una funzione pura non deve farlo per essere collaudata. **`distendiGiacenze` è il muro del foglio**: 1.048.575 righe, contate su TUTTE le giacenze insieme e non su una — duecento righe da diecimila colli fanno due milioni di righe, ognuna innocente e il foglio morto lo stesso. Una riga che da sola sfonda il foglio non ne consuma il budget e torna `null`, e chi chiama ne scrive una che lo dice: quella riga è un numero sbagliato, non merce. Puro |
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
| `configDati.ts` | 975 | Dati, resilienza, i tre fogli Excel, reset. **2.1**: copia esterna, purga e «Salva ora» non ci sono più; il reset chiede il PIN dell'Admin |
| `spedizioni.ts` | 1.080 | DDT: testata, carrello, documento pendente, evasione, stampa |
| `compiti.ts` | 885 | Attività: coda, misure, registro, richiesta, i quattro gesti |
| `percorso.ts` | 970 | Prelievo guidato: ODP, serpentina, corsia, chiusura, e **1.10** il trasferimento chiesto dall'ordine |
| `quarantena.ts` | 755 | Blocco, rilascio, cartellino di non conformità |
| `cruscotto.ts` | 900 | **2.1** — i tredici riquadri componibili, il catalogo delle sette scorciatoie e la scheda «Personalizza». Il contenuto dei riquadri è quello di sempre: a cambiare è chi decide l'ordine |
| `smaltimento.ts` | 664 | Scarico in tre stadi, e i **mattoni del documento** che usano tutti |
| `prelievo.ts` | 600 | Trasferimento e carrello di produzione |
| `inventario.ts` | 1.035 | Inventario di vano, conta mirata, e **1.9** il ramo «Per articolo» col giro di conte e il riepilogo stampabile |
| `posiziona.ts` | 781 | Posizionamento, la dichiarazione dei colli, `_scegliColli` e **`_ridichiaraColli`** — la maschera che chiede com'è fatto adesso, condivisa con l'inventario e la Conta |
| `giacenze.ts` | 527 | Dettaglio di un'ubicazione, i cinque gesti che partono da lì, e **1.9** il totale del vano in colli e UM |
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
| `wip.ts` | 461 | **2.3 — IL REPARTO, COLLO PER COLLO**: una riga per collo del vano, con gli ordini che se lo dividono e per quanto. Da qui si rende (e il reso trabocca), si dichiara consumato, e si gira il conto a un altro ordine senza muovere niente. Fino alla 2.2 era il conto di UN ordine, ed e' passato in `wipRegistro.ts` |
| `wipRegistro.ts` | 402 | **2.3 — IL REGISTRO DEGLI ODP**: il conto di un ordine, la chiusura che trasforma il residuo in consumo, il rendiconto stampabile e l'archivio da sfogliare. Il rendiconto tiene separato il **ceduto** dal reso: merce passata a un altro conto non e' merce risalita a scaffale |
| `udc.ts` | 322 | **1.12** — le unita' di carico: elenco, creazione, carico e scarico delle righe, spostamento intero, etichetta |
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
| `azure/schema-postgres.js` · `azure/migra-sqlite-postgres.js` · `azure/LEGGIMI.md` | — | **2.1 — il ramo parallelo, che non è in servizio e non lo chiama nessuno.** Lo schema PostgreSQL si genera dalla **stessa** dichiarazione di `lib/schema.js`, non da una copia; la migrazione copia una COPIA del database e ricontrolla i conteggi tavolo per tavolo. `pg` **non è** una dipendenza del progetto, ed è voluto: si installa con `--no-save` chi vuole provare. `server/azure` è escluso da `tsconfig.server.json` per la stessa ragione |
| `test/collaudo.js` · `test/collaudo-migrazione-1.4.js` | 520 · 158 | 81 prove sul servizio vero · 8 sul cambio di schema |
| `test/collaudo-installazione.js` | — | **22 prove sugli script di installazione**: esercita `installa-versione.ps1` e `torna-indietro.ps1` su una casa temporanea, con consegne finte che si distinguono per i byte; e l'**installer a doppio clic** in `-Prova`, che è il modo di provarlo senza registrare attività pianificate su questa macchina |

### Collaudi — `test/`

`serpentina` · `fefo` (19) · `geometria` (21) · `odp` (26) · `anagrafica` (27) ·
`conformita` (19) · `cache` (43) · `pacchetto` (27) · `statistiche` (15) ·
`compiti` (114) · `misure` (65) · `colli` (66) · `parametri` (19) · `documenti` (6) ·
`destinatari` (27) · `giacenzaArticolo` (19) · `trasferimentiOdp` (26) · `dispositivo` (15) · `udc` (36) · `stoccaggio` (49) · `wip` (28) · `exportUm` · **2.1**: `code128` (14) · `cruscotto` (19) · `tabella` (22) · `schemaPostgres` (8) · **`superficie-app` (2)** · **2.2**: `modali` (2) · `maschera-attivita` (1) · `registro-completo` (3) · **2.3**: `reparto` (22 — il giro conto, le quote del vano, il reso che trabocca, `pianoUscita`) — **947 prove in 33 file**. `ambiente.js` è
il preambolo comune.

Le tre prove del 2.2 leggono il SORGENTE invece di girare il codice, e non è
un ripiego: fissano regole che un DOM non c'è per verificare — una riga che
nasce `hidden` si accende togliendo la classe, ogni causale di merce scrive
le quantità, l'entrata nel vano WIP passa dal registro. Un difetto trovato in
browser che nessuna prova poteva vedere si chiude così, o non si chiude.

`schemaPostgres` è l'unica prova del ramo Azure che gira a ogni `npm test`,
e serve a una cosa: che il giorno che qualcuno decide di provarlo, lo
schema PostgreSQL descriva le stesse venti collezioni che il servizio usa
oggi — non quelle di quando è stato scritto.

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
| Operazioni composte | `/api/tx` · `/api/op/removeItem` · `/api/op/commitPickStop` · `/api/op/sampleItem` · **`/api/op/moveUdc`** · `/api/op/verifyPin` · `/api/op/hashPin`. **1.12**: `moveUdc` sposta l'unita' di carico e tutte le sue righe in una transazione, e rifiuta se nel vano di arrivo la stessa chiave sta gia' fuori dall'unita'. **1.8**: le prime due accettano `packs_out` e `packs_before`, e con l'elenco `qty` diventa facoltativo — un prelievo che apre un collo senza svuotarlo non toglie colli |
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
| **Demo portatile su chiavetta USB** (senza privilegi admin) | `consegna/Pathfinder 2.2/README-DEMO.md` (IT/EN/FR) — **24/08/2026** |
| **Sheet tecnico IT** (deploy, upgrade, troubleshooting) | `consegna/Pathfinder 2.2/IT-TECH-SHEET.md` (IT/EN/FR) — **24/08/2026** |
| Versioni precedenti, loghi, etichette, file di prova | `ARCHIVIO/` — e **non si cancella niente**: un archivio svuotato funziona una volta sola |
| La storia: handoff e piani fino al 17/08/2026 | `ARCHIVIO/HANDOFF STORICI/` — **memoria, non istruzioni** |
| Cosa è stato archiviato e quando | `ARCHIVIO/archive-manifest.json` |
| Come si disegna un'interfaccia da magazzino | `.claude/skills/erp-wms-frontend/SKILL.md` — **2.1**. Se diverge da §6, vince §6 |
| Cosa costerebbe davvero passare ad Azure | `server/azure/LEGGIMI.md` — **2.1** |

---

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
