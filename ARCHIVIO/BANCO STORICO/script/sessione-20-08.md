# Sessione al browser — 20/08, produzione 4173

Pacchetto rifatto: `consegna\Pathfinder 2.1\`, impronta **`c3acf43a…`**
(quello in servizio e' `29f215e1…`). 4 file, 448 kB sul filo, servizio `2.1`.
`npm run check` pulito, **834 prove in 29 file** (erano 811 in 28), piu' le
**96** del servizio.

## Cosa e' entrato in questo giro

**1. Il trasferimento si chiude quando viene confermato — decisione di Andrea.**
`TRANSFER` passa dalla famiglia «a residuo» a quella «a gesto»
(`chiudeAlGesto`, `src/modules/compiti.ts`). A residuo aveva due modi di non
chiudersi mai: la richiesta nata da un ODP non porta colli — quanti ne servano
per fare 44,42 kg lo sa la giacenza, non l'ordine — e un residuo `null` a zero
non ci arriva; e il trasferimento parziale lasciava in coda una riga che nessuno
riprendeva. **Conseguenza dichiarata: un parziale adesso chiude.** 12 chiesti, 5
mossi, confermato: attivita' chiusa, `residuo 7` scritto a registro ma non piu'
decisivo. E' la stessa frase della quarantena — chi ha la merce in mano decide
quanto si muove, e la conferma e' la fine del lavoro.
Resta a residuo il solo **Smaltimento**, che e' l'unico in cui «ne restano 7»
vuol dire davvero che sette colli aspettano ancora.

**2. Troppi clic per chiudere Personalizza il cruscotto.**
`showModal` (`src/ui/app.ts`) appendeva un overlay nuovo senza togliere quello
di prima. Ogni spunta in Personalizza passa da `_dashScrivi` →
`_personalizzaCruscotto()` → `showModal`, quindi impilava una finestra per
modifica; `closeModal()` cerca per id e `getElementById` restituisce il primo
del documento, cioe' il piu' vecchio, cioe' quello sotto — ogni clic toglieva un
livello invisibile e lo schermo non cambiava fino all'ultimo. Corretto con una
riga. Vale per tutti i 31 punti che chiamano `showModal`.

**3. `src/ui/app.ts` non era UTF-8 valido.**
Nel commento della correzione UDC del 20/08 c'erano `«non trovata»` in cp1252
piu' un carattere di controllo `0x14`. In un commento non rompe la build — ed e'
il motivo per cui poteva restarci per sempre. Unico file del sorgente.

Prove: `test/modali.test.js` (nuovo) e `test/compiti.test.js`, dove le prove che
fissavano il comportamento di prima sono state **riscritte, non cancellate**.

## Cosa l'installazione NON raddrizza

**Le due attivita' ferme restano ferme, e vanno chiuse a mano.**

| | `TA-MT0N4CWQ-TFUT` | `TA-MT0N4JYO-5FER` |
|---|---|---|
| merce | `6000296#262185`, 44,42 KG | `6000006#261794`, 3,04 KG |
| da → a | `MAG-ACC-06` → `M03-STK-02-01-T` | `MAG-ACC-05` → `M03-STK-01-04-A` |

Nel registro il lavoro e' finito per intero — letto dai movimenti, non dedotto:
MOVE all'ubicazione chiesta, poi PICK da li' a zero, poi la merce in
`M06-COM-01`, il vano WIP, per ODP2603889.

`avanzamento()` decide **al movimento successivo**, e su queste due un movimento
successivo non ci sara' mai: la merce e' gia' partita, la maschera non ha piu'
niente da confermare. La regola nuova vale per i trasferimenti da qui in avanti.
Queste due si annullano dalla vista Attivita' col motivo «chiusa dalla 2.1,
lavoro gia' eseguito», come le quattro della voce 4 di §2.

## Da verificare all'installazione

1. `/api/app-info` deve dire `2.1` due volte e impronta **`0e1db6ea…`**. Se dice
   ancora `29f215e1…` i byte sono quelli di ieri.
2. Personalizza il cruscotto: cinque modifiche, **un clic** su Chiudi.
3. Un trasferimento da coda: alla conferma l'attivita' deve sparire dagli aperti.
4. Un trasferimento **parziale** da coda: deve chiudersi lo stesso — e' il verso
   nuovo, ed e' quello da guardare per primo se non convince.

## Il conto di produzione — tre cose chieste da Andrea il 20/08

**4. «Consumato del tutto», riga per riga.** Accanto a `↩` c'e' `🔥`: se in
lavorazione e' sceso un collo e non rientra, e' sottinteso che sia finito nel
prodotto, e aspettare la chiusura dell'ordine per dirlo tiene aperta una riga
che nessuno riprendera'. **Chiude la riga, non l'ordine.** Il motore e' uno solo
— `_wipDichiaraConsumata` — e lo chiamano tutte e due le strade: due copie della
stessa scrittura sono due posti dove aggiungere le UM, e la seconda volta se ne
aggiunge una sola.

**5. Un collo rientra anche aperto, nella UM dell'articolo.** La maschera del
reso ha adesso due campi: **colli interi** (che possono essere zero) e **una
parte di un altro collo**, nella UM del lotto — la stessa forma e le stesse
parole di `_chiediColli`, perche' e' la stessa domanda. Un collo da 25 KG sceso
in lavorazione risale a 7,5: nel vano resta lo stesso collo con dentro 17,5, a
magazzino ne rientra uno da 7,5, e alla chiusura i 17,5 diventano consumo.

Quale collo si apre lo decide `misureDelReso` in `modules/wip.ts`, pura e
collaudata: **il piu' piccolo che basta**, come fa il servizio quando la misura
esatta non c'e' — aprire un sacco da 25 per prenderne 7,5 quando ce n'e' uno da
10 lascia in giro due mezzi colli invece di uno. Gli interi si prendono dai piu'
piccoli. **Una riga che non dichiara i colli rifiuta il rientro parziale e dice
perche'**: «7,5 KG di un collo» non ha un collo a cui riferirsi.

**6. Il rendiconto di consumo, su carta.** Pulsante `🖨 Report consumo`. Il
numero che il foglio da' e' un **delta**: consegnato in lavorazione meno reso a
magazzino, in colli e in UM, riga per riga, coi totali in colli soltanto — un
lotto a chili e uno a pezzi non fanno un totale.

**IL FOGLIO DICE SE E' UN CONSUNTIVO O UNA FOTOGRAFIA.** Finche' una riga non e'
dichiarata, la sua parte di delta e' merce che sta sul bancone: quelle righe
escono segnate «ancora in lavorazione» e l'intero foglio porta la filigrana
**PROVVISORIO**, come una bozza di DDT. E' la stessa regola di `consumo()`, che
davanti a un ordine aperto risponde `null` invece di inventare un numero che
alle sette di sera e' sempre sbagliato.

Regola in `modules/wip.ts` — `rendiconto`, `misureDelReso` — con 15 prove nuove.

## Da verificare all'installazione — aggiornato

1. `/api/app-info`: `2.1` due volte e impronta **`c3acf43a…`**.
2. Personalizza il cruscotto: cinque modifiche, **un** clic su Chiudi.
3. Un trasferimento da coda: alla conferma sparisce dagli aperti.
4. Un trasferimento **parziale**: si chiude lo stesso — e' il verso nuovo.
5. Conto produzione, `🔥` su una riga: la riga sparisce, l'ordine resta aperto.
6. Reso con **0 colli interi e una parte**: a magazzino arriva un collo della
   misura scritta, e nel vano WIP il collo resta con dentro la differenza.
7. `🖨 Report consumo` a ordine aperto: deve uscire con **PROVVISORIO**.
