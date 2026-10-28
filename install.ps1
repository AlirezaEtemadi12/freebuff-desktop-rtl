# Applies the Freebuff Desktop RTL patch (public kit).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
# Optional:
#   -UiPath "<...\resources\orchestrator\ui>"  use an install path other than
#                                             the default locations
#   -Quiet                                    no output (for the Startup .vbs)

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
  Write-Error 'Freebuff Desktop ui folder not found. Install Freebuff Desktop first, or pass -UiPath "<...\resources\orchestrator\ui>".'
}

$html    = Join-Path $ui 'index.html'
$backup  = "$html.freebuff-rtl.bak"
$cssS    = Join-Path $PSScriptRoot 'freebuff-rtl.css'
$jsS     = Join-Path $PSScriptRoot 'freebuff-rtl.js'
$fontS   = Join-Path $PSScriptRoot 'Vazirmatn-Variable.woff2'
$jsDest  = Join-Path $ui 'freebuff-rtl-user.js'
$fontDest = Join-Path $ui 'freebuff-rtl-font.woff2'
$marker  = 'freebuff-rtl-user'

foreach ($f in @($cssS, $jsS, $fontS)) {
  if (-not (Test-Path $f)) { Write-Error "Missing required file: $f (run this script from the kit folder)" }
}

$content = Get-Content $html -Raw

# Recompute the inline <style> body every run: the patch CSS lives INSIDE
# index.html (inlined for CSP), so a stale HTML keeps an old CSS even when the
# script tag and its JS are up to date.
$cssSrc = Get-Content $cssS -Raw
$styleMatch = [regex]::Match($content, '(?s)<style id="freebuff-rtl-user-patch">.*?</style>')
$styleBlock = "<!-- freebuff-rtl-user-patch v3 -->`n<style id=`"freebuff-rtl-user-patch`">`n" +
              $cssSrc +
              "`n</style>`n" +
              "<script src=`"/freebuff-rtl-user.js`" defer></script>"

# Always refresh the helper JS/font from this kit, even if the HTML is
# already patched.
$jsSrc  = Get-Content $jsS -Raw
$jsOld  = $null
if (Test-Path $jsDest) { $jsOld = Get-Content $jsDest -Raw }
if ($jsOld -ne $jsSrc) { Copy-Item $jsS $jsDest -Force }

$fontNeedsCopy = $true
if ((Test-Path $fontDest) -and ((Get-Item $fontDest).Length -eq (Get-Item $fontS).Length)) { $fontNeedsCopy = $false }
if ($fontNeedsCopy) { Copy-Item $fontS $fontDest -Force }

if ($content.Contains($marker)) {
  if ($styleMatch.Success -and $styleMatch.Value -ne $styleBlock) {
    $content = $content.Replace($styleMatch.Value, $styleBlock)
    Set-Content -Path $html -Value $content -Encoding UTF8 -NoNewline
    if (-not $Quiet) { Write-Host 'ALREADY PATCHED - inline CSS refreshed. Restart the app to see effect.' }
    exit 0
  }
  if (-not $Quiet) { Write-Host 'ALREADY PATCHED (refreshed helper files) - restart the app to see effect.' }
  exit 0
}

$headCount = ([regex]::Matches($content, [regex]::Escape('</head>'))).Count
if ($headCount -ne 1) {
  Write-Error "Unexpected index.html structure (found $headCount </head>; expected exactly 1 - the app may have changed; aborting safely)"
}

if (-not (Test-Path $backup)) { Copy-Item $html $backup }

$styleBlock = "<!-- freebuff-rtl-user-patch v3 -->`n<style id=`"freebuff-rtl-user-patch`">`n" +
              (Get-Content $cssS -Raw) +
              "`n</style>`n" +
              "<script src=`"/freebuff-rtl-user.js`" defer></script>"

$content = $content -replace '</head>', ($styleBlock + "`n</head>")
Set-Content -Path $html -Value $content -Encoding UTF8 -NoNewline

if ($Quiet) { exit 0 }
Write-Host "PATCHED: $html"
Write-Host 'Restart the Freebuff app to see the effect.'
