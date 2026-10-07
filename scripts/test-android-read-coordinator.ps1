param([string]$JdkPath)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $JdkPath) { $JdkPath = Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1' }
$taskJdk = [IO.Path]::GetFullPath($JdkPath)
$taskRun = Join-Path $taskRoot ('artifacts\android-read-coordinator-test\run-' + [Guid]::NewGuid().ToString('N'))
$taskClasses = Join-Path $taskRun 'coordinator-classes'
$taskAppClasses = Join-Path $taskRun 'application-host-classes'
$taskReportPath = Join-Path $taskRun 'validation.json'
New-Item -ItemType Directory -Path $taskClasses, $taskAppClasses | Out-Null
$taskExecutions = [System.Collections.Generic.List[object]]::new()

function Invoke-BoundedJdk([string]$Executable, [string[]]$Arguments) {
    $taskStart = [Diagnostics.ProcessStartInfo]::new()
    $taskStart.FileName = $Executable
    $taskStart.WorkingDirectory = $taskRoot
    $taskStart.UseShellExecute = $false
    $taskStart.CreateNoWindow = $true
    $taskStart.RedirectStandardOutput = $true
    $taskStart.RedirectStandardError = $true
    foreach ($taskArg in $Arguments) { $taskStart.ArgumentList.Add($taskArg) }
    $taskProcess = [Diagnostics.Process]::new()
    $taskProcess.StartInfo = $taskStart
    $taskStartedAt = [DateTime]::UtcNow.ToString('o')
    try {
        if (-not $taskProcess.Start()) { throw 'The pinned JDK process did not start.' }
        $taskStdout = $taskProcess.StandardOutput.ReadToEndAsync()
        $taskStderr = $taskProcess.StandardError.ReadToEndAsync()
        if (-not $taskProcess.WaitForExit(60000)) {
            $taskProcess.Kill($true)
            if (-not $taskProcess.WaitForExit(5000)) { throw 'Timed-out host process cleanup did not finish.' }
            throw 'The host compiler or fixture exceeded its 60-second bound.'
        }
        $taskOutput = $taskStdout.GetAwaiter().GetResult()
        $taskErrors = $taskStderr.GetAwaiter().GetResult()
        if ($taskOutput.Length -gt 1048576 -or $taskErrors.Length -gt 1048576) { throw 'Host fixture output exceeded its bound.' }
        $taskRecord = [ordered]@{
            executable=[IO.Path]::GetRelativePath($taskRoot,$Executable).Replace('\','/'); argv=@($Arguments)
            started_at=$taskStartedAt; finished_at=[DateTime]::UtcNow.ToString('o')
            exit_code=$taskProcess.ExitCode; stdout=$taskOutput; stderr=$taskErrors; timeout_millis=60000
        }
        $taskExecutions.Add($taskRecord)
        if ($taskProcess.ExitCode -ne 0 -or $taskErrors -match '(?i)compiler resources|an exception has occurred in the compiler|Exception in thread') {
            throw 'A host compile or fixture did not complete cleanly.'
        }
        return $taskOutput
    } finally { $taskProcess.Dispose() }
}

function Get-BoundHashes([string[]]$Files) {
    $taskHashes = [ordered]@{}
    foreach ($taskFile in ($Files | Sort-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $taskFile -PathType Leaf)) { throw 'An explicit host source or JDK binding is missing.' }
        $taskRelative = [IO.Path]::GetRelativePath($taskRoot,$taskFile).Replace('\','/')
        $taskHashes[$taskRelative] = (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    return $taskHashes
}

$taskAppPrefix = 'android/app/src/main/java/org/liveabit/inspect/'
$taskTestPrefix = 'android/read-coordinator-host/src/test/java/org/liveabit/inspect/'
$taskStubPrefix = 'android/read-coordinator-host/src/testSupport/java/'
$taskCommon = @('ProcessReadCoordinator.java','ForegroundReadAuthority.java' | ForEach-Object { Join-Path $taskRoot ($taskAppPrefix + $_) })
$taskCore = Join-Path $taskRoot 'android/collector-core/src/main/java/org/liveabit/collector/core/LocalInspectionCore.java'
$taskCoordinatorTest = Join-Path $taskRoot ($taskTestPrefix + 'ProcessReadCoordinatorTest.java')
$taskApplication = Join-Path $taskRoot ($taskAppPrefix + 'LocalInspectionApplication.java')
$taskApplicationTest = Join-Path $taskRoot ($taskTestPrefix + 'ApplicationReadIntegrationTest.java')
$taskStubs = @('android/app/Application.java','android/app/AppOpsManager.java','android/os/Looper.java','android/os/Handler.java',
    'android/os/SystemClock.java','org/liveabit/inspect/AndroidUsageSource.java','org/liveabit/inspect/InspectionStore.java' |
    ForEach-Object { Join-Path $taskRoot ($taskStubPrefix + $_) })
$taskJava = Join-Path $taskJdk 'bin\java.exe'
$taskJavac = Join-Path $taskJdk 'bin\javac.exe'
$taskBindings = @($taskCommon) + @($taskCore,$taskCoordinatorTest,$taskApplication,$taskApplicationTest) + @($taskStubs) + @($PSCommandPath,$taskJava,$taskJavac,(Join-Path $taskJdk 'release'))
try {
    $taskBefore = Get-BoundHashes $taskBindings
    $taskCompilerVersion = Invoke-BoundedJdk $taskJavac @('-version')
    # The launcher writes the version to stderr; it is preserved by Invoke-BoundedJdk.
    $null = Invoke-BoundedJdk $taskJava @('-version')
    if ($taskCompilerVersion.Trim() -ne 'javac 17.0.20.1') { throw 'The host fixtures require the pinned JDK 17.0.20.1 compiler.' }
    $null = Invoke-BoundedJdk $taskJavac (@('-encoding','UTF-8','--release','17','-d',$taskClasses) + @($taskCommon) + @($taskCore,$taskCoordinatorTest))
    $taskPureText = Invoke-BoundedJdk $taskJava @('-ea','-cp',$taskClasses,'org.liveabit.inspect.ProcessReadCoordinatorTest')
    $taskPure = $taskPureText.Trim() | ConvertFrom-Json
    if (($taskPure.result -ne 'pass_host_read_coordinator_regressions' -or $taskPure.passed -ne 16 -or $taskPure.blocked_recreations -ne 80) -or
        ($taskPure.maximum_physical_reads -ne 1 -or $taskPure.queued_replacements -ne 0 -or $taskPure.android_runtime_verified -ne $false)) {
        throw 'The coordinator host fixture summary is missing or differs from the declared checks.'
    }
    $null = Invoke-BoundedJdk $taskJavac (@('-encoding','UTF-8','--release','17','-d',$taskAppClasses) + @($taskCommon) + @($taskCore,$taskApplication,$taskApplicationTest) + @($taskStubs))
    $taskAppText = Invoke-BoundedJdk $taskJava @('-ea','-cp',$taskAppClasses,'org.liveabit.inspect.ApplicationReadIntegrationTest')
    $taskApp = $taskAppText.Trim() | ConvertFrom-Json
    if (($taskApp.result -ne 'pass_exact_application_with_host_seams' -or $taskApp.passed -ne 8 -or $taskApp.blocked_recreations -ne 80) -or
        ($taskApp.android_runtime_verified -ne $false -or $taskApp.sqlite_verified -ne $false)) {
        throw 'The exact Application host fixture summary is missing or differs from the declared checks.'
    }
    $taskAfter = Get-BoundHashes $taskBindings
    if ($taskBefore.Count -ne $taskAfter.Count -or @($taskAfter.Keys | Where-Object { $taskBefore[$_] -ne $taskAfter[$_] }).Count) {
        throw 'A bound host fixture source or JDK changed during the run.'
    }
    $taskReport = [ordered]@{
        result='pass_process_read_coordinator_host'; generated_at=[DateTime]::UtcNow.ToString('o')
        scope='actual_coordinator_and_core_plus_exact_application_with_explicit_host_seams'
        coordinator=$taskPure; application_host_seams=$taskApp; source_and_jdk_sha256=$taskAfter; executions=$taskExecutions.ToArray()
        android_runtime_verified=$false; sqlite_verified=$false; apk_built=$false; device_accessed=$false
        limits=@('Application/Android lifecycle, Looper, UsageStatsManager and SQLite behavior are not verified by host substitutes.',
            'The physical bound covers the source call until it returns, independently of canceled authority; no hard OS-query cancellation is claimed.',
            'No queue, automatic replacement read, coverage, timing accuracy or production readiness claim.')
    }
    $taskReport | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskReportPath -Encoding utf8
    Write-Output ('PASS ProcessReadCoordinatorTest: 16 checks; Application host seams: 8 checks; report=' + [IO.Path]::GetRelativePath($taskRoot,$taskReportPath).Replace('\','/'))
} catch {
    [ordered]@{ result='fail_process_read_coordinator_host'; generated_at=[DateTime]::UtcNow.ToString('o'); scope='host_only';
        android_runtime_verified=$false; device_accessed=$false; executions=$taskExecutions.ToArray(); message=$_.Exception.Message } |
        ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskReportPath -Encoding utf8
    throw
}
