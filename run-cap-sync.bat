@echo off
set JAVA_HOME=C:\tools\java\jdk-21.0.12.1+1
cd /d C:\telega\apps\web
npx cap sync android > C:\telega\cap-sync.log 2>&1
echo SYNC_EXIT=%ERRORLEVEL% >> C:\telega\cap-sync.log