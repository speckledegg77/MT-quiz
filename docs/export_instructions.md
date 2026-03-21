powershell -ExecutionPolicy Bypass -File .\scripts\export-chatgpt-source-zip.ps1

git add -A
git commit -m "Checkpoint"
git tag "checkpoint-$(Get-Date -Format 'yyyyMMdd-HHmm')"
git push origin main --tags