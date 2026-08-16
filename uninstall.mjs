#!/usr/bin/env node
// 卸载 dsh-llm-headers：删除 profile node_modules 里的副本，并从 profile
// bundles 移除条目。可在 %TEMP% 里运行，与 install.mjs 同理。
//
// 用法：
//   node uninstall.mjs                         # 卸载 web profile
//   node uninstall.mjs --profile test          # 其它 profile
//
// 环境变量 DSH_HOME 覆盖默认的 ~/.dsh。
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const pkgName = 'dsh-llm-headers'

// 容忍 Windows 编辑器/脚本常见的 UTF-8 BOM（JSON.parse 不接受 BOM）。
const readUtf8 = (path) => readFileSync(path, 'utf8').replace(/^\uFEFF/, '')

const args = process.argv.slice(2)
const profileArgIndex = args.indexOf('--profile')
const profileName = profileArgIndex >= 0 ? args[profileArgIndex + 1] : 'web'
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', profileName)
const packageJsonPath = join(profileDir, 'package.json')
const targetDir = join(profileDir, 'node_modules', pkgName)

// 1. 删除 node_modules 副本（若是符号链接/目录联接，只删链接本身，不动源码）。
if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true })
  console.log(`已删除: ${targetDir}`)
} else {
  console.log(`未找到副本: ${targetDir}`)
}

// 2. 从 profile bundles 移除条目。
if (existsSync(packageJsonPath)) {
  const pkg = JSON.parse(readUtf8(packageJsonPath))
  const bundles = pkg?.dsh?.profile?.bundles
  if (Array.isArray(bundles) && bundles.includes(pkgName)) {
    pkg.dsh.profile.bundles = bundles.filter((name) => name !== pkgName)
    writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    console.log('已从 profile bundles 移除插件。')
  }
}

// 3. 遗留项提示：插件自带 cordis.patch.yml 随之消失，无需手动清理 loader 行。
console.log('')
console.log('完成。请重启 dsh web。')
console.log('可选项：')
console.log('  - settings.yaml 里的 dsh-llm-headers 段与 llm-pi-ai.providers.<路由>.headers 是配置，按需清理；')
console.log('  - 两个 harness 本地补丁为手动改动，如需还原：')
console.log('      api-proxy.ts 的 WEB_SETTINGS_NAMESPACES 移除 dsh-llm-headers')
console.log('      llm-pi-ai/src/adapter.ts 的 requestHeaders() 恢复 attribution 全名优先')