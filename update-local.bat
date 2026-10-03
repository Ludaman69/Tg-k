@echo off
chcp 65001 >nul
echo.
echo ══════════════════════════════════════════════
echo   VORTEX — Подготовка обновления (Windows)
echo ══════════════════════════════════════════════
echo.

set SERVER_IP=109.196.102.13

:: 1. Очистка старого архива
echo [1/4] Очистка...
if exist vortex-deploy rd /s /q vortex-deploy
if exist vortex-deploy.tar.gz del vortex-deploy.tar.gz

:: 2. Копирование файлов
echo [2/4] Копирование файлов проекта...
mkdir vortex-deploy
copy package.json vortex-deploy\ >nul
copy deploy.sh vortex-deploy\ >nul
xcopy apps vortex-deploy\apps /E /I /Q >nul

:: 3. Удаление лишнего
echo [3/4] Очистка от node_modules, dist, .env...
if exist vortex-deploy\apps\server\node_modules rd /s /q vortex-deploy\apps\server\node_modules
if exist vortex-deploy\apps\server\dist rd /s /q vortex-deploy\apps\server\dist
if exist vortex-deploy\apps\server\.env del vortex-deploy\apps\server\.env
if exist vortex-deploy\apps\web\node_modules rd /s /q vortex-deploy\apps\web\node_modules
if exist vortex-deploy\apps\web\dist rd /s /q vortex-deploy\apps\web\dist
if exist vortex-deploy\apps\server\uploads\avatars rd /s /q vortex-deploy\apps\server\uploads\avatars
mkdir vortex-deploy\apps\server\uploads\avatars >nul 2>&1

:: 4. Создание архива
echo [4/4] Создание архива...
tar -czf vortex-deploy.tar.gz -C vortex-deploy .

:: Проверка
if not exist vortex-deploy.tar.gz (
    echo.
    echo ✗ ОШИБКА: Архив не создан!
    pause
    exit /b 1
)

for %%A in (vortex-deploy.tar.gz) do set SIZE=%%~zA
set /a SIZE_KB=%SIZE%/1024
echo.
echo ✓ Архив создан: vortex-deploy.tar.gz (%SIZE_KB% KB)
echo.

:: 5. Загрузка на сервер
echo Загрузка на сервер %SERVER_IP%...
echo (Введите пароль root когда попросит)
echo.
scp vortex-deploy.tar.gz root@%SERVER_IP%:/root/

if %errorlevel% equ 0 (
    echo.
    echo ══════════════════════════════════════════════
    echo   ✓ ГОТОВО! Архив загружен на сервер.
    echo.
    echo   Теперь зайдите на сервер:
    echo     ssh root@%SERVER_IP%
    echo.
    echo   И запустите:
    echo     /var/www/vortex/update.sh
    echo ══════════════════════════════════════════════
) else (
    echo.
    echo ✗ Ошибка загрузки. Проверьте пароль и попробуйте снова.
)

echo.
pause
