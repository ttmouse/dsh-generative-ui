/**
 * Unit tests for the pure artifact logic (extraction + document assembly +
 * accumulator transitions). The client bundle is a browser CJS blob wrapped
 * in window.__ModuleLoader__; the tests shim the loader and require().
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const react = {
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useState: (init) => [init, () => {}],
  useMemo: (factory) => factory(),
}
const jsxRuntime = { jsx: () => null }
const require = (name) => {
  if (name === 'react') return react
  if (name === 'react/jsx-runtime') return jsxRuntime
  throw new Error(`unexpected require: ${name}`)
}

globalThis.window = {
  __ModuleLoader__: {
    load({ factory }) {
      globalThis.plugin = factory(require)
    },
  },
}

await readFile(path.join(root, 'lib', 'client.js'), 'utf8').then(eval)
const { extractArtifacts, extractStreamingTail, artifactDocument, themeVarsToCss, generativeUiTurnDefinition, DESIGN_SYSTEM_CSS, auditArtifactSource } = globalThis.plugin

test('extracts every generative-ui fence with a stable id and title', () => {
  const text = [
    '前文',
    '```generative-ui',
    '<!-- title: 计数器 -->',
    '<button>x</button>',
    '```',
    '中间的 ```js code()``` 围栏不算',
    '```generative-ui',
    '<p>第二个</p>',
    '```',
  ].join('\n')
  const arts = extractArtifacts(text)
  assert.equal(arts.length, 2)
  assert.equal(arts[0].title, '计数器')
  assert.equal(arts[1].title, '工件 #2')
  assert.equal(arts[0].id, extractArtifacts(text)[0].id)
  assert.notEqual(arts[0].id, arts[1].id)
})

test('ignores text without generative-ui fences, and empty fences', () => {
  assert.deepEqual(extractArtifacts('```js\ncode()\n```'), [])
  assert.deepEqual(extractArtifacts('```generative-ui\n   \n```'), [])
  assert.deepEqual(extractArtifacts(42), [])
})

test('extractStreamingTail returns the partial source of the trailing unclosed fence', () => {
  // Mid-stream: marker present, closing fence not yet emitted.
  const partial = '前文\n```generative-ui\n<button>x</button>\n<style>body{c'
  assert.equal(extractStreamingTail(partial), '<button>x</button>\n<style>body{c')
  // Closed fence → not streaming.
  assert.equal(extractStreamingTail('```generative-ui\n<p>a</p>\n```'), null)
  // No fence at all, non-string, or nothing after the marker line yet.
  assert.equal(extractStreamingTail('没有围栏'), null)
  assert.equal(extractStreamingTail(42), null)
  assert.equal(extractStreamingTail('```generative-ui'), null)
  // Empty right after the marker line.
  assert.equal(extractStreamingTail('```generative-ui\n'), null)
})

test('artifactDocument wraps fragments and injects the height bootstrap exactly once', () => {
  const doc = artifactDocument('<p>hi</p>')
  assert.ok(doc.startsWith('<!doctype html>'))
  assert.ok(doc.includes('generative-ui:height'))
  assert.equal(doc.match(/generative-ui:height/g).length, 1)
  const full = artifactDocument('<html><head></head><body><p>x</p></body></html>')
  assert.ok(full.startsWith('<html>'))
  assert.ok(full.includes('generative-ui:height'))
})

test('artifactDocument inlines theme CSS and the bootstrap applies theme pushes', () => {
  const doc = artifactDocument('<p>hi</p>', ':root{--gui-bg:#111}')
  assert.ok(doc.includes(':root{--gui-bg:#111}'))
  // The bootstrap listens for host theme pushes (opaque origin: postMessage only).
  assert.ok(doc.includes('generative-ui:theme'))
  assert.ok(doc.includes('e.source!==parent'))
})

test('themeVarsToCss serializes non-empty maps and skips empty ones', () => {
  assert.equal(themeVarsToCss({}), '')
  assert.equal(themeVarsToCss({ '--gui-bg': '#fff', '--gui-fg': '#000' }), ':root{--gui-bg:#fff;--gui-fg:#000}')
})

test('artifactDocument injects the design system before the artifact markup', () => {
  const doc = artifactDocument('<p>hi</p>')
  // Surface ramp, reset and utilities travel with every artifact.
  for (const token of ['--gui-surface-1', '--gui-surface-2', '--gui-surface-3', '--gui-tint', '--gui-radius', '--gui-gap',
    '--gui-fs-title', '--gui-fs-body', '--gui-fs-caption', '--gui-ease', '--gui-pad', '--gui-radius-sm']) {
    assert.ok(doc.includes(token), `missing ${token}`)
  }
  for (const utility of ['.gui-section', '.gui-card', '.gui-chip', '.gui-label', '.gui-desc', '.gui-note', '.gui-grid']) {
    assert.ok(doc.includes(utility), `missing ${utility}`)
  }
  // Outer spacing is enforced, not merely suggested.
  assert.ok(doc.includes('html,body{margin:0!important;padding:0!important}'))
  // A base font keeps artifacts off the browser's default serif.
  assert.ok(doc.includes('-apple-system'))
  // The design system precedes the artifact body so authors can still override it.
  assert.ok(doc.indexOf(DESIGN_SYSTEM_CSS) < doc.indexOf('<body><p>hi</p>'))
})

test('artifactDocument injects the design system into full documents too', () => {
  const full = artifactDocument('<html><head><meta charset="utf-8"></head><body><p>x</p></body></html>')
  assert.ok(full.includes(DESIGN_SYSTEM_CSS))
  assert.ok(full.indexOf(DESIGN_SYSTEM_CSS) < full.indexOf('</head>'))
  const noHead = artifactDocument('<html><body><p>y</p></body></html>')
  assert.ok(noHead.includes(DESIGN_SYSTEM_CSS))
})

test('auditArtifactSource reports rule violations and accepts a compliant artifact', () => {
  assert.deepEqual(auditArtifactSource('<div class="gui-section"><p class="gui-desc">ok</p></div>'), [])
  assert.deepEqual(auditArtifactSource('<div style="border:1px solid red"></div>'), ['border'])
  assert.deepEqual(auditArtifactSource('<div style="border:0;border-radius:8px"></div>'), [])
  assert.deepEqual(auditArtifactSource('<div style="box-shadow:0 1px 2px #333"></div>'), ['shadow'])
  assert.deepEqual(auditArtifactSource('<div style="background:linear-gradient(red,blue)"></div>'), ['gradient'])
  assert.deepEqual(auditArtifactSource('<body style="padding:20px"></body>'), ['body-spacing'])
  assert.deepEqual(auditArtifactSource('<style>body{padding:12px}</style>'), ['body-spacing'])
  assert.deepEqual(auditArtifactSource('<style>body{margin:0}</style>'), [])
  assert.deepEqual(auditArtifactSource('<!-- note --><p>a</p>'), ['comment'])
  assert.deepEqual(auditArtifactSource('<div style="border:1px solid red;box-shadow:0 0 1px #000"></div>'), ['border', 'shadow', 'pure-color'])
  assert.deepEqual(auditArtifactSource('<p>收入增长 \u2014 翻倍</p>'), ['em-dash'])
  assert.deepEqual(auditArtifactSource('<p>一站式赋能</p>'), ['buzzword'])
  assert.deepEqual(auditArtifactSource('<div style="background:#fff"></div>'), ['pure-color'])
  assert.deepEqual(auditArtifactSource('<p style="background:var(--gui-bg)">ok</p>'), [])
})

function runAccumulator(events) {
  let state
  for (const event of events) {
    const match = generativeUiTurnDefinition.match(event)
    if (!match) continue
    match.event = event // the host attaches the source event to every match
    if (match.role === 'start') state = generativeUiTurnDefinition.start({ state }, match)
    else state = generativeUiTurnDefinition.update({ state }, match)
  }
  return state
}

const message = (text) => ({ type: 'text', text })

test('accumulator collects artifacts per turn and dedupes across messages', () => {
  const events = [
    { type: 'turn/start', data: { turn: 7 } },
    { type: 'assistant/message', data: { turn: 7, message: { content: [message('```generative-ui\n<p>a</p>\n```')] } } },
    { type: 'assistant/message', data: { turn: 7, message: { content: [message('```generative-ui\n<p>a</p>\n```'), message('```generative-ui\n<p>b</p>\n```')] } } },
    { type: 'assistant/message', data: { turn: 8, message: { content: [message('no artifacts')] } } },
  ]
  const state = runAccumulator(events)
  assert.equal(state.turn, 7)
  assert.equal(state.arts.length, 2)
})

test('accumulator tracks the streaming tail while the fence is open, then settles', () => {
  const events = [
    { type: 'turn/start', data: { turn: 9 } },
    { type: 'assistant/message', data: { turn: 9, message: { content: [message('```generative-ui\n<but')] } } },
    { type: 'assistant/message', data: { turn: 9, message: { content: [message('```generative-ui\n<button>x</button>\n</div')] } } },
    // Fence closes: the closed artifact takes over, live tail clears.
    { type: 'assistant/message', data: { turn: 9, message: { content: [message('```generative-ui\n<button>x</button>\n```\n后续文本')] } } },
  ]
  const located1 = generativeUiTurnDefinition.buildLocationData(
    { state: runAccumulator(events.slice(0, 2)) }, 'turn', null)
  assert.equal(located1.value.live, '<but')
  assert.equal(located1.value.arts.length, 0)

  const located2 = generativeUiTurnDefinition.buildLocationData(
    { state: runAccumulator(events.slice(0, 3)) }, 'turn', null)
  assert.equal(located2.value.live, '<button>x</button>\n</div')

  const finalState = runAccumulator(events)
  assert.equal(finalState.liveSource, null)
  assert.equal(finalState.arts.length, 1)
  const located3 = generativeUiTurnDefinition.buildLocationData({ state: finalState }, 'turn', null)
  assert.equal(located3.value.live, null)
  assert.equal(located3.value.arts.length, 1)
  // Projection is stable across rebuilds with the same state.
  assert.equal(generativeUiTurnDefinition.buildLocationData({ state: finalState }, 'turn', located3), located3)
})

test('buildLocationData projects turn-scoped state and skips empty turns', () => {
  const context = { state: { turn: 7, arts: [{ id: 'x', title: 't', source: '<p/>' }] } }
  const located = generativeUiTurnDefinition.buildLocationData(context, 'turn', null)
  assert.equal(located.kind, 'turn')
  assert.equal(located.value.arts.length, 1)
  assert.equal(generativeUiTurnDefinition.buildLocationData({ state: { turn: 7, arts: [] } }, 'turn', null), null)
  assert.equal(generativeUiTurnDefinition.buildLocationData(context, 'step', null), null)
  assert.equal(generativeUiTurnDefinition.buildLocationData(context, 'turn', located), located)
})
