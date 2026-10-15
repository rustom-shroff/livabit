param([string]$RunDirectory, [switch]$Live)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'android-publisher-job-state.ps1')
$taskFixtures = Get-Content -LiteralPath (Join-Path $taskRoot 'test/fixtures/android-job-state-output.json') -Raw | ConvertFrom-Json
$taskChecks = @()
foreach ($taskFixture in $taskFixtures.observations) {
    $taskParsed = ConvertFrom-PublisherJobResponse $taskFixture.text $taskFixture.exit_code $taskFixture.job_id
    if (($taskParsed -match '\bunknown\b') -ne [bool]$taskFixture.absent) { throw ('Fixture classification differed: ' + $taskFixture.name) }
    $taskChecks += $taskFixture.name
}
$taskRejected = @(
    @{name='unknown_command'; text='Unknown command: get-job-state'; exit_code=0; job_id=310},
    @{name='unknown_package'; text='Error: unknown package org.liveabit.publish'; exit_code=1; job_id=310},
    @{name='wrong_job_identity'; text="unknown(u0a148/jid311)`nCould not find job 311 in package org.liveabit.publish / user 0"; exit_code=23; job_id=310},
    @{name='wrong_package_detail'; text="unknown(u0a148/jid310)`nCould not find job 310 in package another.package / user 0"; exit_code=23; job_id=310},
    @{name='wrong_user_identity'; text="unknown(u10a148/jid310)`nCould not find job 310 in package org.liveabit.publish / user 10"; exit_code=23; job_id=310},
    @{name='unrelated_unknown_trailer'; text="unknown(u0a148/jid310)`nUnknown shell failure"; exit_code=23; job_id=310},
    @{name='empty_success'; text=''; exit_code=0; job_id=310},
    @{name='failed_positive_looking_response'; text='waiting'; exit_code=1; job_id=310}
)
foreach ($taskFixture in $taskRejected) {
    $taskDidReject = $false
    try { ConvertFrom-PublisherJobResponse $taskFixture.text $taskFixture.exit_code $taskFixture.job_id | Out-Null }
    catch { $taskDidReject = $true }
    if (-not $taskDidReject) { throw ('Invalid shell response was accepted: ' + $taskFixture.name) }
    $taskChecks += ('reject_' + $taskFixture.name)
}
$taskReplayCount = 0
if ($RunDirectory) {
    foreach ($taskFile in @('restored-automatic-job.txt','restored-warning-job.txt')) {
        $taskPositive = Get-Content -LiteralPath (Join-Path $RunDirectory $taskFile) -Raw
        $taskJobId = if ($taskFile -eq 'restored-warning-job.txt') { 311 } else { 310 }
        $taskParsed = ConvertFrom-PublisherJobResponse $taskPositive 0 $taskJobId
        if ($taskParsed -match '\bunknown\b') { throw 'Restored positive job was classified as absent.' }
        $taskReplayCount++
    }
    $taskSettlement = Get-Content -LiteralPath (Join-Path $RunDirectory 'reboot-off-job-settlement.json') -Raw | ConvertFrom-Json
    foreach ($taskObservation in $taskSettlement.observations) {
        foreach ($taskJob in @('310','311','313')) {
            $taskText = $taskObservation.jobs.$taskJob
            $taskExit = if ($taskText -match '^unknown\(') { 23 } else { 0 }
            ConvertFrom-PublisherJobResponse $taskText $taskExit ([int]$taskJob) | Out-Null
            $taskReplayCount++
        }
    }
    $taskChecks += 'all_saved_positive_and_stopped_reboot_observations_replayed'
}
if ($Live) {
    $taskAdb = Join-Path $taskRoot 'artifacts/android-sdk/platform-tools/adb.exe'
    $taskAvd = @(& $taskAdb -s emulator-5580 emu avd name 2>&1)
    if ($LASTEXITCODE -ne 0 -or $taskAvd[0].Trim() -cne 'liveabit-api35-test') { throw 'Only the owned project emulator may be queried.' }
    $taskLiveOutput = @(& $taskAdb -s emulator-5580 shell cmd jobscheduler get-job-state org.liveabit.publish 310 2>&1)
    $taskLiveExit = $LASTEXITCODE
    $taskParsed = ConvertFrom-PublisherJobResponse ($taskLiveOutput -join "`n") $taskLiveExit 310
    if ($taskParsed -notmatch '^unknown\(') { throw 'Expected stopped owned publisher fixture to have no job 310.' }
    $taskChecks += 'live_owned_emulator_missing_job_contract'
}
[ordered]@{ result='pass'; check_count=$taskChecks.Count; checks=$taskChecks; replayed_observations=$taskReplayCount; live_owned_emulator_tested=[bool]$Live; physical_phone_tested=$false } | ConvertTo-Json -Depth 4
exit 0
