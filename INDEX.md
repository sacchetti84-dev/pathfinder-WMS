# INDEX — Pathfinder

**Punto di partenza di ogni conversazione.** Dare questo file più
[HANDOFF 1.4](HANDOFF/HANDOFF-pathfinder-1.4.md), che dice da dove si riparte e
quali trappole sono già state pagate. Il resto si apre quando serve davvero.
Manutenzione: si aggiorna a ogni commit che sposta uno dei numeri o degli aperti.

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
Repo privato: `sacchetti84-dev/pathfinder`, branch `main` · agg. 11/08/2026

---

## 1. Stato

| Voce | Valore |
|---|---|
| In produzione | `pathfinder-1.1.html` — è il file che il servizio serve **adesso** |
| Pronta | `Pathfinder 1.2/pathfinder-1.2.html` — prodotta da `npm run build`, non versionata |
| Sorgente | 17 TypeScript · 6 JavaScript · 5 CSS · `index.html` |
| Ancora JavaScript | `core/store.js`, `main.js`, `ui/` |
| Servizio | Node + Express + SQLite, porta **4173** |
| Database | `C:\Pathfinder\data\pathfinder.db` — fuori da OneDrive |
| Collaudi | **98 client** (~1,2 s) + **29 servizio** + 8 migrazione — verdi |
| Tipi | `npm run check` client + servizio — 0 errori |

## 2. Comandi

```bash
npm run dev      # sviluppo, ricarica a caldo
npm run build    # produce "Pathfinder 1.2/" (la azzera e la rifà)
npm run check    # tsc client + servizio, nessun file emesso
npm test         # vitest, 4 suite
```

Collaudo del servizio: `node server/test/collaudo.js` (da `server/`).

## 3. Mappa

Righe arrotondate. Il ruolo è una riga: il dettaglio sta nel file.

### Client — `src/`

| File | Righe | Ruolo |
|---|---:|---|
| `ui/app.js` | 10.529 | Tutta l'interfaccia: viste, render, gestori. Il pezzo grosso |
| `core/store.js` | 1.974 | Cache in memoria + mutazioni. Ogni scrittura passa di qui |
| `styles/01-base.css` | 2.630 | Base, temi, componenti |
| `styles/02..05-*.css` | 705 | Grafici, sezioni e riquadri della dashboard, report di prelievo |
| `ui/dialog.js` | 367 | Finestre modali (`confirm`, `prompt`, form) |
| `ui/feedback.js` | 181 | Toast, spinner, stato di sincronizzazione |
| `ui/tabs.js` | 59 | Schede |
| `modules/vault.ts` | 308 | Backup su cartella locale (File System Access API) |
| `modules/pickRoute.ts` | 251 | Percorso di prelievo a serpentina |
| `modules/odpParser.ts` | 246 | Lettura degli ODP da Excel |
| `modules/anagrafica.ts` | 118 | I 14 allergeni del Reg. UE 1169/2011 e le 3 classi di conservazione. Lettura stretta, valori convalidati in Excel |
| `modules/conformita.ts` | 155 | Cosa è stoccato dove non dovrebbe: il motore di stoccaggio girato al contrario |
| `modules/validate.ts` | 104 | Validazioni di campo |
| `modules/auth.ts` | 88 | PIN operatore, hash e verifica |
| `modules/session.ts` | 69 | Sessione dell'operatore al terminale |
| `modules/pickupAlert.ts` | 43 | Allerta sulle date di ritiro |
| `modules/scanGuard.ts` | 31 | Guardia sulle letture del lettore barcode |
| `core/persistence/index.ts` | 15 | Sceglie l'adapter: servito → remoto, da file → locale |
| `core/persistence/remote.ts` | 267 | Adapter HTTP verso il servizio |
| `core/persistence/local.ts` | 262 | Adapter Dexie/IndexedDB |
| `core/schema.ts` | 141 | Schema IndexedDB e migrazioni |
| `core/utils.ts` | 46 | `debounce`, `_h` (escape HTML) |
| `core/costanti.ts` | 44 | `MOV`, `MOV_LABELS`, ritenzione del registro |
| `types/entita.ts` | 234 | Le entità: item, movimento, operatore, documento |
| `types/contratto.ts` | 92 | L'interfaccia che i due adapter devono rispettare |
| `types/collezioni.ts` | 41 | Le 14 collezioni, chiavi primarie, campi indicizzati |
| `main.js` | 46 | Avvio: importa gli stili, monta `App`, gancio globale |
| `index.html` | 200 | Scheletro del DOM + i marchi `<svg>` in linea |

### Servizio — `server/`

| File | Righe | Ruolo |
|---|---:|---|
| `pathfinder-server.js` | 378 | Express: rotte, SSE, TLS opzionale, avvio |
| `lib/db.js` | 274 | Accesso SQLite, transazioni, operazioni composte |
| `lib/schema.js` | 139 | Tabelle e indici |
| `installa-servizio.ps1` | — | Registra le due attività pianificate. Da amministratore |
| `backup-serale.ps1` | — | Backup a caldo, attività pianificata serale |
| `test/collaudo.js` | 231 | 29 prove sul servizio vero |
| `test/collaudo-migrazione-1.4.js` | 158 | 8 prove sul cambio di schema della 1.4. Fuori dalla suite: si lancia da solo |

### Collaudi — `test/`

`serpentina` · `fefo` · `geometria` (16) · `odp` (26) · `anagrafica` (22) ·
`conformita` (19) — **98 prove** in tutto. `ambiente.js` è il preambolo comune.

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
| `PATHFINDER_APP` | `pathfinder-1.1.html` nella radice |
| `PATHFINDER_TLS_CERT` / `_KEY` | assenti → HTTP |

Si leggono **all'avvio**: cambiate senza riavvio non hanno effetto.

## 6. In coda — 1.4, scadenza 31/12/2026

Cinque funzioni nuove. Piano, disegno dei dati e calendario:
**[HANDOFF/PIANO-1.4.md](HANDOFF/PIANO-1.4.md)**.

Tutte e cinque entrano. Ultima installazione utile: **19/12** — poi c'è l'inventario.

| Versione | Cosa | Entro |
|---|---|---|
| **1.4.0** | Fondamenta invisibili: migrazione `ALTER TABLE`, schema mosso una volta, **`store.js` in TS**, collaudi su `_applyToCache`, export/import da `COLLEZIONI`, interruttori `feature.*` | 19/09 |
| ↳ *fatto* | Attributi articolo (allergeni Reg. UE 1169/2011 + classe di conservazione), destinazione d'uso della zona, import/export Excel che **aggiorna** invece di saltare, **verifica di stoccaggio sulla mappa**, deroga della cella Riservata | 11/08 |
| **1.4.1** | Schedulatore di attività — richieste, priorità, tempi | 10/10 |
| **1.4.2** | Unità di misura PZ/MT/LT/KG/GR, split colli, collo incompleto | **31/10** |
| **1.4.3** | UDC — contenitori, `moveUdc` transazionale, etichette | 21/11 |
| **1.4.4** | Motore logico di stoccaggio — attributi, regole come dato, motivazioni | 09/12 |
| **1.4.5** | WIP — installato a interruttore **spento**, si accende a gennaio | 19/12 |

> **Verifica il 31/10**, fine della 1.4.2. Quattro fatti da guardare, e una scala già
> decisa di cosa togliere se anche uno solo è falso — PIANO-1.4 §6. Serve perché
> 18,5 settimane di lavoro stanno in 18,5 settimane di calendario: **non c'è slack.**

> **Bloccante, verificato.** Aggiungere un campo indicizzato a una collezione che
> esiste già **non fa partire il servizio**: `CREATE TABLE IF NOT EXISTS` non aggiunge
> la colonna, e il `CREATE INDEX` dopo muore in `PathfinderDB` (`db.js:18`). L'UDC ha
> bisogno di `inventory.udc_id`. Si toglie in 1.4.0, prima di tutto. PIANO-1.4 §1.

Prototipo e collaudo scritti prima del codice:
`node test/collaudo-migrazione-1.4.js` da `server/` — 8 prove, provano che ubicazione,
articolo, lotto e colli sopravvivono al cambio di schema e che la 1.2 rilegge il
database della 1.4. PIANO-1.4 §5bis.

**Deciso l'11/08:** il WIP resta in calendario · verifica dell'andamento a fine
ottobre · `store.js` in TypeScript entra in Fase 0.

Restano cinque domande aperte — PIANO-1.4 §8. Le due da girare **subito** a chi le sa
sono l'elenco degli allergeni da segregare e le classi di temperatura reali: servono
al motore, che è a fine novembre, cioè quando non c'è più tempo per aspettarle.

## 6bis. Aperti

| # | Cosa | Peso |
|---|---|---|
| 1 | **Portare la 1.2 in magazzino** — cinque comandi, HANDOFF 1.3 §6 | atto |
| 2 | Nome DNS interno e certificato dalla CA aziendale — **IT** | esterno |
| 3 | Partita IVA e dati mittente in Configurazione → DDT — **Andrea** | esterno |
| 4 | ~~`core/store.js` a TypeScript~~ — **deciso 11/08: entra in 1.4.0**, non è più un aperto | — |
| 5 | `ui/` a TypeScript, per ultima — `app.js` da solo sono 10.529 righe. Fuori dalla 1.4 | grande |
| 6 | Collaudi su `Store._applyToCache` — 14 collezioni oggi, 18 dopo la 1.4, nessuna prova. **Assorbito in 1.4.0** | medio |
| 7 | `TODO F1-REVIEW` ×3: cache svuotata prima della conferma del supporto (`store.js`), riallineamento ridondante dopo `resetAll()` (`app.js`) | piccolo |
| 8 | Schede grafico che tagliano ~6 px · causali di trasporto da validare · `weight_net_kg` in anagrafica. `pieces_per_pack` **diventa la UM-per-collo in 1.4.2** | vari |
| 9 | `ARCHIVIO/LOGHI/`: `commodore.svg` e `gemini-svg.svg` identici byte per byte, più nomi generati. Quale tenere lo decide chi li ha fatti | banale |
| 10 | `pathfinder-1.1.html` è nel repository **due volte** — radice e `ARCHIVIO/VERSIONI PRECEDENTI/`, 1,2 MB l'una. La copia in archivio si toglie quando la radice passa alla 1.2, non prima | banale |

## 7. Cosa non fare

- **Non toccare `pathfinder-1.1.html` in radice**: è il file servito in questo momento.
- **Non convertire `store.js` e `app.js` nello stesso commit** — 12.500 righe insieme non sono verificabili.
- **Non togliere i ponti verso Store** finché Store è JavaScript: senza, il compilatore deduce `never[]`. Cadono con la 1.4.0, non prima.
- **Non scrivere a mano dentro `Pathfinder 1.2/`**: è prodotta, `npm run build` la azzera.
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
| Come si è arrivati alla 1.2 | [HANDOFF/HANDOFF-pathfinder-1.3.md](HANDOFF/HANDOFF-pathfinder-1.3.md) |
| Metodo di lavoro e trappole | [HANDOFF/HANDOFF-pathfinder-1.2.md](HANDOFF/HANDOFF-pathfinder-1.2.md) |
| Decisioni di fondo, vincolo GDPR | [HANDOFF/HANDOFF-pathfinder-1.0.md](HANDOFF/HANDOFF-pathfinder-1.0.md) |
| Dove si vuole arrivare | [HANDOFF/PIANO-AZIONE-Pathfinder-2.0.md](HANDOFF/PIANO-AZIONE-Pathfinder-2.0.md) |
| Versioni precedenti, loghi, etichette | `ARCHIVIO/` |
