<#
  Pathfinder — installa una versione dell'applicativo
  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

  Copia una cartella di consegna in C:\Pathfinder\app\pathfinder-<versione>\ e
  ne MATERIALIZZA il contenuto dentro `corrente`. Quello che c'era in
  `corrente` finisce in `precedente`.

      .\installa-versione.ps1 -Da ..\consegna -Versione 1.7

  PRIMA DISINSTALLA, POI INSTALLA — sempre, che la versione sia diversa o la
  stessa. Se quel numero e' gia' nel deposito, la sua cartella viene tolta e
  riscritta con i byte del pacchetto: chi installa ottiene cio' che ha in
  mano, non cio' che c'era ieri sotto lo stesso nome. La via di ritorno resta
  dov'era — `precedente` si muove solo quando cambia il numero in servizio.

  NON SERVE L'AMMINISTRATORE e non serve riavviare il servizio: Express risolve
  il percorso a ogni richiesta, e `corrente` e' una cartella qualunque.

  PERCHE' UNA COPIA E NON UNA GIUNZIONE — 17/08/2026, pagato caro.
  Fino a stasera `corrente` era una giunzione che si ripuntava, ed era la parte
  piu' elegante della 1.7. Su questa macchina non funziona: il servizio gira
  come SYSTEM in sessione 0, e per lui `stat` sulla giunzione muore con
  «UNKNOWN: unknown error» — mentre lo stesso percorso, dallo stesso codice,
  si apre senza un intoppo da una sessione utente. Non e' un problema di
  permessi (SYSTEM ha pieno controllo, nessuna negazione) ne' del tag di
  reparse (0xa0000003, un punto di montaggio normale), e la prova che la
  cartella sotto va bene e' che SYSTEM ci scrive dentro.
  Ci sono volute tre ore e l'applicativo giu' per scoprirlo, perche' il difetto
  si vede SOLO dal conto con cui gira il servizio: al banco, avviato a mano,
  funzionava tutte le volte.

  Accetta anche una vecchia consegna a FILE SINGOLO: la avvolge in una cartella
  con dentro il solo `index.html` e le genera il manifesto.

      .\installa-versione.ps1 -Da ..\pathfinder-1.6.1.html -Versione 1.6.1
#>

param(
    [Parameter(Mandatory = $true)][string]$Da,
    [Parameter(Mandatory = $true)][string]$Versione,
    [string]$Casa = 'C:\Pathfinder\app'
)

$ErrorActionPreference = 'Stop'

# ── Togliere una cartella, senza fare danni ────────────────────────────────
# MAI `Remove-Item -Recurse` su una giunzione: in PowerShell 5.1 puo' seguire
# il collegamento e svuotare LA CARTELLA DI DESTINAZIONE invece di togliere il
# rimando. Qui la distinzione e' esplicita, e resta anche adesso che le
# giunzioni non si creano piu': sul disco ne restano di vecchie, e la prima
# installazione dopo questo cambio le incontra.
function Rimuovi-Punto([string]$Percorso) {
    if (-not (Test-Path $Percorso -ErrorAction SilentlyContinue)) {
        # Una giunzione rotta non risponde a Test-Path ma esiste come voce:
        # si riconosce dagli attributi, e va tolta lo stesso.
        try { $a = [System.IO.File]::GetAttributes($Percorso) } catch { return }
        if ($a -band [System.IO.FileAttributes]::ReparsePoint) {
            try { [System.IO.Directory]::Delete($Percorso, $false) }
            catch { cmd /c rmdir "`"$Percorso`"" | Out-Null }
        }
        return
    }
    $voce = Get-Item $Percorso -Force
    # L'attributo ReparsePoint da solo NON basta a riconoscere una giunzione:
    # OneDrive lo mette su OGNI cartella sincronizzata (e' cosi' che funziona
    # «file su richiesta»), e con il solo attributo questa funzione si
    # rifiutava di rimuovere una cartella qualunque dentro OneDrive. Una
    # giunzione vera ha anche un bersaglio; un segnaposto di OneDrive no.
    if (($voce.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -and $voce.Target) {
        try { [System.IO.Directory]::Delete($Percorso, $false) }
        catch { cmd /c rmdir "`"$Percorso`"" | Out-Null }
    } else {
        Remove-Item $Percorso -Recurse -Force
    }
}

# ── Materializzare una versione dentro una cartella stabile ────────────────
# Si costruisce accanto e si rinomina: la finestra in cui `corrente` non e'
# completa dura quanto un rename, non quanto una copia. Un terminale che
# carica proprio in quell'istante trova comunque i suoi assets in
# `precedente`, che porta i nomi a impronta della versione lasciata.
function Materializza([string]$Sorgente, [string]$Bersaglio) {
    $temporanea = "$Bersaglio.nuovo"
    Rimuovi-Punto $temporanea
    New-Item -ItemType Directory -Path $temporanea -Force | Out-Null
    Copy-Item (Join-Path $Sorgente '*') $temporanea -Recurse -Force
    Rimuovi-Punto $Bersaglio
    Rename-Item $temporanea (Split-Path -Leaf $Bersaglio)
}

function Sha256File([string]$File) {
    return (Get-FileHash -Path $File -Algorithm SHA256).Hash.ToLower()
}

# `Out-File -Encoding utf8` in PowerShell 5.1 scrive UTF-8 CON BOM, e
# `JSON.parse` sul BOM lancia: il servizio leggerebbe un manifesto illeggibile
# e risponderebbe versione e impronta nulle — proprio i due numeri su cui si
# verifica un'installazione.
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

# PRIMA SI DISINSTALLA, POI SI INSTALLA — 18/08/2026.
# Fino a stanotte una versione gia' nel deposito faceva fermare lo script,
# oppure — con `-Riusa`, che e' come la chiamava l'installer a doppio clic —
# veniva RIMESSA IN SERVIZIO COM'ERA, senza ricopiare niente. Chi rifaceva la
# build senza cambiare numero installava e restava ai byte di ieri, e non lo
# diceva nessuno: e' successo con la 1.8.1, due volte nella stessa notte.
#
# Adesso l'installazione e' un gesto solo e sempre uguale: si toglie di mezzo
# quello che c'e' sotto quel numero e si copia daccapo cio' che sta nel
# pacchetto. Vale che la versione sia diversa o la stessa — e chi installa
# ottiene i byte che ha in mano, che e' l'unica cosa che si aspetta.
#
# La via di ritorno non c'entra e non si tocca: `precedente` cambia solo
# quando il NUMERO in servizio cambia, ed e' la riga piu' sotto a dirlo.
if (Test-Path $Destinazione) {
    Write-Host "  Disinstallo la $Versione che c'era nel deposito" -ForegroundColor Yellow
    Rimuovi-Punto $Destinazione
}

New-Item -ItemType Directory -Path $Casa -Force | Out-Null
New-Item -ItemType Directory -Path $Destinazione -Force | Out-Null

# ── La copia nel deposito delle versioni ───────────────────────────────────
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

# ── Lo scambio: due copie, non due rimandi ─────────────────────────────────
$Corrente = Join-Path $Casa 'corrente'
$Precedente = Join-Path $Casa 'precedente'

# Che versione c'e' adesso in `corrente` lo dice il suo manifesto: e' il modo
# di saperlo senza tenere un registro accanto, che prima o poi mente.
$eraVersione = $null
$manCorrente = Join-Path $Corrente 'manifest.json'
if (Test-Path $manCorrente) {
    try { $eraVersione = (Get-Content $manCorrente -Raw | ConvertFrom-Json).versione } catch {}
}

# Reinstallare la versione che c'e' gia' NON deve toccare `precedente`: se lo
# facesse, `corrente` e `precedente` porterebbero la stessa versione e la via
# di ritorno sparirebbe in silenzio — proprio nel gesto piu' innocuo che
# esista, cioe' rilanciare l'installer due volte in presentazione.
if ($eraVersione -eq $Versione) {
    Write-Host "  precedente  invariato (la $Versione era gia' in servizio)" -ForegroundColor Yellow
} elseif ($eraVersione) {
    $daTenere = Join-Path $Casa "pathfinder-$eraVersione"
    if (Test-Path $daTenere) {
        Materializza $daTenere $Precedente
        Write-Host "  precedente  <- $eraVersione"
    } else {
        # La copia in `corrente` c'e' ma il deposito no: si copia quella, che
        # e' l'unica cosa rimasta di quella versione.
        Materializza $Corrente $Precedente
        Write-Host "  precedente  <- $eraVersione (dal contenuto di corrente: la cartella-versione non c'e' piu')" -ForegroundColor Yellow
    }
}

Materializza $Destinazione $Corrente
Write-Host "  corrente    <- $Versione" -ForegroundColor Green

$m = Get-Content $Manifesto -Raw | ConvertFrom-Json
Write-Host ""
Write-Host "  versione    $($m.versione)"
Write-Host "  impronta    $($m.impronta)"
Write-Host ""
Write-Host "  Questo script tocca il solo APPLICATIVO, e non riavvia niente:" -ForegroundColor Cyan
Write-Host "  il servizio rilegge la cartella a ogni richiesta."
Write-Host "  Il pacchetto a doppio clic fa di piu': porta anche il servizio e lo riavvia."
Write-Host ""
Write-Host "  Verificare con:"
Write-Host "    Invoke-RestMethod http://127.0.0.1:4173/api/app-info"
Write-Host ""
