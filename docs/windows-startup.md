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

## 频繁更新：何时需要安装或重新编译

仓库更新仍以根目录 `更新流程完整指南.txt` 为唯一流程依据，本节只补充运行时注意事项，不取代保护、提交、合并和推送规则。

**不要按“大更新/小更新”决定是否全部重编译，应按实际改动判断：**

| 本次变化 | 需要的处理 |
| --- | --- |
| 普通 JavaScript、提示词、文档或测试 | 通常不安装依赖、不编译原生模块；代码更新后重启并验证。 |
| `package.json` / `package-lock.json` | 按指南使用与启动相同的 Node 运行 npm 安装/校验。原生包可能下载适配的预编译文件，或由安装脚本编译，不等于全部 Rust 组件都要重建。 |
| Node 主版本/原生模块 ABI 或操作系统架构改变 | 先做原生模块加载检查；不匹配时重新安装或重建受影响的模块。Node-API 模块不一定随 Node 大版本改变而重建，不能一概而论。 |
| `rust-vexus-lite` 的 Rust 源码、Cargo 配置或构建输入改变 | 需要匹配这些变更的可用编译产物；上游未提供适合当前平台的产物时，再构建该组件。 |
| 已使用的 Rust 插件源码改变 | 只处理该插件需要的编译产物，不因未启用插件的提示而编译所有插件。 |
| 管理前端源码改变且未附带新 `dist` | 按前端构建流程生成对应产物；这与后端 Node 原生 ABI 是两件事。 |

当前机器固定使用 `.vcp-runtime/runtime.json` 中的真实 Node 路径。不要在 22 和 24 之间随意切换，也不要用 PATH 中另一个 Node/npm 安装后再交给当前启动器运行。如果上游明确提高运行时最低版本，应把运行时升级、依赖处理和原生加载测试作为一次完整迁移，而不是只改启动路径。

本次（2026-09-23）合并到上游 `ea8129c7`，合并提交 `5bb70d97`：新增 3 个上游提交，仅修改 JEV 规划器、工具执行器、一个提示词和对应测试。依赖清单、Rust 与启动器均未变化，所以未执行安装或重编译。JEV 测试 31/31、启动回归 23/23 通过。

需要特别区分两个现有脚本：

- `update.bat` 是全量更新脚本，会直接执行依赖安装和多项 Rust 构建，不能把它理解成每次普通更新都必须运行的步骤。
- `自动更新.bat` 的依赖检测使用了未加 `--quiet` / `--exit-code` 的 `git diff`；这不能可靠地用返回码判定是否有差异。按权威指南执行时，应检查真实文件变化，不能照着该提示无条件安装。本轮没有修改这份本地私有更新脚本。

以后可以直接要求 AI：**“按《更新流程完整指南》更新，先备份私人配置、选择性提交允许的代码，保留本地启动修复；根据实际差异处理依赖，安装与启动使用同一 Node；最后测试、重启验收并按指南推送。”** 不需要每次手动全量编译，也不需要为不用的插件清空所有告警。

## 测试与回退

```powershell
pwsh -NoProfile -File .\scripts\test-start-vcp.ps1 -IncompatibleNodePath 'D:\nodejs\node.exe'
```

测试不依赖 Pester，不启动、停止或重启真实应用；覆盖语法、预检、ABI、端口/进程归属和错误 HTTP 响应。`-IncompatibleNodePath` 可省略。

修改前的原批处理、`ecosystem.config.js`、`.gitignore` 备份保存在本机 `F:\VCP\startup-backup-20260923-1516`。如需回退，先按上面范围明确的命令停止本项目两项应用，再恢复备份中的批处理及 ecosystem；新增助手不再被旧入口调用，可先保留。建议保留 `.gitignore` 中 `.vcp-runtime/` 的忽略项，避免提交运行状态。不要执行整仓 `git reset` 或删除数据库、向量索引、插件配置。回退恢复的是旧行为，不代表旧启动问题会消失。
