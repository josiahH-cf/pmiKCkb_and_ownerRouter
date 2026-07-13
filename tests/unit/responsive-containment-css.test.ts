import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

describe("phone overflow containment", () => {
  it("constrains Gmail form/grid/preview children without hiding document overflow", () => {
    expect(css).toContain(".gmail-hub .grid > *");
    expect(css).toContain(".gmail-hub input");
    expect(css).toContain(".gmail-hub .draft-box");
    expect(css).toMatch(/\.gmail-hub input,[\s\S]*?min-width: 0;[\s\S]*?width: 100%;/);
    expect(css).not.toMatch(/(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/);
  });

  it("constrains expanded Approval Queue children while keeping only its tablist scrollable", () => {
    expect(css).toContain(".approval-queue-shell .ui-collapse > *");
    expect(css).toContain(".approval-queue-shell .ui-spread > *");
    expect(css).toContain(".approval-queue-shell .text-link");
    expect(css).toMatch(/\.ui-tablist \{[\s\S]*?overflow-x: auto;/);
    expect(css).not.toMatch(/\.approval-queue-shell[^{]*\{[^}]*overflow:\s*hidden/);
  });
});
