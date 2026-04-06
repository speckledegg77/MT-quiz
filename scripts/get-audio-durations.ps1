$AudioFolder = "C:\Users\mark\musical-theatre-quiz\lib\audio\2026-04-06"
$InputCsv = "C:\Users\mark\musical-theatre-quiz\lib\audio\2026-04-06\Intro-Audio-Files.csv"
$OutputCsv = "C:\Users\mark\musical-theatre-quiz\lib\audio\2026-04-06\Intro-Audio-Files-with-durations.csv"

$rows = Import-Csv -Path $InputCsv -Delimiter ";" -Encoding Unicode

$cleanRows = $rows | Where-Object {
    $_.Title -and
    $_.Filename -and
    $_.Title -notmatch '^Mp3tag'
}

$result = foreach ($row in $cleanRows) {
    $folderPath = $row.Path.Trim()
    $fileName = $row.Filename.Trim()
    $fullPath = Join-Path $folderPath $fileName

    if (-not (Test-Path $fullPath)) {
        [pscustomobject]@{
            Title = $row.Title
            Artist = $row.Artist
            Album = $row.Album
            Filename = $row.Filename
            FullPath = $fullPath
            media_duration_ms = ""
            Status = "File not found"
        }
        continue
    }

    $durationSeconds = & ffprobe `
        -v error `
        -show_entries format=duration `
        -of default=noprint_wrappers=1:nokey=1 `
        "$fullPath"

    if ([string]::IsNullOrWhiteSpace($durationSeconds)) {
        [pscustomobject]@{
            Title = $row.Title
            Artist = $row.Artist
            Album = $row.Album
            Filename = $row.Filename
            FullPath = $fullPath
            media_duration_ms = ""
            Status = "Could not read duration"
        }
        continue
    }

    $durationMs = [int][math]::Round(([double]$durationSeconds) * 1000)

    [pscustomobject]@{
        Title = $row.Title
        Artist = $row.Artist
        Album = $row.Album
        Filename = $row.Filename
        FullPath = $fullPath
        media_duration_ms = $durationMs
        Status = "OK"
    }
}

$result | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8

Write-Host "Done. Output written to:"
Write-Host $OutputCsv