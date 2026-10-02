# Kano 通行证门户实施记录

日期：2026-10-02。用户已授权实施完整门户改版、独立 fork、测试、CI、镜像发布及备份后生产切换。

## 基线与范围

- Fork：[qianmokano/casdoor-kano](https://github.com/qianmokano/casdoor-kano)，本地 `/Users/qianmokano/Code/casdoor-kano`。
- 基线：官方 `v4.13.0`，提交 `c9adca039f3c24b570567e0def8d1018e9194c9f`。默认维护分支 `kano/main`，功能分支 `kano/account-security`，保留官方 `upstream`。
- 面向 `kano` 普通用户提供公开首页、统一认证布局及账户中心；管理员维持原控制台。昵称、头像、密码、验证器 MFA 可操作；邮箱及稳定身份标识不可由客户修改。
- 不新增身份表，不改变 subject、OIDC 应用凭据、签名密钥或业务站点数据。现有 dujiao 工作区未改动。

## 已检查的实现与依据

- `AccountPage` 直接复用 `UserEditPage self`，不适合精简客户界面；新客户页面独立实现，复用现有上传、裁剪、密码及认证组件。
- `AuthLayout` 已统一登录、注册及密码恢复页面，适合作为 Kano 品牌布局的接入点；其他组织和管理页面保留既有行为。
- `RequireAuth` 依赖上次登录组织；客户 `/account` 需固定选择 `kano`，管理员登录继续使用 `/login/built-in`。
- `UpdateUser` 支持指定 `columns` 的字段更新；客户昵称使用此能力，避免提交整份用户对象。
- `ResetEmailOrPhone` 有组织修改规则校验，但必须增加 Kano 后端策略，不能仅隐藏邮箱输入框。
- `DeleteMfa` 原接口不验证密码和动态码；Kano 客户需要本人校验、现有密码限流及 MFA 验证限流。绑定向导还需在服务端关联密码确认、待绑定秘密和已验证结果，防止直接调用开启接口绕过页面步骤。

## 主视觉

通过内置 imagegen 工具生成原创银白与半透明材质的 3D 图，并用 cwebp 转换为 480、768、1280px 响应式 WebP，保存于 `web/public/kano`。文字使用 HTML。

最终提示词："Create an original premium abstract 3D still life: a single luminous frosted glass sphere held in a gently curved brushed silver loop, with two smaller translucent elements subtly connected around it, expressing one unified identity connecting services. Warm white studio background close to #F7F6F2; silver, pearl white and clear glass; soft diffuse light and delicate grounded shadows; wide 3:2 composition; generous breathing room; no text, logos, watermark or UI."

## 验证与下一步

本地真实 API 测试十组通过，覆盖邮箱验证码注册、找回密码、昵称及身份字段策略、头像上传、改密、MFA 绑定与关闭、恢复码登录和恢复关闭、同组织跨用户拦截、已有邮箱因素管理，以及 OIDC PKCE、nonce 和稳定 subject。新增控制器策略模块语句覆盖率 96%，对象策略模块 100%；并非整个上游包的覆盖率。

前端类型检查、lint 和生产构建通过，新增翻译通过上游重复键检查。独立实例的移动 Lighthouse 测得性能 90、可访问性 100、最佳实践 100、SEO 92，CLS 为 0；该结果是本地生产构建的测量，线上需在发布后再核对。布局截图已检查 375/768/1440px。

生产只读核对确认原实例为官方 4.13.0、129 个身份、2 个组织和3个应用，当前没有 Storage 提供方和资源持久挂载。正式切换前需要补齐头像存储及会话持久化，并把 Email 项的修改权限收紧为 Admin。保留用户身份、原密码散列、应用凭据和签名材料，按部署手册停写备份、恢复验证后切换。

Chrome 客户界面测试 15 项通过，管理员登录回归 4 项通过；涵盖实际裁剪组件、恢复码确认、错误重试、OIDC 页面回调、原生 Enter 键操作与减少动态效果。完整本地门户已在 Codex 浏览器展示，生产实例尚未切换。

下一步：推送 PR 并等待 CI，通过后发布固定镜像；上线记录单独存档。

生产配置、数据库、上传文件及凭据不进入 Git。本文件不含密码、令牌、密钥或 SMTP 授权码。
