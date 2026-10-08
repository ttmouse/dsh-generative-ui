/**
 * dsh-generative-ui — browser half.
 *
 * Renders ```generative-ui fenced blocks from assistant messages as
 * sandboxed interactive iframes, one card per artifact, attached below the
 * turn that produced them (conversation.chat.turnTail).
 *
 * Data flow (mirrors dsh-taskboard's accumulator pattern):
 *   1. a turn accumulator watches `assistant/message` events and extracts
 *      artifact sources from the message text into per-turn state;
 *   2. the accumulator projects that state onto the turn location
 *      (buildLocationData), so it survives re-renders and reloads —
 *      the artifact lives in the message text, nothing is stored elsewhere;
 *   3. a turnTail card reads the projected state and mounts one sandboxed
 *      iframe per artifact (`sandbox="allow-scripts"`, no same-origin:
 *      an artifact can never reach the host, cookies, or storage).
 *
 * Height: each artifact document reports its own height via postMessage
 * (injected bootstrap + ResizeObserver); the card clamps it to a maximum
 * and lets the iframe scroll internally beyond that.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

const TURN_KEY = 'generative-ui'
/** One extracted artifact: stable id, display title, raw HTML source. */
interface Artifact { id: string; title: string; source: string }

/** Shape of the accumulator match event (subset the plugin consumes). */
interface TurnMatch {
  event: { type: string; data?: { turn?: unknown; message?: { content?: unknown } } }
}

/** Accumulator state for one turn. */
interface TurnState { turn: unknown; arts: Artifact[] }

/** Projected per-turn location record. */
interface TurnLocation { kind: 'turn'; turn: unknown; key: string; value: { arts: Artifact[] } }

/** The turn object handed to turnTail slot components. */
interface TurnLike { data?: Map<string, { arts?: Artifact[] }> | { get(key: string): { arts?: Artifact[] } } | null }

/** Minimal client context contract used by this plugin. */
interface GenerativeUiContext {
  effect: (register: () => () => void, label: string) => void
  uiConversation: { events: { register(definition: unknown): () => void } }
  slots: {
    inject: (slotName: string, factory: () => unknown) => () => void
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
}

const FENCE_RE = /```generative-ui[^\n]*\n([\s\S]*?)```/g
const TITLE_RE = /<!--\s*title:\s*(.+?)\s*-->/
const MAX_HEIGHT = 600
const MIN_HEIGHT = 120

/** djb2 over the source: stable per artifact, good enough for keys. */
function hashSource(source: string): string {
  let hash = 5381
  for (let i = 0; i < source.length; i += 1) hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0
  return (hash >>> 0).toString(36)
}

/** Extract one artifact record per ```generative-ui fence in a text. */
export function extractArtifacts(text: unknown): Artifact[] {
  if (typeof text !== 'string' || !text.includes('```generative-ui')) return []
  const artifacts: Artifact[] = []
  for (const match of text.matchAll(FENCE_RE)) {
    const source = match[1]
    if (!source.trim()) continue
    const title = (source as string).match(TITLE_RE)?.[1] ?? `工件 #${artifacts.length + 1}`
    artifacts.push({ id: hashSource(source), title: title.slice(0, 60), source })
  }
  return artifacts
}

/** Height-reporting bootstrap injected into every artifact document. */
const BOOTSTRAP = `<script>(function(){
  var last=0;
  function report(){
    var h=Math.ceil(document.documentElement.getBoundingClientRect().height);
    if(h>0&&h!==last){last=h;parent.postMessage({type:"generative-ui:height",height:h},"*")}
  }
  new ResizeObserver(report).observe(document.documentElement);
  window.addEventListener("load",report);report();
})()</script>`

/** Build the sandboxed document for one artifact. */
export function artifactDocument(source: string): string {
  const body: string = /<html[\s>]/i.test(source) ? source : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${source}</body></html>`
  return body.includes('</body>') ? body.replace('</body>', `${BOOTSTRAP}</body>`) : body + BOOTSTRAP
}

/** The turn accumulator: assistant text → per-turn artifact list. */
export const generativeUiTurnDefinition = {
  kind: TURN_KEY,
  match(event: { type: string; data?: { turn?: unknown } }) {
    if (event.type === 'turn/start' && event.data?.turn !== undefined) return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'assistant/message' && event.data?.turn !== undefined) return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start(_context: unknown, match: TurnMatch) {
    return { turn: match.event.data?.turn, arts: [] }
  },
  update(context: { state: TurnState | undefined }, match: TurnMatch) {
    if (context.state === undefined || match.event.type !== 'assistant/message') return context.state
    const blocks = match.event.data?.message?.content
    const texts: string[] = Array.isArray(blocks) ? blocks.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text) : []
    const arts = texts.flatMap(extractArtifacts)
    if (arts.length === 0) return context.state
    const known = new Set(context.state.arts.map((art: Artifact) => art.id))
    const merged = [...context.state.arts, ...arts.filter((art) => !known.has(art.id))]
    return merged === context.state.arts ? context.state : { ...context.state, arts: merged }
  },
  buildLocationData(context: { state: TurnState | undefined }, scope: string, previous: TurnLocation | null) {
    if (scope !== 'turn' || context.state === undefined || context.state.arts.length === 0) return null
    const state = context.state
    if (previous?.kind === 'turn' && previous.turn === state.turn && previous.key === TURN_KEY && previous.value?.arts === state.arts) return previous
    return { kind: 'turn', turn: state.turn, key: TURN_KEY, value: { arts: state.arts } }
  },
}

/** Read the projected artifact list off a turn object. */
function readTurnArtifacts(turn: TurnLike): Artifact[] {
  const data = turn?.data
  const value = data === null || data === undefined ? undefined
    : typeof data.get === 'function' ? data.get(TURN_KEY)
    : data instanceof Map ? data.get(TURN_KEY)
    : undefined
  return Array.isArray(value?.arts) ? value.arts : []
}

/** One sandboxed artifact card. */
function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState(280)
  const [ready, setReady] = useState(false)
  const document_ = useMemo(() => artifactDocument(artifact.source), [artifact.source])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return
      if (event.data?.type !== 'generative-ui:height') return
      const value = Number(event.data.height)
      if (Number.isFinite(value)) setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value)))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const openStandalone = () => {
    const url = URL.createObjectURL(new Blob([document_], { type: 'text/html' }))
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div style={{ border: '1px solid var(--dsw-alias-border-l1, #ddd)', borderRadius: 12, overflow: 'hidden', background: 'var(--dsw-alias-bg-base, #fff)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--dsw-alias-border-l2, #eee)', background: 'var(--dsw-alias-bg-subtle, #fafafa)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'linear-gradient(135deg,#7c5cff,#38bdf8)', flex: 'none' }} />
        <strong style={{ fontSize: 12, color: 'var(--dsw-alias-label-primary, #1f1f1f)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artifact.title}</strong>
        {!ready && <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #999)' }}>渲染中…</span>}
        <button type="button" onClick={() => setHeight((current) => (current >= MAX_HEIGHT ? 280 : MAX_HEIGHT))} title="展开 / 收起"
          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1, #ddd)', background: 'transparent', color: 'var(--dsw-alias-label-secondary, #666)', cursor: 'pointer' }}>
          {height >= MAX_HEIGHT ? '收起' : '展开'}
        </button>
        <button type="button" onClick={openStandalone} title="在新窗口打开"
          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1, #ddd)', background: 'transparent', color: 'var(--dsw-alias-label-secondary, #666)', cursor: 'pointer' }}>
          新窗口
        </button>
      </div>
      <iframe
        ref={frameRef}
        title={artifact.title}
        sandbox="allow-scripts"
        srcDoc={document_}
        onLoad={() => setReady(true)}
        style={{ display: 'block', width: '100%', height, border: 0, background: '#fff', opacity: ready ? 1 : 0.4, transition: 'opacity 160ms ease, height 140ms ease' }}
      />
    </div>
  )
}

/** turnTail card: one row per artifact in this turn. */
function GenerativeUiTurnCard({ turn }: { turn: TurnLike }) {
  const artifacts = readTurnArtifacts(turn)
  if (artifacts.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
      {artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)}
    </div>
  )
}

export const inject = ['locale', 'slots', 'uiConversation']

export function apply(ctx: GenerativeUiContext): void {
  ctx.effect(
    () => ctx.uiConversation.events.register(generativeUiTurnDefinition),
    'dsh-generative-ui: turn artifact accumulator',
  )
  ctx.effect(
    () => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
      name: 'conversation.chat.turnTail',
      id: 'generative-ui',
      order: 10,
    }, GenerativeUiTurnCard)),
    'dsh-generative-ui: turn-tail artifact cards',
  )
}
