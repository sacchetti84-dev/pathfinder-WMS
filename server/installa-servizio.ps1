# ═══════════════════════════════════════════════════════════════════
#  PATHFINDER — INSTALLAZIONE DEL SERVIZIO DATI
#  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
#
#  Registra Pathfinder come attività pianificata che parte all'accensione
#  della macchina e si riavvia da sola se cade.
#
#  PERCHÉ UN'ATTIVITÀ PIANIFICATA E NON UN SERVIZIO WINDOWS VERO.
#  Un servizio nativo richiede un programma che sappia dialogare con il
#  gestore dei servizi: Node non lo sa fare da solo, e servirebbe un
#  intermediario da scaricare (NSSM o simili). Un PC di magazzino è
#  esattamente il posto dove un binario scaricato da internet diventa un
#  problema — l'antivirus lo blocca, l'IT chiede conto, e nessuno sa più
#  perché il magazzino è fermo.
#
#  L'utilità pianificata fa le stesse tre cose che servono: parte da sola,
#  riparte se cade, gira senza che nessuno abbia fatto login. Ed è già
#  dentro Windows.
#
#  Registra anche il BACKUP SERALE del database.
#
#  DOVE STA IL DATABASE, E PERCHÉ NON PIÙ ACCANTO AL CODICE.
#  Il percorso predefinito era `server\data\pathfinder.db`, cioè dentro la
#  cartella dell'applicativo. Va bene finché quella cartella è una cartella
#  normale; se un giorno finisce dentro OneDrive — ed è successo — il
#  sincronizzatore si mette a copiare un database aperto, con il suo WAL, e
#  il file può corrompersi o rifiutare le scritture nel mezzo di un turno.
#  Da qui il percorso è dichiarato, sta fuori da qualsiasi cartella
#  sincronizzata, e si può cambiare da riga di comando.
#
#  PERCHÉ UNA VARIABILE D'AMBIENTE DI MACCHINA.
#  Un'attività pianificata non porta con sé un ambiente proprio. La
#  variabile di macchina è il posto esplicito dove il percorso è scritto una
#  volta, lo si legge con `[Environment]::GetEnvironmentVariable(...)`, e lo
#  eredita il servizio che gira come SYSTEM. Il giorno del trasloco su una
#  macchina virtuale si cambia lì, in un posto solo.
#
#  DALLA 1.7 L'APPLICATIVO È UNA CARTELLA, NON UN FILE.
#  PATHFINDER_APP_DIR punta a `C:\Pathfinder\app\corrente`, e da quel momento
#  NON CAMBIA PIÙ: installare una versione e tornare indietro ne sostituiscono
#  il CONTENUTO, e non vogliono né l'amministratore né un riavvio del servizio.
#  È il gesto che il 13/08 veniva respinto con «Accesso al Registro di sistema
#  non consentito», e adesso serve una volta sola.
#  (`corrente` NON è una giunzione: il servizio gira come SYSTEM e il 17/08 non
#  è riuscito ad attraversarne una — vedi installa-versione.ps1.)
#      .\installa-versione.ps1 -Da ..\consegna -Versione 1.7
#      .\torna-indietro.ps1
#  Quanto segue riguarda il modo vecchio, che resta come ripiego.
#
#  QUALE FILE DELL'APPLICATIVO SERVIRE.
#  Il servizio serve un file .html, e finora quale fosse era una sua
#  convinzione: in mancanza di indicazioni ripiegava su un nome scritto nel
#  codice. Funziona finché il file si chiama così e sta lì. Da qui in avanti
#  l'installazione lo CERCA accanto a sé e lo dichiara in PATHFINDER_APP, che
#  è la stessa variabile che si cambia a mano quando esce una versione nuova.
#  Se ne trova più di uno non sceglie: si ferma e li elenca. Quale versione
#  vedano i terminali non è una cosa da indovinare.
#
#  Si lancia UNA VOLTA, da PowerShell come amministratore:
#      .\installa-servizio.ps1
#
#  Con percorsi diversi da quelli predefiniti:
#      .\installa-servizio.ps1 -Database 'D:\Pathfinder\data\pathfinder.db'
#
#  Indicando esplicitamente l'applicativo da servire:
#      .\installa-servizio.ps1 -Applicativo '..\pathfinder-1.2.html'
#
#  Per toglierlo (il database NON viene toccato):
#      .\installa-servizio.ps1 -Disinstalla
# ═══════════════════════════════════════════════════════════════════

param(
    [switch]$Disinstalla,
    [int]$Porta = 4173,
    [string]$Database = 'C:\Pathfinder\data\pathfinder.db',
    [string]$CartellaBackup = 'C:\Pathfinder\backup',
    [string]$OraBackup = '20:00',
    [int]$GiorniDiConservazione = 0,
    [string]$Applicativo = '',
    [string]$CartellaApplicativo = 'C:\Pathfinder\app\corrente',

    # 2.7 — QUALE DATABASE. Vuota (di serie) = SQLite, il file di -Database.
    # Valorizzata = PostgreSQL con quella stringa di connessione, e il file
    # SQLite resta dov'e', intatto: si torna indietro rilanciando questo
    # script senza -PostgreSQL.
    #
    # LA STRINGA NON VA SCRITTA IN UNO SCRIPT NE' IN UN FILE DEL REPOSITORY.
    # Si passa qui una volta, finisce in una variabile di macchina che solo
    # SYSTEM e gli amministratori leggono, e non compare nella riga di
    # comando di nessun processo.
    [string]$PostgreSQL = ''
)

$ErrorActionPreference = 'Stop'
$NomeAttivita = 'Pathfinder - Servizio dati'
$NomeBackup   = 'Pathfinder - Backup serale'
$Qui = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script = Join-Path $Qui 'pathfinder-server.js'
$ScriptBackup = Join-Path $Qui 'backup-serale.ps1'

function Test-Amministratore {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Amministratore)) {
    Write-Host ""
    Write-Host "  Serve PowerShell come amministratore." -ForegroundColor Yellow
    Write-Host "  Tasto destro su PowerShell -> Esegui come amministratore, poi rilancia."
    Write-Host ""
    exit 1
}

# ── Disinstallazione ────────────────────────────────────────────────
if ($Disinstalla) {
    $tolto = $false
    foreach ($nome in @($NomeAttivita, $NomeBackup)) {
        if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) {
            Stop-ScheduledTask  -TaskName $nome -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $nome -Confirm:$false
            Write-Host "  Rimosso: $nome"
            $tolto = $true
        }
    }
    if ($tolto) {
        # La variabile di macchina resta: dice dove sta il database, e quella
        # informazione serve anche a chi reinstalla domani.
        Write-Host "  Il database NON è stato toccato." -ForegroundColor Green
        Write-Host "  PATHFINDER_DB resta impostata su: $([Environment]::GetEnvironmentVariable('PATHFINDER_DB','Machine'))"
        # 2.7 — e va detto anche QUALE database, o chi legge crede che sia
        # ancora SQLite. Reinstallare senza -PostgreSQL la riporta a vuoto.
        $pgResta = [Environment]::GetEnvironmentVariable('PATHFINDER_PG','Machine')
        if ($pgResta) {
            Write-Host "  PATHFINDER_PG resta impostata: il servizio, se reinstallato cosi', ripartira' su PostgreSQL." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Nessun servizio da rimuovere."
    }
    exit 0
}

# ── Controlli preliminari ───────────────────────────────────────────
Write-Host ""
Write-Host "  PATHFINDER - installazione del servizio dati" -ForegroundColor Cyan
Write-Host ""

$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) {
    Write-Host "  Node non risulta installato su questa macchina." -ForegroundColor Red
    Write-Host "  Installarlo da https://nodejs.org (versione LTS) e rilanciare."
    exit 1
}
Write-Host "  Node          $(node --version)  ->  $($node.Source)"

if (-not (Test-Path $Script)) {
    Write-Host "  Non trovo pathfinder-server.js accanto a questo script." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $Qui 'node_modules'))) {
    Write-Host "  Dipendenze mancanti: le installo..." -ForegroundColor Yellow
    Push-Location $Qui
    npm install --omit=dev --no-audit --no-fund
    Pop-Location
}
Write-Host "  Servizio      $Script"
Write-Host "  Porta         $Porta"

# ── Quale applicativo servire ───────────────────────────────────────
# L'html sta nella cartella che contiene questa, sia nel repository sia nel
# pacchetto di consegna: e' l'unica posizione che le due hanno in comune.
$Radice = Split-Path -Parent $Qui
if ($Applicativo) {
    if (-not (Test-Path $Applicativo)) {
        Write-Host "  L'applicativo indicato non esiste: $Applicativo" -ForegroundColor Red
        exit 1
    }
    $Applicativo = (Resolve-Path $Applicativo).Path
} else {
    $giaImpostato = [Environment]::GetEnvironmentVariable('PATHFINDER_APP', 'Machine')
    $candidati = @(Get-ChildItem -Path $Radice -Filter 'pathfinder-*.html' -File -ErrorAction SilentlyContinue |
                   Sort-Object Name)

    if ($candidati.Count -eq 1) {
        $Applicativo = $candidati[0].FullName
    }
    elseif ($giaImpostato -and (Test-Path $giaImpostato)) {
        # Reinstallazione su una macchina gia' in servizio. Cambiare da soli
        # la versione che i terminali vedono sarebbe la cosa peggiore: chi
        # reinstalla sta sistemando il servizio, non rilasciando una versione.
        $Applicativo = $giaImpostato
        Write-Host "  Applicativo   invariato (PATHFINDER_APP era gia' impostata)" -ForegroundColor Yellow
    }
    elseif ($candidati.Count -gt 1) {
        Write-Host ""
        Write-Host "  Accanto al servizio c'e' piu' di un applicativo:" -ForegroundColor Red
        foreach ($c in $candidati) { Write-Host "    $($c.Name)" }
        Write-Host ""
        Write-Host "  Quale versione vedano i terminali non e' una cosa da indovinare."
        Write-Host "  Rilancia indicandolo:"
        Write-Host "    .\installa-servizio.ps1 -Applicativo '..\$($candidati[-1].Name)'"
        exit 1
    }
    else {
        # Nessun .html, e va benissimo: dalla 1.7 l'applicativo e' una
        # CARTELLA, e il file singolo e' solo un ripiego. Su una macchina
        # nuova, installata dal pacchetto, di .html non ce n'e' nessuno — e
        # fermarsi qui vorrebbe dire non poter installare affatto.
        # Il servizio parte lo stesso: quello che serve e' PATHFINDER_APP_DIR,
        # e il pacchetto ci mette dentro la versione subito dopo.
        Write-Host "  Applicativo   nessun file singolo (si serve la cartella)" -ForegroundColor Yellow
    }
}
if ($Applicativo) { Write-Host "  Applicativo   $Applicativo" }

# ── Il database ─────────────────────────────────────────────────────
$cartellaDb = Split-Path -Parent $Database
if (-not (Test-Path $cartellaDb)) { New-Item -ItemType Directory -Force -Path $cartellaDb | Out-Null }
if (-not (Test-Path $CartellaBackup)) { New-Item -ItemType Directory -Force -Path $CartellaBackup | Out-Null }

if ($Database -like '*OneDrive*' -or $CartellaBackup -like '*OneDrive*') {
    Write-Host "  Il percorso indicato sta dentro OneDrive." -ForegroundColor Red
    Write-Host "  Un database aperto dentro una cartella sincronizzata è un modo noto"
    Write-Host "  di corromperlo. Indicare un percorso fuori da OneDrive con -Database."
    exit 1
}

# GUARDIA: non far nascere un database vuoto per distrazione.
# Il servizio, se non trova il file, ne crea uno nuovo e parte senza dire
# niente. Un magazzino che riapre la mattina su un archivio vuoto sembra un
# guasto gravissimo e invece è solo un percorso sbagliato: meglio fermarsi.
$vecchioDefault = Join-Path $Qui 'data\pathfinder.db'
if (-not (Test-Path $Database)) {
    if (Test-Path $vecchioDefault) {
        Write-Host ""
        Write-Host "  Il database indicato non esiste, ma ce n'è uno nel percorso storico:" -ForegroundColor Red
        Write-Host "    $vecchioDefault"
        Write-Host ""
        Write-Host "  NON copiarlo con Copy-Item: è aperto e ha un WAL accanto. Con il"
        Write-Host "  servizio in funzione, chiedergli lui una copia coerente:"
        Write-Host ""
        Write-Host "    Invoke-RestMethod -Uri http://127.0.0.1:$Porta/api/backup -Method Post ``"
        Write-Host "      -Body (@{dir='$cartellaDb'} | ConvertTo-Json) -ContentType 'application/json'"
        Write-Host ""
        Write-Host "  poi rinominare il file prodotto in '$(Split-Path -Leaf $Database)' e rilanciare."
        exit 1
    }
    Write-Host "  Database      non esiste ancora: verrà creato vuoto" -ForegroundColor Yellow
} else {
    $mb = [math]::Round((Get-Item $Database).Length / 1MB, 1)
    Write-Host "  Database      $Database  ($mb MB)"
}
Write-Host "  Backup        $CartellaBackup  (ogni sera alle $OraBackup)"

# I percorsi si dichiarano qui, una volta, e li eredita il servizio come SYSTEM.
[Environment]::SetEnvironmentVariable('PATHFINDER_DB',   $Database,     'Machine')
[Environment]::SetEnvironmentVariable('PATHFINDER_PORT', "$Porta",      'Machine')
[Environment]::SetEnvironmentVariable('PATHFINDER_APP',  $Applicativo,  'Machine')
$env:PATHFINDER_APP  = $Applicativo

# 1.7 — la cartella dell'applicativo. È l'ULTIMA volta che questa variabile
# viene toccata: da qui in poi la giunzione `corrente` si ripunta, e la
# variabile resta dov'è. Si imposta anche se la giunzione non esiste ancora —
# il servizio avvisa e resta vivo, e `installa-versione.ps1` la crea.
[Environment]::SetEnvironmentVariable('PATHFINDER_APP_DIR', $CartellaApplicativo, 'Machine')
$env:PATHFINDER_APP_DIR = $CartellaApplicativo
if (Test-Path $CartellaApplicativo) {
    Write-Host "  Applicativo   $CartellaApplicativo  (cartella)"
} else {
    Write-Host "  Applicativo   $CartellaApplicativo  — non esiste ancora" -ForegroundColor Yellow
    Write-Host "                si crea con: .\installa-versione.ps1 -Da <cartella> -Versione <numero>"
}
$env:PATHFINDER_DB   = $Database
$env:PATHFINDER_PORT = "$Porta"

# ── 2.7 · Quale database ────────────────────────────────────────────
# Si scrive SEMPRE, anche vuota: una variabile lasciata da un'installazione
# di prima manderebbe il servizio su un database che nessuno ha piu' in
# mente. Vuota vuol dire SQLite, ed e' dichiarato, non dedotto.
[Environment]::SetEnvironmentVariable('PATHFINDER_PG', $PostgreSQL, 'Machine')
$env:PATHFINDER_PG = $PostgreSQL
if ($PostgreSQL) {
    $mascherata = $PostgreSQL -replace '://[^@]*@', '://***@'
    Write-Host "  Database      PostgreSQL  $mascherata" -ForegroundColor Cyan
    Write-Host "                il file SQLite resta a $Database, intatto"
} else {
    Write-Host "  Database      SQLite  $Database"
}

# ── Chi occupa la porta ─────────────────────────────────────────────
# Un'istanza avviata a mano tiene la porta e continuerebbe a servire il
# database vecchio: da fuori sembra che l'installazione non abbia avuto
# effetto. Va tolta di mezzo prima, non dopo.
foreach ($c in @(Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)) {
    try {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
        Write-Host "  Porta $Porta    liberata (processo $($c.OwningProcess) fermato)" -ForegroundColor Yellow
    } catch {
        Write-Host "  Non riesco a liberare la porta $Porta (processo $($c.OwningProcess))." -ForegroundColor Red
        exit 1
    }
}

# ── Apertura della porta sul firewall ───────────────────────────────
# Serve solo se altri terminali devono collegarsi da rete. In locale non
# cambierebbe niente, ma il caso d'uso dichiarato è più postazioni.
$regola = "Pathfinder $Porta"
if (-not (Get-NetFirewallRule -DisplayName $regola -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $regola -Direction Inbound -Protocol TCP `
        -LocalPort $Porta -Action Allow -Profile Domain,Private | Out-Null
    Write-Host "  Firewall      porta $Porta aperta su rete aziendale e privata" -ForegroundColor Green
} else {
    Write-Host "  Firewall      regola già presente"
}

# ── Registrazione ───────────────────────────────────────────────────
if (Get-ScheduledTask -TaskName $NomeAttivita -ErrorAction SilentlyContinue) {
    Write-Host "  Servizio già registrato: lo sostituisco." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $NomeAttivita -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $NomeAttivita -Confirm:$false
}

$azione = New-ScheduledTaskAction -Execute $node.Source `
    -Argument "`"$Script`"" -WorkingDirectory $Qui

# All'accensione, senza bisogno che qualcuno faccia login.
$trigger = New-ScheduledTaskTrigger -AtStartup

# SYSTEM: gira anche a schermata di blocco e senza utenti collegati.
$identita = New-ScheduledTaskPrincipal -UserId 'SYSTEM' `
    -LogonType ServiceAccount -RunLevel Highest

# Se cade, riparte: tre tentativi a un minuto di distanza. Nessun limite
# di durata, perché deve restare acceso quanto la macchina.
$opzioni = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $NomeAttivita -Action $azione -Trigger $trigger `
    -Principal $identita -Settings $opzioni `
    -Description 'Database di Pathfinder. Serve l''applicativo e i dati ai terminali di magazzino.' | Out-Null

Start-ScheduledTask -TaskName $NomeAttivita
Start-Sleep -Seconds 3

# ── Il backup serale ────────────────────────────────────────────────
if (Get-ScheduledTask -TaskName $NomeBackup -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $NomeBackup -Confirm:$false
}
if (Test-Path $ScriptBackup) {
    $argBackup = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptBackup`"" +
                 " -Porta $Porta -Cartella `"$CartellaBackup`"" +
                 " -GiorniDiConservazione $GiorniDiConservazione"

    $azioneB = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument $argBackup -WorkingDirectory $Qui

    # Ogni giorno. Se la macchina era spenta all'ora prevista, -StartWhenAvailable
    # lo fa recuperare appena si riaccende invece di saltare la giornata.
    $triggerB = New-ScheduledTaskTrigger -Daily -At $OraBackup

    $opzioniB = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew

    Register-ScheduledTask -TaskName $NomeBackup -Action $azioneB -Trigger $triggerB `
        -Principal $identita -Settings $opzioniB `
        -Description 'Copia serale del database di Pathfinder, chiesta al servizio.' | Out-Null

    Write-Host "  Backup serale registrato per le $OraBackup" -ForegroundColor Green
} else {
    Write-Host "  backup-serale.ps1 non trovato: backup NON registrato." -ForegroundColor Yellow
}

# ── Verifica ────────────────────────────────────────────────────────
Write-Host ""
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/health" -TimeoutSec 5
    Write-Host "  SERVIZIO ATTIVO" -ForegroundColor Green
    Write-Host "  database      $($r.file)"
    Write-Host "  revisione     $($r.revision)"

    # Non basta che il servizio risponda: deve rispondere DAL database
    # giusto. E' l'unica prova che la variabile e' arrivata fin dentro il
    # processo che gira come SYSTEM.
    #
    # DUE DATABASE, DUE COSE DA CONFRONTARE — 2.7. Fino alla 2.6 qui si
    # confrontava sempre col percorso del file SQLite, e su PostgreSQL una
    # installazione RIUSCITA usciva con «il servizio ha aperto un altro
    # database» e codice 1. Un avviso che grida al lupo su un'installazione
    # riuscita e' come non averlo: la volta che serve, nessuno lo legge.
    if ($PostgreSQL) {
        # Il servizio maschera la password: si confronta il database, che e'
        # la parte che dice se sta parlando col posto giusto.
        $nomeAtteso  = ($PostgreSQL  -split '/')[-1] -replace '\?.*$', ''
        $nomeRisposto = ($r.file     -split '/')[-1] -replace '\?.*$', ''
        if ($r.file -notmatch '^postgres' -or $nomeRisposto -ne $nomeAtteso) {
            Write-Host ''
            Write-Host '  ATTENZIONE: il servizio non ha aperto il PostgreSQL indicato.' -ForegroundColor Red
            Write-Host "  atteso:  database '$nomeAtteso' su PostgreSQL"
            Write-Host "  aperto:  $($r.file)"
            Write-Host '  PATHFINDER_PG viene letta all avvio del processo, non al volo.'
            exit 1
        }
    }
    elseif ($r.file -ne $Database) {
        Write-Host ''
        Write-Host '  ATTENZIONE: il servizio ha aperto un altro database.' -ForegroundColor Red
        Write-Host "  atteso:  $Database"
        Write-Host "  aperto:  $($r.file)"
        Write-Host '  Riavviare la macchina e ricontrollare: PATHFINDER_DB viene letta'
        Write-Host "  all'avvio del processo, non al volo."
        exit 1
    }

    # Stessa prova per l'applicativo: che risponda non basta, deve servire il
    # file giusto. E' l'errore che da fuori sembra "l'aggiornamento non ha
    # avuto effetto" e invece e' il servizio che guarda da un'altra parte.
    # 1.7 — la verifica dipende da COME il servizio sta servendo. In modo
    # cartella non esiste piu' un `app_file`, e confrontarlo con quello atteso
    # dava un allarme falso a installazione perfettamente riuscita: lo si
    # confronta con niente, e niente e' sempre diverso.
    $info = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/app-info" -TimeoutSec 5

    if ($info.modo -eq 'cartella') {
        # ── 2.10 · ALLA PRIMA INSTALLAZIONE L'APPLICATIVO NON C'E' ANCORA ────
        #
        #  Questo e' il passo 2 di 3, e l'applicativo arriva al 3. Su una
        #  macchina vergine `C:\Pathfinder\app\corrente` non esiste, quindi
        #  `/api/app-info` risponde `punta_a`, `versione` e `impronta` a null —
        #  e lo dice, con un `errore` scritto apposta.
        #
        #  Le due righe qui sotto lo davano invece per scontato, e tutte e due
        #  sbagliavano: `Split-Path -Leaf $null` alza «Impossibile associare
        #  l'argomento al parametro 'Path' perche' e' null», che il `catch` in
        #  fondo traduce in «il servizio risulta registrato ma non risponde» —
        #  cioe' un messaggio che parla di un guasto che non c'e', mentre il
        #  servizio ha appena scritto SERVIZIO ATTIVO due righe sopra. E anche
        #  correggendo quella riga, il controllo del manifesto sotto avrebbe
        #  fatto `exit 1` su una condizione NORMALE a questo punto, fermando
        #  l'installazione un passo prima di quello che l'avrebbe risolta.
        #
        #  Non si vedeva da mesi perche' ogni installazione era un
        #  AGGIORNAMENTO, e li' `corrente` c'e' gia'. E' uscito il 27/08,
        #  rinominando `C:\Pathfinder` per provare un'installazione vergine.
        if (-not $info.punta_a) {
            Write-Host "  applicativo   arriva al passo dopo — la cartella non c'e' ancora" -ForegroundColor Yellow
            Write-Host "                $CartellaApplicativo"
        }
        else {
            Write-Host "  applicativo   $($info.versione)  ->  $(Split-Path -Leaf $info.punta_a)"
            Write-Host "  impronta      $($info.impronta)"
            if (-not $info.versione -or -not $info.impronta) {
                Write-Host ""
                Write-Host "  ATTENZIONE: la cartella servita non ha un manifesto leggibile." -ForegroundColor Red
                Write-Host "  cartella: $($info.punta_a)"
                Write-Host "  Il servizio risponde, ma non si puo' dire QUALE versione:"
                Write-Host "  reinstallare la versione con .\installa-versione.ps1"
                exit 1
            }
        }
    }
    else {
        Write-Host "  applicativo   $($info.app_file)"
        if ($info.app_file -ne $Applicativo) {
            Write-Host ""
            Write-Host "  ATTENZIONE: il servizio sta servendo un altro applicativo." -ForegroundColor Red
            Write-Host "  atteso:  $Applicativo"
            Write-Host "  servito: $($info.app_file)"
            exit 1
        }
    }

    # Un backup si prova il giorno che lo si installa, non la notte che serve.
    if (Get-ScheduledTask -TaskName $NomeBackup -ErrorAction SilentlyContinue) {
        Start-ScheduledTask -TaskName $NomeBackup
        Start-Sleep -Seconds 5
        # 2.10 — L'ESTENSIONE LA DECIDE IL DATABASE, e questo filtro conosceva
        # solo SQLite: su PostgreSQL il backup e' un `.dump` scritto da
        # `pg_dump`, e cercando `pathfinder-*.db` la prova diceva «NON
        # riuscita» su un backup perfettamente riuscito. E' la stessa regola
        # gia' scritta nella rotta `/api/backup`: l'estensione la dice il
        # driver, e chi guarda non deve sapere quale dei due c'e' dietro.
        $ultimo = Get-ChildItem $CartellaBackup -Filter 'pathfinder-*' -ErrorAction SilentlyContinue |
                  Where-Object { $_.Extension -in '.db', '.dump' } |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($ultimo) {
            Write-Host "  backup        $($ultimo.Name)  ($([math]::Round($ultimo.Length/1MB,1)) MB) - prova riuscita" -ForegroundColor Green
        } else {
            Write-Host "  backup        prova NON riuscita: vedere $CartellaBackup\backup.log" -ForegroundColor Red
        }
    }
    Write-Host ""
    Write-Host "  Su questa macchina:  http://localhost:$Porta/"
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
           Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
           Select-Object -First 1).IPAddress
    if ($ip) { Write-Host "  Dagli altri terminali:  http://${ip}:$Porta/" }
    Write-Host ""
    Write-Host "  Metti quell'indirizzo come pagina iniziale sui terminali." -ForegroundColor Cyan
} catch {
    # ── 2.10 · DUE GUASTI DIVERSI NON SI RACCONTANO ALLO STESSO MODO ────────
    #
    #  Questo `catch` copre tutto il blocco di verifica, e fino alla 2.10
    #  diceva sempre «il servizio non risponde». Ma dentro quel blocco ci sono
    #  anche righe di PowerShell che possono rompersi da sole — ed e'
    #  successo: un `Split-Path` su un valore nullo ha fatto stampare «non
    #  risponde» due righe sotto un SERVIZIO ATTIVO scritto dal servizio
    #  stesso. Chi legge va a cercare un guasto che non c'e', in Utilita' di
    #  pianificazione, e l'errore vero e' nello script che sta leggendo.
    #
    #  Si chiede al servizio un'altra volta: se risponde, il guasto e' qui.
    $vivo = $false
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/health" -TimeoutSec 5
        $vivo = $true
    } catch { }

    Write-Host ""
    if ($vivo) {
        Write-Host "  IL SERVIZIO RISPONDE: il guasto e' in questo script." -ForegroundColor Red
        Write-Host "  La verifica dell'installazione si e' rotta, non l'installazione."
    } else {
        Write-Host "  Il servizio risulta registrato ma non risponde." -ForegroundColor Red
        Write-Host "  Controlla in Utilità di pianificazione -> '$NomeAttivita'."
    }
    Write-Host "  Errore: $($_.Exception.Message)"
    if ($_.InvocationInfo) {
        Write-Host "  Riga $($_.InvocationInfo.ScriptLineNumber): $($_.InvocationInfo.Line.Trim())"
    }
    exit 1
}
Write-Host ""
