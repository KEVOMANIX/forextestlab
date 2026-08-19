param(
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"

$pipelineRoot = "E:\desktop\dukascopy-market-data"
$python = Join-Path $pipelineRoot ".validation-venv-py310\Scripts\python.exe"
$appEnvironment = "E:\desktop\forextestlab\.env"
$outputLog = Join-Path $pipelineRoot "logs\cross-download.out.log"
$errorLog = Join-Path $pipelineRoot "logs\cross-download.err.log"

if (-not (Test-Path -LiteralPath $python)) {
  throw "The dedicated market-data Python environment was not found at $python"
}
if (-not (Test-Path -LiteralPath $appEnvironment)) {
  throw "The ForexTestLab environment file was not found at $appEnvironment"
}

# Load only R2 variables. Values are never written to output or passed on the
# command line, keeping credentials out of process listings and logs.
foreach ($line in Get-Content -LiteralPath $appEnvironment) {
  if ($line -notmatch '^\s*(R2_[A-Za-z0-9_]+)\s*=\s*(.*)\s*$') { continue }
  $name = $matches[1]
  $value = $matches[2].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  Set-Item -Path "Env:$name" -Value $value
}

$hasEndpoint = $env:R2_ENDPOINT -or $env:R2_ENDPOINT_URL -or $env:R2_ACCOUNT_ID
$hasBucket = $env:R2_BUCKET_NAME -or $env:R2_BUCKET
if (-not $hasEndpoint -or -not $hasBucket -or -not $env:R2_ACCESS_KEY_ID -or -not $env:R2_SECRET_ACCESS_KEY) {
  throw "The R2 environment is incomplete. Required values were not printed."
}

$existing = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^python(?:\.exe)?$' -and
  $_.CommandLine -like '*dukascopy-market-data*main.py*'
}
if ($existing) {
  Write-Host "The dedicated market-data downloader is already running (PID $($existing.ProcessId -join ', '))."
  exit 0
}

$arguments = @("main.py", "--workers", "1", "--upload")
if ($Foreground) {
  Push-Location $pipelineRoot
  try { & $python @arguments; exit $LASTEXITCODE } finally { Pop-Location }
}

$process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $pipelineRoot -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -WindowStyle Hidden -PassThru
Write-Host "Started the dedicated resumable market-data downloader (PID $($process.Id))."
Write-Host "Progress: $outputLog"
