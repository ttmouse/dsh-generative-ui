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
