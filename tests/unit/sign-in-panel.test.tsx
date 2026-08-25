// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(() => Promise.resolve(null)),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  // Defined inline: a vi.mock factory is hoisted above module scope, so it cannot reference a top-level
  // class declaration.
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn();
  },
  getRedirectResult: mocks.getRedirectResult,
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithPopup: mocks.signInWithPopup,
  signInWithRedirect: mocks.signInWithRedirect,
  signOut: mocks.signOut,
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseClientAuth: vi.fn(() => ({ name: "test-auth" })),
  hasFirebaseBrowserConfig: vi.fn(() => true),
}));

import { SignInPanel } from "@/components/auth/SignInPanel";

// The polished, product-facing copy for "this account can't establish an internal session".
const FRIENDLY = "This Google account is not authorized for PMI KC KB.";
// The raw AuthError string the server returns for a wrong hosted domain — it must NOT leak to the UI.
const RAW_SERVER = "Google Workspace hosted domain is not allowed.";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // No signed-in user on mount, so the panel lands on the idle "Sign in with Google" button rather than
  // auto-completing a session.
  mocks.onAuthStateChanged.mockImplementation(
    (_auth: unknown, cb: (user: unknown) => void) => {
      cb(null);
      return () => {};
    },
  );
  mocks.signOut.mockResolvedValue(undefined);
});

describe("SignInPanel unauthorized-account copy", () => {
  it("shows the friendly not-authorized message (not the raw server string) when the session POST returns 403", async () => {
    const user = userEvent.setup();
    mocks.signInWithPopup.mockResolvedValue({
      user: { getIdToken: vi.fn().mockResolvedValue("id-token") },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: RAW_SERVER }),
      })),
    );

    render(<SignInPanel allowedHostedDomain="pmikcmetro.com" />);
    await user.click(await screen.findByRole("button", { name: "Sign in with Google" }));

    expect(await screen.findByText(FRIENDLY)).toBeInTheDocument();
    expect(screen.queryByText(RAW_SERVER)).not.toBeInTheDocument();
  });

  it("shows the same friendly message on the page-guard forbidden redirect", () => {
    render(<SignInPanel allowedHostedDomain="pmikcmetro.com" initialError="forbidden" />);
    expect(screen.getByText(FRIENDLY)).toBeInTheDocument();
  });
});

// FB-HVSESSION-013: a popup-blocking browser could not sign in at all before this fallback existed.
// Hit live during the 2026-08-24 audit: the controlled browser returned auth/popup-blocked on the
// only control the page has, with no way forward.
describe("SignInPanel popup-blocked fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRedirectResult.mockResolvedValue(null);
    mocks.onAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(null);
      return () => {};
    });
  });

  it("falls back to a full-page redirect when the popup is blocked", async () => {
    mocks.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    mocks.signInWithRedirect.mockResolvedValue(undefined);

    render(<SignInPanel allowedHostedDomain="pmikcmetro.com" />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => expect(mocks.signInWithRedirect).toHaveBeenCalledTimes(1));
  });

  it("falls back when the environment does not support the popup at all", async () => {
    mocks.signInWithPopup.mockRejectedValue({
      code: "auth/operation-not-supported-in-this-environment",
    });
    mocks.signInWithRedirect.mockResolvedValue(undefined);

    render(<SignInPanel allowedHostedDomain="pmikcmetro.com" />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => expect(mocks.signInWithRedirect).toHaveBeenCalledTimes(1));
  });

  it("does not redirect when the person simply closed the popup", async () => {
    mocks.signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });

    render(<SignInPanel allowedHostedDomain="pmikcmetro.com" />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));

    await waitFor(() => expect(mocks.signInWithPopup).toHaveBeenCalled());
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled();
  });

  it("surfaces a failed redirect return instead of a silent sign-in page", async () => {
    mocks.getRedirectResult.mockRejectedValue(new Error("Domain not allowed."));

    render(<SignInPanel allowedHostedDomain="pmikcmetro.com" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Domain not allowed.");
  });
});
