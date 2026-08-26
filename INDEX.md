# Pathfinder — INDEX

**Questo è l'unico documento del progetto.** Stato, istruzioni, regole, trappole
e coda di lavoro stanno qui dentro. Non ce n'è un secondo da leggere insieme:
tutto ciò che era sparso in `HANDOFF/` è stato assorbito qui il **17/08/2026**, e
gli originali sono scesi in `ARCHIVIO/HANDOFF STORICI/` come memoria — non sono
istruzioni e non vanno più aperti per lavorare.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
Repo privato `sacchetti84-dev/pathfinder-WMS`, branch `main` · agg. **27/08/2026**, notte fonda — la 2.10

## LO STATO DEL PROGETTO È **ALFA**

Dichiarato da Andrea il 25/08/2026. Vuol dire che l'applicativo fa il suo
mestiere e ha dei dati veri dentro, ma la superficie si muove ancora: funzioni
che entrano, interruttori spenti che aspettano un turno, dati di configurazione
che nessuno ha ancora compilato. Non è un prodotto finito che si manutiene, ed
è un prodotto vivo che si usa.

**Non c'è una scadenza.** La riga che dava il progetto al 31/12/2026 con
ultima installazione utile il 19/12 è stata tolta il 25/08: le date si
scrivono come fatti avvenuti, non come promesse.

---

## LA 2.10 CHIUDE SEI FALLE, E NE LASCIA UNA APERTA CHE SI VEDE

**Notte del 27/08/2026.** Nasce da una valutazione di sicurezza chiesta da
Andrea e fatta leggendo il codice e provandolo, non solo leggendolo. Il
giudizio complessivo era buono e il difetto era uno solo, grosso: **il
codice e' scritto con cura e non c'e' controllo d'accesso.** SQL
parametrizzato dappertutto, escape HTML applicato con costanza, confronto a
tempo costante sull'impronta, password generate bene negli script — e le
rotte `/api` che rispondono a chiunque raggiunga la porta.

| | |
|---|---|
| dove | `consegna\Pathfinder 2.10\`, e il codice nel ramo `main` |
| pacchetto | app 4 file, **1,76 MB** — 469 kB sul filo, compressi · servizio, 12 voci |
| impronta | `2a70b8e9fe2306eb4007e39289edd4b8db3b4a2ee2d09465c4898f10ac6dfbf6` |
| collaudi | **1.180 client** in 40 file · **113 servizio** · **8 migrazione** · **29 installazione** |
| tipi | `npm run check` a 0 su client e servizio |
| provata | al banco, in browser: identificazione, elenco operatori, giro completo del PIN |

### L'impronta del PIN non esce piu' dal servizio, e non e' piu' SHA-256

**ERANO DUE DIFETTI CHE SI TENEVANO IN PIEDI A VICENDA.** `GET
/api/c/operators` rispondeva coi record interi, `pin_hash` e `pin_salt`
compresi, e l'impronta era uno SHA-256 a un giro. Un PIN e' di **sei cifre**:
un milione di combinazioni. Misurato su questo codice, in Node, su una CPU
sola e senza ottimizzare nulla: **204 ms per ricavare un PIN da un'impronta.**
Lo spazio intero sta in meno di due secondi. Il freno a cinque tentativi non
c'entrava niente — chi ha l'impronta non bussa piu'.

**Il campo non sparisce e basta.** Al suo posto la risposta porta `pin_set`,
che e' la sola cosa che il client chiedeva davvero: «questo operatore ha un
PIN?», che serve a `getUsableLeaders` e alla maschera che completa il
profilo. Nel client si legge da `Store.haPin`, mai dal campo. La verifica
passa da `/api/op/verifyPin`, che l'impronta la legge dal database e non la
fa viaggiare.

**`scrypt` al posto di SHA-256, e le impronte vecchie si rifanno da sole.**
SHA-256 e' veloce per costruzione, ed e' il difetto; scrypt costa memoria e
tempo a ogni tentativo, sempre per costruzione — un accesso sta sui 50-100 ms,
che chi digita non vede, e lo spazio intero passa da due secondi a una
giornata di macchina. Le impronte gia' scritte restano valide: il record dice
con che algoritmo e' fatta (`pin_algo`, assente = com'era prima), e **al primo
accesso riuscito si riscrive in scrypt**. Non c'e' una migrazione da lanciare,
e non potrebbe esserci: il PIN lo sa solo chi lo digita, e quello e' l'unico
istante in cui si puo' ricalcolare.

**Il modo «da file» resta a SHA-256**, ed e' dichiarato: `crypto.subtle` nel
browser non ha scrypt, e quel modo ha un'altra superficie — un browser solo,
su una macchina sola, senza una rete da cui leggere le impronte.

### Un backup non esce piu' dalla macchina

`dir` arrivava dal corpo della richiesta e non la guardava nessuno: **una
richiesta sola scriveva l'intero database dove diceva chi chiamava.** Il
processo gira come SYSTEM, e una condivisione di rete come destinazione
faceva uscire anagrafica, movimenti e operatori dall'azienda con un `curl`.
Provato al banco: cartella creata e 6,3 MB scritti fuori dall'area
applicativa, senza credenziali.

Non si stringe a **una** cartella, e il perche' e' che i chiamanti legittimi
sono quattro e scrivono in quattro posti diversi — il backup serale, l'installer
prima di aggiornare, i collaudi in una cartella temporanea, il banco nella
propria. Si vietano invece le tre forme che nessuno di loro usa: **i percorsi
di rete**, **le cartelle di sistema di Windows**, **i percorsi relativi**.
`PATHFINDER_BACKUP_ROOTS` stringe ancora, quando c'e'.

### Un codice non spezza piu' un gestore dell'interfaccia

L'interfaccia costruisce i gestori dentro le stringhe — `onclick="App.qualcosa('CODICE')"`
— e sono **due contesti annidati**: l'attributo HTML, e la stringa JavaScript
che ci sta dentro. `_esc` copre il primo e non il secondo: trasforma l'apice in
`&#39;`, il parser lo ridecodifica **prima** che il motore JavaScript lo legga,
e quella stringa si chiude. Da li' in poi e' codice, e gira nel browser
dell'operatore con la sua identita'.

Sono **195 punti** nelle viste. Correggerli uno per uno voleva dire toccare 195
gesti sperando di non sbagliarne nessuno, e lasciare aperto il 196esimo — quello
che qualcuno scrivera' il mese prossimo. **La correzione sta invece in un posto
solo**, e in quello giusto: `normalizza`, dove i campi che sono un CODICE
passano gia' tutti per essere maiuscolati. Un articolo, un lotto, un'ubicazione,
una sigla non hanno mai contenuto una virgoletta: adesso non possono.

**Si rifiuta, non si ripulisce** — togliere l'apice di nascosto scriverebbe a
database un codice diverso da quello che il chiamante crede di aver scritto, e
due codici che si somigliano sono peggio di un errore che si vede. **`&` non e'
nell'elenco**: l'escape HTML lo gestisce, in una stringa JavaScript non rompe
niente, e una categoria merceologica ha il diritto di chiamarsi «OLI & GRASSI».
C'e' un collaudo per ciascuno dei due versi, e il secondo non e' di cortesia: un
campo di testo libero che rifiuta gli apostrofi rende impossibile scrivere
«l'articolo e' arrivato rotto» in una nota.

### I file del servizio non sono piu' di tutti

`C:\Pathfinder` eredita da `C:\` il permesso `Authenticated Users : Modify`, e
nessuno gliel'aveva tolto: **un utente qualunque della macchina poteva
riscrivere `pathfinder-server.js`, e al riavvio quel codice girava come
SYSTEM.** Non serviva un difetto dell'applicativo — bastava un blocco note.
L'installer adesso spezza l'eredita' e riscrive l'elenco: pieno controllo a
SYSTEM e agli Amministratori, lettura ed esecuzione a tutti gli altri. I
terminali non leggono da disco — parlano col servizio — quindi non perdono
niente.

**Non ferma l'installazione se fallisce**, e usa i SID e non i nomi: su una
macchina italiana `Administrators` non si chiama cosi', e su una macchina in
dominio le ACL possono essere governate altrove. Un magazzino che non si
aggiorna per un criterio di gruppo e' un danno peggiore di un permesso largo.

### Tre intestazioni, e una quarta che non c'e'

`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` su ogni
risposta. **Non c'e' `Content-Security-Policy`, ed e' una scelta**: una CSP
seria vieta proprio i gestori inline che sono l'architettura di questa
interfaccia, e una permissiva al punto da lasciarli passare sarebbe una riga
che non protegge da niente e che il prossimo lettore crede protegga.

### Su quale interfaccia si ascolta, adesso, si sceglie

`listen` non diceva su quale, e Node in quel caso le prende **tutte**. Il valore
predefinito resta quello — cambiarlo spegnerebbe i terminali, ed e' il gesto che
non si fa in una versione che nessuno ha ancora installato — ma la scelta ha un
nome: `PATHFINDER_HOST=127.0.0.1` su una macchina dove l'applicativo si usa solo
in locale. E all'avvio il servizio adesso **dichiara a chi risponde**, che e'
l'unica difesa che ha finche' non c'e' un accesso vero.

### QUEL CHE LA 2.10 NON HA FATTO, E VA GUARDATO IN FACCIA

**LE ROTTE `/api` NON CHIEDONO ANCORA CREDENZIALI A NESSUNO.** Chi raggiunge
la porta legge qualunque collezione, ne scrive qualunque record, e con una
`DELETE` svuota le giacenze. Il PIN non e' un controllo d'accesso: e' una
domanda che il client fa e a cui il client stesso obbedisce. E la procedura di
recupero PIN in §6 — `PATCH` su `/api/c/operators` — funziona per chiunque
sulla rete: si legge l'elenco, si sceglie un Team Leader, si scrive
un'impronta nuova, si entra come lui.

**Perche' non e' stata chiusa adesso, e non e' una dimenticanza.** Un segreto
condiviso messo dentro il client non e' un segreto: la pagina la scarica
chiunque, e il valore si legge aprendo gli strumenti del browser. La strada
vera e' **una sessione emessa dopo il PIN**, che e' il modello a cui questo
applicativo somiglia gia' — c'e' l'identificazione, c'e' `currentOperator`,
c'e' la scadenza della sessione. Ma tocca ogni chiamata del client e ogni
rotta del servizio, e nessun collaudo di oggi la esercita: e' una versione
sua, con un turno di banco suo, non la coda di una notte in cui si e'
sistemato dell'altro.

**Un token d'amministrazione sulle sole rotte distruttive e' stato provato e
scartato**: il client le usa per gesti legittimi — `deleteWhere` cancella una
zona, `clearMany` fa il reset dei dati — e un token che il browser non ha
avrebbe rotto la Configurazione. Una protezione che rompe l'applicativo e'
una protezione che il primo giorno qualcuno spegne.

**Fino ad allora la difesa e' la rete**, e va detto per intero: superata
quella, non c'e' un secondo strato. `PATHFINDER_HOST` serve a questo.

---

## LA 2.9 È **COSTRUITA E NON È INSTALLATA**

**Notte fra il 26 e il 27/08/2026.** Il pacchetto esiste e ha la sua
impronta; nessuno l'ha ancora installato. In servizio resta la **2.7**; la
**2.8** è costruita e consegnata ma non è mai andata in servizio, e la
sezione qui sotto la descrive ancora — quel pacchetto esiste davvero, ed è
sceso in `ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.8\` prima della build,
perché `npm run build` azzera `consegna\` a ogni giro e quella era l'unica
copia del pacchetto intero: il deposito di `C:\Pathfinder\app\` ne tiene
l'applicativo, non l'installer né il servizio.

| | |
|---|---|
| dove | `ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.9\` — sceso dalla cartella di consegna quando la 2.10 e' stata costruita |
| pacchetto | app 4 file, **1,75 MB** — 469 kB sul filo, compressi · servizio, 12 voci |
| impronta | `b3b3b8daeca269bfcb4b1084157e61318729f015704443854988148693cc4e91` |
| collaudi | **1.176 client** in 40 file · **98 servizio** · **8 migrazione** · **29 installazione** — tutti verdi |
| tipi | `npm run check` a 0 su client e servizio |

**Il collaudo del servizio contava ancora venti collezioni**, e la
ventunesima — `location_attrs` — è entrata con la 2.8: falliva sul numero,
non sul comportamento. Corretto insieme alla build, ed è la ragione per cui
il pacchetto è stato costruito due volte. L'impronta dell'applicativo **non
è cambiata** fra le due: il collaudo viaggia in `servizio\test\`, e l'app
non lo tocca.

**La 2.9 rovescia una decisione della 2.8**, ed è il motivo per cui è una
versione sua e non una correzione: il motore di stoccaggio smette di
rifiutare.

### Il modello cambia: da cancello ad assistente

La 2.8 aveva fatto della regola dell'ubicazione unica un **divieto**:
`addItem` alzava, e il posizionamento non avveniva. Andrea l'ha rovesciata il
27/08 — «il sistema non deve MAI bloccare o interrompere l'operazione se
l'operatore sbaglia» — e la ragione vale più della regola.

**PERCHÉ UN CANCELLO NON FUNZIONA IN MAGAZZINO.** Chi ha la merce in mano e
il muletto acceso non discute con una maschera che dice di no: o trova il
modo di aggirarla — e allora il dato diventa peggiore di prima, perché
nessuno sa più dove sia finita la merce — o si ferma, e si ferma il
magazzino. Una banchina bloccata costa più di una riga fuori posto, e una
riga fuori posto si vede e si corregge; una merce posata di nascosto no.

**COSA C'È AL POSTO DEL DIVIETO**, e non è «niente»:

1. **Il campo si precompila.** Il sistema sa già dove va quel lotto, e lo
   scrive nel campo dell'ubicazione prima che qualcuno debba sbagliare per
   scoprirlo. Solo su un campo ANCORA VUOTO: riscrivere quel che l'operatore
   ha appena scansionato è il modo di far odiare i suggerimenti.
2. **La mappa accende il vano** con un bagliore rosso.
3. **La riga resta in elenco** col suo tasto «Trasferisci», che riapre la
   maschera già compilata sul vano di casa.

`VerdettoCasa.vietato` **non esiste più**, e c'è un collaudo che fallisce se
qualcuno lo rimette: al suo posto `segnala` e `suggerita`, che sono le due
cose che servono a chi lavora. `Store.addItem` non alza più niente.

Anche il motore ha smesso di stringere: il vano di casa **sale in cima** alle
proposte con `PUNTI.CASA_DEL_LOTTO`, ma non esclude più gli altri — chi ha un
motivo per non usarlo deve poter vedere il secondo posto migliore senza
combattere con la maschera.

### La matrice di incompatibilità è uscita, la pericolosità è entrata nelle regole

La griglia di Configurazione, `meta.matriceIncompatibilita`,
`INCOMPATIBILITA_DI_SERIE`, `scontri`, il tipo di non conformità e il motivo
di esclusione: tutti tolti, insieme al loro CSS e ai loro collaudi.

Al loro posto la pericolosità è il **quinto bersaglio** di `storage_rules`,
accanto a codice esatto, prefisso, categoria e prefisso di categoria: «gli
articoli INFIAMMABILE vanno nella campata con la vasca» è la stessa forma di
«i detersivi stanno in MAG3». È una **tendina e non un campo libero** —
«INFIAMABILE» digitato a mano non si applicherebbe mai a niente.

**PERCHÉ LA GRIGLIA ERA DI TROPPO.** Chiedeva la stessa politica in
un'altra forma, in una seconda schermata: un posto in più dove guardare, uno
in più da tenere in pari, e due modi di dire la stessa cosa che prima o poi
si contraddicono.

La gerarchia si allunga di un gradino e resta una riga sola: **chi è più
preciso zittisce chi è più generale**. Articolo esatto → prefisso → categoria
→ pericolosità, che è la rete più larga.

### La mappa, il pannello, il trasferimento

**IL BAGLIORE AL POSTO DEL CONTORNO.** Un `outline` di due pixel su una cella
di quaranta si vede solo se la si sta già cercando. Adesso la cella intera si
accende di un bagliore rosso sfumato dal bordo verso il centro, `inset` per
non sporcare i vani vicini, **statico** — trenta celle che lampeggiano sono
un albero di Natale che dopo due giorni non guarda più nessuno. Uno per
cella, qualunque sia il numero di righe sbagliate dentro: la mappa risponde
«questo vano ha un problema», e il quanto si legge aprendo il pannello.

**IL CHIP SOLO SULLE RIGHE SBAGLIATE.** Nel pannello laterale le righe a
posto si disegnano come sempre; quelle fuori posto portano «Fuori posto», il
perché, e dove vanno rimesse. Misurato su `MAG1-RAKA-01-01-C`: **sette item,
uno solo marcato**. Mettere un contrassegno anche su quelle giuste — fosse
pure un «ok» verde — vorrebbe dire farne leggere dieci per trovarne uno.

**IL TRASFERIMENTO ARRIVA GIÀ COMPILATO.** Da entrambe le strade — pannello
della mappa ed elenco tabellare — la maschera si apre con la destinazione
scritta, la quantità sull'intera riga, il cursore **sul campo
dell'ubicazione** e il testo selezionato, così la scansione lo sostituisce
invece di accodarsi. Resta tutto editabile: chi è sul posto vede cose che il
sistema non sa.

`autofocus` in una stringa HTML iniettata **non scatta** — l'attributo agisce
al parse del documento e quel nodo arriva dopo. Si mette a mano.

**L'ANOMALIA SPARISCE SUBITO.** `doMoveItem` rinfresca la verifica di
stoccaggio PRIMA di ridisegnare: senza, la mappa continuerebbe ad accendere
un vano appena sistemato, e chi ha rimesso la merce dove va non crede più a
quello che legge. Poi mappa, pannello, e — se era aperto — l'elenco. Se era
l'ultima anomalia, l'elenco si chiude da solo.

### L'elenco riproporzionato

Alla prima stesura le righe erano alte **261 px** e la tabella scorreva di
lato: due righe visibili su quarantasei. Misurato, non dedotto.

| larghezza | riga | righe visibili | scorrimento |
|---|---:|---:|---|
| 1440 | **53 px** | 10 | no |
| 820 | 53 px | 9 | no |
| 500 | 109 px | 4 | no |
| 375 | 94 px | 5 | no |

Quattro correzioni, tutte sulla stessa idea — dare a ogni dato lo spazio che
merita e non di più:

- **il riquadro si allarga**, e solo per gli elenchi: `showModal` accetta una
  classe, e `modal-larga` vale `min(1100px, 94vw)`;
- **`table-layout: fixed`**, senza il quale il `<colgroup>` è solo un
  consiglio: la colonna «Perché» si prendeva 791 px su 1.042 e i puntini non
  comparivano mai, perché non c'era nessun bordo da cui traboccare;
- **una riga di testo e basta**, col testo intero nel `title`; la descrizione
  scende sotto il codice, il «va in» diventa una pastiglia in linea;
- **sotto i 720 px diventa una lista**, perché su un terminale in magazzino
  lo scorrimento orizzontale non lo trova nessuno.

Tre cose del ramo stretto sono nate dalla misura e non dal disegno:
`minmax(0, 1fr)` e non `1fr` — quel minimo `auto` è la larghezza della frase
intera e teneva la riga a 163 px; il tasto diventa **un'icona**, perché la
pastiglia con la parola dentro tagliava `MAG1-RAKA-01-03-A` a metà, e un
codice troncato non è un'abbreviazione ma un dato sbagliato; il tasto
**attraversa le tre bande**, perché i suoi 48 px di bersaglio tattile
imposti a una riga di testo alta 20 costavano 28 px per niente.

### La scansione: errore che non chiude, conferma che si vede

**UNA LETTURA SBAGLIATA NON CHIUDE PIÙ NIENTE.** `_scanAvanti` controlla ogni
passo del posizionamento. Se il codice non è né un vano né un'unità di
carico, `Feedback.signal('error', …)` dà suono, vibrazione, lampo e riquadro;
il fuoco **resta** nel campo col testo selezionato — così la scansione dopo
sostituisce invece di accodarsi, che è il difetto classico dei lettori — e la
maschera non si chiude, non si svuota, non avanza.

Un articolo fuori anagrafica **non è** una scansione sbagliata: è un articolo
nuovo, e questa maschera sa accoglierlo da sempre.

**IL CAMPO CONFERMATO SI VEDE DA UN METRO E MEZZO.** Diventa la stessa
pastiglia verde del riquadro di conferma — `--sx-success-soft` di fondo,
`--sx-success` di bordo e testo, bordo pieno da 2 px, grassetto. Lo stesso
verde e non uno suo: un campo confermato con un verde diverso insegnerebbe
due volte la stessa cosa con due segni diversi.

Vale su tutte e tre le maschere che leggono un codice — prelievo guidato,
conta d'inventario, posizionamento — con tre regole che valgono più del
colore: **si spegne al primo tasto** (un campo che resta verde dopo che
qualcuno ci ha riscritto dentro dichiara vero un dato che nessuno ha più
verificato), **l'errore lo toglie**, e **la tappa spostata su un'ubicazione
alternativa azzera tutti e tre** — il codice resta scritto perché serve
leggerlo, ma quel vano non l'ha ancora scansionato nessuno.

Il suono, misurato: `ok` sale 1046 → 1568 Hz in sinusoide, `error` scende 233
→ 175 Hz in onda quadra. Un'ottava e mezza di distanza, uno sale e l'altro
scende. Resta un punto da guardare al banco: `scan` (1320 Hz) e `ok` sono
tutti e due acuti e sinusoidali, e col rumore del reparto «ho letto» e
«tappa chiusa» possono somigliarsi più di quanto somiglino ok ed errore.

### Il difetto peggiore che questo applicativo abbia avuto

**`#dlgOverlay` che manca era un silenzio.** È un div vuoto dichiarato in
`index.html`: il pavimento su cui ogni finestra di dialogo si monta. Se non
c'era, `Dialog._open` usciva con `Promise.resolve(null)` — e `null` è la
stessa risposta che dà chi preme «Annulla».

**Ogni conferma del magazzino si comportava come un annullamento.**
`_routeConfirmStop` legge `if (qty === null) return`, e tornava indietro
senza una parola: nessun errore in consolle, nessun messaggio a video,
nessuna traccia nel registro. Da fuori, un tasto che non fa niente. E non
riguardava una maschera — prelievo, conta, smaltimento, quarantena e
spedizione passano tutte da lì.

Trovato il 27/08 al banco, e trovato **per caso**: un giro di pulizia del DOM
scritto da un agente aveva cancellato quel div dalla pagina viva, e dodici
clic sul tasto di conferma non avevano prodotto un solo errore.

Corretto con due cose insieme, perché nessuna basta da sola. **Si
ricostruisce**: il div è vuoto e inerte, il CSS lo aggancia per `id`, e
fermare un magazzino per un contenitore vuoto è sproporzionato — «meglio
fermo che vivo e sbagliato» vale quando il dubbio è sui DATI, e qui non c'è
nessun dubbio sui dati. **E urla**, una volta sola per sessione: la
ricostruzione ripara il sintomo e nasconderebbe la causa, e una causa
nascosta torna; ma trecento righe uguali in consolle sono di nuovo un
silenzio.

Sei collaudi nuovi in `test/dialogOspite.test.js`, di cui **due leggono il
sorgente** — perché quel `return` muto non lasciava nessuna traccia
osservabile, ed è esattamente il punto. Il DOM delle prove è scritto a mano,
come `test/ambiente.js` fa con `location` e `localStorage`: `_overlay` ha
bisogno di cinque funzioni in croce, e portarsi dentro jsdom per quelle
sarebbe una dipendenza per niente.

### Il conto di produzione, provato sul magazzino vero

Andrea l'ha indicato come «la parte più critica e debole», e la notte del 27
ci è passato sopra un ciclo intero — ordine vero, dati veri.

Prima però: **`areaWip` sul banco non era impostata**, e senza quella
`entraInWip` rifiuta ogni ingresso. Il banco non ha un vano di lavorazione —
ha un solo scaffale — quindi si è scelto `MAG1-RAKA-04-01-T`, livello a terra
in fondo corsia. È una chiave di `meta` e nient'altro: nessuna zona creata,
nessuna giacenza toccata.

Il ciclo che ne è uscito, sull'ordine `ODP2607777`:

| verso | colli | UM | |
|---|---:|---:|---|
| `in` | 1 | — | un collo entra in lavorazione |
| `out` | 1 | 10 KG | torna a scaffale |
| `consumo` | 0 | 15 KG | finito nel prodotto |
| `chiuso` | — | — | l'ordine si archivia |

**Il conto torna**: entrato 25 kg, tornato 10, consumato 15, **residuo 0**. E
i movimenti raccontano la stessa storia dal lato del magazzino — `PICK` dallo
scaffale, `IN` nell'area WIP, `MOVE` di ritorno: la merce non è mai sparita,
che è quello per cui il modulo esiste.

Le altre tre invarianti reggono: un ordine chiuso **non si riapre**
(`archiviato` risponde `true` anche in minuscolo o con gli spazi ai bordi);
la chiusura **non è merce** (un conto sulla sola riga `chiuso` dà `entrato:
0`, e non gonfia l'ordine di un collo che non esiste); un ordine mai visto
non inventa niente.

**IL PUNTO FRAGILE, ed è una voce nuova.** La riga `in` **non registra le
UM**: `qty_uom` è `null`, e i 25 kg si ricostruiscono dopo dalla confezione
congelata del lotto. A farlo è `Store.contoWip`, che passa a `conto()` il
ripiego `per_collo`. Finché si passa da lì il numero è giusto — ma quel
parametro è **facoltativo**, e chiamando `conto()` senza, lo stesso ordine
perfettamente in pari risponde `entrato_uom: null`, `residuo_uom: −25`,
`incoerente: true`. Un residuo **negativo** su un ordine chiuso in pari: un
numero plausibile e sbagliato, cioè la stessa forma del difetto dei dialoghi.
Oggi il chiamante è uno solo e il ripiego lo passa; il giorno che qualcuno ne
scrive un secondo e se lo dimentica, il conto mente. Voce 61.

### Due rinomine

«Da Ordine (XLSX)» è diventata **«Prelievo automatico»**, e «Conto
produzione» è diventata **«WIP»**.

---

## LA 2.8 È **COSTRUITA E CONSEGNATA**, E NON È ANCORA IN SERVIZIO

**Costruita il 26/08/2026, notte. Non installata: quello lo fa Andrea.** In
servizio resta la 2.7 — la sezione qui sotto — e le due cose non vanno
confuse, perché il pacchetto esiste e la produzione non l'ha ancora visto.

| | |
|---|---|
| `versione` applicativo | **2.8** |
| `VERSION` del servizio | **2.8** |
| impronta | `21c3f4b9a4ccd7857d65409bd80a3262a78b9dfe0782f62a288602c3dd6ca83e` |
| byte | **1.836.612** in **4 file** — 468 kB sul filo, compressi |
| dove | `consegna\Pathfinder 2.8\` |
| collaudi | **1.178 client**, tutti verdi — 64 più della 2.7 |
| tipi | `npm run check` a 0 su client e servizio |

**Il pacchetto porta anche il servizio**, e questo è il motivo per cui va
installato intero: la 2.8 aggiunge la **ventunesima collezione**
(`location_attrs`), e un client 2.8 contro un servizio 2.7 la vede rifiutare
con `400`. Non si rompe — `d.location_attrs ?? []` regge l'assenza, ed è
stato **provato davvero**: la 2.8 gira contro il servizio 2.7 di collaudo e
carica, semplicemente senza nessuna cella caratterizzata. Ma la funzione non
c'è finché il servizio non sale.

### Che cosa cambia: le regole di stoccaggio

Il motore c'era dalla 1.13 e proponeva; da qui in poi **decide**, e su due
cose non chiede il permesso a nessuno.

**LE DUE REGOLE CHE NON SI SCRIVONO.** Stanno in `modules/regoleBase.ts`,
non sono un record e non si cancellano.

1. **Lo stesso articolo sta sulla stessa unità di carico.** Consiglio forte,
   non divieto: prima una UDC aperta con lo stesso articolo E lo stesso
   lotto, poi una con lo stesso articolo, e fra pari **la più vuota** —
   riempire la più vuota tiene aperte meno unità. Chiuse e spedite escluse.
   **L'operatore scavalca**, e il motivo resta a registro.
2. **Lo stesso articolo/lotto sta nella stessa ubicazione.** Questa **non si
   scavalca**, e non è una questione d'ordine: `item_key` è `articolo#lotto`
   e la giacenza di quel lotto è UNA riga per vano. Lo stesso lotto in due
   vani è la stessa merce contata due volte, e il FEFO la ordina come due
   partite. Il 26/08 era già successo per una differenza di maiuscole —
   §2.6 — e quella volta bastò un lotto digitato in minuscolo.

**L'ECCEZIONE È DELLO STATO DEL VANO, NON DELLA PERSONA.** Se il vano di casa
è pieno, bloccato o disattivato — e **solo** allora — il lotto si estende su
un secondo vano e la mappa lo segnala. Chi decide non è l'operatore: è il
vano. Appena torna disponibile, la regola torna a mordere.

**DOVE MORDE, E DOVE NO.** Il controllo sta in `Store.addItem`, che è il
collo di bottiglia di tutto: non esiste un `moveItem` — uno spostamento è
`removeItem` seguito da `addItem` — quindi ogni merce che riceve
un'ubicazione nuova ci passa. E funziona sugli spostamenti **senza doverli
distinguere**: la rimozione avviene prima, quindi uno spostamento intero
lascia il lotto senza casa e passa, uno **parziale** la casa ce l'ha ancora
ed è esattamente il gesto da rifiutare.

`regolaBase: false` è la via d'uscita per le **correzioni**, e sono quattro,
tutte dichiarate sul posto: lo storno di un movimento (`app.ts`), la
rettifica di inventario (`inventario.ts`), la rettifica di una tappa di
prelievo (`percorso.ts`) e **l'ingresso in WIP** (`store.ts`). Le prime tre
registrano dove la merce **già sta**; la quarta è un'altra cosa e vale la
pena dirla per intero.

**L'AREA WIP È UN CONTO, NON UNO SCAFFALE.** Portare in produzione è quasi
sempre un prelievo parziale: applicare lì la regola vorrebbe dire rifiutare
ogni ordine che non svuota un lotto — cioè quasi tutti — e fermare la
produzione per difendere l'ordine di uno scaffale su cui quella merce non è
più. Per la stessa ragione il vano WIP **non è casa** in `caseDelLotto` e
**non si conta** fra i lotti sparsi: contarlo rifiuterebbe di posizionare a
scaffale un lotto di cui il reparto ha in mano tre colli.

### Il terzo vincolo, che si scavalca: la categoria merceologica

`storage_rules` sapeva dire «gli articoli che iniziano per 700» e «questo
articolo esatto». Adesso sa dire anche **«questa categoria»** e «le categorie
che iniziano per», ed è il modo in cui la domanda si pone davvero in
magazzino: «i detersivi stanno in MAG3» non è una regola sui codici, è una
regola su una **famiglia**. Scriverla come prefisso funziona solo dove
qualcuno ha avuto la disciplina di far cominciare tutti i detersivi con le
stesse cifre, e nessuna anagrafica cresciuta in vent'anni ce l'ha.
`category` sta su `Articolo` dalla v1 ed era già un indice a database.

**È un vincolo con override**: `impone` esclude dalle proposte e chi
posiziona altrove deve dichiarare perché.

**CHI È PIÙ PRECISO ZITTISCE CHI È PIÙ GENERALE**, e questa parte è nuova
anche per le regole vecchie. `regolePerArticolo` restituisce **solo il
livello più preciso che ha colpito** — codice esatto, poi prefisso, poi
categoria — e non più tutti insieme. Il perché: con due regole che impongono,
«7001234 va in MAG1» e «i detersivi vanno in MAG3», tenerle entrambe voleva
dire accettare i vani di MAG1 **e** quelli di MAG3, perché al motore basta
che UNA sia soddisfatta. La decisione presa su quell'articolo preciso sarebbe
stata annacquata proprio dalla regola generale che doveva scavalcare. La
priorità continua a ordinare **dentro** un livello, che è il lavoro per cui
esiste.

### La pericolosità: c'era dal 1.6 e il motore non l'ha mai letta

`hazard_zone` e `hazards` si configuravano sulla zona dal 1.6, si vedevano in
maschera, e poi il motore proponeva **come se non ci fossero**. Da qui in poi
valgono, simmetrici agli allergeni: merce pericolosa solo dove è ammessa,
merce pulita fuori dall'area dedicata — e l'asimmetria apparente ha la stessa
ragione degli allergeni, che l'area dedicata serve a non contaminare il
resto, quindi è il prodotto pulito a rischiare quando ci finisce dentro.

**LA CELLA «RISERVATA» NON DEROGA QUI**, e non è un'incoerenza. «Riservata» è
la decisione di ammettere un allergene in un posto pulito: è un rischio di
contaminazione, ed è organizzativo. Un comburente accanto a un infiammabile
non è organizzativo — è la stessa fisica della temperatura, e su quella §6
dice già che non si deroga.

**LA MATRICE DI INCOMPATIBILITÀ.** Due pericolosità entrambe ammesse dalla
zona possono essere incompatibili **fra loro**, e la zona non ha modo di
dirlo: sono tutte e due «pericolose». La matrice è un dato in
`meta.matriceIncompatibilita`, e si configura da Regole di stoccaggio come
una **griglia** — mezza griglia, perché la coppia non ha un ordine e due
caselle per la stessa domanda prima o poi si contraddicono a video.

**Mai configurata e configurata vuota sono due cose diverse.** `null` vuol
dire che nessuno ci ha messo mano, e allora valgono le tre coppie di serie —
comburente/infiammabile, corrosivo/infiammabile, comburente/corrosivo. Un
elenco **vuoto** è una decisione presa, «da noi nessuna coppia è
incompatibile», e vale quel che dice. La scheda lo scrive a chiare lettere
finché è di serie, perché «tre coppie» e «tre coppie che avete scelto voi»
non sono la stessa informazione per chi firma.

Il motore confronta quel che **arriva** con quel che **c'è già nel vano**;
sul magazzino fermo la stessa domanda la fa `verificaConformita`, che accusa
**tutte e due** le righe della coppia — non c'è modo di sapere quale sia
arrivata per ultima, e dire «questa è di troppo» sceglierebbe a caso chi deve
spostarsi.

### La ventunesima collezione: `location_attrs`

Fino alla 2.7 temperatura, allergeni e pericolosità stavano **solo sulla
zona** e scendevano identiche a tutte le sue celle. Uno scaffale però non è
omogeneo: il livello a terra regge il doppio di quello in quota, la cella
davanti al portone è più calda del fondo corsia, e la campata con la vasca di
contenimento è l'unica che può tenere un corrosivo.

**LA ZONA RESTA LA SORGENTE, LA CELLA SCAVALCA.** Un campo assente sulla
cella non vuol dire «nessun vincolo»: vuol dire «come dice la zona». È la
differenza che tiene in piedi le migliaia di celle già configurate, nessuna
delle quali ha un record. Su duemila ubicazioni ce ne saranno dieci, ed è
giusto così. Nella maschera ogni campo ha **tre** stati e non due — «come la
zona», «così», «qui no» — e la tendina scrive il valore della zona fra
parentesi, invece di presentare un campo vuoto che sembra «nessun vincolo».

Si caratterizza da **Mappa → dettaglio ubicazione → 🎯 Caratterizza**, e sta
lì e non in Configurazione perché chi decide che QUESTA campata regge meno
delle altre lo decide con la campata davanti, non da una tabella di duemila
righe. «↺ Torna alla zona» toglie il record: non disattiva niente, rimanda la
cella a quel che dice la sua zona.

**CAPIENZA E PORTATA SONO SEMPRE DELLA CELLA**, e qui si chiude un difetto
vecchio. Una capienza di zona non vuol dire niente — la zona è l'insieme dei
vani, non un vano — e fino alla 2.7 il motore la cercava su `zona.capienza`,
che **non è mai esistita nemmeno come campo del tipo `Zona`**. Il vincolo
c'era e non mordeva mai: `modules/kpi.ts` lo dice da allora, «il motore di
stoccaggio ha il vincolo e non lo usa mai». La **portata in chili** è nuova, e
sta sulla cella per la stessa ragione: un livello in quota e uno a terra non
reggono lo stesso peso.

### I tre motivi precompilati dello scavalco

Fino alla 2.7 lo scavalco aveva un campo di testo libero e basta. Un campo
libero su un terminale, con la merce in mano e il muletto acceso, si compila
con «ok», «vedi sopra» o niente — e allora il dato che dovrebbe dire fra tre
mesi se le regole valgono non dice più niente. Adesso ci sono **tre bottoni**,
in `MOTIVI_SCAVALCO`:

- il posto proposto non è raggiungibile col mezzo disponibile;
- merce in uscita a breve, tenuta vicino alla baia di spedizione;
- il posto proposto è occupato o non ha lo spazio che dichiara.

**Tre e non dieci**: un elenco lungo torna a essere una scelta da leggere,
cioè lo stesso costo del campo libero con in più l'illusione di aver misurato
qualcosa. **Il testo libero resta accanto**, per il caso che i tre non
coprono: chi lo compila sta dicendo qualcosa che vale la pena leggere proprio
perché ha fatto la fatica di scriverlo.

### Che cosa ha trovato, acceso sul magazzino vero

Misurato il 26/08 sul collaudo, contro le **886** righe di giacenza vere:

| | |
|---|---:|
| lotti che stanno in **due** ubicazioni | **28** |
| righe di giacenza coinvolte | **59** |
| vani coinvolti | **32** |
| ubicazioni valutate per proposta | **330** |
| tempo di una proposta | **2,1 – 2,8 ms** |

**Le 59 righe non sono un difetto della 2.8: sono quello che c'era già.** La
regola nuova le rende visibili, e la mappa le segnala come `LOTTO_SPARSO`,
gravità **media** — perché non sono un errore di nessuno, sono il magazzino
com'è. Vanno guardate e ricomposte, voce 36.

Provato anche il rifiuto vero, sul lotto `262567` dell'articolo `6001668`,
che sta in `MAG1-RAKA-01-01-A`: `addItem` su un altro vano alza
«…lo stesso lotto sta in un'ubicazione sola e questa non si scavalca.
Posiziona in MAG1-RAKA-01-01-A», e le righe di giacenza restano **886 prima e
886 dopo** — rifiuta **prima** di scrivere qualunque cosa.

### Il difetto trovato per strada: i destinatari non rientravano in cache

Cablando la collezione nuova è venuto fuori che **`recipients` non veniva mai
assegnato in `_loadCache`**. I due adapter lo leggevano dal 1.6, `_loadCache`
lo lasciava cadere, e la prima volta che qualcuno scriveva un destinatario
`_applyToCache` popolava l'elenco per il resto della sessione. Chi apriva un
DDT **senza aver toccato prima l'anagrafica trovava zero destinatari** e li
riscriveva a mano. Il difetto si nascondeva da solo: bastava aver scritto un
destinatario in quella sessione perché sparisse. Corretto.

---

## LA VERSIONE IN SERVIZIO È LA **2.7**, E GIRA SU **POSTGRESQL**

**Installata e accesa da Andrea il 26/08/2026 sera.** È il primo giorno in cui
il magazzino non sta su un file SQLite. Misurato sulla 4173 subito dopo:

| | |
|---|---|
| `service_version` | **2.7** |
| `versione` applicativo | **2.7** |
| impronta | `17cb722bf14e876c7a5301c9c4c6f4017dae7750da79530e405b046a298658d5` |
| byte | **1.800.084** in **4 file** |
| **database** | **PostgreSQL 17** — `pathfinder` su `127.0.0.1:5432`, ruolo `pathfinder` |
| dove | `C:\Pathfinder\app\corrente` |
| via di ritorno | `C:\Pathfinder\app\precedente` → **2.6**, `d3865c53…` |
| collaudi | **1.347 passate**: 1.114 client · 98 di servizio su SQLite · 98 di servizio su PostgreSQL · 8 di migrazione schema · 29 di installazione |

**I due numeri coincidono, e l'impronta è quella del pacchetto costruito.**

### I dati sono passati interi, e si è contato dopo

| | prima, su SQLite | dopo, su PostgreSQL |
|---|---:|---:|
| articoli | 11.197 | **11.197** |
| giacenze | 886 | **886** |
| movimenti | 321 | **321** |
| operatori | 7 | **7** |
| unità di carico · conti WIP | 4 · 28 | **4 · 28** |

Venti tavoli, conteggi ricontrollati uno per uno dalla migrazione e poi di
nuovo da `/api/health`. **Il file SQLite non è stato toccato**: la migrazione
lo legge e basta, e resta a `C:\Pathfinder\data\pathfinder.db` con dentro
tutto. La copia presa prima è `banco/db/prima-di-postgres-2026-08-26-1903.db`.

Le sequenze sono state riallineate sopra le chiavi già scritte — `inventory`
riparte da 2892, `mov_log` da 1075, `articles` da 111837 — perché il `_id` si
è **preservato e non rigenerato**: `tasks.mov_ids` punta a quei numeri.

### Come si torna indietro

Un comando, da amministratore, e il magazzino riapre il file SQLite:

```powershell
& "C:\Pathfinder\servizio\installa-servizio.ps1"
```

Senza `-PostgreSQL` la variabile di macchina torna vuota. **Quel che è stato
scritto su PostgreSQL nel frattempo resta lì e non rientra da solo**: il file
SQLite è fermo alla sera del 26/08. Per un ritorno d'emergenza è il gesto
giusto; per un rientro ordinato si migra al contrario, e quello script non
c'è ancora.

### Il backup funziona, ed è stato visto funzionare

`backup-serale.ps1` non sa quale database c'è dietro: chiede a
`POST /api/backup` e legge il nome dalla risposta. Su PostgreSQL il servizio
fa un `pg_dump` in formato custom e **lo rilegge con `pg_restore --list`
prima di dichiararlo buono**; se la rilettura fallisce il file si cancella,
perché un file lasciato lì si fa contare da chi guarda la cartella.

Provato di persona il 26/08 alle 19:09, sul magazzino vero:
`pathfinder-2026-08-26-1909.dump`, 419 KB, **21 tavoli con dati dentro**,
`exit 0`. E il registro racconta il passaggio da solo:

```
2026-08-25 20:00:00  OK  pathfinder-2026-08-25.db         (6 MB)
2026-08-26 19:09:18  OK  pathfinder-2026-08-26-1909.dump  (0.4 MB)
```

### Cosa è costato accendere, e nessuno l'aveva previsto

| Cosa | Come si è visto |
|---|---|
| **`pg` non era nel servizio installato.** L'installer reinstallava le dipendenze solo se `node_modules` mancava *del tutto*, e quella della 2.6 c'era. Con `PATHFINDER_PG` accesa il servizio non sarebbe partito, e i terminali avrebbero visto bianco | Misurato **prima** di installare, non dopo. Ora l'installer guarda dipendenza per dipendenza come le dichiara `package.json`, nomina quale manca, e si ferma se dopo `npm install` ne manca ancora una |
| **La verifica finale dell'installer gridava al lupo su un'installazione riuscita.** Confrontava il database aperto col percorso del file SQLite: su PostgreSQL concludeva «il servizio ha aperto un altro database» e usciva con 1 | Visto all'accensione. Corretto: con `-PostgreSQL` si confronta il nome del database. **Il ramo del ritorno indietro non è cambiato**, ed era già giusto |
| **Il segnaposto della password non era stato sostituito.** `LA-TUA`, sei caratteri, finito dentro la variabile di macchina | Il servizio **non è partito**, ed è il comportamento voluto: meglio fermo che vivo senza database. Rilanciato con la password vera |

**Le prime due le ha trovate il guardare prima di premere.** La terza l'ha
trovata il servizio rifiutandosi di partire — che è esattamente quello per
cui quel rifiuto è stato scritto.

### Quel che resta da guardare in faccia

**Il database sta sulla stessa macchina del servizio.** Non è Azure: il
magazzino si ferma quando si ferma questo PC, esattamente come quando i dati
stavano in un file. Il primo punto di `server/azure/LEGGIMI.md` — «niente
lavoro senza linea» — **non è ancora stato pagato**, e si paga il giorno che
il database esce dal PC.

**Il ritorno indietro riporta l'applicativo, non i dati.** Da oggi la via di
casa è il `.dump` della sera prima, non il file SQLite: quel file invecchia
da adesso.

---
### Cosa porta la 2.6

**IL SERVIZIO DATI PARLA DUE DATABASE.** Lo decide una variabile di macchina:
`PATHFINDER_PG` assente → SQLite, esattamente come la 2.5; presente →
PostgreSQL. **La 2.6 si installa in magazzino senza toccare il database**, e il
passaggio a PostgreSQL è un secondo gesto, separato, che si annulla spegnendo
una variabile. La 2.3 ha già insegnato quanto costa un salto solo senza via di
ritorno.

**I CODICI SI SCRIVONO IN MAIUSCOLO.** Articolo, lotto, `item_key`, ubicazione,
UDC, ODP, DDT, sigla operatore: li normalizza il servizio a ogni scrittura, da
qualunque parte arrivino, e il client li maiuscola mentre si digita — lettore
ottico compreso, perché il lettore è una tastiera. **Non si toccano** il PIN
(è base64: maiuscolarlo lo distruggerebbe), le chiavi di `meta` (sono
camelCase), gli enum (`'empty'`, `'pallet'`, `'open'`) e la prosa.

**L'INTERFACCIA DEL SERVIZIO DATI È ASINCRONA.** `better-sqlite3` è sincrono e
`pg` no: le ventiquattro rotte, le operazioni composte e i collaudi del
servizio sono diventati `await`. Era il pezzo di lavoro più grosso, ed è quello
che il LEGGIMI del ramo Azure dichiarava «non è in questo ramo».

**I GIRI DI RETE TOLTI DAI CICLI.** `bulkPut` scriveva una INSERT per record:
483 ms su un file locale e **11.197 giri di rete** verso una regione Azure per
la sola anagrafica articoli — quasi tre minuti, cioè un import che va in
timeout invece che in porto. Ora sono **12 istruzioni**. `countAll` passa da
venti `COUNT` a uno.

### Cosa la 2.6 ha trovato guardando, e nessuno sapeva

| Cosa | Dove |
|---|---|
| **Lo stesso lotto era a scaffale DUE volte.** `6001412#cl260854` con 5 pezzi e `6001412#CL260854` con 1, in `MAG1-RAKA-01-05-C`: stessa merce, due grafie, e il FEFO le ordinava separate. **Fuse in una riga da 6**, con un `EDIT` a registro che dice cosa e perché | È la ragione per cui il maiuscolo esiste |
| **`startsWith` voleva dire tre cose diverse.** Sensibile alle maiuscole in Dexie e nella cache del client, **insensibile sul servizio** — l'unico dei tre a usare `LIKE`. Ora è `substr(colonna, 1, N) = ?`, uguale nei due database | `server/lib/sql.js` |
| **Il backup nominava i file in UTC.** Alle 01:52 del 26/08 il file nasceva `pathfinder-2026-08-25.db`, **lo stesso nome del backup serale delle 20:00**, e glielo scriveva sopra. Ora il giorno è quello locale, e un secondo backup nello stesso giorno prende l'ora | `POST /api/backup` |
| **DUE TERMINALI POTEVANO ENTRARE NELLA STESSA TRANSAZIONE.** `transaction()` distingueva «già dentro» da «chiamante nuovo» con un flag d'istanza: una seconda richiesta HTTP arrivata mentre la prima aveva la transazione aperta lo trovava alzato e girava **dentro la transazione dell'altro terminale**. Su SQLite non si vedeva — gli `await` si risolvono in microtask e la prima transazione finisce prima che Express prenda la seconda richiesta. **Su PostgreSQL si è visto alla prima corsa**, con la prova della contesa che passava due volte su due. Chiuso con `AsyncLocalStorage`, che segue la catena asincrona invece dello stato dell'oggetto | `server/lib/driver-base.js` |
| **`BIGINT` tornava come stringa.** `pg` decodifica `int8` in stringa per non perdere cifre: il client avrebbe ricevuto `_id: "1"` da PostgreSQL e `_id: 1` da SQLite, e `tasks.mov_ids` confronta quei numeri con `===` | `server/lib/driver-postgres.js` |
| **Lo stesso rifiuto tornava 409 su un database e 500 sull'altro.** SQLite alza `SQLITE_CONSTRAINT_UNIQUE`, PostgreSQL lo SQLSTATE `23505`, e la mappa ne conosceva solo metà: al terminale, «ci hai riprovato» contro «il servizio si è rotto» | `SQL_CONSTRAINT` |
| **Il certificato non si verificava.** La prima stesura del driver scriveva `rejectUnauthorized: false`, che accetta qualunque certificato — cioè accetta anche chi si mette in mezzo, con la stringa di connessione e il PIN degli operatori che passano da lì. Corretto: si verifica, e una CA aziendale si indica con `PATHFINDER_PG_CA` | `server/lib/driver-postgres.js` |

**Le prime tre le ha trovate l'audit dei dati; le altre quattro le ha trovate
la batteria che fa girare le STESSE prove sui due driver a confronto.** Nessuna
sarebbe uscita provando un database solo.

### Quel che la 2.6 lasciava aperto, e che la 2.7 ha chiuso

**IL BACKUP CAMBIAVA PADRONE E NON ERA RIFATTO.** Con SQLite si copia un file;
con PostgreSQL quel file smette di cambiare, e alle 20:00 lo script serale
avrebbe copiato un `.db` fermo scrivendo `OK` nel registro — il guasto
peggiore, quello che non si vede. Era la ragione per cui la 2.6 è stata
installata **senza** accendere `PATHFINDER_PG`.

**Chiuso con la 2.7**, e provato sul magazzino vero: `pg_dump` in formato
custom, riletto con `pg_restore --list` prima di essere dichiarato buono, e
cancellato se non si rilegge. Voce **53**, chiusa.

---

## LA 2.6 È LA VIA DI RITORNO

È stata in servizio dalla notte del 26/08 fino alla sera dello stesso giorno,
e adesso sta in `C:\Pathfinder\app\precedente`: impronta `d3865c53…`,
1.800.084 byte in 4 file. È la prima versione che ha parlato due database, e
la 2.7 non aggiunge funzioni all'applicativo — aggiunge il backup su
PostgreSQL e l'installer che sa accenderlo.

**I byte dell'applicativo sono in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.6/`,
confrontati per sha256 col manifesto: quattro file su quattro identici.** La
metà servizio non c'è, perché `npm run build` azzera `consegna/` e la 2.7 è
stata costruita prima che la 2.6 fosse archiviata: sta al commit `9796048`, e
il LEGGIMI dentro la cartella dice come rifare il pacchetto e quale impronta
deve tornare.

**Tornare alla 2.6 vuol dire tornare a SQLite**, perché la 2.6 conosce
`PATHFINDER_PG` ma non sa farci il backup: girerebbe, e alle 20:00 lo script
serale copierebbe un file fermo scrivendo OK. Se si torna indietro, si torna
**anche** al file — cioè si rilancia `installa-servizio.ps1` senza
`-PostgreSQL`.

---

## LA 2.5 È ARCHIVIATA

È stata in servizio il 26/08. Impronta `8ed505b9…`, 1.798.524 byte in 4 file,
pacchetto in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.5/`. Le unità di
misura al carico su 11.115 articoli, e il prelievo da ordine.

**Si porta dietro la voce 51**, che resta aperta: la rettifica di una tappa
già prelevata e il salta tappa sono entrati in servizio con lei e non sono
mai stati esercitati da capo a fondo. Né la 2.6 né la 2.7 li toccano.

---
## LA 2.3 È RITIRATA

**Ha disfunzionato, ed è stato necessario un ripristino d'emergenza alla 2.2.**
Non si installa e non si riprende così com'è. Archiviata il 25/08 in
`ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/`,
dove stanno il pacchetto costruito (`367d977e…`) e **il ramo git intero in un
bundle** — `2.3-reparto-e-giro-conto.bundle`, commit `d717098`, storia completa,
recupero provato il giorno stesso dell'archiviazione.

Il ramo non esiste più nel repository: **`main` è l'unico ramo.**

Quel che la 2.3 voleva risolvere resta un problema aperto — cinque ODP che
chiedono 5 KG dello stesso lotto l'uno contro una confezione da 25, il primo
prelievo che si porta via il collo intero e i quattro percorsi dopo che dicono
«lotto non trovato». Il caso è descritto in §1 perché il giorno che si riprende
non si ricominci a ragionarci da capo. **La strada scelta allora no.**

---

## Il riordino del 25/08

Fatto la sera del 25/08, dopo la ricognizione:

- **`MAPPER.worktrees/` eliminata** — 321 MB. Non era un worktree ma un clone
  separato che puntava ancora al vecchio remoto `pathfinder.git`, con dentro una
  `consegna/` sua ferma alla build sbagliata del 20/08: è **la cartella che il
  24/08 mandò in servizio il difetto per tre ore**. Verificato prima di
  cancellare che non contenesse un solo commit, tag o stash che `MAPPER` non
  avesse già.
- **`ARCHIVIO/` è uscita dal repository.** 139 file smessi di tracciare, tutti
  ancora su disco. Il perché sta in `.gitignore`, scritto per esteso.
- **Il banco di prova è passato da 100 MB a 17 MB**: tutto ciò che riguarda
  1.6.1, 1.7, 1.8.x, 2.0 e 2.3 — corse, copie del database, cartelle-versione —
  è in `ARCHIVIO/BANCO STORICO/`. Resta il materiale della 2.2.
- **La radice è sgombra**: `pathfinder-1.6.html` e `pathfinder-1.6.1.html`, gli
  ultimi due monoliti del modo «file singolo», sono scesi in
  `ARCHIVIO/VERSIONI PRECEDENTI/`.
- **I due rami `agents/*`** erano fusi in `main` senza un commit proprio:
  cancellati.

**Il repository è IN PARI con GitHub** — 26/08, dopo il push della 2.5:
`main` e `origin/main` stanno tutti e due a `9c3fffd`. Prima di stanotte il
remoto era fermo a `ecbf5b4`, la 2.4 in servizio.

Il database **non è stato migrato**, perché non c'era niente da migrare: né la
2.1 né la 2.2 toccano `lib/schema.js`.

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
in GMP. Servito da Node + Express su rete interna, porta **4173**. **Il
database è PostgreSQL dal 26/08/2026** — `pathfinder` su `127.0.0.1:5432`,
sulla stessa macchina del servizio — e il servizio sa parlare anche SQLite:
lo decide `PATHFINDER_PG`, e senza quella variabile riapre
`C:\Pathfinder\data\pathfinder.db`, che è ancora lì. Più terminali, un solo
database, l'arbitro è il server. UNLICENSED, uso interno.

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

### Il 26/08 — le unità di misura al carico, e il prelievo da ordine

Due giri di lavoro nella stessa notte, tutti e due chiusi nella **2.5**.

#### Il carico non gestiva le UM su quasi nessun articolo, e nessuno lo vedeva

Andrea: «la gestione dei colli e della uom non funziona correttamente… alcune
volte funziona altre no». Misurato sull'anagrafica vera — **11.197 articoli** —
il numero era peggio di «alcune volte»:

| stato UM in anagrafica | articoli | prima | dopo la 2.5 |
|---|---|---|---|
| unità valida **+** quantità per collo | **2** | funzionava | funziona |
| unità valida, **senza** quantità per collo | **4.036** | maschera nascosta | **riparati** |
| unità **non riconosciuta** | **7.159** | nascosta in silenzio | 7.077 riparati, **82 restano fuori e lo dicono** |

**Quattro cause, tutte diverse.**

1. **La maschera si nascondeva da sola.** `_anteprimaColliIn` apriva il blocco
   «Suddivisione dei colli» solo con `pieces_per_pack > 0`. Ma dichiarare
   «10 × 1.000» **non chiede di sapere quanto sta in un collo pieno**: quel
   numero serve a precompilare la prima riga, e basta. Il cancello è
   diventato l'**unità**, e la prima riga nasce vuota quando la confezione non
   c'è. Sono i 4.036.
2. **Un lotto congelato senza quantità per collo restava rotto per sempre.**
   `getUomConfig` era `daLotto(...) ?? configurazione(articolo)`, e il `??` non
   ripiegava **mai**: `daLotto` restituisce un oggetto anche col per-collo
   vuoto. Compilare l'anagrafica dopo non riparava quel lotto — ed è la ragione
   per cui lo stesso articolo si comportava in due modi. Ora ripiega **a
   lettura e a unità uguale**, senza riscrivere una riga. **Questo cambia la
   voce 6.**
3. **`NR` non era un dato mancante: era una codifica non tradotta.** SAGE X3
   chiama `NR` la quantità a numero, e **7.077 articoli su 11.197** la portano.
   Letta come «unità non gestita», teneva fuori dalla gestione a UM due terzi
   del magazzino per una differenza di due lettere. Tradotta in `misure.ts`,
   **una riga sola**: si legge, non si riscrive, e l'export continua a dire
   `NR`. Restano fuori di proposito `SCA` 48, `CON` 18, `RT` 7, `CAS` 4, `M2` 2,
   `BAN` 1 e **due celle con dentro testo libero** — quelle sono errori di
   compilazione della colonna UM: `MIN EPA=105 MG/G` e simile. Scatola,
   confezione e cassa nominano un **contenitore**, e in questo sistema il
   contenitore è il collo, cioè `qty`.
4. **Tre difetti minori della maschera**, tutti intermittenti: le righe non si
   azzeravano al cambio articolo (sigla nuova, «per collo» del precedente); il
   campo ④ Colli mostrava il totale ma scriveva sulla **prima riga**, quindi con
   due misure lo corrompeva; il passo dei campi era fisso a `0,001` anche su PZ
   e GR.

**E sparire in silenzio era la metà del difetto:** un blocco che c'è su un
articolo e non sull'altro, senza una riga che dica perché, **è** l'applicativo
che «alcune volte funziona e altre no» per chi lo usa. Adesso lo dice, e dice
dove si compila.

Lo **scarico non è stato toccato**: funzionava, e funziona.

#### Il prelievo da ordine — sette interventi

1. **Le richieste di trasferimento non si accorgevano della merce arrivata.**
   `tappaInAttesa` scriveva `qty_available: 0` — vero il giorno in cui il
   percorso nasce — e quel numero restava **congelato nella sessione**. Il
   compito e il vano di partenza vivevano in una mappa dentro la vista, che
   **muore quando il percorso parte**. Risultato: la tappa arrivava a scaffale
   dicendo «0 colli» anche a merce arrivata, e senza niente che dicesse perché.
   Ora il compito **viaggia con la tappa** (`transfer_task`, `transfer_from`) e
   la disponibilità si rilegge **a ogni render** — che serve anche senza
   trasferimenti, perché fra l'import e la tappa un altro terminale può aver
   mosso quella riga. In testa alla scheda una banda dice se la merce è
   arrivata o no, con lo stato del compito letto dalla coda, e offre
   **↻ Ricontrolla il vano** e **↷ Salta e vai avanti** — che rimanda la tappa
   in fondo al giro, che non è «non trovata».
2. **La scansione dell'ubicazione si rifà a ogni tappa e a ogni apertura.**
   `_routeScan` si azzerava nel render, ma il render non è l'unica strada per
   tornare davanti alla scheda: si rientra dalla tessera, dalla ripresa
   all'avvio, dal cambio di sottomodo. Adesso la scansione porta **per chi
   vale** — `<tappa>@<ubicazione>@<apertura>` — e la conferma la ricontrolla
   prima di scrivere. Come effetto si chiude un buco vero: spostarsi su
   un'ubicazione **alternativa** precompilava il campo e dava la spunta per
   buona, quindi si poteva confermare un prelievo da un vano davanti al quale
   non si era mai passati.
3. **Un tasto pausa**, con le pause scritte sulla sessione come fatti con
   un'ora d'inizio e una di fine. In pausa la scheda sparisce e la conferma si
   rifiuta anche da tastiera. Il report scorpora il fermo: su quattro ore
   d'orologio con un'ora di mensa e dieci righe, **il tempo medio passa da 24 a
   18 minuti a riga**.
4. **Una tappa già prelevata si riapre dall'elenco** e si rettifica. Non
   riscrive il prelievo — quello è successo: scrive un `REPOS` che riporta
   indietro i colli, e se il prelievo aveva le misure sceglie fra **quelle**,
   perché rimettere «due colli» su un prelievo fatto di un 25 e di un 7 sarebbe
   un saldo giusto sui colli sbagliati. Il conto di produzione scende di
   conseguenza. **Solo in meno**: prendere altri colli non è una correzione, è
   un secondo prelievo.
5. **I colli si propongono dai più piccoli** — e la regola è cambiata durante
   il collaudo. Scritta alla lettera, con l'arrotondamento per eccesso di
   sempre, **25 KG chiesti proponevano 49 KG**: due residui da 7, uno da 10 e
   poi un sacco intero da 25 per coprire l'ultimo chilo. Quel chilo non è un
   collo da prendere, è un collo da **aprire**, e la finestra ha già il campo.
   I due versi ora arrotondano all'opposto: `pieni` per eccesso, `spaiati` per
   difetto — e **gli spaiati non prendono mai un collo che sfonda l'ordine**.
   Sulla riga vera dell'ODP, 44,42 KG da sacchi da 25: un sacco intero più
   19,42 aperti dal secondo. L'anteprima dice di quanto si eccede **prima**
   della conferma.
6. **Il report porta le UM prelevate**: colonna accanto ai colli, imballo sotto
   («1 × 20 + 1 × 8,5 KG»), riepilogo **per unità** — «228,5 KG · 500 PZ»,
   perché chili e pezzi in una casella sola non vorrebbero dire niente — riga
   dei tempi con la pausa, e le righe rettificate con la motivazione.
7. **Sovrapposizioni: nessuna**, misurate a 375 px, 482 px e sulla larghezza
   del foglio **con le regole di stampa applicate**. Tre cose sistemate: la
   nona colonna aveva stretto «Descrizione» a **92 px** perché le ubicazioni in
   `nowrap` sfondavano la loro colonna; sotto i **430 px** la scheda passa a
   colonna singola, che è la forma preferita e lì l'unica leggibile; e
   **`_fmtKg` forzava tre decimali ovunque** — cinquecento pezzi comparivano
   come «500,000» nella colonna Ordinati e «500 PZ» in quella accanto, lo
   stesso numero in due modi su due celle che si toccano. Adesso passano tutte
   e due da `formattaQuantita`, che legge l'unità. È la regola già scritta in
   testa a `misure.ts`.

**Una contraddizione da sciogliere, e non è di questo giro:** la sezione della
2.4 elenca la **voce 19** fra le due correzioni che quella versione porta,
mentre la coda di lavoro la tiene ancora aperta. Una delle due righe è
sbagliata e non si sa quale.

### Il 25/08 — il servizio girava dalla cartella di lavoro, ed è stato corretto

**Era la trappola più grossa trovata finora, ed è chiusa.** L'installazione del
10/08 lo aveva scritto nel suo log e nessuno lo ha più riletto:

```
Applicativo   C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER\server\pathfinder-server.js
```

L'attività pianificata «Pathfinder - Servizio dati» lanciava **il file del
repository**, non `C:\Pathfinder\servizio\pathfinder-server.js`.
`installa-servizio.ps1` registra l'attività con la cartella **da cui viene
lanciato**, e il 10/08 fu lanciato dalla cartella di lavoro: da allora ogni
aggiornamento ha copiato il servizio al suo posto senza mai ri-registrare
l'attività.

**Due conseguenze, e furono tutte e due serie.** Chi lavorava al progetto
scriveva in produzione senza saperlo — cambiare `VERSION`, che è il primo gesto
di ogni versione nuova, cambiava il numero che il magazzino dichiara al riavvio
successivo — e **nessuna installazione poteva riuscire**, perché il controllo
finale confronta `service_version` col numero del pacchetto e il servizio
leggeva il file sbagliato. È il motivo per cui la 2.2 falliva con «Il servizio
non è quello di questa versione»: il messaggio parla di riavvii perché è il caso
che si aspettava — un processo vecchio ancora vivo — e lì il processo era nuovo
e leggeva il file sbagliato.

**Corretto il 25/08 all'01:49**, ri-registrando l'attività da
`C:\Pathfinder\servizio`. Da allora la 4173 dice **2.2 due volte**.

#### La prova, e perché non basta guardare il numero

Adesso i due `pathfinder-server.js` dicono **2.2 tutti e due**: il numero non
distingue più quale dei due il servizio stia eseguendo. A distinguerlo sono le
ore, misurate il 25/08 sera:

| fatto | ora |
|---|---|
| `C:\Pathfinder\servizio\pathfinder-server.js` scritto | 01:39:50 |
| processo node avviato **da svchost**, cioè dall'Utilità di pianificazione | **01:49:28** |
| `MAPPER\server\pathfinder-server.js` riportato da 2.3 a 2.2 | 01:54:19 |

Il processo è partito **cinque minuti prima** che il file della cartella di
lavoro tornasse 2.2. Node legge il file all'avvio e non lo rilegge: se stesse
eseguendo quello del repository direbbe ancora 2.3. Dice 2.2, quindi esegue
quello dell'installazione. Il filo è tagliato.

> **`Get-ScheduledTask` non vede le due attività di Pathfinder, e non vuol dire
> che non ci siano.** Senza privilegi di amministratore le omette in silenzio —
> 219 attività elencate, nessuna che le nomini. A dire la verità è
> `Export-ScheduledTask`, che distingue i due casi: «Impossibile trovare il
> file» per un nome inventato, **«Accesso negato»** per «Pathfinder - Servizio
> dati» e «Pathfinder - Backup serale». Esistono e girano — `backup.log` porta
> la riga delle 20:00 di ogni sera, ininterrotta.
>
> Chi vuole leggerle davvero apre PowerShell **come amministratore**.

### Lo stato della produzione, misurato il 25/08 alle 21:18

| | |
|---|---|
| applicativo in `C:\Pathfinder\app\corrente` | **2.2**, impronta `08ce3f69…`, 1.777.087 byte, 4 file |
| servizio che risponde sulla 4173 | **2.2** |
| modo | `cartella` — comanda `PATHFINDER_APP_DIR` |
| attività pianificate | «Pathfinder - Servizio dati» e «Pathfinder - Backup serale», tutte e due attive |

**È lo stato buono, e va difeso.** Prima di quell'installazione, in
`C:\Pathfinder\app\corrente` c'era la 2.2 **sbagliata** — `62992e15…`, la build
difettosa del 20/08 — e la 4173 rispondeva 2.3: ci si era arrivati installando
la 2.3 all'01:29 e tornando indietro all'01:35, e `torna-indietro.ps1` riporta
**solo l'applicativo, per scelta scritta** (§5). Servizio 2.3 e applicativo 2.2
è lo stato che quel gesto lascia, non un guasto — ma l'applicativo tornato
indietro era quello sbagliato.

In `C:\Pathfinder\app\` restano le cartelle di nove versioni vecchie, da
`pathfinder-1.8.2` a `pathfinder-2.3`, più `precedente` che porta la 2.3. Non
danno fastidio e sono la via di ritorno; **`precedente` però punta a una
versione ritirata**, e un `torna-indietro.ps1` dato oggi rimetterebbe in servizio
la 2.3. Vedi la voce 41.

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

> **QUANTO SEGUE DESCRIVE LA 2.3, CHE È RITIRATA.** Ha disfunzionato in
> produzione ed è stato necessario un ripristino d'emergenza alla 2.2. Il
> pacchetto e il ramo git stanno in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder
> 2.3 (NON FUNZIONALE - ritirata 25-08)/`, e **non si installa**.
>
> Resta scritto qui per una ragione sola: **il problema che voleva risolvere è
> ancora aperto**, e il giorno che si riprende non si deve ricominciare a
> ragionarci da capo. Quel che segue è l'analisi del caso, non una funzione
> disponibile. Nessuna riga qui sotto descrive l'applicativo in servizio.

### 2.3 RITIRATA — il reparto, e il conto che passa da un ordine all'altro

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

#### 2.3 RITIRATA — tre difetti trovati costruendo, non leggendo

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

#### 2.3 RITIRATA — come era stata provata

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

### Come si legge questa coda

I numeri **non si riusano e non si rinumerano**: una voce chiusa resta al suo
posto barrata, perché altre righe di questo documento la citano per numero. Le
disposizioni qui sotto sono di Andrea, 25/08/2026.

Cinque stati, e vogliono dire cose diverse:

| stato | vuol dire |
|---|---|
| **fatto** | chiusa, con la prova accanto |
| **Andrea** | è un dato o una configurazione, e la compila lui quando è ora. Un agente non ci mette mano |
| **da pianificare** | è lavoro di sviluppo riconosciuto: prima l'analisi, poi la correzione, poi il consolidamento |
| **standby** | riconosciuta e ferma per scelta. Non si tocca finché non lo si decide |
| **da chiarire** | manca un fatto per poter decidere |

### Chiuse il 26/08

| # | Cosa | Prova |
|---|---|---|
| ~~**56**~~ | ~~L'installer non sa consegnare PostgreSQL: una macchina nuova nasce su SQLite~~ | **Chiusa il 26/08 sera.** Il pacchetto porta `prepara-postgres.ps1`, che controlla il motore — psql, `pg_dump`, `pg_restore`, servizio Windows, porta, superuser — e prepara ruolo e database con `LC_COLLATE 'C'`, generando la password invece di farla digitare. Una prima installazione nasce su PostgreSQL; un aggiornamento lascia il magazzino dov'è, e il salto si chiede con `-Database postgresql` — copia a caldo, migrazione, conteggi ricontrollati, e `PATHFINDER_PG` riscritta **solo se si arriva in fondo**. `migrazione/` viaggia nel pacchetto: prima non poteva, perché `migra-sqlite-postgres.js` cercava `maiuscola-codici.cjs` dentro `banco/`, che nel pacchetto non c'è. **Le prove di installazione passano da 22 a 29**, e una di quelle nuove è la trappola qui sotto |
| ~~**53**~~ | ~~Il backup cambia padrone su PostgreSQL, e non è rifatto~~ | **Chiusa con la 2.7, e provata sul magazzino vero.** `DriverPostgres.backupTo` fa un `pg_dump` in formato custom e **lo rilegge con `pg_restore --list` prima di dichiararlo buono**: se la rilettura fallisce il file si cancella, perché un file lasciato lì si fa contare da chi guarda la cartella. La password non entra nella riga di comando — si legge nell'elenco dei processi — ma in `PGPASSWORD`, nell'ambiente del solo processo figlio. `backup-serale.ps1` non sa quale database c'è dietro: chiede a `/api/backup` e legge il nome dalla risposta; la sua rotazione, che filtrava `pathfinder-*.db`, adesso prende tutte e due le estensioni. **Provato il 26/08 alle 19:09 sul magazzino vero**: `pathfinder-2026-08-26-1909.dump`, 419 KB, 21 tavoli con dati dentro, `exit 0` |
| ~~**55**~~ | ~~`pg` non era nel servizio installato~~ | **Trovato PRIMA di installare, non dopo.** L'installer reinstallava le dipendenze solo se `node_modules` mancava del tutto, e quella della 2.6 c'era: con `PATHFINDER_PG` accesa il servizio non sarebbe partito e i terminali avrebbero visto bianco. Ora guarda dipendenza per dipendenza come le dichiara `package.json`, nomina quale manca, e si ferma se dopo `npm install` ne manca ancora una. All'installazione della 2.7 ha scritto `Dipendenze del servizio da installare: pg` e ne ha aggiunte 14 |
| ~~**54**~~ | ~~Il database in servizio non è normalizzato, e la 2.6 lo pretende~~ | **Raddrizzato la notte del 26/08, prima di installare la 2.6, e misurato dopo.** Servizio fermo, backup fresco delle 02:50 (`banco/db/pathfinder-2026-08-26.db`), prova a vuoto che ha detto gli stessi numeri della copia — 53 righe e 1 fusione — e solo allora `--scrivi`. Misurato sulla 4173 a servizio ripartito: **0 codici minuscoli su 886 giacenze e 320 movimenti**, la riga doppia di `MAG1-RAKA-01-05-C` è **una sola da 6**, e il registro porta l'`EDIT` che lo spiega con dentro le due chiavi di partenza. La firma `SISTEMA` è entrata in anagrafica disattivata e senza PIN: **nessuna firma orfana**, la voce 18 regge |
| ~~**48-bis**~~ | ~~L'INDEX diceva che in servizio c'era la 2.4~~ | **Erano sbagliate due righe, non una.** La misura del 26/08 all'01:50 ha trovato la **2.5** sulla 4173, mentre il documento dichiarava «la 2.5 è costruita e NON è installata» e «in servizio c'è la 2.4». **Quarta volta in cinque giorni** — voce 35. Corrette tutte e due, e da stanotte la riga «in servizio» si scrive solo dopo aver interrogato `/api/app-info` |
### Chiuse il 25/08

| # | Cosa | Prova |
|---|---|---|
| ~~**2**~~ | ~~Provare il pacchetto su una macchina pulita~~ | **Fatta, conforme** — Andrea, 25/08 |
| ~~**4**~~ | ~~Annullare a mano quattro attività rimaste `in_progress`~~ (`TA-MSRAXA3Q-PQ11`, `TA-MSRB4JXK-04C7`, `TA-MSRB80C2-2JLC`, `TA-MSRBEZLU-5M3E`) | **Annullate** — Andrea, 25/08 |
| ~~**17**~~ | ~~La capienza dei vani non è dichiarata da nessuna parte~~ | **Non si dichiara, e non è un buco.** I vani non hanno un limite di capienza: la verifica la fanno **a vista gli operatori**. Il vincolo nel motore resta e non esclude mai per pieno, ed è il comportamento voluto |
| ~~**20**~~ | ~~Provare le maschere che pretendono l'identità, col PIN~~ | **Provate e funzionanti** — smaltimento, trasferimento, prelievo, quarantena, conta, DDT, reso, chiusura del conto. Andrea, 25/08 |
| ~~**23**~~ | ~~Leggere un'etichetta col lettore vero~~ | **Barcode funzionante e verificato, conforme** — Andrea, 25/08. Il Code128 di `modules/code128.ts` è stato letto da un lettore ottico su un foglio stampato da questo codice |
| ~~**38**~~ | ~~Le righe già nel vano al momento dell'installazione non hanno misure a conto~~ | **Non si pone: un'installazione pulita parte con il database VUOTO.** È la regola, ed è anche il modo in cui la voce 2 è stata provata |
| ~~**39**~~ | ~~L'attività pianificata punta al repository~~ | **Corretta il 25/08 all'01:49**, ri-registrando l'attività da `C:\Pathfinder\servizio`. La 4173 dice 2.2 due volte, e la prova per ore sta in §1 |
| ~~**40**~~ | ~~`PATHFINDER_APP` punta ancora a `MAPPER\pathfinder-1.6.1.html`~~ | **Refuso dei primi giorni di sviluppo**, residuo del modo «file singolo». Non serve a niente: `/api/app-info` dice `modo: cartella` e comanda `PATHFINDER_APP_DIR`. Si svuota il giorno che si tocca il servizio |
| ~~**32**~~ | ~~Installare la 2.2 e vedere i due numeri coincidere~~ | **Fatto il 25/08 all'01:39.** `08ce3f69…`, 1.777.087 byte. È la versione stabile |
| ~~**36**~~ | ~~Installare la 2.3 e vedere i due numeri coincidere~~ | **Non si installa: la 2.3 è RITIRATA.** Ha disfunzionato, ed è stato necessario un ripristino d'emergenza alla 2.2 |
| ~~**28**~~ | ~~Il campionamento non sa prendere un collo intero~~ | **Deciso da Andrea il 25/08, ed è una regola nuova:** se l'articolo **ha l'unità di misura configurata**, si preleva la quantità indicata e **i colli non calano**; se non ce l'ha, esce la quantità indicata dal collo. Va portata nel codice — voce 42 |
| ~~**48**~~ | ~~La correzione della voce 45 non è in servizio~~ | **La 2.4 è installata — Andrea, 25/08 sera.** `/api/app-info` dice **2.4 due volte**, impronta `99fc56ba…`, 1.777.772 byte in 4 file: la stessa del pacchetto costruito. Il servizio installato dice 2.4 anche nel file, e le due correzioni sono verificate per stringa dentro il bundle che il magazzino sta servendo. **Il database ha attraversato l'installazione intatto** — 264 movimenti, 884 giacenze, 6 operatori, 1 mittente — e la via di ritorno si è sistemata da sola: `precedente` porta la 2.2 buona. **Il registro non è più esposto al gesto che ne aveva spazzati 253** |
| ~~**49**~~ | ~~`recipients` è vuota e il registro nomina «BIOTECH SRL» dieci volte~~ | **Rientrata UNA riga il 25/08**, non quattro: `RC-MSRLU2VU-4NDL`, la più vecchia delle quattro del backup del 19/08 — erano lo stesso cliente inserito quattro volte, stesso indirizzo «VIA NUOVA, 41032» e stessa partita IVA. I dieci `SHIP` del 13/08 e del 18/08 hanno di nuovo un cliente dietro. **Da sapere: la partita IVA vale `123456`, che è un segnaposto** — va corretta prima che quel cliente riceva un DDT vero |
| ~~**18**~~ | ~~Due sigle firmano movimenti e non sono in anagrafica operatori~~ | **Chiusa il 25/08, e in due metà.** *Le prove sono uscite*: gli otto movimenti sugli articoli finti `123` e `123456` sono rimasti fuori dal recupero — sei di `DP` e `AS`, più due del 19/08 che `ANDS` e `ANAD` avevano fatto sullo stesso articolo. `AS` non compare più da nessuna parte. *La sigla ha un nome*: `DP` è **Daniele Pedrazzi** — Andrea, 25/08 — e i 10 `PICK` veri del 07/08 hanno la persona che li ha fatti. **Misurato dopo: NESSUNA FIRMA ORFANA su 264 movimenti.** `ANDS` 143, `ANAD` 86, `ANSA` 19, `DP` 10, `BABB` 6, e ognuna ha un nome in anagrafica. Era la domanda che il registro deve saper reggere per sei anni — «chi» — e adesso la regge |
| ~~**47**~~ | ~~L'anagrafica dei mittenti va pulita~~ | **Fatto il 25/08, e con le giacenze rimesse a posto.** Il giro di banco del 24/08 sera è uscito **intero** dal database di produzione: 2 mittenti (`biotech`, `eurospin`), 2 DDT evasi (`DDT260006`, `DDT260007`), 2 attività (`PICK_SHIP`, `PICK_RET`) e i 2 movimenti `SHIP`. **E le due giacenze che quei movimenti avevano toccato sono tornate come stavano**, prese dal backup del 23/08 — l'ultimo prima del giro: `6000867#253047` **ricreata da zero** in `MAG1-RAKA-01-04-A` (la riga era sparita, era andata a zero) e `7000938#260474` riportata da 1 a 2, tutte e due con `placed_at` e `last_updated_at` originali. Confrontate campo per campo col 23/08: **identiche**. Cancellare i due `SHIP` senza questo avrebbe lasciato giacenza calata e niente a spiegarlo — il difetto delle voci 33 e 34, fatto da noi |
| ~~**44**~~ | ~~Il registro dei movimenti veniva svuotato dal recupero di un backup automatico~~ | **Causa trovata e registro ricostruito, 25/08.** La catena: `writeOPFSBackup` esce con `includeMovLog: false`, `componi` fa `delete data.mov_log`, e `importAll` in overwrite svuotava `mov_log` col `clearMany` e poi lo saltava perché il pacchetto non lo portava. **`_partial` era scritto in un punto solo e non lo leggeva nessuno.** Il registro ora porta **266 movimenti, dal 07/08 al 25/08**, continui: 245 recuperati da `pathfinder-2026-08-19.db` più i 21 che c'erano. Otto movimenti sugli articoli di prova `123` e `123456` sono rimasti fuori |
| ~~**45**~~ | ~~Il ripristino deve smettere di cancellare il registro~~ | **Corretto nel sorgente il 25/08 — e NON È ANCORA IN SERVIZIO: vedi la voce 48.** `importAll` distingue ora fra **chiave assente** (il pacchetto non porta il registro, e il registro resta dov'è) ed **elenco vuoto** (`mov_log: []`, cioè movimenti non ce n'è: si svuota). Per le altre collezioni lo svuotamento in blocco resta com'era — sono stato, e devono combaciare con le giacenze che rientrano. E `_partial` adesso si vede prima di premere: la riga dei Movimenti dice «non inclusi nella copia — il registro attuale resta» invece di «0» |
| ~~**46**~~ | ~~L'anagrafica operatori era stata sostituita in blocco~~ | **Sistemata il 25/08.** `ANDS`, `ANAD`, `BABB` ed `EFBR` sono rientrati come **operatori storici disattivati, senza PIN**: non possono operare, esistono perché il registro li nomina. Adesso ogni firma dei 266 movimenti ha un nome dietro — `ANDS` 143, `ANAD` 86, `ANSA` 21, `BABB` 6 — **tranne `DP`, che ne ha 10 e resta senza: voce 18**. `EFBR` non firma nessun movimento: è rientrato lo stesso, perché un'anagrafica che dimentica chi c'era è come il registro che si svuota |
| ~~**41**~~ | ~~`C:\Pathfinderpp\precedente` portava la 2.3 ritirata~~ | **Sistemata il 25/08 sera.** `torna-indietro.ps1` legge il **numero di versione** da `precedente\manifest.json` e poi ripesca i file da `C:\Pathfinderpp\pathfinder-<numero>`: leggendo «2.3» sarebbe andato a prendere la versione che ha disfunzionato. Ora `precedente` porta la 2.2, impronta `08ce3f69…`, **confrontata file per file con `pathfinder-2.2`: nove file su nove identici**. La 2.3 non è persa — resta in `C:\Pathfinderpp\pathfinder-2.3` e in ARCHIVIO. `corrente`, il servizio e il database non sono stati toccati |

### Da pianificare — sviluppo riconosciuto

| # | Cosa | Passo successivo |
|---|---|---|
| **64** | **LE ROTTE `/api` NON CHIEDONO CREDENZIALI A NESSUNO, ed è il difetto più grosso che questo applicativo abbia.** Chi raggiunge la porta legge qualunque collezione, ne scrive qualunque record, e con una `DELETE` svuota le giacenze. Il PIN non è un controllo d'accesso: è una domanda che il client fa e a cui il client stesso obbedisce. La procedura di recupero PIN in §6 — `PATCH` su `/api/c/operators` — funziona per chiunque sulla rete: si legge l'elenco, si sceglie un Team Leader, si scrive un'impronta nuova, si entra come lui. La 2.10 ha chiuso tutto quello che si poteva chiudere senza toccare questo, e questo è rimasto | **Una sessione emessa dopo il PIN**, che è il modello a cui l'applicativo somiglia già: c'è l'identificazione, c'è `currentOperator`, c'è la scadenza della sessione. Tocca ogni chiamata del client e ogni rotta del servizio, e nessun collaudo di oggi la esercita: **è una versione sua, con un turno di banco suo.** Due strade scartate e perché: un segreto dentro il client non è un segreto — la pagina la scarica chiunque; un token sulle sole rotte distruttive romperebbe la Configurazione, che usa `deleteWhere` per cancellare una zona e `clearMany` per il reset |
| **65** | **`xlsx` 0.18.5 PORTA DUE VULNERABILITÀ NOTE** — prototype pollution (GHSA-4r6h-8v6p-xvw6) e ReDoS, gravità alta — **e non c'è un fix su npm**: SheetJS pubblica le versioni corrette solo dal proprio sito. Il vettore è il file Excel che un operatore carica: ODP e anagrafica. Le dipendenze del servizio sono a **0 vulnerabilità** | La regola «`dexie` e `xlsx` non si aggiornano» esiste perché l'applicativo è collaudato con quelle versioni, ed è difendibile. **Va però ridecisa sapendo questo**, non per inerzia: o si passa alla versione di SheetJS e si riprova tutto quello che tocca Excel, o si scrive qui che si accetta il rischio e perché |
| **61** | **IL CONTO WIP DIPENDE DA UN PARAMETRO FACOLTATIVO.** La riga `in` non registra le UM — `qty_uom` è `null` — e i chili si ricostruiscono dopo dalla confezione congelata del lotto, che `Store.contoWip` passa a `conto()` come ripiego. Ma quel parametro si può omettere, e allora lo stesso ordine perfettamente in pari risponde `residuo_uom: −25` e `incoerente: true`. Un residuo **negativo** su un ordine chiuso in pari: un numero plausibile e sbagliato, cioè la stessa forma del difetto di `#dlgOverlay`. Oggi il chiamante è uno solo e il ripiego lo passa | **Due strade, e la seconda è quella buona:** scrivere le UM sulla riga `in` quando si conoscono — la confezione è congelata già al posizionamento, quindi il dato c'è — oppure rendere `perCollo` obbligatorio, o far dichiarare `incoerente` con un motivo leggibile invece di un residuo negativo muto |
| **62** | **IL BIP DI LETTURA E LA CONFERMA DI TAPPA SONO TUTTI E DUE ACUTI E SINUSOIDALI.** Misurati: `scan` è 1320 Hz, `ok` sale 1046 → 1568 Hz. Fra `ok` ed `error` non c'è confusione possibile — `error` scende 233 → 175 Hz in onda quadra — ma «ho letto il codice» e «tappa chiusa» possono somigliarsi col rumore del reparto e i tappi | **Serve una prova al banco, con il rumore vero**: se la confusione c'è, basta scendere il bip di lettura o accorciarne la coda, così l'unico suono che sale resta la conferma |
| **63** | **`areaWip` SUL BANCO È UN VANO DELLO SCAFFALE, NON UN'AREA.** Il 27/08 è stata impostata su `MAG1-RAKA-04-01-T` per poter provare il conto di produzione, perché il banco non ha un vano di lavorazione. Funziona, ma sulla mappa quel vano non si distingue dallo stoccaggio, e il motore lo tratta come un vano qualunque | **Sul magazzino vero la domanda resta quella della voce 15** — quale vano sia l'area WIP. Sul banco, il giorno che serve una prova più fedele, si crea una zona `WIP` sua |
| **59** | **28 LOTTI STANNO IN DUE UBICAZIONI, E SONO 59 RIGHE SU 32 VANI.** Contati il 26/08 sulle 886 giacenze vere, appena la 2.8 ha acceso il controllo. **Non li ha fatti la 2.8**: sono il magazzino com'è, e fino a ieri nessuno aveva modo di vederli. Finché durano, quella merce si conta due volte e il FEFO la ordina come due partite diverse. Da oggi la regola base 2 impedisce di farne di nuovi, ma **non ricompone quelli che ci sono** | **Ricomporli, uno per uno, con la merce davanti.** L'elenco esce da Mappa → «Vedi elenco» → Esporta Excel, tipo `LOTTO_SPARSO`. Non è un lavoro da agente: sono 28 decisioni su dove sta davvero la merce |
| **58** | **GLI ATTRIBUTI DEGLI ARTICOLI SONO ANCORA VUOTI, E ADESSO SI VEDE QUANTO PESA.** Misurato il 26/08: **644 articoli senza classe di temperatura, senza allergeni e senza pericolosità**, e `verificabili` a **zero** su 886 righe. La 2.8 ha aggiunto quattro controlli nuovi — pericolosità fuori area, non ammessa, merce pulita in area pericoli, matrice — e **nessuno dei quattro può scattare** finché quella colonna è vuota. È la voce 5 vista dall'altro capo: là mancano gli attributi delle ZONE, qui quelli degli ARTICOLI | **È di Andrea**, come la 5: si popola da Configurazione → Articoli → Export/Import Excel, e il foglio «Valori ammessi» porta già gli elenchi buoni |
| **60** | **`ADMI` È UN OPERATORE ADMIN NATO PER SBAGLIO SUL COLLAUDO.** Creato il 26/08 alle 18:49:45 UTC da un clic finito su una maschera «Nuovo operatore» che si era aperta precompilata `admin`/`admin`/`ADMI`, con un PIN riempito dal gestore password del browser. **È attivo, ha ruolo admin, e il PIN non lo conosce nessuno dei due.** Sta sul servizio di collaudo (4199), non in produzione | **Decide Andrea**, e il 26/08 ha detto «lascialo, ci penso io». Si cancella o si disattiva da Configurazione → Operatori |
| **51** | **DUE FUNZIONI NON ESERCITATE DA CAPO A FONDO, E ADESSO SONO IN SERVIZIO.** La 2.5 e' installata dal 26/08 — misurata, non dedotta — quindi questa non e' piu' una cosa da provare prima di installare: e' codice che il magazzino sta servendo. La **rettifica di una tappa già prelevata** e il **salta tappa** del prelievo da ordine sono verificate per tipi, logica e resa a video, ma non sono state fatte girare: farle girare avrebbe scritto movimenti veri nel registro del magazzino in servizio. La rettifica scrive un `REPOS` e chiama `esceDaWip`, cioè tocca giacenza **e** conto di produzione | **Vanno provate al banco con un ODP di prova, su una copia del database — §5 — prima di installare la 2.5.** Le due cose da guardare: che il `REPOS` rimetta le **misure giuste** e non colli di misura comoda, e che `esceDaWip` non rifiuti la riga quando l'ordine ha in lavorazione colli di misure diverse (lancia apposta in quel caso: la rettifica resta valida e l'operatore viene avvisato, ma va visto succedere) |
| **52** | **82 ARTICOLI HANNO UN'UNITÀ CHE NON È UN'UNITÀ.** Dopo la traduzione `NR → PZ` del 26/08 restano fuori dalla gestione a UM: `SCA` 48, `CON` 18, `RT` 7, `CAS` 4, `M2` 2, `BAN` 1, più **due celle con dentro testo libero** — `MIN EPA=105 MG/G` e `MIN EPA=500MG/G DHA=250 MG/G C/L U.G.A`. Non è un difetto del codice: scatola, confezione e cassa nominano un **contenitore**, e in questo sistema il contenitore è il collo. `M2` è una superficie, che fra le cinque unità non c'è. Le due celle di testo sono errori di compilazione | Le 82 righe si caricano **a soli colli** e la maschera adesso lo dice. Va deciso sigla per sigla, guardando che merce sono: quelle che sono davvero un contenitore restano così, `M2` chiede se serva una sesta unità, e le due celle di testo vanno corrette in anagrafica — quello è di Andrea |
| **50** | **UN DIFETTO «GRAVE» DEL CICLO NON FA FALLIRE NIENTE.** `difetto()` in `banco/ciclo/verbale.js` scrive la riga nel verbale e la prova risulta lo stesso **passata**: il 25/08, rimettendo apposta il difetto della voce 45, il banco ha alzato **PA6 (grave)** con `movimenti 112 → 0` e `vitest` ha detto «3 passed». Vale per tutto il ciclo, non solo per PA6 | Un difetto grave deve tingere di rosso la corsa, altrimenti lo vede solo chi apre il verbale e legge fino in fondo — e il verbale si apre quando si sospetta già qualcosa. Va deciso quali severità fermano la corsa |
| **5** | **Caratterizzare le zone** in Configurazione → Zone: classe di conservazione, zona allergeni, zona pericolosi, refrigerata. Finché non è fatto **la mappa resta muta**, per quanti articoli si classifichino: la verifica confronta due metà e una manca | **Pianificare verifica e correzione.** Prima si misura quante zone e quante righe sono scoperte, poi si decide se il buco è nel dato o nel codice che lo legge |
| **15** | **L'area WIP va consolidata.** È **un'ubicazione mappata**, non un prefisso, e `Store` la legge da `meta.areaWip`. **Misurata il 25/08 sul servizio vivo: `MAG1-WIP-01`** — non `M06-COM-01`, che è quel che questo documento ha detto fino a oggi. Sono tutte e due ubicazioni vere: `M06` è il magazzino Rinaldi, dichiarato «IN COSTRUZIONE», mentre `MAG1` è il magazzino materie prime alimentari e porta **tutte e 884** le righe di giacenza. Il valore è cambiato dopo il 19/08 e nessuno l'ha scritto | **Pianificare analisi e correzione**, e la domanda prima di ogni altra è **quale dei due vani sia quello giusto**. Il conto di produzione ci ha già lavorato dentro: in `wip` ci sono 9 righe |
| **12** | **Le unità di carico sono in funzione, e sono ATTIVE in produzione** — l'interruttore non esiste più dalla 2.0. Creazione, carico, spostamento, chiusura automatica, etichetta: al banco funzionano. Ma in `udc` a database ci sono **zero righe**, misurato il 25/08: nessuno ne ha ancora creata una col muletto in mano | **Pianificare sviluppo e consolidamento**, e la prima domanda è perché a funzione attiva non ne sia nata nemmeno una |
| **22** | **Il motore di stoccaggio è stato sviluppato con la 2.8 — regole base, pericolosità, matrice, categoria, attributi di cella — ma il difetto segnalato NON è ancora riprodotto.** «L'ubicazione non soddisfa i criteri anche quando la regola è definita correttamente»: resta una frase senza un caso. La 2.8 rende più facile riprodurlo, perché ogni esclusione porta il suo `motivo` in chiaro | **Serve il caso vero**: la regola esatta come è scritta, il vano che rifiuta, e il messaggio a video. Senza quei tre, non si sa nemmeno se sia ancora vivo |
| **19** | **`6001055` MANGANESE SOLFATO: l'ODP lo chiede in KG, l'anagrafica lo dichiara PZ.** Il magazzino conta pezzi dove la produzione pesa chili | **Il parser XLS va controllato e corretto se serve.** La domanda è se l'unità di misura si perde in lettura o se il dato è storto all'origine: sono due difetti diversi, e si distinguono guardando il foglio |
| **33** | **Il registro non dice QUANTO, e NON È UN REFUSO DEL DATO: è il codice che scrive.** Analizzato il 25/08 sulla copia di backup delle 20:00, sola lettura. Tre forme, tutte e tre riproducibili: un `MOVE` che sposta una riga intera scrive `qty_delta: 0` con `qty_before: 1` e `qty_after: 1` — registra la variazione della riga d'origine, che è zero perché la riga si è spostata tutta, invece della quantità mossa; un `PICK` di «Consumo di produzione» scrive `qty_delta: null` con `qty_before: 10` e `qty_after: 9`; un `SAMPLE` scrive `qty_delta: 0` **e** `qty_uom_delta: null`, cioè non registra niente. **La buona notizia: `qty_before` e `qty_after` ci sono sempre**, quindi la quantità è ricostruibile e nessun dato è perduto | **Non c'è niente da pulire: c'è da correggere chi scrive.** Il campo che deve rispondere alla domanda «quanto» va riempito con la quantità mossa, non con la variazione della riga. È un cambio di formato del registro, che si tiene sei anni: si decide prima in §6, poi si scrive. Le righe già scritte si raddrizzano da `qty_before`/`qty_after` |
| **42** | **La nuova regola del campionamento va nel codice.** Andrea, 25/08: articolo **con** unità di misura configurata → si scala **la UM richiesta** e i colli non calano; articolo **senza** unità di misura → il campione **non modifica la giacenza**, né colli né UM. Oggi la rotta rifiuta il collo intero con «un campione lascia sempre un residuo» | Cambia una regola di §6 e il significato di `SAMPLE`: va scritta lì prima che nel codice, e il CQ deve saperlo |
| **43** | **IL KIT DEMO NON ESISTE PIÙ.** `Avvia Demo.bat`, i tre `README-DEMO` e i tre `IT-TECH-SHEET` — la demo portatile su chiavetta e lo sheet tecnico IT, in italiano, inglese e francese — vivevano dentro `consegna/`, che **`npm run build` azzera a ogni giro**. Non li produce `vite.config.js` e non sono mai entrati in git. Il 24/08 furono messi da parte e rimessi dentro a mano quattro volte; il 25/08 la build ha girato altre quattro volte e li ha portati via. Cercati su tutto il disco il 25/08: **nessuna traccia, e non si recuperano** | Vanno **riscritti**, e stavolta fuori da `consegna/` oppure dentro la lista dei file del plugin di build. Finché stanno lì dentro, la prossima build li cancella di nuovo |

### Sono di Andrea — dati e configurazione

Un agente non ci mette mano. Restano qui perché senza di loro certe funzioni non
hanno con cosa lavorare, non perché qualcuno debba sollecitarle.

| # | Cosa |
|---|---|
| **6** | **`pieces_per_pack` in anagrafica** (colonna `Pezzi_Per_Collo` dell'import Excel). **L'anagrafica la corregge e la aggiorna Andrea.** **Non è più urgente come era, e la ragione è cambiata il 26/08:** un lotto congelato senza `uom_per_collo` **ora lo ripiega dall'anagrafica** — a lettura e a unità uguale, senza riscrivere niente — quindi compilarla dopo ripara anche i lotti già a scaffale. E il carico non ne ha comunque bisogno: la suddivisione la **dichiara** chi ha la merce in mano, e quel numero serve solo a precompilare la prima riga. Resta il gesto che fa risparmiare una digitazione a ogni posizionamento, su 11.115 articoli che l'unità ce l'hanno e la confezione no |
| **7** | **Partita IVA e dati mittente** in Configurazione → DDT. **Tutte le configurazioni manuali sono di Andrea** |
| **3** | **Un secondo Team Leader.** `ANSA` è l'unico, ed è l'unico con un PIN: gli altri cinque record hanno `pin_salt: null`. **Situazione sotto controllo** — Andrea, 25/08. Da sapere però: **`DP` (Daniele Pedrazzi) è ATTIVO e senza PIN**, e senza PIN non si può firmare niente. O gli si dà un PIN, o lo si disattiva come i quattro storici: un operatore attivo che non può operare è una riga che promette quel che non mantiene |
| **13** | **IL PREFISSO GS1 È GIÀ COMPILATO, E VALE `1234567`** — misurato il 25/08 sul servizio vivo, e `Store` lo legge davvero (`store.ts`). La regola scritta è: vuoto → codici interni, che bastano dentro l'azienda; compilato → **SSCC veri**. `1234567` non è un prefisso assegnato da un consorzio, è un segnaposto: un'etichetta UDC stampata adesso porterebbe un SSCC che *sembra* vero e non lo è. Dentro l'azienda non fa danno, fuori sì — voce 24. **La decisione resta di Andrea**, ma va presa sapendo che il campo non è vuoto |
| **16** | **Le prime regole di stoccaggio.** `storage_rules` è vuota, e finché non ci sono il motore lavora sui soli vincoli. **Le scrive Andrea** — sono un dato (`article_code` inizia per 700 → `MAG2` è un record), non codice. Il motore che le applica è la voce 22 |

### Standby — ferme per scelta

| # | Cosa |
|---|---|
| **8** | **Nome DNS interno e certificato** dalla CA aziendale. Il codice è pronto: due variabili e HTTPS si accende |
| **24** | **Se le etichette escono dal cancello.** Quel che si stampa è **Code128, non GS1-128**: manca l'FNC1 e l'identificativo `(00)`. Dentro l'azienda si scansiona e si ritrova il documento, ed è tutto quello che serve. Il giorno che un cliente deve leggere un SSCC, `modules/code128.ts` va esteso — non aggirato |
| **26** | **Se Azure si accende.** Il ramo `server/azure/` è pronto e non lo chiama nessuno. I quattro punti che decidono stanno in `server/azure/LEGGIMI.md`, e il primo è che il magazzino si fermerebbe quando cade la linea |

### Da chiarire — manca un fatto

| # | Cosa | Cosa manca |
|---|---|---|
| **34** | **Non è un movimento senza merce: sono UNDICI, ed è una famiglia.** Contati il 25/08 sul registro recuperato: **11 movimenti `EDIT` e `MOVE` con `article_code` e `lot_code` vuoti**, dal 19/08, firmati `ANDS` (9) e `ANAD` (2), su ubicazioni diverse — `MAG-ACC-01`, `MAG-ACC-04`, `MAG-ACC-11`, `M03-CAT-20`, `MAG-SCA-01-01-T`, `MAG1-RAKA-01-01-T`, `MAG-SCA-01-02-T`. La forma è sempre la stessa: un `EDIT` seguito da un `MOVE` sulla stessa ubicazione nello stesso minuto | Non sono movimenti di merce: sembrano operazioni **sull'ubicazione**, scritte nel registro della merce. Va guardato chi le scrive: se è così, o cambiano causale o escono dal registro dei movimenti. Si guarda insieme alla voce 33 |
| **1-bis** | **Chi ha cancellato `C:\Pathfinder\app\pathfinder-1.6.1`** il 17/08 alle 19:14. La cartella è stata ricostruita dal file singolo in radice e la via di ritorno è di nuovo intera, ma la causa non si conosce | Se non è stato un gesto di Andrea in un'altra finestra, qualcosa cancella dentro la directory di installazione |

### Decise, e non si riaprono

| # | Cosa |
|---|---|
| **25** | **La vista 3D della mappa: valutata, e no.** Le ubicazioni non hanno coordinate — `core/geometria.ts` le genera da corsie, campate e livelli — quindi una vista 3D sarebbe un rendering della stessa griglia con la prospettiva in più: costo alto, informazione zero. **La vista frontale con «Specchia» copre quello che serviva davvero**: vedere la corsia com'è, dal verso in cui la si percorre |
| **35** | **La 2.1 andò in servizio da un pacchetto che nessun documento nominava.** L'impronta in produzione (`7cd16b50…`, 20/08 alle 08:31) non era quella che l'INDEX dichiarava (`29f215e1…`). Fu la **terza volta in quattro giorni**. Non è una riga da correggere: è il motivo per cui §0 punto 2 esiste, e va riletto da chi apre una conversazione nuova |

**Quanto pesa la voce 5, misurato il 19/08.** Le zone da caratterizzare non sono
una riga di manutenzione: sono il motivo per cui **la verifica di conformità
copre il 6% delle righe a scaffale** — 12 su 194. Su tutto il resto la mappa non
tace perché va bene: tace perché non ha con cosa confrontare, e chi la guarda
vede un verde che non significa niente. Lo stesso vale per la voce 6: **151
articoli su 153 a giacenza non hanno una quantità per collo**.

### Le versioni

La numerazione è **progressiva**: una build definitiva porta **due numeri**
(`2.2`), una di prova ne porta di più (`2.2.1`). **Non c'è una scadenza** — la
riga che dava il progetto al 31/12/2026, con ultima installazione utile il
19/12, è stata tolta il 25/08.

| Versione | Stato |
|---|---|
| **2.7** | **IN SERVIZIO dal 26/08 sera, E GIRA SU POSTGRESQL.** `17cb722b…`, 1.800.084 byte, 4 file. Non porta funzioni nuove all'applicativo: porta il **backup su PostgreSQL** — `pg_dump` riletto prima di essere dichiarato buono — e l'installer che sa accendere il database con `-PostgreSQL`, controlla le dipendenze per nome, e verifica il database giusto dei due. **Dal 26/08 sera sa anche consegnarlo**: controlla PostgreSQL, prepara ruolo e database, e sul salto migra i dati — §4 |
| **2.6** | **LA VIA DI RITORNO.** `d3865c53…`, 1.800.084 byte, 4 file. La prima che ha parlato due database, i codici in maiuscolo, l'interfaccia del servizio dati asincrona. **Tornare a lei vuol dire tornare a SQLite**: conosce `PATHFINDER_PG` ma non sa farci il backup, e alle 20:00 copierebbe un file fermo scrivendo OK. Byte in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.6/`, servizio al commit `9796048` |
| **2.5** | **ARCHIVIATA.** `8ed505b9…`, 1.798.524 byte, 4 file. Le unità di misura al carico su 11.115 articoli e il prelievo da ordine. **Si porta dietro la voce 51**, ancora aperta. Pacchetto in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.5/` |
| **2.4** | **ARCHIVIATA.** `99fc56ba…`, 1.777.772 byte, 4 file. Porta la correzione della voce 45 (un ripristino non cancella piu' il registro) e quella della voce 19 (il parser dell'ODP dichiara l'unita' che inventa). **Salta il 2.3 apposta**: quel numero e' speso, e due pacchetti con lo stesso nome sono la trappola che qui e' gia' costata tre giorni |
| **2.2** | **ARCHIVIATA.** E' stata la via di ritorno fino alla 2.4, ed e' stata in servizio il 25/08. Impronta `08ce3f69…`, commit `3c68d0a`, pacchetto in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.2/`. La via di ritorno adesso e' la **2.5** |
| ~~**2.3**~~ | **RITIRATA — ha disfunzionato, ripristino d'emergenza alla 2.2.** Pacchetto e ramo git in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/`. Il problema che voleva risolvere resta aperto: §1 |
| ~~**1.8 → 2.1**~~ | **ARCHIVIATE.** Sono dentro la 2.2 e non esistono più come lavoro da fare. La 1.8 (UOM riscritta, `feature.colli`), la 1.9 (viste giacenza), la 1.10 (trasferimenti dall'ODP), la 1.11 (il terminale su `--spacing`), la 1.12 (UDC), la 1.13 (motore di stoccaggio), la 1.14 (conto di produzione): scritte, cablate, collaudate e consegnate. Quel che di loro è rimasto aperto **non è la versione, è un interruttore o un dato** — voci 5, 6, 12, 15, 16, 22. La cronaca di come furono costruite sta in §1 |

**GLI INTERRUTTORI NON ESISTONO PIÙ, E LA CODA NON DEVE PIÙ NOMINARLI.**
Sono stati tolti con la **2.0**, da 74 punti in 12 file. Le chiavi `feature.*`
restano scritte in `meta` — misurate il 25/08 sul servizio vivo, sono `true`
tutte e sei — ma **nessuna riga di codice le legge**: `isFeatureOn`,
`setFeature` e le cinque guardie `_assert*On` non ci sono più. Sono un dato
morto, non una configurazione.

Chi legge in questo documento «`feature.udc` è spento in produzione», «si
accende a gennaio» o «l'interruttore è `pronta: true`» sta leggendo una riga
scritta prima della 2.0 e mai corretta. **Tutte le funzioni sono attive.** Si
torna indietro reinstallando il pacchetto di prima, non abbassando una leva.

**Quel che resta vero è la cadenza:** si installa a fine turno, con un backup
fresco davanti, e si guarda girare un turno intero prima di fidarsi.

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
npm test         # vitest, 40 file, 1.180 prove
```

```bash
node test/collaudo.js                    # 113 prove sul servizio, da server/
node test/collaudo-migrazione-1.4.js     # 8 prove sul cambio di schema, da server/
node test/collaudo-installazione.js      # 29 prove sugli script di installazione, da server/
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
$env:PATHFINDER_PG=''; $env:PATHFINDER_PORT='4199'; $env:PATHFINDER_DB="$BANCO\db\pathfinder-<data>.db"; $env:PATHFINDER_APP_DIR="$BANCO\app\corrente"; node server\pathfinder-server.js
```

**`PATHFINDER_PG=''` apre la riga e non è un ornamento**: senza, il banco
eredita dalla macchina la connessione al database in servizio e scrive nel
vero, con la porta e il file di banco che dicono il contrario — §5.

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
  tutto: prepara ruolo e database su PostgreSQL, copia il servizio, registra
  l'avvio all'accensione e il backup serale, apre la porta sul firewall,
  installa l'applicativo.
- **Aggiornamento**: **non** chiede dove, lo rilegge da `PATHFINDER_APP_DIR`, e
  una radice diversa la **rifiuta** — spostare un'installazione non è
  installare. Ferma il servizio, copia applicativo **e** servizio, lo riaccende.

### DALLA 2.7 L'INSTALLER PORTA ANCHE IL DATABASE

**Una prima installazione nasce su PostgreSQL**, che è quello che gira in
magazzino dal 26/08. Fino alla 2.6 il pacchetto sapeva installare solo sul
file, e il passaggio a PostgreSQL era un gesto a mano, fatto una volta su
questa macchina e su nessun'altra: chi avesse installato Pathfinder altrove
sarebbe partito su SQLite senza saperlo.

**IL MOTORE NON LO INSTALLA E NON LO SCARICA.** `prepara-postgres.ps1`
controlla che ci sia — psql, `pg_dump`, `pg_restore`, il servizio Windows, la
porta — e se manca dice dove si prende e **si ferma senza toccare niente**. È
la stessa regola per cui il servizio dati è un'attività pianificata e non un
binario preso da internet: su un PC di magazzino un download è l'antivirus che
blocca, l'IT che chiede conto e nessuno che sappia più perché si è fermo.
`pg_dump` e `pg_restore` si guardano **prima**, non alla prima sera utile: su
PostgreSQL il backup è fatto di quei due, e un magazzino che gira senza via di
casa non è un'installazione riuscita.

**LA PASSWORD DEL RUOLO LA GENERA L'INSTALLER, e nessuno la digita.** Il 26/08
il segnaposto `LA-TUA` è finito dentro la variabile di macchina e il servizio
non è partito: una password che nessuno scrive è una password che nessuno
sbaglia a sostituire. L'alfabeto è quello che in un URL vale se stesso — una
`@` dentro una password spezza la stringa di connessione, e il servizio
finirebbe a cercare un host che non esiste. Si vede **una volta sola** a
schermo, e poi vive solo in `PATHFINDER_PG`. Serve invece, **una volta**, la
password di `postgres`: la chiede la finestra **elevata**, e non passa mai per
la riga di comando — lì la leggerebbe chiunque apra Gestione attività.

**IL DATABASE CHE STA GIÀ SERVENDO UN MAGAZZINO NON SI TOCCA.** Se la stringa
che la macchina ha in mano risponde, non si crea niente e non si rigenera
nessuna password: rigenerarla vorrebbe dire fermare il magazzino per
rimetterlo com'era.

**AGGIORNANDO, IL DATABASE RESTA QUELLO SU CUI SI TROVA.** Vale la regola con
cui la 2.6 è entrata: si installa un turno e si accende quello dopo. Il
passaggio si chiede a voce:

```powershell
.\installa.ps1 -Database postgresql   # da SQLite a PostgreSQL, MIGRANDO i dati
.\installa.ps1 -Database sqlite       # sul file, come fino alla 2.6
```

Il passaggio fa, in quest'ordine: chiede al **servizio ancora acceso** una
copia a caldo del file — un SQLite aperto ha un WAL accanto e con `Copy-Item`
si porta via un database a metà —, ferma, rinfresca il servizio e le sue
dipendenze, migra quella copia ricontrollando i conteggi tavolo per tavolo, e
solo **se arriva in fondo** riscrive `PATHFINDER_PG` e riaccende. Una
migrazione fallita a metà lascia il magazzino dov'era, sul file, che è intatto.
**Non si scrive sopra un database che ha già dei tavoli dentro**: si rifiuta, e
chi vuole partire vuoto lo chiede con `-SenzaMigrazione`.

Dall'altra parte **non si torna con l'installer**: `-Database sqlite` su una
macchina già su PostgreSQL viene rifiutato. Quel file è fermo al giorno del
passaggio, e quello che si è scritto dopo non rientra da solo — il gesto
d'emergenza resta `installa-servizio.ps1` senza `-PostgreSQL`, ed è scritto
qui sopra.

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

### Le regole di stoccaggio — 2.8

**UNA COLLEZIONE CHE SI LEGGE MA NON SI ASSEGNA È UNA COLLEZIONE VUOTA, E NON
LO DICE — trovato il 26/08.** `recipients` stava nei due adapter dal 1.6 e
`_loadCache` non la assegnava mai a `_cache`. Nessuno se n'era accorto in due
mesi perché **il difetto si nasconde da solo**: alla prima scrittura
`_applyToCache` popola l'elenco, e da lì in poi la sessione sembra a posto. A
vederlo era solo chi apriva un DDT *senza aver toccato prima l'anagrafica*.
Quando si aggiunge una collezione si guardano **tre** punti e non due: il
`loadAll` dell'adapter, la destructuring di `_loadCache`, **e l'assegnazione**.

**`undefined` E `null` NON SONO LA STESSA ASSENZA, quando l'assenza è una
decisione.** Su `location_attrs` un campo `undefined` vuol dire «come dice la
zona» e `null` vuol dire «qui no»: due cose opposte, e un `??` le
schiaccerebbe insieme mandando la cella a ereditare proprio dove qualcuno
aveva scritto di non ereditare. `_fondiAttributi` confronta con `undefined` e
non con la verità del valore, e la maschera ha **tre** stati per campo e non
due. Vale ogni volta che si scrive uno scavalco sopra un valore di serie.

**IL PRIMO POSIZIONAMENTO DI UN LOTTO NON HA CASA, E QUINDI OGNI CONTROLLO
D'UNICITÀ DEVE SAPER DIRE «NESSUNA».** `verdettoCasa` restituisce `primo` e
non un errore: un elenco vuoto non è un caso limite da tollerare, è il caso
normale della prima volta. Le regole che vietano si scrivono partendo da lì,
o il primo carico della giornata si rifiuta da solo.

**UN'AREA DI TRANSITO NON È UNA CASA, e trattarla come tale ferma la
produzione.** Il vano WIP tiene merce di passaggio: se `caseDelLotto` lo
conta, posizionare a scaffale un lotto di cui il reparto ha in mano tre colli
diventa vietato. Ed è lo stesso motivo per cui `entraInWip` passa con
`regolaBase: false` e per cui la mappa non lo segnala fra i lotti sparsi.
**Tre punti, una sola ragione**: quando se ne tocca uno si guardano gli altri
due. È la stessa lezione di «UN'AREA NON E' UN'UBICAZIONE», §6, vista da un
altro lato.

**IL CONTROLLO CHE VIETA VA DOVE PASSA TUTTO, NON DOVE SI VEDE.** In
Pathfinder non esiste un `moveItem`: uno spostamento è `removeItem` seguito
da `addItem`. Mettere la regola dell'ubicazione unica dentro `addItem` la fa
valere anche per gli spostamenti **senza doverli distinguere** — e in più la
fa valere bene, perché la rimozione avviene prima: uno spostamento intero
lascia il lotto senza casa e passa, uno parziale la casa ce l'ha ancora ed è
esattamente il gesto da rifiutare. Metterla nelle otto maschere avrebbe
voluto dire otto copie che divergono alla prima maschera nuova.

**UN VINCOLO CHE ESCLUDE DEVE LASCIARE UNA PORTA DA CUI USCIRE.** «Non si
può» senza «allora dove» è una porta chiusa: il messaggio della regola 2
porta **il codice del vano di casa**, e la maschera mette il bottone che ce
lo scrive. Ricopiare a mano un codice di ubicazione da un riquadro è il modo
di sbagliarlo.

**UN CAMPO LIBERO PER IL MOTIVO SI COMPILA CON «OK».** Con la merce in mano e
il muletto acceso, il testo libero raccoglie rumore, e il dato che dovrebbe
dire fra tre mesi se le regole valgono non dice più niente. Tre bottoni si
premono — e sono **tre e non dieci**, perché un elenco lungo torna a essere
una scelta da leggere, cioè lo stesso costo del libero con in più l'illusione
di aver misurato qualcosa.

**MAI CONFIGURATO E CONFIGURATO VUOTO SONO DUE COSE DIVERSE, e su una
matrice di sicurezza la differenza pesa.** `null` in `meta.matriceIncompatibilita`
vuol dire che nessuno ci ha messo mano, e allora valgono le tre coppie di
serie; `[]` è la decisione «da noi nessuna coppia è incompatibile», e vale
quel che dice. Un `?? []` scritto per prudenza avrebbe spento i tre vincoli
di serie in silenzio.

**UN VINCOLO LETTO DA UN CAMPO CHE NON ESISTE NON MORDE MAI, E NON DÀ
ERRORE.** Fino alla 2.7 il motore leggeva la capienza da `zona.capienza`, che
non è mai esistita nemmeno come campo del tipo `Zona`: l'indice generico
`[config: string]: unknown` la rendeva legittima al compilatore, e il vincolo
c'era e non escludeva mai nessuno. `kpi.ts` lo diceva da mesi in una riga che
nessuno aveva collegato. **Un attributo di destinazione d'uso si configura,
si vede in maschera, e poi bisogna andare a controllare che il motore lo
legga davvero**: alla pericolosità era successa la stessa cosa dal 1.6.

**UNA REGOLA GENERALE CHE SOPRAVVIVE ACCANTO A UNA PRECISA LE ANNACQUA
TUTTE E DUE.** `proponi` accetta un vano se **una** regola che impone è
soddisfatta. Con «7001234 va in MAG1» e «i detersivi vanno in MAG3» attive
insieme, i vani buoni diventavano quelli di MAG1 *più* quelli di MAG3 — cioè
la decisione presa sull'articolo preciso spariva proprio per colpa della
regola di famiglia che doveva scavalcare. `regolePerArticolo` tiene **un solo
livello**, il più preciso che ha colpito.

**`open(percorso, 'w')` TRONCA PRIMA DI SCRIVERE, e un errore di codifica in
mezzo lascia il file a ZERO byte — 26/08.** Una `UnicodeEncodeError` su un
emoji ha azzerato `src/ui/views/giacenze.ts`, 37 KB, prima ancora di scrivere
la prima riga. Recuperato con `git checkout` e riapplicato a mano. Uno script
che riscrive un sorgente **compone tutto in memoria e apre in scrittura per
ultimo**, o non tocca il file originale finché non ha finito.

**UN CLIC A COORDINATE SU UN'INTERFACCIA CHE SI RIDISEGNA FINISCE DOVE NON
DEVE — 26/08.** Due volte nella stessa mezz'ora: una casella della matrice
accesa per sbaglio (e salvata a database), e un operatore `admin` creato
premendo «Crea» al posto di «Annulla» su una maschera che si era aperta da
sola e precompilata. Su questo applicativo si verifica **leggendo lo stato**
— `read_page`, o le funzioni pure chiamate da consolle — non premendo bottoni
a occhio: ogni bottone qui dentro scrive nel magazzino di qualcuno.

### Consegna e ambiente

**`node_modules` che ESISTE non vuol dire che sia quello giusto — 2.7.**
L'installer reinstallava le dipendenze solo quando la cartella mancava del
tutto. Bastava finché l'elenco non cambiava mai; la 2.7 ha aggiunto `pg`, e
quella della 2.6 c'era — controllo superato, driver assente, servizio che con
`PATHFINDER_PG` accesa non parte affatto. **Si guarda dipendenza per
dipendenza come le dichiara `package.json`**, e se dopo `npm install` ne manca
ancora una l'installazione si ferma dicendo quale.

**Un controllo che grida al lupo su un'installazione riuscita è come non
averlo — 2.7.** La verifica finale confrontava il database aperto dal servizio
con il percorso del file SQLite. Passando a PostgreSQL, un'installazione
perfettamente riuscita usciva con «il servizio ha aperto un altro database» e
codice 1. La volta che quell'avviso serve davvero, nessuno lo legge più.

**Un segnaposto in una riga di comando viene incollato com'è.** `LA-TUA` è
finito dentro la variabile di macchina al posto della password, sei caratteri.
Non ha fatto danni perché **il servizio si rifiuta di partire senza
database** — meglio fermo che vivo e senza — ma la lezione è sull'altro lato:
un comando da incollare con dentro un buco da riempire, prima o poi si incolla
intero. Meglio farselo comporre, o passarlo da un file.

**`Get-ScheduledTask` senza diritti NON DICE «accesso negato»: non
restituisce niente — 26/08.** Un'attività pianificata su cui l'utente non ha
diritti di lettura viene semplicemente omessa dall'elenco, senza un errore.
Su questa macchina `Get-ScheduledTask | Where TaskName -like 'Pathfinder*'`
ha risposto vuoto — 219 attività viste, nessuna di Pathfinder — e sembrava
che il servizio girasse da un `node` avviato a mano, cioè che il magazzino
non sarebbe tornato su da solo al riavvio. **Era falso.** `schtasks /query
/tn "Pathfinder - Servizio dati"` risponde `ERRORE: Accesso negato`, e la
prova che l'attività c'è è che il processo che serve la 4173 è **figlio di
`svchost.exe`**, cioè dell'Utilità di pianificazione.

**Una lettura andata a vuoto somiglia in tutto a un'assenza**, e le due
conclusioni sono opposte. Su Windows lo stato delle attività pianificate si
guarda **da amministratore**, o non lo si guarda: da non elevati la domanda
si fa con `schtasks /query /tn <nome>`, che almeno l'accesso negato lo dice.
Il controprova che non mente è la parentela del processo.

**`Start-Process -ArgumentList` NON METTE LE VIRGOLETTE, e psql non
protesta — 26/08.** `-ArgumentList @('-c', 'SELECT count(*) FROM x')` non
passa due argomenti: incolla l'elenco con degli spazi in mezzo, e psql riceve
`-c SELECT` e poi `count(*)` come se fosse il nome del database. Il guaio è
che **esce con 0**, e senza niente in mano: chi legge la risposta trova una
stringa vuota, `[int]''` fa **0**, e uno zero lì dentro voleva dire «nessun
tavolo, database vuoto, ci si può migrare sopra» — su un magazzino con 11.197
articoli. Trovato provando `prepara-postgres.ps1` contro il database vero,
che ha risposto `vuoto: True` avendo 21 tavoli dentro.

Due correzioni, e servono tutte e due: le virgolette si mettono a mano con la
regola di Windows, e **una risposta vuota non è uno zero** — si pretende una
cifra (`-match '^\d+$'`), o non si conclude niente. La query per giunta viaggia
in un file con `-f`, non in riga di comando: lì la vedrebbe chiunque, e da lì
passano nomi di ruolo e, con `ALTER ROLE`, una password.

**Le barre rovesciate non sopravvivono a due livelli di virgolette.**
`'C:\Pathfinder\data\pathfinder.db'` dentro un `node -e "…"` lanciato da
una shell POSIX arriva come `C:Pathfinderdatapathfinder.db`, e
`better-sqlite3` **crea** quel file invece di lamentarsi: un database vuoto,
in una cartella a caso, che risponde `0 righe` con la faccia seria. Il 26/08
è servito a far credere per un minuto che il magazzino fosse vuoto. Nei
percorsi Windows dati a Node **si usano le barre in avanti**, che Windows
accetta e nessuna shell mangia.
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

**Un banco che svuota tavoli non deve poter puntare a un database di lavoro
— 2.6.** `test/driver.test.js` e il banco PostgreSQL di `collaudo.js` fanno
`TRUNCATE` di tutti i tavoli a ogni corsa. Puntavano allo stesso database su
cui si stava provando l'applicativo, e una corsa di `npm test` ha portato via
gli 11.197 articoli appena migrati: se n'è accorto solo chi ha aperto
l'applicativo ed è andato a guardare i conteggi — `3000 articoli · 5 giacenze`
invece di `11.197 · 886`. **Nessuna prova era fallita**, perché il danno lo
faceva il collaudo stesso, e faceva quel che doveva fare.

Adesso i banchi usano `PATHFINDER_PG_COLLAUDO` e **non ripiegano** su
`PATHFINDER_PG` quando manca: si saltano dicendo perché. Il ripiego silenzioso
su un database di lavoro *è* il gesto che ha fatto il danno. E c'è una seconda
guardia sul nome — il database deve finire per `_collaudo` — perché la prima
protegge da una dimenticanza e la seconda da una distrazione.

**E IL SERVIZIO DI BANCO EREDITA `PATHFINDER_PG` DALLA MACCHINA — 2.9.** Quella
guardia copre i collaudi, non il banco. `installa-servizio.ps1` scrive
`PATHFINDER_PG` fra le variabili di macchina, e punta al database **in
servizio**: da lì in avanti ogni `node server\pathfinder-server.js` lanciato a
mano se la porta dietro, `PATHFINDER_DB` compreso — perché la variabile batte
il file, ed è scritto in `lib/db.js`. Il banco nasceva così su PostgreSQL di
produzione con una porta sua e un file SQLite ignorato: la porta 4199 e il
nome del file dicevano «banco», e le scritture andavano nel vero. Si accende
**passandola vuota nella stessa riga**, che è la forma già usata per
`PATHFINDER_DEV_API` in §3:

```powershell
$env:PATHFINDER_PG=''; $env:PATHFINDER_PORT='4199'; $env:PATHFINDER_DB="$BANCO\db\<file>.db"; node server\pathfinder-server.js
```

Il servizio lo dichiara all'avvio — `database  SQLite — <percorso>` — e
**quella riga si legge prima di toccare qualunque cosa**: è l'unico posto in
cui la differenza fra banco e produzione si vede a occhio.

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

**Un flag d'istanza non dice «sono dentro una transazione» — 2.6.** Con
un'interfaccia asincrona, un booleano sull'oggetto viene letto anche da chi
quella transazione non l'ha aperta: una seconda richiesta HTTP lo trova alzato,
crede di essere annidata, e il suo corpo gira **dentro la transazione di un
altro terminale**. Su SQLite non si vede mai — gli `await` si risolvono in
microtask, e la prima transazione finisce prima che Express prenda la seconda
richiesta — quindi 98 collaudi verdi non dicono niente su questo. Si è visto
alla **prima corsa su PostgreSQL**, con la prova della contesa che passava due
volte su due. La cosa giusta è `AsyncLocalStorage`, che segue la catena
asincrona invece dello stato dell'oggetto.

**Un `ON CONFLICT` senza la chiave nella INSERT non scatta mai — 2.6.** Su una
collezione a chiave automatica, `put` deve scrivere la colonna `_id` fra le
colonne dell'INSERT: senza, l'`ON CONFLICT(_id)` non ha su cosa scattare e
l'aggiornamento diventa un inserimento. Il sintomo non è un errore: è **una
riga nuova a ogni salvataggio** e un saldo che non scende. Tinse di rosso 28
prove del servizio in un colpo, e il messaggio di ognuna parlava d'altro.

**`toISOString()` non è il giorno di chi lavora — 2.6.** Il backup nominava i
file con la data UTC: alle 01:52 del 26/08, ora di Roma, scriveva
`pathfinder-2026-08-25.db` — **lo stesso nome del backup serale delle 20:00**,
e glielo scriveva sopra. La copia che si prende prima di installare si prende a
fine turno, ed è esattamente quella che serve se qualcosa va storto. Un backup
che ne cancella un altro non è un backup.

**Due database non nominano allo stesso modo lo stesso rifiuto — 2.6.** SQLite
alza `SQLITE_CONSTRAINT_UNIQUE`, PostgreSQL lo SQLSTATE `23505`. Con mezza mappa
la stessa richiesta respinta tornava **409 da una parte e 500 dall'altra**: al
terminale, «ci hai riprovato» contro «il servizio si è rotto». Vale per i tipi
allo stesso modo: `pg` decodifica `int8` in **stringa** per non perdere cifre, e
`_id` sarebbe tornato `"1"` da un database e `1` dall'altro.

**`rejectUnauthorized: false` non è «accetta il certificato di Azure»: è
«accetta chiunque» — 2.6.** Era la prima stesura del driver PostgreSQL, e da lì
sarebbero passati la stringa di connessione e il PIN degli operatori. Node porta
con sé le CA di Mozilla e il certificato di Flexible Server risale a una di
quelle: verificare non costa niente. Una CA aziendale si indica con un **file**,
non spegnendo il controllo.

**Un audit che trova un difetto nello script che lo ha scritto — 2.6.** Lo
script che maiuscola i codici firmava le fusioni `SISTEMA`, che non era in
anagrafica: avrebbe riaperto la voce 18, «nessuna firma orfana su 264
movimenti». L'ha trovato l'audit stesso, girato sul risultato invece che sulla
partenza. **Un audit si passa anche dopo, non solo prima.**
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
  concorrenza si risolve con **una transazione dentro `/api/op/…`**, non con la
  disciplina di chi scrive. **Dalla 2.6 le transazioni si fanno UNA PER
  VOLTA**, e non è una svista: l'interfaccia del servizio dati è asincrona, e
  un `await` dentro una transazione ridà il turno al ciclo degli eventi. Senza
  una coda, una seconda richiesta HTTP si infilerebbe dentro la transazione
  aperta — è successo, e su PostgreSQL si è visto alla prima corsa. Il prezzo è
  un tetto di throughput che SQLite aveva già.
- **Documento JSON con colonne materializzate**: si indicizza solo ciò che serve,
  il resto vive in `data`. È il motivo per cui un campo nuovo non è una
  migrazione.
- **Servizio on-prem, attività pianificata**, non servizio Windows nativo (NSSM
  è il file che l'antivirus blocca alle sette di mattina). Niente Redis, niente
  Entra ID: si resta al PIN. Sage X3 fino al 2038.
- **«NIENTE AZURE» NON VALE PIÙ, E POSTGRESQL È ACCESO — 26/08/2026.** Fino
  alla 2.5 questa riga diceva «niente Azure». Il ramo `server/azure/` esisteva
  perché la decisione si potesse prendere con i numeri davanti; i numeri sono
  stati messi davanti, e **il 26/08 sera il magazzino è passato a PostgreSQL**.
  Lo decide `PATHFINDER_PG`, che `installa-servizio.ps1 -PostgreSQL` scrive in
  una variabile di macchina — non in un file, non nel repository.
- **IL DATABASE STA SULLA STESSA MACCHINA DEL SERVIZIO, e questo non è un
  passo verso Azure: è un passo che lo evita.** `pathfinder` gira su
  `127.0.0.1:5432`. La continuità operativa non è cambiata di una virgola —
  il magazzino si ferma quando si ferma questo PC, esattamente come quando i
  dati stavano in un file. **Il primo punto di `server/azure/LEGGIMI.md` —
  «niente lavoro offline» diventa «niente lavoro senza linea» — NON è stato
  pagato**, e si paga il giorno che il database esce da questa macchina. Quel
  giorno è una decisione di continuità operativa, non di architettura, e non
  è presa.
- **Si torna a SQLite con un comando**, e il file è ancora lì:
  `installa-servizio.ps1` senza `-PostgreSQL`. Ma **riporta l'applicativo, non
  i dati**: da oggi la via di casa è il `.dump` della sera prima, e
  `C:\Pathfinder\data\pathfinder.db` invecchia dal 26/08.
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
- **I CODICI SI SCRIVONO IN MAIUSCOLO — 2.6.** Articolo, lotto, `item_key`,
  ubicazione, UDC, SSCC, ODP, DDT, sigla operatore, unità di misura: un codice
  scritto in due grafie **non è un problema di resa a video, è una seconda
  entità che nasce**. Il 26/08, in `MAG1-RAKA-01-05-C`, lo stesso lotto stava a
  scaffale due volte — `6001412#cl260854` con 5 pezzi e `6001412#CL260854` con
  1 — e il FEFO le ordinava separate. **Normalizza il SERVIZIO**, a ogni
  scrittura e da qualunque parte arrivi (§6 dice che l'arbitro è il server, e
  due terminali più un import da Excel non passano dalla stessa maschera); il
  client maiuscola mentre si digita, lettore ottico compreso, ma quella è la
  comodità, non la garanzia. **L'elenco dei campi sta in `MAIUSCOLE`, dentro
  `server/lib/schema.js`, e NON comprende**: il PIN (`pin_hash`, `pin_salt`,
  che sono base64 e maiuscolati smettono di verificarsi), le chiavi di `meta`
  (camelCase: `areaWip`, `udcPrefissoGS1`), gli enum confrontati alla lettera
  nel codice (`'empty'`, `'pallet'`, `'operator'`, `'open'`, `'in'`), e la
  prosa — descrizioni, note, nomi propri, indirizzi. La prova
  `test/maiuscole.test.js` non lascia passare un campo che nessuno ha
  classificato, e ha una guardia apposta perché il PIN non ci finisca dentro.
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
  `SAMPLE`) — **ma solo per gli articoli che hanno l'unità di misura
  configurata.** Senza unità di misura il campione **non modifica la giacenza**:
  regola cambiata il 25/08, scritta per esteso più sotto e non ancora nel
  codice (voce 42). **La Conta è un
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
- **Il campione guarda l'unità di misura dell'articolo, e si comporta in due
  modi** — regola cambiata da Andrea il **25/08/2026**, e **non ancora nel
  codice: voce 42**.
  - **Articolo CON l'unità di misura configurata**: si scala **la UM
    richiesta**. I colli non calano — è la promessa per cui `sampleItem`
    esiste separata da `removeItem`, e per quegli articoli resta intera.
  - **Articolo SENZA unità di misura configurata**: il campione **non modifica
    la giacenza**. Né colli né UM: il prelievo del CQ avviene, e a magazzino
    non cambia niente.

  *La regola di prima, valida fino al 25/08 e ancora quella che il codice
  applica:* «un campione lascia sempre un residuo — svuotare un collo non è
  campionare, è prelevarlo: la rotta si rifiuta, con il motivo». Il CQ a volte
  ha bisogno di tutto il collo, e con quella regola non poteva averlo.

  **Chi tocca `sampleItem` legga prima la voce 42**: cambia il significato di
  `SAMPLE`, e il logbook della qualità si tiene sei anni.
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
| `modules/stoccaggio.ts` | 613 | **1.13** — dove si mette la merce: vincoli duri, poi punteggio. Le regole sono un dato di `storage_rules`. Ogni proposta dice perche'. Puro. **2.8**: pericolosita' e matrice fra i vincoli duri, portata accanto alla capienza, la casa del lotto che esclude tutto il resto, e la categoria merceologica come terzo bersaglio di regola — con la gerarchia che tiene UN livello solo, il piu' preciso che ha colpito |
| `modules/regoleBase.ts` | 448 | **2.8** — le due regole che NON si scrivono: lo stesso articolo sulla stessa UDC (si scavalca) e lo stesso articolo/lotto nella stessa ubicazione (non si scavalca). Piu' la matrice di incompatibilita' e i tre motivi precompilati dello scavalco. Sta da solo e non dentro `stoccaggio.ts` perche' quelle sono regole di POLITICA, queste sono il modo in cui un magazzino resta leggibile. Puro |
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
| `modules/conformita.ts` | 300 | Cosa è stoccato dove non dovrebbe: il motore di stoccaggio al contrario. **2.8**: la pericolosita' (tre controlli simmetrici agli allergeni) e il lotto sparso su piu' vani, con le aree di transito escluse. **2.9**: la matrice e' uscita, e con lei il tipo `INCOMPATIBILITA` |
| `modules/validate.ts` · `auth.ts` · `session.ts` · `pickupAlert.ts` · `scanGuard.ts` | 104 · 88 · 69 · 43 · 31 | Validazioni · PIN e impronta · sessione · allerta ritiri · guardia del lettore |
| `modules/excel.ts` | 31 | **Il punto unico da cui SheetJS si carica, e solo quando serve.** Chi rimette `import * as XLSX` in cima a un file annulla la 1.7 |
| `modules/fogli.ts` | 112 | **2.0** — le due domande di un foglio Excel che non riguardano SheetJS: quante righe fa una giacenza (`colliDaStendere`: una per collo) e che numero scrive un riepilogo che ha visto unità diverse (`celleUom`: MISTA, e il totale vuoto). Sta qui e non nella vista perché una vista si importa solo passando da `App`, e una funzione pura non deve farlo per essere collaudata. **`distendiGiacenze` è il muro del foglio**: 1.048.575 righe, contate su TUTTE le giacenze insieme e non su una — duecento righe da diecimila colli fanno due milioni di righe, ognuna innocente e il foglio morto lo stesso. Una riga che da sola sfonda il foglio non ne consuma il budget e torna `null`, e chi chiama ne scrive una che lo dice: quella riga è un numero sbagliato, non merce. Puro |
| `types/entita.ts` · `contratto.ts` · `collezioni.ts` | 722 · 157 · 63 | Le entità · l'interfaccia dei due adapter · **le 21 collezioni, sorgente unica**: il `satisfies` blocca la compilazione se adapter o servizio divergono. **2.8**: la ventunesima è `location_attrs`, e `RegolaStoccaggio` ha smesso di dichiarare `quando`/`allora` — una forma immaginata alla 1.4.4 e mai scritta a database, mentre la maschera scriveva i campi piatti dal primo giorno |
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
| `lib/db.js` | 78 | **La facciata, dalla 2.6**: legge `PATHFINDER_PG` (variabile di macchina, poi `.env.local`), sceglie il driver e lo restituisce pronto. Variabile **impostata vuota** = «no, SQLite», e batte il file: serve ai collaudi, che non devono cambiare comportamento perché su quella macchina qualcuno ha lasciato una stringa di connessione |
| `lib/driver-base.js` | 318 | **TUTTA la logica del servizio dati, una volta sola per due database.** Scritture, letture, filtri, transazioni, revisione e notifica, e la normalizzazione in maiuscolo. I driver portano solo i quattro gesti che un database sa fare: esegui, leggi righe, apri e chiudi una transazione. **`AsyncLocalStorage`, non un flag**: un booleano d'istanza non distingue «annidato» da «un'altra richiesta HTTP», e la seconda finirebbe dentro la transazione della prima — §5 |
| `lib/driver-sqlite.js` | 121 | `better-sqlite3`, **`_migra`**, backup a file. È quello in servizio, ed è la via di casa |
| `lib/driver-postgres.js` | 199 | `pg`, il pool, la connessione fissata alla transazione, il riallineamento delle sequenze, il controllo della collazione. `int8` decodificato a numero, o `_id` tornerebbe stringa da una parte e numero dall'altra |
| `lib/sql.js` | 259 | **TUTTO lo SQL, col dialetto come parametro.** Segnaposti (`?` contro `$1`), INSERT a molte righe, l'upsert, i filtri, `countAll` in una istruzione sola. `startsWith` è `substr(col,1,N) = ?` e **non** un `LIKE`: quello di SQLite ignora le maiuscole e quello di PostgreSQL no |
| `lib/schema.js` | 297 | Tabelle e indici — **due funzioni separate**, con la migrazione in mezzo. E **`MAIUSCOLE`**: i campi che sono un codice, dichiarati accanto al vocabolario delle collezioni |
| `lib/schema-postgres.js` | 133 | Il DDL PostgreSQL, generato dalla **stessa** dichiarazione. Ogni colonna di testo porta `COLLATE "C"`: senza, `ORDER BY location_code` esce in un altro ordine e il magazzino vede le corsie rimescolate. **Salito da `azure/` in `lib/` con la 2.6**, perché il servizio lo esegue e `azure/` è escluso da `tsconfig.server.json` |
| `installa-pathfinder.ps1` | — | **L'installer**: chiede dove installare la prima volta e la rilegge dalla macchina aggiornando, capisce se è aggiornamento o prima installazione, si eleva **sempre** (ferma il servizio), porta applicativo **e** servizio, riavvia, e verifica che i due numeri coincidano. Nel pacchetto diventa `installa.ps1`. `-NonChiedere` per provarlo senza una persona davanti, **`-Prova`** per fargli dire cosa farebbe senza toccare niente |
| `Installa Pathfinder.bat` · `LEGGIMI-pacchetto.txt` | — | Il doppio clic e le istruzioni per chi installa. Nel pacchetto diventano `Installa Pathfinder.bat` e `LEGGIMI.txt` |
| `installa-servizio.ps1` | — | Registra le due attività pianificate e le variabili, **`PATHFINDER_PG` compresa**. Da amministratore, **una volta**, **dal sorgente** o dalla copia in `C:\Pathfinder\servizio` |
| `prepara-postgres.ps1` | — | **2.7 — controlla PostgreSQL e prepara ruolo e database.** Binari (psql, pg_dump, pg_restore), servizio Windows, porta, superuser, poi `CREATE ROLE` e `CREATE DATABASE` con `LC_COLLATE 'C'`. **Il motore non lo installa e non lo scarica**: se manca, dice dove si prende e si ferma. La password del ruolo la **genera**, con un alfabeto che in un URL non va codificato, e la mostra una volta sola. `-Prova` guarda e non tocca |
| `installa-versione.ps1` | — | **Disinstalla e reinstalla**: toglie dal deposito la cartella di quel numero, la riscrive con i byte del pacchetto e la **materializza** in `corrente`, spostando in `precedente` quella che c'era. Avvolge anche una consegna a file singolo. `-Casa` per il banco |
| `torna-indietro.ps1` | — | Scambia il contenuto di `corrente` e `precedente`. **Riporta indietro il solo applicativo**, non il servizio: dal 18/08 si torna indietro reinstallando il pacchetto della versione di prima — §4 |
| `backup-serale.ps1` | — | Backup a caldo, attività pianificata delle 20:00 |
| `migrazione/migra-sqlite-postgres.js` · `migrazione/audit.js` · `migrazione/audit-sqlite.js` · `migrazione/maiuscola-codici.cjs` · `migrazione/LEGGIMI.md` | — | **2.7 — si chiamava `azure/`, e adesso VIAGGIA NEL PACCHETTO.** Migra una COPIA del database e ricontrolla i conteggi tavolo per tavolo; prima di copiare gira l'audit e si ferma se ci sono valori che PostgreSQL rifiuta o grafie che collidono. `maiuscola-codici.cjs` è sceso qui **da `banco/`**, che nel pacchetto non c'è: finché stava lì, `migra-sqlite-postgres.js` non si poteva consegnare — su una macchina di magazzino `require('../../banco/...')` non risolve. `azure/schema-postgres.js` è stato **cancellato**: era il gemello di `lib/schema-postgres.js`, e non lo chiamava più nessuno dalla 2.6 |
| `test/collaudo.js` · `test/collaudo-migrazione-1.4.js` | 520 · 158 | 81 prove sul servizio vero · 8 sul cambio di schema |
| `test/collaudo-installazione.js` | — | **29 prove sugli script di installazione**: esercita `installa-versione.ps1` e `torna-indietro.ps1` su una casa temporanea, con consegne finte che si distinguono per i byte; e l'**installer a doppio clic** in `-Prova`, che è il modo di provarlo senza registrare attività pianificate su questa macchina |

### Collaudi — `test/`

`serpentina` · `fefo` (19) · `geometria` (21) · `odp` (26) · `anagrafica` (27) ·
`conformita` (19) · `cache` (43) · `pacchetto` (27) · `statistiche` (15) ·
`compiti` (114) · `misure` (65) · `colli` (66) · `parametri` (19) · `documenti` (6) ·
**2.6**: `auditMigrazione` (21 — le forme di data, il byte zero, il surrogato
spaiato, la colonna che diverge dal documento) · `maiuscole` (17 — quali campi
sono un codice, la guardia che tiene il PIN fuori dall'elenco, e la lettura dei
sorgenti che non lascia passare un campo non classificato) · `sql` (31 — i due
dialetti, i lotti di scrittura, `startsWith` che non è un `LIKE`, l'`orderBy`
ostile) · **`driver` (62 — LE STESSE 31 PROVE SUI DUE DATABASE**: il giro
normale, i codici in maiuscolo, i lotti da tremila righe, le transazioni che
non si intrecciano, l'ordinamento byte per byte, e in fondo i tentativi di
rottura — una collezione che non esiste, un campo non indicizzato, un `orderBy`
con dentro una `DELETE`, un `anyOf` da ottantamila valori). Senza
`PATHFINDER_PG` le trentuno di PostgreSQL si dichiarano **saltate col motivo
scritto**, invece di tacere) — **1.108 prove in 38 file.** `ambiente.js` è
il preambolo comune. **Alla 2.9 sono 1.176 in 40 file.**

**LA BATTERIA A CONFRONTO HA GUADAGNATO IL SUO COSTO ALLA PRIMA CORSA.** Quattro
difetti che SQLite non poteva mostrare: due terminali che entravano nella stessa
transazione, `_id` che tornava stringa da una parte e numero dall'altra, lo
stesso rifiuto mappato 409 su un database e 500 sull'altro, e una chiave non
numerica che su SQLite non trovava niente e su PostgreSQL alzava un errore di
sintassi. Nessuno sarebbe uscito provando un database solo — §1.

Le tre prove del 2.2 leggono il SORGENTE invece di girare il codice, e non è
un ripiego: fissano regole che un DOM non c'è per verificare — una riga che
nasce `hidden` si accende togliendo la classe, ogni causale di merce scrive
le quantità, l'entrata nel vano WIP passa dal registro. Un difetto trovato in
browser che nessuna prova poteva vedere si chiude così, o non si chiude.

`schemaPostgres` è l'unica prova del ramo Azure che gira a ogni `npm test`,
e serve a una cosa: che il giorno che qualcuno decide di provarlo, lo
schema PostgreSQL descriva le stesse ventuno collezioni che il servizio usa
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
| **`PATHFINDER_PG`** | **2.6 — quale database.** Assente → SQLite, esattamente come la 2.5. Presente → PostgreSQL con quella stringa di connessione. **Impostata VUOTA** → SQLite, dichiarato, e batte `.env.local`: serve ai collaudi, che non devono cambiare comportamento perché su quella macchina qualcuno ha lasciato una stringa in un file. **Non sta nel repository**: al banco in `.env.local` (che `.gitignore` esclude), per il servizio vero in **Azure Key Vault**, mai in uno script di installazione |
| `PATHFINDER_PG_POOL` · `_IDLE` · `_TIMEOUT` | Connessioni del pool (10), millisecondi prima di chiudere una connessione ferma (30.000), attesa per averne una (10.000). `_IDLE` **sta sotto** la soglia di Flexible Server apposta: è il pool a doverle chiudere per primo, o le trova morte a metà turno |
| `PATHFINDER_PG_CA` | Il file della CA aziendale, quando il certificato non risale a una delle CA che Node porta con sé. **È un file, non un interruttore che spegne il controllo**: il certificato si verifica sempre |
| `PATHFINDER_COLLAUDO_PG` | `1` fa girare `server/test/collaudo.js` — le stesse 98 prove del servizio — contro PostgreSQL invece che su SQLite |
| `PATHFINDER_TLS_CERT` / `_KEY` | assenti → HTTP |

**Si leggono all'avvio**: cambiate senza riavvio non hanno effetto.

---

## 9. Dove sta il resto

| Serve | Dove |
|---|---|
| Installare il servizio da zero, diagnosticare, backup | [README.md](README.md) |
| ~~Demo portatile su chiavetta USB~~ · ~~Sheet tecnico IT~~ | **NON ESISTONO PIÙ — voce 43.** `Avvia Demo.bat`, i tre `README-DEMO` e i tre `IT-TECH-SHEET` vivevano dentro `consegna/`, che `npm run build` azzera a ogni giro. Non li produce `vite.config.js` e non sono mai entrati in git: cercati su tutto il disco il 25/08, non c'è traccia. **Vanno riscritti** |
| Versioni precedenti, loghi, etichette, file di prova, banco storico | `ARCHIVIO/` — e **non si cancella niente**: un archivio svuotato funziona una volta sola. **Sta fuori dal repository dal 25/08**: il perché è scritto per esteso in `.gitignore`, e il backup è OneDrive |
| Il ramo git della 2.3 ritirata | `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/2.3-reparto-e-giro-conto.bundle` — storia completa, recupero provato |
| La storia: handoff e piani fino al 17/08/2026 | `ARCHIVIO/HANDOFF STORICI/` — **memoria, non istruzioni** |
| Cosa è stato archiviato e quando | `ARCHIVIO/archive-manifest.json` |
| Come si disegna un'interfaccia da magazzino | `.claude/skills/erp-wms-frontend/SKILL.md` — **2.1**. Se diverge da §6, vince §6 |
| Cosa costerebbe davvero passare ad Azure | `server/azure/LEGGIMI.md` — **2.1** |

---

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
