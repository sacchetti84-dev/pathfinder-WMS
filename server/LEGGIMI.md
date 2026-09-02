# Pathfinder — servizio dati (originale italiano)

> **Documento fermo alla 2.5.** Descrive SQLite come unico database e
> `installa-servizio.ps1` come installer. La versione corrente è
> [`README.md`](README.md), in inglese, scritta sulla 2.16. Questo resta
> perché porta il *perché*, che l'inglese riassume.

Il database non vive più dentro il browser. Vive sulla macchina, in un file, e
un servizio Node lo serve ai terminali di magazzino.

## Perché

Con IndexedDB ogni terminale aveva **il suo** database: due postazioni erano due
magazzini diversi che si somigliavano. E il deposito era il profilo del browser —
lo stesso pulsante «Cancella dati di navigazione» lo portava via.

Ora c'è un file `pathfinder.db`. Lo si copia, lo si mette in backup, lo vedono
tutti i terminali.

## Installazione

Sulla macchina che ospita il database, **una volta sola**:

```powershell
cd server
.\installa-servizio.ps1
```

Da PowerShell come amministratore. Lo script controlla Node, installa le
dipendenze, apre la porta sul firewall, registra l'avvio automatico e verifica
che risponda. Alla fine stampa i due indirizzi da usare.

Sui terminali non si installa niente: si apre l'indirizzo nel browser e si mette
come pagina iniziale.

Per togliere il servizio (il database resta):

```powershell
.\installa-servizio.ps1 -Disinstalla
```

## Come è fatto

```
server/
  pathfinder-server.js     il servizio: API, eventi, e serve l'applicativo
  lib/schema.js            le 14 collezioni, con le chiavi e gli indici di prima
  lib/db.js                il contratto di persistenza tradotto su SQLite
  test/collaudo.js         29 prove, fra cui la contesa fra due terminali
  data/pathfinder.db       il database
```

Tre famiglie di endpoint, e sono tre per un motivo:

- **`/api/c/...`** — le operazioni generiche del contratto. Non sanno niente di
  magazzino e non devono saperlo.
- **`/api/tx`** — un lotto di scritture tutto-o-niente. Serve alle transazioni
  del client che sono sole scritture.
- **`/api/op/...`** — le operazioni che leggono, decidono e riscrivono nello
  stesso respiro. **Queste devono stare qui**: fra il momento in cui un
  terminale legge «ci sono 40 colli» e quello in cui scrive «adesso sono 35»,
  un altro può averne presi 10. Sul server lettura e scrittura stanno dentro lo
  stesso lock, e chi arriva secondo viene respinto con un messaggio che
  l'operatore capisce.

## L'applicativo sceglie da solo

`pathfinder-1.0.html` decide da dove è stato aperto:

| Aperto come | Database |
|---|---|
| `http://…` servito dal servizio | sulla macchina |
| doppio clic sul file (`file://`) | IndexedDB, come prima |

Non esiste il caso in cui qualcuno apra il file dal disco e creda di star
scrivendo sul server. Si può forzare con `?db=local` o `?db=remote` per
confrontare i due supporti.

Servire l'HTML dal servizio chiude anche un difetto dichiarato nella v2.8.0: da
`file://` Chrome **nega** la persistenza dello storage, da `http://localhost`
la concede.

## Se il servizio cade

L'applicativo **si ferma e lo dice**, a schermo intero. È una scelta: niente
lavoro offline, niente code da risincronizzare, nessun dato che diverge. Un
operatore che continua a scansionare mentre il servizio è morto sta buttando via
il proprio turno.

La finestra si sblocca da sola appena il servizio torna, e rilegge tutto prima
di lasciar toccare qualcosa.

## Backup

Il database è un file. Il backup è una copia — ma **a caldo**, mentre il servizio
lavora:

```
POST /api/backup   { "dir": "D:\\backup" }
```

SQLite la fa in modo transazionalmente coerente. Copiare il file a mano mentre
il servizio scrive è l'unico modo di portarsi via un database rotto.

## Manutenzione

```powershell
# stato
Get-ScheduledTask -TaskName 'Pathfinder - Servizio dati'

# riavvio
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'

# collaudo (usa un database usa-e-getta, non tocca quello di lavoro)
cd server; npm test

# collaudo delle etichette Zebra — non serve una stampante:
# alza una finta Zebra sulla 9100 e legge i byte che le arrivano
cd server; node test/collaudo-stampa.js
```

## Le etichette sulle Zebra in rete — dalla 2.19

Un browser non apre un socket TCP, e la porta 9100 di una Zebra vuole
esattamente quello: la stampa la fa il servizio. `lib/zpl.js` costruisce
l'etichetta, `lib/stampa-zebra.js` apre il socket — separati perché
l'etichetta si prova senza stampante e la rete si prova senza guardare
l'etichetta.

**Il client manda un identificativo di stampante e la chiave di un record,
mai un'etichetta.** Indirizzo e porta li legge il servizio da `meta.printers`,
e il contenuto lo rilegge dal database: in regime GMP un'etichetta è un
documento, e un documento costruito dal browser si falsifica in una console.

Due cancelli, e stanno nel codice — `meta` la scrive chiunque abbia una
sessione, quindi di un record di stampante non ci si fida comunque:

1. **la porta sta in un elenco chiuso** (6101, 9100-9103): senza, una
   «stampante» a `127.0.0.1:5432` fa parlare il servizio col proprio PostgreSQL;
2. **l'indirizzo si risolve prima di connettersi e dev'essere privato**: senza,
   il servizio diventa un ponte verso l'esterno.

**«Inviata» non è «stampata».** La 9100 accetta i byte e chiude: carta finita,
testina aperta e nastro esaurito passano tutti come successo. Il servizio manda,
poi chiede `~HQES`, e riporta i due fatti **separati** — l'interfaccia dice
quale dei due sta mostrando.

Le richieste alla **stessa** stampante si mettono in fila: la 9100 accetta una
connessione per volta, e con più terminali su una macchina sola è il caso
normale. Stampanti diverse restano parallele.

Tipo di supporto, calore, spellicolatore e salvataggio permanente **non si
mandano mai**: sono configurazione della macchina, si fanno col pannello.

Come si configurano le stampanti — e cosa deve fare la rete prima — sta in
[`../README.it.md`](../README.it.md), capitolo 6, e nella scheda tecnica per
l'IT (`documenti/IT-TECH-SHEET.md`, cap. 5.3).

## Una nota su `better-sqlite3`

Va tenuto a una versione che pubblichi il **binario già compilato** per il Node
installato. La 11 non ne ha per Node 24 e npm ripiega su `node-gyp`, che su
Windows pretende Visual Studio: l'installazione fallisce. Con la 13 è un
download di quindici secondi.

Se un domani si aggiorna Node, si controlla prima che esista il prebuild.
