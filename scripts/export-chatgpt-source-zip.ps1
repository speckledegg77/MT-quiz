param(
  [string]$OutputFolder = "",
  [string]$ZipBaseName = "mt-quiz",
  [switch]$KeepStage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

function New-DirectoryIfMissing {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Test-ExcludedDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DirectoryName,
    [Parameter(Mandatory = $true)]
    [System.Collections.Generic.HashSet[string]]$ExcludedDirectoryNames
  )

  return $ExcludedDirectoryNames.Contains($DirectoryName.ToLowerInvariant())
}

function Test-ExcludedExtension {
  param(
    [Parameter(Mandatory = $false)]
    [string]$Extension,
    [Parameter(Mandatory = $true)]
    [System.Collections.Generic.HashSet[string]]$ExcludedExtensions
  )

  if ([string]::IsNullOrWhiteSpace($Extension)) {
    return $false
  }

  return $ExcludedExtensions.Contains($Extension.ToLowerInvariant())
}

function Get-NormalisedFullPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $resolved = Resolve-Path -LiteralPath $Path
  if ($null -eq $resolved) {
    throw "Could not resolve path: $Path"
  }

  return [System.IO.Path]::GetFullPath($resolved.Path)
}

function Get-SafeFilenamePart {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $safe = $Value.Trim()
  $safe = $safe -replace "[^A-Za-z0-9._-]", "-"
  $safe = $safe -replace "-+", "-"
  $safe = $safe.Trim("-")

  if ([string]::IsNullOrWhiteSpace($safe)) {
    throw "Filename part cannot be empty after sanitising."
  }

  return $safe
}

function Get-RelativePathSafe {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  $baseFull = Get-NormalisedFullPath -Path $BasePath
  $targetFull = Get-NormalisedFullPath -Path $TargetPath

  if (-not $baseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $baseFull = $baseFull + [System.IO.Path]::DirectorySeparatorChar
  }

  $baseUri = New-Object System.Uri($baseFull)
  $targetUri = New-Object System.Uri($targetFull)
  $relativeUri = $baseUri.MakeRelativeUri($targetUri)
  $relativePath = [System.Uri]::UnescapeDataString($relativeUri.ToString())

  return $relativePath -replace "/", [System.IO.Path]::DirectorySeparatorChar
}

function Copy-FilePreservingRelativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceFile,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$StageRoot
  )

  $relativePath = Get-RelativePathSafe -BasePath $RepoRoot -TargetPath $SourceFile
  $destinationPath = Join-Path $StageRoot $relativePath
  $destinationDir = Split-Path -Parent $destinationPath

  New-DirectoryIfMissing -Path $destinationDir
  Copy-Item -LiteralPath $SourceFile -Destination $destinationPath -Force

  return $relativePath
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($OutputFolder)) {
  $OutputFolder = Join-Path $repoRoot "chatgpt-exports"
}

$includePaths = @(
  "app",
  "components",
  "lib",
  "docs",
  "scripts",
  "public",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "postcss.config.js",
  "postcss.config.mjs",
  "tailwind.config.js",
  "tailwind.config.ts",
  "eslint.config.js",
  "eslint.config.mjs",
  "middleware.ts",
  "README.md",
  ".env.example"
)

$excludedDirectoryNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "out",
  ".vercel",
  ".turbo",
  "chatgpt-exports",
  "chatgpt-export-stage",
  "chatgpt-mirror"
) | ForEach-Object { [void]$excludedDirectoryNames.Add($_) }

$excludedExtensions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".zip",
  ".rar",
  ".7z",
  ".pdf",
  ".psd",
  ".ai"
) | ForEach-Object { [void]$excludedExtensions.Add($_) }

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
$currentCommit = (& git rev-parse HEAD).Trim()
$shortCommit = (& git rev-parse --short HEAD).Trim()
$workingTreeDirty = @(& git status --porcelain).Count -gt 0

$stageRoot = Join-Path $repoRoot "chatgpt-export-stage"
if (Test-Path -LiteralPath $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-DirectoryIfMissing -Path $stageRoot
New-DirectoryIfMissing -Path $OutputFolder

$includedFiles = New-Object System.Collections.Generic.List[string]
$skippedFiles = New-Object System.Collections.Generic.List[string]
$missingIncludePaths = New-Object System.Collections.Generic.List[string]

foreach ($includePath in $includePaths) {
  $sourcePath = Join-Path $repoRoot $includePath

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    $missingIncludePaths.Add($includePath) | Out-Null
    continue
  }

  $item = Get-Item -LiteralPath $sourcePath

  if ($item.PSIsContainer) {
    $directories = Get-ChildItem -LiteralPath $sourcePath -Directory -Recurse -Force | Sort-Object FullName
    foreach ($directory in $directories) {
      if (Test-ExcludedDirectory -DirectoryName $directory.Name -ExcludedDirectoryNames $excludedDirectoryNames) {
        continue
      }

      $relativeDir = Get-RelativePathSafe -BasePath $repoRoot -TargetPath $directory.FullName
      $destinationDir = Join-Path $stageRoot $relativeDir
      New-DirectoryIfMissing -Path $destinationDir
    }

    $files = Get-ChildItem -LiteralPath $sourcePath -File -Recurse -Force | Sort-Object FullName
    foreach ($file in $files) {
      $skipForDirectory = $false
      $parent = $file.Directory

      while ($null -ne $parent) {
        if ((Get-NormalisedFullPath -Path $parent.FullName) -eq (Get-NormalisedFullPath -Path $repoRoot)) {
          break
        }

        if (Test-ExcludedDirectory -DirectoryName $parent.Name -ExcludedDirectoryNames $excludedDirectoryNames) {
          $skipForDirectory = $true
          break
        }

        $parent = $parent.Parent
      }

      if ($skipForDirectory) {
        $skippedFiles.Add((Get-RelativePathSafe -BasePath $repoRoot -TargetPath $file.FullName)) | Out-Null
        continue
      }

      if (Test-ExcludedExtension -Extension $file.Extension -ExcludedExtensions $excludedExtensions) {
        $skippedFiles.Add((Get-RelativePathSafe -BasePath $repoRoot -TargetPath $file.FullName)) | Out-Null
        continue
      }

      $copiedRelativePath = Copy-FilePreservingRelativePath -SourceFile $file.FullName -RepoRoot $repoRoot -StageRoot $stageRoot
      $includedFiles.Add($copiedRelativePath) | Out-Null
    }
  }
  else {
    if (Test-ExcludedExtension -Extension $item.Extension -ExcludedExtensions $excludedExtensions) {
      $skippedFiles.Add($includePath) | Out-Null
      continue
    }

    $copiedRelativePath = Copy-FilePreservingRelativePath -SourceFile $item.FullName -RepoRoot $repoRoot -StageRoot $stageRoot
    $includedFiles.Add($copiedRelativePath) | Out-Null
  }
}

$manifest = [PSCustomObject]@{
  exportName = $ZipBaseName
  exportedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  sourceRepoRoot = $repoRoot
  sourceBranch = $currentBranch
  sourceCommit = $currentCommit
  sourceShortCommit = $shortCommit
  workingTreeDirty = $workingTreeDirty
  includePaths = $includePaths
  missingIncludePaths = $missingIncludePaths
  excludedDirectoryNames = @($excludedDirectoryNames | Sort-Object)
  excludedExtensions = @($excludedExtensions | Sort-Object)
  includedFileCount = $includedFiles.Count
  skippedFileCount = $skippedFiles.Count
  includedFiles = @($includedFiles)
}

$manifestPath = Join-Path $stageRoot "manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8

$readme = @"
This zip was generated by scripts/export-chatgpt-source-zip.ps1

Purpose:
A clean source snapshot for ChatGPT work.

Included:
Code, docs, scripts, and config files.

Excluded:
Media files, archive files, build output, dependencies, and Git metadata.

Source branch: $currentBranch
Source commit: $currentCommit
Working tree dirty: $workingTreeDirty
Exported UTC: $($manifest.exportedAtUtc)
"@

Set-Content -LiteralPath (Join-Path $stageRoot "README-chatgpt-export.txt") -Value $readme -Encoding utf8

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$filenameParts = New-Object System.Collections.Generic.List[string]
$filenameParts.Add((Get-SafeFilenamePart -Value $ZipBaseName)) | Out-Null
$filenameParts.Add($timestamp) | Out-Null
$filenameParts.Add((Get-SafeFilenamePart -Value $shortCommit)) | Out-Null

if ($workingTreeDirty) {
  $filenameParts.Add("dirty") | Out-Null
}

if ($currentBranch -ne "main") {
  $filenameParts.Add((Get-SafeFilenamePart -Value $currentBranch)) | Out-Null
}

$timestampedZipFileName = ((@($filenameParts) -join "-") + ".zip")
$timestampedZipPath = Join-Path $OutputFolder $timestampedZipFileName
$latestZipPath = Join-Path $OutputFolder ((Get-SafeFilenamePart -Value $ZipBaseName) + ".zip")

if (Test-Path -LiteralPath $timestampedZipPath) {
  Remove-Item -LiteralPath $timestampedZipPath -Force
}

if (Test-Path -LiteralPath $latestZipPath) {
  Remove-Item -LiteralPath $latestZipPath -Force
}

Compress-Archive -LiteralPath $stageRoot -DestinationPath $timestampedZipPath -CompressionLevel Optimal
Copy-Item -LiteralPath $timestampedZipPath -Destination $latestZipPath -Force

if (-not $KeepStage) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}

Write-Host ""
Write-Host "ChatGPT source export complete." -ForegroundColor Green
Write-Host "Timestamped zip: $timestampedZipPath"
Write-Host "Latest zip:      $latestZipPath"
Write-Host "Included files:  $($includedFiles.Count)"
Write-Host "Skipped files:   $($skippedFiles.Count)"
Write-Host "Commit:          $currentCommit"
Write-Host "Short commit:    $shortCommit"
Write-Host "Working dirty:   $workingTreeDirty"
Write-Host ""

if ($missingIncludePaths.Count -gt 0) {
  Write-Host "Missing include paths:" -ForegroundColor Yellow
  $missingIncludePaths | ForEach-Object { Write-Host " - $_" }
  Write-Host ""
}