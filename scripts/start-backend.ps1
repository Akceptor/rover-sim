param([switch]$Standalone, [string]$Config = 'config/default.json', [switch]$Flat)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    if (-not (Test-Path 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE) { throw 'npm ci failed' } }
    $arguments = @('src/server.js', '--config', $Config)
    if ($Standalone) { $arguments += '--standalone' }
    if ($Flat) { $arguments += '--flat' }
    & node @arguments
    if ($LASTEXITCODE) { throw "Backend exited: $LASTEXITCODE" }
} finally { Pop-Location }
