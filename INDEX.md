# INDEX — Pathfinder

**Punto di partenza di ogni conversazione.** Dare questo file più
[HANDOFF 1.4](HANDOFF/HANDOFF-pathfinder-1.4.md), che dice da dove si riparte e
quali trappole sono già state pagate. Il resto si apre quando serve davvero.
Manutenzione: si aggiorna a ogni commit che sposta uno dei numeri o degli aperti.

Nota sugli archivi: alcuni artefatti storici sono stati spostati in ARCHIVIO per pulizia. Vedere il manifesto di archivio (machine-readable) qui: [ARCHIVIO/archive-manifest.json](C:/Users/sacch/OneDrive/Desktop/PROGETTI E CODING/MAPPER/ARCHIVIO/archive-manifest.json) e la versione leggibile qui: [ARCHIVIO/archive-manifest.md](C:/Users/sacch/OneDrive/Desktop/PROGETTI E CODING/MAPPER/ARCHIVIO/archive-manifest.md).

Per le conversazioni con Claude: caricare SOLO INDEX.md (punto di stato) e HANDOFF/HANDOFF-pathfinder-1.4.md; l'INDEX rimane il singolo file di riferimento per tracciamento e sviluppo.

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
Repo privato: `sacchetti84-dev/pathfinder`, branch `main` · agg. **17/08/2026**

---

## 1. Stato

| Voce | Valore |
|---|---|
| In produzione | **`C:\Pathfinder\app\pathfinder-1.6.1\`**, servita attraverso la giunzione `corrente` dal **17/08 sera**. Impronta `3e98f1c8…`, 1.614.368 byte — **gli stessi byte di prima**: è cambiata la strada, non l'applicativo |
| **Il meccanismo della 1.7 è in servizio** | `service_version 1.7`, `modo: cartella`. Da adesso installare e tornare indietro **non vogliono più l'amministratore né il riavvio** — §7ter |
| **1.7 — costruita, NON ancora servita** | `consegna/` con indice, assets a impronta e manifesto. Manca il passo 2: `installa-versione.ps1 -Da .\consegna -Versione 1.7` |
| Ritorno indietro | **`pathfinder-1.6.html`**, 1.625.239 byte, in radice. Le 1.4.3 e 1.4.4 sono scese in `ARCHIVIO/BUILD/` — §7bis |
| Interruttori | **DUE accesi**: `feature.tasks` dal **13/08 10:31:06** (`ANDS`) e **`feature.uom` dal 13/08 13:54:36** (`BABB`). Gli altri tre spenti. `uom` è stato alzato e abbassato **cinque volte** in un giorno da due operatori — riletto da `featureLog` il 13/08 sera, i documenti dicevano «spento» |
| **1.4.3** | **in magazzino il 13/08 notte** — sei blocchi su sei, otto flussi provati su copia del database vero. **Acceso lo stesso giorno** |
| **1.4.3.1** | Vissuta mezza giornata, **assorbita dalla 1.4.4**: il selettore 📍 che chiudeva la maschera sotto, e il campo «A» sui tipi che una destinazione non ce l'hanno |
| **1.4.4** | **Lo schedulatore imparato dall'uso.** Quattro tipi su sette non si chiudevano mai: nasce la distinzione fra attività **a residuo** e **a gesto**. Il Posizionamento esce, la Conta diventa un inventario mirato. HANDOFF §3ter |
| ⚠ **Da chiudere** | `ANDS` è **l'unico Team Leader**. Il PIN del 13/08 è rientrato, ma un solo leader resta un punto singolo di rottura: il PIN non è recuperabile e il rinnovo lo autorizza un leader. **Promuoverne un secondo** — HANDOFF §4bis |
| Sorgente | **30 TypeScript** · 5 JavaScript · **9 CSS** · `index.html` — `01-base.css` modularizzato in 5 file (14/08), `modules/excel.ts` dalla 1.7 |
| Ancora JavaScript | `main.js`, `ui/` (4 file) |
| Servizio | Node + Express + SQLite, porta **4173**. `service_version` **`1.7`** — si muove col contratto, non coi rilasci |
| Database | `C:\Pathfinder\data\pathfinder.db` — fuori da OneDrive |
| Applicativo | dalla 1.7 **`C:\Pathfinder\app\`**, fuori da OneDrive anche lui — §7ter |
| Collezioni | **20** — le 19 più **`recipients`** (1.6). **Non esiste finché il servizio non riparte**: `schema.js` si legge all'avvio |
| Collaudi | **435 client** (~1,8 s) + **65 servizio** + 8 migrazione — verdi |
| Tipi | `npm run check` client + servizio — 0 errori |

## 2. Comandi

```bash
npm run dev      # sviluppo, ricarica a caldo
npm run build    # produce "consegna/" (la azzera e la rifà)
npm run check    # tsc client + servizio, nessun file emesso
npm test         # vitest, 13 suite
```

Collaudo del servizio: `node server/test/collaudo.js` (da `server/`).

**Dalla 1.7 costruire non è consegnare, e consegnare non è servire.** `consegna/`
è `outDir`: la build la azzera a ogni giro, e **non è mai la cartella che il
servizio serve**. Da lì si installa, e da PowerShell **senza amministratore**:

```powershell
.\server\installa-versione.ps1 -Da .\consegna -Versione 1.7
.\server\torna-indietro.ps1
```

`SINGLE_FILE=1 npm run build` riproduce il file unico di prima: è la via
d'uscita se il modello nuovo non convince.

## 3. Mappa

Righe arrotondate. Il ruolo è una riga: il dettaglio sta nel file.

### Client — `src/`

| File | Righe | Ruolo |
|---|---:|---|
| `ui/app.js` | 12.420 | Tutta l'interfaccia: viste, render, gestori. Il pezzo grosso |
| `core/store.ts` | 2.283 | **Le mutazioni**: tutto ciò che scrive e parla con `Persistence` — blocco 6, tipizzato sul posto |
| `core/cache.ts` | 321 | Punto unico di mutazione della cache: 5 forme, 4 indici derivati — blocco 1 |
| `core/statistiche.ts` | 181 | Stato di una cella, conteggi, cruscotto — blocco 5 |
| `core/pacchetto.ts` | 154 | Export: composizione, conteggi, verifica — blocco 4 |
| `core/geometria.ts` | 123 | Le ubicazioni, generate dalla configurazione della zona — blocco 2 |
| `core/giacenza.ts` | 94 | FEFO e ricerca della merce — blocco 3 |
| `styles/01-tokens.css` | 367 | Token globali, colori MD3, elevazioni, forme e transizioni — 14/08 |
| `styles/01-base.css` | 83 | Reset, body, scrollbar, blocco servizio non raggiungibile e boot screen |
| `styles/01-components.css` | 458 | Pulsanti, input, form, badge, switch, card, tabelle, feedback toast e dialoghi |
| `styles/01-layout.css` | 320 | App shell, header, ricerca, navigazione, sidebar, operatore e mobile |
| `styles/01-views.css` | 530 | Mappa, conformità, movimenti, inventario, prelievo, config e report stampa PDF |
| `styles/02..05-*.css` | 705 | Grafici, sezioni e riquadri della dashboard, report di prelievo |
| `ui/views/` | — | **14/08** — Directory per l'estrazione incrementale delle viste da `app.js` |
| `ui/dialog.js` | 367 | Finestre modali (`confirm`, `prompt`, form) |
| `ui/feedback.js` | 181 | Toast, spinner, stato di sincronizzazione |
| `ui/tabs.js` | 59 | Schede |
| `modules/vault.ts` | 303 | Backup su cartella locale (File System Access API) |
| `modules/pickRoute.ts` | 246 | Percorso di prelievo a serpentina |
| `modules/odpParser.ts` | 246 | Lettura degli ODP da Excel |
| `modules/anagrafica.ts` | 158 | I 14 allergeni del Reg. UE 1169/2011, le 3 classi di conservazione e le certificazioni. Lettura stretta, valori convalidati in Excel |
| `modules/conformita.ts` | 155 | Cosa è stoccato dove non dovrebbe: il motore di stoccaggio girato al contrario |
| `modules/compiti.ts` | 445 | **1.4.1 · 1.4.3** — ciclo di vita, coda, misure, e da qui l'urgenza calcolata, la tabella tipo→operazione, il residuo e **l'avanzamento**. Puro: non tocca Store né il DOM |
| `modules/misure.ts` | 317 | **1.4.2** — le cinque unità, la suddivisione per collo, il collo incompleto. Puro come `compiti`: entrano numeri, escono suddivisioni |
| `modules/parametri.ts` | 165 | **1.6** — le tendine che sono un dato. I valori di legge davanti e non rimovibili, gli aggiunti dietro: un codice che ripete un fisso sparisce invece di sostituirlo |
| `modules/destinatari.ts` | 200 | **1.6** — chi è lo stesso destinatario (partita IVA), quale destinazione è nuova, e cosa è cambiato. Puro: entra un DDT, escono chiavi e differenze |
| `modules/excel.ts` | 31 | **1.7** — il punto unico da cui SheetJS si carica, e solo quando serve: 864 KB che non partono più con la pagina. Chi rimette `import * as XLSX` in cima a un file annulla la 1.7 |
| `modules/validate.ts` | 104 | Validazioni di campo |
| `modules/auth.ts` | 88 | PIN operatore, hash e verifica |
| `modules/session.ts` | 69 | Sessione dell'operatore al terminale |
| `modules/pickupAlert.ts` | 43 | Allerta sulle date di ritiro |
| `modules/scanGuard.ts` | 31 | Guardia sulle letture del lettore barcode |
| `core/persistence/index.ts` | 15 | Sceglie l'adapter: servito → remoto, da file → locale |
| `core/persistence/remote.ts` | 267 | Adapter HTTP verso il servizio |
| `core/persistence/local.ts` | 262 | Adapter Dexie/IndexedDB |
| `core/schema.ts` | 173 | Schema IndexedDB e migrazioni |
| `core/utils.ts` | 46 | `debounce`, `_h` (escape HTML) |
| `core/costanti.ts` | 44 | `MOV`, `MOV_LABELS`, ritenzione del registro |
| `types/entita.ts` | 409 | Le entità: item, movimento, operatore, documento, e le cinque della 1.4 |
| `types/contratto.ts` | 146 | L'interfaccia che i due adapter devono rispettare, e la forma dell'idratazione |
| `types/collezioni.ts` | 58 | Le **20** collezioni, chiavi primarie, campi indicizzati. **Sorgente unica**: il `satisfies` blocca la compilazione se adapter o servizio divergono |
| `main.js` | 46 | Avvio: importa gli stili, monta `App`, gancio globale |
| `index.html` | 200 | Scheletro del DOM + i marchi `<svg>` in linea |

### Servizio — `server/`

| File | Righe | Ruolo |
|---|---:|---|
| `pathfinder-server.js` | 378 | Express: rotte, SSE, TLS opzionale, avvio |
| `lib/db.js` | 315 | Accesso SQLite, transazioni, operazioni composte, **`_migra`** |
| `lib/schema.js` | 191 | Tabelle e indici — **due funzioni separate**, con la migrazione in mezzo |
| `installa-servizio.ps1` | — | Registra le due attività pianificate e le variabili di macchina. Da amministratore, **una volta** |
| `installa-versione.ps1` | — | **1.7** — copia una consegna in `C:\Pathfinder\app\` e ci punta la giunzione `corrente`. **Senza amministratore, senza riavvio.** Avvolge anche una vecchia consegna a file singolo |
| `torna-indietro.ps1` | — | **1.7** — scambia `corrente` e `precedente`. Un comando, simmetrico: rilanciandolo si torna avanti |
| `backup-serale.ps1` | — | Backup a caldo, attività pianificata serale |
| `test/collaudo.js` | 520 | 65 prove sul servizio vero |
| `test/collaudo-migrazione-1.4.js` | 158 | 8 prove sul cambio di schema della 1.4. Fuori dalla suite: si lancia da solo |

### Collaudi — `test/`

`serpentina` · `fefo` (19) · `geometria` (21) · `odp` (26) · `anagrafica` (27) ·
`conformita` (19) · `cache` (43) · `pacchetto` (27) · `statistiche` (15) ·
`compiti` (114) · `misure` (65) · `parametri` (19) · `destinatari` (27) —
**435 prove** in tutto. `ambiente.js` è il preambolo comune.

## 4. API del servizio

Tre famiglie, porta 4173. Dettaglio in README §10.

| Famiglia | Rotte |
|---|---|
| **Applicativo** (1.7) | `/` e `/app` → l'indice, **`no-cache`** · `/assets/:file` → gli assets, **`immutable` un anno**, col ripiego su `precedente` |
| Collezioni | `GET/POST/PUT/PATCH/DELETE /api/c/:col[/:key]` · `/bulk` · `/count` · `/query` |
| Operazioni composte | `/api/tx` · `/api/op/removeItem` · `/api/op/commitPickStop` · `/api/op/sampleItem` · `/api/op/verifyPin` · `/api/op/hashPin` |
| Servizio | `/api/health` · `/api/load` · `/api/clear` · `/api/deleteWhere/:col` · `/api/backup` · `/api/events` (SSE) · `/api/app-info` |

L'applicativo è servito su `/` e su `/app`.

## 5. Variabili di macchina

| Variabile | Predefinito |
|---|---|
| `PATHFINDER_PORT` | `4173` |
| `PATHFINDER_DB` | `server/data/pathfinder.db` |
| **`PATHFINDER_APP_DIR`** | **1.7** — la cartella dell'applicativo, cioè la giunzione `C:\Pathfinder\app\corrente`. **Da impostare una volta sola**: dopo, le versioni si scambiano ripuntando la giunzione |
| `PATHFINDER_APP_PREV` | il fratello `precedente` della cartella qui sopra. Si imposta solo per metterlo altrove |
| `PATHFINDER_APP` | il ripiego a file singolo. **Impostata adesso**: `…\MAPPER\pathfinder-1.6.1.html`, dal 17/08. Il ripiego a `pathfinder-1.1.html` nel codice **è stato tolto** |
| `PATHFINDER_TLS_CERT` / `_KEY` | assenti → HTTP |

Si leggono **all'avvio**: cambiate senza riavvio non hanno effetto — ed è
esattamente la ragione per cui dalla 1.7 quella che cambia è la **giunzione**,
non la variabile.

## 6. In coda — 1.4, scadenza 31/12/2026

Cinque funzioni nuove. Piano, disegno dei dati e calendario:
**[HANDOFF/PIANO-1.4.md](HANDOFF/PIANO-1.4.md)**.

Tutte e cinque entrano. Ultima installazione utile: **19/12** — poi c'è l'inventario.

| Versione | Cosa | Entro |
|---|---|---|
| **1.4.0** | **in magazzino il 12/08**, con cinque settimane di margine sul 19/09 | 19/09 ✔ |
| ↳ *fatto 12/08* | Migrazione `ALTER TABLE` nel prodotto · schema mosso **una volta** (19 collezioni) · export/import da `COLLEZIONI` · interruttori `feature.*` spenti · certificazioni e **avvisi merceologici** a prelievo, report e DDT · **`store.js` interamente in TypeScript** in sei blocchi, con 94 prove nuove e i due ponti caduti | — |
| ↳ *fatto 11/08* | Attributi articolo (allergeni Reg. UE 1169/2011 + classe di conservazione), destinazione d'uso della zona, import/export Excel che **aggiorna** invece di saltare, **verifica di stoccaggio sulla mappa**, deroga della cella Riservata | — |
| **1.4.1** | Schedulatore — **costruita e provata il 12/08**. Non installata: è dentro la 1.4.2 | 10/10 ✔ |
| ↳ *fatto 12/08* | `modules/compiti.ts` con **52 prove** · le attività in Store, a interruttore spento non scrivono · **Configurazione → Funzioni**, gli interruttori si alzano col PIN del Team Leader · vista **Attività**, coda e quattro gesti · riquadro in Dashboard · il **campionamento**, che è l'unica delle otto che non esisteva | — |
| **1.4.2** | Unità di misura — **in magazzino il 12/08**, con dieci settimane di margine sul 31/10 | **31/10** ✔ |
| ↳ *fatto 12/08* | `modules/misure.ts` con **65 prove** · l'indice `lotByKey` in cache · la confezione **congelata al primo posizionamento** · `qty_uom` su giacenza e registro · le UM che escono **dentro la stessa transazione** dei colli, con 9 prove nuove sul servizio · la riga «10 × 1.000 + 1 × 100 PZ» a video · il campo per il collo incompleto nel posizionamento | — |
| **1.4.3** | **Lo schedulatore lancia il lavoro** — nata fuori piano, e ha preso il numero della UDC facendola slittare. **In magazzino il 13/08** | ✔ |
| ↳ *fatto 12-13/08* | L'urgenza calcolata e la freccia dell'avvio annullato · la causale `SAMPLE` col campione che cala solo la quantità dentro il collo · la maschera che pesca dalle giacenze in FEFO | — |
| ↳ *fatto 13/08* | **L'avvio apre Movimenta precompilata e il movimento confermato scala il residuo**, su sei maschere · il prelievo si chiude all'evasione del DDT · **il campionamento ha finalmente la sua maschera**, l'ottava attività · il **registro attività** con export a due fogli · versione, build, documenti | — |
| ↳ *fatto 13/08* | **Provata su una copia del database vero** su una porta sua — otto flussi, tre difetti che tsc e 377 collaudi non vedevano · installata coi cinque comandi · la radice riordinata, le versioni vecchie in archivio | — |
| **1.4.3.1** | Nata e assorbita in mezza giornata: il selettore 📍 con overlay e chiusura **propri**, e `vuoleDestinazione` — il campo «A» che si nasconde **e si svuota**. Mai servita da sola, è dentro la 1.4.4 | ✔ |
| **1.4.4** | **LO SCHEDULATORE IMPARATO DALL'USO** — in magazzino il 13/08 pomeriggio. Mezza giornata di uso vero ha detto ciò che nessun collaudo diceva: **quattro tipi su sette non si chiudevano mai** | ✔ |
| ↳ *fatto 13/08* | Le due famiglie in `modules/compiti.ts`: **a residuo** (Trasferimento, Smaltimento) e **a gesto** (le altre cinque) · il prelievo si chiude alla **registrazione del DDT**, non all'evasione · **il Posizionamento esce dai tipi** · **la Conta diventa un inventario mirato** a un articolo e un lotto, con la finestra di guida a tre scansioni · il lotto non viene più maiuscolato, perché è metà di `item_key` · provata sulla 4199, cinque flussi | — |

### Il piano riordinato — le note del 13/08

**Quattordici richieste nate dall'uso passano davanti alla UDC** (D13), e la
numerazione diventa **progressiva**: una build definitiva porta **due numeri**
(D14). Testo per intero in **[PIANO-1.4 §9](HANDOFF/PIANO-1.4.md)**, decisioni
D13-D21 in §8, sintesi in [HANDOFF §3quinquies](HANDOFF/HANDOFF-pathfinder-1.4.md).

| Versione | Cosa |
|---|---|
| **1.5** | ✔ **in magazzino il 13/08 sera, dentro la 1.6** — pulizia post-campionamento, verbale PDF automatico, allergeni con spunta automatica · più Sposta → **Trasferimento** ovunque. Non è mai stata un file suo, come la 1.4.1. HANDOFF §3sexies |
| **1.6** | ✔ **in magazzino il 13/08 sera** — destinatari/destinazioni DDT auto-popolanti, scheda parametri articolo, attributi **sulla zona**. Prima versione a due numeri, D14. HANDOFF §3sexies |
| **1.7** | ✔ **costruita il 17/08, non ancora installata** — **la consegna multi-file**: una versione è una cartella, gli assets portano l'impronta e non scadono, `xlsx` si carica a richiesta, lo scambio è una giunzione. Primo caricamento da 1.610 kB a **251 kB**, ricarica a **300 byte**. [PIANO-CONSEGNA-1.7](HANDOFF/PIANO-CONSEGNA-1.7.md) |
| **1.8** | **UOM riscritta** — colli a contenuto variabile, più colli incompleti al carico, giacenza in colli e UM, prelievo parziale in colli e UM **su tutte le funzioni** |
| **1.9** | **Viste giacenza** — pannello della mappa, pagina Giacenze con conta multipla e PDF |
| **1.10** | **Trasferimenti generati dall'ODP** — la spunta sull'avviso apre l'attività e aggiunge la tappa |
| **1.11** | **UI mobile** — riconoscimento Android, interfaccia dedicata |
| 1.12 | UDC — contenitori, `moveUdc` transazionale, etichette |
| 1.13 | Motore logico di stoccaggio — attributi, regole come dato, motivazioni |
| 1.14 | WIP — installato a interruttore **spento**, si accende a gennaio |

> **I numeri sono scalati di uno dalla 1.8 in giù** — D22, il 17/08: la consegna
> multi-file ha preso il 1.7 perché il refactoring delle viste e la UOM
> lavorino subito sul modello nuovo, invece di migrare due volte. **Le date non
> si muovono.**

> **I numeri sono slittati di uno, le date no.** La 1.4.3 aveva già preso il posto
> della UDC; la 1.4.4 l'ha fatto una seconda volta. Restano tre consegne in tre
> finestre — 21/11, 09/12, 19/12 — e **non c'è slack**: due versioni nate fuori
> piano in due giorni sono il segnale da guardare alla verifica del 31/10, non
> un dettaglio di numerazione.

> **Verifica il 31/10**, fine della 1.4.2. Quattro fatti da guardare, e una scala già
> decisa di cosa togliere se anche uno solo è falso — PIANO-1.4 §6. Serve perché
> 18,5 settimane di lavoro stanno in 18,5 settimane di calendario: **non c'è slack.**

> **Il bloccante è tolto — 12/08.** `CREATE TABLE IF NOT EXISTS` non aggiunge una
> colonna a una tabella che esiste già, e il `CREATE INDEX` dopo moriva nel
> costruttore: il servizio non partiva affatto. Adesso c'è `PathfinderDB._migra`,
> fra le tabelle e gli indici — **che per questo sono due passi e non uno.
> Non rimetterli insieme.**

Collaudo sul codice vero:
`node test/collaudo-migrazione-1.4.js` da `server/` — 8 prove, provano che ubicazione,
articolo, lotto e colli sopravvivono al cambio di schema e che la 1.2 rilegge il
database della 1.4. PIANO-1.4 §5bis.

**Deciso l'11/08:** il WIP resta in calendario · verifica dell'andamento a fine
ottobre · `store.js` in TypeScript entra in Fase 0.

**Deciso il 12/08:** priorità solo al Team Leader · la UDC nasce su comando e muore
vuota · l'etichetta si stampa alla creazione · il prefisso GS1 è un parametro, non
un'attesa · le certificazioni sono il terzo attributo · gli avvisi si vedono a
prelievo, report e DDT · **si tira dritto**, nessun gradino sceso in anticipo · le
etichette si stampano **dal browser**, `100 × 80 mm` su A4. PIANO-1.4 §8, D4-D12.

> **Il primo segnale è passato, e bene.** Era il 19/09: se a quella data la 1.4.0
> non fosse stata in magazzino il ritardo sarebbe stato reale. È entrata il 12/08,
> con cinque settimane di margine, e nessun gradino della scala è stato sceso.
>
> **Il secondo segnale è il 31/10**, fine della 1.4.2 — ed è il giorno della
> verifica dell'andamento. Dei quattro fatti da guardare, il terzo — *«1.4.2
> costruita e verificata, pronta da installare»* — è già vero il 12/08. Il
> secondo — *«gli operatori hanno aperto dei compiti davvero»* — **non lo è, e
> non dipende più dal codice**: dipende da quando qualcuno esegue i cinque
> comandi e alza l'interruttore.

Le domande aperte del piano **sono chiuse tutte.** Restano due cose da fare a mano
in Configurazione — zone e partita IVA — che non bloccano nessun lavoro.

> **La quantità per collo smette di essere solo un dato del DDT.** L'aperto #7 —
> `Peso_Netto_Collo` e `Pezzi_Per_Collo` da compilare in anagrafica — era una
> comodità: da adesso è la riga che decide se un articolo è gestito a UM oppure
> no. Un articolo senza quella cella si comporta come nella 1.2, in tutto, anche
> a interruttore acceso.

## 6bis. Aperti

| # | Cosa | Peso |
|---|---|---|
| **0** | **Un secondo Team Leader.** `ANDS` è l'unico: il 13/08 il PIN si è smarrito e per qualche ora nessuno poteva creare un operatore né rinnovarne uno. Il PIN è rientrato, la causa no. Un minuto in Configurazione → Operatori — HANDOFF §4bis | **prima di tutto** |
| **0bis** | ~~I due comandi della 1.4.3.1~~ — **superato**: la 1.4.3.1 è stata assorbita dalla 1.4.4, installata il 13/08 pomeriggio | ✔ |
| **0ter** | **Le 4 attività rimaste aperte prima della 1.4.4** — `TA-MSRAXA3Q-PQ11` (prelievo), `TA-MSRB4JXK-04C7` (quarantena), `TA-MSRB80C2-2JLC` (campionamento), `TA-MSRBEZLU-5M3E` (conta). Sono i compiti che il difetto ha lasciato `in_progress`: il lavoro è stato fatto, il record no. **Vanno annullati a mano col motivo**, non si chiudono da sé — HANDOFF §3ter | **da fare** |
| 1 | ~~Accendere `feature.tasks`~~ — **fatto il 13/08 alle 10:31:06** | ✔ |
| 1bis | ⚠ **`feature.uom` È GIÀ ACCESO**, dal 13/08 13:54:36, e i documenti non lo sapevano. È la funzione che la nota dice **non funzionare** e che la 1.7 riscrive: fino ad allora gli operatori hanno davanti proprio ciò che va rifatto. **Da decidere: spegnerlo fino alla 1.7, o tenerlo e raccogliere cosa sbaglia** — HANDOFF §3septies | **decisione, subito** |
| 1ter | **Confermare due scelte del 12/08** che il piano non prevedeva: la colonna UM è `unit` — quella che c'è già — e la quantità per collo è `pieces_per_pack`. Vedi HANDOFF §5, decisione 41 | **prima di accendere `uom`** |
| 1quater | ~~Costruire e installare 1.5 e 1.6~~ — **fatto il 13/08 sera**. Il prossimo è la **1.8 — UOM riscritta**, dopo la 1.7 | ✔ |
| **1quinquies** | **DARE LA 1.7 AGLI OPERATORI** — il passo 1 è fatto il 17/08 sera: il meccanismo è in servizio a parità di applicativo. Resta il passo 2, **un comando senza amministratore**: `installa-versione.ps1 -Da .\consegna -Versione 1.7`. E il ritorno indietro si prova **prima**, non dopo — §7ter | **il prossimo gesto** |
| 2 | Caratterizzare le zone e popolare gli attributi in anagrafica — **Andrea, alla configurazione** | esterno |
| 3 | Partita IVA e dati mittente in Configurazione → DDT — **Andrea**. La maschera c'è: è un dato, non codice | esterno |
| 4 | Nome DNS interno e certificato dalla CA — **IT**. Il codice è pronto e non aspetta niente: arriva a lavori finiti | non blocca |
| 5 | **Modularizzazione UI ed estrazione viste a TypeScript** — avviata struttura in `src/ui/views/`, da estrarre a blocchi (destinatari, parametri, compiti, movimenta, giacenze) senza commit monolitici. Vedi HANDOFF §3octies | grande |
| 5bis | ~~Modularizzazione CSS~~ — **completata il 14/08**: `01-base.css` scomposto in 5 file, cascata preservata, `npm test` (435) e `build` verdi | ✔ |
| 6 | `TODO F1-REVIEW` ×3: cache svuotata prima della conferma del supporto (`store.ts`), riallineamento ridondante dopo `resetAll()` (`app.js`) | piccolo |
| 7 | **`pieces_per_pack`** da compilare in anagrafica — colonna `Pezzi_Per_Collo`. Il campo è già cablato e **decide se l'articolo è gestito a UM**: senza, resta a soli colli. `weight_net_kg` **esce** con D15: non è un dato che il magazzino gestisce | import Excel |
| 8 | ~~`service_version` è ancora `'1.1'`~~ — **chiuso il 17/08**: è `'1.7'`, e la regola è che si muove **quando cambia il contratto del servizio**, non a ogni rilascio dell'applicativo. Qui è cambiato davvero — D28 | ✔ |

## 7. Cosa non fare

- **PRIMA DI CANCELLARE UN FILE DALLA RADICE, CHIEDERE AL SERVIZIO QUALE STA SERVENDO.** Un comando solo — `Invoke-RestMethod http://127.0.0.1:4173/api/app-info` — e dice il percorso esatto. Il 13/08 è stato cancellato `pathfinder-1.4.3.1.html` credendolo non servito: **lo era**, installato mezz'ora prima, e la pagina è andata in **404**. Il servizio dati è rimasto vivo e i terminali già aperti hanno continuato a lavorare, ma chi ricaricava non entrava più. Non è andato perso nessun dato; è andata persa **l'unica copia di quella versione**, e con lei la sua via di ritorno.
- **Non toccare `pathfinder-1.6.1.html` in radice**: è il file servito in questo momento. Accanto c'è `pathfinder-1.6.html`, che è la via di ritorno. I più vecchi stanno in `ARCHIVIO/` e **non si cancellano**.
- **E NEANCHE IL SERVIZIO GIRAVA DAL SORGENTE.** Il 17/08 sera si è scoperto che l'attività pianificata eseguiva **`…\MAPPER\Pathfinder 1.6\server\pathfinder-server.js`** — la copia dentro `outDir`, ferma al 12/08 — con il suo `node_modules` installato lì il 14/08 alle 23:22. Quindi un `npm run build` con la configurazione di prima avrebbe azzerato **la cartella che contiene il servizio in esecuzione**: il processo vivo sarebbe sopravvissuto, perché Node legge il file all'avvio, ma al primo riavvio — o al primo riavvio del PC — il servizio non sarebbe più partito. Niente applicativo **e niente API**. Non è successo solo perché quel giorno la prima cosa cambiata è stato il nome di `outDir`. Rimesso a posto rilanciando `installa-servizio.ps1` da `MAPPER\server`.
- **Chi lancia `installa-servizio.ps1` lo lancia DAL SORGENTE**, mai dalla cartella di consegna: lo script registra l'attività sul percorso da cui è stato lanciato, e da quel momento la produzione gira da lì.
- **LA PRODUZIONE NON LEGGE MAI DA `outDir`.** Il 14/08 `PATHFINDER_APP` è stato puntato dentro `Pathfinder 1.6/`, che è la cartella che `npm run build` **azzera**: da quel momento ogni build — anche una di prova — sarebbe andata dritta davanti agli operatori, e una build fallita a metà li avrebbe lasciati in 404. È l'incidente del 13/08 da un'altra porta, e nessuno se n'era accorto per tre giorni. Dalla 1.7 la cartella di build si chiama `consegna/`, senza numero: non somiglia a un artefatto rilasciato, e da lì si **installa**, non si serve.
- **Mai `Remove-Item -Recurse` su una giunzione.** In PowerShell 5.1 — quello di questa macchina — può seguire il collegamento e **svuotare la cartella di destinazione** invece di togliere il rimando. Si usa `[System.IO.Directory]::Delete($p, $false)` oppure `cmd /c rmdir`. Le due funzioni giuste stanno in `installa-versione.ps1`: chi ne scrive una terza le copi da lì.
- **`index.html` resta `no-cache`, gli assets `immutable`.** Invertirli è il difetto peggiore che questo servizio possa avere: i terminali resterebbero su una versione vecchia senza modo di uscirne, e nemmeno riavviare il servizio li tirerebbe fuori. L'indice è quello che NOMINA gli assets, e per questo non si mette in cache; gli assets portano l'impronta nel nome, e per questo non scadono mai.
- **Mai `express.static` sulla cartella-versione intera.** Escono solo `index.html` e `assets/`, e `/assets/:file` accetta **un nome, non un percorso**. Il giorno in cui la variabile punta per sbaglio a un albero di sorgenti, quella riga li pubblicherebbe tutti sulla LAN.
- **Uno script `.ps1` con caratteri non ASCII vuole il BOM.** PowerShell 5.1 senza BOM legge il file come ANSI, e `—` diventa `â€”` — dove `”` è un delimitatore di stringa: lo script non parte con un errore di parentesi che non c'entra niente. Tutti gli `.ps1` di `server/` cominciano con `EF BB BF`, e chi ne aggiunge uno lo controlla.
- **Un manifesto si legge togliendo il BOM.** `Out-File -Encoding utf8` in PowerShell 5.1 lo scrive, e `JSON.parse` su di lui lancia: `/api/app-info` rispondeva versione e impronta **nulle** dopo un ritorno indietro, con tutti i collaudi verdi. L'ha trovato il banco.
- **Installare non è accendere.** Sono gesti in momenti diversi, ed è così che si distingue un rilascio andato male da una funzione che non piace. La 1.4.3 è entrata la notte del 13/08 e `feature.tasks` è stato alzato la mattina dopo, alle 10:31.
- **Chi alza un interruttore aggiorna la riga «Interruttori» qui sopra, nello stesso gesto.** Il 13/08 `feature.tasks` è stato acceso alle 10:31 e per mezza giornata questi documenti hanno continuato a dire «tutti e cinque spenti»: è il primo fatto che una conversazione nuova legge, e decide se un difetto segnalato sia «impossibile» o «normale».
- **Non aprire una finestra sopra un'altra riusando `showModal`**: l'id è fisso e `closeModal` chiude il primo che trova, cioè quello sotto. Overlay con id proprio e chiusura propria — HANDOFF §6, trappola 31.
- **Non fidarsi di un `op_id` scritto in un documento**: si rilegge `/api/c/operators`. Quello di `ANDS` è cambiato il 13/08, e una PATCH su una chiave che non esiste **crea un record** invece di dare errore.
- **Uno spostamento è un `removeItem` seguito da un `addItem`**, e il secondo deriva le UM dai colli pieni: senza passargli quante ne sono uscite, spostare 11 colli da 10.100 pz ne riscrive 11.000. Chi aggiunge un `addItem` che rimette a posto qualcosa passi da `App._umMossa` — HANDOFF §6, trappola 24.
- **Dalla D14 la numerazione è progressiva, e una build definitiva porta DUE numeri** — `pathfinder-1.5.html`, `1.6`, `1.7`. Le build di **prova** ne portano di più (`1.5.1`). Il vecchio vincolo dei tre numeri serviva perché i rilasci della serie 1.4 condividevano i primi due e si sarebbero sovrascritti: con la numerazione progressiva i nomi sono già distinti, e il vincolo cade. In radice stanno il file servito e il precedente installato; i più vecchi scendono in archivio.
- **Non segnalare ritardi del programma di sviluppo** — D21: si prende nota delle date, il giudizio sull'andamento lo dà Andrea.
- **Gli import di un modulo TypeScript si scrivono senza estensione**: `../core/store`, non `../core/store.js`. Due specificatori diversi sono due moduli, e due Store in pagina — HANDOFF §6, trappola 20.
- **Non riunire `createTableSQL` e `createIndexSQL`**: sono due funzioni perché fra i due passi sta `_migra`, e senza di lei il servizio non parte su un database che esiste già.
- **Non installare una 1.4.x parziale**, e **non installarla senza averla aperta in un browser** contro una copia del database vero, su una porta sua. Il 13/08 tre difetti su tre li ha trovati solo quella, con tsc e 377 collaudi verdi.
- **Non accendere due interruttori `feature.*` nello stesso turno**: se qualcosa non torna non si sa quale dei due è stato.
- **Non tenere un solo Team Leader.** Il PIN non è recuperabile per costruzione e il rinnovo lo autorizza un Team Leader: con uno solo, smarrirlo blocca la creazione di ogni operatore. È successo il 13/08 — HANDOFF §4bis.
- **Non scrivere una `PATCH` a mano senza guardare la chiave vera della collezione**: `operators` è a `op_id`, non a `initials`, e una chiave che non esiste **crea un record** invece di dare errore.
- **Non convertire `app.js` in un commit solo** — 10.529 righe insieme non sono verificabili. `store.js` ci è passato in sei blocchi.
- **Non scrivere a mano dentro `consegna/`**: è prodotta, `npm run build` la azzera.
- **Non versionare `server/data/`**: contiene i dati veri e le anagrafiche operatori.
- **Non aggiornare `dexie` e `xlsx`**: versioni fisse, l'applicativo è collaudato con quelle.
- **Percorsi Windows oltre 260 caratteri**: `npm install` è il primo a romperlo. Il servizio si installa in `C:\Pathfinder\servizio`. **`C:\Pathfinder\app\` è un'altra cosa**: è la casa delle versioni dell'applicativo, e ci scrive solo `installa-versione.ps1`.
- I conteggi DOM/CSS di confronto fra versioni sono **misure**, non invarianti: chi rimisura, rimisuri entrambe le versioni.

## 7ter. La 1.7 in servizio — due passi, e l'amministratore una volta sola

La 1.7 è costruita e provata, non installata. Entra in **due tempi**, e sono
tenuti separati apposta: prima cambia **la strada**, poi cambia
**l'applicativo**. Se qualcosa non torna, si sa quale dei due è stato — è la
stessa regola dei due interruttori nello stesso turno.

> **IL PASSO 1 È FATTO — 17/08 sera.** `/api/app-info` risponde
> `service_version: 1.7`, `modo: cartella`, `punta_a: …\pathfinder-1.6.1`,
> impronta `3e98f1c8…` — la stessa di prima. Resta il **passo 2**.
>
> Lungo la strada sono venute fuori due cose, e stanno in §7: l'attività
> pianificata eseguiva il servizio **da dentro `outDir`**, e la verifica finale
> di `installa-servizio.ps1` non conosceva il modo cartella — dava un allarme
> falso a installazione riuscita. Tutt'e due corrette.

**Passo 1 — il meccanismo, a parità di applicativo.** La 1.6.1 che sta girando
adesso viene avvolta in una cartella e servita attraverso la giunzione. Stessi
byte davanti agli operatori, strada nuova sotto.

```powershell
cd "C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER\server"
.\installa-versione.ps1 -Da ..\pathfinder-1.6.1.html -Versione 1.6.1
```

Poi, **da PowerShell come amministratore — l'unica volta che serve**:

```powershell
[Environment]::SetEnvironmentVariable('PATHFINDER_APP_DIR',
  'C:\Pathfinder\app\corrente','Machine')
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
Invoke-RestMethod http://127.0.0.1:4173/api/app-info
```

Deve rispondere `modo: cartella`, `versione: 1.6.1`, impronta
`3e98f1c86cd1b93e…` — la stessa che l'applicativo aveva prima. Se l'impronta è
quella, non è cambiato niente per nessuno.

**Passo 2 — la 1.7.** Solo dopo, e senza amministratore:

```powershell
.\installa-versione.ps1 -Da ..\consegna -Versione 1.7
```

**E il ritorno indietro si prova PRIMA di darla agli operatori**, non dopo:
`.\torna-indietro.ps1`, si ricarica un terminale, si torna avanti. Un ritorno
indietro provato una volta sola è un ritorno indietro che funziona.

## 7bis. Il ritorno indietro, dal 13/08 in poi

> **DALLA 1.7 QUESTA SEZIONE VALE SOLO FINCHÉ IL PASSO 1 DI §7ter NON È
> FATTO.** Con la giunzione, il ritorno indietro non è più «copia un file e
> cambia una variabile di macchina»: è **un comando**, `torna-indietro.ps1`,
> senza amministratore, senza riavviare il servizio e senza toccare niente in
> radice. Le versioni installate stanno in `C:\Pathfinder\app\`, e restano
> tutte: lo scambio è simmetrico, e rilanciando lo stesso comando si torna
> avanti.

**La radice tiene il file servito, più quello appena costruito finché non lo
si serve.** Adesso ce ne sono due: la **1.6.1**, servita, e la **1.6**, che
è la via di ritorno. I più vecchi restano in archivio.

Quindi il ritorno indietro costa **un comando** se il file è già in radice, e
**due** se va ripescato dall'archivio. Da **PowerShell come amministratore**,
sostituendo il numero con la versione a cui si vuole tornare — l'esempio è il
caso caro, dall'archivio:

```powershell
cd "C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER"
Copy-Item "ARCHIVIO\VERSIONI PRECEDENTI\pathfinder-1.4.2.html" pathfinder-1.4.2.html
[Environment]::SetEnvironmentVariable('PATHFINDER_APP',
  'C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER\pathfinder-1.4.2.html','Machine')
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
```

> **Dalla 1.6 il ritorno indietro resta un comando solo**, perché la 1.4.4 è già
> in radice: bastano la variabile e il riavvio, senza ripescare niente.
>
> **E dalla 1.6 il riavvio non è più un dettaglio**: `server/lib/schema.js` si
> legge all'avvio, ed è lì che `recipients` viene creata. Tornare indietro non
> la toglie — una tabella in più che nessuno interroga non fa danno.

> **`Copy-Item`, non `Move-Item`.** L'archivio resta pieno: è la ragione per
> cui esiste. Un ritorno indietro che svuota l'archivio funziona una volta
> sola.

**Il database non si tocca mai**, in nessuna di queste versioni: la 1.2
rilegge il database della 1.4, e lo dimostrano le 8 prove di
`collaudo-migrazione-1.4.js`. Un rilascio si disinstalla rimettendo il file
di prima; i dati restano dove sono.

> **E prima di tornare indietro c'è un gesto più piccolo: spegnere
> l'interruttore della funzione che dà fastidio.** Un rilascio si
> disinstalla, una funzione si spegne — e le due cose si confondono solo se
> si accendono nello stesso turno in cui si installa.

| Versione | Dove sta | `bytes` |
|---|---|---|
| **1.7** — costruita, non installata | `consegna/`, e non si serve da lì | 4 file, impronta nel manifesto |
| **1.6.1** — servita adesso | radice | **1.614.368** |
| **1.6** — il ritorno indietro della 1.6.1 | radice | **1.625.239** |
| 1.4.4 | `ARCHIVIO/BUILD/` | 1.587.378 |
| 1.4.3 | `ARCHIVIO/BUILD/` | 1.578.603 |
| 1.4.3.1 — vissuta mezza giornata, **nessuna copia esiste più** | — | 1.579.414 |
| 1.4.2 | `ARCHIVIO/VERSIONI PRECEDENTI/` | 1.541.133 |
| 1.4.2.1 — in magazzino 25 minuti la notte del 13/08 | `ARCHIVIO/VERSIONI PRECEDENTI/` | 1.578.609 |
| 1.4.0 | `ARCHIVIO/VERSIONI PRECEDENTI/` | 1.493.517 |
| 1.2 | `ARCHIVIO/VERSIONI PRECEDENTI/` | 1.486.348 |

## 8. Dove sta il resto

| Serve | File |
|---|---|
| Installare, aggiornare, diagnosticare, backup | [README.md](README.md) |
| **Dove siamo e da dove si riparte** — l'ultimo | [HANDOFF/HANDOFF-pathfinder-1.4.md](HANDOFF/HANDOFF-pathfinder-1.4.md) |
| **Le cinque funzioni della 1.4** — disegno dei dati, calendario, decisioni | [HANDOFF/PIANO-1.4.md](HANDOFF/PIANO-1.4.md) |
| **La consegna multi-file** — disegno, blocchi, trappole, decisioni D22-D28 | [HANDOFF/PIANO-CONSEGNA-1.7.md](HANDOFF/PIANO-CONSEGNA-1.7.md) |
| Far lavorare degli agenti su questo progetto — ruoli e vincoli | [HANDOFF/PROMPT-workspace-multiagente-1.4.md](HANDOFF/PROMPT-workspace-multiagente-1.4.md) |
| Cronaca delle versioni precedenti, e i piani ormai eseguiti o respinti | [ARCHIVIO/HANDOFF STORICI/](ARCHIVIO/HANDOFF%20STORICI/) — memoria, non istruzioni |
| Versioni precedenti, loghi, etichette | `ARCHIVIO/` |
