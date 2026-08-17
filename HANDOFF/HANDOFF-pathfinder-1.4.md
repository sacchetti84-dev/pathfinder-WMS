# HANDOFF — Pathfinder 1.4

**L'unico passaggio di consegne in vigore.** Assorbe e sostituisce gli HANDOFF
1.0, 1.2 e 1.3: gli aperti che si trascinavano sono nella §4, le decisioni
permanenti nella §5, le trappole nella §6, le convenzioni nella §7. I documenti
vecchi restano leggibili in `ARCHIVIO/HANDOFF STORICI/` — vedi §10.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: **17/08/2026 · Rev. 20 — LA CONSEGNA DIVENTA UNA CARTELLA (1.7)**, costruita
e provata al banco, **non ancora installata**. Una versione è una cartella con
gli assets a impronta; `xlsx` si carica a richiesta; lo scambio e il ritorno
indietro sono il ripuntamento di una giunzione, **senza amministratore e senza
riavvio**. Primo caricamento da 1.610 a **251 kB**, ricarica a **300 byte**.
Trovato e chiuso un difetto che i collaudi non vedevano — §3novies, e il
disegno per intero in **[PIANO-CONSEGNA-1.7](PIANO-CONSEGNA-1.7.md)**

Rev. 19 — **MODULARIZZAZIONE CSS & ARCHITETTURA VISTE UI**, il 14/08:
`01-base.css` (2.731 righe) scomposto in 5 file puliti preservando la cascata esatta;
avviata la cartella `src/ui/views/` con le istruzioni e la roadmap per l'estrazione
progressiva a blocchi di `app.js` verso TypeScript; verificati tutti i collaudi e
ripristinato il database attivo dai backup serali — §3octies

Rev. 18 — **LA 1.6 È IN MAGAZZINO**, dalla sera del 13/08:
campionamento GMP, Sposta → Trasferimento, parametri articolo e anagrafica
destinatari. Prima versione a due numeri (D14), prima che aggiunge una
collezione a servizio acceso. La 1.5 è dentro e non è mai stata un file —
§3sexies

Rev. 16 — **le quattordici note di Andrea entrano nel piano**
e lo riordinano: PIANO-1.4 §9, decisioni D13-D21, e da qui la numerazione è
progressiva. Il prossimo atto è la **1.5**, non la UDC — §3quinquies

Rev. 15 — **la 1.4.4 è in magazzino** dal pomeriggio del
13/08, e `feature.tasks` è acceso dalle 10:31. In una sola giornata lo
schedulatore è passato dall'essere acceso all'aver mostrato **quattro tipi su
sette che non si chiudevano mai**: la 1.4.4 è la versione che l'uso ha
scritto, non il piano

---

## 0. Come si riprende, in tre righe

Dare **[INDEX.md](../INDEX.md)** e **questo file**. Basta.
Quando si comincia a costruire, aprire **[PIANO-1.4.md](PIANO-1.4.md)**: lì c'è il
disegno dei dati, il calendario e il perché di ogni scelta. Il [README](../README.md)
serve a chi installa, aggiorna o diagnostica.

Repo privato `sacchetti84-dev/pathfinder`, branch `main`, albero pulito e in pari.

---

## 1. Stato, al minuto

| Voce | Valore |
|---|---|
| In magazzino, **adesso** | **`pathfinder-1.6.1.html`** — in radice, **1.614.368 byte**. È la build del 14/08, che fino al 17/08 veniva servita **da dentro `outDir`**: ogni `npm run build` sarebbe finito davanti agli operatori — §3novies |
| **1.7 — costruita, non installata** | La consegna multi-file. Entra in due passi, INDEX §7ter: il primo vuole l'amministratore **una volta sola**, e dopo non serve più a nessuno dei due gesti |
| Interruttori | **DUE accesi**: `feature.tasks` (13/08 10:31:06, `ANDS`) e **`feature.uom`** (13/08 13:54:36, `BABB`). Gli altri tre spenti. **Riletto da `featureLog` la sera del 13/08** — §3septies |
| Ritorno indietro | **`pathfinder-1.4.4.html`**, in radice: un comando solo, senza ripescare niente. Accanto c'è anche la 1.4.3 |
| Sorgente | 39 file in `src/`: **30 TypeScript**, 5 JavaScript, **9 CSS** · modularizzazione CSS completata e `src/ui/views/` creata (14/08) · `modules/excel.ts` (1.7) |
| Ancora JavaScript | `main.js` · `ui/` (4 file). **`core/store.js` non esiste più** |
| Collezioni | **20** — le 19 più **`recipients`** (1.6), creata dal riavvio del 13/08 sera su un database che esisteva già |
| **1.4.3** | **in magazzino**: sei blocchi su sei, otto flussi provati su una copia del database vero prima di installarla — §3 |
| **1.4.3.1** | vissuta mezza giornata e **assorbita dalla 1.4.4**: il selettore 📍 che chiudeva la maschera sotto, e il campo «A» sui tipi che una destinazione non ce l'hanno — §3bis |
| **1.4.4** | **in magazzino**: le due famiglie di chiusura, il Posizionamento tolto, la Conta rifatta come inventario mirato — §3ter |
| Collaudi | **435 client** · **65 servizio** (dieci nuove con la 1.7) · **8 migrazione** — tutti verdi |
| Tipi | `npm run check` a 0 su client e servizio |
| Scadenza progetto | **31/12/2026** · ultima installazione utile **19/12** |

> **Il magazzino gira sulla 1.4.3, dalla notte del 13/08.** Costruita, provata
> nel browser sul file consegnato contro una copia del database vero, e
> installata con i cinque comandi della §4. `/api/app-info` risponde
> `pathfinder-1.4.3.html`, 1.578.603 byte.
>
> **Nessuna delle installazioni della serie 1.4 ha scritto una riga nel
> database**, e lo dicono i numeri: la revisione era 22418 prima e dopo la
> 1.4.2, ed è 22423 adesso — mossa dall'operatività, non dai rilasci. Gli
> 11.180 articoli e le 18 zone sono dov'erano.
>
> **In radice ci sono due file, ed è una situazione di passaggio.** La 1.4.3 è
> servita; la **1.4.3.1** è costruita, provata e in attesa dei due comandi da
> amministratore. Finché la variabile non si sposta, i due difetti della
> maschera di creazione sono ancora davanti agli operatori — §3bis.
>
> **`feature.tasks` È STATO ACCESO il 13/08 alle 10:31:06**, da `ANDS`, e
> `featureLog` lo registra. Da quel momento la voce «Attività» c'è, la coda si
> apre e gli operatori possono creare compiti: lo schedulatore è in servizio.
> Gli altri quattro restano spenti, `feature.uom` compreso — e va acceso **un
> altro turno**, mai lo stesso giorno.
>
> **Che questo documento abbia detto «tutti e cinque spenti» per mezza giornata
> dopo che uno era acceso è la cosa da non ripetere.** Un interruttore si alza
> in dieci secondi da Configurazione → Funzioni e nessuno pensa a scrivere due
> righe qui; ma è proprio quello il fatto che una conversazione nuova legge per
> primo, e che decide se un difetto segnalato sia «impossibile, è spento»
> oppure «normale, è acceso». **Chi alza un interruttore aggiorna questa riga
> nello stesso gesto.**
>
> **Che la 1.4.1 non sia mai entrata non è un problema, ed è meglio saperlo.**
> La 1.4.2 la contiene per intero, e non esiste nessun `pathfinder-1.4.1.html`
> da nessuna parte. La catena del ritorno indietro regge lo stesso, perché
> quello che deve esistere è il file precedente **installato**, non tutti
> quelli costruiti.
>
> **Com'è andata l'installazione, per la prossima volta.** I passi 1 e 2 —
> backup e copia in radice — girano da una shell qualunque. I passi 3 e 4 no:
> la variabile è di macchina e l'attività gira come SYSTEM, quindi **servono i
> privilegi di amministratore** e senza si viene respinti con «Accesso al
> Registro di sistema non consentito». È scritto nella §4, ed è vero.

---

## 2. Cosa è successo nell'ultima sessione

| Commit | Cosa |
|---|---|
| *17/08* | **La 1.7: la consegna diventa una cartella.** Quattro blocchi su sei — build multi-file col manifesto, `xlsx` a richiesta, il servizio che serve una cartella, i due script della giunzione. Più tre giorni di lavoro che erano rimasti fuori da `git log` e il difetto di `outDir` — §3novies |
| *14/08* | **Modularizzazione CSS, avvio `src/ui/views/` e guida per Claude**: `01-base.css` (2.731 righe) diviso in 5 file puliti rispettando la cascata (`01-tokens.css`, `01-base.css`, `01-components.css`, `01-layout.css`, `01-views.css`). Avviata l'architettura per l'estrazione a blocchi di `app.js` verso TypeScript. Ripristinato il database attivo dai backup serali — §3octies |
| *1.4.3.1* | **Due difetti della maschera di creazione, trovati usandola**: il selettore 📍 che chiudeva la finestra sotto invece della propria, e il campo «A» offerto ai sei tipi che una destinazione non ce l'hanno. Nasce `vuoleDestinazione`, con 3 prove — §3bis |
| *1.4.3 · sesto* | **La 1.4.3 prende il suo numero e diventa un file**: quattro numeri, non tre — le serve un ritorno indietro suo |
| `24099b4` | **1.4.3 quinto blocco**: il registro delle attività, con l'export a due fogli e le durate in chiaro E in minuti |
| `d29a274` | **1.4.3 quarto blocco**: l'avvio lancia il movimento — `advanceTask`, `abandonTask`, sei maschere che scalano il residuo, e il campionamento che finalmente ha una maschera |
| `b62e65b` | **1.4.3 terzo blocco**: la maschera che pesca dalle giacenze — ricerca FEFO, lotto e Da automatici, 📍 ovunque, campi DDT, soglia in Configurazione |
| `52ed689` | **1.4.3 secondo blocco**: il campionamento cala ciò che c'è dentro il collo — causale `SAMPLE`, rotta composta sua |
| `dc4fb21` | **1.4.3 primo blocco**: l'urgenza calcolata, la freccia dell'avvio annullato, la tabella tipo→operazione, il residuo |
| `b6c9ccf` | **La 1.4.2 entra in magazzino**: cinque comandi, revisione 22418 prima e dopo |
| *1.4.2 · quinto* | **La 1.4.2 prende il suo numero e diventa un file**, e i documenti dicono dov'è |
| *1.4.2 · quarto* | **Le UM si vedono e si digitano**: la riga «10 × 1.000 + 1 × 100 PZ», il campo del collo incompleto, e i **900 pezzi che comparivano spostando un pallet** — trappola 24 |
| *1.4.2 · terzo* | **Il servizio muove i due numeri insieme**: `qty_uom` dentro la stessa transazione di `qty`, 9 prove nuove, e una prova che passava anche col codice rotto |
| *1.4.2 · secondo* | **Le UM in Store**, l'indice `lotByKey`, il congelamento della confezione al primo posizionamento |
| *1.4.2 · primo* | **`modules/misure.ts`**: la suddivisione per collo, 65 prove scritte prima del modulo |
| `5365f14` | **La 1.4.1 prende il suo numero e diventa un file**: i cinque punti che scrivono la versione, e la prova sul file consegnato invece che sul sorgente |
| `c04d7d5` | **Il campionamento**, l'unica delle otto attività che oggi non esiste: quantità, per chi, campione di riserva |
| `6d50353` | **La coda si vede e si tocca**: voce Attività, i quattro gesti, la maschera di richiesta, il riquadro in Dashboard |
| `2353334` | **Configurazione → Funzioni**: gli interruttori si alzano da qualche parte, col PIN di un Team Leader |
| `8c5f0cc` | **Lo schedulatore che scrive**: le attività in Store, `_moveTask`, e quattro prove nuove sul servizio vero |
| `2a54ec0` | **`modules/compiti.ts`**: ciclo di vita, coda, misure e riepilogo — 52 prove scritte prima del modulo |
| `0adbfb5` | **La 1.4.0 va in magazzino**: i numeri di versione portati a 1.4.0 nei sette punti che li scrivono, la consegna diventa `Pathfinder 1.4/pathfinder-1.4.0.html`, prova nel browser su una copia del database vero, installazione e verifica |
| `321aeb2` | La 1.4.0 è chiusa, e i documenti lo dicono |
| `459dac3` | **`store.js` è TypeScript**: sesto blocco, i due ponti caduti, e i due difetti trovati solo nel browser |
| `ece6962` | **`core/statistiche.ts`** — quinto blocco: stati e cruscotto, verificati confrontando vecchia e nuova implementazione sulle 21 chiavi del risultato |
| `6ad3222` | **`core/pacchetto.ts`** — quarto blocco: export e verifica, con la dimostrazione end-to-end che UDC e compiti non sopravvivono più a un ripristino |
| `50968eb` | **`core/giacenza.ts`** — terzo blocco: FEFO e ricerca |
| `2464160` | **`core/geometria.ts`** — secondo blocco: le ubicazioni |
| `ec31913` | **`core/cache.ts`** — primo blocco della conversione di `store.js`, con le 37 prove che a `_applyToCache` non c'erano mai state |
| `9dd99ff` | Le decisioni D11 e D12: si tira dritto, e le etichette si stampano dal browser |
| `4e61c89` | I documenti allineati, gli aperti da tredici a sette |
| `05cfe74` | **Avvisi merceologici**: temperatura, allergeni e certificazioni al prelievo guidato, sul report ODP e sul DDT |
| `ae1ec86` | **1.4.0 Fase 0**: migrazione `ALTER TABLE` nel prodotto, schema mosso una volta (19 collezioni), export/import da `COLLEZIONI`, interruttori `feature.*` |
| `b104bc7` | La 1.2 entra in magazzino, `pathfinder-1.1.html` esce dalla radice |
| `ccf249f` | Un handoff solo, e gli aperti smettono di trascinarsi |
| `60ddceb` | **5.519 righe di commento** tolte da 39 file, provando che il bundle minificato resta identico byte per byte. Nasce `INDEX.md` |
| `3127d79` | **PIANO-1.4**: le cinque funzioni riordinate per dipendenza, calendario, e il bloccante della §1 |
| `2142031` | Il collaudo che dimostra che i dati sopravvivono al cambio di schema, più il prototipo della migrazione |
| `99d7bb3` | Le tre decisioni: WIP dentro, verifica a fine ottobre, `store.js` in Fase 0 |
| `548c3df` `e7e6512` | **Verifica di stoccaggio**: attributi articolo e zona, import/export Excel, segnalazione in mappa, deroga della cella Riservata |
| `58e95e1` | Questo documento |

---

## 3. Da dove si riparte, in ordine

### Prima cosa, e non è codice — resta da fare

**Caratterizzare le zone** in Configurazione → Zone: classe di conservazione e la
spunta sulla zona allergeni. Finché non è fatto la mappa resta muta, per quanti
articoli si classifichino: la verifica confronta due metà e una manca.

Poi **esportare l'anagrafica** e costruire le tendine in Excel puntando al foglio
**«Valori ammessi»** che l'export porta con sé — che da oggi descrive anche la
colonna `Certificazioni`.

### Il codice della 1.4.0 — dove siamo

| # | Cosa | Stato |
|---|---|---|
| 1 | La migrazione `ALTER TABLE` dentro `PathfinderDB` | **fatto** — `_migra`, `server/lib/db.js` |
| 2 | **`core/store.js` in TypeScript**, a blocchi | **fatto** — sei blocchi, e il file adesso è `core/store.ts` |
| 3 | Collaudi su `_applyToCache` (aperto #6) | **fatto** — 37 prove in `test/cache.test.js` |
| 4 | Schema mosso una volta: `udc_id`, `lots` `udc` `tasks` `wip` `storage_rules`, Dexie `version(8)` | **fatto** |
| 5 | Export/import da `COLLEZIONI` invece che da tre elenchi a mano | **fatto** |
| 6 | Interruttori `feature.*` in `meta`, tutti spenti | **fatto** |
| 7 | **Costruire e installare la 1.4.0** | **fatto 12/08** — `/api/app-info` risponde `pathfinder-1.4.0.html` |

### La 1.4.1 — cosa c'è, e cosa resta da fare

| # | Cosa | Stato |
|---|---|---|
| 1 | `modules/compiti.ts` — ciclo di vita, coda, attesa e durata, riepilogo | **fatto** — 52 prove, provate rompendo il modulo |
| 2 | Le attività in `Store`: apertura, presa in carico, avvio, chiusura, annullamento, priorità | **fatto** — più 4 prove sul servizio vero |
| 3 | **Configurazione → Funzioni**: gli interruttori si alzano col PIN di un Team Leader | **fatto** — prima non c'era modo di accenderne uno |
| 4 | La vista **Attività**: coda, filtri, i quattro gesti, la maschera di richiesta | **fatto** |
| 5 | Il **riquadro in Dashboard** — la trappola del piano, chiusa il primo giorno | **fatto** |
| 6 | Il **campionamento**: quantità, per chi, campione di riserva | **fatto** |
| 7 | **Installare la 1.4.1** e accendere `feature.tasks` | **assorbito dalla 1.4.2**: si installa quella, che la contiene |

**Due decisioni prese scrivendo, che il piano non fissava** — e che vale la
pena conoscere prima di rimetterle in discussione:

1. **La priorità cresce col numero, e l'operatore arriva a Normale.** La D4
   dice che la priorità la alza solo il Team Leader; senza un tetto **alla
   creazione** quella regola sarebbe una frase, perché il varco non è la
   modifica. Provata forzandola: la tendina disabilita le due priorità alte, e
   passando 4 a mano Store risponde di no. Vale in due punti, non in uno.
2. **Da uno stato chiuso non esce nessuna freccia.** Un compito concluso è un
   fatto, e i tempi che ne escono sono la misura di questa versione: se si è
   sbagliato se ne apre un altro. Come per i movimenti, la storia non si
   riscrive.

### La 1.4.2 — cosa c'è, e cosa resta da fare

| # | Cosa | Stato |
|---|---|---|
| 1 | `modules/misure.ts` — le cinque unità, la suddivisione, il collo incompleto, l'aritmetica che non deriva | **fatto** — 65 prove, provate rompendo il modulo in quattro punti |
| 2 | L'indice `lotByKey` in `core/cache.ts` | **fatto** — 6 prove nuove, 43 in tutto |
| 3 | La confezione **congelata al primo posizionamento**, e `qty_uom` su giacenza e registro | **fatto** |
| 4 | Le UM che escono **dentro la stessa transazione** dei colli, sulle due rotte composte | **fatto** — 9 prove nuove sul servizio vero, 43 in tutto |
| 5 | La riga «10 × 1.000 + 1 × 100 PZ» a video, e il campo per il collo incompleto | **fatto** |
| 6 | **Installare la 1.4.2** | **fatto 12/08** — `/api/app-info` risponde `pathfinder-1.4.2.html`, 1.541.133 byte |
| 7 | **Confermare le due scelte della §5.41**, che il piano non prevedeva | **da fare** — prima di accendere `feature.uom` |

**Tre decisioni prese scrivendo**, oltre a quella da confermare:

1. **Il collo incompleto non è una riga sua** — è la decisione del piano §4.2,
   e regge tutto il resto. Una riga: `qty: 11`, `qty_uom: 10100`, e il resto si
   calcola.
2. **La confezione del lotto vince sull'anagrafica, sempre.** È un fatto già
   successo: i colli a scaffale sono imballati come allora, anche se nel
   frattempo qualcuno ha cambiato l'articolo.
3. **Le UM dichiarate si convalidano, quelle derivate si troncano.** Un numero
   digitato che non torna fa saltare il prelievo; una derivazione che non torna
   può farlo solo su una riga già incoerente, e bloccare un prelievo fisico
   perché un dato è vecchio è peggio del dato vecchio. Lo scarto lo mostra
   `verificaUom`, che non corregge niente.

### La 1.4.3 — lo schedulatore che lancia il lavoro

**Non è nel PIANO-1.4.** Nasce il 12/08 sera, dalla prova sul campo della
1.4.1: la coda c'era, ma «completare un'attività non muoveva i colli». Non
era un difetto, era il disegno — il compito era una *richiesta* che
affiancava l'operazione, e «Completa» una spunta. Da qui in poi **il compito
apre il lavoro, e si chiude solo perché un movimento è stato confermato.**

Va davanti alla 1.4.4 (UDC, che slitta di quanto serve) per una ragione
sola: `feature.tasks` è ancora **spento**, quindi nessuno lo sta usando e
non si rompe niente a nessuno. Accenderlo com'era avrebbe messo in mano agli
operatori proprio la «lista che invecchia» che il piano §4.1 temeva.

#### Cosa è stato deciso, e va eseguito così

| | Deciso |
|---|---|
| **Creazione** | L'articolo si cerca **fra le giacenze** come nel campo di ricerca; le disponibilità si propongono in ordine **FEFO**, coi colli al netto degli impegni su DDT pendenti; la riga scelta compila **lotto** e **Da**. Il **Posizionamento** fa eccezione: articolo dall'anagrafica, lotto digitato, nessun Da |
| **Colli** | Obbligatori dove si muove merce; liberi solo per la **Conta** |
| **Scadenza** | Data+ora (c'era già). Sotto la soglia — **4 h di serie, parametro in Configurazione** — la coda tratta il compito come urgente |
| **Escalation** | **Calcolata a video, MAI scritta.** Il record tiene la priorità di chi l'ha chiesta |
| **«Perché»** | Diventa **Note** |
| **Prelievi** | Aprono il flusso **DDT**, e destinatario/vettore/causale si chiedono **alla creazione**: li sa chi chiede, non chi preleva |
| **Avvio** | Lo può fare **chiunque, e diventa suo** |
| **Esecuzione** | L'avvio apre la funzione di Movimenta **precompilata**. Il movimento confermato **scala il residuo**: 12 chiesti, 5 mossi, restano 7 e il compito resta aperto |
| **Abbandono** | Maschera chiusa senza confermare → **torna in carico**, `started_at` azzerato |
| **«Completa» a mano** | Sopravvive **solo per la Conta**, che può concludersi senza movimento |
| **Campionamento** | Causale nuova **`SAMPLE`**; il logbook è il **registro filtrato** su quella causale, nessuna collezione nuova; **i colli non calano, cala la quantità dentro** |
| **Registro attività** | **Tutte** le attività mai aperte, coi tempi, e export Excel |
| **Ubicazioni** | Il selettore 📍 **ovunque** si chieda un'ubicazione |

#### Dove siamo — tre blocchi su sei

| # | Blocco | Stato |
|---|---|---|
| 1 | `modules/compiti.ts`: urgenza calcolata, freccia `in_progress → assigned`, tabella tipo→operazione, le tre eccezioni per tipo, il residuo | **fatto** — 32 prove nuove, 84 in tutto |
| 2 | La causale `SAMPLE`, `Store.sampleItem`, la rotta `/api/op/sampleItem` | **fatto** — 7 prove nuove sul servizio, 50 in tutto |
| 3 | La maschera di creazione: ricerca dalle giacenze, autofill, 📍, campi DDT, soglia in Configurazione | **fatto** — provata nel browser |
| 4 | **L'avvio che lancia il movimento** | **fatto** — 11 prove nuove sul modulo, 4 sul servizio |
| 5 | **Il registro attività** con export Excel | **fatto** |
| 6 | Versione `1.4.3`, build, documenti | **fatto** — 1.578.603 byte |
| 7 | **Prova nel browser sul file consegnato** | **fatta 13/08** — otto flussi su copia del database vero, porta 4199. Tre difetti trovati e chiusi, sotto |
| 8 | **Installare la 1.4.3** | **fatto 13/08** — `/api/app-info` risponde `pathfinder-1.4.3.html`, 1.578.603 byte |

#### Cosa ha trovato la prova nel browser, che tsc e 377 collaudi non vedevano

Il banco: seconda istanza sulla **4199**, database una copia a caldo del
vero, il file appena costruito, e le giacenze del backup del 07/08 caricate
dentro. `feature.tasks` e `feature.uom` accesi **sulla sola copia**.

| | Difetto | Perché non lo prendeva nessun collaudo |
|---|---|---|
| 1 | **La riga la sceglieva la ricerca, non il compito.** Con lo stesso lotto in due ubicazioni, `_cambioLookup` apre l'elenco delle partenze e non seleziona niente: maschera precompilata, nessuna merce sotto, e alla conferma «scansiona prima un articolo» | Serve un lotto **in due ubicazioni** e un compito che ne indichi una. Nessuna prova da fermo monta quella coincidenza |
| 2 | **La Conta pretendeva un articolo**, e quindi non si poteva proprio aprire | La validazione stava nella maschera, non nel modulo puro. Adesso ci sono `vuoleArticolo` e `vuoleUbicazione`, con le loro prove |
| 3 | **Evadere un DDT da fuori Movimenta lasciava un'eccezione**: `movFormArea` là non esiste e la maschera si ridisegnava su `null` | La merce usciva e il compito si chiudeva lo stesso: moriva l'ultima riga, in silenzio. **C'era già nella 1.2** — si evade anche dal riquadro in Dashboard |

**Gli otto flussi, uno per uno, tutti verdi:**

| Flusso | Cosa si è visto |
|---|---|
| Trasferimento **parziale** | 13 chiesti, 8 mossi → restano 5, compito **aperto**. Origine 5 coll./30 PZ, destinazione 8/48: nessun pezzo comparso dal nulla — trappola 24 |
| Trasferimento, **il saldo** | «Riprendi» precompila **5**, non 13. Mossi, il compito si chiude **da solo**: `qty_done` 13, `mov_ids` [60, 61] |
| **Abbandono** | Maschera chiusa senza confermare → torna ad **assegnato**, `started_at` **azzerato**, la sigla resta. Decisione 46 |
| Posizionamento | Chiuso in un colpo, 7 coll. = 42 PZ |
| Smaltimento | 3 su 7, verbale `SMA-2026-0001`, saldo 4 coll./24 PZ |
| Quarantena | 4 coll. in area NC, 7 restano conformi, cartellino stampato |
| **Conta** | Si apre su un vano **senza articolo**; la rettifica non la chiude — non ha colli — e resta il gesto a mano, che per lei sola sopravvive |
| **Campionamento** | 13 colli restano **13**, dentro cala da 78 a 75 PZ. Causale `SAMPLE` a registro, `qty_delta` 0 e `qty_uom_delta` −3 |
| **Prelievo → DDT** | Testata precompilata da chi ha chiesto. Registrato, il compito **resta in corso**. **Ricaricata la pagina** — sessione morta — e poi evaso: il compito si chiude lo stesso, perché il filo è `task_id` sul documento. Decisione 51 |
| Registro + export | 9 attività coi tempi, foglio Excel a due pagine |

> **La regola dei due lati.** «Fatta» a mano chiude la Conta e viene
> **respinta** su un trasferimento in corso, con il messaggio giusto: provate
> tutte e due, perché una regola verificata da un lato solo è una regola per
> metà.

**Il file porta quattro numeri**, `pathfinder-1.4.3.html`: gli serve un
ritorno indietro suo, distinto dalla 1.4.2 che è in magazzino adesso.
`package.json` porta `1.4.3`, che semver non è — npm lo accetta perché il
pacchetto è privato e non si pubblica da nessuna parte.

#### Com'è fatto il quarto blocco, che era il più delicato dei sei

Il timore era giusto — tocca sei flussi già in produzione — ma il punto di
attacco si è rivelato uno solo, e piccolo.

**Il residuo si scala in chiaro dentro ogni maschera, non di nascosto in
`_logMov`.** La tentazione era agganciare tutto al registro dei movimenti,
che è già il collo di bottiglia da cui passano trentotto chiamanti: una riga
sola e sei flussi serviti. Non regge, e la ragione è `MOV.MOVE` — su uno
spostamento totale `qty_delta` vale **zero**, perché il record cambia
ubicazione e non quantità. Quanti colli si siano mossi lo sa la maschera, non
il registro. Quindi sei chiamate a `_taskAvanza(colli, tipi)`, una per
flusso, ognuna con davanti il numero giusto.

**Ogni maschera dichiara quali tipi di attività può servire**, ed è il
secondo pezzo della stessa precauzione: dentro Movimenta si cambia scheda
con un click, e un posizionamento non deve poter chiudere uno smaltimento.

**Il prelievo si chiude all'EVASIONE, non alla registrazione del DDT.** È
l'unico dei sei che non si chiude nella sessione che l'ha aperto: fra il
documento e il ritiro del vettore passano dei giorni, e in mezzo ci sta un
riavvio. Il filo è `task_id`, scritto sul documento — non una sessione
aperta, che non sopravviverebbe alla notte.

**Il campionamento ha finalmente una maschera.** Era l'ottava attività: la
1.4.1 ne aveva messo in coda la richiesta e nessuno poteva eseguirla.
`Store.sampleItem` c'era dal secondo blocco, ma senza niente che lo
chiamasse.


### 3bis. La 1.4.3.1 — i primi due difetti trovati usando lo schedulatore

**È la prima versione nata dall'uso, non dal piano.** `feature.tasks` è stato
acceso la mattina del 13/08; entro mezzogiorno la maschera di creazione aveva
mostrato due cose, e nessuna delle due l'avevano vista i 377 collaudi.

| | Difetto | Perché non lo prendeva niente |
|---|---|---|
| 1 | **Il selettore 📍 chiudeva la maschera sotto.** Scelta l'ubicazione di destinazione, la finestra «Nuova attività» spariva con tutto quello che c'era dentro | `showModal` crea **sempre** `id="modalOverlay"` e `closeModal` rimuove `getElementById('modalOverlay')`, che restituisce **il primo** nell'ordine della pagina. Aperto da dentro una modale, il selettore ne creava un secondo con lo stesso id e chiudeva il primo: quello sotto. Dalla 1.4.3 il 📍 sta «ovunque si chieda un'ubicazione», e la maschera di creazione è l'unico posto dove sta **dentro** una modale — gli altri otto punti sono maschere in linea di Movimenta, e lì il difetto non si vede |
| 2 | **Il campo «A (ubicazione)» compariva su tutti e otto i tipi**, Smaltimento compreso — che scarica il magazzino e non porta niente da nessuna parte | `_ntTypeChanged` accendeva e spegneva la riga del campionamento, quella del DDT, gli asterischi e l'etichetta del «Da», e **`ntTo` non lo toccava**. Non era solo rumore: `doCreateTask` scriveva `payload.to` se il campo era compilato, cioè un dato falso su un record che è storia |

**La correzione del primo esiste già nel codice, mille righe più giù.**
`_showReleaseDestDialog` ospita lo stesso 📍 dentro una modale e non ha mai
avuto il problema, per una ragione sola: si costruisce l'overlay con un id
suo. Ora `_pickLoc` fa lo stesso — `pickLocOverlay` e `_closePickLoc()` — e
non passa più da `showModal`/`closeModal`. Le altre modali non sono state
toccate: rifare lo stack delle finestre per due difetti sarebbe stato
spostare e correggere nello stesso commit.

**La regola del secondo sta nel modulo puro, non nella maschera.** Accanto a
`vuoleColli`, `vuoleArticolo` e `vuoleUbicazione` c'è ora `vuoleDestinazione`,
vera per Trasferimento e Posizionamento e falsa per gli altri sei. Che siano
esattamente quei due non è un'opinione: `_taskLancia` legge `payload.to` per
precompilare `pCambioDest` sul trasferimento e `mInLoc` sul posizionamento, e
per nessun altro modo — sulla Conta lo legge come ripiego di `from`, che per
lei è già obbligatorio. **Il campo non si nasconde soltanto: si svuota**,
perché `doCreateTask` legge il campo e non la sua visibilità.

**Com'è stata provata**, e vale la pena tenerlo come modello:

| | |
|---|---|
| Banco | Seconda istanza sulla **4199**, database una copia a caldo del vero, il file appena costruito |
| Difetto 2 | Provati **tutti e otto** i tipi in fila, guardando `display` del gruppo **e** il valore residuo del campo. Due visibili, sei nascosti, sei svuotati |
| Difetto 1 | Aperto il 📍 dalla maschera: le due finestre convivono con id **distinti**, la creazione resta aperta. Scelta l'ubicazione, il campo prende `MAG-ACC-01` e si chiude **solo** il selettore. Provata anche la ✕, che è l'altra via d'uscita |
| Database vero | Revisione **22423** prima e dopo, 0 attività: non è stato toccato |

> **Il numero ha quattro cifre, e non è un ripensamento.** La 1.4.4 nel piano è
> la UDC: prendergliela per due difetti farebbe slittare tutta la serie di una
> posizione. È la stessa ragione per cui era nata la 1.4.2.1 — una correzione
> fuori piano costa meno con un quarto numero che con un rinvio.

### 3ter. La 1.4.4 — quello che mezza giornata di uso vero ha detto

**È la versione più importante della serie, e non era in nessun piano.**
`feature.tasks` è stato acceso alle 10:31; a metà pomeriggio il magazzino
aveva prodotto sette attività, e quattro erano ferme in `in_progress` con il
lavoro **già fatto**. Non era un difetto di calcolo: era il disegno che
conosceva una sola forma di conclusione.

#### Le due famiglie, che è la cosa da ricordare

Fino alla 1.4.3 un compito si chiudeva in un modo solo: quando il **residuo
dei colli** arrivava a zero. Regge per i tipi che spostano una quantità
decisa in anticipo, e non regge per gli altri:

| Famiglia | Tipi | Si chiude quando |
|---|---|---|
| **A residuo** | Trasferimento · Smaltimento | i colli chiesti sono stati mossi — 12 chiesti, 5 mossi, ne restano 7 (decisione 45, intatta) |
| **A gesto** | Prelievo spedizione · Prelievo reso · Quarantena · Campionamento · Conta | **l'operazione è stata confermata**, e quanti colli si siano mossi non decide niente |

Perché ognuno dei cinque non poteva chiudersi:

- **quarantena** — si bloccano 4 colli su 13 perché *quelli* sono non
  conformi: la decisione di qualità è presa, il residuo non vuol dire niente;
- **campionamento** — un campione vale un collo (decisione 53), e il campo
  Colli alla creazione arriva precompilato con **tutta la giacenza**: 1 su 13,
  per sempre;
- **conta** — non porta colli affatto, quindi `residuo` è `null` e
  `esaurito` non può mai essere vero. Per costruzione;
- **i due prelievi** — si chiudevano all'evasione del DDT, con un filo che si
  spezzava da solo (sotto).

#### Il prelievo si chiude alla REGISTRAZIONE del DDT — decisione 51 ribaltata

La 1.4.3 lo chiudeva all'**evasione**, e la ragione sembrava buona: è quando
la merce esce davvero. Sul campo è sbagliata per due motivi.

**Il primo è organizzativo, ed è quello che conta.** Il lavoro
dell'operatore finisce col documento: da lì la merce aspetta il vettore, e
il ritiro non dipende più da lui. Tenergli il compito aperto in coda per
giorni vuol dire lasciargli addosso un'attività che non può concludere.
**L'evasione non è un'attività dello schedulatore e non ne genera una**: è un
fatto del magazzino, che si registra quando il vettore arriva.

**Il secondo è tecnico, e da solo bastava.** Il filo era `doc.task_id`,
scritto in `_saveShipPending` **solo se `this._taskRun` era ancora vivo al
salvataggio**. Bastava uscire da Movimenta e rientrare, o che la sessione si
interrompesse fra l'avvio e il salvataggio, perché il campo nascesse `null`:
da quel momento il compito non si chiudeva più, né all'evasione né mai. Nel
database di lavoro c'erano due DDT evasi legati a un compito ancora aperto.

`task_id` sul documento **resta scritto**, ma come legame fra la richiesta e
il documento che ne è nato — non come meccanismo di chiusura.

#### Il Posizionamento esce dai tipi

Mettere a scaffale la merce appena arrivata succede in coda all'accettazione,
**che su Pathfinder non passa**: nessuno avrebbe mai aperto quel compito. Un
tipo che non si usa è una voce in più in ogni tendina e un ramo in più in
ogni regola — e infatti la sua uscita ha fatto sparire `daGiacenza` per
intero e ha ridotto `vuoleDestinazione` al solo Trasferimento.

**La funzione «Posiziona» di Movimenta resta dov'è.** A sparire è il compito,
non l'operazione: chi posiziona a mano lavora come sempre.

#### La Conta diventa un inventario MIRATO

Era concettualmente sbagliata: apriva il **vano intero**, cioè esattamente
quello che l'inventario di magazzino fa da sempre. Un'attività che duplicava
una funzione, e che per giunta non poteva chiudersi.

Adesso è un inventario **su una riga sola** — un articolo, un lotto — scelta
dalle giacenze come per ogni altro tipo, con la **finestra di guida a tre
scansioni** delle altre operazioni fisiche: ubicazione, articolo, lotto, e
solo allora il numero contato. Si chiude alla conferma, **anche quando il
conteggio torna giusto e non produce nessuna riga**.

> **Il numero di sistema non si mostra prima di aver contato.** Un numero
> davanti agli occhi è un suggerimento, e un inventario che suggerisce la
> risposta non verifica niente: il confronto compare dopo, ed è il confronto
> a essere il risultato.

L'inventario di vano **non chiude più nessun compito**: lasciarci l'aggancio
avrebbe voluto dire che un inventario massivo fatto per altre ragioni
chiudeva la Conta di qualcun altro.

#### «Completa» a mano non esiste più

Sopravviveva per la sola Conta. Adesso che anche lei si chiude confermando,
l'ultimo tipo che ne aveva bisogno non c'è più: **`completeTask` pretende
sempre `_chiusuraAmmessa`**, e l'unica strada resta `advanceTask`. Dichiarare
fatto del lavoro che nessuno ha registrato non è una scorciatoia, è un buco
nella tracciabilità GMP.

#### Il difetto trovato provando, che non era nell'elenco

**La maschera di creazione maiuscolava il lotto, ma il lotto è metà di una
chiave.** `item_key` è `ARTICOLO#LOTTO`: un lotto registrato `qwert` finiva
nel payload come `QWERT`, e all'avvio `_taskLancia` andava a cercare
`123456#QWERT` — una riga che non esiste. La maschera si apriva **vuota**, e
chi la prendeva in mano non aveva modo di capire perché. Sembrava una
normalizzazione, era una riscrittura della chiave. Adesso articolo e lotto si
scrivono **com'erano nella giacenza scelta**: li ha copiati `_ntScegli`, sono
già quelli giusti.

#### Come è stata provata

Banco: seconda istanza sulla **4199**, copia a caldo del database vero, il
file appena costruito. Cinque flussi:

| Flusso | Esito |
|---|---|
| **Quarantena** | 3 colli bloccati su 10 chiesti → **`done`**, `qty_done` 3 |
| **Campionamento** | 1 collo su 5 chiesti → **`done`**, `qty_done` 1 |
| **Conta che torna** | contati 97 su 97 → **`done`**, `qty_done` 0, giacenza intatta |
| **Conta che non torna** | contati 90 su 97 → **`done`**, giacenza rettificata, `FIX-` a registro con nota e sigla |
| **Prelievo → DDT** | registrato → **`done`** alla registrazione, `qty_done` 20, documento `pending` |
| **Trasferimento** *(non regressione)* | 4 su 10 → resta **aperto**; «Riprendi» precompila **6**; il saldo chiude con `mov_ids [88, 89]` |

Il database vero non è stato toccato: revisione 22423 prima e dopo la prova.

### 3quater. Le due cose andate storte il 13/08, e vanno lette

**1. La 1.4.3.1 è stata cancellata mentre era in servizio.** Era stata
costruita a mezzogiorno e lasciata in radice non servita; nel pomeriggio è
stata installata. Alla build della 1.4.4 il file è stato rimosso dalla radice
**dando per scontato che non fosse servito**, senza chiedere al servizio quale
stesse servendo. `PATHFINDER_APP` ci puntava: la pagina è andata in **404**.

Il servizio dati è rimasto vivo, i dati intatti e i terminali già aperti hanno
continuato a lavorare — parlano con l'API, che rispondeva. Chi ricaricava non
entrava più. Si è chiuso spostando la variabile sulla 1.4.4, che era pronta.

> **La regola che mancava, e che costa un comando:** prima di cancellare un
> file dalla radice si chiede al servizio quale sta servendo —
> `Invoke-RestMethod http://127.0.0.1:4173/api/app-info`. Il percorso è lì.
> Non è andato perso nessun dato; è andata persa **l'unica copia** della
> 1.4.3.1, e con lei la sua via di ritorno.

**2. Quattro attività sono rimaste aperte, e non si chiuderanno da sole.**
Sono quelle create prima della 1.4.4, col lavoro **già fatto** e il record
fermo:

| Attività | Tipo |
|---|---|
| `TA-MSRAXA3Q-PQ11` | Prelievo spedizione — due DDT evasi, compito aperto |
| `TA-MSRB4JXK-04C7` | Quarantena |
| `TA-MSRB80C2-2JLC` | Campionamento |
| `TA-MSRBEZLU-5M3E` | Conta |

**Vanno annullate a mano, col motivo** — «chiusa dalla 1.4.4, lavoro già
eseguito» — dalla vista Attività. Non si chiudono con «Avvia», perché la
merce si è già mossa e rifarlo la muoverebbe due volte. È l'unico strascico
del difetto, ed è di dato, non di codice.

**Il prossimo atto è la 1.5** — non la UDC: vedi §3quinquies.

### 3quinquies. Le note del 13/08 — quattordici richieste, e il piano si riordina

**Andrea ha analizzato il lavoro fatto finora e ha scritto quattordici note.**
Stanno per intero in **[PIANO-1.4 §9](PIANO-1.4.md#9-le-note-del-1308--quattordici-richieste-nate-dalluso)**,
con le decisioni D13-D21 in §8. Qui basta sapere tre cose.

**1. Passano davanti alla UDC** (D13). Stessa logica di 1.4.3 e 1.4.4: si serve
chi sta usando il sistema adesso. UDC, motore di stoccaggio e WIP scendono in
coda senza cambiare di contenuto.

**2. La numerazione diventa progressiva** (D14). Una build **definitiva** porta
**due numeri** — `1.5`, `1.6`, `1.7`; una build di **prova** ne porta di più —
`1.5.1`. Il vincolo dei tre numeri (§8) **cade**: nasceva perché i rilasci della
serie 1.4 condividevano i primi due numeri e si sarebbero sovrascritti, e con la
numerazione progressiva `pathfinder-1.5.html` e `pathfinder-1.6.html` sono già
nomi distinti.

**3. L'ordine di lavorazione:**

| | Cosa | Dove |
|---|---|---|
| **1.5** | **Campionamento GMP** — pulizia post-campionamento, verbale PDF, allergeni · più Sposta → **Trasferimento** ovunque | PIANO §9.2 |
| **1.6** | **Anagrafiche e parametri** — destinatari/destinazioni DDT, parametri articolo in Impostazioni, attributi di zona | PIANO §9.3, §9.5 |
| **1.7** | **UOM riscritta** — colli a contenuto variabile, più colli incompleti, prelievo parziale in colli e UM ovunque | PIANO §9.4 |
| **1.8** | **Viste giacenza** — pannello della mappa, pagina Giacenze con conta multipla e PDF | PIANO §9.6 |
| **1.9** | **Trasferimenti generati dall'ODP** | PIANO §9.7 |
| **1.10** | **UI mobile** — riconoscimento Android, interfaccia dedicata | PIANO §9.8 |
| 1.11 · 1.12 · 1.13 | UDC · motore di stoccaggio · WIP, invariate | PIANO §4.3-4.5 |

> **`feature.uom` non si accende sulla 1.4.4.** La nota dice che accendendola la
> funzione non si comporta come deve, e la 1.7 la riscrive: accenderla adesso
> vorrebbe dire mettere in mano agli operatori proprio ciò che va rifatto.
> L'aperto 1bis resta, ma il turno buono è **dopo la 1.7**.

> **Due decisioni cambiano un dato già scritto.** D15 toglia peso unitario e peso
> netto per collo dall'anagrafica — non sono dati gestiti — e con essi decade metà
> dell'aperto #5: resta `pieces_per_pack`, che è quello che decide se un articolo
> è a UM. D18 rovescia la riga «un quindicesimo allergene non si fa» del PIANO §7:
> i 14 di legge non si toccano, ma **sopra si aggiunge** (glutine, lattosio).

**Il 31/10 resta la data della verifica dell'andamento** (§6 del piano). Dei
quattro fatti da guardare, il terzo — *«1.4.2 costruita e verificata»* — è vero
dal 12/08. Il secondo — *«gli operatori hanno aperto dei compiti davvero»* —
**non dipende più dal codice, che è finito**: dipende da quando qualcuno esegue
i cinque comandi e alza l'interruttore.

> **Cosa ha richiesto il rilascio, oltre alla build.** Il sorgente era chiuso ma
> non rilasciabile: `package.json`, `vite.config.js`, `index.html`, `main.js`,
> `ui/app.js`, `core/pacchetto.ts` e `modules/vault.ts` dicevano tutti ancora
> 1.2. I due che contano sono `VERSIONE_APP` e il manifesto del vault — sono
> due posti apposta, e il commento di `pacchetto.ts:22` dice perché.
>
> **Il file porta tre numeri**, `pathfinder-1.4.0.html`, non due. La serie 1.4
> sono sei rilasci che entrano in magazzino separatamente: con il nome a due
> numeri si sovrascriverebbero, e il ritorno indietro dalla 1.4.1 non avrebbe
> un file dove tornare. Vale per tutte e sei — vedi `vite.config.js`.

> **Com'è stata fatta la conversione, e cosa se ne impara.** Sei blocchi. I primi
> cinque **estratti** in un `.ts` loro, tipizzati e collaudati, lasciando in
> `store.js` il nome e la firma che i chiamanti conoscevano — quarantasette punti
> chiamavano `_applyToCache` e nessuno se n'è accorto. Il sesto **tipizzato sul
> posto**, perché scrive: da 428 errori a zero, e poi il file rinominato.
>
> | # | Blocco | Dove | Prove |
> |---|---|---|---|
> | 1 | Cache e `_applyToCache` | `core/cache.ts` | 37 |
> | 2 | Ubicazioni e geometria | `core/geometria.ts` | +5 |
> | 3 | FEFO e ricerca | `core/giacenza.ts` | +10 |
> | 4 | Pacchetto di export | `core/pacchetto.ts` | 24 + 3 |
> | 5 | Stati e cruscotto | `core/statistiche.ts` | 15 |
> | 6 | Le mutazioni | `core/store.ts`, 1.766 righe | le 30 del servizio |
>
> **Perché estrarre paga**: un blocco estratto si collauda **da fermo**, senza
> `Persistence`, senza servizio e senza browser. È il motivo per cui
> `_applyToCache` non aveva prove da tre versioni — non perché nessuno ci
> pensasse, ma perché per arrivarci serviva mezzo applicativo.
>
> **Cosa ha trovato il compilatore**, che è il guadagno vero: quindici campi che
> il codice scrive da anni e che i tipi non dichiaravano — otto su `Articolo`,
> `last_updated_at` su `Giacenza`, le tre quantità su `Movimento`, i campi del
> destinatario su `DocumentoUscita` — più i quattro metodi di backup che
> esistevano nell'adapter e non nel contratto. E `loadAll`, che era
> `Record<string, unknown>`: cioè non dichiarata.
>
> **E cosa NON ha trovato**, che conta di più: due difetti veri li ha presi solo
> la prova nel browser, con tsc e 208 collaudi tutti verdi. Vedi §6, trappole 20
> e 21. **Il compilatore dice se il codice è coerente, non se l'applicativo
> funziona.**

Criterio di riuscita della 1.4.0: **si installa e non cambia niente a video.**
Con una eccezione dichiarata: gli **avvisi merceologici** (PIANO §4.4ter) si
vedono, ed è voluto — non passano da un interruttore perché non cambiano nessun
comportamento, mostrano un dato che c'era già.

### 3octies. La modularizzazione UI (`src/ui/views/`) e le istruzioni per Claude

Il 14/08 è stato avviato il processo di miglioramento della qualità del codice con il **Primo Passo**:

#### 1. Cosa è stato fatto il 14/08
- **Modularizzazione dei CSS**: Il file monolitico `src/styles/01-base.css` (2.731 righe) è stato riorganizzato e suddiviso in 5 fogli di stile tematici:
  - `01-tokens.css`: Token di sistema, scale dimensionali, colori MD3 e superfici.
  - `01-base.css`: Reset, body, scrollbar, blocco servizio non raggiungibile (`.svc-down`) e boot screen.
  - `01-components.css`: Componenti generici, bottoni, campi form, switch, badge, tabelle e finestre modali.
  - `01-layout.css`: App shell, header, ricerca, breadcrumb, sidebar e mobile tabs.
  - `01-views.css`: Mappa, conformità stoccaggio, inventario, movimenti, prelievi e regole `@media print` per PDF.
- **Import ordinati in `src/main.js`**: Rispettano al 100% l'ordine originale per preservare le specificità della cascata.
- **Creata `src/ui/views/`**: Directory con relativo `README.md` destinata a contenere le viste estratte da `app.js`.
- **Verifica completa**: `npm run check` (0 errori), `npm test` (435/435 passati), `npm run build` (bundle 1.54 MB generato con successo).

#### 2. Guida operativa per Claude (e futuri agenti): come portare a termine il refactoring di `app.js`

`src/ui/app.js` conta oltre 12.400 righe. **NON DEVE MAI ESSERE CONVERTITO IN UN UNICO COMMIT MONOLITICO.**
Si segue lo stesso metodo rigoroso a blocchi usato con successo per `store.ts`.

##### La sequenza di estrazione delle viste:
1. **Blocco 1 — `src/ui/views/destinatariView.ts`**:
   - Gestione anagrafica destinatari DDT, lista, ricerca partita IVA, form modale e salvataggio in `recipients`.
   - Modulo TypeScript per i calcoli/stato e funzioni di rendering DOM.
   - Espone `renderDestinatariView()`, `openDestinatarioModal()`.
2. **Blocco 2 — `src/ui/views/parametriView.ts`**:
   - Scheda Impostazioni → Parametri: allergeni custom, conservazione, UM ammesse, classi di pericolo.
   - Sincronizzazione con `modules/parametri.ts` e `meta`.
3. **Blocco 3 — `src/ui/views/compitiView.ts`**:
   - Visualizzazione della coda attività, filtri per stato/operatore/urgenza, maschera di creazione compito e annullamento.
   - Collegamento stretto con `modules/compiti.ts` e `Store`.
4. **Blocco 4 — `src/ui/views/campionamentoView.ts`**:
   - Maschera di prelievo campione GMP, calcolo UM, generazione verbale di campionamento e pulizia post-campionamento.
5. **Blocco 5 — `src/ui/views/movimentaView.ts`** *(in sinergia con la 1.7 UOM)*:
   - Funzioni di Trasferimento, Posizionamento, Smaltimento, Quarantena e Prelievo DDT.
6. **Blocco 6 — `src/ui/views/giacenzeView.ts` & Mappa** *(in sinergia con la 1.8)*:
   - Griglia della mappa, viste frontali degli scaffali, pannello di dettaglio laterale e conteggi multipli.
7. **Blocco 7 — `src/ui/views/configView.ts`**:
   - Schede configurazione Siti, Zone, Funzioni, Operatori, Audit e Backup.

##### Regole ferree per ogni blocco:
- **Interfaccia preservata verso `App`**: `App` deve continuare a esporre i metodi pubblici chiamati dall'HTML in linea (`onclick="App.qualcosa()"`). La vista estratta viene importata in `app.js` e i metodi delegati.
- **Nessuna variabile globale nuova**: Lo stato della vista resta incapsulato nel proprio modulo con funzioni esplicite di ciclo di vita (`mount`, `unmount`, `reset`).
- **Tipizzazione forte**: Nuovi file scritti direttamente in `.ts` con import rigorosi da `src/types/entita.ts` e `src/core/store`.
- **Validazione a ogni passo**: Eseguire sempre `npm run check`, `npm test` e `npm run build` prima di considerare chiuso un blocco.
- **Banco di prova nel browser**: Testare sempre su una porta secondaria (4199) contro una copia del database prima di considerare completato un blocco.

### 3novies. La 1.7 — la consegna diventa una cartella (17/08)

Disegno, blocchi e decisioni D22-D29: **[PIANO-CONSEGNA-1.7](PIANO-CONSEGNA-1.7.md)**.
Qui sta solo ciò che una conversazione nuova deve sapere subito.

#### Il difetto che stava in produzione da tre giorni

`/api/app-info` rispondeva **`…\MAPPER\Pathfinder 1.6\pathfinder-1.6.html`**: la
produzione leggeva **da dentro `outDir`**, che `npm run build` azzera. Ogni
build — anche una di prova — sarebbe finita davanti agli operatori, e una build
fallita a metà li avrebbe lasciati in 404. È l'incidente del 13/08 da un'altra
porta, e nessuno se n'era accorto perché **i documenti dicevano un'altra cosa**:
INDEX §5 dichiarava la radice.

E il file servito non era quello che i documenti dichiaravano: **1.614.368 byte
contro 1.625.239**, cioè la build del 14/08 coi CSS modularizzati, non la 1.6 del
13/08. Spostare la variabile sulla radice sarebbe stato un **ritorno indietro
silenzioso**, non una correzione: perciò in radice è entrata
`pathfinder-1.6.1.html`, byte per byte la build che stava girando, e la variabile
punta lì.

> **Da qui esce una regola, e vale oltre questo caso.** Un rilascio si verifica
> confrontando `app_file` **e** i byte, ed è scritto da tempo — ma nessuno lo
> rifà dopo, e nel frattempo qualcuno sposta una variabile di macchina alle
> cinque del pomeriggio. Il primo comando di ogni conversazione che tocchi la
> consegna è `Invoke-RestMethod http://127.0.0.1:4173/api/app-info`: **quello che
> risponde il servizio batte quello che dicono questi documenti.**

#### Cosa fa la 1.7, in tre righe

Una versione è **una cartella** — indice, assets coi nomi a impronta, manifesto —
e vive in `C:\Pathfinder\app\`, fuori da OneDrive come il database. Lo scambio e
il ritorno indietro sono il **ripuntamento di una giunzione**: senza
amministratore, senza riavviare, in due secondi, e `precedente` copre chi aveva
la pagina a metà caricamento nell'istante dello scambio. Il **manifesto con
l'impronta** sostituisce il conteggio dei byte come prova d'identità di una
build.

`xlsx` — 864 KB su 1,61 MB, per una funzione che gira qualche volta al giorno —
si carica a richiesta. E il servizio, che non aveva **mai** compresso niente,
adesso passa i `.gz` che la build ha scritto una volta sola.

| | prima | 1.7, misurato al banco |
|---|---:|---:|
| Primo caricamento | 1.610 kB | **251 kB** |
| Ricarica | 1.610 kB | **300 byte** |

#### Il difetto che solo il banco ha trovato

Con `npm run check` a 0, 435 prove client e 65 sul servizio tutte verdi, dopo un
ritorno indietro `/api/app-info` rispondeva **`versione: null, impronta: null`** —
cioè proprio i due numeri su cui si verifica un'installazione. Causa: il
manifesto generato da `installa-versione.ps1` aveva il **BOM**, perché
`Out-File -Encoding utf8` in PowerShell 5.1 lo scrive, e `JSON.parse` sul BOM
lancia. Adesso lo script scrive senza, il servizio lo tollera comunque, e il
manifesto finto del collaudo **ne porta uno apposta**: la prova resta.

È la terza volta in una settimana che la stessa lezione si presenta. `tsc` dice
se il codice è coerente, i collaudi dicono se le parti fanno quello che
promettono, **e nessuno dei due dice se l'applicativo funziona.**

#### Cosa manca

Metterla in servizio: due passi in **INDEX §7ter**, e il primo vuole
l'amministratore una volta sola. Poi i blocchi 5b e 6 — la prova della 1.7 vera
contro il database di produzione, e il resto dei documenti.

**E il ritorno indietro si prova prima di darla agli operatori**, non dopo.

#### 3. Gestione e Ripristino del Database
- Se il database attivo `C:\Pathfinder\data\pathfinder.db` risulta svuotato, i dati integri risiedono nei backup giornalieri automatici `C:\Pathfinder\backup\pathfinder-YYYY-MM-DD.db`.
- Il ripristino istantaneo a caldo si effettua tramite Node leggendo le 20 collezioni dal backup con `all()` e riversandole con `bulkPut()` dentro una singola transazione `dst.transaction(NAMES, ...)`.

---

## 4. Il registro degli aperti

Tutti gli aperti dei tre handoff precedenti, verificati uno per uno. La colonna
*origine* dice da dove viene, così non si riaprono discussioni già chiuse.

### Ancora aperti

| # | Cosa | Origine | Chi |
|---|---|---|---|
| **0** | **`ANDS` È L'UNICO TEAM LEADER, E IL 13/08 È COSTATO.** Per qualche ora il PIN si è smarrito, e con un solo `leader` questo vuol dire che **nessuno può più creare un operatore né rinnovarne uno**: il rinnovo lo autorizza un Team Leader col proprio PIN, e il cerchio si chiude su se stesso. Il PIN è rientrato; **la causa no.** Promuovere `DAPE` o creare una sigla di riserva — un minuto in Configurazione → Operatori, §4bis | **13/08** | **Andrea, prima di ogni altra cosa** |
| **0bis** | **ANNULLARE LE QUATTRO ATTIVITÀ RIMASTE APERTE** prima della 1.4.4 — `TA-MSRAXA3Q-PQ11`, `TA-MSRB4JXK-04C7`, `TA-MSRB80C2-2JLC`, `TA-MSRBEZLU-5M3E`. Il lavoro è stato fatto, il record è fermo: si annullano **col motivo**, non si riavviano — rifare il gesto muoverebbe la merce due volte. §3quater | **13/08** | Andrea, dalla vista Attività |
| 1quinquies | **`pathfinder-1.4.2.1.html` in `ARCHIVIO/VERSIONI PRECEDENTI/` porta un nome che non è più vero**: quella build è la 1.4.3 di oggi. Da rinominare o da annotare, prima che qualcuno ci torni sopra credendo di tornare a una versione che non è mai esistita | 13/08 | piccolo |
| 1 | ~~Accendere `feature.tasks`~~ — **fatto il 13/08 alle 10:31:06**. Resta `feature.uom`, **un altro turno**, mai lo stesso giorno di `tasks` | 13/08 | Andrea, a inizio turno |
| 1ter | **Confermare le due scelte della §5.41**: la colonna UM è `unit`, la quantità per collo è `pieces_per_pack`. Il piano ne prevedeva altre due, e sarebbero state due colonne con lo stesso nome | 12/08 | Andrea, prima di accendere `uom` |
| 1quater | ~~1.5 e 1.6~~ — **in magazzino il 13/08 sera**, cinque comandi percorsi tutti | **13/08** | ✔ |
| **1quinquies** | **METTERE LA 1.7 IN SERVIZIO.** È costruita e provata al banco, non installata: finché non lo è, `npm run build` è innocuo ma la 1.7 non esiste per nessuno. Due passi in **INDEX §7ter** — il primo vuole l'amministratore, ed è l'ultima volta | **17/08** | **il prossimo gesto** |
| 1sexies | **La numerazione scala di uno dalla 1.8 in giù** — D22: la consegna multi-file ha preso il 1.7, la UOM riscritta è la **1.8**, e a scendere fino al WIP che diventa 1.14. Le date non si muovono | 17/08 | preso nota |
| 2 | **Caratterizzare le zone** e popolare gli attributi in anagrafica. Senza, la mappa resta muta | nuovo | Andrea, alla configurazione |
| 3 | **Partita IVA e dati del mittente** in Configurazione → DDT. La maschera c'è: è un dato da digitare, non codice da scrivere | **1.0 §7.1** | Andrea, quando opportuno |
| 4 | **Nome DNS interno e certificato** dalla CA aziendale. **Il codice è pronto e non aspetta niente**: due variabili e HTTPS si accende. Il certificato arriva a lavori finiti | **1.0 §7.2** · 1.2 §6.1 | IT — non blocca |
| 5 | **`weight_net_kg` e `pieces_per_pack` in anagrafica.** I campi sono cablati ovunque — maschere, import, export, peso del DDT: sono **solo da compilare**, colonne `Peso_Netto_Collo` e `Pezzi_Per_Collo`. Dalla 1.4.2 il secondo **decide se un articolo è gestito a UM**: senza, resta a soli colli anche a interruttore acceso | **1.0 §7.6** | import Excel |
| 6 | **`ui/` in TypeScript**, `app.js` da solo sono 10.529 righe. Fuori dalla 1.4 | 1.2 §6.4 · 1.3 §6.4 | grande |
| 7 | **`TODO F1-REVIEW` ×3**: cache svuotata prima della conferma del supporto (`store.ts` ×2), riallineamento ridondante dopo `resetAll()` (`app.js`) | 1.3 | piccolo |
| 8 | ~~**`service_version` è ancora `'1.1'`**~~ — **chiuso il 17/08**: è `'1.7'`. La regola decisa è che si muove **quando cambia il contratto del servizio**, non a ogni rilascio dell'applicativo — e qui è cambiato davvero, con `PATHFINDER_APP_DIR` e la famiglia `/assets`. La versione dell'*applicativo* la dice il manifesto, e sono due cose diverse — D28 | 12/08 | ✔ |

### 3sexies. La 1.5 e la 1.6 — in magazzino la sera del 13/08

**`npm run check` a 0, 435 prove client** (48 nuove), **55 servizio**, 8
migrazione. `/api/app-info` risponde `pathfinder-1.6.html`, **1.625.239 byte**;
`/api/health` dice **20 collezioni**, `recipients` compresa.

> **La 1.5 non è mai stata un file, ed è voluto.** È dentro la 1.6 per intero,
> come la 1.4.1 era dentro la 1.4.2: quello che deve esistere per il ritorno
> indietro è il file precedente **installato**, non tutti quelli numerati.
>
> **Ed è la prima versione a due numeri** — D14. Il vincolo dei tre nasceva
> perché i rilasci della serie 1.4 condividevano i primi due e si sarebbero
> sovrascritti; `pathfinder-1.6.html` e `pathfinder-1.7.html` sono già nomi
> distinti.

| | 1.5 — Campionamento GMP |
|---|---|
| `modules/compiti.ts` | Ottavo tipo **`CLEANING`**, che nessuno può chiedere: `tipiRichiedibili` lo tiene fuori da ogni tendina e `operazioneDi` risponde `null` — nasce chiuso, non c'è niente da lanciare |
| `core/store.ts` | **`logCleaningTask`**: un compito che nasce `done`, con richiesta e chiusura nello stesso istante. È l'unico punto del progetto in cui succede. A `feature.tasks` spento non scrive **e non solleva** |
| Maschera | Via «campione di riserva», entra la spunta della pulizia. **Con allergeni arriva segnata e bloccata**, e il valore vero passa da `cpCleanAuto` — un campo `disabled` non arriva al lettore |
| Ovunque | La pulizia sta **anche nel dettaglio del movimento**: un obbligo GMP non può dipendere da un interruttore |
| Verbale | **`_stampaVerbaleCampione`**, automatico alla conferma, con le condizioni di stoccaggio. Ristampa dal 🖨 sulle righe `SAMPLE` del registro movimenti |
| Rinomina | **Sposta → Trasferimento**: scheda di Movimenta, azione rapida, bottoni e modale dell'item, e la causale `MOV.MOVE` a registro |

| | 1.6 — Anagrafiche e parametri |
|---|---|
| `modules/parametri.ts` | **19 prove.** I valori di legge davanti e marcati `fissa`, gli aggiunti dietro; un codice aggiunto che ripete un fisso **sparisce invece di sostituirlo** — è così che D18 diventa impossibile da aggirare, non solo vietata |
| `modules/destinatari.ts` | **27 prove.** Chiave per partita IVA con ripiego sul nome normalizzato, destinazione per indirizzo, e `differenze` — la riga che si mostra prima di chiedere «permanente o spot» |
| Configurazione | Due schede nuove: **Parametri Articolo** e **Destinatari** |
| Anagrafica | Categoria precompilata coi primi 3 caratteri **e ferma appena qualcuno la tocca**; Fornitore → **Fornitore/Cliente**; i due pesi fuori (D15); **Pericolosità** accanto ad allergeni e certificazioni |
| Zone | Terzo attributo di destinazione d'uso: **zona pericolosa**, con le pericolosità ammesse |
| DDT | Un destinatario noto compila il documento; **più destinazioni si scelgono** da un selettore con overlay proprio (trappola 31); l'anagrafica si popola **dopo** il salvataggio, così un errore di rubrica non fa perdere un DDT |
| Excel | Colonna `Pericolosita` in import ed export; le voci aziendali passano la convalida e **entrano nel foglio «Valori ammessi»**, che senza quella riga avrebbe rifiutato ciò che l'anagrafica offre |
| Schema | **Ventesima collezione, `recipients`** — Dexie `version(9)`, `server/lib/schema.js`. `vat` **non** è indice unico: un DDT a un privato non ne ha una, e due `NULL` violerebbero il vincolo |

#### I tre difetti trovati nel browser, che tsc e 435 collaudi non vedevano

| | Difetto | Perché non lo prendeva niente |
|---|---|---|
| 1 | **Le certificazioni non si salvavano dalla maschera, da quando esistono.** `ARTICLE_ATTR_FIELDS` è una lista bianca e non le nominava: la maschera le mostrava, `_leggiAttributiArticolo` le rileggeva, `updateArticle` le buttava via **in silenzio** | Le certificazioni arrivano dall'**import Excel**, che passa da `upsertArticles` e le scrive: nessuno aveva mai avuto motivo di spuntarle a mano. `hazards` stava per prendere la stessa strada — è così che si è visto |
| 2 | **Le voci aziendali uscivano col codice al posto dell'etichetta**: «LATTOSIO» invece di «Lattosio», davanti a un operatore e **su un verbale**. `etichettaAllergene` conosce i 14 di legge e ripiega sul codice — il ripiego era corretto finché non c'era un quindicesimo | Nasce con D18, cioè con la riga scritta oggi. Adesso c'è `App._etAllergene`, un punto solo per sei chiamanti |
| 3 | **`recipients` non esiste finché il servizio non riparte.** Il client scrive, il servizio risponde «Collezione sconosciuta» — `schema.js` si legge **all'avvio** | Non è un difetto di codice: è un passo di installazione, e va scritto qui perché la 1.6 è **il primo rilascio che aggiunge una collezione a servizio acceso**. Il DDT si registra lo stesso e l'operatore viene avvisato: la rubrica non fa mai sembrare fallito un documento passato |

> **Provando la 1.6 ho scritto sul database di lavoro, e non doveva succedere.**
> `npm run dev` sulla 5199 parla col **servizio vero sulla 4173** — l'adapter
> remoto non guarda da quale porta arrivi la pagina. Tre scritture
> sull'articolo `123`, che è un articolo di prova: allergeni e certificazioni
> messi e poi tolti, il record è tornato **esattamente com'era** (`MP`, `PZ`,
> nessun attributo) e non è andato perso niente. Ma la regola della §8 —
> «non collaudare sul database di lavoro» — vale anche per `npm run dev`, e
> fin qui il documento parlava solo delle build: **la prova si fa su una
> copia, su una porta sua, con `PATHFINDER_DB` spostato.**

### 3septies. `feature.uom` era acceso, e nessun documento lo sapeva

**Riletto da `featureLog` la sera del 13/08, dopo aver installato la 1.6.** La
riga «Interruttori» diceva «gli altri quattro spenti» e non era vero da sei ore.

| Quando | Cosa | Chi |
|---|---|---|
| 13/08 10:31:06 | `tasks` **acceso** | `ANDS` |
| 13/08 12:32:41 | `uom` **acceso** | `ANDS` |
| 13/08 12:34:37 | `uom` spento | `ANDS` |
| 13/08 12:37:52 | `uom` **acceso** | `BABB` |
| 13/08 13:43:27 | `uom` spento | `BABB` |
| **13/08 13:54:36** | **`uom` acceso — ed è così adesso** | `BABB` |

**Cinque commutazioni in un'ora e mezza, da due operatori, tutte lo stesso
giorno in cui `tasks` era stato acceso** — cioè esattamente le due cose che la
§8 vieta: non accendere due interruttori nello stesso turno, e aggiornare la
riga «Interruttori» nello stesso gesto in cui si alza uno.

> **E spiega la nota di Andrea.** «Accendendo la funzione UOM, non la vedo
> funzionare correttamente, va riscritta» non è un'impressione: è il resoconto
> di qualcuno che l'ha accesa davvero, e cinque volte. La nota e questo log
> sono lo stesso fatto visto da due parti.

**Cosa vuol dire adesso.** La 1.6 gira con `uom` **acceso**, quindi gli
operatori hanno davanti la gestione a unità di misura che PIANO §9.4 dichiara
da rifare, e ce l'avranno fino alla **1.7**. Due strade, ed è una decisione di
Andrea:

- **spegnerlo fino alla 1.7** — Configurazione → Funzioni, col PIN del Team
  Leader. Il magazzino torna a soli colli, che è come ha lavorato fino a ieri;
- **tenerlo acceso e raccogliere cosa sbaglia** — ogni difetto visto adesso è
  una riga in meno da indovinare quando si riscrive.

**Non è stato toccato**: alzare o abbassare un interruttore è un gesto di chi
governa il magazzino, non un effetto collaterale di un rilascio. Ed è la stessa
ragione per cui installare non è accendere.

### 4bis. Il PIN del Team Leader smarrito — come si esce, e come si evita

**Perché non c'è una via dall'applicativo, ed è voluto.** Il PIN non è
conservato in chiaro da nessuna parte: sul disco resta l'impronta SHA-256 con
un sale casuale, e lo stesso vale per i backup JSON — `modules/auth.ts`. Non
è recuperabile perché non esiste da nessuna parte da recuperare. Il rinnovo
lo autorizza un Team Leader col proprio PIN, e se il Team Leader è uno solo
il cerchio si chiude su se stesso.

**Si esce dal dato, che è l'unico posto dove il problema esiste.** Si scrive
una nuova impronta sul record dell'operatore, usando la rotta del servizio
che la calcola — così il sale e l'algoritmo restano quelli dell'applicativo
e non se ne inventa un altro. Due passi, da fare **da Andrea**, scegliendo
lui il PIN nuovo:

```powershell
$nuovo = Read-Host 'PIN nuovo a 6 cifre' -AsSecureString
$pin = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($nuovo))
$campi = Invoke-RestMethod -Uri http://127.0.0.1:4173/api/op/hashPin -Method Post -ContentType 'application/json' -Body (@{pin=$pin} | ConvertTo-Json)
Invoke-RestMethod -Uri http://127.0.0.1:4173/api/c/operators/OP-MSRA0ENS-4JDF -Method Patch -ContentType 'application/json' -Body ($campi | ConvertTo-Json)
```

> **La chiave di `operators` è `op_id`, non le iniziali** — `types/collezioni.ts`.
> **`OP-MSRA0ENS-4JDF` è `ANDS` sul database di adesso**, riletto il 13/08 a
> mezzogiorno. Fino a poche ore prima questo documento diceva
> `OP-MSNAWVON-NTZL`, che sul database di adesso **non esiste più**: il record
> è stato rifatto la mattina del 13/08. Copiare la riga di ieri avrebbe creato
> un secondo operatore `ANDS` senza dare errore — trappola 29 — e il PIN
> sarebbe finito su un record che nessuno usa.
>
> **Quindi si rilegge sempre, non si copia**, ed è un comando solo:
> `Invoke-RestMethod http://127.0.0.1:4173/api/c/operators`.
>
> Il secondo comando scrive `pin_salt`, `pin_hash` e `pin_set_at`, e non
> tocca nient'altro del record. Il PIN non passa mai da un file: `Read-Host
> -AsSecureString` non lo lascia nella cronologia della shell.

**E poi si toglie la causa, che è un'altra cosa dal sintomo: SERVE UN SECONDO
TEAM LEADER.** Un solo `leader` su un applicativo che usa il PIN come unica
identità è un punto singolo di rottura, e oggi ha rotto davvero. Promuovere
`DAPE`, o creare una seconda sigla di riserva, costa un minuto e chiude
l'aperto per sempre — da Configurazione → Operatori → ✏, col PIN appena
rinnovato.

**Vale la pena chiedersi se l'applicativo debba dirlo.** Oggi non avvisa
nessuno che i Team Leader sono uno solo. Una riga in Configurazione →
Operatori che lo segnala sarebbe piccola, e questo pomeriggio sarebbe
servita. **Non è stata scritta**: è fuori dal perimetro della 1.4.3, e si
decide a mente fredda.

### I cinque comandi — **la 1.6 li ha percorsi tutti e cinque, il 13/08 sera**

> **Com'è andata, e la cosa nuova da sapere.** Passi 1 e 2 da una shell
> qualunque: backup in `C:\Pathfinderackup` e `pathfinder-1.6.html` in
> radice. Il passo 3 **respinto** dalla shell normale, come ogni volta —
> «Accesso al Registro di sistema non consentito». Chiuso lanciando i passi 3 e
> 4 insieme da un `Start-Process powershell -Verb RunAs`, cioè con un UAC
> accettato a mano: la variabile è di macchina e l'attività gira come SYSTEM.
>
> **Il riavvio del passo 4 non è più solo un riavvio.** Da questa versione è
> anche il momento in cui `recipients` viene creata: `server/lib/schema.js` si
> legge all'avvio, e prima del riavvio il client scriveva contro un servizio
> che rispondeva «Collezione sconosciuta». Chi salta il passo 4 non installa a
> metà — installa una funzione che non c'è.
>
> **La revisione del database era 22745 prima e dopo**: il rilascio non ha
> scritto una riga.

### I cinque comandi — il modello, con i numeri della 1.4.3.1

> **Stato al 13/08, mezzogiorno.** Backup fatto
> (`C:\Pathfinder\backup\pathfinder-2026-08-13.db`), file costruito e copiato
> in radice. **I passi 3 e 4 sono stati tentati e respinti** — «Accesso al
> Registro di sistema non consentito» e «Accesso negato» — perché la variabile
> è di macchina e l'attività gira come SYSTEM. Servono da una finestra
> elevata, ed è esattamente ciò che questa sezione dice da due versioni.

Da **PowerShell come amministratore** (il servizio gira come SYSTEM), **a fine
turno** e **con un backup fresco davanti**. Si rifanno tali e quali per la versione
dopo, cambiando il numero in due punti: il passo 2 e il passo 3.

I passi 1 e 2 non cambiano niente per chi lavora: il file nuovo in radice non è
servito finché `PATHFINDER_APP` non ci punta. **Il rilascio vero sono i passi 3 e
4**, e servono privilegi di amministratore per entrambi — la variabile è di
macchina e le attività girano come SYSTEM.

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:4173/api/backup -Method Post `
  -Body (@{dir='C:\Pathfinder\backup'} | ConvertTo-Json) -ContentType 'application/json'
```

```powershell
cd "C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER"
Copy-Item "Pathfinder 1.4\pathfinder-1.4.3.1.html" pathfinder-1.4.3.1.html
```

```powershell
[Environment]::SetEnvironmentVariable('PATHFINDER_APP',
  'C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER\pathfinder-1.4.3.1.html','Machine')
```

```powershell
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
```

```powershell
Invoke-RestMethod http://127.0.0.1:4173/api/app-info
```

Se `app_file` non è la versione attesa, o `bytes` non corrisponde, il servizio sta
servendo un'altra cartella: non insistere, leggere il README §9.

| Versione | `app_file` | `bytes` | Dove sta |
|---|---|---|---|
| 1.2 | `pathfinder-1.2.html` | 1.486.348 | archivio |
| 1.4.0 | `pathfinder-1.4.0.html` | 1.493.517 | archivio |
| 1.4.1 — costruita, mai installata | `pathfinder-1.4.1.html` | 1.526.393 | mai esistita in radice |
| 1.4.2 | `pathfinder-1.4.2.html` | 1.541.133 | archivio |
| 1.4.2.1 — in magazzino 25 minuti | `pathfinder-1.4.2.1.html` | 1.578.609 | archivio |
| **1.4.3** — il ritorno indietro della 1.4.4 | `pathfinder-1.4.3.html` | **1.578.603** | **radice** |
| 1.4.3.1 — in magazzino qualche ora, **cancellata per errore** | — | 1.579.414 | **non esiste più** |
| **1.4.4** — il ritorno indietro della 1.6 | `pathfinder-1.4.4.html` | **1.587.378** | **radice** |
| **1.6** — in magazzino adesso, e contiene la 1.5 | `pathfinder-1.6.html` | **1.625.239** | **radice** |

> **QUESTA VERSIONE HA AVUTO TRE FILE IN UNA NOTTE, e vale la pena sapere
> perché — è la storia di come non si fa.**
>
> È nata **1.4.2.1**, col quarto numero, perché non era nel piano: i commit
> del 12 e 13/08 la chiamano ancora così, e i commenti nel codice pure. Il
> primo file, 1.578.041 byte, è stato installato e poi **sovrascritto la
> stessa notte** per una correzione tutta CSS — la freccia delle tendine, che
> si ripeteva per tutta la larghezza del campo. Stesso nome, 1.578.609 byte:
> due contenuti diversi sotto lo stesso numero di versione. Poi ha preso il
> numero pianificato successivo ed è diventata **1.4.3**.
>
> **La sovrascrittura è l'errore, non il rinumero.** Chi verifica
> un'installazione confronta `app_file` **e** `bytes`: da quel momento vale
> solo l'ultimo, e un foglio stampato mezz'ora prima dice il numero sbagliato.
> Si è potuto fare perché era notte fonda, gli interruttori erano spenti e non
> l'aveva ancora usata nessuno — tre condizioni che non si ripetono spesso.
> **Una correzione, anche di una riga di CSS, prende un numero suo.**

**Il ritorno indietro sono due passi, dal 13/08.** Prima si ripesca il file
dall'archivio, poi si rimette la variabile e si riavvia: INDEX §7bis ha i
comandi. Il database non viene toccato. La 1.2 rilegge il database della
1.4: lo provano le 8 prove di `collaudo-migrazione-1.4.js`, non una speranza.

> **E se una delle due funzioni desse fastidio, prima di tornare indietro c'è
> un gesto più piccolo: spegnere il suo interruttore.** Un rilascio si disinstalla, una
> funzione si spegne — e le due cose si confondono solo se si accendono
> insieme. Per questo si installa un turno e si accende quello dopo.

### Chiusi — non riaprirli

| Cosa | Origine | Come è finita |
|---|---|---|
| Backup automatico serale del `.db` | 1.0 §7.5 | **Fatto**: `backup-serale.ps1`, attività pianificata alle 20:00 |
| Database fuori da OneDrive | 2.0 Fase 0 | **Fatto**: `C:\Pathfinder\data\`, `PATHFINDER_DB` esplicito |
| Git e repository privato | 2.0 Fase 0 | **Fatto** |
| HTTPS *nel codice* | 1.0 §7.2 | **Fatto**: due variabili e si accende. Manca solo il certificato (aperto 4) |
| `persistence/{local,remote}` in TypeScript | 1.2 §6.4 | **Fatto** (1.3) |
| `modules/` in TypeScript | 1.2 §6.4 | **Fatto**: tutti e otto (1.3) |
| Collaudi geometria ubicazioni e parser ODP | 1.2 §6.5 | **Fatto**: 16 + 26 prove (1.3) |
| La cartella `HANDSOFF` con la esse di troppo | 1.2 §6 | **Fatto** (1.3) |
| Allergeni: quali tracciare | PIANO-1.4 A1 | **Chiuso**: i 14 dell'Allegato II, segregazione per zona |
| Classi di temperatura | PIANO-1.4 A2 | **Chiuso**: `SURG` −18 · `REFR` +4/+8 · `AMB` +18/+25 |
| Portare la 1.2 in magazzino | 1.2 §6.6 · 1.3 §6 | **Fatto 11/08**: cinque comandi, `/api/app-info` lo conferma |
| `pathfinder-1.1.html` in radice e in archivio | 1.2 §6 · 1.3 §6 | **Fatto 12/08**: la radice serve la 1.2, la copia morta è uscita |
| Schede grafico che tagliano ~6 px | 1.0 §7.3 | **Chiuso 12/08**: vanno bene così, non è un difetto da inseguire |
| Elenco causali di trasporto | 1.0 §7.4 | **Chiuso 12/08**: le nove di serie sono validate |
| Prefisso aziendale GS1 | PIANO-1.4 §4.3 | **Chiuso 12/08**: non è un'attesa, è un parametro di Configurazione (D7) |
| Chi alza la priorità di un compito | PIANO-1.4 §4.1 | **Chiuso 12/08**: solo il Team Leader (D4) |
| `ARCHIVIO/LOGHI/` — file doppi e nomi generati | 1.2 §6 · 1.3 §6 | **Fuori perimetro 12/08**: non è un compito del progetto |
| Collaudi su `_applyToCache` | 1.3 §6.5 | **Fatto 12/08**: 19 collezioni dichiarate, `resetAll` le pulisce tutte |
| Portare la 1.4.0 in magazzino | 1.4 §4 | **Fatto 12/08**: build, prova nel browser su copia del database vero, cinque comandi, `/api/app-info` lo conferma |
| Portare la 1.4.1 in magazzino | 1.4 §4 | **Assorbito**: non è mai entrata da sola, è dentro la 1.4.2 |
| Portare la 1.4.3 in magazzino | 1.4 §3 | **Fatto 13/08**: provata prima su una copia del database vero, poi i cinque comandi. Nata 1.4.2.1, ha preso il numero al rilascio |
| Riordinare la radice e archiviare le versioni vecchie | 13/08 | **Fatto 13/08**: in radice resta il solo file servito; 1.2, 1.4.0, 1.4.2 e 1.4.2.1 in `ARCHIVIO/VERSIONI PRECEDENTI/`. Il ritorno indietro costa un passo in più — INDEX §7bis |
| Portare la 1.4.2 in magazzino | 1.4 §4 | **Fatto 12/08, 21:47**: backup, copia in radice, variabile, riavvio, verifica. Revisione del database 22418 prima e dopo: l'installazione non ha scritto niente |

---

## 5. Decisioni permanenti

Non si rimettono in discussione. Fonte fra parentesi.

### Architettura e dati
1. **Niente lavoro offline.** Se il servizio non risponde l'app si ferma e lo dice, a schermo intero. Niente code da risincronizzare (1.0 §4.1).
2. **Un solo database condiviso**, più terminali in rete. L'arbitro fra terminali è il server (1.0 §4.2).
3. **Attività pianificata, non servizio Windows nativo**: NSSM è il file che l'antivirus blocca alle sette di mattina (1.0 §4.3).
4. **Documento JSON con colonne materializzate.** Si indicizza solo ciò che Dexie indicizzava; il resto vive in `data`. È il motivo per cui un campo nuovo non è una migrazione (1.0 §4.4).
5. **Servizio on-prem.** Niente Azure SQL, niente Redis, niente Static Web Apps: la concorrenza è già arbitrata da una transazione SQLite dentro `/api/op/…` (1.2 §3.4).
6. **Niente Entra ID.** Si resta al PIN/QR: MSAL non funziona su `file://` e rimetterebbe la dipendenza dalla WAN (1.2 §3.2).
7. **Sage X3 fino al 2038.** Nessun adapter D365: resta solo la cucitura, il parser dietro un'interfaccia (1.2 §3.3).

### Build e forma
8. **Il sorgente si scompone, la distribuzione si ricompone**: un file solo resta la forma in cui l'applicativo arriva in magazzino (1.2 §3.1).
9. **Il CSS non si minifica**: toglieva 413 caratteri su 146.368 e riscriveva le regole (1.2 §3.5).
10. **La copia a file singolo lavora in sola lettura** (1.2 §3.6).
11. **`checkJs` spento sul client, acceso sul servizio** (1.2 §3.7).
12. **I tipi non fanno cambiare il codice**: dove tipo e codice litigano, cede il tipo (1.2 §3.8).
13. **`_format` del pacchetto di export non segue la versione dell'applicativo**: descrive la forma del file. A muoversi è `_appVersion` (1.3 §5.4).

### Metodo
14. **Un blocco per commit**, con build e collaudo in mezzo. Chi sposta non corregge (1.2 §5.1).
15. **I collaudi si scrivono prima** della conversione, non dopo (1.3 §5.1).
16. **Un collaudo si prova rompendo il codice** e vedendolo fallire (1.2 §4.1 · 1.3 §5.2).
17. **I documenti si rileggono, non si ricostruiscono**: le ristampe partono dallo snapshot archiviato (1.0 §9.5).

### 1.4.1 (12/08)
34. **La priorità di un compito cresce col numero — 1 Bassa, 4 Urgente — e un
    operatore non supera Normale.** La D4 chiude il varco della modifica; il
    tetto alla creazione chiude l'altro. Senza, si aprirebbe tutto a 4.
35. **Da uno stato chiuso — `done`, `cancelled` — non esce nessuna
    transizione.** Un compito concluso è un fatto: se si è sbagliato se ne
    apre un altro.
36. **Un annullamento pretende il motivo.** Un compito che sparisce senza
    ragione, fra un mese, non dice se era sbagliato o solo scomodo.
37. **Le durate non contano gli annullati**, l'attesa sì: in coda ci sono
    stati davvero, ma non li ha lavorati nessuno.

### 1.4.3 (12-13/08) — confermate da Andrea prima di scrivere una riga
43. **Lo schedulatore LANCIA il lavoro, non lo affianca.** L'avvio apre la
    funzione di Movimenta precompilata, e un compito si chiude solo perché
    un movimento è stato confermato. Quello che nella 1.4.1 sembrava un
    difetto — «completare non muove i colli» — era il disegno di allora.
44. **L'urgenza della scadenza si CALCOLA, non si scrive.** Sotto la soglia
    la coda tratta il compito come urgente; il record tiene la priorità di
    chi l'ha chiesta. È l'unico modo di far maturare l'urgenza lasciando
    vera la D4 — «la priorità la alza solo il Team Leader». La soglia è un
    parametro di Configurazione, 4 ore di serie.
45. **I parziali lasciano il residuo.** 12 chiesti, 5 mossi: ne restano 7 e
    il compito resta aperto. Il richiesto sta nel payload e non cambia mai,
    perché è la richiesta; `qty_done` cresce a ogni movimento.
46. **Un avvio che non ha prodotto niente torna in carico**, e `started_at`
    si azzera. È l'unico punto del progetto in cui si cancella un istante
    già scritto: un avvio che non ha mosso un collo non è storia, è un
    ripensamento.
47. **Il campionamento non muove i colli: muove ciò che c'è dentro.**
    Causale `SAMPLE`, la quindicesima; il logbook è il registro filtrato su
    quella causale — nessuna collezione nuova. Sugli articoli senza quantità
    per collo non cala niente, **e non è un problema**: oggi i prelievi di
    campione non li scarica nessuno, quindi documentarli è già più di quel
    che c'è, e la condizione si scioglie da sola man mano che l'operatività
    popola l'anagrafica (Andrea, 13/08).
48. **Una quantità DICHIARATA si convalida, una DERIVATA si tronca.** Un
    campione più grande della giacenza viene respinto; un prelievo derivato
    dai colli si adatta a ciò che c'è. È la stessa regola della 1.4.2,
    applicata al campionamento.

### 1.4.3 — prese scrivendo i blocchi 4-6 (13/08)
49. **Il residuo lo scala la MASCHERA, non il registro dei movimenti.**
    `_logMov` è il collo di bottiglia da cui passano trentotto chiamanti, e
    agganciarci l'avanzamento avrebbe servito sei flussi con una riga sola.
    Non regge: su uno spostamento totale `MOV.MOVE` scrive `qty_delta: 0`,
    perché a cambiare è l'ubicazione e non la quantità. Quanti colli si
    siano mossi lo sa chi li ha mossi. Dal registro arrivano solo gli `_id`,
    che è l'unica cosa che il registro sa davvero.
50. **Ogni maschera dichiara quali tipi di attività può servire** —
    `_taskAvanza(colli, ['PUTAWAY'])`. Dentro Movimenta si cambia scheda con
    un click, e senza questa riga un posizionamento chiuderebbe uno
    smaltimento avviato.
51. **Il prelievo si chiude all'EVASIONE del DDT, non alla registrazione**, e
    il filo è `task_id` sul documento. È l'unico dei sei che non si chiude
    nella sessione che l'ha aperto: fra il documento e il ritiro del vettore
    ci stanno dei giorni, e in mezzo un riavvio. Una sessione aperta non
    sopravvive alla notte; un campo sul documento sì.
52. **«Completa» a mano la vieta STORE, non solo la UI.** Nascondere il
    pulsante sarebbe bastato a video e non sul database, e l'interruttore è
    una promessa sul database. Le sette che muovono merce si chiudono perché
    un movimento è stato confermato; la Conta no, e per lei il pulsante
    resta — è l'unica che può concludersi senza produrre una riga.
53. **Un campione vale UN collo di residuo.** Chi ne ha chiesti tre passa
    dalla maschera tre volte, ed è giusto: sono tre prelievi distinti, con
    tre righe di registro e tre destinatari possibili.
54. **Il campo dei colli nel Cambio Ubicazione compare SOLO sotto
    un'attività.** Fuori di lì il cambio sposta il lotto intero, ed è così da
    sempre: aggiungere un campo a un flusso che dieci volte al giorno non lo
    chiede è il modo di far sbagliare chi lo usa a memoria.

### 1.4.4 (13/08) — scritte dall'uso, non dal piano
58. **UN COMPITO SI CHIUDE IN DUE MODI, E IL TIPO DICE QUALE.** *A residuo*
    — Trasferimento, Smaltimento — quando i colli chiesti sono stati mossi.
    *A gesto* — i due prelievi, Quarantena, Campionamento, Conta — quando
    l'operazione è confermata, e il conteggio non decide niente. La regola
    sta in `chiudeAlGesto`, e chi aggiunge un tipo deve dire in quale
    famiglia sta: c'è una prova che glielo chiede.
59. **IL PRELIEVO SI CHIUDE ALLA REGISTRAZIONE DEL DDT — la 51 è
    ribaltata.** Il lavoro dell'operatore finisce col documento; l'evasione
    è il ritiro del vettore, giorni dopo, e **non è un'attività dello
    schedulatore né ne genera una**. La 51 diceva il contrario e si
    appoggiava a un `task_id` che si spezzava se la sessione moriva prima
    del salvataggio: la ragione organizzativa e quella tecnica dicevano la
    stessa cosa.
60. **IL POSIZIONAMENTO NON È UN COMPITO.** Avviene in coda
    all'accettazione, che su Pathfinder non passa. La funzione «Posiziona»
    di Movimenta resta: a uscire è il tipo, non l'operazione.
61. **LA CONTA È UN INVENTARIO MIRATO A UNA RIGA**, con la finestra di guida
    a tre scansioni, e si chiude alla conferma **anche a zero correzioni**.
    L'inventario di vano esiste già in Movimenta e non chiude nessun
    compito. **Il numero di sistema non si mostra prima di aver contato**:
    un inventario che suggerisce la risposta non verifica niente.
62. **«Completa» a mano non esiste più per nessun tipo.** Era rimasto per la
    sola Conta; adesso che anche lei si chiude confermando, `completeTask`
    pretende sempre `_chiusuraAmmessa` e l'unica strada è `advanceTask`.
63. **ARTICOLO E LOTTO NON SI MAIUSCOLANO: SONO UNA CHIAVE.** Insieme fanno
    `item_key`, e maiuscolarli non è normalizzare, è riscrivere la chiave —
    un lotto `qwert` diventava `QWERT` e il compito puntava a una riga che
    non esiste. Si scrivono come stanno nella giacenza scelta.

### 1.4.3.1 (13/08) — dalla prima mezza giornata di uso vero
55. **Una finestra che se ne apre un'altra sopra deve avere un id SUO.**
    `showModal` usa un id fisso e `closeModal` chiude «il primo che trova»:
    finché in pagina c'è una modale sola funziona, e la prima che se ne apre
    due chiude quella sbagliata. Il selettore 📍 ha `pickLocOverlay` e
    `_closePickLoc()`, come `_showReleaseDestDialog` ha il suo da sempre.
    **Non è stato rifatto lo stack delle modali**: sarebbe stato toccare
    trenta maschere per due difetti, e chi sposta non corregge (§7.14).
56. **Un campo che non serve a un tipo si NASCONDE E SI SVUOTA.** Nasconderlo
    e basta lascia il valore nel DOM, e `doCreateTask` legge il campo, non la
    sua visibilità: una destinazione digitata su un trasferimento e poi
    cambiata in smaltimento finiva nel payload. È la stessa forma della
    decisione 52 — la UI che nasconde non è la regola, la regola sta sotto.
57. **Quali tipi vogliono una destinazione lo dice il CONSUMATORE, non il
    buon senso.** `vuoleDestinazione` è vera per Trasferimento e
    Posizionamento perché sono i due modi in cui `_taskLancia` legge
    `payload.to` — `pCambioDest` e `mInLoc`. Una regola per tipo si scrive
    guardando chi legge il dato, e si mette in `modules/compiti.ts` con le
    sue prove, non nella maschera.

### 1.4.2 (12/08)
38. **Il collo incompleto NON è una riga di giacenza sua.** `inventory` ha
    l'indice composto `[location_code+item_key]` e tutto Store è scritto sopra
    l'idea che quella coppia identifichi UNA riga: due righe sulla stessa
    ubicazione per lo stesso articolo/lotto sono la strada più corta per un
    saldo sbagliato ma plausibile. Una riga — `qty: 11`, `qty_uom: 10100` — e
    il resto si calcola (piano §4.2).
39. **La confezione del lotto vince sull'anagrafica, sempre.** Si congela al
    primo posizionamento ed è un fatto già successo: i colli a scaffale sono
    imballati come allora. L'anagrafica si legge solo per il lotto che non è
    mai stato posizionato.
40. **Le UM dichiarate si convalidano, quelle derivate si troncano.** Un numero
    digitato che non torna fa saltare il prelievo; una derivazione che non
    torna può esistere solo su una riga già incoerente, e bloccare un prelievo
    fisico perché un dato è vecchio è peggio del dato vecchio. Lo scarto lo
    mostra `verificaUom` — che non corregge niente, perché correggere un saldo
    senza che nessuno abbia guardato la merce è il modo di scriverne uno
    sbagliato ma plausibile.
41. **UNA COLONNA UM SOLA, E UNA QUANTITÀ PER COLLO SOLA** — *da confermare, è
    l'unica scelta di questa versione che il piano non prevedeva.* Il piano
    §4.2 chiedeva due campi nuovi sull'articolo, `uom` e `uom_per_collo`. Ma
    **`unit` esiste dalla v1 ed è già etichettato «UM»** nella maschera
    dell'anagrafica, nella tabella articoli e nella colonna `UM` dell'export; e
    `pieces_per_pack` esiste dalla v3.0.0 ed è già la quantità per collo, con
    la sua colonna `Pezzi_Per_Collo`. Aggiungerne altri due sarebbe stato
    quattro campi e due colonne con lo stesso nome — cioè la cosa che il piano
    vieta due righe più su per i pezzi. Quindi: si leggono quelli, e i nomi del
    piano restano come **alias** per chi li avesse già in un foglio. `unit` è
    testo libero da sempre e ciò che non è una delle cinque unità si legge come
    «non gestita»; il `PZ` predefinito di mezza anagrafica non scrive niente
    finché nessuno compila la quantità per collo.
42. **Le UM escono dentro la stessa transazione dei colli.** Le due rotte
    composte del servizio arbitrano fra terminali: dalla 1.4.2 i numeri da
    tenere insieme sono due. Il saldo di partenza si legge dalla RIGA, non da
    ciò che manda il client — `qty_uom_before` è solo un seme per la riga che
    un `qty_uom` non lo ha mai avuto, e vale una volta.

### 1.4
18. **Il WIP resta nella 1.4** (1.4.6, installato il 19/12 a interruttore spento).
19. **Verifica dell'andamento il 31/10**, con la scala di cosa togliere già decisa.
20. **Allergeni:** i 14 dell'Allegato II del Reg. UE 1169/2011. Elenco chiuso.
21. **Temperature:** `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C.
22. **Lettura stretta**, non tollerante: i valori arrivano convalidati da Excel.
23. **La cella Riservata ammette allergeni** — deroga esplicita, contata ed elencabile. Sulla temperatura non deroga.
24. **Ogni campo nuovo è facoltativo**, e assente significa «come nella 1.2».
25. **La priorità di un compito la alza solo il Team Leader** (12/08, D4).
26. **La UDC nasce su comando e muore quando è vuota**: lo svuotamento è automatico, la creazione no. Il record resta come storia, e `udc_id` non si riusa mai (12/08, D5).
27. **L'etichetta si stampa alla creazione della UDC**, non dopo. Non è più una cosa che si può togliere dal calendario (12/08, D6).
28. **Il prefisso GS1 è un parametro di Configurazione**: vuoto → codice interno, compilato → SSCC. Il giorno che arriva nessuno installa niente (12/08, D7).
29. **Le certificazioni sono il terzo attributo dell'articolo.** Il loro elenco NON è chiuso — non è una norma, è una richiesta commerciale — ma la lettura resta stretta (12/08, D8).
30. **Temperatura, allergeni e certificazioni si vedono dove la merce si tocca**: prelievo guidato, report ODP, DDT. Una sorgente sola per le tre viste (12/08, D9).
31. **Gli interruttori `feature.*` sono una chiave per una in `meta`**, non un unico record: accenderne due nello stesso turno deve costare due gesti distinti.
32. **Le etichette UDC si stampano dal browser**, `100 × 80 mm` su foglio A4 — stessa strada di DDT e report, `@page` e CSS in `mm`. Niente rotta sul servizio, niente ZPL, niente configurazione per macchina (12/08, D12).
33. **Non si scende nessun gradino della scala in anticipo** (12/08, D11). Il segnale era la fine della conversione di `store.js`, che è arrivata **il 12/08 invece che il 19/09**: la 1.4.0 chiude con un mese di margine, e la scala resta intatta.

---

## 6. Trappole già pagate

### Ambiente e strumenti
1. **PowerShell distrugge gli accenti.** `Get-Content`/`Set-Content` in WinPS 5.1 leggono e scrivono in CP1252: un giro su un `.ts` UTF-8 trasforma `Quantità` in `QuantitÃ `. Per riscrivere in blocco si passa da Node in **UTF-8 senza BOM, LF**. I due `.ps1` invece **hanno** il BOM e va lasciato.
2. **Il dev server parla col magazzino vero**: `vite.config.js` rimanda `/api` a `127.0.0.1:4173`. Per provare senza toccare niente, **`?db=local`**.
3. **Il servizio gira come SYSTEM**: non si ferma da una shell normale. Per collaudare, seconda istanza su un'altra porta con `PATHFINDER_DB` temporaneo (1.0 §5.3).
4. **Le attività pianificate come SYSTEM sono invisibili** da una finestra normale: `Get-ScheduledTask` le omette **in silenzio** (1.2 §4.2).
5. **Modificare i file del server non basta**: Node carica all'avvio, il servizio va riavviato (1.0 §5.4).
6. **`better-sqlite3`** va tenuto a una versione con binario già compilato per il Node installato (1.0 §5.5).
7. **Percorsi Windows oltre 260 caratteri**: `npm install` è il primo a romperlo. Installare in `C:\Pathfinder\app` (1.3).
8. **I backtick nei messaggi di commit** vengono interpretati dalla shell: heredoc con apici (1.2 §4.5).

### Codice
9. **`CREATE TABLE IF NOT EXISTS` non aggiunge colonne**, e il `CREATE INDEX` dopo muore nel costruttore: il servizio non parte affatto. Era il bloccante della PIANO-1.4 §1, **tolto il 12/08** con `PathfinderDB._migra`. Resta scritto qui perché la ragione per cui `createTableSQL` e `createIndexSQL` sono due funzioni e non una è esattamente questa: **non rimetterle insieme.**
9bis. **Il collaudo della migrazione costruisce lo schema di ieri togliendo le aggiunte a `schema.COLLECTIONS`** e poi le rimette. Chi aggiunge una collezione alla 1.4 la aggiunga anche all'elenco `NUOVE` di `collaudo-migrazione-1.4.js`, se no la prova gira su due schemi identici e non prova niente.

20. **Un modulo importato con due specificatori diversi è due moduli.** Rinominato `store.js` in `store.ts`, Vite ha continuato a servire anche `/src/core/store.js` — risolvendolo, ma sotto un id diverso. In pagina c'erano **due Store**: la dashboard leggeva quello che nessuno scriveva. Tsc verde, 208 collaudi verdi, applicativo sbagliato. Gli import di un modulo TypeScript si scrivono **senza estensione**, come fanno già `./cache`, `./geometria`, `./persistence/index` (12/08).
21. **Il pacchetto di export era una finestra sulla cache, non una fotografia.** Conteneva il riferimento agli array veri: `Vault.runBackup` fra `exportAll()` e la serializzazione legge tutto il registro, e un backup si fa mentre qualcuno lavora. `_counts` si calcola subito e il contenuto si legge dopo — quindi il pacchetto falliva la **propria** verifica. Ora `componi` copia gli elenchi (12/08).
22. **`meta` non è un sacco: `_loadCache` la ricostruisce campo per campo.**
    Scrivere una chiave nuova con `Persistence.put('meta', …)` funziona, e
    funziona anche in cache — finché qualcuno non ricarica. Al primo
    `reloadCache` la chiave sparisce, perché `_loadCache` monta l'oggetto
    `meta` con i campi che conosce e ignora gli altri. È successo con
    `featureLog` (12/08): chi aggiunge una chiave a `meta` la aggiunga anche
    lì, o avrà scritto un dato che il database ha e la pagina no.
23. **Una maschera che chiede l'identità in fondo la chiede troppo tardi.**
    La richiesta di attività si apriva anche senza operatore identificato, e
    moriva con «manca la sigla di chi richiede» a modulo già compilato. Vale
    ovunque si scriva una sigla: la si pretende prima di aprire la maschera,
    come fa la presa in carico.
24. **UNO SPOSTAMENTO È UN `removeItem` SEGUITO DA UN `addItem`, e il secondo
    inventa le UM.** `addItem` deriva il totale da colli PIENI: spostare 11
    colli da 10.100 pz da uno scaffale all'altro ne riscriveva **11.000**.
    Novecento pezzi comparsi dal nulla, senza un errore e senza un avviso, su
    un movimento che l'operatore fa dieci volte al giorno — il saldo sbagliato
    ma plausibile, in persona. Vale per gli spostamenti, le quarantene, il
    rilascio, gli storni e **ogni `addItem` che rimette a posto qualcosa appena
    uscito**: si passa da `App._umMossa(removed)`. Né `tsc` né 331 prove lo
    avevano visto; l'ha visto la prova nel browser (12/08).
25. **`Articolo.unit` è già la UM, e `pieces_per_pack` è già la quantità per
    collo.** Prima di aggiungere un campo a un'anagrafica di trent'anni,
    guardare come si chiamano le etichette della maschera: `unit` compare come
    «UM» in tre posti diversi. Il piano chiedeva due campi nuovi; sarebbero
    state due colonne con lo stesso nome nello stesso foglio Excel — §5.41.
26. **Una maschera che modifica un campo diverso da quello che il codice legge
    è una bugia a video.** `configurazione()` dava la precedenza a
    `uom_per_collo`, che nessuna maschera e nessuna colonna Excel scrivono: un
    articolo importato con quel campo si comportava in un modo e ne mostrava un
    altro nella maschera che si apre per correggerlo. L'ordine è stato
    invertito. Trovato aprendo la scheda di un articolo, non collaudandolo.
27. **Un collaudo sui decimali che passa anche col codice rotto.** «5,5 meno
    0,1 meno 0,2 fa 5,2» passa, ma passa anche togliendo del tutto
    l'arrotondamento: quei tre numeri cadono esatti in virgola mobile. Il
    numero che serve è `0,3 − 0,1`, che vale 0,19999999999999998. È la
    trappola 17 arrivata addosso mentre la si applicava — **scegliere i valori
    di prova guardando dove il difetto vive, non dove è comodo.**
28. **`MOV.MOVE` scrive `qty_delta: 0` su uno spostamento totale**, e non è
    un difetto: a cambiare è l'ubicazione, non la quantità. Chi legge il
    registro per sapere quanti colli si sono mossi trova zero, e su un
    parziale trova un numero negativo. È la ragione per cui l'avanzamento di
    un'attività non passa da lì — decisione 49 (13/08).
29. **Un `PATCH` su una chiave che non esiste CREA il record invece di dare
    errore.** Vale su tutte le collezioni, e la chiave non è quella che si
    ha in mente: `operators` è a `op_id`, non a `initials`; `tasks` è a
    `task_id`. Prima di una PATCH scritta a mano, leggere la collezione e
    guardare la chiave vera — `types/collezioni.ts` è la sorgente unica
    (13/08).
30. **Un solo Team Leader è un punto singolo di rottura, e il 13/08 ha
    rotto.** Il PIN non è recuperabile per costruzione — impronta e sale, mai
    il chiaro — e il rinnovo lo autorizza un Team Leader col proprio PIN: con
    uno solo, il cerchio si chiude su se stesso e nessuno crea più un
    operatore. Si esce solo dal dato, §4bis. **Tenerne due, sempre.**
31. **DUE ELEMENTI CON LO STESSO `id` NON DANNO ERRORE: `getElementById`
    restituisce il primo e il secondo diventa invisibile al codice.**
    `showModal` appende sempre `id="modalOverlay"`; il selettore 📍 aperto da
    dentro la maschera di creazione ne creava un secondo, e `closeModal()`
    chiudeva **la maschera sotto** lasciando in piedi il selettore. A video
    sembra che la finestra si chiuda da sola. Non l'ha vista né `tsc` né
    nessun collaudo, e non poteva: è una collisione di id fra due componenti
    che per otto punti su nove non si incontrano mai — gli altri 📍 stanno in
    maschere **in linea**, non in modali. **Chi apre una finestra sopra
    un'altra le dia un id proprio e una chiusura propria** (13/08).
32. **Un dato scritto dalla maschera che l'utente non vede più è comunque un
    dato scritto.** Il campo «A» nascosto conservava il valore, e
    `doCreateTask` lo leggeva: uno smaltimento nasceva con una destinazione.
    Nascondere è una cosa a video; il payload è storia — decisione 56 (13/08).
33. **UNA REGOLA DI CHIUSURA SOLA NON BASTAVA A SETTE TIPI DIVERSI, e il
    conto lo ha presentato l'uso in mezza giornata.** Il residuo a zero
    descrive due tipi su sette; gli altri cinque si concludono col gesto, e
    con la sola regola del residuo restavano `in_progress` per sempre — la
    «lista che invecchia» che il piano §4.1 voleva evitare, prodotta dal
    codice che doveva evitarla. **Non l'ha vista nessun collaudo**, perché
    ogni prova verificava che il residuo scalasse bene: la domanda giusta —
    *«questo tipo può mai arrivare a zero?»* — nessuno l'aveva fatta
    (13/08).
34. **UN LOTTO MAIUSCOLATO È UNA CHIAVE DIVERSA.** `item_key` è
    `ARTICOLO#LOTTO`: `doCreateTask` maiuscolava entrambi, e su un lotto
    registrato `qwert` il compito nasceva puntando a `123456#QWERT`. La
    maschera si apriva **vuota**, senza errore, e sembrava un difetto della
    maschera. Prima di normalizzare un campo, guardare se entra in una
    chiave (13/08).
35. **PRIMA DI CANCELLARE UN FILE DALLA RADICE, CHIEDERE AL SERVIZIO QUALE
    STA SERVENDO.** `pathfinder-1.4.3.1.html` è stato rimosso credendolo non
    servito: era stato installato mezz'ora prima, e la pagina è andata in
    **404**. Il servizio dati è rimasto vivo e i terminali già aperti hanno
    continuato a lavorare — parlano con l'API — ma chi ricaricava non
    entrava. Nessun dato perso; persa **l'unica copia** di quella versione.
    Il controllo è un comando: `/api/app-info` dice il percorso esatto
    (13/08).
10. **`getLocationStatus`: uno stato esplicito vince su «occupata».** Una cella Riservata con merce dentro resta `reserved` — senza questo la deroga non scatterebbe mai.
11. **`addArticle` esce con `false` su un codice noto.** Era il motivo per cui l'import diceva «importati 0». Ora c'è `upsertArticles`.
12. **`Dialog.confirm` non accetta HTML**: vuole `message` (testo) e `details` (nodo DOM). È deliberato.
13. **Le classi `table` / `table-sm` non esistono**: è `sx-table`, dentro un `div` con `overflow-x:auto`.
14. **Nella pagina è esposto solo `window.App`**, non `Store`.
15. **L'ordine degli allergeni è quello dell'Allegato II**, non quello di digitazione: `SOIA` prima di `LATTE`.
16. **Il prefisso `nc-` era già preso** dalle stampe del cartellone non conformità: le classi nuove usano `conf-`.
17. **Un controllo che passa subito potrebbe non controllare niente**: JSDoc in `/*` invece di `/**` non viene letto; un `sort()` su due elementi chiama il comparatore una volta sola (1.2 §4.1).
18. **La guardia multi-scheda** mette la seconda scheda in sola lettura: una scheda sola quando si misura (1.0 §5.2 · 1.2 §4.4).
19. **Le sequenze `\uXXXX` letterali** nel file monolitico rompono le sostituzioni testuali che le attraversano (1.0 §5.1) — vale sui file in `ARCHIVIO`.

---

## 7. Convenzioni e vincoli permanenti

### Convenzioni (1.0 §9, aggiornate)
1. **I commenti spiegano il PERCHÉ, mai il cosa** — e sono **pochi**: la narrativa sta nell'INDEX e negli handoff, non nel codice.
2. **Nessun `font-size` fuori dai token MD3.**
3. **Niente dipendenze nuove** senza motivo forte.
4. **Nessuna cancellazione automatica di record.** La purge è manuale, con export preventivo.
5. **Italiano** in tutto ciò che l'utente legge, commenti compresi.

### Vincoli permanenti (1.0 §10)
- Uso interno Dietopack S.r.l. / Naturacare Group. Copyright Andrea Sacchetti su ogni file.
- **Tracciabilità GMP**: ogni movimento porta la sigla dell'operatore identificato.
- **Tenuta del dato a sei anni** (300-500 movimenti/giorno → 650k-1,1M record).
- Il marchio Naturacare non si adatta al tema: verde `#94BC47`, blu `#21305A`, sempre.
- **GDPR**: nessun dato personale oltre nome, cognome e iniziali; nessuna telemetria; nessuna richiesta di rete verso l'esterno.
- **I documenti di stampa restano in `pt` e `mm`**: la carta non ha un rem.

### Linee Guida Estetiche & Ergonomia di Interfaccia (UI/UX)
L'estetica di Pathfinder è governata dalla **chiarezza operativa, leggibilità a distanza ed ergonomia industriale** (monitor fissi, tablet rugged e lettori barcode con guanti). Zero decorazioni superflue:

1. **Tipografia & Numeri**:
   - Font di interfaccia moderno e ad alta leggibilità (**Inter** / **Plus Jakarta Sans**) per etichette, bottoni e navigazione.
   - Font monospazio (**JetBrains Mono** / **Consolas**) per ubicazioni, lotti, ODP, codici articolo e matrici, con tracking dedicato (`letter-spacing: 0.03em-0.05em`).
   - Cifre e quantità sempre con `font-variant-numeric: tabular-nums` per garantire l'allineamento perfetto nelle colonne di giacenza e nei report.
2. **Superfici & Layering Cromatico (MD3)**:
   - Sfondo di lavoro neutro e riposante (`surface-container-low` `#f4f6f8`) per contrastare l'abbagliamento da neon.
   - Card e contenitori bianchi con bordi sottili e precisi (`#e2e8f0`) ed elevazioni sobrie (livelli 0-2).
   - Colori di stato armonici e desaturati (Verde per *Disponibile/Conforme*, Ambra per *Avviso/In Prelievo*, Rosso per *Esaurito/Bloccato*, Viola per *Quarantena NC*).
3. **Mappa & Scaffalature (Visual Warehouse)**:
   - Celle con indicatore di saturazione pulito (sottile barra percentuale di livello).
   - Chip allergeni e certificazioni ad alto contrasto con codifica visiva compatta e standardizzata.
   - Evidenziazione netta della cella selezionata con contorno smeraldo ad alta visibilità.
4. **Tabelle Dati ad Alta Densità (SAGE X3 / Enterprise Grid)**:
   - Header compatti in maiuscoletto `label-small`, hover di riga rapido (80ms) e selezione evidente.
   - Badge di stato con formato "pill" elegante a contrasto controllato.
5. **Micro-interazioni & Ergonomia Barcode**:
   - Feedback di scansione barcode positiva: flash/pulse verde-smeraldo di 200ms sul campo per conferma visiva istantanea prima dell'invio.
   - Modali e dialoghi con backdrop blur leggero (`4px`) e pulsante di conferma primario sempre evidente.
   - Indicatore di connessione al database attivo nell'header.

---

## 8. Cosa NON fare

- **Non reintrodurre `store.js`**: il file è `core/store.ts`, e gli import verso di lui si scrivono senza estensione — vedi trappola 20.
- **Non cancellare un file dalla radice senza aver chiesto al servizio quale sta servendo** — `/api/app-info`. È costato una pagina in 404 il 13/08, trappola 35.
- **Non toccare `pathfinder-1.6.html` in radice**: è quello **servito adesso**. Accanto ci sono `pathfinder-1.4.4.html`, che è la via di ritorno, e la 1.4.3 che l'ha preceduta. I più vecchi stanno in `ARCHIVIO/VERSIONI PRECEDENTI/` e **non si cancellano**: un archivio svuotato funziona una volta sola.
- **Non chiudere un compito a mano**: non esiste più la strada, ed è voluto — decisione 62.
- **Non aprire una finestra sopra un'altra riusando `showModal`**: l'id è fisso e `closeModal` chiude il primo che trova, cioè quello sotto — trappola 31. Overlay con id proprio e chiusura propria, come `_pickLoc` e `_showReleaseDestDialog`.
- **Non fidarsi dell'`op_id` scritto in un documento**: si rilegge la collezione. Il record di `ANDS` è stato rifatto il 13/08 e l'id di ieri non esiste più — §4bis, trappola 29.
- **Non chiamare `addItem` per rimettere a posto della merce senza passargli le UM uscite**: le deriva da colli pieni e il saldo si gonfia in silenzio — trappola 24, e c'è `App._umMossa` apposta.
- **Non aggiungere un campo all'anagrafica senza guardare come si chiamano le etichette che ci sono già**: `unit` è già «UM» in tre posti — trappola 25.
- **Non convertire `ui/` sperando che basti il compilatore**: due difetti su due, in questa conversione, li ha presi solo la prova nel browser.
- **Non installare senza aver aperto la versione nuova in un browser**, contro una copia del database vero e su una porta sua. Tsc e i collaudi non hanno visto né la trappola 20 né la 21.
- **Non togliere `window.App = App`** in coda a `main.js`: 366 punti chiamano `App` per nome e smetterebbero di funzionare **in silenzio**.
- **Non scrivere a mano dentro `consegna/`** (era `Pathfinder 1.x/`): è prodotta, la build la azzera — e **non è la cartella che il servizio serve**.
- **Non versionare `server/data/`**: contiene i dati veri e le anagrafiche operatori.
- **Non aggiornare `dexie` e `xlsx`**: versioni fisse, l'applicativo è collaudato con quelle.
- **Non collaudare sul database di lavoro. E `npm run dev` NON è al riparo**: la pagina servita da Vite parla col servizio vero sulla 4173, perché l'adapter remoto non guarda da quale porta arrivi. La prova si fa su una copia, su una porta sua, con `PATHFINDER_DB` spostato — §3sexies. È già costato un blocco d'accesso (1.0 §5.6).
- **Un campo che la maschera mostra non è un campo che si salva**: `ARTICLE_ATTR_FIELDS` è una lista bianca, e ciò che non è nominato lì viene scartato **senza errore**. Le certificazioni ci sono rimaste fuori da 1.4.0 a 1.6 — §3sexies, difetto 1.
- **Una collezione nuova non esiste finché il servizio non riparte**: `server/lib/schema.js` si legge all'avvio. Vale per `recipients` della 1.6, e varrà per la prossima.
- **Non tenere un solo Team Leader.** Il PIN non è recuperabile per costruzione, e il rinnovo lo autorizza un Team Leader col proprio: con uno solo il cerchio si chiude su se stesso. §4bis.
- **Non accendere due interruttori `feature.*` nello stesso turno.** Il 13/08 è successo — `tasks` la mattina, `uom` cinque volte fra mezzogiorno e le due — e per sei ore nessun documento lo diceva. §3septies.
- **Non fidarsi della riga «Interruttori»: rileggerla.** Un comando — `Invoke-RestMethod http://127.0.0.1:4173/api/c/meta` — e `featureLog` dice chi ha acceso cosa e quando. È il primo fatto che una conversazione nuova legge, e il 13/08 era falso.
- **Non togliere né riscrivere i 14 allergeni del Reg. UE 1169/2011**: sono una norma, e restano fissi. Le voci aziendali — glutine, lattosio — si aggiungono **accanto**, dalla scheda dei parametri articolo: D18 ha rovesciato il divieto di aggiungere, non quello di togliere.
- **Non segnalare ritardi del programma di sviluppo**: si prende nota delle date e basta. Il giudizio sull'andamento lo dà Andrea — D21.
- **Non dare tre numeri a una build definitiva**: da D14 la numerazione è progressiva e una definitiva ne porta **due** — `1.5`, `1.6`. I numeri in più sono delle build di prova.
- **Non rendere tollerante** la lettura di allergeni e temperature.
- **Non convertire il servizio a TypeScript** senza un motivo forte.
- I conteggi DOM/CSS di confronto fra versioni sono **misure, non invarianti**: chi rimisura, rimisuri entrambe.

---

## 9. Comandi

```bash
npm run check                       # tsc client + servizio
npm test                            # 387 prove client
npm run build                       # produce "Pathfinder 1.4/"
```

```bash
node test/collaudo.js               # 54 prove servizio, da server/
```

```bash
node test/collaudo-migrazione-1.4.js   # 8 prove sul cambio di schema, da server/
```

---

## 10. I documenti vecchi, e dove sono finiti

Spostati in **`ARCHIVIO/HANDOFF STORICI/`**. Restano leggibili come memoria; non
servono per lavorare, perché tutto ciò che era ancora vivo sta nelle §4-§8.

| Documento | Perché è uscito |
|---|---|
| `HANDOFF-pathfinder-1.0.md` | Aperti, decisioni, trappole, convenzioni e vincoli: assorbiti in §4-§7. Resta la cronaca della prima versione client-server |
| `HANDOFF-pathfinder-1.2.md` | Idem. Resta il racconto dello spacchettamento del monolite |
| `HANDOFF-pathfinder-1.3.md` | Idem. Resta il dettaglio delle sei differenze fra ciò che il codice prometteva e ciò che faceva |
| `PIANO-AZIONE-Pathfinder-2.0.md` | Era già marcato **superato** dal suo stesso autore. Le fasi 0-4 sono state eseguite; le decisioni D3 (Entra) e Fase 6 (D365) sono state ribaltate |
| `Pathfinder_Handoff_Valutazione_Tecnica_ES6 TYPESCRIPT.md` | **Eseguito**: è stata scelta l'Opzione C, TypeScript + Vite, ed è quello che gira |
| `Pathfinder_Handoff_Infrastruttura_Azure_ERP_REDIS.md` | **Respinto**: Azure Static Web Apps, Redis e la coda offline su IndexedDB sono tutti esclusi dalle decisioni 5, 6 e 1 della §5 |
| `PROMPT-workspace-multiagente.md` | Prompt per un esperimento archiviato (app Android multi-agente), senza vincoli sul core. **Rimpiazzato il 12/08** da [`PROMPT-workspace-multiagente-1.4.md`](PROMPT-workspace-multiagente-1.4.md), che parla del lavoro vero |

---

*Uso interno Dietopack S.r.l. / Naturacare Group — © Andrea Sacchetti*
