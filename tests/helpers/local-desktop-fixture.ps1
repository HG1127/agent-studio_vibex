param([Parameter(Mandatory=$true)][string]$FixtureDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FixtureWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
}
'@
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Agent Studio isolated desktop fixture'
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(180, 180)
$form.ClientSize = New-Object System.Drawing.Size(580, 280)
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Agent Studio desktop integration test'
$label.SetBounds(20, 20, 520, 30)
$inputBox = New-Object System.Windows.Forms.TextBox
$inputBox.AccessibleName = 'Fixture input'
$inputBox.SetBounds(20, 70, 500, 30)
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Verify input'
$button.SetBounds(20, 120, 180, 40)
$result = New-Object System.Windows.Forms.Label
$result.SetBounds(20, 180, 520, 40)
$button.Add_Click({
  $result.Text = 'Verified: ' + $inputBox.Text
  [IO.File]::WriteAllText((Join-Path $FixtureDirectory 'desktop-result.txt'), $inputBox.Text)
})
$form.Controls.AddRange(@($label, $inputBox, $button, $result))
$form.Add_Shown({
  [void][FixtureWindow]::ShowWindow($form.Handle, 5)
  [void][FixtureWindow]::SetForegroundWindow($form.Handle)
  $form.Activate()
  $origin = $form.PointToScreen((New-Object System.Drawing.Point(0,0)))
  $inputPoint = $inputBox.PointToScreen((New-Object System.Drawing.Point(80,12)))
  $buttonPoint = $button.PointToScreen((New-Object System.Drawing.Point(70,20)))
  @{ region=@($form.Bounds.Left,$form.Bounds.Top,$form.Bounds.Right,$form.Bounds.Bottom); input=@($inputPoint.X,$inputPoint.Y); button=@($buttonPoint.X,$buttonPoint.Y) } |
    ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $FixtureDirectory 'desktop-geometry.json') -Encoding UTF8
})
# The fixture owns only this window; a sentinel or timeout closes it cleanly.
$started = [DateTime]::UtcNow
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({ if ((Test-Path -LiteralPath (Join-Path $FixtureDirectory 'desktop-stop')) -or ([DateTime]::UtcNow-$started).TotalMinutes -gt 5) { $form.Close() } })
$timer.Start()
try { [void]$form.ShowDialog() } finally { $timer.Dispose(); $form.Dispose() }
