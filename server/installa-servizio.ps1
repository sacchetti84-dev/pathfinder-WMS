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
#  Si lancia UNA VOLTA, da PowerShell come amministratore:
#      .\installa-servizio.ps1
#
#  Per toglierlo:
#      .\installa-servizio.ps1 -Disinstalla
# ═══════════════════════════════════════════════════════════════════

param(
    [switch]$Disinstalla,
    [int]$Porta = 4173
)

$ErrorActionPreference = 'Stop'
$NomeAttivita = 'Pathfinder - Servizio dati'
$Qui = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script = Join-Path $Qui 'pathfinder-server.js'

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
    if (Get-ScheduledTask -TaskName $NomeAttivita -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask  -TaskName $NomeAttivita -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $NomeAttivita -Confirm:$false
        Write-Host "  Servizio rimosso. Il database NON è stato toccato." -ForegroundColor Green
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

# ── Verifica ────────────────────────────────────────────────────────
Write-Host ""
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/health" -TimeoutSec 5
    Write-Host "  SERVIZIO ATTIVO" -ForegroundColor Green
    Write-Host "  database      $($r.file)"
    Write-Host "  revisione     $($r.revision)"
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
