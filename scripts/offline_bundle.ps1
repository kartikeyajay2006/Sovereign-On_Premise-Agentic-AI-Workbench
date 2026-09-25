# Offline installer bundle: a thin wrapper over offline_bundle.py.
#
#   .\scripts\offline_bundle.ps1 build --out dist\aegis-offline       (connected machine)
#   .\offline_bundle.ps1 install --target C:\aegis                    (from inside the bundle)
#
# All the logic, and every check, is in the Python script beside this file.
# This only finds a Python 3.11+ interpreter: the air-gapped host has no
# virtual environment yet when the installer runs.

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'offline_bundle.py'

$candidates = @()
if ($env:PYTHON) { $candidates += , @($env:PYTHON) }
$candidates += , @('py', '-3')
$candidates += , @('python')
$candidates += , @('python3')

foreach ($candidate in $candidates) {
    $exe = $candidate[0]
    $prefix = @($candidate | Select-Object -Skip 1)
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
    & $exe @prefix -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>$null
    if ($LASTEXITCODE -eq 0) {
        & $exe @prefix $script @args
        exit $LASTEXITCODE
    }
}

Write-Error 'offline_bundle: no Python 3.11 or newer found; set $env:PYTHON to its path'
exit 1
