@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VERAPEP v12.2 - Start
color 0B

echo.
echo ========================================================
echo            VERAPEP v12.2 - STARTAR SIDAN
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto NODE_MISSING

for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto NODE_MISSING
if %NODE_MAJOR% LSS 22 goto NODE_OLD

set "PORT=3000"
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Port 3000 anvands redan, troligen av en aldre VERAPEP-version.
  echo Den har versionen startas pa port 3122 i stallet.
  set "PORT=3122"
)

echo Node.js hittad: 
node --version
echo.
echo Startar VERAPEP pa http://localhost:%PORT%
echo Ett separat serverfonster kommer att oppnas.
echo STANG INTE serverfonstret medan du anvander sidan.
echo.

start "VERAPEP SERVER - LAT DETTA FONSTER VARA OPPET" cmd /k "cd /d ""%~dp0"" && set PORT=%PORT% && node --env-file-if-exists=.env server.mjs"

timeout /t 3 /nobreak >nul
start "" "http://localhost:%PORT%"

echo ========================================================
echo Sidan ska nu oppnas i din webblasare.
echo.
echo Webbshop: http://localhost:%PORT%
echo Admin:    http://localhost:%PORT%/admin.html
echo ========================================================
echo.
echo Om sidan inte syns, kopiera adressen ovan till Chrome eller Edge.
echo.
pause
exit /b 0

:NODE_MISSING
echo Node.js hittades inte pa datorn.
echo.
echo VERAPEP behover Node.js 22 eller senare.
echo.
echo Tryck I for att installera Node.js LTS automatiskt med winget.
echo Tryck A for att avbryta.
choice /C IA /N /M "Val [I/A]: "
if errorlevel 2 goto END
where winget >nul 2>nul
if errorlevel 1 (
  echo.
  echo winget finns inte pa datorn.
  echo Installera Node.js LTS fran nodejs.org och kor denna fil igen.
  goto END
)
echo.
echo Installerar Node.js LTS...
winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo.
  echo Installationen misslyckades. Installera Node.js manuellt fran nodejs.org.
  goto END
)
echo.
echo Node.js ar installerat.
echo STANG detta fonster och dubbelklicka pa STARTA-SIDAN.cmd igen.
goto END

:NODE_OLD
echo Din Node.js-version ar for gammal:
node --version
echo VERAPEP behover Node.js 22 eller senare.
echo.
echo Kor detta i PowerShell eller CMD:
echo   winget upgrade OpenJS.NodeJS.LTS
goto END

:END
echo.
pause
exit /b 1
