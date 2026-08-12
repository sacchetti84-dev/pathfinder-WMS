# INDEX — Pathfinder

**Punto di partenza di ogni conversazione.** Dare questo file più
[HANDOFF 1.4](HANDOFF/HANDOFF-pathfinder-1.4.md), che dice da dove si riparte e
quali trappole sono già state pagate. Il resto si apre quando serve davvero.
Manutenzione: si aggiorna a ogni commit che sposta uno dei numeri o degli aperti.

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
Repo privato: `sacchetti84-dev/pathfinder`, branch `main` · agg. 12/08/2026

---

## 1. Stato

| Voce | Valore |
|---|---|
| In produzione | `pathfinder-1.4.0.html` — è il file che il servizio serve **adesso**, 1.493.517 byte |
| **1.4.1** | **costruita e provata il 12/08** — `Pathfinder 1.4/pathfinder-1.4.1.html`, 1.526.393 byte. **Non installata**: mancano i cinque comandi |
| Sorgente | **26 TypeScript** · 5 JavaScript · 5 CSS · `index.html` |
| Ancora JavaScript | `main.js`, `ui/` (4 file) |
| Servizio | Node + Express + SQLite, porta **4173** |
| Database | `C:\Pathfinder\data\pathfinder.db` — fuori da OneDrive |
| Collezioni | **19** — le 14 di sempre più `lots` `udc` `tasks` `wip` `storage_rules`. `tasks` si popola a interruttore acceso |
| Collaudi | **260 client** (~1,5 s) + **34 servizio** + 8 migrazione — verdi |
| Tipi | `npm run check` client + servizio — 0 errori |

## 2. Comandi

```bash
npm run dev      # sviluppo, ricarica a caldo
npm run build    # produce "Pathfinder 1.4/" (la azzera e la rifà)
npm run check    # tsc client + servizio, nessun file emesso
npm test         # vitest, 9 suite
```

Collaudo del servizio: `node server/test/collaudo.js` (da `server/`).

## 3. Mappa

Righe arrotondate. Il ruolo è una riga: il dettaglio sta nel file.

### Client — `src/`

| File | Righe | Ruolo |
|---|---:|---|
| `ui/app.js` | 11.510 | Tutta l'interfaccia: viste, render, gestori. Il pezzo grosso |
| `core/store.ts` | 1.918 | **Le mutazioni**: tutto ciò che scrive e parla con `Persistence` — blocco 6, tipizzato sul posto |
| `core/cache.ts` | 271 | Punto unico di mutazione della cache: 5 forme, 3 indici derivati — blocco 1 |
| `core/statistiche.ts` | 181 | Stato di una cella, conteggi, cruscotto — blocco 5 |
| `core/pacchetto.ts` | 154 | Export: composizione, conteggi, verifica — blocco 4 |
| `core/geometria.ts` | 123 | Le ubicazioni, generate dalla configurazione della zona — blocco 2 |
| `core/giacenza.ts` | 94 | FEFO e ricerca della merce — blocco 3 |
| `styles/01-base.css` | 2.630 | Base, temi, componenti |
| `styles/02..05-*.css` | 705 | Grafici, sezioni e riquadri della dashboard, report di prelievo |
| `ui/dialog.js` | 367 | Finestre modali (`confirm`, `prompt`, form) |
| `ui/feedback.js` | 181 | Toast, spinner, stato di sincronizzazione |
| `ui/tabs.js` | 59 | Schede |
| `modules/vault.ts` | 303 | Backup su cartella locale (File System Access API) |
| `modules/pickRoute.ts` | 246 | Percorso di prelievo a serpentina |
| `modules/odpParser.ts` | 246 | Lettura degli ODP da Excel |
| `modules/anagrafica.ts` | 158 | I 14 allergeni del Reg. UE 1169/2011, le 3 classi di conservazione e le certificazioni. Lettura stretta, valori convalidati in Excel |
| `modules/conformita.ts` | 155 | Cosa è stoccato dove non dovrebbe: il motore di stoccaggio girato al contrario |
| `modules/compiti.ts` | 274 | **1.4.1** — ciclo di vita, coda, attesa e durata, riepilogo. Puro: non tocca Store né il DOM |
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
| `types/collezioni.ts` | 51 | Le 19 collezioni, chiavi primarie, campi indicizzati. **Sorgente unica**: il `satisfies` blocca la compilazione se adapter o servizio divergono |
| `main.js` | 46 | Avvio: importa gli stili, monta `App`, gancio globale |
| `index.html` | 200 | Scheletro del DOM + i marchi `<svg>` in linea |

### Servizio — `server/`

| File | Righe | Ruolo |
|---|---:|---|
| `pathfinder-server.js` | 378 | Express: rotte, SSE, TLS opzionale, avvio |
| `lib/db.js` | 315 | Accesso SQLite, transazioni, operazioni composte, **`_migra`** |
| `lib/schema.js` | 191 | Tabelle e indici — **due funzioni separate**, con la migrazione in mezzo |
| `installa-servizio.ps1` | — | Registra le due attività pianificate. Da amministratore |
| `backup-serale.ps1` | — | Backup a caldo, attività pianificata serale |
| `test/collaudo.js` | 267 | 34 prove sul servizio vero |
| `test/collaudo-migrazione-1.4.js` | 158 | 8 prove sul cambio di schema della 1.4. Fuori dalla suite: si lancia da solo |

### Collaudi — `test/`

`serpentina` · `fefo` (19) · `geometria` (21) · `odp` (26) · `anagrafica` (27) ·
`conformita` (19) · `cache` (37) · `pacchetto` (27) · `statistiche` (15) ·
`compiti` (52) — **260 prove** in tutto. `ambiente.js` è il preambolo comune.

## 4. API del servizio

Tre famiglie, porta 4173. Dettaglio in README §10.

| Famiglia | Rotte |
|---|---|
| Collezioni | `GET/POST/PUT/PATCH/DELETE /api/c/:col[/:key]` · `/bulk` · `/count` · `/query` |
| Operazioni composte | `/api/tx` · `/api/op/removeItem` · `/api/op/commitPickStop` · `/api/op/verifyPin` · `/api/op/hashPin` |
| Servizio | `/api/health` · `/api/load` · `/api/clear` · `/api/deleteWhere/:col` · `/api/backup` · `/api/events` (SSE) · `/api/app-info` |

L'applicativo è servito su `/` e su `/app`.

## 5. Variabili di macchina

| Variabile | Predefinito |
|---|---|
| `PATHFINDER_PORT` | `4173` |
| `PATHFINDER_DB` | `server/data/pathfinder.db` |
| `PATHFINDER_APP` | **impostata**: `…\MAPPER\pathfinder-1.4.0.html`. Il ripiego nel codice resta `pathfinder-1.1.html`, che in radice non c'è più |
| `PATHFINDER_TLS_CERT` / `_KEY` | assenti → HTTP |

Si leggono **all'avvio**: cambiate senza riavvio non hanno effetto.

## 6. In coda — 1.4, scadenza 31/12/2026

Cinque funzioni nuove. Piano, disegno dei dati e calendario:
**[HANDOFF/PIANO-1.4.md](HANDOFF/PIANO-1.4.md)**.

Tutte e cinque entrano. Ultima installazione utile: **19/12** — poi c'è l'inventario.

| Versione | Cosa | Entro |
|---|---|---|
| **1.4.0** | **in magazzino il 12/08**, con cinque settimane di margine sul 19/09 | 19/09 ✔ |
| ↳ *fatto 12/08* | Migrazione `ALTER TABLE` nel prodotto · schema mosso **una volta** (19 collezioni) · export/import da `COLLEZIONI` · interruttori `feature.*` spenti · certificazioni e **avvisi merceologici** a prelievo, report e DDT · **`store.js` interamente in TypeScript** in sei blocchi, con 94 prove nuove e i due ponti caduti | — |
| ↳ *fatto 11/08* | Attributi articolo (allergeni Reg. UE 1169/2011 + classe di conservazione), destinazione d'uso della zona, import/export Excel che **aggiorna** invece di saltare, **verifica di stoccaggio sulla mappa**, deroga della cella Riservata | — |
| **1.4.1** | Schedulatore — **costruita e provata il 12/08**, resta da installare | 10/10 |
| ↳ *fatto 12/08* | `modules/compiti.ts` con **52 prove** · le attività in Store, a interruttore spento non scrivono · **Configurazione → Funzioni**, gli interruttori si alzano col PIN del Team Leader · vista **Attività**, coda e quattro gesti · riquadro in Dashboard · il **campionamento**, che è l'unica delle otto che non esisteva | — |
| **1.4.2** | Unità di misura PZ/MT/LT/KG/GR, split colli, collo incompleto | **31/10** |
| **1.4.3** | UDC — contenitori, `moveUdc` transazionale, etichette | 21/11 |
| **1.4.4** | Motore logico di stoccaggio — attributi, regole come dato, motivazioni | 09/12 |
| **1.4.5** | WIP — installato a interruttore **spento**, si accende a gennaio | 19/12 |

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
> **Il prossimo segnale è il 31/10**, fine della 1.4.2.

Le domande aperte del piano **sono chiuse tutte.** Restano due cose da fare a mano
in Configurazione — zone e partita IVA — che non bloccano nessun lavoro.

## 6bis. Aperti

| # | Cosa | Peso |
|---|---|---|
| 1 | **Installare la 1.4.1** — i cinque comandi dell'HANDOFF §4, a fine turno. Poi **accendere `feature.tasks`** da Configurazione → Funzioni, a inizio turno e da solo | **il prossimo** |
| 1bis | La 1.4.2 — unità di misura, split colli, collo incompleto, entro il **31/10**. È anche la verifica dell'andamento | dopo l'installazione |
| 2 | Caratterizzare le zone e popolare gli attributi in anagrafica — **Andrea, alla configurazione** | esterno |
| 3 | Partita IVA e dati mittente in Configurazione → DDT — **Andrea**. La maschera c'è: è un dato, non codice | esterno |
| 4 | Nome DNS interno e certificato dalla CA — **IT**. Il codice è pronto e non aspetta niente: arriva a lavori finiti | non blocca |
| 5 | `ui/` a TypeScript, per ultima — `app.js` da solo sono 10.529 righe. Fuori dalla 1.4 | grande |
| 6 | `TODO F1-REVIEW` ×3: cache svuotata prima della conferma del supporto (`store.ts`), riallineamento ridondante dopo `resetAll()` (`app.js`) | piccolo |
| 7 | `weight_net_kg` da **compilare** in anagrafica — colonna `Peso_Netto_Collo`. Il campo è già cablato: maschere, import, export, peso del DDT | import Excel |
| 8 | `service_version` in `pathfinder-server.js` è ancora `'1.1'`, ma il servizio è cambiato: `_migra` e 19 collezioni. Da decidere se allinearla | piccolo |

## 7. Cosa non fare

- **Non toccare `pathfinder-1.4.0.html` in radice**: è il file servito in questo momento, e dal giorno che si installa la 1.4.1 diventa il ritorno indietro. `pathfinder-1.2.html` gli sta accanto: non si sposta.
- **Installare la 1.4.1 non è accenderla.** Il file in magazzino non cambia niente a video finché `feature.tasks` resta spento: sono due gesti in due momenti diversi, ed è così che si distingue un rilascio andato male da una funzione che non piace.
- **Il nome del file porta tre numeri**, `pathfinder-1.4.N.html`: la serie 1.4 sono sei rilasci distinti e ognuno resta in radice per fare da ritorno indietro al successivo.
- **Gli import di un modulo TypeScript si scrivono senza estensione**: `../core/store`, non `../core/store.js`. Due specificatori diversi sono due moduli, e due Store in pagina — HANDOFF §6, trappola 20.
- **Non riunire `createTableSQL` e `createIndexSQL`**: sono due funzioni perché fra i due passi sta `_migra`, e senza di lei il servizio non parte su un database che esiste già.
- **Non installare una 1.4.x parziale**: si installa quando la versione è chiusa per intero.
- **Non convertire `app.js` in un commit solo** — 10.529 righe insieme non sono verificabili. `store.js` ci è passato in sei blocchi.
- **Non scrivere a mano dentro `Pathfinder 1.4/`**: è prodotta, `npm run build` la azzera.
- **Non versionare `server/data/`**: contiene i dati veri e le anagrafiche operatori.
- **Non aggiornare `dexie` e `xlsx`**: versioni fisse, l'applicativo è collaudato con quelle.
- **Percorsi Windows oltre 260 caratteri**: `npm install` è il primo a romperlo. Installare in `C:\Pathfinder\app`.
- I conteggi DOM/CSS di confronto fra versioni sono **misure**, non invarianti: chi rimisura, rimisuri entrambe le versioni.

## 8. Dove sta il resto

| Serve | File |
|---|---|
| Installare, aggiornare, diagnosticare, backup | [README.md](README.md) |
| **Dove siamo e da dove si riparte** — l'ultimo | [HANDOFF/HANDOFF-pathfinder-1.4.md](HANDOFF/HANDOFF-pathfinder-1.4.md) |
| **Le cinque funzioni della 1.4** — disegno dei dati, calendario, decisioni | [HANDOFF/PIANO-1.4.md](HANDOFF/PIANO-1.4.md) |
| Far lavorare degli agenti su questo progetto — ruoli e vincoli | [HANDOFF/PROMPT-workspace-multiagente-1.4.md](HANDOFF/PROMPT-workspace-multiagente-1.4.md) |
| Cronaca delle versioni precedenti, e i piani ormai eseguiti o respinti | [ARCHIVIO/HANDOFF STORICI/](ARCHIVIO/HANDOFF%20STORICI/) — memoria, non istruzioni |
| Versioni precedenti, loghi, etichette | `ARCHIVIO/` |
