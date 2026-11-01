@echo off
rem Start SKYNET (Windows). Same as the Start Menu shortcut.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0skynet.ps1" %*
