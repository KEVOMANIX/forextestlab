param(
  [Parameter(Mandatory = $true)][string]$Destination,
  [string[]]$Symbols = @('EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'),
  [int]$DelayMilliseconds = 1200
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $root -Force | Out-Null
$manifestPath = Join-Path $root 'downloads.csv'

function Test-HistDataZip([string]$ArchivePath, [string]$Symbol) {
  if (-not (Test-Path -LiteralPath $ArchivePath)) { return $false }
  try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
      return @($archive.Entries | Where-Object { $_.FullName -match "^DAT_ASCII_${Symbol}_M1_\d{4,6}\.csv$" -and $_.Length -gt 0 }).Count -eq 1
    } finally { $archive.Dispose() }
  } catch { return $false }
}

foreach ($symbol in $Symbols) {
  $symbol = $symbol.ToUpperInvariant()
  if ($symbol -notmatch '^[A-Z]{6}$') { throw "Invalid symbol: $symbol" }
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $catalogUrl = "https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/$symbol"
  $catalog = Invoke-WebRequest -Uri $catalogUrl -WebSession $session -UseBasicParsing
  $pathPattern = '/download-free-forex-historical-data/\?/ascii/1-minute-bar-quotes/' + $symbol.ToLowerInvariant() + '/\d{4}(?:/\d{1,2})?'
  $paths = @([regex]::Matches($catalog.Content, $pathPattern, 'IgnoreCase') | ForEach-Object Value | Sort-Object -Unique)
  if ($paths.Count -eq 0) { throw "No archive dates found for $symbol" }
  $folder = Join-Path $root $symbol
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  Write-Host "$symbol : $($paths.Count) archives listed"

  foreach ($relativePath in $paths) {
    $pageUrl = "https://www.histdata.com$relativePath"
    $archivePage = Invoke-WebRequest -Uri $pageUrl -WebSession $session -UseBasicParsing
    $form = [regex]::Match($archivePage.Content, '<form id="file_down"[\s\S]*?</form>').Value
    if (-not $form) { throw "Download form missing: $pageUrl" }
    $fields = @{}
    foreach ($match in [regex]::Matches($form, '<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"')) {
      $fields[$match.Groups[1].Value] = $match.Groups[2].Value
    }
    if ($fields.fxpair -ne $symbol -or $fields.platform -ne 'ASCII' -or $fields.timeframe -ne 'M1') {
      throw "Unexpected download form: $pageUrl"
    }
    $archiveName = "HISTDATA_COM_ASCII_${symbol}_M1_$($fields.datemonth).zip"
    if ($archiveName -notmatch "^HISTDATA_COM_ASCII_${symbol}_M1_\d{4,6}\.zip$") { throw "Unexpected filename: $archiveName" }
    if (-not $fields.tk) { Write-Host "  unavailable $archiveName (HistData supplied no download token)"; continue }
    $target = Join-Path $folder $archiveName
    if (Test-HistDataZip $target $symbol) { Write-Host "  skip $archiveName"; continue }
    $tempPath = "$target.partial"
    $downloaded = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        $response = Invoke-WebRequest -Uri 'https://www.histdata.com/get.php' -Method Post -Body $fields -WebSession $session -Headers @{ Referer = $pageUrl } -OutFile $tempPath -PassThru -UseBasicParsing -TimeoutSec 120
        if ($response.StatusCode -ne 200 -or -not (Test-HistDataZip $tempPath $symbol)) { throw "Invalid ZIP response for $archiveName" }
        Move-Item -LiteralPath $tempPath -Destination $target -Force
        $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
        [pscustomobject]@{ Symbol = $symbol; Archive = $archiveName; Bytes = (Get-Item -LiteralPath $target).Length; SHA256 = $hash; SourcePage = $pageUrl } |
          Export-Csv -LiteralPath $manifestPath -Append -NoTypeInformation
        Write-Host "  saved $archiveName"
        $downloaded = $true
        break
      } catch {
        if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath -Force }
        if ($attempt -eq 3) { throw }
        Start-Sleep -Seconds (2 * $attempt)
      }
    }
    if (-not $downloaded) { throw "Could not download $archiveName" }
    Start-Sleep -Milliseconds $DelayMilliseconds
  }
}
