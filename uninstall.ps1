# uninstall.ps1 - removes the Freebuff Desktop RTL patch.
#
# Removes the injected <!-- freebuff-rtl-user-patch --> / <style> / <script>
# block from the CURRENT index.html, then deletes the helper script and font.
#
# The index.html.freebuff-rtl.bak copy is deliberately NOT used: after an app
# update it belongs to an older build, and copying it over the current
# index.html would point the new build at stale asset hashes (blank window).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1
# Optional: -UiPath "<path to ...\resources\orchestrator\ui>"
#
# NOTE: keep this file plain ASCII. Windows PowerShell 5 decodes a BOM-less
# file as cp1252, so non-ASCII bytes turn into garbage characters.

param([switch]$Quiet, [string]$UiPath)

$ErrorActionPreference = 'Stop'

$candidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\@codebufffreebuff-desktop\resources\orchestrator\ui'),
  (Join-Path $env:LOCALAPPDATA 'Programs\freebuff-desktop\resources\orchestrator\ui')
)
if ($UiPath) { $candidates = @($UiPath) }

$ui = $null
foreach ($c in $candidates) {
  if (Test-Path (Join-Path $c 'index.html')) { $ui = $c; break }
}
if (-not $ui) {
  Write-Error 'Freebuff Desktop ui folder not found. Pass -UiPath "<...\resources\orchestrator\ui>".'
}

# --- hosted chat window (app.asar) ------------------------------------------
# The RTL block is injected into electron/hosted-preload.cjs inside app.asar;
# the installer keeps the untouched archive next to it. Only roll back when the
# current archive still carries our marker, so an app update that replaced it
# is never downgraded to an older build.
$installDir = $ui
while ($installDir -and (Split-Path $installDir -Leaf) -ne 'resources') {
  $installDir = Split-Path $installDir -Parent
}
if ($installDir) { $installDir = Split-Path $installDir -Parent }
$asar       = if ($installDir) { Join-Path $installDir 'resources\app.asar' } else { $null }
$asarBackup = if ($asar) { "$asar.freebuff-rtl.bak" } else { $null }
$hostedRemoved = $false
if ($asar -and (Test-Path $asar) -and (Test-Path $asarBackup)) {
  try {
    $bytes = [System.IO.File]::ReadAllBytes($asar)
    if ([System.Text.Encoding]::UTF8.GetString($bytes).Contains('freebuff-rtl-hosted v1')) {
      Copy-Item $asarBackup $asar -Force
      $hostedRemoved = $true
    }
  } catch {
    Write-Warning ('Could not restore {0}: {1}' -f $asar, $_.Exception.Message)
  }
}

$html     = Join-Path $ui 'index.html'
$jsDest   = Join-Path $ui 'freebuff-rtl-user.js'
$fontDest = Join-Path $ui 'freebuff-rtl-font.woff2'
$marker   = 'freebuff-rtl-user'

$content = Get-Content $html -Raw

if (-not $content.Contains($marker)) {
  foreach ($f in @($jsDest, $fontDest)) { if (Test-Path $f) { Remove-Item $f -Force } }
  if (-not $Quiet) {
    if ($hostedRemoved) { Write-Host "RESTORED: $asar" }
    Write-Host 'Nothing to remove from index.html - it has no RTL patch marker.'
  }
  exit 0
}

# Remove exactly what install.ps1 injects, in any order.
$content = [regex]::Replace($content, '(?s)<!--\s*freebuff-rtl-user-patch[^>]*-->\s*', '')
$content = [regex]::Replace($content, '(?s)<style id="freebuff-rtl-user-patch">.*?</style>\s*', '')
$content = [regex]::Replace($content, '<script src="/freebuff-rtl-user\.js"[^>]*>\s*</script>\s*', '')

if ($content.Contains($marker)) {
  Write-Error "Could not fully remove the patch from $html - reinstall Freebuff Desktop to get a clean UI."
}

Set-Content -Path $html -Value $content -Encoding UTF8 -NoNewline
foreach ($f in @($jsDest, $fontDest)) {
  if (Test-Path $f) { Remove-Item $f -Force }
}

if ($Quiet) { exit 0 }
Write-Host "RESTORED: $html"
if ($hostedRemoved) { Write-Host "RESTORED: $asar" }
Write-Host 'Restart the Freebuff app to see the effect.'
