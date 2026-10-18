/**
 * dsh-generative-ui — host half.
 *
 * One job: announce the artifact convention to every agent through the
 * system prompt, so models know they can emit ```generative-ui fenced
 * blocks. No server, no storage — artifacts live in the message text and
 * the browser half renders them.
 *
 * Failure policy: registering the prompt section cannot throw meaningfully;
 * the host must not take the GUI down over an announcement.
 */

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 305

/** Model-facing announcement: the artifact convention and its rules. */
export const GENERATIVE_UI_GUIDANCE = [
  '本机已安装 dsh-generative-ui 插件：你可以在回复正文中用 ```generative-ui 围栏输出自包含的 HTML 文档，DSH 会在该轮回答下方把它渲染成一个沙箱化的可交互组件（Generative UI），用户无需离开对话即可操作。',
  '规则：内容必须是单个自包含 HTML（内联 style/script，不引用外部网络资源）；脚本运行在 sandbox="allow-scripts" 的 iframe 里，无法访问宿主页面、cookie 或本地存储，所以不要在其中放置凭据或敏感数据；如需高度自适应，脚本可向 parent postMessage {type:"generative-ui:height", height:像素}（插件已内置自动上报，一般无需手写）。',
  '适用场景：数据看板小卡、交互式演示、表单原型、可视化对比、小型计算器/换算器。不适用：需要持久化或真实后端数据的场景。围栏语言标记必须恰好是 generative-ui；可在围栏首行写 <!-- title: 标题 --> 自定义卡片标题。',
  '流式渲染：围栏未闭合时插件就会把已到达的部分渐进渲染成卡片（边写边长出来）。为让流式体验稳定：HTML 里不要写注释（浪费 token 且流式期间可见）；避免渐变、阴影、模糊动画（流式 DOM 差异会闪烁），用纯色平涂；可见性切换（tab/折叠）不要依赖 display:none，等围栏闭合后的脚本再做；脚本放围栏尾部。',
  '主题跟随：卡片会用 CSS 变量 --gui-bg / --gui-bg-soft / --gui-fg / --gui-fg-dim / --gui-border / --gui-accent 注入宿主当前主题色，并随宿主明暗切换自动更新。想让组件跟随主题就用这些变量（如 body{background:var(--gui-bg);color:var(--gui-fg)}）；想固定自己的配色也可以，两者都有效。',
  '版面约束（工件直接嵌在对话正文里，必须跟正文左对齐、层级清楚）：① 分区用背景色分层，不要用 border 描边（表格行除外）；② 不要给 body/html 写 margin 或 padding——插件已强制归零，外间距由内层区块承担；③ 用插件注入的令牌，不要自造散值：字号只有三档 --gui-fs-title(18) / --gui-fs-body(14) / --gui-fs-caption(12)，间距 --gui-gap(12) / --gui-pad(16)，圆角 --gui-radius(12) / --gui-radius-sm(8)，底色 --gui-surface-1/2/3，强调淡底 --gui-tint / --gui-tint-strong，缓动 --gui-ease；④ 工具类 .gui-stack / .gui-section / .gui-section--tint / .gui-card / .gui-tint / .gui-chip / .gui-chip--on / .gui-label / .gui-title / .gui-desc / .gui-note / .gui-grid；button 已内置主按钮样式（含 :active 与 :focus-visible，触控下最小 44px）；⑤ 一个工件只用一种强调色，强调一律走 --gui-tint 系列；⑥ 不要给每段加小号大写间距标签（eyebrow），不要 01/02/03 假序号（真有序用 <ol>），不要渐变、阴影、玻璃拟态、细线分隔；⑦ 文案：按钮写动词+对象，不用 em dash，不写 streamline/赋能 这类空话；⑧ 动效只用 transform/opacity，≤200ms。违反不报错，但版面会明显比别的卡片散乱。',
].join('\n')

export const inject = ['systemPrompt']

/** Minimal host context contract used by this plugin. */
interface HostContext {
  effect: (register: () => () => void, label: string) => void
  systemPrompt: { section(options: { name: string; order: number; text: string }): () => void }
}

export function apply(ctx: HostContext, config?: { enabled?: boolean }) {
  if (config?.enabled === false) return
  ctx.effect(
    () => ctx.systemPrompt.section({
      name: 'plugin:dsh-generative-ui',
      order: SECTION_ORDER,
      text: GENERATIVE_UI_GUIDANCE,
    }),
    'dsh-generative-ui: prompt section',
  )
}
