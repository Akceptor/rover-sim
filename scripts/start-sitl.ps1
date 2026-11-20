# Optional Windows/Cygwin binary path. Preferred tested deployment: macOS SITL.
param(
  [Parameter(Mandatory=$true)][string]$SitlExe,
  [string]$BackendHost = '127.0.0.1', [int]$PhysicsPort = 9002,
  [int]$TelemetryPort = 14560, [string]$ExtraParams = '', [switch]$Wipe
)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $SitlExe).Path
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$defaults = Join-Path $root 'config/rover.parm'
if ($ExtraParams) { $defaults += ',' + (Resolve-Path $ExtraParams).Path }
$run = Join-Path $root '.run/sitl-windows'
New-Item -ItemType Directory -Force $run | Out-Null
Push-Location $run
try {
  $arguments = @('--model', "JSON:$BackendHost", '--sim-port-out', "$PhysicsPort", '--rate', '100', '--speedup', '1', '--home', '50.4501,30.5234,100,0', '--defaults', $defaults, '--serial0', 'tcp:5760', '--serial1', 'tcp:5762', '--serial2', "udpclient:${BackendHost}:$TelemetryPort")
  if ($Wipe) { $arguments += '--wipe' }
  & $exe @arguments
  if ($LASTEXITCODE) { throw "SITL exited: $LASTEXITCODE" }
} finally { Pop-Location }
