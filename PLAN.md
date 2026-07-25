# Interline（行间）— 计划文档

> 个人用双语对照浏览器翻译扩展：译文长在字里行间。
> 定位是"满足自己 90% 网页阅读场景的自用版"，不是沉浸式翻译的全功能替代。

## 一、目标与非目标

### 目标
- 网页正文双语对照：译文以独立块插在原文段落下方，样式可区分、可自定义
- 用自己的 Claude API key，无订阅、无遥测、无中间商
- 动态页面可用（无限滚动、SPA 路由切换）
- 视口内才翻译（懒加载），配合缓存把 token 成本压到最低
- 按站点记住开关状态，快捷键一键开/关
- 划词翻译弹窗

### 非目标（明确不做）
- PDF / EPUB 翻译 —— 本质是重写阅读器，继续用现成工具
- YouTube / Netflix 双字幕
- 大而全的站点规则库 —— 只为自己常用的少数站点做适配
- 多引擎聚合（DeepL/Google 等）—— 只接 Claude API，接口层留扩展点即可

## 二、技术方案

- **平台**：Chrome Manifest V3（Edge/Arc 等 Chromium 系通用；Firefox 暂不考虑）
- **语言**：TypeScript，不用 UI 框架（popup/options 用原生 DOM 就够）
- **构建**：Vite + @crxjs 或 esbuild 脚本，二选一，越简单越好
- **结构**：
  - `content script` —— DOM 扫描、译文渲染、划词弹窗
  - `service worker`（background）—— 调用 Claude API（绕过页面 CSP/CORS）、缓存读写、队列限流
  - `popup` —— 当前站点开关、立即翻译按钮
  - `options` —— API key、模型、目标语言、样式、站点列表

### 翻译引擎
- Claude Messages API，默认模型 `claude-haiku-4-5`（$1/$5 每百万 token，整页约 $0.02）
- 模型在设置里可切换（想要更高质量时换 Sonnet/Opus）
- API key 存 `chrome.storage.local`，只在 service worker 中使用，不注入页面
- 请求体：一次批量翻译 5–10 个段落，用编号分隔符包裹，要求按编号原样返回译文（比逐段请求省 token、省往返）

## 三、核心模块设计

### 1. DOM 扫描与分段
- 遍历块级文本元素（`p, li, h1-h6, blockquote, td, dd, figcaption` 等）
- 跳过：`pre/code`、`nav`、`aside`、表单控件、`contenteditable`、已翻译节点、纯符号/纯数字/过短文本
- 语言检测：目标语言占比高的段落跳过（避免翻译中文页面）
- 每个待译段落打唯一 `data-interline-id`

### 2. 懒翻译调度
- `IntersectionObserver` 监听待译段落，进入视口（含 1 屏预读）才入队
- `MutationObserver` 监听新增节点，增量扫描（SPA、无限滚动）
- 队列：并发上限 3–4 个请求，超限排队；失败指数退避重试 2 次

### 3. 译文渲染
- 译文插入原文元素之后的独立元素（继承字号，颜色/下划线样式可配）
- 深浅色主题自适应
- 页面开关时批量显示/移除，不破坏原 DOM 结构（只增不改）

### 4. 缓存
- key = `hash(原文 + 目标语言 + 模型)`，value = 译文
- 存 IndexedDB，LRU 上限（如 5 万条），命中则不发请求
- 同一篇文章反复打开、Twitter 时间线重复内容基本零成本

### 5. 设置与站点策略
- 站点三态：总是翻译 / 从不翻译 / 手动（默认）
- 快捷键：`Alt+T` 整页开关，`Alt+S` 划词开关（可改）
- 划词：选中文本 → 浮动按钮 → 弹窗显示译文

## 四、里程碑

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| M1 MVP | 静态页面整页双语对照 + API 调用 + 基础设置页 | 打开一篇英文博客，一键出双语 |
| M2 | 懒翻译 + MutationObserver + 缓存 + 并发限流 | 无限滚动页面流畅可用，重复内容不重复计费 |
| M3 | 划词翻译 + 站点自动开启 + 快捷键 + 样式打磨 | 日常浏览完全替代沉浸式翻译的网页场景 |
| M4（可选） | Twitter/Reddit 虚拟列表适配、输入框翻译（写英文邮件） | 按实际痛点再定 |

M1 一个下午，M2–M3 各一两天的打磨量，M4 看需求。

## 五、成本估算

- Haiku 4.5：$1（输入）/ $5（输出）每百万 token
- 一整页全文翻译约 3k token 进、3k token 出 ≈ $0.02（约 ¥0.14）
- 有懒加载 + 缓存后，实际日常浏览远低于整页成本；重度使用一个月估计 $2–5

## 六、已知的坑

- **CSP**：页面级 CSP 会拦 content script 的 fetch —— 所有 API 请求走 service worker，天然规避
- **虚拟滚动**（Twitter/X 等）：DOM 节点反复销毁重建，靠缓存命中兜底，专门适配放 M4
- **iframe**：`all_frames: true` 可覆盖大部分，跨域 iframe 各自独立运行
- **MV3 service worker 休眠**：长队列要用 `chrome.alarms` 或消息驱动唤醒，不能依赖常驻状态
- **成本失控**：懒翻译 + 缓存 + 段落长度上限三道闸，另在 popup 显示当日 token 用量

## 七、待定问题（开工前确认）

1. 主要语言对：默认按 英→中 做，是否还有其他？
2. 高频站点清单（决定 M4 做不做、先适配谁）
3. 是否需要同步设置到多台设备（`storage.sync` 很容易加）

## 八、目录结构（预定）

```
Interline/
├── PLAN.md
├── manifest.json
├── src/
│   ├── content/        # 扫描、渲染、划词
│   ├── background/     # API 调用、队列、缓存
│   ├── popup/
│   ├── options/
│   └── shared/         # 类型、消息协议、设置读写
└── assets/             # 图标
```
