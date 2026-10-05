param([string]$JdkPath)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $JdkPath) { $JdkPath = Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1' }
$taskClasses = Join-Path $taskRoot ("artifacts\android-core-test\run-" + [Guid]::NewGuid().ToString('N') + '\classes')
New-Item -ItemType Directory -Force -Path $taskClasses | Out-Null
$taskSources = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'android\collector-core\src') -Recurse -File -Filter '*.java' | ForEach-Object FullName)
if ($taskSources.Count -lt 2) { throw 'Native core and fixture sources are missing.' }
foreach ($taskExpected in @('src\main\java\org\liveabit\collector\core\LocalInspectionCore.java', 'src\test\java\org\liveabit\collector\core\LocalInspectionCoreTest.java')) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot ('android\collector-core\' + $taskExpected)))) { throw 'The declared native core or test harness is missing.' }
}
& (Join-Path $JdkPath 'bin\javac.exe') -encoding UTF-8 --release 17 -d $taskClasses @taskSources
if ($LASTEXITCODE -ne 0) { throw 'Native core compilation failed.' }
& (Join-Path $JdkPath 'bin\java.exe') -ea -cp $taskClasses 'org.liveabit.collector.core.LocalInspectionCoreTest'
if ($LASTEXITCODE -ne 0) { throw 'Native core fixtures failed.' }
