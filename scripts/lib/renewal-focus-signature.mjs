// S145: the Full view signature both Focus browser checks compare: the local rehearsal smoke and
// the production read-only check. `pageFullViewSignature` runs inside the page (it must stay
// self-contained) and returns the same structure the jsdom baseline records (regions, section ids,
// headings, form controls with their current values, buttons, links and per-section copy), plus
// section visibility, every disclosure's open state and the Focus-hidden count. Callers compare it
// in memory and print only `describeSignatureDifference`, which names keys, counts, indexes and
// section ids, never a page value.

export function pageFullViewSignature() {
  const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const outside = (element) => !element.closest("[data-renewal-view-switch]");
  const labelOf = (element) => {
    const aria = element.getAttribute("aria-label");
    if (aria) return aria.trim();
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy)
      return labelledBy
        .split(/\s+/)
        .map((id) => text(document.getElementById(id)))
        .join(" ")
        .trim();
    const labels = element.labels;
    if (labels && labels.length > 0) return text(labels[0]);
    return "";
  };
  const root = document.querySelector("main") ?? document.body;
  const all = (selector) => [...root.querySelectorAll(selector)].filter(outside);
  const visible = (element) => element.getClientRects().length > 0;
  return JSON.stringify({
    regions: all("section[aria-label], [role='region'][aria-label]").map((element) =>
      element.getAttribute("aria-label"),
    ),
    sectionIds: all("[id^='renewal-section-']").map((element) => element.id),
    headings: all("h1, h2, h3, h4").map(
      (element) => `${element.tagName.toLowerCase()}:${text(element)}`,
    ),
    controls: all("input, select, textarea").map(
      (element) =>
        `${element.tagName.toLowerCase()}:${element.getAttribute("type") ?? ""}:${labelOf(element)}:${element.value}`,
    ),
    buttons: all("button").map((element) => labelOf(element) || text(element)),
    links: all("a[href]").map(
      (element) =>
        `${labelOf(element) || text(element)} -> ${element.getAttribute("href")}`,
    ),
    copy: all("[id^='renewal-section-']").map(
      (element) => `${element.id}:${text(element)}`,
    ),
    visible: all("[id^='renewal-section-']").map((element) => visible(element)),
    disclosures: all("details").map((element) => element.open),
    hidden: root.querySelectorAll("[data-renewal-focus-hidden]").length,
  });
}

/** Which parts differ, by key, count and section id only; never the page's values. */
export function describeSignatureDifference(before, after) {
  const a = JSON.parse(before);
  const b = JSON.parse(after);
  const parts = [];
  for (const key of Object.keys(a)) {
    if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
    if (!Array.isArray(a[key])) {
      parts.push(`${key} ${a[key]}->${b[key]}`);
      continue;
    }
    const indexes = [];
    for (let index = 0; index < Math.max(a[key].length, b[key].length); index += 1)
      if (JSON.stringify(a[key][index]) !== JSON.stringify(b[key][index]))
        indexes.push(index);
    const sections =
      key === "copy" || key === "visible" || key === "sectionIds"
        ? ` sections ${indexes.map((index) => a.sectionIds[index] ?? b.sectionIds[index]).join("|")}`
        : "";
    parts.push(
      `${key} ${a[key].length}->${b[key].length} at [${indexes.slice(0, 8).join(",")}]${sections}`,
    );
  }
  return parts.join("; ") || "no difference";
}
