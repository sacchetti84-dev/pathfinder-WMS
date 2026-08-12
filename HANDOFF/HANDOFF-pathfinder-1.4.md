# HANDOFF — Pathfinder 1.4

**L'unico passaggio di consegne in vigore.** Assorbe e sostituisce gli HANDOFF
1.0, 1.2 e 1.3: gli aperti che si trascinavano sono nella §4, le decisioni
permanenti nella §5, le trappole nella §6, le convenzioni nella §7. I documenti
vecchi restano leggibili in `ARCHIVIO/HANDOFF STORICI/` — vedi §10.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 12/08/2026 · Rev. 07 — la 1.4.2 è costruita e provata, resta da installare

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
| In magazzino, **adesso** | `pathfinder-1.4.0.html` — verificato su `/api/app-info`, 1.493.517 byte |
| **1.4.2** | **costruita e provata il 12/08**: `Pathfinder 1.4/pathfinder-1.4.2.html`, 1.541.133 byte. **Non installata**. Contiene anche la 1.4.1, che non è mai entrata |
| Ritorno indietro | Oggi `pathfinder-1.2.html`; il giorno che si installa la 1.4.2 diventa `pathfinder-1.4.0.html`, che resta in radice |
| Sorgente | 32 file in `src/`: **27 TypeScript**, 5 JavaScript, più 5 CSS |
| Ancora JavaScript | `main.js` · `ui/` (4 file). **`core/store.js` non esiste più** |
| Collezioni | **19** — le 14 di sempre più `lots` `udc` `tasks` `wip` `storage_rules`. `tasks` e `lots` si popolano a interruttore acceso |
| Collaudi | **331 client** · **43 servizio** · **8 migrazione** — tutti verdi |
| Tipi | `npm run check` a 0 su client e servizio |
| Scadenza progetto | **31/12/2026** · ultima installazione utile **19/12** |

> **Il magazzino gira sulla 1.4.0, dal 12/08.** Costruita, provata nel browser
> contro una copia del database vero, e installata con i cinque comandi della §4.
> `/api/app-info` risponde `pathfinder-1.4.0.html`, 1.493.517 byte.
>
> **La 1.4.2 è pronta e non è ancora installata**, e con lei la 1.4.1 — che non
> è mai entrata. Il file esiste, è provato, e finché nessuno esegue i cinque
> comandi della §4 il magazzino non lo vede. Il gesto è di chi installa — a fine
> turno, con un backup fresco davanti — ed è **un gesto diverso dall'accendere
> le funzioni**, che si fanno dopo, da Configurazione → Funzioni, **una per
> turno**: prima `feature.tasks`, il turno dopo `feature.uom`.
>
> **Che la 1.4.1 non sia mai entrata non è un problema, ed è meglio saperlo.**
> La 1.4.2 la contiene per intero. L'unica conseguenza riguarda il ritorno
> indietro: in radice non ci sarà nessun `pathfinder-1.4.1.html`, quindi si
> torna alla **1.4.0**, che è ciò che gira adesso. La catena regge lo stesso —
> quello che deve esistere è il file precedente *installato*, non tutti quelli
> costruiti.
>
> **Anche installata, non cambia niente a video.** `feature.tasks` e
> `feature.uom` nascono spenti: la voce «Attività» non compare, il riquadro in
> Dashboard nemmeno, e sotto una riga di giacenza non compare la confezione —
> **neanche su una riga che ha già un `qty_uom` scritto**. Provato sul file
> consegnato, non sul sorgente, spegnendo l'interruttore su una copia con dei
> dati dentro. Ciò che si vede comunque è la scheda **Configurazione →
> Funzioni**, che è il posto da cui si accendono.

---

## 2. Cosa è successo nell'ultima sessione

| Commit | Cosa |
|---|---|
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
| 6 | **Installare la 1.4.2**, poi accendere gli interruttori uno per turno | **da fare** |
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

**Il prossimo atto è la 1.4.3** — UDC, `moveUdc` transazionale, etichette:
PIANO-1.4 §4.3, entro il **21/11**.

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

---

## 4. Il registro degli aperti

Tutti gli aperti dei tre handoff precedenti, verificati uno per uno. La colonna
*origine* dice da dove viene, così non si riaprono discussioni già chiuse.

### Ancora aperti

| # | Cosa | Origine | Chi |
|---|---|---|---|
| 1 | **Installare la 1.4.2** — contiene anche la 1.4.1, mai installata. Poi gli interruttori, **uno per turno**: prima `feature.tasks`, il turno dopo `feature.uom` | 12/08 | Andrea, a fine turno |
| 1bis | **Confermare le due scelte della §5.41**: la colonna UM è `unit`, la quantità per collo è `pieces_per_pack`. Il piano ne prevedeva altre due, e sarebbero state due colonne con lo stesso nome | 12/08 | Andrea, prima di accendere `uom` |
| 1ter | **La 1.4.3** — UDC, `moveUdc` transazionale, etichette, entro il **21/11** | nuovo | il prossimo lavoro |
| 2 | **Caratterizzare le zone** e popolare gli attributi in anagrafica. Senza, la mappa resta muta | nuovo | Andrea, alla configurazione |
| 3 | **Partita IVA e dati del mittente** in Configurazione → DDT. La maschera c'è: è un dato da digitare, non codice da scrivere | **1.0 §7.1** | Andrea, quando opportuno |
| 4 | **Nome DNS interno e certificato** dalla CA aziendale. **Il codice è pronto e non aspetta niente**: due variabili e HTTPS si accende. Il certificato arriva a lavori finiti | **1.0 §7.2** · 1.2 §6.1 | IT — non blocca |
| 5 | **`weight_net_kg` e `pieces_per_pack` in anagrafica.** I campi sono cablati ovunque — maschere, import, export, peso del DDT: sono **solo da compilare**, colonne `Peso_Netto_Collo` e `Pezzi_Per_Collo`. Dalla 1.4.2 il secondo **decide se un articolo è gestito a UM**: senza, resta a soli colli anche a interruttore acceso | **1.0 §7.6** | import Excel |
| 6 | **`ui/` in TypeScript**, `app.js` da solo sono 10.529 righe. Fuori dalla 1.4 | 1.2 §6.4 · 1.3 §6.4 | grande |
| 7 | **`TODO F1-REVIEW` ×3**: cache svuotata prima della conferma del supporto (`store.ts` ×2), riallineamento ridondante dopo `resetAll()` (`app.js`) | 1.3 | piccolo |
| 8 | **`service_version` è ancora `'1.1'`** in `pathfinder-server.js`, ma il servizio è cambiato: `_migra` e 19 collezioni. Da decidere se allinearla, sapendo che è la versione del *servizio* e non dell'applicativo | 12/08 | piccolo |

### I cinque comandi — **rifatti il 12/08 per la 1.4.0**, restano qui perché servono a ogni versione

Da **PowerShell come amministratore** (il servizio gira come SYSTEM), **a fine
turno** e **con un backup fresco davanti**. Si rifanno tali e quali per la versione
dopo, cambiando `1.4.0` con `1.4.2` in due punti: il passo 2 e il passo 3.

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
Copy-Item "Pathfinder 1.4\pathfinder-1.4.0.html" pathfinder-1.4.0.html
```

```powershell
[Environment]::SetEnvironmentVariable('PATHFINDER_APP',
  'C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER\pathfinder-1.4.0.html','Machine')
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

| Versione | `app_file` | `bytes` |
|---|---|---|
| 1.4.0 — in magazzino adesso | `pathfinder-1.4.0.html` | 1.493.517 |
| 1.4.1 — costruita, mai installata | `pathfinder-1.4.1.html` | 1.526.393 |
| **1.4.2** — pronta, da installare | `pathfinder-1.4.2.html` | **1.541.133** |

**Il ritorno indietro è il punto 3 all'incontrario, più un riavvio.** Il file
precedente resta in radice — nessuno di questi passi lo sposta, proprio per
questo — e il database non viene toccato. La 1.2 rilegge il database della
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
18. **Il WIP resta nella 1.4** (1.4.5, installato il 19/12 a interruttore spento).
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

---

## 8. Cosa NON fare

- **Non reintrodurre `store.js`**: il file è `core/store.ts`, e gli import verso di lui si scrivono senza estensione — vedi trappola 20.
- **Non toccare `pathfinder-1.4.0.html` in radice**: è quello servito adesso, e dal giorno che si installa la 1.4.2 diventa il ritorno indietro. E non spostare `pathfinder-1.2.html`, che gli sta accanto.
- **Non chiamare `addItem` per rimettere a posto della merce senza passargli le UM uscite**: le deriva da colli pieni e il saldo si gonfia in silenzio — trappola 24, e c'è `App._umMossa` apposta.
- **Non aggiungere un campo all'anagrafica senza guardare come si chiamano le etichette che ci sono già**: `unit` è già «UM» in tre posti — trappola 25.
- **Non convertire `ui/` sperando che basti il compilatore**: due difetti su due, in questa conversione, li ha presi solo la prova nel browser.
- **Non installare senza aver aperto la versione nuova in un browser**, contro una copia del database vero e su una porta sua. Tsc e i collaudi non hanno visto né la trappola 20 né la 21.
- **Non togliere `window.App = App`** in coda a `main.js`: 366 punti chiamano `App` per nome e smetterebbero di funzionare **in silenzio**.
- **Non scrivere a mano dentro `Pathfinder 1.4/`**: è prodotta, la build la azzera.
- **Non versionare `server/data/`**: contiene i dati veri e le anagrafiche operatori.
- **Non aggiornare `dexie` e `xlsx`**: versioni fisse, l'applicativo è collaudato con quelle.
- **Non collaudare sul database di lavoro.** Mai. È già costato un blocco d'accesso (1.0 §5.6).
- **Non accendere due interruttori `feature.*` nello stesso turno.**
- **Non aggiungere un quindicesimo allergene**: è una norma. Le esigenze locali si esprimono con la deroga della cella Riservata.
- **Non rendere tollerante** la lettura di allergeni e temperature.
- **Non convertire il servizio a TypeScript** senza un motivo forte.
- I conteggi DOM/CSS di confronto fra versioni sono **misure, non invarianti**: chi rimisura, rimisuri entrambe.

---

## 9. Comandi

```bash
npm run check                       # tsc client + servizio
npm test                            # 331 prove client
npm run build                       # produce "Pathfinder 1.4/"
```

```bash
node test/collaudo.js               # 43 prove servizio, da server/
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
