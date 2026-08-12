param(
  [string]$TaskName = "ForexTestLab Economic Calendar",
  [string]$SyncScript = (Join-Path $PSScriptRoot "sync-economic-calendar.ps1"),
  [string]$DailyAt = "11:00"
)

$ErrorActionPreference = "Stop"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
  "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$SyncScript`""
)
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Description "Exports MT5 economic data once daily and uploads it to ForexTestLab." `
  -Force | Out-Null
Write-Output "Installed scheduled task: $TaskName (daily at $DailyAt local time)"
