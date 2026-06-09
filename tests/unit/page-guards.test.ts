import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  requireCapability,
  requireRole,
  type AuthenticatedUser,
} from "@/lib/auth/session";
import { requirePageCapability, requirePageRole } from "@/lib/auth/page-guards";
import { redirect } from "next/navigation";

// redirect() never returns in Next; emulate that by throwing a tagged sentinel so the
// guard's control flow matches production and assertions can read the target.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// Keep the real AuthError (so `instanceof` holds in the guard) and only stub the two
// session entry points the page guards delegate to.
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireCapability: vi.fn(),
    requireRole: vi.fn(),
  };
});

const adminUser: AuthenticatedUser = {
  uid: "admin-uid",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

afterEach(() => {
  vi.mocked(requireCapability).mockReset();
  vi.mocked(requireRole).mockReset();
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
});
