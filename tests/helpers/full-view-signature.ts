import { createHash } from "node:crypto";

// S145: the same Full view signature the recorded baseline uses (regions, section order, headings,
// form controls, buttons, links and per-section copy), excluding only the additive view switch.
// Kept identical to tests/unit/s145-full-view-baseline.test.tsx, which stays unchanged.

function text(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function outsideSwitch(element: Element): boolean {
  return !element.closest("[data-renewal-view-switch]");
}

function labelOf(element: Element): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return aria.trim();
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy)
    return labelledBy
      .split(/\s+/)
      .map((id) => text(document.getElementById(id)))
      .join(" ")
      .trim();
  const labels = (element as HTMLInputElement).labels;
  if (labels && labels.length > 0) return text(labels[0]);
  return "";
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function fullViewSignature(container: HTMLElement) {
  const all = <T extends Element>(selector: string) =>
    [...container.querySelectorAll<T>(selector)].filter(outsideSwitch);
  return {
    regions: all("section[aria-label], [role='region'][aria-label]").map(
      (element) => element.getAttribute("aria-label") ?? "",
    ),
    sectionIds: all("[id^='renewal-section-']").map((element) => element.id),
    headings: all("h1, h2, h3, h4").map(
      (element) => `${element.tagName.toLowerCase()}:${text(element)}`,
    ),
    controls: all("input, select, textarea").map(
      (element) =>
        `${element.tagName.toLowerCase()}:${element.getAttribute("type") ?? ""}:${labelOf(element)}`,
    ),
    buttons: all("button").map((element) => labelOf(element) || text(element)),
    links: all("a[href]").map(
      (element) =>
        `${labelOf(element) || text(element)} -> ${element.getAttribute("href")}`,
    ),
    copy: all("[id^='renewal-section-']").map(
      (element) => `${element.id}:${fingerprint(text(element))}`,
    ),
  };
}
