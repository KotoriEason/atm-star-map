@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0runtime\node.exe" (
  echo Runtime missing. Please extract the complete ZIP before starting.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0server\server.mjs" %*
if errorlevel 1 (
  echo.
  echo Could not start ATM Star Map. See the message above.
  pause
  exit /b 1
)
