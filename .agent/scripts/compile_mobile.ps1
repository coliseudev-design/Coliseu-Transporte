param(
    [switch]$bumpVersion = $false
)

$pubspecPath = "C:\Users\rober\.gemini\antigravity\scratch\autocenter-app\mobile-flutter\pubspec.yaml"
$buildOutputDir = "C:\Users\rober\.gemini\antigravity\scratch\autocenter-app\builds"

# Ensure output directory exists
if (-not (Test-Path $buildOutputDir)) {
    New-Item -ItemType Directory -Force -Path $buildOutputDir | Out-Null
}

# Read pubspec
$pubspecContent = Get-Content $pubspecPath
$versionLine = $pubspecContent | Where-Object { $_ -match "^version:\s" }
$version = $versionLine -replace "^version:\s", ""

# Split into X.Y.Z and BuildNumber
$parts = $version -split "\+"
$semver = $parts[0]
$buildNumber = [int]$parts[1]

# Bump Version (optional)
if ($bumpVersion) {
    $buildNumber++
    $version = "$semver+$buildNumber"
    $pubspecContent = $pubspecContent -replace "^version:\s.*", "version: $version"
    Set-Content -Path $pubspecPath -Value $pubspecContent
    Write-Host "Bumped Version to: $version" -ForegroundColor Cyan
}

Write-Host "Começando compilação do autocentermobile (Versão: $version)..." -ForegroundColor Yellow
Set-Location "C:\Users\rober\.gemini\antigravity\scratch\autocenter-app\mobile-flutter"

# Compile and store logs in null, but throw errors if failed
flutter build apk --release | Out-Null

$originalApk = "build\app\outputs\flutter-apk\app-release.apk"

if (Test-Path $originalApk) {
    # Move and Rename according to the RULE
    $finalApkName = "autocentermobile_v${semver}_b${buildNumber}.apk"
    $finalApkPath = Join-Path $buildOutputDir $finalApkName
    
    Copy-Item $originalApk -Destination $finalApkPath -Force
    
    Write-Host " "
    Write-Host "✅ COMPILAÇÃO BEM SUCEDIDA E REGRA APLICADA!" -ForegroundColor Green
    Write-Host "Versão do APK: $version"
    Write-Host "Caminho Completo do Arquivo:" -ForegroundColor Cyan
    Write-Host "$finalApkPath" -ForegroundColor White
} else {
    Write-Host "❌ Falha na compilação. Arquivo app-release.apk não encontrado." -ForegroundColor Red
}
