import { describe, expect, it } from "vitest";

import { can, type Capability, type Role } from "@/lib/auth/roles";
import {
  ACCESS_CAPABILITIES,
  ACCESS_CAPABILITY_CATALOG,
  ACCESS_ROLE_CATALOG,
  ACCESS_SPACE_CATALOG,
  minimumRoleForCapability,
} from "@/lib/access/catalog";
import { ROLES, SPACE_SCOPES } from "@/lib/constants";

describe("S83 requestable-access catalog", () => {
  it("covers every current capability exactly once and derives its minimum role", () => {
    expect(ACCESS_CAPABILITIES).toEqual([
      "read",
      "edit",
      "sendEmail",
      "approve",
      "resolvePlaceholder",
      "manageAdmin",
      "softDelete",
    ]);
    expect(ACCESS_CAPABILITY_CATALOG.map((entry) => entry.key)).toEqual(
      ACCESS_CAPABILITIES,
    );
    expect(new Set(ACCESS_CAPABILITY_CATALOG.map((entry) => entry.key)).size).toBe(7);

    for (const capability of ACCESS_CAPABILITIES) {
      const expected = ROLES.find((role) => can(role, capability));
      expect(minimumRoleForCapability(capability)).toBe(expected);
      expect(
        ACCESS_CAPABILITY_CATALOG.find((entry) => entry.key === capability)?.minimumRole,
      ).toBe(expected);
    }
  });

  it("keeps the request catalog aligned to the existing roles and Space claims", () => {
    expect(ACCESS_ROLE_CATALOG.map((entry) => entry.key)).toEqual(ROLES);
    expect(ACCESS_SPACE_CATALOG.map((entry) => entry.id)).toEqual(SPACE_SCOPES);
  });

  it("does not treat action keys or arbitrary permission strings as capabilities", () => {
    expect(() => minimumRoleForCapability("gmail.message.send" as Capability)).toThrow(
      "Unknown access capability",
    );
    expect(() => minimumRoleForCapability("owner" as Capability)).toThrow(
      "Unknown access capability",
    );
  });

  it("preserves the exact current role hierarchy", () => {
    const expected: Record<Role, Capability[]> = {
      Editor: ["read", "edit", "sendEmail"],
      Approver: ["read", "edit", "sendEmail", "approve", "resolvePlaceholder"],
      Admin: [
        "read",
        "edit",
        "sendEmail",
        "approve",
        "resolvePlaceholder",
        "manageAdmin",
        "softDelete",
      ],
    };

    for (const role of ROLES) {
      expect(ACCESS_CAPABILITIES.filter((capability) => can(role, capability))).toEqual(
        expected[role],
      );
    }
  });
});
