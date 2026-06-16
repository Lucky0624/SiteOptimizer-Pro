@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
if not exist "%ROOT%backend\app\main.py" set "ROOT=%~dp0..\.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

set "BACKEND=%ROOT%\backend"
set "PYTHON=%ROOT%\.venv\Scripts\python.exe"
if not exist "%PYTHON%" set "PYTHON=python"

if not exist "%ROOT%\frontend\dist\index.html" (
  echo Frontend build was not found: "%ROOT%\frontend\dist\index.html"
  echo Please use the packaged release zip or run npm run build in frontend first.
  pause
  exit /b 1
)

if not exist "%BACKEND%\.env" (
  echo Creating backend\.env for local testing.
  set /p ADMIN_KEY=Set local access password:
  if "!ADMIN_KEY!"=="" set "ADMIN_KEY=siteoptimizer-test"
  > "%BACKEND%\.env" echo ADMIN_KEY=!ADMIN_KEY!
  >> "%BACKEND%\.env" echo DEBUG=false
  >> "%BACKEND%\.env" echo GOOGLE_CLIENT_EMAIL=
  >> "%BACKEND%\.env" echo GOOGLE_PRIVATE_KEY=
  >> "%BACKEND%\.env" echo GOOGLE_SITE_URL=
  >> "%BACKEND%\.env" echo CREDENTIAL_ENCRYPTION_KEY=
  >> "%BACKEND%\.env" echo DATABASE_URL=sqlite+aiosqlite:///./siteoptimizer.db
  >> "%BACKEND%\.env" echo GSC_DAILY_LIMIT=100000
  >> "%BACKEND%\.env" echo INSPECTION_DAILY_LIMIT=2000
  >> "%BACKEND%\.env" echo INDEXING_DAILY_LIMIT=200
  >> "%BACKEND%\.env" echo ALLOWED_ORIGINS=*
)

echo.
echo Starting SiteOptimizer Pro...
echo Open: http://127.0.0.1:8000
echo Press Ctrl+C in this window to stop the app.
echo.

pushd "%BACKEND%"
start "" http://127.0.0.1:8000
"%PYTHON%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
set "EXIT_CODE=%ERRORLEVEL%"
popd

echo.
echo SiteOptimizer Pro stopped.
pause
exit /b %EXIT_CODE%
