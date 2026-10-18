window.__ModuleLoader__.load({ id: "@ttmouse/dsh-generative-ui", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  DESIGN_SYSTEM_CSS: () => DESIGN_SYSTEM_CSS,
  apply: () => apply,
  artifactDocument: () => artifactDocument,
  auditArtifactSource: () => auditArtifactSource,
  collectThemeVars: () => collectThemeVars,
  extractArtifacts: () => extractArtifacts,
  extractStreamingTail: () => extractStreamingTail,
  generativeUiTurnDefinition: () => generativeUiTurnDefinition,
  hideSourceBlocks: () => hideSourceBlocks,
  inject: () => inject,
  themeVarsToCss: () => themeVarsToCss
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var TURN_KEY = "generative-ui";
var FENCE_RE = /```generative-ui[^\n]*\n([\s\S]*?)```/g;
var TITLE_RE = /<!--\s*title:\s*(.+?)\s*-->/;
var FENCE_MARKER = "```generative-ui";
var MAX_HEIGHT = 600;
var MIN_HEIGHT = 120;
var RENDER_DEBOUNCE_MS = 100;
var RENDER_MAX_WAIT_MS = 500;
function hashSource(source) {
  let hash = 5381;
  for (let i = 0; i < source.length; i += 1) hash = (hash << 5) + hash + source.charCodeAt(i) | 0;
  return (hash >>> 0).toString(36);
}
function extractArtifacts(text) {
  if (typeof text !== "string" || !text.includes("```generative-ui")) return [];
  const artifacts = [];
  for (const match of text.matchAll(FENCE_RE)) {
    const source = match[1];
    if (!source.trim()) continue;
    const title = source.match(TITLE_RE)?.[1];
    const cleanTitle = title?.trim() ? title.trim().slice(0, 60) : `\u5DE5\u4EF6 #${artifacts.length + 1}`;
    artifacts.push({ id: hashSource(source), title: cleanTitle, source });
  }
  return artifacts;
}
function extractStreamingTail(text) {
  if (typeof text !== "string") return null;
  const start = text.lastIndexOf(FENCE_MARKER);
  if (start === -1) return null;
  const rest = text.slice(start + FENCE_MARKER.length);
  if (rest.includes("```")) return null;
  const newline = rest.indexOf("\n");
  const source = newline === -1 ? "" : rest.slice(newline + 1);
  return source.trim() ? source : null;
}
var HOST_VAR_MAP = {
  "--gui-bg": ["--dsw-alias-bg-base", "--dsw-alias-bg-layer-1", "--background"],
  "--gui-bg-soft": ["--dsw-alias-bg-layer-2", "--dsw-alias-bg-secondary"],
  "--gui-fg": ["--dsw-alias-label-primary", "--foreground"],
  "--gui-fg-dim": ["--dsw-alias-label-secondary", "--muted-foreground"],
  "--gui-border": ["--dsw-alias-border-l1", "--border"],
  "--gui-accent": ["--dsw-alias-brand-primary", "--dsw-alias-accent", "--accent", "#3b82f6"]
};
function collectThemeVars() {
  const out = {};
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return out;
  const style = getComputedStyle(document.documentElement);
  for (const [std, hosts] of Object.entries(HOST_VAR_MAP)) {
    for (const host of hosts) {
      const value = host.startsWith("#") ? host : style.getPropertyValue(host).trim();
      if (value) {
        out[std] = value;
        break;
      }
    }
  }
  const bodyStyle = getComputedStyle(document.body);
  if (!out["--gui-bg"] || !out["--gui-fg"]) {
    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const probeStyle = getComputedStyle(probe);
    const bg = bodyStyle.backgroundColor;
    const fg = probeStyle.color || bodyStyle.color;
    probe.remove();
    const opaque = (c) => c && !/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(c);
    if (!out["--gui-bg"] && opaque(bg)) out["--gui-bg"] = bg;
    if (!out["--gui-fg"] && opaque(fg)) out["--gui-fg"] = fg;
  }
  return out;
}
function themeVarsToCss(vars) {
  const decls = Object.entries(vars).map(([k, v]) => `${k}:${v}`);
  return decls.length > 0 ? `:root{${decls.join(";")}}` : "";
}
var DESIGN_SYSTEM_CSS = `:root{
color-scheme:light dark;
--gui-surface-1:rgba(127,127,127,.055);
--gui-surface-2:rgba(127,127,127,.09);
--gui-surface-3:rgba(127,127,127,.14);
--gui-surface-1:color-mix(in srgb,var(--gui-fg) 5%,var(--gui-bg));
--gui-surface-2:color-mix(in srgb,var(--gui-fg) 9%,var(--gui-bg));
--gui-surface-3:color-mix(in srgb,var(--gui-fg) 14%,var(--gui-bg));
--gui-tint:rgba(127,127,127,.12);
--gui-tint:color-mix(in srgb,var(--gui-accent) 12%,transparent);
--gui-tint-strong:rgba(127,127,127,.2);
--gui-tint-strong:color-mix(in srgb,var(--gui-accent) 20%,transparent);
--gui-radius:12px;
--gui-radius-sm:8px;
--gui-gap:12px;
--gui-pad:16px;
--gui-fs-title:18px;
--gui-fs-body:14px;
--gui-fs-caption:12px;
--gui-ease:cubic-bezier(.23,1,.32,1);
}
*{box-sizing:border-box}
html,body{margin:0!important;padding:0!important}
body{background:var(--gui-bg,transparent);color:var(--gui-fg,#111);
font:var(--gui-fs-body)/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",system-ui,sans-serif;
-webkit-font-smoothing:antialiased;text-wrap:pretty}
.gui-stack{display:flex;flex-direction:column;gap:var(--gui-gap)}
.gui-section{padding:var(--gui-pad);border:0;border-radius:var(--gui-radius);background:var(--gui-surface-1)}
.gui-section--tint{background:var(--gui-surface-2)}
.gui-card{padding:12px 14px;border:0;border-radius:var(--gui-radius-sm);background:var(--gui-surface-1)}
.gui-tint{padding:12px 14px;border:0;border-radius:var(--gui-radius-sm);background:var(--gui-tint)}
.gui-label{margin:0 0 8px;font-size:var(--gui-fs-body);font-weight:650;color:var(--gui-fg)}
.gui-title{margin:0;font-size:var(--gui-fs-title);font-weight:650;line-height:1.25;letter-spacing:-.01em;text-wrap:balance}
.gui-desc{margin:4px 0 0;font-size:var(--gui-fs-body);line-height:1.6;color:var(--gui-fg-dim)}
.gui-note{margin:0;font-size:var(--gui-fs-caption);line-height:1.7;color:var(--gui-fg-dim)}
.gui-chip{display:inline-block;padding:3px 11px;border-radius:999px;font-size:var(--gui-fs-caption);background:var(--gui-surface-2)}
.gui-chip--on{background:var(--gui-tint-strong);font-weight:600}
.gui-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--gui-gap)}
button{min-height:38px;padding:0 14px;border:0;border-radius:var(--gui-radius-sm);
background:var(--gui-accent);color:var(--gui-bg);font:inherit;font-weight:600;cursor:pointer;
transition:transform .16s var(--gui-ease),opacity .16s var(--gui-ease)}
button:active{transform:scale(.97)}
button:focus-visible{outline:2px solid var(--gui-accent);outline-offset:2px}
button:disabled{opacity:.5;cursor:not-allowed}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;
padding:1px 5px;border-radius:5px;background:var(--gui-surface-3)}
@media (pointer:coarse){button{min-height:44px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
function auditArtifactSource(source) {
  const issues = [];
  if (/\bborder\s*:\s*(?!0\b|none\b)/i.test(source)) issues.push("border");
  if (/\bbox-shadow\s*:|text-shadow\s*:/i.test(source)) issues.push("shadow");
  if (/linear-gradient\(|radial-gradient\(/i.test(source)) issues.push("gradient");
  if (/backdrop-filter\s*:|filter\s*:\s*blur\(/i.test(source)) issues.push("blur");
  if (/body\s*\{[^}]*(?:margin|padding)\s*:\s*(?!0\b)/i.test(source)) issues.push("body-spacing");
  else if (/<body[^>]*style="[^"]*(?:margin|padding)\s*:\s*(?!0\b)/i.test(source)) issues.push("body-spacing");
  if (source.includes("<!--")) issues.push("comment");
  if (/\u2014/.test(source)) issues.push("em-dash");
  if (/\b(?:streamline|empower|supercharge|seamless|world-class|next-gen|revolutionary)\b|赋能|一站式|无缝|极致|颠覆/i.test(source)) issues.push("buzzword");
  if (/#fff\b|#ffffff\b|#000\b|#000000\b/i.test(source)) issues.push("pure-color");
  return issues;
}
var BOOTSTRAP = `<script>(function(){
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
})()<\/script>`;
function artifactDocument(source, themeCss = "") {
  const design = `<style>${DESIGN_SYSTEM_CSS}</style>${themeCss ? `<style>${themeCss}</style>` : ""}`;
  let doc;
  if (/<html[\s>]/i.test(source)) {
    doc = /<\/head>/i.test(source) ? source.replace(/<\/head>/i, `${design}</head>`) : source.replace(/<html([^>]*)>/i, `<html$1><head>${design}</head>`);
  } else {
    doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${design}</head><body>${source}</body></html>`;
  }
  return doc.includes("</body>") ? doc.replace("</body>", `${BOOTSTRAP}</body>`) : doc + BOOTSTRAP;
}
var generativeUiTurnDefinition = {
  kind: TURN_KEY,
  match(event) {
    if (event.type === "turn/start" && event.data?.turn !== void 0) return { id: String(event.data.turn), role: "start" };
    if (event.type === "assistant/message" && event.data?.turn !== void 0) return { id: String(event.data.turn), role: "update" };
    return null;
  },
  start(_context, match) {
    return { turn: match.event.data?.turn, arts: [], liveSource: null };
  },
  update(context, match) {
    if (context.state === void 0 || match.event.type !== "assistant/message") return context.state;
    const blocks = match.event.data?.message?.content;
    const texts = Array.isArray(blocks) ? blocks.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text) : [];
    const joined = texts.join("\n");
    const arts = extractArtifacts(joined);
    const liveSource = extractStreamingTail(joined);
    if (arts.length === 0 && liveSource === null) return context.state;
    const known = new Set(context.state.arts.map((art) => art.id));
    const merged = [...context.state.arts, ...arts.filter((art) => !known.has(art.id))];
    const liveChanged = (context.state.liveSource ?? null) !== liveSource;
    if (merged === context.state.arts && !liveChanged) return context.state;
    return { ...context.state, arts: merged, liveSource };
  },
  buildLocationData(context, scope, previous) {
    if (scope !== "turn" || context.state === void 0 || context.state.arts.length === 0 && (context.state.liveSource ?? null) === null) return null;
    const state = context.state;
    const live = state.liveSource ?? null;
    if (previous?.kind === "turn" && previous.turn === state.turn && previous.key === TURN_KEY && previous.value?.arts === state.arts && previous.value?.live === live) return previous;
    return { kind: "turn", turn: state.turn, key: TURN_KEY, value: { arts: state.arts, live } };
  }
};
function readTurnArtifacts(turn) {
  const data = turn?.data;
  const value = data === null || data === void 0 ? void 0 : typeof data.get === "function" ? data.get(TURN_KEY) : data instanceof Map ? data.get(TURN_KEY) : void 0;
  return Array.isArray(value?.arts) ? value.arts : [];
}
function readTurnLive(turn) {
  const data = turn?.data;
  const value = data === null || data === void 0 ? void 0 : typeof data.get === "function" ? data.get(TURN_KEY) : data instanceof Map ? data.get(TURN_KEY) : void 0;
  return typeof value?.live === "string" && value.live ? value.live : null;
}
function ArtifactCard({ artifact, streaming = false }) {
  const frameRef = (0, import_react.useRef)(null);
  const [height, setHeight] = (0, import_react.useState)(280);
  const [ready, setReady] = (0, import_react.useState)(false);
  const firstThemeVars = (0, import_react.useMemo)(() => themeVarsToCss(collectThemeVars()), []);
  const [renderedSource, setRenderedSource] = (0, import_react.useState)(artifact.source);
  const lastRenderAt = (0, import_react.useRef)(0);
  const renderTimer = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    if (!streaming) {
      setRenderedSource(artifact.source);
      return;
    }
    const flush = () => {
      if (renderTimer.current) {
        clearTimeout(renderTimer.current);
        renderTimer.current = null;
      }
      lastRenderAt.current = Date.now();
      setRenderedSource(artifact.source);
    };
    const elapsed = Date.now() - lastRenderAt.current;
    if (elapsed >= RENDER_MAX_WAIT_MS) {
      flush();
      return;
    }
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(flush, Math.min(RENDER_DEBOUNCE_MS, RENDER_MAX_WAIT_MS - elapsed));
    return () => {
      if (renderTimer.current) {
        clearTimeout(renderTimer.current);
        renderTimer.current = null;
      }
    };
  }, [artifact.source, streaming]);
  const document_ = (0, import_react.useMemo)(() => artifactDocument(renderedSource, firstThemeVars), [renderedSource, firstThemeVars]);
  (0, import_react.useEffect)(() => {
    function onMessage(event) {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== "generative-ui:height") return;
      const value = Number(event.data.height);
      if (Number.isFinite(value)) setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value)));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  (0, import_react.useEffect)(() => {
    const postTheme = () => {
      frameRef.current?.contentWindow?.postMessage({ type: "generative-ui:theme", vars: collectThemeVars() }, "*");
    };
    const observer = new MutationObserver(postTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-theme-style", "style"] });
    return () => observer.disconnect();
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "iframe",
    {
      ref: frameRef,
      title: artifact.title,
      sandbox: "allow-scripts",
      srcDoc: document_,
      onLoad: () => setReady(true),
      style: { display: "block", width: "100%", height, border: 0, padding: 0, margin: 0, borderRadius: 8, background: "transparent", opacity: ready ? 1 : 0.4, transition: "opacity 160ms ease, height 140ms ease" }
    }
  );
}
function hideSourceBlocks(root, artifacts) {
  if (artifacts.length === 0) return;
  const flat = (s) => s.replace(/\s+/g, "");
  const sources = artifacts.map((art) => flat(art.source));
  for (const node of root.querySelectorAll("pre")) {
    const el = node;
    if (el.dataset.generativeUiHidden === "1") continue;
    const text = flat(el.textContent ?? "");
    if (text.length >= 20 && sources.some((source) => text === source)) {
      el.dataset.generativeUiHidden = "1";
      el.style.display = "none";
    }
  }
}
function GenerativeUiTurnCard({ turn }) {
  const artifacts = readTurnArtifacts(turn);
  const live = readTurnLive(turn);
  const artifactsKey = artifacts.map((art) => art.id).join(",");
  (0, import_react.useEffect)(() => {
    if (artifacts.length === 0) return;
    let frame = 0;
    const sweep = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => hideSourceBlocks(document, artifacts));
    };
    sweep();
    const observer = new MutationObserver(sweep);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [artifactsKey]);
  if (artifacts.length === 0 && live === null) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }, children: [
    artifacts.map((artifact) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArtifactCard, { artifact }, artifact.id)),
    live !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArtifactCard, { artifact: { id: "generative-ui-live", title: "\u6B63\u5728\u751F\u6210\u2026", source: live }, streaming: true }, "generative-ui-live")
  ] });
}
var inject = ["locale", "slots", "uiConversation"];
function apply(ctx) {
  ctx.effect(
    () => ctx.uiConversation.events.register(generativeUiTurnDefinition),
    "dsh-generative-ui: turn artifact accumulator"
  );
  ctx.effect(
    () => ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
      name: "conversation.chat.turnTail",
      id: "generative-ui",
      order: 10
    }, GenerativeUiTurnCard)),
    "dsh-generative-ui: turn-tail artifact cards"
  );
}
return module.exports; } });
