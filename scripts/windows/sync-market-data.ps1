param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")),
  [string]$DownloaderRoot = "E:\desktop\dukascopy-market-data",
  [string[]]$Symbols = @()
)

$ErrorActionPreference = "Stop"
$python = Join-Path $DownloaderRoot ".validation-venv-py310\Scripts\python.exe"
$entryPoint = Join-Path $DownloaderRoot "main.py"
$environmentFile = Join-Path $ProjectRoot ".env"
$runLog = Join-Path $DownloaderRoot "logs\daily-refresh.log"

foreach ($path in @($python, $entryPoint, $environmentFile)) {
  if (!(Test-Path -LiteralPath $path)) { throw "Required market-data path was not found: $path" }
}

# Load values into this process without printing secrets. Values already present
# in the process take precedence over the file.
foreach ($line in Get-Content -LiteralPath $environmentFile) {
  $trimmed = $line.Trim()
  if (!$trimmed -or $trimmed.StartsWith("#") -or !$trimmed.Contains("=")) { continue }
  $name, $value = $trimmed.Split("=", 2)
  $name = $name.Trim()
  if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }
  if ([Environment]::GetEnvironmentVariable($name, "Process")) { continue }
  $value = $value.Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

New-Item -ItemType Directory -Path (Split-Path -Parent $runLog) -Force | Out-Null
$started = Get-Date -Format o
"[$started] Starting current-month market-data refresh." | Add-Content -LiteralPath $runLog
Push-Location $DownloaderRoot
try {
  $arguments = @($entryPoint, "--refresh-current", "--workers", "1", "--upload")
  foreach ($symbol in $Symbols) { $arguments += @("--symbol", $symbol) }
  & $python @arguments 2>&1 | Out-File -LiteralPath $runLog -Append -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw "Market-data downloader exited with code $LASTEXITCODE. See $runLog" }
} finally {
  Pop-Location
}
"[$(Get-Date -Format o)] Market-data refresh completed." | Add-Content -LiteralPath $runLog
