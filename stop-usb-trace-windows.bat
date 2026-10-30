@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\usb-etw.ps1" -Action Stop
pause
