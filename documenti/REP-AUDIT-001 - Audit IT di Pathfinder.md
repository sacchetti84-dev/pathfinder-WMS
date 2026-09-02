# PATHFINDER — AUDIT IT DELLA REPOSITORY

**Codice:** REP-AUDIT-001  |  **Revisione:** **01**  |  **Data:** 02/09/2026

**Oggetto della verifica:** repository `pathfinder-WMS`, versione **2.17**, ramo `main`,
commit `0f522f5`, sulla macchina di **sviluppo**.

**Metodo:** verifica documentale e statica in sola lettura. Nessun file modificato,
nessun servizio avviato, nessun database interrogato. `npx tsc --noEmit -p tsconfig.json`
eseguito a scopo di riscontro: **0 errori**. I collaudi automatici non sono stati
lanciati, perché toccano i database di banco.

**Perimetro:** codice del client (`src/`, 41.086 righe TypeScript), codice del servizio
(`server/`), script di installazione PowerShell, collaudi (`test/`, `server/test/`,
`banco/`), configurazione di build, igiene del repository, documentazione di progetto, e
**la collocazione fisica dei dati sul disco della macchina di sviluppo**.

**Fuori perimetro:** la macchina di magazzino che gira la 1.4, l'infrastruttura di rete
aziendale, il test di penetrazione attivo, la revisione legale del trattamento dei dati
personali.

---

## Storico delle revisioni

| Rev. | Data | Modifiche |
|:--|:--|:---|
| **01** | **02/09/2026** | Prima emissione. Undici criticità numerate (C1–C10 con dieci voci minori), valutazione per area, piano di rientro in quattro fasi |

---

## Documenti di riferimento

| | |
|:---|:---|
| `documenti/IT-TECH-SHEET.md` | REP-IT-001 rev02 — scheda tecnica per il team IT, con undici limiti già dichiarati dall'autore |
| `INDEX.md` | Documento unico di progetto, 2.671 righe — stato, versioni, coda di lavoro, regole |
| `CHANGELOG.md`, `README.md`, `README.it.md` | Storia delle versioni e presentazione del progetto |

**Rapporto con la scheda tecnica.** La scheda REP-IT-001 dichiara **undici limiti noti**
prima che li trovi un revisore, ed è la ragione principale per cui questo audit parte da
una base di fiducia alta. Questa relazione **non li ripete**: si concentra su quello che
la scheda **non dice**, e lo segnala esplicitamente dove accade.

---

# 1. Valutazione complessiva

## **7,5 / 10 — buono, con due criticità gravi che non stanno nel codice.**

| Area | Voto | Motivazione |
|:---|:---:|:---|
| Qualità del codice | **8** | TypeScript in modalità `strict` con `noUncheckedIndexedAccess`, zero errori di tipo, zero `@ts-ignore`, quattordici `any` su 41.086 righe. Nessun JavaScript nel client |
| Collaudi | **8,5** | ~1.250 prove sul client in 44 file, 141 sul servizio, 43 sull'installazione, 47 sul ciclo di magazzino, 14 sulla migrazione dalla 1.4. Non è misurata la copertura, e le viste sono la parte scoperta |
| Sicurezza applicativa | **7** | Cookie di sessione `HttpOnly` + `SameSite=Strict`, PIN in `scrypt` con migrazione trasparente, freno sui tentativi, SQL sempre parametrico, gerarchia dei ruoli imposta dal servizio. Restano il traffico in chiaro (già dichiarato) e tre difetti non dichiarati |
| **Sicurezza dei dati a riposo** | **3** | 106 MB di database con impronte di PIN e nomi reali, più la stringa di connessione di produzione, dentro una cartella sincronizzata su un cloud personale |
| Architettura | **6,5** | `store.ts` concentra 4.252 righe e 257 metodi ed è importato da 28 viste su 30. 360 gestori `onclick` inline rendono impossibile una `Content-Security-Policy` |
| Igiene della repository | **6** | Pack git di 68,17 MB, 3.090 oggetti `node_modules` ancora nella storia, 655 file tracciati su 927 sono archivio |
| **Processo e automazione** | **4** | Nessuna integrazione continua, nessun linter, nessun controllo prima di un commit, nessuna scansione automatica delle dipendenze |
| Documentazione | **9,5** | Fuori scala rispetto alla media di mercato. INDEX, scheda IT bilingue, CHANGELOG, doppio README, e commenti nel codice che spiegano il *perché* e non il *cosa* |
| **Continuità del progetto** | **3** | Un solo autore umano su 294 commit. Nessuna seconda persona ha mai installato, aggiornato o riportato indietro il sistema |

### Il giudizio in una riga

La disciplina ingegneristica è **sopra la media di mercato** — build riproducibile bit per
bit, impronte verificate a ogni installazione, limiti noti scritti prima che li trovi
qualcun altro. Ma il rischio residuo non è nel codice: è nel **dove stanno i dati** e nel
**chi tiene in piedi il progetto**.

---

# 2. Criticità

Undici voci, ordinate per rischio. Ognuna dice il fatto misurato, la conseguenza, e se la
scheda tecnica la copre già.

---

## 🔴 C1 — Dati personali e credenziali di produzione dentro un OneDrive personale

**Gravità: critica. Non dichiarata nella scheda tecnica.**

### Il fatto

L'intero albero di lavoro sta in `C:\Users\sacch\OneDrive\Desktop\PROGETTI E CODING\`.
Dentro, misurato il 02/09/2026:

| Dove | Quanto | Che cosa contiene |
|:---|---:|:---|
| `MAPPER/banco/db/` | **88 MB** | Database di banco `.db` e `.dump` con `pin_hash`, `pin_salt`, nome e cognome di operatori reali |
| `MAPPER/server/data/` | **18 MB** | Database di lavoro del servizio, stessi campi |
| `MAPPER/ARCHIVIO/BANCO STORICO/db/` | (compreso sopra) | Dieci database storici, stessi campi |
| `MAPPER/.env.local` | 798 byte | Le **tre** stringhe di connessione PostgreSQL, compresa **`PATHFINDER_PG_PRODUZIONE`**, con utente e password in chiaro |
| `PROGETTI E CODING/warehouse-mapper-2026-08-09.json` | **4,8 MB** | Export completo con `pin_hash` |

In totale **25 file di database** e un export, per circa **106 MB** di dati che
contengono credenziali e dati identificativi di persone reali.

### Perché è grave

Il `.gitignore` di questo progetto è scritto meglio di quasi tutti quelli che si trovano
in un audit: ragiona per nome e non solo per estensione, spiega il perché di ogni regola,
e ha accanto un collaudo (`test/segretiFuori.test.js`) che fallisce se un segreto rientra.
La sua tesi è esplicita — *«un segreto spinto una volta va considerato bruciato»*, *«la
visibilità di un repository si cambia con un clic, un clone no»*.

**Ma difende git.** Gli stessi identici file vengono replicati da OneDrive a ogni
salvataggio: sul servizio cloud, nel suo cestino, e su ogni altro dispositivo collegato a
quell'account. Lo stesso ragionamento che ha giustamente tenuto i database fuori dal
repository si applica, parola per parola, a una cartella sincronizzata.

### L'aggravante

**L'account OneDrive di questa macchina è un account Microsoft personale, non il tenant
aziendale di Dietopack** (confermato dall'autore il 02/09/2026).

I dati in questione sono nome, cognome, sigla e ruolo di lavoratori identificati,
associati alle impronte delle loro credenziali di accesso; e il registro movimenti lega
ogni sigla a ogni singola operazione svolta in corsia, con l'ora — cioè a **dati di
attività lavorativa**. Su un account personale il titolare del trattamento non ha né
controllo né visibilità su dove finiscono, per quanto tempo restano, e chi altro può
raggiungerli.

Non è un rilievo che si chiude con un argomento tecnico. È il primo punto che solleva un
DPO o un auditor esterno, ed è anche l'unico di questa relazione che riguarda persone
terze e non il software.

### Rapporto con la scheda tecnica

Il **limite 10** della scheda parla delle impronte di PIN entrate per quattro giorni nella
**storia di git**, storia che è stata riscritta il 01/09. È un rilievo onesto e chiuso
correttamente. **Non parla dei 106 MB che stanno sul disco adesso**, che sono lo stesso
problema in una forma più grande e ancora aperta.

---

## 🔴 C2 — Bus factor uguale a uno

**Gravità: critica. Non dichiarata nella scheda tecnica.**

### Il fatto

294 commit. Un solo autore umano: 223 a nome «Andrea Sacchetti», 72 a nome
«sacchetti84-dev» — lo stesso account — e 10 di un agente. Tutta la conoscenza operativa
del progetto vive in `INDEX.md` (2.671 righe) e nella testa di una persona.

**Nessuna seconda persona ha mai installato, aggiornato o riportato indietro il sistema.**

### Perché è grave

Il magazzino di uno stabilimento alimentare dipenderà da un applicativo che una sola
persona sa costruire, installare, diagnosticare e riparare. È il rischio che un auditor
esterno scrive per primo nel suo verbale, prima di qualunque vulnerabilità: perché le
vulnerabilità hanno una correzione, e questa no.

L'INDEX mitiga molto — è scritto proprio per questo, e la sezione «Come non allucinare su
questo progetto» è una difesa consapevole contro esattamente questo scenario. **Ma un
documento non riavvia un servizio alle sei del mattino**, e nessuno ha mai provato a
seguirlo senza l'autore nella stanza.

---

## 🟠 C3 — Il corpo della richiesta si legge prima di controllare chi la manda

**Gravità: alta. Non dichiarata.**

### Il fatto

In `server/pathfinder-server.js`:

| Riga | Che cosa |
|---:|:---|
| **104** | `app.use(express.json({ limit: '256mb' }))` |
| **479** | `app.use('/api', ...)` — il guardiano che chiede la sessione |

Express esegue i middleware nell'ordine di registrazione. Il corpo della richiesta viene
quindi **letto, bufferizzato e parsato prima** che qualcuno chieda chi sta chiamando.

### La conseguenza

Chiunque raggiunga la porta 4173 — la rete interna, senza alcuna credenziale — può far
allocare al processo fino a **256 MB per richiesta**, e ricevere poi un 401. Poche
richieste in parallelo bastano a mandare il processo in memoria esaurita.

Il peso specifico è alto perché il servizio è il punto singolo su cui gira il magazzino, e
il progetto ha già pagato un fermo di una giornata intera per un avvio non riuscito
(28/08): non esiste un supervisore che lo rialzi da solo entro il turno.

### La ragione per cui il limite è così alto

È corretta e va conservata: un import completo dell'anagrafica pesa davvero. La correzione
non è abbassare il limite, ma **spostarlo dopo il guardiano** e lasciarlo alto solo sulle
rotte che ne hanno bisogno.

---

## 🟠 C4 — L'anagrafica del personale risponde senza sessione

**Gravità: alta. Non dichiarata.**

### Il fatto

`GET /api/auth/operatori` (riga 1215) è, per costruzione, fuori dal guardiano: tutte le
rotte sotto `/api/auth/` lo sono, perché servono a entrare. Per ogni operatore attivo
restituisce:

`op_id` · `initials` · **`first_name`** · **`last_name`** · `role` · `pin_set` · `rec_set`

### La conseguenza

Chiunque sia sulla rete interna ottiene, senza autenticarsi:

1. **l'elenco nominativo del personale di magazzino**, con nome, cognome e ruolo — che è
   divulgazione di dati personali;
2. **quali account sono Admin**;
3. **quali Admin hanno un codice di ripristino** (`rec_set`), cioè quali hanno una seconda
   via d'ingresso.

È esattamente la mappa che serve a scegliere il bersaglio giusto per un PIN a sei cifre.

Il freno sui tentativi è corretto ma è **per operatore** (cinque tentativi, poi sessanta
secondi): con l'elenco in mano, il numero di tentativi utili si moltiplica per il numero
di operatori. E il freno vive in memoria — un riavvio del servizio lo azzera.

### Perché non si chiude e basta

La rotta serve davvero: disegna la maschera di identificazione, che deve mostrare chi c'è.
La correzione è **ridurla a quello che quella maschera usa** — le sigle — e far arrivare
nome e cognome dopo l'ingresso.

---

## 🟠 C5 — La sessione non scade mai

**Gravità: alta. Scelta consapevole, ma con un caso non considerato.**

### Il fatto

`sessioni` è una `Map` in memoria. Il campo `ultimoUso` viene **scritto a ogni richiesta e
non viene mai letto da nessuno**. Non esiste né una scadenza assoluta né una per
inattività: una sessione muore solo quando il processo si riavvia.

### La ragione dichiarata, che resta valida

Decisa il 27/08: un token che scade a metà turno è un token che scade in corsia, con i
guanti addosso e un terminale in mano. È giusto, e non va rovesciato.

### Il caso che non è stato considerato

**Fra un turno e l'altro.** Un terminale condiviso lasciato acceso il venerdì sera è
ancora dentro il lunedì mattina, con l'identità di chi l'ha usato per ultimo — e
quell'identità **firma i movimenti a registro**, che secondo la scheda §8.3 è *la firma
GMP*. Un movimento firmato da chi non l'ha fatto è un problema di tracciabilità prima
ancora che di sicurezza.

Il campo per risolverlo **esiste già ed è aggiornato**: manca solo chi lo legga.

---

## 🟡 C6 — Nessuna automazione a difesa delle regole

**Gravità: media, ma è il moltiplicatore di C2.**

### Il fatto

Non esiste `.github/`. Nessuna integrazione continua, nessun linter configurato, nessun
hook che giri prima di un commit.

Le ~1.250 prove esistono, sono verdi, e sono di buona qualità. Ma **nulla impedisce a un
commit di entrare senza averle lanciate**, e nulla impedisce a `npm run check` di restare
rosso per una settimana senza che nessuno se ne accorga.

### La conseguenza

Tutte le regole del capitolo 8 dell'INDEX — quelle intitolate «Le regole che non si
discutono» — sono oggi affidate alla memoria di una persona sola.

Combinata con C2, questa è la criticità che trasforma un progetto **disciplinato** in un
progetto **fragile** il giorno dopo che l'autore si ferma. È anche la più economica da
chiudere di tutta la relazione.

---

## 🟡 C7 — Il servizio non lascia traccia

**Gravità: media. Rilevante per la conformità, non solo per la sicurezza.**

### Il fatto

38 chiamate a `console.*` nel servizio. **Nessuna scrittura su file**, nessuna rotazione,
nessuna scrittura nell'Event Log di Windows. Il processo gira come SYSTEM in sessione 0 —
e un commento nel codice stesso lo dice: *«la sua console non la legge nessuno»*.

### La conseguenza

Non esiste alcun registro di:

- accessi riusciti e non riusciti;
- blocchi per tentativi esauriti;
- risposte 401 e 403;
- errori 500 e loro causa;
- avvii e arresti del servizio.

Dopo un incidente **non c'è modo di ricostruire cosa è successo**.

Il `mov_log` non copre questo: registra i movimenti di merce riusciti, non i tentativi di
accesso al sistema.

### Il risvolto di conformità

Il progetto dichiara di operare in regime GMP e cita l'Annex 11, che richiede un audit
trail dei sistemi computerizzati. **L'assenza di un log di sicurezza lato servizio è una
lacuna che un auditor di qualità rileva con certezza**, e che è molto più economica da
chiudere prima di una visita che durante.

---

## 🟡 C8 — La storia di git pesa 68 MB, e il 94% non era codice

**Gravità: media. Igiene, con un impatto diretto sulla consegna all'IT.**

### Il fatto

La pulizia del 02/09 ha tolto `node_modules/` e `consegna/` dal tracciamento, ed è stata
la decisione giusta, presa per la ragione giusta (*«un repository in cui il codice è il 6%
non si legge»*).

**Ma git non dimentica.** Misurato oggi:

| | |
|:---|---:|
| Dimensione del pack | **68,17 MB** |
| Oggetti `node_modules` ancora raggiungibili nella storia | **3.090** |
| File tracciati oggi | 927 |
| — di cui in `ARCHIVIO/` | **655 (71%)** |

L'archivio contiene un bundle da 7,8 MB, fogli Excel, ed export JSON da 4–5 MB l'uno.

### La conseguenza

Chi clona la repository per l'analisi **scarica comunque tutto**: la pulizia migliora la
leggibilità dell'albero di lavoro, non il peso del clone.

E c'è un rilievo di merito: **l'archivio in git non è versionamento, è deposito**. Git
serve a ricostruire uno stato passato del codice; conservare i pacchetti costruiti è il
lavoro di un deposito di artefatti.

---

## 🟡 C9 — `store.ts` è un oggetto-dio

**Gravità: media. Non un difetto attivo, ma il costo di ogni intervento futuro.**

### Il fatto

| | |
|:---|---:|
| Righe | **4.252** |
| Metodi | **257** |
| Viste che lo importano | **28 su 30** |

E il rovescio: dei ~15.000 righe di `src/ui/views/`, la copertura è affidata a
`superficie-app.test.js`, che ha **due prove** e verifica soltanto che i nomi dei metodi
esistano e che ogni `App.qualcosa` citato nel sorgente trovi a chi rispondere.

È una rete utile — e l'autore ne dichiara esplicitamente la ragione — ma è una rete contro
i *nomi persi in un'estrazione*, non contro i comportamenti sbagliati.

### La conseguenza

Ogni modifica al nucleo tocca potenzialmente tutta l'interfaccia, e nessun collaudo isola
le viste. Non è urgente. **Diventa più caro ogni mese**, e va riconosciuto adesso che il
progetto è ancora piccolo abbastanza per contenerlo.

---

## 🟢 C10 — Rilievi minori

Impatto reale ma contenuto. In ordine di interesse.

| | Il fatto | La conseguenza |
|:--|:---|:---|
| **a** | Il guardiano `VIETATI_NEI_CODICI` (`server/lib/schema.js:255`) copre soltanto i campi elencati in `MAIUSCOLE` | **Nessun collaudo verifica che ogni campo interpolato dentro un `onclick` sia in quell'elenco.** Oggi la corrispondenza è esatta e la difesa tiene; il giorno che una vista ci mette un campo libero, il doppio contesto HTML+JavaScript si riapre in silenzio. È la rete che manca sotto la difesa più intelligente del progetto |
| **b** | `Validate` (`src/modules/validate.ts`) gira **solo nel client** | Un chiamante che parli direttamente col servizio scrive a database record che l'interfaccia non avrebbe mai accettato. È integrità del dato, non sicurezza — ma la scheda §8.4 lascia intendere che il controllo sia in «un punto solo», e quel punto è nel browser |
| **c** | Backup e database **sullo stesso disco**; rotazione spenta; nessuna copia fuori macchina | Un guasto disco porta via i dati **e i loro backup insieme**. La scheda dichiara «stessa macchina» (limite 4) e «rotazione spenta» (limite 7), ma non mette insieme le due cose |
| **d** | Nessun `Dependabot`, nessun `npm audit` schedulato | `xlsx` 0.18.5 è un rischio noto e formalmente accettato (limite 3). **La prossima vulnerabilità non sarà nota**, e oggi non c'è niente che la annunci |
| **e** | `sessioni` e `tentativi` sono `Map` mai potate | Crescita illimitata della memoria. Irrilevante con venti operatori, non con duecento |
| **f** | 23 file `.out` e un `.log` di banco sono tracciati in git | Rumore in una repository che va a revisione esterna |

---

# 3. Quello che va detto a favore

Un audit che elenca solo i difetti è un audit disonesto. Queste cose sono **sopra la media
del software commerciale** e vanno protette da qualunque intervento successivo.

| | |
|:---|:---|
| **Build riproducibile bit per bit** | Verificata due volte sullo stesso albero, con la stessa impronta |
| **Integrità del rilascio** | Manifesto con impronta SHA-256 file per file, controllata dall'installer, e `/api/app-info` che dice sempre cosa sta girando davvero. La regola «servita vuol dire installata» è **applicata**, non dichiarata |
| **Via di ritorno reale** | `precedente/` porta la versione prima, e la disinstallazione è collaudata (43 prove) |
| **PIN in `scrypt`** | Con migrazione trasparente da SHA-256 al primo accesso riuscito, e l'impronta che non esce mai dal servizio |
| **Ruoli imposti dal servizio** | 40 prove che usano `fetch` e cookie veri, non stub — compresa la regola che l'ultimo Admin non può togliersi da solo, **verificata rossa** rimettendo il difetto |
| **SQL sempre parametrico** | In entrambi i driver, con i campi filtrabili validati contro l'elenco degli indici: nessuna concatenazione di input |
| **Backup verificato prima di essere dichiarato buono** | `pg_dump` riletto con `pg_restore --list`, e **cancellato se non si rilegge**. Pochissimi lo fanno |
| **`.gitignore` che ragiona per nome** | Con la lezione della voce 72 scritta dentro, e un collaudo che fallisce se un segreto rientra |
| **Undici limiti dichiarati prima del revisore** | Incluso quello che fa più male. È la cosa che più di ogni altra fa guadagnare fiducia in un audit esterno |
| **Commenti che spiegano il perché** | Ogni difesa nel codice porta accanto il caso reale che l'ha resa necessaria, con la data. È documentazione che non invecchia perché sta dove sta il codice |

---

# 4. Piano di rientro

Quattro fasi, ordinate per rapporto fra rischio tolto e costo. **Nessuna è stata eseguita
al momento dell'emissione di questa relazione**: sono raccomandazioni, e la decisione su
quando aprirle spetta all'autore e all'azienda.

---

## Fase 0 — Contenimento — *oggi, ~2 ore, zero codice*

Nessuna di queste voci richiede una release, un collaudo o un fermo del servizio.

1. **Portare l'albero di lavoro fuori da OneDrive.** Spostare `PROGETTI E CODING\` su un
   percorso non sincronizzato (`C:\Sviluppo\` o simile). Poi **verificare che la copia
   remota sia sparita davvero**: OneDrive tiene un cestino, e va svuotato.

2. **Cambiare la password di `PATHFINDER_PG_PRODUZIONE`.** È stata in un file
   sincronizzato su un account personale: va considerata compromessa, applicando lo stesso
   criterio che il `.gitignore` applica ai segreti spinti in git. Le altre due, se i
   database sono locali, sono meno urgenti — ma tanto vale farle nello stesso giro.

3. **Spostare i 106 MB di database** (`banco/db/`, `server/data/`,
   `ARCHIVIO/BANCO STORICO/db/`) in un deposito cifrato fuori sincronizzazione, e
   `warehouse-mapper-2026-08-09.json` dal Desktop insieme a loro. Cancellare quelli non più
   necessari: il capitolo 8 dell'INDEX vieta di cancellare **movimenti dal registro di
   produzione**, non copie di banco duplicate.

4. **Rinnovare i PIN degli operatori** presenti nei dump usciti dalla macchina. Era già
   previsto dal limite 10 per la vicenda git; il perimetro adesso è più largo.

5. **Aggiungere un limite 12 alla scheda IT** che dichiari dove stanno i dati di prova e
   con quale protezione. La scheda va a un team IT esterno, che questa domanda la farà.

**Come si verifica:** `.env.local` fuori da qualunque percorso OneDrive; nessun `.db`,
`.dump` o export sotto l'albero sincronizzato; cestino di OneDrive svuotato; il servizio
riparte con la password di produzione nuova.

---

## Fase 1 — Le tre correzioni al servizio — *una release, ~mezza giornata*

Piccole, indipendenti fra loro, chiudono C3, C4 e C5. Vanno in una sola versione con le
prove accanto, come tutte le altre di questo progetto.

| | Dove | Che cosa |
|:--|:---|:---|
| **1.1** | `pathfinder-server.js` righe 104 e 479 | **Invertire l'ordine**: il guardiano prima di `express.json`. In alternativa `express.json` con un limite basso di serie (256 kB) e il limite alto montato solo sulle rotte di import, dopo il guardiano |
| **1.2** | `pathfinder-server.js:1215` | Togliere `first_name`, `last_name` e `rec_set` dalla risposta senza sessione. La maschera mostra le sigle; il nome per esteso arriva dopo l'ingresso. Se in corsia la sigla non basta, l'alternativa è limitare la rotta agli indirizzi della rete locale — e comunque senza `rec_set` |
| **1.3** | `pathfinder-server.js:388` | **Leggere `ultimoUso`**: scadenza per inattività configurabile, di serie a fine turno (es. 10 ore), con potatura pigra a ogni `chiSei`. **Non** una scadenza assoluta a metà turno: la ragione per cui era stata esclusa resta valida |

**Come si verifica:** tre prove nuove verdi in `server/test/collaudo.js` — 401 su corpo
grande senza sessione, assenza dei campi nominativi nella risposta pubblica, sessione
rifiutata dopo la finestra di inattività. `npm test` e `npm run check` invariati a zero.
Installazione verificata da `/api/app-info` come sempre.

---

## Fase 2 — Le difese che lavorano da sole — *~1 giornata*

Chiude C6 e parte di C10. **È la fase che vale di più contro C2**, perché sostituisce con
una macchina quello che oggi regge sulla memoria di una persona.

1. **Integrazione continua su GitHub Actions.** Su ogni push:
   `npm ci` → `npm run check` → `npm test` → `node server/test/collaudo.js`. Nient'altro,
   per ora. Il segno di spunta verde su un pull request è la prima cosa che un IT esterno
   chiede quando domanda «come sapete che una versione è buona».

2. **`npm audit` schedulato settimanale e Dependabot** limitato agli aggiornamenti di
   sicurezza. **Le versioni fisse di `dexie` e `xlsx` restano fisse**: l'obiettivo è
   *sapere*, non aggiornare a sorpresa — il commento in `package.json` va rispettato.

3. **Il collaudo che chiude C10-a.** Scandisce `src/ui/views/*.ts`, estrae ogni argomento
   interpolato dentro un `onclick`, e fallisce se il campo corrispondente non è
   nell'elenco `MAIUSCOLE` di `server/lib/schema.js`. Da verificare **rosso** rimettendo il
   difetto, come si fa già per la gerarchia dei ruoli.

4. **Linter minimo** (ESLint, poche regole: niente `eval`, niente `innerHTML` fuori dalle
   viste, niente import ciclici). Non uno stile: un guardrail.

---

## Fase 3 — Il debito strutturale — *settimane, da pianificare*

Nessuna di queste è urgente. Tutte diventano più care ogni mese che passa.

1. **C2 — La seconda persona.** Non è codice: è che **qualcun altro installi Pathfinder da
   zero** seguendo solo la scheda IT e l'installer, senza l'autore nella stanza, e scriva
   dove si è fermato. È il collaudo della documentazione, ed è la sola prova che
   funzioni. **Da fare prima del passaggio del magazzino vero alla beta, non dopo.**

2. **C7 — I log.** Un `pathfinder-servizio.log` con rotazione a N giorni, che registri
   avvii, arresti, 401 e 403, blocchi per tentativi ed errori 500 con l'ora. Nessuna
   libreria nuova se non serve: `fs.appendFile` e un contatore di byte bastano, e restano
   nello spirito del progetto.

3. **C8 — La repository.** Due gesti distinti: **(a)** portare `ARCHIVIO/` fuori da git, in
   un deposito di artefatti o un ramo orfano, tenendo in `main` solo il codice;
   **(b)** valutare un `git filter-repo` per i 3.090 oggetti `node_modules` nella storia.
   Il secondo riscrive la storia — **si fa una volta sola, con backup, e non alla vigilia
   della consegna all'IT**.

4. **C9 — `store.ts`.** Non una riscrittura: una **regola di non peggioramento**. Il file
   non cresce più; ogni nuova funzionalità nasce in un modulo suo. Poi, con calma, si
   estraggono i domini già coesi (giacenze, UDC, WIP) uno per volta, ognuno con i suoi
   collaudi scritti **prima** dello spostamento.

5. **C10-c — I backup.** Una destinazione di rete o un disco esterno come copia
   secondaria, e la rotazione accesa con il periodo che l'azienda deciderà. È già nella
   lista delle cose chieste all'IT (limite 7): va solo trasformata in una decisione presa.

6. **C10-b — La validazione lato servizio.** Portare le regole di `Validate` accanto a
   `controllaCodice` in `server/lib/schema.js`, dove già vive il guardiano dei codici. Un
   posto solo, come è già stato fatto per le maiuscole.

---

# 5. Quadro di verifica

| Fase | La prova che è chiusa |
|:---|:---|
| **0** | `.env.local` fuori da OneDrive; nessun database o export nell'albero sincronizzato; cestino svuotato; password di produzione cambiata e servizio ripartito |
| **1** | Tre prove nuove verdi nel collaudo del servizio; `npm test` e `npm run check` invariati; `/api/app-info` che dichiara la versione nuova |
| **2** | Un pull request con il segno di spunta verde; `npm audit` che gira da solo; il collaudo `onclick` verificato **rosso** rimettendo il difetto |
| **3** | Una seconda persona che ha installato da zero e ha scritto il verbale; un file di log che esiste e ruota; `git count-objects -vH` sotto i 10 MB; `store.ts` che non è cresciuto |

---

# 6. Conclusione

Questo progetto è documentato meglio del 95% del software commerciale che passa da un
audit, e la sua catena di rilascio — build riproducibile, impronta verificata, via di
ritorno collaudata — è di qualità industriale.

**Le due criticità peggiori non sono errori di programmazione.** Sono le due cose che una
persona sola, che lavora bene e in fretta, non può darsi da sé:

- **un posto sicuro dove tenere i dati** (C1), che si chiude oggi, in due ore, senza
  toccare una riga di codice;
- **qualcun altro che sappia farlo funzionare** (C2), che non si chiude in un giorno e per
  questo va aperta subito.

Tutto il resto di questa relazione è manutenzione ordinaria.

---

*Fine documento — REP-AUDIT-001 rev01 — 02/09/2026*
