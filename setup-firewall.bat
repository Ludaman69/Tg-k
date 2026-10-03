@echo off
:: ==============================================
::  Run this file as Administrator!
::  Right-click -> Run as administrator
:: ==============================================
echo.
echo ==============================================
echo   Vortex Messenger - Windows Firewall Setup
echo ==============================================
echo.

:: Check admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Administrator rights required!
    echo   Right-click this file - Run as administrator
    pause
    exit /b 1
)

echo Adding firewall rules...
echo.

netsh advfirewall firewall add rule name="Vortex HTTP (80)" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="Vortex HTTPS (443)" dir=in action=allow protocol=TCP localport=443
netsh advfirewall firewall add rule name="Vortex TURN TCP (3478)" dir=in action=allow protocol=TCP localport=3478
netsh advfirewall firewall add rule name="Vortex TURN UDP (3478)" dir=in action=allow protocol=UDP localport=3478
netsh advfirewall firewall add rule name="Vortex TURN Relay UDP" dir=in action=allow protocol=UDP localport=49152-65535

echo.
echo [OK] Firewall rules added:
echo   - TCP 80   (HTTP)
echo   - TCP 443  (HTTPS)
echo   - TCP 3478 (TURN)
echo   - UDP 3478 (TURN)
echo   - UDP 49152-65535 (TURN relay)
echo.
pause
