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
  apply: () => apply,
  artifactDocument: () => artifactDocument,
  extractArtifacts: () => extractArtifacts,
  generativeUiTurnDefinition: () => generativeUiTurnDefinition,
  hideSourceBlocks: () => hideSourceBlocks,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var TURN_KEY = "generative-ui";
var FENCE_RE = /```generative-ui[^\n]*\n([\s\S]*?)```/g;
var TITLE_RE = /<!--\s*title:\s*(.+?)\s*-->/;
var MAX_HEIGHT = 600;
var MIN_HEIGHT = 120;
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
    const title = source.match(TITLE_RE)?.[1] ?? `\u5DE5\u4EF6 #${artifacts.length + 1}`;
    artifacts.push({ id: hashSource(source), title: title.slice(0, 60), source });
  }
  return artifacts;
}
var BOOTSTRAP = `<script>(function(){
  var last=0;
  function report(){
    var h=Math.ceil(document.documentElement.getBoundingClientRect().height);
    if(h>0&&h!==last){last=h;parent.postMessage({type:"generative-ui:height",height:h},"*")}
  }
  new ResizeObserver(report).observe(document.documentElement);
  window.addEventListener("load",report);report();
})()<\/script>`;
function artifactDocument(source) {
  const body = /<html[\s>]/i.test(source) ? source : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${source}</body></html>`;
  return body.includes("</body>") ? body.replace("</body>", `${BOOTSTRAP}</body>`) : body + BOOTSTRAP;
}
var generativeUiTurnDefinition = {
  kind: TURN_KEY,
  match(event) {
    if (event.type === "turn/start" && event.data?.turn !== void 0) return { id: String(event.data.turn), role: "start" };
    if (event.type === "assistant/message" && event.data?.turn !== void 0) return { id: String(event.data.turn), role: "update" };
    return null;
  },
  start(_context, match) {
    return { turn: match.event.data?.turn, arts: [] };
  },
  update(context, match) {
    if (context.state === void 0 || match.event.type !== "assistant/message") return context.state;
    const blocks = match.event.data?.message?.content;
    const texts = Array.isArray(blocks) ? blocks.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text) : [];
    const arts = texts.flatMap(extractArtifacts);
    if (arts.length === 0) return context.state;
    const known = new Set(context.state.arts.map((art) => art.id));
    const merged = [...context.state.arts, ...arts.filter((art) => !known.has(art.id))];
    return merged === context.state.arts ? context.state : { ...context.state, arts: merged };
  },
  buildLocationData(context, scope, previous) {
    if (scope !== "turn" || context.state === void 0 || context.state.arts.length === 0) return null;
    const state = context.state;
    if (previous?.kind === "turn" && previous.turn === state.turn && previous.key === TURN_KEY && previous.value?.arts === state.arts) return previous;
    return { kind: "turn", turn: state.turn, key: TURN_KEY, value: { arts: state.arts } };
  }
};
function readTurnArtifacts(turn) {
  const data = turn?.data;
  const value = data === null || data === void 0 ? void 0 : typeof data.get === "function" ? data.get(TURN_KEY) : data instanceof Map ? data.get(TURN_KEY) : void 0;
  return Array.isArray(value?.arts) ? value.arts : [];
}
function ArtifactCard({ artifact }) {
  const frameRef = (0, import_react.useRef)(null);
  const [height, setHeight] = (0, import_react.useState)(280);
  const [ready, setReady] = (0, import_react.useState)(false);
  const [showSource, setShowSource] = (0, import_react.useState)(false);
  const document_ = (0, import_react.useMemo)(() => artifactDocument(artifact.source), [artifact.source]);
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
  const openStandalone = () => {
    const url = URL.createObjectURL(new Blob([document_], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { border: "1px solid var(--dsw-alias-border-l1, #ddd)", borderRadius: 12, overflow: "hidden", background: "var(--dsw-alias-bg-base, #fff)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)", background: "var(--dsw-alias-bg-subtle, #fafafa)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(135deg,#7c5cff,#38bdf8)", flex: "none" } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 12, color: "var(--dsw-alias-label-primary, #1f1f1f)", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: artifact.title }),
      !ready && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, #999)" }, children: "\u6E32\u67D3\u4E2D\u2026" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          onClick: () => setHeight((current) => current >= MAX_HEIGHT ? 280 : MAX_HEIGHT),
          title: "\u5C55\u5F00 / \u6536\u8D77",
          style: { fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--dsw-alias-border-l1, #ddd)", background: "transparent", color: "var(--dsw-alias-label-secondary, #666)", cursor: "pointer" },
          children: height >= MAX_HEIGHT ? "\u6536\u8D77" : "\u5C55\u5F00"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          onClick: () => setShowSource((current) => !current),
          title: "\u67E5\u770B / \u6536\u8D77\u6E90\u7801",
          style: { fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--dsw-alias-border-l1, #ddd)", background: "transparent", color: "var(--dsw-alias-label-secondary, #666)", cursor: "pointer" },
          children: showSource ? "\u6536\u8D77\u6E90\u7801" : "\u6E90\u7801"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          onClick: openStandalone,
          title: "\u5728\u65B0\u7A97\u53E3\u6253\u5F00",
          style: { fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--dsw-alias-border-l1, #ddd)", background: "transparent", color: "var(--dsw-alias-label-secondary, #666)", cursor: "pointer" },
          children: "\u65B0\u7A97\u53E3"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "iframe",
      {
        ref: frameRef,
        title: artifact.title,
        sandbox: "allow-scripts",
        srcDoc: document_,
        onLoad: () => setReady(true),
        style: { display: "block", width: "100%", height, border: 0, background: "#fff", opacity: ready ? 1 : 0.4, transition: "opacity 160ms ease, height 140ms ease" }
      }
    ),
    showSource && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: { maxHeight: 240, overflow: "auto", margin: 0, padding: 12, fontSize: 11, lineHeight: 1.5, background: "var(--dsw-alias-bg-inverted, #0f1115)", color: "var(--dsw-alias-label-inverted, #c9d1d9)", borderTop: "1px solid var(--dsw-alias-border-l2, #eee)", whiteSpace: "pre-wrap", wordBreak: "break-all" }, children: artifact.source })
  ] });
}
function hideSourceBlocks(root, artifacts) {
  if (artifacts.length === 0) return;
  const sources = artifacts.map((art) => art.source.trim());
  for (const node of root.querySelectorAll("pre")) {
    const el = node;
    if (el.dataset.generativeUiHidden === "1") continue;
    const text = (el.textContent ?? "").trim();
    if (text.length >= 20 && sources.some((source) => source === text)) {
      el.dataset.generativeUiHidden = "1";
      el.style.display = "none";
    }
  }
}
function GenerativeUiTurnCard({ turn }) {
  const artifacts = readTurnArtifacts(turn);
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
  if (artifacts.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }, children: artifacts.map((artifact) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArtifactCard, { artifact }, artifact.id)) });
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
