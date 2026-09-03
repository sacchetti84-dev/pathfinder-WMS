# PostgreSQL — a driver in the service, not a parallel branch

Until release 2.5 this folder was a branch nobody called: schema and migration
prepared on 19 August 2026 so that the decision could be taken with the numbers
in front of it. **The decision was taken on 26 August 2026**, and release 2.6
brought the driver inside the service.

> Italian original: [`LEGGIMI.md`](LEGGIMI.md).

## Turning it on, and off

```
PATHFINDER_PG absent    → SQLite, exactly as in 2.5. This is the way home.
PATHFINDER_PG set       → PostgreSQL with that connection string.
PATHFINDER_PG empty     → SQLite, declared: it beats what .env.local says.
```

**Release 2.6 installs in the warehouse without touching the database.** The
new service opens the same file as before and behaves like 2.5; moving to
PostgreSQL is a second, separate act, undone by clearing one variable. Release
2.3 had already taught what a single jump with no way back costs.

## The three steps, in order

1. **Audit first.** `audit.js` and `audit-sqlite.js` look for the dirty data
   that a stricter database will refuse: duplicate keys that differ only by
   case, rows whose foreign reference no longer exists, text where a number is
   expected. It runs **before** anything is copied, and a migration does not
   start over a failed audit.
2. **Migrate a copy.** `migra-sqlite-postgres.js` never reads the live file. It
   takes the SQL from `lib/sql.js` — the same statements the service uses, not a
   second implementation that can drift — uppercases the codes as
   [§ codes](../README.md#data-shape) requires, and writes into the prepared
   PostgreSQL database.
3. **Re-count, table by table.** Row counts on both sides must match before the
   migration reports success. A migration that says "done" without counting is
   a migration nobody can trust.

## Uppercase, and why it is part of the migration

`maiuscola-codici.cjs` normalises codes in place on a SQLite database. It is run
once and is not application code.

This matters more than it looks. A database that held `123456#qwert` and
`123456#QWERT` as two rows holds **one** row after normalisation — and if both
sat in the same bay, one covers the other and the goods disappear. The check is
cheap and must be made **before** the migration, not after: count the rows, count
the distinct uppercased keys, and compare. The bench that does this for the jump
from release 1.4 is `banco/migrazione/dalla-1.4.cjs`.

## `COLLATE "C"`, and why every text column has it

Without it, `ORDER BY location_code` shuffles the aisles: a locale-aware
collation does not sort `MAG1-RAKA-01-10-A` after `MAG1-RAKA-01-09-A` the way a
warehouse walk does. The DDL comes from the same declaration as the SQLite
schema, so the two cannot drift — see `lib/schema-postgres.js`.

## Files

| File | What it does |
|---|---|
| `migra-sqlite-postgres.js` | The migration itself. SQL from `lib/sql.js`, codes uppercased, audit as gatekeeper |
| `audit.js` · `audit-sqlite.js` | The dirty-data audit, run before copying |
| `maiuscola-codici.cjs` | One-off in-place normalisation of codes on SQLite |
| `LEGGIMI.md` | Italian original of this file |

The folder travels inside the installation package, so a machine being migrated
has everything it needs without a checkout.
