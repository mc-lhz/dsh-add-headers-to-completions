/**
 * dsh-llm-headers — 客户端区块文案（zh / en）。
 * 命名空间 'request-headers'，对应设置页"请求头"区块。
 */

export interface HeadersKey {
  /** 设置页导航 / 区块标题。 */
  nav: string
  /** 区块说明。 */
  desc: string
  /** 全局请求头（所有模型请求）。 */
  globalTitle: string
  /** 按提供方（provider 级）。 */
  providerTitle: string
  /** 按模型（provider/model，最细粒度）。 */
  modelTitle: string
  /** 当前层未配置。 */
  empty: string
  /** 添加一行。 */
  add: string
  /** 删除。 */
  remove: string
  /** 表头：头名。 */
  headerName: string
  /** 表头：值。 */
  headerValue: string
  /** 表头：操作。 */
  headerAction: string
  /** 提供方 id 占位。 */
  providerPlaceholder: string
  /** 模型键（provider/model）占位。 */
  modelPlaceholder: string
  /** 只读：设置不可写。 */
  readOnly: string
  /** 加载中。 */
  loading: string
  /** 不可用。 */
  unavailable: string
  /** 保存失败的提示。 */
  saveError: string
  /** 已保存。 */
  saved: string
}

export const zh: HeadersKey = {
  nav: '请求头',
  desc: '为模型请求注入自定义 HTTP 请求头。优先级：模型 > 提供方 > 全局。默认不覆盖请求已有的同名头。',
  globalTitle: '全局请求头',
  providerTitle: '按提供方',
  modelTitle: '按模型',
  empty: '暂未配置',
  add: '添加',
  remove: '删除',
  headerName: '头名',
  headerValue: '值',
  headerAction: '操作',
  providerPlaceholder: '提供方 id，如 acme-gateway',
  modelPlaceholder: 'provider/model，如 acme-gateway/gpt-5',
  readOnly: '当前连接为只读',
  loading: '加载中…',
  unavailable: '命名空间不可用',
  saveError: '保存失败',
  saved: '已保存',
}

export const en: HeadersKey = {
  nav: 'Request Headers',
  desc: 'Inject custom HTTP headers into model requests. Precedence: model > provider > global. Existing same-name headers are kept by default.',
  globalTitle: 'Global headers',
  providerTitle: 'Per provider',
  modelTitle: 'Per model',
  empty: 'Nothing configured',
  add: 'Add',
  remove: 'Remove',
  headerName: 'Name',
  headerValue: 'Value',
  headerAction: 'Action',
  providerPlaceholder: 'provider id, e.g. acme-gateway',
  modelPlaceholder: 'provider/model, e.g. acme-gateway/gpt-5',
  readOnly: 'Connection is read-only',
  loading: 'Loading…',
  unavailable: 'Namespace unavailable',
  saveError: 'Save failed',
  saved: 'Saved',
}