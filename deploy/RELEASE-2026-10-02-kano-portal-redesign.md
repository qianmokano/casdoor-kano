# Kano 通行证 · 门户重设计上线记录

日期：2026-10-02。生产已切换至 `v4.13.0-kano.4`。

## 交付与版本

- 公开门户：[auth.kanoapi.top](https://auth.kanoapi.top/)。客户账户中心：[账户与安全](https://auth.kanoapi.top/account)。管理员入口：[原管理控制台](https://auth.kanoapi.top/login/built-in)。
- [PR #3](https://github.com/qianmokano/casdoor-kano/pull/3) 以「静光」重做整个门户外观，合并为 `db6e811da`（2026-10-02T11:29:58Z）；[PR #4](https://github.com/qianmokano/casdoor-kano/pull/4) 修掉本次重做遗留的服务端 hero preload，合并为 `c46aed2ab`（2026-10-02T11:57:20Z）。
- 标签 `v4.13.0-kano.3` 打在 `db6e811da`，镜像 `ghcr.io/qianmokano/casdoor-kano@sha256:7a812ccb7074d1f58b128e009ac66f7510c93dbc5d88e8b1cb4dc35579c5a7f9`。
- 标签 `v4.13.0-kano.4` 打在 `c46aed2ab`，镜像 `ghcr.io/qianmokano/casdoor-kano@sha256:20258a623c8055e3dbb61f70bfe5f4f22103d044795f4223d14577c9391d21bc`。
- 两个标签均为新标签，未覆盖旧标签；镜像支持 `linux/amd64` 与 `linux/arm64`，VPS 拉取已实测。
- 标签工作流：[.3 Kano portal](https://github.com/qianmokano/casdoor-kano/actions/runs/37001438921) 与 [.3 Build](https://github.com/qianmokano/casdoor-kano/actions/runs/37001439032)；[.4 Kano portal](https://github.com/qianmokano/casdoor-kano/actions/runs/37003901389) 与 [.4 Build](https://github.com/qianmokano/casdoor-kano/actions/runs/37003901415)。全部通过。

## 最终行为

门户（首页、登录、找回密码、更新密码、账户中心、MFA 向导）统一为冷白「静光」皮肤，视觉令牌为 Porcelain `#FBFCFE`、Ink `#0F1722`、Mist `#5C6675`、Kano Blue `#2E6BFF`、发丝线 `#E4E9F1`。整页只有一个记忆点：首屏一颗缓慢呼吸的品牌蓝玻璃光球，由自研 fragment shader 光线步进渲染，带 CSS 径向渐变降级、DPR 上限 1.5 与离屏暂停。其余版面保持克制——sticky 毛玻璃顶栏、居中首屏（一句标题、一句说明、一个主按钮）、发丝线三列功能区、chevron 展开的 FAQ、账户页白底发丝线面板。原有的 ALL-CAPS eyebrow 标签、双栏首屏与 hero WebP 主视觉全部移除。

标签页标题改为按路由分节并随语言切换（首页为品牌名，其余为 `· 登录` / `· 账户与安全` / `· 双重验证`）。服务端渲染的首屏静态标题同步改为品牌名，避免水合前显示账户页标题。

管理控制台、`web-old`、Go 后端业务逻辑与路由未改动。

## 测试与生产回归

- 本地与 CI：`tsc --noEmit`、`eslint`、`vite build` 通过；`cypress/e2e/kano-portal.cy.js` 17/17 通过，覆盖 375/768/1440 布局（含 `documentElement.scrollWidth <= clientWidth` 断言）、减少动效、键盘可达性、登录页、账户中心、MFA 向导与 OIDC。新增 4 条标题断言；`TestKanoPublicIndexAssets` 改为在首页引用 hero 图或带账户页标题时失败。
- 生产验收：容器 `RestartCount=0`，日志无 panic/fatal；`/`、`/login/kano`、`/login/built-in`、`/.well-known/openid-configuration`、`/.well-known/jwks`、`/forget/kano` 均返回 200。首页 HTML 中 `hero-` 引用 0 次、`rel="preload"` 0 个、标题为品牌名、账户页标题出现 0 次。线上 CSS bundle 含 `kano-hero-glow`、`kano-primary-link`、`kano-auth-panel` 与 Kano Blue 令牌。
- 数据库：`PRAGMA integrity_check` 返回 ok；129 用户 / 3 应用 / 2 组织 / 5 提供方 / 1 证书，与上线前基线一致。
- 独立副本演练：用新镜像挂载恢复副本启动后，用户稳定标识与密码散列、应用与提供方接入凭据、证书私钥的前后 SHA-256 摘要完全一致，确认新版本不改动数据。

## 性能（含一处回归）

方法：同一台机器、同一 Lighthouse 13.5.0、同样的移动端模拟节流参数，通过 SSH 隧道分别指向 `.2` 与 `.4` 容器，排除公网差异；两者入口包仅相差 5 KB（`942,481` → `947,774` 字节）。

| 构建 | 性能 | TBT | LCP | Speed Index | FCP |
|---|---|---|---|---|---|
| 旧 `.2` | 89 | 130 ms | 3.3 s | 4.0 s | 1.7 s |
| 新 `.4` | 63 | 290 ms | 6.3 s | 5.7 s | 2.6 s |
| 新 `.4` + 强制减少动效 | 76 | 140 ms | 4.3 s | — | — |

主线程细分：脚本求值 294 → 599 ms，样式与布局 280 → 453 ms，Other 343 → 698 ms，渲染 87 → 149 ms；强制减少动效后回落至 338 / 335 / 276 / 61 ms。

结论：约一半差距来自持续动效（光球 rAF 循环与大面积辉光 keyframes），强制减少动效后 TBT 回到旧水平；其余来自额外的样式与布局，以及 sticky 顶栏的 `backdrop-filter` 毛玻璃。差距并非来自 JS 体积。

公网实测（2026-10-02T12:16:14Z，移动端）：性能 46、可访问性 100、最佳实践 100、SEO 92；FCP 2.3 s、LCP 5.2 s、Speed Index 7.2 s、TBT 1460 ms、CLS 0。公网数值同时受真实网络影响，与上表隧道测量不可直接比较。

待处理项（尚未实施）：移动端下调光球 DPR、将呼吸动画降至约 30 fps、削减或替换大面积辉光动画、评估毛玻璃顶栏的代价。`.2` 记录中的性能 86 与本表口径不同，不能与本次数值直接相减。

## 备份、恢复和运行状态

- 两次切换前各做一份停机备份：`/var/backups/casdoor/20261002T114520Z`（切 `.3` 前，1713 个文件，压缩包 724935 字节，SHA-256 `6247b38134c1914b26b078420d444c29cf2c7ec750c2b8dcf52af9adfc56ce63`）与 `/var/backups/casdoor/20261002T121316Z`（切 `.4` 前，1781 个文件，770072 字节，SHA-256 `0e5adc1819b93102c2f87db214061d982ca652690faea45e79e241253e78019e`）。两份均逐文件计算 SHA-256，打包解到独立目录后逐项复核一致，并对恢复出的 SQLite 执行 `PRAGMA integrity_check`。
- 回退引用：`casdoor-kano-rollback:20261002t114520z`（指向 `.2` 镜像）与 `casdoor-kano-rollback:20261002t121316z`（指向 `.3` 镜像）。`.1` 至 `.4` 镜像全部保留在本机。
- 切换只修改 `/opt/casdoor/docker-compose.yml` 的镜像行；挂载、配置与 Nginx/Certbot 均未改动。两次停机窗口各约一分钟，其余步骤（备份、校验、演练）在停机窗口内完成，符合运行手册。
- 演练与 A/B 测量使用的临时容器与目录已删除；生产容器在验收后 `RestartCount=0`、状态正常。
