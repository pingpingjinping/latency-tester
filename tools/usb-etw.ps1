# Windows PowerShell 5.1+. USB3-stack metadata only; no packet payload keyword.
[CmdletBinding()]
param([ValidateSet('Capture', 'Stop')][string]$Action = 'Capture')
$ErrorActionPreference = 'Stop'

function Invoke-Logman([string[]]$Arguments, [string]$LogPath) {
    $output = & logman.exe @Arguments 2>&1
    $code = $LASTEXITCODE
    $output | Out-File -LiteralPath $LogPath -Append -Encoding utf8
    return $code
}

function Stop-OwnSession($State, [string]$StatePath) {
    # Never stop/delete a session supplied by arbitrary state content.
    if ($State.session -notmatch '^rakka-rev3-[0-9a-f]{32}$') {
        throw 'Invalid RAKKA session name. No tracing sessions were changed.'
    }
    $log = Join-Path $State.directory 'commands.txt'
    if ($State.status -ne 'stopped') {
        if ((Invoke-Logman -Arguments @('stop', '-n', $State.session) -LogPath $log) -ne 0) {
            throw "Could not stop $($State.session). State retained at $StatePath; see $log."
        }
        $State.status = 'stopped'
        $State | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8
    }
    if ((Invoke-Logman -Arguments @('delete', '-n', $State.session) -LogPath $log) -ne 0) {
        # Trace is already stopped; retain its name for manual cleanup.
        throw "Trace stopped but session definition was not deleted: $($State.session). See $log."
    }
    Remove-Item -LiteralPath $StatePath
}

function Export-Trace($State) {
    $directory = $State.directory
    $etl = @(Get-ChildItem -LiteralPath $directory -Filter '*.etl')
    if ($etl.Count -eq 0) { throw "No ETL was generated. See $directory\commands.txt." }
    $xml = Join-Path $directory 'usb-events.xml'
    $summary = Join-Path $directory 'trace-summary.txt'
    $arguments = @($etl | ForEach-Object { $_.FullName })
    # -rts cannot be combined with -summary. Keep UTC XML and loss summary.
    $arguments += @('-o', $xml, '-of', 'XML', '-lr', '-summary', $summary, '-y')
    & tracerpt.exe @arguments 2>&1 | Out-File (Join-Path $directory 'decode.txt') -Encoding utf8
    $decoded = $LASTEXITCODE -eq 0
    @{ stoppedUtc = [DateTime]::UtcNow.ToString('o'); xmlDecoded = $decoded } |
        ConvertTo-Json | Set-Content (Join-Path $directory 'export.json') -Encoding utf8
    # Keep the original ETL even when provider decoding is incomplete.
    $archive = "$directory.zip"
    Compress-Archive -Path (Join-Path $directory '*') -DestinationPath $archive
    Write-Host "Saved: $archive"
    if (-not $decoded) { Write-Warning 'XML decoding failed. The ZIP still contains the original ETL.' }
}

function Invoke-UsbCapture([string]$RequestedAction) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Right-click the BAT file and choose Run as administrator.'
    }
    $root = Join-Path (Split-Path $PSScriptRoot -Parent) 'usb-traces'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $statePath = Join-Path $root 'active-session.json'
    if ($RequestedAction -eq 'Stop') {
        if (-not (Test-Path -LiteralPath $statePath)) { throw 'No saved RAKKA trace session to stop.' }
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        Stop-OwnSession $state $statePath
        Export-Trace $state
        return
    }
    if (Test-Path -LiteralPath $statePath) {
        throw 'A RAKKA trace state already exists. Run stop-usb-trace-windows.bat first.'
    }
    $session = 'rakka-rev3-' + [Guid]::NewGuid().ToString('N')
    $directory = Join-Path $root $session
    New-Item -ItemType Directory -Path $directory | Out-Null
    $log = Join-Path $directory 'commands.txt'
    $state = @{ session = $session; directory = $directory; status = 'created' }
    $created = $false; $started = $false; $stopped = $false
    try {
        if ((Invoke-Logman -Arguments @('create', 'trace', '-n', $session, '-o', (Join-Path $directory 'usb.etl'), '-nb', '128', '640', '-bs', '128') -LogPath $log) -ne 0) {
            throw "Could not create ETW trace. See $log."
        }
        $created = $true
        $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
        $providers = @()
        foreach ($provider in @('Microsoft-Windows-USB-USBXHCI', 'Microsoft-Windows-USB-UCX', 'Microsoft-Windows-USB-USBHUB3')) {
            if ((Invoke-Logman -Arguments @('update', 'trace', '-n', $session, '-p', $provider, '(Default,HeadersBusTrace)') -LogPath $log) -eq 0) {
                $providers += $provider
            } else { Write-Warning "Provider unavailable with header keywords: $provider" }
        }
        if (-not (@($providers | Where-Object { $_ -match 'USBXHCI$|UCX$' }).Count)) {
            throw 'No USB3 transfer provider available. Save commands.txt for diagnosis; do not enable payload tracing.'
        }
        @{
            session = $session; targetVid = '5249'; targetPid = '4C65'; durationLimitSeconds = 60
            providers = $providers; keywords = 'Default,HeadersBusTrace'
            createdUtc = [DateTime]::UtcNow.ToString('o')
            qpc = [Diagnostics.Stopwatch]::GetTimestamp(); qpcFrequency = [Diagnostics.Stopwatch]::Frequency
            osVersion = [Environment]::OSVersion.VersionString
        } | ConvertTo-Json | Set-Content (Join-Path $directory 'capture.json') -Encoding utf8
        if ((Invoke-Logman -Arguments @('start', '-n', $session) -LogPath $log) -ne 0) { throw "Could not start ETW trace. See $log." }
        $started = $true
        $state.status = 'running'
        $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
        Write-Host 'CAPTURING for up to 60 seconds. Switch to the browser and run the test now.'
        Write-Host 'Return here and press Enter to finish early. Keep this window open.'
        $timer = [Diagnostics.Stopwatch]::StartNew()
        while ($timer.Elapsed.TotalSeconds -lt 60) {
            if ([Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq 'Enter') { break }
            Start-Sleep -Milliseconds 100
        }
    } finally {
        if ($started) {
            Stop-OwnSession $state $statePath
            $stopped = $true
        } elseif ($created) {
            if ((Invoke-Logman -Arguments @('delete', '-n', $session) -LogPath $log) -eq 0) {
                Remove-Item -LiteralPath $statePath -ErrorAction SilentlyContinue
            }
        }
        if ($stopped) { Export-Trace $state }
    }
}

# Dot-sourcing only loads functions, allowing checks without starting a trace.
if ($MyInvocation.InvocationName -ne '.') { Invoke-UsbCapture $Action }
