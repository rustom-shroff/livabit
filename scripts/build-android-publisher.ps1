param([switch]$Offline)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTools = Join-Path $taskRoot 'artifacts\android-tools'
$taskNames = @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','GRADLE_USER_HOME','ANDROID_USER_HOME')
$taskPrevious = @{}
foreach ($taskName in $taskNames) { $taskPrevious[$taskName] = [Environment]::GetEnvironmentVariable($taskName,'Process') }
try {
    $env:JAVA_HOME = Join-Path $taskTools 'jdk\jdk-17.0.20.1+1'
    $env:ANDROID_HOME = Join-Path $taskRoot 'artifacts\android-sdk'
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
    $env:GRADLE_USER_HOME = Join-Path $taskRoot 'artifacts\android-gradle-cache'
    $env:ANDROID_USER_HOME = Join-Path $taskRoot 'artifacts\android-user'
    $taskArguments = @('-p', (Join-Path $taskRoot 'android'), '--no-daemon', '--console=plain')
    if ($Offline) { $taskArguments += '--offline' }
    $taskArguments += @(':publisher-app:assembleDebug', ':publisher-app:assembleDebugAndroidTest', ':publisher-app:lintDebug')
    & (Join-Path $taskTools 'gradle\gradle-9.4.1\bin\gradle.bat') @taskArguments
    if ($LASTEXITCODE -ne 0) { throw 'Android sender build failed.' }
    $taskOutput = Join-Path $taskRoot 'artifacts\android-publisher'
    New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
    Copy-Item -LiteralPath (Join-Path $taskRoot 'android\publisher-app\build\outputs\apk\debug\publisher-app-debug.apk') -Destination (Join-Path $taskOutput 'liveabit-sender-0.10.0-poc.apk')
    Get-FileHash -LiteralPath (Join-Path $taskOutput 'liveabit-sender-0.10.0-poc.apk') -Algorithm SHA256
} finally {
    foreach ($taskName in $taskNames) { [Environment]::SetEnvironmentVariable($taskName,$taskPrevious[$taskName],'Process') }
}
