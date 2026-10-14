param([ValidatePattern('^[a-z][a-z0-9_-]{0,63}$')][string]$AgentId = 'main', [switch]$RestartGateway)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPlugin=Join-Path $taskRoot 'integrations/openclaw/personal-agent'
$taskFiles=@('package.json','openclaw.plugin.json','index.mjs','ingress.mjs','runtime.mjs','observation.mjs','store.mjs','notification.mjs','configuration.mjs','installer.mjs')
$taskPayload=@{agent_id=$AgentId;files=@{}}
foreach($taskFile in $taskFiles){$taskPayload.files[$taskFile]=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $taskPlugin $taskFile)))}
$taskPayload.guide=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $taskRoot 'integrations/openclaw/activity-agent.md')))
$taskPayload.skill=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $taskRoot 'integrations/openclaw/skills/liveabit/SKILL.md')))
$taskPayload.workflow=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $taskRoot 'integrations/openclaw/skills/liveabit/references/personal-agent-workflow.md')))
$taskVersionHash=[Security.Cryptography.SHA256]::Create()
try{$taskPayload.version=[BitConverter]::ToString($taskVersionHash.ComputeHash([Text.Encoding]::UTF8.GetBytes(($taskPayload|ConvertTo-Json -Depth 5 -Compress)))).Replace('-','').ToLowerInvariant()}finally{$taskVersionHash.Dispose()}
$taskGuest=@'
$ErrorActionPreference='Stop'
$taskUtf8=New-Object Text.UTF8Encoding $false
$taskPayload=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PAYLOAD__'))|ConvertFrom-Json
$taskState=if($env:OPENCLAW_STATE_DIR){$env:OPENCLAW_STATE_DIR}else{Join-Path $env:USERPROFILE '.openclaw'}
$taskOwned=[IO.Path]::GetFullPath((Join-Path $taskState 'liveabit-personal-agent'))
if($taskPayload.version -notmatch '^[a-f0-9]{64}$'){throw 'Invalid immutable bundle identity.'}
$taskPlugin=[IO.Path]::GetFullPath((Join-Path (Join-Path $taskOwned 'versions') $taskPayload.version))
if(-not $taskPlugin.StartsWith($taskOwned+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid plugin installation path.'}
New-Item -ItemType Directory -Force -Path $taskPlugin|Out-Null
foreach($taskFile in $taskPayload.files.PSObject.Properties){
  if($taskFile.Name -notmatch '^[a-z][a-z0-9.-]+$'){throw 'Invalid bundled filename.'}
  $taskTarget=Join-Path $taskPlugin $taskFile.Name
  $taskContents=[Convert]::FromBase64String($taskFile.Value)
  if(Test-Path -LiteralPath $taskTarget){
    if([Convert]::ToBase64String([IO.File]::ReadAllBytes($taskTarget)) -cne $taskFile.Value){throw 'An immutable source bundle differs from its saved bytes.'}
  }else{[IO.File]::WriteAllBytes($taskTarget,$taskContents)}
}
[IO.File]::WriteAllText((Join-Path $taskPlugin 'install-payload.json'),($taskPayload|ConvertTo-Json -Depth 5 -Compress),$taskUtf8)
& node (Join-Path $taskPlugin 'installer.mjs') --agent $taskPayload.agent_id __MODE__
if($LASTEXITCODE -ne 0){throw 'Personal-agent installation failed; private backups/diagnostics remain in the agent host.'}
'@
$taskGuest=$taskGuest.Replace('__PAYLOAD__',[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($taskPayload|ConvertTo-Json -Depth 5 -Compress))))
$taskGuest=$taskGuest.Replace('__MODE__',$(if($RestartGateway){'--prepare-stopped-update'}else{''}))
$taskBytes=[Text.Encoding]::UTF8.GetBytes($taskGuest)
$taskBuffer=[IO.MemoryStream]::new()
$taskCompressor=[IO.Compression.GZipStream]::new($taskBuffer,[IO.Compression.CompressionMode]::Compress,$true)
try{$taskCompressor.Write($taskBytes,0,$taskBytes.Length)}finally{$taskCompressor.Dispose()}
$taskEncoded=[Convert]::ToBase64String($taskBuffer.ToArray());$taskBuffer.Dispose()
$taskHash=[Security.Cryptography.SHA256]::Create()
try{$taskDigest=[BitConverter]::ToString($taskHash.ComputeHash([Convert]::FromBase64String($taskEncoded))).Replace('-','').ToLowerInvariant()}finally{$taskHash.Dispose()}
$taskTransferId=[Guid]::NewGuid().ToString('N')
$taskCtl=Join-Path (Split-Path (Get-Command openclaw.exe).Source) 'clawctl.exe'
# Transfer immutable source in bounded chunks instead of exceeding Windows'
# process command-line limit. This is an owned staging file, never activity.
for($taskOffset=0;$taskOffset -lt $taskEncoded.Length;$taskOffset+=16000){
  $taskChunk=$taskEncoded.Substring($taskOffset,[Math]::Min(16000,$taskEncoded.Length-$taskOffset))
  $taskChunkCommand=@'
$taskState=if($env:OPENCLAW_STATE_DIR){$env:OPENCLAW_STATE_DIR}else{Join-Path $env:USERPROFILE '.openclaw'}
$taskOwned=Join-Path $taskState 'liveabit-personal-agent'
New-Item -ItemType Directory -Force -Path $taskOwned|Out-Null
[IO.File]::AppendAllText((Join-Path $taskOwned 'install-transfer-__ID__.b64'),'__CHUNK__',[Text.UTF8Encoding]::new($false))
'@
  $taskChunkCommand=$taskChunkCommand.Replace('__ID__',$taskTransferId).Replace('__CHUNK__',$taskChunk)
  $taskChunkRaw=@(& $taskCtl pwsh --command $taskChunkCommand 2>&1)
  if($LASTEXITCODE -ne 0){throw 'Could not stage the bounded source transfer; no configuration was applied.'}
}
$taskCommand=@'
$taskState=if($env:OPENCLAW_STATE_DIR){$env:OPENCLAW_STATE_DIR}else{Join-Path $env:USERPROFILE '.openclaw'}
$taskTransfer=Join-Path (Join-Path $taskState 'liveabit-personal-agent') 'install-transfer-__ID__.b64'
$taskBytes=[Convert]::FromBase64String([IO.File]::ReadAllText($taskTransfer))
$taskHash=[Security.Cryptography.SHA256]::Create()
try{$taskDigest=[BitConverter]::ToString($taskHash.ComputeHash($taskBytes)).Replace('-','').ToLowerInvariant()}finally{$taskHash.Dispose()}
if($taskDigest -cne '__DIGEST__'){throw 'Bundled source transfer failed its integrity check.'}
$taskInput=[IO.MemoryStream]::new($taskBytes)
$taskReader=[IO.StreamReader]::new([IO.Compression.GZipStream]::new($taskInput,[IO.Compression.CompressionMode]::Decompress),[Text.Encoding]::UTF8)
try{$taskScript=$taskReader.ReadToEnd()}finally{$taskReader.Dispose();$taskInput.Dispose()}
Remove-Item -LiteralPath $taskTransfer
& ([scriptblock]::Create($taskScript))
'@
$taskCommand=$taskCommand.Replace('__ID__',$taskTransferId).Replace('__DIGEST__',$taskDigest)
if($taskCommand.Length -gt 30000){throw 'Bundled installation exceeds the bounded Windows command limit.'}
$taskRaw=@(& $taskCtl pwsh --command $taskCommand 2>&1)
$taskExit=$LASTEXITCODE
$taskOutput=Join-Path $taskRoot 'artifacts/openclaw/personal-agent'
New-Item -ItemType Directory -Force -Path $taskOutput|Out-Null
[IO.File]::WriteAllText((Join-Path $taskOutput 'installation-private.txt'),($taskRaw -join [Environment]::NewLine),[Text.UTF8Encoding]::new($false))
if($taskExit -ne 0){throw 'Personal-agent setup failed. Private diagnostics were saved; no notification was sent.'}
if($RestartGateway){
  # Preparation captures a fresh native inventory bound to the exact current
  # configuration and delivery files. Apply while stopped avoids the managed
  # Windows host's replacement-plugin capture symlink failure.
  $taskStatusRaw=@(& $taskCtl gateway-service status --json 2>&1)
  if($LASTEXITCODE -ne 0){throw 'Could not verify the managed gateway state; configuration was not applied.'}
  $taskStatus=($taskStatusRaw -join [Environment]::NewLine)|ConvertFrom-Json
  if($taskStatus.ok -ne $true -or $taskStatus.gateway.state -ne 'running'){throw 'A running gateway is required for the controlled update.'}
  $taskResume=$false
  try{
    $taskResume=$true
    $taskStopRaw=@(& $taskCtl gateway-service stop --json 2>&1)
    if($LASTEXITCODE -ne 0){throw 'Could not pause the managed gateway for the update.'}
    $taskApply=@'
$ErrorActionPreference='Stop'
$taskState=if($env:OPENCLAW_STATE_DIR){$env:OPENCLAW_STATE_DIR}else{Join-Path $env:USERPROFILE '.openclaw'}
$taskPlugin=Join-Path (Join-Path (Join-Path $taskState 'liveabit-personal-agent') 'versions') '__VERSION__'
& node (Join-Path $taskPlugin 'installer.mjs') --agent '__AGENT__' --use-prepared-inventory
if($LASTEXITCODE -ne 0){throw 'Stopped-gateway installation failed; private diagnostics remain in the host.'}
'@
    $taskApply=$taskApply.Replace('__VERSION__',$taskPayload.version).Replace('__AGENT__',$AgentId)
    $taskRaw=@(& $taskCtl pwsh --command $taskApply 2>&1)
    $taskExit=$LASTEXITCODE
    [IO.File]::WriteAllText((Join-Path $taskOutput 'installation-private.txt'),($taskRaw -join [Environment]::NewLine),[Text.UTF8Encoding]::new($false))
    if($taskExit -ne 0){throw 'Personal-agent update failed. Private diagnostics were saved; no notification was sent.'}
  }finally{
    if($taskResume){
      $taskStartRaw=@(& $taskCtl gateway-service start --json 2>&1)
      if($LASTEXITCODE -ne 0){throw 'The managed gateway could not resume; use its service start control. Private setup diagnostics remain available.'}
    }
  }
}
$taskResult=($taskRaw -join [Environment]::NewLine)|ConvertFrom-Json
$taskResult|ConvertTo-Json -Depth 6
