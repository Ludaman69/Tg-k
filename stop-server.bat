@echo off
cd /d "%~dp0"
echo.
echo ==============================================
echo   VORTEX MESSENGER - Stop all services
echo ==============================================
echo.

echo Stopping PM2 (Node.js server)...
call pm2 stop vortex-server 2>nul
echo [OK] Node.js server stopped

echo Stopping Nginx...
taskkill /f /im nginx.exe >nul 2>nul
echo [OK] Nginx stopped

echo Stopping coturn (Docker)...
cd /d "%~dp0coturn"
docker compose down 2>nul
echo [OK] coturn stopped

echo.
echo [OK] All services stopped
echo.
pause
