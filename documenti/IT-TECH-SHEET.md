# PATHFINDER — SCHEDA TECNICA PER IL TEAM IT
# PATHFINDER — TECHNICAL DATA SHEET FOR THE IT TEAM

**Codice / Code:** REP-IT-001  |  **Revisione / Revision:** **02**  |  **Data / Date:** 02/09/2026

**Redatto da / Prepared by:** Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

**Oggetto.** Applicativo web per la gestione del magazzino alimentare in regime
GMP. Richiesta di autorizzazione all'installazione su una postazione di rete
aziendale.

**Subject.** Web application for managing a food-grade warehouse operating under
GMP. Request for authorisation to install on a company network workstation.

**Documento bilingue.** Le due parti hanno la stessa numerazione di capitolo e
lo stesso contenuto. In caso di discordanza **prevale la parte italiana**, che è
la lingua di redazione.

**Bilingual document.** Both parts carry the same chapter numbering and the same
content. In case of discrepancy **the Italian part prevails**, being the
language of record.

---

## Storico delle revisioni / Revision history

| Rev. | Data | Modifiche | Changes |
|:--|:--|:---|:---|
| 01 | 28/08/2026 | Prima emissione | First issue |
| **02** | **02/09/2026** | Documento reso **bilingue**. Aggiornato dalla versione 2.12 alla **2.17**. **Il limite 2 è chiuso**: i permessi per ruolo sono imposti dal servizio (2.13) e l'ultimo Admin non si può togliere da solo (2.16). **Tolta la dichiarazione di conservazione a sei anni**: il registro non ha una scadenza dentro l'applicativo (2.17), e il periodo lo stabilisce la procedura aziendale — cap. 8.3. Aggiunte la via di fuga dell'Admin, la migrazione dalla 1.4, due limiti nuovi (10, 11) e i numeri di collaudo rimisurati. Corretto il riferimento a `server\azure`, che non esiste dal 26/08 | Document made **bilingual**. Updated from release 2.12 to **2.17**. **Limitation 2 is closed**: role permissions are enforced by the service (2.13) and the last Admin cannot remove themselves (2.16). **The six-year retention statement is removed**: the register has no expiry inside the application (2.17), and the period is set by company procedure — §8.3. Added the Admin recovery route, the 1.4 migration, two new limitations (10, 11) and re-measured test figures. Corrected the reference to `server\azure`, which has not existed since 26/08 |

---
---

# PARTE I — ITALIANO

---

## 1. Scopo del documento

Questo documento descrive Pathfinder al team IT che deve **autorizzarne
l'installazione**: che cosa installa, dove scrive, quali porte apre, con quale
account gira, quali dati tratta, che cosa **non** fa, e quali sono i limiti noti
oggi.

È scritto per rispondere alle domande che l'IT fa per prime, e le risposte sono
**misurate sull'installazione di prova**, non dedotte. Dove un punto è aperto, è
scritto che è aperto (capitolo 10).

## 2. Campo di applicazione

Si applica all'installazione di Pathfinder su una postazione Windows della rete
aziendale, con più terminali di magazzino che vi si collegano da browser. Non si
applica a installazioni su cloud pubblico, che oggi non sono previste.

**Le macchine sono due, e questo documento parla della seconda.** Lo sviluppo
avviene su una postazione dedicata, dove le versioni si costruiscono e si
provano. Il magazzino oggi in esercizio gira ancora la versione **1.4**, su
un'altra macchina; il passaggio alla versione corrente è trattato al capitolo 6.5.

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
| Quanto pesa | Applicativo: 1,9 MB in 4 file. Database di prova oggi: **22,5 MB** con 11.197 articoli |
| Che privilegi servono per installare | Amministratore locale, una volta per installazione |
| Come si aggiorna | Si rilancia il pacchetto della versione nuova. Fermo servizio: pochi secondi |
| Come si torna indietro | Si reinstalla il pacchetto della versione precedente. Il database non viene mai toccato |
| Chi può accedere | Solo chi ha un PIN di operatore. Senza sessione le rotte dati rispondono **401** |
| Dati personali trattati | Nome, cognome, sigla e impronta del PIN degli operatori. Nient'altro |
| Per quanto si conservano i dati | **Il software non cancella nulla, mai.** Non c'è una scadenza nel programma: il periodo lo stabilisce la procedura aziendale — cap. 8.3 |

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
nativo richiede un wrapper (tipicamente NSSM), che è un eseguibile non firmato
che l'antivirus blocca. L'attività pianificata è nativa, si vede in Utilità di
pianificazione, si ferma e si riavvia con gli strumenti standard, e non aggiunge
nulla al parco software.

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
| **Disinstallazione** | `.\installa.ps1 -Disinstalla` toglie servizio, attività, variabili e cartelle, **dopo aver salvato**. Con `-AncheIlDatabase` toglie anche database e ruolo. **PostgreSQL non viene mai disinstallato**, e installare e disinstallare non si fanno nella stessa corsa |

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
- **Non chiede a nessuno di digitare una password**: quella del ruolo di database
  la **genera lui**, la mostra una volta e poi vive solo in una variabile di
  macchina.

### 6.3 Configurazione dopo l'installazione

Per lavorare **non serve compilare niente**. Il magazzino si disegna dalla
configurazione delle zone e le ubicazioni vengono **generate** da corsie, campate
e livelli: non c'è un'anagrafica di duemila vani da caricare a mano. Le regole di
stoccaggio sono un dato facoltativo: finché non ci sono, il motore lavora sui
soli vincoli.

Su una macchina appena installata nessuno ha un PIN, e senza una via d'ingresso
il primo non si potrebbe creare: il servizio allora accetta il primo accesso e lo
**dichiara a lettere chiare all'avvio**. Appena il primo PIN esiste, quella
finestra si chiude da sola e non si riapre.

> **⚠ Su una macchina nuova il primo Admin è il primo gesto**, prima di
> qualunque dato: finché non esiste, quella finestra resta aperta a chiunque sia
> sulla rete.

### 6.4 Ripristino

| Gesto | Effetto |
|:---|:---|
| **Tornare a una versione precedente** | Si reinstalla il pacchetto di quella versione. È l'unico gesto che riporta indietro **anche il servizio** |
| **Il database** | **Non si tocca mai.** Una versione vecchia rilegge il database di una nuova; ci sono 8 prove automatiche che lo verificano a ogni rilascio |
| **Ripristino dati** | Dal `.dump` prodotto dal backup serale |

> **💡 La build è riproducibile bit per bit.** Ricostruendo lo stesso commit a
> giorni di distanza esce la stessa impronta SHA-256: un pacchetto perso non è
> perso, e l'impronta è una prova di *quale codice* c'è dentro, non solo di quali
> byte.

### 6.5 Il passaggio dalla versione in esercizio (1.4)

Il magazzino gira oggi la **1.4**: un unico file HTML, con i dati nel browser
(IndexedDB). Il formato di esportazione di quella versione è lo stesso che la
versione corrente sa leggere, quindi il passaggio è **un export e un import**,
non una riscrittura.

Il percorso è provato da un banco automatico che parte da un **database vuoto**,
importa un export vero dell'epoca e conta: ogni collezione arriva col numero di
righe che aveva, il registro movimenti arriva intero, la merce si ritrova vano
per vano, e sul database importato il primo Admin si crea ed entra.

> **⚠ Due controlli da fare sull'export vero, prima di importare.** I codici si
> scrivono in maiuscolo, e il servizio li normalizza in scrittura. Quindi:
> **(a)** vanno contate le righe che cambiano nome — la loro etichetta stampata
> prima non corrisponde più alla chiave a database, e la ristampa diventa un
> passo della migrazione; **(b)** va verificato che due righe non finiscano
> sulla **stessa** chiave nello stesso vano, perché in quel caso una coprirebbe
> l'altra. Il banco fa già tutti e due i conti: basta puntarlo sul file vero.

---

## 7. Le caratteristiche funzionali

Il capitolo descrive che cosa fa l'applicativo e **perché è fatto così**. Le note
in corsivo richiamano il principio del Toyota Production System a cui la scelta
corrisponde: il progetto non nasce da un manuale lean, ma le stesse domande hanno
prodotto le stesse risposte, e dove il parallelo **non** regge è scritto.

### 7.1 Il controllo delle ubicazioni — il problema da cui il progetto nasce

**Prima:** la merce si posava dove capitava, e dove fosse finita lo sapeva chi ce
l'aveva messa. Lo stesso lotto poteva stare in due vani, contato due volte, e la
rotazione a scadenza lo ordinava come due partite diverse.

**Adesso:**

- **Ogni movimento porta l'ubicazione**, e le ubicazioni non si scrivono a mano:
  si generano dalla geometria della zona (corsie, campate, livelli, posizioni).
- **Due regole di base, che non sono un dato e non si cancellano.** La prima — lo
  stesso articolo sulla stessa unità di carico — è un consiglio forte, e si
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
> **Dove il parallelo non regge, ed è una scelta:** in Toyota l'anomalia **ferma
> la linea**. Qui no. Chi ha la merce in mano e il muletto acceso non discute con
> una maschera che dice di no: o trova il modo di aggirarla — e allora il dato
> diventa peggiore di prima, perché nessuno sa più dove sia finita la merce — o
> si ferma, e si ferma il magazzino. Una banchina bloccata costa più di una riga
> fuori posto, e una riga fuori posto si vede e si corregge: **una merce posata
> di nascosto no.** Dalla versione 2.9 il sistema **segnala e assiste, non
> vieta** — con l'unica eccezione della regola che produrrebbe un saldo doppio.

### 7.2 Il controllo delle unità di misura in giacenza

È la caratteristica che distingue Pathfinder da una gestione a soli colli, ed è
il motivo per cui il progetto ha potuto partire senza un progetto di data-entry a
monte.

**Il problema, misurato sull'anagrafica vera di 11.197 articoli:** solo **2**
articoli dichiaravano insieme l'unità di misura e la quantità per collo. Un
magazzino alimentare riceve lo stesso codice in sacchi da 25 kg e la volta dopo
da 5: «sette colli» non è una quantità, e un export che dice sette colli racconta
un altro magazzino.

**La scelta: il dato nasce nel gesto, non in un progetto separato.**

| Momento operativo | Dato che entra | Perché lì |
|:---|:---|:---|
| Posizionamento a scaffale | La suddivisione dei colli, dichiarata | La dichiara chi ha i sacchi davanti, non chi guarda una tabella |
| Primo posizionamento di un lotto | La confezione si **congela sul lotto** | È un fatto del lotto e vale per tutti i suoi colli, ovunque stiano |
| Reso, inventario, conta | La quantità contenuta in un collo intero | Chi conta dichiara **com'è fatto lo scaffale**, e la differenza la traduce il sistema |
| Prelievo | Da quale collo esce la merce (`{misura, quantità}`) | Una quantità da sola non dice da quale collo esce: il saldo tornerebbe e i colli sarebbero sbagliati |

**Il risultato.** La giacenza esiste in **colli e in unità** insieme. Gli export
danno una riga per collo — contare le righe dà i colli, sommare la colonna dà le
unità — e un riepilogo che vede unità diverse **non somma: dichiara MISTA**, che è
la risposta onesta a «300 KG più 40 PZ».

**Come la copertura è cresciuta senza toccare l'anagrafica:** 7.077 articoli sono
rientrati traducendo la codifica `NR` di SAGE X3 (che non era un dato mancante,
era una codifica non tradotta); 4.036 sono rientrati sbloccando una maschera che
si nascondeva da sola; **82 restano fuori e lo dichiarano**, perché la loro unità
nomina un contenitore e non una misura.

> *Nota lean — genchi genbutsu, «vai a vedere».* Il numero non si indovina da una
> scrivania: lo dichiara chi ha il collo in mano, nel momento in cui ce l'ha. La
> stessa logica governa l'inventario, dove **il numero di sistema non si mostra
> prima di aver contato**: un foglio che porta già la risposta non è una verifica,
> è un suggerimento.

> *Nota lean — non riscrivere la storia.* Le unità che un movimento non porta si
> **derivano alla lettura**, mai riscrivendo il movimento: il registro è storia, e
> la storia si rilegge con quello che nel frattempo si è saputo.

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
  stesso codice a terra, e la quarta la digitava senza guardare: *una verifica che
  si ripete quando non c'è niente da riverificare è una verifica che si smette di
  fare.*
- **Pausa dichiarata**, con i tempi scorporati dal report: su quattro ore
  d'orologio con un'ora di fermo, il tempo medio per riga passa da 24 a 18 minuti
  — ed è il numero vero.
- **Rettifica di una tappa già prelevata**, che non riscrive il passato ma scrive
  un movimento di rientro.

> *Nota lean — muda di movimento e standard work.* La serpentina e il vano
> scansionato una volta tolgono passi e gesti che non aggiungono valore. Il
> consolidamento di più ordini in un giro somiglia al livellamento (*heijunka*),
> ma va detto per intero: **livella il prelievo, non la produzione.** Non c'è takt
> time e non c'è un kanban: l'applicativo non governa la linea.

### 7.4 Il conto di produzione (WIP)

La merce prelevata per un ordine **non sparisce dal magazzino**: entra in un'area
di lavorazione e resta contata. Per ogni ordine si sa quanto è entrato, quanto è
tornato indietro e quanto resta fuori.

**Il consumo si dichiara a ordine chiuso, mai prima.** Il residuo di un ordine in
corso è merce ancora sul bancone: chiamarlo consumo scriverebbe un numero che alle
sette di sera è sempre sbagliato.

> *Nota lean — rendere visibile il work in process.* Il WIP che non si vede è il
> WIP che cresce. Qui è una riga di magazzino, non una voce di contabilità, e il
> ciclo completo su ordine reale ha chiuso con **scarto zero**: entrato 25 kg,
> tornato 10, consumato 15, residuo 0.

### 7.5 Lo schedulatore delle attività

- Un compito **lancia il lavoro**, non lo affianca: l'avvio apre la maschera già
  compilata.
- **Un compito si chiude solo perché un movimento è stato confermato.**
  «Completa» a mano non esiste per nessun tipo.
- I parziali lasciano il residuo; il richiesto non cambia mai. **Il trasferimento
  fa eccezione e si chiude alla conferma del movimento**, per decisione operativa.
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
| Firma di ogni gesto | Ogni movimento porta la sigla dell'operatore identificato, e **non si cancella mai** (300-500 movimenti al giorno attesi). Per quanto si conserva: cap. 8.3 |
| Documenti | DDT, verbali di smaltimento, cartellini di non conformità, rendiconti di consumo, rapporti di prelievo — ognuno con il proprio riferimento in **codice a barre Code128** in testata |
| Etichette unità di carico | Codice interno oppure **SSCC** con cifra di controllo GS1, se il prefisso aziendale è configurato |

**Il silenzio ha due significati, e il sistema li distingue.** Un articolo senza
attributi non è conforme né difforme: è **ignoto**, si conta a parte e non produce
avvisi. Zero segnalazioni perché va tutto bene e zero segnalazioni perché non c'è
niente da verificare sono due cose diverse, e confonderle è il modo di guardare
una mappa tutta verde che non significa niente.

> *Nota lean — hansei, guardare in faccia i propri numeri.* Quando un operatore
> scavalca una regola, il motivo finisce nel movimento e resta a registro. È
> l'unico dato che fra tre mesi dirà se le regole valgono o se si scavalcano tutte
> allo stesso modo. Per lo stesso motivo i motivi sono **tre bottoni e non un
> campo libero**: con la merce in mano un campo libero si compila con «ok».

### 7.7 Gestione a vista

La mappa disegna il magazzino com'è: le scaffalature di fronte (con «Specchia»
per chi percorre la corsia nell'altro verso), le aree a terra dall'alto, le unità
di carico come caselle dentro il vano, che si trascinano da un'ubicazione
all'altra. Il vano con un problema si accende; il vano confermato durante il
prelievo diventa una banda verde leggibile a un metro e mezzo.

> *Nota lean — 5S e visual management.* Lo stato del magazzino si legge
> guardandolo, non interrogandolo. E i segnali sono **statici**: trenta celle che
> lampeggiano sono un albero di Natale che dopo due giorni non guarda più nessuno.

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
| Freno sui tentativi | Cinque tentativi sbagliati e un minuto di attesa, per PIN e per codice di ripristino |

**I permessi per ruolo sono imposti dal SERVIZIO, non dal client** (dalla versione
2.13). Prima vivevano nel browser: una sessione qualunque e una riga di `curl`
bastavano a scriversi la carica di Admin addosso. Adesso il guardiano non controlla
solo l'anagrafica degli operatori, ma anche la transazione che la tocca di
striscio, lo svuotamento che la nomina in un elenco e la scrittura a lotti — una
sola di queste lasciata aperta e la regola non varrebbe.

**L'ultimo Admin attivo non si può retrocedere, disattivare o cancellare** (dalla
2.16), e lo impone il servizio simulando la scrittura su una copia dell'anagrafica
prima di ammetterla. Senza Admin la Configurazione non si apre e il codice di
ripristino non vale: si resterebbe con la sola chiave di macchina. **Il reset
completo dei dati resta permesso**, e deve: svuota tutto, nessuno resta con un PIN,
e la finestra del primo avvio si riapre da sé.

### 8.2 Il PIN smarrito — le tre vie d'uscita

Il PIN **non è recuperabile per costruzione**: sul disco resta la sua impronta.

1. **Un grado più alto lo rinnova dall'applicativo**, digitando il **proprio** PIN.
   L'Operatore lo rinnova un Team Leader, il Team Leader un Admin, l'Admin un altro
   Admin. La gerarchia la verifica il servizio.
2. **Il codice di ripristino**, quando il PIN perso è quello dell'unico Admin.
   Venti caratteri, si consuma nell'uso, e al suo posto ne nasce subito un altro
   mostrato **una volta sola**. Vale **solo per gli Admin**, perché solo loro non
   hanno nessuno sopra.
3. **La chiave di macchina** (`PATHFINDER_TOKEN`), che apre le rotte senza
   sessione. È **l'uscita di servizio, non una procedura**: la usa chi ha già
   accesso a quella macchina.

La causa si toglie nominando **un secondo Team Leader** — un minuto in
Configurazione → Operatori — e stampando un codice di ripristino.

### 8.3 Dati personali e conservazione

| Dato | Trattamento |
|:---|:---|
| Operatori | Nome, cognome, sigla, ruolo, impronta del PIN. Nessun altro dato personale |
| Registro movimenti | Sigla dell'operatore su ogni movimento — **è la firma GMP** |
| Telemetria | **Nessuna.** Nessuna richiesta verso l'esterno, da nessuna parte del codice |
| Cancellazione | **Nessuna cancellazione di record, punto.** Non esiste una funzione che elimini un movimento, e non ne esiste una che li elimini col tempo. Per portare via i dati c'è l'export, che non toglie niente da dove sta |
| File di database ed export | **Non entrano nel repository di codice**, perché portano le impronte dei PIN accanto ai nomi di persone reali. Una prova automatica fallisce se un file tracciato ne contiene una |

> **⚠ PER QUANTO SI CONSERVANO I DATI — cambiato in rev02.** Fino alla versione
> 2.16 l'applicativo dichiarava a video una conservazione di **sei anni**. Quel
> numero **non corrispondeva a nessuna norma e non cancellava niente**: la funzione
> di purga era già stata tolta nella 2.1, quindi il sistema conservava tutto e
> l'etichetta si limitava a sottodichiararlo. **Dalla 2.17 la costante non esiste
> più.**
>
> Il quadro di riferimento, per la decisione che spetta alla funzione QA/RA:
>
> | Regime | Termine | Su che cosa |
> |:---|:---|:---|
> | GMP medicinali — EudraLex Vol. 4, cap. 4 | scadenza del lotto **+ 1 anno**, oppure **5 anni** dalla certificazione del QP: il maggiore dei due | documentazione di lotto |
> | Legge alimentare — Reg. (CE) 178/2002, art. 18 | **nessun minimo di legge.** La guida della Commissione raccomanda **5 anni**; shelf-life oltre 5 anni → *shelf-life + 6 mesi*; deperibili con TMC sotto i 3 mesi → **6 mesi** | registrazioni di rintracciabilità |
> | **Art. 2220 Codice Civile** | **10 anni** dall'ultima registrazione | scritture contabili, fatture, lettere — **e i documenti di trasporto**, che Pathfinder emette |
> | GMP Annex 11 | quanto il record che documenta | audit trail dei sistemi computerizzati |
>
> **Il software non impone nessuno di questi termini e non ne impedisce nessuno:**
> non cancella, quindi qualunque periodo la procedura stabilisca è rispettato per
> costruzione. Il periodo, e l'eventuale cancellazione a scadenza, sono una
> **politica di backup e di database**, da definire nella SOP aziendale.

### 8.4 Superficie applicativa

- **SQL sempre parametrizzato**, in tutti e due i driver di database.
- **I codici non possono contenere caratteri che spezzino un gestore
  dell'interfaccia**: si rifiutano in scrittura, in un punto solo, invece di
  ripulirli di nascosto — un codice ripulito è un codice diverso da quello che il
  chiamante crede di aver scritto.
- **Il percorso di destinazione dei backup è convalidato**: si rifiutano i percorsi
  di rete, le cartelle di sistema e i percorsi relativi.
- **Intestazioni HTTP**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`.
- **Permessi sul filesystem**: l'installer spezza l'ereditarietà su `C:\Pathfinder`
  e riscrive le ACL — controllo pieno a SYSTEM e agli Amministratori, lettura ed
  esecuzione agli altri. Prima, un utente qualunque della macchina poteva
  riscrivere il file del servizio, che al riavvio gira come SYSTEM.
- **Nessuna `Content-Security-Policy`, ed è dichiarato**: una CSP seria vieta i
  gestori inline su cui è costruita questa interfaccia, e una permissiva al punto da
  lasciarli passare sarebbe una riga che non protegge e che il prossimo lettore
  crede protegga.

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

> **⚠ ATTENZIONE — continuità operativa.** Il database sta **sulla stessa macchina
> del servizio**: il magazzino si ferma quando si ferma quel PC. È lo stesso livello
> di continuità che si aveva con i dati in un file, ed è una decisione presa
> consapevolmente. Portarlo su un server dedicato o su un'istanza gestita è una
> decisione di continuità operativa, non un'architettura da riscrivere: il servizio
> parla già con un PostgreSQL remoto cambiando una stringa di connessione.

---

## 10. Limiti noti e stato di hardening

Sono scritti qui perché un IT li trova comunque, e trovarli scritti vale più che
trovarli da solo. Ognuno ha la mitigazione di oggi e che cosa serve per chiuderlo.

| # | Limite | Rischio | Mitigazione oggi | Per chiuderlo |
|:--|:---|:---|:---|:---|
| 1 | **Traffico in chiaro (HTTP)** | Chi ascolta la rete interna può leggere il cookie di sessione e riusarlo finché il servizio non si riavvia | Rete interna; porta esposta solo ai profili Dominio e Privato | **Nome DNS interno + certificato dalla CA aziendale.** Il codice è pronto: due variabili e HTTPS si accende. *Serve una decisione dell'IT* |
| ~~2~~ | ~~**Permessi per ruolo verificati nel client**~~ | — | — | **CHIUSO.** La 2.13 ha portato la gerarchia sul servizio, con 32 prove che la esercitano con `fetch` e i cookie veri; la 2.16 ha aggiunto la regola che mancava — l'ultimo Admin non si toglie da solo — portandole a **40**. Un utente autenticato che chiami a mano una rotta di comando adesso trova chi glielo impedisce |
| 3 | **Libreria Excel `xlsx` 0.18.5 con due vulnerabilità note** (prototype pollution GHSA-4r6h-8v6p-xvw6 e ReDoS, gravità alta) | Il vettore è un file Excel caricato da un operatore | I file trattati sono ordini di produzione e anagrafiche **generati da SAGE X3 all'interno dell'azienda**, non allegati esterni. Le dipendenze del servizio sono a **zero** vulnerabilità | **Rischio accettato formalmente il 01/09/2026**, con la motivazione qui accanto. **Si riapre il giorno che un foglio arriva da fuori.** L'alternativa resta la build corretta di SheetJS, che non è su npm e impone di ricollaudare tutto ciò che tocca Excel |
| 4 | **Database e servizio sulla stessa macchina** | Nessuna continuità se la postazione si ferma | Backup serale verificato; ripartenza automatica all'accensione | Istanza PostgreSQL su server dedicato. Nessuna riscrittura di codice |
| 5 | **Nessuna alta disponibilità, nessun bilanciamento** | Fermo macchina = fermo magazzino | Il fermo è di minuti, non di ore: si riavvia l'attività pianificata | Decisione di continuità operativa, oggi non presa |
| 6 | **Nessuna integrazione con Active Directory / SSO** | Le credenziali di magazzino sono separate da quelle di dominio | Scelta dichiarata: si resta al PIN, perché in corsia si lavora coi guanti e un login di dominio non si digita | Rivedibile, ma comporta una gestione identità che oggi non c'è |
| 7 | **Rotazione dei backup spenta di serie** | La cartella cresce di ~0,5 MB al giorno | Nessuna cancellazione automatica **è la regola del progetto**, non una svista | Si accende passando i giorni di conservazione, quando l'IT decide la politica |
| 8 | **L'aggiornamento comporta un fermo di alcuni secondi** | I terminali vedono un errore momentaneo | Si aggiorna a fine turno | Non eliminabile: il processo Node legge il codice all'avvio |
| 9 | **Niente lavoro offline** | Se il servizio non risponde, l'applicativo si ferma e lo dichiara a schermo intero | **È una scelta**, non una mancanza: nessuna coda locale da risincronizzare, quindi nessun conflitto e nessun saldo che diverge fra due terminali | Non si intende cambiarla |
| **10** | **Impronte di PIN nella storia del repository di codice** | Un dump del magazzino con `pin_hash` e `pin_salt` di persone reali è stato tracciato per quattro giorni ad agosto | La storia è stata **riscritta il 01/09** e il file non sta in nessun ramo; il repository è **privato**. I vecchi commit restano però raggiungibili per SHA finché GitHub non fa pulizia | Richiesta a GitHub Support per la pulizia degli oggetti sfollati, e **rinnovo dei PIN** degli operatori coinvolti quando rientrano a database. Le impronte in quel dump erano SHA-256, non scrypt |
| **11** | **Il passaggio dalla 1.4 non è ancora stato provato sui dati veri** | La migrazione è dimostrata su un export archiviato, non su un export prodotto oggi dal magazzino | Un banco automatico di **14 prove** esercita il percorso da database vuoto e verifica che non si perda nulla | Esportare dalla macchina di magazzino e puntarci sopra lo stesso banco, con i due controlli del cap. 6.5 |

---

## 11. Qualità del software e verificabilità

| Voce | Valore, misurato il 02/09/2026 |
|:---|:---|
| Collaudi automatici sull'applicativo | **1.222 prove in 44 file** — 1.221 verdi, 1 dichiarata saltata — in circa 4 secondi |
| Collaudi sul servizio dati | **141 prove**, eseguibili **contro tutti e due i motori di database** |
| Collaudi sugli script di installazione | **43 prove**, che esercitano installazione, disinstallazione, ritorno indietro e installer in modalità prova |
| Collaudi sul cambio di schema | **8 prove**: una versione vecchia rilegge il database di una nuova |
| Collaudi sui permessi per ruolo | **40 prove** contro il servizio vero, con `fetch` e i cookie veri |
| Ciclo completo di magazzino | **47 prove**, dal carico al consumo, su copia del database reale |
| Passaggio dalla versione 1.4 | **14 prove**, da database vuoto a magazzino importato |
| Tipizzazione | TypeScript in modalità `strict` su tutto il sorgente, zero errori su applicativo e servizio |
| Sorgente | **79 file TypeScript**, **nessun JavaScript** nel client |
| Integrità del rilascio | Manifesto con impronta SHA-256 file per file, verificata dall'installer |
| Riproducibilità | La build è **riproducibile bit per bit** dallo stesso commit |
| Prestazioni interfaccia | Primo caricamento **251 kB**, ricarica **300 byte** (assets immutabili, indice `no-cache`); la libreria Excel si carica **solo a import o export** |
| Prestazioni motore | Proposta di stoccaggio su 330 ubicazioni: **2,1 – 2,8 ms** |

**Come si verifica una versione prima di installarla.** Ogni rilascio viene
esercitato su un **banco**: una copia a caldo del database vero, su una porta sua,
con cartelle sue. La regola è dichiarata e non si scavalca: *tsc dice se il codice
è coerente, i collaudi dicono se le parti fanno quel che promettono, e nessuno dei
due dice se l'applicativo funziona.*

**Un difetto grave fermato dal banco ferma la corsa.** Dal 02/09 il banco del ciclo
esce in errore quando alza un difetto di gravità *grave*, e mette da parte il
verbale di quella corsa invece di lasciarlo sovrascrivere dalla successiva.

---

## 12. Che cosa si chiede al team IT

- [ ] **Una postazione Windows** raggiungibile dai terminali, con Node.js LTS e PostgreSQL 17 installati
- [ ] **Accesso al registry npm** dalla postazione, limitatamente alla prima installazione
- [ ] **Apertura della porta TCP 4173** in ingresso sui profili Dominio e Privato (la fa l'installer, serve l'autorizzazione)
- [ ] **Privilegi di amministratore locale** per l'installazione e per gli aggiornamenti
- [ ] **Eventuale esclusione antivirus** sulla cartella `C:\Pathfinder\` e sul processo Node, se le policy lo richiedono
- [ ] **Decisione su TLS** (limite 1): nome DNS interno e certificato dalla CA aziendale — il codice è già pronto
- [ ] **Decisione sulla politica di conservazione dei dati** (cap. 8.3): il software non cancella nulla, il periodo lo stabilisce la procedura
- [ ] **Decisione sulla politica di rotazione dei backup** (limite 7) e, se prevista, una destinazione di rete per la copia secondaria
- [ ] **Presa d'atto del limite 3** (rischio accettato) e **del limite 10**, con la richiesta a GitHub Support
- [ ] **Finestra per il passaggio dalla 1.4** (limite 11), con un export prodotto dalla macchina di magazzino

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
| Documentazione tecnica completa e stato del progetto | `MAPPER\INDEX.md` — documento unico di progetto, in italiano |
| Installazione da zero e diagnosi di una macchina | `MAPPER\README.md` — in inglese; l'originale italiano è `README.it.md` |
| Come è fatto il servizio dati | `MAPPER\server\README.md` |
| Il driver PostgreSQL e la migrazione | `MAPPER\server\migrazione\README.md` |
| Una riga per versione | `MAPPER\CHANGELOG.md` |
| Licenza | `MAPPER\LICENSE` |
| Istruzioni per chi installa | `LEGGIMI.txt` dentro il pacchetto di consegna, in italiano |

---
---

# PART II — ENGLISH

---

## 1. Purpose

This document describes Pathfinder to the IT team that has to **authorise its
installation**: what it installs, where it writes, which ports it opens, under
which account it runs, what data it handles, what it does **not** do, and what
its known limitations are today.

It is written to answer the questions IT asks first, and the answers are
**measured on the trial installation**, not inferred. Where a point is open, it
says so (section 10).

## 2. Scope

It applies to installing Pathfinder on a Windows workstation on the company
network, with several warehouse terminals connecting to it from a browser. It
does not apply to public-cloud installations, which are not currently envisaged.

**There are two machines, and this document is about the second one.**
Development happens on a dedicated workstation where releases are built and
tested. The warehouse currently in operation still runs release **1.4**, on a
different machine; the move to the current release is covered in §6.5.

---

## 3. Quick answers

| Question | Answer |
|:---|:---|
| What it is, technically | A Node + Express service on a Windows machine, serving a web page and talking to a local PostgreSQL database |
| Where the data lives | **On that machine only**: PostgreSQL on `127.0.0.1:5432`, backups in `C:\Pathfinder\backup\` |
| Does anything leave the company | **No.** No telemetry, no outbound calls, no CDN, no third-party service. The code does not contain a single remote address |
| Which port it opens | One: **TCP 4173** inbound, *Domain* and *Private* profiles |
| Under which account it runs | `SYSTEM`, from a scheduled task started at boot |
| Does it need internet | **Only on first installation**, to fetch three Node dependencies from the npm registry. Never again afterwards |
| What it installs on clients | **Nothing.** Terminals open an address in a browser |
| How big it is | Application: 1.9 MB in 4 files. Trial database today: **22.5 MB** with 11,197 articles |
| Privileges needed to install | Local administrator, once per installation |
| How it is upgraded | Re-run the new release's package. Service downtime: a few seconds |
| How to roll back | Re-install the previous release's package. The database is never touched |
| Who can access it | Only holders of an operator PIN. Without a session the data routes answer **401** |
| Personal data handled | Operators' first name, surname, initials and PIN hash. Nothing else |
| How long data is kept | **The software never deletes anything.** There is no expiry in the program: the period is set by company procedure — §8.3 |

---

## 4. Architecture

```
   Warehouse terminals             Server workstation (Windows)
   ─────────────────────           ───────────────────────────────────
   MC9400 / tablet / PC            ┌─────────────────────────────────┐
   browser, nothing                │ Scheduled task (SYSTEM)         │
   installed locally               │  └─ node pathfinder-server.js   │
            │                      │       Express — port 4173       │
            │   HTTP / LAN         │       cookie session            │
            └─────────────────────►│       SSE for live updates      │
                                   │                │                │
                                   │                ▼                │
                                   │  PostgreSQL 17 — 127.0.0.1:5432 │
                                   │  database `pathfinder`          │
                                   │                                 │
                                   │ Scheduled task — 20:00          │
                                   │  └─ backup-serale.ps1 → .dump   │
                                   └─────────────────────────────────┘
```

| Layer | Technology | Notes |
|:---|:---|:---|
| Interface | TypeScript, no framework, CSS with Tailwind | A single bundle, 4 files, loaded by the browser |
| Service | Node.js ≥ 20, Express 4 | One process, no native Windows service |
| Persistence | PostgreSQL 17 (default) or SQLite | Chosen by a machine variable; the same code speaks both |
| Live updates | Server-Sent Events | One terminal writes, the others see it without reloading |
| Documents | Generated in-page and printed from the browser | Delivery notes, disposal records, non-conformity tags, consumption statements, picking reports |

**Why a scheduled task and not a native Windows service.** A native service needs
a wrapper (typically NSSM), which is an unsigned executable that antivirus
blocks. A scheduled task is native, visible in Task Scheduler, stopped and
restarted with standard tools, and adds nothing to the software estate.

**One database, several terminals, and the server is the referee.** Concurrency
is not left to the discipline of whoever writes: every composed operation runs
inside a service-side transaction.

---

## 5. Requirements and prerequisites

### 5.1 Workstation hosting the service

| Item | Requirement |
|:---|:---|
| Operating system | Windows 10/11 or Windows Server, 64-bit |
| Runtime | **Node.js LTS ≥ 20**, installed beforehand. The installer checks and stops if it is missing |
| Database | **PostgreSQL 17**, installed beforehand. The installer checks engine, service, port and the `pg_dump` / `pg_restore` binaries, and **if they are missing it says where to get them and stops without touching anything** |
| Disk | ~500 MB for application, service and dependencies; plus backup space (~0.5 MB per backup, one a day) |
| Memory | The Node process stays under 200 MB. Real sizing is dictated by PostgreSQL |
| Network | An IP address reachable by the terminals; port 4173 inbound |
| Internet access | **Only on first installation**, for `npm install` of three packages (`express`, `pg`, `better-sqlite3`). Dependencies do not travel inside the package |
| Privileges | Local administrator, required on every installation (needed to stop the scheduled task) |

> **⚠ NOTE:** the two prerequisites — Node and PostgreSQL — are **a declared
> choice, not an oversight**. On a warehouse PC, an installer that downloads and
> runs a database engine is the antivirus blocking it, IT asking why, and nobody
> knowing any more why the warehouse has stopped. Pathfinder checks, states what
> is missing, and stops.

### 5.2 Terminals

| Item | Requirement |
|:---|:---|
| Software | An up-to-date browser (Chrome, Edge, Firefox). **No installation** |
| Screen | The interface is tuned for the Zebra MC9400 terminal (4.3", 800×480, between 400 and 533 CSS px) and scales up to desktop |
| Input | Keyboard-emulation barcode reader. No dedicated driver |
| Network | HTTP access to port 4173 on the server workstation |

---

## 6. Installation, upgrade, restore — the project is plug and play

The delivery package is a folder you copy onto a USB stick and install with a
**double click**, typing nothing and remembering no commands.

```
Pathfinder <release>\
  Installa Pathfinder.bat     ← double click, ENTER, done
  installa.ps1                the engine
  LEGGIMI.txt
  app\                        index, assets, manifest with the fingerprints
  servizio\                   the data service, its scripts, the migration
```

### 6.1 What the installer does, and in what order

**The installer works out for itself what it is facing.**

| Case | Behaviour |
|:---|:---|
| **First installation** | Asks **where** (ENTER accepts `C:\Pathfinder`); checks Node and PostgreSQL; prepares role and database, generating the password; copies the service; registers boot start and the evening backup; opens the firewall port; installs the application |
| **Upgrade** | **Does not ask where**: it reads it back from the machine, and **refuses** a different root — moving an installation is not installing it. Stops the service, copies application **and** service, starts it again |
| **Dry run** | `.\installa.ps1 -NonChiedere -Prova` reports root, path and restart **without touching anything**. Safe to run on a machine in service |
| **Uninstall** | `.\installa.ps1 -Disinstalla` removes service, tasks, variables and folders, **after backing up**. With `-AncheIlDatabase` it also removes database and role. **PostgreSQL is never uninstalled**, and installing and uninstalling are not done in the same run |

**At the end it verifies two things, not one:** the application's SHA-256
fingerprint against the manifest, and that the service reports the same release
number. If either fails, **the installation is declared failed** and says so.

### 6.2 What the installer does NOT do

- **It downloads no software from the internet** beyond the three npm dependencies.
- **It does not install the database engine**: it checks and stops if missing.
- **It does not touch the existing database.** If the connection string the
  machine already holds answers, it creates nothing and regenerates no password.
- **It rewrites no data** on installation. Every new field is optional and its
  absence means "as in the previous release": an upgrade is therefore never a data
  migration.
- **It asks nobody to type a password**: the database role's password is
  **generated by the installer**, shown once, and then lives only in a machine
  variable.

### 6.3 Configuration after installation

**Nothing has to be filled in** before work can start. The warehouse is drawn from
the zone configuration and locations are **generated** from aisles, bays and
levels: there is no two-thousand-row location master to load by hand. Storage
rules are optional data: until they exist, the engine works on constraints alone.

On a freshly installed machine nobody holds a PIN, and without a way in the first
one could never be created: the service therefore accepts the first access and
**declares it in plain words at startup**. As soon as the first PIN exists, that
window closes by itself and does not reopen.

> **⚠ On a new machine the first Admin is the first act**, before any data: until
> one exists, that window is open to anyone on the network.

### 6.4 Restore

| Action | Effect |
|:---|:---|
| **Going back to a previous release** | Re-install that release's package. It is the only action that also rolls back **the service** |
| **The database** | **Never touched.** An older release reads a newer release's database; 8 automated checks verify this at every release |
| **Data restore** | From the `.dump` produced by the evening backup |

> **💡 The build is reproducible bit for bit.** Rebuilding the same commit days
> apart produces the same SHA-256 fingerprint: a lost package is not lost, and the
> fingerprint is evidence of *which code* is inside, not only of which bytes.

### 6.5 Moving from the release in operation (1.4)

The warehouse currently runs **1.4**: a single HTML file with data in the browser
(IndexedDB). That release's export format is the same one the current release
reads, so the move is **an export and an import**, not a rewrite.

The path is proven by an automated bench that starts from an **empty database**,
imports a genuine export from that period, and counts: every collection arrives
with the row count it had, the movement register arrives intact, goods are found
bay by bay, and on the imported database the first Admin can be created and can
sign in.

> **⚠ Two checks to run on the real export, before importing.** Codes are stored
> uppercase, and the service normalises them on write. Therefore: **(a)** count
> the rows whose key changes — a label printed earlier no longer matches the key
> in the database, so reprinting becomes a step of the migration; **(b)** verify
> that no two rows land on the **same** key in the same bay, because one would
> then cover the other. The bench already performs both counts: point it at the
> real file.

---

## 7. Functional characteristics

This section describes what the application does and **why it is built that way**.
The italic notes name the Toyota Production System principle each choice
corresponds to: the project did not start from a lean manual, but the same
questions produced the same answers — and where the parallel does **not** hold,
it says so.

### 7.1 Location control — the problem the project was born from

**Before:** goods were put down wherever there was room, and where they had ended
up was known to whoever put them there. The same lot could sit in two bays,
counted twice, and expiry rotation treated it as two separate batches.

**Now:**

- **Every movement carries the location**, and locations are not typed by hand:
  they are generated from the zone's geometry (aisles, bays, levels, positions).
- **Two base rules, which are not data and cannot be deleted.** The first — the
  same article on the same load unit — is strong advice, overridable by stating
  the reason. The second — **the same article/lot in one location only** — is not
  overridable: a lot's stock is one row per bay, and two rows are the shortest
  route to a balance that is wrong but plausible.
- **A storage engine proposes where to put the goods**, evaluating hard
  constraints (bay status, temperature, allergens, hazard, capacity, floor
  loading) and then ranking candidates by score. **Every proposal says why, and
  every exclusion says on what grounds.** Measured: 330 locations evaluated in
  **2.1 – 2.8 milliseconds**, while the operator is still scanning.
- **The check in reverse**: the map flags what is stored where it should not be,
  with the severity, the reason, and where it should go.
- **Evidence the operator was actually at the bay**: the location is scanned, and
  the confirmation lapses if the bay changes, if an alternative location is
  chosen, or if the screen is left.

> *Lean note — poka-yoke and jidoka.* Scanning the bay is an error-proofing
> device: without it, confirmation does not pass. The signal on the map is an
> *andon*: it makes the anomaly visible at the moment it arises.
> **Where the parallel does not hold, deliberately:** at Toyota an anomaly
> **stops the line**. Here it does not. Someone holding goods with the forklift
> running does not argue with a screen saying no: either they find a way round it
> — and then the data is worse than before, because nobody knows where the goods
> went — or they stop, and the warehouse stops. A blocked dock costs more than a
> misplaced row, and a misplaced row can be seen and corrected: **goods put down
> unrecorded cannot.** From release 2.9 the system **signals and assists rather
> than forbidding** — the sole exception being the rule that would produce a
> double balance.

### 7.2 Unit-of-measure control in stock

This is what distinguishes Pathfinder from package-only management, and the
reason the project could start without a preliminary data-entry programme.

**The problem, measured on the real master of 11,197 articles:** only **two**
articles declared both the unit of measure and the quantity per package. A food
warehouse receives the same code in 25 kg sacks and next time in 5 kg ones:
"seven packages" is not a quantity, and an export that says seven packages
describes a different warehouse.

**The choice: the data is born in the act, not in a separate project.**

| Operational moment | Data captured | Why there |
|:---|:---|:---|
| Putaway to the rack | The package breakdown, declared | Declared by whoever has the sacks in front of them, not by whoever reads a table |
| First putaway of a lot | The pack size is **frozen onto the lot** | It is a fact about the lot and holds for all its packages, wherever they sit |
| Return, stocktake, count | The quantity in a whole package | Whoever counts declares **what the shelf looks like**, and the system translates the difference |
| Picking | Which package the goods come out of (`{size, quantity}`) | A quantity alone does not say which package it leaves: the balance would reconcile and the packages would be wrong |

**The result.** Stock exists in **packages and in units** together. Exports give
one row per package — counting rows gives packages, summing the column gives
units — and a summary facing different units **does not add them up: it declares
MIXED**, which is the honest answer to "300 KG plus 40 PCS".

**How coverage grew without touching the master:** 7,077 articles came back by
translating SAGE X3's `NR` code (which was not missing data, but an untranslated
code); 4,036 came back by unblocking a form that was hiding itself; **82 remain
outside and say so**, because their unit names a container rather than a measure.

> *Lean note — genchi genbutsu, "go and see".* The number is not guessed from a
> desk: it is declared by whoever is holding the package, at the moment they hold
> it. The same logic governs stocktaking, where **the system figure is not shown
> before counting**: a sheet that already carries the answer is not a check, it is
> a suggestion.

> *Lean note — do not rewrite history.* Units a movement does not carry are
> **derived on reading**, never by rewriting the movement: the register is
> history, and history is re-read with what has since been learned.

### 7.3 Guided picking

- **A serpentine route** built on the bays' real coordinates, starting from the
  warehouse holding the bulk of the goods rather than the first one on the list.
- **Several production orders in a single round.** Five orders of the same series
  requesting the same lot become **one stop**, the goods come down once and the
  production account stays **single**; the split between orders is declared at
  closing, and the shares sum to exactly what came out.
- **The location is scanned once per bay, not once per stop.** Someone collecting
  four articles from the same rack used to scan the same floor code four times,
  and typed the fourth without looking: *a check repeated when there is nothing
  left to re-check is a check people stop doing.*
- **Declared breaks**, with the time excluded from the report: over four clock
  hours with one hour stopped, the average time per line goes from 24 to 18
  minutes — and that is the true figure.
- **Correction of a stop already picked**, which does not rewrite the past but
  writes a return movement.

> *Lean note — motion waste and standard work.* The serpentine and the
> once-per-bay scan remove steps and gestures that add no value. Consolidating
> several orders into one round resembles levelling (*heijunka*), but the whole
> truth must be told: **it levels the picking, not the production.** There is no
> takt time and no kanban: the application does not govern the line.

### 7.4 The production account (WIP)

Goods picked for an order **do not vanish from the warehouse**: they enter a work
area and stay counted. For every order it is known how much went in, how much
came back, and how much is still out.

**Consumption is declared when the order closes, never before.** The remainder of
an order in progress is goods still on the bench: calling it consumption would
write a number that is always wrong at seven in the evening.

> *Lean note — making work in process visible.* WIP that is not seen is WIP that
> grows. Here it is a stock row, not an accounting entry, and the full cycle on a
> real order closed with **zero variance**: 25 kg in, 10 returned, 15 consumed,
> 0 remaining.

### 7.5 The task scheduler

- A task **launches the work**, it does not sit alongside it: starting it opens
  the form already filled in.
- **A task closes only because a movement was confirmed.** There is no manual
  "Complete", for any task type.
- Partials leave a remainder; the requested quantity never changes. **Transfers
  are the exception and close on confirmation of the movement**, by operational
  decision.
- No transition leaves a closed state, and **cancelling demands a reason**.

> *Lean note — the act is the evidence, not the tick.* A box ticked by hand
> measures whoever ticked it. A confirmed movement measures the work.

### 7.6 Compliance, food safety, GMP traceability

| Function | How |
|:---|:---|
| Allergens | The 14 of Annex II to Regulation (EU) 1169/2011, not editable; company entries are added alongside |
| Temperatures | `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C, checked per zone with a per-cell override |
| Hazardous goods | Admitted only where declared, and clean goods kept out of the dedicated area |
| Rotation | FEFO — first expired, first out |
| Signature on every act | Every movement carries the identified operator's initials, and **is never deleted** (300–500 movements a day expected). For how long it is kept: §8.3 |
| Documents | Delivery notes, disposal records, non-conformity tags, consumption statements, picking reports — each with its own reference as a **Code128 barcode** in the header |
| Load-unit labels | Internal code or **SSCC** with GS1 check digit, if the company prefix is configured |

**Silence has two meanings, and the system distinguishes them.** An article
without attributes is neither compliant nor non-compliant: it is **unknown**,
counted separately and producing no alerts. Zero alerts because all is well and
zero alerts because there is nothing to check against are two different things,
and confusing them is how you end up looking at an all-green map that means
nothing.

> *Lean note — hansei, facing your own numbers.* When an operator overrides a
> rule, the reason goes into the movement and stays in the register. It is the
> only data that in three months will say whether the rules hold or whether they
> are all overridden alike. For the same reason the reasons are **three buttons
> and not a free-text field**: with goods in hand, a free-text field gets filled
> in with "ok".

### 7.7 Visual management

The map draws the warehouse as it is: racks seen from the front (with "Mirror"
for those walking the aisle the other way), floor areas from above, load units as
boxes inside the bay, draggable from one location to another. A bay with a
problem lights up; a bay confirmed during picking becomes a green band legible at
a metre and a half.

> *Lean note — 5S and visual management.* The state of the warehouse is read by
> looking at it, not by querying it. And the signals are **static**: thirty
> flashing cells are a Christmas tree that after two days nobody looks at.

---

## 8. Security

### 8.1 Access control

| Aspect | Implementation |
|:---|:---|
| Authentication | Six-digit PIN per operator. The PIN **does not exist in the database**: its hash does |
| Algorithm | **scrypt** with a random salt. Historical SHA-256 hashes are rewritten to scrypt on the first successful sign-in |
| Session | **`HttpOnly`** cookie (not readable from JavaScript), **`SameSite=Strict`**, `Secure` when TLS is present |
| Protected surface | **All** data routes require a session. Verified in operation: a request without a cookie receives `401` |
| Routes open by necessity | `/api/health` and `/api/app-info` (queried by the installer before any PIN exists) and the sign-in route |
| Pre-sign-in operator list | Returns **the minimum**: initials, name, role, "has a PIN". No dates, no notes, **no hashes** |
| Roles | Operator · Team Leader · Admin. Only an Admin opens Configuration and the data reset, and the reset demands their PIN |
| Signing out | "Lock" ends the session on the service too. Sessions live in memory: a restart invalidates them all |
| Attempt throttling | Five wrong attempts and a minute's wait, for both PIN and recovery code |

**Role permissions are enforced by the SERVICE, not by the client** (from release
2.13). They previously lived in the browser: any session plus one line of `curl`
was enough to write the Admin role onto yourself. The guard now watches not only
the operator roster but the transaction that touches it in passing, the wipe that
names it in a list, and bulk writes — one of these left open and the rule would
not hold.

**The last active Admin cannot be demoted, deactivated or deleted** (from 2.16),
and the service enforces this by simulating the write against a copy of the
roster before admitting it. Without an Admin, Configuration does not open and the
recovery code does not apply: only the machine key would remain. **A full data
reset is still allowed**, and must be: it empties everything, nobody is left
holding a PIN, and the first-run window reopens by itself.

### 8.2 A lost PIN — the three ways out

A PIN is **not recoverable by construction**: only its hash is on disk.

1. **A higher rank renews it from the application**, typing **their own** PIN. An
   Operator is renewed by a Team Leader, a Team Leader by an Admin, an Admin by
   another Admin. The hierarchy is verified by the service.
2. **The recovery code**, when the lost PIN is the only Admin's. Twenty
   characters; it is consumed on use, and another is issued immediately, shown
   **once only**. It applies **to Admins alone**, because only they have nobody
   above them.
3. **The machine key** (`PATHFINDER_TOKEN`), which opens the routes without a
   session. It is **the service exit, not a procedure**: used by whoever already
   has access to that machine.

The cause is removed by naming **a second Team Leader** — a minute in
Configuration → Operators — and by printing a recovery code.

### 8.3 Personal data and retention

| Data | Handling |
|:---|:---|
| Operators | First name, surname, initials, role, PIN hash. No other personal data |
| Movement register | The operator's initials on every movement — **this is the GMP signature** |
| Telemetry | **None.** No outbound request, from anywhere in the code |
| Deletion | **No record is ever deleted, full stop.** There is no function that deletes a movement, and none that deletes them by age. To take data away there is the export, which removes nothing from where it sits |
| Database files and exports | **They do not enter the code repository**, because they carry PIN hashes beside the names of real people. An automated check fails if a tracked file contains one |

> **⚠ HOW LONG DATA IS KEPT — changed in rev02.** Up to release 2.16 the
> application displayed a retention of **six years**. That figure **matched no
> regulation and deleted nothing**: the purge function had already been removed in
> release 2.1, so the system kept everything and the label merely understated it.
> **From release 2.17 the constant no longer exists.**
>
> The reference framework, for the decision that rests with the QA/RA function:
>
> | Regime | Period | Applies to |
> |:---|:---|:---|
> | Medicinal GMP — EudraLex Vol. 4, Ch. 4 | batch expiry **+ 1 year**, or **5 years** from QP certification: whichever is longer | batch documentation |
> | Food law — Regulation (EC) 178/2002, Art. 18 | **no statutory minimum.** Commission guidance recommends **5 years**; shelf life over 5 years → *shelf life + 6 months*; highly perishable with a use-by under 3 months → **6 months** | traceability records |
> | **Article 2220, Italian Civil Code** | **10 years** from the last entry | accounting records, invoices, correspondence — **and delivery notes**, which Pathfinder issues |
> | GMP Annex 11 | as long as the record it documents | audit trail of computerised systems |
>
> **The software imposes none of these periods and prevents none of them:** it
> does not delete, so whatever period the procedure sets is met by construction.
> The period, and any deletion at expiry, are a **backup and database policy**, to
> be defined in the company SOP.

### 8.4 Application surface

- **SQL is always parameterised**, in both database drivers.
- **Codes cannot contain characters that would break an interface handler**: they
  are refused on write, in one place, rather than silently cleaned — a cleaned
  code is a different code from the one the caller believes they wrote.
- **The backup destination path is validated**: network paths, system folders and
  relative paths are refused.
- **HTTP headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`.
- **Filesystem permissions**: the installer breaks inheritance on `C:\Pathfinder`
  and rewrites the ACLs — full control to SYSTEM and Administrators, read and
  execute to everyone else. Previously any user of the machine could rewrite the
  service file, which runs as SYSTEM on restart.
- **No `Content-Security-Policy`, and this is declared**: a serious CSP forbids
  the inline handlers this interface is built on, and one permissive enough to let
  them through would be a line that protects nothing and that the next reader
  believes protects something.

---

## 9. Backup, continuity, monitoring

| Item | How |
|:---|:---|
| Automatic backup | Scheduled task, **every day at 20:00** |
| Format | `pg_dump` in custom format, **read back with `pg_restore --list` before being declared good**. If the re-read fails the file is deleted, because a file left there gets counted by whoever looks at the folder |
| Destination | `C:\Pathfinder\backup\`. The path is configurable and is validated |
| Rotation | **Off by default**: no automatic deletion. Enabled by passing the retention days to the script |
| Log | Every run writes a line with outcome and size to `backup.log` |
| On-demand backup | One call to the service, also used by the installer **before every upgrade** |
| Diagnostics | `/api/app-info` returns release, fingerprint, bytes and the folder being served; **when something is wrong it also carries the real error code and the account the process runs under** |
| Database state | `/api/health` returns collections, per-table counts and revision |

> **⚠ NOTE — operational continuity.** The database sits **on the same machine as
> the service**: the warehouse stops when that PC stops. This is the same level of
> continuity as when the data lived in a file, and it is a conscious decision.
> Moving it to a dedicated server or a managed instance is a continuity decision,
> not an architecture to rewrite: the service already talks to a remote PostgreSQL
> by changing a connection string.

---

## 10. Known limitations and hardening status

They are written here because IT will find them anyway, and finding them written
down is worth more than finding them alone. Each carries today's mitigation and
what would be needed to close it.

| # | Limitation | Risk | Mitigation today | To close it |
|:--|:---|:---|:---|:---|
| 1 | **Traffic in the clear (HTTP)** | Anyone listening on the internal network can read the session cookie and reuse it until the service restarts | Internal network; port exposed only to Domain and Private profiles | **Internal DNS name + certificate from the company CA.** The code is ready: two variables and HTTPS is on. *Requires an IT decision* |
| ~~2~~ | ~~**Role permissions verified in the client**~~ | — | — | **CLOSED.** Release 2.13 moved the hierarchy to the service, with 32 checks exercising it via `fetch` and real cookies; release 2.16 added the rule that was missing — the last Admin cannot remove themselves — bringing them to **40**. An authenticated user calling a command route by hand now finds something stopping them |
| 3 | **Excel library `xlsx` 0.18.5 with two known vulnerabilities** (prototype pollution GHSA-4r6h-8v6p-xvw6 and ReDoS, high severity) | The vector is a spreadsheet uploaded by an operator | The files handled are production orders and article masters **generated by SAGE X3 inside the company**, not external attachments. The service's dependencies carry **zero** vulnerabilities | **Risk formally accepted on 01/09/2026**, on the grounds stated alongside. **To be reopened the day a spreadsheet arrives from outside.** The alternative remains SheetJS's corrected build, which is not on npm and requires re-testing everything that touches Excel |
| 4 | **Database and service on the same machine** | No continuity if the workstation stops | Verified evening backup; automatic restart at boot | A PostgreSQL instance on a dedicated server. No code rewrite |
| 5 | **No high availability, no load balancing** | Machine down = warehouse down | Downtime is minutes, not hours: the scheduled task is restarted | A continuity decision, not taken today |
| 6 | **No Active Directory / SSO integration** | Warehouse credentials are separate from domain ones | A declared choice: the PIN stays, because people work in gloves in the aisle and a domain login cannot be typed | Reviewable, but implies identity management that does not exist today |
| 7 | **Backup rotation off by default** | The folder grows by ~0.5 MB a day | No automatic deletion **is the project's rule**, not an oversight | Enabled by passing the retention days, once IT decides the policy |
| 8 | **An upgrade means a few seconds of downtime** | Terminals see a momentary error | Upgrades are done at end of shift | Not removable: the Node process loads its code at startup |
| 9 | **No offline working** | If the service does not answer, the application stops and says so full-screen | **This is a choice**, not a gap: no local queue to reconcile, therefore no conflicts and no balance diverging between two terminals | Not intended to change |
| **10** | **PIN hashes in the code repository's history** | A warehouse dump with real people's `pin_hash` and `pin_salt` was tracked for four days in August | The history was **rewritten on 01/09** and the file is in no branch; the repository is **private**. Old commits nonetheless remain reachable by SHA until GitHub garbage-collects | A request to GitHub Support to purge unreferenced objects, and **renewal of the PINs** of the operators concerned when they return to the database. The hashes in that dump were SHA-256, not scrypt |
| **11** | **The move from 1.4 has not yet been tried on live data** | The migration is proven on an archived export, not on an export produced today by the warehouse | An automated bench of **14 checks** exercises the path from an empty database and verifies that nothing is lost | Export from the warehouse machine and point the same bench at it, with the two checks in §6.5 |

---

## 11. Software quality and verifiability

| Item | Value, measured 02/09/2026 |
|:---|:---|
| Automated checks on the application | **1,222 checks in 44 files** — 1,221 green, 1 declared skipped — in about 4 seconds |
| Checks on the data service | **141 checks**, runnable **against both database engines** |
| Checks on the installation scripts | **43 checks**, exercising installation, uninstallation, rollback and the installer in dry-run mode |
| Checks on the schema change | **8 checks**: an older release re-reads a newer release's database |
| Checks on role permissions | **40 checks** against the real service, with `fetch` and real cookies |
| Full warehouse cycle | **47 checks**, from goods-in to consumption, on a copy of the real database |
| Move from release 1.4 | **14 checks**, from empty database to imported warehouse |
| Typing | TypeScript in `strict` mode across the whole source, zero errors on application and service |
| Source | **79 TypeScript files**, **no JavaScript** in the client |
| Release integrity | Manifest with a per-file SHA-256 fingerprint, verified by the installer |
| Reproducibility | The build is **reproducible bit for bit** from the same commit |
| Interface performance | First load **251 kB**, reload **300 bytes** (immutable assets, `no-cache` index); the Excel library loads **only on import or export** |
| Engine performance | Storage proposal over 330 locations: **2.1 – 2.8 ms** |

**How a release is verified before installation.** Every release is exercised on a
**bench**: a hot copy of the real database, on its own port, with its own folders.
The rule is declared and not overridden: *tsc says whether the code is coherent,
the checks say whether the parts do what they promise, and neither says whether
the application works.*

**A serious defect caught by the bench stops the run.** Since 02/09 the cycle
bench exits with an error when it raises a defect of *grave* severity, and keeps
that run's report aside instead of letting the next run overwrite it.

---

## 12. What is asked of the IT team

- [ ] **A Windows workstation** reachable by the terminals, with Node.js LTS and PostgreSQL 17 installed
- [ ] **Access to the npm registry** from that workstation, for the first installation only
- [ ] **Opening TCP port 4173** inbound on the Domain and Private profiles (the installer does it; authorisation is needed)
- [ ] **Local administrator privileges** for installation and upgrades
- [ ] **Antivirus exclusion**, if policy requires it, on the `C:\Pathfinder\` folder and the Node process
- [ ] **A decision on TLS** (limitation 1): internal DNS name and a certificate from the company CA — the code is ready
- [ ] **A decision on the data retention policy** (§8.3): the software deletes nothing, the period is set by procedure
- [ ] **A decision on the backup rotation policy** (limitation 7) and, if required, a network destination for a secondary copy
- [ ] **Acknowledgement of limitation 3** (accepted risk) **and of limitation 10**, with the request to GitHub Support
- [ ] **A window for the move from 1.4** (limitation 11), with an export produced by the warehouse machine

---

## 13. Minimal glossary

| Term | Meaning in this document |
|:---|:---|
| **UOM** | The article's unit of measure (KG, PCS, L…). Distinct from the **package**, which is the physical container |
| **Package** | A sack, a box, a drum. Packages of the same article may be of different sizes |
| **Load unit (UDC)** | A pallet, with its label and the rows sitting on it |
| **Location / bay** | The physical position: warehouse, aisle, bay, level |
| **Lot** | The production batch. Together with the article it forms the stock key |
| **ODP** | Production order, imported from SAGE X3 as a spreadsheet |
| **WIP** | Work in process: goods off the shelf and not yet consumed |
| **FEFO** | First expired, first out |
| **GMP** | Good Manufacturing Practice: the rules of good food manufacturing |
| **Jidoka / poka-yoke / genchi genbutsu** | Toyota Production System principles: make the anomaly visible · make the error impossible · decide by going to see on the spot |

---

## 14. References

| Document | Where |
|:---|:---|
| Full technical documentation and project status | `MAPPER\INDEX.md` — the single project document, in Italian |
| Installation from scratch and machine diagnostics | `MAPPER\README.md` — in English; the Italian original is `README.it.md` |
| How the data service is built | `MAPPER\server\README.md` |
| The PostgreSQL driver and the migration | `MAPPER\server\migrazione\README.md` |
| One line per release | `MAPPER\CHANGELOG.md` |
| Licence | `MAPPER\LICENSE` |
| Instructions for whoever installs | `LEGGIMI.txt` inside the delivery package, in Italian |

---

*© Dietopack S.r.l. — Naturacare Group | Documento redatto da / Prepared by Andrea Sacchetti | Uso interno riservato / Internal use only*
