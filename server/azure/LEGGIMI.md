# Il ramo Azure — parallelo, e non in servizio

Costruito il **19/08/2026** su richiesta esplicita: preparare schema e
migrazione verso **Azure Database for PostgreSQL (Flexible Server)** *senza
toccare quello che lavora*. Pathfinder in produzione gira su SQLite, e
continua a girarci: qui non c'è niente che l'applicativo chiami.

## Cosa c'è

| File | Cosa fa |
|---|---|
| `schema-postgres.js` | Genera il DDL PostgreSQL **dalla stessa dichiarazione** di `lib/schema.js`. Non ricopia le venti collezioni: le legge |
| `migra-sqlite-postgres.js` | Copia una **copia** del database SQLite dentro PostgreSQL, tavolo per tavolo, e ricontrolla i conteggi |
| `test/schemaPostgres.test.js` | L'unica parte di questo ramo che gira a ogni `npm test`: verifica che lo schema PostgreSQL descriva le stesse collezioni del servizio di oggi |

## Come si prova

```powershell
# 1. una copia a caldo del database vero, scritta dove si lavora
Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup `
  -ContentType 'application/json' -Body (@{dir="$PWD\banco\db"} | ConvertTo-Json)

# 2. cosa c'è dentro, senza scrivere niente da nessuna parte
node server/azure/migra-sqlite-postgres.js --da ".\banco\db\pathfinder-<data>.db" --prova

# 3. la migrazione vera, su un database di prova
npm install --no-save pg
$env:PATHFINDER_PG = 'postgres://utente:password@host.postgres.database.azure.com:5432/pathfinder?sslmode=require'
node server/azure/migra-sqlite-postgres.js --da ".\banco\db\pathfinder-<data>.db"
```

`pg` **non è una dipendenza del progetto**, ed è voluto: §6 dice «niente
dipendenze nuove senza motivo forte», e un ramo che non è in servizio non è
un motivo forte. `--no-save` lo installa senza scriverlo in `package.json`.

## Le tre scelte, e il perché

**Il documento diventa `JSONB`, non `TEXT`.** È l'unica ragione tecnica
seria per cui PostgreSQL varrebbe la pena su questo modello: il documento
resta un documento e si può interrogare senza rileggerlo tutto in memoria.
**Il client di oggi non lo sfrutta** — legge e filtra a monte — ed è un
fatto da sapere prima di firmare, non dopo.

**Il `_id` si preserva, non si rigenera.** `tasks.mov_ids` e i riferimenti
degli archivi puntano a quei numeri: rinumerare romperebbe in silenzio i
legami che il registro delle attività legge. La sequenza si riallinea a
mano alla fine di ogni tavolo, o la prima scrittura nuova ripartirebbe da 1.

**Le colonne materializzate si ricalcolano dal documento**, invece di
copiarle. Se una colonna a SQLite fosse rimasta indietro rispetto al proprio
`data` — la voce 14 della coda di lavoro, `updated_at` contro
`last_updated_at`, è esattamente questo — la copia nasce coerente invece di
portarsi dietro l'errore.

## PostGIS non serve, e non è una dimenticanza

La richiesta lo nomina per «le coordinate della mappa 2D/3D». Le ubicazioni
di Pathfinder **non hanno coordinate**: `core/geometria.ts` le genera dalla
configurazione della zona — corsie, campate, livelli, posizioni — e la mappa
disegna una griglia, non un piano cartesiano. Un'estensione spaziale su dati
che spaziali non sono è una dipendenza in più e nessuna query in meno. Il
giorno che le ubicazioni porteranno metri veri, se ne riparla.

## Quello che questo ramo NON risolve, e che decide se ha senso accenderlo

1. **«Niente lavoro offline» diventa «niente lavoro senza linea».** §6 dice
   che se il servizio non risponde l'applicativo si ferma a schermo intero,
   e oggi il servizio è un processo sulla stessa rete: cade quando cade il
   PC. Con il database in cloud, il magazzino si ferma anche quando cade la
   connessione dell'azienda — 300÷500 movimenti al giorno, con i muletti
   fermi. È una decisione di continuità operativa, non di architettura.

2. **La latenza di ogni transazione.** `/api/op/*` risolve la concorrenza
   con una transazione per operazione. Oggi quella transazione costa
   microsecondi su un file locale; verso una regione Azure costa un giro di
   rete, e le operazioni composte ne fanno più d'uno. Va misurato sul
   percorso vero — prelievo guidato, DDT, chiusura del conto — prima di
   decidere, non dopo.

3. **Il backup e il ritorno indietro cambiano padrone.** `backup-serale.ps1`
   e `POST /api/backup` copiano un file; con PostgreSQL il ripristino è
   point-in-time di Azure, e `torna-indietro.ps1` non riporta più il dato,
   solo l'applicativo. Il collaudo di installazione (22 prove) va riscritto
   per intero.

4. **Il servizio dati va riscritto, non configurato.** `lib/db.js` sono 315
   righe di SQLite sincrono; `better-sqlite3` è sincrono e `pg` no. Ogni
   rotta, ogni transazione composta e le 85 prove del servizio diventano
   asincrone. È il pezzo di lavoro più grosso di tutta la migrazione, e non
   è in questo ramo.

5. **Le stringhe di connessione.** In `.env` per la prova, in **Azure Key
   Vault** per il servizio vero, mai nel repository e mai negli script di
   installazione. Il pool va dimensionato sul numero di terminali, non
   lasciato al valore di serie: Flexible Server chiude le connessioni
   inattive, e un pool che non se ne accorge muore a metà turno.

## Scadenza

Progetto **31/12/2026**, ultima installazione utile **19/12** — poi c'è
l'inventario. Questo ramo esiste perché la decisione si possa prendere con i
numeri davanti, non perché sia già presa.
