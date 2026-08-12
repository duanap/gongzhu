# EdgeOne + 宝塔生产部署手册

生产域名：`https://hearts.duanap.cn`

本文件是游戏服务的唯一详细部署流程。README 只提供快速入口；若两处命令不一致，以本文件为准。

## 当前发布边界

- `/` 保持旧版稳定客户端。
- `/vue/` 保持 Vue 灰度入口。
- 未完成 Android Chrome、iPhone Safari 和公网真实账号验收前，不把 `/` 切换到 Vue。
- 发布代码不等于正式切换入口，部署脚本也不得修改该产品边界。

生产链路固定为：

```text
EdgeOne → 宝塔 Nginx → 127.0.0.1:3000 → PM2 hearts → Node.js
```

必须保持：

- Node.js 22.13 或更高版本。
- PM2 进程名 `hearts`。
- `instances: 1`、`exec_mode: fork`，不能启用 cluster。
- WebSocket 正式路径 `/ws`；兼容旧缓存期间继续允许 `/`。
- 生产运行数据与代码发布包分离。

## 发布物约定

每次更新必须交付两个相互匹配的文件：

```text
hearts-by-duanap-<version>-<date>-<commit>-deploy.tar.gz
deploy-hearts-<version>-<date>-<commit>.sh
```

部署包必须来自一个已提交的 Git 快照，不能直接压缩脏工作区。部署包不得包含：

- `.env` 或真实凭据。
- 根目录 `data/`、`uploads/`、`public/uploads/`。
- `node_modules/`。
- `.git/`、`graphify-out/`、Playwright 报告和 E2E 截图。
- 服务器备份、日志或数据库文件。

部署脚本必须写死对应包名、版本号和 SHA-256，并具备：

- 在临时目录解压、安装、测试和构建。
- 镜像源失败时回退 npm 官方源。
- 切换代码前停止旧进程。
- 保留 `.env`、`data/`、`uploads/`、`public/uploads/`。
- 将旧应用目录移动到 `backups/`。
- PM2 启动失败或健康检查失败时自动恢复上一版本。
- 检查本机 `/healthz`、双入口和 `/ws`。

## 最近一次已验证发布物

以下发布物于 2026-08-02 完成离线验证，并于 2026-08-09 部署到生产灰度环境：

```text
Git 分支：codex/migration-recovery
Git 提交：c1daa56f7c1f7bdb983936b07d62ac5e01d686b1
部署包：hearts-by-duanap-1.4.22-20260802-c1daa56-deploy.tar.gz
部署包 SHA-256：41744a40bb35b574ef32beb1904511201c83a39eee96e1fc2c06921623c23cfb
部署脚本：deploy-hearts-1.4.22-20260802-c1daa56.sh
部署脚本 SHA-256：d7c0080401779ab16eb4aac578c428efdf5860354e9bcd9752b6585420d799cb
```

该发布物已在独立临时目录执行 `npm ci`、CSS 检查、34 项测试和 Vue 构建。

### 2026-08-09 生产灰度部署记录（迁移前）

- 部署目录：`/www/wwwroot/hearts.duanap.cn/hearts-by-duanap`。
- 部署前备份：`/www/wwwroot/hearts.duanap.cn/backups/hearts-by-duanap-20260809-175326`。
- PM2：`hearts` 在线，单实例 fork，部署后重启次数为 0。
- 本机源站：健康检查、旧版入口、Vue 入口和 WebSocket smoke 7/7 通过。

以上为目录统一前的历史记录。后续运行目录、发布物和备份分别使用本手册第三节规定的 `apps/`、`artifacts/` 和 `archive/` 路径。
- 公网：健康检查、WebSocket 和新版带哈希资源均可访问，`/` 仍为旧版，`/vue/` 仍为灰度入口。
- 运行数据：部署脚本已保留生产 `data/`；服务器当时没有 `.env` 文件，因此不存在 `.env` 覆盖。
- 公网 `check:vue-cutover` 为 5/7：EdgeOne 将 `/`、`/vue/` 和 `/sw.js` 的最终 `Cache-Control` 统一覆盖为 `max-age=0`。Node 源站策略正确，部署时没有擅自修改 EdgeOne 或宝塔 Nginx。

这次记录证明代码发布、进程启动、源站检查和公网基本链路已完成，不代表 Android/iPhone 真机、真实 QQ 账号、多人完整牌局或回滚演练已经通过，也不解除根路径切换的 NO-GO 结论。EdgeOne 缓存规则仍需按本文“九、Nginx 与 EdgeOne”修正并重新跑公网 smoke。

## 一、发布前检查

在开发机项目根目录执行：

```bash
git status -sb
git branch --show-current
git log -1 --oneline
npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
npm run check:css
npm test
npm run build:client
git diff --check
```

启动本地服务后，另开终端执行：

```bash
npm run check:vue-cutover
```

检查必须确认：

- `/` 仍返回旧版入口。
- `/vue/` 返回 Vue 构建产物。
- 两个 HTML 入口使用短缓存。
- `/sw.js`、`/qq-callback.html`、`/api/me` 不缓存。
- `/ws` 可以创建并关闭房间。

提交并推送发布分支后，再以提交哈希制包。不要把 `graphify-out/` 或其他本地未跟踪目录加入提交。

## 二、从提交快照生成部署包

下面的命令以当前提交为源，并排除不需要进入服务器的 E2E 目录：

```bash
RELEASE_VERSION="$(node -p "require('./package.json').version")"
RELEASE_COMMIT="$(git rev-parse --short=7 HEAD)"
RELEASE_DATE="$(date +%Y%m%d)"
RELEASE_ARCHIVE="/mnt/h/hearts-by-duanap-${RELEASE_VERSION}-${RELEASE_DATE}-${RELEASE_COMMIT}-deploy.tar.gz"

git archive --format=tar --prefix=hearts-by-duanap/ HEAD -- . ':(exclude)tests' \
  | gzip -9 > "$RELEASE_ARCHIVE"

gzip -t "$RELEASE_ARCHIVE"
sha256sum "$RELEASE_ARCHIVE"
tar -tzf "$RELEASE_ARCHIVE" | sed -n '1,80p'
```

再确认归档中没有运行数据或开发产物：

```bash
if tar -tzf "$RELEASE_ARCHIVE" \
  | rg '^hearts-by-duanap/(\.git/|\.env$|node_modules/|graphify-out/|data/|uploads/|public/uploads/|tests/|test-results/|playwright-report/)'; then
  echo "部署包包含禁止发布的路径" >&2
  exit 1
fi
```

这条检查应没有输出。`.env.example` 和 `src/client/src/data/` 属于源码，不等同于生产 `.env` 或根目录运行数据。

最后将归档解压到独立临时目录，重新运行 `npm ci`、`npm run check:css`、`npm test` 和 `npm run build:client`。只有从归档重新验证通过，才生成匹配的部署脚本。

部署脚本作为发布附件与压缩包一起交付，不要求长期存放在仓库中；但其文件名、版本和内置 SHA-256 必须与本次部署包完全对应。

## 三、服务器前置检查

宝塔服务器需要安装 Nginx、Node.js 和 PM2。上传前先确认：

```bash
node --version
pm2 --version
nginx -t
```

Node.js 必须是 22.13 或更高版本。发布物目录为：

```text
/www/wwwroot/duanap/artifacts/hearts
```

当前应用目录为：

```text
/www/wwwroot/duanap/apps/hearts/hearts-by-duanap
```

不要提前解压部署包到当前应用目录。将部署包和脚本原样上传到发布物目录，由脚本在临时目录处理。

## 四、上传并执行当前发布物

通过宝塔文件管理器或 SCP，把以下两个文件上传到 `/www/wwwroot/duanap/artifacts/hearts/`：

```text
hearts-by-duanap-1.4.22-20260802-c1daa56-deploy.tar.gz
deploy-hearts-1.4.22-20260802-c1daa56.sh
```

服务器执行：

```bash
cd "/www/wwwroot/duanap/artifacts/hearts"

chmod 750 deploy-hearts-1.4.22-20260802-c1daa56.sh

sha256sum hearts-by-duanap-1.4.22-20260802-c1daa56-deploy.tar.gz
sha256sum deploy-hearts-1.4.22-20260802-c1daa56.sh

bash ./deploy-hearts-1.4.22-20260802-c1daa56.sh
```

运行前人工比对输出与“最近一次已验证发布物”的两个 SHA-256。文件名或校验值不一致时停止，不要继续部署。

脚本依次执行：

1. 校验部署包 SHA-256、Node.js 版本和 `package.json` 版本。
2. 在发布物目录创建唯一临时发布目录。
3. 安装完整依赖，运行 CSS 检查、测试和 Vue 构建。
4. 裁剪开发依赖。
5. 停止旧 `hearts` 进程，复制运行环境和运行数据。
6. 将旧应用目录移动到 `/www/wwwroot/duanap/archive/hearts/` 下带时间戳的备份目录。
7. 切换新目录，使用 `ecosystem.config.js` 启动 PM2 并保存进程表。
8. 检查本机健康接口和带生产 Origin 的 WebSocket。
9. 尝试公网健康与双入口检查；公网异常会明确提示继续检查 EdgeOne/Nginx。

## 五、部署后验收

先检查进程和本机源站：

```bash
pm2 status hearts
pm2 logs hearts --lines 100
curl -fsS http://127.0.0.1:3000/healthz
curl -I http://127.0.0.1:3000/
curl -I http://127.0.0.1:3000/vue/
```

再检查公网：

```bash
curl -i https://hearts.duanap.cn/healthz
curl -I https://hearts.duanap.cn/
curl -I https://hearts.duanap.cn/vue/
curl -I https://hearts.duanap.cn/sw.js
curl -I https://hearts.duanap.cn/qq-callback.html

cd /www/wwwroot/duanap/apps/hearts/hearts-by-duanap
CHECK_WS_ORIGIN=https://hearts.duanap.cn npm run check:vue-cutover
BASE_URL=https://hearts.duanap.cn npm run check:vue-cutover
```

自动检查通过后仍需人工验证：

- `/` 打开旧版，`/vue/` 打开 Vue 版。
- 创建/加入房间、AI 补位、传牌、出牌和收墩。
- 手机横屏设置弹窗、互动和出牌按钮。
- 断网重连。
- 真实 QQ 登录、排行榜和最近对局。

## 六、运行数据保护

以下内容属于生产运行数据，必须跨版本保留：

- `.env`。
- `data/hearts.sqlite`，以及运行期间可能存在的 `-wal`、`-shm` 文件。
- `data/users.json`，作为旧数据导入源和 JSON 后端紧急回退文件。
- `data/ai-learning-state.json`。
- `uploads/`、`public/uploads/`。

不要在 PM2 运行时只复制一个 SQLite 主文件；必须同时处理 WAL 状态。部署脚本会先停止旧进程，再复制整个 `data/` 目录。

首次迁移旧 AI 状态时，在应用目录执行：

```bash
mkdir -p data
if [ ! -f data/ai-learning-state.json ] && [ -f src/server/ai-learning-state.json ]; then
  cp src/server/ai-learning-state.json data/ai-learning-state.json
fi
```

首次启用 SQLite 前，停止写入并备份整个运行目录：

```bash
cd /www/wwwroot/duanap/apps/hearts/hearts-by-duanap
mkdir -p data /www/wwwroot/duanap/archive/hearts
pm2 stop hearts
tar -czf "/www/wwwroot/duanap/archive/hearts/runtime-data-$(date +%Y%m%d-%H%M%S).tar.gz" data
DATA_BACKEND=sqlite DATABASE_FILE=/www/wwwroot/duanap/apps/hearts/hearts-by-duanap/data/hearts.sqlite pm2 start ecosystem.config.js --update-env
pm2 save
```

紧急切换 `DATA_BACKEND=json` 只作为数据库故障回退；该模式下管理 API 不可用，不能替代正常应用版本回滚。

## 七、回滚

部署过程中任一安装、测试、启动或健康检查失败，脚本会自动：

1. 停止失败的新进程。
2. 将失败的新应用目录移动到 `/www/wwwroot/duanap/archive/hearts/hearts-by-duanap-failed-<时间戳>`。
3. 把部署前备份恢复到固定应用目录。
4. 使用原 `ecosystem.config.js` 恢复 PM2 并保存进程表。

如果部署成功后才发现业务回归，先执行只读检查：

```bash
cd /www/wwwroot/duanap/archive/hearts
find . -maxdepth 1 -type d -name 'hearts-by-duanap-*' -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort
pm2 status hearts
```

确认准确的上一版本备份目录后，再人工停止进程、保存当前失败版本、恢复该完整备份目录并启动 PM2。不要用未核对的通配符或“最新目录”自动替换生产目录。

回滚后重新执行本机 `/healthz`、公网双入口和 `check:vue-cutover`。

## 八、PM2 约束

标准命令：

```bash
cd /www/wwwroot/duanap/apps/hearts/hearts-by-duanap
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
pm2 startup
```

不能将实例数增加到 2 或切换为 cluster。实时房间和牌局状态保存在单个 Node.js 进程内存中，多实例会把同一房间的玩家分散到不同进程。

如果服务器仍保留旧进程名 `hearts-online`，只在确认新 `hearts` 进程已正常运行后删除旧进程。

## 九、Nginx 与 EdgeOne

宝塔 Nginx 使用 `deploy/nginx-location.conf`。关键要求：

- 反向代理到 `127.0.0.1:3000`。
- `/ws` 开启 WebSocket；仓库内 Nginx 模板使用 75 秒读超时，EdgeOne 自定义 WebSocket 超时设置为 120 秒。Node.js 每 10 秒发送 ping，因此正常连接不会触发这两个空闲超时。
- 兼容旧 HTML 缓存时，根路径 WebSocket 也继续代理。
- `/ws`、`/healthz`、`/readyz`、`/sw.js`、`/qq-callback.html` 和 `/api/*` 不缓存。
- Node.js 每 10 秒发送 WebSocket ping。

源站缓存策略：

- `/index.html`、`/vue/index.html`：浏览器重新验证，EdgeOne 缓存 60 秒。
- `/sw.js`、`/qq-callback.html`、`/api/*`：不缓存。
- `/manifest.webmanifest`：浏览器 1 小时，EdgeOne 1 天。
- 带版本的静态资源：一年并使用 `immutable`。
- 其他静态资源：浏览器 1 天，EdgeOne 7 天。

EdgeOne 应优先遵循源站 `Cache-Control`。如果节点缓存与浏览器缓存分别配置，必须同时检查；`EO-Cache-Status: HIT` 只表示边缘节点命中，不代表浏览器收到正确 TTL。

修改 Nginx 后：

```bash
nginx -t && nginx -s reload
curl -I https://hearts.duanap.cn/
curl -I https://hearts.duanap.cn/sw.js
curl -I https://hearts.duanap.cn/api/me
```

`deploy/nginx-location.conf` 会通过 `X-Origin-Cache-Control` 暴露上游策略。如果该头正确，但最终 `Cache-Control` 仍是 `max-age=0`，说明 EdgeOne 覆盖了浏览器缓存策略；将浏览器缓存改为遵循源站，并为 `/api/*`、`/sw.js`、`/qq-callback.html` 设置 bypass 或不缓存。

## 十、管理员首次创建

只在服务器受保护终端中注入管理员引导变量：

```bash
export ADMIN_BOOTSTRAP_USERNAME='admin'
export ADMIN_BOOTSTRAP_PASSWORD='replace-with-a-long-random-password'
export ADMIN_BOOTSTRAP_ROLE='super_admin'
pm2 restart hearts --update-env
```

密码至少 12 位，不得写入 Git、README、部署包或公开命令记录。引导逻辑只创建不存在的账号，不覆盖已有账号。管理接口说明见 `docs/ADMIN_API.md`。

## 参考资料

- [腾讯 EdgeOne WebSocket 超时](https://www.tencentcloud.com/document/product/1145/46303)
- [腾讯 EdgeOne 节点缓存 TTL](https://www.tencentcloud.com/document/product/1145/47665)
- [腾讯 EdgeOne 浏览器缓存 TTL](https://www.tencentcloud.com/document/product/1145/47667)
