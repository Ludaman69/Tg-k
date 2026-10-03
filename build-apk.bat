@echo off
set JAVA_HOME=C:\tools\java\jdk-21.0.12.1+1
set ANDROID_HOME=C:\tools\android
set PATH=C:\tools\java\jdk-21.0.12.1+1\bin;%PATH%
cd /d c:\telega
powershell -ExecutionPolicy Bypass -File c:\telega\publish-apk.ps1 > c:\telega\publish-log.txt 2>&1