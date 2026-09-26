# Start the local Ollama server with the variables a hardware tier needs.
#
#   .\scripts\start-ollama.ps1                          # laptop-8gb, the demo laptop
#   .\scripts\start-ollama.ps1 -Tier laptop-16gb
#   .\scripts\start-ollama.ps1 -Persist                 # also save them as user variables
#   .\scripts\start-ollama.ps1 -WhatIf                  # print them, start nothing
#
# -Tier takes a config/profiles/ name. It is not called -Profile because
# $PROFILE is PowerShell's own automatic variable.
#
# Ollama reads these once, when `ollama serve` starts. None were set on the
# demo laptop, so it ran with its defaults: models expired after 5 minutes
# (a 7-14 s reload between judge visits) and the server listened wherever
# its default said. The values per profile (the same names as
# config/profiles/, which the API is started with via SOVEREIGN_PROFILE):
#
#   profile       MAX_LOADED_MODELS  NUM_PARALLEL  FLASH_ATTENTION  KV_CACHE_TYPE
#   laptop-8gb    2 (3B + nomic)     1             -                -
#   laptop-16gb   3 (+ vision)       1             -                -
#   cpu-server    4                  3             1                q8_0
#   gpu-server    3 (8B+vision+nomic) 4            1                q8_0
#
# Every profile sets OLLAMA_KEEP_ALIVE=24h (a duration, not -1: a model that
# never expires cannot be evicted to make room) and OLLAMA_HOST=127.0.0.1:11434
# (loopback only; the API refuses any other inference endpoint anyway).
# NUM_PARALLEL matches the profile's agent.worker_count: each parallel slot
# multiplies the KV cache, which an 8 GB host cannot afford.
#
# The server runs in this window; close it or press Ctrl+C to stop it. An
# Ollama already listening (the tray app, or an earlier serve) keeps its old
# variables, so this refuses to start a second one: quit that one first.
# -Persist writes the variables to the user environment so the tray app and
# new shells get them too (Windows reads them at sign-in or app start).

[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('laptop-8gb', 'laptop-16gb', 'cpu-server', 'gpu-server')]
    [string]$Tier = 'laptop-8gb',
    [switch]$Persist
)

$ErrorActionPreference = 'Stop'

$tiers = @{
    'laptop-8gb'  = @{ OLLAMA_MAX_LOADED_MODELS = '2'; OLLAMA_NUM_PARALLEL = '1' }
    'laptop-16gb' = @{ OLLAMA_MAX_LOADED_MODELS = '3'; OLLAMA_NUM_PARALLEL = '1' }
    'cpu-server'  = @{ OLLAMA_MAX_LOADED_MODELS = '4'; OLLAMA_NUM_PARALLEL = '3'; OLLAMA_FLASH_ATTENTION = '1'; OLLAMA_KV_CACHE_TYPE = 'q8_0' }
    'gpu-server'  = @{ OLLAMA_MAX_LOADED_MODELS = '3'; OLLAMA_NUM_PARALLEL = '4'; OLLAMA_FLASH_ATTENTION = '1'; OLLAMA_KV_CACHE_TYPE = 'q8_0' }
}

$variables = [ordered]@{
    OLLAMA_HOST      = '127.0.0.1:11434'
    OLLAMA_KEEP_ALIVE = '24h'
}
foreach ($entry in $tiers[$Tier].GetEnumerator()) { $variables[$entry.Key] = $entry.Value }

Write-Host "Ollama variables for profile $Tier"
foreach ($entry in $variables.GetEnumerator()) {
    Write-Host ('  {0,-26} {1}' -f $entry.Key, $entry.Value)
}

if (-not $PSCmdlet.ShouldProcess("ollama serve", "start with profile $Tier")) { exit 0 }

if ($Persist) {
    foreach ($entry in $variables.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User')
    }
    Write-Host 'Saved as user environment variables.'
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Error 'ollama is not on PATH; install it (see docs/handbook/01-getting-started/05-models.md)'
    exit 1
}

# One server per port. A running one would keep its own variables, and a
# second `ollama serve` would fail to bind anyway.
$listening = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    $owner = (Get-Process -Id $listening[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Write-Error ("Something is already listening on 11434 ($owner). Quit it first (tray icon > Quit Ollama, " +
        "or stop that process) so the server restarts with these variables.")
    exit 1
}

foreach ($entry in $variables.GetEnumerator()) {
    Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
}

Write-Host "Start the API with the same profile:  `$env:SOVEREIGN_PROFILE = '$Tier'"
Write-Host 'Then check readiness:                  .\scripts\warmup.ps1'
Write-Host ''
& ollama serve
exit $LASTEXITCODE
