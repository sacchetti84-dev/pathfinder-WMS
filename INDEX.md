# Pathfinder — INDEX

**Questo è l'unico documento del progetto.** Stato, regole, trappole, coda di
lavoro e mappa del codice stanno qui. `HANDOFF/` è stato assorbito qui il
17/08/2026 e gli originali sono scesi in `ARCHIVIO/HANDOFF STORICI/`: sono
memoria, non istruzioni.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
Repo privato `sacchetti84-dev/pathfinder-WMS`, branch `main` (unico ramo)
Aggiornato: **03/09/2026 notte** — **il magazzino del prodotto finito esiste,
ed è scritto ma non ancora impacchettato.** Il PF esce dal reparto, viene
imballato su un bancale, scansionato ed etichettato, e messo nella zona di
spedizione: fino a ieri di tutto questo Pathfinder non sapeva niente — la
produzione registrava il **consumo** dei componenti e il prodotto finito
viveva come una riga di testata sul rapporto di prelievo. Adesso un bancale è
un'**unità di carico** con tre campi in più, chi spedisce lo vede in un elenco
che si ordina e su una mappa che si tinge, lo spunta e il DDT si riempie da
sé, con una **packing list** accanto. E un DDT di **conto terzi** non scarica:
sposta la merce nel vano del terzista, che sta già sulla mappa. **Otto blocchi,
otto commit, tutti i collaudi verdi tranne uno che era già rosso** — §4, voce
**87**. **La 2.20.0 è costruita e non installata**, impronta `d10d7830…`, e il
numero è nei quattro posti di §7.

Prima di questo — **la 2.19.0 è costruita e non installata**:
le etichette di merce e unità di carico escono su **Zebra in rete**, e a
parlare alla porta 9100 è il servizio, perché un browser un socket TCP non lo
apre. La stampa su A4 resta dov'era — §8 dice che non si migra, e qui la
regola lavora a favore: la stampante si affianca alla carta. **Le stampanti
hanno la presa di rete e le installa il team IT** (Andrea, 02/09: serie ZD200,
203 dpi, adesive staccate 100 × 80), e le **istruzioni di configurazione sono
scritte in tutti e quattro i documenti che qualcuno legge davvero** — i due
README, la scheda tecnica per l'IT (**rev05**, col nuovo cap. 5.3 e due
richieste nuove al team) e il LEGGIMI del servizio. Voci **84 e 86 chiuse**;
resta la **83**, che vuole la stampante davanti. **In servizio su questa
macchina c'è ancora la 2.17**, installata da Andrea, che porta via il limite di
ritenzione — non cancellava niente e dichiarava un numero che nessuna norma
chiede. Nella stessa giornata
la repository è passata da **4.539 file tracciati a 926** ed è andata in
inglese per il team IT. §0 dice adesso quel che non diceva: **le macchine sono
due**, e il magazzino vero gira ancora la **1.4** altrove.

**Il dump coi PIN è uscito dalla storia di git** (voce 72): `git filter-repo`,
push forzato, `main` riscritto. **Gli SHA di tutti i commit sono cambiati** —
la storia narrativa del 28/08 sta ora a `d78ca62` (era `f4a9578`), il commit
che portò dentro il dump è `194eae5` (era `ecd2538`). **Un vicolo cieco è stato
murato**: l'ultimo Admin poteva togliersi la carica da solo e da lì non si
rientrava. Il registro dei movimenti ha smesso di dire numeri che si
contraddicono (voci 33 e 34), e i due banchi rossi sono verdi (voci 70, 71).
Un difetto grave adesso **tinge di rosso la corsa** del ciclo (voce 50).

**Cos'è Pathfinder.** Applicativo web per un magazzino alimentare in GMP.
Node + Express su rete interna, porta **4173**, database **PostgreSQL 17** in
locale. Più terminali, un solo database, l'arbitro è il server. UNLICENSED,
uso interno.

**Stato: ALFA** (dichiarato da Andrea il 25/08/2026). Fa il suo mestiere e ha
dati veri dentro, ma la superficie si muove ancora. **Non c'è una scadenza**:
le date si scrivono come fatti avvenuti, mai come promesse.

---

## 0. Come si lavora qui

### LE MACCHINE SONO DUE, E CONFONDERLE FA SBAGLIARE TUTTO IL RESTO

**Questa non è la macchina del magazzino.** È la macchina di **sviluppo**, e
serve a produrre la **beta**. Il magazzino vero gira su **un'altra macchina** e
porta la **1.4**.

| | macchina di sviluppo — **questa** | macchina di magazzino |
|---|---|---|
| a cosa serve | costruire e provare, fino alla beta | far lavorare il reparto |
| versione | quella in lavorazione — §1 | **1.4** |
| database | **prove sovrapposte**: caricamenti, reset, versioni che si accavallano | i dati veri |
| chi installa | nessuno: si costruisce e si prova | **Andrea, a mano, a fine turno** |

**Servita vuol dire installata — QUI.** Su questa macchina non c'è un gesto di
«messa in produzione» separato: la versione che risponde a `/api/app-info` **è**
quella installata, e si scrive così. Nessuna riga di questo documento deve dire
«costruita, non installata» di una versione che ha servito. **In magazzino la
regola è l'opposta** — lì installare resta un atto umano, a fine turno, con un
backup fresco davanti, e lo decide Andrea.

**Conseguenza da tenere ferma: i conteggi strani del database di QUESTA
macchina non sono incidenti.** Registro a zero, giacenze che cambiano numero,
operatori che spariscono e tornano: è quel che succede a un banco su cui si
caricano backup, si resetta e si installano versioni diverse in due giorni. **I
backup stanno in archivio**, e le voci 69, 73 e 74 vanno lette così — non come
merce perduta. **Un difetto del CODICE resta un difetto** anche se lo si vede
su questo database: si distingue chiedendo «succederebbe anche con dati
puliti?», e la risposta la dà il banco, non il database vivo.

**E c'è un salto che nessuna voce copriva finora: dalla 1.4 alla beta.** Il
magazzino vero è fermo a una versione che non conosce PostgreSQL, il conto di
produzione, il giro, le unità di carico e le cariche imposte dal servizio.
Portarci sopra i dati veri è **la voce 79**, ed è il lavoro che decide se tutto
il resto serve a qualcosa.

### Poi

1. **Si legge questo file, e basta.** Il [README](README.md) serve a chi
   installa il servizio da zero o diagnostica una macchina.
2. **Il primo comando di ogni conversazione che tocchi la consegna è
   `Invoke-RestMethod http://127.0.0.1:4173/api/app-info`** — e risponde **il
   servizio di questa macchina**, non il magazzino. Quello che risponde batte
   quello che dice questo documento. È successo **quattro volte in cinque
   giorni** che il documento dicesse la versione sbagliata (voci 35 e 48-bis),
   e la quinta è documentata in §1.
3. **Questo file si aggiorna a fine conversazione**, non durante. Chi cambia
   uno stato (installa, chiude un aperto) aggiorna la riga nello stesso gesto.
4. **Installare in magazzino è un atto umano**: a fine turno, con un backup
   fresco davanti, e decide Andrea. Un agente costruisce, prova al banco,
   prepara i comandi.
5. **Codice scarno**: pochi commenti e sul **perché**, mai sul cosa. La
   narrativa sta qui, non nei file.
5-bis. **Le lingue sono due, e non si mescolano.** Questo INDEX, i commenti nel
   codice e `LEGGIMI-pacchetto.txt` (che va in mano a chi installa in
   magazzino) restano **in italiano**. I README della repository sono **in
   inglese**, perché li legge il team IT. Un documento tradotto porta in testa
   il rimando all'altro e, se è fermo, lo dichiara: **due copie che divergono
   in silenzio sono peggio di una copia sola**.
6. **Non si segnalano ritardi di programma.** Il giudizio sull'andamento lo dà
   Andrea.

### Le due cartelle, e non si confondono
| | Cos'è | Chi ci scrive |
|---|---|---|
| `…\Desktop\PROGETTI E CODING\MAPPER\` | **La cartella di lavoro**: sorgenti, collaudi, build, banco, questo documento | chiunque lavori al progetto |
| `C:\Pathfinder\` | **L'installazione**: `servizio\`, `app\`, `data\`, `backup\`. Non è un posto di lavoro | solo `installa-versione.ps1`, `torna-indietro.ps1` e il backup |

> Un agente lavora dentro `MAPPER\` senza chiedere: legge, scrive, costruisce,
> collauda, aggiorna questo documento. **Tutto ciò che tocca `C:\Pathfinder\`,
> il servizio, il database o le attività pianificate si propone e si aspetta il
> via.**

L'installazione di questa macchina è **in prova sul PC di Andrea**: ciò che si
rompe qui non ferma nessuno. Il database però porta dati veri, e per questo un
collaudo si fa sempre su una **copia** — §5.

> **Il 01/09 `C:\Pathfinder\` è stata svuotata e rifatta da zero** — voce
> **74**. Il servizio risponde di nuovo e le ricette di §5 funzionano, ma il
> **database è vuoto**: quello che si legge dall'applicativo non è il
> magazzino, è una casa nuova.

---

## 0-bis. Come non allucinare su questo progetto

Questo documento ha sbagliato più volte proprio sui fatti che sembravano
scontati. Prima di affermare una di queste cose, **si misura**:
| Affermazione | Comando che la stabilisce |
|---|---|
| quale versione è in servizio, con quale impronta | `Invoke-RestMethod http://127.0.0.1:4173/api/app-info` |
| quanti articoli/giacenze/movimenti/operatori ci sono | `Invoke-RestMethod http://127.0.0.1:4173/api/health` |
| quale database sta servendo | la stessa `/api/health`, campo `file` · e la riga che il servizio stampa all'avvio |
| quanti collaudi passano | `npm test` (client) · `node test/collaudo.js` da `server\` |
| quale versione dichiara il codice | `grep -n "VERSIONE\|VERSION" vite.config.js server/pathfinder-server.js src/core/pacchetto.ts package.json` |
| che cosa c'è di non committato | `git status --porcelain` e `git diff --stat --ignore-cr-at-eol` |
| quale valore ha una chiave di `meta` (es. `areaWip`) | dal 2.11 serve una sessione: si guarda dall'applicativo, non con `curl` |

**Tre regole di lettura di questo documento:**

- Una riga che descrive una versione **archiviata o ritirata** descrive il
  passato: non è una funzione disponibile. Le sezioni lo dicono in testa.
- Un numero senza data è un numero vecchio. Dove c'è una data, vale a quella
  data e non a oggi.
- **Le voci della coda (§4) non si rinumerano mai.** Una chiusa resta al suo
  posto, barrata, perché altre righe la citano per numero.

**Punti oggi incerti, e non si dichiarano risolti finché non si guardano:**
la divergenza dei conteggi del database (voce **69**), quale vano sia l'area
WIP (voce **15**), se la voce **19** sia chiusa dalla 2.4 o ancora aperta
(le due righe si contraddicevano dal 26/08 e nessuno l'ha verificata).

---

## 1. Stato, misurato il 02/09/2026

### In servizio

**La 2.17, installata da Andrea il 02/09** — su questa macchina, che è quella
di **sviluppo** (§0): il magazzino vero non è stato toccato, e gira la 1.4
altrove. Misurato da `/api/app-info` e `/api/health` a installazione finita:

| | |
|---|---|
| applicativo e servizio | **2.17** — `versione` e `service_version` dicono lo stesso numero |
| impronta | `b6b24d7091d70e52cbe3cd02cd520363fff5e38de6002c5b51c8e76cda74d731` |
| byte | **1.903.362** in **4 file**, `costruita 2026-09-01T23:35:12Z` |
| dove | `C:\Pathfinderpp\corrente`, modo `cartella` |
| database | **PostgreSQL 17** — `pathfinder` su `127.0.0.1:5432`, 21 collezioni, `revision 333` |
| bundle servito | `index-mqdW0HMD.js` · `index-BZKbPXaf.css` — **gli stessi del pacchetto** |
| porta chiusa | **sì** — `GET /api/c/meta` senza sessione risponde **401** |
| via di ritorno | `C:\Pathfinderpp\precedente` porta la **2.16** |
| dati | invariati: 11.197 articoli, 882 giacenze, 4 siti, 17 zone, **1 operatore** |

**L'impronta è quella del pacchetto committato, e il bundle servito è quello
del pacchetto**: i byte che girano sono quelli provati.

**Cosa c'era prima:** la **2.16**, impronta `111d58b5…`, 1.903.224 byte in 4
file, costruita `2026-09-01T18:51:57Z`. Sta in `app\precedente` ed è la via di
ritorno intera.

> **LA FINESTRA DI PRIMO AVVIO SI È CHIUSA, ED È LA COSA DA GUARDARE DOPO OGNI
> INSTALLAZIONE PULITA.** Appena installata, con `operators` a zero, il
> servizio rispondeva **200** a `/api/c/meta` senza sessione: non è la 2.11 che
> cede, è `finestraDiPrimoAvvio` che tiene aperto perché qualcuno possa creare
> il primo Admin. **Ma aperto è aperto**, e per qualche ora chiunque fosse
> sulla rete ha potuto parlare con le API. Creato l'Admin, la porta si è
> richiusa da sola. **Su una macchina nuova il primo Admin è il primo gesto**,
> prima di qualunque dato.

**Cosa c'era prima, e resta scritto perché è la misura da cui si è ripartiti:**
**2.13**, impronta `cbe7180250984a557208d0cda860e6b63e0b5772c49a209ae752ac4afc81eb64`,
1.882.735 byte in 4 file, costruita `2026-08-31T17:13:09Z`. `GET /api/c/meta`
senza sessione rispondeva **401**: la porta chiusa della 2.11 ha retto in
produzione fino all'ultimo giorno.

> **LA 2.13 ERA STATA INSTALLATA E QUESTO DOCUMENTO NON LO SAPEVA.** La stesura
> del 31/08 pomeriggio la dichiarava «costruita, non installata» e diceva in
> servizio la 2.12.1; la sera `/api/app-info` rispondeva **2.13**, con
> l'impronta del pacchetto. È stata la **sesta volta** che la riga «in
> servizio» ha sbagliato, ed è per questo che §0 punto 2 esiste: si chiede al
> servizio, sempre.

> **LA VIA DI RITORNO NON C'È PIÙ, e non era stata riletta prima.**
> `C:\Pathfinder\app\precedente` è stata cancellata senza che nessuno avesse
> guardato che cosa contenesse. **Non sono byte persi** — ogni versione si
> ricostruisce dal commit, e la build è riproducibile (§2) — ma è una domanda
> rimasta senza risposta: quale versione ci fosse prima della 2.13. I pacchetti
> stanno in `ARCHIVIO\VERSIONI PRECEDENTI\`.

### La 2.20.0 — come è stata costruita

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.20.0\` |
| impronta | `d10d78308952d360bb4451614ce43bb0f87b4466a916136090fe9bd690bb6fb7` |
| byte | **1.982.683** in **4 file**, `costruita 2026-09-03T15:48:15Z` |
| riproducibile | **sì, verificata**: tre build di fila dello stesso albero danno la stessa impronta — anche quella fatta dopo aver rimesso i fine riga, che il bundle non li vede |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi dal pacchetto | `servizio\test\collaudo-installazione.js` girato **dentro** `consegna\Pathfinder 2.20.0\`: **43 su 43**; il servizio del pacchetto dichiara `2.20.0` e porta il catalogo dei campi del bancale |
| prova a vuoto | **non fatta**: `installa.ps1 -Prova` legge la macchina, e §0 dice che tutto ciò che tocca `C:\Pathfinder\` si propone e si aspetta il via |

**La 2.19.0, che non è mai stata installata, è archiviata** in
`ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.19.0\` — §7: prima di costruire si
copia il pacchetto che aspetta un'installazione, perché la build azzera
`consegna\`.

### Il fix che viveva in un pacchetto solo

Il **28/08 il magazzino è rimasto giù una giornata intera**. L'attività
pianificata parte `AtStartup`, il servizio ha chiesto PostgreSQL **diciotto
secondi** dopo l'accensione, il motore stava ancora facendo il recovery, e il
servizio è uscito con 1 — come deve, «meglio fermo che vivo senza database».
Poi non ci ha riprovato nessuno: il `-RestartCount` dell'Utilità di
pianificazione ripesca le attività che **non riescono a partire**, non quelle
il cui processo esce con un codice diverso da zero.

La correzione è la **2.12.1**, e il 31/08 si è scoperto **dov'era scritta**:
in `consegna\Pathfinder 2.12.1\servizio\` e in `C:\Pathfinder\servizio\`, cioè
nel pacchetto e nella macchina. In `server\` **no**. Tocca due file —
`lib\driver-postgres.js` (attesa dell'avvio, +68 righe) e
`installa-servizio.ps1` (`$trigger.Delay = 'PT1M'`, cinque tentativi a due
minuti) — e li ha trovati un confronto file per file fra i due alberi.

**La 2.13 la riporta nel sorgente**, byte per byte, e le mette accanto le
prove che non aveva: §3.

> **È una trappola nuova, e sta in §7.** La build copia `server\` dentro il
> pacchetto e **mai il contrario**. Un fix scritto nel pacchetto vive fino alla
> build successiva, e poi sparisce senza che niente lo dica.

### I conteggi del database — 01/09, dopo il caricamento di prova

Il database è nato vuoto con l'installazione pulita, e poi Andrea ci ha
caricato **un backup in merge, per fare delle prove**. Misurato da
`/api/health`:
| collezione | righe | | collezione | righe |
|---|---:|---|---|---:|
| `articles` | 11.197 | | `mov_log` | **0** |
| `inventory` | **882** | | `lots` | **0** |
| `zones` | 17 | | `udc` | 0 |
| `sites` | 4 | | `wip` | 0 |
| `operators` | **1** | | `revision` | **318** |

> **IL REGISTRO MOVIMENTI È VUOTO, E NON PER SBAGLIO: nel backup non c'era.**
> Lo dice Andrea, ed è coerente con quello che si misura. **I 45 movimenti del
> magazzino vero esistono in un posto solo**, il dump del 31/08 sul Desktop
> (voce 73). §8 non li fa cancellare mai: finché stanno su un disco solo, sono
> un file che prima o poi non c'è più.

> **882 GIACENZE E LA COLLEZIONE `lots` A ZERO.** Andrea dice che i lotti ci
> sono, e ha ragione su quello che intende: il **codice** di lotto viaggia
> sulla riga di giacenza, dentro `item_key`. Ma la collezione `lots` è un'altra
> cosa — porta `expiry_date` e la **confezione congelata** (`uom`,
> `uom_per_collo`) — e quella è vuota. **Senza `lots` non c'è la scadenza**, e
> senza scadenza il FEFO non ordina niente; senza confezione congelata il conto
> di produzione ricade sul ripiego della voce 61. **Da guardare prima di
> giudicare una prova fatta su questi dati**, perché non è il magazzino vero:
> è un magazzino senza date.

**L'ultima misura prima della cancellazione**, tenuta perché è il termine di
paragone. Da `/api/health` il 31/08:
| collezione | righe | | collezione | righe |
|---|---:|---|---|---:|
| `articles` | 11.197 | | `lots` | 29 |
| `inventory` | 851 | | `wip` | 6 |
| `sites` | 4 | | `pick_archive` | 2 |
| `zones` | 17 | | `meta` | 3 |
| `mov_log` | **45** | | `operators` | **2** |
| `loc_status` | 5 | | `disabled` | 1 |
| `tasks` | 3 | | `udc` | **1** |

Vuote: `quarantine`, `pending_outbound`, `pick_session`, `disposal_archive`,
`storage_rules`, `recipients`, `location_attrs`.

> **LA VOCE 69 RESTA APERTA, e adesso ha un fatto in più: il database vive.**
> Dal 28/08 al 31/08 i movimenti sono saliti 39 → **45**, gli operatori 1 →
> **2**, i lotti 27 → **29**, e la prima UDC della storia del progetto è nata
> (`udc` 0 → **1**, che era la voce 12). Quindi il calo del 27-28/08 — 886
> giacenze, 321 movimenti, 7 operatori scesi a 851, 39, 1 — **non è un
> database sbagliato che si sta ancora leggendo**: è successo qualcosa in quei
> due giorni, e dopo il magazzino ha ripreso a scrivere su questo. Resta da
> guardare **prima di qualunque cosa che tocchi i dati**.

### Collaudi e tipi

Tutti rilanciati il **03/09 notte**, sul codice del prodotto finito. **Verdi
tutti tranne una prova della gerarchia, che era già rossa prima** — verificato
rimettendo il codice del commit `c693b2c`: non l'ha rotta questo lavoro, ed è
la **voce 87**.
| | |
|---|---|
| client | **1.303 prove in 48 file — 1.302 verdi e 1 saltata**, `npm test`. I file nuovi sono `imballo.test.js` (17) e `bancale.test.js` (16); le altre nuove stanno in `stampanti.test.js` (37), `documenti.test.js` (8) e `stampa.test.js` |
| tipi | `npm run check` **a 0** su client e servizio |
| servizio | **156** |
| stampa (`server/test/collaudo-stampa.js`) | **100** — erano 78: le ventidue nuove sono l'etichetta del bancale, il bancale misto che non inventa niente, e il layout che non ci sta e si rifiuta |
| migrazione · installazione | **8 · 43** |
| gerarchia (`banco/gerarchia.cjs`) | **39 su 40** — la rossa è la voce **87** e non riguarda il prodotto finito |
| ciclo (`banco/ciclo/gira.cjs`) | **47 su 47** — voci 70 e 71 chiuse. Dalla 2.16 **esce 1** se in quella corsa è stato alzato un difetto `grave` |
| migrazione dalla 1.4 (`banco/migrazione/dalla-1.4.cjs`) | **14** — il salto dal magazzino vero alla beta, su un database vuoto (voce 79). Nuovo il 02/09 |

### La 2.14 — come è arrivata in servizio
| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.14\` |
| impronta | `8a25574bb3fbc2303dcdb0c7edc9370c5ec2b0d11ab75e6e9c4c0431fe448ead` |
| byte | **1.901.483** in **4 file**, costruita `2026-08-31T19:07:52Z` |
| riproducibile | **sì, verificata**: due build di fila dello stesso albero hanno dato la stessa impronta |
| prova a vuoto | `.\installa.ps1 -NonChiedere -Prova` **sulla macchina di allora, che aveva la 2.13 in servizio**: strada **aggiornamento**, radice `C:\Pathfinder`, PostgreSQL già pronto, **nessuna migrazione**, database non toccato |
| provata al banco | **sì, dal pacchetto** — non solo dal sorgente: servizio sulla 4199 con `banco\app\corrente` a 2.14 e `banco\db\ui.db`, e la schermata nuova esercitata di lì |

> **IL PACCHETTO 2.14 ERA STATO RITAGLIATO TRE VOLTE COL SOLITO NUMERO, e per
> questo esiste la 2.15.** Il 31/08 sera con l'installer vecchio, il 01/09 con
> la correzione della voce 75, e ancora il 01/09 con la disinstallazione.
> L'applicativo non era mai cambiato — stessa impronta, stessi byte — **ma
> l'installer sì, e l'impronta non lo copre**: chi tiene in mano una cartella
> «Pathfinder 2.14» non ha modo di sapere quale dei tre ci sia dentro. Il
> numero è stato mosso a **2.15** e la 2.14 è stata archiviata in
> `ARCHIVIO\VERSIONI PRECEDENTI\` **nella forma che gira sulla macchina**.
> **L'IMPRONTA IDENTIFICA L'APPLICATIVO, NON IL PACCHETTO**: due pacchetti con
> la stessa impronta possono portare installer diversi, e l'unico modo di
> tenerli distinti è il numero.

**Installata il 01/09 sera**, e non per aggiornamento: sulla macchina rifatta
l'installer ha preso la strada di **prima installazione**, quella che la prova a
vuoto non aveva mai esercitato. **Si è rotta lì**, due volte, e la voce **75**
racconta come. Il pacchetto è stato ricostruito il 01/09 con l'installer
corretto: **stessa impronta** `8a25574b…` e stessi 1.901.483 byte — cambia solo
`costruita`, che nel manifesto del pacchetto adesso dice `22:55:27` mentre la
macchina, installata prima della ricostruzione, risponde `19:07:52`. **I byte
dell'applicativo sono gli stessi**: l'impronta lo prova, ed è lei che conta.
Installare resta un atto umano — §0 punto 4.

### La 2.15 — come è arrivata in servizio
| | |
|---|---|
| installata | **01/09**, e verificata dal servizio: `/api/app-info` risponde 2.15 con questa impronta |
| pacchetto | `consegna\Pathfinder 2.15\` |
| impronta | `7b812c48ae9d1c878efd7e3e5114bed96fa3536c8ccb13d4107ab335fe4fd7eb` |
| byte | **1.901.483** in **4 file**, `costruita 2026-08-31T23:34:17Z` |
| riproducibile | **sì, verificata**: due build di fila dello stesso albero danno la stessa impronta |
| cosa cambia | **niente nell'applicativo**: solo il numero e l'installer — §3 |
| prova a vuoto | `installa.ps1 -NonChiedere -Prova` sulla macchina in servizio: strada **aggiornamento**, radice `C:\Pathfinder`, **nessuna migrazione**, database non toccato, riavvio del servizio sì |
| disinstallazione | `installa.ps1 -Disinstalla -Prova` esercitata sulla stessa macchina: elenca cosa toglierebbe e **non tocca niente** — verificato dopo, servizio e variabili al loro posto |
| collaudi dal pacchetto | `servizio\test\collaudo-installazione.js` girato **dentro** `consegna\Pathfinder 2.15\`: **43 su 43** |

**La 2.14 è archiviata in `ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.14\` nella
forma che gira sulla macchina** — impronta `8a25574b…` — prima che la build
azzerasse `consegna\`.

---

## 2. Le versioni

Numerazione progressiva: una build definitiva porta **due numeri** (`2.12`),
una di prova ne porta di più (`2.12.1`).
| Ver. | Stato | Impronta | Cosa porta |
|---|---|---|---|
| **2.20.0** | **COSTRUITA, NON INSTALLATA** — 03/09 | `d10d7830…` | **Il magazzino del prodotto finito.** Il bancale è un'unità di carico, la maschera del reparto lo chiude in un gesto e ne stampa l'etichetta, chi spedisce lo trova in elenco e sulla mappa, lo spunta e il DDT si riempie. **Packing list** e **conto terzi**, dove la merce non esce ma si sposta |
| **2.19.0** | **COSTRUITA, NON INSTALLATA** — 02/09 | — | Le etichette escono dalla **stampante**: Zebra in rete sulla porta 9100, e a parlarle è il servizio. Le stampanti e il **layout dell'etichetta merce** — barre, descrizione, scadenza, peso — si configurano; chi stampa sceglie la macchina e quante copie. **L'A4 resta**, e non come ripiego di cortesia |
| **2.18.1** | costruita, non installata | — | Il minimo di Node era sbagliato e l'ha trovato la CI: `>=20` dichiarato ovunque, `better-sqlite3` 13 ne vuole 22 |
| **2.17** | **IN SERVIZIO su questa macchina dal 02/09** | `b6b24d70…` | Il limite di ritenzione esce dal codice: `LOG_RETENTION_DAYS` non cancellava niente e sei anni non li chiedeva nessuna norma. Le tre etichette dicono adesso quel che il sistema fa |
| **2.16** | in servizio il 02/09 — è la **via di ritorno** | `111d58b5…` | Il punto zero: **l'ultimo Admin non si toglie da solo** (murato nel servizio) · il registro dice **quanto** si è mosso e **chi** si è mosso, anche in blocco (voci 33, 34) · causale **`UDC`** · un difetto grave **ferma** il banco del ciclo (voce 50) · servito, l'indicatore smette di dire «Non salvato» · cinque icone che uscivano monocromatiche |
| **2.15** | in servizio dal 01/09 al 02/09 — è la **via di ritorno** | `7b812c48…` | **L'applicativo non cambia di una riga.** L'installer smette di murarsi dentro da solo (voce 75) e impara a **togliersi**: `-Disinstalla`, che prima salva e poi toglie · una radice lasciata da un tentativo fallito si riapre da sé |
| **2.14** | in servizio il 01/09 per poche ore, archiviata |  `8a25574b…` | La schermata WIP parte **dalla merce e non dal numero**: la lista di quello che è fermo in lavorazione, ordinabile e filtrabile · l'archivio degli ordini chiusi passa in **Archivio** · **un reso sbagliato si storna** · leggibilità e proporzioni delle maschere |
| **2.13** | **in servizio dal 31/08, rimossa il 01/09** — voce 74 | `cbe71802…` | La gerarchia la impone **il servizio** (voce 66) · `rinnovaPin` · il **codice di ripristino** dell'Admin · il fix di avvio della 2.12.1 riportato nel sorgente e coperto da dodici prove |
| **2.12.1** | archiviata | `4f2a9f0f…` | Il servizio **aspetta** PostgreSQL invece di arrendersi al primo no, e l'attività pianificata parte un minuto dopo l'accensione. Nata da una giornata di magazzino fermo |
| **2.12** | archiviata | `9ef94996…` | Il giro: più ODP in un percorso solo, conto di produzione **uno** · ricalibrazione della distinta · l'ubicazione si scansiona **una volta per vano** |

> ⚠️ **GLI SHA DI QUESTA TABELLA SONO CAMBIATI IL 01/09.** La riscrittura
> della storia (voce 72) ha rifatto tutti e 296 i commit di `main`. Le
> **impronte dei pacchetti** no: quelle sono i byte consegnati e non le tocca
> nessuno. **Chi avesse un clone se lo deve rifare da zero.** Il bundle della
> 2.3 in `ARCHIVIO/` non è toccato: quel ramo non è mai stato in `main`.

> **QUALE FOSSE LA VIA DI RITORNO NON SI SAPRÀ PIÙ.** Fino al 31/08 questa riga
> diceva 2.12; poi la 2.13 è stata installata senza che il documento lo
> registrasse, e `app\precedente` ha preso quel che c'era prima. Il 01/09
> `C:\Pathfinder` è stata rimossa **senza che nessuno l'avesse aperta**, e con
> lei quel `manifest.json`. **La lezione vale per la prossima macchina**: la via
> di ritorno si legge prima di installare, non prima di disinstallare, perché
> alla seconda occasione può non esserci più.
| **2.11** | archiviata | `4a8b5a6c…` | Il PIN emette una **sessione**; senza sessione le rotte `/api` non si aprono — voce 64 |
| **2.10** | archiviata | `2a70b8e9…` | Sei falle di sicurezza chiuse: `pin_hash` fuori dalle risposte, scrypt, backup che non esce dalla macchina, codici che non spezzano un gestore, ACL sui file del servizio, intestazioni |
| **2.9** | archiviata | `b3b3b8da…` | Lo stoccaggio smette di **rifiutare** e diventa assistente · matrice di incompatibilità tolta, pericolosità dentro le regole · `#dlgOverlay` |
| **2.8** | archiviata | `21c3f4b9…` | Regole di stoccaggio che **decidono**: due regole base, categoria merceologica, pericolosità, `location_attrs` (ventunesima collezione) |
| **2.7** | archiviata | `17cb722b…` | Primo giorno su **PostgreSQL** · backup `pg_dump` riletto prima di essere dichiarato buono · l'installer sa consegnare il database |
| **2.6** | archiviata | `d3865c53…` | Il servizio parla **due database** · codici in maiuscolo · interfaccia del servizio dati asincrona. Tornare a lei vuol dire tornare a SQLite: conosce `PATHFINDER_PG` ma non sa farci il backup |
| **2.5** | archiviata | `8ed505b9…` | Unità di misura al carico su 11.115 articoli · prelievo da ordine. Si porta dietro la **voce 51** |
| **2.4** | archiviata | `99fc56ba…` | Voce 45 (un ripristino non cancella più il registro) e voce 19 (l'unità dichiarata dal parser ODP — **da verificare**, §4). **Salta il numero 2.3 apposta** |
| **2.2** | archiviata | `08ce3f69…` | Cinque difetti chiusi (voci 14, 29, 30) · commit `90ef798` (era `495f38c`: la storia è stata riscritta — voce 72) |
| ~~**2.3**~~ | **RITIRATA — ha disfunzionato, ripristino d'emergenza alla 2.2** | `367d977e…` | Divideva **il collo** fra più ordini. Pacchetto e ramo git (bundle, commit `d717098` — **il bundle non è stato riscritto**: quel ramo non è mai stato in `main`) in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/`. **Non si installa e non si riprende così com'è** |
| ~~**1.8 → 2.1**~~ | archiviate dentro la 2.2 | — | 1.8 UOM · 1.9 viste giacenza · 1.10 trasferimenti dall'ODP · 1.11 terminale · 1.12 UDC · 1.13 motore di stoccaggio · 1.14 conto di produzione · 2.0 (interruttori tolti, KPI, otto difetti) · 2.1 (Code128, Admin, cruscotto, tabelle, UDC in mappa) |

**Dove stanno i byte:** `consegna\Pathfinder <ver>\` tiene **solo l'ultima
build** (`npm run build` azzera la cartella); le precedenti stanno in
`ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder <ver>\`; il deposito
`C:\Pathfinder\app\pathfinder-<ver>\` tiene gli ultimi byte installati con quel
numero.

**LA BUILD È RIPRODUCIBILE BIT PER BIT.** Ricostruendo lo stesso commit a
cinque giorni di distanza esce la stessa impronta: un pacchetto perso si
riottiene dal commit, e l'impronta è una prova di *quale codice* c'è dentro.

**GLI INTERRUTTORI `feature.*` NON ESISTONO PIÙ dalla 2.0**, tolti da 74 punti
in 12 file. Le chiavi restano scritte in `meta` e **nessuno le legge**: sono un
dato morto. Chi legge qui dentro «si accende a gennaio» o «l'interruttore è
spento» sta leggendo una riga di prima della 2.0. **Tutte le funzioni sono
attive**, e si torna indietro reinstallando il pacchetto di prima.

---

## 3. Cosa porta ogni versione recente

### 2.20 — il magazzino del prodotto finito

**Fino alla 2.19 il prodotto finito non esisteva come merce.** La produzione
registrava il *consumo* dei componenti — righe `consumo` e `chiuso` in `wip` —
e del prodotto restava una riga di testata letta dall'ODP, stampata sul
rapporto di prelievo e finita lì. Chi gestisce le spedizioni non aveva né un
elenco né una pianta di quello che era pronto a partire, e il carrello del DDT
si riempiva in un modo solo: articolo e lotto scansionati a mano, una riga per
volta.

**IL BANCALE È UN'UNITÀ DI CARICO, E NON SERVIVA UNA COLLEZIONE NUOVA.** Tre
campi facoltativi su `udc` — `kind: 'pf'`, `odp_num`, `model_code` — e tutto
il resto era già scritto: il codice che non si riusa, l'etichetta, lo
spostamento transazionale, il disegno dentro il vano sulla mappa. Assenti,
resta l'unità di carico della 1.12.

- **LA COMPOSIZIONE DEL BANCALE È UN DATO, NON UN CAMPO SU 11.197 ARTICOLI.**
  I formati veri sono una decina — EPAL a 8 × 5, mezzo bancale, il cassone — e
  scriverli articolo per articolo vorrebbe dire compilare undicimila volte la
  stessa riga: nessuno la compilerebbe. I **modelli di imballo** stanno in
  `meta.imballi`, l'articolo ne nomina uno, e da lì esce il numero di colli.
  **Il modello propone e non impone**: se il bancale vero ne porta 37 invece
  di 40, vince il bancale, e nessuno deve dire perché.
- **LA MASCHERA È DEL REPARTO, E IL REPARTO STA IN PIEDI.** Terminale da 4,3",
  guanti, due secondi di sguardo: ① articolo → ② lotto → ③ scadenza → ④ colli,
  il lettore che avanza da sé, e alla chiusura nasce l'unità, entrano le righe
  con causale **`PROD`**, e si apre subito la stampa dell'etichetta — un
  bancale senza etichetta è un bancale che nessuno può scansionare.
- **`PROD` È UNA CAUSALE SUA, E NON UN `IN` CON UNA NOTA.** Fra sei mesi la
  domanda «cosa ha versato la produzione» si fa filtrando una riga; un
  posizionamento con una nota non si filtra.
- **L'ORDINE DI PRODUZIONE È FACOLTATIVO**, per decisione: chi imballa non si
  ferma perché non ha il numero sotto mano. Il conto di produzione non è stato
  toccato — la resa e il confronto fra prodotto e consumato restano fuori.
- **UN BANCALE MISTO PASSA, E L'ETICHETTA NON INVENTA NIENTE.** Di norma un
  bancale porta un articolo e un lotto soli; se ne porta due la maschera lo
  dice — «misto — n partite» — e va avanti. Sull'etichetta i campi della merce
  restano **vuoti**: scriverci il lotto della prima riga sarebbe una bugia
  incollata al legno. Il dettaglio lo porta la packing list.
- **L'ETICHETTA DEL BANCALE È IL TERZO TIPO**, con un catalogo di campi suo e
  un layout suo in `meta.labelLayoutPf` — 70 mm sugli 80 del supporto vero.
  Quella della merce identifica una **riga di giacenza** (`item_key`), questa
  identifica il **bancale** (`udc_id`), che è l'oggetto che il muletto sposta
  e che il DDT nomina. La via su A4 resta, come per le altre due.
- **LA VISTA GRAFICA NON È UNA MAPPA NUOVA.** È la mappa, aperta sulla zona di
  prodotto finito, col filtro acceso: i bancali dentro il vano si tingono
  dello stato che hanno — pronto, impegnato su un DDT, spedito — e la legenda
  lo scrive. Una seconda pianta da tenere allineata alle zone sarebbe una
  seconda verità sullo stesso magazzino. **Il colore non è mai solo**: il
  titolo della casella porta lo stato in lettere.
- **DAL BANCALE AL DDT SI PASSA CON UNA SPUNTA.** Il bancale si carica intero,
  coi soli colli che nessun documento pendente ha già impegnato; una riga che
  non si può prendere si salta e il riscontro dice quale e perché. Il carrello
  resta di `spedizioni.ts`: la scelta dei colli e il conto delle UM erano già
  scritti lì, e una seconda copia sarebbe la seconda verità su come nasce una
  riga di DDT.
- **VUOTO E SPEDITO SONO DUE FATTI DIVERSI.** Un bancale svuotato in magazzino
  è un pallet libero; uno svuotato da un DDT è merce che sta su un camion.
  All'evasione i bancali del documento passano a `shipped`, e l'elenco li
  mostra diversi.
- **LA PACKING LIST NON È UNA COLLEZIONE NUOVA**: è un secondo modo di
  stampare lo stesso documento archiviato. Un bancale per blocco, e sotto le
  sue righe — è il foglio di chi scarica il camion, che cerca il codice letto
  sull'etichetta del pallet. **Il DDT resta a pagina sola** — accompagna il
  trasporto — **la packing list scorre**, perché dieci bancali non stanno in
  un foglio. Il peso lordo somma le tare al netto e **resta vuoto dove le
  unità non si sommano**: un lordo inventato finisce in bolla.
- **IL CONTO TERZI NON SCARICA: SPOSTA.** Una causale marcata «la merce si
  sposta» accompagna merce che resta nostra: all'evasione i bancali cambiano
  ubicazione e vanno nel vano del sito terzista, che sta già sulla mappa, con
  `/api/op/moveUdc` — transazionale, una riga di registro per partita, e il
  rifiuto se nel vano d'arrivo la stessa chiave sta già fuori dall'unità. **Le
  causali già salvate non cambiano da sole**: la spunta si mette una volta.

> **IL CAMPO CHE NON ARRIVAVA A DATABASE, E L'HA TROVATO IL BANCO.**
> `dest_location` si scriveva a video e non compariva nel documento:
> `savePendingOutbound` e `updatePendingDoc` ricostruiscono il record **campo
> per campo**, come `rigaDocumento` per le righe, e ciò che non è nominato lì
> si perde **in silenzio**. È la trappola di §7 pagata una seconda volta, su
> un altro record. E lo snapshot della maschera di correzione non copiava la
> causale, quindi il campo non sarebbe mai comparso: due difetti in fila sullo
> stesso dato, e nessuno dei due dava errore.

**Quel che questo lavoro NON fa**: non tocca il conto di produzione (la resa
resta fuori), non estende il Code128 a GS1-128 (voce 24), non cambia le regole
di stoccaggio — una zona di prodotto finito non è una regola, è un posto.

### 2.19 — le etichette escono dalla stampante

**Il vincolo che decide tutto il resto: un browser non apre un socket TCP.**
Non c'è un'API che lo permetta, nemmeno verso un indirizzo della rete locale,
e la porta 9100 di una Zebra vuole esattamente quello. Le altre due strade —
Zebra Browser Print, un programma da installare su ogni macchina, o un driver
di stampa — lasciano scoperto l'**MC9400**, che è Android e dove l'applicativo
è una pagina. **A parlare alla stampante è quindi il servizio**, che c'è già,
è già l'arbitro di §8, e serve la scrivania e il terminale con lo stesso
codice. Zero dipendenze nuove: `net` e `dns` sono moduli di Node.

**L'indirizzo non arriva mai dalla richiesta.** Il client manda un
`printer_id` e la chiave di un record; host e porta si leggono da
`meta.printers`. Senza questo, la rotta sarebbe il modo di scrivere byte
arbitrari su qualunque `host:porta` raggiungibile dal server, con la
credenziale di un operatore qualsiasi. E siccome `meta` la scrive chiunque
abbia una sessione — il guardiano dei ruoli difende `operators`, non `meta` —
di quel record **non ci si fida comunque**: la porta sta in un elenco chiuso
(6101, 9100-9103; senza, una «stampante» a `127.0.0.1:5432` fa parlare il
servizio col proprio PostgreSQL) e l'indirizzo **si risolve prima di
connettersi** e deve essere privato, o il servizio diventa un ponte verso
l'esterno.

**L'etichetta la costruisce il servizio, non il browser.** In regime GMP
un'etichetta è un documento, e un documento costruito dal client si falsifica
scrivendo in una console: il servizio rilegge la riga da database e scrive lui
lo ZPL. Le barre le disegna il firmware con `^BC` — `modules/code128.ts` resta
quello dell'A4 e non viene duplicato, la cifra di controllo non si riscrive
due volte, e quel che deve coincidere fra le due strade è la sola stringa
codificata: `item_key` o `udc_id`.

**«INVIATA» NON È «STAMPATA», ED È IL PUNTO PIÙ PERICOLOSO DELLA FUNZIONE.**
La porta 9100 accetta i byte e chiude: carta finita, testina aperta e nastro
esaurito **passano tutti come successo**. Chiamarlo «stampata» vorrebbe dire
che al primo rotolo finito il magazzino continua a creare pallet che nessuno
può scansionare — che è esattamente ciò che §8 dice di un UDC senza etichetta.
Quindi il servizio manda, poi **chiede `~HQES`**, e la maschera dice quale dei
due fatti sta mostrando: verde se la macchina ha risposto e sta bene, **rosso
se ha risposto con un errore** (inviata, ma l'etichetta non è uscita), giallo
se non ha risposto affatto — che non è un guasto, è un server di stampa che
quel comando non lo conosce, ma non è nemmeno una conferma.

**Il layout è un dato, e i millimetri si vedono mentre si scelgono.** Otto
campi, ognuno con altezza in mm, allineamento e righe di testo; il totale sta
in fondo alla scheda confrontato con l'altezza del rotolo. Quello di serie è
tarato sul supporto vero — **adesive staccate 100 × 80 su testina a 203 dpi**,
la serie ZD200 del magazzino: occupa **68,5 mm degli 80**, e gli 11,5 che
restano non sono spazio sprecato. Su un'etichetta staccata il registro balla
di un millimetro o due a ogni avanzamento, e un campo a filo del bordo è un
campo che prima o poi si taglia. I corpi sono grandi perché chi legge ha i
guanti: il peso, che è il numero cercato per primo, ha il corpo del codice
articolo. Non sono le misure dell'etichetta su A4 (100 × 60), e non devono
esserlo — quella è un ripiego su foglio e non deve imitare il rotolo. Un layout più alto
del supporto **il servizio lo rifiuta, non lo tronca**: un'etichetta troncata
esce con l'aria di essere giusta e le manca l'ultima riga, che nel layout di
serie è il peso, e chi la incolla non ha modo di accorgersene.

- **Il «peso» è la quantità in UM, e si intitola per quello che è**: su KG e
  GR la riga dice «Peso», su PZ, MT e LT dice «Quantità». Il numero è lo
  stesso campo — `qty_uom` — ma un'etichetta che chiama peso dei pezzi manda
  fuori strada chi la legge sei mesi dopo. Senza unità la riga resta vuota:
  una parte dell'anagrafica non ce l'ha ancora (voce 52), e un peso senza
  unità non è un peso.
- **L'ubicazione nasce spenta e si intitola da sé** — «invecchia». §8: un
  pallet si sposta, e quel che è stampato resta incollato alla merce a dire
  una cosa che non è più vera.
- **L'etichetta dell'unità di carico non ha un layout, ed è una decisione.**
  Un pallet porta N righe di N articoli diversi: descrizione, scadenza e peso
  non sono nemmeno *definiti* per un'unità di carico. Quel che si configura è
  il **supporto**, che sta sulla stampante.
- **La dimensione X minima è un rifiuto, non un consiglio.** Sotto 0,25 mm le
  barre si fondono al primo calo di calore, e il modulo minimo sale con la
  testina — 2 punti a 203 dpi, 3 a 300. Un codice che non ci sta a quella
  larghezza **non si stampa**: §8 dice già per l'A4 che stampare barre che
  nessun lettore legge è peggio che non stamparle.
- **Quattro caratteri romperebbero il comando** — `^ ~ \ _`. Una descrizione
  che ne porta uno non stampa un carattere storto: **spezza il campo**, e da
  lì in poi la testina legge come comandi i byte del testo. Si risolve con
  `^FH` e gli escape esadecimali, che non tolgono e non sostituiscono niente:
  un'etichetta GMP che riscrive in silenzio il dato che porta è peggio di una
  che non esce.
- **La stampante si ricorda, le copie no.** Chi ha scelto una stampante ci sta
  accanto per tutto il turno, e il ricordo sta nel `localStorage` di quel
  browser — a database vorrebbe dire che l'ultimo terminale che sceglie decide
  per tutti. Le copie tornano sempre a 1: un'eccezione che si ricorda smette
  di essere un'eccezione, e sei etichette uguali attaccate a merce diversa
  sono un difetto peggiore di sei etichette buttate. Tetto a 50 per invio, che
  non è un limite tecnico ma un dito che scivola.
- **Una stampante alla volta**: la 9100 accetta una connessione per volta, e
  con più terminali sulla stessa macchina le richieste si mettono in fila —
  stessa disciplina delle transazioni di §8, su una risorsa che non è il
  database. Stampanti diverse restano parallele.
- **Pathfinder non manda mai `^MN`, `^MM`, `^MD`, `^JUS`**: supporto, calore,
  spellicolatore e salvataggio permanente sono configurazione della MACCHINA,
  si fanno col pannello e valgono per tutti. Il giorno che l'applicativo li
  spedisce a ogni etichetta, l'applicativo possiede la configurazione delle
  stampanti.
- **Chi ha stampato cosa va nel registro del servizio, non in `mov_log`**: una
  ristampa non muove merce.

**Il banco alza una finta Zebra.** Una stampante ZPL è un server TCP che
ingoia byte: `server/test/collaudo-stampa.js` ne accende una sulla 9100 e
legge quel che le arriva — **78 prove**, fra cui le tre che contano davvero:
con la carta finita l'invio riesce lo stesso, lo stato lo dice, e cinque
richieste insieme escono tutte e cinque. Il conto dei millimetri è scritto due
volte — client e servizio — e `test/stampanti.test.js` importa il modulo del
servizio per confrontarli riga per riga: due copie che divergono in silenzio
sono due verità.

### 2.17 — il limite di ritenzione non c'era

**`LOG_RETENTION_DAYS = 2192` È USCITO DAL CODICE.** Sei anni esatti, in una
costante, e **non cancellavano niente**: la purga è uscita con la 2.1 (§8), e da
allora quel numero finiva in **tre etichette a video** — il badge della scheda
Dati, il paragrafo sotto, e la testata del registro movimenti.

Il paragrafo si contraddiceva dentro sé stesso, in quattro righe: «**Nessun
record viene mai cancellato**, né automaticamente né a mano. Il registro
movimenti è conservato per **2192 giorni (6 anni)**…». Chi legge non sa quale
delle due credere, e la risposta era la prima. **L'etichetta sottodichiarava il
sistema**: chi le avesse creduto, a sette anni dal fatto, avrebbe cercato un
movimento convinto che non ci fosse più — e invece c'è.

**E sei anni non li chiede nessuna norma.** Cercate il 02/09:

| Regime | Quanto | Su cosa |
|---|---|---|
| GMP medicinali (EudraLex Vol. 4, cap. 4) | scadenza del lotto **+ 1 anno**, o **5 anni** dalla certificazione del QP — il maggiore | documentazione di lotto |
| Legge alimentare (Reg. 178/2002 art. 18) | **nessun minimo**. La guida della Commissione raccomanda **5 anni**; shelf-life > 5 anni → *+ 6 mesi*; deperibili con TMC < 3 mesi → **6 mesi** | rintracciabilità |
| **Art. 2220 c.c.** | **10 anni** dall'ultima registrazione | scritture, fatture, lettere — **e i DDT**, che Pathfinder emette |
| GMP Annex 11 | quanto il record che documenta | audit trail |

Sei stava **in mezzo fra 5 e 10, senza fonte**. Il regime primario qui è quello
alimentare, ma l'applicativo archivia DDT: il numero che governerebbe davvero è
**10**, non 6. **Per quanto si tenga il registro lo dice la SOP** — e a quel
punto è una politica di backup e di database, non una costante compilata dentro
un pacchetto.

Adesso le etichette dicono quel che il codice fa: «**nessuna cancellazione**» e
«**non ha una scadenza dentro l'applicativo**». Tolti anche due import morti —
`LOG_RETENTION_DAYS` in `app.ts` e `LOG_RETENTION_MS` in `configDati.ts` — che
nessuno usava.

**Non è stato toccato `documenti/IT-TECH-SHEET.md`**, che in due punti dice
ancora «tenuta a sei anni»: è un documento controllato, REP-IT-001 **rev01**, e
cambiarne il contenuto senza alzare la revisione è a sua volta un difetto di
gestione documentale. Sta nella **voce 82**.

**Installata il 02/09.** Impronta `b6b24d70…`, 1.903.362 byte in 4 file. Il
bundle servito è quello del pacchetto, la porta risponde **401** senza sessione,
e `app\precedente` porta la 2.16.

### 2.16 — il punto zero

**L'ULTIMO ADMIN NON SI TOGLIE DA SOLO, E ADESSO LO DICE IL SERVIZIO.** §8 lo
scriveva dalla 2.13, ma la regola viveva soltanto in `configOperatori.ts`: il
servizio chiedeva «sei Admin?» e nient'altro, quindi una `PATCH` mandata da un
Admin che si retrocede passava. È **la stessa falla della voce 66**, un piano
più in là. **Non è un fastidio, è un vicolo cieco**: senza Admin la
Configurazione non si apre, il codice di ripristino pretende `role === 'admin'`
e la finestra del primo avvio guarda i PIN, non le cariche — resterebbe la sola
chiave di macchina. **Visto succedere**: rimettendo il difetto, il banco alza
undici prove rosse e dalla prima `PATCH` in poi ogni cosa risponde 403,
compresa la ricreazione del primo Admin.

*Come si controlla.* Non si indovina la forma della richiesta: **si simula**.
Le mutazioni sull'anagrafica — `POST`, `PUT`, `PATCH`, `DELETE`, `bulk`,
`clear`, `deleteWhere`, ogni operazione dentro una `/tx` — si riducono a
quattro verbi, si applicano a una copia dell'anagrafica e si guarda com'è
rimasta. **Il reset dei dati resta permesso**, e deve: svuota tutto, nessuno
resta con un PIN, e la finestra del primo avvio si riapre da sé. La chiave di
macchina passa, perché §8 la dichiara uscita di servizio. Otto prove nuove al
banco della gerarchia (32 → **40**).

**IL REGISTRO NON DICE PIÙ NUMERI CHE SI CONTRADDICONO — voce 33.** Due domande
diverse, che erano diventate la stessa e sbagliata.

1. **Quanto è cambiata la riga.** `qty_delta` poteva contraddire i propri
   estremi: un `PICK` scriveva `null` fra `before 10` e `after 9`. Adesso, se i
   due estremi ci sono, la variazione è **la loro differenza**, calcolata al
   punto di scrittura: l'aritmetica batte il chiamante. `null` resta il «non si
   sa» dei movimenti storici e vale solo se manca un estremo.
2. **Quanti colli hanno cambiato posto.** *Non è la stessa cosa*, ed è il pezzo
   che mancava. Un trasferimento di riga intera lascia la quantità dov'era e
   cambia il vano: la variazione è **0** e i colli mossi sono **tutti**. Chi
   leggeva `Math.abs(qty_delta)` — KPI, cruscotto, registro attività —
   **contava zero**. Misurato sul dump del 31/08: **22 trasferimenti veri**,
   fino a 26 colli l'uno, valevano zero nei conti.

Le due regole stanno in **`src/modules/registro.ts`**, modulo puro nuovo, con
tredici prove in `registro-completo.test.js`.

**LA MERCE SI NOMINA ANCHE QUANDO SI MUOVE IN BLOCCO — voce 34.** La voce
chiedeva chi scrivesse `EDIT` e `MOVE` con articolo e lotto vuoti. **Risposta
trovata nel dump del 31/08**, che ne porta due con la nota in chiaro: «Unità di
carico creata: UDC-000001» e «Unità di carico UDC-000001 — 0 righe · trascinata
sulla mappa». Sono **operazioni sull'unità di carico scritte nel registro della
merce**, e hanno la forma esatta della voce 34 — un `EDIT` e un `MOVE` sullo
stesso vano nello stesso minuto.

Due conseguenze, e la seconda è quella che conta.

- Il contenitore ha adesso **una causale sua, `UDC`**: nasce, si sposta e si
  chiude senza fingersi merce. `MOV_LABELS` la chiama «Unità di carico», e
  `registro-completo.test.js` la mette fra quelle che non muovono merce.
- **Lo spostamento di un'unità scriveva UNA riga sola, e non nominava niente.**
  N partite cambiavano vano e il registro non diceva quali: non è un'etichetta
  storta, è **la firma GMP che manca**. Adesso il servizio scrive **una riga per
  ogni partita** — articolo, lotto, da dove a dove, quanti colli, chi ha
  firmato — dentro la stessa transazione, dove le righe si conoscono davvero.
  Lo stesso da file, dove non c'è un servizio a cui chiederlo. Due prove nuove
  nel collaudo del servizio (139 → **141**).

E la firma di quella riga è **una persona**: prima ripiegava su `SERVIZIO`,
adesso ripiega sulla sessione e `SERVIZIO` resta alla sola chiave di macchina.

**UN DIFETTO GRAVE TINGE DI ROSSO LA CORSA — voce 50.** `difetto()` scriveva la
riga nel verbale e la prova risultava passata. **Visto di nuovo il 01/09**: il
banco del ciclo ha alzato `Q1` — «0,75 KG non si ritrovano da nessuna parte» —
e vitest ha detto «47 passed». Adesso `gira.cjs` esce **1**.

*Quali severità fermano la corsa: solo `grave`.* `dato` no, e non è pigrizia:
dice che l'anagrafica è incompleta, non che il codice sbaglia, e finché le voci
5 e 58 sono aperte tingerebbe di rosso ogni giro per sempre. **Si guarda l'ora,
non l'elenco**: `difetti.json` non si svuota mai e le righe vecchie sono
memoria, quindi rossa la fanno solo quelle della corsa in corso.

**SERVITO, «NON SALVATO» ERA UNA BUGIA ROSSA.** `_touchMeta` alza
`unsavedChanges` a ogni mutazione, e **da quando il salvataggio a mano non c'è
più (2.1) nessuno lo riabbassa**: su una macchina servita l'indicatore in barra
restava rosso per sempre e diceva a chi lavora che la merce appena scansionata
poteva perdersi. Non è vero — la riga è in PostgreSQL prima che la chiamata
torni. Servito dice adesso **«In linea»**, e la Dashboard **«Ultima
scrittura»** invece di «Ultimo salvataggio». Da file non cambia niente, perché
lì il checkpoint esiste davvero.

**CINQUE ICONE USCIVANO MONOCROMATICHE.** `✏️ ⚠️ ⚙️ ℹ️ ♻️` hanno presentazione
**testuale** di serie: scritti nudi il browser li disegna come glifi di testo.
La matita di «Modifica» usciva larga 14px contro i 19,2 della forma a icona, e
**su schermo si leggeva come un trattino** — un pulsante che non dice più cosa
fa. L'avviso usciva come un triangolo grigio invece del segnale giallo, e in
GMP un avviso che non si legge come avviso è un avviso che non c'è. **101
selettori `U+FE0F`** aggiunti in 27 file, misurato in pagina.

**Le frecce restano nude, e non è una dimenticanza**: `↔ ▶ ↩` marcano il tipo
di riga dentro tabelle dense, e da icone diventerebbero colorate e più pesanti
di quel che accompagnano. Lo tiene `test/emojiVestite.test.js`.

**Il banco della gerarchia va da 32 a 40 prove; il collaudo del servizio da 139
a 141; `npm test` da 42 a 43 file.** Le due voci rosse del banco del ciclo sono
chiuse — 70 e 71 — e le sue 47 prove sono tutte verdi.

**Installata il 02/09.** Impronta `111d58b5…`, 1.903.224 byte in 4 file. Il
bundle servito è quello del pacchetto, la porta risponde **401** senza sessione,
e `app\precedente` porta la 2.15.

### 2.15 — l'installer impara a togliersi, e smette di murarsi dentro

**Installata il 01/09 notte, in servizio fino al 02/09.** Impronta
`7b812c48…`, 1.901.483 byte in 4 file, riproducibile — due build di fila dello stesso
albero danno la stessa impronta.

**L'APPLICATIVO NON CAMBIA DI UNA RIGA.** Cambia solo il numero, e cambia
l'installer. È la prima versione di questo progetto che nasce da una
manutenzione della consegna e non da una richiesta di magazzino: la 2.14 è
stata installata su una macchina rifatta da zero, e la prima installazione —
quella strada che nessuno esercitava da mesi — si è rotta due volte.

**L'INSTALLER SI CHIUDEVA LA PORTA IN FACCIA DA SOLO.** In fondo al passo del
servizio stringeva i permessi della radice con un `icacls` solo,
`/inheritance:r` e `/T` nella stessa riga: quella coppia scende su ogni figlio
e gli toglie gli ACE ereditati, mentre i `/grant` restano sull'oggetto
nominato. Restano file con l'**elenco vuoto**, e un elenco vuoto nega tutto —
anche a un Amministratore, anche solo per leggere di chi è il file. Il passo
dopo doveva lanciare `installa-versione.ps1` **da quella cartella**, e trovava
«Accesso al percorso negato» che PowerShell segnala come comando non trovato.
**E `icacls` usciva con zero**, quindi la riga a schermo diceva «Permessi
applicati» in verde.

La correzione è in tre pezzi, e nessuno dei tre è la stessa cosa:

- **due gesti invece di uno** — l'elenco si scrive sulla sola radice, poi si
  spinge in basso con `/reset` **sui figli**, che dà a ognuno l'elenco
  ereditato dal padre. `/reset` sulla radice no: la rimetterebbe a ereditare da
  `C:\`, cioè disferebbe la blindatura;
- **la blindatura per ultima**, dopo l'applicativo. Così è l'ultimo gesto che
  tocca il disco, copre anche `app\` — che prima restava fuori perché non
  esisteva ancora — e la Verifica passa **dopo** di lei;
- **una guardia che apre un file davvero.** `Test-Path` risponde `True` anche
  su un file murato, ed è così che il difetto è passato per mesi.

> **Era anche la spiegazione di `C:\Pathfinder_block`**, la cartella che il
> 31/08 notte non si lasciava cancellare in nessun modo: stessa firma esatta —
> cartella sana, file impenetrabili, ACL illeggibili. Non era OneDrive né un
> antivirus. Era questa riga, a un'installazione di mesi prima. Voce 75.

**E L'INSTALLER ADESSO SA ANCHE TOGLIERSI.** Fino alla 2.14 disinstallare era
un elenco di gesti a mano — fermare l'attività, togliere la regola del
firewall, cancellare cinque variabili, cancellare la cartella — e il 31/08 quel
lavoro è costato una serata, con quarantacinque movimenti GMP salvati per un
soffio perché qualcuno si è ricordato di copiarli prima.

```powershell
.\installa.ps1 -Disinstalla -Prova              # dice cosa toglierebbe
.\installa.ps1 -Disinstalla                     # lo toglie
.\installa.ps1 -Disinstalla -AncheIlDatabase    # e toglie anche il database
```

**L'ordine è quello del danno crescente, e non è un dettaglio.** Prima si
**salva**: una copia fresca chiesta al servizio ancora acceso, poi tutta la
cartella `backup\` portata **fuori dalla radice**, sul Desktop. Se il
salvataggio non riesce, o riesce e non ci finisce dentro niente, **si ferma**.
Poi cadono le attività pianificate, la regola del firewall, il database se
qualcuno l'ha chiesto, le variabili, e per ultima la radice.

**Il database non cade da solo**, e nemmeno con una spunta: vuole
`-AncheIlDatabase`, e allora la parola da digitare non è più `DISINSTALLA` ma
**il nome del database**. Lo toglie `prepara-postgres.ps1 -Rimuovi`, cioè lo
script che quel database lo crea — ogni script disfa quello che fa — e cade
**prima** della radice: una cartella tolta con un database vivo si rifà in
dieci minuti, il contrario non si rifà affatto.

**Tre istruzioni, tre chiamate**: si staccano le connessioni aperte, poi
`DROP DATABASE`, poi `DROP ROLE`. `psql -c "a; b;"` avvolgerebbe tutto in una
transazione, e `DROP DATABASE` dentro una transazione non si può fare — costato
un giro il 01/09, a mano.

**Una radice lasciata da un tentativo fallito adesso si riapre da sé.** Il
01/09 un'installazione si era fermata a metà, e quella dopo è morta su
`Copy-Item : Accesso al percorso 'lib\db.js' negato`: i permessi erano già
stretti, e chi installa non ha modo di saperlo — vede solo un rifiuto su un
file di cui non ha mai sentito parlare. Ora l'installer se ne accorge, riapre
(`takeown` + `icacls /reset`) e lo dice. Cancellare no: quella è una decisione
di chi disinstalla.

**Un difetto l'ha trovato la prova a vuoto girando, non la lettura.**
L'inventario della disinstallazione scriveva `attivita: nessuna` mentre il
servizio girava: senza privilegi le attività di SYSTEM non si vedono, e
l'inventario si fa prima di elevare — apposta, così chi legge sa cosa sta per
succedere. Adesso quella riga dice che non è una misura, invece di mentire.

**Le prove: 33 → 43.** Otto nuove sulla disinstallazione — che il database non
cada senza chiederlo per nome, che si salvi prima di togliere, che il
salvataggio non finisca dentro la cartella che sta per sparire, che un
salvataggio vuoto fermi tutto. E **una vecchia allargata**: quella che verifica
che la password del superuser non passi per la riga di comando guardava un solo
blocco di elevazione e, arrivato il secondo, aveva smesso di guardare qualcosa
**senza dirlo** — la fetta usciva vuota e il confronto passava per caso. Ora le
raccoglie tutte e stampa quante ne ha esaminate.

**Cosa resta fuori dalla prova**: la corsa vera della disinstallazione. Le due
strade a vuoto sono state eseguite sulla macchina in servizio e non hanno
toccato niente; quella che cancella la lancia una persona, una volta sola, e
non c'è modo di provarla senza una macchina da perdere.

### 2.14 — la schermata WIP parte dalla merce, e un reso sbagliato si storna

**Installata il 01/09, in servizio per poche ore, poi archiviata.** Provata
al banco dal pacchetto. Impronta `8a25574b…`, 1.901.483 byte in 4 file.

Nasce da una richiesta di Andrea del 31/08: aprire il banco della 2.13,
provare al banco prelievo automatico e WIP, guardare la leggibilità dei campi
e le proporzioni delle maschere, tagliare il testo didascalico, e rifare la
struttura della schermata WIP — «non mi piace come vengono visualizzati
adesso [gli ODP archiviati], alla lunga non è efficiente».

**LA SCHERMATA WIP SI ENTRAVA PER NUMERO D'ORDINE, E LA DOMANDA È IL
CONTRARIO.** Fino alla 2.13 in cima c'erano tre righe di pulsantini — i conti
aperti, quelli serviti da un giro, gli archiviati — e ognuna si troncava a
otto. Per vedere che cosa ci fosse nel vano bisognava aprire gli ordini uno
per uno, e chi il numero non ce l'aveva in testa non arrivava alla merce. Col
magazzino vero davanti, la prima riga di merce cominciava **sotto il settanta
per cento dell'altezza dello schermo**: sopra c'erano quattro riquadri di
prosa.

Adesso il primo elenco è **quello che è fermo di là**: una riga per ogni
coppia ORDINE × ARTICOLO#LOTTO che ha ancora qualcosa fuori, con articolo,
descrizione, lotto, ordine, colli, quantità e da quando. Si ordina e si filtra
come ogni altra tabella (§8, `modules/tabella.ts`), e i due gesti — ↩ rendi,
🔥 consuma — stanno **sulla riga**. La regola è pura e sta in `inLavorazione`,
`modules/wip.ts`.

Sotto, un elenco compatto dei **conti aperti**: lì si chiude un ordine, si
stampa il rendiconto, si corregge un reso. **Chiudere è un gesto sull'ordine,
non sulla merce**, e sta dove sta l'ordine.

**L'ARCHIVIO È USCITO DA QUI.** Gli ordini chiusi sono il quinto genere di
**Archivio**, accanto a DDT, verbali, cartellini NC e report di prelievo:
stessa tabella che si ordina, si filtra e si cerca per data, e il rendiconto
si ristampa da lì. Un archivio che cresce ogni giorno e si sfoglia con gli
occhi non è un archivio. Dalla WIP ci si arriva con un pulsante che apre
Archivio già filtrato sul genere.

**UN ORDINE A RESIDUO ZERO ERA INVISIBILE, ED È UN BUCO DEL FLUSSO.**
`ordiniWipAperti` filtra su `residuo !== 0`: un ordine rientrato del tutto e
non ancora archiviato spariva da ogni elenco e si poteva riprendere solo
digitandone il numero — mentre restava vivo, e il file di produzione lo poteva
ricaricare. Sul banco ce n'era uno (l'ordine `123`) e nessuno l'aveva mai
notato. Adesso l'elenco dei conti aperti lo mostra con la sua etichetta,
**«tutto rientrato — resta da chiudere»**, e il pulsante che lo chiude.

**UN RESO SBAGLIATO SI STORNA, E NON SI CANCELLA.** Un reso finito nel vano
sbagliato, o fatto su una riga per un'altra, fin qui non aveva una via
d'uscita: la merce era a scaffale sotto una causale che diceva una cosa non
vera, e il conto era calato di colli che in reparto c'erano ancora. Si usciva
riposizionando a mano da Movimenta, e il conto restava storto lo stesso.

La maschera **elenca i resi** dell'ordine — quando, che cosa, quanto, dove è
andato, chi ha firmato — e su ognuno dice se si può stornare e perché no. Lo
storno riprende la merce **da dove era andata e con gli stessi colli**, la
riporta nel vano, e scrive un `in` che **nomina il reso che annulla**. Il reso
resta dov'è: chi legge il conto fra sei mesi vede il gesto e il ripensamento,
che è quello che è successo. Su un registro che non si cancella mai, cancellare è
la sola cosa che non si può fare — §8, «nessuna cancellazione di record».

Quattro cose che il codice ha dovuto imparare a scrivere, e che prima non
scriveva:

- **`reso_a`** — dove la merce è rientrata. Senza, lo storno doveva appaiare
  due righe del registro per data e sperare.
- **`reso_packs`** — **quali colli sono rientrati**, che non sono sempre
  quelli usciti dal vano: due sacchi da 20 escono e ne risale uno aperto con
  dentro 5, e a scaffale ci sono `[20, 5]` mentre il vano ne aveva persi
  `[20, 20]`. Sulle righe scritte prima, quando quel che è uscito pesa quanto
  quel che è rientrato i due elenchi sono lo stesso e si deducono; quando non
  torna, **lo storno si rifiuta e dice perché** invece di indovinare.
- **`reso_di`** — sul `consumo` che nasce insieme a un reso parziale, il nome
  del reso che l'ha fatto.
- **`storno_di`** — sul movimento di storno, il nome del reso che annulla.

Nessuno dei quattro tocca lo schema: la collezione `wip` indicizza quattro
colonne e il resto vive nel JSON. **Nessuna migrazione.**

**IL VUOTO DI UNA CONFEZIONE APERTA NON SI STORNA, ed è una decisione.** Se
un sacco è sceso pieno da 20 e ne è risalito uno con dentro 5, i 15 che
mancano sono finiti nel prodotto: rimetterli nel vano scriverebbe a magazzino
merce che non esiste. Lo storno riporta indietro **quello che è rientrato**, e
la maschera e la conferma lo dicono tutte e due prima di premere.

**Provato al banco, sui numeri, e non a vista.** Su una copia del magazzino
(`banco\db\ui.db`, dal `pristino.db` del 19/08) con ODP generati dalle
giacenze vere — `banco\genera-odp-wip.cjs`, nuovo, che i lotti li **legge dal
database** invece di scriverli fissi come faceva quello della 2.12. Due strade
esercitate capo a fondo:
| | prima | dopo il reso | dopo lo storno |
|---|---|---|---|
| reso intero — vano | 8 coll. · 160 KG | 6 · 120 | **8 · 160** |
| reso intero — scaffale | 55 · 1.100 | 57 · 1.140 | **55 · 1.100** |
| reso parziale — vano | 1 coll. · 25 KG `[25]` | vuoto | **1 · 10 `[10]`** |
| reso parziale — scaffale | 1 · 25 `[25]` | 2 · 35 `[25,10]` | **1 · 25 `[25]`** |

Sul parziale il conto chiude a 25 − 10 − 15 + 10 = **10 KG**, che è quello che
il vano ha davvero: i 15 restano a consumo, come devono.

**QUATTRO COSE CHE SI VEDEVANO SOLO GUARDANDO.** Sono uscite dal banco, non
dalla lettura:

1. **Il campo «Quantità da produrre» era largo 45 px** — 21 utili, e ce ne
   volevano 53 per leggere `380.25`. Scritto `w-28`, che con `--spacing` a un
   decimo di rem fa **2,8rem**, non i 7rem della scala di serie di Tailwind:
   è la trappola dei decimi (§8), e `w-28` era l'**unica** utility numerica di
   larghezza in tutto lo strato delle viste. Sul terminale a 480 px il campo
   scendeva a 31 px. Ora `w-[120px] shrink-0`.
2. **La scheda WIP non si raggiungeva dal terminale.** `.prel-tabs` era un
   flex senza `wrap` e senza scorrimento: a 480 px le quattro schede
   chiedevano 531 px e la quarta — WIP — finiva oltre il bordo. **Una scheda
   che non si vede è una funzione che non esiste.**
3. **I due gesti finivano fuori schermo.** Con sette colonne la tabella nuova
   sfondava i 480 px: per rendere un collo bisognava prima scorrere di lato,
   che con un guanto e un lettore in mano non è un gesto. Sotto i 620 px
   escono la data e la descrizione — il codice e il lotto identificano già la
   riga — e tutto sta dentro: misurato, 396 px su 396.
4. **Due parole uguali su due gesti diversi.** «Chiudi» dell'ordine stava due
   centimetri sopra «✕ Chiudi» della schermata, e nella conferma dello storno
   c'erano un «Annulla» che non fa niente e un «Annulla il reso» che muove
   merce. Ora **«Chiudi e archivia»** e **«Storna il reso»**.

**IL TESTO DIDASCALICO È STATO TAGLIATO DOVE SI RIPETEVA.** La maschera del
reso è passata da sette righe di spiegazione a due e si è dimezzata in
altezza; la testata della WIP da quattro riquadri a una riga; l'avviso delle
righe orfane nasce chiuso; e sulla schermata del giro la frase «vuoto = quella
dell'ordine» compare **sulla prima scheda e basta** — con cinque ordini
caricati si ripeteva cinque volte, e cinque copie della stessa istruzione non
insegnano cinque volte: si smette di leggerle tutte, compresa la prima.

**Una maschera sopra un'altra adesso si vede che è sopra**: la scelta dei
colli si apre dentro il reso, e col velo al 32% le due finestre erano
ugualmente accese. Il velo della seconda è più fitto.

**Cosa resta fuori dalla prova**: la corsia vera, con un operatore e un
terminale in mano.


### 2.13 — chi autorizza lo decide il servizio, e l'Admin ha una via di fuga

**Installata il 31/08, in servizio fino al 01/09** — poi la macchina è stata
riportata a zero (voce 74). Impronta `cbe71802…`, 1.882.735 byte in 4 file.

**LA GERARCHIA SCENDE NEL SERVIZIO, ed è la voce 66.** Fino alla 2.12 le
cariche vivevano nel client: la maschera chiedeva il PIN di un Team Leader e
poi mandava una `PATCH` come tutte le altre. Chi non passava dalla maschera
**non incontrava nessuna gerarchia** — bastava una sessione qualunque, cioè il
PIN del più giovane degli operatori, e una riga di `curl`, per scriversi
`role: "admin"` addosso. La 2.11 aveva chiuso la porta a chi non ha un PIN;
la 2.13 chiude l'anagrafica a chi ne ha uno e non ha la carica.

Tre eccezioni, e sono sempre le stesse tre: il **primo avvio** (il primo Admin
va creato, e non c'è ancora nessuno che possa autorizzarlo), il **token di
macchina** (backup, installer e migrazioni non hanno un PIN, hanno una
chiave), e il **rinnovo del PIN**, che non passa di lì perché ha una rotta sua.

**`POST /api/op/rinnovaPin` — il rinnovo passa dal servizio**, perché è il
servizio a sapere chi autorizza. Un Team Leader sulla collezione `operators`
non scrive niente: con una `PATCH` diretta non potrebbe rinnovare il PIN di
nessuno. La rotta verifica il PIN di chi autorizza, verifica la gerarchia
(l'Operatore lo rinnova un Team Leader, il Team Leader un Admin, l'Admin
chiunque) e riscrive.

**`POST /api/auth/recupero` — la via di fuga dell'Admin.** Un PIN smarrito si
rinnova, e chi lo rinnova è un grado più alto. **Sopra l'Admin non c'è
nessuno**, e con un solo Admin — che è ogni installazione appena nata — il suo
PIN perso è la Configurazione murata per sempre: nessuno può nemmeno nominare
un secondo Admin, perché si nomina da lì. È successo il 13/08.

Il codice è **venti caratteri dall'alfabeto di Crockford** — le dieci cifre e
ventidue lettere, senza I L O U — in quattro gruppi da cinque. Cento bit.
L'alfabeto non è un vezzo tipografico: è un codice che qualcuno stampa, mette
in cassaforte e sei mesi dopo ricopia a mano da un foglio, e uno zero letto
come una O lì dentro è la via di fuga che non funziona. La lettura perdona
spazi, minuscole, trattini mancanti, e riconduce I/L a `1` e O a `0`.

Quattro cose che valgono più della descrizione:

- **non è un secondo PIN**: non apre l'applicativo, apre soltanto la maschera
  che riscrive il PIN di quell'Admin;
- **si consuma nell'uso** — al posto suo ne nasce subito un altro, mostrato
  una volta sola;
- **sul disco non c'è mai il codice**, c'è la sua impronta (`rec_hash`,
  `rec_salt`, `rec_algo: scrypt`); dal servizio esce solo `rec_set`, vero o
  falso, che è l'unica cosa che la maschera chiede;
- **vale solo per il ruolo `admin`**: chi è Operatore o Team Leader ha già chi
  gli rinnova il PIN, e un secondo segreto sarebbe solo un secondo modo di
  entrare.

**IL FIX DI AVVIO DELLA 2.12.1 TORNA NEL SORGENTE.** Viveva in un pacchetto e
in una macchina, non in `server\` — §1. La 2.13 lo riporta byte per byte e gli
mette accanto **dodici prove che non aveva**, in `server/test/collaudo.js`:
quali errori si aspettano e quali no, che la scala dell'attesa raddoppi e si
fermi a otto secondi, che un database che sale al terzo colpo venga raggiunto,
che scaduto il tempo il messaggio dica che è scaduto il tempo, e che una
password sbagliata si scopra subito invece di far aspettare novanta secondi.
Si provano **da ferme**, con un orologio finto e un sonno finto: accendere un
PostgreSQL e spegnerlo a metà non è una prova, è una coincidenza.

**Il banco che prova le cariche è nuovo: `banco/gerarchia.cjs`, 32 prove** (**40** dalla 2.16).
Una regola imposta sul servizio si prova sul servizio — con `fetch`, coi
cookie veri, senza aprire un browser, su un database temporaneo alla porta
4198. Fra le domande che pone: che il Team Leader non si promuova Admin
nemmeno passando da una transazione o svuotando la collezione, che il codice
di ripristino **non esca mai da una risposta HTTP**, che quello speso non
valga più e quello emesso al posto suo apra a sua volta, e che dopo un reset
del database il primo Admin si possa ricreare.

Quell'ultima ha fatto uscire una correzione al guardiano: **il database si può
svuotare anche alle spalle del servizio** — un `.db` sostituito a mano,
`prepara-postgres.ps1`, un ripristino da backup — e in quel caso la risposta
«c'è già un Admin» tenuta da parte restava «sì» per sempre. Il servizio
rifiutava con un 401 anche l'unica richiesta che doveva passare, quella che
crea il primo Admin, e sotto il wizard si leggeva «Sessione non valida:
identificarsi» fino al riavvio del processo. Adesso, prima di dire di no, il
servizio ricontrolla — al più una volta ogni cinque secondi, e solo sul
cammino del rifiuto: chi lavora ha una sessione e non ci passa.

### 2.12.1 — il servizio aspetta il database

**In servizio dal 28/08 sera.** Impronta `4f2a9f0f…`, 1.864.994 byte.

Una build di prova nata da un guasto, non da un piano: il racconto del guasto
e di dove la correzione era finita sta in **§1**, le due difese
dell'accensione in **§7**. Nel sorgente ci è entrata solo con la 2.13, e con
lei le dodici prove che non aveva.

### 2.12 — il giro di prelievo, e il vano scansionato una volta

**27/08/2026.** Andrea: «mi trovo in difficoltà quando devo prelevare diversi
ordini di produzione dello stesso articolo». Cinque ODP della stessa serie
chiedono lo stesso lotto: prelevati uno alla volta sono cinque giri sulle
stesse corsie, e il primo che apre un collo lascia agli altri quattro un lotto
che a scaffale non basta più.

**Perché non è la 2.3.** La 2.3 divideva **il collo** — `quoteVano`,
`pianoUscita`, il giro conto, il reso che trabocca: quattro meccanismi nuovi
che dovevano stare in piedi insieme. Qui il collo non si divide: **la merce
scende una volta sola e sotto un numero solo, il capofila**, e gli altri ordini
stanno scritti sul movimento in `giro_odps` — non è un secondo conto e non
entra in nessun saldo. La ripartizione si dichiara **alla chiusura**, quando i
colli non ci sono più e ci sono quantità, che si dividono.

**Il prezzo, dichiarato:** fra prelievo e chiusura gli ordini non capofila non
hanno un conto proprio. Chi ne apre uno non si sente rispondere «nessun
movimento» — la risposta sbagliata alla domanda giusta — ma **«il conto di
ODP-2 lo tiene ODP-1»**, col pulsante che ce lo porta.

**Concatenare.** Un file **si aggiunge**, non sostituisce; un file illeggibile
lascia intatti quelli caricati. Lo stesso ordine due volte si rifiuta (chi
vuole il doppio lo scrive nella quantità). Un ordine già archiviato si rifiuta
**all'ingresso** e si ricontrolla comunque all'avvio, perché un altro terminale
può averne chiuso uno nel frattempo. Le righe che chiedono lo stesso articolo
**dallo stesso lotto** diventano una tappa sola con la quantità sommata; una
riga **senza lotto** non si fonde. Sulla tappa resta `richieste` — quanto ne
vuole ciascun ordine: serve al conto, non al cammino.

**Ricalibrare.** La distinta di Sage è proporzionale alla testata: il fattore si
applica al totale **e a ogni lotto**, coi decimali dell'unità di ciascuno. Si
riparte sempre da `lines_originali`: due ricalibrazioni di fila non compongono
i fattori. Campo vuoto = si torna alla quantità dell'ordine. Una testata senza
numero **non si ricalibra**.

**La sosta.** Le tappe pendenti contigue nello stesso vano sono una **sosta**:
l'ubicazione si scansiona una volta, gli articoli tutti. La chiave della spunta
ha perso `seq` — da `<tappa>@<vano>@<apertura>` a **`<vano>@<apertura>`** — e
non è un allentamento: quel che deve garantire è che l'operatore sia passato
davanti a quel vano in quest'apertura. Il campo ① sparisce a vano confermato e
al suo posto compare **↻ Riscansiona l'ubicazione** (non un campo disabilitato:
un campo che c'è e non si può usare è un campo che si prova a usare lo stesso).
`_renderRouteRun` non azzera più `_routeScan` a ogni disegno.

**Sui documenti.** Il rapporto di prelievo porta «Giro — ordini serviti»; il
rendiconto porta la stessa cella e, a quote scritte, **la ripartizione fra gli
ordini**. Le quote si leggono dalle **dichiarazioni di consumo**, non dalle
entrate: fra il chiesto e quel che finisce nel prodotto ci sono il reso e i
colli interi.

**Provata al banco la sera del 27/08**, sulla 4199, con copia del magazzino e
ODP **generati dalle giacenze** (`banco/genera-odp-2.12.cjs`) — i due soli
articoli che dichiarano unità **e** quantità per collo. Cinque ODP da
5+5+5+4+6 KG diventano **una tappa da 25 KG**, lo scaffale passa da 10
colli/200 KG a 9/175 col collo aperto a 15, il movimento porta `giro_odps`,
`giro_richieste` e `giro_id`, e alla chiusura le quote fanno **esattamente 25**.

**Tre difetti usciti lì, che leggendo non si vedevano:**

1. **La chiusura di un giro nominava solo il capofila** — su venticinque chili,
   venti erano di ordini che quella finestra non nominava, e la ripartizione si
   vedeva **dopo**, sul rendiconto. Adesso la conferma elenca le quote riga per
   riga prima di premere, e il pulsante si chiama «Dichiara, ripartisci e
   archivia».
2. **Ogni documento stampato diceva «Pathfinder 2.9»**: `VERSIONE_APP` fermo da
   tre versioni, e finisce sul piede di DDT, rendiconto, verbale, cartellino e
   rapporto. Ora `test/versioni.test.js` legge **tutti e quattro** i posti.
3. **`_routeStart` non apriva un'apertura nuova**: la spunta portava ancora
   quella del percorso precedente. Non faceva danno per caso, e da quando la
   chiave è il vano quella difesa non regge più.

**Cosa resta fuori dalla prova**: la corsia vera, con un operatore e un
terminale in mano.

### 2.11 — la porta (voce 64)

Era il difetto più grosso che l'applicativo avesse: **le rotte `/api` non
chiedevano credenziali a nessuno**. Chi raggiungeva la porta leggeva qualunque
collezione, ne scriveva qualunque record, e con una `DELETE` svuotava le
giacenze. Il PIN era una domanda che il client faceva a sé stesso.

- **L'ordine dell'avvio si è rovesciato**: `/api/load` vuole una sessione, e
  senza si aspetta davanti alla maschera **prima** di caricare una riga.
  Misurato al banco prima del PIN: in cache 3 operatori e nient'altro.
- **Un cookie, non un'intestazione.** Decide `EventSource`, che non sa mandare
  intestazioni; `HttpOnly` tiene il valore fuori da JavaScript (verificato:
  `document.cookie` risponde vuoto); `SameSite=Strict` chiude il verso opposto.
  **`Secure` solo con TLS vero**: su HTTP il browser lo scarterebbe in silenzio
  e nessuno entrerebbe più.
- **Il token non scade a tempo** — deciso da Andrea: un operatore buttato fuori
  a metà prelievo è peggio del rischio. Tre cose lo tengono corto: le sessioni
  stanno **in memoria del servizio** (un riavvio le butta tutte), «Blocca» la
  chiude anche sul servizio, il cookie muore con la scheda.
- **La finestra di primo avvio**: senza nessun PIN il servizio accetta senza
  sessione e lo dichiara all'avvio (`accesso APERTO`); appena il primo PIN
  esiste si chiude da sola e non si riapre. Si ricalcola **solo quando qualcuno
  scrive sugli operatori**. Chi scrive il primo PIN entra subito con quello.
- **Chi ricarica non ridigita il PIN**: l'identità si riprende dalla sessione,
  dopo il carico. Se la sessione cade si riapre la maschera; `_gateOpen` fa da
  guardia perché venti 401 insieme non disegnino venti maschere.
- **Restano aperte due rotte**: `/api/health` e `/api/app-info` (l'installer le
  interroga **prima** che esista un PIN), più `/api/auth/*`, che è la porta.
  `/api/auth/operatori` dà **il minimo**: sigla, nome, carica, «ha un PIN».
- **`accedere` non è `verificare`**: `verifyPin` risponde a «questo PIN è di
  questa persona?» e si chiama anche a sessione aperta; se emettesse una
  sessione, confermare un reset col PIN dell'Admin **scambierebbe l'operatore
  al lavoro**.
- **La chiave di macchina** `PATHFINDER_TOKEN`, generata **una volta sola**
  dall'installazione e mai rigenerata, serve a chi non ha un browser: backup
  serale, installer, migrazione, collaudi. Rigenerarla a ogni aggiornamento
  romperebbe il backup della notte, e nessuno se ne accorgerebbe fino al giorno
  che serve.

**Cosa non chiude:** i permessi per ruolo restano nel client (**voce 66**); e
senza TLS il cookie viaggia in chiaro — **la sessione chiude la porta a chi
bussa, non protegge da chi ascolta il filo**.

### 2.10 — sei falle di sicurezza

Nata da una valutazione chiesta da Andrea, fatta leggendo il codice **e
provandolo**. Giudizio: codice scritto con cura, SQL parametrizzato, escape
costante, confronto a tempo costante — e nessun controllo d'accesso.

- **L'impronta del PIN non esce più dal servizio, e non è più SHA-256.** Erano
  due difetti che si tenevano in piedi a vicenda: `GET /api/c/operators`
  rispondeva coi record interi (`pin_hash`, `pin_salt`) e l'impronta era uno
  SHA-256 a un giro. Un PIN è di sei cifre: **204 ms per ricavarne uno**,
  l'intero spazio in meno di due secondi. Ora la risposta porta `pin_set` e la
  verifica passa da `/api/op/verifyPin`. **`scrypt`** al posto di SHA-256 (50-100
  ms per accesso, l'intero spazio a una giornata di macchina): le impronte
  vecchie restano valide (`pin_algo` assente = com'era) e **si riscrivono in
  scrypt al primo accesso riuscito** — non c'è migrazione possibile, il PIN lo
  sa solo chi lo digita. **Il modo «da file» resta a SHA-256** perché
  `crypto.subtle` nel browser non ha scrypt.
- **Un backup non esce più dalla macchina.** `dir` arrivava dal corpo della
  richiesta e non la guardava nessuno: una richiesta sola scriveva l'intero
  database dove diceva chi chiamava, col processo che gira come SYSTEM. Non si
  stringe a **una** cartella (i chiamanti legittimi sono quattro): si vietano
  **percorsi di rete**, **cartelle di sistema**, **percorsi relativi**, e si
  pretende la lettera del disco. `PATHFINDER_BACKUP_ROOTS` stringe ancora.
- **Un codice non spezza più un gestore.** `onclick="App.x('CODICE')"` sono due
  contesti annidati e `_esc` copre solo il primo. Erano **195 punti**: la
  correzione sta in un posto solo, `normalizza`, dove i campi che sono un
  CODICE passano già. **Si rifiuta, non si ripulisce.** `&` non è nell'elenco:
  una categoria ha il diritto di chiamarsi «OLI & GRASSI», e un campo di testo
  libero che rifiuta gli apostrofi non lascia scrivere «l'articolo è arrivato
  rotto».
- **I file del servizio non sono più di tutti.** `C:\Pathfinder` ereditava
  `Authenticated Users : Modify`: bastava un blocco note per riscrivere
  `pathfinder-server.js` e farlo girare come SYSTEM al riavvio. L'installer
  spezza l'eredità (SID e non nomi, e **non ferma l'installazione se
  fallisce**: un magazzino che non si aggiorna per un criterio di gruppo è
  peggio di un permesso largo).
- **Tre intestazioni**: `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`. **Niente CSP, ed è una scelta**: una CSP seria
  vieta i gestori inline che sono l'architettura di questa interfaccia, e una
  permissiva sarebbe una riga che non protegge e che il prossimo crede protegga.
- **Su quale interfaccia si ascolta si sceglie**: `PATHFINDER_HOST`. Il
  predefinito resta «tutte», ma il servizio **dichiara all'avvio a chi
  risponde**.

**E poi la 2.10 non si è installata**, perché nessuno provava una macchina
vergine: `Split-Path -Leaf $null` sulla prima installazione, dove
`app\corrente` non esiste ancora e `/api/app-info` risponde null. Non si vedeva
da mesi perché ogni installazione era un **aggiornamento**. Il messaggio era
peggio del difetto: il `catch` diceva sempre «il servizio non risponde», anche
quando a rompersi era una riga di PowerShell. Adesso il servizio viene
richiesto un'altra volta e il messaggio distingue i due casi.

### 2.9 — da cancello ad assistente

Andrea, 27/08: «il sistema non deve MAI bloccare o interrompere l'operazione se
l'operatore sbaglia». **Un cancello non funziona in magazzino**: chi ha la merce
in mano o aggira la maschera — e allora nessuno sa più dove sia finita la merce
— o si ferma, e si ferma il magazzino.

Al posto del divieto: **il campo si precompila** (solo se ANCORA VUOTO:
riscrivere quel che l'operatore ha scansionato è il modo di far odiare i
suggerimenti), **la mappa accende il vano** con un bagliore rosso statico e
`inset`, **la riga resta in elenco** col tasto «Trasferisci» già compilato.
`VerdettoCasa.vietato` **non esiste più** (c'è un collaudo che fallisce se
qualcuno lo rimette); al suo posto `segnala` e `suggerita`. Il vano di casa
**sale in cima** con `PUNTI.CASA_DEL_LOTTO` ma non esclude più gli altri.

**La matrice di incompatibilità è uscita** — griglia, `meta.matriceIncompatibilita`,
`INCOMPATIBILITA_DI_SERIE`, `scontri`, CSS e collaudi — e la **pericolosità è
entrata come quinto bersaglio** di `storage_rules`, accanto a codice esatto,
prefisso, categoria e prefisso di categoria. È una **tendina, non un campo
libero**. La griglia chiedeva la stessa politica in un'altra forma, in una
seconda schermata: due modi di dire la stessa cosa prima o poi si
contraddicono.

Altro della 2.9: il **chip solo sulle righe sbagliate** nel pannello (su
`MAG1-RAKA-01-01-C`: sette item, uno marcato); il **trasferimento già
compilato** col cursore sul campo ubicazione e il testo selezionato
(`autofocus` in una stringa iniettata **non scatta**: si mette a mano);
`doMoveItem` che **rinfresca la verifica prima di ridisegnare**; l'elenco
riproporzionato (righe da 261 px a 53, `table-layout: fixed`, `modal-larga`,
sotto i 720 px diventa una lista); la scansione che **non chiude più su una
lettura sbagliata** e il campo confermato che diventa una pastiglia verde — che
**si spegne al primo tasto**, la toglie l'errore, e la tappa spostata su
un'ubicazione alternativa azzera tutti e tre i campi.

**Il difetto peggiore che questo applicativo abbia avuto:** `#dlgOverlay` che
manca era **un silenzio**. Se il div non c'era, `Dialog._open` usciva con
`Promise.resolve(null)` — la stessa risposta di «Annulla» — e **ogni conferma
del magazzino si comportava come un annullamento**, senza un errore in
consolle. Prelievo, conta, smaltimento, quarantena e spedizione passano tutte
da lì. Trovato **per caso** al banco. Corretto con due cose insieme: **si
ricostruisce** (il div è vuoto e inerte, fermare un magazzino per un
contenitore vuoto è sproporzionato) **e urla, una volta sola per sessione** (la
ricostruzione ripara il sintomo e nasconderebbe la causa; trecento righe uguali
sono di nuovo un silenzio).

**Il conto di produzione, provato sul magazzino vero** — Andrea l'aveva
indicato come «la parte più critica e debole». Sull'ordine `ODP2607777`: `in` 1
collo, `out` 1 collo/10 KG, `consumo` 15 KG, `chiuso`. **Entrato 25, tornato
10, consumato 15, residuo 0**, e i movimenti raccontano la stessa storia
(`PICK`, `IN`, `MOVE`). Reggono le altre tre invarianti: un ordine chiuso non
si riapre, la chiusura non è merce, un ordine mai visto non inventa niente. **Il
punto fragile è la voce 61.**

Due rinomine: «Da Ordine (XLSX)» → **«Prelievo automatico»**; «Conto
produzione» → **«WIP»**.

### 2.8 — le regole di stoccaggio decidono

**Le due regole che non si scrivono** (`modules/regoleBase.ts`, non sono un
record e non si cancellano):

1. **Lo stesso articolo sta sulla stessa unità di carico** — consiglio forte:
   prima una UDC aperta con stesso articolo E lotto, poi con lo stesso
   articolo, e fra pari **la più vuota**. **L'operatore scavalca**, e il motivo
   resta a registro.
2. **Lo stesso articolo/lotto sta nella stessa ubicazione** — **non si
   scavalca**: `item_key` è `articolo#lotto` e la giacenza di quel lotto è UNA
   riga per vano. Lo stesso lotto in due vani è la stessa merce contata due
   volte, e il FEFO la ordina come due partite.

**L'eccezione è dello stato del vano, non della persona**: se il vano di casa è
pieno, bloccato o disattivato — e solo allora — il lotto si estende su un
secondo vano e la mappa lo segnala.

**Dove morde**: in `Store.addItem`, che è il collo di bottiglia di tutto (non
esiste un `moveItem`: uno spostamento è `removeItem` + `addItem`). Funziona
sugli spostamenti **senza doverli distinguere**: uno spostamento intero lascia
il lotto senza casa e passa, uno **parziale** la casa ce l'ha ancora ed è
esattamente il gesto da rifiutare. `regolaBase: false` è la via d'uscita per le
**correzioni**, e sono quattro dichiarate sul posto: storno, rettifica
d'inventario, rettifica di una tappa, **ingresso in WIP**.

**L'area WIP è un conto, non uno scaffale**: portare in produzione è quasi
sempre un prelievo parziale, e applicare lì la regola fermerebbe la produzione.
Per la stessa ragione il vano WIP **non è casa** in `caseDelLotto` e **non si
conta** fra i lotti sparsi.

**Il terzo vincolo, che si scavalca: la categoria merceologica.** «I detersivi
stanno in MAG3» non è una regola sui codici, è una regola su una famiglia:
scriverla come prefisso funziona solo dove qualcuno ha avuto la disciplina di
far cominciare tutti i detersivi con le stesse cifre. **Chi è più preciso
zittisce chi è più generale**: `regolePerArticolo` restituisce **solo il
livello più preciso che ha colpito** — codice esatto → prefisso → categoria →
pericolosità.

**La pericolosità c'era dal 1.6 e il motore non l'ha mai letta**: da qui vale,
simmetrica agli allergeni. **La cella «Riservata» non deroga qui**: «riservata»
è la decisione organizzativa di ammettere un allergene; un comburente accanto a
un infiammabile è fisica, come la temperatura.

**La ventunesima collezione: `location_attrs`.** Uno scaffale non è omogeneo —
il livello a terra regge il doppio di quello in quota, la cella davanti al
portone è più calda. **La zona resta la sorgente, la cella scavalca**: un campo
assente sulla cella vuol dire «come dice la zona», non «nessun vincolo». Nella
maschera ogni campo ha **tre stati** — «come la zona», «così», «qui no» — e la
tendina scrive il valore della zona fra parentesi. Si caratterizza da Mappa →
dettaglio → 🎯 Caratterizza, non da Configurazione: chi decide che QUESTA
campata regge meno lo decide con la campata davanti. **Capienza e portata sono
sempre della cella**: fino alla 2.7 il motore cercava `zona.capienza`, che non
è mai esistita nemmeno come campo.

**I tre motivi precompilati dello scavalco** (`MOTIVI_SCAVALCO`): posto non
raggiungibile col mezzo · merce in uscita a breve · posto occupato o senza lo
spazio dichiarato. **Tre e non dieci**, col testo libero accanto per il caso che
i tre non coprono.

**Misurato il 26/08 sulle 886 giacenze di allora**: 28 lotti in due ubicazioni,
59 righe, 32 vani; 330 ubicazioni valutate per proposta in **2,1-2,8 ms**. Le
59 righe **non le ha fatte la 2.8**: sono il magazzino com'è — voce 59.

### 2.7 e 2.6 — i due database

**La 2.6** ha reso il servizio dati capace di parlarne due: `PATHFINDER_PG`
assente → SQLite, presente → PostgreSQL. Si installa **senza toccare il
database**, e il passaggio è un secondo gesto separato. Porta anche i **codici
in maiuscolo** (li normalizza il servizio a ogni scrittura, da qualunque parte
arrivino) e l'**interfaccia asincrona** del servizio dati — il pezzo più grosso
di lavoro. I giri di rete sono usciti dai cicli: `bulkPut` faceva **11.197
INSERT** per la sola anagrafica, adesso sono **12 istruzioni**; `countAll` passa
da venti `COUNT` a uno.

Quel che la 2.6 ha trovato guardando, e nessuno sapeva: lo stesso lotto a
scaffale **due volte** per una differenza di maiuscole (`6001412#cl260854` e
`#CL260854`, fusi in una riga da 6 con un `EDIT` a registro); `startsWith` che
voleva dire **tre cose diverse** (sensibile in Dexie e in cache, insensibile sul
servizio, che usava `LIKE`); il backup che nominava i file **in UTC** e si
scriveva sopra il serale; **due terminali dentro la stessa transazione**;
`BIGINT` che tornava stringa; lo stesso rifiuto mappato **409 su un database e
500 sull'altro**; `rejectUnauthorized: false`. **Le prime tre le ha trovate
l'audit dei dati, le altre quattro la batteria che gira le stesse prove sui due
driver.**

**La 2.7** è il primo giorno su PostgreSQL (26/08 sera). I dati sono passati
interi — 11.197 articoli, 886 giacenze, 321 movimenti, 7 operatori, 4 UDC, 28
conti WIP — con i conteggi ricontrollati due volte, il file SQLite **non
toccato**, e le sequenze riallineate sopra le chiavi già scritte perché il
`_id` si è **preservato e non rigenerato** (`tasks.mov_ids` punta a quei
numeri). Il backup su PostgreSQL è un `pg_dump` in formato custom **riletto con
`pg_restore --list` prima di essere dichiarato buono**, e cancellato se non si
rilegge — voce 53.

**Come si torna a SQLite** (emergenza): `& "C:\Pathfinder\servizio\installa-servizio.ps1"`
senza `-PostgreSQL`. **Quel che è stato scritto su PostgreSQL nel frattempo
resta lì e non rientra da solo**: il file SQLite è fermo alla sera del 26/08.
Per un rientro ordinato si migra al contrario, e quello script non c'è.

**Il database sta sulla stessa macchina del servizio.** Non è Azure: il
magazzino si ferma quando si ferma quel PC. È la stessa cosa che la voce 26
diceva del ramo Azure, e resta vera qui — **niente lavoro senza linea**, per
scelta e non per dimenticanza (§8).

### Prima della 2.6 — la cronaca in breve
| Quando | Cosa |
|---|---|
| **2.5** (26/08) | Le UM al carico: su 11.197 articoli, **2** funzionavano, 4.036 avevano la maschera nascosta, 7.159 un'unità non riconosciuta. Quattro cause: la maschera si nascondeva da sola (il cancello è diventato l'**unità**, non `pieces_per_pack`); un lotto congelato senza per-collo restava rotto per sempre (`??` che non ripiegava mai — ora ripiega **a lettura e a unità uguale**); **`NR` di SAGE X3 non era un dato mancante ma una codifica non tradotta**, 7.077 articoli su 11.197; tre difetti intermittenti della maschera. Più il prelievo da ordine in sette interventi: il compito che **viaggia con la tappa** (`transfer_task`), la disponibilità riletta a ogni render, la pausa scorporata dai tempi, la rettifica di una tappa già prelevata (`REPOS`, **solo in meno**), i colli proposti dai più piccoli (`pieni` per eccesso, `spaiati` per difetto, e gli spaiati non sfondano mai l'ordine), le UM sul report, le sovrapposizioni misurate a 375/482 px e in stampa |
| **2.4** (25/08) | Voce 45 e voce 19. Salta il numero 2.3 apposta |
| ~~**2.3**~~ (24-25/08) | **RITIRATA.** Divideva il collo: `quoteVano`, `pianoUscita`, il giro conto `WIPGIRO`, il reso che trabocca sul più vecchio, il fabbisogno scontato di quel che il reparto ha in mano, il vano WIP escluso dalle tappe, il registro ODP in una vista sua. Tre difetti usciti costruendo (il filtro sul residuo in **colli**, «l'ordine più vecchio» ordinato sull'**ultimo** movimento, il rendiconto che stampava un foglio bianco e contava il ceduto come reso). **Il caso che voleva risolvere è quello della 2.12**, per altra strada |
| **2.2** (20/08) | Voce 14 (il campo fantasma `updated_at` sulle giacenze, 13 righe raddrizzate in produzione), voce 29 (l'archivio ODP si sfoglia), voce 30 (le righe nel vano WIP che nessun ordine rivendica), la data delle copie locali, «undefined» nella descrizione. E la scoperta che **il numero di versione sta in quattro posti** |
| **2.1** (19/08) | Code128 scritto in casa · il ruolo **ADMIN** · la purga tolta (**nessuna cancellazione di record**) · il cruscotto componibile · ordinamento e filtri (`modules/tabella.ts`) · il registro attività che legge anche il registro generale · il prelievo da file che finisce nel conto WIP · le UDC intere (smaltimento, quarantena, trascinamento) · la mappa che non copre più la pianta |
| **2.0** (19/08) | **Gli interruttori tolti** · i KPI (`modules/kpi.ts`) · gli export che dicono le UM · **otto difetti dello stesso ceppo**: un saldo giusto scritto sopra un elenco di colli rimasto indietro. Il ciclo quadra a zero su quattro ordini, 702,594 KG |
| **1.9-1.14** (19/08) | Viste giacenza · trasferimenti dall'ODP · il terminale su `--spacing` · UDC · motore di stoccaggio · conto di produzione |
| **1.8.x** (18/08) | La suddivisione dei colli **si dichiara invece di calcolarsi**. Il difetto peggiore: `savePendingOutbound` e `updatePendingDoc` ricostruivano la riga di documento **in due copie**, e i colli scelti sparivano al salvataggio |
| **1.7** (17/08) | Una versione è **una cartella**. Primo caricamento da 1.610 kB a **251 kB**, ricarica a **300 byte**, `xlsx` a richiesta. Installata alle 18:29, ha lasciato l'applicativo **giù per tre ore**: il servizio, che gira come SYSTEM, **non attraversa una giunzione** |

---

## 4. La coda di lavoro

**I numeri non si riusano e non si rinumerano.** Cinque stati:
| stato | vuol dire |
|---|---|
| **da pianificare** | lavoro di sviluppo riconosciuto: prima l'analisi, poi la correzione, poi il consolidamento |
| **Andrea** | è un dato o una configurazione, e la compila lui. Un agente non ci mette mano |
| **standby** | riconosciuta e ferma per scelta |
| **da chiarire** | manca un fatto per poter decidere |
| **fatto** | chiusa, con la prova accanto |

### Aperte — da pianificare
| # | Cosa | Passo successivo |
|---|---|---|
| **90** | **IL PRODOTTO FINITO NON HA MAI VISTO IL REPARTO.** La 2.20 è stata provata al banco da capo a fondo — modello di imballo, zona PF, bancale chiuso ed etichettato, elenco, mappa colorata, carrello del DDT, evasione, conto terzi — ma su un database di prova e con un articolo scelto a caso. **Quel che il banco non può dire**: se ① → ② → ③ → ④ regga il ritmo di chi imballa davvero, se i colli proposti dal modello siano quelli giusti sui formati veri, e se chi spedisce trovi nell'elenco le colonne che cerca | **Una passata in reparto e una alla scrivania delle spedizioni**, con la merce vera davanti. Poi si sistemano modelli, colonne e proposta — sono tutti dati o righe di vista, non architettura |
| **89** | **L'ETICHETTA DEL BANCALE NON HA MAI VISTO UNA ZEBRA**, come la voce 83 per le altre due. Il layout di serie occupa **70 mm degli 80** e le 22 prove nuove del banco coprono lo ZPL, non la carta | **Va nella stessa passata della voce 83**: stessa macchina, stesso supporto, stesso lettore ottico |
| **88** | **IL LAYOUT DELL'ETICHETTA DEL BANCALE È UNA PROPOSTA SCRITTA A TAVOLINO**, come lo era quello della merce (voce 85): articolo, descrizione, barre, lotto, scadenza, colli, peso. Ordine di produzione e ubicazione nascono spenti | **Si guarda col bancale davanti**: chi carica il camion può volere i colli più grandi, o l'ordine acceso |
| **87** | ⚠️ **UNA PROVA DELLA GERARCHIA È ROSSA, E LO ERA PRIMA DEL PRODOTTO FINITO.** `banco/gerarchia.cjs` dà **39 su 40**: cade «lo dice anche all'elenco che disegna la schermata di accesso — `rec_set = undefined`». Verificato rimettendo il codice del commit `c693b2c`, cioè la 2.19 committata: **rossa anche là**, quindi non l'ha rotta il lavoro del 03/09. Riguarda il **codice di ripristino** e quel che `/api/auth/operatori` dichiara di un operatore | **Si guarda la rotta**: o l'elenco non porta più `rec_set`, o lo porta con un nome diverso da quello che la prova si aspetta. Da distinguere prima di toccare qualunque cosa — un campo che sparisce da una rotta aperta è un'altra cosa da una prova scritta male |
| **83** | ⚠️ **LE ETICHETTE ZEBRA NON HANNO MAI VISTO UNA ZEBRA.** La 2.19 gira su un banco che alza una finta stampante sulla 9100 — 78 prove verdi, e coprono quel che si può coprire da fermo: il layout nei millimetri, i quattro caratteri che spezzerebbero lo ZPL, la porta che sta in un elenco chiuso, l'indirizzo che non esce dalla rete interna, le richieste che si mettono in fila, e la carta finita che passa come successo mentre `~HQES` lo dice. **Macchina, supporto e rete adesso ci sono** — Andrea, 02/09: serie **ZD200** (o un modello precedente simile), **203 dpi**, **adesive staccate 100 × 80 mm**, con presa di rete, e le installa il team IT. Il layout di serie è tarato su quelli: 68,5 mm degli 80, con 11,5 di margine perché su un'etichetta staccata il registro balla a ogni avanzamento. **Quel che il banco non può dire è se l'etichetta esca** | **Serve la stampante vera, e quattro misure con quella davanti.** (1) Le barre lette da un **lettore ottico** su carta termica — lo stesso passo che il Code128 su A4 ha fatto il 25/08 (voce chiusa 23). (2) L'etichetta **dritta e dentro il supporto**: i 3 mm di margine sono una scelta, non una misura, e la zona che una testina non stampa la decide il modello. (3) La **calibrazione del supporto**: adesive staccate vuol dire rilevamento a **interspazio**, e si fa una volta col tasto FEED tenuto premuto — Pathfinder `^MN` non lo manda di proposito, quindi se la macchina non è calibrata l'etichetta esce sfasata e il codice a barre finisce a cavallo del taglio. Va nella SOP insieme al **calore**. (4) Che `~HQES` **risponda davvero**: il banco finge tre macchine, quale sia la ZD200 vera si sa provandola |
| **85** | **IL LAYOUT DELL'ETICHETTA MERCE È QUELLO DI SERIE, E NESSUNO L'HA GUARDATO CON LA MERCE DAVANTI.** Sei campi accesi, 51 mm su 60: barre, codice articolo, descrizione su due righe, lotto, scadenza, peso. È una proposta scritta a tavolino — chi etichetta i sacchi in accettazione può volere il peso più grande, la descrizione più piccola, o i colli accesi | **Una passata in reparto con un rotolo vero.** Il layout è un dato e si cambia in Configurazione senza ricompilare: il punto non è il codice, è **quale etichetta serve a chi la legge coi guanti**. Da fare dopo la voce 83, che dice se le misure di serie stanno in piedi |
| **79** | ⚠️ **DALLA 1.4 ALLA BETA: IL BANCO C'È E PASSA, MANCA LA CORSA SUI DATI VERI.** Il magazzino vero gira la **1.4** su un'altra macchina — §0. È un **HTML unico da 1,54 MB**, dati in **IndexedDB via Dexie** (`WarehouseMapperDB`), backup su OPFS, `exportAll`/`importAll` con `_format` **`warehouse-mapper-v1.5`** — lo stesso che dichiara la beta. **La strada quindi esiste**: si esporta dal browser del magazzino e si importa nella beta. Verificato il 02/09 che due export veri dell'epoca — `_appVersion` **1.6** e **1.1.0** — si lascino **chiavare dallo schema di oggi**: ogni collezione trova la sua chiave primaria, e quelle assenti restano com'erano come vuole §8. **02/09 — ADESSO GIRA**: `banco/migrazione/dalla-1.4.cjs`, **14 prove, tutte verdi**. Parte da un database **vuoto**, come una macchina appena installata, importa `14082026_warehouse-mapper-2026-08-14.json` e conta: ogni collezione arriva col numero di righe che aveva, i **104 movimenti** ci sono tutti, la merce si ritrova vano per vano con articolo lotto e colli, le righe **senza UM** non ne guadagnano una dal nulla, `righeLette` non lancia su una riga che di colli non ne dichiara, i compiti aperti restano aperti, e sul database importato **il primo Admin si crea e entra** | **Resta la corsa sui dati veri**, che nessuno ha ancora esportato dalla macchina di magazzino. Due cose che il banco ha già misurato e che su quel file vanno rimisurate **prima** di premere Importa: (1) **quante righe cambiano nome per il maiuscolo** — qui 4 su 190, e un'etichetta stampata prima non corrisponde più alla chiave a database, quindi la ristampa diventa un passo della migrazione; (2) **se due righe finiscono sulla stessa chiave** una volta maiuscolate — qui nessuna, ma lì una coprirebbe l'altra e la merce sparirebbe davvero. La prova che lo chiede è già scritta: basta puntarla sull'export vero |
| **78** | ⚠️ **I VECCHI COMMIT RESTANO RAGGIUNGIBILI SU GITHUB PER SHA.** La storia è stata riscritta e `main` spinto a forza (voce 72): il dump non sta più in nessun ramo, `GET /contents/…?ref=main` risponde **404**, e il ramo `claude/annotazioni-modifiche-ecq4c5` con la sua PR #1 **diverge da prima** del commit incriminato, quindi non lo porta. **Ma il vecchio commit risponde ancora**: `GET /commits/ecd25381…` restituisce il suo SHA. È il comportamento normale di GitHub — gli oggetti sfollati restano finché non passa il garbage collector — e il repository è **privato**, quindi li vede solo chi vi ha accesso | **Due gesti, e sono di Andrea.** (1) Chiedere a **GitHub Support** di ripulire gli oggetti sfollati e le cache: è l'unico modo di togliere quei byte dal server. (2) **Rinnovare i PIN** degli operatori che stanno in quel dump quando rientreranno a database: le impronte lì dentro sono **SHA-256**, e su sei cifre un milione di tentativi è un istante. Oggi non urge — a database c'è **un operatore solo**, `ADM1`, nato dopo |
| **77** | ⚠️ **UN FILE CHIAMATO «variabile postgre.txt» STA SUL DESKTOP, 843 byte.** In `Desktop\Pathfinder-archivio-2026-09-01\`, accanto ai dump. Non è stato aperto e non è in git; il nome dice che porta la stringa di connessione di PostgreSQL, cioè **utente e password** — la cosa che §11 tiene fuori dal repository insieme ai file di database | Va guardato e, se è quello, **spostato dove stanno i segreti** o cancellato dopo aver messo la stringa dove serve. Un segreto in chiaro sul Desktop, dentro OneDrive, è un segreto sincronizzato altrove |
| **76** | **`Q1` — 0,75 KG CHE NON SI RITROVANO, VISTO UNA VOLTA SOLA.** Alzato dal banco del ciclo il 01/09 alle 20:23 e **non riprodotto in dodici corse** — quattro il 01/09, otto il 02/09 — a parità di codice, con `ciclo.db` rifatto dal pristino ogni volta (`rifaiDatabase` toglie anche `-wal` e `-shm`), `fileParallelism: false` e ordine deterministico. **L'origine non è rintracciabile, e si è capito perché**: `apriVerbale` **tronca `verbale.md` a ogni corsa**, quindi la corsa delle 20:25 ha cancellato la prova di quella delle 20:23. Un banco che cancella le proprie prove trova un difetto una volta sola | **La causa dell'irrintracciabilità è chiusa**: dal 02/09 una corsa che alza un difetto `grave` mette il verbale da parte come `verbale-GRAVE-<data>.md`, e la corsa dopo non lo tocca. **Il difetto no**: resta aperto finché non si ripresenta e non si legge quel verbale. Un secondo sospetto da tenere in mente: **`pristino.db` ha un WAL e uno SHM suoi** — 0 byte il 02/09, ma datati 31/08 — e `copyFileSync` copia il solo `.db`: se quel WAL avesse contenuto, il pristino non sarebbe uno snapshot stabile |
| **67** | **LA QUOTA DI CONSUMO NON SI CORREGGE A MANO.** Alla chiusura di un giro la ripartizione si scrive proporzionale a quanto ciascun ordine aveva chiesto. Se la produzione ha consumato in proporzione diversa — il caso normale, non l'eccezione — non c'è dove dirlo | **La proporzione è una proposta, non un fatto misurato**, e va scritto anche sul foglio. Serve una maschera che sposti quantità da un ordine all'altro col vincolo che la somma resti quella del consumo. Il dato c'è: `giro_richieste` sul movimento |
| **63** | **`areaWip` SUL BANCO È UN VANO DELLO SCAFFALE, NON UN'AREA.** Impostata il 27/08 su `MAG1-RAKA-04-01-T` per provare il conto di produzione. Funziona, ma sulla mappa non si distingue dallo stoccaggio | Sul magazzino vero la domanda è la **voce 15**. Sul banco, il giorno che serve una prova più fedele, si crea una zona `WIP` sua |
| **62** | **IL BIP DI LETTURA E LA CONFERMA DI TAPPA SONO TUTTI E DUE ACUTI E SINUSOIDALI.** `scan` 1320 Hz, `ok` sale 1046 → 1568 Hz. Fra `ok` ed `error` non c'è confusione (`error` scende 233 → 175 in onda quadra), ma «ho letto» e «tappa chiusa» possono somigliarsi col rumore del reparto e i tappi | **Una prova al banco col rumore vero**: se la confusione c'è, si scende il bip di lettura o se ne accorcia la coda, così l'unico suono che sale resta la conferma |
| **61** | **IL CONTO WIP DIPENDE DA UN PARAMETRO FACOLTATIVO.** La riga `in` non registra le UM (`qty_uom` è `null`) e i chili si ricostruiscono dalla confezione congelata, che `Store.contoWip` passa a `conto()` come ripiego. Omettendolo, lo stesso ordine in pari risponde `residuo_uom: −25`, `incoerente: true`: un numero **plausibile e sbagliato**. **Dalla 2.14 almeno SI VEDE**: la lista di quello che è in lavorazione tinge di rosso la riga col residuo negativo, che prima non compariva da nessuna parte | **Due strade, e la seconda è quella buona:** scrivere le UM sulla riga `in` quando si conoscono (la confezione è congelata già al posizionamento), oppure rendere `perCollo` obbligatorio o far dichiarare `incoerente` con un motivo leggibile invece di un residuo negativo muto |
| **59** | **28 LOTTI IN DUE UBICAZIONI — 59 RIGHE SU 32 VANI.** Contati il 26/08 sulle 886 giacenze di allora. **Non li ha fatti la 2.8**: fino a quel giorno nessuno aveva modo di vederli. Finché durano, quella merce si conta due volte e il FEFO la ordina come due partite | **Ricomporli uno per uno, con la merce davanti.** L'elenco esce da Mappa → «Vedi elenco» → Esporta Excel, tipo `LOTTO_SPARSO`. Non è lavoro da agente: sono 28 decisioni su dove sta davvero la merce. **Da ricontare sui dati veri**, non su questa macchina |
| **58** | **GLI ATTRIBUTI DEGLI ARTICOLI SONO VUOTI.** Misurato il 26/08: 644 articoli senza classe di temperatura, allergeni e pericolosità, e `verificabili` a **zero**. I quattro controlli nuovi della 2.8 **non possono scattare**. È la voce 5 vista dall'altro capo | **È di Andrea**, come la 5: Configurazione → Articoli → Export/Import Excel; il foglio «Valori ammessi» porta già gli elenchi buoni |
| **52** | **82 ARTICOLI HANNO UN'UNITÀ CHE NON È UN'UNITÀ.** Dopo la traduzione `NR → PZ`: `SCA` 48, `CON` 18, `RT` 7, `CAS` 4, `M2` 2, `BAN` 1, più **due celle con testo libero** (`MIN EPA=105 MG/G` e simile). Scatola, confezione e cassa nominano un **contenitore**, e qui il contenitore è il collo | Si caricano **a soli colli** e la maschera lo dice. Va deciso sigla per sigla: `M2` chiede se serva una sesta unità, le due celle di testo sono errori di anagrafica (Andrea) |
| **51** | **DUE FUNZIONI MAI ESERCITATE DA CAPO A FONDO, E SONO IN SERVIZIO DALLA 2.5.** La **rettifica di una tappa già prelevata** e il **salta tappa**: verificate per tipi, logica e resa a video, mai fatte girare. La rettifica scrive un `REPOS` e chiama `esceDaWip` — tocca giacenza **e** conto di produzione | **Al banco, su una copia del database, con un ODP di prova.** Due cose da guardare: che il `REPOS` rimetta le **misure giuste** e non colli di misura comoda; e che `esceDaWip` non rifiuti la riga quando l'ordine ha in lavorazione colli di misure diverse (lancia apposta in quel caso, e va visto succedere) |
| **43** | **IL KIT DEMO NON ESISTE PIÙ — MA LO SHEET TECNICO SÌ.** `Avvia Demo.bat` e i tre `README-DEMO` vivevano dentro `consegna/`, che la build azzera: non li produce `vite.config.js`, non sono mai entrati in git, cercati su tutto il disco il 25/08 senza trovarne traccia. **La parte sullo `IT-TECH-SHEET` era sbagliata**: è stato riscritto il 28/08 e sta in `documenti/IT-TECH-SHEET.md` — 532 righe, **REP-IT-001 rev01**, scritto per il team IT che deve autorizzare l'installazione, con architettura, porte, account, dati trattati, sicurezza, limiti noti e cosa si chiede all'IT. Fuori da `consegna/`, quindi la build non lo tocca | **Resta da riscrivere il solo kit demo**, e stavolta fuori da `consegna/` o dentro l'elenco dei file del plugin di build. **Lo sheet tecnico è in italiano** e il team IT chiede l'inglese: è la voce 82 |
| **42** | **LA NUOVA REGOLA DEL CAMPIONAMENTO VA NEL CODICE.** Andrea, 25/08: articolo **con** UM configurata → si scala la UM richiesta e i colli non calano; articolo **senza** UM → il campione **non modifica la giacenza**. Oggi la rotta rifiuta il collo intero con «un campione lascia sempre un residuo» | Cambia una regola di §8 e il **significato di `SAMPLE`**: si scrive lì prima che nel codice, e il CQ deve saperlo. Il logbook della qualità si tiene sei anni |
| **22** | **IL DIFETTO SEGNALATO DEL MOTORE DI STOCCAGGIO NON È ANCORA RIPRODOTTO.** «L'ubicazione non soddisfa i criteri anche quando la regola è definita correttamente»: resta una frase senza un caso. La 2.8 rende più facile riprodurlo, perché ogni esclusione porta il suo `motivo` in chiaro | **Serve il caso vero**: la regola esatta come è scritta, il vano che rifiuta, il messaggio a video. Senza quei tre non si sa nemmeno se sia ancora vivo |
| **19** | **`6001055` MANGANESE SOLFATO: l'ODP lo chiede in KG, l'anagrafica lo dichiara PZ.** ⚠️ **Contraddizione aperta dal 26/08**: la 2.4 dichiara di averla chiusa, questa coda la tiene aperta, e nessuno ha verificato quale delle due righe sia sbagliata | **Prima si stabilisce se è chiusa**, guardando il foglio ODP e l'anagrafica. Poi: se l'unità si perde in lettura è il parser, se il dato è storto all'origine è l'anagrafica — due difetti diversi |
| **15** | **L'AREA WIP VA CONSOLIDATA.** È **un'ubicazione mappata**, non un prefisso, e `Store` la legge da `meta.areaWip`. Il 25/08 il servizio vivo diceva **`MAG1-WIP-01`**, mentre il documento diceva `M06-COM-01`: sono tutte e due ubicazioni vere, `M06` è il magazzino Rinaldi «IN COSTRUZIONE» e `MAG1` porta tutta la giacenza. Il valore è cambiato dopo il 19/08 e nessuno l'ha scritto | **Quale dei due vani sia quello giusto, prima di ogni altra cosa.** Il conto di produzione ci ha già lavorato dentro. Dal 2.11 il valore si legge dall'applicativo, non con `curl` |
| **5** | **CARATTERIZZARE LE ZONE** in Configurazione → Zone: classe di conservazione, zona allergeni, zona pericolosi, refrigerata. Finché non è fatto **la mappa resta muta**: la verifica confronta due metà e una manca. Misurato il 19/08: la conformità copriva il **6% delle righe** (12 su 194), una zona su quattordici portava la classe | **Pianificare verifica e correzione**: prima si misura quante zone e quante righe sono scoperte, poi si decide se il buco è nel dato o nel codice che lo legge |

### Sono di Andrea — dati e configurazione

Un agente non ci mette mano. Stanno qui perché senza di loro certe funzioni non
hanno con cosa lavorare.
| # | Cosa |
|---|---|
| **3** | **Un secondo Team Leader.** `ANSA` era l'unico con un PIN. **Da sapere:** `DP` (Daniele Pedrazzi) risultava **attivo e senza PIN**, e senza PIN non si firma niente: o gli si dà un PIN o lo si disattiva come i quattro storici. **Da rileggere quando il magazzino vero passa alla beta** (voce 79): su questa macchina l'anagrafica è quella delle prove |
| **6** | **`pieces_per_pack` in anagrafica** (colonna `Pezzi_Per_Collo` dell'import). **Meno urgente dal 26/08**: un lotto congelato senza `uom_per_collo` **ripiega dall'anagrafica** a lettura e a unità uguale, quindi compilarla dopo ripara anche i lotti già a scaffale. Resta il gesto che risparmia una digitazione a ogni posizionamento su 11.115 articoli |
| **7** | **Partita IVA e dati mittente** in Configurazione → DDT. La partita IVA del destinatario rientrato con la voce 49 vale `123456`, **che è un segnaposto**: va corretta prima che quel cliente riceva un DDT vero |
| **13** | **Il prefisso GS1 è già compilato e vale `1234567`** — misurato il 25/08. Vuoto → codici interni; compilato → **SSCC veri**. `1234567` non è assegnato da un consorzio: un'etichetta stampata adesso porta un SSCC che *sembra* vero. Dentro l'azienda non fa danno, fuori sì — voce 24 |
| **16** | **Le prime regole di stoccaggio.** `storage_rules` è vuota, e finché non ci sono il motore lavora sui soli vincoli. Sono un **dato** (`article_code` inizia per 700 → `MAG2` è un record), non codice |
| **60** | **`ADMI` è un operatore admin nato per sbaglio sul collaudo** (26/08, maschera aperta precompilata `admin`/`admin`, PIN riempito dal gestore password). È attivo, ha ruolo admin, e **il PIN non lo conosce nessuno**. Sta sul servizio di collaudo (4199). Andrea: «lascialo, ci penso io» |

### Standby — ferme per scelta
| # | Cosa |
|---|---|
| **8** | **Nome DNS interno e certificato** dalla CA aziendale. Il codice è pronto: due variabili e HTTPS si accende. **È anche l'unica risposta al mezzo difetto che la 2.11 lascia aperto** |
| **24** | **Se le etichette escono dal cancello.** Quel che si stampa è **Code128, non GS1-128**: manca FNC1 e l'identificativo `(00)`. Il giorno che un cliente deve leggere un SSCC, `modules/code128.ts` va **esteso, non aggirato**. **Dalla 2.19 i costruttori sono due**, e la tentazione è di chiuderla solo da una parte: `^BC` di ZPL il GS1-128 lo sa fare da firmware, in tre caratteri. Farlo lì e non nell'A4 vorrebbe dire **due etichette dello stesso pallet che codificano cose diverse** — due verità, che è il difetto che questa voce esiste per evitare. Si estendono insieme o non si estende niente |

### Da chiarire — manca un fatto
| # | Cosa | Cosa manca |
|---|---|---|
| **1-bis** | **Chi ha cancellato `C:\Pathfinder\app\pathfinder-1.6.1`** il 17/08 alle 19:14. La cartella è stata ricostruita e la via di ritorno è di nuovo intera, ma la causa non si conosce | Se non è stato un gesto di Andrea in un'altra finestra, qualcosa cancella dentro la directory di installazione |

### Decise, e non si riaprono
| # | Cosa |
|---|---|
| **17** | **La capienza dei vani non si dichiara, e non è un buco.** I vani non hanno un limite: la verifica la fanno **a vista gli operatori**. Il vincolo nel motore resta e non esclude mai per pieno. (Dalla 2.8 capienza e **portata in chili** si possono comunque scrivere sulla singola cella con `location_attrs`: è uno scavalco puntuale, non una dichiarazione di massa) |
| **25** | **La vista 3D della mappa: valutata, e no.** Le ubicazioni non hanno coordinate — `core/geometria.ts` le genera da corsie, campate e livelli — quindi sarebbe la stessa griglia con la prospettiva in più: costo alto, informazione zero. La **vista frontale con «Specchia»** copre quel che serviva |
| **65** | **`xlsx` 0.18.5 RESTA, E IL RISCHIO È SCRITTO.** Due vulnerabilità note — prototype pollution (GHSA-4r6h-8v6p-xvw6) e ReDoS, gravità alta — e su npm non c'è un fix: SheetJS pubblica le corrette solo dal proprio sito. **Deciso da Andrea il 01/09: si accetta.** Il vettore è il file Excel che un operatore carica, e quell'operatore è **identificato, sulla rete interna, con un foglio che ha generato lui**: non è un file che arriva da fuori. Passare alla versione del sito vorrebbe dire riprovare tutto quel che tocca Excel — ODP, anagrafica, export — per chiudere una porta che dà su un corridoio interno. **Si riapre il giorno che un foglio arriva da fuori** |
| **26** | **Il ramo Azure non è «pronto e non lo chiama nessuno»: È DIVENTATO IL DRIVER.** La voce diceva che `server/azure/` stava lì in attesa di una decisione. **La decisione è stata presa il 26/08 e la cartella non esiste dal commit `ffcf1e8`**: `schema-postgres.js` è andato in `server/lib/`, `audit.js`, `audit-sqlite.js` e `migra-sqlite-postgres.js` in `server/migrazione/`, e da lì viaggiano dentro il pacchetto. Quel che era un ramo parallelo è **il PostgreSQL che gira adesso**. Resta vera una cosa sola di quella voce, e vale per il database di oggi come per Azure: **il magazzino si ferma quando si ferma la macchina del servizio**, e §8 lo dichiara — niente lavoro offline, per scelta |
| **35** | **La 2.1 andò in servizio da un pacchetto che nessun documento nominava.** Terza volta in quattro giorni. Non è una riga da correggere: è il motivo per cui esiste §0 punto 2 |

### Chiuse — con la prova
| # | Cosa | Prova |
|---|---|---|
| ~~**86**~~ | **LE STAMPANTI HANNO LA PRESA DI RETE, E LE INSTALLA L'IT.** Andrea, 02/09: serie **ZD200** o modello precedente simile, **203 dpi**, adesive staccate **100 × 80**, già in rete e gestite dal team IT. Era il rischio che teneva in piedi tutto il resto — le desktop Zebra di quella fascia escono spesso con la sola USB, e senza una porta TCP il servizio non ha nessuno a cui parlare | **Chiusa dal fatto.** Nessun print server esterno serve; la porta 6101 resta nell'elenco ammesso per i casi futuri, e non costa niente |
| ~~**84**~~ | **LA PORTA 9100 IN USCITA NON ERA NELLO SHEET TECNICO**, che dichiarava una porta sola: la 4173 in ingresso. Dalla 2.19 il servizio apre connessioni **in uscita** verso le stampanti, e quella è una richiesta di autorizzazione al team IT, non un dettaglio di codice | **Scritta il 02/09, in due lingue.** `documenti/IT-TECH-SHEET.md` passa a **rev05**: nuovo **cap. 5.3** coi requisiti di rete (IP fisso o riserva DHCP, 9100 in uscita, ambito privato, porte ammesse, calibrazione e calore), il cap. 3 dichiara le connessioni in uscita, il 5.1 la rete, il 6.3 la configurazione delle stampanti e del layout, e il 12 porta **due richieste nuove all'IT**. Le istruzioni operative stanno in `README.md` §7 e `README.it.md` §6, con la tabella dei messaggi di guasto in §9; il servizio le ha in `server/README.md` e `server/LEGGIMI.md` |
| ~~**75**~~ | **L'INSTALLER SI CHIUDEVA LA PORTA IN FACCIA DA SOLO, SU MACCHINA PULITA.** `Blinda-Radice` stringeva i permessi della radice con un `icacls` solo, `/inheritance:r` e `/T` nella stessa riga: quella coppia scende su ogni figlio e gli toglie gli ACE ereditati, mentre i tre `/grant` non arrivano fino in fondo. Restano file con l'**elenco vuoto**, e un elenco vuoto nega tutto — anche a un Amministratore, anche solo per leggere di chi è il file. Girava in fondo al passo del servizio, e il passo dopo doveva lanciare `installa-versione.ps1` **da quella cartella**: «Accesso al percorso negato», segnalato da PowerShell come comando non trovato. **E `icacls` usciva con zero**, quindi l'installer scriveva «Permessi applicati» in verde. Non si era mai visto perché ogni installazione era un aggiornamento, e la blindatura sta nel solo ramo di prima installazione — la stessa cecità della voce sulla 2.10 | **Corretta il 01/09 in `server\installa-pathfinder.ps1`**, non nel pacchetto (§7). Due gesti invece di uno: l'elenco si scrive **sulla sola radice**, poi si spinge in basso con `/reset` **sui figli**, che dà a ognuno l'elenco ereditato dal padre — `/reset` sulla radice no, la rimetterebbe a ereditare da `C:\`. In più la blindatura è stata **spostata dopo il passo dell'applicativo**, così è l'ultimo gesto che tocca il disco e la Verifica passa dopo; e una guardia prova ad **aprire davvero** un file — `Test-Path` diceva `True` anche sui file murati, ed è così che il difetto è passato. **Provato su un albero finto**: col vecchio comando `icacls` esce **0** e il file resta senza nessun ACE; col nuovo il file porta le tre righe `(I)`. **Due prove nuove** in `collaudo-installazione.js` (31 → **33**), e verificate rosse rimettendo ciascuno dei due difetti |
| ~~**82**~~ | Lo sheet tecnico per il team IT era in italiano, e fermo al 28/08 | **02/09 — `documenti/IT-TECH-SHEET.md` è alla REV02, bilingue.** Italiano e inglese nello stesso documento controllato, stessa numerazione di capitolo, e la clausola che in caso di discordanza **prevale l'italiano**. La rev01 è archiviata in `ARCHIVIO\documenti superati\`. **Aggiornata dalla 2.12 alla 2.17**, e il grosso è che il documento dichiarava cose non più vere: il **limite 2** («permessi per ruolo verificati nel client») era una falla di sicurezza dichiarata aperta e **chiusa dalla 2.13 e dalla 2.16** — adesso è barrata con la prova accanto; la **conservazione a sei anni** è uscita e al suo posto c'è la tabella dei quattro regimi con la decisione rimandata alla QA/RA (cap. 8.3). Aggiunti: la via di fuga dell'Admin (8.2), la disinstallazione (6.1), il passaggio dalla 1.4 coi due controlli da fare prima (6.5), due limiti nuovi — **10** la storia di git, **11** la migrazione non ancora provata sui dati veri — e i numeri di collaudo rimisurati (servizio 127 → **141**, installazione 31 → **43**, più gerarchia **40**, ciclo **47**, migrazione **14**). Corretto il rimando a `serverzure`, che non esiste dal 26/08 |
| ~~**80**~~ | Sei export JSON tracciati portavano impronte PIN di persone vere | **02/09 — le impronte sono uscite dai sei file**, in modo chirurgico: `pin_hash`, `pin_salt`, `rec_hash`, `rec_salt` via, tutto il resto byte per byte — 26 righe tolte, conteggi e ogni altro campo verificati invariati. **La storia non è stata riscritta**, per decisione di Andrea: repository privato, e un secondo push forzato nella stessa settimana costa più di quel che rende. **E la lezione è stata imparata come si deve**: non un'altra riga nel `.gitignore` ma **`test/segretiFuori.test.js`**, che apre i JSON tracciati e guarda dentro la collezione `operators`. Verificata rossa rimettendo un'impronta. Un filtro per estensione non reggerà il prossimo formato; guardare dentro sì. **E i backup restano utili senza PIN**: la finestra del primo avvio si riapre, che è il modo giusto di partire su una versione nuova |
| ~~**74**~~ · ~~**73**~~ · ~~**69**~~ | Il registro azzerato, le giacenze sostituite, i conteggi che non tornavano | **02/09 — NON ERA MAI SUCCESSO NIENTE, ed è §0 che mancava.** Questa è la macchina di **sviluppo**, non il magazzino: i conteggi che si accavallano sono prove. **E il file è stato identificato**, da Andrea: `ARCHIVIO\BACKUP E FILE DI TEST\warehouse-mapper-2026-08-20_GIACENZE REALI IN COLLI.json` — il **primo conteggio vero del magazzino**, quello da cui riparte ogni prova di una versione nuova. Porta `articles` **11.197**, `inventory` **882**, `operators` 2 — **gli stessi numeri uno per uno** dei due «incidenti» — e `mov_log` **presente e vuoto**, che per la regola della voce 45 **svuota il registro**. Non è merce persa: è un conteggio di giacenza, e un conteggio non porta movimenti |
| ~~**72**~~ | Un dump del magazzino vero, coi PIN dentro, stava nella storia del repository | **01/09 — LA STORIA È STATA RISCRITTA.** Backup completo prima (`pathfinder-pre-riscrittura-2026-09-01.bundle`, 71,6 MB, «complete history» verificata), poi `git filter-repo --path banco/db/pathfinder-2026-08-27.dump --invert-paths` su 296 commit e **push forzato** su `main`. Verificato dopo: `rev-list --objects --all` non nomina più quel blob, e `GET /contents/…?ref=main` risponde **404**. **Il ramo `claude/…` e la PR #1 non lo portavano**: divergono da prima del commit. Il file resta su disco, e `.gitignore` lo tiene fuori. **Restano due code, e sono la voce 78**: i vecchi commit rispondono ancora per SHA finché GitHub non fa pulizia, e i PIN di quel dump vanno rinnovati quando quegli operatori rientrano |
| ~~**71**~~ | Il banco del ciclo chiedeva a un `TRANSFER` di restare aperto | **Allineato il banco, non il codice**: `chiudeAlGesto` comprende `TRANSFER` per decisione di Andrea alla 2.1. Il residuo si prova dove vive davvero — su un `DISPOSAL`, tre colli esauriti in due volte. `CP1` è uscito da `difetti.json` |
| ~~**70**~~ | Il banco del percorso leggeva un ODP che non era quello della sua ricetta | **Rigenerata da `07082026_gluc.xlsx`**, come deciso da Andrea: `ODP2603889` → **`ODP2607777`**, 15 componenti, 380,25 KG, e la testata del foglio dichiara lo stesso totale. È lo stesso ODP che firma i movimenti veri del dump del 31/08. Il banco del ciclo: **47 verdi, zero rosse** |
| ~~**50**~~ | Un difetto «grave» del ciclo non faceva fallire niente | **Chiusa dalla 2.16 — §3.** Solo `grave` ferma la corsa, `dato` no, e si guarda l'ora e non l'elenco. **Provata dal vivo**: la corsa che aveva alzato `Q1` diceva «47 passed», adesso esce 1 |
| ~~**34**~~ | Undici movimenti senza merce, ed era una famiglia | **Chiusa dalla 2.16 — §3.** Il dump del 31/08 ne porta due con la nota in chiaro: sono le operazioni sull'**unità di carico** scritte nel registro della merce. Adesso hanno la causale `UDC`, e lo spostamento di un'unità scrive **una riga per ogni partita** invece di una riga che non nomina niente |
| ~~**33**~~ | Il registro non diceva quanto, ed era il codice a scrivere | **Chiusa dalla 2.16 — §3**, e in due pezzi: `qty_delta` non contraddice più i suoi estremi, e `quantitaMossa` risponde alla domanda che nessuno faceva — quanti colli hanno cambiato posto. Tredici prove in `registro-completo.test.js`. **Le righe già scritte non si toccano**: si leggono con la funzione nuova |
| ~~**12**~~ | Le unità di carico erano attive e non ne esisteva nessuna | **01/09 — ne era nata una, e i suoi movimenti lo dicono.** Il dump del 31/08 porta «Unità di carico creata: UDC-000001» e il suo spostamento sulla mappa. La collezione `udc` era vuota perché è stata **sostituita**, non perché la funzione non produca niente: è la voce 73, vista da un'altra parte |
| ~~**68**~~ | Il giro dei cinque ODP non era mai girato per intero | **27/08 sera**: girato al banco su copia del database con ODP generati dalle giacenze vere. Una tappa sola, l'ubicazione chiesta una volta, le quote che sommano esattamente il consumo. Ha fatto uscire **tre difetti**, tutti corretti — §3 |
| ~~**66**~~ | I permessi per ruolo stavano nel client: una sessione qualunque e una riga di `curl` bastavano a scriversi `role: "admin"` addosso | **Chiusa dalla 2.13**, e provata dove la regola viene imposta: `banco/gerarchia.cjs`, **32 prove** con `fetch` e i cookie veri. Il Team Leader non si promuove nemmeno passando da una transazione o svuotando la collezione. **In servizio dal 31/08** |
| ~~**64**~~ | Le rotte `/api` non chiedevano credenziali a nessuno | **Chiusa dalla 2.11**, e verificata in produzione il 28/08: `GET /api/c/meta` senza sessione risponde **401**. Resta la voce 66 |
| ~~**56**~~ | L'installer non sapeva consegnare PostgreSQL | **26/08 sera**: `prepara-postgres.ps1` controlla il motore e prepara ruolo e database con `LC_COLLATE 'C'`, generando la password. `migrazione/` viaggia nel pacchetto. Le prove di installazione passano da 22 a 29 |
| ~~**55**~~ | `pg` non era nel servizio installato | **Trovato prima di installare.** Ora l'installer guarda dipendenza per dipendenza come le dichiara `package.json`, nomina quale manca, e si ferma se dopo `npm install` ne manca ancora una |
| ~~**54**~~ | Il database non era normalizzato e la 2.6 lo pretendeva | **Notte del 26/08**, a servizio fermo, con backup fresco e prova a vuoto prima di `--scrivi`. Dopo: **0 codici minuscoli**, la riga doppia di `MAG1-RAKA-01-05-C` è una sola da 6, e il registro porta l'`EDIT` che lo spiega |
| ~~**53**~~ | Il backup cambiava padrone su PostgreSQL | **Chiusa con la 2.7 e provata sul magazzino vero**: `pathfinder-2026-08-26-1909.dump`, 419 KB, 21 tavoli, `exit 0`. La password non passa dalla riga di comando ma da `PGPASSWORD`, nel solo processo figlio |
| ~~**49**~~ | `recipients` vuota, il registro nominava «BIOTECH SRL» dieci volte | **Rientrata UNA riga il 25/08** — le quattro del backup erano lo stesso cliente inserito quattro volte |
| ~~**48**~~ · ~~**48-bis**~~ | La correzione della voce 45 non era in servizio · l'INDEX diceva la versione sbagliata | 2.4 installata il 25/08 sera. **Il documento aveva sbagliato per la quarta volta in cinque giorni**: da allora la riga «in servizio» si scrive solo dopo aver interrogato `/api/app-info` |
| ~~**47**~~ | L'anagrafica dei mittenti andava pulita | 25/08: il giro di banco del 24/08 uscito intero dal database, **e le due giacenze che aveva toccato riportate come stavano** dal backup del 23/08, confrontate campo per campo |
| ~~**46**~~ | L'anagrafica operatori era stata sostituita in blocco | 25/08: `ANDS`, `ANAD`, `BABB` ed `EFBR` rientrati come **storici disattivati e senza PIN** — non possono operare, esistono perché il registro li nomina |
| ~~**45**~~ | Il ripristino cancellava il registro | `importAll` distingue **chiave assente** (il registro resta) da **elenco vuoto** (`mov_log: []`, si svuota). E `_partial` si vede prima di premere |
| ~~**44**~~ | Il registro veniva svuotato dal recupero di un backup automatico | Causa trovata (`writeOPFSBackup` esce con `includeMovLog: false`, `componi` fa `delete data.mov_log`, `importAll` svuotava e poi saltava) e registro ricostruito: 266 movimenti continui dal 07/08 al 25/08 |
| ~~**41**~~ | `app\precedente` portava la 2.3 ritirata | 25/08 sera: `precedente` porta la 2.2, confrontata **file per file**, nove su nove identici |
| ~~**40**~~ | `PATHFINDER_APP` puntava a un file singolo | Refuso dei primi giorni. `/api/app-info` dice `modo: cartella` e comanda `PATHFINDER_APP_DIR` |
| ~~**39**~~ | L'attività pianificata puntava al repository | **La trappola più grossa trovata finora.** Corretta il 25/08 all'01:49 ri-registrando l'attività da `C:\Pathfinder\servizio` — §7 |
| ~~**38**~~ | Le righe già nel vano non hanno misure a conto | Non si pone: **un'installazione pulita parte con il database vuoto** |
| ~~**36**~~ · ~~**32**~~ | Installare 2.3 · 2.2 e vedere i due numeri coincidere | La 2.3 **non si installa** (ritirata). La 2.2 installata il 25/08: `08ce3f69…`, 1.777.087 byte |
| ~~**30**~~ · ~~**29**~~ · ~~**14**~~ | Righe WIP che nessun ordine rivendica · l'archivio ODP non si sfogliava · il campo fantasma sulle giacenze | Chiuse dalla **2.2** — §3 |
| ~~**28**~~ | Il campionamento non sapeva prendere un collo intero | Regola nuova decisa da Andrea il 25/08. **Va ancora portata nel codice: voce 42** |
| ~~**23**~~ | Leggere un'etichetta col lettore vero | Barcode verificato conforme — Andrea, 25/08. Il Code128 è stato letto da un lettore ottico su un foglio stampato da questo codice |
| ~~**20**~~ | Provare le maschere che pretendono l'identità | Provate e funzionanti — smaltimento, trasferimento, prelievo, quarantena, conta, DDT, reso, chiusura del conto. Andrea, 25/08 |
| ~~**18**~~ | Due sigle firmavano movimenti e non erano in anagrafica | 25/08: `DP` è **Daniele Pedrazzi**, `AS` non compare più. **Nessuna firma orfana su 264 movimenti** |
| ~~**4**~~ · ~~**2**~~ | Quattro attività rimaste `in_progress` · provare il pacchetto su una macchina pulita | Annullate · fatta, conforme — Andrea, 25/08 |

---

## 5. Comandi

```bash
npm run dev      # sviluppo, ricarica a caldo — ATTENZIONE: parla col servizio VERO
npm run build    # produce "consegna/Pathfinder <ver>/" — il pacchetto da consegnare
npm run check    # tsc client + servizio, nessun file emesso
npm test         # vitest — 1.303 prove in 48 file al 03/09
```

```bash
node test/collaudo.js                    # 156 prove sul servizio, da server\
node test/collaudo-migrazione-1.4.js     # 8 prove sul cambio di schema, da server\
node test/collaudo-installazione.js      # 43 prove sugli script di installazione, da server\
node test/collaudo-stampa.js             # 100 prove sulle etichette Zebra, da server\
```

`collaudo-stampa.js` **non ha bisogno di una stampante**: alza un finto
ascoltatore sulla 9100 e legge i byte che gli arrivano. Quel che invece una
stampante la vuole — che l'etichetta esca dritta, che le barre le legga un
lettore vero, che il calore sia giusto per il supporto montato — sono le
**voci 83 e 89**.

`SINGLE_FILE=1 npm run build` riproduce il file unico di prima.

### Il banco di prova

**È l'unico posto dove si prova una versione prima di installarla**: copia a
caldo del database, porta sua, cartelle sue. Sta in `MAPPER\banco\`.

> **La prima riga qui sotto chiede una copia al servizio vivo, e dal 01/09 quel
> servizio ha un database vuoto**: la copia esce, ma dentro non c'è niente.
> Finché il magazzino non rientra (voce 74) il banco riparte da un file già
> salvato: `banco\db\ui.db`, oppure uno dei `.db` in
> `Desktop\pathfinder-backup-storico\`. Da un `.dump` no — quello è PostgreSQL,
> e il banco gira su SQLite.

```powershell
$BANCO = "$PWD\banco"
Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup -ContentType 'application/json' -Body (@{dir="$BANCO\db"} | ConvertTo-Json)
.\server\installa-versione.ps1 -Da ".\consegna\Pathfinder <ver>\app" -Versione <ver> -Casa "$BANCO\app"
$env:PATHFINDER_PG=''; $env:PATHFINDER_PORT='4199'; $env:PATHFINDER_DB="$BANCO\db\pathfinder-<data>.db"; $env:PATHFINDER_APP_DIR="$BANCO\app\corrente"; node server\pathfinder-server.js
```

**`PATHFINDER_PG=''` apre la riga e non è un ornamento**: senza, il banco
eredita dalla macchina la connessione al database **in servizio** e scrive nel
vero, con la porta e il file di banco che dicono il contrario. Il servizio
dichiara all'avvio quale database ha aperto: **quella riga si legge prima di
toccare qualunque cosa.**

Per il front end, invece di costruire e installare:

```powershell
$env:PATHFINDER_DEV_API='http://127.0.0.1:4199'; npm run dev     # 5173, parla col banco
```

Senza quella variabile `npm run dev` parla col servizio **vero** sulla 4173.
**Dalla 2.14 c'è un modo che non si può sbagliare** — `node banco\dev-banco.mjs`
impone la variabile prima di accendere vite e apre sulla **5199**: una finestra
di sviluppo attaccata al magazzino vero non esiste più per costruzione.

### Il banco della schermata WIP — 2.14

Un banco suo, con dentro **merce in lavorazione** su cui provare la lista, il
reso e lo storno. Tre pezzi, e si rifanno in quest'ordine:

```powershell
# 1 · il database: copia del pristino, con un Admin di cui si conosce il PIN
Copy-Item banco\db\pristino.db banco\db\ui.db -Force
# (l'operatore ANDS del pristino è stato portato ad admin con PIN 481516 —
#  è una copia usa-e-getta, e quel PIN non esiste da nessun'altra parte)

# 2 · gli ODP di prova, generati DA QUEL database
node banco\genera-odp-wip.cjs          # esce in banco\odp-wip\

# 3 · il servizio e il front end
$env:PATHFINDER_PG=''; $env:PATHFINDER_PORT='4199'
$env:PATHFINDER_DB="$PWD\banco\db\ui.db"
$env:PATHFINDER_APP_DIR="$PWD\banco\app\corrente"
node server\pathfinder-server.js
node banco\dev-banco.mjs               # 5199, front end di sviluppo
```

**`genera-odp-wip.cjs` LEGGE I LOTTI DAL DATABASE, e non è un dettaglio.**
Quello della 2.12 li scrive fissi — presi dal magazzino del 27/08 — e su un
database diverso quelle righe non trovano niente: il percorso nasce vuoto, e
la prova non prova niente. Questo cerca i lotti che dichiarano **unità e
quantità per collo** (senza, la ripartizione del consumo non si calcola),
preferisce i chili ai pezzi, e scrive cinque ODP per il giro, uno a due righe
per il reso e uno per il ricalibro.

`banco\banco-ui.js` sono gli attrezzi da iniettare nella pagina quando si
prova a mano: `__audit()` misura i campi che non ci stanno, `__odp(...)` carica
i file nella schermata, `__preleva(...)` fa un giro intero fino alla chiusura.
**Modificarlo fa ricaricare la pagina** — vite guarda tutta la radice — quindi
si finisce prima di accendere il banco.

> **Il banco sulla 4199 va spento prima di `node test/collaudo.js`**: le prove
> del servizio si aprono una porta loro, ed è la 4199. Con il banco acceso
> muoiono su `EADDRINUSE`.

> **Il banco non va mai in `C:\Pathfinder\`.** Ci è finito una volta, il 17/08.

### Il banco del prodotto finito — 2.20

Non è automatico: è un giro da fare a mano su una copia usa-e-getta, e ci
vogliono dieci minuti. **Serve un Admin di cui si conosca il PIN**, e su una
copia del pristino il modo più corto è svuotare `operators` e lasciare che la
finestra di primo avvio ne chieda uno nuovo — §1: appena `operators` è a zero
il servizio riapre quella porta, ed è la stessa che si richiude da sé al primo
Admin creato.

```powershell
Copy-Item banco\db\pristino.db banco\db\ui.db -Force
```

Poi si accende il banco come sopra e si fa questo giro, **con la finestra
stretta almeno una volta** — la maschera è del reparto, e il reparto ha un
terminale da 4,3":

1. Configurazione → **Parametri articolo** → un modello di imballo (EPAL 8 × 5,
   tara 25).
2. Configurazione → **Siti e Zone** → si marca una zona come **prodotto
   finito** (sul pristino: `M03 / SPEDIZIONI`).
3. Movimenta → **Prodotto finito** → nuovo bancale → articolo, lotto,
   scadenza, colli (proposti dal modello) → **Chiudi bancale**: nasce l'unità,
   entrano le righe con causale `PROD`, e si apre la stampa dell'etichetta.
4. L'elenco lo mostra **pronto**; «Vedi in mappa» lo tinge di verde nel vano.
5. Si spunta, **Carica in DDT**, si compila la testata, si registra, si evade:
   il bancale diventa **spedito** e il registro porta `SHIP`.
6. **Conto terzi**: si spunta «la merce si sposta» su una causale, si rifà il
   giro indicando un'ubicazione di arrivo, e all'evasione la merce **è nel vano
   d'arrivo** invece di essere sparita.
7. **Packing list**: dal DDT pendente o dall'archivio, il pulsante accanto a
   quello del DDT.

**Il giro del 03/09 è passato tutto**, e ha trovato due difetti che nessuna
prova da ferma vedeva — §3, il riquadro su `dest_location`.

**Le cariche hanno un banco loro, e non chiede niente a questo** — dalla 2.13:

```powershell
node banco\gerarchia.cjs      # 32 prove, database temporaneo, porta 4198
```

Accende un servizio suo su un database usa-e-getta, esercita le rotte con
`fetch` e coi cookie veri, e si spegne. **Non tocca `banco\db`** e non
vuole il banco del ciclo acceso: la porta è la 4198, non la 4199.

---

## 6. Come si consegna

**Costruire non è consegnare, e consegnare non è servire.**
| Luogo | Chi ci **scrive** | Chi ci **legge** |
|---|---|---|
| `consegna\Pathfinder <ver>\` — il **pacchetto** | `npm run build`, che azzera `consegna\` a ogni giro | chi installa, a doppio clic — **mai il servizio** |
| `C:\Pathfinder\app\pathfinder-<ver>\` — il **deposito** | `installa-versione.ps1`, che **rifà la cartella a ogni installazione** di quel numero | nessuno direttamente |
| `C:\Pathfinder\app\corrente\` e `precedente\` | i due script, che ci **materializzano** una versione | **il servizio** |
| `ARCHIVIO\` | l'archiviazione | nessuno |

**`corrente` è una copia, non un rimando**: sono cartelle vere di cui
l'installazione sostituisce il contenuto, costruendolo accanto e rinominando —
la finestra in cui `corrente` è incompleta dura quanto un `rename`, e chi
carica la pagina in quell'istante trova i suoi assets in `precedente`. **Quale
versione sta dove lo dice il manifesto**, non un registro accanto.

### Il pacchetto

```
Pathfinder <ver>\
  Installa Pathfinder.bat     ← doppio clic, INVIO, fine
  installa.ps1                il motore
  LEGGIMI.txt
  app\                        indice, assets, manifesto
  servizio\                   il servizio dati, i suoi script, migrazione\ e il README
```

**Una versione è l'applicativo più il servizio, e si installano insieme** —
dal 18/08. Prima un aggiornamento toccava il solo applicativo e `/api/app-info`
rispondeva due numeri diversi: due numeri per una versione sola sono un numero
che non vuol dire niente.

- **Prima installazione**: chiede **dove** (INVIO accetta `C:\Pathfinder`), poi
  fa tutto — prepara ruolo e database su PostgreSQL, copia il servizio,
  registra l'avvio all'accensione e il backup serale, apre la porta sul
  firewall, installa l'applicativo.
- **Aggiornamento**: **non** chiede dove, lo rilegge da `PATHFINDER_APP_DIR`, e
  una radice diversa la **rifiuta**. Ferma il servizio, copia applicativo **e**
  servizio, riaccende.

Alla fine verifica **due** cose: l'impronta dell'applicativo e che
`service_version` sia quel numero. Se il servizio dice ancora il numero di
prima, il riavvio non ha avuto effetto e l'installazione è fallita.

**Per vedere cosa farebbe senza toccare niente**: `.\installa.ps1 -NonChiedere -Prova`.

### Il database, dalla 2.7

**Una prima installazione nasce su PostgreSQL.** `prepara-postgres.ps1`
controlla che il motore ci sia — psql, `pg_dump`, `pg_restore`, servizio
Windows, porta, superuser — e **se manca dice dove si prende e si ferma senza
toccare niente**: su un PC di magazzino un download è l'antivirus che blocca e
l'IT che chiede conto. `pg_dump` e `pg_restore` si guardano **prima**, non alla
prima sera utile: su PostgreSQL il backup è fatto di quei due.

**La password del ruolo la genera l'installer, e nessuno la digita** (il 26/08 il
segnaposto `LA-TUA` è finito dentro la variabile di macchina). L'alfabeto è
quello che in un URL vale sé stesso: una `@` spezzerebbe la stringa di
connessione. Si vede **una volta sola** e poi vive solo in `PATHFINDER_PG`. La
password di `postgres` serve **una volta**, la chiede la finestra elevata, e
non passa mai per la riga di comando.

**Il database che sta già servendo un magazzino non si tocca**, e **aggiornando
resta quello su cui si trova**. Il passaggio si chiede a voce:

```powershell
.\installa.ps1 -Database postgresql   # da SQLite a PostgreSQL, MIGRANDO i dati
.\installa.ps1 -Database sqlite       # sul file, come fino alla 2.6
```

Il passaggio fa, in quest'ordine: chiede al **servizio ancora acceso** una copia
a caldo (un SQLite aperto ha un WAL accanto, e `Copy-Item` si porta via un
database a metà), ferma, rinfresca servizio e dipendenze, migra ricontrollando
i conteggi tavolo per tavolo, e **solo se arriva in fondo** riscrive
`PATHFINDER_PG` e riaccende. Una migrazione fallita a metà lascia il magazzino
sul file, intatto. **Non si scrive sopra un database che ha già dei tavoli**:
chi vuole partire vuoto lo chiede con `-SenzaMigrazione`. `-Database sqlite` su
una macchina già su PostgreSQL **viene rifiutato**: il gesto d'emergenza resta
`installa-servizio.ps1` senza `-PostgreSQL`.

### Regole dell'installazione

> **Il servizio non gira mai dal pacchetto**: viene copiato in
> `C:\Pathfinder\servizio` e registrato da lì. Altrimenti il magazzino si ferma
> il giorno che si sfila la chiavetta.

> **Prima disinstalla, poi installa — sempre.** Un numero nel deposito
> significa «gli ultimi byte installati con quel nome». Fino al 18/08
> l'installer passava `-Riusa`, e chi rifaceva la build senza cambiare numero
> restava ai byte di ieri: successo due volte con la 1.8.1 nella stessa notte.

> **Reinstallare la stessa versione non tocca `precedente`.** Si muove solo
> quando cambia **il numero** in servizio.

> **Gli script di gestione delle versioni si rinfrescano dal pacchetto** a ogni
> aggiornamento, anche quando il servizio non si tocca: nessuno li sta
> eseguendo, al contrario di `pathfinder-server.js`.

> **L'autorizzazione di Windows serve a ogni installazione**, non più solo alla
> prima (fermare un'attività che gira come SYSTEM la vuole), e l'applicativo
> **resta giù i secondi del riavvio**. È la promessa della 1.7 che cade, ed è il
> prezzo di avere un numero solo.

> **`/inheritance:r` E `/T` NELLA STESSA RIGA SVUOTANO L'ELENCO DEI FIGLI — 01/09.**
> Quella coppia scende su ogni file e gli toglie gli ACE ereditati, mentre i
> `/grant` restano sull'oggetto nominato: si trovano file **senza nessun ACE**,
> e un elenco vuoto nega tutto — a un Amministratore, a SYSTEM, e persino alla
> lettura di chi sia il proprietario. **Chi stringe i permessi di un albero lo
> fa in due gesti**: l'elenco sulla radice, poi `/reset` **sui figli** perché
> ereditino. Voce 75, e prima ancora una cartella che non si cancellava più
> (voce 74): la stessa riga, due serate.

> **UNA COSA CHE ESCE CON ZERO NON È UNA COSA RIUSCITA.** `icacls` murava i
> file e usciva `0`, e l'installer scriveva «Permessi applicati» in verde. Dove
> il gesto si può guardare, si guarda il **risultato** e non il codice di
> uscita: qui si prova ad **aprire** un file che deve restare leggibile —
> `Test-Path` risponde `True` anche su un file murato, ed è così che il difetto
> è passato.

> **LA PROVA A VUOTO NON PROVA LA PRIMA INSTALLAZIONE.** Il 01/09
> `installa.ps1 -Prova` ha detto «strada prima installazione» e non ha trovato
> niente da segnalare; la corsa vera si è rotta due volte, sui permessi e su
> una cartella rimasta da un tentativo interrotto. **`-Prova` legge, non
> scrive**: dice quale strada prenderebbe, non che quella strada regga. Su una
> macchina vergine la corsa vera va guardata riga per riga.

> **UN'INSTALLAZIONE INTERROTTA LASCIA UNA CARTELLA CHE LA SUCCESSIVA NON
> SOVRASCRIVE.** Il tentativo delle 00:25 si era fermato dopo il servizio,
> lasciando `C:\Pathfinder\servizio` già blindato; il tentativo dopo è morto su
> `Copy-Item : Accesso al percorso 'lib\db.js' negato`. **Dal 01/09 non tocca
> più a chi installa**: l'installer si accorge dei resti murati e li riapre da
> sé, dicendolo; e chi vuole ripartire davvero pulito ha
> `.\installa.ps1 -Disinstalla` (§6). Resta scritta perché su ogni macchina
> che non ha ancora questo installer il rifiuto parla di un file di cui chi
> installa non ha mai sentito nominare.

### Installare a mano, e tornare indietro

```powershell
npm run build
.\server\installa-versione.ps1 -Da ".\consegna\Pathfinder <ver>\app" -Versione <ver>
Invoke-RestMethod http://127.0.0.1:4173/api/app-info
```

Deve rispondere la versione attesa **e la sua impronta**, e **nessun campo
`errore`**. Se compaiono `errore` e `utente`, quella riga dice di cosa è morto
il servizio e con quale conto stava girando.

**La via di ritorno è una sola: si reinstalla il pacchetto della versione che
si vuole.** È il solo gesto che riporta indietro anche il servizio.
`torna-indietro.ps1` c'è ancora e funziona, ma **riporta indietro solo metà
versione**: scambia due cartelle di applicativo e lascia il servizio dov'è — i
due numeri di `/api/app-info` non coincidono più, che è il segno che di solito
vuol dire «installazione non riuscita». Lo script lo scrive a chi lo esegue.

**Il database non si tocca mai**: la 1.2 rilegge il database della 1.4, e lo
dimostrano le 8 prove di `collaudo-migrazione-1.4.js`.

### Togliere Pathfinder da una macchina — dal 01/09

```powershell
.\installa.ps1 -Disinstalla -Prova              # dice cosa toglierebbe
.\installa.ps1 -Disinstalla                     # lo toglie
.\installa.ps1 -Disinstalla -AncheIlDatabase    # e toglie anche il database
```

Toglie le due **attività pianificate**, la **regola del firewall**, le
**variabili di macchina** `PATHFINDER_*` e la **radice** con tutto quello che
ci sta sotto. **PostgreSQL e Node restano**: non erano nostri.

**Prima di togliere qualunque cosa, salva.** Chiede al servizio ancora acceso
una copia fresca del database, poi porta tutta la cartella `backup\` **fuori
dalla radice**, sul Desktop in `Pathfinder-disinstallato-<data-ora>\`. **Se il
salvataggio non riesce, si ferma**: senza una copia non si cancella un
magazzino — il 31/08 quarantacinque movimenti GMP si sono salvati perché
qualcuno si è ricordato di copiarli a mano.

**Il database non cade da solo**, e nemmeno con una spunta: vuole
`-AncheIlDatabase`, e la conferma da digitare diventa **il nome del database**.
La rimozione la fa `prepara-postgres.ps1 -Rimuovi`, cioè lo script che quel
database lo crea — e cade **prima** della radice, perché una cartella tolta con
un database vivo si rifà in dieci minuti e il contrario no.

**Se la radice è murata la riapre** (`takeown` + `icacls /reset`): è il caso
normale, non l'eccezione, perché i permessi se li è stretti da sola —
voce 75.

> **NON C'È UN DOPPIO CLIC PER DISINSTALLARE, e non è una dimenticanza.**
> `Installa Pathfinder.bat` lancia l'installer senza argomenti: per togliere
> bisogna aprire PowerShell e scriverlo. La conferma poi **si scrive** —
> `DISINSTALLA`, o il nome del database — perché una spunta si preme per
> sbaglio e una parola no.

---

## 7. Le trappole già pagate

Ognuna è costata almeno una volta. Non sono opinioni.

### Il numero di versione

- **STA IN QUATTRO POSTI, E `package.json` NON BASTA.**
  1. `VERSIONE` in `vite.config.js` — nome della cartella di consegna e numero in pagina;
  2. `VERSION` in `server/pathfinder-server.js` — `service_version`;
  3. `VERSIONE_APP` in `src/core/pacchetto.ts` — il timbro dentro ogni export e
     nel **piede di ogni documento stampato**;
  4. `package.json`, che porta tre cifre (`2.12.0`) e che **la build non legge**.

  Ha fatto danni due volte: la prima build della 2.1 uscì chiamandosi
  «Pathfinder 2.0» coi byte della 2.1; e l'installazione della 2.12 **fallì**
  perché il servizio diceva ancora 2.11. Il controllo ha funzionato, ma il
  messaggio parla di **riavvii**, che è la causa più comune e non l'unica.
  Ogni documento stampato ha detto «Pathfinder 2.9» per tre versioni perché il
  terzo era rimasto indietro. **Adesso lo dice `npm test`**:
  `test/versioni.test.js` legge tutti e quattro. Non si fanno discendere da una
  sorgente unica apposta: sarebbe il servizio che importa la configurazione
  della build.
- **E il pacchetto va RICOSTRUITO dopo aver toccato quel numero.** L'impronta
  dell'applicativo non cambia (copre `index.html` e `assets/`), ma il pacchetto
  sul disco continua a portare il servizio vecchio.
- **Il numero della build non è il numero del codice**: finché i file dicono
  `1.7`, ogni build fatta mentre si costruisce la versione dopo produce una
  `Pathfinder 1.7\` con byte diversi da quella in servizio. **Il numero si alza
  prima di costruire, mai dopo.**
- **Una costruzione «per vedere se compila» sostituisce un pacchetto pronto.**
  Il 19/08 una build di verifica ha riscritto `Pathfinder 1.8.4\` con dentro
  anche 1.9, 1.10, 1.11 e 1.12. **Prima di costruire si copia il pacchetto che
  aspetta un'installazione**, e a ripristino avvenuto **si chiede al servizio**,
  non alla cartella.

### `consegna\`, OneDrive e la build

- **La build ASPETTA, dalla 2.12.** `consegna\` sta dentro OneDrive: la build ci
  scrive 1,8 MB, la sincronizzazione parte subito, e la build dopo la trova
  occupata mentre Vite prova a svuotarla — segnaposto OneDrive, reparse tag
  `0x9000e01a`, a volte in sola lettura. **Il blocco è transitorio** (misurato
  due volte il 27/08: la stessa cancellazione riesce da sola qualche secondo
  dopo). Quindi `emptyOutDir` è spento e svuota `svuotaLaConsegna()` in
  `vite.config.js`, che riprova per **30 secondi** togliendo la sola lettura.
  Se non passa, è qualcuno che tiene la cartella — quasi sempre la finestra
  dell'installer rimasta su «Premere un tasto per chiudere» — e il messaggio lo
  dice. **`consegna\` non si sposta fuori da OneDrive**: quel percorso è scritto
  in §6, nel LEGGIMI del pacchetto e nella testa di chi installa.
- **Un installer aperto blocca `npm run build`**, e il segno che lo distingue da
  tutto il resto è che **i file dentro si cancellano e la cartella no**. È un
  handle sulla directory. `Get-CimInstance Win32_Process | Where CommandLine
  -like '*consegna*'` dice in due secondi chi la tiene. **Non è l'attributo
  `ReparsePoint`**: OneDrive lo mette su *ogni* voce sincronizzata.
- **La produzione non legge mai da `outDir`.** Il 14/08 la variabile puntava
  dentro la cartella che la build azzera — e lì dentro c'era anche il servizio
  col suo `node_modules`.
- **Mai `express.static` sulla cartella-versione intera**: escono solo
  `index.html` e `assets\`, e la rotta accetta **un nome, non un percorso**.
- **`index.html` resta `no-cache`, gli assets `immutable`.** Invertirli è il
  difetto peggiore possibile: i terminali resterebbero su una versione vecchia
  senza modo di uscirne.

### Il servizio e la macchina

- **UN FIX SCRITTO NEL PACCHETTO MUORE ALLA BUILD SUCCESSIVA.** La correzione
  della 2.12.1 — quella che tiene su il magazzino all'accensione — era scritta
  in `consegna\Pathfinder 2.12.1\servizio\` e in `C:\Pathfinder\servizio\`,
  e **non** in `server\`. La build copia `server\` dentro il pacchetto e mai
  il contrario: la 2.13 costruita senza accorgersene avrebbe rispedito in
  magazzino il difetto del 28/08, **coi collaudi tutti verdi e l'impronta in
  regola** — l'impronta copre `app\`, non `servizio\`. Trovata il 31/08
  confrontando i due alberi file per file, ed è il confronto da rifare ogni
  volta che si è toccata una macchina in emergenza. **Quel che si corregge di
  corsa si riporta nel sorgente prima di costruire.**
- **L'AVVIO ALL'ACCENSIONE HA DUE DIFESE, E LA SECONDA NON È QUELLA CHE
  SEMBRA.** Dalla 2.12.1 il servizio **aspetta** il database fino a novanta
  secondi (`PATHFINDER_PG_ATTESA_AVVIO`, a `0` la spegne) invece di decidere
  in duecento millisecondi, e l'attività pianificata parte un minuto dopo
  l'accensione (`$trigger.Delay = 'PT1M'`). «Riavvia in caso di errore»
  dell'Utilità di pianificazione **ripesca le attività che non riescono a
  partire, non quelle il cui processo esce con un codice diverso da zero**:
  resta perché copre il caso che copre — un processo ucciso, una macchina in
  affanno — ma non è lei a garantire l'accensione. **La regola non si
  rovescia**: senza database il servizio continua a non partire, smette solo
  di deciderlo in fretta.
- **L'attività pianificata registra il percorso DA CUI VIENE LANCIATA.** Il
  10/08 `installa-servizio.ps1` fu lanciato dalla cartella di lavoro, e per
  quindici giorni **il magazzino ha eseguito il file del repository**: chi
  lavorava al progetto scriveva in produzione senza saperlo, e **nessuna
  installazione poteva riuscire** perché il controllo finale leggeva il file
  sbagliato. Corretto il 25/08. **Chi lancia `installa-servizio.ps1` lo lancia
  dal sorgente o da `C:\Pathfinder\servizio`, mai da una cartella di consegna.**
- **Il servizio gira come SYSTEM e NON ATTRAVERSA UNA GIUNZIONE.** `stat` su
  `C:\Pathfinder\app\corrente` muore con `UNKNOWN: unknown error`, la pagina va
  in 500. Non sono i permessi, non è il tag di reparse: lo stesso percorso, con
  lo stesso codice, si apre da una sessione utente. Per questo `corrente` e
  `precedente` sono **cartelle vere di cui si sostituisce il contenuto**.
- **Un servizio che non sa dire di cosa muore costa ore** — tre, il 17/08. Ora
  `/api/app-info`, **solo quando qualcosa non va**, porta `errore` col codice
  vero e `utente` col conto del processo: **chi tocca il servizio non tolga quei
  due campi**.
- **`Get-ScheduledTask` senza diritti non dice «accesso negato»: non
  restituisce niente.** Su questa macchina ha risposto vuoto — 219 attività
  viste, nessuna di Pathfinder — e sembrava che il magazzino non sarebbe tornato
  su da solo al riavvio. Era falso. **Una lettura andata a vuoto somiglia in
  tutto a un'assenza, e le due conclusioni sono opposte.** Da non elevati si usa
  `schtasks /query /tn <nome>`, che almeno l'accesso negato lo dice; la
  controprova che non mente è che il processo sulla 4173 è **figlio di
  `svchost.exe`**.
- **`node_modules` che esiste non vuol dire che sia quello giusto.** Si guarda
  dipendenza per dipendenza come le dichiara `package.json`.
- **Un controllo che grida al lupo su un'installazione riuscita è come non
  averlo.** La verifica finale confrontava il database aperto col percorso del
  file SQLite: su PostgreSQL un'installazione perfetta usciva con «il servizio ha
  aperto un altro database» e codice 1.
- **Un segnaposto in una riga di comando viene incollato com'è** (`LA-TUA`
  finito dentro la variabile di macchina). Meglio farselo comporre, o passarlo
  da un file. Non ha fatto danni perché **il servizio si rifiuta di partire
  senza database**.
- **Percorsi Windows oltre 260 caratteri**: `npm install` è il primo a
  romperlo. **`better-sqlite3`** va tenuto a una versione con binario già
  compilato per il Node installato. **Una collezione nuova non esiste finché il
  servizio non riparte** (`server/lib/schema.js` si legge all'avvio).
- **Prima di cancellare o spostare un file dalla radice, chiedere al servizio
  quale sta servendo.** Il 13/08 `pathfinder-1.4.3.1.html` fu rimosso credendolo
  non servito: lo era. Persa **l'unica copia** di quella versione.
- **Mai `Remove-Item -Recurse` su una giunzione**: PowerShell 5.1 può seguire il
  collegamento e svuotare **la destinazione**. Si usa
  `[System.IO.Directory]::Delete($p, $false)` o `cmd /c rmdir`. La funzione
  giusta sta in `installa-versione.ps1`.

### PowerShell, codifiche, fine riga

- **`powershell -File script.ps1 -ParametroCheNonEsiste` NON dà errore**: lo
  scarta in silenzio e manda avanti lo script. Chi credeva di simulare **ha
  installato**. Quel che PowerShell scarta finisce in **`$args`**: un `.ps1` che
  fa qualcosa di irreversibile guardi `$args` prima di muoversi.
- **`Start-Process -ArgumentList` non mette le virgolette, e psql non protesta.**
  `@('-c', 'SELECT count(*) FROM x')` incolla l'elenco con degli spazi, e psql
  **esce con 0** senza niente in mano: `[int]''` fa **0**, e uno zero lì dentro
  voleva dire «database vuoto, ci si può migrare sopra» su un magazzino con
  11.197 articoli. Due correzioni: le virgolette a mano, e **una risposta vuota
  non è uno zero** (`-match '^\d+$'`). La query viaggia in un file con `-f`, non
  in riga di comando.
- **Le barre rovesciate non sopravvivono a due livelli di virgolette.**
  `'C:\Pathfinder\data\pathfinder.db'` dentro un `node -e "…"` da shell POSIX
  arriva come `C:Pathfinderdatapathfinder.db`, e `better-sqlite3` **crea** quel
  file: un database vuoto che risponde `0 righe` con la faccia seria. Nei
  percorsi Windows dati a Node **si usano le barre in avanti**.
- **`open(percorso, 'w')` tronca prima di scrivere**: una `UnicodeEncodeError` su
  un emoji ha azzerato `giacenze.ts`, 37 KB, prima di scrivere la prima riga.
  Uno script che riscrive un sorgente **compone tutto in memoria e apre in
  scrittura per ultimo**.
- **Uno script `.ps1` con caratteri non ASCII vuole il BOM**; **un manifesto si
  legge togliendo il BOM** (`Out-File -Encoding utf8` lo scrive e `JSON.parse` ci
  lancia sopra: costava versione e impronta nulle dopo un ritorno indietro).
- **PowerShell distrugge gli accenti**: `Get-Content -Raw` in 5.1 decodifica in
  CP1252 quando il file non ha il BOM. Per riscrivere in blocco si passa da
  **Node, UTF-8 senza BOM**.
- **CHI MODIFICA UN FILE DA UNO SCRIPT LO RILEGGE IN BINARIO.**
  `.gitattributes` dice `* -text`: Git non deve toccare i fine riga. Uno script
  che rilegge in modalità testo e riscrive con `newline=''` **converte CRLF in
  LF senza dirlo**, e il diff passa da 4.248 righe a **13.016**.
  **RIPAGATA IL 03/09**, con questa riga già scritta: venti file del prodotto
  finito sono stati riscritti così, e i nove commit portano dentro interi file
  «modificati» che avevano cambiato una riga sola. Rimessi a CRLF con un
  passaggio in binario, e **l'impronta del pacchetto non è cambiata** — il
  bundle i fine riga del sorgente non li vede. Resta un file solo diverso da
  com'era: `spedizioni.ts` aveva **4 righe CRLF su 1.200**, e adesso è LF per
  intero. Una prova che guardi i fine riga non c'è, e sarebbe la cosa che
  chiude davvero questa voce. **I fine riga
  non sono uniformi**: `quarantena.ts` è LF, `spedizioni.ts` è misto, quasi
  tutto il resto è CRLF — uno script che cerca un blocco convertendo a CRLF non
  lo trova nei file LF, e «zero occorrenze» somiglia a «quel codice non c'è
  più». **È successo di nuovo il 28/08, e il verso era l'opposto di quel che
  il documento supponeva**: le blob di sei file erano **LF**, e qualcosa le
  aveva riscritte tutte in **CRLF**, gonfiando il diff da 995 righe vere a
  5.108. Raddrizzato il 31/08 togliendo i CR da quei sei e basta. **Il verso
  non si indovina: si misura**, confrontando `git diff` con
  `git diff --ignore-cr-at-eol` file per file. Vale anche per questo
  documento, che è **LF** e va tenuto tale.
- **Caricare file dall'interfaccia web di GitHub scrive un albero che non
  esiste.** Il 19/08 il remoto dichiarava build 1.8.4 **senza
  `src/modules/documenti.ts`**, che della 1.8.4 è il pezzo centrale. **Un
  caricamento dal browser non è un commit: è un commit su una base che non si è
  scelta.** Il codice si spinge con `git push`, e se il push viene rifiutato si
  guarda cosa c'è dall'altra parte prima di insistere.

### Prove e collaudi

- **UN BANCO CHE SVUOTA TAVOLI NON DEVE POTER PUNTARE A UN DATABASE DI LAVORO.**
  `test/driver.test.js` e il banco PostgreSQL fanno `TRUNCATE` a ogni corsa: una
  corsa di `npm test` ha portato via gli **11.197 articoli appena migrati**, e
  **nessuna prova era fallita**, perché il danno lo faceva il collaudo facendo
  quel che doveva. Adesso si usa **`PATHFINDER_PG_COLLAUDO`** e **non si ripiega**
  su `PATHFINDER_PG` quando manca: si salta dicendo perché. Seconda guardia sul
  nome: il database deve finire per `_collaudo`.
- **E il servizio di banco eredita `PATHFINDER_PG` dalla macchina.** Quella
  guardia copre i collaudi, non il banco: si accende **passando la variabile
  vuota nella stessa riga** — §5.
- **`npm run dev` NON è al riparo**: la pagina servita da Vite parla col servizio
  vero sulla 4173, perché l'adapter remoto non guarda da quale porta arrivi.
- **Non installare senza aver aperto la versione in un browser**, contro una
  copia del database vero. `tsc` dice se il codice è coerente, i collaudi dicono
  se le parti fanno quel che promettono, **e nessuno dei due dice se
  l'applicativo funziona**: i difetti peggiori di ogni versione li ha trovati il
  banco, con tutto verde.
- **UN BANCO CHE GIRA CON UN ALTRO CONTO NON PROVA UN RILASCIO.** Lo scambio di
  versione era stato provato quattro volte, tutto verde — ma il banco lo avvia
  una persona e gira nella sua sessione, e il difetto esisteva **solo** per il
  conto con cui gira il servizio. Costò tre ore di applicativo giù. **Ciò che un
  banco non riproduce va scritto accanto ai suoi risultati.**
- **Un controllo che passa subito potrebbe non controllare niente**: un collaudo
  si prova **rompendo il codice** e vedendolo fallire. I valori di prova si
  scelgono dove il difetto vive: «5,5 − 0,1 − 0,2» passa anche senza
  arrotondamento, `0,3 − 0,1` no. **I collaudi si scrivono prima.**
- **Un valore atteso scritto a memoria non è una prova.** La prima prova sulla
  cifra di controllo GS1 diceva `1` perché quel numero non era stato calcolato:
  aveva ragione l'implementazione. O si rifà il conto a mano **e lo si scrive nel
  commento**, o si prova una **proprietà** (per l'SSCC: che la somma pesata
  chiuda a multiplo di dieci).
- **Un pannello che ridimensiona non manda `resize` alla pagina**, e **non
  compone i fotogrammi**: ogni proprietà in transizione resta al valore di
  partenza e sembrano difetti che non esistono. Si spengono le transizioni prima
  di misurare:
  ```js
  document.head.insertAdjacentHTML('beforeend',
    '<style>*,*::before,*::after{transition:none!important;animation:none!important}</style>');
  ```
- **UN CLIC A COORDINATE SU UN'INTERFACCIA CHE SI RIDISEGNA FINISCE DOVE NON
  DEVE.** Due volte nella stessa mezz'ora il 26/08: una casella della matrice
  accesa per sbaglio e salvata a database, e l'operatore `admin` della voce 60.
  Su questo applicativo si verifica **leggendo lo stato** — `read_page`, o le
  funzioni pure chiamate da consolle — non premendo bottoni a occhio: **ogni
  bottone qui dentro scrive nel magazzino di qualcuno.**
- **Un audit si passa anche dopo, non solo prima.** Lo script che maiuscola i
  codici firmava le fusioni `SISTEMA`, che non era in anagrafica: avrebbe
  riaperto la voce 18. L'ha trovato l'audit stesso, girato sul risultato.

### Codice

- **Un flag d'istanza non dice «sono dentro una transazione».** Con
  un'interfaccia asincrona una seconda richiesta HTTP lo trova alzato e il suo
  corpo gira **dentro la transazione di un altro terminale**. Su SQLite non si
  vede mai (gli `await` si risolvono in microtask): si è visto **alla prima corsa
  su PostgreSQL**. La cosa giusta è **`AsyncLocalStorage`**, che segue la catena
  asincrona invece dello stato dell'oggetto.
- **Un `ON CONFLICT` senza la chiave nella INSERT non scatta mai**: `put` deve
  scrivere `_id` fra le colonne. Il sintomo non è un errore: è **una riga nuova a
  ogni salvataggio**.
- **Due database non nominano allo stesso modo lo stesso rifiuto**
  (`SQLITE_CONSTRAINT_UNIQUE` contro SQLSTATE `23505`), e non decodificano allo
  stesso modo i tipi (`pg` dà `int8` come **stringa**).
- **`rejectUnauthorized: false` non è «accetta il certificato di Azure»: è
  «accetta chiunque».** Una CA aziendale si indica con un **file**
  (`PATHFINDER_PG_CA`), non spegnendo il controllo.
- **`toISOString()` non è il giorno di chi lavora**: il backup nominava i file in
  UTC e alle 01:52 scriveva sopra il serale delle 20:00.
- **UN INDICE «composite» NON È «compositeUnique».** `inventory` indicizza
  `[location_code+item_key]` per **cercare**, non per vietare: due righe con la
  stessa chiave nello stesso vano il database le accetta, e il client — che cerca
  con `find` — ne legge **una**. È un saldo che cambia da solo. **Chi scrive una
  rotta che sposta righe controlla lui che la chiave non collida.**
- **UN CAST NON CONVERTE NIENTE: DICE AL COMPILATORE DI NON GUARDARE.** I due
  difetti che la migrazione a TypeScript aveva lasciato aperti erano tutti e due
  dietro un cast. Dove viene voglia di scrivere `as`, la domanda giusta è che
  cosa si sta nascondendo.
- **Un `PATCH` su una chiave che non esiste CREA il record.** E la chiave non è
  quella che si ha in mente: `operators` è a `op_id`, `tasks` a `task_id` —
  `types/collezioni.ts` è la sorgente unica. **Non fidarsi di un `op_id` scritto
  in un documento: si rilegge la collezione.**
- **`meta` non è un sacco**: `_loadCache` la ricostruisce campo per campo. **E
  nemmeno la riga di un documento**: `savePendingOutbound` e `updatePendingDoc`
  la ricostruivano ognuna per conto suo e i colli scelti sparivano al
  salvataggio, senza errore, perché `RigaDocumento` ha un indice libero. **Dove
  un record si ricostruisce campo per campo, quel posto dev'essere uno solo** —
  `modules/documenti.ts`.
- **UNA COLLEZIONE CHE SI LEGGE MA NON SI ASSEGNA È UNA COLLEZIONE VUOTA, E NON
  LO DICE.** `recipients` stava nei due adapter dal 1.6 e `_loadCache` non la
  assegnava mai: il difetto **si nascondeva da solo**, perché alla prima
  scrittura `_applyToCache` popolava l'elenco. Quando si aggiunge una collezione
  si guardano **tre** punti: il `loadAll` dell'adapter, la destructuring di
  `_loadCache`, **e l'assegnazione**.
- **`undefined` e `null` non sono la stessa assenza, quando l'assenza è una
  decisione.** Su `location_attrs` `undefined` vuol dire «come dice la zona» e
  `null` «qui no»: un `??` le schiaccerebbe insieme. Vale ogni volta che si
  scrive uno scavalco sopra un valore di serie. **Mai configurato e configurato
  vuoto sono due cose diverse**: un `?? []` scritto per prudenza avrebbe spento
  in silenzio i tre vincoli di serie della matrice.
- **UN VINCOLO LETTO DA UN CAMPO CHE NON ESISTE NON MORDE MAI, E NON DÀ ERRORE.**
  Il motore leggeva la capienza da `zona.capienza`, che non è mai esistita: un
  indice generico `[config: string]: unknown` la rendeva legittima al
  compilatore. **Un attributo che si configura e si vede in maschera va poi
  controllato dove il motore lo legge**: alla pericolosità era successo lo stesso
  dal 1.6.
- **UNA REGOLA GENERALE CHE SOPRAVVIVE ACCANTO A UNA PRECISA LE ANNACQUA TUTTE E
  DUE**: `proponi` accetta un vano se **una** regola che impone è soddisfatta.
  `regolePerArticolo` tiene **un solo livello**, il più preciso che ha colpito.
- **IL CONTROLLO CHE VIETA VA DOVE PASSA TUTTO, NON DOVE SI VEDE**: in
  `addItem`, non nelle otto maschere che divergerebbero alla prima maschera
  nuova. **E un vincolo che esclude deve lasciare una porta da cui uscire**: «non
  si può» senza «allora dove» è una porta chiusa.
- **IL PRIMO POSIZIONAMENTO DI UN LOTTO NON HA CASA**, quindi ogni controllo
  d'unicità deve saper dire «nessuna»: `verdettoCasa` restituisce `primo` e non
  un errore. **Un'area di transito non è una casa**, e sono tre punti con una
  ragione sola — `caseDelLotto`, `entraInWip` con `regolaBase: false`, e la mappa
  che non la segnala fra i lotti sparsi: **quando se ne tocca uno si guardano gli
  altri due.**
- **UN CAMPO LIBERO PER IL MOTIVO SI COMPILA CON «OK».** Tre bottoni si premono,
  e sono **tre e non dieci**: un elenco lungo torna a essere una scelta da
  leggere.
- **Due elementi con lo stesso `id` non danno errore**: `getElementById`
  restituisce il primo, e `showModal` appende sempre `id="modalOverlay"` —
  una finestra aperta sopra un'altra **chiude quella sotto**.
- **Una riga che nasce `hidden` si accende togliendo la CLASSE, non lo stile.**
  `display: ''` toglie lo stile in riga e lascia comandare il foglio: la riga non
  compare mai, e un campo obbligatorio dentro una riga invisibile **blocca la
  conferma indicando qualcosa che non c'è**.
- **Un campo nascosto è comunque un campo scritto**: nascondere è una cosa a
  video, il payload è storia. Un campo che non serve **si nasconde e si svuota**.
- **Un campo che la maschera mostra non è un campo che si salva**:
  `ARTICLE_ATTR_FIELDS` è una **lista bianca**, e ciò che non è nominato lì viene
  scartato senza errore — le certificazioni ci sono rimaste fuori per quattro
  versioni.
- **Gli import di un modulo TypeScript si scrivono senza estensione**: due
  specificatori diversi sono due moduli, e in pagina c'erano **due Store**.
- **Non togliere `window.App = App`** in coda a `main.js`: 366 punti chiamano
  `App` per nome e smetterebbero di funzionare **in silenzio**. `$` sta su
  `window` per la stessa ragione: un gestore inline gira nello scope globale.
- **`Dialog.confirm` non accetta HTML**: vuole `message` (testo) e `details`
  (nodo DOM). Le classi `table`/`table-sm` non esistono: è `sx-table` dentro un
  `div` con `overflow-x:auto`.
- **`CREATE TABLE IF NOT EXISTS` non aggiunge una colonna**, e il `CREATE INDEX`
  dopo muore nel costruttore: il servizio non parte affatto. Fra
  `createTableSQL` e `createIndexSQL` sta `PathfinderDB._migra`: **sono due
  funzioni per questo, non rimetterle insieme.**
- **`addArticle` esce con `false` su un codice noto** — c'è `upsertArticles`.
  **`Articolo.unit` è già la UM e `pieces_per_pack` è già la quantità per
  collo**: prima di aggiungere un campo a un'anagrafica di trent'anni, guardare
  come si chiamano le etichette che ci sono.
- **Una regola di chiusura sola non basta a sette tipi diversi.** Il residuo a
  zero descrive due tipi su sette. La domanda che nessun collaudo aveva fatto:
  *«questo tipo può mai arrivare a zero?»*
- **UNA REGOLA DI MAGAZZINO NON SI DEDUCE DAL CODICE.** Il sito «di casa» di un
  ODP era stato dedotto dall'ordine di visita, che è una preferenza di
  interfaccia; la regola vera — «si parte dal magazzino con più prelievi» —
  l'ha detta Andrea in una riga, e ha cambiato l'avviso da «10 tappe su 10» a «3
  su 10». **Prima di indovinare una regola di mestiere, si chiede.**
- **QUANDO DUE COSE SI SOMIGLIANO, LA SCELTA LA DICHIARA CHI SCRIVE.** La
  maschera delle regole deduceva «prefisso o codice esatto» dall'esistenza in
  anagrafica: «6000366» è un codice vero **e** il prefisso di «6000366B». La
  regola sembrava scritta e non si applicava a niente — il modo peggiore di
  sbagliare, perché non dà errore.
- **UN PARSER CHE LEGGE «IL PRIMO NUMERO DELLA RIGA» È UNA SCOMMESSA SUL TIPO
  DELLA CELLA.** Finché Sage esportava i lotti come testo funzionava; il primo
  lotto tutto cifre è diventato la quantità — **260.594 KG al posto di 0,315**,
  su un ordine da 380 kg. Il percorso si costruiva lo stesso: la tappa c'era, ed
  era il numero a essere assurdo. **Dove una colonna ha un significato noto, si
  salta per posizione.**
- **UN SALDO GIUSTO CON LA PAROLA SBAGLIATA È UNA BUGIA.** La chiusura del conto
  contava il consumo come «tornato»: il numero tornava e la parola era falsa, e
  quella parola la legge chi cerca il consumo di un ordine fra sei mesi. **Dove
  due cose escono dallo stesso conto per ragioni diverse, servono due nomi**:
  `out` e `consumo`.
- **UN'AREA NON È UN'UBICAZIONE.** Il conto di produzione doveva tenere un vano
  per ordine, e il controllo verificava che QUALCHE ubicazione cominciasse per
  «WIP»: passava, e la merce sarebbe finita in un vano che nessuno aveva
  disegnato. **L'area WIP è un'ubicazione mappata, e a tenere distinti i conti
  sono le righe.**
- **Uno spostamento è `removeItem` + `addItem`, e il secondo inventa le UM**: le
  deriva da colli **pieni**, e spostare 11 colli da 10.100 pz ne riscriveva
  11.000. Si passa da `App._umMossa`.
- **Chi sposta una riga di giacenza scrive un OGGETTO NUOVO**: `indicizzaGiacenza`
  confronta `prev` con `next`, e modificando l'oggetto che la cache già tiene i
  due diventano lo stesso — a video la merce stava in due vani insieme.
- **UNA QUANTITÀ NON DICE DA QUALE COLLO ESCE.** La 1.8 mandava solo «10 kg»: su
  una riga che ha anche un collo da 10, il collo aperto da 25 restava intero e
  spariva quello da 10. Saldo giusto, **colli sbagliati**. Ogni uscita porta la
  **misura del collo** (`{da, quantita}`), e una misura che non c'è più è un 409
  — non un ripiego su un altro collo. Trovato al banco **con tutte le prove
  verdi**: nessuna chiedeva da dove uscisse la merce.
- **Un campo che diventa muto è peggio di un campo bloccato**: il campo ④ Colli
  ignorava in silenzio quel che l'operatore digitava.
- **Articolo e lotto non si maiuscolano nella maschera di ricerca: sono una
  chiave.** `item_key` è `ARTICOLO#LOTTO`, e un lotto `qwert` diventato `QWERT`
  puntava a una riga che non esiste — la maschera si apriva vuota, senza errore.
  (La **normalizzazione in scrittura** è un'altra cosa, e la fa il servizio: §8.)
- **`MOV.MOVE` scrive `qty_delta: 0` su uno spostamento totale**, e non è un
  difetto: cambia l'ubicazione, non la quantità. È la ragione per cui
  l'avanzamento di un'attività non passa dal registro. (Che il registro non dica
  «quanto» negli altri casi **è** un difetto: voce 33.)

---

## 8. Le regole che non si discutono

### Architettura

- **Niente lavoro offline.** Se il servizio non risponde l'applicativo si ferma
  e lo dice a schermo intero. Niente code da risincronizzare.
- **Un solo database condiviso, più terminali, e l'arbitro è il server**: la
  concorrenza si risolve con **una transazione dentro `/api/op/…`**, non con la
  disciplina di chi scrive. **Dalla 2.6 le transazioni si fanno una per volta**:
  l'interfaccia è asincrona, e un `await` dentro una transazione ridà il turno al
  ciclo degli eventi. Il prezzo è un tetto di throughput che SQLite aveva già.
- **Documento JSON con colonne materializzate**: si indicizza solo ciò che
  serve, il resto vive in `data`. È il motivo per cui un campo nuovo non è una
  migrazione.
- **Servizio on-prem, attività pianificata**, non servizio Windows nativo (NSSM
  è il file che l'antivirus blocca alle sette di mattina). Niente Redis, niente
  Entra ID: si resta al PIN. Sage X3 fino al 2038.
- **«Niente Azure» non vale più, e PostgreSQL è acceso — 26/08/2026.** Lo decide
  `PATHFINDER_PG`, che `installa-servizio.ps1 -PostgreSQL` scrive in una
  variabile di macchina — non in un file, non nel repository. **Il database sta
  sulla stessa macchina del servizio, e questo non è un passo verso Azure: è un
  passo che lo evita.** La continuità operativa non è cambiata di una virgola.
- **Si torna a SQLite con un comando**, e il file è ancora lì — ma **riporta
  l'applicativo, non i dati**: da oggi la via di casa è il `.dump` della sera
  prima, e `C:\Pathfinder\data\pathfinder.db` invecchia dal 26/08.
- **`checkJs` spento sul client, acceso sul servizio.** Dove tipo e codice
  litigano, **cede il tipo**. **Il CSS non si minifica**: toglieva 413 caratteri
  su 146.368 e riscriveva le regole.

### Dati

- **Ogni campo nuovo è facoltativo, e assente significa «come nella 1.2».** Ogni
  collezione nuova, vuota, significa lo stesso. **Nessun campo cambia mai
  significato, nessun dato viene riscritto all'installazione.**
- **NESSUNA CANCELLAZIONE DI RECORD, PUNTO — 2.1.** La purga non c'è più, e
  `purgeMovementsBefore` nemmeno: era l'unica strada per cui un movimento poteva
  sparire. Il registro è la firma GMP di chi ha mosso la merce e si tiene **sei
  anni**; un modo di cancellarlo, per quanto protetto, è un modo che prima o poi
  qualcuno percorre. Per portare via i dati resta l'export JSON, che non toglie
  niente da dove sta.
- **I CODICI SI SCRIVONO IN MAIUSCOLO — 2.6.** Articolo, lotto, `item_key`,
  ubicazione, UDC, SSCC, ODP, DDT, sigla operatore, unità di misura: un codice in
  due grafie **non è un problema di resa a video, è una seconda entità che
  nasce**. **Normalizza il SERVIZIO**, a ogni scrittura e da qualunque parte
  arrivi; il client maiuscola mentre si digita — lettore ottico compreso, perché
  il lettore è una tastiera — ma quella è la comodità, non la garanzia.
  L'elenco sta in **`MAIUSCOLE`**, dentro `server/lib/schema.js`, e **non
  comprende**: il PIN (`pin_hash`/`pin_salt`, base64), le chiavi di `meta`
  (camelCase: `areaWip`, `udcPrefissoGS1`), gli enum confrontati alla lettera
  (`'empty'`, `'pallet'`, `'operator'`, `'open'`, `'in'`) e la prosa.
  `test/maiuscole.test.js` non lascia passare un campo che nessuno ha
  classificato, e ha una guardia perché il PIN non ci finisca dentro.
- **IL REGISTRO NON DICE NUMERI CHE SI CONTRADDICONO — 2.16.** Due domande, e
  non sono la stessa. **Quanto è cambiata la riga**: se `qty_before` e
  `qty_after` ci sono tutti e due, `qty_delta` è la loro differenza, calcolata
  al punto di scrittura — l'aritmetica batte il chiamante, e `null` resta il
  «non si sa» dei movimenti storici. **Quanti colli hanno cambiato posto**: un
  trasferimento di riga intera lascia la quantità dov'era e cambia il vano,
  quindi variazione **0** e colli mossi **tutti**. Chi legge il registro usa
  `quantitaMossa`, non `Math.abs(qty_delta)`. Le due regole stanno in
  **`modules/registro.ts`**, in un posto solo. **Le righe già scritte non si
  toccano**: si rileggono.
- **UN'UNITÀ DI CARICO CHE SI SPOSTA SCRIVE UNA RIGA PER OGNI PARTITA CHE
  PORTA — 2.16.** Il contenitore ha la causale **`UDC`**, che non muove merce e
  sta accanto a `EDIT`, `PURGE` e `PINRESET`. La merce scrive le sue righe:
  articolo, lotto, da dove a dove, quanti colli, chi ha firmato — dentro la
  stessa transazione. Una riga sola che non nomina niente non è la firma di chi
  ha mosso la merce.
- **`_format` del pacchetto di export non segue la versione dell'applicativo**:
  descrive la forma del file (`warehouse-mapper-v1.5`). A muoversi è
  `_appVersion`.
- **I documenti si rileggono, non si ricostruiscono**: le ristampe partono dallo
  snapshot archiviato.

### Merceologia

- **Allergeni: i 14 dell'Allegato II del Reg. UE 1169/2011.** Sono una norma:
  **non si tolgono e non si riscrivono.** Le voci aziendali — glutine, lattosio
  — si aggiungono **accanto**, e un codice aggiunto che ripete un fisso sparisce
  invece di sostituirlo.
- **Temperature:** `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C.
  **Certificazioni:** elenco **aperto** — è una richiesta commerciale, non una
  norma.
- **La lettura di tutti e tre è stretta, mai tollerante**: indovinare cosa
  intendeva chi ha scritto è il modo di mettere un articolo col latte in una zona
  senza latte.
- **Il silenzio ha due significati.** Un articolo senza attributi non è conforme
  né difforme: è **ignoto**, si conta a parte e non produce avvisi. Zero
  segnalazioni perché va tutto bene e zero perché non c'è niente da verificare
  sono due cose diverse.
- **Gli attributi si vedono dove la merce si tocca** — prelievo guidato, report
  ODP, DDT — da **una sorgente sola**. L'allergene è l'unico in rosso: è il solo
  che può fare male a qualcuno.
- **La cella Riservata ammette allergeni**, deroga esplicita, contata ed
  elencabile. **Sulla temperatura non deroga**, e **sulla pericolosità nemmeno**:
  una scelta organizzativa non raffredda una cella e non separa un comburente da
  un infiammabile.

### Attività (schedulatore)

- **Lo schedulatore LANCIA il lavoro, non lo affianca.** L'avvio apre Movimenta
  precompilata, e un compito si chiude **solo perché un movimento è stato
  confermato**. «Completa» a mano non esiste per nessun tipo.
- **Un compito si chiude in due modi, e il tipo dice quale.** *A residuo* —
  Trasferimento, Smaltimento — quando i colli chiesti sono stati mossi. *A
  gesto* — i due prelievi, Quarantena, Campionamento, Conta — quando
  l'operazione è confermata. **Chi aggiunge un tipo deve dire in quale famiglia
  sta**: c'è una prova che glielo chiede. **Dove non c'è una quantità da
  esaurire, la prova che il lavoro è finito è il gesto**: non si inventa un
  numero che nessuno ha chiesto.
- **I parziali lasciano il residuo.** Il richiesto sta nel payload e non cambia
  mai; **il residuo lo scala la maschera, non il registro**.
- **Il prelievo si chiude alla registrazione del DDT**, non all'evasione: il
  ritiro del vettore è giorni dopo e non è un'attività dello schedulatore.
- **La priorità la alza solo il Team Leader.** **L'urgenza della scadenza si
  calcola a video, non si scrive**: sotto la soglia (4 h di serie) la coda tratta
  il compito come urgente.
- **Da uno stato chiuso non esce nessuna transizione.** **Un annullamento
  pretende il motivo.** Un avvio che non ha prodotto niente torna in carico e
  `started_at` si azzera — è l'unico istante già scritto che si cancella.
- **Chi CHIEDE un prelievo non deve sapere a chi va.** Destinatario, vettore e
  causale restano nella maschera perché chi li sa li scriva subito, ma non
  bloccano la conferma: sono dati del **documento**, che li pretende alla
  registrazione.
- **Il Posizionamento non è un compito** — avviene in coda all'accettazione, che
  su Pathfinder non passa. La funzione «Posiziona» resta.

### Unità di misura

- **Il collo incompleto non è una riga di giacenza sua.** `inventory` ha
  l'indice `[location_code+item_key]` e tutto Store è scritto sopra l'idea che
  quella coppia identifichi **una** riga. Una riga — `qty: 11`, `qty_uom: 10100`
  — e il resto si calcola.
- **La confezione del lotto vince sull'anagrafica, sempre**: si congela al primo
  posizionamento. **`qty_uom` è la quantità nell'UM dell'articolo**, non «pezzi».
- **La confezione si può dichiarare dopo, e la dichiara chi ha i colli in mano**
  (`Store.dichiaraConfezioneLotto`): è un fatto **del lotto** e vale per tutti i
  suoi colli, ovunque stiano.
- **Le UM che un movimento non porta si derivano alla LETTURA**, dai colli e
  dalla confezione di adesso — **mai riscrivendo un movimento**: il conto è
  storia, e la storia si rilegge con quello che nel frattempo si è saputo.
- **Le quantità dichiarate si convalidano, quelle derivate si troncano.**
  Bloccare un prelievo fisico perché un dato è vecchio è peggio del dato vecchio;
  lo scarto lo **mostra** `verificaUom`, che non corregge niente.
- **Le UM escono dentro la stessa transazione dei colli**, e il saldo di partenza
  si legge **dalla riga**, non da ciò che manda il client.
- **UNA RIGA CHE DICHIARA I COLLI NON SI SCARICA A NUMERO — 2.0.** `removeItem`
  **si rifiuta**, e il rifiuto dice quale riga. Guarda i `packs` **dichiarati** e
  non `colliDiRiga`, che legge un elenco anche dove nessuno l'ha scritto. Lo
  svuotamento totale resta libero.
- **Chi conta non toglie e non aggiunge: dichiara com'è fatto lo scaffale**, e
  la differenza la traduce `rettifica`. Un collo più leggero è un'uscita
  **parziale dallo stesso collo**: il 24 si accoppia col 25 sceso di uno, non col
  30 sceso di sei. **Chi rimette a posto ridichiara, non aggiunge**: rimettere
  dieci chili presi da un sacco da venticinque non è aggiungere un sacco da
  dieci, il sacco torna pieno (`packs_prima`).
- **QUANTI PER MISURA, NON QUALE COLLO — 2.2.** Due colli della stessa misura
  sulla stessa riga sono la stessa cosa. Il collo che si **apre** resta una
  scelta esplicita — è l'unico caso in cui la misura non basta — e il più piccolo
  che basta è un **default**, non una regola.
- **Un elenco messo da parte si ritrova per MISURA, mai per indice**: fra la riga
  scritta a documento e il vettore che arriva passano giorni.
- **Un riepilogo che vede unità diverse non somma: dichiara MISTA.** 300 KG più
  40 PZ fanno 340 di niente: una sola unità e il totale vale, più d'una e la
  cella resta **vuota — un'assenza, non uno zero**.
- **Il saldo in UM non esiste, il movimento in UM sì.** Il registro esce con
  **due colonne, non cinque**: ricostruire il prima e il dopo risalendo la catena
  darebbe un numero plausibile e falso su ogni riga storica.
- **UN EXPORT CHE NON NOMINA LE UM RACCONTA UN ALTRO MAGAZZINO.** Il foglio delle
  giacenze dà **una riga per collo**: contare le righe dà i colli, sommare «UM
  Collo» dà le UM, e nessuna cella ripete un totale di riga.
- **Il campione guarda l'unità di misura dell'articolo, e si comporta in due
  modi** — regola di Andrea del 25/08, **non ancora nel codice: voce 42**:
  - **con** UM configurata → si scala **la UM richiesta**, i colli non calano;
  - **senza** UM configurata → il campione **non modifica la giacenza**.

  *La regola di prima, che il codice applica ancora:* «un campione lascia sempre
  un residuo — svuotare un collo non è campionare: la rotta si rifiuta, col
  motivo». **Chi tocca `sampleItem` legga prima la voce 42**: cambia il
  significato di `SAMPLE`, e il logbook della qualità non si cancella.

### Il giro di prelievo — 2.12

- **UN GIRO PUÒ PORTARE PIÙ ORDINI, E IL CONTO DI PRODUZIONE RESTA UNO.** La
  merce scende sotto un numero solo — il **capofila** — e gli altri stanno sul
  movimento in `giro_odps`: non è un secondo conto e `conto()` non lo guarda. Il
  capofila è il primo file caricato finché non si sceglie altrimenti, e
  `session.odp_num` resta lui — è l'unico campo che rendiconto, registro e
  storico leggevano fino alla 2.11.
- **LA RIPARTIZIONE SI DICHIARA ALLA CHIUSURA, MAI AL PRELIEVO.** È la regola del
  consumo applicata alle quote. **Un collo non si divide: è la strada che la 2.3
  aveva preso, ed è quella che l'ha ritirata.**
- **QUEL CHE SI SCRIVE AL PRELIEVO È IL CHIESTO, NON IL CONSUMATO.**
  `giro_richieste` è un fatto del file di produzione, noto in quel momento.
- **LA SOMMA DELLE QUOTE FA ESATTAMENTE QUELLO CHE È USCITO**: l'ultima assorbe
  il resto dell'arrotondamento. Un centesimo in più su una quota si vede e si
  spiega; una somma che non torna è un conto che nessuno chiude.
- **RIGHE CHE SI FONDONO: STESSO ARTICOLO E STESSO LOTTO.** Una riga senza lotto
  non si fonde con una assegnata.
- **LA RICALIBRAZIONE RIPARTE SEMPRE DALL'ORDINE**, non dall'ultimo risultato, e
  si applica al totale **e a ogni lotto**, coi decimali dell'unità di ciascuno.
- **UN ORDINE SERVITO DA UN GIRO NON RISPONDE «NESSUN MOVIMENTO»**: dice dove sta
  il suo conto.

### Il conto di produzione — 2.14

- **LA SCHERMATA PARTE DALLA MERCE, NON DAL NUMERO.** Il primo elenco è quello
  che è fermo nel vano: una riga per ORDINE × ARTICOLO#LOTTO, coi gesti sulla
  riga. Chi entra in produzione non sa i numeri d'ordine a memoria, e una
  schermata che glieli chiede per prima cosa gli chiede quello che è andato a
  cercare.
- **CHIUDERE È UN GESTO SULL'ORDINE**, e sta nell'elenco dei conti, non sulla
  merce. **Un ordine a residuo zero non ancora archiviato compare lo stesso**:
  non ha niente in lavorazione, ma è vivo e il file di produzione lo può
  ricaricare finché nessuno lo chiude.
- **UN RESIDUO NEGATIVO SI VEDE.** È il conto che non sta in piedi (voce 61), e
  questa è l'unica schermata da cui lo si può notare: nasconderlo qui vuol dire
  nasconderlo e basta.
- **L'ARCHIVIO DEGLI ORDINI CHIUSI STA IN ARCHIVIO**, col resto dei documenti e
  con la tabella che si ordina e si filtra. Un elenco che cresce ogni giorno
  non si sfoglia a pulsantini.
- **UN RESO SBAGLIATO SI STORNA, E IL RESO RESTA SCRITTO.** Lo storno è un `in`
  che nomina il reso che annulla (`storno_di`); la merce si riprende **da dove
  era andata** (`reso_a`) e **con i colli rientrati** (`reso_packs`), che dopo
  una confezione aperta non sono quelli usciti dal vano.
- **IL VUOTO DI UNA CONFEZIONE APERTA NON SI STORNA**: quella merce è finita
  nel prodotto. Lo storno riporta indietro quello che è rientrato, e la
  maschera lo dice prima di premere.
- **QUANDO NON SI SA QUALI COLLI SIANO TORNATI, LO STORNO SI RIFIUTA E DICE
  PERCHÉ.** Su un lotto che i colli li dichiara, «togline due» non è una
  risposta — è la regola della 2.0, e vale anche qui.

### Il prodotto finito — 2.20

- **UN BANCALE DI PRODOTTO FINITO È UN'UNITÀ DI CARICO**, con tre campi
  facoltativi in più: `kind: 'pf'`, `odp_num`, `model_code`. Assenti, è l'unità
  di carico della 1.12 — nessuna collezione nuova, nessun record riscritto.
- **LA COMPOSIZIONE DEL BANCALE È UN MODELLO, NON UN CAMPO DELL'ARTICOLO.** I
  formati veri sono una decina e gli articoli undicimila. **Il modello propone
  il numero di colli e non lo impone**: se il bancale reale ne porta 37 invece
  di 40 vince il bancale, e chi imballa non deve dire perché.
- **L'ORDINE DI PRODUZIONE È FACOLTATIVO.** Chi imballa non si ferma perché non
  ha il numero sotto mano. Il legame resta un campo scritto sul bancale, e il
  conto di produzione non lo guarda: la resa è un'altra cosa e non c'è.
- **IL PF ENTRA CON LA SUA CAUSALE — `PROD`.** Un `IN` con una nota non si
  filtra, e la domanda «cosa ha versato la produzione» arriva.
- **UN BANCALE MISTO PASSA, E QUEL CHE NON È DEFINITO RESTA VUOTO.** Un pallet
  con due partite non ha «un» lotto né «una» scadenza: l'etichetta dichiara
  «MISTO — n partite» e lascia in bianco i campi della merce. Il dettaglio lo
  porta la packing list, che le righe le elenca tutte.
- **VUOTO E SPEDITO SONO DUE FATTI DIVERSI.** Un bancale svuotato in magazzino
  è un pallet libero; uno svuotato da un DDT è merce su un camion — `empty` lo
  scrive `chiudiUdcSeVuota`, `shipped` lo scrive l'evasione.
- **UNA ZONA DI PRODOTTO FINITO NON È UNA REGOLA DI STOCCAGGIO**: non esclude
  niente e non verifica niente. Dice dove il reparto posa i bancali e dove
  l'elenco delle spedizioni va a guardare — e **vale anche su un sito
  terzista**, che è dove il PF finisce quando viaggia in conto lavorazione.
- **IL CONTO TERZI NON SCARICA: SPOSTA.** Su una causale marcata «la merce si
  sposta» l'evasione porta i bancali nel vano del sito di arrivo con
  `/api/op/moveUdc`; la merce resta in giacenza e resta nostra. **Le causali
  già salvate non cambiano da sole**: la spunta è un gesto umano, una volta.
- **LA PACKING LIST È UN SECONDO MODO DI STAMPARE LO STESSO DOCUMENTO**, non
  una collezione: un bancale per blocco, e il **DDT resta a pagina sola**
  mentre lei **scorre**. Il peso lordo somma le tare al netto e **resta vuoto**
  dove le unità non si sommano.
- **UN RECORD DI DOCUMENTO SI RICOSTRUISCE CAMPO PER CAMPO, E I POSTI SONO
  TRE**: `modules/documenti.ts` per la riga, `savePendingOutbound` e
  `updatePendingDoc` per la testata. Ciò che non è nominato in quei tre non
  arriva a database, **e non dà errore** — la 2.20 l'ha pagata su
  `dest_location`, dopo che la 1.8.4 l'aveva già pagata sui colli.

### La scansione in corsia — 2.12

- **L'UBICAZIONE SI VERIFICA UNA VOLTA PER VANO, NON UNA PER TAPPA.** La chiave
  è `<ubicazione>@<apertura>`. **Una verifica che si ripete quando non c'è niente
  da riverificare è una verifica che si smette di fare.**
- **LA SPUNTA CADE SU TRE COSE**: cambiare vano, spostarsi su un'ubicazione
  alternativa, rientrare nella schermata. **Chi tocca `_routeChiaveScan` deve
  poterle riprovare tutte e tre.**
- **IL VANO CONFERMATO NON È UN CAMPO SPENTO: È UNA BANDA**, e riscansionare
  resta possibile senza chiedere un motivo.
- **ARTICOLO E LOTTO SI RISCANSIONANO A OGNI RIGA.** Il vano è uno; la merce no.

### Stoccaggio, mappa, documenti

- **La priorità di una regola va da 1 a 10.** Una regola vecchia con 0 si rilegge
  buona: **in lettura si è tolleranti, in scrittura no.**
- **La distanza ha un tetto** (`DISTANZA_MAX: 15`): senza, su 274 ubicazioni
  decideva da sola e il raggruppamento del lotto non spostava niente.
- **La vista la decide la zona, non chi guarda.** Scaffali → frontale, con
  «Specchia»; terra e sfuso → dall'alto. Offrire tutte e due su ogni zona vuol
  dire offrire, su ogni zona, quella sbagliata.
- **Il pannello di dettaglio non copre la pianta**: i 360 px coperti erano
  esattamente la corsia che l'operatore aveva appena cliccato.
- **Un'unità di carico si disegna DENTRO il vano** e si trascina; il
  trascinamento passa da `moveUdc` come la maschera: non è una scorciatoia che
  salta un controllo.
- **Ogni documento stampato porta in testata il proprio riferimento in Code128**,
  e la riga sta in un posto solo — `_docHeadHTML`, da cui passano tutti e sette.
- **Un'etichetta porta solo quello che non invecchia.** Sull'UDC l'unico dato che
  non invecchia è il numero, che **non si riusa mai**: ubicazione, data e
  operatore diventano una bugia incollata al legno.
- **Le barre sono nere su bianco dichiarato**: un tema scuro le rende illeggibili
  a qualunque lettore. La carta non ha un tema. **Quello che esce è Code128, non
  GS1-128** — voce 24.
- **LA STAMPANTE SI AFFIANCA ALLA CARTA, NON LA SOSTITUISCE — 2.19.** Le tre
  `@media print` restano dove sono: stampante spenta, rotolo finito o rete giù,
  e l'etichetta esce su A4 dal browser come è sempre uscita. Senza quel
  pulsante un guasto alla stampante fermerebbe la creazione delle unità di
  carico.
- **A PARLARE ALLA STAMPANTE È IL SERVIZIO, E L'INDIRIZZO NON ARRIVA MAI DALLA
  RICHIESTA — 2.19.** Un browser non apre un socket TCP; il client manda un
  `printer_id` e la chiave di un record, il resto lo legge il servizio da
  `meta.printers`. **L'etichetta la costruisce il servizio** rileggendo la riga
  a database: in regime GMP un'etichetta è un documento, e un documento
  costruito dal browser si falsifica scrivendo in una console.
- **«INVIATA» NON È «STAMPATA» — 2.19.** La porta 9100 accetta i byte e chiude:
  carta finita, testina aperta e nastro esaurito passano tutti come successo. A
  dirlo è `~HQES`, che si chiede dopo ogni invio, e **la maschera dichiara
  quale dei due fatti sta mostrando**.
- **UN LAYOUT CHE NON CI STA SI RIFIUTA, NON SI TRONCA — 2.19.** Un'etichetta
  troncata esce con l'aria di essere giusta e le manca l'ultima riga. E **sotto
  0,25 mm di modulo le barre non si stampano affatto**: è la stessa regola per
  cui un simbolo che non si può scrivere non si scrive.

### Metodo e interfaccia

- **Un blocco per commit**, con build e collaudo in mezzo. **Chi sposta non
  corregge.**
- **Ogni tabella si ordina e si filtra** (`modules/tabella.ts`): ordinamento
  **stabile**, il **vuoto in fondo nei due versi** (una data mancante non è
  «molto vecchia»), i numeri confrontati da numeri, e il terzo clic riporta
  all'ordine di partenza.
- **Il cruscotto se lo compone chi lo guarda**: ordine, larghezza e quali
  riquadri sono un dato in `meta`. **Ordine e larghezza, mai coordinate in
  pixel** — una posizione salvata su un 27 pollici, riletta a 480, mette due
  riquadri uno sull'altro. **Quello che avvisa non si spegne.**
- **Italiano ovunque**, commenti compresi. Nessun `font-size` fuori dai token
  MD3. Il marchio Naturacare non si adatta al tema: verde `#94BC47`, blu
  `#21305A`. I documenti di stampa restano in `pt` e `mm`.
- **Niente dipendenze nuove** senza motivo forte, e **`dexie` e `xlsx` non si
  aggiornano** — ma per `xlsx` la regola va ridecisa: **voce 65**.
- **GMP**: ogni movimento porta la sigla dell'operatore identificato, e **non
  si cancella mai** — non a mano, non col tempo. **Dalla 2.17 non c'è più un
  numero di ritenzione nel codice** (era `LOG_RETENTION_DAYS = 2192`, sei anni
  esatti): non cancellava niente e finiva in tre etichette, una delle quali
  diceva «conservazione 6 anni» due righe sotto «nessun record viene mai
  cancellato». **Sei anni non li chiedeva nessuna norma**: la guida della
  Commissione sull'art. 18 del Reg. 178/2002 raccomanda **5 anni** per la
  rintracciabilità, l'**art. 2220 c.c.** ne vuole **10** per fatture e documenti
  commerciali — e Pathfinder emette DDT — e l'**Annex 11** lega l'audit trail al
  record che documenta. Per quanto si tenga il registro lo dice **la SOP**, e a
  quel punto è politica di backup e di database. Il volume resta quello:
  300-500 movimenti al giorno. **GDPR**: nome, cognome e iniziali,
  nessuna telemetria, nessuna richiesta verso l'esterno. **Il PIN non esiste a
  database: esiste la sua impronta.**
- **Una maschera che chiede l'identità in fondo la chiede troppo tardi**: la
  sigla si pretende prima di aprire il modulo.
- I conteggi DOM/CSS di confronto fra versioni sono **misure, non invarianti**.

### Il front end

- **Tailwind dal 18/08, e non è «tutto a utility»**: l'applicativo non ha
  componenti e il markup nasce da stringhe, quindi **i componenti e il telaio
  restano classi** (`btn`, `badge`, `input`, sidebar, modali). Quel che è stato
  tolto sono i `style=`: da **2.187 dichiarazioni** in 1.092 attributi a **84
  attributi**, di cui 53 con un valore che nasce a runtime.

  1. **`main.js` importa un CSS solo**: `00-tailwind.css` è il tema e importa gli
     altri nove con `@import … layer(app)`.
  2. **L'ordine dei layer è il contratto**: `theme, base, components, app,
     utilities`. Il CSS dell'applicativo sta in `app`, **sotto** le utility.
     Prima stava fuori dai layer, dove batteva tutto — e `* { margin: 0 }`
     spegneva ogni `mb-*`: **le utility nascevano morte** e nessun collaudo se ne
     accorgeva.
  3. **La spaziatura va a decimi di rem**, non a quarti: qui `mb-4` è **0,4rem**.
     La ragione è l'MC9400 — 4,3" da 800×480, fra i 400 e i 533 px CSS, **sotto
     ogni media query che l'applicativo ha oggi**. La densità ha **una manopola
     sola**, `--spacing`.
  4. **Il tema non ha valori, ha rimandi.** Il colore si cambia in
     `01-tokens.css`; la tavolozza di serie è spenta (`bg-blue-500` non compila).
     Raggi e ombre vanno **per numero** — `rounded-2`, `shadow-3`.

  **Non si migra la stampa**: le tre `@media print` restano CSS come sono.
- **SERVITO, NON SI «SALVA»: SI SCRIVE — 2.16.** `_touchMeta` alza
  `unsavedChanges` a ogni mutazione e dalla 2.1 nessuno lo riabbassa, quindi su
  una macchina servita l'indicatore restava rosso per sempre. Servito dice **«In
  linea»** e la Dashboard **«Ultima scrittura»**; il servizio che non risponde
  ha già la sua schermata. Da file non cambia niente. La domanda si fa a
  `Store.eServito()`.
- **LE ICONE A PRESENTAZIONE TESTUALE SI VESTONO COL SELETTORE — 2.16.**
  `✏️ ⚠️ ⚙️ ℹ️ ♻️` scritti nudi escono come glifi di testo: la matita di
  «Modifica» si leggeva come un trattino, l'avviso come un triangolo grigio.
  Vogliono `U+FE0F`, e lo tiene `test/emojiVestite.test.js`. **Le frecce
  restano nude** — `↔ ▶ ↩` marcano righe dentro tabelle dense, e da icone
  peserebbero più di quel che accompagnano.
- **`App` è più grande del file che lo dichiara**: metà dei suoi metodi arriva
  dalle viste, che rientrano con `Object.assign` in coda ad `app.ts`. Il ponte è
  `DalleViste`; `monolite()` a runtime non fa niente e serve a dare quel tipo a
  `this`. **Le viste sono `satisfies Vista`, non `: Vista`** (con l'annotazione
  il tipo di ogni metodo veniva schiacciato su `Metodo`). **Il `this` delle viste
  resta `any`, e non per pigrizia**: dargli il tipo vero è un ciclo che il
  compilatore non scioglie (TS7022).

### Le tre cariche

- **`operator` · `leader` · `admin`.** L'Admin **comprende** il Team Leader: dove
  passa un leader passa lui. Una carica più alta che potesse meno chiuderebbe il
  cerchio del 13/08.
- **Solo l'Admin apre la Configurazione e il reset dei dati**, e il reset
  pretende il suo PIN. Il varco sta in `renderConfig`, non in `switchView`: su un
  database vuoto l'applicativo porta in Configurazione **prima** di chiedere chi
  sei.
- **L'eccezione del primo giorno è dichiarata e si spegne da sola**: finché
  nessun Admin esiste comandano i Team Leader, o l'installazione murerebbe la
  Configurazione, che è l'unico posto da cui si nomina un Admin.
- **L'ultimo Admin non si retrocede, non si disattiva e non si cancella, e
  dalla 2.16 lo impone IL SERVIZIO.** Fino alla 2.15 la regola viveva solo in
  `configOperatori.ts`: una `PATCH` mandata da un Admin che si retrocede
  passava, e da lì non si rientrava più — la Configurazione vuole un Admin, il
  codice di ripristino pretende `role === 'admin'`, e la finestra del primo
  avvio guarda i PIN e non le cariche. Il servizio **simula** la scrittura su
  una copia dell'anagrafica e guarda com'è rimasta, quindi la regola vale anche
  dentro una `/tx`. **Con due Admin il gesto passa**, e il reset dei dati resta
  permesso: svuota tutto, nessuno resta con un PIN, e la finestra si riapre.
  Otto prove in `banco/gerarchia.cjs`.

### Il PIN smarrito — come si esce

**Il PIN non è recuperabile per costruzione**: sul disco resta la sua impronta —
**`scrypt` dalla 2.10** (le vecchie SHA-256 si riscrivono in scrypt al primo
accesso riuscito; il modo «da file» resta SHA-256 perché il browser non ha
scrypt). Il rinnovo lo autorizza un Team Leader col proprio PIN, e **con un solo
Team Leader il cerchio si chiude su sé stesso** — è successo il 13/08.

**Le tre vie d'uscita, in ordine di preferenza.** Le prime due sono della 2.13,
**in servizio dal 31/08**: valgono tutte e tre.

1. **Un grado più alto lo rinnova, dall'applicativo.** Configurazione →
   Operatori, il bottone del rinnovo: chi autorizza digita il **proprio** PIN.
   L'Operatore lo rinnova un Team Leader, il Team Leader un Admin, l'Admin
   chiunque. Passa da `POST /api/op/rinnovaPin`, e la gerarchia la verifica
   **il servizio**: dalla 2.13 non c'è modo di aggirarla dal browser.
2. **Se il PIN perso è quello dell'unico Admin, il codice di ripristino.**
   Dalla schermata di accesso, «🗝 Ho un codice di ripristino»: si sceglie
   l'Admin, si digita il codice — venti caratteri, spazi e minuscole perdonati
   — e si scrive il PIN nuovo. Il codice **si consuma**, e al suo posto ne
   compare subito un altro, mostrato **una volta sola**: si stampa e si mette
   dove stava quello di prima. Chi non ne ha uno lo genera da Configurazione →
   Operatori, col bottone 🗝, e la colonna «Ripristino» dice per ogni Admin se
   c'è o manca.
3. **Se non c'è né l'una né l'altra: la chiave di macchina.**
   `PATHFINDER_TOKEN` apre le rotte senza sessione — è la chiave del backup
   serale e dell'installer, e sta sulla macchina del servizio. **È l'uscita di
   servizio, non una procedura**: si usa da chi ha già accesso a quella
   macchina, e la si richiude nominando un secondo Team Leader.

> ⚠️ **La procedura che questo documento ha portato per settimane —
> `POST /api/op/hashPin` seguito da una `PATCH` su
> `/api/c/operators/<op_id>` — NON funziona più dalla 2.11**: quelle rotte
> vogliono una sessione, e dalla 2.13 la `PATCH` sugli operatori vuole anche
> la carica. Non si riprova: si usa una delle tre qui sopra.

Due cose che restano vere in ogni caso: **l'`op_id` si rilegge, non si copia**
(una `PATCH` su una chiave che non esiste **crea** un secondo operatore invece
di dare errore), e la causa si toglie con **un secondo Team Leader**, un minuto
in Configurazione → Operatori.

---

## 9. Mappa del codice

### Client — `src/`
| File | Righe | Ruolo |
|---|---:|---|
| `ui/app.ts` | 1.328 | **Quel che non è una vista**: avvio e riallineamento, identità e sessione, il telaio (`switchView`, sidebar, `showModal`, `toast`, scorciatoie), l'annulla, le utilità comuni (`_esc`, `_requireOperator`, `_pickLoc`). In coda, il rientro delle viste |
| `core/store.ts` | 2.283 | **Le mutazioni**: tutto ciò che scrive e parla con `Persistence` |
| `core/cache.ts` | 321 | Punto unico di mutazione della cache: 5 forme, 4 indici derivati |
| `core/statistiche.ts` · `pacchetto.ts` · `geometria.ts` · `giacenza.ts` | 181 · 154 · 123 · 94 | Stato di una cella e cruscotto · export e `VERSIONE_APP` · le ubicazioni generate dalla zona · FEFO e ricerca |
| `core/persistence/index.ts` · `remote.ts` · `local.ts` | 15 · 267 · 262 | Sceglie l'adapter: servito → HTTP, da file → Dexie |
| `core/schema.ts` · `utils.ts` · `costanti.ts` | 173 · 46 · 44 | Schema IndexedDB · `debounce` e `_h` · causali e ritenzione |
| `modules/compiti.ts` | 555 | Ciclo di vita, coda, misure, urgenza calcolata, residuo, le due famiglie di chiusura. `registroAttivita` unisce i compiti ai campionamenti che nessun compito rivendica. Puro |
| `modules/misure.ts` · `colli.ts` | 319 · 578 | Le cinque unità e la suddivisione per collo · l'elenco dei colli: uscite come le capisce il servizio, ritrovamento per misura, `scelteDaTaglie`, `riempiFabbisogno`, `rettifica`. Puri |
| `modules/registro.ts` | 46 | **2.16 — le due domande che si fanno a una riga del registro**: quanto è cambiata (`quantoSiEMosso`) e quanti colli hanno cambiato posto (`quantitaMossa`). Stanno insieme perché confonderle è il difetto della voce 33. Puro |
| `modules/documenti.ts` | 44 | La riga di un documento di uscita, ricostruita **in un posto solo**. Nasce da un difetto, e dalla 2.20 porta anche `udc_id` — da quale bancale esce la riga. Puro |
| `modules/giacenzaArticolo.ts` | 175 | La giacenza di un articolo per lotto, FEFO, e la coda di conte nell'ordine dello scaffale. **Le UM non si calcolano qui**: arrivano risolte da `Store.righeLette`. Puro |
| `modules/trasferimentiOdp.ts` · `dispositivo.ts` | 142 · 74 | Le tappe in un altro magazzino e il compito che ne nasce · su che cosa sta girando (decide **la larghezza**, non il sistema operativo). Puri |
| `modules/udc.ts` | 162 | Il codice sull'etichetta: interno o SSCC con la cifra di controllo GS1. Sta da solo perché **un'etichetta dura**. Dalla 2.20 lo stesso codice identifica anche un **bancale di prodotto finito** — `modules/bancale.ts`. Puro |
| `modules/imballo.ts` | 146 | **2.20 — com'è fatto un bancale prima che il bancale esista**: i modelli di imballo, la loro convalida, `colliAttesi` e `pesoLordo`. Sta da solo perché la composizione è un DATO e non un campo su 11.197 articoli. **Il modello propone**: chi imballa riscrive il numero senza dover dire perché. Puro |
| `modules/bancale.ts` | 158 | **2.20 — come si LEGGE un bancale di prodotto finito**, in un posto solo: mono o misto, colli, UM (diverse → MISTA, mai una somma), e i quattro stati — pronto, impegnato su un DDT, spedito, vuoto. La stessa domanda la fanno l'elenco, la mappa, l'etichetta e la packing list: quattro copie sarebbero quattro risposte. `zonePf` elenca le zone dichiarate, terzisti compresi. Puro |
| `modules/stampanti.ts` | 377 | **2.19** — la forma di una stampante Zebra, la sua convalida, e `disponi`: dove finisce ogni riga dell'etichetta in millimetri. `proponiStampante` sceglie quella giusta — l'ultima usata, poi quella del sito. **2.20**: i cataloghi di campi sono **due** — merce e bancale — e il genere è un parametro di `leggiRiga`, `leggiLayout` e `disponi`, non una seconda copia. **Non c'è lo ZPL**: le barre e i comandi li scrive il servizio, perché un'etichetta è un documento e un documento costruito dal browser si falsifica in una console. Puro |
| `modules/stoccaggio.ts` | 613 | Dove si mette la merce: vincoli **duri**, poi punteggio. Le regole sono un dato di `storage_rules`; ogni proposta dice perché. **2.8**: pericolosità, portata, la casa del lotto in cima, la categoria come terzo bersaglio con **un solo livello**. Puro |
| `modules/regoleBase.ts` | 448 | **2.8** — le due regole che NON si scrivono, più i tre motivi precompilati dello scavalco. Sta da solo perché quelle di `stoccaggio.ts` sono regole di **politica**, queste sono il modo in cui un magazzino resta leggibile. Puro |
| `modules/wip.ts` | 918 | **Il conto di un ordine**: entrato, tornato, residuo; il consumo si dichiara **a ordine chiuso**. `colliFuori`, `archiviato`, `ordiniArchiviati`, `righeSenzaOrdine`. **2.12**: `giro_odps`, `giro_richieste`, `giro_id` sul movimento, e quattro letture — `contoTenutoDa`, `ordiniServiti`, `richiesteDiRiga`, `consumoPerOrdine` (che legge le quote scritte **alla chiusura**). **2.14**: `inLavorazione` (una riga per ordine × articolo#lotto di quello che è fermo nel vano, senza sapere prima nessun numero), `resi` e `motivoNonStornabile`, più i quattro campi dello storno sul movimento. Puro |
| `modules/giroOdp.ts` | 267 | **2.12 — il giro.** `ricalibra` (riparte sempre da `lines_originali`) e l'unione delle distinte, tenendo da parte **quanto ne vuole ciascun ordine**. `quote` ripartisce quel che è uscito e **l'ultima assorbe l'arrotondamento**. **Non decide niente sul conto di produzione.** Puro |
| `modules/pickRoute.ts` | 353 | Percorso a serpentina, ordine dei siti, magazzino di casa, `riordina`. **2.12**: `buildGiro` — le distinte si sommano **prima**, in `giroOdp.ts`, e le `richieste` si riattaccano dopo **per chiave**, perché `build` decide ubicazione e alternative ed è già collaudata così |
| `modules/odpParser.ts` | 286 | Lettura degli ODP da Excel |
| `modules/kpi.ts` | 330 | I numeri di articoli, movimenti e persone, già a database e mai sommati. `NON_MISURABILE` elenca cosa non si può chiedere e **quale campo servirebbe**. Puro |
| `modules/code128.ts` | 150 | Il codice a barre, in casa. Solo il sottoinsieme B. **Non è un GS1-128** — manca FNC1 — e sta scritto nel modulo. La tabella dei 107 modelli si collauda con le due invarianti dello standard, non ricopiandola. Puro |
| `modules/cruscotto.ts` · `tabella.ts` | 155 · 200 | Il layout della Dashboard (riconcilia il salvato con quel che il codice sa fare oggi) · ordinare e filtrare. Puri |
| `modules/conformita.ts` | 300 | Cosa è stoccato dove non dovrebbe: il motore al contrario. **2.8**: pericolosità e lotto sparso, aree di transito escluse. **2.9**: la matrice è uscita |
| `modules/destinatari.ts` · `parametri.ts` · `anagrafica.ts` | 200 · 165 · 158 | Chi è lo stesso destinatario · le tendine che sono un dato · i 14 allergeni, le 3 classi, le certificazioni |
| `modules/fogli.ts` | 112 | Le due domande di un foglio Excel che non riguardano SheetJS: `colliDaStendere` (una riga per collo) e `celleUom` (MISTA, e il totale vuoto). **`distendiGiacenze` è il muro del foglio**: 1.048.575 righe contate su TUTTE le giacenze insieme; una riga che da sola sfonda il foglio torna `null`. Puro |
| `modules/excel.ts` | 31 | **Il punto unico da cui SheetJS si carica, e solo quando serve.** Chi rimette `import * as XLSX` in cima a un file annulla la 1.7 |
| `modules/validate.ts` · `auth.ts` · `session.ts` · `pickupAlert.ts` · `scanGuard.ts` · `maiuscole.ts` | 104 · 88 · 69 · 43 · 31 · — | Validazioni · PIN e impronta · sessione · allerta ritiri · guardia del lettore · i campi che sono un codice |
| `types/entita.ts` · `contratto.ts` · `collezioni.ts` | 722 · 157 · 63 | Le entità · l'interfaccia dei due adapter · **le 21 collezioni, sorgente unica**: il `satisfies` blocca la compilazione se adapter o servizio divergono |
| `styles/*.css` | 4.234 | **10 file**, §8 |
| `ui/dialog.js` · `feedback.js` · `tabs.js` | 367 · 181 · 59 | Modali · toast e spinner · schede |
| `main.js` · `index.html` | 46 · 200 | Avvio e gancio globale · scheletro del DOM e marchi SVG |
| `ui/views/` | ~18.500 | Le viste, più `vista.ts` e `globale.d.ts` |

### Le viste — `src/ui/views/`

**Una vista è un pezzo di `App` che vive in un file suo.** Non è un modulo che
si istanzia: `App` resta un oggetto solo, perché l'indice e i gestori costruiti
dentro le stringhe lo chiamano **per nome**. In coda ad `app.ts` un ciclo le
rimette dentro, e **esplode se un metodo è rimasto anche di qua** — estrarre è
spostare, e un doppione verrebbe sovrascritto in silenzio.
| File | Righe | Cosa disegna |
|---|---:|---|
| `percorso.ts` | 1.834 | Prelievo guidato: ODP, serpentina, corsia, chiusura, il trasferimento chiesto dall'ordine. **2.12 — il giro e la sosta**: più `.xlsx` che si aggiungono, la quantità ricalibrabile, il **capofila**, e `_routeSosta` che raggruppa le tappe pendenti contigue nello stesso vano |
| `spedizioni.ts` | 1.613 | DDT: testata, carrello, documento pendente, evasione, stampa. **2.20**: il carrello si riempie **dai bancali** (`_shipCaricaDaBancali` — sta qui perché il carrello è qui), la **packing list** che raggruppa le righe per bancale, e `_evadiTrasferendo`, l'evasione del **conto terzi** che sposta la merce invece di scaricarla |
| `inventario.ts` | 1.035 | Inventario di vano, conta mirata, ramo «Per articolo» col giro di conte |
| `configDati.ts` | 975 | Dati, resilienza, i tre fogli Excel, reset (che chiede il PIN dell'Admin) |
| `cruscotto.ts` | 900 | I tredici riquadri componibili e le sette scorciatoie |
| `compiti.ts` | 885 | Attività: coda, misure, registro, richiesta, i quattro gesti |
| `posiziona.ts` | 781 | Posizionamento, la dichiarazione dei colli, `_scegliColli` e `_ridichiaraColli` (condivisa con inventario e Conta) |
| `quarantena.ts` | 755 | Blocco, rilascio, cartellino di non conformità |
| `wip.ts` | 1.066 | **Il conto di produzione**: conto, reso, chiusura, rendiconto. **2.12**: un ordine servito da un giro dice **dove sta il suo conto**; il capofila elenca chi sta servendo; la chiusura scrive la ripartizione. **2.14**: la schermata parte dalla **lista di quello che è fermo in lavorazione** (ordinabile e filtrabile), i conti aperti stanno in un elenco compatto, **l'archivio è uscito di qui** e un reso sbagliato **si storna** |
| `smaltimento.ts` | 664 | Scarico in tre stadi, e i **mattoni del documento** che usano tutti |
| `prelievo.ts` | 600 | Trasferimento e carrello di produzione |
| `rapportoPrelievo.ts` | 579 | Un rapporto, tre sorgenti. **2.12**: la testata porta «Giro — ordini serviti» |
| `giacenze.ts` | 527 | Dettaglio di un'ubicazione, i cinque gesti che partono da lì, il totale in colli e UM |
| `configArticoli.ts` · `configurazione.ts` · `configSiti.ts` · `configOperatori.ts` | 498 · 437 · 375 · 362 | Anagrafica e attributi · le schede · siti e zone · operatori, PIN, sessione |
| `mappa.ts` · `documento.ts` | 697 · 441 | Pianta, frontale, conformità e deroghe — **2.20**: il filtro che tinge i bancali di prodotto finito con lo stato che hanno · la correzione di un DDT pendente su uno snapshot, che dalla 2.20 porta anche la causale e l'ubicazione di arrivo |
| `campionamento.ts` · `movimenta.ts` | 359 · 354 | Campionamento GMP e verbale · il telaio dei moduli e il registro di sessione |
| `udc.ts` | 322 | Le unità di carico: elenco, creazione, carico, spostamento, etichetta |
| `prodottoFinito.ts` | 547 | **2.20 — il magazzino del prodotto finito.** La maschera del reparto che chiude un bancale in un gesto e ne stampa l'etichetta, e l'elenco di chi spedisce: ordinabile, filtrabile, con la spunta che carica il DDT. Il pulsante «Vedi in mappa» non disegna niente — apre la mappa sulla zona PF col filtro acceso |
| `stampaEtichette.ts` | 204 | **2.19** — la maschera fra il pulsante e l'etichetta: **quale stampante** (si ricorda) e **quante copie** (tornano sempre a 1). In un file suo perché la chiamano in tre — l'unità di carico, la merce e, dalla 2.20, il bancale. Il riscontro dice **quale fatto sta mostrando**: inviata, oppure stampata |
| `ricerca.ts` · `destinatari.ts` · `archivio.ts` · `registro.ts` · `parametri.ts` | 227 · 226 · **286** · 191 · **287** | Ricerca in barra · rubrica DDT · **i cinque generi di documento — dalla 2.14 anche gli ordini di produzione chiusi**, e dalla 2.20 un secondo foglio sui DDT che portano bancali · registro movimenti · le quattro schede che sono un dato, **più i modelli di imballo** |
| `vista.ts` · `globale.d.ts` | 36 · 10 | Il tipo `Vista` e `$`/`$q` · `declare const App` |

> **`wipRegistro.ts` non esiste in `main`**: era della 2.3 ritirata.

**Chi ne aggiunge una** la scrive `.ts`, la tipa `Vista`, la importa in `app.ts`
e la mette nell'elenco del rientro. **La rete**:
`test/superficie-app.test.js` tiene i nomi che `App` esponeva prima
dell'estrazione e controlla che ogni `App.qualcosa` citato nell'indice o dentro
una stringa trovi a chi rispondere. **Non si tocca `superficie-app.dati.js` per
farlo tacere**: se suona, un metodo non è rientrato.

### Servizio — `server/`
| File | Righe | Ruolo |
|---|---:|---|
| `pathfinder-server.js` | ~380 | Express: rotte, SSE, sessione, TLS opzionale, la cartella dell'applicativo, avvio. Qui sta `const VERSION` |
| `lib/db.js` | 78 | **La facciata**: legge `PATHFINDER_PG` (variabile di macchina, poi `.env.local`), sceglie il driver. Variabile **vuota** = «no, SQLite», e batte il file |
| `lib/driver-base.js` | 318 | **TUTTA la logica del servizio dati, una volta sola per due database**: scritture, letture, filtri, transazioni, revisione e notifica, normalizzazione in maiuscolo. I driver portano solo i quattro gesti che un database sa fare. **`AsyncLocalStorage`, non un flag** |
| `lib/driver-sqlite.js` · `lib/driver-postgres.js` | 121 · 267 | `better-sqlite3`, `_migra`, backup a file · `pg`, il pool, la connessione fissata alla transazione, il riallineamento delle sequenze, `int8` decodificato a numero, e dalla 2.12.1 **l'attesa dell'avvio**: `_attendiIlServer`, `siRiprova`, `attesaPrima` — esportate apposta per essere provate da ferme |
| `lib/sql.js` | 259 | **TUTTO lo SQL, col dialetto come parametro.** `startsWith` è `substr(col,1,N) = ?` e **non** un `LIKE` |
| `lib/zpl.js` | 638 | **2.19 — l'etichetta.** Entrano un record, una stampante e un layout; esce una stringa ZPL. Nessun socket, nessun database, nessuno stato: si collauda senza avere una stampante sotto. Le barre le disegna `^BC` (il firmware), non `code128.ts` — la cifra di controllo non si riscrive due volte. **Non manda mai `^MN` `^MM` `^MD` `^JUS`**: sono la configurazione della macchina. Un layout più alto del supporto lo **rifiuta**, non lo tronca. **2.20**: i cataloghi di campi sono due — merce e bancale — e `disponi` prende il catalogo come parametro; `etichettaBancale` sta accanto alle altre due |
| `lib/stampa-zebra.js` | 431 | **2.19 — il socket**, ed è il solo posto del servizio che ne apra uno verso l'esterno. Porta in un elenco chiuso, indirizzo **risolto prima** e privato per forza, attesa di 3 s (senza, una stampante spenta blocca venti secondi), **una connessione per volta per stampante**. `statoStampante` chiede `~HQES`, perché la 9100 accetta i byte anche a carta finita |
| `lib/schema.js` · `lib/schema-postgres.js` | 297 · 133 | Tabelle e indici in **due funzioni separate**, con la migrazione in mezzo, più **`MAIUSCOLE`** · il DDL PostgreSQL dalla **stessa** dichiarazione, con `COLLATE "C"` su ogni colonna di testo (senza, `ORDER BY location_code` rimescola le corsie) |
| `installa-pathfinder.ps1` | — | **L'installer.** Nel pacchetto diventa `installa.ps1`. `-NonChiedere`, **`-Prova`**, `-Database`, `-SenzaMigrazione` |
| `installa-servizio.ps1` | — | Registra le due attività pianificate e le variabili, `PATHFINDER_PG` compresa. Da amministratore, **una volta**, dal sorgente o da `C:\Pathfinder\servizio` |
| `prepara-postgres.ps1` | — | Controlla PostgreSQL e prepara ruolo e database. **Il motore non lo installa e non lo scarica.** `-Prova` guarda e non tocca |
| `installa-versione.ps1` · `torna-indietro.ps1` · `backup-serale.ps1` | — | Disinstalla-reinstalla e materializza · scambia `corrente` e `precedente` (**solo l'applicativo**) · backup a caldo delle 20:00 |
| `migrazione/` | — | `migra-sqlite-postgres.js`, `audit.js`, `audit-sqlite.js`, `maiuscola-codici.cjs`, `LEGGIMI.md`. **Viaggia nel pacchetto dalla 2.7**: migra una COPIA e ricontrolla i conteggi tavolo per tavolo, e prima di copiare gira l'audit |
| `test/collaudo.js` · `collaudo-migrazione-1.4.js` · `collaudo-installazione.js` | 586 · 158 · — | **139** prove sul servizio (le ultime dodici sull'attesa dell'avvio di PostgreSQL, con orologio e sonno finti) · 8 sul cambio di schema · 31 sugli script di installazione (incluso l'installer in `-Prova`) |
| `test/collaudo-stampa.js` | 449 | **2.19-2.20 — 100 prove sulle etichette**, con una **finta Zebra** che ascolta sulla 9100 e racconta cosa le è arrivato. Le tre che contano: con la carta finita l'invio riesce lo stesso, `~HQES` lo dice, e cinque richieste insieme escono tutte e cinque. **Quel che non può provare** — barre lette da un lettore, etichetta dritta, calore — è la voce 83 |

### Collaudi — `test/`

**1.303 prove in 48 file** al 03/09 notte (una saltata). Fuori da `npm test`:
**156** sul servizio, **100** sulle etichette, **43** sull'installazione.
`ambiente.js` è il preambolo comune.

Fuori da `test/` stanno i **tre** banchi automatici, che non girano con
`npm test`: **`banco/gerarchia.cjs`** (**40**, le cariche sul servizio — §5) e
**`banco/ciclo/gira.cjs`** (**47, tutte verdi** dal 01/09 — voci 70 e 71 chiuse;
dalla 2.16 **esce 1 se in quella corsa è stato alzato un difetto `grave`**, e in
quel caso tiene il verbale da parte invece di lasciarlo cancellare) e
**`banco/migrazione/dalla-1.4.cjs`** (**14**, il salto dal magazzino vero alla
beta su un database vuoto — voce 79).

Il **banco della schermata WIP** (§5) non è automatico: è un magazzino di
copia, degli ODP generati da lui e tre attrezzi da iniettare nella pagina.
Serve a guardare, e quel che ne esce si scrive qui.

Fra i file: **`imballo` (17)** e **`bancale` (16)**, i due della 2.20 ·
`serpentina` · `fefo` · `geometria` · `odp` · `anagrafica` ·
`conformita` · `cache` · `pacchetto` · `statistiche` · `compiti` · `misure` ·
`colli` · `parametri` · `documenti` · `auditMigrazione` · `maiuscole` · `sql` ·
**`driver`** · `dialogOspite` · `versioni` · **`giroOdp` (38)**.

- **`driver` gira LE STESSE PROVE SUI DUE DATABASE.** Ha guadagnato il suo costo
  alla prima corsa: quattro difetti che SQLite non poteva mostrare. Senza
  `PATHFINDER_PG_COLLAUDO` le prove PostgreSQL si dichiarano **saltate col
  motivo scritto**, invece di tacere.
- **Alcune prove leggono il SORGENTE invece di girare il codice, e non è un
  ripiego**: fissano regole che un DOM non c'è per verificare — una riga che
  nasce `hidden` si accende togliendo la classe, ogni causale di merce scrive le
  quantità, l'entrata nel vano WIP passa dal registro, i quattro posti del numero
  di versione, e il `return` muto di `#dlgOverlay` che non lasciava nessuna
  traccia osservabile.
- `schemaPostgres` gira a ogni `npm test` e serve a una cosa: che lo schema descriva le stesse ventuno collezioni che il
  servizio usa **oggi**.

---

## 10. API e variabili
| Famiglia | Rotte |
|---|---|
| **Applicativo** | `/` e `/app` → l'indice, **`no-cache`** · `/assets/:file` → gli assets, **`immutable` un anno**, col ripiego su `precedente` |
| **Aperte senza sessione** | `/api/health` · `/api/app-info` (le interroga l'installer, **prima** che esista un PIN) · `/api/auth/*`, che è la porta. `/api/auth/operatori` dà **il minimo**: sigla, nome, carica, «ha un PIN» |
| **Collezioni** | `GET/POST/PUT/PATCH/DELETE /api/c/:col[/:key]` · `/bulk` · `/count` · `/query` — **sessione richiesta dalla 2.11** |
| **Operazioni composte** | `/api/tx` · `/api/op/removeItem` · `/api/op/commitPickStop` · `/api/op/sampleItem` · `/api/op/moveUdc` · `/api/op/verifyPin` · `/api/op/hashPin` · `/api/op/stampaEtichetta` (`tipo`: **`item`**, **`udc`** o, dalla 2.20, **`pf`** — il bancale) · `/api/op/provaStampante`. `moveUdc` sposta l'unità e tutte le sue righe **in una transazione**, e rifiuta se nel vano d'arrivo la stessa chiave sta già fuori dall'unità |
| **Servizio** | `/api/load` · `/api/clear` · `/api/deleteWhere/:col` · `/api/backup` · `/api/events` (SSE) |
| **Colli** | `packs_out` è un elenco di `{da, quantita}` — la misura del collo e quanto ne esce; un numero solo significa «quel collo, intero». `packs_before` è il seme, come `qty_uom_before`. Con l'elenco, `qty` diventa facoltativo |
| Variabile di macchina | Valore |
|---|---|
| `PATHFINDER_PORT` | `4173` |
| `PATHFINDER_DB` | `C:\Pathfinder\data\pathfinder.db` (solo su SQLite) |
| **`PATHFINDER_APP_DIR`** | `C:\Pathfinder\app\corrente` — **si imposta una volta sola**: dopo, le versioni si scambiano sostituendo il contenuto di quella cartella |
| `PATHFINDER_APP_PREV` · `PATHFINDER_APP` | Il fratello `precedente` · il ripiego a file singolo, usato solo se `APP_DIR` è assente |
| **`PATHFINDER_PG`** | **Quale database.** Assente → SQLite. Presente → PostgreSQL con quella stringa. **Impostata VUOTA** → SQLite dichiarato, e batte `.env.local`. **Non sta nel repository** |
| `PATHFINDER_PG_POOL` · `_IDLE` · `_TIMEOUT` | Connessioni (10) · ms prima di chiudere una connessione ferma (30.000) · attesa per averne una (10.000). **`_IDLE` sta sotto la soglia del server apposta**: è il pool a doverle chiudere per primo |
| `PATHFINDER_PG_CA` | Il file della CA aziendale. **È un file, non un interruttore che spegne il controllo** |
| **`PATHFINDER_PG_COLLAUDO`** | **La stringa di connessione del database di collaudo.** Non si ripiega mai su `PATHFINDER_PG`, e il nome del database deve finire per `_collaudo` |
| **`PATHFINDER_COLLAUDO_PG`** | `1` fa girare `server/test/collaudo.js` contro PostgreSQL invece che su SQLite. **Vuole `PATHFINDER_PG_COLLAUDO` impostata**, e senza si ferma dicendolo |
| `PATHFINDER_HOST` | Su quale interfaccia si ascolta. Predefinito: tutte |
| `PATHFINDER_TOKEN` | La chiave di macchina, generata **una volta sola** dall'installazione: backup, installer, migrazione, collaudi |
| `PATHFINDER_BACKUP_ROOTS` | Stringe le destinazioni ammesse del backup, quando c'è |
| `PATHFINDER_TLS_CERT` / `_KEY` | Assenti → HTTP |
| `PATHFINDER_DEV_API` | Con chi parla `npm run dev`. Senza, parla col **servizio vero** |

**Si leggono all'avvio**: cambiate senza riavvio non hanno effetto.

---

## 11. Dove sta il resto
| Serve | Dove |
|---|---|
| Installare il servizio da zero, diagnosticare, backup | **[README.md](README.md) — in inglese, scritto sulla 2.16.** L'italiano è [README.it.md](README.it.md) ed è **fermo prima della 2.7** |
| Com'è fatto il servizio dati | [server/README.md](server/README.md) (inglese) · [server/LEGGIMI.md](server/LEGGIMI.md) (italiano, fermo alla 2.5) |
| Una riga per versione, dalla 1.4 alla 2.16 | [CHANGELOG.md](CHANGELOG.md) — in inglese |
| Che licenza ha | [LICENSE](LICENSE) — proprietaria, nessun diritto concesso a terzi |
| Versioni precedenti, loghi, etichette, file di prova, banco storico | `ARCHIVIO/` — e **non si cancella niente**: un archivio svuotato funziona una volta sola |
| Il ramo git della 2.3 ritirata | `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/2.3-reparto-e-giro-conto.bundle` — storia completa, recupero provato |
| La storia: handoff e piani fino al 17/08/2026 | `ARCHIVIO/HANDOFF STORICI/` — **memoria, non istruzioni** |
| Cosa è stato archiviato e quando | `ARCHIVIO/archive-manifest.json` |
| La scheda tecnica per il team IT | `documenti/IT-TECH-SHEET.md` — **REP-IT-001 rev02**, 02/09, **bilingue italiano/inglese**. La rev01 sta in `ARCHIVIO\documenti superati\` |
| Come si disegna un'interfaccia da magazzino | `.claude/skills/erp-wms-frontend/SKILL.md`. **Se diverge da §8, vince §8** |
| Il driver PostgreSQL e la migrazione | `server/migrazione/README.md` (inglese) e `LEGGIMI.md` (italiano). **`server/azure/` non esiste dal 26/08**: è diventato quello — voce 26 |
| ~~Demo portatile su chiavetta~~ · ~~Sheet tecnico IT~~ | **NON ESISTONO PIÙ — voce 43**, e vanno riscritti |

**Il repository tiene tutto, tranne i segreti — 27/08.** Decisione di Andrea:
dentro `node_modules`, `ARCHIVIO`, `banco`, `consegna` — 4.211 file, ~250 MB.
«Si ricostruisce» vale finché qualcuno lo ricostruisce, e un file che sta su un
disco solo prima o poi non c'è più (voce 43).

> ⚠️ **CAMBIATA IL 02/09, e non perché fosse sbagliata.** Cambia il motivo per
> cui il repository esiste: va a un'analisi del team IT. Di **4.539 file
> tracciati, 2.865 erano dipendenze** (`node_modules/` più `server/node_modules/`),
> **716 erano dipendenze di versioni archiviate** dentro `ARCHIVIO/`, e 37 il
> pacchetto costruito. **Il codice di questo progetto era il 6%.** Un
> repository in cui il codice è il 6% non si legge, e nessuna prassi di
> costruzione lo accetta. Adesso i file tracciati sono **921**.
>
> **La ragione del 27/08 resta onorata da due parti.** `package-lock.json` è
> tracciato, ed è lui la garanzia vera — `npm ci` rimette le stesse identiche
> versioni, non «versioni compatibili». E una copia integrale sta fuori da git
> in `Desktop\Pathfinder-archivio-2026-09-01\dipendenze-2.16\`:
> `node_modules-2.16.zip` (2.865 file, 42 MB) e `consegna-2.16.zip` (37 file),
> col suo LEGGIMI. **I file restano tutti su disco**: è cambiato il
> tracciamento, non l'archivio.
>
> **Conseguenza buona:** `consegna/` non è più tracciata, quindi **una build
> non sporca più `git status`** — il prezzo che §11 dichiarava di pagare non si
> paga più.

**Restano fuori tre cose, e non per il peso**: i **file di database**, che portano `pin_hash` e `pin_salt`
accanto a nome e cognome di persone vere; **`.env.local`**, che porta utente e
password di PostgreSQL; e dal 31/08 i **codici di ripristino** della 2.13, che
si riconoscono dalla forma — venti caratteri in quattro gruppi da cinque.
**Git non dimentica**: un segreto spinto una volta va considerato bruciato.

> ⚠️ **E UNO CI ERA ENTRATO LO STESSO — voce 72, chiusa il 01/09.** La regola
> diceva «i file di database», il `.gitignore` diceva `*.db`, e un dump di
> PostgreSQL si chiama `.dump`: `banco/db/pathfinder-2026-08-27.dump` è entrato
> col commit che dichiarava di lasciare fuori i segreti, e dentro aveva
> `pin_hash`, `pin_salt` e i nomi. **Una regola scritta in prosa e un filtro
> scritto per estensione non sono la stessa regola**, e questo è stato il
> prezzo: `filter-repo`, push forzato, **tutti gli SHA cambiati**. Quel che non
> si disfà sta nella **voce 78**.

> ⚠️ **UNO DI QUEI CODICI STA IN `ARCHIVIO\` COME FILE DI TESTO**, col codice
> nel nome e nel contenuto, scritto il 28/08. **Non è mai entrato in git** e da
> oggi `.gitignore` lo tiene fuori per forma, senza nominarlo — nominarlo lo
> scriverebbe nel repository. **Va cancellato a mano**, e se era un codice vero
> va rigenerato da Configurazione → Operatori: il vecchio smette di valere
> nello stesso gesto.

**E dal 02/09 i documenti sono in due lingue.** `README.md` è **in inglese** e
scritto sulla 2.16, perché è quel che il team IT legge per primo; l'italiano
resta in `README.it.md`, **dichiarato fermo** — i suoi capitoli da 1 a 8 sono
precedenti alla 2.7 e descrivono ancora SQLite come unico database e
`installa-servizio.ps1` come installer. Stessa forma per il servizio
(`server/README.md` inglese, `server/LEGGIMI.md` italiano fermo alla 2.5) e per
la migrazione. **`server/LEGGIMI-pacchetto.txt` resta in italiano**: viaggia
dentro il pacchetto e lo legge chi installa in magazzino.

**Questo INDEX resta in italiano e resta il documento autorevole.** Non si
traduce: due copie di 2.500 righe divergono, e la seconda che diverge è quella
che qualcuno legge per sbaglio.

---

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
