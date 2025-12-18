@echo off
setlocal enabledelayedexpansion
REM chcp 65001 >nul 2>&1

echo ========================================
echo VCPToolBox 自动更新脚本 v4.0
echo ========================================
echo.

cd /d "%~dp0"

REM ====================================
REM 阶段 0: 环境检查
REM ====================================
echo [阶段 0/4] 环境检查
echo ----------------------------------------

REM 检查当前分支
for /f "tokens=*" %%i in ('git rev-parse --abbrev-ref HEAD') do set CURRENT_BRANCH=%%i
if not "!CURRENT_BRANCH!"=="custom" (
    echo [警告] 当前不在 custom 分支，正在切换...
    git checkout custom >nul 2>&1
    if !errorlevel! neq 0 (
        echo [错误] 无法切换到 custom 分支
        pause
        exit /b 1
    )
    echo [完成] 已切换到 custom 分支
)

REM 检查未提交的更改
git diff --quiet
if !errorlevel! neq 0 (
    echo.
    echo [警告] 检测到未提交的更改：
    git status --short
    echo.
    choice /C YNC /N /M "是否先提交这些更改? (Y=提交 N=跳过 C=取消) "
    if errorlevel 3 goto :END
    if errorlevel 2 (
        echo [提示] 已跳过提交，继续更新...
    ) else (
        git add -A
        set /p COMMIT_MSG="请输入提交说明: "
        if "!COMMIT_MSG!"=="" set COMMIT_MSG=保存本地修改
        git commit -m "!COMMIT_MSG!"
        echo [完成] 更改已提交
    )
)


echo [完成] 环境检查完成
echo.

REM ====================================
REM 阶段 1: 同步远程仓库
REM ====================================
echo [阶段 1/4] 同步远程仓库
echo ----------------------------------------

echo [1/2] 获取官方仓库更新...
git fetch upstream >nul 2>&1
if !errorlevel! neq 0 (
    echo [错误] 无法连接到官方仓库
    echo [提示] 请检查网络或运行: git remote -v
    pause
    exit /b 1
)

echo [2/2] 同步你的 Fork...
git fetch origin >nul 2>&1
git push origin upstream/main:main -f >nul 2>&1

echo [完成] 远程同步完成
echo.

REM ====================================
REM 阶段 2: 检查并合并更新
REM ====================================
echo [阶段 2/4] 检查并合并更新
echo ----------------------------------------

REM 检查是否有新提交
for /f %%i in ('git rev-list --count custom..upstream/main 2^>nul') do set NEW_COMMITS=%%i

if "!NEW_COMMITS!"=="0" (
    echo [提示] 已是最新版本，无需更新
    goto :UPDATE_DEPS
)

echo [发现新提交] !NEW_COMMITS! 个
echo.
echo [官方最新提交]
git log custom..upstream/main --oneline --graph -5
echo.

choice /C YN /T 10 /D Y /N /M "确认要合并官方更新吗? (Y/N, 10秒自动选是) "
if errorlevel 2 goto :END
echo.

REM 记录合并前的 commit
for /f "tokens=*" %%i in ('git rev-parse HEAD') do set BEFORE_MERGE=%%i

REM 尝试自动合并
echo [执行] 正在合并 upstream/main...
git merge upstream/main --no-edit 2>nul
set MERGE_EXIT=!errorlevel!

REM 检查是否有冲突
git diff --name-only --diff-filter=U >nul 2>&1
set HAS_CONFLICT=!errorlevel!

if !HAS_CONFLICT! equ 0 (
    echo.
    echo ========================================
    echo 检测到文件冲突
    echo ========================================
    echo.
    echo [冲突文件]
    git status --short | findstr "^UU"
    echo.
    echo [处理方式]
    echo   1. 保留你的版本:   git checkout --ours 文件名
    echo   2. 使用官方版本:   git checkout --theirs 文件名
    echo   3. 手动编辑文件
    echo.
    echo [处理完成后]
    echo   git add 文件名
    echo   git commit -m "解决冲突"
    echo   然后重新运行本脚本
    echo.
    pause
    exit /b 1
)

REM 记录合并后的 commit
for /f "tokens=*" %%i in ('git rev-parse HEAD') do set AFTER_MERGE=%%i

if "!BEFORE_MERGE!"=="!AFTER_MERGE!" (
    echo [提示] 已经是最新版本（Fast-forward）
) else (
    echo [完成] 官方更新已成功合并
)
echo.

REM ====================================
REM 阶段 3: 更新依赖
REM ====================================
:UPDATE_DEPS
echo [阶段 3/4] 更新依赖
echo ----------------------------------------

set DEP_UPDATED=0

REM 检查 Python 依赖是否有变化
if defined BEFORE_MERGE (
    for %%d in ("Plugin\SciCalculator" "Plugin\VideoGenerator") do (
        if exist "%%d\requirements.txt" (
            git diff !BEFORE_MERGE! HEAD -- "%%d\requirements.txt" >nul 2>&1
            if !errorlevel! equ 0 (
                echo [检测] %%d 的依赖有更新
                choice /C YN /T 10 /D Y /N /M "是否更新 Python 依赖? (Y/N, 10秒自动选是) "
                if !errorlevel! equ 1 (
                    echo [执行] 安装 Python 依赖...
                    cd %%d
                    pip install -r requirements.txt --quiet --disable-pip-version-check
                    cd ..\..
                    set DEP_UPDATED=1
                )
            )
        )
    )
    
    REM 检查 Node.js 依赖是否有变化
    if exist "package.json" (
        git diff !BEFORE_MERGE! HEAD -- package.json >nul 2>&1
        if !errorlevel! equ 0 (
            echo [检测] package.json 有更新
            choice /C YN /T 10 /D Y /N /M "是否更新 Node.js 依赖? (Y/N, 10秒自动选是) "
            if !errorlevel! equ 1 (
                echo [执行] 安装 Node.js 依赖...
                call npm install --loglevel=error --no-audit --no-fund
                set DEP_UPDATED=1
            )
        )
    )
)

if !DEP_UPDATED! equ 0 (
    echo [提示] 依赖未变化，无需更新
) else (
    echo [完成] 依赖更新完成
)
echo.

REM ====================================
REM 阶段 4: 推送到 GitHub
REM ====================================
echo [阶段 4/4] 推送到 GitHub
echo ----------------------------------------

if defined NEW_COMMITS (
    if !NEW_COMMITS! gtr 0 (
        echo [更新内容]
        git log !BEFORE_MERGE!..HEAD --oneline
        echo.
    )
)

choice /C YN /N /M "是否立即推送到 GitHub? (Y/N) "
if !errorlevel! equ 1 (
    echo [执行] 推送中...
    git push origin custom 2>nul
    if !errorlevel! equ 0 (
        echo [完成] 推送成功
    ) else (
        echo [警告] 推送失败，可能需要强制推送
        echo [命令] git push origin custom --force-with-lease
    )
) else (
    echo [提示] 已跳过推送，稍后可手动执行：
    echo   git push origin custom
)
echo.

REM ====================================
REM 完成
REM ====================================
echo ========================================
echo 更新完成
echo ========================================
echo.
echo [当前版本]
git log --oneline -1
echo.

:END
echo [完成] 按任意键退出...
pause >nul
endlocal
exit /b 0
