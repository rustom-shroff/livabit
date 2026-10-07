$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTools = Join-Path $taskRoot 'artifacts\android-tools'
$taskJdk = Join-Path $taskTools 'jdk\jdk-17.0.20.1+1'
$taskSdk = Join-Path $taskRoot 'artifacts\android-sdk'
$taskGradle = Join-Path $taskTools 'gradle\gradle-9.4.1\bin\gradle.bat'
foreach ($taskRequired in @($taskGradle, (Join-Path $taskJdk 'bin\java.exe'), (Join-Path $taskSdk 'platforms\android-37.0\android.jar'), (Join-Path $taskSdk 'build-tools\36.0.0\aapt2.exe'))) {
    if (-not (Test-Path -LiteralPath $taskRequired)) { throw 'Pinned tools are missing. Complete the explicitly approved SDK setup first.' }
}
$taskPrevious = @{ JAVA_HOME=$env:JAVA_HOME; ANDROID_HOME=$env:ANDROID_HOME; ANDROID_SDK_ROOT=$env:ANDROID_SDK_ROOT; GRADLE_USER_HOME=$env:GRADLE_USER_HOME; ANDROID_USER_HOME=$env:ANDROID_USER_HOME }
try {
    $env:JAVA_HOME = $taskJdk
    $env:ANDROID_HOME = $taskSdk
    $env:ANDROID_SDK_ROOT = $taskSdk
    $env:GRADLE_USER_HOME = Join-Path $taskRoot 'artifacts\android-gradle-cache'
    $env:ANDROID_USER_HOME = Join-Path $taskRoot 'artifacts\android-user'
    $taskDebugKey = Join-Path $taskRoot 'artifacts\android-debug.keystore'
    if (-not (Test-Path -LiteralPath $taskDebugKey)) {
        # Conventional public debug passwords; this key is never a production credential.
        & (Join-Path $taskJdk 'bin\keytool.exe') -genkeypair -keystore $taskDebugKey -storepass android -keypass android -alias androiddebugkey -dname 'CN=liveabit Local Development' -keyalg RSA -keysize 2048 -validity 10000
        if ($LASTEXITCODE -ne 0) { throw 'Local development signing key generation failed.' }
    }
    & $taskGradle -p (Join-Path $taskRoot 'android') --no-daemon --console=plain ':collector-core:coreFixtures' ':fixture-core:coreFixtures' ':app:assembleDebug' ':app:lintDebug' ':fixture-app:assembleDebug' ':fixture-app:lintDebug'
    if ($LASTEXITCODE -ne 0) { throw 'Android build/checks failed.' }
} finally {
    $env:JAVA_HOME = $taskPrevious.JAVA_HOME
    $env:ANDROID_HOME = $taskPrevious.ANDROID_HOME
    $env:ANDROID_SDK_ROOT = $taskPrevious.ANDROID_SDK_ROOT
    $env:GRADLE_USER_HOME = $taskPrevious.GRADLE_USER_HOME
    $env:ANDROID_USER_HOME = $taskPrevious.ANDROID_USER_HOME
}
