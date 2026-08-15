/**
 * dsh-llm-headers — 客户端设置作用域。命名空间 'dsh-llm-headers' 的读写通道：
 *  读：api.settings.describe({}) → 命中本 ns 的 view（value/revision/base/user）
 *  写：api.settings.mutate({ns, ops, expectedRevision})（带修订号防并发丢失）
 * 变更推送到 host 半边后由 host 重载三层表（settings/document-updated）。
 * 镜像官方 SettingsScopeController 的队列 / 修订 / 恢复契约（裁剪到本需求）。
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'

/** 本插件自有的 settings 命名空间（host 半边注册同名命名空间）。 */
export const NAMESPACE = 'dsh-llm-headers'

/** 三层表 section 形态（各层可选）。 */
export interface HeadersSection {
  global?: Record<string, string>
  providers?: Record<string, Record<string, string>>
  models?: Record<string, Record<string, string>>
}

/** 快照形态（value 为已解析 section）。 */
export interface HeadersSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value?: HeadersSection
  revision?: number
  writable: boolean
}

export type HeaderLayer = 'global' | 'providers' | 'models'

export class HeadersScope {
  readonly store = createSnapshotStore<HeadersSnapshot>({
    status: 'loading',
    value: undefined,
    revision: undefined,
    writable: false,
  })

  private tail: Promise<void> = Promise.resolve()
  private readGeneration = 0
  private writeGeneration = 0
  private disposed = false

  constructor(private readonly api: IApiClient) {
    void this.load()
  }

  getSnapshot(): HeadersSnapshot {
    return this.store.getSnapshot()
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  /** 排队一次刷新；较新的读或用户写会抑制过期发布。 */
  load(): Promise<void> {
    const generation = ++this.readGeneration
    return this.enqueue(() => this.read(generation))
  }

  /** 设置一个键值：任意深度路径（[layer, key] 或 [layer, groupKey, headerName]）。 */
  setPath(path: string[], value: string): Promise<void> {
    if (path.length === 0 || value.length === 0) return Promise.resolve()
    return this.write({ op: 'set', path, value })
  }

  /** 删除一个键：同样任意深度。 */
  unsetPath(...path: string[]): Promise<void> {
    if (path.length === 0) return Promise.resolve()
    return this.write({ op: 'unset', path })
  }

  private write(op: SettingsPathOpView): Promise<void> {
    this.readGeneration += 1
    const generation = ++this.writeGeneration
    return this.enqueue(async () => {
      const revision = this.getSnapshot().revision
      try {
        const response = await this.api.settings.mutate({
          ns: NAMESPACE,
          ops: [op],
          ...(revision === undefined ? {} : { expectedRevision: revision }),
        })
        if (!response.result.ok) {
          if (!this.disposed && generation === this.writeGeneration) await this.read(++this.readGeneration)
          return
        }
        this.accept(response.result.value, generation === this.writeGeneration)
      } catch (_settingsWriteFailure) {
        if (!this.disposed && generation === this.writeGeneration) await this.read(++this.readGeneration)
      }
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.readGeneration += 1
    this.writeGeneration += 1
    await this.tail
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const task = this.tail.then(async () => {
      if (this.disposed) return
      await operation()
    })
    this.tail = task.catch(() => {})
    return task
  }

  private async read(generation: number): Promise<void> {
    try {
      const response = await this.api.settings.describe({})
      if (!response.result.ok || this.disposed) return
      const { namespaces, writable } = response.result.value
      const view = namespaces.find((candidate) => candidate.ns === NAMESPACE)
      if (view === undefined) {
        if (generation === this.readGeneration) {
          this.store.update((draft) => {
            draft.status = 'unavailable'
            draft.writable = writable
          })
        }
        return
      }
      this.accept(view, generation === this.readGeneration, writable)
    } catch (_settingsReadFailure) {
      // 读取失败保持现状，等待下一次 invalidation。
    }
  }

  private accept(view: SettingsNamespaceView, publish: boolean, writable?: boolean): void {
    this.store.update((draft) => {
      draft.revision = view.revision
      draft.writable = writable ?? draft.writable
      if (!publish) return
      const value = view.value
      draft.value = (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      ) ? value as HeadersSection : undefined
      draft.status = 'ready'
    })
  }
}