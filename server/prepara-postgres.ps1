<#
  Pathfinder — PostgreSQL: si controlla, e poi si prepara
  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)

  Lo chiama «installa.ps1» prima di installare il servizio, e si puo' lanciare
  da solo per guardare una macchina senza toccarla:

      .\prepara-postgres.ps1 -Prova

  COSA CONTROLLA, IN QUEST'ORDINE, e si ferma alla prima cosa che manca:
    1. i binari di PostgreSQL — psql, pg_dump, pg_restore. Il backup serale
       vive di pg_dump e pg_restore: un database che si apre e non si copia
       e' un magazzino senza via di casa, e non e' un'installazione riuscita.
    2. il servizio Windows di PostgreSQL, che se e' fermo si accende.
    3. la porta, in ascolto.
    4. l'accesso da superuser, che serve a creare ruolo e database.
    5. il ruolo e il database, che si creano se non ci sono.
    6. la connessione COME il ruolo di Pathfinder, che e' l'unica prova che
       quello che si e' scritto funziona davvero.

  IL MOTORE NON LO INSTALLA, E NON LO SCARICA. §5 dell'INDEX lo ha gia'
  pagato per il servizio dati: un binario scaricato da internet su un PC di
  magazzino e' l'antivirus che blocca, l'IT che chiede conto e nessuno che sa
  piu' perche' il magazzino e' fermo. Se PostgreSQL non c'e', questo script
  dice dove si prende e si ferma — e un'installazione che si ferma prima di
  toccare qualcosa e' un'installazione che non ha rotto niente.

  LA PASSWORD DEL RUOLO LA GENERA QUESTO SCRIPT, e nessuno la digita.
  Il 26/08/2026 il segnaposto «LA-TUA» e' finito dentro la variabile di
  macchina: sei caratteri, e il servizio non e' partito. Una password che
  nessuno scrive e' una password che nessuno sbaglia a sostituire. Finisce in
  PATHFINDER_PG, che leggono SYSTEM e gli amministratori, e viene mostrata
  una volta a schermo perche' quello e' il solo momento in cui si puo'
  ancora annotare.

  L'ALFABETO DELLA PASSWORD E' QUELLO CHE NON VA CODIFICATO. La stringa di
  connessione e' un URL: una `@` o una `/` dentro la password lo spezzano, e
  il servizio finirebbe a cercare un host che non esiste. Si generano solo
  caratteri che in un URL valgono se stessi.

  COSA RESTITUISCE: un oggetto con dentro la stringa di connessione, che il
  chiamante passa a `installa-servizio.ps1` DENTRO LO STESSO PROCESSO — con
  l'operatore `&`, non con un powershell nuovo. Una password in un parametro
  di riga di comando la legge chiunque guardi l'elenco dei processi.
#>

param(
    # Dove sta il database. In chiaro si parla solo con questa macchina: il
    # driver rifiuta di non verificare un certificato, e verso 127.0.0.1 non
    # c'e' rete da ascoltare.
    [string]$Indirizzo = '127.0.0.1',
    [int]$Porta = 5432,
    [string]$NomeDatabase = 'pathfinder',
    [string]$Ruolo = 'pathfinder',
    # Il superuser che crea ruolo e database. Serve una volta sola.
    [string]$Superuser = 'postgres',
    [string]$PasswordSuperuser = '',
    # In servizio c'e' la 17. Sotto la 14 non si va: sono le versioni che
    # PostgreSQL stesso non aggiorna piu', e un database di magazzino su un
    # motore senza correzioni di sicurezza e' una decisione, non un caso.
    [int]$MajorMinima = 14,
    # Guarda e non tocca: dice cosa c'e' e cosa mancherebbe, ed esce.
    [switch]$Prova,
    # L'opposto di questo script: toglie il database e il ruolo che crea.
    # NON si lancia a mano per sbaglio — lo chiama `installa.ps1 -Disinstalla
    # -AncheIlDatabase`, che prima salva un dump e poi chiede conferma.
    [switch]$Rimuovi,
    # Non chiede la password del superuser: serve al collaudo e a
    # un'installazione lanciata da un altro script.
    [switch]$NonChiedere,
    # La stringa gia' in servizio su questa macchina, se c'e'. Se risponde,
    # ruolo e password NON si toccano: rigenerare la password di un database
    # che sta gia' servendo un magazzino vuol dire fermarlo.
    [string]$StringaEsistente = ''
)

$ErrorActionPreference = 'Stop'

# Un parametro scritto male non simula: prepara. Stessa guardia di
# installa.ps1, e per la stessa ragione — PowerShell lanciato con -File
# scarta in silenzio quello che non trova nel param().
if ($args.Count) {
    Write-Host ""
    Write-Host "   Non ho capito questi argomenti, e non tocco niente:" -ForegroundColor Red
    Write-Host "     $($args -join ' ')" -ForegroundColor Red
    Write-Host ""
    exit 1
}

function RigaPg($etichetta, $valore, $colore = 'Gray') {
    Write-Host ("   {0,-14}" -f $etichetta) -NoNewline
    Write-Host $valore -ForegroundColor $colore
}

# Un guaio si racconta, non si lancia: chi legge deve sapere cosa manca e
# dove si prende, non vedere lo stack di PowerShell.
function GuaioPg($testo) {
    Write-Host ""
    Write-Host "   $testo" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ── Dove stanno i binari ───────────────────────────────────────────────────
# La stessa ricerca di `lib/driver-postgres.js`, e non e' una copia per caso:
# se lo script e il servizio cercassero in due posti diversi, si potrebbe
# installare con una versione e fare i backup con un'altra. La piu' recente
# per prima, perche' un dump scritto da una versione piu' vecchia del server
# viene rifiutato e il contrario no.
function TrovaPostgres {
    $radici = @($env:ProgramFiles, $env:ProgramW6432, ${env:ProgramFiles(x86)}) |
              Where-Object { $_ } | ForEach-Object { Join-Path $_ 'PostgreSQL' }
    foreach ($radice in $radici) {
        if (-not (Test-Path $radice)) { continue }
        $versioni = @(Get-ChildItem $radice -Directory -ErrorAction SilentlyContinue |
                      Where-Object { $_.Name -match '^\d+$' } |
                      Sort-Object { [int]$_.Name } -Descending)
        foreach ($v in $versioni) {
            $bin = Join-Path $v.FullName 'bin'
            if (Test-Path (Join-Path $bin 'psql.exe')) {
                return [pscustomobject]@{
                    major      = [int]$v.Name
                    bin        = $bin
                    psql       = Join-Path $bin 'psql.exe'
                    pg_dump    = Join-Path $bin 'pg_dump.exe'
                    pg_restore = Join-Path $bin 'pg_restore.exe'
                }
            }
        }
    }
    # In mancanza, il PATH: su una macchina dove psql c'e' comunque, questo
    # script funziona senza configurare niente.
    $daPath = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($daPath) {
        $bin = Split-Path -Parent $daPath.Source
        return [pscustomobject]@{
            major      = 0
            bin        = $bin
            psql       = $daPath.Source
            pg_dump    = Join-Path $bin 'pg_dump.exe'
            pg_restore = Join-Path $bin 'pg_restore.exe'
        }
    }
    return $null
}

# ── Parlare con il database ────────────────────────────────────────────────
# La password viaggia in PGPASSWORD, cioe' nell'ambiente, e non fra gli
# argomenti: l'elenco dei processi di Windows mostra la riga di comando a
# chiunque, e l'ambiente no.
#
# Start-Process e non l'operatore `&`: serve il codice di uscita separato dal
# testo, e in PowerShell 5.1 redirigere lo stderr di un eseguibile nativo
# dentro la pipeline lo trasforma in errori finti anche quando esce con 0.

# START-PROCESS NON METTE LE VIRGOLETTE, E UNA QUERY HA GLI SPAZI DENTRO.
# `-ArgumentList @('-c', 'SELECT count(*) FROM x')` non passa due argomenti:
# incolla l'elenco con degli spazi in mezzo, e psql riceve `-c SELECT` e poi
# `count(*)` come se fosse il nome del database. Il guaio e' che NON alza un
# errore: esce con 0 e senza niente in mano, e chi legge la risposta conclude
# «zero tavoli» — cioe' «database vuoto» — su un magazzino pieno. E' la
# direzione peggiore in cui sbagliare: e' esattamente il conteggio da cui
# dipende il rifiuto di migrare sopra dei dati.
# Le virgolette le mettiamo qui, con la regola di Windows: la stringa dentro
# `"`, le `"` interne come `\"`, e le barre che precedono una virgoletta
# raddoppiate.
function CitaArgomento([string]$a) {
    if ($a -eq '') { return '""' }
    if ($a -notmatch '[\s"]') { return $a }
    $s = $a -replace '(\\*)"', '$1$1\"'
    $s = $s -replace '(\\+)$', '$1$1'
    return '"' + $s + '"'
}

function EseguiPsql($pg, $utente, $password, $database, $sql) {
    $fileOut = [System.IO.Path]::GetTempFileName()
    $fileErr = [System.IO.Path]::GetTempFileName()
    # LA QUERY VIAGGIA IN UN FILE, non nella riga di comando. Anche quotata
    # bene, una query in riga di comando la vede chiunque guardi l'elenco dei
    # processi — e qui dentro passano nomi di ruolo e, con ALTER ROLE, una
    # password. `-f` la legge da un file che esiste per la durata del comando.
    $fileSql = [System.IO.Path]::GetTempFileName()
    $vecchia = $env:PGPASSWORD
    $env:PGPASSWORD = $password
    try {
        # Senza BOM: psql legge UTF-8 e su un BOM in testa si ferma con un
        # errore di sintassi che parla di un carattere che nessuno ha scritto.
        [System.IO.File]::WriteAllText($fileSql, $sql, (New-Object System.Text.UTF8Encoding $false))
        $argomenti = @(
            '-h', $Indirizzo, '-p', "$Porta", '-U', $utente, '-d', $database,
            '-w',                      # mai un prompt: uno script non ha nessuno davanti
            '-v', 'ON_ERROR_STOP=1',   # il primo errore ferma, invece di andare avanti
            '-A', '-t',                # senza cornice e senza intestazione: il valore e basta
            '-f', $fileSql
        ) | ForEach-Object { CitaArgomento $_ }
        $p = Start-Process -FilePath $pg.psql -ArgumentList $argomenti -NoNewWindow -Wait -PassThru `
                           -RedirectStandardOutput $fileOut -RedirectStandardError $fileErr
        $uscita = [pscustomobject]@{
            ok    = ($p.ExitCode -eq 0)
            testo = (Get-Content $fileOut -Raw -ErrorAction SilentlyContinue)
            guaio = (Get-Content $fileErr -Raw -ErrorAction SilentlyContinue)
        }
        if ($uscita.testo) { $uscita.testo = $uscita.testo.Trim() }
        if ($uscita.guaio) { $uscita.guaio = $uscita.guaio.Trim() }
        return $uscita
    } finally {
        $env:PGPASSWORD = $vecchia
        Remove-Item $fileOut, $fileErr, $fileSql -Force -ErrorAction SilentlyContinue
    }
}

# ── La password ────────────────────────────────────────────────────────────
# Solo caratteri che in un URL valgono se stessi: la stringa di connessione
# e' un URL, e una `@` o una `/` dentro la password lo spezzerebbero in
# silenzio — il servizio andrebbe a cercare un host che non esiste.
function GeneraPassword([int]$quanti = 28) {
    $alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
    $byte = New-Object 'byte[]' $quanti
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($byte) } finally { $rng.Dispose() }
    -join ($byte | ForEach-Object { $alfabeto[$_ % $alfabeto.Length] })
}

function Mascherata([string]$stringa) {
    return ($stringa -replace '://[^@]*@', '://***@')
}

# Un identificativo dentro una virgoletta doppia, con le virgolette
# raddoppiate: `pathfinder` non ne ha bisogno, ma un nome scelto da chi
# installa si', e un nome che chiude la virgoletta esegue quello che viene
# dopo.
function CitaNome([string]$n) { return '"' + ($n -replace '"', '""') + '"' }
# Una stringa dentro apici singoli, raddoppiati: e' cosi' che una password
# entra in ALTER ROLE senza poterne uscire.
function CitaTesto([string]$t) { return "'" + ($t -replace "'", "''") + "'" }

Write-Host ""
Write-Host "  PATHFINDER - PostgreSQL" -ForegroundColor Cyan
Write-Host ""

# ── 1. I binari ────────────────────────────────────────────────────────────
$pg = TrovaPostgres
if (-not $pg) {
    GuaioPg ("PostgreSQL non risulta installato su questa macchina.`n`n" +
             "   Si prende da https://www.postgresql.org/download/windows/ — l'installer`n" +
             "   di EDB, versione 17. Durante l'installazione si sceglie una password per`n" +
             "   l'utente «postgres»: serve UNA VOLTA a questo script, e va annotata.`n`n" +
             "   Installato PostgreSQL, rilanciare questo pacchetto: da li' in poi non`n" +
             "   c'e' piu' niente da digitare.`n`n" +
             "   Il motore NON viene scaricato da qui: un binario preso da internet su un`n" +
             "   PC di magazzino e' l'antivirus che blocca e il magazzino fermo senza che`n" +
             "   nessuno sappia perche'.")
}

$versioneCompleta = $null
try { $versioneCompleta = (& $pg.psql --version) -join ' ' } catch { }
RigaPg 'PostgreSQL' "$(if ($versioneCompleta) { $versioneCompleta.Trim() } else { "major $($pg.major)" })  ->  $($pg.bin)"

if ($pg.major -gt 0 -and $pg.major -lt $MajorMinima) {
    GuaioPg ("Su questa macchina c'e' PostgreSQL $($pg.major), e serve almeno la $MajorMinima.`n" +
             "   In servizio in magazzino c'e' la 17. Le versioni sotto la $MajorMinima non ricevono`n" +
             "   piu' correzioni, e un database di magazzino non ci sta sopra per distrazione.")
}

# IL BACKUP VIVE DI QUESTI DUE, e si guardano ADESSO. Su PostgreSQL il
# backup serale e' un pg_dump riletto con pg_restore --list: senza uno dei
# due il magazzino gira e non ha via di casa, e il registro del backup lo
# direbbe soltanto la sera.
foreach ($nome in @('pg_dump', 'pg_restore')) {
    if (-not (Test-Path $pg.$nome)) {
        GuaioPg ("Manca $nome.exe in $($pg.bin).`n" +
                 "   Il backup serale su PostgreSQL e' un pg_dump riletto con pg_restore:`n" +
                 "   senza, il magazzino girerebbe senza via di casa. Reinstallare PostgreSQL`n" +
                 "   scegliendo anche gli strumenti da riga di comando.")
    }
}
RigaPg 'Strumenti' 'pg_dump e pg_restore presenti' 'Green'

# ── 2. Il servizio Windows ─────────────────────────────────────────────────
$servizioPg = Get-Service -Name "postgresql*$($pg.major)*" -ErrorAction SilentlyContinue |
              Select-Object -First 1
if (-not $servizioPg) {
    $servizioPg = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($servizioPg) {
    if ($servizioPg.Status -ne 'Running') {
        if ($Prova) {
            RigaPg 'Servizio' "$($servizioPg.Name)  FERMO — andrebbe acceso" 'Yellow'
        } else {
            Write-Host "   Il servizio PostgreSQL e' fermo: lo accendo..." -ForegroundColor Yellow
            try {
                Start-Service -Name $servizioPg.Name
                $servizioPg.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
            } catch {
                GuaioPg ("Non riesco ad accendere il servizio «$($servizioPg.Name)».`n" +
                         "   $($_.Exception.Message)")
            }
            RigaPg 'Servizio' "$($servizioPg.Name)  acceso adesso" 'Green'
        }
    } else {
        RigaPg 'Servizio' "$($servizioPg.Name)  in esecuzione" 'Green'
    }
} else {
    # Non e' per forza un guaio: il database potrebbe stare su un'altra
    # macchina, o dentro un contenitore. Lo dice la prova sulla porta.
    RigaPg 'Servizio' 'nessun servizio Windows di PostgreSQL su questa macchina' 'Yellow'
}

# ── 3. La porta ────────────────────────────────────────────────────────────
$ascolta = $false
try {
    $c = New-Object System.Net.Sockets.TcpClient
    $attesa = $c.BeginConnect($Indirizzo, $Porta, $null, $null)
    if ($attesa.AsyncWaitHandle.WaitOne(5000)) { $c.EndConnect($attesa); $ascolta = $true }
    $c.Close()
} catch { $ascolta = $false }

if (-not $ascolta) {
    GuaioPg ("Nessuno risponde su ${Indirizzo}:$Porta.`n" +
             "   PostgreSQL e' installato ma non sta ascoltando li'. Controllare che il`n" +
             "   servizio sia acceso e che la porta sia quella (postgresql.conf).")
}
RigaPg 'Porta' "${Indirizzo}:$Porta  in ascolto" 'Green'

# ── La stringa gia' in servizio, se c'e' ───────────────────────────────────
# UN DATABASE CHE STA GIA' SERVENDO UN MAGAZZINO NON SI TOCCA. Se la stringa
# che la macchina ha in mano risponde, e parla del database che stiamo
# preparando, non si crea niente e non si rigenera nessuna password:
# rigenerarla vorrebbe dire fermare il magazzino per rimetterlo com'era.
if ($StringaEsistente) {
    $u = $null
    try { $u = [uri]$StringaEsistente } catch { $u = $null }
    $dbEsistente = if ($u) { $u.AbsolutePath.TrimStart('/') -replace '\?.*$', '' } else { '' }
    if ($u -and $dbEsistente -eq $NomeDatabase) {
        $utenteEsistente = ($u.UserInfo -split ':')[0]
        $passwordEsistente = [uri]::UnescapeDataString(($u.UserInfo -split ':', 2)[1])
        $r = EseguiPsql $pg $utenteEsistente $passwordEsistente $NomeDatabase 'SELECT 1'
        if ($r.ok) {
            RigaPg 'Gia'' pronto' "il database «$NomeDatabase» risponde con le credenziali di questa macchina" 'Green'
            $tavoli = EseguiPsql $pg $utenteEsistente $passwordEsistente $NomeDatabase `
                      "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
            Write-Host ""
            return [pscustomobject]@{
                ok       = $true
                stringa  = $StringaEsistente
                database = $NomeDatabase
                ruolo    = $utenteEsistente
                password = $null      # non la si e' generata qui: non la si ripete
                major    = $pg.major
                bin      = $pg.bin
                nuovo    = $false
                # UNA RISPOSTA VUOTA NON E' UNO ZERO. `[int]''` fa 0, e uno
                # zero qui significa «database vuoto, si puo' migrarci
                # sopra»: si pretende una cifra, o non si conclude niente.
                vuoto    = ($tavoli.ok -and $tavoli.testo -match '^\d+$' -and [int]$tavoli.testo -eq 0)
            }
        }
        RigaPg 'Gia'' impostato' 'la stringa in macchina NON risponde: si rifa'' da capo' 'Yellow'
    }
}

# ── 4. Il superuser ────────────────────────────────────────────────────────
if (-not $PasswordSuperuser) {
    if ($env:PGPASSWORD) {
        $PasswordSuperuser = $env:PGPASSWORD
    } elseif ($Prova) {
        RigaPg 'Superuser' "$Superuser  — password non fornita: non provo l'accesso" 'Yellow'
    } elseif ($NonChiedere) {
        GuaioPg ("Manca la password del superuser «$Superuser».`n" +
                 "   Serve una volta sola, per creare il ruolo e il database di Pathfinder.`n" +
                 "   Passarla con -PasswordSuperuser, oppure lanciare senza -NonChiedere.")
    } else {
        Write-Host ""
        Write-Host "   Serve UNA VOLTA la password dell'utente «$Superuser» di PostgreSQL," -ForegroundColor White
        Write-Host "   quella scelta installando il motore. Serve a creare il ruolo e il"
        Write-Host "   database di Pathfinder, e non viene salvata da nessuna parte."
        Write-Host ""
        $sicura = Read-Host "   Password di $Superuser" -AsSecureString
        $PasswordSuperuser = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicura))
    }
}

if ($PasswordSuperuser) {
    $r = EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' 'SELECT 1'
    if (-not $r.ok) {
        GuaioPg ("Non riesco ad entrare come «$Superuser»:`n" +
                 "   $($r.guaio)`n`n" +
                 "   E' la password scelta quando si e' installato PostgreSQL. Se non si sa`n" +
                 "   piu', si cambia da pgAdmin oppure mettendo `"trust`" in pg_hba.conf per`n" +
                 "   le connessioni locali, il tempo di rimetterla.")
    }
    RigaPg 'Superuser' "$Superuser  accesso riuscito" 'Green'
}

# ── L'opposto: si toglie quello che questo script mette ────────────────────
#
#  QUI SI CANCELLA UN MAGAZZINO, e per questo non decide niente: il dump l'ha
#  gia' preso chi chiama, la conferma l'ha gia' data una persona, e qui si
#  esegue e si dice cosa si e' fatto. Chi arriva senza password non passa.
#
#  L'ORDINE CONTA: prima si staccano le connessioni aperte, poi cade il
#  database, poi il ruolo. Un ruolo non si toglie finche' possiede qualcosa,
#  e un database non cade finche' qualcuno ci sta dentro — «is being accessed
#  by other users», che a servizio appena fermato capita eccome.
#
#  E OGNI COMANDO VA DA SOLO. `psql -c "a; b; c;"` avvolge tutto in una
#  transazione, e `DROP DATABASE` dentro una transazione non si puo' fare:
#  «non e' possibile eseguire DROP DATABASE all'interno di un blocco di
#  transazione». `EseguiPsql` passa da `-f`, che invece esegue una istruzione
#  per volta in autocommit — ma le tre restano tre chiamate, non una.
if ($Rimuovi) {
    # SENZA PASSWORD NON SI GUARDA E NON SI TOCCA, ma le due cose finiscono
    # diverse: la prova dice «non verificato» e va avanti, la rimozione vera
    # si ferma. Una prova che pretende una password non la lancia nessuno.
    $esisteDb = $null
    $esisteRuolo = $null
    if ($PasswordSuperuser) {
        $esisteDb = [bool](EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' `
                     "SELECT 1 FROM pg_database WHERE datname = $(CitaTesto $NomeDatabase)").testo
        $esisteRuolo = [bool](EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' `
                        "SELECT 1 FROM pg_roles WHERE rolname = $(CitaTesto $Ruolo)").testo
    }

    if ($Prova) {
        Write-Host ""
        RigaPg 'PROVA' 'nessuna modifica: ecco cosa toglierebbe' 'Cyan'
        RigaPg 'database' "$NomeDatabase  $(if ($null -eq $esisteDb) { '(non verificato: manca la password)' } elseif ($esisteDb) { 'DA TOGLIERE' } else { 'non c''e''' })" $(if ($esisteDb) { 'Yellow' } else { 'Gray' })
        RigaPg 'ruolo'    "$Ruolo  $(if ($null -eq $esisteRuolo) { '(non verificato: manca la password)' } elseif ($esisteRuolo) { 'DA TOGLIERE' } else { 'non c''e''' })" $(if ($esisteRuolo) { 'Yellow' } else { 'Gray' })
        Write-Host ""
        return [pscustomobject]@{ ok = $true; rimosso = $false; database = $NomeDatabase; ruolo = $Ruolo }
    }

    if (-not $PasswordSuperuser) {
        GuaioPg ("Per togliere il database serve la password di «$Superuser», e non e' stata data.")
    }

    if ($esisteDb) {
        $r = EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' (
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity " +
            "WHERE datname = $(CitaTesto $NomeDatabase) AND pid <> pg_backend_pid()")
        if (-not $r.ok) { GuaioPg "Non sono riuscito a staccare le connessioni: $($r.guaio)" }

        $r = EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' "DROP DATABASE $(CitaNome $NomeDatabase)"
        if (-not $r.ok) { GuaioPg "Il database non e' stato tolto: $($r.guaio)" }
        RigaPg 'database' "$NomeDatabase  tolto" 'Yellow'
    } else {
        RigaPg 'database' "$NomeDatabase  non c'era" 'Gray'
    }

    if ($esisteRuolo) {
        $r = EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' "DROP ROLE $(CitaNome $Ruolo)"
        if (-not $r.ok) { GuaioPg "Il ruolo non e' stato tolto: $($r.guaio)" }
        RigaPg 'ruolo' "$Ruolo  tolto" 'Yellow'
    } else {
        RigaPg 'ruolo' "$Ruolo  non c'era" 'Gray'
    }

    Write-Host ""
    return [pscustomobject]@{ ok = $true; rimosso = $true; database = $NomeDatabase; ruolo = $Ruolo }
}

# ── La prova si ferma qui ──────────────────────────────────────────────────
if ($Prova) {
    $esisteRuolo = $null
    $esisteDb = $null
    if ($PasswordSuperuser) {
        $esisteRuolo = (EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' `
                        "SELECT 1 FROM pg_roles WHERE rolname = $(CitaTesto $Ruolo)").testo
        $esisteDb = (EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' `
                     "SELECT 1 FROM pg_database WHERE datname = $(CitaTesto $NomeDatabase)").testo
    }
    Write-Host ""
    RigaPg 'PROVA' 'nessuna modifica: ecco cosa farebbe' 'Cyan'
    RigaPg 'ruolo'    "$Ruolo  $(if ($esisteRuolo) { '(c''e'' gia'')' } elseif ($PasswordSuperuser) { '(da creare)' } else { '(non verificato)' })"
    RigaPg 'database' "$NomeDatabase  $(if ($esisteDb) { '(c''e'' gia'')' } elseif ($PasswordSuperuser) { '(da creare)' } else { '(non verificato)' })"
    RigaPg 'stringa'  "postgres://${Ruolo}:***@${Indirizzo}:$Porta/$NomeDatabase"
    Write-Host ""
    return [pscustomobject]@{
        ok = $true; stringa = $null; database = $NomeDatabase; ruolo = $Ruolo
        password = $null; major = $pg.major; bin = $pg.bin; nuovo = $false; vuoto = $null
    }
}

# ── 5. Il ruolo e il database ──────────────────────────────────────────────
$Password = GeneraPassword
$q = { param($sql) EseguiPsql $pg $Superuser $PasswordSuperuser 'postgres' $sql }

$ruoloCera = [bool](& $q "SELECT 1 FROM pg_roles WHERE rolname = $(CitaTesto $Ruolo)").testo
if ($ruoloCera) {
    # C'e' gia', e la sua password nessuno la sa piu' — la stringa in
    # macchina non rispondeva, o non saremmo qui. Si riscrive: un ruolo di
    # cui non si conosce la password e' un ruolo che non si puo' usare.
    $r = & $q "ALTER ROLE $(CitaNome $Ruolo) WITH LOGIN PASSWORD $(CitaTesto $Password)"
    if (-not $r.ok) { GuaioPg "Non riesco a riscrivere la password del ruolo «$Ruolo»:`n   $($r.guaio)" }
    RigaPg 'Ruolo' "$Ruolo  c'era gia': password rigenerata" 'Yellow'
} else {
    $r = & $q "CREATE ROLE $(CitaNome $Ruolo) WITH LOGIN PASSWORD $(CitaTesto $Password)"
    if (-not $r.ok) { GuaioPg "Non riesco a creare il ruolo «$Ruolo»:`n   $($r.guaio)" }
    RigaPg 'Ruolo' "$Ruolo  creato" 'Green'
}

$dbCera = [bool](& $q "SELECT 1 FROM pg_database WHERE datname = $(CitaTesto $NomeDatabase)").testo
if ($dbCera) {
    RigaPg 'Database' "$NomeDatabase  c'era gia': NON viene toccato" 'Yellow'
    $r = & $q "ALTER DATABASE $(CitaNome $NomeDatabase) OWNER TO $(CitaNome $Ruolo)"
    if (-not $r.ok) { GuaioPg "Il database «$NomeDatabase» c'e' ma non riesco a darlo a «$Ruolo»:`n   $($r.guaio)" }
} else {
    # LC_COLLATE 'C' — il testo si confronta byte per byte, come su SQLite.
    # Con `it_IT` l'ordine cambia: la punteggiatura pesa meno e le maiuscole
    # si mescolano alle minuscole, e `ORDER BY location_code` e' quello che
    # il client legge per disegnare una corsia. Lo schema mette comunque
    # COLLATE "C" colonna per colonna — questo lo fissa anche per tutto il
    # resto, e serve template0 perche' template1 impone la sua.
    $r = & $q ("CREATE DATABASE $(CitaNome $NomeDatabase) OWNER $(CitaNome $Ruolo) " +
               "ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0")
    if (-not $r.ok) {
        GuaioPg "Non riesco a creare il database «$NomeDatabase»:`n   $($r.guaio)"
    }
    RigaPg 'Database' "$NomeDatabase  creato — UTF8, LC_COLLATE 'C'" 'Green'
}

# Lo schema lo crea il servizio all'avvio, e per crearlo deve poter scrivere
# nello schema `public`. Da PostgreSQL 15 `public` non e' piu' scrivibile da
# chiunque: senza questa riga il servizio partirebbe e morirebbe sul primo
# CREATE TABLE, che e' il genere di guasto che si vede solo dai terminali.
$r = EseguiPsql $pg $Superuser $PasswordSuperuser $NomeDatabase `
     "GRANT ALL ON SCHEMA public TO $(CitaNome $Ruolo)"
if (-not $r.ok) { GuaioPg "Non riesco a dare lo schema public a «$Ruolo»:`n   $($r.guaio)" }

# ── 6. La prova che conta: entrarci come ci entra il servizio ──────────────
$Stringa = "postgres://${Ruolo}:${Password}@${Indirizzo}:$Porta/$NomeDatabase"
$r = EseguiPsql $pg $Ruolo $Password $NomeDatabase 'SELECT 1'
if (-not $r.ok) {
    GuaioPg ("Il ruolo e il database ci sono, ma «$Ruolo» non riesce ad entrare:`n" +
             "   $($r.guaio)`n`n" +
             "   Di solito e' pg_hba.conf: le connessioni da $Indirizzo devono essere`n" +
             "   ammesse con «scram-sha-256» o «md5», non con «reject».")
}
RigaPg 'Prova' "connessione come «$Ruolo» riuscita" 'Green'

$tavoli = EseguiPsql $pg $Ruolo $Password $NomeDatabase `
          "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
if (-not $tavoli.ok -or $tavoli.testo -notmatch '^\d+$') {
    # Non sapere quanti tavoli ci sono non e' «non ce ne sono»: si dice che
    # non si sa, e chi decide di migrarci sopra lo fa avendolo letto.
    GuaioPg ("Il database risponde ma non riesco a contare cosa ha dentro:`n   $($tavoli.guaio)")
}
$vuoto = ([int]$tavoli.testo -eq 0)
RigaPg 'Contenuto' $(if ($vuoto) { 'nessun tavolo: database nuovo' } else { "$($tavoli.testo) tavoli gia' dentro" })

Write-Host ""
Write-Host "   La password del ruolo «$Ruolo» e' questa, e si vede una volta sola:" -ForegroundColor Yellow
Write-Host "     $Password" -ForegroundColor White
Write-Host ""
Write-Host "   Va nella variabile di macchina PATHFINDER_PG, che leggono SYSTEM e gli"
Write-Host "   amministratori. Annotarla adesso serve solo a chi un giorno vorra'"
Write-Host "   collegarsi al database con pgAdmin: il servizio la legge da li' da solo."
Write-Host ""

return [pscustomobject]@{
    ok       = $true
    stringa  = $Stringa
    database = $NomeDatabase
    ruolo    = $Ruolo
    password = $Password
    major    = $pg.major
    bin      = $pg.bin
    nuovo    = (-not $dbCera)
    vuoto    = $vuoto
}
