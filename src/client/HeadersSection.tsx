/**
 * dsh-llm-headers — 设置页"请求头"区块（软替换，与官方 Models 页共存）。
 * 三层编辑器：global / providers / models，任何改动即时经 settings.mutate
 * 落盘（带 expectedRevision），host 半边收到 document-updated 后重载注入表。
 * 样式走 CSS Modules（构建期 lightningcss 编译，<style data-plugin> 注入）。
 */
import { useRef, useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { HeadersScope, type HeadersSnapshot } from './scope.ts'
import type { HeadersKey } from './locales.ts'
import { classes as styles } from './styles.ts'

export interface HeadersSectionInjected {
  scope: HeadersScope
  /** bindSnapshotSelector(scope.store) —— 快照订阅 hook。 */
  useSnapshot: () => HeadersSnapshot
  api: IApiClient
  t: (key: keyof HeadersKey) => string
}

interface Row {
  id: string
  name: string
  value: string
}

interface Group {
  id: string
  key: string
  rows: Row[]
}

let uid = 0
const newId = (): string => `r${++uid}`
const toRows = (map?: Record<string, string>): Row[] =>
  Object.entries(map ?? {}).map(([name, value]) => ({ id: newId(), name, value }))
const toGroups = (map?: Record<string, Record<string, string>>): Group[] =>
  Object.entries(map ?? {}).map(([key, kv]) => ({ id: newId(), key, rows: toRows(kv) }))

/**
 * KV 行：本地编辑，实时提交到 [basePath..., name]。
 * oldName 存在且已改名时，先按旧名 unset 再按新名 set。
 */
function RowInput(props: {
  t: HeadersKey
  row: Row
  commit: (row: Row, oldName: string | undefined) => void
  remove: (row: Row) => void
}) {
  const { t, row, commit, remove } = props
  return (
    <div className={styles.kvRow}>
      <input
        className={styles.kvName}
        value={row.name}
        placeholder={t.headerName}
        onChange={(e) => commit({ ...row, name: e.target.value }, row.name === '' ? undefined : row.name)}
      />
      <input
        className={styles.kvValue}
        value={row.value}
        placeholder={t.headerValue}
        onChange={(e) => commit({ ...row, value: e.target.value }, undefined)}
      />
      <button className={styles.kvRemove} onClick={() => remove(row)} title={t.remove}>✕</button>
    </div>
  )
}

/** 扁平 KV 编辑器（global / 某个提供方或模型的内部表）。 */
function KvEditor(props: {
  t: HeadersKey
  rows: Row[]
  setRows: (rows: Row[]) => void
  basePath: string[]
  onChange: (path: string[], value: string, remove: boolean) => void
  addLabel: string
}) {
  const { t, rows, setRows, basePath, onChange, addLabel } = props
  const commit = (row: Row, oldName: string | undefined): void => {
    if (row.name.length > 0 && row.value.length > 0) onChange([...basePath, row.name], row.value, false)
    else if (row.name.length > 0) onChange([...basePath, row.name], '', true)
    if (oldName !== undefined && oldName !== row.name && oldName.length > 0) {
      onChange([...basePath, oldName], '', true)
    }
  }
  const remove = (row: Row): void => {
    if (row.name.length > 0) onChange([...basePath, row.name], '', true)
    setRows(rows.filter((r) => r.id !== row.id))
  }
  const add = (): void => {
    const next = [...rows, { id: newId(), name: '', value: '' }]
    setRows(next)
  }
  return (
    <div className={styles.kvBlock}>
      {rows.map((row) => (
        <RowInput key={row.id} t={t} row={row} commit={commit} remove={remove} />
      ))}
      <button className={styles.add} onClick={add}>+ {addLabel}</button>
    </div>
  )
}

/** 分组编辑器（providers / models）：键可改名，子项为 KV 行。 */
function GroupEditor(props: {
  t: HeadersKey
  groups: Group[]
  setGroups: (groups: Group[]) => void
  basePath: string[]
  onChange: (path: string[], value: string, remove: boolean) => void
  keyPlaceholder: string
  addLabel: string
}) {
  const { t, groups, setGroups, basePath, onChange, keyPlaceholder, addLabel } = props
  const commitKey = (group: Group, oldKey: string, nextKey: string): void => {
    if (nextKey.length === 0 || nextKey === oldKey) return
    for (const row of group.rows) {
      if (row.name.length === 0) continue
      onChange([...basePath, nextKey, row.name], row.value, false)
      onChange([...basePath, oldKey, row.name], '', true)
    }
  }
  const removeGroup = (group: Group): void => {
    for (const row of group.rows) {
      if (row.name.length > 0) onChange([...basePath, group.key, row.name], '', true)
    }
    setGroups(groups.filter((g) => g.id !== group.id))
  }
  const addGroup = (): void => {
    setGroups([...groups, { id: newId(), key: '', rows: [{ id: newId(), name: '', value: '' }] }])
  }
  return (
    <div className={styles.groupList}>
      {groups.map((group) => (
        <div key={group.id} className={styles.group}>
          <div className={styles.groupHead}>
            <input
              className={styles.groupKey}
              value={group.key}
              placeholder={keyPlaceholder}
              onChange={(e) => {
                const nextKey = e.target.value
                commitKey(group, group.key, nextKey)
                setGroups(groups.map((g) => g.id === group.id ? { ...g, key: nextKey } : g))
              }}
            />
            <button className={styles.kvRemove} onClick={() => removeGroup(group)} title={t.remove}>✕</button>
          </div>
          <KvEditor
            t={t}
            rows={group.rows}
            setRows={(rows) => setGroups(groups.map((g) => g.id === group.id ? { ...g, rows } : g))}
            basePath={[...basePath, group.key]}
            onChange={onChange}
            addLabel={t.headerName}
          />
        </div>
      ))}
      <button className={styles.add} onClick={addGroup}>+ {addLabel}</button>
    </div>
  )
}

export function HeadersSection(props: HeadersSectionInjected) {
  const { scope, useSnapshot, t } = props
  const snap = useSnapshot((s) => s)
  const writable = snap.writable
  const value = snap.value
  const touched = useRef(false)

  // 首次挂载时从快照初始化草稿；此后以本地草稿为准（MVP：跨页面外部变更
  // 会在下一次 document-updated 刷新 scope，重进页面即最新）。
  const [globalRows, setGlobalRows] = useState<Row[]>(() => {
    if (value !== undefined && !touched.current) touched.current = true
    return toRows(value?.global)
  })
  const [providerGroups, setProviderGroups] = useState<Group[]>(() => toGroups(value?.providers))
  const [modelGroups, setModelGroups] = useState<Group[]>(() => toGroups(value?.models))

  const onChange = (path: string[], value: string, remove: boolean): void => {
    if (!writable) return
    if (remove) void scope.unsetPath(...path)
    else void scope.setPath(path, value)
  }
  if (snap.status === 'loading') return <div className={styles.hint}>{t.loading}</div>
  if (snap.status === 'unavailable') return <div className={styles.hint}>{t.unavailable}</div>
  if (!writable) return <div className={styles.hint}>{t.readOnly}</div>

  return (
    <div className={styles.section}>
      <p className={styles.desc}>{t.desc}</p>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t.globalTitle}</h3>
        <KvEditor
          t={t}
          rows={globalRows}
          setRows={setGlobalRows}
          basePath={['global']}
          onChange={onChange}
          addLabel={t.headerName}
        />
      </section>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t.providerTitle}</h3>
        <GroupEditor
          t={t}
          groups={providerGroups}
          setGroups={setProviderGroups}
          basePath={['providers']}
          onChange={onChange}
          keyPlaceholder={t.providerPlaceholder}
          addLabel={t.providerPlaceholder}
        />
      </section>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t.modelTitle}</h3>
        <GroupEditor
          t={t}
          groups={modelGroups}
          setGroups={setModelGroups}
          basePath={['models']}
          onChange={onChange}
          keyPlaceholder={t.modelPlaceholder}
          addLabel={t.modelPlaceholder}
        />
      </section>
    </div>
  )
}