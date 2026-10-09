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
