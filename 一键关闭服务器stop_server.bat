@echo off
setlocal
cd /d "%~dp0"
title VCP 一键关闭服务器

set "PM2_CLI=node_modules\pm2\lib\binaries\CLI.js"
set "PM2_HOME_DIR=%~dp0.vcp-runtime\pm2"
set "RUNTIME_FILE=%~dp0.vcp-runtime\runtime.json"

if not exist "%PM2_CLI%" (
    echo [错误] 未找到项目 PM2：%PM2_CLI%
    echo [说明] 请在项目根目录运行本脚本。
    if not defined VCP_NO_PAUSE pause
    exit /b 1
)

echo ========================================
echo  VCP 一键关闭服务器
echo ========================================
echo.

REM 确定 Node 解释器：优先用启动时记录的 runtime.json，回退到 PATH
set "NODE_EXE="
if exist "%RUNTIME_FILE%" (
    for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "(Get-Content -Raw '%RUNTIME_FILE%' | ConvertFrom-Json).nodePath"`) do set "NODE_EXE=%%p"
)
if not defined NODE_EXE (
    where node.exe >nul 2>nul
    if not errorlevel 1 set "NODE_EXE=node.exe"
)
if not defined NODE_EXE (
    echo [错误] 未找到 node.exe，且 runtime.json 中没有记录 nodePath。
    echo [说明] 请先运行「一键启动服务器start_server.bat」完成一次启动，再使用本脚本。
    if not defined VCP_NO_PAUSE pause
    exit /b 1
)

REM PM2_HOME 必须与启动时一致，否则会连到另一个 PM2 实例
set "PM2_HOME=%PM2_HOME_DIR%"
set "PM2_NO_INTERACTION=true"

echo [运行] Node: %NODE_EXE%
echo.
echo [1/3] 正在停止 vcp-main 与 vcp-admin ...
"%NODE_EXE%" "%PM2_CLI%" stop vcp-main vcp-admin
if errorlevel 1 (
    echo [提示] 停止应用时返回非零状态，继续尝试删除 PM2 进程记录。
)

echo [2/3] 正在删除 PM2 进程记录 ...
"%NODE_EXE%" "%PM2_CLI%" delete all
if errorlevel 1 (
    echo [提示] 删除进程记录时返回非零状态，可能 PM2 守护进程已不在运行。
)

echo [3/3] 正在关闭项目 PM2 守护进程 ...
set "VCP_DAEMON_STOP_FAILED=0"
"%NODE_EXE%" "%PM2_CLI%" kill
if errorlevel 1 (
    echo [警告] PM2 守护进程未能确认关闭，请查看上方输出。
    set "VCP_DAEMON_STOP_FAILED=1"
)

if "%VCP_DAEMON_STOP_FAILED%"=="1" (
    if not defined VCP_NO_PAUSE pause
    exit /b 1
)

echo.
echo [完成] 6005 主服务与 6006 管理面板已关闭。
echo [说明] 本脚本仅停止 VCP 服务，不会关闭其他 node 程序。
echo [说明] 重新启动请双击「一键启动服务器start_server.bat」。
if not defined VCP_NO_PAUSE pause
exit /b 0
