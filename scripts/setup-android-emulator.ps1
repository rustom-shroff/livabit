param(
    [ValidateRange(60, 3600)][int]$DownloadTimeoutSeconds = 1800,
    [switch]$RegistrationOnly
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRootPrefix = $taskRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$taskDownloads = Join-Path $taskRoot 'artifacts\android-tools\downloads'
$taskSdk = Join-Path $taskRoot 'artifacts\android-sdk'
$taskLicense = Join-Path $taskSdk 'licenses\android-sdk-license'
$taskReportPath = Join-Path $taskRoot 'docs\review\android-emulator-setup.json'
$taskCurl = Join-Path $env:SystemRoot 'System32\curl.exe'
$taskPins = @(
    [ordered]@{
        package_id = 'emulator'; revision = '37.2.12'; channel = 'channel-0'
        metadata_url = 'https://dl.google.com/android/repository/repository2-3.xml'
        archive_name = 'emulator-windows_x64-16428233.zip'
        archive_url = 'https://dl.google.com/android/repository/emulator-windows_x64-16428233.zip'
        expected_size_bytes = [long]455342868
        official_sha1 = '488ed747e82de7e9bb5247becd1ac043c7e5e85d'
        archive_root = 'emulator'; extraction_parent = $taskSdk
        final_directory = (Join-Path $taskSdk 'emulator')
        required_file = 'emulator.exe'; license_id = 'android-sdk-license'
    },
    [ordered]@{
        package_id = 'system-images;android-35;default;x86_64'; revision = '2'; channel = 'channel-0'
        metadata_url = 'https://dl.google.com/android/repository/sys-img/android/sys-img2-3.xml'
        archive_name = 'x86_64-35_r02.zip'
        archive_url = 'https://dl.google.com/android/repository/sys-img/android/x86_64-35_r02.zip'
        expected_size_bytes = [long]782404023
        official_sha1 = '2d857d170c0d1b827149565da34b3383e5306f7f'
        archive_root = 'x86_64'; extraction_parent = (Join-Path $taskSdk 'system-images\android-35\default')
        final_directory = (Join-Path $taskSdk 'system-images\android-35\default\x86_64')
        required_file = 'system.img'; license_id = 'android-sdk-license'
        api = 35; abi = 'x86_64'; tag = 'default'; extension_level = 13; base_extension = $true
    }
)
$taskReport = [ordered]@{
    result = 'pending'; generated_at = [DateTime]::UtcNow.ToString('o')
    scope = 'project_local_android_emulator_tool_setup_only'
    method = $(if ($RegistrationOnly) { 'registration_and_verified_cli_staging_for_existing_extraction' } else { 'direct_checksum_verified_official_archive_extraction' })
    pin_metadata_reviewed_on = '2026-10-06'
    sdk_terms_accepted_by_user = '2026-10-05'
    existing_sdk_license_required = $true; license_file_created_or_modified = $false
    download_timeout_seconds = $DownloadTimeoutSeconds; packages = @()
    os_settings_changed = $false; sdk_tools_executed = $false
    avd_created = $false; emulator_started = $false; user_apks_modified = $false
    registration_only = [bool]$RegistrationOnly
}
$taskStage = 'preconditions'

function Assert-WorkspacePath([string]$Path) {
    $taskAbsolute = [IO.Path]::GetFullPath($Path)
    if (-not $taskAbsolute.StartsWith($taskRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'An emulator setup path escaped the explicitly named workspace.'
    }
    # Existing junctions/symlinks must not redirect a verified archive outside the workspace.
    $taskAncestor = $taskAbsolute
    while ($taskAncestor -and $taskAncestor -ne $taskRoot) {
        if (Test-Path -LiteralPath $taskAncestor) {
            $taskItem = Get-Item -LiteralPath $taskAncestor -Force
            if (($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Emulator setup refuses a redirected workspace path.'
            }
        }
        $taskAncestor = [IO.Path]::GetDirectoryName($taskAncestor)
    }
    return $taskAbsolute
}

function Get-RelativePath([string]$Path) {
    return [IO.Path]::GetRelativePath($taskRoot, $Path).Replace('\', '/')
}

function Save-SetupReport {
    $taskCheckedReport = Assert-WorkspacePath $taskReportPath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskCheckedReport) | Out-Null
    $taskReport | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $taskCheckedReport -Encoding utf8
}

function Test-ArchiveIdentity([string]$Path, $Pin) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    if ((Get-Item -LiteralPath $Path).Length -ne $Pin.expected_size_bytes) { return $false }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA1).Hash.ToLowerInvariant() -eq $Pin.official_sha1
}

function Get-VerifiedArchive($Pin) {
    $taskArchive = Assert-WorkspacePath (Join-Path $taskDownloads $Pin.archive_name)
    $taskReused = Test-ArchiveIdentity $taskArchive $Pin
    $taskResumedBytes = [long]0
    $taskQuarantined = $null
    if (-not $taskReused) {
        if (-not (Test-Path -LiteralPath $taskCurl -PathType Leaf)) { throw 'Windows curl.exe is required for a bounded resumable download.' }
        if (Test-Path -LiteralPath $taskArchive) {
            if (-not (Test-Path -LiteralPath $taskArchive -PathType Leaf)) { throw 'The expected download path is not an ordinary archive file.' }
            $taskExistingSize = (Get-Item -LiteralPath $taskArchive).Length
            if ($taskExistingSize -ge $Pin.expected_size_bytes) {
                # Keep mismatched completed files for diagnosis instead of deleting them.
                $taskQuarantined = Assert-WorkspacePath ($taskArchive + '.invalid-' + [guid]::NewGuid().ToString('N'))
                $taskCheckedSource = Assert-WorkspacePath $taskArchive
                Move-Item -LiteralPath $taskCheckedSource -Destination $taskQuarantined
            } else { $taskResumedBytes = $taskExistingSize }
        }
        New-Item -ItemType Directory -Force -Path (Assert-WorkspacePath $taskDownloads) | Out-Null
        Write-Host ('Downloading the pinned official archive: ' + $Pin.archive_name)
        & $taskCurl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' `
            --continue-at '-' --connect-timeout 20 --max-time $DownloadTimeoutSeconds `
            --speed-limit 1024 --speed-time 60 --output $taskArchive $Pin.archive_url
        if ($LASTEXITCODE -ne 0) { throw 'The bounded official archive download did not complete; its partial file is retained for a later resume.' }
        if (-not (Test-ArchiveIdentity $taskArchive $Pin)) {
            throw 'The completed archive does not match its official byte count and SHA1; nothing from this archive was extracted or executed.'
        }
    }
    return [ordered]@{
        path = $taskArchive; reused_verified_archive = $taskReused; resumed_from_bytes = $taskResumedBytes
        quarantined_previous_file = $(if ($taskQuarantined) { Get-RelativePath $taskQuarantined } else { $null })
        size_bytes = (Get-Item -LiteralPath $taskArchive).Length
        sha1 = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA1).Hash.ToLowerInvariant()
        sha256 = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

function Expand-VerifiedArchive($Pin, $Archive) {
    if (-not (Test-ArchiveIdentity $Archive.path $Pin)) { throw 'The archive changed before extraction.' }
    $taskParent = Assert-WorkspacePath $Pin.extraction_parent
    $taskFinal = Assert-WorkspacePath $Pin.final_directory
    $taskRegistration = Join-Path $taskFinal 'package.xml'
    $taskRegistrationExisted = Test-Path -LiteralPath $taskRegistration -PathType Leaf
    $taskRegistrationInArchive = $false
    $taskZip = [IO.Compression.ZipFile]::OpenRead($Archive.path)
    try {
        foreach ($taskEntry in $taskZip.Entries) {
            $taskName = $taskEntry.FullName.Replace('\', '/')
            if ($taskName -match '(^|/)\.\.?(/|$)|^[\/]|:' -or
                -not ($taskName -eq ($Pin.archive_root + '/') -or $taskName.StartsWith($Pin.archive_root + '/', [StringComparison]::Ordinal))) {
                throw 'A verified archive has an unexpected root or unsafe entry path; it was not extracted.'
            }
            # No Unix symlink entries or existing redirected destinations are accepted.
            if ((($taskEntry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {
                throw 'The archive contains a symbolic-link entry; it was not extracted.'
            }
            $null = Assert-WorkspacePath (Join-Path $taskParent $taskName)
            if ($taskName -eq ($Pin.archive_root + '/package.xml')) { $taskRegistrationInArchive = $true }
        }
    } finally { $taskZip.Dispose() }
    if (-not $RegistrationOnly) {
        New-Item -ItemType Directory -Force -Path $taskParent | Out-Null
        [IO.Compression.ZipFile]::ExtractToDirectory($Archive.path, $taskParent, $true)
    }
    if (-not (Test-ArchiveIdentity $Archive.path $Pin)) { throw 'The archive changed during extraction; this run does not establish a verified setup.' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskFinal $Pin.required_file) -PathType Leaf)) { throw 'The verified archive did not produce the expected SDK layout.' }
    $taskPropertiesPath = Assert-WorkspacePath (Join-Path $taskFinal 'source.properties')
    $taskProperties = @{}
    foreach ($taskLine in (Get-Content -LiteralPath $taskPropertiesPath)) {
        if ($taskLine -match '^([A-Za-z0-9_.]+)\s*=(.*)$') { $taskProperties[$Matches[1]] = $Matches[2].Trim() }
    }
    if ($taskProperties['Pkg.Revision'] -ne $Pin.revision) { throw 'Extracted source.properties differs from the pinned package revision.' }
    if ($Pin.package_id.StartsWith('system-images;') -and
        ($taskProperties['AndroidVersion.ApiLevel'] -ne '35' -or $taskProperties['SystemImage.Abi'] -ne 'x86_64')) {
        throw 'Extracted source.properties differs from the reviewed Android image API/ABI.'
    }
    $taskRegistrationExists = Test-Path -LiteralPath $taskRegistration -PathType Leaf
    $taskOrigin = if ($taskRegistrationInArchive) { 'supplied_in_checksum_verified_official_archive' }
        elseif ($taskRegistrationExisted) { 'existing_before_this_run_origin_unverified' }
        else { 'absent_pending_sdk_legacy_discovery_at_avd_start' }
    return [ordered]@{
        final_directory = (Get-RelativePath $taskFinal); extracted_by_this_run = -not [bool]$RegistrationOnly
        source_properties_sha256 = (Get-FileHash -LiteralPath $taskPropertiesPath -Algorithm SHA256).Hash.ToLowerInvariant()
        parsed_source_properties = $taskProperties
        registration = [ordered]@{
            path = (Get-RelativePath $taskRegistration); exists = $taskRegistrationExists; origin = $taskOrigin
            sha256 = $(if ($taskRegistrationExists) { (Get-FileHash -LiteralPath $taskRegistration -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null })
        }
    }
}

function Stage-VerifiedCli {
    $taskCliArchive = Assert-WorkspacePath (Join-Path $taskDownloads 'commandlinetools-win-15859902.zip')
    $taskCliDigest = '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
    if (-not (Test-Path -LiteralPath $taskCliArchive -PathType Leaf) -or
        (Get-FileHash -LiteralPath $taskCliArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskCliDigest) {
        throw 'The existing checksum-verified command-line tools archive is required; prepare the pinned build tools first.'
    }
    $taskCliDestination = Assert-WorkspacePath (Join-Path $taskSdk 'cmdline-tools\22.0')
    $taskCount = 0; $taskCopied = 0
    $taskZip = [IO.Compression.ZipFile]::OpenRead($taskCliArchive)
    try {
        foreach ($taskEntry in $taskZip.Entries) {
            $taskName = $taskEntry.FullName.Replace('\', '/')
            if ($taskName -match '(^|/)\.\.?(/|$)|^[\/]|:' -or -not $taskName.StartsWith('cmdline-tools/', [StringComparison]::Ordinal)) {
                throw 'The verified CLI archive has an unexpected or unsafe path.'
            }
            $taskRelative = $taskName.Substring('cmdline-tools/'.Length)
            if (-not $taskRelative) { continue }
            $taskTarget = Assert-WorkspacePath (Join-Path $taskCliDestination $taskRelative)
            if ($taskName.EndsWith('/')) { New-Item -ItemType Directory -Force -Path $taskTarget | Out-Null; continue }
            if ((($taskEntry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'The CLI archive contains an unexpected symbolic link.' }
            $taskHasher = [Security.Cryptography.SHA256]::Create(); $taskStream = $taskEntry.Open()
            try { $taskExpectedHash = [Convert]::ToHexString($taskHasher.ComputeHash($taskStream)).ToLowerInvariant() }
            finally { $taskStream.Dispose(); $taskHasher.Dispose() }
            $taskMatches = (Test-Path -LiteralPath $taskTarget -PathType Leaf) -and
                (Get-Item -LiteralPath $taskTarget).Length -eq $taskEntry.Length -and
                (Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash.ToLowerInvariant() -eq $taskExpectedHash
            if (-not $taskMatches) {
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskTarget) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry, $taskTarget, $true)
                if ((Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpectedHash) { throw 'Staged CLI file differs from the verified official archive.' }
                $taskCopied++
            }
            $taskCount++
        }
    } finally { $taskZip.Dispose() }
    if ((Get-FileHash -LiteralPath $taskCliArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskCliDigest) { throw 'The CLI archive changed during staging.' }
    $taskCliPropertiesPath = Join-Path $taskCliDestination 'source.properties'
    if ((Get-Content -LiteralPath $taskCliPropertiesPath -Raw) -notmatch '(?m)^Pkg.Revision\s*=\s*22\.0\s*$') { throw 'The staged CLI revision differs from 22.0.' }
    $taskReport.command_line_tools = [ordered]@{
        revision = '22.0'; path = (Get-RelativePath $taskCliDestination)
        method = 'exact_file_verification_or_copy_from_pinned_official_cli_archive'
        archive_path = (Get-RelativePath $taskCliArchive); archive_sha256 = $taskCliDigest
        files_verified_against_archive = $taskCount; files_copied_by_this_run = $taskCopied
        source_properties_sha256 = (Get-FileHash -LiteralPath $taskCliPropertiesPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

function Register-OfficialEmulatorMetadata {
    $taskPin = $taskPins[0]
    $taskMetadataPath = Assert-WorkspacePath (Join-Path $taskDownloads 'repository2-3-emulator-registration.xml')
    if (-not (Test-Path -LiteralPath $taskCurl -PathType Leaf)) { throw 'Windows curl.exe is required for the official registration metadata.' }
    & $taskCurl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' `
        --connect-timeout 20 --max-time 60 --output $taskMetadataPath $taskPin.metadata_url
    if ($LASTEXITCODE -ne 0) { throw 'Official emulator registration metadata could not be read within its time bound.' }
    [xml]$taskMetadata = Get-Content -LiteralPath $taskMetadataPath -Raw
    $taskCandidates = $taskMetadata.SelectNodes('//*[local-name()="remotePackage"][@path="emulator"]/*[local-name()="channelRef"][@ref="channel-0"]/..')
    if ($taskCandidates.Count -ne 1) { throw 'The official stable emulator metadata is missing or ambiguous.' }
    $taskRemote = $taskCandidates[0]
    $taskRevision = $taskRemote.SelectSingleNode('./*[local-name()="revision"]')
    if (($taskRevision.ChildNodes | ForEach-Object { $_.InnerText }) -join '.' -ne $taskPin.revision) { throw 'Official stable emulator revision differs from the reviewed pin.' }
    $taskWindows = $taskRemote.SelectSingleNode('./*[local-name()="archives"]/*[local-name()="archive"][*[local-name()="host-os"]="windows"]/*[local-name()="complete"]')
    if (-not $taskWindows -or $taskWindows.SelectSingleNode('./*[local-name()="url"]').InnerText -ne $taskPin.archive_name -or
        [long]$taskWindows.SelectSingleNode('./*[local-name()="size"]').InnerText -ne $taskPin.expected_size_bytes -or
        $taskWindows.SelectSingleNode('./*[local-name()="checksum"][@type="sha1"]').InnerText -ne $taskPin.official_sha1) {
        throw 'Official emulator archive identity differs from the reviewed URL, size or SHA1.'
    }
    $taskUsesLicense = $taskRemote.SelectSingleNode('./*[local-name()="uses-license"]')
    if ($taskUsesLicense.GetAttribute('ref') -ne 'android-sdk-license') { throw 'The official emulator requires an unapproved license identity.' }
    $taskOfficialLicense = $taskMetadata.SelectSingleNode('//*[local-name()="license"][@id="android-sdk-license"]')
    if (-not $taskOfficialLicense) { throw 'The official package license metadata is missing.' }
    $taskLocalDocument = [xml]::new()
    $taskRepository = $taskLocalDocument.CreateElement('common', 'repository', 'http://schemas.android.com/repository/android/common/02')
    foreach ($taskAttribute in $taskMetadata.DocumentElement.Attributes) {
        if ($taskAttribute.NamespaceURI -eq 'http://www.w3.org/2000/xmlns/') { $null = $taskRepository.Attributes.Append($taskLocalDocument.ImportNode($taskAttribute, $true)) }
    }
    $null = $taskLocalDocument.AppendChild($taskRepository)
    $null = $taskRepository.AppendChild($taskLocalDocument.ImportNode($taskOfficialLicense, $true))
    $taskLocalPackage = $taskLocalDocument.CreateElement('localPackage')
    $taskLocalPackage.SetAttribute('path', 'emulator'); $taskLocalPackage.SetAttribute('obsolete', 'false')
    foreach ($taskField in @('type-details', 'revision', 'display-name', 'uses-license')) {
        $taskValue = $taskRemote.SelectSingleNode('./*[local-name()="' + $taskField + '"]')
        if (-not $taskValue) { throw 'Official local-registration metadata is incomplete.' }
        $null = $taskLocalPackage.AppendChild($taskLocalDocument.ImportNode($taskValue, $true))
    }
    $null = $taskRepository.AppendChild($taskLocalPackage)
    $taskRegistrationPath = Assert-WorkspacePath (Join-Path $taskSdk 'emulator\package.xml')
    $taskLocalDocument.Save($taskRegistrationPath)
    $taskReport.packages[0].layout.registration = [ordered]@{
        path = (Get-RelativePath $taskRegistrationPath); exists = $true
        origin = 'manual_local_registration_derived_from_exact_official_remote_package_metadata'
        sha256 = (Get-FileHash -LiteralPath $taskRegistrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
        metadata_path = (Get-RelativePath $taskMetadataPath)
        metadata_sha256 = (Get-FileHash -LiteralPath $taskMetadataPath -Algorithm SHA256).Hash.ToLowerInvariant()
        metadata_url = $taskPin.metadata_url; retrieved_at = [DateTime]::UtcNow.ToString('o')
        official_revision_archive_size_and_sha1_revalidated = $true
        acceptance_file_modified = $false
    }
}

function Verify-LocalSdkRegistration {
    $taskImageRegistration = Join-Path $taskPins[1].final_directory 'package.xml'
    $taskImageRegistrationExistedBeforeListing = Test-Path -LiteralPath $taskImageRegistration -PathType Leaf
    $taskEnvironmentNames = @('JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'ANDROID_USER_HOME')
    $taskPriorEnvironment = @{}
    foreach ($taskName in $taskEnvironmentNames) { $taskPriorEnvironment[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process') }
    try {
        $env:JAVA_HOME = Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1'
        $env:ANDROID_HOME = $taskSdk; $env:ANDROID_SDK_ROOT = $taskSdk
        $env:ANDROID_USER_HOME = Join-Path $taskRoot 'artifacts\android-user'
        $taskSdkManager = Join-Path $taskSdk 'cmdline-tools\22.0\bin\sdkmanager.bat'
        $taskReport.sdk_tools_executed = $true
        $taskInstalled = @(& $taskSdkManager "--sdk_root=$taskSdk" --list_installed 2>&1)
        if ($LASTEXITCODE -ne 0) { throw 'The SDK installed-package listing did not complete.' }
        $taskInstalledText = $taskInstalled -join "`n"
        if ($taskInstalledText -notmatch '(?m)^\s*emulator\s*\|\s*37\.2\.12\s*\|' -or
            $taskInstalledText -notmatch '(?m)^\s*system-images;android-35;default;x86_64\s*\|\s*2\s*\|') {
            throw 'The intended SDK does not recognize both pinned emulator and image packages.'
        }
        $taskReport.sdk_registration_verified = [ordered]@{
            command = 'project_sdk_cmdline_tools_22.0_sdkmanager --sdk_root=<project_sdk> --list_installed'
            emulator_revision = '37.2.12'; image_revision = '2'; both_recognized = $true
            package_installation_performed = $false
        }
        $taskReport.packages[1].layout.registration = [ordered]@{
            path = (Get-RelativePath $taskImageRegistration); exists = (Test-Path -LiteralPath $taskImageRegistration -PathType Leaf)
            origin = 'sdk_legacy_loader_generated_from_checksum_verified_source_properties'
            sha256 = (Get-FileHash -LiteralPath $taskImageRegistration -Algorithm SHA256).Hash.ToLowerInvariant()
            generated_during_this_run = -not $taskImageRegistrationExistedBeforeListing
        }
    } finally {
        foreach ($taskName in $taskEnvironmentNames) { [Environment]::SetEnvironmentVariable($taskName, $taskPriorEnvironment[$taskName], 'Process') }
    }
}

try {
    $null = Assert-WorkspacePath $taskLicense
    if (-not (Test-Path -LiteralPath $taskLicense -PathType Leaf) -or (Get-Item -LiteralPath $taskLicense).Length -eq 0) {
        throw 'The previously accepted android-sdk-license file is required. This script never creates or accepts SDK licenses.'
    }
    $taskReport.existing_sdk_license = [ordered]@{
        id = 'android-sdk-license'; path = (Get-RelativePath $taskLicense); exists = $true
        sha256_before = (Get-FileHash -LiteralPath $taskLicense -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    Save-SetupReport
    foreach ($taskPin in $taskPins) {
        $taskStage = 'archive_verification:' + $taskPin.package_id
        $taskArchive = Get-VerifiedArchive $taskPin
        $taskStage = 'verified_extraction:' + $taskPin.package_id
        $taskLayout = Expand-VerifiedArchive $taskPin $taskArchive
        $taskPackage = [ordered]@{}
        foreach ($taskKey in @('package_id','revision','channel','metadata_url','archive_url','archive_name','expected_size_bytes','official_sha1','license_id','api','abi','tag','extension_level','base_extension')) {
            if ($taskPin.Contains($taskKey)) { $taskPackage[$taskKey] = $taskPin[$taskKey] }
        }
        $taskPackage.archive = [ordered]@{
            path = (Get-RelativePath $taskArchive.path); verified_size_bytes = $taskArchive.size_bytes
            verified_sha1 = $taskArchive.sha1; sha256 = $taskArchive.sha256
            reused_verified_archive = $taskArchive.reused_verified_archive; resumed_from_bytes = $taskArchive.resumed_from_bytes
            quarantined_previous_file = $taskArchive.quarantined_previous_file
        }
        $taskPackage.layout = $taskLayout
        $taskReport.packages += $taskPackage
        Save-SetupReport
    }
    $taskStage = 'verified_cli_staging'; Stage-VerifiedCli; Save-SetupReport
    $taskStage = 'official_emulator_registration'; Register-OfficialEmulatorMetadata; Save-SetupReport
    $taskStage = 'sdk_local_registration_verification'; Verify-LocalSdkRegistration; Save-SetupReport
    $taskStage = 'license_integrity'
    $taskReport.existing_sdk_license.sha256_after = (Get-FileHash -LiteralPath $taskLicense -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($taskReport.existing_sdk_license.sha256_before -ne $taskReport.existing_sdk_license.sha256_after) { throw 'The existing SDK license file changed during setup.' }
    $taskReport.result = 'pass_tool_setup_only'
    $taskReport.registration_note = 'CLI files were verified/copied from the pinned official archive. Emulator package.xml was manually derived from exact official metadata; the image uses SDK legacy-loader registration. SDK listing verifies recognition, not package installation. No acceptance file was created or modified.'
    $taskReport.finished_at = [DateTime]::UtcNow.ToString('o')
    Save-SetupReport
    Write-Output 'PASS: Pinned official archives, staged CLI and local SDK registrations verified. No AVD, emulator test or SDK-manager package installation is implied.'
} catch {
    $taskReport.result = 'fail'; $taskReport.failed_stage = $taskStage
    $taskReport.failure = $_.Exception.Message; $taskReport.finished_at = [DateTime]::UtcNow.ToString('o')
    Save-SetupReport
    throw
}
