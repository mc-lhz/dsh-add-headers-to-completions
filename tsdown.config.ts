/**
 * dsh-llm-headers — 客户端 bundle 构建配置（tsdown，弹射自 dsh-web-ui 的
 * clientBundle 模板，按外部插件裁剪为仅客户端产物）。
 *
 * 产物格式：closure-factory —— bundle 调用
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * 外链（external）走 loader 模块表注入的 require：react / react-dom /
 * @deepseek-ai/* 平台模块；它们由 shell 种子表提供，不打包进本 bundle。
 * 样式不经过 CSS Modules 管线：见 src/client/styles.ts（TS 内嵌 + 自注入
 * <style data-plugin>，loader 卸载时随 data-plugin 移除）。
 *
 * 注意：本配置只产出 lib/client.js；node 半边 index.js 为手写零依赖 ESM，
 * 无需构建（也不参与 tsdown）。
 */
import type { UserConfig } from 'tsdown'

/** 产物插件 id（包名）—— 烙进 ModuleLoader 移交与样式标签。 */
const PLUGIN_ID = 'dsh-llm-headers'

/** shell 种子模块表（与 dsh-client-web/src/platform.ts 同源）。 */
const PLATFORM_MODULES: readonly string[] = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

/** 文档化临时豁免：snapshot-store 引擎位于 runtime，属平台表外的唯一外链。 */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

/** 加载器模块表可应答的全部外链。 */
const EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

export default {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  // 浏览器产物落在 lib/（与 node 半边同目录）；entryFileNames 钉死为
  // 精确的 lib/client.js。clean 必须关闭（默认 clean 会清掉无关产物）。
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...EXTERNALS],
  // zustand 类依赖探测 process.env.NODE_ENV / import.meta.env.MODE；
  // CJS 产物必须替换，否则 factory 启动即 ReferenceError。
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  // 非平台模块全部内联（wire/类型层、clsx 等），表外 require 注定运行时抛错。
  noExternal: (id: string) => (EXTERNALS.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} satisfies UserConfig