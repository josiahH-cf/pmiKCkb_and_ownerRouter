// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { openVisibleHelpSummary } from "../../scripts/lib/help-scene-actions.mjs";

// Keep the selector boundary honest without starting a server or exposing a provider.
function scenePage(clicked) {
  return {
    locator(selector) {
      const visibleOnly = selector.endsWith(":visible");
      const summaries = [
        ...document.querySelectorAll(selector.replace(":visible", "")),
      ].filter((node) => !visibleOnly || !node.closest("[hidden]"));
      return {
        filter({ hasText }) {
          const matches = summaries.filter((node) => hasText.test(node.textContent));
          return {
            first() {
              return {
                async click() {
                  const node = matches[0];
                  if (!node || node.closest("[hidden]")) throw new Error("not visible");
                  clicked.push(node.id);
                  node.parentElement.open = !node.parentElement.open;
                },
              };
            },
          };
        },
      };
    },
  };
}
afterEach(() => {
  document.body.innerHTML = "";
});
describe("Help scene disclosure actions", () => {
  it("opens the visible exact Message disclosure instead of an earlier hidden view", async () => {
    document.body.innerHTML = `<section hidden><details><summary id="hidden">Message</summary></details></section>
      <details><summary id="partial">Message sources</summary></details>
      <details><summary id="visible"> Message </summary></details>`;
    const clicked = [];
    await openVisibleHelpSummary(scenePage(clicked), "Message");
    expect(clicked).toEqual(["visible"]);
    expect(document.querySelector("#hidden").parentElement.open).toBe(false);
    expect(document.querySelector("#visible").parentElement.open).toBe(true);
  });
  it("matches literal punctuation rather than widening the named disclosure", async () => {
    document.body.innerHTML = `<details><summary id="wrong">Message review</summary></details>
      <details><summary id="exact">Message (review)</summary></details>`;
    const clicked = [];
    await openVisibleHelpSummary(scenePage(clicked), "Message (review)");
    expect(clicked).toEqual(["exact"]);
  });
  it("refuses an unavailable disclosure instead of clicking a hidden control", async () => {
    document.body.innerHTML =
      "<section hidden><details><summary>Message</summary></details></section>";
    await expect(openVisibleHelpSummary(scenePage([]), "Message")).rejects.toThrow(
      "not visible",
    );
  });
});
