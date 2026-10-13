$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskArtifactRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot 'artifacts/openclaw/companion-helper-tests'))
$taskFixtureRoot = [IO.Path]::GetFullPath((Join-Path $taskArtifactRoot ([Guid]::NewGuid().ToString('N'))))
if (-not $taskArtifactRoot.StartsWith(($taskRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase) -or
    -not $taskFixtureRoot.StartsWith(($taskArtifactRoot.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)) {
    throw 'The synthetic fixture directory must stay inside this project artifacts directory.'
}
New-Item -ItemType Directory -Force -Path $taskFixtureRoot | Out-Null
$taskUtf8 = New-Object Text.UTF8Encoding $false
$script:taskAssertions = 0
$script:taskCases = 0
$script:taskCliCalls = 0
$script:taskFixtureNotifications = 0
$script:taskTestNodeId = 'a'*64
$script:taskNotifyReply = @{ok=$true;nodeId=$script:taskTestNodeId;command='system.notify';payload=$null;payloadJSON=$null}
function Get-GuestTemplate([string]$filename) {
    $taskSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $filename))
    $taskParseErrors = $null
    $taskAst = [System.Management.Automation.Language.Parser]::ParseInput($taskSource,[ref]$null,[ref]$taskParseErrors)
    if (@($taskParseErrors).Count) { throw ('Cannot parse '+$filename) }
    $taskGuestAst = $taskAst.Find({param($node) $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -eq '$taskGuest'},$true)
    if (-not $taskGuestAst) { throw ('Missing embedded guest in '+$filename) }
    return $taskGuestAst.Right.Find({param($node) $node -is [System.Management.Automation.Language.StringConstantExpressionAst]},$true).Value
}
$taskGuestTemplate = Get-GuestTemplate 'configure-openclaw-companion.ps1'
$taskWhatsAppGuestTemplate = Get-GuestTemplate 'configure-openclaw-whatsapp.ps1'
function New-EligibleNode([string]$id) {
    return @{nodeId=$id;platform='android';paired=$true;connected=$true;commands=@('system.notify');permissions=@{notifications=$true}}
}
function Reset-NodeStatus { $script:taskNodeStatus = @{nodes=@((New-EligibleNode $script:taskTestNodeId))} }
Reset-NodeStatus
function openclaw {
    # Only this in-process fake is invoked by the extracted guest. It never
    # resolves the installed CLI, contacts a gateway or reaches a personal phone.
    $script:taskCliCalls++
    $script:LASTEXITCODE = 0
    if ($args[0] -eq 'nodes' -and $args[1] -eq 'status') {
        'synthetic plugin log prefix'
        $script:taskNodeStatus | ConvertTo-Json -Depth 8 -Compress
        return
    }
    if ($args[0] -eq 'nodes' -and $args[1] -eq 'notify') {
        $script:taskFixtureNotifications++
        $script:taskNotifyReply | ConvertTo-Json -Depth 8 -Compress
        return
    }
    throw 'Unexpected synthetic CLI call; no real executable was invoked.'
}
function Assert-Check($condition,[string]$message) {
    $script:taskAssertions++
    if (-not $condition) { throw $message }
}
function New-Fixture([string]$name) {
    $taskHome = [IO.Path]::GetFullPath((Join-Path $taskFixtureRoot $name))
    if (-not $taskHome.StartsWith(($taskFixtureRoot+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture escaped its owned directory.' }
    $taskLiveabit = Join-Path $taskHome '.openclaw/workspace-liveabit'
    $taskMain = Join-Path $taskHome '.openclaw/workspace-main'
    foreach ($taskDir in @((Join-Path $taskLiveabit 'skills/liveabit/references'),(Join-Path $taskMain 'skills/liveabit/references'))) {
        New-Item -ItemType Directory -Force -Path $taskDir | Out-Null
    }
    $taskConfig = @{
        agents=@{entries=@{liveabit=@{workspace=$taskLiveabit;model='fixture/model';thinkingDefault='medium'};main=@{workspace=$taskMain;model='fixture/main';thinkingDefault='medium'}}}
        hooks=@{mappings=@(@{id='liveabit-tasks';agentId='liveabit';deliver=$false;action='agent';match=@{path='liveabit'}})}
    }
    $taskConfigPath = Join-Path $taskHome '.openclaw/openclaw.json'
    [IO.File]::WriteAllText($taskConfigPath,($taskConfig | ConvertTo-Json -Depth 8),$taskUtf8)
    $taskPolicy = @{
        format='liveabit.openclaw.delivery.v1';enabled=$true;agent_id='liveabit';channel='whatsapp';account_id='default'
        identity_source='whatsapp.directory.self';target='+12025550101';cooldown_minutes=35
        quiet_hours=@{enabled=$true;start_hour=21;end_hour=7;time_zone='UTC'}
    }
    $taskPolicyPath = Join-Path $taskLiveabit 'skills/liveabit/references/delivery.json'
    $taskMainPolicyPath = Join-Path $taskMain 'skills/liveabit/references/delivery.json'
    [IO.File]::WriteAllText($taskPolicyPath,($taskPolicy | ConvertTo-Json -Depth 8),$taskUtf8)
    $taskPolicy.agent_id='main'
    [IO.File]::WriteAllText($taskMainPolicyPath,($taskPolicy | ConvertTo-Json -Depth 8),$taskUtf8)
    $taskStateText = '{ "format": "liveabit.openclaw.delivery-state.v1", "last_sent_at": null, "last_sent_event_id": null, "processed_event_ids": ["fixture-old-event"] }'
    $taskStatePath = Join-Path $taskLiveabit 'skills/liveabit/references/delivery-state.json'
    [IO.File]::WriteAllText($taskStatePath,$taskStateText,$taskUtf8)
    return @{
        home=$taskHome;liveabit=$taskLiveabit;main=$taskMain;policy_path=$taskPolicyPath;main_policy_path=$taskMainPolicyPath
        state_path=$taskStatePath;state_text=$taskStateText;config_path=$taskConfigPath;config_text=[IO.File]::ReadAllText($taskConfigPath)
    }
}
function New-Settings {
    return @{node_id=$null;cooldown_minutes=60;quiet_start_hour=22;quiet_end_hour=8;time_zone='UTC';send_test=$false;preference_parameters=@()}
}
function Invoke-Fixture($fixture,$settings,[string]$template=$taskGuestTemplate) {
    $taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($settings | ConvertTo-Json -Compress)))
    # Rewrite only the embedded guest's home expression. Do not repurpose any
    # operating-system environment variable or access the real OpenClaw home.
    $taskFixtureGuest = $template.Replace('__SETTINGS__',$taskEncoded).Replace('$env:USERPROFILE',("'"+$fixture.home.Replace("'","''")+"'"))
    return ((& ([scriptblock]::Create($taskFixtureGuest))) -join "`n" | ConvertFrom-Json)
}
function Assert-StateAndConfig($fixture) {
    Assert-Check ([IO.File]::ReadAllText($fixture.state_path) -ceq $fixture.state_text) 'Existing delivery-state bytes changed.'
    Assert-Check ([IO.File]::ReadAllText($fixture.config_path) -ceq $fixture.config_text) 'Agent, model or gateway configuration changed.'
}
function Assert-Failure([scriptblock]$action,[string]$messagePattern) {
    $taskExpectedFailure = $false
    try { & $action | Out-Null } catch { $taskExpectedFailure = $_.Exception.Message -match $messagePattern }
    Assert-Check $taskExpectedFailure ('Missing expected failure: '+$messagePattern)
}

$script:taskCases++
$taskFixture = New-Fixture 'migration'
$taskSettings = New-Settings
$taskResult = Invoke-Fixture $taskFixture $taskSettings
$taskPolicy = Get-Content -LiteralPath $taskFixture.policy_path -Raw | ConvertFrom-Json
$taskMainPolicy = Get-Content -LiteralPath $taskFixture.main_policy_path -Raw | ConvertFrom-Json
Assert-Check ($taskPolicy.format -eq 'liveabit.openclaw.companion-delivery.v1' -and $taskPolicy.node_id -eq $script:taskTestNodeId) 'Companion identity migration failed.'
Assert-Check ($taskPolicy.cooldown_minutes -eq 35 -and $taskPolicy.quiet_start_hour -eq 21 -and $taskPolicy.quiet_end_hour -eq 7 -and $taskPolicy.time_zone -eq 'UTC') 'Existing timing preferences were lost.'
Assert-Check ($taskMainPolicy.enabled -eq $false) 'Legacy main delivery stayed enabled.'
Assert-Check ($script:taskFixtureNotifications -eq 0 -and $taskResult.phone_notification_confirmed -eq $false) 'Migration sent a notification or claimed physical receipt.'
Assert-StateAndConfig $taskFixture

$script:taskCases++
$taskSettings.preference_parameters=@('CooldownMinutes');$taskSettings.cooldown_minutes=45
$null = Invoke-Fixture $taskFixture $taskSettings
$taskPolicy = Get-Content -LiteralPath $taskFixture.policy_path -Raw | ConvertFrom-Json
Assert-Check ($taskPolicy.cooldown_minutes -eq 45 -and $taskPolicy.quiet_start_hour -eq 21 -and $taskPolicy.quiet_end_hour -eq 7) 'Explicit preference update replaced unrelated settings.'
Assert-StateAndConfig $taskFixture

$script:taskCases++
$taskSettings.send_test=$true
$taskBeforeNotifications=$script:taskFixtureNotifications
$taskResult = Invoke-Fixture $taskFixture $taskSettings
Assert-Check ($script:taskFixtureNotifications-$taskBeforeNotifications -eq 1 -and $taskResult.native_invocation_acknowledged -eq $true -and $taskResult.phone_notification_confirmed -eq $false) 'One-off valid acknowledgement semantics are incorrect.'
Assert-StateAndConfig $taskFixture

foreach ($taskNegativeReply in @(
    @{name='false';reply=@{ok=$false;nodeId=$script:taskTestNodeId;command='system.notify'}},
    @{name='missing';reply=@{nodeId=$script:taskTestNodeId;command='system.notify'}},
    @{name='string-true';reply=@{ok='true';nodeId=$script:taskTestNodeId;command='system.notify'}},
    @{name='wrong-node';reply=@{ok=$true;nodeId=('b'*64);command='system.notify'}},
    @{name='wrong-command';reply=@{ok=$true;nodeId=$script:taskTestNodeId;command='system.info'}}
)) {
    $script:taskCases++
    $script:taskNotifyReply=$taskNegativeReply.reply
    $taskBeforeNotifications=$script:taskFixtureNotifications
    Assert-Failure { Invoke-Fixture $taskFixture $taskSettings } 'did not confirm the selected phone notification invocation'
    Assert-Check ($script:taskFixtureNotifications-$taskBeforeNotifications -eq 1) ('Negative acknowledgement automatically retried: '+$taskNegativeReply.name)
    $taskPolicy=Get-Content -LiteralPath $taskFixture.policy_path -Raw | ConvertFrom-Json
    Assert-Check ($taskPolicy.cooldown_minutes -eq 45 -and $taskPolicy.quiet_start_hour -eq 21 -and $taskPolicy.quiet_end_hour -eq 7) 'Failed notification reset preferences.'
    Assert-StateAndConfig $taskFixture
}
$script:taskNotifyReply=@{ok=$true;nodeId=$script:taskTestNodeId;command='system.notify';payload=$null;payloadJSON=$null}

$script:taskCases++
$script:taskNodeStatus.nodes += New-EligibleNode ('b'*64)
$taskAmbiguous = New-Fixture 'ambiguous'
$taskSettings = New-Settings
$taskBeforePolicy = [IO.File]::ReadAllText($taskAmbiguous.policy_path)
Assert-Failure { Invoke-Fixture $taskAmbiguous $taskSettings } 'More than one Android companion'
Assert-Check ([IO.File]::ReadAllText($taskAmbiguous.policy_path) -ceq $taskBeforePolicy) 'Ambiguous selection changed a delivery policy.'
Assert-StateAndConfig $taskAmbiguous

$script:taskCases++
$taskSettings.node_id=$script:taskTestNodeId
$taskExplicitResult=Invoke-Fixture $taskAmbiguous $taskSettings
$taskPolicy=Get-Content -LiteralPath $taskAmbiguous.policy_path -Raw | ConvertFrom-Json
Assert-Check ($taskPolicy.node_id -ceq $script:taskTestNodeId -and $taskExplicitResult.paired -eq $true) 'Explicit node selection did not resolve ambiguity.'
Assert-StateAndConfig $taskAmbiguous
Reset-NodeStatus

$script:taskCases++
$script:taskNodeStatus.nodes[0].permissions.notifications=$false
$taskDenied=New-Fixture 'permission-denied'
$taskSettings=New-Settings
$taskSettings.node_id=$script:taskTestNodeId
$taskBeforePolicy=[IO.File]::ReadAllText($taskDenied.policy_path)
Assert-Failure { Invoke-Fixture $taskDenied $taskSettings } 'not paired, connected and allowed'
Assert-Check ([IO.File]::ReadAllText($taskDenied.policy_path) -ceq $taskBeforePolicy) 'Denied permission changed a delivery policy.'
Reset-NodeStatus

$script:taskCases++
$taskOptOut=New-Fixture 'opt-out'
$taskPolicy=Get-Content -LiteralPath $taskOptOut.policy_path -Raw | ConvertFrom-Json
$taskPolicy.enabled=$false
[IO.File]::WriteAllText($taskOptOut.policy_path,($taskPolicy | ConvertTo-Json -Depth 8),$taskUtf8)
$null=Invoke-Fixture $taskOptOut (New-Settings)
$taskPolicy=Get-Content -LiteralPath $taskOptOut.policy_path -Raw | ConvertFrom-Json
Assert-Check ($taskPolicy.enabled -eq $false) 'Migration lost the existing notification opt-out.'
Assert-StateAndConfig $taskOptOut

$script:taskCases++
$taskQuietDisabled=New-Fixture 'quiet-disabled'
$taskPolicy=Get-Content -LiteralPath $taskQuietDisabled.policy_path -Raw | ConvertFrom-Json
$taskPolicy.quiet_hours.enabled=$false
[IO.File]::WriteAllText($taskQuietDisabled.policy_path,($taskPolicy | ConvertTo-Json -Depth 8),$taskUtf8)
$null=Invoke-Fixture $taskQuietDisabled (New-Settings)
$taskPolicy=Get-Content -LiteralPath $taskQuietDisabled.policy_path -Raw | ConvertFrom-Json
Assert-Check ($taskPolicy.quiet_start_hour -eq $taskPolicy.quiet_end_hour) 'Migration changed disabled quiet hours into active quiet hours.'

$script:taskCases++
$taskChicago=New-Fixture 'actual-default-chicago'
$taskPolicy=Get-Content -LiteralPath $taskChicago.policy_path -Raw | ConvertFrom-Json
$taskPolicy.cooldown_minutes=60
$taskPolicy.quiet_hours.start_hour=22
$taskPolicy.quiet_hours.end_hour=8
$taskPolicy.quiet_hours.time_zone='America/Chicago'
[IO.File]::WriteAllText($taskChicago.policy_path,($taskPolicy | ConvertTo-Json -Depth 8),$taskUtf8)
$taskSettings=New-Settings
$taskSettings.time_zone='America/Chicago'
$null=Invoke-Fixture $taskChicago $taskSettings
$taskPolicy=Get-Content -LiteralPath $taskChicago.policy_path -Raw | ConvertFrom-Json
Assert-Check ($taskPolicy.cooldown_minutes -eq 60 -and $taskPolicy.quiet_start_hour -eq 22 -and $taskPolicy.quiet_end_hour -eq 8 -and $taskPolicy.time_zone -ceq 'America/Chicago') 'The actual default Chicago preferences failed migration or lost their IANA timezone.'
Assert-StateAndConfig $taskChicago

$script:taskCases++
$taskInvalidState=New-Fixture 'invalid-state'
[IO.File]::WriteAllText($taskInvalidState.state_path,'{"format":"unsupported","processed_event_ids":[]}',$taskUtf8)
$taskBeforePolicy=[IO.File]::ReadAllText($taskInvalidState.policy_path)
Assert-Failure { Invoke-Fixture $taskInvalidState (New-Settings) } 'existing notification state needs review'
Assert-Check ([IO.File]::ReadAllText($taskInvalidState.policy_path) -ceq $taskBeforePolicy) 'Invalid existing state changed delivery.'
Assert-Check ([IO.File]::ReadAllText($taskInvalidState.state_path) -ceq '{"format":"unsupported","processed_event_ids":[]}') 'Invalid existing state was reset.'

$script:taskCases++
$taskFixedTarget=New-Fixture 'fixed-destination'
$null=Invoke-Fixture $taskFixedTarget (New-Settings)
$script:taskNodeStatus=@{nodes=@((New-EligibleNode ('b'*64)))}
$taskBeforePolicy=[IO.File]::ReadAllText($taskFixedTarget.policy_path)
$taskBeforeNotifications=$script:taskFixtureNotifications
Assert-Failure { Invoke-Fixture $taskFixedTarget (New-Settings) } 'not paired, connected and allowed'
Assert-Check ([IO.File]::ReadAllText($taskFixedTarget.policy_path) -ceq $taskBeforePolicy) 'An unavailable saved phone silently rerouted delivery to another device.'
Assert-Check ($script:taskFixtureNotifications -eq $taskBeforeNotifications) 'Unavailable saved phone triggered a notification.'
Assert-StateAndConfig $taskFixedTarget

$script:taskCases++
$taskSettings=New-Settings
$taskSettings.node_id='b'*64
$null=Invoke-Fixture $taskFixedTarget $taskSettings
$taskPolicy=Get-Content -LiteralPath $taskFixedTarget.policy_path -Raw | ConvertFrom-Json
Assert-Check ($taskPolicy.node_id -ceq ('b'*64) -and $taskPolicy.cooldown_minutes -eq 35 -and $taskPolicy.quiet_start_hour -eq 21 -and $taskPolicy.quiet_end_hour -eq 7) 'Explicit device reroute lost timing preferences or did not select the requested device.'
Assert-StateAndConfig $taskFixedTarget
Reset-NodeStatus

foreach ($taskLegacyAgentId in @('liveabit','main')) {
    $script:taskCases++
    $taskBeforeCliCalls=$script:taskCliCalls
    Assert-Failure { Invoke-Fixture $taskFixture @{agent_id=$taskLegacyAgentId} $taskWhatsAppGuestTemplate } 'legacy helper cannot switch delivery back to WhatsApp'
    Assert-Check ($script:taskCliCalls -eq $taskBeforeCliCalls) 'Legacy WhatsApp helper contacted the CLI before rejecting companion delivery.'
}

$taskReport=@{
    format='liveabit.openclaw.companion-helper-tests.v1';passed=$true;case_count=$script:taskCases;assertion_count=$script:taskAssertions
    platform='native-powershell';powershell_version=$PSVersionTable.PSVersion.ToString();real_gateway_calls=0;real_notifications=0
    synthetic_notification_invocations=$script:taskFixtureNotifications;fixtures_in_ignored_artifacts=$true
}
[IO.File]::WriteAllText((Join-Path $taskFixtureRoot 'validation.json'),($taskReport | ConvertTo-Json -Depth 8),$taskUtf8)
$taskReport | ConvertTo-Json -Compress
