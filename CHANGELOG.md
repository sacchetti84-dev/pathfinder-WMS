# Changelog

Pathfinder — warehouse management for a GMP food-grade facility.
© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group). Internal use.

Version numbers are sequential. A release build carries **two** numbers
(`2.12`); a trial build carries more (`2.12.1`). A version is the application
**plus** the service: they are installed together, and the installer checks
that both report the same number.

Dates are recorded as facts that happened, never as promises.

The authoritative record is [`INDEX.md`](INDEX.md), in Italian. This file is a
summary for readers who need the shape of the history without the detail.

---

## 2.19.0 — 2026-09-02

**Item and load-unit labels now print on networked Zebra printers. The service
talks to the printer, because a browser cannot open a TCP socket.**

Port 9100 on a Zebra needs a raw TCP connection, and no browser API provides
one — not even to a local address. The alternatives (Zebra Browser Print, or a
printer driver per machine) both leave the MC9400 handheld uncovered, because
there the application is a web page. The service already exists, is already the
arbiter for concurrency, and serves the desk and the handheld with the same
code. No new dependencies: `net` and `dns` ship with Node.

**The address never comes from the request.** The client sends a `printer_id`
and a record key; host and port are read from configuration. Two gates guard
what configuration says, because any signed-in operator can write it: the port
must be in a closed list (6101, 9100–9103), and the host is resolved *before
connecting* and must be a private address — otherwise the service becomes a
bridge to the outside.

**The service builds the label, not the browser.** Under GMP a label is a
record, and one built by the client can be forged from a console. Bars are
drawn by printer firmware (`^BC`); the check digit is never computed twice.

**"Sent" is not "printed", and the interface says which one it is showing.**
Port 9100 accepts the bytes and closes — out of media, head open and ribbon out
all look like success. The service therefore queries `~HQES` after every send
and reports the two facts separately. Without this, a finished roll would mean
pallets created with no label and nobody told.

- **Configurable label layout** for goods labels: barcode, description, expiry
  and weight, plus article code and lot. Each field has a height in millimetres,
  alignment and wrap count; the total is shown against the roll height while you
  choose it. **A layout taller than the media is refused, not truncated.**
- The weight row is titled for what it is: "Peso" for KG and GR, "Quantità" for
  PZ, MT and LT — calling pieces a weight misleads whoever reads the label six
  months later.
- **Load-unit labels have no layout, by decision.** A pallet carries N lines of
  N different articles; description, expiry and weight are not even defined for
  one. Only the media size is configurable.
- The printer choice is remembered per browser; the copy count always returns
  to 1, capped at 50 per send.
- Requests to the same printer are serialised — port 9100 accepts one
  connection at a time.
- The service never sends media type, darkness, peel-off or persistent-save
  commands: those are machine configuration, set once at the panel.
- **A4 printing is unchanged.** The printer is added alongside the sheet, never
  in place of it.
- 76 new service tests (`server/test/collaudo-stampa.js`) run against a fake
  printer listening on 9100 — no hardware required. What hardware *is* still
  required for — a real scanner reading the bars, print alignment, darkness —
  is recorded as open work.

---

## 2.18.1 — 2026-09-02

**The minimum Node version was wrong, and continuous integration found it on
its second run.**

`better-sqlite3` 13 declares `engines: { node: ">=22" }` and ships a prebuilt
binary for that ABI. This project declared **`>=20`** — in both `package.json`
files, in the IT data sheet, and in the list of prerequisites asked of the IT
team. The development machine runs Node 24, so nobody had ever hit it.

On a machine with Node 20 LTS — which the data sheet explicitly permitted —
`npm ci` prints an `npm warn EBADENGINE` among fifty lines of output, installs
anyway, and the process then dies loading the native module. **It dies in every
configuration**, PostgreSQL included, because `lib/db.js` requires the SQLite
driver at the top of the file. The installation would have completed and the
service would not have started.

- `engines.node` corrected to **`>=22`** in the client and in the service.
- **The installer now checks the version**, not just that Node exists, and
  stops without touching anything if it is below 22 — the same rule
  `prepara-postgres.ps1` applies to a missing database engine.
- The IT data sheet (rev04) says **Node LTS ≥ 22** in all four places where it
  said 20, in both languages.
- CI runs on **Node 22** — the declared minimum, not the developer's version.
- A test in `test/regole.test.js` now fails if `engines` promises less than any
  installed dependency requires. Verified red by putting `>=20` back.

Also in this build: the CI workflow installs the service dependencies **before**
the type check — `npm run check` type-checks `server/**/*.js` with `checkJs` on,
and needs `express`, `pg` and `better-sqlite3` resolvable. The first run failed
there. GitHub Actions moved to v7, whose own runtime is Node 24.

**No application behaviour changed.** The fingerprint does move — from
`4df34781…` to `0e46abd7…` — because the version number is printed on the foot
of every document, so it lives in the bundle. Nothing else in the application
is different.

---

## 2.18 — 2026-09-02

Answers an external IT audit of the repository (REP-AUDIT-001, 2026-09-02).
Findings C1 and C2 were formally accepted as risks by the author; C3 to C10
are closed here. Each fix carries its own test, and every new test was
verified **red** by reintroducing the defect it covers.

**Security**

- **The request body is no longer read before the caller is identified.**
  `express.json({ limit: '256mb' })` was registered *before* the session
  guard, so any unauthenticated caller on the network could make the process
  allocate up to 256 MB per request and only then receive a 401. The parser
  now sits **after** the guard, and the high limit lives **only** on the four
  import routes (`/api/c/:col/bulk`, `/api/tx`, `/api/clear`,
  `/api/deleteWhere/:col`); everything else is capped at 2 MB.
- **The public roster no longer carries names.** `GET /api/auth/operatori`
  answers without a session — it has to, it draws the login screen — but it
  used to return `first_name`, `last_name` and `rec_set` for every active
  operator. Anyone on the network got the staff directory with roles, and
  knew which Admins held a recovery code. It now returns initials, role and
  `pin_set` only; full names arrive after login. The recovery screen lists
  all Admins and lets the service reject a wrong code.
- **Sessions now expire on inactivity.** `ultimoUso` had been written on
  every request since 2.11 and read by nobody: a session died only when the
  process restarted. A shared terminal left on Friday evening was still
  signed in on Monday — and that identity signs movements in the register,
  which is the GMP signature. The window is **12 hours** (a shift plus
  margin, not half a shift), configurable via `PATHFINDER_SESSIONE_ORE`, and
  the machine key is exempt.
- Oversized and malformed bodies now return **JSON** with an explanation
  instead of Express's default HTML error page, which carried a stack trace.

**Operations**

- **The service keeps a log.** `server/lib/registro-servizio.js` writes
  startup and shutdown, 401s and 403s, throttle blocks, 500s and backup
  outcomes to a rotating file (5 MB, 10 kept). The process runs as SYSTEM in
  session 0, where nobody reads its console; after an incident there was
  nothing to re-read. It never records PINs, hashes, request bodies or
  connection strings. Configured with `PATHFINDER_LOG`.
- `backup-serale.ps1` accepts **`-CopiaSecondaria <path>`**: after the dump
  is verified, it is copied to a second location and the result is logged.
  Off by default, like retention — the destination is an IT decision.
  Database and backups have lived on the same disk until now.

**Process**

- **Continuous integration**, on every push and pull request: `npm ci`,
  `npm run check`, `npm test`, then the service and installer test suites.
  The tests existed and were green, but nothing stopped a commit from
  landing without them.
- **Dependabot**, security advisories only. `dexie` and `xlsx` stay pinned:
  the goal is to *know*, not to upgrade by accident.
- **`test/regole.test.js`** — three project rules that used to live only in
  one person's memory:
  - every field interpolated inside an inline handler is covered by
    `VIETATI_NEI_CODICI`, with eight documented exceptions;
  - `src/core/store.ts` does not grow past 4,252 lines;
  - the session guard is registered before `express.json`.
- Bench run captures (`banco/*.out`, `banco/*.log`) are no longer tracked.
  `ARCHIVIO/` stays, and git history was not rewritten.
- `PATHFINDER_PG_PRODUZIONE` was removed from `.env.local`, which already
  declared that the production connection string lives in a machine
  variable.

---

## 2.16 — 2026-09-02

**Security**

- The **last active Admin can no longer demote, deactivate or delete
  themselves**, and the rule is now enforced by the *service*. Until 2.15 it
  lived only in the client, so a `PATCH` sent by an Admin demoting themselves
  went through — and from there the system could not be recovered:
  Configuration requires an Admin, the recovery code requires `role === 'admin'`,
  and the first-run window checks PINs rather than roles. The service now
  *simulates* the write against a copy of the roster, so the rule holds inside
  a transaction too. Wiping all data is still allowed: nobody is left holding a
  PIN, and the first-run window reopens by itself.
- A database dump containing real PIN hashes was removed from the git history
  (`git filter-repo`, force push). All commit SHAs changed.
- PIN hashes were stripped from six tracked JSON exports, and a test
  (`test/segretiFuori.test.js`) now fails if any tracked file carries one. A
  rule written in prose and a filter written by file extension are not the same
  rule — this was the second occurrence.

**Movement register**

- `qty_delta` no longer contradicts its own endpoints: when `qty_before` and
  `qty_after` are both present, the delta is their difference, computed at the
  single write point.
- New reading `quantitaMossa`: how many packages actually changed place. A
  whole-row transfer leaves the quantity where it was and changes the location,
  so the delta is `0` and the packages moved are *all* of them. Code reading
  `Math.abs(qty_delta)` — KPIs, dashboard, activity register — was counting
  zero for 22 real transfers.
- Moving a load unit now writes **one record per batch it carries** instead of
  a single record naming nothing. New movement reason `UDC` for the container
  itself.

**Interface**

- When served, the status indicator said "Not saved" in red for ever, because
  nothing had cleared the flag since manual saving was removed in 2.1. It now
  reads "Online": the row is in PostgreSQL before the call returns.
- Five icons rendered as monochrome text glyphs — the "Edit" pencil read as a
  dash. 101 variation selectors added; guarded by a test.

**Benches**

- A `grave` defect now turns the cycle bench run red, and its report is kept
  aside instead of being overwritten by the next run.
- New bench `banco/migrazione/dalla-1.4.cjs`: 14 checks proving that an export
  from the 1.4 release in the warehouse imports into this release without loss.

## 2.15 — 2026-09-01

The application does not change by a single line. The installer stops walling
itself out on a clean install (a single `icacls` with `/inheritance:r` and `/T`
left files with an empty ACL, which denies everything — including reading the
file's owner), and learns to **remove itself**: `-Disinstalla`, which backs up
before it removes. A root left behind by a failed attempt now reopens by itself.

## 2.14 — 2026-09-01

The work-in-progress screen starts **from the goods, not from a number**: a
sortable, filterable list of what is sitting in the WIP location. Closed
production orders move to the Archive. A mistaken return can be **reversed**.

## 2.13 — 2026-08-31

Role hierarchy is enforced by the **service**, not the client. New `rinnovaPin`
route, and a **recovery code** for the Admin who has nobody above them.

## 2.12.1 — 2026-08-30

The service **waits** for PostgreSQL instead of giving up on the first refusal,
and the scheduled task starts a minute after boot. Born from a day of warehouse
downtime.

## 2.12 — 2026-08-29

The picking round: several production orders in one route, a single WIP
account, recalibration of the bill of materials, and the location scanned
**once per bay**.

## 2.11 — 2026-08-28

The door. `/api` routes require a session; previously they asked nobody for
credentials.

## 2.10 — 2026-08-27

Six security holes closed. PIN hashes move from SHA-256 to **scrypt**,
rewritten on first successful sign-in.

## 2.9 — 2026-08-27

From gate to assistant: the compliance check explains why a location is
refused, instead of only refusing it.

## 2.8 — 2026-08-27

Storage rules decide where goods go: hard constraints first, then scoring.
Hazard class, floor loading, the lot's home bay, category as a third target.

## 2.7 and 2.6 — 2026-08-26

The two databases. The same service logic runs over SQLite and PostgreSQL, with
the dialect as a parameter; backup no longer changes owner on PostgreSQL.

## 2.5 — 2026-08-26

Units of measure at goods-in: of 11.197 articles, **two** worked. Four causes,
the largest being that SAGE X3's `NR` was not missing data but an untranslated
code — 7.077 articles of 11.197.

## 2.4 — 2026-08-25

Restore no longer wipes the movement register. The number 2.3 is skipped
deliberately.

## 2.3 — withdrawn, 2026-08-25

Split a single package across several orders. Withdrawn after malfunctioning;
the problem it aimed at is solved differently in 2.12.

## 2.2 — 2026-08-20

Ghost `updated_at` field on stock rows (13 rows straightened in production),
the production-order archive becomes browsable, WIP rows no order claims. And
the discovery that the version number lives in **four** places.

## 2.1 — 2026-08-19

Code128 written in-house · the **ADMIN** role · purge removed — **no record is
ever deleted** · composable dashboard · sorting and filtering · whole load
units.

## 2.0 — 2026-08-19

Feature switches removed · KPIs · exports that state units of measure · eight
defects of one family: a correct balance written over a package list that had
been left behind.

## 1.9 – 1.14 — 2026-08-19

Stock views · transfers from the production order · terminal layout on a single
spacing knob · load units · storage engine · production account.

## 1.8.x — 2026-08-18

Package subdivision is **declared rather than computed**. Worst defect: the
outbound document row was rebuilt in two copies, and the chosen packages
vanished on save.

## 1.7 — 2026-08-17

A version becomes a **folder**. First load drops from 1.610 kB to **251 kB**,
reload to **300 bytes**, `xlsx` loaded on demand.

## 1.4 — 2026-08-12

The release still running in the warehouse at the time of writing. Single HTML
file, data in IndexedDB via Dexie, backups in OPFS, export format
`warehouse-mapper-v1.5` — the same format this release still reads.
