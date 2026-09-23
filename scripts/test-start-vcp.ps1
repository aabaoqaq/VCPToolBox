#Requires -Version 7.0
[CmdletBinding()]
param([string]$NodePath, [string]$IncompatibleNodePath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $PSScriptRoot 'start-vcp.ps1'
$pwsh = Join-Path $PSHOME 'pwsh.exe'
$count = 0

function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "FAIL: $Message" }
    $script:count++
    Write-Host "PASS: $Message"
}
function Assert-Throws([scriptblock]$Body, [string]$Pattern, [string]$Message) {
    $caught = $false
    try { & $Body } catch { $caught = $_.Exception.Message -match $Pattern }
    Assert $caught $Message
}
function Invoke-CheckCase([string[]]$Extra, [int]$ExpectedExit, [string]$Pattern, [string]$Name) {
    $output = & $pwsh -NoLogo -NoProfile -File $launcher -Action Check @Extra 2>&1
    $code = $LASTEXITCODE
    Assert ($code -eq $ExpectedExit -and ($output -join "`n") -match $Pattern) $Name
}

$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($launcher, [ref]$tokens, [ref]$parseErrors)
Assert ($parseErrors.Count -eq 0) 'Launcher parses as PowerShell 7'
$source = [IO.File]::ReadAllText($launcher)
$batch = [IO.File]::ReadAllText((Join-Path $root '一键启动服务器start_server.bat'))
Assert ($batch -match '-NoProfile' -and $batch -match 'VCP_EXIT_CODE=%ERRORLEVEL%') 'BAT disables profiles and propagates failure'
Assert ($batch -notmatch 'call pm2|npm install|pm2 delete') 'BAT does not use global PM2/install/delete'
Assert ($source -match 'node_modules\\pm2\\lib\\binaries\\CLI.js' -and $source -match 'ecosystem.config.js') 'Launcher selects project PM2 and ecosystem'
Assert ($source -notmatch '(?m)^\s*(?:call\s+)?(?:pm2|npm)\s') 'No bare global PM2/npm invocation'
Assert ($source -match 'Get-Health' -and $source -match 'lastFingerprint' -and $source -match 'WaitForExit') 'Readiness and subprocess waits are bounded'

$runtimeFile = Join-Path $root '.vcp-runtime\runtime.json'
$beforeHash = if (Test-Path -LiteralPath $runtimeFile) { (Get-FileHash -LiteralPath $runtimeFile).Hash } else { $null }
$extra = if ($NodePath) { @('-NodePath', $NodePath) } else { @() }
Invoke-CheckCase $extra 0 '\[CHECK OK\]' 'Read-only preflight succeeds'
Invoke-CheckCase @('-NodePath', (Join-Path $root 'does-not-exist-node.exe')) 1 'Node executable not found' 'Missing runtime fails before startup'
if ($IncompatibleNodePath) {
    Invoke-CheckCase @('-NodePath', $IncompatibleNodePath) 1 'NODE_MODULE_VERSION' 'Incompatible native ABI fails before startup'
}
$afterHash = if (Test-Path -LiteralPath $runtimeFile) { (Get-FileHash -LiteralPath $runtimeFile).Hash } else { $null }
Assert ($beforeHash -eq $afterHash) 'Check/failure paths do not create or rewrite runtime configuration'

if (-not $NodePath) { $NodePath = ([IO.File]::ReadAllText($runtimeFile) | ConvertFrom-Json).nodePath }
$nodeExe = (& $NodePath -p 'process.execPath').Trim()
foreach ($file in 'vcp-runtime.cjs', '..\ecosystem.config.js') {
    & $nodeExe --check (Join-Path $PSScriptRoot $file)
    Assert ($LASTEXITCODE -eq 0) "JavaScript syntax: $file"
}
$oldPort = [Environment]::GetEnvironmentVariable('PORT', 'Process')
try {
    $env:PORT = 'invalid-port'
    $message = & $nodeExe (Join-Path $PSScriptRoot 'vcp-runtime.cjs') check 2>&1
    Assert ($LASTEXITCODE -ne 0 -and ($message -join '') -match 'PORT must be') 'Invalid inherited PORT is rejected'
} finally { [Environment]::SetEnvironmentVariable('PORT', $oldPort, 'Process') }

# Load only these function definitions, not the launcher's executable body.
foreach ($name in 'Test-SamePath', 'Assert-AppConfig', 'Assert-Ports', 'Get-Health', 'Get-OwnedDaemon') {
    $definition = $ast.FindAll({ param($item) $item -is [Management.Automation.Language.FunctionDefinitionAst] }, $true) | Where-Object Name -eq $name
    . ([scriptblock]::Create($definition.Extent.Text))
}
$runtime = [pscustomobject]@{ port = 6005; adminPort = 6006; node = 'test-runtime'; daemonScript = 'unused' }
$main = [pscustomobject]@{ name='vcp-main'; script=(Join-Path $root 'server.js'); cwd=$root; interpreter=$nodeExe; pmx='false'; threadpool='64'; status='online'; pid=70001; restarts=0 }
$admin = [pscustomobject]@{ name='vcp-admin'; script=(Join-Path $root 'adminServer.js'); cwd=$root; interpreter=$nodeExe; pmx='false'; threadpool='64'; status='online'; pid=70002; restarts=0 }
Assert-AppConfig $main
Assert $true 'Expected app configuration is accepted'
$main.pmx = 'true'
Assert-Throws { Assert-AppConfig $main } 'different script/runtime/config' 'Wrong PM2 configuration is refused'
$main.pmx = 'false'

# Mocks are confined to this test process; they never change live listeners/apps.
$fakeApps = @($main, $admin)
$fakeListeners = @([pscustomobject]@{LocalPort=6005;OwningProcess=70001}, [pscustomobject]@{LocalPort=6006;OwningProcess=70002})
$mainCode = 401; $adminCode = 200; $actualExe = $nodeExe
function Get-Apps { return $fakeApps }
function Get-NetTCPConnection { [CmdletBinding()]param($State) return $fakeListeners }
function Get-Process { [CmdletBinding()]param($Id) return [pscustomobject]@{Path=$actualExe} }
function Invoke-WebRequest {
    [CmdletBinding()]param($Uri, [switch]$NoProxy, $TimeoutSec, [switch]$SkipHttpErrorCheck)
    return [pscustomobject]@{StatusCode=$(if ($Uri -match ':6005/') { $mainCode } else { $adminCode })}
}
Assert-Throws { Assert-Ports @() } 'belongs to PID' 'Occupied foreign port is refused'
Assert ($null -ne (Get-Health)) 'Owned listeners plus HTTP 401/200 are healthy'
$mainCode = 500
Assert ($null -eq (Get-Health)) 'HTTP 500 is not reported as healthy'
$mainCode = 401; $adminCode = 401
Assert ($null -eq (Get-Health)) 'Admin login must return 200, not just any HTTP response'
$adminCode = 200; $main.status = 'errored'
Assert ($null -eq (Get-Health)) 'Errored PM2 process is not healthy'
$main.status = 'online'; $actualExe = 'C:\unrelated\node.exe'
Assert-Throws { Get-Health } 'Actual executable' 'Actual process executable is checked, not only PM2 metadata'
$actualExe = $nodeExe; $fakeApps = @()
Assert-Throws { Get-Health } 'belongs to PID' 'Orphan listeners are not mistaken for managed services'
$pm2Home = Join-Path $root ('.vcp-runtime\nonexistent-' + [guid]::NewGuid())
function Get-CimInstance {
    [CmdletBinding()]param($ClassName, $Filter)
    return [pscustomobject]@{CommandLine='node C:\other\node_modules\pm2\lib\Daemon.js'; ProcessId=99999}
}
Assert-Throws { Get-OwnedDaemon } 'Another PM2 daemon' 'Foreign PM2 daemon cannot be taken over'
Write-Host "All $count checks passed. No live process was started, stopped or restarted."
