param(
    [ValidateSet('Jvm', 'Sdk')][string]$Stage = 'Jvm',
    [switch]$AndroidSdkTermsAccepted
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTools = Join-Path $taskRoot 'artifacts\android-tools'
$taskDownloads = Join-Path $taskTools 'downloads'
New-Item -ItemType Directory -Force -Path $taskDownloads | Out-Null
if ($Stage -eq 'Sdk' -and -not $AndroidSdkTermsAccepted) {
    throw 'SDK setup requires explicit user acceptance of https://developer.android.com/studio/terms before download or use.'
}
function Get-VerifiedArchive([string]$Name, [string]$Uri, [string]$Digest) {
    $taskArchive = Join-Path $taskDownloads $Name
    if (-not (Test-Path -LiteralPath $taskArchive)) {
        Invoke-WebRequest -Uri $Uri -OutFile $taskArchive -TimeoutSec 600
    }
    if ((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Digest) {
        throw "Archive verification failed: $Name. The file was not executed or extracted."
    }
    return $taskArchive
}
$taskJdkZip = Get-VerifiedArchive 'temurin-17.0.20.1_1-windows-x64.zip' 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip' 'e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0'
$taskJdkArea = Join-Path $taskTools 'jdk'
if (-not (Test-Path -LiteralPath (Join-Path $taskJdkArea 'jdk-17.0.20.1+1\bin\javac.exe'))) {
    Expand-Archive -LiteralPath $taskJdkZip -DestinationPath $taskJdkArea -Force
}
$taskJdk = Join-Path $taskJdkArea 'jdk-17.0.20.1+1'
if (-not (Test-Path -LiteralPath (Join-Path $taskJdk 'bin\javac.exe'))) { throw 'The verified JDK archive has an unexpected layout.' }
if ($Stage -eq 'Jvm') {
    & (Join-Path $taskJdk 'bin\java.exe') -version
    if ($LASTEXITCODE -ne 0) { throw 'The pinned JVM did not run.' }
    Write-Output 'Portable JVM ready inside this workspace. System settings were not modified.'
    exit 0
}
$taskGradleZip = Get-VerifiedArchive 'gradle-9.4.1-bin.zip' 'https://services.gradle.org/distributions/gradle-9.4.1-bin.zip' '2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb'
$taskGradleArea = Join-Path $taskTools 'gradle'
if (-not (Test-Path -LiteralPath (Join-Path $taskGradleArea 'gradle-9.4.1\bin\gradle.bat'))) {
    Expand-Archive -LiteralPath $taskGradleZip -DestinationPath $taskGradleArea -Force
}
$taskCliZip = Get-VerifiedArchive 'commandlinetools-win-15859902.zip' 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
$taskCliArea = Join-Path $taskTools 'command-line'
if (-not (Test-Path -LiteralPath (Join-Path $taskCliArea 'cmdline-tools\bin\sdkmanager.bat'))) {
    Expand-Archive -LiteralPath $taskCliZip -DestinationPath $taskCliArea -Force
}
$taskSdk = Join-Path $taskRoot 'artifacts\android-sdk'
New-Item -ItemType Directory -Force -Path $taskSdk | Out-Null
$taskPriorJavaHome = $env:JAVA_HOME
$taskPriorAndroidUserHome = $env:ANDROID_USER_HOME
try {
    $env:JAVA_HOME = $taskJdk
    $env:ANDROID_USER_HOME = Join-Path $taskRoot 'artifacts\android-user'
    New-Item -ItemType Directory -Force -Path $env:ANDROID_USER_HOME | Out-Null
    $taskManager = Join-Path $taskCliArea 'cmdline-tools\bin\sdkmanager.bat'
    # Installation displays only terms needed by these selected stable packages.
    # No generated license files, automatic answers, or unrelated package terms.
    & $taskManager "--sdk_root=$taskSdk" --channel=0 'platforms;android-37.0' 'build-tools;36.0.0'
    if ($LASTEXITCODE -ne 0) { throw 'Pinned SDK package installation failed.' }
} finally {
    $env:JAVA_HOME = $taskPriorJavaHome
    $env:ANDROID_USER_HOME = $taskPriorAndroidUserHome
}
Write-Output 'Pinned Android build tools prepared. No device was queried or installed.'
