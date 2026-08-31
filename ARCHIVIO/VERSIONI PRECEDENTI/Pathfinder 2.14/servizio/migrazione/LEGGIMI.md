# PostgreSQL — dalla 2.6 è un driver in servizio, non un ramo parallelo

Fino alla 2.5 questa cartella era un ramo che non chiamava nessuno: schema e
migrazione preparati il **19/08/2026** perché la decisione si potesse prendere
con i numeri davanti. **La decisione è stata presa il 26/08/2026**, e la 2.6
porta il driver dentro il servizio.

## Come si accende, e come si spegne

```
PATHFINDER_PG assente   → SQLite, esattamente come la 2.5. È la via di casa.
PATHFINDER_PG presente  → PostgreSQL con quella stringa di connessione.
PATHFINDER_PG vuota     → SQLite, dichiarato: batte quel che sta in .env.local.
```

**La 2.6 si installa in magazzino senza toccare il database.** Il servizio
nuovo apre lo stesso file di prima e si comporta come la 2.5; il passaggio a
PostgreSQL è un secondo gesto, separato, che si annulla spegnendo una
variabile. La 2.3 ha già insegnato quanto costa un salto solo senza via di
ritorno.

## Dov'è finito cosa

| File | Dov'era | Dov'è | Perché |
|---|---|---|---|
| `schema-postgres.js` | `server/azure/` | **`server/lib/`** | Il servizio lo esegue all'avvio, e `server/azure` è escluso da `tsconfig.server.json`. Qui resta un rimando, perché la migrazione lo nomina ancora dal percorso vecchio |
| `driver-postgres.js` | — | `server/lib/` | Nuovo |
| `driver-sqlite.js` · `driver-base.js` · `sql.js` | — | `server/lib/` | Nuovi: tutta la logica sta in `driver-base.js`, tutto lo SQL in `sql.js`, e i driver portano solo i quattro gesti che un database sa fare |
| `audit.js` · `audit-sqlite.js` | — | `server/azure/` | L'audit dei dati sporchi, che si passa **prima** di migrare |
| `migra-sqlite-postgres.js` | `server/azure/` | dov'era | Aggiornato: lo SQL viene da `lib/sql.js`, i codici si maiuscolano, e l'audit fa da guardia |

`pg` **è** una dipendenza del servizio dalla 2.6 — §6 chiedeva «un motivo
forte», e un driver in servizio lo è. Si installa con le altre:
`cd server && npm install`.

## Il giro completo, dall'inizio

**1. Una copia a caldo del database vero.** Non si lavora mai sull'originale.

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup `
  -ContentType 'application/json' -Body (@{dir="$PWD\banco\db"} | ConvertTo-Json)
```

**2. L'audit dei dati sporchi.** Esce 1 se trova qualcosa che PostgreSQL
rifiuta. Sul database del 26/08: zero ostacoli.

```powershell
node server/azure/audit-sqlite.js --da ".\banco\db\pathfinder-<data>.db"
```

**3. I codici in maiuscolo, sulla copia.** Senza `--scrivi` non tocca niente.

```powershell
node banco/maiuscola-codici.cjs --da ".\banco\db\pathfinder-<data>.db"
node banco/maiuscola-codici.cjs --da ".\banco\db\pathfinder-<data>.db" --scrivi
```

**4. Il database di arrivo.** `LC_COLLATE 'C'` **non è un dettaglio**: con una
collazione linguistica `ORDER BY location_code` restituisce un ordine diverso
da quello di SQLite, e il magazzino vede le corsie rimescolate. Il driver lo
controlla all'avvio e avverte se non torna; le colonne portano comunque
`COLLATE "C"` scritto nello schema, così la cosa non dipende da chi ha creato
il database.

```sql
CREATE DATABASE pathfinder OWNER pathfinder
  ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;
```

**5. La migrazione.** `--prova` legge e conta senza scrivere.

```powershell
node server/azure/migra-sqlite-postgres.js --da ".\banco\db\pathfinder-<data>.db" --prova
$env:PATHFINDER_PG = 'postgres://utente:password@host:5432/pathfinder?sslmode=require'
node server/azure/migra-sqlite-postgres.js --da ".\banco\db\pathfinder-<data>.db"
```

**6. Il collaudo a confronto.** `test/driver.test.js` fa girare la **stessa**
batteria sui due driver: se si comportano diversamente, lo dice il collaudo
invece di un turno di magazzino. Senza `PATHFINDER_PG` gira il solo SQLite e
le prove PostgreSQL si dichiarano saltate.

## Le scelte, e il perché

**Il documento è `JSONB`, non `TEXT`.** È l'unica ragione tecnica seria per cui
PostgreSQL vale la pena su questo modello. **Il client di oggi non lo sfrutta**
— legge e filtra a monte — ed è un fatto da sapere.

**Il `_id` si preserva, non si rigenera.** `tasks.mov_ids` e i riferimenti
degli archivi puntano a quei numeri: rinumerare romperebbe in silenzio i legami
che il registro delle attività legge. Le sequenze si riallineano alla fine, o
la prima scrittura nuova ripartirebbe da 1.

**Le colonne materializzate si ricalcolano dal documento**, invece di copiarle:
una colonna rimasta indietro non si porta dietro il proprio errore.

**`startsWith` non è un `LIKE`.** Il `LIKE` di SQLite ignora le maiuscole
sull'ASCII, quello di PostgreSQL no. Fino alla 2.5 lo stesso criterio voleva
dire tre cose diverse in tre posti — sensibile in Dexie, sensibile nella cache
del client, **insensibile sul servizio**, che era l'unico a usare `LIKE`. Ora è
`substr(colonna, 1, N) = ?`, uguale nei due database, e sui campi-codice il
termine cercato si maiuscola come il dato.

**Una transazione per volta.** `better-sqlite3` è sincrono ma l'interfaccia no:
un `await` dentro una transazione ridà il turno al ciclo degli eventi, e senza
una coda un'altra richiesta si infilerebbe dentro la transazione aperta. Su
PostgreSQL il pericolo è gemello: una transazione vive su **una** connessione
del pool. La stessa coda chiude tutti e due i casi. Il prezzo è un tetto di
throughput che SQLite aveva già.

**PostGIS non serve, e non è una dimenticanza.** Le ubicazioni non hanno
coordinate: `core/geometria.ts` le genera da corsie, campate e livelli, e la
mappa disegna una griglia. Il giorno che porteranno metri veri, se ne riparla.

## Quello che questo driver NON risolve

1. **«Niente lavoro offline» diventa «niente lavoro senza linea».** §6 dice che
   se il servizio non risponde l'applicativo si ferma a schermo intero. Oggi il
   servizio è un processo sulla stessa rete: cade quando cade il PC. Con il
   database in cloud, il magazzino si ferma anche quando cade la connessione
   dell'azienda — 300÷500 movimenti al giorno, con i muletti fermi. **È una
   decisione di continuità operativa, non di architettura**, ed è la prima cosa
   da guardare in faccia prima di accendere `PATHFINDER_PG` in produzione.

2. **La latenza va misurata sul percorso vero.** I giri di rete sono stati
   tolti dove si potevano togliere — l'anagrafica articoli passa da 11.197
   istruzioni a 12, `countAll` da venti a una — ma un'operazione composta resta
   più giri, e vanno cronometrati su prelievo guidato, DDT e chiusura del conto
   prima di decidere, non dopo.

3. **IL BACKUP CAMBIA PADRONE, e non è ancora rifatto.** `backup-serale.ps1` e
   `POST /api/backup` copiano un file; con PostgreSQL il ripristino è il
   point-in-time di Azure. Il driver alza un **501** invece di restituire un
   file finto, ma i due script e le 22 prove di installazione **vanno riscritti
   prima di mandare il magazzino su PostgreSQL**.

4. **Le stringhe di connessione.** In `.env.local` per il banco — che
   `.gitignore` esclude — e in **Azure Key Vault** per il servizio vero. Mai nel
   repository, mai negli script di installazione. Il pool si dimensiona sul
   numero di terminali: Flexible Server chiude le connessioni ferme, e
   `idleTimeoutMillis` sta sotto quella soglia apposta.
