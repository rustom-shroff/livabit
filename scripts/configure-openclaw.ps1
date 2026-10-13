param([switch]$Lan,[ValidateSet('main','liveabit')][string]$AgentId='liveabit')
$ErrorActionPreference = 'Stop'
if ($AgentId -eq 'liveabit') { & (Join-Path $PSScriptRoot 'configure-openclaw-task-agent.ps1') -Lan:$Lan; return }
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCtl = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\clawctl.exe'
if (-not (Test-Path -LiteralPath $taskCtl)) { throw 'The OpenClaw Windows Gateway package is required.' }
$taskGuidance = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $taskRoot 'integrations\openclaw\activity-agent.md')))
$taskSkill = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $taskRoot 'integrations\openclaw\skills\liveabit\SKILL.md')))
$taskGuest = @'
$ErrorActionPreference = 'Stop'
if ($AgentId -eq 'liveabit') { & (Join-Path $PSScriptRoot 'configure-openclaw-task-agent.ps1') -Lan:$Lan; return }
$taskConfigPath = Join-Path $env:USERPROFILE '.openclaw/openclaw.json'
$taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
if ($taskConfig.gateway.mode -ne 'local' -or $taskConfig.gateway.auth.mode -ne 'token' -or -not $taskConfig.gateway.auth.token) {
    throw 'Use an already configured local OpenClaw Gateway with token authentication.'
}
if ($taskConfig.hooks.enabled -and $taskConfig.hooks.path -ne '/hooks') {
    throw 'Existing webhook configuration needs review before adding liveabit.'
}
$taskAgentId = '__AGENT__'
$taskMain = $taskAgentId -eq 'main'
$taskWorkspace = if ($taskMain) { $taskConfig.agents.entries.main.workspace } else { Join-Path $env:USERPROFILE '.openclaw/workspace-liveabit' }
if ($taskMain -and -not $taskWorkspace) { throw 'The existing main agent must have a configured workspace.' }
if (-not $taskMain -and -not $taskConfig.agents.entries.liveabit) {
    $taskModel = $taskConfig.agents.entries.main.model
    if (-not ($taskModel -is [string]) -or -not $taskModel) { throw 'Choose an existing main-agent model before configuring liveabit.' }
    $taskAdd = & openclaw agents add liveabit --workspace $taskWorkspace --model $taskModel --non-interactive --json 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'OpenClaw could not create the liveabit agent.' }
    $taskConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
} elseif (-not $taskMain -and $taskConfig.agents.entries.liveabit.workspace -ne $taskWorkspace) {
    throw 'The existing liveabit agent has a different workspace; review it before reconfiguration.'
}
$taskBackupRoot = Join-Path $env:USERPROFILE '.openclaw/liveabit-setup-backups'
New-Item -ItemType Directory -Force -Path $taskBackupRoot | Out-Null
$taskBackup = Join-Path $taskBackupRoot ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '.json')
Copy-Item -LiteralPath $taskConfigPath -Destination $taskBackup
$taskToken = $taskConfig.hooks.token
if (-not $taskToken) {
    $taskBytes = New-Object byte[] 32
    $taskRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $taskRandom.GetBytes($taskBytes) } finally { $taskRandom.Dispose() }
    $taskToken = [Convert]::ToBase64String($taskBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
if ($taskToken -notmatch '^[A-Za-z0-9_-]{32,256}$' -or $taskToken -eq $taskConfig.gateway.auth.token) {
    throw 'Use a separate compatible webhook key.'
}
$taskAllowedAgents = @(@($taskConfig.hooks.allowedAgentIds) + @($taskAgentId) | Where-Object { $_ } | Select-Object -Unique)
$taskPatch = @{hooks=@{enabled=$true;token=$taskToken;path='/hooks';allowedAgentIds=$taskAllowedAgents;allowRequestSessionKey=$false}}
$taskSession = $null
$taskExistingSession = $false
if ($taskMain) {
    $taskMainKey = if ($taskConfig.session.mainKey) { $taskConfig.session.mainKey } else { 'main' }
    $taskSession = if ($taskConfig.session.scope -eq 'global') { 'global' } else { 'agent:main:' + $taskMainKey }
    $taskInventory = & openclaw sessions --agent main --json --limit all 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify main conversation metadata.' }
    $taskInventoryValue = ($taskInventory -join "`n") | ConvertFrom-Json
    $taskExistingSession = @($taskInventoryValue.sessions | Where-Object { $_.key -eq $taskSession }).Count -gt 0
    $taskMappings = @($taskConfig.hooks.mappings | Where-Object { $_ -and $_.id -ne 'liveabit-main' })
    if (@($taskMappings | Where-Object { $_.match.path -eq 'liveabit' }).Count -gt 0) { throw 'The liveabit hook path already has an unrelated mapping.' }
    $taskMappings += @{id='liveabit-main';match=@{path='liveabit'};action='agent';agentId='main';sessionKey=$taskSession;sessionMode='persistent';name='liveabit';wakeMode='now';messageTemplate='{{message}}';deliver=$false}
    $taskPatch.hooks.mappings = $taskMappings
    $taskPatch.hooks.defaultSessionKey = $taskSession
    $taskLegacyPrefixes = @($taskAllowedAgents | Where-Object { $_ -match '^[a-z0-9][a-z0-9_-]{0,63}$' -and $_ -ne 'main' } | ForEach-Object { 'agent:' + $_ + ':' })
    $taskPatch.hooks.allowedSessionKeyPrefixes = @(@($taskConfig.hooks.allowedSessionKeyPrefixes) + @($taskSession) + $taskLegacyPrefixes | Where-Object { $_ } | Select-Object -Unique)
    # Do not change the main agent's instructions, tools, model or heartbeat.
    if ($null -ne $taskConfig.agents.entries.main.skills) {
        $taskSkills = @(@($taskConfig.agents.entries.main.skills) + @('liveabit') | Select-Object -Unique)
        $taskPatch.agents = @{entries=@{main=@{skills=$taskSkills}}}
    }
} else {
    $taskEntry = @{tools=@{deny=@('*')}; heartbeat=@{every='0m'}; skills=@('liveabit')}
    if ($taskConfig.agents.entries.main.models) { $taskEntry.models = $taskConfig.agents.entries.main.models }
    $taskPatch.agents = @{entries=@{liveabit=$taskEntry}}
}
if (__LAN__) {
    $taskPatch.gateway = @{bind='lan'}
    # Retain the existing local dashboard origins when enabling phone access.
    if (-not $taskConfig.gateway.controlUi.allowedOrigins) {
        $taskPatch.gateway.controlUi = @{allowedOrigins=@(('http://127.0.0.1:' + $taskConfig.gateway.port),('http://localhost:' + $taskConfig.gateway.port))}
    }
}
$taskPatchText = $taskPatch | ConvertTo-Json -Depth 16 -Compress
$taskValidation = $taskPatchText | & openclaw config patch --stdin --dry-run --json 2>&1
if ($LASTEXITCODE -ne 0) { throw 'OpenClaw rejected the proposed liveabit settings. Existing configuration was retained.' }
$taskApplied = $taskPatchText | & openclaw config patch --stdin 2>&1
if ($LASTEXITCODE -ne 0) { throw 'OpenClaw could not save the liveabit configuration.' }
New-Item -ItemType Directory -Force -Path (Join-Path $taskWorkspace 'skills/liveabit') | Out-Null
if (-not $taskMain) { [IO.File]::WriteAllBytes((Join-Path $taskWorkspace 'AGENTS.md'),[Convert]::FromBase64String('__GUIDANCE__')) }
[IO.File]::WriteAllBytes((Join-Path $taskWorkspace 'skills/liveabit/SKILL.md'),[Convert]::FromBase64String('__SKILL__'))
# Emit only to the host helper, which saves the key to ignored local files.
@{format='liveabit.openclaw.local.v1';port=$taskConfig.gateway.port;key=$taskToken;agent_id=$taskAgentId;hook_path=$(if ($taskMain) {'/hooks/liveabit'} else {'/hooks/agent'});session_key=$taskSession;existing_session=$taskExistingSession;workspace=$taskWorkspace;backup=$taskBackup;lan=__LAN__} | ConvertTo-Json -Compress
'@
$taskGuest = $taskGuest.Replace('__GUIDANCE__',$taskGuidance).Replace('__SKILL__',$taskSkill).Replace('__AGENT__',$AgentId).Replace('__LAN__',$(if ($Lan) {'$true'} else {'$false'}))
$taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskGuest))
$taskCommand = "& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$taskEncoded'))))"
$taskResult = & $taskCtl pwsh --command $taskCommand
if ($LASTEXITCODE -ne 0) { throw 'OpenClaw setup failed. Read the preceding diagnostic.' }
$taskConnection = ($taskResult -join "`n") | ConvertFrom-Json
$taskOutput = Join-Path $taskRoot 'artifacts\openclaw'
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskUtf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $taskOutput 'connection.json'),($taskConnection | ConvertTo-Json),$taskUtf8)
function Write-Setup([string]$Name,[string]$HostName) {
    $taskSetup = @{format='liveabit.openclaw.connection.v1';url=('http://' + $HostName + ':' + $taskConnection.port + $taskConnection.hook_path);key=$taskConnection.key;agent_id=$taskConnection.agent_id;warning_minutes=60}
    [IO.File]::WriteAllText((Join-Path $taskOutput $Name),($taskSetup | ConvertTo-Json),$taskUtf8)
}
Write-Setup 'android-usb-setup.json' '127.0.0.1'
Write-Setup 'android-emulator-setup.json' '10.0.2.2'
if ($Lan) {
    $taskAddresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } | Sort-Object InterfaceIndex)
    if ($taskAddresses.Count -eq 0) { Write-Warning 'No private Wi-Fi/LAN address found. USB and emulator setups are available.' }
    else {
        $taskDefaultInterfaces = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -ExpandProperty InterfaceIndex)
        $taskPreferred = @($taskAddresses | Where-Object { $taskDefaultInterfaces -contains $_.InterfaceIndex })
        $taskWifiAddress = if ($taskPreferred.Count -gt 0) { $taskPreferred[0].IPAddress } else { $taskAddresses[0].IPAddress }
        Write-Setup 'android-wifi-setup.json' $taskWifiAddress
        foreach ($taskAddress in $taskAddresses) { Write-Setup ('android-wifi-' + $taskAddress.IPAddress.Replace('.','-') + '.json') $taskAddress.IPAddress }
    }
}
$taskRestart = & $taskCtl gateway-service restart --json
$taskRestartValue = ($taskRestart -join "`n") | ConvertFrom-Json
# The Windows supervisor can report its startup deadline before OpenClaw finishes
# loading. Observe the existing managed process; do not launch a second gateway.
for ($taskAttempt = 0; $taskAttempt -lt 30 -and $taskRestartValue.gateway.state -ne 'running'; $taskAttempt++) {
    Start-Sleep -Seconds 5
    $taskStatus = & $taskCtl gateway-service status --json
    $taskRestartValue = ($taskStatus -join "`n") | ConvertFrom-Json
}
if ($taskRestartValue.gateway.state -ne 'running') { throw 'Settings saved; the managed gateway is not ready yet. Check clawctl gateway-service status.' }
[pscustomobject]@{agent=$taskConnection.agent_id;existing_main_conversation=$taskConnection.existing_session;gateway_state=$taskRestartValue.gateway.state;port=$taskConnection.port;setup_directory=$taskOutput;key_printed=$false;intermediary_server=$false} | ConvertTo-Json
