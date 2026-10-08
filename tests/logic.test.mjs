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
const { extractArtifacts, artifactDocument, generativeUiTurnDefinition } = globalThis.plugin

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

test('artifactDocument wraps fragments and injects the height bootstrap exactly once', () => {
  const doc = artifactDocument('<p>hi</p>')
  assert.ok(doc.startsWith('<!doctype html>'))
  assert.ok(doc.includes('generative-ui:height'))
  assert.equal(doc.match(/generative-ui:height/g).length, 1)
  const full = artifactDocument('<html><head></head><body><p>x</p></body></html>')
  assert.ok(full.startsWith('<html>'))
  assert.ok(full.includes('generative-ui:height'))
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

test('buildLocationData projects turn-scoped state and skips empty turns', () => {
  const context = { state: { turn: 7, arts: [{ id: 'x', title: 't', source: '<p/>' }] } }
  const located = generativeUiTurnDefinition.buildLocationData(context, 'turn', null)
  assert.equal(located.kind, 'turn')
  assert.equal(located.value.arts.length, 1)
  assert.equal(generativeUiTurnDefinition.buildLocationData({ state: { turn: 7, arts: [] } }, 'turn', null), null)
  assert.equal(generativeUiTurnDefinition.buildLocationData(context, 'step', null), null)
  assert.equal(generativeUiTurnDefinition.buildLocationData(context, 'turn', located), located)
})
