param([switch]$OpenClaw)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskAdb = Join-Path $taskRoot 'artifacts\android-sdk\platform-tools\adb.exe'
$taskSerial = 'emulator-5580'
$taskRun = Join-Path $taskRoot ('artifacts\android-publisher\run-' + [Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $taskRun -Force | Out-Null
$taskReceiver = $null
function Invoke-Device([string[]]$DeviceArgs) {
    # Windows PowerShell 5.1 treats successful adb progress on stderr as an error.
    # Capture it, then decide success using adb's exit code.
    $taskPreviousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $taskResult = @(& $taskAdb -s $taskSerial @DeviceArgs 2>&1)
        $taskDeviceExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $taskPreviousErrorAction }
    if ($taskDeviceExit -ne 0) {
        $taskResult | Set-Content -LiteralPath (Join-Path $taskRun 'device-operation-error.txt') -Encoding utf8
        throw ('Owned emulator operation failed: ' + (($DeviceArgs | Select-Object -First 3) -join ' '))
    }
    return ($taskResult -join "`n")
}
function Invoke-AutomaticJob {
    $taskState = Invoke-Device @('shell','run-as','org.liveabit.publish','cat','files/sender.json') | ConvertFrom-Json
    $taskJobId = if ($taskState.next_job_id) { [string]$taskState.next_job_id } else { '310' }
    return Invoke-Device @('shell','cmd','jobscheduler','run','-f','org.liveabit.publish',$taskJobId)
}
function Read-PublisherState {
    return (Invoke-Device @('shell','run-as','org.liveabit.publish','cat','files/sender.json') | ConvertFrom-Json)
}
function Read-PublisherJob([int]$JobId) {
    # Some Android builds return a nonzero shell exit for an absent job. That is
    # the expected state before BOOT_COMPLETED and while sharing is stopped.
    $taskPreviousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $taskJobOutput = @(& $taskAdb -s $taskSerial shell cmd jobscheduler get-job-state org.liveabit.publish ([string]$JobId) 2>&1)
        $taskJobExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $taskPreviousErrorAction }
    $taskJobText = $taskJobOutput -join "`n"
    if ($taskJobExit -ne 0 -and $taskJobText -notmatch '\bunknown\b') { throw 'Owned publisher job state could not be read.' }
    return $taskJobText
}
function Restart-OwnedEmulator([string]$Label) {
    $taskBootBefore = [int](Invoke-Device @('shell','settings','get','global','boot_count')).Trim()
    Invoke-Device @('reboot') | Out-Null
    $taskBootWait = [Diagnostics.Stopwatch]::StartNew()
    $taskBootAfter = $taskBootBefore
    $taskBootReady = $false
    while ($taskBootWait.Elapsed.TotalSeconds -lt 180) {
        $taskPreviousErrorAction = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $taskOnline = @(& $taskAdb -s $taskSerial get-state 2>&1)
            $taskOnlineExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $taskPreviousErrorAction }
        if ($taskOnlineExit -eq 0 -and ($taskOnline -join '').Trim() -eq 'device') {
            try {
                $taskBootAfter = [int](Invoke-Device @('shell','settings','get','global','boot_count')).Trim()
                if ($taskBootAfter -gt $taskBootBefore -and (Invoke-Device @('shell','getprop','sys.boot_completed')).Trim() -eq '1') {
                    $taskBootReady = $true; break
                }
            } catch { # The transport can reconnect before Android services finish starting.
            }
        }
        Start-Sleep -Seconds 1
    }
    if (-not $taskBootReady) { throw "Owned emulator $Label reboot did not finish within three minutes." }
    if ((Invoke-Device @('emu','avd','name')).Split("`n")[0].Trim() -ne 'liveabit-api35-test') { throw 'Reboot reconnected to an unexpected emulator.' }
    # The owned emulator has no PIN. Unlocking delivers BOOT_COMPLETED for ordinary credential-protected storage.
    Invoke-Device @('shell','input','keyevent','KEYCODE_WAKEUP') | Out-Null
    Invoke-Device @('shell','wm','dismiss-keyguard') | Out-Null
    @{ real_reboot=$true; boot_before=$taskBootBefore; boot_after=$taskBootAfter; manually_opened_publisher=$false } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRun ("reboot-$Label.json")) -Encoding utf8
}
function Assert-PublisherNotResumed {
    $taskActivities = Invoke-Device @('shell','dumpsys','activity','activities')
    if (($taskActivities -split "`n" | Where-Object { $_ -match '(mResumedActivity|topResumedActivity)' }) -match 'org\.liveabit\.publish') {
        throw 'Publisher activity was manually or automatically opened during the reboot check.'
    }
}
function Assert-SavedConfiguration($Before, $After) {
    foreach ($taskField in @('url','key','agent_id','packages','send_minutes','screen_off_minutes','alert_minutes','stream_id','recipient_id','subscription_id','scope_revision')) {
        $taskExpected = $Before.$taskField | ConvertTo-Json -Compress -Depth 4
        $taskActual = $After.$taskField | ConvertTo-Json -Compress -Depth 4
        if ($taskExpected -cne $taskActual) { throw "Real reboot changed saved configuration: $taskField" }
    }
}
try {
    if ((Invoke-Device @('emu','avd','name')).Split("`n")[0].Trim() -ne 'liveabit-api35-test') { throw 'Only the project test emulator may be used.' }
    if ((Invoke-Device @('shell','getprop','sys.boot_completed')).Trim() -ne '1') { throw 'Project emulator is not ready.' }
    $taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $taskNode = if ($taskNodeCommand) { $taskNodeCommand.Source } else {
        Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    }
    if (-not (Test-Path -LiteralPath $taskNode)) { throw 'Node.js is required to run the desktop test receiver.' }
    $taskReceiverDirectory = Join-Path $taskRun 'receiver'
    $taskReceiverScript = Join-Path $taskRoot 'scripts\run-android-test-receiver.mjs'
    $taskReceiver = Start-Process -FilePath $taskNode -ArgumentList @(('"' + $taskReceiverScript + '"'), ('"' + $taskReceiverDirectory + '"')) -WindowStyle Hidden -PassThru -WorkingDirectory $taskRoot -RedirectStandardOutput (Join-Path $taskRun 'receiver-stdout.txt') -RedirectStandardError (Join-Path $taskRun 'receiver-stderr.txt')
    $taskConnection = Join-Path $taskReceiverDirectory 'connection.json'
    for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
        if (Test-Path -LiteralPath $taskConnection) { break }
        if ($taskReceiver.HasExited) { throw 'Isolated receiver did not start. Read receiver-stderr.txt.' }
        Start-Sleep -Milliseconds 200
    }
    if (-not (Test-Path -LiteralPath $taskConnection)) { throw 'Isolated receiver setup was not created.' }
    $taskConfig = Get-Content -LiteralPath $taskConnection -Raw | ConvertFrom-Json
    $taskApk = Join-Path $taskRoot 'artifacts\android-publisher\liveabit-sender-0.10.0-poc.apk'
    $taskTests = Join-Path $taskRoot 'android\publisher-app\build\outputs\apk\androidTest\debug\publisher-app-debug-androidTest.apk'
    Invoke-Device @('install','-r',$taskApk) | Out-Null
    Invoke-Device @('install','-r',$taskTests) | Out-Null
    Invoke-Device @('install','-r',(Join-Path $taskRoot 'artifacts\android-local-inspector\liveabit-lifecycle-fixture-0.1.0.apk')) | Out-Null
    Invoke-Device @('shell','pm','clear','org.liveabit.publish') | Out-Null
    Invoke-Device @('shell','appops','set','org.liveabit.publish','GET_USAGE_STATS','allow') | Out-Null
    Invoke-Device @('shell','pm','grant','org.liveabit.publish','android.permission.POST_NOTIFICATIONS') | Out-Null
    $taskInstalled = (Invoke-Device @('shell','pm','path','org.liveabit.publish')).Trim().Substring(8)
    Invoke-Device @('pull',$taskInstalled,(Join-Path $taskRun 'installed-sender.apk')) | Out-Null
    $taskHash = (Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash.ToLowerInvariant()
    if ((Get-FileHash -LiteralPath (Join-Path $taskRun 'installed-sender.apk') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskHash) { throw 'Installed APK differs from the trial candidate.' }
    Invoke-Device @('shell','am','start','-W','-n','org.liveabit.fixture/.MainActivity') | Out-Null
    Start-Sleep -Seconds 2
    Invoke-Device @('shell','am','start','-W','-n','org.liveabit.publish/.MainActivity') | Out-Null
    Start-Sleep -Seconds 1
    $taskResult = Invoke-Device @('shell','am','instrument','-w','-r','-e','endpoint',$taskConfig.emulator_events_url,
        '-e','key',$taskConfig.token,'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
    $taskResult | Set-Content -LiteralPath (Join-Path $taskRun 'native-tests.txt') -Encoding utf8
    if ($taskResult -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Android-native sender checks failed. Read native-tests.txt.' }
    $taskChecks = ([regex]::Match($taskResult,'INSTRUMENTATION_RESULT: checks=(.+)')).Groups[1].Value.Trim().Split(';')
    foreach ($taskPhase in @('receiver_continuity','adaptive','continuity','meaningful_delivery','connection_probe','setup_connection','ui_pages')) {
        $taskAdaptive = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase',$taskPhase,
            '-e','endpoint',$taskConfig.emulator_events_url,'-e','key',$taskConfig.token,
            'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
        $taskAdaptive | Set-Content -LiteralPath (Join-Path $taskRun ($taskPhase + '.txt')) -Encoding utf8
        if ($taskAdaptive -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw "Native $taskPhase checks failed." }
        $taskChecks += ([regex]::Match($taskAdaptive,'INSTRUMENTATION_RESULT: checks=(.+)')).Groups[1].Value.Trim().Split(';')
    }
    foreach ($taskPage in @('activity','setup','settings')) {
        Invoke-Device @('pull',('/sdcard/Android/data/org.liveabit.publish/cache/' + $taskPage + '-screen.png'),(Join-Path $taskRun ($taskPage + '-screen.png'))) | Out-Null
    }
    Invoke-Device @('push',(Join-Path $taskReceiverDirectory 'android-emulator-setup.json'),'/sdcard/Download/liveabit-emulator-setup.json') | Out-Null
    $taskImport = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','file_import',
        '-e','endpoint',$taskConfig.emulator_events_url,'-e','key',$taskConfig.token,
        'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
    $taskImport | Set-Content -LiteralPath (Join-Path $taskRun 'file-import.txt') -Encoding utf8
    if ($taskImport -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Android document picker import failed.' }
    $taskChecks += 'actual_android_document_picker_imports_receiver_setup'
    $taskJobSetup = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','job_setup',
        '-e','endpoint',$taskConfig.emulator_events_url,'-e','key',$taskConfig.token,
        'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
    $taskJobSetup | Set-Content -LiteralPath (Join-Path $taskRun 'job-setup.txt') -Encoding utf8
    if ($taskJobSetup -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Android background job setup failed.' }
    $taskModeUrl = $taskConfig.emulator_events_url -replace 'http://10.0.2.2:', 'http://127.0.0.1:' -replace '/events$', '/api/mode'
    $taskHeaders = @{Authorization=('Bearer ' + $taskConfig.token)}
    Invoke-RestMethod -Uri $taskModeUrl -Method Post -Headers $taskHeaders -ContentType 'application/json' -Body '{"mode":"no_acknowledgement"}' | Out-Null
    Invoke-Device @('shell','am','start','-W','-n','org.liveabit.fixture/.MainActivity') | Out-Null
    Start-Sleep -Seconds 1
    Invoke-Device @('shell','am','start','-W','-n','org.liveabit.publish/.MainActivity') | Out-Null
    Invoke-AutomaticJob | Set-Content -LiteralPath (Join-Path $taskRun 'job-run.txt') -Encoding utf8
    $taskBeforeRestart = $null
    for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
        Start-Sleep -Seconds 1
        $taskBeforeRestart = Invoke-Device @('shell','run-as','org.liveabit.publish','cat','files/sender.json') | ConvertFrom-Json
        if ($taskBeforeRestart.pending.Count -gt 0 -and $taskBeforeRestart.failure_since -gt 0) { break }
    }
    if ($taskBeforeRestart.pending.Count -lt 1 -or $taskBeforeRestart.failure_since -le 0) { throw 'No pending activity before restart check.' }
    Invoke-Device @('shell','am','force-stop','org.liveabit.publish') | Out-Null
    Invoke-Device @('shell','am','start','-W','-n','org.liveabit.publish/.MainActivity') | Out-Null
    $taskRestored = Invoke-Device @('shell','run-as','org.liveabit.publish','cat','files/sender.json') | ConvertFrom-Json
    if (-not $taskRestored.enabled -or $taskRestored.stream_id -ne $taskBeforeRestart.stream_id -or $taskRestored.pending.Count -lt 1 -or
        $taskRestored.pending[0].body -ne $taskBeforeRestart.pending[0].body -or $taskRestored.failure_since -ne $taskBeforeRestart.failure_since) {
        throw 'Reopening changed the retained delivery session.'
    }
    Invoke-Device @('shell','cmd','jobscheduler','get-job-state','org.liveabit.publish',([string]$taskRestored.next_job_id)) | Set-Content -LiteralPath (Join-Path $taskRun 'restored-automatic-job.txt') -Encoding utf8
    Invoke-Device @('shell','cmd','jobscheduler','get-job-state','org.liveabit.publish','311') | Set-Content -LiteralPath (Join-Path $taskRun 'restored-warning-job.txt') -Encoding utf8
    $taskChecks += 'force_stop_reopen_restores_jobs_and_preserves_pending_session'
    # A restored periodic job can already be active. A forced run in that state
    # does not dispatch a second job, so wait for its real completion first.
    $taskJobIdle = $false
    for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
        $taskCurrent = Invoke-Device @('shell','run-as','org.liveabit.publish','cat','files/sender.json') | ConvertFrom-Json
        $taskJobState = Invoke-Device @('shell','cmd','jobscheduler','get-job-state','org.liveabit.publish',([string]$taskCurrent.next_job_id))
        if ($taskJobState -notmatch '\bactive\b') { $taskJobIdle = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $taskJobIdle) { throw 'Restored Android delivery job did not finish before recovery.' }
    Invoke-RestMethod -Uri $taskModeUrl -Method Post -Headers $taskHeaders -ContentType 'application/json' -Body '{"mode":"acknowledge"}' | Out-Null
    Invoke-AutomaticJob |
        Set-Content -LiteralPath (Join-Path $taskRun 'recovery-job-run.txt') -Encoding utf8
    $taskState = $null
    for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
        Start-Sleep -Seconds 1
        $taskState = Invoke-Device @('shell','run-as','org.liveabit.publish','cat','files/sender.json') | ConvertFrom-Json
        if ($taskState.last_ack -gt 0 -and $taskState.pending.Count -eq 0) { break }
    }
    if ($taskState.last_ack -le 0 -or $taskState.pending.Count -ne 0) { throw 'Real JobScheduler send was not acknowledged.' }
    $taskChecks += 'actual_android_jobscheduler_delivery'
    $taskView = Invoke-Device @('shell','uiautomator','dump','/sdcard/liveabit-publisher-ui.xml')
    Invoke-Device @('pull','/sdcard/liveabit-publisher-ui.xml',(Join-Path $taskRun 'connection-screen.xml')) | Out-Null
    $taskUi = Get-Content -LiteralPath (Join-Path $taskRun 'connection-screen.xml') -Raw
    if ($taskUi -notmatch 'liveabit' -or $taskUi -notmatch 'Activity' -or $taskUi -notmatch 'Setup' -or $taskUi -notmatch 'Settings' -or
        $taskUi -match 'Connection key') { throw 'Android Activity tabs or separation were not rendered.' }
    $taskChecks += 'rendered_android_activity_screen_with_separate_setup_settings'
    Invoke-Device @('shell','pm','revoke','org.liveabit.publish','android.permission.POST_NOTIFICATIONS') | Out-Null
    $taskWarnings = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','warnings_blocked',
        'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
    $taskWarnings | Set-Content -LiteralPath (Join-Path $taskRun 'warnings-blocked.txt') -Encoding utf8
    if ($taskWarnings -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Disabled receiver warnings were not detected.' }
    $taskChecks += 'denied_notification_permission_is_reported'
    Invoke-Device @('shell','pm','grant','org.liveabit.publish','android.permission.POST_NOTIFICATIONS') | Out-Null
    $taskHookContract = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','openclaw_contract',
        'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
    $taskHookContract | Set-Content -LiteralPath (Join-Path $taskRun 'openclaw-contract.txt') -Encoding utf8
    if ($taskHookContract -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Native OpenClaw delivery checks failed.' }
    $taskChecks += ([regex]::Match($taskHookContract,'INSTRUMENTATION_RESULT: checks=(.+)')).Groups[1].Value.Trim().Split(';')
    $taskLiveRunId = $null
    if ($OpenClaw) {
        $taskHookSetup = Get-Content -LiteralPath (Join-Path $taskRoot 'artifacts\openclaw\android-emulator-setup.json') -Raw | ConvertFrom-Json
        if ($taskHookSetup.format -ne 'liveabit.openclaw.connection.v1' -or $taskHookSetup.agent_id -notmatch '^[a-z0-9][a-z0-9_-]{0,63}$') { throw 'Configure the OpenClaw connection first.' }
        $taskLiveHook = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','openclaw_live',
            '-e','endpoint',$taskHookSetup.url,'-e','key',$taskHookSetup.key,'-e','agent',$taskHookSetup.agent_id,
            'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
        $taskLiveHook | Set-Content -LiteralPath (Join-Path $taskRun 'openclaw-live.txt') -Encoding utf8
        if ($taskLiveHook -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Installed OpenClaw did not accept the Android observation.' }
        $taskChecks += ([regex]::Match($taskLiveHook,'INSTRUMENTATION_RESULT: checks=(.+)')).Groups[1].Value.Trim().Split(';')
        $taskLiveState = Invoke-Device @('shell','run-as','org.liveabit.publish','cat','files/sender.json') | ConvertFrom-Json
        $taskLiveRunId = $taskLiveState.last_run_id
    }
    # Test both saved choices using real reboots, without opening the publisher or invoking
    # instrumentation between boot and the direct state/job checks. The receiver remains isolated.
    Invoke-RestMethod -Uri $taskModeUrl -Method Post -Headers $taskHeaders -ContentType 'application/json' -Body '{"mode":"no_acknowledgement"}' | Out-Null
    Invoke-Device @('shell','am','start','-W','-n','org.liveabit.fixture/.MainActivity') | Out-Null
    Start-Sleep -Seconds 3
    $taskRebootOn = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','reboot_on_setup',
        '-e','endpoint',$taskConfig.emulator_events_url,'-e','key',$taskConfig.token,
        'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
    $taskRebootOn | Set-Content -LiteralPath (Join-Path $taskRun 'reboot-on-setup.txt') -Encoding utf8
    if ($taskRebootOn -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Native enabled reboot preparation failed.' }
    $taskChecks += ([regex]::Match($taskRebootOn,'INSTRUMENTATION_RESULT: checks=(.+)')).Groups[1].Value.Trim().Split(';')
    $taskOnBefore = Read-PublisherState
    foreach ($taskJob in @(310,311,313)) {
        if ((Read-PublisherJob $taskJob) -notmatch '\bunknown\b') { throw 'A publisher job remained before the enabled reboot.' }
    }
    Restart-OwnedEmulator 'sharing-on'
    $taskJobsRestored = $false
    for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
        $taskOnAfter = Read-PublisherState
        $taskAutomaticJob = Read-PublisherJob ([int]$taskOnAfter.next_job_id)
        $taskWarningJob = Read-PublisherJob 311
        if ($taskAutomaticJob -notmatch '\bunknown\b' -and $taskWarningJob -notmatch '\bunknown\b') { $taskJobsRestored = $true; break }
        Start-Sleep -Seconds 1
    }
    Assert-PublisherNotResumed
    Assert-SavedConfiguration $taskOnBefore $taskOnAfter
    if (-not $taskOnAfter.enabled -or $taskOnAfter.pending.Count -ne $taskOnBefore.pending.Count -or
        $taskOnAfter.sequence -ne $taskOnBefore.sequence -or $taskOnAfter.cursor -ne $taskOnBefore.cursor -or
        $taskOnAfter.failure_since -ne $taskOnBefore.failure_since -or $taskOnAfter.failure_elapsed -ne $taskOnBefore.failure_elapsed) {
        throw 'Enabled reboot changed the retained observation session or outage timer.'
    }
    for ($taskItem = 0; $taskItem -lt $taskOnBefore.pending.Count; $taskItem++) {
        if ($taskOnAfter.pending[$taskItem].event_id -cne $taskOnBefore.pending[$taskItem].event_id -or
            $taskOnAfter.pending[$taskItem].body -cne $taskOnBefore.pending[$taskItem].body) { throw 'Reboot rewrote meaningful pending activity.' }
    }
    $taskChecks += 'real_reboot_preserves_enabled_connection_timing_selection_queue_identity_bytes_and_outage'
    if (-not $taskJobsRestored) { throw 'BOOT_COMPLETED did not restore automatic delivery and outage jobs.' }
    $taskChecks += 'real_boot_restores_cancelled_delivery_and_outage_jobs_without_opening_publisher'
    Invoke-RestMethod -Uri $taskModeUrl -Method Post -Headers $taskHeaders -ContentType 'application/json' -Body '{"mode":"acknowledge"}' | Out-Null
    Invoke-AutomaticJob | Set-Content -LiteralPath (Join-Path $taskRun 'reboot-recovery-job.txt') -Encoding utf8
    for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
        Start-Sleep -Seconds 1
        $taskRebootDelivered = Read-PublisherState
        if ($taskRebootDelivered.last_ack -gt $taskOnBefore.last_ack -and $taskRebootDelivered.pending.Count -eq 0) { break }
    }
    if ($taskRebootDelivered.last_ack -le $taskOnBefore.last_ack -or $taskRebootDelivered.pending.Count -ne 0 -or $taskRebootDelivered.failure_since -ne 0) {
        throw 'Actual post-reboot Android job did not acknowledge retained activity.'
    }
    Assert-PublisherNotResumed
    $taskEventsUrl = $taskModeUrl -replace '/api/mode$', '/api/events'
    $taskRebootRecords = Invoke-RestMethod -Uri $taskEventsUrl -Headers $taskHeaders
    foreach ($taskOriginal in $taskOnBefore.pending) {
        $taskOriginalRecord = @($taskRebootRecords.events | Where-Object { $_.event.event_id -eq $taskOriginal.event_id })
        $taskHasher = [Security.Cryptography.SHA256]::Create()
        try { $taskOriginalHash = ([BitConverter]::ToString($taskHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskOriginal.body)))).Replace('-','').ToLowerInvariant() }
        finally { $taskHasher.Dispose() }
        if ($taskOriginalRecord.Count -ne 1 -or $taskOriginalRecord[0].body_sha256 -cne $taskOriginalHash) { throw 'Post-reboot receiver identity or canonical bytes differed.' }
    }
    $taskChecks += 'actual_post_reboot_job_acknowledges_original_pending_event_with_encrypted_connection'
    $taskRebootOff = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','reboot_off_setup',
        '-e','endpoint',$taskConfig.emulator_events_url,'-e','key',$taskConfig.token,
        'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
    $taskRebootOff | Set-Content -LiteralPath (Join-Path $taskRun 'reboot-off-setup.txt') -Encoding utf8
    if ($taskRebootOff -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Native stopped reboot preparation failed.' }
    $taskChecks += ([regex]::Match($taskRebootOff,'INSTRUMENTATION_RESULT: checks=(.+)')).Groups[1].Value.Trim().Split(';')
    $taskOffBefore = Read-PublisherState
    $taskOffRecordsBefore = Invoke-RestMethod -Uri $taskEventsUrl -Headers $taskHeaders
    Restart-OwnedEmulator 'sharing-off'
    Start-Sleep -Seconds 5
    $taskOffAfter = Read-PublisherState
    Assert-SavedConfiguration $taskOffBefore $taskOffAfter
    Assert-PublisherNotResumed
    if ($taskOffAfter.enabled -or $taskOffAfter.pending.Count -ne 0 -or $taskOffAfter.failure_since -ne 0) { throw 'Stopped sharing became active after reboot.' }
    foreach ($taskJob in @(310,311,313)) {
        if ((Read-PublisherJob $taskJob) -notmatch '\bunknown\b') { throw 'Stopped sharing scheduled a job after reboot.' }
    }
    $taskOffRecordsAfter = Invoke-RestMethod -Uri $taskEventsUrl -Headers $taskHeaders
    if ($taskOffRecordsAfter.events.Count -ne $taskOffRecordsBefore.events.Count) { throw 'Stopped sharing sent activity after reboot.' }
    $taskChecks += 'real_reboot_keeps_stopped_sharing_off_and_preserves_setup_without_jobs_or_packets'
    $taskRebootRestore = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','reboot_restore',
        'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
    $taskRebootRestore | Set-Content -LiteralPath (Join-Path $taskRun 'reboot-restore-original.txt') -Encoding utf8
    if ($taskRebootRestore -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Private reboot fixture configuration was not restored.' }
    $taskReport = [ordered]@{ result='pass'; generated_at=[DateTime]::UtcNow.ToString('o');
        platform='Android 15/API 35'; serial=$taskSerial; avd='liveabit-api35-test'; apk_sha256=$taskHash;
        receiver_isolated=$true; receiver_directory=$taskReceiverDirectory; receiver_port=([Uri]$taskConfig.desktop_url).Port;
        checks=$taskChecks; check_count=$taskChecks.Count; real_android_usage_query=$true; real_http_receiver=$true;
        real_notification_with_one_minute_user_setting=$true; default_warning_minutes=60;
        default_send_minutes=5; default_screen_off_minutes=15; adaptive_screen_power_and_network_tested=$true;
        foreground_continuity_and_actual_uninterrupted_use_tested=$true;
        native_activity_setup_settings_tested=$true; one_off_jobs_tested=$true;
        boot_on_off_real_reboots_tested=$true; real_reboot_count=2;
        boot_restoration_without_persisted_jobs_or_activity_launch_tested=$true;
        pending_identity_and_encrypted_connection_survive_real_reboot=$true;
        openclaw_native_contract_tested=$true; installed_openclaw_admission_tested=[bool]$OpenClaw; openclaw_run_id=$taskLiveRunId;
        production_grok_tested=$false; physical_phone_tested=$false;
        limits=@('One project emulator and local final receiver. No Grok account or real personal activity.',
            'One-minute real-time notification tested; default one-hour value checked rather than waiting an hour.',
            'JobScheduler delivery force-triggered; exact background timing and battery behavior remain OS-dependent.',
            'Real reboot checks unlock an Android 15 emulator without a PIN; force-stop still requires the user to reopen the app, as enforced by Android.',
            'Screen-off suppression exercised with a one-minute setting and real screen power; fifteen-minute default checked without waiting fifteen minutes.') }
    $taskReport | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskRun 'validation.json') -Encoding utf8
    Write-Output "PASS: $($taskChecks.Count) real Android sender checks; report: $taskRun\validation.json"
} catch {
    @{ result='fail'; generated_at=[DateTime]::UtcNow.ToString('o'); reason=$_.Exception.Message } | ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $taskRun 'validation.json') -Encoding utf8
    throw
} finally {
    if ($null -ne $taskReceiver -and -not $taskReceiver.HasExited) {
        $taskReceiver.Kill()
        $taskReceiver.WaitForExit(5000) | Out-Null
    }
    if ($null -ne $taskReceiver) {
        @{ receiver_pid=$taskReceiver.Id; receiver_stopped=$taskReceiver.HasExited; user_receiver_controlled=$false } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRun 'receiver-cleanup.json') -Encoding utf8
    }
}
