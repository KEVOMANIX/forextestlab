param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")),
  [string]$TerminalPath = "C:\Program Files\FBS MetaTrader 5\terminal64.exe",
  [string]$SshKey = "E:\Downloads\LightsailDefaultKey-us-west-2.pem",
  [string]$RemoteHost = "ubuntu@52.34.239.239"
)

$ErrorActionPreference = "Stop"
$terminalDirectory = Split-Path -Parent $TerminalPath
$metaEditor = Join-Path $terminalDirectory "metaeditor64.exe"
if (!(Test-Path -LiteralPath $TerminalPath) -or !(Test-Path -LiteralPath $metaEditor)) {
  throw "MT5 terminal or MetaEditor was not found in $terminalDirectory"
}
if (!(Test-Path -LiteralPath $SshKey)) {
  throw "Lightsail SSH key was not found at $SshKey"
}

$terminalRoot = Join-Path $env:APPDATA "MetaQuotes\Terminal"
$dataDirectory = Get-ChildItem -LiteralPath $terminalRoot -Directory | Where-Object {
  $origin = Join-Path $_.FullName "origin.txt"
  (Test-Path -LiteralPath $origin) -and
    ((Get-Content -LiteralPath $origin -Raw).TrimEnd('\') -ieq $terminalDirectory.TrimEnd('\'))
} | Select-Object -First 1 -ExpandProperty FullName
if (!$dataDirectory) {
  throw "Could not match $TerminalPath to an MT5 data directory. Start the terminal once and retry."
}

$source = Join-Path $ProjectRoot "scripts\mt5\ExportEconomicCalendar.mq5"
$scriptDirectory = Join-Path $dataDirectory "MQL5\Scripts"
$compiledSource = Join-Path $scriptDirectory "ExportEconomicCalendar.mq5"
$compiledProgram = Join-Path $scriptDirectory "ExportEconomicCalendar.ex5"
Copy-Item -LiteralPath $source -Destination $compiledSource -Force

$compileLog = Join-Path $env:TEMP "forextestlab-mt5-compile.log"
$compiler = Start-Process -FilePath $metaEditor -ArgumentList @(
  "/compile:`"$compiledSource`"",
  "/log:`"$compileLog`""
) -PassThru -Wait
$details = if (Test-Path -LiteralPath $compileLog) { Get-Content -LiteralPath $compileLog -Raw } else { "No compiler log." }
# MetaEditor can return a non-zero process exit code after a successful command-line
# compilation. Its compiler result and emitted EX5 are the authoritative signals.
if (!(Test-Path -LiteralPath $compiledProgram) -or $details -notmatch "Result:\s+0 errors") {
  throw "MT5 calendar exporter compilation failed.`n$details"
}

$config = Join-Path $env:TEMP "forextestlab-calendar.ini"
@"
[Experts]
AllowLiveTrading=0
AllowDllImport=0
Enabled=1

[StartUp]
Symbol=EURUSD
Period=M15
Script=ExportEconomicCalendar
ShutdownTerminal=1
"@ | Set-Content -LiteralPath $config -Encoding ASCII

if (Get-Process terminal64 -ErrorAction SilentlyContinue) {
  throw "Close all MT5 terminal windows before the scheduled calendar refresh runs."
}
$terminal = Start-Process -FilePath $TerminalPath -ArgumentList "/config:$config" -PassThru
try {
  $terminal | Wait-Process -Timeout 900 -ErrorAction Stop
} catch {
  if (!$terminal.HasExited) { Stop-Process -Id $terminal.Id -Force }
  throw "MT5 calendar export exceeded 15 minutes."
}

$calendarFile = Join-Path $terminalRoot "Common\Files\forextestlab-calendar.csv"
if (!(Test-Path -LiteralPath $calendarFile)) {
  throw "MT5 finished without creating $calendarFile"
}
if ((Get-Item -LiteralPath $calendarFile).Length -lt 512) {
  throw "MT5 produced an unexpectedly small calendar export."
}

$sshOptions = @(
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ConnectTimeout=15",
  "-i", $SshKey
)
& scp -q @sshOptions $calendarFile "${RemoteHost}:/home/ubuntu/forextestlab/data/forextestlab-calendar.csv.incoming"
if ($LASTEXITCODE -ne 0) { throw "Calendar upload failed." }

Write-Output "Economic calendar exported and uploaded successfully."
