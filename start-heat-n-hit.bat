@echo off
setlocal

cd /d "%~dp0"
set "PORT=3000"
set "SCREEN_URL=http://localhost:%PORT%/"
set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME_EXE_X86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"


echo Demarrage du serveur Heat-n-Hit sur le port %PORT%...
start "Heat-n-Hit Server" /D "%~dp0mobile-controller" cmd /k npm start

echo Ouverture de l'ecran principal...
timeout /t 2 /nobreak >nul

if exist "%CHROME_EXE%" (
    start "" "%CHROME_EXE%" --kiosk "%SCREEN_URL%"
) else if exist "%CHROME_EXE_X86%" (
    start "" "%CHROME_EXE_X86%" --kiosk "%SCREEN_URL%"
) else (
    start "" "%SCREEN_URL%"
)

endlocal
