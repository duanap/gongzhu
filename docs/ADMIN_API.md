# 管理 API

管理接口基址为 `/api/admin/v1`，用于后续后台管理平台对接。接口契约见 [OpenAPI](./openapi/admin-v1.yaml)。当前项目只提供后端接口，不包含管理员网页。

## 安全模型

- 管理员身份与玩家 QQ 身份完全分离。
- 登录成功后使用 `HttpOnly`、`SameSite=Strict` 管理会话 Cookie。
- 除登录外的接口必须携带管理会话；写操作还必须携带 `X-CSRF-Token`。
- 修改用户状态、解散房间必须携带全局唯一的 `Idempotency-Key`，并填写操作原因。
- 角色分为 `super_admin`、`operator`、`viewer`；查看玩家手牌等敏感实时信息仅允许 `super_admin` 显式请求。
- 所有成功的管理写操作记录请求 ID、管理员、IP、原因和变更前后快照。

## 首次配置

首次启动前仅在服务器环境中设置：

```bash
export ADMIN_BOOTSTRAP_USERNAME='admin'
export ADMIN_BOOTSTRAP_PASSWORD='请替换为至少12位的随机强密码'
export ADMIN_BOOTSTRAP_ROLE='super_admin'
pm2 restart hearts --update-env
```

账号只会在用户名不存在时创建，环境变量不会覆盖或重置已有密码。创建成功后仍建议把密码保存在服务器的密钥管理或受保护环境配置中，不要写入代码、部署包或命令历史。

## 登录示例

```bash
curl -sS -c /tmp/hearts-admin-cookie \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"替换为实际密码"}' \
  https://hearts.duanap.cn/api/admin/v1/auth/login
```

响应中的 `csrfToken` 用于管理写操作，Cookie 文件仅用于本次示例。管理平台应在同源页面中以 `credentials: "same-origin"` 调用接口。

## 当前边界

已经覆盖总览、用户查询与停权/封禁、对局查询、实时房间查询与解散、AI 学习摘要、审计日志和 SSE 快照。管理员增删、角色调整、密码轮换、批量操作、排行榜配置和内容配置尚未开放远程 API；这些属于后台平台第二阶段，应在明确运营规则后增加，不能直接暴露数据库通用 CRUD。
