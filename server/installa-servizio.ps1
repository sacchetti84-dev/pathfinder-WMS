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
#  Si lancia UNA VOLTA, da PowerShell come amministratore:
#      .\installa-servizio.ps1
#
#  Con percorsi diversi da quelli predefiniti:
#      .\installa-servizio.ps1 -Database 'D:\Pathfinder\data\pathfinder.db'
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
    [int]$GiorniDiConservazione = 0
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
Write-Host "  Applicativo   $Script"
Write-Host "  Porta         $Porta"

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

# Il percorso si dichiara qui, una volta, e lo eredita il servizio come SYSTEM.
[Environment]::SetEnvironmentVariable('PATHFINDER_DB',   $Database, 'Machine')
[Environment]::SetEnvironmentVariable('PATHFINDER_PORT', "$Porta",  'Machine')
$env:PATHFINDER_DB   = $Database
$env:PATHFINDER_PORT = "$Porta"

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

    # Non basta che il servizio risponda: deve rispondere DAL database giusto.
    # È l'unica prova che la variabile d'ambiente è arrivata fin dentro il
    # processo che gira come SYSTEM.
    if ($r.file -ne $Database) {
        Write-Host ""
        Write-Host "  ATTENZIONE: il servizio ha aperto un altro database." -ForegroundColor Red
        Write-Host "  atteso:  $Database"
        Write-Host "  aperto:  $($r.file)"
        Write-Host "  Riavviare la macchina e ricontrollare: PATHFINDER_DB viene letta"
        Write-Host "  all'avvio del processo, non al volo."
        exit 1
    }

    # Un backup si prova il giorno che lo si installa, non la notte che serve.
    if (Get-ScheduledTask -TaskName $NomeBackup -ErrorAction SilentlyContinue) {
        Start-ScheduledTask -TaskName $NomeBackup
        Start-Sleep -Seconds 5
        $ultimo = Get-ChildItem $CartellaBackup -Filter 'pathfinder-*.db' -ErrorAction SilentlyContinue |
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
    Write-Host "  Il servizio risulta registrato ma non risponde." -ForegroundColor Red
    Write-Host "  Controlla in Utilità di pianificazione -> '$NomeAttivita'."
    Write-Host "  Errore: $($_.Exception.Message)"
    exit 1
}
Write-Host ""
