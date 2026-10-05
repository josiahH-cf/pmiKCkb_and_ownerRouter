// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import RenewalLeaseLoading from "@/app/lease-renewal/live/desk/lease/[leaseId]/loading";
import RenewalDeskLoading from "@/app/lease-renewal/live/desk/loading";
import { RefineWithAi } from "@/components/email/RefineWithAi";

afterEach(cleanup);

function rule(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("follow-up presentation fixes from the batch 005 verification", () => {
  it("S169: opening a lease names that work, separately from the worklist's own loading wording", () => {
    render(<RenewalLeaseLoading />);
    expect(screen.getByRole("heading", { name: "Opening lease" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/Applying the selected scope/)).toBeNull();
    cleanup();
    render(<RenewalDeskLoading />);
    expect(
      screen.getByRole("heading", { name: "Updating renewals" }),
    ).toBeInTheDocument();
  });

  it("S87: refining wording is a secondary action beside the message it edits", () => {
    render(<RefineWithAi currentBody="Hello" onApply={() => undefined} request={{}} />);
    const refine = screen.getByRole("button", { name: "Refine wording" });
    expect(refine).toHaveClass("secondary-button");
    expect(refine).not.toHaveClass("primary-button");
  });

  it("S169 and S172: the navigation status stays in view and message editors keep a readable measure", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const feedback = rule(css, ".route-feedback");
    expect(feedback).toContain("position: sticky");
    expect(feedback).toContain("top: 0");
    const measure = css.slice(
      css.indexOf(".workflow-communication-panel textarea,"),
      css.indexOf("max-width: 76ch") + "max-width: 76ch".length,
    );
    expect(measure).toContain(".renewal-message-body,");
    expect(measure).toContain(".renewal-message-preview {");
    const preparation = readFileSync(
      join(process.cwd(), "components/lease-renewal/RenewalMessagePreparation.tsx"),
      "utf8",
    );
    expect(preparation.match(/className="renewal-message-body"/g)).toHaveLength(2);
  });
});
