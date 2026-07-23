# specificity statusline indicator (PowerShell)
# Shows [SPECIFICITY] in the Claude Code status bar when active

$stateFile = "$env:USERPROFILE\.specificity\.specificity-active"
if (Test-Path $stateFile) {
    Write-Output "[SPECIFICITY]"
}
