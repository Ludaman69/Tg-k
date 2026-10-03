@echo off
setlocal enabledelayedexpansion

set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Users\LUDAMAN\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;%PATH%

set GRADLE_DIR=%USERPROFILE%\.gradle\wrapper\dists\gradle-8.14.3-all\10utluxaxniiv4wxiphsi49nj\gradle-8.14.3

cd /d c:\telega\android

echo Building TWA Debug APK for Bkonekte...

"%GRADLE_DIR%\bin\gradle.bat" assembleDebug --no-daemon

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===== BUILD SUCCESSFUL =====
    echo APK: app\build\outputs\apk\debug\app-debug.apk
) else (
    echo.
    echo ===== BUILD FAILED =====
    exit /b 1
)