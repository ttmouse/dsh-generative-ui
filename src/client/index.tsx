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
interface TurnState { turn: unknown; arts: Artifact[]; liveSource: string | null }

/** Projected per-turn location record. */
interface TurnLocation { kind: 'turn'; turn: unknown; key: string; value: { arts: Artifact[]; live: string | null } }

/** The turn object handed to turnTail slot components. */
interface TurnLike { data?: Map<string, { arts?: Artifact[]; live?: string | null }> | { get(key: string): { arts?: Artifact[]; live?: string | null } } | null }

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
const FENCE_MARKER = '```generative-ui'
const MAX_HEIGHT = 600
const MIN_HEIGHT = 120
/** Streaming re-render cadence (ported from Reasonix PR #5749). */
const RENDER_DEBOUNCE_MS = 100
const RENDER_MAX_WAIT_MS = 500

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
    const title = (source as string).match(TITLE_RE)?.[1]
    const cleanTitle = title?.trim() ? title.trim().slice(0, 60) : `工件 #${artifacts.length + 1}`
    artifacts.push({ id: hashSource(source), title: cleanTitle, source })
  }
  return artifacts
}

/**
 * The still-unclosed trailing ```generative-ui fence while the model is
 * streaming: the partial source that lets a card grow during generation.
 * Returns null once every fence in the text is closed (or none exists).
 */
export function extractStreamingTail(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const start = text.lastIndexOf(FENCE_MARKER)
  if (start === -1) return null
  const rest = text.slice(start + FENCE_MARKER.length)
  if (rest.includes('```')) return null
  const newline = rest.indexOf('\n')
  const source = newline === -1 ? '' : rest.slice(newline + 1)
  return source.trim() ? source : null
}

/**
 * Host CSS variables mapped to the standard names injected into every artifact
 * document (ported from Reasonix PR #5749). The widget renders in an
 * opaque-origin sandbox, so the host cannot set styles imperatively — theme
 * travels in via srcdoc for first paint and via postMessage for later switches.
 */
const HOST_VAR_MAP: Record<string, string[]> = {
  '--gui-bg': ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--background'],
  '--gui-bg-soft': ['--dsw-alias-bg-layer-2', '--dsw-alias-bg-secondary'],
  '--gui-fg': ['--dsw-alias-label-primary', '--foreground'],
  '--gui-fg-dim': ['--dsw-alias-label-secondary', '--muted-foreground'],
  '--gui-border': ['--dsw-alias-border-l1', '--border'],
  '--gui-accent': ['--dsw-alias-brand-primary', '--dsw-alias-accent', '--accent', '#3b82f6'],
}

/** Read the host theme variables into a plain map (first missing entry wins). */
export function collectThemeVars(): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return out
  const style = getComputedStyle(document.documentElement)
  for (const [std, hosts] of Object.entries(HOST_VAR_MAP)) {
    for (const host of hosts) {
      // Literal-color entries (e.g. "#3b82f6") are last-resort defaults used
      // when the host defines none of the variables in the list.
      const value = host.startsWith('#') ? host : style.getPropertyValue(host).trim()
      if (value) { out[std] = value; break }
    }
  }
  // Theme sampling fallback: the host may not define any of the mapped
  // variable names (different theme system, or a plain build). Sample the
  // host's actual computed background/foreground so artifacts still follow
  // the host's light/dark mode instead of every artifact defaulting to white.
  const bodyStyle = getComputedStyle(document.body)
  if (!out['--gui-bg'] || !out['--gui-fg']) {
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const probeStyle = getComputedStyle(probe)
    const bg = bodyStyle.backgroundColor
    const fg = probeStyle.color || bodyStyle.color
    probe.remove()
    const opaque = (c: string) => c && !/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(c)
    if (!out['--gui-bg'] && opaque(bg)) out['--gui-bg'] = bg
    if (!out['--gui-fg'] && opaque(fg)) out['--gui-fg'] = fg
  }
  return out
}

/** Serialize a theme-var map as a :root declaration block. */
export function themeVarsToCss(vars: Record<string, string>): string {
  const decls = Object.entries(vars).map(([k, v]) => `${k}:${v}`)
  return decls.length > 0 ? `:root{${decls.join(';')}}` : ''
}

/** Height + theme bootstrap injected into every artifact document. */
const BOOTSTRAP = `<script>(function(){
  var last=0;
  function report(){
    var h=Math.ceil(document.documentElement.getBoundingClientRect().height);
    if(h>0&&h!==last){last=h;parent.postMessage({type:"generative-ui:height",height:h},"*")}
  }
  new ResizeObserver(report).observe(document.documentElement);
  window.addEventListener("load",report);report();
  window.addEventListener("message",function(e){
    if(e.source!==parent)return;
    var d=e.data;
    if(d&&d.type==="generative-ui:theme"&&d.vars){
      var r=document.documentElement;
      for(var k in d.vars){if(k.indexOf("--")===0)r.style.setProperty(k,String(d.vars[k]))}
      report();
    }
  });
})()</script>`

/** Build the sandboxed document for one artifact (themeCss inlined for first paint). */
export function artifactDocument(source: string, themeCss: string = ''): string {
  // Default base: follow the host theme via the injected --gui-* variables,
  // and let form controls pick up the right scheme. Artifacts that set their
  // own colors simply override these.
  const base = '<style>:root{color-scheme:light dark}body{background:var(--gui-bg,transparent);color:var(--gui-fg,#111)}</style>'
  const body: string = /<html[\s>]/i.test(source) ? source : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${base}${themeCss ? `<style>${themeCss}</style>` : ''}</head><body>${source}</body></html>`
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
    return { turn: match.event.data?.turn, arts: [], liveSource: null }
  },
  update(context: { state: TurnState | undefined }, match: TurnMatch) {
    if (context.state === undefined || match.event.type !== 'assistant/message') return context.state
    const blocks = match.event.data?.message?.content
    const texts: string[] = Array.isArray(blocks) ? blocks.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text) : []
    const joined = texts.join('\n')
    const arts = extractArtifacts(joined)
    const liveSource = extractStreamingTail(joined)
    if (arts.length === 0 && liveSource === null) return context.state
    const known = new Set(context.state.arts.map((art: Artifact) => art.id))
    const merged = [...context.state.arts, ...arts.filter((art) => !known.has(art.id))]
    const liveChanged = (context.state.liveSource ?? null) !== liveSource
    if (merged === context.state.arts && !liveChanged) return context.state
    return { ...context.state, arts: merged, liveSource }
  },
  buildLocationData(context: { state: TurnState | undefined }, scope: string, previous: TurnLocation | null) {
    if (scope !== 'turn' || context.state === undefined || (context.state.arts.length === 0 && (context.state.liveSource ?? null) === null)) return null
    const state = context.state
    const live = state.liveSource ?? null
    if (previous?.kind === 'turn' && previous.turn === state.turn && previous.key === TURN_KEY
      && previous.value?.arts === state.arts && previous.value?.live === live) return previous
    return { kind: 'turn', turn: state.turn, key: TURN_KEY, value: { arts: state.arts, live } }
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

/** Read the projected streaming tail off a turn object. */
function readTurnLive(turn: TurnLike): string | null {
  const data = turn?.data
  const value = data === null || data === undefined ? undefined
    : typeof data.get === 'function' ? data.get(TURN_KEY)
    : data instanceof Map ? data.get(TURN_KEY)
    : undefined
  return typeof value?.live === 'string' && value.live ? value.live : null
}

/** One sandboxed artifact. Renders bare — no card chrome, no buttons: the
 *  artifact sits inline in the conversation flow like any other message
 *  content. `streaming` = source still growing (live tail). */
function ArtifactCard({ artifact, streaming = false }: { artifact: Artifact; streaming?: boolean }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState(280)
  const [ready, setReady] = useState(false)
  const firstThemeVars = useMemo(() => themeVarsToCss(collectThemeVars()), [])
  // Streaming cards coalesce srcdoc re-renders (first paint immediate; then a
  // 100ms debounce with a 500ms max wait so the frame never lags a token burst).
  const [renderedSource, setRenderedSource] = useState(artifact.source)
  const lastRenderAt = useRef(0)
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!streaming) { setRenderedSource(artifact.source); return }
    const flush = () => {
      if (renderTimer.current) { clearTimeout(renderTimer.current); renderTimer.current = null }
      lastRenderAt.current = Date.now()
      setRenderedSource(artifact.source)
    }
    const elapsed = Date.now() - lastRenderAt.current
    if (elapsed >= RENDER_MAX_WAIT_MS) { flush(); return }
    if (renderTimer.current) clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(flush, Math.min(RENDER_DEBOUNCE_MS, RENDER_MAX_WAIT_MS - elapsed))
    return () => { if (renderTimer.current) { clearTimeout(renderTimer.current); renderTimer.current = null } }
  }, [artifact.source, streaming])
  const document_ = useMemo(() => artifactDocument(renderedSource, firstThemeVars), [renderedSource, firstThemeVars])

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

  // Theme sync: when the host switches light/dark, push the fresh variables
  // into the iframe via postMessage instead of rebuilding it, so interactive
  // state (inputs, counters, animations) survives the switch.
  useEffect(() => {
    const postTheme = () => {
      frameRef.current?.contentWindow?.postMessage({ type: 'generative-ui:theme', vars: collectThemeVars() }, '*')
    }
    const observer = new MutationObserver(postTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-theme-style', 'style'] })
    return () => observer.disconnect()
  }, [])

  return (
    <iframe
      ref={frameRef}
      title={artifact.title}
      sandbox="allow-scripts"
      srcDoc={document_}
      onLoad={() => setReady(true)}
      style={{ display: 'block', width: '100%', height, border: 0, padding: 0, margin: 0, borderRadius: 8, background: 'transparent', opacity: ready ? 1 : 0.4, transition: 'opacity 160ms ease, height 140ms ease' }}
    />
  )
}

/** Hide the rendered ```generative-ui code blocks that duplicate artifacts. */
export function hideSourceBlocks(root: ParentNode, artifacts: readonly Artifact[]): void {
  if (artifacts.length === 0) return
  // Whitespace-insensitive comparison: the markdown renderer may re-indent
  // or re-wrap the block, so exact text equality is too strict in practice.
  const flat = (s: string) => s.replace(/\s+/g, '')
  const sources = artifacts.map((art) => flat(art.source))
  for (const node of root.querySelectorAll('pre')) {
    const el = node as HTMLElement
    if (el.dataset.generativeUiHidden === '1') continue
    const text = flat(el.textContent ?? '')
    // Only hide blocks that are a render of one of this turn's artifacts.
    if (text.length >= 20 && sources.some((source) => text === source)) {
      el.dataset.generativeUiHidden = '1'
      el.style.display = 'none'
    }
  }
}

/** turnTail card: one row per artifact in this turn, plus the live streaming tail. */
function GenerativeUiTurnCard({ turn }: { turn: TurnLike }) {
  const artifacts = readTurnArtifacts(turn)
  const live = readTurnLive(turn)
  const artifactsKey = artifacts.map((art) => art.id).join(',')

  useEffect(() => {
    if (artifacts.length === 0) return
    let frame = 0
    const sweep = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => hideSourceBlocks(document, artifacts))
    }
    sweep()
    // The markdown render may finish after this card mounts (streaming),
    // so keep watching until the matching code blocks appear and get hidden.
    const observer = new MutationObserver(sweep)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactsKey])

  if (artifacts.length === 0 && live === null) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
      {artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)}
      {live !== null && (
        <ArtifactCard key="generative-ui-live" artifact={{ id: 'generative-ui-live', title: '正在生成…', source: live }} streaming />
      )}
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
