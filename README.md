# dsh-llm-headers

给 DeepSeek Harness 的模型请求注入自定义 HTTP 请求头的 bundle 插件（软替换：独立设置区块，与官方 Models 页共存）。

## 它能做什么

- **三层 headers 表**：`global`（所有请求）→ `providers`（按 provider 路由）→ `models`（按 `provider/model`，最细粒度），优先序 model > provider > global，逐级回退。
- **设置界面**：以 `settings.section` 插槽注册「请求头」区块（id `request-headers`），编辑即时经 `api.settings.mutate` 落盘到命名空间 `dsh-llm-headers`（带 expectedRevision；host 半边多 provider 实例注册 + `scope.watch` / `document-updated` 热重载）。
- **两条注入通道**（见下文「原理」）：
  1. **fetch 包装层**：监听 `llm/stream` waterfall，用 `AsyncLocalStorage` 把 `provider`/`model` 传进异步链，包装 `globalThis.fetch` 按命中层合并头 —— 对 fetch 直连路径生效；
  2. **llm-pi-ai provider headers 通道（真实发到 openai SDK 的通道）**：`llm-pi-ai.providers.<route>.headers` 经 pi-ai 的 openai SDK `defaultHeaders` 原样上线 —— **这才是端到端验证过的通道**（经反代实测：`User-Agent: opencode/1.18.18` 真实出现在请求里，429 消失）。
- **fill 合并**：默认 `false = 覆盖`同名头（适配器强制注入的 `user-agent` 也能改）；`fill: true` 保留适配器已有同名头。
- **安全**：值须为非空字符串且不含 CR/LF（防 header 注入）；hosts 为空时仅跳过 `.local`，**回环不跳过**（本地反向代理如 `127.0.0.1:11434` 正是常见注入目标）。
- **生命周期**：卸载 / HMR 时还原原 fetch；多实例（多 app 链）下每个实例叠自己的包装、身份守卫还原，卸载级联不会误杀仍在使用的注入链。

## 快速开始

前置：Node ≥ 20（`install.mjs` 无需 pnpm；`dsh plugin` 方式需要 pnpm）。

```bat
:: 方式一：复制脚本到 %TEMP% 运行（免 pnpm）
copy /Y install.mjs uninstall.mjs %TEMP%\
node %TEMP%\install.mjs --source C:\路径\到\dsh-llm-headers

:: 方式二：克隆到 %TEMP% 直接装
git clone https://github.com/mc-lhz/dsh-add-headers-to-completions.git %TEMP%\dhdr
cd %TEMP%\dhdr && node install.mjs

:: 方式三：pnpm 方式（开发期，link 改动即生效）
dsh plugin --profile web add link:C:/路径/到/dsh-llm-headers
```

装完三步：**重启 dsh web**（主进程）→ 浏览器硬刷新（Ctrl+F5）→ 配置（见下）。

> 两个 harness 本地补丁必须先在目标机打上（见「harness 补丁」节），否则设置区块报「命名空间不可用」、UA 也无法覆盖。

## 配置

### 界面

设置 → **请求头** 区块：三层编辑器（global / providers / models），改动即落盘。

### YAML 直写

```yaml
dsh-llm-headers:            # 命名空间：UI 读写这里（fetch 层通道）
  global:
    x-edge: proxy-1
  providers:
    acme-gateway:
      x-company: acme
  models:                   # key 必须是 "provider/model"
    acme-gateway/gpt-5:
      x-model-trace: t1
  hosts:                    # 目标主机后缀；空 = 除 .local 外全部（回环放行）
    - api.deepseek.com
  fill: false               # false=覆盖同名头（默认）；true=保留适配器头

llm-pi-ai:                  # 真实通道（pi-ai openai SDK 请求）——按 provider 配 headers
  providers:
    opencode-reverse-proxy:
      headers:
        User-Agent: opencode/1.18.18
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `global` | `Record<string,string>` | 所有请求注入 |
| `providers` | `Record<string, Record<string,string>>` | 按 provider 路由注入 |
| `models` | `Record<'provider/model', Record<string,string>>` | 按模型注入（最细粒度） |
| `hosts` | `string[]` | 目标主机后缀；空 = 除 `.local` 外全部（回环放行） |
| `fill` | `boolean` | 默认 `false`（覆盖同名头）；`true` 保留适配器头 |

## 原理（两条通道，为什么 UA 需要补丁）

1. **fetch 包装层**：适配器内部 fetch 所在异步链经 `AsyncLocalStorage` 传 `provider`/`model`，包装器按命中层合并头。**局限：pi-ai 的真实请求由官方 openai SDK（`new OpenAI({..., defaultHeaders})`）发出，不经过全局 fetch —— 该层对 SDK 请求不可见**（已用探针证实：包装器稳定挂载，但 SDK 请求带的是 attribution 的 UA）。
2. **provider headers 通道（真实可靠）**：`llm-pi-ai.providers.<route>.headers` → 适配器 `requestHeaders()` 合并 → SDK `defaultHeaders` 原样上线。这是端到端实测通道（反代日志确认 `User-Agent: opencode/1.18.18` 到达，429 消失）。

`user-agent` 是 harness attribution 的保留名，适配器 `requestHeaders()` 默认硬删部署的 UA 再补 `deepseek-harness/...` —— 所以覆盖 UA 必须打补丁 #2。

## harness 补丁（必需，本地改动，升级 harness 后需重打）

**补丁 #1 —— 设置命名空间可见**（否则区块报「命名空间不可用」）：
apiproxy 对设置命名空间有硬编码白名单 `WEB_SETTINGS_NAMESPACES`，非模型类命名空间不在白名单内就回答 `settings-not-exposed`。

```ts
// packages/host/apiproxy/src/api-proxy.ts —— WEB_SETTINGS_NAMESPACES
'dsh-llm-headers',
```

**补丁 #2 —— 放开 user-agent 覆盖**：
`llm-pi-ai/src/adapter.ts` 的 `requestHeaders()` 放开 `user-agent` 一个名字（部署显式配置的 UA 胜出；其余 attribution 名维持原优先级）：

```ts
// packages/llm/llm-pi-ai/src/adapter.ts —— requestHeaders()
// 部署显式配置的 user-agent 允许胜出；其余 attribution 名仍以 Harness 为准。
```

## 安装脚本

`install.mjs` / `uninstall.mjs`（免 pnpm，照 seki668/dsh-plugin-descriptions 做法）：

- `install.mjs`：把发行文件（`package.json#files` + package.json 本身，不复制 node_modules/.git）复制进 `%DSH_HOME%\profiles\<profile>\node_modules\dsh-llm-headers`，`createRequire` 做解析校验，再注册进 profile 的 `dsh.profile.bundles`。参数：`--profile <名>`（默认 web）、`--source <插件目录>`、`--copy-only`；支持 `DSH_HOME` 环境变量；BOM 容错、幂等。
- `uninstall.mjs`：删除 node_modules 副本 + 移除 bundles 条目；提示遗留配置与补丁还原。

```bat
node install.mjs --source C:\路径\到\dsh-llm-headers     :: 安装
node uninstall.mjs                                       :: 卸载
```

## 构建（client 半边）

node 半边 `index.js` 为手写零依赖 ESM，无需构建；只有 client 产物需要构建：

```sh
pnpm install        # devDeps: tsdown / react / react-dom / @types/react…
pnpm build          # tsdown → lib/client.js（ModuleLoader bundle，随包分发）
```

`lib/client.js` 为预构建产物（已提交）；克隆部署无需在此仓库构建。

## 冒烟测试

```sh
node --import tsx/esm smoke.test.mjs   # 在 dsh 安装目录下运行（tsconfig paths 生效）
```

当前 30/30 PASS，覆盖：host 命中注入、回环放行 / `.local` 跳过、无 init 注入、CRLF 过滤、
多实例卸载级联、llm/stream+ALS 三层回退、fill 与 override、settings 通道
（命名空间注册 / 叠加合并 / document-updated 重载 / llmHeaders 落盘）。

## 卸载 / 清理

```bat
node uninstall.mjs                      :: 或 dsh plugin --profile web remove dsh-llm-headers
```

可选清理：settings.yaml 里的 `dsh-llm-headers` 段与 `llm-pi-ai.providers.<路由>.headers`；
还原两个 harness 补丁（删除白名单行 / 恢复 `requestHeaders()` 原逻辑）。

## 限制

- **models 层**（按 `provider/model`）只在 fetch 层通道生效；llm-pi-ai 的 schema 只有 **provider 级** `headers`，模型级头无法经 SDK 通道上线。
- **user-agent 覆盖依赖补丁 #2**；其它 attribution 保留名（如 `x-harness-*` 之类）仍不可覆盖。
- 注入 `content-length` / `host` 等特殊头由使用方自行保证语义正确。