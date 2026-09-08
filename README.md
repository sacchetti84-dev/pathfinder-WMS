# Pathfinder

**Warehouse management — Dietopack S.r.l. (Naturacare Group)**
© Andrea Sacchetti · Internal use · All rights reserved

A web application for a food-grade warehouse operating under GMP: location
mapping, stock movements, production-order picking, quarantine, and outbound
documents. It runs on one machine on the local network; terminals open it in a
browser and install nothing.

> **Italian original:** [`README.it.md`](README.it.md). This English document is
> the current one; the Italian one is kept because it carries reasoning this
> summary does not, and because parts of it predate release 2.7 — see
> [Documentation status](#documentation-status).
>
> **The full project record is [`INDEX.md`](INDEX.md)**, in Italian: state,
> rules, traps already paid for, the work queue and the code map. It is the
> single working document of the project. This README is for whoever installs,
> reviews or takes over the system.

---

## Contents

1. [What it is](#1-what-it-is)
2. [Two machines](#2-two-machines)
3. [Requirements](#3-requirements)
4. [Getting started (reviewers)](#4-getting-started-reviewers)
5. [Repository layout](#5-repository-layout)
6. [Installing the service](#6-installing-the-service)
7. [Configuration](#7-configuration) · [Label printers](#label-printers--from-219)
8. [Backup and restore](#8-backup-and-restore)
9. [Upgrading and rolling back](#9-upgrading-and-rolling-back)
10. [Uninstalling](#10-uninstalling)
11. [Tests](#11-tests)
12. [Security model](#12-security-model)
13. [Design decisions worth knowing](#13-design-decisions-worth-knowing)
14. [Known issues](#14-known-issues)
15. [Documentation status](#documentation-status)
16. [Licence](#licence)

---

## 1. What it is

Two pieces, and nothing else.

| Piece | What it is | Where it runs |
|---|---|---|
| **The data service** | Node + Express. Holds the data and serves the application | One machine on the LAN |
| **The application** | A folder of static assets. Interface, logic, printable documents | Served to the terminals by the service |

```
   Terminal ─┐
   Terminal ─┼── HTTP ──> [ data service ] ──> PostgreSQL 17
   Terminal ─┘   :4173         Node            + nightly backup
```

**One database, several terminals, and the server is the referee.** No offline
queue: if the service does not answer, the application stops and says so, full
screen. An operator who keeps scanning against a dead service is throwing the
shift away.

The database is chosen by one environment variable:

| `PATHFINDER_PG` | Database |
|---|---|
| set to a connection string | **PostgreSQL** — the production configuration |
| absent | SQLite, single file — used by the benches |
| set but **empty** | SQLite, declared explicitly; overrides `.env.local` |

The same service logic runs over both. The SQL dialect is a parameter, not a
branch: see `server/lib/sql.js` and `server/lib/driver-base.js`.

---

## 2. Two machines

This distinction governs how everything else reads.

| | **Development machine** | **Warehouse machine** |
|---|---|---|
| Purpose | Building and testing, up to the beta | Running the shop floor |
| Release | The one under development — 2.16 at the time of writing | **1.4** |
| Database | Overlapping trials: imports, resets, versions installed over one another | The real data |
| Installing | Served means installed; there is no separate ceremony | A human act, end of shift, with a fresh backup |

**Odd counts in the development machine's database are not incidents.** An
empty movement register or stock figures that change between one day and the
next are what happens to a bench where backups are loaded and versions are
installed one over another. A defect in the *code* is still a defect wherever
it is seen; the benches tell the two apart, not the live database.

The 1.4 release in the warehouse is a single HTML file with data in IndexedDB
via Dexie. Its export format is `warehouse-mapper-v1.5` — the same format this
release still reads, which is the migration path. It is proven by
`banco/migrazione/dalla-1.4.cjs`.

---

## 3. Requirements

### Service

| | |
|---|---|
| OS | Windows 10/11 or Windows Server. It runs on Linux, but the installer is PowerShell |
| Node.js | **20 or later** (LTS). Tested on 24 |
| Database | **PostgreSQL 17**, local. The installer prepares role and database; it does not install or download the engine |
| RAM | 512 MB for the service |
| Network | One TCP port, normally **4173**, open to the company LAN |
| Privileges | Administrator **for installation only**. It then runs as SYSTEM |

**Disk.** The article master (~11,000 rows) plus stock is about 5 MB. The
movement register is what grows: at 300–500 movements a day and a six-year
retention that is 650,000–1,100,000 records, on the order of **300–500 MB**.
With daily backups kept for a year, under **10 GB**.

### Terminals

| | |
|---|---|
| Browser | Recent Chrome or Edge. No install, no extension |
| Screen | 1280×720 and up. Below 768 px wide the interface switches to mobile cards |
| Scanner | Keyboard-emulation readers. The application corrects the US→IT layout itself |
| Printers | Printing goes through the browser. For labels, a label printer set as default |

Nothing is installed on the terminal, and no request leaves the company
network.

---

## 4. Getting started (reviewers)

```bash
npm ci                 # exact dependency set from package-lock.json
npm run check          # TypeScript, application and service, must be clean
npm test               # 1,258 checks in 46 files
npm run build          # produces consegna/Pathfinder <version>/
```

`npm run dev` starts Vite and talks to the real service unless
`PATHFINDER_DEV_API` says otherwise.

To run the service against a throw-away database, without touching anything:

```bash
PATHFINDER_PORT=4174 PATHFINDER_DB=/tmp/prova.db PATHFINDER_PG= \
  PATHFINDER_TLS_PFX= PATHFINDER_TLS_PFX_PASSWORD= \
  PATHFINDER_TLS_CERT= PATHFINDER_TLS_KEY= \
  node server/pathfinder-server.js
```

**Two families of inherited variables, and each one bites differently.**

`PATHFINDER_PG` **empty** is deliberate: on a machine with PostgreSQL
configured it stops the trial from running against the real database.
`PATHFINDER_PG` wins over `PATHFINDER_DB`, so naming a throw-away file is not
enough — the empty assignment is what makes it a file.

The four `PATHFINDER_TLS_*` are the half that is easy to forget, and its
failure is worse because it looks like something else. Inherited, the trial
service starts on **HTTPS** while whoever wrote the trial calls it in the
clear: the service answers `301`, `fetch` follows the redirect and turns the
`POST` into a `GET`, and `POST /api/c/meta/bulk` lands on
`GET /api/c/:col/:key` with the key `bulk` — `404 not found`. The failures
talk about a missing record, never about a certificate.

Anything that starts the service from a script uses
`require('server/lib/tls.js').scollegaTls(env)`, which strips those four from
an environment object. `test/bancoNonEredita.test.js` walks `banco/` and
`server/test/` — **including subdirectories** — and fails any file that starts
the service without both declarations.

---

## 5. Repository layout

```
src/           the application — TypeScript, no framework
  core/        store, cache, persistence adapters, schema
  modules/     pure logic: units, packages, storage rules, WIP, routes, register
  ui/          the shell and the views
  types/       entities, the adapter contract, the 21 collections
server/        the data service — Node + Express, two database drivers
  lib/         all service logic once, for both databases; all SQL in one file
  migrazione/  SQLite → PostgreSQL migration and its audit
  test/        service checks, schema migration, installation scripts
test/          1,664 checks that run without a service
banco/         benches that need a running service (not part of `npm test`)
  gerarchia    roles, enforced where they are enforced: on the service
  ciclo/       a whole cycle from goods-in to consumption
  migrazione/  the jump from the 1.4 release to this one
  video/       the bench a browser opens, for looking at the screen
ARCHIVIO/      project memory: previous releases, bundles, test files
INDEX.md       the single working document — Italian
```

**Not tracked:** `node_modules/` and `consegna/` (build output). Both are
reproducible — `npm ci` for the first, `npm run build` for the second — and a
full copy of the 2.16 dependency set is archived outside git. Until 2 September
2026 they *were* tracked, on the principle that "it can be rebuilt" only holds
while somebody rebuilds it; they were removed when the repository was opened to
external review, because 94% of what a reviewer downloaded was not this
project's code.

---

## 6. Installing the service

**Only the `consegna` folder is needed** — the one produced by `npm run build`.
It contains the application, the service, the installer, the backup script and
its own instructions.

1. Copy the folder to the machine. **Choose a short path**: `C:\Pathfinder\`
   is fine, ten levels under Desktop is not — Windows stops at 260 characters
   and dependency installation is the first thing to hit it.
2. From **PowerShell as administrator**, run `Installa Pathfinder.bat`, or:

```powershell
.\installa.ps1
.\installa.ps1 -Prova          # says what it would do, touches nothing
```

The installer checks Node and the dependencies one by one as `package.json`
declares them, names the missing one and stops; checks PostgreSQL and prepares
role and database; refuses a database path inside OneDrive; opens the firewall
port; registers **two scheduled tasks** — the service and the nightly backup;
and then verifies that the service really opened the expected database and is
really serving the expected application.

### The two scheduled tasks

| Name | Starts | How it runs |
|---|---|---|
| `Pathfinder - Servizio dati` | At machine boot | SYSTEM, restarts itself if it falls |
| `Pathfinder - Backup serale` | Daily at the chosen hour (20:00) | SYSTEM, catches up if the machine was off |

They run as SYSTEM, so from a non-elevated window they are invisible:
`Get-ScheduledTask` omits them silently. An administrator window is required to
see them.

### The first Admin is the first act

On a clean install, with no operators, the service answers **200** on `/api/c/*`
without a session. That is not the door failing: it is the first-run window,
open so that somebody can create the first Admin — which is the only way to
reach Configuration. **Open is open**, so on a new machine the first Admin is
created before any data. The window closes by itself the moment the first PIN
exists.

---

## 7. Configuration

The service has no configuration file: it reads **environment variables**,
written at machine level by the installer so that they are inherited when it
runs as SYSTEM. They are read **at process start** — changing one without a
restart has no effect.

| Variable | Meaning |
|---|---|
| `PATHFINDER_PORT` | Listening port. Default `4173` |
| `PATHFINDER_HOST` | Which interface to listen on. Default: all |
| **`PATHFINDER_PG`** | **Which database.** See [§1](#1-what-it-is). Never stored in the repository |
| `PATHFINDER_DB` | The SQLite file, when running on SQLite |
| **`PATHFINDER_APP_DIR`** | `C:\Pathfinder\app\corrente`. **Set once**: releases are swapped by replacing that folder's contents |
| `PATHFINDER_APP_PREV` | Its `precedente` sibling — where the previous release's assets are served from |
| `PATHFINDER_PG_POOL` · `_IDLE` · `_TIMEOUT` | Connections (10) · ms before closing an idle one (30,000) · wait to obtain one (10,000). `_IDLE` is deliberately below the server's own threshold: the pool must close first |
| `PATHFINDER_PG_CA` | The company CA file. It is a **file**, not a switch that disables verification |
| `PATHFINDER_PG_COLLAUDO` | Connection string for the test database. Never falls back to `PATHFINDER_PG`, and the database name must end in `_collaudo` |
| `PATHFINDER_TOKEN` | The machine key, generated once at install: backup, installer, migration, benches |
| `PATHFINDER_BACKUP_ROOTS` | Restricts where backups may be written |
| `PATHFINDER_TLS_CERT` / `_KEY` | Absent → HTTP. **One without the other and the service does not start** |

### HTTPS

Without a certificate the service starts in the clear and says so at startup.
With **both** variables it speaks HTTPS. With only one it refuses to start:
falling back silently to plaintext would be the worst of the three outcomes —
everything would work and everyone would believe the PINs were encrypted.

### Company details

Not in the code: **Configuration → DDT and Documents**. Without company name,
address, town and **VAT number**, documents come out marked "not compliant".

### The packing zone — from 2.31

**One zone per site must be marked as the packing zone**, in
**Configuration → Sites and Zones**. It is the only zone class the system
insists on having, because it is where a shipment preparation ends: the picker
moves the goods there rather than removing them — a pending delivery note
already reserves the stock and the dispatch is what removes it — and the
finished-goods pallet is created inside it, with its contents already on it.

Without the mark a preparation has nowhere to finish, and the finished-goods
round goes back to labelling a pallet before it holds anything.

The zone is not limited in capacity on purpose: the space is governed by eye
on the floor, and a system-side limit would only produce a number nobody can
reconcile with the pallets actually standing there.

### Label printers — from 2.19

Goods and load-unit labels print on **networked Zebra printers**. The
**service** talks to them, not the browser: a browser cannot open a TCP socket,
and port 9100 on a Zebra needs exactly that. It is also why this works
identically from a desk PC and from the MC9400 handheld.

**A4 printing stays.** If a printer is off, the roll has run out, or none has
been configured, the label prints on a sheet as it always did. The Zebra is
added alongside the paper, never in place of it.

#### What has to exist first — network work, not Pathfinder's

| Item | Why |
|---|---|
| **Static IP**, or a DHCP reservation on the printer's MAC | An address that changes on its own is a label that stops coming out with nobody having touched anything |
| **Outbound TCP 9100** from the service machine to the printers | The only connection the service opens beyond itself. If a firewall or a separate VLAN sits between them, it has to be opened |
| Printers on an **internal network** — `10.x`, `172.16-31.x`, `192.168.x` | The service resolves the name **before** connecting and **refuses a public address**: without that check it would become a bridge to the outside |
| **Media calibration**, once per machine | Die-cut adhesive labels use **gap sensing**. Hold **FEED** at power-on until the printer feeds by itself. Without it the label prints off-register and the barcode straddles the cut |
| **Darkness** matched to the stock, from the panel | Too little and the bars fade; too much and they spread until no scanner reads them |

> **Pathfinder never sends media type, darkness, peel-off or persistent-save
> commands** (`^MN`, `^MD`, `^MM`, `^JUS`). Those are **machine**
> configuration, set once at the panel, valid for every job. The day the
> application ships them with every label, the application owns the printer
> configuration.

#### Adding a printer

**Configuration → Printers → + Add printer.** Admin role required.

| Field | What goes in it |
|---|---|
| **Name** | What the operator picks in the aisle: **say where it is** — "Zebra — Shipping", not "Printer 2" |
| **Address** | The printer's IP, or its network name |
| **Port** | `9100`. Also allowed: 6101, 9101, 9102, 9103 — for external print servers and multi-channel models |
| **Printhead** | `203 dpi` for desktop units; `300` for finer industrial ones |
| **Label width / height** | The dimensions of the **roll actually loaded**, in millimetres. Ours: **100 × 80** |
| **Site served** | Optional, and it does one thing: propose the right printer. The one in `MAG1` is the one next to MAG1, and sending a MAG1 label to the MAG2 printer means an operator walking across the warehouse to collect a piece of paper |
| **Active** | Clear it and the printer leaves the operator's list without being deleted |

Then **🏷 Test**: out comes a label carrying name, address, printhead and
dimensions — **no warehouse data**, because a test that prints real goods is a
real label circulating on the floor with no goods under it. The service then
asks the machine how it is and reports back.

#### The goods label layout

Same screen, below. Eight fields stack **top-down, in that order**; for each
one you set whether it appears, its height in millimetres, its alignment, and
how many lines it may wrap to.

| Field | Default |
|---|---|
| Article code · Description · **Barcode** · Lot · Expiry · **Weight** | **on** |
| Packs · Location | off |

- **Under the bars the printhead writes the code in plain text itself.** Not an
  extra datum: it is the human-readable interpretation the standard asks for,
  and it leaves a number to key in when the scanner will not read.
- **"Weight" is the quantity in units of measure**, and the row is titled for
  what it is: "Peso" for KG and GR, "Quantità" for PZ, MT and LT. With no unit
  configured the row stays empty — a weight without a unit is not a weight.
- **Location is off by default because it ages.** A pallet moves, and what was
  printed stays glued to the goods saying something no longer true. Turn it on
  and it prints declared "at time of printing", small and at the bottom.
- **The millimetre total sits at the bottom of the screen**, compared against
  the roll height. By default it occupies **68.5 mm of 80**: the remaining 11.5
  are not wasted — registration on die-cut stock drifts a millimetre or two per
  feed, and a field at the edge eventually gets clipped.
- **A layout taller than the roll is refused by the service, not truncated.** A
  truncated label comes out looking correct and missing its last row — by
  default the weight — and whoever sticks it on has no way to notice.

> **Load-unit labels have no layout, by decision.** A pallet carries N lines of
> N different articles: description, expiry and weight are not even *defined*
> for a load unit, and the first time someone loads a second batch onto it
> whatever is printed becomes false. The only datum that never ages is the
> number, which is never reused; everything else is told by the system, which
> knows it *now* and not at print time. What is configurable is the **media**,
> which belongs to the printer.

#### Printing

| What | From where |
|---|---|
| **Goods label** | Map → a location → the line → **🏷 Label**, or from the detail panel |
| **Load-unit label** | Prints **at creation**: a pallet with no label is a pallet nobody can scan. Reprint from the load-unit list, 🏷 button |

The dialog asks two things, and they behave in opposite ways:

- **the printer is remembered** — whoever chose it is standing next to it for
  the rest of the shift, and the choice stays **on that terminal**, not in the
  database: which machine you have nearby is a fact about where you are
  standing;
- **the copy count always returns to 1**, and can go up to 50. Remembering "6"
  would mean six labels on the next line that nobody asked for: an exception
  that gets remembered stops being an exception.

> **"Sent" is not "printed", and the message says which one it is showing.**
> Port 9100 accepts the bytes and closes: out of media, head open and ribbon
> out **all look like success**. The service sends, then asks the machine how
> it is, and the on-screen message is green only when the printer answered
> **and** is well. Red when it answered with a fault — sent, but the label did
> not come out. Amber when it did not answer at all: not a failure, but not a
> confirmation either, and the machine needs looking at.

#### When the label does not come out

| Message | What it means, and what to check |
|---|---|
| "No printer configured" | None has been added. The label prints on A4, which is what the application did before 2.19 |
| "does not answer within 3 s" | Off, unplugged, or on a different address. Try `Test-NetConnection <ip> -Port 9100` **from the service machine**, not another one |
| "connection refused: something is at that address, but it is not listening on the print port" | The address answers, but not on that port. Usually networking disabled on the printer, or another device holding that IP |
| "resolves to *x.x.x.x*, which is a public address" | The name points outside the internal network. Use the IP, or fix DNS |
| "The layout occupies *X* mm and the label is *Y* tall" | Turn a field off or reduce its height. The service refuses rather than truncating, deliberately |
| "The code *…* in Code128 occupies *X* mm and the label has *Y*" | The code is too long for the roll. Bars are **never squeezed below 0.25 mm**: under that no scanner reads them, and printing unreadable bars is worse than printing none |
| "sent, but the printer reports **out of media** / **head open** / …" | The send succeeded and **the label did not come out**: look at the machine. Port 9100 accepts the bytes regardless, which is why this message exists |
| "the printer does not report its own status" | It does not answer `~HQES`. Not a failure — often an external print server that does not know the command — but not a confirmation either |

**The label prints off-register, or the barcode straddles the cut.** Not
Pathfinder: **media calibration**. Hold **FEED** at power-on until the printer
feeds by itself.

**Bars fade, or spread until unreadable.** That is **darkness**, set from the
printer panel. Pathfinder never sends it, because it is machine configuration
and applies to every job.

---

## 8. Backup and restore

A scheduled task asks the service for a copy every evening and writes it to
`C:\Pathfinder\backup`, recording the outcome in `backup.log`.

By hand:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:4173/api/backup -Method Post `
  -Body (@{dir='C:\Pathfinder\backup'} | ConvertTo-Json) -ContentType 'application/json'
```

> **Never copy the database file while the service is running.** On SQLite it
> is open and has a WAL beside it: a copy made that way looks fine and is not,
> because the writes still in the WAL are missing. Nobody notices until the
> backup is needed. The endpoint goes through the database's own backup API,
> which takes responsibility for a consistent copy. On PostgreSQL the password
> is never passed on the command line — it goes through `PGPASSWORD`, in the
> child process only.

**Nothing is ever removed on its own.** Rotation of old backups exists but must
be asked for: `.\backup-serale.ps1 -GiorniDiConservazione 365`. With the
default (`0`) nothing is ever deleted. Same rule as the records themselves.

**A backup that has not been tried is not a backup.** Open it read-only on
another port and count the rows through `/api/health`.

---

## 9. Upgrading and rolling back

A release is a **folder**, not a file. `PATHFINDER_APP_DIR` points at
`corrente` and never changes again; upgrading and rolling back are a swap of
that folder's contents, and the service does **not** need restarting for an
application change.

```powershell
npm run build
.\server\installa-versione.ps1 -Da .\consegna -Versione 2.16
Invoke-RestMethod http://127.0.0.1:4173/api/app-info   # version and fingerprint
```

Rolling back:

```powershell
.\server\torna-indietro.ps1
```

**`consegna\` is not the folder the service serves**: it is the build output,
and `npm run build` empties it every time. You install *from* there. Pointing
production at it was a defect found on 17 August 2026 that had been live for
three days.

A restart is still required for one thing only: a change to files under
`server\`, which Node loads at startup.

> **Ask the service, not the document.** The version that answers
> `/api/app-info` is the one that is installed. On six separate occasions this
> project's documentation stated a version that was not the one running.

---

## 10. Uninstalling

From the package, in an administrator window:

```powershell
.\installa.ps1 -Disinstalla -Prova            # says what it would remove
.\installa.ps1 -Disinstalla                   # service, tasks, variables, folders
.\installa.ps1 -Disinstalla -AncheIlDatabase  # also the database and the PostgreSQL role
```

> **The database does not go on its own.** Without `-AncheIlDatabase` the
> database and role survive: uninstalling the application and throwing away six
> years of register are not the same act. **PostgreSQL itself is never
> uninstalled.** Installing and uninstalling are not done in the same run.

---

## 11. Tests

| Suite | Checks | Command |
|---|---|---|
| Application | **1,664** in 63 files | `npm test` |
| Types | application and service | `npm run check` |
| Service | **171** | `node server/test/collaudo.js` |
| **Zebra label printing** | **100** | `node server/test/collaudo-stampa.js` |
| Installation scripts | **43** | `node server/test/collaudo-installazione.js` |
| Schema migration | **8** | `node server/test/collaudo-migrazione-1.4.js` |
| Roles, on the service | **40** | `node banco/gerarchia.cjs` |
| Full cycle | **47** | `node banco/ciclo/gira.cjs` |
| Jump from release 1.4 | **14** | `node banco/migrazione/dalla-1.4.cjs` |

The last three need a service; they start and stop their own, on their own
port, against a throw-away database. They are not part of `npm test` for that
reason.

Two conventions worth knowing. **The service checks run the same suite against
both databases**; without `PATHFINDER_PG_COLLAUDO` the PostgreSQL half declares
itself skipped, with the reason, rather than staying silent. And **some checks
read the source rather than executing it** — they pin rules a DOM is not
present to verify, such as "every goods movement reason writes its quantities"
or "the version number is the same in all four places".

The cycle bench exits non-zero when a `grave` defect is raised during that run,
and keeps its report aside so the next run cannot overwrite the evidence.

---

## 12. Security model

**Three roles: `operator`, `leader`, `admin`.** Admin subsumes leader: wherever
a leader passes, so does an admin. Only an Admin opens Configuration and the
data reset, and the reset asks for their PIN.

**The hierarchy is enforced by the service, not the client.** Until release
2.12 it lived in the browser, so any session plus one line of `curl` was enough
to write `role: "admin"` onto yourself. Release 2.13 moved it to the service;
release 2.16 added the rule that had been left behind — **the last active Admin
cannot demote, deactivate or delete themselves**, because from that state there
is no way back in.

**PINs are not recoverable by construction**: only a salted hash is stored,
`scrypt` since release 2.10. There are three ways out, in order of preference:

1. **A higher rank renews it from the application.** The authoriser types their
   own PIN. An Operator is renewed by a Team Leader, a Team Leader by an Admin,
   an Admin by another Admin.
2. **A recovery code**, when the lost PIN is the only Admin's. Twenty
   characters; it is consumed on use and a new one is issued immediately,
   shown once.
3. **The machine key** (`PATHFINDER_TOKEN`), which opens the routes without a
   session. It is the service exit, not a procedure: it is used by whoever
   already has access to that machine.

The cause is removed by naming **a second Team Leader** — one minute in
Configuration → Operators.

**What never enters the repository:** database files (they carry `pin_hash` and
`pin_salt` beside real people's names), `.env.local` (PostgreSQL credentials),
and recovery codes. `test/segretiFuori.test.js` fails if a tracked file carries
a PIN hash — a rule written in prose and a filter written by file extension are
not the same rule, and that lesson was learned twice.

**GMP traceability:** every movement carries the initials of the identified
operator. **No record is ever deleted** — not by hand and not by age. The purge
was removed in release 2.1, because a way to erase the register, however
protected, is a way somebody eventually takes, and release 2.17 removed the
retention constant that remained: it deleted nothing, and it printed a label
claiming six years two lines below "no record is ever deleted".

**How long the register is kept is not decided by this software.** Six years
matched no rule: the Commission's guidance on Article 18 of Regulation
178/2002 recommends five years for traceability, Article 2220 of the Italian
Civil Code requires ten for invoices and commercial documents — and Pathfinder
issues delivery notes — and Annex 11 ties the audit trail to the record it
documents. The period belongs in the SOP, and from there it is a backup and
database policy.

**Personal data:** first name, surname, initials and a salted PIN hash. No
telemetry, no request outside the local network.

---

## 13. Design decisions worth knowing

These were made and tested in the field. They can be changed, knowing what is
being reopened.

**No offline work.** If the service does not answer, the application stops and
says so, full screen. No queues to reconcile, no data that diverges.

**A scheduled task, not a native Windows service.** Node does not talk to the
service manager, and a third-party wrapper binary is the file the antivirus
blocks at seven in the morning on a warehouse PC.

**The database is never in a synchronised folder.** OneDrive synchronising an
open SQLite file, with its WAL, is a known way to corrupt it. The installer
refuses a path containing `OneDrive`.

**PIN verification happens on the service.** Browsers grant `crypto.subtle`
only in a secure context, and a terminal on `http://192.168.x.x` is not one.

**Documents in JSON with materialised columns.** Only the fields searched on
are indexed; the rest lives in a `data` column. Normalising everything would
restore the chain IndexedDB did not have: a new field means an `ALTER TABLE`
and a service outage.

**Codes are stored uppercase, normalised by the service** on every write from
wherever it comes. A code in two spellings is not a display problem — it is a
second entity being born.

**The last Admin cannot remove themselves**, enforced by the service. With two
Admins the act goes through. Wiping all data is still allowed: nobody is left
holding a PIN, and the first-run window reopens by itself.

**Print documents stay in `pt` and `mm`.** The on-screen design system is for
screens; paper has no rem.

---

## 14. Known issues

The authoritative list is section 4 of [`INDEX.md`](INDEX.md), in Italian, with
one numbered entry each and the evidence beside it. Numbers are never reused.
The ones a reviewer should know about:

| # | Issue |
|---|---|
| **65** | `xlsx` 0.18.5 carries two known high-severity vulnerabilities (prototype pollution, ReDoS) with no fix on npm. **Accepted, in writing**: the vector is a spreadsheet uploaded by an identified operator on the internal network, from a file they generated themselves. To be reopened the day a spreadsheet arrives from outside |
| **78** | After the git history was rewritten to remove a dump containing PIN hashes, the old commits remain reachable by SHA until GitHub garbage-collects. The repository is private. Those PINs are to be renewed when the operators concerned return to the database |
| **79** | The jump from the warehouse's 1.4 release is proven on an archived export (14 checks) but has not been run against a live export from the warehouse machine |
| **76** | A cycle-balance defect (0.75 kg unaccounted for) was raised once and has not reproduced in twelve runs |
| **5 · 58** | Zone and article attributes are largely unfilled, so the compliance check has nothing to compare against on most rows. Data entry, not code |

---

## Documentation status

`INDEX.md` is current and authoritative. It is in Italian, and it is the single
working document of the project.

`README.it.md` — the Italian original of this file — is **partly stale**:
sections 1 to 8 predate release 2.7 and still describe SQLite as the only
database, the application as a single HTML file, and `installa-servizio.ps1` as
the installer. The English document you are reading was written against release
2.16 and does not carry that material forward. The Italian is kept because it
holds reasoning that has not been transferred, and because it is the author's
working copy.

Code comments are in Italian, deliberately: they carry the *why*, and the
project's rule is that the narrative lives in `INDEX.md` and in those comments
rather than in separate documentation.

---

## Licence

Proprietary software. See [`LICENSE`](LICENSE). © Andrea Sacchetti — Dietopack
S.r.l. (Naturacare Group). Internal company use. No licence to use, copy or
distribute is granted to third parties.
