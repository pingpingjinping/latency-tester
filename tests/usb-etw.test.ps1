# Run with Windows PowerShell 5.1 or pwsh. No administrator/device access.
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools/usb-etw.ps1'
$tokens = $null; $errors = $null
[Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count) { throw ($errors | Out-String) }
. $scriptPath

$root = Join-Path ([IO.Path]::GetTempPath()) ('rakka-etw-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$path = Join-Path $root 'active-session.json'
$script:calls = @(); $script:failOn = ''
function Invoke-Logman([string[]]$Arguments, [string]$LogPath) {
    $script:calls += ,$Arguments
    if ($Arguments[0] -eq $script:failOn) { return 1 }
    return 0
}
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Save-State($State) { $State | ConvertTo-Json | Set-Content -LiteralPath $path -Encoding utf8 }
function Expect-Failure([scriptblock]$Body) {
    $failed = $false
    try { & $Body } catch { $failed = $true }
    Assert $failed 'Expected failure was not raised.'
}
try {
    $state = @{ session = 'unrelated-trace'; directory = $root; status = 'running' }
    Save-State $state
    Expect-Failure { Stop-OwnSession $state $path }
    Assert ($script:calls.Count -eq 0) 'Invalid session name reached logman.'

    $state.session = 'rakka-rev3-' + ('a' * 32)
    Save-State $state
    $script:failOn = 'stop'
    Expect-Failure { Stop-OwnSession $state $path }
    Assert ($script:calls.Count -eq 1) 'Delete was attempted after a failed stop.'
    Assert (Test-Path -LiteralPath $path) 'Recovery state was lost on stop failure.'

    $script:calls = @(); $script:failOn = 'delete'
    Expect-Failure { Stop-OwnSession $state $path }
    $saved = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    Assert ($saved.status -eq 'stopped') 'Stopped status was not saved for retry.'
    Assert ($script:calls.Count -eq 2) 'Expected stop then delete.'

    $script:calls = @(); $script:failOn = ''
    Stop-OwnSession $saved $path
    Assert ($script:calls.Count -eq 1 -and $script:calls[0][0] -eq 'delete') 'Retry tried to stop an already stopped session.'
    Assert (-not (Test-Path -LiteralPath $path)) 'Successful cleanup retained active state.'
    Assert ($script:calls[0][2] -eq $state.session) 'Cleanup used the wrong session name.'
    Write-Host 'PowerShell parse and isolated session recovery checks passed.'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
