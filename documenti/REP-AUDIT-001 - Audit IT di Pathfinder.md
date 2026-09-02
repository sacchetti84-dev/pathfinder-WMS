# PATHFINDER — AUDIT IT DELLA REPOSITORY

**Codice:** REP-AUDIT-001  |  **Revisione:** **02**  |  **Data:** 02/09/2026

**Oggetto della verifica:** repository `pathfinder-WMS`, versione **2.18**, ramo `main`,
commit `2e60869`, sulla macchina di **sviluppo**.

**Metodo:** verifica documentale e statica in sola lettura, più l'esecuzione delle prove
automatiche del progetto. `npm run check` a **0 errori**; `npm test` **1.227 verdi, 1
saltata**; collaudo del servizio **156 su 156**; installazione **43 su 43**; migrazione
**8 su 8**.

**Perimetro:** codice del client (`src/`, 41.086 righe TypeScript), codice del servizio
(`server/`), script di installazione PowerShell, collaudi, configurazione di build, igiene
del repository, documentazione di progetto, e la collocazione fisica dei dati sulla
macchina di sviluppo.

**Fuori perimetro:** la macchina di magazzino che gira la 1.4, l'infrastruttura di rete
aziendale, il test di penetrazione attivo, la revisione legale del trattamento dei dati
personali.

---

## Storico delle revisioni

| Rev. | Data | Modifiche |
|:--|:--|:---|
| 01 | 02/09/2026 | Prima emissione, sulla **2.17**. Valutazione **7,5/10**, undici criticità numerate, piano di rientro in quattro fasi |
| **02** | **02/09/2026** | **Ri-audit sulla 2.18.** C1 e C2 sono **rischi accettati dall'autore** e passano nella scheda IT come limiti 12 e 13. **C3, C4, C5, C6, C7, C9 e C10 sono chiusi**, ognuno con la sua prova verificata rossa. C8 chiuso **in parte, per scelta**. Valutazione **8,5/10** |

---

## Documenti di riferimento

| | |
|:---|:---|
| `documenti/IT-TECH-SHEET.md` | REP-IT-001 **rev03** — scheda tecnica per il team IT, **tredici** limiti dichiarati |
| `CHANGELOG.md` | La voce **2.18** descrive ogni correzione di questa relazione |
| `INDEX.md` | Documento unico di progetto — stato, versioni, coda di lavoro, regole |

---

# 1. Valutazione

## **8,5 / 10** — da 7,5 della rev01.

| Area | rev01 | **rev02** | Che cosa è cambiato |
|:---|:---:|:---:|:---|
| Qualità del codice | 8 | **8** | Invariata, ed era già alta. In più gli errori di parsing del corpo tornano JSON invece della pagina HTML di Express con lo stack |
| Collaudi | 8,5 | **9** | +19 prove sul servizio, +6 sul client, e **tre categorie nuove** di regole imposte da una prova. Resta non misurata la copertura |
| Sicurezza applicativa | 7 | **8,5** | **C3, C4 e C5 chiusi**, ognuno con la sua prova. Restano il traffico in chiaro (limite 1, decisione dell'IT) e l'assenza di CSP (architetturale, dichiarata) |
| Sicurezza dei dati a riposo | 3 | **6** | I file stanno dov'erano, ma il rischio è **dichiarato, motivato e con una condizione di riapertura scritta** (limite 12), i dati del personale sono fittizi, e la stringa di produzione è uscita da `.env.local`. Da rischio ignoto a rischio governato |
| Architettura | 6,5 | **7** | `store.ts` non cresce più, e adesso è una prova a dirlo. I 360 gestori inline restano, e con loro l'impossibilità di una CSP |
| Igiene della repository | 6 | **6,5** | Undici file di rumore tolti dal tracciamento. **Pack ancora a 68,17 MB e 3.090 oggetti `node_modules` nella storia: per scelta** |
| Processo e automazione | 4 | **8,5** | Da niente a: **integrazione continua** su ogni push, **Dependabot** sui soli avvisi di sicurezza, `npm audit` informativo, **tre regole di progetto imposte da una prova** |
| Documentazione | 9,5 | **9,5** | Era già fuori scala. Scheda IT a rev03, CHANGELOG 2.18, questa relazione |
| Continuità del progetto | 3 | **5** | La CI esegue le prove al posto della memoria di una persona, e il limite 13 dice **come si verifica** (una seconda persona installa da zero). Ma la persona è ancora una |

### Il giudizio in una riga

**Tutto quello che restava aperto adesso o è chiuso con una prova, o è una decisione
scritta con la firma di chi l'ha presa.** È la differenza fra un progetto che ha dei
rischi e un progetto che non sa di averli — e per un audit esterno è la differenza che
conta.

---

# 2. Stato delle criticità della rev01

| # | Criticità | Stato |
|:--|:---|:---|
| **C1** | Dati e credenziali su OneDrive personale | 🔵 **Rischio accettato** — limite 12 della scheda IT |
| **C2** | Bus factor uguale a uno | 🔵 **Rischio accettato** — limite 13 della scheda IT |
| **C3** | Il corpo si legge prima dell'autenticazione | 🟢 **Chiuso** |
| **C4** | Anagrafica nominativa senza sessione | 🟢 **Chiuso** |
| **C5** | La sessione non scade mai | 🟢 **Chiuso** |
| **C6** | Nessuna automazione a difesa delle regole | 🟢 **Chiuso** |
| **C7** | Il servizio non lascia traccia | 🟢 **Chiuso** |
| **C8** | 68 MB di storia, 71% archivio | 🟡 **Chiuso in parte, per scelta** |
| **C9** | `store.ts` è un oggetto-dio | 🟢 **Contenuto** — non cresce più |
| **C10** | Sei rilievi minori | 🟢 **Cinque chiusi**, uno chiuso in modo diverso da come era stato proposto |

---

## 🔵 C1 e C2 — i due rischi accettati

Non sono stati "corretti": sono stati **decisi**, e la decisione è di chi ha titolo per
prenderla. Restano scritti nella scheda che va al team IT, con la motivazione e con la
condizione che li riapre — che è la forma in cui un rischio accettato vale qualcosa.

**C1 → limite 12.** La copia di lavoro sulla macchina dello sviluppatore è un fatto del
mestiere. I dati del personale in quei file sono **fittizi, inventati per le prove**;
backup e informazioni aziendali non sono distribuiti. *Si riapre il giorno che sulla
macchina di sviluppo entra un export del magazzino vero.*

**C2 → limite 13.** All'accettazione del progetto in azienda intervengono altre figure a
supporto. *Il collaudo vero resta una seconda persona che installa Pathfinder da zero
seguendo solo la scheda e l'installer, e scrive dove si è fermata — prima del passaggio
del magazzino vero alla beta.*

Una cosa è stata fatta comunque, ed è di codice: **`PATHFINDER_PG_PRODUZIONE` è uscita da
`.env.local`**, che già dichiarava nella sua prima riga di tenere la stringa di produzione
in una variabile di macchina. Una copia comoda è la copia che finisce in un backup.

> **Una raccomandazione che resta, e non costa niente:** la password di quel ruolo
> PostgreSQL è stata in un file di testo dentro una cartella sincronizzata. Cambiarla è
> un gesto di dieci secondi che chiude la domanda invece di lasciarla aperta.

---

## 🟢 C3 — chiuso: il corpo si legge dopo il guardiano

**Com'era.** `express.json({ limit: '256mb' })` a riga 104, guardiano della sessione a
riga 479. Express esegue nell'ordine di registrazione: chiunque raggiungesse la porta
senza credenziali faceva allocare al processo un quarto di giga per richiesta, e solo
dopo si prendeva il 401.

**Com'è.** Il parser è sceso **sotto** il guardiano (riga 547 contro 598). Il tetto da 256
MB vive ora solo sulle quattro rotte che importano un magazzino intero; tutto il resto sta
a 2 MB. Un corpo troppo grande o illeggibile risponde **JSON con una spiegazione**, non
più la pagina HTML di Express, che fuori da `production` ci metteva dentro lo stack.

**La prova.**
- `server/test/collaudo.js` — un corpo da 3 MB senza sessione prende **401**, non 413 e
  non 200; la stessa mole passa su una rotta di import con la chiave di macchina; fuori da
  quelle prende 413, e il 413 è JSON.
- `test/regole.test.js` — legge il sorgente e fallisce se qualcuno rimette il parser prima
  del guardiano. **Verificata rossa** rimettendolo.

---

## 🟢 C4 — chiuso: l'anagrafica pubblica non porta nomi

**Com'era.** `GET /api/auth/operatori` — che risponde senza sessione, e deve, perché
disegna la maschera d'ingresso — restituiva `first_name`, `last_name`, `role` e `rec_set`
di ogni operatore attivo. Chiunque sulla rete otteneva l'elenco nominativo del personale
con i ruoli, e sapeva **quali Admin avessero un codice di ripristino**.

**Com'è.** Escono `op_id`, `initials`, `role`, `pin_set`. La sigla è già stampata su ogni
documento e su ogni riga di registro: non è un segreto, ed è quello che l'operatore cerca
nella lista. Nome e cognome arrivano **dopo** l'ingresso. La maschera del PIN smarrito
elenca tutti gli Admin e lascia che sia il servizio a rifiutare un codice sbagliato.

**La prova.** Tre nel collaudo del servizio, sulla risposta vera; una in
`test/regole.test.js`, sul sorgente, perché è lì che il campo tornerebbe. **Verificata
rossa** rimettendo `first_name`.

**Residuo dichiarato.** Sigla e ruolo restano visibili senza sessione: è intrinseco a una
maschera di identificazione a PIN.

---

## 🟢 C5 — chiuso: la sessione scade per inattività

**Com'era.** `ultimoUso` veniva scritto a ogni richiesta dalla 2.11 e **non lo leggeva
nessuno**. Una sessione moriva solo al riavvio del processo.

**Com'è.** Dodici ore di inattività — un turno più margine —, `PATHFINDER_SESSIONE_ORE`
per cambiarle, potatura pigra a ogni richiesta più una passata periodica che tiene piccola
la mappa (chiude anche **C10-e**). La chiave di macchina è esente: non è una sessione, ed
è l'unico modo che l'installer e il backup serale hanno di parlare col servizio.

**La ragione del 27/08 non è stata rovesciata**, ed è giusto così: un token che scade a
metà turno scade in corsia, con i guanti addosso. Il caso che mancava era **fra un turno e
l'altro** — il terminale acceso il venerdì sera che il lunedì mattina firma ancora i
movimenti con l'identità di chi l'ha usato per ultimo.

**La prova.** La sessione viene aperta davvero, `ultimoUso` portato indietro di tredici
ore, e si verifica il 401, la cancellazione dalla mappa, e che la chiave di macchina passi
lo stesso.

---

## 🟢 C6 — chiuso: le difese lavorano da sole

`.github/workflows/collaudo.yml` — su ogni push e ogni pull request: `npm ci`,
`npm run check`, `npm test`, il collaudo del servizio, il collaudo dell'installazione.
`npm audit` come passo **informativo**, che non fa fallire la corsa: `xlsx` 0.18.5 è un
rischio già accettato (limite 3), e una corsa sempre rossa è una corsa che nessuno guarda.

`.github/dependabot.yml` — **solo avvisi di sicurezza**. `dexie` e `xlsx` restano fisse: il
commento in `package.json` dice che aggiornarle è una decisione, non un effetto
collaterale, e questa configurazione lo rispetta.

`test/regole.test.js` — **tre regole di progetto che vivevano nella memoria di una persona
sola**, adesso imposte da una prova. Sono le stesse tre di C3, C9 e C10-a.

> **Niente ESLint, ed è una scelta.** Un linter porta una catena di dipendenze grande
> quanto il progetto per imporre tre regole. Le stesse tre girano dentro `npm test`, dove
> girano tutte le altre garanzie, e non aggiungono un pacchetto da aggiornare, collaudare
> e spiegare all'IT.

---

## 🟢 C7 — chiuso: il servizio lascia traccia

`server/lib/registro-servizio.js`, senza librerie: `fs.appendFileSync` e un contatore di
byte.

| | |
|:---|:---|
| Registra | avvii e arresti con versione e database aperto · 401 e 403 con rotta e ragione · blocchi del freno sui tentativi · errori 500 · esiti dei backup · corpi rifiutati per dimensione |
| **Non registra mai** | PIN, impronte, corpi delle richieste, stringhe di connessione. L'unica stringa di connessione che passa è quella di `descrizione`, che la password la nasconde già |
| Rotazione | 5 MB, dieci file tenuti: il registro ha un **tetto noto** su disco, che su una macchina con un disco solo è l'unica proprietà che conta |
| Se il disco è pieno | fallisce in silenzio. Un registro che ferma il magazzino è peggio di nessun registro |

**La prova.** Dopo un 401 il file esiste, contiene `servizio.avvio` e `auth.401`, e **non
contiene** il PIN usato, né il cookie di sessione, né le parole `pin_hash`/`pin_salt`.

---

## 🟡 C8 — chiuso in parte, e la parte che manca è una decisione

**Fatto.** Undici file di rumore — ventitré `.out` e un `.log` di banco, catture di console
che si rigenerano lanciando la corsa — sono usciti dal tracciamento. I file restano sul
disco.

**Non fatto, per scelta di Andrea:**

| | Stato |
|:---|:---|
| `ARCHIVIO/` tracciato — **655 file su 921** | Resta. La decisione del 02/09 scritta nel `.gitignore` — *«un file che sta su un disco solo prima o poi non c'è più»* — non si rovescia |
| Pack a **68,17 MB**, **3.090 oggetti `node_modules`** ancora nella storia | Resta. Un `git filter-repo` riscrive la storia e cambia tutti gli SHA: si fa una volta sola, con un backup, **e non alla vigilia della consegna all'IT** |

**Il rilievo resta quindi aperto e dichiarato:** chi clona per l'analisi scarica 68 MB, di
cui la maggior parte non è codice di questo progetto. È una scomodità, non un rischio.

---

## 🟢 C9 — contenuto: `store.ts` non cresce più

4.252 righe, 257 metodi, importato da 28 viste su 30. Non è cambiato — e non doveva:
questa non è una riscrittura, è una **regola di non peggioramento**.

Una prova conta le righe e fallisce se le supera. Il numero sta nel collaudo e non in un
commento, così che alzarlo sia un gesto **deliberato e visibile nel diff**, e non l'effetto
collaterale di una giornata di lavoro.

L'estrazione dei domini già coesi — giacenze, UDC, WIP — resta lavoro da pianificare, uno
per volta, con i collaudi scritti **prima** dello spostamento.

---

## 🟢 C10 — i minori

| | Stato | |
|:--|:---|:---|
| **a** | 🟢 **Chiuso** | La prova che mancava c'è: ogni campo interpolato dentro un gestore inline dev'essere coperto da `VIETATI_NEI_CODICI`. **Otto eccezioni, ognuna con la sua motivazione scritta** — e una seconda prova che fallisce se un'eccezione resta lì senza servire più. Verificata rossa mettendo un campo libero in un `onclick` |
| **b** | 🟢 **Chiuso in modo diverso** | Vedi sotto |
| **c** | 🟢 **Chiuso** | `backup-serale.ps1` accetta `-CopiaSecondaria <percorso>`: a dump verificato, lo copia in una seconda destinazione e ne controlla la **dimensione**, non il codice di uscita — la lezione di `icacls`. Spenta di serie: la destinazione la decide l'IT |
| **d** | 🟢 **Chiuso** | Dependabot sugli avvisi di sicurezza, più `npm audit` informativo nella CI |
| **e** | 🟢 **Chiuso** | La potatura periodica delle sessioni |
| **f** | 🟢 **Chiuso** | I file di rumore sono usciti dal tracciamento |

### C10-b — perché la validazione **non** è stata portata sul servizio

La rev01 proponeva di spostare le regole di `src/modules/validate.ts` accanto al guardiano
dei codici, in `server/lib/schema.js`. **Guardando meglio, quella correzione avrebbe rotto
gli import.**

Le regole del client vietano l'apostrofo (`SAFE_TEXT`, `SAFE_CHARS`), il percorso di import
da Excel **non passa da `Validate`**, e un'anagrafica alimentare è piena di
`OLIO D'OLIVA`. Imporle sul servizio significa rifiutare a metà un import di undicimila
articoli.

Si è fatta invece la cosa giusta, che è **dire la verità nella scheda tecnica**: il §8.4
lasciava intendere un controllo «in un punto solo» valido per tutto. È vero per i
**codici** — e quel divieto adesso ha anche la prova di C10-a a sorvegliarlo. **Non è vero
per il testo libero**, dove la difesa è l'escape HTML applicato in 952 punti. Adesso c'è
scritto, in tutte e due le lingue.

---

# 3. Quello che va detto a favore

Invariato dalla rev01, e va protetto da qualunque intervento successivo: build
riproducibile bit per bit (**verificata anche su questa versione: due build di fila, stessa
impronta `4df34781…`**), manifesto SHA-256 controllato dall'installer, via di ritorno
collaudata, PIN in `scrypt`, ruoli imposti dal servizio con 40 prove a cookie veri, SQL
sempre parametrico, backup riletto prima di essere dichiarato buono, `.gitignore` che
ragiona per nome.

**E una cosa nuova, che questo giro ha aggiunto alla lista:** la 2.18 ha reso automatico
il gesto che questo progetto già faceva a mano — **verificare rossa ogni prova nuova
rimettendo il difetto che copre**. Tutte le prove di questa versione sono state verificate
così.

---

# 4. Che cosa resta

| | Che cos'è | Perché resta |
|:---|:---|:---|
| **Limite 1 — traffico in chiaro** | Nessun TLS di serie: il cookie di sessione viaggia leggibile sulla rete interna | **Il codice è pronto**: due variabili e HTTPS si accende. Serve un nome DNS interno e un certificato dalla CA aziendale — una decisione dell'IT, non del progetto |
| **Nessuna CSP** | 360 gestori inline la rendono impossibile | Architetturale. Chiuderla vuol dire riscrivere il modo in cui l'interfaccia costruisce i suoi gestori. La difesa in essere — escape in 952 punti, divieto sui codici, e da oggi la prova che li tiene allineati — è quella praticabile |
| **C8 — il peso della storia** | 68 MB, 3.090 oggetti nella storia | Decisione presa: non si riscrive la storia adesso |
| **Copertura non misurata** | ~1.230 prove, nessun numero che dica quanto coprono | Le viste restano la parte scoperta. Un `--coverage` direbbe quanto, e oggi nessuno lo sa |
| **Limiti 12 e 13** | I due rischi accettati | Con la loro condizione di riapertura scritta |

---

# 5. Conclusione

La rev01 diceva che le due criticità peggiori non erano errori di programmazione, ma le due
cose che una persona sola non può darsi da sé. **Su tutte e due Andrea ha deciso**, e una
decisione scritta con una condizione di riapertura è quanto un audit può chiedere a chi ha
titolo per prenderla.

Il resto — le tre porte aperte che nessuno aveva dichiarato, il servizio che non lasciava
traccia, le regole che vivevano in una memoria sola — **è chiuso, e ogni chiusura ha
accanto la prova che fallisce se qualcuno la riapre.** È il modo in cui questo progetto ha
sempre lavorato: la 2.18 lo ha solo applicato a se stesso.

**Da 7,5 a 8,5.** Il punto e mezzo che manca sta quasi tutto in due cose che il codice non
può darsi: **una decisione dell'IT sul certificato**, e **una seconda persona**.

---

*Fine documento — REP-AUDIT-001 rev02 — 02/09/2026 — Pathfinder 2.18, commit `2e60869`*
