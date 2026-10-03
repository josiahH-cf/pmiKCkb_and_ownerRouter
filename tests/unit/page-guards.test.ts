import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  requireCapability,
  requireRole,
  requireUser,
  type AuthenticatedUser,
} from "@/lib/auth/session";
import {
  primarySpaceHref,
  requirePageCapability,
  requirePageRole,
  requirePageSpaceAccess,
} from "@/lib/auth/page-guards";
import { SPACE_SCOPES, type SpaceScope } from "@/lib/constants";
import { redirect } from "next/navigation";

// redirect() never returns in Next; emulate that by throwing a tagged sentinel so the
// guard's control flow matches production and assertions can read the target.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// Keep the real AuthError (so `instanceof` holds in the guard) and only stub the three
// session entry points the page guards delegate to.
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireCapability: vi.fn(),
    requireRole: vi.fn(),
    requireUser: vi.fn(),
  };
});

const adminUser: AuthenticatedUser = {
  uid: "admin-uid",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

const maintenanceEditor: AuthenticatedUser = {
  uid: "maintenance-editor-uid",
  email: "maintenance-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

afterEach(() => {
  vi.mocked(requireCapability).mockReset();
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireUser).mockReset();
  vi.mocked(redirect).mockClear();
});

describe("page auth guards", () => {
  it("returns the authenticated user when the capability is granted", async () => {
    vi.mocked(requireCapability).mockResolvedValue(adminUser);

    await expect(requirePageCapability("manageAdmin")).resolves.toEqual(adminUser);
    expect(requireCapability).toHaveBeenCalledWith("manageAdmin");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated (401) capability requests to sign-in", async () => {
    vi.mocked(requireCapability).mockRejectedValue(
      new AuthError("Authentication is required.", 401),
    );

    await expect(requirePageCapability("read")).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("redirects forbidden (403) capability requests to the forbidden screen", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError("Not authorized.", 403));

    await expect(requirePageCapability("manageAdmin")).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?error=forbidden",
    );
    expect(redirect).toHaveBeenCalledWith("/sign-in?error=forbidden");
  });

  it("rethrows non-auth errors without redirecting", async () => {
    const failure = new Error("firestore unavailable");
    vi.mocked(requireCapability).mockRejectedValue(failure);

    await expect(requirePageCapability("read")).rejects.toBe(failure);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns the authenticated user when the role matches", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminUser);

    await expect(requirePageRole("Admin")).resolves.toEqual(adminUser);
    expect(requireRole).toHaveBeenCalledWith("Admin");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects forbidden (403) role requests to the forbidden screen", async () => {
    vi.mocked(requireRole).mockRejectedValue(new AuthError("Not authorized.", 403));

    await expect(requirePageRole("Admin")).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?error=forbidden",
    );
    expect(redirect).toHaveBeenCalledWith("/sign-in?error=forbidden");
  });

  // S167: a Renewals page used to redirect this Editor to its primary Space.
  it("returns the signed-in Editor for every Space page without a redirect", async () => {
    vi.mocked(requireUser).mockResolvedValue(maintenanceEditor);

    for (const scope of SPACE_SCOPES) {
      await expect(requirePageSpaceAccess(scope)).resolves.toEqual(maintenanceEditor);
    }
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a page for a Space that does not exist to the Dashboard", async () => {
    vi.mocked(requireUser).mockResolvedValue(maintenanceEditor);

    await expect(requirePageSpaceAccess("not-a-space" as SpaceScope)).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("redirects an unauthenticated space request to sign-in", async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new AuthError("Authentication is required.", 401),
    );

    await expect(requirePageSpaceAccess("maintenance")).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  // S167: no account has a primary Space any more, so the fallback is always the Dashboard.
  it("uses the Dashboard as the fallback destination for every account", () => {
    expect(primarySpaceHref()).toBe("/");
  });
});
