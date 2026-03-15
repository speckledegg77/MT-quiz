Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$chunkSize = 250

$sourceFiles = @(
  "app/host/page.tsx",
  "app/play/[code]/page.tsx",
  "app/display/[code]/page.tsx",
  "app/api/room/create/route.ts",
  "app/api/room/state/route.ts",
  "app/api/room/advance/route.ts",
  "app/api/room/start/route.ts",
  "app/api/room/answer/route.ts",
  "app/api/room/force-close/route.ts",
  "app/api/room/feasibility/route.ts",
  "components/GameCompletedSummary.tsx",
  "components/RoundSummaryCard.tsx",
  "components/admin/RoundTemplatesDashboard.tsx",
  "lib/quickfire.ts",
  "lib/roundFlow.ts",
  "lib/roundFeasibility.ts",
  "lib/roomRoundPlan.ts",
  "lib/manualRoundPlanBuilder.ts",
  "lib/roundTemplates.ts",
  "docs/context.md",
  "docs/decisions.md",
  "docs/roadmap.md"
)

function Get-RepoRoot {
  $scriptFolder = $null

  if ($PSScriptRoot -and -not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $scriptFolder = $PSScriptRoot
  }
  elseif ($PSCommandPath -and -not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
    $scriptFolder = Split-Path -Parent $PSCommandPath
  }
  else {
    $scriptFolder = (Get-Location).Path
  }

  $repoRoot = (& git -C $scriptFolder rev-parse --show-toplevel).Trim()

  if ([string]::IsNullOrWhiteSpace($repoRoot)) {
    throw "Could not find the Git repo root. Make sure Git is installed and this script is inside the repo."
  }

  return $repoRoot
}

function Convert-ToMirrorName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativePath
  )

  $name = $RelativePath -replace "[\\/]+", "__"
  $name = $name -replace "\[", "__lb__"
  $name = $name -replace "\]", "__rb__"
  $name = $name -replace ":", "_"
  return $name
}

function Get-FileLines {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FullPath
  )

  if (-not (Test-Path -LiteralPath $FullPath)) {
    return $null
  }

  $lines = Get-Content -LiteralPath $FullPath
  if ($null -eq $lines) {
    return @()
  }

  return @($lines)
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
$currentCommit = (& git rev-parse HEAD).Trim()
$preExportStatus = @(& git status --porcelain)
$workingTreeDirtyBeforeExport = $preExportStatus.Count -gt 0

$mirrorRoot = Join-Path $repoRoot "chatgpt-mirror"
$mirrorFilesRoot = Join-Path $mirrorRoot "files"

if (Test-Path -LiteralPath $mirrorRoot) {
  Remove-Item -LiteralPath $mirrorRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $mirrorRoot | Out-Null
New-Item -ItemType Directory -Path $mirrorFilesRoot | Out-Null

$manifestFiles = @()

foreach ($relativePath in $sourceFiles) {
  $normalisedRelativePath = $relativePath -replace "/", [IO.Path]::DirectorySeparatorChar
  $fullPath = Join-Path $repoRoot $normalisedRelativePath
  $mirrorBaseName = Convert-ToMirrorName -RelativePath $relativePath
  $lines = Get-FileLines -FullPath $fullPath

  if ($null -eq $lines) {
    $manifestFiles += [PSCustomObject]@{
      sourcePath = $relativePath
      exists = $false
      totalLines = 0
      chunks = @()
    }
    continue
  }

  $totalLines = $lines.Count
  $chunkCount = [Math]::Max(1, [int][Math]::Ceiling($totalLines / [double]$chunkSize))
  $chunkEntries = @()

  for ($chunkIndex = 0; $chunkIndex -lt $chunkCount; $chunkIndex++) {
    $startIndex = $chunkIndex * $chunkSize
    $startLine = if ($totalLines -eq 0) { 0 } else { $startIndex + 1 }

    if ($totalLines -eq 0) {
      $endIndex = -1
      $endLine = 0
      $chunkLines = @()
    }
    else {
      $endIndex = [Math]::Min($startIndex + $chunkSize - 1, $totalLines - 1)
      $endLine = $endIndex + 1

      if ($startIndex -eq $endIndex) {
        $chunkLines = @($lines[$startIndex])
      }
      else {
        $chunkLines = @($lines[$startIndex..$endIndex])
      }
    }

    $mirrorFileName = "{0}.part{1:d2}.txt" -f $mirrorBaseName, ($chunkIndex + 1)
    $mirrorFilePath = Join-Path $mirrorFilesRoot $mirrorFileName

    Set-Content -LiteralPath $mirrorFilePath -Value $chunkLines -Encoding utf8

    $chunkEntries += [PSCustomObject]@{
      mirrorPath = ("files/" + $mirrorFileName)
      chunkNumber = $chunkIndex + 1
      startLine = $startLine
      endLine = $endLine
      lineCount = if ($totalLines -eq 0) { 0 } else { $endLine - $startLine + 1 }
    }
  }

  $manifestFiles += [PSCustomObject]@{
    sourcePath = $relativePath
    exists = $true
    totalLines = $totalLines
    chunks = $chunkEntries
  }
}

$manifest = [PSCustomObject]@{
  exportName = "chatgpt-mirror"
  exportedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  sourceRepoRoot = $repoRoot
  sourceBranch = $currentBranch
  sourceCommit = $currentCommit
  workingTreeDirtyBeforeExport = $workingTreeDirtyBeforeExport
  chunkSize = $chunkSize
  fileCount = $sourceFiles.Count
  files = $manifestFiles
}

$manifestPath = Join-Path $mirrorRoot "manifest.json"
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8

$readme = @"
# ChatGPT Mirror

This folder is generated from the local repo by scripts/export-chatgpt-mirror.ps1

Do not edit files in this folder by hand.

Source branch: $currentBranch
Source commit: $currentCommit
Exported UTC: $($manifest.exportedAtUtc)
Chunk size: $chunkSize lines

Use manifest.json to map chunk files back to their original source paths and line ranges.
"@

$readmePath = Join-Path $mirrorRoot "README.md"
Set-Content -LiteralPath $readmePath -Value $readme -Encoding utf8

Write-Host ""
Write-Host "ChatGPT mirror export complete." -ForegroundColor Green
Write-Host "Mirror folder: $mirrorRoot"
Write-Host "Manifest: $manifestPath"
Write-Host ""
Write-Host "Exported files summary:" -ForegroundColor Cyan

foreach ($fileEntry in $manifestFiles) {
  if ($fileEntry.exists) {
    Write-Host ("- {0}  ->  {1} lines across {2} chunk(s)" -f $fileEntry.sourcePath, $fileEntry.totalLines, $fileEntry.chunks.Count)
  }
  else {
    Write-Host ("- {0}  ->  missing" -f $fileEntry.sourcePath) -ForegroundColor Yellow
  }
}