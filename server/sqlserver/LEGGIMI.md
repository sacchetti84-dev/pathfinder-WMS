# Il ramo SQL Server — parallelo, e non ancora in servizio

Costruito il **25/08/2026**, il giorno che la migrazione del database è stata
confermata su **Microsoft SQL Server** (voce 36 dell'INDEX). Pathfinder in
produzione gira su SQLite, e continua a girarci: qui non c'è niente che
l'applicativo chiami.

Questo ramo è **l'avvio**, non la migrazione. Copre i due pezzi che si possono
fare senza toccare quello che lavora — lo schema e la copia dei dati — e lascia
fuori il pezzo grosso, che è `lib/db.js`. Vedi «Cosa manca», in fondo.

## Cosa c'è

| File | Cosa fa |
|---|---|
| `schema-sqlserver.js` | Genera il DDL T-SQL **dalla stessa dichiarazione** di `lib/schema.js`. Non ricopia le venti collezioni: le legge |
| `migra-sqlite-sqlserver.js` | Copia una **copia** del database SQLite dentro SQL Server, tavolo per tavolo, e ricontrolla i conteggi |
| `test/schemaSqlServer.test.js` | 14 prove, e girano a ogni `npm test`: che lo schema descriva le stesse collezioni del servizio di oggi, e che le tre trappole di T-SQL restino chiuse |

## Come si prova

```powershell
# 1. una copia a caldo del database vero, scritta dove si lavora
Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup `
  -ContentType 'application/json' -Body (@{dir="$PWD\banco\db"} | ConvertTo-Json)

# 2. cosa c'è dentro, senza scrivere niente da nessuna parte
node server/sqlserver/migra-sqlite-sqlserver.js --da ".\banco\db\pathfinder-<data>.db" --prova

# 3. la migrazione vera, su un database di PROVA
npm install --no-save mssql
$env:PATHFINDER_MSSQL = 'Server=host;Database=pathfinder_prova;Trusted_Connection=true;Encrypt=true'
node server/sqlserver/migra-sqlite-sqlserver.js --da ".\banco\db\pathfinder-<data>.db"
```

`mssql` **non è una dipendenza del progetto**, ed è voluto: §6 dice «niente
dipendenze nuove senza motivo forte», e un ramo che non è in servizio non è un
motivo forte. `--no-save` lo installa senza scriverlo in `package.json`.

## Le tre trappole di T-SQL, e sono chiuse

Non sono ipotesi da manuale: **due delle tre morderebbero già adesso**, su
questo schema, alla prima riga di DDL.

**1. `meta` ha una colonna che si chiama `key`, che in T-SQL è una parola
riservata.** Senza le parentesi quadre quel `CREATE TABLE` non compila. Perciò
qui **ogni identificatore è quotato**, tabelle e colonne: costa niente e toglie
di mezzo la categoria intera, invece di lasciare a chi verrà il compito di
ricordarsi quali nomi sono a rischio.

**2. Una chiave di indice non può essere `NVARCHAR(MAX)`.** Su SQLite le
colonne materializzate sono `TEXT` senza limite e indicizzate tutte; qui
diventano `NVARCHAR(200)`. Duecento è il doppio abbondante del valore più lungo
che lo schema può produrre — `item_key` è `ARTICOLO#LOTTO`, trenta più trenta
più il separatore, cioè 61 — e sta largo sotto il limite della chiave.

**3. `IF NOT EXISTS` non esiste** su `CREATE TABLE` né su `CREATE INDEX`.
SQLite e PostgreSQL ce l'hanno, SQL Server no: la guardia si scrive a mano con
`OBJECT_ID` e `sys.indexes`. Serve perché lo schema si rilancia sopra un
database che già esiste, e deve essere un'operazione ripetibile.

## Le scelte, e il perché

**`NVARCHAR`, mai `VARCHAR`.** Descrizioni articolo, nomi operatore e ragioni
sociali sono italiani e portano le accentate. `VARCHAR` sotto una collation non
Unicode le storpia **in silenzio**: non dà errore, dà un punto interrogativo
dentro una descrizione, e il registro si tiene sei anni.

**Il documento è `NVARCHAR(MAX)` con `CHECK (ISJSON(...) = 1)`, non il tipo
`json` nativo.** Il tipo nativo esiste nelle versioni recenti, ma quale versione
abbia l'azienda è una delle due domande ancora aperte: questa forma funziona su
tutto quello che potrebbe rispondere — SQL Server dal 2016 in avanti e Azure
SQL. Si stringe al tipo nativo il giorno che la versione è nota, ed è un
`ALTER`, non una riscrittura.

**Il `_id` si preserva, non si rigenera.** `tasks.mov_ids` e i riferimenti degli
archivi puntano a quei numeri: rinumerare romperebbe in silenzio i legami che il
registro delle attività legge. Su una colonna `IDENTITY` questo chiede
`SET IDENTITY_INSERT` — **una tabella per volta**, perché SQL Server ne ammette
una sola accesa per sessione — e poi `DBCC CHECKIDENT ... RESEED`, senza il
quale la prima scrittura nuova riparte da 1 e sbatte contro la chiave primaria,
a magazzino aperto.

**Le colonne materializzate si ricalcolano dal documento**, invece di copiarle.
Se una colonna a SQLite fosse rimasta indietro rispetto al proprio `data` — la
voce 14 (`updated_at` contro `last_updated_at`) e la voce 38 (le maiuscole) sono
esattamente questo — la copia nasce coerente invece di portarsi dietro l'errore.

## Una cosa che cambia rispetto a quello che si diceva con PostgreSQL

Il ramo `azure/` metteva un indice **GIN** sul documento `JSONB`, e lo
dichiarava «l'unica ragione tecnica seria per cui PostgreSQL varrebbe la pena su
questo modello»: il documento resta un documento e si può interrogare senza
rileggerlo tutto in memoria.

**Su SQL Server quell'argomento non si trasferisce.** Non esiste un equivalente
del GIN: si indicizza un campo del documento promuovendolo a **colonna calcolata
persistita** e mettendo l'indice su quella — un campo per volta, dichiarato.
Quindi qui il documento è testo con un controllo di validità, e basta.

Non cambia la decisione, che è presa per altre ragioni. Cambia **cosa
aspettarsi**, ed è meglio saperlo adesso che dopo. Va detto anche che il client
di oggi non lo sfruttava comunque: legge e filtra a monte.

## Le due domande ancora aperte, e sono dell'IT

Stanno nella voce 36 dell'INDEX, e nessuna delle due blocca quello che c'è qui:

1. **Quale versione di SQL Server.** Decide se il documento resta
   `NVARCHAR(MAX)` con `ISJSON` o diventa il tipo `json` nativo. Lo schema di
   oggi funziona in entrambi i casi.
2. **Se è la stessa istanza su cui gira Sage X3.** Se lo fosse, l'azienda ha già
   istanza, backup e chi la amministra — e risponderebbe da sola alla **voce
   37**, cioè se il motore sta in azienda o è Azure SQL.

Quella voce 37 non è un dettaglio di sistemistica: su un'istanza interna §6
regge com'è, «niente Azure» compreso, e l'autenticazione può essere quella
integrata di Windows, senza nessuna password da custodire — il servizio gira già
come SYSTEM da un'attività pianificata. Su Azure SQL «niente lavoro offline»
diventa «niente lavoro senza linea», e il magazzino si ferma quando cade la
connessione dell'azienda: 300÷500 movimenti al giorno, coi muletti fermi.

## Cosa manca, ed è il grosso

Questo ramo copre **due pezzi su cinque**. Gli altri tre non stanno qui, e sono
il motivo per cui la migrazione non è «quasi fatta»:

1. **`lib/db.js` va riscritto, non configurato.** Sono **315 righe di SQLite
   sincrono**: `better-sqlite3` è sincrono, un driver di rete no. Ogni rotta,
   ogni transazione composta e le **98 prove del servizio** diventano asincrone.
   È il pezzo più grosso della migrazione. E va **misurato sul percorso vero** —
   prelievo guidato, DDT, chiusura del conto — perché una transazione che oggi
   costa microsecondi su un file lì costa un giro di rete, e le operazioni
   composte ne fanno più d'uno.
2. **Il backup e il ritorno indietro cambiano padrone.** `backup-serale.ps1` e
   `POST /api/backup` copiano un file, e `torna-indietro.ps1` riporta il dato
   insieme all'applicativo. Con il dato fuori dal file quel gesto non esiste
   più: `torna-indietro.ps1` riporta solo l'applicativo, e il **collaudo di
   installazione — 22 prove — va riscritto per intero**.
3. **Il pool.** Si dimensiona sul numero di terminali, non si lascia al valore
   di serie: un motore di rete chiude le connessioni inattive, e un pool che non
   se ne accorge muore a metà turno.

## Scadenza

Progetto **31/12/2026**, ultima installazione utile **19/12** — poi c'è
l'inventario. Da qui a lì la coda porta anche le voci 33-34 e le maschere col
PIN della voce 20: due riscritture strutturali nello stesso trimestre, su un
applicativo che regge un magazzino, sono la cosa da non fare. Vedi la voce 39,
React, che per questo si comincia **dopo**.
