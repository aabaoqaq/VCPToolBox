#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateSet('Start', 'Check', 'Status')][string]$Action = 'Start',
    [string]$NodePath,
    [ValidateRange(10, 600)][int]$StartupTimeoutSeconds = 180,
    [ValidateRange(1, 60)][int]$StabilitySeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stateDir = Join-Path $root '.vcp-runtime'
$runtimeFile = Join-Path $stateDir 'runtime.json'
$pm2Home = Join-Path $stateDir 'pm2'
$pm2Cli = Join-Path $root 'node_modules\pm2\lib\binaries\CLI.js'
$probe = Join-Path $PSScriptRoot 'vcp-runtime.cjs'
$nodeExe = $null
$launchLock = $null
$originalLocation = Get-Location
$savedEnvironment = @{}
foreach ($key in 'PATH', 'PM2_HOME', 'VCP_NODE_EXE', 'UV_THREADPOOL_SIZE', 'PM2_NO_INTERACTION') {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}

function Invoke-Node {
    param([string[]]$Arguments, [int]$TimeoutSeconds = 45)
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $script:nodeExe
    $info.WorkingDirectory = $root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $info.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill($true)
            throw "Node command timed out after $TimeoutSeconds seconds."
        }
        $output = $stdout.GetAwaiter().GetResult()
        $errors = $stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) {
            throw "Node command failed (exit $($process.ExitCode)). $errors $output"
        }
        if ($errors.Trim()) { Write-Host $errors.Trim() -ForegroundColor Yellow }
        return $output.Trim()
    } finally { $process.Dispose() }
}

function Test-SamePath([string]$Left, [string]$Right) {
    if (-not $Left -or -not $Right) { return $false }
    return [IO.Path]::GetFullPath($Left).TrimEnd('\', '/') -ieq [IO.Path]::GetFullPath($Right).TrimEnd('\', '/')
}

function Get-OwnedDaemon {
    # Windows PM2 uses global rpc.sock/pub.sock names, even with PM2_HOME.
    $daemons = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
        $_.CommandLine -match '[\\/]pm2[\\/]lib[\\/]Daemon\.js(?:"|\s|$)'
    })
    $pipeExists = @([IO.Directory]::GetFiles('\\.\pipe\') | Where-Object {
        [IO.Path]::GetFileName($_) -eq 'rpc.sock'
    }).Count -gt 0
    if ($daemons.Count -eq 0) {
        if ($pipeExists) { throw 'An unknown PM2 RPC pipe exists. Refusing to attach or stop anything.' }
        return $null
    }
    $pidFile = Join-Path $pm2Home 'pm2.pid'
    if ($daemons.Count -ne 1 -or -not (Test-Path -LiteralPath $pidFile)) {
        throw 'Another PM2 daemon is running. Refusing to take it over; inspect it separately first.'
    }
    $daemon = $daemons[0]
    $recordedPid = [IO.File]::ReadAllText($pidFile).Trim()
    if ($recordedPid -ne [string]$daemon.ProcessId -or
        -not $daemon.CommandLine.Contains($runtime.daemonScript, [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-SamePath $daemon.ExecutablePath $nodeExe)) {
        throw 'PM2 daemon ownership/runtime does not match this project. No processes were changed.'
    }
    return $daemon
}

function Get-Apps {
    if (-not (Get-OwnedDaemon)) { return @() }
    # RPC-only probe; never replace with pm2 list/jlist (they can spawn a daemon).
    return @(Invoke-Node -Arguments @($probe, 'status') | ConvertFrom-Json)
}

function Assert-AppConfig($App) {
    $file = if ($App.name -eq 'vcp-main') { 'server.js' } else { 'adminServer.js' }
    if (-not (Test-SamePath $App.script (Join-Path $root $file)) -or
        -not (Test-SamePath $App.cwd $root) -or
        -not (Test-SamePath $App.interpreter $nodeExe) -or
        [string]$App.pmx -ne 'false' -or [string]$App.threadpool -ne '64') {
        throw "Existing $($App.name) has a different script/runtime/config. Refusing to overwrite it."
    }
}

function Assert-Ports($Apps) {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
        $_.LocalPort -in $runtime.port, $runtime.adminPort
    })
    foreach ($listener in $listeners) {
        $name = if ($listener.LocalPort -eq $runtime.port) { 'vcp-main' } else { 'vcp-admin' }
        $app = @($Apps | Where-Object name -eq $name)
        if ($app.Count -ne 1 -or [int]$app[0].pid -ne $listener.OwningProcess) {
            throw "Port $($listener.LocalPort) belongs to PID $($listener.OwningProcess), not this project's $name."
        }
    }
}

function Get-Health {
    $apps = @(Get-Apps | Where-Object { $_.name -in 'vcp-main', 'vcp-admin' })
    Assert-Ports $apps
    if ($apps.Count -ne 2) { return $null }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
        $_.LocalPort -in $runtime.port, $runtime.adminPort
    })
    $fingerprint = @()
    foreach ($name in 'vcp-main', 'vcp-admin') {
        $matches = @($apps | Where-Object name -eq $name)
        if ($matches.Count -ne 1) { throw "Duplicate PM2 app: $name" }
        $app = $matches[0]
        Assert-AppConfig $app
        $port = if ($name -eq 'vcp-main') { $runtime.port } else { $runtime.adminPort }
        if ($app.status -ne 'online' -or $app.pid -le 0 -or
            -not @($listeners | Where-Object { $_.LocalPort -eq $port -and $_.OwningProcess -eq $app.pid }).Count) {
            return $null
        }
        $liveProcess = Get-Process -Id $app.pid -ErrorAction SilentlyContinue
        if (-not $liveProcess) { return $null }
        if (-not (Test-SamePath $liveProcess.Path $nodeExe)) {
            throw "Actual executable for $name does not match the selected Node runtime."
        }
        $app | Add-Member -NotePropertyName node -NotePropertyValue $runtime.node -Force
        $url = if ($name -eq 'vcp-main') { "http://127.0.0.1:$port/" } else { "http://127.0.0.1:$port/AdminPanel/login.html" }
        $expectedCode = if ($name -eq 'vcp-main') { 401 } else { 200 }
        try {
            $response = Invoke-WebRequest -Uri $url -NoProxy -TimeoutSec 4 -SkipHttpErrorCheck
            if ([int]$response.StatusCode -ne $expectedCode) { return $null }
        } catch { return $null }
        $fingerprint += "$name/$($app.pid)/$($app.restarts)"
    }
    return [pscustomobject]@{ Apps = $apps; Fingerprint = $fingerprint -join ';' }
}

try {
    Set-Location -LiteralPath $root
    if (-not (Test-Path -LiteralPath $pm2Cli -PathType Leaf)) { throw 'Project PM2 is missing. No global PM2 fallback is allowed.' }
    if (-not $NodePath -and (Test-Path -LiteralPath $runtimeFile)) {
        $NodePath = ([IO.File]::ReadAllText($runtimeFile) | ConvertFrom-Json).nodePath
        if (-not $NodePath) { throw 'runtime.json has no nodePath; specify -NodePath explicitly.' }
    }
    if (-not $NodePath) { $NodePath = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source }
    if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw "Node executable not found: $NodePath" }
    $nodeExe = [IO.Path]::GetFullPath($NodePath)
    $nodeExe = Invoke-Node -Arguments @('-p', 'process.execPath')
    $runtime = Invoke-Node -Arguments @($probe, 'check') | ConvertFrom-Json
    Write-Host "[Runtime] Node $($runtime.node), ABI $($runtime.abi): $nodeExe"
    Write-Host "[Runtime] Project PM2 $($runtime.pm2); PM2_HOME=$pm2Home"
    Write-Host "[Preflight] SQLite in-memory test and frontend build passed; ports $($runtime.port)/$($runtime.adminPort)."

    $env:PATH = (Split-Path -Parent $nodeExe) + ';' + $env:PATH
    $env:PM2_HOME = $pm2Home
    $env:VCP_NODE_EXE = $nodeExe
    $env:UV_THREADPOOL_SIZE = '64'
    $env:PM2_NO_INTERACTION = 'true'
    $daemon = Get-OwnedDaemon
    $apps = if ($daemon) { @(Get-Apps) } else { @() }
    foreach ($app in @($apps | Where-Object { $_.name -in 'vcp-main', 'vcp-admin' })) { Assert-AppConfig $app }
    Assert-Ports $apps

    if ($Action -eq 'Check') {
        Write-Host '[CHECK OK] No services started, no startup configuration written, no dependencies installed.'
        exit 0
    }
    if ($Action -eq 'Status') {
        $health = Get-Health
        if (-not $health) { throw 'VCP is not ready. Status did not start or restart any service.' }
        $health.Apps | Select-Object name, pid, status, restarts, node | Format-Table -AutoSize | Out-Host
        Write-Host '[HEALTHY] Main HTTP 401 (authentication required); admin login HTTP 200.'
        exit 0
    }

    [void][IO.Directory]::CreateDirectory($stateDir)
    $launchLock = [IO.File]::Open((Join-Path $stateDir 'launch.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $apps = @(Get-Apps)
    Assert-Ports $apps
    foreach ($app in @($apps | Where-Object { $_.name -in 'vcp-main', 'vcp-admin' })) { Assert-AppConfig $app }
    [IO.File]::WriteAllText($runtimeFile, (@{ nodePath = $nodeExe } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    foreach ($name in 'vcp-main', 'vcp-admin') {
        $existing = @($apps | Where-Object name -eq $name)
        if ($existing.Count -gt 1) { throw "Duplicate PM2 app: $name" }
        if ($existing.Count -eq 1 -and $existing[0].status -in 'online', 'launching') { continue }
        $verb = if ($existing.Count -eq 1) { 'restart' } else { 'start' }
        Write-Host "[PM2] $verb $name using ecosystem.config.js"
        [void](Invoke-Node -Arguments @($pm2Cli, $verb, (Join-Path $root 'ecosystem.config.js'), '--only', $name, '--update-env'))
        if (-not (Get-OwnedDaemon)) { throw 'PM2 daemon exited during startup.' }
    }

    Write-Host "[Health] Waiting up to $StartupTimeoutSeconds seconds; require $StabilitySeconds seconds with unchanged PIDs/restarts."
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    $stableSince = $null
    $lastFingerprint = ''
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Get-OwnedDaemon)) { throw 'PM2 daemon exited; no automatic daemon resurrection was attempted.' }
        $health = Get-Health
        if ($health -and $health.Fingerprint -eq $lastFingerprint) {
            if (([DateTime]::UtcNow - $stableSince).TotalSeconds -ge $StabilitySeconds) {
                $health.Apps | Select-Object name, pid, status, restarts, node | Format-Table -AutoSize | Out-Host
                Write-Host '[SUCCESS] Both services passed PID ownership, HTTP and stability checks.' -ForegroundColor Green
                Write-Host "[Admin] http://localhost:$($runtime.adminPort)/AdminPanel/"
                Write-Host '[Note] Closing this launcher does not stop PM2. This does not configure Windows auto-start.'
                exit 0
            }
        } elseif ($health) {
            $stableSince = [DateTime]::UtcNow
            $lastFingerprint = $health.Fingerprint
        } else {
            $stableSince = $null
            $lastFingerprint = ''
        }
        Start-Sleep -Seconds 2
    }
    throw 'Services did not pass health/stability checks before timeout.'
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "[Logs] $pm2Home\pm2.log and $pm2Home\logs"
    Write-Host '[Note] No automatic install, rebuild, global upgrade or process deletion was performed.'
    exit 1
} finally {
    if ($launchLock) { $launchLock.Dispose() }
    foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
    Set-Location -LiteralPath $originalLocation.Path
}
