@echo off
REM Simple print wrapper for Windows
REM Usage: print.bat <IP> <PORT> <CONTENT>

if "%~3"=="" (
    echo Usage: print.bat ^<IP^> ^<PORT^> ^<CONTENT^>
    echo Example: print.bat 192.168.192.10 9100 "Test Print"
    exit /b 1
)

echo 🖨️ Printing to %1:%2
echo 📄 Content: %3

powershell -ExecutionPolicy Bypass -File "%~dp0simple-print.ps1" -PrinterIP "%1" -PrinterPort "%2" -Content "%3"

if %ERRORLEVEL% EQU 0 (
    echo ✅ Print completed successfully!
) else (
    echo ❌ Print failed with error code %ERRORLEVEL%
)

pause