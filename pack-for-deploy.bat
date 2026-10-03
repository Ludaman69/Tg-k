@echo off
chcp 65001 >nul
echo.
echo ╔═══════════════════════════════════════════════════╗
echo ║  🌀 Vortex Messenger — Упаковка для деплоя       ║
echo ╚═══════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo 📦 Создание архива для загрузки на VPS...

:: Создаём временную папку
if exist "vortex-deploy" rmdir /s /q "vortex-deploy"
mkdir "vortex-deploy"

:: Копируем нужные файлы (без node_modules, .git, и т.д.)
echo    Копирование package.json...
copy package.json vortex-deploy\ >nul

echo    Копирование deploy.sh...
copy deploy.sh vortex-deploy\ >nul

echo    Копирование apps\server...
xcopy apps\server vortex-deploy\apps\server\ /E /I /Q /EXCLUDE:exclude-list.tmp >nul 2>nul
:: Удаляем то что не нужно
if exist "vortex-deploy\apps\server\node_modules" rmdir /s /q "vortex-deploy\apps\server\node_modules"
if exist "vortex-deploy\apps\server\dist" rmdir /s /q "vortex-deploy\apps\server\dist"

echo    Копирование apps\web...
xcopy apps\web vortex-deploy\apps\web\ /E /I /Q >nul 2>nul
:: Удаляем то что не нужно
if exist "vortex-deploy\apps\web\node_modules" rmdir /s /q "vortex-deploy\apps\web\node_modules"
if exist "vortex-deploy\apps\web\dist" rmdir /s /q "vortex-deploy\apps\web\dist"

echo    Копирование sounds...
if exist sounds xcopy sounds vortex-deploy\sounds\ /E /I /Q >nul 2>nul

:: Удаляем загруженные файлы (только тестовые)
if exist "vortex-deploy\apps\server\uploads" (
    rmdir /s /q "vortex-deploy\apps\server\uploads"
    mkdir "vortex-deploy\apps\server\uploads\avatars"
)

:: Удаляем .env (секреты генерируются на сервере)
if exist "vortex-deploy\apps\server\.env" del "vortex-deploy\apps\server\.env"

echo.
echo 📦 Сжатие в архив...

:: Проверяем наличие tar (есть в Windows 10+)
where tar >nul 2>nul
if %ERRORLEVEL% equ 0 (
    tar -czf vortex-deploy.tar.gz -C vortex-deploy .
    echo.
    echo ✅ Архив создан: vortex-deploy.tar.gz
) else (
    echo ⚠  tar не найден. Установите 7-Zip или заархивируйте папку vortex-deploy вручную.
    echo    Папка готова: vortex-deploy\
)

:: Очистка
rmdir /s /q "vortex-deploy" 2>nul

echo.
echo ═══════════════════════════════════════════════════════
echo  Следующий шаг — загрузите архив на VPS:
echo.
echo  scp vortex-deploy.tar.gz root@ВАШ_IP:/root/
echo.
echo  Затем на сервере:
echo    cd /root
echo    mkdir -p /var/www/vortex
echo    tar -xzf vortex-deploy.tar.gz -C /var/www/vortex
echo    chmod +x /var/www/vortex/deploy.sh
echo    sudo /var/www/vortex/deploy.sh
echo ═══════════════════════════════════════════════════════
echo.
pause
