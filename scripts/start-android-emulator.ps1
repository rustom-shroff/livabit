param()
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskSdk = Join-Path $taskRoot 'artifacts\android-sdk'
$taskArea = Join-Path $taskRoot 'artifacts\android-emulator'
$taskAvdHome = Join-Path $taskArea 'avd'
$taskAvdPath = Join-Path $taskAvdHome 'liveabit-api35-test.avd'
$taskEmulator = Join-Path $taskSdk 'emulator\emulator.exe'
$taskImage = Join-Path $taskSdk 'system-images\android-35\default\x86_64'
foreach ($taskRequired in @($taskEmulator,(Join-Path $taskImage 'system.img'))) {
    if (-not (Test-Path -LiteralPath $taskRequired)) { throw 'The pinned emulator or Android 15 image is not installed.' }
}
$taskEmulatorProperties = Get-Content -LiteralPath (Join-Path $taskSdk 'emulator\source.properties') -Raw
$taskImageProperties = Get-Content -LiteralPath (Join-Path $taskImage 'source.properties') -Raw
if ($taskEmulatorProperties -notmatch '(?m)^Pkg.Revision\s*=\s*37\.2\.12\s*$' -or $taskImageProperties -notmatch '(?m)^Pkg.Revision\s*=\s*2\s*$' -or $taskImageProperties -notmatch '(?m)^AndroidVersion.ApiLevel\s*=\s*35\s*$') { throw 'Emulator/image revisions differ from the reviewed pins.' }
foreach ($taskDirectory in @($taskArea,$taskAvdHome,(Join-Path $taskArea 'user'),(Join-Path $taskArea 'logs'))) { New-Item -ItemType Directory -Force -Path $taskDirectory | Out-Null }
$taskNames = @('JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','ANDROID_USER_HOME','ANDROID_EMULATOR_HOME','ANDROID_AVD_HOME','ANDROID_I_WANT_MY_TCG')
$taskPrevious = @{}
foreach ($taskName in $taskNames) { $taskPrevious[$taskName] = [Environment]::GetEnvironmentVariable($taskName,'Process') }
try {
    $env:JAVA_HOME = Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1'
    $env:ANDROID_HOME = $taskSdk
    $env:ANDROID_SDK_ROOT = $taskSdk
    $env:ANDROID_USER_HOME = Join-Path $taskRoot 'artifacts\android-user'
    $env:ANDROID_EMULATOR_HOME = Join-Path $taskArea 'user'
    $env:ANDROID_AVD_HOME = $taskAvdHome
    if (-not (Test-Path -LiteralPath (Join-Path $taskAvdHome 'liveabit-api35-test.ini'))) {
        # avdmanager derives the SDK from its own location, not ANDROID_SDK_ROOT.
        'no' | & (Join-Path $taskSdk 'cmdline-tools\22.0\bin\avdmanager.bat') create avd -n 'liveabit-api35-test' -k 'system-images;android-35;default;x86_64' -p $taskAvdPath -d 'pixel_2'
        if ($LASTEXITCODE -ne 0) { throw 'The owned local AVD could not be created.' }
    }
    # Only this named project-local AVD may be wiped. Never use a user's unrelated AVD.
    $taskIni = Get-Content -LiteralPath (Join-Path $taskAvdHome 'liveabit-api35-test.ini') -Raw
    $taskRegisteredPath = ([regex]::Match($taskIni,'(?m)^path=(.+)$').Groups[1].Value).Trim()
    if ([IO.Path]::GetFullPath($taskRegisteredPath) -ne [IO.Path]::GetFullPath($taskAvdPath)) { throw 'AVD registration points outside the owned path; no emulator started.' }
    foreach ($taskPort in @(5580,5581)) {
        $taskListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$taskPort)
        try { $taskListener.Start() } catch { throw 'A required test-emulator port is in use; no existing device was stopped.' } finally { $taskListener.Stop() }
    }
    $taskAccel = @(& $taskEmulator -accel-check 2>&1)
    $taskAccelExit = $LASTEXITCODE
    $taskAccel | Set-Content -LiteralPath (Join-Path $taskArea 'logs\acceleration.txt') -Encoding utf8
    $taskMode = if ($taskAccelExit -eq 0) { 'on' } else { 'off' }
    if ($taskMode -eq 'off') { $env:ANDROID_I_WANT_MY_TCG='yes' }
    $taskArgs = @('-avd','liveabit-api35-test','-port','5580','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-wipe-data','-camera-back','none','-camera-front','none','-gpu','software','-accel',$taskMode,'-memory','2048')
    $taskProcess = Start-Process -FilePath $taskEmulator -ArgumentList $taskArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskArea 'logs\stdout.txt') -RedirectStandardError (Join-Path $taskArea 'logs\stderr.txt') -PassThru
    $taskRun = [ordered]@{ name='liveabit-api35-test'; serial='emulator-5580'; pid=$taskProcess.Id; avd_path=$taskAvdPath; api=35; image='system-images;android-35;default;x86_64'; image_revision=2; emulator_version='37.2.12'; cpu_acceleration=$taskMode; graphics='software'; created_at=[DateTime]::UtcNow.ToString('o'); os_settings_changed=$false; contains_personal_data=$false }
    $taskRun | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskArea 'run.json') -Encoding utf8
    $taskRun | ConvertTo-Json
} finally {
    foreach ($taskName in $taskNames) { [Environment]::SetEnvironmentVariable($taskName,$taskPrevious[$taskName],'Process') }
}
