// @vitest-environment jsdom

// S165: the separate Vendor sign-in on a phone. It keeps its own boundary (email, password and an
// authenticator code posted to the Vendor session route), its fields bring up the right phone
// keyboards, and a failure shows plain copy instead of the sign-in provider's error text.

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  multiFactor: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signIn,
  signOut: vi.fn(),
  multiFactor: mocks.multiFactor,
  getMultiFactorResolver: vi.fn(),
  TotpMultiFactorGenerator: {
    FACTOR_ID: "totp",
    generateSecret: vi.fn(),
    assertionForEnrollment: vi.fn(),
    assertionForSignIn: vi.fn(),
  },
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseClientAuth: vi.fn(() => ({ name: "test-auth" })),
  hasFirebaseBrowserConfig: vi.fn(() => true),
}));

import { VendorSignIn } from "@/components/vendor/VendorSignIn";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function submitCredentials() {
  const user = userEvent.setup();
  render(<VendorSignIn />);
  await user.type(
    screen.getByRole("textbox", { name: "Verified Vendor email" }),
    "service@summit-plumbing.example.invalid",
  );
  await user.type(screen.getByLabelText("Password"), "temporary-password");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

describe("S165 Vendor sign-in on a phone (BEH-S165-2, BEH-S165-4, BEH-S165-9)", () => {
  it("the email field asks for the email keyboard without capitalising or correcting", () => {
    render(<VendorSignIn />);
    const email = screen.getByRole("textbox", { name: "Verified Vendor email" });

    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("inputmode", "email");
    expect(email).toHaveAttribute("autocapitalize", "none");
    expect(email).toHaveAttribute("autocomplete", "username");
  });

  it("a wrong email or password shows plain copy, not the provider's error text", async () => {
    mocks.signIn.mockRejectedValue(
      Object.assign(new Error("Firebase: Error (auth/invalid-credential)."), {
        code: "auth/invalid-credential",
      }),
    );

    await submitCredentials();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "That email and password did not match a Vendor account. Check both, then try again.",
    );
    expect(alert).not.toHaveTextContent(/Firebase|auth\//);
  });

  it("an unrecognised provider failure shows the plain fallback", async () => {
    mocks.signIn.mockRejectedValue(
      Object.assign(new Error("Firebase: Error (auth/internal-error)."), {
        code: "auth/internal-error",
      }),
    );

    await submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vendor sign-in did not finish. Check your details, then try again.",
    );
  });

  it("a refusal from the Vendor session route is shown as the server wrote it, and no staff route is used", async () => {
    const vendorUser = { getIdToken: vi.fn().mockResolvedValue("vendor-token") };
    mocks.signIn.mockResolvedValue({ user: vendorUser });
    mocks.multiFactor.mockReturnValue({ enrolledFactors: [{ uid: "factor-1" }] });
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "Vendor access is not active." }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vendor access is not active.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vendor/auth/session",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
