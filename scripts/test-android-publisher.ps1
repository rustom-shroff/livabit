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
    $taskApk = Join-Path $taskRoot 'artifacts\android-publisher\liveabit-sender-0.4.0-poc.apk'
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
    Invoke-Device @('shell','am','start','-W','-n','org.liveabit.publish/.MainActivity') | Out-Null
    Invoke-Device @('shell','cmd','jobscheduler','run','-f','org.liveabit.publish','310') | Set-Content -LiteralPath (Join-Path $taskRun 'job-run.txt') -Encoding utf8
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
    Invoke-Device @('shell','cmd','jobscheduler','get-job-state','org.liveabit.publish','310') | Set-Content -LiteralPath (Join-Path $taskRun 'restored-periodic-job.txt') -Encoding utf8
    Invoke-Device @('shell','cmd','jobscheduler','get-job-state','org.liveabit.publish','311') | Set-Content -LiteralPath (Join-Path $taskRun 'restored-warning-job.txt') -Encoding utf8
    $taskChecks += 'force_stop_reopen_restores_jobs_and_preserves_pending_session'
    # A restored periodic job can already be active. A forced run in that state
    # does not dispatch a second job, so wait for its real completion first.
    $taskJobIdle = $false
    for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
        $taskJobState = Invoke-Device @('shell','cmd','jobscheduler','get-job-state','org.liveabit.publish','310')
        if ($taskJobState -notmatch '\bactive\b') { $taskJobIdle = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $taskJobIdle) { throw 'Restored Android delivery job did not finish before recovery.' }
    Invoke-RestMethod -Uri $taskModeUrl -Method Post -Headers $taskHeaders -ContentType 'application/json' -Body '{"mode":"acknowledge"}' | Out-Null
    Invoke-Device @('shell','cmd','jobscheduler','run','-f','org.liveabit.publish','310') |
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
    if ($taskUi -notmatch 'liveabit' -or $taskUi -notmatch 'Connect over Wi-Fi' -or $taskUi -notmatch 'Connect by USB') { throw 'Android connection guides were not visible.' }
    $taskChecks += 'rendered_android_connection_screen'
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
        if ($taskHookSetup.format -ne 'liveabit.openclaw.connection.v1' -or $taskHookSetup.agent_id -ne 'liveabit') { throw 'Configure the dedicated OpenClaw agent first.' }
        $taskLiveHook = Invoke-Device @('shell','am','instrument','-w','-r','-e','phase','openclaw_live',
            '-e','endpoint',$taskHookSetup.url,'-e','key',$taskHookSetup.key,
            'org.liveabit.publish.test/org.liveabit.publish.PublisherInstrumentation')
        $taskLiveHook | Set-Content -LiteralPath (Join-Path $taskRun 'openclaw-live.txt') -Encoding utf8
        if ($taskLiveHook -notmatch 'INSTRUMENTATION_RESULT: result=PASS') { throw 'Installed OpenClaw did not accept the Android observation.' }
        $taskChecks += ([regex]::Match($taskLiveHook,'INSTRUMENTATION_RESULT: checks=(.+)')).Groups[1].Value.Trim().Split(';')
        $taskLiveState = Invoke-Device @('shell','run-as','org.liveabit.publish','cat','files/sender.json') | ConvertFrom-Json
        $taskLiveRunId = $taskLiveState.last_run_id
    }
    $taskReport = [ordered]@{ result='pass'; generated_at=[DateTime]::UtcNow.ToString('o');
        platform='Android 15/API 35'; serial=$taskSerial; avd='liveabit-api35-test'; apk_sha256=$taskHash;
        receiver_isolated=$true; receiver_directory=$taskReceiverDirectory; receiver_port=([Uri]$taskConfig.desktop_url).Port;
        checks=$taskChecks; check_count=$taskChecks.Count; real_android_usage_query=$true; real_http_receiver=$true;
        real_notification_with_one_minute_user_setting=$true; default_warning_minutes=60;
        openclaw_native_contract_tested=$true; installed_openclaw_admission_tested=[bool]$OpenClaw; openclaw_run_id=$taskLiveRunId;
        production_grok_tested=$false; physical_phone_tested=$false;
        limits=@('One project emulator and local final receiver. No Grok account or real personal activity.',
            'One-minute real-time notification tested; default one-hour value checked rather than waiting an hour.',
            'JobScheduler delivery force-triggered; exact background timing and battery behavior remain OS-dependent.') }
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
