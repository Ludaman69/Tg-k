@echo off
cd /d "%~dp0"

echo.
echo ==============================================
echo   VORTEX MESSENGER - Build and Start
echo   Domain: tg-k.ru
echo ==============================================
echo.

:: --- 1. Install dependencies ---
echo [1/7] Installing dependencies...
call npm install --legacy-peer-deps
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

:: --- 2. Prisma generate + push ---
echo [2/7] Setting up database (Prisma)...
cd apps\server
call npx prisma generate
call npx prisma db push
if %errorlevel% neq 0 (
    echo [ERROR] Database migration failed!
    pause
    exit /b 1
)
cd ..\..
echo [OK] Database ready
echo.

:: --- 3. Build backend ---
echo [3/7] Building backend (TypeScript)...
call npm run build -w apps/server
if %errorlevel% neq 0 (
    echo [ERROR] Backend build failed!
    pause
    exit /b 1
)
echo [OK] Backend built (apps/server/dist/)
echo.

:: --- 4. Build frontend ---
echo [4/7] Building frontend (Vite)...
call npm run build -w apps/web
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)
echo [OK] Frontend built (apps/web/dist/)
echo.

:: --- 5. Start coturn (Docker) ---
echo [5/7] Starting TURN server (Docker)...
cd coturn
docker compose up -d 2>nul
if %errorlevel% neq 0 (
    echo [WARN] Docker/coturn failed to start. Calls may not work through NAT.
) else (
    echo [OK] TURN server started
)
cd ..
echo.

:: --- 6. Start Nginx ---
echo [6/7] Starting Nginx...
C:\nginx\nginx.exe -t -p C:\nginx 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Nginx config error! Run: C:\nginx\nginx.exe -t -p C:\nginx
    pause
    exit /b 1
)
taskkill /f /im nginx.exe >nul 2>nul
start "" /B C:\nginx\nginx.exe -p C:\nginx
echo [OK] Nginx started (ports 80, 443)
echo.

:: --- 7. Start Node.js via PM2 ---
echo [7/7] Starting Vortex Server (PM2)...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo     Installing PM2...
    call npm install -g pm2
)
call pm2 delete vortex-server 2>nul
call pm2 start dist\index.js --name vortex-server --cwd "%cd%\apps\server"
call pm2 save

echo.
echo ==============================================
echo   VORTEX MESSENGER IS RUNNING!
echo.
echo   Site:    https://tg-k.ru
echo   Server:  localhost:3001
echo   DB:      PostgreSQL localhost:5432
echo   TURN:    tg-k.ru:3478
echo.
echo   Commands:
echo     pm2 logs vortex-server     - logs
echo     pm2 restart vortex-server  - restart
echo     pm2 monit                  - monitoring
echo ==============================================
echo.
pause
