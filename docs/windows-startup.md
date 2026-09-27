# Windows 一键启动与排错

## 日常使用

双击根目录的 `一键启动服务器start_server.bat`。入口要求 PowerShell 7 (`pwsh.exe`)，通过 `-NoProfile` 运行 `scripts/start-vcp.ps1`。

- 只调用项目内 `node_modules/pm2`，不调用全局 PM2。
- 首次解析真实 Node 可执行文件；通过原生 SQLite 内存测试后，保存到 `.vcp-runtime/runtime.json`。后续不会因为 PATH 顺序改变而偷偷换 Node。
- 读取 `ecosystem.config.js`，明确工作目录、解释器、线程池与 `pmx=false`。
- 先检查依赖、前端构建、PM2 归属及端口冲突；不自动安装、编译、升级或删除其他进程。
- `[SUCCESS]` 表示监听 PID、真实 Node 路径、HTTP 响应和默认 10 秒稳定窗口全部通过，而不只是 PM2 显示 online。
- 重复点击不会重启已经正常运行的服务。关闭启动窗口不会停止服务；这不是 Windows 服务注册或开机自启配置。

当前配置的管理面板：`http://localhost:6006/AdminPanel/`。端口来自 `config.env` 的 `PORT`，管理端口为 `PORT + 1`；已定义的进程环境 `PORT` 与 dotenv 一样具有优先级。

```powershell
# 只检查，不启动或安装任何东西
pwsh -NoProfile -File .\scripts\start-vcp.ps1 -Action Check

# 只查看健康状态；不会为了查询状态而创建 PM2 daemon
pwsh -NoProfile -File .\scripts\start-vcp.ps1 -Action Status

# 仅首次或有意更换运行时时显式指定；ABI 不匹配会拒绝启动
pwsh -NoProfile -File .\scripts\start-vcp.ps1 -NodePath 'F:\Python\Lib\site-packages\nodejs_wheel\node.exe'
```

无交互调用批处理时，先设置 `VCP_NO_PAUSE=1`。脚本非零退出码代表失败，不能只看窗口是否出现。

## 当前机器的验收记录（2026-09-23）

- 采用现有 Node **24.15.0 / ABI 137** 与项目内 PM2 **7.0.3**，没有升级全局软件。
- Node **22.17.0 / ABI 127** 无法加载当前 `better-sqlite3`；不要现在直接切换，也不需要因为有多个 Node 而删除它们。
- 原批处理实际启动后，主服务返回 HTTP 401（预期的 Bearer 鉴权要求），管理登录页面返回 HTTP 200。
- 启动命令退出后，至少三分钟、四次独立采样 PID 不变，重启次数 0；重复启动没有重复进程。
- 采样证据在本机 `.vcp-runtime/verification.json`。这是启动/存活检查，不是聊天模型、所有插件或长时间稳定性的完整测试。

## 日志与尚未处理的告警

所有本地状态均放在 `.vcp-runtime/` 并已加入 Git 忽略；不要上传此目录。常用日志：

```text
.vcp-runtime/pm2/pm2.log
.vcp-runtime/pm2/logs/vcp-main-error.log
.vcp-runtime/pm2/logs/vcp-main-out.log
.vcp-runtime/pm2/logs/vcp-admin-error.log
```

本轮实际观察到、尚未修复的非致命告警：

1. PM2 的 `pidusage` 会启动 Windows PowerShell 并加载用户 profile，仍可能出现 `fnm` 找不到的错误，影响资源采样。入口的 `-NoProfile` 不能控制依赖自行创建的这个子进程。本轮没有修改全局 profile；不要把这个告警直接等同于 Node 24 不兼容或服务崩溃。
2. LinuxShellExecutor 的监控组件缺少 `ssh2`；VCPClawMail 缺少 `@clawemail/node-sdk` 且邮箱用户未配置。本轮未安装这些插件依赖。
3. 存在 Node 的 DEP0190 弃用警告，尚未在本轮改动第三方依赖。

## PM2 操作注意

本版本 Windows PM2 使用全局固定命名管道。**仅设置不同 `PM2_HOME` 不代表可以安全同时运行两个独立 daemon。** 启动助手会检查进程、项目 PID 文件和 Node 路径；发现未知 daemon 或陌生端口占用会拒绝接管。

不要再裸用全局 `pm2 list/start/delete`；即使是 `pm2 list`，daemon 不存在时也可能启动一个。查看状态优先用上面的 `-Action Status`。

修改业务配置后若需明确重启，先确认归属，再只操作这两个应用：

```powershell
Set-Location 'F:\VCP\VCPToolBox'
pwsh -NoProfile -File .\scripts\start-vcp.ps1 -Action Status
if ($LASTEXITCODE -ne 0) { throw '先排查归属或健康状态，不要盲目重启。' }
$node = (Get-Content -Raw -LiteralPath .\.vcp-runtime\runtime.json | ConvertFrom-Json).nodePath
$env:PM2_HOME = Join-Path $PWD '.vcp-runtime\pm2'
$env:VCP_NODE_EXE = $node
& $node .\node_modules\pm2\lib\binaries\CLI.js restart ecosystem.config.js --only vcp-main,vcp-admin --update-env
pwsh -NoProfile -File .\scripts\start-vcp.ps1
```

如需停服，先完成上面相同的状态/归属确认和 `$node`、`PM2_HOME` 设置，然后只执行下面这一行；停服后不要再执行启动脚本：

```powershell
& $node .\node_modules\pm2\lib\binaries\CLI.js stop vcp-main vcp-admin
```

## 频繁更新：统一使用 VCPUpdater

旧的 `自动更新.bat` 与 `update_with_no_dependency.bat` 已停用，不再作为更新入口。VCPToolBox 的更新请从 `F:\VCP\VCPUpdater\start-vcp-updater.cmd` 或 VCPUpdater 的 `npm run start:desktop` 开始；不要通过旧 BAT 绕过工作区、冲突或基线检查。

VCPUpdater 当前本机 MVP 只负责：读取状态、查看上游、在仓库外准备候选、展示变化/冲突，以及在工作区干净且基线未漂移时应用简单候选。它不会自动安装依赖、构建原生模块、停启 VCPToolBox 服务、执行复杂恢复或向远程 push。

依赖和编译需要根据候选的真实变化另行评审，不能按“大更新/小更新”或旧 BAT 的默认行为自动执行：

| 本次变化 | 当前处理 |
| --- | --- |
| 普通 JavaScript、提示词、文档或测试 | 先在候选中查看；当前 MVP 不自动安装依赖或重编译。 |
| `package.json` / `package-lock.json` | 标记为需要单独依赖评审；未取得额外授权前不运行 npm 安装。 |
| Node 主版本、原生模块 ABI 或操作系统架构改变 | 标记为运行时迁移；未取得额外授权前不切换 Node 或重建模块。 |
| Rust 源码、Cargo 配置或构建输入改变 | 标记为构建评审；未取得额外授权前不执行 Rust 构建。 |
| 管理前端源码没有对应 `dist` | 标记为前端构建评审；未取得额外授权前不生成产物。 |

## 测试与回退

VCPToolBox 的启动检查仍使用本文件前面列出的官方 `start-vcp.ps1` 只读检查；VCPUpdater 的隔离测试和工程检查在 `F:\VCP\VCPUpdater` 内执行。任何测试都不得把旧 BAT 当作更新流程重新运行。

本批次旧入口的有效恢复来源是：

```text
F:\VCP\.vcpupdater-state\migrations\20260927-1325-toolbox-b1\manifest.json
```

恢复前必须核对 manifest、原文件副本 SHA256、当前目标文件是否仍是本批次改写结果，以及当前工作区是否有新的用户修改。只恢复明确的授权路径，不执行整仓 `git reset --hard`、`git clean` 或覆盖数据库、向量索引、插件配置。历史路径 `F:\VCP\startup-backup-20260923-1516` 当前不存在，不能作为恢复来源，也不能据此创建目录或停启服务。
