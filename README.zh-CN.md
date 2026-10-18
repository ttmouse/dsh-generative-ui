![DSH 对话里内嵌渲染的两张 generative-ui 卡片：计数器与 BMI 快算](screenshot.png)

[English](README.md) | [简体中文](README.zh-CN.md)

# dsh-generative-ui

让 AI 在 DSH 对话流里直接输出**可交互的 HTML 组件**（Generative UI）。

agent 在回复正文里写一段 fenced code block：

````md
```generative-ui
<!-- title: 示例：计数器 -->
<button id="plus">+1</button> <span id="n">0</span>
<script>let n=0;plus.onclick=()=>{n++;n.textContent=n}</script>
```
````

插件把这一轮回答里的所有工件提取出来，在该轮消息下方渲染成沙箱卡片：
内嵌 `<iframe sandbox="allow-scripts">`（无 same-origin），工件可以交互，
但永远摸不到宿主页面、cookie 和本地存储。

## 设计

- **纯客户端，零后端，零存储。** 工件就活在会话消息文本里——会话在，工件就在；
  没有第二份状态，没有同步问题。
- 宿主半边只做一件事：通过 `systemPrompt.section` 把围栏约定广播给每个 agent。
- 浏览器半边用 `uiConversation.events` 事件累加器从 `assistant/message` 事件里
  提取工件（与 dsh-taskboard 的 turn 累加器同款模式），投影到 turn location，
  再由 `conversation.chat.turnTail` slot 渲染卡片。
- 高度自适应：注入每个工件的 bootstrap 用 ResizeObserver 向 parent
  postMessage 报告高度，卡片夹在 120–600px 之间，超出内部滚动。

## 版面约束

工件是裸的 iframe 文档：没有字体、没有间距重置、没有底色。插件的每个工件文档都会在 `<head>` 注入一份设计系统（`DESIGN_SYSTEM_CSS`），把「有约束地生成」落到运行时，而不是只写在提示词里：

- **分层靠底色，不靠描边。** `--gui-surface-1/2/3` 是由浅到深的三层底面，`--gui-tint` / `--gui-tint-strong` 是强调色淡底；分区不再用 1px border。
- **字号只留三档。** `--gui-fs-title`(18) / `--gui-fs-body`(14) / `--gui-fs-caption`(12)，上下文层级靠字重与 `--gui-fg-dim`，不再堆 11/12.5/13.5 这类 1.08 比例的字号差。
- **间距与圆角只有令牌。** `--gui-gap`(12) / `--gui-pad`(16)，圆角 `--gui-radius`(12) / `--gui-radius-sm`(8)；chips 用全圆。
- **外边距强制归零。** `html,body{margin:0!important;padding:0!important}`，工件与对话正文左对齐，间距由内层区块承担。
- **自带排版基线。** 系统字体栈、14px/1.7、11–17px 字号档位，避免落到浏览器默认衬线字体。
- **工具类**：`.gui-stack` `.gui-section` `.gui-section--tint` `.gui-card` `.gui-tint` `.gui-chip` `.gui-chip--on` `.gui-label` `.gui-title` `.gui-desc` `.gui-note` `.gui-grid`。
- **交互态与动效内置。** `button` 自带主按钮样式、`:active` 缩放、`:focus-visible` 焦点环，触控设备最小 44px；动效只用 `transform`/`opacity`，≤200ms，`--gui-ease` 缓动，并带 `prefers-reduced-motion` 兜底。
- **审计**：`auditArtifactSource(source)` 返回违反项（`border` / `shadow` / `gradient` / `blur` / `body-spacing` / `comment` / `em-dash` / `buzzword` / `pure-color`），只提示不拦截。

同一套规则以文字形式写进 systemPrompt（`GENERATIVE_UI_GUIDANCE`），模型在生成时即可遵守。

## 安装

```sh
dsh plugin --profile desktop add link:<本目录>
# 并把 @ttmouse/dsh-generative-ui 加入 profile package.json 的 dsh.profile.bundles
# 重启桌面 App 生效（宿主半边注册 prompt section；client.js 按请求读盘）
```

## 开发

```sh
npm install && npm run build       # 产出 lib/client.js + lib/index.mjs
npm test                           # 单测 + e2e（无头 Chromium）
npm run screenshot                 # 用真实客户端重新生成 screenshot.png
```

改客户端：刷新页面即生效；改宿主半边（systemPrompt 文案）：重启 App。

## 许可

MIT
