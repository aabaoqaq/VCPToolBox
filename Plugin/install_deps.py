#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
依赖批量安装脚本 v2.0 - 实时进度显示版
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from datetime import datetime

# 配置日志
LOG_FILE = "install_deps.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


def run_command_realtime(command, cwd):
    """实时显示命令输出"""
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=True,
            text=True,
            encoding='utf-8',
            errors='ignore',
            bufsize=1
        )
        
        output_lines = []
        print("   ╭─ 安装输出 " + "─" * 45)
        
        for line in process.stdout:
            line = line.rstrip()
            if line:
                # 实时显示关键信息
                if any(keyword in line.lower() for keyword in ['added', 'updated', 'installed', 'successfully', 'error', 'warn']):
                    print(f"   │ {line[:70]}")
                output_lines.append(line)
        
        print("   ╰" + "─" * 60)
        
        process.wait(timeout=600)
        return process.returncode == 0, '\n'.join(output_lines)
        
    except subprocess.TimeoutExpired:
        process.kill()
        return False, "命令执行超时（10分钟）"
    except Exception as e:
        return False, f"执行出错: {str(e)}"


def find_venv(project_dir):
    """查找Python虚拟环境"""
    venv_names = ['venv', '.venv', 'env', '.env']
    for name in venv_names:
        venv_path = project_dir / name
        if venv_path.exists() and venv_path.is_dir():
            return venv_path
    return None


def get_pip_command(req_dir):
    """获取pip命令"""
    venv_path = find_venv(req_dir)
    
    if venv_path:
        python_exe = venv_path / 'Scripts' / 'python.exe'
        if python_exe.exists():
            logger.info(f"🔍 检测到虚拟环境: {venv_path.name}")
            return f'"{python_exe}" -m pip install -r requirements.txt'
    
    return 'pip install -r requirements.txt'


def install_npm_deps(pkg_dir, index, total):
    """安装npm依赖"""
    logger.info(f"\n📦 [{index}/{total}] npm项目: {pkg_dir}")
    
    node_modules = pkg_dir / 'node_modules'
    if node_modules.exists():
        logger.info("   └─ node_modules已存在，将更新依赖")
    
    success, output = run_command_realtime('npm install', str(pkg_dir))
    
    if success:
        logger.info("✅ npm依赖安装成功")
    else:
        logger.error("❌ npm依赖安装失败")
    
    return success


def install_pip_deps(req_dir, index, total):
    """安装Python依赖"""
    logger.info(f"\n🐍 [{index}/{total}] Python项目: {req_dir}")
    
    pip_cmd = get_pip_command(req_dir)
    success, output = run_command_realtime(pip_cmd, str(req_dir))
    
    if success:
        logger.info("✅ Python依赖安装成功")
    else:
        logger.error("❌ Python依赖安装失败")
    
    return success


def should_skip_directory(path):
    """判断是否跳过目录"""
    skip_dirs = {
        'node_modules', '.git', '__pycache__', 
        'venv', '.venv', 'env', '.env',
        'site-packages', 'dist', 'build',
        '.idea', '.vscode', 'coverage'
    }
    
    path_parts = Path(path).parts
    return any(skip_dir in path_parts for skip_dir in skip_dirs)


def scan_and_install(target_dir, max_projects=None):
    """扫描并安装依赖"""
    target_path = Path(target_dir).resolve()
    
    if not target_path.exists():
        logger.error(f"❌ 目录不存在: {target_path}")
        sys.exit(1)
    
    logger.info("=" * 60)
    logger.info(f"扫描目录: {target_path}")
    logger.info("=" * 60)
    
    npm_count = 0
    pip_count = 0
    error_count = 0
    
    # 扫描npm项目
    logger.info("\n🔍 正在搜索npm项目...")
    npm_projects = []
    
    for pkg_file in target_path.rglob('package.json'):
        if should_skip_directory(pkg_file.parent):
            continue
        npm_projects.append(pkg_file.parent)
        
        # 限制最大项目数（避免误扫系统目录）
        if max_projects and len(npm_projects) >= max_projects:
            logger.warning(f"⚠️ 已找到{max_projects}个项目，停止搜索（避免扫描过多）")
            break
    
    if npm_projects:
        logger.info(f"找到 {len(npm_projects)} 个npm项目")
        
        for idx, pkg_dir in enumerate(npm_projects, 1):
            if install_npm_deps(pkg_dir, idx, len(npm_projects)):
                npm_count += 1
            else:
                error_count += 1
    else:
        logger.info("未找到npm项目")
    
    # 扫描Python项目
    logger.info("\n🔍 正在搜索Python项目...")
    pip_projects = []
    
    for req_file in target_path.rglob('requirements.txt'):
        if should_skip_directory(req_file.parent):
            continue
        pip_projects.append(req_file.parent)
        
        if max_projects and len(pip_projects) >= max_projects:
            logger.warning(f"⚠️ 已找到{max_projects}个项目，停止搜索")
            break
    
    if pip_projects:
        logger.info(f"找到 {len(pip_projects)} 个Python项目")
        
        for idx, req_dir in enumerate(pip_projects, 1):
            if install_pip_deps(req_dir, idx, len(pip_projects)):
                pip_count += 1
            else:
                error_count += 1
    else:
        logger.info("未找到Python项目")
    
    # 统计结果
    logger.info("\n" + "=" * 60)
    logger.info("📊 安装统计")
    logger.info(f"  ✅ npm项目成功: {npm_count} 个")
    logger.info(f"  ✅ Python项目成功: {pip_count} 个")
    logger.info(f"  ❌ 失败数量: {error_count} 个")
    logger.info("=" * 60)
    
    if error_count > 0:
        sys.exit(1)
    else:
        logger.info("✅ 所有依赖安装完成！")
        sys.exit(0)


def main():
    print("=" * 60)
    print("  依赖批量安装工具 v2.0 (实时进度版)")
    print("=" * 60)
    print()
    
    if len(sys.argv) > 1:
        target = sys.argv[1]
    else:
        print("⚠️ 提示：请确保输入的是您的项目目录，而非系统目录")
        target = input("请输入项目目录路径: ").strip()
        if not target:
            target = "."
    
    target_path = Path(target).resolve()
    print(f"\n将扫描: {target_path}")
    
    # 安全检查
    if any(keyword in str(target_path).lower() for keyword in ['program files', 'windows', 'system32']):
        print("\n⚠️ 警告：检测到系统目录，建议不要扫描！")
        confirm = input("确定要继续吗？(yes/no): ").strip().lower()
        if confirm != 'yes':
            print("已取消")
            sys.exit(0)
    
    if len(sys.argv) == 1:
        confirm = input("开始扫描？(Y/n): ").strip().lower()
        if confirm and confirm not in ['y', 'yes', '是']:
            print("已取消")
            sys.exit(0)
    
    print()
    # 限制最多处理20个项目，防止误扫
    scan_and_install(target, max_projects=20)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ 用户中断操作")
        sys.exit(130)
    except Exception as e:
        logger.error(f"\n❌ 程序异常: {str(e)}")
        sys.exit(1)
