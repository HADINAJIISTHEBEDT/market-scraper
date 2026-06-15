@echo off
setlocal EnableExtensions

rem Keep window open (double-click friendly)
if /i not "%~1"=="RUN" (
  start "Firebase Deploy" cmd /k "%~f0" RUN
  exit /b 0
)

title Firebase Hosting Deploy
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo.
echo  Firebase Hosting - official deploy
echo  https://firebase.google.com/docs/hosting
echo.
echo  Project: st-business-86a9b
echo  Site:    https://st-business-86a9b.web.app
echo  Folder:  %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found.
  echo Install from https://nodejs.org then restart PC.
  goto :done
)

node -v
echo.

set "FB=node_modules\.bin\firebase.cmd"
if not exist "%FB%" (
  echo Installing Firebase CLI ^(firebase-tools^)...
  call npm install firebase-tools@14 --no-fund --no-audit
  if errorlevel 1 goto :done
)

echo ----------------------------------------
echo  STEP 1 of 2: firebase login
echo ----------------------------------------
echo  A browser tab will open.
echo  Sign in with the Google account that owns
echo  Firebase project: st-business-86a9b
echo.
call "%FB%" login
if errorlevel 1 (
  echo.
  echo Normal login failed. Trying code login...
  echo Copy the code from the browser into this window.
  echo.
  call "%FB%" login --no-localhost
  if errorlevel 1 (
    echo.
    echo LOGIN FAILED. Run this manually in this window:
    echo   node_modules\.bin\firebase login
    goto :done
  )
)

echo.
echo Login OK.
echo.
echo ----------------------------------------
echo  STEP 2 of 2: firebase deploy --only hosting
echo ----------------------------------------
echo  Uploading your HTML/JS files to Firebase CDN...
echo  This may take 1-3 minutes.
echo.
call "%FB%" deploy --only hosting --project st-business-86a9b
if errorlevel 1 (
  echo.
  echo DEPLOY FAILED. Read the error above.
  goto :done
)

echo.
echo ========================================
echo  SUCCESS - Hosting is live
echo ========================================
echo.
echo  https://st-business-86a9b.web.app/login.html
echo  https://st-business-86a9b.web.app/auth-bridge.html
echo.
echo  File login from login.html should work after this.
echo.

:done
echo Press any key to close...
pause >nul
