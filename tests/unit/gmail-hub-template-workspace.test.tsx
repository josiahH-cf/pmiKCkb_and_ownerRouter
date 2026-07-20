// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { TemplateWorkspace } from "@/components/gmail-hub/TemplateWorkspace";
import { DRAFT_BANNER } from "@/lib/constants";
import type { ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";

afterEach(cleanup);

describe("TemplateWorkspace (AC-S15-3)", () => {
  it("renders the suggested label + rule reason and a banner-bearing draft preview for a matched Approved rule", async () => {
    const user = userEvent.setup();
    const { container } = render(<TemplateWorkspace />);

    // Defaults: canonical category "vendor" matches the Approved rule-vendor-invoice; template is the Approved
    // vendor acknowledgement. Evaluate runs evaluateInboxTriage + buildReplyDraft client-side.
    await user.click(screen.getByRole("button", { name: "Evaluate" }));

    // The suggestion carries the label text AND the rule reason from evaluateInboxTriage.
    const suggestion = (await screen.findByText(/auto-apply eligible/)).closest("li");
    expect(suggestion?.textContent).toContain("Draft Ready");
    expect(suggestion?.textContent).toContain(
      "Vendor invoice questions are ready for a drafted acknowledgement.",
    );

    // The buildReplyDraft preview carries the review-before-sending banner.
    const draftBox = container.querySelector(".draft-box");
    expect(draftBox?.textContent).toContain(DRAFT_BANNER);
  });

  it("has no Send control and does not render the retired read-only v1 copy", () => {
    const { container } = render(<TemplateWorkspace />);
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    expect(container.textContent).not.toContain("Read-only v1");
  });

  it("refuses a draft for a hard-excluded category (label only, never draft)", async () => {
    const user = userEvent.setup();
    render(<TemplateWorkspace />);

    await user.selectOptions(screen.getByLabelText("Category"), "owner_money");
    await user.click(screen.getByRole("button", { name: "Evaluate" }));

    expect(await screen.findByText(/Draft refused/)).toBeInTheDocument();
    expect(screen.getByText(/hard exclusion/)).toBeInTheDocument();
  });

  it("renders the injected store templates (F-TMPL-2) and not the built-in samples", () => {
    const storeTemplates: ReplyTemplate[] = [
      {
        id: "store-reply-1",
        name: "Store-approved reply",
        body: "Approved store body.",
        status: "Approved",
      },
    ];
    render(<TemplateWorkspace templates={storeTemplates} />);

    expect(screen.getAllByText("Store-approved reply").length).toBeGreaterThan(0);
    // The sample vendor pattern must NOT appear when the store supplies the set.
    expect(screen.queryByText("Vendor invoice acknowledgement")).toBeNull();
  });

  it("falls back to the sample reply patterns when no templates prop is given", () => {
    render(<TemplateWorkspace />);
    expect(screen.getAllByText("Vendor invoice acknowledgement").length).toBeGreaterThan(
      0,
    );
  });
});
