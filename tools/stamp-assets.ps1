<#
  stamp-assets.ps1 — cache-bust the shared front-end assets.

  Why this exists
  ---------------
  shell.css, shell.js and data-store.js are pulled into every page. Browsers
  cache them hard, so after a deploy a returning browser can run NEW page HTML
  against an OLD shared script. That is not theoretical: during Phase 5 a stale
  data-store.js silently wrote a summary object with its fields dropped,
  because the page had been updated to send different ones.

  tools/build-book.ps1 already solves exactly this for data/accounts.js with a
  ?v= query stamp. This does the same for the tracked assets.

  What it does
  ------------
  Rewrites the ?v= stamp on every reference to a shared asset inside the *.html
  files at the repo root. Each asset gets its OWN stamp, taken from its last
  write time, so editing one file does not invalidate the others.

  Run it after changing anything under assets/, and before committing.

      powershell -ExecutionPolicy Bypass -File tools\stamp-assets.ps1

  Use -WhatIf to see what would change without writing.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$Root
)

$ErrorActionPreference = 'Stop'

if (-not $Root) { $Root = Join-Path $PSScriptRoot '..' }
$Root = [System.IO.Path]::GetFullPath($Root)

# The assets worth stamping: everything shared across more than one page.
$assets = @(
  'assets/css/shell.css',
  'assets/js/shell.js',
  'assets/js/data-store.js',
  'route-board.js'
)

# Per-asset stamp from its own mtime. Missing files are skipped, not fatal —
# route-board.js is absent from a checkout that has not reached Phase 3.
$stamps = @{}
foreach ($rel in $assets) {
  $full = Join-Path $Root ($rel -replace '/', '\')
  if (Test-Path $full) {
    $stamps[$rel] = [int][double]::Parse((Get-Item $full).LastWriteTimeUtc.Subtract(
      (Get-Date '1970-01-01 00:00:00Z').ToUniversalTime()).TotalSeconds)
  } else {
    Write-Host "skipped (missing) : $rel"
  }
}

if ($stamps.Count -eq 0) { Write-Host 'Nothing to stamp.'; return }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$pages = Get-ChildItem -Path $Root -Filter '*.html' -File
$changedAny = $false

foreach ($page in $pages) {
  $html = Get-Content $page.FullName -Raw -Encoding UTF8
  $updated = $html

  foreach ($rel in $stamps.Keys) {
    $escaped = [regex]::Escape($rel)
    # Matches href="asset" or src="asset", with or without an existing ?v=.
    $pattern = '(href|src)="' + $escaped + '(\?v=\d+)?"'
    $replace = '$1="' + $rel + '?v=' + $stamps[$rel] + '"'
    $updated = [regex]::Replace($updated, $pattern, $replace)
  }

  if ($updated -ne $html) {
    if ($PSCmdlet.ShouldProcess($page.Name, 'stamp assets')) {
      [System.IO.File]::WriteAllText($page.FullName, $updated, $utf8NoBom)
      Write-Host "stamped          : $($page.Name)"
    }
    $changedAny = $true
  }
}

if (-not $changedAny) { Write-Host 'All pages already carry the current stamps.' }

foreach ($rel in $stamps.Keys) { Write-Host ("  {0,-28} ?v={1}" -f $rel, $stamps[$rel]) }
