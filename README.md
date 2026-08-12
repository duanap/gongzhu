# 拱猪 · Gongzhu by duanap

四人在线拱猪游戏。服务端使用 Node.js + WebSocket，客户端使用 Vue 3，规则版本为 `gongzhu-v1`。

## 已实现

- 4 位房间号、邀请加入、AI 补位、掉线后 AI 继续出牌及原座位重连。
- 服务端发牌、秘密亮牌、20 秒超时不亮、统一公开、合法出牌、收墩、计分和终局判定。
- 亮猪 `S12`、亮羊 `D11`、亮红 `H14`、亮变 `C10`。
- 复用 Hearts 项目的四座位牌桌、桌面全屏布局、手机横屏布局、房间弹层、中央出牌区和底部扇形手牌；仅将规则交互替换为拱猪的亮牌、出牌与结算。
- `-1000` 触发整场结算；最高总分唯一者获胜，并列则逐副加赛。

完整规则见 [RULES.md](./RULES.md)，架构词汇见 [CONTEXT.md](./CONTEXT.md)。

## 本地开发

```bash
npm install
npm test
npm run build:client
npm run test:e2e:smoke
npm start
```

默认监听 `127.0.0.1:3010`，WebSocket 路径为 `/ws`。

## 部署

生产域名为 `gognzhu.duanap.cn`，PM2 进程名为 `gongzhu`。部署拓扑和回滚步骤见 [deploy/EDGEONE.md](./deploy/EDGEONE.md)。
