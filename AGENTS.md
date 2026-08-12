# AGENTS.md

本文件给 Codex 和其他自动化协作者使用。修改本项目时，优先遵守这里的约束，再参考 README。

## 项目概况

- 这是一个 Node.js + WebSocket 的红心大战联机游戏。
- 服务端入口是 `server.js`，实时房间和牌局状态保存在 Node.js 进程内存中。
- 旧版稳定客户端入口是 `public/index.html`，线上根路径 `/` 当前仍应指向旧版。
- Vue 新客户端源码在 `src/client/src/`，构建产物输出到 `public/vue/`，灰度入口是 `/vue/`。
- 生产部署使用 EdgeOne + 宝塔 Nginx + PM2，PM2 配置在 `ecosystem.config.js`。
- 产品名是 `Hearts by duanap`；npm 包名使用 `hearts-by-duanap`；PM2 进程名使用 `hearts`。

## 关键约束

- 不要把 `/` 直接切到 Vue，除非明确要求执行正式切换。
- PM2 必须保持 `instances: 1` 和 `exec_mode: 'fork'`，不能改成 cluster。
- WebSocket 正式路径是 `/ws`；兼容旧缓存时可保留 `/` WebSocket。
- 默认生产监听地址是 `127.0.0.1:3000`，由 Nginx 反代到公网。
- 文档和源码统一使用 UTF-8。不要引入乱码文案。
- 不要提交或写入真实密钥、Cookie、QQ access token、服务器私有配置。
- 当前目录可能不是 git 仓库；修改前先确认文件状态，不要覆盖用户手动改动。

## 常用命令

```bash
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
npm run build:client
npm test
npm run check:vue-cutover
```

生产重启：

```bash
pm2 start ecosystem.config.js
pm2 restart hearts --update-env
```

正式发布不要在生产目录直接 `git pull`。从已提交并推送的 Git 快照生成部署包和匹配脚本，上传到 `/www/wwwroot/duanap/artifacts/hearts/` 后执行；应用运行目录是 `/www/wwwroot/duanap/apps/hearts/hearts-by-duanap`，历史版本和运行数据备份存入 `/www/wwwroot/duanap/archive/hearts/`。部署包必须排除 `.env`、根目录 `data/`、上传目录、`node_modules/`、E2E 截图和 `graphify-out/`，脚本必须保留运行数据并支持失败自动回滚。完整流程以 `deploy/EDGEONE.md` 为准。

公网 smoke：

```bash
BASE_URL=https://hearts.duanap.cn npm run check:vue-cutover
```

## 修改指南

- 服务端规则改动优先补充或更新 `src/server/*.test.js`。
- Vue 客户端改动后至少运行 `npm run build:client`，上线前再运行 `npm run check:vue-cutover`。
- 影响房间、重连、AI 接管、甩牌、出牌合法性时，需要完整打一局或补自动化验证。
- 修改部署相关内容时同步检查 `README.md`、`deploy/EDGEONE.md`、`ecosystem.config.js`。

## 当前上线测试策略

- 先灰度测试 `https://hearts.duanap.cn/vue/`。
- 保持 `https://hearts.duanap.cn/` 为旧版稳定入口。
- Vue 版上线测试重点：
  - 创建/加入房间、4 人自动开始、AI 补位。
  - 传牌、出牌、非法出牌提示、收墩、甩牌、下一局、再来一局。
  - 断线重连、离线玩家 AI 接管、纯 AI 座位申请接管。
  - QQ 登录、游客数据、排行榜、最近对局。
  - 桌面、手机竖屏、手机横屏下的布局和滚动。

## 已知迁移风险

- Vue 已自动覆盖全屏 API、系统横屏锁定尝试与 CSS 降级、清缓存、版本日志、音量滑条、互动音效、可筛选日志和完整牌桌快照。剩余风险集中在 Android/iPhone 真机的系统横屏、全屏、声音和动画表现，以及公网真实 QQ/数据流程、EdgeOne 缓存规则和正式根路径切换。
- 因此，未完成完整人工验收前，不建议把根路径 `/` 切到 Vue。
