/**
 * dsh-llm-headers — 客户端插件入口（浏览器半边）。注册"请求头"设置区块
 * （settings.section 插槽，与官方 Models 页共存），并把二层写通道接上
 * 推送 invalidation（settings/document-updated / connection/reset）。
 * 注入面：slots / locale / connection / remote（与官方 feature 插件一致）。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
// Type-only：拉取 shell 的 SlotMap 合并（settings.section 条目）。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only：拉取 locale 插件的 Context 合并（ctx.locale）。
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only：拉取 ctx.remote 合并与转发事件键面。
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { HeadersSection } from './HeadersSection.tsx'
import type { HeadersSectionInjected } from './HeadersSection.tsx'
import { HeadersScope, NAMESPACE } from './scope.ts'
import { en, zh, type HeadersKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-locale/client' {
  interface LocaleNamespaceMap {
    /** 请求头区块文案。 */
    'request-headers': HeadersKey
  }
}

/** 本文案命名空间。 */
const NS = 'request-headers'
export type { HeadersSectionInjected, HeadersKey }

/** 必需服务（cordis 注入）。目标插槽由 ui-settings 声明，注册依赖 slots.inject()。 */
export const inject = ['slots', 'locale', 'connection', 'remote']

/**
 * 区块一旦注册即绑定自身 store 并保持推送刷新：
 * 任何 settings/document-updated（不限本 ns，宽松起见）都会触发 scope 重读。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-llm-headers: copy dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const scope = new HeadersScope(connection.api)
  const useSnapshot = bindSnapshotSelector(scope.store)
  const t = ctx.locale.bind(NS) as (key: keyof HeadersKey) => string
  const injected = (): HeadersSectionInjected => ({ scope, useSnapshot, api: connection.api, t })

  ctx.effect(() => {
    const refresh = (): void => { void scope.load() }
    const disposers = [
      ctx.remote.$on('settings/document-updated', (ns) => {
        if (ns === undefined || ns === NAMESPACE) refresh()
      }),
      ctx.on('connection/reset', refresh),
    ]
    return () => {
      for (const dispose of disposers) dispose()
      void scope.dispose()
    }
  }, 'dsh-llm-headers: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'request-headers',
    order: 30, // Models(order 10) 之后，独立区块
    label: () => t('nav'),
    inject: injected,
  }, HeadersSection))
}