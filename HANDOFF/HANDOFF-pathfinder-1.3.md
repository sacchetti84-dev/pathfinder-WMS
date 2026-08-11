# HANDOFF — Pathfinder 1.3

**Documento di passaggio di consegne per la prossima conversazione**
Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 11/08/2026 · Rev. 01 — i moduli hanno i tipi, la 1.2 è pronta a partire

---

## 0. Come si riprende, in tre righe

Il progetto è su **GitHub, privato**: `sacchetti84-dev/pathfinder`, branch
`main`. Niente vive solo in una conversazione.

Alla prossima chat basta dare **questo file** e il **[README](../README.md)**.
Il README dice come si installa, si aggiorna e si diagnostica; questo dice
dove siamo e cosa manca. L'[HANDOFF 1.2](HANDOFF-pathfinder-1.2.md) e
l'[1.0](HANDOFF-pathfinder-1.0.md) restano validi per tutto ciò che qui non
viene ridetto: in particolare le decisioni e le trappole.

---

## 1. Stato

| Voce | Valore |
|---|---|
| In produzione | **`pathfinder-1.1.html`** — è ancora il file che il servizio serve oggi |
| Pronta a partire | **1.2** — `dist/pathfinder-1.2.html`, verificata contro la 1.1 (§3) |
| Sorgente | 28 file in `src/`: **17 TypeScript**, 6 JavaScript, 5 fogli di stile |
| Ancora JavaScript | `core/store.js` (2.457 righe), `main.js` (81) e la cartella `ui/` (11.716) |
| Servizio | `server/` — Node + Express + SQLite, **non toccato** in questa sessione |
| Database | `C:\Pathfinder\data\pathfinder.db` — fuori da OneDrive |
| Collaudi | **57 client** (~1,2 s) + **29 servizio**, tutti verdi |
| Tipi | `npm run check` su client **e** servizio, 0 errori |

### Comandi

Invariati rispetto alla 1.2. `npm test` adesso esegue quattro suite invece
di due: serpentina, FEFO, geometria delle ubicazioni, parser ODP.

---

## 2. Cosa è stato fatto in questa sessione

Sei commit, uno per blocco, con build e collaudo in mezzo a ognuno — il
metodo della §5 dell'HANDOFF 1.2, applicato senza eccezioni.

**Fase 4 — i due collaudi che mancavano.** Geometria delle ubicazioni (16
prove) e parser ODP (26 prove). Sono stati scritti **prima** delle
conversioni, di proposito: una conversione senza rete si verifica
rileggendola, e rileggere non è verificare.

Tutte e due sono state provate rompendo il codice: 10 mutazioni sulla
geometria, 18 sul parser, 27 viste fallire. La ventottesima — spegnere
`XLSX.SSF` e lasciare il solo calcolo manuale delle date — **sopravvive**, ed
è scritto nel file di collaudo perché chi lo rimisura non lo scambi per una
lacuna: dal 1900 in poi le due strade danno la stessa identica data.

**Fase 3 — schema, adapter e tutti i moduli in TypeScript.** In quest'ordine,
che non è arbitrario: lo schema per primo perché senza di lui gli adapter non
erano controllabili, i moduli con i collaudi (parser e percorso) subito dopo
averli scritti, la UI mai.

**Le stringhe di versione dicono 1.2**, e il confronto con la 1.1 conferma che
è l'unica cosa cambiata (§3).

**Riordino:** la cartella `HANDSOFF` ha perso la esse di troppo ed è
`HANDOFF`.

---

## 3. La verifica che vale per tutte le conversioni

Il metodo è quello della §5.4 dell'HANDOFF 1.2: due istanze del servizio su
porte diverse, database usa-e-getta, una scheda per volta.

| | 1.1 (porta 4174) | 1.2 (porta 4175) |
|---|---|---|
| Regole CSS | **869** | **869** |
| Fogli di stile | 5 (709+45+30+84+1) | 1 (869) — la build li fonde |
| Elementi DOM | 224 | 218 |
| `App` raggiungibile | sì | sì |

**I 6 elementi di differenza sono tutti e soli `SCRIPT` 3→1 e `STYLE` 5→1**:
i contenitori degli asset, che la build a file unico accorpa. Ogni altro tag
— tutti e 35 — ha lo stesso conteggio esatto.

> I numeri di riferimento della §5.4 dell'HANDOFF 1.2 erano **210 e 1008**.
> Non combaciano con questi, e non è una regressione: dipendono da cosa c'è a
> schermo nel momento in cui si misura. Qui il database è vuoto, quindi
> entrambe le versioni mostrano il wizard di primo accesso. **Quello che conta
> è che le due colonne siano confrontabili fra loro**, non con una misura
> fatta un'altra sera su un'altra schermata. Chi rimisura, rimisuri
> entrambe.

Poi la prova che nessun conteggio può dare: **creare il primo Team Leader dal
wizard**, sulla 1.2. Passa per `Auth.buildPinFields` → `Persistence.op('hashPin')`
e per `Store.addOperator` → `Persistence.add`, cioè proprio il codice
riscritto. Nel database usa-e-getta è comparso l'operatore con `pin_hash` e
`pin_salt`, più i due record di `meta` del checkpoint. Nessun errore in
console.

---

## 4. Sei differenze fra ciò che il codice prometteva e ciò che faceva

Tutte trovate dal compilatore, tutte annotate sul posto. Nessuna era visibile
usando l'applicativo bene; è il motivo per cui i tipi servono.

1. **`isBackupSupported()` non rispondeva sempre sì o no.** La catena di `&&`
   restituiva lo `StorageManager` di mezzo quando `getDirectory` mancava. Il
   contratto diceva `boolean` dal primo giorno. Invisibile perché il valore si
   legge sempre dentro un `if`.
2. **`eachChunk` si comportava in due modi.** L'adapter locale chiamava
   `fn(rows, off, total)`, quello remoto `fn(rows)`, il contratto dichiarava
   un argomento solo. Chi si fosse appoggiato al secondo o al terzo avrebbe
   scritto codice funzionante col file aperto dal disco e rotto col file
   servito dal servizio. Nessuno dei tre chiamanti li leggeva.
3. **`RemotePersistence._write` era codice morto.** Definito, mai chiamato da
   nessuna parte. Tolto.
4. **Lo stato interno dell'adapter remoto nasceva dall'assegnazione** —
   `serverVersion`, `dbFile`, `revision`, `_es` esistevano dopo `open()` e non
   prima. Ora è dichiarato in cima.
5. **Un commento diceva il contrario del codice.** In
   `buildLocationGeometry()`: «livello non in elenco → in coda». Va a pari
   merito col primo, e il caso è per giunta irraggiungibile.
6. **Il vocabolario era ancora scritto in tre posti.** `COLLECTIONS` in due
   adapter e la mappa delle chiavi primarie in `_PK`: erano copie di
   `types/collezioni.ts`, cioè del file che esiste apposta per non averne
   copie. Ora le leggono da lì, e il contratto ha guadagnato `COLLECTIONS` —
   un membro che entrambi gli adapter avevano e che il contratto non
   conosceva.

---

## 5. Decisioni prese in questa sessione

Valgono in aggiunta a quelle degli HANDOFF 1.0 e 1.2, che restano tutte.

1. **I collaudi si scrivono prima della conversione**, non dopo. Sul parser
   ODP e sul percorso è stato così, ed è la ragione per cui quelle due
   conversioni si possono guardare senza trattenere il fiato.
2. **Un collaudo si prova rompendo il codice.** È già la §4.1 dell'HANDOFF
   1.2; qui è diventato uno script che applica le mutazioni una per volta.
   Due prove del parser passavano anche col codice rotto e sono state
   riscritte.
3. **Il ponte verso Store, invece di un cast per chiamata.** Finché Store è
   JavaScript, la sua cache nasce da array vuoti e il compilatore ne deduce
   `never[]`. In cima a `pickRoute.ts` e `vault.ts` c'è un blocco che dichiara
   i metodi di Store usati lì e la loro forma. Sparirà con la conversione di
   Store, e nel frattempo dice quanto quel modulo dipende dal magazzino.
4. **`_format` del pacchetto di export non segue la versione
   dell'applicativo.** Descrive la forma del file, che non è cambiata, e un
   export della 1.1 deve continuare a rientrare. A muoversi è `_appVersion`.
5. **L'API non standard si dichiara.** `showDirectoryPicker` e
   `queryPermission`/`requestPermission` sono la File System Access API di
   Chrome ed Edge, non nelle definizioni standard del DOM. Dichiararle in cima
   a `vault.ts` non le rende disponibili: le rende visibili. È l'unico punto
   del client che dipende da un'API non standard.

---

## 6. Aperto — da fare

### Il passo che manca, e che è pronto

**Portare la 1.2 in magazzino.** Tutto è fatto tranne l'atto: la build c'è,
le stringhe dicono 1.2, il confronto con la 1.1 è documentato in §3. Restano
cinque comandi, da eseguire **da PowerShell come amministratore** (il servizio
gira come SYSTEM) e **con un backup fresco davanti**:

```powershell
# 1. Backup PRIMA. Sempre — README §7.
Invoke-RestMethod -Uri http://127.0.0.1:4173/api/backup -Method Post `
  -Body (@{dir='C:\Pathfinder\backup'} | ConvertTo-Json) -ContentType 'application/json'
```

```powershell
# 2. La 1.2 prende posto in radice, accanto alla 1.1 che resta.
#    In radice sta IL FILE CHE IL SERVIZIO SERVE: si copia dalla cartella di
#    consegna invece di puntarci dentro, perche' quella la build la riscrive e
#    un rilascio dev'essere un gesto, non un effetto di "npm run build".
cd "C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER"
Copy-Item "Pathfinder 1.2\pathfinder-1.2.html" pathfinder-1.2.html
```

```powershell
# 3. Il servizio deve sapere quale file servire.
[Environment]::SetEnvironmentVariable('PATHFINDER_APP',
  'C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER\pathfinder-1.2.html','Machine')
```

```powershell
# 4. Le variabili si leggono all'avvio: senza riavvio non cambia niente.
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
```

```powershell
# 5. Verificare che i terminali vedano DAVVERO la 1.2.
Invoke-RestMethod http://127.0.0.1:4173/api/app-info
```

Se `app_file` non è la 1.2 o `mtime` non è quello del file appena copiato, il
servizio sta servendo un'altra cartella: non insistere, leggere il README §9.

**Il ritorno indietro è il punto 3 all'incontrario**, più un riavvio:
`pathfinder-1.1.html` resta in radice — non viene spostato da nessuno di
questi passi, proprio per questo — e il database non viene toccato. Quando la
1.2 avrà fatto qualche turno, la 1.1 si toglie dalla radice: una copia è già
in `ARCHIVIO\VERSIONI PRECEDENTI`.

> Perché non l'ho fatto io: sono comandi che fermano il servizio del
> magazzino e cambiano una variabile di macchina. Vanno dati da chi può
> decidere **quando** — a fine turno, non a metà — e con la certezza che
> nessuno stia scansionando in quel momento.

### Dipende da altri

| # | Cosa | Chi |
|---|---|---|
| 1 | **Nome DNS interno** e **certificato** dalla CA aziendale | IT |
| 2 | **Partita IVA e dati del mittente** in Configurazione → DDT e Documenti. Senza, i DDT escono «non conformi» | Andrea |

### Codice

| # | Cosa | Peso |
|---|---|---|
| 3 | Fase 3: **`core/store.js` a TypeScript** — 2.457 righe, tocca tutte le entità. È l'ultimo pezzo grosso prima della UI, e quello che fa sparire i due ponti | grande |
| 4 | Fase 3: la cartella **`ui/`**, per ultima. `app.js` da solo sono 11.109 righe | grande |
| 5 | Fase 4: collaudi su **`Store._applyToCache`** — è il punto dove ogni mutazione entra nella cache, quattordici collezioni con cinque forme diverse (lista, mappa, insieme, singolo, chiave/valore), e non ha una prova | medio |
| 6 | Aperti dell'HANDOFF 1.0 ancora validi: §7.3 schede grafico che tagliano ~6px, §7.4 causali di trasporto da validare, §7.6 `weight_net_kg` e `pieces_per_pack` in anagrafica | vari |

### Riordino — fatto, e cosa resta

**Fatto.** La radice di `MAPPER` era diventata illeggibile: consegna,
cantiere, archivi e strumenti scollegati tutti allo stesso livello. Adesso
sono quattro cose separate, e il README §10 ha una tabella che dice quale è
quale e chi la tocca.

- **`Pathfinder 1.2/`** è la consegna, ed è **prodotta**: `npm run build` la
  azzera e la rifà con l'applicativo e una copia del README. Dentro non si
  scrive a mano — sparirebbe al primo giro — e per lo stesso motivo non sta
  nel repository.
- **`ARCHIVIO/`** ha inghiottito `VERSIONI PRECEDENTI`, `BACKUP E FILE DI
  TEST`, `LOGHI` e `stampa etichette`.
- **`server/` è rimasto dov'era**, e non è una svista: l'attività pianificata
  registrata da `installa-servizio.ps1` contiene il percorso *assoluto* di
  `pathfinder-server.js`. Spostarlo non darebbe errore subito — darebbe un
  magazzino fermo al riavvio successivo. Se un giorno va spostato, si rilancia
  l'installazione dalla posizione nuova, da amministratore, e conviene farlo
  nella stessa finestra dei cinque comandi qui sopra invece che in una sua.

**Resta:** `ARCHIVIO/LOGHI/` contiene nomi generati automaticamente accanto a
quelli veri, e due file **identici byte per byte** (`commodore.svg` e
`gemini-svg.svg` — stesso SHA-256, verificato). Non ci ho messo mano: sono
materiali di progetto e quale tenere lo decide chi li ha fatti. Nessuno di
questi file è usato a runtime — i marchi nell'applicativo sono `<svg>` in
linea dentro `index.html`.

---

## 7. Cosa NON fare

Valgono tutte le voci della §7 dell'HANDOFF 1.2. In aggiunta:

- **Non convertire `store.js` e `app.js` nello stesso commit.** Sono 13.566
  righe: se qualcosa si muove, non c'è modo di sapere quale delle due.
- **Non togliere i ponti verso Store** finché Store è JavaScript. Sembrano
  ridondanti e non lo sono: senza, il compilatore deduce `never[]` e le
  chiamate smettono di compilare.
- **Non fidarsi dei numeri 210/1008** come di una costante: sono una misura,
  non un'invariante. Vedi il riquadro in §3.

---

*Uso interno Dietopack S.r.l. / Naturacare Group — © Andrea Sacchetti*
