# HANDOFF — Pathfinder

**Documento di passaggio di consegne per la prossima conversazione**
Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 08/08/2026 · Rev. 01 — prima versione client-server

---

## 1. Stato attuale

| Voce | Valore |
|---|---|
| Versione corrente | **Pathfinder 1.0** |
| Client | `pathfinder-1.0.html` (~1,18 MB, 21.725 righe) |
| Servizio dati | `server/` — Node + Express + SQLite (473 righe il server, 322 l'accesso al db) |
| Versione precedente | `warehouse-mapper-v2_8_0.html` — **conservata, intatta** |
| Schema database | **v7** (da v6: nuovo store `disposal_archive`) |
| Dipendenze CDN | Dexie 3.2.4 · SheetJS 0.18.5 — invariate, servono solo in modalità locale |
| Dipendenze server | `better-sqlite3` ^13.0.3 · `express` ^4.19.2 |
| Stato collaudo | **29 prove server + ~80 prove funzionali eseguite in browser reale, tutte verdi** |

Il numero è ripartito da 1.0 perché è ripartito il conto: fino alla v2.8.0 c'era uno
sviluppo, da qui c'è un applicativo in uso in magazzino.

---

## 2. L'architettura, in una riga

L'applicativo sceglie da solo dove vivono i dati, in base a **come è stato aperto**:

| Aperto come | Adapter | Database |
|---|---|---|
| `http://…` servito dal servizio | `RemotePersistence` | `server/data/pathfinder.db` |
| doppio clic sul file (`file://`) | `LocalPersistence` | IndexedDB, come sempre |

Il punto di scelta è **una funzione sola**, in coda a `LocalPersistence`:

```javascript
const Persistence = (() => {
  const forzato = new URLSearchParams(location.search).get('db');
  if (forzato === 'local')  return LocalPersistence;
  if (forzato === 'remote') return RemotePersistence;
  const servito = location.protocol === 'http:' || location.protocol === 'https:';
  return servito ? RemotePersistence : LocalPersistence;
})();
```

`Store`, la cache, l'interfaccia e i documenti **non sanno quale dei due hanno sotto** e
non devono saperlo. Le differenze sono dichiarate dai capability flag
(`supportsRealtime`, `supportsLocalBackup`, `supportsRemoteOps`) e interrogate, non
indovinate.

> Questa giunzione **non l'ho creata io**: esisteva dal refactor v2.6.0, con scritto
> accanto *«in Fase 3 questa riga diventerà una scelta a runtime»*. I criteri di ricerca
> erano già dichiarativi `{field, op, value}` con la motivazione *«una funzione non
> attraversa la rete»*, e `update()` era già separato da `put()` perché *«contro un
> server trasformerebbe una PATCH in una PUT»*. Chi ha scritto quel refactor stava
> preparando esattamente questo passaggio.

### Le tre famiglie di endpoint, e perché sono tre

- **`/api/c/…`** — operazioni generiche del contratto. Non sanno niente di magazzino.
- **`/api/tx`** — lotto di scritture tutto-o-niente. Serve alle cinque transazioni del
  client che sono sole scritture; l'adapter le **bufferizza** dentro `transaction()` e le
  spedisce insieme, quindi i punti di chiamata sono rimasti invariati.
- **`/api/op/…`** — operazioni che leggono, decidono e riscrivono nello stesso respiro.
  **Devono stare sul server**: fra il momento in cui un terminale legge «ci sono 40 colli»
  e quello in cui scrive «adesso sono 35», un altro può averne presi 10.

---

## 3. Cosa è stato fatto in questa sessione

Quattro interventi, in ordine.

### A — v3.0.0: due merge e un documento che vale come documento
- **Carico/Scarico unificati.** Da sette card a cinque. Il carico è invariato riga per
  riga; lo scarico passa da ricerca → selezione ubicazione FEFO → **tappa guidata** →
  tripla scansione di verifica → colli e **motivazione obbligatoria**. Il motore della
  tappa è quello del percorso di prelievo (v2.5.0), estratto in `_scanBlock` invece che
  duplicato.
- **Verbale di smaltimento** archiviato su `disposal_archive` e ristampabile.
- **Resi e Spedizioni unificati.** Resta la sola card Spedizioni: la differenza è la
  **causale di trasporto**, che decide se il movimento a registro è `MOV.RET` o
  `MOV.SHIP`. I DDT di reso pendenti pre-v3.0.0 restano leggibili (ripiego su `kind`).
- **DDT formalmente conforme**: testata da 4 a ~20 campi, mittente configurabile,
  filigrana di bozza sui pendenti, pesi calcolati dall'anagrafica.

### B — Tipografia MD3 e armonizzazione dei documenti
- **560 dichiarazioni di corpo, 43 gradini arbitrari → 0.** Tutti sui 15 ruoli MD3, ora
  dichiarati per intero. La base era `body { font-size: 13px }` mentre i token sono in
  `rem` (radice 16px): **due scale parallele**, ora una sola (Body Medium).
- I quattro documenti — DDT, verbale, cartello NC, report di prelievo — hanno la **stessa
  testata** (marchio, mittente, natura e numero) e le stesse tre fasce **20% / 70% / 10%**,
  misurate. Cambia solo il blocco d'identificazione e il corpo.

### C — Rinomina in Pathfinder 1.0
Titolo, boot, header, footer, `_appVersion`, nome file, sottotitolo del marchio
(«WAREHOUSE MAPPER» → «GESTIONE MAGAZZINO»).

### D — Il database esce dal browser
Server Node + SQLite, avvio automatico come attività pianificata, feed SSE per il
riallineamento fra terminali, blocco a schermo intero se il servizio non risponde.

---

## 4. Decisioni prese, da non rimettere in discussione

1. **Niente lavoro offline.** Se il servizio non risponde l'app **si ferma e lo dice**, a
   schermo intero. Scelta esplicita dell'utente: niente code da risincronizzare, nessun
   dato che diverge. Un operatore che continua a scansionare col servizio morto sta
   buttando via il turno.
2. **Un solo database condiviso**, più terminali in rete. La guardia `BroadcastChannel`
   (v2.8.0 [H6]) copre solo le schede di uno stesso browser e **resta**, ma il vero
   arbitro fra terminali è il server.
3. **Attività pianificata, non servizio Windows nativo.** Node non dialoga col gestore dei
   servizi e servirebbe un binario di terze parti (NSSM): su un PC di magazzino è il file
   che l'antivirus blocca alle sette di mattina. L'attività pianificata parte
   all'accensione, riparte se cade, gira senza login — ed è già dentro Windows.
4. **Documento in JSON con colonne materializzate.** Nello schema SQLite si indicizzano
   solo i campi che Dexie indicizzava; il resto vive nella colonna `data`. Normalizzare
   tutto rimetterebbe la catena che IndexedDB non aveva: ogni campo nuovo un `ALTER TABLE`
   e un fermo del servizio.
5. **I documenti di stampa restano in `pt` e `mm`.** MD3 è un sistema per lo schermo; la
   carta non ha un rem.
6. **`@page { size: A4; margin: 0 }`** è necessario perché «il 20% dell'area stampabile»
   sia una percentuale di una grandezza nota. Gli altri documenti ne guadagnano un margine
   deterministico di 12mm invece di quello di sistema.
7. **I dati del mittente non sono cablati nel file.** Stanno in Configurazione → DDT e
   Documenti. Un applicativo che serve un magazzino non può pretendere che chi ci lavora
   sappia dove mettere le mani nell'HTML.

---

## 5. Trappole in cui sono già caduto (non ricascarci)

### 5.1 — L'Edit tool e le sequenze `\uXXXX`
Il file contiene sequenze **letterali** tipo `icon: '⛔'` (non il carattere). Le
sostituzioni testuali che le attraversano falliscono senza spiegazione. Rimedio: sostituire
per **intervallo di righe** con `awk`, oppure ancorare l'edit su righe che non le
contengono.

### 5.2 — La guardia multi-scheda blocca i test
Due schede aperte sullo stesso applicativo mettono la seconda in **sola lettura** e le
scritture falliscono con un avviso. Non è un guasto: è `[H6]`. Nei test va premuto
«Lavora da qui», oppure si tiene aperta una scheda sola.

### 5.3 — Il servizio gira come SYSTEM
Se è installato come attività pianificata, **non si può fermare** da una shell normale
(«Accesso negato»). Per collaudare una modifica al server, avviare una seconda istanza su
un'altra porta:
```bash
PATHFINDER_PORT=4174 PATHFINDER_DB=/tmp/prova.db node pathfinder-server.js
```

### 5.4 — Modificare i file del server non basta
Node carica il codice all'avvio: dopo ogni modifica a `server/` **il servizio va
riavviato**, altrimenti continua a rispondere col codice vecchio (mi ha ingannato una
volta: gli endpoint nuovi rispondevano «endpoint inesistente»).

### 5.5 — `better-sqlite3` e la compilazione nativa
Va tenuto a una versione che pubblichi il **binario già compilato** per il Node installato.
La 11 non ne ha per Node 24: npm ripiega su `node-gyp`, che su Windows pretende Visual
Studio, e l'installazione fallisce. Con la 13 sono 15 secondi di download.

### 5.6 — Non popolare il database di lavoro durante i collaudi
**Errore mio, costato un blocco d'accesso.** Ho creato operatori di prova via API (senza
PIN) nel database che poi è andato in uso. Per i test usare sempre un `PATHFINDER_DB`
temporaneo.

---

## 6. Due difetti trovati e chiusi (per capire il perché delle correzioni)

### 6.1 — Il blocco d'accesso da leader senza PIN
`getActiveLeaders()` contava i Team Leader **che esistono**, non quelli che possono
entrare. Con soli leader privi di PIN il wizard di primo accesso non partiva (parte solo
quando non c'è **nessun** leader) e la maschera chiedeva un PIN mai impostato. Fuori tutti.

Il file dichiarava tre righe sopra: *«Non c'è combinazione di stati che chiuda fuori
l'utente»*. Ce n'era una.

**Correzione:** nuova `getUsableLeaders()` (attivi **e con PIN**), usata nei tre punti dove
serve poter davvero autenticarsi: portone, rinnovo PIN, autorizzazione operazioni sensibili.
`getActiveLeaders()` resta dov'era per impedire di declassare l'ultimo leader — è una
domanda diversa.

### 6.2 — «PIN non verificabile in questo contesto»
I browser concedono `crypto.subtle` solo in **contesto sicuro**: `https`, `file://`,
`localhost`. Un terminale su `http://192.168.x.x` non lo è, e lì quella funzione **non
esiste**. L'app, correttamente, si rifiutava di fingere una verifica e degradava alle sole
iniziali.

**Correzione:** calcolo e verifica del PIN spostati **sul servizio**, dove il contesto è
sempre sicuro (`/api/op/hashPin`, `/api/op/verifyPin`). Formato dell'impronta **identico**
— SHA-256 di `salt:pin` — quindi i PIN già impostati restano validi in entrambe le
direzioni: verificato. Aggiunto un freno a 5 tentativi / 60 secondi.

`buildPinFields()` mantiene la stessa firma: i quattro punti che impostano un PIN non
cambiano di una riga. È voluto — un endpoint «imposta il PIN» avrebbe costretto a creare
prima l'operatore senza PIN e completarlo dopo, riaprendo proprio lo stato del §6.1.

---

## 7. Aperto — da fare

| # | Cosa | Perché | Peso |
|---|---|---|---|
| 1 | **Dati reali del mittente** in Configurazione → DDT e Documenti | Finché mancano, i DDT escono con l'avviso «documento non conforme». Servono ragione sociale, indirizzo, P. IVA, C.F., REA, contatti | 5 min, solo dati |
| 2 | **HTTPS con certificato interno** | Su `http` il PIN attraversa la rete in chiaro. Su LAN aziendale di norma si accetta, ma va chiuso | ~30 min |
| 3 | **Schede grafico del cruscotto tagliano ~6px** in fondo alla legenda | **Non è una regressione**: verificato identico a 13px e a 14px. Dipende dal ridimensionamento a codice degli SVG | mezz'ora, rischio basso |
| 4 | Conferma **elenco causali di trasporto** | Ora nove di serie, mai validate con l'utente | 5 min |
| 5 | **Backup automatico serale** del `.db` | Esiste `POST /api/backup`; manca l'attività pianificata che lo chiami | 10 min |
| 6 | Popolare `weight_net_kg` / `pieces_per_pack` in anagrafica | Senza, peso e pezzi del DDT restano da compilare a mano | import Excel |

---

## 8. Come si collauda

```bash
# server — 29 prove, database usa-e-getta
cd server && npm test

# client — controllo sintattico del blocco <script>
S=$(grep -n "^<script>" pathfinder-1.0.html | tail -1 | cut -d: -f1)
E=$(grep -n "^</script>" pathfinder-1.0.html | tail -1 | cut -d: -f1)
sed -n "$((S+1)),$((E-1))p" pathfinder-1.0.html > /tmp/c.js && node --check /tmp/c.js
```

Le prove funzionali del client si eseguono nel browser: aprire l'applicativo, premere
«Lavora da qui» se compare la fascia di sola lettura, e lanciare gli script di prova dalla
console. Le prove che contano davvero sono tre:

1. **Contesa fra due terminali** — due schede, stesso lotto: uno passa, l'altro viene
   respinto con un messaggio leggibile, la giacenza non va sotto zero.
2. **Riavvio del servizio con l'app aperta** — blocco, sblocco automatico, dati intatti.
3. **Contesto non sicuro** — togliere `crypto.subtle` dalla console e verificare che il
   PIN funzioni comunque.

---

## 9. Convenzioni del progetto (rispettarle)

1. **I commenti spiegano il PERCHÉ, mai il cosa.** Lo stile della casa è: cosa faceva
   prima, cosa fa ora, e la ragione. Il changelog in testata è la memoria del progetto ed è
   ciò che ha permesso di non rompere niente in questa sessione.
2. **Nessun `font-size` in rem fuori dai token MD3.** Un corpo scritto a mano è un gradino
   in più che nessuno ha deciso.
3. **Niente dipendenze nuove** senza motivo forte: l'applicativo è un file solo, offline.
4. **Nessuna cancellazione automatica di record.** La purge è solo manuale, con export
   preventivo (v2.0.1 [B8]).
5. **Un documento si RILEGGE, non si ricostruisce.** Le ristampe partono dallo snapshot
   archiviato: `pick_archive`, `disposal_archive`, il mittente congelato nel DDT.
6. **Italiano** in tutto ciò che l'utente legge, commenti compresi.

---

## 10. Vincoli permanenti

- Uso interno Dietopack S.r.l. / Naturacare Group. Copyright Andrea Sacchetti su ogni file.
- Tracciabilità GMP: ogni movimento porta la sigla dell'operatore identificato.
- Tenuta del dato a **sei anni** (300-500 movimenti/giorno → 650k-1,1M record).
- Il marchio Naturacare non si adatta al tema: verde `#94BC47`, blu `#21305A`, sempre.
- GDPR: nessun dato personale oltre nome, cognome e iniziali degli operatori; nessuna
  telemetria; nessuna richiesta di rete verso l'esterno.
