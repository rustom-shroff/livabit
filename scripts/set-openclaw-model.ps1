param(
    [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')][string]$AgentId = 'main',
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^[a-z][a-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$')]
    [string]$Model,
    [Parameter(Mandatory=$true)]
    [ValidateSet('off','minimal','low','medium','high','xhigh','adaptive','max','ultra')]
    [string]$Thinking
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCtl = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\clawctl.exe'
if (-not (Test-Path -LiteralPath $taskCtl)) { throw 'The OpenClaw Windows Gateway package is required.' }
$taskOutput = Join-Path $taskRoot 'artifacts\openclaw\model-config'
$taskUtf8 = New-Object Text.UTF8Encoding $false

# Model choices belong to the user. This helper changes only the existing
# selected agent and clears its conversation pins so later choices can be inherited.
$taskGuest = @'
$ErrorActionPreference = 'Stop'
$taskModel = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__MODEL__'))
$taskThinking = '__THINKING__'
$taskAgentId = '__AGENT__'
$taskConfigPath = Join-Path $env:USERPROFILE '.openclaw/openclaw.json'
$taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
$taskAgent = $taskConfig.agents.entries.PSObject.Properties[$taskAgentId].Value
if (-not $taskAgent -or -not $taskAgent.workspace) { throw 'Configure an existing selected OpenClaw agent first.' }

function Read-CliJson([string[]]$Arguments) {
    $taskRaw = & openclaw @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { $taskRaw | Write-Output; throw 'OpenClaw could not complete the requested model operation.' }
    try { return (($taskRaw -join "`n") | ConvertFrom-Json) }
    catch { $taskRaw | Write-Output; throw 'OpenClaw returned an unexpected model response.' }
}
function Get-PrimaryModel($Value) {
    if ($Value -is [string]) { return $Value }
    if ($Value -and $Value.primary -is [string]) { return $Value.primary }
    return $null
}
function Get-ModelEntry($Map,[string]$Reference) {
    if (-not $Map) { return $null }
    $taskProperty = $Map.PSObject.Properties[$Reference]
    if ($taskProperty) { return $taskProperty.Value }
    return $null
}
function Has-PolicyAllow($Policy) {
    return ($null -ne $Policy -and $null -ne $Policy.PSObject.Properties['allow'])
}

$taskCurrent = Get-PrimaryModel $taskAgent.model
if (-not $taskCurrent) { $taskCurrent = Get-PrimaryModel $taskConfig.agents.defaults.model }
if (-not $taskCurrent -or $taskCurrent -notmatch '^(?<base>[a-z][a-z0-9._-]*/[^@\s]+)(?<profile>@[^\s]+)?$') {
    throw 'The existing main agent needs a compatible provider/model configuration.'
}
$taskCurrentBase = $Matches.base
$taskProfileSuffix = $Matches.profile
if ($taskModel.Split('/')[0] -cne $taskCurrentBase.Split('/')[0]) {
    throw 'Select a model from the existing provider. Configure other providers inside OpenClaw first.'
}

# Read the published catalog; listing models does not run a model or inspect
# conversation messages. --all includes choices outside the current policy.
$taskCatalog = Read-CliJson @('models','list','--agent',$taskAgentId,'--all','--json')
$taskCandidate = @($taskCatalog.models | Where-Object { $_.key -ceq $taskModel })
if ($taskCandidate.Count -ne 1 -or $taskCandidate[0].available -ne $true) {
    throw 'The requested model is not available in the current OpenClaw account catalog. Refresh Models in OpenClaw and try again.'
}
$taskAgentKey = if ($taskConfig.session.mainKey) { $taskConfig.session.mainKey } else { 'main' }
$taskSessionKey = if ($taskConfig.session.scope -eq 'global') { 'global' } else { 'agent:' + $taskAgentId + ':' + $taskAgentKey }
$taskSessions = Read-CliJson @('sessions','--agent',$taskAgentId,'--json','--limit','all')
$taskSession = @($taskSessions.sessions | Where-Object { $_.key -ceq $taskSessionKey })
if ($taskSession.Count -ne 1 -or -not $taskSession[0].sessionId) {
    throw 'The selected agent conversation was not found. Open it in OpenClaw before changing its model.'
}

$taskNewPrimary = $taskModel + $taskProfileSuffix
$taskNewModel = $taskNewPrimary
if ($taskAgent.model -and $taskAgent.model -isnot [string]) {
    # Retain the user's fallback order when main has an authored model object.
    $taskNewModel = @{}
    foreach ($taskProperty in $taskAgent.model.PSObject.Properties) { $taskNewModel[$taskProperty.Name] = $taskProperty.Value }
    $taskNewModel.primary = $taskNewPrimary
}
$taskEntryPatch = @{model=$taskNewModel;thinkingDefault=$taskThinking}
$taskExistingTarget = Get-ModelEntry $taskAgent.models $taskModel
if ($null -eq $taskExistingTarget) {
    $taskCurrentEntry = Get-ModelEntry $taskAgent.models $taskCurrentBase
    if (-not $taskCurrentEntry) { $taskCurrentEntry = Get-ModelEntry $taskConfig.agents.defaults.models $taskCurrentBase }
    $taskRuntime = if ($taskCurrentEntry.agentRuntime) { $taskCurrentEntry.agentRuntime } else { $taskAgent.agentRuntime }
    $taskTargetEntry = @{}
    # Copy the runtime only; other model-specific parameters must stay with
    # their original model. Existing target metadata is left untouched.
    if ($taskRuntime) { $taskTargetEntry.agentRuntime = $taskRuntime }
    $taskEntryPatch.models = @{}
    $taskEntryPatch.models[$taskModel] = $taskTargetEntry
}

# An explicit per-agent policy replaces the shared policy. Preserve the
# effective restrictions, including [] meaning unrestricted, while admitting
# the selected model. This also survives legacy model-map policy migration.
if (Has-PolicyAllow $taskAgent.modelPolicy) {
    $taskAllowed = @($taskAgent.modelPolicy.allow)
} elseif (Has-PolicyAllow $taskConfig.agents.defaults.modelPolicy) {
    $taskAllowed = @($taskConfig.agents.defaults.modelPolicy.allow)
} elseif ($taskConfig.meta.migrations.modelPolicyAllowlist -ne $true -and -not $taskConfig.agents.defaults.modelPolicy -and $taskConfig.agents.defaults.models) {
    $taskAllowed = @($taskConfig.agents.defaults.models.PSObject.Properties.Name | Where-Object { $_ })
} else { $taskAllowed = @() }
if ($taskAllowed.Count -gt 0) { $taskAllowed = @(@($taskAllowed) + @($taskModel) | Select-Object -Unique) }
$taskEntryPatch.modelPolicy = @{allow=@($taskAllowed)}
$taskEntries = @{}; $taskEntries[$taskAgentId] = $taskEntryPatch; $taskPatch = @{agents=@{entries=$taskEntries}}

$taskBackupRoot = Join-Path $env:USERPROFILE '.openclaw/liveabit-setup-backups'
New-Item -ItemType Directory -Force -Path $taskBackupRoot | Out-Null
$taskBackup = Join-Path $taskBackupRoot ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '-model.json')
Copy-Item -LiteralPath $taskConfigPath -Destination $taskBackup
$taskPatchText = $taskPatch | ConvertTo-Json -Depth 24 -Compress
$taskValidationRaw = $taskPatchText | & openclaw config patch --stdin --dry-run --json 2>&1
if ($LASTEXITCODE -ne 0) { $taskValidationRaw | Write-Output; throw 'OpenClaw rejected the model settings; the existing configuration was retained.' }
$taskAppliedRaw = $taskPatchText | & openclaw config patch --stdin 2>&1
if ($LASTEXITCODE -ne 0) { $taskAppliedRaw | Write-Output; throw 'OpenClaw could not save the selected model settings.' }
$taskSavedConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
$taskSavedPrimary = Get-PrimaryModel $taskSavedConfig.agents.entries.PSObject.Properties[$taskAgentId].Value.model
$taskSavedModel = if ($taskSavedPrimary) { $taskSavedPrimary.Split('@')[0] } else { $null }
$taskSavedThinking = $taskSavedConfig.agents.entries.PSObject.Properties[$taskAgentId].Value.thinkingDefault
$taskSavedSelectionMatches = $taskSavedModel -ceq $taskModel -and $taskSavedThinking -ceq $taskThinking

# The Store guest can use Windows PowerShell and an openclaw.cmd wrapper.
# Escape embedded JSON quotes only for legacy native argument passing.
$taskArgumentMode = (Get-Variable -Name PSNativeCommandArgumentPassing -ErrorAction SilentlyContinue).Value
$taskCliCommand = Get-Command openclaw -ErrorAction Stop
$taskLegacyJson = $PSVersionTable.PSVersion -lt [version]'7.3' -or $taskArgumentMode -eq 'Legacy' -or ($taskArgumentMode -ne 'Standard' -and $taskCliCommand.Source -match '\.(cmd|bat)$')
$taskSessionParams = @{key=$taskSessionKey;agentId=$taskAgentId;expectedSessionId=$taskSession[0].sessionId;model=$null;thinkingLevel=$null} | ConvertTo-Json -Compress
if ($taskLegacyJson) { $taskSessionParams = $taskSessionParams.Replace('"','\"') }

# Config reload is normally automatic. Briefly observe its actual resolution;
# never restart the Gateway or reset the conversation to force a model switch.
$taskFollowsDefaults = $false
for ($taskAttempt = 0; $taskAttempt -lt 5; $taskAttempt++) {
    if ($taskAttempt -gt 0) { Start-Sleep -Seconds 2 }
    $taskUpdated = Read-CliJson @('gateway','call','sessions.patch','--params',$taskSessionParams,'--timeout','30000','--json')
    $taskSameSession = $taskUpdated.entry.sessionId -ceq $taskSession[0].sessionId
    $taskNoPins = -not $taskUpdated.entry.modelOverride -and -not $taskUpdated.entry.providerOverride -and -not $taskUpdated.entry.thinkingLevel
    $taskResolvedModel = $taskUpdated.resolved.modelProvider + '/' + $taskUpdated.resolved.model
    # This RPC omits thinking metadata until its model catalog is hydrated.
    # The saved agent default and absent conversation pin confirm inheritance;
    # check the effective value as well when the Gateway supplies it.
    $taskHasResolvedThinking = $null -ne $taskUpdated.resolved.PSObject.Properties['thinkingLevel']
    $taskResolvedThinkingMatches = -not $taskHasResolvedThinking -or $taskUpdated.resolved.thinkingLevel -ceq $taskThinking
    $taskFollowsDefaults = $taskUpdated.ok -eq $true -and $taskSameSession -and $taskNoPins -and $taskSavedSelectionMatches -and $taskResolvedModel -ceq $taskModel -and $taskResolvedThinkingMatches
    if ($taskFollowsDefaults) { break }
}
if (-not $taskFollowsDefaults) {
    # Emit only a safe projection into the host's private failure diagnostic.
    @{requested_model=$taskModel;requested_thinking=$taskThinking;saved_model=$taskSavedModel;saved_thinking=$taskSavedThinking;resolved_model=$taskResolvedModel;resolved_thinking_available=$taskHasResolvedThinking;resolved_thinking=$taskUpdated.resolved.thinkingLevel;session_unchanged=$taskSameSession;session_has_no_model_or_thinking_pins=$taskNoPins;rpc_ok=($taskUpdated.ok -eq $true)} | ConvertTo-Json -Compress
    throw 'Model settings were saved, but the Gateway has not confirmed the requested model and thinking level. Check its Models settings before sending another activity event.'
}
@{model=$taskModel;thinking=$taskThinking;session_follows_defaults=$true} | ConvertTo-Json -Compress
'@
$taskModelEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Model))
$taskGuest = $taskGuest.Replace('__MODEL__',$taskModelEncoded).Replace('__THINKING__',$Thinking).Replace('__AGENT__',$AgentId)
$taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskGuest))
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
    throw 'OpenClaw model setup failed. A private diagnostic was saved in artifacts/openclaw/model-config/diagnostic.txt.'
}
try { $taskResult = ($taskRaw -join "`n") | ConvertFrom-Json }
catch {
    New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
    [IO.File]::WriteAllText((Join-Path $taskOutput 'diagnostic.txt'),($taskRaw -join "`n"),$taskUtf8)
    throw 'OpenClaw returned an unexpected setup response. Account details were not printed.'
}
if ($taskResult.model -cne $Model -or $taskResult.thinking -cne $Thinking -or $taskResult.session_follows_defaults -ne $true) {
    throw 'OpenClaw did not confirm the requested model configuration.'
}
[pscustomobject]@{model=$Model;thinking=$Thinking;session_follows_defaults=$true} | ConvertTo-Json
