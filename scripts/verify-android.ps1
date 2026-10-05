param()
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskReportPath = Join-Path $taskRoot 'docs\review\android-local-inspector-validation.json'
$taskPending = @{ result='pending'; scope='native_local_only_build_and_jvm_fixtures'; generated_at=[DateTime]::UtcNow.ToString('o'); physical_device_tested=$false; m2_proven=$false; m3_proven=$false }
$taskPending | ConvertTo-Json | Set-Content -LiteralPath $taskReportPath -Encoding utf8
function Get-SourceHashes {
    $taskHashes = [ordered]@{}
    $taskFiles = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'android') -Recurse -File | Where-Object {
        $_.FullName -notmatch '[\\/](build|\.gradle)[\\/]' -and $_.Extension -in '.java','.xml','.gradle','.properties'
    })
    $taskFiles += Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*android*.ps1'
    $taskFiles += Get-Item -LiteralPath (Join-Path $taskRoot 'specs\android\local-inspector.md'), (Join-Path $taskRoot 'docs\decisions\0009-android-local-inspection-first.md')
    foreach ($taskFile in ($taskFiles | Sort-Object FullName)) {
        $taskRelative = [IO.Path]::GetRelativePath($taskRoot,$taskFile.FullName).Replace('\','/')
        $taskHashes[$taskRelative] = (Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    return $taskHashes
}
try {
    $taskBefore = Get-SourceHashes
    $taskCoreOutput = @(& (Join-Path $PSScriptRoot 'test-android-core.ps1'))
    $taskPasses = @($taskCoreOutput | Where-Object { $_ -match '^PASS ' }).Count
    if ($taskPasses -lt 1) { throw 'Native fixtures did not report executed checks.' }
    & (Join-Path $PSScriptRoot 'build-android.ps1')
    $taskApk = Join-Path $taskRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
    $taskAapt = Join-Path $taskRoot 'artifacts\android-sdk\build-tools\36.0.0\aapt2.exe'
    $taskPermissionsText = @(& $taskAapt dump permissions $taskApk)
    if ($LASTEXITCODE -ne 0) { throw 'The built APK permission audit failed.' }
    $taskPermissions = @($taskPermissionsText | ForEach-Object { if ($_ -match "uses-permission(?:-[\w-]+)?: name='([^']+)'") { $Matches[1] } })
    if ($taskPermissions.Count -ne 1 -or $taskPermissions[0] -ne 'android.permission.PACKAGE_USAGE_STATS') { throw 'The built APK has an unexpected permission surface.' }
    $taskBadging = @(& $taskAapt dump badging $taskApk)
    if ($LASTEXITCODE -ne 0 -or -not ($taskBadging -match "sdkVersion:'35'") -or -not ($taskBadging -match "targetSdkVersion:'37'")) { throw 'The built APK API bounds differ from the approved prototype.' }
    $taskApkDigest = (Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskSigner = Join-Path $taskRoot 'artifacts\android-sdk\build-tools\36.0.0\apksigner.bat'
    $taskPriorJava = $env:JAVA_HOME
    try {
        $env:JAVA_HOME = Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1'
        & $taskSigner verify $taskApk
        if ($LASTEXITCODE -ne 0) { throw 'APK signing verification failed.' }
    } finally { $env:JAVA_HOME = $taskPriorJava }
    $taskAfter = Get-SourceHashes
    $taskDrift = @($taskAfter.Keys | Where-Object { $taskBefore[$_] -ne $taskAfter[$_] })
    if ($taskDrift.Count -or $taskBefore.Count -ne $taskAfter.Count) { throw 'Source changed during Android verification.' }
    $taskLint = Join-Path $taskRoot 'android\app\build\reports\lint-results-debug.xml'
    [xml]$taskLintXml = Get-Content -Raw -LiteralPath $taskLint
    $taskLintErrors = @($taskLintXml.issues.issue | Where-Object { $_.severity -in 'Error','Fatal' })
    if ($taskLintErrors.Count) { throw 'Android lint has unresolved errors.' }
    $taskDelivered = Join-Path $taskRoot 'artifacts\android-local-inspector\liveabit-local-inspector-0.1.0.apk'
    New-Item -ItemType Directory -Force -Path (Split-Path $taskDelivered) | Out-Null
    Copy-Item -LiteralPath $taskApk -Destination $taskDelivered -Force
    $taskReport = [ordered]@{
        result='pass_with_device_limits'; generated_at=[DateTime]::UtcNow.ToString('o'); scope='native_local_only_build_and_jvm_fixtures'
        decision='docs/decisions/0009-android-local-inspection-first.md'; sdk_terms_accepted_by_user='2026-10-05'
        environment=@{ platform='Windows'; jdk='Temurin 17.0.20.1+1'; gradle='9.4.1'; agp='9.2.1'; sdk_platform='android-37.0 revision 2'; build_tools='36.0.0'; version_provenance='pinned_build_configuration_and_checksum_verified_tool_archives' }
        jvm_fixtures=@{ passed=$taskPasses; android_runtime_verified=$false }
        apk=@{ path='artifacts/android-local-inspector/liveabit-local-inspector-0.1.0.apk'; sha256=$taskApkDigest; signature_verified=$true; signing='local_debug_only'; min_sdk=35; target_sdk=37; permissions=$taskPermissions; internet_permission=$false }
        lint=@{ errors=0; warnings=@($taskLintXml.issues.issue | Where-Object { $_.severity -eq 'Warning' }).Count; report='android/app/build/reports/lint-results-debug.xml'; performed_by_this_run=$true }
        topology=@{ activity_delivery='absent'; agent_endpoint='absent'; background_collection=$false; observation_storage='process_ram'; persistent_storage='local_control_preferences_only' }
        input_drift=@(); source_sha256=$taskAfter; physical_device_tested=$false; emulator_tested=$false; m2_proven=$false; m3_proven=$false
        limits=@('APK build, permission/signature audit and JVM fixtures only; no Android runtime or device measurement.', 'System picker, OEM AppOps notifications, usage source and UI behavior require actual-device verification.', 'All duration estimates are unverified diagnostics; initial state and source completeness stay unknown.', 'No production publication, existing-agent integration, background timing, battery or accuracy quality claim.')
    }
    $taskReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $taskReportPath -Encoding utf8
    Write-Output "PASS: $taskPasses native core checks; APK built, signed and permission-audited; physical Android behavior remains unverified."
} catch {
    @{ result='fail'; scope='native_local_only_build_and_jvm_fixtures'; generated_at=[DateTime]::UtcNow.ToString('o'); physical_device_tested=$false; m2_proven=$false; m3_proven=$false; message='Android verification did not complete. No private diagnostic detail saved.' } | ConvertTo-Json | Set-Content -LiteralPath $taskReportPath -Encoding utf8
    throw
}
