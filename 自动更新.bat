@echo off
setlocal enabledelayedexpansion

echo ========================================
echo VCPToolBox 自动更新脚本 v5.0
echo ========================================
echo.

cd /d "%~dp0"

REM 排除列表文件路径
set "EXCLUDE_FILE=%~dp0.update-exclude.txt"

REM ====================================
REM 阶段 0: 本地修改管理
REM ====================================
echo [阶段 0/5] 本地修改管理
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

REM 创建排除列表文件（如果不存在）
if not exist "!EXCLUDE_FILE!" (
    echo # VCPToolBox 更新排除列表 > "!EXCLUDE_FILE!"
    echo # 每行一个文件路径，这些文件不会被提交到 custom 仓库 >> "!EXCLUDE_FILE!"
    echo # 由自动更新脚本自动管理 >> "!EXCLUDE_FILE!"
)

REM 检查是否有未暂存的更改
git diff --name-only > "%TEMP%\vcp_unstaged.txt" 2>nul
git diff --cached --name-only > "%TEMP%\vcp_staged.txt" 2>nul
git ls-files --others --exclude-standard > "%TEMP%\vcp_untracked.txt" 2>nul

REM 合并所有未提交文件
type "%TEMP%\vcp_unstaged.txt" > "%TEMP%\vcp_all_changes.txt" 2>nul
type "%TEMP%\vcp_staged.txt" >> "%TEMP%\vcp_all_changes.txt" 2>nul
type "%TEMP%\vcp_untracked.txt" >> "%TEMP%\vcp_all_changes.txt" 2>nul

REM 去重
sort "%TEMP%\vcp_all_changes.txt" /unique /o "%TEMP%\vcp_all_changes.txt" 2>nul

REM 统计文件数量
set FILE_COUNT=0
for /f "usebackq tokens=*" %%a in ("%TEMP%\vcp_all_changes.txt") do (
    if not "%%a"=="" set /a FILE_COUNT+=1
)

if !FILE_COUNT! equ 0 (
    echo [提示] 没有检测到本地修改
    goto :SYNC_REMOTE
)

echo.
echo [检测到 !FILE_COUNT! 个本地修改的文件]
echo.
echo 当前已排除的文件（不会提交到 custom）：
echo ----------------------------------------
set EXCLUDE_COUNT=0
for /f "usebackq tokens=*" %%a in ("!EXCLUDE_FILE!") do (
    set "LINE=%%a"
    if not "!LINE:~0,1!"=="#" if not "!LINE!"=="" (
        echo   [已排除] %%a
        set /a EXCLUDE_COUNT+=1
    )
)
if !EXCLUDE_COUNT! equ 0 echo   (无)
echo ----------------------------------------
echo.

echo 本地修改的文件列表：
echo ----------------------------------------
set INDEX=0
for /f "usebackq tokens=*" %%a in ("%TEMP%\vcp_all_changes.txt") do (
    if not "%%a"=="" (
        set /a INDEX+=1
        
        REM 检查是否在排除列表中
        set "IS_EXCLUDED=0"
        for /f "usebackq tokens=*" %%b in ("!EXCLUDE_FILE!") do (
            if "%%a"=="%%b" set "IS_EXCLUDED=1"
        )
        
        if !IS_EXCLUDED! equ 1 (
            echo   !INDEX!. [已排除] %%a
        ) else (
            echo   !INDEX!. %%a
        )
        set "FILE_!INDEX!=%%a"
    )
)
echo ----------------------------------------
echo.

choice /C YN /N /M "是否需要添加新的文件到排除列表? (Y=是 N=跳过) "
if errorlevel 2 goto :HANDLE_COMMITS

echo.
echo 请输入要排除的文件编号（用空格分隔，如: 1 3 5）
echo 输入 0 取消，输入 all 排除所有
set /p EXCLUDE_INPUT="排除编号: "

if "!EXCLUDE_INPUT!"=="0" goto :HANDLE_COMMITS
if /i "!EXCLUDE_INPUT!"=="all" (
    for /f "usebackq tokens=*" %%a in ("%TEMP%\vcp_all_changes.txt") do (
        if not "%%a"=="" (
            echo %%a >> "!EXCLUDE_FILE!"
            echo   [新增排除] %%a
        )
    )
    echo [完成] 已将所有文件添加到排除列表
    goto :SYNC_REMOTE
)

REM 处理用户输入的编号
for %%n in (!EXCLUDE_INPUT!) do (
    if defined FILE_%%n (
        set "TARGET_FILE=!FILE_%%n!"
        
        REM 检查是否已在排除列表
        set "ALREADY_EXCLUDED=0"
        for /f "usebackq tokens=*" %%b in ("!EXCLUDE_FILE!") do (
            if "!TARGET_FILE!"=="%%b" set "ALREADY_EXCLUDED=1"
        )
        
        if !ALREADY_EXCLUDED! equ 0 (
            echo !TARGET_FILE! >> "!EXCLUDE_FILE!"
            echo   [新增排除] !TARGET_FILE!
        ) else (
            echo   [已存在] !TARGET_FILE!
        )
    )
)
echo.

REM ====================================
REM 阶段 1: 处理提交
REM ====================================
:HANDLE_COMMITS
echo [阶段 1/5] 处理本地提交
echo ----------------------------------------

REM 重新检查未排除的文件
set COMMIT_COUNT=0
echo 以下文件将被提交到 custom 仓库：
echo ----------------------------------------
for /f "usebackq tokens=*" %%a in ("%TEMP%\vcp_all_changes.txt") do (
    if not "%%a"=="" (
        set "IS_EXCLUDED=0"
        for /f "usebackq tokens=*" %%b in ("!EXCLUDE_FILE!") do (
            set "LINE=%%b"
            if not "!LINE:~0,1!"=="#" if "%%a"=="%%b" set "IS_EXCLUDED=1"
        )
        
        if !IS_EXCLUDED! equ 0 (
            echo   %%a
            set /a COMMIT_COUNT+=1
        )
    )
)
echo ----------------------------------------

if !COMMIT_COUNT! equ 0 (
    echo [提示] 没有需要提交的文件（全部已排除或无修改）
    goto :SYNC_REMOTE
)

echo.
echo [选项] 如何处理这 !COMMIT_COUNT! 个文件?
echo   1. 提交到 custom 仓库
echo   2. 跳过（保留本地修改但不提交）
echo.
choice /C 12 /N /M "请选择 (1=提交 2=跳过): "

if errorlevel 2 (
    echo [跳过] 保留本地修改，不提交
    goto :SYNC_REMOTE
)

echo.
REM 添加未排除的文件
for /f "usebackq tokens=*" %%a in ("%TEMP%\vcp_all_changes.txt") do (
    if not "%%a"=="" (
        set "IS_EXCLUDED=0"
        for /f "usebackq tokens=*" %%b in ("!EXCLUDE_FILE!") do (
            set "LINE=%%b"
            if not "!LINE:~0,1!"=="#" if "%%a"=="%%b" set "IS_EXCLUDED=1"
        )
        
        if !IS_EXCLUDED! equ 0 (
            git add "%%a" >nul 2>&1
        )
    )
)

set /p COMMIT_MSG="请输入提交说明 (直接回车使用默认): "
if "!COMMIT_MSG!"=="" set COMMIT_MSG=本地修改备份
git commit -m "!COMMIT_MSG!" >nul 2>&1
echo [完成] 已提交 !COMMIT_COUNT! 个文件
echo.

REM ====================================
REM 阶段 2: 同步远程仓库
REM ====================================
:SYNC_REMOTE
echo [阶段 2/5] 同步远程仓库
echo ----------------------------------------

echo [1/2] 获取官方仓库 (upstream) 更新...
git fetch upstream >nul 2>&1
if !errorlevel! neq 0 (
    echo [错误] 无法连接到官方仓库
    echo [提示] 请检查网络或确认 upstream 配置：
    echo   git remote add upstream https://github.com/lioensky/VCPToolBox.git
    pause
    exit /b 1
)

echo [2/2] 同步你的 Fork (origin/main)...
git fetch origin >nul 2>&1
git push origin upstream/main:main -f >nul 2>&1

echo [完成] 远程同步完成
echo.

REM ====================================
REM 阶段 3: 检查并合并更新
REM ====================================
echo [阶段 3/5] 检查并合并官方更新
echo ----------------------------------------

REM 检查是否有新提交
for /f %%i in ('git rev-list --count custom..upstream/main 2^>nul') do set NEW_COMMITS=%%i

if "!NEW_COMMITS!"=="0" (
    echo [提示] 已是最新版本，无需更新
    goto :UPDATE_DEPS
)

echo [发现新版本] 官方仓库有 !NEW_COMMITS! 个新提交
echo.
echo ========================================
echo 官方更新内容预览
echo ========================================
echo.
echo [提交列表]
git --no-pager log custom..upstream/main --oneline --graph -10
echo.
echo [改动的文件]
git --no-pager diff custom..upstream/main --stat --stat-width=80
echo ========================================
echo.

choice /C YN /T 30 /D Y /N /M "确认要合并官方更新吗? (Y/N, 30秒自动选是) "
if errorlevel 2 goto :END

echo.

REM 记录合并前的 commit
for /f "tokens=*" %%i in ('git rev-parse HEAD') do set BEFORE_MERGE=%%i

REM 尝试自动合并
echo [执行] 正在合并 upstream/main...
git merge upstream/main --no-edit 2>nul
set MERGE_EXIT=!errorlevel!

REM ====================================
REM 阶段 4: 冲突检测与处理
REM ====================================
echo [阶段 4/5] 冲突检测
echo ----------------------------------------

REM 检查是否有冲突
git diff --name-only --diff-filter=U > "%TEMP%\vcp_conflicts.txt" 2>nul
set CONFLICT_COUNT=0
for /f "usebackq tokens=*" %%a in ("%TEMP%\vcp_conflicts.txt") do (
    if not "%%a"=="" set /a CONFLICT_COUNT+=1
)

if !CONFLICT_COUNT! gtr 0 (
    echo.
    echo ========================================
    echo [警告] 检测到 !CONFLICT_COUNT! 个文件冲突
    echo ========================================
    echo.
    echo [冲突文件列表]
    for /f "usebackq tokens=*" %%a in ("%TEMP%\vcp_conflicts.txt") do (
        echo   - %%a
    )
    echo.
    echo [解决方案]
    echo   保留你的版本:   git checkout --ours 文件名
    echo   使用官方版本:   git checkout --theirs 文件名
    echo   手动编辑后:     git add 文件名
    echo.
    echo [建议] 保持 VCP 运行，询问 Nova 分析冲突
    echo.
    echo [处理完成后执行]
    echo   git add .
    echo   git commit -m "解决合并冲突"
    echo   然后重新运行本脚本
    echo.
    pause
    exit /b 1
)

REM 记录合并后的 commit
for /f "tokens=*" %%i in ('git rev-parse HEAD') do set AFTER_MERGE=%%i

if "!BEFORE_MERGE!"=="!AFTER_MERGE!" (
    echo [提示] 无需合并（已是最新或 Fast-forward）
) else (
    echo [完成] 官方更新已成功合并
)
echo.

REM ====================================
REM 依赖更新
REM ====================================
:UPDATE_DEPS
echo [依赖检查] 检查是否需要更新依赖...
echo ----------------------------------------

set DEP_UPDATED=0

if defined BEFORE_MERGE (
    REM 检查 Python 依赖
    for %%d in ("Plugin\SciCalculator" "Plugin\VideoGenerator") do (
        if exist "%%d\requirements.txt" (
            git diff !BEFORE_MERGE! HEAD -- "%%d\requirements.txt" >nul 2>&1
            if !errorlevel! equ 0 (
                echo [检测] %%d 的 Python 依赖有更新
                choice /C YN /T 10 /D Y /N /M "是否更新? (Y/N, 10秒自动选是) "
                if !errorlevel! equ 1 (
                    cd %%d
                    pip install -r requirements.txt --quiet --disable-pip-version-check
                    cd ..\..
                    set DEP_UPDATED=1
                )
            )
        )
    )
    
    REM 检查 Node.js 依赖
    if exist "package.json" (
        git diff !BEFORE_MERGE! HEAD -- package.json >nul 2>&1
        if !errorlevel! equ 0 (
            echo [检测] package.json 有更新
            choice /C YN /T 10 /D Y /N /M "是否更新 Node.js 依赖? (Y/N, 10秒自动选是) "
            if !errorlevel! equ 1 (
                call npm install --loglevel=error --no-audit --no-fund
                set DEP_UPDATED=1
            )
        )
    )
)

if !DEP_UPDATED! equ 0 (
    echo [提示] 依赖无变化
)
echo.

REM ====================================
REM 阶段 5: 推送到 GitHub
REM ====================================
echo [阶段 5/5] 推送到 GitHub
echo ----------------------------------------

echo [重要确认] 推送目标仓库信息：
echo.
echo   远程名称: origin
echo   目标分支: custom
echo   仓库地址:
git remote get-url origin 2>nul
echo.
echo   这是你的个人备份仓库 (aabaoqaq/VCPToolBox custom 分支)
echo.

if defined NEW_COMMITS (
    if !NEW_COMMITS! gtr 0 (
        echo [本次更新内容]
        git log !BEFORE_MERGE!..HEAD --oneline 2>nul
        echo.
    )
)

choice /C YN /N /M "确认推送到你的 custom 备份仓库? (Y/N) "
if !errorlevel! equ 1 (
    echo [执行] 推送中...
    git push origin custom 2>nul
    if !errorlevel! equ 0 (
        echo [完成] 推送成功
    ) else (
        echo [警告] 推送失败
        choice /C YN /N /M "是否强制推送? (Y/N) "
        if !errorlevel! equ 1 (
            git push origin custom --force-with-lease
        )
    )
) else (
    echo [跳过] 稍后可手动执行: git push origin custom
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
echo [排除列表位置] !EXCLUDE_FILE!
echo.

:END
REM 清理临时文件
del "%TEMP%\vcp_*.txt" 2>nul

echo [完成] 按任意键退出...
pause >nul
endlocal
exit /b 0
