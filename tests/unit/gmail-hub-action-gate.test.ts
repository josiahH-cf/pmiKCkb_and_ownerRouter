import { describe, expect, it } from "vitest";

import { isActionExecutable } from "@/lib/integrations/action-gate";

describe("Workflow Communications action gate (AC-GW-4, AC-GW-5)", () => {
  it("opens the workflow-bounded Gmail transport actions plus the authorized renewal-notice draft", () => {
    // renewal_notice.draft_create authorized for production by the 2026-07-19 owner grant
    // (F-SEND-AUTHORIZED): draft-into-Gmail, human sends; sample data stays preview-only at the route.
    expect(isActionExecutable("gmail.renewal_notice.draft_create")).toBe(true);
    expect(isActionExecutable("gmail.label.apply")).toBe(true);
    expect(isActionExecutable("gmail.draft.create")).toBe(false);
    expect(isActionExecutable("gmail.mailbox.read")).toBe(true);
    expect(isActionExecutable("gmail.message.send")).toBe(false);
    expect(isActionExecutable("gmail.thread.reply")).toBe(true);
  });

  it("returns false for an unknown key (typo in an action key is fail-closed)", () => {
    expect(isActionExecutable("gmail.renewal_notice.send")).toBe(false);
  });
});
