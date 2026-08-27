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

  QUALE DATABASE, dalla 2.7. Una prima installazione nasce su PostgreSQL: e'
  quello che gira in magazzino dal 26/08/2026, ed e' l'unico dei due che
  regge piu' terminali che scrivono insieme. Il motore NON viene installato
  da qui — si controlla che ci sia, e se manca ci si ferma dicendo dove si
  prende: §5 ha gia' pagato una volta il prezzo di un binario scaricato su un
  PC di magazzino. Ruolo, database e password li prepara
  `prepara-postgres.ps1`, e la password non la digita nessuno.
    .\installa.ps1 -Database sqlite         installa sul file, come la 2.5
    .\installa.ps1 -Database postgresql     su una macchina gia' in servizio:
                                            porta il magazzino da SQLite a
                                            PostgreSQL, migrando i dati

  AGGIORNANDO IL DATABASE NON SI TOCCA. Vale la regola del 26/08: si installa
  un turno e si accende quello dopo. Un aggiornamento lascia il magazzino sul
  database su cui lo trova, e il passaggio si chiede a voce con -Database.

  PER PROVARLO SENZA TOCCARE NIENTE:  .\installa.ps1 -NonChiedere -Prova
  Dice cosa farebbe — dove, quale versione, quale strada, quale database —
  ed esce. Guarda anche PostgreSQL, e su una macchina in servizio si puo'
  lanciare senza conseguenze.
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
    [string]$Casa = '',

    # ── 2.7 · Quale database ───────────────────────────────────────────────
    # 'postgresql'  prima installazione: prepara ruolo e database e ci parte.
    #               Su una macchina gia' in servizio su SQLite: MIGRA i dati.
    # 'sqlite'      il file, come fino alla 2.6. Resta la via di casa.
    # ''            aggiornando, il default: si lascia quello che c'e'.
    [ValidateSet('', 'postgresql', 'sqlite')]
    [string]$Database = '',
    [string]$IndirizzoPostgreSQL = '127.0.0.1',
    [int]$PortaPostgreSQL = 5432,
    [string]$NomeDatabasePostgreSQL = 'pathfinder',
    [string]$RuoloPostgreSQL = 'pathfinder',
    # La password dell'utente «postgres», che serve UNA VOLTA a creare ruolo e
    # database. Non fornendola la si chiede, mascherata. Non viene salvata.
    [string]$PasswordSuperuser = '',
    # Passando da SQLite a PostgreSQL: non migrare i dati, partire vuoti. E'
    # il caso di una macchina nuova che ha un SQLite di prova dentro.
    [switch]$SenzaMigrazione
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
# Si esegue DAL PACCHETTO, non dalla macchina: prepara PostgreSQL prima che
# il servizio esista, e la logica di preparazione e' quella di questa
# versione, non quella del giorno in cui la macchina e' nata.
$PreparaPg = Join-Path $Servizio 'prepara-postgres.ps1'
$Migrazione = Join-Path $Servizio 'migrazione\migra-sqlite-postgres.js'

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
# LE DIPENDENZE NON VIAGGIANO NEL PACCHETTO, e `node_modules` che ESISTE non
# vuol dire che sia quello giusto — 2.7.
#
# Fino alla 2.6 qui si guardava solo se la cartella c'era. Bastava finche'
# l'elenco delle dipendenze non cambiava mai; la 2.7 ha aggiunto `pg`, e una
# `node_modules` rimasta dalla 2.6 avrebbe superato il controllo lasciando il
# servizio senza il driver. Con PATHFINDER_PG impostata non sarebbe partito
# affatto: i terminali vedono bianco e il magazzino si ferma.
#
# Si guarda dipendenza per dipendenza, come le dichiara package.json.
function Assicura-Dipendenze([string]$casa) {
    $nm = Join-Path $casa 'node_modules'
    $dichiarate = @()
    try {
        $pkg = Get-Content (Join-Path $casa 'package.json') -Raw | ConvertFrom-Json
        if ($pkg.dependencies) { $dichiarate = @($pkg.dependencies.PSObject.Properties.Name) }
    } catch { }
    $mancanti = @($dichiarate | Where-Object { -not (Test-Path (Join-Path $nm $_)) })

    if ((-not (Test-Path $nm)) -or $mancanti.Count -gt 0) {
        if ($mancanti.Count -gt 0) {
            Write-Host "   Dipendenze del servizio da installare: $($mancanti -join ', ')" -ForegroundColor Yellow
        } else {
            Write-Host '   Dipendenze del servizio mancanti: le installo...' -ForegroundColor Yellow
        }
        Push-Location $casa
        npm install --omit=dev --no-audit --no-fund
        Pop-Location

        # NON SI VA AVANTI SPERANDO. Se dopo npm install ne manca ancora una,
        # il servizio non partira': meglio fermare l'installazione adesso, con
        # scritto quale, che riavviarlo e scoprirlo domani.
        $ancora = @($dichiarate | Where-Object { -not (Test-Path (Join-Path $nm $_)) })
        if ($ancora.Count -gt 0) {
            throw "Dopo npm install mancano ancora: $($ancora -join ', '). Il servizio non partirebbe."
        }
    }
}

# ── Il passaggio dei dati da SQLite a PostgreSQL ───────────────────────────
# NON MIGRA IL DATABASE IN SERVIZIO, ma la copia a caldo che il servizio ha
# appena scritto. E non scrive sopra niente: se dall'altra parte c'e' gia'
# roba, si ferma. Una migrazione che si sovrappone a un magazzino esistente
# e' il modo di perdere due magazzini invece di uno.
function Migra-SuPostgres([string]$casa, [string]$copia, [string]$stringa) {
    $scriptMigra = Join-Path $casa 'migrazione\migra-sqlite-postgres.js'
    if (-not (Test-Path $scriptMigra)) {
        throw "Non trovo ${scriptMigra}: il pacchetto non porta la migrazione, e senza non si passa a PostgreSQL."
    }
    if (-not $preparato.vuoto) {
        throw ("Il database «$NomeDatabasePostgreSQL» ha gia' dei tavoli dentro: non ci scrivo sopra. " +
               "Per partire comunque, senza portare i dati:  -SenzaMigrazione")
    }

    Write-Host "   Migro i dati su PostgreSQL. Puo' volerci qualche minuto..." -ForegroundColor Yellow

    # La stringa entra dall'ambiente di QUESTO processo, che node eredita: in
    # un parametro di riga di comando la leggerebbe chiunque.
    $vecchia = $env:PATHFINDER_PG
    $env:PATHFINDER_PG = $stringa
    try {
        $global:LASTEXITCODE = 0
        & node $scriptMigra '--da' $copia
        if ($LASTEXITCODE -ne 0) {
            throw ("La migrazione dei dati non e' riuscita — quello che dice sta qui sopra.`n" +
                   "   Niente e' andato perso: il file SQLite e' intatto e il servizio riparte da li'.")
        }
    } finally {
        $env:PATHFINDER_PG = $vecchia
    }
    Riga 'Migrazione' 'riuscita, e i conteggi tornano tavolo per tavolo' 'Green'
}

function Riavvia-Servizio {
    # SE L'ATTIVITA' NON C'E', SI REGISTRA — NON CI SI ARRENDE. 26/08.
    #
    # Fino a stasera qui c'era un `Errore`, cioe' un'uscita con 1. Ma questa
    # funzione la chiama il `finally` dell'aggiornamento, DOPO aver fermato il
    # processo sulla porta: arrendersi qui vuol dire lasciare il magazzino
    # giu' e andarsene, e la riga che lo spiega la legge chi passa domani.
    # Un'attivita' che manca non e' un guaio da raccontare, e' un guaio da
    # chiudere: la registra `installa-servizio.ps1`, che sa gia' farlo.
    #
    # QUANDO SUCCEDE DAVVERO: una macchina dove `installa-servizio.ps1` non e'
    # mai passato, o dove qualcuno ha tolto l'attivita' a mano. Non e' il caso
    # di una lettura andata a vuoto — qui si e' amministratori, perche'
    # l'installer si eleva prima di arrivare a questa riga, e un
    # amministratore l'attivita' la vede. Non elevati invece
    # `Get-ScheduledTask` non dice «accesso negato»: non restituisce NIENTE, e
    # una lettura a vuoto somiglia in tutto a un'assenza — §5.
    if (-not (Get-ScheduledTask -TaskName $NomeAttivita -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "   L'attivita' pianificata «$NomeAttivita» non risulta registrata." -ForegroundColor Yellow
        Write-Host "   Il servizio girava senza: la registro adesso, o il magazzino non"
        Write-Host "   tornerebbe su da solo al prossimo riavvio della macchina."
        Write-Host ""
        & (Join-Path $CasaServizio 'installa-servizio.ps1') -Porta $Porta `
            -Database $FileSqlite -CartellaBackup $CartellaBackup `
            -CartellaApplicativo (Join-Path $CasaApp 'corrente') `
            -PostgreSQL $stringaPg
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
            Errore ("Non sono riuscito a registrare l'attivita' pianificata, e il servizio`n" +
                    "   e' fermo. Rilanciare a mano, da amministratore:`n" +
                    "     & `"$(Join-Path $CasaServizio 'installa-servizio.ps1')`"")
        }
        # installa-servizio.ps1 l'ha gia' accesa e verificata: qui non c'e'
        # piu' niente da riavviare.
        return
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
# 2.7 — senza questo un'installazione su PostgreSQL non si puo' nemmeno
# tentare, e ci si accorgerebbe a meta' strada, a servizio gia' fermo.
if (-not (Test-Path $PreparaPg)) { Errore "Pacchetto incompleto: manca servizio\prepara-postgres.ps1, che controlla e prepara il database." }

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

# ── 2.7 · Su quale database si va a finire ─────────────────────────────────
# La decisione si prende ADESSO, prima di toccare qualunque cosa, perche' e'
# quella che decide se serve un motore che magari non c'e'. Tre casi soli, e
# ognuno ha un nome: chi installa deve poter leggere a schermo su cosa sta
# per finire il suo magazzino, non dedurlo.
$pgInServizio = [Environment]::GetEnvironmentVariable('PATHFINDER_PG', 'Machine')

if ($Database) {
    $modoDb = $Database
} elseif ($aggiornamento) {
    # AGGIORNANDO NON SI CAMBIA DATABASE. Si installa un turno e si accende
    # quello dopo: e' la regola con cui la 2.6 e' entrata in magazzino senza
    # portarsi dietro il salto, ed e' la ragione per cui il salto, quando e'
    # arrivato, si e' potuto guardare da solo.
    $modoDb = if ($pgInServizio) { 'postgresql' } else { 'sqlite' }
} else {
    # PRIMA INSTALLAZIONE: PostgreSQL. E' quello che gira in magazzino, ed e'
    # l'unico dei due che regge piu' terminali che scrivono insieme.
    $modoDb = 'postgresql'
}

# Il salto da un database all'altro: e' un gesto diverso da un aggiornamento,
# e va nominato come tale.
$saltoAPostgres = ($modoDb -eq 'postgresql' -and $aggiornamento -and -not $pgInServizio)
$saltoASqlite   = ($modoDb -eq 'sqlite'     -and $aggiornamento -and $pgInServizio)

if ($saltoASqlite) {
    Errore ("Questa macchina sta girando su PostgreSQL, e -Database sqlite la riporterebbe`n" +
            "   sul file: quel file e' fermo al giorno del passaggio, e quello che nel`n" +
            "   frattempo e' stato scritto su PostgreSQL NON rientra da solo.`n`n" +
            "   Per un ritorno d'emergenza il gesto e' un altro, ed e' scritto:`n" +
            "     & `"$(Join-Path (Split-Path -Parent (Split-Path -Parent $varApp)) 'servizio\installa-servizio.ps1')`"`n" +
            "   senza -PostgreSQL. Questo installer non lo fa per conto di nessuno.")
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
$FileSqlite   = Join-Path $Radice 'data\pathfinder.db'
$CartellaBackup = Join-Path $Radice 'backup'

Riga 'Versione'  $Versione 'White'
Riga 'Impronta'  $m.impronta
Riga 'Contenuto' ("{0} file, {1:N0} byte" -f $m.file.Count, $m.byte_totali)
Riga 'Node' (node --version)
Riga 'Percorso' $Radice 'White'
if ($Casa) { Riga 'Casa versioni' $Casa 'Yellow' }
Write-Host ""

Riga 'Database' $(if ($modoDb -eq 'postgresql') {
        "PostgreSQL — $NomeDatabasePostgreSQL su ${IndirizzoPostgreSQL}:$PortaPostgreSQL, ruolo $RuoloPostgreSQL"
    } else { "SQLite — $FileSqlite" }) 'White'
Write-Host ""

# ── PostgreSQL: SI GUARDA PRIMA DI PREMERE ─────────────────────────────────
# LE PRIME DUE COSE CHE LA 2.7 HA TROVATO, LE HA TROVATE IL GUARDARE PRIMA.
# Un installer che scopre a meta' strada che il motore non c'e' ha gia'
# fermato il servizio: si controlla adesso, con il magazzino ancora acceso e
# niente di toccato. Il -Prova di prepara-postgres non scrive niente e si
# puo' lanciare su una macchina in servizio.
$argPg = @{
    Indirizzo = $IndirizzoPostgreSQL; Porta = $PortaPostgreSQL
    NomeDatabase = $NomeDatabasePostgreSQL; Ruolo = $RuoloPostgreSQL
    StringaEsistente = $pgInServizio
}

function ProvaPostgres([string]$passwordSuper) {
    # Azzerato prima: un codice rimasto da un comando di dieci righe fa
    # fermerebbe un'installazione perfettamente sana.
    $global:LASTEXITCODE = 0
    $esito = & $PreparaPg @argPg -PasswordSuperuser $passwordSuper -Prova -NonChiedere
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
        # IN -Prova NON SI ESCE: si scrive che manca e si va avanti a dire il
        # resto. Una prova serve a sapere cosa manca su una macchina, e una
        # che si ferma alla prima riga ne nomina uno solo per giro.
        if ($Prova) {
            Write-Host "   PostgreSQL non e' pronto: installando davvero, ci si fermerebbe qui." -ForegroundColor Red
            return $null
        }
        Errore ("PostgreSQL non e' pronto su questa macchina, e non ho toccato niente.`n" +
                "   Il guaio e' scritto qui sopra. Per installare intanto sul file:`n" +
                "     .\installa.ps1 -Database sqlite")
    }
    return $esito
}

if ($saltoAPostgres -and -not $SenzaMigrazione -and -not (Test-Path $Migrazione)) {
    Errore ("Questo pacchetto non porta la migrazione (manca servizio\migrazione\), e senza`n" +
            "   quella i dati non passano dall'altra parte. Non ho toccato niente.`n`n" +
            "   Per passare comunque a PostgreSQL, ripartendo da un database VUOTO:`n" +
            "     .\installa.ps1 -Database postgresql -SenzaMigrazione")
}

if ($modoDb -eq 'postgresql') {
    $sguardo = ProvaPostgres $PasswordSuperuser

    # LA PASSWORD DEL SUPERUSER SI CHIEDE NELLA FINESTRA ELEVATA, non in
    # questa. Chiederla prima vorrebbe dire portarsela nell'altra finestra, e
    # l'unico modo di portarcela e' un parametro di riga di comando — che
    # legge chiunque guardi l'elenco dei processi. Qui si controlla quello
    # che si puo' controllare senza; il resto lo controlla l'altra finestra,
    # sempre prima di toccare qualcosa.
    if (-not $sguardo.stringa -and -not $PasswordSuperuser -and -not $NonChiedere -and (Amministratore)) {
        Write-Host ""
        Write-Host "   Serve UNA VOLTA la password dell'utente «postgres» di PostgreSQL," -ForegroundColor White
        Write-Host "   quella scelta installando il motore. Crea il ruolo e il database di"
        Write-Host "   Pathfinder, non viene salvata da nessuna parte e non serve piu'."
        Write-Host ""
        $sicura = Read-Host "   Password di postgres" -AsSecureString
        $PasswordSuperuser = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicura))
        # Si riguarda con la password in mano: se e' sbagliata lo si sa
        # adesso, con il magazzino ancora acceso e niente toccato.
        $sguardo = ProvaPostgres $PasswordSuperuser
    }
}

if ($aggiornamento) {
    Riga 'Macchina' 'Pathfinder e'' gia'' installato e in funzione' 'Green'
    Write-Host ""
    Write-Host "   Verranno installati insieme, e alla fine porteranno lo stesso numero:" -ForegroundColor White
    Write-Host "     - l'applicativo $Versione"
    Write-Host "     - il servizio dati $Versione, che viene RIAVVIATO"
    if ($saltoAPostgres) {
        Write-Host ""
        Write-Host "   E IL MAGAZZINO CAMBIA DATABASE: da SQLite a PostgreSQL." -ForegroundColor Yellow
        Write-Host "     - una copia a caldo del file SQLite viene chiesta al servizio"
        if ($SenzaMigrazione) {
            Write-Host "     - i dati NON vengono migrati: si riparte da un database vuoto" -ForegroundColor Red
        } else {
            Write-Host "     - quella copia viene migrata su PostgreSQL, e i conteggi si ricontrollano"
        }
        Write-Host "     - il file SQLite resta dov'e', intatto, e da oggi invecchia"
        Write-Host ""
        Write-Host "   La via di casa da domani e' il .dump della sera prima, non quel file."
    } else {
        Write-Host ""
        Write-Host "   Windows chiedera' l'autorizzazione: fermare il servizio la vuole." -ForegroundColor Yellow
        Write-Host "   L'applicativo resta giu' i secondi del riavvio. Il database NON viene toccato."
    }
} else {
    Riga 'Macchina' 'Pathfinder non c''e'' ancora: prima installazione' 'Yellow'
    Write-Host ""
    Write-Host "   Verranno installati:" -ForegroundColor White
    Write-Host "     - il servizio dati in $CasaServizio"
    Write-Host "     - l'avvio automatico all'accensione e il backup serale delle 20:00"
    Write-Host "     - l'apertura della porta $Porta sul firewall, per gli altri terminali"
    if ($modoDb -eq 'postgresql') {
        Write-Host "     - il ruolo «$RuoloPostgreSQL» e il database «$NomeDatabasePostgreSQL» su PostgreSQL, se non ci sono gia'"
        Write-Host "     - i tavoli li crea il servizio al primo avvio"
    } else {
        Write-Host "     - il database in $(Split-Path -Parent $FileSqlite) (vuoto, se non c'e' gia')"
    }
    Write-Host "     - l'applicativo $Versione"
    Write-Host ""
    Write-Host "   Windows chiedera' l'autorizzazione una volta sola." -ForegroundColor Yellow
}

# ── La prova: si dice cosa si farebbe, e non si tocca niente ───────────────
if ($Prova) {
    Write-Host ""
    Riga 'PROVA' 'nessuna modifica: ecco cosa farebbe' 'Cyan'
    Riga 'strada'   $(if ($saltoAPostgres) { 'aggiornamento PIU'' passaggio a PostgreSQL' } elseif ($aggiornamento) { 'aggiornamento' } else { 'prima installazione' })
    Riga 'radice'   $Radice
    Riga 'servizio' $CasaServizio
    Riga 'versioni' $CasaApp
    Riga 'database' $(if ($modoDb -eq 'postgresql') { "PostgreSQL — $NomeDatabasePostgreSQL su ${IndirizzoPostgreSQL}:$PortaPostgreSQL" } else { $FileSqlite })
    if ($modoDb -eq 'postgresql') { Riga 'file SQLite' "$FileSqlite  — non viene toccato" }
    Riga 'migrazione' $(if ($saltoAPostgres -and -not $SenzaMigrazione) { 'si'' — copia a caldo e migrazione dei dati' } else { 'no' })
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
                   '-Elevato', '-Porta', "$Porta", '-Radice', "`"$Radice`"",
                   # La decisione sul database si porta di la' DECISA, o
                   # l'altra finestra la riprenderebbe dai valori di serie e
                   # potrebbe concludere un'altra cosa.
                   '-Database', $modoDb,
                   '-IndirizzoPostgreSQL', "`"$IndirizzoPostgreSQL`"",
                   '-PortaPostgreSQL', "$PortaPostgreSQL",
                   '-NomeDatabasePostgreSQL', "`"$NomeDatabasePostgreSQL`"",
                   '-RuoloPostgreSQL', "`"$RuoloPostgreSQL`"")
    if ($Casa) { $argomenti += @('-Casa', "`"$Casa`"") }
    if ($SenzaMigrazione) { $argomenti += '-SenzaMigrazione' }
    # LA PASSWORD DEL SUPERUSER NON PASSA DI QUI. Un parametro di riga di
    # comando lo legge chiunque apra Gestione attivita': la chiede l'altra
    # finestra, che e' quella che poi la usa.
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

# ── Il database, quando e' PostgreSQL ──────────────────────────────────────
# Ruolo, database e password: si prepara PRIMA che il servizio esista, cosi'
# la stringa di connessione c'e' gia' quando installa-servizio.ps1 la vuole.
# Non ci si passa se la macchina sta gia' girando su PostgreSQL e la sua
# stringa risponde — quel database sta servendo un magazzino.
$passi = if ($modoDb -eq 'postgresql' -and -not $aggiornamento) { 3 } else { 2 }
$stringaPg = ''

if ($modoDb -eq 'postgresql' -and (-not $aggiornamento -or $saltoAPostgres)) {
    Titolo "1 di $passi  —  il database PostgreSQL"

    $global:LASTEXITCODE = 0
    $preparato = & $PreparaPg @argPg -PasswordSuperuser $PasswordSuperuser -NonChiedere:$NonChiedere
    if (($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) -or -not $preparato -or -not $preparato.stringa) {
        Errore ("Il database PostgreSQL non e' stato preparato, e non ho toccato altro.`n" +
                "   Per installare intanto sul file:  .\installa.ps1 -Database sqlite")
    }
    $stringaPg = $preparato.stringa
} elseif ($modoDb -eq 'postgresql') {
    # Aggiornamento su una macchina gia' su PostgreSQL: la stringa e' quella
    # che la macchina ha in mano, e NON si rigenera niente.
    $stringaPg = $pgInServizio
}

# ── Prima installazione: il servizio nasce ─────────────────────────────────
if (-not $aggiornamento) {
    Titolo "$(if ($passi -eq 3) { '2 di 3' } else { '1 di 2' })  —  il servizio dati"

    # Il servizio si copia FUORI dal pacchetto, e da li' viene registrato:
    # l'attivita' pianificata memorizza il percorso da cui viene lanciata, e
    # una chiavetta sfilata sarebbe un magazzino fermo al riavvio.
    New-Item -ItemType Directory -Path $CasaServizio -Force | Out-Null
    Copy-Item (Join-Path $Servizio '*') $CasaServizio -Recurse -Force
    Riga 'Copiato in' $CasaServizio 'Green'

    # LE DIPENDENZE PRIMA DI ACCENDERE. Con PATHFINDER_PG impostata e `pg`
    # assente il servizio non parte affatto: i terminali vedono bianco. Il
    # 26/08 e' stato visto guardando prima, e da allora si guarda sempre.
    Assicura-Dipendenze $CasaServizio

    & (Join-Path $CasaServizio 'installa-servizio.ps1') -Porta $Porta `
        -Database $FileSqlite -CartellaBackup $CartellaBackup `
        -CartellaApplicativo (Join-Path $CasaApp 'corrente') `
        -PostgreSQL $stringaPg
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { Errore "L'installazione del servizio non e' andata a buon fine." }
}

# ── L'applicativo, e il servizio che porta lo stesso numero ────────────────
Titolo "$(if ($aggiornamento) { 'Installazione' } else { '2 di 2' })  —  l'applicativo $Versione"

if ($aggiornamento) {
    # LA COPIA DA MIGRARE SI CHIEDE ADESSO, A SERVIZIO ANCORA ACCESO.
    # Un file SQLite aperto non si copia con Copy-Item: ha un WAL accanto, e
    # quello che si porta via e' un database a meta'. La copia coerente la
    # scrive il servizio, ed e' lo stesso gesto del 26/08.
    $copiaCalda = $null
    if ($saltoAPostgres -and -not $SenzaMigrazione) {
        Write-Host "   Chiedo al servizio una copia a caldo del database..." -ForegroundColor Yellow
        try {
            $r = Invoke-RestMethod "http://127.0.0.1:$Porta/api/backup" -Method Post `
                 -ContentType 'application/json' -Body (@{ dir = $CartellaBackup } | ConvertTo-Json) -TimeoutSec 300
            if (-not $r.ok) { throw "il servizio ha risposto senza conferma" }
            $copiaCalda = $r.file
        } catch {
            Errore ("Il servizio non ha saputo darmi una copia del database:`n" +
                    "   $($_.Exception.Message)`n`n" +
                    "   Senza una copia coerente non si migra niente, e non ho toccato nulla.")
        }
        if (-not $copiaCalda -or -not (Test-Path $copiaCalda)) {
            Errore ("Il servizio ha risposto ma la copia non si trova: $copiaCalda`n" +
                    "   Senza una copia coerente non si migra niente, e non ho toccato nulla.")
        }
        Riga 'Copia' "$copiaCalda  ($([math]::Round((Get-Item $copiaCalda).Length/1MB,1)) MB)" 'Green'
    }

    # SI FERMA PRIMA DI COPIARE, e si riaccende comunque vada.
    # L'ordine non e' estetico: copiando a servizio fermo, gli script di
    # gestione che l'installazione userA' fra due righe sono gia' quelli del
    # pacchetto, e la macchina fa il gesto nuovo invece di quello del giorno
    # in cui e' nata. Il `finally` esiste perche' un'installazione fallita a
    # meta' deve lasciare acceso quello che ha spento.
    $arrivatoInFondo = $false
    Write-Host "   Fermo il servizio dati..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $NomeAttivita -ErrorAction SilentlyContinue
    foreach ($c in @(Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {}
    }

    try {
        New-Item -ItemType Directory -Path $CasaServizio -Force | Out-Null
        Copy-Item (Join-Path $Servizio '*') $CasaServizio -Recurse -Force
        Riga 'Servizio' "$Versione in $CasaServizio" 'Green'

        Assicura-Dipendenze $CasaServizio

        # IL PASSAGGIO A POSTGRESQL, se e' questo il giro. Sta QUI dentro, a
        # servizio fermo e a dipendenze appena controllate, perche' la
        # migrazione vuole `pg` e perche' nessuno deve scrivere sul file
        # SQLite mentre lo si legge. La copia da migrare e' gia' stata presa
        # a caldo prima di fermare: il file in servizio non si legge mai
        # direttamente, e nemmeno lo si copia con Copy-Item.
        if ($saltoAPostgres -and -not $SenzaMigrazione) { Migra-SuPostgres $CasaServizio $copiaCalda $stringaPg }

        & (Join-Path $CasaServizio 'installa-versione.ps1') -Da $App -Versione $Versione -Casa $CasaApp
        $arrivatoInFondo = $true
    } finally {
        # NEL SALTO NON BASTA RIACCENDERE: va riscritta la variabile di
        # macchina che dice quale database aprire, e quella la scrive
        # installa-servizio.ps1 — che rifa' anche la registrazione e prova il
        # backup, che su PostgreSQL e' un altro gesto e va visto funzionare
        # il giorno che si installa, non la notte che serve.
        #
        # Solo se si e' arrivati in fondo. Una migrazione fallita a meta'
        # deve lasciare il magazzino dov'era: sul file, che e' intatto.
        if ($saltoAPostgres -and $arrivatoInFondo) {
            Write-Host "   Riaccendo il servizio dati su PostgreSQL..." -ForegroundColor Yellow
            & (Join-Path $CasaServizio 'installa-servizio.ps1') -Porta $Porta `
                -Database $FileSqlite -CartellaBackup $CartellaBackup `
                -CartellaApplicativo (Join-Path $CasaApp 'corrente') `
                -PostgreSQL $stringaPg
            if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
                Errore "Il servizio non e' ripartito su PostgreSQL: il guaio e' scritto qui sopra."
            }
        } else {
            Write-Host "   Riaccendo il servizio dati..." -ForegroundColor Yellow
            Riavvia-Servizio
        }
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

# TERZO NUMERO DA GUARDARE, dalla 2.7: QUALE DATABASE il servizio ha aperto.
# Non basta che risponda e porti il numero giusto — il 26/08 una variabile
# con dentro un segnaposto ha tenuto il servizio a terra, e un'installazione
# che dichiara riuscito un servizio partito sul database sbagliato e' peggio
# di una fallita. Lo si chiede a /api/health, che dice cosa ha aperto DAVVERO.
$salute = $null
try { $salute = Invoke-RestMethod "http://127.0.0.1:$Porta/api/health" -TimeoutSec 5 } catch { }
$dbAperto = if ($salute) { $salute.file } else { '(il servizio non lo dice)' }

if ($modoDb -eq 'postgresql' -and $salute -and $dbAperto -notmatch '^postgres') {
    Write-Host "   Il servizio e' partito, ma NON su PostgreSQL:" -ForegroundColor Red
    Riga 'atteso' "PostgreSQL — $NomeDatabasePostgreSQL"
    Riga 'aperto' $dbAperto
    Errore ("PATHFINDER_PG viene letta all'avvio del processo, non al volo.`n" +
            "   L'applicativo e' installato: e' il database ad essere l'altro.")
}

Riga 'Versione'  $esito.versione 'Green'
Riga 'Servizio'  $esito.service_version 'Green'
Riga 'Impronta'  $esito.impronta 'Green'
Riga 'Database'  $dbAperto $(if ($modoDb -eq 'postgresql') { 'Green' } else { 'Gray' })
if ($modoDb -eq 'postgresql') { Riga 'File SQLite' "$FileSqlite  — fermo a oggi, e da oggi invecchia" }
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
