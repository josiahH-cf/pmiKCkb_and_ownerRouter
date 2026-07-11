import { describe, expect, it } from "vitest";

import { isActionExecutable } from "@/lib/integrations/action-gate";

// AC-S15-7: the S15 suite adds NO new executable Action Registry entry and flips NO gate. It reuses the
// one pre-approved compose-only entry (gmail.renewal_notice.draft_create) for BOTH the owner and tenant
// draft routes; the two Planned Inbox-0 Gmail actions stay non-executable. This pins the executable
// allow-list against silent drift — it runs against the REAL committed seed (no mocks).
describe("S15 Gmail action gate (AC-S15-7)", () => {
  it("keeps exactly the renewal-notice compose entry executable among the Gmail actions", () => {
    expect(isActionExecutable("gmail.renewal_notice.draft_create")).toBe(true);
    expect(isActionExecutable("gmail.label.apply")).toBe(false);
    expect(isActionExecutable("gmail.draft.create")).toBe(false);
  });

  it("returns false for an unknown key (typo in an action key is fail-closed)", () => {
    expect(isActionExecutable("gmail.renewal_notice.send")).toBe(false);
  });
});
