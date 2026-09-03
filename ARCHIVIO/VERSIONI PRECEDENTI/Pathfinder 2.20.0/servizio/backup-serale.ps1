# ═══════════════════════════════════════════════════════════════════
#  PATHFINDER — BACKUP SERALE DEL DATABASE
#  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
#
#  Chiede al servizio di duplicare il proprio database e scrive una riga
#  di esito in un registro.
#
#  FUNZIONA SU TUTTI E DUE I DATABASE, E NON SA QUALE C'È — 2.6.
#  Chiede al servizio, e il servizio sceglie: su SQLite una copia coerente
#  del file, su PostgreSQL un `pg_dump` in formato custom riletto con
#  `pg_restore --list` prima di dichiararlo buono. Questo script legge il
#  nome dalla risposta e non guarda l'estensione.
#
#  PERCHÉ PASSARE DAL SERVIZIO E NON COPIARE IL FILE.
#  Il database è aperto e ha un WAL accanto: copiarlo con Copy-Item mentre
#  qualcuno ci scrive produce un file che sembra buono e non lo è — le
#  scritture ancora nel WAL non ci sono, e nessuno se ne accorge finché non
#  serve il backup. L'endpoint /api/backup passa dall'API di backup di
#  SQLite, che di una copia coerente se ne fa carico. È l'unico modo
#  corretto, e il servizio lo sa fare già.
#
#  LA COPIA SECONDARIA — 2.18, e anche questa va CHIESTA.
#  Backup e database stanno sulla stessa macchina, e dalla 2.6 anche sullo
#  stesso disco: un guasto del disco porta via i dati E i loro backup nello
#  stesso momento. Con -CopiaSecondaria il file gia' verificato viene copiato
#  una seconda volta dove dice l'IT — una cartella di rete, un disco esterno —
#  e l'esito della copia finisce nel registro come tutto il resto.
#  Se la copia non riesce, il backup NON è fallito: l'originale è al suo posto
#  ed è stato riletto. Si scrive una riga e si esce con zero, perché
#  un'attività pianificata in rosso per una cartella di rete irraggiungibile
#  è il modo in cui si smette di guardare le attività pianificate.
#
#  PERCHÉ NON CANCELLA NIENTE DA SOLO.
#  Convenzione §9.4: nessuna cancellazione automatica. La rotazione dei
#  backup vecchi esiste ma va CHIESTA, passando -GiorniDiConservazione.
#  Con il valore predefinito (0) non viene rimosso nulla, mai.
#
#  Si lancia da solo tutte le sere, registrato da installa-servizio.ps1.
#  A mano, per provarlo:
#      .\backup-serale.ps1
# ═══════════════════════════════════════════════════════════════════

param(
    [int]$Porta = 4173,
    [string]$Cartella = 'C:\Pathfinder\backup',
    [int]$GiorniDiConservazione = 0,
    [string]$CopiaSecondaria = ''
)

$ErrorActionPreference = 'Stop'
$registro = Join-Path $Cartella 'backup.log'

function Scrivi-Riga([string]$testo) {
    $riga = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $testo
    Write-Host $riga
    try { Add-Content -Path $registro -Value $riga -Encoding utf8 } catch { }
}

if (-not (Test-Path $Cartella)) {
    New-Item -ItemType Directory -Force -Path $Cartella | Out-Null
}

# ── Il backup ───────────────────────────────────────────────────────
#
#  2.11 — LA CHIAVE. Dalla 2.11 `/api/backup` vuole una sessione, e una
#  sessione nasce da un PIN digitato in una maschera: qui non c'è nessuno che
#  digiti niente alle otto di sera. La chiave di macchina la scrive
#  `installa-servizio.ps1` una volta sola, e sta fra le variabili di macchina
#  come `PATHFINDER_PG`. Se manca, la richiesta parte lo stesso: su una
#  macchina dove nessun operatore ha ancora un PIN il servizio risponde
#  comunque, ed è meglio un backup che riesce di un backup che si rifiuta di
#  provarci.
try {
    $intestazioni = @{}
    $chiave = $env:PATHFINDER_TOKEN
    if (-not $chiave) { $chiave = [Environment]::GetEnvironmentVariable('PATHFINDER_TOKEN', 'Machine') }
    if ($chiave) { $intestazioni['X-Pathfinder-Token'] = $chiave }

    $corpo = @{ dir = $Cartella } | ConvertTo-Json
    $esito = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/backup" `
        -Method Post -Body $corpo -ContentType 'application/json' -TimeoutSec 300 `
        -Headers $intestazioni

    if (-not $esito.ok) { throw "il servizio ha risposto senza conferma" }

    $file = Get-Item $esito.file
    $mb = [math]::Round($file.Length / 1MB, 1)
    Scrivi-Riga "OK       $($file.Name)  ($mb MB)"

    # ── La copia secondaria, se è stata chiesta ─────────────────────
    if ($CopiaSecondaria) {
        try {
            if (-not (Test-Path $CopiaSecondaria)) {
                New-Item -ItemType Directory -Force -Path $CopiaSecondaria | Out-Null
            }
            $destinazione = Join-Path $CopiaSecondaria $file.Name
            Copy-Item -LiteralPath $file.FullName -Destination $destinazione -Force
            # SI GUARDA IL RISULTATO, NON IL CODICE DI USCITA — è la lezione
            # di icacls (voce 75): una cosa che esce con zero non è una cosa
            # riuscita. Qui il risultato è un file che c'è e pesa uguale.
            $copiato = Get-Item -LiteralPath $destinazione -ErrorAction Stop
            if ($copiato.Length -ne $file.Length) {
                throw "copiati $($copiato.Length) byte su $($file.Length)"
            }
            Scrivi-Riga "COPIA    $destinazione  ($mb MB)"
        }
        catch {
            Scrivi-Riga "COPIA NON RIUSCITA  $CopiaSecondaria  $($_.Exception.Message)"
        }
    }
}
catch {
    # PERCHÉ USCIRE CON 1: l'Utilità di pianificazione registra il codice di
    # uscita. Un backup che fallisce in silenzio è peggio di nessun backup —
    # ci si accorge che manca il giorno in cui serve.
    Scrivi-Riga "FALLITO  $($_.Exception.Message)"
    exit 1
}

# ── Rotazione, solo se richiesta esplicitamente ─────────────────────
if ($GiorniDiConservazione -gt 0) {
    $limite = (Get-Date).AddDays(-$GiorniDiConservazione)
    # 2.6 — NON PIU' SOLO `.db`. Su PostgreSQL la copia e' un `.dump` scritto
    # da pg_dump: un filtro che nomina l'estensione smette di trovare i
    # backup il giorno che si cambia database, e la rotazione non ruota piu'.
    $vecchi = Get-ChildItem -Path $Cartella -Filter 'pathfinder-*' -File |
              Where-Object { $_.Extension -in '.db', '.dump' } |
              Where-Object { $_.LastWriteTime -lt $limite }
    foreach ($v in $vecchi) {
        Remove-Item $v.FullName -Force
        Scrivi-Riga "RIMOSSO  $($v.Name)  (oltre $GiorniDiConservazione giorni)"
    }
}

exit 0
