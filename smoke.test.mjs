// dsh-llm-headers 本地冒烟测试（零依赖：node smoke.test.mjs）
// 假 ctx + 本地 HTTP 回显服务器：注入 / 过滤 / 还原 / 防重复包装 /
// llm/stream+ALS 三层回退 / fill 与 override / settings 通道（注册+合并+重载）。
import http from 'node:http'
import { apply } from './index.js'

const originalFetch = globalThis.fetch
let passCount = 0
let failCount = 0

function check(name, ok, detail = '') {
  if (ok) passCount++
  else failCount++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

let ctx_provided = null
const makeCtx = () => {
  const effects = []
  const listeners = new Map()
  return {
    effects,
    on: (evt, fn) => { listeners.set(evt, fn) },
    emit: (evt, ...args) => { listeners.get(evt)?.(...args) },
    getLlmHandler: () => listeners.get('llm/stream'),
    logger: {
      info: (...a) => console.log('  [log ]', ...a),
      warn: (...a) => console.log('  [warn]', ...a),
    },
    provide: (name, value) => { ctx_provided = value },
    effect: (fn) => effects.push(fn),
  }
}
const dispose = (ctx) => {
  ctx.effects.forEach((fn) => fn())
  ctx.effects.length = 0
}

// settings 桩：register 记录命名空间，scope.set 直接改 section（模拟持久化）。
// 注意：用 getter/setter 暴露 state，避免 spread 拷贝导致外部读到旧副本。
const makeSettingsStub = () => {
  const state = { registered: null, section: {} }
  return {
    get registered() { return state.registered },
    get section() { return state.section },
    set section(value) { state.section = value },
    register: (ns, _schema) => {
      state.registered = ns
      return {
        get: () => state.section,
        set: (value) => { state.section = value },
      }
    },
  }
}

let received = null
const server = http.createServer((req, res) => {
  received = req.headers
  req.resume()
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end('{}')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`
console.log(`== echo server at ${baseUrl} ==\n`)

let ctx

// T1 命中 host -> 注入（legacy headers=global）+ 原有头保留
ctx = makeCtx()
await apply(ctx, { headers: { 'x-company': 'acme', 'x-trace': 't1' }, hosts: ['127.0.0.1'] })
await fetch(`${baseUrl}/t1`, { method: 'POST', headers: { authorization: 'Bearer sk-test' }, body: 'hello' })
check('T1 host 命中注入', received['x-company'] === 'acme' && received['x-trace'] === 't1')
check('T1 原有头保留', received['authorization'] === 'Bearer sk-test')

// T2 hosts 为空默认 -> 回环放行（本地反向代理是常见注入目标）、.local 跳过
dispose(ctx); ctx = makeCtx()
await apply(ctx, { headers: { 'x-company': 'acme' } })
await fetch(`${baseUrl}/t2`, { method: 'POST', body: 'hello' })
check('T2 空列表回环放行', received['x-company'] === 'acme')
const { matches } = await import('./index.js')
check('T2b 无 hosts 匹配 127.0.0.1', matches('127.0.0.1', []) === true)
check('T2c 无 hosts 跳过 .local', matches('myprinter.local', []) === false)
check('T2d 无 hosts 匹配普通域名', matches('api.deepseek.com', []) === true)
check('T2e hosts 后缀匹配', matches('proxy.example.com', ['example.com']) === true)

// T3 未提供 init 仍注入
dispose(ctx); ctx = makeCtx()
await apply(ctx, { headers: { 'x-n': '1' }, hosts: ['127.0.0.1'] })
await fetch(`${baseUrl}/t3`)
check('T3 无 init 注入', received['x-n'] === '1')

// T4 任意头名可注入 + CRLF 防护
dispose(ctx); ctx = makeCtx()
await apply(ctx, {
  headers: { 'x-custom-length': '999', 'x-evil': 'a\r\nInjected: b', 'x-ok': 'yes' },
  hosts: ['127.0.0.1'],
})
await fetch(`${baseUrl}/t4`, { method: 'POST', body: 'payload' })
check('T4 非禁用头名注入', received['x-custom-length'] === '999')
check('T4 CRLF 头被过滤', received['x-evil'] === undefined)
check('T4 合法头注入', received['x-ok'] === 'yes')

// T5 防重复包装（HMR 场景）
dispose(ctx); ctx = makeCtx()
await apply(ctx, { headers: { 'x-dup': '1' }, hosts: ['127.0.0.1'] })
await apply(makeCtx(), { headers: { 'x-dup': '2' }, hosts: ['127.0.0.1'] }) // 应告警并跳过
await fetch(`${baseUrl}/t5`)
check('T5 第二次 apply 跳过且不破坏', received['x-dup'] === '1')

// T6 effect 还原原 fetch
dispose(ctx)
check('T6 卸载还原原 fetch', globalThis.fetch === originalFetch)

// T7 llmHeaders 服务(表形态)热更新（config 模式，无 settings）
ctx = makeCtx()
await apply(ctx, { headers: { 'x-a': '1' }, hosts: ['127.0.0.1'] })
ctx_provided.set({ global: { 'x-b': '2' } })
await fetch(`${baseUrl}/t7`)
const snap = ctx_provided.get()
check('T7 get() 表形态', snap.global['x-b'] === '2' && snap.global['x-a'] === undefined)
check('T7 set() 热更新生效', received['x-b'] === '2' && received['x-a'] === undefined)
dispose(ctx)
check('T7 卸载还原', globalThis.fetch === originalFetch)

// T8 llm/stream+ALS：模型绑定优先，provider 回退，global 兜底
dispose(ctx); ctx = makeCtx()
await apply(ctx, {
  hosts: ['127.0.0.1'],
  global: { 'x-glob': 'g1' },
  providers: { 'acme-gateway': { 'x-prov': 'p1' } },
  models: { 'acme-gateway/gpt-5': { 'x-model': 'm1' } },
})
const handler = ctx.getLlmHandler()
async function* fakeStream() {
  await fetch(`${baseUrl}/t8`, { method: 'POST', headers: { authorization: 'Bearer k' }, body: 'hello' })
  yield { type: 'finish', reason: { kind: 'ok' } }
}
for await (const _ of handler({ provider: 'acme-gateway', model: 'gpt-5' }, () => fakeStream())) {}
check('T8a 模型绑定头生效', received['x-model'] === 'm1')
check('T8a 更细层命中则不叠加 provider/global', received['x-prov'] === undefined && received['x-glob'] === undefined)
check('T8a 原有头保留', received['authorization'] === 'Bearer k')
for await (const _ of handler({ provider: 'acme-gateway', model: 'other-model' }, () => fakeStream())) {}
check('T8b 未命中模型→provider 回退', received['x-prov'] === 'p1' && received['x-model'] === undefined)
for await (const _ of handler({ provider: 'other-prov', model: 'm' }, () => fakeStream())) {}
check('T8c 未知 provider→global 兜底', received['x-glob'] === 'g1' && received['x-prov'] === undefined)
await fetch(`${baseUrl}/t8d`, { method: 'POST', body: 'x' })
check('T8d 无 store→global', received['x-glob'] === 'g1')

// T9 fill / override（默认 false = 我们配置的头覆盖同名头）
dispose(ctx); ctx = makeCtx()
await apply(ctx, { headers: { 'x-company': 'new' }, hosts: ['127.0.0.1'] }) // fill 默认
await fetch(`${baseUrl}/t9a`, { method: 'POST', headers: { 'x-company': 'old' }, body: 'x' })
check('T9 默认覆盖已有同名头', received['x-company'] === 'new')
dispose(ctx); ctx = makeCtx()
await apply(ctx, { headers: { 'x-company': 'new' }, hosts: ['127.0.0.1'], fill: true }) // 保留
await fetch(`${baseUrl}/t9b`, { method: 'POST', headers: { 'x-company': 'old' }, body: 'x' })
check('T9 fill:true 保留适配器已有同名头', received['x-company'] === 'old')
dispose(ctx)

// T10 settings 通道：注册命名空间 + 叠加合并 + document-updated 重载 + llmHeaders.set 落盘
ctx = makeCtx()
const stub = makeSettingsStub()
ctx.settings = stub
await apply(ctx, { global: { 'x-a': 'cfg-a' }, hosts: ['127.0.0.1'] })
check('T10 注册命名空间', stub.registered === 'dsh-llm-headers')
await fetch(`${baseUrl}/t10a`, { method: 'POST', body: 'x' })
check('T10 初始=config', received['x-a'] === 'cfg-a')
// 设置侧写入（等价于 client 区块 mutate 落盘）
stub.section = { global: { 'x-b': 'set-b' } }
ctx.emit('settings/document-updated', 'dsh-llm-headers')
await fetch(`${baseUrl}/t10b`, { method: 'POST', body: 'x' })
check('T10 doc-updated 后重载(settings 叠加 config)', received['x-b'] === 'set-b' && received['x-a'] === 'cfg-a')
// llmHeaders.set → scope.set（持久化到 settings）
ctx_provided.set({ global: { 'x-c': 'c3' } })
check('T10 llmHeaders.set 落 settings section', stub.section.global['x-c'] === 'c3')
ctx_provided.reset()
check('T10 llmHeaders.reset 清空 settings', stub.section.global === undefined)
stub.section = { global: { 'x-d': 'd4' } }
ctx.emit('settings/document-updated', 'dsh-llm-headers')
await fetch(`${baseUrl}/t10c`, { method: 'POST', body: 'x' })
check('T10 重载后生效', received['x-d'] === 'd4')
dispose(ctx)

server.close()
console.log(`\n== ${passCount} PASS, ${failCount} FAIL ==`)
process.exit(failCount === 0 ? 0 : 1)