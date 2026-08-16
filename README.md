# dsh-llm-headers

给 DeepSeek Harness 的模型请求注入自定义 HTTP 请求头的 bundle 插件（软替换：独立设置区块，与官方 Models 页共存）。

## 它能做什么

- 像大模型请求注入自定义 HTTP 请求头，如 User-Agent、x-company、x-model-trace 等
- 支持全局、按 provider、按模型注入

## 安装

前置：Node ≥ 20（`install.mjs` 无需 pnpm；`dsh plugin` 方式需要 pnpm）。

1.克隆仓库/下载ZIP包
```bat
git clone https://github.com/mc-lhz/dsh-add-headers-to-completions.git
cd dsh-add-headers-to-completions
```
2.安装
```bat
node ./install.mjs
```
3.重启 dsh web
```bat
pnpm dsh web
```

装完三步：**重启 dsh web**（主进程）→ 浏览器硬刷新（Ctrl+F5）→ 配置（见下）。

> 两个 harness 本地补丁必须先在目标机打上（见「harness 补丁」节），否则设置区块报「命名空间不可用」、UA 也无法覆盖。

## 配置

### 界面

设置 → **请求头** 区块：三层编辑器（global / providers / models），改动即落盘。

### YAML 直写（高级）

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


## 卸载 / 清理

```bat
node uninstall.mjs                      :: 或 dsh plugin --profile web remove dsh-llm-headers
```

可选清理：settings.yaml 里的 `dsh-llm-headers` 段与 `llm-pi-ai.providers.<路由>.headers`；
还原两个 harness 补丁（删除白名单行 / 恢复 `requestHeaders()` 原逻辑）。

## 原理（两条通道，为什么 UA 需要补丁）

1. **fetch 包装层**：适配器内部 fetch 所在异步链经 `AsyncLocalStorage` 传 `provider`/`model`，包装器按命中层合并头。**局限：pi-ai 的真实请求由官方 openai SDK（`new OpenAI({..., defaultHeaders})`）发出，不经过全局 fetch —— 该层对 SDK 请求不可见**（已用探针证实：包装器稳定挂载，但 SDK 请求带的是 attribution 的 UA）。
2. **provider headers 通道（真实可靠）**：`llm-pi-ai.providers.<route>.headers` → 适配器 `requestHeaders()` 合并 → SDK `defaultHeaders` 原样上线。这是端到端实测通道（反代日志确认 `User-Agent: opencode/1.18.18` 到达，429 消失）。

`user-agent` 是 harness attribution 的保留名，适配器 `requestHeaders()` 默认硬删部署的 UA 再补 `deepseek-harness/...` —— 所以覆盖 UA 必须打补丁 #2。

## 限制

- **models 层**（按 `provider/model`）只在 fetch 层通道生效；llm-pi-ai 的 schema 只有 **provider 级** `headers`，模型级头无法经 SDK 通道上线。
- **user-agent 覆盖依赖补丁 #2**；其它 attribution 保留名（如 `x-harness-*` 之类）仍不可覆盖。
- 注入 `content-length` / `host` 等特殊头由使用方自行保证语义正确。

## 应用
- 接入opencode zen免费模型：
1. 新建自定义provider

- API 地址 https://opencode.ai/zen/v1
- API 协议 openai-completions
- 点击获取模型-全选-确定，手动删除后缀不为free的模型

2.配置全局headers

请求头-全局请求头 - +头名
- User-Agent: opencode/1.18.18

3.切换模型
切换到刚刚添加的模型（如deepseek-v4-flash-free），测试是否可以免费试用