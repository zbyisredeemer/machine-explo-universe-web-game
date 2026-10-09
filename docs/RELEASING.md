# 构建、部署与发行

## 从干净源码开始

开发依赖：Node 22.13+（22 或 24+）、npm、Python 3.10+。验证/打包自动查找 Python；Windows 支持 `py -3` / `python3` / `python`，也可用 `PYTHON` 指定可执行文件。

```sh
npm ci
npx playwright install chromium
npm run release
```

Linux CI 首次使用 `npx playwright install --with-deps chromium`。已安装浏览器时可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`，否则使用与锁文件 Playwright 匹配的浏览器。测试不自动查找个人目录。

`release` 先执行 `verify`，再执行 `package`。验证拥有两个随机端口的子进程，不接管现有开发/游玩服务；无论通过或失败都清理。输出记录在 `test-results/verification.json`。任一检查失败都不生成有效的新验证证据。

发行包在 `artifacts/`：

- `alien-body-<version>-offline.zip`：构建、许可、文档和三平台启动器，不含依赖目录和开发服务。
- `alien-body-<version>-source.zip`：可重新安装/构建的源码、锁文件、测试、CI 与文档。
- `SHA256SUMS.txt`：ZIP 校验值；`verification.json`：验证环境、时间、源文件/构建/报告校验值。

`npm run package` 可复用当前验证，但必须逐文件匹配，新增、删除或修改源码/构建/报告均拒绝。报告不是签名证明，维护者仍应保护构建环境。

## 离线启动

解压离线 ZIP 后，macOS 双击 `启动游戏.command`；Windows 双击 `start-game.cmd`；Linux 运行 `sh start-game.sh`。需 Python 3.10+，无需 Node、在线账号或互联网。请勿直接双击 `dist/index.html`；浏览器模块需要 HTTP 地址。

默认地址 `http://127.0.0.1:4174`。端口占用时会显示实际地址，地址改变意味着浏览器存档隔离。升级前从旧地址导出，再在新版本导入。要固定端口并在冲突时退出：

```sh
python3 scripts/serve.py --port 4174 --strict-port
```

## 公网静态部署

执行 `npm run build` 后，仅部署 `dist/` 到支持 HTTPS 的静态托管；相对资源路径支持 `/games/alien/` 等子目录。目录 URL 保留结尾 `/`。不要将源码目录、测试报告、`node_modules` 或本地启动器暴露为站点根目录。Vite dev/preview 和 Python 启动器均不作为公网服务。

建议托管平台设置：

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
```

HTML 与 build-info 禁止长期缓存；带 hash 的 assets 可长期缓存。若商店要求 iframe 嵌入，按其受信任域调整 `frame-ancestors` 和 X-Frame-Options 后重新测试；不要直接删除全部安全策略。托管访问日志由部署者另行披露。

## 开源仓库与版本

源码仓库为 [zbyisredeemer/machine-explo-universe-web-game](https://github.com/zbyisredeemer/machine-explo-universe-web-game)，主分支为 `main`。依赖目录、构建、测试输出和发行 ZIP 通过 `.gitignore` 排除；首次推送会触发 GitHub Actions。维护者可按协作需要启用私密漏洞报告和分支保护。版本号以 `package.json` 为准；发布标签需严格匹配 `v<version>`。

CI 最小权限为 contents:read，生成可下载构建产物，不自动把尚未审批的候选版公开到商店或创建正式 GitHub Release。维护者验证候选包后，把 ZIP 和 SHA256SUMS 上传为所选平台的发行附件。

许可证正文见 LICENSE；Three.js 许可随构建与 ZIP 分发。新增素材须逐项记载来源和权利。商用验收边界见 [QUALITY](QUALITY.md)。

参考：[Vite 静态部署](https://vite.dev/guide/static-deploy.html)、[Playwright CI](https://playwright.dev/docs/ci)、[MIT 原文](https://opensource.org/license/mit)。
