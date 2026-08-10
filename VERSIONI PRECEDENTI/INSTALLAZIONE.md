# Warehouse Mapper v2.6.0 — Istruzioni di installazione

**Documento**: INS-WM-260 Rev. 01
**Applicativo**: `warehouse-mapper-v2_5_1.html` — 810 KB, file singolo
**Autore**: Andrea Sacchetti — Warehouse Team Leader, Dietopack S.r.l. (Naturacare Group)
**Data**: 07/08/2026
**Uso interno — tutti i diritti riservati**

---

## 0. Leggere prima di tutto: dove vivono i dati

Warehouse Mapper non ha un server. **Tutti i dati stanno nel browser del dispositivo su cui l'applicativo viene aperto**, in un database locale chiamato `WarehouseMapperDB` (tecnologia IndexedDB).

Da questo discendono tre conseguenze che vanno capite prima di installare, non dopo:

| | |
|---|---|
| **I dati NON sono condivisi** | Due tablet che aprono lo stesso file vedono due magazzini diversi. Non c'è sincronizzazione. |
| **I dati sono legati all'INDIRIZZO da cui si apre l'applicativo** | Aprire il file con doppio clic e aprirlo da `http://server/wm.html` sono, per il browser, due applicazioni distinte con due database distinti. Cambiare modo di aprirlo fa sembrare che i dati siano spariti: non sono spariti, sono sotto l'altro indirizzo. **Scegliere un metodo di apertura e non cambiarlo più.** |
| **I dati sono legati al browser** | Chrome e Firefox sullo stesso PC hanno database separati. Anche il profilo utente conta. |

> La condivisione fra più utenze arriverà con il backend centralizzato (PocketBase), pianificato dalla Fase 3 in poi. La v2.6.0 prepara l'architettura ma **non introduce il server**.

**Regola operativa**: un dispositivo = un magazzino. Se serve allineare più postazioni, si usa Export/Import JSON (§6), che è un travaso manuale, non una sincronizzazione.

---

## 1. Requisiti

### 1.1 Browser

| Browser | Stato |
|---|---|
| **Google Chrome / Microsoft Edge** (versione recente) | **Consigliato** — è l'ambiente su cui l'applicativo è sviluppato e collaudato |
| Firefox | Funziona |
| Safari | Non collaudato |
| Internet Explorer | Non supportato |

Serve un browser che offra: IndexedDB, ES6+, OPFS (`navigator.storage.getDirectory`) per il backup automatico, WebAudio per il riscontro sonoro. Se OPFS manca, l'applicativo funziona lo stesso: si perde soltanto il backup automatico settimanale, e i backup manuali restano disponibili.

### 1.2 Connessione a Internet — **requisito non ovvio**

L'applicativo carica due librerie da CDN esterno:

```
https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js
https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
```

Conseguenze concrete:

- **Dexie è obbligatoria.** Se non si carica, l'applicativo non parte: schermata di avvio bloccata. Non esiste ripiego.
- **SheetJS (xlsx) è facoltativa.** Se non si carica, l'applicativo parte regolarmente ma export Excel e import dell'ordine di produzione mostrano "Libreria Excel non disponibile".

Al primo avvio su un dispositivo serve quindi accesso a Internet. Dopo, il browser tiene le librerie in cache e l'applicativo apre anche offline — ma è una garanzia debole: basta una pulizia della cache per riportare il dispositivo a dipendere dalla rete.

> **Se i tablet di magazzino lavorano senza Internet o la rete aziendale blocca cdnjs.cloudflare.com**, vedere §8: le due librerie vanno incorporate nel file. È un intervento di dieci minuti da fare una volta sola.

### 1.3 Hardware

- Lettore di codici a barre in emulazione tastiera (HID). L'applicativo ha una protezione anti-scanner sui dialoghi e una correzione del layout di tastiera attivabile da Configurazione.
- Stampante, per i report di prelievo, i documenti di uscita e i cartelli di non conformità.
- Nessun requisito particolare di CPU o memoria.

---

## 2. Installazione

### 2.1 Metodo A — File locale (il più semplice)

Adatto a: **una sola postazione**, tipicamente il PC dell'ufficio magazzino.

1. Copiare `warehouse-mapper-v2_5_1.html` in una cartella **stabile e non sincronizzata**, per esempio `C:\WarehouseMapper\`.
2. Fare clic destro sul file → *Apri con* → *Google Chrome*.
3. Creare un collegamento sul desktop.

**Avvertenze**

- **Non tenere il file in OneDrive, Dropbox o cartelle sincronizzate.** La sincronizzazione può sostituire il file mentre è aperto e può cambiarne il percorso: e il percorso, come detto al §0, è l'indirizzo a cui sono legati i dati.
- **Non spostare né rinominare il file dopo il primo utilizzo.** Cambia l'indirizzo, e il magazzino sembra vuoto.
- **Da verificare sul posto al primo avvio**: alcuni browser applicano restrizioni ai file aperti con doppio clic (indirizzi `file://`) e possono impedire la creazione del database locale o del backup automatico. È il motivo per cui il Metodo B è quello raccomandato. Il collaudo si fa in trenta secondi: vedere §3.1.

### 2.2 Metodo B — Servito da `localhost` (**raccomandato**)

Adatto a: **una postazione**, con la certezza che database e backup automatico funzionino. È il metodo su cui la v2.6.0 è stata collaudata.

Richiede Node.js installato sulla postazione.

1. Copiare `warehouse-mapper-v2_5_1.html` in `C:\WarehouseMapper\`.
2. Creare nella stessa cartella un file `serve.js` con questo contenuto:

```js
/* Server statico minimo per Warehouse Mapper.
   IndexedDB e OPFS vogliono un'origine http, non un file aperto dal disco. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(8123, () => console.log('Warehouse Mapper su http://localhost:8123'));
```

3. Creare `avvia.bat` nella stessa cartella:

```bat
@echo off
cd /d "%~dp0"
start "" http://localhost:8123/warehouse-mapper-v2_5_1.html
node serve.js
```

4. Doppio clic su `avvia.bat`. Si apre una finestra nera (il server: **va lasciata aperta**) e il browser sull'applicativo.

Per l'avvio automatico all'accensione, mettere un collegamento a `avvia.bat` in:
`C:\Users\<utente>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

**L'indirizzo da usare sempre è `http://localhost:8123/warehouse-mapper-v2_5_1.html`.** Salvarlo nei preferiti.

### 2.3 Metodo C — Condiviso in rete aziendale

Adatto a: **più postazioni che devono usare la stessa versione dell'applicativo** — non gli stessi dati.

L'IT pubblica il file su un web server interno, per esempio `http://intranet.dietopack.local/wm/`. Ogni postazione apre lo stesso URL.

**Che cosa si ottiene**: aggiornare l'applicativo per tutti significa sostituire un file solo. Nessuno lavora più su una copia vecchia.

**Che cosa NON si ottiene**: i dati restano separati per dispositivo. Ogni postazione ha il proprio magazzino. Vale integralmente il §0.

Se il server interno espone HTTPS, meglio: alcune funzioni del browser sono più garantite su connessione sicura.

---

## 3. Primo avvio

### 3.1 Collaudo di installazione (30 secondi, da fare sempre)

1. Aprire l'applicativo.
2. Deve comparire il dialogo **"Benvenuto — inserisci le tue iniziali"**. Se resta la schermata di caricamento, Dexie non si è caricata: vedere §7.
3. Inserire le iniziali (2–4 caratteri, es. `AS`) e confermare.
4. Aprire **Configurazione → Dati e Backup**: deve comparire lo stato del database con lo spazio occupato.
5. Premere **Esporta JSON**: deve scaricarsi un file. Se il download parte, scrittura e lettura funzionano.
6. Ricaricare la pagina (F5): le iniziali devono essere ricordate. Se le richiede di nuovo, il browser non sta conservando i dati — vedere §7.

Se tutti e sei i punti passano, l'installazione è buona.

### 3.2 Configurazione iniziale

Nell'ordine:

1. **Configurazione → Siti e Zone → Nuovo Sito.** Un sito è uno stabile o un'area di stoccaggio.
2. **Aggiungere le Zone** a ogni sito. Tre tipi disponibili:
   - `RACK` — scaffalature: corsie × campate × livelli
   - `FLOOR` — aree a terra: file × posizioni
   - `BULK` — sfuso: posizioni numerate
   Le ubicazioni sono generate automaticamente con codici del tipo `MAG-A-01-02-T`.
3. **Configurazione → Anagrafica Articoli.** Facoltativa: gli articoli si creano da soli al primo posizionamento se si indica la descrizione. Popolarla in anticipo conviene comunque, perché porta categoria, unità di misura e scorte minime.
4. **Ordine dei siti per il prelievo guidato** — si imposta dentro il flusso di prelievo ed è ricordato per dispositivo.

### 3.3 Impostazioni per postazione

Queste preferenze **non** stanno nel database e **non** finiscono nell'export JSON: vanno rimesse su ogni dispositivo.

| Preferenza | Dove |
|---|---|
| Iniziali operatore | Badge 👤 in alto a destra |
| Correzione layout tastiera scanner | Configurazione |
| Suoni, vibrazione, riscontri visivi | Configurazione |
| Ordine dei siti nel prelievo guidato | Flusso di prelievo |

---

## 4. Aggiornamento da una versione precedente

**I dati non vanno toccati.** Il database è indipendente dal file HTML: sostituendo il file, l'applicativo nuovo ritrova il magazzino esistente — a patto che l'indirizzo di apertura resti lo stesso (§0).

Procedura:

1. Aprire la versione **attuale** ed eseguire **Esporta JSON**. Conservare il file. Questo passaggio non è facoltativo.
2. Verificare che l'indicatore in alto a destra dica **"Salvato"** e non "Non salvato".
3. Chiudere il browser.
4. Sostituire il file HTML con la v2.6.0, **mantenendo identici percorso e nome**.
5. Riaprire dallo stesso indirizzo di prima.
6. Controllare in dashboard che ubicazioni, giacenze e movimenti siano quelli attesi.

### Migrazione dello schema

La v2.6.0 usa lo **schema v5**, lo stesso della v2.5.1: chi viene dalla v2.5.1 **non subisce alcuna migrazione**.

Chi viene da versioni più vecchie (schema v1–v4) trova la migrazione **automatica** all'apertura: viene aggiunto lo store `pick_archive` (archivio dei report di prelievo emessi) e, se si arriva da prima della v2.5.0, `pick_session`. Nessun dato esistente viene modificato o cancellato.

Le migrazioni non si possono annullare: è il motivo del punto 1.

### Che cosa cambia per l'operatore passando alla v2.6.0

**Nulla.** La v2.6.0 è un intervento sull'architettura interna (disaccoppiamento del layer di persistenza in vista del backend). Schermate, flussi, scorciatoie e stampe sono identici alla v2.5.1.

---

## 5. Backup

### 5.1 Automatico (OPFS)

Attivo di serie, se il browser lo supporta: **una copia a settimana**, conservate le **ultime 4**, scritte in un'area privata del browser. Non richiede alcuna azione.

Sopravvive alla normale pulizia della cache, **non** sopravvive a "Cancella tutti i dati di navigazione" né alla disinstallazione del browser. **Non è un backup aziendale**: è una rete di sicurezza contro l'incidente banale.

### 5.2 Manuale (l'unico che conta davvero)

**Configurazione → Dati e Backup → Esporta JSON.**

Produce un file con tutto: siti, zone, anagrafiche, giacenze, stati ubicazione, registro movimenti, quarantene, documenti di uscita e archivio dei report di prelievo.

**Cadenza raccomandata**: settimanale, e sempre prima di un aggiornamento, di un inventario e di un reset.

**Dove conservarlo**: su un percorso di rete aziendale sottoposto a backup, non sul disco locale del tablet. Un backup che vive sullo stesso dispositivo dei dati non è un backup.

Regola pratica di denominazione: `wm-backup-AAAA-MM-GG.json`.

### 5.3 Ripristino

**Configurazione → Dati e Backup → Importa JSON**, con due modalità:

- **Sovrascrittura** — azzera tutto e ricarica dal file. È il ripristino vero.
- **Unione** — aggiunge solo siti, zone, articoli e giacenze non già presenti. Serve a travasare una configurazione su una postazione nuova, non a recuperare da un guasto.

Il formato accettato è `warehouse-mapper-v1.5`. I backup delle versioni precedenti sono compatibili: i campi introdotti dopo restano semplicemente vuoti.

---

## 6. Allineare più postazioni

Non esiste sincronizzazione. Esiste il travaso:

1. Sulla postazione di riferimento: **Esporta JSON**.
2. Portare il file sull'altra postazione.
3. Lì: **Importa JSON → Sovrascrittura**.

La seconda postazione diventa una fotografia della prima. Da quel momento le due tornano a divergere.

**Modo di lavorare finché non c'è il backend**: una sola postazione è quella "di verità", le altre sono in sola consultazione e vengono riallineate quando serve. Registrare movimenti su due postazioni e poi provare a unirle non funziona — l'import in sovrascrittura fa vincere una delle due e l'altra perde tutto.

---

## 7. Se qualcosa non va

| Sintomo | Causa più probabile | Che fare |
|---|---|---|
| Resta la schermata di caricamento | Dexie non si è caricata (nessuna rete, oppure cdnjs bloccato dal firewall) | Verificare la connessione; se la rete blocca i CDN, incorporare le librerie (§8) |
| "Libreria Excel non disponibile" | SheetJS non caricata | Come sopra. Il resto dell'applicativo funziona |
| **Il magazzino sembra vuoto ma i dati c'erano** | L'applicativo è stato aperto da un indirizzo diverso (file spostato, rinominato, oppure prima `file://` e ora `http://`) | Riaprire dall'indirizzo di prima. Se non si risale, ripristinare l'ultimo export JSON |
| Le iniziali vengono richieste a ogni avvio | Il browser non conserva i dati: modalità di navigazione in incognito, oppure pulizia automatica all'uscita | Uscire dall'incognito; escludere il sito dalla pulizia automatica |
| I dati spariscono dopo giorni di inattività | Pulizia automatica dello spazio da parte del browser | Su Chrome: impostazioni sito → "Consenti al sito di salvare dati sul dispositivo". Ed esportare regolarmente |
| Lo scanner scrive caratteri sbagliati | Layout di tastiera dello scanner diverso da quello di Windows | Attivare la correzione layout scanner in Configurazione |
| Il backup automatico non parte mai | OPFS non supportato dal browser, oppure l'applicativo è aperto da `file://` | Passare al Metodo B (§2.2). Nel frattempo esportare a mano |
| La stampa esce impaginata male | Impostazioni di stampa del browser | Formato A4, margini predefiniti, **grafica di sfondo attiva** (senza, le intestazioni delle tabelle escono bianche su bianco) |
| Spazio quasi esaurito | Registro movimenti molto lungo | Configurazione → Dati e Backup → purga manuale del registro storico, **dopo aver esportato** |

### Ripartire da zero

**Configurazione → Dati e Backup → Reset totale.** Cancella tutto: siti, zone, articoli, giacenze, movimenti, quarantene, documenti e archivio report. **È irreversibile.** L'applicativo chiede conferma e raccomanda l'export: fare l'export.

---

## 8. Rendere l'applicativo indipendente da Internet

Da fare se i dispositivi lavorano offline o se la rete aziendale blocca i CDN esterni.

1. Da un PC connesso, scaricare i due file:
   - `https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js`
   - `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`
2. Aprire `warehouse-mapper-v2_5_1.html` con un editor di testo (Notepad++, VS Code — **non** Word).
3. Cercare, intorno alla riga 425, le due righe:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

4. Sostituire ciascuna con un blocco `<script>` che contiene il **contenuto integrale** del file scaricato:

```html
<script>
/* qui dentro tutto il contenuto di dexie.min.js */
</script>
<script>
/* qui dentro tutto il contenuto di xlsx.full.min.js */
</script>
```

5. Salvare **in UTF-8** (non ANSI: altrimenti accenti e simboli si rompono).
6. Rifare il collaudo del §3.1.

Il file passa da circa 810 KB a circa 1,9 MB. Resta un file singolo, e da quel momento non serve più Internet.

---

## 9. Nota per l'IT aziendale

- Nessuna installazione di software, nessun servizio, nessuna porta in ascolto — **tranne** con il Metodo B, che apre la porta `8123` in ascolto **solo su localhost**, non raggiungibile dalla rete.
- Nessun dato lascia il dispositivo. Nessuna telemetria, nessuna chiamata di rete oltre ai due CDN al caricamento (eliminabili con §8).
- Nessuna credenziale, nessun token: le iniziali dell'operatore sono un'etichetta di tracciabilità in `localStorage`, non un'autenticazione.
- Chiavi usate in `localStorage`: `wm_current_operator`, `wm_known_operators`, `wm_scanner_fix`, `wm_feedback_prefs`, `wm_pick_site_order`.
- Database IndexedDB: `WarehouseMapperDB`, schema versione 5.
- Se si intende passare al backend centralizzato (PocketBase su server interno), il riferimento è il documento **HND-WM-F1**: la v2.6.0 ha già disaccoppiato il layer di persistenza, quindi l'introduzione del server sarà un lavoro aggiuntivo e non una riscrittura.

---

## 10. Posizione dell'applicativo nel sistema informativo

Warehouse Mapper è uno **strumento operativo interno di supporto a SAGE X3**. Non è il sistema gestionale ufficiale e non è un sistema validato GMP.

**SAGE X3 resta la fonte di verità regolamentata** per giacenze, lotti e tracciabilità. I documenti prodotti da Warehouse Mapper — report di prelievo, cartelli di non conformità, ricevute di uscita — sono supporto all'operatività e alla tracciabilità interna, non sostituiscono la documentazione di SAGE X3.

---

*Documento redatto da **Andrea Sacchetti**, Warehouse Team Leader — Dietopack S.r.l. (Naturacare Group).*
*Uso interno. Tutti i diritti riservati.*
