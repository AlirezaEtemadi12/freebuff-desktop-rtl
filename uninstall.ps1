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

$html     = Join-Path $ui 'index.html'
$jsDest   = Join-Path $ui 'freebuff-rtl-user.js'
$fontDest = Join-Path $ui 'freebuff-rtl-font.woff2'
$marker   = 'freebuff-rtl-user'

$content = Get-Content $html -Raw

if (-not $content.Contains($marker)) {
  foreach ($f in @($jsDest, $fontDest)) { if (Test-Path $f) { Remove-Item $f -Force } }
  if (-not $Quiet) { Write-Host 'Nothing to remove - index.html has no RTL patch marker.' }
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
Write-Host 'Restart the Freebuff app to see the effect.'
