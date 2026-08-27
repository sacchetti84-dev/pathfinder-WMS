# PATHFINDER — SCHEDA TECNICA PER IL TEAM IT

**Codice:** REP-IT-001 | **Revisione:** 01 | **Data:** 28/08/2026

**Redatto da:** Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

**Oggetto:** applicativo web per la gestione del magazzino alimentare in regime
GMP. Richiesta di autorizzazione all'installazione su una postazione di rete
aziendale.

---

## 1. Scopo del documento

Questo documento descrive Pathfinder al team IT che deve **autorizzarne
l'installazione**: che cosa installa, dove scrive, quali porte apre, con quale
account gira, quali dati tratta, che cosa **non** fa, e quali sono i limiti
noti oggi.

È scritto per rispondere alle domande che l'IT fa per prime, e le risposte sono
**misurate sull'installazione di prova**, non dedotte. Dove un punto è aperto,
è scritto che è aperto (capitolo 10).

## 2. Campo di applicazione

Si applica all'installazione di Pathfinder su una postazione Windows della rete
aziendale, con più terminali di magazzino che vi si collegano da browser.
Non si applica a installazioni su cloud pubblico, che oggi non sono previste.

---

## 3. Risposte rapide

| Domanda | Risposta |
|:---|:---|
| Che cos'è, tecnicamente | Un servizio Node + Express su una macchina Windows, che serve una pagina web e parla con un database PostgreSQL locale |
| Dove stanno i dati | **Solo su quella macchina**: PostgreSQL su `127.0.0.1:5432`, backup in `C:\Pathfinder\backup\` |
| Esce qualcosa dall'azienda | **No.** Nessuna telemetria, nessuna chiamata verso l'esterno, nessun CDN, nessun servizio di terzi. Il codice non contiene un solo indirizzo remoto |
| Che porta apre | Una: **TCP 4173** in ingresso, profili *Dominio* e *Privato* |
| Con che account gira | `SYSTEM`, da un'attività pianificata avviata all'accensione |
| Serve internet | **Solo alla prima installazione**, per scaricare tre dipendenze Node dal registry npm. Poi mai più |
| Che cosa installa sui client | **Niente.** I terminali aprono un indirizzo nel browser |
| Quanto pesa | Applicativo: 1,8 MB in 4 file. Database oggi: ~24 MB con 11.197 articoli e il registro movimenti |
| Che privilegi servono per installare | Amministratore locale, una volta per installazione |
| Come si aggiorna | Si rilancia il pacchetto della versione nuova. Fermo servizio: pochi secondi |
| Come si torna indietro | Si reinstalla il pacchetto della versione precedente. Il database non viene mai toccato |
| Chi può accedere | Solo chi ha un PIN di operatore. Senza sessione le rotte dati rispondono **401** |
| Dati personali trattati | Nome, cognome, sigla e impronta del PIN degli operatori. Nient'altro |

---

## 4. Architettura

```
   Terminali di magazzino          Postazione server (Windows)
   ─────────────────────           ───────────────────────────────────
   MC9400 / tablet / PC            ┌─────────────────────────────────┐
   browser, nessuna                │ Attività pianificata (SYSTEM)   │
   installazione locale            │  └─ node pathfinder-server.js   │
            │                      │       Express — porta 4173      │
            │   HTTP / LAN         │       sessione a cookie         │
            └─────────────────────►│       SSE per gli aggiornamenti │
                                   │                │                │
                                   │                ▼                │
                                   │  PostgreSQL 17 — 127.0.0.1:5432 │
                                   │  database `pathfinder`          │
                                   │                                 │
                                   │ Attività pianificata — 20:00    │
                                   │  └─ backup-serale.ps1 → .dump   │
                                   └─────────────────────────────────┘
```

| Strato | Tecnologia | Note |
|:---|:---|:---|
| Interfaccia | TypeScript, nessun framework, CSS con Tailwind | Un solo bundle, 4 file, caricato dal browser |
| Servizio | Node.js ≥ 20, Express 4 | Un processo, nessun servizio Windows nativo |
| Persistenza | PostgreSQL 17 (predefinito) oppure SQLite | Lo decide una variabile di macchina; lo stesso codice parla tutti e due |
| Aggiornamenti a video | Server-Sent Events | Un terminale che scrive, gli altri lo vedono senza ricaricare |
| Documenti | Generati in pagina e stampati dal browser | DDT, verbali, cartellini, rendiconti, rapporti di prelievo |

**Perché un'attività pianificata e non un servizio Windows nativo.** Un servizio
nativo su Windows richiede un wrapper (tipicamente NSSM), che è un eseguibile
non firmato che l'antivirus blocca. L'attività pianificata è nativa, si vede in
Utilità di pianificazione, si ferma e si riavvia con gli strumenti standard, e
non aggiunge nulla al parco software.

**Un solo database, più terminali, e l'arbitro è il server.** La concorrenza non
è affidata alla disciplina di chi scrive: ogni operazione composta gira dentro
una transazione lato servizio.

---

## 5. Requisiti e prerequisiti

### 5.1 Postazione che ospita il servizio

| Voce | Requisito |
|:---|:---|
| Sistema operativo | Windows 10/11 o Windows Server, 64 bit |
| Runtime | **Node.js LTS ≥ 20**, installato preventivamente. L'installer lo verifica e si ferma se manca |
| Database | **PostgreSQL 17**, installato preventivamente. L'installer controlla motore, servizio, porta e binari `pg_dump` / `pg_restore`, e **se mancano dice dove si prendono e si ferma senza toccare niente** |
| Disco | ~500 MB per applicativo, servizio e dipendenze; più lo spazio dei backup (~0,5 MB per backup, uno al giorno) |
| Memoria | Il processo Node sta sotto i 200 MB. Il dimensionamento reale lo detta PostgreSQL |
| Rete | Un indirizzo IP raggiungibile dai terminali; porta 4173 in ingresso |
| Accesso a internet | **Solo alla prima installazione**, per `npm install` di tre pacchetti (`express`, `pg`, `better-sqlite3`). Le dipendenze non viaggiano nel pacchetto |
| Privilegi | Amministratore locale, richiesto a ogni installazione (serve a fermare l'attività pianificata) |

> **⚠ ATTENZIONE:** i due prerequisiti — Node e PostgreSQL — sono **una scelta
> dichiarata, non una dimenticanza**. Su un PC di magazzino un installer che
> scarica ed esegue un motore di database è l'antivirus che blocca, l'IT che
> chiede conto e nessuno che sappia più perché il magazzino è fermo. Pathfinder
> controlla, dichiara che cosa manca, e si ferma.

### 5.2 Terminali

| Voce | Requisito |
|:---|:---|
| Software | Un browser aggiornato (Chrome, Edge, Firefox). **Nessuna installazione** |
| Schermo | L'interfaccia è tarata sul terminale Zebra MC9400 (4,3", 800×480, fra i 400 e i 533 px CSS) e si adatta fino al desktop |
| Input | Lettore ottico in emulazione tastiera. Nessun driver dedicato |
| Rete | Accesso HTTP alla porta 4173 della postazione server |

---

## 6. Installazione, aggiornamento, ripristino — il progetto è plug & play

Il pacchetto di consegna è una cartella che si copia su una chiavetta e si
installa **a doppio clic**, senza digitare niente e senza ricordare comandi.

```
Pathfinder <versione>\
  Installa Pathfinder.bat     ← doppio clic, INVIO, fine
  installa.ps1                il motore
  LEGGIMI.txt
  app\                        indice, assets, manifesto con le impronte
  servizio\                   il servizio dati, i suoi script, la migrazione
```

### 6.1 Che cosa fa l'installer, e in che ordine

**L'installer capisce da solo che cosa ha davanti.**

| Caso | Comportamento |
|:---|:---|
| **Prima installazione** | Chiede **dove** (INVIO accetta `C:\Pathfinder`); verifica Node e PostgreSQL; prepara ruolo e database generando la password; copia il servizio; registra l'avvio all'accensione e il backup serale; apre la porta sul firewall; installa l'applicativo |
| **Aggiornamento** | **Non chiede dove**: lo rilegge dalla macchina, e una radice diversa la **rifiuta** — spostare un'installazione non è installare. Ferma il servizio, copia applicativo **e** servizio, riaccende |
| **Prova a vuoto** | `.\installa.ps1 -NonChiedere -Prova` dice radice, strada e riavvio, **senza toccare niente**. Si può lanciare su una macchina in servizio |

**Alla fine verifica due cose, non una:** l'impronta SHA-256 dell'applicativo
contro il manifesto, e che il servizio dichiari lo stesso numero di versione. Se
uno dei due non torna, **l'installazione è dichiarata fallita** e lo dice.

### 6.2 Che cosa l'installer NON fa

- **Non scarica software da internet** oltre alle tre dipendenze npm.
- **Non installa il motore di database**: lo controlla e si ferma se manca.
- **Non tocca il database esistente.** Se la stringa di connessione che la
  macchina ha in mano risponde, non crea niente e non rigenera nessuna password.
- **Non riscrive nessun dato** all'installazione. Ogni campo nuovo è facoltativo
  e la sua assenza significa «come nella versione precedente»: per questo un
  aggiornamento non è mai una migrazione di dati.
- **Non chiede a nessuno di digitare una password**: quella del ruolo di
  database la **genera lui**, la mostra una volta e poi vive solo in una
  variabile di macchina.

### 6.3 Configurazione dopo l'installazione

Per lavorare **non serve compilare niente**. Il magazzino si disegna dalla
configurazione delle zone e le ubicazioni vengono **generate** da corsie,
campate e livelli: non c'è un'anagrafica di duemila vani da caricare a mano. Le
regole di stoccaggio sono un dato facoltativo: finché non ci sono, il motore
lavora sui soli vincoli.

Su una macchina appena installata nessuno ha un PIN, e senza una via d'ingresso
il primo non si potrebbe creare: il servizio allora accetta il primo accesso e
lo **dichiara a lettere chiare all'avvio**. Appena il primo PIN esiste, quella
finestra si chiude da sola e non si riapre.

### 6.4 Ripristino

| Gesto | Effetto |
|:---|:---|
| **Tornare a una versione precedente** | Si reinstalla il pacchetto di quella versione. È l'unico gesto che riporta indietro **anche il servizio** |
| **Il database** | **Non si tocca mai.** Una versione vecchia rilegge il database di una nuova; ci sono 8 prove automatiche che lo verificano a ogni rilascio |
| **Ripristino dati** | Dal `.dump` prodotto dal backup serale |

> **💡 TIP:** la build è **riproducibile bit per bit**. Ricostruendo lo stesso
> commit a giorni di distanza esce la stessa impronta SHA-256: un pacchetto
> perso non è perso, e l'impronta è una prova di *quale codice* c'è dentro, non
> solo di quali byte.

---

## 7. Le caratteristiche funzionali

Il capitolo descrive che cosa fa l'applicativo e **perché è fatto così**. Le
note in corsivo richiamano il principio del Toyota Production System a cui la
scelta corrisponde: il progetto non nasce da un manuale lean, ma le stesse
domande hanno prodotto le stesse risposte, e dove il parallelo **non** regge è
scritto.

### 7.1 Il controllo delle ubicazioni — il problema da cui il progetto nasce

**Prima:** la merce si posava dove capitava, e dove fosse finita lo sapeva chi
ce l'aveva messa. Lo stesso lotto poteva stare in due vani, contato due volte, e
la rotazione a scadenza lo ordinava come due partite diverse.

**Adesso:**

- **Ogni movimento porta l'ubicazione**, e le ubicazioni non si scrivono a mano:
  si generano dalla geometria della zona (corsie, campate, livelli, posizioni).
- **Due regole di base, che non sono un dato e non si cancellano.** La prima —
  lo stesso articolo sulla stessa unità di carico — è un consiglio forte, e si
  scavalca dichiarando il motivo. La seconda — **lo stesso articolo/lotto in una
  sola ubicazione** — non si scavalca: la giacenza di un lotto è una riga per
  vano, e due righe sono la strada più corta per un saldo sbagliato ma
  plausibile.
- **Un motore di stoccaggio propone dove mettere la merce**, valutando i vincoli
  duri (stato del vano, temperatura, allergeni, pericolosità, capienza, portata)
  e poi ordinando i candidati con un punteggio. **Ogni proposta dice perché, e
  ogni escluso dice per quale motivo.** Misurato: 330 ubicazioni valutate in
  **2,1 – 2,8 millisecondi**, mentre l'operatore scansiona.
- **La verifica al contrario**: la mappa segnala che cosa è stoccato dove non
  dovrebbe, con la gravità, il perché e dove va rimesso.
- **La prova che l'operatore era davvero davanti al vano**: l'ubicazione si
  scansiona, e la spunta cade se cambia il vano, se ci si sposta su
  un'ubicazione alternativa o se si esce dalla schermata.

> *Nota lean — poka-yoke e jidoka.* La scansione del vano è un dispositivo a
> prova d'errore: senza, la conferma non passa. Il segnale sulla mappa è un
> *andon*: rende visibile l'anomalia nel momento in cui nasce.
> **Dove il parallelo non regge, ed è una scelta:** in Toyota l'anomalia
> **ferma la linea**. Qui no. Chi ha la merce in mano e il muletto acceso non
> discute con una maschera che dice di no: o trova il modo di aggirarla — e
> allora il dato diventa peggiore di prima, perché nessuno sa più dove sia
> finita la merce — o si ferma, e si ferma il magazzino. Una banchina bloccata
> costa più di una riga fuori posto, e una riga fuori posto si vede e si
> corregge: **una merce posata di nascosto no.** Dalla versione 2.9 il sistema
> **segnala e assiste, non vieta** — con l'unica eccezione della regola che
> produrrebbe un saldo doppio.

### 7.2 Il controllo delle unità di misura in giacenza

È la caratteristica che distingue Pathfinder da una gestione a soli colli, ed è
il motivo per cui il progetto ha potuto partire senza un progetto di data-entry
a monte.

**Il problema, misurato sull'anagrafica vera di 11.197 articoli:** solo **2**
articoli dichiaravano insieme l'unità di misura e la quantità per collo. Un
magazzino alimentare riceve lo stesso codice in sacchi da 25 kg e la volta dopo
da 5: «sette colli» non è una quantità, e un export che dice sette colli
racconta un altro magazzino.

**La scelta: il dato nasce nel gesto, non in un progetto separato.**

| Momento operativo | Dato che entra | Perché lì |
|:---|:---|:---|
| Posizionamento a scaffale | La suddivisione dei colli, dichiarata | La dichiara chi ha i sacchi davanti, non chi guarda una tabella |
| Primo posizionamento di un lotto | La confezione si **congela sul lotto** | È un fatto del lotto e vale per tutti i suoi colli, ovunque stiano |
| Reso, inventario, conta | La quantità contenuta in un collo intero | Chi conta dichiara **com'è fatto lo scaffale**, e la differenza la traduce il sistema |
| Prelievo | Da quale collo esce la merce (`{misura, quantità}`) | Una quantità da sola non dice da quale collo esce: il saldo tornerebbe e i colli sarebbero sbagliati |

**Il risultato.** La giacenza esiste in **colli e in unità** insieme. Gli export
danno una riga per collo — contare le righe dà i colli, sommare la colonna dà le
unità — e un riepilogo che vede unità diverse **non somma: dichiara MISTA**, che
è la risposta onesta a «300 KG più 40 PZ».

**Come la copertura è cresciuta senza toccare l'anagrafica:** 7.077 articoli
sono rientrati traducendo la codifica `NR` di SAGE X3 (che non era un dato
mancante, era una codifica non tradotta); 4.036 sono rientrati sbloccando una
maschera che si nascondeva da sola; **82 restano fuori e lo dichiarano**, perché
la loro unità nomina un contenitore e non una misura.

> *Nota lean — genchi genbutsu, «vai a vedere».* Il numero non si indovina da
> una scrivania: lo dichiara chi ha il collo in mano, nel momento in cui ce
> l'ha. La stessa logica governa l'inventario, dove **il numero di sistema non
> si mostra prima di aver contato**: un foglio che porta già la risposta non è
> una verifica, è un suggerimento.

> *Nota lean — non riscrivere la storia.* Le unità che un movimento non porta si
> **derivano alla lettura**, mai riscrivendo il movimento: il registro è storia,
> e la storia si rilegge con quello che nel frattempo si è saputo.

### 7.3 Il prelievo guidato

- **Percorso a serpentina** costruito sulle coordinate reali dei vani, che parte
  dal magazzino dove sta il grosso della merce e non dal primo dell'elenco.
- **Più ordini di produzione in un solo giro.** Cinque ordini della stessa serie
  che chiedono lo stesso lotto diventano **una tappa sola**, la merce scende una
  volta e il conto di produzione resta **uno**; la ripartizione fra gli ordini si
  dichiara alla chiusura, e la somma delle quote fa esattamente quello che è
  uscito.
- **L'ubicazione si scansiona una volta per vano, non una per tappa.** Chi doveva
  prendere quattro articoli dallo stesso scaffale scansionava quattro volte lo
  stesso codice a terra, e la quarta la digitava senza guardare: *una verifica
  che si ripete quando non c'è niente da riverificare è una verifica che si
  smette di fare.*
- **Pausa dichiarata**, con i tempi scorporati dal report: su quattro ore
  d'orologio con un'ora di fermo, il tempo medio per riga passa da 24 a 18
  minuti — ed è il numero vero.
- **Rettifica di una tappa già prelevata**, che non riscrive il passato ma
  scrive un movimento di rientro.

> *Nota lean — muda di movimento e standard work.* La serpentina e il vano
> scansionato una volta tolgono passi e gesti che non aggiungono valore. Il
> consolidamento di più ordini in un giro somiglia al livellamento
> (*heijunka*), ma va detto per intero: **livella il prelievo, non la
> produzione.** Non c'è takt time e non c'è un kanban: l'applicativo non governa
> la linea.

### 7.4 Il conto di produzione (WIP)

La merce prelevata per un ordine **non sparisce dal magazzino**: entra in un'area
di lavorazione e resta contata. Per ogni ordine si sa quanto è entrato, quanto è
tornato indietro e quanto resta fuori.

**Il consumo si dichiara a ordine chiuso, mai prima.** Il residuo di un ordine
in corso è merce ancora sul bancone: chiamarlo consumo scriverebbe un numero che
alle sette di sera è sempre sbagliato.

> *Nota lean — rendere visibile il work in process.* Il WIP che non si vede è
> il WIP che cresce. Qui è una riga di magazzino, non una voce di
> contabilità, e il ciclo completo su ordine reale ha chiuso con **scarto
> zero**: entrato 25 kg, tornato 10, consumato 15, residuo 0.

### 7.5 Lo schedulatore delle attività

- Un compito **lancia il lavoro**, non lo affianca: l'avvio apre la maschera già
  compilata.
- **Un compito si chiude solo perché un movimento è stato confermato.**
  «Completa» a mano non esiste per nessun tipo.
- I parziali lasciano il residuo; il richiesto non cambia mai.
- Da uno stato chiuso non esce nessuna transizione, e **un annullamento pretende
  il motivo**.

> *Nota lean — il gesto è la prova, non la spunta.* Una casella che si spunta a
> mano misura chi la spunta. Un movimento confermato misura il lavoro.

### 7.6 Conformità, sicurezza alimentare, tracciabilità GMP

| Funzione | Come |
|:---|:---|
| Allergeni | I 14 dell'Allegato II del Reg. UE 1169/2011, non modificabili; le voci aziendali si aggiungono accanto |
| Temperature | `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C, con controllo per zona e scavalco per cella |
| Merci pericolose | Ammesse solo dove dichiarato, e merce pulita fuori dall'area dedicata |
| Rotazione | FEFO — prima scade, prima esce |
| Firma di ogni gesto | Ogni movimento porta la sigla dell'operatore identificato, **tenuta a sei anni** (300-500 movimenti al giorno attesi) |
| Documenti | DDT, verbali di smaltimento, cartellini di non conformità, rendiconti di consumo, rapporti di prelievo — ognuno con il proprio riferimento in **codice a barre Code128** in testata |
| Etichette unità di carico | Codice interno oppure **SSCC** con cifra di controllo GS1, se il prefisso aziendale è configurato |

**Il silenzio ha due significati, e il sistema li distingue.** Un articolo senza
attributi non è conforme né difforme: è **ignoto**, si conta a parte e non
produce avvisi. Zero segnalazioni perché va tutto bene e zero segnalazioni
perché non c'è niente da verificare sono due cose diverse, e confonderle è il
modo di guardare una mappa tutta verde che non significa niente.

> *Nota lean — hansei, guardare in faccia i propri numeri.* Quando un operatore
> scavalca una regola, il motivo finisce nel movimento e resta a registro. È
> l'unico dato che fra tre mesi dirà se le regole valgono o se si scavalcano
> tutte allo stesso modo. Per lo stesso motivo i motivi sono **tre bottoni e non
> un campo libero**: con la merce in mano un campo libero si compila con «ok».

### 7.7 Gestione a vista

La mappa disegna il magazzino com'è: le scaffalature di fronte (con «Specchia»
per chi percorre la corsia nell'altro verso), le aree a terra dall'alto, le
unità di carico come caselle dentro il vano, che si trascinano da un'ubicazione
all'altra. Il vano con un problema si accende; il vano confermato durante il
prelievo diventa una banda verde leggibile a un metro e mezzo.

> *Nota lean — 5S e visual management.* Lo stato del magazzino si legge
> guardandolo, non interrogandolo. E i segnali sono **statici**: trenta celle
> che lampeggiano sono un albero di Natale che dopo due giorni non guarda più
> nessuno.

---

## 8. Sicurezza

### 8.1 Controllo d'accesso

| Aspetto | Implementazione |
|:---|:---|
| Autenticazione | PIN a sei cifre per operatore. Il PIN **non esiste a database**: esiste la sua impronta |
| Algoritmo | **scrypt** con sale casuale. Le impronte SHA-256 storiche si riscrivono in scrypt al primo accesso riuscito |
| Sessione | Cookie **`HttpOnly`** (non leggibile da JavaScript), **`SameSite=Strict`**, `Secure` quando c'è TLS |
| Superficie protetta | **Tutte** le rotte dati richiedono una sessione. Verificato in esercizio: una richiesta senza cookie riceve `401` |
| Rotte aperte per necessità | `/api/health` e `/api/app-info` (le interroga l'installer prima che esista un PIN) e la rotta di accesso |
| Elenco operatori pre-accesso | Restituisce **il minimo**: sigla, nome, carica, «ha un PIN». Nessuna data, nessuna nota, **nessuna impronta** |
| Ruoli | Operatore · Team Leader · Admin. Solo l'Admin apre la Configurazione e il reset dei dati, e il reset pretende il suo PIN |
| Chiusura sessione | «Blocca» chiude la sessione anche sul servizio. Le sessioni vivono in memoria: un riavvio le invalida tutte |

### 8.2 Superficie applicativa

- **SQL sempre parametrizzato**, in tutti e due i driver di database.
- **I codici non possono contenere caratteri che spezzino un gestore
  dell'interfaccia**: si rifiutano in scrittura, in un punto solo, invece di
  ripulirli di nascosto — un codice ripulito è un codice diverso da quello che
  il chiamante crede di aver scritto.
- **Il percorso di destinazione dei backup è convalidato**: si rifiutano i
  percorsi di rete, le cartelle di sistema e i percorsi relativi.
- **Intestazioni HTTP**: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
- **Permessi sul filesystem**: l'installer spezza l'ereditarietà su
  `C:\Pathfinder` e riscrive le ACL — controllo pieno a SYSTEM e agli
  Amministratori, lettura ed esecuzione agli altri. Prima, un utente qualunque
  della macchina poteva riscrivere il file del servizio, che al riavvio gira
  come SYSTEM.
- **Nessuna `Content-Security-Policy`, ed è dichiarato**: una CSP seria vieta i
  gestori inline su cui è costruita questa interfaccia, e una permissiva al
  punto da lasciarli passare sarebbe una riga che non protegge e che il prossimo
  lettore crede protegga.

### 8.3 Dati personali e conservazione

| Dato | Trattamento |
|:---|:---|
| Operatori | Nome, cognome, sigla, ruolo, impronta del PIN. Nessun altro dato personale |
| Registro movimenti | Sigla dell'operatore su ogni movimento — **è la firma GMP**, conservata sei anni |
| Telemetria | **Nessuna.** Nessuna richiesta verso l'esterno, da nessuna parte del codice |
| Cancellazione | **Nessuna cancellazione di record, punto.** Non esiste una funzione che elimini un movimento. Per portare via i dati c'è l'export, che non toglie niente da dove sta |
| File di database | **Non entrano nel repository di codice**, perché portano le impronte dei PIN accanto ai nomi di persone reali |

---

## 9. Backup, continuità, monitoraggio

| Voce | Come |
|:---|:---|
| Backup automatico | Attività pianificata, **ogni giorno alle 20:00** |
| Formato | `pg_dump` in formato custom, **riletto con `pg_restore --list` prima di essere dichiarato buono**. Se la rilettura fallisce il file si cancella, perché un file lasciato lì si fa contare da chi guarda la cartella |
| Destinazione | `C:\Pathfinder\backup\`. Il percorso è configurabile ed è convalidato |
| Rotazione | **Spenta di serie**: nessuna cancellazione automatica. Si accende passando i giorni di conservazione allo script |
| Registro | Ogni corsa scrive una riga con esito e dimensione in `backup.log` |
| Backup a richiesta | Una chiamata al servizio, usata anche dall'installer **prima di ogni aggiornamento** |
| Diagnosi | `/api/app-info` risponde versione, impronta, byte e cartella servita; **quando qualcosa non va porta anche il codice di errore reale e l'account con cui gira il processo** |
| Stato del database | `/api/health` risponde collezioni, conteggi riga per riga e revisione |

> **⚠ ATTENZIONE — continuità operativa.** Il database sta **sulla stessa
> macchina del servizio**: il magazzino si ferma quando si ferma quel PC. È lo
> stesso livello di continuità che si aveva con i dati in un file, ed è una
> decisione presa consapevolmente. Portarlo su un server dedicato o su
> un'istanza gestita è una decisione di continuità operativa, non
> un'architettura da riscrivere: il servizio parla già con un PostgreSQL
> remoto cambiando una stringa di connessione.

---

## 10. Limiti noti e stato di hardening

Sono scritti qui perché un IT li trova comunque, e trovarli scritti vale più che
trovarli da solo. Ognuno ha la mitigazione di oggi e che cosa serve per chiuderlo.

| # | Limite | Rischio | Mitigazione oggi | Per chiuderlo |
|:--|:---|:---|:---|:---|
| 1 | **Traffico in chiaro (HTTP)** | Chi ascolta la rete interna può leggere il cookie di sessione e riusarlo finché il servizio non si riavvia | Rete interna; porta esposta solo ai profili Dominio e Privato | **Nome DNS interno + certificato dalla CA aziendale.** Il codice è pronto: due variabili e HTTPS si accende. *Serve una decisione dell'IT* |
| 2 | **Permessi per ruolo verificati nel client** | Un utente **già autenticato** che chiami a mano una rotta di comando non trova chi glielo impedisca | Senza sessione non si entra; ogni movimento resta firmato a registro; gli utenti sono dipendenti identificati | Dichiarare le rotte di comando e verificare il ruolo **sul servizio**. Il token porta già il ruolo: il lavoro è nelle rotte, non nel modello |
| 3 | **Libreria Excel `xlsx` 0.18.5 con due vulnerabilità note** (prototype pollution GHSA-4r6h-8v6p-xvw6 e ReDoS, gravità alta) | Il vettore è un file Excel caricato da un operatore | I file trattati sono ordini di produzione e anagrafiche **generati da SAGE X3 all'interno dell'azienda**, non allegati esterni. Le dipendenze del servizio sono a **zero** vulnerabilità | Passare alla build corretta pubblicata da SheetJS (non disponibile su npm) e **ricollaudare tutto ciò che tocca Excel**, oppure accettare formalmente il rischio motivandolo |
| 4 | **Database e servizio sulla stessa macchina** | Nessuna continuità se la postazione si ferma | Backup serale verificato; ripartenza automatica all'accensione | Istanza PostgreSQL su server dedicato. Nessuna riscrittura di codice |
| 5 | **Nessuna alta disponibilità, nessun bilanciamento** | Fermo macchina = fermo magazzino | Il fermo è di minuti, non di ore: si riavvia l'attività pianificata | Decisione di continuità operativa, oggi non presa |
| 6 | **Nessuna integrazione con Active Directory / SSO** | Le credenziali di magazzino sono separate da quelle di dominio | Scelta dichiarata: si resta al PIN, perché in corsia si lavora coi guanti e un login di dominio non si digita | Rivedibile, ma comporta una gestione identità che oggi non c'è |
| 7 | **Rotazione dei backup spenta di serie** | La cartella cresce di ~0,5 MB al giorno | Nessuna cancellazione automatica **è la regola del progetto**, non una svista | Si accende passando i giorni di conservazione, quando l'IT decide la politica |
| 8 | **L'aggiornamento comporta un fermo di alcuni secondi** | I terminali vedono un errore momentaneo | Si aggiorna a fine turno | Non eliminabile: il processo Node legge il codice all'avvio |
| 9 | **Niente lavoro offline** | Se il servizio non risponde, l'applicativo si ferma e lo dichiara a schermo intero | **È una scelta**, non una mancanza: nessuna coda locale da risincronizzare, quindi nessun conflitto e nessun saldo che diverge fra due terminali | Non si intende cambiarla |

---

## 11. Qualità del software e verificabilità

| Voce | Valore, misurato il 28/08/2026 |
|:---|:---|
| Collaudi automatici sull'applicativo | **1.222 prove in 42 file**, tutte verdi, in 3,6 secondi |
| Collaudi sul servizio dati | **127 prove**, eseguite **contro tutti e due i motori di database** |
| Collaudi sugli script di installazione | **31 prove**, che esercitano installazione, ritorno indietro e installer in modalità prova |
| Collaudi sul cambio di schema | **8 prove**: una versione vecchia rilegge il database di una nuova |
| Tipizzazione | TypeScript in modalità `strict` su tutto il sorgente, zero errori |
| Sorgente | ~73 file TypeScript, nessun JavaScript nel client |
| Integrità del rilascio | Manifesto con impronta SHA-256 file per file, verificata dall'installer |
| Riproducibilità | La build è **riproducibile bit per bit** dallo stesso commit |
| Prestazioni interfaccia | Primo caricamento **251 kB**, ricarica **300 byte** (assets immutabili, indice `no-cache`); la libreria Excel si carica **solo a import o export** |
| Prestazioni motore | Proposta di stoccaggio su 330 ubicazioni: **2,1 – 2,8 ms** |

**Come si verifica una versione prima di installarla.** Ogni rilascio viene
esercitato su un **banco**: una copia a caldo del database vero, su una porta
sua, con cartelle sue. La regola è dichiarata e non si scavalca: *tsc dice se il
codice è coerente, i collaudi dicono se le parti fanno quel che promettono, e
nessuno dei due dice se l'applicativo funziona.*

---

## 12. Che cosa si chiede al team IT

- [ ] **Una postazione Windows** raggiungibile dai terminali, con Node.js LTS e PostgreSQL 17 installati
- [ ] **Accesso al registry npm** dalla postazione, limitatamente alla prima installazione
- [ ] **Apertura della porta TCP 4173** in ingresso sui profili Dominio e Privato (la fa l'installer, serve l'autorizzazione)
- [ ] **Privilegi di amministratore locale** per l'installazione e per gli aggiornamenti
- [ ] **Eventuale esclusione antivirus** sulla cartella `C:\Pathfinder\` e sul processo Node, se le policy lo richiedono
- [ ] **Decisione su TLS** (limite 1): nome DNS interno e certificato dalla CA aziendale — il codice è già pronto
- [ ] **Decisione sulla politica di conservazione dei backup** (limite 7) e, se prevista, una destinazione di rete per la copia secondaria
- [ ] **Presa d'atto dei limiti 2 e 3**, con la decisione se chiuderli ora o accettarli formalmente

---

## 13. Glossario minimo

| Termine | Significato in questo documento |
|:---|:---|
| **UOM / UM** | Unità di misura dell'articolo (KG, PZ, LT…). Distinta dal **collo**, che è il contenitore fisico |
| **Collo** | Un sacco, una scatola, un fusto. Colli dello stesso articolo possono avere misure diverse |
| **UDC** | Unità di carico: un pallet, con la sua etichetta e le righe che ci stanno sopra |
| **Ubicazione / vano** | La posizione fisica: magazzino, corsia, campata, livello |
| **Lotto** | La partita di produzione. Insieme all'articolo forma la chiave della giacenza |
| **ODP** | Ordine di produzione, importato da SAGE X3 in formato Excel |
| **WIP** | *Work in process*: merce uscita dallo scaffale e non ancora consumata |
| **FEFO** | *First expired, first out*: esce per prima la merce che scade prima |
| **GMP** | *Good Manufacturing Practice*: le regole di buona fabbricazione alimentare |
| **Jidoka / poka-yoke / genchi genbutsu** | Principi del Toyota Production System: rendere visibile l'anomalia · rendere impossibile l'errore · decidere andando a vedere sul posto |

---

## 14. Riferimenti

| Documento | Dove |
|:---|:---|
| Documentazione tecnica completa e stato del progetto | `MAPPER\INDEX.md` — documento unico di progetto |
| Installazione da zero e diagnosi di una macchina | `MAPPER\README.md` |
| Istruzioni per chi installa | `LEGGIMI.txt` dentro il pacchetto di consegna |
| Valutazione del passaggio a cloud | `server\azure\LEGGIMI.md` |

---

*© Dietopack S.r.l. – Naturacare Group | Documento redatto da Andrea Sacchetti | Uso interno riservato*
