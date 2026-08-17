# PIANO — 1.7, la consegna multi-file

**Il disegno del nuovo schema di consegna**, deciso il 17/08/2026 e **costruito
lo stesso giorno**. Qui c'è cosa diventa una versione, dove vive, come si
installa e come si torna indietro; i blocchi di lavoro; le trappole; e le
decisioni D22-D28 con la ragione di ognuna.

> **Stato al 17/08 sera: costruita e provata al banco, NON installata.** Blocchi
> 1-4 chiusi, `npm run check` a 0, **435 prove client**, **65 servizio** (erano
> 55), build verde in tutt'e due i modi. Il passo che manca è metterla in
> servizio: due tempi, in [INDEX §7ter](../INDEX.md).
>
> **I numeri veri, misurati nel browser sul banco** — non stimati:
>
> | | prima | 1.7 |
> |---|---:|---:|
> | Primo caricamento | 1.610 kB | **251 kB** |
> | Ricarica | 1.610 kB | **300 byte** |
> | `xlsx` | sempre, a ogni ricarica | 167 kB, solo al primo import o export |
>
> La ricarica sta in 300 byte perché l'indice torna **304** e gli assets non
> vengono nemmeno richiesti. Il primo caricamento scende sotto un sesto per due
> ragioni insieme: `xlsx` non parte più con la pagina, e quello che parte
> viaggia compresso — il servizio non aveva **mai** compresso niente.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Si legge insieme a [INDEX](../INDEX.md) §5 e §7bis, e a
[HANDOFF §3octies](HANDOFF-pathfinder-1.4.md).

---

## 0. Perché, in quattro righe

`xlsx` pesa **864 KB su 1,61 MB** — oltre metà dell'applicativo — ed è usato in
due soli punti, `modules/odpParser.ts` e `ui/app.js`: serve a chi importa un ODP
o esporta, cioè qualche volta al giorno. Oggi ogni terminale lo riscarica **a
ogni ricarica della pagina**, perché un file solo non ha pezzi e non ha cache.

Il file unico è stato la scelta giusta finché la consegna doveva essere un gesto
solo. Adesso costa 1,6 MB per ogni ricarica in un magazzino che ricarica spesso,
e impedisce di caricare a richiesta l'unica dipendenza che pesa davvero.

---

## 1. Una versione è una cartella

```
pathfinder-1.7/
  index.html              ~25 KB    no-cache
  assets/
    index-a3f9c1.js      ~700 KB    immutable, un anno
    xlsx-8b2e04.js       ~880 KB    immutable — scaricato SOLO a import/export
    index-5d7a22.css      ~60 KB    immutable
  manifest.json                     il documento d'identità della build
```

Il numero sta nel nome della cartella, come stava nel nome del file. Le regole
della D14 valgono identiche: **una consegna definitiva porta due numeri**, le
build di prova ne portano di più.

> **E una build a file singolo è una cartella con dentro il solo `index.html`.**
> Si autoconsuma, non ha assets, e il servizio la serve senza sapere che è
> diversa. È il perno di tutto il piano: il servizio ha **un modo solo**, e la
> 1.6.1 resta un ritorno indietro valido senza un ramo di codice che la
> riguardi. Un ramo di codice percorso una volta l'anno è un ramo che non
> funziona: questo non esiste proprio.

## 2. Il manifesto sostituisce il conteggio dei byte

La verifica di un'installazione, in questi documenti, è sempre stata «confronta
`app_file` **e** `bytes`». Con una cartella «i byte» non sono un numero solo, e
senza un sostituto quel rituale muore in silenzio — che è peggio che cambiarlo.
Lo scrive la build, in fondo a `consegna/`:

```json
{
  "versione": "1.7",
  "costruita": "2026-08-18T22:14:03Z",
  "byte_totali": 1687432,
  "file": [
    { "percorso": "index.html",             "byte":  25610, "sha256": "…" },
    { "percorso": "assets/index-a3f9c1.js", "byte": 701244, "sha256": "…" }
  ],
  "impronta": "9f4c…"
}
```

`impronta` è lo sha256 dell'elenco ordinato dei file col loro sha256: **è il
nuovo `1.625.239`**. Due installazioni con la stessa impronta sono lo stesso
applicativo, byte per byte, su qualunque macchina. `/api/app-info` la
restituisce, e il controllo dopo l'installazione resta un comando solo.

## 3. Tre luoghi separati, e l'errore del 14/08 diventa impossibile

Il 17/08 si è scoperto che `PATHFINDER_APP` puntava **dentro la cartella di
consegna**, che è `outDir` di Vite: `npm run build` la azzera, quindi ogni build
— anche una di prova — finiva davanti agli operatori, e una build fallita a metà
li avrebbe lasciati in 404. Il disegno separa i tre luoghi, e il difetto non ha
più dove nascere:

| Luogo | Chi ci **scrive** | Chi ci **legge** |
|---|---|---|
| `consegna/` — era `Pathfinder 1.6/` | `npm run build`, che la azzera | **nessuno in produzione** |
| `C:\Pathfinder\app\pathfinder-1.7\` | l'installazione, con una copia | **il servizio** |
| `ARCHIVIO/APP/` | l'archiviazione | nessuno |

Due conseguenze volute.

**La cartella di build perde il numero dal nome.** Non somiglia più a una
consegna, e nessuno è tentato di puntarci la produzione. `.gitignore` smette di
inseguire i numeri con `Pathfinder 1.*/` e diventa una riga fissa.

**Le versioni installate escono da OneDrive.** Oggi il file che i terminali
scaricano vive dentro una cartella sincronizzata: un conflitto di
sincronizzazione lo riscrive sotto i piedi al servizio, e nessuno se ne accorge
finché la pagina non si rompe. Il database sta fuori da OneDrive dalla 1.0 per
questa stessa ragione. Adesso ci sta anche l'applicativo, **in una cartella sua**
— il servizio si installa in `C:\Pathfinder\servizio`, e `app\` la tocca solo
`installa-versione.ps1`:

```
C:\Pathfinder\
  app\
    corrente        →  giunzione verso pathfinder-1.7\
    precedente      →  giunzione verso pathfinder-1.6.1\
    pathfinder-1.7\
    pathfinder-1.6.1\
  data\pathfinder.db
  backup\
```

## 4. Come si serve

```js
const APP_DIR  = process.env.PATHFINDER_APP_DIR || null;   // nuovo
const APP_FILE = process.env.PATHFINDER_APP     || …;      // resta, come ripiego
```

| Percorso | Da dove | Cache |
|---|---|---|
| `/` e `/app` | `APP_DIR/index.html` | **`no-cache`** — come oggi |
| `/assets/*` | `APP_DIR/assets/`, poi `PREV_DIR/assets/` | **`immutable, max-age=1y`** |

**Esce solo `index.html` e il sottoalbero `assets/`.** Mai la cartella intera:
un `APP_DIR` puntato male non deve poter esporre un albero di sorgenti sulla
LAN. All'avvio il servizio **rifiuta** una cartella priva di `index.html` o di
`manifest.json` e lo dice a schermo, come già fa quando l'applicativo non
esiste.

`index.html` resta `no-cache` perché è lui che nomina gli assets: un
`index.html` vecchio in cache chiederebbe file che non esistono più. Gli assets
sono `immutable` perché portano l'impronta nel nome — non cambiano mai a parità
di nome, e il terminale non ha ragione di richiederli.

## 5. Lo scambio è il ripuntamento di una giunzione

`PATHFINDER_APP_DIR` punta a `C:\Pathfinder\app\corrente` e **non cambia mai
più**. Installare e tornare indietro diventano il ripuntamento di una giunzione:
**senza privilegi di amministratore e senza riavviare il servizio**, perché
Express risolve il percorso a ogni richiesta.

È la risposta al 13/08, quando i passi 3 e 4 dell'installazione sono stati
respinti con «Accesso al Registro di sistema non consentito»: la variabile è di
macchina e l'attività gira come SYSTEM. Da qui in poi l'amministratore serve
**una volta sola**, per impostare la variabile la prima volta.

**`precedente` non è decorativa.** Serve gli assets della versione appena
lasciata a chi aveva la pagina a metà caricamento nell'istante dello scambio. I
nomi portano l'impronta, quindi due versioni non possono collidere, e un
terminale che ricarica prende la nuova senza sapere che è successo qualcosa.

## 6. Le procedure

### Installare

```powershell
cd "C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\MAPPER"
npm run build
.\server\installa-versione.ps1 -Da .\consegna -Versione 1.7
Invoke-RestMethod http://127.0.0.1:4173/api/app-info
```

Lo script copia `consegna\` in `C:\Pathfinder\app\pathfinder-1.7\`, ripunta
`precedente` a dov'era `corrente`, ripunta `corrente` alla nuova, e si ferma
**senza toccare niente** se la cartella di destinazione esiste già: una versione
installata è di sola lettura, e reinstallarci sopra è il gesto che fa perdere la
via di ritorno. L'ultimo comando deve rispondere versione e impronta del
manifesto appena copiato.

### Tornare indietro

```powershell
.\server\torna-indietro.ps1
```

Scambia `corrente` e `precedente`. Un comando, nessun riavvio, nessun
amministratore — e resta vero quello che INDEX §7bis dice da sempre: **prima di
tornare indietro c'è un gesto più piccolo, spegnere l'interruttore della
funzione che dà fastidio.**

### La prima volta, e una volta sola

```powershell
[Environment]::SetEnvironmentVariable('PATHFINDER_APP_DIR',
  'C:\Pathfinder\app\corrente','Machine')
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
```

Prima di questi due comandi, `installa-versione.ps1` va lanciato **anche sulla
1.6.1**, che è un file singolo: lo script la avvolge in
`C:\Pathfinder\app\pathfinder-1.6.1\index.html` e le genera il manifesto. Così
la via di ritorno esiste **prima** che serva, e non dopo.

## 7. I blocchi di lavoro

Lo stesso metodo di `store.ts`: sei blocchi, ognuno con `npm run check`,
`npm test` e `npm run build` verdi prima di dirsi chiuso.

| # | Cosa | Dove |
|---|---|---|
| 1 | **La build multi-file e il manifesto** — via `viteSingleFile` dalla produzione, `cssCodeSplit`, `assetsInlineLimit: 4096`, via `inlineDynamicImports`; il plugin di consegna smette di rinominare un file e **scrive il manifesto** | `vite.config.js`, `.gitignore` |
| 2 | **`xlsx` a richiesta** — `import('xlsx')` nei due punti che lo usano, `manualChunks` che lo tiene in un chunk suo | `modules/odpParser.ts`, `ui/app.js` |
| 3 | **Il servizio serve una cartella** — `PATHFINDER_APP_DIR`, `/assets` con `immutable` e il ripiego su `precedente`, `/api/app-info` che legge il manifesto, il rifiuto all'avvio. Prove nuove nel collaudo del servizio | `server/pathfinder-server.js`, `server/test/collaudo.js` |
| 4 | **Installazione e ritorno indietro** — `installa-versione.ps1` e `torna-indietro.ps1`, l'avvolgimento di una build a file singolo, `installa-servizio.ps1` che impara la variabile nuova | `server/*.ps1` |
| 5 | **La prova vera** — sulla 4199 contro una copia del database, poi la migrazione delle versioni esistenti in `C:\Pathfinder\app\` e l'installazione | — |
| 6 | **I documenti** — INDEX §5 e §7bis riscritte, HANDOFF, README §installazione | `INDEX.md`, `HANDOFF/`, `README.md` |

`SINGLE_FILE=1` resta e continua a produrre il file unico: serve il giorno in cui
qualcosa non torna e si vuole tornare al modello vecchio senza discutere.

## 8. Le trappole

- **Mai `Remove-Item -Recurse` su una giunzione.** In PowerShell 5.1 — quello di
  questa macchina — può svuotare **la cartella di destinazione** invece di
  togliere il collegamento. Si usa `cmd /c rmdir "…\corrente"` oppure
  `[System.IO.Directory]::Delete($p)`, che tolgono il collegamento e basta. Gli
  script del blocco 4 devono usare solo quelli, e va scritto accanto alla riga.
- **Uno script `.ps1` con caratteri non ASCII vuole il BOM** — trovato subito,
  il 17/08. Senza, PowerShell 5.1 legge il file come ANSI e `—` diventa `â€”`:
  quel `”` è un delimitatore di stringa, e lo script muore con un errore di
  parentesi che non c'entra niente. Tutti gli `.ps1` di `server/` cominciano con
  `EF BB BF`.
- **E un manifesto si legge togliendo il BOM** — trovato al banco, con tutti i
  collaudi verdi. `Out-File -Encoding utf8` in PowerShell 5.1 lo scrive, e
  `JSON.parse` su di lui lancia: dopo un ritorno indietro `/api/app-info`
  rispondeva versione e impronta **nulle**, cioè proprio i due numeri su cui si
  verifica un'installazione. Adesso lo script scrive senza BOM **e** il servizio
  lo tollera, e il manifesto finto del collaudo ne porta uno apposta.
- **Mai servire la cartella intera con `express.static`.** Solo `index.html` e
  `assets/`. La differenza si vede il giorno in cui `APP_DIR` punta per sbaglio
  a una cartella di sorgenti.
- **`index.html` resta `no-cache`, gli assets `immutable`.** Invertire i due è
  il difetto peggiore possibile: i terminali resterebbero su una versione
  vecchia senza modo di uscirne, e nessun riavvio del servizio li salverebbe.
- **Non puntare mai la produzione a `consegna/`.** È `outDir`, e `npm run build`
  la azzera. È successo il 14/08 ed è costato il 404 potenziale su tutti i
  terminali.
- **Una versione installata è di sola lettura.** Reinstallare sopra una cartella
  che esiste già cancella la via di ritorno: lo script si ferma.
- **La giunzione non deve stare in OneDrive.** OneDrive e i collegamenti di
  cartella non vanno d'accordo, e questa è metà della ragione per cui
  `C:\Pathfinder\app\` esiste.
- **`consegna/` resta dentro OneDrive** ed è sincronizzata a ogni build: sono
  1,6 MB per volta, sprecati. Vale la pena escluderla dalla sincronizzazione —
  non blocca niente, ma è la stessa igiene del database.

## 9. Criterio di riuscita

**Si installa e non cambia niente a video** — lo stesso criterio della 1.4.0, e
per la stessa ragione: un cambio di modello di consegna che si vede è un cambio
di modello di consegna andato storto. Con due misure dichiarate:

| | oggi | con la 1.7 — **misurato** |
|---|---:|---:|
| Primo caricamento | 1.610 kB | **251 kB** |
| Ricarica successiva | 1.610 kB | **300 byte** |
| `xlsx` | sempre | 167 kB, solo a import/export |

E una prova che vale più delle tre: **il ritorno indietro va provato prima di
servire la 1.7 agli operatori**, non dopo. Si scambia, si ricarica un terminale,
si torna avanti. Un ritorno indietro provato una volta sola è un ritorno
indietro che funziona.

## 10. Le decisioni

Continuano la numerazione di [PIANO-1.4 §8](PIANO-1.4.md) — l'ultima era D21.

| # | Decisione | Perché |
|---|---|---|
| **D22** | **La consegna multi-file prende il numero 1.7**, e la UOM riscritta slitta alla **1.8**. Tutto il resto scala di uno: viste giacenza 1.9, trasferimenti da ODP 1.10, UI mobile 1.11, UDC 1.12, motore di stoccaggio 1.13, WIP 1.14 | Il refactoring delle viste e la UOM lavorano subito sul modello nuovo, invece di migrare due volte. Le date non si muovono — D21 |
| **D23** | **Una versione è una cartella**, e una build a file singolo è una cartella con dentro il solo `index.html` | Il servizio ha un modo solo. Nessun ramo di codice percorso una volta l'anno |
| **D24** | **Le versioni installate vivono in `C:\Pathfinder\app\`**, fuori da OneDrive | Un conflitto di sincronizzazione non deve poter riscrivere ciò che i terminali scaricano. Stessa ragione del database, dalla 1.0 |
| **D25** | **Lo scambio è il ripuntamento della giunzione `corrente`**; `precedente` resta puntata alla versione lasciata | Installare e tornare indietro senza amministratore e senza riavvio. `precedente` copre chi ha la pagina a metà caricamento |
| **D26** | **Il manifesto con l'impronta sostituisce il conteggio dei byte** come prova d'identità di una build | Con una cartella «i byte» non sono un numero solo, e un rituale di verifica che muore in silenzio è peggio di uno cambiato |
| **D27** | **`xlsx` si carica a richiesta** | 864 KB su 1,61 MB per una funzione che gira qualche volta al giorno |
| **D28** | **`service_version` passa a `'1.7'`**, e da qui si muove **quando cambia il contratto del servizio**, non a ogni rilascio dell'applicativo | Chiude l'aperto #8. Qui il contratto cambia davvero: una variabile nuova e una famiglia di rotte nuova. La versione dell'applicativo la dice il manifesto, e sono due cose diverse |
| **D29** | **La compressione si paga in build, non a ogni richiesta.** La build scrive un `.gz` accanto a ogni file dell'applicativo; il servizio lo passa a chi lo accetta, e chi non lo accetta riceve il file in chiaro che resta lì accanto | Il servizio non aveva **mai** compresso niente: 1,61 MB in chiaro a ogni ricarica. Comprimere a ogni richiesta sarebbe CPU spesa per riottenere sempre lo stesso byte — questi file non cambiano mai, il nome porta l'impronta. E nessuna dipendenza nuova: lo `zlib` di Node c'è già |

---

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
