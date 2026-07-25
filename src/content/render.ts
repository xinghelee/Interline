import type { Settings } from "../shared/types";

export function renderTranslation(
  el: HTMLElement,
  text: string,
  settings: Settings,
): void {
  if (el.querySelector(":scope > .interline-block")) return;

  const node = document.createElement("div");
  node.className = "interline-block";
  node.dataset.interlineFor = el.dataset.interlineId ?? "";
  node.textContent = text;
  if (settings.styleColor) {
    node.style.color = settings.styleColor;
    node.style.opacity = "1";
  }
  if (settings.underline) node.classList.add("interline-underline");
  el.appendChild(node);
}

export function removeAllTranslations(): void {
  document.querySelectorAll(".interline-block").forEach((n) => n.remove());
  document
    .querySelectorAll<HTMLElement>("[data-interline-id]")
    .forEach((el) => delete el.dataset.interlineId);
  document.documentElement.classList.remove("interline-hide");
}
