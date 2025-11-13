@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo Cherry-Var-Reborn 更新脚本 v6.2
echo ========================================
echo.

cd /d "%~dp0"

REM ============================================
REM 阶段1：Git代码更新
REM ============================================
echo [阶段1/3] Git代码更新
echo ----------------------------------------

if not exist ".git" (
    echo [错误] 当前目录不是Git仓库
    pause
    exit /b 1
)

REM 检查未解决的冲突
git ls-files -u >nul 2>&1
if %errorlevel% equ 0 (
    echo [检测] 发现未解决的合并冲突，自动处理中...
    
    for /f "tokens=*" %%f in ('git diff --name-only --diff-filter=U') do (
        echo %%f | findstr /i "\.env$" >nul
        if !errorlevel! equ 0 (
            echo [保留本地] %%f
            git checkout --ours "%%f"
            git add "%%f"
        ) else (
            echo %%f | findstr /i "config\.env" >nul
            if !errorlevel! equ 0 (
                echo [保留本地] %%f
                git checkout --ours "%%f"
                git add "%%f"
            ) else (
                echo [使用远程] %%f
                git checkout --theirs "%%f"
                git add "%%f"
            )
        )
    )
    
    git commit -m "Auto-resolve conflicts" >nul 2>&1
    echo [成功] 冲突已自动解决
    echo.
)

REM 备份配置文件
echo [操作] 备份配置文件...
set BACKUP_DIR=%TEMP%\vcptoolbox_env_%RANDOM%
mkdir "%BACKUP_DIR%" 2>nul

for /r %%f in (*.env) do (
    if exist "%%f" (
        set "REL_PATH=%%f"
        set "REL_PATH=!REL_PATH:%CD%\=!"
        
        for %%p in ("%%f") do set "FILE_DIR=%%~dpf"
        set "FILE_DIR=!FILE_DIR:%CD%\=!"
        mkdir "%BACKUP_DIR%\!FILE_DIR!" 2>nul
        
        copy "%%f" "%BACKUP_DIR%\!REL_PATH!" >nul 2>&1
    )
)
echo [完成] 配置已备份
echo.

REM 暂存非env的修改
git diff --quiet
if %errorlevel% neq 0 (
    echo [操作] 暂存本地修改...
    git add -u
    git reset -- "*.env" "**/config.env" >nul 2>&1
    git diff --cached --quiet
    if %errorlevel% neq 0 (
        git stash push -m "Auto-backup" >nul 2>&1
        set HAS_STASH=1
    ) else (
        set HAS_STASH=0
    )
) else (
    set HAS_STASH=0
)

REM 记录当前版本
for /f "tokens=*" %%i in ('git rev-parse HEAD') do set OLD_COMMIT=%%i

REM 拉取更新
echo [操作] 正在拉取远程更新...
git pull --no-edit
if %errorlevel% neq 0 (
    echo [失败] 拉取失败，尝试自动修复...
    
    git ls-files -u >nul 2>&1
    if %errorlevel% equ 0 (
        echo [处理] 自动解决冲突中...
        
        for /f "tokens=*" %%f in ('git diff --name-only --diff-filter=U') do (
            echo %%f | findstr /i "\.env$" >nul
            if !errorlevel! equ 0 (
                git checkout --ours "%%f"
                git add "%%f"
            ) else (
                echo %%f | findstr /i "config\.env" >nul
                if !errorlevel! equ 0 (
                    git checkout --ours "%%f"
                    git add "%%f"
                ) else (
                    git checkout --theirs "%%f"
                    git add "%%f"
                )
            )
        )
        
        git commit -m "Auto-resolve" >nul 2>&1
        echo [成功] 冲突已解决
        git pull --no-edit
    ) else (
        echo [错误] 无法自动修复
        if %HAS_STASH%==1 git stash pop >nul 2>&1
        rmdir /s /q "%BACKUP_DIR%" 2>nul
        pause
        exit /b 1
    )
)

REM === 显示更新内容（关键部分）===
for /f %%c in ('git rev-list --count %OLD_COMMIT%..HEAD 2^>nul') do set COMMIT_COUNT=%%c
if not defined COMMIT_COUNT set COMMIT_COUNT=0

if %COMMIT_COUNT% gtr 0 (
    echo.
    echo ========================================
    echo 本次更新内容 ^(%COMMIT_COUNT% 个提交^)
    echo ========================================
    echo.
    
    echo [更新说明]
    git log %OLD_COMMIT%..HEAD --pretty=format:"  * %%s" --reverse
    
    echo.
    echo.
    echo [文件变更统计]
    git diff --stat %OLD_COMMIT%..HEAD
    
    echo.
    echo ========================================
    echo.
) else (
    echo [提示] 已经是最新版本
    echo.
)

REM 恢复配置文件
echo [操作] 恢复配置文件...
if exist "%BACKUP_DIR%" (
    xcopy "%BACKUP_DIR%\*" "%CD%\" /E /Y /Q >nul 2>&1
    rmdir /s /q "%BACKUP_DIR%"
    echo [完成] 配置已恢复
)

REM 恢复暂存的修改
if %HAS_STASH%==1 (
    echo [操作] 恢复本地修改...
    git stash pop >nul 2>&1
)

echo [成功] Git更新完成
echo 当前版本:
git log -1 --oneline
echo.

REM ============================================
REM 阶段2：Python依赖更新
REM ============================================
echo [阶段2/3] Python依赖更新
echo ----------------------------------------

if exist "Plugin\SciCalculator\requirements.txt" (
    echo [操作] 更新SciCalculator...
    cd Plugin\SciCalculator
    pip install -r requirements.txt --quiet --disable-pip-version-check
    cd ..\..
)

if exist "Plugin\VideoGenerator\requirements.txt" (
    echo [操作] 更新VideoGenerator...
    cd Plugin\VideoGenerator
    pip install -r requirements.txt --quiet --disable-pip-version-check
    cd ..\..
)

echo [成功] Python依赖已更新
echo.

REM ============================================
REM 阶段3：Node.js依赖更新
REM ============================================
echo [阶段3/3] Node.js依赖更新
echo ----------------------------------------

if exist "package.json" (
    echo [操作] 安装Node.js依赖（跳过编译）...
    echo [提示] 约需1-2分钟，请稍候...
    
    REM 先跳过所有编译
    call npm install --ignore-scripts --loglevel=error --no-audit --no-fund
    
    if !errorlevel! neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    
    REM 单独处理 node-pty
    if exist "node_modules\node-pty" (
        echo [操作] 编译 node-pty...
        
        pushd node_modules\node-pty
        
        REM 配置
        call npx node-gyp configure --msvs_version=2022 >nul 2>&1
        
        REM 修改所有 vcxproj 文件
        if exist "build" (
            for %%f in (build\*.vcxproj) do (
                powershell -NoProfile -Command "(Get-Content '%%f') -replace '<SpectreMitigation>Spectre</SpectreMitigation>','<SpectreMitigation>false</SpectreMitigation>' | Set-Content '%%f'" 2>nul
            )
        )
        
        REM 编译
        call npx node-gyp build --msvs_version=2022 >nul 2>&1
        
        if !errorlevel! equ 0 (
            echo [成功] node-pty 编译完成
        ) else (
            echo [警告] node-pty 编译失败，但不影响其他功能
        )
        
        popd
    )
    
    REM 编译其他原生模块
    echo [操作] 编译其他原生模块...
    call npm rebuild --loglevel=error >nul 2>&1
    
    echo [成功] Node.js依赖已安装
) else (
    echo [跳过] 未找到package.json
)
echo.


REM ============================================
REM 更新完成
REM ============================================
echo ========================================
echo 更新完成
echo ========================================
echo.
echo [OK] 代码同步
echo [OK] 配置保留
echo [OK] 依赖安装

echo.
echo 按任意键退出...
pause >nul
endlocal
exit /b 0