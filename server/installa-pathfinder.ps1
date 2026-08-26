<#
  Pathfinder — installazione a doppio clic
  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

  Si lancia da «Installa Pathfinder.bat», che sta accanto a questo file dentro
  la cartella della versione. Non si digita niente: il pacchetto sa da solo se
  la macchina ha gia' Pathfinder o se e' la prima volta.

      Pathfinder <versione>\
        Installa Pathfinder.bat     <- doppio clic
        installa.ps1                <- questo
        app\                        l'applicativo: indice, assets, manifesto
        servizio\                   il servizio dati e i suoi script

  UNA VERSIONE E' L'APPLICATIVO PIU' IL SERVIZIO, e si installano insieme.
  Fino al 18/08/2026 un aggiornamento toccava il solo applicativo: il servizio
  restava quello del giorno dell'installazione, e `/api/app-info` rispondeva
  due numeri diversi — l'applicativo 1.8.2 e il servizio 1.8.1. Due numeri per
  una versione sola sono un numero che non vuol dire niente. Da qui l'installer
  copia anche il servizio e lo RIAVVIA, e alla fine i due numeri coincidono o
  l'installazione non e' riuscita.

  IL PREZZO, ed e' giusto saperlo: il servizio gira come SYSTEM da un'attivita'
  pianificata, e fermarlo chiede l'autorizzazione di Windows. Un aggiornamento
  quindi la chiede SEMPRE, non piu' solo la prima volta, e l'applicativo resta
  giu' i secondi del riavvio. Si installa a fine turno — §0 dell'INDEX.

  DOVE SI INSTALLA lo si sceglie alla prima installazione, e da li' in poi non
  si tocca piu': da quella cartella discendono il servizio, il deposito delle
  versioni, il database e i backup. Aggiornando, l'installer la RILEGGE dalla
  macchina invece di riproporla — spostare un'installazione non e' installare,
  e chi ci prova si merita un rifiuto e non un secondo Pathfinder.

  IL SERVIZIO NON GIRA MAI DAL PACCHETTO. Viene copiato sotto la radice scelta
  e registrato da li'. Il 17/08/2026 si e' scoperto che girava dalla cartella
  di consegna, che la build azzera: un `npm run build` avrebbe cancellato il
  codice in esecuzione. Un pacchetto su una chiavetta e' la stessa trappola,
  con la chiavetta che si sfila.

  PER PROVARLO SENZA TOCCARE NIENTE:  .\installa.ps1 -NonChiedere -Prova
  Dice cosa farebbe — dove, quale versione, quale strada — ed esce.
#>

param(
    # Lo passa la seconda finestra, quella con i privilegi: dice che la
    # conferma e' gia' stata data e che non va richiesta due volte.
    [switch]$Elevato,
    # Non chiede niente e non aspetta nessun tasto: serve al collaudo, e a
    # un'installazione lanciata da un altro script. Un installer che non si
    # puo' provare senza una persona davanti non si prova, e infatti.
    [switch]$NonChiedere,
    # Dice cosa farebbe e non tocca niente. E' la prova che le decisioni —
    # quale radice, quale strada, quale versione — sono giuste, e si puo'
    # eseguire su una macchina in servizio senza conseguenze.
    [switch]$Prova,
    [int]$Porta = 4173,
    # La radice dell'installazione: da qui discendono servizio\, app\, data\ e
    # backup\. Vuota significa «decidi»: si chiede alla prima installazione, si
    # rilegge dalla macchina aggiornando.
    [string]$Radice = '',
    # Solo il banco: la casa delle versioni, se diversa da <radice>\app. Con
    # una casa finta l'installer non tocca niente di questa macchina.
    [string]$Casa = ''
)

$ErrorActionPreference = 'Stop'

# ── UN PARAMETRO SCRITTO MALE NON SIMULA: INSTALLA ─────────────────────────
# `powershell -File installa.ps1 -Prov` non da' errore. Lanciato con -File,
# PowerShell SCARTA IN SILENZIO gli argomenti che non trova nel `param()` e
# manda avanti lo script: chi credeva di simulare ha installato. Successo il
# 18/08/2026, su questa macchina, con `-Prova` chiesto a una copia
# dell'installer che quel parametro non ce l'aveva ancora.
# Quello che PowerShell scarta finisce in `$args`, ed e' l'unico posto da cui
# si puo' vedere. Se c'e' qualcosa li' dentro, non si tocca niente.
if ($args.Count) {
    Write-Host ""
    Write-Host "   Non ho capito questi argomenti, e non tocco niente:" -ForegroundColor Red
    Write-Host "     $($args -join ' ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "   PowerShell, lanciato con -File, li scarta senza dire niente: un"
    Write-Host "   parametro scritto male non simula un'installazione, ne fa una vera."
    Write-Host ""
    exit 1
}

$Qui = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Qui 'app'
$Servizio = Join-Path $Qui 'servizio'
$Indirizzo = "http://localhost:$Porta/"
$RADICE_PREDEFINITA = 'C:\Pathfinder'
$NomeAttivita = 'Pathfinder - Servizio dati'

function Titolo($testo) {
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor DarkCyan
    Write-Host "   $testo" -ForegroundColor Cyan
    Write-Host "  ============================================================" -ForegroundColor DarkCyan
    Write-Host ""
}

function Riga($etichetta, $valore, $colore = 'Gray') {
    Write-Host ("   {0,-14}" -f $etichetta) -NoNewline
    Write-Host $valore -ForegroundColor $colore
}

function Errore($testo) {
    Write-Host ""
    Write-Host "   $testo" -ForegroundColor Red
    Write-Host ""
    if (-not $NonChiedere) {
        Write-Host "   Premere un tasto per chiudere."
        [void]$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    }
    exit 1
}

function Amministratore {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function ServizioRisponde {
    try {
        $r = Invoke-RestMethod "http://127.0.0.1:$Porta/api/health" -TimeoutSec 3
        return [bool]$r.ok
    } catch { return $false }
}

# Una radice va scelta con la testa: dentro OneDrive un database aperto si
# corrompe — e' scritto in installa-servizio.ps1 e costava un turno.
function Controlla-Radice([string]$percorso) {
    if (-not $percorso) { return 'Il percorso di installazione non puo'' restare vuoto.' }
    if ($percorso -like '*OneDrive*') {
        return ("Il percorso sta dentro OneDrive: $percorso`n" +
                "   Un database aperto in una cartella sincronizzata e' un modo noto di corromperlo.")
    }
    if (-not [System.IO.Path]::IsPathRooted($percorso)) {
        return "Serve un percorso assoluto, con la lettera dell'unita': $percorso"
    }
    $unita = [System.IO.Path]::GetPathRoot($percorso)
    if (-not (Test-Path $unita)) { return "L'unita' $unita non esiste su questa macchina." }
    return $null
}

# Fermare e riaccendere il servizio dati. Non basta l'attivita' pianificata:
# un'istanza avviata a mano tiene la porta, e da fuori sembrerebbe che il
# riavvio non abbia avuto effetto — e' la stessa guardia di installa-servizio.
function Riavvia-Servizio {
    if (-not (Get-ScheduledTask -TaskName $NomeAttivita -ErrorAction SilentlyContinue)) {
        Errore ("L'attivita' pianificata «$NomeAttivita» non risulta registrata.`n" +
                "   Il servizio non si puo' riavviare: reinstallarlo con installa-servizio.ps1.")
    }
    Stop-ScheduledTask -TaskName $NomeAttivita -ErrorAction SilentlyContinue
    foreach ($c in @(Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {}
    }
    Start-Sleep -Milliseconds 500
    Start-ScheduledTask -TaskName $NomeAttivita
}

# ── Il pacchetto e' completo? ──────────────────────────────────────────────
if (-not (Test-Path (Join-Path $App 'index.html'))) { Errore "Pacchetto incompleto: manca app\index.html accanto a questo file." }
if (-not (Test-Path (Join-Path $Servizio 'pathfinder-server.js'))) { Errore "Pacchetto incompleto: manca servizio\pathfinder-server.js." }

$Manifesto = Join-Path $App 'manifest.json'
if (-not (Test-Path $Manifesto)) { Errore "Pacchetto incompleto: manca app\manifest.json, che dice quale versione e' questa." }
$m = Get-Content $Manifesto -Raw | ConvertFrom-Json
$Versione = $m.versione

Titolo "PATHFINDER $Versione  —  installazione"

# ── Cosa c'e' gia' su questa macchina ──────────────────────────────────────
$varApp = [Environment]::GetEnvironmentVariable('PATHFINDER_APP_DIR', 'Machine')
$vivo = ServizioRisponde
$aggiornamento = $vivo -and $varApp

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Errore ("Node non risulta installato su questa macchina.`n" +
            "   Installarlo da https://nodejs.org (versione LTS) e rilanciare questo pacchetto.")
}

# ── Dove si installa ───────────────────────────────────────────────────────
# Aggiornando la radice NON si chiede: la dice la macchina, ed e' quella da cui
# discende la cartella che il servizio sta gia' servendo.
if ($aggiornamento) {
    $radiceInstallata = Split-Path -Parent (Split-Path -Parent $varApp)
    if ($Radice -and ($Radice.TrimEnd('\') -ne $radiceInstallata.TrimEnd('\'))) {
        Errore ("Questa macchina ha Pathfinder in $radiceInstallata, e il percorso chiesto e' un altro:`n" +
                "   $Radice`n`n" +
                "   Spostare un'installazione non e' installare: si finirebbe con due Pathfinder,`n" +
                "   due database e un solo magazzino. Rilanciare senza -Radice per aggiornare`n" +
                "   quella che c'e', oppure spostarla a mano a servizio fermo.")
    }
    $Radice = $radiceInstallata
} else {
    if (-not $Radice) {
        $Radice = $RADICE_PREDEFINITA
        if (-not $NonChiedere -and -not $Elevato) {
            Write-Host ""
            Write-Host "   Dove si installa Pathfinder?" -ForegroundColor White
            Write-Host "   Da questa cartella discendono il servizio, le versioni, il database e i backup."
            Write-Host ""
            $scelto = Read-Host "   INVIO per $RADICE_PREDEFINITA, oppure digita un percorso"
            if ($scelto) { $Radice = $scelto.Trim('"').Trim() }
        }
    }
    $guaio = Controlla-Radice $Radice
    if ($guaio) { Errore $guaio }
}

$Radice = $Radice.TrimEnd('\')
$CasaServizio = Join-Path $Radice 'servizio'
$CasaApp      = if ($Casa) { $Casa } else { Join-Path $Radice 'app' }
$Database     = Join-Path $Radice 'data\pathfinder.db'
$CartellaBackup = Join-Path $Radice 'backup'

Riga 'Versione'  $Versione 'White'
Riga 'Impronta'  $m.impronta
Riga 'Contenuto' ("{0} file, {1:N0} byte" -f $m.file.Count, $m.byte_totali)
Riga 'Node' (node --version)
Riga 'Percorso' $Radice 'White'
if ($Casa) { Riga 'Casa versioni' $Casa 'Yellow' }
Write-Host ""

if ($aggiornamento) {
    Riga 'Macchina' 'Pathfinder e'' gia'' installato e in funzione' 'Green'
    Write-Host ""
    Write-Host "   Verranno installati insieme, e alla fine porteranno lo stesso numero:" -ForegroundColor White
    Write-Host "     - l'applicativo $Versione"
    Write-Host "     - il servizio dati $Versione, che viene RIAVVIATO"
    Write-Host ""
    Write-Host "   Windows chiedera' l'autorizzazione: fermare il servizio la vuole." -ForegroundColor Yellow
    Write-Host "   L'applicativo resta giu' i secondi del riavvio. Il database NON viene toccato."
} else {
    Riga 'Macchina' 'Pathfinder non c''e'' ancora: prima installazione' 'Yellow'
    Write-Host ""
    Write-Host "   Verranno installati:" -ForegroundColor White
    Write-Host "     - il servizio dati in $CasaServizio"
    Write-Host "     - l'avvio automatico all'accensione e il backup serale delle 20:00"
    Write-Host "     - l'apertura della porta $Porta sul firewall, per gli altri terminali"
    Write-Host "     - il database in $(Split-Path -Parent $Database) (vuoto, se non c'e' gia')"
    Write-Host "     - l'applicativo $Versione"
    Write-Host ""
    Write-Host "   Windows chiedera' l'autorizzazione una volta sola." -ForegroundColor Yellow
}

# ── La prova: si dice cosa si farebbe, e non si tocca niente ───────────────
if ($Prova) {
    Write-Host ""
    Riga 'PROVA' 'nessuna modifica: ecco cosa farebbe' 'Cyan'
    Riga 'strada'   $(if ($aggiornamento) { 'aggiornamento' } else { 'prima installazione' })
    Riga 'radice'   $Radice
    Riga 'servizio' $CasaServizio
    Riga 'versioni' $CasaApp
    Riga 'database' $Database
    Riga 'backup'   $CartellaBackup
    Riga 'riavvio'  $(if ($aggiornamento) { 'si'' — il servizio viene fermato e riacceso' } else { 'lo fa installa-servizio.ps1' })
    Write-Host ""
    exit 0
}

# ── Conferma ───────────────────────────────────────────────────────────────
# Solo nella prima finestra: la seconda, quella elevata, eredita la decisione.
if (-not $Elevato -and -not $NonChiedere) {
    Write-Host ""
    Write-Host "   INVIO per procedere, ESC per annullare." -ForegroundColor White
    do {
        $t = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        if ($t.VirtualKeyCode -eq 27) { Write-Host "`n   Annullato. Non e' stato cambiato niente.`n"; exit 0 }
    } until ($t.VirtualKeyCode -eq 13)
}

# ── L'amministratore serve sempre, adesso ──────────────────────────────────
# Prima serviva alla sola prima installazione, perche' un aggiornamento
# toccava file e basta. Adesso ferma un'attivita' pianificata che gira come
# SYSTEM, e quella la ferma solo un amministratore.
if (-not (Amministratore)) {
    Write-Host ""
    Write-Host "   Chiedo l'autorizzazione a Windows..." -ForegroundColor Yellow
    $argomenti = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$($MyInvocation.MyCommand.Path)`"",
                   '-Elevato', '-Porta', "$Porta", '-Radice', "`"$Radice`"")
    if ($Casa) { $argomenti += @('-Casa', "`"$Casa`"") }
    try {
        Start-Process powershell -Verb RunAs -ArgumentList $argomenti | Out-Null
    } catch {
        Errore ("Autorizzazione negata: senza non si puo' installare.`n" +
                "   Rilanciare e rispondere Si' alla richiesta di Windows.")
    }
    Write-Host "   L'installazione continua nell'altra finestra." -ForegroundColor Green
    Write-Host ""
    exit 0
}

# ── Prima installazione: il servizio nasce ─────────────────────────────────
if (-not $aggiornamento) {
    Titolo "1 di 2  —  il servizio dati"

    # Il servizio si copia FUORI dal pacchetto, e da li' viene registrato:
    # l'attivita' pianificata memorizza il percorso da cui viene lanciata, e
    # una chiavetta sfilata sarebbe un magazzino fermo al riavvio.
    New-Item -ItemType Directory -Path $CasaServizio -Force | Out-Null
    Copy-Item (Join-Path $Servizio '*') $CasaServizio -Recurse -Force
    Riga 'Copiato in' $CasaServizio 'Green'

    & (Join-Path $CasaServizio 'installa-servizio.ps1') -Porta $Porta `
        -Database $Database -CartellaBackup $CartellaBackup `
        -CartellaApplicativo (Join-Path $CasaApp 'corrente')
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { Errore "L'installazione del servizio non e' andata a buon fine." }
}

# ── L'applicativo, e il servizio che porta lo stesso numero ────────────────
Titolo "$(if ($aggiornamento) { 'Installazione' } else { '2 di 2' })  —  l'applicativo $Versione"

if ($aggiornamento) {
    # SI FERMA PRIMA DI COPIARE, e si riaccende comunque vada.
    # L'ordine non e' estetico: copiando a servizio fermo, gli script di
    # gestione che l'installazione userA' fra due righe sono gia' quelli del
    # pacchetto, e la macchina fa il gesto nuovo invece di quello del giorno
    # in cui e' nata. Il `finally` esiste perche' un'installazione fallita a
    # meta' deve lasciare acceso quello che ha spento.
    Write-Host "   Fermo il servizio dati..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $NomeAttivita -ErrorAction SilentlyContinue
    foreach ($c in @(Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {}
    }

    try {
        New-Item -ItemType Directory -Path $CasaServizio -Force | Out-Null
        Copy-Item (Join-Path $Servizio '*') $CasaServizio -Recurse -Force
        Riga 'Servizio' "$Versione in $CasaServizio" 'Green'

        # LE DIPENDENZE NON VIAGGIANO NEL PACCHETTO, e `node_modules` che
        # ESISTE non vuol dire che sia quello giusto — 2.7.
        #
        # Fino alla 2.6 qui si guardava solo se la cartella c'era. Bastava
        # finche' l'elenco delle dipendenze non cambiava mai; la 2.7 ha
        # aggiunto `pg`, e una `node_modules` rimasta dalla 2.6 avrebbe
        # superato il controllo lasciando il servizio senza il driver. Con
        # PATHFINDER_PG impostata non sarebbe partito affatto: i terminali
        # vedono bianco e il magazzino si ferma.
        #
        # Si guarda dipendenza per dipendenza, come le dichiara package.json.
        $nm = Join-Path $CasaServizio 'node_modules'
        $dichiarate = @()
        try {
            $pkg = Get-Content (Join-Path $CasaServizio 'package.json') -Raw | ConvertFrom-Json
            if ($pkg.dependencies) { $dichiarate = @($pkg.dependencies.PSObject.Properties.Name) }
        } catch { }
        $mancanti = @($dichiarate | Where-Object { -not (Test-Path (Join-Path $nm $_)) })

        if ((-not (Test-Path $nm)) -or $mancanti.Count -gt 0) {
            if ($mancanti.Count -gt 0) {
                Write-Host "   Dipendenze del servizio da installare: $($mancanti -join ', ')" -ForegroundColor Yellow
            } else {
                Write-Host '   Dipendenze del servizio mancanti: le installo...' -ForegroundColor Yellow
            }
            Push-Location $CasaServizio
            npm install --omit=dev --no-audit --no-fund
            Pop-Location

            # NON SI VA AVANTI SPERANDO. Se dopo npm install ne manca ancora
            # una, il servizio non partira': meglio fermare l'installazione
            # adesso, con scritto quale, che riavviarlo e scoprirlo domani.
            $ancora = @($dichiarate | Where-Object { -not (Test-Path (Join-Path $nm $_)) })
            if ($ancora.Count -gt 0) {
                throw "Dopo npm install mancano ancora: $($ancora -join ', '). Il servizio non partirebbe."
            }
        }

        & (Join-Path $CasaServizio 'installa-versione.ps1') -Da $App -Versione $Versione -Casa $CasaApp
    } finally {
        Write-Host "   Riaccendo il servizio dati..." -ForegroundColor Yellow
        Riavvia-Servizio
    }
} else {
    & (Join-Path $CasaServizio 'installa-versione.ps1') -Da $App -Versione $Versione -Casa $CasaApp
}

# ── Verifica ───────────────────────────────────────────────────────────────
# Due numeri, non piu' uno: l'impronta dell'applicativo e la versione del
# servizio. Se non coincidono entrambe, l'installazione non e' riuscita — ed e'
# esattamente il difetto che il 18/08 non aveva nessuno che lo dicesse.
Titolo "Verifica"

$esito = $null
foreach ($tentativo in 1..30) {
    try { $esito = Invoke-RestMethod "http://127.0.0.1:$Porta/api/app-info" -TimeoutSec 3 } catch { $esito = $null }
    if ($esito -and $esito.impronta) { break }
    Start-Sleep -Seconds 1
}

if (-not $esito) {
    Errore ("Il servizio non risponde sulla porta $Porta.`n" +
            "   L'applicativo e' installato, ma qualcosa impedisce al servizio di partire.`n" +
            "   Guardare in Utilita' di pianificazione -> «$NomeAttivita».")
}

if ($esito.impronta -ne $m.impronta) {
    Write-Host "   Il servizio sta servendo un'altra versione:" -ForegroundColor Red
    Riga 'in servizio' "$($esito.versione)  $($esito.impronta)"
    Riga 'attesa'      "$Versione  $($m.impronta)"
    if ($esito.errore) { Riga 'errore' $esito.errore 'Red' }
    Errore "Installazione NON riuscita."
}

if ($esito.service_version -ne $Versione) {
    Write-Host "   L'applicativo e' $Versione, il servizio dice un altro numero:" -ForegroundColor Red
    Riga 'applicativo' $esito.versione
    Riga 'servizio'    $esito.service_version
    Errore ("Il servizio non e' quello di questa versione.`n" +
            "   Se il numero e' quello di prima, il riavvio non ha avuto effetto:`n" +
            "   Node legge all'avvio, e il processo in esecuzione e' ancora il vecchio.")
}

Riga 'Versione'  $esito.versione 'Green'
Riga 'Servizio'  $esito.service_version 'Green'
Riga 'Impronta'  $esito.impronta 'Green'
Riga 'Database'  ([Environment]::GetEnvironmentVariable('PATHFINDER_DB', 'Machine'))
Riga 'Indirizzo' $Indirizzo 'White'
Write-Host ""
Write-Host "   Fatto. Sugli altri terminali mettere questo indirizzo come pagina iniziale:" -ForegroundColor Green
$rete = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
         Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
         Select-Object -First 1).IPAddress
if ($rete) { Write-Host "     http://${rete}:$Porta/" -ForegroundColor White }
Write-Host ""

if (-not $NonChiedere) { Start-Process $Indirizzo }

if ($Elevato -and -not $NonChiedere) {
    Write-Host "   Premere un tasto per chiudere."
    [void]$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
