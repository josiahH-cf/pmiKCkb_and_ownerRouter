import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/roles";

describe("role permissions", () => {
  it("prevents editors from approving content", () => {
    expect(can("Editor", "approve")).toBe(false);
    expect(can("Approver", "approve")).toBe(true);
  });

  it("limits admin-only capabilities", () => {
    expect(can("Approver", "manageAdmin")).toBe(false);
    expect(can("Admin", "manageAdmin")).toBe(true);
    expect(can("Admin", "softDelete")).toBe(true);
  });
});
