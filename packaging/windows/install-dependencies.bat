@echo off
setlocal

set "ROOT=%~dp0"
if not exist "%ROOT%backend\app\main.py" set "ROOT=%~dp0..\.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

echo [SiteOptimizer Pro] Installing backend dependencies...
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Please install Python 3.11+ and run this script again.
  pause
  exit /b 1
)

python -m venv "%ROOT%\.venv"
if errorlevel 1 (
  echo Failed to create the local virtual environment.
  pause
  exit /b 1
)

"%ROOT%\.venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (
  echo Failed to upgrade pip.
  pause
  exit /b 1
)

"%ROOT%\.venv\Scripts\python.exe" -m pip install -r "%ROOT%\backend\requirements.txt"
if errorlevel 1 (
  echo Failed to install backend dependencies.
  pause
  exit /b 1
)

echo.
echo Dependencies installed successfully.
echo Next: run start-siteoptimizer.bat
pause
