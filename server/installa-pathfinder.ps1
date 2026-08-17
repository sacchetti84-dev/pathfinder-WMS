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

  DUE STRADE, e le distingue da solo.

  AGGIORNAMENTO — il servizio risponde gia' e PATHFINDER_APP_DIR e' impostata.
  Si copia la versione nel deposito e la si mette in `corrente`. Nessun
  amministratore, nessun riavvio, due secondi: e' il caso della presentazione.

  PRIMA INSTALLAZIONE — la macchina non ha niente. Serve l'autorizzazione di
  Windows UNA volta, e allora: il servizio va in C:\Pathfinder\servizio, si
  registrano l'attivita' che lo avvia all'accensione e quella del backup
  serale, si apre la porta sul firewall, si crea il database e si installa
  l'applicativo.

  IL SERVIZIO NON GIRA MAI DAL PACCHETTO. Viene copiato in
  C:\Pathfinder\servizio e registrato da li'. Il 17/08/2026 si e' scoperto che
  girava dalla cartella di consegna, che la build azzera: un `npm run build`
  avrebbe cancellato il codice in esecuzione. Un pacchetto su una chiavetta e'
  la stessa trappola, con la chiavetta che si sfila.
#>

param(
    # Lo passa la seconda finestra, quella con i privilegi: dice che la
    # conferma e' gia' stata data e che non va richiesta due volte.
    [switch]$Elevato,
    # Non chiede niente e non aspetta nessun tasto: serve al collaudo, e a
    # un'installazione lanciata da un altro script. Un installer che non si
    # puo' provare senza una persona davanti non si prova, e infatti.
    [switch]$NonChiedere,
    [int]$Porta = 4173,
    # Dove vanno le versioni. Si cambia solo al banco: un installer che non si
    # puo' provare contro una casa finta si prova sulla macchina vera, cioe'
    # non si prova. Con una casa diversa dalla sua, l'installer non tocca
    # niente di quello che c'e' su questa macchina.
    [string]$Casa = 'C:\Pathfinder\app'
)

$ErrorActionPreference = 'Stop'
$Qui = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Qui 'app'
$Servizio = Join-Path $Qui 'servizio'
$CasaServizio = 'C:\Pathfinder\servizio'
$Indirizzo = "http://localhost:$Porta/"

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
if (-not $node -and -not $aggiornamento) {
    Errore ("Node non risulta installato su questa macchina.`n" +
            "   Installarlo da https://nodejs.org (versione LTS) e rilanciare questo pacchetto.")
}

Riga 'Versione'  $Versione 'White'
Riga 'Impronta'  $m.impronta
Riga 'Contenuto' ("{0} file, {1:N0} byte" -f $m.file.Count, $m.byte_totali)
if ($node) { Riga 'Node' (node --version) }
Write-Host ""

if ($aggiornamento) {
    Riga 'Macchina' 'Pathfinder e'' gia'' installato e in funzione' 'Green'
    Write-Host ""
    Write-Host "   Verra' installata la versione $Versione e messa in servizio." -ForegroundColor White
    Write-Host "   La versione di adesso resta come via di ritorno."
    Write-Host "   Il database NON viene toccato. Nessun riavvio."
} else {
    Riga 'Macchina' 'Pathfinder non c''e'' ancora: prima installazione' 'Yellow'
    Write-Host ""
    Write-Host "   Verranno installati:" -ForegroundColor White
    Write-Host "     - il servizio dati in $CasaServizio"
    Write-Host "     - l'avvio automatico all'accensione e il backup serale delle 20:00"
    Write-Host "     - l'apertura della porta $Porta sul firewall, per gli altri terminali"
    Write-Host "     - il database in C:\Pathfinder\data (vuoto, se non c'e' gia')"
    Write-Host "     - l'applicativo $Versione"
    Write-Host ""
    Write-Host "   Windows chiedera' l'autorizzazione una volta sola." -ForegroundColor Yellow
    if (-not $node) { Write-Host "   Le dipendenze del servizio si scaricano da internet." -ForegroundColor Yellow }
}

# ── Conferma ───────────────────────────────────────────────────────────────
# Solo nella prima finestra: la seconda, quella elevata, eredita la decisione.
if (-not $Elevato -and -not $NonChiedere) {
    Write-Host ""
    Write-Host "   INVIO per procedere, ESC per annullare." -ForegroundColor White
    do {
        $t = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        if ($t.VirtualKeyCode -eq 27) { Write-Host "`n   Annullato. Non e'' stato cambiato niente.`n"; exit 0 }
    } until ($t.VirtualKeyCode -eq 13)
}

# ── Se serve l'amministratore, si chiede qui ───────────────────────────────
if (-not $aggiornamento -and -not (Amministratore)) {
    Write-Host ""
    Write-Host "   Chiedo l'autorizzazione a Windows..." -ForegroundColor Yellow
    $argomenti = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$($MyInvocation.MyCommand.Path)`"", '-Elevato')
    try {
        Start-Process powershell -Verb RunAs -ArgumentList $argomenti | Out-Null
    } catch {
        Errore ("Autorizzazione negata: senza non si puo' installare da zero.`n" +
                "   Rilanciare e rispondere Si'' alla richiesta di Windows.")
    }
    Write-Host "   L'installazione continua nell'altra finestra." -ForegroundColor Green
    Write-Host ""
    exit 0
}

# ── Prima installazione: il servizio ───────────────────────────────────────
if (-not $aggiornamento) {
    Titolo "1 di 2  —  il servizio dati"

    # Il servizio si copia FUORI dal pacchetto, e da li' viene registrato:
    # l'attivita' pianificata memorizza il percorso da cui viene lanciata, e
    # una chiavetta sfilata sarebbe un magazzino fermo al riavvio.
    New-Item -ItemType Directory -Path $CasaServizio -Force | Out-Null
    Copy-Item (Join-Path $Servizio '*') $CasaServizio -Recurse -Force
    Riga 'Copiato in' $CasaServizio 'Green'

    & (Join-Path $CasaServizio 'installa-servizio.ps1') -Porta $Porta
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { Errore "L'installazione del servizio non e'' andata a buon fine." }
}

# ── L'applicativo ──────────────────────────────────────────────────────────
Titolo "$(if ($aggiornamento) { 'Installazione' } else { '2 di 2' })  —  l'applicativo $Versione"

# GLI SCRIPT DI GESTIONE DELLE VERSIONI SI RINFRESCANO DAL PACCHETTO, sempre.
# Sono file che nessuno sta eseguendo — al contrario di `pathfinder-server.js`,
# che gira e vorrebbe un riavvio — e senza questa riga una macchina resta per
# sempre con la logica di installazione del giorno in cui e' stata installata:
# il pacchetto porterebbe il gesto nuovo e la macchina continuerebbe a fare
# quello vecchio, che e' peggio di non aggiornare affatto.
$suQuestaMacchina = ($Casa -eq 'C:\Pathfinder\app')
if ($suQuestaMacchina -and (Test-Path $CasaServizio)) {
    foreach ($s in @('installa-versione.ps1', 'torna-indietro.ps1')) {
        $sorgenteScript = Join-Path $Servizio $s
        if (Test-Path $sorgenteScript) { Copy-Item $sorgenteScript (Join-Path $CasaServizio $s) -Force }
    }
}

# Si preferisce lo script del PACCHETTO quando la casa non e' quella di questa
# macchina: al banco, la copia installata parlerebbe di un'altra casa.
$scriptVersione = Join-Path $Servizio 'installa-versione.ps1'
if ($suQuestaMacchina -and (Test-Path (Join-Path $CasaServizio 'installa-versione.ps1'))) {
    $scriptVersione = Join-Path $CasaServizio 'installa-versione.ps1'
}
& $scriptVersione -Da $App -Versione $Versione -Casa $Casa

# ── Verifica, e l'applicativo si apre ──────────────────────────────────────
Titolo "Verifica"

$esito = $null
foreach ($tentativo in 1..15) {
    try { $esito = Invoke-RestMethod "http://127.0.0.1:$Porta/api/app-info" -TimeoutSec 3 } catch { $esito = $null }
    if ($esito -and $esito.impronta) { break }
    Start-Sleep -Seconds 1
}

if (-not $esito) {
    Errore ("Il servizio non risponde sulla porta $Porta.`n" +
            "   L'applicativo e'' installato, ma qualcosa impedisce al servizio di partire.")
}

if ($esito.impronta -ne $m.impronta) {
    Write-Host "   Il servizio sta servendo un'altra versione:" -ForegroundColor Red
    Riga 'in servizio' "$($esito.versione)  $($esito.impronta)"
    Riga 'attesa'      "$Versione  $($m.impronta)"
    if ($esito.errore) { Riga 'errore' $esito.errore 'Red' }
    Errore "Installazione NON riuscita."
}

Riga 'Versione'  $esito.versione 'Green'
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
