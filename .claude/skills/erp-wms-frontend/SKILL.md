---
name: erp-wms-frontend
description: >
  Progettazione UI/UX di interfacce ERP e WMS da magazzino: leggibilità dei
  dati, densità, uso con i guanti, terminali industriali e schermi ultrawide.
  Usa questa skill quando si disegna o si rifà una maschera di Pathfinder o di
  un altro gestionale di magazzino — posizionamento, prelievo, inventario,
  quarantena, DDT, cruscotti, tabelle, etichette — o quando si decide come
  presentare codici, lotti, quantità e unità di misura a chi lavora in corsia.
  Attiva anche se la richiesta dice solo «rifammi questa schermata», «questa
  tabella non si legge», «serve una vista per il terminale».
---

# Interfacce ERP/WMS — come si disegnano qui

Questa skill è scritta per **Pathfinder** (Dietopack S.r.l. / Naturacare
Group) ma le regole valgono per qualunque interfaccia usata in corsia. Le
convenzioni tecniche di questo progetto stanno in `MAPPER/INDEX.md` §6: **se
INDEX e questa skill divergono, vince INDEX.**

## 1. Chi guarda, e in che condizioni

Non è un impiegato seduto. È una persona in piedi, con i guanti, spesso con
un muletto acceso alle spalle, che guarda lo schermo **due secondi** fra un
gesto e l'altro. Ogni scelta di disegno si giudica lì.

Tre schermi, e sono tutti veri:

| Dove | Misura | Cosa cambia |
|---|---|---|
| **Terminale MC9400** | 4,3", 800×480 fisici — **fra 400 e 533 px in CSS** | Sotto ogni media query normale. La densità di serie è tarata su questo |
| **PC di corsia** | 1366×768, spesso sporco e lontano | Il testo piccolo qui non si legge, non perché sia piccolo |
| **Desktop ufficio** | fino a ultrawide | Non riempire per forza: una riga di tabella lunga 3000px non si segue con l'occhio |

**Il dito col guanto non rimpicciolisce con lo schermo.** Sotto i 900px i
bersagli restano a `--md-touch` (48px). La densità si stringe altrove: nella
spaziatura, mai nelle aree cliccabili.

## 2. La gerarchia di una scheda dati

L'ordine giusto è sempre lo stesso, e non è quello «bello»:

1. **Chi è** — codice articolo e **lotto**, sulla stessa riga. Insieme
   identificano la merce, e sono il campo su cui si decide se è la riga
   giusta.
2. **Quanto ce n'è** — colli e UM. È il numero che si legge da un metro:
   il più grande della scheda.
3. **Com'è fatto** — la descrizione. Una descrizione commerciale descrive
   centinaia di righe uguali: non identifica niente.
4. **Com'è impilato** — la distinta dei colli, dove esiste.

Tutto il resto — data di posizionamento, chi l'ha messa, note, ultimo
aggiornamento — **sta dietro un pulsante «Dettaglio»**. Non sono dati
minori: sono dati che non sono mai la domanda con cui si apre un vano.

## 3. I numeri

- **Colli e UM sono due numeri diversi, e vanno detti tutti e due.** «7
  colli» di un articolo a chili non dice se sono 35 kg o 175. Dove la riga
  porta un'unità, si scrive `7 Coll. · 93,795 KG`.
- **Unità diverse non si sommano: si dichiara MISTA.** 300 KG più 40 PZ
  fanno 340 di niente. Il totale resta **vuoto** — un'assenza, non uno zero.
- **Un'assenza non è uno zero.** Un articolo senza unità non ha «0 kg»: non
  ha un'unità. La cella resta vuota e chi legge lo capisce.
- **Il silenzio ha due significati.** «Nessun avviso perché va tutto bene» e
  «nessun avviso perché non c'è niente da verificare» sono due cose diverse,
  e vanno scritte diverse. Un verde che non significa niente è peggio di un
  grigio.
- Numeri sempre in **monospaziato**, allineati a destra nelle tabelle.

## 4. Tabelle, elenchi, registri

- **Ordinabili e filtrabili, sempre.** Una tabella di magazzino che non si
  ordina è un elenco da leggere tutto.
- La colonna larga scorre **dentro il proprio contenitore**, non fa scorrere
  la pagina.
- **Il conteggio si dichiara**: «12 righe su 194» dice qualcosa che «12
  righe» non dice.
- Un elenco che guarda solo una finestra di dati **lo scrive**. Un elenco che
  tace su cosa non sta guardando è peggio di un elenco corto.
- Righe alte abbastanza da colpirle col guanto; zebratura leggera, mai
  bordi pieni su ogni cella.

## 5. Colore

- **Un colore che dice un'importanza che non c'è è rumore.** Quattro
  pulsanti di quattro colori diversi insegnano una gerarchia falsa:
  trasferire non è più importante di mettere in quarantena, è solo più
  frequente. Azioni pari → **stessa dimensione, stesso peso**.
- Il colore porta **stato**, non decorazione: vuoto, occupato, bloccato,
  riservato, disattivato.
- **L'allergene è l'unico in rosso**: è il solo che può fare male a
  qualcuno.
- Mai il colore **da solo**: sempre con un testo o un'icona accanto. Un
  magazzino ha daltonici come qualunque altro posto.
- Il marchio Naturacare non si adatta al tema: verde `#94BC47`, blu
  `#21305A`.

## 6. Le maschere operative

- **L'identità si chiede PRIMA di aprire il modulo**, mai in fondo. Una
  maschera compilata e poi rifiutata è lavoro buttato.
- **Un campo, un gesto.** Il flusso si dichiara in testa alla maschera:
  `① UBICAZIONE → ② ARTICOLO → ③ LOTTO → INVIO`.
- **Il lettore di barcode è la tastiera principale.** Il campo di scansione
  prende il fuoco da solo, `Enter` avanza, e il campo successivo si prepara.
- **Non suggerire la risposta a chi verifica.** In un inventario il numero
  di sistema non si mostra prima di aver contato: un inventario che
  suggerisce la risposta non verifica niente.
- Conferme distruttive: **cosa sparisce, quanto, e da dove**, in un elenco
  chiave-valore. Mai un «Sei sicuro?».
- Un'operazione che tocca molte righe chiede la **giustificazione una volta
  sola**: un pallet rotto è un fatto solo, anche se porta otto righe.

## 7. Stampe ed etichette

- I documenti restano in **`pt` e `mm`**: la carta non ha un rem.
- **Ogni documento porta in testata il proprio riferimento in Code128**, così
  chi torna dal magazzino col foglio in mano lo rimette dentro col lettore
  invece di digitare quattordici caratteri coi guanti.
- **Un'etichetta porta solo quello che non invecchia.** Su un'unità di
  carico l'unico dato che non invecchia è il numero: ubicazione, data e
  operatore diventano una bugia incollata al legno il giorno dopo. Su
  un'etichetta di merce articolo, lotto e scadenza restano veri, e
  l'ubicazione si scrive in fondo dichiarata come «alla stampa».
- Il codice **anche in chiaro** sotto le barre: un lettore che non legge
  lascia comunque un numero da digitare.
- Barre **nere su bianco dichiarato**: un tema scuro che le gira le rende
  illeggibili a qualunque lettore ottico.
- Zona di rispetto: **almeno dieci moduli** per lato.

## 8. Il cruscotto

- Chi lo apre venti volte al giorno guarda **due riquadri**, non venti.
  L'ordine, la larghezza e quali esistano sono un **dato dell'utente**.
- **Ordine e larghezza, non coordinate in pixel.** Una posizione salvata su
  un 27 pollici, riletta su 480px, mette due riquadri uno sull'altro e un
  terzo fuori schermo. L'ordine sopravvive a qualunque larghezza.
- **Quello che avvisa non si spegne.** Gli avvisi di integrità e le scadenze
  sono la ragione per cui qualcuno deve guardare il cruscotto oggi invece
  che domani.
- Un riquadro che oggi non ha niente da dire **non lascia un buco**: sparisce.

## 9. La mappa

- **Zone a terra: vista dall'alto. Zone a scaffale: vista frontale.** Una
  scaffalatura vista dall'alto sovrappone i livelli; un'area a terra vista
  di fronte è una fila di rettangoli alla stessa quota. Offrire tutte e due
  su ogni zona vuol dire offrire, su ogni zona, quella sbagliata.
- La vista frontale delle corsie ha **«Specchia»**: si percorre nei due
  versi, e chi guarda deve ritrovare la corsia che ha davanti.
- **Le unità di carico si disegnano dentro il vano**, come caselle annidate:
  un contenitore *sta in* un'ubicazione, e il disegno lo dice meglio di un
  numero. Si stringono da sole al crescere del numero; sotto una certa
  larghezza si smette di disegnarle e si scrive quante sono.
- **Il pannello di dettaglio non copre mai la mappa**: la vista si stringe.
  I 360px coperti sono esattamente la corsia che l'operatore stava
  guardando, perché ha appena cliccato lì.

## 10. Il telaio tecnico di Pathfinder

Prima di scrivere un pixel:

1. **`main.js` importa un CSS solo**: `00-tailwind.css`, che è il tema e
   importa gli altri nove con `@import ... layer(app)`.
2. **L'ordine dei layer è il contratto**: `theme, base, components, app,
   utilities`. Il CSS dell'applicativo sta in `app`, **sotto** le utility.
3. **La spaziatura va a decimi di rem**, non a quarti: qui `mb-4` è
   **0,4rem**. È tarata sull'MC9400, e la manopola è una sola: `--spacing`.
4. **Il tema non ha valori, ha rimandi.** La tavolozza di serie è spenta:
   `bg-blue-500` non compila. Raggi e ombre **per numero**: `rounded-2`,
   `shadow-3`.
5. **I componenti restano classi** — `btn`, `badge`, `input`, sidebar,
   modali. Il markup nasce da stringhe dentro venticinque viste: la stessa
   fila di utility finirebbe ricopiata centinaia di volte.
6. **Niente `style=`** salvo valori che nascono a tempo di esecuzione
   (`color:${themeColor}`, `width:${pct}%`).
7. **Niente dipendenze nuove** senza motivo forte, e nessuna libreria di
   componenti: TW-Elements e simili portano la propria scala e la propria
   tavolozza addosso a un telaio già tarato.
8. **Italiano ovunque**, commenti compresi. Nessun `font-size` fuori dai
   token MD3.

## 11. Prima di dire «fatto»

- Si legge a **480px di larghezza**?
- I bersagli sono **48px** col guanto?
- Un numero senza unità è **vuoto** o è uno zero inventato?
- Le azioni pari hanno la **stessa dimensione**?
- Il colore da solo dice qualcosa che il testo non dice?
- La tabella si **ordina** e si **filtra**?
- La stampa esce in **mm**, e porta il proprio riferimento in barre?
- Chi guarda capisce **cosa non sta guardando**?
