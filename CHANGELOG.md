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

## 2.38.2 — 2026-09-09

**An activity nobody could close, because the failure was silent.**

Seen in the warehouse: goods loaded, delivery note despatched, and the
activity still sitting "in progress" in the queue under the operator's name.
Pressing Start answered *"this activity's delivery note is no longer
pending"* and left it exactly where it was.

The closing itself was in the right place — it happens the moment the goods
leave — but it depends on a **write**, and a write can fail. Until 2.38.1
that failure went to `console.error` and nowhere else. Nobody working a
warehouse opens browser dev tools, and closing by hand is refused on
purpose: an activity closes because an operation was confirmed, never
because somebody ticked it. So one dropped write left a row that no screen
could clear.

Two changes, and they answer two different questions.

**The reason now reaches whoever can show it.** The despatch reports which
activities did not close and why. The goods still leave — refusing a
despatch because a task did not close would mean a delivery note reading as
pending over goods already on a lorry, and that is the worse of the two
lies — but the silence is gone.

**And the queue reads the state from the document afterwards, too.** A
despatched note is goods on a lorry; a cancelled one is work nobody will do.
Either way the row now says **"Goods gone — to be closed"** in red, and
pressing Start closes it. A calculated mark cannot fall behind the goods, so
a missed closing shows up instead of hiding — and it is repaired where it is
found, through the same route as always: the document says the work is over,
not the person.

Also hardened: the match on the document id now guards against a `payload`
that is not an object. Half the app already guarded it; here it did not, and
on a record of that shape the comparison would have been against `undefined`
— no activity closed, silently.

## 2.38.1 — 2026-09-09

**Six packs are not six kilos, and the quick way out must not close a shipment.**

Two defects in the 2.38 flow, both reported the same day.

**The quantity and its unit had come apart.** A stop carries the requested
amount in `kg_required`, and what that number *means* depends on who built
the route: on an order pick it is a unit of measure — the picking list asks
150 KG — and on a preparation it is **packs**, because that is how a delivery
note counts. But the unit printed beside it was the article's, so six packs
of 25 KG flour rendered as **"6 KG"** in nine places across the app. The
number was one quantity, the label next to it named another. It is the 2.33
lying-label defect on a different screen, and harder to spot because 6 is a
plausible number.

Worse, the pack chooser was asked to fill *six units of measure* on a line
that wanted six packs: it proposed **one pack** instead of six, and whoever
confirmed without redoing the arithmetic shipped a sixth of the goods. The
fallback question proposed the whole bin — eight where the note asked six.
None of the existing tests saw it, because every one of them checked
`kg_required` (the number, which was right) and none checked the unit
standing beside it.

The unit is now set at the source — a preparation stop says "Coll." — which
makes all nine readers truthful without a single scattered `if`. The real
quantity travels alongside and the stop card shows it underneath: **6 Coll.**
and **150 KG**, two quantities shown as two. And the delivery note's own
choice of *which* packs (recorded since 1.8.4, and honoured by despatch)
now reaches the aisle: the chooser opens on it, and the operator confirms
what to pick instead of picking again.

**And the red "Close route" button did not know about shipments.** There are
two ways out of a route; 2.38 taught only one. From this one a preparation
never showed the packing question, and the activity was **closed** instead of
returned to the queue — the shipment vanished from the list with the goods
still on the packing bench and nobody aware they had to be packed. It stays
the quick way out and still asks nothing, but it now hands the activity back.

## 2.38.0 — 2026-09-09

**Not every delivery note needs preparing, and preparing is three jobs, not one.**

Since 2.31 a shipment worked one way only: registering the delivery note
opened a preparation activity, someone walked the aisles, and the moment the
route ended the activity closed. Everything after that — packing the loose
goods, and loading the truck — lived by word of mouth, which is the thing the
task queue exists to remove. And a delivery note already made of finished
pallets was sent round the aisles anyway, for nothing.

The activity now spans the whole shipment and is named for it —
*Preparazione/carico DDT*. Whoever picks it up **says which of the three jobs
they are doing**, and the buttons offered match where the goods actually are:
gather, pack, or load. Between jobs the activity goes **back to the queue,
unassigned**, because the person with the pallet truck is rarely the person
with the forklift in the bay. It closes when the goods leave — at the
delivery note's despatch, wherever that despatch is triggered from.

Where the shipment stands is **read from the document, never stamped on the
task**: every line on a pallet means *ready to load*; loose goods all at the
packing bench mean *to be packed*; anything else means *to be gathered*. A
mark that is calculated cannot go stale, and it lights up on its own for a
delivery note born ready — which is exactly the case that started this.

**Preparing means gathering, and whoever gathers chooses where.** Until 2.37
a stop moved the goods to a bin the system picked — the first free one in the
packing zone. Real gathering puts the pallets of one delivery note together,
somewhere the person holding the pallet truck decides. So the destination is
now **scanned**, one per stop, with the system proposing the right zone for
that site and, from the second stop on, the bin just used. A pallet stop is
pick-and-place: scan the unit, scan where it goes.

Packing composes the unit **where the goods already are**, prints the label
there — the printer is at the bench, and sending someone to the shipping rack
and back is the trip that stops being made by the third pallet — and only
then asks where in the shipping zone it goes.

The **finished-goods zone is now the shipping zone**, in name and in the
field that records it (`shipping_zone`). The old name said where the goods
come *from*; the same zone now also receives pallets gathered by a
preparation, which are not finished goods. Sites configured before this
version keep working: the old field is still read, until someone saves that
zone.

## 2.37.0 — 2026-09-09

**A bin holds as many pallets as fit, and reality decides how many.**

The limit existed, but not where it looked. Several units in one bin were
already drawn on the map and listed in the panel; what refused was the move:
bringing a pallet into a bin where the **same goods** already sat on another
pallet answered "that lot is already here outside this unit". Three pallets of
the same product on one rack bay is the most ordinary thing there is.

The refusal defended a real problem. The `[location + item_key]` index is for
searching and is not unique, so the database accepts the duplicate and anyone
reading with `find` gets one of them — which one depends on load order. Three
pallets of one lot gave a balance that counted one.

But it defended by forbidding reality. The pair `(bin, goods)` identifies
nothing, because goods sit **on** something: what identifies a row is the
triple `(bin, goods, unit)`, where "no unit" is a value like any other and
means loose goods on the floor. With the wrong constraint gone, three
questions remain, and they live in one module, tested cold:

- **how much is there** — the sum of all rows, not the first. This was already
  wrong before this release; the refusal simply kept it out of sight;
- **where does it get added** — to the row with the same unit. Loose goods add
  to loose goods: adding them to a pallet's row means loading them onto it
  without anyone having done so;
- **which row does it come out of** — loose goods first. That is the
  broken-pack rule applied to containers: you use up what is already open
  before opening a wrapped one.

The service applies the same three, because if they diverged, which pallet
goes down would depend on who answered first.

**And every list that makes you choose now names the pallet.** Choosing a
source showed three identical lines — same bin, same quantity — and the choice
was blind. Four lists now carry the unit, and only on rows that have one. On
the map each square's tooltip says what that pallet carries and how many
packs, instead of "2 rows": three identical pallets can be told apart only
that way.

Three service tests defended the refusal; they were rewritten on the new rule
rather than deleted, and now require the two rows to coexist, to be told apart
by unit, and the loose row not to merge into the pallet's. A fourth is new.

1,723 client tests in 67 files; 325 on the service; 101 on the benches.

---

## 2.36.0 — 2026-09-09

**Load units are handled from where the warehouse is looked at.**

**A location field now accepts a load-unit code.** In front of a wrapped
pallet the only legible label is the unit's: the bin code is on the rack
upright, and on a dock or in the packing zone there often isn't one. Scanning
a unit into a location field resolves to the bin **where that unit is now**,
and the field is rewritten so that what the operator sees is what the system
understood.

The answer is positive only if the unit really is somewhere — a unit just
created and not yet set down has no location, and resolving it would invent a
bin; a shipped one has left the warehouse. Two different reasons, because they
are two different situations: one is fixed by putting the pallet down, the
other is not.

Location codes and unit codes have the same shape, so the form distinguishes
nothing and the question goes to the data — and the bin wins: if a bin were
named like a unit, that code is that bin, which is what is written on the
upright. The rule lives in one module, tested cold; the bridge to the fields
is a single method, wired into twelve of them. Not into goods-in, where a unit
in the location field has meant "load onto that pallet" since 2.1.

**The side panel says what is on which pallet.** It listed a bin's items all
alike, so in a bin holding three pallets the question you ask standing at the
rack — what is on *this* one — had no answer short of opening the unit from
the archive and comparing two lists. Each unit is now a block with its
contents and its actions, and every stock row carries the chip of the unit it
sits on.

**Take and place, because dragging cannot change zone.** The report was
right, but the cause is not in the dragging: the map draws one zone and one
level at a time, so a pallet can only be dropped on a cell that exists, and
the cells of the other building are not drawn. That is not fixed in the drop
handler. It needs a gesture that survives changing zone — which is the real
warehouse gesture: pick the pallet up, walk, put it down. The pallet stays in
hand across zones, levels and views; a strip at the top of the map says which
and from where, with a button to let go, and every placeable cell shows a
dashed border, because something that survives a screen change and cannot be
seen is a trap. Proven by moving a pallet between two different warehouses.

And the move itself is one piece of code for all three routes — drag,
take-and-place, and the panel's text field.

1,703 client tests in 66 files; 322 on the service; 101 on the benches.

---

## 2.35.2 — 2026-09-08

**The system helps; it does not block.**

Closing a picking route early left its activity open in the queue, in
someone's charge, with nothing to clear it — and reopening the same
production order was then refused by the guard against picking one order
twice. Three changes, one principle.

**A closed route closes its activity, always.** Until now it closed only on a
completed round. That looked prudent — the work is not finished, so the
activity stays — and on the floor it works the other way: the activity stays
charged, nobody clears it, and the queue never drains. Closing a route is a
deliberate act, with a dialog that asks for confirmation and says how many
stops are left, which is exactly the kind of fact a task closes on. The notice
now reports how many stops were not walked, and says the same order can be
reloaded to pick them up. Pausing is unchanged: it holds the round without
closing it, and the activity is untouched.

**Reloading the same order refreshes it instead of refusing.** "That order is
already in the round" was a fair defence against loading it twice — which
would sum its lines and ask for double the goods — but it hit the wrong
gesture: someone who has just seen a screen that did not change presses again,
and the second press said "you cannot redo this". The old copy is now replaced
by the freshly read one: the demand stays single, and the stops are rebuilt
against the warehouse as it is now.

**A closed production order can be picked again, and the fact is recorded.**
The guard was right about the risk — reloading after closure sums two runs
into one account — and wrong about the remedy. It answered "you need a new
order number", and a warehouse does not issue order numbers: production does.
Whoever met that refusal had two options, both worse than the problem — invent
a number, or move the goods without recording them. The guard lived in three
places; all three are now warnings. What is not lost is the fact: the account
compares its movements against the closing time and reports `riaperto`, and
the account panel says so in amber, stating that its figures cover both runs.

The guards that take things *out* of a closed account stay: reversing a
return, returning goods, writing from the WIP screen. Picking material again
is a production decision; editing the history of an archived account is not
the same thing, and nobody asked for it.

1,691 client tests in 65 files; 322 on the service; 101 on the benches.

---

## 2.35.1 — 2026-09-08

**Two flows that never reached the end, and twelve defects to get there.**

Three came from the warehouse: production picking did not load the attached
order file, a shipment preparation would not advance when the load-unit code
was scanned, and transferring a unit from packing to shipping moved only its
contents — the pallet stayed behind, emptied, and vanished from the list. All
three were real. Looking for them on screen turned up nine more, and one was
worse than any of the three.

**The worst was not reported.** A preparation stop asked the bin's
availability **without excluding its own document**. A pending delivery note
reserves the stock — the rule the whole of 2.31 rests on — so the answer was
zero: the card printed "0 packs in bin" in red over a full pallet, and the
confirm stopped with "no packs available (committed to a pending note)". The
system was telling the operator the goods were committed — by himself. No
preparation stop could ever close, from 2.31 through 2.35.

**Why the file did not load.** Reading it worked. What broke it was that
opening the picking sub-tab recomputes the stage from the active session,
erasing the one just set. With any route left open — even one abandoned days
earlier — the order was read into memory while the screen still showed the
running route, under a green notice announcing a screen it had not opened.

**Why the pallet stop would not advance.** The redraw decided whether a scan
still counted by asking "is there a location?", which on a wrapped pallet is
false by construction: the location is never scanned there. The redraw wiped
the code it had just accepted. The rule lived in three places and one of them
spoke a single grammar; it now lives in one.

**Why the transfer abandoned the pallet.** The move is a remove plus an add,
and add has no argument for the unit: the row arrived as loose goods and the
container stayed behind. `moveUdc` has done this correctly since 1.4 and
nothing called it from there.

**And one that a page reload hid.** Inside a transaction `add` does not
write — it queues and returns nothing — so the cache received a row with no
id, the key by which it indexes and the service identifies. Composing the unit
right after a pick answered "the goods are not in that bin", and reloading the
page fixed it: the sign that the defect was in the copy, not the data.

Three reported, nine found by watching the screen, none by re-reading code.

1,683 client tests in 65 files; 322 on the service; 101 on the benches.

---

## 2.35.0 — 2026-09-08

**The cycle bench had been dead, and the failures talked about something
else.**

Release 2.26 found that benches inherit the machine's `PATHFINDER_TLS_*` and
die quietly; five files were fixed. The four benches that live in
subdirectories were not, because the net meant to catch them —
`test/bancoNonEredita.test.js` — only read the top level of `banco/`.

Running the full cycle: 22 of 47 red, all saying "not found". The bench had
started on HTTPS while the cycle called it in the clear; the service answered
`301`, `fetch` followed the redirect and turned the `POST` into a `GET`, and
`POST /api/c/meta/bulk` landed on `GET /api/c/:col/:key` with the key `bulk`.
Not one failure mentioned a certificate.

The worst of the four is `ciclo/cancello.cjs` — the command that answers "2.0
is stable". It did not declare `PATHFINDER_PG` either, so on a machine with
PostgreSQL configured it ran the whole cycle **against the working
warehouse**, not against the throw-away copy.

All four fixed. The net now walks subdirectories and **names the four files**,
because "at least one in a subdirectory" passes anyway — `server/test/` is
already a subdirectory, and this test's first draft fell for exactly that.

Also here: the production-picking round proved end to end against a real
order file, which found one defect — changing the task type left the previous
error message standing over a form that no longer has the field it names.

1,664 client tests in 63 files; 322 on the service; 101 on the benches.

---

## 2.34.0 — 2026-09-08

**The delivery note starts the work instead of ending it.**

Five slices (2.30 through 2.34), shipped together because the first alone is
invisible and the last alone does not stand up.

Until now a picking round created the delivery note: the operator scanned the
goods, the cart became a document, and the document closed the task. Whoever
in the office knew what had to ship had no way of saying so except by walking
down and saying it. Now the clerk registers the note and the task is born from
that gesture.

**2.30 — foundations.** `startPickSession` used to `clear` the collection and
then `put`: starting a route silently closed everyone else's. That held while
a round was born from a file loaded by one person; with tasks taken by
different people it deletes a colleague's work. `pick_session` is a list now.
That raised a distinction that did not exist before: `operator` is who picks,
`owner` is who opened — the first is editable, and looking up your own session
by it would mean a team leader who starts a round on someone else's name can
never find it again. Plus `pack_zone`, one per site, and quarantine requests
that no longer wait their turn.

**2.31 — shipment preparation.** A preparation stop **moves** the goods rather
than removing them, and that is not a convenience: a pending note reserves the
stock and the dispatch removes it, so removing at pick time would remove it
twice and the second attempt would find an empty bin. A load-unit stop is
confirmed with **a single scan** — on a wrapped pallet the article and lot are
under the film, and asking for them means asking to open the wrapping to
confirm you don't have to. `PREP_SHIP` replaces `PICK_SHIP` and `PICK_RET`,
which stay **declared** because the archive carries them.

**2.32 — production picking as a task.** The bill of materials is attached to
the request and lives on the service. Not the already-parsed rows, which would
be simpler: when something doesn't add up the question is always *what did the
file say*, and parsed rows are already an interpretation.

**2.33 — load units become contextual.** The pallet label **stated the
opposite of the truth**: the unit was created before the goods, so the summary
read zero lots and the label printed "MULTIPLE LOTS — 0 lots" on a pallet
carrying one. An empty label is visible; one that contradicts itself is not.
The unit is now born inside the packing zone with its goods on it. The
location stays off the label — what was missing was never the bin.

**2.34 — calendar and map.** A shipping calendar on the expected pickup date,
using the dashboard's own alert colours. And the selected map cell, which used
to be a two-pixel border in a grid where every cell already has a coloured
border from its state.

**Six defects found along the way, none of them by re-reading code at a
desk** — including a CSS class referenced since 1.10 and never defined, and a
document field written since 1.8 and never declared.

1,652 client tests in 63 files, plus 362 on the service and benches.

---

## 2.30.0 — 2026-09-08

**Foundations: picking sessions stop being a singleton.**

First slice of the work agreed on 8 September, which moves the origin of a
picking round from a hand-loaded file to a task taken off the queue. Three
things had to exist first. No migration: the new fields are optional and an
old record still reads.

`startPickSession` used to `clear` the collection and then `put`: starting a
route silently closed everyone else's. That held while a round was born from
a file loaded by one person. With tasks taken by different people it would
delete a colleague's work. `pick_session` is now a list, and which one is
*mine* is decided by `modules/sessioni.ts`, which is pure.

That raised a distinction that did not exist before. `operator` is editable
in the form — a team leader can start a round on someone else's name, and
that name goes on the movement rows. Looking up your own session by
`operator` would mean whoever opened it can no longer find it after a page
reload. So a session also carries `owner`, the identity of the terminal, and
that is what the lookup uses. Sessions written before 2.30 have no `owner`;
falling back to `operator` keeps a running route reachable across the upgrade.

**A packing zone** — `pack_zone`, the third zone flag after finished goods
and loading dock, and the only one of which **each site needs one**: it is
where a shipment pick ends, where picked goods become a load unit. Capacity
is not counted. The bench really is small, but the limit is governed by eye
on the floor, and a constraint that gets stepped over is worse than none.

**Quarantine requests no longer wait their turn** — always maximum urgency,
computed and not written, for the same reason the due-date rule is computed:
writing `priority: 4` at creation would make that record claim, a month
later, an urgency nobody asked for.

1,550 client tests in 61 files, plus 347 on the service and benches. The new
ones were each verified by putting the defect back.

---

## 2.29.2 — 2026-09-08

**Four ways an icon comes out as text, and the fourth was on eleven thousand
rows.**

`ico()` returns a markup string, which is the right shape inside a template
literal. In four places that string lands where text is expected, and the
screen shows `<svg class="ico"…` spelled out. Two were closed in 2.27 and
2.29 — `toast`, which writes with `textContent`, and the inside of an
`<option>`, which the HTML parser discards. Andrea found the remaining two by
looking at the screen.

**A string built with an icon and then escaped.** In the Archive tab each
row's `sub` field is drawn with `_esc(r.sub)`, and two producers put an icon
inside it: every non-conformance card in the archive showed the raw markup.
The fix is not to drop `_esc` — `sub` carries location, reason and operator,
text that comes from the database, and building it pre-escaped would mean
every producer has to remember to escape its own parts. The icon goes.

**An icon passed as a child to `_h`**, the node builder. A string child is
appended with `createTextNode`, which is exactly right: article descriptions
and quarantine reasons go through there. On Configuration → Article Registry
the defect was on all 11,181 rows, twice per row — the Edit and Delete
buttons showed their own `<svg>` written out — and on the print button of the
movement registry. The fix is `icoNodo` in `ui/icone.ts`, which builds the
icon as a node, because a node is something `_h` already appends as a node.
`createElementNS`, not `createElement`: an `<svg>` built in the HTML
namespace sits in the tree and never draws.

In all four cases the sink is right. `textContent`, the select parser, `_esc`
and `createTextNode` are the four things that stop an article code from
carrying markup into a warehouse screen. The defect is always upstream.

Two new tests, one per sink, both verified by putting the defect back. 1,501
client tests in 59 files; 347 on the service and the benches. Verified across
34 screens in the browser: every view, every Movimenta sub-form, all eleven
Configuration tabs.

---

## 2.29.1 — 2026-09-08

**An audit that tried to break things, and broke five.**

No new database fields, no migration. Five defects found by attacking the
workflows rather than re-reading the code; five fixed, each with a test that
was verified by putting the defect back.

**The test benches had been lying since 2.26.** Seven `PATHFINDER_*` variables
live at machine scope on the development box, and every node process inherits
them. `server/test/collaudo.js` was written knowing this and neutralised six of
them — but not the two `PATHFINDER_TLS_*`, which did not exist when that file
was written: they arrived with 2.26. So the bench started in HTTPS while its
own tests spoke cleartext on the same port, collected the `301` that 2.26
answers to cleartext callers, and `fetch` followed the redirect by turning
every POST into a GET. Every write became a read.

It did not fail. It answered. Read tests passed and write tests failed,
accusing the service of holes it does not have — including three dead ends in
the operator hierarchy and one "the door stayed open", all false. 28 tests dead
in `collaudo.js`, 36 of 40 in `banco/gerarchia.cjs`. Underneath that red, a test
stale since 2.13 had been hiding, unseen for three versions.

The same inheritance affected `banco/prova-corrente.cjs`, which also inherited
`PATHFINDER_PG` — and that one wins over `PATHFINDER_DB`. It opened the live
warehouse database while its header declared that it touched nothing.

Fixed with `scollegaTls` in `server/lib/tls.js`, and with a new
`banco/servizio-banco.mjs` that declares a bench environment in full, so the
hand-typed recipe that forgot a variable twice in two weeks is gone.

**The first Admin was created, and the screen said it had failed.** On a fresh
install the setup wizard wrote the operator, then wrote two bookkeeping keys to
`meta`. But writing an operator with a PIN is exactly what closes the service's
first-boot window: the second write arrived without a session and took a 401,
the call threw, and the login that was meant to follow never ran. The installer
saw "invalid session" over an Admin that existed with the PIN they had just
chosen. The session is now taken between the two writes.

**Two dashboard tiles both advertised F3, and F3 did neither.** It opened the
picking screen on whichever sub-tab was last used. Meanwhile F4, F6, F7 and F8
existed and no tile said so. The key table and the tile labels were two lists
of the same thing, and they had already diverged in silence. There is one list
now, and the tile asks it for its key.

**Route warnings repeated themselves.** One note per stock row instead of one
per bin and reason, so a lot held in several rows of the same bin repeated the
same sentence. `(location_code, item_key)` is an index and not a uniqueness
constraint, so a bulk load can produce exactly that.

1,499 client tests in 59 files, plus 347 on the service and the benches — all
green, and the service benches run again for the first time since 2.26.

---

## 2.29.0 — 2026-09-08

**Goods already down in production are not fetched again.**

A production order's bill of materials asks for the full quantity. An order
picked halfway and reloaded asked for all of it a second time; a remainder left
in the work-in-progress bin by some other order was known to nobody. The picker
walks the aisle, takes the goods, and finds out afterwards — once the stock has
left the rack and somebody else's production account has been moved without a
record of it.

Loading an `.xlsx` now compares what the round asks for against what is standing
in the work-in-progress bin, and says so in a panel above the route preview.

**The two remainders are never added together**, and that is the whole rule.
The remainder held by orders **in this round** is stock that already came down
for this job: it reduces the requirement, and where it covers the whole line the
stop is not needed. The remainder held by **other** orders sits on somebody
else's account — taking it moves that account — so it is named, with the order
number that holds it, and it reduces nothing.

**The comparison is made in the unit of measure, never in packages.** The order
asks for kilograms; the bin holds packages, and how much is inside one is known
only when the lot declares its packaging — which, for raw materials, it almost
never does. A remainder without that quantity, or carrying a different unit from
the sheet's, does not enter the subtraction: the line is reported as uncertain,
the number is stated as a minimum, and somebody goes and looks. Multiplying
packages by a packaging nobody declared is the invented-unit defect, moved from
the route onto the account.

**No stop is touched.** The panel informs; the bill of materials stays what the
order declares. Reducing a requirement on the strength of a remainder nobody has
inspected means sending a batch into production short of material and finding
out once mixing has started. A test reads the panel's own source and checks
there is no `onclick` and no write to any stop.

**And the work-in-progress bin stops being a place goods are picked from.** That
was the real defect, and it surfaced while testing the feature above. Moving
goods into production is a *transfer*: the stock leaves the rack and stays
recorded in inventory, in the WIP bin. To `getItemByKey` that bin is a location
like any other, and the route builder never mentioned it. Once the rack ran dry,
the WIP bin became the only location holding the lot, and the route sent a
picker to fetch goods already in production — from the WIP bin to the WIP bin.
The builder now excludes it, and a line standing entirely there is reported with
its own reason, `in_lavorazione`, rather than "quarantined or committed to a
delivery note", which would send somebody looking for a fault that is not there.

Three further defects came out of deliberately trying to break the new code,
rather than out of re-reading it: an uncertain remainder belonging to *another*
order cancelled a figure computed correctly on one's own; a zero requirement
with stock in the bin printed "0 still needed"; and a request carrying no unit
of measure was allowed to have kilograms subtracted from it.

Also: five icons that were never seen, or seen as they should not have been.
Four `toast` calls written across two lines carried an icon in the message, and
`toast` writes with `textContent` — so the literal string `<svg class="ico"` was
displayed. The guard written in 2.27 missed them because it examined a single
line. A fifth sat inside an `<option>`, where the HTML parser discards tags that
do not belong in a dropdown: the icon never appeared and left a double space.
Both gaps now have tests, verified by putting the defects back.

No new database fields, no migration, the service was not touched.

---

## 2.28.0 — 2026-09-08

**Every sheet carries its own header and its own tail; the middle holds the
goods and nothing else.**

A warehouse sheet has two fixed bands and one that flows: sender and consignee
at the top, totals, carrier, dates and signatures at the bottom, the goods in
between — the rows that fit, with the rest moving to the next sheet, which
carries an identical header and an identical tail. Until 2.27 the tail followed
the last row of goods: on a two-line delivery note it sat halfway down the page,
on a twenty-line one at the foot, and whoever checks the load at the dock had to
hunt for it.

The tail now lives where the header lives: in a table group. `<thead>` and
`<tfoot>` are the two groups a browser repeats on every printed page, so the
tail moved into the second one, taking the footer with it. The band is painted
out of flow at `bottom: 0` and the `<tfoot>` reserves it, so no row of goods can
end up underneath — the 2.27 rule, extended from the footer alone to the whole
bottom band.

Exactly one number has to be measured: how tall the tail is, because the
document decides it — a delivery note with long remarks has a taller band than
one without. It is measured once, immediately before printing, with the print
rules lifted out of `@media print` (they never apply on screen, and measuring
without them would measure a document in rem instead of one in points). If the
measurement fails, nothing breaks: the class is not applied, the band stays in
flow, and the sheet is the 2.27 one.

A pagination model was written and thrown away, which is worth recording. To
place the tail at the bottom of the *last* page it counted rows sheet by sheet
to work out the leftover space. It was off by one row — heights measured
off-screen and heights after pagination never agree to the tenth — and there was
no making it converge. The rule was not "at the bottom of the last page" but "on
every page", and with that the model is unnecessary: five lines of CSS and one
`getBoundingClientRect`.

Measured on paper: a 40-line delivery note prints on **4 sheets** where it took
5, rows 11+11+11+7, tail at the same height on all four — signatures 33.2 mm
from the bottom edge, footer 13.1 mm, page number 4.9 mm — with the goods rows
stopping at 87.2 mm against a band that reaches 79.5. The first delivery note
printed after installation reports the same figures.

Delivery-note rows no longer split across sheets. That rule held for pick-report
rows since 2.24 and not for the delivery note, and the difference was never a
decision — it was a line nobody had written.

Signatures now print on every page, reversing 2.24. They had been taken out of
the repeated footer because "whoever signs cannot tell which one counts"; they
return because the bottom band belongs to the sheet, not to the document. It is
a decision, not an oversight, and a test guards it.

---

## 2.27.0 — 2026-09-07

**The footer of a flowing document now sits at the bottom of every sheet, and
document text is 10% smaller: a 90-line delivery note went from nine pages to
eight.**

`display: table-footer-group` is the only declaration that repeats a block on
every printed page, which is why the footer has lived in a `<tfoot>` since 2.1.
But it means *"at the end of every fragment of the table"*, not *"at the bottom
of the page"*: on a full page the two coincide by accident, on the last page the
fragment ends where the rows end. Short documents printed with the footer
floating mid-sheet.

The three alternatives were tried and rejected. `height: 100%` on the body cell
resolves against a table three pages tall — paged media exposes no way to ask
how much room is left on *this* page. A spacer filling the last page needs that
same missing number, and at a fixed size it produces a blank sheet. Page margin
boxes sit at the bottom by construction — that is where the page number comes
from — but `content:` takes strings and counters, not markup, and half the
footer is dynamic.

So the `<tfoot>` changed job. It still **reserves** its height at the end of
every fragment, last one included, so no row can land in the band; the footer
itself is **painted** by the same element taken out of flow and pinned to
`bottom: 0` — the route the draft watermark has used since 2.1, which Chrome
repaints on every sheet. Reservation and painted band read one variable,
`--doc-piede: 10mm`, guarded by a test: two numbers written twice diverge, and
the day they diverge the footer covers a row. Ten millimetres, not twelve,
because at twelve a full delivery note lost three rows on its first page.

Verified on paper, not just in the abstract: printed to PDF with headless Edge
and the text positions read sheet by sheet. Footer at 13.1 mm from the bottom
edge on all eight pages, content never below 26.6 mm against a band ending at
22, page number at 4.9 mm. The same sheet with only the old footer rule
restored puts the last page's footer back in the middle.

The 10% reduction rounds to 0.25 pt — at 0.5 pt the real factor swings ±3% on
the small sizes, which are two thirds of the declarations — with a floor at
6.5 pt, the smallest this project had already chosen twice. Adhesive labels are
excluded: they sit on fixed 100×80 and 100×60 mm stock, where shrinking
recovers nothing and moves the barcode away from the scanner. The watermark,
the page number and the non-conformity banner are excluded too. The scale is
not a CSS variable but a declared test measurement, `scalaDiStampa`: on paper
the number *is* the argument.

**Sampling now accepts kilograms or grams on weight-managed items.** Fifty
grams taken from a 25 kg sack had to be typed as `0.05`, which is the number
people get wrong. The stock movement is still recorded in the item's own unit —
the conversion ends in the form, and neither the store, the service nor the log
knows about it. A conversion that is not exact is **refused**, not rounded: half
a gram on an item counted in whole grams is a quantity the warehouse cannot
write.

**Two search fields work again — they had been broken since 2.23.** The movement
log and the item master showed the literal text `<svg class=` and filtered
nothing. The emoji-to-sprite migration had placed the icon helper inside the
`placeholder` attribute; the helper returns markup with double quotes, so the
parser closed the attribute at the first one and the `<input>` tag at the first
`>`, and the `oninput` handler was never applied. A third instance, never
reported, was found in the finished-goods view. A new test fails if an icon call
appears inside an attribute value.

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
- The default layout is sized for the media actually in use — **die-cut
  adhesive labels, 100 × 80 mm, 203 dpi printhead** (ZD200 series). It occupies
  68.5 mm of the 80; the remaining 11.5 mm are deliberate, because registration
  on die-cut stock drifts a millimetre or two per feed and a field at the edge
  eventually gets clipped. Type sizes are generous because the reader is wearing
  gloves. These are **not** the A4 label's dimensions (100 × 60) and are not
  meant to be: the sheet is a fallback, not an imitation of the roll.
- Media calibration (die-cut stock uses **gap sensing**) and darkness stay on
  the printer, set once at the panel. The service deliberately never sends
  them.
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
- 78 new service tests (`server/test/collaudo-stampa.js`) run against a fake
  printer listening on 9100 — no hardware required. What hardware *is* still
  required for — a real scanner reading the bars, print alignment, darkness —
  is recorded as open work — as is the one assumption everything rests on: that
  these printers have a network port at all. Desktop Zebras in this class often
  ship USB-only, and an external print server would cover that case without a
  line of code changing.

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
