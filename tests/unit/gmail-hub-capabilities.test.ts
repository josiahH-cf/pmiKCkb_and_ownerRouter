import { describe, expect, it } from "vitest";

import { can } from "@/lib/auth/roles";

describe("Gmail Hub capability separation (AC-S19-8)", () => {
  it("keeps read, draft/edit, explicit-send, and admin authority distinct", () => {
    expect(can("Editor", "read")).toBe(true);
    expect(can("Editor", "edit")).toBe(true);
    expect(can("Editor", "sendEmail")).toBe(false);
    expect(can("Approver", "sendEmail")).toBe(true);
    expect(can("Approver", "manageAdmin")).toBe(false);
    expect(can("Admin", "sendEmail")).toBe(true);
    expect(can("Admin", "manageAdmin")).toBe(true);
  });
});
