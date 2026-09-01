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
```

## Una nota su `better-sqlite3`

Va tenuto a una versione che pubblichi il **binario già compilato** per il Node
installato. La 11 non ne ha per Node 24 e npm ripiega su `node-gyp`, che su
Windows pretende Visual Studio: l'installazione fallisce. Con la 13 è un
download di quindici secondi.

Se un domani si aggiorna Node, si controlla prima che esista il prebuild.
