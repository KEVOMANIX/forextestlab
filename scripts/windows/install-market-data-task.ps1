param(
  [string]$TaskName = "ForexTestLab Market Data",
  [string]$SyncScript = (Join-Path $PSScriptRoot "sync-market-data.ps1"),
  [string]$DailyAt = "04:00"
)

$ErrorActionPreference = "Stop"
if (!(Test-Path -LiteralPath $SyncScript)) { throw "Sync script was not found: $SyncScript" }
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
  "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$SyncScript`""
)
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 6)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Description "Refreshes the current month of ForexTestLab market data and replaces it in Cloudflare R2." `
  -Force | Out-Null
Write-Output "Installed scheduled task: $TaskName (daily at $DailyAt local time)"
