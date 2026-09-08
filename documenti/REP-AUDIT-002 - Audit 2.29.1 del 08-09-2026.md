# REP-AUDIT-002 — Audit di Pathfinder 2.29.1

**Data** 08/09/2026 · **Macchina** quella di sviluppo (§0 dell'INDEX: il magazzino
vero è altrove e gira la 1.4) · **Metodo** prove che cercano di rompere, non di
confermare · **Esito** cinque difetti trovati, cinque corretti, ognuno con la
prova che lo riprende.

Documento di sessione. La traccia viva del progetto resta `INDEX.md`.

---

## 1. Da dove si è partiti, e cosa non tornava

Il primo gesto è stato chiedere al servizio invece che al documento, come vuole
§0 punto 2:

    Invoke-RestMethod http://127.0.0.1:4173/api/app-info
    → 2.29.0, impronta 7b8f6ca0…, costruita 2026-09-08T00:04:19Z

**L'INDEX diceva «2.29.0 — costruita, non installata». È la nona volta che
quella riga sbaglia.** Su questa macchina servita vuol dire installata, e la
2.29.0 stava servendo.

Poi le prove. Cinque banchi su sei erano verdi; il sesto no:

| banco | prima | dopo |
|---|---|---|
| `npm test` (client) | 1.464 verdi | 1.499 verdi |
| `server\test\collaudo.js` | **28 rosse, poi interrotto** | 156 verdi |
| `server\test\collaudo-migrazione-1.4.js` | 8 verdi | 8 verdi |
| `server\test\collaudo-installazione.js` | 43 verdi | 43 verdi |
| `server\test\collaudo-stampa.js` | 100 verdi | 100 verdi |
| `banco\gerarchia.cjs` | **36 rosse su 40** | 40 verdi |

`collaudo.js` non partiva nemmeno: `EADDRINUSE` sulla 4199, tenuta da un banco
della sessione precedente rimasto acceso dalle 01:32. Chiuso quello, sono uscite
le 28 rosse.

---

## 2. I cinque difetti

### 2.1 — L'AMBIENTE DELLA MACCHINA ENTRAVA NEI BANCHI, E LI FACEVA MENTIRE

**Gravità: alta.** Due banchi su tre inservibili dalla 2.26, e uno che poteva
scrivere sul magazzino vero.

Su questa macchina sette `PATHFINDER_*` stanno a livello **MACCHINA**: le eredita
ogni processo node. `collaudo.js` era scritto sapendolo e neutralizzava
`PATHFINDER_PG`, `_TOKEN`, `_DB`, `_PORT`, `_APP_DIR`, `_LOG` — ma non le due
`PATHFINDER_TLS_*`, che **non esistevano quando quel file è stato scritto**:
sono arrivate con la 2.26.

Conseguenza: il banco partiva in HTTPS mentre `const BASE = 'http://127.0.0.1:4199'`
parlava in chiaro. Sulla stessa porta la 2.26 risponde `301` a chi bussa in
chiaro, e **`fetch` segue il redirect convertendo la POST in GET**. Ogni
scrittura diventava una lettura.

Il modo in cui si nascondeva è la parte che conta: **non falliva, rispondeva.**
Le prove in lettura passavano; le altre fallivano accusando il servizio di cose
false — «chiave duplicata respinta con 409, non 500 — stato 200», e su
`gerarchia.cjs` tre «VICOLO CIECO» e un «LA PORTA È RESTATA APERTA» che
avrebbero mandato qualcuno a cercare una falla di sicurezza inesistente.

Cercando la stessa famiglia sono usciti altri tre file:

| file | cosa ereditava | conseguenza |
|---|---|---|
| `banco\gerarchia.cjs` | `PATHFINDER_TLS_*` | 36 prove rosse su 40 |
| `banco\prova-corrente.cjs` | `PATHFINDER_PG` **e** TLS | apriva il **PostgreSQL del magazzino** mentre porta e nome del file dicevano «prova» |
| `banco\banco-2.4.cjs`, `banco\banco-browser.cjs` | idem | idem |

`prova-corrente.cjs` è il più grave: la sua testata dichiarava «non scrive niente
in `C:\Pathfinder`» — vero sulla cartella, falso sul database, perché
`PATHFINDER_PG` **vince su `PATHFINDER_DB`** (`server/lib/db.js`). È esattamente
l'incidente del 26/08 che costò gli 11.197 articoli appena migrati, lasciato
aperto in un file che nessuno aveva riletto.

**Correzione.** `scollegaTls(env)` in `server/lib/tls.js` — muta l'oggetto e lo
restituisce, così serve tanto su `process.env` quanto su una copia per `spawn`.
Chiamata nei cinque file. In `prova-corrente.cjs`, `banco-2.4.cjs` e
`banco-browser.cjs` anche `PATHFINDER_PG = ''`.

**Correzione della causa, non solo dell'effetto.** La ricetta di §5 chiedeva di
scrivere cinque variabili a mano in una riga di PowerShell: una riga in più si
dimentica di nuovo. Nasce **`banco\servizio-banco.mjs`**, gemello di
`dev-banco.mjs`: un comando solo, ambiente dichiarato per intero, rifiuta un
database che non esiste e rifiuta un database dentro `C:\Pathfinder\`.

    node banco\servizio-banco.mjs                 # ui.db, porta 4199
    node banco\servizio-banco.mjs db\video.db     # un altro database

**Prova.** `test/bancoNonEredita.test.js`, 18 casi. Non elenca i file a mano: li
**cerca**, così un banco nuovo scritto domani senza la riga cade il giorno
stesso. Fissa anche il comportamento di `fetch` sul `301`, perché è il modo in
cui il difetto si è nascosto e chi legge una prova rossa deve sapere cosa
cercare. Verificata rimettendo il difetto: 2 rosse; rimessa la correzione: verde.

### 2.2 — UNA PROVA SCADUTA ALLA 2.13, NASCOSTA SOTTO IL ROSSO

**Gravità: bassa come effetto, alta come lezione.**

Rimesso in piedi `gerarchia.cjs`, una prova restava rossa — e aveva ragione il
codice. La 2.18 ha tolto `rec_set` da `/api/auth/operatori` di proposito: quella
rotta risponde **senza sessione**, e dire in anticipo quali Admin hanno un codice
di ripristino serve solo a chi cerca il bersaglio giusto per un PIN di sei cifre.
La prova pretendeva ancora che ci fosse.

Era rossa **dalla 2.18** e nessuno l'ha vista, perché dalla 2.26 era rosso tutto
il banco. Un banco rotto non è silenzioso: è peggio, perché copre.

**Correzione.** La prova chiede adesso la regola che vale: `rec_set` fuori dalla
rotta pubblica, dentro a `/api/c/operators` che una sessione ce l'ha.

### 2.3 — IL PRIMO ADMIN SI CREAVA, E LO SCHERMO DICEVA CHE NON ERA RIUSCITO

**Gravità: alta.** È il primissimo gesto su una macchina appena installata.

Trovato a video, su un banco con `operators` vuota. Compilato il wizard di primo
accesso e premuto «Crea Admin e accedi», usciva in rosso:

> Sessione non valida: identificarsi.

La rete diceva un'altra cosa:

    POST /api/op/hashPin          → 200
    POST /api/op/hashRecovery     → 200
    POST /api/c/operators         → 200   ← l'Admin È STATO CREATO
    POST /api/c/meta/bulk?mode=put → 401  ← e qui lanciava

`Store.addOperator` finisce con `_touchMeta()`, che scrive due chiavi di
servizio su `meta`. Ma **la scrittura dell'operatore col PIN è esattamente il
gesto che chiude la finestra di primo avvio**: la riga dopo partiva senza
sessione. `addOperator` lanciava, e le righe successive di `_confirmFirstLeader`
— `Auth.accedi`, l'attivazione, la chiusura del cancello, il codice di
ripristino — non venivano mai eseguite.

Il commento della 2.11 dichiarava già l'intenzione giusta: «è il PIN che chiude
la finestra di primo avvio, e chi ha appena creato l'Admin deve averla». La
sessione si prendeva, solo **una riga troppo tardi**.

Cosa vedeva chi installa: wizard aperto, messaggio d'errore, e un Admin che a
database c'era col PIN appena scelto. Riprovando usciva «Le iniziali sono già
assegnate a un altro operatore» — un secondo messaggio, diverso, che non nomina
la via d'uscita. Nessuna riga diceva di ricaricare ed entrare col PIN.

**Correzione.** `addOperator` prende `senzaMeta`, di serie `false`: le altre
diciassette chiamate non cambiano. `_confirmFirstLeader` crea l'operatore senza
toccare `meta`, **prende la sessione**, e poi tocca `meta`. Ordine verificato a
video: `operators 200 → login 200 → meta/bulk 200`, e la schermata del codice di
ripristino compare come deve.

Il tetto di `store.ts` sale da 4.596 a 4.606 righe, e `test/regole.test.js` dice
perché.

**Prova.** `test/primoAdmin.test.js`, 5 casi. Guarda **l'ordine**, non l'esito:
un esito si può far tornare verde spegnendo la finestra o allargando i permessi
di `meta`, che sono due modi di rimettere il difetto sotto un'altra forma.

### 2.4 — DUE SCHEDE DEL CRUSCOTTO DICEVANO «F3», E F3 NON FACEVA NÉ L'UNA NÉ L'ALTRA

**Gravità: media.** In corsia lo schermo si guarda un istante.

Visto a video sul cruscotto: **Trasferimento** e **Prelievo ordini** portavano
scritto lo stesso tasto. La tabella vera diceva `F3: ['pick', null]` e chiamava
`startMov('pick', null)`, che apre il prelievo senza dire su quale scheda — cioè
**sull'ultima usata**, perché `_pickSubMode` è appiccicoso.

Lo scenario che sbaglia: un operatore preleva una volta per la produzione. Più
tardi, dal cruscotto, preme F3 per fare un trasferimento — il tasto che la scheda
gli promette. Atterra sul prelievo di produzione. Riprodotto e misurato.

E nello stesso momento **F4, F6, F7 e F8 esistevano e nessuna scheda lo diceva**:
quattro scorciatoie che l'operatore non poteva sapere di avere.

La causa è che erano due elenchi della stessa cosa — uno in `ui/app.ts` per
ascoltare la tastiera, uno accanto a ogni scheda per stamparne il nome. Due
elenchi divergono; questi l'avevano già fatto, in silenzio, perché niente li
confrontava.

**Correzione.** `TASTI_FUNZIONE` e `tastoPer(mode, sub)` in
`src/modules/cruscotto.ts`, puri. `sub` fa parte della chiave: è quello che
mancava. La scheda **chiede** il suo tasto; chi ascolta la tastiera legge la
stessa tabella e passa da `_goOp`, che sa aprire anche la sottoscheda.

A video, dopo: `Carico/Scarico F2 · Trasferimento F3 · Prelievo ordini — ·
Inventario F4 · Quarantena F7`. F3 porta a Trasferimento **anche dopo** essere
passati dalla produzione: lo scenario che rompeva non rompe più.

**Prova.** `test/tastiFunzione.test.js`, 10 casi. Non guarda che il tasto sia F3
— quella è una scelta e può cambiare — ma le tre cose che non devono più poter
succedere: due schede sullo stesso tasto, una scheda che annuncia un tasto che
porta altrove, un tasto che dimentica la sottoscheda.

### 2.5 — LA STESSA FRASE QUATTRO VOLTE NELL'AVVISO DEL PERCORSO

**Gravità: media.** Un avviso ripetuto spinge fuori dallo schermo quelli non
ancora letti.

Provando il difetto centrale della 2.29 — «dal vano di lavorazione non si
preleva» — sono state spostate nel vano WIP `M06-COM-01` tutte e quattro le
righe di giacenza di `7000924#123456`, così che quel vano fosse l'**unica**
ubicazione del lotto. **La 2.29 tiene**: nessuna tappa, riga fuori percorso con
motivo `in_lavorazione`.

Ma l'avviso usciva **quattro volte identico**. `pickRoute.build` scriveva una
nota per ogni riga di giacenza invece che per ogni coppia vano-motivo.

Non è un artificio del banco: `(location_code, item_key)` è dichiarato in
`server/lib/schema.js` sotto `composite`, cioè un **indice e non un vincolo di
unicità** — due righe dello stesso lotto nello stesso vano ci stanno, e un
caricamento di massa le fa. La migrazione dalla 1.4 (voce **79**) è esattamente
un caricamento di massa.

**Correzione.** Deduplica per `(location_code, reason)` dentro il ciclo.
`offroute` era già corretto — una voce sola: si moltiplicava solo l'avviso.
A video: da quattro note a una.

**Prova.** Due casi nuovi in `test/vanoWipNonSiPreleva.test.js`. Il secondo
copre il rischio della deduplica: **due vani diversi restano due note**, perché
si deduplica il doppione, non il fatto.

---

## 3. Cosa è stato provato a video, e cosa no

Banco su copia usa-e-getta di `pristino.db`, servizio in chiaro sulla 4199,
front end di sviluppo sulla 5199, poi il **pacchetto vero** installato in
`banco\app` e servito.

Provato: primo accesso e creazione Admin, codice di ripristino, identificazione,
cruscotto e scorciatoie, Movimenta e le sue sottoschede, prelievo automatico con
i due `.xlsx` veri di `banco\odp-wip\`, esclusione del vano WIP dal percorso,
schermata WIP con conti aperti, avvisi fuori percorso.

**Non provato, e va detto:** il giro di prelievo fino alla chiusura con un
operatore vero; la stampa su Zebra con carta montata (voci **83** e **89**); il
numero di pagina del DDT su carta (voce **97**); il carico di un camion vero
(voce **92**); la maschera a 480 px di questa versione.

---

## 4. Quel che resta aperto — voci nuove per §4

| # | Cosa | Perché non è stato chiuso qui |
|---|---|---|
| **98** | `(location_code, item_key)` su `inventory` è un indice, non un vincolo di unicità, mentre tutto il modello di prelievo tratta quella coppia come **un posto fisico solo** | Renderlo unico è una decisione sui dati, non sul codice: su un database che già contiene doppioni la migrazione fallisce, e va deciso se fonderli o rifiutarli. Serve prima contare quanti ce ne sono nel magazzino vero |
| **99** | «Prelievo ordini» non ha una scorciatoia, e Spedizioni ne ha una (F8) che nessuna scheda annuncia | È una scelta di chi usa il terminale, non un difetto: adesso le etichette dicono il vero, e assegnare F5 o F8 alla produzione è una riga sola quando Andrea dice quale |
| **100** | Il `301` in chiaro della 2.26 e il demultiplatore che lo decide non hanno un banco | `decidiTls` ed `eSalutoTLS` sono coperte da ferme; ad aprire un socket cifrato servirebbe un certificato costruito dalla prova, e va deciso se vale |

---

## 5. Riepilogo

| | prima | dopo |
|---|---|---|
| prove verdi | 1.464 client + 191 servizio (156 e 40 non giravano) | **1.499 client + 347 servizio e banco** |
| file di prova | 56 | 60 |
| difetti aperti trovati | — | 5 trovati, **5 corretti** |
| voci nuove in coda | — | 3 (98, 99, 100) |

**Pacchetto consegnato:** `consegna\Pathfinder 2.29.1\`
impronta `b64132daf1a9f7d6e40e44409acdd3f2d5e7f1b5adba7d80a5ee88d771e00c96`,
8 file, 2.07 MB, costruita `2026-09-08T03:02:33Z`.
Provata al banco servendo i byte del pacchetto: `/api/app-info` risponde
`2.29.1` con quell'impronta.

**Non installata.** Su `C:\Pathfinder\` non è stato toccato niente: gira ancora
la 2.29.0. L'installazione si propone e si aspetta il via — §0.
