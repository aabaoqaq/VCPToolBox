# ============================================
# 文件名大小写冲突检测脚本
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  文件名大小写冲突检测工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 设置编码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 获取官方文件列表
Write-Host "[1/3] 获取官方仓库文件列表..." -ForegroundColor Yellow
$officialFiles = git ls-tree -r upstream/main --name-only 2>$null

if (!$officialFiles) {
    Write-Host ""
    Write-Host "ERROR: 无法获取官方文件列表" -ForegroundColor Red
    Write-Host "请检查: git remote -v" -ForegroundColor Yellow
    exit 1
}

# 获取本地文件列表
Write-Host "[2/3] 获取本地文件列表..." -ForegroundColor Yellow
$localFiles = git ls-files

# 对比文件名
Write-Host "[3/3] 对比文件名大小写..." -ForegroundColor Yellow
Write-Host ""

$conflicts = @()

foreach ($official in $officialFiles) {
    $officialLower = $official.ToLower()
    
    foreach ($local in $localFiles) {
        $localLower = $local.ToLower()
        
        if ($officialLower -eq $localLower -and $official -ne $local) {
            $conflicts += [PSCustomObject]@{
                Official = $official
                Local = $local
            }
        }
    }
}

# 显示结果
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  检测结果" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($conflicts.Count -eq 0) {
    Write-Host "OK: 未发现大小写冲突" -ForegroundColor Green
    Write-Host ""
    Write-Host "所有文件名与官方一致！" -ForegroundColor Green
} else {
    Write-Host "WARNING: 发现 $($conflicts.Count) 个大小写冲突" -ForegroundColor Red
    Write-Host ""
    
    $index = 1
    foreach ($conflict in $conflicts) {
        Write-Host "冲突 #$index" -ForegroundColor Yellow
        Write-Host "  官方版本: $($conflict.Official)" -ForegroundColor Cyan
        Write-Host "  本地版本: $($conflict.Local)" -ForegroundColor Red
        Write-Host ""
        $index++
    }
    
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  修复命令" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($conflict in $conflicts) {
        Write-Host "# 修复: $($conflict.Local)" -ForegroundColor Cyan
        Write-Host "git rm `"$($conflict.Local)`""
        Write-Host "git checkout upstream/main -- `"$($conflict.Official)`""
        Write-Host "git add `"$($conflict.Official)`""
        Write-Host ""
    }
    
    Write-Host "# 提交修复" -ForegroundColor Cyan
    Write-Host 'git commit -m "修复文件名大小写冲突"'
    Write-Host ""
    
    # 询问是否自动修复
    Write-Host "========================================" -ForegroundColor Yellow
    $choice = Read-Host "是否自动修复? (Y/N)"
    
    if ($choice -eq 'Y' -or $choice -eq 'y') {
        Write-Host ""
        Write-Host "开始自动修复..." -ForegroundColor Yellow
        Write-Host ""
        
        foreach ($conflict in $conflicts) {
            Write-Host "  [处理] $($conflict.Local)" -ForegroundColor Cyan
            
            git rm "$($conflict.Local)" -f 2>$null
            git checkout upstream/main -- "$($conflict.Official)" 2>$null
            git add "$($conflict.Official)" 2>$null
            
            Write-Host "  [完成] 已修复" -ForegroundColor Green
            Write-Host ""
        }
        
        git commit -m "修复文件名大小写冲突" 2>$null
        
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "OK: 所有冲突已修复并提交" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "下一步: git push origin custom" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "已取消自动修复" -ForegroundColor Yellow
        Write-Host "请手动执行上述命令" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "扫描完成！" -ForegroundColor Green
Write-Host ""
