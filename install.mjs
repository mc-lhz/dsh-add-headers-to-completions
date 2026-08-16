#!/usr/bin/env node
// 安装 dsh-llm-headers 到指定 profile（无需 pnpm）：
//   把发行文件复制进 profile 的 node_modules，并在 profile bundles 里注册。
//   可在 %TEMP% 里运行（脚本与插件源码分离时用 --source 指向插件目录）。
//
// 用法：
//   node install.mjs                          # 源码就在本目录（仓库克隆 / %TEMP% 副本）
//   node install.mjs --source <插件目录>       # 从任意位置安装磁盘上的插件
//   node install.mjs --profile test          # 装到其它 profile（默认 web）
//   node install.mjs --copy-only             # 只复制包，不改 bundles（配合 dsh web --patch 预览）
//
// 环境变量 DSH_HOME 覆盖默认的 ~/.dsh。
import { createRequire } from 'node:module'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgName = 'dsh-llm-headers'

const args = process.argv.slice(2)
const copyOnly = args.includes('--copy-only')
const profileArgIndex = args.indexOf('--profile')
const profileName = profileArgIndex >= 0 ? args[profileArgIndex + 1] : 'web'
const sourceArgIndex = args.indexOf('--source')
const sourceDir = sourceArgIndex >= 0 ? resolve(args[sourceArgIndex + 1]) : here
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', profileName)
const packageJsonPath = join(profileDir, 'package.json')
const targetDir = join(profileDir, 'node_modules', pkgName)

const sourcePkgPath = join(sourceDir, 'package.json')
// 容忍 Windows 编辑器/脚本常见的 UTF-8 BOM（JSON.parse 不接受 BOM）。
const readUtf8 = (path) => readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
if (!existsSync(sourcePkgPath)) {
  console.error(`未找到插件源码（package.json）：${sourceDir}`)
  console.error('插件目录里应包含 index.js、cordis.patch.yml、lib/。')
  process.exit(1)
}
if (!existsSync(packageJsonPath)) {
  console.error(`未找到 profile：${packageJsonPath}`)
  console.error('请确认 DSH_HOME 正确，或先启动过一次该 profile。')
  process.exit(1)
}

// 1. 复制发行文件（package.json 的 files 列表，外加 package.json 本身；
//    绝不复制 node_modules / .git 等开发垃圾）。
const pkg = JSON.parse(readUtf8(sourcePkgPath))
const copyList = ['package.json', ...(Array.isArray(pkg.files) ? pkg.files : ['index.js', 'cordis.patch.yml', 'lib/'])]
  .filter((entry, index, all) => all.indexOf(entry) === index) // 去重
console.log(`[1/3] 复制发行文件 -> ${targetDir}\\`)
rmSync(targetDir, { recursive: true, force: true })
for (const entry of copyList) {
  const src = join(sourceDir, entry)
  if (!existsSync(src)) {
    console.warn(`  跳过缺失项: ${entry}`)
    continue
  }
  cpSync(src, join(targetDir, entry), { recursive: true })
}

// 2. 验证包能从 profile 解析到（与 dsh 运行时的解析锚点一致）。
try {
  const requireFromProfile = createRequire(pathToFileURL(packageJsonPath))
  const resolved = requireFromProfile.resolve(`${pkgName}/package.json`)
  console.log(`[2/3] 解析验证通过: ${resolved}`)
} catch (error) {
  console.error('[2/3] 解析验证失败:', error.message)
  process.exit(1)
}

// 3. 在 profile 的 bundles 中注册本包（其自带 cordis.patch.yml 会插入
//    loader 条目 #llm-headers；bundle 声明见 package.json dsh.bundle）。
if (copyOnly) {
  console.log('[3/3] --copy-only：跳过 bundle 注册。')
  console.log(`预览方式：dsh web --patch "${join(targetDir, 'cordis.patch.yml')}"`)
} else {
  const profilePkg = JSON.parse(readUtf8(packageJsonPath))
  profilePkg.dsh ??= {}
  profilePkg.dsh.profile ??= {}
  if (!Array.isArray(profilePkg.dsh.profile.bundles)) profilePkg.dsh.profile.bundles = []
  if (!profilePkg.dsh.profile.bundles.includes(pkgName)) {
    profilePkg.dsh.profile.bundles.push(pkgName)
    writeFileSync(packageJsonPath, `${JSON.stringify(profilePkg, null, 2)}\n`, 'utf8')
    console.log(`[3/3] 已写入 profile bundles: ${pkgName}`)
  } else {
    console.log(`[3/3] profile bundles 已包含 ${pkgName}，跳过写入。`)
  }
}

// 4. 提醒两个必需的 harness 本地补丁（存在性尽力检查；路径不同请自行核对）。
console.log('')
console.log('安装完成。请：')
console.log('  1) 重启 dsh web（主进程），浏览器硬刷新（Ctrl+F5）加载客户端；')
console.log('  2) 确认两个 harness 补丁已打（未打则设置页提示“命名空间不可用”，UA 也无法覆盖）：')
console.log('     - packages/host/apiproxy/src/api-proxy.ts   WEB_SETTINGS_NAMESPACES 含 dsh-llm-headers')
console.log('     - packages/llm/llm-pi-ai/src/adapter.ts     requestHeaders() 放开 user-agent 覆盖')
console.log('  3) 到 设置 -> 请求头 区块配置（或写 settings.yaml）。')