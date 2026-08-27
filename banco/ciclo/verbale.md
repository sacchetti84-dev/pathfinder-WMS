# Ciclo 2.0 — dal carico al consumo, su copia del magazzino vero

2026-08-24T22:44:00.043Z

## ⓪ Il banco

Giacenza **237** righe · movimenti **0** · articoli **11181** · zone **22**
Area WIP: `MAG1-WIP-01`

> **DIFETTO D1** (dato) — `anagrafica articoli`
> L'ODP2603889 chiede questi componenti in KG, l'anagrafica li dichiara altrimenti: 6001055=PZ. Il magazzino conta pezzi dove la produzione pesa chili, e nessuna delle due parti se ne accorge.
> Prova: riga 6001055: 0,468 KG richiesti su un articolo dichiarato PZ


Componenti con unità discorde: **1**/15 · senza `pieces_per_pack`: **0**/15

## ① Carico

| Articolo | UM | KG a scaffale | colli | somma colli | riga letta |
|---|---|---:|---:|---:|---|
| 6001418 | KG | 360.735 | 15 | 360.735 | qty=15 qty_uom=360.735 |
| 6000149 | KG | 93.795 | 4 | 93.795 | qty=4 qty_uom=93.795 |
| 6000886 | KG | 89.575 | 4 | 89.575 | qty=4 qty_uom=89.575 |
| 6000296 | KG | 82.178 | 4 | 82.178 | qty=4 qty_uom=82.178 |
| 6000004 | KG | 37.518 | 2 | 37.518 | qty=2 qty_uom=37.518 |
| 6000037 | KG | 18.759 | 1 | 18.759 | qty=1 qty_uom=18.759 |
| 6000242 | KG | 11.255 | 1 | 11.255 | qty=1 qty_uom=11.255 |
| 6000006 | KG | 5.628 | 1 | 5.628 | qty=1 qty_uom=5.628 |
| 6000002 | KG | 1.407 | 1 | 1.407 | qty=1 qty_uom=1.407 |
| 6001055 | PZ | 0.866 | 1 | 1 | qty=1 qty_uom=1 |
| 6000049 | KG | 0.581 | 1 | 0.581 | qty=1 qty_uom=0.581 |
| 6000401 | KG | 0.469 | 1 | 0.469 | qty=1 qty_uom=0.469 |
| 6000286 | KG | 0.45 | 1 | 0.45 | qty=1 qty_uom=0.45 |
| 6001335 | KG | 0.2 | 1 | 0.2 | qty=1 qty_uom=0.2 |
| 6001182 | KG | 0.044 | 1 | 0.044 | qty=1 qty_uom=0.044 |

## ② Prelievo → WIP (area `MAG1-WIP-01`)

| Ordine | righe | chiesto KG | entrato KG | scarto | colli |
|---|---:|---:|---:|---:|---:|
| ODP2603889 | 15 | 379.782 | 759.564 | 379.782 | 72 |

> **DIFETTO P3** (grave) — `conto WIP`
> ODP2603889 chiedeva 379.782 KG e nel conto ne sono entrati 759.564
> Prova: scarto 379.782 KG

| ODP-META | 14 | 189.89 | 379.78 | 189.89 | 36 |

> **DIFETTO P3** (grave) — `conto WIP`
> ODP-META chiedeva 189.89 KG e nel conto ne sono entrati 379.78
> Prova: scarto 189.89 KG

| ODP-QUARTO | 14 | 94.946 | 189.892 | 94.946 | 34 |

> **DIFETTO P3** (grave) — `conto WIP`
> ODP-QUARTO chiedeva 94.946 KG e nel conto ne sono entrati 189.892
> Prova: scarto 94.946 KG

| ODP-DECIMO | 14 | 37.976 | 75.952 | 37.976 | 40 |

> **DIFETTO P3** (grave) — `conto WIP`
> ODP-DECIMO chiedeva 37.976 KG e nel conto ne sono entrati 75.952
> Prova: scarto 37.976 KG


In lavorazione secondo il conto: **1405.188 KG** · in giacenza in `MAG1-WIP-01`: **702.594 KG**


> **DIFETTO P4** (grave) — `area WIP`
> Il conto degli ordini e la giacenza del vano WIP divergono: conto 1405.188 KG, vano 702.594 KG
> Prova: vano MAG1-WIP-01


## ③ Reso

| Ordine | riga | resa | conto colli (entrato/reso/resta) | conto KG (entrato/reso/resta) |
|---|---|---:|---|---|
| ODP-META | 6001418#261571 | 2 coll. | 8/4/2 | 194.992/100/47.496 |

### La riga del vano WIP, prima e dopo un prelievo «a numero di colli»

| | colli (qty) | elenco packs | qty_uom |
|---|---:|---|---:|
| prima | 7 | 7 voci, somma 93.795 | 93.795 |
| dopo il tentativo | 7 | 7 voci, somma 93.795 | 93.795 |

Rifiuto: **6000149#261177 in MAG1-WIP-01 dichiara i suoi colli: per toglierne 1 bisogna dire QUALI**


## ④ Chiusura — il residuo diventa consumo

| Ordine | righe chiuse | entrato | reso | consumato | resta | entrato KG | consumato KG |
|---|---:|---:|---:|---:|---:|---:|---:|
| ODP2603889 | 14 | 72 | 9 | 63 | 0 | 759.564 | 759.564 |
| ODP-META | 14 | 36 | 4 | 32 | 0 | 379.78 | 279.78 |
| ODP-QUARTO | 14 | 34 | 0 | 34 | 0 | 189.892 | 189.892 |
| ODP-DECIMO | 14 | 40 | 0 | 40 | 0 | 75.952 | 75.952 |

Nel vano `MAG1-WIP-01` restano **0** righe del ciclo


## ⑤ La quadratura

| Articolo | caricato KG | a scaffale KG | consumato KG | reso KG | scarto |
|---|---:|---:|---:|---:|---:|
| 6001418 | 360.735 | 100 | 621.47 | 100 | -360.735 |
| 6000149 | 93.795 | 0 | 187.59 | 0 | -93.795 |
| 6000886 | 89.575 | 0 | 179.15 | 0 | -89.575 |
| 6000296 | 82.178 | 0 | 164.356 | 0 | -82.178 |
| 6000004 | 37.518 | 0 | 75.036 | 0 | -37.518 |
| 6000037 | 18.759 | 0 | 37.518 | 0 | -18.759 |
| 6000242 | 11.255 | 0 | 22.51 | 0 | -11.255 |
| 6000006 | 5.628 | 0 | 11.256 | 0 | -5.628 |
| 6000002 | 1.407 | 0 | 2.814 | 0 | -1.407 |
| 6000049 | 0.581 | 0 | 1.162 | 0 | -0.581 |
| 6000401 | 0.469 | 0 | 0.938 | 0 | -0.469 |
| 6000286 | 0.45 | 0.486 | 0.9 | 0 | -0.936 |
| 6001335 | 0.2 | 0.216 | 0.4 | 0 | -0.416 |
| 6001182 | 0.044 | 0.048 | 0.088 | 0 | -0.092 |

**Scarto assoluto complessivo: 703.344 KG**


> **DIFETTO Q1** (grave) — `quadratura del ciclo`
> Alla fine del ciclo 703.344 KG non si ritrovano da nessuna parte: né a scaffale, né consumati, né resi.
> Prova: somma degli scarti per articolo, tolleranza 0,05 KG


## ⑥ KPI — le persone

| Sigla | mov. | colli | UM mosse | giorni attivi | mov./giorno | compiti presi/chiusi/annull. | esec. min (mediana) | attesa min |
|---|---:|---:|---|---:|---:|---|---:|---:|
| ANAD | 0 | 0 | — | 0 | 0 | 6/5/5 | 0.3 | 0.6 |
| ANDS | 0 | 0 | — | 0 | 0 | 28/20/8 | 1 | 0.2 |
| BABB | 0 | 0 | — | 0 | 0 | 6/2/0 | 1.2 | 0.4 |

Sigle in anagrafica: EFBR, BABB, ANDS, ANAD · **orfane: 0**


## ⑥ KPI — i movimenti

Totale **0** · colli mossi **0** · UM: —
Rettifiche **0** (0%) · senza firma **0** · senza quantità **0** (storici)

| Causale | quanti | | Sito | quanti |
|---|---:|---|---|---:|

## ⑥ KPI — gli articoli

Articoli a giacenza **152** · righe ferme da oltre 90 giorni **127** · scadute **4** · in scadenza a 30 giorni **1**

Copertura anagrafica sotto la merce che si muove: senza unità **0** · senza quantità per collo **2** · senza allergeni **151** · senza classe di conservazione **150**

| Articolo | righe | vani | colli | UM | mov. | uscite | fermo da | prima scad. |
|---|---:|---:|---:|---|---:|---:|---:|---|
| 123456 | 1 | 1 | 100 | — | 0 | 0 | 4 gg | 2026-03-12 |
| 1320156 | 1 | 1 | 1 | — | 0 | 0 | 11 gg | — |
| 2510043 | 1 | 1 | 1 | — | 0 | 0 | 112 gg | — |
| 2510548 | 1 | 1 | 1 | — | 0 | 0 | 102 gg | — |
| 2510603 | 1 | 1 | 1 | — | 0 | 0 | 116 gg | — |
| 2510632 | 2 | 2 | 2 | — | 0 | 0 | 102 gg | — |
| 2510723 | 1 | 1 | 1 | — | 0 | 0 | 116 gg | — |
| 2510766 | 1 | 1 | 1 | — | 0 | 0 | 116 gg | — |
| 2510769 | 1 | 1 | 1 | — | 0 | 0 | 116 gg | — |
| 2510798 | 1 | 1 | 1 | — | 0 | 0 | 116 gg | — |
| 2510798/F | 1 | 1 | 1 | — | 0 | 0 | 116 gg | — |
| 2510815 | 2 | 2 | 2 | — | 0 | 0 | 116 gg | — |

### Quello che il dato di oggi non regge

| Non si può misurare | Perché | Servirebbe |
|---|---|---|
| Durata di un singolo movimento | un movimento porta un istante solo, `ts`. Servirebbe l'istante in cui la maschera si è aperta, e nessuno lo scrive. | un `started_at` sul movimento |
| Colli all'ora per operatore | si può stimare dall'intervallo fra il primo e l'ultimo movimento di un giorno, ma quell'intervallo comprende le pause e il lavoro che non passa da qui. | un turno dichiarato, o la durata del movimento |
| Distanza percorsa | la geometria dà l'ordine delle ubicazioni, non i metri fra due vani. | le coordinate della zona, che oggi non sono un dato |
| Saturazione di un vano | la capienza non è dichiarata da nessuna parte — il motore di stoccaggio ha il vincolo e non lo usa mai. | `capacity` sulla zona (§2, voce 17) |
| Costo di una riga di giacenza | nessun valore economico entra in Pathfinder, ed è deliberato: il valore sta in Sage. | niente — si chiede a Sage |

## Il pacchetto

`_format` **warehouse-mapper-v1.5** · `_appVersion` **2.4** · collezioni previste 18
Verifica: **passa**

| Collezione | nel pacchetto | in cache |
|---|---:|---:|
| sites | 5 | 5 |
| zones | 19 | 19 |
| articles | 11181 | 11181 |
| inventory | 194 | 194 |
| operators | 3 | 3 |
| tasks | 27 | 27 |
| wip | 3 | 3 |
| udc | 1 | 1 |
| storage_rules | 1 | 1 |
| recipients | 0 | 0 |

### Un pacchetto che non sta in piedi

| Caso | esito |
|---|---|
| senza _format | rifiutato — Formato non riconosciuto: "assente". Atteso warehouse-mapper-v1.5.x |
| con un _format di un altro applicativo | rifiutato — Formato non riconosciuto: "qualcos-altro-v9". Atteso warehouse-mapper-v1.5.x |
| con una collezione che non è un elenco | rifiutato — sites: il file dichiara 5 record, ne contiene 0 |
| vuoto | rifiutato — Formato non riconosciuto: "assente". Atteso warehouse-mapper-v1.5.x |
| null | rifiutato — File non leggibile o non JSON. |

### Il giro completo

| Voce | prima | dopo |
|---|---:|---:|
| giacenza | 194 | 194 |
| colli | 3503003 | 3503003 |
| um | 98341 | 98341 |
| articoli | 11181 | 11181 |
| operatori | 3 | 3 |
| compiti | 27 | 27 |
| movimenti | 112 | 112 |

## Il pacchetto

`_format` **warehouse-mapper-v1.5** · `_appVersion` **2.4** · collezioni previste 18
Verifica: **passa**

| Collezione | nel pacchetto | in cache |
|---|---:|---:|
| sites | 5 | 5 |
| zones | 19 | 19 |
| articles | 11181 | 11181 |
| inventory | 194 | 194 |
| operators | 3 | 3 |
| tasks | 27 | 27 |
| wip | 3 | 3 |
| udc | 1 | 1 |
| storage_rules | 1 | 1 |
| recipients | 0 | 0 |

### Un pacchetto che non sta in piedi

| Caso | esito |
|---|---|
| senza _format | rifiutato — Formato non riconosciuto: "assente". Atteso warehouse-mapper-v1.5.x |
| con un _format di un altro applicativo | rifiutato — Formato non riconosciuto: "qualcos-altro-v9". Atteso warehouse-mapper-v1.5.x |
| con una collezione che non è un elenco | rifiutato — sites: il file dichiara 5 record, ne contiene 0 |
| vuoto | rifiutato — Formato non riconosciuto: "assente". Atteso warehouse-mapper-v1.5.x |
| null | rifiutato — File non leggibile o non JSON. |

### Il giro completo

| Voce | prima | dopo |
|---|---:|---:|
| giacenza | 194 | 194 |
| colli | 3503003 | 3503003 |
| um | 98341 | 98341 |
| articoli | 11181 | 11181 |
| operatori | 3 | 3 |
| compiti | 27 | 27 |
| movimenti | 112 | 0 |

> **DIFETTO PA6** (grave) — `core/store.ts:importAll`
> Reimportare il pacchetto appena composto cambia i numeri: movimenti: 112 → 0. È il gesto con cui si rimette in piedi una macchina, e deve lasciare le cose com'erano.
> Prova: import in modo overwrite


## Il pacchetto

`_format` **warehouse-mapper-v1.5** · `_appVersion` **2.4** · collezioni previste 18
Verifica: **passa**

| Collezione | nel pacchetto | in cache |
|---|---:|---:|
| sites | 5 | 5 |
| zones | 19 | 19 |
| articles | 11181 | 11181 |
| inventory | 194 | 194 |
| operators | 3 | 3 |
| tasks | 27 | 27 |
| wip | 3 | 3 |
| udc | 1 | 1 |
| storage_rules | 1 | 1 |
| recipients | 0 | 0 |

### Un pacchetto che non sta in piedi

| Caso | esito |
|---|---|
| senza _format | rifiutato — Formato non riconosciuto: "assente". Atteso warehouse-mapper-v1.5.x |
| con un _format di un altro applicativo | rifiutato — Formato non riconosciuto: "qualcos-altro-v9". Atteso warehouse-mapper-v1.5.x |
| con una collezione che non è un elenco | rifiutato — sites: il file dichiara 5 record, ne contiene 0 |
| vuoto | rifiutato — Formato non riconosciuto: "assente". Atteso warehouse-mapper-v1.5.x |
| null | rifiutato — File non leggibile o non JSON. |

### Il giro completo

| Voce | prima | dopo |
|---|---:|---:|
| giacenza | 194 | 194 |
| colli | 3503003 | 3503003 |
| um | 98341 | 98341 |
| articoli | 11181 | 11181 |
| operatori | 3 | 3 |
| compiti | 27 | 27 |
| movimenti | 112 | 112 |
