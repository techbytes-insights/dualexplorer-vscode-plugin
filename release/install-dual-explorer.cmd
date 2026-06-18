@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "VSIX=%SCRIPT_DIR%dual-explorer-1.3.1.vsix"

if not exist "%VSIX%" (
  echo VSIX not found: %VSIX%
  exit /b 1
)

where code >nul 2>&1
if errorlevel 1 (
  echo VS Code CLI ^(code^) not found in PATH.
  echo Open VS Code, press Ctrl+Shift+P, run: Shell Command: Install 'code' command in PATH.
  echo Then run this installer again.
  exit /b 1
)

echo Installing Dual Explorer from:
echo %VSIX%
code --install-extension "%VSIX%" --force
if errorlevel 1 (
  echo Installation failed.
  exit /b 1
)

echo Installation complete.
exit /b 0
