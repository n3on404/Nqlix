@echo off
echo ===============================================
echo    Nqlix Thermal Printer Fix Tool
echo ===============================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js found: 
node --version

echo.
echo Choose an option:
echo 1. Diagnose printer connection
echo 2. Auto-fix printer connection
echo 3. Test all printer functions
echo 4. Run all diagnostics
echo 5. Exit
echo.

set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" (
    echo.
    echo Running printer diagnostic...
    node scripts/diagnose-printer.js
) else if "%choice%"=="2" (
    echo.
    echo Auto-fixing printer connection...
    node scripts/fix-printer-connection.js
) else if "%choice%"=="3" (
    echo.
    echo Testing all printer functions...
    node scripts/test-printer-windows.js
) else if "%choice%"=="4" (
    echo.
    echo Running all diagnostics...
    echo.
    echo 1. Diagnosing printer connection...
    node scripts/diagnose-printer.js
    echo.
    echo 2. Auto-fixing connection...
    node scripts/fix-printer-connection.js
    echo.
    echo 3. Testing printer functions...
    node scripts/test-printer-windows.js
) else if "%choice%"=="5" (
    echo.
    echo Exiting...
    exit /b 0
) else (
    echo.
    echo Invalid choice. Please run the script again.
    pause
    exit /b 1
)

echo.
echo ===============================================
echo    Diagnostic completed!
echo ===============================================
echo.
echo If you're still having issues:
echo 1. Check the troubleshooting guide: PRINTER_TROUBLESHOOTING.md
echo 2. Verify your printer is powered on and connected
echo 3. Check your network connection
echo 4. Try a different IP address for your printer
echo.
pause