import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("retired trusted-publication fixture panel", () => {
  it("is absent while the ordinary trusted-publication panel remains mounted", () => {
    const page = readFileSync(resolve(root, "app/spaces/[spaceId]/page.tsx"), "utf8");

    expect(
      existsSync(
        resolve(root, "components/spaces/TrustedPublicationTestFixturePanel.tsx"),
      ),
    ).toBe(false);
    expect(page).not.toContain("TrustedPublicationTestFixturePanel");
    expect(page).toContain("TrustedPublicationPanel");
  });
});
