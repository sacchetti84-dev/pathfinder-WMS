<#
  Pathfinder — installa una versione dell'applicativo
  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

  Copia una cartella di consegna in C:\Pathfinder\app\pathfinder-<versione>\ e
  ci fa puntare la giunzione `corrente`, spostando quella di prima su
  `precedente`.

  NON SERVE L'AMMINISTRATORE, e non serve riavviare il servizio: Express
  risolve il percorso a ogni richiesta, e le giunzioni non sono i collegamenti
  simbolici — quelle si creano da un utente qualunque.

      .\installa-versione.ps1 -Da ..\consegna -Versione 1.7

  Accetta anche una vecchia consegna a FILE SINGOLO: la avvolge in una
  cartella con dentro il solo `index.html` e le genera il manifesto. E' cosi'
  che la 1.6.1 entra nel modello nuovo e resta una via di ritorno valida.

      .\installa-versione.ps1 -Da ..\pathfinder-1.6.1.html -Versione 1.6.1
#>

param(
    [Parameter(Mandatory = $true)][string]$Da,
    [Parameter(Mandatory = $true)][string]$Versione,
    [string]$Casa = 'C:\Pathfinder\app'
)

$ErrorActionPreference = 'Stop'

# ── Le giunzioni, che sono la parte che si puo' sbagliare ───────────────────
# MAI `Remove-Item -Recurse` su una giunzione: in PowerShell 5.1 puo' seguire
# il collegamento e svuotare LA CARTELLA DI DESTINAZIONE invece di togliere il
# collegamento. Qui si toglie il solo punto di rimando, con la chiamata .NET
# che non guarda dentro; `rmdir` di cmd fa lo stesso ed e' il ripiego.
function Togli-Giunzione([string]$Percorso) {
    if (-not (Test-Path $Percorso)) { return }
    try { [System.IO.Directory]::Delete($Percorso, $false) }
    catch { cmd /c rmdir "`"$Percorso`"" | Out-Null }
}

function Punta-Giunzione([string]$Percorso, [string]$Verso) {
    Togli-Giunzione $Percorso
    try { New-Item -ItemType Junction -Path $Percorso -Target $Verso | Out-Null }
    catch { cmd /c mklink /J "`"$Percorso`"" "`"$Verso`"" | Out-Null }
    if (-not (Test-Path $Percorso)) { throw "Giunzione non creata: $Percorso" }
}

function Dove-Punta([string]$Percorso) {
    if (-not (Test-Path $Percorso)) { return $null }
    $t = (Get-Item $Percorso -Force).Target
    if ($t -is [array]) { return $t[0] }
    return $t
}

function Sha256File([string]$File) {
    return (Get-FileHash -Path $File -Algorithm SHA256).Hash.ToLower()
}

# `Out-File -Encoding utf8` in PowerShell 5.1 scrive UTF-8 CON BOM, e
# `JSON.parse` sul BOM lancia: il servizio leggerebbe un manifesto illeggibile
# e risponderebbe versione e impronta nulle — proprio il numero su cui si
# verifica un'installazione. Il servizio adesso lo tollera, ma il file giusto
# si scrive senza.
function Scrivi-SenzaBom([string]$Percorso, [string]$Testo) {
    [System.IO.File]::WriteAllText($Percorso, $Testo, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Host ""
Write-Host "  Pathfinder — installazione della versione $Versione" -ForegroundColor Cyan
Write-Host ""

# ── Da dove ────────────────────────────────────────────────────────────────
if (-not (Test-Path $Da)) {
    Write-Host "  Non esiste: $Da" -ForegroundColor Red
    exit 1
}
$Sorgente = (Resolve-Path $Da).Path
$eFile = (Get-Item $Sorgente) -isnot [System.IO.DirectoryInfo]

if (-not $eFile -and -not (Test-Path (Join-Path $Sorgente 'index.html'))) {
    Write-Host "  La cartella non contiene index.html: $Sorgente" -ForegroundColor Red
    Write-Host "  Una cartella di consegna si produce con 'npm run build'."
    exit 1
}

# ── Dove ───────────────────────────────────────────────────────────────────
$Destinazione = Join-Path $Casa "pathfinder-$Versione"

# Una versione installata e' di SOLA LETTURA. Reinstallare sopra una cartella
# che esiste gia' cancella la via di ritorno di chi ci era tornato: se la
# versione va rifatta, le si da' un numero suo — le build di prova ne portano
# piu' di due (1.7.1), ed e' esattamente a questo che servono.
if (Test-Path $Destinazione) {
    Write-Host "  Esiste gia': $Destinazione" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Una versione installata non si riscrive: chi ci tornasse indietro"
    Write-Host "  troverebbe un contenuto diverso sotto lo stesso numero. Dare un"
    Write-Host "  numero nuovo alla build, oppure togliere la cartella a mano se si"
    Write-Host "  e' certi che nessuno ci punta."
    exit 1
}

New-Item -ItemType Directory -Path $Casa -Force | Out-Null
New-Item -ItemType Directory -Path $Destinazione -Force | Out-Null

# ── La copia ───────────────────────────────────────────────────────────────
# Entra SOLO l'applicativo: l'indice, gli assets e il manifesto. Il servizio e
# il README viaggiano nella cartella di consegna ma non sono cio' che il
# browser scarica, e in una cartella-versione non hanno niente da fare.
if ($eFile) {
    Copy-Item $Sorgente (Join-Path $Destinazione 'index.html')
    Write-Host "  Avvolta una consegna a file singolo in index.html" -ForegroundColor Yellow
    Write-Host "  (senza .gz accanto: viaggia in chiaro, esattamente come faceva prima)"
} else {
    Copy-Item (Join-Path $Sorgente 'index.html*') $Destinazione
    $assets = Join-Path $Sorgente 'assets'
    if (Test-Path $assets) { Copy-Item $assets $Destinazione -Recurse }
    $man = Join-Path $Sorgente 'manifest.json'
    if (Test-Path $man) { Copy-Item $man $Destinazione }
}

# ── Il manifesto, se la consegna non ne aveva uno ──────────────────────────
# Stessa formula di `vite.config.js`: l'impronta e' lo sha256 dell'elenco
# ordinato `percorso:sha256`. Se le due formule divergono, due macchine con lo
# stesso applicativo dichiarano impronte diverse — ed e' l'unico numero su cui
# si verifica un'installazione.
$Manifesto = Join-Path $Destinazione 'manifest.json'
if (-not (Test-Path $Manifesto)) {
    $indice = Join-Path $Destinazione 'index.html'
    $sha = Sha256File $indice
    $byte = (Get-Item $indice).Length
    $righe = "index.html:$sha"
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $impronta = ($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($righe)) |
                 ForEach-Object { $_.ToString('x2') }) -join ''
    $json = @{
        versione    = $Versione
        costruita   = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        byte_totali = $byte
        file        = @(@{ percorso = 'index.html'; byte = $byte; sha256 = $sha })
        impronta    = $impronta
    } | ConvertTo-Json -Depth 5
    Scrivi-SenzaBom $Manifesto $json
    Write-Host "  Manifesto generato — impronta $impronta"
}

# ── Lo scambio delle giunzioni ─────────────────────────────────────────────
$Corrente = Join-Path $Casa 'corrente'
$Precedente = Join-Path $Casa 'precedente'
$eraCorrente = Dove-Punta $Corrente

if ($eraCorrente) {
    Punta-Giunzione $Precedente $eraCorrente
    Write-Host "  precedente  -> $(Split-Path -Leaf $eraCorrente)"
}
Punta-Giunzione $Corrente $Destinazione
Write-Host "  corrente    -> $(Split-Path -Leaf $Destinazione)" -ForegroundColor Green

$m = Get-Content $Manifesto -Raw | ConvertFrom-Json
Write-Host ""
Write-Host "  versione    $($m.versione)"
Write-Host "  impronta    $($m.impronta)"
Write-Host ""
Write-Host "  Nessun riavvio: il servizio risolve la giunzione a ogni richiesta." -ForegroundColor Cyan
Write-Host "  Verificare con:"
Write-Host "    Invoke-RestMethod http://127.0.0.1:4173/api/app-info"
Write-Host ""
Write-Host "  Il ritorno indietro e' un comando: .\torna-indietro.ps1"
Write-Host ""
