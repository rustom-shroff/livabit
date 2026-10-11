param([switch]$Refresh)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCtl = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\clawctl.exe'
if (-not (Test-Path -LiteralPath $taskCtl)) { throw 'The OpenClaw Windows Gateway package is required.' }
$taskOutput = Join-Path $taskRoot 'artifacts\openclaw\whatsapp-login'
$taskQrPath = Join-Path $taskOutput 'qr.png'
$taskStatePath = Join-Path $taskOutput 'state.json'
$taskUtf8 = New-Object Text.UTF8Encoding $false

# Configuration and login run inside the Windows package's managed guest.
# Capture all CLI output: its diagnostics can contain account identifiers.
function Invoke-Guest([string]$Script,[string]$Phase) {
    $taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script))
    $taskCommand = "& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$taskEncoded'))))"
    $taskPreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $taskRaw = & $taskCtl pwsh --command $taskCommand 2>&1
        $taskExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $taskPreviousPreference }
    if ($taskExitCode -ne 0) {
        New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
        [IO.File]::WriteAllText((Join-Path $taskOutput 'diagnostic.txt'),($taskRaw -join "`n"),$taskUtf8)
        throw "WhatsApp $Phase failed. A private diagnostic was saved in artifacts/openclaw/whatsapp-login/diagnostic.txt."
    }
    try { return (($taskRaw -join "`n") | ConvertFrom-Json) }
    catch { throw 'OpenClaw returned an unexpected setup response. Account details were not printed.' }
}

if (-not $Refresh) {
    $taskPreparation = @'
$ErrorActionPreference = 'Stop'
$taskConfigPath = Join-Path $env:USERPROFILE '.openclaw/openclaw.json'
$taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
if ($taskConfig.gateway.mode -ne 'local' -or $taskConfig.gateway.auth.mode -ne 'token' -or -not $taskConfig.gateway.auth.token) {
    throw 'Use an already configured local OpenClaw Gateway with token authentication.'
}
$taskPluginRaw = & openclaw plugins list --json 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the installed WhatsApp plugin.' }
$taskPlugins = ($taskPluginRaw -join "`n") | ConvertFrom-Json
$taskPlugin = @($taskPlugins.plugins | Where-Object { $_.id -eq 'whatsapp' })
if ($taskPlugin.Count -ne 1 -or ($taskPlugin[0].packageName -and $taskPlugin[0].packageName -ne '@openclaw/whatsapp') -or -not ($taskPlugin[0].trustedOfficialInstall -or $taskPlugin[0].origin -eq 'bundled')) {
    throw 'Install the official @openclaw/whatsapp plugin before preparing phone linking.'
}
$taskBackupRoot = Join-Path $env:USERPROFILE '.openclaw/liveabit-setup-backups'
New-Item -ItemType Directory -Force -Path $taskBackupRoot | Out-Null
$taskBackup = Join-Path $taskBackupRoot ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '-whatsapp.json')
Copy-Item -LiteralPath $taskConfigPath -Destination $taskBackup
if (-not $taskPlugin[0].enabled) {
    # The official plugin does not require a capability prompt. Existing allow
    # and deny policies are enforced by the supported enable command.
    $taskEnabled = & openclaw plugins enable whatsapp 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'The existing plugin policy prevented WhatsApp activation.' }
}
# Scope incoming-chat policy to the account we are linking. Other accounts,
# agents, webhook routes and channel settings retain their existing values.
$taskPatch = @{channels=@{whatsapp=@{accounts=@{default=@{enabled=$true;dmPolicy='disabled';groupPolicy='disabled';sendReadReceipts=$false}}}}}
$taskPatchText = $taskPatch | ConvertTo-Json -Depth 12 -Compress
$taskValidation = $taskPatchText | & openclaw config patch --stdin --dry-run --json 2>&1
if ($LASTEXITCODE -ne 0) { throw 'OpenClaw rejected the proposed WhatsApp preparation settings.' }
$taskApplied = $taskPatchText | & openclaw config patch --stdin 2>&1
if ($LASTEXITCODE -ne 0) { throw 'OpenClaw could not save the WhatsApp preparation settings.' }
@{configured=$true;account_id='default';incoming_chats_enabled=$false} | ConvertTo-Json -Compress
'@
    $taskPrepared = Invoke-Guest $taskPreparation 'configuration'
    if (-not $taskPrepared.configured) { throw 'WhatsApp preparation did not confirm its settings.' }
    $taskRestartRaw = & $taskCtl gateway-service restart --json 2>&1
    try { $taskGateway = ($taskRestartRaw -join "`n") | ConvertFrom-Json }
    catch { throw 'Settings saved; the managed Gateway restart returned an unexpected response.' }
    # The supervisor's startup deadline can precede OpenClaw readiness. Observe
    # the managed process instead of starting another Gateway.
    for ($taskAttempt = 0; $taskAttempt -lt 30 -and $taskGateway.gateway.state -ne 'running'; $taskAttempt++) {
        Start-Sleep -Seconds 5
        $taskStatusRaw = & $taskCtl gateway-service status --json 2>&1
        try { $taskGateway = ($taskStatusRaw -join "`n") | ConvertFrom-Json }
        catch { throw 'Could not read the managed Gateway state after restart.' }
    }
    if ($taskGateway.gateway.state -ne 'running') { throw 'Settings saved; the managed Gateway is not ready yet.' }
}

$taskLoginScript = @'
$ErrorActionPreference = 'Stop'
$taskConfigPath = Join-Path $env:USERPROFILE '.openclaw/openclaw.json'
$taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
$taskAccount = $taskConfig.channels.whatsapp.accounts.default
if ($taskAccount.dmPolicy -ne 'disabled' -or $taskAccount.groupPolicy -ne 'disabled') {
    throw 'Run preparation first so incoming chats remain disabled during phone linking.'
}
# The Store guest can use Windows PowerShell and an openclaw.cmd wrapper.
# Legacy native argument passing removes JSON's embedded quotes unless escaped.
$taskArgumentMode = (Get-Variable -Name PSNativeCommandArgumentPassing -ErrorAction SilentlyContinue).Value
$taskCliCommand = Get-Command openclaw -ErrorAction Stop
$taskLegacyJson = $PSVersionTable.PSVersion -lt [version]'7.3' -or $taskArgumentMode -eq 'Legacy' -or ($taskArgumentMode -ne 'Standard' -and $taskCliCommand.Source -match '\.(cmd|bat)$')
function ConvertTo-NativeJsonArgument([hashtable]$Value) {
    $taskJson = $Value | ConvertTo-Json -Compress
    if ($taskLegacyJson) { return $taskJson.Replace('"','\"') }
    return $taskJson
}
$taskLogin = $null
if ('__REFRESH__' -eq 'true') {
    # Complete an existing scan before asking for another QR. Gateway-owned
    # wait starts the channel when pairing succeeds; no phone message is sent.
    $taskWaitParams = ConvertTo-NativeJsonArgument @{channel='whatsapp';accountId='default';timeoutMs=25000}
    $taskWaitRaw = & openclaw gateway call web.login.wait --params $taskWaitParams --timeout 35000 --json 2>&1
    if ($LASTEXITCODE -ne 0) { $taskWaitRaw | Write-Output; throw 'OpenClaw could not check its managed WhatsApp login.' }
    $taskLogin = ($taskWaitRaw -join "`n") | ConvertFrom-Json
}
if ($taskLogin.connected -ne $true) {
    # Keep the existing link and any current QR. Never clear credentials.
    $taskParams = ConvertTo-NativeJsonArgument @{channel='whatsapp';accountId='default';force=$false;timeoutMs=30000}
    $taskLoginRaw = & openclaw gateway call web.login.start --params $taskParams --timeout 45000 --json 2>&1
    if ($LASTEXITCODE -ne 0) { $taskLoginRaw | Write-Output; throw 'OpenClaw could not start its managed WhatsApp login.' }
    $taskLogin = ($taskLoginRaw -join "`n") | ConvertFrom-Json
}
$taskStatusParams = ConvertTo-NativeJsonArgument @{channel='whatsapp';probe=$false}
$taskStatusRaw = & openclaw gateway call channels.status --params $taskStatusParams --timeout 15000 --json 2>&1
if ($LASTEXITCODE -ne 0) { $taskStatusRaw | Write-Output; throw 'Could not verify the WhatsApp account state.' }
$taskStatus = ($taskStatusRaw -join "`n") | ConvertFrom-Json
$taskSnapshot = @($taskStatus.channelAccounts.whatsapp | Where-Object { $_.accountId -eq 'default' }) | Select-Object -First 1
# Login's human-readable message can contain the phone number; do not return it.
@{connected=($taskLogin.connected -eq $true -or $taskSnapshot.connected -eq $true);linked=($taskSnapshot.linked -eq $true);qr_data_url=$taskLogin.qrDataUrl} | ConvertTo-Json -Compress
'@
$taskLoginScript = $taskLoginScript.Replace('__REFRESH__',$(if ($Refresh) {'true'} else {'false'}))
$taskLogin = Invoke-Guest $taskLoginScript 'login'
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskQrAvailable = -not [string]::IsNullOrWhiteSpace($taskLogin.qr_data_url)
if ($taskQrAvailable) {
    if ($taskLogin.qr_data_url -notmatch '^data:image/png;base64,([A-Za-z0-9+/=]+)$') { throw 'OpenClaw returned an unsupported QR image.' }
    $taskQrBytes = [Convert]::FromBase64String($Matches[1])
    if ($taskQrBytes.Length -lt 8 -or [BitConverter]::ToString($taskQrBytes,0,8) -ne '89-50-4E-47-0D-0A-1A-0A') { throw 'OpenClaw returned an invalid PNG image.' }
    [IO.File]::WriteAllBytes($taskQrPath,$taskQrBytes)
} elseif (Test-Path -LiteralPath $taskQrPath) {
    # Retire only this helper's stale QR image; never remove account credentials.
    Remove-Item -LiteralPath $taskQrPath
}
$taskState = [ordered]@{
    format='liveabit.openclaw.whatsapp-login.v1'
    account_id='default'
    status=$(if ($taskLogin.connected) {'connected'} elseif ($taskQrAvailable) {'awaiting_phone_scan'} elseif ($taskLogin.linked) {'linked'} else {'login_not_ready'})
    linked=[bool]$taskLogin.linked
    connected=[bool]$taskLogin.connected
    qr_available=$taskQrAvailable
    updated_at=[DateTime]::UtcNow.ToString('o')
    incoming_chats_enabled=$false
    messages_sent=0
}
[IO.File]::WriteAllText($taskStatePath,($taskState | ConvertTo-Json),$taskUtf8)
if ($taskState.status -eq 'login_not_ready') { throw 'WhatsApp login is not ready. Retry with -Refresh; the existing phone link will be retained.' }
[pscustomobject]@{status=$taskState.status;qr_file=$(if ($taskQrAvailable) {$taskQrPath} else {$null});state_file=$taskStatePath;incoming_chats_enabled=$false;messages_sent=0;refresh_command='.\scripts\prepare-openclaw-whatsapp.ps1 -Refresh'} | ConvertTo-Json
