param([switch]$LocalOnly, [ValidateRange(1024,65535)][int]$Port = 8765)
# Keep this launcher ASCII so Windows PowerShell 5.1 also reads it correctly.
$ErrorActionPreference = 'Stop'
$taskReceiverRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$taskReceiverNode = if ($taskNodeCommand) { $taskNodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $taskReceiverNode)) { throw 'Node.js was not found. Install Node.js or run this script from the project terminal.' }
$taskReceiverHost = if ($LocalOnly) { '127.0.0.1' } else { '0.0.0.0' }
Write-Output $(if ($LocalOnly) { 'Starting receiver for USB/emulator use only.' } else { 'Starting receiver for phone Wi-Fi connections on your local network.' })
Write-Output "Dashboard: http://127.0.0.1:$Port/ - press Ctrl+C in this window to stop."
& $taskReceiverNode (Join-Path $taskReceiverRoot 'tools\activity-receiver\server.mjs') --host $taskReceiverHost --port $Port
if ($LASTEXITCODE -ne 0) { throw 'Receiver stopped with an error. Check whether another receiver is already using this port.' }
