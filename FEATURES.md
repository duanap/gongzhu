# 红心大战 功能设计清单 (v1.4.17)

基于 `server.js` (2220行) + `public/index.html` (10665行) + `src/server/aiLearning.js` (289行) 实际代码整理。

---

## 一、房间管理

### 1.1 创建房间
- 客户端发送 `createRoom` 消息，携带 `clientId` + `nickname`
- 服务端调用 `createRoomId()` 生成房间号：优先从 `EASY_ROOM_IDS` 池随机选取叠数（AAAA/AABB/ABAB/ABBA 共 9+324=333 个），用完再随机 4 位数字
- 房间对象存储在全局 `rooms` Map 中，初始状态 `phase: 'lobby'`
- 创建者自动成为房主（`hostId`），座位 index 0
- 昵称：从 `HUMAN_NICKNAMES`（63 个三国角色名）随机分配，可手动修改，限 20 字节宽度
- 头像：从 `HUMAN_AVATARS`（12 个动物 Emoji）随机分配，同房间不重复

### 1.2 加入房间
- 客户端发送 `joinRoom`，携带 `roomId`（必须匹配 `/^\d{4}$/`）
- 加入时按优先级匹配身份：
  1. 已有在线座位（`clientId` 或 `reconnectToken` + 昵称匹配）→ 重连
  2. 被 AI 接管的座位（`takeoverFromName` 匹配 + token 匹配）→ `replaceTakeoverBotWithHuman()`
  3. 牌局已开始 / 房间已满 → 转为 `requestPureBotTakeover()` 申请接管纯 AI 座位
- 满 4 人自动调用 `startRound(room)`

### 1.3 房主机制
- `normalizeHost()` 检查房主是否在线，否则从上到下找第一个在线真人继承
- 房主操作权限：解散房间、AI 接管离线、AI 补位开始、批准接管申请、再来一局

### 1.4 房间超时清理
- `sweepExpiredRooms()` 每 30 秒扫描一次
- `ROOM_EMPTY_TTL_MS`（默认 5 分钟）：所有真人离线后开始计时，有真人重连则重置
- `ROOM_IDLE_TTL_MS`（默认 60 分钟）：`room.updatedAt` 无操作超时
- `closeRoom()` 向所有在线玩家发送 `roomClosed` 消息并从 `rooms` Map 删除

---

## 二、游戏流程

### 2.1 发牌 (`startRound` → `finishDeal`)
- 洗牌：Fisher-Yates 算法（`shuffle()`）
- 每人 13 张，发完后按花色顺序 + 点数排序（`sortHand()`）
- `phase: 'deal'` → 2150ms 后进入传牌或直接出牌
- 传牌模式 `passMode` 按 `(roundNo - 1) % 4` 轮转：向左/向右/对家/不传牌

### 2.2 传牌 (`submitPass` → `maybeCompletePass`)
- 每人选 3 张牌，AI 自动选（`choosePassCards()`）
- 所有人都选好后执行交换：`removeCardsByIds()` + 按方向 `PASS_DIRS` 接收
- 传牌记录：`room.lastPassCards` 存储每家传出的牌，`receivedCards` / `receivedFrom` 记录收到的来源
- 传牌动画层 `pass-flight-layer`：3 张小牌从发送方牌区飞向接收方牌区

### 2.3 出牌 (`playCard`)
- 服务端严格校验 `legalCards()`：
  - 首墩：只能出梅花 2
  - 非首墩无领出：红桃未破时不能主动出红桃（除非只能出红桃）
  - 跟牌：有同花色必须跟；没同花色可自由出
  - 首墩跟牌：不能出分牌（除非只能出分牌）
- 出牌后更新 `room.trick`，判断是否打完 4 张
- 红桃首次被打出触发 `heartsBroken` 事件

### 2.4 收墩 (`startTrickJudge` → `resolveTrick`)
- 判定阶段 `comparingTrick: true`，最大牌高亮动画 + "大" 标签 + 脉冲光效
- 900ms 后进入 `collectingTrick: true`，触发收墩飞行动画
- 1720ms 后 `resolveTrick()`：牌加入赢家 `taken` 数组，`round += points`
- 记录 `lastTrick` 供"上一轮"查看

### 2.5 局结束 (`finishRound`)
- `phase: 'roundEnd'`，统计每人本局得分
- 射月判定：`shooter` 索引（`round === 26`），其他三家各 +26 分
- 总分更新后检查 `>= 100` → `phase: 'gameEnd'`，最低分者获胜
- `buildRoundTableSnapshot()` 生成牌桌快照（各家手牌、传牌、传入、收分）

### 2.6 最后一张牌自动出 (`scheduleAutoLastCard`)
- 检测当前玩家只剩 1 张牌且只有 1 种合法出法
- 520ms 后自动打出，避免等待

---

## 三、AI 系统

### 3.1 出牌策略 (`chooseAICard`)

**跟牌逻辑：**
- 有同花色时：优先出比当前最大牌小的安全张；缺安全张时出最小大牌
- 首墩梅花 2 优先出最大梅花（`firstRoundHighDump`）
- 方片首次被领出且方片 ≤4 张时释放大方片
- 当前最大牌为 10 时，优先出 9/8/7 本墩安全张
- 有射月威胁时主动截胡（`over[0]`）

**缺门逻辑：**
- 优先甩黑桃 Q
- 其次甩危险大牌（rank ≥ 12 或黑桃 ≥ 11）
- 再甩高红桃（rank ≥ 8）
- 射月模式下优先出分牌

**领出逻辑 (`chooseLeadCard`)：**
- 射月模式：优先出分牌或最大牌
- 安全模式：从长门出低张，避免被迫收分
- 短门保留给后续垫分/避分

### 3.2 传牌策略 (`choosePassCards`)
- 危险值计算 `cardDangerValue()`：黑桃 Q +120、黑桃 A/K +46、红桃 +(22+rank)
- 射月骨架保护：具备 10/J/Q/K/A 套牌时不拆
- 短门策略 `suitVoidPlan()`：优先传走 1-3 张的花色形成缺门
- 梅花 2 保留（-120 权重）

### 3.3 射月判断 (`shouldTryShootMoon`)
- `hasMoonLaunchPattern()`：某花色 10/J/Q/K/A 齐全 + 其他花色 ≥2 张 K/A
- 保守条件：`roundScore ≥ 20` 时 `controlScore * moonAggression ≥ 4`
- 防射月 `findMoonThreat()`：某玩家吃分 ≥13 且占总分大部分

### 3.4 AI 思考延迟
- `scheduleBot()`：1700 + random(450) ms，模拟真人节奏

### 3.5 AI 学习系统 (`aiLearning.js`)
- 6 个自适应权重：`queenDanger`、`heartDanger`、`highRankDanger`、`moonAggression`、`moonDefense`、`voidSuitPass`
- 范围 [0.7-1.45]，每 24 个样本（`MIN_SAMPLES_TO_TUNE`）调一次权重
- 调整规则：平均墩分 >2.2 时增加危险权重；射月成功率 >12% 时降低攻击权重
- 对手画像：记录每位对手的传牌分、吃分、射月率、常缺花色
- 持久化：`ai-learning-state.json`，每 5 秒异步写入

---

## 四、互动系统

### 4.1 互动类型 (`normalizeInteractionPayload`)
| kind | icon | label |
|------|------|-------|
| emoji | 💬 | 表情 |
| flower | 🌹 | 送花 |
| tomato | 🍅 | 扔番茄 |
| like | 💙 | 点赞 |
| applause | 👏 | 鼓掌 |
| brick | 🧱 | 板砖 |
| slipper | 🩴 | 拖鞋 |
| cabbage | 🥬 | 大白菜 |
| doge | 🐶 | 狗头 |

### 4.2 快捷表情池 (`AI_RANDOM_INTERACTIONS`)
干得漂亮、哈哈哈、搞快点、小飞棍来喽、家人们谁懂啊、我要验牌、牌没有问题、小瘪三、小儿科、给我擦皮鞋 + 6 个道具

### 4.3 冷却机制
- 客户端维护每目标玩家独立冷却时间
- 服务端 `lastAIRandomInteractionAt`：AI 互动间隔 ≥16 秒

### 4.4 AI 自动互动触发
- **出牌时** (`maybeTriggerAIRandomInteraction`)：7.5% 概率
- **局结束时**：16% 概率
- **射月防御** (`maybeTriggerAIMoonGuardInteraction`)：怀疑/阻止射月时触发，整局 ≤3 条
- **墩事件** (`maybeTriggerAIInteractionForTrick`)：黑桃 Q 被他人收墩、单墩 ≥10 分、零分稳住

### 4.5 互动气泡动画
- 从发送方头像位置飞向接收方头像位置
- 横屏模式下坐标顺时针旋转 90°
- 牌桌右侧互动按钮 + 非模态小弹窗

---

## 五、特效与事件系统

### 5.1 事件等级 (`addSpecialEvent`)
| 等级 | CSS 类 | 时长 | 颜色 | 触发条件 |
|------|--------|------|------|----------|
| minor | green | 2.1s | 深绿 | 红桃已破 |
| highlight | blue | 2.1s | 蓝紫 | 黑桃女王入袋、二点吃分、零分过关 |
| epic | orange | 2.8s | 橙金 | 大祸临头(≥14分)、差点射月(25分)、红桃收集者(≥10张)、压轴自吃/甩锅 |
| legendary | gold | 3.6s | 金色 | 射中月亮(26分) |

### 5.2 事件飞行方向
- 从屏幕中心出现，按玩家方向飞出：
  - 本家：向下 (0, +Y)
  - 上家：向左 (-X, 0)
  - 对家：向上 (0, -Y)
  - 下家：向右 (+X, 0)
- 横屏时方向顺时针旋转 90°

### 5.3 收墩动画
- 三张小牌先叠到最大牌下方（`--gather-x/y`）
- 再整叠朝赢家牌区飞出（`--collect-x/y`）
- 到达屏幕边缘后淡出

### 5.4 换牌动画
- 传出去的牌：从手牌区飞向目标方向（`pass-flight-card`，1.68s）
- 换入的牌：从目标方向飞入手牌区，带闪烁提示 + "换入" 标签
- 横屏旋转适配

### 5.5 出牌动画
- 从手牌位置飞入牌桌 slot（`trickCardFlyIn`）
- 判定阶段最大牌脉冲光效 + "大" 标签
- 收墩阶段三阶段飞行：合牌 → 飞向赢家 → 淡出

---

## 六、UI 与响应式

### 6.1 响应式断点
| 断点 | 适配 |
|------|------|
| ≥1200px | 桌面宽屏：手牌加高、trick-area 加大、slot 外移 |
| 992-1199px | 桌面中屏 |
| 768-991px | 平板：seat 整体缩小 0.94x，对手牌堆缩小 0.72x |
| ≤900px | 移动端：avatar 缩小、字体缩小、center-ring 缩小 |
| ≤620px 竖屏 | 紧凑模式：100svh、slot 48x68px、card 38x56px |
| ≤430px 竖屏 | 极窄：center-ring 176px、card 34x50px |

### 6.2 横屏模式 (`body.force-landscape`)
- CSS `transform: rotate(90deg)` + `width: 100dvh; height: 100dvw`
- 所有元素尺寸缩小 70-82%
- 模态框也跟随旋转
- 优先使用系统横屏锁定，不支持时回退 CSS

### 6.3 夜间模式
- 低亮度蓝灰白风格
- 背景：`#142033` → `#9eb8cf` 渐变，`brightness(.82) saturate(.84)`
- 卡片/面板改为深灰蓝色调
- 红色提示保持不变

### 6.4 牌面增强
- 黑桃 Q：紫黑色渐变背景 + 紫色描边 + 白色字体
- 红桃手牌：红色描边 + "换入" 标签
- 不可出牌：`brightness(.56) saturate(.82)` 灰化
- 换入牌：绿色脉冲 + "换入" badge

### 6.5 设置面板 (6 个分区)
1. **视觉**：夜间模式、横屏模式
2. **音效**：出牌音效开关、互动音效开关
3. **互动**：互动特效开关、允许番茄开关
4. **版本**：当前版本号、更新日志
5. **信息**：开发者 QQ、QQ 群
6. **操作**：清缓存按钮、刷新按钮

### 6.6 指示器
- **出牌轮次**：弧形扇区 SVG 指向当前出牌玩家，72° 角
- **出牌日志**：表格形式，左侧轮次标签（颜色区分：出牌蓝、收墩金、传牌绿、发牌蓝、房间紫）
- **上一轮回看**：显示上一墩 4 家出牌、最大牌、收墩赢家、得分

---

## 七、网络与安全

### 7.1 WebSocket
- `ws` 库，心跳 25 秒 ping/pong
- 最大负载 64KB
- `verifyClient` 检查 `ALLOWED_HOSTS`
- 连接时设置 `setNoDelay(true)`

### 7.2 断线处理
- `close` 事件触发 5 秒宽限期（`DISCONNECT_GRACE_MS`）
- 宽限期内重连自动恢复
- 超时后标记离线，1 分钟后 AI 自动托管（`sweepAutoTakeovers`，每 10 秒扫描）
- 重连 token：`crypto.randomBytes(18).toString('base64url')`，32 字符

### 7.3 HTTP 安全
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: same-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- 静态文件 ETag + Cache-Control：index.html/sw.js no-cache，带 hash 的资源 immutable 1 年

### 7.4 健康检查
- `/healthz` + `/readyz`：返回 JSON（uptime、rooms 数、wsClients 数、host、protocol）

---

## 八、数据流

### 服务端 → 客户端（`broadcast` → `publicStateFor`）
每个玩家收到的数据包含：
- `yourIndex`：自己的座位号
- `reconnectToken`：重连凭证
- `phase`：当前阶段（lobby/deal/pass/play/roundEnd/gameEnd）
- `players[]`：每人信息（只有自己能看到手牌，其他只显示 `handCount`）
- `trick[]`：当前墩已出的牌
- `currentPlayer`：当前出牌者
- `legalCardIds`：合法出牌 ID 列表
- `specialEvents[]`：最近 10 条事件
- `interactions[]`：最近 30 条互动
- `lastTrick`：上一墩结果
- `roundTable`：局结束时的完整牌桌快照
- `log[]`：最近 200 条日志

---

## 九、WebSocket 消息协议

### 客户端 → 服务端
| type | 说明 |
|------|------|
| `hello` | 连接后握手，携带 clientId/reconnectToken/nickname/roomId |
| `createRoom` | 创建房间 |
| `joinRoom` | 加入房间，携带 roomId |
| `leaveRoom` | 退出房间 |
| `takeoverOffline` | 房主 AI 接管离线玩家 |
| `approveBotTakeover` | 房主批准接管 AI 座位 |
| `disbandRoom` | 房主解散房间 |
| `fillBotsAndStart` | AI 补位并开始 |
| `startGame` | 开始游戏 |
| `passCards` | 传牌，携带 cards 数组 |
| `playCard` | 出牌，携带 cardId |
| `interaction` | 发送互动 |
| `startNextRound` | 开始下一局 |
| `restartGame` | 再来一局（游戏结束后） |

### 服务端 → 客户端
| type | 说明 |
|------|------|
| `state` | 全量游戏状态（`publicStateFor` 生成） |
| `roomCreated` | 房间创建成功 |
| `roomClosed` | 房间已解散 |
| `leftRoom` | 已退出房间 |
| `botTakeoverPending` | 接管申请已发送 |
| `botTakeoverApproved` | 接管已批准 |
| `botTakeoverRejected` | 接管被拒绝 |
| `error` | 错误消息 |

---

## 十、环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `TRUST_PROXY` | '1' | 是否信任反向代理 |
| `ALLOWED_HOSTS` | 空 | 允许的域名白名单（逗号分隔） |
| `WS_HEARTBEAT_MS` | 25000 | WebSocket 心跳间隔 |
| `WS_MAX_PAYLOAD` | 65536 | WebSocket 最大消息大小 |
| `ROOM_EMPTY_TTL_MS` | 300000 | 全部真人离线后房间存活时间 |
| `ROOM_IDLE_TTL_MS` | 3600000 | 房间无活动超时 |
| `ROOM_SWEEP_INTERVAL_MS` | 30000 | 房间清理扫描间隔 |
| `OFFLINE_TAKEOVER_MS` | 60000 | 离线多久 AI 自动托管 |
| `OFFLINE_TAKEOVER_SWEEP_MS` | 10000 | AI 托管扫描间隔 |
| `DISCONNECT_GRACE_MS` | 5000 | 断线宽限期 |
| `AI_LEARNING_MIN_SAMPLES` | 24 | AI 学习最小样本数 |
| `AI_LEARNING_SAVE_INTERVAL_MS` | 5000 | AI 学习数据保存间隔 |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | 65000 | HTTP keep-alive 超时 |
