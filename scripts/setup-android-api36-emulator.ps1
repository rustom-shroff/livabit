param(
    [ValidateRange(60, 3600)][int]$DownloadTimeoutSeconds = 1800
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRootPrefix = $taskRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$taskSdk = Join-Path $taskRoot 'artifacts\android-sdk'
$taskDownloads = Join-Path $taskRoot 'artifacts\android-tools\downloads'
$taskReportPath = Join-Path $taskRoot 'docs\review\android-api36-emulator-setup.json'
$taskCurl = Join-Path $env:SystemRoot 'System32\curl.exe'
$taskLicense = Join-Path $taskSdk 'licenses\android-sdk-license'
$taskPin = [ordered]@{
    package_id='system-images;android-36;default;x86_64'; api=36; abi='x86_64'; tag='default'
    revision='2'; extension_level='17'; base_extension='true'; channel='channel-0'
    metadata_url='https://dl.google.com/android/repository/sys-img/android/sys-img2-5.xml'
    archive_name='x86_64-36_r02.zip'
    archive_url='https://dl.google.com/android/repository/sys-img/android/x86_64-36_r02.zip'
    expected_size_bytes=[long]844217077; official_sha1='829c076e8ff448a336097ae25a355b495ba36e2c'
    min_emulator_revision='35.4.9'; reused_emulator_revision='37.2.12'
    license_id='android-sdk-license'
    # Same official terms body as the metadata used for the already authorized tool setup.
    reviewed_license_text_sha1='9002c006f4b8d9a16e715a9fa4df30ddb8abf9d9'
    previously_accepted_license_hash='24333f8a63b6825ea9c5514f83c2829b004d1fee'
}
$taskImage = Join-Path $taskSdk 'system-images\android-36\default\x86_64'
$taskArchive = Join-Path $taskDownloads $taskPin.archive_name
$taskMetadataPath = Join-Path $taskDownloads 'sys-img2-5-api36-reviewed.xml'
$taskReport = [ordered]@{
    result='pending'; generated_at=[DateTime]::UtcNow.ToString('o')
    scope='project_local_api36_image_setup_only'; pin_metadata_reviewed_on='2026-10-07'
    sdk_terms_accepted_by_user='2026-10-05'; license_file_created_or_modified=$false
    sdk_tools_executed=$false; emulator_started=$false; avd_created=$false
    apk_rebuilt=$false; android_runtime_verified=$false; os_settings_changed=$false
    existing_jdk_and_emulator_reused=$true; download_timeout_seconds=$DownloadTimeoutSeconds
    pin=$taskPin
}
$taskStage = 'preconditions'

function Assert-WorkspacePath([string]$Path) {
    $taskAbsolute = [IO.Path]::GetFullPath($Path)
    if (-not $taskAbsolute.StartsWith($taskRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'An API 36 setup path escaped the explicitly named project workspace.'
    }
    $taskAncestor = $taskAbsolute
    while ($taskAncestor -and $taskAncestor -ne $taskRoot) {
        if (Test-Path -LiteralPath $taskAncestor) {
            if (((Get-Item -LiteralPath $taskAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'API 36 setup refuses redirected workspace paths.'
            }
        }
        $taskAncestor = [IO.Path]::GetDirectoryName($taskAncestor)
    }
    return $taskAbsolute
}

function Get-RelativePath([string]$Path) {
    return [IO.Path]::GetRelativePath($taskRoot, $Path).Replace('\','/')
}

function Save-SetupReport {
    $taskChecked = Assert-WorkspacePath $taskReportPath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskChecked) | Out-Null
    $taskReport | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskChecked -Encoding utf8
}

function Read-Properties([string]$Path) {
    if (-not (Test-Path -LiteralPath (Assert-WorkspacePath $Path) -PathType Leaf)) {
        throw 'A required existing SDK properties file is missing.'
    }
    $taskValues = @{}
    foreach ($taskLine in (Get-Content -LiteralPath $Path)) {
        if ($taskLine -match '^([A-Za-z0-9_.]+)\s*=(.*)$') {
            if ($taskValues.ContainsKey($Matches[1])) { throw 'A required SDK properties file has duplicate fields.' }
            $taskValues[$Matches[1]] = $Matches[2].Trim()
        }
    }
    return $taskValues
}

function Assert-ImageProperties {
    $taskValues = Read-Properties (Join-Path $taskImage 'source.properties')
    if ($taskValues['Pkg.Revision'] -ne $taskPin.revision -or
            $taskValues['AndroidVersion.ApiLevel'] -ne '36' -or
            $taskValues['SystemImage.Abi'] -ne $taskPin.abi -or
            $taskValues['SystemImage.TagId'] -ne $taskPin.tag) {
        throw 'The existing API 36 image properties differ from the reviewed pin; nothing was overwritten.'
    }
    return $taskValues
}

function Test-ArchiveIdentity {
    return (Test-Path -LiteralPath $taskArchive -PathType Leaf) -and
        (Get-Item -LiteralPath $taskArchive).Length -eq $taskPin.expected_size_bytes -and
        (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA1).Hash.ToLowerInvariant() -eq $taskPin.official_sha1
}

function Assert-ZipEntries($Zip) {
    if ($Zip.Entries.Count -lt 1 -or $Zip.Entries.Count -gt 10000) { throw 'The verified image archive entry count is invalid.' }
    $taskSeen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($taskEntry in $Zip.Entries) {
        $taskName = $taskEntry.FullName.Replace('\','/')
        if ($taskName -match '(^|/)\.\.?(/|$)|^[\/]|:' -or
                -not $taskName.StartsWith('x86_64/',[StringComparison]::Ordinal) -or
                -not $taskSeen.Add($taskName.TrimEnd('/')) -or
                ((($taskEntry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000)) {
            throw 'The verified image archive contains an unsafe path, duplicate entry or symlink.'
        }
        $null = Assert-WorkspacePath (Join-Path (Split-Path -Parent $taskImage) $taskName)
    }
}

function Verify-ImageFiles($Zip) {
    $taskVerified = 0
    $taskFileHashes = [ordered]@{}
    foreach ($taskEntry in $Zip.Entries) {
        if ($taskEntry.FullName.EndsWith('/')) { continue }
        $taskTarget = Assert-WorkspacePath (Join-Path (Split-Path -Parent $taskImage) $taskEntry.FullName.Replace('/','\'))
        if (-not (Test-Path -LiteralPath $taskTarget -PathType Leaf) -or
                (Get-Item -LiteralPath $taskTarget).Length -ne $taskEntry.Length) {
            throw 'The extracted API 36 image differs from the verified archive; no image setup pass is recorded.'
        }
        $taskHasher = [Security.Cryptography.SHA256]::Create()
        $taskStream = $taskEntry.Open()
        try { $taskExpected = [Convert]::ToHexString($taskHasher.ComputeHash($taskStream)).ToLowerInvariant() }
        finally { $taskStream.Dispose(); $taskHasher.Dispose() }
        if ((Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpected) {
            throw 'An existing API 36 image file differs from the verified archive; it was not overwritten.'
        }
        $taskFileHashes[(Get-RelativePath $taskTarget)] = $taskExpected
        $taskVerified++
    }
    return [ordered]@{ count=$taskVerified; file_sha256=$taskFileHashes }
}

function Ensure-LocalRegistration($Metadata, $Remote) {
    $taskRegistration = Assert-WorkspacePath (Join-Path $taskImage 'package.xml')
    if (Test-Path -LiteralPath $taskRegistration) {
        if (-not (Test-Path -LiteralPath $taskRegistration -PathType Leaf)) { throw 'The image SDK registration is not a file.' }
        [xml]$taskExisting = Get-Content -LiteralPath $taskRegistration -Raw
        $taskLocal = $taskExisting.SelectSingleNode('//*[local-name()="localPackage"]')
        $taskLocalRevision = $taskLocal.SelectSingleNode('./*[local-name()="revision"]')
        $taskLocalDetails = $taskLocal.SelectSingleNode('./*[local-name()="type-details"]')
        if (-not $taskLocal -or $taskLocal.GetAttribute('path') -ne $taskPin.package_id -or
                (($taskLocalRevision.ChildNodes | ForEach-Object { $_.InnerText }) -join '.') -ne '2' -or
                $taskLocalDetails.SelectSingleNode('./*[local-name()="api-level"]').InnerText -ne '36' -or
                $taskLocalDetails.SelectSingleNode('./*[local-name()="extension-level"]').InnerText -ne '17' -or
                $taskLocalDetails.SelectSingleNode('./*[local-name()="base-extension"]').InnerText -ne 'true' -or
                $taskLocalDetails.SelectSingleNode('./*[local-name()="abi"]').InnerText -ne 'x86_64' -or
                $taskLocalDetails.SelectSingleNode('./*[local-name()="tag"]/*[local-name()="id"]').InnerText -ne 'default' -or
                $taskLocal.SelectSingleNode('./*[local-name()="uses-license"]').GetAttribute('ref') -ne $taskPin.license_id) {
            throw 'An existing SDK registration differs from the reviewed image; it was not overwritten.'
        }
        return 'existing_matching_local_registration'
    }
    $taskDocument = [xml]::new()
    $taskRepository = $taskDocument.CreateElement('common','repository','http://schemas.android.com/repository/android/common/02')
    foreach ($taskAttribute in $Metadata.DocumentElement.Attributes) {
        if ($taskAttribute.NamespaceURI -eq 'http://www.w3.org/2000/xmlns/') {
            $null = $taskRepository.Attributes.Append($taskDocument.ImportNode($taskAttribute,$true))
        }
    }
    $null = $taskDocument.AppendChild($taskRepository)
    $taskLicenseNode = $Metadata.SelectSingleNode('//*[local-name()="license"][@id="android-sdk-license"]')
    $null = $taskRepository.AppendChild($taskDocument.ImportNode($taskLicenseNode,$true))
    $taskLocal = $taskDocument.CreateElement('localPackage')
    $taskLocal.SetAttribute('path',$taskPin.package_id)
    $taskLocal.SetAttribute('obsolete','false')
    foreach ($taskField in @('type-details','revision','display-name','uses-license')) {
        $taskValue = $Remote.SelectSingleNode('./*[local-name()="' + $taskField + '"]')
        if (-not $taskValue) { throw 'Official image registration metadata is incomplete.' }
        $null = $taskLocal.AppendChild($taskDocument.ImportNode($taskValue,$true))
    }
    $null = $taskRepository.AppendChild($taskLocal)
    $taskDocument.Save($taskRegistration)
    return 'local_registration_derived_from_exact_official_remote_metadata'
}

try {
    foreach ($taskPath in @($taskSdk,$taskDownloads,$taskLicense,$taskImage,$taskArchive,$taskMetadataPath,$taskReportPath)) {
        $null = Assert-WorkspacePath $taskPath
    }
    if (-not (Test-Path -LiteralPath $taskCurl -PathType Leaf)) { throw 'Windows curl.exe is required for bounded official metadata/download reads.' }
    if (-not (Test-Path -LiteralPath $taskLicense -PathType Leaf) -or
            -not (@(Get-Content -LiteralPath $taskLicense) -contains $taskPin.previously_accepted_license_hash)) {
        throw 'The previously accepted SDK license is required. This script never accepts or writes license terms.'
    }
    $taskLicenseBefore = (Get-FileHash -LiteralPath $taskLicense -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskReport.existing_license = [ordered]@{ id=$taskPin.license_id; path=(Get-RelativePath $taskLicense); sha256_before=$taskLicenseBefore }
    $taskEmulatorProperties = Read-Properties (Join-Path $taskSdk 'emulator\source.properties')
    $taskCliProperties = Read-Properties (Join-Path $taskSdk 'cmdline-tools\22.0\source.properties')
    if ($taskEmulatorProperties['Pkg.Revision'] -ne $taskPin.reused_emulator_revision -or
            $taskCliProperties['Pkg.Revision'] -ne '22.0' -or
            -not (Test-Path -LiteralPath (Join-Path $taskSdk 'emulator\emulator.exe') -PathType Leaf) -or
            -not (Test-Path -LiteralPath (Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1\bin\java.exe') -PathType Leaf)) {
        throw 'The previously verified emulator, CLI and JDK are required; this setup installs none of them.'
    }
    if (Test-Path -LiteralPath $taskImage) { $null = Assert-ImageProperties }
    Save-SetupReport
    New-Item -ItemType Directory -Force -Path (Assert-WorkspacePath $taskDownloads) | Out-Null
    $taskStage = 'official_metadata_revalidation'
    & $taskCurl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' `
        --connect-timeout 20 --max-time 60 --max-filesize 2097152 --output $taskMetadataPath $taskPin.metadata_url
    if ($LASTEXITCODE -ne 0) { throw 'Official image metadata could not be retrieved within its bound.' }
    [xml]$taskMetadata = Get-Content -LiteralPath $taskMetadataPath -Raw
    $taskCandidates = $taskMetadata.SelectNodes('//*[local-name()="remotePackage"][@path="system-images;android-36;default;x86_64"]')
    if ($taskCandidates.Count -ne 1) { throw 'The reviewed official API 36 package is absent or ambiguous.' }
    $taskRemote = $taskCandidates[0]
    $taskDetails = $taskRemote.SelectSingleNode('./*[local-name()="type-details"]')
    $taskComplete = $taskRemote.SelectNodes('./*[local-name()="archives"]/*[local-name()="archive"]/*[local-name()="complete"]')
    $taskRevision = $taskRemote.SelectSingleNode('./*[local-name()="revision"]')
    $taskMinimum = $taskRemote.SelectSingleNode('./*[local-name()="dependencies"]/*[local-name()="dependency"][@path="emulator"]/*[local-name()="min-revision"]')
    if ((($taskRevision.ChildNodes | ForEach-Object { $_.InnerText }) -join '.') -ne $taskPin.revision -or
            $taskRemote.SelectSingleNode('./*[local-name()="channelRef"]').GetAttribute('ref') -ne $taskPin.channel -or
            $taskDetails.SelectSingleNode('./*[local-name()="api-level"]').InnerText -ne '36' -or
            $taskDetails.SelectSingleNode('./*[local-name()="extension-level"]').InnerText -ne $taskPin.extension_level -or
            $taskDetails.SelectSingleNode('./*[local-name()="base-extension"]').InnerText -ne $taskPin.base_extension -or
            $taskDetails.SelectSingleNode('./*[local-name()="abi"]').InnerText -ne $taskPin.abi -or
            $taskDetails.SelectSingleNode('./*[local-name()="tag"]/*[local-name()="id"]').InnerText -ne $taskPin.tag -or
            (($taskMinimum.ChildNodes | ForEach-Object { $_.InnerText }) -join '.') -ne $taskPin.min_emulator_revision -or
            $taskComplete.Count -ne 1 -or
            $taskComplete[0].SelectSingleNode('./*[local-name()="url"]').InnerText -ne $taskPin.archive_name -or
            [long]$taskComplete[0].SelectSingleNode('./*[local-name()="size"]').InnerText -ne $taskPin.expected_size_bytes -or
            $taskComplete[0].SelectSingleNode('./*[local-name()="checksum"][@type="sha1"]').InnerText -ne $taskPin.official_sha1 -or
            $taskRemote.SelectSingleNode('./*[local-name()="uses-license"]').GetAttribute('ref') -ne $taskPin.license_id) {
        throw 'Official package metadata differs from the reviewed API 36 pin; no package was installed.'
    }
    $taskOfficialLicense = $taskMetadata.SelectSingleNode('//*[local-name()="license"][@id="android-sdk-license"]')
    if (-not $taskOfficialLicense) { throw 'The official package license text is absent.' }
    $taskLicenseTextHash = [Convert]::ToHexString([Security.Cryptography.SHA1]::HashData(
        [Text.Encoding]::UTF8.GetBytes($taskOfficialLicense.InnerText.Trim()))).ToLowerInvariant()
    if ($taskLicenseTextHash -ne $taskPin.reviewed_license_text_sha1) {
        throw 'The official package terms differ from the already reviewed SDK terms; nothing was accepted or installed.'
    }
    $taskReport.metadata = [ordered]@{
        path=(Get-RelativePath $taskMetadataPath); url=$taskPin.metadata_url; retrieved_at=[DateTime]::UtcNow.ToString('o')
        sha256=(Get-FileHash -LiteralPath $taskMetadataPath -Algorithm SHA256).Hash.ToLowerInvariant()
        exact_revision_archive_size_sha1_and_license_revalidated=$true; license_text_sha1=$taskLicenseTextHash
    }
    Save-SetupReport
    $taskStage = 'official_archive_download_and_verification'
    $taskReused = Test-ArchiveIdentity
    $taskResumed = [long]0
    if (-not $taskReused) {
        if (Test-Path -LiteralPath $taskArchive) {
            if (-not (Test-Path -LiteralPath $taskArchive -PathType Leaf) -or
                    (Get-Item -LiteralPath $taskArchive).Length -ge $taskPin.expected_size_bytes) {
                throw 'A mismatched completed archive is retained for review; it was not deleted or overwritten.'
            }
            $taskResumed = (Get-Item -LiteralPath $taskArchive).Length
        }
        & $taskCurl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' `
            --continue-at '-' --connect-timeout 20 --max-time $DownloadTimeoutSeconds `
            --speed-limit 1024 --speed-time 60 --output $taskArchive $taskPin.archive_url
        if ($LASTEXITCODE -ne 0) { throw 'The bounded archive download did not complete; its partial file remains for a later resume.' }
        if (-not (Test-ArchiveIdentity)) { throw 'The downloaded archive differs from official size/SHA1; nothing was extracted or executed.' }
    }
    $taskReport.archive = [ordered]@{
        path=(Get-RelativePath $taskArchive); verified_size_bytes=(Get-Item -LiteralPath $taskArchive).Length
        sha1=(Get-FileHash -LiteralPath $taskArchive -Algorithm SHA1).Hash.ToLowerInvariant()
        sha256=(Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        reused_verified_archive=[bool]$taskReused; resumed_from_bytes=$taskResumed
    }
    Save-SetupReport
    $taskStage = 'verified_archive_extraction'
    $taskZip = [IO.Compression.ZipFile]::OpenRead($taskArchive)
    try {
        Assert-ZipEntries $taskZip
        $taskExisting = Test-Path -LiteralPath $taskImage
        if (-not $taskExisting) {
            New-Item -ItemType Directory -Force -Path (Assert-WorkspacePath (Split-Path -Parent $taskImage)) | Out-Null
            [IO.Compression.ZipFile]::ExtractToDirectory($taskArchive,(Split-Path -Parent $taskImage),$false)
        }
        $taskProperties = Assert-ImageProperties
        if (-not (Test-Path -LiteralPath (Join-Path $taskImage 'system.img') -PathType Leaf)) { throw 'The extracted image lacks its required system image.' }
        $taskVerifiedFiles = Verify-ImageFiles $taskZip
    } finally { $taskZip.Dispose() }
    if (-not (Test-ArchiveIdentity)) { throw 'The official archive changed during image verification.' }
    $taskStage = 'official_local_registration'
    $taskRegistrationOrigin = Ensure-LocalRegistration $taskMetadata $taskRemote
    $taskReport.layout = [ordered]@{
        directory=(Get-RelativePath $taskImage); extracted_by_this_run=-not [bool]$taskExisting
        files_verified_against_archive=$taskVerifiedFiles.count; file_sha256=$taskVerifiedFiles.file_sha256
        parsed_source_properties=$taskProperties
        source_properties_sha256=(Get-FileHash -LiteralPath (Join-Path $taskImage 'source.properties') -Algorithm SHA256).Hash.ToLowerInvariant()
        registration_origin=$taskRegistrationOrigin
        registration_sha256=(Get-FileHash -LiteralPath (Join-Path $taskImage 'package.xml') -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $taskStage = 'license_integrity'
    $taskReport.existing_license.sha256_after = (Get-FileHash -LiteralPath $taskLicense -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($taskReport.existing_license.sha256_after -ne $taskLicenseBefore) { throw 'The existing SDK license file changed during setup.' }
    $taskReport.result='pass_image_setup_only'
    $taskReport.setup_script_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskReport.finished_at=[DateTime]::UtcNow.ToString('o')
    Save-SetupReport
    Write-Output 'PASS: Pinned API 36 AOSP image verified locally. No emulator boot, Android test, APK change or new SDK-term acceptance is implied.'
} catch {
    $taskReport.result='fail'; $taskReport.failed_stage=$taskStage
    $taskReport.failure=$_.Exception.Message; $taskReport.finished_at=[DateTime]::UtcNow.ToString('o')
    Save-SetupReport
    throw
}
