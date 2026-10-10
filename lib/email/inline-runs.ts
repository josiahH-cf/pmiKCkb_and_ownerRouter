/** Client-safe exact rich rendering. Styling one link never repeats its URL or focus target. */
export interface InlineMessageRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
  color?: string;
}
export function escapeInlineHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
export function renderInlineMessageParagraph(runs: readonly InlineMessageRun[]) {
  const groups: InlineMessageRun[][] = [];
  for (const r of runs) {
    const last = groups.at(-1);
    if (r.href && last?.[0].href === r.href && !r.text.startsWith("\n")) last.push(r);
    else groups.push([r]);
  }
  let plainText = "",
    html = "";
  for (const group of groups) {
    const href = group[0].href;
    const label = group.map((r) => r.text).join("");
    plainText +=
      label +
      (href && href !== label.trim() && href !== `mailto:${label.trim()}`
        ? `: ${href}`
        : "");
    let content = group
      .map((r) => {
        let s = escapeInlineHtml(r.text).replaceAll("\n", "<br>");
        if (r.bold) s = `<strong>${s}</strong>`;
        if (r.italic) s = `<em>${s}</em>`;
        if (r.color === "#c2410c") s = `<span style="color:#c2410c">${s}</span>`;
        return s;
      })
      .join("");
    if (href) {
      const u = new URL(href);
      if (
        !(
          (u.protocol === "https:" && !u.username && !u.password) ||
          /^mailto:[^\s<>"@]+@[^\s<>"@]+$/.test(href)
        )
      )
        throw new Error("Unsupported message link.");
      content = `<a href="${escapeInlineHtml(href)}">${content}</a>`;
    }
    html += content;
  }
  return { plainText, html };
}
