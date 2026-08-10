# HANDOFF — Pathfinder 1.2

**Documento di passaggio di consegne per la prossima conversazione**
Autore: Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
Data: 11/08/2026 · Rev. 01 — da file unico a moduli

---

## 0. Come si riprende, in tre righe

Il progetto è su **GitHub, privato**: `sacchetti84-dev/pathfinder`, branch
`main`, 14 commit. Niente vive solo in una conversazione.

Alla prossima chat basta dare **questo file** e il **[README](../README.md)**.
Il README dice come si installa, si aggiorna e si diagnostica; questo dice
dove siamo e cosa manca.

---

## 1. Stato

| Voce | Valore |
|---|---|
| In produzione | **`pathfinder-1.1.html`** — è il file che il servizio serve oggi |
| In lavorazione | **1.2** — sorgente modulare in `src/`, build in `dist/pathfinder-1.2.html` |
| Sorgente | 25 moduli (era un file da 22.772 righe) |
| Servizio | `server/` — Node + Express + SQLite, invariato nel funzionamento |
| Database | `C:\Pathfinder\data\pathfinder.db` — **fuori da OneDrive** |
| Backup | Ogni sera alle 20:00 in `C:\Pathfinder\backup`, con registro |
| Collaudi | 15 client (~1 s) + 29 servizio, tutti verdi |
| Tipi | `npm run check` su client **e** servizio, 0 errori |

**La 1.2 non è ancora andata in magazzino.** Il servizio continua a servire la
1.1 di proposito: la 1.2 è verificata a fondo ma non ha ancora fatto un turno.

### Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Sviluppo, ricarica automatica. Puntare `PATHFINDER_DEV_API` a un'istanza **di prova** |
| `npm run build` | `dist/pathfinder-1.2.html`, un file solo |
| `npm run check` | Tipi, client e servizio |
| `npm test` | Serpentina e FEFO |
| `cd server && npm test` | 29 prove, database usa-e-getta |

---

## 2. Cosa è stato fatto

**Fase 0 — messa in sicurezza.** Git e repository privato. Database spostato
fuori da OneDrive con percorso esplicito in `PATHFINDER_DB` (variabile di
macchina). Servizio e backup serale come attività pianificate. HTTPS
predisposto nel servizio: si accende impostando due variabili, senza toccare
codice.

**Fase 1 — impalcatura.** Vite + `vite-plugin-singlefile`. Il monolite si
divide in `index.html` + 5 fogli di stile + `src/main.js`, e la build lo
ricompone in un file solo. Dexie e SheetJS entrano da npm alle versioni già
collaudate (3.2.4 e 0.18.5) invece di scendere da un CDN: un PC senza linea
adesso parte lo stesso.

**Fase 2 — spacchettamento**, in quattro ondate, una per commit, con collaudo
in mezzo a ognuna. Ordine: costanti/schema/utility → i due adapter e il
selettore → i nove blocchi indipendenti → `Store`, `PickRoute`, `Vault`, `App`.

**Fase 3 — tipi.** `src/types/` dichiara le 14 collezioni, le entità e il
contratto di persistenza. `server/lib/schema.js` importa quei tipi in JSDoc:
il vocabolario ha un posto solo ed è verificato negli altri. Convertiti a
TypeScript: `costanti`, `utils`, `persistence/index`.

**Fase 4 — collaudi.** Serpentina (6) e FEFO (9), ~1 secondo.

**Fase 5 — README** completo, undici capitoli.

---

## 3. Decisioni prese, da non rimettere in discussione

Valgono in aggiunta a quelle dell'HANDOFF 1.0, che restano tutte.

1. **Il sorgente si scompone, la distribuzione si ricompone.** Un file solo
   resta la forma in cui l'applicativo arriva in magazzino, ma è l'artefatto
   di build, non il modo di lavorare.
2. **Niente Entra ID.** Si resta al PIN/QR esistente. Deciso dopo aver visto
   che avrebbe rimesso la dipendenza dalla WAN che il servizio on-prem toglie,
   e che su `file://` MSAL non può funzionare.
3. **Sage X3 fino al 2038.** Nessun adapter D365, nessuna Azure Function:
   resta solo la cucitura, cioè il parser dietro un'interfaccia.
4. **Servizio on-prem.** Azure resta per CI/CD, backup off-site e — un giorno
   — il canale verso l'ERP. Niente Redis: la concorrenza è già arbitrata da
   una transazione SQLite dentro `/api/op/…`.
5. **Il CSS non si minifica.** Toglieva 413 caratteri su 146.368 e in cambio
   riscriveva le regole, fondendo selettori adiacenti. Per lo 0,3% non vale:
   una regressione grafica si deve poter cercare per selettore.
6. **La copia a file singolo lavora in sola lettura.** Se scrivesse, si
   avrebbero due database che divergono — la §4.1 per via traversa.
7. **`checkJs` spento sul client, acceso sul servizio.** Il servizio è 800
   righe con un collaudo che le esercita tutte; il client sono 15.000 righe
   stratificate su due anni, e accendere il controllo lì produce un elenco
   che nessuno legge.
8. **I tipi non fanno cambiare il codice.** Dove il tipo e il codice non
   andavano d'accordo, ha ceduto il tipo: `open()` resta con il suo
   `return true` inutile, e in `utils.ts` si usa `as` invece di aggiungere
   `String(v)`.

---

## 4. Trappole in cui sono già caduto (in questa sessione)

Le §5.1-5.6 dell'HANDOFF 1.0 restano valide. Queste sono nuove.

### 4.1 — Un controllo che passa subito potrebbe non controllare niente

**Tre volte** in una sessione ho scritto una verifica che passava senza
verificare:

- l'annotazione JSDoc dentro un commento `/*` invece di `/**` — TypeScript
  legge solo i secondi. Successo due volte, su `eachChunk` e su `COLLECTIONS`;
- il collaudo FEFO che copriva un ramo solo: con due elementi `sort()` chiama
  il comparatore **una volta**, nell'ordine `(secondo, primo)`. Rompendo il
  codice, tutte e otto le prove passavano lo stesso.

**Regola: rompere di proposito il codice e vedere il controllo fallire, prima
di crederci.** Applicata a tutto ciò che è stato aggiunto dopo.

### 4.2 — Le attività pianificate come SYSTEM sono invisibili da una finestra normale

`Get-ScheduledTask` **le omette in silenzio**, senza errore. `schtasks`
almeno dice «Accesso negato». Ho concluso che non esistessero e ho mandato a
caccia di un prompt UAC per niente: esistevano dalla prima installazione. La
prova che le smaschera è indiretta — il processo del servizio è figlio di
`svchost.exe`, e il registro dei backup ha una riga alle 20:00:01 che nessuno
ha lanciato a mano.

### 4.3 — I confini dei blocchi non si trovano a occhio

Il primo criterio risaliva dalla dichiarazione finché le righe «sembravano»
commenti. Ma i commenti a blocco di questo progetto hanno le righe interne in
prosa indentata, senza asterisco: la risalita si fermava a metà e tagliava il
commento in due. Ne è uscito un modulo con un `/*` mai chiuso e la build a
terra. **I confini li dà acorn**, e ogni modulo passa dal parser **prima** di
essere scritto.

Inoltre: prima di `const Tabs` stanno **tre banner impilati** — `Session`,
`Vault`, `Tabs` — mentre il codice degli altri due sta centinaia di righe più
giù. Il taglio automatico li avrebbe messi tutti in `tabs.js`.

### 4.4 — Misurare mentre due schede sono aperte

Un confronto dava 214 elementi contro 210 e sembrava una regressione. Erano
`DIV.readonly-banner` e i suoi tre figli: la fascia «sola lettura», perché
avevo lasciato due schede sulla stessa origine. È la §5.2 dell'HANDOFF 1.0.
**Una scheda sola quando si misura.**

### 4.5 — I backtick nei messaggi di commit

La shell li interpreta e buca il testo. Usare le virgolette, o un heredoc
delimitato da apici.

---

## 5. Come si lavora su questo codice adesso

Il metodo che ha retto per 22.772 righe, in quattro punti:

1. **Un blocco per commit**, con build e collaudo in mezzo. Chi sposta non
   corregge: un difetto trovato strada facendo si annota e si chiude dopo.
2. **Gli export si aggiungono in coda** con `export { … }`, invece di
   trasformare `const X` in `export const X`. Così il testo spostato resta
   confrontabile byte per byte, e la verifica è una `includes()`.
3. **Il file si ricostruisce per complemento** — si tolgono gli intervalli
   estratti e si tiene tutto il resto — invece di elencare a mano ciò che
   resta. Elencare vuol dire poter dimenticare.
4. **Il confronto è contro la 1.1 servita in parallelo** su un'altra porta,
   con database usa-e-getta: elementi del DOM tag per tag, regole CSS,
   `App` raggiungibile, `/api/load` e feed SSE. I numeri di riferimento sono
   **210 elementi e 1008 regole**.

---

## 6. Aperto — da fare

### Dipende da altri

| # | Cosa | Chi |
|---|---|---|
| 1 | **Nome DNS interno** e **certificato** dalla CA aziendale | IT. La richiesta pronta da inoltrare è nella conversazione precedente |
| 2 | **Dati del mittente** in Configurazione → DDT e Documenti | Andrea. Serve la **partita IVA**: senza, i DDT escono «non conformi» |

### Codice

| # | Cosa | Peso |
|---|---|---|
| 3 | Fase 3: `core/store.js` a TypeScript — 2.691 righe, tocca tutte le entità | grande |
| 4 | Fase 3: `persistence/{local,remote}`, poi `modules/`, la UI per ultima | medio |
| 5 | Fase 4: collaudi su geometria delle ubicazioni (serve fingere la cache di `Store`) e parser ODP (serve un foglio Excel finto) | medio |
| 6 | **Portare la 1.2 in magazzino**: rinominare la 1.1 in `VERSIONI PRECEDENTI`, puntare `PATHFINDER_APP` alla 1.2, allineare le stringhe di versione | mezz'ora |
| 7 | Aperti dell'HANDOFF 1.0 ancora validi: §7.3 schede grafico che tagliano ~6px, §7.4 causali di trasporto da validare, §7.6 `weight_net_kg` e `pieces_per_pack` in anagrafica | vari |

### Riordino minore, lasciato in sospeso

- La cartella si chiama `HANDSOFF`, con una esse di troppo.
- `pathfinder-1.1.html` sta sia in radice (dove il servizio lo serve) sia in
  `VERSIONI PRECEDENTI`: 1,2 MB in doppio che git conserva comunque.
- `LOGHI/` contiene nomi generati automaticamente accanto a quelli veri.

---

## 7. Cosa NON fare

- **Non minificare il CSS** (vedi §3.5).
- **Non convertire il servizio a TypeScript** senza un motivo forte: oggi si
  avvia con `node pathfinder-server.js` e basta, ed è una delle ragioni per
  cui è affidabile.
- **Non togliere `window.App = App`** in coda a `main.js` finché gli handler
  stanno negli attributi HTML: sono 366 punti che chiamano `App` per nome, e
  senza quella riga smettono di funzionare **in silenzio**.
- **Non collaudare sul database di lavoro.** Mai. È già costato un blocco
  d'accesso.
- **Non accendere `checkJs` sul client** in un colpo solo.

---

*Uso interno Dietopack S.r.l. / Naturacare Group — © Andrea Sacchetti*
