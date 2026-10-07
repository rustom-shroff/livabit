param()
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskReportPath = Join-Path $taskRoot 'docs\review\android-local-inspector-validation.json'
$taskPending = @{ result='pending'; scope='native_local_only_build_and_jvm_fixtures'; generated_at=[DateTime]::UtcNow.ToString('o'); physical_device_tested_by_this_run=$false; m2_proven=$false; m3_proven=$false }
$taskPending | ConvertTo-Json | Set-Content -LiteralPath $taskReportPath -Encoding utf8
function Get-SourceHashes {
    $taskHashes = [ordered]@{}
    $taskFiles = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'android') -Recurse -File | Where-Object {
        $_.FullName -notmatch '[\\/](build|\.gradle)[\\/]' -and $_.Extension -in '.java','.xml','.gradle','.properties'
    })
    $taskFiles += Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*android*.ps1'
    $taskFiles += Get-Item -LiteralPath (Join-Path $taskRoot 'specs\android\local-inspector.md'), (Join-Path $taskRoot 'specs\android\lifecycle-fixture.md'), (Join-Path $taskRoot 'docs\decisions\0009-android-local-inspection-first.md')
    foreach ($taskFile in ($taskFiles | Sort-Object FullName)) {
        $taskRelative = [IO.Path]::GetRelativePath($taskRoot,$taskFile.FullName).Replace('\','/')
        $taskHashes[$taskRelative] = (Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    return $taskHashes
}
function Audit-Apk([string]$Module, [string]$PackageId, [string]$VersionName, [string[]]$ExpectedPermissions, [string]$Filename) {
    $taskApk = Join-Path $taskRoot ("android\$Module\build\outputs\apk\debug\$Module-debug.apk")
    $taskAapt = Join-Path $taskRoot 'artifacts\android-sdk\build-tools\36.0.0\aapt2.exe'
    $taskPermissionText = @(& $taskAapt dump permissions $taskApk)
    if ($LASTEXITCODE -ne 0) { throw 'The built APK permission audit failed.' }
    $taskPermissions = @($taskPermissionText | ForEach-Object { if ($_ -match "uses-permission(?:-[\w-]+)?: name='([^']+)'") { $Matches[1] } })
    if ($taskPermissions.Count -ne $ExpectedPermissions.Count -or @($taskPermissions | Where-Object { $_ -notin $ExpectedPermissions }).Count) { throw 'The built APK has an unexpected permission surface.' }
    $taskBadging = @(& $taskAapt dump badging $taskApk)
    if ($LASTEXITCODE -ne 0 -or -not ($taskBadging -match "sdkVersion:'35'") -or -not ($taskBadging -match "targetSdkVersion:'37'")) { throw 'The built APK API bounds differ from the local prototype.' }
    $taskPackageLine = @($taskBadging | Where-Object { $_ -match '^package:' })
    if ($taskPackageLine.Count -ne 1 -or $taskPackageLine[0] -notmatch ("name='" + [regex]::Escape($PackageId) + "'") -or $taskPackageLine[0] -notmatch ("versionName='" + [regex]::Escape($VersionName) + "'")) { throw 'The APK identity/version differs from the intended artifact.' }
    $taskPriorJava = $env:JAVA_HOME
    try {
        $env:JAVA_HOME = Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1'
        & (Join-Path $taskRoot 'artifacts\android-sdk\build-tools\36.0.0\apksigner.bat') verify $taskApk
        if ($LASTEXITCODE -ne 0) { throw 'APK signing verification failed.' }
    } finally { $env:JAVA_HOME = $taskPriorJava }
    [xml]$taskLintXml = Get-Content -Raw -LiteralPath (Join-Path $taskRoot ("android\$Module\build\reports\lint-results-debug.xml"))
    if (@($taskLintXml.issues.issue | Where-Object { $_.severity -in 'Error','Fatal' }).Count) { throw 'Android lint has unresolved errors.' }
    $taskRelative = 'artifacts/android-local-inspector/' + $Filename
    $taskDelivered = Join-Path $taskRoot $taskRelative
    New-Item -ItemType Directory -Force -Path (Split-Path $taskDelivered) | Out-Null
    Copy-Item -LiteralPath $taskApk -Destination $taskDelivered -Force
    return [ordered]@{
        path=$taskRelative; package_id=$PackageId; version_name=$VersionName; sha256=(Get-FileHash -LiteralPath $taskDelivered -Algorithm SHA256).Hash.ToLowerInvariant()
        size_bytes=(Get-Item -LiteralPath $taskDelivered).Length; signature_verified=$true; signing='local_debug_only'; min_sdk=35; target_sdk=37
        permissions=@($taskPermissions); internet_permission=$false
        lint=@{ errors=0; warnings=@($taskLintXml.issues.issue | Where-Object { $_.severity -eq 'Warning' }).Count; report="android/$Module/build/reports/lint-results-debug.xml"; performed_by_this_run=$true }
    }
}
try {
    $taskBefore = Get-SourceHashes
    $taskReadOutput = @(& (Join-Path $PSScriptRoot 'test-android-read-coordinator.ps1'))
    $taskReadSummary = @($taskReadOutput | Where-Object { $_ -match '^PASS ProcessReadCoordinatorTest: 16 checks; Application host seams: 8 checks; report=artifacts/android-read-coordinator-test/run-[0-9a-f]{32}/validation[.]json$' })
    if ($taskReadSummary.Count -ne 1) { throw 'Process-reader executed-case report is missing or ambiguous.' }
    $taskReadRelative = ([string]$taskReadSummary[0]).Split('report=')[1]
    $taskReadPath = Join-Path $taskRoot $taskReadRelative
    $taskReadReport = Get-Content -LiteralPath $taskReadPath -Raw | ConvertFrom-Json
    if ($taskReadReport.result -ne 'pass_process_read_coordinator_host' -or $taskReadReport.coordinator.passed -ne 16 -or $taskReadReport.application_host_seams.passed -ne 8) { throw 'Process-reader host evidence differs from the executed-case summary.' }
    $taskCoreOutput = @(& (Join-Path $PSScriptRoot 'test-android-core.ps1'))
    $taskCorePasses = @($taskCoreOutput | Where-Object { $_ -match '^PASS ' }).Count
    $taskFixtureOutput = @(& (Join-Path $PSScriptRoot 'test-android-fixture.ps1'))
    # This harness reports one executed-case total, rather than one PASS line per case.
    $taskFixtureSummary = @($taskFixtureOutput | Where-Object { $_ -match '^PASS LifecycleFixtureCoreTest: [0-9]+ checks$' })
    if ($taskFixtureSummary.Count -ne 1) { throw 'Owned fixture executed-case summary is missing or ambiguous.' }
    $taskFixturePasses = [int]([regex]::Match([string]$taskFixtureSummary[0], '^PASS LifecycleFixtureCoreTest: ([0-9]+) checks$').Groups[1].Value)
    if ($taskCorePasses -lt 1 -or $taskFixturePasses -lt 1) { throw 'Native fixtures did not report executed checks.' }
    & (Join-Path $PSScriptRoot 'build-android.ps1')
    $taskInspector = Audit-Apk 'app' 'org.liveabit.inspect' '0.2.4-local' @('android.permission.PACKAGE_USAGE_STATS') 'liveabit-local-inspector-0.2.4.apk'
    $taskFixture = Audit-Apk 'fixture-app' 'org.liveabit.fixture' '0.1.0-fixture' @() 'liveabit-lifecycle-fixture-0.1.0.apk'
    $taskAfter = Get-SourceHashes
    $taskDrift = @($taskAfter.Keys | Where-Object { $taskBefore[$_] -ne $taskAfter[$_] })
    if ($taskDrift.Count -or $taskBefore.Count -ne $taskAfter.Count) { throw 'Source changed during Android verification.' }
    $taskReport = [ordered]@{
        result='pass_with_device_limits'; generated_at=[DateTime]::UtcNow.ToString('o'); scope='native_local_only_build_and_jvm_fixtures'
        decision='docs/decisions/0009-android-local-inspection-first.md'; sdk_terms_accepted_by_user='2026-10-05'
        environment=@{ platform='Windows'; jdk='Temurin 17.0.20.1+1'; gradle='9.4.1'; agp='9.2.1'; sdk_platform='android-37.0 revision 2'; build_tools='36.0.0'; version_provenance='pinned_build_configuration_and_checksum_verified_tool_archives' }
        jvm_fixtures=@{ passed=$taskCorePasses; android_runtime_verified=$false }; owned_fixture_jvm=@{ passed=$taskFixturePasses; android_runtime_verified=$false }
        process_read_coordinator_jvm=@{ coordinator_checks=16; exact_application_host_seam_checks=8; android_runtime_verified=$false; sqlite_verified=$false; report=$taskReadRelative; report_sha256=(Get-FileHash -LiteralPath $taskReadPath -Algorithm SHA256).Hash.ToLowerInvariant() }
        apk=$taskInspector; fixture_apk=$taskFixture; lint=$taskInspector.lint
        topology=@{ activity_delivery='absent'; agent_endpoint='absent'; background_collection=$false; observation_storage='process_ram'; persistent_storage='inspector_local_control_preferences_only'; fixture_storage='own_callbacks_in_process_ram_only' }
        input_drift=@(); source_sha256=$taskAfter; physical_device_tested_by_this_run=$false; emulator_tested=$false; m2_proven=$false; m3_proven=$false
        earlier_qualitative_phone_report='docs/review/android-phone-feedback-2026-10-05.md'
        limits=@('Build, APK permission/signature audits and JVM fixtures only; neither new APK was exercised on Android by this run.', 'Earlier user-reported 0.1.0 phone behavior is qualitative and separate from this evidence.', 'Fixture values are manually entered and are neither authenticated attestations nor complete production coverage.', 'All collector estimates remain unverified diagnostics; initial state and source completeness stay unknown.', 'No production publication, existing-agent integration, background timing, battery or measured accuracy quality claim.')
    }
    $taskReport | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath $taskReportPath -Encoding utf8
    Write-Output "PASS: $taskCorePasses collector/comparison checks, $taskFixturePasses owned-fixture checks, 16 coordinator checks and 8 Application host-seam checks; both APKs built, signed and permission-audited; new phone behavior remains unverified."
} catch {
    @{ result='fail'; scope='native_local_only_build_and_jvm_fixtures'; generated_at=[DateTime]::UtcNow.ToString('o'); physical_device_tested_by_this_run=$false; m2_proven=$false; m3_proven=$false; message='Android verification did not complete. No private diagnostic detail saved.' } | ConvertTo-Json | Set-Content -LiteralPath $taskReportPath -Encoding utf8
    throw
}
