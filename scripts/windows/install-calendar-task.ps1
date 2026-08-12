param(
  [string]$TaskName = "ForexTestLab Economic Calendar",
  [string]$SyncScript = (Join-Path $PSScriptRoot "sync-economic-calendar.ps1")
)

$ErrorActionPreference = "Stop"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
  "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$SyncScript`""
)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
  -RepetitionInterval (New-TimeSpan -Minutes 30)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Description "Exports MT5 economic data and uploads it to ForexTestLab." `
  -Force | Out-Null
Write-Output "Installed scheduled task: $TaskName"

