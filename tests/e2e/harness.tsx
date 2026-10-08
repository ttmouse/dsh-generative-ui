/**
 * E2E harness: drives the real client apply() against a mock host context in
 * a real browser. Verifies the full chain:
 *   synthetic assistant/message event → accumulator → turnTail card mount →
 *   sandboxed iframe renders the artifact → postMessage height lands.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { apply, generativeUiTurnDefinition } from '../../src/client/index'

let registeredDefinition
let turnTailComponents = []
const ctx = {
  effect: (register) => { register() },
  uiConversation: {
    events: {
      register(definition) { registeredDefinition = definition },
    },
  },
  slots: {
    inject: (slotName, factory) => {
      if (slotName === 'conversation.chat.turnTail') turnTailComponents.push(factory())
    },
    register: (options, component) => ({ options, component }),
  },
}

apply(ctx)

function matchEvent(event) {
  const match = registeredDefinition.match(event)
  if (!match) return null
  match.event = event
  return match
}

// Simulate one turn that emits one artifact.
const FENCE = String.fromCharCode(96).repeat(3)
const artifactSource = [
  '<!-- title: E2E 计数器 -->',
  '<style>body{font:14px -apple-system;margin:16px}button{font-size:16px;padding:6px 14px}</style>',
  '<button id="b">点我</button> <strong id="out">0</strong>',
  '<script>' + 'let cnt=0' + ';var out=document.getElementById("out")' + ';b.onclick=function(){cnt++;out.textContent=cnt};' + '</scr' + 'ipt>',
].join('\n')
const artifactText = ['回答正文', FENCE + 'generative-ui', artifactSource, FENCE].join('\n')
const events = [
  { type: 'turn/start', data: { turn: 1 } },
  {
    type: 'assistant/message',
    data: {
      turn: 1,
      message: {
        content: [
          { type: 'text', text: artifactText },
        ],
      },
    },
  },
]

let state
for (const event of events) {
  const match = matchEvent(event)
  if (!match) continue
  state = match.role === 'start'
    ? registeredDefinition.start({ state }, match)
    : registeredDefinition.update({ state }, match)
}
const located = registeredDefinition.buildLocationData({ state }, 'turn', null)
if (!located || located.value.arts.length !== 1) throw new Error('accumulator did not project the artifact')

// Mount the turnTail component the way the host would: turn.data carries the
// projected location values keyed by accumulator kind.
const container = document.getElementById('root')
const turn = { data: new Map([['generative-ui', { arts: located.value.arts }]]) }
const [{ component }] = turnTailComponents
createRoot(container).render(createElement(component, { turn }))

window.__e2e__ = { ready: true }
