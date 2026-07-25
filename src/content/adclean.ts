// 站点级广告清理:第一方广告(如 X 的推广推文)不走广告域名,
// 网络层拦不住,只能按 DOM 特征隐藏。按站点注册清理器。

const AD_LABELS = new Set([
  "Ad",
  "Promoted",
  "推广",
  "廣告",
  "广告",
  "プロモーション",
  "Anzeige",
  "Publicité",
  "Promocionado",
]);

export function setupAdClean(): void {
  const cleaner = pickCleaner();
  if (!cleaner) return;

  cleaner();
  let timer: number | undefined;
  const observer = new MutationObserver(() => {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      cleaner();
    }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function pickCleaner(): (() => void) | null {
  const host = location.hostname;
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return cleanTwitter;
  return null;
}

/** X/Twitter:隐藏时间线里带 Ad/推广 标记的卡片 */
function cleanTwitter(): void {
  const cells = document.querySelectorAll<HTMLElement>(
    "div[data-testid='cellInnerDiv']",
  );
  for (const cell of cells) {
    const promoted = isPromotedTweet(cell);
    const hidden = cell.dataset.interlineAd === "1";
    if (promoted && !hidden) {
      cell.dataset.interlineAd = "1";
      cell.style.setProperty("display", "none", "important");
    } else if (!promoted && hidden) {
      // 虚拟列表会复用节点,内容换成普通推文时要恢复
      delete cell.dataset.interlineAd;
      cell.style.removeProperty("display");
    }
  }
}

function isPromotedTweet(cell: HTMLElement): boolean {
  // 注意:placementTracking 已不可靠(普通视频推文也带),只认头部的 Ad 标签
  for (const span of cell.querySelectorAll("span")) {
    const label = span.textContent?.trim();
    if (
      label &&
      AD_LABELS.has(label) &&
      !span.closest("[data-testid='tweetText']")
    ) {
      return true;
    }
  }
  return false;
}
