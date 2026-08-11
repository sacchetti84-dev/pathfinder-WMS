# HANDOFF — Warehouse Mapper

**Documento di passaggio di consegne per la prossima conversazione**
Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 04/08/2026 · Rev. 02

---

## 1. Stato attuale

| Voce | Valore |
|---|---|
| Versione corrente | **v2.2.0** |
| File | `warehouse-mapper-v2_2_0.html` (~620 KB, ~10.900 righe) |
| Versione precedente | v2.1.0 (`warehouse-mapper-v2_1_0_hoff.html`) |
| Schema IndexedDB | **v3 — invariato** dalla v2.0.2 |
| Blocco `<script>` | **invariato**, salvo una riga di watermark versione |
| Stato collaudo | **Validato staticamente. NON ancora eseguito in browser reale.** |
| Dipendenze CDN | Dexie 3.2.4 · SheetJS 0.18.5 (cdnjs) — invariate |

> **Nota importante:** il collaudo della v2.1.0 (§5 della Rev. 01) non è mai stato riportato. La v2.2.0 è costruita sopra una base mai avviata in browser: se emerge un errore, va prima stabilito se viene dalla v2.1.0 o dalla conversione MD3.

---

## 2. Cosa contiene la v2.2.0

Richiesta: convertire **tutta** l'interfaccia a Material Design 3. Questo supera la decisione §3.4 della Rev. 01 («MD3 = principi, non tema»), che va considerata revocata.

L'intervento è **interamente sul foglio di stile**. Nessuna logica applicativa toccata: `Store`, `Dialog`, `Feedback`, `ScanGuard`, guardie sulle quantità, rollback transazionale sono intatti.

### E1 — Schema colore generato, non scelto a mano
Generato con l'algoritmo ufficiale Google `material-color-utilities` (port Python `materialyoucolor` 3.0.4), variante **TONAL_SPOT**, **spec 2021**, contrasto standard, tema chiaro.

- **Seed: `#00745A`** — l'accento aziendale già presente in v2.0.2. L'identità cromatica è conservata; cambia il *modo* in cui l'interfaccia deriva da quel colore.
- 30 ruoli `--md-sys-color-*` più 6 colori estesi `--md-ext-*` (chrome petrolio, positivo, avviso, quarantena, resi, spedizioni) **armonizzati** sul seed con `Blend.harmonize` e campionati ai toni MD3 dei custom color (40/100/90/10), chroma limitata a 32 per le griglie dense.
- Spec 2021 e non 2025 "expressive": la 2025 non è implementata da `@material/web` e produce `on-surface` più chiaro (#2B3530 vs #171D1A), quindi meno contrasto sui tablet.

### E2 — Il punto di leva
Le variabili storiche `--sx-*` sono **ridefinite in coda a `:root`** sui ruoli MD3. Poiché le proprietà personalizzate si risolvono al momento dell'uso, l'ultima dichiarazione vince: l'intera app passa a MD3 senza rimuovere una sola regola preesistente e senza toccare il markup. **Cancellando quel solo blocco si torna alla palette v2.1.0.**

### E3 — Componenti convertiti
Layer di sola sovrascrittura in coda al CSS, **prima** di `@media print`. Pulsanti (pillola, 40px, Label Large), campi di testo (filled, `surface-container-highest`, indicatore 1→2px via `box-shadow inset` così il testo non si sposta durante una scansione), badge/chip (contenitore tonale, pillola), interruttori (52×32, cursore 16→24px), schede (outlined 12px), dialoghi (28px, elevazione 3, velo 32%), tab (48px, indicatore 3px), navigazione laterale (voci a pillola, attiva su `secondary-container`), riscontri, snackbar a superficie invertita, griglie dati.

### E4 — State layer e fuoco
Velatura `::after` in `currentColor`, opacità prese dal sorgente token Google (`tokens/versions/v0_192/_md-sys-state.scss`): hover 0.08, fuoco **0.12**, pressione 0.12, trascinamento 0.16. **Corretto** il 0.10 non conforme della v2.1.0. Anello di fuoco 3px in `secondary`, scostamento 2px.

---

## 3. Decisioni prese, da non rimettere in discussione

1. **Nessun font Google.** L'app resta un file unico offline: `--md-ref-typeface-*` mappati sulla pila di sistema. È una personalizzazione di typeface prevista dalla specifica. Nessun asset, icona o marchio Google nel file.
2. **Barra applicativa su tinta piena** (petrolio armonizzato, `--md-ext-chrome-dim`) invece della superficie chiara predefinita MD3. Tematizzazione ammessa; mantiene valide tutte le regole di contenuto bianco già presenti, evitando un'ampia superficie di regressione.
3. **Tema scuro non incluso.** Lo schema è generabile con lo stesso script cambiando `is_dark=True`, ma non era richiesto e raddoppia il collaudo.
4. **`@media print` integralmente invariato** — verificato per confronto byte a byte.
5. **Nessuna rifattorizzazione.** Il codice duplicato Resi/Spedizioni resta come segnalato nella Rev. 01.
6. **`confirm()` nativi di Configurazione** restano nativi, come da Rev. 01 §3.1.
7. **Conformità.** GDPR: intervento di sola presentazione, nessun dato personale, nessuna preferenza nuova, nessuna telemetria, nessuna richiesta di rete aggiunta. AI Act: non pertinente, l'app non incorpora sistemi di IA e non genera né manipola contenuti ai sensi dell'art. 50.

---

## 4. Metodo di lavoro (da riprendere)

Patch chirurgiche: script Python con sostituzioni su stringhe esatte, ognuna verificata con `count() == 1` e interruzione dell'intero script se un'ancora non è univoca. Dieci patch applicate, tutte a ancora unica.

**Verifiche eseguite:**

| Controllo | Esito |
|---|---|
| `@media print` identico all'originale | OK |
| Blocco `<script>` identico (salvo watermark versione) | OK |
| `node --check` sullo `<script>` | OK |
| Parsing CSS completo con `tinycss2` (601 regole) | 0 errori |
| Bilanciamento graffe CSS | 689 / 689 |
| Token `--md-*` usati ma non definiti | nessuno |
| Firme «Andrea Sacchetti» | 37 → 41 |
| Contrasto WCAG 2.1 su 21 coppie critiche | tutte sopra soglia (min 6,4:1 sui pulsanti pieni) |

---

## 5. Collaudo da eseguire (in sospeso)

Include il collaudo v2.1.0 mai riportato.

1. Boot: deve indicare v2.2.0; verificare che i dati preesistenti ci siano tutti.
2. Configurazione → Riscontro Operativo → **Prova**: tre suoni e tre messaggi centrali (ora con veste MD3).
3. Posiziona: stessa riga due volte di fila → guardia anti-doppia-scansione; l'Invio del lettore **non** deve confermarla.
4. Prelievo Produzione: lotto non-FEFO → avviso insuperabile con Invio.
5. Dopo un posizionamento premere **F9** → storno visibile nel registro come FIX− con causale.
6. **Campi di scansione**: verificare che al fuoco il testo NON si sposti di un pixel (è il motivo per cui l'indicatore è `box-shadow` e non `border`).
7. **Dialogo quantità** (`.dlg-qty`): il campo grande deve restare leggibile e i pulsanti +/− da 56px.
8. Layout a due colonne ≥1280px e colonna singola su tablet.
9. **Stampa di un report** — `@media print` non doveva cambiare.
10. Verificare la leggibilità della barra applicativa e delle voci a pillola nella navigazione laterale sotto la luce del reparto.

---

## 6. Backlog v2.3.0 — proposto, in attesa di scelta

| # | Intervento | Dipendenze |
|---|---|---|
| 1 | **Tema scuro MD3** — schema già generabile, serve solo il set `is_dark=True` e un interruttore in Configurazione | Nessuna — fattibile subito |
| 2 | **Suggerimento ubicazione in ingresso** (articolo già presente → zona per categoria → prima libera) | Nessuna — fattibile subito |
| 3 | **Proposta lotto FEFO all'apertura della riga**, invece dell'avviso a posteriori | Nessuna — fattibile subito |
| 4 | **Picking guidato da ODP**: import righe da SAGE X3, confronto richiesto/prelevato, verifica scan vs atteso | Serve un **estratto reale dell'ODP da SAGE X3**, anche anonimizzato |
| 5 | **Percorso di picking ottimizzato** (sito → zona → corsia → scaffale) | Dipende dal n. 4 |
| 6 | **Campo unico "Scansiona"** con classificazione automatica per pattern | Nessuna |
| 7 | **GS1-128**: articolo + lotto + scadenza + quantità in una scansione (AI 01/10/17/37) | **Da verificare prima sul campo** se le etichette contengono davvero gli AI |

**Raccomandazione:** 1 + 2 + 3, i più rapidi e senza dipendenze esterne.

**Alternativa richiesta e non ancora prodotta:** documento di analisi dei flussi in formato Word (rev. 01) da allegare alla documentazione WMS (`MAN-MAG-002`, `FLW-MAG-002`).

---

## 7. Vincoli permanenti sul progetto

- Singolo file `.html`, nessun build step, funziona offline aprendo il file.
- Header di copyright completo firmato **Andrea Sacchetti** + watermark distribuiti (41 firme nel file).
- ES6+ obbligatorio: `const`/`let`, arrow function, `async`/`await`, destrutturazione, template literal, optional chaining. Mai `var`.
- HTML semantico; `textContent` per gli input utente, mai `innerHTML`; nessun token o dato personale in localStorage; validazione degli input.
- **Mai rifattorizzare codice esistente senza richiesta esplicita.** Risolvere solo il problema chiesto.
- In fase di brainstorming: sempre elenco numerato di opzioni selezionabili per numero.
- Se una soluzione è incerta, dichiararlo apertamente invece di tirare a indovinare.
- Nessuna dipendenza CSS recente non necessaria: `color-mix()` è stata deliberatamente evitata a favore di `rgba()` esplicito, per non dipendere da browser aggiornati sui tablet di reparto.

---

## 8. Fonti consultate (04/08/2026)

- `material-web.dev/theming/color` — convenzione `--md-sys-color-<ruolo>` e regola dell'accoppiamento `on-<ruolo>`
- `github.com/material-components/material-web`, `tokens/versions/v0_192/` — `_md-sys-typescale.scss`, `_md-sys-shape.scss`, `_md-sys-state.scss`
- `m3.material.io/blog/tone-based-surface-color-m3` — superfici a elevazione +4/+5 deprecate a favore dei ruoli `surface-container`
- `m3.material.io` non è consultabile via fetch: il sito richiede JavaScript e non restituisce contenuto. I valori sono stati presi dalle fonti Google sopra, non ricostruiti a memoria.

---

*© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) — Uso interno*
