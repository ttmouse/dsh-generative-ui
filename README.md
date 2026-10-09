![Two generative-ui cards rendered inline in a DSH chat: a counter and a BMI calculator](screenshot.png)

[English](README.md) | [简体中文](README.zh-CN.md)

# dsh-generative-ui

Let the AI output **interactive HTML components** (Generative UI) directly in
the DSH chat flow.

The agent writes a fenced code block in its reply:

````md
```generative-ui
<!-- title: Example: counter -->
<button id="plus">+1</button> <span id="n">0</span>
<script>let n=0;plus.onclick=()=>{n++;n.textContent=n}</script>
```
````

The plugin extracts every artifact from that turn and renders it as a sandboxed
card below the message: an `<iframe sandbox="allow-scripts">` (no same-origin)
— the artifact is fully interactive, but can never touch the host page,
cookies, or local storage.

## Design

- **Pure client-side: no backend, no storage.** Artifacts live in the session
  message text — the session is the store; there is no second copy of state
  and nothing to sync.
- The host half does one thing: broadcast the fenced-block convention to every
  agent via `systemPrompt.section`.
- The browser half uses a `uiConversation.events` accumulator to extract
  artifacts from `assistant/message` events (the same turn-accumulator pattern
  as dsh-taskboard), projects them onto the turn location, and renders the
  cards through the `conversation.chat.turnTail` slot.
- Adaptive height: a bootstrap injected into each artifact reports its height
  to the parent via ResizeObserver + postMessage; cards are clamped between
  120–600px and scroll internally beyond that.

## Install

```sh
dsh plugin --profile desktop add link:<this-directory>
# and add @ttmouse/dsh-generative-ui to dsh.profile.bundles in the profile
# package.json; restart the desktop app (the host half registers the prompt
# section; client.js is read from disk per request)
```

## Develop

```sh
npm install && npm run build       # produces lib/client.js + lib/index.mjs
npm test                           # unit + e2e (headless Chromium)
npm run screenshot                 # regenerate screenshot.png from the real client
```

Client changes take effect on page refresh; host-half changes (the
system-prompt text) need an app restart.

## License

MIT
