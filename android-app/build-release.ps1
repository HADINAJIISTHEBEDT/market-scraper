# Builds a signed AAB for Play Console upload.
$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

$storePass = Read-Host "Keystore password (market-scraper-keystore.jks)"
$keyPass = Read-Host "Key password (Enter if same as keystore)"
if ([string]::IsNullOrWhiteSpace($keyPass)) { $keyPass = $storePass }

@"
storeFile=market-scraper-keystore.jks
storePassword=$storePass
keyAlias=market-scraper-key
keyPassword=$keyPass
"@ | Set-Content -Path "$PSScriptRoot\keystore.properties" -Encoding ASCII

Set-Location $PSScriptRoot
.\gradlew.bat bundleRelease

$out = "$PSScriptRoot\app\build\outputs\bundle\release\app-release.aab"
$dest = "$PSScriptRoot\releases\pazar-fiyati-1.5.6-versionCode-20.aab"
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\releases" | Out-Null
Copy-Item $out $dest -Force
Write-Host "`nUpload this file to Play Console:" -ForegroundColor Green
Write-Host $dest
