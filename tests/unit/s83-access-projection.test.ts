import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  buildAccessEffectiveProjection,
  compareSessionAndDirectoryAccess,
} from "@/lib/access/projection";
import {
  AccessEligibilityError,
  readManagedDirectoryUser,
  type AccessDirectoryAuthLike,
} from "@/lib/access/directory";

const editor: AuthenticatedUser = {
  uid: "staff-1",
  email: "staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

describe("S83 current-session access projection", () => {
  // S167: a session used to project the named Spaces of its allowlist ("Lease Renewals").
  it("projects current-session role authority in catalog order, with every Space", () => {
    expect(buildAccessEffectiveProjection(editor, "matched")).toEqual({
      schema_version: "access-effective-projection-v1",
      role: "Editor",
      space_access: { kind: "all_spaces" },
      capability_labels: [
        "View app work",
        "Create and update app work",
        "Use governed workflow communications",
      ],
      authority_source: "current_session",
      directory_sync_state: "matched",
    });
  });

  it("maps every role's session to All spaces", () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      expect(
        buildAccessEffectiveProjection({ ...editor, role }, "matched").space_access,
      ).toEqual({ kind: "all_spaces" });
    }
  });

  // S167: a Space allowlist left in the directory no longer narrows a session, so only a role
  // difference asks for a refresh.
  it("treats a leftover directory Space allowlist as matched when the role agrees", () => {
    expect(
      compareSessionAndDirectoryAccess(editor, {
        role: "Editor",
        scope: { kind: "named_spaces", space_ids: ["maintenance"] },
      }),
    ).toBe("matched");
    expect(
      compareSessionAndDirectoryAccess(editor, {
        role: "Approver",
        scope: { kind: "named_spaces", space_ids: ["maintenance"] },
      }),
    ).toBe("refresh_required");
  });

  it("reports a newer directory grant as refresh-required without projecting it", () => {
    const result = compareSessionAndDirectoryAccess(editor, {
      role: "Admin",
      scope: { kind: "all_spaces", space_ids: [] },
    });
    expect(result).toBe("refresh_required");
    expect(buildAccessEffectiveProjection(editor, result).role).toBe("Editor");
  });
});

describe("S83 managed-directory eligibility", () => {
  it("accepts an enabled internal account and normalizes current claims", async () => {
    const auth: AccessDirectoryAuthLike = {
      getUser: async () => ({
        uid: "staff-1",
        email: "staff@pmikcmetro.com",
        displayName: "  Staff   Member ",
        disabled: false,
        customClaims: { role: "Approver", scopes: ["renewals", "maintenance"] },
      }),
      listUsers: async () => ({ users: [] }),
      setCustomUserClaims: async () => undefined,
    };

    await expect(readManagedDirectoryUser("staff-1", auth)).resolves.toMatchObject({
      uid: "staff-1",
      label: "Staff Member",
      access: {
        role: "Approver",
        scope: { kind: "named_spaces", space_ids: ["maintenance", "renewals"] },
      },
    });
  });

  it("fails closed for Vendor, disabled, personal, and malformed identities", async () => {
    const records = [
      {
        uid: "vendor",
        email: "vendor@pmikcmetro.com",
        customClaims: { vendor: true, vendor_id: "vendor-1" },
      },
      { uid: "disabled", email: "staff@pmikcmetro.com", disabled: true },
      { uid: "personal", email: "person@gmail.com" },
      {
        uid: "malformed",
        email: "staff@pmikcmetro.com",
        customClaims: { role: "Owner" },
      },
    ];

    for (const record of records) {
      const auth: AccessDirectoryAuthLike = {
        getUser: async () => record,
        listUsers: async () => ({ users: [] }),
        setCustomUserClaims: async () => undefined,
      };
      await expect(readManagedDirectoryUser(record.uid, auth)).rejects.toBeInstanceOf(
        AccessEligibilityError,
      );
    }
  });

  it("distinguishes a removed managed user from a directory transport outage", async () => {
    const removedAuth: AccessDirectoryAuthLike = {
      getUser: async () => {
        throw { code: "auth/user-not-found" };
      },
      listUsers: async () => ({ users: [] }),
      setCustomUserClaims: async () => undefined,
    };
    const unavailableAuth: AccessDirectoryAuthLike = {
      ...removedAuth,
      getUser: async () => {
        throw new Error("transport unavailable");
      },
    };

    await expect(readManagedDirectoryUser("removed", removedAuth)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      readManagedDirectoryUser("unknown", unavailableAuth),
    ).rejects.toMatchObject({
      status: 503,
    });
  });
});
