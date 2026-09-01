# Pathfinder — data service

Node + Express. It holds the data and serves the application to the warehouse
terminals. One database, several terminals, and the server is the referee.

Installation, configuration, backup and upgrade are in the
[root README](../README.md). This file is about how the service is built.

> Italian notes: [`LEGGIMI.md`](LEGGIMI.md) — kept for its reasoning, but
> written before release 2.7 and still describing SQLite as the only database.
> [`LEGGIMI-pacchetto.txt`](LEGGIMI-pacchetto.txt) is shipped inside the
> installation package and stays in Italian, because it is read by whoever
> installs in the warehouse.

---

## Why a service at all

With IndexedDB every terminal had **its own** database: two workstations were
two warehouses that resembled one another. And the store was the browser
profile — the same "Clear browsing data" button took it away.

---

## Two databases, one set of logic

| File | Lines | Role |
|---|---:|---|
| `pathfinder-server.js` | ~1,700 | Express: routes, SSE, sessions, optional TLS, the application folder, startup. `const VERSION` lives here |
| `lib/db.js` | 78 | **The façade.** Reads `PATHFINDER_PG` (machine variable, then `.env.local`) and picks the driver. An **empty** variable means "no, SQLite", and beats the file |
| `lib/driver-base.js` | 318 | **All the service logic, once, for both databases**: writes, reads, filters, transactions, revision and notification, uppercase normalisation. Uses `AsyncLocalStorage`, not a flag |
| `lib/driver-sqlite.js` | 121 | `better-sqlite3`, schema migration, file backup |
| `lib/driver-postgres.js` | 267 | `pg`, the pool, the connection pinned to the transaction, sequence realignment, `int8` decoded to number, and waiting for the server to come up |
| `lib/sql.js` | 259 | **All the SQL, with the dialect as a parameter.** `startsWith` is `substr(col,1,N) = ?` and **not** a `LIKE` |
| `lib/schema.js` · `lib/schema-postgres.js` | 297 · 133 | Tables and indexes in **two separate functions**, with the migration in between, plus the `MAIUSCOLE` list · the PostgreSQL DDL from the **same** declaration, with `COLLATE "C"` on every text column — without it, `ORDER BY location_code` shuffles the aisles |

The drivers carry only the four things a database knows how to do. Anything
that could be written once is written once.

---

## Data shape

Documents in JSON with materialised columns: only the fields searched on are
indexed, the rest lives in a `data` column. Normalising everything would
restore the chain IndexedDB did not have — a new field would mean an
`ALTER TABLE` and a service outage.

There are **21 collections**, declared in one place (`src/types/collezioni.ts`);
a `satisfies` clause stops compilation if the adapters or the service diverge
from that list.

**Codes are stored uppercase, and the service does it** on every write from
wherever it comes: article, lot, `item_key`, location, load unit, SSCC,
production order, delivery note, operator initials, unit of measure. A code in
two spellings is not a display problem — it is a second entity being born. The
list is `MAIUSCOLE` in `lib/schema.js`; it deliberately excludes PIN material
(base64), `meta` keys (camelCase), enums compared literally, and prose.

---

## Routes

| Family | Routes |
|---|---|
| **Application** | `/` and `/app` → the index, **`no-cache`** · `/assets/:file` → assets, **`immutable`, one year**, falling back to the previous release |
| **Open without a session** | `/api/health` · `/api/app-info` (queried by the installer, **before** any PIN exists) · `/api/auth/*`, which is the door. `/api/auth/operatori` returns **the minimum**: initials, name, role, "has a PIN" |
| **Collections** | `GET/POST/PUT/PATCH/DELETE /api/c/:col[/:key]` · `/bulk` · `/count` · `/query` — **session required since 2.11** |
| **Composed operations** | `/api/tx` · `/api/op/removeItem` · `/api/op/commitPickStop` · `/api/op/sampleItem` · `/api/op/moveUdc` · `/api/op/verifyPin` · `/api/op/hashPin` · `/api/op/rinnovaPin` |
| **Service** | `/api/load` · `/api/clear` · `/api/deleteWhere/:col` · `/api/backup` · `/api/events` (SSE) |

`moveUdc` moves a load unit and all its rows **in one transaction**, refuses if
the same key already sits outside the unit in the destination bay, and writes
one movement record per batch carried — a single record naming nothing is not
the signature of who moved the goods.

---

## Two guards, in this order

Both are `app.use('/api', …)` middleware, after `express.json()`.

1. **The session guard** (since 2.11). Writes and reads on `/api/c/*` need a
   session cookie, or the machine key. Answers **401**, not 403: the client
   reads the difference to decide whether to reopen the identification screen.
2. **The role guard** (since 2.13, extended in 2.16). The operator roster is
   the Admin's. It watches not only `/c/operators` but the transaction that
   touches it in passing, the `clear` that names it in a list, and `bulk` — one
   of those left open is the whole rule not holding. Answers **403** when the
   role is missing, and **409** when the role is there but the *state the write
   would leave behind* is not allowed: the last active Admin cannot demote,
   deactivate or delete themselves. That check **simulates** the write against a
   copy of the roster, so it holds inside a transaction too.

Three exceptions, and they are always the same three: the **first run** (the
first Admin has to be created, and nobody can authorise them yet), the
**machine key** (backup, installer and migrations have no PIN and no role —
they have a key), and **PIN renewal**, which has its own route and checks the
hierarchy itself.

---

## Migration

`migrazione/` — SQLite → PostgreSQL, plus the audit that runs **before** the
copy. It travels inside the installation package. It migrates a **copy** and
re-checks the counts table by table. See [`migrazione/README.md`](migrazione/README.md).

---

## Tests

```bash
node test/collaudo.js                    # 141 checks on the service
node test/collaudo-installazione.js      # 43 on the installation scripts
node test/collaudo-migrazione-1.4.js     # 8 on the schema change
```

`test/collaudo.js` runs against SQLite by default. `PATHFINDER_COLLAUDO_PG=1`
runs the same suite against PostgreSQL, and requires `PATHFINDER_PG_COLLAUDO`
to be set — without it, it stops and says so rather than silently skipping. The
database name in that string must end in `_collaudo`.

The last twelve service checks cover waiting for PostgreSQL to come up, with a
fake clock and fake sleep, so they run instantly.
