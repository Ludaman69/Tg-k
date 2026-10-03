@echo off
set JAVA_HOME=C:\tools\java\jdk-21.0.12.1+1
set ANDROID_HOME=C:\tools\android
cd /d C:\telega\apps\web\android
gradlew.bat assembleDebug > C:\telega\gradle-debug.log 2>&1
echo GRADLE_EXIT=%ERRORLEVEL% >> C:\telega\gradle-debug.log