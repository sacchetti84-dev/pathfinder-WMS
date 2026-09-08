# Ciclo 2.0 — dal carico al consumo, su copia del magazzino vero

2026-09-08T22:08:46.081Z

## ⓪ Il banco

Giacenza **194** righe · movimenti **110** · articoli **11181** · zone **19**
Area WIP: `M06-COM-01`

> **DIFETTO D1** (dato) — `anagrafica articoli`
> L'ODP2603889 chiede questi componenti in KG, l'anagrafica li dichiara altrimenti: 6001055=PZ. Il magazzino conta pezzi dove la produzione pesa chili, e nessuna delle due parti se ne accorge.
> Prova: riga 6001055: 0,468 KG richiesti su un articolo dichiarato PZ


Componenti con unità discorde: **1**/15 · senza `pieces_per_pack`: **15**/15

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

## ② Prelievo → WIP (area `M06-COM-01`)

| Ordine | righe | chiesto KG | entrato KG | scarto | colli |
|---|---:|---:|---:|---:|---:|
| ODP2607777 | 14 | 379.782 | 379.782 | 0 | 25 |
| ODP-META | 14 | 189.89 | 189.89 | 0 | 18 |
| ODP-QUARTO | 14 | 94.946 | 94.946 | 0 | 17 |
| ODP-DECIMO | 14 | 37.976 | 37.976 | 0 | 20 |

In lavorazione secondo il conto: **702.594 KG** · in giacenza in `M06-COM-01`: **702.594 KG**


## ③ Reso

| Ordine | riga | resa | conto colli (entrato/reso/resta) | conto KG (entrato/reso/resta) |
|---|---|---:|---|---|
| ODP-META | 6001418#261571 | 2 coll. | 4/2/2 | 97.496/50/47.496 |

### La riga del vano WIP, prima e dopo un prelievo «a numero di colli»

| | colli (qty) | elenco packs | qty_uom |
|---|---:|---|---:|
| prima | 7 | 7 voci, somma 93.795 | 93.795 |
| dopo il tentativo | 7 | 7 voci, somma 93.795 | 93.795 |

Rifiuto: **6000149#261177 in M06-COM-01 dichiara i suoi colli: per toglierne 1 bisogna dire QUALI**


## ④ Chiusura — il residuo diventa consumo

| Ordine | righe chiuse | entrato | reso | consumato | resta | entrato KG | consumato KG |
|---|---:|---:|---:|---:|---:|---:|---:|
| ODP2607777 | 14 | 25 | 0 | 25 | 0 | 379.782 | 379.782 |
| ODP-META | 14 | 18 | 2 | 16 | 0 | 189.89 | 139.89 |
| ODP-QUARTO | 14 | 17 | 0 | 17 | 0 | 94.946 | 94.946 |
| ODP-DECIMO | 14 | 20 | 0 | 20 | 0 | 37.976 | 37.976 |

Nel vano `M06-COM-01` restano **0** righe del ciclo


## ⑤ La quadratura

| Articolo | caricato KG | a scaffale KG | consumato KG | reso KG | scarto |
|---|---:|---:|---:|---:|---:|
| 6001418 | 360.735 | 50 | 310.735 | 50 | 0 |
| 6000149 | 93.795 | 0 | 93.795 | 0 | 0 |
| 6000886 | 89.575 | 0 | 89.575 | 0 | 0 |
| 6000296 | 82.178 | 0 | 82.178 | 0 | 0 |
| 6000004 | 37.518 | 0 | 37.518 | 0 | 0 |
| 6000037 | 18.759 | 0 | 18.759 | 0 | 0 |
| 6000242 | 11.255 | 0 | 11.255 | 0 | 0 |
| 6000006 | 5.628 | 0 | 5.628 | 0 | 0 |
| 6000002 | 1.407 | 0 | 1.407 | 0 | 0 |
| 6000049 | 0.581 | 0 | 0.581 | 0 | 0 |
| 6000401 | 0.469 | 0 | 0.469 | 0 | 0 |
| 6000286 | 0.45 | 0 | 0.45 | 0 | 0 |
| 6001335 | 0.2 | 0 | 0.2 | 0 | 0 |
| 6001182 | 0.044 | 0 | 0.044 | 0 | 0 |

**Scarto assoluto complessivo: 0 KG**


## ⑥ KPI — le persone

| Sigla | mov. | colli | UM mosse | giorni attivi | mov./giorno | compiti presi/chiusi/annull. | esec. min (mediana) | attesa min |
|---|---:|---:|---|---:|---:|---|---:|---:|
| ANDS | 90 | 845 | 2856 KG · 100800 PZ | 4 | 22.5 | 19/16/5 | 0.9 | 0.1 |
| DP | 14 | 136 | — | 2 | 7 | 0/0/0 | — | — |
| BABB | 6 | 49 | 100.1 KG | 1 | 6 | 6/2/0 | 1.2 | 0.4 |
| AS | 2 | 2 | — | 1 | 2 | 0/0/0 | — | — |

Sigle in anagrafica: EFBR, BABB, ANDS · **orfane: 2**


> **DIFETTO K3** (dato) — `registro movimenti / anagrafica operatori`
> 2 sigle firmano movimenti ma non stanno fra gli operatori: DP (14 mov.), AS (2 mov.). Fra tre anni quella firma non risponde a un nome — o è un operatore cancellato, o è una sigla digitata a mano.
> Prova: operatori in anagrafica: EFBR, BABB, ANDS


## ⑥ KPI — i movimenti

Totale **112** · colli mossi **1032** · UM: **2956.1 KG** · **100800 PZ**
Rettifiche **6** (5.4%) · senza firma **0** · senza quantità **12** (storici)

| Causale | quanti | | Sito | quanti |
|---|---:|---|---|---:|
| PICK | 33 | | MAG | 71 |
| MOVE | 22 | | M03 | 28 |
| IN | 15 | | MAG1 | 12 |
| SHIP | 12 | | M06 | 1 |
| SAMPLE | 9 | |  |  |
| FIX+ | 5 | |  |  |
| QUAR | 4 | |  |  |
| QREL | 4 | |  |  |
| EDIT | 4 | |  |  |
| OUT | 3 | |  |  |
| FIX- | 1 | |  |  |

## ⑥ KPI — gli articoli

Articoli a giacenza **153** · righe ferme da oltre 90 giorni **152** · scadute **6** · in scadenza a 30 giorni **0**

Copertura anagrafica sotto la merce che si muove: senza unità **0** · senza quantità per collo **151** · senza allergeni **152** · senza classe di conservazione **151**

| Articolo | righe | vani | colli | UM | mov. | uscite | fermo da | prima scad. |
|---|---:|---:|---:|---|---:|---:|---:|---|
| 6000366 | 5 | 5 | 61 | — | 26 | 9 | 20 gg | 2026-07-28 |
| 6000366B | 8 | 8 | 293 | 3851 KG | 17 | 8 | 20 gg | — |
| 7000924 | 4 | 4 | 12 | 290 KG | 15 | 4 | 20 gg | — |
| 3502551 | 6 | 5 | 183 | 94200 PZ | 7 | 1 | 26 gg | — |
| 6000242 | 1 | 1 | 12 | — | 6 | 5 | 20 gg | — |
| 123 | 1 | 1 | 2 | — | 5 | 1 | 34 gg | — |
| 6000002 | 1 | 1 | 4 | — | 3 | 3 | 32 gg | — |
| 6000004 | 1 | 1 | 3 | — | 3 | 3 | 32 gg | — |
| 6000006 | 1 | 1 | 8 | — | 3 | 3 | 32 gg | — |
| 6000149 | 2 | 2 | 63 | — | 3 | 3 | 32 gg | — |
| 6000296 | 4 | 4 | 13 | — | 3 | 3 | 32 gg | — |
| 6001335 | 1 | 1 | 1 | — | 3 | 3 | 32 gg | — |

### Quello che il dato di oggi non regge

| Non si può misurare | Perché | Servirebbe |
|---|---|---|
| Durata di un singolo movimento | un movimento porta un istante solo, `ts`. Servirebbe l'istante in cui la maschera si è aperta, e nessuno lo scrive. | un `started_at` sul movimento |
| Colli all'ora per operatore | si può stimare dall'intervallo fra il primo e l'ultimo movimento di un giorno, ma quell'intervallo comprende le pause e il lavoro che non passa da qui. | un turno dichiarato, o la durata del movimento |
| Distanza percorsa | la geometria dà l'ordine delle ubicazioni, non i metri fra due vani. | le coordinate della zona, che oggi non sono un dato |
| Saturazione di un vano | la capienza non è dichiarata da nessuna parte — il motore di stoccaggio ha il vincolo e non lo usa mai. | `capacity` sulla zona (§2, voce 17) |
| Costo di una riga di giacenza | nessun valore economico entra in Pathfinder, ed è deliberato: il valore sta in Sage. | niente — si chiede a Sage |

## Unità di carico

`UDC-000002` · MAG1-RAKA-02-01-T → MAG1-RAKA-02-01-A · 58 KG prima, 58 KG dopo · colli [25,25,8]
Svuotata prelevando l'ultima riga: stato `empty` · ancora fra le aperte: no

Codici interni consecutivi: `UDC-000003` → `UDC-000004`
Con prefisso GS1 `0712345`: `007123450000000057` (18 cifre)
Somma pesata: 70 — chiude a multiplo di dieci

## Quarantena

Origine 62 → 37 KG · cella di blocco 25 KG · somma 62

## Campionamento

Prelevati 0,05 KG dal collo da 10: colli 2 → 2 · UM 35 → 34.95 · elenco [25,9.95]
Tentativo di svuotare un collo intero: **rifiutato** — Un campione lascia sempre un residuo: per prendere tutto il collo da 25 KG serve un prelievo

## Conta mirata

Da [25,25,25] a [25,24,25,6] · uscite [[object Object]] · entrate [6]
Riga dopo la rettifica: 4 colli · 80 KG · [24,25,25,6]

## DDT — prenotazione ed evasione

Documento `RES-PROVA20-MTT81RO7` registrato · giacenza 59 KG (invariata) · fisici 3 coll., disponibili 2
Alla evasione i colli si ritrovano per misura: [{"indice":0}]
Evaso: 59 → 34 KG (usciti 25)

## Spostamento

25 KG spostati: a destinazione 25 KG, colli [25]

## Smaltimento

Smaltiti 28 KG su 53: resta 25 KG in 2 coll. [22,3]

## Attività

`TA-MTT81RUP-YWJI` · stato in_progress · preso da ANDS · avviato sì
Dopo un movimento da 1 collo su 3 chiesti: stato done, mossi 1
Smaltimento, 1 collo su 3: stato in_progress, mossi 1
Dopo i 2 rimanenti: stato done
Riavvio di un compito chiuso: **rifiutato**
Annullamento senza motivo: **rifiutato**

## Motore di stoccaggio

Valutate **274** ubicazioni in **5 ms** · proposte 250 · escluse 24
Prima proposta: `MAG1-RAKA-02-02-A` — Questo lotto sta già qui: portalo qui e la giacenza resta una riga sola
Primo escluso: `MAG-ACC-15` — stato

## FEFO

Primo in FEFO per 6000242: lotto **FEFO-PRESTO** con scadenza 2026-09-01

## Il percorso — lettura dell ODP

Ordine `ODP2607777` · articolo 4060854/01 lotto 26A621
Righe lette: **15** · avvisi: nessuno

| Articolo | letto KG | atteso KG | lotto letto | lotto atteso |
|---|---:|---:|---|---|
| 6001418 | 194.992 | 194.992 | 261571 | 261571 |
| 6000149 | 50.7 | 50.7 | 261177 | 261177 |
| 6000886 | 48.419 | 48.419 | 260545 | 260545 |
| 6000296 | 44.42 | 44.421 | 262185 | 262185 |
| 6000004 | 20.28 | 20.28 | 261887 | 261887 |
| 6000037 | 10.14 | 10.14 | 261867 | 261867 |
| 6000242 | 6.085 | 6.084 | 260926 | 260926 |
| 6000006 | 3.04 | 3.042 | 261794 | 261794 |
| 6000002 | 0.765 | 0.761 | 262191 | 262191 |
| 6001055 | 0.47 | 0.468 | 261357 | 261357 |
| 6000049 | 0.315 | 0.314 | 260594 | 260594 |
| 6000401 | 0.25 | 0.254 | 262198 | 262198 |
| 6000286 | 0.245 | 0.243 | 260322 | 260322 |
| 6001335 | 0.11 | 0.108 | 261534 | 261534 |
| 6001182 | 0.025 | 0.024 | 233234 | 233234 |

Somma delle quindici righe: **380.256 KG** — l'ordine dichiara **380.25**


## Il percorso — costruzione

Tappe **15** · fuori percorso 0 · note 0
Tappe per sito: M03=13 · MAG=1 · MAG1=1
**Casa: `M03`** · tappe in un altro magazzino: **2**

Prima tappa: `M03-CAT-03` (sito M03)

### L ordine delle tappe

| # | sito | ubicazione | articolo | KG |
|---:|---|---|---|---:|
| 1 | M03 | M03-CAT-03 | 6000006 | 3.04 |
| 2 | M03 | M03-STK-02-05-T | 6000401 | 0.25 |
| 3 | M03 | M03-STK-02-04-T | 6000002 | 0.765 |
| 4 | M03 | M03-STK-02-04-A | 6001055 | 0.47 |
| 5 | M03 | M03-STK-02-04-B | 6000049 | 0.315 |
| 6 | M03 | M03-STK-02-03-B | 6000149 | 50.7 |
| 7 | M03 | M03-STK-02-02-T | 6000296 | 44.42 |
| 8 | M03 | M03-STK-02-02-A | 6000004 | 20.28 |
| 9 | M03 | M03-STK-02-02-B | 6000037 | 10.14 |
| 10 | M03 | M03-STK-02-01-T | 6001418 | 194.992 |
| 11 | M03 | M03-STK-02-01-B | 6000886 | 48.419 |
| 12 | M03 | M03-STK-03-02-T | 6001335 | 0.11 |
| 13 | M03 | M03-SPD-01 | 6000286 | 0.245 |
| 14 | MAG | MAG-ACC-01 | 6000242 | 6.085 |
| 15 | MAG1 | MAG1-RAKA-01-01-C | 6001182 | 0.025 |

Ordine dei magazzini: M03 → MAG → MAG1 · siti distinti 3


## Il trasferimento chiesto dall ordine (1.10)

Da `MAG-ACC-01` (mag) a `M03-TRA-01` · payload: `{"article_code":"6000242","lot_code":"260926","qty_uom":6.085,"uom":"KG","from":"MAG-ACC-01","to":"M03-TRA-01","odp_num":"ODP2607777"}`
Compito `TA-MTT81T7W-8D9U` in coda, stato requested
La tappa si sposta: `MAG-ACC-01` → `M03-TRA-01` · resta un prelievo: sì

### La memoria delle richieste

Ordine di visita rovesciato: 2 tappe erano state spostate, 2 sono tornate dov'erano

> La memoria delle richieste NON sta in `pickRoute`: la tiene la vista. Questa prova misura il rischio, non lo corregge.


## Il pacchetto

`_format` **warehouse-mapper-v1.5** · `_appVersion` **2.36.0** · collezioni previste 19
Verifica: **passa**

| Collezione | nel pacchetto | in cache |
|---|---:|---:|
| sites | 5 | 5 |
| zones | 19 | 19 |
| articles | 11181 | 11181 |
| inventory | 221 | 221 |
| operators | 3 | 3 |
| tasks | 31 | 31 |
| wip | 116 | 116 |
| udc | 5 | 5 |
| storage_rules | 1 | 1 |
| recipients | 4 | 4 |

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
| giacenza | 221 | 221 |
| colli | 3503064 | 3503064 |
| um | 99431.014 | 99431.014 |
| articoli | 11181 | 11181 |
| operatori | 3 | 3 |
| compiti | 31 | 31 |
| movimenti | 113 | 113 |

## Giacenza per articolo (1.9)

| Lotto | scadenza | vani | colli | UM |
|---|---|---:|---:|---|
| INV-PRESTO | 2026-10-15 | 1 | 2 | 12.5 KG |
| INV-TARDI | 2028-06-30 | 2 | 3 | 55 KG |
| 261867 | — | 1 | 1 | 20.28 KG |

Totali per unità: **87.78 KG** · colli 6 · righe 4

Unità presenti: PZ, KG · riepilogo: 87.78 KG · 94400 PZ

### La coda di conte

Spuntate in quest'ordine: M03-STK-02-02-B|6000037#261867 · M03-STK-04-01-A|6000037#INV-TARDI · M03-STK-04-01-T|6000037#INV-TARDI · M03-STK-04-02-T|6000037#INV-PRESTO
La coda esce: M03-STK-04-02-T|6000037#INV-PRESTO · M03-STK-04-01-A|6000037#INV-TARDI · M03-STK-04-01-T|6000037#INV-TARDI · M03-STK-02-02-B|6000037#261867

Lotti nella coda: INV-PRESTO → INV-TARDI → 261867

## Inventario di vano

| Riga | com era | come è | esito |
|---|---|---|---|
| 6000037#INV-A | [25,25] | [25,24] | 2 coll. · 49 · [24,25] |
| 6000004#INV-B | [20,5] | [20,5,5] | 3 coll. · 30 · [20,5,5] |
| 6000006#INV-C | [10] | [] | riga sparita |

Movimenti scritti in M03-STK-04-03-T: nessuno


### La riga che non c è più

In M03-STK-04-03-T restano: 6000037#INV-A=2 coll. · 6000004#INV-B=3 coll.

## Storno di un prelievo

Prima: [25,25,6] = 56 KG
Dopo aver preso 10 KG: [15,25,6] = 46 KG · usciti [10]
Dopo lo storno: [25,6,25] = 56 KG


### Chi scrive cosa nell azione di annullamento

| Maschera | `qty` da | `qty_uom` | `packs` |
|---|---|---|---|
| posiziona.ts (op: remove) | l'elenco | sì | sì |
| prelievo.ts — carrello di produzione | calo dello scaffale | sì | sì |
| percorso.ts — tappa del prelievo guidato | l'elenco | sì | sì |
| smaltimento.ts | l'elenco | sì | sì |

## Storno di un posizionamento

Riga dopo il secondo carico: [20,20,15,7] = 62 KG
Dopo lo storno: [20,20] = 40 KG (attesi [20,20] = 40)


### Il collo che non c è più

Storno di [12,9] su una riga che porta [12]: **si ferma** — Il collo da 9 non è più su questa riga: lo storno non può ritrovarlo

## Conformità — le due metà del confronto

Zone attive **14** · con classe di conservazione **1** · con zona allergeni dichiarata **1**
Articoli a giacenza **155** · con allergeni dichiarati **1** · con classe di conservazione **2**

### Cosa dice la verifica

```
{
 "nonConformita": [
  {
   "location_code": "MAG-ACC-03",
   "item_key": "7000924#123456",
   "article_code": "7000924",
   "article_description": "LECITINA DI SOIA",
   "lot_code": "123456",
   "qty": 1,
   "tipo": "ALLERGENE_FUORI_ZONA",
   "gravita": "alta",
   "messaggio": "Contiene Soia — fuori dalla zona riservata"
  },
  {
   "location_code": "MAG-ACC-18",
   "item_key": "7000924#123456",
   "article_code": "7000924",
   "article_description": "LECITINA DI SOIA",
   "lot_code": "123456",
   "qty": 1,
   "tipo": "ALLERGENE_FUORI_ZONA",
   "gravita": "alta",
   "messaggio": "Contiene Soia — fuori dalla zona riservata"
  },
  {
   "location_code": "M03-CAT-03",
   "item_key": "6000006#261794",
   "article_code": "6000006",
   "article_description": "BIOSSIDO DI SILICIO (SYLOID 244)",
   "lot_code": "261794",
   "qty": 8,
   "tipo": "LOTTO_SPARSO",
   "gravita": "media",
   "messagg
```

Chiavi dell'esito: nonConformita, perUbicazione, deroghe, righe, verificabili, articoliSenzaAttributi
Righe **230** · verificabili **12** · articoli senza attributi **153** · non conformità **59** · deroghe **1**

La verifica riesce a guardare il **5%** delle righe a scaffale.


> **DIFETTO CF3** (dato) — `anagrafica articoli e Configurazione → Zone`
> La verifica di conformità copre il 5% delle righe (12 su 230): sul resto non tace perché va bene, tace perché non ha con cosa confrontare. Chi guarda la mappa vede un verde che non significa niente. Si scioglie compilando gli attributi delle zone e degli articoli — §2, voce 5.
> Prova: 153 articoli senza attributi

### La verifica, con i dati che le servono

_(la firma del modulo è diversa: righe is not iterable)_

> La prova non ha esercitato il motore: la firma di `verificaConformita` va riletta prima di poterlo interrogare da qui.


## Quanti tocchi costa ogni operazione

Un tocco = un `onclick` che fa avanzare. **Le scansioni non sono tocchi**: il lettore scrive e manda Invio, e il campo dopo prende il fuoco da solo.

| Operazione | da barra | dentro | conferma | **totale** | scorc. |
|---|---:|---:|---:|---:|---|
| Posizionamento (carico a scaffale) | 2 | 0 | 0 | **2** | `F2` (−2) |
| Trasferimento (cambio ubicazione) | 3 | 0 | 0 | **3** | `F3` (−2) |
| Inventario di vano | 2 | 1 | 1 | **4** | `F4` (−2) |
| Conta mirata di una riga | 3 | 0 | 1 | **4** | `F4` (−2) |
| DDT — evasione | 2 | 1 | 1 | **4** | `F8` (−2) |
| Unità di carico — creazione | 3 | 0 | 1 | **4** | — |
| Prelievo di produzione (carrello) | 3 | 1 | 1 | **5** | `F3` (−2) |
| Quarantena (blocco) | 2 | 2 | 1 | **5** | `F7` (−2) |
| Rilascio dalla quarantena | 2 | 2 | 1 | **5** | `F7` (−2) |
| Campionamento | 2 | 2 | 1 | **5** | — |
| DDT — registrazione | 2 | 2 | 1 | **5** | `F8` (−2) |
| Unità di carico — caricare una riga | 3 | 1 | 1 | **5** | — |
| Unità di carico — spostamento | 3 | 1 | 1 | **5** | — |
| Conto di produzione — reso | 4 | 0 | 1 | **5** | `F3` (−2) |
| Smaltimento | 3 | 2 | 1 | **6** | `F6` (−2) |
| Prelievo guidato da ODP | 3 | 2 | 1 | **6** | `F3` (−2) |
| Conto di produzione — chiusura | 4 | 0 | 2 | **6** | `F3` (−2) |

### Quello che si paga solo su un ramo

| Operazione | quando | tocchi in più |
|---|---|---:|
| Posizionamento (carico a scaffale) | dichiarare più di una misura di collo | 1 per ogni misura in più |
| Posizionamento (carico a scaffale) | accettare la proposta del motore di stoccaggio | 1 |
| Posizionamento (carico a scaffale) | scavalcare la proposta e scrivere il motivo | 2 |
| Posizionamento (carico a scaffale) | la stessa riga riscansionata entro pochi secondi | 1 |
| Smaltimento | scegliere quali colli, su misure diverse | 2 |
| Smaltimento | stampare il verbale | 1 |
| Trasferimento (cambio ubicazione) | lo stesso lotto in più ubicazioni: scegliere da quale | 1 |
| Trasferimento (cambio ubicazione) | scegliere quali colli | 2 |
| Prelievo di produzione (carrello) | ogni riga in più nel carrello | 1 |
| Prelievo di produzione (carrello) | scegliere quali colli, riga per riga | 2 |
| Prelievo di produzione (carrello) | stampare il report di prelievo | 1 |
| Prelievo guidato da ODP | ogni tappa confermata | 1 |
| Prelievo guidato da ODP | scegliere quali colli a ogni tappa | 2 |
| Prelievo guidato da ODP | una tappa non trovata | 1 |
| Prelievo guidato da ODP | chiedere il trasferimento di una tappa fuori sito | 2 |
| Quarantena (blocco) | scegliere quali colli | 2 |
| Quarantena (blocco) | stampare il cartellino di non conformità | 1 |
| Rilascio dalla quarantena | scegliere quali colli si rilasciano | 2 |
| Campionamento | stampare il verbale | 1 |
| Inventario di vano | ogni riga oltre la prima | 1 |
| Inventario di vano | ridichiarare com'è fatta una riga a colli dichiarati | 2 |
| Inventario di vano | aggiungere una riga trovata e non prevista | 2 |
| Conta mirata di una riga | ridichiarare i colli | 2 |
| DDT — registrazione | ogni riga in più sul documento | 2 |
| DDT — registrazione | scegliere quali colli, riga per riga | 2 |
| DDT — registrazione | scegliere il destinatario dalla rubrica | 1 |
| DDT — registrazione | scegliere una destinazione diversa | 1 |
| DDT — evasione | scegliere quali colli, riga per riga, se il documento non li porta | 2 |
| DDT — evasione | stampare il DDT | 1 |
| Unità di carico — caricare una riga | ogni riga in più | 1 |
| Conto di produzione — reso | scegliere quali colli tornano | 2 |

### Note

- **Posizionamento (carico a scaffale)** — È il gesto più frequente del magazzino ed è quello che costa meno: quattro campi in fila, nessun tocco.
- **Smaltimento** — Due tocchi in mezzo perché la merce si cerca e poi si sceglie: lo stesso lotto può stare in più vani.
- **Trasferimento (cambio ubicazione)** — Come il posizionamento: se la merce sta in un vano solo non serve toccare niente.
- **Prelievo di produzione (carrello)** — Il costo cresce con le righe: quindici componenti sono quindici scelte più una conferma.
- **Prelievo guidato da ODP** — Le tappe sono il grosso: dieci tappe sono dieci conferme. È il flusso dove un tocco in più si moltiplica.
- **Campionamento** — Non ha scorciatoia: si arriva solo dalla tessera.
- **Inventario di vano** — Un vano con dodici righe costa dodici tocchi più la conferma: è l'operazione che scala peggio.
- **DDT — registrazione** — Il documento si registra: la merce non esce ancora, resta prenotata.
- **DDT — evasione** — Giorni dopo la registrazione, quando arriva il vettore.
- **Unità di carico — creazione** — L'etichetta si stampa alla creazione: è la stessa conferma.
- **Unità di carico — spostamento** — Il contenitore e tutte le sue righe si spostano insieme: due tocchi per quante righe ci sono sopra.
- **Conto di produzione — chiusura** — La seconda conferma non è cortesia: da lì in poi quei colli sono finiti nel prodotto.

### Il costo su una giornata vera

| Caso | base | ripetizioni | per volta | **totale** | perché |
|---|---:|---:|---:|---:|---|
| Prelievo guidato di un ODP da 15 componenti | 6 | 15 | 1 | **21** | una conferma per tappa |
| Inventario di un vano da 12 righe | 4 | 11 | 1 | **15** | un ✓/✗ per ogni riga oltre la prima |
| DDT da 6 righe | 5 | 5 | 2 | **15** | due tocchi per riga in più |
| Carrello di produzione da 15 componenti | 5 | 14 | 1 | **19** | una scelta per riga in più |
| Posizionamento di 15 pallet in fila | 2 | 14 | 0 | **2** | l'ubicazione resta fissa: solo i campi si riscansionano |

Col lotto imballato in misure diverse — che è il caso della miscela vera — la scelta dei colli aggiunge **2 tocchi a ogni riga**: il prelievo guidato dei quindici componenti passa da 21 a **51**.


### La verifica sul sorgente

| Vista | campi con Invio | pulsanti che avanzano |
|---|---:|---:|
| posiziona.ts | 4 | 16 |
| smaltimento.ts | 5 | 4 |
| prelievo.ts | 7 | 11 |
| percorso.ts | 5 | 21 |
| quarantena.ts | 8 | 6 |
| campionamento.ts | 1 | 2 |
| inventario.ts | 9 | 24 |
| spedizioni.ts | 3 | 13 |
| udc.ts | 2 | 12 |
| wip.ts | 1 | 17 |
