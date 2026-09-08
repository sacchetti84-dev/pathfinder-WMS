# Pathfinder — INDEX

**Questo è l'unico documento del progetto.** Stato, regole, trappole, coda di
lavoro e mappa del codice stanno qui. `HANDOFF/` è stato assorbito qui il
17/08/2026 e gli originali sono scesi in `ARCHIVIO/HANDOFF STORICI/`: sono
memoria, non istruzioni.

Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
Repo privato `sacchetti84-dev/pathfinder-WMS`, branch `main` (unico ramo)
Aggiornato: **08/09/2026** — **quello che è già in reparto non si va a
prendere.** La **2.29** è costruita; la **2.28** è installata e in servizio.

**SI CARICA UN ODP E IL PERCORSO MANDAVA A PRENDERE ANCHE QUELLO CHE STAVA
GIÀ DI LÀ.** Un ordine prelevato a metà e ricaricato, o un fondo lasciato nel
vano da un altro ordine: la distinta chiede la quantità intera, e nessuno
diceva che una parte era già scesa. Adesso all'ingresso il sistema confronta
la domanda del giro con quello che è fermo in lavorazione, e lo scrive in un
riquadro sopra l'anteprima.

**I DUE RESIDUI NON SI SOMMANO, ED È LA REGOLA.** Quello degli ordini DEL
GIRO è merce già scesa per questo lavoro: scala il fabbisogno, e dove lo copre
tutto la tappa non serve. Quello di ordini ESTRANEI sta sul conto di qualcun
altro — prenderlo sposta un conto — e si dice soltanto, con il numero
dell'ordine che lo tiene. **Nessuna tappa viene toccata**: la distinta resta
quella che l'ordine dichiara, e saltare è un gesto dell'operatore.

**SI CONFRONTA NELL'UNITÀ, MAI NEI COLLI.** L'ordine chiede chili; il vano
tiene colli, e quanto ci sia dentro si sa solo se il lotto dichiara la
confezione. Un residuo che quella quantità non ce l'ha, o che la porta in
un'altra unità, **non entra nella sottrazione**: la riga esce «da verificare
di persona» e il numero è dichiarato un minimo. Dedurlo dai colli sarebbe
l'unità inventata della voce 19, applicata al conto invece che alla tappa.

**E IL VANO DI LAVORAZIONE NON È PIÙ UN'UBICAZIONE DA CUI SI PRELEVA.** Era
il buco vero, trovato provando questa funzione al banco: portare in produzione
è un trasferimento, la merce resta scritta in giacenza NEL VANO WIP, e per
`getItemByKey` quello è uno scaffale come gli altri. Svuotato il vano vero,
diventava l'unica ubicazione che portava il lotto, e il percorso mandava a
prelevare dal vano WIP verso il vano WIP. Adesso `build` lo esclude, e una
riga che sta tutta di là esce col motivo suo — **`in_lavorazione`**, non
«in quarantena o impegnata su un DDT», che manderebbe a cercare il guasto
dove non c'è.

**TRE DIFETTI USCITI DAL PROVARE A ROMPERLA**, non dal leggerla: l'incertezza
sul residuo di un ALTRO ordine annullava un conto calcolato bene sulla merce
propria; un chiesto a zero con merce di là scriveva «ne mancano 0»; e una
domanda senza unità si lasciava sottrarre un residuo in chili. Tutti e tre
hanno la loro prova.

**E CINQUE ICONE CHE NON SI VEDEVANO, o che si vedevano come non dovevano.**
Quattro `toast` scritti su più righe portavano un'icona nel messaggio, e
`toast` scrive con `textContent`: a video usciva la scritta `<svg class="ico"`.
La rete della 2.27 non li prendeva perché guardava **una riga sola**. La
quinta stava dentro un `<option>`, dove il parser HTML butta via i tag che non
sono di una tendina: l'icona non compariva e restava un doppio spazio.
Verificato in browser, non dedotto. Due prove nuove in `test/icone.test.js`,
e mordono — provato rimettendo i difetti.

Prima di questo — **ogni foglio ha la sua testata e la sua coda, e in
mezzo solo la merce.**

**UN FOGLIO DI MAGAZZINO HA DUE FASCE FISSE E UNA CHE SCORRE.** In alto chi
manda e chi riceve, in basso totali, vettore, date e firme, in mezzo le righe:
quelle che ci stanno, e le altre passano al foglio dopo — che ha testata e coda
IDENTICHE. Fino alla 2.27 la coda seguiva l'ultima riga della merce: su un DDT
da due partite finiva a metà pagina, su uno da venti in fondo, e chi controlla
in banchina doveva cercarla.

**LA CODA STA DOVE STA LA TESTATA: in un gruppo di tabella.** `<thead>` e
`<tfoot>` sono i due gruppi che il browser ripete su ogni pagina, e la coda è
passata nel secondo — col piede dentro, che ci stava già. La fascia si dipinge
fuori dal flusso a `bottom: 0` e il `tfoot` ne riserva la banda, così nessuna
riga di merce può finirci sotto: è la regola della 2.27, estesa dal solo piede
a tutta la fascia bassa.

**UN NUMERO SOLO SI MISURA: quanto è alta la coda**, perché la fa il documento
— un DDT con le annotazioni lunghe ha la fascia più alta di uno senza.
`_ancoraLaCoda` la misura una volta, con le regole della carta tirate fuori da
`@media print`, e la scrive sulla cella del `tfoot`. Se la misura non riesce non
si rompe niente: senza la classe la fascia resta nel flusso, cioè il foglio
della 2.27.

**LA STRADA SBAGLIATA, perché non venga ripercorsa.** Il primo tentativo metteva
la coda in fondo all'ULTIMA pagina, e per farlo rifaceva a mano l'impaginazione
del browser — quante righe stanno su un foglio, quanto vuoto resta. Sbagliava di
una riga e non c'era modo di farlo tornare. La regola vera non era «in fondo
all'ultima»: era «su ogni pagina», e allora il modello non serve.

**Misurato su carta**, DDT da 40 partite: **4 fogli** dove prima ne servivano 5,
11+11+11+7 righe, coda alla **stessa quota su tutti e quattro** — firme a
33,2 mm dal bordo inferiore, piede a 13,1 mm, numero di pagina a 4,9 mm — e le
righe della merce che si fermano a 87,2 mm contro una banda che arriva a 79,5.
Nessuna sovrapposizione. Le stesse quote sul primo DDT stampato dal servizio
dopo l'installazione.

**Cambia una decisione della 2.24**, che aveva tolto le firme dal piede perché
uscivano su ogni pagina. Adesso ci escono di proposito: la coda è la fascia
bassa del FOGLIO, non la fine del documento. Sta scritto nel motore e in una
prova, così nessuno la disfa leggendo il commento vecchio.

Prima di questo — **il piede sta in fondo al foglio, il campione
si pesa in grammi, e due campi di ricerca tornano a cercare.** La **2.27** chiude
tre difetti che non c'entrano niente fra loro se non che si pagavano tutti in
corsia.

**IL PIEDE GALLEGGIAVA A META' DELL'ULTIMA PAGINA, e non era un difetto di
gusto.** Nei cinque documenti che scorrono — DDT, packing list, rapporto di
prelievo, riepilogo di giacenza, rendiconto WIP — il piede stava in un `<tfoot>`
con `table-footer-group`, e quella dichiarazione **non vuol dire «in fondo alla
pagina»**: vuol dire «ripetuto alla fine di ogni frammento della tabella». Su
una pagina piena le due cose coincidono per caso; sull'ultima, e su un documento
che sta in un foglio solo, il frammento finisce dove finiscono le righe. Adesso
il `tfoot` fa il mestiere che sa fare — **riservare** la sua banda su ogni
foglio, ultimo compreso, così nessuna riga può finirci dentro — e il piede lo
**dipinge** lo stesso elemento, fuori dal flusso, inchiodato al fondo dell'area
di pagina. È la strada che la filigrana percorre dalla 2.1: Chrome ridisegna gli
elementi `fixed` su ogni foglio. Riserva e banda leggono **una sola variabile**,
`--doc-piede`, perché due numeri scritti due volte divergono, e il giorno che
divergono il piede copre l'ultima riga.

**E LA BANDA È DIECI MILLIMETRI PERCHÉ SONO STATI MISURATI.** A dodici, un DDT
a carico pieno perdeva **tre righe sulla prima pagina** — quella con la testata
alta, dove l'avanzo era già poco — mentre dalla seconda in poi non cambiava
niente. A dieci le tre righe tornano e restano due millimetri di franco.

**IL TESTO DEI DOCUMENTI SCENDE DEL 10%, e un DDT da novanta partite passa da
nove fogli a otto.** Arrotondamento a 0,25 pt — a 0,5 pt il fattore reale
sbanda del ±3% proprio sui corpi piccoli, che sono i due terzi delle
dichiarazioni — e **pavimento a 6,5 pt**, che è il più piccolo che questo
progetto avesse già scelto due volte. Sotto, un foglio in mano davanti a uno
scaffale sotto un neon non si legge. Non scendono le **etichette adesive**
(supporto a misura fissa: rimpicciolire non recupera un millimetro), la
filigrana, il numero di pagina e la fascia del cartellino di non conformità, che
è un segnale e non un testo. La scala non sta in una variabile CSS ma in una
**misura di collaudo** nuova, `scalaDiStampa`: in stampa il numero *è*
l'argomento, e `var(--doc-fs-xs)` lo nasconderebbe dove serve.

**IL CAMPIONE SI PESA NELL'UNITÀ IN CUI LO SI PESA.** Cinquanta grammi presi da
un sacco da venticinque chili si digitavano `0,05`, ed è il numero che si
sbaglia: adesso sugli articoli a peso c'è un selettore **KG/GR** accanto alla
quantità. A magazzino cala sempre l'unità dell'articolo — la conversione finisce
nella maschera, e sotto non ne sa niente né Store, né il servizio, né il
registro. **Una conversione che non torna esatta viene rifiutata**, non
arrotondata: mezzo grammo su un articolo che si conta a grammi interi non è né
zero né uno, è una quantità che il magazzino non sa scrivere.

**E I DUE CAMPI DI RICERCA ERANO ROTTI DALLA 2.23.** Registro movimenti e
anagrafica articoli mostravano nel campo la scritta `<svg class=` e non
filtravano niente. La migrazione emoji → sprite aveva messo `_ico('search')`
**dentro l'attributo `placeholder`**: `_ico()` restituisce markup con le
virgolette doppie, il parser chiude l'attributo alla prima e il tag `<input>` al
primo `>`, e l'`oninput` non viene mai applicato. Un campo che non filtra sembra
un campo vuoto, ed è per questo che è rimasto rotto per quattro versioni. Ne è
stata trovata **una terza** mai segnalata, in Prodotto Finito, e una prova nuova
in `test/icone.test.js` impedisce alla prossima sostituzione di massa di rifare
il danno.

Prima di questo — **il servizio parla HTTPS, e il chiosco
smette di essere una promessa.** La **2.26** chiude quello che la 2.25 aveva
lasciato aperto per iscritto: nessun browser installa una pagina servita in
chiaro, quindi finché Pathfinder rispondeva su `http://` la modalità chiosco
era una scheda che spiegava perché non funzionava. Adesso il certificato c'è, e
lo fa **Windows**: `crea-certificato.ps1` usa `New-SelfSignedCertificate` e
`Export-PfxCertificate`, che sono già dentro il sistema — nessun `openssl` da
scaricare su un PC di magazzino, per la stessa ragione per cui il servizio è
un'attività pianificata e non un servizio nativo con un wrapper preso da
internet.

**Due certificati e non uno, ed è la parte che conta.** Si crea
un'**autorità locale** e con quella si firma il certificato del servizio. Sui
terminali si installa **solo l'autorità**, una volta: quando il certificato
scade lo si rifà con `-Rinnova` e in corsia non si tocca niente. Con un
autofirmato solo bisognerebbe rifare il giro dei terminali a ogni scadenza. Il
certificato dichiara **nome macchina, nome completo di dominio e tutti gli
IPv4**, perché un browser che apre `https://10.0.0.12:4173` non accetta un
certificato che parla solo del nome: gli indirizzi vogliono `IPAddress=` dentro
il SAN, e `-DnsName` li scriverebbe come nomi.

**UNA PORTA SOLA, E I COLLEGAMENTI SALVATI NON SI ROMPONO.** Il servizio resta
sulla **4173** — la superficie di rete dichiarata a REP-IT-001 non cambia — e
davanti ai due server sta un `net.Server` che guarda il **primo byte**: `0x16`
è un saluto TLS e va al server cifrato, qualunque altra cosa è HTTP e va a uno
che risponde **301** verso `https://` sullo stesso host e sulla stessa porta.
Senza, chi apre il collegamento vecchio riceverebbe `ERR_EMPTY_RESPONSE` — un
errore che non dice niente e manda a chiamare l'assistenza. Il cookie di
sessione prende `Secure` da sé, come faceva già.

**Quel che resta da fare è umano e va detto:** finché `pathfinder-ca.cer` non è
installato **come autorità** su ogni terminale, il browser mostra l'avviso
rosso e il chiosco non si installa. È il browser che rifiuta, non Pathfinder, e
lo script stampa l'impronta SHA-256 del file da confrontare prima di fidarsi.

Prima di questo — **l'interfaccia stava più larga dello
schermo, e adesso ci sta dentro.** La **2.25** chiude il difetto per cui su un
telefono e su una tavoletta *«non si vedevano tutti i tasti della barra
superiore»*: non era la testata. Una casella di griglia parte da `min-width:
auto` e non scende sotto il proprio contenuto minimo — e il contenuto minimo
della testata è il campo di ricerca, che senza `size` chiede **venti
caratteri**. Su 375px facevano **459px**: la griglia si allargava a 459 e con
lei tutte e tre le righe, così l'operatore, il pallino del salvataggio e la
**sesta linguetta** in fondo finivano oltre il bordo destro — irraggiungibili,
perché `html, body` sono `overflow: hidden`. Una riga, `min-width: 0`, e il
telaio non supera più lo schermo.

Le altre due erano vere anche loro. Le **undici linguette di Configurazione**
chiedono 1030px in fila e venivano tagliate da `.app-main`, che è `overflow:
hidden`: Stampanti, Regole di stoccaggio e Dati e Backup non si vedevano e non
si potevano raggiungere. Adesso vanno **a capo**, come `.prel-tabs` — non
scorrono, perché una fila che scorre nasconde lo stesso quel che c'è oltre il
bordo. E lo **zoom**: il `viewport` diceva `user-scalable=no, maximum-scale=1`,
cioè toglieva la lente a chi legge un lotto in controluce. Era lì per un
motivo — Safari su iPad ingrandisce da solo quando il fuoco entra in un campo
che scrive **sotto i 16px**, e la pagina resta ingrandita e spostata — ma si
toglie la **causa**, non il gesto: sotto `pointer: coarse` i campi partono da
16px (`--md-fs-campo-tocco`) e i bersagli da **48px**, che è la regola dei 560
che smette di dipendere dalla larghezza. `dispositivo-tavoletta` esisteva dalla
1.11 e non aveva **una sola regola**: adesso ce l'ha.

**E Pathfinder si installa.** La modalità **chiosco** è un manifesto web —
`assets/chiosco.webmanifest`, tre icone, `display: standalone` — e il terminale
lo apre **dalla sua icona**: niente barra dell'indirizzo da toccare coi guanti,
niente scheda da chiudere per sbaglio a metà di un prelievo. Non c'è un
interruttore da ricordare per macchina: l'invito compare da solo su terminale e
tavoletta, mai su una scrivania, e la scheda Configurazione → Sessione dice **a
che punto è**. Compreso il punto che oggi blocca tutto e va detto in chiaro:
**nessun browser installa una pagina servita in `http://`**. Finché il servizio
non parla **HTTPS**, il chiosco resta una possibilità dichiarata — e lo stato
`non-sicuro` è scritto perché nessuno vada a cercare il guasto dalla parte
sbagliata.

Prima di questo — **i due fogli che escono dal magazzino
dicono cose diverse, e adesso si vede.** La **2.24** rifà il DDT e la packing
list. Il DDT dice **cosa c'è sul camion**: sei colonne — articolo, lotto,
scadenza, colli, **quantità e unità in due celle** — dove prima erano otto e le
due che non servivano, il numero di riga e le Note in colonna, rubavano lo
spazio alle quattro che si cercano in banchina. La packing list dice **com'è
fatto**: non più un blocco per pallet, ma **articolo → lotto → bancale**, tre
livelli di riga e **ognuno col suo totale** — chi si ferma al lotto ha il
numero del lotto, chi scende trova i pallet che lo compongono.

Sotto la superficie stavano **tre difetti che nessuno aveva ancora pagato**.
La colonna della quantità aveva **13 mm e `nowrap`**: «1.250,00 KG» non ci sta
e `nowrap` non manda a capo, quindi sbordava sotto la colonna accanto. Il DDT
**restava a pagina sola per scelta**, ma niente faceva rispettare la scelta: un
documento con molte partite usciva lo stesso su due fogli, e il secondo
arrivava **senza testata, senza il numero del DDT e a filo carta**. E le tre
firme della packing list uscivano **senza etichetta** da quando il foglio
esiste, perché erano passate come coppie dove il codice legge oggetti — nessun
errore, nessun tipo che si lamenta. Il margine adesso sta **sulla pagina**, in
un posto solo, e le firme stanno in coda al **corpo**: nel piede ripetuto si
firmavano una volta per foglio.

**E il banco misurava fogli vuoti.** `impaginazione` passava verde su sette
documenti che, nella copia di prova, hanno **una riga**: il caso che rompe un
foglio non era mai stato provato. Adesso il foglio è una funzione del
documento — `_ddtFoglioHTML`, `_packingFoglioHTML` — e il banco ne compone due
da un **carico pieno**, dieci partite su ventisei bancali, senza scrivere
niente a database. Rimettendo la colonna stretta di prima, il banco nomina
**ventidue** valori che uscirebbero tagliati: prima ne nominava tre.

Prima di questo — **la tappa dice a che altezza sta.** La
**2.22** disegna nella scheda del prelievo la **campata vista di fronte**: i
livelli impilati, quello da prelevare acceso pieno, gli altri col solo stato.
Un codice — `MG1-SCA-04-06-2` — diventa un gesto: quale ripiano, contando da
terra. Gli altri livelli **non dicono cosa tengono**, perché un vano che non
si deve toccare non ha niente da spiegare; l'unica cosa che si guarda dentro
è se lo **stesso articolo sta lì con un altro lotto**, e quella si dice a
parole in una banda gialla. È il caso in cui la scansione del vano non salva
nessuno: chi legge l'etichetta del livello sbagliato scansiona un codice
valido, solo non è il suo. Sulle zone a terra e alla rinfusa **non si disegna
niente** — non hanno livelli, e una colonna di un rettangolo solo
ripeterebbe il codice che sta già in testa alla scheda.

Prima, la **2.21** — **il prodotto finito ha imparato a farsi
da solo, e il camion si carica scansionando.** La 2.20 aveva dato al bancale
un'esistenza; la **2.21** gli dà il gesto di chi lo fa e di chi lo spedisce.
La maschera del reparto è diventata quella del carico merce — ① articolo →
② lotto → ③ **colli pieni × quanto dentro**, col collo incompleto che si
aggiunge sotto — e **il modello di carico non si compila più: si impara**.
Undicimila articoli non ricevono un formato perché qualcuno si siede a
scriverlo; lo ricevono il giorno in cui il reparto imballa il primo bancale
di quell'articolo, e dal secondo il numero è già proposto. L'etichetta esce
**prima** dell'ubicazione, che è l'ordine vero: il muletto porta via il
pallet etichettato, e il vano lo scansiona chi lo posa.

Dall'altra parte del magazzino è nata la **undicesima tessera**: **Carico
spedizioni**. È il giro di prelievo di chi carica il camion, e le tappe sono
**bancali** — si scansiona solo il codice del pallet, perché articolo e lotto
stanno sotto il cellophane. I bancali prelevati vanno in **baia di carico**,
che è un tipo di zona nuovo, una posizione per pallet; finito un DDT il
sistema chiede se se ne carica un altro, e alla fine evade tutto insieme. **Un
DDT a cui manca un bancale non si evade**: resta pendente, e chi spedisce
decide.

In mezzo: l'elenco dei bancali porta **articolo e lotto in due colonne**, il
**DDT con cui sono partiti e la data** — che si rileggono dai documenti, non
sono campi dell'unità — e un filtro di stato; lo **scarico a mano** fa uscire
i pallet con un numero di DDT già emesso dal gestionale; il **DDT stampa una
riga per articolo#lotto** mentre le righe salvate restano una per bancale; la
**packing list** dice com'è fatto il collo e chiude con un riepilogo per
lotto. Le caselle dei bancali sulla mappa sono fatte come i vani — angoli
arrotondati, fondo tenue, bordo pieno — e la tessera del prodotto finito ha
un **marchio suo**: un pallet coi suoi colli, non una fabbrica.

**Cinque blocchi, tutti i collaudi verdi tranne uno che era già rosso** — §4,
voce **87**. **In servizio su questa macchina c'è la 2.23.0**, impronta
`f9d4e012…` — misurata da `/api/app-info` il 04/09 sera, non dedotta: §0 punto
2. Accanto ci sono la **2.24.0** e la **2.25.0**, tutte e due **costruite e non
installate**; la **2.28.0 è installata e in servizio** dall'08/09. Il numero è nei quattro
posti di §7.

> **E QUESTA È LA QUINTA VOLTA.** Fino al 04/09 sera questo documento diceva
> che in servizio c'era la **2.21.0** e che la **2.23.0** era «costruita, non
> installata». Il servizio dice altro, e §0 punto 2 è nato per questo: **quello
> che risponde batte quello che il documento dice**. È successo con le voci 35
> e 48-bis, poi ancora, e adesso di nuovo. Non è un errore di chi scrive: è il
> costo di uno stato che si aggiorna a mano e di un'installazione che, qui, non
> ha un gesto separato — **servita vuol dire installata**, §0.

Prima di questo — **la 2.20.0**, impronta `d10d7830…`, in servizio dalle
15:54:46Z di oggi e adesso via di ritorno: il magazzino del prodotto finito.
Il PF esce dal reparto, viene imballato su un bancale, scansionato ed
etichettato, e messo nella zona di spedizione: fino ad allora di tutto
questo Pathfinder non sapeva niente — la produzione registrava il
**consumo** dei componenti e il prodotto finito viveva come una riga di
testata sul rapporto di prelievo. Un bancale è un'**unità di carico** con
tre campi in più, chi spedisce lo vede in un elenco che si ordina e su una
mappa che si tinge, lo spunta e il DDT si riempie da sé, con una **packing
list** accanto. E un DDT di **conto terzi** non scarica: sposta la merce nel
vano del terzista, che sta già sulla mappa.

Prima di questo — **la 2.19.0 è costruita e non installata**:
le etichette di merce e unità di carico escono su **Zebra in rete**, e a
parlare alla porta 9100 è il servizio, perché un browser un socket TCP non lo
apre. La stampa su A4 resta dov'era — §8 dice che non si migra, e qui la
regola lavora a favore: la stampante si affianca alla carta. **Le stampanti
hanno la presa di rete e le installa il team IT** (Andrea, 02/09: serie ZD200,
203 dpi, adesive staccate 100 × 80), e le **istruzioni di configurazione sono
scritte in tutti e quattro i documenti che qualcuno legge davvero** — i due
README, la scheda tecnica per l'IT (**rev05**, col nuovo cap. 5.3 e due
richieste nuove al team) e il LEGGIMI del servizio. Voci **84 e 86 chiuse**;
resta la **83**, che vuole la stampante davanti. **In servizio su questa
macchina c'è ancora la 2.17**, installata da Andrea, che porta via il limite di
ritenzione — non cancellava niente e dichiarava un numero che nessuna norma
chiede. Nella stessa giornata
la repository è passata da **4.539 file tracciati a 926** ed è andata in
inglese per il team IT. §0 dice adesso quel che non diceva: **le macchine sono
due**, e il magazzino vero gira ancora la **1.4** altrove.

**Il dump coi PIN è uscito dalla storia di git** (voce 72): `git filter-repo`,
push forzato, `main` riscritto. **Gli SHA di tutti i commit sono cambiati** —
la storia narrativa del 28/08 sta ora a `d78ca62` (era `f4a9578`), il commit
che portò dentro il dump è `194eae5` (era `ecd2538`). **Un vicolo cieco è stato
murato**: l'ultimo Admin poteva togliersi la carica da solo e da lì non si
rientrava. Il registro dei movimenti ha smesso di dire numeri che si
contraddicono (voci 33 e 34), e i due banchi rossi sono verdi (voci 70, 71).
Un difetto grave adesso **tinge di rosso la corsa** del ciclo (voce 50).

**Cos'è Pathfinder.** Applicativo web per un magazzino alimentare in GMP.
Node + Express su rete interna, porta **4173**, database **PostgreSQL 17** in
locale. Più terminali, un solo database, l'arbitro è il server. UNLICENSED,
uso interno.

**Stato: ALFA** (dichiarato da Andrea il 25/08/2026). Fa il suo mestiere e ha
dati veri dentro, ma la superficie si muove ancora. **Non c'è una scadenza**:
le date si scrivono come fatti avvenuti, mai come promesse.

---

## 0. Come si lavora qui

### LE MACCHINE SONO DUE, E CONFONDERLE FA SBAGLIARE TUTTO IL RESTO

**Questa non è la macchina del magazzino.** È la macchina di **sviluppo**, e
serve a produrre la **beta**. Il magazzino vero gira su **un'altra macchina** e
porta la **1.4**.

| | macchina di sviluppo — **questa** | macchina di magazzino |
|---|---|---|
| a cosa serve | costruire e provare, fino alla beta | far lavorare il reparto |
| versione | quella in lavorazione — §1 | **1.4** |
| database | **prove sovrapposte**: caricamenti, reset, versioni che si accavallano | i dati veri |
| chi installa | nessuno: si costruisce e si prova | **Andrea, a mano, a fine turno** |

**Servita vuol dire installata — QUI.** Su questa macchina non c'è un gesto di
«messa in produzione» separato: la versione che risponde a `/api/app-info` **è**
quella installata, e si scrive così. Nessuna riga di questo documento deve dire
«costruita, non installata» di una versione che ha servito. **In magazzino la
regola è l'opposta** — lì installare resta un atto umano, a fine turno, con un
backup fresco davanti, e lo decide Andrea.

**Conseguenza da tenere ferma: i conteggi strani del database di QUESTA
macchina non sono incidenti.** Registro a zero, giacenze che cambiano numero,
operatori che spariscono e tornano: è quel che succede a un banco su cui si
caricano backup, si resetta e si installano versioni diverse in due giorni. **I
backup stanno in archivio**, e le voci 69, 73 e 74 vanno lette così — non come
merce perduta. **Un difetto del CODICE resta un difetto** anche se lo si vede
su questo database: si distingue chiedendo «succederebbe anche con dati
puliti?», e la risposta la dà il banco, non il database vivo.

**E c'è un salto che nessuna voce copriva finora: dalla 1.4 alla beta.** Il
magazzino vero è fermo a una versione che non conosce PostgreSQL, il conto di
produzione, il giro, le unità di carico e le cariche imposte dal servizio.
Portarci sopra i dati veri è **la voce 79**, ed è il lavoro che decide se tutto
il resto serve a qualcosa.

### Poi

1. **Si legge questo file, e basta.** Il [README](README.md) serve a chi
   installa il servizio da zero o diagnostica una macchina.
2. **Il primo comando di ogni conversazione che tocchi la consegna è
   `Invoke-RestMethod http://127.0.0.1:4173/api/app-info`** — e risponde **il
   servizio di questa macchina**, non il magazzino. Quello che risponde batte
   quello che dice questo documento. È successo **quattro volte in cinque
   giorni** che il documento dicesse la versione sbagliata (voci 35 e 48-bis),
   e la quinta è documentata in §1.
3. **Questo file si aggiorna a fine conversazione**, non durante. Chi cambia
   uno stato (installa, chiude un aperto) aggiorna la riga nello stesso gesto.
4. **Installare in magazzino è un atto umano**: a fine turno, con un backup
   fresco davanti, e decide Andrea. Un agente costruisce, prova al banco,
   prepara i comandi.
5. **Codice scarno**: pochi commenti e sul **perché**, mai sul cosa. La
   narrativa sta qui, non nei file.
5-bis. **Le lingue sono due, e non si mescolano.** Questo INDEX, i commenti nel
   codice e `LEGGIMI-pacchetto.txt` (che va in mano a chi installa in
   magazzino) restano **in italiano**. I README della repository sono **in
   inglese**, perché li legge il team IT. Un documento tradotto porta in testa
   il rimando all'altro e, se è fermo, lo dichiara: **due copie che divergono
   in silenzio sono peggio di una copia sola**.
6. **Non si segnalano ritardi di programma.** Il giudizio sull'andamento lo dà
   Andrea.

### Le due cartelle, e non si confondono
| | Cos'è | Chi ci scrive |
|---|---|---|
| `…\Desktop\PROGETTI E CODING\MAPPER\` | **La cartella di lavoro**: sorgenti, collaudi, build, banco, questo documento | chiunque lavori al progetto |
| `C:\Pathfinder\` | **L'installazione**: `servizio\`, `app\`, `data\`, `backup\`. Non è un posto di lavoro | solo `installa-versione.ps1`, `torna-indietro.ps1` e il backup |

> Un agente lavora dentro `MAPPER\` senza chiedere: legge, scrive, costruisce,
> collauda, aggiorna questo documento. **Tutto ciò che tocca `C:\Pathfinder\`,
> il servizio, il database o le attività pianificate si propone e si aspetta il
> via.**

L'installazione di questa macchina è **in prova sul PC di Andrea**: ciò che si
rompe qui non ferma nessuno. Il database però porta dati veri, e per questo un
collaudo si fa sempre su una **copia** — §5.

> **Il 01/09 `C:\Pathfinder\` è stata svuotata e rifatta da zero** — voce
> **74**. Il servizio risponde di nuovo e le ricette di §5 funzionano, ma il
> **database è vuoto**: quello che si legge dall'applicativo non è il
> magazzino, è una casa nuova.

---

## 0-bis. Come non allucinare su questo progetto

Questo documento ha sbagliato più volte proprio sui fatti che sembravano
scontati. Prima di affermare una di queste cose, **si misura**:
| Affermazione | Comando che la stabilisce |
|---|---|
| quale versione è in servizio, con quale impronta | `Invoke-RestMethod http://127.0.0.1:4173/api/app-info` |
| quanti articoli/giacenze/movimenti/operatori ci sono | `Invoke-RestMethod http://127.0.0.1:4173/api/health` |
| quale database sta servendo | la stessa `/api/health`, campo `file` · e la riga che il servizio stampa all'avvio |
| quanti collaudi passano | `npm test` (client) · `node test/collaudo.js` da `server\` |
| quale versione dichiara il codice | `grep -n "VERSIONE\|VERSION" vite.config.js server/pathfinder-server.js src/core/pacchetto.ts package.json` |
| che cosa c'è di non committato | `git status --porcelain` e `git diff --stat --ignore-cr-at-eol` |
| quale valore ha una chiave di `meta` (es. `areaWip`) | dal 2.11 serve una sessione: si guarda dall'applicativo, non con `curl` |

**Tre regole di lettura di questo documento:**

- Una riga che descrive una versione **archiviata o ritirata** descrive il
  passato: non è una funzione disponibile. Le sezioni lo dicono in testa.
- Un numero senza data è un numero vecchio. Dove c'è una data, vale a quella
  data e non a oggi.
- **Le voci della coda (§4) non si rinumerano mai.** Una chiusa resta al suo
  posto, barrata, perché altre righe la citano per numero.

**Punti oggi incerti, e non si dichiarano risolti finché non si guardano:**
la divergenza dei conteggi del database (voce **69**), quale vano sia l'area
WIP (voce **15**), se la voce **19** sia chiusa dalla 2.4 o ancora aperta
(le due righe si contraddicevano dal 26/08 e nessuno l'ha verificata).

---

## 1. Stato, misurato l'08/09/2026 notte

### In servizio

**La 2.29.1, in servizio** — su questa macchina, che è quella
di **sviluppo** (§0): il magazzino vero non è stato toccato, e gira la 1.4
altrove. Misurato da `/api/app-info` e `/api/health`, non ricopiato:

| | |
|---|---|
| applicativo e servizio | **2.29.1** — `versione` e `service_version` dicono lo stesso numero |
| impronta | `b64132daf1a9f7d6e40e44409acdd3f2d5e7f1b5adba7d80a5ee88d771e00c96` |
| byte | **2.168.428** in **8 file**, `costruita 2026-09-08T03:16:34Z` |
| dove | `C:\Pathfinder\app\corrente`, modo `cartella` |
| database | **PostgreSQL 17** — `pathfinder` su `127.0.0.1:5432`, 21 collezioni, `revision 1613` |
| porta chiusa | **sì** — `GET /api/c/meta` senza sessione risponde **401** |
| via di ritorno | `C:\Pathfinder\app\precedente` porta la **2.29.0**, impronta `7b8f6ca0…` |
| dati | 11.197 articoli, **863 giacenze**, 4 siti, 19 zone, **2 operatori**, 15 unità di carico, 7 righe WIP, 37 lotti |

> **QUESTA VOLTA LA RIGA È GIUSTA PERCHÉ È STATA MISURATA DOPO.** Andrea ha
> installato la 2.29.1 l'08/09 e la riga è stata riscritta nello stesso gesto —
> §0 punto 3. Prima diceva «2.22.0» mentre servivano nell'ordine la 2.23, la
> 2.24, la 2.25, la 2.26, la 2.27, la 2.28 e la 2.29.0: **nona volta**, e la
> 2.29.0 era perfino scritta «costruita, non installata» mentre serviva.
> **Quello che risponde batte quello che c'è scritto qui** — §0 punto 2.

**L'impronta è quella del pacchetto committato, e il bundle servito è quello
del pacchetto**: i byte che girano sono quelli provati.

**Cosa c'era prima:** la **2.20.0**, impronta `d10d7830…`, 1.982.683 byte in
4 file, costruita `2026-09-03T15:52:00Z`, in servizio dalle 15:54:46Z. Sta in
`app\precedente` ed è la via di ritorno intera. Prima ancora la 2.19, la 2.18
e la 2.17: quattro versioni che questa sezione non aveva inseguito.

> **LA FINESTRA DI PRIMO AVVIO SI È CHIUSA, ED È LA COSA DA GUARDARE DOPO OGNI
> INSTALLAZIONE PULITA.** Appena installata, con `operators` a zero, il
> servizio rispondeva **200** a `/api/c/meta` senza sessione: non è la 2.11 che
> cede, è `finestraDiPrimoAvvio` che tiene aperto perché qualcuno possa creare
> il primo Admin. **Ma aperto è aperto**, e per qualche ora chiunque fosse
> sulla rete ha potuto parlare con le API. Creato l'Admin, la porta si è
> richiusa da sola. **Su una macchina nuova il primo Admin è il primo gesto**,
> prima di qualunque dato.

**Cosa c'era prima, e resta scritto perché è la misura da cui si è ripartiti:**
**2.13**, impronta `cbe7180250984a557208d0cda860e6b63e0b5772c49a209ae752ac4afc81eb64`,
1.882.735 byte in 4 file, costruita `2026-08-31T17:13:09Z`. `GET /api/c/meta`
senza sessione rispondeva **401**: la porta chiusa della 2.11 ha retto in
produzione fino all'ultimo giorno.

> **LA 2.13 ERA STATA INSTALLATA E QUESTO DOCUMENTO NON LO SAPEVA.** La stesura
> del 31/08 pomeriggio la dichiarava «costruita, non installata» e diceva in
> servizio la 2.12.1; la sera `/api/app-info` rispondeva **2.13**, con
> l'impronta del pacchetto. È stata la **sesta volta** che la riga «in
> servizio» ha sbagliato, ed è per questo che §0 punto 2 esiste: si chiede al
> servizio, sempre.

> **LA VIA DI RITORNO NON C'È PIÙ, e non era stata riletta prima.**
> `C:\Pathfinder\app\precedente` è stata cancellata senza che nessuno avesse
> guardato che cosa contenesse. **Non sono byte persi** — ogni versione si
> ricostruisce dal commit, e la build è riproducibile (§2) — ma è una domanda
> rimasta senza risposta: quale versione ci fosse prima della 2.13. I pacchetti
> stanno in `ARCHIVIO\VERSIONI PRECEDENTI\`.

### La 2.34.0 — costruita, non installata

**IL DDT FA NASCERE IL LAVORO, NON LO FINISCE.** È il lavoro concordato con
Andrea l'08/09 e costruito in cinque tappe (2.30 → 2.34), consegnate insieme
perché la prima da sola non si vede e l'ultima da sola non sta in piedi. Il
verbale lungo sta in `documenti\REP-AUDIT-003 - Audit 2.34.0 del 21-09-2026.md`.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.34.0\` |
| impronta | `467fbdcfcd27b1164f4173e3998374f421085690571a4563874e8660a064fac5` |
| byte | **2.201.169** in **8 file**, `costruita 2026-09-08T15:19:38Z` |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.652 in 68 file** (una saltata) · `npm run check` pulito · 171 + 40 + 100 + 43 + 8 su servizio e banchi, tutti verdi |
| provata | **a video**: registrazione del DDT e nascita dell'attività, percorso costruito dal documento, tappa che sposta invece di scaricare, calendario del mese, cella selezionata in mappa |
| **PRIMA DI INSTALLARE** | **la zona di imballaggio va marcata**, una per sito, in Configurazione → Siti e Zone. Senza, una preparazione non ha dove finire e il prodotto finito torna al giro in due tempi |

**LE CINQUE TAPPE, E PERCHÉ IN QUEST'ORDINE.**

**2.30 — le fondamenta.** `startPickSession` faceva `clear` e poi `put`:
avviare un percorso chiudeva quello di chiunque altro, in silenzio. Reggeva
finché il prelievo nasceva da un file caricato a mano da una persona sola;
con le attività prese in carico da persone diverse quel gesto cancella il
lavoro del collega. `pick_session` è un elenco, e a dire quale sia «la mia» è
`modules/sessioni.ts`. Da lì è nata una distinzione che prima non serviva:
**`operator` è chi preleva, `owner` è chi ha aperto** — il primo è
modificabile, e cercare la propria sessione per quello vorrebbe dire che un
Team Leader che intesta un giro a un altro non lo ritrova più. Più
`pack_zone`, una per sito, e la quarantena che non aspetta il suo turno.

**2.31 — preparazione spedizioni.** Una tappa di preparazione **SPOSTA, non
scarica**, e non è una variante di comodo: un DDT pendente prenota la merce e
a scaricarla è l'evasione — scaricare anche al prelievo vorrebbe dire
scaricarla due volte, e la seconda troverebbe il vano vuoto. Una tappa di
unità di carico si conferma con **una scansione sola**: su un pallet
imballato articolo e lotto stanno sotto il cellophane. `PREP_SHIP` sostituisce
`PICK_SHIP` e `PICK_RET`, che restano **dichiarati** perché l'archivio li
porta.

**2.32 — prelievo ODP.** La distinta si allega alla richiesta e vive sul
servizio: un ODP grande è centinaia di kilobyte, e `tasks` si rilegge a ogni
caricamento della coda da ogni terminale. E non si conservano le righe già
lette, che sarebbe più semplice: quando qualcosa non torna la domanda è «che
cosa c'era scritto nel file», e le righe lette sono già un'interpretazione.

**2.33 — l'unità di carico diventa contestuale.** L'etichetta del bancale
**dichiarava il falso**: nasceva senza merce, quindi `riepiloga` leggeva zero
partite e stampava «LOTTI MULTIPLI — 0 partite» su un pallet che ne portava
una sola. Adesso nasce in zona imballaggio con la merce sopra. L'ubicazione
resta fuori dall'etichetta — §8: quel che mancava non era il vano. La tessera
esce da Movimenta e l'elenco entra in Archivio.

**2.34 — calendario e mappa.** Il calendario sta sulla data di ritiro
previsto, che è il dato su cui il cruscotto calcola già i suoi avvisi, e ne
usa i colori. L'evidenziazione della cella era un bordo di due pixel in una
griglia dove ogni cella ha già un bordo colorato dal suo stato.

**SEI DIFETTI TROVATI LUNGO LA STRADA, E NESSUNO RILEGGENDO IL CODICE A
TAVOLINO.** `loc-cell--flash` senza CSS (ventiquattro versioni); `modo: 'move'`
che non è un modo; `causale_label` scritto dalla 1.8 e mai dichiarato; due
movimenti invece di uno alla prima preparazione; l'etichetta che diceva zero
partite; `Udc.status: 'closed'` dichiarato e mai scritto. I primi cinque
corretti, il sesto è la voce **102**.

### La 2.30.0 — costruita, non installata

**Le fondamenta su cui poggia tutto il resto.** Prima versione del lavoro
concordato l'08/09: la coda delle attività diventa il posto da cui nasce il
prelievo, e per farlo servono tre cose che prima non c'erano. Nessuna
migrazione — i campi nuovi sono facoltativi e un record vecchio si rilegge.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.30.0\` |
| impronta | `b98104cee7a166caa6e100dcb3360c184bdef3bbe88d0cab38aadd6ac4d0078c` |
| byte | **2.171.289** in **8 file**, `costruita 2026-09-08T10:14:00Z` |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.550 in 61 file** (una saltata) · `npm run check` pulito · 156 + 8 + 43 + 100 + 40 su servizio e banchi, tutti verdi |
| cosa resta fuori | il flusso vero: la 2.30 non cambia nessuna maschera operativa. Le sessioni multiple esistono ma nessuno ne apre due finché non arriva la 2.31 |

**LE SESSIONI DI PRELIEVO NON SONO PIÙ UNA SOLA.** `startPickSession` faceva
`clear` e poi `put`: avviare un percorso chiudeva quello di chiunque altro,
in silenzio. Reggeva finché il prelievo nasceva da un file caricato a mano da
una persona sola; con le attività prese in carico da persone diverse, quel
gesto cancella il lavoro del collega. Adesso `pick_session` è un elenco, e a
dire quale sia «la mia» è **`modules/sessioni.ts`**, che è puro.

**CHI PRELEVA E CHI HA APERTO SONO DUE COSE, e la distinzione è nata qui.**
`operator` è modificabile nella maschera — un Team Leader avvia un giro e lo
intesta a un altro, e quella sigla va sulle righe di registro. Se la propria
sessione si cercasse per `operator`, chi l'ha aperta non la ritroverebbe più
dopo un ricaricamento. Quindi la sessione porta anche **`owner`**, che è
l'identità del terminale, e si cerca per quello. Una sessione scritta prima
della 2.30 `owner` non ce l'ha: il ripiego su `operator` regge
l'aggiornamento fatto a percorso aperto.

**LA ZONA DI IMBALLAGGIO — `pack_zone`.** Terza bandierina di zona dopo
prodotto finito e baia, e l'unica di cui **ne serve una per sito**: è dove un
prelievo di spedizione finisce, cioè dove la merce raccolta diventa un'unità
di carico. **Lo spazio non si conta**: il banco è piccolo davvero, ma il
limite lo governa a vista chi ci lavora — un vincolo che si scavalca è
peggio di nessun vincolo. `sitiSenzaImballo` dice **quale** sito è scoperto,
non che ne manca uno.

**LA QUARANTENA NON ASPETTA IL SUO TURNO.** Una richiesta di blocco esce
sempre alla massima urgenza. Sta in `prioritaEffettiva` e **non nel record**,
che è la stessa ragione della scadenza: scrivere `priority: 4` alla creazione
farebbe dire a quel compito, fra un mese, un'urgenza che nessuno ha chiesto,
e la decisione D4 — «la priorità la alza solo il Team Leader» — diventerebbe
«solo il Team Leader, e il sistema».

**LE PROVE NUOVE SONO 27 + 10 + 13**, e tutte e tre le famiglie sono state
verificate rimettendo il difetto: `test/sessioni.test.js` (chi è la mia
sessione, con nove modi di farle restituire quella sbagliata), le prove sulla
quarantena in `test/compiti.test.js`, quelle sulla zona di imballaggio in
`test/bancale.test.js`.

### La 2.29.2 — costruita, non installata

**Quattro strade per cui un’icona esce come testo, e la quarta si vedeva su
undicimila righe.** Trovata da Andrea a video l’08/09, nella scheda Archivio.
Nessun campo nuovo a database, nessuna migrazione, il servizio non è stato
toccato.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.29.2\` |
| impronta | `8ef4cd2ebaa0343126134453734376daa7a49568fca53a398dc7f6f0a3180482` |
| byte | **2.168.868** in **8 file**, `costruita 2026-09-08T06:49:18Z` |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.501 in 59 file** (una saltata) · `npm run check` pulito · 156 + 8 + 43 + 100 + 40 sul servizio e sui banchi, tutti verdi |
| provata | **a video, 34 schermate**: tutte le viste, tutte le sottoschede di Movimenta, tutte e undici le schede di Configurazione. Zero markup a video, e le 22.402 icone dell’anagrafica adesso sono elementi `svg.ico` nel DOM, non stringhe |

**LE DUE STRADE NUOVE.** La 2.29 ne aveva chiuse due — `toast`, che scrive con
`textContent`, e l’interno di un `<option>`, che il parser butta via. Ne
restavano due, e nessuna delle due prove le vedeva.

1. **UNA STRINGA COSTRUITA CON `_ico()` CHE POI PASSA DA `_esc()`.** In
   `archivio.ts` il campo `sub` di ogni riga si disegna con `_esc(r.sub)`, e
   due produttori ci mettevano dentro un’icona: **ogni Cartello NC**
   dell’archivio mostrava `<svg class="ico" aria-hidden="true"...` per esteso.
   **Il rimedio non è togliere `_esc`**: `sub` porta ubicazione, motivo e
   operatore, cioè testo che arriva dal database, e costruirlo già scappato
   vorrebbe dire che ogni produttore si ricorda di scappare i suoi pezzi. Fuori
   l’icona: il genere ce l’ha già, nella colonna Tipo.
2. **UN’ICONA PASSATA COME FIGLIO A `_h`**, il costruttore di nodi di
   `core/utils.ts`. Un figlio stringa lo aggiunge con `createTextNode` — ed è
   esattamente quel che deve fare, perché di lì passano descrizioni di
   articolo e motivi di quarantena. **Su Configurazione → Anagrafica Articoli
   il difetto stava su tutte e 11.181 le righe**, due volte per riga: i
   pulsanti Modifica ed Elimina mostravano il loro `<svg>` scritto. Lo stesso
   sul pulsante di stampa del registro. Il rimedio è **`icoNodo`** in
   `ui/icone.ts`, che l’icona la costruisce come NODO — e un nodo `_h` lo
   aggiunge come nodo. `createElementNS` e non `createElement`: un `<svg>`
   costruito nel namespace HTML sta nell’albero e non si disegna, che è lo
   stesso difetto con un aspetto diverso.

**LE DUE PROVE NUOVE MORDONO**, ed è stato verificato rimettendo i difetti:
la prima raccoglie i nomi il cui letterale di modello contiene `_ico(` e cerca
`_esc(quel nome)` nello stesso file; la seconda cerca `_ico(` come primo
elemento di un elenco di figli. Nominano file, riga e campo.
### La 2.29.1 — superata dalla 2.29.2, ed è la via di ritorno

**L'audit dell'08/09**: cinque difetti trovati provando a rompere, cinque
corretti, ognuno con la prova che lo riprende. Nessun campo nuovo a database,
nessuna migrazione. Il verbale lungo sta in
`documenti\REP-AUDIT-002 - Audit 2.29.1 del 08-09-2026.md`; qui il minimo.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.29.1\` |
| impronta | `b64132daf1a9f7d6e40e44409acdd3f2d5e7f1b5adba7d80a5ee88d771e00c96` |
| byte | **2.168.428** in **8 file**, `costruita 2026-09-08T03:02:33Z` |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.499 in 59 file** (una saltata) · `npm run check` pulito · e i banchi del servizio TORNANO A GIRARE: 156 + 8 + 43 + 100 + 40, tutti verdi |
| provata | **al banco e a video**, su copia usa-e-getta di `pristino.db`: primo accesso, cruscotto e scorciatoie, prelievo automatico coi due `.xlsx` veri, esclusione del vano WIP. Poi installata in `banco\app` e servita: `/api/app-info` risponde `2.29.1` con l'impronta del pacchetto |
| cosa resta fuori | la corsia vera con un operatore; la Zebra con la carta montata (voci 83 e 89); il numero di pagina del DDT su carta (voce 97); la maschera a 480 px di questa versione |
| installata | **sì**, l'08/09, da Andrea. `/api/app-info` risponde `2.29.1`, impronta `b64132da…`, che è quella del pacchetto. `GET /api/c/meta` senza sessione risponde **401**: la porta è chiusa. `app\precedente` porta la **2.29.0**, impronta `7b8f6ca0…`, ed è la via di ritorno intera. Il database non è stato toccato: `revision 1613`, 11.197 articoli, 863 giacenze, gli stessi conteggi di prima |

**I CINQUE, IN UNA RIGA CIASCUNO.**

1. **L'ambiente di macchina entrava nei banchi.** Le due `PATHFINDER_TLS_*`
   stanno a livello MACCHINA e sono arrivate con la 2.26, dentro file scritti
   quando non esistevano: il banco partiva in HTTPS, le prove parlavano in
   chiaro sulla stessa porta, incassavano il `301` e `fetch` degradava ogni POST
   a GET. **Non falliva: rispondeva.** 28 rosse su `collaudo.js`, 36 su 40 su
   `gerarchia.cjs`, con tre «VICOLO CIECO» e un «LA PORTA È RESTATA APERTA»
   tutti falsi. E `banco\prova-corrente.cjs` ereditava anche `PATHFINDER_PG`,
   che VINCE su `PATHFINDER_DB`: apriva il magazzino vero dichiarando in testata
   di non toccarlo. È l'incidente del 26/08, lasciato aperto. Corretto con
   `scollegaTls` in `lib/tls.js` e con **`banco\servizio-banco.mjs`**, che
   toglie la ricetta a mano — §5.
2. **Una prova ferma alla 2.13**, rossa dalla 2.18 e invisibile sotto il rosso
   di sopra: pretendeva `rec_set` da `/api/auth/operatori`, che la 2.18 aveva
   tolto di proposito. Girata dalla parte giusta.
3. **Il primo Admin si creava e lo schermo diceva di no.** `addOperator`
   finiva con `_touchMeta`, ma la scrittura dell'operatore col PIN è il gesto
   che CHIUDE la finestra di primo avvio: la riga dopo prendeva 401, la
   funzione lanciava, e `Auth.accedi` non veniva mai eseguita. Wizard aperto,
   «Sessione non valida», e l'Admin a database col PIN appena scelto.
   Adesso la sessione si prende **fra** le due scritture.
4. **Due schede del cruscotto dicevano F3, e F3 non faceva né l'una né
   l'altra**: apriva il prelievo sull'ULTIMA scheda usata. E F4, F6, F7, F8
   esistevano senza che nessuna scheda lo dicesse. Erano due elenchi della
   stessa cosa; adesso è uno, `TASTI_FUNZIONE` in `modules/cruscotto.ts`, e la
   scheda gli chiede il suo tasto.
5. **L'avviso del percorso ripeteva la stessa frase** una volta per riga di
   giacenza invece che per vano e motivo. Quattro righe nello stesso vano WIP
   davano quattro volte «Già in reparto produzione». Deduplicato per
   `(vano, motivo)` — due vani diversi restano due note.

### La 2.29.0 — superata dalla 2.29.1, ed è la via di ritorno

> **HA SERVITO MENTRE QUESTO DOCUMENTO LA DICEVA «COSTRUITA, NON INSTALLATA»,
> ED È LA NONA VOLTA.** `/api/app-info` rispondeva `2.29.0`, impronta
> `7b8f6ca0…`, che è quella del pacchetto — misurato l'08/09 alle 02:15.
> Adesso sta in `C:\Pathfinder\app\precedente` ed **è la via di ritorno
> intera**: `torna-indietro.ps1` la rimette al suo posto senza toccare il
> database. Il pacchetto sta in `ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.29.0\`.
> **Quello che risponde batte quello che c'è scritto qui** — §0 punto 2.


**Quello che è già in reparto non si va a prendere, e dal vano di lavorazione
non si preleva.** Nessun campo nuovo a database, nessuna migrazione, il
servizio non è stato toccato.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.29.0\` |
| impronta | `7b8f6ca0625badd50429c47a13ded368233e06e91c78ec561accaae84db21f4d` |
| byte | **2.168.081** in **8 file**, `costruita 2026-09-07T23:51:47Z` |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.464 in 56 file** (una saltata) · `tsc --noEmit` pulito |
| provata | **al banco e sui file veri.** Le due funzioni pure hanno **31** prove, fra cui **quattordici** scritte per romperle; `build` si prova con uno Store finto; il riquadro si prova leggendo la stringa che disegna. Sui `.xlsx` veri di `banco\odp-wip\`, letti col parser vero: 20 KG scesi per ODP9611 coprono la domanda di ODP9611 e, visti da ODP9620, sono `altrui: 20` su `ordini_altrui: ['ODP9611']` |
| cosa resta fuori | la corsia vera, con un operatore, un terminale e un ordine sceso a metà |

### La 2.28.0 — IN SERVIZIO su questa macchina

**Ogni foglio ha la sua testata e la sua coda.** Nessun campo nuovo a database,
nessuna migrazione, il servizio non è stato toccato.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.28.0\` |
| impronta | `c722f7da5a95e6354fe9c4e2b9c3b7f13402001501bc03fecdef1d7bbecca86e` |
| byte | **2.162.684** in **8 file**, `costruita 2026-09-07T23:08:10Z` |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.417 in 54 file** (una saltata) · `npm run check` pulito |
| provata | **su carta e in servizio.** Il banco `impaginazione` non ha pagine e non può dire niente sulla coda: si stampa in PDF con Edge senza finestra e si leggono le quote foglio per foglio. DDT da 40 partite: 4 pagine, coda alla stessa quota su tutte. Il primo DDT stampato dopo l'installazione porta le stesse quote |
| installata | **sì**, l'08/09. `/api/app-info` risponde `2.28.0`, impronta `c722f7da…`, che è quella del pacchetto |

### La 2.27.0 — costruita, non installata, **superata dalla 2.28.0**

**Il piede sta in fondo al foglio, il testo dei documenti scende del 10%, il
campione si pesa in KG o in GR, e due campi di ricerca tornano a cercare.**
Nessun campo nuovo a database, nessuna migrazione, il servizio non è stato
toccato.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.27.0\` |
| impronta | `1486602a13662ed0f2d3b70214cb9721d597272d19012c1c32caa6a3efaa4c60` |
| byte | **2.162.320** in **8 file**, `costruita 2026-09-07T17:51:01Z` |
| riproducibile | **sì, verificata**: due build di fila danno la stessa impronta |
| archiviata | **non ancora** |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.417 in 54 file** (una saltata) · `npm run check` pulito |
| provata | **su carta, non solo da ferma.** Il piede non si può misurare a video — il banco `impaginazione` non ha pagine, non ha `@page` e non ripete niente — quindi si è stampato in PDF con Edge senza finestra (`--headless --print-to-pdf`) e si sono lette le quote del testo foglio per foglio. Su un DDT da 90 partite: **8 pagine** dove la 2.26 ne faceva **9**, piede a **13,1 mm** dal bordo inferiore su **tutte e otto**, ultima compresa (dove il contenuto finisce a 105 mm), contenuto mai sotto **26,6 mm** contro una banda che arriva a 22, numero di pagina a 4,9 mm su ogni foglio. Su un documento che scorre ma sta in un foglio solo: piede in fondo lo stesso. Il verbale a pagina sola: una pagina, invariato nella struttura. Il controllo è stato fatto **anche al contrario** — stesso foglio, sola regola del piede riportata a com'era — e lì il piede sull'ultima pagina risale a metà foglio |
| installata | **no.** §0: installare è un atto umano |

> **LA PROVA SU CARTA NON È AUTOMATICA, E VA DETTO.** Le prove di
> `test/stampa.test.js` guardano le stringhe del CSS: sorvegliano che la banda
> non si sfasci, non che il piede esca in fondo. Quella la dice solo una stampa,
> e la stampa la si è fatta a mano — con uno strumento usa e getta, fuori dal
> repo. Se un giorno il piede sparisse dalle pagine 2..N (Firefox dipinge gli
> elementi `fixed` solo sul primo foglio: il bersaglio dichiarato è
> **Chrome/Edge**, e la filigrana ha lo stesso limite dalla 2.1), lo si vede
> stampando, non lanciando `npm test`.

### La 2.26.0 — costruita, non installata, **superata dalla 2.27.0**

**Il servizio parla HTTPS.** Certificato creato dagli strumenti di Windows —
autorità locale più certificato del servizio firmato da lei — porta sempre la
**4173**, e chi arriva in chiaro su quella porta riceve un `301` invece di un
errore di protocollo. Il chiosco della 2.25 diventa installabile appena
l'autorità è sui terminali. Nessun campo nuovo a database, nessuna migrazione.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.26.0\` |
| impronta | `05880f1528669358ff9866b6793c7ab68324640e16a86ef4280f36360a2e64d0` |
| byte | **2.160.022** in **8 file**, `costruita 2026-09-05T00:18:40Z` |
| riproducibile | **sì, verificata**: due build di fila danno la stessa impronta |
| archiviata | **non ancora** |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.408 in 54 file** (una saltata) · `npm run check` pulito · i tre `.ps1` toccati passano il parser di PowerShell |
| provata | **a caldo, non solo da ferma**: certificato di prova in `Cert:\CurrentUser\My`, servizio avviato sulla 4499 col PFX. `https://` risponde `200` sull'applicativo, sul manifesto del chiosco (`application/manifest+json`) e su `/api/app-info`; `http://` sulla **stessa porta** risponde `301` con `Location: https://127.0.0.1:4499/…`, host e porta conservati, e `curl -L` arriva alla pagina in un salto. Riuso della connessione TLS verificato |
| installata | **no.** §0: installare è un atto umano |

> **QUEL CHE RESTA È UMANO, E VA FATTO PRIMA DI DIRE CHE IL CHIOSCO
> FUNZIONA.** `crea-certificato.ps1` va lanciato **come amministratore sulla
> macchina che serve** — scrive in `Cert:\LocalMachine\My`, e l'archivio
> dell'utente il servizio che gira come SYSTEM non lo vede — e poi
> `C:\Pathfinder\tls\pathfinder-ca.cer` va installato **come autorità** su ogni
> terminale: Android lo chiede sotto «Certificato CA», Windows sotto «Autorità
> di certificazione radice attendibili», iPad vuole in più il passaggio in
> Generali → Info → Attendibilità certificati. Finché quel giro non è fatto il
> browser mostra l'avviso rosso e **non installa il chiosco**: è il browser che
> rifiuta. Lo script stampa l'impronta SHA-256 del file da confrontare prima di
> fidarsi — un `.cer` che arriva da un'altra parte è un'autorità che firma
> qualunque cosa.

> **LA SCHEDA TECNICA VA AGGIORNATA.** REP-IT-001 rev. 05 dichiara «TCP 4173»
> e non dice lo schema. La porta non cambia — è tutto il senso di averlo fatto
> sulla stessa — ma quel che ci viaggia sopra sì: da qui è TLS, e il PIN
> dell'operatore smette di essere leggibile sulla rete di reparto. Va scritto
> nella prossima revisione, insieme al certificato da distribuire.

### La 2.25.0 — costruita, non installata

**L'interfaccia sta dentro lo schermo, e l'applicativo si installa.** Tre
difetti chiusi su quel che l'operatore vede da un telefono o da una tavoletta —
il telaio più largo dello schermo, le undici linguette di Configurazione
tagliate, lo zoom vietato — e la **modalità chiosco**: un manifesto web che
trasforma la pagina in un'applicazione con la sua icona. Nessun campo nuovo a
database, nessuna migrazione, niente che scriva.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.25.0\` |
| impronta | `9b2fecb6b6cb5ac93a255490f4664b61bcfbcdbe2a7a2af99e0384dfcb61ef45` |
| byte | **2.160.022** in **8 file**, `costruita 2026-09-04T21:46:04Z` |
| perché 8 e non 4 | entrano nel pacchetto il manifesto del chiosco e le **tre icone** — 192, 512 e la `maskable` che Android ritaglia senza mangiare il marchio. Stanno in `public/assets/`, cioè finiscono in `app/assets/`, che è **la sola cartella che il servizio pubblica** (`/assets/:file`) |
| riproducibile | **sì, verificata**: due build di fila danno la stessa impronta |
| archiviata | **non ancora** |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.399 in 53 file** (una saltata) · `npm run check` pulito su client e servizio · il **banco a video non è stato rilanciato**: quel che è cambiato qui è CSS di telaio, e il rilievo dello stile confronta con una finestra di misura diversa — va rifatto prima di installare |
| provata | a mano, nel browser, su **375 · 480 · 768 · 800 · 820 · 1024 · 1180 · 1366 px**: `document.body.scrollWidth` uguale a `innerWidth` su tutte, testata e sesta linguetta dentro il bordo, le undici linguette di Configurazione tutte visibili su due righe |
| installata | **no.** §0: installare è un atto umano |

> **IL CHIOSCO VUOLE HTTPS, E OGGI IL SERVIZIO PARLA IN CHIARO.** Il manifesto
> c'è, le icone ci sono, la scheda in Configurazione → Sessione c'è: ma
> `beforeinstallprompt` **non arriverà mai** su `http://<ip>:4173`, perché
> nessun browser installa una pagina servita in chiaro. Su Android si potrà
> comunque aggiungere un collegamento alla schermata Home, e resterà un
> collegamento — si apre nel browser, con la barra dell'indirizzo. Perché
> diventi un'applicazione vera serve **HTTPS sulla macchina che serve
> Pathfinder**, ed è una decisione di rete, non di codice. Fino ad allora lo
> stato che si legge è `non-sicuro`, e dice esattamente questo.
>
> **RISOLTO DALLA 2.26**, che fa il certificato con gli strumenti di Windows e
> lascia la porta dov'è. Resta il gesto umano: l'autorità va installata sui
> terminali, uno per uno.

### La 2.24.0 — costruita, non installata

**I due fogli che escono dal magazzino, rifatti.** Il DDT dice **cosa c'è sul
camion** in sei colonne — articolo, lotto, scadenza, colli, quantità e unità,
queste ultime in due celle separate — e la packing list dice **com'è fatto**,
per articolo → lotto → bancale, tre livelli di riga e ognuno col suo totale.
Sotto, tre difetti che stavano lì da mesi: la colonna della quantità in 13 mm
con `nowrap`, che tagliava «1.250,00 KG»; il DDT che usciva su due fogli e
mandava il secondo **senza testata e a filo carta**; le tre firme della packing
list **senza etichetta**, passate come coppie dove il codice legge oggetti.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.24.0\` |
| impronta | `39c2ecced9f0d9822ccff8ad54da1a1a700b5825c143050637fc7a80c5ee8bcc` |
| byte | **2.085.939** in **4 file**, `costruita 2026-09-04T17:27:31Z` |
| riproducibile | **sì, verificata**: **tre** build di fila danno la stessa impronta |
| archiviata | `ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.24.0\` — pacchetto intero, installer compreso |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.389 in 52 file** (una saltata) · banco a video **364 su 368**, e i quattro rossi non sono difetti: tre sono `rilievoStile`, che confronta col rilievo preso a **1542×914** mentre la finestra qui era **1006×913** — sono larghezze e `transform-origin` di `.card` e `.kpi-card`, nessuna classe di stampa — e il quarto è `impianto`, rosso perché la sessione era già aperta a mano; da pagina appena ricaricata dà **14 su 14** · `servizio\test\collaudo-installazione.js` girato **dentro** il pacchetto: **43 su 43** |
| cosa cambia dalla 2.23.0 | **due viste, un modulo puro, un blocco di CSS e il banco**: `distintaPerArticolo` in `modules/documenti.ts`, i fogli di `spedizioni.ts` separati dalla stampa, le firme fuori dal piede ripetuto in `smaltimento.ts` (vale per **tutti e quattro** i documenti che scorrono), `@page { margin: 12mm }`. Nessun campo nuovo a database, nessuna migrazione, niente che scriva |
| installata | **no.** §0: installare è un atto umano |

> ⚠️ **`consegna\Pathfinder 2.23.0\` È STATA SOVRASCRITTA, ED È LA TRAPPOLA
> DEL 19/08 DI §7 PAGATA UNA SECONDA VOLTA.** Le build di verifica di questo
> lavoro sono partite col numero ancora fermo a `2.23.0`. **Non si è perso
> niente** — il pacchetto intero sta in `ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder
> 2.23.0\` e il suo manifesto porta ancora `f9d4e012…`, l'impronta dichiarata —
> ma la regola resta quella: **il numero si alza prima di costruire**, e prima
> di una build di verifica si copia il pacchetto che aspetta un'installazione.
> Questa volta l'archivio ha fatto da rete; la volta della 2.21.1 non c'era.

**IL NUMERO DI PAGINA È L'UNICA COSA CHE NON È STATA MISURATA.** `@page` chiede
`counter(page)` e `counter(pages)` in una *page margin box*, che è l'unico
posto da cui ci si arriva: il banco prende le regole da `@media print` e quelle
stanno **dentro** `@page`, quindi non le vede. Dove il browser non le sostiene
non esce niente e non si rompe niente — e per questo il conto delle righe sta
**anche** nel piede ripetuto, che funziona ovunque. **Si guarda con
un'anteprima di stampa**, e finché non lo si è guardato questa riga dice che
non lo si sa.

### La 2.23.0 — in servizio su questa macchina

**Il banco a video, e due difetti che nessuna prova poteva vedere.** Le prove
di questo progetto passavano tutte da `fetch`: forti su quel che il magazzino
calcola, cieche su quel che l'operatore legge. Adesso c'è un banco che guarda
lo schermo — quindici flussi, 355 controlli — e ha trovato due cose vere.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.23.0\` |
| impronta | `f9d4e0121b73390b896ff72fa735864d81e36e0f9190f9dd5f2f9b33dda2a17f` |
| byte | **2.082.616** in **4 file**, `costruita 2026-09-04T16:13:20Z` |
| riproducibile | **sì, verificata**: **tre** build di fila danno la stessa impronta — cambia solo `costruita`, che è un’ora e non un byte servito |
| archiviata | `ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.23.0\` — pacchetto intero, installer compreso |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.375 in 52 file** (una saltata) · banco del ciclo **47 su 47** · banco a video **355 su 355** · `servizio\test\collaudo-installazione.js` girato **dentro** il pacchetto: **43 su 43** |
| cosa cambia dalla 2.22.0 | cinque rotte del servizio normalizzano i codici che arrivano nel corpo; una serratura sulla maschera di posizionamento; il resto è banco, che non entra nel pacchetto |
| database | nessun campo nuovo, nessuna migrazione |
| **installata** | **sì, su QUESTA macchina** — `/api/app-info` risponde `2.23.0` con l'impronta `f9d4e012…`, e `C:\Pathfinder\app\corrente` porta quella. Misurato il **04/09 sera**; la riga diceva «no», e diceva male — vedi l'avviso in testa a §1 |

**I DUE DIFETTI, e come sono venuti fuori.**

**① Una riga con la chiave non maiuscola non si poteva più toccare.** Il
servizio maiuscola i codici in due punti — dentro un record prima di
salvarlo, e in fondo a un percorso prima di cercare la riga. Un codice che
arriva nel **corpo** di una POST non passava da nessuno dei due, e le rotte
operative cercano la riga con `===`: `123456#qwert` non trova
`123456#QWERT`. Bastava una riga scritta prima che la normalizzazione
esistesse — in `pristino.db` ce n'è una — e da quel momento quella merce non
si poteva più né prelevare, né smaltire, né campionare. L'applicativo
rispondeva **«123456#qwert non è più in MAG-ACC-03»** di una riga che stava
lì: la frase peggiore, perché manda a cercare a scaffale una cosa che è al
suo posto. Corretto in `pathfinder-server.js` con `codiceDalCorpo()`, che
riusa `normalizzaCampo` — la stessa funzione, non una copia — e con
`rigaConChiave()`, che guarda i due lati con lo stesso metro perché un
database mai riscritto da questa versione tiene ancora la chiave com'era.

**② La maschera di posizionamento restava scrivibile mentre la scrittura era
in volo.** Fra il momento in cui la riga entra in giacenza e quello in cui i
campi si azzerano passano due scritture — il movimento nel registro e, sul
bancale, l'assegnazione all'unità. Misurato su questa macchina, col database
sul disco accanto: **uno-tre secondi**; sul terminale, con la rete del
magazzino in mezzo, di più. In quei secondi il lettore — che è più veloce di
una persona — attaccava il codice successivo a quello di prima: `6000366`
più `7000924` diventava `60003667000924`, e un istante dopo spariva,
azzerato dal posizionamento che finiva. Chi lavora non ha modo di capirlo:
rilegge, e il magazzino perde una scansione buona ogni volta che due merci
si susseguono in fretta. Poteva andare peggio del nulla: il lettore chiude
la lettura con un Invio, e su quella maschera l'Invio avanza di campo fino a
chiamare il posizionamento — il codice fuso arrivava alla validazione, che
non lo trova in anagrafica e **apre il pannello chiedendo una descrizione**.
Da lì a battezzare un articolo che non esiste c'è un tasto. Adesso la
maschera si chiude per la durata della scrittura e lo dice; il `finally` la
riapre comunque, anche se la scrittura finisce male, perché una maschera che
resta chiusa dopo un errore è un terminale morto.

**IL BANCO A VIDEO** sta in `banco/video/` e non entra nel pacchetto.
`node banco/video/accendi.cjs` accende un servizio sulla **4199** con una
copia usa e getta di `pristino.db` — i dati veri sulla 4173 non si toccano —
serve l'applicativo costruito dalla stessa porta e stampa la riga da
incollare nella console del browser. Ogni prova guarda tre cose insieme: quel
che l'operatore **vede**, il **conto** rifatto a parte, e quel che è finito
**a database**, riletto dal servizio.

I quindici flussi: `impianto` (collauda il banco, non l'applicativo),
`cruscotto`, `smaltimento`, `unitaDiCarico`, `chiaviNonMaiuscole`,
`inventario`, `cambioUbicazione`, `quarantena`, `posiziona`, `impaginazione`,
`contiDeiDocumenti`, `configZone`, `prodottoFinito`, `caricoSpedizione`,
`percorso`.

Due meritano una riga. **`impaginazione`** misura i documenti che escono in
stampa senza stamparli: prende le regole di `@media print` da
`document.styleSheets` — dove il browser le ha già lette — le rimette come
regole normali, porta il foglio all'**area stampabile** (186mm: A4 meno i due
margini di 12mm) e cerca testo sopra altro testo e testo fuori dal margine.

> **DALLA 2.24 I FOGLI SONO NOVE, E I DUE NUOVI SONO QUELLI CHE CONTANO.** I
> sette escono dai documenti che stanno a database, e nella copia di prova un
> DDT ha **una riga**: sono fogli che non hanno niente da impaginare, e la
> prova passava verde su tutti mentre il caso che rompe un documento non era
> mai stato misurato. Adesso il banco compone anche un **carico pieno** —
> dieci partite su ventisei bancali, due unità di misura che non si sommano,
> descrizioni lunghe, note di riga — e ne misura DDT e packing list **senza
> scrivere niente a database**: dalla 2.24 il foglio è una funzione del
> documento. Con la colonna della quantità rimessa a 13mm il banco nomina
> **ventidue** valori che uscirebbero tagliati, dove sul DDT da una riga ne
> nominava tre. **389 elementi, nessuna sovrapposizione.**
**`contiDeiDocumenti`** rifà i conti di **tutti** i DDT: numero colli come
somma delle righe, quantità **per unità di misura** — mai una cifra sola per
unità diverse — una riga in bolla per partita e non per bancale, e il peso
lordo che **resta vuoto** dove non si può fare.

> **UN BANCO CHE NON MORDE NON SERVE.** Ogni prova nuova è stata verificata
> iniettando il difetto che deve trovare: il saldo sbagliato nel riepilogo
> dello smaltimento, un collo in più nel totale del DDT, il piede del
> documento spostato di 60px. Tutte e tre le volte il banco ha detto quale
> riga, con che numero. Per iniettare un difetto **non basta cambiare il
> bundle**: accanto a ogni file la consegna ne porta uno `.gz`, e il servizio
> serve quello a chi capisce gzip — cioè a ogni browser. Sta scritto in
> `accendi.cjs`.

> **DUE ZONE NUOVE NEL DATABASE DI PROVA, e solo lì.** Il prodotto finito
> vuole una zona marcata, il carico delle spedizioni vuole una baia, e
> `pristino.db` non ne ha: il flusso `configZone` le **crea dalla maschera**,
> non scrivendo nel database. Non si riusa quel che c'è — marcare «baia di
> carico» la zona degli arrivi avrebbe fatto passare la prova lasciando una
> bugia dentro il magazzino di prova.

### La 2.22.0 — in servizio dal 03/09

> **ERA SCRITTA «costruita, non installata», E INVECE ERA INSTALLATA.**
> Vedi il riquadro qui sopra: è l’ottava volta che questa parte del
> documento resta indietro rispetto al servizio.

**La campata della tappa.** La scheda del prelievo dice il codice del vano;
adesso dice anche **a che altezza sta**, disegnando la campata di fronte.

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.22.0\` |
| impronta | `c5d97b1526eff6eee230c68f1108b7bc59371f2947514a5e34fc98a53ace4d29` |
| byte | **2.033.787** in **4 file**, `costruita 2026-09-03T21:47:21Z` |
| riproducibile | **sì, verificata**: tre build di fila danno la stessa impronta |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi | **1.355 in 50 file** (una saltata) · `servizio\test\collaudo-installazione.js` girato **dentro** il pacchetto: **43 su 43**; il servizio del pacchetto dichiara `2.22.0` |
| cosa cambia dalla 2.21.1 | **un modulo puro nuovo** (`modules/colonna.ts`), tre metodi e una costante in `percorso.ts`, un blocco di CSS. Nessuna regola nuova, nessun campo nuovo a database, nessuna migrazione, niente che scriva |
| installata | **sì** — misurata da `/api/app-info` il 04/09 |

> **PORTA ANCHE LA 2.21.1**, che non è mai stata installata: la riga `UDC` del
> carico spedizioni firmata, con vano di partenza e di arrivo.

> ⚠️ **IL PACCHETTO DELLA 2.21.1 È STATO SOVRASCRITTO IL 03/09 NOTTE, ED È LA
> TRAPPOLA DEL 19/08 DI §7.** Una build fatta «per vedere se compila», col
> numero ancora fermo a `2.21.1`, ha riscritto `consegna\Pathfinder 2.21.1\`
> coi byte della campata: impronta `2bd7af11…` al posto di `f2ecf629…`. Non si
> è perso niente — il sorgente della 2.21.1 è il commit `9bd9ad7`, la build è
> riproducibile, e la 2.22.0 contiene quella correzione — ma **la regola
> resta**, e questa volta è costata a chi la stava rileggendo: il numero si
> alza **prima** di costruire, e prima di una build di verifica si copia il
> pacchetto che aspetta un'installazione.

### La 2.21.1 — costruita, non installata, superata dalla 2.22.0

**Una riga di registro, e nient'altro.** Il carico delle spedizioni scriveva
la sua riga `UDC` col solo tipo e la nota, mentre la stessa causale scritta
dalla maschera delle unità di carico porta operatore, vano di partenza, vano
di arrivo e istante. Le righe della merce erano complete, quindi non si è
perso niente — ma una causale con due forme è una causale che fra sei mesi
non si sa leggere, e §8 chiede **chi ha firmato**. L'ha trovata il carico
vero di Andrea sul banco, non una prova.

| | |
|---|---|
| pacchetto | **non esiste più su disco** — sovrascritto il 03/09 notte, vedi l'avviso della 2.22.0. Si rifà dal commit `9bd9ad7` |
| impronta | `f2ecf62946c317c77fb58c3182f41d5c49cf7e1b297fe7eee0f0f2cb866d297e` |
| byte | **2.027.739** in **4 file**, `costruita 2026-09-03T21:04:11Z` |
| riproducibile | **sì, verificata**: tre build di fila danno la stessa impronta |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi dal pacchetto | `servizio\test\collaudo-installazione.js` girato **dentro** `consegna\Pathfinder 2.21.1\`: **43 su 43**; il servizio del pacchetto dichiara `2.21.1` |
| cosa cambia dalla 2.21.0 | **un file di vista e quattro campi**: `caricoSpedizione.ts` passa a `moveUdc` il record intero. Nessuna regola nuova, nessun campo nuovo a database, nessuna migrazione |
| installata | **no.** `/api/app-info` risponde ancora `2.21.0` — §0: installare è un atto umano |

> **PERCHÉ UN NUMERO NUOVO E NON UNA SECONDA 2.21.0.** L'impronta identifica
> **quei byte**, e il pacchetto in archivio porta quella. Rifare la 2.21.0 con
> byte diversi vorrebbe dire due pacchetti con lo stesso nome e due impronte,
> cioè togliere alla tabella di §2 l'unica cosa che la rende utile. Tre numeri
> perché è una build di prova su una definitiva — §2.

### La 2.21.0 — come è stata costruita, e come è finita in servizio

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.21.0\` |
| impronta | `479913cded317d687fd7917e341a0e7dec759c925683a065374157e9980a5f26` |
| byte | **2.027.564** in **4 file**, `costruita 2026-09-03T18:49:50Z` |
| riproducibile | **sì, verificata**: tre build di fila dello stesso albero danno la stessa impronta |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi dal pacchetto | `servizio\test\collaudo-installazione.js` girato **dentro** `consegna\Pathfinder 2.21.0\`: **43 su 43**; il servizio del pacchetto dichiara `2.21.0` |
| prova a vuoto | **non fatta**: `installa.ps1 -Prova` legge la macchina, e §0 dice che tutto ciò che tocca `C:\Pathfinder\` si propone e si aspetta il via |
| **installata** | **sì, su QUESTA macchina** — il servizio si è riavviato alle **18:53:11Z** e dichiara `2.21.0`; il riavvio precedente, alle 15:54:46Z, dichiarava `2.20.0`. `C:\Pathfinder\app\corrente` porta l'impronta di questo pacchetto e `precedente` porta la **2.20.0** (`d10d7830…`), che è la via di ritorno intera |
| chi ha installato | **non è stato un agente**: `C:\Pathfinder\` si tocca solo col via di Andrea, e nessun comando di questa sessione l'ha toccata. Il gesto è avvenuto fra la build e la misura |
| collaudi da ferme | **1.332 su 1.333** (`npm test`, una saltata) · **156** sul servizio · **100** sulle etichette · **43** sull'installazione · **8** sul cambio di schema |
| banco | **fatto a mano**, sul giro descritto in §5: due bancali con modello appreso, scarico a mano, carico di due DDT in baia, tappa saltata, evasione parziale, packing list e DDT stampati a video |
| prova rossa | **una sola**, ed è la voce **87**: `banco/gerarchia.cjs` dà 39 su 40 dal 03/09 mattina, prima di questo lavoro |

**COSA HA TROVATO IL BANCO, E NESSUNA PROVA DA FERMA VEDEVA — QUATTRO
DIFETTI.** I primi tre dal giro fatto costruendo, il quarto dal carico vero
di Andrea la notte del 03/09.

1. **`hidden` non nascondeva niente su un `.form-group`.** L'attributo del
   browser vale `display: none` con la specificità di un selettore di tipo, e
   `.form-group { display: flex }` gli passava sopra: la dichiarazione dei
   colli si vedeva su **ogni** articolo, anche su quelli senza unità di
   misura, e il codice che l'accendeva e la spegneva funzionava per finta.
   **Non era un difetto del prodotto finito**: lo stesso blocco esiste nel
   posizionamento dalla 1.8, ed era rotto lì da allora. Adesso `[hidden] {
   display: none !important }` sta in `01-base.css` — §7.
2. **La TRAPPOLA 22, sulla sessione di carico.** `caricoSpedizione` non era
   dichiarata in `_loadCache`: viveva in cache finché nessuno ricaricava la
   pagina, e poi spariva — cioè **proprio nel caso per cui era stata
   salvata**. Un carico su sei DDT dura mezz'ora, e in mezz'ora un terminale
   si spegne.
3. **Due bancali nello stesso vano di baia.** La prima stesura cercava una
   posizione dove il pallet «ci stesse», e due pallet di lotti diversi ci
   stanno benissimo: finivano impilati nella stessa casella, e la mappa non
   mostrava più che cosa stesse salendo sul mezzo. Adesso si cerca prima una
   posizione **vuota**, e si ripiega solo a baia piena.
4. **LA RIGA `UDC` DEL CARICO NON DICEVA CHI AVEVA FIRMATO** — e l'ha trovata
   il giro di Andrea sul banco, il 03/09 a notte, non una prova. `moveUdc`
   riceveva il solo tipo e la nota, quindi il registro portava una riga `UDC`
   senza operatore e senza da-dove-a-dove, mentre la stessa causale scritta
   dalla maschera delle unità di carico li porta tutti. **Le righe della merce
   erano complete** — articolo, lotto, vano di partenza e di arrivo, colli,
   operatore — quindi non si è perso niente; ma una causale con due forme è
   una causale che fra sei mesi non si sa leggere. Adesso la riga si scrive
   intera, come la scrive `udc.ts`.

### La 2.20.0 — come è stata costruita

| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.20.0\` |
| impronta | `d10d78308952d360bb4451614ce43bb0f87b4466a916136090fe9bd690bb6fb7` |
| byte | **1.982.683** in **4 file**, `costruita 2026-09-03T15:48:15Z` |
| riproducibile | **sì, verificata**: tre build di fila dello stesso albero danno la stessa impronta — anche quella fatta dopo aver rimesso i fine riga, che il bundle non li vede |
| numero | nei quattro posti di §7, e `test/versioni.test.js` è verde |
| collaudi dal pacchetto | `servizio\test\collaudo-installazione.js` girato **dentro** `consegna\Pathfinder 2.20.0\`: **43 su 43**; il servizio del pacchetto dichiara `2.20.0` e porta il catalogo dei campi del bancale |
| prova a vuoto | **non fatta**: `installa.ps1 -Prova` legge la macchina, e §0 dice che tutto ciò che tocca `C:\Pathfinder\` si propone e si aspetta il via |

**La 2.21.0, la 2.20.0 e la 2.19.0 sono archiviate** in
`ARCHIVIO\VERSIONI PRECEDENTI\` — §7: prima di costruire si copia il
pacchetto che c'era, perché la build azzera `consegna\`. Vale anche per una
versione **installata**: `app\corrente` la porta, ma il pacchetto con cui è
stata installata sta solo lì.

### Il fix che viveva in un pacchetto solo

Il **28/08 il magazzino è rimasto giù una giornata intera**. L'attività
pianificata parte `AtStartup`, il servizio ha chiesto PostgreSQL **diciotto
secondi** dopo l'accensione, il motore stava ancora facendo il recovery, e il
servizio è uscito con 1 — come deve, «meglio fermo che vivo senza database».
Poi non ci ha riprovato nessuno: il `-RestartCount` dell'Utilità di
pianificazione ripesca le attività che **non riescono a partire**, non quelle
il cui processo esce con un codice diverso da zero.

La correzione è la **2.12.1**, e il 31/08 si è scoperto **dov'era scritta**:
in `consegna\Pathfinder 2.12.1\servizio\` e in `C:\Pathfinder\servizio\`, cioè
nel pacchetto e nella macchina. In `server\` **no**. Tocca due file —
`lib\driver-postgres.js` (attesa dell'avvio, +68 righe) e
`installa-servizio.ps1` (`$trigger.Delay = 'PT1M'`, cinque tentativi a due
minuti) — e li ha trovati un confronto file per file fra i due alberi.

**La 2.13 la riporta nel sorgente**, byte per byte, e le mette accanto le
prove che non aveva: §3.

> **È una trappola nuova, e sta in §7.** La build copia `server\` dentro il
> pacchetto e **mai il contrario**. Un fix scritto nel pacchetto vive fino alla
> build successiva, e poi sparisce senza che niente lo dica.

### I conteggi del database — 01/09, dopo il caricamento di prova

Il database è nato vuoto con l'installazione pulita, e poi Andrea ci ha
caricato **un backup in merge, per fare delle prove**. Misurato da
`/api/health`:
| collezione | righe | | collezione | righe |
|---|---:|---|---|---:|
| `articles` | 11.197 | | `mov_log` | **0** |
| `inventory` | **882** | | `lots` | **0** |
| `zones` | 17 | | `udc` | 0 |
| `sites` | 4 | | `wip` | 0 |
| `operators` | **1** | | `revision` | **318** |

> **IL REGISTRO MOVIMENTI È VUOTO, E NON PER SBAGLIO: nel backup non c'era.**
> Lo dice Andrea, ed è coerente con quello che si misura. **I 45 movimenti del
> magazzino vero esistono in un posto solo**, il dump del 31/08 sul Desktop
> (voce 73). §8 non li fa cancellare mai: finché stanno su un disco solo, sono
> un file che prima o poi non c'è più.

> **882 GIACENZE E LA COLLEZIONE `lots` A ZERO.** Andrea dice che i lotti ci
> sono, e ha ragione su quello che intende: il **codice** di lotto viaggia
> sulla riga di giacenza, dentro `item_key`. Ma la collezione `lots` è un'altra
> cosa — porta `expiry_date` e la **confezione congelata** (`uom`,
> `uom_per_collo`) — e quella è vuota. **Senza `lots` non c'è la scadenza**, e
> senza scadenza il FEFO non ordina niente; senza confezione congelata il conto
> di produzione ricade sul ripiego della voce 61. **Da guardare prima di
> giudicare una prova fatta su questi dati**, perché non è il magazzino vero:
> è un magazzino senza date.

**L'ultima misura prima della cancellazione**, tenuta perché è il termine di
paragone. Da `/api/health` il 31/08:
| collezione | righe | | collezione | righe |
|---|---:|---|---|---:|
| `articles` | 11.197 | | `lots` | 29 |
| `inventory` | 851 | | `wip` | 6 |
| `sites` | 4 | | `pick_archive` | 2 |
| `zones` | 17 | | `meta` | 3 |
| `mov_log` | **45** | | `operators` | **2** |
| `loc_status` | 5 | | `disabled` | 1 |
| `tasks` | 3 | | `udc` | **1** |

Vuote: `quarantine`, `pending_outbound`, `pick_session`, `disposal_archive`,
`storage_rules`, `recipients`, `location_attrs`.

> **LA VOCE 69 RESTA APERTA, e adesso ha un fatto in più: il database vive.**
> Dal 28/08 al 31/08 i movimenti sono saliti 39 → **45**, gli operatori 1 →
> **2**, i lotti 27 → **29**, e la prima UDC della storia del progetto è nata
> (`udc` 0 → **1**, che era la voce 12). Quindi il calo del 27-28/08 — 886
> giacenze, 321 movimenti, 7 operatori scesi a 851, 39, 1 — **non è un
> database sbagliato che si sta ancora leggendo**: è successo qualcosa in quei
> due giorni, e dopo il magazzino ha ripreso a scrivere su questo. Resta da
> guardare **prima di qualunque cosa che tocchi i dati**.

### Collaudi e tipi

Tutti rilanciati il **03/09 notte**, sul codice del prodotto finito. **Verdi
tutti tranne una prova della gerarchia, che era già rossa prima** — verificato
rimettendo il codice del commit `c693b2c`: non l'ha rotta questo lavoro, ed è
la **voce 87**.
| | |
|---|---|
| client | **1.303 prove in 48 file — 1.302 verdi e 1 saltata**, `npm test`. I file nuovi sono `imballo.test.js` (17) e `bancale.test.js` (16); le altre nuove stanno in `stampanti.test.js` (37), `documenti.test.js` (8) e `stampa.test.js` |
| tipi | `npm run check` **a 0** su client e servizio |
| servizio | **156** |
| stampa (`server/test/collaudo-stampa.js`) | **100** — erano 78: le ventidue nuove sono l'etichetta del bancale, il bancale misto che non inventa niente, e il layout che non ci sta e si rifiuta |
| migrazione · installazione | **8 · 43** |
| gerarchia (`banco/gerarchia.cjs`) | **39 su 40** — la rossa è la voce **87** e non riguarda il prodotto finito |
| ciclo (`banco/ciclo/gira.cjs`) | **47 su 47** — voci 70 e 71 chiuse. Dalla 2.16 **esce 1** se in quella corsa è stato alzato un difetto `grave` |
| migrazione dalla 1.4 (`banco/migrazione/dalla-1.4.cjs`) | **14** — il salto dal magazzino vero alla beta, su un database vuoto (voce 79). Nuovo il 02/09 |

### La 2.14 — come è arrivata in servizio
| | |
|---|---|
| pacchetto | `consegna\Pathfinder 2.14\` |
| impronta | `8a25574bb3fbc2303dcdb0c7edc9370c5ec2b0d11ab75e6e9c4c0431fe448ead` |
| byte | **1.901.483** in **4 file**, costruita `2026-08-31T19:07:52Z` |
| riproducibile | **sì, verificata**: due build di fila dello stesso albero hanno dato la stessa impronta |
| prova a vuoto | `.\installa.ps1 -NonChiedere -Prova` **sulla macchina di allora, che aveva la 2.13 in servizio**: strada **aggiornamento**, radice `C:\Pathfinder`, PostgreSQL già pronto, **nessuna migrazione**, database non toccato |
| provata al banco | **sì, dal pacchetto** — non solo dal sorgente: servizio sulla 4199 con `banco\app\corrente` a 2.14 e `banco\db\ui.db`, e la schermata nuova esercitata di lì |

> **IL PACCHETTO 2.14 ERA STATO RITAGLIATO TRE VOLTE COL SOLITO NUMERO, e per
> questo esiste la 2.15.** Il 31/08 sera con l'installer vecchio, il 01/09 con
> la correzione della voce 75, e ancora il 01/09 con la disinstallazione.
> L'applicativo non era mai cambiato — stessa impronta, stessi byte — **ma
> l'installer sì, e l'impronta non lo copre**: chi tiene in mano una cartella
> «Pathfinder 2.14» non ha modo di sapere quale dei tre ci sia dentro. Il
> numero è stato mosso a **2.15** e la 2.14 è stata archiviata in
> `ARCHIVIO\VERSIONI PRECEDENTI\` **nella forma che gira sulla macchina**.
> **L'IMPRONTA IDENTIFICA L'APPLICATIVO, NON IL PACCHETTO**: due pacchetti con
> la stessa impronta possono portare installer diversi, e l'unico modo di
> tenerli distinti è il numero.

**Installata il 01/09 sera**, e non per aggiornamento: sulla macchina rifatta
l'installer ha preso la strada di **prima installazione**, quella che la prova a
vuoto non aveva mai esercitato. **Si è rotta lì**, due volte, e la voce **75**
racconta come. Il pacchetto è stato ricostruito il 01/09 con l'installer
corretto: **stessa impronta** `8a25574b…` e stessi 1.901.483 byte — cambia solo
`costruita`, che nel manifesto del pacchetto adesso dice `22:55:27` mentre la
macchina, installata prima della ricostruzione, risponde `19:07:52`. **I byte
dell'applicativo sono gli stessi**: l'impronta lo prova, ed è lei che conta.
Installare resta un atto umano — §0 punto 4.

### La 2.15 — come è arrivata in servizio
| | |
|---|---|
| installata | **01/09**, e verificata dal servizio: `/api/app-info` risponde 2.15 con questa impronta |
| pacchetto | `consegna\Pathfinder 2.15\` |
| impronta | `7b812c48ae9d1c878efd7e3e5114bed96fa3536c8ccb13d4107ab335fe4fd7eb` |
| byte | **1.901.483** in **4 file**, `costruita 2026-08-31T23:34:17Z` |
| riproducibile | **sì, verificata**: due build di fila dello stesso albero danno la stessa impronta |
| cosa cambia | **niente nell'applicativo**: solo il numero e l'installer — §3 |
| prova a vuoto | `installa.ps1 -NonChiedere -Prova` sulla macchina in servizio: strada **aggiornamento**, radice `C:\Pathfinder`, **nessuna migrazione**, database non toccato, riavvio del servizio sì |
| disinstallazione | `installa.ps1 -Disinstalla -Prova` esercitata sulla stessa macchina: elenca cosa toglierebbe e **non tocca niente** — verificato dopo, servizio e variabili al loro posto |
| collaudi dal pacchetto | `servizio\test\collaudo-installazione.js` girato **dentro** `consegna\Pathfinder 2.15\`: **43 su 43** |

**La 2.14 è archiviata in `ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder 2.14\` nella
forma che gira sulla macchina** — impronta `8a25574b…` — prima che la build
azzerasse `consegna\`.

---

## 2. Le versioni

Numerazione progressiva: una build definitiva porta **due numeri** (`2.12`),
una di prova ne porta di più (`2.12.1`).
| Ver. | Stato | Impronta | Cosa porta |
|---|---|---|---|
| **2.29.0** | costruita, non installata — 08/09 notte | `7b8f6ca0…` | **Quello che è già in reparto non si va a prendere.** Caricato un ODP, il sistema confronta la domanda del giro con quello che è fermo in lavorazione e lo dice in un riquadro: il residuo degli **ordini del giro** scala il fabbisogno — dove copre tutto, la tappa non serve — quello di ordini **estranei** si nomina soltanto, perché sta sul conto di qualcun altro. Si confronta **nell'unità**, mai nei colli: quel che non si può contare esce «da verificare di persona». **Nessuna tappa viene toccata.** E il **vano di lavorazione smette di essere un'ubicazione da cui si preleva**: era il buco vero — svuotato lo scaffale, il percorso mandava a prelevare dal vano WIP verso il vano WIP. Più **cinque icone**: quattro `toast` scritti su più righe mostravano `<svg class=` a video, una quinta stava in un `<option>` e non si vedeva mai |
| **2.28.0** | **IN SERVIZIO su questa macchina dall'08/09** | `c722f7da…` | **Ogni foglio ha la sua testata e la sua coda, e in mezzo solo la merce.** La coda — totali, vettore, date, firme, piede — è passata nel `<tfoot>`, che è il gruppo che il browser ripete su ogni pagina, e si dipinge fuori dal flusso a `bottom: 0` con la banda riservata dal `tfoot`. Un numero solo si misura, l'altezza della fascia, perché la fa il documento. Un DDT da 40 partite passa da 5 fogli a **4**, con la coda alla stessa quota su tutti. Ribalta la 2.24 sulle firme, di proposito |
| **2.27.0** | costruita, non installata, **superata dalla 2.28.0** — 07/09 sera | `1486602a…` | **Il piede sta in fondo al foglio, e il testo dei documenti scende del 10%.** `table-footer-group` non vuol dire «in fondo alla pagina» ma «alla fine di ogni frammento»: sull'ultima il piede galleggiava a metà. Adesso il `tfoot` **riserva** la banda e un elemento fuori dal flusso la **dipinge**, con un numero solo — `--doc-piede: 10mm`, misurato. Col corpo ridotto (arrotondamento 0,25 pt, pavimento 6,5 pt, etichette escluse) un DDT da 90 partite passa da **9 fogli a 8**, provato stampando in PDF. Più: il **campione si pesa in KG o in GR** sugli articoli a peso, con rifiuto se la conversione non torna esatta; e i campi di ricerca di **registro** e **anagrafica articoli** tornano a filtrare — dalla 2.23 mostravano `<svg class=` e avevano perso l'`oninput` |
| **2.26.0** | costruita, non installata, **superata dalla 2.27.0** — 05/09 notte | `05880f15…` | **Il servizio parla HTTPS, sulla stessa porta.** Certificato fatto con gli strumenti di Windows — autorità locale più certificato del servizio firmato da lei, così alla scadenza non si rifà il giro dei terminali — con nomi e **tutti gli IPv4** dentro il SAN. Resta la 4173: davanti ai due server un `net.Server` guarda il primo byte e manda chi arriva in chiaro a un `301` verso `https://`, quindi i collegamenti salvati non si rompono. Il chiosco della 2.25 diventa installabile appena l'autorità è sui terminali |
| **2.25.0** | **COSTRUITA, NON INSTALLATA** — 04/09 notte | `9b2fecb6…` | **L'interfaccia sta dentro lo schermo, e si installa.** Il telaio non supera più la larghezza della finestra (`min-width: 0` sulle caselle di griglia: era la testata a spingerlo a 459px su uno schermo da 375), le **undici linguette** di Configurazione vanno a capo invece di essere tagliate, lo zoom torna libero e la sua causa — i campi sotto i 16px — sparisce sotto `pointer: coarse`, dove i bersagli sono 48px. `dispositivo-tavoletta` ha finalmente delle regole. Più la **modalità chiosco**: manifesto web e tre icone, Pathfinder si apre dalla sua icona. **Vuole HTTPS** |
| **2.24.0** | costruita, non installata — 04/09 sera | `39c2ecce…` | **I due fogli che escono dal magazzino, rifatti.** DDT a sei colonne (quantità e unità in due celle), packing list per **articolo → lotto → bancale** con un totale per livello. Tre difetti chiusi: la colonna da 13 mm con `nowrap`, il secondo foglio senza testata, le firme senza etichetta. Il foglio diventa una funzione del documento, e il banco ne compone due da un carico pieno |
| **2.23.0** | **IN SERVIZIO su questa macchina dal 04/09 sera** | `f9d4e012…` | **Il banco guarda lo schermo.** Quindici flussi e 355 controlli sul DOM in `banco/video/`: ogni prova confronta quel che si vede, il conto rifatto a parte e quel che è finito a database. Ha trovato due difetti invisibili a una prova via `fetch` |
| **2.22.0** | costruita, non installata, **superata dalla 2.23.0** — 03/09 notte | `c5d97b15…` | **La campata della tappa.** La scheda del prelievo disegna la **campata vista di fronte**: i livelli impilati, quello da prelevare acceso pieno, gli altri col **solo stato**. Una banda avvisa quando lo stesso articolo sta su un altro livello **con un lotto diverso** — il caso in cui la scansione del vano non salva nessuno. Sulle zone a terra e alla rinfusa non si disegna niente. Porta dentro anche la 2.21.1 |
| **2.21.1** | costruita, non installata, **superata dalla 2.22.0** — 03/09 notte | `f2ecf629…` | **Una riga di registro.** Il carico delle spedizioni scriveva la sua riga `UDC` col solo tipo e la nota: adesso porta operatore, vano di partenza, vano di arrivo e istante, come la scrive la maschera delle unità di carico. Le righe della merce erano già complete |
| **2.21.0** | in servizio dal 03/09 sera, **sostituita dalla 2.23.0 il 04/09** | `479913cd…` | **Il bancale si fa da sé, e il camion si carica scansionando.** La maschera del reparto è quella del carico merce — colli pieni × quanto dentro — e il **modello di carico si impara** dal primo bancale invece di essere compilato su 11.197 articoli. L'etichetta esce **prima** dell'ubicazione. Nasce **Carico spedizioni**: un giro le cui tappe sono bancali, la **baia di carico** come tipo di zona, e i DDT che si evadono a fine giro — quelli completi. Più: articolo e lotto in due colonne, DDT e data **riletti dai documenti**, scarico a mano, DDT raggruppato in stampa, packing list con la composizione del collo |
| **2.20.0** | in servizio il 03/09 pomeriggio — è la **via di ritorno** | `d10d7830…` | **Il magazzino del prodotto finito.** Il bancale è un'unità di carico, la maschera del reparto lo chiude in un gesto e ne stampa l'etichetta, chi spedisce lo trova in elenco e sulla mappa, lo spunta e il DDT si riempie. **Packing list** e **conto terzi**, dove la merce non esce ma si sposta |
| **2.19.0** | **COSTRUITA, NON INSTALLATA** — 02/09 | — | Le etichette escono dalla **stampante**: Zebra in rete sulla porta 9100, e a parlarle è il servizio. Le stampanti e il **layout dell'etichetta merce** — barre, descrizione, scadenza, peso — si configurano; chi stampa sceglie la macchina e quante copie. **L'A4 resta**, e non come ripiego di cortesia |
| **2.18.1** | costruita, non installata | — | Il minimo di Node era sbagliato e l'ha trovato la CI: `>=20` dichiarato ovunque, `better-sqlite3` 13 ne vuole 22 |
| **2.17** | in servizio dal 02/09 al 03/09 | `b6b24d70…` | Il limite di ritenzione esce dal codice: `LOG_RETENTION_DAYS` non cancellava niente e sei anni non li chiedeva nessuna norma. Le tre etichette dicono adesso quel che il sistema fa |
| **2.16** | in servizio il 02/09 — è la **via di ritorno** | `111d58b5…` | Il punto zero: **l'ultimo Admin non si toglie da solo** (murato nel servizio) · il registro dice **quanto** si è mosso e **chi** si è mosso, anche in blocco (voci 33, 34) · causale **`UDC`** · un difetto grave **ferma** il banco del ciclo (voce 50) · servito, l'indicatore smette di dire «Non salvato» · cinque icone che uscivano monocromatiche |
| **2.15** | in servizio dal 01/09 al 02/09 — è la **via di ritorno** | `7b812c48…` | **L'applicativo non cambia di una riga.** L'installer smette di murarsi dentro da solo (voce 75) e impara a **togliersi**: `-Disinstalla`, che prima salva e poi toglie · una radice lasciata da un tentativo fallito si riapre da sé |
| **2.14** | in servizio il 01/09 per poche ore, archiviata |  `8a25574b…` | La schermata WIP parte **dalla merce e non dal numero**: la lista di quello che è fermo in lavorazione, ordinabile e filtrabile · l'archivio degli ordini chiusi passa in **Archivio** · **un reso sbagliato si storna** · leggibilità e proporzioni delle maschere |
| **2.13** | **in servizio dal 31/08, rimossa il 01/09** — voce 74 | `cbe71802…` | La gerarchia la impone **il servizio** (voce 66) · `rinnovaPin` · il **codice di ripristino** dell'Admin · il fix di avvio della 2.12.1 riportato nel sorgente e coperto da dodici prove |
| **2.12.1** | archiviata | `4f2a9f0f…` | Il servizio **aspetta** PostgreSQL invece di arrendersi al primo no, e l'attività pianificata parte un minuto dopo l'accensione. Nata da una giornata di magazzino fermo |
| **2.12** | archiviata | `9ef94996…` | Il giro: più ODP in un percorso solo, conto di produzione **uno** · ricalibrazione della distinta · l'ubicazione si scansiona **una volta per vano** |

> ⚠️ **GLI SHA DI QUESTA TABELLA SONO CAMBIATI IL 01/09.** La riscrittura
> della storia (voce 72) ha rifatto tutti e 296 i commit di `main`. Le
> **impronte dei pacchetti** no: quelle sono i byte consegnati e non le tocca
> nessuno. **Chi avesse un clone se lo deve rifare da zero.** Il bundle della
> 2.3 in `ARCHIVIO/` non è toccato: quel ramo non è mai stato in `main`.

> **QUALE FOSSE LA VIA DI RITORNO NON SI SAPRÀ PIÙ.** Fino al 31/08 questa riga
> diceva 2.12; poi la 2.13 è stata installata senza che il documento lo
> registrasse, e `app\precedente` ha preso quel che c'era prima. Il 01/09
> `C:\Pathfinder` è stata rimossa **senza che nessuno l'avesse aperta**, e con
> lei quel `manifest.json`. **La lezione vale per la prossima macchina**: la via
> di ritorno si legge prima di installare, non prima di disinstallare, perché
> alla seconda occasione può non esserci più.
| **2.11** | archiviata | `4a8b5a6c…` | Il PIN emette una **sessione**; senza sessione le rotte `/api` non si aprono — voce 64 |
| **2.10** | archiviata | `2a70b8e9…` | Sei falle di sicurezza chiuse: `pin_hash` fuori dalle risposte, scrypt, backup che non esce dalla macchina, codici che non spezzano un gestore, ACL sui file del servizio, intestazioni |
| **2.9** | archiviata | `b3b3b8da…` | Lo stoccaggio smette di **rifiutare** e diventa assistente · matrice di incompatibilità tolta, pericolosità dentro le regole · `#dlgOverlay` |
| **2.8** | archiviata | `21c3f4b9…` | Regole di stoccaggio che **decidono**: due regole base, categoria merceologica, pericolosità, `location_attrs` (ventunesima collezione) |
| **2.7** | archiviata | `17cb722b…` | Primo giorno su **PostgreSQL** · backup `pg_dump` riletto prima di essere dichiarato buono · l'installer sa consegnare il database |
| **2.6** | archiviata | `d3865c53…` | Il servizio parla **due database** · codici in maiuscolo · interfaccia del servizio dati asincrona. Tornare a lei vuol dire tornare a SQLite: conosce `PATHFINDER_PG` ma non sa farci il backup |
| **2.5** | archiviata | `8ed505b9…` | Unità di misura al carico su 11.115 articoli · prelievo da ordine. Si porta dietro la **voce 51** |
| **2.4** | archiviata | `99fc56ba…` | Voce 45 (un ripristino non cancella più il registro) e voce 19 (l'unità dichiarata dal parser ODP — **da verificare**, §4). **Salta il numero 2.3 apposta** |
| **2.2** | archiviata | `08ce3f69…` | Cinque difetti chiusi (voci 14, 29, 30) · commit `90ef798` (era `495f38c`: la storia è stata riscritta — voce 72) |
| ~~**2.3**~~ | **RITIRATA — ha disfunzionato, ripristino d'emergenza alla 2.2** | `367d977e…` | Divideva **il collo** fra più ordini. Pacchetto e ramo git (bundle, commit `d717098` — **il bundle non è stato riscritto**: quel ramo non è mai stato in `main`) in `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/`. **Non si installa e non si riprende così com'è** |
| ~~**1.8 → 2.1**~~ | archiviate dentro la 2.2 | — | 1.8 UOM · 1.9 viste giacenza · 1.10 trasferimenti dall'ODP · 1.11 terminale · 1.12 UDC · 1.13 motore di stoccaggio · 1.14 conto di produzione · 2.0 (interruttori tolti, KPI, otto difetti) · 2.1 (Code128, Admin, cruscotto, tabelle, UDC in mappa) |

**Dove stanno i byte:** `consegna\Pathfinder <ver>\` tiene **solo l'ultima
build** (`npm run build` azzera la cartella); le precedenti stanno in
`ARCHIVIO\VERSIONI PRECEDENTI\Pathfinder <ver>\`; il deposito
`C:\Pathfinder\app\pathfinder-<ver>\` tiene gli ultimi byte installati con quel
numero.

**LA BUILD È RIPRODUCIBILE BIT PER BIT.** Ricostruendo lo stesso commit a
cinque giorni di distanza esce la stessa impronta: un pacchetto perso si
riottiene dal commit, e l'impronta è una prova di *quale codice* c'è dentro.

**GLI INTERRUTTORI `feature.*` NON ESISTONO PIÙ dalla 2.0**, tolti da 74 punti
in 12 file. Le chiavi restano scritte in `meta` e **nessuno le legge**: sono un
dato morto. Chi legge qui dentro «si accende a gennaio» o «l'interruttore è
spento» sta leggendo una riga di prima della 2.0. **Tutte le funzioni sono
attive**, e si torna indietro reinstallando il pacchetto di prima.

---

## 3. Cosa porta ogni versione recente

### 2.29 — quello che è già in reparto non si va a prendere

Nasce da una richiesta di Andrea dell'08/09: quando si carica un `.xlsx`, il
sistema deve guardare anche il conto di produzione e dire all'operatore quali
righe sono già in reparto, perché non le vada a prelevare — a meno che quel
che c'è di là non basti.

**LA DOMANDA È «QUANTO NE DEVO ANCORA PRENDERE», E NON AVEVA UNA RISPOSTA.**
La distinta di Sage chiede la quantità intera dell'ordine. Un ODP prelevato a
metà e ricaricato la richiedeva tutta un'altra volta; un fondo lasciato nel
vano da un altro ordine non lo sapeva nessuno. In corsia si scende, si prende
e ci si accorge dopo — quando la merce è già fuori dallo scaffale e il conto
di qualcun altro è stato spostato senza scriverlo.

**I DUE RESIDUI NON SI SOMMANO.** È la sola regola che conta, e sta scritta
nel modulo. Quello degli **ordini del giro** è merce già scesa per questo
lavoro: scala il fabbisogno, e dove lo copre tutto la riga esce «già di là —
non serve prelevarlo». Quello di **ordini estranei** sta sul conto di
qualcun altro: si nomina, col numero dell'ordine che lo tiene, e non scala
niente. Prenderlo è una decisione di produzione, non una tappa.

**SI CONFRONTA NELL'UNITÀ, MAI NEI COLLI.** L'ordine chiede chili; il vano
tiene colli, e quanto ce ne sia dentro si sa solo quando il lotto dichiara la
confezione — che sulle materie prime è quasi mai. Un residuo senza quella
quantità, o con un'unità diversa da quella del foglio, **non entra nella
sottrazione**: la riga esce `incerta`, il numero è dichiarato un minimo e si
va a guardare. Moltiplicare i colli per un numero che nessuno ha dichiarato è
l'unità inventata della **voce 19**, applicata al conto invece che alla tappa.

**NESSUNA TAPPA VIENE TOCCATA, ED È UNA DECISIONE.** Il riquadro informa; la
distinta resta quella che l'ordine dichiara. Scalare da soli un fabbisogno su
un residuo che nessuno è andato a guardare vuol dire mandare a produrre con
meno merce di quella che serve, e accorgersene a impasto avviato. Una prova
legge il sorgente del riquadro e verifica che non ci sia nessun `onclick` e
nessuna scrittura sulle tappe: informare e agire sono due cose.

**IL BUCO VERO ERA UN ALTRO, ED È USCITO PROVANDO QUESTA.** Portare in
produzione è un **trasferimento**: la merce esce dallo scaffale e resta
scritta in giacenza, nel vano WIP. Per `Store.getItemByKey` quello è
un'ubicazione come le altre, e `pickRoute.ts` non nominava `areaWip` da
nessuna parte. Svuotato lo scaffale, il vano WIP diventava **l'unica**
ubicazione che portava il lotto: il percorso mandava a prelevare merce già in
reparto, dal vano WIP verso il vano WIP. Adesso `build` lo esclude — come già
lo escludeva `conformita` fra le aree di transito — e una riga che sta tutta
di là esce col motivo suo, **`in_lavorazione`**. Il motivo lo decide chi ha
bloccato: dire «in quarantena o impegnata su un DDT» su una riga che sta in
reparto manda a cercare il guasto dove non c'è.

**TRE DIFETTI USCITI DAL PROVARE A ROMPERLA**, su richiesta di Andrea, e non
dal rileggere il codice:

1. **L'incertezza di un ALTRO ordine annullava il conto sul proprio.** 40 KG
   scesi per il giro si contano benissimo; un fondo di ODP9 che la sua
   quantità non la dichiara cancellava quei 40 e la riga usciva «da
   verificare». Adesso solo l'incertezza sulla merce **propria** rompe la
   sottrazione — l'altra non scalava niente — e resta un avviso a parte,
   «c'è altra merce non conteggiabile».
2. **Un chiesto a zero con merce di là scriveva «ne mancano 0».** `coperta`
   si leggeva da un secondo confronto invece che da `da_prelevare`, e due
   modi di dire la stessa cosa divergono. Adesso ne resta uno.
3. **Una domanda senza unità si lasciava sottrarre un residuo in chili.** È
   di nuovo la voce 19: senza unità non si sottrae niente, e la riga esce
   incerta.

**COM'È FATTA.** Due funzioni pure e un lettore:

- **`coperturaInLavorazione`** — `modules/wip.ts`, che non importa niente.
  Entrano la domanda, le righe ferme in lavorazione e i numeri d'ordine del
  giro; esce una riga per articolo#lotto con `chiesto`, `suo`, `altrui`,
  `ordini_altrui`, `da_prelevare`, `coperta`, `incerta`.
- **`fabbisogno`** — `modules/giroOdp.ts`. La domanda del giro in forma
  piatta, dalla stessa `unisci` che costruisce il percorso. Una riga senza
  lotto resta fuori: il vano tiene lotti, e una chiave monca appaierebbe
  merce a caso.
- **`Store.coperturaWip`** — tre righe: prende le righe in lavorazione dalla
  cache e le passa. Il tetto di `store.ts` è salito da 4587 a 4596, e §7 dice
  perché.

**SI RICALCOLA A OGNI RICOSTRUZIONE**, non solo all'import: la quantità si
ricalibra e un ordine si toglie, e con loro cambia il fabbisogno. Un numero
fermo a com'era al primo file direbbe coperto quel che non lo è più.

**Provata sui file veri**, non solo su dati inventati: i `.xlsx` di
`banco\odp-wip\` letti col parser vero. 20 KG scesi per ODP9611 coprono la
domanda di ODP9611 (`coperta: true`, `da_prelevare: 0`); gli stessi 20 KG,
visti da ODP9620 che ne chiede 60, escono `suo: 0`, `altrui: 20`,
`ordini_altrui: ['ODP9611']`, `da_prelevare: 60`. **Cosa resta fuori**: la
corsia vera, con un operatore e un ordine sceso a metà.

### 2.29 — cinque icone che non si vedevano

**QUATTRO `toast` MOSTRAVANO `<svg class=` A VIDEO.** `toast` scrive con
`textContent` (`ui/feedback.ts`), quindi un'icona nel messaggio esce come la
sua stringa. È lo stesso difetto della 2.27, e la rete scritta allora non lo
prendeva per una ragione sola: **guardava una riga**. Scritto

    this.toast(
      `${this._ico('tag')} …`, 'warning');

il richiamo e il messaggio stanno su due righe, e il controllo passava. Erano
in Configurazione (una) e in Stampa etichette (tre). L'icona non serviva
nemmeno: il riscontro ha già la sua, scelta dal genere.

**LA QUINTA STAVA DENTRO UN `<option>`, E NON SI È MAI VISTA.** Il parser HTML
in «in select» butta via i tag che non sono di una tendina: l'`<svg>` spariva
e restava un doppio spazio. Verificato in browser, non dedotto — nel DOM
l'elemento c'è, e il `label` reso è solo testo.

**LE DUE PROVE NUOVE MORDONO**, ed è stato provato rimettendo i difetti: la
prima legge il **letterale** che segue il richiamo invece della riga, così non
conta quante volte si va a capo; la seconda guarda dentro ogni
`<option>…</option>`.

### 2.28 — ogni foglio, la sua testata e la sua coda

**LA COSA DA SAPERE PRIMA DELLE ALTRE: la coda non è la fine del documento, è
la fascia bassa del FOGLIO.** Ne segue tutto il resto. Se fosse la fine del
documento uscirebbe una volta sola, in fondo all'ultima pagina — e allora
servirebbe sapere quanto vuoto resta su quel foglio, che in CSS non si chiede e
in JS si può solo indovinare rifacendo l'impaginazione del browser. Se invece è
la fascia bassa del foglio esce su OGNI pagina, e allora è lo stesso mestiere
della testata: un gruppo di tabella che il browser ripete.

`<thead>` e `<tfoot>` sono quei due gruppi. La coda è passata nel `tfoot`, col
piede dentro. Il `tfoot` riserva la banda su ogni foglio — nessuna riga di merce
può finirci sotto — e la fascia si dipinge fuori dal flusso a `bottom: 0`, dove
Chrome la ridisegna a ogni pagina: la strada della filigrana, collaudata dalla
2.1 e già usata dal piede nella 2.27.

**RISERVA E DISEGNO DEVONO ESSERE LO STESSO NUMERO**, e quel numero lo fa il
documento: un DDT con le annotazioni lunghe ha la fascia più alta di uno senza.
Si misura una volta sola, prima di stampare, con le regole della carta tirate
fuori da `@media print` — a video non si applicano, e misurare senza vorrebbe
dire misurare un documento in rem al posto di uno in punti. Poi si scrive
l'altezza sulla cella del `tfoot` e si accende la classe che porta la fascia
fuori dal flusso. Se la misura non riesce la classe non si accende e la fascia
resta nel flusso: il foglio della 2.27, peggio ma non rotto.

**IL MODELLO DI IMPAGINAZIONE È STATO SCRITTO E BUTTATO, e vale la pena dirlo.**
Per mettere la coda in fondo all'ULTIMA pagina si erano contate a mano le righe,
foglio per foglio, per sapere quanto vuoto restava. Sbagliava di una riga — le
altezze misurate fuori schermo e quelle impaginate non coincidono al decimo — e
non c'era verso di farlo tornare. La regola vera era un'altra, e con quella il
modello non serve: cinque righe di CSS e una `getBoundingClientRect`.

**Le righe del DDT adesso non si spezzano** (`break-inside: avoid` su
`.ddt-table tr`): valeva per `.pr-table` dalla 2.24 e per il DDT no, e non era
una scelta — era una riga mai scritta. Una partita tagliata fra due fogli ha il
codice su una pagina e la quantità sull'altra.

**E le firme escono su ogni pagina**, che ribalta la 2.24. Allora erano state
tolte dal piede perché «chi firma non sa quale valga»; adesso ci tornano perché
la fascia bassa è del foglio. È una decisione, non una svista, e una prova la
sorveglia.

### 2.27 — il piede in fondo al foglio, e il campione a peso

**UN PIEDE RIPETUTO NON È UN PIEDE ANCORATO.** `display: table-footer-group` è
la sola dichiarazione che faccia tornare un blocco su ogni pagina stampata, e
per questo dalla 2.1 il piede dei documenti che scorrono sta in un `<tfoot>`.
Ma quella dichiarazione dice **«alla fine di ogni frammento della tabella»**,
non «in fondo al foglio»: su una pagina piena il frammento arriva a filo del
bordo e le due cose coincidono *per caso*, sull'ultima il frammento finisce dove
finiscono le righe. Un DDT corto usciva col piede a metà pagina.

**LE ALTRE TRE STRADE SONO STATE PROVATE E SCARTATE, ED È PARTE DELLA
DECISIONE.** Un `height: 100%` sulla cella del corpo si risolve contro la
tabella, che è alta tre pagine: in paged media **non esiste** un modo di
chiedere «quanto spazio resta su QUESTA pagina», né un'unità né una funzione.
Uno spaziatore che riempia l'ultima pagina avrebbe bisogno dello stesso numero
che non c'è, e a misura fissa genera un foglio bianco. Le **page margin box**
(`@bottom-center`) stanno in fondo per costruzione — ed è da lì che esce il
numero di pagina — ma `content:` accetta stringhe e contatori, non HTML: metà
del piede è dinamica, e servirebbe una regola CSS generata a ogni stampa, più
otto millimetri di margine tolti a ogni pagina di ogni documento.

**QUINDI IL `tfoot` CAMBIA MESTIERE.** Resta `table-footer-group` e continua a
**riservare** la sua altezza in fondo a ogni frammento — ultimo compreso — così
nessuna riga può entrare nella banda. Il piede lo **dipinge** lo stesso
elemento, tolto dal flusso e inchiodato a `bottom: 0`: è la strada della
filigrana `.doc-draft`, che Chrome ridisegna su ogni foglio, ed è già dichiarata
nei collaudi da due versioni. Riserva e banda leggono `--doc-piede`, dichiarata
**una volta sola** e sorvegliata da una prova: due numeri scritti due volte
divergono, e il giorno che divergono il piede copre una riga.

**IL NUMERO È DIECI E NON DODICI, E LA DIFFERENZA SI MISURA IN RIGHE.** Il piede
dipinto è il filetto più 1,5 mm d'aria più una riga da 7 pt: circa 5 mm, circa 8
se il riferimento va a capo. A 12 mm il DDT a carico pieno perdeva tre righe
sulla **prima** pagina, quella con la testata alta dove l'avanzo era già poco,
mentre dalla seconda in poi non cambiava niente; a 10 mm tornano, con due
millimetri di franco.

**IL -10% SUL TESTO NON HA UNA VARIABILE, E NON PER PIGRIZIA.** Il progetto
aveva già deciso il contrario per iscritto: la misura `testoAMano` esclude
apposta i blocchi di stampa dalla regola «nessun `font-size` fuori dai token»,
perché sulla carta si ragiona per **soglia fisica** — sotto i 6,5 pt, in
corsia, con un foglio in mano, non si legge — e `var(--doc-fs-xs)` nasconderebbe
il dato proprio dove il dato è l'argomento. Il prezzo di scrivere i punti a mano
è che fra sei mesi nessuno sappia più che una scala esiste: lo paga una **misura
nuova**, `scalaDiStampa`, che conta i corpi dei due fogli e delle viste e li
dichiara in `stileCoerente.dati.js`. Da lì in poi un gradino che si muove suona.
Il pavimento costa un gradino — 7 e 6,5 atterrano tutti e due su 6,5 — ed è
accettato: l'alternativa, 6,25, sfonda la soglia.

**LE QUATTRO ESCLUSIONI SONO QUELLE CHE NON RECUPERANO NIENTE.** Le etichette
adesive stanno su 100×80 e 100×60 mm di supporto fisso: rimpicciolirle non
libera un millimetro e allontana il codice a barre dal lettore. La filigrana è
un velo tarato sulla diagonale del foglio. Il numero di pagina vive nel margine.
La fascia del cartellino di non conformità si legge da due metri su un bancale
in quarantena: è un segnale, non un testo.

**CINQUANTA GRAMMI SI DIGITANO «50».** Il campionamento accettava la quantità
solo nell'unità dell'articolo, e su un sacco da 25 KG quei cinquanta grammi
erano `0,05`. Adesso sugli articoli a peso c'è un selettore KG/GR, e il passo
del campo lo segue — i grammi si contano interi, i chili portano tre decimali.
**Il numero già battuto non si riconverte da sé**: riscrivere sotto le dita una
quantità appena digitata è il modo di farne confermare una che nessuno ha
riletto. A magazzino cala sempre l'unità dell'articolo: la conversione finisce
nella maschera, e `sampleItem`, il servizio e il registro non ne sanno niente.

**E LA CONVERSIONE DEVE ESSERE ESATTA.** `convertiPeso` torna `null` quando
passare di scala farebbe sparire o comparire quantità — mezzo grammo su un
articolo che si conta a grammi interi non è né zero né uno — e la maschera
rifiuta nominando i due numeri. È l'unica eccezione al divieto di convertire le
unità, e sta in un punto solo: KG e GR non sono due unità diverse, sono la
stessa grandezza in due scale, e il fattore è esatto.

**IL CAMPO DI RICERCA CHE MOSTRAVA `<svg class=`.** `_ico()` restituisce markup
con le virgolette doppie; dentro `placeholder="…"` il parser chiude l'attributo
alla prima virgoletta di `class="ico"` e il tag `<input>` al primo `>`, che è
quello di `<use href="#i-search"/>`. Tutto ciò che veniva dopo — l'`oninput` —
non veniva mai applicato. Erano tre, non due: registro, anagrafica articoli e
Prodotto Finito, quest'ultima mai segnalata perché un campo che non filtra
sembra un campo vuoto. La correzione è togliere l'icona dal placeholder, come
fanno già i quattro campi ricerca sani; la garanzia che non torni è una prova
che fallisce se un `_ico(` compare dentro il valore di un attributo.

### 2.26 — il servizio parla HTTPS, sulla stessa porta

**IL CHIOSCO ERA UNA SCHEDA CHE SPIEGAVA PERCHÉ NON FUNZIONAVA.** La 2.25
aveva manifesto, icone e stato leggibile, e uno stato che diceva sempre la
stessa cosa: `non-sicuro`. Nessun browser installa una pagina servita in
chiaro, quindi finché il servizio rispondeva su `http://` non c'era niente da
installare. La 2.26 toglie la causa.

**IL CERTIFICATO LO FA WINDOWS.** `crea-certificato.ps1` usa
`New-SelfSignedCertificate` ed `Export-PfxCertificate`, che sono già nel
sistema. Arrivare da lì a una coppia PEM vorrebbe dire `openssl`, cioè un
eseguibile scaricato su un PC di magazzino — l'antivirus lo blocca, l'IT chiede
conto, ed è la stessa ragione per cui il servizio è un'attività pianificata e
non un servizio nativo con NSSM. Node legge il **PFX** direttamente, quindi la
conversione non serve a nessuno: `PATHFINDER_TLS_PFX` più la sua password, che
nasce a caso e finisce in una variabile di macchina. Le due variabili PEM
restano, e sono la strada per un certificato che arriva dall'IT;
`lib/tls.js` si rifiuta di scegliere se sono accese tutte e due.

**DUE CERTIFICATI, E IL SECONDO È QUELLO CHE FA RISPARMIARE IL GIRO DEI
TERMINALI.** Un'autorità locale — `CN=Pathfinder CA - <macchina>`, quindici
anni, chiave non esportabile — firma il certificato del servizio, che dura
cinque anni. Sui terminali si installa solo l'autorità. Alla scadenza si rifà
il secondo con `-Rinnova` e in corsia non si tocca niente; con un autofirmato
solo, ogni scadenza sarebbe un giro di tutti i terminali. La regola dei 398
giorni non morde: vale per i certificati che risalgono a un'autorità pubblica.

**GLI INDIRIZZI VOGLIONO `IPAddress=`, NON `DNS=`.** `-DnsName` scrive gli IP
come se fossero nomi, e un browser che apre `https://10.0.0.12:4173` non
accetta quella corrispondenza: lo script compone il SAN a mano — `2.5.29.17`
con nome macchina, nome completo di dominio, `localhost` e **tutti gli IPv4**
della macchina, più quelli passati con `-Nomi`. Un nome mancante qui è un
avviso rosso in corsia, cioè un chiosco che non si installa.

**UNA PORTA SOLA.** Il servizio resta sulla 4173: la superficie di rete
dichiarata a REP-IT-001 non cambia, e non cambia nemmeno il collegamento
salvato su ogni terminale. Davanti ai due server sta un `net.Server` che guarda
il **primo byte** e poi si toglie di mezzo — `0x16` è un saluto TLS, tutto il
resto è HTTP — e rimette il byte al suo posto con `unshift`, così il server che
riceve il socket legge dall'inizio come se niente fosse. Chi arriva in chiaro
non riceve `ERR_EMPTY_RESPONSE`, che non dice niente e manda a chiamare
l'assistenza: riceve un `301` verso `https://` sullo stesso host e sulla stessa
porta. Un socket che si apre e non parla si chiude da solo dopo quindici
secondi.

**QUEL CHE IL CODICE NON PUÒ FARE.** L'autorità va installata a mano su ogni
terminale, ed è un gesto umano come l'installazione (§0). Lo script stampa
l'impronta SHA-256 del `.cer` perché la si confronti prima di fidarsi: un file
di autorità che arriva da un'altra parte firma qualunque cosa.

### 2.25 — l'interfaccia sta dentro lo schermo, e si installa

**IL DIFETTO NON ERA NELLA TESTATA.** «Non si vedono tutti i tasti della barra
superiore» è la descrizione esatta di quel che succedeva, e per tre giorni
avrebbe mandato a cercare nel posto sbagliato. Una casella di griglia parte da
`min-width: auto`: non scende **mai** sotto il contenuto minimo di quel che
tiene dentro. Il contenuto minimo della testata è marchio + campo di ricerca +
operatore e stato, e un `<input>` senza `size` chiede venti caratteri: su una
striscia da 375px il minimo era **459px**. La griglia si allargava a 459, e con
lei si allargavano tutte e tre le righe — testata, vista e linguette. Fuori dal
bordo destro finivano l'operatore, il pallino del salvataggio e la **sesta
linguetta**, e non c'era modo di arrivarci perché `html, body` sono `overflow:
hidden`. La correzione è una riga — `.app-header, .mob-tabs { min-width: 0 }`,
più `.app-main` e i tre pezzi del campo di ricerca — e a stringersi è quel che
può stringersi.

**LE UNDICI LINGUETTE ANDAVANO A CAPO, NON A SCORRERE.** Configurazione ne ha
undici e chiedono 1030px in fila: `.app-main` è `overflow: hidden`, quindi
Stampanti, Regole di stoccaggio e Dati e Backup venivano **tagliate via**. Si
poteva far scorrere la fila; non si è fatto, perché una fila che scorre
nasconde lo stesso quel che c'è oltre il bordo, e la regola di §8 è che chi
guarda capisca **cosa non sta guardando**. `.prel-tabs` va a capo da sempre per
la stessa ragione.

**LO ZOOM SI TOGLIEVA PER UN MOTIVO VERO, E IL MOTIVO SI È TOLTO.** Il
`viewport` diceva `user-scalable=no, maximum-scale=1`: in un magazzino vuol
dire togliere la lente a chi legge un lotto stampato male. Stava lì perché
Safari su iPad ingrandisce da solo quando il fuoco entra in un campo che scrive
**sotto i 16px**, e la pagina resta ingrandita e spostata — che è l'altra metà
di «i tasti non ci sono più». Adesso il divieto non c'è e la causa nemmeno:
sotto `pointer: coarse` i campi partono da 16px, e il valore sta in un token
(`--md-fs-campo-tocco: max(16px, 1em)`) perché `testoAMano` in
`stileCoerente` è a zero e ci resta.

**`dispositivo-tavoletta` NON AVEVA UNA REGOLA.** La classe la mette
`_applicaDispositivo` dalla 1.11, e fra i 561 e i 1024 px l'applicativo usciva
con le misure della scrivania: bersagli da mouse su un vetro che si tocca. La
distinzione che la 2.25 scrive è che **la larghezza decide il layout, il
puntatore decide il bersaglio**: le `max-width` dicono quanto ci sta, `pointer:
coarse` dice com'è fatto il dito — e i 48px dei 560 smettono di dipendere dalla
larghezza. `100vh` è diventato `100dvh` (con la riga `vh` sotto, come ricaduta):
su un tablet la barra del browser compare e sparisce, e `100vh` resta fermo
sulla misura a barra nascosta.

**IL CHIOSCO È UN MANIFESTO, NON UN INTERRUTTORE.** `assets/chiosco.webmanifest`
più tre icone, `display: standalone`, `display_override: [fullscreen,
standalone]`: il terminale installa Pathfinder e lo apre dalla sua icona.
`modules/chiosco.ts` è puro come `dispositivo.ts` — entrano quattro fatti sulla
macchina, esce uno stato fra cinque — e la scheda in Configurazione → Sessione
lo scrive con la frase che dice il passo successivo. **`non-sicuro` non è
`in-attesa`**: senza HTTPS non si installa niente, e un'assenza senza motivo
manda a cercare il guasto dalla parte sbagliata. Il file si chiama
`chiosco.webmanifest` e non `manifest.json` perché in questo progetto
`manifest.json` è il manifesto del **pacchetto** — versione e impronta.

### 2.23 — il banco guarda lo schermo

**LE PROVE PASSAVANO TUTTE DA `fetch`.** Forti su quel che il magazzino
calcola, cieche su quel che l’operatore legge: un bancale «in baia» e uno
«saltato» potevano uscire grigi tutti e due mentre il database diceva due
cose diverse. Adesso c’è un banco che guarda il DOM — quindici flussi, 355
controlli, in `banco/video/` — e ogni prova confronta tre cose insieme: quel
che si **vede**, il **conto** rifatto a parte, e quel che è finito **a
database**, riletto dal servizio.

Ha trovato due difetti veri, tutti e due invisibili a una prova via `fetch`:
una riga con la chiave non maiuscola che non si poteva più toccare, e la
maschera di posizionamento che restava scrivibile mentre la scrittura era in
volo — il lettore attaccava il codice dopo a quello prima. **Il racconto
per esteso, con le misure, sta in §1 sotto «La 2.23.0».**

### 2.22 — la tappa dice a che altezza sta

**UN CODICE NON È UN GESTO.** La scheda del prelievo diceva
`MG1-SCA-04-06-2`, e chi è davanti allo scaffale doveva tradurlo da sé:
quale ripiano, contando da terra. Adesso accanto ai dati c'è la **campata
vista di fronte** — i livelli impilati come sono nella realtà, il terreno
disegnato sotto, e il vano da prelevare **acceso pieno**.

**GLI ALTRI LIVELLI PORTANO IL SOLO STATO.** Vuota, occupata, bloccata,
riservata, disattivata — le stesse cinque parole e gli stessi cinque colori
della mappa, perché è la stessa domanda e impararla due volte è impararla
male. Cosa c'è dentro **non si scrive**: un vano che non si deve toccare non
ha niente da spiegare a chi ha due secondi e i guanti.

**L'ECCEZIONE È IL LOTTO, E SI DICE A PAROLE.** Il modulo guarda dentro gli
altri livelli per una cosa sola: se tengono lo **stesso articolo con un lotto
diverso**. Quello non è contesto, è il modo in cui una mano finisce sul
pallet sbagliato — e **la scansione del vano non ne salva**, perché chi legge
l'etichetta del livello sotto scansiona un codice valido, solo non è il suo.
La banda gialla sta **con le bande e non in fondo**, per la stessa ragione
della banda del trasferimento: è quel che cambia il gesto, e leggerlo dopo
aver preso è tardi.

**SOLO LE SCAFFALATURE.** Zone a terra e alla rinfusa non hanno livelli:
`colonnaDi` torna `null` e non si disegna niente. È la regola della 2.1 —
la vista la decide la zona — e disegnare comunque vorrebbe dire disegnare,
su quelle zone, la cosa sbagliata. Torna `null` anche uno scaffale a un
livello solo: quella non è una colonna, è il codice che sta già in testa.

**NON C'È NIENTE DA PREMERE.** La scheda della tappa è aperta durante un
prelievo, e ogni bottone di questo applicativo scrive nel magazzino di
qualcuno: il disegno si guarda e basta, e una prova lo verifica cercando
`onclick`, `<button>` e `href` nella stringa.

**DOVE STA IL CODICE.** La domanda — *com'è fatta la campata che contiene
questo vano* — la fanno la scheda della tappa e, il giorno che servirà, la
mappa: quindi sta in un modulo **puro** suo, `modules/colonna.ts`, e non
dentro la vista. I codici dei fratelli li dà `generaUbicazioni`, mai una
`split('-')`: un id di zona può contenere un trattino, e spezzare la stringa
darebbe una colonna plausibile e sbagliata.

**IL VERDE DELLA TAPPA NON POTEVA ESSERE IL VERDE DELL'OCCUPATA.** Primo
disegno: `primary-container` `#A4F2D5` per la tappa, `success-soft`
`#B2F0CF` per i vani occupati. A schermo, e a un metro, sono lo stesso
verde: una campata con due livelli pieni diventava tre riquadri uguali.
Adesso la tappa è **piena**, come il numero della tappa in testa alla
scheda — la stessa cosa detta due volte, che è quel che serve quando la si
guarda per due secondi.

**LE MISURE.** Sopra i 700px la campata sta **di fianco** ai dati, larga
136px; sotto scende in fondo e si centra a 260px, e resta **verticale** —
una scaffalatura stesa in orizzontale non è più una scaffalatura. Guardata a
1000, a 480 e a 400px, che è la fascia dell'MC9400.

**LE PROVE.** `test/colonna.test.js` (**14**) sul modulo: l'ordine dei
livelli preso dalla configurazione e non dall'alfabeto, i cinque casi che
tornano `null`, e il rischio lotto — compreso il vano della tappa che **non
accusa se stesso** quando tiene due lotti dello stesso articolo.
`test/colonnaTappa.test.js` (**9**) sul disegno, letto come stringa: un vano
acceso solo, niente da premere, e `not.toMatch(/ART-|lott|coll/i)`, che è il
modo di provare che i livelli da non toccare **non portano informazioni**.

### 2.21 — il bancale si fa da sé, e il camion si carica scansionando

**La 2.20 aveva dato al bancale un'esistenza. La 2.21 gli dà il gesto** — di
chi lo fa in reparto e di chi lo carica sul mezzo.

- **LA MASCHERA DEL REPARTO È QUELLA DEL CARICO MERCE, e non per
  somiglianza.** Chi imballa il prodotto finito è la stessa persona che
  posiziona la merce in arrivo, e due maschere diverse per lo stesso gesto
  sono due gesti da imparare: ① articolo → ② lotto → ③ **colli pieni ×
  quanto dentro**, col collo incompleto che si aggiunge sotto — gli stessi
  due campi del posizionamento, e le stesse funzioni pure di `colli.ts`.
  Scadenza, ordine di produzione e modello stanno dentro un `<details>`:
  facoltativi, e chiusi.
- **IL MODELLO DI CARICO NON SI COMPILA: SI IMPARA.** Undicimila articoli non
  ricevono un formato perché qualcuno si siede a scriverlo — nessuno
  compilerebbe undicimila righe, ed è il motivo per cui i modelli esistono. Lo
  ricevono il giorno in cui il reparto imballa il **primo** bancale di
  quell'articolo: i colli pieni dichiarati diventano un modello `AUTO-<n>`, e
  dal bancale dopo il numero è già nel campo. **Un modello appreso non ha mai
  colli incompleti** — il collo spaiato è un fatto di quel pallet, non del
  formato — e **un articolo che un modello ce l'ha già non lo cambia da
  solo**: si impara una volta, si corregge in Parametri.
- **LA QUANTITÀ PER COLLO SI SCRIVE IN ANAGRAFICA, DA CHI HA IL COLLO IN
  MANO.** Se manca, il campo nasce vuoto e obbligatorio, e quel che si scrive
  lì finisce su `articles.pieces_per_pack`. È il gemello di
  `dichiaraConfezioneLotto`, che scrive sul lotto: il prodotto finito la
  cerca in anagrafica, perché il lotto **nasce qui** e chiederla a un record
  che non esiste ancora vorrebbe dire non trovarla mai.
- **L'ETICHETTA ESCE PRIMA DELL'UBICAZIONE, E QUELLO È L'ORDINE VERO.** Il
  pallet si etichetta al banco d'imballo; il vano lo scansiona chi lo posa, un
  minuto dopo e dall'altra parte del reparto. Quindi il bancale nasce **senza
  ubicazione** — uno stato che `assegnaAUdc` conosce dalla 1.12 — e la merce
  entra in giacenza solo quando il vano si scansiona. **Abbandonare lì non
  lascia merce che il sistema non sa di avere**: lascia un'etichetta da
  buttare, e l'elenco la dice in cima con un pulsante.
- **ARTICOLO E LOTTO SONO DUE COLONNE**, e su un bancale con più partite si
  legge **«LOTTI MULTIPLI — n partite»**, che è la stessa parola che l'etichetta
  su foglio e quella sulla Zebra scrivono sullo stesso pallet — sta in
  `descriviContenuto`, in un posto solo.
- **IL DDT E LA DATA DI SPEDIZIONE SI RILEGGONO, NON SI SCRIVONO.** I
  documenti evasi portano già la risposta: un campo sull'unità sarebbe la
  stessa cosa scritta due volte, e un DDT corretto dopo l'evasione lascerebbe
  l'unità a raccontare il numero vecchio. **E un bancale spedito non è
  vuoto**: le sue righe di giacenza non ci sono più, ma quel che portava lo
  dice il documento che l'ha portato via.
- **LO SCARICO A MANO CHIEDE UN NUMERO, E BASTA.** Destinatario, vettore e
  causale stanno già su un foglio che il gestionale ha stampato, e
  richiederli qui vorrebbe dire farli ricopiare a chi li ha davanti. **Si
  scrive comunque un documento**, e già evaso: senza, la colonna DDT
  resterebbe vuota proprio sui bancali che sono partiti, la packing list non
  si potrebbe più stampare, e il registro direbbe «uscito» senza dire con che
  cosa. L'evasione è quella di sempre.
- **IL CARICO DEL CAMION È UN GIRO, E LE TAPPE SONO BANCALI.** La serpentina
  è quella del prelievo — `PickRoute.ordinaPerCorsia`, dove quella regola già
  vive — e si scansiona **solo il codice del pallet**: articolo e lotto stanno
  sotto il cellophane, e chiederli vorrebbe dire chiedere di aprirlo. Un DDT
  per volta, e finito il primo il sistema chiede se se ne carica un altro:
  il camion ne porta più di uno, e uscire e rientrare da una schermata a ogni
  documento è il gesto che si smette di fare.
- **LA BAIA DI CARICO È UN TIPO DI ZONA, UNA POSIZIONE PER BANCALE.** Non è un
  vincolo di stoccaggio e non verifica niente: dice dove i pallet aspettano il
  camion. Una posizione per pallet non è comodità — due bancali dello stesso
  lotto nello stesso vano sono due righe con la stessa chiave e un saldo che
  dipende dall'ordine di caricamento, e `moveUdc` li rifiuta — ed è quel che
  fa vedere sulla mappa che cosa sta salendo sul mezzo.
- **UN DDT INCOMPLETO NON SI EVADE.** Un bancale che non si trova si salta col
  motivo, e quel documento resta pendente: evaderlo vorrebbe dire scaricare
  dalla giacenza un pallet che è ancora a scaffale, e la differenza si
  scoprirebbe all'inventario. Gli altri escono lo stesso.
- **SUL DDT UNA RIGA È UN ARTICOLO E UN LOTTO — MA SOLO IN STAMPA.** Chi
  riceve controlla «quanto di questo lotto è arrivato», e tre pallet dello
  stesso lotto scritti tre volte lo obbligano a sommare in banchina. Le righe
  **salvate** restano una per bancale, perché ci vivono sopra la packing list,
  l'evasione (che scarica dal vano dove la merce sta, e due bancali stanno in
  due vani) e la domanda «da quale pallet è uscita questa merce».
- **LA PACKING LIST DICE COM'È FATTO IL COLLO**, non solo quanti sono — «40 ×
  12,5 KG» — e chiude con un **riepilogo per articolo e lotto**: su dieci
  blocchi quel totale non si ricava guardandoli.
- **LE CASELLE DEI BANCALI SONO FATTE COME I VANI.** Angoli arrotondati, fondo
  tenue, bordo pieno: sono lo stesso disegno a due scale — un contenitore
  dentro un'ubicazione — e due grammatiche sullo stesso quadro si leggono come
  due cose diverse. **La tessera del prodotto finito ha un marchio suo**: la
  fabbrica non è il prodotto finito, è dove si fa.

**Quel che questo lavoro NON fa**: non tocca il conto di produzione, non
estende il Code128 a GS1-128 (voce 24), non aggiunge una collezione — la
sessione di carico sta in `meta`, ne vive una per volta e `pick_session` è
occupata dal giro di prelievo.

### 2.20 — il magazzino del prodotto finito

**Fino alla 2.19 il prodotto finito non esisteva come merce.** La produzione
registrava il *consumo* dei componenti — righe `consumo` e `chiuso` in `wip` —
e del prodotto restava una riga di testata letta dall'ODP, stampata sul
rapporto di prelievo e finita lì. Chi gestisce le spedizioni non aveva né un
elenco né una pianta di quello che era pronto a partire, e il carrello del DDT
si riempiva in un modo solo: articolo e lotto scansionati a mano, una riga per
volta.

**IL BANCALE È UN'UNITÀ DI CARICO, E NON SERVIVA UNA COLLEZIONE NUOVA.** Tre
campi facoltativi su `udc` — `kind: 'pf'`, `odp_num`, `model_code` — e tutto
il resto era già scritto: il codice che non si riusa, l'etichetta, lo
spostamento transazionale, il disegno dentro il vano sulla mappa. Assenti,
resta l'unità di carico della 1.12.

- **LA COMPOSIZIONE DEL BANCALE È UN DATO, NON UN CAMPO SU 11.197 ARTICOLI.**
  I formati veri sono una decina — EPAL a 8 × 5, mezzo bancale, il cassone — e
  scriverli articolo per articolo vorrebbe dire compilare undicimila volte la
  stessa riga: nessuno la compilerebbe. I **modelli di imballo** stanno in
  `meta.imballi`, l'articolo ne nomina uno, e da lì esce il numero di colli.
  **Il modello propone e non impone**: se il bancale vero ne porta 37 invece
  di 40, vince il bancale, e nessuno deve dire perché.
- **LA MASCHERA È DEL REPARTO, E IL REPARTO STA IN PIEDI.** Terminale da 4,3",
  guanti, due secondi di sguardo: ① articolo → ② lotto → ③ scadenza → ④ colli,
  il lettore che avanza da sé, e alla chiusura nasce l'unità, entrano le righe
  con causale **`PROD`**, e si apre subito la stampa dell'etichetta — un
  bancale senza etichetta è un bancale che nessuno può scansionare.
- **`PROD` È UNA CAUSALE SUA, E NON UN `IN` CON UNA NOTA.** Fra sei mesi la
  domanda «cosa ha versato la produzione» si fa filtrando una riga; un
  posizionamento con una nota non si filtra.
- **L'ORDINE DI PRODUZIONE È FACOLTATIVO**, per decisione: chi imballa non si
  ferma perché non ha il numero sotto mano. Il conto di produzione non è stato
  toccato — la resa e il confronto fra prodotto e consumato restano fuori.
- **UN BANCALE MISTO PASSA, E L'ETICHETTA NON INVENTA NIENTE.** Di norma un
  bancale porta un articolo e un lotto soli; se ne porta due la maschera lo
  dice — «misto — n partite» — e va avanti. Sull'etichetta i campi della merce
  restano **vuoti**: scriverci il lotto della prima riga sarebbe una bugia
  incollata al legno. Il dettaglio lo porta la packing list.
- **L'ETICHETTA DEL BANCALE È IL TERZO TIPO**, con un catalogo di campi suo e
  un layout suo in `meta.labelLayoutPf` — 70 mm sugli 80 del supporto vero.
  Quella della merce identifica una **riga di giacenza** (`item_key`), questa
  identifica il **bancale** (`udc_id`), che è l'oggetto che il muletto sposta
  e che il DDT nomina. La via su A4 resta, come per le altre due.
- **LA VISTA GRAFICA NON È UNA MAPPA NUOVA.** È la mappa, aperta sulla zona di
  prodotto finito, col filtro acceso: i bancali dentro il vano si tingono
  dello stato che hanno — pronto, impegnato su un DDT, spedito — e la legenda
  lo scrive. Una seconda pianta da tenere allineata alle zone sarebbe una
  seconda verità sullo stesso magazzino. **Il colore non è mai solo**: il
  titolo della casella porta lo stato in lettere.
- **DAL BANCALE AL DDT SI PASSA CON UNA SPUNTA.** Il bancale si carica intero,
  coi soli colli che nessun documento pendente ha già impegnato; una riga che
  non si può prendere si salta e il riscontro dice quale e perché. Il carrello
  resta di `spedizioni.ts`: la scelta dei colli e il conto delle UM erano già
  scritti lì, e una seconda copia sarebbe la seconda verità su come nasce una
  riga di DDT.
- **VUOTO E SPEDITO SONO DUE FATTI DIVERSI.** Un bancale svuotato in magazzino
  è un pallet libero; uno svuotato da un DDT è merce che sta su un camion.
  All'evasione i bancali del documento passano a `shipped`, e l'elenco li
  mostra diversi.
- **LA PACKING LIST NON È UNA COLLEZIONE NUOVA**: è un secondo modo di
  stampare lo stesso documento archiviato. Il peso lordo somma le tare al netto
  e **resta vuoto dove le unità non si sommano**: un lordo inventato finisce in
  bolla. **Dalla 2.24 il corpo del foglio è articolo → lotto → bancale**, e
  **tutti e due i documenti scorrono** — le due righe che dicevano «un bancale
  per blocco» e «il DDT resta a pagina sola» sono cadute: perché, sta scritto
  poco sotto.

### I due fogli che escono dal magazzino — 2.24

- **IL DDT DICE COSA C'È SUL CAMION, LA PACKING LIST DICE COM'È FATTO.** Sono
  due domande e non due formati, e fino alla 2.23 il secondo foglio rispondeva
  a una terza: «questo pallet cosa tiene», che è la domanda di chi scarica. Chi
  controlla la merce col DDT accanto ne fa un'altra — «questo articolo, in
  questo lotto, su quanti bancali è arrivato e quanto fa» — e su dieci blocchi
  quel numero non si ricavava guardandoli. Adesso il corpo è **articolo →
  lotto → bancale**, tre livelli di riga, e **ogni livello porta il suo
  totale**: un livello che non somma sarebbe un elenco indentato, non una
  distinta. Il codice del pallet resta, al terzo livello, dove chi scarica lo
  cerca.
- **SEI COLONNE SUL DDT, E SONO QUELLE CHE SI CERCANO IN BANCHINA**: articolo,
  natura e qualità, lotto, scadenza, colli, **quantità e unità in due celle**.
  Erano otto: il numero di riga progressivo — che nessuna norma chiede, e chi
  controlla non cerca «la riga 4», cerca un lotto — e le Note in colonna, 24 mm
  per un testo libero. Le note sono scese sotto la descrizione, dove hanno la
  larghezza del foglio. **La quantità stava in 13 mm con `nowrap`**, ed è il
  difetto che si vedeva: «1.250,00 KG» non ci sta, e `nowrap` non manda a capo
  — sbordava sotto la colonna accanto. Adesso il numero ha 22 mm e l'unità i
  suoi 14: **incollata, l'unità si legge una riga per volta; separata, si legge
  in colonna** e si vede subito che un DDT porta chili e pezzi insieme.
- **ANCHE IL DDT SCORRE, e la 2.20 aveva deciso il contrario.** «Il DDT resta a
  pagina sola» era una scelta buona — accompagna il trasporto — ma **niente la
  faceva rispettare**: un documento con molte partite usciva lo stesso su due
  fogli, e il secondo arrivava **senza testata, senza il numero del DDT e a
  filo carta**. Chi lo trova in mano non sa nemmeno di che documento è la
  seconda metà. Fra un secondo foglio che non esiste e un secondo foglio che si
  presenta, il secondo.
- **IL MARGINE STA SULLA PAGINA, E IN UN POSTO SOLO.** Stava in due: una
  `padding: 12mm` su `#printReport`, che vale per la **prima** pagina e basta,
  e `padding: 0 12mm` sulle celle del documento che scorre, che era il modo di
  rimediare alla prima. Adesso lo dà `@page { margin: 12mm }`, che è dove il
  margine di una pagina sta, e vale per ogni foglio di ogni documento. **Le
  misure non cambiano di un millimetro** — 297 − 24 = 273 mm, 210 − 24 =
  186 mm — sono gli stessi numeri su cui le colonne sono tarate.
- **IL NUMERO DI PAGINA SI CHIEDE, E NON SI PROMETTE.** `@page` porta
  `@bottom-right { content: "pag. " counter(page) " di " counter(pages) }`:
  è **l'unico posto** da cui si arriva a `counter(page)`, e un documento che
  scorre non sa da sé su quale foglio sta. Le *page margin box* Chromium le ha
  da poco e **il banco non sa misurarle** — prende le regole da `@media print`,
  e quelle stanno dentro `@page`. Dove il browser non le sostiene non esce
  niente e non si rompe niente. **Per questo il conto delle righe sta ANCHE nel
  piede ripetuto** («DDT n · 10 righe in totale»), che funziona ovunque: senza
  numeri di pagina, è quello che fa accorgere chi riceve che manca un foglio.
- **LE FIRME SI FIRMANO UNA VOLTA.** In un documento che scorre il piede sta
  nel `tfoot`, che è il gruppo che il browser ristampa su **ogni** pagina: le
  tre righe da firmare uscivano su tutte, e chi firma non sa quale valga.
  Adesso stanno in coda al corpo, che finisce una volta sola. Valeva per tutti
  e quattro i documenti che scorrono, non solo per i due delle spedizioni.
- **E LE TRE FIRME DELLA PACKING LIST NON AVEVANO NOME.** Erano passate come
  **coppie** — `['Preparato da', operatore]` — dove `_docPageHTML` legge `role`
  e `hint`: le etichette uscivano **vuote** da quando il foglio esiste. Nessun
  errore, nessun tipo che si lamenta, e `_esc(undefined)` torna stringa vuota
  senza dire niente. È la stessa famiglia del campo che non arrivava a
  database, qui in mezzo.
- **IL FOGLIO SI È SEPARATO DALLA STAMPA**, e serviva al banco. `_printDDT`
  leggeva dallo Store, componeva il foglio e stampava, tutto insieme: il banco
  a video poteva misurare solo i documenti già a database, e nella copia di
  prova un DDT ha **una riga**. Sono fogli che non hanno niente da impaginare,
  e **la 2.23 è passata verde su un foglio vuoto**. Adesso `_ddtFoglioHTML` e
  `_packingFoglioHTML` compongono, `_printDDT` e `_printPackingList` leggono e
  stampano — e il banco passa un **carico pieno** (dieci partite su ventisei
  bancali, due unità che non si sommano, descrizioni lunghe) senza scrivere
  niente a database. Il markup resta in una copia sola.

- **IL CONTO TERZI NON SCARICA: SPOSTA.** Una causale marcata «la merce si
  sposta» accompagna merce che resta nostra: all'evasione i bancali cambiano
  ubicazione e vanno nel vano del sito terzista, che sta già sulla mappa, con
  `/api/op/moveUdc` — transazionale, una riga di registro per partita, e il
  rifiuto se nel vano d'arrivo la stessa chiave sta già fuori dall'unità. **Le
  causali già salvate non cambiano da sole**: la spunta si mette una volta.

> **IL CAMPO CHE NON ARRIVAVA A DATABASE, E L'HA TROVATO IL BANCO.**
> `dest_location` si scriveva a video e non compariva nel documento:
> `savePendingOutbound` e `updatePendingDoc` ricostruiscono il record **campo
> per campo**, come `rigaDocumento` per le righe, e ciò che non è nominato lì
> si perde **in silenzio**. È la trappola di §7 pagata una seconda volta, su
> un altro record. E lo snapshot della maschera di correzione non copiava la
> causale, quindi il campo non sarebbe mai comparso: due difetti in fila sullo
> stesso dato, e nessuno dei due dava errore.

**Quel che questo lavoro NON fa**: non tocca il conto di produzione (la resa
resta fuori), non estende il Code128 a GS1-128 (voce 24), non cambia le regole
di stoccaggio — una zona di prodotto finito non è una regola, è un posto.

### 2.19 — le etichette escono dalla stampante

**Il vincolo che decide tutto il resto: un browser non apre un socket TCP.**
Non c'è un'API che lo permetta, nemmeno verso un indirizzo della rete locale,
e la porta 9100 di una Zebra vuole esattamente quello. Le altre due strade —
Zebra Browser Print, un programma da installare su ogni macchina, o un driver
di stampa — lasciano scoperto l'**MC9400**, che è Android e dove l'applicativo
è una pagina. **A parlare alla stampante è quindi il servizio**, che c'è già,
è già l'arbitro di §8, e serve la scrivania e il terminale con lo stesso
codice. Zero dipendenze nuove: `net` e `dns` sono moduli di Node.

**L'indirizzo non arriva mai dalla richiesta.** Il client manda un
`printer_id` e la chiave di un record; host e porta si leggono da
`meta.printers`. Senza questo, la rotta sarebbe il modo di scrivere byte
arbitrari su qualunque `host:porta` raggiungibile dal server, con la
credenziale di un operatore qualsiasi. E siccome `meta` la scrive chiunque
abbia una sessione — il guardiano dei ruoli difende `operators`, non `meta` —
di quel record **non ci si fida comunque**: la porta sta in un elenco chiuso
(6101, 9100-9103; senza, una «stampante» a `127.0.0.1:5432` fa parlare il
servizio col proprio PostgreSQL) e l'indirizzo **si risolve prima di
connettersi** e deve essere privato, o il servizio diventa un ponte verso
l'esterno.

**L'etichetta la costruisce il servizio, non il browser.** In regime GMP
un'etichetta è un documento, e un documento costruito dal client si falsifica
scrivendo in una console: il servizio rilegge la riga da database e scrive lui
lo ZPL. Le barre le disegna il firmware con `^BC` — `modules/code128.ts` resta
quello dell'A4 e non viene duplicato, la cifra di controllo non si riscrive
due volte, e quel che deve coincidere fra le due strade è la sola stringa
codificata: `item_key` o `udc_id`.

**«INVIATA» NON È «STAMPATA», ED È IL PUNTO PIÙ PERICOLOSO DELLA FUNZIONE.**
La porta 9100 accetta i byte e chiude: carta finita, testina aperta e nastro
esaurito **passano tutti come successo**. Chiamarlo «stampata» vorrebbe dire
che al primo rotolo finito il magazzino continua a creare pallet che nessuno
può scansionare — che è esattamente ciò che §8 dice di un UDC senza etichetta.
Quindi il servizio manda, poi **chiede `~HQES`**, e la maschera dice quale dei
due fatti sta mostrando: verde se la macchina ha risposto e sta bene, **rosso
se ha risposto con un errore** (inviata, ma l'etichetta non è uscita), giallo
se non ha risposto affatto — che non è un guasto, è un server di stampa che
quel comando non lo conosce, ma non è nemmeno una conferma.

**Il layout è un dato, e i millimetri si vedono mentre si scelgono.** Otto
campi, ognuno con altezza in mm, allineamento e righe di testo; il totale sta
in fondo alla scheda confrontato con l'altezza del rotolo. Quello di serie è
tarato sul supporto vero — **adesive staccate 100 × 80 su testina a 203 dpi**,
la serie ZD200 del magazzino: occupa **68,5 mm degli 80**, e gli 11,5 che
restano non sono spazio sprecato. Su un'etichetta staccata il registro balla
di un millimetro o due a ogni avanzamento, e un campo a filo del bordo è un
campo che prima o poi si taglia. I corpi sono grandi perché chi legge ha i
guanti: il peso, che è il numero cercato per primo, ha il corpo del codice
articolo. Non sono le misure dell'etichetta su A4 (100 × 60), e non devono
esserlo — quella è un ripiego su foglio e non deve imitare il rotolo. Un layout più alto
del supporto **il servizio lo rifiuta, non lo tronca**: un'etichetta troncata
esce con l'aria di essere giusta e le manca l'ultima riga, che nel layout di
serie è il peso, e chi la incolla non ha modo di accorgersene.

- **Il «peso» è la quantità in UM, e si intitola per quello che è**: su KG e
  GR la riga dice «Peso», su PZ, MT e LT dice «Quantità». Il numero è lo
  stesso campo — `qty_uom` — ma un'etichetta che chiama peso dei pezzi manda
  fuori strada chi la legge sei mesi dopo. Senza unità la riga resta vuota:
  una parte dell'anagrafica non ce l'ha ancora (voce 52), e un peso senza
  unità non è un peso.
- **L'ubicazione nasce spenta e si intitola da sé** — «invecchia». §8: un
  pallet si sposta, e quel che è stampato resta incollato alla merce a dire
  una cosa che non è più vera.
- **L'etichetta dell'unità di carico non ha un layout, ed è una decisione.**
  Un pallet porta N righe di N articoli diversi: descrizione, scadenza e peso
  non sono nemmeno *definiti* per un'unità di carico. Quel che si configura è
  il **supporto**, che sta sulla stampante.
- **La dimensione X minima è un rifiuto, non un consiglio.** Sotto 0,25 mm le
  barre si fondono al primo calo di calore, e il modulo minimo sale con la
  testina — 2 punti a 203 dpi, 3 a 300. Un codice che non ci sta a quella
  larghezza **non si stampa**: §8 dice già per l'A4 che stampare barre che
  nessun lettore legge è peggio che non stamparle.
- **Quattro caratteri romperebbero il comando** — `^ ~ \ _`. Una descrizione
  che ne porta uno non stampa un carattere storto: **spezza il campo**, e da
  lì in poi la testina legge come comandi i byte del testo. Si risolve con
  `^FH` e gli escape esadecimali, che non tolgono e non sostituiscono niente:
  un'etichetta GMP che riscrive in silenzio il dato che porta è peggio di una
  che non esce.
- **La stampante si ricorda, le copie no.** Chi ha scelto una stampante ci sta
  accanto per tutto il turno, e il ricordo sta nel `localStorage` di quel
  browser — a database vorrebbe dire che l'ultimo terminale che sceglie decide
  per tutti. Le copie tornano sempre a 1: un'eccezione che si ricorda smette
  di essere un'eccezione, e sei etichette uguali attaccate a merce diversa
  sono un difetto peggiore di sei etichette buttate. Tetto a 50 per invio, che
  non è un limite tecnico ma un dito che scivola.
- **Una stampante alla volta**: la 9100 accetta una connessione per volta, e
  con più terminali sulla stessa macchina le richieste si mettono in fila —
  stessa disciplina delle transazioni di §8, su una risorsa che non è il
  database. Stampanti diverse restano parallele.
- **Pathfinder non manda mai `^MN`, `^MM`, `^MD`, `^JUS`**: supporto, calore,
  spellicolatore e salvataggio permanente sono configurazione della MACCHINA,
  si fanno col pannello e valgono per tutti. Il giorno che l'applicativo li
  spedisce a ogni etichetta, l'applicativo possiede la configurazione delle
  stampanti.
- **Chi ha stampato cosa va nel registro del servizio, non in `mov_log`**: una
  ristampa non muove merce.

**Il banco alza una finta Zebra.** Una stampante ZPL è un server TCP che
ingoia byte: `server/test/collaudo-stampa.js` ne accende una sulla 9100 e
legge quel che le arriva — **78 prove**, fra cui le tre che contano davvero:
con la carta finita l'invio riesce lo stesso, lo stato lo dice, e cinque
richieste insieme escono tutte e cinque. Il conto dei millimetri è scritto due
volte — client e servizio — e `test/stampanti.test.js` importa il modulo del
servizio per confrontarli riga per riga: due copie che divergono in silenzio
sono due verità.

### 2.17 — il limite di ritenzione non c'era

**`LOG_RETENTION_DAYS = 2192` È USCITO DAL CODICE.** Sei anni esatti, in una
costante, e **non cancellavano niente**: la purga è uscita con la 2.1 (§8), e da
allora quel numero finiva in **tre etichette a video** — il badge della scheda
Dati, il paragrafo sotto, e la testata del registro movimenti.

Il paragrafo si contraddiceva dentro sé stesso, in quattro righe: «**Nessun
record viene mai cancellato**, né automaticamente né a mano. Il registro
movimenti è conservato per **2192 giorni (6 anni)**…». Chi legge non sa quale
delle due credere, e la risposta era la prima. **L'etichetta sottodichiarava il
sistema**: chi le avesse creduto, a sette anni dal fatto, avrebbe cercato un
movimento convinto che non ci fosse più — e invece c'è.

**E sei anni non li chiede nessuna norma.** Cercate il 02/09:

| Regime | Quanto | Su cosa |
|---|---|---|
| GMP medicinali (EudraLex Vol. 4, cap. 4) | scadenza del lotto **+ 1 anno**, o **5 anni** dalla certificazione del QP — il maggiore | documentazione di lotto |
| Legge alimentare (Reg. 178/2002 art. 18) | **nessun minimo**. La guida della Commissione raccomanda **5 anni**; shelf-life > 5 anni → *+ 6 mesi*; deperibili con TMC < 3 mesi → **6 mesi** | rintracciabilità |
| **Art. 2220 c.c.** | **10 anni** dall'ultima registrazione | scritture, fatture, lettere — **e i DDT**, che Pathfinder emette |
| GMP Annex 11 | quanto il record che documenta | audit trail |

Sei stava **in mezzo fra 5 e 10, senza fonte**. Il regime primario qui è quello
alimentare, ma l'applicativo archivia DDT: il numero che governerebbe davvero è
**10**, non 6. **Per quanto si tenga il registro lo dice la SOP** — e a quel
punto è una politica di backup e di database, non una costante compilata dentro
un pacchetto.

Adesso le etichette dicono quel che il codice fa: «**nessuna cancellazione**» e
«**non ha una scadenza dentro l'applicativo**». Tolti anche due import morti —
`LOG_RETENTION_DAYS` in `app.ts` e `LOG_RETENTION_MS` in `configDati.ts` — che
nessuno usava.

**Non è stato toccato `documenti/IT-TECH-SHEET.md`**, che in due punti dice
ancora «tenuta a sei anni»: è un documento controllato, REP-IT-001 **rev01**, e
cambiarne il contenuto senza alzare la revisione è a sua volta un difetto di
gestione documentale. Sta nella **voce 82**.

**Installata il 02/09.** Impronta `b6b24d70…`, 1.903.362 byte in 4 file. Il
bundle servito è quello del pacchetto, la porta risponde **401** senza sessione,
e `app\precedente` porta la 2.16.

### 2.16 — il punto zero

**L'ULTIMO ADMIN NON SI TOGLIE DA SOLO, E ADESSO LO DICE IL SERVIZIO.** §8 lo
scriveva dalla 2.13, ma la regola viveva soltanto in `configOperatori.ts`: il
servizio chiedeva «sei Admin?» e nient'altro, quindi una `PATCH` mandata da un
Admin che si retrocede passava. È **la stessa falla della voce 66**, un piano
più in là. **Non è un fastidio, è un vicolo cieco**: senza Admin la
Configurazione non si apre, il codice di ripristino pretende `role === 'admin'`
e la finestra del primo avvio guarda i PIN, non le cariche — resterebbe la sola
chiave di macchina. **Visto succedere**: rimettendo il difetto, il banco alza
undici prove rosse e dalla prima `PATCH` in poi ogni cosa risponde 403,
compresa la ricreazione del primo Admin.

*Come si controlla.* Non si indovina la forma della richiesta: **si simula**.
Le mutazioni sull'anagrafica — `POST`, `PUT`, `PATCH`, `DELETE`, `bulk`,
`clear`, `deleteWhere`, ogni operazione dentro una `/tx` — si riducono a
quattro verbi, si applicano a una copia dell'anagrafica e si guarda com'è
rimasta. **Il reset dei dati resta permesso**, e deve: svuota tutto, nessuno
resta con un PIN, e la finestra del primo avvio si riapre da sé. La chiave di
macchina passa, perché §8 la dichiara uscita di servizio. Otto prove nuove al
banco della gerarchia (32 → **40**).

**IL REGISTRO NON DICE PIÙ NUMERI CHE SI CONTRADDICONO — voce 33.** Due domande
diverse, che erano diventate la stessa e sbagliata.

1. **Quanto è cambiata la riga.** `qty_delta` poteva contraddire i propri
   estremi: un `PICK` scriveva `null` fra `before 10` e `after 9`. Adesso, se i
   due estremi ci sono, la variazione è **la loro differenza**, calcolata al
   punto di scrittura: l'aritmetica batte il chiamante. `null` resta il «non si
   sa» dei movimenti storici e vale solo se manca un estremo.
2. **Quanti colli hanno cambiato posto.** *Non è la stessa cosa*, ed è il pezzo
   che mancava. Un trasferimento di riga intera lascia la quantità dov'era e
   cambia il vano: la variazione è **0** e i colli mossi sono **tutti**. Chi
   leggeva `Math.abs(qty_delta)` — KPI, cruscotto, registro attività —
   **contava zero**. Misurato sul dump del 31/08: **22 trasferimenti veri**,
   fino a 26 colli l'uno, valevano zero nei conti.

Le due regole stanno in **`src/modules/registro.ts`**, modulo puro nuovo, con
tredici prove in `registro-completo.test.js`.

**LA MERCE SI NOMINA ANCHE QUANDO SI MUOVE IN BLOCCO — voce 34.** La voce
chiedeva chi scrivesse `EDIT` e `MOVE` con articolo e lotto vuoti. **Risposta
trovata nel dump del 31/08**, che ne porta due con la nota in chiaro: «Unità di
carico creata: UDC-000001» e «Unità di carico UDC-000001 — 0 righe · trascinata
sulla mappa». Sono **operazioni sull'unità di carico scritte nel registro della
merce**, e hanno la forma esatta della voce 34 — un `EDIT` e un `MOVE` sullo
stesso vano nello stesso minuto.

Due conseguenze, e la seconda è quella che conta.

- Il contenitore ha adesso **una causale sua, `UDC`**: nasce, si sposta e si
  chiude senza fingersi merce. `MOV_LABELS` la chiama «Unità di carico», e
  `registro-completo.test.js` la mette fra quelle che non muovono merce.
- **Lo spostamento di un'unità scriveva UNA riga sola, e non nominava niente.**
  N partite cambiavano vano e il registro non diceva quali: non è un'etichetta
  storta, è **la firma GMP che manca**. Adesso il servizio scrive **una riga per
  ogni partita** — articolo, lotto, da dove a dove, quanti colli, chi ha
  firmato — dentro la stessa transazione, dove le righe si conoscono davvero.
  Lo stesso da file, dove non c'è un servizio a cui chiederlo. Due prove nuove
  nel collaudo del servizio (139 → **141**).

E la firma di quella riga è **una persona**: prima ripiegava su `SERVIZIO`,
adesso ripiega sulla sessione e `SERVIZIO` resta alla sola chiave di macchina.

**UN DIFETTO GRAVE TINGE DI ROSSO LA CORSA — voce 50.** `difetto()` scriveva la
riga nel verbale e la prova risultava passata. **Visto di nuovo il 01/09**: il
banco del ciclo ha alzato `Q1` — «0,75 KG non si ritrovano da nessuna parte» —
e vitest ha detto «47 passed». Adesso `gira.cjs` esce **1**.

*Quali severità fermano la corsa: solo `grave`.* `dato` no, e non è pigrizia:
dice che l'anagrafica è incompleta, non che il codice sbaglia, e finché le voci
5 e 58 sono aperte tingerebbe di rosso ogni giro per sempre. **Si guarda l'ora,
non l'elenco**: `difetti.json` non si svuota mai e le righe vecchie sono
memoria, quindi rossa la fanno solo quelle della corsa in corso.

**SERVITO, «NON SALVATO» ERA UNA BUGIA ROSSA.** `_touchMeta` alza
`unsavedChanges` a ogni mutazione, e **da quando il salvataggio a mano non c'è
più (2.1) nessuno lo riabbassa**: su una macchina servita l'indicatore in barra
restava rosso per sempre e diceva a chi lavora che la merce appena scansionata
poteva perdersi. Non è vero — la riga è in PostgreSQL prima che la chiamata
torni. Servito dice adesso **«In linea»**, e la Dashboard **«Ultima
scrittura»** invece di «Ultimo salvataggio». Da file non cambia niente, perché
lì il checkpoint esiste davvero.

**CINQUE ICONE USCIVANO MONOCROMATICHE.** `✏️ ⚠️ ⚙️ ℹ️ ♻️` hanno presentazione
**testuale** di serie: scritti nudi il browser li disegna come glifi di testo.
La matita di «Modifica» usciva larga 14px contro i 19,2 della forma a icona, e
**su schermo si leggeva come un trattino** — un pulsante che non dice più cosa
fa. L'avviso usciva come un triangolo grigio invece del segnale giallo, e in
GMP un avviso che non si legge come avviso è un avviso che non c'è. **101
selettori `U+FE0F`** aggiunti in 27 file, misurato in pagina.

**Le frecce restano nude, e non è una dimenticanza**: `↔ ▶ ↩` marcano il tipo
di riga dentro tabelle dense, e da icone diventerebbero colorate e più pesanti
di quel che accompagnano. Lo tiene `test/emojiVestite.test.js`.

**Il banco della gerarchia va da 32 a 40 prove; il collaudo del servizio da 139
a 141; `npm test` da 42 a 43 file.** Le due voci rosse del banco del ciclo sono
chiuse — 70 e 71 — e le sue 47 prove sono tutte verdi.

**Installata il 02/09.** Impronta `111d58b5…`, 1.903.224 byte in 4 file. Il
bundle servito è quello del pacchetto, la porta risponde **401** senza sessione,
e `app\precedente` porta la 2.15.

### 2.15 — l'installer impara a togliersi, e smette di murarsi dentro

**Installata il 01/09 notte, in servizio fino al 02/09.** Impronta
`7b812c48…`, 1.901.483 byte in 4 file, riproducibile — due build di fila dello stesso
albero danno la stessa impronta.

**L'APPLICATIVO NON CAMBIA DI UNA RIGA.** Cambia solo il numero, e cambia
l'installer. È la prima versione di questo progetto che nasce da una
manutenzione della consegna e non da una richiesta di magazzino: la 2.14 è
stata installata su una macchina rifatta da zero, e la prima installazione —
quella strada che nessuno esercitava da mesi — si è rotta due volte.

**L'INSTALLER SI CHIUDEVA LA PORTA IN FACCIA DA SOLO.** In fondo al passo del
servizio stringeva i permessi della radice con un `icacls` solo,
`/inheritance:r` e `/T` nella stessa riga: quella coppia scende su ogni figlio
e gli toglie gli ACE ereditati, mentre i `/grant` restano sull'oggetto
nominato. Restano file con l'**elenco vuoto**, e un elenco vuoto nega tutto —
anche a un Amministratore, anche solo per leggere di chi è il file. Il passo
dopo doveva lanciare `installa-versione.ps1` **da quella cartella**, e trovava
«Accesso al percorso negato» che PowerShell segnala come comando non trovato.
**E `icacls` usciva con zero**, quindi la riga a schermo diceva «Permessi
applicati» in verde.

La correzione è in tre pezzi, e nessuno dei tre è la stessa cosa:

- **due gesti invece di uno** — l'elenco si scrive sulla sola radice, poi si
  spinge in basso con `/reset` **sui figli**, che dà a ognuno l'elenco
  ereditato dal padre. `/reset` sulla radice no: la rimetterebbe a ereditare da
  `C:\`, cioè disferebbe la blindatura;
- **la blindatura per ultima**, dopo l'applicativo. Così è l'ultimo gesto che
  tocca il disco, copre anche `app\` — che prima restava fuori perché non
  esisteva ancora — e la Verifica passa **dopo** di lei;
- **una guardia che apre un file davvero.** `Test-Path` risponde `True` anche
  su un file murato, ed è così che il difetto è passato per mesi.

> **Era anche la spiegazione di `C:\Pathfinder_block`**, la cartella che il
> 31/08 notte non si lasciava cancellare in nessun modo: stessa firma esatta —
> cartella sana, file impenetrabili, ACL illeggibili. Non era OneDrive né un
> antivirus. Era questa riga, a un'installazione di mesi prima. Voce 75.

**E L'INSTALLER ADESSO SA ANCHE TOGLIERSI.** Fino alla 2.14 disinstallare era
un elenco di gesti a mano — fermare l'attività, togliere la regola del
firewall, cancellare cinque variabili, cancellare la cartella — e il 31/08 quel
lavoro è costato una serata, con quarantacinque movimenti GMP salvati per un
soffio perché qualcuno si è ricordato di copiarli prima.

```powershell
.\installa.ps1 -Disinstalla -Prova              # dice cosa toglierebbe
.\installa.ps1 -Disinstalla                     # lo toglie
.\installa.ps1 -Disinstalla -AncheIlDatabase    # e toglie anche il database
```

**L'ordine è quello del danno crescente, e non è un dettaglio.** Prima si
**salva**: una copia fresca chiesta al servizio ancora acceso, poi tutta la
cartella `backup\` portata **fuori dalla radice**, sul Desktop. Se il
salvataggio non riesce, o riesce e non ci finisce dentro niente, **si ferma**.
Poi cadono le attività pianificate, la regola del firewall, il database se
qualcuno l'ha chiesto, le variabili, e per ultima la radice.

**Il database non cade da solo**, e nemmeno con una spunta: vuole
`-AncheIlDatabase`, e allora la parola da digitare non è più `DISINSTALLA` ma
**il nome del database**. Lo toglie `prepara-postgres.ps1 -Rimuovi`, cioè lo
script che quel database lo crea — ogni script disfa quello che fa — e cade
**prima** della radice: una cartella tolta con un database vivo si rifà in
dieci minuti, il contrario non si rifà affatto.

**Tre istruzioni, tre chiamate**: si staccano le connessioni aperte, poi
`DROP DATABASE`, poi `DROP ROLE`. `psql -c "a; b;"` avvolgerebbe tutto in una
transazione, e `DROP DATABASE` dentro una transazione non si può fare — costato
un giro il 01/09, a mano.

**Una radice lasciata da un tentativo fallito adesso si riapre da sé.** Il
01/09 un'installazione si era fermata a metà, e quella dopo è morta su
`Copy-Item : Accesso al percorso 'lib\db.js' negato`: i permessi erano già
stretti, e chi installa non ha modo di saperlo — vede solo un rifiuto su un
file di cui non ha mai sentito parlare. Ora l'installer se ne accorge, riapre
(`takeown` + `icacls /reset`) e lo dice. Cancellare no: quella è una decisione
di chi disinstalla.

**Un difetto l'ha trovato la prova a vuoto girando, non la lettura.**
L'inventario della disinstallazione scriveva `attivita: nessuna` mentre il
servizio girava: senza privilegi le attività di SYSTEM non si vedono, e
l'inventario si fa prima di elevare — apposta, così chi legge sa cosa sta per
succedere. Adesso quella riga dice che non è una misura, invece di mentire.

**Le prove: 33 → 43.** Otto nuove sulla disinstallazione — che il database non
cada senza chiederlo per nome, che si salvi prima di togliere, che il
salvataggio non finisca dentro la cartella che sta per sparire, che un
salvataggio vuoto fermi tutto. E **una vecchia allargata**: quella che verifica
che la password del superuser non passi per la riga di comando guardava un solo
blocco di elevazione e, arrivato il secondo, aveva smesso di guardare qualcosa
**senza dirlo** — la fetta usciva vuota e il confronto passava per caso. Ora le
raccoglie tutte e stampa quante ne ha esaminate.

**Cosa resta fuori dalla prova**: la corsa vera della disinstallazione. Le due
strade a vuoto sono state eseguite sulla macchina in servizio e non hanno
toccato niente; quella che cancella la lancia una persona, una volta sola, e
non c'è modo di provarla senza una macchina da perdere.

### 2.14 — la schermata WIP parte dalla merce, e un reso sbagliato si storna

**Installata il 01/09, in servizio per poche ore, poi archiviata.** Provata
al banco dal pacchetto. Impronta `8a25574b…`, 1.901.483 byte in 4 file.

Nasce da una richiesta di Andrea del 31/08: aprire il banco della 2.13,
provare al banco prelievo automatico e WIP, guardare la leggibilità dei campi
e le proporzioni delle maschere, tagliare il testo didascalico, e rifare la
struttura della schermata WIP — «non mi piace come vengono visualizzati
adesso [gli ODP archiviati], alla lunga non è efficiente».

**LA SCHERMATA WIP SI ENTRAVA PER NUMERO D'ORDINE, E LA DOMANDA È IL
CONTRARIO.** Fino alla 2.13 in cima c'erano tre righe di pulsantini — i conti
aperti, quelli serviti da un giro, gli archiviati — e ognuna si troncava a
otto. Per vedere che cosa ci fosse nel vano bisognava aprire gli ordini uno
per uno, e chi il numero non ce l'aveva in testa non arrivava alla merce. Col
magazzino vero davanti, la prima riga di merce cominciava **sotto il settanta
per cento dell'altezza dello schermo**: sopra c'erano quattro riquadri di
prosa.

Adesso il primo elenco è **quello che è fermo di là**: una riga per ogni
coppia ORDINE × ARTICOLO#LOTTO che ha ancora qualcosa fuori, con articolo,
descrizione, lotto, ordine, colli, quantità e da quando. Si ordina e si filtra
come ogni altra tabella (§8, `modules/tabella.ts`), e i due gesti — ↩ rendi,
🔥 consuma — stanno **sulla riga**. La regola è pura e sta in `inLavorazione`,
`modules/wip.ts`.

Sotto, un elenco compatto dei **conti aperti**: lì si chiude un ordine, si
stampa il rendiconto, si corregge un reso. **Chiudere è un gesto sull'ordine,
non sulla merce**, e sta dove sta l'ordine.

**L'ARCHIVIO È USCITO DA QUI.** Gli ordini chiusi sono il quinto genere di
**Archivio**, accanto a DDT, verbali, cartellini NC e report di prelievo:
stessa tabella che si ordina, si filtra e si cerca per data, e il rendiconto
si ristampa da lì. Un archivio che cresce ogni giorno e si sfoglia con gli
occhi non è un archivio. Dalla WIP ci si arriva con un pulsante che apre
Archivio già filtrato sul genere.

**UN ORDINE A RESIDUO ZERO ERA INVISIBILE, ED È UN BUCO DEL FLUSSO.**
`ordiniWipAperti` filtra su `residuo !== 0`: un ordine rientrato del tutto e
non ancora archiviato spariva da ogni elenco e si poteva riprendere solo
digitandone il numero — mentre restava vivo, e il file di produzione lo poteva
ricaricare. Sul banco ce n'era uno (l'ordine `123`) e nessuno l'aveva mai
notato. Adesso l'elenco dei conti aperti lo mostra con la sua etichetta,
**«tutto rientrato — resta da chiudere»**, e il pulsante che lo chiude.

**UN RESO SBAGLIATO SI STORNA, E NON SI CANCELLA.** Un reso finito nel vano
sbagliato, o fatto su una riga per un'altra, fin qui non aveva una via
d'uscita: la merce era a scaffale sotto una causale che diceva una cosa non
vera, e il conto era calato di colli che in reparto c'erano ancora. Si usciva
riposizionando a mano da Movimenta, e il conto restava storto lo stesso.

La maschera **elenca i resi** dell'ordine — quando, che cosa, quanto, dove è
andato, chi ha firmato — e su ognuno dice se si può stornare e perché no. Lo
storno riprende la merce **da dove era andata e con gli stessi colli**, la
riporta nel vano, e scrive un `in` che **nomina il reso che annulla**. Il reso
resta dov'è: chi legge il conto fra sei mesi vede il gesto e il ripensamento,
che è quello che è successo. Su un registro che non si cancella mai, cancellare è
la sola cosa che non si può fare — §8, «nessuna cancellazione di record».

Quattro cose che il codice ha dovuto imparare a scrivere, e che prima non
scriveva:

- **`reso_a`** — dove la merce è rientrata. Senza, lo storno doveva appaiare
  due righe del registro per data e sperare.
- **`reso_packs`** — **quali colli sono rientrati**, che non sono sempre
  quelli usciti dal vano: due sacchi da 20 escono e ne risale uno aperto con
  dentro 5, e a scaffale ci sono `[20, 5]` mentre il vano ne aveva persi
  `[20, 20]`. Sulle righe scritte prima, quando quel che è uscito pesa quanto
  quel che è rientrato i due elenchi sono lo stesso e si deducono; quando non
  torna, **lo storno si rifiuta e dice perché** invece di indovinare.
- **`reso_di`** — sul `consumo` che nasce insieme a un reso parziale, il nome
  del reso che l'ha fatto.
- **`storno_di`** — sul movimento di storno, il nome del reso che annulla.

Nessuno dei quattro tocca lo schema: la collezione `wip` indicizza quattro
colonne e il resto vive nel JSON. **Nessuna migrazione.**

**IL VUOTO DI UNA CONFEZIONE APERTA NON SI STORNA, ed è una decisione.** Se
un sacco è sceso pieno da 20 e ne è risalito uno con dentro 5, i 15 che
mancano sono finiti nel prodotto: rimetterli nel vano scriverebbe a magazzino
merce che non esiste. Lo storno riporta indietro **quello che è rientrato**, e
la maschera e la conferma lo dicono tutte e due prima di premere.

**Provato al banco, sui numeri, e non a vista.** Su una copia del magazzino
(`banco\db\ui.db`, dal `pristino.db` del 19/08) con ODP generati dalle
giacenze vere — `banco\genera-odp-wip.cjs`, nuovo, che i lotti li **legge dal
database** invece di scriverli fissi come faceva quello della 2.12. Due strade
esercitate capo a fondo:
| | prima | dopo il reso | dopo lo storno |
|---|---|---|---|
| reso intero — vano | 8 coll. · 160 KG | 6 · 120 | **8 · 160** |
| reso intero — scaffale | 55 · 1.100 | 57 · 1.140 | **55 · 1.100** |
| reso parziale — vano | 1 coll. · 25 KG `[25]` | vuoto | **1 · 10 `[10]`** |
| reso parziale — scaffale | 1 · 25 `[25]` | 2 · 35 `[25,10]` | **1 · 25 `[25]`** |

Sul parziale il conto chiude a 25 − 10 − 15 + 10 = **10 KG**, che è quello che
il vano ha davvero: i 15 restano a consumo, come devono.

**QUATTRO COSE CHE SI VEDEVANO SOLO GUARDANDO.** Sono uscite dal banco, non
dalla lettura:

1. **Il campo «Quantità da produrre» era largo 45 px** — 21 utili, e ce ne
   volevano 53 per leggere `380.25`. Scritto `w-28`, che con `--spacing` a un
   decimo di rem fa **2,8rem**, non i 7rem della scala di serie di Tailwind:
   è la trappola dei decimi (§8), e `w-28` era l'**unica** utility numerica di
   larghezza in tutto lo strato delle viste. Sul terminale a 480 px il campo
   scendeva a 31 px. Ora `w-[120px] shrink-0`.
2. **La scheda WIP non si raggiungeva dal terminale.** `.prel-tabs` era un
   flex senza `wrap` e senza scorrimento: a 480 px le quattro schede
   chiedevano 531 px e la quarta — WIP — finiva oltre il bordo. **Una scheda
   che non si vede è una funzione che non esiste.**
3. **I due gesti finivano fuori schermo.** Con sette colonne la tabella nuova
   sfondava i 480 px: per rendere un collo bisognava prima scorrere di lato,
   che con un guanto e un lettore in mano non è un gesto. Sotto i 620 px
   escono la data e la descrizione — il codice e il lotto identificano già la
   riga — e tutto sta dentro: misurato, 396 px su 396.
4. **Due parole uguali su due gesti diversi.** «Chiudi» dell'ordine stava due
   centimetri sopra «✕ Chiudi» della schermata, e nella conferma dello storno
   c'erano un «Annulla» che non fa niente e un «Annulla il reso» che muove
   merce. Ora **«Chiudi e archivia»** e **«Storna il reso»**.

**IL TESTO DIDASCALICO È STATO TAGLIATO DOVE SI RIPETEVA.** La maschera del
reso è passata da sette righe di spiegazione a due e si è dimezzata in
altezza; la testata della WIP da quattro riquadri a una riga; l'avviso delle
righe orfane nasce chiuso; e sulla schermata del giro la frase «vuoto = quella
dell'ordine» compare **sulla prima scheda e basta** — con cinque ordini
caricati si ripeteva cinque volte, e cinque copie della stessa istruzione non
insegnano cinque volte: si smette di leggerle tutte, compresa la prima.

**Una maschera sopra un'altra adesso si vede che è sopra**: la scelta dei
colli si apre dentro il reso, e col velo al 32% le due finestre erano
ugualmente accese. Il velo della seconda è più fitto.

**Cosa resta fuori dalla prova**: la corsia vera, con un operatore e un
terminale in mano.


### 2.13 — chi autorizza lo decide il servizio, e l'Admin ha una via di fuga

**Installata il 31/08, in servizio fino al 01/09** — poi la macchina è stata
riportata a zero (voce 74). Impronta `cbe71802…`, 1.882.735 byte in 4 file.

**LA GERARCHIA SCENDE NEL SERVIZIO, ed è la voce 66.** Fino alla 2.12 le
cariche vivevano nel client: la maschera chiedeva il PIN di un Team Leader e
poi mandava una `PATCH` come tutte le altre. Chi non passava dalla maschera
**non incontrava nessuna gerarchia** — bastava una sessione qualunque, cioè il
PIN del più giovane degli operatori, e una riga di `curl`, per scriversi
`role: "admin"` addosso. La 2.11 aveva chiuso la porta a chi non ha un PIN;
la 2.13 chiude l'anagrafica a chi ne ha uno e non ha la carica.

Tre eccezioni, e sono sempre le stesse tre: il **primo avvio** (il primo Admin
va creato, e non c'è ancora nessuno che possa autorizzarlo), il **token di
macchina** (backup, installer e migrazioni non hanno un PIN, hanno una
chiave), e il **rinnovo del PIN**, che non passa di lì perché ha una rotta sua.

**`POST /api/op/rinnovaPin` — il rinnovo passa dal servizio**, perché è il
servizio a sapere chi autorizza. Un Team Leader sulla collezione `operators`
non scrive niente: con una `PATCH` diretta non potrebbe rinnovare il PIN di
nessuno. La rotta verifica il PIN di chi autorizza, verifica la gerarchia
(l'Operatore lo rinnova un Team Leader, il Team Leader un Admin, l'Admin
chiunque) e riscrive.

**`POST /api/auth/recupero` — la via di fuga dell'Admin.** Un PIN smarrito si
rinnova, e chi lo rinnova è un grado più alto. **Sopra l'Admin non c'è
nessuno**, e con un solo Admin — che è ogni installazione appena nata — il suo
PIN perso è la Configurazione murata per sempre: nessuno può nemmeno nominare
un secondo Admin, perché si nomina da lì. È successo il 13/08.

Il codice è **venti caratteri dall'alfabeto di Crockford** — le dieci cifre e
ventidue lettere, senza I L O U — in quattro gruppi da cinque. Cento bit.
L'alfabeto non è un vezzo tipografico: è un codice che qualcuno stampa, mette
in cassaforte e sei mesi dopo ricopia a mano da un foglio, e uno zero letto
come una O lì dentro è la via di fuga che non funziona. La lettura perdona
spazi, minuscole, trattini mancanti, e riconduce I/L a `1` e O a `0`.

Quattro cose che valgono più della descrizione:

- **non è un secondo PIN**: non apre l'applicativo, apre soltanto la maschera
  che riscrive il PIN di quell'Admin;
- **si consuma nell'uso** — al posto suo ne nasce subito un altro, mostrato
  una volta sola;
- **sul disco non c'è mai il codice**, c'è la sua impronta (`rec_hash`,
  `rec_salt`, `rec_algo: scrypt`); dal servizio esce solo `rec_set`, vero o
  falso, che è l'unica cosa che la maschera chiede;
- **vale solo per il ruolo `admin`**: chi è Operatore o Team Leader ha già chi
  gli rinnova il PIN, e un secondo segreto sarebbe solo un secondo modo di
  entrare.

**IL FIX DI AVVIO DELLA 2.12.1 TORNA NEL SORGENTE.** Viveva in un pacchetto e
in una macchina, non in `server\` — §1. La 2.13 lo riporta byte per byte e gli
mette accanto **dodici prove che non aveva**, in `server/test/collaudo.js`:
quali errori si aspettano e quali no, che la scala dell'attesa raddoppi e si
fermi a otto secondi, che un database che sale al terzo colpo venga raggiunto,
che scaduto il tempo il messaggio dica che è scaduto il tempo, e che una
password sbagliata si scopra subito invece di far aspettare novanta secondi.
Si provano **da ferme**, con un orologio finto e un sonno finto: accendere un
PostgreSQL e spegnerlo a metà non è una prova, è una coincidenza.

**Il banco che prova le cariche è nuovo: `banco/gerarchia.cjs`, 32 prove** (**40** dalla 2.16).
Una regola imposta sul servizio si prova sul servizio — con `fetch`, coi
cookie veri, senza aprire un browser, su un database temporaneo alla porta
4198. Fra le domande che pone: che il Team Leader non si promuova Admin
nemmeno passando da una transazione o svuotando la collezione, che il codice
di ripristino **non esca mai da una risposta HTTP**, che quello speso non
valga più e quello emesso al posto suo apra a sua volta, e che dopo un reset
del database il primo Admin si possa ricreare.

Quell'ultima ha fatto uscire una correzione al guardiano: **il database si può
svuotare anche alle spalle del servizio** — un `.db` sostituito a mano,
`prepara-postgres.ps1`, un ripristino da backup — e in quel caso la risposta
«c'è già un Admin» tenuta da parte restava «sì» per sempre. Il servizio
rifiutava con un 401 anche l'unica richiesta che doveva passare, quella che
crea il primo Admin, e sotto il wizard si leggeva «Sessione non valida:
identificarsi» fino al riavvio del processo. Adesso, prima di dire di no, il
servizio ricontrolla — al più una volta ogni cinque secondi, e solo sul
cammino del rifiuto: chi lavora ha una sessione e non ci passa.

### 2.12.1 — il servizio aspetta il database

**In servizio dal 28/08 sera.** Impronta `4f2a9f0f…`, 1.864.994 byte.

Una build di prova nata da un guasto, non da un piano: il racconto del guasto
e di dove la correzione era finita sta in **§1**, le due difese
dell'accensione in **§7**. Nel sorgente ci è entrata solo con la 2.13, e con
lei le dodici prove che non aveva.

### 2.12 — il giro di prelievo, e il vano scansionato una volta

**27/08/2026.** Andrea: «mi trovo in difficoltà quando devo prelevare diversi
ordini di produzione dello stesso articolo». Cinque ODP della stessa serie
chiedono lo stesso lotto: prelevati uno alla volta sono cinque giri sulle
stesse corsie, e il primo che apre un collo lascia agli altri quattro un lotto
che a scaffale non basta più.

**Perché non è la 2.3.** La 2.3 divideva **il collo** — `quoteVano`,
`pianoUscita`, il giro conto, il reso che trabocca: quattro meccanismi nuovi
che dovevano stare in piedi insieme. Qui il collo non si divide: **la merce
scende una volta sola e sotto un numero solo, il capofila**, e gli altri ordini
stanno scritti sul movimento in `giro_odps` — non è un secondo conto e non
entra in nessun saldo. La ripartizione si dichiara **alla chiusura**, quando i
colli non ci sono più e ci sono quantità, che si dividono.

**Il prezzo, dichiarato:** fra prelievo e chiusura gli ordini non capofila non
hanno un conto proprio. Chi ne apre uno non si sente rispondere «nessun
movimento» — la risposta sbagliata alla domanda giusta — ma **«il conto di
ODP-2 lo tiene ODP-1»**, col pulsante che ce lo porta.

**Concatenare.** Un file **si aggiunge**, non sostituisce; un file illeggibile
lascia intatti quelli caricati. Lo stesso ordine due volte si rifiuta (chi
vuole il doppio lo scrive nella quantità). Un ordine già archiviato si rifiuta
**all'ingresso** e si ricontrolla comunque all'avvio, perché un altro terminale
può averne chiuso uno nel frattempo. Le righe che chiedono lo stesso articolo
**dallo stesso lotto** diventano una tappa sola con la quantità sommata; una
riga **senza lotto** non si fonde. Sulla tappa resta `richieste` — quanto ne
vuole ciascun ordine: serve al conto, non al cammino.

**Ricalibrare.** La distinta di Sage è proporzionale alla testata: il fattore si
applica al totale **e a ogni lotto**, coi decimali dell'unità di ciascuno. Si
riparte sempre da `lines_originali`: due ricalibrazioni di fila non compongono
i fattori. Campo vuoto = si torna alla quantità dell'ordine. Una testata senza
numero **non si ricalibra**.

**La sosta.** Le tappe pendenti contigue nello stesso vano sono una **sosta**:
l'ubicazione si scansiona una volta, gli articoli tutti. La chiave della spunta
ha perso `seq` — da `<tappa>@<vano>@<apertura>` a **`<vano>@<apertura>`** — e
non è un allentamento: quel che deve garantire è che l'operatore sia passato
davanti a quel vano in quest'apertura. Il campo ① sparisce a vano confermato e
al suo posto compare **↻ Riscansiona l'ubicazione** (non un campo disabilitato:
un campo che c'è e non si può usare è un campo che si prova a usare lo stesso).
`_renderRouteRun` non azzera più `_routeScan` a ogni disegno.

**Sui documenti.** Il rapporto di prelievo porta «Giro — ordini serviti»; il
rendiconto porta la stessa cella e, a quote scritte, **la ripartizione fra gli
ordini**. Le quote si leggono dalle **dichiarazioni di consumo**, non dalle
entrate: fra il chiesto e quel che finisce nel prodotto ci sono il reso e i
colli interi.

**Provata al banco la sera del 27/08**, sulla 4199, con copia del magazzino e
ODP **generati dalle giacenze** (`banco/genera-odp-2.12.cjs`) — i due soli
articoli che dichiarano unità **e** quantità per collo. Cinque ODP da
5+5+5+4+6 KG diventano **una tappa da 25 KG**, lo scaffale passa da 10
colli/200 KG a 9/175 col collo aperto a 15, il movimento porta `giro_odps`,
`giro_richieste` e `giro_id`, e alla chiusura le quote fanno **esattamente 25**.

**Tre difetti usciti lì, che leggendo non si vedevano:**

1. **La chiusura di un giro nominava solo il capofila** — su venticinque chili,
   venti erano di ordini che quella finestra non nominava, e la ripartizione si
   vedeva **dopo**, sul rendiconto. Adesso la conferma elenca le quote riga per
   riga prima di premere, e il pulsante si chiama «Dichiara, ripartisci e
   archivia».
2. **Ogni documento stampato diceva «Pathfinder 2.9»**: `VERSIONE_APP` fermo da
   tre versioni, e finisce sul piede di DDT, rendiconto, verbale, cartellino e
   rapporto. Ora `test/versioni.test.js` legge **tutti e quattro** i posti.
3. **`_routeStart` non apriva un'apertura nuova**: la spunta portava ancora
   quella del percorso precedente. Non faceva danno per caso, e da quando la
   chiave è il vano quella difesa non regge più.

**Cosa resta fuori dalla prova**: la corsia vera, con un operatore e un
terminale in mano.

### 2.11 — la porta (voce 64)

Era il difetto più grosso che l'applicativo avesse: **le rotte `/api` non
chiedevano credenziali a nessuno**. Chi raggiungeva la porta leggeva qualunque
collezione, ne scriveva qualunque record, e con una `DELETE` svuotava le
giacenze. Il PIN era una domanda che il client faceva a sé stesso.

- **L'ordine dell'avvio si è rovesciato**: `/api/load` vuole una sessione, e
  senza si aspetta davanti alla maschera **prima** di caricare una riga.
  Misurato al banco prima del PIN: in cache 3 operatori e nient'altro.
- **Un cookie, non un'intestazione.** Decide `EventSource`, che non sa mandare
  intestazioni; `HttpOnly` tiene il valore fuori da JavaScript (verificato:
  `document.cookie` risponde vuoto); `SameSite=Strict` chiude il verso opposto.
  **`Secure` solo con TLS vero**: su HTTP il browser lo scarterebbe in silenzio
  e nessuno entrerebbe più.
- **Il token non scade a tempo** — deciso da Andrea: un operatore buttato fuori
  a metà prelievo è peggio del rischio. Tre cose lo tengono corto: le sessioni
  stanno **in memoria del servizio** (un riavvio le butta tutte), «Blocca» la
  chiude anche sul servizio, il cookie muore con la scheda.
- **La finestra di primo avvio**: senza nessun PIN il servizio accetta senza
  sessione e lo dichiara all'avvio (`accesso APERTO`); appena il primo PIN
  esiste si chiude da sola e non si riapre. Si ricalcola **solo quando qualcuno
  scrive sugli operatori**. Chi scrive il primo PIN entra subito con quello.
- **Chi ricarica non ridigita il PIN**: l'identità si riprende dalla sessione,
  dopo il carico. Se la sessione cade si riapre la maschera; `_gateOpen` fa da
  guardia perché venti 401 insieme non disegnino venti maschere.
- **Restano aperte due rotte**: `/api/health` e `/api/app-info` (l'installer le
  interroga **prima** che esista un PIN), più `/api/auth/*`, che è la porta.
  `/api/auth/operatori` dà **il minimo**: sigla, nome, carica, «ha un PIN».
- **`accedere` non è `verificare`**: `verifyPin` risponde a «questo PIN è di
  questa persona?» e si chiama anche a sessione aperta; se emettesse una
  sessione, confermare un reset col PIN dell'Admin **scambierebbe l'operatore
  al lavoro**.
- **La chiave di macchina** `PATHFINDER_TOKEN`, generata **una volta sola**
  dall'installazione e mai rigenerata, serve a chi non ha un browser: backup
  serale, installer, migrazione, collaudi. Rigenerarla a ogni aggiornamento
  romperebbe il backup della notte, e nessuno se ne accorgerebbe fino al giorno
  che serve.

**Cosa non chiude:** i permessi per ruolo restano nel client (**voce 66**); e
senza TLS il cookie viaggia in chiaro — **la sessione chiude la porta a chi
bussa, non protegge da chi ascolta il filo**.

### 2.10 — sei falle di sicurezza

Nata da una valutazione chiesta da Andrea, fatta leggendo il codice **e
provandolo**. Giudizio: codice scritto con cura, SQL parametrizzato, escape
costante, confronto a tempo costante — e nessun controllo d'accesso.

- **L'impronta del PIN non esce più dal servizio, e non è più SHA-256.** Erano
  due difetti che si tenevano in piedi a vicenda: `GET /api/c/operators`
  rispondeva coi record interi (`pin_hash`, `pin_salt`) e l'impronta era uno
  SHA-256 a un giro. Un PIN è di sei cifre: **204 ms per ricavarne uno**,
  l'intero spazio in meno di due secondi. Ora la risposta porta `pin_set` e la
  verifica passa da `/api/op/verifyPin`. **`scrypt`** al posto di SHA-256 (50-100
  ms per accesso, l'intero spazio a una giornata di macchina): le impronte
  vecchie restano valide (`pin_algo` assente = com'era) e **si riscrivono in
  scrypt al primo accesso riuscito** — non c'è migrazione possibile, il PIN lo
  sa solo chi lo digita. **Il modo «da file» resta a SHA-256** perché
  `crypto.subtle` nel browser non ha scrypt.
- **Un backup non esce più dalla macchina.** `dir` arrivava dal corpo della
  richiesta e non la guardava nessuno: una richiesta sola scriveva l'intero
  database dove diceva chi chiamava, col processo che gira come SYSTEM. Non si
  stringe a **una** cartella (i chiamanti legittimi sono quattro): si vietano
  **percorsi di rete**, **cartelle di sistema**, **percorsi relativi**, e si
  pretende la lettera del disco. `PATHFINDER_BACKUP_ROOTS` stringe ancora.
- **Un codice non spezza più un gestore.** `onclick="App.x('CODICE')"` sono due
  contesti annidati e `_esc` copre solo il primo. Erano **195 punti**: la
  correzione sta in un posto solo, `normalizza`, dove i campi che sono un
  CODICE passano già. **Si rifiuta, non si ripulisce.** `&` non è nell'elenco:
  una categoria ha il diritto di chiamarsi «OLI & GRASSI», e un campo di testo
  libero che rifiuta gli apostrofi non lascia scrivere «l'articolo è arrivato
  rotto».
- **I file del servizio non sono più di tutti.** `C:\Pathfinder` ereditava
  `Authenticated Users : Modify`: bastava un blocco note per riscrivere
  `pathfinder-server.js` e farlo girare come SYSTEM al riavvio. L'installer
  spezza l'eredità (SID e non nomi, e **non ferma l'installazione se
  fallisce**: un magazzino che non si aggiorna per un criterio di gruppo è
  peggio di un permesso largo).
- **Tre intestazioni**: `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`. **Niente CSP, ed è una scelta**: una CSP seria
  vieta i gestori inline che sono l'architettura di questa interfaccia, e una
  permissiva sarebbe una riga che non protegge e che il prossimo crede protegga.
- **Su quale interfaccia si ascolta si sceglie**: `PATHFINDER_HOST`. Il
  predefinito resta «tutte», ma il servizio **dichiara all'avvio a chi
  risponde**.

**E poi la 2.10 non si è installata**, perché nessuno provava una macchina
vergine: `Split-Path -Leaf $null` sulla prima installazione, dove
`app\corrente` non esiste ancora e `/api/app-info` risponde null. Non si vedeva
da mesi perché ogni installazione era un **aggiornamento**. Il messaggio era
peggio del difetto: il `catch` diceva sempre «il servizio non risponde», anche
quando a rompersi era una riga di PowerShell. Adesso il servizio viene
richiesto un'altra volta e il messaggio distingue i due casi.

### 2.9 — da cancello ad assistente

Andrea, 27/08: «il sistema non deve MAI bloccare o interrompere l'operazione se
l'operatore sbaglia». **Un cancello non funziona in magazzino**: chi ha la merce
in mano o aggira la maschera — e allora nessuno sa più dove sia finita la merce
— o si ferma, e si ferma il magazzino.

Al posto del divieto: **il campo si precompila** (solo se ANCORA VUOTO:
riscrivere quel che l'operatore ha scansionato è il modo di far odiare i
suggerimenti), **la mappa accende il vano** con un bagliore rosso statico e
`inset`, **la riga resta in elenco** col tasto «Trasferisci» già compilato.
`VerdettoCasa.vietato` **non esiste più** (c'è un collaudo che fallisce se
qualcuno lo rimette); al suo posto `segnala` e `suggerita`. Il vano di casa
**sale in cima** con `PUNTI.CASA_DEL_LOTTO` ma non esclude più gli altri.

**La matrice di incompatibilità è uscita** — griglia, `meta.matriceIncompatibilita`,
`INCOMPATIBILITA_DI_SERIE`, `scontri`, CSS e collaudi — e la **pericolosità è
entrata come quinto bersaglio** di `storage_rules`, accanto a codice esatto,
prefisso, categoria e prefisso di categoria. È una **tendina, non un campo
libero**. La griglia chiedeva la stessa politica in un'altra forma, in una
seconda schermata: due modi di dire la stessa cosa prima o poi si
contraddicono.

Altro della 2.9: il **chip solo sulle righe sbagliate** nel pannello (su
`MAG1-RAKA-01-01-C`: sette item, uno marcato); il **trasferimento già
compilato** col cursore sul campo ubicazione e il testo selezionato
(`autofocus` in una stringa iniettata **non scatta**: si mette a mano);
`doMoveItem` che **rinfresca la verifica prima di ridisegnare**; l'elenco
riproporzionato (righe da 261 px a 53, `table-layout: fixed`, `modal-larga`,
sotto i 720 px diventa una lista); la scansione che **non chiude più su una
lettura sbagliata** e il campo confermato che diventa una pastiglia verde — che
**si spegne al primo tasto**, la toglie l'errore, e la tappa spostata su
un'ubicazione alternativa azzera tutti e tre i campi.

**Il difetto peggiore che questo applicativo abbia avuto:** `#dlgOverlay` che
manca era **un silenzio**. Se il div non c'era, `Dialog._open` usciva con
`Promise.resolve(null)` — la stessa risposta di «Annulla» — e **ogni conferma
del magazzino si comportava come un annullamento**, senza un errore in
consolle. Prelievo, conta, smaltimento, quarantena e spedizione passano tutte
da lì. Trovato **per caso** al banco. Corretto con due cose insieme: **si
ricostruisce** (il div è vuoto e inerte, fermare un magazzino per un
contenitore vuoto è sproporzionato) **e urla, una volta sola per sessione** (la
ricostruzione ripara il sintomo e nasconderebbe la causa; trecento righe uguali
sono di nuovo un silenzio).

**Il conto di produzione, provato sul magazzino vero** — Andrea l'aveva
indicato come «la parte più critica e debole». Sull'ordine `ODP2607777`: `in` 1
collo, `out` 1 collo/10 KG, `consumo` 15 KG, `chiuso`. **Entrato 25, tornato
10, consumato 15, residuo 0**, e i movimenti raccontano la stessa storia
(`PICK`, `IN`, `MOVE`). Reggono le altre tre invarianti: un ordine chiuso non
si riapre, la chiusura non è merce, un ordine mai visto non inventa niente. **Il
punto fragile è la voce 61.**

Due rinomine: «Da Ordine (XLSX)» → **«Prelievo automatico»**; «Conto
produzione» → **«WIP»**.

### 2.8 — le regole di stoccaggio decidono

**Le due regole che non si scrivono** (`modules/regoleBase.ts`, non sono un
record e non si cancellano):

1. **Lo stesso articolo sta sulla stessa unità di carico** — consiglio forte:
   prima una UDC aperta con stesso articolo E lotto, poi con lo stesso
   articolo, e fra pari **la più vuota**. **L'operatore scavalca**, e il motivo
   resta a registro.
2. **Lo stesso articolo/lotto sta nella stessa ubicazione** — **non si
   scavalca**: `item_key` è `articolo#lotto` e la giacenza di quel lotto è UNA
   riga per vano. Lo stesso lotto in due vani è la stessa merce contata due
   volte, e il FEFO la ordina come due partite.

**L'eccezione è dello stato del vano, non della persona**: se il vano di casa è
pieno, bloccato o disattivato — e solo allora — il lotto si estende su un
secondo vano e la mappa lo segnala.

**Dove morde**: in `Store.addItem`, che è il collo di bottiglia di tutto (non
esiste un `moveItem`: uno spostamento è `removeItem` + `addItem`). Funziona
sugli spostamenti **senza doverli distinguere**: uno spostamento intero lascia
il lotto senza casa e passa, uno **parziale** la casa ce l'ha ancora ed è
esattamente il gesto da rifiutare. `regolaBase: false` è la via d'uscita per le
**correzioni**, e sono quattro dichiarate sul posto: storno, rettifica
d'inventario, rettifica di una tappa, **ingresso in WIP**.

**L'area WIP è un conto, non uno scaffale**: portare in produzione è quasi
sempre un prelievo parziale, e applicare lì la regola fermerebbe la produzione.
Per la stessa ragione il vano WIP **non è casa** in `caseDelLotto` e **non si
conta** fra i lotti sparsi.

**Il terzo vincolo, che si scavalca: la categoria merceologica.** «I detersivi
stanno in MAG3» non è una regola sui codici, è una regola su una famiglia:
scriverla come prefisso funziona solo dove qualcuno ha avuto la disciplina di
far cominciare tutti i detersivi con le stesse cifre. **Chi è più preciso
zittisce chi è più generale**: `regolePerArticolo` restituisce **solo il
livello più preciso che ha colpito** — codice esatto → prefisso → categoria →
pericolosità.

**La pericolosità c'era dal 1.6 e il motore non l'ha mai letta**: da qui vale,
simmetrica agli allergeni. **La cella «Riservata» non deroga qui**: «riservata»
è la decisione organizzativa di ammettere un allergene; un comburente accanto a
un infiammabile è fisica, come la temperatura.

**La ventunesima collezione: `location_attrs`.** Uno scaffale non è omogeneo —
il livello a terra regge il doppio di quello in quota, la cella davanti al
portone è più calda. **La zona resta la sorgente, la cella scavalca**: un campo
assente sulla cella vuol dire «come dice la zona», non «nessun vincolo». Nella
maschera ogni campo ha **tre stati** — «come la zona», «così», «qui no» — e la
tendina scrive il valore della zona fra parentesi. Si caratterizza da Mappa →
dettaglio → 🎯 Caratterizza, non da Configurazione: chi decide che QUESTA
campata regge meno lo decide con la campata davanti. **Capienza e portata sono
sempre della cella**: fino alla 2.7 il motore cercava `zona.capienza`, che non
è mai esistita nemmeno come campo.

**I tre motivi precompilati dello scavalco** (`MOTIVI_SCAVALCO`): posto non
raggiungibile col mezzo · merce in uscita a breve · posto occupato o senza lo
spazio dichiarato. **Tre e non dieci**, col testo libero accanto per il caso che
i tre non coprono.

**Misurato il 26/08 sulle 886 giacenze di allora**: 28 lotti in due ubicazioni,
59 righe, 32 vani; 330 ubicazioni valutate per proposta in **2,1-2,8 ms**. Le
59 righe **non le ha fatte la 2.8**: sono il magazzino com'è — voce 59.

### 2.7 e 2.6 — i due database

**La 2.6** ha reso il servizio dati capace di parlarne due: `PATHFINDER_PG`
assente → SQLite, presente → PostgreSQL. Si installa **senza toccare il
database**, e il passaggio è un secondo gesto separato. Porta anche i **codici
in maiuscolo** (li normalizza il servizio a ogni scrittura, da qualunque parte
arrivino) e l'**interfaccia asincrona** del servizio dati — il pezzo più grosso
di lavoro. I giri di rete sono usciti dai cicli: `bulkPut` faceva **11.197
INSERT** per la sola anagrafica, adesso sono **12 istruzioni**; `countAll` passa
da venti `COUNT` a uno.

Quel che la 2.6 ha trovato guardando, e nessuno sapeva: lo stesso lotto a
scaffale **due volte** per una differenza di maiuscole (`6001412#cl260854` e
`#CL260854`, fusi in una riga da 6 con un `EDIT` a registro); `startsWith` che
voleva dire **tre cose diverse** (sensibile in Dexie e in cache, insensibile sul
servizio, che usava `LIKE`); il backup che nominava i file **in UTC** e si
scriveva sopra il serale; **due terminali dentro la stessa transazione**;
`BIGINT` che tornava stringa; lo stesso rifiuto mappato **409 su un database e
500 sull'altro**; `rejectUnauthorized: false`. **Le prime tre le ha trovate
l'audit dei dati, le altre quattro la batteria che gira le stesse prove sui due
driver.**

**La 2.7** è il primo giorno su PostgreSQL (26/08 sera). I dati sono passati
interi — 11.197 articoli, 886 giacenze, 321 movimenti, 7 operatori, 4 UDC, 28
conti WIP — con i conteggi ricontrollati due volte, il file SQLite **non
toccato**, e le sequenze riallineate sopra le chiavi già scritte perché il
`_id` si è **preservato e non rigenerato** (`tasks.mov_ids` punta a quei
numeri). Il backup su PostgreSQL è un `pg_dump` in formato custom **riletto con
`pg_restore --list` prima di essere dichiarato buono**, e cancellato se non si
rilegge — voce 53.

**Come si torna a SQLite** (emergenza): `& "C:\Pathfinder\servizio\installa-servizio.ps1"`
senza `-PostgreSQL`. **Quel che è stato scritto su PostgreSQL nel frattempo
resta lì e non rientra da solo**: il file SQLite è fermo alla sera del 26/08.
Per un rientro ordinato si migra al contrario, e quello script non c'è.

**Il database sta sulla stessa macchina del servizio.** Non è Azure: il
magazzino si ferma quando si ferma quel PC. È la stessa cosa che la voce 26
diceva del ramo Azure, e resta vera qui — **niente lavoro senza linea**, per
scelta e non per dimenticanza (§8).

### Prima della 2.6 — la cronaca in breve
| Quando | Cosa |
|---|---|
| **2.5** (26/08) | Le UM al carico: su 11.197 articoli, **2** funzionavano, 4.036 avevano la maschera nascosta, 7.159 un'unità non riconosciuta. Quattro cause: la maschera si nascondeva da sola (il cancello è diventato l'**unità**, non `pieces_per_pack`); un lotto congelato senza per-collo restava rotto per sempre (`??` che non ripiegava mai — ora ripiega **a lettura e a unità uguale**); **`NR` di SAGE X3 non era un dato mancante ma una codifica non tradotta**, 7.077 articoli su 11.197; tre difetti intermittenti della maschera. Più il prelievo da ordine in sette interventi: il compito che **viaggia con la tappa** (`transfer_task`), la disponibilità riletta a ogni render, la pausa scorporata dai tempi, la rettifica di una tappa già prelevata (`REPOS`, **solo in meno**), i colli proposti dai più piccoli (`pieni` per eccesso, `spaiati` per difetto, e gli spaiati non sfondano mai l'ordine), le UM sul report, le sovrapposizioni misurate a 375/482 px e in stampa |
| **2.4** (25/08) | Voce 45 e voce 19. Salta il numero 2.3 apposta |
| ~~**2.3**~~ (24-25/08) | **RITIRATA.** Divideva il collo: `quoteVano`, `pianoUscita`, il giro conto `WIPGIRO`, il reso che trabocca sul più vecchio, il fabbisogno scontato di quel che il reparto ha in mano, il vano WIP escluso dalle tappe, il registro ODP in una vista sua. Tre difetti usciti costruendo (il filtro sul residuo in **colli**, «l'ordine più vecchio» ordinato sull'**ultimo** movimento, il rendiconto che stampava un foglio bianco e contava il ceduto come reso). **Il caso che voleva risolvere è quello della 2.12**, per altra strada |
| **2.2** (20/08) | Voce 14 (il campo fantasma `updated_at` sulle giacenze, 13 righe raddrizzate in produzione), voce 29 (l'archivio ODP si sfoglia), voce 30 (le righe nel vano WIP che nessun ordine rivendica), la data delle copie locali, «undefined» nella descrizione. E la scoperta che **il numero di versione sta in quattro posti** |
| **2.1** (19/08) | Code128 scritto in casa · il ruolo **ADMIN** · la purga tolta (**nessuna cancellazione di record**) · il cruscotto componibile · ordinamento e filtri (`modules/tabella.ts`) · il registro attività che legge anche il registro generale · il prelievo da file che finisce nel conto WIP · le UDC intere (smaltimento, quarantena, trascinamento) · la mappa che non copre più la pianta |
| **2.0** (19/08) | **Gli interruttori tolti** · i KPI (`modules/kpi.ts`) · gli export che dicono le UM · **otto difetti dello stesso ceppo**: un saldo giusto scritto sopra un elenco di colli rimasto indietro. Il ciclo quadra a zero su quattro ordini, 702,594 KG |
| **1.9-1.14** (19/08) | Viste giacenza · trasferimenti dall'ODP · il terminale su `--spacing` · UDC · motore di stoccaggio · conto di produzione |
| **1.8.x** (18/08) | La suddivisione dei colli **si dichiara invece di calcolarsi**. Il difetto peggiore: `savePendingOutbound` e `updatePendingDoc` ricostruivano la riga di documento **in due copie**, e i colli scelti sparivano al salvataggio |
| **1.7** (17/08) | Una versione è **una cartella**. Primo caricamento da 1.610 kB a **251 kB**, ricarica a **300 byte**, `xlsx` a richiesta. Installata alle 18:29, ha lasciato l'applicativo **giù per tre ore**: il servizio, che gira come SYSTEM, **non attraversa una giunzione** |

---

## 4. La coda di lavoro

**I numeri non si riusano e non si rinumerano.** Cinque stati:
| stato | vuol dire |
|---|---|
| **da pianificare** | lavoro di sviluppo riconosciuto: prima l'analisi, poi la correzione, poi il consolidamento |
| **Andrea** | è un dato o una configurazione, e la compila lui. Un agente non ci mette mano |
| **standby** | riconosciuta e ferma per scelta |
| **da chiarire** | manca un fatto per poter decidere |
| **fatto** | chiusa, con la prova accanto |

### Aperte — da pianificare
| # | Cosa | Passo successivo |
|---|---|---|
| **103** | **IL PRELIEVO ODP NON È MAI STATO PRESO IN CARICO CON UN ALLEGATO VERO.** La rotta degli allegati ha undici prove sul servizio — salvataggio, rilettura byte per byte, percorsi storti, tetto, porta chiusa — e il modulo che legge la distinta è lo stesso di sempre. Ma il giro intero — allego, metto in coda, un altro prende in carico, il percorso si apre già caricato — è stato provato solo a pezzi | **Un giro al banco con un `.xlsx` vero di `banco\odp-wip\`**: si crea l'attività allegandolo, si guarda che il compito porti l'identificativo e non il file, si prende in carico da un'altra sigla e si verifica che la distinta si apra con le stesse righe |
| **102** | **`Udc.status: 'closed'` È DICHIARATO E NON LO SCRIVE NESSUNO.** Il tipo elenca quattro stati; il codice ne scrive tre — `open`, `empty`, `shipped`. E `closed_at` nasce `null` e non viene mai aggiornato. Non fa danno: nessuno lo legge. Ma un tipo che dichiara uno stato che non esiste è un tipo che mente a chi lo legge per capire come funziona | **Si guarda con l'elenco delle unità davanti**, e si decide: o lo stato serve — e allora c'è un gesto che manca — o non serve, e si toglie insieme a `closed_at`. Togliere uno stato dichiarato è una decisione sui dati, non sul codice |
| **101** | **`OPERAZIONE.TRANSFER` DICHIARA `modo: 'move'`, CHE NON È UN MODO.** `ModoMovimenta` conosce `io pick inv quarantine shipping sampling udc pf`; `'move'` non c'è. `startMov('move')` non trova niente in `forms`, l'optional chaining ingoia, e la maschera la disegna la riga DOPO — `_pickSub('cambio')`. Funziona per una coincidenza, non per disegno: il giorno che qualcuno riordina quelle due righe, il Trasferimento si apre vuoto | **Due strade, e la seconda è meglio**: dare a `TRANSFER` il modo vero (`pick`, sottoscheda `cambio`), come fa `PREP_SHIP` dalla 2.31; oppure una prova che pretenda che ogni `modo` di `OPERAZIONE` stia in `ModoMovimenta`. La prova serve comunque — è quella che avrebbe fatto vedere il difetto |
| **98** | **`(location_code, item_key)` SU `inventory` È UN INDICE, NON UN VINCOLO DI UNICITÀ.** Sta sotto `composite` in `server\lib\schema.js`, che genera un `CREATE INDEX` e non un `CREATE UNIQUE INDEX` — `compositeUnique` esiste ed è usato altrove (`sites`, `lots`). Ma tutto il modello di prelievo tratta quella coppia come **un posto fisico solo**: `getItemByKey` restituisce una riga per ubicazione e chi legge assume che sia LA riga. Due righe dello stesso lotto nello stesso vano ci stanno, e un caricamento di massa le fa — **la migrazione dalla 1.4 (voce 79) è esattamente un caricamento di massa.** Il primo effetto si è già visto: l'avviso del percorso ripeteva la stessa frase una volta per riga, corretto nella 2.29.1. Gli altri non sono stati cercati | **Prima si conta, poi si decide.** Sul magazzino vero: `SELECT location_code, item_key, COUNT(*) FROM inventory GROUP BY 1,2 HAVING COUNT(*) > 1`. Se sono zero, l'indice si può fare unico e la migrazione passa liscia; se non lo sono, va deciso se fondere le righe sommando le quantità o rifiutarle — e fondere è una decisione sui **dati**, che è di Andrea. Finché non è deciso, ogni lettore di `getItemByKey` deve reggere il doppione |
| **99** | **«PRELIEVO ORDINI» NON HA UNA SCORCIATOIA, E F8 NON È ANNUNCIATA DA NESSUNA SCHEDA.** La 2.29.1 ha messo tabella dei tasti e schede in un posto solo (`TASTI_FUNZIONE` in `modules/cruscotto.ts`), e da lì si vede il buco che i due elenchi separati nascondevano: F3 porta a Trasferimento, e il prelievo di produzione — che è quello che si usa tutti i giorni — non ha un tasto. F8 porta a Spedizioni senza sottoscheda, e la scheda «Spedizioni» dice `documenti`: non combaciano, quindi non si annuncia | **È una domanda per chi usa il terminale, non un difetto.** Adesso le etichette dicono il vero, che era la parte urgente. Assegnare F5 alla produzione, o far combaciare F8 con `shipping/documenti`, è una riga per ciascuna in `TASTI_FUNZIONE` — appena Andrea dice quali |
| **100** | **IL `301` IN CHIARO DELLA 2.26 NON HA UN BANCO.** `decidiTls` ed `eSalutoTLS` sono coperte da ferme (`test/tls.test.js`), e la 2.29.1 ha fissato in prova il **comportamento di `fetch`** davanti a un `301` — che è il modo in cui il difetto si è nascosto per tre versioni. Ma il demultiplatore vero, quello che guarda il primo byte e rimanda il socket all'uno o all'altro server, nessuno lo esercita | **Costa un certificato costruito dalla prova**, e va deciso se vale: la strada c'è (`crea-certificato.ps1` lo fa con i mezzi di Windows, senza `openssl`), ma un banco che genera un PFX a ogni giro è lento e va a toccare il magazzino delle chiavi. L'alternativa onesta è dire che quel percorso si prova a mano, una volta per versione, e scrivere qui quando è stato fatto |
| **97** | **IL NUMERO DI PAGINA DEL DDT NON È MAI STATO VISTO SU CARTA.** La 2.24 fa scorrere il DDT e chiede a `@page` una *page margin box* — `@bottom-right { content: "pag. " counter(page) " di " counter(pages) }`. È l'unico posto da cui si arriva a `counter(page)`, e **il banco non sa misurarlo**: prende le regole da `@media print` e quelle stanno dentro `@page`. Chromium le sostiene da poco; dove non le sostiene non esce niente e non si rompe niente, ma **nessuno l'ha ancora guardato** | **Un'anteprima di stampa e basta**: si apre un DDT lungo, Ctrl+P, e si guarda l'angolo in basso a destra — ricordandosi di **togliere intestazioni e piè di pagina del browser** dalle opzioni, che altrimenti scrivono i loro sopra i nostri. Se non compare, il ripiego c'è già e funziona ovunque: il piede ripetuto porta «n righe in totale», ed è quello che fa accorgere chi riceve che manca un foglio |
| **96** | **`01-components.css` DICHIARA 70 SELETTORI PIÙ DI UNA VOLTA, PER 143 REGOLE SU 253.** Quasi tutta la pulsantiera è scritta due volte: una nel blocco di base e una in «MD3 STATE LAYER & REFINEMENTS», che parte a riga 405. `.btn` compare **quattro volte** — righe 15, 406, 431, 446 — e la quarta rimette il colore che la terza aveva tolto: **stessa specificità, decide l’ordine**. Fondere in una regola per selettore toglie 143 righe, e cambia l’aspetto dell’applicativo se una sola proprietà finisce nell’ordine sbagliato. Riordinare conta solo fra regole di **pari specificità che toccano la stessa proprietà** — `.btn:hover` fra due `.btn` non è un problema — ma stabilirlo a occhio su 143 regole non si fa | **LA RETE È PRONTA, LA FUSIONE NO.** Il flusso `rilievoStile` del banco a video apre tutte le maschere, cerca gli elementi che quei 58 selettori nominano e scrive che cosa il browser CALCOLA per le 62 proprietà che quelle regole toccano: **1.129 elementi**, misurati e messi da parte in `banco/video/rilievo-stile.json`. Dopo la fusione si rimisura e le due misure devono coincidere; se una differisce, il verbale dice elemento, proprietà, da cosa a cosa. Provata iniettando `.btn{border-radius:3px}`: l’ha detto. **Il passo successivo è la fusione**, e prima va deciso se è rifattorizzazione pura — stesso rendering, zero pixel spostati — o se si sistema anche quel che MD3 ha sbagliato, che è una domanda per chi usa il terminale col guanto |
| **94** | **LA CAMPATA DELLA 2.22 PUÒ DIRE ANCHE QUALI ALTRI LIVELLI SONO TAPPE DI QUESTO GIRO.** `_routeSosta` raggruppa già le tappe pendenti contigue nello stesso vano, ma non dice niente sui vani sopra e sotto: chi è salito sul carrello per il livello 2 non sa che il 3 lo aspetta fra quattro tappe | **Si guarda dopo un po' di prelievi veri**: quanto spesso due tappe dello stesso giro cadono nella stessa campata. Se capita di rado non vale il segno in più; se capita spesso, il dato c'è già — basta passare a `colonnaDi` i codici delle tappe pendenti |
| **95** | **`_renderMapFrontal` DELLA MAPPA NON PASSA DA `modules/colonna.ts`.** La 2.22 ha estratto la domanda «com'è fatta questa campata» in un modulo puro, ma la mappa continua a rispondersela da sola, come faceva prima. Non è un difetto — disegna corsie intere, non una colonna — ma **quale sia lo stato di un vano** adesso è scritto in due posti | **Si guarda quando si tocca la mappa la prossima volta**, non prima: spostare un disegno che funziona per farlo passare da un modulo nuovo è il tipo di lavoro che rompe quel che era verde. Se si fa, si fa con le prove della mappa davanti |
| **93** | **IL MODELLO DI CARICO SI IMPARA DAL PRIMO BANCALE, E IL PRIMO BANCALE PUÒ ESSERE UN FONDO DI PRODUZIONE.** Un articolo che ne fa 40 per pallet, imballato la prima volta a fine lotto con dodici colli, impara «12» e da lì in poi lo propone. Non è un errore — il modello propone e non impone, e si riscrive senza dover dire perché — ma è una proposta sbagliata che nessuno va a correggere finché non dà fastidio | **Si guarda dopo un mese di uso vero**: quanti articoli hanno imparato un numero che non è il loro. Se sono pochi si correggono in Parametri; se sono tanti, la regola da cambiare è **quando** si impara — per esempio solo dal bancale che porta il numero più alto visto finora |
| **92** | **IL CARICO SPEDIZIONI NON HA MAI VISTO UN CAMION.** Provato al banco da capo a fondo — baia, due DDT, tappa saltata, evasione parziale, sessione ripresa dopo un ricaricamento — e il **03/09 sera** anche sull'installazione di questa macchina, con una baia marcata da Andrea: tutto a posto (voce **91**). Ma sono due magazzini di prova, con pochi bancali per documento. **Quel che né il banco né questa macchina possono dire**: se la serpentina porti dove serve quando i pallet sono venti, se la baia vera abbia le posizioni che il sistema si aspetta, e se «un DDT per volta» sia il ritmo giusto o se chi carica preferisca vedere tutto il mezzo insieme | **Una passata in banchina**, con un carico vero. Poi si decide se la baia debba avere posizioni numerate come quelle di uno scaffale, e se serva vedere più DDT su una schermata sola |
| **90** | **IL PRODOTTO FINITO NON HA MAI VISTO IL REPARTO.** La 2.20 è stata provata al banco da capo a fondo — modello di imballo, zona PF, bancale chiuso ed etichettato, elenco, mappa colorata, carrello del DDT, evasione, conto terzi — ma su un database di prova e con un articolo scelto a caso. **Quel che il banco non può dire**: se ① → ② → ③ → ④ regga il ritmo di chi imballa davvero, se i colli proposti dal modello siano quelli giusti sui formati veri, e se chi spedisce trovi nell'elenco le colonne che cerca | **Una passata in reparto e una alla scrivania delle spedizioni**, con la merce vera davanti. Poi si sistemano modelli, colonne e proposta — sono tutti dati o righe di vista, non architettura |
| **89** | **L'ETICHETTA DEL BANCALE NON HA MAI VISTO UNA ZEBRA**, come la voce 83 per le altre due. Il layout di serie occupa **70 mm degli 80** e le 22 prove nuove del banco coprono lo ZPL, non la carta | **Va nella stessa passata della voce 83**: stessa macchina, stesso supporto, stesso lettore ottico |
| **88** | **IL LAYOUT DELL'ETICHETTA DEL BANCALE È UNA PROPOSTA SCRITTA A TAVOLINO**, come lo era quello della merce (voce 85): articolo, descrizione, barre, lotto, scadenza, colli, peso. Ordine di produzione e ubicazione nascono spenti | **Si guarda col bancale davanti**: chi carica il camion può volere i colli più grandi, o l'ordine acceso |
| **87** | ⚠️ **UNA PROVA DELLA GERARCHIA È ROSSA, E LO ERA PRIMA DEL PRODOTTO FINITO.** `banco/gerarchia.cjs` dà **39 su 40**: cade «lo dice anche all'elenco che disegna la schermata di accesso — `rec_set = undefined`». Verificato rimettendo il codice del commit `c693b2c`, cioè la 2.19 committata: **rossa anche là**, quindi non l'ha rotta il lavoro del 03/09. Riguarda il **codice di ripristino** e quel che `/api/auth/operatori` dichiara di un operatore | **Si guarda la rotta**: o l'elenco non porta più `rec_set`, o lo porta con un nome diverso da quello che la prova si aspetta. Da distinguere prima di toccare qualunque cosa — un campo che sparisce da una rotta aperta è un'altra cosa da una prova scritta male |
| **83** | ⚠️ **LE ETICHETTE ZEBRA NON HANNO MAI VISTO UNA ZEBRA.** La 2.19 gira su un banco che alza una finta stampante sulla 9100 — 78 prove verdi, e coprono quel che si può coprire da fermo: il layout nei millimetri, i quattro caratteri che spezzerebbero lo ZPL, la porta che sta in un elenco chiuso, l'indirizzo che non esce dalla rete interna, le richieste che si mettono in fila, e la carta finita che passa come successo mentre `~HQES` lo dice. **Macchina, supporto e rete adesso ci sono** — Andrea, 02/09: serie **ZD200** (o un modello precedente simile), **203 dpi**, **adesive staccate 100 × 80 mm**, con presa di rete, e le installa il team IT. Il layout di serie è tarato su quelli: 68,5 mm degli 80, con 11,5 di margine perché su un'etichetta staccata il registro balla a ogni avanzamento. **Quel che il banco non può dire è se l'etichetta esca** | **Serve la stampante vera, e quattro misure con quella davanti.** (1) Le barre lette da un **lettore ottico** su carta termica — lo stesso passo che il Code128 su A4 ha fatto il 25/08 (voce chiusa 23). (2) L'etichetta **dritta e dentro il supporto**: i 3 mm di margine sono una scelta, non una misura, e la zona che una testina non stampa la decide il modello. (3) La **calibrazione del supporto**: adesive staccate vuol dire rilevamento a **interspazio**, e si fa una volta col tasto FEED tenuto premuto — Pathfinder `^MN` non lo manda di proposito, quindi se la macchina non è calibrata l'etichetta esce sfasata e il codice a barre finisce a cavallo del taglio. Va nella SOP insieme al **calore**. (4) Che `~HQES` **risponda davvero**: il banco finge tre macchine, quale sia la ZD200 vera si sa provandola |
| **85** | **IL LAYOUT DELL'ETICHETTA MERCE È QUELLO DI SERIE, E NESSUNO L'HA GUARDATO CON LA MERCE DAVANTI.** Sei campi accesi, 51 mm su 60: barre, codice articolo, descrizione su due righe, lotto, scadenza, peso. È una proposta scritta a tavolino — chi etichetta i sacchi in accettazione può volere il peso più grande, la descrizione più piccola, o i colli accesi | **Una passata in reparto con un rotolo vero.** Il layout è un dato e si cambia in Configurazione senza ricompilare: il punto non è il codice, è **quale etichetta serve a chi la legge coi guanti**. Da fare dopo la voce 83, che dice se le misure di serie stanno in piedi |
| **79** | ⚠️ **DALLA 1.4 ALLA BETA: IL BANCO C'È E PASSA, MANCA LA CORSA SUI DATI VERI.** Il magazzino vero gira la **1.4** su un'altra macchina — §0. È un **HTML unico da 1,54 MB**, dati in **IndexedDB via Dexie** (`WarehouseMapperDB`), backup su OPFS, `exportAll`/`importAll` con `_format` **`warehouse-mapper-v1.5`** — lo stesso che dichiara la beta. **La strada quindi esiste**: si esporta dal browser del magazzino e si importa nella beta. Verificato il 02/09 che due export veri dell'epoca — `_appVersion` **1.6** e **1.1.0** — si lascino **chiavare dallo schema di oggi**: ogni collezione trova la sua chiave primaria, e quelle assenti restano com'erano come vuole §8. **02/09 — ADESSO GIRA**: `banco/migrazione/dalla-1.4.cjs`, **14 prove, tutte verdi**. Parte da un database **vuoto**, come una macchina appena installata, importa `14082026_warehouse-mapper-2026-08-14.json` e conta: ogni collezione arriva col numero di righe che aveva, i **104 movimenti** ci sono tutti, la merce si ritrova vano per vano con articolo lotto e colli, le righe **senza UM** non ne guadagnano una dal nulla, `righeLette` non lancia su una riga che di colli non ne dichiara, i compiti aperti restano aperti, e sul database importato **il primo Admin si crea e entra** | **Resta la corsa sui dati veri**, che nessuno ha ancora esportato dalla macchina di magazzino. Due cose che il banco ha già misurato e che su quel file vanno rimisurate **prima** di premere Importa: (1) **quante righe cambiano nome per il maiuscolo** — qui 4 su 190, e un'etichetta stampata prima non corrisponde più alla chiave a database, quindi la ristampa diventa un passo della migrazione; (2) **se due righe finiscono sulla stessa chiave** una volta maiuscolate — qui nessuna, ma lì una coprirebbe l'altra e la merce sparirebbe davvero. La prova che lo chiede è già scritta: basta puntarla sull'export vero |
| **78** | ⚠️ **I VECCHI COMMIT RESTANO RAGGIUNGIBILI SU GITHUB PER SHA.** La storia è stata riscritta e `main` spinto a forza (voce 72): il dump non sta più in nessun ramo, `GET /contents/…?ref=main` risponde **404**, e il ramo `claude/annotazioni-modifiche-ecq4c5` con la sua PR #1 **diverge da prima** del commit incriminato, quindi non lo porta. **Ma il vecchio commit risponde ancora**: `GET /commits/ecd25381…` restituisce il suo SHA. È il comportamento normale di GitHub — gli oggetti sfollati restano finché non passa il garbage collector — e il repository è **privato**, quindi li vede solo chi vi ha accesso | **Due gesti, e sono di Andrea.** (1) Chiedere a **GitHub Support** di ripulire gli oggetti sfollati e le cache: è l'unico modo di togliere quei byte dal server. (2) **Rinnovare i PIN** degli operatori che stanno in quel dump quando rientreranno a database: le impronte lì dentro sono **SHA-256**, e su sei cifre un milione di tentativi è un istante. Oggi non urge — a database c'è **un operatore solo**, `ADM1`, nato dopo |
| **77** | ⚠️ **UN FILE CHIAMATO «variabile postgre.txt» STA SUL DESKTOP, 843 byte.** In `Desktop\Pathfinder-archivio-2026-09-01\`, accanto ai dump. Non è stato aperto e non è in git; il nome dice che porta la stringa di connessione di PostgreSQL, cioè **utente e password** — la cosa che §11 tiene fuori dal repository insieme ai file di database | Va guardato e, se è quello, **spostato dove stanno i segreti** o cancellato dopo aver messo la stringa dove serve. Un segreto in chiaro sul Desktop, dentro OneDrive, è un segreto sincronizzato altrove |
| **76** | **`Q1` — 0,75 KG CHE NON SI RITROVANO, VISTO UNA VOLTA SOLA.** Alzato dal banco del ciclo il 01/09 alle 20:23 e **non riprodotto in dodici corse** — quattro il 01/09, otto il 02/09 — a parità di codice, con `ciclo.db` rifatto dal pristino ogni volta (`rifaiDatabase` toglie anche `-wal` e `-shm`), `fileParallelism: false` e ordine deterministico. **L'origine non è rintracciabile, e si è capito perché**: `apriVerbale` **tronca `verbale.md` a ogni corsa**, quindi la corsa delle 20:25 ha cancellato la prova di quella delle 20:23. Un banco che cancella le proprie prove trova un difetto una volta sola | **La causa dell'irrintracciabilità è chiusa**: dal 02/09 una corsa che alza un difetto `grave` mette il verbale da parte come `verbale-GRAVE-<data>.md`, e la corsa dopo non lo tocca. **Il difetto no**: resta aperto finché non si ripresenta e non si legge quel verbale. Un secondo sospetto da tenere in mente: **`pristino.db` ha un WAL e uno SHM suoi** — 0 byte il 02/09, ma datati 31/08 — e `copyFileSync` copia il solo `.db`: se quel WAL avesse contenuto, il pristino non sarebbe uno snapshot stabile |
| **67** | **LA QUOTA DI CONSUMO NON SI CORREGGE A MANO.** Alla chiusura di un giro la ripartizione si scrive proporzionale a quanto ciascun ordine aveva chiesto. Se la produzione ha consumato in proporzione diversa — il caso normale, non l'eccezione — non c'è dove dirlo | **La proporzione è una proposta, non un fatto misurato**, e va scritto anche sul foglio. Serve una maschera che sposti quantità da un ordine all'altro col vincolo che la somma resti quella del consumo. Il dato c'è: `giro_richieste` sul movimento |
| **63** | **`areaWip` SUL BANCO È UN VANO DELLO SCAFFALE, NON UN'AREA.** Impostata il 27/08 su `MAG1-RAKA-04-01-T` per provare il conto di produzione. Funziona, ma sulla mappa non si distingue dallo stoccaggio | Sul magazzino vero la domanda è la **voce 15**. Sul banco, il giorno che serve una prova più fedele, si crea una zona `WIP` sua |
| **62** | **IL BIP DI LETTURA E LA CONFERMA DI TAPPA SONO TUTTI E DUE ACUTI E SINUSOIDALI.** `scan` 1320 Hz, `ok` sale 1046 → 1568 Hz. Fra `ok` ed `error` non c'è confusione (`error` scende 233 → 175 in onda quadra), ma «ho letto» e «tappa chiusa» possono somigliarsi col rumore del reparto e i tappi | **Una prova al banco col rumore vero**: se la confusione c'è, si scende il bip di lettura o se ne accorcia la coda, così l'unico suono che sale resta la conferma |
| **61** | **IL CONTO WIP DIPENDE DA UN PARAMETRO FACOLTATIVO.** La riga `in` non registra le UM (`qty_uom` è `null`) e i chili si ricostruiscono dalla confezione congelata, che `Store.contoWip` passa a `conto()` come ripiego. Omettendolo, lo stesso ordine in pari risponde `residuo_uom: −25`, `incoerente: true`: un numero **plausibile e sbagliato**. **Dalla 2.14 almeno SI VEDE**: la lista di quello che è in lavorazione tinge di rosso la riga col residuo negativo, che prima non compariva da nessuna parte | **Due strade, e la seconda è quella buona:** scrivere le UM sulla riga `in` quando si conoscono (la confezione è congelata già al posizionamento), oppure rendere `perCollo` obbligatorio o far dichiarare `incoerente` con un motivo leggibile invece di un residuo negativo muto |
| **59** | **28 LOTTI IN DUE UBICAZIONI — 59 RIGHE SU 32 VANI.** Contati il 26/08 sulle 886 giacenze di allora. **Non li ha fatti la 2.8**: fino a quel giorno nessuno aveva modo di vederli. Finché durano, quella merce si conta due volte e il FEFO la ordina come due partite | **Ricomporli uno per uno, con la merce davanti.** L'elenco esce da Mappa → «Vedi elenco» → Esporta Excel, tipo `LOTTO_SPARSO`. Non è lavoro da agente: sono 28 decisioni su dove sta davvero la merce. **Da ricontare sui dati veri**, non su questa macchina |
| **58** | **GLI ATTRIBUTI DEGLI ARTICOLI SONO VUOTI.** Misurato il 26/08: 644 articoli senza classe di temperatura, allergeni e pericolosità, e `verificabili` a **zero**. I quattro controlli nuovi della 2.8 **non possono scattare**. È la voce 5 vista dall'altro capo | **È di Andrea**, come la 5: Configurazione → Articoli → Export/Import Excel; il foglio «Valori ammessi» porta già gli elenchi buoni |
| **52** | **82 ARTICOLI HANNO UN'UNITÀ CHE NON È UN'UNITÀ.** Dopo la traduzione `NR → PZ`: `SCA` 48, `CON` 18, `RT` 7, `CAS` 4, `M2` 2, `BAN` 1, più **due celle con testo libero** (`MIN EPA=105 MG/G` e simile). Scatola, confezione e cassa nominano un **contenitore**, e qui il contenitore è il collo | Si caricano **a soli colli** e la maschera lo dice. Va deciso sigla per sigla: `M2` chiede se serva una sesta unità, le due celle di testo sono errori di anagrafica (Andrea) |
| **51** | **DUE FUNZIONI MAI ESERCITATE DA CAPO A FONDO, E SONO IN SERVIZIO DALLA 2.5.** La **rettifica di una tappa già prelevata** e il **salta tappa**: verificate per tipi, logica e resa a video, mai fatte girare. La rettifica scrive un `REPOS` e chiama `esceDaWip` — tocca giacenza **e** conto di produzione | **Al banco, su una copia del database, con un ODP di prova.** Due cose da guardare: che il `REPOS` rimetta le **misure giuste** e non colli di misura comoda; e che `esceDaWip` non rifiuti la riga quando l'ordine ha in lavorazione colli di misure diverse (lancia apposta in quel caso, e va visto succedere) |
| **43** | **IL KIT DEMO NON ESISTE PIÙ — MA LO SHEET TECNICO SÌ.** `Avvia Demo.bat` e i tre `README-DEMO` vivevano dentro `consegna/`, che la build azzera: non li produce `vite.config.js`, non sono mai entrati in git, cercati su tutto il disco il 25/08 senza trovarne traccia. **La parte sullo `IT-TECH-SHEET` era sbagliata**: è stato riscritto il 28/08 e sta in `documenti/IT-TECH-SHEET.md` — 532 righe, **REP-IT-001 rev01**, scritto per il team IT che deve autorizzare l'installazione, con architettura, porte, account, dati trattati, sicurezza, limiti noti e cosa si chiede all'IT. Fuori da `consegna/`, quindi la build non lo tocca | **Resta da riscrivere il solo kit demo**, e stavolta fuori da `consegna/` o dentro l'elenco dei file del plugin di build. **Lo sheet tecnico è in italiano** e il team IT chiede l'inglese: è la voce 82 |
| **42** | **LA NUOVA REGOLA DEL CAMPIONAMENTO VA NEL CODICE.** Andrea, 25/08: articolo **con** UM configurata → si scala la UM richiesta e i colli non calano; articolo **senza** UM → il campione **non modifica la giacenza**. Oggi la rotta rifiuta il collo intero con «un campione lascia sempre un residuo» | Cambia una regola di §8 e il **significato di `SAMPLE`**: si scrive lì prima che nel codice, e il CQ deve saperlo. Il logbook della qualità si tiene sei anni |
| **22** | **IL DIFETTO SEGNALATO DEL MOTORE DI STOCCAGGIO NON È ANCORA RIPRODOTTO.** «L'ubicazione non soddisfa i criteri anche quando la regola è definita correttamente»: resta una frase senza un caso. La 2.8 rende più facile riprodurlo, perché ogni esclusione porta il suo `motivo` in chiaro | **Serve il caso vero**: la regola esatta come è scritta, il vano che rifiuta, il messaggio a video. Senza quei tre non si sa nemmeno se sia ancora vivo |
| **19** | **`6001055` MANGANESE SOLFATO: l'ODP lo chiede in KG, l'anagrafica lo dichiara PZ.** ⚠️ **Contraddizione aperta dal 26/08**: la 2.4 dichiara di averla chiusa, questa coda la tiene aperta, e nessuno ha verificato quale delle due righe sia sbagliata | **Prima si stabilisce se è chiusa**, guardando il foglio ODP e l'anagrafica. Poi: se l'unità si perde in lettura è il parser, se il dato è storto all'origine è l'anagrafica — due difetti diversi |
| **15** | **L'AREA WIP VA CONSOLIDATA.** È **un'ubicazione mappata**, non un prefisso, e `Store` la legge da `meta.areaWip`. Il 25/08 il servizio vivo diceva **`MAG1-WIP-01`**, mentre il documento diceva `M06-COM-01`: sono tutte e due ubicazioni vere, `M06` è il magazzino Rinaldi «IN COSTRUZIONE» e `MAG1` porta tutta la giacenza. Il valore è cambiato dopo il 19/08 e nessuno l'ha scritto | **Quale dei due vani sia quello giusto, prima di ogni altra cosa.** Il conto di produzione ci ha già lavorato dentro. Dal 2.11 il valore si legge dall'applicativo, non con `curl` |
| **5** | **CARATTERIZZARE LE ZONE** in Configurazione → Zone: classe di conservazione, zona allergeni, zona pericolosi, refrigerata. Finché non è fatto **la mappa resta muta**: la verifica confronta due metà e una manca. Misurato il 19/08: la conformità copriva il **6% delle righe** (12 su 194), una zona su quattordici portava la classe | **Pianificare verifica e correzione**: prima si misura quante zone e quante righe sono scoperte, poi si decide se il buco è nel dato o nel codice che lo legge |

### Sono di Andrea — dati e configurazione

Un agente non ci mette mano. Stanno qui perché senza di loro certe funzioni non
hanno con cosa lavorare.
| # | Cosa |
|---|---|
| **3** | **Un secondo Team Leader.** `ANSA` era l'unico con un PIN. **Da sapere:** `DP` (Daniele Pedrazzi) risultava **attivo e senza PIN**, e senza PIN non si firma niente: o gli si dà un PIN o lo si disattiva come i quattro storici. **Da rileggere quando il magazzino vero passa alla beta** (voce 79): su questa macchina l'anagrafica è quella delle prove |
| **6** | **`pieces_per_pack` in anagrafica** (colonna `Pezzi_Per_Collo` dell'import). **Meno urgente dal 26/08**: un lotto congelato senza `uom_per_collo` **ripiega dall'anagrafica** a lettura e a unità uguale, quindi compilarla dopo ripara anche i lotti già a scaffale. Resta il gesto che risparmia una digitazione a ogni posizionamento su 11.115 articoli |
| **7** | **Partita IVA e dati mittente** in Configurazione → DDT. La partita IVA del destinatario rientrato con la voce 49 vale `123456`, **che è un segnaposto**: va corretta prima che quel cliente riceva un DDT vero |
| **13** | **Il prefisso GS1 è già compilato e vale `1234567`** — misurato il 25/08. Vuoto → codici interni; compilato → **SSCC veri**. `1234567` non è assegnato da un consorzio: un'etichetta stampata adesso porta un SSCC che *sembra* vero. Dentro l'azienda non fa danno, fuori sì — voce 24 |
| **16** | **Le prime regole di stoccaggio.** `storage_rules` è vuota, e finché non ci sono il motore lavora sui soli vincoli. Sono un **dato** (`article_code` inizia per 700 → `MAG2` è un record), non codice |
| **60** | **`ADMI` è un operatore admin nato per sbaglio sul collaudo** (26/08, maschera aperta precompilata `admin`/`admin`, PIN riempito dal gestore password). È attivo, ha ruolo admin, e **il PIN non lo conosce nessuno**. Sta sul servizio di collaudo (4199). Andrea: «lascialo, ci penso io» |

### Standby — ferme per scelta
| # | Cosa |
|---|---|
| **8** | **Nome DNS interno e certificato** dalla CA aziendale. Il codice è pronto: due variabili e HTTPS si accende. **È anche l'unica risposta al mezzo difetto che la 2.11 lascia aperto** |
| **24** | **Se le etichette escono dal cancello.** Quel che si stampa è **Code128, non GS1-128**: manca FNC1 e l'identificativo `(00)`. Il giorno che un cliente deve leggere un SSCC, `modules/code128.ts` va **esteso, non aggirato**. **Dalla 2.19 i costruttori sono due**, e la tentazione è di chiuderla solo da una parte: `^BC` di ZPL il GS1-128 lo sa fare da firmware, in tre caratteri. Farlo lì e non nell'A4 vorrebbe dire **due etichette dello stesso pallet che codificano cose diverse** — due verità, che è il difetto che questa voce esiste per evitare. Si estendono insieme o non si estende niente |

### Da chiarire — manca un fatto
| # | Cosa | Cosa manca |
|---|---|---|
| **1-bis** | **Chi ha cancellato `C:\Pathfinder\app\pathfinder-1.6.1`** il 17/08 alle 19:14. La cartella è stata ricostruita e la via di ritorno è di nuovo intera, ma la causa non si conosce | Se non è stato un gesto di Andrea in un'altra finestra, qualcosa cancella dentro la directory di installazione |

### Decise, e non si riaprono
| # | Cosa |
|---|---|
| **17** | **La capienza dei vani non si dichiara, e non è un buco.** I vani non hanno un limite: la verifica la fanno **a vista gli operatori**. Il vincolo nel motore resta e non esclude mai per pieno. (Dalla 2.8 capienza e **portata in chili** si possono comunque scrivere sulla singola cella con `location_attrs`: è uno scavalco puntuale, non una dichiarazione di massa) |
| **25** | **La vista 3D della mappa: valutata, e no.** Le ubicazioni non hanno coordinate — `core/geometria.ts` le genera da corsie, campate e livelli — quindi sarebbe la stessa griglia con la prospettiva in più: costo alto, informazione zero. La **vista frontale con «Specchia»** copre quel che serviva |
| **65** | **`xlsx` 0.18.5 RESTA, E IL RISCHIO È SCRITTO.** Due vulnerabilità note — prototype pollution (GHSA-4r6h-8v6p-xvw6) e ReDoS, gravità alta — e su npm non c'è un fix: SheetJS pubblica le corrette solo dal proprio sito. **Deciso da Andrea il 01/09: si accetta.** Il vettore è il file Excel che un operatore carica, e quell'operatore è **identificato, sulla rete interna, con un foglio che ha generato lui**: non è un file che arriva da fuori. Passare alla versione del sito vorrebbe dire riprovare tutto quel che tocca Excel — ODP, anagrafica, export — per chiudere una porta che dà su un corridoio interno. **Si riapre il giorno che un foglio arriva da fuori** |
| **26** | **Il ramo Azure non è «pronto e non lo chiama nessuno»: È DIVENTATO IL DRIVER.** La voce diceva che `server/azure/` stava lì in attesa di una decisione. **La decisione è stata presa il 26/08 e la cartella non esiste dal commit `ffcf1e8`**: `schema-postgres.js` è andato in `server/lib/`, `audit.js`, `audit-sqlite.js` e `migra-sqlite-postgres.js` in `server/migrazione/`, e da lì viaggiano dentro il pacchetto. Quel che era un ramo parallelo è **il PostgreSQL che gira adesso**. Resta vera una cosa sola di quella voce, e vale per il database di oggi come per Azure: **il magazzino si ferma quando si ferma la macchina del servizio**, e §8 lo dichiara — niente lavoro offline, per scelta |
| **35** | **La 2.1 andò in servizio da un pacchetto che nessun documento nominava.** Terza volta in quattro giorni. Non è una riga da correggere: è il motivo per cui esiste §0 punto 2 |

### Chiuse — con la prova
| # | Cosa | Prova |
|---|---|---|
| ~~**91**~~ | **LA BAIA DI CARICO NON ERA CONFIGURATA DA NESSUNA PARTE, E SENZA NON SI CARICA.** La schermata lo diceva in chiaro, ma nessuna zona portava `dock_zone`: la tessera si apriva su un avviso | **03/09 sera — Andrea ha marcato una zona e ha fatto il giro: tutto a posto.** È la prima prova del carico spedizioni fatta **fuori dal banco**, sull'installazione di questa macchina. Resta aperta la voce **92**, che è un'altra domanda: il banco e questa macchina non sono la banchina, e quel che il carico deve reggere sono venti pallet e un camion che aspetta |
| ~~**86**~~ | **LE STAMPANTI HANNO LA PRESA DI RETE, E LE INSTALLA L'IT.** Andrea, 02/09: serie **ZD200** o modello precedente simile, **203 dpi**, adesive staccate **100 × 80**, già in rete e gestite dal team IT. Era il rischio che teneva in piedi tutto il resto — le desktop Zebra di quella fascia escono spesso con la sola USB, e senza una porta TCP il servizio non ha nessuno a cui parlare | **Chiusa dal fatto.** Nessun print server esterno serve; la porta 6101 resta nell'elenco ammesso per i casi futuri, e non costa niente |
| ~~**84**~~ | **LA PORTA 9100 IN USCITA NON ERA NELLO SHEET TECNICO**, che dichiarava una porta sola: la 4173 in ingresso. Dalla 2.19 il servizio apre connessioni **in uscita** verso le stampanti, e quella è una richiesta di autorizzazione al team IT, non un dettaglio di codice | **Scritta il 02/09, in due lingue.** `documenti/IT-TECH-SHEET.md` passa a **rev05**: nuovo **cap. 5.3** coi requisiti di rete (IP fisso o riserva DHCP, 9100 in uscita, ambito privato, porte ammesse, calibrazione e calore), il cap. 3 dichiara le connessioni in uscita, il 5.1 la rete, il 6.3 la configurazione delle stampanti e del layout, e il 12 porta **due richieste nuove all'IT**. Le istruzioni operative stanno in `README.md` §7 e `README.it.md` §6, con la tabella dei messaggi di guasto in §9; il servizio le ha in `server/README.md` e `server/LEGGIMI.md` |
| ~~**75**~~ | **L'INSTALLER SI CHIUDEVA LA PORTA IN FACCIA DA SOLO, SU MACCHINA PULITA.** `Blinda-Radice` stringeva i permessi della radice con un `icacls` solo, `/inheritance:r` e `/T` nella stessa riga: quella coppia scende su ogni figlio e gli toglie gli ACE ereditati, mentre i tre `/grant` non arrivano fino in fondo. Restano file con l'**elenco vuoto**, e un elenco vuoto nega tutto — anche a un Amministratore, anche solo per leggere di chi è il file. Girava in fondo al passo del servizio, e il passo dopo doveva lanciare `installa-versione.ps1` **da quella cartella**: «Accesso al percorso negato», segnalato da PowerShell come comando non trovato. **E `icacls` usciva con zero**, quindi l'installer scriveva «Permessi applicati» in verde. Non si era mai visto perché ogni installazione era un aggiornamento, e la blindatura sta nel solo ramo di prima installazione — la stessa cecità della voce sulla 2.10 | **Corretta il 01/09 in `server\installa-pathfinder.ps1`**, non nel pacchetto (§7). Due gesti invece di uno: l'elenco si scrive **sulla sola radice**, poi si spinge in basso con `/reset` **sui figli**, che dà a ognuno l'elenco ereditato dal padre — `/reset` sulla radice no, la rimetterebbe a ereditare da `C:\`. In più la blindatura è stata **spostata dopo il passo dell'applicativo**, così è l'ultimo gesto che tocca il disco e la Verifica passa dopo; e una guardia prova ad **aprire davvero** un file — `Test-Path` diceva `True` anche sui file murati, ed è così che il difetto è passato. **Provato su un albero finto**: col vecchio comando `icacls` esce **0** e il file resta senza nessun ACE; col nuovo il file porta le tre righe `(I)`. **Due prove nuove** in `collaudo-installazione.js` (31 → **33**), e verificate rosse rimettendo ciascuno dei due difetti |
| ~~**82**~~ | Lo sheet tecnico per il team IT era in italiano, e fermo al 28/08 | **02/09 — `documenti/IT-TECH-SHEET.md` è alla REV02, bilingue.** Italiano e inglese nello stesso documento controllato, stessa numerazione di capitolo, e la clausola che in caso di discordanza **prevale l'italiano**. La rev01 è archiviata in `ARCHIVIO\documenti superati\`. **Aggiornata dalla 2.12 alla 2.17**, e il grosso è che il documento dichiarava cose non più vere: il **limite 2** («permessi per ruolo verificati nel client») era una falla di sicurezza dichiarata aperta e **chiusa dalla 2.13 e dalla 2.16** — adesso è barrata con la prova accanto; la **conservazione a sei anni** è uscita e al suo posto c'è la tabella dei quattro regimi con la decisione rimandata alla QA/RA (cap. 8.3). Aggiunti: la via di fuga dell'Admin (8.2), la disinstallazione (6.1), il passaggio dalla 1.4 coi due controlli da fare prima (6.5), due limiti nuovi — **10** la storia di git, **11** la migrazione non ancora provata sui dati veri — e i numeri di collaudo rimisurati (servizio 127 → **141**, installazione 31 → **43**, più gerarchia **40**, ciclo **47**, migrazione **14**). Corretto il rimando a `server\azure`, che non esiste dal 26/08 |
| ~~**80**~~ | Sei export JSON tracciati portavano impronte PIN di persone vere | **02/09 — le impronte sono uscite dai sei file**, in modo chirurgico: `pin_hash`, `pin_salt`, `rec_hash`, `rec_salt` via, tutto il resto byte per byte — 26 righe tolte, conteggi e ogni altro campo verificati invariati. **La storia non è stata riscritta**, per decisione di Andrea: repository privato, e un secondo push forzato nella stessa settimana costa più di quel che rende. **E la lezione è stata imparata come si deve**: non un'altra riga nel `.gitignore` ma **`test/segretiFuori.test.js`**, che apre i JSON tracciati e guarda dentro la collezione `operators`. Verificata rossa rimettendo un'impronta. Un filtro per estensione non reggerà il prossimo formato; guardare dentro sì. **E i backup restano utili senza PIN**: la finestra del primo avvio si riapre, che è il modo giusto di partire su una versione nuova |
| ~~**74**~~ · ~~**73**~~ · ~~**69**~~ | Il registro azzerato, le giacenze sostituite, i conteggi che non tornavano | **02/09 — NON ERA MAI SUCCESSO NIENTE, ed è §0 che mancava.** Questa è la macchina di **sviluppo**, non il magazzino: i conteggi che si accavallano sono prove. **E il file è stato identificato**, da Andrea: `ARCHIVIO\BACKUP E FILE DI TEST\warehouse-mapper-2026-08-20_GIACENZE REALI IN COLLI.json` — il **primo conteggio vero del magazzino**, quello da cui riparte ogni prova di una versione nuova. Porta `articles` **11.197**, `inventory` **882**, `operators` 2 — **gli stessi numeri uno per uno** dei due «incidenti» — e `mov_log` **presente e vuoto**, che per la regola della voce 45 **svuota il registro**. Non è merce persa: è un conteggio di giacenza, e un conteggio non porta movimenti |
| ~~**72**~~ | Un dump del magazzino vero, coi PIN dentro, stava nella storia del repository | **01/09 — LA STORIA È STATA RISCRITTA.** Backup completo prima (`pathfinder-pre-riscrittura-2026-09-01.bundle`, 71,6 MB, «complete history» verificata), poi `git filter-repo --path banco/db/pathfinder-2026-08-27.dump --invert-paths` su 296 commit e **push forzato** su `main`. Verificato dopo: `rev-list --objects --all` non nomina più quel blob, e `GET /contents/…?ref=main` risponde **404**. **Il ramo `claude/…` e la PR #1 non lo portavano**: divergono da prima del commit. Il file resta su disco, e `.gitignore` lo tiene fuori. **Restano due code, e sono la voce 78**: i vecchi commit rispondono ancora per SHA finché GitHub non fa pulizia, e i PIN di quel dump vanno rinnovati quando quegli operatori rientrano |
| ~~**71**~~ | Il banco del ciclo chiedeva a un `TRANSFER` di restare aperto | **Allineato il banco, non il codice**: `chiudeAlGesto` comprende `TRANSFER` per decisione di Andrea alla 2.1. Il residuo si prova dove vive davvero — su un `DISPOSAL`, tre colli esauriti in due volte. `CP1` è uscito da `difetti.json` |
| ~~**70**~~ | Il banco del percorso leggeva un ODP che non era quello della sua ricetta | **Rigenerata da `07082026_gluc.xlsx`**, come deciso da Andrea: `ODP2603889` → **`ODP2607777`**, 15 componenti, 380,25 KG, e la testata del foglio dichiara lo stesso totale. È lo stesso ODP che firma i movimenti veri del dump del 31/08. Il banco del ciclo: **47 verdi, zero rosse** |
| ~~**50**~~ | Un difetto «grave» del ciclo non faceva fallire niente | **Chiusa dalla 2.16 — §3.** Solo `grave` ferma la corsa, `dato` no, e si guarda l'ora e non l'elenco. **Provata dal vivo**: la corsa che aveva alzato `Q1` diceva «47 passed», adesso esce 1 |
| ~~**34**~~ | Undici movimenti senza merce, ed era una famiglia | **Chiusa dalla 2.16 — §3.** Il dump del 31/08 ne porta due con la nota in chiaro: sono le operazioni sull'**unità di carico** scritte nel registro della merce. Adesso hanno la causale `UDC`, e lo spostamento di un'unità scrive **una riga per ogni partita** invece di una riga che non nomina niente |
| ~~**33**~~ | Il registro non diceva quanto, ed era il codice a scrivere | **Chiusa dalla 2.16 — §3**, e in due pezzi: `qty_delta` non contraddice più i suoi estremi, e `quantitaMossa` risponde alla domanda che nessuno faceva — quanti colli hanno cambiato posto. Tredici prove in `registro-completo.test.js`. **Le righe già scritte non si toccano**: si leggono con la funzione nuova |
| ~~**12**~~ | Le unità di carico erano attive e non ne esisteva nessuna | **01/09 — ne era nata una, e i suoi movimenti lo dicono.** Il dump del 31/08 porta «Unità di carico creata: UDC-000001» e il suo spostamento sulla mappa. La collezione `udc` era vuota perché è stata **sostituita**, non perché la funzione non produca niente: è la voce 73, vista da un'altra parte |
| ~~**68**~~ | Il giro dei cinque ODP non era mai girato per intero | **27/08 sera**: girato al banco su copia del database con ODP generati dalle giacenze vere. Una tappa sola, l'ubicazione chiesta una volta, le quote che sommano esattamente il consumo. Ha fatto uscire **tre difetti**, tutti corretti — §3 |
| ~~**66**~~ | I permessi per ruolo stavano nel client: una sessione qualunque e una riga di `curl` bastavano a scriversi `role: "admin"` addosso | **Chiusa dalla 2.13**, e provata dove la regola viene imposta: `banco/gerarchia.cjs`, **32 prove** con `fetch` e i cookie veri. Il Team Leader non si promuove nemmeno passando da una transazione o svuotando la collezione. **In servizio dal 31/08** |
| ~~**64**~~ | Le rotte `/api` non chiedevano credenziali a nessuno | **Chiusa dalla 2.11**, e verificata in produzione il 28/08: `GET /api/c/meta` senza sessione risponde **401**. Resta la voce 66 |
| ~~**56**~~ | L'installer non sapeva consegnare PostgreSQL | **26/08 sera**: `prepara-postgres.ps1` controlla il motore e prepara ruolo e database con `LC_COLLATE 'C'`, generando la password. `migrazione/` viaggia nel pacchetto. Le prove di installazione passano da 22 a 29 |
| ~~**55**~~ | `pg` non era nel servizio installato | **Trovato prima di installare.** Ora l'installer guarda dipendenza per dipendenza come le dichiara `package.json`, nomina quale manca, e si ferma se dopo `npm install` ne manca ancora una |
| ~~**54**~~ | Il database non era normalizzato e la 2.6 lo pretendeva | **Notte del 26/08**, a servizio fermo, con backup fresco e prova a vuoto prima di `--scrivi`. Dopo: **0 codici minuscoli**, la riga doppia di `MAG1-RAKA-01-05-C` è una sola da 6, e il registro porta l'`EDIT` che lo spiega |
| ~~**53**~~ | Il backup cambiava padrone su PostgreSQL | **Chiusa con la 2.7 e provata sul magazzino vero**: `pathfinder-2026-08-26-1909.dump`, 419 KB, 21 tavoli, `exit 0`. La password non passa dalla riga di comando ma da `PGPASSWORD`, nel solo processo figlio |
| ~~**49**~~ | `recipients` vuota, il registro nominava «BIOTECH SRL» dieci volte | **Rientrata UNA riga il 25/08** — le quattro del backup erano lo stesso cliente inserito quattro volte |
| ~~**48**~~ · ~~**48-bis**~~ | La correzione della voce 45 non era in servizio · l'INDEX diceva la versione sbagliata | 2.4 installata il 25/08 sera. **Il documento aveva sbagliato per la quarta volta in cinque giorni**: da allora la riga «in servizio» si scrive solo dopo aver interrogato `/api/app-info` |
| ~~**47**~~ | L'anagrafica dei mittenti andava pulita | 25/08: il giro di banco del 24/08 uscito intero dal database, **e le due giacenze che aveva toccato riportate come stavano** dal backup del 23/08, confrontate campo per campo |
| ~~**46**~~ | L'anagrafica operatori era stata sostituita in blocco | 25/08: `ANDS`, `ANAD`, `BABB` ed `EFBR` rientrati come **storici disattivati e senza PIN** — non possono operare, esistono perché il registro li nomina |
| ~~**45**~~ | Il ripristino cancellava il registro | `importAll` distingue **chiave assente** (il registro resta) da **elenco vuoto** (`mov_log: []`, si svuota). E `_partial` si vede prima di premere |
| ~~**44**~~ | Il registro veniva svuotato dal recupero di un backup automatico | Causa trovata (`writeOPFSBackup` esce con `includeMovLog: false`, `componi` fa `delete data.mov_log`, `importAll` svuotava e poi saltava) e registro ricostruito: 266 movimenti continui dal 07/08 al 25/08 |
| ~~**41**~~ | `app\precedente` portava la 2.3 ritirata | 25/08 sera: `precedente` porta la 2.2, confrontata **file per file**, nove su nove identici |
| ~~**40**~~ | `PATHFINDER_APP` puntava a un file singolo | Refuso dei primi giorni. `/api/app-info` dice `modo: cartella` e comanda `PATHFINDER_APP_DIR` |
| ~~**39**~~ | L'attività pianificata puntava al repository | **La trappola più grossa trovata finora.** Corretta il 25/08 all'01:49 ri-registrando l'attività da `C:\Pathfinder\servizio` — §7 |
| ~~**38**~~ | Le righe già nel vano non hanno misure a conto | Non si pone: **un'installazione pulita parte con il database vuoto** |
| ~~**36**~~ · ~~**32**~~ | Installare 2.3 · 2.2 e vedere i due numeri coincidere | La 2.3 **non si installa** (ritirata). La 2.2 installata il 25/08: `08ce3f69…`, 1.777.087 byte |
| ~~**30**~~ · ~~**29**~~ · ~~**14**~~ | Righe WIP che nessun ordine rivendica · l'archivio ODP non si sfogliava · il campo fantasma sulle giacenze | Chiuse dalla **2.2** — §3 |
| ~~**28**~~ | Il campionamento non sapeva prendere un collo intero | Regola nuova decisa da Andrea il 25/08. **Va ancora portata nel codice: voce 42** |
| ~~**23**~~ | Leggere un'etichetta col lettore vero | Barcode verificato conforme — Andrea, 25/08. Il Code128 è stato letto da un lettore ottico su un foglio stampato da questo codice |
| ~~**20**~~ | Provare le maschere che pretendono l'identità | Provate e funzionanti — smaltimento, trasferimento, prelievo, quarantena, conta, DDT, reso, chiusura del conto. Andrea, 25/08 |
| ~~**18**~~ | Due sigle firmavano movimenti e non erano in anagrafica | 25/08: `DP` è **Daniele Pedrazzi**, `AS` non compare più. **Nessuna firma orfana su 264 movimenti** |
| ~~**4**~~ · ~~**2**~~ | Quattro attività rimaste `in_progress` · provare il pacchetto su una macchina pulita | Annullate · fatta, conforme — Andrea, 25/08 |

---

## 5. Comandi

```bash
npm run dev      # sviluppo, ricarica a caldo — ATTENZIONE: parla col servizio VERO
npm run build    # produce "consegna/Pathfinder <ver>/" — il pacchetto da consegnare
npm run check    # tsc client + servizio, nessun file emesso
npm test         # vitest — 1.355 prove in 50 file al 03/09 notte
```

```bash
node test/collaudo.js                    # 156 prove sul servizio, da server\
node test/collaudo-migrazione-1.4.js     # 8 prove sul cambio di schema, da server\
node test/collaudo-installazione.js      # 43 prove sugli script di installazione, da server\
node test/collaudo-stampa.js             # 100 prove sulle etichette Zebra, da server\
```

`collaudo-stampa.js` **non ha bisogno di una stampante**: alza un finto
ascoltatore sulla 9100 e legge i byte che gli arrivano. Quel che invece una
stampante la vuole — che l'etichetta esca dritta, che le barre le legga un
lettore vero, che il calore sia giusto per il supporto montato — sono le
**voci 83 e 89**.

`SINGLE_FILE=1 npm run build` riproduce il file unico di prima.

### Il banco di prova

**È l'unico posto dove si prova una versione prima di installarla**: copia a
caldo del database, porta sua, cartelle sue. Sta in `MAPPER\banco\`.

> **La prima riga qui sotto chiede una copia al servizio vivo, e dal 01/09 quel
> servizio ha un database vuoto**: la copia esce, ma dentro non c'è niente.
> Finché il magazzino non rientra (voce 74) il banco riparte da un file già
> salvato: `banco\db\ui.db`, oppure uno dei `.db` in
> `Desktop\pathfinder-backup-storico\`. Da un `.dump` no — quello è PostgreSQL,
> e il banco gira su SQLite.

```powershell
$BANCO = "$PWD\banco"
Invoke-RestMethod -Method Post http://127.0.0.1:4173/api/backup -ContentType 'application/json' -Body (@{dir="$BANCO\db"} | ConvertTo-Json)
.\server\installa-versione.ps1 -Da ".\consegna\Pathfinder <ver>\app" -Versione <ver> -Casa "$BANCO\app"
node banco\servizio-banco.mjs db\<file>.db          # 4199, in chiaro, ambiente dichiarato
```

**LA RIGA DI VARIABILI A MANO NON C'È PIÙ, DALLA 2.29.1, E IL PERCHÉ VALE PIÙ
DEL COMANDO.** Chiedeva di scrivere cinque variabili; chi la scrive vede quel
che ha scritto, non quel che ha **ereditato**. Su questa macchina sette
`PATHFINDER_*` stanno a livello MACCHINA, e in due settimane si sono dimenticate
due volte:

- **`PATHFINDER_PG`**, il 26/08: il banco ha aperto il PostgreSQL di lavoro e un
  `TRUNCATE` si è preso gli 11.197 articoli appena migrati. Vince su
  `PATHFINDER_DB`, quindi il nome del file di banco nella riga **non protegge**.
- **`PATHFINDER_TLS_PFX`**, dalla 2.26 all'08/09: nella ricetta non compariva
  nemmeno, perché è arrivata dopo. Il banco partiva in HTTPS, le prove parlavano
  in chiaro sulla stessa porta, e il `301` faceva degradare ogni POST a GET. Non
  moriva: **rispondeva**, e accusava il servizio di buchi che non ha.

Una riga in più nella ricetta si dimentica una terza volta. `servizio-banco.mjs`
dichiara l'ambiente per intero, rifiuta un database che non esiste e rifiuta un
database dentro `C:\Pathfinder\`. Se ne accorge anche `npm test`:
`test/bancoNonEredita.test.js` **cerca** i file che accendono il servizio invece
di elencarli, quindi un banco nuovo scritto domani senza la riga cade il giorno
stesso.

Il servizio dichiara all'avvio quale database ha aperto: **quella riga si legge
prima di toccare qualunque cosa.**

Per il front end, invece di costruire e installare:

```powershell
$env:PATHFINDER_DEV_API='http://127.0.0.1:4199'; npm run dev     # 5173, parla col banco
```

Senza quella variabile `npm run dev` parla col servizio **vero** sulla 4173.
**Dalla 2.14 c'è un modo che non si può sbagliare** — `node banco\dev-banco.mjs`
impone la variabile prima di accendere vite e apre sulla **5199**: una finestra
di sviluppo attaccata al magazzino vero non esiste più per costruzione.

### Il banco della schermata WIP — 2.14

Un banco suo, con dentro **merce in lavorazione** su cui provare la lista, il
reso e lo storno. Tre pezzi, e si rifanno in quest'ordine:

```powershell
# 1 · il database: copia del pristino, con un Admin di cui si conosce il PIN
Copy-Item banco\db\pristino.db banco\db\ui.db -Force
# (l'operatore ANDS del pristino è stato portato ad admin con PIN 481516 —
#  è una copia usa-e-getta, e quel PIN non esiste da nessun'altra parte)

# 2 · gli ODP di prova, generati DA QUEL database
node banco\genera-odp-wip.cjs          # esce in banco\odp-wip\

# 3 · il servizio e il front end — due comandi, nessuna variabile a mano
node banco\servizio-banco.mjs db\ui.db  # 4199, ambiente dichiarato — §5
node banco\dev-banco.mjs                # 5199, front end di sviluppo
```

**`genera-odp-wip.cjs` LEGGE I LOTTI DAL DATABASE, e non è un dettaglio.**
Quello della 2.12 li scrive fissi — presi dal magazzino del 27/08 — e su un
database diverso quelle righe non trovano niente: il percorso nasce vuoto, e
la prova non prova niente. Questo cerca i lotti che dichiarano **unità e
quantità per collo** (senza, la ripartizione del consumo non si calcola),
preferisce i chili ai pezzi, e scrive cinque ODP per il giro, uno a due righe
per il reso e uno per il ricalibro.

`banco\banco-ui.js` sono gli attrezzi da iniettare nella pagina quando si
prova a mano: `__audit()` misura i campi che non ci stanno, `__odp(...)` carica
i file nella schermata, `__preleva(...)` fa un giro intero fino alla chiusura.
**Modificarlo fa ricaricare la pagina** — vite guarda tutta la radice — quindi
si finisce prima di accendere il banco.

> **Il banco sulla 4199 va spento prima di `node test/collaudo.js`**: le prove
> del servizio si aprono una porta loro, ed è la 4199. Con il banco acceso
> muoiono su `EADDRINUSE`.

> **Il banco non va mai in `C:\Pathfinder\`.** Ci è finito una volta, il 17/08.

### Il banco del prodotto finito — 2.20

Non è automatico: è un giro da fare a mano su una copia usa-e-getta, e ci
vogliono dieci minuti. **Serve un Admin di cui si conosca il PIN**, e su una
copia del pristino il modo più corto è svuotare `operators` e lasciare che la
finestra di primo avvio ne chieda uno nuovo — §1: appena `operators` è a zero
il servizio riapre quella porta, ed è la stessa che si richiude da sé al primo
Admin creato.

```powershell
Copy-Item banco\db\pristino.db banco\db\ui.db -Force
```

Poi si accende il banco come sopra e si fa questo giro, **con la finestra
stretta almeno una volta** — la maschera è del reparto, e il reparto ha un
terminale da 4,3":

1. Configurazione → **Parametri articolo** → un modello di imballo (EPAL 8 × 5,
   tara 25).
2. Configurazione → **Siti e Zone** → si marca una zona come **prodotto
   finito** (sul pristino: `M03 / SPEDIZIONI`).
3. Movimenta → **Prodotto finito** → nuovo bancale → articolo, lotto,
   scadenza, colli (proposti dal modello) → **Chiudi bancale**: nasce l'unità,
   entrano le righe con causale `PROD`, e si apre la stampa dell'etichetta.
4. L'elenco lo mostra **pronto**; «Vedi in mappa» lo tinge di verde nel vano.
5. Si spunta, **Carica in DDT**, si compila la testata, si registra, si evade:
   il bancale diventa **spedito** e il registro porta `SHIP`.
6. **Conto terzi**: si spunta «la merce si sposta» su una causale, si rifà il
   giro indicando un'ubicazione di arrivo, e all'evasione la merce **è nel vano
   d'arrivo** invece di essere sparita.
7. **Packing list**: dal DDT pendente o dall'archivio, il pulsante accanto a
   quello del DDT.

**Il giro del 03/09 è passato tutto**, e ha trovato due difetti che nessuna
prova da ferma vedeva — §3, il riquadro su `dest_location`.

### Il banco della 2.21 — il bancale che si impara, e il camion

Stessa copia usa-e-getta, e in più **una zona marcata baia di carico**. Sul
pristino: `M03 / SPEDIZIONI` come prodotto finito e `M03 / TRASFERIMENTI`
come baia, **tutte e due portate a 20 posizioni** — in baia va una posizione
per bancale, e con una sola il giro si ferma al secondo pallet.

Il giro fatto il 03/09 sera, tutto passato:

1. **Un articolo senza modello**: i colli nascono vuoti, il «per collo» viene
   dall'anagrafica. Si dichiara `40 × 20 KG` più `1 × 7 KG` e si chiude: il
   bancale prende **41 colli e 807 KG**, e l'articolo impara **`AUTO-40`** —
   i soli colli pieni, il collo spaiato no.
2. **Lo stesso articolo, un altro lotto**: il campo colli nasce a **40** e il
   per-collo a **20**. Il bancale porta scritto `model_code: AUTO-40`.
3. **L'etichetta esce prima del vano**, e la maschera dell'ubicazione sta già
   sotto la finestra di stampa.
4. **Scarico a mano** di un bancale: si chiede il solo numero di DDT, nasce un
   documento **già evaso**, l'unità passa a `shipped` e in elenco compaiono
   **DDT e data** — e il bancale continua a dire che cosa portava.
5. **Carico spedizioni**: due bancali su un DDT, scansione dei due codici,
   spostamento in **due posizioni diverse** della baia, righe del documento
   riallineate al vano nuovo.
6. **Ricaricando la pagina il carico si ritrova dov'era** — è la prova della
   trappola 22, §1.
7. **Un secondo DDT nello stesso carico, con la tappa saltata**: alla
   chiusura esce il primo, il secondo **resta pendente** e il riscontro dice
   quale e quanto manca.
8. **DDT e packing list a video** — riscritto per la **2.24**: due bancali
   dello stesso lotto danno **una riga sola** in bolla, con la quantità e
   l'unità in **due colonne** («80 · 1.600 · KG») e «2 bancali» sotto la
   descrizione, non in una colonna Note. In packing list danno **una riga
   articolo, una riga lotto e due righe bancale** annidate sotto, ognuna con
   «40 × 20 KG», e i totali di articolo e lotto devono coincidere con la somma
   delle righe sotto — è la cosa che si guarda per prima.
9. **La maschera a 480 px**, che è il terminale del reparto: ci sta tutta.

> **Il banco della 2.21 ha usato una copia con `operators` svuotata** e un
> Admin creato dalla finestra di primo avvio, come dice la ricetta qui sopra.
> `banco\db\ui.db` **non è più il file del banco WIP**: chi torna a quello
> ricopia `pristino.db`.

**Le cariche hanno un banco loro, e non chiede niente a questo** — dalla 2.13:

```powershell
node banco\gerarchia.cjs      # 32 prove, database temporaneo, porta 4198
```

Accende un servizio suo su un database usa-e-getta, esercita le rotte con
`fetch` e coi cookie veri, e si spegne. **Non tocca `banco\db`** e non
vuole il banco del ciclo acceso: la porta è la 4198, non la 4199.

---

## 6. Come si consegna

**Costruire non è consegnare, e consegnare non è servire.**
| Luogo | Chi ci **scrive** | Chi ci **legge** |
|---|---|---|
| `consegna\Pathfinder <ver>\` — il **pacchetto** | `npm run build`, che azzera `consegna\` a ogni giro | chi installa, a doppio clic — **mai il servizio** |
| `C:\Pathfinder\app\pathfinder-<ver>\` — il **deposito** | `installa-versione.ps1`, che **rifà la cartella a ogni installazione** di quel numero | nessuno direttamente |
| `C:\Pathfinder\app\corrente\` e `precedente\` | i due script, che ci **materializzano** una versione | **il servizio** |
| `ARCHIVIO\` | l'archiviazione | nessuno |

**`corrente` è una copia, non un rimando**: sono cartelle vere di cui
l'installazione sostituisce il contenuto, costruendolo accanto e rinominando —
la finestra in cui `corrente` è incompleta dura quanto un `rename`, e chi
carica la pagina in quell'istante trova i suoi assets in `precedente`. **Quale
versione sta dove lo dice il manifesto**, non un registro accanto.

### Il pacchetto

```
Pathfinder <ver>\
  Installa Pathfinder.bat     ← doppio clic, INVIO, fine
  installa.ps1                il motore
  LEGGIMI.txt
  app\                        indice, assets, manifesto
  servizio\                   il servizio dati, i suoi script, migrazione\ e il README
```

**Una versione è l'applicativo più il servizio, e si installano insieme** —
dal 18/08. Prima un aggiornamento toccava il solo applicativo e `/api/app-info`
rispondeva due numeri diversi: due numeri per una versione sola sono un numero
che non vuol dire niente.

- **Prima installazione**: chiede **dove** (INVIO accetta `C:\Pathfinder`), poi
  fa tutto — prepara ruolo e database su PostgreSQL, copia il servizio,
  registra l'avvio all'accensione e il backup serale, apre la porta sul
  firewall, installa l'applicativo.
- **Aggiornamento**: **non** chiede dove, lo rilegge da `PATHFINDER_APP_DIR`, e
  una radice diversa la **rifiuta**. Ferma il servizio, copia applicativo **e**
  servizio, riaccende.

Alla fine verifica **due** cose: l'impronta dell'applicativo e che
`service_version` sia quel numero. Se il servizio dice ancora il numero di
prima, il riavvio non ha avuto effetto e l'installazione è fallita.

**Per vedere cosa farebbe senza toccare niente**: `.\installa.ps1 -NonChiedere -Prova`.

### Il database, dalla 2.7

**Una prima installazione nasce su PostgreSQL.** `prepara-postgres.ps1`
controlla che il motore ci sia — psql, `pg_dump`, `pg_restore`, servizio
Windows, porta, superuser — e **se manca dice dove si prende e si ferma senza
toccare niente**: su un PC di magazzino un download è l'antivirus che blocca e
l'IT che chiede conto. `pg_dump` e `pg_restore` si guardano **prima**, non alla
prima sera utile: su PostgreSQL il backup è fatto di quei due.

**La password del ruolo la genera l'installer, e nessuno la digita** (il 26/08 il
segnaposto `LA-TUA` è finito dentro la variabile di macchina). L'alfabeto è
quello che in un URL vale sé stesso: una `@` spezzerebbe la stringa di
connessione. Si vede **una volta sola** e poi vive solo in `PATHFINDER_PG`. La
password di `postgres` serve **una volta**, la chiede la finestra elevata, e
non passa mai per la riga di comando.

**Il database che sta già servendo un magazzino non si tocca**, e **aggiornando
resta quello su cui si trova**. Il passaggio si chiede a voce:

```powershell
.\installa.ps1 -Database postgresql   # da SQLite a PostgreSQL, MIGRANDO i dati
.\installa.ps1 -Database sqlite       # sul file, come fino alla 2.6
```

Il passaggio fa, in quest'ordine: chiede al **servizio ancora acceso** una copia
a caldo (un SQLite aperto ha un WAL accanto, e `Copy-Item` si porta via un
database a metà), ferma, rinfresca servizio e dipendenze, migra ricontrollando
i conteggi tavolo per tavolo, e **solo se arriva in fondo** riscrive
`PATHFINDER_PG` e riaccende. Una migrazione fallita a metà lascia il magazzino
sul file, intatto. **Non si scrive sopra un database che ha già dei tavoli**:
chi vuole partire vuoto lo chiede con `-SenzaMigrazione`. `-Database sqlite` su
una macchina già su PostgreSQL **viene rifiutato**: il gesto d'emergenza resta
`installa-servizio.ps1` senza `-PostgreSQL`.

### Regole dell'installazione

> **Il servizio non gira mai dal pacchetto**: viene copiato in
> `C:\Pathfinder\servizio` e registrato da lì. Altrimenti il magazzino si ferma
> il giorno che si sfila la chiavetta.

> **Prima disinstalla, poi installa — sempre.** Un numero nel deposito
> significa «gli ultimi byte installati con quel nome». Fino al 18/08
> l'installer passava `-Riusa`, e chi rifaceva la build senza cambiare numero
> restava ai byte di ieri: successo due volte con la 1.8.1 nella stessa notte.

> **Reinstallare la stessa versione non tocca `precedente`.** Si muove solo
> quando cambia **il numero** in servizio.

> **Gli script di gestione delle versioni si rinfrescano dal pacchetto** a ogni
> aggiornamento, anche quando il servizio non si tocca: nessuno li sta
> eseguendo, al contrario di `pathfinder-server.js`.

> **L'autorizzazione di Windows serve a ogni installazione**, non più solo alla
> prima (fermare un'attività che gira come SYSTEM la vuole), e l'applicativo
> **resta giù i secondi del riavvio**. È la promessa della 1.7 che cade, ed è il
> prezzo di avere un numero solo.

> **`/inheritance:r` E `/T` NELLA STESSA RIGA SVUOTANO L'ELENCO DEI FIGLI — 01/09.**
> Quella coppia scende su ogni file e gli toglie gli ACE ereditati, mentre i
> `/grant` restano sull'oggetto nominato: si trovano file **senza nessun ACE**,
> e un elenco vuoto nega tutto — a un Amministratore, a SYSTEM, e persino alla
> lettura di chi sia il proprietario. **Chi stringe i permessi di un albero lo
> fa in due gesti**: l'elenco sulla radice, poi `/reset` **sui figli** perché
> ereditino. Voce 75, e prima ancora una cartella che non si cancellava più
> (voce 74): la stessa riga, due serate.

> **UNA COSA CHE ESCE CON ZERO NON È UNA COSA RIUSCITA.** `icacls` murava i
> file e usciva `0`, e l'installer scriveva «Permessi applicati» in verde. Dove
> il gesto si può guardare, si guarda il **risultato** e non il codice di
> uscita: qui si prova ad **aprire** un file che deve restare leggibile —
> `Test-Path` risponde `True` anche su un file murato, ed è così che il difetto
> è passato.

> **LA PROVA A VUOTO NON PROVA LA PRIMA INSTALLAZIONE.** Il 01/09
> `installa.ps1 -Prova` ha detto «strada prima installazione» e non ha trovato
> niente da segnalare; la corsa vera si è rotta due volte, sui permessi e su
> una cartella rimasta da un tentativo interrotto. **`-Prova` legge, non
> scrive**: dice quale strada prenderebbe, non che quella strada regga. Su una
> macchina vergine la corsa vera va guardata riga per riga.

> **UN'INSTALLAZIONE INTERROTTA LASCIA UNA CARTELLA CHE LA SUCCESSIVA NON
> SOVRASCRIVE.** Il tentativo delle 00:25 si era fermato dopo il servizio,
> lasciando `C:\Pathfinder\servizio` già blindato; il tentativo dopo è morto su
> `Copy-Item : Accesso al percorso 'lib\db.js' negato`. **Dal 01/09 non tocca
> più a chi installa**: l'installer si accorge dei resti murati e li riapre da
> sé, dicendolo; e chi vuole ripartire davvero pulito ha
> `.\installa.ps1 -Disinstalla` (§6). Resta scritta perché su ogni macchina
> che non ha ancora questo installer il rifiuto parla di un file di cui chi
> installa non ha mai sentito nominare.

### Installare a mano, e tornare indietro

```powershell
npm run build
.\server\installa-versione.ps1 -Da ".\consegna\Pathfinder <ver>\app" -Versione <ver>
Invoke-RestMethod http://127.0.0.1:4173/api/app-info
```

Deve rispondere la versione attesa **e la sua impronta**, e **nessun campo
`errore`**. Se compaiono `errore` e `utente`, quella riga dice di cosa è morto
il servizio e con quale conto stava girando.

**La via di ritorno è una sola: si reinstalla il pacchetto della versione che
si vuole.** È il solo gesto che riporta indietro anche il servizio.
`torna-indietro.ps1` c'è ancora e funziona, ma **riporta indietro solo metà
versione**: scambia due cartelle di applicativo e lascia il servizio dov'è — i
due numeri di `/api/app-info` non coincidono più, che è il segno che di solito
vuol dire «installazione non riuscita». Lo script lo scrive a chi lo esegue.

**Il database non si tocca mai**: la 1.2 rilegge il database della 1.4, e lo
dimostrano le 8 prove di `collaudo-migrazione-1.4.js`.

### Togliere Pathfinder da una macchina — dal 01/09

```powershell
.\installa.ps1 -Disinstalla -Prova              # dice cosa toglierebbe
.\installa.ps1 -Disinstalla                     # lo toglie
.\installa.ps1 -Disinstalla -AncheIlDatabase    # e toglie anche il database
```

Toglie le due **attività pianificate**, la **regola del firewall**, le
**variabili di macchina** `PATHFINDER_*` e la **radice** con tutto quello che
ci sta sotto. **PostgreSQL e Node restano**: non erano nostri.

**Prima di togliere qualunque cosa, salva.** Chiede al servizio ancora acceso
una copia fresca del database, poi porta tutta la cartella `backup\` **fuori
dalla radice**, sul Desktop in `Pathfinder-disinstallato-<data-ora>\`. **Se il
salvataggio non riesce, si ferma**: senza una copia non si cancella un
magazzino — il 31/08 quarantacinque movimenti GMP si sono salvati perché
qualcuno si è ricordato di copiarli a mano.

**Il database non cade da solo**, e nemmeno con una spunta: vuole
`-AncheIlDatabase`, e la conferma da digitare diventa **il nome del database**.
La rimozione la fa `prepara-postgres.ps1 -Rimuovi`, cioè lo script che quel
database lo crea — e cade **prima** della radice, perché una cartella tolta con
un database vivo si rifà in dieci minuti e il contrario no.

**Se la radice è murata la riapre** (`takeown` + `icacls /reset`): è il caso
normale, non l'eccezione, perché i permessi se li è stretti da sola —
voce 75.

> **NON C'È UN DOPPIO CLIC PER DISINSTALLARE, e non è una dimenticanza.**
> `Installa Pathfinder.bat` lancia l'installer senza argomenti: per togliere
> bisogna aprire PowerShell e scriverlo. La conferma poi **si scrive** —
> `DISINSTALLA`, o il nome del database — perché una spunta si preme per
> sbaglio e una parola no.

---

## 7. Le trappole già pagate

Ognuna è costata almeno una volta. Non sono opinioni.

### Il numero di versione

- **STA IN QUATTRO POSTI, E `package.json` NON BASTA.**
  1. `VERSIONE` in `vite.config.js` — nome della cartella di consegna e numero in pagina;
  2. `VERSION` in `server/pathfinder-server.js` — `service_version`;
  3. `VERSIONE_APP` in `src/core/pacchetto.ts` — il timbro dentro ogni export e
     nel **piede di ogni documento stampato**;
  4. `package.json`, che porta tre cifre (`2.12.0`) e che **la build non legge**.

  Ha fatto danni due volte: la prima build della 2.1 uscì chiamandosi
  «Pathfinder 2.0» coi byte della 2.1; e l'installazione della 2.12 **fallì**
  perché il servizio diceva ancora 2.11. Il controllo ha funzionato, ma il
  messaggio parla di **riavvii**, che è la causa più comune e non l'unica.
  Ogni documento stampato ha detto «Pathfinder 2.9» per tre versioni perché il
  terzo era rimasto indietro. **Adesso lo dice `npm test`**:
  `test/versioni.test.js` legge tutti e quattro. Non si fanno discendere da una
  sorgente unica apposta: sarebbe il servizio che importa la configurazione
  della build.
- **E il pacchetto va RICOSTRUITO dopo aver toccato quel numero.** L'impronta
  dell'applicativo non cambia (copre `index.html` e `assets/`), ma il pacchetto
  sul disco continua a portare il servizio vecchio.
- **Il numero della build non è il numero del codice**: finché i file dicono
  `1.7`, ogni build fatta mentre si costruisce la versione dopo produce una
  `Pathfinder 1.7\` con byte diversi da quella in servizio. **Il numero si alza
  prima di costruire, mai dopo.**
- **Una costruzione «per vedere se compila» sostituisce un pacchetto pronto.**
  Il 19/08 una build di verifica ha riscritto `Pathfinder 1.8.4\` con dentro
  anche 1.9, 1.10, 1.11 e 1.12. **Prima di costruire si copia il pacchetto che
  aspetta un'installazione**, e a ripristino avvenuto **si chiede al servizio**,
  non alla cartella.

### `consegna\`, OneDrive e la build

- **La build ASPETTA, dalla 2.12.** `consegna\` sta dentro OneDrive: la build ci
  scrive 1,8 MB, la sincronizzazione parte subito, e la build dopo la trova
  occupata mentre Vite prova a svuotarla — segnaposto OneDrive, reparse tag
  `0x9000e01a`, a volte in sola lettura. **Il blocco è transitorio** (misurato
  due volte il 27/08: la stessa cancellazione riesce da sola qualche secondo
  dopo). Quindi `emptyOutDir` è spento e svuota `svuotaLaConsegna()` in
  `vite.config.js`, che riprova per **30 secondi** togliendo la sola lettura.
  Se non passa, è qualcuno che tiene la cartella — quasi sempre la finestra
  dell'installer rimasta su «Premere un tasto per chiudere» — e il messaggio lo
  dice. **`consegna\` non si sposta fuori da OneDrive**: quel percorso è scritto
  in §6, nel LEGGIMI del pacchetto e nella testa di chi installa.
- **Un installer aperto blocca `npm run build`**, e il segno che lo distingue da
  tutto il resto è che **i file dentro si cancellano e la cartella no**. È un
  handle sulla directory. `Get-CimInstance Win32_Process | Where CommandLine
  -like '*consegna*'` dice in due secondi chi la tiene. **Non è l'attributo
  `ReparsePoint`**: OneDrive lo mette su *ogni* voce sincronizzata.
- **La produzione non legge mai da `outDir`.** Il 14/08 la variabile puntava
  dentro la cartella che la build azzera — e lì dentro c'era anche il servizio
  col suo `node_modules`.
- **Mai `express.static` sulla cartella-versione intera**: escono solo
  `index.html` e `assets\`, e la rotta accetta **un nome, non un percorso**.
- **`index.html` resta `no-cache`, gli assets `immutable`.** Invertirli è il
  difetto peggiore possibile: i terminali resterebbero su una versione vecchia
  senza modo di uscirne.

### Il servizio e la macchina

- **UN FIX SCRITTO NEL PACCHETTO MUORE ALLA BUILD SUCCESSIVA.** La correzione
  della 2.12.1 — quella che tiene su il magazzino all'accensione — era scritta
  in `consegna\Pathfinder 2.12.1\servizio\` e in `C:\Pathfinder\servizio\`,
  e **non** in `server\`. La build copia `server\` dentro il pacchetto e mai
  il contrario: la 2.13 costruita senza accorgersene avrebbe rispedito in
  magazzino il difetto del 28/08, **coi collaudi tutti verdi e l'impronta in
  regola** — l'impronta copre `app\`, non `servizio\`. Trovata il 31/08
  confrontando i due alberi file per file, ed è il confronto da rifare ogni
  volta che si è toccata una macchina in emergenza. **Quel che si corregge di
  corsa si riporta nel sorgente prima di costruire.**
- **L'AVVIO ALL'ACCENSIONE HA DUE DIFESE, E LA SECONDA NON È QUELLA CHE
  SEMBRA.** Dalla 2.12.1 il servizio **aspetta** il database fino a novanta
  secondi (`PATHFINDER_PG_ATTESA_AVVIO`, a `0` la spegne) invece di decidere
  in duecento millisecondi, e l'attività pianificata parte un minuto dopo
  l'accensione (`$trigger.Delay = 'PT1M'`). «Riavvia in caso di errore»
  dell'Utilità di pianificazione **ripesca le attività che non riescono a
  partire, non quelle il cui processo esce con un codice diverso da zero**:
  resta perché copre il caso che copre — un processo ucciso, una macchina in
  affanno — ma non è lei a garantire l'accensione. **La regola non si
  rovescia**: senza database il servizio continua a non partire, smette solo
  di deciderlo in fretta.
- **L'attività pianificata registra il percorso DA CUI VIENE LANCIATA.** Il
  10/08 `installa-servizio.ps1` fu lanciato dalla cartella di lavoro, e per
  quindici giorni **il magazzino ha eseguito il file del repository**: chi
  lavorava al progetto scriveva in produzione senza saperlo, e **nessuna
  installazione poteva riuscire** perché il controllo finale leggeva il file
  sbagliato. Corretto il 25/08. **Chi lancia `installa-servizio.ps1` lo lancia
  dal sorgente o da `C:\Pathfinder\servizio`, mai da una cartella di consegna.**
- **Il servizio gira come SYSTEM e NON ATTRAVERSA UNA GIUNZIONE.** `stat` su
  `C:\Pathfinder\app\corrente` muore con `UNKNOWN: unknown error`, la pagina va
  in 500. Non sono i permessi, non è il tag di reparse: lo stesso percorso, con
  lo stesso codice, si apre da una sessione utente. Per questo `corrente` e
  `precedente` sono **cartelle vere di cui si sostituisce il contenuto**.
- **Un servizio che non sa dire di cosa muore costa ore** — tre, il 17/08. Ora
  `/api/app-info`, **solo quando qualcosa non va**, porta `errore` col codice
  vero e `utente` col conto del processo: **chi tocca il servizio non tolga quei
  due campi**.
- **`Get-ScheduledTask` senza diritti non dice «accesso negato»: non
  restituisce niente.** Su questa macchina ha risposto vuoto — 219 attività
  viste, nessuna di Pathfinder — e sembrava che il magazzino non sarebbe tornato
  su da solo al riavvio. Era falso. **Una lettura andata a vuoto somiglia in
  tutto a un'assenza, e le due conclusioni sono opposte.** Da non elevati si usa
  `schtasks /query /tn <nome>`, che almeno l'accesso negato lo dice; la
  controprova che non mente è che il processo sulla 4173 è **figlio di
  `svchost.exe`**.
- **`node_modules` che esiste non vuol dire che sia quello giusto.** Si guarda
  dipendenza per dipendenza come le dichiara `package.json`.
- **Un controllo che grida al lupo su un'installazione riuscita è come non
  averlo.** La verifica finale confrontava il database aperto col percorso del
  file SQLite: su PostgreSQL un'installazione perfetta usciva con «il servizio ha
  aperto un altro database» e codice 1.
- **Un segnaposto in una riga di comando viene incollato com'è** (`LA-TUA`
  finito dentro la variabile di macchina). Meglio farselo comporre, o passarlo
  da un file. Non ha fatto danni perché **il servizio si rifiuta di partire
  senza database**.
- **Percorsi Windows oltre 260 caratteri**: `npm install` è il primo a
  romperlo. **`better-sqlite3`** va tenuto a una versione con binario già
  compilato per il Node installato. **Una collezione nuova non esiste finché il
  servizio non riparte** (`server/lib/schema.js` si legge all'avvio).
- **Prima di cancellare o spostare un file dalla radice, chiedere al servizio
  quale sta servendo.** Il 13/08 `pathfinder-1.4.3.1.html` fu rimosso credendolo
  non servito: lo era. Persa **l'unica copia** di quella versione.
- **Mai `Remove-Item -Recurse` su una giunzione**: PowerShell 5.1 può seguire il
  collegamento e svuotare **la destinazione**. Si usa
  `[System.IO.Directory]::Delete($p, $false)` o `cmd /c rmdir`. La funzione
  giusta sta in `installa-versione.ps1`.

### PowerShell, codifiche, fine riga

- **`powershell -File script.ps1 -ParametroCheNonEsiste` NON dà errore**: lo
  scarta in silenzio e manda avanti lo script. Chi credeva di simulare **ha
  installato**. Quel che PowerShell scarta finisce in **`$args`**: un `.ps1` che
  fa qualcosa di irreversibile guardi `$args` prima di muoversi.
- **`Start-Process -ArgumentList` non mette le virgolette, e psql non protesta.**
  `@('-c', 'SELECT count(*) FROM x')` incolla l'elenco con degli spazi, e psql
  **esce con 0** senza niente in mano: `[int]''` fa **0**, e uno zero lì dentro
  voleva dire «database vuoto, ci si può migrare sopra» su un magazzino con
  11.197 articoli. Due correzioni: le virgolette a mano, e **una risposta vuota
  non è uno zero** (`-match '^\d+$'`). La query viaggia in un file con `-f`, non
  in riga di comando.
- **Le barre rovesciate non sopravvivono a due livelli di virgolette.**
  `'C:\Pathfinder\data\pathfinder.db'` dentro un `node -e "…"` da shell POSIX
  arriva come `C:Pathfinderdatapathfinder.db`, e `better-sqlite3` **crea** quel
  file: un database vuoto che risponde `0 righe` con la faccia seria. Nei
  percorsi Windows dati a Node **si usano le barre in avanti**.
- **`open(percorso, 'w')` tronca prima di scrivere**: una `UnicodeEncodeError` su
  un emoji ha azzerato `giacenze.ts`, 37 KB, prima di scrivere la prima riga.
  Uno script che riscrive un sorgente **compone tutto in memoria e apre in
  scrittura per ultimo**.
- **Uno script `.ps1` con caratteri non ASCII vuole il BOM**; **un manifesto si
  legge togliendo il BOM** (`Out-File -Encoding utf8` lo scrive e `JSON.parse` ci
  lancia sopra: costava versione e impronta nulle dopo un ritorno indietro).
- **PowerShell distrugge gli accenti**: `Get-Content -Raw` in 5.1 decodifica in
  CP1252 quando il file non ha il BOM. Per riscrivere in blocco si passa da
  **Node, UTF-8 senza BOM**.
- **CHI MODIFICA UN FILE DA UNO SCRIPT LO RILEGGE IN BINARIO.**
  `.gitattributes` dice `* -text`: Git non deve toccare i fine riga. Uno script
  che rilegge in modalità testo e riscrive con `newline=''` **converte CRLF in
  LF senza dirlo**, e il diff passa da 4.248 righe a **13.016**.
  **RIPAGATA UNA SECONDA VOLTA IL 03/09 SERA, con la 2.21 e con la riga qui
  sotto già scritta due volte.** Sedici file riscritti da script sono passati a
  LF, e il commit diceva **18.544 righe cambiate** invece di 2.545. Rimessi a
  CRLF con lo stesso passaggio in binario, confrontando ogni file con la sua
  versione in `HEAD~1`: se **là** era CRLF, si riconverte. Dopo, il diff grezzo
  e quello `--ignore-cr-at-eol` dicono **lo stesso numero**, ed è il controllo
  che chiude il gesto — si fa **prima** di committare, non dopo.
  **RIPAGATA IL 03/09**, con questa riga già scritta: venti file del prodotto
  finito sono stati riscritti così, e i nove commit portano dentro interi file
  «modificati» che avevano cambiato una riga sola. Rimessi a CRLF con un
  passaggio in binario, e **l'impronta del pacchetto non è cambiata** — il
  bundle i fine riga del sorgente non li vede. Resta un file solo diverso da
  com'era: `spedizioni.ts` aveva **4 righe CRLF su 1.200**, e adesso è LF per
  intero. Una prova che guardi i fine riga non c'è, e sarebbe la cosa che
  chiude davvero questa voce. **I fine riga
  non sono uniformi**: `quarantena.ts` è LF, `spedizioni.ts` è misto, quasi
  tutto il resto è CRLF — uno script che cerca un blocco convertendo a CRLF non
  lo trova nei file LF, e «zero occorrenze» somiglia a «quel codice non c'è
  più». **È successo di nuovo il 28/08, e il verso era l'opposto di quel che
  il documento supponeva**: le blob di sei file erano **LF**, e qualcosa le
  aveva riscritte tutte in **CRLF**, gonfiando il diff da 995 righe vere a
  5.108. Raddrizzato il 31/08 togliendo i CR da quei sei e basta. **Il verso
  non si indovina: si misura**, confrontando `git diff` con
  `git diff --ignore-cr-at-eol` file per file. Vale anche per questo
  documento, che è **LF** e va tenuto tale.
- **Caricare file dall'interfaccia web di GitHub scrive un albero che non
  esiste.** Il 19/08 il remoto dichiarava build 1.8.4 **senza
  `src/modules/documenti.ts`**, che della 1.8.4 è il pezzo centrale. **Un
  caricamento dal browser non è un commit: è un commit su una base che non si è
  scelta.** Il codice si spinge con `git push`, e se il push viene rifiutato si
  guarda cosa c'è dall'altra parte prima di insistere.

### `hidden` e il `display` dichiarato — 2.21

L'attributo `hidden` del browser vale `display: none` con la specificità di un
**selettore di tipo**: qualunque classe che dichiari un `display` gli passa
sopra. `.form-group { display: flex }` lo faceva, e ogni blocco nato `hidden`
dentro un `form-group` restava a video — col codice che lo accendeva e lo
spegneva a funzionare **per finta**.

Si vedeva nella dichiarazione dei colli: il blocco compariva su ogni articolo,
anche su quelli senza unità di misura, dove non c'è niente da dividere. **Era
rotto dal 1.8**, non dal prodotto finito: `mInColliBox` ha la stessa forma. In
`01-layout.css` c'era già `.search-pop[hidden] { display: none }`, cioè la
stessa toppa messa per un selettore solo.

Adesso **`[hidden] { display: none !important }`** sta in `01-base.css`.
L'`!important` non è pigrizia: `hidden` non è uno stile, è un fatto sul nodo,
e nessuna classe deve poterlo smentire.

### Un'icona è markup, e quattro posti la trattano come testo

- **QUATTRO STRADE, TROVATE UNA ALLA VOLTA — 2.27, 2.29, 2.29.2.** `ico()`
  restituisce una stringa di markup, ed è la forma giusta dentro un letterale
  di modello. In quattro posti quella stringa finisce dove ci si aspetta
  TESTO, e a video compare `<svg class="ico"…` scritto per esteso:

  | dove | perché | trovata |
  |---|---|---|
  | `toast`, `Dialog` (`message:`, `title:`, `kv`) | scrivono con `textContent`, ed è giusto: di lì passa testo che arriva dai campi | 2.27, poi altre quattro nella 2.29 |
  | dentro un `<option>` | il parser HTML in «in select» butta via i tag che non sono di una tendina: l'`<svg>` sparisce e resta un doppio spazio | 2.29 |
  | una stringa che poi passa da `_esc()` | `_esc` scappa il markup, ed è giusto: quella stringa porta dati del database | **2.29.2**, su ogni Cartello NC dell'archivio |
  | un figlio passato a `_h()` | `_h` aggiunge una stringa con `createTextNode`, ed è giusto: è il costruttore sicuro | **2.29.2**, su tutte e 11.181 le righe dell'anagrafica |

  **In tutti e quattro i casi il sink ha ragione.** `textContent`, il parser
  delle tendine, `_esc` e `createTextNode` fanno esattamente il loro mestiere,
  e sono le quattro cose che impediscono a un codice articolo di portare
  markup dentro una schermata di magazzino. Il difetto sta sempre a monte:
  aver passato markup a chi tratta le stringhe come testo. **Il rimedio non è
  mai togliere la protezione** — è togliere l'icona, o darla nella forma che
  quel posto sa trattare. Dalla 2.29.2 quella forma esiste: `icoNodo` in
  `ui/icone.ts` costruisce l'icona come NODO, e un nodo `_h` lo aggiunge come
  nodo.

  **E LE PROVE VANNO SCRITTE UNA PER SINK, non una per «icona».** Le due della
  2.29 guardavano i primi due posti e non vedevano gli altri due: non erano
  scritte male, guardavano altrove. Le quattro stanno in `test/icone.test.js`,
  ognuna col suo perché, e ognuna è stata verificata rimettendo il difetto.

  **NESSUNA DELLE QUATTRO È USCITA DAL RILEGGERE IL CODICE.** La prima e la
  seconda dal provare a rompere la 2.29; la terza e la quarta le ha viste
  Andrea guardando lo schermo. Una rete che legge i sorgenti prende quel che
  qualcuno le ha insegnato a cercare — e la quarta stava su undicimila righe
  da chissà quando.

### Prove e collaudi

- **UNA PROVA CHE PASSA PUÒ NON AVER PROVATO NIENTE, E UNA CHE FALLISCE PUÒ
  MENTIRE — 2.29.1.** Le due `PATHFINDER_TLS_*` stanno a livello MACCHINA e sono
  arrivate con la **2.26**, dentro file scritti quando non esistevano. I banchi
  le ereditavano: partivano in HTTPS mentre le loro prove parlavano in chiaro
  sulla stessa porta. La 2.26 risponde `301` a chi bussa in chiaro, e **`fetch`
  segue il redirect degradando la POST a GET**: ogni scrittura diventava una
  lettura. Nessun errore di rete, nessuna eccezione — **una risposta, a
  un'altra domanda**. Passavano le prove in lettura e fallivano le altre
  accusando il servizio di cose false: «chiave duplicata respinta con 409, non
  500 — stato 200», tre «VICOLO CIECO» e un «LA PORTA È RESTATA APERTA».
  Chi le avesse credute avrebbe cercato una falla che non c'è.
  **Tre cose da portare via:**
  1. **Un banco rosso non è rumore: è una fila di accuse.** Prima di inseguire
     la più grave si guarda se ne stanno sbagliando troppe insieme — 28 su 156
     e 36 su 40 sono un difetto di trasporto, non trentasei difetti.
  2. **Il rosso copre.** Sotto quelle 36 stava nascosta una prova ferma alla
     **2.13**, rossa dalla 2.18, che nessuno poteva vedere.
  3. **Una variabile nuova entra in file vecchi senza bussare.** Chi aggiunge
     una `PATHFINDER_*` alla macchina guarda anche chi la eredita.
  La correzione è in `lib/tls.js` (`scollegaTls`), in `banco\servizio-banco.mjs`
  e in `test/bancoNonEredita.test.js`, che i file li **cerca** invece di
  elencarli.

- **DUE ELENCHI DELLA STESSA COSA DIVERGONO — 2.29.1.** I tasti funzione erano
  scritti due volte: uno in `ui/app.ts` per ascoltare la tastiera, uno accanto a
  ogni scheda del cruscotto per stamparne il nome. Risultato: **due schede
  dicevano F3** e F3 non faceva né l'una né l'altra, mentre F4, F6, F7 e F8
  esistevano senza che nessuna scheda lo dicesse. Non è che i due elenchi
  *potessero* divergere: l'avevano già fatto, in silenzio, perché niente li
  confrontava. Adesso c'è `TASTI_FUNZIONE` in `modules/cruscotto.ts` e la scheda
  gli **chiede** il suo tasto. È lo stesso difetto della **voce 95** e delle
  quattro dichiarazioni del numero di versione: dove la stessa verità è scritta
  in due posti, o si fondono o si mette una prova che li confronta.

- **UN BANCO ACCESO FA MORIRE IL BANCO DOPO.** `node test/collaudo.js` apre la
  **4199**, che è la porta del banco: con un banco acceso muore su `EADDRINUSE`
  — e non con un messaggio, con un `throw` non gestito. È successo l'08/09 con
  un banco rimasto acceso dalla sessione della notte prima. Prima di lanciare i
  collaudi del servizio si guarda chi tiene la porta:
  `Get-NetTCPConnection -LocalPort 4199 -State Listen`.

- **UN BANCO CHE SVUOTA TAVOLI NON DEVE POTER PUNTARE A UN DATABASE DI LAVORO.**
  `test/driver.test.js` e il banco PostgreSQL fanno `TRUNCATE` a ogni corsa: una
  corsa di `npm test` ha portato via gli **11.197 articoli appena migrati**, e
  **nessuna prova era fallita**, perché il danno lo faceva il collaudo facendo
  quel che doveva. Adesso si usa **`PATHFINDER_PG_COLLAUDO`** e **non si ripiega**
  su `PATHFINDER_PG` quando manca: si salta dicendo perché. Seconda guardia sul
  nome: il database deve finire per `_collaudo`.
- **E il servizio di banco eredita `PATHFINDER_PG` dalla macchina.** Quella
  guardia copre i collaudi, non il banco: si accende **passando la variabile
  vuota nella stessa riga** — §5.
- **`npm run dev` NON è al riparo**: la pagina servita da Vite parla col servizio
  vero sulla 4173, perché l'adapter remoto non guarda da quale porta arrivi.
- **Non installare senza aver aperto la versione in un browser**, contro una
  copia del database vero. `tsc` dice se il codice è coerente, i collaudi dicono
  se le parti fanno quel che promettono, **e nessuno dei due dice se
  l'applicativo funziona**: i difetti peggiori di ogni versione li ha trovati il
  banco, con tutto verde.
- **UN BANCO CHE GIRA CON UN ALTRO CONTO NON PROVA UN RILASCIO.** Lo scambio di
  versione era stato provato quattro volte, tutto verde — ma il banco lo avvia
  una persona e gira nella sua sessione, e il difetto esisteva **solo** per il
  conto con cui gira il servizio. Costò tre ore di applicativo giù. **Ciò che un
  banco non riproduce va scritto accanto ai suoi risultati.**
- **Un controllo che passa subito potrebbe non controllare niente**: un collaudo
  si prova **rompendo il codice** e vedendolo fallire. I valori di prova si
  scelgono dove il difetto vive: «5,5 − 0,1 − 0,2» passa anche senza
  arrotondamento, `0,3 − 0,1` no. **I collaudi si scrivono prima.**
- **Un valore atteso scritto a memoria non è una prova.** La prima prova sulla
  cifra di controllo GS1 diceva `1` perché quel numero non era stato calcolato:
  aveva ragione l'implementazione. O si rifà il conto a mano **e lo si scrive nel
  commento**, o si prova una **proprietà** (per l'SSCC: che la somma pesata
  chiuda a multiplo di dieci).
- **Un pannello che ridimensiona non manda `resize` alla pagina**, e **non
  compone i fotogrammi**: ogni proprietà in transizione resta al valore di
  partenza e sembrano difetti che non esistono. Si spengono le transizioni prima
  di misurare:
  ```js
  document.head.insertAdjacentHTML('beforeend',
    '<style>*,*::before,*::after{transition:none!important;animation:none!important}</style>');
  ```
- **UN CLIC A COORDINATE SU UN'INTERFACCIA CHE SI RIDISEGNA FINISCE DOVE NON
  DEVE.** Due volte nella stessa mezz'ora il 26/08: una casella della matrice
  accesa per sbaglio e salvata a database, e l'operatore `admin` della voce 60.
  Su questo applicativo si verifica **leggendo lo stato** — `read_page`, o le
  funzioni pure chiamate da consolle — non premendo bottoni a occhio: **ogni
  bottone qui dentro scrive nel magazzino di qualcuno.**
- **Un audit si passa anche dopo, non solo prima.** Lo script che maiuscola i
  codici firmava le fusioni `SISTEMA`, che non era in anagrafica: avrebbe
  riaperto la voce 18. L'ha trovato l'audit stesso, girato sul risultato.

### Codice

- **Un flag d'istanza non dice «sono dentro una transazione».** Con
  un'interfaccia asincrona una seconda richiesta HTTP lo trova alzato e il suo
  corpo gira **dentro la transazione di un altro terminale**. Su SQLite non si
  vede mai (gli `await` si risolvono in microtask): si è visto **alla prima corsa
  su PostgreSQL**. La cosa giusta è **`AsyncLocalStorage`**, che segue la catena
  asincrona invece dello stato dell'oggetto.
- **Un `ON CONFLICT` senza la chiave nella INSERT non scatta mai**: `put` deve
  scrivere `_id` fra le colonne. Il sintomo non è un errore: è **una riga nuova a
  ogni salvataggio**.
- **Due database non nominano allo stesso modo lo stesso rifiuto**
  (`SQLITE_CONSTRAINT_UNIQUE` contro SQLSTATE `23505`), e non decodificano allo
  stesso modo i tipi (`pg` dà `int8` come **stringa**).
- **`rejectUnauthorized: false` non è «accetta il certificato di Azure»: è
  «accetta chiunque».** Una CA aziendale si indica con un **file**
  (`PATHFINDER_PG_CA`), non spegnendo il controllo.
- **`toISOString()` non è il giorno di chi lavora**: il backup nominava i file in
  UTC e alle 01:52 scriveva sopra il serale delle 20:00.
- **UN INDICE «composite» NON È «compositeUnique».** `inventory` indicizza
  `[location_code+item_key]` per **cercare**, non per vietare: due righe con la
  stessa chiave nello stesso vano il database le accetta, e il client — che cerca
  con `find` — ne legge **una**. È un saldo che cambia da solo. **Chi scrive una
  rotta che sposta righe controlla lui che la chiave non collida.**
- **UN CAST NON CONVERTE NIENTE: DICE AL COMPILATORE DI NON GUARDARE.** I due
  difetti che la migrazione a TypeScript aveva lasciato aperti erano tutti e due
  dietro un cast. Dove viene voglia di scrivere `as`, la domanda giusta è che
  cosa si sta nascondendo.
- **Un `PATCH` su una chiave che non esiste CREA il record.** E la chiave non è
  quella che si ha in mente: `operators` è a `op_id`, `tasks` a `task_id` —
  `types/collezioni.ts` è la sorgente unica. **Non fidarsi di un `op_id` scritto
  in un documento: si rilegge la collezione.**
- **`meta` non è un sacco**: `_loadCache` la ricostruisce campo per campo. **E
  nemmeno la riga di un documento**: `savePendingOutbound` e `updatePendingDoc`
  la ricostruivano ognuna per conto suo e i colli scelti sparivano al
  salvataggio, senza errore, perché `RigaDocumento` ha un indice libero. **Dove
  un record si ricostruisce campo per campo, quel posto dev'essere uno solo** —
  `modules/documenti.ts`.
- **UNA COLLEZIONE CHE SI LEGGE MA NON SI ASSEGNA È UNA COLLEZIONE VUOTA, E NON
  LO DICE.** `recipients` stava nei due adapter dal 1.6 e `_loadCache` non la
  assegnava mai: il difetto **si nascondeva da solo**, perché alla prima
  scrittura `_applyToCache` popolava l'elenco. Quando si aggiunge una collezione
  si guardano **tre** punti: il `loadAll` dell'adapter, la destructuring di
  `_loadCache`, **e l'assegnazione**.
- **`undefined` e `null` non sono la stessa assenza, quando l'assenza è una
  decisione.** Su `location_attrs` `undefined` vuol dire «come dice la zona» e
  `null` «qui no»: un `??` le schiaccerebbe insieme. Vale ogni volta che si
  scrive uno scavalco sopra un valore di serie. **Mai configurato e configurato
  vuoto sono due cose diverse**: un `?? []` scritto per prudenza avrebbe spento
  in silenzio i tre vincoli di serie della matrice.
- **UN VINCOLO LETTO DA UN CAMPO CHE NON ESISTE NON MORDE MAI, E NON DÀ ERRORE.**
  Il motore leggeva la capienza da `zona.capienza`, che non è mai esistita: un
  indice generico `[config: string]: unknown` la rendeva legittima al
  compilatore. **Un attributo che si configura e si vede in maschera va poi
  controllato dove il motore lo legge**: alla pericolosità era successo lo stesso
  dal 1.6.
- **UNA REGOLA GENERALE CHE SOPRAVVIVE ACCANTO A UNA PRECISA LE ANNACQUA TUTTE E
  DUE**: `proponi` accetta un vano se **una** regola che impone è soddisfatta.
  `regolePerArticolo` tiene **un solo livello**, il più preciso che ha colpito.
- **IL CONTROLLO CHE VIETA VA DOVE PASSA TUTTO, NON DOVE SI VEDE**: in
  `addItem`, non nelle otto maschere che divergerebbero alla prima maschera
  nuova. **E un vincolo che esclude deve lasciare una porta da cui uscire**: «non
  si può» senza «allora dove» è una porta chiusa.
- **IL PRIMO POSIZIONAMENTO DI UN LOTTO NON HA CASA**, quindi ogni controllo
  d'unicità deve saper dire «nessuna»: `verdettoCasa` restituisce `primo` e non
  un errore. **Un'area di transito non è una casa**, e sono tre punti con una
  ragione sola — `caseDelLotto`, `entraInWip` con `regolaBase: false`, e la mappa
  che non la segnala fra i lotti sparsi: **quando se ne tocca uno si guardano gli
  altri due.**
- **UN CAMPO LIBERO PER IL MOTIVO SI COMPILA CON «OK».** Tre bottoni si premono,
  e sono **tre e non dieci**: un elenco lungo torna a essere una scelta da
  leggere.
- **Due elementi con lo stesso `id` non danno errore**: `getElementById`
  restituisce il primo, e `showModal` appende sempre `id="modalOverlay"` —
  una finestra aperta sopra un'altra **chiude quella sotto**.
- **Una riga che nasce `hidden` si accende togliendo la CLASSE, non lo stile.**
  `display: ''` toglie lo stile in riga e lascia comandare il foglio: la riga non
  compare mai, e un campo obbligatorio dentro una riga invisibile **blocca la
  conferma indicando qualcosa che non c'è**.
- **Un campo nascosto è comunque un campo scritto**: nascondere è una cosa a
  video, il payload è storia. Un campo che non serve **si nasconde e si svuota**.
- **Un campo che la maschera mostra non è un campo che si salva**:
  `ARTICLE_ATTR_FIELDS` è una **lista bianca**, e ciò che non è nominato lì viene
  scartato senza errore — le certificazioni ci sono rimaste fuori per quattro
  versioni.
- **Gli import di un modulo TypeScript si scrivono senza estensione**: due
  specificatori diversi sono due moduli, e in pagina c'erano **due Store**.
- **Non togliere `window.App = App`** in coda a `main.js`: 366 punti chiamano
  `App` per nome e smetterebbero di funzionare **in silenzio**. `$` sta su
  `window` per la stessa ragione: un gestore inline gira nello scope globale.
- **`Dialog.confirm` non accetta HTML**: vuole `message` (testo) e `details`
  (nodo DOM). Le classi `table`/`table-sm` non esistono: è `sx-table` dentro un
  `div` con `overflow-x:auto`.
- **`CREATE TABLE IF NOT EXISTS` non aggiunge una colonna**, e il `CREATE INDEX`
  dopo muore nel costruttore: il servizio non parte affatto. Fra
  `createTableSQL` e `createIndexSQL` sta `PathfinderDB._migra`: **sono due
  funzioni per questo, non rimetterle insieme.**
- **`addArticle` esce con `false` su un codice noto** — c'è `upsertArticles`.
  **`Articolo.unit` è già la UM e `pieces_per_pack` è già la quantità per
  collo**: prima di aggiungere un campo a un'anagrafica di trent'anni, guardare
  come si chiamano le etichette che ci sono.
- **Una regola di chiusura sola non basta a sette tipi diversi.** Il residuo a
  zero descrive due tipi su sette. La domanda che nessun collaudo aveva fatto:
  *«questo tipo può mai arrivare a zero?»*
- **UNA REGOLA DI MAGAZZINO NON SI DEDUCE DAL CODICE.** Il sito «di casa» di un
  ODP era stato dedotto dall'ordine di visita, che è una preferenza di
  interfaccia; la regola vera — «si parte dal magazzino con più prelievi» —
  l'ha detta Andrea in una riga, e ha cambiato l'avviso da «10 tappe su 10» a «3
  su 10». **Prima di indovinare una regola di mestiere, si chiede.**
- **QUANDO DUE COSE SI SOMIGLIANO, LA SCELTA LA DICHIARA CHI SCRIVE.** La
  maschera delle regole deduceva «prefisso o codice esatto» dall'esistenza in
  anagrafica: «6000366» è un codice vero **e** il prefisso di «6000366B». La
  regola sembrava scritta e non si applicava a niente — il modo peggiore di
  sbagliare, perché non dà errore.
- **UN PARSER CHE LEGGE «IL PRIMO NUMERO DELLA RIGA» È UNA SCOMMESSA SUL TIPO
  DELLA CELLA.** Finché Sage esportava i lotti come testo funzionava; il primo
  lotto tutto cifre è diventato la quantità — **260.594 KG al posto di 0,315**,
  su un ordine da 380 kg. Il percorso si costruiva lo stesso: la tappa c'era, ed
  era il numero a essere assurdo. **Dove una colonna ha un significato noto, si
  salta per posizione.**
- **UN SALDO GIUSTO CON LA PAROLA SBAGLIATA È UNA BUGIA.** La chiusura del conto
  contava il consumo come «tornato»: il numero tornava e la parola era falsa, e
  quella parola la legge chi cerca il consumo di un ordine fra sei mesi. **Dove
  due cose escono dallo stesso conto per ragioni diverse, servono due nomi**:
  `out` e `consumo`.
- **UN'AREA NON È UN'UBICAZIONE.** Il conto di produzione doveva tenere un vano
  per ordine, e il controllo verificava che QUALCHE ubicazione cominciasse per
  «WIP»: passava, e la merce sarebbe finita in un vano che nessuno aveva
  disegnato. **L'area WIP è un'ubicazione mappata, e a tenere distinti i conti
  sono le righe.**
- **Uno spostamento è `removeItem` + `addItem`, e il secondo inventa le UM**: le
  deriva da colli **pieni**, e spostare 11 colli da 10.100 pz ne riscriveva
  11.000. Si passa da `App._umMossa`.
- **Chi sposta una riga di giacenza scrive un OGGETTO NUOVO**: `indicizzaGiacenza`
  confronta `prev` con `next`, e modificando l'oggetto che la cache già tiene i
  due diventano lo stesso — a video la merce stava in due vani insieme.
- **UNA QUANTITÀ NON DICE DA QUALE COLLO ESCE.** La 1.8 mandava solo «10 kg»: su
  una riga che ha anche un collo da 10, il collo aperto da 25 restava intero e
  spariva quello da 10. Saldo giusto, **colli sbagliati**. Ogni uscita porta la
  **misura del collo** (`{da, quantita}`), e una misura che non c'è più è un 409
  — non un ripiego su un altro collo. Trovato al banco **con tutte le prove
  verdi**: nessuna chiedeva da dove uscisse la merce.
- **Un campo che diventa muto è peggio di un campo bloccato**: il campo ④ Colli
  ignorava in silenzio quel che l'operatore digitava.
- **Articolo e lotto non si maiuscolano nella maschera di ricerca: sono una
  chiave.** `item_key` è `ARTICOLO#LOTTO`, e un lotto `qwert` diventato `QWERT`
  puntava a una riga che non esiste — la maschera si apriva vuota, senza errore.
  (La **normalizzazione in scrittura** è un'altra cosa, e la fa il servizio: §8.)
- **`MOV.MOVE` scrive `qty_delta: 0` su uno spostamento totale**, e non è un
  difetto: cambia l'ubicazione, non la quantità. È la ragione per cui
  l'avanzamento di un'attività non passa dal registro. (Che il registro non dica
  «quanto» negli altri casi **è** un difetto: voce 33.)

---

## 8. Le regole che non si discutono

### Architettura

- **Niente lavoro offline.** Se il servizio non risponde l'applicativo si ferma
  e lo dice a schermo intero. Niente code da risincronizzare.
- **Un solo database condiviso, più terminali, e l'arbitro è il server**: la
  concorrenza si risolve con **una transazione dentro `/api/op/…`**, non con la
  disciplina di chi scrive. **Dalla 2.6 le transazioni si fanno una per volta**:
  l'interfaccia è asincrona, e un `await` dentro una transazione ridà il turno al
  ciclo degli eventi. Il prezzo è un tetto di throughput che SQLite aveva già.
- **Documento JSON con colonne materializzate**: si indicizza solo ciò che
  serve, il resto vive in `data`. È il motivo per cui un campo nuovo non è una
  migrazione.
- **Servizio on-prem, attività pianificata**, non servizio Windows nativo (NSSM
  è il file che l'antivirus blocca alle sette di mattina). Niente Redis, niente
  Entra ID: si resta al PIN. Sage X3 fino al 2038.
- **«Niente Azure» non vale più, e PostgreSQL è acceso — 26/08/2026.** Lo decide
  `PATHFINDER_PG`, che `installa-servizio.ps1 -PostgreSQL` scrive in una
  variabile di macchina — non in un file, non nel repository. **Il database sta
  sulla stessa macchina del servizio, e questo non è un passo verso Azure: è un
  passo che lo evita.** La continuità operativa non è cambiata di una virgola.
- **Si torna a SQLite con un comando**, e il file è ancora lì — ma **riporta
  l'applicativo, non i dati**: da oggi la via di casa è il `.dump` della sera
  prima, e `C:\Pathfinder\data\pathfinder.db` invecchia dal 26/08.
- **`checkJs` spento sul client, acceso sul servizio.** Dove tipo e codice
  litigano, **cede il tipo**. **Il CSS non si minifica**: toglieva 413 caratteri
  su 146.368 e riscriveva le regole.

### Dati

- **Ogni campo nuovo è facoltativo, e assente significa «come nella 1.2».** Ogni
  collezione nuova, vuota, significa lo stesso. **Nessun campo cambia mai
  significato, nessun dato viene riscritto all'installazione.**
- **NESSUNA CANCELLAZIONE DI RECORD, PUNTO — 2.1.** La purga non c'è più, e
  `purgeMovementsBefore` nemmeno: era l'unica strada per cui un movimento poteva
  sparire. Il registro è la firma GMP di chi ha mosso la merce e si tiene **sei
  anni**; un modo di cancellarlo, per quanto protetto, è un modo che prima o poi
  qualcuno percorre. Per portare via i dati resta l'export JSON, che non toglie
  niente da dove sta.
- **I CODICI SI SCRIVONO IN MAIUSCOLO — 2.6.** Articolo, lotto, `item_key`,
  ubicazione, UDC, SSCC, ODP, DDT, sigla operatore, unità di misura: un codice in
  due grafie **non è un problema di resa a video, è una seconda entità che
  nasce**. **Normalizza il SERVIZIO**, a ogni scrittura e da qualunque parte
  arrivi; il client maiuscola mentre si digita — lettore ottico compreso, perché
  il lettore è una tastiera — ma quella è la comodità, non la garanzia.
  L'elenco sta in **`MAIUSCOLE`**, dentro `server/lib/schema.js`, e **non
  comprende**: il PIN (`pin_hash`/`pin_salt`, base64), le chiavi di `meta`
  (camelCase: `areaWip`, `udcPrefissoGS1`), gli enum confrontati alla lettera
  (`'empty'`, `'pallet'`, `'operator'`, `'open'`, `'in'`) e la prosa.
  `test/maiuscole.test.js` non lascia passare un campo che nessuno ha
  classificato, e ha una guardia perché il PIN non ci finisca dentro.
- **IL REGISTRO NON DICE NUMERI CHE SI CONTRADDICONO — 2.16.** Due domande, e
  non sono la stessa. **Quanto è cambiata la riga**: se `qty_before` e
  `qty_after` ci sono tutti e due, `qty_delta` è la loro differenza, calcolata
  al punto di scrittura — l'aritmetica batte il chiamante, e `null` resta il
  «non si sa» dei movimenti storici. **Quanti colli hanno cambiato posto**: un
  trasferimento di riga intera lascia la quantità dov'era e cambia il vano,
  quindi variazione **0** e colli mossi **tutti**. Chi legge il registro usa
  `quantitaMossa`, non `Math.abs(qty_delta)`. Le due regole stanno in
  **`modules/registro.ts`**, in un posto solo. **Le righe già scritte non si
  toccano**: si rileggono.
- **UN'UNITÀ DI CARICO CHE SI SPOSTA SCRIVE UNA RIGA PER OGNI PARTITA CHE
  PORTA — 2.16.** Il contenitore ha la causale **`UDC`**, che non muove merce e
  sta accanto a `EDIT`, `PURGE` e `PINRESET`. La merce scrive le sue righe:
  articolo, lotto, da dove a dove, quanti colli, chi ha firmato — dentro la
  stessa transazione. Una riga sola che non nomina niente non è la firma di chi
  ha mosso la merce.
- **`_format` del pacchetto di export non segue la versione dell'applicativo**:
  descrive la forma del file (`warehouse-mapper-v1.5`). A muoversi è
  `_appVersion`.
- **I documenti si rileggono, non si ricostruiscono**: le ristampe partono dallo
  snapshot archiviato.

### Merceologia

- **Allergeni: i 14 dell'Allegato II del Reg. UE 1169/2011.** Sono una norma:
  **non si tolgono e non si riscrivono.** Le voci aziendali — glutine, lattosio
  — si aggiungono **accanto**, e un codice aggiunto che ripete un fisso sparisce
  invece di sostituirlo.
- **Temperature:** `SURG` −18 °C · `REFR` +4/+8 °C · `AMB` +18/+25 °C.
  **Certificazioni:** elenco **aperto** — è una richiesta commerciale, non una
  norma.
- **La lettura di tutti e tre è stretta, mai tollerante**: indovinare cosa
  intendeva chi ha scritto è il modo di mettere un articolo col latte in una zona
  senza latte.
- **Il silenzio ha due significati.** Un articolo senza attributi non è conforme
  né difforme: è **ignoto**, si conta a parte e non produce avvisi. Zero
  segnalazioni perché va tutto bene e zero perché non c'è niente da verificare
  sono due cose diverse.
- **Gli attributi si vedono dove la merce si tocca** — prelievo guidato, report
  ODP, DDT — da **una sorgente sola**. L'allergene è l'unico in rosso: è il solo
  che può fare male a qualcuno.
- **La cella Riservata ammette allergeni**, deroga esplicita, contata ed
  elencabile. **Sulla temperatura non deroga**, e **sulla pericolosità nemmeno**:
  una scelta organizzativa non raffredda una cella e non separa un comburente da
  un infiammabile.

### Attività (schedulatore)

- **Lo schedulatore LANCIA il lavoro, non lo affianca.** L'avvio apre Movimenta
  precompilata, e un compito si chiude **solo perché un movimento è stato
  confermato**. «Completa» a mano non esiste per nessun tipo.
- **Un compito si chiude in due modi, e il tipo dice quale.** *A residuo* —
  Trasferimento, Smaltimento — quando i colli chiesti sono stati mossi. *A
  gesto* — i due prelievi, Quarantena, Campionamento, Conta — quando
  l'operazione è confermata. **Chi aggiunge un tipo deve dire in quale famiglia
  sta**: c'è una prova che glielo chiede. **Dove non c'è una quantità da
  esaurire, la prova che il lavoro è finito è il gesto**: non si inventa un
  numero che nessuno ha chiesto.
- **I parziali lasciano il residuo.** Il richiesto sta nel payload e non cambia
  mai; **il residuo lo scala la maschera, non il registro**.
- **Il prelievo si chiude alla registrazione del DDT**, non all'evasione: il
  ritiro del vettore è giorni dopo e non è un'attività dello schedulatore.
- **La priorità la alza solo il Team Leader.** **L'urgenza della scadenza si
  calcola a video, non si scrive**: sotto la soglia (4 h di serie) la coda tratta
  il compito come urgente.
- **Da uno stato chiuso non esce nessuna transizione.** **Un annullamento
  pretende il motivo.** Un avvio che non ha prodotto niente torna in carico e
  `started_at` si azzera — è l'unico istante già scritto che si cancella.
- **Chi CHIEDE un prelievo non deve sapere a chi va.** Destinatario, vettore e
  causale restano nella maschera perché chi li sa li scriva subito, ma non
  bloccano la conferma: sono dati del **documento**, che li pretende alla
  registrazione.
- **Il Posizionamento non è un compito** — avviene in coda all'accettazione, che
  su Pathfinder non passa. La funzione «Posiziona» resta.

### Unità di misura

- **Il collo incompleto non è una riga di giacenza sua.** `inventory` ha
  l'indice `[location_code+item_key]` e tutto Store è scritto sopra l'idea che
  quella coppia identifichi **una** riga. Una riga — `qty: 11`, `qty_uom: 10100`
  — e il resto si calcola.
- **La confezione del lotto vince sull'anagrafica, sempre**: si congela al primo
  posizionamento. **`qty_uom` è la quantità nell'UM dell'articolo**, non «pezzi».
- **La confezione si può dichiarare dopo, e la dichiara chi ha i colli in mano**
  (`Store.dichiaraConfezioneLotto`): è un fatto **del lotto** e vale per tutti i
  suoi colli, ovunque stiano.
- **Le UM che un movimento non porta si derivano alla LETTURA**, dai colli e
  dalla confezione di adesso — **mai riscrivendo un movimento**: il conto è
  storia, e la storia si rilegge con quello che nel frattempo si è saputo.
- **Le quantità dichiarate si convalidano, quelle derivate si troncano.**
  Bloccare un prelievo fisico perché un dato è vecchio è peggio del dato vecchio;
  lo scarto lo **mostra** `verificaUom`, che non corregge niente.
- **Le UM escono dentro la stessa transazione dei colli**, e il saldo di partenza
  si legge **dalla riga**, non da ciò che manda il client.
- **UNA RIGA CHE DICHIARA I COLLI NON SI SCARICA A NUMERO — 2.0.** `removeItem`
  **si rifiuta**, e il rifiuto dice quale riga. Guarda i `packs` **dichiarati** e
  non `colliDiRiga`, che legge un elenco anche dove nessuno l'ha scritto. Lo
  svuotamento totale resta libero.
- **Chi conta non toglie e non aggiunge: dichiara com'è fatto lo scaffale**, e
  la differenza la traduce `rettifica`. Un collo più leggero è un'uscita
  **parziale dallo stesso collo**: il 24 si accoppia col 25 sceso di uno, non col
  30 sceso di sei. **Chi rimette a posto ridichiara, non aggiunge**: rimettere
  dieci chili presi da un sacco da venticinque non è aggiungere un sacco da
  dieci, il sacco torna pieno (`packs_prima`).
- **QUANTI PER MISURA, NON QUALE COLLO — 2.2.** Due colli della stessa misura
  sulla stessa riga sono la stessa cosa. Il collo che si **apre** resta una
  scelta esplicita — è l'unico caso in cui la misura non basta — e il più piccolo
  che basta è un **default**, non una regola.
- **Un elenco messo da parte si ritrova per MISURA, mai per indice**: fra la riga
  scritta a documento e il vettore che arriva passano giorni.
- **Un riepilogo che vede unità diverse non somma: dichiara MISTA.** 300 KG più
  40 PZ fanno 340 di niente: una sola unità e il totale vale, più d'una e la
  cella resta **vuota — un'assenza, non uno zero**.
- **Il saldo in UM non esiste, il movimento in UM sì.** Il registro esce con
  **due colonne, non cinque**: ricostruire il prima e il dopo risalendo la catena
  darebbe un numero plausibile e falso su ogni riga storica.
- **UN EXPORT CHE NON NOMINA LE UM RACCONTA UN ALTRO MAGAZZINO.** Il foglio delle
  giacenze dà **una riga per collo**: contare le righe dà i colli, sommare «UM
  Collo» dà le UM, e nessuna cella ripete un totale di riga.
- **Il campione guarda l'unità di misura dell'articolo, e si comporta in due
  modi** — regola di Andrea del 25/08, **non ancora nel codice: voce 42**:
  - **con** UM configurata → si scala **la UM richiesta**, i colli non calano;
  - **senza** UM configurata → il campione **non modifica la giacenza**.

  *La regola di prima, che il codice applica ancora:* «un campione lascia sempre
  un residuo — svuotare un collo non è campionare: la rotta si rifiuta, col
  motivo». **Chi tocca `sampleItem` legga prima la voce 42**: cambia il
  significato di `SAMPLE`, e il logbook della qualità non si cancella.

### Il giro di prelievo — 2.12

- **UN GIRO PUÒ PORTARE PIÙ ORDINI, E IL CONTO DI PRODUZIONE RESTA UNO.** La
  merce scende sotto un numero solo — il **capofila** — e gli altri stanno sul
  movimento in `giro_odps`: non è un secondo conto e `conto()` non lo guarda. Il
  capofila è il primo file caricato finché non si sceglie altrimenti, e
  `session.odp_num` resta lui — è l'unico campo che rendiconto, registro e
  storico leggevano fino alla 2.11.
- **LA RIPARTIZIONE SI DICHIARA ALLA CHIUSURA, MAI AL PRELIEVO.** È la regola del
  consumo applicata alle quote. **Un collo non si divide: è la strada che la 2.3
  aveva preso, ed è quella che l'ha ritirata.**
- **QUEL CHE SI SCRIVE AL PRELIEVO È IL CHIESTO, NON IL CONSUMATO.**
  `giro_richieste` è un fatto del file di produzione, noto in quel momento.
- **LA SOMMA DELLE QUOTE FA ESATTAMENTE QUELLO CHE È USCITO**: l'ultima assorbe
  il resto dell'arrotondamento. Un centesimo in più su una quota si vede e si
  spiega; una somma che non torna è un conto che nessuno chiude.
- **RIGHE CHE SI FONDONO: STESSO ARTICOLO E STESSO LOTTO.** Una riga senza lotto
  non si fonde con una assegnata.
- **LA RICALIBRAZIONE RIPARTE SEMPRE DALL'ORDINE**, non dall'ultimo risultato, e
  si applica al totale **e a ogni lotto**, coi decimali dell'unità di ciascuno.
- **UN ORDINE SERVITO DA UN GIRO NON RISPONDE «NESSUN MOVIMENTO»**: dice dove sta
  il suo conto.

### Il conto di produzione — 2.29

- **QUELLO CHE È GIÀ IN REPARTO NON SI VA A PRENDERE.** Caricato un ODP, il
  sistema confronta la domanda del giro con quello che è fermo in lavorazione
  e lo dice. La regola è di `coperturaInLavorazione`, `modules/wip.ts`.
- **I DUE RESIDUI NON SI SOMMANO.** Quello degli ordini **del giro** scala il
  fabbisogno: dove copre tutto, la tappa non serve. Quello di ordini
  **estranei** sta sul conto di qualcun altro — prenderlo sposta un conto — e
  si dice soltanto, col numero dell'ordine che lo tiene.
- **SI CONFRONTA NELL'UNITÀ, MAI NEI COLLI.** Un residuo che la sua quantità
  non la dichiara, o che la porta in un'unità diversa da quella del foglio,
  **non entra nella sottrazione**: la riga esce incerta e il numero è un
  minimo. Moltiplicare i colli per una confezione che nessuno ha dichiarato è
  la voce 19 applicata al conto.
- **SOLO L'INCERTEZZA SULLA MERCE PROPRIA ROMPE LA SOTTRAZIONE.** Quella di un
  altro ordine non scalava niente, e annullare per causa sua un numero
  calcolato bene toglierebbe all'operatore l'unico dato che può usare.
- **`coperta` SI LEGGE DA `da_prelevare`, E DA NIENT'ALTRO.** Due modi di dire
  la stessa cosa divergono, e il giorno che divergono la schermata dice di non
  prelevare una riga che manca.
- **IL RIQUADRO INFORMA, E NON TOCCA NESSUNA TAPPA.** La distinta resta quella
  che l'ordine dichiara. Scalare da soli un fabbisogno su un residuo che
  nessuno ha guardato manda a produrre con meno merce di quella che serve.
- **DAL VANO DI LAVORAZIONE NON SI PRELEVA, MAI.** `build` lo esclude dalle
  ubicazioni percorribili: quella non è merce disponibile, è merce sul conto
  di un ordine. Una riga che sta tutta di là esce `in_lavorazione`, che è il
  suo motivo — non «in quarantena o impegnata su un DDT», che manderebbe a
  cercare il guasto dove non c'è.
- **LA COPERTURA SI RICALCOLA A OGNI RICOSTRUZIONE DEL GIRO**, non solo
  all'import: la quantità si ricalibra e un ordine si toglie, e con loro
  cambia il fabbisogno.

### Il conto di produzione — 2.14

- **LA SCHERMATA PARTE DALLA MERCE, NON DAL NUMERO.** Il primo elenco è quello
  che è fermo nel vano: una riga per ORDINE × ARTICOLO#LOTTO, coi gesti sulla
  riga. Chi entra in produzione non sa i numeri d'ordine a memoria, e una
  schermata che glieli chiede per prima cosa gli chiede quello che è andato a
  cercare.
- **CHIUDERE È UN GESTO SULL'ORDINE**, e sta nell'elenco dei conti, non sulla
  merce. **Un ordine a residuo zero non ancora archiviato compare lo stesso**:
  non ha niente in lavorazione, ma è vivo e il file di produzione lo può
  ricaricare finché nessuno lo chiude.
- **UN RESIDUO NEGATIVO SI VEDE.** È il conto che non sta in piedi (voce 61), e
  questa è l'unica schermata da cui lo si può notare: nasconderlo qui vuol dire
  nasconderlo e basta.
- **L'ARCHIVIO DEGLI ORDINI CHIUSI STA IN ARCHIVIO**, col resto dei documenti e
  con la tabella che si ordina e si filtra. Un elenco che cresce ogni giorno
  non si sfoglia a pulsantini.
- **UN RESO SBAGLIATO SI STORNA, E IL RESO RESTA SCRITTO.** Lo storno è un `in`
  che nomina il reso che annulla (`storno_di`); la merce si riprende **da dove
  era andata** (`reso_a`) e **con i colli rientrati** (`reso_packs`), che dopo
  una confezione aperta non sono quelli usciti dal vano.
- **IL VUOTO DI UNA CONFEZIONE APERTA NON SI STORNA**: quella merce è finita
  nel prodotto. Lo storno riporta indietro quello che è rientrato, e la
  maschera lo dice prima di premere.
- **QUANDO NON SI SA QUALI COLLI SIANO TORNATI, LO STORNO SI RIFIUTA E DICE
  PERCHÉ.** Su un lotto che i colli li dichiara, «togline due» non è una
  risposta — è la regola della 2.0, e vale anche qui.

### Il prodotto finito — 2.21

- **IL MODELLO DI CARICO SI IMPARA DAL PRIMO BANCALE, E UNA VOLTA SOLA.** I
  colli PIENI dichiarati diventano `AUTO-<n>`; **un modello appreso non porta
  mai un collo incompleto**, e **un articolo che un modello ce l'ha già non lo
  cambia da solo** — la proposta segue il caso normale, non l'ultimo bancale.
  Fra due formati veri che fanno lo stesso conto (un EPAL da 40 e un cassone
  da 40) **non si sceglie in automatico**: le tare sono diverse, e un lordo
  sbagliato finisce in bolla.
- **LA QUANTITÀ PER COLLO DEL PRODOTTO FINITO STA IN ANAGRAFICA**, non sul
  lotto: il lotto nasce qui, e chiederla a un record che non esiste ancora
  vuol dire non trovarla mai. Si scrive `pieces_per_pack`, che è il campo che
  `misure.configurazione` legge per primo.
- **L'ETICHETTA ESCE PRIMA DELL'UBICAZIONE.** Il bancale nasce senza vano e
  senza merce; la giacenza entra alla scansione del vano. Un bancale
  abbandonato in mezzo è un'**etichetta da buttare**, e l'elenco lo dice.
- **«LOTTI MULTIPLI — n partite» SI SCRIVE IN UN POSTO SOLO**
  (`descriviContenuto`): elenco, etichetta su foglio e ZPL devono scrivere la
  stessa parola sullo stesso pallet.
- **IL DDT E LA DATA DI SPEDIZIONE DI UN BANCALE SI RILEGGONO DAI DOCUMENTI**,
  e non sono campi dell'unità. **Un bancale spedito non è vuoto**: quel che
  portava lo dice il documento che l'ha portato via — è l'unica memoria che ne
  resta.
- **LA BAIA DI CARICO È UN POSTO, NON UNA REGOLA**, come la zona di prodotto
  finito: `dock_zone`, e non verifica niente. **Una posizione per bancale**,
  finché ce ne sono: due pallet nello stesso vano si disegnano dentro la
  stessa casella, e la mappa smette di dire che cosa sta salendo sul mezzo.
- **UN DDT A CUI MANCA UN BANCALE NON SI EVADE**, e non ferma gli altri. Un
  bancale saltato porta il motivo.
- **SUL DDT SI RAGGRUPPA IN STAMPA, MAI A DATABASE.** Una riga stampata è un
  articolo e un lotto; le righe salvate restano una per bancale — la packing
  list, l'evasione e il legame col pallet ci vivono sopra.
- **LA SESSIONE DI CARICO STA IN `meta`**, chiave `caricoSpedizione`, e ne
  vive una per volta. Non in `pick_session`: quella è del giro di prelievo ed
  è **una sola per tutto l'impianto** — avviare un carico chiuderebbe il
  prelievo di qualcun altro.

### Il prodotto finito — 2.20

- **UN BANCALE DI PRODOTTO FINITO È UN'UNITÀ DI CARICO**, con tre campi
  facoltativi in più: `kind: 'pf'`, `odp_num`, `model_code`. Assenti, è l'unità
  di carico della 1.12 — nessuna collezione nuova, nessun record riscritto.
- **LA COMPOSIZIONE DEL BANCALE È UN MODELLO, NON UN CAMPO DELL'ARTICOLO.** I
  formati veri sono una decina e gli articoli undicimila. **Il modello propone
  il numero di colli e non lo impone**: se il bancale reale ne porta 37 invece
  di 40 vince il bancale, e chi imballa non deve dire perché.
- **L'ORDINE DI PRODUZIONE È FACOLTATIVO.** Chi imballa non si ferma perché non
  ha il numero sotto mano. Il legame resta un campo scritto sul bancale, e il
  conto di produzione non lo guarda: la resa è un'altra cosa e non c'è.
- **IL PF ENTRA CON LA SUA CAUSALE — `PROD`.** Un `IN` con una nota non si
  filtra, e la domanda «cosa ha versato la produzione» arriva.
- **UN BANCALE MISTO PASSA, E QUEL CHE NON È DEFINITO RESTA VUOTO.** Un pallet
  con due partite non ha «un» lotto né «una» scadenza: l'etichetta dichiara
  «MISTO — n partite» e lascia in bianco i campi della merce. Il dettaglio lo
  porta la packing list, che le righe le elenca tutte.
- **VUOTO E SPEDITO SONO DUE FATTI DIVERSI.** Un bancale svuotato in magazzino
  è un pallet libero; uno svuotato da un DDT è merce su un camion — `empty` lo
  scrive `chiudiUdcSeVuota`, `shipped` lo scrive l'evasione.
- **UNA ZONA DI PRODOTTO FINITO NON È UNA REGOLA DI STOCCAGGIO**: non esclude
  niente e non verifica niente. Dice dove il reparto posa i bancali e dove
  l'elenco delle spedizioni va a guardare — e **vale anche su un sito
  terzista**, che è dove il PF finisce quando viaggia in conto lavorazione.
- **IL CONTO TERZI NON SCARICA: SPOSTA.** Su una causale marcata «la merce si
  sposta» l'evasione porta i bancali nel vano del sito di arrivo con
  `/api/op/moveUdc`; la merce resta in giacenza e resta nostra. **Le causali
  già salvate non cambiano da sole**: la spunta è un gesto umano, una volta.
- **LA PACKING LIST È UN SECONDO MODO DI STAMPARE LO STESSO DOCUMENTO**, non
  una collezione: un bancale per blocco, e il **DDT resta a pagina sola**
  mentre lei **scorre**. Il peso lordo somma le tare al netto e **resta vuoto**
  dove le unità non si sommano.
- **UN RECORD DI DOCUMENTO SI RICOSTRUISCE CAMPO PER CAMPO, E I POSTI SONO
  TRE**: `modules/documenti.ts` per la riga, `savePendingOutbound` e
  `updatePendingDoc` per la testata. Ciò che non è nominato in quei tre non
  arriva a database, **e non dà errore** — la 2.20 l'ha pagata su
  `dest_location`, dopo che la 1.8.4 l'aveva già pagata sui colli.

### La scansione in corsia — 2.12

- **L'UBICAZIONE SI VERIFICA UNA VOLTA PER VANO, NON UNA PER TAPPA.** La chiave
  è `<ubicazione>@<apertura>`. **Una verifica che si ripete quando non c'è niente
  da riverificare è una verifica che si smette di fare.**
- **LA SPUNTA CADE SU TRE COSE**: cambiare vano, spostarsi su un'ubicazione
  alternativa, rientrare nella schermata. **Chi tocca `_routeChiaveScan` deve
  poterle riprovare tutte e tre.**
- **IL VANO CONFERMATO NON È UN CAMPO SPENTO: È UNA BANDA**, e riscansionare
  resta possibile senza chiedere un motivo.
- **ARTICOLO E LOTTO SI RISCANSIONANO A OGNI RIGA.** Il vano è uno; la merce no.
- **LA CAMPATA SI GUARDA, NON SI TOCCA — 2.22.** Il disegno della colonna non
  ha gestori: la scheda della tappa è aperta durante un prelievo, e ogni
  bottone di questo applicativo scrive nel magazzino di qualcuno.
- **I LIVELLI CHE NON SI DEVONO TOCCARE PORTANO IL SOLO STATO — 2.22.** Cosa
  c'è dentro un vano che non è la tappa non serve a chi preleva: è una riga in
  più da leggere coi guanti. **L'unica eccezione si dice a parole**: lo stesso
  articolo con un **lotto diverso** su un altro livello, che è il caso in cui
  la scansione del vano non salva nessuno — il codice letto è valido, solo non
  è il suo.

### Stoccaggio, mappa, documenti

- **La priorità di una regola va da 1 a 10.** Una regola vecchia con 0 si rilegge
  buona: **in lettura si è tolleranti, in scrittura no.**
- **La distanza ha un tetto** (`DISTANZA_MAX: 15`): senza, su 274 ubicazioni
  decideva da sola e il raggruppamento del lotto non spostava niente.
- **La vista la decide la zona, non chi guarda.** Scaffali → frontale, con
  «Specchia»; terra e sfuso → dall'alto. Offrire tutte e due su ogni zona vuol
  dire offrire, su ogni zona, quella sbagliata.
- **Il pannello di dettaglio non copre la pianta**: i 360 px coperti erano
  esattamente la corsia che l'operatore aveva appena cliccato.
- **Un'unità di carico si disegna DENTRO il vano** e si trascina; il
  trascinamento passa da `moveUdc` come la maschera: non è una scorciatoia che
  salta un controllo.
- **Ogni documento stampato porta in testata il proprio riferimento in Code128**,
  e la riga sta in un posto solo — `_docHeadHTML`, da cui passano tutti e sette.
- **Un'etichetta porta solo quello che non invecchia.** Sull'UDC l'unico dato che
  non invecchia è il numero, che **non si riusa mai**: ubicazione, data e
  operatore diventano una bugia incollata al legno.
- **Le barre sono nere su bianco dichiarato**: un tema scuro le rende illeggibili
  a qualunque lettore. La carta non ha un tema. **Quello che esce è Code128, non
  GS1-128** — voce 24.
- **LA STAMPANTE SI AFFIANCA ALLA CARTA, NON LA SOSTITUISCE — 2.19.** Le tre
  `@media print` restano dove sono: stampante spenta, rotolo finito o rete giù,
  e l'etichetta esce su A4 dal browser come è sempre uscita. Senza quel
  pulsante un guasto alla stampante fermerebbe la creazione delle unità di
  carico.
- **A PARLARE ALLA STAMPANTE È IL SERVIZIO, E L'INDIRIZZO NON ARRIVA MAI DALLA
  RICHIESTA — 2.19.** Un browser non apre un socket TCP; il client manda un
  `printer_id` e la chiave di un record, il resto lo legge il servizio da
  `meta.printers`. **L'etichetta la costruisce il servizio** rileggendo la riga
  a database: in regime GMP un'etichetta è un documento, e un documento
  costruito dal browser si falsifica scrivendo in una console.
- **«INVIATA» NON È «STAMPATA» — 2.19.** La porta 9100 accetta i byte e chiude:
  carta finita, testina aperta e nastro esaurito passano tutti come successo. A
  dirlo è `~HQES`, che si chiede dopo ogni invio, e **la maschera dichiara
  quale dei due fatti sta mostrando**.
- **UN LAYOUT CHE NON CI STA SI RIFIUTA, NON SI TRONCA — 2.19.** Un'etichetta
  troncata esce con l'aria di essere giusta e le manca l'ultima riga. E **sotto
  0,25 mm di modulo le barre non si stampano affatto**: è la stessa regola per
  cui un simbolo che non si può scrivere non si scrive.

### Metodo e interfaccia

- **Un blocco per commit**, con build e collaudo in mezzo. **Chi sposta non
  corregge.**
- **Ogni tabella si ordina e si filtra** (`modules/tabella.ts`): ordinamento
  **stabile**, il **vuoto in fondo nei due versi** (una data mancante non è
  «molto vecchia»), i numeri confrontati da numeri, e il terzo clic riporta
  all'ordine di partenza.
- **Il cruscotto se lo compone chi lo guarda**: ordine, larghezza e quali
  riquadri sono un dato in `meta`. **Ordine e larghezza, mai coordinate in
  pixel** — una posizione salvata su un 27 pollici, riletta a 480, mette due
  riquadri uno sull'altro. **Quello che avvisa non si spegne.**
- **Italiano ovunque**, commenti compresi. Nessun `font-size` fuori dai token
  MD3. Il marchio Naturacare non si adatta al tema: verde `#94BC47`, blu
  `#21305A`. I documenti di stampa restano in `pt` e `mm`.
- **Niente dipendenze nuove** senza motivo forte, e **`dexie` e `xlsx` non si
  aggiornano** — ma per `xlsx` la regola va ridecisa: **voce 65**.
- **GMP**: ogni movimento porta la sigla dell'operatore identificato, e **non
  si cancella mai** — non a mano, non col tempo. **Dalla 2.17 non c'è più un
  numero di ritenzione nel codice** (era `LOG_RETENTION_DAYS = 2192`, sei anni
  esatti): non cancellava niente e finiva in tre etichette, una delle quali
  diceva «conservazione 6 anni» due righe sotto «nessun record viene mai
  cancellato». **Sei anni non li chiedeva nessuna norma**: la guida della
  Commissione sull'art. 18 del Reg. 178/2002 raccomanda **5 anni** per la
  rintracciabilità, l'**art. 2220 c.c.** ne vuole **10** per fatture e documenti
  commerciali — e Pathfinder emette DDT — e l'**Annex 11** lega l'audit trail al
  record che documenta. Per quanto si tenga il registro lo dice **la SOP**, e a
  quel punto è politica di backup e di database. Il volume resta quello:
  300-500 movimenti al giorno. **GDPR**: nome, cognome e iniziali,
  nessuna telemetria, nessuna richiesta verso l'esterno. **Il PIN non esiste a
  database: esiste la sua impronta.**
- **Una maschera che chiede l'identità in fondo la chiede troppo tardi**: la
  sigla si pretende prima di aprire il modulo.
- I conteggi DOM/CSS di confronto fra versioni sono **misure, non invarianti**.

### Il front end

- **Tailwind dal 18/08, e non è «tutto a utility»**: l'applicativo non ha
  componenti e il markup nasce da stringhe, quindi **i componenti e il telaio
  restano classi** (`btn`, `badge`, `input`, sidebar, modali). Quel che è stato
  tolto sono i `style=`: da **2.187 dichiarazioni** in 1.092 attributi a **84
  attributi**, di cui 53 con un valore che nasce a runtime.

  1. **`main.js` importa un CSS solo**: `00-tailwind.css` è il tema e importa gli
     altri nove con `@import … layer(app)`.
  2. **L'ordine dei layer è il contratto**: `theme, base, components, app,
     utilities`. Il CSS dell'applicativo sta in `app`, **sotto** le utility.
     Prima stava fuori dai layer, dove batteva tutto — e `* { margin: 0 }`
     spegneva ogni `mb-*`: **le utility nascevano morte** e nessun collaudo se ne
     accorgeva.
  3. **La spaziatura va a decimi di rem**, non a quarti: qui `mb-4` è **0,4rem**.
     La ragione è l'MC9400 — 4,3" da 800×480, fra i 400 e i 533 px CSS, **sotto
     ogni media query che l'applicativo ha oggi**. La densità ha **una manopola
     sola**, `--spacing`.
  4. **Il tema non ha valori, ha rimandi.** Il colore si cambia in
     `01-tokens.css`; la tavolozza di serie è spenta (`bg-blue-500` non compila).
     Raggi e ombre vanno **per numero** — `rounded-2`, `shadow-3`.

  **Non si migra la stampa**: le tre `@media print` restano CSS come sono.
- **SERVITO, NON SI «SALVA»: SI SCRIVE — 2.16.** `_touchMeta` alza
  `unsavedChanges` a ogni mutazione e dalla 2.1 nessuno lo riabbassa, quindi su
  una macchina servita l'indicatore restava rosso per sempre. Servito dice **«In
  linea»** e la Dashboard **«Ultima scrittura»**; il servizio che non risponde
  ha già la sua schermata. Da file non cambia niente. La domanda si fa a
  `Store.eServito()`.
- **LE ICONE A PRESENTAZIONE TESTUALE SI VESTONO COL SELETTORE — 2.16.**
  `✏️ ⚠️ ⚙️ ℹ️ ♻️` scritti nudi escono come glifi di testo: la matita di
  «Modifica» si leggeva come un trattino, l'avviso come un triangolo grigio.
  Vogliono `U+FE0F`, e lo tiene `test/emojiVestite.test.js`. **Le frecce
  restano nude** — `↔ ▶ ↩` marcano righe dentro tabelle dense, e da icone
  peserebbero più di quel che accompagnano.
- **`App` è più grande del file che lo dichiara**: metà dei suoi metodi arriva
  dalle viste, che rientrano con `Object.assign` in coda ad `app.ts`. Il ponte è
  `DalleViste`; `monolite()` a runtime non fa niente e serve a dare quel tipo a
  `this`. **Le viste sono `satisfies Vista`, non `: Vista`** (con l'annotazione
  il tipo di ogni metodo veniva schiacciato su `Metodo`). **Il `this` delle viste
  resta `any`, e non per pigrizia**: dargli il tipo vero è un ciclo che il
  compilatore non scioglie (TS7022).

### Le tre cariche

- **`operator` · `leader` · `admin`.** L'Admin **comprende** il Team Leader: dove
  passa un leader passa lui. Una carica più alta che potesse meno chiuderebbe il
  cerchio del 13/08.
- **Solo l'Admin apre la Configurazione e il reset dei dati**, e il reset
  pretende il suo PIN. Il varco sta in `renderConfig`, non in `switchView`: su un
  database vuoto l'applicativo porta in Configurazione **prima** di chiedere chi
  sei.
- **L'eccezione del primo giorno è dichiarata e si spegne da sola**: finché
  nessun Admin esiste comandano i Team Leader, o l'installazione murerebbe la
  Configurazione, che è l'unico posto da cui si nomina un Admin.
- **L'ultimo Admin non si retrocede, non si disattiva e non si cancella, e
  dalla 2.16 lo impone IL SERVIZIO.** Fino alla 2.15 la regola viveva solo in
  `configOperatori.ts`: una `PATCH` mandata da un Admin che si retrocede
  passava, e da lì non si rientrava più — la Configurazione vuole un Admin, il
  codice di ripristino pretende `role === 'admin'`, e la finestra del primo
  avvio guarda i PIN e non le cariche. Il servizio **simula** la scrittura su
  una copia dell'anagrafica e guarda com'è rimasta, quindi la regola vale anche
  dentro una `/tx`. **Con due Admin il gesto passa**, e il reset dei dati resta
  permesso: svuota tutto, nessuno resta con un PIN, e la finestra si riapre.
  Otto prove in `banco/gerarchia.cjs`.

### Il PIN smarrito — come si esce

**Il PIN non è recuperabile per costruzione**: sul disco resta la sua impronta —
**`scrypt` dalla 2.10** (le vecchie SHA-256 si riscrivono in scrypt al primo
accesso riuscito; il modo «da file» resta SHA-256 perché il browser non ha
scrypt). Il rinnovo lo autorizza un Team Leader col proprio PIN, e **con un solo
Team Leader il cerchio si chiude su sé stesso** — è successo il 13/08.

**Le tre vie d'uscita, in ordine di preferenza.** Le prime due sono della 2.13,
**in servizio dal 31/08**: valgono tutte e tre.

1. **Un grado più alto lo rinnova, dall'applicativo.** Configurazione →
   Operatori, il bottone del rinnovo: chi autorizza digita il **proprio** PIN.
   L'Operatore lo rinnova un Team Leader, il Team Leader un Admin, l'Admin
   chiunque. Passa da `POST /api/op/rinnovaPin`, e la gerarchia la verifica
   **il servizio**: dalla 2.13 non c'è modo di aggirarla dal browser.
2. **Se il PIN perso è quello dell'unico Admin, il codice di ripristino.**
   Dalla schermata di accesso, «🗝 Ho un codice di ripristino»: si sceglie
   l'Admin, si digita il codice — venti caratteri, spazi e minuscole perdonati
   — e si scrive il PIN nuovo. Il codice **si consuma**, e al suo posto ne
   compare subito un altro, mostrato **una volta sola**: si stampa e si mette
   dove stava quello di prima. Chi non ne ha uno lo genera da Configurazione →
   Operatori, col bottone 🗝, e la colonna «Ripristino» dice per ogni Admin se
   c'è o manca.
3. **Se non c'è né l'una né l'altra: la chiave di macchina.**
   `PATHFINDER_TOKEN` apre le rotte senza sessione — è la chiave del backup
   serale e dell'installer, e sta sulla macchina del servizio. **È l'uscita di
   servizio, non una procedura**: si usa da chi ha già accesso a quella
   macchina, e la si richiude nominando un secondo Team Leader.

> ⚠️ **La procedura che questo documento ha portato per settimane —
> `POST /api/op/hashPin` seguito da una `PATCH` su
> `/api/c/operators/<op_id>` — NON funziona più dalla 2.11**: quelle rotte
> vogliono una sessione, e dalla 2.13 la `PATCH` sugli operatori vuole anche
> la carica. Non si riprova: si usa una delle tre qui sopra.

Due cose che restano vere in ogni caso: **l'`op_id` si rilegge, non si copia**
(una `PATCH` su una chiave che non esiste **crea** un secondo operatore invece
di dare errore), e la causa si toglie con **un secondo Team Leader**, un minuto
in Configurazione → Operatori.

---

## 9. Mappa del codice

### Client — `src/`
| File | Righe | Ruolo |
|---|---:|---|
| `ui/app.ts` | 1.328 | **Quel che non è una vista**: avvio e riallineamento, identità e sessione, il telaio (`switchView`, sidebar, `showModal`, `toast`, scorciatoie), l'annulla, le utilità comuni (`_esc`, `_requireOperator`, `_pickLoc`). In coda, il rientro delle viste |
| `core/store.ts` | 4.606 | **Le mutazioni**: tutto ciò che scrive e parla con `Persistence` |
| `core/cache.ts` | 321 | Punto unico di mutazione della cache: 5 forme, 4 indici derivati |
| `core/statistiche.ts` · `pacchetto.ts` · `geometria.ts` · `giacenza.ts` | 181 · 154 · 123 · 94 | Stato di una cella e cruscotto · export e `VERSIONE_APP` · le ubicazioni generate dalla zona · FEFO e ricerca |
| `core/persistence/index.ts` · `remote.ts` · `local.ts` | 15 · 267 · 262 | Sceglie l'adapter: servito → HTTP, da file → Dexie |
| `core/schema.ts` · `utils.ts` · `costanti.ts` | 173 · 46 · 44 | Schema IndexedDB · `debounce` e `_h` · causali e ritenzione |
| `modules/compiti.ts` | 555 | Ciclo di vita, coda, misure, urgenza calcolata, residuo, le due famiglie di chiusura. `registroAttivita` unisce i compiti ai campionamenti che nessun compito rivendica. Puro |
| `modules/misure.ts` · `colli.ts` | 319 · 578 | Le cinque unità e la suddivisione per collo · l'elenco dei colli: uscite come le capisce il servizio, ritrovamento per misura, `scelteDaTaglie`, `riempiFabbisogno`, `rettifica`. Puri |
| `modules/registro.ts` | 46 | **2.16 — le due domande che si fanno a una riga del registro**: quanto è cambiata (`quantoSiEMosso`) e quanti colli hanno cambiato posto (`quantitaMossa`). Stanno insieme perché confonderle è il difetto della voce 33. Puro |
| `modules/documenti.ts` | 258 | La riga di un documento di uscita, ricostruita **in un posto solo**. Nasce da un difetto, e dalla 2.20 porta anche `udc_id` — da quale bancale esce la riga. **2.21**: `raggruppaPerPartita`, la riga che si STAMPA — un articolo e un lotto — mentre quella che si salva resta una per bancale. **2.24**: `distintaPerArticolo`, i tre livelli della packing list — articolo, lotto, bancale — ognuno col suo totale, con le stesse due regole del dato: unità diverse lasciano il totale **vuoto** e una scadenza discorde dentro un lotto sparisce. Somma con `sommaUom`, cioè con lo stesso arrotondamento dei totali del DDT: due totali che si scostano di un millesimo sullo stesso foglio sono una contestazione in banchina. Puro |
| `modules/giacenzaArticolo.ts` | 175 | La giacenza di un articolo per lotto, FEFO, e la coda di conte nell'ordine dello scaffale. **Le UM non si calcolano qui**: arrivano risolte da `Store.righeLette`. Puro |
| `modules/trasferimentiOdp.ts` · `dispositivo.ts` | 142 · 74 | Le tappe in un altro magazzino e il compito che ne nasce · su che cosa sta girando (decide **la larghezza**, non il sistema operativo). Puri |
| `modules/chiosco.ts` | 93 | **2.25** — dove sta il chiosco su questa macchina: entrano classe di dispositivo, se gira già come applicazione, se l'origine è sicura e se il browser ha offerto l'installazione; esce uno stato fra cinque, con la frase da leggere. `non-sicuro` è distinto da `in-attesa` apposta: senza HTTPS non si installa niente, e dirlo evita di cercare il guasto altrove. Puro, come `dispositivo.ts` |
| `modules/colonna.ts` | 119 | **2.22 — com'è fatta la campata che contiene un vano**: i livelli dall'alto in basso, ciascuno col **solo stato**, più i livelli che tengono lo stesso articolo con un lotto diverso. Sta da solo perché la domanda la fanno la scheda della tappa e, il giorno che servirà, la mappa. Torna `null` su terra, rinfusa e scaffali a un livello: **una colonna di un rettangolo solo non è una colonna**. I codici dei fratelli li dà `generaUbicazioni`, mai una `split('-')`. Puro |
| `modules/cruscotto.ts` | 190 | Il layout del cruscotto — riquadri, ordine, larghezza, quali scorciatoie si mostrano — e **dalla 2.29.1 `TASTI_FUNZIONE` e `tastoPer`**: l'unico elenco dei tasti funzione, che la tastiera ascolta e le schede interrogano. `sub` fa parte della chiave, ed è quello che mancava: senza, «prelievo» e «prelievo di produzione» erano la stessa cosa e due schede annunciavano lo stesso F3. Puro |
| `modules/udc.ts` | 162 | Il codice sull'etichetta: interno o SSCC con la cifra di controllo GS1. Sta da solo perché **un'etichetta dura**. Dalla 2.20 lo stesso codice identifica anche un **bancale di prodotto finito** — `modules/bancale.ts`. Puro |
| `modules/imballo.ts` | 199 | **2.20 — com'è fatto un bancale prima che il bancale esista**: i modelli di imballo, la loro convalida, `colliAttesi` e `pesoLordo`. Sta da solo perché la composizione è un DATO e non un campo su 11.197 articoli. **Il modello propone**: chi imballa riscrive il numero senza dover dire perché. **2.21**: `modelloAppreso` e `modelloConColli` — il formato che si IMPARA dal primo bancale invece di essere compilato su 11.197 articoli. Puro |
| `modules/bancale.ts` | 277 | **2.20 — come si LEGGE un bancale di prodotto finito**, in un posto solo: mono o misto, colli, UM (diverse → MISTA, mai una somma), e i quattro stati — pronto, impegnato su un DDT, spedito, vuoto. La stessa domanda la fanno l'elenco, la mappa, l'etichetta e la packing list: quattro copie sarebbero quattro risposte. `zonePf` elenca le zone dichiarate, terzisti compresi. **2.21**: `zoneCarico` (le baie), `spedizioniDiBancale` — con quale DDT e quando un bancale è partito, **riletto dai documenti evasi** — e un bancale spedito che legge il suo contenuto da quel documento, perché in giacenza non ha più niente. Puro |
| `modules/stampanti.ts` | 377 | **2.19** — la forma di una stampante Zebra, la sua convalida, e `disponi`: dove finisce ogni riga dell'etichetta in millimetri. `proponiStampante` sceglie quella giusta — l'ultima usata, poi quella del sito. **2.20**: i cataloghi di campi sono **due** — merce e bancale — e il genere è un parametro di `leggiRiga`, `leggiLayout` e `disponi`, non una seconda copia. **Non c'è lo ZPL**: le barre e i comandi li scrive il servizio, perché un'etichetta è un documento e un documento costruito dal browser si falsifica in una console. Puro |
| `modules/stoccaggio.ts` | 613 | Dove si mette la merce: vincoli **duri**, poi punteggio. Le regole sono un dato di `storage_rules`; ogni proposta dice perché. **2.8**: pericolosità, portata, la casa del lotto in cima, la categoria come terzo bersaglio con **un solo livello**. Puro |
| `modules/regoleBase.ts` | 448 | **2.8** — le due regole che NON si scrivono, più i tre motivi precompilati dello scavalco. Sta da solo perché quelle di `stoccaggio.ts` sono regole di **politica**, queste sono il modo in cui un magazzino resta leggibile. Puro |
| `modules/wip.ts` | 1.078 | **Il conto di un ordine**: entrato, tornato, residuo; il consumo si dichiara **a ordine chiuso**. `colliFuori`, `archiviato`, `ordiniArchiviati`, `righeSenzaOrdine`. **2.12**: `giro_odps`, `giro_richieste`, `giro_id` sul movimento, e quattro letture — `contoTenutoDa`, `ordiniServiti`, `richiesteDiRiga`, `consumoPerOrdine` (che legge le quote scritte **alla chiusura**). **2.14**: `inLavorazione` (una riga per ordine × articolo#lotto di quello che è fermo nel vano, senza sapere prima nessun numero), `resi` e `motivoNonStornabile`, più i quattro campi dello storno sul movimento. **2.29**: `coperturaInLavorazione` — quanto di quel che un giro chiede è **già di là**, coi due residui tenuti distinti (del giro, che scala; altrui, che si dice e basta) e il confronto **nell'unità**, mai nei colli. Puro |
| `modules/giroOdp.ts` | 300 | **2.12 — il giro.** `ricalibra` (riparte sempre da `lines_originali`) e l'unione delle distinte, tenendo da parte **quanto ne vuole ciascun ordine**. `quote` ripartisce quel che è uscito e **l'ultima assorbe l'arrotondamento**. **2.29**: `fabbisogno` — la domanda del giro in forma piatta, per `articolo#lotto`, dalla stessa `unisci` che costruisce il percorso; una riga senza lotto resta fuori. **Non decide niente sul conto di produzione.** Puro |
| `modules/pickRoute.ts` | 396 | Percorso a serpentina, ordine dei siti, magazzino di casa, `riordina`. **2.12**: `buildGiro` — le distinte si sommano **prima**, in `giroOdp.ts`, e le `richieste` si riattaccano dopo **per chiave**, perché `build` decide ubicazione e alternative ed è già collaudata così. **2.21**: `ordinaPerCorsia` — la stessa serpentina su qualunque cosa abbia un'ubicazione, perché il carico del camion prende bancali e non righe. **2.29**: **il vano WIP non è un'ubicazione da cui si preleva** — `build` lo esclude, e una riga che sta tutta di là esce col motivo `in_lavorazione`. **2.29.1**: gli avvisi si scrivono **uno per vano e motivo**, non uno per riga di giacenza — `(location_code, item_key)` è un indice e non un vincolo (voce 98), quindi due righe nello stesso vano ripetevano la stessa frase |
| `modules/odpParser.ts` | 286 | Lettura degli ODP da Excel |
| `modules/kpi.ts` | 330 | I numeri di articoli, movimenti e persone, già a database e mai sommati. `NON_MISURABILE` elenca cosa non si può chiedere e **quale campo servirebbe**. Puro |
| `modules/code128.ts` | 150 | Il codice a barre, in casa. Solo il sottoinsieme B. **Non è un GS1-128** — manca FNC1 — e sta scritto nel modulo. La tabella dei 107 modelli si collauda con le due invarianti dello standard, non ricopiandola. Puro |
| `modules/cruscotto.ts` · `tabella.ts` | 155 · 200 | Il layout della Dashboard (riconcilia il salvato con quel che il codice sa fare oggi) · ordinare e filtrare. Puri |
| `modules/conformita.ts` | 300 | Cosa è stoccato dove non dovrebbe: il motore al contrario. **2.8**: pericolosità e lotto sparso, aree di transito escluse. **2.9**: la matrice è uscita |
| `modules/destinatari.ts` · `parametri.ts` · `anagrafica.ts` | 200 · 165 · 158 | Chi è lo stesso destinatario · le tendine che sono un dato · i 14 allergeni, le 3 classi, le certificazioni |
| `modules/fogli.ts` | 112 | Le due domande di un foglio Excel che non riguardano SheetJS: `colliDaStendere` (una riga per collo) e `celleUom` (MISTA, e il totale vuoto). **`distendiGiacenze` è il muro del foglio**: 1.048.575 righe contate su TUTTE le giacenze insieme; una riga che da sola sfonda il foglio torna `null`. Puro |
| `modules/excel.ts` | 31 | **Il punto unico da cui SheetJS si carica, e solo quando serve.** Chi rimette `import * as XLSX` in cima a un file annulla la 1.7 |
| `modules/validate.ts` · `auth.ts` · `session.ts` · `pickupAlert.ts` · `scanGuard.ts` · `maiuscole.ts` | 104 · 88 · 69 · 43 · 31 · — | Validazioni · PIN e impronta · sessione · allerta ritiri · guardia del lettore · i campi che sono un codice |
| `types/entita.ts` · `contratto.ts` · `collezioni.ts` | 722 · 157 · 63 | Le entità · l'interfaccia dei due adapter · **le 21 collezioni, sorgente unica**: il `satisfies` blocca la compilazione se adapter o servizio divergono |
| `styles/*.css` | 4.588 | **10 file**, §8 |
| `ui/dialog.js` · `feedback.js` · `tabs.js` | 546 · 181 · 59 | Modali · toast e spinner · schede. **2.21**: `Dialog.testo`, una riga sola — un numero di DDT non è una motivazione, e `reason` glielo direbbe a video |
| `main.js` · `index.html` | 46 · 200 | Avvio e gancio globale · scheletro del DOM e marchi SVG |
| `ui/views/` | ~18.700 | Le viste, più `vista.ts` e `globale.d.ts` |

### Le viste — `src/ui/views/`

**Una vista è un pezzo di `App` che vive in un file suo.** Non è un modulo che
si istanzia: `App` resta un oggetto solo, perché l'indice e i gestori costruiti
dentro le stringhe lo chiamano **per nome**. In coda ad `app.ts` un ciclo le
rimette dentro, e **esplode se un metodo è rimasto anche di qua** — estrarre è
spostare, e un doppione verrebbe sovrascritto in silenzio.
| File | Righe | Cosa disegna |
|---|---:|---|
| `percorso.ts` | 1.998 | Prelievo guidato: ODP, serpentina, corsia, chiusura, il trasferimento chiesto dall'ordine. **2.12 — il giro e la sosta**: più `.xlsx` che si aggiungono, la quantità ricalibrabile, il **capofila**, e `_routeSosta` che raggruppa le tappe pendenti contigue nello stesso vano. **2.22**: la **campata vista di fronte** accanto ai dati — `_routeColonna` la chiede a `modules/colonna.ts`, `_routeColonnaHTML` la disegna, `_routeRischioLottoHTML` avvisa dello stesso articolo con un altro lotto. Si guarda e basta: nessun gestore. **2.29**: `_routeCoperturaHTML` — il riquadro di quel che è **già in reparto**, sopra gli avvisi. Disegna e basta: nessun `onclick`, nessuna tappa toccata |
| `spedizioni.ts` | 1.824 | DDT: testata, carrello, documento pendente, evasione, stampa. **2.20**: il carrello si riempie **dai bancali** (`_shipCaricaDaBancali` — sta qui perché il carrello è qui), la **packing list** che raggruppa le righe per bancale, e `_evadiTrasferendo`, l'evasione del **conto terzi** che sposta la merce invece di scaricarla. **2.21**: `_shipRigheDaBancali` — come una riga di DDT nasce da un pallet, in un posto solo, perché la chiedono in due — il DDT che **stampa** una riga per articolo#lotto, e la packing list che dice com'è fatto il collo. **2.24**: il **foglio si separa dalla stampa** — `_ddtFoglioHTML` e `_packingFoglioHTML` compongono, `_printDDT` e `_printPackingList` leggono dallo Store e stampano — perché il banco a video sui documenti a database non misurava mai il caso che rompe un foglio: quello che non ci sta. E la packing list si legge per **articolo → lotto → bancale** (`_packingDistintaHTML`), col numero e la sua unità in due celle (`_packingQta`) |
| `inventario.ts` | 1.035 | Inventario di vano, conta mirata, ramo «Per articolo» col giro di conte |
| `configDati.ts` | 975 | Dati, resilienza, i tre fogli Excel, reset (che chiede il PIN dell'Admin) |
| `cruscotto.ts` | 900 | I tredici riquadri componibili e le sette scorciatoie |
| `compiti.ts` | 885 | Attività: coda, misure, registro, richiesta, i quattro gesti |
| `posiziona.ts` | 781 | Posizionamento, la dichiarazione dei colli, `_scegliColli` e `_ridichiaraColli` (condivisa con inventario e Conta) |
| `quarantena.ts` | 755 | Blocco, rilascio, cartellino di non conformità |
| `wip.ts` | 1.066 | **Il conto di produzione**: conto, reso, chiusura, rendiconto. **2.12**: un ordine servito da un giro dice **dove sta il suo conto**; il capofila elenca chi sta servendo; la chiusura scrive la ripartizione. **2.14**: la schermata parte dalla **lista di quello che è fermo in lavorazione** (ordinabile e filtrabile), i conti aperti stanno in un elenco compatto, **l'archivio è uscito di qui** e un reso sbagliato **si storna** |
| `smaltimento.ts` | 664 | Scarico in tre stadi, e i **mattoni del documento** che usano tutti |
| `prelievo.ts` | 600 | Trasferimento e carrello di produzione |
| `rapportoPrelievo.ts` | 579 | Un rapporto, tre sorgenti. **2.12**: la testata porta «Giro — ordini serviti» |
| `giacenze.ts` | 527 | Dettaglio di un'ubicazione, i cinque gesti che partono da lì, il totale in colli e UM |
| `configArticoli.ts` · `configurazione.ts` · `configSiti.ts` · `configOperatori.ts` | 498 · 437 · 375 · 362 | Anagrafica e attributi · le schede · siti e zone · operatori, PIN, sessione |
| `mappa.ts` · `documento.ts` | 697 · 441 | Pianta, frontale, conformità e deroghe — **2.20**: il filtro che tinge i bancali di prodotto finito con lo stato che hanno · la correzione di un DDT pendente su uno snapshot, che dalla 2.20 porta anche la causale e l'ubicazione di arrivo |
| `campionamento.ts` · `movimenta.ts` | 359 · 354 | Campionamento GMP e verbale · il telaio dei moduli e il registro di sessione |
| `udc.ts` | 322 | Le unità di carico: elenco, creazione, carico, spostamento, etichetta |
| `prodottoFinito.ts` | 1.071 | **2.20 — il magazzino del prodotto finito.** La maschera del reparto che chiude un bancale in un gesto e ne stampa l'etichetta, e l'elenco di chi spedisce: ordinabile, filtrabile, con la spunta che carica il DDT. Il pulsante «Vedi in mappa» non disegna niente — apre la mappa sulla zona PF col filtro acceso. **2.21**: la maschera è quella del carico merce (① articolo → ② lotto → ③ colli pieni × quanto dentro), il modello di carico si **impara**, l'etichetta esce **prima** dell'ubicazione, l'elenco porta articolo e lotto in due colonne più DDT e data, e lo **scarico a mano** fa uscire i bancali con un numero già emesso dal gestionale |
| `caricoSpedizione.ts` | 611 | **2.21 — il carico del camion.** È il giro di prelievo di chi spedisce, e le tappe sono **bancali**: si scansiona solo il codice del pallet, i prelevati vanno in **baia**, e finito un DDT il sistema chiede se se ne carica un altro. Alla fine evade i documenti completi e lascia pendenti quelli a cui manca un bancale. La sessione si salva in `meta` e si riprende |
| `stampaEtichette.ts` | 204 | **2.19** — la maschera fra il pulsante e l'etichetta: **quale stampante** (si ricorda) e **quante copie** (tornano sempre a 1). In un file suo perché la chiamano in tre — l'unità di carico, la merce e, dalla 2.20, il bancale. Il riscontro dice **quale fatto sta mostrando**: inviata, oppure stampata |
| `ricerca.ts` · `destinatari.ts` · `archivio.ts` · `registro.ts` · `parametri.ts` | 227 · 226 · **286** · 191 · **287** | Ricerca in barra · rubrica DDT · **i cinque generi di documento — dalla 2.14 anche gli ordini di produzione chiusi**, e dalla 2.20 un secondo foglio sui DDT che portano bancali · registro movimenti · le quattro schede che sono un dato, **più i modelli di imballo** |
| `vista.ts` · `globale.d.ts` | 36 · 10 | Il tipo `Vista` e `$`/`$q` · `declare const App` |

> **`wipRegistro.ts` non esiste in `main`**: era della 2.3 ritirata.
> **`caricoSpedizione.ts` e' la ventiseiesima**, ed e' entrata con la 2.21.

**Chi ne aggiunge una** la scrive `.ts`, la tipa `Vista`, la importa in `app.ts`
e la mette nell'elenco del rientro. **La rete**:
`test/superficie-app.test.js` tiene i nomi che `App` esponeva prima
dell'estrazione e controlla che ogni `App.qualcosa` citato nell'indice o dentro
una stringa trovi a chi rispondere. **Non si tocca `superficie-app.dati.js` per
farlo tacere**: se suona, un metodo non è rientrato.

### Servizio — `server/`
| File | Righe | Ruolo |
|---|---:|---|
| `pathfinder-server.js` | ~380 | Express: rotte, SSE, sessione, TLS opzionale, la cartella dell'applicativo, avvio. Qui sta `const VERSION` |
| `lib/db.js` | 78 | **La facciata**: legge `PATHFINDER_PG` (variabile di macchina, poi `.env.local`), sceglie il driver. Variabile **vuota** = «no, SQLite», e batte il file |
| `lib/driver-base.js` | 318 | **TUTTA la logica del servizio dati, una volta sola per due database**: scritture, letture, filtri, transazioni, revisione e notifica, normalizzazione in maiuscolo. I driver portano solo i quattro gesti che un database sa fare. **`AsyncLocalStorage`, non un flag** |
| `lib/driver-sqlite.js` · `lib/driver-postgres.js` | 121 · 267 | `better-sqlite3`, `_migra`, backup a file · `pg`, il pool, la connessione fissata alla transazione, il riallineamento delle sequenze, `int8` decodificato a numero, e dalla 2.12.1 **l'attesa dell'avvio**: `_attendiIlServer`, `siRiprova`, `attesaPrima` — esportate apposta per essere provate da ferme |
| `lib/sql.js` | 259 | **TUTTO lo SQL, col dialetto come parametro.** `startsWith` è `substr(col,1,N) = ?` e **non** un `LIKE` |
| `lib/zpl.js` | 638 | **2.19 — l'etichetta.** Entrano un record, una stampante e un layout; esce una stringa ZPL. Nessun socket, nessun database, nessuno stato: si collauda senza avere una stampante sotto. Le barre le disegna `^BC` (il firmware), non `code128.ts` — la cifra di controllo non si riscrive due volte. **Non manda mai `^MN` `^MM` `^MD` `^JUS`**: sono la configurazione della macchina. Un layout più alto del supporto lo **rifiuta**, non lo tronca. **2.20**: i cataloghi di campi sono due — merce e bancale — e `disponi` prende il catalogo come parametro; `etichettaBancale` sta accanto alle altre due |
| `lib/stampa-zebra.js` | 431 | **2.19 — il socket**, ed è il solo posto del servizio che ne apra uno verso l'esterno. Porta in un elenco chiuso, indirizzo **risolto prima** e privato per forza, attesa di 3 s (senza, una stampante spenta blocca venti secondi), **una connessione per volta per stampante**. `statoStampante` chiede `~HQES`, perché la 9100 accetta i byte anche a carta finita |
| `lib/schema.js` · `lib/schema-postgres.js` | 297 · 133 | Tabelle e indici in **due funzioni separate**, con la migrazione in mezzo, più **`MAIUSCOLE`** · il DDL PostgreSQL dalla **stessa** dichiarazione, con `COLLATE "C"` su ogni colonna di testo (senza, `ORDER BY location_code` rimescola le corsie) |
| `lib/tls.js` | 96 | **2.26 — quale certificato, e chi bussa alla porta.** `decidiTls` legge l'ambiente e dice quale delle tre strade è dichiarata: PFX, coppia PEM, chiaro. Una dichiarazione a metà — `CERT` senza `KEY`, o le due strade accese insieme — è un **errore** e non un ripiego in chiaro: un servizio che parte in chiaro «perché il certificato non si leggeva» è il modo in cui un PIN finisce sulla rete senza che nessuno se ne accorga. `eSalutoTLS` guarda il primo byte, `0x16`, ed è quel che permette a HTTPS e al `301` di stare **sulla stessa porta**. Puro: non apre un socket, e si collauda da fermo. **2.29.1 — `scollegaTls`**: toglie da un ambiente le quattro dichiarazioni del certificato, e serve tanto su `process.env` quanto su una copia per `spawn`. Sta qui perché il difetto è nato qui: le due `PATHFINDER_TLS_*` di macchina, ereditate dai banchi, li facevano partire cifrati contro prove che parlano in chiaro |
| `crea-certificato.ps1` | — | **2.26 — il certificato, senza scaricare niente.** `New-SelfSignedCertificate` ed `Export-PfxCertificate`, che Windows ha già. Crea un'**autorità locale** e con quella firma il certificato del servizio: sui terminali si installa solo l'autorità, e alla scadenza `-Rinnova` non li tocca. Il SAN lo compone a mano — `2.5.29.17` con nomi **e IPv4**, perché `-DnsName` scriverebbe gli indirizzi come nomi e un browser che apre un indirizzo non accetta quella corrispondenza. Password del PFX a caso in una variabile di macchina, cartella leggibile da SYSTEM e amministratori soli, impronta SHA-256 del `.cer` stampata perché la si confronti prima di fidarsi |
| `installa-pathfinder.ps1` | — | **L'installer.** Nel pacchetto diventa `installa.ps1`. `-NonChiedere`, **`-Prova`**, `-Database`, `-SenzaMigrazione` |
| `installa-servizio.ps1` | — | Registra le due attività pianificate e le variabili, `PATHFINDER_PG` compresa. Da amministratore, **una volta**, dal sorgente o da `C:\Pathfinder\servizio` |
| `prepara-postgres.ps1` | — | Controlla PostgreSQL e prepara ruolo e database. **Il motore non lo installa e non lo scarica.** `-Prova` guarda e non tocca |
| `installa-versione.ps1` · `torna-indietro.ps1` · `backup-serale.ps1` | — | Disinstalla-reinstalla e materializza · scambia `corrente` e `precedente` (**solo l'applicativo**) · backup a caldo delle 20:00 |
| `migrazione/` | — | `migra-sqlite-postgres.js`, `audit.js`, `audit-sqlite.js`, `maiuscola-codici.cjs`, `LEGGIMI.md`. **Viaggia nel pacchetto dalla 2.7**: migra una COPIA e ricontrolla i conteggi tavolo per tavolo, e prima di copiare gira l'audit |
| `test/collaudo.js` · `collaudo-migrazione-1.4.js` · `collaudo-installazione.js` | 1.283 · 158 · — | **156** prove sul servizio (le ultime dodici sull'attesa dell'avvio di PostgreSQL, con orologio e sonno finti) · 8 sul cambio di schema · **43** sugli script di installazione (incluso l'installer in `-Prova`). **Dalla 2.29.1 la prima riga scollega le `PATHFINDER_TLS_*`**: senza, questo banco parte cifrato e le sue 156 prove parlano in chiaro — §7 |
| `test/collaudo-stampa.js` | 449 | **2.19-2.20 — 100 prove sulle etichette**, con una **finta Zebra** che ascolta sulla 9100 e racconta cosa le è arrivato. Le tre che contano: con la carta finita l'invio riesce lo stesso, `~HQES` lo dice, e cinque richieste insieme escono tutte e cinque. **Quel che non può provare** — barre lette da un lettore, etichetta dritta, calore — è la voce 83 |

### Collaudi — `test/`

**1.499 prove in 59 file** all'08/09 notte (una saltata). Fuori da `npm test`:
**156** sul servizio, **100** sulle etichette, **43** sull'installazione, **8**
sul cambio di schema. `ambiente.js` è il preambolo comune.

**Le tre nate dall'audit della 2.29.1**, e tutte e tre sono state verificate
**rimettendo il difetto**:
- `bancoNonEredita.test.js` (18) — nessun file che accende `pathfinder-server.js`
  eredita l'ambiente della macchina. **Cerca i file, non li elenca**: un banco
  nuovo senza la riga cade il giorno che nasce. Fissa anche perché `fetch`
  davanti a un `301` risponde 200 a un'altra domanda.
- `primoAdmin.test.js` (5) — nella creazione del primo Admin la **sessione sta
  fra** la scrittura dell'operatore e quella di `meta`. Guarda l'ORDINE e non
  l'esito: un esito si fa tornare verde anche spegnendo la finestra di primo
  avvio, che è il difetto sotto un'altra forma.
- `tastiFunzione.test.js` (10) — nessun tasto porta a due posti, nessuna scheda
  scrive a mano il proprio tasto, e chi ascolta la tastiera apre anche la
  sottoscheda.

Fuori da `test/` stanno i **tre** banchi automatici, che non girano con
`npm test`: **`banco/gerarchia.cjs`** (**40**, le cariche sul servizio — §5) e
**`banco/ciclo/gira.cjs`** (**47, tutte verdi** dal 01/09 — voci 70 e 71 chiuse;
dalla 2.16 **esce 1 se in quella corsa è stato alzato un difetto `grave`**, e in
quel caso tiene il verbale da parte invece di lasciarlo cancellare) e
**`banco/migrazione/dalla-1.4.cjs`** (**14**, il salto dal magazzino vero alla
beta su un database vuoto — voce 79).

Il **banco della schermata WIP** (§5) non è automatico: è un magazzino di
copia, degli ODP generati da lui e tre attrezzi da iniettare nella pagina.
Serve a guardare, e quel che ne esce si scrive qui.

**Nuovi con la 2.29**: `coperturaWip.test.js` (7, il riquadro letto come
stringa) e `vanoWipNonSiPreleva.test.js` (7, `build` con uno Store finto — è
la prima prova che fa girare `build` invece del solo comparatore). In
`wip.test.js` sono entrate **26** prove sulla copertura, di cui **quattordici
scritte per romperla**, e in `icone.test.js` le due che chiudono le falle
della rete della 2.27.

Fra i file: **`imballo` (26)** e **`bancale` (29)**, cresciuti con la 2.21 —
il modello appreso, le baie, il viaggio riletto dai documenti — e `documenti`,
che adesso prova anche il raggruppamento per partita ·
`serpentina` · `fefo` · `geometria` · `odp` · `anagrafica` ·
`conformita` · `cache` · `pacchetto` · `statistiche` · `compiti` · `misure` ·
`colli` · `parametri` · `documenti` · `auditMigrazione` · `maiuscole` · `sql` ·
**`driver`** · `dialogOspite` · `versioni` · **`giroOdp` (38)**.

- **`driver` gira LE STESSE PROVE SUI DUE DATABASE.** Ha guadagnato il suo costo
  alla prima corsa: quattro difetti che SQLite non poteva mostrare. Senza
  `PATHFINDER_PG_COLLAUDO` le prove PostgreSQL si dichiarano **saltate col
  motivo scritto**, invece di tacere.
- **Alcune prove leggono il SORGENTE invece di girare il codice, e non è un
  ripiego**: fissano regole che un DOM non c'è per verificare — una riga che
  nasce `hidden` si accende togliendo la classe, ogni causale di merce scrive le
  quantità, l'entrata nel vano WIP passa dal registro, i quattro posti del numero
  di versione, e il `return` muto di `#dlgOverlay` che non lasciava nessuna
  traccia osservabile.
- `schemaPostgres` gira a ogni `npm test` e serve a una cosa: che lo schema descriva le stesse ventuno collezioni che il
  servizio usa **oggi**.

---

## 10. API e variabili
| Famiglia | Rotte |
|---|---|
| **Applicativo** | `/` e `/app` → l'indice, **`no-cache`** · `/assets/:file` → gli assets, **`immutable` un anno**, col ripiego su `precedente` |
| **Aperte senza sessione** | `/api/health` · `/api/app-info` (le interroga l'installer, **prima** che esista un PIN) · `/api/auth/*`, che è la porta. `/api/auth/operatori` dà **il minimo**: sigla, nome, carica, «ha un PIN» |
| **Collezioni** | `GET/POST/PUT/PATCH/DELETE /api/c/:col[/:key]` · `/bulk` · `/count` · `/query` — **sessione richiesta dalla 2.11** |
| **Operazioni composte** | `/api/tx` · `/api/op/removeItem` · `/api/op/commitPickStop` · `/api/op/sampleItem` · `/api/op/moveUdc` · `/api/op/verifyPin` · `/api/op/hashPin` · `/api/op/stampaEtichetta` (`tipo`: **`item`**, **`udc`** o, dalla 2.20, **`pf`** — il bancale) · `/api/op/provaStampante`. `moveUdc` sposta l'unità e tutte le sue righe **in una transazione**, e rifiuta se nel vano d'arrivo la stessa chiave sta già fuori dall'unità |
| **Servizio** | `/api/load` · `/api/clear` · `/api/deleteWhere/:col` · `/api/backup` · `/api/events` (SSE) |
| **Colli** | `packs_out` è un elenco di `{da, quantita}` — la misura del collo e quanto ne esce; un numero solo significa «quel collo, intero». `packs_before` è il seme, come `qty_uom_before`. Con l'elenco, `qty` diventa facoltativo |
| Variabile di macchina | Valore |
|---|---|
| `PATHFINDER_PORT` | `4173` |
| `PATHFINDER_DB` | `C:\Pathfinder\data\pathfinder.db` (solo su SQLite) |
| **`PATHFINDER_APP_DIR`** | `C:\Pathfinder\app\corrente` — **si imposta una volta sola**: dopo, le versioni si scambiano sostituendo il contenuto di quella cartella |
| `PATHFINDER_APP_PREV` · `PATHFINDER_APP` | Il fratello `precedente` · il ripiego a file singolo, usato solo se `APP_DIR` è assente |
| **`PATHFINDER_PG`** | **Quale database.** Assente → SQLite. Presente → PostgreSQL con quella stringa. **Impostata VUOTA** → SQLite dichiarato, e batte `.env.local`. **Non sta nel repository** |
| `PATHFINDER_PG_POOL` · `_IDLE` · `_TIMEOUT` | Connessioni (10) · ms prima di chiudere una connessione ferma (30.000) · attesa per averne una (10.000). **`_IDLE` sta sotto la soglia del server apposta**: è il pool a doverle chiudere per primo |
| `PATHFINDER_PG_CA` | Il file della CA aziendale. **È un file, non un interruttore che spegne il controllo** |
| **`PATHFINDER_PG_COLLAUDO`** | **La stringa di connessione del database di collaudo.** Non si ripiega mai su `PATHFINDER_PG`, e il nome del database deve finire per `_collaudo` |
| **`PATHFINDER_COLLAUDO_PG`** | `1` fa girare `server/test/collaudo.js` contro PostgreSQL invece che su SQLite. **Vuole `PATHFINDER_PG_COLLAUDO` impostata**, e senza si ferma dicendolo |
| `PATHFINDER_HOST` | Su quale interfaccia si ascolta. Predefinito: tutte |
| `PATHFINDER_TOKEN` | La chiave di macchina, generata **una volta sola** dall'installazione: backup, installer, migrazione, collaudi |
| `PATHFINDER_BACKUP_ROOTS` | Stringe le destinazioni ammesse del backup, quando c'è |
| `PATHFINDER_TLS_CERT` / `_KEY` | Assenti → HTTP |
| `PATHFINDER_DEV_API` | Con chi parla `npm run dev`. Senza, parla col **servizio vero** |

**Si leggono all'avvio**: cambiate senza riavvio non hanno effetto.

---

## 11. Dove sta il resto
| Serve | Dove |
|---|---|
| Installare il servizio da zero, diagnosticare, backup | **[README.md](README.md) — in inglese, scritto sulla 2.16.** L'italiano è [README.it.md](README.it.md) ed è **fermo prima della 2.7** |
| Com'è fatto il servizio dati | [server/README.md](server/README.md) (inglese) · [server/LEGGIMI.md](server/LEGGIMI.md) (italiano, fermo alla 2.5) |
| Una riga per versione, dalla 1.4 alla 2.16 | [CHANGELOG.md](CHANGELOG.md) — in inglese |
| Che licenza ha | [LICENSE](LICENSE) — proprietaria, nessun diritto concesso a terzi |
| Versioni precedenti, loghi, etichette, file di prova, banco storico | `ARCHIVIO/` — e **non si cancella niente**: un archivio svuotato funziona una volta sola |
| Il ramo git della 2.3 ritirata | `ARCHIVIO/VERSIONI PRECEDENTI/Pathfinder 2.3 (NON FUNZIONALE - ritirata 25-08)/2.3-reparto-e-giro-conto.bundle` — storia completa, recupero provato |
| La storia: handoff e piani fino al 17/08/2026 | `ARCHIVIO/HANDOFF STORICI/` — **memoria, non istruzioni** |
| Cosa è stato archiviato e quando | `ARCHIVIO/archive-manifest.json` |
| La scheda tecnica per il team IT | `documenti/IT-TECH-SHEET.md` — **REP-IT-001 rev02**, 02/09, **bilingue italiano/inglese**. La rev01 sta in `ARCHIVIO\documenti superati\` |
| Come si disegna un'interfaccia da magazzino | `.claude/skills/erp-wms-frontend/SKILL.md`. **Se diverge da §8, vince §8** |
| Il driver PostgreSQL e la migrazione | `server/migrazione/README.md` (inglese) e `LEGGIMI.md` (italiano). **`server/azure/` non esiste dal 26/08**: è diventato quello — voce 26 |
| ~~Demo portatile su chiavetta~~ · ~~Sheet tecnico IT~~ | **NON ESISTONO PIÙ — voce 43**, e vanno riscritti |

**Il repository tiene tutto, tranne i segreti — 27/08.** Decisione di Andrea:
dentro `node_modules`, `ARCHIVIO`, `banco`, `consegna` — 4.211 file, ~250 MB.
«Si ricostruisce» vale finché qualcuno lo ricostruisce, e un file che sta su un
disco solo prima o poi non c'è più (voce 43).

> ⚠️ **CAMBIATA IL 02/09, e non perché fosse sbagliata.** Cambia il motivo per
> cui il repository esiste: va a un'analisi del team IT. Di **4.539 file
> tracciati, 2.865 erano dipendenze** (`node_modules/` più `server/node_modules/`),
> **716 erano dipendenze di versioni archiviate** dentro `ARCHIVIO/`, e 37 il
> pacchetto costruito. **Il codice di questo progetto era il 6%.** Un
> repository in cui il codice è il 6% non si legge, e nessuna prassi di
> costruzione lo accetta. Adesso i file tracciati sono **921**.
>
> **La ragione del 27/08 resta onorata da due parti.** `package-lock.json` è
> tracciato, ed è lui la garanzia vera — `npm ci` rimette le stesse identiche
> versioni, non «versioni compatibili». E una copia integrale sta fuori da git
> in `Desktop\Pathfinder-archivio-2026-09-01\dipendenze-2.16\`:
> `node_modules-2.16.zip` (2.865 file, 42 MB) e `consegna-2.16.zip` (37 file),
> col suo LEGGIMI. **I file restano tutti su disco**: è cambiato il
> tracciamento, non l'archivio.
>
> **Conseguenza buona:** `consegna/` non è più tracciata, quindi **una build
> non sporca più `git status`** — il prezzo che §11 dichiarava di pagare non si
> paga più.

**Restano fuori tre cose, e non per il peso**: i **file di database**, che portano `pin_hash` e `pin_salt`
accanto a nome e cognome di persone vere; **`.env.local`**, che porta utente e
password di PostgreSQL; e dal 31/08 i **codici di ripristino** della 2.13, che
si riconoscono dalla forma — venti caratteri in quattro gruppi da cinque.
**Git non dimentica**: un segreto spinto una volta va considerato bruciato.

> ⚠️ **E UNO CI ERA ENTRATO LO STESSO — voce 72, chiusa il 01/09.** La regola
> diceva «i file di database», il `.gitignore` diceva `*.db`, e un dump di
> PostgreSQL si chiama `.dump`: `banco/db/pathfinder-2026-08-27.dump` è entrato
> col commit che dichiarava di lasciare fuori i segreti, e dentro aveva
> `pin_hash`, `pin_salt` e i nomi. **Una regola scritta in prosa e un filtro
> scritto per estensione non sono la stessa regola**, e questo è stato il
> prezzo: `filter-repo`, push forzato, **tutti gli SHA cambiati**. Quel che non
> si disfà sta nella **voce 78**.

> ⚠️ **UNO DI QUEI CODICI STA IN `ARCHIVIO\` COME FILE DI TESTO**, col codice
> nel nome e nel contenuto, scritto il 28/08. **Non è mai entrato in git** e da
> oggi `.gitignore` lo tiene fuori per forma, senza nominarlo — nominarlo lo
> scriverebbe nel repository. **Va cancellato a mano**, e se era un codice vero
> va rigenerato da Configurazione → Operatori: il vecchio smette di valere
> nello stesso gesto.

**E dal 02/09 i documenti sono in due lingue.** `README.md` è **in inglese** e
scritto sulla 2.16, perché è quel che il team IT legge per primo; l'italiano
resta in `README.it.md`, **dichiarato fermo** — i suoi capitoli da 1 a 8 sono
precedenti alla 2.7 e descrivono ancora SQLite come unico database e
`installa-servizio.ps1` come installer. Stessa forma per il servizio
(`server/README.md` inglese, `server/LEGGIMI.md` italiano fermo alla 2.5) e per
la migrazione. **`server/LEGGIMI-pacchetto.txt` resta in italiano**: viaggia
dentro il pacchetto e lo legge chi installa in magazzino.

**Questo INDEX resta in italiano e resta il documento autorevole.** Non si
traduce: due copie di 2.500 righe divergono, e la seconda che diverge è quella
che qualcuno legge per sbaglio.

---

© Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group) · uso interno
