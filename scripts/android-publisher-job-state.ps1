# Parse the actual API 35 shell contract; unrelated "unknown" errors are not absence.
function ConvertFrom-PublisherJobResponse([string]$Text, [int]$ExitCode, [int]$JobId) {
    $taskLines = @($Text -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
    $taskMissingHeader = '^unknown\(u0a[0-9]+/jid' + [regex]::Escape([string]$JobId) + '\)$'
    $taskMissingDetail = 'Could not find job ' + $JobId + ' in package org.liveabit.publish / user 0'
    $taskAbsent = $taskLines.Count -ge 1 -and $taskLines.Count -le 2 -and $taskLines[0] -match $taskMissingHeader
    if ($taskAbsent -and $taskLines.Count -eq 2) { $taskAbsent = $taskLines[1] -ceq $taskMissingDetail }
    if ($taskAbsent) { return ($taskLines -join "`n") }
    if ($ExitCode -ne 0 -or $taskLines.Count -eq 0 -or $Text -match '\bunknown\b') {
        throw 'Owned publisher job state could not be read.'
    }
    return ($taskLines -join "`n")
}
