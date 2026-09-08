// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  assertGuideControl,
  type GuideStep,
} from "@/scripts/lib/renewal-guide-controls.mjs";

afterEach(cleanup);
function page(root: HTMLElement = document.body) {
  return {
    getByRole(role: string, options: { name: string; exact: boolean }) {
      return {
        first() {
          return this;
        },
        async isVisible() {
          return within(root).queryByRole(role, options) !== null;
        },
        async waitFor() {
          within(root).getByRole(role, options);
        },
        ...pageScope(() => within(root).getByRole(role, options)),
      };
    },
  };
}
// This isolated fixture supplies only the scoped role branch exercised below. The browser smoke
// supplies a real Playwright Page for the full guide, including labels and phase navigation.
function roleFixturePage() {
  return page() as unknown as Parameters<typeof assertGuideControl>[0];
}
function pageScope(root: () => HTMLElement) {
  return {
    getByRole(role: string, options: { name: string; exact: boolean }) {
      return page(root()).getByRole(role, options);
    },
  };
}
const step: GuideStep = {
  step: "Confirm",
  role: "button",
  control: "Confirm this exact effect once",
  scope: "Review Sheet updates",
  availability: "required",
};

it("refuses heading-only, partial-label, and other-panel matches", async () => {
  render(
    <>
      <section aria-label="Review Sheet updates">
        <h2>Confirm this exact effect once</h2>
        <button>Confirm this exact effect once later</button>
      </section>
      <section aria-label="Review RentVine updates">
        <button>Confirm this exact effect once</button>
      </section>
    </>,
  );
  await expect(assertGuideControl(roleFixturePage(), step)).rejects.toThrow();
});
it("finds the exact semantic control only in its named panel", async () => {
  render(
    <section aria-label="Review Sheet updates">
      <button>Confirm this exact effect once</button>
    </section>,
  );
  expect(await assertGuideControl(roleFixturePage(), step)).toBe("visible");
});
