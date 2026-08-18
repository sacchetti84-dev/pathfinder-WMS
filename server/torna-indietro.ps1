<#
  Pathfinder — torna alla versione precedente
  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

  Scambia il contenuto di `corrente` e `precedente`, ripescandolo dal deposito
  delle versioni. Un comando, nessun riavvio, nessun amministratore — e
  rilanciandolo si torna avanti, perche' lo scambio e' simmetrico.

      .\torna-indietro.ps1

  QUALE VERSIONE C'E' DOVE LO DICE IL MANIFESTO, non un registro accanto: un
  registro separato prima o poi dice una cosa e le cartelle un'altra.

  PERCHE' COPIE E NON GIUNZIONI: vedi la testata di installa-versione.ps1 —
  il 17/08/2026 il servizio, che gira come SYSTEM, non e' riuscito ad
  attraversare la giunzione, e l'applicativo e' rimasto giu' tre ore.

  PRIMA DI TORNARE INDIETRO C'E' UN GESTO PIU' PICCOLO: spegnere l'interruttore
  della funzione che da' fastidio, da Configurazione -> Funzioni. Un rilascio si
  disinstalla, una funzione si spegne, e le due cose si confondono solo se si
  accendono nello stesso turno in cui si installa.

  DAL 18/08/2026 QUESTO SCRIPT RIPORTA INDIETRO SOLO META' VERSIONE.
  Il pacchetto a doppio clic installa insieme l'applicativo E il servizio, e li
  riavvia; qui si scambiano due cartelle di applicativo e basta. Chi lo lancia
  si ritrova il servizio nuovo che serve l'applicativo vecchio: funziona — le
  rotte sono compatibili all'indietro e lo dicono 77 prove — ma i due numeri di
  `/api/app-info` non coincidono piu', e quello e' il segno che di solito vuol
  dire «installazione non riuscita». Per tornare indietro davvero si reinstalla
  il pacchetto della versione di prima, che sta in `consegna\`.

  Il DATABASE non si tocca, in nessun caso: un rilascio si disinstalla
  rimettendo l'applicativo di prima, e i dati restano dove sono.
#>

param(
    [string]$Casa = 'C:\Pathfinder\app'
)

$ErrorActionPreference = 'Stop'

# MAI `Remove-Item -Recurse` su una giunzione: in PowerShell 5.1 puo' seguire
# il collegamento e svuotare la cartella di destinazione. Le giunzioni non si
# creano piu', ma sul disco ne restano di vecchie.
function Rimuovi-Punto([string]$Percorso) {
    if (-not (Test-Path $Percorso -ErrorAction SilentlyContinue)) {
        try { $a = [System.IO.File]::GetAttributes($Percorso) } catch { return }
        if ($a -band [System.IO.FileAttributes]::ReparsePoint) {
            try { [System.IO.Directory]::Delete($Percorso, $false) }
            catch { cmd /c rmdir "`"$Percorso`"" | Out-Null }
        }
        return
    }
    $voce = Get-Item $Percorso -Force
    # ReparsePoint da solo non basta: OneDrive lo mette su ogni cartella
    # sincronizzata. Una giunzione vera ha anche un bersaglio — vedi
    # installa-versione.ps1.
    if (($voce.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -and $voce.Target) {
        try { [System.IO.Directory]::Delete($Percorso, $false) }
        catch { cmd /c rmdir "`"$Percorso`"" | Out-Null }
    } else {
        Remove-Item $Percorso -Recurse -Force
    }
}

function Materializza([string]$Sorgente, [string]$Bersaglio) {
    $temporanea = "$Bersaglio.nuovo"
    Rimuovi-Punto $temporanea
    New-Item -ItemType Directory -Path $temporanea -Force | Out-Null
    Copy-Item (Join-Path $Sorgente '*') $temporanea -Recurse -Force
    Rimuovi-Punto $Bersaglio
    Rename-Item $temporanea (Split-Path -Leaf $Bersaglio)
}

function VersioneIn([string]$Cartella) {
    $m = Join-Path $Cartella 'manifest.json'
    if (-not (Test-Path $m)) { return $null }
    try { return (Get-Content $m -Raw | ConvertFrom-Json).versione } catch { return $null }
}

$Corrente = Join-Path $Casa 'corrente'
$Precedente = Join-Path $Casa 'precedente'

$ora = VersioneIn $Corrente
$prima = VersioneIn $Precedente

if (-not $prima) {
    Write-Host ""
    Write-Host "  Non c'e' una via di ritorno: 'precedente' non contiene una versione." -ForegroundColor Red
    Write-Host "  Le versioni installate stanno in $Casa — si torna a una qualunque con:"
    Write-Host "    .\installa-versione.ps1 -Da <cartella> -Versione <numero>"
    Write-Host ""
    exit 1
}

# Si ripesca dal deposito, che e' la copia buona; il contenuto di `precedente`
# e' un ripiego per il caso in cui la cartella-versione sia sparita.
$sorgenteIndietro = Join-Path $Casa "pathfinder-$prima"
if (-not (Test-Path $sorgenteIndietro)) { $sorgenteIndietro = $Precedente }
$sorgenteAvanti = if ($ora) { Join-Path $Casa "pathfinder-$ora" } else { $null }
if ($sorgenteAvanti -and -not (Test-Path $sorgenteAvanti)) { $sorgenteAvanti = $Corrente }

Write-Host ""
Write-Host "  Pathfinder — ritorno indietro" -ForegroundColor Cyan
Write-Host "    da  $ora"
Write-Host "    a   $prima" -ForegroundColor Green
Write-Host ""

# Prima si mette da parte cio' che c'e' adesso, poi si scambia: se il comando
# muore in mezzo, `precedente` porta comunque una versione intera.
$appoggio = Join-Path $Casa '_scambio'
if ($sorgenteAvanti) { Materializza $sorgenteAvanti $appoggio }
Materializza $sorgenteIndietro $Corrente
if ($sorgenteAvanti) { Materializza $appoggio $Precedente; Rimuovi-Punto $appoggio }

$m = Join-Path $Corrente 'manifest.json'
if (Test-Path $m) {
    $j = Get-Content $m -Raw | ConvertFrom-Json
    Write-Host "  versione    $($j.versione)"
    Write-Host "  impronta    $($j.impronta)"
}
Write-Host ""
Write-Host "  Fatto, senza riavviare. I terminali lo vedono alla prossima ricarica." -ForegroundColor Cyan
Write-Host "  Verificare con:"
Write-Host "    Invoke-RestMethod http://127.0.0.1:4173/api/app-info"
Write-Host ""
Write-Host "  Rilanciando questo stesso comando si torna avanti."
Write-Host ""
Write-Host "  ATTENZIONE: e tornato indietro il solo APPLICATIVO." -ForegroundColor Yellow
Write-Host "  Il servizio dati resta quello di adesso, e i due numeri di /api/app-info"
Write-Host "  non coincideranno. Per tornare indietro davvero si reinstalla il pacchetto"
Write-Host "  della versione di prima."
Write-Host ""
