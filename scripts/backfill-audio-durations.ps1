param(
  [string]$EnvFile = ".env.local",
  [string]$AudioRoot = "lib/audio",
  [string]$OutputFolder = "chatgpt-exports",
  [switch]$DryRun,
  [switch]$OverwriteExisting
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
    throw "Could not find the Git repo root."
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

function Get-EnvMap {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EnvFilePath
  )

  if (-not (Test-Path -LiteralPath $EnvFilePath)) {
    throw "Env file not found: $EnvFilePath"
  }

  $map = @{}
  $lines = Get-Content -LiteralPath $EnvFilePath

  foreach ($line in $lines) {
    $trimmed = [string]$line
    if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
    if ($trimmed.TrimStart().StartsWith("#")) { continue }

    $firstEquals = $trimmed.IndexOf("=")
    if ($firstEquals -lt 1) { continue }

    $key = $trimmed.Substring(0, $firstEquals).Trim()
    $value = $trimmed.Substring($firstEquals + 1).Trim()

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $map[$key] = $value
  }

  return $map
}

function Get-FfprobeDurationMs {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  $ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
  if ($null -eq $ffprobe) {
    throw "ffprobe is not available in PATH. Install FFmpeg and make sure ffprobe is available."
  }

  $raw = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -- "$FilePath"
  $text = [string]::Join("", @($raw)).Trim()

  if ([string]::IsNullOrWhiteSpace($text)) {
    throw "ffprobe returned no duration for $FilePath"
  }

  $seconds = 0.0
  if (-not [double]::TryParse($text, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$seconds)) {
    throw "Could not parse ffprobe duration '$text' for $FilePath"
  }

  return [int][Math]::Round($seconds * 1000)
}

function Get-SupabaseHeaders {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ServiceRoleKey
  )

  return @{
    apikey        = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
  }
}

function Get-QuestionsPage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [hashtable]$Headers,
    [Parameter(Mandatory = $true)]
    [int]$Limit,
    [Parameter(Mandatory = $true)]
    [int]$Offset
  )

  $uri = "$BaseUrl/rest/v1/questions?select=id,audio_path,media_duration_ms&audio_path=not.is.null&order=id.asc&limit=$Limit&offset=$Offset"
  $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $Headers

  if ($null -eq $response) {
    return @()
  }

  return @($response)
}

function Update-QuestionDuration {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$ServiceRoleKey,
    [Parameter(Mandatory = $true)]
    [string]$QuestionId,
    [Parameter(Mandatory = $true)]
    [int]$DurationMs
  )

  $uri = "$BaseUrl/rest/v1/questions?id=eq.$([uri]::EscapeDataString($QuestionId))"

  $headers = @{
    apikey         = $ServiceRoleKey
    Authorization  = "Bearer $ServiceRoleKey"
    "Content-Type" = "application/json"
    Prefer         = "return=minimal"
  }

  $body = @{ media_duration_ms = $DurationMs } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body $body | Out-Null
}

function Resolve-AudioFilePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$AudioRootFullPath,
    [Parameter(Mandatory = $true)]
    [string]$AudioPath
  )

  $trimmed = [string]$AudioPath
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return $null
  }

  $normalised = $trimmed.Trim() -replace "/", "\"

  if ([string]::IsNullOrWhiteSpace([System.IO.Path]::GetExtension($normalised))) {
    return $null
  }

  $candidates = New-Object System.Collections.Generic.List[string]

  if ([System.IO.Path]::IsPathRooted($normalised)) {
    $candidates.Add($normalised) | Out-Null
  }
  else {
    $candidates.Add((Join-Path $AudioRootFullPath $normalised)) | Out-Null
    $candidates.Add((Join-Path $RepoRoot $normalised)) | Out-Null

    if ($normalised.StartsWith("audio\")) {
      $withoutAudioPrefix = $normalised.Substring(6)
      $candidates.Add((Join-Path $AudioRootFullPath $withoutAudioPrefix)) | Out-Null
    }

    if ($normalised.StartsWith("lib\audio\")) {
      $candidates.Add((Join-Path $RepoRoot $normalised)) | Out-Null
    }
  }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }

  return $null
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

$envFilePath = Join-Path $repoRoot $EnvFile
$envMap = Get-EnvMap -EnvFilePath $envFilePath

$supabaseUrl = [string]$envMap["NEXT_PUBLIC_SUPABASE_URL"]
$serviceRoleKey = [string]$envMap["SUPABASE_SERVICE_ROLE_KEY"]

if ([string]::IsNullOrWhiteSpace($supabaseUrl)) {
  throw "NEXT_PUBLIC_SUPABASE_URL is missing from $EnvFile"
}

if ([string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  throw "SUPABASE_SERVICE_ROLE_KEY is missing from $EnvFile"
}

$audioRootFullPath = Join-Path $repoRoot $AudioRoot
if (-not (Test-Path -LiteralPath $audioRootFullPath)) {
  throw "Audio root not found: $audioRootFullPath"
}

$outputFolderFullPath = Join-Path $repoRoot $OutputFolder
New-DirectoryIfMissing -Path $outputFolderFullPath

$headers = Get-SupabaseHeaders -ServiceRoleKey $serviceRoleKey

$allQuestions = @()
$limit = 1000
$offset = 0

while ($true) {
  $page = Get-QuestionsPage -BaseUrl $supabaseUrl -Headers $headers -Limit $limit -Offset $offset
  if ($page.Count -eq 0) {
    break
  }

  $allQuestions += $page

  if ($page.Count -lt $limit) {
    break
  }

  $offset += $limit
}

$results = New-Object System.Collections.Generic.List[object]
$updatedCount = 0
$skippedCount = 0
$errorCount = 0

foreach ($question in $allQuestions) {
  $questionId = [string]$question.id
  $audioPath = [string]$question.audio_path
  $existingDuration = $question.media_duration_ms

  if ([string]::IsNullOrWhiteSpace($audioPath)) {
    $results.Add([PSCustomObject]@{
      question_id = $questionId
      audio_path = $audioPath
      existing_media_duration_ms = $existingDuration
      detected_media_duration_ms = $null
      status = "skipped_no_audio_path"
      note = ""
    }) | Out-Null
    $skippedCount++
    continue
  }

  if (-not $OverwriteExisting -and $null -ne $existingDuration -and [string]$existingDuration -ne "") {
    $results.Add([PSCustomObject]@{
      question_id = $questionId
      audio_path = $audioPath
      existing_media_duration_ms = $existingDuration
      detected_media_duration_ms = $existingDuration
      status = "skipped_existing_duration"
      note = ""
    }) | Out-Null
    $skippedCount++
    continue
  }

  $localPath = Resolve-AudioFilePath -RepoRoot $repoRoot -AudioRootFullPath $audioRootFullPath -AudioPath $audioPath

  if ($null -eq $localPath) {
    $status = "missing_file"
    $note = "Could not resolve local file from audio_path"

    $trimmedAudioPath = [string]$audioPath
    if ([string]::IsNullOrWhiteSpace([System.IO.Path]::GetExtension($trimmedAudioPath))) {
      $status = "invalid_audio_path"
      $note = "audio_path does not look like a file path"
    }

    $results.Add([PSCustomObject]@{
      question_id = $questionId
      audio_path = $audioPath
      existing_media_duration_ms = $existingDuration
      detected_media_duration_ms = $null
      status = $status
      note = $note
    }) | Out-Null
    $errorCount++
    continue
  }

  try {
    $durationMs = Get-FfprobeDurationMs -FilePath $localPath

    if (-not $DryRun) {
      Update-QuestionDuration -BaseUrl $supabaseUrl -ServiceRoleKey $serviceRoleKey -QuestionId $questionId -DurationMs $durationMs
    }

    $results.Add([PSCustomObject]@{
      question_id = $questionId
      audio_path = $audioPath
      existing_media_duration_ms = $existingDuration
      detected_media_duration_ms = $durationMs
      status = $(if ($DryRun) { "dry_run" } else { "updated" })
      note = $localPath
    }) | Out-Null

    $updatedCount++
  }
  catch {
    $results.Add([PSCustomObject]@{
      question_id = $questionId
      audio_path = $audioPath
      existing_media_duration_ms = $existingDuration
      detected_media_duration_ms = $null
      status = "error"
      note = $_.Exception.Message
    }) | Out-Null
    $errorCount++
  }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $outputFolderFullPath "audio-duration-backfill-report-$timestamp.csv"
$results | Export-Csv -LiteralPath $reportPath -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "Audio duration backfill complete." -ForegroundColor Green
Write-Host "Questions scanned: $($allQuestions.Count)"
Write-Host "Updated or dry run: $updatedCount"
Write-Host "Skipped: $skippedCount"
Write-Host "Errors or missing files: $errorCount"
Write-Host "Report: $reportPath"
Write-Host ""

if ($DryRun) {
  Write-Host "Dry run only. No database updates were written." -ForegroundColor Yellow
  Write-Host ""
}