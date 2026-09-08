# ═══════════════════════════════════════════════════════════════════
#  PATHFINDER — IL CERTIFICATO DELLA MACCHINA CHE SERVE
#  © Andrea Sacchetti — Dietopack S.r.l. (Naturacare Group)
#
#  Crea il certificato con cui il servizio parla in HTTPS, usando SOLO
#  quello che Windows ha già dentro: `New-SelfSignedCertificate` e
#  `Export-PfxCertificate`. Nessun eseguibile scaricato — è la stessa
#  ragione per cui il servizio è un'attività pianificata e non un servizio
#  nativo con un wrapper preso da internet (vedi installa-servizio.ps1).
#
#  PERCHÉ SERVE. Dalla 2.25 Pathfinder si può installare sul terminale come
#  applicazione — il chiosco — e nessun browser installa una pagina servita
#  in chiaro. Senza certificato il chiosco resta una possibilità dichiarata,
#  e il PIN dell'operatore viaggia in chiaro sulla rete di reparto.
#
#  DUE CERTIFICATI E NON UNO, ED È LA PARTE CHE CONTA.
#  Si crea una piccola AUTORITÀ locale — «Pathfinder CA» — e con quella si
#  firma il certificato del servizio. Sui terminali si installa SOLO
#  l'autorità, una volta. Quando il certificato del servizio scade lo si
#  rifà con -Rinnova e in corsia non si tocca niente: senza l'autorità
#  bisognerebbe rifare il giro dei terminali a ogni scadenza.
#
#  IL NOME NEL CERTIFICATO DEVE ESSERE QUELLO CHE SI DIGITA.
#  Un certificato vale per i nomi che dichiara. Se i terminali aprono
#  `https://10.0.0.12:4173` deve esserci dentro quell'INDIRIZZO, non solo il
#  nome macchina: per questo lo script raccoglie da sé nome, nome completo e
#  tutti gli IPv4 della macchina, e con -Nomi se ne aggiungono altri.
#
#  Si lancia da PowerShell COME AMMINISTRATORE, sulla macchina che serve:
#      .\crea-certificato.ps1
#
#  Aggiungendo un nome che i terminali useranno (un alias DNS, per esempio):
#      .\crea-certificato.ps1 -Nomi 'pathfinder','pathfinder.dietopack.local'
#
#  Alla scadenza, tenendo la stessa autorità:
#      .\crea-certificato.ps1 -Rinnova
# ═══════════════════════════════════════════════════════════════════

param(
    # Dove finiscono il PFX del servizio e il .cer da portare sui terminali.
    # Sta accanto al database e ai backup, fuori da qualunque cartella
    # sincronizzata: dentro c'è una chiave privata.
    [string]$Cartella = 'C:\Pathfinder\tls',

    # Quanto dura il certificato del servizio. Cinque anni: la regola dei
    # 398 giorni vale per i certificati che risalgono a un'autorità
    # PUBBLICA, e questa è locale.
    [int]$Anni = 5,

    # Nomi in più da mettere nel certificato — alias DNS, nome completo di
    # dominio, quello che i terminali digitano davvero.
    [string[]]$Nomi = @(),

    # Rifà il certificato del servizio tenendo l'autorità che c'è già: i
    # terminali non vanno toccati.
    [switch]$Rinnova,

    # Rifà tutto, autorità compresa. I terminali vanno rifidati uno per uno.
    [switch]$Forza
)

$ErrorActionPreference = 'Stop'

function Riga([string]$etichetta, [string]$valore, [string]$colore = 'Gray') {
    Write-Host ('  {0,-13}' -f $etichetta) -NoNewline
    Write-Host $valore -ForegroundColor $colore
}

# ── Amministratore, o non si scrive in LocalMachine ────────────────────────
$identita = [Security.Principal.WindowsIdentity]::GetCurrent()
$ruolo = New-Object Security.Principal.WindowsPrincipal($identita)
if (-not $ruolo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ''
    Write-Host '  Serve PowerShell COME AMMINISTRATORE.' -ForegroundColor Red
    Write-Host '  Il certificato va nell''archivio della MACCHINA, non in quello dell''utente:'
    Write-Host '  il servizio gira come SYSTEM e l''archivio dell''utente non lo vede.'
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host '  Pathfinder — certificato della macchina' -ForegroundColor Cyan
Write-Host ''

# ── I nomi per cui il certificato varrà ────────────────────────────────────
#
# Un nome sbagliato qui è un avviso rosso sul terminale, e un avviso rosso
# vuol dire che il chiosco non si installa.
$dns = New-Object System.Collections.Generic.List[string]
$ind = New-Object System.Collections.Generic.List[string]

$dns.Add($env:COMPUTERNAME.ToLower())
$dns.Add('localhost')
$dominio = (Get-CimInstance Win32_ComputerSystem).Domain
if ($dominio -and $dominio -ne 'WORKGROUP') {
    $dns.Add("$($env:COMPUTERNAME.ToLower()).$($dominio.ToLower())")
}
foreach ($n in $Nomi) { if ($n) { $dns.Add($n.ToLower()) } }

$ind.Add('127.0.0.1')
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
    ForEach-Object { $ind.Add($_.IPAddress) }

$dns = $dns | Select-Object -Unique
$ind = $ind | Select-Object -Unique

Riga 'nomi' ($dns -join ', ')
Riga 'indirizzi' ($ind -join ', ')

# 2.5.29.17 è il Subject Alternative Name. `New-SelfSignedCertificate -DnsName`
# scriverebbe gli IP come se fossero nomi DNS, e un browser che apre un
# indirizzo NON accetta quella corrispondenza: gli IP vogliono `IPAddress=`.
$voci = @()
foreach ($n in $dns) { $voci += "DNS=$n" }
foreach ($a in $ind) { $voci += "IPAddress=$a" }
$san = '2.5.29.17={text}' + ($voci -join '&')

# ── L'autorità locale ──────────────────────────────────────────────────────
$archivio = 'Cert:\LocalMachine\My'
$soggettoCA = 'CN=Pathfinder CA - ' + $env:COMPUTERNAME

$ca = Get-ChildItem $archivio | Where-Object { $_.Subject -eq $soggettoCA } |
      Sort-Object NotAfter -Descending | Select-Object -First 1

if ($ca -and $Forza) {
    Riga 'autorita' 'presente, ma -Forza: se ne fa una nuova' 'Yellow'
    $ca = $null
}

if (-not $ca) {
    if ($Rinnova) {
        Write-Host ''
        Write-Host '  -Rinnova, ma un''autorita'' Pathfinder qui non c''e''.' -ForegroundColor Red
        Write-Host '  Rilanciare senza -Rinnova: si crea da zero, e i terminali vanno rifidati.'
        Write-Host ''
        exit 1
    }
    $ca = New-SelfSignedCertificate `
        -Subject $soggettoCA `
        -KeyAlgorithm RSA -KeyLength 4096 -HashAlgorithm SHA256 `
        -KeyUsage CertSign, CRLSign, DigitalSignature `
        -KeyExportPolicy NonExportable `
        -NotAfter (Get-Date).AddYears(15) `
        -CertStoreLocation $archivio `
        -TextExtension @('2.5.29.19={text}CA=true&pathlength=0')
    Riga 'autorita' 'creata, valida 15 anni' 'Green'
} else {
    Riga 'autorita' "gia' presente, scade $($ca.NotAfter.ToString('dd/MM/yyyy'))"
}

# ── Il certificato del servizio, firmato dall'autorità ─────────────────────
$soggetto = 'CN=Pathfinder - ' + $env:COMPUTERNAME

Get-ChildItem $archivio | Where-Object { $_.Subject -eq $soggetto } | ForEach-Object {
    Remove-Item $_.PSPath -Force
}

$cert = New-SelfSignedCertificate `
    -Subject $soggetto `
    -Signer $ca `
    -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears($Anni) `
    -CertStoreLocation $archivio `
    -TextExtension @($san, '2.5.29.37={text}1.3.6.1.5.5.7.3.1')

Riga 'certificato' "creato, scade $($cert.NotAfter.ToString('dd/MM/yyyy'))" 'Green'

# ── I file ─────────────────────────────────────────────────────────────────
if (-not (Test-Path $Cartella)) { New-Item -ItemType Directory -Path $Cartella -Force | Out-Null }

# La cartella tiene una chiave privata: la leggono SYSTEM e gli
# amministratori, e nessun altro. È la stessa regola dei file del servizio.
$acl = Get-Acl $Cartella
$acl.SetAccessRuleProtection($true, $false)
$acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
foreach ($chi in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
        $chi, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
}
Set-Acl -Path $Cartella -AclObject $acl

$filePfx = Join-Path $Cartella 'pathfinder.pfx'
$fileCer = Join-Path $Cartella 'pathfinder-ca.cer'

# La password non si sceglie e non si ricorda: nasce a caso, finisce in una
# variabile di macchina che leggono SYSTEM e gli amministratori, ed è l'unica
# cosa che sta fra il PFX sul disco e chi lo copiasse via.
$byte = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($byte)
$password = -join ($byte | ForEach-Object { $_.ToString('x2') })
$sicura = ConvertTo-SecureString -String $password -Force -AsPlainText

Export-PfxCertificate -Cert $cert -FilePath $filePfx -Password $sicura | Out-Null
Export-Certificate -Cert $ca -FilePath $fileCer -Type CERT | Out-Null

Riga 'pfx' $filePfx
Riga 'da portare' $fileCer

# ── Le variabili che il servizio legge ─────────────────────────────────────
[Environment]::SetEnvironmentVariable('PATHFINDER_TLS_PFX', $filePfx, 'Machine')
[Environment]::SetEnvironmentVariable('PATHFINDER_TLS_PFX_PASSWORD', $password, 'Machine')
# Le due PEM non devono restare accese insieme al PFX: il servizio non
# sceglie fra due strade per la stessa cosa e si ferma.
[Environment]::SetEnvironmentVariable('PATHFINDER_TLS_CERT', $null, 'Machine')
[Environment]::SetEnvironmentVariable('PATHFINDER_TLS_KEY',  $null, 'Machine')

Riga 'variabili' 'PATHFINDER_TLS_PFX e la sua password, di macchina' 'Green'

$impronta = (Get-FileHash -Path $fileCer -Algorithm SHA256).Hash
Write-Host ''
Write-Host '  Impronta del file dell''autorita'' (SHA-256):' -ForegroundColor Cyan
Write-Host "  $impronta"

Write-Host ''
Write-Host '  ADESSO, IN QUEST''ORDINE:' -ForegroundColor Cyan
Write-Host ''
Write-Host '  1. Riavviare il servizio, perche'' le variabili si leggono all''avvio:'
Write-Host '       Stop-ScheduledTask  -TaskName ''Pathfinder - Servizio dati'''
Write-Host '       Start-ScheduledTask -TaskName ''Pathfinder - Servizio dati'''
Write-Host '     All''avvio deve dire «certificato» e non «ATTENZIONE».'
Write-Host ''
Write-Host '  2. Portare pathfinder-ca.cer su OGNI terminale e installarlo come'
Write-Host '     AUTORITA'' (non come certificato utente):'
Write-Host '       Android — Impostazioni > Sicurezza > Cifratura e credenziali >'
Write-Host '                 Installa un certificato > Certificato CA'
Write-Host '       Windows — doppio clic > Installa certificato > Computer locale >'
Write-Host '                 Autorita'' di certificazione radice attendibili'
Write-Host '       iPad    — si apre il file, poi Impostazioni > Profilo scaricato,'
Write-Host '                 e infine Generali > Info > Attendibilita'' certificati'
Write-Host '     Confrontare l''impronta qui sopra prima di fidarsi del file.'
Write-Host ''
Write-Host '  3. Sui terminali il collegamento resta lo stesso: chi apre http://'
Write-Host '     sulla stessa porta riceve un 301 verso https://.'
Write-Host ''
Write-Host '  Finche'' il punto 2 non e'' fatto il browser mostra l''avviso rosso e'
Write-Host '  il chiosco NON si installa: e'' il browser che rifiuta, non Pathfinder.'
Write-Host ''
