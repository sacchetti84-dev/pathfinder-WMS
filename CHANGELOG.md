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
