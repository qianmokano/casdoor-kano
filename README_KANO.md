# Kano 通行证

此 fork 以 Casdoor `v4.13.0`（`c9adca039f3c24b570567e0def8d1018e9194c9f`）为基线，为 `kano` 普通用户提供公开门户和独立账户安全页面。管理员继续使用 Casdoor 原控制台。

维护分支为 `kano/main`，官方仓库保留为 `upstream`。上游升级应单独创建分支，检查认证接口及数据库迁移，完成本地测试和两站集成回归后再合并，不直接移动已发布标签。

## 用户功能

- 暖白首页、中文默认界面、响应式原创 3D 主视觉，以及统一登录、注册和找回密码布局。
- 普通用户登录后进入 `/account`，支持独立提交昵称、裁剪上传头像和验证当前密码后改密。
- 邮箱和邮箱验证状态可查看；客户不能通过用户更新或邮箱重置接口修改邮箱或身份标识。
- 验证器绑定要求服务端会话中的密码确认、动态码验证及已发出的绑定信息；恢复码只在绑定阶段展示。
- 关闭所有 MFA 需要本人会话、当前密码和已启用因素的验证码或恢复码。恢复码登录后，同一浏览器可在五分钟内用该恢复码及密码关闭丢失的因素，证明随后被消耗。
- 已有邮箱、短信等 MFA 保留关闭与首选设置；首版新增绑定只提供验证器。

两站共用身份，订单、余额、API Key 和业务会话由各站管理。页内代理登录不会自动建立 Casdoor 浏览器会话。既有 OIDC 应用上下文、state、PKCE、回调和 subject 保持原流程。

## 本地验证

```sh
go test ./controllers ./object -tags skipCi -run 'Test(Kano|IsKano|CheckKano)' -coverprofile=coverage.out
python3 deploy/check_coverage.py coverage.out
cd web
yarn install --frozen-lockfile
yarn typecheck
yarn lint
yarn build
```

`deploy/test_portal.py` 只接受 localhost 测试实例。它使用 `init_data.json` 的本地默认管理员建立临时用户和 SMTP 接收器；邮件不会发往外部邮箱。应对独立数据库运行，不能指向生产数据库或生产邮件配置。启动参数见 `.github/workflows/kano.yml`。

`web/cypress/e2e/kano-portal.cy.js` 检查客户界面、错误重试、MFA 向导、头像裁剪、OIDC 回调、键盘和 375/768/1440px 布局；`login.cy.js` 回归原管理员登录。上游完整 Go 测试另需 MySQL 5.7，由原 `Build` 工作流执行。

## 发布与运行

功能分支提交经 PR 合并到 `kano/main` 前，须通过原 `Build` 与 `Kano portal` 工作流。合并后创建未使用过的 `v4.13.0-kano.*` 标签，`Kano portal` 再次验证并发布 `ghcr.io/qianmokano/casdoor-kano:<tag>` 的 amd64/arm64 镜像。部署、完整备份与恢复步骤见 [部署手册](deploy/README.md)。

继续保留上游 Apache License 2.0 许可证及相关版权声明。Kano 修改在新增文件或本记录中标明，依赖遵循各自许可证。原创主视觉由 imagegen 生成，响应式资源位于 `web/public/kano`，最终提示词与实施依据见 [分析记录](deploy/ANALYSIS-2026-10-02-kano-portal.md)。
