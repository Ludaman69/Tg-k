# ============================================================================
#  Сборка и публикация Android APK (раздача напрямую с сервера, без Google Play)
# ============================================================================
#
#  Что делает скрипт:
#   1. Собирает фронтенд в нативном режиме (VITE_API_ORIGIN из .env.native)
#   2. Синхронизирует ассеты в Android-проект (cap sync)
#   3. Собирает подписанный release APK
#   4. Формирует version.json с метаданными
#   5. (опционально) копирует APK + version.json на сервер по SSH
#
#  Использование:
#    .\publish-apk.ps1                                  # только локальная сборка
#    .\publish-apk.ps1 -Deploy -SshHost 1.2.3.4         # сборка + деплой
#    .\publish-apk.ps1 -Changelog "Исправлены звонки","Ускорена загрузка"
#
#  Требования: JDK 21, Android SDK, keystore.properties в apps/web/android

param(
    [switch]$Deploy,
    [switch]$Debug,
    [string]$SshUser = "root",
    [string]$SshHost = "",
    [string]$RemoteDir = "/var/www/vortex/apps/server/downloads",
    [string[]]$Changelog = @(),
    [switch]$Mandatory
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebDir = Join-Path $Root "apps\web"
$AndroidDir = Join-Path $WebDir "android"
$DownloadsDir = Join-Path $Root "apps\server\downloads"

function Write-Step($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

function Write-Ok($text) {
    Write-Host "  [OK] $text" -ForegroundColor Green
}

# ── Проверка окружения ──────────────────────────────────────────────────
Write-Step "Проверка окружения"

if (-not $env:JAVA_HOME) {
    # Ищем JDK 21 в стандартном для проекта месте
    $jdk21 = Get-ChildItem "C:\tools\java" -Directory -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -like "jdk-21*" } | Select-Object -First 1
    if ($jdk21) {
        $env:JAVA_HOME = $jdk21.FullName
        Write-Host "  JAVA_HOME не был задан, используем $($jdk21.FullName)" -ForegroundColor Yellow
    } else {
        Write-Error "JAVA_HOME не задан и JDK 21 не найден. Capacitor 8 требует JDK 21."
    }
}
Write-Ok "JAVA_HOME: $env:JAVA_HOME"

if (-not $env:ANDROID_HOME) {
    if (Test-Path "C:\tools\android") {
        $env:ANDROID_HOME = "C:\tools\android"
    } else {
        Write-Error "ANDROID_HOME не задан. Установите Android SDK."
    }
}
Write-Ok "ANDROID_HOME: $env:ANDROID_HOME"

$keystoreProps = Join-Path $AndroidDir "keystore.properties"
if (-not $Debug -and -not (Test-Path $keystoreProps)) {
    Write-Error "Не найден $keystoreProps. Скопируйте keystore.properties.example и заполните."
}

# ── Версия из build.gradle ──────────────────────────────────────────────
Write-Step "Чтение версии"

$gradleFile = Join-Path $AndroidDir "app\build.gradle"
$gradleText = Get-Content $gradleFile -Raw

$versionCode = [regex]::Match($gradleText, 'versionCode\s+(\d+)').Groups[1].Value
$versionName = [regex]::Match($gradleText, 'versionName\s+"([^"]+)"').Groups[1].Value

if (-not $versionCode -or -not $versionName) {
    Write-Error "Не удалось определить versionCode/versionName в $gradleFile"
}
Write-Ok "versionCode=$versionCode, versionName=$versionName"

# ── Сборка фронтенда + синхронизация ───────────────────────────────────
Write-Step "Сборка веб-ассетов (режим native)"

Push-Location $WebDir
try {
    & cmd /c "npx tsc -b"
    if ($LASTEXITCODE -ne 0) { Write-Error "Ошибка компиляции TypeScript" }

    & cmd /c "npx vite build --mode native"
    if ($LASTEXITCODE -ne 0) { Write-Error "Ошибка сборки Vite" }
    Write-Ok "dist/ собран"

    & cmd /c "npx cap sync android"
    if ($LASTEXITCODE -ne 0) { Write-Error "Ошибка cap sync" }
    Write-Ok "Ассеты синхронизированы в Android-проект"
} finally {
    Pop-Location
}

# ── Сборка APK ──────────────────────────────────────────────────────────
$buildType = if ($Debug) { "Debug" } else { "Release" }
Write-Step "Сборка APK ($buildType)"

Push-Location $AndroidDir
try {
    & cmd /c ".\gradlew.bat assemble$buildType --console=plain"
    if ($LASTEXITCODE -ne 0) { Write-Error "Ошибка сборки Gradle" }
} finally {
    Pop-Location
}

$apkDir = Join-Path $AndroidDir "app\build\outputs\apk\$($buildType.ToLower())"
$apk = Get-ChildItem $apkDir -Filter "*.apk" | Select-Object -First 1

if (-not $apk) {
    Write-Error "APK не найден в $apkDir"
}

$apkSizeMb = [math]::Round($apk.Length / 1MB, 2)
Write-Ok "APK: $($apk.FullName) ($apkSizeMb MB)"

# ── version.json ────────────────────────────────────────────────────────
Write-Step "Формирование version.json"

$targetName = "bkonekte-$versionName.apk"

if (-not (Test-Path $DownloadsDir)) {
    New-Item -ItemType Directory -Path $DownloadsDir -Force | Out-Null
}

Copy-Item $apk.FullName (Join-Path $DownloadsDir $targetName) -Force

$meta = [ordered]@{
    android = [ordered]@{
        versionCode = [int]$versionCode
        versionName = $versionName
        fileName    = $targetName
        changelog   = @($Changelog)
        mandatory   = [bool]$Mandatory
        publishedAt = (Get-Date).ToString("o")
    }
}

$metaPath = Join-Path $DownloadsDir "version.json"
$json = $meta | ConvertTo-Json -Depth 5
# .NET UTF8 без BOM — JSON.parse в Node.js не принимает BOM
[System.IO.File]::WriteAllText($metaPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Ok "version.json обновлён"

# ── Деплой на сервер ────────────────────────────────────────────────────
if ($Deploy) {
    if (-not $SshHost) {
        Write-Error "Укажите -SshHost для деплоя"
    }

    Write-Step "Деплой на $SshUser@$SshHost"

    & ssh "$SshUser@$SshHost" "mkdir -p $RemoteDir"
    if ($LASTEXITCODE -ne 0) { Write-Error "Не удалось создать $RemoteDir на сервере" }

    & scp (Join-Path $DownloadsDir $targetName) "${SshUser}@${SshHost}:$RemoteDir/$targetName"
    if ($LASTEXITCODE -ne 0) { Write-Error "Ошибка копирования APK" }

    & scp $metaPath "${SshUser}@${SshHost}:$RemoteDir/version.json"
    if ($LASTEXITCODE -ne 0) { Write-Error "Ошибка копирования version.json" }

    Write-Ok "Файлы загружены"
    Write-Host ""
    Write-Host "  Проверьте: https://tg-k.ru/api/app-version" -ForegroundColor White
    Write-Host "  Скачивание: https://tg-k.ru/downloads/$targetName" -ForegroundColor White
}

Write-Host ""
Write-Host "=== Готово ===" -ForegroundColor Green
Write-Host "  APK:     $(Join-Path $DownloadsDir $targetName)"
Write-Host "  Версия:  $versionName (code $versionCode)"
if (-not $Deploy) {
    Write-Host ""
    Write-Host "  Для публикации на сервере выполните:" -ForegroundColor Yellow
    Write-Host "    .\publish-apk.ps1 -Deploy -SshHost <IP>"
}
