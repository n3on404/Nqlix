@echo off
REM Setup script for printer environment variables on Windows
REM Run this script as Administrator to set system-wide environment variables

echo Setting up printer environment variables for Windows...
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running as Administrator - setting system-wide environment variables
) else (
    echo WARNING: Not running as Administrator
    echo Environment variables will be set for current user only
    echo For system-wide variables, run this script as Administrator
    echo.
)

REM Set printer environment variables
echo Setting PRINTER_IP...
setx PRINTER_IP "192.168.192.10" /M
if %errorLevel% == 0 (
    echo ✓ PRINTER_IP set to 192.168.192.10
) else (
    echo ✗ Failed to set PRINTER_IP
)

echo Setting PRINTER_PORT...
setx PRINTER_PORT "9100" /M
if %errorLevel% == 0 (
    echo ✓ PRINTER_PORT set to 9100
) else (
    echo ✗ Failed to set PRINTER_PORT
)

echo Setting PRINTER_NAME...
setx PRINTER_NAME "Imprimante Thermique" /M
if %errorLevel% == 0 (
    echo ✓ PRINTER_NAME set to "Imprimante Thermique"
) else (
    echo ✗ Failed to set PRINTER_NAME
)

echo Setting PRINTER_WIDTH...
setx PRINTER_WIDTH "48" /M
if %errorLevel% == 0 (
    echo ✓ PRINTER_WIDTH set to 48
) else (
    echo ✗ Failed to set PRINTER_WIDTH
)

echo Setting PRINTER_TIMEOUT...
setx PRINTER_TIMEOUT "5000" /M
if %errorLevel% == 0 (
    echo ✓ PRINTER_TIMEOUT set to 5000
) else (
    echo ✗ Failed to set PRINTER_TIMEOUT
)

echo Setting PRINTER_MODEL...
setx PRINTER_MODEL "TM-T20X" /M
if %errorLevel% == 0 (
    echo ✓ PRINTER_MODEL set to TM-T20X
) else (
    echo ✗ Failed to set PRINTER_MODEL
)

echo.
echo ========================================
echo Environment variables setup complete!
echo ========================================
echo.
echo Current printer configuration:
echo - IP: 192.168.192.10
echo - Port: 9100
echo - Name: Imprimante Thermique
echo - Width: 48 characters
echo - Timeout: 5000ms
echo - Model: TM-T20X
echo.
echo IMPORTANT: You need to restart the application for changes to take effect.
echo You may also need to restart your command prompt or PowerShell.
echo.
echo To modify these values later, you can:
echo 1. Run this script again with different values
echo 2. Use System Properties > Environment Variables
echo 3. Use PowerShell: [Environment]::SetEnvironmentVariable("PRINTER_IP", "new_value", "Machine")
echo.
pause