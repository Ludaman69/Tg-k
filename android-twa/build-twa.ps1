# ============================================================================
# Скрипт сборки TWA (Trusted Web Activity) для Bkonekte
# ============================================================================
#
# Требования:
#   - Java JDK 11+ (установлен)
#   - Android SDK (установлен, ANDROID_HOME задан)
#   - Gradle (используется wrapper)
#
# Использование:
#   .\build-twa.ps1                # Собрать debug APK
#   .\build-twa.ps1 -Release       # Собрать release AAB (подписанный)
#   .\build-twa.ps1 -Install       # Собрать и установить на устройство
#   .\build-twa.ps1 -Clean         # Очистить сборку

param(
    [switch]$Release,
    [switch]$Install,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Сборка TWA для Bkonekte                             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Проверка Java
try {
    $javaVer = java -version 2>&1 | Select-String "version" | ForEach-Object { $_ -replace '.*version "([^"]+)".*', '$1' }
    Write-Host "✓ Java: $javaVer" -ForegroundColor Green
} catch {
    Write-Error "✗ Java не найдена. Установите JDK 17+."
    exit 1
}

# Проверка ANDROID_HOME
if (-not $env:ANDROID_HOME) {
    Write-Error "✗ ANDROID_HOME не задан. Установите Android SDK."
    exit 1
}
Write-Host "✓ ANDROID_HOME: $($env:ANDROID_HOME)" -ForegroundColor Green

# Проверка Android SDK (platform)
$platformPath = Join-Path $env:ANDROID_HOME "platforms"
if (-not (Test-Path $platformPath)) {
    Write-Warning "⚠ Android SDK platforms не найдены. Установите через SDK Manager."
}

# Проверка local.properties
$localProps = Join-Path $ProjectDir "local.properties"
if (-not (Test-Path $localProps)) {
    Write-Host "Создаём local.properties..."
    "sdk.dir=$($env:ANDROID_HOME -replace '\\', '\\')" | Out-File -FilePath $localProps -Encoding ascii
    Write-Host "✓ local.properties создан" -ForegroundColor Green
}

# Переход в директорию проекта
Push-Location $ProjectDir

try {
    # Gradle wrapper
    $gradlew = Join-Path $ProjectDir "gradlew.bat"
    
    if (-not (Test-Path $gradlew)) {
        Write-Warning "⚠ gradlew.bat не найден. Скачиваем Gradle wrapper..."
        # В реальном проекте нужно скачать wrapper:
        # Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-8.10.2-bin.zip" ...
    }

    # Clean
    if ($Clean) {
        Write-Host "`n🧹 Очистка сборки..." -ForegroundColor Yellow
        & $gradlew clean
        Write-Host "✓ Готово" -ForegroundColor Green
        return
    }

    # Выбор задачи Gradle
    if ($Release) {
        Write-Host "`n📦 Сборка RELEASE (AAB)..." -ForegroundColor Yellow
        & $gradlew bundleRelease
        
        Write-Host "`n🔑 Подписание..." -ForegroundColor Yellow
        & $gradlew signReleaseBundle
        
        $aabPath = Join-Path $ProjectDir "app\build\outputs\bundle\release\app-release.aab"
        if (Test-Path $aabPath) {
            Write-Host "`n✅ Release AAB готов: $aabPath" -ForegroundColor Green
        }
    } else {
        Write-Host "`n🔧 Сборка DEBUG (APK)..." -ForegroundColor Yellow
        & $gradlew assembleDebug
        
        $apkPath = Join-Path $ProjectDir "app\build\outputs\apk\debug\app-debug.apk"
        if (Test-Path $apkPath) {
            Write-Host "`n✅ Debug APK готов: $apkPath" -ForegroundColor Green
            $size = (Get-Item $apkPath).Length / 1MB
            Write-Host "   Размер: $([math]::Round($size, 2)) MB"
        }
    }

    # Установка на устройство
    if ($Install) {
        if ($Release) {
            Write-Warning "⚠ Установка release AAB не поддерживается. Используйте debug APK."
        } else {
            $apkPath = Join-Path $ProjectDir "app\build\outputs\apk\debug\app-debug.apk"
            if (Test-Path $apkPath) {
                Write-Host "`n📲 Установка на устройство..." -ForegroundColor Yellow
                adb install -r $apkPath
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "✓ Приложение установлено" -ForegroundColor Green
                }
            }
        }
    }

} catch {
    Write-Error "Ошибка сборки: $_"
    exit 1
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Сборка завершена                                     ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host ""
Write-Host "📋 Что дальше:"
Write-Host "  1. Проверьте Digital Asset Links: https://tg-k.ru/.well-known/assetlinks.json" -ForegroundColor White
Write-Host "  2. Установите APK на Android-устройство (через ADB или файл)" -ForegroundColor White
Write-Host "  3. Протестируйте: приложение должно открываться без адресной строки" -ForegroundColor White
Write-Host "  4. Для публикации в Google Play создайте AAB (.\\build-twa.ps1 -Release)" -ForegroundColor White