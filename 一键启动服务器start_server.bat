@echo off
setlocal
cd /d "%~dp0"
where pwsh.exe >nul 2>nul
if errorlevel 1 (
    echo [ERROR] PowerShell 7 ^(pwsh.exe^) is required. No services were started.
    if not defined VCP_NO_PAUSE pause
    exit /b 1
)
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-vcp.ps1" %*
set "VCP_EXIT_CODE=%ERRORLEVEL%"
if not defined VCP_NO_PAUSE pause
exit /b %VCP_EXIT_CODE%
