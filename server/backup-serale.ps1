# ═══════════════════════════════════════════════════════════════════
#  PATHFINDER — BACKUP SERALE DEL DATABASE
#  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
#
#  Chiede al servizio di duplicare il proprio database e scrive una riga
#  di esito in un registro.
#
#  PERCHÉ PASSARE DAL SERVIZIO E NON COPIARE IL FILE.
#  Il database è aperto e ha un WAL accanto: copiarlo con Copy-Item mentre
#  qualcuno ci scrive produce un file che sembra buono e non lo è — le
#  scritture ancora nel WAL non ci sono, e nessuno se ne accorge finché non
#  serve il backup. L'endpoint /api/backup passa dall'API di backup di
#  SQLite, che di una copia coerente se ne fa carico. È l'unico modo
#  corretto, e il servizio lo sa fare già.
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
    [int]$GiorniDiConservazione = 0
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
try {
    $corpo = @{ dir = $Cartella } | ConvertTo-Json
    $esito = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/backup" `
        -Method Post -Body $corpo -ContentType 'application/json' -TimeoutSec 300

    if (-not $esito.ok) { throw "il servizio ha risposto senza conferma" }

    $file = Get-Item $esito.file
    $mb = [math]::Round($file.Length / 1MB, 1)
    Scrivi-Riga "OK       $($file.Name)  ($mb MB)"
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
    $vecchi = Get-ChildItem -Path $Cartella -Filter 'pathfinder-*.db' |
              Where-Object { $_.LastWriteTime -lt $limite }
    foreach ($v in $vecchi) {
        Remove-Item $v.FullName -Force
        Scrivi-Riga "RIMOSSO  $($v.Name)  (oltre $GiorniDiConservazione giorni)"
    }
}

exit 0
