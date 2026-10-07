param([switch]$SelfCheck)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRootPrefix = $taskRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$taskSdk = Join-Path $taskRoot 'artifacts\android-sdk'
$taskArea = Join-Path $taskRoot 'artifacts\android-emulator'
$taskAvdHome = Join-Path $taskArea 'avd'
$taskAvdPath = Join-Path $taskAvdHome 'liveabit-api36-test.avd'
$taskAvdIni = Join-Path $taskAvdHome 'liveabit-api36-test.ini'
$taskAvdControl = Join-Path $taskAvdPath 'liveabit-owned-start.json'
$taskLogs = Join-Path $taskArea 'logs\api36'
$taskEmulator = Join-Path $taskSdk 'emulator\emulator.exe'
$taskImage = Join-Path $taskSdk 'system-images\android-36\default\x86_64'
$taskSetupReport = Join-Path $taskRoot 'docs\review\android-api36-emulator-setup.json'
$taskReportPath = Join-Path $taskRoot 'docs\review\android-api36-emulator-start.json'
$taskRunPath = Join-Path $taskArea 'run.json'
$taskNames = @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','ANDROID_USER_HOME','ANDROID_EMULATOR_HOME','ANDROID_AVD_HOME')
$taskPrevious = @{}
$taskReport = [ordered]@{
    result='pending'; generated_at=[DateTime]::UtcNow.ToString('o'); scope='owned_api36_emulator_start_only'
    api=36; name='liveabit-api36-test'; serial='emulator-5582'; avd_path=$taskAvdPath
    android_runtime_verified=$false; workflow_suite_passed=$false; account_free_verified=$false
    os_settings_changed=$false; apk_installed_by_this_script=$false; emulator_started=$false
}

function Assert-WorkspacePath([string]$Path) {
    $taskAbsolute = [IO.Path]::GetFullPath($Path)
    if (-not $taskAbsolute.StartsWith($taskRootPrefix,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'An API 36 startup target escaped the explicitly named workspace.'
    }
    $taskAncestor = $taskAbsolute
    while ($taskAncestor -and $taskAncestor -ne $taskRoot) {
        if (Test-Path -LiteralPath $taskAncestor) {
            if (((Get-Item -LiteralPath $taskAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'API 36 startup refuses redirected workspace paths.'
            }
        }
        $taskAncestor = [IO.Path]::GetDirectoryName($taskAncestor)
    }
    return $taskAbsolute
}

function Save-StartReport {
    $taskChecked = Assert-WorkspacePath $taskReportPath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskChecked) | Out-Null
    $taskReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $taskChecked -Encoding utf8
}

function Parse-Fields([string]$Text) {
    if ($null -eq $Text -or $Text.Length -gt 65536) { throw 'A properties/AVD input exceeds its local bound.' }
    $taskFields = @{}
    foreach ($taskLine in ($Text -split '\r?\n')) {
        if ([string]::IsNullOrWhiteSpace($taskLine) -or $taskLine -match '^\s*#') { continue }
        if ($taskLine -match '^([^#=\s]+)\s*=(.*)$') {
            if ($taskFields.ContainsKey($Matches[1])) { throw 'A properties/AVD file contains duplicate fields.' }
            $taskFields[$Matches[1]]=$Matches[2].Trim()
        } else { throw 'A properties/AVD input contains a malformed line.' }
        if ($taskFields.Count -gt 512) { throw 'A properties/AVD input has too many fields.' }
    }
    return $taskFields
}

function Read-Fields([string]$Path) {
    return Parse-Fields (Get-Content -LiteralPath (Assert-WorkspacePath $Path) -Raw)
}

function Assert-AvdWritePath([string]$Value) {
    # Normalize the exact argument/config value before use, never just its prefix.
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Length -gt 1024 -or
            $Value -match '[\x00-\x1f*?"<>|%$]' -or $Value.StartsWith('\\') -or
            $Value -match '(^|[\\/])\.\.?([\\/]|$)' -or
            ([IO.Path]::IsPathRooted($Value) -and -not [IO.Path]::IsPathFullyQualified($Value))) {
        throw 'An AVD writable path is unavailable, indirect or malformed.'
    }
    $taskColonCount=([regex]::Matches($Value,':')).Count
    if ($taskColonCount -gt 1 -or ($taskColonCount -eq 1 -and $Value -notmatch '^[A-Za-z]:[\\/]')) {
        throw 'An AVD writable path contains a drive-relative or alternate-stream form.'
    }
    $taskCandidate=if ([IO.Path]::IsPathFullyQualified($Value)) { $Value } else { Join-Path $taskAvdPath $Value }
    $taskChecked=Assert-WorkspacePath $taskCandidate
    $taskAvdPrefix=[IO.Path]::GetFullPath($taskAvdPath).TrimEnd('\','/') + '\'
    if (-not $taskChecked.StartsWith($taskAvdPrefix,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'An AVD writable path escaped the explicitly named API 36 directory.'
    }
    return $taskChecked
}

function Assert-AvdTree {
    $null=Assert-WorkspacePath $taskAvdPath
    $taskPending=[Collections.Generic.Stack[string]]::new()
    $taskPending.Push($taskAvdPath)
    $taskEntries=0
    while ($taskPending.Count) {
        $taskDirectory=$taskPending.Pop()
        foreach ($taskItem in (Get-ChildItem -LiteralPath $taskDirectory -Force)) {
            if (++$taskEntries -gt 10000) { throw 'The owned AVD tree exceeds its startup inspection bound.' }
            if (($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'The owned AVD tree contains a redirected path; no data was wiped.'
            }
            $null=Assert-AvdWritePath $taskItem.FullName
            if ($taskItem.PSIsContainer) { $taskPending.Push($taskItem.FullName) }
        }
    }
    return $taskEntries
}

function Assert-AvdConfig($Fields,[bool]$Fresh) {
    if (-not $Fields['image.sysdir.1'] -or $Fields['abi.type'] -ne 'x86_64' -or
            $Fields['tag.id'] -ne 'default' -or $Fields['target'] -ne 'android-36') {
        throw 'The owned AVD configuration has a different image/API/ABI/tag.'
    }
    $taskImageValue=[string]$Fields['image.sysdir.1']
    $taskImageCandidate=if ([IO.Path]::IsPathFullyQualified($taskImageValue)) { $taskImageValue } else { Join-Path $taskSdk $taskImageValue }
    $taskConfiguredImage=Assert-WorkspacePath $taskImageCandidate
    if ($taskConfiguredImage.TrimEnd('\','/') -ne $taskImage.TrimEnd('\','/')) {
        throw 'The owned AVD refers to an unverified read-only system-image directory.'
    }
    $taskNormalized=@{}
    foreach ($taskKey in $Fields.Keys) {
        $taskValue=[string]$Fields[$taskKey]
        if ($taskKey -eq 'image.sysdir.1') {
            $taskNormalized[$taskKey]=$taskConfiguredImage
            continue
        }
        if ($taskKey -in @('skin.path','skin.name')) {
            if ($taskValue -notin @('1080x1920','_no_skin')) {
                throw 'A custom skin path/name is outside the fixed headless AVD forms.'
            }
            $taskNormalized[$taskKey]=$taskValue
            continue
        }
        $taskPathField=$taskKey -match '(?i)(?:path|paths|file|filename|dir|directory|storage)$'
        $taskPathValue=$taskValue -match '[\\/]|^[A-Za-z]:|^[~%$]|^<'
        if ($taskPathField -or $taskPathValue) {
            if ($taskValue -eq '<build>' -and $taskKey -in @('avd.id','avd.name')) {
                $taskNormalized[$taskKey]=$taskValue
                continue
            }
            if ($Fresh -and $taskKey -eq 'disk.dataPartition.path' -and $taskValue -eq '<temp>') {
                $taskNormalized[$taskKey]=Assert-AvdWritePath 'userdata-qemu.img'
                continue
            }
            if ($taskKey -notmatch '^(?:disk|sdcard|snapshot|userdata|fastboot|firstboot|hw\.sdCard)\.') {
                throw 'The AVD has an unrecognized or custom read-only path field.'
            }
            if ([string]::IsNullOrWhiteSpace($taskValue)) { continue }
            $taskNormalized[$taskKey]=Assert-AvdWritePath $taskValue
        } else {
            $taskNormalized[$taskKey]=$taskValue
        }
    }
    # Native defaults and every mutable disk used by this test stay in the owned content directory.
    $taskNormalized['disk.dataPartition.path']=Assert-AvdWritePath 'userdata-qemu.img'
    $taskNormalized['disk.cachePartition.path']=Assert-AvdWritePath 'cache.img'
    $taskNormalized['disk.snapStorage.path']=Assert-AvdWritePath 'snapshots.img'
    $taskNormalized['sdcard.path']=Assert-AvdWritePath 'sdcard.img'
    $taskNormalized['hw.sdCard']='no'
    $taskNormalized['fastboot.forceColdBoot']='yes'
    $taskNormalized['fastboot.forceFastBoot']='no'
    $taskNormalized['firstboot.bootFromDownloadableSnapshot']='no'
    $taskNormalized['firstboot.bootFromLocalSnapshot']='no'
    $taskNormalized['firstboot.saveToLocalSnapshot']='no'
    return $taskNormalized
}

function Invoke-ConfigSelfCheck {
    $taskPassed=0
    $taskValid=@{
        'image.sysdir.1'='system-images\android-36\default\x86_64\'; 'abi.type'='x86_64'
        'tag.id'='default'; 'target'='android-36'; 'avd.name'='<build>'
        'disk.dataPartition.path'='<temp>'; 'hw.lcd.width'='1080'; 'hw.lcd.height'='1920'
    }
    $taskFresh=Assert-AvdConfig $taskValid $true
    if ($taskFresh['disk.dataPartition.path'] -ne (Join-Path $taskAvdPath 'userdata-qemu.img')) { throw 'Fresh config did not bind its data image.' }
    $taskPassed++
    $taskRepeat=Assert-AvdConfig $taskFresh $false
    if ($taskRepeat['disk.cachePartition.path'] -ne (Join-Path $taskAvdPath 'cache.img')) { throw 'Repeat config lost its cache binding.' }
    $taskPassed++
    foreach ($taskWrongPath in @(
            (Join-Path $taskRoot 'outside-avd.img'), '..\outside.img',
            ([IO.Path]::GetFullPath($taskAvdPath) + '-other\userdata.img'),
            'C:userdata.img', '\userdata.img', '\\server\share\userdata.img',
            ((Join-Path $taskAvdPath 'userdata.img') + ':alternate'), '%TEMP%\userdata.img', '<temp>')) {
        $taskRejected=$false
        try { $null=Assert-AvdWritePath $taskWrongPath } catch { $taskRejected=$true }
        if (-not $taskRejected) { throw ('A destructive-path boundary self-check unexpectedly accepted case ' + $taskPassed + ': ' + $taskWrongPath) }
        $taskPassed++
    }
    foreach ($taskMutation in @(
            @{ key='disk.dataPartition.path'; value=(Join-Path $taskRoot 'other-userdata.img') },
            @{ key='sdcard.path'; value='..\other-sdcard.img' },
            @{ key='disk.snapStorage.path'; value=(Join-Path $taskRoot 'other-snapshot.img') },
            @{ key='fastboot.chosenSnapshotFile'; value='..\snapshot' },
            @{ key='custom.output.path'; value='inside.img' },
            @{ key='kernel.path'; value=(Join-Path $taskImage 'kernel-ranchu') },
            @{ key='skin.path'; value=(Join-Path $taskRoot 'custom-skin') },
            @{ key='image.sysdir.1'; value='system-images\android-35\default\x86_64\' },
            @{ key='image.sysdir.2'; value='system-images\android-35\default\x86_64\' },
            @{ key='target'; value='android-35' })) {
        $taskTest=$taskFresh.Clone()
        $taskTest[$taskMutation.key]=$taskMutation.value
        $taskRejected=$false
        try { $null=Assert-AvdConfig $taskTest $false } catch { $taskRejected=$true }
        if (-not $taskRejected) { throw 'A config containment self-check unexpectedly accepted a conflicting field.' }
        $taskPassed++
    }
    foreach ($taskInput in @("path=a`npath=b", 'path only', ('x=' + ('a' * 65536)))) {
        $taskRejected=$false
        try { $null=Parse-Fields $taskInput } catch { $taskRejected=$true }
        if (-not $taskRejected) { throw 'A bounded parser self-check unexpectedly accepted invalid input.' }
        $taskPassed++
    }
    $taskParsed=Parse-Fields "# owned synthetic fields`npath=owned.img`n"
    if ($taskParsed['path'] -ne 'owned.img') { throw 'The bounded parser lost a valid synthetic field.' }
    $taskPassed++
    Write-Output ('PASS pure API 36 configuration/path checks: ' + $taskPassed + '. No SDK command, file write, AVD creation or emulator action was performed.')
}

function Assert-FreePorts {
    foreach ($taskPort in @(5582,5583)) {
        foreach ($taskAddress in @([Net.IPAddress]::Loopback,[Net.IPAddress]::IPv6Loopback)) {
            if ($taskAddress.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetworkV6 -and -not [Net.Sockets.Socket]::OSSupportsIPv6) { continue }
            $taskListener=[Net.Sockets.TcpListener]::new($taskAddress,$taskPort)
            try {
                $taskListener.ExclusiveAddressUse=$true
                $taskListener.Start()
            } catch { throw 'A required API 36 emulator port is occupied; no existing device was stopped.' }
            finally { $taskListener.Stop() }
        }
    }
}

if ($SelfCheck) { Invoke-ConfigSelfCheck; return }

try {
    foreach ($taskPath in @($taskSdk,$taskArea,$taskAvdHome,$taskAvdPath,$taskAvdIni,$taskAvdControl,$taskLogs,$taskEmulator,$taskImage,$taskSetupReport,$taskReportPath,$taskRunPath)) {
        $null=Assert-WorkspacePath $taskPath
    }
    if (-not (Test-Path -LiteralPath $taskSetupReport -PathType Leaf)) { throw 'Verify the project-local API 36 image before starting its emulator.' }
    $taskSetup=Get-Content -LiteralPath $taskSetupReport -Raw | ConvertFrom-Json
    $taskEmulatorProperties=Read-Fields (Join-Path $taskSdk 'emulator\source.properties')
    $taskImageProperties=Read-Fields (Join-Path $taskImage 'source.properties')
    $taskCliProperties=Read-Fields (Join-Path $taskSdk 'cmdline-tools\22.0\source.properties')
    if ($taskSetup.result -ne 'pass_image_setup_only' -or
            $taskSetup.pin.package_id -ne 'system-images;android-36;default;x86_64' -or
            $taskSetup.pin.revision -ne '2' -or
            $taskEmulatorProperties['Pkg.Revision'] -ne '37.2.12' -or
            $taskImageProperties['Pkg.Revision'] -ne '2' -or
            $taskImageProperties['AndroidVersion.ApiLevel'] -ne '36' -or
            $taskImageProperties['SystemImage.Abi'] -ne 'x86_64' -or
            $taskImageProperties['SystemImage.TagId'] -ne 'default' -or
            $taskCliProperties['Pkg.Revision'] -ne '22.0' -or
            (Get-FileHash -LiteralPath (Join-Path $taskImage 'source.properties') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskSetup.layout.source_properties_sha256 -or
            (Get-FileHash -LiteralPath (Join-Path $taskImage 'package.xml') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskSetup.layout.registration_sha256 -or
            -not (Test-Path -LiteralPath (Join-Path $taskImage 'system.img') -PathType Leaf) -or
            -not (Test-Path -LiteralPath $taskEmulator -PathType Leaf)) {
        throw 'The existing SDK image/tools differ from their verified API 36 setup record.'
    }
    if (-not $taskSetup.layout.file_sha256 -or $taskSetup.layout.files_verified_against_archive -lt 1) {
        throw 'The verified API 36 setup record has no extracted-file identities.'
    }
    $taskImagePrefix = [IO.Path]::GetFullPath($taskImage).TrimEnd('\','/') + '\'
    foreach ($taskFile in $taskSetup.layout.file_sha256.PSObject.Properties) {
        $taskVerifiedPath = Assert-WorkspacePath (Join-Path $taskRoot $taskFile.Name)
        if (-not $taskVerifiedPath.StartsWith($taskImagePrefix,[StringComparison]::OrdinalIgnoreCase) -or
                $taskFile.Value -notmatch '^[a-f0-9]{64}$' -or
                -not (Test-Path -LiteralPath $taskVerifiedPath -PathType Leaf) -or
                (Get-FileHash -LiteralPath $taskVerifiedPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskFile.Value) {
            throw 'An API 36 image file differs from its archive-verified setup identity; no emulator started.'
        }
    }
    Assert-FreePorts
    $taskOwnedProcesses=@(Get-CimInstance Win32_Process -Filter "Name='emulator.exe' OR Name='qemu-system-x86_64.exe'" | Where-Object {
        $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith((Join-Path $taskSdk 'emulator') + '\',[StringComparison]::OrdinalIgnoreCase) -and
            $_.CommandLine -match '(?:^|\s)-avd\s+"?liveabit-api(?:35|36|37)-test(?:"|\s|$)'
    })
    if ($taskOwnedProcesses.Count -gt 0) { throw 'Finish and close the existing owned emulator before starting API 36; no running device was modified.' }
    if ((Test-Path -LiteralPath $taskAvdPath) -and -not (Test-Path -LiteralPath $taskAvdIni -PathType Leaf)) {
        throw 'The existing API 36 AVD directory has no matching registration; it was not overwritten or wiped.'
    }
    Save-StartReport
    foreach ($taskDirectory in @($taskArea,$taskAvdHome,(Join-Path $taskArea 'user'),$taskLogs)) {
        New-Item -ItemType Directory -Force -Path (Assert-WorkspacePath $taskDirectory) | Out-Null
    }
    foreach ($taskName in $taskNames) { $taskPrevious[$taskName]=[Environment]::GetEnvironmentVariable($taskName,'Process') }
    $env:JAVA_HOME=Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1'
    $env:ANDROID_HOME=$taskSdk
    $env:ANDROID_SDK_ROOT=$taskSdk
    $env:ANDROID_USER_HOME=Join-Path $taskRoot 'artifacts\android-user'
    $env:ANDROID_EMULATOR_HOME=Join-Path $taskArea 'user'
    $env:ANDROID_AVD_HOME=$taskAvdHome
    $taskFreshAvd=$false
    if (-not (Test-Path -LiteralPath $taskAvdIni -PathType Leaf)) {
        'no' | & (Join-Path $taskSdk 'cmdline-tools\22.0\bin\avdmanager.bat') create avd -n 'liveabit-api36-test' `
            -k 'system-images;android-36;default;x86_64' -p $taskAvdPath -d 'pixel_2'
        if ($LASTEXITCODE -ne 0) { throw 'The owned API 36 AVD could not be created.' }
        $taskReport.avd_created_by_this_run=$true
        $taskFreshAvd=$true
    }
    # Only this registered named project-local synthetic AVD is an authorized reset target.
    $taskRegistration=Read-Fields $taskAvdIni
    if (-not $taskRegistration['path'] -or
            (Assert-WorkspacePath $taskRegistration['path']) -ne [IO.Path]::GetFullPath($taskAvdPath) -or
            $taskRegistration['target'] -ne 'android-36' -or $taskRegistration['avd.ini.encoding'] -ne 'UTF-8' -or
            @($taskRegistration.Keys | Where-Object { $_ -notin @('avd.ini.encoding','path','target') }).Count -gt 0) {
        throw 'API 36 AVD registration does not resolve to the intended owned directory; no emulator started.'
    }
    $taskRegistrationHash=(Get-FileHash -LiteralPath $taskAvdIni -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskTreeEntries=Assert-AvdTree
    $taskConfigPath=Assert-WorkspacePath (Join-Path $taskAvdPath 'config.ini')
    if (-not $taskFreshAvd) {
        if (-not (Test-Path -LiteralPath $taskAvdControl -PathType Leaf)) {
            throw 'An existing API 36 AVD has no strict owned startup provenance; it was not changed or wiped.'
        }
        $taskOwned=Get-Content -LiteralPath $taskAvdControl -Raw | ConvertFrom-Json
        if ($taskOwned.schema -ne 'liveabit-owned-avd-v1' -or $taskOwned.name -ne 'liveabit-api36-test' -or
                $taskOwned.avd_path -ne [IO.Path]::GetFullPath($taskAvdPath) -or
                $taskOwned.image -ne 'system-images;android-36;default;x86_64' -or
                $taskOwned.config_sha256 -ne (Get-FileHash -LiteralPath $taskConfigPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
            throw 'Existing owned AVD configuration/provenance changed; no emulator data was wiped.'
        }
    }
    $taskConfig=Assert-AvdConfig (Read-Fields $taskConfigPath) $taskFreshAvd
    $taskConfigLines=@($taskConfig.Keys | Sort-Object | ForEach-Object { $_ + '=' + $taskConfig[$_] })
    $taskConfigLines | Set-Content -LiteralPath $taskConfigPath -Encoding utf8
    $taskConfigHash=(Get-FileHash -LiteralPath $taskConfigPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskControl=[ordered]@{
        schema='liveabit-owned-avd-v1'; name='liveabit-api36-test'; avd_path=[IO.Path]::GetFullPath($taskAvdPath)
        image='system-images;android-36;default;x86_64'; config_sha256=$taskConfigHash
        created_or_verified_at=[DateTime]::UtcNow.ToString('o'); writable_paths_bound_to_owned_avd=$true
    }
    $taskControl | ConvertTo-Json | Set-Content -LiteralPath (Assert-WorkspacePath $taskAvdControl) -Encoding utf8
    $taskAccel=@(& $taskEmulator -accel-check 2>&1)
    $taskAccelExit=$LASTEXITCODE
    $taskAccel | Set-Content -LiteralPath (Join-Path $taskLogs 'acceleration.txt') -Encoding utf8
    if ($taskAccelExit -ne 0 -or ($taskAccel -join "`n") -notmatch 'WHPX') {
        throw 'The already enabled Windows Hypervisor Platform is required; this script changes no OS setting or driver.'
    }
    Assert-FreePorts
    $null=Assert-WorkspacePath $taskAvdPath
    $null=Assert-AvdTree
    if ((Get-FileHash -LiteralPath $taskConfigPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskConfigHash -or
            (Get-FileHash -LiteralPath $taskAvdIni -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskRegistrationHash) {
        throw 'The checked owned AVD configuration/registration changed before startup; no emulator started.'
    }
    $taskData=Assert-AvdWritePath 'userdata-qemu.img'
    $taskCache=Assert-AvdWritePath 'cache.img'
    $taskSdcard=Assert-AvdWritePath 'sdcard.img'
    $taskArgs=@('-avd','liveabit-api36-test','-port','5582','-no-window','-no-audio','-no-boot-anim','-no-snapshot',
        '-datadir',('"' + $taskAvdPath + '"'),'-data',('"' + $taskData + '"'),'-cache',('"' + $taskCache + '"'),
        '-sdcard',('"' + $taskSdcard + '"'),'-wipe-data','-camera-back','none','-camera-front','none',
        '-gpu','software','-accel','on','-memory','2048')
    $taskProcess=Start-Process -FilePath $taskEmulator -ArgumentList $taskArgs -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $taskLogs 'stdout.txt') -RedirectStandardError (Join-Path $taskLogs 'stderr.txt') -PassThru
    $taskRun=[ordered]@{
        name='liveabit-api36-test'; serial='emulator-5582'; pid=$taskProcess.Id; avd_path=$taskAvdPath
        api=36; image='system-images;android-36;default;x86_64'; image_revision=2; emulator_version='37.2.12'
        cpu_acceleration='on'; acceleration_backend='WHPX'; graphics='software'; memory_megabytes=2048
        created_at=[DateTime]::UtcNow.ToString('o'); os_settings_changed=$false; contains_personal_data=$false
        setup_report='docs/review/android-api36-emulator-setup.json'
        setup_report_sha256=(Get-FileHash -LiteralPath $taskSetupReport -Algorithm SHA256).Hash.ToLowerInvariant()
        config_sha256=$taskConfigHash; avd_registration_sha256=$taskRegistrationHash; owned_tree_entries_checked=$taskTreeEntries
        writable_data_path=$taskData; writable_cache_path=$taskCache; writable_sdcard_path=$taskSdcard
    }
    $taskRun | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Assert-WorkspacePath $taskRunPath) -Encoding utf8
    $taskRun | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskArea 'run-api36.json') -Encoding utf8
    $taskReport.result='started_runtime_unverified'; $taskReport.emulator_started=$true
    $taskReport.start_script_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskReport.run=$taskRun; $taskReport.finished_at=[DateTime]::UtcNow.ToString('o')
    Save-StartReport
    $taskRun | ConvertTo-Json -Depth 8
} catch {
    $taskReport.result='fail'; $taskReport.failure=$_.Exception.Message; $taskReport.finished_at=[DateTime]::UtcNow.ToString('o')
    Save-StartReport
    throw
} finally {
    foreach ($taskName in $taskPrevious.Keys) { [Environment]::SetEnvironmentVariable($taskName,$taskPrevious[$taskName],'Process') }
}
