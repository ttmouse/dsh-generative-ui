#!/usr/bin/env node
/**
 * Build the plugin halves with esbuild:
 *   src/client/index.tsx → lib/client.js   (browser half, ModuleLoader bundle)
 *   src/host/index.ts    → lib/index.mjs   (host half, plain ESM)
 */
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_ID = '@ttmouse/dsh-generative-ui'

await mkdir(path.join(root, 'lib'), { recursive: true })

await build({
  entryPoints: [path.join(root, 'src', 'client', 'index.tsx')],
  outfile: path.join(root, 'lib', 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  banner: {
    // The loader handoff wraps the whole CJS body; the module/exports vars
    // must exist before esbuild's own `module.exports = ...` assignments.
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
})

await build({
  entryPoints: [path.join(root, 'src', 'host', 'index.ts')],
  outfile: path.join(root, 'lib', 'index.mjs'),
  bundle: false,
  format: 'esm',
  platform: 'node',
  target: 'node22',
})

console.log('[build] wrote lib/client.js and lib/index.mjs')
