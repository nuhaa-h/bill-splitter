# Runs the reminder check and shows a Windows notification if there's
# anything to settle up soon. Meant to be triggered by Task Scheduler.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$output = & node "$scriptDir\check-settle-reminder.js" 2>&1
$lines = @($output | Where-Object { $_ -and $_.ToString().Trim() -ne "" })

if ($lines.Count -gt 0) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $balloon = New-Object System.Windows.Forms.NotifyIcon
    $balloon.Icon = [System.Drawing.SystemIcons]::Information
    $balloon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $balloon.BalloonTipTitle = "Bill Splitter — settle up soon"
    $balloon.BalloonTipText = ($lines -join "`n")
    $balloon.Visible = $true
    $balloon.ShowBalloonTip(10000)

    Start-Sleep -Seconds 12
    $balloon.Dispose()
}
