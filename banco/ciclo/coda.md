# La coda del ciclo 2.0

Questo file è lo stato del loop, e serve a una cosa sola: **un giro non
riprova quello che il giro prima ha già provato.** Senza, il loop gira a
vuoto sul primo pezzo di copertura e non arriva mai agli altri.

Come si lavora qui:

1. Si esegue `node banco/ciclo/cancello.cjs`.
2. **Se un passo è rotto, si corregge quello e basta** — non si allarga la
   copertura nello stesso giro. Un difetto trovato mentre se ne introduce
   un altro non si sa da dove venga.
3. Se è tutto verde, si prende **la prima voce non spuntata** qui sotto, si
   scrive la sua prova al banco, e si rilancia il cancello. Quello che salta
   fuori si corregge nel giro dopo.
4. Si spunta la voce e si scrive di fianco cosa ha trovato — anche «niente»,
   che è un'informazione: significa che quel pezzo regge.

Il loop si ferma quando **un giro intero aggiunge copertura e non trova
niente di nuovo.**

**Su un clone pulito manca la ricetta**, e non e' una dimenticanza: quindici
componenti con le quantita' esatte e i lotti fornitore sono la formulazione di
un prodotto, cioe' il genere di dato che il `.gitignore` tiene fuori insieme
ai movimenti e alle sigle. Si rifa' in un comando dall'ODP che sta in
`ARCHIVIO/BACKUP E FILE DI TEST/`:

```bash
node banco/ciclo/rifai-ricetta.cjs
```

Restano fuori per la stessa ragione `verbale.md`, `difetti.json` ed
`esito.json`: sono il referto di un giro, e portano lotti, ubicazioni e sigle
veri. Si riscrivono al primo `cancello.cjs`.

---

## Fatto

- [x] **Carico → prelievo → WIP → reso → chiusura**, quattro ordini dall'ODP
      vero. Trovati: `W5` (riga a colli dichiarati scaricata a numero — la
      radice), `W1` (reso senza UM), `W2` (chiusura senza UM del consumo),
      i colli del conto contati col calo dello scaffale, `W4`/`Q1` come
      conseguenza. Tutti corretti; il ciclo quadra a 0 KG.
- [x] **UDC** — creazione, carico, spostamento in transazione, chiusura
      automatica, codice interno e SSCC con la cifra di controllo. Trovati:
      la merce risultava in **due vani** dopo `moveUdc` (aliasing sulla
      cache), e un'unità svuotata **prelevandone** l'ultima riga non si
      chiudeva mai. Corretti.
- [x] **Quarantena** (blocco parziale) — niente.
- [x] **Campionamento** (i colli non calano, il collo non si svuota) — niente.
- [x] **Conta e rettifica** su riga a colli dichiarati — niente.
- [x] **DDT** — il documento prenota e non toglie, l'evasione ritrova i colli
      per misura — niente.
- [x] **Spostamento** e **smaltimento** parziale — niente.
- [x] **Attività** — residuo sui parziali, chiusura automatica, nessuna
      transizione da uno stato chiuso, annullamento col motivo — niente.
- [x] **Motore di stoccaggio** — 274 ubicazioni in 3 ms, ogni proposta col
      perché, ogni escluso col motivo — niente.
- [x] **FEFO** — niente.
- [x] **KPI** su articoli, movimenti e persone, sul magazzino vero.

## Da fare, in quest'ordine

- [x] **Percorso di prelievo da ODP** — `banco/ciclo/percorso.test.js`, sul
      file vero. Il parser regge: le quindici quantità e i quindici lotti
      escono giusti, la colonna del lotto si salta davvero, nessuna riga
      assurda. Trovato **un difetto**: la regola «il giro parte dal magazzino
      con più prelievi» stava in `sitoDiCasa` ma la usava solo l'avviso
      «articolo in un altro magazzino» — l'ORDINE DELLE TAPPE lo dava ancora
      il solo ordine di visita, e sull'ODP vero la prima tappa era in `MAG`
      per una riga sola mentre le tredici di `M03` venivano dopo. Adesso
      `build` e `riordina` mettono casa davanti e lasciano il resto
      nell'ordine di visita. Provato: `M03 → MAG → MAG1`.
      Osservato e non corretto: sommando i quindici lotti vengono 380,256 KG
      contro i 380,25 della testata — sei grammi di arrotondamento di Sage,
      non dell'applicativo.
      Osservato e non corretto: la scelta fra due ubicazioni che hanno lo
      stesso lotto usa l'ordine di visita e non preferisce casa, perché gira
      prima che le tappe esistano. Se ne accorge chi legge l'avviso.

- [x] **Inventario di vano e ramo «Per articolo» (1.9)** —
      `banco/ciclo/inventario.test.js`. **Niente.** Tre righe rettificate in
      fila nello stesso vano — un collo più leggero, uno trovato in più, una
      riga dichiarata assente — e tutte e tre lasciano dietro il numero
      giusto; la riga dichiarata vuota sparisce davvero. KG e PZ restano due
      totali (67,5 KG · 94.400 PZ), la coda di conte raggruppa per lotto e
      mette davanti chi scade prima.
      Da sapere per chi scrive prove qui: **rovesciare la selezione non prova
      che la coda si riordini** — al primo giro il rovescio coincideva con la
      coda giusta e la prova passava per caso. Si spunta in ordine di
      ubicazione, che è l'ordine che il raggruppamento per lotto rompe.
- [x] **Lo storno** — `banco/ciclo/storno.test.js`. **Due difetti.**
      (a) Stornando un prelievo che aveva APERTO un collo, il totale tornava
      e l'elenco no: da `[25,25,6]` si prendevano 10 KG e lo storno lasciava
      `[15,25,6,10]` — quattro colli dove lo scaffale ne ha tre, e a
      scoprirlo sarebbe andato chi conta. Adesso l'azione di annullamento
      porta `packs_prima` e lo storno RIDICHIARA la riga com'era, traducendo
      la differenza con `rettifica` — la stessa strada dell'inventario e
      della conta. Provato: torna `[25,25,6]`.
      (b) Due maschere su quattro scrivevano un'azione incompleta:
      `prelievo.ts` senza `packs` e con `qty` presa dal calo dello scaffale,
      `percorso.ts` senza `packs` **e senza `qty_uom`** — stornare una tappa
      del prelievo guidato rimetteva colli pieni. Adesso tutte e quattro
      scrivono gli stessi campi, e c'è una prova che legge il sorgente e lo
      controlla. Quello che già funzionava: i colli si ritrovano per misura,
      e se uno non c'è più lo storno si ferma e dice quale.
- [x] **Export e import del pacchetto** — `banco/ciclo/pacchetto.test.js`.
      **Niente.** Le dieci collezioni contate escono con gli stessi numeri
      della cache, `_format` resta `warehouse-mapper-v1.5` mentre
      `_appVersion` e' salito a 2.0, cinque pacchetti rotti su cinque
      vengono rifiutati e ognuno dice cosa manca, e il giro export -> import
      in `overwrite` riporta 194 righe, 3.503.003 colli e 98.341 UM: nessuna
      riga si sdoppia.
- [x] **Conformità e mappa** — `banco/ciclo/conformita.test.js`. **Niente di
      codice**, e un numero che mancava. Il motore distingue gia' l'ignoto —
      l'esito porta `verificabili` e `articoliSenzaAttributi` accanto a
      `nonConformita` — e sui dodici casi che riesce a guardare trova tre non
      conformita' vere (LECITINA DI SOIA fuori zona in due vani, una
      temperatura) e una deroga. Il numero e' questo: **la verifica copre il
      6% delle righe** (12 su 194). Sul restante 94% non tace perche' va
      bene, tace perche' non ha con cosa confrontare — 1 zona su 14 porta la
      classe di conservazione, 1 su 152 gli articoli a giacenza portano gli
      allergeni. Chi guarda la mappa vede un verde che non significa niente.
      Si scioglie compilando gli attributi (§2, voci 5 e 6).
- [ ] **Destinatari e archivio documenti.** Chi è lo stesso destinatario, e
      la ristampa che parte dallo snapshot invece di ricostruire.
- [~] **Il terminale a 480 px, nel browser** — fatto per meta', e la meta'
      che manca non e' un difetto: e' il PIN.
      Provato servendo **il pacchetto 2.0 vero** dalla 4199 (non `npm run
      dev`: i byte che si installano). L'indice si carica **senza un errore
      in console**, il titolo dice «Pathfinder 2.0», e la voce **Attivita' e'
      in barra senza interruttore** — la rimozione ha attecchito fino
      all'HTML. A 480 px: **nessun trabocco in orizzontale**, `--spacing` a
      `.1rem`, e il body prende `dispositivo-terminale dispositivo-android`.
      Il gancio del ridimensionamento e' attaccato e funziona: provato
      mandando un `resize` vero, la classe passa da terminale a scrivania e
      torna indietro. (La prima lettura diceva il contrario ed era
      l'emulazione che non emetteva l'evento — verificato prima di
      scriverlo.)
      **Tredici pulsanti sotto i 44 px**, e sono tutti telaio: ⚙ 30, 🖨 28,
      ✕ 32, le tessere degli operatori 32, «Non salvato» 17. Le maschere
      operative — quelle dove il bersaglio del dito conta davvero — non sono
      state misurate perche' **pretendono un operatore identificato, e il PIN
      lo digita Andrea**. E' l'ultimo passo, e non lo puo' fare un agente.
- [ ] **Le maschere che pretendono l'identita', col PIN** — smaltimento,
      trasferimento, prelievo, quarantena, conta, DDT, reso e chiusura del
      conto. Un minuto a maschera, e sono l'unica cosa che il banco non ha
      esercitato.
- [x] **I GESTI PER OGNI OPERAZIONE — chiesto da Andrea** —
      `banco/ciclo/gesti.test.js`. Diciassette operazioni contate, dai due
      tocchi del posizionamento ai sei dello smaltimento e della chiusura del
      conto. Il conto sta nel verbale; le prove controllano che il sorgente
      regga ancora i numeri — se qualcuno spezza la catena degli Invii sul
      posizionamento, la prova lo dice. Quello che salta all'occhio: le
      operazioni che si ripetono a ogni riga (prelievo guidato, inventario di
      vano, DDT) costano 15-21 tocchi su un giro vero, e con i lotti a misure
      diverse il prelievo guidato dei quindici componenti arriva a 51.

- [x] ~~conteggio dei gesti~~ — fatto, vedi sopra. Voce originale: Quanti tocchi
      servono a portare a termine ognuna delle operazioni, dall'apertura
      della voce in barra alla conferma: posizionamento, prelievo di
      produzione, prelievo guidato da ODP, trasferimento, smaltimento,
      quarantena e rilascio, campionamento, conta, inventario di vano, DDT
      (registrazione ed evasione), unità di carico, reso e chiusura del conto
      WIP. Si contano dal sorgente delle viste — ogni `onclick` che avanza il
      flusso è un tocco — separando i tocchi OBBLIGATORI da quelli che
      capitano solo su un ramo (scelta dei colli, scavalco del motore,
      conferma di un Dialog). Le scansioni non sono tocchi: il lettore scrive
      e manda Invio. Serve a vedere dove il gesto centrale costa più di
      quanto dovrebbe, con i guanti e su una striscia di vetro da 480 px.
