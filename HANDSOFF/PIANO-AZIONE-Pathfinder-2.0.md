# PIANO DI AZIONE — Pathfinder 2.0

**Da monolite a moduli, con il servizio in casa e l'identità in Entra**
Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 10/08/2026 · Rev. 01 — piano operativo
Sostituisce, sui punti in conflitto: `Pathfinder_Handoff_Valutazione_Tecnica_ES6 TYPESCRIPT.md`
e `Pathfinder_Handoff_Infrastruttura_Azure_ERP_REDIS.md`

---

## 1. Perché quei due documenti vanno corretti prima di eseguirli

I documenti di valutazione del 9 agosto sono scritti contro una versione di Pathfinder
che non esiste più. Descrivono `index.html`, IndexedDB come motore primario, PWA
offline-first e una coda di sincronizzazione sul client. Ma alla data in cui sono stati
scritti il database era **già uscito dal browser** e la decisione §4.1 dell'HANDOFF 1.0
— *«niente lavoro offline: se il servizio non risponde l'app si ferma e lo dice»* — era
già presa ed era già marcata come non riapribile.

Tre correzioni, in ordine di peso.

### 1.1 — Azure Static Web Apps non può ospitare Pathfinder

SWA serve asset statici. Il client di oggi non è un asset statico: chiama `/api/c/…`,
`/api/tx`, `/api/op/…` e resta appeso a un feed SSE. Ospitarlo su SWA significa buttare
SQLite, riscrivere `lib/db.js` contro Azure SQL o PostgreSQL, e riscrivere il feed —
che su App Service in scale-out non funziona senza un backplane condiviso.

È il costo che il documento non contabilizza: non è un cambio di hosting, è la
sostituzione dello strato dati.

### 1.2 — Redis non risolve un problema che abbiamo

Il documento assegna a Redis i lock di corsia e la concorrenza fra terminali. Quella
concorrenza è **già arbitrata**, dentro `/api/op/…`, da una transazione SQLite sulla
stessa macchina che possiede il dato. Un sito, ~10 terminali, 300-500 movimenti al
giorno: non c'è un carico che giustifichi un secondo archivio in memoria.

Redis diventa necessario **solo come conseguenza** di una scelta diversa — più istanze
applicative dietro un bilanciatore, che hanno bisogno di un backplane per il pub/sub.
Non è un obiettivo, è un sintomo. Se non si scala orizzontalmente, non serve.

### 1.3 — La coda verso l'ERP sta sul server, non su IndexedDB

Il documento propone «offline-first con queue» sul client. Sarebbe il ritorno esatto di
ciò che la §4.1 ha escluso: code da risincronizzare e dati che divergono fra terminali.

L'integrazione con l'ERP non ha bisogno di quello. Il client resta online-only; è **il
servizio** ad accumulare i movimenti da spedire a D365 e a riprovare. Un operatore non
deve sapere che esiste un ERP, e il suo terminale non deve custodire niente che il
server non abbia già.

---

## 2. Decisioni prese

| # | Decisione | Conseguenza operativa |
|---|---|---|
| D1 | **Servizio dati on-prem.** Node + SQLite su macchina/VM in LAN. Azure resta per CI/CD, backup off-site e canale verso l'ERP | Nessuna riscrittura di `lib/db.js`. Niente Redis. Niente Azure SQL. L'operatività di magazzino non dipende dalla WAN |
| D2 | **La build produce un file unico.** Si sviluppa a moduli, si distribuisce un `.html` che apre anche con doppio clic | `vite-plugin-singlefile`. Dexie e SheetJS scendono dal CDN e diventano locali. `LocalPersistence` resta viva |
| D3 | **Microsoft Entra ID come identità** per l'accesso all'applicativo | Registrazione applicativa a carico dell'IT, HTTPS obbligatorio, §10 da riscrivere, break-glass a PIN obbligatorio (vedi §3) |
| D4 | L'app Android del documento `handof workspace.md` è **un esperimento archiviato** | Fuori dal piano. Nessun vincolo di riuso mobile sul core |

---

## 3. Le due tensioni di D3, e come si sciolgono

### 3.1 — Entra riporta dentro la dipendenza dalla WAN

Con D1 il magazzino non dipende più da internet per lavorare. Con D3 dipende da internet
per **entrare**. Senza modalità offline, una linea giù alle 6:50 è un turno che non parte.

Tre requisiti, non negoziabili se D3 resta:

1. **Sessione lunga con refresh token in cache locale.** Chi è già entrato continua a
   lavorare per tutta la durata del token anche a linea caduta.
2. **Validazione lato server con JWKS memorizzato su disco.** Il servizio deve poter
   verificare una firma senza raggiungere Microsoft. La chiave si aggiorna quando la
   linea c'è; non si va a prendere al momento del bisogno.
3. **Break-glass a PIN, documentato e tracciato.** Quando Entra non è raggiungibile,
   l'accesso avviene col PIN già esistente e il movimento viene marcato come tale nel
   registro. Un magazzino che si ferma perché è caduta una linea di cui non ha bisogno
   per lavorare è un guasto di progetto, non un evento.

### 3.2 — MSAL non gira su `file://`

D2 chiede che il file singolo apra con doppio clic. MSAL su `file://` non ha una origin
valida né un redirect URI: **non può funzionare**. Quindi la copia d'emergenza usa il
ramo PIN.

Non è un caso particolare: è la stessa forma della scelta che già esiste in coda a
`LocalPersistence` (riga 6179). L'autenticazione diventa un secondo adapter con lo
stesso meccanismo — `EntraAuth` / `PinAuth`, un selettore che guarda il protocollo e la
raggiungibilità, e capability flag interrogati invece che indovinati. Il resto del
codice non deve sapere quale dei due ha sotto, esattamente come oggi non sa quale
persistenza ha sotto.

### 3.3 — Da verificare con l'IT prima di implementare

Entra ID prevede un metodo di accesso **a QR code con PIN, pensato per i frontline
worker su dispositivi condivisi**. Se è abilitabile sul tenant Dietopack, ricalca quasi
alla lettera il flusso che gli operatori usano già e fa cadere quasi tutto l'attrito di
D3. **Va chiesto all'IT prima di scrivere una riga di `auth/`**: cambia il disegno.

---

## 4. Le fasi

Sequenza: **0 → 1 → 2 → (3 ∥ 6) → 4 → 5**.
L'infrastruttura sta in fondo perché è l'unica parte che dipende da decisioni altrui.

### Fase 0 — Messa in sicurezza. Nessuna riga di codice applicativo

Prima di spacchettare 17.700 righe bisogna poter tornare indietro.

| Cosa | Perché | Peso |
|---|---|---|
| **`git init` + tag della 1.1** | Oggi non c'è controllo di versione. Spacchettare un monolite senza `diff` e senza `revert` è la cosa più rischiosa del piano | 20 min |
| **Il `.db` esce da OneDrive** | `server/data/pathfinder.db` sta in una cartella sincronizzata, con un `-wal` da 6,8 MB e un'istanza viva che scrive. OneDrive che sincronizza uno SQLite aperto è un modo noto di corrompere il file. Destinazione `C:\Pathfinder\data\`, `PATHFINDER_DB` esplicito. **Va verificato anche sulla macchina di produzione**: l'installazione copia la cartella `MAPPER` intera | 30 min |
| Backup serale schedulato su `POST /api/backup` | Aperto §7.5 | 10 min |
| HTTPS con certificato interno | Aperto §7.2 — e **prerequisito di D3**: MSAL esige HTTPS | 30 min |
| Dati reali del mittente | Aperto §7.1 — finché mancano i DDT escono non conformi | 5 min |

**Criterio di riuscita:** il servizio gira dal nuovo percorso, in HTTPS, con backup che
si vede nella cartella la mattina dopo, e la 1.1 è taggata in git.

### Fase 1 — Impalcatura di build, logica invariata

Il file si divide in tre pezzi e una build lo ricompone. **Nessun `import` nuovo,
nessuna funzione spostata, nessun miglioramento.**

- Vite + `vite-plugin-singlefile`.
- `index.html`: lo scheletro DOM di oggi (righe 4828-5058).
- CSS: i 22 blocchi MD3 numerati e i quattro layer di stampa, in file separati,
  **nell'ordine attuale** — la cascata dipende dall'ordine e l'ordine è deliberato.
- JS: **un solo** modulo, il contenuto di 5058-22770 così com'è.
- Dexie e SheetJS scendono in `vendor/` (D2, e vincolo §10: nessuna richiesta esterna).

> **Trappola §5.1.** Il file contiene sequenze `\uXXXX` letterali. L'estrazione si fa
> **per intervallo di righe** con `awk`/`sed`, mai con sostituzione testuale che le
> attraversi. Vale per tutta la Fase 1 e la Fase 2.

**Criterio di riuscita:** la build produce un applicativo che si comporta come la 1.1,
i 29 test del server sono verdi, e i tre collaudi che contano (§8 dell'HANDOFF 1.0 —
contesa fra terminali, riavvio del servizio ad app aperta, contesto non sicuro) passano.

### Fase 2 — Spacchettamento per strati, dal basso

Un modulo per commit, seguendo confini che **esistono già**: `Persistence` (6179),
`Store` (6190), `App` (8982). Non è un monolite piatto — è un'architettura a strati
scritta dentro un file solo. Chi ha firmato il refactor v2.6.0 stava preparando questo.

Ordine: `core/schema` → `core/persistence` → `core/store` → `modules/` → `docs/` →
`ui/`. Dopo ogni commit: build + collaudo. **Qui non si aggiungono funzioni e non si
corregge niente**: è la regola che tiene il rischio a zero. Ogni difetto trovato
strada facendo si annota e si chiude in una fase dedicata, dopo.

### Fase 3 — TypeScript progressivo

`allowJs` + `checkJs` su tutto, `strict` spento. Si tipizzano **prima i contratti**,
non l'interfaccia: `Item`, `Location`, `Movement`, `OutboundDoc`, `Operator`,
`PickSession`, `DisposalRecord`.

Il guadagno vero non è l'autocompletamento: è che **gli stessi tipi li importa anche il
server**. Il contratto client/server smette di essere una convenzione scritta in un
commento e diventa una cosa che il compilatore verifica. Da lì, `strict` si accende un
modulo alla volta. La UI si tipizza per ultima, o non si tipizza.

### Fase 4 — Test automatici

Vitest sui moduli puri — serpentina, geometria delle ubicazioni, FEFO, parser ODP:
è precisamente la parte che oggi si collauda a mano nel browser e che nessuno rilegge
due volte. I 29 test del server restano dove sono. Playwright per i tre scenari di
contesa, che oggi si eseguono a mano con due schede.

### Fase 5 — Infrastruttura (D1 + D3)

- Servizio su VM aziendale invece che su PC di magazzino, se l'IT la fornisce: backup,
  UPS e snapshot diventano un problema loro e non tuo.
- Attività pianificata come oggi (§4.3: niente NSSM, l'antivirus lo blocca).
- Pipeline Azure DevOps o GitHub Actions: `npm run build` → artefatto firmato →
  distribuzione sulla macchina di servizio.
- Backup off-site del `.db` su Azure Storage, sopra il backup serale locale.
- Entra ID: registrazione applicativa, redirect URI su HTTPS interno, i tre requisiti
  della §3.1.

### Fase 6 — Predisposizione ERP (in parallelo alla Fase 3, non in fondo)

- Parsing Sage X3 / Excel dietro un'interfaccia, in `modules/odpParser`.
- Tipi di dominio indipendenti dalla sorgente: l'algoritmo di prelievo non deve sapere
  se l'ODP arriva da un Excel di X3 o da una entity OData di D365.
- **Coda di uscita verso l'ERP sul server** (§1.3), con ritentativi. Una tabella, non
  un servizio nuovo.
- Azure Functions come middleware verso le API di D365, se e quando l'ERP arriva: tiene
  le credenziali dell'ERP fuori dalla macchina di magazzino.

---

## 5. Struttura target

Adattata a Pathfinder come è davvero — non l'albero generico del documento di
valutazione, che nomina moduli (`quarantine.ts`, `route.ts`) senza corrispondenza con
i confini reali del codice.

```text
pathfinder/
├─ index.html                     scheletro DOM
├─ package.json · vite.config.ts · tsconfig.json
├─ vendor/                        dexie.min.js · xlsx.full.min.js  (§10)
├─ src/
│  ├─ main.ts
│  ├─ styles/                     22 sezioni MD3 + 4 layer di stampa, in ordine
│  ├─ types/                      entità e contratti — condivisi col server
│  ├─ core/
│  │   ├─ schema.ts               migrazioni v1→v7 (ramo locale)
│  │   ├─ persistence/            local · remote · index (il selettore)
│  │   ├─ auth/                   entra · pin · index (stesso schema del selettore)
│  │   └─ store/                  cache · mutazioni · giacenze · identità
│  ├─ modules/                    geometry · pickRoute · fefo · quarantine
│  │                              outbound · disposal · movlog · odpParser
│  ├─ docs/                       testata comune · ddt · verbale · cartelloNC
│  │                              reportPrelievo
│  └─ ui/                         views/ (dashboard, mappa, movimenta, prelievo,
│                                 registro, config) · components/ · dialogs/
├─ server/
│  ├─ pathfinder-server.ts        (JS fino alla Fase 3)
│  ├─ lib/{db,schema}.ts
│  ├─ auth/entra.ts               validazione token, JWKS in cache su disco
│  └─ integration/d365/           coda in uscita verso l'ERP
└─ dist/pathfinder-2.0.html       file unico distribuibile
```

---

## 6. Cosa NON si fa, e perché

| Non si fa | Perché |
|---|---|
| Redis / Azure Cache for Redis | Nessun problema aperto da risolvere (§1.2). Rientra solo se un giorno si scala orizzontalmente |
| Azure Static Web Apps | Incompatibile con il servizio dati attuale (§1.1) |
| Azure SQL / PostgreSQL | Conseguenza di una scelta di hosting che D1 ha escluso |
| Coda offline su IndexedDB | Riaprirebbe la §4.1 (§1.3) |
| Riscrittura della UI, framework a componenti | Fuori perimetro. La UI si sposta, non si riscrive |
| Correzioni funzionali durante le Fasi 1-2 | Una modifica alla volta, o non si sa più cosa ha rotto cosa |

---

## 7. Aperti che restano dall'HANDOFF 1.0

Confluiscono in Fase 0 (§7.1 mittente, §7.2 HTTPS, §7.5 backup). Restano fuori dal
piano e da programmare a parte:

- §7.3 — schede grafico del cruscotto che tagliano ~6px
- §7.4 — conferma dell'elenco causali di trasporto con l'utente
- §7.6 — popolamento `weight_net_kg` / `pieces_per_pack` in anagrafica

---

## 8. Domande aperte

1. **Chi è l'interlocutore IT** che approva la registrazione applicativa Entra e rilascia
   il certificato interno? Senza quelle due cose, D3 e la Fase 0 si fermano.
2. Il **QR + PIN per frontline worker** di Entra è abilitabile sul tenant? (§3.3)
3. La macchina di servizio resta il **PC di magazzino** o passa a una **VM aziendale**?
4. Il ripiego a file singolo lavora in **scrittura** o solo in consultazione e ristampa?
5. **Sage X3 fino a quando?** Convivenza X3 + D365 o passaggio netto? Cambia il disegno
   dell'adapter di Fase 6.
6. Il vincolo §10 — *«nessuna richiesta di rete verso l'esterno»* — **va riscritto**:
   Entra è una richiesta verso l'esterno. Confermi la nuova formulazione?
7. Numerazione del rilascio: **2.0** (rottura strutturale) o 1.2?

---

*Uso interno Dietopack S.r.l. / Naturacare Group — © Andrea Sacchetti*
