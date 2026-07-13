import { describe, expect, it } from "vitest";

import { isActionExecutable } from "@/lib/integrations/action-gate";

describe("S19 Gmail action gate (AC-S19-2, AC-S19-8)", () => {
  it("opens the owner-approved Gmail actions", () => {
    expect(isActionExecutable("gmail.renewal_notice.draft_create")).toBe(true);
    expect(isActionExecutable("gmail.label.apply")).toBe(true);
    expect(isActionExecutable("gmail.draft.create")).toBe(true);
    expect(isActionExecutable("gmail.mailbox.read")).toBe(true);
    expect(isActionExecutable("gmail.message.send")).toBe(true);
    expect(isActionExecutable("gmail.thread.reply")).toBe(true);
  });

  it("returns false for an unknown key (typo in an action key is fail-closed)", () => {
    expect(isActionExecutable("gmail.renewal_notice.send")).toBe(false);
  });
});
