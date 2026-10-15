# PL01-1K Gitee original repository PERSONAL archive helper.
# Clone into the user's Downloads directory, NOT into the public GitHub repo.
$ErrorActionPreference = "Stop"
$target = Join-Path $env:USERPROFILE "Downloads\PL01-Gitee-original"
if (Test-Path -LiteralPath $target) {
  throw "Already exists: $target (rename/remove it before repeating)"
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is required. Or open https://gitee.com/opsGoud/latency-tester and choose Download ZIP."
}
& git clone --depth 1 --branch master -- "https://gitee.com/opsGoud/latency-tester.git" $target
if ($LASTEXITCODE -ne 0) { throw "Gitee clone failed; try downloading the ZIP from the browser." }
Write-Host "Saved original Gitee repository to: $target"
& git -C $target log -1 --format="%H %cs %s"
Write-Host "Note: Gitee does not publish a license. This is for personal archival only."
