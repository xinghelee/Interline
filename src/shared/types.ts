export type Provider =
  | "anthropic"
  | "openai"
  | "grok"
  | "deepseek"
  | "gemini"
  | "custom";

export interface Settings {
  /** 当前使用的翻译服务商 */
  provider: Provider;
  /** 各服务商的 API Key */
  apiKeys: Partial<Record<Provider, string>>;
  /** 各服务商选用的模型 */
  models: Partial<Record<Provider, string>>;
  targetLang: string;
  /** 译文颜色,空字符串 = 默认(继承原文颜色并淡化) */
  styleColor: string;
  underline: boolean;
  /** 打开即自动翻译的站点(hostname 列表) */
  autoSites: string[];
  /** 划词翻译开关 */
  selectionEnabled: boolean;
  /** 是否显示原文(关 = 仅译文模式),新站点的默认值 */
  showOriginal: boolean;
  /** 按站点记忆的原文显示偏好,覆盖全局默认 */
  siteShowOriginal: Record<string, boolean>;
  /** 屏蔽常见广告(内置域名规则 + 版位遮蔽) */
  adBlock: boolean;
  /** 自定义 OpenAI 兼容端点地址(provider = custom 时用) */
  customBaseUrl: string;
  /** 术语表,每行"原文=译文" */
  glossary: string;
}

export interface SegmentItem {
  id: number;
  text: string;
}

// ---- content/popup → background ----

export interface TranslateContext {
  /** 页面标题,仅用于消歧,不翻译 */
  title?: string;
}

export type BackgroundRequest =
  | {
      type: "translateBatch";
      items: SegmentItem[];
      targetLang?: string;
      context?: TranslateContext;
    }
  | { type: "getUsage" }
  | { type: "testConnection" }
  | { type: "getCacheStats" }
  | { type: "clearCache" };

export type TranslateBatchResponse =
  | { ok: true; translations: Record<number, string> }
  | { ok: false; error: string };

export type TestConnectionResponse =
  | { ok: true }
  | { ok: false; error: string };

export interface CacheStats {
  entries: number;
}

export interface UsageToday {
  date: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

// ---- popup → content ----

export type ContentRequest =
  | { type: "translatePage" }
  | { type: "toggleShow" }
  | { type: "removeAll" }
  | { type: "getState" }
  | { type: "toggleTranslate" }
  | { type: "toggleSelection" }
  | { type: "toggleOriginal" }
  | { type: "translateInput" }
  | { type: "retryFailed" };

export interface ContentState {
  state: "idle" | "translating" | "done";
  shown: boolean;
  /** 是否显示原文(关 = 仅译文模式) */
  originalShown: boolean;
  total: number;
  completed: number;
  /** 翻译失败待重试的段落数 */
  failedCount: number;
  error?: string;
  /** 当前页面 hostname,popup 的站点开关用(popup 无 tabs 权限读不到 URL) */
  host: string;
}
