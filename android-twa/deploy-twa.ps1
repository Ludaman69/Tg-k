# ============================================================================
# Скрипт деплоя TWA-конфигурации на сервер
# ============================================================================
#
# Копирует необходимые файлы на сервер для работы TWA:
#   - .well-known/assetlinks.json  (Digital Asset Links)
#
# Использование:
#   .\deploy-twa.ps1 -Domain "yourdomain.com" -SshUser "user" -SshHost "host"
#
#   Или просто сгенерировать assetlinks и показать инструкцию

param(
    [string]$Domain = "tg-k.ru",
    [string]$SshUser = "",
    [string]$SshHost = "",
    [string]$SshPath = "/var/www/html"
)

$ErrorActionPreference = "Continue"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Деплой TWA-конфигурации                              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Проверяем наличие assetlinks.json
$assetLinksPath = Join-Path $ProjectDir ".well-known\assetlinks.json"
if (Test-Path $assetLinksPath) {
    Write-Host "✓ assetlinks.json найден" -ForegroundColor Green
    
    # Показываем содержимое
    Write-Host "`nСодержимое assetlinks.json:" -ForegroundColor Yellow
    Get-Content $assetLinksPath
    Write-Host ""
    
    # Если есть SSH доступ — копируем на сервер
    if ($SshUser -and $SshHost) {
        Write-Host "`n📤 Копируем на сервер $SshUser@$SshHost..." -ForegroundColor Yellow
        
        # Создаём директорию .well-known на сервере
        ssh "$SshUser@$SshHost" "mkdir -p $SshPath/.well-known"
        
        # Копируем assetlinks.json
        scp "$assetLinksPath" "$SshUser@$SshHost`:$SshPath/.well-known/assetlinks.json"
        
        Write-Host "✓ assetlinks.json скопирован на сервер" -ForegroundColor Green
        Write-Host "   Путь: $SshPath/.well-known/assetlinks.json" -ForegroundColor White
    } else {
        Write-Host "⚠ SSH-параметры не указаны. Скопируйте файл вручную:" -ForegroundColor Yellow
        Write-Host "  scp $assetLinksPath user@your-server:/var/www/html/.well-known/assetlinks.json"
    }
} else {
    Write-Warning "assetlinks.json не найден. Сначала запустите generate-assetlinks.ps1"
}

# Проверка доступности файла через HTTPS
if ($Domain -ne "tg-k.ru") {
    Write-Host "`n🔍 Проверяем доступность assetlinks.json через HTTPS..." -ForegroundColor Yellow
    $url = "https://$Domain/.well-known/assetlinks.json"
    
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ $url — доступен (HTTP $($response.StatusCode))" -ForegroundColor Green
        } else {
            Write-Warning "⚠ $url — статус: $($response.StatusCode)"
        }
    } catch {
        Write-Warning "⚠ Не удалось проверить $url : $_"
        Write-Host "   Проверьте вручную в браузере."
    }
}

Write-Host ""
Write-Host "📋 Инструкция по верификации:"
Write-Host "  1. Откройте на телефоне Chrome и перейдите на https://$Domain"
Write-Host "  2. Chrome автоматически проверит Digital Asset Links"
Write-Host "  3. Проверить статус можно через:" -ForegroundColor White
Write-Host "     https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://$Domain&relation=delegate_permission/common.handle_all_urls" -ForegroundColor Gray