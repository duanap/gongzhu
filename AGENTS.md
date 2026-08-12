# AGENTS.md

本项目是 Node.js + WebSocket + Vue 3 的四人在线拱猪游戏。

## 固定契约

- 产品名：`拱猪 · Gongzhu by duanap`。
- npm 包：`gongzhu-by-duanap`；规则：`gongzhu-v1`；PM2：`gongzhu`。
- Vue 是唯一客户端，生产根路径 `/` 直接提供 Vue 构建。
- WebSocket 只使用 `/ws`。
- 生产监听 `127.0.0.1:3010`，PM2 必须保持单实例 fork。
- 房间和实时牌局在内存中，不得使用 cluster。
- 不提交密钥、Cookie、服务器私有配置或运行数据。

## 修改与验证

- 规则改动先更新 `src/server/games/gongzhu/*.test.js`。
- 客户端改动后运行 `npm run build:client`。
- 影响房间、亮牌、重连、AI 或出牌时运行 `npm run test:e2e:smoke`。
- 交付前至少运行 `npm test`、`npm run build:client` 和 `npm run test:e2e:smoke`。

生产发布使用已提交的 Git 快照生成包，不在生产目录执行 `git pull`。目标、归档和回滚流程见 `deploy/EDGEONE.md`。
