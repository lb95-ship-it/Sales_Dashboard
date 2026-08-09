<#
.SYNOPSIS
  Builds the Route Board account book from territory lists exported out of Google Lists.

.DESCRIPTION
  Input is the legacy shape: an object of territory name -> array of rows, where each
  row is the positional tuple [name, note, mapUrl, tags[]].

  Output is keyed on the Google place ID embedded in every Maps URL
  (the "!1s0x<hex>:0x<hex>" segment), which is the only identifier in this data that
  survives a re-export: names get edited, row order shifts, territories get
  reshuffled, but the place ID stays put. Assignments and Salesforce links in the app
  are keyed on it, so they survive re-imports.

  An office listed under two territories collapses into ONE account carrying both
  territory tags, rather than two accounts that drift apart.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\build-book.ps1
#>
[CmdletBinding()]
param(
  [string]$Source,
  [string]$OutDir,
  [string]$App,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot is not reliably populated inside param() defaults on PS 5.1, so
# resolve paths here instead.
$root = Split-Path -Parent $PSCommandPath
if (-not $Source) { $Source = Join-Path $root '..\data\legacy-territory-lists.json' }
if (-not $OutDir) { $OutDir = Join-Path $root '..\data' }
if (-not $App)    { $App    = Join-Path $root '..\route-board.html' }
$Source = [System.IO.Path]::GetFullPath($Source)
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
$App    = [System.IO.Path]::GetFullPath($App)

function Get-PlaceId {
  param([string]$Url)
  if ($Url -match '!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)') { return $Matches[1] }
  return $null
}

if (-not (Test-Path $Source)) { throw "Source list not found: $Source" }
Write-Host "Reading $Source"
$raw = Get-Content $Source -Raw -Encoding UTF8 | ConvertFrom-Json

$accounts      = [ordered]@{}
$territoryOrder= [ordered]@{}
$problems      = New-Object System.Collections.ArrayList
$rowCount      = 0
$mergeCount    = 0

foreach ($terr in $raw.PSObject.Properties.Name) {
  $ids = New-Object System.Collections.ArrayList

  $rowIndex = -1
  foreach ($row in $raw.$terr) {
    $rowCount++
    $rowIndex++

    # Rows must be the 4-element tuple [name, note, url, tags[]]. Anything else is a
    # malformed export; say so with the position rather than dumping the object.
    if ($null -eq $row -or -not ($row -is [System.Collections.IEnumerable]) -or $row -is [string] -or @($row).Count -lt 3) {
      [void]$problems.Add("SKIPPED (row is not a [name, note, url, tags] array): [$terr] row $rowIndex")
      continue
    }

    $name = [string]$row[0]
    $note = [string]$row[1]
    $url  = [string]$row[2]
    $tags = @($row[3])

    $id = Get-PlaceId $url
    if (-not $id) {
      # No place ID means nothing stable to key on. Skipping is safer than inventing
      # a synthetic key that would collide on the next export.
      $label = if ([string]::IsNullOrWhiteSpace($name)) { '(unnamed)' } else { $name }
      [void]$problems.Add("SKIPPED (no place ID in URL): [$terr] row ${rowIndex}: $label")
      continue
    }

    if ($accounts.Contains($id)) {
      # Same physical office already seen, usually under a different territory.
      $existing = $accounts[$id]
      $mergeCount++
      if ($existing.territories -notcontains $terr) { $existing.territories += $terr }

      # Surface any drift between the two listings instead of silently picking one.
      if ($existing.name -ne $name) {
        [void]$problems.Add("MERGE name differs for ${id}: '$($existing.name)' vs '$name' (kept first)")
      }
      if ($existing.note -ne $note) {
        if ([string]::IsNullOrWhiteSpace($existing.note)) {
          $existing.note = $note
        } elseif (-not [string]::IsNullOrWhiteSpace($note)) {
          [void]$problems.Add("MERGE note differs for ${id} ($name): '$($existing.note)' vs '$note' (kept first)")
        }
      }
      foreach ($t in $tags) { if ($existing.tags -notcontains $t) { $existing.tags += $t } }
    }
    else {
      $accounts[$id] = [ordered]@{
        id          = $id
        name        = $name
        url         = $url
        note        = $note
        tags        = @($tags)
        territories = @($terr)
      }
    }

    [void]$ids.Add($id)
  }

  # Preserves your Google-list ordering; the app renders the pool in this order.
  $territoryOrder[$terr] = @($ids)
}

$book = [ordered]@{
  version        = 2
  generated      = (Get-Date).ToString('o')
  source         = (Split-Path $Source -Leaf)
  accounts       = $accounts
  territoryOrder = $territoryOrder
}

# Safety valve: a malformed export should not quietly replace a good book with a
# gutted one. Anything worse than 10% loss stops here unless -Force is passed.
$skipped = $rowCount - ($accounts.Count + $mergeCount)
if ($skipped -gt 0 -and -not $Force) {
  $lossPct = [math]::Round(100 * $skipped / [math]::Max($rowCount,1), 1)
  if ($lossPct -gt 10) {
    Write-Host ""
    $problems | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    throw "Refusing to write: $skipped of $rowCount rows ($lossPct%) could not be keyed. " +
          "Existing data\accounts.js left untouched. Fix the source, or re-run with -Force to accept the loss."
  }
}

$json = $book | ConvertTo-Json -Depth 12

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$jsonPath  = Join-Path $OutDir 'accounts.json'
$jsPath    = Join-Path $OutDir 'accounts.js'

# accounts.json is the portable/importable copy and gives clean git diffs.
[System.IO.File]::WriteAllText($jsonPath, $json, $utf8NoBom)
# accounts.js is what the page loads: a plain <script> works over file://, fetch() does not.
[System.IO.File]::WriteAllText($jsPath, "window.__ROUTE_BOARD_BOOK__ = $json;`r`n", $utf8NoBom)

# Browsers cache data/accounts.js aggressively (especially over file://), which
# silently serves a stale book after a rebuild. Stamp the script tag so each build
# gets a fresh URL.
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
# Every page that loads the book gets stamped, not just the standalone one, so an
# embedding page cannot be left serving a cached copy.
$pages = @()
if (Test-Path $App) {
  $pages = Get-ChildItem -Path (Split-Path $App -Parent) -Filter '*.html' -File
}
$stampedAny = $false
foreach ($page in $pages) {
  $html = Get-Content $page.FullName -Raw -Encoding UTF8
  $updated = [regex]::Replace($html, 'src="data/accounts\.js(\?v=\d+)?"', "src=`"data/accounts.js?v=$stamp`"")
  if ($updated -ne $html) {
    [System.IO.File]::WriteAllText($page.FullName, $updated, $utf8NoBom)
    Write-Host "stamped          : $($page.Name) (?v=$stamp)"
    $stampedAny = $true
  }
}
if (-not $stampedAny) {
  Write-Host "NOTE: no page referencing data/accounts.js found - cache stamp skipped." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "rows read        : $rowCount"
Write-Host "unique accounts  : $($accounts.Count)"
Write-Host "merged listings  : $mergeCount"
Write-Host "territories      : $($territoryOrder.Count)"
Write-Host "wrote            : $jsonPath"
Write-Host "wrote            : $jsPath"

if ($problems.Count) {
  Write-Host ""
  Write-Host "Review these ($($problems.Count)):" -ForegroundColor Yellow
  $problems | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
} else {
  Write-Host ""
  Write-Host "No conflicts to review."
}
