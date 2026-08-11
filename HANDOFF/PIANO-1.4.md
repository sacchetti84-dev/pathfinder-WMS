# PIANO — Pathfinder 1.4

**Cinque funzioni nuove su un magazzino che sta già lavorando**
Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 11/08/2026 · Rev. 02 · **Scadenza del progetto: 31/12/2026**
Ultima installazione utile in magazzino: **19/12/2026** — poi c'è l'inventario

> Qui dentro si cita più volte «§x dell'HANDOFF 1.0 / 1.2 / 1.3». Quei documenti
> sono in **`ARCHIVIO/HANDOFF STORICI/`**: le citazioni restano valide, ma ciò che
> era ancora vivo è già stato assorbito
> nell'[HANDOFF 1.4](HANDOFF-pathfinder-1.4.md).

---

## 0. In tre righe

Cinque richieste: **motore di stoccaggio**, **UDC**, **schedulatore di attività**,
**WIP**, **unità di misura**. Sono legate fra loro più di quanto sembri, e l'ordine
in cui sono venute in mente non è l'ordine in cui si costruiscono.

**Tutte e cinque entrano entro il 19/12**, con `store.js` in TypeScript dentro la
prima consegna (D1 e D3, §8). Il calendario è pieno al centimetro — 18,5 settimane di
lavoro su 18,5 disponibili — quindi la §6 porta con sé una verifica al 31 ottobre e
una scala, già decisa, di cosa si toglie se quella verifica va male.

Prima di tutto, però, c'è un difetto verificato che ferma il servizio all'avvio.

---

## 1. Il blocco che viene prima di tutto

Il servizio crea le tabelle con `CREATE TABLE IF NOT EXISTS`. Su un database
**nuovo** funziona. Su un database **che esiste già** — cioè quello del magazzino —
non aggiunge le colonne nuove: la tabella c'è, e la crea-se-non-c'è non fa niente.

Poi arriva `CREATE INDEX` sulla colonna che non è stata aggiunta.

L'ho provato, non dedotto. Aggiunto `udc_id` fra i campi indicizzati di `inventory`,
riaperto un database creato con lo schema di prima:

```
1. base creata, inventory = 1
   colonne: _id, location_code, item_key, article_code, lot_code, data
2. riaperto con lo schema 1.4
SqliteError: no such column: udc_id
    at new PathfinderDB (server/lib/db.js:18)
```

Non è una query che sbaglia: è il **costruttore**. Il servizio non parte. I terminali
vedono bianco, e il magazzino si ferma finché qualcuno non capisce perché.

L'UDC ha bisogno di `inventory.udc_id` indicizzato. Quindi questo difetto sta fra
noi e la 1.4, e va tolto per primo.

**Rimedio** — in `PathfinderDB`, prima degli indici: leggere `PRAGMA table_info`,
confrontare con `COLLECTIONS[nome].indexed`, emettere un `ALTER TABLE ADD COLUMN` per
ciò che manca, e ripopolare la colonna dal JSON in `data` (che il dato ce l'ha già:
è lì che vive tutto ciò che non è indicizzato). Poi gli indici. Una trentina di
righe.

**Il prototipo e il collaudo esistono già**, scritti prima del codice come vuole la
§5.1 dell'HANDOFF 1.3: `server/test/collaudo-migrazione-1.4.js`, che si lancia da
solo e non entra nella suite finché la migrazione non è nel prodotto.

```
node test/collaudo-migrazione-1.4.js
```

Otto prove su un magazzino finto di 192 righe e 2.496 colli — vedi §5bis per cosa
dimostrano.

> **Una collezione nuova invece va già bene.** `CREATE TABLE IF NOT EXISTS` la crea
> al primo avvio, senza che nessuno faccia niente. È solo l'aggiunta di una colonna
> **indicizzata a una tabella che esiste** a essere rotta.

---

## 2. Le cinque richieste, riordinate

Le hai elencate in un ordine; se ne costruiscono in un altro, e vale la pena dire
perché — la differenza non è di gusto.

| Ordine tuo | Ordine di costruzione | Perché si muove |
|---|---|---|
| 1. Motore di stoccaggio | **3°** | È quello che si vede di più ed è terzo: per decidere *dove* mettere una cosa, deve prima esistere *cosa* si sta mettendo (UM) e *dentro cosa* (UDC) |
| 2. UDC | **2°** | Cambia l'indirizzo della merce: oggi sta in un'ubicazione, domani sta in una UDC che sta in un'ubicazione. Un livello di indirezione sotto tutto l'inventario |
| 3. Schedulatore | **1°** | È il più **indipendente** dei cinque, e le attività che deve tracciare esistono già oggi. Non aspetta nessuno, e rende subito |
| 4. WIP | **5°** | Dipende da UM (torna indietro un parziale), da UDC (dove lo rimetti) e dal motore (che lo decide). È l'unico che dipende da tutti |
| 5. Unità di misura | **1° a pari merito** | È la più profonda: cambia il **significato di `qty`**, cioè di ogni quantità già scritta nel database. Tutto ciò che sposta merce, dopo, deve saperlo |

Sequenza: **schedulatore → unità di misura → UDC → motore → WIP**.

E prima di tutti, una fase zero che non si vede.

---

## 3. Fase 0 — Le fondamenta, invisibili

La cosa più pericolosa di questo piano non è scrivere le cinque funzioni: è
**muovere lo schema cinque volte su un magazzino che lavora**. Cinque rilasci, cinque
occasioni di fermare il servizio in un mattino qualsiasi.

Quindi lo schema si muove **una volta sola, adesso, mentre non serve a nessuno**:

- il rimedio della §1 — `ALTER TABLE` e ripopolamento, col suo collaudo;
- `inventory.udc_id` indicizzato, **vuoto**;
- le collezioni nuove — `lots`, `udc`, `tasks`, `wip` — **vuote**;
- `types/collezioni.ts` aggiornato: è la sorgente unica, e il `satisfies` costringe
  entrambi gli adapter e il servizio ad allinearsi o non compilare;
- Dexie `version(8)` con le stesse aggiunte, sul ramo locale;
- i campi nuovi dell'anagrafica articoli, tutti facoltativi;
- l'elenco delle collezioni di export/import letto da `COLLEZIONI` invece che scritto
  a mano in tre posti — §5bis;
- gli interruttori: `feature.tasks`, `feature.uom`, `feature.udc`, `feature.putaway`,
  `feature.wip` in `meta`, **tutti spenti**.

**Criterio di riuscita: si installa in magazzino e non cambia assolutamente niente.**
Nessuna schermata diversa, nessun campo nuovo a video. È un rilascio che non fa
nulla, ed è il motivo per cui è sicuro farlo.

Da lì in poi ogni funzione è **codice che accende un interruttore**, non uno schema
che si muove. Si accende una funzione, un turno, e se va male si spegne — senza
disinstallare niente e senza toccare il database.

### Le due cose da fare qui e non dopo

**`core/store.js` in TypeScript — deciso, entra in Fase 0** (Andrea, 11/08). Sono
1.974 righe, ed è il file che tutte e cinque le funzioni devono modificare.
Convertirlo prima costa una settimana e mezza; convertirlo dopo significa convertire
anche quello che ci avremo aggiunto. Era l'aperto #4 dell'INDEX: qui smette di essere
un miglioramento e diventa il modo di non perdere ore sul campo.

> **Come si converte, e come non si converte.** Vale la regola della §7
> dell'HANDOFF 1.3: `store.js` e `app.js` **non nello stesso commit**, e `app.js`
> non si tocca affatto. La conversione si fa a blocchi — cache e `_applyToCache`
> per primi, perché sono ciò su cui poggiano le quattro collezioni nuove — con
> build e collaudo in mezzo a ognuno. E **spariscono i due ponti** verso Store in
> cima a `pickRoute.ts` e `vault.ts`: erano lì proprio in attesa di questo.

**I collaudi su `Store._applyToCache`.** È il punto dove ogni scrittura entra nella
cache: quattordici collezioni oggi, **diciotto** dopo la 1.4, e nessuna prova.
È l'aperto #6, e con quattro collezioni in arrivo non è più rimandabile.

La buona notizia è che `_applyToCache` è già scritto bene: lavora per **forma**
(`list`, `map`, `set`, `single`, `kv`), non per nome. Una collezione nuova si
dichiara, non si programma.

---

## 4. Le cinque, una per una

### 4.1 — Schedulatore di attività · 1.4.1

**Cosa.** Un operatore chiede un'attività — trasferimento fra magazzini, prelievo per
spedizione o reso, blocco di quarantena, campionamento, smaltimento — e la richiesta
diventa un compito con una priorità, una coda e dei tempi.

**Perché è il primo.** Tutte queste attività **l'applicativo già le sa fare**. Lo
schedulatore non aggiunge operazioni: aggiunge la *richiesta*, la *coda* e la
*misura*. È l'unico dei cinque che rende senza aspettare gli altri quattro.

**Modello.** Una collezione `tasks`:

| Campo | Nota |
|---|---|
| `task_id` | chiave testuale |
| `type` | `TRANSFER` · `PICK_SHIP` · `PICK_RET` · `QUARANTINE` · `SAMPLING` · `DISPOSAL` · `PUTAWAY` · `COUNT` |
| `priority` | 1-4. La alza solo un Team Leader, altrimenti è urgente tutto |
| `status` | `requested` → `assigned` → `in_progress` → `done` / `cancelled` |
| `requested_by` · `requested_at` | chi e quando |
| `assigned_to` · `started_at` · `completed_at` | chi la fa, e i due istanti che servono |
| `due_at` | scadenza, facoltativa |
| `payload` | articolo, lotto, quantità, da dove, a dove — JSON, come tutto il resto |
| `source_ref` | il documento o l'ODP che l'ha generata |

Da `requested_at → started_at → completed_at` escono le due misure che il
responsabile userà davvero: **quanto sta in coda** e **quanto dura**. Non serve altro
per cominciare.

**Regali dall'architettura.** Il feed SSE `/api/events` esiste già: un compito nuovo
che compare sul terminale di un altro operatore è plumbing che c'è. E il campionamento
— l'unica attività dell'elenco che oggi *non* esiste — nasce qui: quantità prelevata,
per chi, campione di riserva.

**Trappola.** Uno schedulatore che nessuno chiude è una lista che invecchia. Serve un
riepilogo delle attività aperte in cruscotto dal primo giorno, non nella versione dopo.

---

### 4.2 — Unità di misura · 1.4.2

**Cosa.** PZ, MT, LT, KG, GR accanto ai colli. Al primo posizionamento di ogni
articolo/lotto il sistema calcola la suddivisione UM-per-collo, e segnala e quantifica
il collo incompleto.

**Metà del lavoro è già in casa.** `Articolo.pieces_per_pack` esiste dalla v3.0.0 —
serve a compilare i pezzi del DDT — ed è **l'aperto §7.6 dell'HANDOFF 1.0**: mai
popolato. Quel campo è già la UM-per-collo. Non se ne inventa un secondo: si finisce
quello, e gli si mette accanto l'unità.

| Dove | Campo | Nota |
|---|---|---|
| `articles` | `uom` | `PZ`\|`MT`\|`LT`\|`KG`\|`GR`. **Assente = gestione a soli colli**, cioè oggi |
| `articles` | `uom_per_collo` | legge `pieces_per_pack` se manca — una sorgente sola, con un ripiego |
| `lots` *(nuova)* | `article_code` · `lot_code` · `uom` · `uom_per_collo` · `frozen_at` | la configurazione **congelata al primo posizionamento** |
| `inventory` | `qty_uom` | UM totali nella riga, accanto a `qty` che resta i colli |
| `mov_log` | `qty_uom_delta` · `uom` | assenti sui movimenti storici, come già `qty_delta` |

**Perché `lots` è una collezione e non un campo.** La confezione è un fatto del
lotto, non della riga di giacenza: deve sopravvivere quando l'ultimo collo di quel
lotto esce dal magazzino e tre settimane dopo ne rientra uno. È anche il posto
naturale dove il WIP terrà i suoi conti, dopo.

**La decisione di disegno che conta: il collo incompleto non è una riga sua.**

Il tuo esempio: 10.100 pz, 1.000 per collo → 10 colli pieni + 1 da 100.

Sarebbe naturale scrivere due righe di giacenza. **Non si fa**, e la ragione è
concreta: `inventory` ha l'indice composto `[location_code+item_key]`, e tutto lo
`Store` è scritto sopra l'idea che quella coppia identifichi una riga. Due righe
sulla stessa ubicazione per lo stesso articolo/lotto è la strada più corta per un
saldo sbagliato ma plausibile — che è precisamente la cosa peggiore che possa
succedere a un magazzino, e che `_assertPositiveInt` esiste apposta per evitare.

Una riga: `qty: 11`, `qty_uom: 10100`. Il resto si **calcola**:
`10100 − 10 × 1000 = 100`. A video si mostra «10 × 1.000 + 1 × 100», in etichetta
pure, e nel database resta un'invariante sola da difendere invece di due.

**Retrocompatibilità.** Un articolo senza `uom` si comporta come oggi, in tutto.
Un lotto già a magazzino non ha `lots`: al primo movimento della 1.4.2 il record
nasce, con i colli che ci sono e l'UM presa dall'anagrafica se c'è. Nessuna riga
viene riscritta all'installazione.

---

### 4.3 — UDC · 1.4.3

**Cosa.** Un contenitore — pallet, cassone, carrello — che tiene items e sta in
un'ubicazione. Si sposta la UDC, e la merce le va dietro.

**Modello.** Collezione `udc`: `udc_id`, `type`, `location_code`, `site_id`,
`status` (`open` · `closed` · `shipped` · `empty`), `created_at`, `closed_at`,
`operator`. E `inventory.udc_id` facoltativo: **assente = merce direttamente in
ubicazione**, cioè il comportamento di oggi, per sempre.

**L'invariante da difendere.** Se una riga ha `udc_id`, il suo `location_code` deve
essere quello della UDC. Due scrittori e i due valori divergono in un pomeriggio.

Non si risolve con la disciplina: si risolve con **una operazione composta sul
servizio**, `POST /api/op/moveUdc`, che dentro **una** transazione SQLite aggiorna la
UDC e tutte le sue righe. È lo schema che il codice usa già per
`/api/op/commitPickStop` e `/api/op/removeItem`, e che i 29 collaudi del servizio
provano sotto contesa fra due terminali. Qui va riusato tale e quale.

**Il guadagno operativo, e il collaudo che lo misura.** Spostare un pallet da 24
colli oggi sono 24 gesti; con la UDC è **uno**. Il collaudo di accettazione è
esattamente quello: una UDC con dentro merce di tre articoli diversi si sposta con
una scansione, e i tre saldi seguono.

**Etichette.** Una UDC senza etichetta non è una UDC. Lo strumento c'è già —
`ARCHIVIO/stampa etichette/` — e va ripreso dentro il prodotto. Sullo standard:
l'SSCC è il codice giusto, ma richiede il **prefisso aziendale GS1**, che è una cosa
da chiedere fuori come la partita IVA e il certificato. Proposta: codice interno
adesso, campo `sscc` predisposto e vuoto, migrazione quando il prefisso arriva.

---

### 4.4 — Motore logico di stoccaggio · 1.4.4

**Cosa.** Riceve uno o più articoli/lotti da posizionare e propone l'ubicazione — o
la UDC — migliore, con le condizioni che il magazzino si è dato.

**È la funzione con il rapporto migliore fra valore e rischio**, e la ragione è la
sua forma: come `pickRoute.ts`, è una **funzione pura** sullo stato. Entra lo stato,
esce una proposta. Si collauda per intero senza aprire il browser, come la serpentina
e il parser ODP, e si può provare rompendola — il metodo della §4.1 dell'HANDOFF 1.2.

**Due meccanismi, e qui sta la decisione che vale di più.**

I tuoi quattro esempi non sono la stessa cosa:

| Esempio | Cos'è davvero |
|---|---|
| «gli allergeni nella zona allergeni» | un **attributo dell'articolo** contro un attributo della zona |
| «bassa temperatura in refrigerata» | idem |
| «articoli simili vicini» | una **preferenza**, non un obbligo |
| «tutti i 700 in magazzino 2» | una **politica aziendale**, che cambia senza che l'articolo cambi |

Il quarto non è un campo dell'anagrafica. Se lo diventa, la prossima volta che il
magazzino 2 si riempie bisogna rilasciare una versione. Quindi:

**Attributi** sull'articolo, facoltativi: `allergens: string[]`, `temp_class`
(`ambient` · `chilled` · `frozen`), `stackable`, `weight_kg`. E sulla zona —
`Zona` ha già `[config: string]: unknown`, quindi non serve toccarne il tipo:
`allergen_zone`, `temp_class`, `capacity`.

**Regole come dato**, in una collezione `storage_rules` scritta dal Team Leader in
Configurazione: `{ rule_id, priority, quando: {campo, operatore, valore}, allora:
{vincolo}, attiva }`. «`article_code` inizia per `700` → `site_id = MAG2`» è un
record, non un rilascio.

**Come sceglie.** Vincoli **duri** prima — sito imposto dalle regole, segregazione
allergeni, classe di temperatura, ubicazione libera, abilitata, non bloccata,
capienza. Poi un **punteggio** sui morbidi: vicinanza a merce dello stesso
`item_key` (è la tua «articoli simili uno vicino all'altro», e si misura con la
`Geometria` che la serpentina già costruisce), poi stesso articolo, poi descrizione
simile; vicinanza all'uscita per chi gira; livelli bassi per chi pesa.

**E dice perché.** Ogni proposta esce con la sua motivazione in chiaro — «zona
allergeni, corsia A, accanto al lotto 122 dello stesso articolo». Un operatore si
fida di un suggerimento che può leggere, e scavalca quello che non capisce.
Lo scavalco è previsto, con motivo, e finisce nel registro: è lo stesso schema di
`forced_note` che lo scarico usa già, ed è quello che rende la cosa difendibile
davanti a un auditor.

---

### 4.4bis — Verifica di stoccaggio · **fatta, 11/08**

Il motore girato al contrario: invece di dire dove mettere una cosa, dice cosa è già
in un posto sbagliato. Anticipata rispetto al calendario per una ragione pratica —
finché gli attributi si popolano a mano, la mappa che si accende da sola è il modo
di vedere se quello che si sta scrivendo in anagrafica ha senso.

**Cosa c'è.**

| Dove | Cosa |
|---|---|
| `modules/anagrafica.ts` | I 14 allergeni dell'Allegato II e le 3 classi. Tabelle chiuse, lettura stretta |
| `modules/conformita.ts` | La verifica: funzione pura, come `pickRoute` |
| `articles` | `allergens[]` e `temp_class`, facoltativi |
| `zones` | `temp_class`, `allergen_zone`, `allergens[]` ammessi |
| Maschere articolo e zona | I due attributi in creazione e modifica |
| Export/import Excel | Colonne `Temperatura` e `Allergeni`, più il foglio **«Valori ammessi»** |
| Mappa | Filetto rosso o tratteggiato giallo sulla cella, fascia di riepilogo, elenco, export |
| Collaudi | **52 nuovi** — 22 sulle tabelle, 30 sulla verifica e sulla deroga |

**Le quattro regole.** Merce più calda di quanto chiede → **grave**; più fredda →
media, è uno spreco, non un rischio. Merce con allergeni fuori dalla zona riservata
→ **grave**. Allergene non ammesso in una zona che ne ammette solo alcuni → **grave**.
Merce pulita dentro la zona allergeni → media: non è simmetrica alla seconda, perché
lì a rischiare è il prodotto pulito.

**La deroga della cella riservata** (Andrea, 11/08 — il grado di libertà in più).
Un'ubicazione marcata **Riservata** ammette allergeni, ovunque si trovi e qualunque
cosa dica la zona intorno: è una decisione presa da una persona su una cella precisa,
e vale più di una regola generale. Le tre regole sugli allergeni non girano.

**Sulla temperatura invece non deroga**, e non è un'incoerenza: riservare una cella è
una scelta organizzativa, e una scelta organizzativa non raffredda una cella. Un
surgelato a +20 resta un surgelato a +20 anche se qualcuno ha deciso che quel posto
era suo.

E le deroghe **si contano e si elencano**. Non sono difetti, ma non sono nemmeno
niente: «dove tenete allergeni fuori dalla zona riservata» è una domanda che qualcuno
farà, e la risposta è un pulsante — `🔓 N in deroga` sulla mappa, elenco ed export.
Una deroga invisibile sarebbe un buco; una deroga contata è una scelta documentata.

**La decisione che conta: il silenzio ha due significati.** Un articolo senza
attributi non è conforme né difforme — è **ignoto**, e durante il popolamento sono la
maggioranza. La verifica lo salta e lo conta a parte, e la fascia lo dice: «1.240
articoli non ancora classificati, non verificati». Zero segnalazioni perché va tutto
bene e zero perché non c'è niente da verificare sono due cose diverse, e confonderle
sarebbe il modo di fidarsi di una mappa che tace per ignoranza.

**Nella cella, il colore non si tocca.** Dice già se è vuota, occupata o bloccata;
sovrascriverlo perderebbe quell'informazione. La segnalazione è un filetto più un
segno d'angolo, che si sommano.

**Due difetti chiusi per strada**, trovati leggendo:

1. **L'import Excel non sapeva aggiornare.** `addArticle` esce con `false` su un
   codice noto, e su un'anagrafica popolata l'import diceva «importati 0» senza
   spiegare perché. Ora è un upsert che tocca **solo le colonne presenti nel foglio**
   — un file con Codice, Temperatura e Allergeni non azzera descrizioni e pesi — con
   un referto prima di scrivere e le righe difettose elencate e **non** importate.
2. **Scriveva una riga per volta.** Su 11.000 articoli sono 11.000 richieste. Ora
   nuovi e modificati partono in due chiamate, con `bulkAdd` e `bulkPut`.

---

### 4.5 — WIP · 1.4.5

**Cosa.** Gli items prelevati per un ODP finiscono in ubicazione WIP invece di
sparire; il sistema tiene il conto e il tempo; quello che rientra si riposiziona con
la funzione nuova «posizionamento resi», che passa dal motore di stoccaggio e
verifica ubicazione/UDC, articolo, lotto e quantità.

**Il disegno è semplice** — il WIP è una **classe di ubicazione**, non un magazzino
parallelo: una ubicazione (o una per linea) marcata `kind: 'wip'`, e tutto il resto
del codice continua a funzionare senza sapere che è speciale. Collezione `wip` per
il conto aperto: `odp_num`, `item_key`, `qty`, `qty_uom`, `opened_at`, `closed_at`.

**Il valore vero non è il riposizionamento**, che è comodo: è che *ciò che entra in
WIP e non torna* **è il consumo reale di produzione**. Oggi quel numero non esiste.
E un lotto fermo in WIP da tre giorni è una deviazione che vale la pena vedere prima
che la veda qualcun altro.

**Il cambio delicato.** Oggi `PICK` scarica e basta. Con il WIP diventa un
trasferimento verso l'ubicazione WIP. È l'unica delle cinque funzioni che **cambia
il significato di un movimento esistente**, e va dietro al suo interruttore: a
`feature.wip` spento, `PICK` resta quello di sempre.

**Resta in calendario — deciso** (Andrea, 11/08), con verifica dell'andamento a fine
ottobre. Va detto cosa comporta, perché non è gratis: il WIP dipende da UM, da UDC e
dal motore, quindi arriva per forza ultimo, e ultimo vuol dire **la settimana che
precede l'inventario di fine anno**.

Da cui due condizioni, che non sono opinioni ma conseguenze della data:

1. **Si rilascia con `feature.wip` spento.** Il codice entra in magazzino il 19/12,
   l'interruttore si alza a gennaio, a inventario finito e a turni normali. Un
   rilascio installato non è una funzione accesa, ed è precisamente per questo che
   gli interruttori esistono.
2. **Il collaudo del WIP non aspetta dicembre.** È un modulo con una logica sua —
   quanto è uscito, quanto è tornato, quanto manca — e il file di prova si scrive a
   novembre, insieme a quello del motore. A dicembre resta la cucitura.

Con queste due, il 19/12 è una data che si può tenere. Senza, è una data che si
dichiara.

---

## 5. La regola che tiene in piedi tutto

Una sola, e non ha eccezioni:

> **Ogni campo nuovo è facoltativo, e assente significa «come nella 1.2».
> Ogni collezione nuova, vuota, significa «come nella 1.2».
> Nessun campo cambia mai significato. Nessun dato viene riscritto all'installazione.**

Da cui tre conseguenze concrete:

1. **La 1.4 gira sul database della 1.2 senza conversioni.** Nessun passaggio di
   migrazione da eseguire a mano la sera del rilascio.
2. **La 1.2 gira sul database della 1.4.** Il servizio legge i documenti dal JSON in
   `data` e ignora sia le colonne che non conosce sia le tabelle che non si aspetta.
   Questo è il **ritorno indietro**: si rimette la 1.2, e si lavora. Da verificare
   con la doppia istanza su porte diverse della §5.4 dell'HANDOFF 1.2 — non da dare
   per buono perché il ragionamento torna.
3. **Un export della 1.2 rientra nella 1.4, e viceversa.** `_format` non si muove:
   descrive la forma del pacchetto, che non cambia. Si muove `_appVersion`.

E l'interruttore per funzione. Cinque `feature.*` in `meta`, spenti alla consegna.
Si accende una cosa alla volta, su un magazzino alla volta, a inizio turno. Un
rilascio che si può spegnere non è un rilascio rischioso.

---

## 5bis. «I dati di oggi si salvano?» — provato, non promesso

La risposta breve è che **non c'è niente da importare**: i dati restano dove sono.
Ma è una risposta che vale poco se non la si misura, quindi
`server/test/collaudo-migrazione-1.4.js` la misura.

Costruisce un magazzino con lo schema di **oggi** — 192 righe di giacenza, 2.496
colli, ubicazioni su tre zone — ne prende l'impronta di ciò che interessa salvare
(`ubicazione|articolo|lotto|colli`, in SHA-256), applica lo schema della 1.4 con la
migrazione, e riconta.

```
  base di partenza: 192 righe, 2496 colli, impronta 52bf7598d9b80b52
  migrazione: inventory.udc_id (192 righe)

  PASSA   ubicazione, articolo, lotto e colli identici — impronta 52bf7598d9b80b52
  PASSA   nessuna riga persa — 192
  PASSA   nessun collo perso — 2496
  PASSA   inventory ha la colonna udc_id
  PASSA   le quattro collezioni nuove esistono e sono vuote
  PASSA   la 1.4 scrive e interroga udc_id sulle righe di ieri
  PASSA   la 1.2 rilegge lo stesso magazzino dal database della 1.4
  PASSA   loadAll della 1.2 non inciampa su colonne e tabelle che non conosce

  8 passate, 0 fallite
```

Le ultime due sono il **ritorno indietro**, che nella §5 era un ragionamento e adesso
è una misura: rimessa la 1.2 sopra un database già migrato, rilegge lo stesso
magazzino, stessa impronta.

Perché funziona: `ALTER TABLE ADD COLUMN` in SQLite tocca **i metadati, non le
righe** — non riscrive niente, e su un database da 5 MB è istantaneo. E le colonne
indicizzate sono **copie** materializzate: la sorgente è il JSON in `data`, che le ha
già. Aggiungere la colonna e ripopolarla dal documento non è un travaso, è un indice
che si ricostruisce.

### Il travaso esiste comunque, se un giorno servisse

Il pacchetto di export (`Store.exportAll`) resta leggibile in tutte e due le
direzioni, perché **`_format` non si muove**: `warehouse-mapper-v1.5`, come deciso
nell'HANDOFF 1.3 §5.4. Un export della 1.2 rientra in una 1.4 — i campi nuovi
mancano, e mancanti significa «come nella 1.2». Un export della 1.4 rientra in una
1.2 — i campi in più vengono ignorati.

Se anche tutto il resto andasse perso, l'insieme minimo che chiedi — ubicazione,
articolo, colli — sono **quattro campi di una collezione sola**, `inventory`, e
nessuno dei quattro cambia nella 1.4. È il caso più facile che ci sia.

> Aggiungerei `lot_code`: costa zero, è già lì, e senza di lui si perdono FEFO,
> scadenze, quarantene e la tracciabilità che serve in GMP.

### Due difetti dell'import trovati guardandolo, da chiudere in 1.4.0

1. **`importAll` in modalità sovrascrittura svuota solo dodici collezioni**, scritte
   a mano in un elenco (`store.js`). Le quattro nuove non ci sono, quindi
   **sopravviverebbero a un ripristino**: UDC e conti WIP che puntano a righe di
   giacenza appena sostituite. Vanno aggiunte all'elenco — o meglio, l'elenco va
   preso da `COLLEZIONI` di `types/collezioni.ts`, che esiste apposta.
2. **L'elenco delle collezioni da esportare è scritto in tre posti** — `exportAll`,
   `_countsOf`, `importAll`. È la stessa forma del difetto già chiuso una volta per
   `COLLECTIONS` (HANDOFF 1.3 §4.6): tre copie che combaciano perché qualcuno se n'è
   ricordato. Con quattro collezioni in arrivo, dimenticarne una in uno dei tre
   significa un backup che sembra completo e non lo è.

---

## 6. Calendario

Dall'11/08 al 31/12 ci sono 20 settimane. Ma l'ultima finestra utile per **installare**
qualcosa in magazzino è **il 19 dicembre**: dopo c'è l'inventario di fine anno e le
feste. Il budget vero è **18 settimane e mezza**.

Sei consegne, `store.js` in TypeScript dentro la prima, e il WIP dentro l'ultima.

| Versione | Cosa | Da → a | Sett. |
|---|---|---|---|
| **1.4.0** | Fondamenta: migrazione §1, schema mosso una volta, **`store.js` in TS**, collaudi su `_applyToCache`, export/import da `COLLEZIONI`, interruttori. **Invisibile** | 11/08 → 19/09 | 5,5 |
| **1.4.1** | Schedulatore sulle attività che esistono già | 21/09 → 10/10 | 3 |
| **1.4.2** | Unità di misura, split colli, collo incompleto | 12/10 → **31/10** | 3 |
| **1.4.3** | UDC, `moveUdc` transazionale, etichette | 02/11 → 21/11 | 3 |
| **1.4.4** | Motore di stoccaggio: attributi, regole come dato, punteggio, motivazioni | 23/11 → 09/12 | 2,5 |
| **1.4.5** | WIP — installato con l'interruttore **spento**, si accende a gennaio | 10/12 → **19/12** | 1,5 |

Prima di ogni consegna: build, 57+ collaudi client, 29+ di servizio, `npm run check`
a zero, e il confronto fra due istanze su porte diverse. Il metodo non cambia perché
il calendario stringe — è quando stringe che serve.

### La cosa da sapere prima di cominciare: non c'è slack

5,5 + 3 + 3 + 3 + 2,5 + 1,5 = **18,5 settimane su 18,5 disponibili**. Ogni consegna è
al suo minimo, e non c'è una settimana di riserva da nessuna parte. Una influenza, un
fermo impianto, un difetto che si scopre in magazzino, e il ritardo non si riassorbe:
si propaga fino al 19/12.

Questo non rende il calendario sbagliato — lo rende **un calendario che va guardato,
non lasciato andare.** Da cui le due cose qui sotto.

### Due mestieri anticipati, che è ciò che rende possibile il resto

Il motore ha 2,5 settimane e il WIP 1,5. Reggono per una ragione sola: **i loro
collaudi si scrivono prima, nel tempo delle consegne precedenti.**

- Il file di prova del **motore** — vincoli duri, punteggi, motivazioni — si scrive
  durante la 1.4.2, contro dati finti. Non serve che il motore esista.
- Il file di prova del **WIP** — quanto è uscito, quanto è tornato, quanto manca — si
  scrive durante la 1.4.3.

Non è ottimismo di pianificazione: è la §5.1 dell'HANDOFF 1.3, *«i collaudi si
scrivono prima»*, usata anche come strumento di calendario. A dicembre resta la
cucitura, che è la parte veloce.

### La verifica del 31 ottobre

Cade alla fine della 1.4.2, e non è una riunione: sono quattro fatti da guardare.

| # | Deve essere vero il 31/10 |
|---|---|
| 1 | **1.4.0 in magazzino da almeno quattro settimane, senza un ritorno indietro** |
| 2 | **1.4.1 in magazzino, e gli operatori ci hanno aperto dei compiti davvero** — non installato: usato |
| 3 | **1.4.2 costruita e verificata**, pronta da installare |
| 4 | Il file di prova del **motore** esiste e gira, anche se il motore no |

Se tutti e quattro sono veri, si tira dritto. Se anche uno solo è falso, il ritardo è
già di almeno una settimana e va tolto qualcosa — **e cosa togliere si decide adesso,
non a dicembre.**

### La scala di ciò che si toglie, in ordine

Si scende di un gradino per ogni settimana di ritardo, dal primo:

1. **Il cruscotto dello schedulatore** → resta l'elenco per priorità. Costo: si vede
   peggio, funziona uguale.
2. **Le etichette UDC** → si stampa il codice interno con lo strumento che c'è già in
   `ARCHIVIO`, senza integrarlo nel prodotto. Costo: un passaggio a mano.
3. **Il punteggio morbido del motore** → restano i vincoli duri, cioè allergeni,
   temperatura e magazzino imposto. Sparisce «gli articoli simili vicini», che torna
   nella 1.5. Costo: il motore propone un posto **giusto** invece del posto **migliore**.
4. **Allarmi di anzianità e riconciliazione dei consumi del WIP** → restano
   l'ubicazione WIP, il conto aperto e il posizionamento resi.

Il quinto gradino non c'è: sotto il quarto si sposta la data, non si toglie altro.
E si sposta il WIP, che è l'ultimo e il solo che non blocca nessuno.

> Nota di calendario, non tecnica: la 1.4.5 si **installa** il 19/12 e si **accende**
> a gennaio. Chiudere il progetto il 31/12 significa che il codice è in magazzino e
> collaudato entro quella data — non che si cambia il prelievo di produzione durante
> l'inventario di fine anno.

---

## 7. Cosa NON si fa nella 1.4

| Non si fa | Perché |
|---|---|
| `ui/app.js` in TypeScript | 10.529 righe. Fuori perimetro, resta alla 1.5 |
| Due righe di giacenza per il collo incompleto | Rompe `[location_code+item_key]`, §4.2 |
| Il vincolo del magazzino come campo dell'anagrafica | Sarebbe un rilascio a ogni cambio di politica, §4.4 |
| SSCC vero sulle UDC | Serve il prefisso GS1, che è una richiesta esterna, §4.3 |
| Riscrivere dati esistenti all'installazione | §5 |
| Accendere due funzioni nello stesso turno | Se qualcosa si muove, non si sa quale delle due |

---

## 8. Decisioni

### Prese — 11/08/2026, Andrea

| # | Decisione | Conseguenza |
|---|---|---|
| D1 | **Il WIP resta in calendario**, 1.4.5 | Installato il 19/12 a interruttore spento, acceso a gennaio. Il suo collaudo si scrive a novembre. §4.5, §6 |
| D2 | **Verifica dell'andamento a fine ottobre** | Quattro fatti da guardare il 31/10, e una scala di cosa togliere già decisa. §6 |
| D3 | **`store.js` in TypeScript dentro la Fase 0** | 1.4.0 passa da 4 a 5,5 settimane. Sparisce l'aperto #4, spariscono i due ponti verso Store. §3 |

### Aperte — bloccano la funzione, non l'inizio dei lavori

| # | Cosa serve sapere | Entro | Blocca |
|---|---|---|---|
| ~~A1~~ | ~~L'elenco degli allergeni~~ — **chiuso 11/08**: sono i 14 dell'Allegato II del Reg. UE 1169/2011, e la segregazione è per zona | — | — |
| ~~A2~~ | ~~Le classi di temperatura~~ — **chiuso 11/08**: le tre della logistica, `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C | — | — |
| A2b | **Quali zone** sono refrigerate e quale è la zona allergeni. Si imposta da Configurazione → Zone; finché non lo si fa, la mappa non segnala nulla | quando puoi | la verifica di stoccaggio, §4.4bis |
| A3 | **Prefisso aziendale GS1**: c'è? Chi lo sa? | 02/11 | solo le etichette UDC, §4.3. Prima si sa, meglio è |
| A4 | **Chi può alzare la priorità** di un compito. Proposta: solo Team Leader | 21/09 | il modello dei permessi dello schedulatore, §4.1 |
| A5 | Partita IVA e dati del mittente — aperto vecchio, ancora aperto | quando puoi | i DDT escono «non conformi» finché manca |

Le due che dipendevano da qualcun altro sono chiuse lo stesso giorno in cui il piano
è stato scritto, e con loro è partito il primo pezzo di codice della 1.4.0 — §4.4bis.

---

*Uso interno Dietopack S.r.l. / Naturacare Group — © Andrea Sacchetti*
