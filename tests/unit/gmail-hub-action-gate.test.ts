import { describe, expect, it } from "vitest";

import { isActionExecutable } from "@/lib/integrations/action-gate";

describe("S19 Gmail action gate (AC-S19-2, AC-S19-8)", () => {
  it("opens only the proven read and renewal-draft actions", () => {
    expect(isActionExecutable("gmail.renewal_notice.draft_create")).toBe(true);
    expect(isActionExecutable("gmail.label.apply")).toBe(false);
    expect(isActionExecutable("gmail.draft.create")).toBe(false);
    expect(isActionExecutable("gmail.mailbox.read")).toBe(true);
    expect(isActionExecutable("gmail.message.send")).toBe(false);
    expect(isActionExecutable("gmail.thread.reply")).toBe(false);
  });

  it("returns false for an unknown key (typo in an action key is fail-closed)", () => {
    expect(isActionExecutable("gmail.renewal_notice.send")).toBe(false);
  });
});
