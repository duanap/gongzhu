# 旧版 / Vue 组件与功能复核

复核日期：2026-07-22。基准为旧版当前可达行为，不把旧版中没有入口的残留 DOM 当成迁移需求。

## 当前结论

本地可验证范围内，没有再发现“旧版存在且仍可达、Vue 完全缺失”的组件或功能。桌面与手机共用同一组房间、牌局、工具和数据组件；两端差异只保留在布局容器、尺寸、座位坐标和真机能力上。

| 旧版功能域 | Vue 实现 | 桌面/手机关系 | 结论 |
|---|---|---|---|
| 顶栏、全屏、房间、QQ、设置 | `DesktopTable` / `MobileTable` | 行为相同，布局不同 | 已迁移；手动横屏按钮按产品决定删除 |
| 创建、加入、玩家状态、房主操作、退出/接管 | `RoomPanel` | 共用组件 | 已迁移 |
| 座位、头像、记分牌、对手牌背、中央牌桌 | `Seat`、`OpponentHand`、`TableCenter`、`GameInfoPanel` | 共用组件，坐标由桌面/手机 CSS 控制 | 已迁移 |
| 传牌、合法/非法出牌、提示和自己的手牌 | `PlayerHand` | 共用组件 | 已迁移 |
| 出牌、比牌、收墩、甩牌 | `TrickArea`、`TableCardFlowOverlay`、`TableSweepCollectOverlay`、`SweepOfferModal` | 共用组件 | 已迁移 |
| 上一墩、牌桌回看、局末/整场结算 | `LastTrickPopover`、`RoundDetailPanel`、`ResultPanel` | 共用组件 | 已迁移 |
| 轮到我、红桃破、黑桃 Q、射月、互动动画 | `YourTurnReminder`、`BroadcastOverlay`、`TableInteractionEffects`、`InteractionFab` | 共用组件 | 已迁移 |
| 设置、规则、版本、调试、战绩 | `SettingsPanel`、`HelpPanel`、`DebugPanel`、`UserDataPanel` | 共用组件，外层弹窗布局不同 | 已迁移 |
| AI 学习 | `AiLearningPanel` | 共用组件 | 已补齐旧版 3 项统计、6 项权重、对手倾向和近期样本 |
| 断线、重连和全局错误 | `GlobalNoticeLayer` + socket 状态 | 共用状态，统一最高提示层 | 已迁移 |

## 明确的产品例外

- Vue 不提供手动横屏按钮、出牌日志、独立 AI 接管弹窗和常驻关键事件历史；这是后续明确要求，不是漏迁移。
- Vue 对手牌背最多显示 4 张；左右家牌堆放在记分牌下，对家牌堆放在头像左侧；桌面本家头像向左移动。这些位置由几何测试约束，不再按旧版 13 张扇形回退。
- 旧版 `interactionModal` 仍保留 DOM 和函数，但当前入口只打开快捷表情菜单或头像道具菜单；Vue 对齐的是这条实际可达路径。
- 背景音乐在旧版和 Vue 都仍是“预留”，不计为 Vue 单边缺失。

## 仍需外部环境完成

以下不是本地缺失组件，但在完成前仍不能把 `/` 切到 Vue：

1. 公网真实 QQ 登录、游客升级、退出和登录恢复。
2. 公网真实排行榜、战绩和最近对局数据核对。
3. Android Chrome 与 iPhone Safari 实体设备的系统横屏锁定、全屏、声音、动画流畅度和断网重连。
4. EdgeOne + Nginx + PM2 公网连续 smoke 与回滚演练。

自动化横屏使用 `844×390`，同时校验浏览器窗口、网页 viewport、screen、方向 API、根节点 0° 旋转和 PNG 尺寸；它能防止“窗口横、网页竖”或 CSS 旋转冒充，但仍不等同于实体手机验收。
