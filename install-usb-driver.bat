@echo off
"C:\tools\android\cmdline-tools\latest\bin\android.exe" sdk install "extras;google;usb_driver" > C:\telega\usb-driver.log 2>&1
echo USBDRIVER_EXIT=%ERRORLEVEL% >> C:\telega\usb-driver.log