# REP-AUDIT-003 — Audit di Pathfinder 2.34.0

**Data** 08/09/2026 · **Macchina** quella di sviluppo · **Oggetto** il lavoro
concordato l'08/09: la coda delle attività diventa il posto da cui nasce il
prelievo, e il DDT fa nascere il lavoro invece di finirlo.

Documento di sessione. La traccia viva del progetto resta `INDEX.md`.

---

## 1. Da dove si è partiti

Tredici decisioni prese con Andrea prima di scrivere una riga, in tre giri di
domande. Le quattro che hanno deciso l'impianto:

| Decisione | Conseguenza |
|---|---|
| **Una sessione di prelievo per attività presa in carico** | `pick_session` smette di essere un record solo. Senza questo, due operatori non possono prelevare insieme, e tutto il resto del disegno non sta in piedi |
| **La preparazione chiude su imballo ed etichetta**, non a fine percorso | `PREP_SHIP` chiude al gesto e non a residuo |
| **Sull'etichetta dell'UDC entra solo il contenuto** | La regola «un'etichetta porta solo quello che non invecchia» resta in piedi |
| **Il servizio tiene l'xls**, il compito ne porta il riferimento | Due rotte nuove, e un posto nuovo dove finiscono byte da conservare |

Prima di scrivere, quattro analisi in parallelo hanno fotografato l'esistente:
schedulatore, spedizioni, unità di carico, mappa e percorso. È da lì che è
uscito il vincolo che ha deciso l'ordine del lavoro — `pick_session` una sola
per tutto l'impianto — e tre difetti latenti che il codice portava senza che
nessuno li avesse visti.

---

## 2. Che cosa è stato costruito, in cinque tappe

### 2.30 — le fondamenta

**Le sessioni di prelievo non sono più una sola.** `startPickSession` faceva
`clear` e poi `put`: avviare un percorso chiudeva quello di chiunque altro, in
silenzio. Reggeva finché il prelievo nasceva da un file caricato a mano da una
persona sola. Adesso `pick_session` è un elenco, e a dire quale sia «la mia» è
`modules/sessioni.ts`, che è puro.

Scrivendolo è emersa una distinzione che prima non serviva: **`operator` è chi
preleva, `owner` è chi ha aperto**. Il campo dell'operatore è modificabile — un
Team Leader può intestare un giro a un altro, e quella sigla va sulle righe di
registro. Cercando la propria sessione per `operator`, chi l'ha aperta non la
ritrovava più dopo un ricaricamento.

**`pack_zone`**, la zona di imballaggio: una per sito, obbligatoria.
`sitiSenzaImballo` dice **quale** sito è scoperto, non che ne manca uno.

**La quarantena non aspetta il suo turno**: sempre massima urgenza, calcolata e
non scritta — scrivere `priority: 4` alla creazione farebbe dire a quel compito,
fra un mese, un'urgenza che nessuno ha chiesto.

### 2.31 — preparazione spedizioni

Il verso si è rovesciato. L'impiegato registra il DDT, e da quel gesto nasce
l'attività.

**Una tappa di preparazione SPOSTA, non scarica.** Non è una variante di comodo
di `commitPickStop`: discende da due regole che c'erano già. Un DDT pendente
prenota la merce; a scaricarla è l'evasione. Scaricare anche al prelievo
vorrebbe dire scaricarla due volte, e la seconda troverebbe il vano vuoto.

**Una tappa di unità di carico si conferma con una scansione sola.** Su un
pallet imballato articolo e lotto stanno sotto il cellophane: chiederli
vorrebbe dire chiedere di aprire l'imballo per confermare di non doverlo aprire.

`PREP_SHIP` sostituisce `PICK_SHIP` e `PICK_RET`: la maschera è sempre stata la
stessa, e a distinguerli è sempre stata la causale del documento. I due vecchi
restano **dichiarati** perché l'archivio li porta.

### 2.32 — prelievo ODP come attività

La distinta si allega alla richiesta e vive sul servizio. Due rotte nuove, con
le difese scritte accanto al perché: l'identificativo lo fa il servizio, il
controllo si rifà in lettura, un `.xlsx` deve cominciare per `PK`, e la rotta è
dichiarata fra quelle che ricevono corpi grandi.

### 2.33 — l'unità di carico diventa contestuale

**L'etichetta del bancale dichiarava il falso.** Il pallet nasceva senza
ubicazione e senza merce — le righe entravano dopo — quindi `riepiloga` leggeva
zero partite e l'etichetta stampava letteralmente **«LOTTI MULTIPLI — 0
partite»** su un pallet che ne portava una sola. Un'etichetta vuota si vede; una
che dichiara il contrario del vero no.

Adesso il bancale nasce **dentro la zona di imballaggio**, con la merce sopra, e
l'etichetta esce completa. L'ubicazione resta fuori dall'etichetta: quel che
mancava non era il vano.

La tessera «Unità di carico» esce da Movimenta e l'elenco entra in Archivio.
Un'unità non è un'operazione di magazzino: è il modo in cui la merce viaggia, e
nasce sempre dentro un altro lavoro.

### 2.34 — calendario e mappa

Il calendario delle spedizioni è una voce della barra, e sta sulla data di
ritiro previsto — lo stesso dato su cui il cruscotto calcola i suoi avvisi. I
colori sono quelli: un giorno che lì è «in ritardo» non può essere verde qui.

L'evidenziazione della cella selezionata era un bordo di due pixel, e in una
griglia dove ogni cella ha già un bordo colorato dal suo stato si perdeva.

---

## 3. I difetti trovati lungo la strada

Sei, e **nessuno è uscito dal rileggere il codice a tavolino**.

| # | Difetto | Come è saltato fuori |
|---|---|---|
| 1 | **`_flashLocation` aggiunge `loc-cell--flash`, e quella classe non era definita da nessuna parte.** Il richiamo visivo di «Vedi in mappa» non è mai esistito: restava il solo `scrollIntoView`. Ha attraversato ventiquattro versioni | Analisi della mappa |
| 2 | **`OPERAZIONE.TRANSFER` dichiara `modo: 'move'`, che non è un `ModoMovimenta`.** `forms['move']` è `undefined`, e a salvare la maschera è solo la riga dopo | Analisi dello schedulatore |
| 3 | **Il record del documento scrive `causale_label` dalla 1.8, ma il tipo dichiarava solo `causale`** — un campo che nessuno valorizza. Leggerlo dava sempre stringa vuota, e la vuota aveva l'aria di «causale non impostata» | Guardando il payload a video |
| 4 | **La prima preparazione ha scritto DUE movimenti invece di uno**: il trasferimento giusto, e un ingresso nel vano di lavorazione. Il codice non poteva saperlo — `session.odp_num` porta il numero del DDT, che è vero e non nullo, e fino alla 2.30 «c'è un numero d'ordine» voleva dire «c'è un conto di produzione» | Guardando il registro a video |
| 5 | **L'etichetta del bancale PF stampava «LOTTI MULTIPLI — 0 partite»** su un pallet a una partita | Analisi dell'unità di carico |
| 6 | **`Udc.status: 'closed'` è dichiarato e non viene scritto da nessuna parte**; `closed_at` nasce `null` e non si aggiorna mai | Analisi dell'unità di carico |

I primi cinque sono corretti. Il sesto resta aperto: togliere uno stato
dichiarato è una decisione sui dati, e va guardata con l'elenco delle unità
davanti.

---

## 4. Le prove

| | prima | dopo |
|---|---|---|
| client | 1.464 in 56 file | **1.652 in 63 file** |
| servizio | 156 | **171** |
| gerarchia · etichette · installazione · schema | 40 · 100 · 43 · 8 | invariate, tutte verdi |

**Ogni famiglia nuova è stata verificata rimettendo il difetto.** Le più
importanti:

- `sessioni.test.js` — sei rosse rimettendo il difetto, su nove modi diversi di
  far restituire la sessione sbagliata.
- `preparazione.test.js` — cinque rosse sul raggruppamento delle unità e sulle
  UM che mancano; quattro sulla richiesta.
- `calendario.test.js` — sei rosse su fuso orario, mesi che cominciano di
  domenica, cambio d'ora, passaggio d'anno.
- **La prova sul percorso degli allegati punta a un file che c'è davvero.** Gli
  allegati stanno in `<cartella del database>/allegati`: un `../` di troppo
  arriva al database. Chiedere qualcosa-che-non-esiste avrebbe dato 404 anche
  senza nessun controllo. Togliendo il controllo, la prova dice
  **«HA SERVITO IL DATABASE»**.

---

## 5. Che cosa è stato provato a video

- registrazione di un DDT e nascita dell'attività, con scadenza dalla data di
  ritiro e conto di quel che c'è da prendere;
- presa in carico, percorso costruito dal documento, sessione che porta compito
  e documento;
- conferma di una tappa: **un solo movimento `MOVE`**, la giacenza che si sposta
  da `M03-DET-01` a `MAG-ACC-12` e non sparisce, e la riga del DDT che punta al
  vano nuovo;
- il calendario di settembre: 35 caselle, settimana da lunedì, oggi marcato, sei
  giorni con spedizioni colorati come il cruscotto;
- la cella selezionata in mappa, con il pannello di dettaglio aperto.

**Non provato, e va detto:** la corsia vera con un operatore e i guanti; il giro
di preparazione con un pallet vero da scansionare; il prelievo ODP preso in
carico con un allegato vero; la Zebra; il camion.

---

## 6. Quel che resta aperto

| # | Cosa |
|---|---|
| **98** | `(location_code, item_key)` è un indice e non un vincolo di unicità. Prima di renderlo unico vanno contati i doppioni sul magazzino vero |
| **99** | «Prelievo ordini» resta senza scorciatoia; F8 non è annunciata da nessuna scheda |
| **100** | Il `301` in chiaro della 2.26 non ha un banco che apra un socket cifrato |
| **101** | `OPERAZIONE.TRANSFER.modo` vale `'move'`, che non è un modo di `startMov`: funziona per una coincidenza, non per disegno |
| **102** | `Udc.status: 'closed'` dichiarato e mai scritto; `closed_at` sempre `null` |
| **103** | Il prelievo ODP preso in carico non è mai stato provato con un allegato vero |

---

## 7. Consegna

**Pacchetto** `consegna\Pathfinder 2.34.0\`
impronta `70dbb6f1b0d48b0ea3603086663b3058d2d49866ecf3551a8eed16935737ecdb`,
8 file, 2,10 MB.

**Non installato.** Su `C:\Pathfinder\` gira la 2.29.2: l'installazione si
propone e si aspetta il via.

**Prima di installare in magazzino serve una configurazione**: la zona di
imballaggio va marcata in Configurazione → Siti e Zone, una per sito. Senza,
una preparazione di spedizione non ha dove finire, e il prodotto finito torna
al giro in due tempi con l'etichetta da ristampare.
