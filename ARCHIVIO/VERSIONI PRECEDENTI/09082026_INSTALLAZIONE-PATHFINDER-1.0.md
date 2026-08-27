# Pathfinder 1.0 — installazione

Il database non sta più dentro il browser: sta in un file sulla macchina, e un
servizio lo serve ai terminali di magazzino.

Si installa **su una macchina sola** — quella che resta accesa. Sui terminali non
si installa niente: si apre un indirizzo.

---

## Prima di cominciare

| Serve | Dove |
|---|---|
| Una macchina che resti accesa | il PC dell'ufficio magazzino, o un server già in casa |
| Node.js LTS | <https://nodejs.org> — versione **LTS**, installazione standard |
| La cartella `MAPPER` copiata sulla macchina | con dentro `pathfinder-1.0.html` e `server/` |

Sui terminali serve solo un browser aggiornato (Chrome o Edge).

> **Nota sulla versione di Node.** Il servizio usa `better-sqlite3`, che va tenuto
> a una versione con il binario già compilato per il Node installato. Con Node 24
> serve `better-sqlite3` 13 o superiore — è già scritto così nel `package.json`.
> Se un domani aggiornate Node e l'installazione fallisce parlando di `node-gyp`,
> è questo il motivo.

---

## 1 — Installare il servizio

Sulla macchina che ospiterà il database, apri **PowerShell come amministratore**
(tasto destro sull'icona → *Esegui come amministratore*) e:

```powershell
cd "C:\percorso\della\cartella\MAPPER\server"
.\installa-servizio.ps1
```

Lo script fa tutto da solo:

1. controlla che Node ci sia;
2. installa le dipendenze;
3. apre la porta **4173** sul firewall per la rete aziendale e privata;
4. registra l'avvio automatico all'accensione, con riavvio se cade;
5. avvia il servizio e verifica che risponda.

Alla fine stampa due indirizzi:

```
  SERVIZIO ATTIVO
  database      C:\...\server\data\pathfinder.db

  Su questa macchina:      http://localhost:4173/
  Dagli altri terminali:   http://192.168.1.50:4173/
```

**Annota il secondo.** È quello che serve ai terminali.

Se vuoi una porta diversa: `.\installa-servizio.ps1 -Porta 8080`

---

## 1-bis — Dopo un aggiornamento del servizio

Se sostituisci i file in `server\`, il servizio **continua a girare col codice
vecchio** finché non lo riavvii:

```powershell
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
```

Il file `pathfinder-1.0.html` invece basta ricaricarlo nel browser (Ctrl+F5).

---

## 2 — Preparare i terminali

Su ogni terminale di magazzino:

1. apri il browser;
2. vai all'indirizzo annotato (`http://192.168.1.50:4173/`);
3. mettilo come **pagina iniziale**;
4. opzionale ma consigliato: menu di Chrome → *Salva e condividi* → *Installa
   come app*. Diventa un'icona sul desktop e si apre senza barra degli
   indirizzi, che su un terminale con lettore barcode è quello che vuoi.

Non c'è nient'altro da installare.

### Stampa senza finestra di conferma (opzionale)

Ogni stampa apre l'anteprima di Chrome con *Stampa* e *Annulla*. **Nessuna
pagina web può sopprimerla**: è il browser a decidere, non l'applicativo. Su un
terminale che stampa cartelli NC e DDT tutto il giorno sono due clic di troppo a
documento.

Si toglie avviando Chrome in modalità stampa diretta. Tasto destro sul
collegamento → *Proprietà* → in fondo al campo **Destinazione**, dopo le
virgolette, aggiungere uno spazio e:

```
--kiosk-printing
```

Il campo diventa così:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=http://192.168.1.50:4173/
```

Da quel momento il foglio esce **subito sulla stampante predefinita**, senza
anteprima e senza conferma.

Due avvertenze, perché la comodità ha un prezzo:

- la stampante predefinita di quel terminale dev'essere quella giusta, e va
  verificata: non c'è più una finestra che lo mostri prima di stampare;
- se la destinazione predefinita è *Salva come PDF*, si aprirà comunque il
  «Salva con nome» di Windows. Impostare una stampante vera.

Vale per il collegamento che si modifica: gli altri modi di aprire Chrome
continuano a mostrare l'anteprima.

---

## 3 — Prima configurazione

Dal primo terminale, in quest'ordine:

1. **Configurazione → Operatori** — crea almeno un Team Leader con il suo PIN.
   Senza operatori identificati non si registra nessun movimento.
2. **Configurazione → Siti e Zone** — crea il sito e le zone. Le ubicazioni si
   generano da sole dalla struttura (corsie, campate, livelli).
3. **Configurazione → DDT e Documenti** — inserisci i dati del mittente:
   ragione sociale, indirizzo, P. IVA. **Finché mancano, i DDT si stampano ma
   escono con l'avviso che il documento non è conforme.**
4. **Configurazione → Anagrafica Articoli** — importa da Excel. Se nel foglio
   metti anche le colonne `Peso_Netto_Collo` e `Pezzi_Per_Collo`, i DDT
   calcolano peso e pezzi da soli.

---

## 3-bis — Ho già lavorato in locale: come porto i dati sul servizio

Se hai cominciato aprendo il file con un doppio clic (`file://`), i dati sono
nell'**IndexedDB di quel browser, su quel PC, in quel profilo**. Non sono
persi: si travasano sul servizio con un export e un import.

### La procedura

1. **Sul PC dove hai lavorato**, apri l'applicativo **come hai sempre fatto**
   (doppio clic sul file). Deve partire in locale: nel piè di pagina di
   *Configurazione → Dati e Backup* il motore dev'essere IndexedDB.
2. **Configurazione → Dati e Backup → 📤 Esporta tutto (JSON)**. Salva il file.
3. **Chiudi quella finestra.** Non lavorarci più: da adesso il magazzino vero è
   sul servizio, e due copie che divergono sono il problema che il servizio
   esiste per evitare.
4. **Su un terminale**, apri l'indirizzo del servizio (`http://192.168.1.50:4173/`).
5. **Configurazione → Dati e Backup → 📥 Importa da JSON**, scegli il file.
6. Il dialogo riconosce che il database è vuoto e propone **«Importa TUTTO»**.
   È il pulsante giusto: premilo.

Fine. Il pacchetto viene **verificato prima** di essere scritto (conteggi di
controllo dichiarati nel file) e va sul servizio in **una sola transazione**:
o passa tutto, o non passa niente. Non esiste lo stato a metà.

> **Non scegliere il MERGE per una migrazione.** Il merge importa solo siti,
> zone, articoli e giacenze: lascia fuori registro movimenti, quarantene, DDT,
> verbali, report di prelievo, **anagrafica operatori** e dati del mittente.
> Senza operatori nessuno può entrare né registrare movimenti: il magazzino
> sembra importato ed è inutilizzabile. Su un database vuoto l'applicativo ora
> propone da solo l'importazione completa e dice cosa il merge lascerebbe
> indietro, ma vale la pena saperlo.

### Cosa viaggia e cosa no

Viaggiano: siti e zone, anagrafica articoli, giacenze, stati delle ubicazioni,
registro movimenti, quarantene, DDT, verbali, report di prelievo, anagrafica
operatori e **configurazione documentale** (i dati del mittente: senza, ti
ritroveresti i DDT che escono non conformi).

**I PIN restano validi.** Nel file c'è l'impronta, non il PIN: il formato è lo
stesso — SHA-256 di `sale:pin` — sia che l'abbia calcolata il browser sia che
l'abbia calcolata il servizio. *Verificato: un'impronta calcolata dal browser
viene accettata da `/api/op/verifyPin`.* Nessuno deve rifare il proprio codice.

Non viaggiano, e vanno rifatte sul terminale: le preferenze di quel dispositivo
(audio, vibrazione, correzione layout scanner) e la cartella di backup su
OneDrive. Sono impostazioni della postazione, non del magazzino.

### Migra presto, non tardi

C'è un tetto, ed è bene conoscerlo prima di sbatterci contro. L'import viaggia
in **un solo corpo HTTP**, e il servizio ne accetta **256 MB**. Un movimento
pesa circa **324 byte** misurati, quindi:

| Storico | Peso dell'import | Esito |
|---|---|---|
| 6 mesi (~65.000 mov.) | ~20 MB | tranquillo |
| 1 anno (~130.000 mov.) | ~40 MB | tranquillo |
| 3 anni (~650.000 mov.) | ~200 MB | ci sta, ma di misura |
| 6 anni (~1.100.000 mov.) | ~340 MB | **rifiutato** |

Tradotto: travasare dopo qualche settimana o qualche mese di uso locale non ha
alcun problema. Il tetto arriva intorno ai **due o tre anni** di storico, e a
quel punto conviene comunque non essere più in locale.

### Se lo storico è troppo grande

Si spezza in due, e **il database di destinazione dev'essere vuoto**:

```javascript
// dalla console del browser (F12), con l'app APERTA DAL SERVIZIO
const p = JSON.parse(await (await fetch('/percorso/del/file.json')).text());
const registro = p.mov_log;
delete p.mov_log; delete p._counts.mov_log;

await Persistence.clear('mov_log');        // ← PASSAGGIO OBBLIGATORIO, vedi sotto
await Store.importAll(p, 'overwrite');

for (let i = 0; i < registro.length; i += 20000) {
  await Persistence.bulkAdd('mov_log', registro.slice(i, i + 20000).map(({_id, ...r}) => r));
}
await Store.reloadCache();
```

**Perché l'azzeramento esplicito.** Una collezione *assente* dal pacchetto viene
**lasciata stare**, non svuotata: è la regola [H4] della v2.8.0, voluta perché
un backup parziale non cancelli sei anni di movimenti che non contiene. Qui però
il registro è assente di proposito, e senza `clear` i movimenti già presenti
resterebbero e quelli caricati a blocchi si **sommerebbero** ad essi.
*Verificato: senza l'azzeramento si ottengono record doppi; con l'azzeramento il
conteggio finale coincide.*

---

## 4 — Il backup

Il database è **un file**: `server\data\pathfinder.db`.

Per la copia usa l'endpoint, non il copia-incolla:

```powershell
Invoke-RestMethod -Uri http://localhost:4173/api/backup -Method Post `
  -ContentType 'application/json' -Body '{"dir":"D:\\backup-pathfinder"}'
```

Copia il file **a caldo** e in modo coerente, mentre il servizio lavora.

> **Non copiare il file a mano mentre il servizio è acceso.** SQLite tiene un
> giornale a parte: copiare solo il `.db` mentre qualcuno scrive porta via un
> database rotto, e te ne accorgi il giorno che ti serve.

Per farlo tutte le sere, crea un'attività pianificata con quel comando.

---

## 5 — Manutenzione

```powershell
# stato
Get-ScheduledTask -TaskName 'Pathfinder - Servizio dati'

# riavvio
Stop-ScheduledTask  -TaskName 'Pathfinder - Servizio dati'
Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'

# collaudo (database usa-e-getta, non tocca quello di lavoro)
cd server ; npm test

# rimozione del servizio (il database resta)
.\installa-servizio.ps1 -Disinstalla
```

---

## Se qualcosa non va

**I terminali mostrano «Servizio dati non raggiungibile».**
È il comportamento voluto: senza servizio non si registra nulla, e l'app lo dice
invece di lasciar scansionare a vuoto. Controlla che la macchina sia accesa e
riavvia il servizio. Le finestre si sbloccano da sole appena torna.

**Da un terminale non si apre, dalla macchina sì.**
È il firewall o l'indirizzo. Prova `ping 192.168.1.50` dal terminale; se
risponde, ricontrolla la regola creata dallo script.

**L'indirizzo IP cambia ogni tanto.**
Chiedi all'IT un indirizzo fisso per quella macchina, oppure usa il nome:
`http://nome-del-pc:4173/`.

**L'installazione fallisce parlando di `node-gyp` o Visual Studio.**
La versione di `better-sqlite3` non ha il binario per il tuo Node. Aggiorna la
dipendenza all'ultima e rilancia.

**«PIN non verificabile in questo contesto — identificazione ridotta alle
iniziali».**
Succedeva sui terminali collegati per indirizzo IP (`http://192.168.x.x`): i
browser concedono `crypto.subtle` solo in **contesto sicuro**, cioè `https`,
`file://` o `localhost`. Fuori da lì la funzione non esiste e l'app, invece di
fingere una verifica, rinunciava al PIN.

**Risolto**: il calcolo e la verifica del PIN avvengono ora **sul servizio**, dove
il contesto è sempre sicuro. Se vedi ancora questo messaggio, il servizio sta
girando con il codice vecchio: riavvialo (vedi §1-bis).

Il formato dell'impronta non è cambiato — SHA-256 di `salt:pin` — quindi **i PIN
già impostati restano validi**: nessuno deve rifarli.

> **Una nota onesta.** Con la verifica sul servizio il PIN attraversa la rete, e
> su `http` semplice viaggia in chiaro: chi ha accesso alla rete di reparto e sa
> come si fa può leggerlo. Su una LAN aziendale è un rischio che di norma si
> accetta. La risposta completa è servire in **https** con un certificato interno;
> se vi serve, si fa.

---

## Cosa cambia rispetto a prima

| | Prima (file locale) | Ora (servizio) |
|---|---|---|
| Dove stanno i dati | IndexedDB, dentro il browser | `pathfinder.db`, sulla macchina |
| Più terminali | ognuno il suo magazzino | uno solo, condiviso |
| «Cancella dati di navigazione» | **portava via tutto** | non tocca niente |
| Backup | export JSON a mano | copia del file, a caldo |
| Se manca la corrente al server | — | il magazzino si ferma |
| Due operatori sullo stesso lotto | nessun controllo possibile | il secondo viene respinto |

**Il vecchio modo continua a funzionare.** Aprendo `pathfinder-1.0.html` con un
doppio clic, l'app usa IndexedDB come sempre: utile per una prova o per lavorare
su un portatile scollegato. L'app sceglie da sola in base a come è stata aperta,
e non c'è modo di sbagliarsi.
