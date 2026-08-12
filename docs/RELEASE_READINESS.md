# Vue 迁移发布评估

评估日期：2026-08-09

## 当前结论

**NO-GO：继续保留 `/` 旧版稳定入口，仅在 `/vue/` 灰度验证。**

本轮补齐了房间弹窗、移动端互动、出牌/传牌按钮、收墩轨迹、背景音乐和设置面板布局回归。旧版与 Vue 设置面板现在使用同一三行布局，左右卡片接近等宽，并由自动化检查控件越界、横向溢出和文字裁切。严格的 `844×390` 移动 Chrome 横屏证据会同时校验 window、viewport、screen、方向媒体查询、根节点 0° 旋转和 PNG 尺寸，但仍不能替代 Android Chrome 与 iPhone Safari 物理设备。

## 已达到

- 根路径与灰度入口保持并行，未把 `/` 切到 Vue。
- 四真人完整牌局、断线重连、AI 托管/取回、纯 AI 座位申请、甩牌和射月已有自动流程。
- 上一墩、完整牌桌、整场排名/重开和非法操作已有旧版/Vue 双入口契约。
- 设置、真实音效调用、动画速度、互动设置、规则、可筛选出牌日志、完整版本日志、战绩入口、横屏/全屏 API 与清缓存已有自动覆盖。
- 全局断线/重连提示在桌面弹窗、真实手机横屏和 CSS 横屏降级中均已验证位于最高提示层。
- 离线真人既支持超时自动托管，也支持房主在房间面板中手动接管；纯 AI 座位审批同样合并到房间面板。
- 桌面和手机不展示常驻关键事件栏，继续保留即时事件播报；按需打开的出牌日志支持全部、出牌、收墩、传牌和房间筛选，结算“查看牌桌”、调试预览和房间遮罩关闭均已统一到旧版契约。
- 关键牌局、AI 学习和工具面板已有严格横屏 PNG 与方向 JSON；组件复核见 `docs/LEGACY_COMPONENT_AUDIT.md`。
- 本地生产 smoke 保证 `/` 仍是旧版、`/vue/` 并行、缓存头正常且 `/ws` 可创建/关闭房间。
- 发布分支 `codex/migration-recovery` 已推送提交 `c1daa56f7c1f7bdb983936b07d62ac5e01d686b1`，草稿 PR #2 仍以 `main` 为目标；该提交尚未合并到 `main`。
- 已生成并独立验证 `hearts-by-duanap-1.4.22-20260802-c1daa56-deploy.tar.gz`，部署包 SHA-256 为 `41744a40bb35b574ef32beb1904511201c83a39eee96e1fc2c06921623c23cfb`。匹配脚本为 `deploy-hearts-1.4.22-20260802-c1daa56.sh`，脚本 SHA-256 为 `d7c0080401779ab16eb4aac578c428efdf5860354e9bcd9752b6585420d799cb`。
- 2026-08-09 已在当时的生产目录执行匹配脚本，备份位于 `/www/wwwroot/hearts.duanap.cn/backups/hearts-by-duanap-20260809-175326`；PM2 单实例 fork 在线，本机 smoke 7/7，通过公网健康检查、WebSocket 和新版资源访问。该记录反映迁移前状态；后续运行目录、发布物和备份分别使用 `/www/wwwroot/duanap/apps/hearts/hearts-by-duanap`、`/www/wwwroot/duanap/artifacts/hearts` 和 `/www/wwwroot/duanap/archive/hearts`。
- 公网 `check:vue-cutover` 当前为 5/7：EdgeOne 把 `/`、`/vue/` 和 `/sw.js` 的最终缓存头覆盖为 `Cache-Control: max-age=0`。源站策略正确；缓存规则修复、连续 smoke、完整多人流程和回滚演练仍待完成。

## 本地自动质量门

2026-08-09 当前证据：

- `npm test`：34 项通过，覆盖服务端规则、身份、持久化、AI、客户端设置、背景音乐和日志处理。
- 设置面板相关 Playwright：桌面旧版/Vue 2/2、`844×390` 物理横屏旧版/Vue 2/2、Vue 手机横竖屏滚动 2/2 通过。
- `npm run build:client`：通过；Vue 构建不再读取 `public/index.html`。
- `npm run check:vue-cutover`：本地真实服务 7/7 通过，新增共享发布信息一致性检查。
- 部署包已在独立临时目录重新执行 `npm ci`、`npm run check:css`、`npm test` 和 `npm run build:client`，均通过。
- 生产源站 `check:vue-cutover` 7/7；公网为 5/7，失败项仅为 EdgeOne 覆盖入口与 Service Worker 缓存头，不能记录为公网全通过。
- 此前完整玩法、动画、重连和 CSS 降级自动基线继续保留，但本次没有重新执行全部 E2E 项目。
- 手机横屏自动证据使用 `844×390`，并同时断言浏览器窗口、网页 viewport、模拟设备 screen、方向媒体查询、系统方向、页面根节点 0° 旋转和 PNG 宽高。
- CSS 旋转降级使用独立竖屏窗口和独立快照，未混入物理横屏验收结果。
- `npm run build:client` 与本地 `npm run check:vue-cutover` 仍是提交前必跑项；通过记录只代表本地门槛，不替代下列真机和公网门槛。

## 切换阻塞项

- [ ] `docs/DEVICE_ACCEPTANCE.md` 的 Android Chrome 真机流程通过并归档录像/截图。
- [ ] `docs/DEVICE_ACCEPTANCE.md` 的 iPhone Safari 真机流程通过并归档录像/截图。
- [ ] 系统横屏锁定、全屏和实际听感在两台真机上通过。
- [ ] EVENT-02/04/05/06 的 Android/iPhone 实体手机录像和动画流畅度通过；本地双入口与严格横屏自动证据已完成。
- [ ] DATA-02 及 DATA-03 公网真实账号/真实数据等待验项清零；DATA-01 本地稳定性与旧身份迁移已完成。
- [ ] QQ 登录、游客升级、排行榜、最近对局在公网真实账号下通过，且不记录真实 Cookie/token。
- [ ] 修正 EdgeOne 浏览器缓存规则，使 HTML 短缓存、`/sw.js` 不缓存，并让公网 `check:vue-cutover` 7/7 通过。
- [ ] 公网 EdgeOne + Nginx + PM2 环境完成连续 smoke、断网重连和回滚演练。
- [x] 已在迁移前目录 `/www/wwwroot/hearts.duanap.cn` 执行已验证部署脚本，并记录 PM2、本机健康检查、公网双入口和备份目录；后续发布物在 `/www/wwwroot/duanap/artifacts/hearts` 执行。

执行顺序以 `docs/LEGACY_PARITY_MATRIX.md` 的“剩余项处理顺序”为准：先完成本地双入口自动基线，再进行公网真实账号验证，最后进行 Android/iPhone 真机和生产回滚演练。

## 获准切换后的步骤

1. 先发布本地已验收构建到 `/vue/`，不改根路径。
2. 完成双真机与公网多人验收，保存证据并清零矩阵。
3. 建立 `/legacy/` 可回滚入口，确认 HTML 短缓存和静态资源长缓存策略。
4. 执行根路径切换后立即跑公网 `BASE_URL=https://hearts.duanap.cn npm run check:vue-cutover` 和一局多人 smoke。
5. 任一关键流程失败，立即把 `/` 回滚到旧版；不要用线上热修掩盖未通过的验收项。
