param([string]$JdkPath)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $JdkPath) { $JdkPath = Join-Path $taskRoot 'artifacts\android-tools\jdk\jdk-17.0.20.1+1' }
$taskClasses = Join-Path $taskRoot ("artifacts\android-fixture-test\run-" + [Guid]::NewGuid().ToString('N') + '\classes')
New-Item -ItemType Directory -Force -Path $taskClasses | Out-Null
$taskSources = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'android\fixture-core\src') -Recurse -File -Filter '*.java' | ForEach-Object FullName)
foreach ($taskExpected in @('src\main\java\org\liveabit\fixture\core\LifecycleFixtureCore.java', 'src\test\java\org\liveabit\fixture\core\LifecycleFixtureCoreTest.java')) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot ('android\fixture-core\' + $taskExpected)))) { throw 'The declared fixture ledger or test harness is missing.' }
}
& (Join-Path $JdkPath 'bin\javac.exe') -encoding UTF-8 --release 17 -d $taskClasses @taskSources
if ($LASTEXITCODE -ne 0) { throw 'Owned fixture compilation failed.' }
& (Join-Path $JdkPath 'bin\java.exe') -ea -cp $taskClasses 'org.liveabit.fixture.core.LifecycleFixtureCoreTest'
if ($LASTEXITCODE -ne 0) { throw 'Owned lifecycle fixture checks failed.' }
