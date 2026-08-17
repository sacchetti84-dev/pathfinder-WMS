README operativo per Claude — Pathfinder

Scopo
-----
Questo documento è rivolto a Claude (assistente automatico) e ai manutentori: fornisce istruzioni chiare e neutre nel tempo per installare, mantenere il servizio dati e usare il repository durante la migrazione da file singolo a struttura modulare. Non contiene riferimenti a numeri di versione o percorsi assoluti che possono cambiare.

Principi chiave
----------------
- INDEX.md è il punto di partenza canonico: per ogni conversazione con Claude, caricare SOLO INDEX.md (e il relativo handoff di contesto) come sorgente primaria delle informazioni di sviluppo e stato.
- Le informazioni storiche (vecchi handoff, artefatti di rilascio, backup di consegna) vanno archiviate in ARCHIVIO/ e catalogate in un manifesto.
- Le modifiche al codice devono essere atomiche, tracciate in branch per feature e accompagnate da test automatici e checklist di PR.
- Evitare riferimenti a file o nomi di versione nel testo operativo: usare etichette logiche (es. "file di produzione", "backup serale") e variabili d'ambiente nelle procedure.

Requisiti minimi (servizio dati)
--------------------------------
- Sistema: Windows 10/11 o Windows Server (compatibile anche con Linux ma le istruzioni automatiche sono in PowerShell)
- Node.js: versione LTS (consentire upgrade solo dopo verifica dei prebuild per il binding nativo)
- Disponibilità di spazio per archivi e backup: stimare 10 GB per 1 anno di ritenzione come ordine di grandezza
- Porta TCP aperta per la LAN (configurabile)

Variabili operative (concetto)
-----------------------------
Usare variabili d'ambiente o argomenti di script per i valori che cambiano fra installazioni:
- PATHFINDER_PORT — porta su cui il servizio ascolta
- PATHFINDER_DB — percorso del file SQLite usato dal servizio
- PATHFINDER_APP — file HTML servito dall'applicativo (entrypoint)
- BACKUP_DIR — directory di destinazione dei backup giornalieri

Installazione (procedura generica)
---------------------------------
1. Preparare la cartella di consegna sul server (copia della build prodotta dal processo di build).
2. Eseguire lo script di installazione del servizio come amministratore (PowerShell elevato). Lo script deve:
   - Verificare la presenza di Node e installare le dipendenze se necessario (solo in remoto; su macchine offline preparare node_modules altrove)
   - Verificare che non si stia creando un database dentro servizi di sincronizzazione cloud (es. OneDrive)
   - Aprire la porta sul firewall per la LAN
   - Registrare l'attività pianificata per avviare il servizio all'accensione (es. Scheduled Task)
   - Registrare l'attività pianificata per il backup serale
   - Verificare che il servizio risponda e che il file applicazione atteso sia presente
3. Mettere l'indirizzo del servizio come pagina iniziale sui terminali.

Note operative per la macchina di prova
--------------------------------------
- Usare PATHFINDER_DB su un file temporaneo (database usa-e-getta) e una porta diversa dalla produzione.
- Avviare il servizio in foreground per debug (Ctrl+C per fermare).

Backup e ripristino
-------------------
- Il backup è la copia coerente del file SQLite; usare endpoint o script che eseguono una copia transazionale.
- Conservare manifest con: timestamp, dimensione file, checksum (es. SHA256), percorso backup.
- Policy consigliata: retention minima 30 giorni per backup giornaliero; policy di conservazione separata per snapshot più vecchi.

Manutenzione servizio (operazioni comuni)
-----------------------------------------
- Stato attività: Get-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
- Arresto: Stop-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
- Avvio: Start-ScheduledTask -TaskName 'Pathfinder - Servizio dati'
- Log e collaudo: eseguire suite di test con database usa-e-getta (cd server && npm test)

Policy di archiviazione e rinomina (procedura proposta)
-----------------------------------------------------
Obiettivo: spostare artefatti obsoleti in ARCHIVIO/ e mantenere il root pulito. Non eseguire automaticamente azioni destructive senza conferma esplicita.

Regole proposte:
1. Tutti i file artefatto di build storici (es. file HTML di consegna numerati) vanno spostati in ARCHIVIO/BUILD/ e rinominati con prefisso data ISO e descrizione: YYYYMMDD_original-name.html (es. 20260813_pathfinder-1.4.3.html).
2. I documenti di handoff storici devono restare in ARCHIVIO/HANDOFF STORICI/ con nome leggibile e suffisso di stato (es. HANDOFF-pathfinder-1.0_ARCHIVIO.md) — aggiungere una riga di metadata all'inizio con: archivioDate: YYYY-MM-DD, reason: "sostituito da HANDOFF 1.4".
3. Creare o aggiornare in ARCHIVIO/ un manifesto (archive-manifest.json o .md) che elenchi: originalPath, newPath, archivedAt (ISO), checksum, tag (handoff|build|backup|test-artifact), note.
4. Non eliminare nulla; le azioni sono solo di spostamento e rinomina.

Checklist per l'archiviazione manuale (da seguire prima dell'azione)
------------------------------------------------------------------
- [ ] Verificare che il file non sia referenziato da script di deployment attivi
- [ ] Creare manifest locale con metadati (checksum, size)
- [ ] Eseguire lo spostamento in ARCHIVIO/ con rinomina secondo convenzione
- [ ] Aggiornare INDEX.md e HANDOFF principali per riflettere lo spostamento
- [ ] Commit dei cambiamenti in repository (branch: housekeeping/archive-YYYYMMDD)

Verifica e catalogazione
------------------------
Dopo lo spostamento:
- Eseguire una scansione automatica per verificare che tutti i file root siano "attivi" (sorgenti, config, index.md) e che nessun file artefatto rimanga in radice.
- Aggiornare INDEX.md con un elenco aggiornato dei file principali e dei riferimenti ai manifest in ARCHIVIO/.
- Se vengono trovati duplicati o ambiguità, segnalarli in un issue con link al manifest.

Indicazioni per Claude (formato richiesto)
-----------------------------------------
- Per le conversazioni di sviluppo caricare SOLO: INDEX.md e HANDOFF/HANDOFF-pathfinder-1.4.md (il resto è storicizzazione). INDEX.md è il singolo file di riferimento per stato e mappa del progetto.
- Quando chiedi a Claude di modificare o proporre patch, includere insieme a INDEX.md un breve messaggio che spieghi il contesto della richiesta e la slice desiderata (es. "cambiare estrazione anagrafica — scope: modules/anagrafica.ts, ui/app.js").
- Per ogni patch proposta, chiedere a Claude di produrre:
  1. una lista di file proposti per la modifica,
  2. un breve changelog, e
  3. i comandi per eseguire i test locali e la build.

Passi successivi consigliati (azioni che puoi autorizzare)
---------------------------------------------------------
- Generare automaticamente il manifesto di archivio (archive-manifest.json) con le voci già presenti in ARCHIVIO/ — operazione sicura, proposta automatica.
- Proporre l'elenco di file candidate all'archiviazione dalla radice del progetto — output in formato tabellare per revisione umana.
- Solo dopo la tua approvazione, eseguire lo spostamento e la rinomina dei file obsoleti e aggiornare INDEX.md.

Domande per allineamento prima di procedere
------------------------------------------
1) Confermi che l'azione di spostamento e rinomina dei file obsoleti debba essere eseguita ora (sì/no)?
2) Confermi la convenzione di nomenclatura per l'archivio (YYYYMMDD_original-name.ext)?
3) Vuoi che il manifesto di archivio sia JSON (machine-friendly) o Markdown (leggibile)? (scelta raccomandata: JSON per automazione con copia Markdown sintetica)
4) Vuoi che il README principale (root) venga sovrascritto con questa versione o preferisci che io crei un nuovo file con suffisso (es. README_FOR_CLAUDE.md) e poi sostituiamo manualmente?

Output prodotti da questa azione
--------------------------------
- HANDOFF/README_FOR_CLAUDE.md (questo file)
- Proposta di manifest per ARCHIVIO/ (creazione dopo approvazione)
- Elenco candidate per archiviazione (verrà fornito subito dopo la tua conferma per il move)

---

Sei allineato su quanto sopra? Rispondi alle domande 1–4 per procedere con gli spostamenti e la generazione del manifesto.