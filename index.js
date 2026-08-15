/**
 * dsh-llm-headers — 给模型请求注入自定义 HTTP headers 的 DSH bundle 插件（host 半边）。
 *
 * 统一方案（软替换）：
 *   1) 三层 headers 表：global（所有请求）/ providers（按 provider）/ models（按 provider/model，最细粒度）
 *      —— 优先序 model > provider > global，逐级回退。
 *   2) llm/stream waterfall 监听：读取 options.provider / options.model，
 *      用 AsyncLocalStorage 把当前调用的标识传入同一异步链（适配器内部 fetch 所在）。
 *   3) fetch 包装器：hosts 过滤 → als.getStore() 查三层表 → 合并进 init.headers
 *      （默认 fill：已有同名头不覆盖，尊重 authorization 等适配器权威头）。
 *   4) settings 通道（client 区块 ↔ host）：注册命名空间 'dsh-llm-headers'
 *      （schema 经 @deepseek-ai/schemastery，source-launch 下由 tsx paths 解析），
 *      section = config（默认值）上叠加设置值；settings/document-updated 触发重载。
 *      注册失败则回退 config 模式，插件仍可用。
 *
 * 除 schemastery 外零第三方依赖（node:async_hooks 为内置）；无需构建。
 * 卸载 / HMR 时 ctx.effect 自动还原原 fetch 并解除监听（ctx.on 随 fiber 自动回收）。
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export const name = 'dsh-llm-headers'

export const inject = ['settings', 'loader']

const MARK = Symbol.for('dsh.llmHeaders.wrapper')
const als = new AsyncLocalStorage()

/** 尽力加载 schemastery（built 安装或纯 node 下可能不可解析 → null）。
 * 注意导出形态：vendored 版本把 z 作为 default 导出（官方一律 `import z from '@deepseek-ai/schemastery'`）。 */
async function loadSchemastery() {
  try {
    const mod = await import('@deepseek-ai/schemastery')
    return mod.default ?? mod
  } catch {
    return null
  }
}

/** 从 fetch 入参解析 hostname；无法解析（blob:/data:/畸形输入）返回 null。 */
function hostnameOf(input) {
  const raw = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input && typeof input.url === 'string'
        ? input.url
        : undefined
  if (typeof raw !== 'string') return null
  try {
    return new URL(raw).hostname
  } catch {
    return null
  }
}

/** 命中规则：hosts 列表做后缀匹配（大小写不敏感，可带前导点）。
 * 空列表时仅跳过 .local（保守默认），其余全部放行 —— 包括 127.0.0.1 /
 * localhost / ::1：本地反向代理（如 llm-pi-ai baseURL 指向 127.0.0.1:11434）
 * 正是注入目标的常见形态，跳过回环会让 headers 永远到不了模型提供方。 */
export function matches(hostname, hosts) {
  const h = String(hostname).toLowerCase()
  if (hosts.length === 0) {
    if (h.endsWith('.local')) return false
    return true
  }
  return hosts.some((entry) => {
    const rule = String(entry).toLowerCase().replace(/^\./, '')
    if (rule.length === 0) return false
    return h === rule || h.endsWith('.' + rule)
  })
}

/** 校验并规范化一份 headers 映射（保留非空字符串与 CR/LF 防护；不限制具体头名）。 */
function sanitizeHeaders(raw, log) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || value.length === 0) {
      log?.warn?.(`[dsh-llm-headers] skip "${key}": 值必须是非空字符串`)
      continue
    }
    if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) {
      log?.warn?.(`[dsh-llm-headers] skip "${key}": 含换行（防 header 注入）`)
      continue
    }
    out[key] = value
  }
  return out
}

/** 从 config 构建三层表（兼容旧字段 headers → global）。 */
function buildTables(config, log) {
  const headers = config.headers && typeof config.headers === 'object' ? config.headers : {}
  const global = sanitizeHeaders(config.global, log)
  for (const [key, value] of Object.entries(headers)) global[key] = value
  const providers = {}
  const models = {}
  if (config.providers && typeof config.providers === 'object') {
    for (const [provider, h] of Object.entries(config.providers)) {
      providers[provider] = sanitizeHeaders(h, log)
    }
  }
  if (config.models && typeof config.models === 'object') {
    for (const [qual, h] of Object.entries(config.models)) {
      models[qual] = sanitizeHeaders(h, log)
    }
  }
  return { global, providers, models }
}

/** 在 config 表之上叠加 settings section（每层逐键合并，settings 优先）。 */
function mergeSection(base, section) {
  if (section && typeof section === 'object') {
    if (section.global && typeof section.global === 'object') Object.assign(base.global, section.global)
    if (section.providers && typeof section.providers === 'object') {
      for (const [provider, h] of Object.entries(section.providers)) {
        if (h && typeof h === 'object') {
          base.providers[provider] = { ...(base.providers[provider] ?? {}), ...h }
        }
      }
    }
    if (section.models && typeof section.models === 'object') {
      for (const [qual, h] of Object.entries(section.models)) {
        if (h && typeof h === 'object') {
          base.models[qual] = { ...(base.models[qual] ?? {}), ...h }
        }
      }
    }
  }
  return base
}

/** 按 store（provider/model）解析该请求应使用的 headers 层。 */
function resolveFor(store, tables) {
  if (store && typeof store === 'object') {
    if (store.provider !== undefined && store.model !== undefined) {
      const key = `${store.provider}/${store.model}`
      const modelHeaders = tables.models[key]
      if (modelHeaders !== undefined && Object.keys(modelHeaders).length > 0) return modelHeaders
    }
    if (store.provider !== undefined) {
      const providerHeaders = tables.providers[store.provider]
      if (providerHeaders !== undefined && Object.keys(providerHeaders).length > 0) return providerHeaders
    }
  }
  return tables.global
}

/** 构建 llm/stream waterfall 处理器：捕获 provider/model 并注入 ALS 上下文。 */
function makeWaterfallHandler() {
  return (options, next) => {
    const store = { provider: options.provider, model: options.model }
    return {
      [Symbol.asyncIterator]() {
        const inner = next()[Symbol.asyncIterator]()
        return {
          next: (arg) => als.run(store, () => inner.next(arg)),
          return: (arg) => als.run(store, () => inner.return(arg)),
          throw: (arg) => als.run(store, () => inner.throw(arg)),
        }
      },
    }
  }
}

export async function apply(ctx, config = {}) {
  const log = ctx.logger ?? console
  const hosts = Array.isArray(config.hosts) ? config.hosts.map(String) : []
  // fill = 保留适配器已设置的同名头（true）；默认 false = 我们配置的头覆盖同名头。
  // 注意：harness 各 LLM 适配器会强制注入自己的 user-agent（attribution，
  // 且把用户传入的同名头排在前面再覆盖），因此要让用户配置的 User-Agent 真正
  // 上线，必须默认覆盖（fill=false）；真需要"适配器权威"时再显式 fill: true。
  const fill = config.fill === true

  let tables = buildTables(config, log)
  let scope = null

  // 数据源：config（默认值）+ settings section（用户覆盖，逐键合并）。
  const reloadTables = () => {
    const base = buildTables(config, log)
    tables = scope === null ? base : mergeSection(base, scope.get())
  }
  const rebuildFrom = (next) => { tables = buildTables(next, log) }

  // settings 命名空间注册（尽力而为）：client 区块写这里，host 读这里。
  // 进程内可能并存多个 FileSettingsProvider 实例（本行可能被多个 app 链各自
  // 挂载），因此对每个可发现的实例都注册一份（按同一性去重，重复注册容忍）。
  // 各实例读写同一份 settings.yaml，数据天然收敛；describe 可见性由 harness
  // 的 apiproxy WEB_SETTINGS_NAMESPACES 白名单决定（需配套 harness 补丁）。
  const schemastery = await loadSchemastery()
  const providers = new Set()
  for (const holder of [ctx, ctx.get?.('loader')?.ctx, ctx.get?.('webserver')?.ctx]) {
    const p = (typeof holder?.get === 'function' ? holder.get('settings') : undefined) ?? holder?.settings
    if (p !== undefined && p !== null) providers.add(p)
  }
  if (schemastery && providers.size > 0) {
    const z = schemastery
    // 本 vendored schemastery 无 .partial()/.optional()，但 object schema 非严格：
    // 缺失键自动省略、未知键保留，顶层 undefined 直接放行 —— 结构天然可选。
    const scopeSchema = z.object({
      global: z.dict(z.string()),
      providers: z.dict(z.dict(z.string())),
      models: z.dict(z.dict(z.string())),
    })
    const stopWatches = []
    for (const p of providers) {
      try {
        const s = p.register('dsh-llm-headers', scopeSchema)
        if (typeof s.watch === 'function') stopWatches.push(s.watch(() => reloadTables()))
        if (scope === null) scope = s
      } catch (error) {
        log.warn(`[dsh-llm-headers] settings 注册跳过（${error && error.message ? error.message : error}）`)
      }
    }
    if (scope !== null) {
      ctx.effect?.(() => () => { for (const stop of stopWatches) stop() }, 'dsh-llm-headers: stop settings watches')
      ctx.on?.('settings/document-updated', (ns) => {
        if (ns === 'dsh-llm-headers' && scope !== null) reloadTables()
      })
      reloadTables()
      log.info('[dsh-llm-headers] settings 命名空间已注册（client 区块 ↔ host 联动）')
    }
  } else {
    log.info('[dsh-llm-headers] 未检测到 settings 服务，config 模式')
  }

  // 运行时服务：其它插件 / 设置界面可读写三层表（有 scope 时写 settings 持久化）。
  const snapshot = () => ({
    global: { ...tables.global },
    providers: Object.fromEntries(Object.entries(tables.providers).map(([k, v]) => [k, { ...v }])),
    models: Object.fromEntries(Object.entries(tables.models).map(([k, v]) => [k, { ...v }])),
  })
  ctx.provide?.('llmHeaders', {
    get: snapshot,
    set: (next) => {
      if (scope !== null) scope.set(buildTables(next, log))
      else rebuildFrom(next)
    },
    reset: () => {
      if (scope !== null) scope.set({})
      else rebuildFrom({ global: {}, providers: {}, models: {} })
    },
  })

  // llm/stream waterfall：把本次调用的 provider/model 送进 ALS 上下文。
  const handler = makeWaterfallHandler()
  ctx.on?.('llm/stream', handler)

  const original = globalThis.fetch
  if (typeof original !== 'function') {
    throw new Error('dsh-llm-headers: globalThis.fetch 不可用，无法注入')
  }
  // 注意：不在此处因 MARK 早退。本行会被多个 app 链各自挂载（实测内核实例在
  // 启动期可能被重建 → fiber 卸载会走 dispose 还原 fetch）；若早退，重建后
  // 无人接管 heal interval，注入会随旧实例的还原而丢失。始终叠一层新包装
  // 覆盖现有包装（含我们自己的旧包装），dispose 仅在 global 仍是自己最新
  // 包装时才还原，旧实例的卸载不会误杀新实例的注入链。

  // 包装器：hosts 过滤 → ALS 上下文解析三层表 → 合并进 init.headers。
  // 注意底层指向 `under`（变量），而非固定 original：若其它插件在 apply 之后
  // 再次替换 globalThis.fetch（实测发生过——赋值后立刻被挤掉），自愈守护会
  // 以当时的 global fetch 为底层重建包装链，保留其它包装而不跳过它们。
  const wrapUnder = (under) => {
    const w = async (input, init) => {
      if (w.retired) return under(input, init) // 退役后的透传（卸载时避免残留注入）
      const hostname = hostnameOf(input)
      if (hostname !== null && matches(hostname, hosts)) {
        const headers = resolveFor(als.getStore(), tables)
        if (Object.keys(headers).length > 0) {
          const merged = new Headers(init && init.headers !== undefined ? init.headers : undefined)
          for (const [key, value] of Object.entries(headers)) {
            try {
              if (fill && merged.has(key)) continue
              merged.set(key, value)
            } catch (error) {
              log?.warn?.(`[dsh-llm-headers] 注入 "${key}" 失败: ${error && error.message ? error.message : error}`)
            }
          }
          init = { ...(init ?? {}), headers: merged }
        }
      }
      return under(input, init)
    }
    Object.defineProperty(w, MARK, { value: true })
    return w
  }

  let current = wrapUnder(original)
  const heal = () => {
    const top = globalThis.fetch
    if (top === current) return
    // 顶层 fetch 被其它插件替换：以它为底层重建链（保留其行为），再把自己放回顶层。
    current = wrapUnder(typeof top === 'function' ? top : original)
    globalThis.fetch = current
  }
  heal()
  const timer = setInterval(heal, 3000)
  timer.unref?.()
  ctx.effect(() => {
    clearInterval(timer)
    // 卸载语义：global 仍是我们最新包装时才还原 original；若已被更晚挂载的
    // 实例（同插件其它 app 链）的包装接管，则跳过还原以免误杀在用的链。
    // 停用后的包装退役为透传（不再注入残留头）。
    if (globalThis.fetch === current) globalThis.fetch = original
    if (typeof current === 'function') current.retired = true
  }, 'dsh-llm-headers: fetch wrapper')

  log.info(`[dsh-llm-headers] 已激活: global=${Object.keys(tables.global).length}, ` +
    `providers=${Object.keys(tables.providers).length}, models=${Object.keys(tables.models).length}, ` +
    `fill=${fill}, ` +
    (hosts.length === 0 ? '目标 = 所有主机（除 .local）' : `目标 = hosts: ${hosts.join(', ')}`))
}