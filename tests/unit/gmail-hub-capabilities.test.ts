import { describe, expect, it } from "vitest";

import { can } from "@/lib/auth/roles";

describe("Workflow Communications capability separation (AC-GW-5)", () => {
  it("lets Editors directly exact-confirm enabled workflow sends while Admin stays distinct", () => {
    expect(can("Editor", "read")).toBe(true);
    expect(can("Editor", "edit")).toBe(true);
    expect(can("Editor", "sendEmail")).toBe(true);
    expect(can("Approver", "sendEmail")).toBe(true);
    expect(can("Approver", "manageAdmin")).toBe(false);
    expect(can("Admin", "sendEmail")).toBe(true);
    expect(can("Admin", "manageAdmin")).toBe(true);
  });
});
