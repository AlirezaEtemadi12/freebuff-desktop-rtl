# Applies the Freebuff Desktop RTL patch (shared public kit).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
# Optional switches: -UiPath "<...\resources\orchestrator\ui>"  -Quiet
#
# Safe to re-run: the injected block is stripped and re-added from this kit, so a
# changed stylesheet or script is refreshed instead of stacking a second copy.
#
# NOTE: keep this file plain ASCII. Windows PowerShell 5 decodes a BOM-less file
# as cp1252, so non-ASCII bytes turn into garbage characters.

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

$html     = Join-Path $ui 'index.html'
$backup   = "$html.freebuff-rtl.bak"
$cssS     = Join-Path $PSScriptRoot 'freebuff-rtl.css'
$jsS      = Join-Path $PSScriptRoot 'freebuff-rtl.js'
$fontS    = Join-Path $PSScriptRoot 'Vazirmatn-Variable.woff2'
$jsDest   = Join-Path $ui 'freebuff-rtl-user.js'
$fontDest = Join-Path $ui 'freebuff-rtl-font.woff2'

foreach ($f in @($cssS, $jsS, $fontS)) {
  if (-not (Test-Path $f)) { Write-Error "Missing required file: $f (run this script from the kit folder)" }
}

# Always refresh the helper JS/font from this kit, even if the HTML is already
# patched: the stylesheet is inlined into index.html, but these two are files.
$jsSrc = Get-Content $jsS -Raw
$jsOld = $null
if (Test-Path $jsDest) { $jsOld = Get-Content $jsDest -Raw }
if ($jsOld -ne $jsSrc) { Copy-Item $jsS $jsDest -Force }

if (-not (Test-Path $fontDest) -or ((Get-Item $fontDest).Length -ne (Get-Item $fontS).Length)) {
  Copy-Item $fontS $fontDest -Force
}

# --- hosted chat window (app.asar :: electron/hosted-preload.cjs) -----------
# Since the 2026-10-31 update the chat is NOT this local document: the app opens
# https://freebuff.com in a sandboxed window whose preload lives inside
# resources\app.asar. The tool in tools\ appends the RTL block (stylesheet +
# embedded Vazirmatn + dir="auto" sweep) to that preload and rebuilds the
# archive, verifying every entry against the SHA256 hashes the archive carries.
$hostedTool = Join-Path $PSScriptRoot 'tools\apply-hosted-rtl.mjs'
if (Test-Path $hostedTool) {
  $installDir = $ui
  while ($installDir -and (Split-Path $installDir -Leaf) -ne 'resources') {
    $installDir = Split-Path $installDir -Parent
  }
  if ($installDir) { $installDir = Split-Path $installDir -Parent }
  $asar = if ($installDir) { Join-Path $installDir 'resources\app.asar' } else { $null }

  if (-not $asar -or -not (Test-Path $asar)) {
    if (-not $Quiet) { Write-Warning 'app.asar was not found next to the ui folder; the hosted chat window was not patched.' }
  } else {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    $runtime = if ($nodeCmd) { $nodeCmd.Source } else { Join-Path $installDir 'resources\bun\bun.exe' }
    if (-not (Test-Path $runtime)) {
      if (-not $Quiet) { Write-Warning 'Node.js (or the bun.exe shipped with Freebuff) was not found; the hosted chat window was not patched.' }
    } else {
      $hostedArgs = @($hostedTool, '--install', $installDir)
      if ($Quiet) { $hostedArgs += '--quiet' }
      & $runtime @hostedArgs
      if ($LASTEXITCODE -ne 0 -and -not $Quiet) {
        Write-Warning 'Patching the hosted chat window failed; the local shell was still patched.'
      }
    }
  }
}

$content = Get-Content $html -Raw

# Strip every previously injected comment / inline <style> / <script> first.
# Matching only the <style> body would leave each run's comment and script tag
# behind, so a re-run added another copy of both every time.
$clean = [regex]::Replace($content, '(?s)<!--\s*freebuff-rtl-user-patch[^>]*-->\s*', '')
$clean = [regex]::Replace($clean, '(?s)<style id="freebuff-rtl-user-patch">.*?</style>\s*', '')
$clean = [regex]::Replace($clean, '<script src="/freebuff-rtl-user\.js"[^>]*>\s*</script>\s*', '')

$headCount = ([regex]::Matches($clean, [regex]::Escape('</head>'))).Count
if ($headCount -ne 1) {
  Write-Error "Unexpected index.html structure (found $headCount </head>; expected exactly 1 - the app may have changed; aborting safely)"
}

# The backup must be the UNPATCHED html, so write the stripped content into it
# rather than copying the (possibly already patched) file.
if (-not (Test-Path $backup)) { Set-Content -Path $backup -Value $clean -Encoding UTF8 -NoNewline }

$block = "<!-- freebuff-rtl-user-patch v3 -->`n" +
         "<style id=`"freebuff-rtl-user-patch`">`n" +
         (Get-Content $cssS -Raw) +
         "`n</style>`n" +
         "<script src=`"/freebuff-rtl-user.js`" defer></script>"

$patched = $clean -replace '</head>', ($block + "`n</head>")

if ($patched -eq $content) {
  if (-not $Quiet) { Write-Host 'ALREADY PATCHED (helper files refreshed) - restart the app to see effect.' }
  exit 0
}

Set-Content -Path $html -Value $patched -Encoding UTF8 -NoNewline

if ($Quiet) { exit 0 }
Write-Host "PATCHED: $html"
Write-Host 'Restart the Freebuff app to see the effect.'
