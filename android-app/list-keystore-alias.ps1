# Lists aliases inside your keystore (copies to ASCII path first for keytool on Windows)
$ErrorActionPreference = "Stop"
$keytool = "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
if (-not (Test-Path $keytool)) {
  Write-Host "keytool not found. Install Android Studio or fix the path above."
  exit 1
}

$defaultPath = Join-Path $PSScriptRoot "market-scraper-keystore.jks"
if (-not (Test-Path $defaultPath)) {
  $defaultPath = Join-Path $PSScriptRoot "dessert-keystore.jks"
}

$path = Read-Host "Keystore path (Enter for $defaultPath)"
if ([string]::IsNullOrWhiteSpace($path)) { $path = $defaultPath }
if (-not (Test-Path $path)) {
  Write-Host "File not found: $path"
  exit 1
}

$tempPath = Join-Path $env:USERPROFILE "market-scraper-keystore-check.jks"
Copy-Item -Path $path -Destination $tempPath -Force
Write-Host "Copied to: $tempPath"
Write-Host "Enter keystore password when keytool asks.`n"

& $keytool -list -v -keystore $tempPath

Write-Host "`nUse the name BEFORE the first comma as Key alias in Android Studio."
Write-Host "For signing, also use this path (no Turkish characters):"
Write-Host "  $tempPath"
