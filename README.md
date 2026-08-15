# dsh-llm-headers

给 DeepSeek Harness 的模型请求注入自定义 HTTP headers 的 bundle 插件（host 半边，软替换方案）。

- **三层 headers 表**：`global`（所有请求）→ `providers`（按 provider）→ `models`（按 `provider/model`，最细粒度），优先序 model > provider > global，逐级回退。
- **模型感知**：监听 `llm/stream` waterfall 捕获本次调用的 `provider` / `model`，用 `AsyncLocalStorage` 传入适配器内部 fetch 所在异步链，包装器据此选择 headers 层。
- **fill 合并**（默认）：已有同名头不覆盖，尊重 `authorization` 等适配器权威头；`fill: false` 切换为覆盖。
- **安全**：值必须是非空字符串且不含 CR/LF（防 header 注入）；默认跳过回环地址与 `.local`。
- **生命周期**：卸载 / HMR 时 `ctx.effect` 自动还原原 fetch；Symbol 标记防重复包装。

## 安装

```sh
dsh plugin --profile web add <本目录绝对路径>
```

```yaml
- insert:
    - id: llm-headers
      name: dsh-llm-headers
      config:
        hosts:                 # 后缀匹配；空 = 除回环 / .local 外全部命中
          - api.deepseek.com
        fill: true             # true=不覆盖已有同名头（默认）；false=覆盖
        global:                # 所有请求
          x-edge: proxy-1
        providers:             # 按 provider
          acme-gateway:
            x-company: acme
        models:                # 模型绑定（key 必须是 "provider/model"）
          acme-gateway/gpt-5:
            x-model-trace: t1
```

旧字段 `headers` 兼容为 `global`。重启后 bundle 自带的补丁行同样生效（profile 层同 id 行后发覆盖）。

## 配置

| 字段 | 类型 | 说明 |
|---|---|---|
| `global` / `headers` | `Record<string,string>` | 所有请求都注入 |
| `providers` | `Record<string, Record<string,string>>` | 按 provider 路由注入 |
| `models` | `Record<'provider/model', Record<string,string>>` | 按模型注入（最细粒度） |
| `hosts` | `string[]` | 目标主机后缀列表；空 = 除回环 / `.local` 外全部 |
| `fill` | `boolean` | 默认 `true`（不覆盖已有同名头）；`false` 覆盖 |

请求头键值须为非空字符串、不含 CR/LF；不限制具体头名（注入 `content-length`/`host` 等需自行保证语义正确）。

## 运行时服务

`apply` 注册 `llmHeaders` 服务（其它插件声明 `inject: ['llmHeaders']` 即可注入）：

- `get()` —— 当前三层表快照 `{ global, providers, models }`
- `set(next)` —— 热更新（下一次请求即生效，无需重载）
- `reset()` —— 清空三层表

## 验证

```sh
node smoke.test.mjs
```

覆盖：host 命中注入、回环跳过、无 init 注入、CRLF 过滤、防重复包装、卸载还原、
llm/stream+ALS 三层回退（模型绑定 / provider 回退 / global 兜底 / 无 store 走 global）、
fill 与 override、settings 通道（命名空间注册 / 叠加合并 / document-updated 重载 / llmHeaders 落盘）。
冒烟需在 tsx 下运行以解析 `@deepseek-ai/schemastery`：

```sh
node --import tsx/esm smoke.test.mjs   # 在 dsh 安装目录下运行（tsconfig paths 生效）
```

## 设置界面（client 半边，已实现）

以官方 `settings.section` 插槽注册独立"请求头"设置区块（id `request-headers`，与
官方 Models 页共存）：三层编辑器（global / providers / models），改动即时经
`api.settings.mutate` 落盘（带 expectedRevision）；host 半边注册同名命名空间
`dsh-llm-headers` 并监听 `settings/document-updated` 重载三层表——闭环：
edit → settings → document-updated → 下次模型请求生效。

- 客户端读取/写入：`src/client/scope.ts`（`api.settings.describe` / `mutate` + snapshot store）
- 区块组件：`src/client/HeadersSection.tsx`（本地草稿 + 即时提交）
- 文案：`src/client/locales.ts`（zh / en）；样式：`src/client/styles.ts`（TS 内嵌，自注入样式标签）

## 构建（client 半边）

node 半边 `index.js` 为手写零依赖 ESM，无需构建；只有 client 产物需要构建：

```sh
pnpm install        # devDeps: tsdown / react / react-dom / @types/react…
pnpm build          # tsdown → lib/client.js（ModuleLoader bundle，随包分发）
```

`lib/client.js` 为预构建产物（已提交）；`:package` 安装 / git 克隆部署时无需在此仓库构建。
注意：vendored 构建链路（tsdown 0.22 + rolldown 1.2.4）对 `.css` 走内置 asset 管线，
故样式不走 CSS Modules（源码见 `styles.ts` 说明）。

## 卸载

```sh
dsh plugin --profile web remove dsh-llm-headers
```

并移除 profile `cordis.patch.yml` 中对应 insert 行。