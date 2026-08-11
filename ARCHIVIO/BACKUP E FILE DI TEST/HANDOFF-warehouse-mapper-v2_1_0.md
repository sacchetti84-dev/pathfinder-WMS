# HANDOFF — Warehouse Mapper

**Documento di passaggio di consegne per la prossima conversazione**
Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 04/08/2026 · Rev. 01

---

## 1. Stato attuale

| Voce | Valore |
|---|---|
| Versione corrente | **v2.1.0** |
| File | `warehouse-mapper-v2_1_0.html` (~567 KB, ~10.250 righe) |
| Versione precedente | v2.0.2 (base di partenza, fornita come upload) |
| Schema IndexedDB | **v3 — invariato** rispetto alla v2.0.2 |
| Stato collaudo | **Sintassi validata con Node. NON ancora eseguita in browser reale.** |
| Dipendenze CDN | Dexie 3.2.4 · SheetJS 0.18.5 (cdnjs) |

> **Da fare per prima cosa nella prossima chat:** chiedere l'esito del collaudo (vedi §5). Se emergono errori, servono i messaggi della console (F12).

---

## 2. Cosa contiene la v2.1.0

Richiesta originaria: migliorare leggibilità di didascalie e icone delle aree operative, introdurre tutte le migliorie di sicurezza e riduzione errori involontari, integrare feedback visivo e audio con popup al **centro schermo** (non in angolo), ridurre flash e re-render, sfruttare l'ampiezza dello schermo. Riferimento UI: **Material Design 3** (m3.material.io).

### A — Sicurezza / errori involontari
- **A1** Nuovo modulo `Dialog`: sostituisce `confirm()`/`prompt()` nativi in **tutti** i flussi operativi. Risolve il difetto principale della v2.0.2 (il ritorno a capo del lettore barcode confermava i dialoghi nativi, permettendo di **superare l'avviso NON-FEFO senza leggerlo**). Cinque contromisure: guardia 900 ms, `requireClick` sulle conferme critiche, fail-safe con fuoco su *Annulla*, Esc annulla, campo quantità che scarta i non-numerici.
- **A2** Nuovo modulo `ScanGuard`: doppia scansione identica entro 3 s → conferma esplicita.
- **A3** Annulla ultima operazione, finestra 120 s, tasto F9. Attivo su Posizionamento, Smaltimento, Prelievo Produzione (batch). Storno = movimento inverso + log FIX+/FIX- con causale `STORNO — <operazione>`. Nessuna cancellazione.
- **A4** Focus keeper: i caratteri del lettore vengono dirottati sul campo di scansione primario se nessun campo ha il fuoco.
- **A5** Scorciatoie: F2 Posiziona · F3 Prelievo · F4 Inventario · F6 Smaltire · F7 Quarantena · F8 Resi · F9 Annulla · Esc chiude.

### B — Feedback
- Nuovo modulo `Feedback`: popup **centrale**, non impilato, non intercetta il puntatore.
- Durate per esito: positivo 1.500 ms · info 2.400 · avviso 4.500 · errore 6.500 (prima: 3.000 uniformi).
- Suono sintetizzato WebAudio (nessun file esterno, offline): OK 1046→1568 Hz · avviso doppio 740 Hz · errore 233→175 Hz.
- Vibrazione + lampo perimetrale. Tutto disattivabile in **Configurazione → Riscontro Operativo** con pulsante di prova e cursore volume. `prefers-reduced-motion` rispettato.
- **La firma `toast(message, type)` è invariata**: nessuna delle chiamate esistenti è stata modificata, il reindirizzamento avviene dentro `App.toast()`.

### C — Ridisegni
- Carrelli di Prelievo, Resi e Spedizioni in sezioni autonome `#prodCartZone`, `#resCartZone`, `#shipCartZone`, aggiornate senza rifare il modulo. Con ripiego automatico al ridisegno completo se la sezione non esiste.

### D — Leggibilità (principi MD3, palette aziendale invariata)
- Layer CSS di **sola sovrascrittura** in coda al foglio di stile, inserito **prima** del blocco `@media print`, che resta integralmente invariato.
- Icone schede 1,5→2,3rem · titoli 1,02rem · badge 0,62→0,78rem (classe `.mov-badge`) · etichette campi 0,70rem maiuscolo → 0,82rem tondo · campi di scansione 0,82→1,15rem.
- Target tattili 40/48px; pulsanti +/− del contatore colli 56px.
- Da 1280px: Movimenta a due colonne (modulo a sinistra, registro sessione in colonna destra fissa), larghezza max 900→1680px. Sotto 1280px layout invariato.

---

## 3. Decisioni prese, da non rimettere in discussione

1. **Perimetro `confirm()` nativi.** Restano nativi **solo** i dialoghi distruttivi di Configurazione: elimina sito, elimina zona, elimina articolo, purge log, reset database, import. Motivo: non raggiungibili durante una sequenza di scansioni; convertirli allargava il rischio di regressione senza beneficio di sicurezza. **Scelta deliberata, documentata nel changelog del file.**
2. **Nessuna modifica al livello `Store`.** Guardie sulle quantità, `getAvailableQty`, rollback transazionale della v2.0.1 restano intatti.
3. **Nessuna unificazione del codice duplicato Resi/Spedizioni.** Segnalata come osservazione, non toccata (regola: mai rifattorizzare senza richiesta esplicita).
4. **MD3 = principi, non tema.** Adottati scala di forma, elevazione a livelli, state layer, scala tipografica, target 48dp. Palette aziendale mantenuta. Nessun asset, font o marchio Google. Limite dichiarato nel file.
5. **Conformità.** GDPR: le uniche preferenze nuove sono tre booleani + volume in localStorage, nessun dato personale, nessuna telemetria; tutti i testi di riscontri e dialoghi passano da `textContent`. AI Act: non pertinente, l'app non incorpora sistemi di IA e non genera né manipola contenuti ai sensi dell'art. 50 — nessun obbligo di marcatura.

---

## 4. Metodo di lavoro usato (da riprendere)

Il file è troppo grande per riscritture integrali. Si è lavorato con **patch chirurgiche**: script Python con lista di sostituzioni su stringhe esatte, ognuna verificata con `count() == 1` e interruzione dell'intero script se un'ancora non è univoca. Al termine, estrazione del blocco `<script>` e validazione con `node --check`.

Questo approccio va mantenuto: garantisce che nulla venga toccato per errore e rende ogni modifica verificabile.

---

## 5. Collaudo da eseguire (in sospeso)

1. Boot: deve indicare v2.1.0; verificare che i dati preesistenti ci siano tutti.
2. Configurazione → Riscontro Operativo → **Prova**: tre suoni e tre messaggi centrali.
3. Posiziona: stessa riga due volte di fila → guardia anti-doppia-scansione; l'Invio del lettore **non** deve confermarla.
4. Prelievo Produzione: lotto non-FEFO → avviso insuperabile con Invio.
5. Dopo un posizionamento premere **F9** → storno visibile nel registro come FIX− con causale.
6. Verifica su schermo ≥1280px del layout a due colonne, e su tablet del layout a colonna singola.
7. Verifica stampa di un report (il blocco `@media print` non doveva cambiare).

---

## 6. Backlog v2.2.0 — proposto, in attesa di scelta

| # | Intervento | Dipendenze |
|---|---|---|
| 1 | **Picking guidato da ODP**: import righe da SAGE X3, confronto richiesto/prelevato, riga corrente, verifica scan vs atteso, progressione, gestione riga non evasa/parziale | Serve un **estratto reale dell'ODP da SAGE X3**, anche anonimizzato, per definire colonne e formato |
| 2 | **Percorso di picking ottimizzato** (sito → zona → corsia → scaffale) | Dipende dal n. 1 |
| 3 | **Suggerimento ubicazione in ingresso** (articolo già presente → zona per categoria → prima libera, con motivazione e possibilità di ignorare) | Nessuna — **fattibile subito** |
| 4 | **Proposta lotto FEFO all'apertura della riga**, invece dell'avviso a posteriori | Nessuna — **fattibile subito** |
| 5 | **Campo unico "Scansiona"** con classificazione automatica per pattern (ubicazione / articolo da anagrafica / lotto) | Nessuna |
| 6 | **GS1-128**: articolo + lotto + scadenza + quantità in una scansione (AI 01/10/17/37) | **Da verificare prima sul campo** se le etichette fornitore e interne contengono davvero gli AI. Se no, è un progetto etichettatura, non una modifica all'app |

**Raccomandazione:** partire da **3 + 4**, i più rapidi e senza dipendenze esterne.

**Alternativa richiesta e non ancora prodotta:** documento di analisi dei flussi in formato Word (rev. 01) da allegare alla documentazione WMS (`MAN-MAG-002`, `FLW-MAG-002`).

---

## 7. Vincoli permanenti sul progetto

- Singolo file `.html`, nessun build step, funziona offline aprendo il file.
- Header di copyright completo firmato **Andrea Sacchetti** + watermark distribuiti nel codice (attualmente 37 firme nel file).
- ES6+ obbligatorio: `const`/`let`, arrow function, `async`/`await`, destrutturazione, template literal, optional chaining. Mai `var`.
- HTML semantico; `textContent` per gli input utente, mai `innerHTML`; nessun token o dato personale in localStorage; validazione degli input.
- **Mai rifattorizzare codice esistente senza richiesta esplicita.** Risolvere solo il problema chiesto.
- In fase di brainstorming: sempre elenco numerato di opzioni selezionabili per numero.
- Se una soluzione è incerta, dichiararlo apertamente invece di tirare a indovinare.

---

*© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) — Uso interno*
