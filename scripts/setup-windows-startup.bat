@echo off
echo Setting up Nqlix Desktop App to start on Windows boot...

REM Get the current directory
set "APP_PATH=%~dp0"
set "APP_EXE=%APP_PATH%src-tauri\target\release\nqlix_desktop_app.exe"

REM Check if the app exists
if not exist "%APP_EXE%" (
    echo Error: App executable not found at %APP_EXE%
    echo Please build the app first using: cargo tauri build --release
    pause
    exit /b 1
)

REM Create a shortcut in the startup folder
echo Creating startup shortcut...

REM Get the startup folder path
for /f "tokens=2*" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Startup 2^>nul') do set "STARTUP_FOLDER=%%b"

if "%STARTUP_FOLDER%"=="" (
    echo Error: Could not find startup folder
    pause
    exit /b 1
)

REM Create VBS script to create shortcut
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\CreateShortcut.vbs"
echo sLinkFile = "%STARTUP_FOLDER%\Nqlix.lnk" >> "%TEMP%\CreateShortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\CreateShortcut.vbs"
echo oLink.TargetPath = "%APP_EXE%" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.WorkingDirectory = "%APP_PATH%src-tauri\target\release" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Description = "Nqlix Desktop Application" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Save >> "%TEMP%\CreateShortcut.vbs"

REM Run the VBS script
cscript //nologo "%TEMP%\CreateShortcut.vbs"

REM Clean up
del "%TEMP%\CreateShortcut.vbs"

echo.
echo Success! Nqlix Desktop App will now start automatically when Windows boots.
echo.
echo To remove this startup entry:
echo 1. Press Win+R and type: shell:startup
echo 2. Delete the "Nqlix.lnk" shortcut
echo.
pause 