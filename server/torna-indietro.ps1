<#
  Pathfinder — torna alla versione precedente
  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

  Scambia le due giunzioni: `corrente` e `precedente` si invertono. Un comando,
  nessun riavvio, nessun amministratore — e rilanciandolo si torna avanti,
  perche' lo scambio e' simmetrico.

      .\torna-indietro.ps1

  PRIMA DI TORNARE INDIETRO C'E' UN GESTO PIU' PICCOLO: spegnere l'interruttore
  della funzione che da' fastidio, da Configurazione -> Funzioni. Un rilascio si
  disinstalla, una funzione si spegne, e le due cose si confondono solo se si
  accendono nello stesso turno in cui si installa.

  Il DATABASE non si tocca, in nessun caso: un rilascio si disinstalla
  rimettendo l'applicativo di prima, e i dati restano dove sono.
#>

param(
    [string]$Casa = 'C:\Pathfinder\app'
)

$ErrorActionPreference = 'Stop'

# MAI `Remove-Item -Recurse` su una giunzione: in PowerShell 5.1 puo' seguire
# il collegamento e svuotare la cartella di destinazione. Vedi
# installa-versione.ps1, stessa ragione e stessa coppia di funzioni.
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

$Corrente = Join-Path $Casa 'corrente'
$Precedente = Join-Path $Casa 'precedente'

$ora = Dove-Punta $Corrente
$prima = Dove-Punta $Precedente

if (-not $prima) {
    Write-Host ""
    Write-Host "  Non c'e' una via di ritorno: `precedente` non punta a niente." -ForegroundColor Red
    Write-Host "  Le versioni installate stanno in $Casa — si torna a una qualunque con:"
    Write-Host "    .\installa-versione.ps1 -Da <cartella> -Versione <numero>"
    Write-Host ""
    exit 1
}
if (-not (Test-Path $prima)) {
    Write-Host "  La versione precedente non esiste piu' sul disco: $prima" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Pathfinder — ritorno indietro" -ForegroundColor Cyan
Write-Host "    da  $(Split-Path -Leaf $ora)"
Write-Host "    a   $(Split-Path -Leaf $prima)" -ForegroundColor Green
Write-Host ""

Punta-Giunzione $Corrente $prima
if ($ora) { Punta-Giunzione $Precedente $ora }

$Manifesto = Join-Path $Corrente 'manifest.json'
if (Test-Path $Manifesto) {
    $m = Get-Content $Manifesto -Raw | ConvertFrom-Json
    Write-Host "  versione    $($m.versione)"
    Write-Host "  impronta    $($m.impronta)"
}
Write-Host ""
Write-Host "  Fatto, senza riavviare. I terminali lo vedono alla prossima ricarica." -ForegroundColor Cyan
Write-Host "  Verificare con:"
Write-Host "    Invoke-RestMethod http://127.0.0.1:4173/api/app-info"
Write-Host ""
Write-Host "  Rilanciando questo stesso comando si torna avanti."
Write-Host ""
