param(
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string]$NodeId,
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
    if ($TimeZone -ceq 'America/Chicago') { $null = [TimeZoneInfo]::FindSystemTimeZoneById('Central Standard Time') }
    else { throw 'This PowerShell version does not recognize that time zone. Use PowerShell 7 for other valid IANA time-zone IDs.' }
}
$taskOutput = Join-Path $taskRoot 'artifacts\openclaw\companion-delivery'
$taskUtf8 = New-Object Text.UTF8Encoding $false
$taskSettings = @{
    node_id=$NodeId;cooldown_minutes=$CooldownMinutes;quiet_start_hour=$QuietStartHour
    quiet_end_hour=$QuietEndHour;time_zone=$TimeZone;send_test=[bool]$SendTest
    preference_parameters=@($PSBoundParameters.Keys | Where-Object { $_ -in @('CooldownMinutes','QuietStartHour','QuietEndHour','TimeZone') })
}
$taskSettingsEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($taskSettings | ConvertTo-Json -Compress)))
$taskGuest = @'
$ErrorActionPreference = 'Stop'
$taskUtf8 = New-Object Text.UTF8Encoding $false
$taskSettings = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__SETTINGS__')) | ConvertFrom-Json
$taskConfigPath = Join-Path $env:USERPROFILE '.openclaw/openclaw.json'
$taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
$taskAgentsBefore = $taskConfig.agents | ConvertTo-Json -Depth 32 -Compress
$taskAgent = $taskConfig.agents.entries.liveabit
if (-not $taskAgent.workspace -or -not (Test-Path -LiteralPath $taskAgent.workspace)) { throw 'Configure the dedicated liveabit agent before companion delivery.' }
$taskMapping = @($taskConfig.hooks.mappings | Where-Object { $_.id -eq 'liveabit-tasks' })
if ($taskMapping.Count -ne 1 -or $taskMapping[0].agentId -ne 'liveabit' -or $taskMapping[0].deliver -ne $false -or $taskMapping[0].action -ne 'agent' -or $taskMapping[0].match.path -ne 'liveabit') {
    throw 'Configure the liveabit hook with automatic announcements disabled first.'
}
$taskReferences = Join-Path $taskAgent.workspace 'skills/liveabit/references'
$taskPolicyPath = Join-Path $taskReferences 'delivery.json'
$taskStatePath = Join-Path $taskReferences 'delivery-state.json'
function Assert-CompanionPolicy($value) {
    if ($value.format -ne 'liveabit.openclaw.companion-delivery.v1' -or $value.enabled -isnot [bool] -or
        $value.agent_id -ne 'liveabit' -or $value.channel -ne 'companion' -or
        $value.identity_source -ne 'openclaw.nodes.status' -or $value.node_id -isnot [string] -or
        $value.node_id -notmatch '^[a-fA-F0-9]{64}$' -or $value.command -ne 'system.notify') {
        throw 'The existing companion delivery policy needs review; it was retained.'
    }
}
$taskExistingPolicy = $null
if (Test-Path -LiteralPath $taskPolicyPath) {
    $taskExistingPolicy = Get-Content -LiteralPath $taskPolicyPath -Raw | ConvertFrom-Json
    if ($taskExistingPolicy.format -eq 'liveabit.openclaw.companion-delivery.v1') {
        Assert-CompanionPolicy $taskExistingPolicy
        # Preference changes and checks keep the saved destination. Only an
        # explicit -NodeId authorizes switching to another paired device.
        if (-not $taskSettings.node_id) { $taskSettings.node_id = $taskExistingPolicy.node_id }
    }
}
function ConvertFrom-CliJson($raw) {
    $taskText = $raw -join "`n"
    try { return ($taskText | ConvertFrom-Json -ErrorAction Stop) } catch { }
    # Bundled plugins can write a log prefix before the CLI's final JSON object.
    # Never echo that prefix, device identities or the provider response.
    $taskLines = @($taskText -split "`n")
    for ($taskLineIndex=0; $taskLineIndex -lt $taskLines.Count; $taskLineIndex++) {
        if ($taskLines[$taskLineIndex] -match '^\s*[\{\[]') {
            try { return (($taskLines[$taskLineIndex..($taskLines.Count-1)] -join "`n") | ConvertFrom-Json -ErrorAction Stop) } catch { }
        }
    }
    throw 'OpenClaw returned an unexpected companion response; no device details were printed.'
}
$taskNodesRaw = @(& openclaw nodes status --json 2>&1)
if ($LASTEXITCODE -ne 0) { throw 'Could not verify paired companion devices. Connect the Android companion to the existing gateway first.' }
$taskNodeStatus = ConvertFrom-CliJson $taskNodesRaw
$taskEligibleNodes = @($taskNodeStatus.nodes | Where-Object {
    $_.nodeId -is [string] -and $_.nodeId -match '^[a-fA-F0-9]{64}$' -and $_.platform -eq 'android' -and
    $_.paired -eq $true -and $_.connected -eq $true -and
    @($_.commands) -contains 'system.notify' -and $_.permissions.notifications -eq $true
})
if ($taskSettings.node_id) {
    $taskSelectedNodes = @($taskEligibleNodes | Where-Object { $_.nodeId -eq $taskSettings.node_id })
    if ($taskSelectedNodes.Count -ne 1) { throw 'The selected Android companion is not paired, connected and allowed to show system notifications.' }
} else {
    if ($taskEligibleNodes.Count -eq 0) { throw 'No paired, connected Android companion can show notifications. Enable notifications and connect it to the gateway first.' }
    if ($taskEligibleNodes.Count -gt 1) { throw 'More than one Android companion is eligible. Rerun with -NodeId using the intended device ID from OpenClaw nodes status.' }
    $taskSelectedNodes = $taskEligibleNodes
}
$taskNode = $taskSelectedNodes[0]
$taskPolicy = [ordered]@{
    format='liveabit.openclaw.companion-delivery.v1';enabled=$true;agent_id='liveabit';channel='companion'
    identity_source='openclaw.nodes.status';node_id=$taskNode.nodeId;command='system.notify'
    cooldown_minutes=$taskSettings.cooldown_minutes;quiet_start_hour=$taskSettings.quiet_start_hour
    quiet_end_hour=$taskSettings.quiet_end_hour;time_zone=$taskSettings.time_zone
}
function Assert-LegacyPolicy($value, [string]$agentId) {
    if ($value.format -ne 'liveabit.openclaw.delivery.v1' -or $value.enabled -isnot [bool] -or
        $value.agent_id -ne $agentId -or $value.channel -ne 'whatsapp' -or $value.account_id -ne 'default' -or
        $value.identity_source -ne 'whatsapp.directory.self' -or $value.target -notmatch '^\+[1-9][0-9]{7,14}$') {
        throw 'The existing liveabit WhatsApp policy is not a recognized owned policy; it was retained.'
    }
}
$taskLegacyMigrated = $false
if ($null -ne $taskExistingPolicy) {
    if ($taskExistingPolicy.format -eq 'liveabit.openclaw.delivery.v1') {
        Assert-LegacyPolicy $taskExistingPolicy 'liveabit'
        $taskLegacyMigrated = $true
        $taskPolicy.quiet_start_hour = $taskExistingPolicy.quiet_hours.start_hour
        $taskPolicy.quiet_end_hour = $taskExistingPolicy.quiet_hours.end_hour
        $taskPolicy.time_zone = $taskExistingPolicy.quiet_hours.time_zone
        if ($taskExistingPolicy.quiet_hours.enabled -eq $false) { $taskPolicy.quiet_end_hour = $taskPolicy.quiet_start_hour }
    } else {
        Assert-CompanionPolicy $taskExistingPolicy
        $taskPolicy.quiet_start_hour = $taskExistingPolicy.quiet_start_hour
        $taskPolicy.quiet_end_hour = $taskExistingPolicy.quiet_end_hour
        $taskPolicy.time_zone = $taskExistingPolicy.time_zone
    }
    $taskPolicy.enabled = $taskExistingPolicy.enabled
    $taskPolicy.cooldown_minutes = $taskExistingPolicy.cooldown_minutes
}
foreach ($taskPreference in @('CooldownMinutes','QuietStartHour','QuietEndHour','TimeZone')) {
    if ($taskSettings.preference_parameters -contains $taskPreference) {
        switch ($taskPreference) {
            'CooldownMinutes' { $taskPolicy.cooldown_minutes = $taskSettings.cooldown_minutes }
            'QuietStartHour' { $taskPolicy.quiet_start_hour = $taskSettings.quiet_start_hour }
            'QuietEndHour' { $taskPolicy.quiet_end_hour = $taskSettings.quiet_end_hour }
            'TimeZone' { $taskPolicy.time_zone = $taskSettings.time_zone }
        }
    }
}
function Test-Integer($value) { return ($value -is [int] -or $value -is [long]) }
if (-not (Test-Integer $taskPolicy.cooldown_minutes) -or $taskPolicy.cooldown_minutes -lt 1 -or $taskPolicy.cooldown_minutes -gt 1440 -or
    -not (Test-Integer $taskPolicy.quiet_start_hour) -or $taskPolicy.quiet_start_hour -lt 0 -or $taskPolicy.quiet_start_hour -gt 23 -or
    -not (Test-Integer $taskPolicy.quiet_end_hour) -or $taskPolicy.quiet_end_hour -lt 0 -or $taskPolicy.quiet_end_hour -gt 23 -or
    [string]::IsNullOrWhiteSpace($taskPolicy.time_zone)) { throw 'Existing notification timing preferences need review; delivery policies were retained.' }
try { $null = [TimeZoneInfo]::FindSystemTimeZoneById($taskPolicy.time_zone) }
catch {
    if ($taskPolicy.time_zone -ceq 'America/Chicago') {
        # The Windows Gateway's guest can use Windows PowerShell 5 even when
        # the caller uses PowerShell 7. Validate its Windows equivalent without
        # changing the IANA timezone retained for the agent's private policy.
        $null = [TimeZoneInfo]::FindSystemTimeZoneById('Central Standard Time')
    } else { throw 'The configured quiet-hours timezone is not recognized by the managed OpenClaw runtime; delivery policies were retained.' }
}
$taskStateBytes = $null
if (Test-Path -LiteralPath $taskStatePath) {
    $taskStateBytes = [IO.File]::ReadAllBytes($taskStatePath)
    $taskState = Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json
    if ($taskState.format -ne 'liveabit.openclaw.delivery-state.v1' -or
        $taskState.processed_event_ids -isnot [array] -or @($taskState.processed_event_ids).Count -gt 128 -or
        @($taskState.processed_event_ids | Where-Object { $_ -isnot [string] -or [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
        throw 'The existing notification state needs review; it was retained rather than reset.'
    }
}
$taskMainPolicyPath = $null
$taskMainPolicy = $null
if ($taskConfig.agents.entries.main.workspace) {
    $taskMainPolicyPath = Join-Path $taskConfig.agents.entries.main.workspace 'skills/liveabit/references/delivery.json'
    if (Test-Path -LiteralPath $taskMainPolicyPath) {
        $taskMainPolicy = Get-Content -LiteralPath $taskMainPolicyPath -Raw | ConvertFrom-Json
        Assert-LegacyPolicy $taskMainPolicy 'main'
    }
}
$taskBackupRoot = Join-Path $env:USERPROFILE '.openclaw/liveabit-setup-backups'
New-Item -ItemType Directory -Force -Path $taskBackupRoot | Out-Null
$taskStamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')
foreach ($taskOwnedFile in @(
    @{path=$taskPolicyPath;name='liveabit-delivery.json'},
    @{path=$taskStatePath;name='liveabit-delivery-state.json'},
    @{path=$taskMainPolicyPath;name='main-delivery.json'}
)) {
    if ($taskOwnedFile.path -and (Test-Path -LiteralPath $taskOwnedFile.path)) {
        Copy-Item -LiteralPath $taskOwnedFile.path -Destination (Join-Path $taskBackupRoot ($taskStamp+'-companion-'+$taskOwnedFile.name))
    }
}
# Disable the old owned destinations before activating the new destination.
# This leaves the user's global WhatsApp account and credentials untouched.
if ($taskMainPolicy) {
    $taskMainPolicy.enabled = $false
    [IO.File]::WriteAllText($taskMainPolicyPath,($taskMainPolicy | ConvertTo-Json -Depth 16),$taskUtf8)
}
if ($taskLegacyMigrated) {
    $taskExistingPolicy.enabled = $false
    [IO.File]::WriteAllText($taskPolicyPath,($taskExistingPolicy | ConvertTo-Json -Depth 16),$taskUtf8)
}
New-Item -ItemType Directory -Force -Path $taskReferences | Out-Null
if (-not $taskStateBytes) {
    $taskEmptyState = @{format='liveabit.openclaw.delivery-state.v1';last_sent_at=$null;last_sent_event_id=$null;processed_event_ids=@()}
    [IO.File]::WriteAllText($taskStatePath,($taskEmptyState | ConvertTo-Json),$taskUtf8)
} elseif ([Convert]::ToBase64String([IO.File]::ReadAllBytes($taskStatePath)) -cne [Convert]::ToBase64String($taskStateBytes)) {
    throw 'Notification state changed during setup. The old destinations are disabled; rerun after the current agent run completes.'
}
[IO.File]::WriteAllText($taskPolicyPath,($taskPolicy | ConvertTo-Json -Depth 12),$taskUtf8)
$taskAfter = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
if (($taskAfter.agents | ConvertTo-Json -Depth 32 -Compress) -cne $taskAgentsBefore) { throw 'Agent settings changed during setup; delivery policy was saved but agent settings need review.' }
$taskTestAcknowledged = $false
if ($taskSettings.send_test) {
    # The explicit one-off connection check is independent of coaching policy.
    # Invoke the selected paired phone once; never automatically retry a send.
    $taskNotifyRaw = @(& openclaw nodes notify --node $taskNode.nodeId --title 'liveabit connection check' --body 'OpenClaw can notify this phone. Gentle task reminders will use your current tasks and notification preferences.' --priority passive --delivery system --json 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Companion delivery was configured, but the phone did not acknowledge the one-off connection check. No retry was sent.' }
    $taskNotifyResult = ConvertFrom-CliJson $taskNotifyRaw
    if ($taskNotifyResult.ok -isnot [bool] -or $taskNotifyResult.ok -ne $true -or
        $taskNotifyResult.nodeId -isnot [string] -or $taskNotifyResult.nodeId -cne $taskNode.nodeId -or
        $taskNotifyResult.command -isnot [string] -or $taskNotifyResult.command -cne 'system.notify') {
        throw 'Companion delivery was configured, but OpenClaw did not confirm the selected phone notification invocation. No retry was sent.'
    }
    $taskTestAcknowledged = $true
}
@{
    format='liveabit.openclaw.companion-validation.v1';configured=$true;agent_id='liveabit';channel='companion'
    paired=$true;connected=$true;android_companion=$true;notification_command_declared=$true;notification_permission=$true
    automatic_hook_announcements=$false;legacy_liveabit_policy_migrated=$taskLegacyMigrated
    legacy_main_policy_disabled=[bool]$taskMainPolicy;global_whatsapp_settings_changed=$false
    model_settings_unchanged=$true;existing_delivery_state_preserved=[bool]$taskStateBytes
    policy_enabled=$taskPolicy.enabled;cooldown_minutes=$taskPolicy.cooldown_minutes
    quiet_start_hour=$taskPolicy.quiet_start_hour;quiet_end_hour=$taskPolicy.quiet_end_hour;time_zone=$taskPolicy.time_zone
    test_notification_requested=$taskSettings.send_test;native_invocation_acknowledged=$taskTestAcknowledged
    phone_notification_confirmed=$false;device_identity_printed=$false;credentials_printed=$false
} | ConvertTo-Json -Depth 8 -Compress
'@
$taskGuest = $taskGuest.Replace('__SETTINGS__',$taskSettingsEncoded)
$taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskGuest))
$taskCommand = "& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$taskEncoded'))))"
$taskPreviousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $taskRaw = @(& $taskCtl pwsh --command $taskCommand 2>&1)
    $taskExitCode = $LASTEXITCODE
} finally { $ErrorActionPreference = $taskPreviousPreference }
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
if ($taskExitCode -ne 0) {
    [IO.File]::WriteAllText((Join-Path $taskOutput 'diagnostic.txt'),($taskRaw -join "`n"),$taskUtf8)
    throw 'Companion delivery setup failed. Private diagnostics were saved in artifacts/openclaw/companion-delivery/diagnostic.txt; no device details were printed.'
}
try { $taskResult = ($taskRaw -join "`n") | ConvertFrom-Json }
catch { throw 'OpenClaw returned an unexpected companion setup response; no device details were printed.' }
[IO.File]::WriteAllText((Join-Path $taskOutput 'validation.json'),($taskResult | ConvertTo-Json -Depth 8),$taskUtf8)
$taskResult | ConvertTo-Json -Depth 8
