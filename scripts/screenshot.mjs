#!/usr/bin/env node
/**
 * Produce the repository screenshot: mounts the real client bundle through
 * the same mock-host pipeline the e2e harness uses, inside a mock DSH chat
 * page, and captures screenshot.png at the repository root.
 */
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'tests', 'e2e', 'dist')
mkdirSync(outDir, { recursive: true })

const FENCE = '`'.repeat(3)
const artifactSources = [
  [
    '<!-- title: 示例：计数器 -->',
    '<style>body{font:14px -apple-system,"PingFang SC",sans-serif;margin:16px;display:flex;gap:10px;align-items:center;background:var(--gui-bg,#fff);color:var(--gui-fg,#111)}button{font-size:15px;padding:6px 16px;border-radius:8px;border:1px solid var(--gui-border,#d0d4dc);background:transparent;color:inherit;cursor:pointer}button:hover{filter:brightness(0.96)}#out{font-size:20px;font-weight:700}</style>',
    '<button id="b">+1</button> <span id="out">0</span>',
    '<script>let n=0;b.onclick=()=>{n++;out.textContent=n};</scr' + 'ipt>',
  ].join('\n'),
  [
    '<!-- title: 示例：BMI 快算 -->',
    '<style>body{font:14px -apple-system,"PingFang SC",sans-serif;margin:16px;background:var(--gui-bg,#fff);color:var(--gui-fg,#111)}label{display:block;margin:8px 0 2px;color:var(--gui-fg-dim,#555)}input{width:120px;padding:5px 8px;border:1px solid var(--gui-border,#d0d4dc);border-radius:6px;font-size:14px;background:transparent;color:inherit}#r{margin-top:10px;font-size:16px;font-weight:600}</style>',
    '<label>身高 (cm)</label><input id="h" value="175">',
    '<label>体重 (kg)</label><input id="w" value="68">',
    '<div id="r">BMI 22.2 · 正常</div>',
    '<script>const f=()=>{const b=+h.value/100,r={18.5:"偏瘦",24:"正常",28:"偏胖",100:"肥胖"};let t="肥胖";for(const k in r){if(b<+k){t=r[k];break}}r.textContent=`BMI ${( +w.value/(b*b)).toFixed(1)} · ${t}`};h.oninput=w.oninput=f;</scr' + 'ipt>',
  ].join('\n'),
]

const harnessJs = `
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { apply, generativeUiTurnDefinition } from './src/client/index'

let registeredDefinition
let turnTailComponents = []
const ctx = {
  effect: (register) => { register() },
  uiConversation: { events: { register(d) { registeredDefinition = d } } },
  slots: {
    inject: (slotName, factory) => { if (slotName === 'conversation.chat.turnTail') turnTailComponents.push(factory()) },
    register: (options, component) => ({ options, component }),
  },
}
apply(ctx)

function matchEvent(event) {
  const m = registeredDefinition.match(event)
  if (!m) return null
  m.event = event
  return m
}

const turns = []
for (const source of ${JSON.stringify(artifactSources)}) {
  const text = ['好的，直接给你两个可以点的组件：', ${JSON.stringify(FENCE)} + 'generative-ui', source, ${JSON.stringify(FENCE)}].join('\\n')
  let state
  for (const event of [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text }] } } },
  ]) {
    const m = matchEvent(event)
    if (!m) continue
    state = m.role === 'start' ? registeredDefinition.start({ state }, m) : registeredDefinition.update({ state }, m)
  }
  const located = registeredDefinition.buildLocationData({ state }, 'turn', null)
  turns.push({ data: new Map([['generative-ui', { arts: located.value.arts }]]) })
}

const [{ component }] = turnTailComponents
createRoot(document.getElementById('root')).render(createElement('div', { className: 'chat' },
  createElement('div', { className: 'msg user' }, '帮我做个能交互的小演示'),
  ...turns.map((turn, i) => createElement(component, { turn, key: i })),
))
window.__shot__ = { ready: true }
`

await build({
  stdin: { contents: harnessJs, resolveDir: root, loader: 'tsx' },
  outfile: path.join(outDir, 'shot-harness.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    react: path.join(root, 'node_modules', 'react', 'index.js'),
    'react/jsx-runtime': path.join(root, 'node_modules', 'react', 'jsx-runtime.js'),
  },
})

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#1b1e26;color:#e8eaf0;font:14px -apple-system,"PingFang SC",sans-serif}
  .chat{max-width:720px;margin:0 auto;padding:28px 20px}
  .msg{border-radius:12px;padding:10px 14px;margin:10px 0;line-height:1.6;color:#e8eaf0}
  .msg.user{background:#2b5fd9;width:fit-content;margin-left:auto}
</style></head><body><div id="root"></div><script src="./shot-harness.js"></script></body></html>`
writeFileSync(path.join(outDir, 'shot.html'), html)

const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://x').pathname === '/' ? 'shot.html' : new URL(req.url, 'http://x').pathname.slice(1)
  try {
    res.setHeader('content-type', name.endsWith('.html') ? 'text/html' : 'text/javascript')
    res.end(await readFile(path.join(outDir, name)))
  } catch { res.statusCode = 404; res.end() }
}).listen(0)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 820, height: 1200 }, deviceScaleFactor: 2 })
await page.goto(`http://127.0.0.1:${server.address().port}/`)
await page.waitForFunction('window.__shot__ && window.__shot__.ready', { timeout: 15000 })
await page.waitForTimeout(600)
// Click the counter once so the screenshot shows a live interaction.
const frame = page.frameLocator('iframe').first()
await frame.locator('#b').click()
await page.locator('.chat').screenshot({ path: path.join(root, 'screenshot.png') })
await browser.close()
server.close()
console.log('screenshot.png written')
