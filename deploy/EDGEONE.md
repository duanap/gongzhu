# gognzhu.duanap.cn 部署契约

生产拓扑：EdgeOne → 宝塔 Nginx → `127.0.0.1:3010` → PM2 `gongzhu`。

## 路径

- 应用：`/www/wwwroot/duanap/apps/gongzhu/gongzhu-by-duanap`
- 部署包：`/www/wwwroot/duanap/artifacts/gongzhu`
- 归档：`/www/wwwroot/duanap/archive/gongzhu`

## 发布要求

1. 仅从已提交的 Git 快照生成部署包，排除 `.git`、`.env`、`node_modules`、测试结果和运行数据。
2. 上传到 artifacts 目录，解压到同级临时目录。
3. 在临时目录运行 `npm ci --omit=dev`；Vue 构建产物必须已包含在部署包中。
4. 原子替换应用目录；旧目录移动到 archive 下带时间戳的目录。
5. 执行 `pm2 startOrReload ecosystem.config.js --update-env`，确认单实例 fork、cwd 和 `127.0.0.1:3010`。
6. 将 `deploy/nginx-site.conf` 安装到宝塔 Nginx vhost 目录，创建对应 well-known 空配置，执行 `nginx -t` 后重载。
7. 验证 `/healthz`、根页面和 `/ws`，再验证公网域名。

## 回滚

停止 `gongzhu`，把失败版本移入 archive，将上一版本恢复到应用目录，再执行 `pm2 startOrReload ecosystem.config.js --update-env`。回滚后重新验证本机端口、Nginx 和公网。
