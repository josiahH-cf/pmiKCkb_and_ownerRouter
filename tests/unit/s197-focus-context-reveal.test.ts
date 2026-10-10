// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { it, expect } from "vitest";
import { createFocusReveal } from "@/components/lease-renewal/renewal-focus-reveal";
it("restores only Focus-owned hiding when a whole context replaces a previously nested target", () => {
  const body = document.createElement("div");
  body.innerHTML =
    '<section id="context"><div id="earlier">Earlier target</div><div id="later"><textarea aria-label="Staff context"></textarea><span id="owned" hidden>Intentionally hidden by its owner</span></div></section><p id="outside">Other content</p>';
  document.body.append(body);
  const reveal = createFocusReveal(body),
    earlier = body.querySelector("#earlier")!,
    later = body.querySelector("#later")!,
    context = body.querySelector("#context")!;
  reveal.apply([earlier]);
  expect(later).not.toBeVisible();
  reveal.apply([context]);
  expect(later).toBeVisible();
  expect(body.querySelector("#owned")).not.toBeVisible();
  expect(body.querySelector("#outside")).not.toBeVisible();
  reveal.clear();
  expect(body.querySelector("#outside")).toBeVisible();
  expect(body.querySelector("#owned")).not.toBeVisible();
  body.remove();
});
