# ============================================================================
#  Генерация иконок и splash-screen для Android из apps/web/public/logo.png
# ============================================================================
#
#  Создаёт все требуемые размеры mipmap/drawable ресурсов без внешних
#  зависимостей (используется System.Drawing из .NET).
#
#  Использование:
#    .\generate-android-assets.ps1
#
#  Запускать после изменения логотипа; результат попадает в
#  apps/web/android/app/src/main/res/

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Logo = Join-Path $Root "apps\web\public\logo.png"
$ResDir = Join-Path $Root "apps\web\android\app\src\main\res"

# Цвет фона иконки и splash (совпадает с theme_color приложения)
$BgColor = [System.Drawing.Color]::FromArgb(255, 33, 35, 50)   # #212332

if (-not (Test-Path $Logo)) {
    Write-Error "Не найден логотип: $Logo"
}
if (-not (Test-Path $ResDir)) {
    Write-Error "Не найдена папка ресурсов: $ResDir. Сначала выполните: npx cap add android"
}

Write-Host "Логотип: $Logo" -ForegroundColor Cyan

# ── Вспомогательная функция отрисовки ───────────────────────────────────
function Save-Resized {
    param(
        [string]$OutPath,
        [int]$Size,
        # Доля площади, которую занимает логотип (1.0 = на всю иконку)
        [double]$Scale = 1.0,
        [switch]$Transparent
    )

    $src = [System.Drawing.Image]::FromFile($Logo)
    try {
        $bmp = New-Object System.Drawing.Bitmap $Size, $Size
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.InterpolationMode = 'HighQualityBicubic'
            $g.SmoothingMode = 'AntiAlias'

            if ($Transparent) {
                $g.Clear([System.Drawing.Color]::Transparent)
            } else {
                $g.Clear($BgColor)
            }

            $logoSize = [int]($Size * $Scale)
            $offset = [int](($Size - $logoSize) / 2)
            $g.DrawImage($src, $offset, $offset, $logoSize, $logoSize)

            $dir = Split-Path -Parent $OutPath
            if (-not (Test-Path $dir)) {
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
            }

            $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $g.Dispose()
            $bmp.Dispose()
        }
    } finally {
        $src.Dispose()
    }
}

# ── Иконки приложения (mipmap) ──────────────────────────────────────────
# Размеры по плотностям экрана согласно рекомендациям Android
$iconSizes = [ordered]@{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

Write-Host ""
Write-Host "Генерация иконок..." -ForegroundColor Cyan

foreach ($entry in $iconSizes.GetEnumerator()) {
    $dir = Join-Path $ResDir $entry.Key
    $size = $entry.Value

    # Обычная и круглая иконки — логотип на всю площадь
    Save-Resized -OutPath (Join-Path $dir "ic_launcher.png") -Size $size -Scale 1.0
    Save-Resized -OutPath (Join-Path $dir "ic_launcher_round.png") -Size $size -Scale 1.0

    # Foreground для адаптивной иконки: логотип занимает ~66% —
    # система может обрезать края под разные формы
    $fgPath = Join-Path $dir "ic_launcher_foreground.png"
    Save-Resized -OutPath $fgPath -Size ([int]($size * 2)) -Scale 0.66 -Transparent

    Write-Host ("  " + $entry.Key + ": " + $size + "x" + $size) -ForegroundColor Green
}

# ── Иконка в статус-баре для push-уведомлений ───────────────────────────
# Должна быть монохромной с прозрачным фоном (Android её перекрашивает)
Write-Host ""
Write-Host "Генерация иконки уведомлений..." -ForegroundColor Cyan

foreach ($entry in $iconSizes.GetEnumerator()) {
    $dirName = $entry.Key -replace 'mipmap', 'drawable'
    $dir = Join-Path $ResDir $dirName
    $size = [int]($entry.Value * 0.5)
    $statPath = Join-Path $dir "ic_stat_icon.png"
    Save-Resized -OutPath $statPath -Size $size -Scale 1.0 -Transparent
    Write-Host ("  " + $dirName + ": " + $size + "x" + $size) -ForegroundColor Green
}

# ── Splash screen ───────────────────────────────────────────────────────
# Capacitor использует drawable/splash.png и drawable-{port,land}-*
Write-Host ""
Write-Host "Генерация splash-screen..." -ForegroundColor Cyan

$splashSizes = [ordered]@{
    "drawable"              = 480
    "drawable-port-mdpi"    = 480
    "drawable-port-hdpi"    = 800
    "drawable-port-xhdpi"   = 1280
    "drawable-port-xxhdpi"  = 1600
    "drawable-port-xxxhdpi" = 1920
    "drawable-land-mdpi"    = 480
    "drawable-land-hdpi"    = 800
    "drawable-land-xhdpi"   = 1280
    "drawable-land-xxhdpi"  = 1600
    "drawable-land-xxxhdpi" = 1920
}

foreach ($entry in $splashSizes.GetEnumerator()) {
    $dir = Join-Path $ResDir $entry.Key
    $splashPath = Join-Path $dir "splash.png"
    # Логотип по центру занимает ~30% — остальное фоновый цвет
    Save-Resized -OutPath $splashPath -Size $entry.Value -Scale 0.3
    Write-Host ("  " + $entry.Key + ": " + $entry.Value + "x" + $entry.Value) -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Готово ===" -ForegroundColor Green
Write-Host "  Ресурсы обновлены в $ResDir"
Write-Host "  Для применения пересоберите APK: .\publish-apk.ps1"
