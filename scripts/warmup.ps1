# Demo-host warm-up: a thin wrapper over warmup.py.
#
#   .\scripts\warmup.ps1                  # check, load the drafting model, check again
#   .\scripts\warmup.ps1 --check          # read-only: loads nothing
#   .\scripts\warmup.ps1 --evict-others   # also unload other generation models
#
# All the logic, and every check, is in the Python script beside this file.
# This only picks the project's virtual environment, which has the backend's
# dependencies; the warm-up imports the backend to route and check exactly
# as the API does. Exit code 0 only when the table ends READY.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot 'warmup.py'

$python = $env:PYTHON
if (-not $python) {
    $venv = Join-Path $root '.venv\Scripts\python.exe'
    if (Test-Path $venv) { $python = $venv } else { $python = 'python' }
}

& $python $script @args
exit $LASTEXITCODE
