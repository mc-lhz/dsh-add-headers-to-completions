/**
 * dsh-llm-headers — 区块样式（TS 内嵌，替代 CSS Modules）。
 * 说明：vendored 构建链路（tsdown 0.22 + rolldown 1.2.4）对 .css 走内置
 * asset 管线，插件 resolveId 无法抢在 css-guard 前重映射虚拟 id；这里改为
 * 纯 TS 模块导出 css 文本 + 类名表，并在模块作用域（即 bundle factory 执行
 * 时）自注入 <style data-plugin="dsh-llm-headers"> 标签，loader 卸载插件时
 * 会随 data-plugin 移除；无需任何构建期 CSS 处理。
 */

export const classes = {
  section: 'dsh-hdr-section',
  desc: 'dsh-hdr-desc',
  block: 'dsh-hdr-block',
  blockTitle: 'dsh-hdr-block-title',
  kvBlock: 'dsh-hdr-kvs',
  kvRow: 'dsh-hdr-kv-row',
  kvName: 'dsh-hdr-kv-name',
  kvValue: 'dsh-hdr-kv-value',
  groupKey: 'dsh-hdr-group-key',
  kvRemove: 'dsh-hdr-remove',
  add: 'dsh-hdr-add',
  groupList: 'dsh-hdr-group-list',
  group: 'dsh-hdr-group',
  groupHead: 'dsh-hdr-group-head',
  hint: 'dsh-hdr-hint',
} as const

export const css = `
.dsh-hdr-section { display: flex; flex-direction: column; gap: 18px; padding: 4px 0; }
.dsh-hdr-desc { opacity: .72; font-size: 13px; line-height: 1.6; margin: 0 0 4px; }
.dsh-hdr-block { display: flex; flex-direction: column; gap: 8px; }
.dsh-hdr-block-title { font-size: 14px; font-weight: 600; margin: 0; }
.dsh-hdr-kvs { display: flex; flex-direction: column; gap: 6px; }
.dsh-hdr-kv-row { display: flex; gap: 8px; align-items: center; }
.dsh-hdr-kv-name, .dsh-hdr-kv-value, .dsh-hdr-group-key {
  padding: 5px 8px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border, rgba(128,128,128,.35));
  background: var(--dsw-alias-surface-muted, rgba(128,128,128,.08));
  color: var(--dsw-alias-foreground, inherit); font-size: 13px;
}
.dsh-hdr-kv-name { flex: 0 0 220px; font-family: var(--dsw-alias-font-mono, ui-monospace, monospace); }
.dsh-hdr-kv-value { flex: 1; font-family: var(--dsw-alias-font-mono, ui-monospace, monospace); }
.dsh-hdr-group-key { flex: 1; font-family: var(--dsw-alias-font-mono, ui-monospace, monospace); }
.dsh-hdr-remove { border: none; background: transparent; color: var(--dsw-alias-foreground-muted, rgba(128,128,128,.8)); cursor: pointer; font-size: 13px; padding: 4px 8px; border-radius: 6px; }
.dsh-hdr-remove:hover { color: var(--dsw-alias-danger, #e5484d); background: var(--dsw-alias-danger-muted, rgba(229,72,77,.12)); }
.dsh-hdr-add { align-self: flex-start; padding: 4px 10px; border-radius: 6px; border: 1px dashed var(--dsw-alias-border-strong, rgba(128,128,128,.5)); background: transparent; color: var(--dsw-alias-foreground-muted, rgba(128,128,128,.9)); cursor: pointer; font-size: 13px; }
.dsh-hdr-add:hover { border-style: solid; }
.dsh-hdr-group-list { display: flex; flex-direction: column; gap: 10px; }
.dsh-hdr-group { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border, rgba(128,128,128,.25)); background: var(--dsw-alias-surface, rgba(128,128,128,.04)); }
.dsh-hdr-group-head { display: flex; gap: 8px; align-items: center; }
.dsh-hdr-hint { opacity: .6; font-size: 13px; padding: 8px 0; }
`

const TAG_ID = 'dsh-llm-headers/styles'
if (typeof document !== 'undefined'
  && document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-llm-headers'
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = css
  document.head.appendChild(tag)
}

export { }