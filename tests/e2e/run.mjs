#!/usr/bin/env node
/**
 * E2E: bundle the harness, load it in headless Chromium, and assert:
 *   1. the artifact card mounts with the extracted title,
 *   2. the iframe is truly sandboxed (no allow-same-origin),
 *   3. the artifact's script runs and the height report lands,
 *   4. clicking the button inside the sandboxed artifact works.
 */
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = path.join(root, 'tests', 'e2e', 'dist')
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [path.join(root, 'tests', 'e2e', 'harness.tsx')],
  outfile: path.join(outDir, 'harness.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    // esbuild resolves 'react' to two copies (one for react-dom); force one.
    react: path.join(root, 'node_modules', 'react', 'index.js'),
    'react/jsx-runtime': path.join(root, 'node_modules', 'react', 'jsx-runtime.js'),
  },
})

writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><html><body>
<div id="root"></div><script src="./harness.js"></script></body></html>`)

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

// file:// silences sandboxed srcdoc scripts; serve over loopback http.
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://x').pathname === '/' ? 'index.html' : new URL(req.url, 'http://x').pathname.slice(1)
  try {
    res.setHeader('content-type', name.endsWith('.html') ? 'text/html' : 'text/javascript')
    res.end(await readFile(path.join(outDir, name)))
  } catch { res.statusCode = 404; res.end() }
}).listen(0)
const port = server.address().port

const browser = await chromium.launch()
const page = await browser.newPage()
const heightMessages = []
page.on('console', (msg) => { if (msg.type() === 'error') failures.push(`console error: ${msg.text()}`) })
await page.exposeFunction('noteHeight', (h) => heightMessages.push(h))
// The artifact's bootstrap reports its height at load; listen from the start.
await page.addInitScript(() => window.addEventListener('message', (e) => {
  if (e.data?.type === 'generative-ui:height') window.noteHeight(e.data.height)
}))

await page.goto(`http://127.0.0.1:${port}/`)
await page.waitForFunction('window.__e2e__ && window.__e2e__.ready')

const card = page.locator('#root > div > iframe').first()
check('bare iframe mounts (no card chrome)', await card.count() === 1)
check('title extracted', (await page.locator('#root iframe').first().getAttribute('title')) === 'E2E 计数器')

const sandbox = await page.locator('#root iframe').getAttribute('sandbox')
check('iframe sandboxed without same-origin', sandbox === 'allow-scripts', `sandbox="${sandbox}"`)

// Trigger a second report: nudge a resize inside the artifact frame.
await page.waitForTimeout(400)
check('height report received', heightMessages.some((h) => h >= 30), `heights=${JSON.stringify(heightMessages)}`)

// Interact inside the sandboxed artifact.
const frame = page.frameLocator('#root iframe')
await frame.locator('#b').click()
check('artifact interaction works', (await frame.locator('#out').textContent()) === '1')

// Source dedup: a markdown-rendered copy of the artifact source must be hidden.
await page.evaluate(() => {
  const pre = document.createElement('pre')
  pre.textContent = window.__e2e__.artifactSource
  pre.id = 'fake-rendered-source'
  document.body.appendChild(pre)
})
await page.waitForFunction('document.getElementById("fake-rendered-source").style.display === "none"', null, { timeout: 3000 })
check('duplicate source code block hidden', true)

// Streaming: feed progressively longer live tails; the live card must grow
// with debounced srcdoc updates, then disappear once the fence closes.
await page.evaluate(() => window.__e2e__.mountWithLive('<button id="live">生'))
check('live card mounts while fence is open', await page.evaluate(() => {
  const frame = document.querySelector('#root iframe[title="正在生成…"]')
  return frame !== null && frame.getAttribute('sandbox') === 'allow-scripts'
}))
const grew = await page.evaluate(async () => {
  const seen = []
  for (const chunk of ['<button id="live">生成中</button>', '<button id="live">生成中 — 更长的一段</button><p>更多内容</p>']) {
    window.__e2e__.mountWithLive(chunk)
    await new Promise((r) => setTimeout(r, 180))
    const frame = document.querySelector('#root iframe[title="正在生成…"]')
    seen.push(frame ? frame.srcdoc.length : -1)
  }
  return seen
})
check('live card srcdoc updates with stream', grew.every((v) => v >= 0) && grew[1] > grew[0], `srcdoc lengths=${JSON.stringify(grew)}`)
await page.evaluate(() => window.__e2e__.mountWithLive(null))
check('live card clears when fence closes', await page.evaluate(() => document.querySelector('#root iframe[title="正在生成…"]') === null))

// Theme sync: the document carries a theme bootstrap and applies pushed vars.
const themeBootstrap = await page.evaluate(() => {
  const frame = document.querySelector('#root iframe')
  return { hasListener: frame.srcdoc.includes('generative-ui:theme'), inlinesVars: frame.srcdoc.includes(':root{--gui-') }
})
check('theme bootstrap present (listener + first-paint vars)', themeBootstrap.hasListener && themeBootstrap.inlinesVars, JSON.stringify(themeBootstrap))

await page.screenshot({ path: path.join(outDir, 'e2e.png'), fullPage: true })
await browser.close()
server.close()

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`, failures)
  process.exit(1)
}
console.log('\nE2E: all checks passed')
