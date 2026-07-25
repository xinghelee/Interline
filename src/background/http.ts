interface RequestOptions {
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
}

/** 带重试的 JSON 请求:429/5xx/网络错误退避重试,其余 4xx 直接抛错 */
export async function requestWithRetry(
  url: string,
  options: RequestOptions,
  retries = 2,
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(attempt === 1 ? 1000 : 4000);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: options.method ?? "POST",
        headers: options.headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      lastError = new Error(`网络错误: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (resp.ok) return resp.json();

    const errBody = await resp.json().catch(() => null);
    const message: string =
      errBody?.error?.message ?? errBody?.message ?? `HTTP ${resp.status}`;

    if (resp.status === 429 || resp.status >= 500) {
      lastError = new Error(message);
      continue;
    }
    throw new Error(message);
  }

  throw lastError ?? new Error("请求失败");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
