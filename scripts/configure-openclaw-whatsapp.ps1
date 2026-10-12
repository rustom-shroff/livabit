param(
    [ValidateRange(1,1440)][int]$CooldownMinutes = 60,
    [ValidateRange(0,23)][int]$QuietStartHour = 22,
    [ValidateRange(0,23)][int]$QuietEndHour = 8,
    [ValidateNotNullOrEmpty()][string]$TimeZone = 'America/Chicago',
    [switch]$SendTest
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCtl = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\clawctl.exe'
if (-not (Test-Path -LiteralPath $taskCtl)) { throw 'The OpenClaw Windows Gateway package is required.' }
try { $null = [TimeZoneInfo]::FindSystemTimeZoneById($TimeZone) }
catch {
    if ($TimeZone -ceq 'America/Chicago') {
        # Windows PowerShell 5 uses Windows time-zone IDs. Validate the default
        # through its equivalent while retaining the IANA ID in agent policy.
        $null = [TimeZoneInfo]::FindSystemTimeZoneById('Central Standard Time')
    } else { throw 'This PowerShell version does not recognize that time zone. Use PowerShell 7 for other valid IANA time-zone IDs.' }
}
$taskOutput = Join-Path $taskRoot 'artifacts\openclaw\whatsapp-delivery'
$taskUtf8 = New-Object Text.UTF8Encoding $false
$taskSettings = @{cooldown_minutes=$CooldownMinutes;quiet_start_hour=$QuietStartHour;quiet_end_hour=$QuietEndHour;time_zone=$TimeZone;send_test=[bool]$SendTest}
$taskSettingsEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($taskSettings | ConvertTo-Json -Compress)))
$taskSkillEncoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $taskRoot 'integrations\openclaw\skills\liveabit\SKILL.md')))

$taskGuest = @'
$ErrorActionPreference = 'Stop'
$taskUtf8 = New-Object Text.UTF8Encoding $false
$taskSettings = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__SETTINGS__')) | ConvertFrom-Json
$taskConfigPath = Join-Path $env:USERPROFILE '.openclaw/openclaw.json'
$taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
$taskWorkspace = $taskConfig.agents.entries.main.workspace
if (-not $taskWorkspace -or -not (Test-Path -LiteralPath $taskWorkspace)) { throw 'Configure the existing main agent before WhatsApp delivery.' }
$taskAgentsBefore = $taskConfig.agents | ConvertTo-Json -Depth 32 -Compress
$taskMapping = @($taskConfig.hooks.mappings | Where-Object { $_.id -eq 'liveabit-main' })
if ($taskMapping.Count -ne 1 -or $taskMapping[0].agentId -ne 'main' -or $taskMapping[0].deliver -ne $false) {
    throw 'Configure the main liveabit hook with automatic announcements disabled first.'
}
# Preserve PS5/.cmd JSON argument quoting used by the installed Store package.
$taskArgumentMode = (Get-Variable -Name PSNativeCommandArgumentPassing -ErrorAction SilentlyContinue).Value
$taskCliCommand = Get-Command openclaw -ErrorAction Stop
$taskLegacyJson = $PSVersionTable.PSVersion -lt [version]'7.3' -or $taskArgumentMode -eq 'Legacy' -or ($taskArgumentMode -ne 'Standard' -and $taskCliCommand.Source -match '\.(cmd|bat)$')
function ConvertTo-NativeJsonArgument([hashtable]$Value) {
    $taskJson = $Value | ConvertTo-Json -Depth 12 -Compress
    if ($taskLegacyJson) {
        # Compressed JSON has spaces only inside strings. Encode those spaces so
        # the PS5/.cmd wrapper cannot split the single --params argument; the
        # Gateway JSON parser restores the original message text.
        return $taskJson.Replace(' ','\u0020').Replace('"','\"')
    }
    return $taskJson
}
function Read-WhatsAppState {
    $taskParams = ConvertTo-NativeJsonArgument @{channel='whatsapp';probe=$false}
    $taskRaw = & openclaw gateway call channels.status --params $taskParams --timeout 15000 --json 2>&1
    if ($LASTEXITCODE -ne 0) { $taskRaw | Write-Output; throw 'Could not verify the managed WhatsApp connection.' }
    $taskStatus = ($taskRaw -join "`n") | ConvertFrom-Json
    return (@($taskStatus.channelAccounts.whatsapp | Where-Object { $_.accountId -eq 'default' }) | Select-Object -First 1)
}
$taskState = Read-WhatsAppState
if ($taskState.linked -ne $true -or $taskState.connected -ne $true) { throw 'Pair WhatsApp and wait for its connected state before configuring delivery.' }
# Query only the linked account's identity, never its contacts or groups.
$taskSelfRaw = & openclaw directory self --channel whatsapp --account default --json 2>&1
if ($LASTEXITCODE -ne 0) { $taskSelfRaw | Write-Output; throw 'Could not verify the linked account own identity.' }
$taskSelf = ($taskSelfRaw -join "`n") | ConvertFrom-Json
$taskOwnTarget = if ($taskSelf.raw.e164) { [string]$taskSelf.raw.e164 } else { [string]$taskSelf.id }
if ($taskSelf.kind -ne 'user' -or $taskOwnTarget -notmatch '^\+[1-9][0-9]{7,14}$') { throw 'The linked account did not expose a usable own phone identity.' }
$taskBackupRoot = Join-Path $env:USERPROFILE '.openclaw/liveabit-setup-backups'
New-Item -ItemType Directory -Force -Path $taskBackupRoot | Out-Null
Copy-Item -LiteralPath $taskConfigPath -Destination (Join-Path $taskBackupRoot ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '-whatsapp-delivery.json'))
# Account settings inherit the channel list when no account override exists.
# Keep existing entries; the private liveabit policy still fixes only self.
$taskAccount = $taskConfig.channels.whatsapp.accounts.default
$taskExistingAllowFrom = if ($null -ne $taskAccount.allowFrom) { @($taskAccount.allowFrom) } else { @($taskConfig.channels.whatsapp.allowFrom) }
$taskAllowFrom = @(@($taskExistingAllowFrom) + @($taskOwnTarget) | Where-Object { $_ } | Select-Object -Unique)
$taskPatch = @{channels=@{whatsapp=@{accounts=@{default=@{enabled=$true;dmPolicy='disabled';groupPolicy='disabled';sendReadReceipts=$false;allowFrom=$taskAllowFrom}}}}}
$taskPatchText = $taskPatch | ConvertTo-Json -Depth 12 -Compress
$taskValidation = $taskPatchText | & openclaw config patch --stdin --dry-run --json 2>&1
if ($LASTEXITCODE -ne 0) { $taskValidation | Write-Output; throw 'OpenClaw rejected the WhatsApp delivery settings.' }
$taskApplied = $taskPatchText | & openclaw config patch --stdin 2>&1
if ($LASTEXITCODE -ne 0) { $taskApplied | Write-Output; throw 'OpenClaw could not save WhatsApp delivery settings.' }
$taskAfter = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
if (($taskAfter.agents | ConvertTo-Json -Depth 32 -Compress) -ne $taskAgentsBefore) { throw 'Agent settings changed during setup; review the private backup before continuing.' }
$taskSkillRoot = Join-Path $taskWorkspace 'skills/liveabit'
$taskReferences = Join-Path $taskSkillRoot 'references'
New-Item -ItemType Directory -Force -Path $taskReferences | Out-Null
[IO.File]::WriteAllBytes((Join-Path $taskSkillRoot 'SKILL.md'),[Convert]::FromBase64String('__SKILL__'))
$taskPolicyPath = Join-Path $taskReferences 'delivery.json'
$taskPolicy = [ordered]@{
    format='liveabit.openclaw.delivery.v1';enabled=$true;agent_id='main';channel='whatsapp';account_id='default';target=$taskOwnTarget
    identity_source='whatsapp.directory.self';cooldown_minutes=$taskSettings.cooldown_minutes
    quiet_hours=@{enabled=($taskSettings.quiet_start_hour -ne $taskSettings.quiet_end_hour);start_hour=$taskSettings.quiet_start_hour;end_hour=$taskSettings.quiet_end_hour;time_zone=$taskSettings.time_zone}
    state_file='delivery-state.json';enforcement='agent-policy-best-effort';updated_at=[DateTime]::UtcNow.ToString('o')
}
if (Test-Path -LiteralPath $taskPolicyPath) { Copy-Item -LiteralPath $taskPolicyPath -Destination (Join-Path $taskBackupRoot ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '-delivery-policy.json')) }
[IO.File]::WriteAllText($taskPolicyPath,($taskPolicy | ConvertTo-Json -Depth 8),$taskUtf8)
$taskDeliveryStatePath = Join-Path $taskReferences 'delivery-state.json'
if (-not (Test-Path -LiteralPath $taskDeliveryStatePath)) {
    $taskDeliveryState = @{format='liveabit.openclaw.delivery-state.v1';last_sent_at=$null;last_sent_event_id=$null;processed_event_ids=@()}
    [IO.File]::WriteAllText($taskDeliveryStatePath,($taskDeliveryState | ConvertTo-Json),$taskUtf8)
}
$taskMessageId = $null
if ($taskSettings.send_test) {
    # A requested one-off connection check is separate from coaching policy.
    # Configuration reload may reconnect the channel. Never retry an actual send.
    for ($taskAttempt = 0; $taskAttempt -lt 10; $taskAttempt++) {
        $taskState = Read-WhatsAppState
        if ($taskState.connected -eq $true) { break }
        Start-Sleep -Seconds 2
    }
    if ($taskState.connected -ne $true) { throw 'Delivery is configured, but WhatsApp is reconnecting. Retry the connection check once it is connected.' }
    # The Gateway send contract accepts an explicit owner. The message CLI does
    # not accept --agent and can otherwise require a global System Agent change.
    $taskSendParams = ConvertTo-NativeJsonArgument @{agentId='main';channel='whatsapp';accountId='default';to=$taskOwnTarget;message='liveabit connection check: OpenClaw can send to your own WhatsApp chat. Activity nudges will use your existing goals and notification preferences.';idempotencyKey=('liveabit-whatsapp-check:' + [Guid]::NewGuid().ToString())}
    $taskSendRaw = & openclaw gateway call send --params $taskSendParams --timeout 45000 --json 2>&1
    if ($LASTEXITCODE -ne 0) { $taskSendRaw | Write-Output; throw 'WhatsApp did not confirm the connection-check send. Do not assume it arrived.' }
    $taskSent = ($taskSendRaw -join "`n") | ConvertFrom-Json
    $taskMessageId = [string]$taskSent.messageId
    if ($taskSent.ok -eq $false -or $taskSent.dryRun -eq $true -or [string]::IsNullOrWhiteSpace($taskMessageId) -or $taskMessageId -match '[\x00-\x1f\x7f]' -or $taskMessageId.Length -gt 256) { throw 'WhatsApp did not return a usable provider message ID.' }
}
# Never return phone identity, raw account state, credentials or provider payload.
@{configured=$true;agent_id='main';account_id='default';target_verified_self=$true;target_printed=$false;incoming_chats_enabled=$false;existing_allowlist_entries_preserved=$true;model_settings_unchanged=$true;policy_file=$taskPolicyPath;cooldown_minutes=$taskSettings.cooldown_minutes;quiet_hours=$taskPolicy.quiet_hours;messages_sent=$(if ($taskMessageId) {1} else {0});provider_message_id=$taskMessageId;phone_receipt_confirmed=$false} | ConvertTo-Json -Depth 8 -Compress
'@
$taskGuest = $taskGuest.Replace('__SETTINGS__',$taskSettingsEncoded).Replace('__SKILL__',$taskSkillEncoded)
$taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskGuest))
$taskCommand = "& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$taskEncoded'))))"
$taskPreviousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $taskRaw = & $taskCtl pwsh --command $taskCommand 2>&1
    $taskExitCode = $LASTEXITCODE
} finally { $ErrorActionPreference = $taskPreviousPreference }
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
if ($taskExitCode -ne 0) {
    [IO.File]::WriteAllText((Join-Path $taskOutput 'diagnostic.txt'),($taskRaw -join "`n"),$taskUtf8)
    throw 'WhatsApp delivery setup failed. Account details were kept in artifacts/openclaw/whatsapp-delivery/diagnostic.txt.'
}
try { $taskResult = ($taskRaw -join "`n") | ConvertFrom-Json }
catch { throw 'OpenClaw returned an unexpected delivery response. Account details were not printed.' }
[IO.File]::WriteAllText((Join-Path $taskOutput 'state.json'),($taskResult | ConvertTo-Json -Depth 8),$taskUtf8)
$taskResult | ConvertTo-Json -Depth 8
